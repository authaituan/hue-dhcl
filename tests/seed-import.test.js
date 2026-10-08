// ==========================================
// Test: scripts/import-seed.js — nạp tài khoản + mạng lưới từ DB hệ thống cũ.
// Dùng 2 DB tạm: đích tạo bằng CHÍNH server/db.js (tiến trình con, chuyển hướng đường dẫn DB),
// nguồn giả lập DB cũ (thêm bảng/cột lạ, users có/không mật khẩu, chế độ WAL).
// Không in password_hash: so sánh bằng assert.ok(a === b) thay vì assert.equal.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const ROOT = path.join(__dirname, '..');
const { hashPassword, verifyPassword } = require(path.join(ROOT, 'server', 'auth.js'));
const { importSeed, formatReport, SeedError } = require(path.join(ROOT, 'scripts', 'import-seed.js'));

const PASS_ADMIN = 'Admin@123';
const PASS_STAFF = 'Staff@123';
let workDir;
let hashes;

// Tạo DB đích đúng schema mới bằng server/db.js thật, trong tiến trình con.
function createTarget(file) {
  const bs3 = require.resolve('better-sqlite3', { paths: [ROOT] });
  const code = `
    const real = require(${JSON.stringify(bs3)});
    function Patched(_p, o) { return new real(${JSON.stringify(file)}, o); }
    Patched.prototype = real.prototype;
    require.cache[${JSON.stringify(bs3)}].exports = Patched;
    require(${JSON.stringify(path.join(ROOT, 'server', 'db.js'))}).close();
  `;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return file;
}

