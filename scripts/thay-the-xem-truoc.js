#!/usr/bin/env node
// ==========================================
// SANLUONG-5g-2 — XEM TRƯỚC «Thay thế ngày của một BCVH» (CHỈ ĐỌC). Không xoá, không nạp, không ghi DB (mở DB CHỈ-ĐỌC), không ghi lên nguồn SFTP.
// Lõi: server/lib/thayTheXemTruoc.js. Hướng dẫn: docs/ai/15_THAY_THE_NGAY_XEM_TRUOC.md.
//
//   node scripts/thay-the-xem-truoc.js --bcvh=533140 --ngay=2026-10-10 [--chi-lay=<tên file>,<tên file>]
//
// "Ngày" = ngày trong TÊN FILE (file_date). --chi-lay: chỉ dùng các file này của (BCVH, ngày) trên nguồn (mặc định: tất cả).
// Cấu hình qua biến môi trường (hoặc .env ở thư mục đang đứng): SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD, SFTP_DIRS, SFTP_HOSTKEY_SHA256 (BẮT BUỘC ghim); ARRIVALS_DB (đường dẫn DB).
// Mã thoát: 0 xong · 1 lỗi khác · 2 cấu hình / DB · 3 mạng · 4 xác thực · 5 vân tay · 6 thư mục · 7 đang có lượt đồng bộ khác · 8 tham số sai.
// KHÔNG in tên đăng nhập / mật khẩu / nội dung file; SHBG mẫu chỉ in 6 ký tự đầu. Script này là chỗ DUY NHẤT (cùng route) nạp lớp kết nối SFTP.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const F = require('../server/lib/sftpFiles');
const T = require('../server/lib/thayTheXemTruoc');
const { ketNoiSftp } = require('../server/lib/sftpConnect');

try { process.loadEnvFile(); } catch (e) { /* không có .env: dùng biến môi trường hệ thống */ }

const log = (...a) => console.log(...a);
const loi = (...a) => console.error(...a);
const USAGE = 'Cách dùng: node scripts/thay-the-xem-truoc.js --bcvh=<mã> --ngay=<yyyy-mm-dd> [--chi-lay=<tên file>,<tên file>]';

function docThamSo(argv) {
  const out = { bcvh: null, ngay: null, chiLay: null };
  for (const a of argv) {
    let m;
    if ((m = /^--bcvh=(.*)$/.exec(a))) out.bcvh = m[1];
    else if ((m = /^--ngay=(.*)$/.exec(a))) out.ngay = m[1];
    else if ((m = /^--chi-lay=(.*)$/.exec(a))) out.chiLay = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    else throw new T.XemTruocLoi(T.MA_LOI.THAM_SO_SAI, `Tuỳ chọn không hỗ trợ: ${F.tenAnToan(a, 40)}`);
  }
  if (out.chiLay && !out.chiLay.length) throw new T.XemTruocLoi(T.MA_LOI.TAP_FILE_KHONG_HOP_LE, '--chi-lay cần ít nhất một tên file');
  T.kiemTraDauVao({ bcvh: out.bcvh, ngay: out.ngay, tapFile: out.chiLay });
  return out;
}

