#!/usr/bin/env node
// ==========================================
// «Hàng tại KTT» (KTT-10b, mục 5.4): kiểm CHỈ ĐỌC nhật ký nạp và số dòng theo ngày của một vài ngày nghi vấn (mặc định 18/10 và 20/10/2026), để PO biết
// ngày đó có đợt nạp lỗi / thiếu / file CSV bị cắt không.
//
//   node scripts/ktt-kiem-dot-nap.js --db <đường-dẫn-BẢN-CHÉP-DB> [--ngay YYYY-MM-DD[,YYYY-MM-DD...]] [--json]
//
// - Mở DB ở chế độ `readonly` (không ghi được); từ chối mọi cờ có ý ghi; từ chối DB thật `data/hue-dhcl.db` của repo — chạy trên BẢN CHÉP (bắt buộc `--db`).
// - Chỉ in SỐ ĐẾM, giờ nguồn xuất và trạng thái nạp. KHÔNG in SHBG, số hiệu BD8 / BD10, tên file đầy đủ ngoài mẫu `KTT_*_yyyymmdd_hhmmss.csv`.
// - Chỉ nêu BẰNG CHỨNG, KHÔNG kết luận nguyên nhân. Câu hỏi nghiệp vụ (ví dụ ngày đó là Chủ nhật có bất thường ở KTT không) do PO trả lời.
// Mã thoát: 0 = ổn; 1 = sai cách dùng / lỗi.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const NGAY_MAC_DINH = ['2026-10-18', '2026-10-20'];
const USAGE = 'Cách dùng: node scripts/ktt-kiem-dot-nap.js --db <BẢN-CHÉP-DB> [--ngay YYYY-MM-DD[,YYYY-MM-DD...]] [--json]';
const WRITE_FLAGS = ['--apply', '--write', '--vacuum', '--fix', '--delete', '--reset', '--chay-that'];
const RE_NGAY = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const out = { db: null, ngay: NGAY_MAC_DINH, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.includes(a)) throw new Error(`Script kiểm chỉ đọc, không nhận cờ ghi: ${a}`);
    if (a === '--json') out.json = true;
    else if (a === '--db') out.db = argv[++i];
    else if (a === '--ngay') out.ngay = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Tuỳ chọn không hỗ trợ: ${a}`);
  }
  if (!out.db) throw new Error('Thiếu --db: chạy trên BẢN CHÉP của DB, không chạy trên DB thật.');
  if (!out.ngay.length || out.ngay.some((d) => !ngayCoThat(d))) throw new Error('--ngay phải là danh sách YYYY-MM-DD có thật, cách nhau bằng dấu phẩy.');
  return out;
}

const ngayCoThat = (d) => {
  if (!RE_NGAY.test(d)) return false;
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === dd;
};
/** Cộng `n` ngày vào 'YYYY-MM-DD' bằng số học UTC (không phụ thuộc múi giờ máy). */
const congNgay = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
/** Thứ trong tuần của 'YYYY-MM-DD' (số học UTC). */
const THU = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];
const thuCua = (d) => { const [y, m, dd] = d.split('-').map(Number); return THU[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; };

const coBang = (db, ten) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten);
/** Chỉ giữ tên file đúng mẫu KTT_{Tui|BuuGui}_yyyymmdd_hhmmss.csv; còn lại che. Thông báo lỗi: bỏ ký tự điều khiển, che số dài, cắt 160 ký tự. */
const tenFileAnToan = (s) => (typeof s === 'string' && /^KTT_(Tui|BuuGui)_\d{8}_\d{6}\.csv$/.test(s) ? s : (s ? '[tên file lạ]' : null));
const lamSach = (s) => (s ? String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\d{9,}/g, '[số dài]').slice(0, 160) : null);

/** Nhật ký nạp cặp (ktt_nap_cap) có dấu vết trong cửa sổ [tu, den]: nguồn xuất, hoặc khoảng giờ dữ liệu [gio_min, gio_max] chạm cửa sổ, hoặc cặp lỗi / từ chối / chờ cập nhật gần đó. */
function docNhatKyCap(db, tu, den) {
  if (!coBang(db, 'ktt_nap_cap')) return null;
  const rows = db.prepare(`SELECT khoa_cap, ket_qua, nguon_xuat_luc, gio_min, gio_max, tui_doc, tui_them, tui_cap_nhat, tui_bo_qua, tui_loi, tui_trung, tui_khong_con,
      bg_doc, bg_them, bg_cap_nhat, bg_bo_qua, bg_loi, bg_trung, bg_khong_con, ma_loi, thong_bao, so_lan_thu, ten_file_tui, ten_file_buu_gui, nap_luc
    FROM ktt_nap_cap
    WHERE (substr(nguon_xuat_luc, 1, 10) BETWEEN @tu AND @den)
       OR (substr(gio_min, 1, 10) <= @den AND substr(gio_max, 1, 10) >= @tu)
       OR (substr(khoa_cap, 1, 8) BETWEEN replace(@tu, '-', '') AND replace(@den, '-', ''))
    ORDER BY COALESCE(nguon_xuat_luc, khoa_cap), id`).all({ tu, den });
  return rows.map((r) => ({ ...r, ten_file_tui: tenFileAnToan(r.ten_file_tui), ten_file_buu_gui: tenFileAnToan(r.ten_file_buu_gui), ma_loi: lamSach(r.ma_loi), thong_bao: lamSach(r.thong_bao) }));
}

/** Khoảng cách (giờ) giữa hai cặp OK liên tiếp theo nguồn xuất: để thấy có đợt vắng. */
function khoangCachCap(cap) {
  const ok = (cap || []).filter((c) => c.ket_qua === 'OK' && c.nguon_xuat_luc);
  const giay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)) / 1000;
  return ok.slice(1).map((c, i) => ({ tu: ok[i].nguon_xuat_luc, den: c.nguon_xuat_luc, gio: Math.round(((giay(c.nguon_xuat_luc) - giay(ok[i].nguon_xuat_luc)) / 3600) * 100) / 100 }));
}

/** Nhật ký từng file (ktt_nap_lan): file có ngày trong TÊN gần cửa sổ, kèm số dòng đọc / lỗi / bỏ qua. */
function docNhatKyFile(db, tu, den) {
  if (!coBang(db, 'ktt_nap_lan')) return null;
  const rows = db.prepare(`SELECT loai, ten_file, nap_luc, so_dong_doc, so_dong_them, so_dong_cap_nhat, so_dong_bo_qua, so_dong_loi, trang_thai, thong_bao
    FROM ktt_nap_lan WHERE substr(ten_file, -19, 8) BETWEEN replace(@tu, '-', '') AND replace(@den, '-', '') ORDER BY ten_file, id`).all({ tu, den });
  return rows.map((r) => ({ ...r, ten_file: tenFileAnToan(r.ten_file), thong_bao: lamSach(r.thong_bao) }));
}

/** Số dòng của MỘT ngày d (theo giờ quét đến / giờ đến theo túi): túi theo chiều, túi đến không có giờ quét (chỉ có XNĐ trong ngày), bưu gửi, SHBG khác nhau, phân bố theo giờ, giờ nguồn xuất. */
function demNgay(db, d) {
  const r = { ngay: d, thu: thuCua(d), tui: null, buu_gui: null, theo_gio_quet_den: null, nguon_xuat_luc: null };
  if (coBang(db, 'ktt_tui')) {
    const theoChieu = db.prepare(`SELECT chieu, COUNT(*) AS n FROM ktt_tui WHERE substr(gio_quet_tui_den, 1, 10) = ? GROUP BY chieu ORDER BY chieu`).all(d);
    const khongGioQuet = db.prepare(`SELECT COUNT(*) AS n FROM ktt_tui WHERE gio_quet_tui_den IS NULL AND substr(bd10_den_xnd, 1, 10) = ?`).get(d).n;
    const denKhongXnd = db.prepare(`SELECT COUNT(*) AS n FROM ktt_tui WHERE substr(gio_quet_tui_den, 1, 10) = ? AND chieu = 'DEN' AND bd10_den_xnd IS NULL`).get(d).n;
    const theoGio = db.prepare(`SELECT substr(gio_quet_tui_den, 12, 2) AS gio, COUNT(*) AS n FROM ktt_tui WHERE substr(gio_quet_tui_den, 1, 10) = ? GROUP BY gio ORDER BY gio`).all(d);
    const nguon = db.prepare(`SELECT nguon_xuat_luc, COUNT(*) AS n FROM ktt_tui WHERE substr(gio_quet_tui_den, 1, 10) = ? GROUP BY nguon_xuat_luc ORDER BY nguon_xuat_luc`).all(d);
    const dem = (x) => theoChieu.filter((t) => t.chieu === x).reduce((s, t) => s + t.n, 0);
    r.tui = { tong_co_gio_quet_den: theoChieu.reduce((s, t) => s + t.n, 0), den: dem('DEN'), di: dem('DI'), chuyen_tiep_di: dem('CHUYEN_TIEP_DI'), khac: theoChieu.filter((t) => !['DEN', 'DI', 'CHUYEN_TIEP_DI'].includes(t.chieu)).reduce((s, t) => s + t.n, 0),
      khong_co_gio_quet_den_xnd_trong_ngay: khongGioQuet, den_co_gio_quet_nhung_khong_xnd: denKhongXnd };
    r.theo_gio_quet_den = theoGio.map((x) => ({ gio: x.gio, tui: x.n }));
    r.nguon_xuat_luc = nguon.map((x) => ({ nguon_xuat_luc: x.nguon_xuat_luc, tui: x.n }));
  }
  if (coBang(db, 'ktt_buu_gui')) {
    const bg = db.prepare(`SELECT COUNT(*) AS dong, COUNT(DISTINCT shbg) AS shbg FROM ktt_buu_gui WHERE substr(ti_den_theo_tui_luc, 1, 10) = ?`).get(d);
    const khongGio = db.prepare(`SELECT COUNT(*) AS dong FROM ktt_buu_gui WHERE ti_den_theo_tui_luc IS NULL AND substr(ti_xac_nhan_den_luc, 1, 10) = ?`).get(d).dong;
    const nguon = db.prepare(`SELECT MIN(nguon_xuat_luc) AS min, MAX(nguon_xuat_luc) AS max FROM ktt_buu_gui WHERE substr(ti_den_theo_tui_luc, 1, 10) = ?`).get(d);
    r.buu_gui = { dong_theo_gio_den_tui: bg.dong, shbg_khac_nhau: bg.shbg, dong_khong_co_gio_den_tui_nhung_co_xac_nhan_trong_ngay: khongGio, nguon_xuat_luc_nho_nhat: nguon.min || null, nguon_xuat_luc_lon_nhat: nguon.max || null };
  }
  return r;
}

/** Báo cáo cho danh sách ngày: với mỗi ngày kèm ngày trước, ngày sau và cùng thứ tuần trước để so sánh số dòng (không kết luận). */
function baoCao(db, ngays) {
  return ngays.map((d) => {
    const tu = congNgay(d, -1);
    const den = congNgay(d, 1);
    const cap = docNhatKyCap(db, tu, den);
    return {
      ngay: d, thu: thuCua(d),
      so_sanh: [congNgay(d, -7), tu, d, den].map((x) => demNgay(db, x)),
      nhat_ky_cap: cap, khoang_cach_cap_ok: khoangCachCap(cap), nhat_ky_file: docNhatKyFile(db, tu, den)
    };
  });
}

// ---------- in ----------
const fmt = (n) => (typeof n === 'number' ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : (n === null || n === undefined ? '–' : String(n)));
function bang(tieuDe, dau, dong) {
  console.log(`\n#### ${tieuDe}`);
  if (!dong.length) { console.log('(không có dòng nào)'); return; }
  console.log(`| ${dau.join(' | ')} |`);
  console.log(`|${dau.map(() => '---').join('|')}|`);
  for (const r of dong) console.log(`| ${r.map(fmt).join(' | ')} |`);
}

