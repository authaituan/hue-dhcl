#!/usr/bin/env node
// ==========================================
// «Hàng tại KTT» (KTT-10b, mục 5.5): in số TỔNG của khối `chi_tieu_14h` (hai mốc song song) trên một khoảng ngày, để PO so với số tham chiếu của KTT-10.
//
//   node scripts/ktt-doi-chieu-chi-tieu.js --db <đường-dẫn-BẢN-CHÉP-DB> --tu YYYY-MM-DD [--den YYYY-MM-DD] [--json]
//
// - Gọi kttLuuThoatQuery.luuThoatTheoNgay (mặc định mốc `xnd`: các số khác không đổi); mở DB ở chế độ `readonly`, từ chối mọi cờ ghi và DB thật `data/hue-dhcl.db` — chạy trên BẢN CHÉP (bắt buộc `--db`).
// - Khoảng ≤ 31 ngày (giới hạn của luuThoatTheoNgay). «Bây giờ» = độ mới dữ liệu của bản chép (không phải đồng hồ máy).
// - Chỉ in SỐ ĐẾM. KHÔNG in SHBG, số hiệu BD8 / BD10. Không có tỷ lệ «đạt» chung: mỗi mốc ghi «đo được x/y».
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const QL = require('../server/lib/kttLuuThoatQuery');

const USAGE = 'Cách dùng: node scripts/ktt-doi-chieu-chi-tieu.js --db <BẢN-CHÉP-DB> --tu YYYY-MM-DD [--den YYYY-MM-DD] [--json]';
const WRITE_FLAGS = ['--apply', '--write', '--vacuum', '--fix', '--delete', '--reset', '--chay-that'];
const RE_NGAY = /^\d{4}-\d{2}-\d{2}$/;

const ngayCoThat = (d) => {
  if (!RE_NGAY.test(d)) return false;
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === dd;
};

function parseArgs(argv) {
  const out = { db: null, tu: null, den: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.includes(a)) throw new Error(`Script chỉ đọc, không nhận cờ ghi: ${a}`);
    if (a === '--json') out.json = true;
    else if (a === '--db' || a === '--tu' || a === '--den') out[a.slice(2)] = argv[++i];
    else throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
  }
  if (!out.db) throw new Error('Thiếu --db: chạy trên BẢN CHÉP của DB, không chạy trên DB thật.');
  if (!out.tu) throw new Error('Thiếu --tu (YYYY-MM-DD).');
  if (!out.den) out.den = out.tu;
  for (const k of ['tu', 'den']) if (!ngayCoThat(out[k])) throw new Error(`--${k} phải là ngày YYYY-MM-DD có thật.`);
  if (out.tu > out.den) throw new Error('--tu phải không sau --den.');
  return out;
}

/** Lấy khối `chi_tieu_14h` tổng của khoảng ngày từ kết quả luuThoatTheoNgay; null nếu chưa có dữ liệu. */
function layChiTieu(kq) {
  return kq.tong_cong ? kq.tong_cong.chi_tieu_14h : null;
}

const fmt = (n) => (typeof n === 'number' ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : (n === null || n === undefined ? '–' : String(n)));

function in_(a, kq, c) {
  console.log('# KTT-10b · 5.5 — Số tổng chỉ tiêu «đạt 14 giờ» theo hai mốc');
  console.log(`Khoảng ngày (theo ngày đến): ${a.tu} → ${a.den}. Độ mới dữ liệu: ${fmt(kq.nguon_xuat_luc_moi_nhat)}.`);
  if (!c) { console.log(`\nChưa có dữ liệu để tính (${kq.ly_do || 'không rõ lý do'}).`); return; }
  const m = c.theo_moc;
  console.log(`\nMẫu số (SHBG đã phân loại, không gồm hàng hoàn / đích không rõ / ngoài phạm vi / thiếu giờ quét đến / không xếp được chuyến): ${fmt(c.mau_so)}.`);
  console.log(`Đo được ở CẢ hai mốc: ${fmt(c.do_duoc_ca_hai_moc)}.\n`);
  console.log('| chỉ số | mốc A (xnd) | mốc B (quet_tui_den) |');
  console.log('|---|---|---|');
  const dong = [
    ['mốc bắt đầu → kết thúc', (x) => x.moc],
    ['đo được (x) / mẫu số (y)', (x) => `${fmt(x.do_duoc)} / ${fmt(x.mau_so)}`],
    ['đạt', (x) => x.dat],
    ['không đạt', (x) => x.khong_dat],
    ['tỷ lệ đạt TRÊN PHẦN ĐO ĐƯỢC (không phải tỷ lệ chung)', (x) => (x.ty_le_dat_tren_do_duoc === null ? null : `${(x.ty_le_dat_tren_do_duoc * 100).toFixed(2)}%`)],
    ['không đo được — tổng', (x) => x.khong_do_duoc.tong],
    ['  thiếu mốc', (x) => x.khong_do_duoc.thieu_moc],
    ['  mốc sau giờ lập BD10 đi', (x) => x.khong_do_duoc.moc_sau_gio_di],
    ['  chưa đi', (x) => x.khong_do_duoc.chua_di],
    ['  trong đó chưa đi đã quá chỉ tiêu (chua_di_da_qua_chi_tieu)', (x) => x.chua_di_da_qua_chi_tieu],
    ['đo được ở mốc này, không đo được ở mốc kia', (x) => x.do_duoc_khong_do_duoc_o_moc_kia]
  ];
  for (const [ten, f] of dong) console.log(`| ${[ten, f(m.xnd), f(m.quet_tui_den)].map(fmt).join(' | ')} |`);
  const q = c.chat_luong_tui_den;
  console.log('\nChất lượng túi đến (đếm trên cùng mẫu số):');
  console.log(`- SHBG không có túi đi: ${fmt(q.khong_co_tui_di)}`);
  console.log(`- SHBG có từ 2 túi đến (có giờ quét) trở lên: ${fmt(q.nhieu_tui_den)}`);
  console.log(`- SHBG có túi đến ghép khác túi đến gốc: ${fmt(q.tui_den_ghep_khac_goc)}`);
  console.log(`- SHBG có kết quả mốc B KHÁC nếu lấy túi đến gốc thay túi ghép: ${fmt(q.khac_ket_qua_neu_dung_tui_goc)}`);
  console.log('\nLưu ý: «đi trước khi đến» chính là nhóm «mốc sau giờ lập BD10 đi» của mốc B. Số này CHỈ để PO so với số tham chiếu của KTT-10; không công bố một tỷ lệ «đạt» chung.');
}

function main(argv) {
  const a = parseArgs(argv);
  const dbPath = path.resolve(a.db);
  const dbThat = path.resolve(__dirname, '..', 'data', 'hue-dhcl.db');
  if (dbPath.toLowerCase() === dbThat.toLowerCase()) throw new Error('Không chạy trên DB thật `data/hue-dhcl.db`: hãy chép sang nơi khác và truyền bản chép bằng --db.');
  if (!fs.existsSync(dbPath)) throw new Error(`Không thấy file DB: ${a.db}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const kq = QL.luuThoatTheoNgay(db, { tuNgay: a.tu, denNgay: a.den });
    const c = layChiTieu(kq);
    if (a.json) console.log(JSON.stringify({ khoang_ngay: kq.khoang_ngay, nguon_xuat_luc_moi_nhat: kq.nguon_xuat_luc_moi_nhat, chi_tieu_14h: c }, null, 2));
    else in_(a, kq, c);
  } finally { db.close(); }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${USAGE}`); process.exitCode = 1; }
}

module.exports = { parseArgs, layChiTieu, main };
