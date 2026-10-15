#!/usr/bin/env node
// ==========================================
// SANLUONG-5g-3 — «Thay thế ngày của một BCVH»: xóa dữ liệu ĐÃ NẠP của (BCVH, ngày trong TÊN FILE) rồi nạp lại từ các file trên nguồn SFTP, NGUYÊN KHỐI.
// Lõi: server/lib/thayTheThucHien.js. Hướng dẫn: docs/ai/16_THAY_THE_NGAY_THUC_HIEN.md. Nguồn SFTP chỉ ĐỌC (list / get / end).
//
//   node scripts/thay-the-ngay.js --bcvh=533140 --ngay=2026-10-10 [--chi-lay=<tên file>,<tên file>]
//        CHẠY KHÔ (mặc định): tải + kiểm file, in so sánh và «mất thật»; DB mở CHỈ-ĐỌC; KHÔNG khoá, KHÔNG sao lưu, KHÔNG thay gì.
//   node scripts/thay-the-ngay.js --bcvh=533140 --ngay=2026-10-10 --chay-that --xac-nhan=533140:2026-10-10 [--dong-y-mat] [--chi-lay=…]
//        CHẠY THẬT: cần CẢ BA: --chay-that, --xac-nhan=<mã>:<yyyy-mm-dd> (khớp --bcvh / --ngay), và --dong-y-mat nếu «mất thật» > 0.
//
// "Ngày" = ngày trong TÊN FILE (file_date). --chi-lay: chỉ dùng các file này của (BCVH, ngày) trên nguồn (mặc định: tất cả).
// Cấu hình qua biến môi trường (hoặc .env ở thư mục đang đứng): SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS, SFTP_HOSTKEY_SHA256 (BẮT BUỘC ghim); ARRIVALS_DB (đường dẫn DB).
// Sao lưu: <thư mục chứa DB>/backups/ (mặc định data/backups/), giữ 5 bản gần nhất.
// Mã thoát: 0 xong · 1 lỗi khác · 2 cấu hình / DB · 3 mạng · 4 xác thực · 5 vân tay · 6 thư mục · 7 đang có lượt đồng bộ / lần thay khác · 8 tham số / xác nhận sai
//   · 9 cần --dong-y-mat (mất thật > 0) · 10 nguồn đã đổi so với lần kiểm đầu · 11 sao lưu lỗi (hoặc không đủ chỗ).
// KHÔNG in tên đăng nhập / mật khẩu / nội dung file / SHBG. Script này là chỗ DUY NHẤT (cùng route) nạp lớp kết nối SFTP và mở DB ở chế độ GHI (chỉ khi --chay-that).
// ==========================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const F = require('../server/lib/sftpFiles');
const S = require('../server/lib/sftpSync');
const T = require('../server/lib/thayTheThucHien');
const { ketNoiSftp } = require('../server/lib/sftpConnect');
const { ensureArrivalSchema } = require('../server/lib/arrivalsImport');

try { process.loadEnvFile(); } catch (e) { /* không có .env: dùng biến môi trường hệ thống */ }

const log = (...a) => console.log(...a);
const loi = (...a) => console.error(...a);
const USAGE = `Cách dùng:
  node scripts/thay-the-ngay.js --bcvh=<mã> --ngay=<yyyy-mm-dd> [--chi-lay=<tên file>,<tên file>]                       (chạy khô — mặc định)
  node scripts/thay-the-ngay.js --bcvh=<mã> --ngay=<yyyy-mm-dd> --chay-that --xac-nhan=<mã>:<yyyy-mm-dd> [--dong-y-mat] [--chi-lay=…]   (thay thật)`;

function docThamSo(argv) {
  const out = { bcvh: null, ngay: null, chiLay: null, chayThat: false, xacNhan: null, dongYMat: false };
  for (const a of argv) {
    let m;
    if ((m = /^--bcvh=(.*)$/.exec(a))) out.bcvh = m[1];
    else if ((m = /^--ngay=(.*)$/.exec(a))) out.ngay = m[1];
    else if ((m = /^--chi-lay=(.*)$/.exec(a))) out.chiLay = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--chay-that') out.chayThat = true;
    else if (a === '--dong-y-mat') out.dongYMat = true;
    else if ((m = /^--xac-nhan=(\d+):(\d{4}-\d{2}-\d{2})$/.exec(a))) out.xacNhan = { ma_bcvh: m[1], ngay: m[2] };
    else throw new T.ThayTheLoi(T.MA_LOI.THAM_SO_SAI, `Tuỳ chọn không hỗ trợ hoặc sai dạng: ${F.tenAnToan(a, 40)}`);
  }
  if (out.chiLay && !out.chiLay.length) throw new T.ThayTheLoi(T.MA_LOI.TAP_FILE_KHONG_HOP_LE, '--chi-lay cần ít nhất một tên file');
  const X = require('../server/lib/thayTheXemTruoc');
  X.kiemTraDauVao({ bcvh: out.bcvh, ngay: out.ngay, tapFile: out.chiLay });
  if (out.chayThat) T.kiemTraXacNhan(out.xacNhan, out.bcvh, out.ngay); // chạy thật phải gõ lại đúng mã và ngày
  return out;
}