function in_(bc) {
  console.log('# KTT-10b · 5.4 — Kiểm chỉ đọc nhật ký nạp và số dòng theo ngày');
  console.log('Chỉ nêu bằng chứng; KHÔNG kết luận nguyên nhân. Câu hỏi nghiệp vụ do PO trả lời.');
  for (const b of bc) {
    console.log(`\n## Ngày ${b.ngay} (${b.thu})`);
    bang('Số lượng theo ngày (theo giờ quét túi đến; so với cùng thứ tuần trước, ngày trước, ngày sau)',
      ['ngày', 'thứ', 'túi có giờ quét đến', 'đến', 'đi', 'chuyển tiếp đi', 'đến mà không XNĐ', 'túi không giờ quét (chỉ XNĐ trong ngày)', 'dòng bưu gửi', 'SHBG khác nhau', 'bưu gửi không giờ đến túi (có xác nhận trong ngày)'],
      b.so_sanh.map((x) => [x.ngay, x.thu, x.tui && x.tui.tong_co_gio_quet_den, x.tui && x.tui.den, x.tui && x.tui.di, x.tui && x.tui.chuyen_tiep_di, x.tui && x.tui.den_co_gio_quet_nhung_khong_xnd,
        x.tui && x.tui.khong_co_gio_quet_den_xnd_trong_ngay, x.buu_gui && x.buu_gui.dong_theo_gio_den_tui, x.buu_gui && x.buu_gui.shbg_khac_nhau, x.buu_gui && x.buu_gui.dong_khong_co_gio_den_tui_nhung_co_xac_nhan_trong_ngay]));
    const gio = new Map();
    for (const x of b.so_sanh) for (const g of x.theo_gio_quet_den || []) { const e = gio.get(g.gio) || {}; e[x.ngay] = g.tui; gio.set(g.gio, e); }
    bang('Túi theo giờ quét đến (phân bố 24 giờ; dòng bị cắt cụt thường thấy ở chỗ số về 0 sớm)', ['giờ', ...b.so_sanh.map((x) => x.ngay)],
      [...gio.keys()].sort().map((g) => [g, ...b.so_sanh.map((x) => gio.get(g)[x.ngay] || 0)]));
    const ng = b.so_sanh.find((x) => x.ngay === b.ngay);
    bang(`Giờ nguồn xuất của các túi quét đến ngày ${b.ngay} (số túi theo giờ xuất; mỗi dòng là lần nạp cuối của túi)`, ['giờ nguồn xuất', 'túi'], (ng.nguon_xuat_luc || []).map((x) => [x.nguon_xuat_luc, x.tui]));
    if (ng.buu_gui) console.log(`\nBưu gửi: giờ nguồn xuất nhỏ nhất ${fmt(ng.buu_gui.nguon_xuat_luc_nho_nhat)}, lớn nhất ${fmt(ng.buu_gui.nguon_xuat_luc_lon_nhat)}.`);
    if (b.nhat_ky_cap === null) console.log('\n(không có bảng ktt_nap_cap)');
    else {
      bang('Nhật ký nạp cặp quanh ngày (±1 ngày)', ['khoá cặp', 'kết quả', 'nguồn xuất', 'giờ dữ liệu nhỏ nhất', 'giờ dữ liệu lớn nhất', 'túi đọc', 'túi thêm', 'túi cập nhật', 'túi bỏ qua', 'túi lỗi', 'bưu gửi đọc', 'bưu gửi thêm', 'bưu gửi cập nhật', 'bưu gửi bỏ qua', 'bưu gửi lỗi', 'mã lỗi', 'thông báo'],
        b.nhat_ky_cap.map((c) => [c.khoa_cap, c.ket_qua, c.nguon_xuat_luc, c.gio_min, c.gio_max, c.tui_doc, c.tui_them, c.tui_cap_nhat, c.tui_bo_qua, c.tui_loi, c.bg_doc, c.bg_them, c.bg_cap_nhat, c.bg_bo_qua, c.bg_loi, c.ma_loi, c.thong_bao]));
      bang('Khoảng cách giữa hai cặp OK liên tiếp (theo nguồn xuất)', ['từ', 'đến', 'giờ'], b.khoang_cach_cap_ok.map((k) => [k.tu, k.den, k.gio]));
    }
    if (b.nhat_ky_file === null) console.log('\n(không có bảng ktt_nap_lan)');
    else bang('Nhật ký từng file (theo ngày trong TÊN file, ±1 ngày)', ['loại', 'tên file', 'nạp lúc', 'trạng thái', 'dòng đọc', 'thêm', 'cập nhật', 'bỏ qua', 'lỗi', 'thông báo'],
      b.nhat_ky_file.map((f) => [f.loai, f.ten_file, f.nap_luc, f.trang_thai, f.so_dong_doc, f.so_dong_them, f.so_dong_cap_nhat, f.so_dong_bo_qua, f.so_dong_loi, f.thong_bao]));
  }
  console.log('\n---\nChưa biết / không suy đoán: nguyên nhân thiếu giờ quét đến, và việc ngày đó có bất thường ở KTT hay không, cần PO đối chiếu với nghiệp vụ.');
}

function main(argv) {
  const a = parseArgs(argv);
  const dbPath = path.resolve(a.db);
  const dbThat = path.resolve(__dirname, '..', 'data', 'hue-dhcl.db');
  if (dbPath.toLowerCase() === dbThat.toLowerCase()) throw new Error('Không chạy trên DB thật `data/hue-dhcl.db`: hãy chép sang nơi khác và truyền bản chép bằng --db.');
  if (!fs.existsSync(dbPath)) throw new Error(`Không thấy file DB: ${a.db}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const bc = baoCao(db, a.ngay);
    if (a.json) console.log(JSON.stringify(bc, null, 2)); else in_(bc);
  } finally { db.close(); }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${USAGE}`); process.exitCode = 1; }
}

module.exports = { parseArgs, baoCao, demNgay, docNhatKyCap, docNhatKyFile, khoangCachCap, congNgay, thuCua, main };
