// ==========================================
// SANLUONG-5f-2: «Lấy ngay» và «Lấy lại» cho màn «Nạp dữ liệu nguồn» (chỉ ADMIN, có ghi người bấm) — docs/ai/18_NAP_DU_LIEU_NGUON_API_LAY.md, 04_DECISIONS.md #86.
//  - «Lấy ngay»: MỘT lượt đồng bộ như hẹn giờ (lõi sftpSync.syncSftpOnce: cùng quy tắc «ổn định» hai lần liệt kê, cùng cửa sổ SFTP_SYNC_DAYS) nhưng tối đa SO_FILE_TOI_DA_LAY_NGAY file, cũ trước.
//  - «Lấy lại»: tải đúng file của các ô (BCVH, ngày, đợt) được chọn ở BẤT KỲ ngày nào còn file trên nguồn (bỏ cửa sổ ngày, GIỮ quy tắc «ổn định»); chỉ nạp file chưa có bản ghi OK/EMPTY cùng tên.
// Nguồn SFTP chỉ list / get / end. Không nạp thư viện SFTP ở đây (ketNoi lấy từ thayTheXemTruoc.layNguon()). Không sửa importer. Không DELETE / UPDATE dữ liệu đã nạp (arrival_*).
// Hàng khoá = hàng lượt trong sftp_sync_runs (cùng khoá chung với hẹn giờ, script tay, «Thay thế ngày»); việc nạp chạy NỀN sau khi đã trả 202.
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const X = require('./thayTheXemTruoc');
const S = require('./sftpSync');
const F = require('./sftpFiles');
const Sch = require('./sftpScheduler');
const { importArrivalFile } = require('./arrivalsImport');
const { MA_BCVH, dotCua } = require('./napNguonDoc');
const CF = require('../config/nap-nguon');

/** Lỗi có MÃ: THAM_SO_SAI (400), DANG_CHAY / TAM_DUNG (409), CHUA_CAU_HINH (503). extra = trường thêm cho phản hồi (vd luot_id). */
class LayLoi extends Error {
  constructor(code, message, httpStatus, extra = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.extra = extra;
  }
}
const saiThamSo = (m) => new LayLoi('THAM_SO_SAI', m, 400);

// ------------------------------------------
// Lược đồ: chỉ THÊM cột vào sftp_sync_runs (idempotent; hàng cũ để NULL). Gọi từ server/db.js.
// ------------------------------------------
const COT_THEM = [
  ['loai', "TEXT CHECK (loai IN ('LAY_NGAY', 'LAY_LAI'))"], // NULL = hẹn giờ / script cũ
  ['nguoi_bam_ma', 'TEXT'],
  ['nguoi_bam_ten', 'TEXT'],
  ['so_o_yeu_cau', 'INTEGER']
];
function ensureLuotSchema(db) {
  S.ensureSftpSyncSchema(db);
  const co = new Set(db.prepare('PRAGMA table_info(sftp_sync_runs)').all().map((c) => c.name));
  for (const [ten, dinhNghia] of COT_THEM) if (!co.has(ten)) db.exec(`ALTER TABLE sftp_sync_runs ADD COLUMN ${ten} ${dinhNghia}`);
}

// ------------------------------------------
// Tiêm cho test (mặc định rỗng): now () => Date, sleep (ms) => Promise, importFn, syncFn, tmpDir
// ------------------------------------------
let tuyChon = {};
function datTuyChon(t) { tuyChon = t || {}; }
const layNow = () => (tuyChon.now ? tuyChon.now() : new Date());

// Các tác vụ nền đang chạy (để test / tắt máy chủ đợi)
const dangChayNen = [];
const doiHetNen = () => Promise.allSettled([...dangChayNen]);
const boKhoiNen = (p) => { const i = dangChayNen.indexOf(p); if (i >= 0) dangChayNen.splice(i, 1); };

// ------------------------------------------
// Giữ khoá + ghi hàng lượt
// ------------------------------------------
const laKhoaThayThe = (r) => typeof r.ghi_chu_loi === 'string' && r.ghi_chu_loi.startsWith(CF.TIEN_TO_KHOA_THAY_THE);

