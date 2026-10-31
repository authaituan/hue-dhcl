// ==========================================
// «Hàng tại KTT» (KTT-17-1): nạp danh sách SHBG HÀNG HOÀN (bảng ItemReturn của CSDL BCCP) từ file CSV RIÊNG
//   KTT_HangHoan_<yyyymmdd>_<hhmmss>.csv  (cột SHBG, Nguon_xuat_luc; cột khác bị bỏ)  ->  ktt_hang_hoan
// Chỉ LƯU danh sách: KHÔNG dùng vào phân loại / chỉ số nào (phanLoaiShbg giữ nguyên; việc đổi quy tắc là KTT-17-2).
// CỘNG DỒN: SHBG đã vào là hàng hoàn, file mới không chứa SHBG cũ thì KHÔNG xóa. UPSERT theo Nguon_xuat_luc (mới ≥ cũ thì cập nhật, cũ hơn thì bỏ qua).
// Dùng lại lõi đọc CSV của kttImport.docFile (BOM, CRLF, nháy kép, lỗi chỉ ghi số dòng + tên cột + mã, không ghi giá trị). Nhật ký RIÊNG ktt_hang_hoan_nap
// (không đụng ktt_nap_lan / ktt_nap_cap). Không mạng; phần SFTP ở kttSftp.js. Tài liệu: docs/ai/39_KTT_NAP_SFTP.md mục «KTT-17-1».
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const I = require('./kttImport');
const { FILE_HANG_HOAN } = require('./kttSchema');

