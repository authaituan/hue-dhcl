// ==========================================
// Test: User Administration (server/index.js:721-848)
// Evidence: GET/POST /api/users, PUT /api/users/:id, PUT /api/users/:id/reset-password,
// PUT /api/users/me/password. Middleware authRequired/requireAdmin (server/auth.js)
// — ma trận 4 vai trò nằm ở tests/roles.test.js; ở đây ADMIN = "quản lý".
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser } = require('./helpers/fixtures');

const PORT = 5904;
const MGR_HRM = 'USERS_MGR';
const MGR_PASS = 'Manager@123';
const STAFF_HRM = 'USERS_STAFF';
const STAFF_PASS = 'Staff@123';

let ctx;
let mgrToken;
let staffToken;
let mgrId;

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-users-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  mgrId = seedUser(ctx.db, { hrmCode: MGR_HRM, fullName: 'Users Manager', role: 'ADMIN', password: MGR_PASS });
  seedUser(ctx.db, { hrmCode: STAFF_HRM, fullName: 'Users Staff', role: 'STAFF', password: STAFF_PASS });

  const mgrLogin = await login(MGR_HRM, MGR_PASS);
  mgrToken = mgrLogin.body.token;
  const staffLogin = await login(STAFF_HRM, STAFF_PASS);
  staffToken = staffLogin.body.token;
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

async function login(hrm_code, password) {
  const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hrm_code, password })
  });
  return { status: res.status, body: await res.json() };
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, body: data };
}

test('GET /api/users không có token -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/users`);
  assert.equal(res.status, 401);
});

test('GET /api/users role STAFF -> 403', async () => {
  const { status } = await call('GET', '/api/users', { token: staffToken });
  assert.equal(status, 403);
});

test('GET /api/users role quản lý -> 200, KHÔNG lộ password_hash', async () => {
  const { status, body } = await call('GET', '/api/users', { token: mgrToken });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 2);
  for (const u of body) {
    assert.equal(u.password_hash, undefined, 'response tuyệt đối không được có password_hash');
  }
});

test('POST /api/users role STAFF -> 403 (không tạo được user)', async () => {
  const { status } = await call('POST', '/api/users', {
    token: staffToken,
    body: { hrm_code: 'SHOULD_FAIL', full_name: 'X', password: '123456' }
  });
  assert.equal(status, 403);
});

test('POST /api/users thiếu hrm_code -> 400', async () => {
  const { status } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { full_name: 'Không có mã', password: '123456' }
  });
  assert.equal(status, 400);
});

test('POST /api/users password < 6 ký tự -> 400', async () => {
  const { status } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'SHORT_PW', full_name: 'Test', password: '123' }
  });
  assert.equal(status, 400);
});

test('POST /api/users hợp lệ -> 201, mật khẩu được hash (không lưu plaintext)', async () => {
  const { status, body } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'NEW_STAFF_01', full_name: 'Nhan Vien Moi', password: 'Plaintext123' }
  });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.equal(body.role, 'STAFF', 'role mặc định phải là STAFF khi không truyền');

  const row = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(body.id);
  assert.notEqual(row.password_hash, 'Plaintext123', 'password_hash không được lưu dạng plaintext');
  assert.ok(row.password_hash.length > 20, 'password_hash phải là chuỗi hash, không phải mật khẩu gốc');
});

test('POST /api/users trùng hrm_code -> 400', async () => {
  const { status } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'NEW_STAFF_01', full_name: 'Trung ma HRM', password: '123456' }
  });
  assert.equal(status, 400);
});

test('PUT /api/users/:id đổi role user KHÁC -> 200', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'ROLE_CHANGE_01', full_name: 'Doi Role', password: '123456' }
  });
  const { status } = await call('PUT', `/api/users/${created.id}`, {
    token: mgrToken,
    body: { role: 'ADMIN' }
  });
  assert.equal(status, 200);
  const row = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(created.id);
  assert.equal(row.role, 'ADMIN');
});

test('PUT /api/users/:id tự đổi role CHÍNH MÌNH -> 400 (chặn tự khoá quyền)', async () => {
  const { status, body } = await call('PUT', `/api/users/${mgrId}`, {
    token: mgrToken,
    body: { role: 'STAFF' }
  });
  assert.equal(status, 400);
  assert.ok(body.error);
  const row = ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(mgrId);
  assert.equal(row.role, 'ADMIN', 'role của chính mình phải giữ nguyên, không bị đổi');
});

