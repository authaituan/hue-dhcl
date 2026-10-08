// ==========================================
// Test: GET /api/dashboard/stats (server/routes/dashboard.js) — số đếm mạng lưới +
// chặn chưa đăng nhập / IP không hợp lệ.
// ==========================================
'use strict';
process.env.CMS_ALLOWED_IPS = '10.0.0.5';
process.env.TRUSTED_PROXIES = '127.0.0.1,::1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedMinimalOrg, seedUser, uid } = require('./helpers/fixtures');

const PORT = 5909;
const OK_IP = '10.0.0.5';
const HRM = 'DASH_STAFF';
const PASS = 'Staff@123';

let ctx;
let org;
let token;

function getStats(t = token, ip = OK_IP) {
  const headers = { 'X-Forwarded-For': ip };
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch(`${ctx.baseUrl}/api/dashboard/stats`, { headers });
}

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dashboard-${Date.now()}.db` });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${ctx.baseUrl}/`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  // STAFF cũng đọc được dashboard (chỉ cần đăng nhập)
  seedUser(ctx.db, { hrmCode: HRM, fullName: 'Dash Staff', role: 'STAFF', password: PASS });
  const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': OK_IP },
    body: JSON.stringify({ hrm_code: HRM, password: PASS })
  });
  assert.equal(res.status, 200);
  token = (await res.json()).token;
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});

test('chưa đăng nhập -> 401; IP không hợp lệ -> 404 (không lộ hệ thống)', async () => {
  assert.equal((await getStats(null)).status, 401);
  const blocked = await getStats(token, '10.0.0.9');
  assert.equal(blocked.status, 404);
  assert.equal((await getStats()).status, 200);
});

test('DB trống: summary chỉ gồm số đếm mạng lưới, đều = 0', async () => {
  const s = await (await getStats()).json();
  assert.deepEqual(s, { summary: { totalCommunes: 0, totalPostOffices: 0 } });
});

test('đếm đúng BĐX và bưu cục', async () => {
  org = seedMinimalOrg(ctx.db);
  ctx.db.prepare('INSERT INTO post_offices (id, code, name, commune_id) VALUES (?, ?, ?, ?)').run(uid(), 'DASHPO2', 'Bưu cục Hai', org.communeId);

  const s = await (await getStats()).json();
  assert.equal(s.summary.totalCommunes, 1);
  assert.equal(s.summary.totalPostOffices, 2);
});