/** Người bấm lấy từ bảng users theo id (họ tên tại thời điểm bấm); không có thì dùng claim của token. */
function nguoiBam(db, user) {
  const r = user && user.id ? db.prepare('SELECT hrm_code, full_name FROM users WHERE id = ?').get(user.id) : null;
  return { ma: (r && r.hrm_code) || (user && user.hrm_code) || 'khong-ro', ten: (r && r.full_name) || (user && user.full_name) || null };
}

/**
 * Giành khoá trong MỘT giao dịch ghi: có lượt chưa kết thúc (< KHOA_PHUT phút — gồm cả hàng khoá «Thay thế ngày») thì ném DANG_CHAY (409; kèm luot_id nếu là lượt thật,
 * KHÔNG lộ chi tiết hàng khoá); không thì đóng các hàng treo rồi thêm hàng lượt MANUAL kèm loai / người bấm / số ô. Trả id lượt.
 */
function giuKhoa(db, now, { loai, nguoi, soO }) {
  return db.transaction(() => {
    const treo = db.prepare('SELECT id, started_at, ghi_chu_loi FROM sftp_sync_runs WHERE finished_at IS NULL ORDER BY id DESC').all();
    const dang = treo.find((r) => now.getTime() - Date.parse(r.started_at) < S.KHOA_PHUT * 60000);
    if (dang) throw new LayLoi('DANG_CHAY', 'Đang có một lượt chạy. Thử lại khi nó kết thúc.', 409, laKhoaThayThe(dang) ? {} : { luot_id: dang.id });
    for (const t of treo) {
      db.prepare('UPDATE sftp_sync_runs SET finished_at = ?, ghi_chu_loi = ? WHERE id = ?').run(now.toISOString(), `Lượt treo quá ${S.KHOA_PHUT} phút, tự đóng khi bắt đầu lượt mới`, t.id);
    }
    return Number(db.prepare('INSERT INTO sftp_sync_runs (started_at, "trigger", loai, nguoi_bam_ma, nguoi_bam_ten, so_o_yeu_cau) VALUES (?, ?, ?, ?, ?, ?)')
      .run(now.toISOString(), 'MANUAL', loai, nguoi.ma, nguoi.ten, soO ?? null).lastInsertRowid);
  }).immediate();
}

/** Đóng hàng lượt (nhả khoá) nếu còn mở; cộng thêm `loi`, ghi chú đã làm sạch. Không bao giờ ném lỗi. */
function dongHang(db, runId, now, { loi = 0, ghiChu = null, dem = null } = {}) {
  try {
    db.prepare('UPDATE sftp_sync_runs SET finished_at = @f, loi = loi + @l, ghi_chu_loi = COALESCE(@g, ghi_chu_loi) WHERE id = @id AND finished_at IS NULL')
      .run({ f: now.toISOString(), l: loi, g: ghiChu, id: runId });
    if (dem) {
      db.prepare('UPDATE sftp_sync_runs SET tong_liet_ke = @a, da_nap = @b, da_co = @c, chua_on_dinh = @d, rong = @e, bo_qua_khac = @f WHERE id = @id')
        .run({ a: dem.tongListKe, b: dem.daNap, c: dem.daCo, d: dem.chuaOnDinh, e: dem.rong, f: dem.boQuaKhac, id: runId });
    }
  } catch (e) { /* hết cách: hàng tự đóng sau KHOA_PHUT phút */ }
}

// ------------------------------------------
// Kiểm tra trước khi lấy: cấu hình -> hẹn giờ tạm dừng -> đang chạy
// ------------------------------------------
function nguonVaCauHinh() {
  let nguon;
  try { nguon = X.layNguon(); } catch (err) {
    if (err instanceof X.XemTruocLoi && err.code === 'CHUA_CAU_HINH_SFTP') throw new LayLoi('CHUA_CAU_HINH', err.message, 503);
    throw err;
  }
  let sync;
  try { sync = S.docCauHinhSync(process.env, {}); } catch (err) {
    if (err instanceof F.CauHinhLoi) throw new LayLoi('CHUA_CAU_HINH', err.message, 503);
    throw err;
  }
  return { nguon, sync };
}

