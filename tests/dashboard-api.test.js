// ==========================================
// Test: API Dashboard điều hành (/api/arrivals/dashboard/*, server/lib/dashboardQuery.js) — SANLUONG-3e.
// Server thật trên DB tạm; dữ liệu là CSV GIẢ tự sinh trong thư mục tạm (không có số hiệu thật).
// Mã 6 BCVH là cấu hình của hệ thống (không phải dữ liệu thật). Giá trị mong đợi vừa viết tay vừa tính lại độc lập
// từ chính các bản ghi giả (hàm ref* ở dưới) để đối chiếu với kết quả SQL.
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
const dash = require('../server/lib/dashboardQuery');

const PORT = 5913;
const USERS = {
  admin: { hrm: 'DB_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'DB_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'DB_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'DB_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;
let emptyOverview;

// 6 BCVH (mã cấu hình): A Thuận Hóa, B Hương Trà, C Hương Thủy, D Thuận An, E Phú Lộc, F A Lưới (F không có dữ liệu nào).
const A = '533140'; const B = '535470'; const C = '536250'; const D = '537015'; const E = '537220'; const F = '535790';
const ALL6 = [A, B, C, D, E, F];

// ------------------------------------------
// Sinh dữ liệu giả
// ------------------------------------------
let seq = 0;
const records = []; // bản ghi giả (để tính lại độc lập)
const pad = (n) => String(n).padStart(2, '0');
const parseTs = (s) => Date.parse(`${s.replace(' ', 'T')}Z`);
const fmtTs = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const addMin = (s, m) => fmtTs(parseTs(s) + m * 60000);
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`; // phút trong ngày -> HH:MM:00
const usTime = (s) => {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi, se] = t.split(':').map(Number);
  return `${mo}/${da}/${y} ${((h + 11) % 12) + 1}:${pad(mi)}:${pad(se)} ${h >= 12 ? 'PM' : 'AM'}`;
};

/**
 * 1 dòng giả. hms = giờ XN túi (hoặc giờ XN bưu gửi nếu noBag). Mặc định: có XN túi + XN bưu gửi sau 5 phút.
 * o: noBag, noItem, gapMin, bd10 (true -> có XND BD10 cùng giờ), weight, route, service, ward, province, tracking, bd8, fileTime.
 */
function mk(day, recv, hms, o = {}) {
  seq++;
  const at = `${day} ${hms}`;
  const bag = o.noBag ? null : at;
  const item = o.noItem ? null : (o.noBag ? at : addMin(at, o.gapMin ?? 5));
  const bd10 = o.bd10 ? at : null;
  const rec = {
    day, recv, fileTime: o.fileTime || '163012', tracking: o.tracking || `ZZ3${String(seq).padStart(8, '0')}VN`, bag, item, bd10,
    bd8: o.bd8 || `T-${seq}`, weight: o.weight ?? 100, route: o.route ?? 'Đường thư giả', service: o.service || 'R',
    ward: o.ward ?? 'Phường An', province: o.province ?? 'Tỉnh Thử'
  };
  rec.arrival = [rec.bag, rec.item, rec.bd10].filter(Boolean).sort()[0];
  records.push(rec);
  return rec;
}

const SERVICE_NAME = { R: 'Bảo đảm giả', E: 'EMS giả', C: 'Bưu kiện giả' };
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
function writeFiles() {
  const byFile = new Map();
  for (const r of records) {
    const key = `${r.recv}|${r.day}|${r.fileTime}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(r);
  }
  const out = [];
  for (const [key, rows] of byFile) {
    const [recv, day, time] = key.split('|');
    const name = `HangDen_${recv}_${day.replace(/-/g, '')}_${time}.csv`;
    const lines = rows.map((r) => ({
      Ma_BC_dong: '990001', BC_nhan_BG: r.recv, Ten_duong_thu: r.route, SHBG: r.tracking, So_hieu_BD10: 'BD10-A',
      'Thời gian XN túi': usTime(r.bag), 'Thời gian XN BG': usTime(r.item), Ngay_gio_XND_BD10: usTime(r.bd10),
      Ngay_gio_XND_BD10_tai_TTKT: '', So_hieu_BD8: r.bd8, Khoi_luong_thuc_te: String(r.weight), Dich_vu_code: r.service,
      Ten_dich_vu: SERVICE_NAME[r.service] || '', Ghi_chu: 'Bộ;Giả (Túi)', Ten_Xa_Phuong: r.ward, Ten_Tinh_Thanh: r.province
    }));
    const file = path.join(workDir, name);
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(q).join(','), ...lines.map((l) => EXPECTED_HEADER.map((h) => q(l[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out;
}

// ---- Họ 1: ngày F1 = 2026-10-08 (thứ Năm); 4 ngày cùng thứ trước đó: 10-01, 09-24, 09-17, 09-10 ----
const F1 = '2026-10-08';
const WEEKS_F1 = ['2026-10-01', '2026-09-24', '2026-09-17', '2026-09-10'];
const ROUTE_PATTERN = [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 0];
const routeOf = (i) => { const k = ROUTE_PATTERN[i % ROUTE_PATTERN.length]; return k ? `Đường thư giả ${k}` : ''; };
// n bưu gửi trước as_of (bước stepMin phút từ 06:00) + extra bưu gửi sau as_of (chiều 14:00).
function dayItems(day, recv, n, { step = 10, extra = 0, fileTime = '163012', offset = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(mk(day, recv, clock(360 + i * step), { fileTime, route: routeOf(i + offset), bd10: i % 5 === 0 }));
  for (let i = 0; i < extra; i++) out.push(mk(day, recv, clock(840 + i * 5), { fileTime, route: routeOf(i + offset) }));
  return out;
}

function buildFamily1() {
  // A: 4 tuần × (20 trước 10:00 + 7 sau), hôm qua 10 (gồm Yrep) + 3 sau, hôm nay 23 trước/đúng 10:00 + 4 sau.
  for (const w of WEEKS_F1) { dayItems(w, A, 20, { extra: 7 }); mk(w, A, '10:30:00'); } // 10:30 = sau as_of, trong giờ 10
  const yrep = mk('2026-10-07', A, '06:30:00', { tracking: 'ZZ3YREP0000VN' });
  dayItems('2026-10-07', A, 9, { step: 7, extra: 3, offset: 3 });
  dayItems(F1, A, 20, { fileTime: '100030' });
  mk(F1, A, '10:00:00', { fileTime: '100030' }); // đúng mốc as_of (gồm cả 2 đầu)
  mk(F1, A, '08:00:00', { fileTime: '100030', tracking: 'ZZ3DUP00000VN', bd8: 'T-DUP-1' }); // đến lại trong cùng ngày
  mk(F1, A, '09:00:00', { fileTime: '100030', tracking: 'ZZ3DUP00000VN', bd8: 'T-DUP-2' });
  mk(F1, A, '08:30:00', { fileTime: '100030', tracking: yrep.tracking, bd8: 'T-YREP-2' }); // đã đến hôm qua, đến lại hôm nay
  mk(F1, A, '10:00:01', { fileTime: '100030' }); // sau as_of 1 giây
  for (let i = 0; i < 3; i++) mk(F1, A, clock(660 + i * 5), { fileTime: '100030' });
  // B: chỉ có file của 10-01 và 09-17 (so_tuan = 2); hôm nay 25 (= +25% so với 20), không có file hôm qua.
  for (const w of [WEEKS_F1[0], WEEKS_F1[2]]) dayItems(w, B, 20, { extra: 5 });
  dayItems(F1, B, 25, { step: 6, extra: 5, fileTime: '093012' });
  // C: chỉ có hôm nay (so_tuan = 0).
  dayItems(F1, C, 10, { fileTime: '093012' });
  // D: 1 tuần (10-01) 20 bưu gửi; hôm nay 15 (= −25%).
  dayItems(WEEKS_F1[0], D, 20);
  dayItems(F1, D, 15, { fileTime: '090012' });
}

// ---- Họ 2: ngày F2 = 2027-01-14, không có ngày cùng thứ nào trước đó (so_tuan = 0): hàng nặng, đến muộn, xác nhận chậm ----
const F2 = '2027-01-14';
function buildFamily2() {
  const ft = '160030'; // as_of mặc định 16:00
  // D: 100 bưu gửi, 7 nặng (3000 g); 60 bưu gửi đủ 2 mốc cách nhau 74 phút, 40 chỉ có XN túi. Đường thư D1 ×70 / D2 ×30.
  for (let i = 0; i < 100; i++) {
    mk(F2, D, clock(480 + i * 3), {
      fileTime: ft, weight: i < 7 ? 3000 : 100, gapMin: 74, noItem: i % 5 >= 3, route: i < 70 ? 'Đường thư giả D1' : 'Đường thư giả D2'
    });
  }
  // E: 100 bưu gửi, 35 đến 15:00–15:34 (35%), 6 nặng (6%); 50 bưu gửi đủ 2 mốc cách 75 phút, 50 chỉ có XN bưu gửi. Đường thư: 60 chưa có tên + E1 ×40.
  for (let i = 0; i < 100; i++) {
    const min = i < 65 ? 480 + i * 5 : 900 + (i - 65);
    mk(F2, E, clock(min), {
      fileTime: ft, weight: i < 6 ? 3000 : 100, gapMin: 75, noBag: i % 2 === 1, service: 'E', route: i < 60 ? '' : 'Đường thư giả E1'
    });
  }
  // C: 100 bưu gửi, 34 đến từ 15:00 (34%); không nặng; đường thư C1 ×40, C2 ×30, C3 ×20, C4 ×10.
  for (let i = 0; i < 100; i++) {
    const min = i < 66 ? 480 + i * 5 : 900 + (i - 66);
    mk(F2, C, clock(min), { fileTime: ft, gapMin: 10, service: 'C', route: `Đường thư giả C${i < 40 ? 1 : i < 70 ? 2 : i < 90 ? 3 : 4}` });
  }
}

// ---- Họ 3: ngày F3 = 2026-12-03, phường/xã tăng (BCVH C; 2 tuần có dữ liệu: 11-26, 11-19) ----
const F3 = '2026-12-03';
const W3 = ['2026-11-26', '2026-11-19'];
const WARDS = [ // [tên, hôm nay, tuần 1, tuần 2]
  ['Phường Aa', 40, 20, 20], ['Phường Bb', 36, 24, 24], ['Phường Cc', 29, 10, 10], ['Phường Dd', 60, 19, 19], ['Phường Ee', 30, 20, 20],
  ['Phường Ff', 50, 40, 40], ['Phường Gg', 45, 40, 40], ['Phường Hh', 31, 31, 31], ['Phường Jj', 33, 30, 30], ['Phường Kk', 60, 40, 0]
];
function buildFamily3() {
  const emit = (day, ward, n, province = 'Tỉnh Thử', ft = '163012') => {
    for (let i = 0; i < n; i++) mk(day, C, clock(360 + (i * 7) % 330), { fileTime: ft, ward, province });
  };
  for (const [ward, today, w1, w2] of WARDS) {
    emit(F3, ward, today, 'Tỉnh Thử', '120030');
    emit(W3[0], ward, w1);
    emit(W3[1], ward, w2);
  }
  emit(F3, 'Phường Xx', 100, 'TP. Hà Nội', '120030'); // tỉnh khác: không xét
  emit(W3[0], 'Phường Xx', 20, 'TP. Hà Nội');
  emit(W3[1], 'Phường Xx', 20, 'TP. Hà Nội');
  // 30 bưu gửi sau as_of (14:00) của phường Aa ở mỗi tuần: không được tính vào "bình thường".
  for (const w of W3) for (let i = 0; i < 30; i++) mk(w, C, clock(840 + i), { fileTime: '163012', ward: 'Phường Aa' });
}

// ---- Họ 4: ngày F4 = 2026-11-11 (thứ Tư), 2 ngày cùng thứ có file (11-04, 10-28): điểm lệch sản lượng + hàng nặng (điểm %) + sản lượng tối thiểu ----
const F4 = '2026-11-11';
const W4 = ['2026-11-04', '2026-10-28'];
function famItems(day, recv, n, heavy, fileTime) {
  for (let i = 0; i < n; i++) mk(day, recv, clock(360 + i * 3), { fileTime, weight: i < heavy ? 3000 : 100, route: 'Đường thư giả F4' });
}
function buildFamily4() {
  const week = (recv, n, heavy) => { for (const w of W4) famItems(w, recv, n, heavy, '163012'); };
  week(A, 50, 0); famItems(F4, A, 58, 0, '120030'); // tb = 50 (đúng mức tối thiểu) → hôm nay 58 = +16%
  week(B, 100, 10); famItems(F4, B, 100, 17, '120030'); // hàng nặng 17% − 10% = đúng 7 điểm %
  week(C, 100, 10); famItems(F4, C, 100, 16, '120030'); // 16% − 10% = 6 điểm %
  week(D, 49, 10); famItems(F4, D, 75, 40, '120030'); // tb = 49 < 50: lệch +53% và hàng nặng +33 điểm % đều KHÔNG phát sinh điểm
  week(E, 80, 8); famItems(F4, E, 100, 18, '120030'); // +25% đúng → xu_ly_ngay; hàng nặng 18% − 10% = 8 điểm %
}

// ------------------------------------------
// Tính lại độc lập (không qua SQL) — quy tắc 3b áp riêng cho từng khoảng
// ------------------------------------------
const in6 = (r) => ALL6.includes(r.recv);
/** Mỗi SHBG 1 lần tại lần đến sớm nhất trong [from, to] (chuỗi "YYYY-MM-DD HH:MM:SS"); trả bản ghi đại diện. */
function refCounted(from, to, filter = in6) {
  const best = new Map();
  for (const r of records) {
    if (!filter(r) || r.arrival < from || r.arrival > to) continue;
    const cur = best.get(r.tracking);
    if (!cur || r.arrival < cur.arrival) best.set(r.tracking, r);
  }
  return [...best.values()];
}
const refDay = (day, end = '23:59:59', filter) => refCounted(`${day} 00:00:00`, `${day} ${end}`, filter);

// ------------------------------------------
// HTTP
// ------------------------------------------
async function api(p, who) {
  const headers = {};
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const mgr = async (p) => { const r = await api(p, 'ttvh'); assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; };
const BASE = '/api/arrivals/dashboard';
const ov = (qs = '') => mgr(`${BASE}/overview?${qs}`);
const rowOf = (body, ma) => body.bcvh.find((b) => b.ma === ma);

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-dashboard-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dashboard-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '533140', 'BCVH Thuận Hóa (tên trong danh mục)', 'PH1', 'c1', 'Phường An');
  `);
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    const r = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hrm_code: u.hrm, password: u.pass })
    });
    tokens[k] = (await r.json()).token;
  }
  emptyOverview = dash.overview(ctx.db, {}); // trước khi nạp bất kỳ file nào
  buildFamily1(); buildFamily2(); buildFamily3(); buildFamily4();
  for (const file of writeFiles()) {
    const r = await importArrivalFile(ctx.db, file);
    assert.equal(r.status, 'OK', `${path.basename(file)}: ${JSON.stringify(r)}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

// ------------------------------------------
// Quyền + tham số
// ------------------------------------------
test('quyền: không token 401, STAFF 403, ADMIN/TTVH/GDVH 200 (4 endpoint)', async () => {
  for (const e of ['overview', 'trend', 'wards-surge', 'center']) {
    const p = `${BASE}/${e}?date=${F1}`;
    assert.equal((await api(p)).status, 401, e);
    assert.equal((await api(p, 'staff')).status, 403, e);
    assert.equal((await api(p, 'ttvh')).status, 200, e);
    assert.equal((await api(p, 'gdvh')).status, 200, e);
    assert.equal((await api(p, 'admin')).status, 200, e);
  }
});

test('tham số sai -> 400; khoá lạ -> 400; heavy_g chỉ ở /overview và /center', async () => {
  const bad = [
    'overview?date=2026-13-01', 'overview?date=2026-10-08x', 'overview?date=08/10/2026', 'overview?date=2026-10-08&date=2026-10-07',
    'overview?as_of=25:00', 'overview?as_of=9:30', 'overview?as_of=10:60', 'overview?heavy_g=100', 'overview?heavy_g=abc', 'overview?foo=1',
    'trend?as_of=xx', 'trend?heavy_g=2500', 'trend?from=2026-10-01', 'wards-surge?date=2026-02-30', 'wards-surge?heavy_g=2500',
    'center?from=2026-10-09&to=2026-10-01', 'center?from=bad&to=2026-10-01', 'center?to=2026-99-01', 'center?as_of=10:00',
    'center?from=2024-01-01&to=2026-10-01', 'center?heavy_g=40000'
  ];
  for (const e of bad) {
    const r = await api(`${BASE}/${e}`, 'ttvh');
    assert.equal(r.status, 400, e);
    assert.ok(r.body.error, e);
  }
  for (const e of ['overview?heavy_g=3000', 'center?heavy_g=3000', 'center?date=2026-10-08', 'center?from=2026-10-02&to=2026-10-08 10:00']) {
    assert.equal((await api(`${BASE}/${e}`, 'ttvh')).status, 200, e);
  }
});

// ------------------------------------------
// 6 BCVH, mặc định, chưa có dữ liệu
// ------------------------------------------
test('luôn đủ 6 BCVH theo cấu hình; tên lấy từ post_offices nếu khớp mã; BCVH chưa có dữ liệu = số 0 và co_du_lieu=false', async () => {
  assert.deepEqual(dash.DASHBOARD_BCVH.map((b) => b.ma), ALL6);
  const o = await ov(`date=${F1}`);
  assert.deepEqual(o.bcvh.map((b) => b.ma), ALL6, 'thứ tự theo cấu hình');
  assert.equal(rowOf(o, A).ten, 'BCVH Thuận Hóa (tên trong danh mục)');
  assert.equal(rowOf(o, B).ten, 'BCVH Hương Trà', 'không khớp post_offices -> tên cấu hình');
  const f = rowOf(o, F);
  assert.deepEqual([f.co_du_lieu, f.san_luong, f.hom_qua, f.tb_4_tuan, f.so_tuan, f.lech_hom_qua_pct, f.lech_tb_pct, f.xac_nhan_tre_trung_vi_phut],
    [false, 0, 0, null, 0, null, null, null]);
  assert.deepEqual(f.hang_nang, { so_buu_gui: 0, ty_le: 0, ty_le_binh_thuong: null });
  assert.equal(rowOf(o, E).co_du_lieu, true, 'E có file (ở ngày khác)');
  assert.equal(rowOf(o, E).san_luong, 0, 'E không có hàng ngày F1');
  assert.ok(!o.issues.some((i) => i.ma_bcvh === F));
});

test('DB trống: 200 với date null, 6 BCVH số 0 và co_du_lieu=false, không có điểm cần điều hành', () => {
  assert.equal(emptyOverview.date, null);
  assert.equal(emptyOverview.bcvh.length, 6);
  assert.ok(emptyOverview.bcvh.every((b) => b.co_du_lieu === false && b.san_luong === 0));
  assert.deepEqual(emptyOverview.issues, []);
  assert.equal(emptyOverview.tong.so_bcvh_co_du_lieu, 0);
});

test('mặc định: date = ngày file mới nhất; as_of = giờ file nạp mới nhất của date (làm tròn xuống phút); date không có file -> 23:59', async () => {
  const d = await ov();
  assert.deepEqual([d.date, d.as_of, d.as_of_nguon], [F2, '16:00', 'file_nap_moi_nhat']);
  assert.match(d.ngay_cap_nhat, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const f1 = await ov(`date=${F1}`);
  assert.deepEqual([f1.as_of, f1.as_of_nguon], ['10:00', 'file_nap_moi_nhat'], 'file lúc 10:00:30 và 09:30:12 -> lấy lớn nhất, bỏ giây');
  const p = await ov(`date=${F1}&as_of=09:00`);
  assert.deepEqual([p.as_of, p.as_of_nguon], ['09:00', 'tham_so']);
  const none = await ov('date=2025-01-01');
  assert.deepEqual([none.as_of, none.as_of_nguon, none.tong.san_luong], ['23:59', 'cuoi_ngay', 0]);
  assert.deepEqual(none.nguong, (await ov(`date=${F1}`)).nguong);
});

// ------------------------------------------
// Cùng khoảng giờ, đếm lại, so_tuan
// ------------------------------------------
test('cùng khoảng 00:00–as_of cho hôm nay / hôm qua / 4 ngày cùng thứ; đến lại chỉ đếm 1 lần trong khoảng của từng ngày', async () => {
  const o = await ov(`date=${F1}`);
  const a = rowOf(o, A);
  // Hôm nay: 20 + 1 (đúng 10:00:00) + Ddup (2 dòng = 1) + Yrep (đã đến hôm qua, đến lại hôm nay) = 23; 10:00:01 và 4 bưu gửi chiều không tính.
  assert.equal(a.san_luong, 23);
  assert.equal(a.hom_qua, 10, 'hôm qua 10 (gồm Yrep); 3 bưu gửi chiều không tính');
  assert.equal(a.tb_4_tuan, 20, 'mỗi tuần 20 trước 10:00 (7 bưu gửi chiều không tính)');
  assert.deepEqual([a.so_tuan, a.it_du_lieu], [4, false]);
  assert.equal(a.lech_hom_qua_pct, 130);
  assert.equal(a.lech_tb_pct, 15);
  assert.equal(refDay(F1, '10:00:00', (r) => r.recv === A).length, 23, 'đối chiếu tính lại độc lập');
  assert.equal(refDay('2026-10-07', '10:00:00', (r) => r.recv === A).length, 10);
  // Yrep có mặt ở cả 2 ngày: đếm ở mỗi ngày 1 lần.
  const t = await mgr(`${BASE}/trend?date=${F1}`);
  const byDay = Object.fromEntries(t.ngay.map((x) => [x.ngay, x.san_luong]));
  assert.equal(byDay['2026-10-07'], refDay('2026-10-07').length, 'hôm qua cả ngày (13)');
  assert.equal(byDay['2026-10-07'], 13);
  assert.equal(byDay[F1], refDay(F1, '10:00:00').length, 'ngày xét chỉ tới as_of');
  // as_of khác -> mọi khoảng đổi theo
  const early = rowOf(await ov(`date=${F1}&as_of=08:00`), A);
  assert.equal(early.san_luong, refDay(F1, '08:00:00', (r) => r.recv === A).length);
  assert.equal(early.hom_qua, refDay('2026-10-07', '08:00:00', (r) => r.recv === A).length);
  assert.equal(early.tb_4_tuan, refDay(WEEKS_F1[0], '08:00:00', (r) => r.recv === A).length);
  const full = rowOf(await ov(`date=${F1}&as_of=23:59`), A);
  assert.equal(full.san_luong, 27, 'cả ngày: 23 + 4 bưu gửi sau 10:00 (10:00:01 và 3 bưu gửi 11:00)');
  assert.equal(full.tb_4_tuan, 28, 'mỗi tuần cả ngày: 20 + 1 (10:30) + 7 chiều');
});

test('so_tuan / it_du_lieu khi dưới 4 tuần: chỉ tính các ngày cùng thứ có file; so_tuan = 0 -> không so sánh', async () => {
  const o = await ov(`date=${F1}`);
  const b = rowOf(o, B);
  assert.deepEqual([b.so_tuan, b.it_du_lieu, b.tb_4_tuan, b.san_luong, b.lech_tb_pct], [2, true, 20, 25, 25],
    'chỉ 2 tuần có file: trung bình 20 (không chia cho 4 tuần)');
  assert.deepEqual([b.hom_qua, b.lech_hom_qua_pct], [0, null], 'không có file hôm qua -> không so sánh');
  const c = rowOf(o, C);
  assert.deepEqual([c.so_tuan, c.it_du_lieu, c.tb_4_tuan, c.lech_tb_pct, c.san_luong], [0, true, null, null, 10]);
  const d = rowOf(o, D);
  assert.deepEqual([d.so_tuan, d.it_du_lieu, d.tb_4_tuan, d.lech_tb_pct], [1, true, 20, -25]);
  assert.equal(o.tong.so_tuan, 0, 'tổng: so_tuan nhỏ nhất của BCVH có dữ liệu (C chưa có tuần nào)');
  assert.equal(rowOf(await ov(`date=${F2}`), A).so_tuan, 0);
});

test('dòng tổng 6 BCVH = cộng các BCVH; so sánh chỉ trên BCVH có mốc so sánh', async () => {
  const o = await ov(`date=${F1}`);
  const sum = (f) => o.bcvh.reduce((a, b) => a + f(b), 0);
  assert.equal(o.tong.san_luong, sum((b) => b.san_luong));
  assert.equal(o.tong.san_luong, 23 + 25 + 10 + 15);
  assert.equal(o.tong.hom_qua, sum((b) => b.hom_qua));
  assert.equal(o.tong.hang_nang.so_buu_gui, sum((b) => b.hang_nang.so_buu_gui));
  assert.equal(o.tong.so_bcvh_co_du_lieu, 6 - 1);
  // BCVH có so_tuan>0: A (23 vs 20), B (25 vs 20), D (15 vs 20) -> (63 − 60) / 60 = 5%
  assert.equal(o.tong.tb_4_tuan, 60);
  assert.equal(o.tong.lech_tb_pct, 5);
  assert.equal(refDay(F1, '10:00:00').length, o.tong.san_luong, 'tổng = số SHBG khác nhau của 6 BCVH');
});

// ------------------------------------------
// Điểm cần điều hành (end-to-end + ranh giới)
// ------------------------------------------
test('issues (họ F4): lệch ≥ 25% = xu_ly_ngay, hàng nặng tính bằng điểm % so với bình thường, sản lượng bình thường tối thiểu 50; sắp theo mức rồi độ lệch; không câu chữ', async () => {
  const o = await ov(`date=${F4}`);
  assert.deepEqual(o.issues.map((i) => [i.ma_bcvh, i.loai, i.muc]), [
    [E, 'san_luong_cao', 'xu_ly_ngay'], [E, 'hang_nang', 'trong_ngay'], [A, 'san_luong_cao', 'trong_ngay'], [B, 'hang_nang', 'trong_ngay']
  ]);
  const [ie, ieh, ia, ib] = o.issues;
  assert.deepEqual([ie.gia_tri, ie.so_sanh, ie.lech_pct, ie.don_vi, ie.so_tuan, ie.it_du_lieu], [100, 80, 25, 'buu_gui', 2, true]);
  assert.deepEqual([ieh.gia_tri, ieh.so_sanh, ieh.don_vi, ieh.ty_le_hom_nay, ieh.ty_le_binh_thuong, ieh.so_luong], [8, 7, 'diem_pct', 18, 10, 18]);
  assert.deepEqual([ia.gia_tri, ia.so_sanh, ia.lech_pct], [58, 50, 16], 'A: tb đúng 50 vẫn được xét');
  assert.deepEqual([ib.gia_tri, ib.so_sanh, ib.ty_le_hom_nay, ib.ty_le_binh_thuong], [7, 7, 17, 10], 'B: 17% − 10% = đúng 7 điểm % → có điểm');
  assert.ok(!o.issues.some((i) => i.ma_bcvh === C), 'C: 16% − 10% = 6 điểm % → không có điểm');
  assert.ok(!o.issues.some((i) => i.ma_bcvh === D), 'D: tb 49 < 50 → không có điểm lệch sản lượng lẫn hàng nặng dù lệch rất lớn');
  const d = rowOf(o, D);
  assert.deepEqual([d.tb_4_tuan, d.lech_tb_pct, d.hang_nang.ty_le, d.hang_nang.ty_le_binh_thuong], [49, 53.06, 53.33, 20.41], 'số liệu vẫn trả đủ');
  assert.deepEqual(rowOf(o, B).hang_nang, { so_buu_gui: 17, ty_le: 17, ty_le_binh_thuong: 10 });
  assert.ok(o.issues.every((i) => i.do_lech >= 1));
  for (const i of o.issues) for (const v of Object.values(i)) assert.ok(typeof v !== 'string' || /^[a-z0-9_]+$/.test(v), `chuỗi "${v}" không phải mã`);
  assert.deepEqual(o.nguong, {
    lech_san_luong: { trong_ngay_pct: 15, xu_ly_ngay_pct: 25 }, hang_nang: { heavy_g: 2500, trong_ngay_diem_pct: 7 },
    den_muon: { tu_gio: '15:00', trong_ngay_pct: 35 }, xac_nhan_cham: { trong_ngay_phut: 75, tam: true },
    san_luong_toi_thieu: { tb_4_tuan: 50, tam: true }
  });
});

test('họ F1: bình thường (tb) của mọi BCVH đều < 50 SHBG nên không có điểm lệch dù lệch +15% / +25% / −25%', async () => {
  const o = await ov(`date=${F1}`);
  assert.deepEqual([rowOf(o, A).lech_tb_pct, rowOf(o, B).lech_tb_pct, rowOf(o, D).lech_tb_pct], [15, 25, -25]);
  assert.deepEqual(o.issues, []);
});

test('ranh giới thuần: lệch 14,9% / 15% / 24,9% / 25%; hàng nặng 6,9% / 7%; đến muộn 34,9% / 35%; trễ 74 / 75 phút', () => {
  const dev = (today, sum, n = 1) => dash.classifyDeviation(today, sum, n);
  assert.equal(dev(1149, 1000), null);
  assert.deepEqual(dev(1150, 1000), { loai: 'san_luong_cao', muc: 'trong_ngay' });
  assert.deepEqual(dev(1249, 1000), { loai: 'san_luong_cao', muc: 'trong_ngay' });
  assert.deepEqual(dev(1250, 1000), { loai: 'san_luong_cao', muc: 'xu_ly_ngay' });
  assert.equal(dev(851, 1000), null);
  assert.deepEqual(dev(850, 1000), { loai: 'san_luong_thap', muc: 'trong_ngay' });
  assert.deepEqual(dev(751, 1000), { loai: 'san_luong_thap', muc: 'trong_ngay' });
  assert.deepEqual(dev(750, 1000), { loai: 'san_luong_thap', muc: 'xu_ly_ngay' });
  assert.deepEqual(dev(1150, 4000, 4), { loai: 'san_luong_cao', muc: 'trong_ngay' }, 'n = 4 tuần, tb = 1000');
  assert.equal(dev(1149, 4000, 4), null);
  assert.deepEqual(dev(23, 80, 4), { loai: 'san_luong_cao', muc: 'trong_ngay' }, 'tb 20, hôm nay 23 = 15% đúng');
  assert.equal(dev(22, 80, 4), null);
  assert.equal(dev(5, 0, 4), null, 'bình thường = 0 -> không so sánh');
  assert.equal(dev(5, 10, 0), null);
  // hàng nặng: (hôm nay − bình thường) ≥ 7 điểm %
  assert.equal(dash.reachesPointGap(169, 1000, 400, 4000, 7), false, '16,9% − 10% = 6,9 điểm');
  assert.equal(dash.reachesPointGap(170, 1000, 400, 4000, 7), true, '17% − 10% = 7 điểm');
  assert.equal(dash.reachesPointGap(60, 1000, 100, 1000, 7), false, 'hôm nay thấp hơn bình thường');
  assert.equal(dash.reachesPointGap(5, 0, 1, 10, 7), false);
  assert.equal(dash.reachesPointGap(5, 10, 1, 0, 7), false);
  assert.equal(dash.reachesShare(349, 1000, 35), false);
  assert.equal(dash.reachesShare(350, 1000, 35), true);
  assert.equal(dash.reachesShare(0, 0, 7), false);
  // 4 tuần, mỗi tuần 1.000 SHBG và 100 hàng nặng (10%); hôm nay 1.000 SHBG (không lệch sản lượng)
  const base = { ma: 'X', san_luong: 1000, sum_tuan: 4000, nang_tuan: 400, so_tuan: 4, lech_tb_pct: 0, tb_4_tuan: 1000, it_du_lieu: false,
    hang_nang_so: 0, den_sau_15h_so: null, trung_vi_giay: null, so_mau_tre: 0 };
  const loai = (over) => dash.evaluateBcvh({ ...base, ...over }).map((i) => i.loai);
  assert.deepEqual(loai({ hang_nang_so: 169 }), [], '6,9 điểm %');
  assert.deepEqual(loai({ hang_nang_so: 170 }), ['hang_nang'], '7 điểm %');
  assert.deepEqual(loai({ hang_nang_so: 400, nang_tuan: 2000 }), [], 'bình thường cũng cao (50%) → không có điểm dù hôm nay 40%');
  assert.deepEqual(loai({ hang_nang_so: 900, so_tuan: 0, sum_tuan: 0, nang_tuan: 0 }), [], 'so_tuan = 0 → không có điểm hàng nặng');
  // sản lượng bình thường tối thiểu: tb 49 / 50 (sum_tuan / so_tuan); hôm nay 200 SHBG, 100 nặng (50%)
  const small = (sum) => ({ san_luong: 200, sum_tuan: sum, nang_tuan: Math.round(sum * 0.1), hang_nang_so: 100, tb_4_tuan: sum / 4 });
  assert.deepEqual(loai(small(196)), [], 'tb 49 < 50: không điểm lệch, không điểm hàng nặng');
  assert.deepEqual(loai(small(199)), [], 'tb 49,75 < 50');
  assert.deepEqual(loai(small(200)), ['san_luong_cao', 'hang_nang'], 'tb 50: được xét');
  assert.deepEqual(loai({ den_sau_15h_so: 349 }), []);
  assert.deepEqual(loai({ den_sau_15h_so: 350 }), ['den_muon']);
  assert.deepEqual(loai({ den_sau_15h_so: null }), [], 'as_of < 15:00: không đánh giá');
  assert.deepEqual(loai({ trung_vi_giay: 74 * 60 }), []);
  assert.deepEqual(loai({ trung_vi_giay: 74 * 60 + 59 }), []);
  assert.deepEqual(loai({ trung_vi_giay: 75 * 60 }), ['xac_nhan_cham']);
});

test('end-to-end F2 (so_tuan = 0): hàng nặng 7% KHÔNG phát sinh điểm; đến muộn 34% / 35% (C, E), trễ 74 / 75 phút (D, E); ngưỡng tính trên bưu gửi đủ 2 mốc', async () => {
  const o = await ov(); // F2, as_of 16:00
  const d = rowOf(o, D); const e = rowOf(o, E); const c = rowOf(o, C);
  assert.deepEqual([d.san_luong, d.hang_nang.so_buu_gui, d.hang_nang.ty_le], [100, 7, 7]);
  assert.deepEqual([e.san_luong, e.hang_nang.so_buu_gui, e.hang_nang.ty_le], [100, 6, 6]);
  assert.deepEqual([e.den_sau_15h.so_buu_gui, e.den_sau_15h.ty_le], [35, 35]);
  assert.deepEqual([c.den_sau_15h.so_buu_gui, c.den_sau_15h.ty_le], [34, 34]);
  assert.deepEqual([d.den_sau_15h.so_buu_gui, d.den_sau_15h.ty_le], [0, 0]);
  assert.deepEqual([d.xac_nhan_tre_trung_vi_phut, d.xac_nhan_tre_so_mau], [74, 60], 'D: 60 bưu gửi đủ 2 mốc, 40 chỉ có túi');
  assert.deepEqual([e.xac_nhan_tre_trung_vi_phut, e.xac_nhan_tre_so_mau], [75, 50], 'E: 50 đủ 2 mốc; 50 chỉ có XN bưu gửi không kéo trung vị về 0');
  assert.deepEqual([c.xac_nhan_tre_trung_vi_phut, c.xac_nhan_tre_so_mau], [10, 100]);
  assert.equal(rowOf(o, A).xac_nhan_tre_trung_vi_phut, null, 'A không có hàng ngày F2');
  assert.deepEqual(o.issues.map((i) => [i.ma_bcvh, i.loai, i.muc]).sort(), [[E, 'den_muon', 'trong_ngay'], [E, 'xac_nhan_cham', 'trong_ngay']].sort(), 'D có 7% hàng nặng nhưng so_tuan = 0');
  assert.equal(d.hang_nang.ty_le_binh_thuong, null);
  const issue = (loai, ma) => o.issues.find((i) => i.loai === loai && i.ma_bcvh === ma);
  assert.deepEqual([issue('xac_nhan_cham', E).gia_tri, issue('xac_nhan_cham', E).so_sanh, issue('xac_nhan_cham', E).don_vi], [75, 75, 'phut']);
  assert.deepEqual([issue('den_muon', E).gia_tri, issue('den_muon', E).so_sanh], [35, 35]);
  assert.equal(o.tong.san_luong, 300);
  assert.equal(o.tong.xac_nhan_tre_so_mau, 60 + 50 + 100);
  assert.equal(o.tong.den_sau_15h.so_buu_gui, 69);
});

test('as_of trước 15:00 -> den_sau_15h = null và không có den_muon; heavy_g đổi ngưỡng nặng và được trả trong nguong', async () => {
  const o = await ov(`date=${F2}&as_of=14:59`);
  for (const b of o.bcvh) assert.equal(b.den_sau_15h, null, b.ma);
  assert.equal(o.tong.den_sau_15h, null);
  assert.ok(!o.issues.some((i) => i.loai === 'den_muon'));
  assert.equal(rowOf(o, E).san_luong, 65, 'E: 65 bưu gửi trước 15:00');
  const at15 = await ov(`date=${F2}&as_of=15:00`);
  assert.deepEqual(rowOf(at15, E).den_sau_15h, { so_buu_gui: 1, ty_le: 1.52 }, 'as_of 15:00 đã đánh giá: bưu gửi đúng 15:00:00 (gồm 2 đầu)');
  const h = await ov(`date=${F2}&heavy_g=3000`);
  assert.equal(h.nguong.hang_nang.heavy_g, 3000);
  assert.equal(rowOf(h, D).hang_nang.so_buu_gui, 0, 'đúng 3.000 g chưa phải nặng');
  assert.ok(!h.issues.some((i) => i.loai === 'hang_nang'));
});

// ------------------------------------------
// /trend
// ------------------------------------------
test('/trend: 7 ngày liền trước + ngày xét (ngày không dữ liệu = 0); theo_gio 06–17 so với trung bình cùng giờ của các ngày cùng thứ', async () => {
  const t = await mgr(`${BASE}/trend?date=${F1}`);
  assert.deepEqual(t.ngay.map((x) => x.ngay), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', F1]);
  for (const x of t.ngay) {
    const exp = refDay(x.ngay, x.ngay === F1 ? '10:00:00' : '23:59:59').length;
    assert.equal(x.san_luong, exp, x.ngay);
  }
  assert.deepEqual(t.ngay.map((x) => x.co_du_lieu), [true, false, false, false, false, false, true, true]);
  assert.deepEqual(t.ngay.map((x) => x.la_ngay_xet), [false, false, false, false, false, false, false, true]);
  assert.equal(t.ngay[1].san_luong, 0);
  assert.deepEqual([t.so_tuan, t.it_du_lieu], [4, false]);
  assert.deepEqual(t.theo_gio.map((x) => x.gio), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  const hourOf = (rs) => { const m = new Map(); for (const r of rs) { const h = +r.arrival.slice(11, 13); m.set(h, (m.get(h) || 0) + 1); } return m; };
  const today = hourOf(refDay(F1, '10:00:00'));
  const weeks = WEEKS_F1.map((w) => hourOf(refDay(w, '23:59:59')));
  const weeksTo10 = WEEKS_F1.map((w) => hourOf(refDay(w, '10:00:00')));
  for (const x of t.theo_gio) {
    assert.equal(x.hom_nay, x.gio > 10 ? null : (today.get(x.gio) || 0), `hôm nay ${x.gio}h`);
    const src = x.gio === 10 ? weeksTo10 : weeks;
    const exp = Math.round((src.reduce((a, m) => a + (m.get(x.gio) || 0), 0) / 4) * 100) / 100;
    assert.equal(x.tb_4_tuan, exp, `tb ${x.gio}h`);
    assert.equal(x.chua_het_gio, x.gio === 10);
  }
  assert.equal(t.theo_gio.find((x) => x.gio === 10).hom_nay, 1, 'chỉ bưu gửi đúng 10:00:00');
  assert.ok(t.theo_gio.find((x) => x.gio === 14).tb_4_tuan > 0, 'giờ sau as_of vẫn có đường "bình thường"');
  const cutoff = (await mgr(`${BASE}/trend?date=${F1}&as_of=23:59`)).theo_gio;
  assert.ok(cutoff.every((x) => x.hom_nay !== null) && cutoff.every((x) => x.chua_het_gio === false));
});

test('/trend khi thiếu tuần: so_tuan phản ánh số ngày cùng thứ có file; DB trống -> rỗng', async () => {
  const t = await mgr(`${BASE}/trend?date=${F3}`);
  assert.deepEqual([t.so_tuan, t.it_du_lieu], [2, true]);
  const none = await mgr(`${BASE}/trend?date=2025-01-01`);
  assert.equal(none.so_tuan, 0);
  assert.ok(none.theo_gio.every((x) => x.tb_4_tuan === null));
  assert.equal(none.ngay.length, 8);
  assert.ok(none.ngay.every((x) => x.san_luong === 0 && x.co_du_lieu === false));
});

// ------------------------------------------
// /wards-surge
// ------------------------------------------
test('/wards-surge: top 5 theo % tăng, loại phường/xã số nhỏ, tỉnh khác, không tăng; cùng khoảng giờ; ngày vắng tính 0 trong các tuần có file', async () => {
  const w = await mgr(`${BASE}/wards-surge?date=${F3}`);
  assert.equal(w.as_of, '12:00');
  assert.deepEqual(w.gioi_han, { min_hom_nay: 30, min_binh_thuong: 20, top: 5 });
  assert.deepEqual(w.items.map((x) => x.phuong_xa), ['Phường Kk', 'Phường Aa', 'Phường Bb', 'Phường Ee', 'Phường Ff']);
  assert.deepEqual(w.items.map((x) => x.tang_pct), [200, 100, 50, 50, 25]);
  const kk = w.items[0];
  assert.deepEqual([kk.hom_nay, kk.tb_4_tuan, kk.so_tuan, kk.it_du_lieu, kk.ma_bcvh, kk.bcvh], [60, 20, 2, true, C, 'BCVH Hương Thủy'], 'Kk: tuần 2 vắng = 0 → (40 + 0) / 2');
  const aa = w.items[1];
  assert.deepEqual([aa.hom_nay, aa.tb_4_tuan], [40, 20], '30 bưu gửi chiều không vào "bình thường"');
  assert.equal(w.items[2].hom_nay, 36, 'hoà 50%: hôm nay lớn hơn đứng trước (Bb 36 > Ee 30)');
  const names = w.items.map((x) => x.phuong_xa);
  for (const out of ['Phường Cc', 'Phường Dd', 'Phường Hh', 'Phường Gg', 'Phường Jj', 'Phường Xx']) assert.ok(!names.includes(out), out);
  // Cc: 29 < 30; Dd: bình thường 19 < 20; Hh: không tăng; Gg, Jj: hạng 6–7 (chỉ lấy 5); Xx: ngoài tỉnh.
  assert.equal(JSON.stringify(w).includes('Xx'), false);
  const none = await mgr(`${BASE}/wards-surge?date=${F1}`);
  assert.deepEqual(none.items, [], 'ngày không có phường/xã đủ lớn');
});

// ------------------------------------------
// /center
// ------------------------------------------
test('/center (7 ngày kết thúc ở date): tổng đường thư = top 5 + còn lại + nhóm chưa có tên (nếu ngoài top); khớp tính lại độc lập', async () => {
  const c = await mgr(`${BASE}/center?date=${F1}`);
  assert.deepEqual([c.from, c.to], ['2026-10-02 00:00:00', '2026-10-08 23:59:59']);
  const ref = refCounted('2026-10-02 00:00:00', '2026-10-08 23:59:59');
  assert.equal(c.san_luong, ref.length);
  assert.equal(c.san_luong, 39 + 30 + 10 + 15, 'A: 13 (07/10) + 27 (08/10) − Yrep đếm 1 lần trong cả khoảng; B 30; C 10; D 15');
  const r = c.duong_thu;
  assert.equal(r.top.length, 5);
  assert.deepEqual(r.top.map((x) => x.hang), [1, 2, 3, 4, 5]);
  const counts = r.top.map((x) => x.san_luong);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(r.chua_co_ten.trong_top, false, 'nhóm chưa có tên nhỏ -> ngoài top 5');
  const sum = r.top.reduce((a, x) => a + x.san_luong, 0) + r.con_lai.san_luong + (r.chua_co_ten.trong_top ? 0 : r.chua_co_ten.san_luong);
  assert.equal(sum, c.san_luong);
  // Tính lại độc lập theo (BCVH, đường thư); bưu gửi chưa có tên gom 1 nhóm chung.
  const groups = new Map();
  for (const x of ref) {
    const k = x.route.trim() === '' ? '' : `${x.recv}|${x.route}`;
    if (!groups.has(k)) groups.set(k, { n: 0, nang: 0 });
    const g = groups.get(k); g.n++; if (x.weight > 2500) g.nang++;
  }
  const named = [...groups.entries()].filter(([k]) => k !== '');
  assert.equal(r.tong_so_duong_thu, named.length);
  assert.equal(r.chua_co_ten.san_luong, groups.get('')?.n || 0);
  assert.deepEqual(counts, named.map(([, g]) => g.n).sort((a, b) => b - a).slice(0, 5));
  assert.equal(r.con_lai.so_duong_thu, named.length - 5);
  assert.equal(r.con_lai.san_luong, named.map(([, g]) => g.n).sort((a, b) => b - a).slice(5).reduce((a, x) => a + x, 0));
  for (const x of r.top) {
    assert.ok(x.ma_bcvh && x.ten_bcvh && !x.chua_co_ten);
    assert.equal(x.hang_nang, groups.get(`${x.ma_bcvh}|${x.ten}`).nang);
  }
  assert.ok(r.top.some((x) => x.ma_bcvh === A) && r.top.some((x) => x.ma_bcvh === B), 'có đường thư của nhiều BCVH');
});

test('/center: nhóm "Chưa có tên đường thư" xếp hạng như đường thư thường nếu thuộc top 5; không đếm 2 lần', async () => {
  const c = await mgr(`${BASE}/center?date=${F2}`);
  assert.equal(c.san_luong, 300);
  const r = c.duong_thu;
  assert.deepEqual(r.top.map((x) => [x.ten, x.san_luong]), [
    ['Đường thư giả D1', 70], ['Chưa có tên đường thư', 60], ['Đường thư giả C1', 40], ['Đường thư giả E1', 40], ['Đường thư giả C2', 30]
  ]);
  const un = r.top[1];
  assert.deepEqual([un.chua_co_ten, un.ma_bcvh, un.ten_bcvh, un.hang], [true, null, null, 2]);
  assert.deepEqual(r.chua_co_ten, { san_luong: 60, hang_nang: 6, trong_top: true });
  assert.deepEqual(r.con_lai, { so_duong_thu: 3, san_luong: 30 + 20 + 10, hang_nang: 0 });
  assert.equal(r.top.reduce((a, x) => a + x.san_luong, 0) + r.con_lai.san_luong, 300, 'nhóm chưa có tên đã nằm trong top -> không cộng thêm');
  assert.equal(r.top[0].hang_nang, 7);
  assert.equal(r.top.find((x) => x.ten === 'Đường thư giả E1').ten_bcvh, 'BCVH Phú Lộc');
  // dịch vụ: R (D) 100, E (E) 100, C (C) 100; hàng nặng 7 / 6 / 0
  const sv = c.dich_vu;
  assert.equal(sv.san_luong, 300);
  assert.equal(sv.items.reduce((a, x) => a + x.san_luong, 0) + sv.chua_co_ten.san_luong, 300);
  const by = Object.fromEntries(sv.items.map((x) => [x.ma, [x.san_luong, x.ty_trong, x.hang_nang]]));
  assert.deepEqual(by, { R: [100, 33.33, 7], E: [100, 33.33, 6], C: [100, 33.33, 0] });
});

test('/center: chất lượng khai thác toàn Trung tâm = quality-mocs của 6 BCVH; tong_hop: co_xnd_bd10 + khong_xnd_bd10 = sản lượng', async () => {
  const c = await mgr(`${BASE}/center?date=${F1}`);
  const qm = await mgr(`/api/arrivals/quality-mocs?from=2026-10-02&to=2026-10-08&receiver_code=${ALL6.join(',')}`);
  assert.deepEqual(c.chat_luong.tong_hop, qm.tong_hop);
  assert.deepEqual(c.chat_luong.to_hop, qm.to_hop);
  assert.equal(c.chat_luong.to_hop.length, 7);
  assert.equal(c.chat_luong.san_luong, c.san_luong);
  const th = c.chat_luong.tong_hop;
  assert.equal(th.co_xnd_bd10.so_buu_gui + th.khong_xnd_bd10.so_buu_gui, c.san_luong);
  assert.ok(th.co_xnd_bd10.so_buu_gui > 0 && th.khong_xnd_bd10.so_buu_gui > 0);
  // Cặp ngoài quy tắc "dòng đại diện": đối chiếu với tính lại độc lập từ các dòng giả (mốc "có" = có trên bản ghi).
  const ref = refCounted('2026-10-02 00:00:00', '2026-10-08 23:59:59');
  assert.equal(th.co_xnd_bd10.so_buu_gui, ref.filter((r) => r.bd10).length);
  assert.equal(th.co_xn_tui.so_buu_gui, ref.filter((r) => r.bag).length);
  assert.equal(th.co_xn_bg.so_buu_gui, ref.filter((r) => r.item).length);
});

test('/center: mặc định = 7 ngày kết thúc ở ngày mới nhất; from/to tuỳ chọn; DB trống -> rỗng', async () => {
  const d = await mgr(`${BASE}/center`);
  assert.deepEqual([d.date, d.from, d.to, d.san_luong], [F2, '2027-01-08 00:00:00', '2027-01-14 23:59:59', 300]);
  const one = await mgr(`${BASE}/center?from=${F1}&to=${F1}`);
  assert.deepEqual([one.from, one.to], ['2026-10-08 00:00:00', '2026-10-08 23:59:59']);
  assert.equal(one.san_luong, refDay(F1).length);
  const onlyTo = await mgr(`${BASE}/center?to=${F1}`);
  assert.equal(onlyTo.from, '2026-10-02 00:00:00');
  const empty = dash.center(ctx.db, { from: '2025-01-01', to: '2025-01-02' });
  assert.equal(empty.san_luong, 0);
  assert.deepEqual(empty.duong_thu.top, []);
  assert.deepEqual(empty.duong_thu.con_lai, { so_duong_thu: 0, san_luong: 0, hang_nang: 0 });
});

// ------------------------------------------
// Bổ sung /quality-mocs của 3b
// ------------------------------------------
test('/quality-mocs: tong_hop (du_trang_thai, co_xn_tui, co_xnd_bd10, khong_xnd_bd10, co_xn_bg) tính từ 7 tổ hợp, mẫu số = sản lượng', async () => {
  const m = await mgr('/api/arrivals/quality-mocs?from=2026-10-01&to=2026-10-08');
  const by = Object.fromEntries(m.to_hop.map((c) => [c.key, c.so_buu_gui]));
  const th = m.tong_hop;
  assert.equal(th.du_trang_thai.so_buu_gui, by['111']);
  assert.equal(th.co_xn_tui.so_buu_gui, by['111'] + by['110'] + by['101'] + by['100']);
  assert.equal(th.co_xnd_bd10.so_buu_gui, by['111'] + by['110'] + by['011'] + by['010']);
  assert.equal(th.co_xn_bg.so_buu_gui, by['111'] + by['101'] + by['011'] + by['001']);
  assert.equal(th.khong_xnd_bd10.so_buu_gui, by['101'] + by['100'] + by['001']);
  assert.equal(th.co_xnd_bd10.so_buu_gui + th.khong_xnd_bd10.so_buu_gui, m.san_luong);
  const FIVE = ['du_trang_thai', 'co_xn_tui', 'co_xnd_bd10', 'khong_xnd_bd10', 'co_xn_bg'];
  for (const k of FIVE) assert.equal(th[k].ty_le, Math.round((th[k].so_buu_gui / m.san_luong) * 10000) / 100, k);
  assert.ok(th.du_trang_thai.so_buu_gui > 0, 'dữ liệu giả có bưu gửi đủ 3 mốc? (túi + BD10 + bưu gửi)');
  // Khoảng rỗng: mọi số 0, không chia cho 0.
  const empty = (await mgr('/api/arrivals/quality-mocs?from=2025-01-01&to=2025-01-02')).tong_hop;
  assert.deepEqual(FIVE.map((k) => [empty[k].so_buu_gui, empty[k].ty_le]), Array(5).fill([0, 0]));
});
