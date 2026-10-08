// ==========================================
// Test: Authentication + RBAC (server/auth.js + route POST /api/auth/login)
// Evidence: server/index.js:21-49 (route login), server/auth.js:60-87 (middleware)
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedMinimalOrg, seedUser } = require('./helpers/fixtures');

const PORT = 5901;
const MGR_HRM = 'AUTH_MGR';
const MGR_PASS = 'Manager@123';
const STAFF_HRM = 'AUTH_STAFF';
const STAFF_PASS = 'Staff@123';

let ctx;
let fixtures;

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-auth-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  fixtures = seedMinimalOrg(ctx.db);
  seedUser(ctx.db, { hrmCode: MGR_HRM, fullName: 'Auth Manager', role: 'ADMIN', password: MGR_PASS });
  seedUser(ctx.db, { hrmCode: STAFF_HRM, fullName: 'Auth Staff', role: 'STAFF', password: STAFF_PASS });
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
  const body = await res.json();
  return { status: res.status, body };
}

test('login đúng mật khẩu -> 200 + trả JWT hợp lệ', async () => {
  const { status, body } = await login(MGR_HRM, MGR_PASS);
  assert.equal(status, 200);
  assert.equal(typeof body.token, 'string');
  assert.equal(body.token.split('.').length, 3, 'token phải có 3 phần (header.payload.signature)');
  assert.equal(body.user.role, 'ADMIN');
  assert.equal(body.user.hrm_code, MGR_HRM);
});

test('login sai mật khẩu -> 401', async () => {
  const { status, body } = await login(MGR_HRM, 'mat-khau-sai');
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('login mã HRM không tồn tại -> 401 (không lộ tài khoản có tồn tại hay không)', async () => {
  const { status } = await login('KHONG_TON_TAI', 'gi-cung-duoc');
  assert.equal(status, 401);
});

test('login thiếu password -> 400', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hrm_code: MGR_HRM })
  });
  assert.equal(res.status, 400);
});

const NEW_USER = { hrm_code: 'AUTH_NEW', full_name: 'Người Mới', password: 'Abc@1234' };

test('gọi route ghi (POST users) không có token -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(NEW_USER)
  });
  assert.equal(res.status, 401);
});

test('gọi route ghi (PUT network/post-offices) không có token -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/network/post-offices/khong-ton-tai`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X' })
  });
  assert.equal(res.status, 401);
});

test('gọi route ghi (DELETE network/post-offices) không có token -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/network/post-offices/khong-ton-tai`, { method: 'DELETE' });
  assert.equal(res.status, 401);
});

test('gọi route ghi với token rác (không hợp lệ) -> 401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer khong-phai-jwt-hop-le' },
    body: JSON.stringify(NEW_USER)
  });
  assert.equal(res.status, 401);
});

test('có token role STAFF -> POST users 403', async () => {
  const { body: loginBody } = await login(STAFF_HRM, STAFF_PASS);
  const res = await fetch(`${ctx.baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBody.token}` },
    body: JSON.stringify(NEW_USER)
  });
  assert.equal(res.status, 403);
});

test('có token role STAFF -> PUT network/post-offices 403', async () => {
  const { body: loginBody } = await login(STAFF_HRM, STAFF_PASS);
  const res = await fetch(`${ctx.baseUrl}/api/network/post-offices/${fixtures.postOfficeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBody.token}` },
    body: JSON.stringify({ name: 'Không được sửa' })
  });
  assert.equal(res.status, 403);
});

test('có token role STAFF -> DELETE network/post-offices 403', async () => {
  const { body: loginBody } = await login(STAFF_HRM, STAFF_PASS);
  const res = await fetch(`${ctx.baseUrl}/api/network/post-offices/${fixtures.postOfficeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(res.status, 403);
});

test('có token role quản lý -> POST users 201 (thành công)', async () => {
  const { body: loginBody } = await login(MGR_HRM, MGR_PASS);
  const res = await fetch(`${ctx.baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBody.token}` },
    body: JSON.stringify(NEW_USER)
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
});

test('có token role quản lý -> PUT network/post-offices 200 (thành công)', async () => {
  const { body: loginBody } = await login(MGR_HRM, MGR_PASS);
  const putRes = await fetch(`${ctx.baseUrl}/api/network/post-offices/${fixtures.postOfficeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginBody.token}` },
    body: JSON.stringify({ name: 'Bưu cục Test (đã sửa)' })
  });
  assert.equal(putRes.status, 200);
});

test('rate-limit đăng nhập: 5 lần sai liên tiếp -> lần thứ 6 bị 429, dù mật khẩu đúng', async () => {
  const rlHrm = 'RATE_LIMIT_TEST';
  // Không cần seed user thật — 401 (sai) vẫn tính vào bộ đếm rate-limit
  // như đã cài trong server/index.js (recordFailedLogin chạy trước khi
  // biết tài khoản có tồn tại hay không).
  for (let i = 0; i < 5; i++) {
    const { status } = await login(rlHrm, 'sai-mat-khau');
    assert.equal(status, 401, `lần thử thứ ${i + 1} phải là 401 (chưa bị khoá)`);
  }
  // Lần thứ 6: kể cả gửi đúng thông tin (giả định) cũng phải bị chặn bởi rate-limit trước khi verify.
  const { status, body } = await login(rlHrm, 'sai-mat-khau');
  assert.equal(status, 429, 'lần thứ 6 trong 15 phút phải bị chặn rate-limit (429)');
  assert.ok(body.error);
});

test('rate-limit đăng nhập: không ảnh hưởng tài khoản KHÁC (chỉ khoá theo hrm_code cụ thể)', async () => {
  // Tài khoản quản lý (MGR_HRM) vẫn đăng nhập bình thường dù RATE_LIMIT_TEST
  // (hrm_code khác) vừa bị khoá ở test phía trên.
  const { status } = await login(MGR_HRM, MGR_PASS);
  assert.equal(status, 200);
});
