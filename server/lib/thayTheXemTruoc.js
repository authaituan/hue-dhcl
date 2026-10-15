// ==========================================
// SANLUONG-5g-2: BẢN XEM TRƯỚC «Thay thế ngày của một BCVH» — CHỈ ĐỌC (docs/ai/15_THAY_THE_NGAY_XEM_TRUOC.md, 04_DECISIONS.md #82).
// Tính và trả về điều SẼ xảy ra nếu thay dữ liệu hàng đến của (BCVH X, ngày D) bằng các file hiện có trên nguồn SFTP. KHÔNG thay đổi gì: không ghi DB, không ghi lên
// nguồn, không nạp. Việc thay thật là ticket 5g-3 (tải và kiểm lại, không tin bản xem trước).
//  - «Ngày» = ngày trong TÊN FILE (file_date), không phải ngày trong nội dung. Phía DB: mọi file có unit_code = X và file_date = D, mọi trạng thái.
//  - Phía nguồn: mọi file HangDen_<X>_<yyyymmdd(D)>_<hhmmss>.csv; người dùng chọn tập dùng để thay (mặc định tất cả); hệ thống không tự đoán file «chuẩn».
//  - So sánh theo SHBG chuẩn hoá (cắt khoảng trắng + viết hoa, như DASH-6a / module phát).
// Mô-đun này KHÔNG nạp thư viện SFTP (client hoặc hàm ketNoi được tiêm; chỉ route / script nạp qua sftpConnect.js) và không dùng lệnh ghi nào của SFTP.
// Không có SHBG trong log; SHBG mẫu chỉ nằm trong dữ liệu trả về cho ADMIN.
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('./sftpFiles');
const S = require('./sftpSync');
const { chuanBiFile } = require('./arrivalsImport');
const { VALID_BCVH_CODES } = require('./userBcvh');
const CF = require('../config/thay-the');

const MA_LOI = Object.freeze({
  THAM_SO_SAI: 'THAM_SO_SAI', TAP_FILE_KHONG_HOP_LE: 'TAP_FILE_KHONG_HOP_LE',
  DANG_CO_LUOT_DONG_BO: 'DANG_CO_LUOT_DONG_BO', DANG_XEM_TRUOC: 'DANG_XEM_TRUOC', CHUA_CAU_HINH_SFTP: 'CHUA_CAU_HINH_SFTP',
  NGUON_XAC_THUC: 'NGUON_XAC_THUC', NGUON_VAN_TAY: 'NGUON_VAN_TAY', NGUON_MANG: 'NGUON_MANG', NGUON_THU_MUC: 'NGUON_THU_MUC', NGUON_KHAC: 'NGUON_KHAC'
});
const HTTP = Object.freeze({
  THAM_SO_SAI: 400, TAP_FILE_KHONG_HOP_LE: 400, DANG_CO_LUOT_DONG_BO: 409, DANG_XEM_TRUOC: 409, CHUA_CAU_HINH_SFTP: 503,
  NGUON_XAC_THUC: 502, NGUON_VAN_TAY: 502, NGUON_MANG: 502, NGUON_THU_MUC: 502, NGUON_KHAC: 502
});
// Mã thoát của scripts/thay-the-xem-truoc.js theo mã lỗi.
const MA_THOAT = Object.freeze({
  OK: 0, CAU_HINH: 2, MANG: 3, XAC_THUC: 4, VAN_TAY: 5, THU_MUC: 6, DANG_CO_LUOT: 7, THAM_SO: 8, KHAC: 1
});
const THOAT_THEO_LOI = Object.freeze({
  THAM_SO_SAI: 8, TAP_FILE_KHONG_HOP_LE: 8, DANG_CO_LUOT_DONG_BO: 7, DANG_XEM_TRUOC: 7, CHUA_CAU_HINH_SFTP: 2,
  NGUON_XAC_THUC: 4, NGUON_VAN_TAY: 5, NGUON_MANG: 3, NGUON_THU_MUC: 6, NGUON_KHAC: 1
});

/** Lỗi có MÃ (không ném chuỗi lạ): code ∈ MA_LOI, httpStatus cho route, message tiếng Việt đã che bí mật. */
class XemTruocLoi extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.httpStatus = HTTP[code] || 500;
  }
}