function kiemTraHenGio() {
  const st = Sch.docTrangThaiSftp();
  if (st.trangThai === 'TAM_DUNG') {
    throw new LayLoi('TAM_DUNG', 'Hẹn giờ đang tạm dừng vì lỗi xác thực hoặc vân tay sai — KHÔNG kết nối lại để tránh NAS chặn địa chỉ. Sửa cấu hình rồi khởi động lại máy chủ.', 409,
      { ly_do: st.lyDo === 'VAN_TAY_SAI' ? 'VAN_TAY' : (st.lyDo === 'XAC_THUC' ? 'XAC_THUC' : null) });
  }
  if (st.trangThai === 'DANG_CHAY') throw new LayLoi('DANG_CHAY', 'Đang có một lượt tự động chạy. Thử lại khi nó kết thúc.', 409);
}

/** Lỗi nối / liệt kê nguồn: ghi lượt lỗi; xác thực / vân tay sai thì đưa hẹn giờ về TAM_DUNG như lượt tự động. Trả true nếu là lỗi xác thực / vân tay. */
function xuLyLoiNguon(db, runId, now, err, bimat) {
  const p = F.phanLoaiLoi(err, { saiVanTay: !!(err && err.saiVanTay) });
  const chiTiet = `${p.thongBao}${p.nhom === 'mang' || p.nhom === 'khac' ? `: ${S.lamSach(err && err.message, bimat, 150)}` : ''}`;
  dongHang(db, runId, now(), { loi: 1, ghiChu: S.lamSach(`Lượt tay không kết nối được (${p.nhom}): ${chiTiet}`, bimat, 300) });
  if (p.nhom === 'van_tay' || p.nhom === 'xac_thuc') {
    Sch.tamDungHenGio(p.nhom === 'van_tay' ? 'VAN_TAY_SAI' : 'XAC_THUC', p.thongBao);
    return true;
  }
  return false;
}

/** Chạy việc nền; mọi lỗi bất ngờ được bắt, hàng lượt LUÔN được đóng (nhả khoá) trong finally. */
function chayNen(db, runId, bimat, viec) {
  const p = (async () => {
    try {
      await viec();
    } catch (err) {
      dongHang(db, runId, layNow(), { loi: 1, ghiChu: S.lamSach(`Lỗi bất ngờ: ${String((err && err.code) || (err && err.name) || 'LOI')} ${err && err.message}`, bimat, 300) });
    } finally {
      dongHang(db, runId, layNow(), {});
    }
  })();
  dangChayNen.push(p);
  p.then(() => boKhoiNen(p), () => boKhoiNen(p));
  return p;
}

const xacThucTrongKq = (kq) => (kq.loiThuMuc || []).find((t) => t.ma === F.MA_THOAT.XAC_THUC || t.ma === F.MA_THOAT.VAN_TAY);

// ------------------------------------------
// «Lấy ngay»
// ------------------------------------------
/** Trả { luot_id, bat_dau } NGAY (202); việc nạp chạy nền. Ném LayLoi (409 DANG_CHAY / TAM_DUNG, 503 CHUA_CAU_HINH). */
function layNgay({ db, user }) {
  const { nguon, sync } = nguonVaCauHinh();
  kiemTraHenGio();
  const now = layNow();
  const runId = giuKhoa(db, now, { loai: 'LAY_NGAY', nguoi: nguoiBam(db, user), soO: null });
  const bimat = nguon.bimat || [];
  const sleep = tuyChon.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  chayNen(db, runId, bimat, async () => {
    let client = null;
    try {
      try { client = await nguon.ketNoi(); } catch (err) { xuLyLoiNguon(db, runId, layNow, err, bimat); return; }
      const kq = await (tuyChon.syncFn || S.syncSftpOnce)({
        client, db, dirs: nguon.dirs, now: layNow, sleep, tmpDir: tuyChon.tmpDir || os.tmpdir(),
        options: { trigger: 'MANUAL', luotCoSan: runId, oDinh: 'HAI_LAN', soNgay: sync.soNgay, onDinhGiay: sync.onDinhGiay, toiDa: CF.SO_FILE_TOI_DA_LAY_NGAY, bimat, ...(tuyChon.importFn ? { importFn: tuyChon.importFn } : {}) }
      });
      const xt = xacThucTrongKq(kq);
      if (xt) Sch.tamDungHenGio(xt.ma === F.MA_THOAT.VAN_TAY ? 'VAN_TAY_SAI' : 'XAC_THUC', xt.nhom);
    } finally {
      if (client) { try { await client.end(); } catch (e) { /* đã đóng */ } }
    }
  });
  return { luot_id: runId, bat_dau: now.toISOString() };
}

