// ==========================================
// Test KTT-16-4: «Đánh giá» (GET /api/ktt/doi-chieu/danh-gia) và xuất xlsx sheet 1–6 (GET /api/ktt/doi-chieu/xuat/*) của trang Đối chiếu.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx do test tự dựng). Không mở data/, không DB thật, không mạng. Độ mới KTT 23/10/2026 10:00.
// Kịch bản: sáu BCVH có file 15/10..28/10 (hai đợt mỗi ngày) trừ Hương Trà vắng 21/10 -> cửa sổ kiểm tra được 15/10..26/10. 18/10/2026 là Chủ nhật.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const DC = require('../server/lib/kttDoiChieu');
const DG = require('../server/lib/kttDanhGiaDoiChieu');
const DX = require('../server/lib/kttDoiChieuXuat');
const Nong = require('../server/lib/kttNong');
const TS = require('../server/lib/thamSo');
const { MA_BCVH_HUE } = require('../server/lib/kttTinh');

const PORT = 5984;
const TH = '533140'; const HT = '535470';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT164_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT164_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT164_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT164_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-dcxuat-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const u of Object.values(USERS)) seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
  for (const [k, u] of Object.entries(USERS)) tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap; DELETE FROM arrival_items; DELETE FROM arrival_import_files;');
  TS.khoiTao(db);
  Nong.datLai();
  Api.xoaCache();
});

// ---------- dữ liệu giả: KTT ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (...ds) => ds.forEach((shbg) => them('ktt_hang_hoan', { shbg, nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' }));
const NG = { nguon_xuat_luc: BAY_GIO, cap_nhat_luc: BAY_GIO };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}

// ---------- dữ liệu giả: Hàng đến BCVH ----------
let seqF = 0;
/** Một file BCVH giả; hang = các SHBG có trong file (mỗi dòng bd10_no riêng vì khóa chống trùng là toàn bảng). */
function fileBcvh(ma, ngay, gio, hang = [], status = 'OK') {
  seqF++;
  const id = db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status, source)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'MANUAL')`).run(ma, `HangDen_${ma}_${ngay.replace(/-/g, '')}_${gio.replace(/:/g, '')}.csv`, ngay, gio, `sha162-${seqF}`, hang.length, hang.length, status).lastInsertRowid;
  for (const h of hang) {
    const [t, gio] = Array.isArray(h) ? h : [h, `${ngay} 08:00:00`]; // [SHBG, null] = dòng KHÔNG có mốc đến («chưa xác định ngày đến»)
    db.prepare('INSERT INTO arrival_items (import_file_id, tracking_no, bd10_no, arrival_at, arrival_date) VALUES (?, ?, ?, ?, ?)').run(id, t, `BD10-${ma}-${seqF}`, gio, gio ? ngay : null);
  }
  return id;
}

const GIO = '2026-10-20 05:30:00';
const DEN = 'tu=2026-10-18&den=2026-10-22';
const URL_DG = `/api/ktt/doi-chieu/danh-gia?${DEN}`;
const TEN_SHEET_ROUTE = { 1: 'chua-thay', 2: 'chuyen-mat-dau', 3: 'chuyen-tiep-chua-quet-di', 4: 'thay-o-bcvh-khac', 5: 'chuyen-cham', 6: 'da-co-tai-dich' };
const urlXuat = (s, q = DEN) => `/api/ktt/doi-chieu/xuat/${TEN_SHEET_ROUTE[s]}?${q}`;
const nhieu = (tienTo, n) => Array.from({ length: n }, (_, i) => `${tienTo}${i + 1}`);

/** Phủ 15..28/10 cho cả sáu BCVH (trừ Hương Trà vắng 21/10); `co[ma][ngay]` = SHBG (hoặc [SHBG, mốc]) có trong file S của ngày đó. */
function phu(co = {}, { bo = { [HT]: ['2026-10-21'] } } = {}) {
  for (let d = 15; d <= 28; d++) {
    const ngay = `2026-10-${d}`;
    for (const ma of MA_BCVH_HUE) {
      if ((bo[ma] || []).includes(ngay)) continue;
      fileBcvh(ma, ngay, '09:30:00', (co[ma] && co[ma][ngay]) || []);
      fileBcvh(ma, ngay, '15:00:00', []);
    }
  }
}
/** Hàng khai thác lại: túi ĐẾN + túi ĐI (BD10 đi dùng chung theo chuyến `bd10`; quet null = thiếu giờ quét túi đến). coDi=false: chỉ túi ĐẾN. */
function ktB(shbg, { quet = GIO, gioDi = null, nhan = TH, bd10 = null, xnd = quet || GIO, coDi = true, luong = 'KHAI_THAC_DEN', bd8 = null }) {
  const den = tui({ chieu: 'DEN', luong, so_hieu_bd8: bd8, co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg);
  if (!coDi) return;
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? bd10 || `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
/** Kiện đi ngoài / túi chuyển tiếp (túi CHUYEN_TIEP_DI): xnd null = chưa xác nhận; gioDi = đã lập BD10 đi. */
function kdn(shbg, { quet = GIO, xnd = quet, gioDi = null, nhan = TH, bd10 = null, luong = 'DI_NGOAI', bd8 = null }) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong, so_hieu_bd8: bd8, to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'CT-01',
    bd10_di_ma_diem_nhan: nhan, bd10_di_gio_di: gioDi, bd10_di_so_hieu: gioDi ? bd10 || `BD10-K-${seq}` : null });
  bg(t, shbg);
}

