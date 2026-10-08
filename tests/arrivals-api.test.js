// ==========================================
// Test: API "Hàng đến" (server/routes/arrivals.js + server/lib/arrivalsQuery.js) — quy tắc SẢN LƯỢNG ĐẾN.
// Server thật trên DB tạm; dữ liệu là CSV GIẢ sinh trong thư mục tạm (không có số hiệu thật).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { isHomeProvince } = require('../server/lib/arrivalsQuery');

const PORT = 5912;
const USERS = {
  admin: { hrm: 'AR_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  manager: { hrm: 'AR_MGR', pass: 'Manager@123', role: 'MANAGER' },
  staff: { hrm: 'AR_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;

const BD10_19 = '9900019900990000001';
let seq = 0;
function row(over = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: '990099', Ten_duong_thu: 'Đường thư giả', SHBG: `ZZ9${String(seq).padStart(8, '0')}VN`,
    So_hieu_BD10: 'BD10-A', 'Thời gian XN túi': '10/4/2026 8:00:00 AM', 'Thời gian XN BG': '10/4/2026 8:10:00 AM',
    Ngay_gio_XND_BD10: '', Ngay_gio_XND_BD10_tai_TTKT: '10/3/2026 9:00:00 PM', So_hieu_BD8: `T-${seq}`,
    Khoi_luong_thuc_te: '100', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'Bộ;Giả (Túi)',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', ...over
  };
}
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
function writeCsv(name, rows, header = EXPECTED_HEADER) {
  const file = path.join(workDir, `${++seq}`, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [header.map(q).join(','), ...rows.map((r) => header.map((h) => q(r[h] ?? '')).join(','))];
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n');
  return file;
}

const T = (n) => `ZZ5${String(n).padStart(8, '0')}VN`;
const NO_ITEM = { 'Thời gian XN BG': '' };
// File 04/10 (BC 990099). Mặc định: XN túi 08:00 + XN bưu gửi 08:10, phường An, tỉnh nhà.
const FILE_04 = [
  // T1: 2 dòng (khác BD8) cùng thời điểm -> 1 bưu gửi; khối lượng của dòng đại diện (id nhỏ nhất) = 100
  row({ SHBG: T(1), Khoi_luong_thuc_te: '100' }),
  row({ SHBG: T(1), Khoi_luong_thuc_te: '999' }),
  // T2: đến lần 1 ngày 04/10 (phường An); lần 2 ở file 05/10 (phường Bình)
  row({ SHBG: T(2) }),
  // T3/T4/T5: ranh giới giờ (chỉ XN túi): đúng 09:30:00, 09:30:01, 09:29:59
  row({ SHBG: T(3), 'Thời gian XN túi': '10/4/2026 9:30:00 AM', ...NO_ITEM }),
  row({ SHBG: T(4), 'Thời gian XN túi': '10/4/2026 9:30:01 AM', ...NO_ITEM }),
  row({ SHBG: T(5), 'Thời gian XN túi': '10/4/2026 9:29:59 AM', ...NO_ITEM }),
  // T6: không có mốc nào -> không vào sản lượng
  row({ SHBG: T(6), 'Thời gian XN túi': '', ...NO_ITEM }),
  // T7–T10: tỉnh khác / thiếu tỉnh / thiếu phường / tỉnh tên cũ
  row({ SHBG: T(7), Ten_Tinh_Thanh: 'TP. Hà Nội' }),
  row({ SHBG: T(8), Ten_Tinh_Thanh: '' }),
  row({ SHBG: T(9), Ten_Xa_Phuong: '' }),
  row({ SHBG: T(10), Ten_Xa_Phuong: 'Phường Bình', Ten_Tinh_Thanh: 'Tỉnh Thừa Thử' }),
  // T11: XND BD10 07:00 + XN bưu gửi (không túi) -> tổ hợp 011, đến 07:00
  row({ SHBG: T(11), 'Thời gian XN túi': '', Ngay_gio_XND_BD10: '10/4/2026 7:00:00 AM' }),
  // T12: XND BD10 sớm (02/10) -> đến 02/10, cảnh báo mốc BD10 sớm; tổ hợp 111
  row({ SHBG: T(12), Ngay_gio_XND_BD10: '10/2/2026 8:00:00 AM' }),
  // T13: chỉ XN bưu gửi (001); T14: túi + BD10 (110); T15: chỉ BD10 (010)
  row({ SHBG: T(13), 'Thời gian XN túi': '' }),
  row({ SHBG: T(14), Ngay_gio_XND_BD10: '10/4/2026 7:50:00 AM', ...NO_ITEM }),
  row({ SHBG: T(15), 'Thời gian XN túi': '', Ngay_gio_XND_BD10: '10/4/2026 7:40:00 AM', ...NO_ITEM }),
  // T16: dòng 1 chỉ túi, dòng 2 chỉ XN bưu gửi -> mốc "có" xét MỌI dòng trong khoảng = 101 (dòng đại diện chỉ là 100)
  row({ SHBG: T(16), ...NO_ITEM }),
  row({ SHBG: T(16), 'Thời gian XN túi': '', 'Thời gian XN BG': '10/4/2026 8:30:00 AM' }),
  // T17: số hiệu BD10 19 chữ số
  row({ SHBG: T(17), So_hieu_BD10: BD10_19 })
];
const FILE_05 = [row({ SHBG: T(2), 'Thời gian XN túi': '10/5/2026 7:00:00 AM', 'Thời gian XN BG': '10/5/2026 7:10:00 AM', Ten_Xa_Phuong: 'Phường Bình' })];
const FILE_04_OTHER = [row({ SHBG: T(18), BC_nhan_BG: '990088' })];
const SL_DAY4 = 16; // ngày 04/10: T1–T5, T7–T11, T13–T18 (T6 không mốc, T12 đến 02/10)

// SANLUONG-3d — đường thư / dịch vụ / hàng nặng: dữ liệu riêng ngày 10/10 (không ảnh hưởng các ca 04/10).
// Mặc định: chỉ mốc XN túi (thời điểm đến = giờ túi), đường thư X, dịch vụ C.
const D = (n) => `ZZ7${String(n).padStart(8, '0')}VN`;
const X = 'Đường thư giả X'; const Y = 'Đường thư giả Y'; const Z = 'Đường thư giả Z';
const C = { Dich_vu_code: 'C', Ten_dich_vu: 'Bưu kiện giả' };
const E = { Dich_vu_code: 'E', Ten_dich_vu: 'EMS giả' };
const R = { Dich_vu_code: 'R', Ten_dich_vu: 'Bảo đảm giả' };
const drow = (n, time, over = {}) => row({ SHBG: D(n), 'Thời gian XN túi': `10/10/2026 ${time}`, 'Thời gian XN BG': '',
  Ten_duong_thu: X, ...C, ...over });
const FILE_10 = [
  drow(1, '8:00:00 AM', { Khoi_luong_thuc_te: '2499', 'Thời gian XN BG': '10/10/2026 8:05:00 AM' }),
  drow(2, '8:30:00 AM', { Khoi_luong_thuc_te: '2500' }),
  drow(3, '1:00:00 PM', { Khoi_luong_thuc_te: '2501' }),
  drow(4, '1:10:00 PM', { Khoi_luong_thuc_te: '' }),
  drow(10, '1:20:00 PM', { Khoi_luong_thuc_te: '10' }),
  drow(5, '10:00:00 AM', { Khoi_luong_thuc_te: '0', Ten_duong_thu: Y, ...E }),
  drow(6, '9:15:00 AM', { Khoi_luong_thuc_te: '30000', Ten_duong_thu: Y, ...E }),
  drow(7, '8:00:00 AM', { Khoi_luong_thuc_te: '100', Ten_duong_thu: '', ...E }),
  drow(8, '10:30:00 AM', { Khoi_luong_thuc_te: '100', Ten_duong_thu: Y, Dich_vu_code: '', Ten_dich_vu: '' }),
  drow(12, '9:40:00 AM', { Khoi_luong_thuc_te: '100', Ten_duong_thu: Y, ...R, Ten_Xa_Phuong: 'Phường Bình' }),
  // D9: 2 dòng — dòng đại diện (sớm nhất, 07:00) thuộc đường thư Z / dịch vụ R; dòng 09:00 (X / C) không được tính tên
  drow(9, '7:00:00 AM', { Khoi_luong_thuc_te: '3000', Ten_duong_thu: Z, ...R }),
  drow(9, '9:00:00 AM', { Khoi_luong_thuc_te: '3000' })
];
const FILE_10_OTHER = [drow(11, '1:40:00 PM', { Khoi_luong_thuc_te: '5000', BC_nhan_BG: '990088' })];
const DAY10 = 'from=2026-10-10&to=2026-10-10';

async function api(p, who) {
  const headers = {};
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const mgr = (p) => api(p, 'manager');
const adm = (p) => api(p, 'admin');
const DAY4 = 'from=2026-10-04&to=2026-10-04';
const WIDE = 'from=2026-10-02&to=2026-10-05';
const sl = async (qs) => (await mgr(`/api/arrivals/summary?${qs}`)).body.san_luong;
async function counted(qs) {
  const r = await mgr(`/api/arrivals/items?${qs}&page_size=200`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.items;
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-arrivals-api-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-arrivals-api-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES
      ('po1', '990099', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An'),
      ('po2', '990088', 'BCVH Thử Hai', 'PH2', 'c1', 'Phường Bình'),
      ('po3', '990077', 'Bưu cục Thử Ba', 'GD3', 'c1', 'Phường Cư');
  `);
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    const r = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hrm_code: u.hrm, password: u.pass })
    });
    tokens[k] = (await r.json()).token;
  }
  for (const [name, rows] of [['HangDen_990099_20261004_093012.csv', FILE_04], ['HangDen_990099_20261005_093012.csv', FILE_05],
    ['HangDen_990088_20261004_093012.csv', FILE_04_OTHER], ['HangDen_990099_20261010_093012.csv', FILE_10],
    ['HangDen_990088_20261010_093012.csv', FILE_10_OTHER]]) {
    const r = await importArrivalFile(ctx.db, writeCsv(name, rows));
    assert.equal(r.status, 'OK', JSON.stringify(r));
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('quyền: không token 401, STAFF 403, MANAGER/ADMIN 200; /exceptions và /import-status chỉ ADMIN', async () => {
  const common = ['meta', `summary?${DAY4}`, `by-time?${DAY4}`, `by-ward?${DAY4}`, `quality-mocs?${DAY4}`, `items?${DAY4}`, `lookup?tracking_no=${T(1)}`];
  const adminOnly = [`exceptions?${DAY4}`, 'import-status'];
  for (const e of [...common, ...adminOnly]) {
    assert.equal((await api(`/api/arrivals/${e}`)).status, 401, e);
    assert.equal((await api(`/api/arrivals/${e}`, 'staff')).status, 403, e);
    assert.equal((await adm(`/api/arrivals/${e}`)).status, 200, e);
  }
  for (const e of common) assert.equal((await mgr(`/api/arrivals/${e}`)).status, 200, e);
  for (const e of adminOnly) assert.equal((await mgr(`/api/arrivals/${e}`)).status, 403, e);
  for (const gone of [`by-bdx?${DAY4}`, `by-day?${DAY4}`]) assert.equal((await mgr(`/api/arrivals/${gone}`)).status, 404, gone);
});

test('sản lượng = số SHBG khác nhau; nhiều dòng 1 bưu gửi đếm 1; bưu gửi không có mốc nào không vào sản lượng', async () => {
  const s = (await mgr(`/api/arrivals/summary?${DAY4}`)).body;
  assert.equal(s.san_luong, SL_DAY4);
  const items = await counted(DAY4);
  assert.equal(items.length, SL_DAY4);
  assert.equal(new Set(items.map((i) => i.tracking_no)).size, SL_DAY4);
  assert.ok(!items.some((i) => i.tracking_no === T(6)), 'T6 không mốc');
  assert.equal(items.find((i) => i.tracking_no === T(1)).weight_g, 100, 'khối lượng của dòng đại diện (id nhỏ nhất khi hoà)');
  assert.equal(s.tui_kien, SL_DAY4 + 2, 'túi/kiện = BD8 khác nhau trên các dòng trong khoảng (T1 và T16 có 2 dòng)');
  assert.deepEqual(s.dia_ban_phat, { co: 2, tong: 3 }, 'An + Bình có hàng; danh mục có 3 phường/xã');
});

test('lần đến sớm nhất trong khoảng; đến lại cùng khoảng không đếm thêm; đến lại ở khoảng khác đếm ở khoảng đó', async () => {
  const t2 = async (qs) => (await counted(qs)).find((i) => i.tracking_no === T(2));
  assert.deepEqual([(await t2(DAY4)).thoi_diem, (await t2(DAY4)).ward_name], ['2026-10-04 08:00:00', 'Phường An']);
  const d5 = await t2('from=2026-10-05&to=2026-10-05');
  assert.deepEqual([d5.thoi_diem, d5.ward_name], ['2026-10-05 07:00:00', 'Phường Bình'], 'khoảng chỉ có lần đến thứ 2');
  assert.equal(await sl(WIDE), SL_DAY4 + 1, '02–05/10: thêm T12; T2 vẫn chỉ 1');
  assert.equal((await t2(WIDE)).thoi_diem, '2026-10-04 08:00:00');
  assert.equal(await sl('from=2026-10-05&to=2026-10-05'), 1);
  const days = (await mgr(`/api/arrivals/by-time?${WIDE}`)).body.items;
  assert.deepEqual(days.map((d) => [d.moc, d.san_luong]), [['2026-10-02', 1], ['2026-10-03', 0], ['2026-10-04', SL_DAY4], ['2026-10-05', 0]]);
});

test('ranh giới giờ: đúng from, đúng to, ngoài 1 giây; nhận dấu T', async () => {
  const ids = async (qs) => (await counted(qs)).map((i) => i.tracking_no);
  const a = await ids('from=2026-10-04 09:30&to=2026-10-04 23:59');
  assert.ok(a.includes(T(3)) && a.includes(T(4)) && !a.includes(T(5)), 'from 09:30 gồm 09:30:00, bỏ 09:29:59');
  const b = await ids('from=2026-10-04T09:00&to=2026-10-04T09:30');
  assert.ok(b.includes(T(3)) && b.includes(T(5)) && !b.includes(T(4)), 'to 09:30 gồm 09:30:00, bỏ 09:30:01');
  const c = await ids('from=2026-10-04 00:00&to=2026-10-04');
  assert.equal(c.length, SL_DAY4, 'to chỉ có ngày = hết ngày');
});

test('by-time: granularity=hour đủ 24 mốc, tổng = sản lượng; giới hạn 7 ngày', async () => {
  const h = (await mgr(`/api/arrivals/by-time?${DAY4}&granularity=hour`)).body;
  assert.equal(h.items.length, 24);
  assert.equal(h.items[0].moc, '2026-10-04 00:00');
  assert.equal(h.items.reduce((a, x) => a + x.san_luong, 0), SL_DAY4);
  assert.equal(h.items.find((x) => x.moc === '2026-10-04 07:00').san_luong, 3, 'T11 07:00, T14 07:50, T15 07:40');
  const part = (await mgr('/api/arrivals/by-time?from=2026-10-04 07:30&to=2026-10-04 09:10&granularity=hour')).body.items;
  assert.deepEqual(part.map((x) => x.moc), ['2026-10-04 07:00', '2026-10-04 08:00', '2026-10-04 09:00']);
  assert.equal((await mgr('/api/arrivals/by-time?from=2026-10-01&to=2026-10-07&granularity=hour')).status, 200);
  const over = await mgr('/api/arrivals/by-time?from=2026-10-01&to=2026-10-08&granularity=hour');
  assert.equal(over.status, 400);
  assert.match(over.body.error, /7 ngày/);
});

test('date_basis: arrival / bag / bd10 / item dùng cột thời gian của tiêu chí', async () => {
  assert.equal(await sl(`${DAY4}&date_basis=arrival`), SL_DAY4);
  const bag = (await counted(`${DAY4}&date_basis=bag`)).map((i) => i.tracking_no);
  assert.ok(bag.includes(T(12)) && !bag.includes(T(11)) && !bag.includes(T(13)), 'bag: T12 có túi 04/10; T11/T13 không có túi');
  const bd10 = (await counted(`${WIDE}&date_basis=bd10`)).map((i) => i.tracking_no).sort();
  assert.deepEqual(bd10, [T(11), T(12), T(14), T(15)].sort());
  const item = (await counted(`${DAY4}&date_basis=item`)).map((i) => i.tracking_no);
  assert.ok(!item.includes(T(3)) && item.includes(T(13)), 'item: T3 không có XN bưu gửi');
  const t16 = (await counted(`${DAY4}&date_basis=item`)).find((i) => i.tracking_no === T(16));
  assert.equal(t16.thoi_diem, '2026-10-04 08:30:00', 'thời điểm theo cột XN bưu gửi');
});

test('by-ward: sắp sản lượng giảm dần, tỉnh khác tính vào tổng và có nhóm riêng; Chưa xác định tỉnh / phường/xã', async () => {
  const w = (await mgr(`/api/arrivals/by-ward?${DAY4}`)).body;
  assert.equal(w.san_luong, SL_DAY4);
  const counts = w.items.map((i) => i.san_luong);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a), 'giảm dần');
  assert.deepEqual(w.items.map((i) => i.ward_name), ['Phường An', 'Phường Bình']);
  const g = Object.fromEntries(w.nhom_phan_loai.map((x) => [x.nhom, x.san_luong]));
  assert.deepEqual(g, { OUT_PROVINCE: 1, NO_PROVINCE: 1, NO_WARD: 1 });
  const total = w.items.reduce((a, i) => a + i.san_luong, 0) + Object.values(g).reduce((a, b) => a + b, 0);
  assert.equal(total, SL_DAY4, 'nhóm đặc biệt tính vào tổng');
  assert.equal(w.items.find((i) => i.ward_name === 'Phường Bình').san_luong, 1, 'T10 tỉnh tên cũ vẫn là tỉnh nhà');
  assert.equal(w.nhom_phan_loai.find((x) => x.nhom === 'OUT_PROVINCE').ten, 'Phường/xã tỉnh khác');
  const ty = w.items.reduce((a, i) => a + i.ty_trong, 0) + w.nhom_phan_loai.reduce((a, i) => a + i.ty_trong, 0);
  assert.ok(Math.abs(ty - 100) < 0.1, 'tỷ trọng cộng ~100%');
  assert.equal(await sl(`${DAY4}&ward_key=${encodeURIComponent('Phường Bình')}`), 1);
});

test('quality-mocs: đủ 7 tổ hợp, tổng = sản lượng; mốc "có" xét mọi dòng trong khoảng; bưu gửi không mốc báo riêng', async () => {
  const m = (await mgr(`/api/arrivals/quality-mocs?${DAY4}`)).body;
  assert.equal(m.to_hop.length, 7);
  assert.equal(m.to_hop.reduce((a, c) => a + c.so_buu_gui, 0), m.san_luong);
  assert.equal(m.san_luong, SL_DAY4);
  const by = Object.fromEntries(m.to_hop.map((c) => [c.key, c.so_buu_gui]));
  assert.deepEqual(by, { 111: 0, 110: 1, 101: 9, '011': 1, 100: 3, '010': 1, '001': 1 });
  assert.equal(m.khong_co_moc, 1, 'T6');
  const wide = Object.fromEntries((await mgr(`/api/arrivals/quality-mocs?${WIDE}`)).body.to_hop.map((c) => [c.key, c.so_buu_gui]));
  assert.equal(wide['111'], 1, 'T12 đủ 3 mốc');
});

test('cảnh báo chỉ ADMIN: /summary có canh_bao cho ADMIN, không có cho MANAGER; /exceptions có ly_do', async () => {
  const a = (await adm(`/api/arrivals/summary?${WIDE}`)).body;
  assert.deepEqual([a.canh_bao.chua_xac_dinh_ngay_den, a.canh_bao.moc_bd10_som, a.canh_bao.den_lai_trong_khoang], [1, 1, 1]);
  assert.ok(a.canh_bao.so_moc_theo_dong[0] >= 1);
  const m = (await mgr(`/api/arrivals/summary?${WIDE}`)).body;
  assert.ok(!('canh_bao' in m), 'MANAGER không thấy cảnh báo');
  assert.equal(m.san_luong, a.san_luong);
  const ex = (await adm(`/api/arrivals/exceptions?${WIDE}`)).body.items;
  const reasons = Object.fromEntries(ex.map((e) => [e.ly_do, e.tracking_no]));
  assert.deepEqual(reasons, { MOC_BD10_SOM: T(12), DEN_LAI_TRONG_KHOANG: T(2), KHONG_CO_MOC: T(6) });
  assert.ok(ex.every((e) => e.ly_do_text));
});

test('/lookup: các dòng của 1 SHBG + mốc dùng làm thời điểm đến; không có trường cá nhân', async () => {
  const l = (await mgr(`/api/arrivals/lookup?tracking_no=${T(2)}`)).body;
  assert.equal(l.so_dong, 2);
  assert.deepEqual(l.dong.map((d) => d.arrival_at), ['2026-10-04 08:00:00', '2026-10-05 07:00:00']);
  assert.equal(l.dong[0].moc_dung_lam_thoi_diem_den, 'XN túi');
  const l6 = (await mgr(`/api/arrivals/lookup?tracking_no=${T(6)}`)).body;
  assert.match(l6.dong[0].moc_dung_lam_thoi_diem_den, /Không có mốc/);
  const l17 = (await mgr(`/api/arrivals/lookup?tracking_no=${T(17)}`)).body;
  assert.equal(l17.dong[0].bd10_no, BD10_19);
  assert.equal((await mgr('/api/arrivals/lookup?tracking_no=KHONGCO1')).body.so_dong, 0);
  for (const bad of ['', 'a b', "x'--", 'x&from=1']) {
    assert.equal((await mgr(`/api/arrivals/lookup?tracking_no=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
  assert.equal((await mgr(`/api/arrivals/lookup?tracking_no=${T(2)}&from=2026-10-04`)).status, 400, 'khoá lạ');
});

test('/items: phân trang, số hiệu 19 chữ số dạng chữ, sắp theo thời điểm', async () => {
  const p1 = (await mgr(`/api/arrivals/items?${DAY4}&page_size=5`)).body;
  assert.deepEqual(p1.pagination, { total: SL_DAY4, page: 1, page_size: 5, total_pages: 4 });
  const p9 = (await mgr(`/api/arrivals/items?${DAY4}&page=9&page_size=5`)).body;
  assert.deepEqual([p9.items.length, p9.pagination.total], [0, SL_DAY4]);
  const all = await counted(DAY4);
  const times = all.map((i) => i.thoi_diem);
  assert.deepEqual(times, [...times].sort());
  const t17 = all.find((i) => i.tracking_no === T(17));
  assert.equal(t17.bd10_no, BD10_19);
  assert.equal(typeof t17.bd10_no, 'string');
  assert.equal(await sl(`${DAY4}&receiver_code=990088`), 1);
  assert.equal(await sl(`${DAY4}&receiver_code=990099,990088`), SL_DAY4);
});

test('tham số sai -> 400 tiếng Việt nêu rõ tham số', async () => {
  const cases = [
    ['summary', /"from"/],
    ['summary?from=2026-10-01', /"to"/],
    ['summary?from=2026-02-30&to=2026-03-01', /"from"/],
    ['summary?from=2026-10-04 25:00&to=2026-10-05', /"from"/],
    ['summary?from=2026-10-04 08:00:00&to=2026-10-05', /"from"/],
    ['summary?from=2026-10-05&to=2026-10-01', /nhỏ hơn/],
    ['summary?from=2020-01-01&to=2026-01-01', /tối đa/],
    [`summary?${DAY4}&date_basis=xyz`, /date_basis/],
    [`summary?${DAY4}&receiver_code=abc`, /receiver_code/],
    [`summary?${DAY4}&commune_id=c1`, /"commune_id"/],
    [`by-time?${DAY4}&granularity=week`, /granularity/],
    ['summary?from=2026-10-01&from=2026-10-02&to=2026-10-31', /"from"/],
    [`items?${DAY4}&page_size=201`, /page_size/],
    [`items?${DAY4}&page=0`, /page/],
    ['meta?x=1', /"x"/]
  ];
  for (const [p, re] of cases) {
    const r = await mgr(`/api/arrivals/${p}`);
    assert.equal(r.status, 400, p);
    assert.match(r.body.error, re, p);
  }
});

test('chống chèn SQL: giá trị độc hại bị từ chối hoặc chỉ là tham số; bảng còn nguyên', async () => {
  const before = ctx.db.prepare('SELECT COUNT(*) n FROM arrival_items').get().n;
  const evil = encodeURIComponent("' OR 1=1; DROP TABLE arrival_items; --");
  for (const p of [`summary?${DAY4}&receiver_code=${evil}`, `summary?${DAY4}&date_basis=${evil}`, `summary?from=${evil}&to=2026-10-31`,
    `by-time?${DAY4}&granularity=${evil}`, `lookup?tracking_no=${evil}`]) {
    const r = await mgr(`/api/arrivals/${p}`);
    assert.equal(r.status, 400, p);
    assert.ok(!/SELECT|sqlite/i.test(r.body.error), 'không lộ SQL');
  }
  const w = await mgr(`/api/arrivals/summary?${DAY4}&ward_key=${evil}`);
  assert.equal(w.status, 200);
  assert.equal(w.body.san_luong, 0, 'ward_key chỉ là giá trị so sánh');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM arrival_items').get().n, before);
});

test('/meta và /import-status (ADMIN)', async () => {
  const m = (await mgr('/api/arrivals/meta')).body;
  assert.deepEqual(m.receivers.map((r) => [r.code, r.name, r.type]), [['990088', 'BCVH Thử Hai', 'PH2'], ['990099', 'BCVH Thử Một', 'PH1']]);
  assert.ok(!('communes' in m), 'không còn danh sách BĐX');
  assert.ok(m.wards.some((w) => w.ward_name === 'Phường An' && w.tinh_nha === true));
  assert.deepEqual(m.date_bases.map((d) => d.key), ['arrival', 'bag', 'bd10', 'item']);

  const bad = [...EXPECTED_HEADER];
  bad[0] = 'Cot_La';
  await importArrivalFile(ctx.db, writeCsv('HangDen_990099_20261004_150011.csv', [row({ Ghi_chu: 'NOI_DUNG_DONG' })], bad));
  await importArrivalFile(ctx.db, writeCsv('HangDen_990088_20261004_093012.csv', [row({ SHBG: T(99), BC_nhan_BG: '990088' })]));
  const s = (await adm('/api/arrivals/import-status')).body;
  assert.deepEqual(s.by_status, { OK: 5, REJECTED: 1, CONFLICT: 1 });
  assert.deepEqual(s.problems.map((p) => [p.file_name, p.status, p.has_accepted_version]).sort(), [
    ['HangDen_990088_20261004_093012.csv', 'CONFLICT', true],
    ['HangDen_990099_20261004_150011.csv', 'REJECTED', false]
  ]);
  assert.ok(!JSON.stringify(s).includes('NOI_DUNG_DONG') && !JSON.stringify(s).includes('ZZ5'), 'không lộ nội dung dòng');
  assert.ok(s.missing_batches.some((x) => x.unit_code === '990099' && x.date === '2026-10-04' && x.file_count === 1));
});

// ------------------ SANLUONG-3d: đường thư / dịch vụ / hàng nặng ------------------
const named = (body, ten) => body.items.find((i) => i.ten === ten);

test('/by-route, /by-service: quyền 401 / 403 / 200', async () => {
  for (const e of [`by-route?${DAY10}`, `by-service?${DAY10}`, `summary?${DAY10}&heavy_g=3000`]) {
    assert.equal((await api(`/api/arrivals/${e}`)).status, 401, e);
    assert.equal((await api(`/api/arrivals/${e}`, 'staff')).status, 403, e);
    assert.equal((await mgr(`/api/arrivals/${e}`)).status, 200, e);
    assert.equal((await adm(`/api/arrivals/${e}`)).status, 200, e);
  }
});

test('/by-route: tổng các nhóm = sản lượng; đường thư rỗng vào nhóm riêng; tên theo dòng đại diện; sắp giảm dần', async () => {
  const s = (await mgr(`/api/arrivals/summary?${DAY10}`)).body;
  const r = (await mgr(`/api/arrivals/by-route?${DAY10}`)).body;
  assert.equal(s.san_luong, 12);
  assert.equal(r.san_luong, 12);
  assert.equal(r.items.reduce((a, x) => a + x.san_luong, 0) + r.chua_co_ten.san_luong, s.san_luong);
  assert.deepEqual(r.items.map((x) => [x.ten, x.san_luong]), [[X, 6], [Y, 4], [Z, 1]], 'giảm dần; D9 tính vào Z (dòng đại diện)');
  assert.deepEqual([r.chua_co_ten.ten, r.chua_co_ten.san_luong], ['Chưa có tên đường thư', 1]);
  assert.equal(named(r, X).ty_trong, 50);
  for (const x of [...r.items, r.chua_co_ten]) assert.ok(x.hang_nang <= x.san_luong);
});

test('/by-route: gio_nhieu_nhat theo mốc đến của dòng đại diện; hoà thì giờ sớm hơn', async () => {
  const r = (await mgr(`/api/arrivals/by-route?${DAY10}`)).body;
  assert.equal(named(r, X).gio_nhieu_nhat, 13, 'X: 13h có 4 (D3, D4, D10, D11) > 8h có 2');
  assert.equal(named(r, Y).gio_nhieu_nhat, 9, 'Y: 9h (D6, D12) hoà 10h (D5, D8) -> chọn 9');
  assert.equal(named(r, Z).gio_nhieu_nhat, 7, 'Z: D9 lúc 07:00 (dòng đại diện), không phải 09:00');
});

test('hàng nặng: > 2.500 g (2.499 / 2.500 không nặng, 2.501 nặng; rỗng, 0 không nặng); /summary có hang_nang và tỷ lệ', async () => {
  const s = (await mgr(`/api/arrivals/summary?${DAY10}`)).body;
  assert.deepEqual([s.hang_nang, s.ty_le_hang_nang, s.nguong_hang_nang_g], [4, 33.33, 2500], 'D3, D6, D9, D11');
  const r = (await mgr(`/api/arrivals/by-route?${DAY10}`)).body;
  assert.deepEqual([named(r, X).hang_nang, named(r, X).ty_le_hang_nang], [2, 33.33], 'X: D3 (2.501 g), D11 (5.000 g)');
  assert.equal(named(r, Y).hang_nang, 1, 'Y: D6 (30.000 g); D5 = 0 g không nặng');
  const v = (await mgr(`/api/arrivals/by-service?${DAY10}`)).body;
  const sumHeavy = (b) => b.items.reduce((a, x) => a + x.hang_nang, 0) + b.chua_co_ten.hang_nang;
  assert.equal(sumHeavy(r), sumHeavy(v), 'tổng hàng nặng theo đường thư = theo dịch vụ');
  assert.equal(sumHeavy(r), s.hang_nang);
});

test('heavy_g đổi ngưỡng; heavy_g sai -> 400 tiếng Việt', async () => {
  const h = async (g) => (await mgr(`/api/arrivals/summary?${DAY10}&heavy_g=${g}`)).body.hang_nang;
  assert.equal(await h(2499), 5, 'thêm D2 (2.500 g)');
  assert.equal(await h(500), 6, 'D1, D2, D3, D6, D9, D11');
  assert.equal(await h(30000), 0, 'D6 = 30.000 g không lớn hơn 30.000');
  assert.equal((await mgr(`/api/arrivals/by-route?${DAY10}&heavy_g=3000`)).body.nguong_hang_nang_g, 3000);
  for (const bad of ['499', '30001', '2.5', 'abc', '-1', encodeURIComponent("2500' OR 1=1")]) {
    for (const e of ['summary', 'by-route', 'by-service']) {
      const r = await mgr(`/api/arrivals/${e}?${DAY10}&heavy_g=${bad}`);
      assert.equal(r.status, 400, `${e} ${bad}`);
      assert.match(r.body.error, /"heavy_g"/);
    }
  }
  assert.equal((await mgr(`/api/arrivals/by-ward?${DAY10}&heavy_g=3000`)).status, 400, 'endpoint khác không nhận heavy_g');
});

test('/by-service: nhóm theo mã + tên dịch vụ, khối lượng trung bình, nhóm riêng "Chưa có tên dịch vụ"', async () => {
  const v = (await mgr(`/api/arrivals/by-service?${DAY10}`)).body;
  assert.equal(v.items.reduce((a, x) => a + x.san_luong, 0) + v.chua_co_ten.san_luong, 12);
  assert.deepEqual(v.items.map((x) => [x.ma, x.ten, x.san_luong]), [['C', 'Bưu kiện giả', 6], ['E', 'EMS giả', 3], ['R', 'Bảo đảm giả', 2]]);
  assert.equal(named(v, 'Bưu kiện giả').khoi_luong_tb_g, 2085, '(2499 + 2500 + 2501 + 0 + 10 + 5000) / 6');
  assert.equal(named(v, 'EMS giả').khoi_luong_tb_g, 10033, '(0 + 30000 + 100) / 3');
  assert.deepEqual([v.chua_co_ten.ten, v.chua_co_ten.san_luong, v.chua_co_ten.khoi_luong_tb_g], ['Chưa có tên dịch vụ', 1, 100]);
  assert.ok(!('gio_nhieu_nhat' in v.items[0]));
});

test('/by-route, /by-service: bộ lọc bưu cục / phường-xã / tiêu chí ngày / giờ', async () => {
  const r = async (qs) => (await mgr(`/api/arrivals/by-route?${DAY10}&${qs}`)).body;
  const recv = await r('receiver_code=990088');
  assert.deepEqual([recv.san_luong, recv.items.map((x) => x.ten), named(recv, X).hang_nang], [1, [X], 1]);
  const ward = await r(`ward_key=${encodeURIComponent('Phường Bình')}`);
  assert.deepEqual([ward.san_luong, ward.items.map((x) => x.ten)], [1, [Y]]);
  const item = await r('date_basis=item');
  assert.deepEqual([item.san_luong, item.items.map((x) => x.ten)], [1, [X]], 'chỉ D1 có XN bưu gửi');
  assert.equal(named(item, X).gio_nhieu_nhat, 8);
  assert.equal((await r('date_basis=bag')).san_luong, 12);
  assert.equal((await mgr(`/api/arrivals/by-service?${DAY10}&receiver_code=990099`)).body.san_luong, 11);
  const morning = (await mgr('/api/arrivals/by-route?from=2026-10-10 07:00&to=2026-10-10 09:59')).body;
  assert.deepEqual(morning.items.map((x) => [x.ten, x.san_luong]), [[X, 2], [Y, 2], [Z, 1]], 'lọc theo giờ');
  assert.equal(morning.chua_co_ten.san_luong, 1);
});

test('isHomeProvince: so khớp tỉnh nhà theo từ khoá danh mục', () => {
  const keys = ['hue'];
  for (const yes of ['Tỉnh Thừa Thiên Huế', 'Thành phố Huế', 'TP. Huế', 'TP Huế', 'thua thien hue']) assert.equal(isHomeProvince(yes, keys), true, yes);
  for (const no of ['TP. Hồ Chí Minh', 'Tỉnh Quảng Trị', '', 'Huế Tân']) assert.equal(isHomeProvince(no, keys), false, no);
});
