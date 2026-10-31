// ==========================================
// Test KTT-12b: API đi cùng ngày (B1–B3), hàng rớt lại, lịch xe (B4–B6), danh sách bấm ô, hàng đến (A), tổng quan — /api/ktt/{dicungngay,rotlai,lich-xe,danh-sach,hang-den,tong-quan}.
// Server thật trên DB tạm của harness (file); dữ liệu GIẢ (SHBG KTT-DEMO-xxx, mã điểm / đường thư giả). Không mở data/, không DB thật, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');
const D = require('../server/lib/kttDiNgay');
const HD = require('../server/lib/kttHangDen');

const PORT = 5998;
const TH = '533140'; const HT = '535470'; const PL = '537220';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT12_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT12_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT12_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT12_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-12b-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (...ds) => ds.forEach((shbg) => them('ktt_hang_hoan', { shbg, nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' })); // KTT-17-2: hàng hoàn = SHBG có trong ktt_hang_hoan
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
/**
 * Một SHBG khai thác lại. diemGui: nơi gửi BD10 đến (không bắt đầu bằng '53' = xe Cấp 1; '53…' = nội tỉnh). dt: đường thư đến. Túi đi: nhan (BCVH nhận / '530900'), BD10 đi lập lúc gioDi (null = chưa đi).
 */
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = '999001', dt = 'DT-A', dtTen = 'Đường thư giả A', gam = 100, px, chuyenTiep = false }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ten_diem_gui: `Điểm ${diemGui}`, bd10_den_ma_duong_thu: dt, bd10_den_ten_duong_thu: dtTen });
  bg(den, shbg, { khoi_luong_thuc_te_g: gam, ...(px ? { ma_xa_phuong: px } : {}) });
  if (chuyenTiep) return;
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan, bd10_di_ma_duong_thu: nhan ? `DI-${nhan}` : null });
  bg(di, shbg, { khoi_luong_thuc_te_g: gam });
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/** Ngày 20: liên tỉnh (xe Cấp 1) đủ năm nhóm; ngày 21: thêm nội tỉnh, hàng hoàn, nội tỉnh đi liên tỉnh; ngày 22: một SHBG. Độ mới 2026-10-23 10:00 (mọi ngày trên đã chốt). */
function duLieu() {
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // cùng ngày
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00', dt: 'DT-B', dtTen: 'Đường thư giả B' }); // cùng ngày (trượt chuyến)
  kt('KTT-DEMO-A3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // hôm sau
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00', nhan: HT }); // từ 2 ngày
  kt('KTT-DEMO-A5', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi (trên 24 giờ)
  kt('KTT-DEMO-B1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '530101', dt: 'DT-N', dtTen: 'Nội tỉnh giả' }); // nội tỉnh
  kt('KTT-DEMO-B2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', nhan: HT });
  kt('KTT-DEMO-H1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120' }); // hàng hoàn
  hoan('KTT-DEMO-H1');
  kt('KTT-DEMO-X1', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-21 09:00:00', nhan: '530900', diemGui: '530101' }); // nội tỉnh đi liên tỉnh
  kt('KTT-DEMO-X2', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-22 09:00:00', nhan: '530900', diemGui: '530101' }); // nội tỉnh đi liên tỉnh, hôm sau
  kt('KTT-DEMO-C1', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 06:50:00' });
  kt('KTT-DEMO-C2', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-23 05:00:00', dt: 'DT-B', dtTen: 'Đường thư giả B' }); // hôm sau
  capOk('2026-10-23 10:00:00');
}

async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null, headers: res.headers };
}
const Q20 = '?tu=2026-10-20&den=2026-10-22';
const ROUTES = [
  ['dicungngay/tong-hop', `/api/ktt/dicungngay/tong-hop${Q20}`], ['dicungngay/theo-ngay', `/api/ktt/dicungngay/theo-ngay${Q20}`], ['dicungngay/theo-gio', `/api/ktt/dicungngay/theo-gio${Q20}`],
  ['rotlai/theo-duong-thu', `/api/ktt/rotlai/theo-duong-thu${Q20}`], ['lich-xe/gio-lap-bd10', `/api/ktt/lich-xe/gio-lap-bd10${Q20}`], ['lich-xe/theo-duong-thu', `/api/ktt/lich-xe/theo-duong-thu${Q20}`],
  ['lich-xe/theo-bcvh', `/api/ktt/lich-xe/theo-bcvh${Q20}`], ['danh-sach', `/api/ktt/danh-sach${Q20}&loai=hom-sau`], ['hang-den/tong-hop', `/api/ktt/hang-den/tong-hop${Q20}`],
  ['hang-den/theo-gio', `/api/ktt/hang-den/theo-gio${Q20}`], ['hang-den/theo-duong-thu', `/api/ktt/hang-den/theo-duong-thu${Q20}`], ['hang-den/xe', `/api/ktt/hang-den/xe${Q20}`], ['tong-quan', `/api/ktt/tong-quan${Q20}`]
];

// ---------- quyền, tham số ----------
test('quyền: 13 endpoint KTT-12: không token 401; ADMIN và TTVH 200 (cùng số liệu); GDVH 403; TIVI 403; chỉ GET', async () => {
  duLieu();
  for (const [ten, url] of ROUTES) {
    assert.equal((await goi(url)).status, 401, `${ten}: không token`);
    const a = await goi(url, 'admin');
    const t = await goi(url, 'ttvh');
    assert.equal(a.status, 200, `${ten}: ADMIN`);
    assert.equal(t.status, 200, `${ten}: TTVH`);
    assert.deepEqual(a.body, t.body, `${ten}: ADMIN = TTVH`);
    assert.equal((await goi(url, 'gdvh')).status, 403, `${ten}: GDVH`);
    assert.equal((await goi(url, 'tivi')).status, 403, `${ten}: TIVI`);
    assert.equal((await goi(url, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404, `${ten}: chỉ GET`);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ktt.js'), 'utf8');
  assert.ok(!/router\.(post|put|patch|delete)\(/.test(src));
});

test('tham số sai -> 400 tiếng Việt: thiếu tu / den, ngày không có thật, den < tu, 32 ngày, khóa lạ, lặp tham số, top / min_bd10 / page / loai / huong / hang_hoan / ma_bcvh / duong_thu sai', async () => {
  duLieu();
  const goc = ROUTES.map(([ten, url]) => [ten, url.split('?')[0]]);
  for (const [ten, url] of goc) {
    const them_ = ten === 'danh-sach' ? '&loai=hom-sau' : '';
    for (const p of ['', '?tu=2026-10-20', '?den=2026-10-20', '?tu=2026/10/20&den=2026-10-21', '?tu=2026-04-31&den=2026-05-01', '?tu=2026-10-22&den=2026-10-21', '?tu=2026-10-01&den=2026-11-01', '?tu=2026-10-20&den=2026-10-21&la=1', '?tu=2026-10-20&tu=2026-10-21&den=2026-10-22']) {
      const r = await goi(`${url}${p}${p ? them_ : ''}`, 'admin');
      assert.equal(r.status, 400, `${ten} ${p}`);
      assert.match(r.body.error, /[a-zà-ỹ]/i);
      assert.ok(r.body.ma && /^KTT_/.test(r.body.ma), `${ten} ${p} có mã lỗi`);
      assert.ok(!/at |\.js|SELECT/.test(r.body.error), 'không lộ nội bộ');
    }
  }
  const sai = [
    '/api/ktt/rotlai/theo-duong-thu?tu=2026-10-20&den=2026-10-21&top=0', '/api/ktt/rotlai/theo-duong-thu?tu=2026-10-20&den=2026-10-21&top=51', '/api/ktt/rotlai/theo-duong-thu?tu=2026-10-20&den=2026-10-21&top=abc',
    '/api/ktt/lich-xe/gio-lap-bd10?tu=2026-10-20&den=2026-10-21&min_bd10=0', '/api/ktt/lich-xe/gio-lap-bd10?tu=2026-10-20&den=2026-10-21&min_bd10=101',
    '/api/ktt/lich-xe/theo-duong-thu?tu=2026-10-20&den=2026-10-21&top=-1', '/api/ktt/hang-den/theo-duong-thu?tu=2026-10-20&den=2026-10-21&top=201',
    `/api/ktt/danh-sach${Q20}`, `/api/ktt/danh-sach${Q20}&loai=t1`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&page=0`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&page_size=201`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&page=1.5`,
    `/api/ktt/danh-sach${Q20}&loai=hom-sau&huong=abc`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&hang_hoan=2`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&ma_bcvh=999999`, `/api/ktt/danh-sach${Q20}&loai=hom-sau&duong_thu=${encodeURIComponent("a';--")}`,
    `/api/ktt/danh-sach${Q20}&loai=hom-sau&noi_gui=${encodeURIComponent('x'.repeat(41))}`
  ];
  for (const url of sai) assert.equal((await goi(url, 'admin')).status, 400, url);
  assert.equal((await goi('/api/ktt/dicungngay/tong-hop?tu=2026-10-20&den=2026-10-20', 'admin')).status, 200);
  assert.equal((await goi('/api/ktt/dicungngay/tong-hop?tu=2026-10-01&den=2026-10-31', 'admin')).status, 200, '31 ngày được');
});

test('chưa có dữ liệu (không có cặp OK): mọi endpoint 200, co_du_lieu = false, ly_do CHUA_CO_DU_LIEU, bay_gio null (không đọc đồng hồ máy)', async () => {
  for (const [ten, url] of ROUTES) {
    const r = await goi(url, 'admin');
    assert.equal(r.status, 200, ten);
    const goc = ten === 'danh-sach' ? r.body.meta : r.body; // danh-sach trả {items, pagination, meta} như /chi-tiet
    if (ten !== 'danh-sach') assert.equal(r.body.co_du_lieu, false, ten);
    assert.equal(goc.ly_do, 'CHUA_CO_DU_LIEU', ten);
  }
  assert.equal((await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body.bay_gio, null);
});

// ---------- B1, B2, B3 ----------
test('B1: ba hướng — tổng năm nhóm = tổng bưu gửi mẫu số; hàng hoàn tách riêng; nội tỉnh đi liên tỉnh có hướng riêng; phản hồi có khoảng ngày, cửa sổ thực tế, Dữ liệu đến', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  assert.deepEqual(r.khoang_ngay, { tu_ngay: '2026-10-20', den_ngay: '2026-10-22', so_ngay: 3 });
  assert.deepEqual([r.cua_so_thuc_te.tu_ngay, r.cua_so_thuc_te.den_ngay, r.cua_so_thuc_te.so_ngay_co_du_lieu], ['2026-10-20', '2026-10-22', 3]);
  assert.equal(r.nguon_xuat_luc_moi_nhat, '2026-10-23 10:00:00');
  assert.equal(r.co_du_lieu, true);
  const tongNhom = (k) => D.CAC_NHOM.reduce((s, c) => s + k[c], 0);
  const lt = r.lien_tinh_den_bcvh;
  const nt = r.noi_tinh_den_bcvh.khong_hang_hoan;
  for (const k of [lt, nt, r.noi_tinh_den_bcvh.hang_hoan, r.noi_tinh_di_lien_tinh, r.bcvh_hue_khong_hang_hoan, r.noi_tinh_den_bcvh.co_hang_hoan]) {
    assert.equal(tongNhom(k), k.mau_so, 'tổng năm nhóm = mẫu số');
    assert.equal(k.mau_so + k.dang_cho_chuyen + k.khong_phan_loai, k.tong_shbg);
    assert.equal(k.ro_lai, k.mau_so - k.cung_ngay);
  }
  assert.deepEqual([lt.tong_shbg, lt.cung_ngay, lt.hom_sau, lt.tu_2_ngay, lt.chua_di_tren_24h], [8, 4, 2, 1, 1], 'A1 A2 C1 + B2(HT) cùng ngày; A3 C2 hôm sau; A4 từ 2 ngày; A5 chưa đi');
  assert.deepEqual([nt.tong_shbg, nt.cung_ngay], [1, 1]);
  assert.equal(r.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 1);
  assert.equal(r.noi_tinh_den_bcvh.co_hang_hoan.tong_shbg, 2);
  assert.deepEqual([r.noi_tinh_di_lien_tinh.tong_shbg, r.noi_tinh_di_lien_tinh.cung_ngay, r.noi_tinh_di_lien_tinh.hom_sau], [2, 1, 1]);
  assert.equal(r.bcvh_hue_khong_hang_hoan.tong_shbg, lt.tong_shbg + nt.tong_shbg, 'hàng hoàn không cộng vào tổng');
  assert.ok(Math.abs(lt.ty_le.cung_ngay - 0.5) < 1e-9);
  assert.ok(r.dinh_nghia.cung_ngay);
});

test('cùng định nghĩa «cùng ngày» với /luu-thoat: mẫu số, cùng ngày (T1+T2), hôm sau (T3+T4), T5 khớp trên cùng khoảng (hàng đi 6 BCVH Huế, không kể hàng hoàn)', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body;
  const b1 = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body.bcvh_hue_khong_hang_hoan;
  const t = lt.tong_cong.trang_thai;
  assert.equal(b1.cung_ngay, t.t1.shbg + t.t2.shbg);
  assert.equal(b1.hom_sau, t.t3.shbg + t.t4.shbg);
  assert.equal(b1.tu_2_ngay + b1.chua_di_duoi_24h + b1.chua_di_tren_24h, t.t5.shbg);
  assert.equal(b1.ro_lai, t.t3.shbg + t.t4.shbg + t.t5.shbg);
  assert.equal(b1.dang_cho_chuyen, t.dang_cho_chuyen.shbg);
  assert.equal(b1.mau_so, t.t1.shbg + t.t2.shbg + t.t3.shbg + t.t4.shbg + t.t5.shbg);
  // từng ngày: B2 = từng ngày của /luu-thoat
  const b2 = (await goi(`/api/ktt/dicungngay/theo-ngay${Q20}`, 'admin')).body.theo_ngay;
  for (const n of lt.theo_ngay) {
    const d = b2.find((x) => x.ngay === n.ngay);
    const tt = n.tong.trang_thai;
    assert.equal(d.bcvh_hue.cung_ngay, tt.t1.shbg + tt.t2.shbg, `cùng ngày ${n.ngay}`);
    assert.equal(d.bcvh_hue.ro_lai, tt.t3.shbg + tt.t4.shbg + tt.t5.shbg, `rớt lại ${n.ngay}`);
    assert.equal(d.da_chot, n.da_chot, `đã chốt ${n.ngay}`);
  }
});

test('B2: từng ngày — cờ Chủ nhật (18/10/2026 là Chủ nhật), cờ đã chốt, tổng các ngày = tổng khoảng; so sánh Chủ nhật / ngày thường', async () => {
  kt('KTT-DEMO-S1', { quet: '2026-10-18 05:30:00', gioDi: '2026-10-18 06:50:00' });
  kt('KTT-DEMO-S2', { quet: '2026-10-18 05:30:00', gioDi: '2026-10-19 06:50:00' });
  kt('KTT-DEMO-M1', { quet: '2026-10-19 05:30:00', gioDi: '2026-10-19 06:50:00' });
  kt('KTT-DEMO-M2', { quet: '2026-10-19 05:30:00', gioDi: '2026-10-19 06:50:00' });
  capOk('2026-10-20 08:00:00'); // 19/10 chưa chốt (giờ chốt 09:00 ngày 20), 18/10 đã chốt
  const r = (await goi('/api/ktt/dicungngay/theo-ngay?tu=2026-10-17&den=2026-10-19', 'admin')).body;
  assert.deepEqual(r.theo_ngay.map((d) => [d.ngay, d.chu_nhat, d.da_chot, d.co_du_lieu]), [['2026-10-17', false, true, false], ['2026-10-18', true, true, true], ['2026-10-19', false, false, true]]);
  assert.deepEqual(r.theo_ngay.map((d) => d.bcvh_hue.mau_so), [0, 2, 2]);
  assert.equal(r.theo_ngay[0].bcvh_hue.ty_le.cung_ngay, null, 'mẫu số 0 -> null, không 0');
  assert.deepEqual([r.cua_so_thuc_te.tu_ngay, r.cua_so_thuc_te.den_ngay, r.cua_so_thuc_te.so_ngay_co_du_lieu], ['2026-10-18', '2026-10-19', 2]);
  assert.equal(r.so_sanh_chu_nhat.chu_nhat.so_ngay, 1);
  assert.equal(r.so_sanh_chu_nhat.chu_nhat.ty_le_trung_binh_ngay, 0.5);
  assert.equal(r.so_sanh_chu_nhat.ngay_thuong.ty_le_trung_binh_ngay, 1);
  const th = (await goi('/api/ktt/dicungngay/tong-hop?tu=2026-10-17&den=2026-10-19', 'admin')).body;
  assert.equal(r.theo_ngay.reduce((s, d) => s + d.bcvh_hue.cung_ngay, 0), th.bcvh_hue_khong_hang_hoan.cung_ngay);
  assert.equal(r.theo_ngay.reduce((s, d) => s + d.bcvh_hue.mau_so, 0), th.bcvh_hue_khong_hang_hoan.mau_so);
});

test('B3: theo giờ quét túi đến — 24 dòng, tổng các giờ = tổng 6 BCVH Huế (không kể hàng hoàn), trước / từ 12 giờ khớp', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/dicungngay/theo-gio${Q20}`, 'admin')).body;
  const th = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body.bcvh_hue_khong_hang_hoan;
  assert.equal(r.theo_gio.length, 24);
  assert.deepEqual(r.theo_gio.map((x) => x.gio), Array.from({ length: 24 }, (_, i) => i));
  for (const c of [...D.CAC_NHOM, 'dang_cho_chuyen', 'khong_phan_loai', 'tong_shbg']) assert.equal(r.theo_gio.reduce((s, x) => s + x[c], 0), th[c], c);
  assert.equal(r.theo_gio[5].tong_shbg, 7, '05:xx: A1 A2 A4 B1 B2 C1 C2 (B1 nội tỉnh vẫn là hàng đi 6 BCVH Huế)');
  assert.equal(r.theo_gio[21].tong_shbg, 1);
  assert.equal(r.chia_12h.truoc_12h.tong_shbg + r.chia_12h.tu_12h.tong_shbg, th.tong_shbg);
  assert.equal(r.chia_12h.tu_12h.hom_sau, 1, 'A3 quét 21:30 đi hôm sau');
});

// ---------- hàng rớt lại, B5 ----------
test('rớt lại theo đường thư: đường thư Cấp 1 → 6 BCVH Huế; tổng = hàng đi 6 BCVH Huế từ xe Cấp 1; top; hai BCVH nhận nhiều nhất', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}`, 'admin')).body;
  assert.equal(r.so_duong_thu, 2);
  assert.deepEqual(r.dong.map((x) => [x.duong_thu_ma, x.tong_shbg]), [['DT-A', 6], ['DT-B', 2]]);
  assert.equal(r.tong_lien_tinh_den_bcvh.tong_shbg, r.dong.reduce((s, x) => s + x.tong_shbg, 0));
  const th = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body.lien_tinh_den_bcvh;
  assert.equal(r.tong_lien_tinh_den_bcvh.tong_shbg, th.tong_shbg);
  assert.equal(r.tong_lien_tinh_den_bcvh.ro_lai, th.ro_lai);
  assert.ok(r.dong[0].dich_chinh.length >= 1 && r.dong[0].dich_chinh[0].ma_bcvh === TH);
  const top1 = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}&top=1`, 'admin')).body;
  assert.equal(top1.dong.length, 1);
  assert.equal(top1.cong_top.tong_shbg, 6);
});

test('B5 lich-xe/theo-duong-thu: ba mục; hàng hoàn có hang_hoan = true và không cộng vào «cong»; giờ nhận TB / sớm / muộn; tổng mục = hướng tương ứng của B1', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/lich-xe/theo-duong-thu${Q20}`, 'admin')).body;
  const th = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  assert.equal(r.lien_tinh_den_bcvh.dong.reduce((s, x) => s + x.tong_shbg, 0), th.lien_tinh_den_bcvh.tong_shbg);
  assert.equal(r.noi_tinh_di_lien_tinh.dong.reduce((s, x) => s + x.tong_shbg, 0), th.noi_tinh_di_lien_tinh.tong_shbg);
  const nt = r.noi_tinh_den_bcvh;
  assert.equal(nt.dong.length, 2);
  const hoan = nt.dong.filter((x) => x.hang_hoan);
  assert.equal(hoan.length, 1);
  assert.equal(nt.cong.tong_shbg, th.noi_tinh_den_bcvh.khong_hang_hoan.tong_shbg, '«cong» không có hàng hoàn');
  const a = r.lien_tinh_den_bcvh.dong.find((x) => x.duong_thu_ma === 'DT-A' && x.noi_gui_ma === '999001');
  assert.equal(a.gio_nhan_som_nhat, '05:30');
  assert.equal(a.gio_nhan_muon_nhat, '21:30');
  assert.match(a.gio_nhan_tb, /^\d\d:\d\d$/);
  assert.equal(a.noi_gui_ten, 'Điểm 999001');
  const top1 = (await goi(`/api/ktt/lich-xe/theo-duong-thu${Q20}&top=1`, 'admin')).body;
  assert.equal(top1.lien_tinh_den_bcvh.dong.length, 1);
  assert.equal(top1.lien_tinh_den_bcvh.so_dong, r.lien_tinh_den_bcvh.so_dong);
});

// ---------- B4, B6 ----------
test('B4 gio-lap-bd10: mỗi BD10 đi một lần, gán chuyến lịch có giờ xuất phát gần nhất; ghi rõ quy ước; min_bd10 lọc nhóm nhỏ; tổng BD10 = số BD10 đi', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/lich-xe/gio-lap-bd10${Q20}&min_bd10=1`, 'admin')).body;
  const soBd10 = db.prepare("SELECT COUNT(*) AS n FROM (SELECT DISTINCT bd10_di_so_hieu, bd10_di_ma_diem_nhan FROM ktt_tui WHERE chieu IN ('DI','CHUYEN_TIEP_DI') AND bd10_di_so_hieu IS NOT NULL AND bd10_di_ma_diem_nhan IN ('533140','536250','535470','537015','537220','535790') AND bd10_di_gio_di >= '2026-10-20 00:00:00' AND bd10_di_gio_di < '2026-10-23 00:00:00')").get().n;
  assert.ok(soBd10 > 0);
  assert.equal(r.tong_bd10, soBd10);
  assert.equal(r.dong.reduce((s, x) => s + x.so_bd10, 0), r.tong_bd10, 'min_bd10 = 1: không mất BD10 nào');
  assert.match(r.quy_uoc, /gần giờ lập nhất/);
  for (const x of r.dong) {
    assert.ok(x.ma_bcvh && x.ten_bcvh);
    if (x.xe_roi_ktt) assert.match(x.xe_roi_ktt, /^\d\d:\d\d$/);
    assert.ok(x.so_bd10_lap_sau_gio_xe <= x.so_bd10);
  }
  const loc = (await goi(`/api/ktt/lich-xe/gio-lap-bd10${Q20}&min_bd10=5`, 'admin')).body;
  assert.ok(loc.dong.every((x) => x.so_bd10 >= 5));
  assert.equal(loc.so_nhom_bi_loc, r.dong.length - loc.dong.length);
  assert.equal(loc.dong.length, r.dong.filter((x) => x.so_bd10 >= 5).length);
});

