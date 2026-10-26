// ==========================================
// Importer «Hàng tại KTT» (KTT-2): đọc hai file CSV do script SQL chạy tay trên CSDL KTT xuất ra
//   KTT_Tui_<yyyymmdd>_<hhmmss>.csv      -> ktt_tui      (mức túi)
//   KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv   -> ktt_buu_gui  (mức bưu gửi-trong-túi)
// Đường dẫn file truyền vào (không SFTP). Cột đọc theo TÊN (bảng ánh xạ ở server/lib/kttSchema.js); cột lạ bị bỏ.
// KHÔNG sửa dữ liệu: chỉ trim chuỗi, rỗng / chữ NULL -> NULL, giờ -> `YYYY-MM-DD HH:MM:SS` (bỏ phần ms, không đổi múi giờ), số kiểu SSMS (dấu chấm).
// Không gắn nhãn «treo», «nằm lâu», «trễ chuyến» (KTT-4). Không bao giờ ghi giá trị dòng dữ liệu vào lỗi / log: chỉ tên cột + số dòng.
// Chạy ĐỒNG BỘ (đọc theo lô 1 MiB, không nạp cả file vào bộ nhớ) để cả file nằm trong MỘT giao dịch mà không bị xen lệnh khác.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse');
const { LOAI_FILE } = require('./kttSchema');

const KICH_THUOC_LO = 1 << 20;
const TOI_DA_LOI_MAU = 20;
const CUA_SO_NGAY = 7; // mỗi lần xuất lùi 7 ngày đến lúc chạy (PO chốt 25/10/2026); dùng để đếm dòng «không còn trong ảnh chụp mới»

class KttFileError extends Error {}
class HoanTac extends Error {}

// Tên cột so khớp theo TÊN: bỏ dấu, không phân biệt hoa/thường, bỏ khoảng trắng / gạch dưới (cùng cách với importer «Hàng đến»).
const colKey = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ------------------------------------------
// Chuẩn hóa từng ô. Mỗi hàm nhận chuỗi KHÔNG rỗng, trả giá trị hoặc undefined (= sai định dạng).
// ------------------------------------------
function chuanHoaO(raw) {
  const s = raw == null ? '' : String(raw).trim();
  return /^null$/i.test(s) ? '' : s; // SSMS ghi NULL cho ô không có giá trị
}

function giaTriGio(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || se > 59) return undefined;
  if (d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return undefined;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`; // bỏ phần mili giây (cắt, không làm tròn)
}

function giaTriSo(s) {
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const CHUYEN_KIEU = {
  text: (s) => s,
  time: giaTriGio,
  real: giaTriSo,
  int: (s) => { const n = giaTriSo(s); return n !== undefined && Number.isSafeInteger(n) ? n : undefined; },
  bool: (s) => (/^(1|true)$/i.test(s) ? 1 : /^(0|false)$/i.test(s) ? 0 : undefined)
};
const MA_LOI_KIEU = { time: 'GIO_SAI_DINH_DANG', real: 'SO_SAI_DINH_DANG', int: 'SO_SAI_DINH_DANG', bool: 'CO_SAI_DINH_DANG', text: 'GIA_TRI_SAI' };

/** Một bản ghi CSV -> { row } (cột DB -> giá trị) hoặc { loi: { cot, ma } } (lỗi đầu tiên của dòng; chỉ tên cột + mã, không kèm giá trị). */
function chuyenDong(rec, index, cot) {
  const row = {};
  for (let i = 0; i < cot.length; i++) {
    const c = cot[i];
    const raw = index[i] >= 0 ? chuanHoaO(rec[index[i]]) : '';
    if (raw === '') {
      if (c.key) return { loi: { cot: c.csv, ma: 'KHOA_RONG' } };
      if (c.required) return { loi: { cot: c.csv, ma: 'NGUON_XUAT_RONG' } };
      row[c.db] = null;
      continue;
    }
    const v = CHUYEN_KIEU[c.kind](raw);
    if (v === undefined) return { loi: { cot: c.csv, ma: MA_LOI_KIEU[c.kind] } };
    row[c.db] = c.hoa ? v.toUpperCase().replace(/Ð/g, 'Đ') : v; // khóa SHBG: CHỮ HOA, Ð (U+00D0) -> Đ (U+0110)
  }
  return { row };
}

/** Tiêu đề CSV -> chỉ số cột của từng cột ánh xạ (-1 = vắng, chỉ với cột tuỳ chọn). Thiếu cột khóa / Nguon_xuat_luc, hoặc trùng tên -> KttFileError. */
function giaiTieuDe(header, cot) {
  const theoKhoa = new Map();
  header.forEach((h, i) => {
    const k = colKey(h);
    if (!k) return;
    if (!theoKhoa.has(k)) theoKhoa.set(k, []);
    theoKhoa.get(k).push(i);
  });
  const thieu = [];
  const trung = [];
  const tuyChonVang = [];
  const index = cot.map((c) => {
    for (const ten of [c.csv, ...(c.alias || [])]) {
      const found = theoKhoa.get(colKey(ten));
      if (!found) continue;
      if (found.length > 1) trung.push(ten);
      return found[0];
    }
    if (c.key || c.required) thieu.push(c.csv); else if (!c.luonNull) tuyChonVang.push(c.csv);
    return -1;
  });
  const problems = [];
  if (thieu.length) problems.push(`thiếu cột bắt buộc: ${thieu.join(', ')}`);
  if (trung.length) problems.push(`cột trùng tên: ${trung.join(', ')}`);
  if (problems.length) throw new KttFileError(`Sai tiêu đề (${header.length} cột): ${problems.join('; ')}`);
  const dung = new Set(index);
  return { index, cotLa: header.map((h) => String(h).trim()).filter((h, i) => h && !dung.has(i)), tuyChonVang };
}

function bamFile(filePath) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(KICH_THUOC_LO);
    for (let n; (n = fs.readSync(fd, buf, 0, KICH_THUOC_LO, null)) > 0;) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function chuanBiCau(db, cfg) {
  const dbCols = cfg.cot.map((c) => c.db);
  const tatCa = [...dbCols, 'nap_lan_id', 'cap_nhat_luc'];
  return {
    tim: db.prepare(`SELECT id, nguon_xuat_luc, nap_lan_id FROM ${cfg.bang} WHERE ${cfg.khoa.map((k) => `${k} = ?`).join(' AND ')}`),
    them: db.prepare(`INSERT INTO ${cfg.bang} (${tatCa.join(', ')}) VALUES (${tatCa.map((c) => `@${c}`).join(', ')})`),
    capNhat: db.prepare(`UPDATE ${cfg.bang} SET ${tatCa.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
  };
}

