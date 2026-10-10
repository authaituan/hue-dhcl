// ==========================================
// Test SANLUONG-4a6: chỉ số "BD10 đến không XNĐ" — khoá `bd10_den_khong_xnd` trong /summary và /dashboard/center,
// GET /api/arrivals/bd10-khong-xnd (danh sách) và /bd10-khong-xnd/export. Server thật trên DB tạm; CSV / số hiệu GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { replaceAssignedBcvh } = require('../server/lib/userBcvh');
const aq = require('../server/lib/arrivalsQuery');
const dash = require('../server/lib/dashboardQuery');

const PORT = 5918;
const M = '533140'; // BCVH đang xem
const M2 = '535470'; // BCVH thứ hai
const USERS = {
  admin: { hrm: 'BD_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'BD_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvhM: { hrm: 'BD_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 533140
  gdvhM2: { hrm: 'BD_GDVH2', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 535470
  gdvhNone: { hrm: 'BD_GDVH0', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'BD_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;

const b10 = (lap, nhan, n) => `${lap}${nhan}${String(n).padStart(7, '0')}`; // 19 ký tự giả
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const iso = (day, hms) => `2026-10-${day} ${hms}`;
function mkRow(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: M, Ten_duong_thu: 'Đường thư giả', SHBG: `ZZ8B${String(seq).padStart(6, '0')}VN`, So_hieu_BD10: '',
    'Thời gian XN túi': 'NULL', 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: `P${seq}`,
    Khoi_luong_thuc_te: '100', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', ...o
  };
}
// r(bd10, { bag, itm, xnd, rc }) — thời gian dạng 'DD HH:mm:ss' của tháng 10/2026 (hoặc '09-28 …' đầy đủ)
const stamp = (v) => (v === undefined ? 'NULL' : /^\d{2}-\d{2} /.test(v) ? `2026-${v}` : iso(v.slice(0, 2), v.slice(3)));
const r = (code, o = {}) => mkRow({ So_hieu_BD10: code, 'Thời gian XN túi': stamp(o.bag), 'Thời gian XN BG': stamp(o.itm), Ngay_gio_XND_BD10: stamp(o.xnd), BC_nhan_BG: o.rc || M, So_hieu_BD8: o.b8 || `P${seq + 1}` });

// ---- Dữ liệu giả. Khung kiểm tra: 02/10 → 08/10. File mới nhất: 09/10 (tuổi tính tới đó). ----
const A1 = b10('530100', M, 1); const A2 = b10('531120', M, 2); const B1 = b10('530100', M, 3); const B2 = b10('531120', M, 4);
const C1 = b10('530100', M, 5); const C2 = b10('531120', M, 6); const C3 = b10('531120', M, 7); const D1 = b10('530100', M, 8);
const E = b10('530100', M, 9); const F = b10('530100', M, 10); const G = b10(M, '531120', 11); const J = b10('531120', M, 12);
const L = b10('531120', M2, 13); const K = b10('530100', M2, 14);
const ROWS = [
  // S1 — có XNĐ
  r(A1, { bag: '04 08:00:00', itm: '04 08:05:00', xnd: '04 07:00:00' }), r(A1, { bag: '04 08:10:00', itm: '04 08:15:00', xnd: '04 07:00:00' }),
  r(A2, { bag: '03 09:00:00', itm: '03 09:05:00', xnd: '03 08:00:00' }),
  r(J, { bag: '04 08:00:00', itm: '04 08:05:00', xnd: '04 08:00:00' }), r(J, { bag: '04 08:10:00', itm: '04 08:15:00', xnd: '04 07:00:00' }), // XNĐ KHÁC nhau giữa các dòng -> MIN, ghi nhận
  // S2 — không XNĐ, ≥ 1 dòng đủ túi + BG
  r(B1, { bag: '05 08:00:00', itm: '05 08:05:00' }), r(B1, { bag: '05 09:00:00' }),
  r(B2, { bag: '06 08:00:00', itm: '06 08:05:00' }), r(B2, { bag: '07 08:00:00', itm: '07 08:05:00' }), // trải 2 ngày: ngày = MIN = 06/10
  // S3 — không XNĐ, có XN nhưng không dòng nào đủ cả hai
  r(C1, { itm: '07 08:00:00' }),
  r(C2, { bag: '02 08:00:00' }), r(C2, { itm: '02 09:00:00' }), // túi ở dòng này, BG ở dòng kia
  r(C3, { itm: '08 08:00:00' }),
  // S4 — không XNĐ, không XN nào
  r(D1), r(D1),
  // Ngoài khung: trước (28/09) và sau (09/10)
  r(E, { bag: '09-28 08:00:00', itm: '09-28 08:05:00' }), r(F, { bag: '09 08:00:00', itm: '09 08:05:00' }),
  // Loại: BD10 lập đi (6 ký tự đầu = BCVH), BD10 rỗng / chữ NULL, mã ngắn, mã nhận khác BCVH của dòng
  r(G, { bag: '05 08:00:00', itm: '05 08:05:00' }), r('', { bag: '05 08:00:00', itm: '05 08:05:00' }), r('NULL', { bag: '05 08:00:00', itm: '05 08:05:00' }),
  r('53010053314', { bag: '05 08:00:00', itm: '05 08:05:00' }), r(L, { bag: '05 08:00:00', itm: '05 08:05:00' }),
  // BCVH thứ hai
  r(K, { bag: '05 08:00:00', itm: '05 08:05:00', rc: M2 })
];
const dayOfRow = (row) => {
  const t = [row['Thời gian XN túi'], row['Thời gian XN BG'], row.Ngay_gio_XND_BD10].find((x) => x !== 'NULL');
  return t ? t.slice(0, 10) : '2026-10-04';
};

function writeFiles() {
  const groups = new Map();
  for (const row of ROWS) {
    const k = `${row.BC_nhan_BG}|${dayOfRow(row).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const [k, rows] of groups) {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(q).join(','), ...rows.map((x) => EXPECTED_HEADER.map((h) => q(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}

async function api(p, who) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null), res };
}
const RANGE = 'from=2026-10-02&to=2026-10-08';

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-bd10-api-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-bd10-api-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '${M}', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An'), ('po2', '${M2}', 'BCVH Thử Hai', 'PH1', 'c1', 'Phường An');
  `);
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvhM, [M]);
  replaceAssignedBcvh(ctx.db, ids.gdvhM2, [M2]);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('dữ liệu giả: chữ NULL đã thành rỗng (BD10 "NULL" không thành số hiệu), mốc NULL = vắng', () => {
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM arrival_items WHERE bd10_no = 'NULL'").get().n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM arrival_items WHERE bd10_no = ''").get().n, 2, 'hai dòng BD10 rỗng ("" và NULL)');
  assert.equal(aq.latestFileDate(ctx.db), '2026-10-09');
});

test('/summary: bd10_den_khong_xnd đúng định nghĩa — S1–S4, quy tắc ngày X, nhóm 530100 / khác, khung ngày, tuổi, ngoài khung, ghi nhận XNĐ khác nhau', async () => {
  const r1 = await api(`/api/arrivals/summary?${RANGE}&receiver_code=${M}`, 'ttvh');
  assert.equal(r1.status, 200);
  const s = r1.body.bd10_den_khong_xnd;
  // Trong khung 02→08/10 (BD10 đến của 533140): S1 = A1, A2, J; S2 = B1, B2; S3 = C1, C2, C3 -> D = 8, N = 5
  assert.deepEqual(s.theo_trang_thai, { s1: 3, s2: 2, s3: 3 });
  assert.equal(s.tong_bd10_den, 8);
  assert.equal(s.khong_xnd, 5);
  assert.equal(s.ty_le, 0.625);
  assert.deepEqual(s.theo_nhom, { '530100': { tong: 3, khong_xnd: 2, ty_le: 0.6667 }, khac: { tong: 5, khong_xnd: 3, ty_le: 0.6 } });
  // Tuổi tới file mới nhất 09/10: C3 (08/10) = 1; C1 (07/10) = 2; B2 (06/10) = 3, B1 (05/10) = 4, C2 (02/10) = 7
  assert.deepEqual(s.theo_tuoi, { '0-1': 1, '2': 1, '3+': 3 });
  // Ngoài khung: E (28/09) trước, F (09/10) sau; D1 (S4) không gán được ngày
  assert.deepEqual(s.ngoai_khung, { truoc_khung: 1, sau_khung: 1, khong_co_moc: 1 });
  assert.equal(s.ghi_nhan.xnd_khong_dong_nhat, 1, 'J: hai dòng XNĐ khác nhau');
  assert.deepEqual(s.khung, { from: '2026-10-02', to: '2026-10-08', quy_tac_ngay: 'X' });
  // BD10 lập đi, rỗng / NULL, mã ngắn, mã nhận khác BCVH của dòng: không nằm trong chỉ số (D cố định ở trên) — đã kiểm bằng D = 8
  // Khung khác: chỉ 04/10 -> A1 (XNĐ 04/10 07:00) + J (04/10 07:00): S1 = 2
  const day4 = (await api(`/api/arrivals/summary?from=2026-10-04&to=2026-10-04&receiver_code=${M}`, 'ttvh')).body.bd10_den_khong_xnd;
  assert.deepEqual(day4.theo_trang_thai, { s1: 2, s2: 0, s3: 0 });
  assert.equal(day4.ty_le, 0, 'có mẫu số, tử số 0 -> 0 (không phải null)');
  // Khung rộng: gồm E và F -> S2 thêm 2
  const wide = (await api(`/api/arrivals/summary?from=2026-09-01&to=2026-10-31&receiver_code=${M}`, 'ttvh')).body.bd10_den_khong_xnd;
  assert.deepEqual([wide.tong_bd10_den, wide.khong_xnd], [10, 7]);
  assert.deepEqual(wide.ngoai_khung, { truoc_khung: 0, sau_khung: 0, khong_co_moc: 1 });
});

test('mẫu số 0 -> ty_le = null (tổng và từng nhóm); khoảng không có dữ liệu', async () => {
  const e = (await api(`/api/arrivals/summary?from=2026-01-01&to=2026-01-02&receiver_code=${M}`, 'admin')).body.bd10_den_khong_xnd;
  assert.equal(e.tong_bd10_den, 0);
  assert.equal(e.ty_le, null);
  assert.deepEqual(e.theo_nhom, { '530100': { tong: 0, khong_xnd: 0, ty_le: null }, khac: { tong: 0, khong_xnd: 0, ty_le: null } });
  assert.equal(e.ngoai_khung.khong_co_moc, 1, 'S4 không phụ thuộc khung');
});

test('chỉ số CÔNG KHAI: ADMIN, TTVH và GDVH đều nhận khoá bd10_den_khong_xnd trong /summary (không sau cờ ADMIN); STAFF bị chặn như /arrivals', async () => {
  for (const who of ['admin', 'ttvh', 'gdvhM', 'gdvhM2', 'gdvhNone']) {
    const r1 = await api(`/api/arrivals/summary?${RANGE}`, who);
    assert.equal(r1.status, 200, who);
    assert.ok(r1.body.bd10_den_khong_xnd && typeof r1.body.bd10_den_khong_xnd.tong_bd10_den === 'number', `${who} có khoá bd10_den_khong_xnd`);
    assert.ok(!('bd10_den_khong_xnd' in (r1.body.canh_bao || {})), 'không nằm trong canh_bao (ADMIN-only)');
    assert.equal('canh_bao' in r1.body, who === 'admin', 'canh_bao chỉ ADMIN — chỉ số BD10 thì không');
  }
  assert.equal((await api(`/api/arrivals/summary?${RANGE}`, 'staff')).status, 403);
  assert.equal((await api(`/api/arrivals/summary?${RANGE}`)).status, 401);
  const tong = async (qs, who) => (await api(`/api/arrivals/summary?${qs}`, who)).body.bd10_den_khong_xnd;
  // ADMIN / TTVH theo bộ lọc: không lọc = cả hai BCVH (533140: D 8, N 5; 535470: K = S2, D 1, N 1)
  for (const who of ['admin', 'ttvh']) {
    const all = await tong(RANGE, who);
    assert.deepEqual([all.tong_bd10_den, all.khong_xnd], [9, 6], who);
    assert.deepEqual([(await tong(`${RANGE}&receiver_code=${M2}`, who)).tong_bd10_den, (await tong(`${RANGE}&receiver_code=${M}`, who)).tong_bd10_den], [1, 8]);
  }
  // GDVH chỉ BCVH được giao
  assert.deepEqual([(await tong(RANGE, 'gdvhM')).tong_bd10_den, (await tong(RANGE, 'gdvhM')).khong_xnd], [8, 5]);
  assert.deepEqual([(await tong(RANGE, 'gdvhM2')).tong_bd10_den, (await tong(RANGE, 'gdvhM2')).khong_xnd], [1, 1]);
  assert.equal((await tong(`${RANGE}&receiver_code=${M}`, 'gdvhM2')).tong_bd10_den, 0, 'lọc BCVH không được giao -> không lộ');
  assert.equal((await tong(RANGE, 'gdvhNone')).tong_bd10_den, 0, 'chưa được giao -> 0, không rơi về tất cả');
  assert.equal((await tong(RANGE, 'gdvhNone')).ty_le, null);
});

test('/dashboard/center: bd10_den_khong_xnd cùng số với /summary, cùng phạm vi vai trò', async () => {
  const c = async (who) => (await api(`/api/arrivals/dashboard/center?${RANGE}`, who)).body.bd10_den_khong_xnd;
  const all = await c('ttvh');
  assert.deepEqual([all.tong_bd10_den, all.khong_xnd], [9, 6]);
  const sum = (await api(`/api/arrivals/summary?${RANGE}`, 'ttvh')).body.bd10_den_khong_xnd;
  assert.deepEqual(all, sum);
  assert.deepEqual([(await c('gdvhM')).tong_bd10_den, (await c('gdvhM2')).tong_bd10_den, (await c('gdvhNone')).tong_bd10_den], [8, 1, 0]);
  assert.equal((await api(`/api/arrivals/dashboard/center?${RANGE}`, 'staff')).status, 403);
});

test('các chỉ số CŨ không đổi: /summary (trừ khoá mới), /center, quality-mocs, not-received giống kết quả hàm gốc trên cùng dữ liệu', async () => {
  const f = aq.parseFilters({ from: '2026-10-02', to: '2026-10-08' }, { allowed: ['from', 'to', 'date_basis', 'receiver_code', 'ward_key', 'heavy_g'] });
  const base = aq.summary(ctx.db, f, { isAdmin: true, scopeCodes: null });
  const api1 = (await api(`/api/arrivals/summary?${RANGE}`, 'admin')).body;
  const { bd10_den_khong_xnd: bd, ...rest } = api1;
  assert.ok(bd);
  assert.deepEqual(rest, JSON.parse(JSON.stringify(base)));
  const centerBase = dash.center(ctx.db, { from: '2026-10-02', to: '2026-10-08' });
  const { bd10_den_khong_xnd: bd2, ...centerRest } = (await api(`/api/arrivals/dashboard/center?${RANGE}`, 'admin')).body;
  const { bd10_den_khong_xnd: bd3, ...centerBaseRest } = JSON.parse(JSON.stringify(centerBase));
  assert.ok(bd2 && bd3);
  assert.deepEqual(centerRest, centerBaseRest);
  const qm = (await api(`/api/arrivals/quality-mocs?${RANGE}`, 'ttvh')).body;
  assert.ok(qm.tong_hop.theo_nguon && qm.tong_hop.du_trang_thai && qm.tong_hop.khong_xnd_bd10, 'quality-mocs còn nguyên các khoá (#61 sẽ được thay sau, chưa xoá)');
  assert.equal((await api(`/api/arrivals/not-received?${RANGE}`, 'ttvh')).status, 200);
});

test('GET /bd10-khong-xnd: danh sách N (S2 + S3), cũ nhất trước, trường đầy đủ, lọc nhom / tuoi, phân trang, bí danh unit', async () => {
  const l = (await api(`/api/arrivals/bd10-khong-xnd?${RANGE}&receiver_code=${M}`, 'ttvh')).body;
  assert.deepEqual(l.items.map((i) => i.so_hieu_bd10), [C2, B1, B2, C1, C3], 'theo ngày gán tăng dần');
  assert.deepEqual(l.items.map((i) => i.trang_thai), ['S3', 'S2', 'S2', 'S3', 'S3']);
  assert.deepEqual(l.items.map((i) => i.ngay), ['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  assert.deepEqual(l.items.map((i) => i.tuoi), [7, 4, 3, 2, 1]);
  assert.deepEqual(l.items.map((i) => i.lap6), ['531120', '530100', '531120', '530100', '531120']);
  assert.deepEqual(l.items.map((i) => i.nhom), ['khac', '530100', 'khac', '530100', 'khac']);
  const b1 = l.items.find((i) => i.so_hieu_bd10 === B1);
  assert.deepEqual([b1.so_buu_gui, b1.so_bd8, b1.co_xn_tui, b1.co_xn_bg, b1.ma_bcvh], [2, 2, true, true, M]);
  const c2 = l.items.find((i) => i.so_hieu_bd10 === C2);
  assert.deepEqual([c2.so_buu_gui, c2.co_xn_tui, c2.co_xn_bg, c2.trang_thai], [2, true, true, 'S3'], 'túi và BG ở các dòng khác nhau');
  const c1 = l.items.find((i) => i.so_hieu_bd10 === C1);
  assert.deepEqual([c1.co_xn_tui, c1.co_xn_bg], [false, true]);
  assert.deepEqual(l.pagination, { total: 5, page: 1, page_size: 50, total_pages: 1 });
  assert.equal(l.items.length, l.pagination.total, 'khớp khoá khong_xnd của /summary (5)');
  // lọc
  const ids = async (qs, who = 'ttvh') => (await api(`/api/arrivals/bd10-khong-xnd?${qs}`, who)).body.items.map((i) => i.so_hieu_bd10);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&nhom=530100`), [B1, C1]);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&nhom=khac`), [C2, B2, C3]);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&tuoi=0-1`), [C3]);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&tuoi=2`), [C1]);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&tuoi=3%2B`), [C2, B1, B2]);
  assert.deepEqual(await ids(`${RANGE}&receiver_code=${M}&nhom=khac&tuoi=3%2B`), [C2, B2]);
  assert.deepEqual(await ids(`${RANGE}&unit=${M}`), [C2, B1, B2, C1, C3], 'unit = bí danh receiver_code');
  // phân trang
  const p1 = (await api(`/api/arrivals/bd10-khong-xnd?${RANGE}&unit=${M}&page_size=2`, 'ttvh')).body;
  const p3 = (await api(`/api/arrivals/bd10-khong-xnd?${RANGE}&unit=${M}&page_size=2&page=3`, 'ttvh')).body;
  assert.deepEqual(p1.pagination, { total: 5, page: 1, page_size: 2, total_pages: 3 });
  assert.deepEqual(p1.items.map((i) => i.so_hieu_bd10), [C2, B1]);
  assert.deepEqual(p3.items.map((i) => i.so_hieu_bd10), [C3]);
  // tham số sai
  for (const bad of [`${RANGE}&nhom=xyz`, `${RANGE}&tuoi=9`, `${RANGE}&page_size=0`, `${RANGE}&unit=${M}&receiver_code=${M2}`, `${RANGE}&ward_key=x`, 'to=2026-10-08']) {
    assert.equal((await api(`/api/arrivals/bd10-khong-xnd?${bad}`, 'ttvh')).status, 400, bad);
  }
});

test('GET /bd10-khong-xnd: phạm vi GDVH theo user_bcvh, STAFF 403, không token 401; khoảng rỗng', async () => {
  const ids = async (qs, who) => (await api(`/api/arrivals/bd10-khong-xnd?${qs}`, who)).body.items.map((i) => i.so_hieu_bd10);
  assert.deepEqual(await ids(RANGE, 'gdvhM2'), [K]);
  assert.deepEqual(await ids(`${RANGE}&unit=${M}`, 'gdvhM2'), [], 'BCVH không được giao -> rỗng');
  assert.equal((await ids(RANGE, 'gdvhM')).length, 5);
  assert.deepEqual(await ids(RANGE, 'gdvhNone'), []);
  assert.equal((await ids(RANGE, 'admin')).length, 6, 'không lọc = cả hai BCVH');
  assert.equal((await api(`/api/arrivals/bd10-khong-xnd?${RANGE}`, 'staff')).status, 403);
  assert.equal((await api(`/api/arrivals/bd10-khong-xnd?${RANGE}`)).status, 401);
  const e = (await api(`/api/arrivals/bd10-khong-xnd?from=2026-01-01&to=2026-01-02&unit=${M}`, 'ttvh')).body;
  assert.deepEqual([e.items.length, e.pagination.total, e.pagination.total_pages], [0, 0, 0]);
});

test('GET /bd10-khong-xnd/export: xlsx cùng bộ lọc, mọi ô là chuỗi, quyền như /export, nhật ký không lộ số hiệu', async () => {
  const get = (qs, who) => fetch(`${ctx.baseUrl}/api/arrivals/bd10-khong-xnd/export?${qs}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  const Qx = `${RANGE}&unit=${M}`;
  const res = await get(Qx, 'ttvh');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="BD10KhongXND_${M}_2026-10-02_2026-10-08.xlsx"`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const ws = wb.worksheets[0];
  assert.deepEqual(ws.getRow(1).values.slice(1), ['So_hieu_BD10', 'Buu_cuc_lap', 'Nhom', 'Thoi_gian_gan_ngay', 'Tuoi_ngay', 'So_buu_gui', 'So_BD8', 'Co_XN_tui', 'Co_XN_BG', 'Trang_thai']);
  const rows = [];
  ws.eachRow((x, n) => { if (n > 1) rows.push(x.values.slice(1)); });
  assert.deepEqual(rows.map((x) => x[0]), [C2, B1, B2, C1, C3]);
  assert.equal(rows[1][3], '05/10/2026 08:00:00');
  assert.deepEqual([rows[1][4], rows[1][5], rows[1][6], rows[1][7], rows[1][8], rows[1][9]], ['4', '2', '2', 'Co', 'Co', 'S2']);
  assert.deepEqual([rows[3][7], rows[3][8]], ['Khong', 'Co']);
  ws.eachRow((x) => x.eachCell((c) => assert.equal(typeof c.value, 'string')));
  // bộ lọc nhom / tuoi áp cho xuất file
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(Buffer.from(await (await get(`${Qx}&nhom=530100`, 'admin')).arrayBuffer()));
  assert.equal(wb2.worksheets[0].actualRowCount, 3, 'tiêu đề + B1 + C1');
  // quyền
  assert.equal((await get(Qx, 'gdvhM')).status, 200);
  assert.equal((await get(Qx, 'gdvhM2')).status, 403);
  assert.equal((await get(Qx, 'gdvhNone')).status, 403);
  assert.equal((await get(Qx, 'staff')).status, 403);
  assert.equal((await get(Qx)).status, 401);
  assert.equal((await get(RANGE, 'admin')).status, 400, 'thiếu receiver_code / unit');
  assert.equal((await get(`${Qx}&nhom=xyz`, 'admin')).status, 400);
  assert.equal((await get('from=2026-01-01&to=2026-06-30&unit=' + M, 'admin')).status, 400, 'quá 92 ngày');
  await new Promise((r) => setTimeout(r, 150));
  const log = fs.readFileSync(process.env.SECURITY_LOG, 'utf8');
  assert.ok(/"kind":"bd10_khong_xnd"/.test(log));
  assert.ok(!log.includes(C2) && !log.includes(B1));
});
