// ==========================================
// SANLUONG-5b: các HÀM THUẦN (không mạng, không DB, không đọc file) cho công cụ thử kết nối SFTP chỉ đọc (scripts/sftp-probe.js)
// và để SANLUONG-5c dùng lại: phân tích tên file nguồn, lọc danh sách thư mục, quy tắc «file ổn định», chuẩn hoá vân tay khoá máy chủ,
// đọc cấu hình từ biến môi trường, phân loại lỗi, che bí mật khỏi thông báo. KHÔNG require thư viện SFTP ở đây.
// Quyết định / bối cảnh: docs/ai/11_SFTP_AUDIT.md, docs/ai/12_SFTP_PROBE.md.
// ==========================================
'use strict';
const crypto = require('crypto');

// Giống FILE_NAME_RE của server/lib/arrivalsImport.js (một mẫu tên duy nhất cho cả hai nơi).
const FILE_NAME_RE = /^HangDen_(\d+)_(\d{8})_(\d{6})\.csv$/;
const NGUONG_FILE_NHO = 3 * 1024; // file ≤ 3 KB có thể chỉ có tiêu đề (hoặc chỉ BOM)
const THU_MUC_RAC = '#recycle';
const MAX_THU_MUC = 20;

// Mã thoát của scripts/sftp-probe.js
const MA_THOAT = Object.freeze({ OK: 0, KHAC: 1, CAU_HINH: 2, MANG: 3, XAC_THUC: 4, VAN_TAY: 5, THU_MUC: 6 });

class CauHinhLoi extends Error {
  constructor(message, thieu = []) {
    super(message);
    this.thieu = thieu; // TÊN các biến thiếu / sai (không bao giờ chứa giá trị)
  }
}

// ------------------------------------------
// Tên file
// ------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

function ngayGioHopLe(ymd, hms) {
  const y = +ymd.slice(0, 4); const mo = +ymd.slice(4, 6); const d = +ymd.slice(6, 8);
  const h = +hms.slice(0, 2); const mi = +hms.slice(2, 4); const s = +hms.slice(4, 6);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  return d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Tên file -> { maDonVi, ngay: 'YYYY-MM-DD', gio: 'HH:MM:SS', khoa: 'YYYYMMDDHHMMSS', ngayHopLe } | null nếu không đúng mẫu. */
function phanTichTen(ten) {
  const m = FILE_NAME_RE.exec(String(ten));
  if (!m) return null;
  const [, ma, ymd, hms] = m;
  return {
    maDonVi: ma,
    ngay: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    gio: `${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}`,
    khoa: ymd + hms,
    ngayHopLe: ngayGioHopLe(ymd, hms)
  };
}

/** Che ký tự điều khiển và cắt ngắn để in tên lạ ra màn hình an toàn. */
const tenAnToan = (s, max = 80) => String(s).replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, max);

/**
 * Lọc kết quả liệt kê MỘT thư mục. entries: [{ type: 'd' | '-' | 'l', name, size, modifyTime (ms) }] (dạng của ssh2-sftp-client.list).
 * Mã đơn vị lấy từ TÊN FILE; một thư mục có thể chứa file của nhiều mã (SANLUONG-5c-1) — tên thư mục `CSV_Report_<mã>` KHÔNG còn là điều kiện lọc.
 * Trả { khop: [{ name, size, mtime, maDonVi, ngay, gio, khoa, ngayHopLe }], boQua: { tong, theoLyDo, tenMau }, canhBao: { ngayKhongHopLe } }.
 * Bỏ qua: '#recycle', tên bắt đầu bằng '.', mục không phải file thường (thư mục con, liên kết), tên không khớp mẫu. tenMau tối đa 5 tên.
 */
function locMuc(entries) {
  const khop = [];
  const theoLyDo = { recycle: 0, an: 0, khong_phai_file: 0, khac_mau: 0 };
  const tenMau = [];
  const boQua = (ly, name) => { theoLyDo[ly]++; if (tenMau.length < 5) tenMau.push(tenAnToan(name)); };
  let ngayKhongHopLe = 0;
  for (const e of entries || []) {
    const name = String(e.name);
    if (name.toLowerCase() === THU_MUC_RAC) { boQua('recycle', name); continue; }
    if (name.startsWith('.')) { boQua('an', name); continue; }
    if (e.type !== '-') { boQua('khong_phai_file', name); continue; }
    const p = phanTichTen(name);
    if (!p) { boQua('khac_mau', name); continue; }
    if (!p.ngayHopLe) ngayKhongHopLe++;
    khop.push({ name, size: Number(e.size) || 0, mtime: Number(e.modifyTime) || 0, ...p });
  }
  const tong = Object.values(theoLyDo).reduce((a, b) => a + b, 0);
  return { khop, boQua: { tong, theoLyDo, tenMau }, canhBao: { ngayKhongHopLe } };
}