test('PUT /api/users/:id/reset-password role STAFF -> 403', async () => {
  const { status } = await call('PUT', `/api/users/${mgrId}/reset-password`, {
    token: staffToken,
    body: { password: '123456' }
  });
  assert.equal(status, 403);
});

test('PUT /api/users/:id/reset-password hợp lệ -> 200, mật khẩu mới hoạt động thật', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'RESET_PW_01', full_name: 'Reset PW', password: 'OldPassword1' }
  });

  const { status } = await call('PUT', `/api/users/${created.id}/reset-password`, {
    token: mgrToken,
    body: { password: 'NewPassword2' }
  });
  assert.equal(status, 200);

  // Verify: mật khẩu cũ không còn đăng nhập được, mật khẩu mới đăng nhập được.
  const oldLogin = await login('RESET_PW_01', 'OldPassword1');
  assert.equal(oldLogin.status, 401);
  const newLogin = await login('RESET_PW_01', 'NewPassword2');
  assert.equal(newLogin.status, 200);
});

test('PUT /api/users/me/password sai mật khẩu hiện tại -> 400', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'SELF_PW_01', full_name: 'Self PW', password: 'Original123' }
  });
  const { body: loginBody } = await login('SELF_PW_01', 'Original123');

  const { status, body } = await call('PUT', '/api/users/me/password', {
    token: loginBody.token,
    body: { currentPassword: 'SaiRoi', newPassword: 'NewOne123' }
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('PUT /api/users/me/password đúng mật khẩu hiện tại -> 200, đổi thật (kể cả role STAFF)', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'SELF_PW_02', full_name: 'Self PW 2', password: 'Original123' }
  });
  const { body: loginBody } = await login('SELF_PW_02', 'Original123');
  assert.equal(loginBody.user.role, 'STAFF', 'user tự đổi mật khẩu ở test này phải là STAFF (không cần role quản lý)');

  const { status } = await call('PUT', '/api/users/me/password', {
    token: loginBody.token,
    body: { currentPassword: 'Original123', newPassword: 'BrandNew456' }
  });
  assert.equal(status, 200);

  const oldLogin = await login('SELF_PW_02', 'Original123');
  assert.equal(oldLogin.status, 401);
  const newLogin = await login('SELF_PW_02', 'BrandNew456');
  assert.equal(newLogin.status, 200);
});

test('PUT /api/users/me/password không có token -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/users/me/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'x', newPassword: 'Abcdef12' })
  });
  assert.equal(res.status, 401);
});

// ==========================================
// Deactivate / Reactivate (server/index.js: PUT /api/users/:id/deactivate,
// PUT /api/users/:id/reactivate) + POST /api/auth/login chặn user đã khoá.
// ==========================================

test('PUT /api/users/:id/deactivate role STAFF -> 403', async () => {
  const { status } = await call('PUT', `/api/users/${mgrId}/deactivate`, { token: staffToken });
  assert.equal(status, 403);
});

test('PUT /api/users/:id/deactivate tự vô hiệu hoá CHÍNH MÌNH -> 400 (chặn tự khoá)', async () => {
  const { status, body } = await call('PUT', `/api/users/${mgrId}/deactivate`, { token: mgrToken });
  assert.equal(status, 400);
  assert.ok(body.error);
  const row = ctx.db.prepare('SELECT deactivated_at FROM users WHERE id = ?').get(mgrId);
  assert.equal(row.deactivated_at, null, 'tài khoản của chính mình phải vẫn hoạt động, không bị khoá');
});

test('PUT /api/users/:id/deactivate user không tồn tại -> 404', async () => {
  const { status } = await call('PUT', '/api/users/khong-ton-tai/deactivate', { token: mgrToken });
  assert.equal(status, 404);
});

