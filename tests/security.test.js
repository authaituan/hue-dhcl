// ==========================================
// Test: lớp bảo mật (server/security.js + phần gắn vào server/index.js)
//   - Lọc IP theo CMS_ALLOWED_IPS, IP bị chặn nhận 404 (trang HTML / JSON).
//   - X-Forwarded-For chỉ được tin khi đến từ TRUSTED_PROXIES; không giả được.
//   - Mọi /api/* (trừ đăng nhập) bắt buộc token, kể cả route đọc.
//   - Header bảo mật, không có CORS, không lộ X-Powered-By.
//   - Trần đăng nhập sai theo IP (dò nhiều tài khoản từ 1 máy).
//   - Nhật ký bảo mật ghi IP bị chặn / đăng nhập, không ghi mật khẩu.
// Mô phỏng máy khách ở IP khác bằng cách coi 127.0.0.1 là proxy tin cậy rồi
// gửi X-Forwarded-For — đúng như khi chạy sau reverse proxy thật.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_FILE = path.join(os.tmpdir(), `dhcl-security-test-${process.pid}-${Date.now()}.log`);
process.env.CMS_ALLOWED_IPS = '10.0.0.5,10.0.0.6,10.0.1.0/24';
process.env.TRUSTED_PROXIES = '127.0.0.1,::1';
process.env.SECURITY_LOG = LOG_FILE;
process.env.LOGIN_IP_MAX_FAILS = '3';

const { startTestServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, seedMinimalOrg } = require('./helpers/fixtures');
const { parseIpList, clientIp } = require('../server/security');

const PORT = 5907;
const HRM = 'SEC_MGR';
const PASS = 'Manager@123';

let ctx;
let token;