test('chuyenGanNhat: BD10 lập 06:50 vào chuyến có giờ xuất phát gần nhất; hòa lấy chuyến sau; BCVH không có lịch -> null', () => {
  const LX = require('../server/lib/kttLichXe');
  const lich = [{ ma_bcvh: TH, gio_xuat_phat: '07:00', ngay_chay: 'CA_TUAN' }, { ma_bcvh: TH, gio_xuat_phat: '12:00', ngay_chay: 'CA_TUAN' }, { ma_bcvh: TH, gio_xuat_phat: '16:00', ngay_chay: 'NGHI_CN' }];
  const a = LX.chuyenGanNhat(lich, TH, '2026-10-20 06:50:00', 60);
  assert.equal(a.chuyen.gio_xuat_phat, '07:00');
  assert.equal(a.lechGiay, -600, 'lập TRƯỚC giờ xe 10 phút');
  const b = LX.chuyenGanNhat(lich, TH, '2026-10-20 07:20:00', 60);
  assert.equal(b.chuyen.gio_xuat_phat, '07:00');
  assert.equal(b.lechGiay, 1200, 'lập SAU giờ xe');
  const hoa = LX.chuyenGanNhat(lich, TH, '2026-10-20 09:30:00', 60);
  assert.equal(hoa.chuyen.gio_xuat_phat, '12:00', '07:00 và 12:00 cùng cách 09:30 là 150 phút (hòa) -> chuyến sau');
  assert.equal(LX.chuyenGanNhat(lich, HT, '2026-10-20 06:50:00', 60), null);
  assert.equal(LX.chuyenGanNhat(lich, TH, 'không phải giờ', 60), null);
});