/**
 * 20/10 (thứ ba): chuyến T1 (TH, 4 SHBG đều có ở TH), T2 (TH, 5 SHBG không thấy: MẤT DẤU CHẮC), T3 (HT, 5 SHBG không thấy; HT vắng file 21/10 -> NGHI THIẾU FILE),
 * TC (TH, 5 SHBG đều nhận lúc 20:00: trung vị 13 giờ -> chuyến CHẬM), TN (TH, 5 SHBG nhận 08:30: nhanh). 18/10 (CHỦ NHẬT): chuyến T7 (TH, 5 SHBG không thấy).
 * Thanh 1 (20/10, chưa đi trên 24 giờ): S1 khai thác chưa có túi đi, S2 kiện đi ngoài đã xác nhận, S3 kiện đi ngoài chưa xác nhận, S4 khai thác chưa xác nhận, S5 (đích HT, không thấy -> nghi),
 * S6 (đích TH, chỉ có ở HT -> BCVH khác), S7 (đích TH, có ở TH), S8 túi chuyển tiếp đã chia sẵn (không thấy). Thiếu giờ quét túi đến (đã ghi đi): K1 khai thác (không thấy), K2 (có ở HT), K3 kiện đi ngoài (không thấy).
 */
function duLieu() {
  const d20 = '2026-10-20';
  const g = (h) => `${d20} ${h}`;
  const hang = (arr, h, ngay = d20) => arr.map((s) => [`KTT-DEMO-${s}`, `${ngay} ${h}`]);
  const co = { [TH]: {}, [HT]: {} };
  for (const s of nhieu('A', 4)) ktB(`KTT-DEMO-${s}`, { gioDi: g('07:00:00'), bd10: 'BD10-T1' });
  for (const s of nhieu('M', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('08:00:00'), bd10: 'BD10-T2' });
  for (const s of nhieu('N', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('08:00:00'), bd10: 'BD10-T3', nhan: HT });
  for (const s of nhieu('C', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('07:00:00'), bd10: 'BD10-TC' });
  for (const s of nhieu('F', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('07:00:00'), bd10: 'BD10-TN' });
  for (const s of nhieu('W', 5)) ktB(`KTT-DEMO-${s}`, { quet: '2026-10-18 05:30:00', gioDi: '2026-10-18 08:00:00', bd10: 'BD10-T7' });
  ktB('KTT-DEMO-S1', { coDi: false });
  kdn('KTT-DEMO-S2', {});
  kdn('KTT-DEMO-S3', { xnd: null });
  ktB('KTT-DEMO-S4', { xnd: null });
  ktB('KTT-DEMO-S5', { nhan: HT });
  ktB('KTT-DEMO-S6', {});
  ktB('KTT-DEMO-S7', {});
  kdn('KTT-DEMO-S8', { luong: 'DA_CHIA_SAN', bd8: 'KTT-DEMO-BD8-S8' });
  ktB('KTT-DEMO-K1', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  ktB('KTT-DEMO-K2', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  kdn('KTT-DEMO-K3', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  capOk(BAY_GIO);
  co[TH][d20] = [...hang(['A1', 'A2', 'A3', 'A4', 'S7'], '08:30:00'), ...hang(nhieu('C', 5), '20:00:00'), ...hang(nhieu('F', 5), '08:30:00')];
  co[HT][d20] = [...hang(['K2', 'S6'], '10:30:00')];
  phu(co);
  Api.xoaCache();
}

async function goi(url, who = 'ttvh') {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  const ct2 = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, buf: ct2.includes('json') ? null : Buffer.from(await res.arrayBuffer()), body: ct2.includes('json') ? await res.json() : null };
}
async function docFile(r) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf); return wb; }
/** Sheet dữ liệu (sheet thứ hai) -> { tieuDe, dong: [[ô]], ttin: { mục: nội dung }, r }. */
async function bang(s, q) {
  const r = await goi(urlXuat(s, q));
  assert.equal(r.status, 200);
  const wb = await docFile(r);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', DX.SHEET[s].ten]);
  const ws = wb.worksheets[1];
  const dong = [];
  ws.eachRow((row, i) => { if (i > 1) dong.push(Array.from({ length: DX.SHEET[s].cot.length }, (_, c) => { const v = row.getCell(c + 1).value; return v === undefined ? null : v; })); });
  const ttin = {};
  wb.worksheets[0].eachRow((row, i) => { if (i > 1) ttin[String(row.getCell(1).value)] = row.getCell(2).value; });
  return { tieuDe: ws.getRow(1).values.slice(1), dong, ttin, r };
}
const cotCua = (s, khoa) => DX.SHEET[s].cot.findIndex((c) => c.khoa === khoa);
const gioChuoi = (d) => (d instanceof Date ? d.toISOString().slice(0, 19).replace('T', ' ') : d);
const CAM = /túi đi ngoài chưa mở|cửa sổ|dương tính|đã ghi đi|trung vị|p50|p90|phân vị|Mất dấu chắc(?! chắn)|Nghi thiếu file/i; // kèm thuật ngữ hiển thị cũ PO đã bỏ (chữ người đọc thấy)
const layTong = async (q = DEN) => (await goi(`/api/ktt/doi-chieu/tong-hop?${q}`)).body;

// ---------- quyền, tham số ----------
test('quyền: ADMIN + TTVH được (danh-gia và sáu route xuất); GDVH, TIVI 403; không token 401', async () => {
  duLieu();
  const urls = [URL_DG, ...[1, 2, 3, 4, 5, 6].map((s) => urlXuat(s))];
  for (const u of urls) {
    assert.equal((await goi(u, 'admin')).status, 200, u);
    assert.equal((await goi(u, 'ttvh')).status, 200, u);
    assert.equal((await goi(u, 'gdvh')).status, 403, u);
    assert.equal((await goi(u, 'tivi')).status, 403, u);
    assert.equal((await goi(u, null)).status, 401, u);
  }
});

