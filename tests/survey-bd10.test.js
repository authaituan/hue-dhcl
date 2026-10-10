// ==========================================
// Test scripts/survey-bd10.js (SANLUONG-4a4): khảo sát CHỈ ĐỌC ở mức BD10. DB tạm + dữ liệu GIẢ.
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
const { ensureArrivalSchema, deriveArrival } = require('../server/lib/arrivalsImport');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'survey-bd10.js');
let dir;
let dbFile;

const bd10 = (prefix, n) => `${prefix}88${String(n).padStart(11, '0')}`;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-survey-bd10-test-'));
  dbFile = path.join(dir, 'survey.db');
  const db = new Database(dbFile);
  ensureArrivalSchema(db);
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1, '533140', 'f.csv', '2026-10-02', '235959', 1, 'x', 'OK')").run();
  const ins = db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
    arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, item_date, bd10_date, ward_name, province_name)
    VALUES (1, '533140', @trk, @b10, @b8, @bag, @itm, @xnd, @arr, @basis, @day, @ev, @bd, @id, @xd, @ward, 'Tỉnh Thử')`);
  let n = 0;
  const add = (b10, o = {}) => {
    n++;
    const t = { bag_confirmed_at: o.bag === undefined ? '2026-10-02 08:00:00' : o.bag, item_confirmed_at: o.itm === undefined ? '2026-10-02 08:05:00' : o.itm, bd10_confirmed_at: o.xnd || null };
    deriveArrival(t);
    ins.run({ trk: `ZZ4S${n}VN`, b10, b8: o.b8 === undefined ? `B${n}` : o.b8, bag: t.bag_confirmed_at, itm: t.item_confirmed_at, xnd: t.bd10_confirmed_at,
      arr: t.arrival_at, basis: t.arrival_at_basis, day: t.arrival_date, ev: t.arrival_evidence_count, bd: t.bag_confirmed_at && t.bag_confirmed_at.slice(0, 10),
      id: t.item_confirmed_at && t.item_confirmed_at.slice(0, 10), xd: t.bd10_confirmed_at && t.bd10_confirmed_at.slice(0, 10), ward: o.ward === undefined ? 'Phường An' : o.ward });
    return n;
  };
  // X: nhóm 530100, 2 dòng đủ túi + BG, không XNĐ -> A và B
  add(bd10('530100', 1)); add(bd10('530100', 1));
  // Y: nhóm khác (531120): 1 dòng đủ + có XNĐ, 1 dòng chỉ có túi -> đến (A) nhưng có XNĐ; không thuộc B
  add(bd10('531120', 2), { xnd: '2026-10-02 07:00:00' }); add(bd10('531120', 2), { itm: null, xnd: '2026-10-02 07:00:00' });
  // Z: BD10 do chính BCVH lập (tiền tố 533140): đủ, không XNĐ -> A và B nhưng thuộc "chính BCVH lập"
  add(bd10('533140', 3));
  // W: 530100, một dòng đủ + một dòng chỉ có túi, không XNĐ -> A, không B; dòng hàng nặng (BD8 = SHBG)
  add(bd10('530100', 4)); add(bd10('530100', 4), { itm: null, b8: 'ZZ4S7VN' });
  // dòng không có BD10 và dòng thiếu phường
  add('', { ward: '' });
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('survey-bd10: chạy trên DB tạm không ghi gì; đếm A/B/C đúng; tách BD10 do chính BCVH lập; không in số hiệu đầy đủ', () => {
  const before1 = sha(dbFile);
  const mtime = fs.statSync(dbFile).mtimeMs;
  const r = run('--db', dbFile, '--from', '2026-10-01', '--to', '2026-10-09');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sha(dbFile), before1, 'DB không đổi');
  assert.equal(fs.statSync(dbFile).mtimeMs, mtime);
  assert.deepEqual(fs.readdirSync(dir), ['survey.db'], 'không tạo file -wal / -shm / tạm');
  const out = r.stdout;
  // Bảng 3: tổng 4 BD10; A: đến 4 (X, Y, Z, W), không XNĐ 3 (X, Z, W); B: đến 2 (X, Z), không XNĐ 2
  assert.match(out, /\| Tổng \| 4 \| 4 \| 3 \| 75\.0% \| 75\.0% \| 2 \| 2 \| 100\.0% \| 50\.0% \|/);
  // 530100: 2 BD10 (X, W): A đến 2, không XNĐ 2; B đến 1 (X), không XNĐ 1
  assert.match(out, /\| 530100 \| 2 \| 2 \| 2 \| 100\.0% \| 100\.0% \| 1 \| 1 \| 100\.0% \| 50\.0% \|/);
  // Khác 530100 gộp: Y và Z; tách Z (do chính BCVH lập) ở bảng 3e
  assert.match(out, /\| Khác 530100 \| 2 \| 2 \| 1 \| 50\.0% \| 50\.0% \| 1 \| 1 \| 100\.0% \| 50\.0% \|/);
  assert.match(out, /\| Khác 530100, TRỪ BD10 do chính BCVH lập \| 1 \| 1 \| 0 \| 0\.0% \| 0\.0% \| 0 \| 0 \|/);
  assert.match(out, /\| BD10 do chính BCVH lập \(tiền tố = mã BCVH\) \| 1 \| 1 \| 1 \| 100\.0% \| 100\.0% \| 1 \| 1 \|/);
  // XNĐ đồng nhất trong BD10: không có BD10 nào ≥ 2 giá trị
  assert.match(out, /BD10 có ≥ 2 giá trị XNĐ khác nhau \(i\/ii\/iii\) \| 0 \|/);
  // Hàng nặng: 1 dòng BD8 trùng SHBG
  assert.match(out, /Dòng có BD8 trùng SHBG \| 1 \|/);
  // Dòng không BD10 và thiếu phường
  assert.match(out, /Dòng không có số hiệu BD10 \(khong_bd10\) \| 1 \|/);
  // Không lộ SHBG / BD8 / BD10 đầy đủ (chỉ tiền tố 6 số)
  assert.ok(!/ZZ4S\d/.test(out), 'không in SHBG');
  assert.ok(!out.includes(bd10('530100', 1)) && !out.includes(bd10('531120', 2)), 'không in BD10 đầy đủ');
  assert.ok(/\| 530100 \(TTKT\) \|/.test(out) && /\| 531120 \|/.test(out), 'chỉ tiền tố 6 số');
});

test('survey-bd10: từ chối cờ ghi, thiếu DB, ngày sai; mở DB chỉ đọc', () => {
  for (const flag of ['--apply', '--write', '--vacuum']) {
    const r = run('--db', dbFile, flag);
    assert.equal(r.status, 1, flag);
    assert.match(r.stderr, /chỉ đọc/);
  }
  assert.equal(run('--db', path.join(dir, 'khong-co.db')).status, 1);
  assert.equal(run('--db', dbFile, '--from', '01/10/2026').status, 1);
  assert.equal(run('--xyz').status, 1);
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(src, /readonly: true/);
});