const chuanHoaShbg = (s) => String(s ?? '').trim().toUpperCase();
const RONG_TOI_DA_BYTE = 3; // file ≤ 3 byte (chỉ BOM / rỗng): ghi RONG, không tải
const NGAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Kiểm bcvh (∈ 6 BCVH) và ngay (YYYY-MM-DD, ngày có thật), tapFile (mảng tên file hoặc null). Ném XemTruocLoi THAM_SO_SAI / TAP_FILE_KHONG_HOP_LE. */
function kiemTraDauVao({ bcvh, ngay, tapFile = null }) {
  if (typeof bcvh !== 'string' || !VALID_BCVH_CODES.includes(bcvh)) throw new XemTruocLoi(MA_LOI.THAM_SO_SAI, `Tham số "bcvh" phải là một trong: ${VALID_BCVH_CODES.join(', ')}`);
  const m = typeof ngay === 'string' ? NGAY_RE.exec(ngay) : null;
  const co = m && (() => { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate(); })();
  if (!co) throw new XemTruocLoi(MA_LOI.THAM_SO_SAI, 'Tham số "ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
  if (tapFile !== null && tapFile !== undefined) {
    if (!Array.isArray(tapFile) || tapFile.length > 200 || !tapFile.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 120)) {
      throw new XemTruocLoi(MA_LOI.TAP_FILE_KHONG_HOP_LE, 'Tham số "tap_file" phải là danh sách tên file (chuỗi, tối đa 200 tên)');
    }
  }
  return { bcvh, ngay, tapFile: tapFile ?? null };
}

// Cờ trong bộ nhớ: hai lần xem trước không chạy cùng lúc (không ghi gì vào DB để giữ khoá).
let dangXemTruoc = false;