const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Tên file -> { khoa: 'yyyymmdd_hhmmss', nguon: 'YYYY-MM-DD HH:MM:SS' } | null (sai mẫu hoặc ngày giờ không có thật). */
function phanTichTenHangHoan(ten) {
  const m = FILE_HANG_HOAN.mauTen.exec(String(ten));
  if (!m) return null;
  const nguon = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}`;
  return I.giaTriGio(nguon) ? { khoa: `${m[1]}_${m[2]}`, nguon } : null;
}

/**
 * Nạp MỘT file. Trả { status: 'OK' | 'DA_NAP' | 'REJECTED' | 'SAI_TEN', dong, them, capNhat, boQua, loi, trung, loiMau, cotLa, sha256, ... }.
 *  - tên không đúng mẫu hoặc ngày giờ không có thật: SAI_TEN (không đọc file);
 *  - cùng sha256 với lần đã OK: DA_NAP (không đổi dữ liệu);
 *  - thiếu cột SHBG / Nguon_xuat_luc, cột trùng tên, CSV hỏng: REJECTED, hoàn tác cả file (ghi lại một dòng REJECTED trong nhật ký);
 *  - file 0 byte / chỉ BOM / chỉ tiêu đề: hợp lệ, 0 dòng (nguon_xuat_luc của lần nạp lấy từ tên file);
 *  - dòng SHBG rỗng / giờ sai định dạng: bỏ, đếm vào `loi` (mã KHOA_RONG / NGUON_XUAT_RONG / GIO_SAI_DINH_DANG, không kèm giá trị).
 * opts: { dryRun (chạy trong một giao dịch rồi hoàn tác), size, mtime (kích thước / mtime trên SFTP, lưu để không tải lại) }.
 */
function napHangHoan(db, filePath, opts = {}) {
  const cfg = FILE_HANG_HOAN;
  const fileName = path.basename(filePath);
  const ket = { loai: cfg.loai, fileName, status: 'OK', error: null, sha256: null, napLanId: null, dong: 0, them: 0, capNhat: 0, boQua: 0, loi: 0, trung: 0, khongCon: 0, loiMau: [], cotLa: [], cotTuyChonVang: [], dryRun: !!opts.dryRun, choPhepRong: true, rong: false, nguonXuat: null, gioMin: null, gioMax: null };
  const ten = phanTichTenHangHoan(fileName);
  if (!ten) return { ...ket, status: 'SAI_TEN', error: `Tên file không đúng mẫu ${cfg.mau}` };
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`Không tìm thấy file: ${filePath}`);
  if (opts.dryRun) return { ...I.chayThu(db, () => napHangHoan(db, filePath, { ...opts, dryRun: false })), dryRun: true };

  const size = opts.size ?? null;
  const mtime = opts.mtime ?? null;
  ket.sha256 = I.bamFile(filePath);
  const daNap = db.prepare("SELECT id FROM ktt_hang_hoan_nap WHERE sha256 = ? AND trang_thai = 'OK'").get(ket.sha256);
  if (daNap) {
    if (size !== null) db.prepare('UPDATE ktt_hang_hoan_nap SET size_file = ?, mtime_file = ? WHERE id = ?').run(size, mtime, daNap.id);
    return { ...ket, status: 'DA_NAP', napLanId: daNap.id };
  }
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO ktt_hang_hoan_nap (ten_file, sha256, nap_luc, trang_thai, size_file, mtime_file) VALUES (?, ?, ?, 'OK', ?, ?) ON CONFLICT(sha256) DO UPDATE SET ten_file = excluded.ten_file, nap_luc = excluded.nap_luc, trang_thai = 'OK', thong_bao = NULL, size_file = excluded.size_file, mtime_file = excluded.mtime_file")
        .run(fileName, ket.sha256, nowUtc(), size, mtime);
      ket.napLanId = db.prepare('SELECT id FROM ktt_hang_hoan_nap WHERE sha256 = ?').get(ket.sha256).id;
      I.docFile(db, cfg, filePath, ket.napLanId, ket);
      db.prepare('UPDATE ktt_hang_hoan_nap SET nguon_xuat_luc = ?, so_dong_doc = ?, so_dong_them = ?, so_dong_cap_nhat = ?, so_dong_bo_qua = ?, so_dong_loi = ?, so_dong_trung = ?, loi_mau = ? WHERE id = ?')
        .run(ket.nguonXuat || ten.nguon, ket.dong, ket.them, ket.capNhat, ket.boQua, ket.loi, ket.trung, ket.loiMau.length ? JSON.stringify(ket.loiMau) : null, ket.napLanId);
    })();
  } catch (e) {
    if (!(e instanceof I.KttFileError)) throw e;
    db.prepare("INSERT INTO ktt_hang_hoan_nap (ten_file, sha256, nap_luc, trang_thai, thong_bao, size_file, mtime_file) VALUES (?, ?, ?, 'REJECTED', ?, ?, ?) ON CONFLICT(sha256) DO UPDATE SET ten_file = excluded.ten_file, nap_luc = excluded.nap_luc, trang_thai = 'REJECTED', thong_bao = excluded.thong_bao, size_file = excluded.size_file, mtime_file = excluded.mtime_file")
      .run(fileName, ket.sha256, nowUtc(), e.message, size, mtime);
    return { ...ket, status: 'REJECTED', error: e.message, napLanId: null, dong: 0, them: 0, capNhat: 0, boQua: 0, loi: 0, trung: 0, nguonXuat: null, gioMin: null, gioMax: null, loiMau: [] };
  }
  return ket;
}

const importKttHangHoan = napHangHoan;

/**
 * Nạp một file hoặc mọi KTT_HangHoan_*.csv trong thư mục (theo thứ tự tên; file khác bị bỏ qua). opts.dryRun: cả lượt trong MỘT giao dịch rồi hoàn tác.
 */
function importHangHoanDuongDan(db, target, opts = {}) {
  if (!fs.existsSync(target)) throw new Error(`Không tìm thấy: ${target}`);
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((f) => /^KTT_HangHoan_.*\.csv$/i.test(f)).sort().map((f) => path.join(target, f))
    : [target];
  const chay = () => files.map((f) => napHangHoan(db, f, { ...opts, dryRun: false }));
  const kq = opts.dryRun ? I.chayThu(db, chay) : chay();
  return opts.dryRun ? kq.map((r) => ({ ...r, dryRun: true })) : kq;
}

/** Lần nạp ĐÃ XONG (OK hoặc REJECTED) của đúng tên file + kích thước + mtime trên SFTP: không cần tải lại. null nếu chưa có. */
function lanNapDaXong(db, ten, size, mtime) {
  return db.prepare("SELECT id, trang_thai FROM ktt_hang_hoan_nap WHERE ten_file = ? AND size_file = ? AND mtime_file = ? ORDER BY id DESC LIMIT 1").get(ten, size, mtime) || null;
}

/** Độ mới của danh sách: { nguon_xuat_luc, nap_luc } của lần nạp OK có nguon_xuat_luc lớn nhất, hoặc null nếu chưa nạp lần nào. */
function docDoMoiHangHoan(db) {
  return db.prepare("SELECT nguon_xuat_luc, nap_luc FROM ktt_hang_hoan_nap WHERE trang_thai = 'OK' AND nguon_xuat_luc IS NOT NULL ORDER BY nguon_xuat_luc DESC, id DESC LIMIT 1").get() || null;
}

/**
 * KTT-17-2: danh sách hàng hoàn cho MỘT lượt truy vấn: { set: Set(shbg), soDong, nguonXuatLuc (nguon_xuat_luc lớn nhất của danh sách | null), phienBan }.
 * Đọc MỘT lần (SELECT shbg, ~vài chục nghìn dòng, vài ms) rồi tra bằng Set.has từng SHBG: rẻ hơn JOIN / truy vấn từng dòng vào lượt duyệt SHBG vốn đã nặng, và hàm
 * phanLoaiShbg vẫn thuần (không DB). Bảng chưa có (DB cũ) = danh sách rỗng. `chiThongTin`: bỏ qua việc nạp Set (set rỗng), chỉ trả soDong / nguonXuatLuc / phienBan.
 */
function docDanhSachHangHoan(db, { chiThongTin = false } = {}) {
  const kq = { set: new Set(), soDong: 0, nguonXuatLuc: null, phienBan: '0.0.' };
  try {
    if (chiThongTin) kq.soDong = db.prepare('SELECT COUNT(*) AS n FROM ktt_hang_hoan').get().n; // chỉ cờ meta / phiên bản: không nạp Set
    else { for (const r of db.prepare('SELECT shbg FROM ktt_hang_hoan').iterate()) kq.set.add(r.shbg); kq.soDong = kq.set.size; }
    kq.nguonXuatLuc = db.prepare('SELECT MAX(nguon_xuat_luc) AS m FROM ktt_hang_hoan').get().m || null;
    kq.phienBan = phienBanHangHoan(db);
  } catch (e) { /* thiếu bảng: danh sách rỗng */ }
  return kq;
}

/** Phiên bản danh sách (vào khóa bộ nhớ đệm): id lần nạp OK lớn nhất . số dòng . lần cập nhật cuối. Đổi khi nạp thêm / cập nhật danh sách. */
function phienBanHangHoan(db) {
  try {
    const r = db.prepare("SELECT (SELECT COALESCE(MAX(id), 0) FROM ktt_hang_hoan_nap WHERE trang_thai = 'OK') AS a, COUNT(*) AS b, COALESCE(MAX(cap_nhat_luc), '') AS c FROM ktt_hang_hoan").get();
    return `${r.a}.${r.b}.${r.c}`;
  } catch (e) { return '0.0.'; }
}

/** Cờ meta của các API: { hang_hoan_chua_nap (danh sách rỗng: số hoàn = 0 không có nghĩa là «không có hàng hoàn»), hang_hoan_nguon_xuat_luc }. */
const metaHangHoan = (tt) => ({ hang_hoan_chua_nap: tt.soDong === 0, hang_hoan_nguon_xuat_luc: tt.nguonXuatLuc });

module.exports = { docDanhSachHangHoan, phienBanHangHoan, metaHangHoan, phanTichTenHangHoan, napHangHoan, importKttHangHoan, importHangHoanDuongDan, lanNapDaXong, docDoMoiHangHoan };
