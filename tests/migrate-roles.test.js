// ==========================================
// Test: scripts/migrate-roles.js (SANLUONG-3c-2, 04_DECISIONS.md #49) — chuyển MANAGER -> TTVH.
// Chạy trên DB TẠM (thư mục tạm, xoá khi xong), tài khoản GIẢ. Không đụng data/hue-dhcl.db.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { migrateRoles, EXIT_OK, EXIT_ERROR, EXIT_UNKNOWN_ROLE } = require('../scripts/migrate-roles');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'migrate-roles.js');
let dir;
let dbPath;
let seq = 0;

before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-migrate-roles-')); });
after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// DB tạm mới cho mỗi ca: bảng users tối thiểu + các tài khoản giả theo danh sách role.
function makeDb(roles) {
  dbPath = path.join(dir, `t${++seq}.db`);
  const db = new Database(dbPath);
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, hrm_code TEXT, full_name TEXT NOT NULL, role TEXT, password_hash TEXT)');
  const ins = db.prepare('INSERT INTO users (id, hrm_code, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)');
  roles.forEach((r, i) => ins.run(`id${i}`, `HRMGIA${i}`, `Họ Tên Giả ${i}`, r, 'salt:hashgia'));
  db.close();
  return dbPath;
}
const rolesOf = (p) => {
  const db = new Database(p, { readonly: true });
  try { return db.prepare('SELECT id, role FROM users ORDER BY id').all().map((r) => r.role); } finally { db.close(); }
};
const backups = () => fs.readdirSync(dir).filter((f) => f.includes('.bak'));
const run = (opts) => { const lines = []; return migrateRoles({ dbPath, ...opts, log: (l) => lines.push(l) }).then((res) => ({ ...res, lines })); };

beforeEach(() => { for (const f of backups()) fs.unlinkSync(path.join(dir, f)); });

test('dry-run (mặc định): không đổi gì, không sao lưu; in số tài khoản theo role và số sẽ đổi', async () => {
  makeDb(['ADMIN', 'MANAGER', 'MANAGER', 'STAFF', 'GDVH', 'TTVH']);
  const before_ = rolesOf(dbPath);
  const res = await run({});
  assert.equal(res.exitCode, EXIT_OK);
  assert.equal(res.changed, 0);
  assert.equal(res.wouldChange, 2);
  assert.deepEqual(rolesOf(dbPath), before_, 'không đổi dữ liệu');
  assert.equal(backups().length, 0, 'dry-run không sao lưu');
  const out = res.lines.join('\n');
  assert.match(out, /"MANAGER": 2/);
  assert.match(out, /"ADMIN": 1/);
  assert.match(out, /MANAGER -> TTVH: 2/);
  assert.match(out, /dry-run/);
});

test('dry-run / apply không in họ tên, mã HRM hay hash', async () => {
  makeDb(['ADMIN', 'MANAGER']);
  for (const apply of [false, true]) {
    const out = (await run({ apply })).lines.join('\n');
    assert.ok(!/HRMGIA|Họ Tên Giả|hashgia|salt:/.test(out), `apply=${apply}`);
  }
});

test('--apply: sao lưu (cùng thư mục, có dấu thời gian) rồi MANAGER -> TTVH; role khác giữ nguyên', async () => {
  makeDb(['ADMIN', 'MANAGER', 'STAFF', 'MANAGER', 'GDVH', 'TTVH']);
  const res = await run({ apply: true, now: new Date(2026, 9, 9, 14, 5, 7) });
  assert.equal(res.exitCode, EXIT_OK);
  assert.equal(res.changed, 2);
  assert.deepEqual(rolesOf(dbPath), ['ADMIN', 'TTVH', 'STAFF', 'TTVH', 'GDVH', 'TTVH']);
  assert.equal(backups().length, 1);
  assert.equal(path.basename(res.backupPath), `${path.basename(dbPath)}.20261009-140507.bak`);
  assert.equal(path.dirname(res.backupPath), path.dirname(dbPath));
  assert.deepEqual(rolesOf(res.backupPath), ['ADMIN', 'MANAGER', 'STAFF', 'MANAGER', 'GDVH', 'TTVH'], 'bản sao lưu giữ dữ liệu TRƯỚC khi đổi');
});

test('idempotent: chạy --apply lần hai không đổi gì và không tạo thêm bản sao lưu', async () => {
  makeDb(['ADMIN', 'MANAGER']);
  await run({ apply: true });
  const after1 = rolesOf(dbPath);
  fs.readdirSync(dir).filter((f) => f.includes('.bak')).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  const res = await run({ apply: true });
  assert.equal(res.exitCode, EXIT_OK);
  assert.equal(res.changed, 0);
  assert.deepEqual(rolesOf(dbPath), after1);
  assert.equal(backups().length, 0, 'không có gì đổi thì không sao lưu');
  assert.match(res.lines.join('\n'), /Không có gì để đổi/);
});

test('role lạ (kể cả rỗng / chữ thường): dừng với mã lỗi, KHÔNG đổi gì (kể cả MANAGER), không sao lưu; in số lượng', async () => {
  makeDb(['MANAGER', 'ADMIN', 'SUPERUSER', 'admin', '', null, 'SUPERUSER']);
  const before_ = rolesOf(dbPath);
  for (const apply of [false, true]) {
    const res = await run({ apply });
    assert.equal(res.exitCode, EXIT_UNKNOWN_ROLE, `apply=${apply}`);
    assert.equal(res.changed, 0);
    assert.deepEqual(rolesOf(dbPath), before_, 'dữ liệu nguyên vẹn');
    assert.equal(backups().length, 0);
    const out = res.lines.join('\n');
    assert.match(out, /"SUPERUSER": 2/);
    assert.match(out, /"admin": 1/);
    assert.match(out, /\(trống\): 2/);
  }
});

test('DB không tồn tại / không có bảng users -> mã lỗi 1, không tạo file', async () => {
  dbPath = path.join(dir, 'khong-co.db');
  const r1 = await run({});
  assert.equal(r1.exitCode, EXIT_ERROR);
  assert.ok(!fs.existsSync(dbPath), 'không tự tạo DB rỗng');
  dbPath = path.join(dir, `empty${++seq}.db`);
  new Database(dbPath).close();
  assert.equal((await run({})).exitCode, EXIT_ERROR);
});

test('dòng lệnh: dry-run mặc định (mã 0, không đổi), --apply đổi, role lạ -> mã 2; --db nhận đường dẫn', () => {
  makeDb(['MANAGER', 'STAFF']);
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, '--db', dbPath, ...args], { encoding: 'utf8' });

  const dry = cli();
  assert.equal(dry.status, 0);
  assert.deepEqual(rolesOf(dbPath), ['MANAGER', 'STAFF']);
  assert.match(dry.stdout, /dry-run/);

  const ap = cli('--apply');
  assert.equal(ap.status, 0);
  assert.deepEqual(rolesOf(dbPath), ['TTVH', 'STAFF']);
  assert.equal(backups().length, 1);

  makeDb(['MANAGER', 'KHAC']);
  const bad = cli('--apply');
  assert.equal(bad.status, 2);
  assert.deepEqual(rolesOf(dbPath), ['MANAGER', 'KHAC']);

  assert.equal(spawnSync(process.execPath, [SCRIPT, '--khong-co'], { encoding: 'utf8' }).status, 1);
});
