#!/usr/bin/env node
// ==========================================
// SANLUONG-5b — Thử kết nối SFTP CHỈ ĐỌC (docs/ai/12_SFTP_PROBE.md). KHÔNG tải file, KHÔNG nạp, KHÔNG mở DB, KHÔNG ghi gì lên máy chủ SFTP.
//
//   node scripts/sftp-probe.js --show-fingerprint            In vân tay khoá máy chủ rồi thoát (KHÔNG gửi tên đăng nhập / mật khẩu).
//   node scripts/sftp-probe.js [--gioi-han=N] [--on-dinh[=GIÂY]]   Liệt kê các thư mục trong SFTP_DIRS (tên, kích thước, mtime).
//
// Cấu hình CHỈ qua biến môi trường (hoặc file .env ở thư mục đang đứng, nạp bằng process.loadEnvFile như server/index.js):
//   SFTP_HOST, SFTP_PORT (mặc định 22), SFTP_USER, SFTP_PASSWORD, SFTP_DIRS (cách nhau dấu phẩy), SFTP_HOSTKEY_SHA256 (vân tay để ghim).
// Mã thoát: 0 = OK · 1 = lỗi khác · 2 = thiếu/sai cấu hình hoặc tham số · 3 = mạng · 4 = xác thực · 5 = vân tay sai · 6 = thư mục không có / không đọc được.
// CHỈ dùng các thao tác đọc của thư viện: connect, list, end. Không in mật khẩu / tên đăng nhập.
// ==========================================
'use strict';
const SftpClient = require('ssh2-sftp-client');
const F = require('../server/lib/sftpFiles');

try { process.loadEnvFile(); } catch (e) { /* không có .env: dùng biến môi trường hệ thống */ }

const KET_NOI_GIAY = 15;
const LIET_KE_GIAY = 30;
const log = (...a) => console.log(...a);
const loi = (...a) => console.error(...a);

const USAGE = `Cách dùng:
  node scripts/sftp-probe.js --show-fingerprint
  node scripts/sftp-probe.js [--gioi-han=N] [--on-dinh[=GIÂY]]
Biến môi trường: SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS, SFTP_HOSTKEY_SHA256 (xem docs/ai/12_SFTP_PROBE.md)`;

function choToiDa(promise, giay, nhan) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`${nhan}: quá ${giay} giây`), { code: 'ETIMEDOUT' })), giay * 1000);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
const ngu = (giay) => new Promise((r) => setTimeout(r, giay * 1000));

function inLoi(err, cfg, opts) {
  const p = F.phanLoaiLoi(err, opts);
  const chiTiet = F.anBiMat(err && err.message, [cfg && cfg.password, cfg && cfg.user]);
  loi(`LỖI [${p.nhom}] ${p.thongBao}`);
  if (p.nhom === 'khac' || p.nhom === 'thu_muc' || p.nhom === 'mang') loi(`  chi tiết: ${F.tenAnToan(chiTiet, 200)}`);
  return p.ma;
}

async function chayFingerprint(cfg) {
  log(`Kết nối ${cfg.host}:${cfg.port} để đọc vân tay khoá máy chủ (không gửi tên đăng nhập / mật khẩu)…`);
  const khoa = F.taoKiemTraKhoa(null); // luôn từ chối khoá -> ssh2 ngắt TRƯỚC bước xác thực. `username` chỉ là chuỗi giữ chỗ do ssh2 bắt buộc có; không bao giờ được gửi, và không có mật khẩu
  const sftp = new SftpClient('sanluong-5b-fingerprint');
  try {
    await choToiDa(sftp.connect({ host: cfg.host, port: cfg.port, username: 'khong-gui-di', readyTimeout: KET_NOI_GIAY * 1000, hostVerifier: khoa.kiemTra }), KET_NOI_GIAY + 5, 'Kết nối');
  } catch (err) {
    if (!khoa.trangThai.vanTay) return inLoi(err, cfg, {});
  } finally {
    try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ }
  }
  const v = khoa.trangThai.vanTay;
  log('Vân tay SHA256 của khoá máy chủ (thông tin công khai):');
  log(`  ${v.sha256}`);
  log(`  hex: ${v.hex}`);
  log('Hãy đối chiếu vân tay này với người quản trị NAS (nguồn đáng tin) trước khi ghim: lần đầu chưa có gì để so, đường mạng không an toàn có thể bị giả mạo.');
  log('Đúng rồi thì đặt SFTP_HOSTKEY_SHA256 bằng MỘT trong hai dạng trên rồi chạy lại không có --show-fingerprint.');
  return F.MA_THOAT.OK;
}