test('tham số: khoảng > 31 ngày, thiếu ngày, mã BCVH lạ, khóa lạ -> 400 (cả danh-gia lẫn xuất)', async () => {
  duLieu();
  const xau = ['tu=2026-09-01&den=2026-10-22', 'tu=2026-10-19', 'tu=2026-10-19&den=2026-10-22&ma_bcvh=000000', 'tu=2026-10-19&den=2026-10-22&la=1', 'tu=2026-10-22&den=2026-10-19'];
  for (const q of xau) {
    const a = await goi(`/api/ktt/doi-chieu/danh-gia?${q}`);
    assert.equal(a.status, 400, q);
    assert.ok(a.body.error && a.body.ma, q);
    for (let s = 1; s <= 6; s++) assert.equal((await goi(urlXuat(s, q))).status, 400, `${s} ${q}`);
  }
  assert.equal((await goi('/api/ktt/doi-chieu/danh-gia?tu=2026-09-22&den=2026-10-22')).status, 200); // đúng 31 ngày
});

// ---------- «Đánh giá» ----------
test('Đánh giá: các mục đủ điều kiện (trừ f), thứ tự, trường bắt buộc, số khớp tong-hop / chua-thay / thoi-gian-nhan', async () => {
  duLieu();
  const dg = (await goi(URL_DG)).body;
  const th = await layTong();
  const ct = (await goi(`/api/ktt/doi-chieu/chua-thay?${DEN}`)).body;
  const tg = (await goi(`/api/ktt/doi-chieu/thoi-gian-nhan?${DEN}`)).body;
  assert.deepEqual(dg.danh_gia.map((m) => m.ma), ['NHOM_CHUA_DI_24H', 'CHUA_THAY_O_DAU', 'CHUYEN_MAT_DAU', 'CHUYEN_TIEP_CHUA_QUET_DI', 'THAY_O_BCVH_KHAC', 'CHAT_LUONG_DU_LIEU_BCVH', 'THIEU_GIO_QUET_DEN']);
  for (const m of dg.danh_gia) {
    assert.ok(['LUU_Y', 'CANH_BAO', 'THONG_TIN'].includes(m.loai), m.ma);
    assert.ok(m.tieu_de && m.noi_dung && m.so_lieu && m.dieu_kien_hien, m.ma);
    assert.ok(m.sheet === null || (m.sheet >= 1 && m.sheet <= 6), m.ma);
    assert.ok(!CAM.test(m.noi_dung), m.ma);
    assert.ok(m.noi_dung.length <= 520, `${m.ma} dài ${m.noi_dung.length}`);
  }
  const mu = Object.fromEntries(dg.danh_gia.map((m) => [m.ma, m]));
  const tc = th.tong_cong.tap_chinh;
  // a
  assert.equal(mu.NHOM_CHUA_DI_24H.loai, 'LUU_Y');
  assert.deepEqual([mu.NHOM_CHUA_DI_24H.so_lieu.trong_cua_so, mu.NHOM_CHUA_DI_24H.so_lieu.tai_dich, mu.NHOM_CHUA_DI_24H.so_lieu.bcvh_khac, mu.NHOM_CHUA_DI_24H.so_lieu.chua_thay], [tc.trong_cua_so, tc.tai_dich, tc.bcvh_khac, tc.chua_thay]);
  assert.ok(mu.NHOM_CHUA_DI_24H.noi_dung.includes(`${tc.trong_cua_so} SHBG`));
  // b
  assert.equal(mu.CHUA_THAY_O_DAU.loai, 'CANH_BAO');
  assert.equal(mu.CHUA_THAY_O_DAU.sheet, 1);
  assert.equal(mu.CHUA_THAY_O_DAU.so_lieu.chua_thay, tc.chua_thay);
  assert.equal(mu.CHUA_THAY_O_DAU.so_lieu.chua_thay, ct.nguon_chua_thay.thanh_1.tong);
  assert.equal(Object.values(mu.CHUA_THAY_O_DAU.so_lieu.theo_ly_do).reduce((s, n) => s + n, 0), tc.chua_thay);
  assert.equal(mu.CHUA_THAY_O_DAU.so_lieu.bcvh_nhieu_nhat, TH);
  assert.equal(mu.CHUA_THAY_O_DAU.so_lieu.theo_ly_do.kien_di_ngoai, 2);
  assert.equal(mu.CHUA_THAY_O_DAU.so_lieu.theo_ly_do.tui_chuyen_tiep_da_chia_san, 1);
  assert.ok(mu.CHUA_THAY_O_DAU.noi_dung.includes('kiện đi ngoài 2') && mu.CHUA_THAY_O_DAU.noi_dung.includes('túi chuyển tiếp đã chia sẵn 1'));
  // c
  const md = ct.chuyen_mat_dau;
  assert.equal(mu.CHUYEN_MAT_DAU.sheet, 2);
  assert.equal(mu.CHUYEN_MAT_DAU.so_lieu.mat_dau_chac.so_chuyen, md.mat_dau_chac.so_chuyen);
  assert.equal(mu.CHUYEN_MAT_DAU.so_lieu.nghi_thieu_file.so_shbg, md.nghi_thieu_file.so_shbg);
  assert.deepEqual(mu.CHUYEN_MAT_DAU.so_lieu.ngay_chu_nhat, ['2026-10-18']); // tính từ dữ liệu, không chữ cứng
  assert.ok(mu.CHUYEN_MAT_DAU.noi_dung.includes('Chủ nhật (18/10)'));
  assert.ok(!/nguyên nhân/.test(mu.CHUYEN_MAT_DAU.noi_dung));
  // d, e
  assert.equal(mu.CHUYEN_TIEP_CHUA_QUET_DI.sheet, 3);
  assert.equal(mu.CHUYEN_TIEP_CHUA_QUET_DI.so_lieu.tong, dg.so_dong_sheet[3].so_dong);
  assert.equal(mu.THAY_O_BCVH_KHAC.sheet, 4);
  assert.equal(mu.THAY_O_BCVH_KHAC.so_lieu.bcvh_khac, tc.bcvh_khac);
  assert.equal(mu.THAY_O_BCVH_KHAC.so_lieu.theo_noi_den[HT], 1);
  // g, h
  assert.equal(mu.CHAT_LUONG_DU_LIEU_BCVH.so_lieu.luot_khong_co_file, 1); // Hương Trà 21/10
  assert.equal(mu.CHAT_LUONG_DU_LIEU_BCVH.so_lieu.so_shbg_do_tre_am, tg.tong_cong.am);
  assert.equal(mu.THIEU_GIO_QUET_DEN.so_lieu.tong, th.tong_cong.da_ghi_di.khong_phan_loai_da_ghi_di.tong);
  assert.equal(mu.THIEU_GIO_QUET_DEN.so_lieu.tong, ct.nguon_chua_thay.thieu_gio_quet_den.tong);
  assert.equal(mu.THIEU_GIO_QUET_DEN.sheet, null);
  // f không hiện: mẫu quá nhỏ
  assert.equal(mu.DEN_CUNG_NGAY_THAP, undefined);
  assert.deepEqual(Object.keys(dg.hang_so).sort(), ['chuyen_cham', 'cung_ngay_thap', 'mat_dau']);
  assert.ok(dg.co_du_lieu);
});