function duongDanDb() {
  return path.resolve(process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
}

function moDb(chayThat) {
  const dbPath = duongDanDb();
  if (!fs.existsSync(dbPath)) throw new F.CauHinhLoi(`Không tìm thấy DB ${path.basename(dbPath)}. Đặt ARRIVALS_DB hoặc chạy app một lần để tạo DB`);
  const db = new Database(dbPath, chayThat ? { fileMustExist: true } : { readonly: true, fileMustExist: true });
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'arrival_import_files'").get()) { db.close(); throw new F.CauHinhLoi('DB chưa có bảng arrival_import_files'); }
  if (chayThat) {
    db.pragma('busy_timeout = 30000'); // chờ tối đa 30 giây nếu máy chủ app đang ghi
    ensureArrivalSchema(db);
    S.ensureSftpSyncSchema(db);
    T.ensureThayTheSchema(db);
  }
  return db;
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;

function inTomTat(kq) {
  log(`\n== ${kq.chay_kho ? 'CHẠY KHÔ (chưa thay gì)' : 'ĐÃ THAY THẾ'}: BCVH ${kq.bcvh}, ngày trong tên file ${kq.ngay} ==`);
  log('\n[Dữ liệu đang có trong DB — mọi file có unit_code = BCVH và file_date = ngày]');
  if (!kq.db.tap_file.length) log('  (không có file nào)');
  for (const f of kq.db.tap_file) log(`  #${f.id}  ${f.file_name}  nguồn ${f.source}  trạng thái ${f.status}  ghi nhận ${f.row_count} dòng, thực có ${f.so_dong_thuc} dòng`);
  log(`  tổng ${kq.db.tong_dong} dòng · ${kq.db.shbg_khac_nhau} SHBG khác nhau`);
  log(`\n[Tập file nguồn dùng để thay — ${kq.tap_file_nguon.length} file dùng được${kq.tap_file_rong.length ? `, ${kq.tap_file_rong.length} file rỗng/BOM` : ''}]`);
  for (const f of kq.tap_file_nguon) log(`  ${f.ten}  ${f.kich_thuoc} byte  ${f.so_dong} dòng  sha256 ${f.sha256.slice(0, 12)}…`);
  const s = kq.so_sanh;
  log('\n[So sánh]');
  log(`  dòng: cũ ${s.dong_cu} → mới ${s.dong_moi_sau_loc_trung} (sau khi lọc trùng; ${s.dong_moi_trung_du_lieu_con_lai} dòng trùng dữ liệu còn lại sẽ bị bỏ qua)`);
  log(`  SHBG: cũ ${s.shbg_cu} · mới ${s.shbg_moi}`);
  log(`  MẤT THẬT ${s.shbg_mat_that} (${pct(s.ty_le_mat_that)}) — chỉ ở dữ liệu cũ và không còn ở file ngoài tập; mức CẬN TRÊN (xem trước 5g-2) ${s.shbg_mat_can_tren} (${pct(s.ty_le_mat_can_tren)})`);
  const c = kq.canh_bao;
  log(`[Cảnh báo] mức ${c.muc}${c.muc === 'DO' ? ` (ĐỎ: mất thật > ${pct(c.nguong_do)})` : ''} · cần --dong-y-mat: ${c.can_dong_y_mat ? 'CÓ' : 'không'}`);
  const p = kq.phat;
  log(`[Trạng thái phát] SHBG của BCVH có trạng thái trong tập bị xóa: ${p.so_shbg_co_trang_thai} (còn sau khi thay ${p.con_o_ban_moi}, không còn ${p.khong_con}) — KHÔNG xóa, tự nối lại theo (BCVH, SHBG)`);
  if (!kq.chay_kho) {
    log(`\n[Kết quả] xóa ${kq.so_dong_xoa} dòng / ${kq.so_file_xoa} bản ghi file · nạp ${kq.so_dong_nap} dòng / ${kq.so_file_nap} file · nhật ký #${kq.nhat_ky_id}`);
    log(`  sao lưu: ${kq.sao_luu.duong_dan} (${Math.round(kq.sao_luu.kich_thuoc / 1048576)} MB); thùng rác giữ đến ${kq.thung_rac.het_han_luc}`);
    log(`  dọn: thùng rác quá hạn ${kq.da_don.thung_rac.mua} mẻ, sao lưu cũ ${kq.da_don.sao_luu} bản${kq.da_don.loi.length ? ` (lỗi dọn: ${kq.da_don.loi.join(', ')})` : ''}`);
  }
}

async function main() {
  let tham; let cfg; let db;
  try {
    tham = docThamSo(process.argv.slice(2));
    cfg = F.docCauHinh(process.env, { showFingerprint: false });
    db = moDb(tham.chayThat);
  } catch (err) {
    if (err instanceof T.ThayTheLoi || err.code === 'THAM_SO_SAI' || err.code === 'TAP_FILE_KHONG_HOP_LE') { loi(`LỖI [${err.code}] ${err.message}`); loi(USAGE); return T.MA_THOAT.THAM_SO; }
    if (err instanceof F.CauHinhLoi) { loi(`LỖI [cau_hinh] ${err.message}`); return T.MA_THOAT.CAU_HINH; }
    loi(`LỖI [db] ${F.tenAnToan(err && err.message, 160)}`);
    return T.MA_THOAT.CAU_HINH;
  }
  const chung = { ketNoi: () => ketNoiSftp(cfg), dirs: cfg.dirs, db, bcvh: tham.bcvh, ngay: tham.ngay, tapFile: tham.chiLay, bimat: [cfg.password, cfg.user] };
  try {
    log(`Kết nối ${cfg.host}:${cfg.port} (vân tay máy chủ được ghim) — ${tham.chayThat ? 'THAY THẬT' : 'chạy khô'} BCVH ${tham.bcvh}, ngày ${tham.ngay}…`);
    const kho = await T.thayTheNgay({ ...chung, options: { chayKho: true } });
    inTomTat(kho);
    if (!tham.chayThat) {
      log('\nĐây là CHẠY KHÔ: chưa khoá, chưa sao lưu, chưa xóa, chưa nạp. Muốn thay thật, thêm: --chay-that --xac-nhan=' + `${tham.bcvh}:${tham.ngay}` + (kho.canh_bao.can_dong_y_mat ? ' --dong-y-mat' : ''));
      return T.MA_THOAT.OK;
    }
    if (kho.canh_bao.can_dong_y_mat && !tham.dongYMat) {
      loi(`LỖI [CAN_DONG_Y_MAT_DU_LIEU] Việc thay sẽ làm MẤT ${kho.so_sanh.shbg_mat_that} SHBG. Cần thêm --dong-y-mat để đồng ý. CHƯA thay gì.`);
      return T.MA_THOAT.CAN_DONG_Y;
    }
    log('\nBắt đầu thay thế thật (tải lại nguồn, so mã băm với lần kiểm trên, sao lưu, rồi xóa + nạp trong MỘT giao dịch)…');
    const kq = await T.thayTheNgay({
      ...chung, tapFileNguonDuKien: kho.tap_file_nguon.map((x) => ({ ten: x.ten, sha256: x.sha256 })), xacNhan: tham.xacNhan, dongYMat: tham.dongYMat,
      nguoiThucHien: `script:${(() => { try { return os.userInfo().username; } catch (e) { return 'khong-ro'; } })()}`, sauLuuDir: path.join(path.dirname(duongDanDb()), 'backups')
    });
    inTomTat(kq);
    return T.MA_THOAT.OK;
  } catch (err) {
    if (err instanceof T.ThayTheLoi || (err && err.code && T.THOAT_THEO_LOI[err.code] !== undefined && err.httpStatus)) {
      loi(`LỖI [${err.code}] ${err.message}`);
      return T.THOAT_THEO_LOI[err.code] ?? T.MA_THOAT.KHAC;
    }
    loi(`LỖI [khac] ${F.tenAnToan(err && err.message, 160)}`);
    return T.MA_THOAT.KHAC;
  } finally {
    try { db.close(); } catch (e) { /* đã đóng */ }
  }
}

main()
  .then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 3000).unref(); })
  .catch((err) => { loi(`[thay-the-ngay] Lỗi không lường trước: ${F.tenAnToan(err && err.message, 200)}`); process.exitCode = 1; setTimeout(() => process.exit(1), 1000).unref(); });
