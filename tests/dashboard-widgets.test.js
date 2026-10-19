// ==========================================
// Test: Dashboard động (server/routes/dashboardWidgets.js + server/lib/dashboardSources.js)
// Seed mặc định, phân quyền ADMIN-only cho ghi, tính đúng số liệu theo whitelist, validate,
// chống chèn SQL. Dữ liệu seed có chủ đích trong DB tạm (không đụng DB thật).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedMinimalOrg, seedUser, uid } = require('./helpers/fixtures');
const { computeWidgetData } = require('../server/lib/dashboardSources');
const { seedDefaultWidgets } = require('../server/lib/dashboardDefaults');

const PORT = 5910;
const USERS = {
  admin: { hrm: 'DW_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'DW_TTVH', pass: 'Ttvh@123', role: 'TTVH' }
};
const DEFAULT_COUNT = 3;

let ctx;
let org;
let c2; // BĐX thứ hai
const tokens = {};

async function api(method, path, who, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  const res = await fetch(`${ctx.baseUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body: json };
}
const admin = (m, p, b) => api(m, p, 'admin', b);

const count = (table) => ctx.db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
// Tính trực tiếp qua lib (cùng code với route) trên DB test để kiểm tra nhiều tổ hợp nhanh.
const calc = (cfg) => computeWidgetData(ctx.db, { source: 'POST_OFFICE', top_n: 10, filters: {}, chart_type: 'BAR', ...cfg });
const asMap = (r) => Object.fromEntries(r.items.map((x) => [x.label, x.count]));

// Chưa có ô SYSTEM nào trong bộ mặc định -> chèn thẳng 1 ô để kiểm tra quy tắc ô hệ thống.
function addSystemWidget() {
  const id = uid();
  const pos = ctx.db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM dashboard_widgets').get().m + 1;
  ctx.db.prepare(`INSERT INTO dashboard_widgets (id, kind, system_key, title, size, position, visible)
    VALUES (?, 'SYSTEM', 'TEST_SYS', 'Ô hệ thống thử', 'M', ?, 1)`).run(id, pos);
  return id;
}

function addPostOffice({ code, name, type = 'GD3', communeId, hasComputer = 1, status = 'ACTIVE', ward = null, lat = null, lng = null }) {
  ctx.db.prepare(`INSERT INTO post_offices (id, code, name, type, commune_id, has_computer, operational_status, new_ward_name, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(uid(), code, name, type, communeId, hasComputer, status, ward, lat, lng);
}

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dashboard-widgets-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  org = seedMinimalOrg(ctx.db); // 'Bưu cục Test': GD3, ACTIVE, có máy, chưa toạ độ, BĐX Test
  for (const u of Object.values(USERS)) seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
  for (const [k, u] of Object.entries(USERS)) {
    const r = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hrm_code: u.hrm, password: u.pass })
    });
    tokens[k] = (await r.json()).token;
  }

  c2 = uid();
  ctx.db.prepare('INSERT INTO commune_post_offices (id, code, name, province_id) VALUES (?, ?, ?, ?)').run(c2, 'DWC2', 'BĐX Hai', org.provinceId);
  // Tổng 5 bưu cục: BĐX Test 2, BĐX Hai 3.
  addPostOffice({ code: 'DWPO2', name: 'Bưu cục Hai', type: 'VHX', communeId: c2, hasComputer: 0, status: 'INACTIVE', ward: 'Phường A', lat: 16.4, lng: 107.5 });
  addPostOffice({ code: 'DWPO3', name: 'Bưu cục Ba', type: 'GD3', communeId: c2, ward: 'Phường A' });
  addPostOffice({ code: 'DWPO4', name: 'Bưu cục Bốn', type: '', communeId: org.communeId, ward: 'Phường B' });
  addPostOffice({ code: 'DWPO5', name: 'Bưu cục Năm', type: 'PH1', communeId: c2, status: 'INACTIVE' });
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