// DB nguồn kiểu hệ thống cũ: post_offices có cột lạ legacy_note và THIẾU cột phone; có bảng lạ.
function createSource(file, { brokenFk = false, wal = true } = {}) {
  const db = new Database(file);
  if (wal) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE commune_post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, central_commune_code TEXT,
      province_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(province_id) REFERENCES province_post_offices(id));
    CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT DEFAULT 'GD3', address TEXT,
      commune_id TEXT NOT NULL, legacy_note TEXT, responsible_user_id TEXT, operational_status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(commune_id) REFERENCES commune_post_offices(id));
    CREATE TABLE users (id TEXT PRIMARY KEY, hrm_code TEXT UNIQUE, full_name TEXT NOT NULL, raw_name TEXT, post_office_code TEXT,
      commune_code TEXT, post_office_id TEXT, role TEXT DEFAULT 'STAFF', password_hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deactivated_at DATETIME DEFAULT NULL, FOREIGN KEY(post_office_id) REFERENCES post_offices(id));
    CREATE TABLE bang_la (id TEXT PRIMARY KEY, note TEXT);
    CREATE TABLE dashboard_widgets (id TEXT PRIMARY KEY, kind TEXT, title TEXT, position INTEGER);
    INSERT INTO bang_la VALUES ('x', 'không được sao');
    INSERT INTO dashboard_widgets VALUES ('w1', 'CHART', 'O_CUA_NGUON', 1);
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '53', 'BĐ Huế');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', 'BDX1', 'BĐX Một', 'p1'), ('c2', 'BDX2', 'BĐX Hai', '${brokenFk ? 'khong-co' : 'p1'}');
    INSERT INTO post_offices (id, code, name, commune_id, legacy_note, responsible_user_id) VALUES
      ('po1', 'MBC1', 'Bưu cục Một', 'c1', 'ghi chú cũ', 'u3'),
      ('po2', 'MBC2', 'Bưu cục Hai', 'c2', NULL, NULL),
      ('po3', 'MBC3', 'Bưu cục Ba', 'c2', NULL, NULL);
  `);
  const ins = db.prepare('INSERT INTO users (id, hrm_code, full_name, role, password_hash, post_office_id, deactivated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run('u1', 'ADMIN01', 'Quản Trị', 'ADMIN', hashes.admin, 'po1', null);
  ins.run('u2', 'STAFF01', 'Nhân Viên Khoá', 'STAFF', hashes.staff, null, '2026-01-01 00:00:00');
  ins.run('u3', 'PT01', 'Người Phụ Trách', 'STAFF', null, null, null);
  db.close();
  return file;
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
// Ảnh chụp thư mục nguồn: tên file + băm + mtime từng file.
function snapshotDir(dir) {
  return fs.readdirSync(dir).sort().map((n) => {
    const f = path.join(dir, n);
    return `${n}:${sha(f)}:${fs.statSync(f).mtimeMs}`;
  });
}
const count = (file, table) => {
  const db = new Database(file, { readonly: true });
  try { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; } finally { db.close(); }
};

function freshPair(name, srcOpts) {
  const dir = path.join(workDir, name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return {
    srcDir: path.join(dir, 'src'),
    src: createSource(path.join(dir, 'src', 'old.db'), srcOpts),
    dst: createTarget(path.join(dir, 'hue-dhcl.db'))
  };
}

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-seed-test-'));
  hashes = { admin: hashPassword(PASS_ADMIN), staff: hashPassword(PASS_STAFF) };
});

after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
  // server/db.js (gọi trong createTarget) tự tạo thư mục data/ — xoá nếu vẫn rỗng (rmdirSync không xoá thư mục có file).
  try { fs.rmdirSync(path.join(ROOT, 'data')); } catch (e) { /* không có hoặc không rỗng: giữ nguyên */ }
});

test('nạp đúng 4 bảng, giữ nguyên id + password_hash, giao tập cột, không sao bảng khác; không ghi vào nguồn', () => {
  const { src, srcDir, dst } = freshPair('ok');
  const before = snapshotDir(srcDir);

  const r = importSeed({ sourcePath: src, targetPath: dst });

  assert.deepEqual(snapshotDir(srcDir), before, 'thư mục nguồn không đổi (không file mới, băm + mtime giữ nguyên)');
  assert.deepEqual(r.counts, { province_post_offices: 1, commune_post_offices: 2, post_offices: 3, users: 3 });

  const po = r.columns.find((c) => c.table === 'post_offices');
  assert.ok(po.dropped.includes('legacy_note'), 'cột chỉ có ở nguồn bị bỏ');
  assert.ok(po.defaulted.includes('phone') && po.defaulted.includes('latitude'), 'cột chỉ có ở đích để mặc định');
  assert.deepEqual(r.columns.find((c) => c.table === 'users').dropped, []);

  const db = new Database(dst, { readonly: true });
  try {
    const users = Object.fromEntries(db.prepare('SELECT id, hrm_code, password_hash FROM users').all().map((u) => [u.hrm_code, u]));
    assert.ok(users.ADMIN01.id === 'u1' && users.PT01.id === 'u3', 'giữ nguyên id');
    assert.ok(users.ADMIN01.password_hash === hashes.admin, 'hash ADMIN giữ nguyên');
    assert.ok(users.STAFF01.password_hash === hashes.staff, 'hash STAFF giữ nguyên');
    assert.ok(users.PT01.password_hash === null, 'dòng không mật khẩu vẫn được sao');
    assert.ok(verifyPassword(PASS_ADMIN, users.ADMIN01.password_hash), 'mật khẩu cũ vẫn đăng nhập được');
    assert.equal(db.prepare("SELECT responsible_user_id FROM post_offices WHERE code = 'MBC1'").get().responsible_user_id, 'u3');
    assert.equal(db.prepare("SELECT phone FROM post_offices WHERE code = 'MBC1'").get().phone, null);
    assert.equal(db.prepare("SELECT operational_status FROM post_offices WHERE code = 'MBC2'").get().operational_status, 'ACTIVE');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'bang_la'").get().n, 0, 'không sao bảng lạ');
    const widgets = db.prepare('SELECT title FROM dashboard_widgets').all().map((w) => w.title);
    assert.equal(widgets.length, 3, 'dashboard_widgets giữ bộ mặc định của app');
    assert.ok(!widgets.includes('O_CUA_NGUON'));
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});

test('báo cáo: liệt kê tài khoản có mật khẩu + trạng thái, đếm dòng không mật khẩu, KHÔNG chứa hash', () => {
  const { src, dst } = freshPair('report');
  const r = importSeed({ sourcePath: src, targetPath: dst });
  assert.deepEqual(r.accounts, [
    { hrm_code: 'ADMIN01', full_name: 'Quản Trị', role: 'ADMIN', active: true },
    { hrm_code: 'STAFF01', full_name: 'Nhân Viên Khoá', role: 'STAFF', active: false }
  ]);
  assert.equal(r.usersWithoutPassword, 1);
  assert.equal(r.danglingResponsible, 0);
  const text = formatReport(r);
  assert.ok(text.includes('ADMIN01 | Quản Trị | ADMIN | hoạt động'));
  assert.ok(text.includes('STAFF01 | Nhân Viên Khoá | STAFF | khoá'));
  assert.ok(!text.includes(hashes.admin) && !text.includes(hashes.staff), 'báo cáo không chứa password_hash');
  assert.ok(!JSON.stringify(r).includes(hashes.admin), 'kết quả trả về không chứa password_hash');
});

test('từ chối khi đích đã có dữ liệu; --force xoá 4 bảng rồi nạp lại', () => {
  const { src, dst } = freshPair('force');
  importSeed({ sourcePath: src, targetPath: dst });

  assert.throws(() => importSeed({ sourcePath: src, targetPath: dst }), (e) => e instanceof SeedError && /--force/.test(e.message));
  assert.equal(count(dst, 'users'), 3, 'lần bị từ chối không ghi gì');

  // Thêm dòng lạ vào đích: --force phải xoá sạch rồi nạp lại đúng như nguồn.
  const db = new Database(dst);
  db.prepare("INSERT INTO province_post_offices (id, code, name) VALUES ('px', 'XX', 'Tỉnh thừa')").run();
  db.close();

  const r = importSeed({ sourcePath: src, targetPath: dst, force: true });
  assert.equal(r.forced, true);
  assert.equal(count(dst, 'province_post_offices'), 1);
  assert.equal(count(dst, 'users'), 3);
  assert.equal(count(dst, 'dashboard_widgets'), 3, '--force không đụng dashboard_widgets');
});

test('từ chối: chưa có DB đích, nguồn thiếu bảng users, nguồn = đích', () => {
  const { src, dst } = freshPair('refuse');
  assert.throws(() => importSeed({ sourcePath: src, targetPath: path.join(workDir, 'khong-co.db') }),
    (e) => e instanceof SeedError && /Chạy app/.test(e.message));
  assert.ok(!fs.existsSync(path.join(workDir, 'khong-co.db')), 'không tự tạo DB đích');

  const noUsers = path.join(workDir, 'refuse', 'no-users.db');
  const db = new Database(noUsers);
  db.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY)');
  db.close();
  assert.throws(() => importSeed({ sourcePath: noUsers, targetPath: dst }), (e) => e instanceof SeedError && /users/.test(e.message));

  assert.throws(() => importSeed({ sourcePath: dst, targetPath: dst }), (e) => e instanceof SeedError && /cùng một file/.test(e.message));
  assert.equal(count(dst, 'users'), 0);
});

test('nguồn vi phạm khoá ngoại -> huỷ toàn bộ (1 transaction), đích vẫn rỗng', () => {
  const { src, dst } = freshPair('fk', { brokenFk: true });
  assert.throws(() => importSeed({ sourcePath: src, targetPath: dst }), (e) => e instanceof SeedError && /khoá ngoại/.test(e.message));
  for (const t of ['province_post_offices', 'commune_post_offices', 'post_offices', 'users']) assert.equal(count(dst, t), 0, t);
});

test('nguồn đang mở bởi hệ thống cũ (dữ liệu còn trong -wal): vẫn đọc đủ, không đổi file nào của nguồn', () => {
  const { src, srcDir, dst } = freshPair('wal');
  const writer = new Database(src);
  try {
    writer.pragma('wal_autocheckpoint = 0'); // giữ dữ liệu mới trong -wal, chưa gộp vào .db
    writer.prepare("INSERT INTO post_offices (id, code, name, commune_id) VALUES ('po4', 'MBC4', 'Bưu cục Bốn', 'c1')").run();
    assert.ok(fs.existsSync(`${src}-wal`));
    const before = snapshotDir(srcDir);

    const r = importSeed({ sourcePath: src, targetPath: dst });
    assert.equal(r.counts.post_offices, 4, 'đọc được cả dòng còn nằm trong -wal');
    assert.deepEqual(snapshotDir(srcDir), before, '.db, -wal, -shm của nguồn không đổi');
  } finally {
    writer.close();
  }
});

test('CLI: thiếu tham số -> thoát mã 1; chưa có data/hue-dhcl.db -> hướng dẫn, không tạo file', (t) => {
  const noArg = spawnSync(process.execPath, ['scripts/import-seed.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(noArg.status, 1);
  assert.match(noArg.stderr, /Cách dùng/);

  const realTarget = path.join(ROOT, 'data', 'hue-dhcl.db');
  if (fs.existsSync(realTarget)) return t.skip('máy này đã có data/hue-dhcl.db — không chạy CLI vào DB thật');
  const { src } = freshPair('cli');
  const r = spawnSync(process.execPath, ['scripts/import-seed.js', src], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Chạy app/);
  assert.ok(!fs.existsSync(realTarget), 'không tự tạo DB đích');
});