test('Đánh giá: mục không đủ điều kiện thì không sinh (không bịa)', async () => {
  // chỉ một SHBG đã có tại đích: không có chưa thấy, mất dấu, BCVH khác, chuyển tiếp, thiếu giờ quét
  ktB('KTT-DEMO-Q1', {});
  capOk(BAY_GIO);
  phu({ [TH]: { '2026-10-20': [['KTT-DEMO-Q1', '2026-10-20 08:00:00']] } });
  Api.xoaCache();
  let dg = (await goi(URL_DG)).body;
  assert.deepEqual(dg.danh_gia.map((m) => m.ma), ['NHOM_CHUA_DI_24H', 'CHAT_LUONG_DU_LIEU_BCVH']); // g vì Hương Trà vắng file 21/10
  assert.equal(dg.danh_gia[0].so_lieu.chua_thay, 0);
  // BCVH đủ file, mọi dòng có mốc: g cũng không sinh
  db.exec('DELETE FROM arrival_items; DELETE FROM arrival_import_files;');
  phu({ [TH]: { '2026-10-20': [['KTT-DEMO-Q1', '2026-10-20 08:00:00']] } }, { bo: {} });
  Api.xoaCache();
  dg = (await goi(URL_DG)).body;
  assert.deepEqual(dg.danh_gia.map((m) => m.ma), ['NHOM_CHUA_DI_24H']);
  assert.ok(!dg.danh_gia[0].noi_dung.includes('chưa thấy ở đâu.') || dg.danh_gia[0].noi_dung.includes('0 (0%)'));
});

test('Đánh giá: chưa có dữ liệu KTT -> danh sách rỗng, số dòng sheet vẫn trả; lọc theo BCVH đổi theo số', async () => {
  let dg = (await goi(URL_DG)).body;
  assert.equal(dg.co_du_lieu, false);
  assert.equal(dg.ly_do, 'CHUA_CO_DU_LIEU');
  assert.deepEqual(dg.danh_gia, []);
  assert.deepEqual([1, 2, 3, 4, 5].map((s) => dg.so_dong_sheet[s].so_dong), [0, 0, 0, 0, 0]);
  assert.equal(dg.so_dong_sheet[6].so_dong, 5 * 6);
  duLieu();
  dg = (await goi(`${URL_DG}&ma_bcvh=${HT}`)).body;
  assert.equal(dg.ma_bcvh, HT);
  const th = await layTong(`${DEN}&ma_bcvh=${HT}`);
  assert.equal(dg.danh_gia[0].so_lieu.chua_thay, th.tong_cong.tap_chinh.chua_thay);
  assert.equal(dg.so_dong_sheet[6].so_dong, 5);
  assert.equal(dg.so_dong_sheet[1].so_dong, th.tong_cong.tap_chinh.chua_thay);
});

