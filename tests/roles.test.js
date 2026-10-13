// ==========================================
// Test: 4 vai trò ADMIN / TTVH / GDVH / STAFF (SANLUONG-3c-2, docs/ai/04_DECISIONS.md #49–#54):
// ma trận quyền theo nhóm route, quyền có hiệu lực ngay (tra DB mỗi request), chống leo thang,
// ADMIN cuối cùng, gán GDVH ↔ BCVH (user_bcvh). Server thật trên DB tạm; tài khoản GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs, ROLES } = require('./helpers/fixtures');
const { wouldRemoveLastAdmin, countOtherActiveAdmins } = require('../server/lib/adminGuard');
const { DASHBOARD_BCVH } = require('../server/lib/dashboardQuery');

const PORT = 5914;
const PASS = 'Fake@1234';
const WHO = ['admin', 'ttvh', 'gdvh', 'staff'];
const ACCOUNTS = {
  admin: { hrm: 'RL_ADMIN', role: ROLES.ADMIN },
  ttvh: { hrm: 'RL_TTVH', role: ROLES.TTVH },
  gdvh: { hrm: 'RL_GDVH', role: ROLES.GDVH },
  staff: { hrm: 'RL_STAFF', role: ROLES.STAFF }
};

let ctx;
const token = {};
const id = {};

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-roles-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, a] of Object.entries(ACCOUNTS)) {
    id[k] = seedUser(ctx.db, { hrmCode: a.hrm, fullName: `Giả ${k}`, role: a.role, password: PASS });
    token[k] = (await loginAs(ctx.baseUrl, a.hrm, PASS)).body.token;
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

async function call(method, path, { tok, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${ctx.baseUrl}${path}`, { method, headers, body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body: data };
}
const as = (who, method, path, body) => call(method, path, { tok: token[who], body });

let seq = 0;
// Tạo tài khoản phụ trực tiếp trong DB, trả { id, tok }.
async function makeUser(role, tag = 'X') {
  const hrm = `RL_${tag}_${++seq}`;
  const uid = seedUser(ctx.db, { hrmCode: hrm, fullName: `Giả ${hrm}`, role, password: PASS });
  const tok = (await loginAs(ctx.baseUrl, hrm, PASS)).body.token;
  return { id: uid, tok, hrm };
}
const roleOf = (uid) => ctx.db.prepare('SELECT role FROM users WHERE id = ?').get(uid).role;

// ------------------------------------------
// 1. Ma trận quyền: route × 4 vai trò (+ không token)
//    allowed = vai trò được qua cổng quyền (kết quả có thể là 200/400/404 tuỳ dữ liệu, KHÔNG phải 401/403);
//    vai trò không có trong allowed phải nhận đúng 403; không token đúng 401.
// ------------------------------------------
const ALL = ['admin', 'ttvh', 'gdvh', 'staff'];
const VIEW = ['admin', 'ttvh', 'gdvh'];
const ADMIN_ONLY = ['admin'];
const MATRIX = [
  // Quản lý tài khoản — chỉ ADMIN (id không tồn tại: ADMIN qua cổng quyền và nhận 404/400)
  ['GET', '/api/users', undefined, ADMIN_ONLY],
  ['GET', '/api/users/search?q=a', undefined, ADMIN_ONLY],
  ['POST', '/api/users', {}, ADMIN_ONLY],
  ['PUT', '/api/users/khong-ton-tai', { full_name: 'x' }, ADMIN_ONLY],
  ['PUT', '/api/users/khong-ton-tai/reset-password', { password: '123456' }, ADMIN_ONLY],
  ['PUT', '/api/users/khong-ton-tai/deactivate', undefined, ADMIN_ONLY],
  ['PUT', '/api/users/khong-ton-tai/reactivate', undefined, ADMIN_ONLY],
  ['GET', '/api/users/khong-ton-tai/bcvh', undefined, ADMIN_ONLY],
  ['PUT', '/api/users/khong-ton-tai/bcvh', { codes: [] }, ADMIN_ONLY],
  // Tự đổi mật khẩu — mọi vai trò (mật khẩu hiện tại sai -> 400, qua được cổng quyền)
  ['PUT', '/api/users/me/password', { currentPassword: 'sai-mat-khau', newPassword: '123456' }, ALL],
  // Mạng lưới: đọc ADMIN/TTVH/GDVH; ghi/nhập/xoá chỉ ADMIN
  ['GET', '/api/network', undefined, VIEW],
  ['GET', '/api/network/export-data', undefined, VIEW],
  ['POST', '/api/network/import', { rows: [] }, ADMIN_ONLY],
  ['PUT', '/api/network/post-offices/khong-ton-tai', { name: 'x' }, ADMIN_ONLY],
  ['DELETE', '/api/network/post-offices/khong-ton-tai', undefined, ADMIN_ONLY],
  // Hàng đến + Dashboard điều hành: ADMIN/TTVH/GDVH
  ['GET', '/api/arrivals/meta', undefined, VIEW],
  ['GET', '/api/arrivals/summary?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/by-time?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/by-ward?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/by-route?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/by-service?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/quality-mocs?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/items?from=2026-10-01&to=2026-10-02', undefined, VIEW],
  ['GET', '/api/arrivals/lookup?tracking_no=GIA123', undefined, VIEW],
  ['GET', '/api/arrivals/dashboard/tong-quan-den', undefined, VIEW],
  ['GET', '/api/arrivals/dashboard/viec-can-lam', undefined, VIEW],
  ['GET', '/api/arrivals/dashboard/phuong-xa-tang', undefined, VIEW],
  // Cảnh báo / ngoại lệ / kết quả nạp: chỉ ADMIN
  ['GET', '/api/arrivals/exceptions?from=2026-10-01&to=2026-10-02', undefined, ADMIN_ONLY],
  ['GET', '/api/arrivals/import-status', undefined, ADMIN_ONLY],
  // Dashboard động: đọc mọi vai trò; cấu hình chỉ ADMIN (giữ nguyên hiện trạng)
  ['GET', '/api/dashboard/widgets', undefined, ALL],
  ['GET', '/api/dashboard/widgets-data', undefined, ALL],
  ['GET', '/api/dashboard/widgets-meta', undefined, ADMIN_ONLY],
  ['POST', '/api/dashboard/widgets-preview', {}, ADMIN_ONLY],
  ['PUT', '/api/dashboard/widgets-order', {}, ADMIN_ONLY],
  ['POST', '/api/dashboard/widgets', {}, ADMIN_ONLY],
  ['PUT', '/api/dashboard/widgets/khong-ton-tai', {}, ADMIN_ONLY],
  ['DELETE', '/api/dashboard/widgets/khong-ton-tai', undefined, ADMIN_ONLY],
  // Giữ nguyên: mọi người đã đăng nhập
  ['GET', '/api/organization/communes', undefined, ALL],
  ['GET', '/api/organization/post-offices', undefined, ALL],
  ['GET', '/api/dashboard/stats', undefined, ALL]
];

test('ma trận quyền: route × 4 vai trò (đúng 403 khi không đủ quyền; qua cổng khi đủ quyền; không token 401)', async () => {
  for (const [method, path, body, allowed] of MATRIX) {
    const anon = await call(method, path, { body });
    assert.equal(anon.status, 401, `không token: ${method} ${path}`);
    for (const who of WHO) {
      const r = await as(who, method, path, body);
      if (allowed.includes(who)) {
        assert.ok(r.status !== 401 && r.status !== 403, `${who} phải qua cổng quyền: ${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
      } else {
        assert.equal(r.status, 403, `${who} phải bị 403: ${method} ${path} -> ${r.status}`);
      }
    }
  }
});

