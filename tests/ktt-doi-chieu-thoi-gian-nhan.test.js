// ==========================================
// Test KTT-16-3: thời gian BCVH nhận, chuyến mất dấu, nguồn «chưa thấy» — kttDoiChieu.ghepThoiGianNhan / ghepChuyenMatDau / ghepChuaThay, GET /api/ktt/doi-chieu/{thoi-gian-nhan,chua-thay}.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx do test tự dựng). Không mở data/, không DB thật, không mạng. Độ mới KTT 23/10/2026 10:00.
// Kịch bản chung: sáu BCVH có file 20/10..28/10 (hai đợt mỗi ngày) trừ Hương Trà vắng 21/10 -> cửa sổ kiểm tra được 20/10..26/10; ngày 19/10 (trước ngày đầu) ngoài cửa sổ.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const DC = require('../server/lib/kttDoiChieu');
const Sch = require('../server/lib/sftpScheduler');
const { EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const Nong = require('../server/lib/kttNong');
const TS = require('../server/lib/thamSo');
const { MA_BCVH_HUE } = require('../server/lib/kttTinh');

const PORT = 5983;
const TH = '533140'; const HT = '535470';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT163_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT163_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT163_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT163_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-tgnhan-${Date.now()}.db` });
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
/** Hàng khai thác lại: túi ĐẾN (mở túi) + túi ĐI (nhan = BCVH đích; gioDi null = chưa lập BD10 đi). */
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd = quet }) {
  const den = tui({ chieu: 'DEN', luong, so_hieu_bd8: bd8, co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg);
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
/** Hàng chuyển tiếp đi (túi CHUYEN_TIEP_DI, KTT không mở túi), chưa lập BD10 đi. */
function ct(shbg, { quet, nhan = TH }) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong, so_hieu_bd8: bd8, to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'CT-01', bd10_di_ma_diem_nhan: nhan });
  bg(t, shbg);
}
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
/** Phủ 20..28/10 cho cả sáu BCVH (trừ Hương Trà vắng 21/10); `co[ma][ngay]` = SHBG có trong file S của ngày đó. */
function phuBcvh(co = {}, { bo = { [HT]: ['2026-10-21'] } } = {}) {
  for (let d = 20; d <= 28; d++) {
    const ngay = `2026-10-${d}`;
    for (const ma of MA_BCVH_HUE) {
      if ((bo[ma] || []).includes(ngay)) continue;
      fileBcvh(ma, ngay, '09:30:00', (co[ma] && co[ma][ngay]) || []);
      fileBcvh(ma, ngay, '15:00:00', []);
    }
  }
}

/**
 * Bộ dữ liệu. 19/10: Z1 (Thuận Hóa, chưa đi) — trước ngày đầu BCVH -> ngoài cửa sổ.
 * 20/10, chưa đi trên 24 giờ (tập chính): Y1 (có ở TH = đích), Y2 (chỉ ở HT), Y3 (không đâu), Y4 (cả TH lẫn HT), Y5 (đích HT, không đâu, HT thiếu file 21/10 -> nghi), CT1 (chuyển tiếp, không đâu),
 * Y6 (HÀNG HOÀN, có ở TH): bị loại khỏi tập chính. Đã ghi đi: G1 (cùng ngày, có ở TH), G2 (hôm sau, không đâu), G3 (đích HT, không đâu). 21/10: X1 (TH, có ở TH).
 */
function duLieu({ coHoan = true } = {}) {
  kt('KTT-DEMO-Z1', { quet: '2026-10-19 05:30:00' });
  kt('KTT-DEMO-Y1', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y2', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y3', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y4', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y5', { quet: '2026-10-20 05:30:00', nhan: HT });
  ct('KTT-DEMO-CT1', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y6', { quet: '2026-10-20 05:30:00' });
  if (coHoan) hoan('KTT-DEMO-Y6');
  kt('KTT-DEMO-G1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 07:00:00' });
  kt('KTT-DEMO-G2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-21 07:00:00' });
  kt('KTT-DEMO-G3', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 07:00:00', nhan: HT });
  kt('KTT-DEMO-X1', { quet: '2026-10-21 05:30:00' });
  capOk(BAY_GIO);
  phuBcvh({
    [TH]: { '2026-10-20': ['KTT-DEMO-Y1', 'KTT-DEMO-Y4', 'KTT-DEMO-Y6', 'KTT-DEMO-G1'], '2026-10-21': ['KTT-DEMO-X1'] },
    [HT]: { '2026-10-20': ['KTT-DEMO-Y2', 'KTT-DEMO-Y4'] }
  });
  Api.xoaCache();
}

async function goi(url, who = 'ttvh') {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  const ct2 = res.headers.get('content-type') || '';
  return { status: res.status, body: ct2.includes('json') ? await res.json() : null };
}
const DEN = '/api/ktt/doi-chieu/tong-hop?tu=2026-10-19&den=2026-10-22';
const ngayCua = (kq, d) => kq.theo_ngay.find((x) => x.ngay === d);

const GIO = '2026-10-20 05:30:00';

// ---------- dữ liệu giả riêng của 16-3 ----------
/** Hàng khai thác lại: túi ĐẾN + túi ĐI (BD10 đi dùng chung theo chuyến `bd10`; quet null = thiếu giờ quét túi đến). coDi=false: chỉ túi ĐẾN (chưa có túi đi). */
function ktB(shbg, { quet = GIO, gioDi = null, nhan = TH, bd10 = null, xnd = quet || GIO, coDi = true, luong = 'KHAI_THAC_DEN', bd8 = null }) {
  const den = tui({ chieu: 'DEN', luong, so_hieu_bd8: bd8, co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg);
  if (!coDi) return;
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? bd10 || `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
/** Kiện đi ngoài (túi CHUYEN_TIEP_DI): xnd null = chưa xác nhận; gioDi = đã lập BD10 đi. */
function kdn(shbg, { quet = GIO, xnd = quet, gioDi = null, nhan = TH, bd10 = null, luong = 'DI_NGOAI', bd8 = null }) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong, so_hieu_bd8: bd8, to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'CT-01',
    bd10_di_ma_diem_nhan: nhan, bd10_di_gio_di: gioDi, bd10_di_so_hieu: gioDi ? bd10 || `BD10-K-${seq}` : null });
  bg(t, shbg);
}
const nhieu = (tienTo, n) => Array.from({ length: n }, (_, i) => `${tienTo}${i + 1}`);