test('Đánh giá (hàm thuần): mục f chỉ hiện khi có BCVH đủ mẫu, dưới ngưỡng và thấp hơn mức chung; số lấy từ đầu vào', () => {
  const khong = { ty_le_cung_ngay: null, tong_cong: { ty_le_cung_ngay: null }, theo_bcvh: {} };
  const bcvh = (mau, cung) => ({ mau, cung_ngay: cung, ty_le_cung_ngay: mau ? cung / mau : null });
  const cham = { danh_sach: [{ ma_bcvh_dich: TH, gio_lap: '2026-10-20 21:10:00' }, { ma_bcvh_dich: TH, gio_lap: '2026-10-21 21:40:00' }, { ma_bcvh_dich: TH, gio_lap: '2026-10-22 09:00:00' }] };
  const base = { tong_cong: { ty_le_cung_ngay: 0.96 }, theo_bcvh: { [TH]: bcvh(1000, 900), [HT]: bcvh(1000, 990) } };
  const dgBase = (tg, cham2) => DG.taoDanhGiaDoiChieu({
    tongHop: { tong_cong: { tap_chinh: { tong: 0 } } }, thoiGianNhan: tg, chuaThay: { chuyen_mat_dau: { so_chuyen_mat_dau: 0 }, nguon_chua_thay: { thanh_1: { tong: 0 }, thieu_gio_quet_den: { tong: 0 } } },
    chuyenTiep: { tong: 0 }, chuyenCham: cham2, doPhu: { bcvh: [] }, ngays: [], maBcvh: null
  });
  // thiếu số liệu chung
  assert.deepEqual(dgBase({ ...khong, tong_cong: { ...khong.tong_cong, am: 0 } }, cham), []);
  const f = dgBase({ ...base, tong_cong: { ...base.tong_cong, am: 0 } }, cham).find((m) => m.ma === 'DEN_CUNG_NGAY_THAP');
  assert.ok(f);
  assert.equal(f.sheet, 5);
  assert.equal(f.so_lieu.bcvh_thap.length, 1);
  assert.equal(f.so_lieu.bcvh_thap[0].ma, TH);
  assert.equal(f.so_lieu.bcvh_thap[0].so_chuyen_cham, 3);
  assert.equal(f.so_lieu.bcvh_thap[0].khung_gio_lap_nhieu_nhat, '21');
  assert.ok(f.noi_dung.includes('90%') && f.noi_dung.includes('96%') && f.noi_dung.includes('100/1.000'));
  // mẫu nhỏ -> không hiện; sát mức chung -> không hiện; trên ngưỡng tuyệt đối -> không hiện
  assert.equal(dgBase({ tong_cong: { ty_le_cung_ngay: 0.96, am: 0 }, theo_bcvh: { [TH]: bcvh(100, 90) } }, cham).length, 0);
  assert.equal(dgBase({ tong_cong: { ty_le_cung_ngay: 0.92, am: 0 }, theo_bcvh: { [TH]: bcvh(1000, 900) } }, cham).length, 0);
  assert.equal(dgBase({ tong_cong: { ty_le_cung_ngay: 0.99, am: 0 }, theo_bcvh: { [TH]: bcvh(1000, 960) } }, cham).length, 0);
});