test('ma trận quyền: các route đọc trả 200 cho vai trò được phép', async () => {
  const reads = [
    '/api/network', '/api/network/export-data', '/api/arrivals/meta', '/api/arrivals/dashboard/tong-quan-den', '/api/arrivals/dashboard/viec-can-lam',
    '/api/dashboard/widgets', '/api/organization/communes', '/api/dashboard/stats'
  ];
  for (const path of reads) {
    const allowed = path.startsWith('/api/network') || path.startsWith('/api/arrivals') ? VIEW : ALL;
    for (const who of allowed) assert.equal((await as(who, 'GET', path)).status, 200, `${who} ${path}`);
  }
  for (const who of ['admin']) {
    assert.equal((await as(who, 'GET', '/api/users')).status, 200);
    assert.equal((await as(who, 'GET', '/api/arrivals/import-status')).status, 200);
    assert.equal((await as(who, 'GET', '/api/dashboard/widgets-meta')).status, 200);
  }
});

test('POST /api/dashboard/widgets-reset: chỉ ADMIN (giữ nguyên hiện trạng)', async () => {
  for (const who of ['ttvh', 'gdvh', 'staff']) assert.equal((await as(who, 'POST', '/api/dashboard/widgets-reset')).status, 403, who);
  assert.equal((await call('POST', '/api/dashboard/widgets-reset')).status, 401);
});