// ------------------ SEED MẶC ĐỊNH ------------------
test('seed mặc định: đủ 3 ô CHART nguồn POST_OFFICE, đúng thứ tự/loại/cỡ; gọi seed lại không nhân đôi', async () => {
  const r = await admin('GET', '/api/dashboard/widgets');
  assert.equal(r.status, 200);
  const items = r.body.items;
  assert.equal(items.length, DEFAULT_COUNT);
  assert.deepEqual(items.map((x) => x.group_by), ['commune', 'operational_status', 'type']);
  assert.deepEqual(items.map((x) => x.size), ['XL', 'M', 'M']);
  assert.deepEqual(items.map((x) => x.position), [1, 2, 3]);
  assert.deepEqual(items.map((x) => x.chart_type), ['BAR', 'DONUT', 'LIST']);
  assert.deepEqual(items.map((x) => x.top_n), [10, 5, 10]);
  assert.ok(items.every((x) => x.kind === 'CHART' && x.source === 'POST_OFFICE' && x.system_key === null));
  assert.ok(items.every((x) => x.visible === true));

  assert.equal(seedDefaultWidgets(ctx.db), false, 'bảng đã có dữ liệu -> không seed lại');
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT);
});

// ------------------ PHÂN QUYỀN ------------------
test('chưa đăng nhập -> 401 cho mọi route dashboard widgets', async () => {
  for (const [m, p] of [['GET', '/widgets'], ['GET', '/widgets-data'], ['GET', '/widgets-meta'], ['POST', '/widgets'],
    ['PUT', '/widgets/x'], ['DELETE', '/widgets/x'], ['PUT', '/widgets-order'], ['POST', '/widgets-reset']]) {
    assert.equal((await api(m, `/api/dashboard${p}`, null, m === 'GET' || m === 'DELETE' ? undefined : {})).status, 401, `${m} ${p}`);
  }
});

test('TTVH đọc được widgets + widgets-data; ghi/meta/order/reset -> 403; ADMIN làm được', async () => {
  const cfg = { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR' };
  for (const who of ['ttvh']) {
    assert.equal((await api('GET', '/api/dashboard/widgets', who)).status, 200, who);
    assert.equal((await api('GET', '/api/dashboard/widgets-data', who)).status, 200, who);
    assert.equal((await api('GET', '/api/dashboard/widgets-meta', who)).status, 403, who);
    assert.equal((await api('POST', '/api/dashboard/widgets', who, cfg)).status, 403);
    assert.equal((await api('PUT', '/api/dashboard/widgets/x', who, { title: 'y' })).status, 403);
    assert.equal((await api('DELETE', '/api/dashboard/widgets/x', who)).status, 403);
    assert.equal((await api('PUT', '/api/dashboard/widgets-order', who, { ids: [] })).status, 403);
    assert.equal((await api('POST', '/api/dashboard/widgets-reset', who)).status, 403);
  }
  const r = await api('POST', '/api/dashboard/widgets', 'ttvh', cfg);
  assert.match(r.body.error, /ADMIN/);
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT, 'các lần ghi bị 403 không để lại gì');

  assert.equal((await admin('GET', '/api/dashboard/widgets-meta')).status, 200);
});

test('TTVH chỉ thấy ô visible; ADMIN thấy tất cả kèm cờ visible', async () => {
  const sysId = addSystemWidget();
  const items = (await admin('GET', '/api/dashboard/widgets')).body.items;
  const hideChart = items.find((x) => x.group_by === 'type');
  assert.equal((await admin('PUT', `/api/dashboard/widgets/${sysId}`, { visible: false })).status, 200);
  assert.equal((await admin('PUT', `/api/dashboard/widgets/${hideChart.id}`, { visible: false })).status, 200);

  const adminList = (await admin('GET', '/api/dashboard/widgets')).body.items;
  assert.equal(adminList.length, DEFAULT_COUNT + 1);
  assert.equal(adminList.find((x) => x.id === sysId).visible, false);
  for (const who of ['ttvh']) {
    const list = (await api('GET', '/api/dashboard/widgets', who)).body.items;
    assert.equal(list.length, DEFAULT_COUNT - 1, who);
    assert.ok(!list.some((x) => x.id === sysId || x.id === hideChart.id));
    const data = (await api('GET', '/api/dashboard/widgets-data', who)).body;
    assert.ok(!(hideChart.id in data), 'ô CHART ẩn không có trong widgets-data');
  }
  await admin('POST', '/api/dashboard/widgets-reset');
});