test('Deactivate user khác -> 200, deactivated_at được set, GET /api/users trả về field này, và user đó KHÔNG đăng nhập được nữa dù đúng mật khẩu (message riêng, khác sai mật khẩu)', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'DEACTIVATE_01', full_name: 'Se Bi Khoa', password: 'Password123' }
  });

  // Trước khi khoá: đăng nhập bình thường được.
  const beforeLogin = await login('DEACTIVATE_01', 'Password123');
  assert.equal(beforeLogin.status, 200);

  const deactivateRes = await call('PUT', `/api/users/${created.id}/deactivate`, { token: mgrToken });
  assert.equal(deactivateRes.status, 200);

  const row = ctx.db.prepare('SELECT deactivated_at FROM users WHERE id = ?').get(created.id);
  assert.ok(row.deactivated_at, 'deactivated_at phải được set sau khi vô hiệu hoá');

  // GET /api/users phải VẪN trả về user này (không ẩn khỏi danh sách)
  // kèm field deactivated_at để UI biết trạng thái.
  const listRes = await call('GET', '/api/users', { token: mgrToken });
  const foundInList = listRes.body.find((u) => u.id === created.id);
  assert.ok(foundInList, 'user đã bị vô hiệu hoá vẫn phải xuất hiện trong GET /api/users');
  assert.ok(foundInList.deactivated_at, 'GET /api/users phải trả về deactivated_at cho frontend biết trạng thái');

  // Đăng nhập lại với ĐÚNG mật khẩu -> vẫn bị chặn, message RIÊNG khác sai mật khẩu.
  const afterLogin = await login('DEACTIVATE_01', 'Password123');
  assert.equal(afterLogin.status, 401);
  assert.match(afterLogin.body.error, /vô hiệu hoá/i);

  const wrongPasswordLogin = await login('DEACTIVATE_01', 'MatKhauSai999');
  assert.equal(wrongPasswordLogin.status, 401);
  assert.notEqual(
    wrongPasswordLogin.body.error,
    afterLogin.body.error,
    'message khi tài khoản bị khoá phải KHÁC message khi sai mật khẩu'
  );
});

test('PUT /api/users/:id/reactivate role STAFF -> 403', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'REACTIVATE_STAFF_CHECK', full_name: 'Check Staff 403', password: 'Password123' }
  });
  await call('PUT', `/api/users/${created.id}/deactivate`, { token: mgrToken });

  const { status } = await call('PUT', `/api/users/${created.id}/reactivate`, { token: staffToken });
  assert.equal(status, 403);
});

test('Reactivate -> 200, deactivated_at về NULL, đăng nhập lại được bình thường', async () => {
  const { body: created } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'REACTIVATE_01', full_name: 'Se Duoc Kich Hoat Lai', password: 'Password123' }
  });

  await call('PUT', `/api/users/${created.id}/deactivate`, { token: mgrToken });
  const blockedLogin = await login('REACTIVATE_01', 'Password123');
  assert.equal(blockedLogin.status, 401);

  const reactivateRes = await call('PUT', `/api/users/${created.id}/reactivate`, { token: mgrToken });
  assert.equal(reactivateRes.status, 200);

  const row = ctx.db.prepare('SELECT deactivated_at FROM users WHERE id = ?').get(created.id);
  assert.equal(row.deactivated_at, null, 'deactivated_at phải về NULL sau khi kích hoạt lại');

  const restoredLogin = await login('REACTIVATE_01', 'Password123');
  assert.equal(restoredLogin.status, 200, 'sau khi kích hoạt lại phải đăng nhập được bình thường');
});

// ==========================================
// GET /api/users/search — autocomplete "Người Phụ Trách" bưu cục
// ==========================================

test('GET /api/users/search role STAFF -> 403; không token -> 401', async () => {
  assert.equal((await call('GET', '/api/users/search?q=a', { token: staffToken })).status, 403);
  assert.equal((await call('GET', '/api/users/search?q=a')).status, 401);
});

test('GET /api/users/search q rỗng -> []', async () => {
  const { status, body } = await call('GET', '/api/users/search?q=', { token: mgrToken });
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test('GET /api/users/search khớp mã HRM / họ tên không dấu, bỏ qua user đã vô hiệu hoá, không lộ password_hash', async () => {
  const { body: a } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'SEARCH_01', full_name: 'Đặng Thị Tìm', password: 'Password123' }
  });
  const { body: b } = await call('POST', '/api/users', {
    token: mgrToken,
    body: { hrm_code: 'SEARCH_02', full_name: 'Đặng Văn Khoá', password: 'Password123' }
  });
  await call('PUT', `/api/users/${b.id}/deactivate`, { token: mgrToken });

  const byName = await call('GET', `/api/users/search?q=${encodeURIComponent('dang')}`, { token: mgrToken });
  assert.equal(byName.status, 200);
  const ids = byName.body.map((u) => u.id);
  assert.ok(ids.includes(a.id), 'tìm theo tên không dấu phải ra user còn hoạt động');
  assert.ok(!ids.includes(b.id), 'user đã vô hiệu hoá không được gợi ý');
  assert.ok(byName.body.every((u) => !('password_hash' in u)));

  const byHrm = await call('GET', '/api/users/search?q=search_01', { token: mgrToken });
  assert.deepEqual(byHrm.body.map((u) => u.hrm_code), ['SEARCH_01']);
});