/** Đọc file theo lô, xử lý từng bản ghi. Lỗi cấu trúc CSV / tiêu đề -> KttFileError (cả file hoàn tác). */
function docFile(db, cfg, filePath, napLanId, ket) {
  const cau = chuanBiCau(db, cfg);
  const capNhatLuc = nowUtc();
  const parser = parse({ bom: true, skip_empty_lines: true, relax_column_count: false, info: true });
  parser.on('error', () => { /* đọc lỗi qua parser.errored (đồng bộ) */ });
  const kiemLoi = () => {
    const e = parser.errored;
    if (e) throw new KttFileError(`Lỗi đọc CSV (${e.code || 'CSV_ERROR'}) ở dòng ${e.lines ?? '?'}`);
  };
  let tieuDe = null;
  const xuLy = () => {
    for (let r; (r = parser.read()) !== null;) {
      if (!tieuDe) { tieuDe = giaiTieuDe(r.record, cfg.cot); ket.cotLa = tieuDe.cotLa; ket.cotTuyChonVang = tieuDe.tuyChonVang; continue; }
      ket.dong++;
      const kq = chuyenDong(r.record, tieuDe.index, cfg.cot);
      if (kq.loi) {
        ket.loi++;
        if (ket.loiMau.length < TOI_DA_LOI_MAU) ket.loiMau.push({ dong: r.info.lines, cot: kq.loi.cot, ma: kq.loi.ma });
        continue;
      }
      const row = kq.row;
      if (!ket.nguonXuat || row.nguon_xuat_luc > ket.nguonXuat) ket.nguonXuat = row.nguon_xuat_luc;
      const gio = row[cfg.gioCot];
      if (gio) { if (!ket.gioMin || gio < ket.gioMin) ket.gioMin = gio; if (!ket.gioMax || gio > ket.gioMax) ket.gioMax = gio; }
      const cu = cau.tim.get(...cfg.khoa.map((k) => row[k]));
      // Khóa trùng TRONG CÙNG file: dòng sau thay dòng trước (cùng Nguon_xuat_luc), chỉ đếm riêng ở `trung`.
      if (cu && cu.nap_lan_id === napLanId) { cau.capNhat.run({ ...row, id: cu.id, nap_lan_id: napLanId, cap_nhat_luc: capNhatLuc }); ket.trung++; }
      else if (!cu) { cau.them.run({ ...row, nap_lan_id: napLanId, cap_nhat_luc: capNhatLuc }); ket.them++; }
      else if (row.nguon_xuat_luc >= cu.nguon_xuat_luc) { cau.capNhat.run({ ...row, id: cu.id, nap_lan_id: napLanId, cap_nhat_luc: capNhatLuc }); ket.capNhat++; }
      else ket.boQua++;
    }
  };
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(KICH_THUOC_LO);
    for (let n; (n = fs.readSync(fd, buf, 0, KICH_THUOC_LO, null)) > 0;) {
      parser.write(Buffer.from(buf.subarray(0, n)));
      xuLy();
      kiemLoi();
    }
  } finally { fs.closeSync(fd); }
  parser.end();
  xuLy();
  kiemLoi();
  if (!tieuDe) {
    if (ket.choPhepRong) { ket.rong = true; return; } // KTT-6: file chỉ có BOM / 0 byte hợp lệ trên đường SFTP (ảnh chụp không có dòng nào)
    throw new KttFileError('File rỗng, không có dòng tiêu đề');
  }
}