test('B6 lich-xe/theo-bcvh: đủ 6 BCVH theo thứ tự canvas; shbg + kg khớp; hàng đến theo giờ chia số ngày; lịch xe 14 dòng; có cảnh báo túi chuyển tiếp', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/lich-xe/theo-bcvh${Q20}`, 'admin')).body;
  assert.deepEqual(r.bcvh.map((x) => x.ma_bcvh), ['533140', '536250', '535470', '537015', '537220', '535790']);
  assert.equal(r.bcvh.reduce((s, x) => s + x.so_chuyen_moi_ngay, 0), 14, 'lịch mặc định 14 dòng');
  const th = r.bcvh.find((x) => x.ma_bcvh === TH);
  assert.equal(th.shbg, 8, 'A1 A2 A3 A5 B1 H1 C1 C2 (kể cả hàng hoàn); A4 B2 đi Hương Trà');
  assert.equal(r.bcvh.find((x) => x.ma_bcvh === HT).shbg, 2);
  assert.equal(th.hang_den_theo_gio.so_ngay_chia, 3);
  assert.equal(th.hang_den_theo_gio.gio_quet_tui_den.length, 24);
  assert.equal(th.hang_den_theo_gio.gio_quet_tui_den.reduce((s, g) => s + g.tong, 0), th.shbg);
  assert.equal(th.hang_den_theo_gio.gio_quet_tui_den[5].so_bd_tb, Math.round((th.hang_den_theo_gio.gio_quet_tui_den[5].tong / 3) * 10) / 10);
  assert.equal(th.kg, Math.round(th.shbg * 0.1 * 1000) / 1000, 'mỗi SHBG giả 100 g');
  const b1 = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  assert.equal(r.bcvh.reduce((s, x) => s + x.shbg, 0), b1.lien_tinh_den_bcvh.tong_shbg + b1.noi_tinh_den_bcvh.co_hang_hoan.tong_shbg, 'mọi SHBG đích 6 BCVH Huế, kể cả hàng hoàn; không có nội tỉnh đi liên tỉnh');
  assert.ok(r.canh_bao.some((c) => /túi chuyển tiếp/.test(c)));
  assert.match(r.quy_uoc, /gần giờ lập nhất/);
});

// ---------- danh sách ----------
test('danh-sach: tổng = ô tương ứng của B1; phân trang ổn định, không trùng, đủ; lọc theo đường thư / hướng / BCVH; cùng bộ lọc với bảng rớt lại', async () => {
  duLieu();
  const th = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  const hs = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau`, 'admin')).body;
  assert.equal(hs.pagination.total, th.lien_tinh_den_bcvh.hom_sau + th.noi_tinh_den_bcvh.khong_hang_hoan.hom_sau + th.noi_tinh_den_bcvh.hang_hoan.hom_sau + th.noi_tinh_di_lien_tinh.hom_sau);
  assert.equal(hs.pagination.total, hs.items.length);
  const chua = (await goi(`/api/ktt/danh-sach${Q20}&loai=chua-di-24h`, 'admin')).body;
  assert.equal(chua.pagination.total, th.lien_tinh_den_bcvh.chua_di_tren_24h + th.noi_tinh_den_bcvh.co_hang_hoan.chua_di_tren_24h + th.noi_tinh_di_lien_tinh.chua_di_tren_24h);
  assert.deepEqual(chua.items.map((x) => x.shbg), ['KTT-DEMO-A5']);
  assert.ok(chua.items[0].cho_gio > 24);
  // phân trang
  const p1 = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&page=1&page_size=2`, 'admin')).body;
  const p2 = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&page=2&page_size=2`, 'admin')).body;
  assert.equal(p1.pagination.total_pages, Math.ceil(hs.pagination.total / 2));
  assert.deepEqual([...p1.items, ...p2.items].map((x) => x.shbg), hs.items.slice(0, 4).map((x) => x.shbg));
  assert.equal((await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&page=99`, 'admin')).body.items.length, 0);
  // bộ lọc khớp bảng rớt lại: DT-A, hướng lien_tinh_den_bcvh
  const rl = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}`, 'admin')).body.dong.find((x) => x.duong_thu_ma === 'DT-A');
  const dsA = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&duong_thu=DT-A&huong=lien_tinh_den_bcvh`, 'admin')).body;
  assert.equal(dsA.pagination.total, rl.hom_sau);
  assert.ok(dsA.items.every((x) => x.duong_thu_ma === 'DT-A' && x.huong === 'lien_tinh_den_bcvh' && x.nhom === 'hom_sau'));
  const dsHt = (await goi(`/api/ktt/danh-sach${Q20}&loai=chua-di-24h&ma_bcvh=${HT}`, 'admin')).body;
  assert.equal(dsHt.pagination.total, 0);
  const dsHoan = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&hang_hoan=1`, 'admin')).body;
  assert.ok(dsHoan.items.every((x) => x.hang_hoan === true));
  for (const x of hs.items) {
    assert.ok(x.shbg.startsWith('KTT-DEMO-'));
    assert.ok(['ngay_den', 'gio_den_ktt', 'kg', 'ma_bcvh', 'huong', 'nhom', 'bd10_di_gio_lap', 'cho_gio', 'duong_thu_ma', 'noi_gui_ma'].every((c) => c in x), 'đủ cột');
  }
});