// ------------------------------------------
// «Lấy lại»
// ------------------------------------------
const NGAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function ngayHopLe(s) {
  const m = typeof s === 'string' ? NGAY_RE.exec(s) : null;
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const p2 = (n) => String(n).padStart(2, '0');
const ngayCuc = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Kiểm thân { o: [{bcvh, ngay, dot}] }: 1..SO_O_TOI_DA_LAY_LAI phần tử, bcvh ∈ 6 BCVH, ngày hợp lệ không ở tương lai, dot S|C, không trường lạ. Ô trùng bị LOẠI TRÙNG (giữ lần đầu). */
function kiemTraO(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw saiThamSo('Thân yêu cầu phải là đối tượng JSON { "o": [...] }');
  for (const k of Object.keys(body)) if (k !== 'o') throw saiThamSo(`Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
  if (!Array.isArray(body.o) || body.o.length < 1 || body.o.length > CF.SO_O_TOI_DA_LAY_LAI) throw saiThamSo(`"o" phải là danh sách từ 1 đến ${CF.SO_O_TOI_DA_LAY_LAI} ô`);
  const hom = ngayCuc(now);
  const thay = new Set();
  const out = [];
  for (const x of body.o) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw saiThamSo('Mỗi ô phải là đối tượng { bcvh, ngay, dot }');
    for (const k of Object.keys(x)) if (!['bcvh', 'ngay', 'dot'].includes(k)) throw saiThamSo(`Ô có trường không hỗ trợ: "${String(k).slice(0, 40)}"`);
    if (typeof x.bcvh !== 'string' || !MA_BCVH.includes(x.bcvh)) throw saiThamSo(`"bcvh" phải là một trong: ${MA_BCVH.join(', ')}`);
    if (!ngayHopLe(x.ngay)) throw saiThamSo('"ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
    if (x.ngay > hom) throw saiThamSo('"ngay" không được ở tương lai');
    if (x.dot !== 'S' && x.dot !== 'C') throw saiThamSo('"dot" phải là S hoặc C');
    const k = `${x.bcvh}|${x.ngay}|${x.dot}`;
    if (thay.has(k)) continue;
    thay.add(k);
    out.push({ bcvh: x.bcvh, ngay: x.ngay, dot: x.dot });
  }
  return out;
}

/** Kết quả một lần thử ghi vào sftp_sync_files bằng cột sẵn có (ket_qua bị CHECK nên ánh xạ về giá trị cho phép). */
const KQ = Object.freeze({ DA_NAP: 'DA_NAP', DA_CO: 'DA_CO', CHUA_ON_DINH: 'CHUA_ON_DINH', RONG: 'EMPTY', LOI: 'LOI', BO_QUA: 'BO_QUA' });

/** Trả { luot_id, bat_dau, o: [{bcvh, ngay, dot, da_co_nhap_tay}] } NGAY (202); việc nạp chạy nền. */
function layLai({ db, user, body }) {
  const now = layNow();
  const cacO = kiemTraO(body, now);
  const { nguon, sync } = nguonVaCauHinh();
  kiemTraHenGio();
  const runId = giuKhoa(db, now, { loai: 'LAY_LAI', nguoi: nguoiBam(db, user), soO: cacO.length });
  const coTay = db.prepare("SELECT 1 FROM arrival_import_files WHERE unit_code = ? AND file_date = ? AND source = 'MANUAL' AND status IN ('OK', 'EMPTY') LIMIT 1");
  const phanHoi = cacO.map((x) => ({ ...x, da_co_nhap_tay: !!coTay.get(x.bcvh, x.ngay) }));
  const bimat = nguon.bimat || [];
  const sleep = tuyChon.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  chayNen(db, runId, bimat, () => chayLayLai({ db, runId, cacO, nguon, sync, bimat, sleep }));
  return { luot_id: runId, bat_dau: now.toISOString(), o: phanHoi };
}

async function chayLayLai({ db, runId, cacO, nguon, sync, bimat, sleep }) {
  const dem = { tongListKe: 0, daNap: 0, daCo: 0, chuaOnDinh: 0, rong: 0, boQuaKhac: 0 };
  let soLoi = 0;
  const ghiChu = [];
  const ghiFile = db.prepare('INSERT INTO sftp_sync_files (run_id, thu_muc, ten_file, ket_qua, so_dong, thoi_gian_ms, ma_loi, chi_tiet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const them = (thuMuc, tenFile, ketQua, { soDong = null, ms = null, maLoi = null, chiTiet = null } = {}) => {
    ghiFile.run(runId, thuMuc, F.tenAnToan(tenFile, 120), ketQua, soDong, ms, maLoi, chiTiet ? S.lamSach(chiTiet, bimat, 300) : null);
    if (ketQua === KQ.DA_NAP) dem.daNap++;
    else if (ketQua === KQ.DA_CO) dem.daCo++;
    else if (ketQua === KQ.CHUA_ON_DINH) dem.chuaOnDinh++;
    else if (ketQua === KQ.RONG) dem.rong++;
    else if (ketQua === KQ.LOI) soLoi++;
    else dem.boQuaKhac++;
  };
  let client = null;
  let thuMucTam = null;
  try {
    try { client = await nguon.ketNoi(); } catch (err) { xuLyLoiNguon(db, runId, layNow, err, bimat); return; }
    // ---- liệt kê hai lần cách onDinhGiay giây (quy tắc «ổn định»; KHÔNG có cửa sổ ngày)
    const lan1 = new Map();
    const loiThuMuc = [];
    const liet = async (dir) => {
      try { return await client.list(dir); } catch (err) {
        const p = F.phanLoaiLoi(err, { saiVanTay: !!(err && err.saiVanTay) });
        if (p.nhom === 'van_tay' || p.nhom === 'xac_thuc') { xuLyLoiNguon(db, runId, layNow, err, bimat); throw Object.assign(new Error('DUNG'), { dung: true }); }
        loiThuMuc.push(`${F.tenAnToan(dir, 40)}: ${p.nhom}`);
        return null;
      }
    };
    for (const dir of nguon.dirs) { const e = await liet(dir); if (e) lan1.set(dir, e); }
    if (lan1.size) await sleep(sync.onDinhGiay * 1000);
    const khop = new Map(); // tên -> { thuMuc, f, onDinh }
    for (const dir of lan1.keys()) {
      const e2 = await liet(dir);
      if (!e2) continue;
      dem.tongListKe += e2.length;
      const onDinh = new Set(F.fileOnDinh(lan1.get(dir).filter((e) => e.type === '-'), e2.filter((e) => e.type === '-')).onDinh);
      for (const f of F.locMuc(e2).khop) if (!khop.has(f.name)) khop.set(f.name, { thuMuc: dir, f, onDinh: onDinh.has(f.name) });
    }
    if (loiThuMuc.length) { soLoi += loiThuMuc.length; ghiChu.push(`Lỗi thư mục: ${loiThuMuc.join('; ')}`); }

    const daNap = db.prepare("SELECT file_size, status FROM arrival_import_files WHERE file_name = ? AND status IN ('OK', 'EMPTY') LIMIT 1");
    const importFn = tuyChon.importFn || importArrivalFile;
    // ---- từng ô, cũ trước (ngày tăng dần, S trước C); một ô lỗi không làm hỏng ô khác
    const sapXep = [...cacO].sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.dot < b.dot ? 1 : a.dot > b.dot ? -1 : (a.bcvh < b.bcvh ? -1 : a.bcvh > b.bcvh ? 1 : 0)));
    for (const o of sapXep) {
      const khoaO = `HangDen_${o.bcvh}_${o.ngay.replace(/-/g, '')}_${o.dot}`;
      const cua = [...khop.values()].filter((x) => x.f.maDonVi === o.bcvh && x.f.ngay === o.ngay && x.f.ngayHopLe && dotCua(x.f.gio) === o.dot).sort((a, b) => (a.f.khoa < b.f.khoa ? -1 : 1));
      if (!cua.length) { them('-', khoaO, KQ.BO_QUA, { maLoi: 'NGUON_KHONG_CO', chiTiet: 'Nguồn không có file của ô này' }); continue; }
      for (const x of cua) {
        const tenF = x.f.name;
        try {
          const co = daNap.get(tenF);
          if (co && co.status === 'OK') { them(x.thuMuc, tenF, KQ.DA_CO, { chiTiet: 'Đã có bản OK cùng tên — không nạp đè' }); continue; }
          if (co && Number(co.file_size) === x.f.size) { them(x.thuMuc, tenF, KQ.DA_CO, { chiTiet: 'Đã có bản ghi rỗng cùng kích thước — không nạp đè' }); continue; }
          if (co) { // EMPTY đã ghi nhưng nguồn nay có nội dung khác: importer sẽ báo CONFLICT (không ghi đè) nên không thử
            them(x.thuMuc, tenF, KQ.BO_QUA, { maLoi: 'KHONG_THE_LAY_LAI', chiTiet: 'DA_GHI_RONG_KHAC_NOI_DUNG: DB đã có bản ghi rỗng cùng tên, nguồn nay khác kích thước; importer không ghi đè bản ghi rỗng' });
            continue;
          }
          if (!x.onDinh) { them(x.thuMuc, tenF, KQ.CHUA_ON_DINH, { chiTiet: 'Kích thước / mtime đổi giữa hai lần liệt kê — thử lại sau' }); continue; }
          if (!thuMucTam) thuMucTam = fs.mkdtempSync(path.join(tuyChon.tmpDir || os.tmpdir(), 'hue-dhcl-laylai-'));
          await layMotFile({ client, importFn, db, x, thuMucTam, them, bimat });
        } catch (err) {
          them(x.thuMuc, tenF, KQ.LOI, { maLoi: S.lamSach(String((err && err.code) || (err && err.name) || 'LOI'), [], 40).replace(/[^A-Za-z0-9_]/g, '').toUpperCase() || 'LOI', chiTiet: err && err.message });
        }
      }
    }
  } catch (err) {
    if (!(err && err.dung)) throw err; // lỗi xác thực / vân tay đã được ghi + đóng hàng + tạm dừng hẹn giờ
    return;
  } finally {
    if (thuMucTam) { try { fs.rmSync(thuMucTam, { recursive: true, force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
    if (client) { try { await client.end(); } catch (e) { /* đã đóng */ } }
  }
  dongHang(db, runId, layNow(), { loi: soLoi, ghiChu: ghiChu.length ? S.lamSach(ghiChu.join(' | '), bimat, 500) : null, dem });
}

async function layMotFile({ client, importFn, db, x, thuMucTam, them, bimat }) {
  const t0 = process.hrtime.bigint();
  const ms = () => Number((process.hrtime.bigint() - t0) / 1000000n);
  const ten = S.kiemTraTenTep(x.f.name);
  const cucBo = path.join(thuMucTam, ten);
  try {
    await client.get(`${x.thuMuc.replace(/\/+$/, '')}/${ten}`, cucBo);
    const size = fs.statSync(cucBo).size;
    if (size !== x.f.size) throw Object.assign(new Error(`Tải về ${size} byte nhưng danh sách báo ${x.f.size} byte (file có thể đang được ghi)`), { code: 'KICH_THUOC_LECH' });
    const r = await importFn(db, cucBo, { source: 'SFTP' });
    const chiTiet = [r.warning, r.error].filter(Boolean).join(' | ') || null;
    if (r.status === 'OK' || r.status === 'EMPTY') {
      if (r.alreadyImported) return them(x.thuMuc, x.f.name, KQ.DA_CO, { soDong: r.rowCount ?? null, ms: ms(), chiTiet: 'Đã được nạp trước đó (importer)' });
      if (r.status === 'EMPTY') return them(x.thuMuc, x.f.name, KQ.RONG, { soDong: 0, ms: ms(), chiTiet: chiTiet || 'Importer ghi nhận đợt rỗng' });
      return them(x.thuMuc, x.f.name, KQ.DA_NAP, { soDong: r.rowCount ?? null, ms: ms(), chiTiet });
    }
    return them(x.thuMuc, x.f.name, KQ.LOI, { ms: ms(), maLoi: String(r.status).slice(0, 40), chiTiet });
  } finally {
    try { fs.rmSync(cucBo, { force: true }); } catch (e) { /* tệp tạm: bỏ qua */ }
  }
}

module.exports = { LayLoi, ensureLuotSchema, datTuyChon, doiHetNen, giuKhoa, dongHang, nguoiBam, kiemTraO, layNgay, layLai, COT_THEM };