/**
 * 20/10: chuyến T1 (TH, 4 SHBG đều có ở TH: 90, 120, -60 phút và +1 ngày), T2 (TH, 5 SHBG không thấy), T3 (HT, 5 SHBG không thấy; HT vắng file 21/10 -> nghi), T4 (TH: 1 thấy, 1 không).
 * 21/10: chuyến T5 (TH, 2 SHBG có ở TH: 60, 150 phút). Thanh 1 (20/10, chưa đi): S1 túi khai thác chưa có túi đi, S2 kiện đi ngoài đã xác nhận, S3 kiện đi ngoài chưa xác nhận, S4 khai thác chưa xác nhận.
 * Thiếu giờ quét túi đến (đã ghi đi): K1 khai thác (không thấy), K2 khai thác (có ở HT), K3 kiện đi ngoài (không thấy).
 */
function duLieuTg() {
  const d20 = '2026-10-20';
  const g = (h) => `${d20} ${h}`;
  for (const s of ['A1', 'A2', 'A3', 'A4']) ktB(`KTT-DEMO-${s}`, { gioDi: g('07:00:00'), bd10: 'BD10-T1' });
  for (const s of nhieu('M', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('08:00:00'), bd10: 'BD10-T2' });
  for (const s of nhieu('N', 5)) ktB(`KTT-DEMO-${s}`, { gioDi: g('08:00:00'), bd10: 'BD10-T3', nhan: HT });
  for (const s of ['P1', 'P2']) ktB(`KTT-DEMO-${s}`, { gioDi: g('09:00:00'), bd10: 'BD10-T4' });
  for (const s of ['R1', 'R2']) ktB(`KTT-DEMO-${s}`, { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 07:00:00', bd10: 'BD10-T5' });
  ktB('KTT-DEMO-S1', { coDi: false });
  kdn('KTT-DEMO-S2', {});
  kdn('KTT-DEMO-S3', { xnd: null });
  ktB('KTT-DEMO-S4', { xnd: null });
  ktB('KTT-DEMO-K1', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  ktB('KTT-DEMO-K2', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  kdn('KTT-DEMO-K3', { quet: null, xnd: GIO, gioDi: g('07:00:00'), bd10: 'BD10-T6' });
  capOk(BAY_GIO);
  const hang = (arr, h) => arr.map((s) => [`KTT-DEMO-${s}`, `${d20} ${h}`]);
  phuBcvh({
    [TH]: {
      [d20]: [...hang(['A1'], '08:30:00'), ...hang(['A2'], '09:00:00'), ...hang(['A3'], '06:00:00'), ...hang(['P1'], '10:00:00')],
      '2026-10-21': [['KTT-DEMO-A4', '2026-10-21 07:00:00'], ['KTT-DEMO-R1', '2026-10-21 08:00:00'], ['KTT-DEMO-R2', '2026-10-21 09:30:00']]
    },
    [HT]: { [d20]: hang(['K2'], '10:30:00') }
  });
  Api.xoaCache();
}
const TG = '/api/ktt/doi-chieu/thoi-gian-nhan?tu=2026-10-19&den=2026-10-22';
const CT = '/api/ktt/doi-chieu/chua-thay?tu=2026-10-19&den=2026-10-22';

// ---------- (a) thời gian nhận ----------
test('(a) p50 / p90 / cùng ngày theo BCVH đích; độ trễ âm đếm riêng; mau_tong = tai_dich thanh 2 trong cửa sổ', async () => {
  duLieuTg();
  const r = await goi(TG);
  assert.equal(r.status, 200);
  const th = r.body.theo_bcvh[TH];
  // TH: 90, 120, -60, 1440 (A1..A4), 60 (P1), 60, 150 (R1, R2) -> 6 mẫu không âm, 1 âm
  assert.deepEqual([th.mau_tong, th.mau, th.am], [7, 6, 1]);
  assert.equal(th.ty_le_am, Number((1 / 7).toFixed(4)));
  assert.equal(th.p50_gio, Number((91 / 60).toFixed(3)), 'rank 3/6 -> 90 phút, cận trên bin');
  assert.equal(th.p90_gio, Number((1441 / 60).toFixed(3)), 'rank 6/6 -> 1440 phút');
  assert.ok(th.p50_gio <= th.p90_gio);
  assert.equal(th.cung_ngay, 5, 'A4 đến hôm sau');
  assert.equal(th.ty_le_cung_ngay, Number((5 / 6).toFixed(4)));
  assert.equal(r.body.theo_bcvh[HT].mau_tong, 0);
  assert.equal(r.body.theo_bcvh[HT].p50_gio, null);
  const tc = (await goi(DEN)).body;
  for (const ma of MA_BCVH_HUE) {
    const s = r.body.theo_bcvh[ma];
    const tai = tc.theo_ngay.reduce((n, d) => n + (d.theo_bcvh[ma].trong_cua_so ? d.theo_bcvh[ma].da_ghi_di.tai_dich : 0), 0);
    assert.equal(s.mau_tong, tai, `${ma}: mau + am = số tai_dich thanh 2 trong cửa sổ`);
  }
  assert.equal(r.body.tong_cong.mau_tong, 7);
  const n20 = ngayCua(r.body, '2026-10-20').theo_bcvh[TH];
  assert.deepEqual([n20.mau, n20.am], [4, 1]);
  assert.equal(ngayCua(r.body, '2026-10-21').theo_bcvh[TH].p50_gio, Number((61 / 60).toFixed(3)));
  assert.deepEqual(r.body.cua_so_thuc_te, { tu: '2026-10-20', den: '2026-10-22' });
  assert.equal(r.body.meta.hang_hoan_chua_nap, true);
  assert.ok(r.body.meta.nghi_duong_tinh_gia);
});

test('(a) nhóm thiếu giờ quét túi đến không vào mẫu; ma_bcvh lọc theo đích; mã lạ 400; GDVH / TIVI 403; không token 401', async () => {
  duLieuTg();
  const r = (await goi(`${TG}&ma_bcvh=${TH}`)).body;
  assert.deepEqual(Object.keys(r.theo_bcvh), [TH]);
  assert.equal(r.theo_bcvh[TH].mau_tong, 7, 'K2 có ở HT (nhóm thiếu giờ quét) không vào TH');
  assert.equal((await goi(`${TG}&ma_bcvh=999999`)).status, 400);
  assert.equal((await goi(`${TG}&khong_co=1`)).status, 400);
  assert.equal((await goi('/api/ktt/doi-chieu/thoi-gian-nhan?tu=2026-10-20')).body.ma, 'KTT_THIEU_THAM_SO');
  assert.equal((await goi(TG, 'admin')).status, 200);
  assert.equal((await goi(TG, 'gdvh')).status, 403);
  assert.equal((await goi(TG, 'tivi')).status, 403);
  assert.equal((await goi(TG, null)).status, 401);
  assert.equal((await goi(CT, 'gdvh')).status, 403);
  assert.equal((await goi(CT, null)).status, 401);
});

// ---------- (b) chuyến mất dấu ----------
test('(b) chuyến mất dấu: T2 chắc, T3 nghi thiếu file (HT vắng 21/10), T4 (50%) không; tổng ≤ chưa thấy; phân bố cộng đúng', async () => {
  duLieuTg();
  const r = await goi(CT);
  assert.equal(r.status, 200);
  const m = r.body.chuyen_mat_dau;
  assert.equal(m.tong_chuyen, 5, 'T1 T2 T3 T4 T5 (nhóm thiếu giờ quét túi đến không có chuyến)');
  assert.equal(m.tong_shbg_da_ghi_di, 18);
  assert.deepEqual(m.phan_bo_ty_le_chua_thay, { khong: 2, duoi_10: 0, tu_10_den_duoi_50: 0, tu_50_den_duoi_100: 1, het: 2 });
  assert.equal(m.so_chuyen_mat_dau, 2);
  assert.deepEqual(m.mat_dau_chac, { so_chuyen: 1, so_shbg: 5 });
  assert.deepEqual(m.nghi_thieu_file, { so_chuyen: 1, so_shbg: 5 });
  const bd = Object.fromEntries(m.danh_sach.map((x) => [x.ma_bd10, x]));
  assert.equal(bd['BD10-T2'].loai, 'MAT_DAU_CHAC');
  assert.equal(bd['BD10-T2'].ma_bcvh_dich, TH);
  assert.equal(bd['BD10-T3'].loai, 'NGHI_THIEU_FILE');
  assert.equal(bd['BD10-T3'].ty_le_chua_thay, 1);
  assert.equal(bd['BD10-T4'], undefined);
  const tc = (await goi(DEN)).body.tong_cong.da_ghi_di;
  assert.equal(tc.tong_da_phan_loai, m.tong_shbg_da_ghi_di);
  assert.ok(m.mat_dau_chac.so_shbg + m.nghi_thieu_file.so_shbg <= tc.chua_thay, 'tổng SHBG chuyến mất dấu ≤ chưa thấy thanh 2');
  assert.equal(tc.chua_thay, 11);
  assert.equal((await goi(`${CT}&ma_bcvh=${HT}`)).body.chuyen_mat_dau.tong_chuyen, 1);
});

// ---------- (c) nguồn chưa thấy ----------
test('(c) thanh 1: hai cách chia cộng đúng bằng chưa thấy của tong-hop; lý do đúng; nhãn không dùng khái niệm «mở» cho kiện đi ngoài', async () => {
  duLieuTg();
  const r = await goi(CT);
  const t1 = r.body.nguon_chua_thay.thanh_1;
  const tc = (await goi(DEN)).body.tong_cong.tap_chinh;
  assert.equal(t1.tong, tc.chua_thay, 'thanh_1.tong = chưa thấy thanh 1 của 16-2');
  assert.equal(t1.tong, 4);
  assert.equal(Object.values(t1.theo_bcvh).reduce((s, n) => s + n, 0), t1.tong, 'chia theo BCVH');
  assert.equal(t1.theo_ly_do.reduce((s, x) => s + x.so_luong, 0), t1.tong, 'chia theo lý do');
  const ly = Object.fromEntries(t1.theo_ly_do.map((x) => [x.ma, x.so_luong]));
  assert.deepEqual(ly, { KDN_DA_XAC_NHAN: 1, KDN_CHUA_XAC_NHAN: 1, TUI_CHUA_QUET_DI: 1, KHAC: 1 });
  assert.ok(t1.theo_ly_do.every((x) => !/chưa mở/.test(x.nhan)));
  for (const ma of MA_BCVH_HUE) assert.equal(Object.values(t1.theo_bcvh_ly_do[ma]).reduce((s, n) => s + n, 0), t1.theo_bcvh[ma]);
  assert.equal(ngayCua({ theo_ngay: r.body.nguon_chua_thay.theo_ngay }, '2026-10-20').thanh_1.tong, 4);
});

test('(c) nhóm thiếu giờ quét túi đến: đã thấy + chưa thấy (theo nguồn) + ngoài cửa sổ = khong_phan_loai_da_ghi_di của tong-hop', async () => {
  duLieuTg();
  const k = (await goi(CT)).body.nguon_chua_thay.thieu_gio_quet_den;
  const kpl = (await goi(DEN)).body.tong_cong.da_ghi_di.khong_phan_loai_da_ghi_di;
  assert.equal(k.tong, kpl.tong);
  assert.equal(k.tong, 3);
  assert.equal(k.da_thay.tong + k.chua_thay.tong + k.ngoai_cua_so, k.tong);
  assert.deepEqual(k.da_thay.theo_bcvh_noi_den, { [HT]: 1 });
  assert.equal(k.chua_thay.tong, kpl.chua_thay);
  assert.equal(k.chua_thay.theo_nguon.reduce((s, x) => s + x.so_luong, 0), k.chua_thay.tong);
  assert.deepEqual(k.chua_thay.theo_nguon.map((x) => [x.ma, x.so_luong]), [['chuyen_tiep', 1], ['khai_thac', 1]]);
  assert.equal(k.nhan, 'Thiếu giờ quét túi đến ở KTT');
});

// ---------- cache, gộp ngày ----------
test('cache: ba route dùng chung bó ngày (không tính lại); file BCVH ngoài D..D+2 không đổi; file trong D..D+2 chỉ tính lại ngày liên quan', async () => {
  duLieuTg();
  const q = (u) => `/api/ktt/doi-chieu/${u}?tu=2026-10-20&den=2026-10-22`;
  await goi(q('tong-hop'));
  assert.equal(Api.thongKe().ngayDCTinh, 3);
  const a = (await goi(q('thoi-gian-nhan'))).body;
  const c = (await goi(q('chua-thay'))).body;
  assert.equal(Api.thongKe().ngayDCTinh, 3, 'ba route cùng bó');
  fileBcvh(TH, '2026-10-25', '18:00:00', []);
  await goi(q('thoi-gian-nhan'));
  assert.equal(Api.thongKe().ngayDCTinh, 3);
  fileBcvh(TH, '2026-10-23', '18:00:00', []);
  const b = (await goi(q('thoi-gian-nhan'))).body;
  assert.equal(Api.thongKe().ngayDCTinh, 5, 'chỉ 21 và 22');
  assert.deepEqual(b.theo_bcvh, a.theo_bcvh);
  assert.equal((await goi(q('chua-thay'))).body.nguon_chua_thay.thanh_1.tong, c.nguon_chua_thay.thanh_1.tong);
});

test('gộp nhiều ngày = tính trực tiếp trên cả khoảng (hàm thuần); phân vị khớp tính chính xác trong sai số 1 phút', () => {
  const ngays = ['2026-10-20', '2026-10-21', '2026-10-22'];
  let x = 12345;
  const ngau = () => { x = (x * 48271) % 0x7fffffff; return x / 0x7fffffff; };
  const doPhu = { bcvh: MA_BCVH_HUE.map((ma) => ({ ma, theo_ngay: ngays.map((ngay) => ({ ngay, trong_cua_so: true, co_the_duong_tinh_gia: false })) })) };
  const mau = [];
  const bo = {};
  for (const ngay of ngays) bo[ngay] = DC.taoNgayDoiChieu(ngay);
  const tatCa = DC.taoNgayDoiChieu('2026-10-20');
  const ghi = (b, s) => { const tg = b.bcvh[TH].tg; if (s < 0) { tg.am++; return; } tg.n++; const p = Math.floor(s / 60); tg.hist[p] = (tg.hist[p] || 0) + 1; };
  for (let i = 0; i < 3000; i++) {
    const s = Math.round(ngau() * ngau() * 4 * 3600 - 600);
    ghi(bo[ngays[i % 3]], s); ghi(tatCa, s);
    if (s >= 0) mau.push(s);
  }
  const gop = DC.ghepThoiGianNhan({ ngays, bo, doPhu }).theo_bcvh[TH];
  const truc = DC.ghepThoiGianNhan({ ngays: ['2026-10-20'], bo: { '2026-10-20': tatCa }, doPhu }).theo_bcvh[TH];
  assert.deepEqual(gop, truc, 'gộp ba ngày = một bó của cả khoảng');
  mau.sort((a, b) => a - b);
  for (const [p, key] of [[0.5, 'p50_gio'], [0.9, 'p90_gio']]) {
    const dung = mau[Math.ceil(p * mau.length) - 1] / 3600;
    assert.ok(gop[key] >= dung && gop[key] - dung <= 1 / 60 + 1e-9, `${key}: ${gop[key]} so với ${dung}`);
  }
  assert.equal(DC.phanViHist({}, 0, 0.5), null);
});

test('gộp chuyến qua nhiều ngày; ngày ngoài cửa sổ bị bỏ (hàm thuần)', () => {
  const ngays = ['2026-10-20', '2026-10-21'];
  const dp = (trong21) => ({ bcvh: MA_BCVH_HUE.map((ma) => ({ ma, theo_ngay: [{ ngay: ngays[0], trong_cua_so: true, co_the_duong_tinh_gia: false }, { ngay: ngays[1], trong_cua_so: trong21, co_the_duong_tinh_gia: true }] })) });
  const b = { [ngays[0]]: DC.taoNgayDoiChieu(ngays[0]), [ngays[1]]: DC.taoNgayDoiChieu(ngays[1]) };
  b[ngays[0]].bcvh[TH].chuyen.k = { b: 'B1', g: 'G1', n: 3, ct: 3 };
  b[ngays[1]].bcvh[TH].chuyen.k = { b: 'B1', g: 'G1', n: 2, ct: 2 };
  const r = DC.ghepChuyenMatDau({ ngays, bo: b, doPhu: dp(true) });
  assert.equal(r.tong_chuyen, 1);
  assert.deepEqual([r.danh_sach[0].so_shbg, r.danh_sach[0].so_chua_thay, r.danh_sach[0].loai], [5, 5, 'NGHI_THIEU_FILE']);
  const r2 = DC.ghepChuyenMatDau({ ngays, bo: b, doPhu: dp(false) });
  assert.deepEqual([r2.danh_sach.length, r2.tong_shbg_da_ghi_di], [0, 3], 'ngày 21 ngoài cửa sổ: chuyến chỉ còn 3 SHBG (< 5) nên không mất dấu');
});

test('không dùng đồng hồ máy / múi giờ máy trong mã mới (kiểm tĩnh)', () => {
  const ma = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttDoiChieu.js'), 'utf8');
  assert.ok(!/Date\.now\(|new Date\(\)|getTimezoneOffset|toLocale/.test(ma));
});

test('luồng DI_NGOAI xếp vào «Kiện đi ngoài» (thanh 1 và nhóm thiếu giờ quét đến), kể cả khi nguon_hang là khai_thac; không vào «Túi khai thác đến chưa quét đi»', async () => {
  ktB('KTT-DEMO-W1', { coDi: false, luong: 'DI_NGOAI' }); // đã xác nhận
  ktB('KTT-DEMO-W2', { coDi: false, luong: 'DI_NGOAI', xnd: null }); // chưa xác nhận
  ktB('KTT-DEMO-W3', { coDi: false }); // túi khai thác thật sự
  ktB('KTT-DEMO-W4', { quet: null, xnd: GIO, gioDi: '2026-10-20 07:00:00', bd10: 'BD10-TW', luong: 'DI_NGOAI' });
  ktB('KTT-DEMO-W5', { quet: null, xnd: GIO, gioDi: '2026-10-20 07:00:00', bd10: 'BD10-TW' });
  capOk(BAY_GIO);
  phuBcvh({});
  Api.xoaCache();
  const r = (await goi(CT)).body.nguon_chua_thay;
  const ly = Object.fromEntries(r.thanh_1.theo_ly_do.map((x) => [x.ma, x.so_luong]));
  assert.deepEqual(ly, { KDN_DA_XAC_NHAN: 1, KDN_CHUA_XAC_NHAN: 1, TUI_CHUA_QUET_DI: 1 });
  assert.equal(r.thanh_1.tong, 3);
  assert.deepEqual(r.thieu_gio_quet_den.chua_thay.theo_nguon.map((x) => [x.ma, x.so_luong]), [['chuyen_tiep', 1], ['khai_thac', 1]]);
  assert.equal(r.thieu_gio_quet_den.tong, 2);
});

test('chuyển tiếp luồng DA_CHIA_SAN (BD8 khác SHBG) có lý do riêng; BD8 trùng SHBG là kiện đi ngoài dù luồng khác; khóa theo_nguon cũ không đổi', async () => {
  kdn('KTT-DEMO-V1', { luong: 'DA_CHIA_SAN', bd8: 'BD8-KHAC-1' }); // đã chia sẵn, đã xác nhận
  kdn('KTT-DEMO-V2', { luong: 'DA_CHIA_SAN', bd8: 'BD8-KHAC-2', xnd: null }); // đã chia sẵn, chưa xác nhận
  kdn('KTT-DEMO-V3', { luong: 'DA_CHIA_SAN', bd8: 'KTT-DEMO-V3' }); // BD8 trùng SHBG -> kiện đi ngoài
  ktB('KTT-DEMO-V4', { coDi: false, luong: 'KHAI_THAC_DEN', bd8: 'KTT-DEMO-V4' }); // BD8 trùng SHBG -> kiện đi ngoài
  ktB('KTT-DEMO-V5', { coDi: false, bd8: 'BD8-KHAC-5' }); // túi khai thác
  kdn('KTT-DEMO-V6', { quet: null, xnd: GIO, gioDi: '2026-10-20 07:00:00', bd10: 'BD10-TV', luong: 'DA_CHIA_SAN', bd8: 'BD8-KHAC-6' });
  kdn('KTT-DEMO-V7', { quet: null, xnd: GIO, gioDi: '2026-10-20 07:00:00', bd10: 'BD10-TV', bd8: 'KTT-DEMO-V7' });
  ktB('KTT-DEMO-V8', { quet: null, xnd: GIO, gioDi: '2026-10-20 07:00:00', bd10: 'BD10-TV' });
  capOk(BAY_GIO);
  phuBcvh({});
  Api.xoaCache();
  const r = (await goi(CT)).body.nguon_chua_thay;
  const ly = Object.fromEntries(r.thanh_1.theo_ly_do.map((x) => [x.ma, x.so_luong]));
  assert.deepEqual(ly, { KDN_DA_XAC_NHAN: 2, TUI_CHUYEN_TIEP_DA_CHIA_SAN: 2, TUI_CHUA_QUET_DI: 1 });
  assert.equal(r.thanh_1.tong, 5);
  assert.equal(r.thanh_1.theo_ly_do.find((x) => x.ma === 'TUI_CHUYEN_TIEP_DA_CHIA_SAN').nhan, 'Túi chuyển tiếp đã chia sẵn, chưa quét đi');
  assert.deepEqual(r.thieu_gio_quet_den.chua_thay.theo_nguon.map((x) => [x.ma, x.so_luong]), [['chuyen_tiep', 1], ['khai_thac', 1], ['da_chia_san', 1]]);
  assert.equal(r.thieu_gio_quet_den.tong, 3);
});