function inThuMuc(dir, kq, gioiHan) {
  const t = F.tomTat(kq.khop);
  log(`\n[${F.tenAnToan(dir, 120)}]`);
  log(`  file khớp mẫu HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv: ${t.soFile}`);
  if (t.moiNhat) {
    log(`  mới nhất (theo tên): ${t.moiNhat.name}  ${F.dinhDangDungLuong(t.moiNhat.size)}  mtime ${F.dinhDangMtime(t.moiNhat.mtime)}`);
    log(`  cũ nhất  (theo tên): ${t.cuNhat.name}  mtime ${F.dinhDangMtime(t.cuNhat.mtime)}`);
  }
  log(`  file ≤ 3 KB (có thể chỉ có tiêu đề / BOM): ${t.soFileNho}`);
  if (kq.canhBao.khacMaThuMuc) log(`  CẢNH BÁO: ${kq.canhBao.khacMaThuMuc} file có mã đơn vị khác mã trong tên thư mục`);
  if (kq.canhBao.ngayKhongHopLe) log(`  CẢNH BÁO: ${kq.canhBao.ngayKhongHopLe} file khớp mẫu nhưng ngày/giờ trong tên không hợp lệ`);
  log(`  mục bị bỏ qua: ${kq.boQua.tong} (#recycle ${kq.boQua.theoLyDo.recycle}, tên bắt đầu bằng "." ${kq.boQua.theoLyDo.an}, không phải file thường ${kq.boQua.theoLyDo.khong_phai_file}, tên không khớp mẫu ${kq.boQua.theoLyDo.khac_mau})`);
  if (kq.boQua.tenMau.length) log(`    ví dụ (tối đa 5): ${kq.boQua.tenMau.join(' | ')}`);
  const sx = [...kq.khop].sort((a, b) => (a.khoa < b.khoa ? 1 : a.khoa > b.khoa ? -1 : 0)); // mới nhất trước
  const hien = gioiHan > 0 ? sx.slice(0, gioiHan) : sx;
  if (hien.length) {
    log(`  danh sách ${hien.length}/${sx.length} file${gioiHan > 0 && sx.length > gioiHan ? ` mới nhất (đổi bằng --gioi-han=N, 0 = tất cả)` : ''}:`);
    for (const f of hien) log(`    ${f.name}  ${String(f.size).padStart(10)} B  ${F.dinhDangMtime(f.mtime)}`);
  }
}

async function chayThuong(cfg, args) {
  const khoa = F.taoKiemTraKhoa(cfg.ghimHex);
  const sftp = new SftpClient('sanluong-5b-probe');
  log(`Kết nối ${cfg.host}:${cfg.port} (${cfg.dirs.length} thư mục cần liệt kê; vân tay máy chủ được ghim)…`);
  try {
    await choToiDa(sftp.connect({
      host: cfg.host, port: cfg.port, username: cfg.user, password: cfg.password,
      readyTimeout: KET_NOI_GIAY * 1000, hostVerifier: khoa.kiemTra
    }), KET_NOI_GIAY + 5, 'Kết nối');
  } catch (err) {
    const sai = khoa.trangThai.khop === false;
    if (sai) log(`  vân tay máy chủ thực tế: ${khoa.trangThai.vanTay.sha256}`);
    const ma = inLoi(err, { password: cfg.password, user: cfg.user }, { saiVanTay: sai });
    try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ }
    return ma;
  }
  log(`Đã kết nối; vân tay khớp (${khoa.trangThai.vanTay.sha256}).`);

  let maLoi = F.MA_THOAT.OK;
  const lanDau = new Map();
  try {
    for (const dir of cfg.dirs) {
      try {
        const entries = await choToiDa(sftp.list(dir), LIET_KE_GIAY, `Liệt kê ${F.tenAnToan(dir, 60)}`);
        const kq = F.locMuc(entries, dir);
        lanDau.set(dir, kq.khop);
        inThuMuc(dir, kq, args.gioiHan);
      } catch (err) {
        log(`\n[${F.tenAnToan(dir, 120)}]`);
        const ma = inLoi(err, { password: cfg.password, user: cfg.user }, {});
        if (maLoi === F.MA_THOAT.OK) maLoi = ma;
      }
    }

    if (args.onDinhGiay && lanDau.size) {
      log(`\nKiểm tra «file ổn định»: chờ ${args.onDinhGiay} giây rồi liệt kê lại…`);
      await ngu(args.onDinhGiay);
      for (const [dir, truoc] of lanDau) {
        try {
          const kq = F.locMuc(await choToiDa(sftp.list(dir), LIET_KE_GIAY, 'Liệt kê lần 2'), dir);
          const r = F.fileOnDinh(truoc, kq.khop, { khoangGiay: args.onDinhGiay, toiThieuGiay: args.onDinhGiay });
          log(`  [${F.tenAnToan(dir, 120)}] ổn định ${r.onDinh.length}, chưa ổn định ${r.chuaOnDinh.length} (mới xuất hiện ${r.moiXuatHien.length}), biến mất ${r.bienMat.length}`);
          for (const c of r.chuaOnDinh.slice(0, 5)) log(`    chưa ổn định: ${F.tenAnToan(c.name)} (${c.lyDo})`);
        } catch (err) {
          const ma = inLoi(err, { password: cfg.password, user: cfg.user }, {});
          if (maLoi === F.MA_THOAT.OK) maLoi = ma;
        }
      }
    }
  } finally {
    try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ }
  }
  log(maLoi === F.MA_THOAT.OK ? '\nHOÀN TẤT: không có lỗi.' : `\nHOÀN TẤT: có lỗi (mã thoát ${maLoi}).`);
  return maLoi;
}

async function main() {
  let args;
  let cfg;
  try {
    args = F.docThamSo(process.argv.slice(2));
    if (args.troGiup) { log(USAGE); return F.MA_THOAT.OK; }
    cfg = F.docCauHinh(process.env, { showFingerprint: args.showFingerprint });
  } catch (err) {
    if (err instanceof F.CauHinhLoi) { loi(`LỖI [cau_hinh] ${err.message}`); loi(USAGE); return F.MA_THOAT.CAU_HINH; }
    throw err;
  }
  return args.showFingerprint ? chayFingerprint(cfg) : chayThuong(cfg, args);
}

main()
  .then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 3000).unref(); })
  .catch((err) => { loi(`[sftp-probe] Lỗi không lường trước: ${F.tenAnToan(err && err.message, 200)}`); process.exitCode = F.MA_THOAT.KHAC; setTimeout(() => process.exit(F.MA_THOAT.KHAC), 1000).unref(); });
