#!/usr/bin/env node
// ==========================================
// SANLUONG-5c — Đồng bộ SFTP chạy TAY: liệt kê → chọn file CHƯA nạp và ĐÃ ỔN ĐỊNH → tải về thư mục tạm → nạp bằng importer → ghi «lượt lấy».
// Lõi: server/lib/sftpSync.js. Hướng dẫn: docs/ai/13_SFTP_SYNC.md. Chưa hẹn giờ (5e), chưa nạp lịch sử dài (5d).
//
//   node scripts/sftp-sync.js                                  CHẠY KHÔ (mặc định): in từng file sẽ làm gì; KHÔNG tải, KHÔNG nạp, KHÔNG ghi gì vào DB (DB mở chỉ-đọc).
//   node scripts/sftp-sync.js --chay-that [--toi-da=N] [--tu-ngay=yyyymmdd] [--on-dinh=GIÂY]   Tải + nạp thật (mặc định tối đa 5 file / lượt).
//
// Cấu hình qua biến môi trường (hoặc .env ở thư mục đang đứng): SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS, SFTP_HOSTKEY_SHA256 (BẮT BUỘC ghim),
// SFTP_SYNC_DAYS (mặc định 3), SFTP_STABLE_SECONDS (mặc định 60); ARRIVALS_DB (đường dẫn DB, mặc định data/hue-dhcl.db — cùng quy ước các script khác).
// Mã thoát: 0 = OK (kể cả không có gì để nạp) · 1 = có file lỗi · 2 = cấu hình / tham số / DB · 3 = mạng · 4 = xác thực · 5 = vân tay sai · 6 = thư mục · 7 = đang có lượt khác chạy.
// SFTP: CHỈ connect / list / get (tải xuống đường dẫn cục bộ) / end. Không in tên đăng nhập, mật khẩu, nội dung file, mã vận đơn.
// Script này là chỗ DUY NHẤT mở DB (theo cách scripts/import-arrivals.js: better-sqlite3 trực tiếp, không qua server/db.js).
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const SftpClient = require('ssh2-sftp-client');
const F = require('../server/lib/sftpFiles');
const S = require('../server/lib/sftpSync');
const { ensureArrivalSchema } = require('../server/lib/arrivalsImport');

try { process.loadEnvFile(); } catch (e) { /* không có .env: dùng biến môi trường hệ thống */ }

const KET_NOI_GIAY = 15;
const LIET_KE_GIAY = 30;
const TAI_GIAY = 180;
const log = (...a) => console.log(...a);
const loi = (...a) => console.error(...a);

const USAGE = `Cách dùng:
  node scripts/sftp-sync.js                         (chạy khô — không tải, không nạp, không ghi DB)
  node scripts/sftp-sync.js --chay-that [--toi-da=N] [--tu-ngay=yyyymmdd] [--on-dinh=GIÂY]
Biến môi trường: SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS, SFTP_HOSTKEY_SHA256, SFTP_SYNC_DAYS, SFTP_STABLE_SECONDS, ARRIVALS_DB (xem docs/ai/13_SFTP_SYNC.md)`;