test('GDVH xem đủ 6 BCVH như TTVH: không bị hạn chế theo BCVH được giao (giới hạn chỉ áp ở xuất file)', async () => {
  const g = await makeUser(ROLES.GDVH, 'VIEW');
  assert.equal((await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['533140'] })).status, 200);
  for (const b of DASHBOARD_BCVH) {
    const r = await call('GET', `/api/arrivals/summary?from=2026-10-01&to=2026-10-02&receiver_code=${b.ma}`, { tok: g.tok });
    assert.equal(r.status, 200, `GDVH xem BCVH ${b.ma}`);
  }
  assert.equal((await call('GET', '/api/arrivals/lookup?tracking_no=GIA123', { tok: g.tok })).status, 200);
  assert.equal((await call('GET', '/api/arrivals/items?from=2026-10-01&to=2026-10-02', { tok: g.tok })).status, 200);
});

// ------------------------------------------
// 2. Vai trò cũ / lạ
// ------------------------------------------
test('MANAGER còn trong DB không còn hợp lệ: mọi route /api (kể cả đổi mật khẩu) trả 403, KHÔNG coi là quản lý', async () => {
  const m = await makeUser('MANAGER', 'OLD');
  for (const [method, path] of [
    ['GET', '/api/arrivals/meta'], ['GET', '/api/network'], ['GET', '/api/users'], ['POST', '/api/users'],
    ['GET', '/api/dashboard/widgets'], ['GET', '/api/organization/communes'], ['PUT', '/api/users/me/password']
  ]) {
    const r = await call(method, path, { tok: m.tok, body: {} });
    assert.equal(r.status, 403, `${method} ${path}`);
    assert.match(r.body.error, /Vai trò/);
  }
});

test('role ngoài danh sách hợp lệ khi tạo / sửa -> 400 tiếng Việt; MANAGER, chữ thường, rỗng, không phải chuỗi đều bị từ chối', async () => {
  const target = await makeUser(ROLES.STAFF, 'T');
  for (const bad of ['MANAGER', 'admin', 'Ttvh', '', '  ', 'SUPERUSER', 123, ['ADMIN'], {}]) {
    const c = await as('admin', 'POST', '/api/users', { hrm_code: `RL_BAD_${++seq}`, full_name: 'Giả', role: bad, password: '123456' });
    assert.equal(c.status, 400, `POST role=${JSON.stringify(bad)}`);
    assert.match(c.body.error, /Vai trò không hợp lệ/);
    const u = await as('admin', 'PUT', `/api/users/${target.id}`, { role: bad });
    assert.equal(u.status, 400, `PUT role=${JSON.stringify(bad)}`);
  }
  assert.equal(roleOf(target.id), ROLES.STAFF, 'role không đổi sau các yêu cầu bị từ chối');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE hrm_code LIKE 'RL_BAD_%'").get().n, 0);
});

test('POST /api/users tạo được cả 4 vai trò hợp lệ; không gửi role -> STAFF', async () => {
  for (const role of Object.values(ROLES)) {
    const r = await as('admin', 'POST', '/api/users', { hrm_code: `RL_NEW_${role}`, full_name: 'Giả', role, password: '123456' });
    assert.equal(r.status, 201, role);
    assert.equal(roleOf(r.body.id), role);
  }
  const d = await as('admin', 'POST', '/api/users', { hrm_code: 'RL_NEW_DEFAULT', full_name: 'Giả', password: '123456' });
  assert.equal(d.status, 201);
  assert.equal(d.body.role, ROLES.STAFF);
});