/**
 * Chạy fn trong một giao dịch rồi LUÔN hoàn tác (chạy thử: số liệu đúng như chạy thật nhưng không ghi gì). Trả về kết quả của fn.
 */
function chayThu(db, fn) {
  let kq;
  try {
    db.transaction(() => { kq = fn(); throw new HoanTac(); })();
  } catch (e) {
    if (!(e instanceof HoanTac)) throw e;
  }
  return kq;
}

// Túi nằm trong cửa sổ nếu MỘT trong bốn cột giờ nằm trong [cuaSoDen - CUA_SO_NGAY ngày, cuaSoDen] (điều kiện chọn túi của script KTT-1).
const COT_CUA_SO_TUI = ['gio_quet_tui_den', 'gio_quet_tui_di', 'bd10_di_gio_di', 'bd10_den_xnd'];
const KHOA_TUI_SQL = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index'];
const trongCuaSo = (a) => `(${COT_CUA_SO_TUI.map((c) => `${a}.${c} BETWEEN datetime(@w, '-${CUA_SO_NGAY} days') AND @w`).join(' OR ')})`;

/**
 * Số dòng đã có trong DB, thuộc cửa sổ của ảnh chụp mới, mà ảnh chụp này KHÔNG còn chứa (nguồn cũ hơn `nguonXuat`, chưa được file này ghi). Chỉ đếm, không xóa.
 * cuaSoDen: giờ trong TÊN file (cửa sổ = [cuaSoDen - 7 ngày, cuaSoDen]). Túi: nằm trong cửa sổ theo bốn cột giờ của túi; dòng bưu gửi: theo cửa sổ của TÚI chứa nó
 * (bưu gửi chưa có túi trong DB thì không đếm).
 */
function demKhongCon(db, cfg, nguonXuat, cuaSoDen = nguonXuat) {
  const p = { n: nguonXuat, w: cuaSoDen };
  if (cfg.bang === 'ktt_tui') return db.prepare(`SELECT COUNT(*) AS n FROM ktt_tui t WHERE t.nguon_xuat_luc < @n AND ${trongCuaSo('t')}`).get(p).n;
  return db.prepare(`SELECT COUNT(*) AS n FROM ${cfg.bang} b WHERE b.nguon_xuat_luc < @n AND EXISTS (SELECT 1 FROM ktt_tui t WHERE ${KHOA_TUI_SQL.map((k) => `t.${k} = b.${k}`).join(' AND ')} AND ${trongCuaSo('t')})`).get(p).n;
}

