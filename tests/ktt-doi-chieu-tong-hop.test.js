// ==========================================
// Test KTT-16-2: ghép KTT ↔ «Hàng đến BCVH» và tổng hợp đối chiếu — server/lib/kttDoiChieu.js, Api.doiChieuTongHop, GET /api/ktt/doi-chieu/tong-hop.
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

const PORT = 5982;
const TH = '533140'; const HT = '535470';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT162_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT162_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT162_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT162_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-doi-chieu-${Date.now()}.db` });
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
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg);
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
/** Hàng chuyển tiếp đi (túi CHUYEN_TIEP_DI, KTT không mở túi), chưa lập BD10 đi. */
function ct(shbg, { quet, nhan = TH }) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DI_NGOAI', to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'CT-01', bd10_di_ma_diem_nhan: nhan });
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

// ---------- 1. phân loại ba loại, hàng hoàn bị loại, ngoài cửa sổ, hàng chuyển tiếp ----------
test('thanh 1: tai_dich / bcvh_khac / chua_thay đúng; SHBG ở đích và BCVH khác tính TAI_DICH; hàng chuyển tiếp trong tập chính; hàng hoàn bị loại; ngoài cửa sổ chỉ đếm', async () => {
  duLieu();
  const r = await goi(DEN);
  assert.equal(r.status, 200);
  const t = r.body.tong_cong.tap_chinh;
  assert.deepEqual([t.tai_dich, t.bcvh_khac, t.chua_thay], [3, 1, 3], 'Y1 Y4 X1 | Y2 | Y3 Y5 CT1');
  assert.equal(t.trong_cua_so, 7);
  assert.equal(t.ngoai_cua_so, 1, 'Z1 (19/10) trước ngày đầu của BCVH');
  assert.equal(t.tong, 8);
  assert.equal(r.body.tong_cong.hang_hoan_loai_khoi, 1, 'Y6 có trong ktt_hang_hoan: không ghép, không phân loại, chỉ trả số tham chiếu');
  const n20 = ngayCua(r.body, '2026-10-20');
  assert.deepEqual([n20.tap_chinh.tai_dich, n20.tap_chinh.bcvh_khac, n20.tap_chinh.chua_thay], [2, 1, 3]);
  assert.equal(n20.hang_hoan_loai_khoi, 1);
  assert.equal(n20.da_chot, true);
  const n19 = ngayCua(r.body, '2026-10-19');
  assert.deepEqual([n19.tap_chinh.tong, n19.tap_chinh.ngoai_cua_so, n19.tap_chinh.trong_cua_so], [1, 1, 0]);
  assert.equal(n19.theo_bcvh[TH].trong_cua_so, false);
  assert.equal(ngayCua(r.body, '2026-10-22').tap_chinh.tong, 0);
  assert.deepEqual(r.body.cua_so_thuc_te, { tu: '2026-10-20', den: '2026-10-22' });
  assert.equal(r.body.meta.hang_hoan_chua_nap, false);
});

test('đẳng thức mục 5: ba loại = chua_di_tren_24h trong cửa sổ = số ở /dicungngay/tong-hop; trong cửa sổ + ngoài cửa sổ = tổng cả khoảng', async () => {
  duLieu();
  const dc = (await goi(DEN)).body;
  const di = (await goi('/api/ktt/dicungngay/tong-hop?tu=2026-10-19&den=2026-10-22')).body;
  const t = dc.tong_cong.tap_chinh;
  assert.equal(t.tai_dich + t.bcvh_khac + t.chua_thay, t.trong_cua_so);
  assert.equal(t.trong_cua_so + t.ngoai_cua_so, di.bcvh_hue_khong_hang_hoan.chua_di_tren_24h, 'cả khoảng = /dicungngay (không hoàn)');
  assert.equal(t.tong, di.bcvh_hue_khong_hang_hoan.chua_di_tren_24h);
  assert.equal(dc.tong_cong.hang_hoan_loai_khoi, di.noi_tinh_den_bcvh.hang_hoan.tong_shbg);
  // khoảng chỉ gồm các ngày trong cửa sổ: bằng đúng số cùng khoảng ở /dicungngay
  const dc2 = (await goi('/api/ktt/doi-chieu/tong-hop?tu=2026-10-20&den=2026-10-21')).body;
  const di2 = (await goi('/api/ktt/dicungngay/tong-hop?tu=2026-10-20&den=2026-10-21')).body;
  assert.equal(dc2.tong_cong.tap_chinh.ngoai_cua_so, 0);
  assert.equal(dc2.tong_cong.tap_chinh.tai_dich + dc2.tong_cong.tap_chinh.bcvh_khac + dc2.tong_cong.tap_chinh.chua_thay, di2.bcvh_hue_khong_hang_hoan.chua_di_tren_24h);
  // mọi ngày: cộng theo ngày = tổng, cộng theo BCVH = ngày
  for (const d of dc.theo_ngay) {
    for (const nhom of ['tap_chinh', 'da_ghi_di']) {
      for (const f of ['tong', 'trong_cua_so', 'ngoai_cua_so', 'tai_dich', 'bcvh_khac', 'chua_thay', 'nghi_duong_tinh_gia']) {
        assert.equal(Object.values(d.theo_bcvh).reduce((s, b) => s + b[nhom][f], 0), d[nhom][f], `${d.ngay} ${nhom}.${f}`);
        assert.equal(dc.theo_ngay.reduce((s, x) => s + x[nhom][f], 0), dc.tong_cong[nhom][f], `tổng ${nhom}.${f}`);
      }
    }
  }
});

// ---------- 2. thanh 2 ----------
test('thanh 2: SHBG đã ghi đi (có giờ lập BD10 đi), không gồm hoàn, chia ba loại; cùng ngày và hôm sau đều tính', async () => {
  duLieu();
  const r = (await goi(DEN)).body;
  const g = r.tong_cong.da_ghi_di;
  assert.deepEqual([g.tai_dich, g.bcvh_khac, g.chua_thay], [1, 0, 2], 'G1 | - | G2 G3');
  assert.equal(g.tong, 3);
  assert.equal(g.tai_dich + g.bcvh_khac + g.chua_thay, g.trong_cua_so);
  const n20 = ngayCua(r, '2026-10-20');
  assert.equal(n20.da_ghi_di.tong, 3);
  assert.equal(n20.theo_bcvh[TH].da_ghi_di.tong, 2);
  assert.equal(n20.theo_bcvh[HT].da_ghi_di.tong, 1);
});

// ---------- 3. cờ dương tính giả ----------
test('ngày BCVH đích không có file: nghi_duong_tinh_gia là tập con của chua_thay, KHÔNG bỏ khỏi chua_thay; BCVH đủ file thì không nghi', async () => {
  duLieu();
  const r = (await goi(DEN)).body;
  const n20 = ngayCua(r, '2026-10-20');
  assert.equal(n20.theo_bcvh[HT].co_the_duong_tinh_gia, true, 'HT thiếu file 21/10 (nằm trong D..D+2 của 20/10)');
  assert.deepEqual(n20.theo_bcvh[HT].ngay_thieu_trong_d_d2, ['2026-10-21']);
  assert.equal(n20.theo_bcvh[HT].trang_thai, 'CO_DU_LIEU');
  assert.equal(n20.theo_bcvh[HT].tap_chinh.chua_thay, 1);
  assert.equal(n20.theo_bcvh[HT].tap_chinh.nghi_duong_tinh_gia, 1);
  assert.equal(n20.theo_bcvh[TH].co_the_duong_tinh_gia, false);
  assert.equal(n20.theo_bcvh[TH].tap_chinh.chua_thay, 2, 'Y3 và CT1');
  assert.equal(n20.theo_bcvh[TH].tap_chinh.nghi_duong_tinh_gia, 0);
  assert.equal(r.tong_cong.tap_chinh.nghi_duong_tinh_gia, 1);
  assert.ok(r.tong_cong.tap_chinh.nghi_duong_tinh_gia <= r.tong_cong.tap_chinh.chua_thay);
  assert.equal(r.tong_cong.da_ghi_di.nghi_duong_tinh_gia, 1, 'G3');
  const n21 = ngayCua(r, '2026-10-21');
  assert.equal(n21.theo_bcvh[HT].trang_thai, 'KHONG_CO_FILE');
});

// ---------- 4. tham số, quyền ----------
test('ma_bcvh lọc theo BCVH đích; mã lạ / khóa lạ / khoảng > 31 ngày / thiếu tham số -> 400; GDVH và TIVI 403; không token 401', async () => {
  duLieu();
  const th = (await goi(`${DEN}&ma_bcvh=${TH}`)).body;
  assert.equal(th.ma_bcvh, TH);
  assert.deepEqual(Object.keys(th.theo_ngay[0].theo_bcvh), [TH]);
  assert.deepEqual([th.tong_cong.tap_chinh.tai_dich, th.tong_cong.tap_chinh.bcvh_khac, th.tong_cong.tap_chinh.chua_thay], [3, 1, 2], 'Y1 Y4 X1 | Y2 | Y3 CT1');
  assert.equal(th.tong_cong.tap_chinh.ngoai_cua_so, 1);
  assert.equal(th.tong_cong.hang_hoan_loai_khoi, 1);
  const ht = (await goi(`${DEN}&ma_bcvh=${HT}`)).body;
  assert.deepEqual([ht.tong_cong.tap_chinh.tai_dich, ht.tong_cong.tap_chinh.bcvh_khac, ht.tong_cong.tap_chinh.chua_thay], [0, 0, 1], 'đích HT chỉ có Y5 (Y2 có ở HT nhưng đích là TH)');
  assert.equal((await goi(`${DEN}&ma_bcvh=999999`)).status, 400);
  assert.equal((await goi(`${DEN}&khong_co=1`)).status, 400);
  assert.equal((await goi('/api/ktt/doi-chieu/tong-hop?tu=2026-10-01&den=2026-11-05')).body.ma, 'KTT_KHOANG_QUA_DAI');
  assert.equal((await goi('/api/ktt/doi-chieu/tong-hop?tu=2026-10-01&den=2026-10-31')).status, 200, 'đúng 31 ngày vẫn được');
  assert.equal((await goi('/api/ktt/doi-chieu/tong-hop?tu=2026-10-20')).body.ma, 'KTT_THIEU_THAM_SO');
  assert.equal((await goi(DEN, 'admin')).status, 200);
  assert.equal((await goi(DEN, 'gdvh')).status, 403);
  assert.equal((await goi(DEN, 'tivi')).status, 403);
  assert.equal((await goi(DEN, null)).status, 401);
});

// ---------- 5. danh sách hàng hoàn rỗng ----------
test('danh sách hàng hoàn rỗng: route vẫn chạy, meta.hang_hoan_chua_nap = true, hoàn = 0 và hàng có thể hoàn vẫn nằm trong tập chính', async () => {
  duLieu({ coHoan: false });
  const r = (await goi(DEN)).body;
  assert.equal(r.meta.hang_hoan_chua_nap, true);
  assert.equal(r.tong_cong.hang_hoan_loai_khoi, 0);
  assert.equal(r.tong_cong.tap_chinh.tong, 9, 'Y6 không còn bị loại');
});

test('chưa có dữ liệu KTT: kết quả rỗng có ly_do, vẫn 200', async () => {
  const r = await goi(DEN);
  assert.equal(r.status, 200);
  assert.equal(r.body.co_du_lieu, false);
  assert.equal(r.body.ly_do, 'CHUA_CO_DU_LIEU');
  assert.equal(r.body.tong_cong.tap_chinh.tong, 0);
});

// ---------- 6. cache theo ngày ----------
test('cache theo ngày: lần hai không tính lại; nạp thêm file BCVH của D..D+2 -> chỉ ngày liên quan tính lại; ngày khác giữ cache', async () => {
  duLieu();
  const q = '/api/ktt/doi-chieu/tong-hop?tu=2026-10-20&den=2026-10-22'; // 20, 21, 22: cả ba đã chốt
  const a = (await goi(q)).body;
  assert.equal(Api.thongKe().ngayDCTinh, 3);
  const b = (await goi(q)).body;
  assert.equal(Api.thongKe().ngayDCTinh, 3, 'lần hai: từ cache');
  assert.deepEqual(b.tong_cong, a.tong_cong);
  // file BCVH của 25/10: cửa sổ [D, D+2] của 20, 21, 22 không chứa 25/10
  fileBcvh(TH, '2026-10-25', '18:00:00', []);
  await goi(q);
  assert.equal(Api.thongKe().ngayDCTinh, 3, 'file 25/10 không đổi ngày 20..22');
  // file BCVH của 23/10: [D, D+2] của 21 và 22 chứa 23/10, của 20 thì không
  fileBcvh(TH, '2026-10-23', '18:00:00', ['KTT-DEMO-Y3']);
  const c = (await goi(q)).body;
  assert.equal(Api.thongKe().ngayDCTinh, 5, 'chỉ 21 và 22 tính lại');
  assert.deepEqual(c.tong_cong.tap_chinh, a.tong_cong.tap_chinh, 'Y3 nằm ở ngày 20 (ngoài 20..22 của file 23/10? tra theo [D, D+2]) nên số ngày 20 giữ nguyên');
  // file BCVH của 22/10 chứa Y3: [20, 22] chứa 22/10 nên ngày 20 tính lại và Y3 thành tai_dich
  fileBcvh(TH, '2026-10-22', '18:00:00', ['KTT-DEMO-Y3']);
  const d = (await goi(q)).body;
  assert.equal(d.tong_cong.tap_chinh.tai_dich, a.tong_cong.tap_chinh.tai_dich + 1);
  assert.equal(d.tong_cong.tap_chinh.chua_thay, a.tong_cong.tap_chinh.chua_thay - 1);
  assert.equal(ngayCua(d, '2026-10-20').tap_chinh.tai_dich, ngayCua(a, '2026-10-20').tap_chinh.tai_dich + 1);
});

test('cache bị vô hiệu khi nạp ItemReturn mới: ngày liên quan được tính lại và số hoàn đổi', async () => {
  duLieu();
  const q = '/api/ktt/doi-chieu/tong-hop?tu=2026-10-20&den=2026-10-22';
  const a = (await goi(q)).body;
  const dem0 = Api.thongKe().ngayDCTinh;
  assert.equal(a.tong_cong.tap_chinh.tong, 7);
  assert.equal((await goi(q)).body.tong_cong.hang_hoan_loai_khoi, 1);
  assert.equal(Api.thongKe().ngayDCTinh, dem0);
  hoan('KTT-DEMO-Y3'); // Y3 trở thành hàng hoàn
  const b = (await goi(q)).body;
  assert.equal(Api.thongKe().ngayDCTinh, dem0 + 3, 'phiên bản danh sách hàng hoàn đổi -> cả ba ngày tính lại');
  assert.equal(b.tong_cong.hang_hoan_loai_khoi, 2);
  assert.equal(b.tong_cong.tap_chinh.tong, 6);
  assert.equal(b.tong_cong.tap_chinh.chua_thay, a.tong_cong.tap_chinh.chua_thay - 1);
});

// ---------- 7. hàm thuần và làm nóng ----------
test('ghepTongHop (hàm thuần) và loaiGhep: ưu tiên đích', () => {
  assert.equal(DC.loaiGhep(TH, new Map([[HT, 'x'], [TH, 'y']])), 'tai_dich');
  assert.equal(DC.loaiGhep(TH, new Map([[HT, 'x']])), 'bcvh_khac');
  assert.equal(DC.loaiGhep(TH, undefined), 'chua_thay');
  assert.equal(DC.loaiGhep(TH, new Map()), 'chua_thay');
  assert.equal(DC.noiDen(new Map([[HT, '2026-10-20 08:00:00'], ['536250', '2026-10-21 10:00:00'], [TH, '2026-10-19 09:00:00']])), '536250', 'nơi đến thực tế = mốc muộn nhất');
  assert.equal(DC.noiDen(new Map([[HT, '2026-10-20 08:00:00'], [TH, '2026-10-20 08:00:00']])), TH, 'hòa: mã nhỏ hơn');
  assert.equal(DC.noiDen(new Map()), null);
});

test('làm nóng sau nạp BCVH (chiDoiChieu): chỉ bó đối chiếu; request sau đó không tính lại; KTT_WARM=0 không làm gì', async () => {
  duLieu();
  const tat = await Nong.batDauNong(db, { env: { KTT_WARM: '0' }, chiDoiChieu: true, nghiCuaSoMs: 0, nghiThuaMs: 0, log: () => {} });
  assert.equal(tat.da_chay, false);
  assert.equal(Api.thongKe().ngayDCTinh, 0);
  const kq = await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '5' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, nghiCuaSoMs: 0, nghiThuaMs: 0, log: () => {} });
  assert.equal(kq.da_chay, true);
  assert.equal(kq.loi, null);
  assert.equal(Api.thongKe().ngayDCTinh, 5);
  assert.equal(Api.thongKe().tong_hop, 0, 'không làm nóng gì khác');
  const dem = Api.thongKe().ngayDCTinh;
  const r = await goi(DEN);
  assert.equal(r.status, 200);
  assert.equal(Api.thongKe().ngayDCTinh, dem, 'đã nóng: không tính lại');
});

// ---------- 8. «có mặt» = có mốc đến hợp lệ; nơi đến thực tế; khong_phan_loai đã ghi đi ----------
/**
 * Thêm vào bộ duLieu() (20/10, độ mới 23/10): Y8 (đích TH, chỉ có DÒNG KHÔNG MỐC ở HT -> vẫn chưa thấy), Y9 (đích TH, có ở HT 20/10 08:00 và ở 536250 21/10 10:00 -> bcvh_khac, nơi đến 536250),
 * Y10 (đích TH, chỉ có ở TH nhưng dòng không mốc -> chưa thấy). khong_phan_loai đã ghi đi (thiếu giờ quét túi đến, có giờ lập BD10 đi): P1 (đích TH, có ở HT), P2 (không thấy), P3 (có ở TH và ở 536250 muộn hơn),
 * P4 (19/10, không thấy: ngoài cửa sổ của cả sáu), P5 (đích HT, chỉ dòng không mốc -> không thấy; HT thiếu file 21/10 -> nghi).
 */
function duLieuMoi() {
  kt('KTT-DEMO-Y8', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y9', { quet: '2026-10-20 05:30:00' });
  kt('KTT-DEMO-Y10', { quet: '2026-10-20 05:30:00' });
  const KPL = { quet: null, xnd: '2026-10-20 05:30:00', gioDi: '2026-10-20 07:00:00' };
  kt('KTT-DEMO-P1', KPL);
  kt('KTT-DEMO-P2', KPL);
  kt('KTT-DEMO-P3', KPL);
  kt('KTT-DEMO-P4', { quet: null, xnd: '2026-10-19 05:30:00', gioDi: '2026-10-19 07:00:00' });
  kt('KTT-DEMO-P5', { ...KPL, nhan: HT });
  fileBcvh(HT, '2026-10-22', '18:00:00', [['KTT-DEMO-Y8', null], ['KTT-DEMO-P5', null]]);
  fileBcvh(TH, '2026-10-22', '18:30:00', [['KTT-DEMO-Y10', null]]);
  fileBcvh(HT, '2026-10-22', '19:00:00', [['KTT-DEMO-Y9', '2026-10-20 08:00:00'], ['KTT-DEMO-P1', '2026-10-20 09:00:00'], ['KTT-DEMO-P3', '2026-10-20 08:30:00']]);
  fileBcvh('536250', '2026-10-22', '19:30:00', [['KTT-DEMO-Y9', '2026-10-21 10:00:00'], ['KTT-DEMO-P3', '2026-10-21 11:00:00']]);
  Api.xoaCache();
}

test('dòng không có mốc đến không tính là «có mặt»; SHBG ở hai BCVH khác đích: bcvh_khac, nơi đến thực tế = mốc muộn nhất', async () => {
  duLieu(); duLieuMoi();
  const r = (await goi('/api/ktt/doi-chieu/tong-hop?tu=2026-10-20&den=2026-10-22')).body;
  const t = r.tong_cong.tap_chinh;
  // trước: 3 tai_dich (Y1 Y4 X1), 1 bcvh_khac (Y2), 3 chua_thay (Y3 Y5 CT1); thêm Y8 Y10 (chỉ dòng không mốc -> chua_thay), Y9 (bcvh_khac)
  assert.deepEqual([t.tai_dich, t.bcvh_khac, t.chua_thay], [3, 2, 5]);
  assert.deepEqual(t.bcvh_khac_theo_noi_den, { [HT]: 1, 536250: 1 }, 'Y2 nơi đến HT; Y9 có ở HT 08:00 và 536250 21/10 10:00 -> 536250');
  const n20 = ngayCua(r, '2026-10-20');
  assert.deepEqual(n20.theo_bcvh[TH].tap_chinh.bcvh_khac_theo_noi_den, { [HT]: 1, 536250: 1 });
});

test('khong_phan_loai đã ghi đi: không loại khỏi thanh 2; xếp theo nơi đến thực tế; không thấy -> chua_thay; đẳng thức với /dicungngay', async () => {
  duLieu(); duLieuMoi();
  const q = 'tu=2026-10-19&den=2026-10-22';
  const r = (await goi(`/api/ktt/doi-chieu/tong-hop?${q}`)).body;
  const g = r.tong_cong.da_ghi_di;
  const k = g.khong_phan_loai_da_ghi_di;
  assert.equal(k.tong, 5, 'P1 P2 P3 P4 P5');
  assert.deepEqual(k.theo_bcvh_noi_den, { [HT]: 1, 536250: 1 }, 'P1 chỉ ở HT; P3 ở HT 20/10 và 536250 21/10 (muộn nhất)');
  assert.equal(k.chua_thay, 2, 'P2 và P5 (P5 chỉ có dòng không mốc), trong cửa sổ cả sáu');
  assert.equal(k.ngoai_cua_so, 1, 'P4 (19/10) trước ngày đầu: chưa kiểm tra được');
  assert.equal(k.tong, Object.values(k.theo_bcvh_noi_den).reduce((s, n) => s + n, 0) + k.chua_thay + k.ngoai_cua_so);
  assert.equal(k.nghi_duong_tinh_gia, 2, 'HT thiếu file 21/10 -> cờ ở D = 20');
  assert.equal(g.tong, g.tong_da_phan_loai + k.tong);
  const di = (await goi(`/api/ktt/dicungngay/tong-hop?${q}`)).body.bcvh_hue_khong_hang_hoan;
  assert.equal(g.tong - k.tong, di.cung_ngay + di.hom_sau + di.tu_2_ngay, 'thanh 2 trừ khong_phan_loai = tổng ba nhóm /dicungngay');
  // lọc theo BCVH đích KTT biết: P1 P2 P3 P4 đích TH, P5 đích HT
  const th = (await goi(`/api/ktt/doi-chieu/tong-hop?${q}&ma_bcvh=${TH}`)).body.tong_cong.da_ghi_di.khong_phan_loai_da_ghi_di;
  assert.equal(th.tong, 4);
  const ht = (await goi(`/api/ktt/doi-chieu/tong-hop?${q}&ma_bcvh=${HT}`)).body.tong_cong.da_ghi_di.khong_phan_loai_da_ghi_di;
  assert.equal(ht.tong, 1);
});

// ---------- 9. hook sauNap và hàng đợi làm nóng (KTT-16-2, bổ sung) ----------
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
function csvGia() {
  const dong = [EXPECTED_HEADER.map(qt).join(',')];
  const r = { Ma_BC_dong: '990001', BC_nhan_BG: TH, Ten_duong_thu: 'Đường A', SHBG: 'ZZ900000001VN', 'Thời gian XN túi': '2026-10-14 07:00:00', 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: 'P1', Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử' };
  dong.push(EXPECTED_HEADER.map((h) => qt(r[h] ?? '')).join(','));
  return Buffer.from('﻿' + dong.join('\r\n') + '\r\n');
}
function dongHoGia(batDau) {
  let t = batDau; let id = 0; const hen = [];
  return {
    now: () => new Date(t),
    setTimeout: (fn, ms) => { const h = { id: ++id, at: t + ms, fn }; hen.push(h); return h; },
    clearTimeout: (h) => { const i = hen.indexOf(h); if (i >= 0) hen.splice(i, 1); },
    async tien(ms) {
      const dich = t + ms;
      for (;;) {
        const ke = hen.filter((h) => h.at <= dich).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!ke) break;
        hen.splice(hen.indexOf(ke), 1); t = Math.max(t, ke.at); await ke.fn();
      }
      t = dich;
    }
  };
}
/** Chạy một bộ hẹn giờ SFTP giả (một file BCVH giả, nạp ở lượt thứ hai) với hook sauNap cho trước; trả { luot, soGoi, khongXuLy, nap }. */
async function chayHenGioVoiSauNap(sauNap) {
  for (const b of ['sftp_source_files', 'sftp_sync_files', 'sftp_sync_runs', 'arrival_items', 'arrival_import_files']) db.prepare(`DELETE FROM ${b}`).run();
  const thuMuc = '/CSV_Report_533140'; const tenFile = 'HangDen_533140_20261014_093012.csv'; const buf = csvGia();
  const nguon = {
    async list() { return [{ type: '-', name: tenFile, size: buf.length, modifyTime: 1760400000000 }]; },
    async get(xa, cucBo) { fs.writeFileSync(cucBo, buf); },
    async end() {}
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-sauNap-test-'));
  const khongXuLy = []; const bat = (e) => khongXuLy.push(e); process.on('unhandledRejection', bat);
  let soGoi = 0;
  const env = { SFTP_SYNC_ENABLED: '1', SFTP_HOST: 'nas.gia.local', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_DIRS: thuMuc, SFTP_HOSTKEY_SHA256: 'a'.repeat(64), SFTP_STABLE_SECONDS: '60' };
  const clock = dongHoGia(Date.parse('2026-10-14T05:00:00Z'));
  const b = Sch.taoBoHenGio({ db, env, clock, tmpDir: tmp, sleep: async () => {}, log: () => {}, choPhepTrongTest: true, ketNoi: async () => nguon, sauNap: () => { soGoi++; return sauNap(); } });
  try {
    b.batDau();
    await clock.tien(30000);
    await clock.tien(10 * 60000);
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    return { luot: b.trangThai().luotGanNhat, soGoi, khongXuLy, nap: db.prepare('SELECT COUNT(*) AS n FROM arrival_import_files').get().n };
  } finally {
    process.off('unhandledRejection', bat);
    await b.dung();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('sauNap ném lỗi đồng bộ: lượt nạp vẫn XONG, file vẫn được nạp, hẹn giờ không hỏng', async () => {
  const r = await chayHenGioVoiSauNap(() => { throw new Error('sauNap nổ giả'); });
  assert.equal(r.soGoi, 1);
  assert.equal(r.luot.ketQua, 'XONG');
  assert.equal(r.luot.dem.daNap, 1);
  assert.equal(r.nap, 1);
  assert.deepEqual(r.khongXuLy, []);
});

test('sauNap trả Promise bị từ chối: không có unhandledRejection, lượt nạp không hỏng', async () => {
  const r = await chayHenGioVoiSauNap(() => Promise.reject(new Error('sauNap từ chối giả')));
  assert.equal(r.soGoi, 1);
  assert.equal(r.luot.ketQua, 'XONG');
  assert.equal(r.nap, 1);
  assert.deepEqual(r.khongXuLy, [], 'Promise bị từ chối phải được bắt');
});

test('sauNap nối đúng vào kttNong: lượt chiDoiChieu trả Promise không bao giờ từ chối (KTT_WARM=0 thì không làm gì)', async () => {
  const r = await chayHenGioVoiSauNap(() => Nong.batDauNong(db, { env: { KTT_WARM: '0' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true }));
  assert.equal(r.luot.ketQua, 'XONG');
  assert.deepEqual(r.khongXuLy, []);
});

test('lỗi bên trong layNgayDC (chiDoiChieu): không sập, Promise xong với loi, không lộ số liệu; lần sau chạy lại bình thường', async () => {
  duLieu();
  const logs = [];
  const hong = new Proxy(db, { get(t, p) { if (p === 'prepare') return (sql) => { if (/ktt_buu_gui/.test(sql)) throw Object.assign(new Error('KTT-DEMO-LOI 12345 nội dung nhạy cảm'), { code: 'LOI_GIA' }); return t.prepare(sql); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
  const r = await Nong.batDauNong(hong, { env: { KTT_WARM_NGAY: '3' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, nghiCuaSoMs: 0, nghiThuaMs: 0, log: (m) => logs.push(m) });
  assert.equal(r.da_chay, true);
  assert.equal(r.loi, 'LOI_GIA');
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /KTT-DEMO|12345|nhạy cảm/);
  assert.ok(Api.thongKe().ngayDCTinh < 3, 'lượt lỗi dừng giữa chừng');
  const tot = await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '3' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, nghiCuaSoMs: 0, nghiThuaMs: 0, log: () => {} });
  assert.equal(tot.loi, null);
  const dem = Api.thongKe().ngayDCTinh;
  const lai = await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '3' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, nghiCuaSoMs: 0, nghiThuaMs: 0, log: () => {} });
  assert.equal(lai.loi, null);
  assert.equal(Api.thongKe().ngayDCTinh, dem, 'lỗi trước đó không để lại trạng thái hỏng: cả 3 ngày đã nằm trong cache');
});

test('hai loại lượt: SAU_NAP (đầy đủ) rồi SAU_NAP_BCVH (đối chiếu): đầy đủ chạy hết số ngày, đối chiếu xếp hàng chạy sau; lượt đầy đủ đến sau vẫn hủy lượt cũ', async () => {
  duLieu();
  const logs = [];
  const nhanh = { nghiCuaSoMs: 0, nghiThuaMs: 0, log: (m) => logs.push(m) };
  const day = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '4' }, lyDo: 'SAU_NAP', ...nhanh });
  const dc = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '4' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, ...nhanh });
  const [rd, rc] = await Promise.all([day, dc]);
  assert.equal(rd.da_chay, true); assert.equal(rd.bi_huy, false); assert.equal(rd.ngay_cua_so + rd.ngay_thua, 4, 'lượt đầy đủ không bị lượt đối chiếu hủy');
  assert.equal(rc.da_chay, true); assert.equal(rc.bi_huy, false); assert.equal(rc.ngay_cua_so + rc.ngay_thua, 4);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /^\[ktt-nong\] SAU_NAP:/); assert.match(logs[1], /^\[ktt-nong\] SAU_NAP_BCVH:/, 'đối chiếu chạy sau');
  assert.equal(Api.thongKe().ngayDCTinh, 4, 'bó đối chiếu mỗi ngày chỉ tính một lần (lượt sau dùng cache)');
  // đảo thứ tự: lượt đầy đủ đến sau hủy lượt đối chiếu đang xếp hàng (KTT-15 giữ nguyên)
  Api.xoaCache(); Nong.datLai();
  const dc2 = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '4' }, lyDo: 'SAU_NAP_BCVH', chiDoiChieu: true, ...nhanh });
  const day2 = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '4' }, lyDo: 'SAU_NAP', ...nhanh });
  const [rc2, rd2] = await Promise.all([dc2, day2]);
  assert.deepEqual([rc2.da_chay, rc2.ly_do], [false, 'DA_CO_LUOT_MOI']);
  assert.equal(rd2.da_chay, true); assert.equal(rd2.bi_huy, false); assert.equal(rd2.ngay_cua_so + rd2.ngay_thua, 4);
});