// ---------- A: hàng đến ----------
test('A hang-den: tổng bưu gửi = tổng các ngày = tổng các giờ = tổng các đường thư = tổng các xe; hướng hàng theo mã phường / tỉnh; túi chuyển tiếp nguyên túi được tính', async () => {
  // xe Cấp 1 đến 06:00 20/10 (BD10 riêng cho từng túi); 5 SHBG đích Thuận Hóa (49122 → xem ktt_dia_ban_phat), ba SHBG chuyển tiếp
  const px = db.prepare('SELECT ma_phuong_xa, ma_bcvh FROM ktt_dia_ban_phat LIMIT 1').get();
  assert.ok(px, 'địa bàn phát mặc định có dữ liệu');
  const BD = 'BD10-CT-1';
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-10-20 06:10:00', bd10_den_so_hieu: BD, bd10_den_xnd: '2026-10-20 06:00:00', bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'DT-A', bd10_den_ten_duong_thu: 'Đường thư giả A' });
  bg(t, 'KTT-DEMO-E1', { ma_xa_phuong: px.ma_phuong_xa, ma_tinh_thanh: '53', khoi_luong_thuc_te_g: 500 });
  bg(t, 'KTT-DEMO-E2', { ma_xa_phuong: '00000', ma_tinh_thanh: '53', khoi_luong_thuc_te_g: 1500 }); // Huế chưa rõ BCVH
  bg(t, 'KTT-DEMO-E3', { ma_xa_phuong: '00000', ma_tinh_thanh: '52', khoi_luong_thuc_te_g: 100 }); // Quảng Trị
  bg(t, 'KTT-DEMO-E4', { ma_xa_phuong: '00000', ma_tinh_thanh: '01', khoi_luong_thuc_te_g: 100 }); // tỉnh khác
  const ct = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'CHUYEN_TIEP', co_mo_tui: 0, gio_quet_tui_di: '2026-10-20 09:00:00', bd10_den_so_hieu: 'BD10-CT-2', bd10_den_xnd: '2026-10-21 14:00:00', bd10_den_ma_diem_gui: '999002', bd10_den_ma_duong_thu: 'DT-B', bd10_den_ten_duong_thu: 'Đường thư giả B' });
  bg(ct, 'KTT-DEMO-E5', { ma_xa_phuong: px.ma_phuong_xa, ma_tinh_thanh: '53', khoi_luong_thuc_te_g: 700 });
  const nt = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-10-21 03:00:00', bd10_den_so_hieu: 'BD10-NT', bd10_den_xnd: '2026-10-21 03:00:00', bd10_den_ma_diem_gui: '530101', bd10_den_ma_duong_thu: 'DT-N' });
  bg(nt, 'KTT-DEMO-E6', { ma_xa_phuong: px.ma_phuong_xa }); // nội tỉnh: KHÔNG phải xe Cấp 1
  capOk('2026-10-23 10:00:00');
  const th = (await goi(`/api/ktt/hang-den/tong-hop${Q20}`, 'admin')).body;
  assert.equal(th.shbg, 5, 'E1..E5; E6 là xe nội tỉnh nên không tính');
  assert.equal(th.xe, 2);
  assert.equal(th.kg, 2.9);
  assert.equal(th.dich.tp_hue.shbg, 3);
  assert.equal(th.dich.hue_chua_ro_bcvh, 1);
  assert.deepEqual([th.dich.ngoai_hue.quang_tri, th.dich.ngoai_hue.tinh_khac, th.dich.ngoai_hue.shbg], [1, 1, 2]);
  assert.equal(th.dich.tp_hue.shbg + th.dich.ngoai_hue.shbg, th.shbg);
  assert.equal(th.theo_ngay.reduce((s, d) => s + d.shbg, 0), th.shbg);
  assert.deepEqual(th.theo_ngay.map((d) => [d.ngay, d.shbg, d.xe]), [['2026-10-20', 4, 1], ['2026-10-21', 1, 1]]);
  const gio = (await goi(`/api/ktt/hang-den/theo-gio${Q20}`, 'admin')).body;
  assert.equal(gio.theo_gio.length, 24);
  assert.equal(gio.theo_gio.reduce((s, g) => s + g.shbg, 0), th.shbg);
  assert.equal(gio.theo_gio[6].shbg, 4);
  assert.equal(gio.theo_gio[14].shbg, 1);
  for (const g of gio.theo_gio) assert.equal(Object.values(g.theo_duong_thu).reduce((s, n) => s + n, 0) + g.khac, g.shbg);
  const dt = (await goi(`/api/ktt/hang-den/theo-duong-thu${Q20}`, 'admin')).body;
  assert.equal(dt.theo_duong_thu.reduce((s, e) => s + e.shbg, 0), th.shbg);
  assert.deepEqual(dt.theo_duong_thu.map((e) => [e.duong_thu_ma, e.shbg, e.xe]), [['DT-A', 4, 1], ['DT-B', 1, 1]]);
  assert.equal(dt.theo_duong_thu[0].huong_hang.tong, 4);
  assert.equal((await goi(`/api/ktt/hang-den/theo-duong-thu${Q20}&top=1`, 'admin')).body.theo_duong_thu.length, 1);
  const xe = (await goi(`/api/ktt/hang-den/xe${Q20}`, 'admin')).body;
  assert.deepEqual(xe.xe.map((x) => [x.bd10, x.shbg, x.gio]), [['BD10-CT-1', 4, '06:00'], ['BD10-CT-2', 1, '14:00']]);
  assert.equal(xe.xe.reduce((s, x) => s + x.shbg, 0), th.shbg);
  assert.equal(th.cua_so_thuc_te.so_ngay_co_du_lieu, 2);
  assert.equal(th.meta.so_ngay, undefined, 'không còn trường thừa so_ngay (từng luôn = 0)');
  assert.equal(th.meta.so_ngay_co_du_lieu, 2);
  assert.equal(th.meta.so_tui_thieu_gio_xe_den, 0);
});