function napFile(db, loai, filePath, opts = {}) {
  const cfg = LOAI_FILE[loai];
  const fileName = path.basename(filePath);
  const ket = { loai, fileName, status: 'OK', error: null, sha256: null, napLanId: null, dong: 0, them: 0, capNhat: 0, boQua: 0, loi: 0, trung: 0, khongCon: 0, loiMau: [], cotLa: [], cotTuyChonVang: [], dryRun: !!opts.dryRun, choPhepRong: !!opts.choPhepRong, rong: false, nguonXuat: null, gioMin: null, gioMax: null };
  if (!cfg.mauTen.test(fileName)) {
    return { ...ket, status: 'SAI_TEN', error: `Tên file không đúng mẫu ${cfg.mau}` };
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`Không tìm thấy file: ${filePath}`);
  if (opts.dryRun) return { ...chayThu(db, () => napFile(db, loai, filePath, { ...opts, dryRun: false })), dryRun: true };

  ket.sha256 = bamFile(filePath);
  const daNap = db.prepare("SELECT id FROM ktt_nap_lan WHERE loai = ? AND sha256 = ? AND trang_thai = 'OK'").get(loai, ket.sha256);
  if (daNap) return { ...ket, status: 'DA_NAP', napLanId: daNap.id };

  try {
    db.transaction(() => {
      const them = db.prepare("INSERT INTO ktt_nap_lan (loai, ten_file, sha256, nap_luc, trang_thai) VALUES (?, ?, ?, ?, 'OK') ON CONFLICT(loai, sha256) DO UPDATE SET ten_file = excluded.ten_file, nap_luc = excluded.nap_luc, trang_thai = 'OK', thong_bao = NULL");
      them.run(loai, fileName, ket.sha256, nowUtc());
      ket.napLanId = db.prepare('SELECT id FROM ktt_nap_lan WHERE loai = ? AND sha256 = ?').get(loai, ket.sha256).id;
      docFile(db, cfg, filePath, ket.napLanId, ket);
      if (ket.nguonXuat || opts.cuaSoDen) ket.khongCon = demKhongCon(db, cfg, ket.nguonXuat || opts.cuaSoDen, opts.cuaSoDen || ket.nguonXuat);
      db.prepare('UPDATE ktt_nap_lan SET so_dong_doc = ?, so_dong_them = ?, so_dong_cap_nhat = ?, so_dong_bo_qua = ?, so_dong_loi = ?, loi_mau = ? WHERE id = ?')
        .run(ket.dong, ket.them, ket.capNhat, ket.boQua, ket.loi, ket.loiMau.length ? JSON.stringify(ket.loiMau) : null, ket.napLanId);
    })();
  } catch (e) {
    if (!(e instanceof KttFileError)) throw e;
    // Cả file đã hoàn tác. Ghi lại lần nạp bị từ chối (không chặn nạp lại bản đã sửa vì chỉ 'OK' mới chặn).
    db.prepare("INSERT INTO ktt_nap_lan (loai, ten_file, sha256, nap_luc, trang_thai, thong_bao) VALUES (?, ?, ?, ?, 'REJECTED', ?) ON CONFLICT(loai, sha256) DO UPDATE SET ten_file = excluded.ten_file, nap_luc = excluded.nap_luc, trang_thai = 'REJECTED', thong_bao = excluded.thong_bao")
      .run(loai, fileName, ket.sha256, nowUtc(), e.message);
    return { ...ket, status: 'REJECTED', error: e.message, napLanId: null, dong: 0, them: 0, capNhat: 0, boQua: 0, loi: 0, trung: 0, khongCon: 0, nguonXuat: null, gioMin: null, gioMax: null, loiMau: [] };
  }
  return ket;
}

/** Nạp file mức túi (KTT_Tui_*.csv). Trả { status: 'OK' | 'DA_NAP' | 'REJECTED' | 'SAI_TEN', dong, them, capNhat, boQua, loi, loiMau, cotLa, … }. opts.dryRun: không ghi gì. */
const importKttTui = (db, filePath, opts) => napFile(db, 'TUI', filePath, opts);
/** Nạp file mức bưu gửi-trong-túi (KTT_BuuGui_*.csv). Kết quả như importKttTui. */
const importKttBuuGui = (db, filePath, opts) => napFile(db, 'BUU_GUI', filePath, opts);

function loaiTuTen(fileName) {
  return Object.values(LOAI_FILE).find((cfg) => cfg.mauTen.test(fileName))?.loai || null;
}

/**
 * Nạp một file hoặc mọi KTT_*.csv trong thư mục (theo thứ tự tên). File KTT_* sai mẫu tên được báo SAI_TEN; file không bắt đầu bằng KTT_ bị bỏ qua.
 * opts.dryRun: cả lượt nằm trong MỘT giao dịch rồi hoàn tác nên số liệu dự kiến tính cả ảnh hưởng giữa các file.
 */
function importKttDuongDan(db, target, opts = {}) {
  if (!fs.existsSync(target)) throw new Error(`Không tìm thấy: ${target}`);
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((f) => /^KTT_.*\.csv$/i.test(f)).sort().map((f) => path.join(target, f))
    : [target];
  const chay = () => files.map((f) => {
    const loai = loaiTuTen(path.basename(f));
    if (!loai) return { loai: null, fileName: path.basename(f), status: 'SAI_TEN', error: 'Tên file không đúng mẫu KTT_Tui_<yyyymmdd>_<hhmmss>.csv hoặc KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv', dong: 0, them: 0, capNhat: 0, boQua: 0, loi: 0, loiMau: [], cotLa: [] };
    return napFile(db, loai, f, { ...opts, dryRun: false });
  });
  const kq = opts.dryRun ? chayThu(db, chay) : chay();
  return opts.dryRun ? kq.map((r) => ({ ...r, dryRun: true })) : kq;
}

module.exports = { napFile, bamFile, demKhongCon, CUA_SO_NGAY, KttFileError, importKttTui, importKttBuuGui, importKttDuongDan, chayThu, loaiTuTen, giaTriGio, giaTriSo, TOI_DA_LOI_MAU };