// ---------- xuất xlsx: đẳng thức số dòng ----------
test('xuất: số dòng mỗi sheet = số API (tong-hop, chua-thay, danh-gia); sheet «Thông tin» ghi số dòng kiểm tra và «khớp»', async () => {
  duLieu();
  const th = await layTong();
  const ct = (await goi(`/api/ktt/doi-chieu/chua-thay?${DEN}`)).body;
  const dg = (await goi(URL_DG)).body;
  const tc = th.tong_cong.tap_chinh;
  const kiVong = {
    1: tc.chua_thay, 2: ct.chuyen_mat_dau.danh_sach.reduce((s, c) => s + c.so_chua_thay, 0), 3: dg.danh_gia.find((m) => m.ma === 'CHUYEN_TIEP_CHUA_QUET_DI').so_lieu.tong,
    4: tc.bcvh_khac, 5: dg.so_dong_sheet[5].so_dong, 6: th.theo_ngay.length * 6
  };
  for (let s = 1; s <= 6; s++) {
    const b = await bang(s);
    assert.equal(b.dong.length, kiVong[s], `sheet ${s}`);
    assert.equal(dg.so_dong_sheet[s].so_dong, kiVong[s], `so_dong_sheet ${s}`);
    assert.equal(b.ttin['Số dòng kiểm tra'], kiVong[s]);
    assert.ok(String(b.ttin['Đối chiếu với màn hình']).includes('khớp số dòng'), `sheet ${s}`);
    assert.ok(!String(b.ttin['Đối chiếu với màn hình']).includes('KHÔNG khớp'), `sheet ${s}`);
    assert.equal(b.r.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(b.r.headers.get('content-disposition'), new RegExp(`KTT_DoiChieu_.*_2026-10-18_2026-10-22\\.xlsx`));
    assert.equal(b.r.headers.get('cache-control'), 'no-store');
    for (const k of ['Khoảng ngày đối chiếu được', 'Dữ liệu đến', 'Chốt số theo ngày', 'Ngày xuất, người xuất', 'Trạng thái số liệu', 'Định nghĩa: nhóm của sheet', 'Đơn vị']) assert.ok(b.ttin[k], `${s} ${k}`);
    assert.ok(String(b.ttin['Ngày xuất, người xuất']).includes('KT164_TTVH'));
    for (const v of Object.values(b.ttin)) assert.ok(!CAM.test(String(v)));
  }
  // giá trị dự kiến của bộ dữ liệu giả (kiểm tra thủ công): 6 chưa thấy ở thanh 1, 1 thấy ở BCVH khác, 3 chuyển tiếp, 15 SHBG của 3 chuyến mất dấu, 1 chuyến chậm
  assert.deepEqual([1, 2, 3, 4, 5].map((s) => kiVong[s]), [6, 15, 3, 1, 1]);
  // sheet 6: cộng đúng tổng
  const b6 = await bang(6);
  const i = (k) => cotCua(6, k);
  assert.equal(b6.dong.reduce((s, r) => s + r[i('da_co')], 0), th.tong_cong.da_ghi_di.tai_dich);
  assert.equal(b6.dong.reduce((s, r) => s + r[i('tong')], 0), th.tong_cong.da_ghi_di.trong_cua_so);
  assert.equal(b6.dong.reduce((s, r) => s + r[i('ngoai_cua_so')], 0), th.tong_cong.da_ghi_di.ngoai_cua_so);
  for (const r of b6.dong) assert.equal(r[i('ty_le')], r[i('tong')] > 0 ? Math.round((r[i('da_co')] / r[i('tong')]) * 10000) / 10000 : null);
});

test('xuất sheet 1: cột, nhãn nguồn / lý do (không có «túi đi ngoài chưa mở»), cột «Có thể do BCVH thiếu dữ liệu», giờ không lệch múi giờ', async () => {
  duLieu();
  const b = await bang(1);
  const c = (k) => cotCua(1, k);
  assert.deepEqual(b.tieuDe.slice(0, 3), ['SHBG', 'BCVH đích (mã)', 'BCVH đích (tên)']);
  const theoShbg = Object.fromEntries(b.dong.map((r) => [r[c('shbg')], r]));
  assert.deepEqual(Object.keys(theoShbg).sort(), ['S1', 'S2', 'S3', 'S4', 'S5', 'S8'].map((s) => `KTT-DEMO-${s}`));
  const nguon = Object.fromEntries(Object.entries(theoShbg).map(([k, r]) => [k.slice(9), r[c('nguon')]]));
  assert.deepEqual(nguon, { S1: 'Túi khai thác đến chưa quét đi', S2: 'Kiện đi ngoài', S3: 'Kiện đi ngoài', S4: 'Khác', S5: 'Khác', S8: 'Túi chuyển tiếp đã chia sẵn' });
  assert.equal(theoShbg['KTT-DEMO-S2'][c('ly_do')], 'Kiện đi ngoài đã xác nhận, chưa lập BD10 đi');
  assert.equal(theoShbg['KTT-DEMO-S3'][c('ly_do')], 'Kiện đi ngoài chưa xác nhận');
  assert.equal(theoShbg['KTT-DEMO-S5'][c('nghi')], 'Có'); // đích Hương Trà thiếu file 21/10
  assert.equal(theoShbg['KTT-DEMO-S1'][c('nghi')], 'Không');
  assert.equal(theoShbg['KTT-DEMO-S5'][c('ma_bcvh')], HT);
  assert.equal(theoShbg['KTT-DEMO-S1'][c('ten_bcvh')], 'Thuận Hóa');
  assert.equal(gioChuoi(theoShbg['KTT-DEMO-S1'][c('gio_ktt')]), GIO);
  assert.equal(theoShbg['KTT-DEMO-S1'][c('ngay_den')], '2026-10-20');
  assert.equal(theoShbg['KTT-DEMO-S1'][c('tuoi_gio')], 76.5); // 23/10 10:00 - 20/10 05:30
  assert.equal(theoShbg['KTT-DEMO-S8'][c('bd8')], 'KTT-DEMO-BD8-S8');
  const labels = [...Object.values(DC.LY_DO), ...Object.values(DX.NHAN_NGUON), ...b.dong.map((r) => `${r[c('nguon')]} ${r[c('ly_do')]}`)];
  for (const l of labels) assert.ok(!CAM.test(l), l);
  // sắp theo (ngày, SHBG)
  const ds = b.dong.map((r) => r[c('shbg')]);
  assert.deepEqual(ds, [...ds].sort());
});

test('xuất sheet 2: chuyến mất dấu — loại, ngày trong tuần, Chủ nhật được đánh dấu; chuyến có SHBG thấy hoặc dưới 5 SHBG không vào', async () => {
  duLieu();
  const b = await bang(2);
  const c = (k) => cotCua(2, k);
  const nhom = {};
  for (const r of b.dong) { const k = r[c('ma_bd10')]; (nhom[k] = nhom[k] || []).push(r); }
  assert.deepEqual(Object.keys(nhom).sort(), ['BD10-T2', 'BD10-T3', 'BD10-T7']);
  assert.ok(nhom['BD10-T2'].every((r) => r[c('loai')] === 'Mất dấu chắc chắn' && r[c('thu')] === 'Thứ ba' && r[c('chu_nhat')] === 'Không'));
  assert.ok(nhom['BD10-T3'].every((r) => r[c('loai')] === 'Nghi ngờ thiếu file dữ liệu của BCVH' && r[c('ma_bcvh')] === HT));
  assert.ok(nhom['BD10-T7'].every((r) => r[c('thu')] === 'Chủ nhật' && r[c('chu_nhat')] === 'Có' && r[c('loai')] === 'Mất dấu chắc chắn'));
  assert.equal(gioChuoi(nhom['BD10-T7'][0][c('gio_lap')]), '2026-10-18 08:00:00');
  assert.equal(nhom['BD10-T2'].length, 5);
});

test('xuất sheet 3 và 4: chuyển tiếp chưa quét đi (loại đích), thấy ở BCVH khác (nơi thật sự thấy, giờ BCVH nhận)', async () => {
  duLieu();
  const b3 = await bang(3);
  const c3 = (k) => cotCua(3, k);
  assert.deepEqual(b3.dong.map((r) => r[c3('shbg')]).sort(), ['S2', 'S3', 'S8'].map((s) => `KTT-DEMO-${s}`));
  assert.ok(b3.dong.every((r) => r[c3('loai_dich')] === 'BCVH Huế' && r[c3('ma_bcvh')] === TH));
  const b4 = await bang(4);
  const c4 = (k) => cotCua(4, k);
  assert.equal(b4.dong.length, 1);
  assert.equal(b4.dong[0][c4('shbg')], 'KTT-DEMO-S6');
  assert.equal(b4.dong[0][c4('ma_du_kien')], TH);
  assert.equal(b4.dong[0][c4('ma_thay')], HT);
  assert.equal(gioChuoi(b4.dong[0][c4('gio_bcvh')]), '2026-10-20 10:30:00');
  assert.equal(gioChuoi(b4.dong[0][c4('gio_ktt')]), GIO);
});

test('xuất sheet 5: chuyến chậm theo hằng số CHUYEN_CHAM; C1/C2/C3 trống; sheet 5 và 6 không duyệt SHBG', async () => {
  duLieu();
  const b = await bang(5);
  const c = (k) => cotCua(5, k);
  assert.deepEqual(b.dong.map((r) => r[c('ma_bd10')]), ['BD10-TC']);
  const r = b.dong[0];
  assert.equal(r[c('p50')], 13.017); // 20:00 - 07:00 = 13 giờ, cận trên bin phút
  assert.equal(r[c('so_shbg')], 5);
  assert.equal(r[c('mau')], 5);
  assert.deepEqual([r[c('c1')], r[c('c2')], r[c('c3')]], [null, null, null]);
  assert.equal(gioChuoi(r[c('gio_di')]), '2026-10-20 07:00:00');
  assert.ok(b.ttin['Định nghĩa: nhóm của sheet'].includes(`${DC.CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO} giờ`));
  assert.ok(b.ttin['Định nghĩa: nhóm của sheet'].includes('C1, C2, C3'));
});

test('xuất: lọc ma_bcvh khớp tong-hop cùng bộ lọc; danh sách rỗng vẫn ra file đúng cấu trúc', async () => {
  duLieu();
  const q = `${DEN}&ma_bcvh=${HT}`;
  const th = await layTong(q);
  const b1 = await bang(1, q);
  assert.equal(b1.dong.length, th.tong_cong.tap_chinh.chua_thay);
  assert.deepEqual(b1.dong.map((r) => r[0]), ['KTT-DEMO-S5']);
  const b2 = await bang(2, q);
  assert.ok(b2.dong.length === 5 && b2.dong.every((r) => r[cotCua(2, 'ma_bcvh')] === HT));
  assert.equal((await bang(3, q)).dong.length, 0);
  assert.equal((await bang(6, q)).dong.length, 5);
  // không có dữ liệu KTT: sheet 1–5 chỉ có dòng tiêu đề, sheet 6 vẫn một dòng mỗi (BCVH, ngày)
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  Api.xoaCache();
  for (let s = 1; s <= 5; s++) assert.equal((await bang(s)).dong.length, 0, `sheet ${s}`);
  const b6 = await bang(6);
  assert.equal(b6.dong.length, 30);
  assert.ok(b6.dong.every((r) => r[cotCua(6, 'da_co')] === 0 && r[cotCua(6, 'ty_le')] === null));
});

test('xuất: vượt trần số dòng -> 400 KTT_QUA_NHIEU_DONG (không gửi file dở)', async () => {
  duLieu();
  const cu = process.env.KTT_XUAT_TRAN_DONG;
  process.env.KTT_XUAT_TRAN_DONG = '2';
  try {
    for (const s of [1, 2, 3]) {
      const r = await goi(urlXuat(s));
      assert.equal(r.status, 400, `sheet ${s}`);
      assert.equal(r.body.ma, 'KTT_QUA_NHIEU_DONG');
    }
  } finally { if (cu === undefined) delete process.env.KTT_XUAT_TRAN_DONG; else process.env.KTT_XUAT_TRAN_DONG = cu; }
});

test('xuất: nguồn truy vấn dùng chung — thay đổi dữ liệu BCVH thì danh-gia, tong-hop và file xuất cùng đổi, vẫn khớp', async () => {
  duLieu();
  const truoc = (await bang(1)).dong.length;
  // thêm SHBG S1 vào file Thuận Hóa 20/10 (đợt chiều) -> S1 thành «tại đích»
  fileBcvh(TH, '2026-10-20', '18:00:00', [['KTT-DEMO-S1', '2026-10-20 09:00:00']]);
  const sau = await bang(1);
  assert.equal(sau.dong.length, truoc - 1);
  assert.equal(sau.dong.length, (await layTong()).tong_cong.tap_chinh.chua_thay);
  assert.ok(!sau.dong.some((r) => r[0] === 'KTT-DEMO-S1'));
});

// ---------- hàm thuần ----------
test('thuCua / laChuNhat không phụ thuộc múi giờ; nhãn nguồn không có «túi đi ngoài chưa mở»', () => {
  assert.equal(DX.thuCua('2026-10-18'), 0);
  assert.equal(DX.thuCua('2026-10-18 23:59:59'), 0);
  assert.equal(DX.thuCua('2026-10-19'), 1);
  assert.equal(DX.thuCua('2026-10-24 00:00:00'), 6);
  assert.equal(DX.thuCua(null), null);
  assert.equal(DX.thuCua('khong-hop-le'), null);
  assert.ok(DX.laChuNhat('2026-10-25'));
  assert.equal(DX.THU[0], 'Chủ nhật');
  const tatCa = JSON.stringify([DC.LY_DO, DX.NHAN_NGUON, DX.SHEET, DX.THU]);
  assert.ok(!CAM.test(tatCa));
  assert.equal(new Set(Object.values(DX.NHAN_NGUON)).size, 4); // Kiện đi ngoài / Túi chuyển tiếp đã chia sẵn / Túi khai thác đến chưa quét đi / Khác
});

test('ghepChuyenCham (hàm thuần): ngưỡng trung vị và số mẫu tối thiểu; ghepChuyenTiepChuaQuet cộng đúng và lọc theo BCVH', () => {
  const doPhu = { bcvh: MA_BCVH_HUE.map((ma) => ({ ma, theo_ngay: [{ ngay: '2026-10-20', trong_cua_so: ma !== HT, co_the_duong_tinh_gia: false }] })) };
  const bo = DC.taoNgayDoiChieu('2026-10-20');
  const hist = (...phut) => phut.reduce((o, p) => { o[p] = (o[p] || 0) + 1; return o; }, {});
  bo.bcvh[TH].chuyen = {
    a: { b: 'B-A', g: '2026-10-20 07:00:00', n: 6, ct: 0, nt: 6, h: hist(361, 361, 361, 361, 361, 361) }, // trung vị 6,033 giờ > 6
    b: { b: 'B-B', g: '2026-10-20 08:00:00', n: 6, ct: 0, nt: 6, h: hist(360, 360, 360, 360, 360, 360) }, // 6,0 giờ + cận trên bin phút = 6,017 vẫn > 6
    c: { b: 'B-C', g: '2026-10-20 09:00:00', n: 4, ct: 0, nt: 4, h: hist(900, 900, 900, 900) }, // quá ít mẫu
    d: { b: 'B-D', g: '2026-10-20 10:00:00', n: 6, ct: 0, nt: 6, h: hist(60, 60, 60, 60, 60, 60) } // nhanh
  };
  bo.bcvh[HT].chuyen = { e: { b: 'B-E', g: '2026-10-20 11:00:00', n: 9, ct: 0, nt: 9, h: hist(...Array(9).fill(2000)) } }; // ngày ngoài cửa sổ của HT
  bo.bcvh[TH].ctcq = 2; bo.bcvh[HT].ctcq = 3; bo.ctcq_khac = 4;
  const p = { ngays: ['2026-10-20'], bo: { '2026-10-20': bo }, doPhu, maBcvh: null };
  const ch = DC.ghepChuyenCham(p);
  assert.equal(ch.tong_chuyen, 4); // chuyến e (ngoài cửa sổ) không tính
  assert.deepEqual(ch.danh_sach.map((c) => c.ma_bd10), ['B-A', 'B-B']);
  assert.ok(ch.danh_sach[0].p50_gio > DC.CHUYEN_CHAM.NGUONG_TRUNG_VI_GIO);
  assert.equal(ch.so_shbg_chuyen_cham, 12);
  assert.match(ch.danh_sach[0].gio_den_trung_vi, /^2026-10-20 13:0[12]:/); // giờ đi 07:00 + cận trên bin phút của trung vị
  assert.deepEqual(DC.ghepChuyenTiepChuaQuet(p), { tong: 9, thuoc_bcvh_hue: 5, khac: 4, theo_bcvh: Object.fromEntries(MA_BCVH_HUE.map((m) => [m, m === TH ? 2 : m === HT ? 3 : 0])) });
  const rieng = DC.ghepChuyenTiepChuaQuet({ ...p, maBcvh: TH });
  assert.deepEqual([rieng.tong, rieng.thuoc_bcvh_hue, rieng.khac], [2, 2, 0]);
  assert.equal(DC.ghepChuyenTiepChuaQuet({ ngays: ['2026-10-20'], bo: {}, maBcvh: null }).tong, 0);
});

// ---------- giới hạn xếp hàng xuất sheet 1–4 ----------
test('hàng đợi xuất: hai yêu cầu liên tiếp đều thành công; bộ đếm về 0', async () => {
  duLieu();
  assert.equal(Api.trangThaiXuat.dem, 0);
  assert.equal((await goi(urlXuat(1))).status, 200);
  assert.equal((await goi(urlXuat(3))).status, 200);
  assert.equal(Api.trangThaiXuat.dem, 0);
});

test('hàng đợi xuất: ba yêu cầu cùng lúc -> lượt ba bị 429 KTT_XUAT_BAN; bộ đếm về 0 kể cả khi một lượt lỗi; sheet 5, 6 không bị giới hạn', async () => {
  duLieu();
  const q = { tu: '2026-10-18', den: '2026-10-22' };
  const kq = await Promise.allSettled([Api.xuatDoiChieu(db, q, 1), Api.xuatDoiChieu(db, { ...q, ma_bcvh: '000000' }, 3), Api.xuatDoiChieu(db, q, 4)]);
  assert.equal(kq[0].status, 'fulfilled');
  assert.equal(kq[1].status, 'rejected'); // lượt lỗi (mã BCVH lạ) vẫn trả bộ đếm
  assert.equal(kq[1].reason.code, 'KTT_BCVH_SAI');
  assert.equal(kq[2].status, 'rejected');
  assert.equal(kq[2].reason.code, 'KTT_XUAT_BAN');
  assert.match(kq[2].reason.message, /Đang có xuất khác, thử lại sau ít phút/);
  assert.equal(Api.trangThaiXuat.dem, 0);
  // sau đó lại xuất được; sheet 5, 6 không đếm
  const song = await Promise.all([Api.xuatDoiChieu(db, q, 2), Api.xuatDoiChieu(db, q, 5), Api.xuatDoiChieu(db, q, 6), Api.xuatDoiChieu(db, q, 5)]);
  assert.equal(song.length, 4);
  assert.equal(Api.trangThaiXuat.dem, 0);
  // qua HTTP: đang bận -> 429 JSON đúng mã (sheet 5 vẫn 200)
  Api.trangThaiXuat.dem = 2;
  try {
    const r = await goi(urlXuat(2));
    assert.equal(r.status, 429);
    assert.equal(r.body.ma, 'KTT_XUAT_BAN');
    assert.equal((await goi(urlXuat(5))).status, 200);
  } finally { Api.trangThaiXuat.dem = 0; }
  assert.equal((await goi(urlXuat(2))).status, 200);
});

test('thuật ngữ hiển thị: tiêu đề cột, nhãn loại và sheet «Thông tin» dùng chữ mới, không còn chữ cũ', async () => {
  duLieu();
  for (const s of [1, 2, 3, 4, 5, 6]) for (const col of DX.SHEET[s].cot) assert.ok(!CAM.test(col.tieuDe), `${s} ${col.khoa}`);
  assert.deepEqual(DX.SHEET[5].cot.filter((x) => /bưu gửi tới/.test(x.tieuDe)).map((x) => x.tieuDe), ['Giờ BCVH nhận (lúc 50% bưu gửi tới)', 'Thời gian để 50% bưu gửi tới (giờ)', 'Thời gian để 90% bưu gửi tới (giờ)']);
  const b5 = await bang(5);
  assert.ok(String(b5.ttin['Định nghĩa: 50% / 90% bưu gửi tới']).includes('hàng chưa thấy không tính'));
  const b2 = await bang(2);
  const loai = new Set(b2.dong.map((r) => r[cotCua(2, 'loai')]));
  assert.deepEqual([...loai].sort(), ['Mất dấu chắc chắn', 'Nghi ngờ thiếu file dữ liệu của BCVH']);
});