// ------------------------------------------
// 3. Chống leo thang quyền
// ------------------------------------------
test('không leo thang: TTVH/GDVH/STAFF tạo ADMIN, tự nâng quyền, đặt lại mật khẩu ADMIN, gán BCVH -> 403 và DB không đổi', async () => {
  const usersBefore = ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  for (const who of ['ttvh', 'gdvh', 'staff']) {
    const create = await as(who, 'POST', '/api/users', { hrm_code: `RL_ESC_${who}`, full_name: 'Giả', role: ROLES.ADMIN, password: '123456' });
    assert.equal(create.status, 403, `${who} tạo ADMIN`);
    const self = await as(who, 'PUT', `/api/users/${id[who]}`, { role: ROLES.ADMIN });
    assert.equal(self.status, 403, `${who} tự nâng quyền`);
    const reset = await as(who, 'PUT', `/api/users/${id.admin}/reset-password`, { password: 'hacker-123' });
    assert.equal(reset.status, 403, `${who} reset mật khẩu ADMIN`);
    const deact = await as(who, 'PUT', `/api/users/${id.admin}/deactivate`);
    assert.equal(deact.status, 403, `${who} khoá ADMIN`);
    assert.equal((await as(who, 'PUT', `/api/users/${id.gdvh}/bcvh`, { codes: ['533140'] })).status, 403, `${who} gán BCVH`);
    assert.equal(roleOf(id[who]), ACCOUNTS[who].role, `${who} vai trò giữ nguyên`);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, usersBefore, 'không tạo thêm tài khoản');
  assert.equal((await loginAs(ctx.baseUrl, ACCOUNTS.admin.hrm, PASS)).status, 200, 'mật khẩu ADMIN không bị đổi');
});

// ------------------------------------------
// 4. Hiệu lực ngay (tra DB mỗi request)
// ------------------------------------------
test('khoá tài khoản có hiệu lực ngay với token cũ (401); mở khoá thì token cũ dùng lại được', async () => {
  const u = await makeUser(ROLES.TTVH, 'LOCK');
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 200);
  assert.equal((await as('admin', 'PUT', `/api/users/${u.id}/deactivate`)).status, 200);
  for (const [method, path] of [['GET', '/api/arrivals/meta'], ['GET', '/api/dashboard/widgets'], ['PUT', '/api/users/me/password']]) {
    const r = await call(method, path, { tok: u.tok, body: {} });
    assert.equal(r.status, 401, `${method} ${path}`);
    assert.match(r.body.error, /vô hiệu hoá|không còn hoạt động/);
  }
  assert.equal((await as('admin', 'PUT', `/api/users/${u.id}/reactivate`)).status, 200);
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 200);
});

test('tài khoản không còn trong DB -> token cũ bị 401', async () => {
  const u = await makeUser(ROLES.TTVH, 'GONE');
  ctx.db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 401);
});

test('đổi vai trò có hiệu lực ngay, không cần đăng nhập lại (token vẫn mang vai trò cũ)', async () => {
  const u = await makeUser(ROLES.TTVH, 'CHG');
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 200);
  assert.equal((await call('GET', '/api/users', { tok: u.tok })).status, 403);

  assert.equal((await as('admin', 'PUT', `/api/users/${u.id}`, { role: ROLES.STAFF })).status, 200);
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 403, 'hạ xuống STAFF: mất quyền ngay');

  assert.equal((await as('admin', 'PUT', `/api/users/${u.id}`, { role: ROLES.ADMIN })).status, 200);
  assert.equal((await call('GET', '/api/users', { tok: u.tok })).status, 200, 'nâng lên ADMIN: có quyền ngay');
  assert.equal((await call('GET', '/api/arrivals/import-status', { tok: u.tok })).status, 200);

  assert.equal((await as('admin', 'PUT', `/api/users/${u.id}`, { role: ROLES.GDVH })).status, 200);
  assert.equal((await call('GET', '/api/users', { tok: u.tok })).status, 403, 'hạ khỏi ADMIN: mất quyền quản trị ngay');
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 200);
});

test('token ký role ADMIN nhưng DB là STAFF: server theo DB, không tin vai trò trong token', async () => {
  const u = await makeUser(ROLES.ADMIN, 'FAKE');
  ctx.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(ROLES.STAFF, u.id);
  assert.equal((await call('GET', '/api/users', { tok: u.tok })).status, 403);
  assert.equal((await call('GET', '/api/arrivals/meta', { tok: u.tok })).status, 403);
});