/** Tóm tắt danh sách file khớp: số file, mới nhất / cũ nhất theo (ngày, giờ) TRONG TÊN, số file ≤ 3 KB. */
function tomTat(khop) {
  if (!khop.length) return { soFile: 0, moiNhat: null, cuNhat: null, soFileNho: 0 };
  const sx = [...khop].sort((a, b) => (a.khoa < b.khoa ? -1 : a.khoa > b.khoa ? 1 : a.name < b.name ? -1 : 1));
  const pick = (f) => ({ name: f.name, size: f.size, mtime: f.mtime });
  return { soFile: khop.length, moiNhat: pick(sx[sx.length - 1]), cuNhat: pick(sx[0]), soFileNho: khop.filter((f) => f.size <= NGUONG_FILE_NHO).length };
}

/**
 * Thống kê file khớp mẫu THEO MÃ ĐƠN VỊ: [{ ma, soFile, laMa (true nếu mã không có trong maDaBiet), moiNhat: {name, mtime} | null }], sắp mã tăng dần.
 * maDaBiet: danh sách mã BCVH đã biết — mã đã biết nhưng không có file vẫn được liệt kê (soFile 0) để thấy BCVH nào chưa có file.
 */
function thongKeTheoMa(khop, maDaBiet = []) {
  const m = new Map(maDaBiet.map((ma) => [ma, []]));
  for (const f of khop) { if (!m.has(f.maDonVi)) m.set(f.maDonVi, []); m.get(f.maDonVi).push(f); }
  return [...m.entries()].sort(([a], [b]) => soSanhMa(a, b)).map(([ma, fs]) => ({
    ma, soFile: fs.length, laMa: !maDaBiet.includes(ma), moiNhat: fs.length ? tomTat(fs).moiNhat : null
  }));
}

/** So sánh mã đơn vị theo giá trị số (ngắn trước, cùng độ dài thì theo chữ). */
const soSanhMa = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------
// Quy tắc «file ổn định» (dùng lại cho 5c): một file chỉ được coi là ghi xong khi kích thước VÀ mtime không đổi
// giữa hai lần liệt kê cách nhau ít nhất `toiThieuGiay` giây. File mới xuất hiện ở lần sau thì chưa ổn định.
// lan1, lan2: [{ name, size, modifyTime | mtime }]. Nếu truyền khoangGiay (khoảng thời gian thực giữa hai lần) mà nhỏ hơn
// toiThieuGiay -> ném RangeError (tránh kết luận «ổn định» chỉ vì hai lần liệt kê sát nhau).
// ------------------------------------------
function fileOnDinh(lan1, lan2, { khoangGiay = null, toiThieuGiay = 0 } = {}) {
  if (khoangGiay !== null && khoangGiay < toiThieuGiay) throw new RangeError(`Hai lần liệt kê cách nhau ${khoangGiay} giây, cần ít nhất ${toiThieuGiay} giây`);
  const mt = (f) => Number(f.mtime ?? f.modifyTime) || 0;
  const truoc = new Map((lan1 || []).map((f) => [f.name, f]));
  const onDinh = [];
  const chuaOnDinh = [];
  const moiXuatHien = [];
  const sau = new Set();
  for (const f of lan2 || []) {
    sau.add(f.name);
    const a = truoc.get(f.name);
    if (!a) { moiXuatHien.push(f.name); chuaOnDinh.push({ name: f.name, lyDo: 'moi_xuat_hien' }); continue; }
    if (Number(a.size) !== Number(f.size)) chuaOnDinh.push({ name: f.name, lyDo: 'doi_kich_thuoc' });
    else if (mt(a) !== mt(f)) chuaOnDinh.push({ name: f.name, lyDo: 'doi_mtime' });
    else onDinh.push(f.name);
  }
  const bienMat = [...truoc.keys()].filter((n) => !sau.has(n));
  return { onDinh, chuaOnDinh, moiXuatHien, bienMat };
}

// ------------------------------------------
// Vân tay khoá máy chủ
// ------------------------------------------
/** Khoá công khai (Buffer, dạng dây của SSH) -> { sha256: 'SHA256:<base64 không đệm>', hex }. Giống `ssh-keygen -lf`. */
function tinhVanTay(keyBuf) {
  const d = crypto.createHash('sha256').update(keyBuf).digest();
  return { sha256: `SHA256:${d.toString('base64').replace(/=+$/, '')}`, hex: d.toString('hex') };
}

/**
 * Chuẩn hoá vân tay người dùng nhập về hex thường 64 ký tự. Nhận: `SHA256:<base64>` (có/không đệm '='), hex 64 ký tự
 * (có thể ngăn bằng ':' hoặc khoảng trắng, hoa/thường), kể cả `SHA256:` + hex. Dạng khác (MD5, sai độ dài) -> ném CauHinhLoi (không in lại giá trị).
 */
