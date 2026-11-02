// ==========================================
// Test KTT-ROLE-1: vai trò TTKT (docs/ai/04_DECISIONS.md #123): CHỈ module «Hàng tại Khai thác tỉnh» (GET /api/ktt/**) + GET /api/auth/me + PUT /api/users/me/password;
// mọi nhóm API khác 403 (allowlist theo vai trò, từ chối mặc định, server/lib/allowlistVaiTro.js); chống lách đường dẫn; quyền đổi ngay khi đổi vai trò trong DB;
// token hạn 8 giờ. Server thật trên DB tạm của harness, tài khoản và dữ liệu GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const Api = require('../server/lib/kttApi');
const { chuanHoaDuongDan, vaiTroAllows } = require('../server/lib/allowlistVaiTro');

const PORT = 5890;
const Q = '?tu=2026-10-20&den=2026-10-22';
const USERS = {
  admin: { hrm: 'TK_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttkt: { hrm: 'TK_TTKT', pass: 'Ttkt@123', role: 'TTKT' },
  tivi: { hrm: 'TK_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const ids = {};
let ctx; let db; let khoiPhuc;

before(async () => {
  khoiPhuc = cachLySftpEnv();
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ttkt-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Api.dongNen();
  khoiPhuc();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});

async function goi(method, url, who, body) {
  const headers = who ? { Authorization: `Bearer ${tokens[who] || who}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ctx.baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) await res.json().catch(() => null); else await res.arrayBuffer();
  return res.status;
}
// Gửi đường dẫn NGUYÊN VĂN (fetch / WHATWG URL tự rút gọn '..' và '%2e' trước khi gửi nên không dùng được cho ca lách).
function goiTho(rawPath, who) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method: 'GET', path: rawPath, headers: { Authorization: `Bearer ${tokens[who]}` } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode + (String(res.headers['content-type'] || '').includes('json') ? ' json' : '')));
    });
    req.on('error', reject);
    req.end();
  });
}
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

test('TTKT 200: mẫu route KTT (meta, luu-thoat, doi-chieu/tong-hop, xuat, do-phu), GET /api/auth/me', async () => {
  for (const url of ['/api/ktt/meta', `/api/ktt/luu-thoat${Q}`, `/api/ktt/doi-chieu/tong-hop${Q}`, `/api/ktt/xuat/luu-thoat${Q}`, `/api/ktt/doi-chieu/do-phu${Q}`]) {
    assert.equal(await goi('GET', url, 'ttkt'), 200, url);
  }
  assert.equal(await goi('GET', '/api/auth/me', 'ttkt'), 200);
  const res = await fetch(`${ctx.baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.ttkt}` } });
  assert.equal((await res.json()).role, 'TTKT');
});

test('TTKT tự đổi mật khẩu được (đăng nhập lại bằng mật khẩu mới)', async () => {
  const sai = await goi('PUT', '/api/users/me/password', 'ttkt', { currentPassword: 'sai-mat-khau', newPassword: 'Moi@123456' });
  assert.equal(sai, 400, 'qua cổng quyền, mật khẩu hiện tại sai -> 400');
  assert.equal(await goi('PUT', '/api/users/me/password', 'ttkt', { currentPassword: USERS.ttkt.pass, newPassword: 'Moi@123456' }), 200);
  assert.equal((await loginAs(ctx.baseUrl, USERS.ttkt.hrm, 'Moi@123456')).status, 200);
  assert.equal((await loginAs(ctx.baseUrl, USERS.ttkt.hrm, USERS.ttkt.pass)).status, 401);
});

test('TTKT 403: mọi nhóm API ngoài KTT (sản lượng, quỹ thời gian, phát, nạp nguồn, tham số, người dùng, mạng lưới, dashboard, tổ chức)', async () => {
  const cac = [
    ['GET', '/api/arrivals/meta'], ['GET', `/api/arrivals/summary${Q}`], ['GET', '/api/arrivals/dashboard/tong-quan-den'], ['GET', '/api/arrivals/items'],
    ['GET', `/api/quy-thoi-gian/tong-quan${Q}`], ['GET', '/api/quy-thoi-gian/meta'],
    ['GET', '/api/phat/template'], ['GET', '/api/phat/drafts'], ['POST', '/api/phat/drafts'],
    ['GET', '/api/nap-nguon/tong-quan'], ['GET', '/api/nap-nguon/ktt/trang-thai'],
    ['GET', '/api/tham-so'], ['PUT', '/api/tham-so'], ['GET', '/api/tham-so/khong-co'],
    ['GET', '/api/users'], ['POST', '/api/users'], ['GET', '/api/users/search?q=a'], ['PUT', `/api/users/${ids.ttkt}`],
    ['GET', '/api/network'], ['GET', '/api/network/export-data'], ['POST', '/api/network/import'],
    ['GET', '/api/dashboard/widgets'], ['GET', '/api/dashboard/widgets-data'], ['GET', '/api/dashboard/stats'],
    ['GET', '/api/organization/communes'], ['GET', '/api/organization/post-offices'], ['GET', '/api/organization/khong-co'],
    ['GET', '/api/khong-co-route-nay']
  ];
  for (const [m, url] of cac) assert.equal(await goi(m, url, 'ttkt', m === 'GET' ? undefined : {}), 403, `${m} ${url}`);
  assert.equal(await goi('GET', '/api/ktt/meta'), 401, 'không token vẫn 401');
});

test('TTKT chỉ GET trên /api/ktt/*: POST / PUT / DELETE / PATCH bị từ chối 403 (ADMIN POST: 404, không có route)', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    for (const url of ['/api/ktt/meta', `/api/ktt/luu-thoat${Q}`, '/api/ktt/xuat/luu-thoat']) {
      assert.equal(await goi(m, url, 'ttkt', m === 'DELETE' ? undefined : {}), 403, `${m} ${url}`);
    }
  }
  assert.equal(await goi('POST', '/api/ktt/meta', 'admin', {}), 404);
});

test('đường dẫn lách không mở thêm quyền: .., //, %2e, %2f, mã hóa kép, chữ hoa, tiền tố gần giống, dấu / cuối', async () => {
  const bi403 = [
    '/api/ktt/../users', '/api/ktt/%2e%2e/users', '/api/ktt/%2E%2E/users', '/api/ktt/..%2fusers', '/api/ktt/%2e%2e%2fusers',
    '/api/ktt/%252e%252e/users', '/api/ktt/../network', '/api/ktt/./../arrivals/meta', '/api/ktt/..%5cusers',
    '/api/KTT', '/api/kttx', '/api/kttx/meta', '/api/ktt', '/api/ktt%00/meta', '/api/users/../ktt/../users',
    '/api/ktt/meta/../../users', '/api/%6bttx', '/api/kt%74x/meta'
  ];
  for (const p of bi403) {
    const st = await goiTho(p, 'ttkt');
    assert.equal(st, '403 json', `${p} -> ${st}`);
  }
  // '//api/ktt...' nằm NGOÀI mount /api: Express không chạy authRequired và không có dữ liệu JSON (chỉ trang tĩnh của giao diện hoặc 404), không lộ API.
  for (const p of ['//api/ktt', '//api/ktt/meta', '//api/users']) assert.ok(!(await goiTho(p, 'ttkt')).includes('json'), p);
  // Cùng quyền (không rộng hơn): chữ hoa / dấu / cuối / mã hóa chỉ đi tới chính route KTT hợp lệ.
  for (const p of ['/api/KTT/meta', '/api/ktt/meta/', `/api/ktt/luu-thoat${Q}`]) {
    assert.equal(await goiTho(p, 'ttkt'), '200 json', p);
  }
  assert.equal(await goiTho('/api/ktt/%6deta', 'ttkt'), '404 json', 'qua allowlist (cùng tiền tố KTT), Express không khớp route -> 404, không phải dữ liệu');
  // Hàm chuẩn hoá thuần.
  assert.equal(chuanHoaDuongDan('/api/ktt/../users?x=1'), '/api/users');
  assert.equal(chuanHoaDuongDan('/api/ktt/%252e'), null);
  assert.equal(vaiTroAllows('TTKT', { method: 'GET', originalUrl: '/api/kttx' }), false);
  assert.equal(vaiTroAllows('TTKT', { method: 'HEAD', originalUrl: '/api/ktt/meta' }), false);
  assert.equal(vaiTroAllows('TTKT', { method: 'GET', originalUrl: '/api/ktt/meta' }), true);
  assert.equal(vaiTroAllows('ADMIN', { method: 'DELETE', originalUrl: '/api/users' }), true, 'vai trò không có allowlist: lớp này không chặn');
});

test('đổi vai trò trong DB: quyền đổi ngay với token cũ (server tra DB mỗi lần)', async () => {
  const tok = tokens.ttkt; // token không gắn mật khẩu, vẫn dùng được sau khi đổi mật khẩu
  const dat = (role) => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, ids.ttkt);
  try {
    assert.equal(await goi('GET', '/api/ktt/meta', tok), 200);
    dat('GDVH');
    assert.equal(await goi('GET', '/api/ktt/meta', tok), 403, 'GDVH không vào KTT');
    assert.equal(await goi('GET', '/api/arrivals/meta', tok), 200, 'GDVH vào được Sản lượng: TTKT không còn bị allowlist chặn');
    dat('ADMIN');
    assert.equal(await goi('GET', '/api/users', tok), 200);
    dat('TTKT');
    assert.equal(await goi('GET', '/api/users', tok), 403, 'về TTKT: mất quyền ngay');
    assert.equal(await goi('GET', '/api/ktt/meta', tok), 200);
    dat('MANAGER');
    assert.equal(await goi('GET', '/api/ktt/meta', tok), 403, 'vai trò lạ vẫn 403');
  } finally {
    dat('TTKT');
  }
});

test('token TTKT hạn 8 giờ (như ADMIN), không có claim TIVI; token TIVI vẫn 90 ngày', () => {
  const t = payloadOf(tokens.ttkt);
  assert.equal(t.exp - t.iat, 8 * 3600);
  assert.equal(t.role, 'TTKT');
  assert.ok(!('tivi' in t) && !('pwd' in t));
  const a = payloadOf(tokens.admin);
  assert.equal(a.exp - a.iat, 8 * 3600);
  const v = payloadOf(tokens.tivi);
  assert.equal(v.exp - v.iat, 90 * 24 * 3600);
});

test('TTKT không cần gán BCVH; tạo qua POST /api/users (ADMIN) được, tivi_scope bị từ chối', async () => {
  const gui = (body) => fetch(`${ctx.baseUrl}/api/users`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const c = await gui({ hrm_code: 'TK_NEW', full_name: 'Giả', role: 'TTKT', password: '123456' });
  assert.equal(c.status, 201);
  assert.equal((await c.json()).role, 'TTKT');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_bcvh WHERE user_id IN (SELECT id FROM users WHERE hrm_code = 'TK_NEW')").get().n, 0);
  assert.equal((await gui({ hrm_code: 'TK_NEW2', full_name: 'Giả', role: 'TTKT', password: '123456', tivi_scope: 'all' })).status, 400);
});