function choToiDa(promise, giay, nhan) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`${nhan}: quá ${giay} giây`), { code: 'ETIMEDOUT' })), giay * 1000);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function moDb(chayThat) {
  const dbPath = path.resolve(process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new F.CauHinhLoi(`Không tìm thấy DB ${path.basename(dbPath)}. Chạy app một lần để tạo DB, hoặc đặt ARRIVALS_DB`);
  const db = new Database(dbPath, chayThat ? { fileMustExist: true } : { readonly: true, fileMustExist: true });
  const hasBase = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'arrival_import_files'").get();
  if (!hasBase) { db.close(); throw new F.CauHinhLoi('DB chưa có bảng arrival_import_files (hãy chạy app một lần để tạo schema).'); }
  if (chayThat) {
    db.pragma('busy_timeout = 30000'); // chờ tối đa 30 giây nếu máy chủ app đang ghi
    ensureArrivalSchema(db);
    S.ensureSftpSyncSchema(db);
  }
  return db;
}

async function main() {
  let args; let cfg; let sync;
  try {
    args = S.docThamSoSync(process.argv.slice(2));
    if (args.troGiup) { log(USAGE); return 0; }
    cfg = F.docCauHinh(process.env, { showFingerprint: false });
    sync = S.docCauHinhSync(process.env, args);
  } catch (err) {
    if (err instanceof F.CauHinhLoi) { loi(`LỖI [cau_hinh] ${err.message}`); loi(USAGE); return F.MA_THOAT.CAU_HINH; }
    throw err;
  }

  const bimat = [cfg.password, cfg.user]; // chỉ để CHE khỏi thông báo lỗi, không bao giờ in
  let db;
  try { db = moDb(args.chayThat); } catch (err) {
    if (err instanceof F.CauHinhLoi) { loi(`LỖI [cau_hinh] ${err.message}`); return F.MA_THOAT.CAU_HINH; }
    loi(`LỖI [db] Không mở được DB: ${S.lamSach(err && err.message, bimat)}`);
    return F.MA_THOAT.CAU_HINH;
  }

  const khoa = F.taoKiemTraKhoa(cfg.ghimHex);
  const sftp = new SftpClient('sanluong-5c-sync');
  try {
    log(args.chayThat ? 'CHẠY THẬT: sẽ tải và nạp file chưa có.' : 'CHẠY KHÔ: không tải, không nạp, không ghi DB (thêm --chay-that để nạp thật).');
    log(`Kết nối ${cfg.host}:${cfg.port} (${cfg.dirs.length} thư mục; vân tay máy chủ được ghim)…`);
    try {
      await choToiDa(sftp.connect({
        host: cfg.host, port: cfg.port, username: cfg.user, password: cfg.password,
        readyTimeout: KET_NOI_GIAY * 1000, hostVerifier: khoa.kiemTra
      }), KET_NOI_GIAY + 5, 'Kết nối');
    } catch (err) {
      const sai = khoa.trangThai.khop === false;
      if (sai) log(`  vân tay máy chủ thực tế: ${khoa.trangThai.vanTay.sha256}`);
      const p = F.phanLoaiLoi(err, { saiVanTay: sai });
      loi(`LỖI [${p.nhom}] ${p.thongBao}`);
      if (p.nhom === 'khac' || p.nhom === 'mang') loi(`  chi tiết: ${S.lamSach(err && err.message, bimat)}`);
      return p.ma;
    }
    log(`Đã kết nối; vân tay khớp (${khoa.trangThai.vanTay.sha256}).`);

    // Giao diện tối thiểu cho lõi: chỉ list và get (tải xuống ĐƯỜNG DẪN CỤC BỘ). Không có thao tác ghi nào trên SFTP.
    const client = {
      list: (dir) => choToiDa(sftp.list(dir), LIET_KE_GIAY, `Liệt kê ${F.tenAnToan(dir, 60)}`),
      get: (xa, cucBo) => choToiDa(sftp.get(xa, cucBo), TAI_GIAY, 'Tải file')
    };
    log(`Từ ngày: ${args.tuNgay || S.congNgay(S.ngayBangkok(new Date()), -sync.soNgay)} (mặc định hôm nay trừ ${sync.soNgay} ngày, giờ Bangkok) · chờ ổn định ${sync.onDinhGiay} giây · tối đa ${sync.toiDa} file/lượt\n`);

    const kq = await S.syncSftpOnce({
      client, db, dirs: cfg.dirs,
      options: { dryRun: !args.chayThat, tuNgay: sync.tuNgay, soNgay: sync.soNgay, onDinhGiay: sync.onDinhGiay, toiDa: sync.toiDa, trigger: 'MANUAL', bimat, log: (m) => log(`  ${m}`) }
    });

    if (kq.biKhoa) { loi(`Đang có lượt khác chạy (lượt #${kq.luotDangChay}, bắt đầu cách đây < ${S.KHOA_PHUT} phút). Không bắt đầu lượt mới.`); return 7; }
    if (kq.luotDangChay) log(`Lưu ý: đang có lượt thật #${kq.luotDangChay} chạy (chạy khô vẫn an toàn vì không ghi gì).`);
    for (const t of kq.loiThuMuc) loi(`LỖI [${t.nhom}] thư mục ${F.tenAnToan(t.thuMuc, 120)}: ${t.thongBao}`);
    if (kq.loiChung) loi(`LỖI lượt: ${kq.loiChung}`);
    const d = kq.dem;
    log(`\nTổng kết${kq.runId ? ` (lượt #${kq.runId})` : ' (chạy khô, không ghi lượt)'}: liệt kê ${d.tongListKe} mục · ${args.chayThat ? `đã nạp ${d.daNap}` : `sẽ nạp ${d.wouldImport}`} · đã có ${d.daCo} · chưa ổn định ${d.chuaOnDinh} · rỗng ${d.rong} · bỏ qua ${d.boQuaKhac} · lỗi ${d.loi}`);
    const ma = S.maThoat(kq);
    log(ma === 0 ? 'HOÀN TẤT: không có lỗi.' : `HOÀN TẤT: có lỗi (mã thoát ${ma}).`);
    return ma;
  } finally {
    try { await choToiDa(sftp.end(), 5, 'Đóng kết nối'); } catch (e) { /* đã đóng */ }
    try { db.close(); } catch (e) { /* đã đóng */ }
  }
}

main()
  .then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 3000).unref(); })
  .catch((err) => { loi(`[sftp-sync] Lỗi không lường trước: ${F.tenAnToan(err && err.message, 200)}`); process.exitCode = F.MA_THOAT.KHAC; setTimeout(() => process.exit(F.MA_THOAT.KHAC), 1000).unref(); });