test('A gomDot / dichCua: gộp xe cách ≤ 120 phút thành một đợt, bỏ đợt dưới 5%; mã phường không tra được -> theo mã tỉnh; thiếu cả hai -> không rõ', () => {
  const xe = new Map([['a', { giay: 6 * 3600, shbg: 50 }], ['b', { giay: 7 * 3600, shbg: 50 }], ['c', { giay: 14 * 3600, shbg: 100 }], ['d', { giay: 20 * 3600, shbg: 1 }]]);
  const dot = HD.gomDot(xe, 201);
  assert.deepEqual(dot.map((d) => [d.so_xe, d.shbg]), [[2, 100], [1, 100]]);
  assert.equal(dot[0].gio, '06:30');
  assert.equal(HD.dichCua('49122', '', { 49122: TH }), TH);
  assert.equal(HD.dichCua('x', '53', {}), HD.DICH.HUE_CHUA_RO_BCVH);
  assert.equal(HD.dichCua('x', '52', {}), HD.DICH.QUANG_TRI);
  assert.equal(HD.dichCua('', '', {}), HD.DICH.KHONG_RO);
  assert.equal(HD.dichCua('x', '01', {}), HD.DICH.TINH_KHAC);
});

// ---------- tổng quan ----------
test('tong-quan: số bằng ĐÚNG các hàm con (B1 the, B2 theo ngày, rớt lại top 3, A tổng hợp, chia 12 giờ); cùng cửa sổ thực tế và Dữ liệu đến', async () => {
  duLieu();
  const tq = (await goi(`/api/ktt/tong-quan${Q20}`, 'admin')).body;
  const th = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  const tn = (await goi(`/api/ktt/dicungngay/theo-ngay${Q20}`, 'admin')).body;
  const tg = (await goi(`/api/ktt/dicungngay/theo-gio${Q20}`, 'admin')).body;
  const rl = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}&top=3`, 'admin')).body;
  const a = (await goi(`/api/ktt/hang-den/tong-hop${Q20}`, 'admin')).body;
  const { khoang_ngay, cua_so_thuc_te, nguon_xuat_luc_moi_nhat } = th;
  assert.deepEqual([tq.khoang_ngay, tq.cua_so_thuc_te, tq.nguon_xuat_luc_moi_nhat], [khoang_ngay, cua_so_thuc_te, nguon_xuat_luc_moi_nhat]);
  const bo = ({ khoang_ngay: _a, cua_so_thuc_te: _b, nguon_xuat_luc_moi_nhat: _c, bay_gio: _d, co_du_lieu: _e, ly_do: _f, dinh_nghia: _g, hang_hoan_chua_nap: _h, hang_hoan_nguon_xuat_luc: _i, ...rest }) => rest; // eslint-disable-line no-unused-vars
  assert.deepEqual(tq.di_cung_ngay.the, bo(th));
  assert.deepEqual(tq.di_cung_ngay.theo_ngay.map((d) => [d.ngay, d.mau_so, d.cung_ngay, d.ty_le_cung_ngay, d.chu_nhat, d.da_chot]), tn.theo_ngay.map((d) => [d.ngay, d.bcvh_hue.mau_so, d.bcvh_hue.cung_ngay, d.bcvh_hue.ty_le.cung_ngay, d.chu_nhat, d.da_chot]));
  assert.deepEqual(tq.di_cung_ngay.so_sanh_chu_nhat, tn.so_sanh_chu_nhat);
  assert.deepEqual(tq.di_cung_ngay.chia_12h, tg.chia_12h);
  assert.deepEqual(tq.rot_lai.dong, rl.dong);
  assert.deepEqual(tq.rot_lai.cong_top, rl.cong_top);
  assert.equal(tq.hang_den.tong_hop.shbg, a.shbg);
  assert.equal(tq.hang_den.tong_hop.xe, a.xe);
  assert.deepEqual(tq.hang_den.tong_hop.dich, a.dich);
  assert.ok(Array.isArray(tq.canh_bao));
});

test('tong-quan cảnh báo: hàng đến từ 12 giờ rớt sang hôm sau nhiều -> DEN_TU_12H_SANG_HOM_SAU', async () => {
  for (let i = 0; i < 6; i++) kt(`KTT-DEMO-L${i}`, { quet: '2026-10-20 15:00:00', gioDi: '2026-10-21 06:50:00' });
  for (let i = 0; i < 6; i++) kt(`KTT-DEMO-M${i}`, { quet: '2026-10-20 05:00:00', gioDi: '2026-10-20 06:50:00' });
  capOk('2026-10-22 10:00:00');
  const tq = (await goi('/api/ktt/tong-quan?tu=2026-10-20&den=2026-10-20', 'admin')).body;
  const c = tq.canh_bao.find((x) => x.ma === 'DEN_TU_12H_SANG_HOM_SAU');
  assert.ok(c, JSON.stringify(tq.canh_bao));
  assert.equal(c.tu_12h, 0);
  assert.equal(c.truoc_12h, 1);
});

// ---------- cache ----------
test('cache theo ngày: lần 2 không tính lại ngày; độ mới đổi thì ngày trong cửa sổ nạp tính lại; kết quả cùng độ mới giống nhau', async () => {
  duLieu();
  const a = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  const t1 = Api.thongKe().ngayBTinh;
  assert.equal(t1, 3);
  const b = (await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin')).body;
  const bt = (await goi(`/api/ktt/dicungngay/theo-gio${Q20}`, 'admin')).body; // cùng bó ngày với tong-hop
  await goi(`/api/ktt/tong-quan${Q20}`, 'admin');
  assert.equal(Api.thongKe().ngayBTinh, 3, 'mọi endpoint B dùng chung bó ngày');
  assert.deepEqual(a, b);
  assert.ok(bt.theo_gio);
  capOk('2026-10-23 11:00:00');
  await goi(`/api/ktt/dicungngay/tong-hop${Q20}`, 'admin');
  assert.equal(Api.thongKe().ngayBTinh, 6, 'độ mới đổi -> ngày trong cửa sổ nạp (8 ngày) tính lại');
  const hd1 = Api.thongKe().hangDenTinh;
  await goi(`/api/ktt/hang-den/tong-hop${Q20}`, 'admin');
  await goi(`/api/ktt/hang-den/xe${Q20}`, 'admin');
  assert.equal(Api.thongKe().hangDenTinh, hd1 + 1, 'A: một lần tính cho một khoảng, hai endpoint dùng chung');
});

test('chỉ đọc: các endpoint KTT-12 không ghi DB (số thay đổi không đổi)', async () => {
  duLieu();
  const truoc = db.prepare('SELECT (SELECT COUNT(*) FROM ktt_tui) a, (SELECT COUNT(*) FROM ktt_buu_gui) b, (SELECT COUNT(*) FROM ktt_nap_cap) c').get();
  for (const [, url] of ROUTES) await goi(url, 'admin');
  assert.deepEqual(db.prepare('SELECT (SELECT COUNT(*) FROM ktt_tui) a, (SELECT COUNT(*) FROM ktt_buu_gui) b, (SELECT COUNT(*) FROM ktt_nap_cap) c').get(), truoc);
});

test('hàm thuần: congCacNgay cộng đúng; ketQuaKhoi mẫu số 0 -> tỷ lệ null; phanLoaiDi bỏ đích không rõ', () => {
  const k = D.khoiMoi();
  assert.equal(D.ketQuaKhoi(k).ty_le.cung_ngay, null);
  const a = D.taoNgay('2026-10-20'); a.huong.lien_tinh_den_bcvh.cung_ngay = 2; a.co_du_lieu = true;
  const b = D.taoNgay('2026-10-21'); b.huong.lien_tinh_den_bcvh.cung_ngay = 3; b.huong.lien_tinh_den_bcvh.hom_sau = 1;
  const m = D.congCacNgay([a, b]);
  assert.equal(m.huong.lien_tinh_den_bcvh.cung_ngay, 5);
  assert.deepEqual([m.so_ngay_co_du_lieu, m.ngay_dau, m.ngay_cuoi], [1, '2026-10-20', '2026-10-20']);
  assert.deepEqual(D.phanLoaiDi({ nhom: 'KHONG_RO' }, {}, 0), { bo: 'khong_ro_dich' });
  assert.deepEqual(D.phanLoaiDi({ nhom: 'KTT', diemGuiDen: '999' }, {}, 0), { bo: 'ngoai_nhom_b' });
});