// ------------------ SỐ LIỆU ------------------
test('POST_OFFICE: type / tình trạng / BĐX / phường mới / có máy / toạ độ; NULL/rỗng -> "Chưa xác định"', () => {
  assert.equal(calc({ group_by: 'type' }).total, 5);
  assert.deepEqual(asMap(calc({ group_by: 'type' })), { GD3: 2, VHX: 1, PH1: 1, 'Chưa xác định': 1 });
  assert.deepEqual(asMap(calc({ group_by: 'operational_status' })), { 'Hoạt động': 3, 'Ngừng hoạt động': 2 });
  assert.deepEqual(asMap(calc({ group_by: 'commune' })), { 'BĐX Test': 2, 'BĐX Hai': 3 });
  assert.deepEqual(asMap(calc({ group_by: 'new_ward' })), { 'Phường A': 2, 'Phường B': 1, 'Chưa xác định': 2 });
  assert.deepEqual(asMap(calc({ group_by: 'has_computer' })), { 'Có máy': 4, 'Không có máy': 1 });
  assert.deepEqual(asMap(calc({ group_by: 'has_coordinates' })), { 'Có tọa độ': 1, 'Chưa có tọa độ': 4 });
});

test('sắp xếp mặc định theo số lượng giảm dần, bằng nhau thì theo nhãn', () => {
  const r = calc({ group_by: 'type' });
  assert.deepEqual(r.items.map((x) => x.label), ['GD3', 'Chưa xác định', 'PH1', 'VHX']);
  assert.deepEqual(r.items.map((x) => x.count), [2, 1, 1, 1]);
});

test('top_n gộp phần còn lại thành "other"; total vẫn là tổng', () => {
  const r = calc({ group_by: 'type', top_n: 3 });
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].label, 'GD3');
  assert.equal(r.other, 1);
  assert.equal(r.total, 5);
  assert.equal(r.items.reduce((s, x) => s + x.count, 0) + r.other, 5);
  assert.equal(calc({ group_by: 'type', top_n: 10 }).other, undefined, 'đủ chỗ thì không có other');
});

test('NUMBER (group_by = null): một con số tổng, có áp bộ lọc', () => {
  assert.deepEqual(calc({ group_by: null, chart_type: 'NUMBER' }), { total: 5, items: [] });
  assert.equal(calc({ group_by: null, chart_type: 'NUMBER', filters: { operational_status: ['INACTIVE'] } }).total, 2);
});

test('bộ lọc POST_OFFICE: hoạt động riêng lẻ và kết hợp', () => {
  const g = (filters) => calc({ group_by: null, chart_type: 'NUMBER', filters }).total;
  assert.equal(g({ commune_id: [c2] }), 3);
  assert.equal(g({ commune_id: [c2, org.communeId] }), 5);
  assert.equal(g({ operational_status: ['INACTIVE'] }), 2);
  assert.equal(g({ operational_status: ['ACTIVE', 'INACTIVE'], commune_id: [c2] }), 3);
  assert.equal(g({ operational_status: ['ACTIVE'], commune_id: [c2] }), 1);
  assert.equal(g({ operational_status: ['INACTIVE'], commune_id: [org.communeId] }), 0);
  // bộ lọc + nhóm
  assert.deepEqual(asMap(calc({ group_by: 'type', filters: { commune_id: [c2], operational_status: ['INACTIVE'] } })), { VHX: 1, PH1: 1 });
});

