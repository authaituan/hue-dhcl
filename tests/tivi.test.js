// ==========================================
// Test DASH-3 (#74): vai trò TIVI — chỉ xem 3 endpoint dashboard «đến» (allowlist, từ chối mặc định), phạm vi do ADMIN gán,
// token dài hạn riêng, thu hồi khi khoá / đổi mật khẩu / đổi vai trò. Server thật trên DB tạm, dữ liệu giả (không cần dữ liệu hàng đến).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { setTiviScope } = require('../server/lib/tivi');

const PORT = 5921;
const M = '533140';
const M2 = '535470';
const DAY_S = 24 * 3600;
const USERS = {
  admin: { hrm: 'TV_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'TV_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'TV_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'TV_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tvAll: { hrm: 'TV_ALL', pass: 'Tivi@123', role: 'TIVI', scope: 'all' },
  tvM2: { hrm: 'TV_M2', pass: 'Tivi@123', role: 'TIVI', scope: M2 },
  tvNone: { hrm: 'TV_NONE', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const ids = {};
let ctx;

const DASH = ['/api/arrivals/dashboard/tong-quan-den', '/api/arrivals/dashboard/viec-can-lam', '/api/arrivals/dashboard/phuong-xa-tang'];
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

async function call(method, p, token, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ctx.baseUrl}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const get = (p, who) => call('GET', p, tokens[who]);
async function login(who) {
  const r = await loginAs(ctx.baseUrl, USERS[who].hrm, USERS[who].pass);
  assert.equal(r.status, 200, who);
  tokens[who] = r.body.token;
  return r;
}

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-tivi-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    if (u.scope) setTiviScope(ctx.db, ids[k], u.scope);
    await login(k);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

test('token: TIVI hạn 90 ngày (JWT_EXPIRY_TIVI mặc định), các vai trò khác giữ hạn cũ (8 giờ)', () => {
  for (const k of ['tvAll', 'tvM2', 'tvNone']) {
    const p = payloadOf(tokens[k]);
    assert.equal(p.exp - p.iat, 90 * DAY_S, k);
    assert.equal(p.role, 'TIVI');
  }
  for (const k of ['admin', 'ttvh', 'gdvh', 'staff']) {
    const p = payloadOf(tokens[k]);
    assert.equal(p.exp - p.iat, 8 * 3600, k);
    assert.ok(!('tivi' in p) && !('pwd' in p), `${k}: không có claim của TIVI`);
  }
});

test('đăng nhập và /auth/me: trả vai trò + phạm vi tivi, không lộ password_hash', async () => {
  const r = await loginAs(ctx.baseUrl, USERS.tvM2.hrm, USERS.tvM2.pass);
  assert.deepEqual(r.body.user, { id: ids.tvM2, hrm_code: 'TV_M2', full_name: 'TV_M2', role: 'TIVI', tivi_scope: M2 });
  const me = await get('/api/auth/me', 'tvAll');
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys(me.body).sort(), ['full_name', 'hrm_code', 'id', 'role', 'tivi_scope', 'token_het_han']);
  assert.equal(me.body.tivi_scope, 'all');
  assert.equal((await get('/api/auth/me', 'tvNone')).body.tivi_scope, null);
  const ad = (await get('/api/auth/me', 'admin')).body;
  assert.deepEqual([ad.role, ad.tivi_scope], ['ADMIN', null], 'mọi vai trò dùng được /auth/me');
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
});

test('allowlist: TIVI gọi được 3 endpoint dashboard «đến» (200)', async () => {
  for (const p of DASH) {
    const r = await get(p, 'tvAll');
    assert.equal(r.status, 200, p);
    assert.equal(r.body.bcvh, 'all');
  }
  assert.equal((await get(`${DASH[0]}/`, 'tvAll')).status, 200, 'dấu "/" cuối');
  assert.equal((await get(DASH[0].toUpperCase().replace('/API/', '/api/'), 'tvAll')).status, 200, 'khác hoa thường');
});

test('từ chối mặc định: mọi endpoint khác trả 403 cho TIVI (xuất Excel, người dùng, mạng lưới, sản lượng, BD10, dashboard cũ, widget, danh mục)', async () => {
  const blocked = [
    ['GET', `/api/arrivals/export?receiver_code=${M}&from=2026-10-01&to=2026-10-02`],
    ['GET', `/api/arrivals/not-received/export?receiver_code=${M}&from=2026-10-01&to=2026-10-02`],
    ['GET', `/api/arrivals/bd10-khong-xnd/export?unit=${M}&from=2026-10-01&to=2026-10-02`],
    ['GET', '/api/arrivals/export-scope'],
    ['GET', '/api/users'],
    ['GET', '/api/users/search?q=a'],
    ['POST', '/api/users', { hrm_code: 'X1', full_name: 'X', password: '123456', role: 'ADMIN' }],
    ['PUT', `/api/users/${ids.tvAll}`, { role: 'ADMIN' }],
    ['PUT', `/api/users/${ids.tvAll}`, { tivi_scope: M }],
    ['PUT', '/api/users/me/password', { currentPassword: 'Tivi@123', newPassword: 'Khac@123' }],
    ['GET', '/api/network'],
    ['GET', '/api/network/export-data'],
    ['GET', '/api/arrivals/summary?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/arrivals/meta'],
    ['GET', '/api/arrivals/not-received?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/arrivals/bd10-khong-xnd?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/arrivals/bd10-trang-thai/theo-ngay?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/arrivals/dashboard/overview'],
    ['GET', '/api/arrivals/dashboard/center'],
    ['GET', '/api/dashboard/widgets'],
    ['GET', '/api/dashboard/widgets-data'],
    ['GET', '/api/dashboard/stats'],
    ['GET', '/api/organization/communes'],
    ['GET', '/api/khong-co-route-nay'],
    ['POST', DASH[0], {}]
  ];
  for (const [m, p, body] of blocked) {
    const r = await call(m, p, tokens.tvAll, body);
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  // Không có gì bị đổi: tài khoản TIVI vẫn là TIVI, phạm vi vẫn 'all', mật khẩu cũ vẫn đăng nhập được
  assert.equal((await get('/api/auth/me', 'tvAll')).body.tivi_scope, 'all');
  assert.equal((await loginAs(ctx.baseUrl, USERS.tvAll.hrm, USERS.tvAll.pass)).status, 200);
  // Vai trò khác không bị ảnh hưởng
  assert.equal((await get('/api/arrivals/summary?from=2026-10-01&to=2026-10-02', 'ttvh')).status, 200);
  assert.equal((await get('/api/dashboard/widgets', 'staff')).status, 200);
});

test('phạm vi: tham số bcvh do client gửi bị bỏ qua, luôn ép theo phạm vi; phạm vi một BCVH không đọc được BCVH khác', async () => {
  for (const p of DASH) {
    for (const qs of ['', '?bcvh=all', `?bcvh=${M}`]) {
      const r = await get(`${p}${qs}`, 'tvM2');
      assert.equal(r.status, 200, `${p}${qs}`);
      assert.equal(r.body.bcvh, M2, `${p}${qs}`);
    }
    assert.equal((await get(`${p}?bcvh=${M}`, 'tvAll')).body.bcvh, 'all', 'phạm vi all cũng bị ép');
  }
  const tq = (await get(`${DASH[0]}?bcvh=all`, 'tvM2')).body;
  assert.deepEqual(tq.theo_bcvh.map((x) => x.ma), [M2]);
  assert.equal((await get(DASH[0], 'tvAll')).body.theo_bcvh.length, 6);
  // Tham số sai khác vẫn bị kiểm như thường
  assert.equal((await get(`${DASH[0]}?date=2026-02-30`, 'tvM2')).status, 400);
});

test('TIVI chưa có phạm vi -> 403 ở dashboard, thông báo rõ; /auth/me vẫn dùng được', async () => {
  for (const p of DASH) {
    const r = await get(p, 'tvNone');
    assert.equal(r.status, 403, p);
    assert.match(r.body.error, /chưa được gán phạm vi/);
  }
  assert.equal((await get('/api/auth/me', 'tvNone')).status, 200);
});

test('quản lý tài khoản: chỉ ADMIN tạo / sửa TIVI kèm phạm vi; kiểm giá trị; danh sách có vai trò + phạm vi, không lộ password_hash', async () => {
  const post = (who, body) => call('POST', '/api/users', tokens[who], body);
  const base = { full_name: 'Tivi Mới', password: 'Tivi@123', role: 'TIVI' };
  for (const who of ['ttvh', 'gdvh', 'staff']) {
    assert.equal((await post(who, { ...base, hrm_code: `TV_X_${who}`, tivi_scope: 'all' })).status, 403, who);
  }
  const c1 = await post('admin', { ...base, hrm_code: 'TV_NEW1', tivi_scope: M });
  assert.equal(c1.status, 201);
  assert.deepEqual([c1.body.role, c1.body.tivi_scope], ['TIVI', M]);
  const c2 = await post('admin', { ...base, hrm_code: 'TV_NEW2' });
  assert.deepEqual([c2.status, c2.body.tivi_scope], [201, null], 'tạo TIVI chưa có phạm vi được (dashboard sẽ 403)');
  assert.equal((await post('admin', { ...base, hrm_code: 'TV_BAD', tivi_scope: '999999' })).status, 400, 'mã ngoài 6 BCVH');
  assert.equal((await post('admin', { ...base, hrm_code: 'TV_BAD2', tivi_scope: ['all'] })).status, 400);
  assert.equal((await post('admin', { ...base, role: 'TTVH', hrm_code: 'TV_BAD3', tivi_scope: 'all' })).status, 400, 'phạm vi tivi cho vai trò khác');
  assert.equal((await post('admin', { ...base, hrm_code: 'TV_NEW1' })).status, 400, 'trùng mã HRM như quy tắc cũ');

  const list = (await get('/api/users', 'admin')).body;
  const n1 = list.find((u) => u.hrm_code === 'TV_NEW1');
  assert.deepEqual([n1.role, n1.tivi_scope], ['TIVI', M]);
  assert.equal(list.find((u) => u.hrm_code === 'TV_TTVH').tivi_scope, null);
  assert.ok(list.every((u) => !('password_hash' in u)));

  const put = (who, id, body) => call('PUT', `/api/users/${id}`, tokens[who], body);
  assert.equal((await put('admin', c2.body.id, { tivi_scope: 'all' })).status, 200);
  assert.equal((await put('admin', c2.body.id, { tivi_scope: 'abc' })).status, 400);
  assert.equal((await put('ttvh', c2.body.id, { tivi_scope: M })).status, 403);
  assert.equal((await get('/api/users', 'admin')).body.find((u) => u.id === c2.body.id).tivi_scope, 'all');
  // Rời vai trò TIVI -> xoá phạm vi; gửi phạm vi cho vai trò khác -> 400
  assert.equal((await put('admin', c1.body.id, { role: 'STAFF' })).status, 200);
  assert.equal((await get('/api/users', 'admin')).body.find((u) => u.id === c1.body.id).tivi_scope, null);
  assert.equal((await put('admin', c1.body.id, { tivi_scope: 'all' })).status, 400);
  // Đổi sang TIVI kèm phạm vi trong cùng lần sửa
  assert.equal((await put('admin', c1.body.id, { role: 'TIVI', tivi_scope: M2 })).status, 200);
  assert.equal((await get('/api/users', 'admin')).body.find((u) => u.id === c1.body.id).tivi_scope, M2);
});

test('thu hồi: khoá tài khoản chặn ngay (401); đổi phạm vi áp dụng ngay với token cũ', async () => {
  const id = ids.tvAll;
  assert.equal((await call('PUT', `/api/users/${id}/deactivate`, tokens.admin)).status, 200);
  assert.equal((await get(DASH[0], 'tvAll')).status, 401);
  assert.equal((await get('/api/auth/me', 'tvAll')).status, 401);
  assert.equal((await call('PUT', `/api/users/${id}/reactivate`, tokens.admin)).status, 200);
  assert.equal((await get(DASH[0], 'tvAll')).status, 200, 'mở khoá -> token cũ dùng lại được');
  assert.equal((await call('PUT', `/api/users/${id}`, tokens.admin, { tivi_scope: M })).status, 200);
  assert.equal((await get(`${DASH[0]}?bcvh=all`, 'tvAll')).body.bcvh, M, 'cùng token, phạm vi mới');
  assert.equal((await call('PUT', `/api/users/${id}`, tokens.admin, { tivi_scope: 'all' })).status, 200);
});

test('thu hồi: đặt lại mật khẩu làm token TIVI cũ hết hiệu lực (401); đăng nhập lại bằng mật khẩu mới được', async () => {
  const id = ids.tvM2;
  const old = tokens.tvM2;
  assert.equal((await call('PUT', `/api/users/${id}/reset-password`, tokens.admin, { password: 'Moi@12345' })).status, 200);
  const r = await call('GET', DASH[0], old);
  assert.equal(r.status, 401);
  assert.match(r.body.error, /đăng nhập lại/);
  const again = await loginAs(ctx.baseUrl, USERS.tvM2.hrm, 'Moi@12345');
  assert.equal(again.status, 200);
  assert.equal((await call('GET', DASH[0], again.body.token)).status, 200);
});

test('thu hồi: đổi vai trò TIVI sang vai trò khác -> token 90 ngày cũ 401 (không mang sang quyền mới); đăng nhập lại nhận hạn của vai trò mới', async () => {
  const id = ids.tvNone;
  const old = tokens.tvNone;
  assert.equal((await call('PUT', `/api/users/${id}`, tokens.admin, { role: 'TTVH' })).status, 200);
  assert.equal((await call('GET', '/api/arrivals/summary?from=2026-10-01&to=2026-10-02', old)).status, 401);
  assert.equal((await call('GET', '/api/auth/me', old)).status, 401);
  const r = await loginAs(ctx.baseUrl, USERS.tvNone.hrm, USERS.tvNone.pass);
  const p = payloadOf(r.body.token);
  assert.deepEqual([p.role, p.exp - p.iat], ['TTVH', 8 * 3600]);
  // Ngược lại: token thường (8 giờ) của tài khoản vừa đổi sang TIVI bị giới hạn ngay theo allowlist
  assert.equal((await call('PUT', `/api/users/${id}`, tokens.admin, { role: 'TIVI', tivi_scope: 'all' })).status, 200);
  assert.equal((await call('GET', '/api/users', r.body.token)).status, 403);
  assert.equal((await call('GET', '/api/arrivals/summary?from=2026-10-01&to=2026-10-02', r.body.token)).status, 403);
  assert.equal((await call('GET', DASH[0], r.body.token)).status, 200);
});