function moDbChiDoc() {
  const dbPath = path.resolve(process.env.ARRIVALS_DB || path.join(__dirname, '..', 'data', 'hue-dhcl.db'));
  if (!fs.existsSync(dbPath)) throw new F.CauHinhLoi(`Không tìm thấy DB ${path.basename(dbPath)}. Đặt ARRIVALS_DB hoặc chạy app một lần để tạo DB`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'arrival_import_files'").get()) { db.close(); throw new F.CauHinhLoi('DB chưa có bảng arrival_import_files'); }
  return db;
}

const pct = (x) => `${(x * 100).toFixed(2)}%`;

function inKetQua(kq) {
  log(`\n== XEM TRƯỚC thay thế: BCVH ${kq.bcvh}, ngày trong tên file ${kq.ngay} (CHỈ ĐỌC — chưa xoá, chưa nạp) ==`);
  log('\n[Dữ liệu đang có trong DB — mọi file có unit_code = BCVH và file_date = ngày]');
  if (!kq.db.tap_file.length) log('  (không có file nào)');
  for (const f of kq.db.tap_file) log(`  #${f.id}  ${f.file_name}  nguồn ${f.source}  trạng thái ${f.status}  ghi nhận ${f.row_count} dòng, thực có ${f.so_dong_thuc} dòng`);
  log(`  tổng ${kq.db.tong_dong} dòng · ${kq.db.shbg_khac_nhau} SHBG khác nhau · ${kq.db.dong_arrival_date_rong} dòng chưa có ngày đến`);

  log(`\n[Nguồn SFTP — ${kq.nguon.thu_muc.length} thư mục, liệt kê ${kq.nguon.tong_muc_liet_ke} mục; bỏ qua: tên khác mẫu ${kq.nguon.bo_qua.ten_khac}, khác mã ${kq.nguon.bo_qua.khac_ma}, khác ngày ${kq.nguon.bo_qua.khac_ngay}]`);
  if (!kq.nguon.tap_file.length) log('  (không có file nào của BCVH + ngày này)');
  for (const f of kq.nguon.tap_file) {
    log(`  ${f.chon ? '[x]' : '[ ]'} ${f.ten}  ${f.kich_thuoc} byte  mtime ${F.dinhDangMtime(f.mtime)}  → ${f.ket_luan}${f.so_dong != null ? `  ${f.so_dong} dòng` : ''}${f.sha256 ? `  sha256 ${f.sha256.slice(0, 12)}…` : ''}`);
    if (f.ly_do) log(`        lý do: ${f.ly_do}`);
    if (f.canh_bao) log(`        cảnh báo: ${f.canh_bao}`);
  }

  const s = kq.so_sanh;
  log('\n[So sánh — tập file đang chọn và dùng được (READY)]');
  log(`  dòng: cũ ${s.dong_cu} → mới ${s.dong_moi_sau_loc_trung} (sau khi lọc trùng theo khoá của importer; ${s.dong_moi_trung_du_lieu_con_lai} dòng trong số đó trùng dữ liệu còn lại sẽ bị bỏ qua)`);
  log(`  SHBG: cũ ${s.shbg_cu} · mới ${s.shbg_moi} · chung ${s.shbg_chung} · chỉ ở mới ${s.shbg_chi_o_moi}`);
  log(`  MẤT THẬT ${s.shbg_mat_that} (${pct(s.ty_le_mat_that)}) — mức CẬN TRÊN ${s.shbg_chi_o_cu} (${pct(s.ty_le_mat)}) (cận trên chưa trừ SHBG còn ở file ngoài tập cùng BCVH; cảnh báo và khoá tính theo MẤT THẬT)`);
  log('  theo ngày đến (SHBG cũ → mới):');
  for (const n of s.theo_ngay_den) log(`    ${n.ngay === null ? '(chưa có ngày đến)' : n.ngay}: ${n.shbg_cu} → ${n.shbg_moi}`);
  if (s.shbg_mau_chi_o_cu.length) log(`  SHBG mẫu chỉ ở cũ (6 ký tự đầu): ${s.shbg_mau_chi_o_cu.map((x) => x.slice(0, 6)).join(', ')}`);

  const c = kq.canh_bao;
  log(`\n[Cảnh báo] mức ${c.muc}${c.muc === 'DO' ? ' (ĐỎ: mất > ' + pct(c.nguong_do) + ')' : ''} · khoá mặc định: ${c.khoa_mac_dinh ? 'CÓ' : 'không'} · không thể thay: ${c.khong_the_thay ? `CÓ (${c.ly_do_khong_the_thay})` : 'không'}`);
  const p = kq.phat;
  log(`[Trạng thái phát] SHBG của BCVH có trạng thái phát trong tập sẽ bị xoá: ${p.so_shbg_co_trang_thai} (còn ở bản mới ${p.con_o_ban_moi}, không còn ${p.khong_con}) — chỉ đếm, không sửa`);
  log(`[Tập file nguồn dùng để thay] ${kq.tap_file_nguon.length} file: ${kq.tap_file_nguon.map((x) => `${x.ten} (${x.sha256.slice(0, 8)}…)`).join('; ') || '(không có)'}`);
  log('\nĐây chỉ là bản xem trước. Việc thay thật (tải lại, kiểm lại mã băm, xoá + nạp trong một giao dịch) là ticket 5g-3.');
}

async function main() {
  let tham; let cfg; let db;
  try {
    tham = docThamSo(process.argv.slice(2));
    cfg = F.docCauHinh(process.env, { showFingerprint: false });
    db = moDbChiDoc();
  } catch (err) {
    if (err instanceof T.XemTruocLoi) { loi(`LỖI [${err.code}] ${err.message}`); loi(USAGE); return T.MA_THOAT.THAM_SO; }
    if (err instanceof F.CauHinhLoi) { loi(`LỖI [cau_hinh] ${err.message}`); return T.MA_THOAT.CAU_HINH; }
    loi(`LỖI [db] ${F.tenAnToan(err && err.message, 160)}`);
    return T.MA_THOAT.CAU_HINH;
  }
  try {
    log(`Kết nối ${cfg.host}:${cfg.port} (vân tay máy chủ được ghim) — chỉ liệt kê và tải file của BCVH ${tham.bcvh}, ngày ${tham.ngay}…`);
    const kq = await T.xemTruocThayThe({
      ketNoi: () => ketNoiSftp(cfg), dirs: cfg.dirs, db, bcvh: tham.bcvh, ngay: tham.ngay, tapFile: tham.chiLay, bimat: [cfg.password, cfg.user]
    });
    inKetQua(kq);
    return T.MA_THOAT.OK;
  } catch (err) {
    if (err instanceof T.XemTruocLoi) {
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
  .catch((err) => { loi(`[thay-the-xem-truoc] Lỗi không lường trước: ${F.tenAnToan(err && err.message, 200)}`); process.exitCode = 1; setTimeout(() => process.exit(1), 1000).unref(); });