function chuanHoaVanTay(raw) {
  let s = String(raw ?? '').trim();
  if (!s) throw new CauHinhLoi('Vân tay trống');
  s = s.replace(/^sha256:/i, '').trim();
  const hex = s.replace(/[:\s]/g, '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return hex.toLowerCase();
  if (/^[A-Za-z0-9+/]{43}=?$/.test(s)) {
    const buf = Buffer.from(s, 'base64');
    if (buf.length === 32) return buf.toString('hex');
  }
  throw new CauHinhLoi(`Vân tay không đúng dạng (nhận "SHA256:<base64>" hoặc hex 64 ký tự; MD5 không được hỗ trợ). Độ dài đã nhập: ${s.length}`);
}

/**
 * Tạo hàm kiểm tra khoá máy chủ cho tuỳ chọn `hostVerifier` của ssh2 (gọi TRƯỚC bước xác thực nên mật khẩu chưa được gửi khi trả false).
 * ghimHex = null: chế độ chỉ xem vân tay (luôn từ chối, chỉ ghi lại vân tay). Có ghimHex: chỉ chấp nhận khi khớp.
 * Trả { kiemTra(keyBuf) -> boolean, trangThai: { vanTay, khop } }.
 */
function taoKiemTraKhoa(ghimHex = null) {
  const trangThai = { vanTay: null, khop: null };
  const kiemTra = (keyBuf) => {
    trangThai.vanTay = tinhVanTay(keyBuf);
    if (ghimHex === null) { trangThai.khop = null; return false; }
    trangThai.khop = trangThai.vanTay.hex === ghimHex;
    return trangThai.khop;
  };
  return { kiemTra, trangThai };
}

// ------------------------------------------
// Cấu hình từ biến môi trường (chỉ TÊN biến trong thông báo lỗi)
// ------------------------------------------
/**
 * env: process.env. showFingerprint: chỉ cần SFTP_HOST (+ SFTP_PORT). Chạy thường: bắt buộc SFTP_HOST, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS và
 * SFTP_HOSTKEY_SHA256 (chưa ghim -> không chạy; phải chạy --show-fingerprint trước). Ném CauHinhLoi { thieu: [tên biến] }.
 */
function docCauHinh(env, { showFingerprint = false } = {}) {
  const get = (k) => String(env[k] ?? '').trim();
  const thieu = [];
  const sai = [];
  const host = get('SFTP_HOST');
  if (!host) thieu.push('SFTP_HOST');
  let port = 22;
  if (get('SFTP_PORT')) {
    port = Number(get('SFTP_PORT'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) sai.push('SFTP_PORT');
  }
  const cfg = { host, port, user: null, password: null, dirs: [], ghimHex: null };
  if (!showFingerprint) {
    cfg.user = get('SFTP_USER');
    if (!cfg.user) thieu.push('SFTP_USER');
    cfg.password = String(env.SFTP_PASSWORD ?? ''); // không cắt khoảng trắng: mật khẩu có thể chứa khoảng trắng
    if (!cfg.password) thieu.push('SFTP_PASSWORD');
    cfg.dirs = [...new Set(get('SFTP_DIRS').split(',').map((d) => d.trim()).filter(Boolean))];
    if (!cfg.dirs.length) thieu.push('SFTP_DIRS');
    else if (cfg.dirs.length > MAX_THU_MUC || cfg.dirs.some((d) => /[\u0000-\u001f]/.test(d))) sai.push('SFTP_DIRS');
    if (!get('SFTP_HOSTKEY_SHA256')) thieu.push('SFTP_HOSTKEY_SHA256');
    else {
      try { cfg.ghimHex = chuanHoaVanTay(get('SFTP_HOSTKEY_SHA256')); } catch (e) { sai.push('SFTP_HOSTKEY_SHA256'); }
    }
  }
  if (thieu.length || sai.length) {
    const phan = [];
    if (thieu.length) phan.push(`thiếu biến: ${thieu.join(', ')}`);
    if (sai.length) phan.push(`giá trị không hợp lệ: ${sai.join(', ')}`);
    const goiY = thieu.includes('SFTP_HOSTKEY_SHA256') && !showFingerprint ? ' (chưa ghim vân tay: chạy với --show-fingerprint để lấy vân tay rồi đặt SFTP_HOSTKEY_SHA256)' : '';
    throw new CauHinhLoi(`Cấu hình ${phan.join('; ')}${goiY}`, [...thieu, ...sai]);
  }
  return cfg;
}

// ------------------------------------------
// Tham số dòng lệnh
// ------------------------------------------
/** argv (không gồm node + script) -> { showFingerprint, gioiHan, onDinhGiay, tro_giup }. Sai -> ném CauHinhLoi. */
function docThamSo(argv) {
  const out = { showFingerprint: false, gioiHan: 20, onDinhGiay: null, troGiup: false };
  for (const a of argv) {
    let m;
    if (a === '--show-fingerprint') out.showFingerprint = true;
    else if (a === '--help' || a === '-h') out.troGiup = true;
    else if ((m = /^--gioi-han=(\d+)$/.exec(a))) out.gioiHan = Number(m[1]); // 0 = in tất cả
    else if (a === '--on-dinh') out.onDinhGiay = 10;
    else if ((m = /^--on-dinh=(\d+)$/.exec(a))) {
      const n = Number(m[1]);
      if (n < 1 || n > 120) throw new CauHinhLoi('--on-dinh=<giây> phải từ 1 đến 120');
      out.onDinhGiay = n;
    } else throw new CauHinhLoi(`Tuỳ chọn không hỗ trợ: ${tenAnToan(a, 40)}`);
  }
  if (out.showFingerprint && out.onDinhGiay !== null) throw new CauHinhLoi('--on-dinh không dùng cùng --show-fingerprint');
  return out;
}

// ------------------------------------------
// Phân loại lỗi -> mã thoát
// ------------------------------------------
const MANG_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE', 'ECONNABORTED']);

/** err (Error của ssh2 / ssh2-sftp-client) -> { ma (mã thoát), nhom, thongBao }. saiVanTay: cờ do hostVerifier đặt (ưu tiên cao nhất). */
function phanLoaiLoi(err, { saiVanTay = false } = {}) {
  const msg = String((err && err.message) || err || '');
  const code = err && err.code;
  if (saiVanTay) return { ma: MA_THOAT.VAN_TAY, nhom: 'van_tay', thongBao: 'Vân tay khoá máy chủ KHÔNG khớp SFTP_HOSTKEY_SHA256 — đã ngắt trước khi gửi mật khẩu' };
  if (/authentication methods failed|ERR_BAD_AUTH|Authentication failed|All configured/i.test(msg) || code === 'ERR_BAD_AUTH') {
    return { ma: MA_THOAT.XAC_THUC, nhom: 'xac_thuc', thongBao: 'Xác thực thất bại (sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản không được phép dùng SFTP)' };
  }
  if (MANG_CODES.has(String(code)) || /timed out|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EAI_AGAIN|address lookup|refused|has reset|handshake/i.test(msg)) {
    return { ma: MA_THOAT.MANG, nhom: 'mang', thongBao: 'Lỗi mạng: không kết nối được (sai địa chỉ / cổng, tường lửa, máy chủ tắt, hoặc quá thời gian chờ)' };
  }
  if (code === 2 || code === 3 || code === 'ENOENT' || code === 'EACCES' || code === 'ERR_BAD_PATH' || /no such file|not exist|permission denied|ENOENT|EACCES/i.test(msg)) {
    const khongCo = code === 2 || code === 'ENOENT' || /no such file|not exist|ENOENT/i.test(msg);
    return { ma: MA_THOAT.THU_MUC, nhom: 'thu_muc', thongBao: khongCo ? 'Thư mục không tồn tại' : 'Không có quyền đọc thư mục' };
  }
  return { ma: MA_THOAT.KHAC, nhom: 'khac', thongBao: 'Lỗi khác' };
}

/** Xoá các chuỗi bí mật (mật khẩu, tên đăng nhập) khỏi một thông báo trước khi in. Bỏ qua bí mật quá ngắn (< 3 ký tự) để tránh che nhầm. */
function anBiMat(text, bimat = []) {
  let s = String(text ?? '');
  for (const b of bimat) if (b && String(b).length >= 3) s = s.split(String(b)).join('***');
  return s;
}

// ------------------------------------------
// Hiển thị
// ------------------------------------------
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/** mtime (ms từ epoch) -> 'YYYY-MM-DD HH:mm:ss' theo giờ Asia/Bangkok. 0 / không hợp lệ -> '?'. */
const dinhDangMtime = (ms) => (Number.isFinite(ms) && ms > 0 ? FMT.format(new Date(ms)).replace(/\s/g, ' ') : '?');
const dinhDangDungLuong = (b) => `${b.toLocaleString('en-US')} B (${(b / 1024).toFixed(1)} KB)`;

module.exports = {
  FILE_NAME_RE, NGUONG_FILE_NHO, MA_THOAT, MAX_THU_MUC, CauHinhLoi,
  phanTichTen, locMuc, tomTat, thongKeTheoMa, soSanhMa, fileOnDinh, tinhVanTay, chuanHoaVanTay, taoKiemTraKhoa, docCauHinh, docThamSo, phanLoaiLoi, anBiMat, tenAnToan,
  dinhDangMtime, dinhDangDungLuong, pad
};