// ------------------ API: CRUD + widgets-data ------------------
test('widgets-data qua API: 3 ô mặc định có số liệu đúng', async () => {
  await admin('POST', '/api/dashboard/widgets-reset');
  const items = (await admin('GET', '/api/dashboard/widgets')).body.items;
  const data = (await api('GET', '/api/dashboard/widgets-data', 'ttvh')).body;
  const byGroup = (g) => items.find((x) => x.group_by === g);
  assert.deepEqual(Object.keys(data).sort(), items.map((x) => x.id).sort());
  assert.deepEqual(asMap(data[byGroup('commune').id]), { 'BĐX Hai': 3, 'BĐX Test': 2 });
  assert.deepEqual(asMap(data[byGroup('operational_status').id]), { 'Hoạt động': 3, 'Ngừng hoạt động': 2 });
  assert.equal(data[byGroup('type').id].total, 5);
});

test('widgets-data: không tính ô SYSTEM', async () => {
  const sysId = addSystemWidget();
  const data = (await api('GET', '/api/dashboard/widgets-data', 'ttvh')).body;
  assert.ok(!(sysId in data));
  assert.equal(Object.keys(data).length, DEFAULT_COUNT);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('widgets-data: lỗi 1 ô không làm hỏng cả response', async () => {
  const items = (await admin('GET', '/api/dashboard/widgets')).body.items;
  const target = items.find((x) => x.group_by === 'type');
  ctx.db.prepare("UPDATE dashboard_widgets SET source = 'KHONG_CO' WHERE id = ?").run(target.id);
  const r = await api('GET', '/api/dashboard/widgets-data', 'ttvh');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body[target.id]), ['error']);
  assert.ok(!/SELECT|FROM|KHONG_CO/i.test(JSON.stringify(r.body[target.id])), 'không lộ chi tiết nội bộ');
  const ok = items.find((x) => x.group_by === 'commune');
  assert.ok(r.body[ok.id].items.length > 0);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('POST tạo ô CHART: position cuối, mặc định size M / top_n 10, lưu bộ lọc; widgets-meta trả whitelist', async () => {
  const r = await admin('POST', '/api/dashboard/widgets', {
    title: '  Ngừng hoạt động theo BĐX ', source: 'POST_OFFICE', group_by: 'commune', chart_type: 'BAR_H',
    filters: { operational_status: ['INACTIVE'] }
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.item.title, 'Ngừng hoạt động theo BĐX');
  assert.equal(r.body.item.kind, 'CHART');
  assert.equal(r.body.item.position, DEFAULT_COUNT + 1);
  assert.equal(r.body.item.size, 'M');
  assert.equal(r.body.item.top_n, 10);
  assert.equal(r.body.item.system_key, null);
  assert.deepEqual(r.body.item.filters, { operational_status: ['INACTIVE'] });
  const data = (await api('GET', '/api/dashboard/widgets-data', 'ttvh')).body;
  assert.deepEqual(asMap(data[r.body.item.id]), { 'BĐX Hai': 2 });

  const meta = (await admin('GET', '/api/dashboard/widgets-meta')).body;
  assert.deepEqual(meta.sources.map((s) => s.key), ['POST_OFFICE']);
  const po = meta.sources[0];
  assert.deepEqual(po.fields.map((f) => f.key), ['type', 'operational_status', 'commune', 'new_ward', 'has_computer', 'has_coordinates']);
  assert.ok(po.fields.every((f) => !f.ordered && !f.chartTypes.includes('LINE') && !f.chartTypes.includes('NUMBER')));
  assert.deepEqual(po.filters.find((f) => f.key === 'operational_status').options.map((o) => o.value), ['ACTIVE', 'INACTIVE']);
  assert.ok(po.filters.find((f) => f.key === 'commune_id').options.some((o) => o.label === 'BĐX Hai'));
  assert.deepEqual(meta.chartTypes, ['BAR', 'BAR_H', 'DONUT', 'LINE', 'LIST', 'TABLE', 'NUMBER']);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('PUT ô CHART: sửa cấu hình, validate lại toàn bộ; nguồn/group_by không thuộc whitelist -> 400', async () => {
  const w = (await admin('POST', '/api/dashboard/widgets', { title: 'A', source: 'POST_OFFICE', group_by: 'type', chart_type: 'LIST' })).body.item;
  const r = await admin('PUT', `/api/dashboard/widgets/${w.id}`, { title: 'B', chart_type: 'DONUT', top_n: 4, size: 'L', filters: { operational_status: ['ACTIVE'] }, visible: false });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.item.title, r.body.item.chart_type, r.body.item.top_n, r.body.item.size, r.body.item.visible], ['B', 'DONUT', 4, 'L', false]);
  assert.equal(r.body.item.position, w.position, 'PUT không đổi vị trí');

  assert.equal((await admin('PUT', `/api/dashboard/widgets/${w.id}`, { source: 'NGUON_LA' })).status, 400, 'nguồn ngoài whitelist');
  assert.equal((await admin('PUT', `/api/dashboard/widgets/${w.id}`, { group_by: 'code' })).status, 400);
  const ok = await admin('PUT', `/api/dashboard/widgets/${w.id}`, { group_by: 'new_ward', filters: {} });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.item.group_by, 'new_ward');
  assert.equal((await admin('PUT', '/api/dashboard/widgets/khong-co', { title: 'x' })).status, 404);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('ô SYSTEM: chỉ đổi title/size/visible; key khác bị BỎ QUA; không xoá được', async () => {
  const sysId = addSystemWidget();
  const sys = (await admin('GET', '/api/dashboard/widgets')).body.items.find((x) => x.id === sysId);
  const r = await admin('PUT', `/api/dashboard/widgets/${sys.id}`, {
    title: 'Đổi tên', size: 'FULL', visible: false,
    source: 'POST_OFFICE', group_by: 'type', chart_type: 'DONUT', top_n: 3, filters: { operational_status: ['ACTIVE'] }, position: 99, system_key: 'HACK', kind: 'CHART'
  });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.item.title, r.body.item.size, r.body.item.visible], ['Đổi tên', 'FULL', false]);
  assert.deepEqual([r.body.item.kind, r.body.item.system_key, r.body.item.source, r.body.item.group_by, r.body.item.chart_type, r.body.item.position],
    ['SYSTEM', 'TEST_SYS', null, null, null, sys.position], 'các trường khác không đổi');
  assert.equal((await admin('PUT', `/api/dashboard/widgets/${sys.id}`, { size: 'HUGE' })).status, 400);
  assert.equal((await admin('PUT', `/api/dashboard/widgets/${sys.id}`, { title: '' })).status, 400);

  const del = await admin('DELETE', `/api/dashboard/widgets/${sys.id}`);
  assert.equal(del.status, 400);
  assert.match(del.body.error, /ẩn/);
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT + 1);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('DELETE ô CHART; id không có -> 404', async () => {
  const w = (await admin('POST', '/api/dashboard/widgets', { title: 'Xoá', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR' })).body.item;
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT + 1);
  assert.equal((await admin('DELETE', `/api/dashboard/widgets/${w.id}`)).status, 200);
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT);
  assert.equal((await admin('DELETE', `/api/dashboard/widgets/${w.id}`)).status, 404);
});

test('widgets-order: đúng tập id -> cập nhật position; thiếu/thừa/trùng/lạ -> 400', async () => {
  const items = (await admin('GET', '/api/dashboard/widgets')).body.items;
  const ids = items.map((x) => x.id);
  const reversed = [...ids].reverse();
  const ok = await admin('PUT', '/api/dashboard/widgets-order', { ids: reversed });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.items.map((x) => x.id), reversed);
  assert.deepEqual((await admin('GET', '/api/dashboard/widgets')).body.items.map((x) => x.position), [1, 2, 3]);

  for (const bad of [ids.slice(1), [...ids, 'khong-co'], [...ids.slice(1), ids[1]], ids.map((x, i) => (i === 0 ? 'khong-co' : x)), 'abc', [1, 2]]) {
    assert.equal((await admin('PUT', '/api/dashboard/widgets-order', { ids: bad })).status, 400);
  }
  assert.deepEqual((await admin('GET', '/api/dashboard/widgets')).body.items.map((x) => x.id), reversed, 'lỗi thì thứ tự giữ nguyên');
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('widgets-reset: xoá cấu hình (kể cả ô SYSTEM), seed lại đúng 3 ô mặc định', async () => {
  await admin('POST', '/api/dashboard/widgets', { title: 'Tạm', source: 'POST_OFFICE', group_by: 'type', chart_type: 'DONUT' });
  addSystemWidget();
  const first = (await admin('GET', '/api/dashboard/widgets')).body.items.find((x) => x.group_by === 'commune');
  await admin('PUT', `/api/dashboard/widgets/${first.id}`, { title: 'Đổi tên', visible: false });
  const r = await admin('POST', '/api/dashboard/widgets-reset');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, DEFAULT_COUNT);
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT);
  const commune = r.body.items.find((x) => x.group_by === 'commune');
  assert.equal(commune.title, 'Bưu cục theo BĐX');
  assert.equal(commune.visible, true);
  assert.equal(r.body.items.filter((x) => x.title === 'Tạm' || x.kind === 'SYSTEM').length, 0);
});

// ------------------ VALIDATE ------------------
const base = () => ({ title: 'Kiểm thử', source: 'POST_OFFICE', group_by: 'operational_status', chart_type: 'BAR' });
const post = (over) => admin('POST', '/api/dashboard/widgets', { ...base(), ...over });

test('validate: khóa lạ (nguồn, group_by, chart_type, bộ lọc, size) -> 400 tiếng Việt, nêu rõ trường', async () => {
  const cases = [
    [{ source: 'USERS' }, /source/],
    [{ source: undefined }, /source/],
    [{ group_by: 'password_hash' }, /group_by/],
    [{ group_by: 'code' }, /group_by/],
    [{ chart_type: 'PIE' }, /chart_type/],
    [{ filters: { password: ['x'] } }, /password/],
    [{ filters: { operational_status: ['KHONG_CO'] } }, /operational_status/],
    [{ filters: { operational_status: 'ACTIVE' } }, /operational_status/],
    [{ filters: { commune_id: 'abc' } }, /commune_id/],
    [{ filters: [] }, /filters/],
    [{ size: 'HUGE' }, /size/]
  ];
  for (const [over, re] of cases) {
    const r = await post(over);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.match(r.body.error, re, JSON.stringify(over));
  }
  assert.equal(count('dashboard_widgets'), DEFAULT_COUNT);
});

test('validate: LINE bị chặn (nguồn không có trường có thứ tự); NUMBER bắt buộc group_by = null; loại khác bắt buộc group_by', async () => {
  for (const f of ['type', 'operational_status', 'commune', 'new_ward']) {
    assert.equal((await post({ chart_type: 'LINE', group_by: f })).status, 400, f);
  }
  assert.equal((await post({ chart_type: 'NUMBER', group_by: 'type' })).status, 400);
  const num = await post({ chart_type: 'NUMBER', group_by: null });
  assert.equal(num.status, 201);
  await admin('DELETE', `/api/dashboard/widgets/${num.body.item.id}`);
  for (const t of ['BAR', 'BAR_H', 'DONUT', 'LIST', 'TABLE']) {
    assert.equal((await post({ chart_type: t, group_by: null })).status, 400, t);
  }
});

test('validate: top_n ngoài 3..30; title rỗng/quá dài; vượt 30 ô', async () => {
  for (const n of [2, 31, 0, -1, 5.5, 'abc']) assert.equal((await post({ top_n: n })).status, 400, `top_n=${n}`);
  for (const n of [3, 30]) {
    const r = await post({ top_n: n });
    assert.equal(r.status, 201, `top_n=${n}`);
    await admin('DELETE', `/api/dashboard/widgets/${r.body.item.id}`);
  }
  assert.equal((await post({ title: '' })).status, 400);
  assert.equal((await post({ title: '   ' })).status, 400);
  assert.equal((await post({ title: undefined })).status, 400);
  assert.equal((await post({ title: 'x'.repeat(81) })).status, 400);
  const ok80 = await post({ title: 'x'.repeat(80) });
  assert.equal(ok80.status, 201);
  await admin('DELETE', `/api/dashboard/widgets/${ok80.body.item.id}`);

  // đạt trần 30 ô
  for (let i = count('dashboard_widgets'); i < 30; i++) assert.equal((await post({ title: `Ô ${i}` })).status, 201);
  assert.equal(count('dashboard_widgets'), 30);
  const over = await post({ title: 'Ô thứ 31' });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /30/);
  await admin('POST', '/api/dashboard/widgets-reset');
});

// ------------------ CHỐNG CHÈN SQL ------------------
test('chống chèn SQL: group_by / bộ lọc / title chứa mã độc không phá DB, không đổi kết quả', async () => {
  const evil = "'; DROP TABLE post_offices; --";
  const evil2 = '" OR 1=1';
  const poBefore = count('post_offices');
  const widgetsBefore = count('dashboard_widgets');
  const totalBefore = calc({ group_by: null, chart_type: 'NUMBER' }).total;

  // group_by / source / chart_type độc hại -> 400
  for (const over of [{ group_by: evil }, { group_by: evil2 }, { source: evil }, { chart_type: evil }, { size: evil },
    { filters: { [evil]: ['x'] } }, { filters: { [evil2]: ['x'] } }, { filters: { operational_status: [evil] } },
    { filters: { operational_status: [evil2] } }]) {
    const r = await post(over);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.ok(!/DROP|SELECT|sqlite/i.test(r.body.error.replace(/DROP TABLE post_offices/g, '')), 'không lộ SQL');
  }

  // giá trị lọc dạng id là chuỗi tự do -> chỉ là giá trị tham số (không khớp gì), KHÔNG biến thành "OR 1=1"
  const filtered = await post({ group_by: null, chart_type: 'NUMBER', filters: { commune_id: [evil, evil2, "x' OR 1=1 --"] } });
  assert.equal(filtered.status, 201);
  const data = (await api('GET', '/api/dashboard/widgets-data', 'ttvh')).body;
  assert.equal(data[filtered.body.item.id].total, 0, 'không khớp bản ghi nào, không bị "OR 1=1"');

  // title chứa mã độc: lưu và trả lại như văn bản thường
  const titled = await post({ title: evil });
  assert.equal(titled.status, 201);
  assert.equal(titled.body.item.title, evil);
  const titled2 = await post({ title: evil2 });
  assert.equal(titled2.status, 201);
  assert.equal(titled2.body.item.title, evil2);

  // PUT cũng không chèn được
  const put = await admin('PUT', `/api/dashboard/widgets/${titled.body.item.id}`, { group_by: evil });
  assert.equal(put.status, 400);

  assert.equal(count('post_offices'), poBefore, 'bảng post_offices còn nguyên');
  assert.equal(count('dashboard_widgets'), widgetsBefore + 3);
  assert.equal(calc({ group_by: null, chart_type: 'NUMBER' }).total, totalBefore);
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('GET /api/dashboard/stats trả số đếm mạng lưới', async () => {
  const r = await api('GET', '/api/dashboard/stats', 'ttvh');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.summary, { totalCommunes: 2, totalPostOffices: 5 });
});

// ------------------ PREVIEW + include_hidden ------------------
test('widgets-preview: 401 chưa đăng nhập, 403 TTVH, 200 ADMIN', async () => {
  const cfg = { title: 'Xem trước', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR' };
  assert.equal((await api('POST', '/api/dashboard/widgets-preview', null, cfg)).status, 401);
  for (const who of ['ttvh']) {
    const r = await api('POST', '/api/dashboard/widgets-preview', who, cfg);
    assert.equal(r.status, 403, who);
    assert.match(r.body.error, /ADMIN/);
  }
  const ok = await admin('POST', '/api/dashboard/widgets-preview', cfg);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body), ['data']);
  assert.equal(ok.body.data.total, 5);
});

test('widgets-preview: số liệu khớp ô lưu cùng cấu hình; không ghi DB', async () => {
  await admin('POST', '/api/dashboard/widgets-reset');
  const cfg = {
    title: 'Loại hình 2 BĐX', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR', top_n: 3,
    filters: { commune_id: [org.communeId, c2] }, size: 'L'
  };
  const before = count('dashboard_widgets');
  const prev = await admin('POST', '/api/dashboard/widgets-preview', cfg);
  assert.equal(prev.status, 200, JSON.stringify(prev.body));
  assert.equal(count('dashboard_widgets'), before, 'preview không tạo dòng nào');

  const saved = await admin('POST', '/api/dashboard/widgets', cfg);
  assert.equal(saved.status, 201);
  const data = (await admin('GET', '/api/dashboard/widgets-data')).body;
  assert.deepEqual(data[saved.body.item.id], prev.body.data, 'cùng cấu hình -> cùng số liệu');
  assert.equal(prev.body.data.other !== undefined, true, 'top_n 3 gộp phần còn lại vào other');

  // NUMBER không group_by + bộ lọc cũng dùng được
  const num = await admin('POST', '/api/dashboard/widgets-preview', { title: 'Tổng', source: 'POST_OFFICE', group_by: null, chart_type: 'NUMBER', filters: { operational_status: ['INACTIVE'] } });
  assert.deepEqual(num.body.data, { total: 2, items: [] });
  await admin('POST', '/api/dashboard/widgets-reset');
});

test('widgets-preview: cấu hình sai -> 400 tiếng Việt; payload chèn SQL -> 400, bảng còn nguyên', async () => {
  const poBefore = count('post_offices');
  const widgetsBefore = count('dashboard_widgets');
  const cases = [
    { title: 'x', source: 'USERS', group_by: 'type', chart_type: 'BAR' },
    { title: 'x', source: 'NGUON_LA', group_by: 'type', chart_type: 'BAR' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'x; DROP TABLE post_offices', chart_type: 'BAR' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'PIE' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'LINE' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'NUMBER' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR', top_n: 99 },
    { title: '', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR' },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR', filters: { 'type; DROP TABLE post_offices': ['GD3'] } },
    { title: 'x', source: 'POST_OFFICE', group_by: 'type', chart_type: 'BAR', filters: { operational_status: ["ACTIVE' OR 1=1 --"] } }
  ];
  for (const c of cases) {
    const r = await admin('POST', '/api/dashboard/widgets-preview', c);
    assert.equal(r.status, 400, JSON.stringify(c));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.equal(count('post_offices'), poBefore);
  assert.equal(count('dashboard_widgets'), widgetsBefore);
});

test('widgets-data?include_hidden=1: ADMIN thấy cả ô CHART ẩn; TTVH bị bỏ qua tham số; không tham số = như cũ', async () => {
  await admin('POST', '/api/dashboard/widgets-reset');
  const items = (await admin('GET', '/api/dashboard/widgets')).body.items;
  const hidden = items.find((x) => x.group_by === 'type');
  await admin('PUT', `/api/dashboard/widgets/${hidden.id}`, { visible: false });

  const adminHidden = (await admin('GET', '/api/dashboard/widgets-data?include_hidden=1')).body;
  assert.ok(hidden.id in adminHidden);
  assert.deepEqual(asMap(adminHidden[hidden.id]), { GD3: 2, VHX: 1, PH1: 1, 'Chưa xác định': 1 });
  assert.equal(Object.keys(adminHidden).length, DEFAULT_COUNT);

  assert.ok(!(hidden.id in (await admin('GET', '/api/dashboard/widgets-data')).body), 'ADMIN không tham số: chỉ ô visible');
  for (const who of ['ttvh']) {
    const withParam = (await api('GET', '/api/dashboard/widgets-data?include_hidden=1', who)).body;
    assert.ok(!(hidden.id in withParam), `${who} bỏ qua include_hidden`);
    assert.equal(Object.keys(withParam).length, DEFAULT_COUNT - 1);
  }
  await admin('POST', '/api/dashboard/widgets-reset');
});