// ------------------------------------------
// 5. ADMIN cuối cùng
// ------------------------------------------
test('ADMIN cuối cùng: không tự hạ vai trò, không tự khoá mình (400); vẫn còn ADMIN hoạt động', async () => {
  // ctx có đúng 1 ADMIN hoạt động ở bài này? Không chắc (các ca trước tạo thêm) -> tự dựng DB sạch ADMIN phụ.
  const others = ctx.db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND id <> ?").all(id.admin).map((r) => r.id);
  ctx.db.prepare("UPDATE users SET deactivated_at = CURRENT_TIMESTAMP WHERE role = 'ADMIN' AND id <> ?").run(id.admin);
  try {
    assert.equal(countOtherActiveAdmins(ctx.db, id.admin), 0);
    const demote = await as('admin', 'PUT', `/api/users/${id.admin}`, { role: ROLES.TTVH });
    assert.equal(demote.status, 400);
    const lock = await as('admin', 'PUT', `/api/users/${id.admin}/deactivate`);
    assert.equal(lock.status, 400);
    assert.equal(roleOf(id.admin), ROLES.ADMIN);
    assert.equal(ctx.db.prepare('SELECT deactivated_at FROM users WHERE id = ?').get(id.admin).deactivated_at, null);
    assert.equal((await as('admin', 'GET', '/api/users')).status, 200);
  } finally {
    for (const o of others) ctx.db.prepare('UPDATE users SET deactivated_at = NULL WHERE id = ?').run(o);
  }
});

test('ADMIN hạ / khoá ADMIN khác khi còn ADMIN khác: được; hàm bảo vệ chặn đúng ADMIN hoạt động cuối cùng', async () => {
  const b = await makeUser(ROLES.ADMIN, 'B');
  // còn ADMIN khác (id.admin) -> hạ B được
  assert.equal(wouldRemoveLastAdmin(ctx.db, { id: b.id, role: ROLES.ADMIN, deactivated_at: null }), false);
  assert.equal((await as('admin', 'PUT', `/api/users/${b.id}`, { role: ROLES.TTVH })).status, 200);
  assert.equal((await as('admin', 'PUT', `/api/users/${b.id}`, { role: ROLES.ADMIN })).status, 200);
  assert.equal((await as('admin', 'PUT', `/api/users/${b.id}/deactivate`)).status, 200);
  assert.equal((await as('admin', 'PUT', `/api/users/${b.id}/reactivate`)).status, 200);

  // Hàm bảo vệ: loại tất cả ADMIN khác trong DB tạm (chỉ còn `b` hoạt động) -> hạ/khoá `b` làm mất ADMIN cuối.
  ctx.db.prepare("UPDATE users SET deactivated_at = CURRENT_TIMESTAMP WHERE role = 'ADMIN' AND id <> ?").run(b.id);
  try {
    assert.equal(wouldRemoveLastAdmin(ctx.db, { id: b.id, role: ROLES.ADMIN, deactivated_at: null }), true);
    // ADMIN đã bị khoá hoặc không phải ADMIN thì không tính là "cuối cùng"
    assert.equal(wouldRemoveLastAdmin(ctx.db, { id: b.id, role: ROLES.ADMIN, deactivated_at: '2026-01-01' }), false);
    assert.equal(wouldRemoveLastAdmin(ctx.db, { id: b.id, role: ROLES.TTVH, deactivated_at: null }), false);
  } finally {
    ctx.db.prepare("UPDATE users SET deactivated_at = NULL WHERE role = 'ADMIN'").run();
  }
});

// ------------------------------------------
// 6. user_bcvh
// ------------------------------------------
test('user_bcvh: gán, đọc lại, thay toàn bộ tập, codes rỗng hợp lệ, trùng mã được gộp', async () => {
  const g = await makeUser(ROLES.GDVH, 'ASG');
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, [], 'chưa gán = rỗng');

  const put1 = await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['533140'] });
  assert.equal(put1.status, 200);
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, ['533140']);

  const put2 = await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['537015', '535470', '537015'] });
  assert.equal(put2.status, 200);
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, ['535470', '537015'], 'thay toàn bộ, bỏ 533140, gộp trùng');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh WHERE user_id = ?').get(g.id).n, 2);

  assert.equal((await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: [] })).status, 200);
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, []);
});

test('user_bcvh: mã ngoài 6 BCVH, sai kiểu, thiếu codes -> 400 và tập cũ giữ nguyên', async () => {
  const g = await makeUser(ROLES.GDVH, 'BAD');
  await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['533140'] });
  for (const body of [{ codes: ['999999'] }, { codes: ['533140', '000000'] }, { codes: [533140] }, { codes: '533140' }, { codes: null }, {}]) {
    const r = await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, ['533140']);
});

test('user_bcvh: chỉ gán cho GDVH (TTVH/ADMIN/STAFF -> 400); tài khoản không tồn tại -> 404', async () => {
  for (const role of [ROLES.TTVH, ROLES.ADMIN, ROLES.STAFF]) {
    const u = await makeUser(role, 'NG');
    const r = await as('admin', 'PUT', `/api/users/${u.id}/bcvh`, { codes: ['533140'] });
    assert.equal(r.status, 400, role);
    assert.match(r.body.error, /GDVH/);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh WHERE user_id = ?').get(u.id).n, 0);
  }
  assert.equal((await as('admin', 'PUT', '/api/users/khong-ton-tai/bcvh', { codes: [] })).status, 404);
  assert.equal((await as('admin', 'GET', '/api/users/khong-ton-tai/bcvh')).status, 404);
});