/** Có lượt đồng bộ (script chạy tay hoặc hẹn giờ) đang chạy: khoá DB còn hiệu lực (sftpSync.luotDangChay) hoặc hẹn giờ đang ở trạng thái DANG_CHAY. Chỉ ĐỌC. */
function kiemTraKhoa(db, now, { dangDongBo = null } = {}) {
  const dangChayDb = S.luotDangChay(db, now.getTime());
  const dangChayHenGio = dangDongBo ? !!dangDongBo() : require('./sftpScheduler').docTrangThaiSftp().trangThai === 'DANG_CHAY';
  if (dangChayDb || dangChayHenGio) {
    throw new XemTruocLoi(MA_LOI.DANG_CO_LUOT_DONG_BO, `Đang có một lượt đồng bộ SFTP chạy${dangChayDb ? ` (lượt #${dangChayDb.id})` : ''}. Thử lại sau khi nó kết thúc.`);
  }
}

/** Lỗi từ nguồn SFTP (kết nối / liệt kê / tải) -> XemTruocLoi có mã. KHÔNG thử lại. bimat: chuỗi cần che khỏi thông báo. */
function loiNguon(err, bimat = []) {
  if (err instanceof XemTruocLoi) return err;
  const p = F.phanLoaiLoi(err, { saiVanTay: !!(err && err.saiVanTay) });
  const ma = { van_tay: MA_LOI.NGUON_VAN_TAY, xac_thuc: MA_LOI.NGUON_XAC_THUC, mang: MA_LOI.NGUON_MANG, thu_muc: MA_LOI.NGUON_THU_MUC }[p.nhom] || MA_LOI.NGUON_KHAC;
  const chiTiet = p.nhom === 'khac' ? `: ${S.lamSach(err && err.message, bimat, 120)}` : '';
  return new XemTruocLoi(ma, `Nguồn SFTP: ${p.thongBao}${chiTiet}`);
}

// ------------------------------------------
// Phía DB (chỉ đọc)
// ------------------------------------------
function docPhiaDb(db, bcvh, ngay) {
  const files = db.prepare(`SELECT id, file_name, source, status, row_count FROM arrival_import_files WHERE unit_code = @b AND file_date = @d ORDER BY id`).all({ b: bcvh, d: ngay });
  const ids = JSON.stringify(files.map((f) => f.id));
  const dong = files.length
    ? db.prepare(`SELECT tracking_no, arrival_date, import_file_id FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(@ids))`).all({ ids })
    : [];
  const theoFile = new Map();
  const shbg = new Set();
  const theoNgay = new Map(); // arrival_date (hoặc null) -> { shbg: Set, dong }
  let ngayRong = 0;
  for (const r of dong) {
    theoFile.set(r.import_file_id, (theoFile.get(r.import_file_id) || 0) + 1);
    if (r.arrival_date === null || r.arrival_date === undefined) ngayRong++;
    const k = r.arrival_date ?? null;
    if (!theoNgay.has(k)) theoNgay.set(k, { shbg: new Set(), dong: 0 });
    const e = theoNgay.get(k);
    e.dong++;
    const s = chuanHoaShbg(r.tracking_no);
    if (s) { shbg.add(s); e.shbg.add(s); }
  }
  return {
    ids, files: files.map((f) => ({ id: f.id, file_name: f.file_name, source: f.source, status: f.status, row_count: f.row_count, so_dong_thuc: theoFile.get(f.id) || 0 })),
    tongDong: dong.length, dongNgayRong: ngayRong, shbg, theoNgay
  };
}

function docPhiaPhat(db, bcvh, shbgCu, shbgMoi) {
  const co = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'phat_status_current'").get();
  if (!co || !shbgCu.size) return { co_bang: !!co, so_shbg_co_trang_thai: 0, con_o_ban_moi: 0, khong_con: 0 };
  const rows = db.prepare('SELECT shbg FROM phat_status_current WHERE bcvh = @b AND shbg IN (SELECT value FROM json_each(@j))').all({ b: bcvh, j: JSON.stringify([...shbgCu]) });
  const conLai = rows.filter((r) => shbgMoi.has(chuanHoaShbg(r.shbg))).length;
  return { co_bang: true, so_shbg_co_trang_thai: rows.length, con_o_ban_moi: conLai, khong_con: rows.length - conLai };
}

// ------------------------------------------
// Lõi
// ------------------------------------------
/**
 * Liệt kê các thư mục nguồn và giữ file của ĐÚNG (bcvh, ngày): tên khớp mẫu, đúng mã, đúng ngày, ngày có thật; bỏ qua có đếm. Chỉ gọi client.list.
 * Trả { khop: [{ thuMuc, name, size, mtime, khoa, … }] (sắp theo khoá thời gian rồi tên), boQua, daThay (Set tên), tongMuc }. Lỗi nguồn -> XemTruocLoi. Dùng chung với 5g-3.
 */
async function lietKeNguonCuaNgay(ketNoiXong, dirs, bcvh, ngay, bimat = []) {
  const khop = [];
  const boQua = { khac_ma: 0, khac_ngay: 0, ngay_khong_hop_le: 0, ten_khac: 0, trung_ten: 0 };
  const daThay = new Set();
  let tongMuc = 0;
  for (const dir of dirs) {
    let entries;
    try { entries = await ketNoiXong.list(dir); } catch (err) { throw loiNguon(err, bimat); }
    tongMuc += entries.length;
    const l = F.locMuc(entries);
    boQua.ten_khac += l.boQua.tong;
    for (const f of l.khop) {
      if (f.maDonVi !== bcvh) { boQua.khac_ma++; continue; }
      if (f.ngay !== ngay) { boQua.khac_ngay++; continue; }
      if (!f.ngayHopLe) { boQua.ngay_khong_hop_le++; continue; }
      if (daThay.has(f.name)) { boQua.trung_ten++; continue; }
      daThay.add(f.name);
      khop.push({ thuMuc: dir, ...f });
    }
  }
  khop.sort((a, b) => (a.khoa < b.khoa ? -1 : a.khoa > b.khoa ? 1 : a.name < b.name ? -1 : 1));
  return { khop, boQua, daThay, tongMuc };
}

const khoaDong = (i) => `${i.tracking_no}\u0000${i.bd10_no}\u0000${i.bd8_no}\u0000${i.item_confirmed_at ?? ''}`; // CÙNG khoá duy nhất với importer

/**
 * So sánh dữ liệu cũ (cu = docPhiaDb) với tập file mới đã chuẩn bị (sanSang: các đối tượng READY của chuanBiFile). Chỉ ĐỌC DB.
 * Trả { moi: {shbg, theoNgay, dongSauLoc, …}, trungConLai, chiOCu (SHBG chuẩn hoá chỉ có ở cũ, sắp tăng dần — mức CẬN TRÊN của «mất»), chiOMoi, chung, tyLeMat, theoNgayDen }.
 * Dùng chung với 5g-3 (ở đó tính thêm «mất thật»).
 */
function tinhSoSanh(db, cu, sanSang) {
  const moi = { shbg: new Set(), theoNgay: new Map(), dongSauLoc: 0, khoaDaCo: new Set(), dongTho: 0, tracking: new Set(), mauKhoa: [] };
  const duyet = [];
  for (const d of sanSang) {
    for (const it of d.items) {
      moi.dongTho++;
      const s = chuanHoaShbg(it.tracking_no);
      if (s) moi.shbg.add(s);
      const k = it.arrival_date ?? null;
      if (!moi.theoNgay.has(k)) moi.theoNgay.set(k, new Set());
      if (s) moi.theoNgay.get(k).add(s);
      const kd = khoaDong(it);
      if (moi.khoaDaCo.has(kd)) continue; // trùng khoá duy nhất của importer: sẽ bị bỏ qua
      moi.khoaDaCo.add(kd);
      moi.dongSauLoc++;
      duyet.push({ tracking_no: it.tracking_no, kd });
    }
  }
  // dòng mới trùng với dòng CÒN LẠI trong DB (file ngoài tập sẽ bị xoá, vd file sáng ngày kế tiếp): importer cũng bỏ qua
  let trungConLai = 0;
  if (duyet.length) {
    const raw = [...new Set(duyet.map((x) => x.tracking_no))];
    const conLai = new Set(db.prepare(`SELECT tracking_no, bd10_no, bd8_no, COALESCE(item_confirmed_at, '') AS k FROM arrival_items
      WHERE tracking_no IN (SELECT value FROM json_each(@j)) AND import_file_id NOT IN (SELECT value FROM json_each(@ids))`)
      .all({ j: JSON.stringify(raw), ids: cu.ids }).map((r) => `${r.tracking_no}\u0000${r.bd10_no}\u0000${r.bd8_no}\u0000${r.k}`));
    trungConLai = duyet.filter((x) => conLai.has(x.kd)).length;
  }

  const chiOCu = [...cu.shbg].filter((s) => !moi.shbg.has(s)).sort();
  const chiOMoi = [...moi.shbg].filter((s) => !cu.shbg.has(s));
  const chung = cu.shbg.size - chiOCu.length;
  const tyLeMat = cu.shbg.size ? Math.round((chiOCu.length / cu.shbg.size) * 10000) / 10000 : 0;
  const cacNgay = new Set([...cu.theoNgay.keys(), ...moi.theoNgay.keys()]);
  const theoNgayDen = [...cacNgay].sort((a, b) => (a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0))
    .map((k) => ({ ngay: k, shbg_cu: cu.theoNgay.has(k) ? cu.theoNgay.get(k).shbg.size : 0, shbg_moi: moi.theoNgay.has(k) ? moi.theoNgay.get(k).size : 0 }));
  return { moi, trungConLai, chiOCu, chiOMoi, chung, tyLeMat, theoNgayDen };
}

/** Mức cảnh báo theo số SHBG mất / tổng SHBG cũ (so sánh số nguyên: đúng bằng ngưỡng vẫn là CAN_XAC_NHAN). */
function mucCanhBaoTheo(soMat, tong) {
  const nguongNguyen = Math.round(CF.NGUONG_MAT_SHBG_DO * 10000);
  return soMat === 0 ? 'AN_TOAN' : (soMat * 10000 > nguongNguyen * tong ? 'DO' : 'CAN_XAC_NHAN');
}

/**
 * xemTruocThayThe({ client | ketNoi, dirs, db, bcvh, ngay, tapFile, tmpDir, now, bimat, options })
 *  client: { list(thuMuc), get(duongDanTuXa, duongDanCucBo), end() } đã kết nối; HOẶC ketNoi: () => Promise<client> (gọi SAU khi kiểm đầu vào + khoá, để không kết nối vô ích).
 *  Hàm LUÔN gọi client.end() (kể cả khi lỗi). db: handle (có thể mở readonly). dirs: thư mục nguồn (SFTP_DIRS). tapFile: tên file được chọn (mặc định tất cả).
 *  options.dangDongBo: () => boolean (tiêm cho test). Ném XemTruocLoi (code ∈ MA_LOI) khi lỗi.
 */
async function xemTruocThayThe({ client = null, ketNoi = null, dirs = [], db, bcvh, ngay, tapFile = null, tmpDir = os.tmpdir(), now = () => new Date(), bimat = [], options = {} }) {
  let ketNoiXong = client;
  let giuCo = false;
  let thuMucTam = null;
  try {
    kiemTraDauVao({ bcvh, ngay, tapFile });
    const batDau = now();
    kiemTraKhoa(db, batDau, options);
    if (dangXemTruoc) throw new XemTruocLoi(MA_LOI.DANG_XEM_TRUOC, 'Đang có một bản xem trước khác chạy. Thử lại sau ít giây.');
    dangXemTruoc = true;
    giuCo = true;
    if (!Array.isArray(dirs) || !dirs.length) throw new XemTruocLoi(MA_LOI.CHUA_CAU_HINH_SFTP, 'Chưa có thư mục nguồn SFTP (SFTP_DIRS)');

    const cu = docPhiaDb(db, bcvh, ngay);

    // ---- nguồn: liệt kê (mỗi thư mục; lỗi thì dừng, KHÔNG thử lại)
    if (!ketNoiXong) {
      if (typeof ketNoi !== 'function') throw new XemTruocLoi(MA_LOI.CHUA_CAU_HINH_SFTP, 'Chưa có kết nối nguồn SFTP');
      try { ketNoiXong = await ketNoi(); } catch (err) { throw loiNguon(err, bimat); }
    }
    const { khop, boQua, daThay, tongMuc } = await lietKeNguonCuaNgay(ketNoiXong, dirs, bcvh, ngay, bimat);

    const duocChon = tapFile === null ? null : new Set(tapFile);
    if (duocChon) for (const t of duocChon) if (!daThay.has(t)) throw new XemTruocLoi(MA_LOI.TAP_FILE_KHONG_HOP_LE, 'Tham số "tap_file" có tên không nằm trong các file của (BCVH, ngày) trên nguồn');

    // ---- tải các file được chọn (giữ NGUYÊN tên gốc), chuanBiFile (không db), XOÁ tệp tạm
    const tapNguon = [];
    const sanSang = []; // đối tượng đã chuẩn bị của file READY
    for (const f of khop) {
      const muc = { thu_muc: f.thuMuc, ten: f.name, kich_thuoc: f.size, mtime: f.mtime, chon_mac_dinh: true, chon: !duocChon || duocChon.has(f.name), ket_luan: 'KHONG_CHON', ly_do: null, sha256: null, so_dong: null, canh_bao: null };
      tapNguon.push(muc);
      if (!muc.chon) continue;
      if (f.size <= RONG_TOI_DA_BYTE) { muc.ket_luan = 'RONG'; muc.ly_do = `Kích thước ${f.size} byte (chỉ BOM / rỗng) — không tải`; continue; }
      let cucBo = null;
      try {
        if (!thuMucTam) thuMucTam = fs.mkdtempSync(path.join(tmpDir, 'hue-dhcl-xemtruoc-'));
        const ten = S.kiemTraTenTep(f.name);
        cucBo = path.join(thuMucTam, ten);
        await ketNoiXong.get(`${f.thuMuc.replace(/\/+$/, '')}/${ten}`, cucBo);
        const tai = fs.statSync(cucBo).size;
        if (tai !== f.size) throw Object.assign(new Error('Kích thước tải về khác danh sách'), { code: 'KICH_THUOC_LECH' });
        const d = await chuanBiFile(cucBo, { source: 'SFTP' });
        muc.sha256 = d.meta ? d.meta.sha256 : null;
        muc.so_dong = d.rowCount;
        muc.canh_bao = d.warning || null;
        if (d.ketLuan === 'READY') { muc.ket_luan = 'READY'; sanSang.push(d); }
        else if (d.ketLuan === 'EMPTY_FILE') { muc.ket_luan = 'EMPTY_FILE'; }
        else { muc.ket_luan = 'REJECTED'; muc.ly_do = S.lamSach(d.error || d.ketLuan, bimat); }
      } catch (err) {
        if (err instanceof XemTruocLoi) throw err;
        muc.ket_luan = 'REJECTED';
        muc.ly_do = `Không tải / đọc được: ${S.lamSach(String((err && err.code) || (err && err.name) || 'LOI'), bimat, 40)}`;
      } finally {
        if (cucBo) { try { fs.rmSync(cucBo, { force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
      }
    }

    // ---- so sánh (chỉ tập file đang chọn và READY)
    const ss = tinhSoSanh(db, cu, sanSang);
    const { moi, trungConLai, chiOCu, chiOMoi, chung, tyLeMat, theoNgayDen } = ss;
    const mucCanhBao = mucCanhBaoTheo(chiOCu.length, cu.shbg.size);
    let khongTheThay = false;
    let lyDoKhongTheThay = null;
    if (!sanSang.length) {
      khongTheThay = true;
      lyDoKhongTheThay = (cu.files.length === 0 && khop.length === 0) ? 'KHONG_CO_DU_LIEU' : 'KHONG_CO_FILE_HOP_LE';
    }

    return {
      bcvh, ngay, tao_luc: batDau.toISOString(),
      db: { tap_file: cu.files, tong_dong: cu.tongDong, dong_arrival_date_rong: cu.dongNgayRong, shbg_khac_nhau: cu.shbg.size },
      nguon: { thu_muc: dirs, tong_muc_liet_ke: tongMuc, bo_qua: boQua, tap_file: tapNguon },
      so_sanh: {
        dong_cu: cu.tongDong, dong_moi_sau_loc_trung: moi.dongSauLoc, dong_moi_trung_du_lieu_con_lai: trungConLai,
        shbg_cu: cu.shbg.size, shbg_moi: moi.shbg.size, shbg_chi_o_cu: chiOCu.length, shbg_chi_o_moi: chiOMoi.length, shbg_chung: chung, ty_le_mat: tyLeMat,
        theo_ngay_den: theoNgayDen, shbg_mau_chi_o_cu: chiOCu.slice(0, CF.SO_SHBG_MAU)
      },
      canh_bao: { muc: mucCanhBao, khoa_mac_dinh: chiOCu.length > 0, nguong_do: CF.NGUONG_MAT_SHBG_DO, khong_the_thay: khongTheThay, ly_do_khong_the_thay: lyDoKhongTheThay },
      phat: docPhiaPhat(db, bcvh, cu.shbg, moi.shbg),
      tap_file_nguon: tapNguon.filter((m) => m.ket_luan === 'READY').map((m) => ({ ten: m.ten, kich_thuoc: m.kich_thuoc, sha256: m.sha256 }))
    };
  } finally {
    if (thuMucTam) { try { fs.rmSync(thuMucTam, { recursive: true, force: true }); } catch (e) { /* tệp tạm: bỏ qua */ } }
    if (ketNoiXong && typeof ketNoiXong.end === 'function') { try { await ketNoiXong.end(); } catch (e) { /* đã đóng */ } }
    if (giuCo) dangXemTruoc = false;
  }
}

// ---- nguồn mặc định cho route (tiêm được để test): datNguon({ ketNoi, dirs }) hoặc datNguon(null) để dùng cấu hình môi trường
let nguonGhiDe = null;
function datNguon(n) { nguonGhiDe = n; }

/** Nguồn dùng cho route: bản tiêm (test) hoặc cấu hình môi trường SFTP_* (bắt buộc ghim vân tay). Ném XemTruocLoi CHUA_CAU_HINH_SFTP nếu thiếu. Nạp lớp kết nối nơi duy nhất ở đây. */
function layNguon(env = process.env) {
  if (nguonGhiDe) return nguonGhiDe;
  let cfg;
  try { cfg = F.docCauHinh(env, { showFingerprint: false }); } catch (err) {
    if (err instanceof F.CauHinhLoi) throw new XemTruocLoi(MA_LOI.CHUA_CAU_HINH_SFTP, err.message);
    throw err;
  }
  return { ketNoi: () => require('./sftpConnect').ketNoiSftp(cfg), dirs: cfg.dirs, bimat: [cfg.password, cfg.user] };
}

module.exports = {
  MA_LOI, HTTP, MA_THOAT, THOAT_THEO_LOI, XemTruocLoi, kiemTraDauVao, kiemTraKhoa, loiNguon, xemTruocThayThe, datNguon, layNguon, chuanHoaShbg,
  docPhiaDb, docPhiaPhat, lietKeNguonCuaNgay, tinhSoSanh, mucCanhBaoTheo, RONG_TOI_DA_BYTE
};