function req(pathname, { ip, method = 'GET', headers = {}, body } = {}) {
  const h = { ...headers };
  if (ip) h['X-Forwarded-For'] = ip;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return fetch(`${ctx.baseUrl}${pathname}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

const login = (ip, hrm_code, password) =>
  req('/api/auth/login', { ip, method: 'POST', body: { hrm_code, password } });

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-security-${Date.now()}.db` });
  // waitForServer gọi từ 127.0.0.1 không kèm XFF -> bị chặn (404) nhưng vẫn là
  // phản hồi hợp lệ, đủ để biết server đã lắng nghe.
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${ctx.baseUrl}/`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  seedMinimalOrg(ctx.db);
  seedUser(ctx.db, { hrmCode: HRM, fullName: 'Security Manager', role: 'ADMIN', password: PASS });
  const res = await login('10.0.0.5', HRM, PASS);
  assert.equal(res.status, 200);
  token = (await res.json()).token;
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  try { fs.unlinkSync(LOG_FILE); } catch (e) { /* bỏ qua */ }
});

test('parseIpList: IP đơn, CIDR, IPv6; mục sai cú pháp -> lỗi ngay', () => {
  const match = parseIpList('10.47.33.15, 10.47.31.0/24, ::1');
  assert.equal(match('10.47.33.15'), true);
  assert.equal(match('10.47.33.16'), false);
  assert.equal(match('10.47.31.200'), true);
  assert.equal(match('10.47.32.1'), false);
  assert.equal(match('::1'), true);
  for (const bad of ['10.47.33', '10.47.33.0/33', '10.47.33.0/abc', 'may-chu', '300.1.1.1']) {
    assert.throws(() => parseIpList(bad), /không hợp lệ/, bad);
  }
});

test('clientIp: không có proxy tin cậy thì bỏ qua X-Forwarded-For', () => {
  const fake = { socket: { remoteAddress: '::ffff:10.47.33.9' }, headers: { 'x-forwarded-for': '10.0.0.5' } };
  assert.equal(clientIp(fake, null), '10.47.33.9');
  assert.equal(clientIp(fake, parseIpList('10.47.33.9')), '10.0.0.5');
});

test('IP không được phép: trình duyệt nhận trang 404, không lộ giao diện', async () => {
  const res = await req('/', { ip: '10.0.0.9', headers: { Accept: 'text/html' } });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /style-src 'sha256-/);
  const html = await res.text();
  assert.match(html, /Không tìm thấy trang/);
  assert.ok(!/<script/i.test(html), 'trang 404 không có script');
});

test('IP không được phép: API (kể cả đăng nhập đúng mật khẩu) nhận 404 JSON', async () => {
  const res = await login('10.0.0.9', HRM, PASS);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
  const withToken = await req('/api/dashboard/stats', { ip: '10.0.0.9', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(withToken.status, 404, 'có token hợp lệ nhưng sai IP vẫn bị chặn');
});

test('Đã đặt danh sách IP thì 127.0.0.1 (không qua proxy) cũng không còn mặc định được vào', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hrm_code: HRM, password: PASS })
  });
  assert.equal(res.status, 404);
});

test('Dải CIDR được phép hoạt động', async () => {
  const res = await req('/api/dashboard/stats', { ip: '10.0.1.77', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
});

test('Không giả được IP bằng X-Forwarded-For: chỉ địa chỉ do proxy ghi (bên phải) được tính', async () => {
  // Máy 10.0.0.9 tự ghi "10.0.0.5" vào header, proxy nối IP thật vào cuối.
  const spoof = await req('/api/dashboard/stats', { ip: '10.0.0.5, 10.0.0.9', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(spoof.status, 404);
  // Ngược lại: máy thật 10.0.0.5, phía trước là rác máy khách tự ghi -> vẫn vào được.
  const real = await req('/api/dashboard/stats', { ip: 'rac, 10.0.0.5', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(real.status, 200);
});

test('Mọi API đọc (trước đây mở) giờ bắt buộc token', async () => {
  const routes = [
    '/api/dashboard/stats',
    '/api/dashboard/widgets',
    '/api/dashboard/widgets-data',
    '/api/organization/communes',
    '/api/organization/post-offices',
    '/api/route-chua-ton-tai'
  ];
  for (const r of routes) {
    const res = await req(r, { ip: '10.0.0.5' });
    assert.equal(res.status, 401, r);
  }
  for (const r of routes.slice(0, 5)) {
    const res = await req(r, { ip: '10.0.0.5', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200, r);
  }
});

test('Route API không tồn tại (đã đăng nhập) -> 404 JSON', async () => {
  const res = await req('/api/route-chua-ton-tai', { ip: '10.0.0.5', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('Header bảo mật có mặt; không CORS; không X-Powered-By', async () => {
  const res = await req('/api/organization/communes', {
    ip: '10.0.0.5',
    headers: { Authorization: `Bearer ${token}`, Origin: 'http://trang-la.example' }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('Trần đăng nhập sai theo IP: dò nhiều tài khoản từ 1 máy bị chặn, máy khác không ảnh hưởng', async () => {
  for (const acc of ['KHONG_CO_1', 'KHONG_CO_2', 'KHONG_CO_3']) {
    assert.equal((await login('10.0.0.6', acc, 'sai')).status, 401);
  }
  const blocked = await login('10.0.0.6', HRM, PASS);
  assert.equal(blocked.status, 429, 'đúng mật khẩu vẫn bị chặn khi IP đã vượt trần');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await login('10.0.0.5', HRM, PASS)).status, 200);
});

test('Nhật ký bảo mật: ghi IP bị chặn và đăng nhập, không ghi mật khẩu/token', async () => {
  await new Promise((r) => setTimeout(r, 200)); // appendFile bất đồng bộ
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.event === 'ip_denied' && l.ip === '10.0.0.9'));
  assert.ok(lines.some((l) => l.event === 'login_ok' && l.ip === '10.0.0.5' && l.hrm_code === HRM));
  assert.ok(lines.some((l) => l.event === 'login_fail' && l.ip === '10.0.0.6'));
  assert.ok(lines.some((l) => l.event === 'login_limited' && l.scope === 'ip'));
  // Chặn lặp lại từ cùng IP trong 1 phút chỉ ghi 1 dòng
  assert.equal(lines.filter((l) => l.event === 'ip_denied' && l.ip === '10.0.0.9').length, 1);
  const raw = fs.readFileSync(LOG_FILE, 'utf8');
  assert.ok(!raw.includes(PASS), 'không ghi mật khẩu');
  assert.ok(!raw.includes(token), 'không ghi token');
});

test('buildNotFound: file CRLF vẫn cho cùng mã băm CSP như bản LF', () => {
  const { buildNotFound } = require('../server/security');
  const lf = fs.readFileSync(path.join(__dirname, '..', 'server', 'pages', '404.html'), 'utf8').replace(/\r\n/g, '\n');
  const a = buildNotFound(lf);
  const b = buildNotFound(lf.replace(/\n/g, '\r\n'));
  assert.match(a.csp, /style-src 'sha256-/);
  assert.equal(b.csp, a.csp);
  assert.equal(b.html, a.html, 'trang gửi đi luôn là LF');
});

test('đăng nhập: body > 10kb bị từ chối (413), chưa token thì không tới được parser 50mb', async () => {
  const res = await req('/api/auth/login', {
    ip: '10.0.0.5', method: 'POST', body: { hrm_code: 'x', password: 'y'.repeat(20000) }
  });
  assert.equal(res.status, 413);
});

test('thiếu JWT_SECRET: server/auth.js từ chối nạp, trừ khi ALLOW_INSECURE_DEV=1', () => {
  const { spawnSync } = require('child_process');
  const authPath = path.join(__dirname, '..', 'server', 'auth.js');
  const run = (env) => spawnSync(process.execPath, ['-e', `require(${JSON.stringify(authPath)})`], {
    env: { ...process.env, JWT_SECRET: '', ALLOW_INSECURE_DEV: '', ...env }, encoding: 'utf8'
  });
  const bad = run({});
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Thiếu JWT_SECRET/);
  assert.equal(run({ ALLOW_INSECURE_DEV: '1' }).status, 0);
});