test('user_bcvh: đổi GDVH sang vai trò khác xoá các dòng gán; đổi tên / giữ nguyên GDVH thì giữ', async () => {
  const g = await makeUser(ROLES.GDVH, 'DROP');
  await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['533140', '535790'] });
  assert.equal((await as('admin', 'PUT', `/api/users/${g.id}`, { full_name: 'Đổi tên', role: ROLES.GDVH })).status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh WHERE user_id = ?').get(g.id).n, 2, 'giữ nguyên GDVH: giữ gán');
  assert.equal((await as('admin', 'PUT', `/api/users/${g.id}`, { role: ROLES.TTVH })).status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh WHERE user_id = ?').get(g.id).n, 0, 'rời GDVH: xoá gán');
  // quay lại GDVH: không có gán cũ
  assert.equal((await as('admin', 'PUT', `/api/users/${g.id}`, { role: ROLES.GDVH })).status, 200);
  assert.deepEqual((await as('admin', 'GET', `/api/users/${g.id}/bcvh`)).body.codes, []);
});

test('user_bcvh: nhiều GDVH cùng một BCVH; khoá GDVH không xoá gán; getAssignedBcvh(userId) trả mảng mã', async () => {
  const { getAssignedBcvh } = require('../server/lib/userBcvh');
  const a = await makeUser(ROLES.GDVH, 'M1');
  const b = await makeUser(ROLES.GDVH, 'M2');
  await as('admin', 'PUT', `/api/users/${a.id}/bcvh`, { codes: ['536250'] });
  await as('admin', 'PUT', `/api/users/${b.id}/bcvh`, { codes: ['536250', '537220'] });
  assert.deepEqual(getAssignedBcvh(a.id), ['536250']);
  assert.deepEqual(getAssignedBcvh(b.id), ['536250', '537220']);
  assert.deepEqual(getAssignedBcvh('khong-ton-tai'), []);
  await as('admin', 'PUT', `/api/users/${a.id}/deactivate`);
  assert.deepEqual(getAssignedBcvh(a.id), ['536250'], 'khoá tài khoản không xoá gán');
});

test('GET /api/users trả bcvh_codes (mảng; rỗng nếu không có) và không lộ password_hash', async () => {
  const g = await makeUser(ROLES.GDVH, 'LST');
  await as('admin', 'PUT', `/api/users/${g.id}/bcvh`, { codes: ['537015', '533140'] });
  const { status, body } = await as('admin', 'GET', '/api/users');
  assert.equal(status, 200);
  const row = body.find((u) => u.id === g.id);
  assert.deepEqual(row.bcvh_codes, ['533140', '537015']);
  for (const u of body) {
    assert.ok(Array.isArray(u.bcvh_codes), `bcvh_codes là mảng cho ${u.role}`);
    assert.ok(!('password_hash' in u));
  }
  assert.deepEqual(body.find((u) => u.id === id.admin).bcvh_codes, []);
});

test('bảng user_bcvh có đúng cột / khoá chính; tạo lại bảng (idempotent) không lỗi, không mất dữ liệu', async () => {
  const { ensureUserBcvhSchema } = require('../server/lib/userBcvh');
  const cols = ctx.db.prepare('PRAGMA table_info(user_bcvh)').all();
  assert.deepEqual(cols.map((c) => c.name), ['user_id', 'bcvh_code', 'created_at']);
  assert.deepEqual(cols.filter((c) => c.pk).map((c) => c.name).sort(), ['bcvh_code', 'user_id']);
  assert.equal(cols.find((c) => c.name === 'user_id').notnull, 1);
  assert.equal(cols.find((c) => c.name === 'bcvh_code').notnull, 1);
  const before = ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh').get().n;
  ensureUserBcvhSchema(ctx.db);
  ensureUserBcvhSchema(ctx.db);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM user_bcvh').get().n, before);
  assert.throws(() => ctx.db.prepare('INSERT INTO user_bcvh (user_id, bcvh_code) VALUES (?, ?)').run('khong-co-user', '533140'), /FOREIGN KEY/);
});
