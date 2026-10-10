// ==========================================
// Test scripts/survey-bd10-den.js (SANLUONG-4a5): khảo sát CHỈ ĐỌC "BD10 đến không XNĐ" theo định nghĩa mới. DB tạm + dữ liệu GIẢ.
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
const { classify } = require('../scripts/survey-bd10-den');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'survey-bd10-den.js');
let dir;
let dbFile;
const U = '533140';
const code = (lap, nhan, n) => `${lap}${nhan}${String(n).padStart(7, '0')}`; // 19 ký tự giả

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-survey-bd10-den-test-'));
  dbFile = path.join(dir, 'den.db');
  const db = new Database(dbFile);
  ensureArrivalSchema(db);
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1, '533140', 'f.csv', '2026-10-08', '235959', 1, 'x', 'OK')").run();
  const ins = db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at,
    arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count) VALUES (1, '533140', @trk, @b10, 'B', @bag, @itm, @xnd, @arr, @basis, @day, @ev)`);
  let n = 0;
  const add = (b10, o = {}) => {
    n++;
    const t = { bag_confirmed_at: o.bag || null, item_confirmed_at: o.itm || null, bd10_confirmed_at: o.xnd || null };
    deriveArrival(t);
    ins.run({ trk: `ZZ5D${n}VN`, b10, bag: t.bag_confirmed_at, itm: t.item_confirmed_at, xnd: t.bd10_confirmed_at, arr: t.arrival_at, basis: t.arrival_at_basis, day: t.arrival_date, ev: t.arrival_evidence_count });
  };
  // E1 (530100 → 533140): có XNĐ 02/10, XN túi 05/10 -> S1; ngày X = 02/10, ngày Y = 05/10. 2 dòng, XNĐ ở MỘT PHẦN dòng (dòng 2 không có)
  add(code('530100', U, 1), { xnd: '2026-10-02 07:00:00', bag: '2026-10-05 08:00:00', itm: '2026-10-05 08:10:00' });
  add(code('530100', U, 1), { bag: '2026-10-05 09:00:00', itm: '2026-10-05 09:10:00' });
  // E2 (531120 → 533140): không XNĐ, một dòng đủ túi + BG -> S2 (và N); ngày 06/10
  add(code('531120', U, 2), { bag: '2026-10-06 08:00:00', itm: '2026-10-06 08:05:00' });
  // E3 (530100 → 533140): không XNĐ, chỉ có XN BG -> S3 (N); ngày 07/10
  add(code('530100', U, 3), { itm: '2026-10-07 08:00:00' });
  // E4 (530100 → 533140): không có mốc nào -> S4 (không gán được ngày)
  add(code('530100', U, 4));
  // E5 (535470 → 533140): có XNĐ cùng giá trị ở mọi dòng -> S1; ngày X = Y?? (XNĐ 03/10, túi 03/10 sau XNĐ)
  add(code('535470', U, 5), { xnd: '2026-10-03 06:00:00', bag: '2026-10-03 09:00:00', itm: '2026-10-03 09:05:00' });
  // L1: do chính BCVH lập đi (533140 → 531120): KHÔNG thuộc "đến", dù không XNĐ và đủ XN
  add(code(U, '531120', 6), { bag: '2026-10-06 08:00:00', itm: '2026-10-06 08:05:00' });
  // Mã ngắn (< 12 ký tự) và mã rỗng
  add('53010053314', { bag: '2026-10-06 08:00:00', itm: '2026-10-06 08:05:00' });
  add('', { itm: '2026-10-06 08:00:00' });
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('classify: [6 ký tự lập][6 ký tự nhận]…; đến / lập đi / nội bộ / khác / ngắn / rỗng', () => {
  assert.equal(classify(code('530100', U, 1), U).kind, 'den');
  assert.equal(classify(code(U, '531120', 1), U).kind, 'lap_di');
  assert.equal(classify(code(U, U, 1), U).kind, 'noi_bo');
  assert.equal(classify(code('530100', '531120', 1), U).kind, 'khac');
  assert.equal(classify('53010053314', U).kind, 'ngan');
  assert.equal(classify('', U).kind, 'rong');
  assert.deepEqual([classify(code('531120', U, 9), U).lap, classify(code('531120', U, 9), U).nhan], ['531120', U]);
});

test('survey-bd10-den: DB không đổi; phân loại mã, trạng thái S1–S4, N/D, quy tắc ngày X và Y, XNĐ một phần; không in số hiệu đầy đủ', () => {
  const before1 = sha(dbFile);
  const r = run('--db', dbFile, '--unit', U, '--from', '2026-10-01', '--to', '2026-10-09');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sha(dbFile), before1, 'DB không đổi');
  assert.deepEqual(fs.readdirSync(dir), ['den.db'], 'không tạo file -wal / -shm / tạm');
  const out = r.stdout;
  // 1b: đến = 4 BD10 (E1, E2, E3, E5 → 5? E4 cũng đến): E1, E2, E3, E4, E5 = 5; lập đi 1; ngắn 1; rỗng 1
  assert.match(out, /\| BD10 ĐẾN \(ký tự 7–12 = mã BCVH, 6 ký tự đầu ≠ mã BCVH\) \| 5 \|/);
  assert.match(out, /\| BD10 LẬP ĐI \(6 ký tự đầu = mã BCVH, ký tự 7–12 ≠ mã BCVH\) \| 1 \|/);
  assert.match(out, /\| Mã bất thường \(< 12 ký tự\) \| 1 \|/);
  assert.match(out, /\| Không có mã BD10 \(rỗng\) \| 1 \|/);
  // 2a: tổng D = 5: S1 = 2 (E1, E5), S2 = 1 (E2), S3 = 1 (E3), S4 = 1 (E4); 530100: 3 BD10 (E1, E3, E4)
  assert.match(out, /\| Tổng \| 5 \| 2 \| 1 \| 1 \| 1 \|/);
  assert.match(out, /\| Nhóm 530100 \| 3 \| 1 \| 0 \| 1 \| 1 \|/);
  assert.match(out, /\| Nhóm khác 530100 \| 2 \| 1 \| 1 \| 0 \| 0 \|/);
  assert.match(out, /\| chỉ có XN BG \| 1 \|/);
  // 2c: E1 có XNĐ ở MỘT PHẦN dòng; XNĐ ≥ 2 giá trị: 0
  assert.match(out, /BD10 đến có XNĐ ở MỘT PHẦN dòng \| 1 \|/);
  // 3a: N = S2 + S3 = 2, D = 5 -> 40,0%; hẹp S2 = 1 -> 20,0%
  assert.match(out, /\| Tổng \| 5 \| 2 \| 40\.0% \| 1 \| 20\.0% \|/);
  assert.match(out, /\| Nhóm 530100 \| 3 \| 1 \| 33\.3% \| 0 \| 0\.0% \|/);
  assert.match(out, /\| Nhóm khác 530100 \| 2 \| 1 \| 50\.0% \| 1 \| 50\.0% \|/);
  // 3b quy tắc X: D có ngày = 4 (không gồm S4): E1 02/10, E2 06/10, E3 07/10, E5 03/10; N = 2
  assert.match(out, /Quy tắc X: ngoài khung — trước 2026-10-01: 0 BD10; sau 2026-10-09: 0 BD10; không gán được ngày: 1 BD10\./);
  assert.match(out, /Quy tắc Y: ngoài khung — trước 2026-10-01: 0 BD10; sau 2026-10-09: 0 BD10; không gán được ngày: 1 BD10\./);
  // 4a (X): ngày 02/10: D 1 (E1), 05/10 không có; (Y): E1 ở 05/10
  const x = out.split('### 4a. Quy tắc X')[1].split('### 4a. Quy tắc Y')[0];
  const y = out.split('### 4a. Quy tắc Y')[1].split('### 4b')[0];
  assert.match(x, /\| 2026-10-02 \| 1 \| 0 \|/);
  assert.match(y, /\| 2026-10-05 \| 1 \| 0 \|/);
  assert.doesNotMatch(y, /\| 2026-10-02 \| 1 \|/);
  // 4b: ngày X ≠ ngày Y: E1 (02 → 05: +3), E5 (03/10 XNĐ 06:00 vs túi 03/10: cùng ngày)
  assert.match(out, /BD10 đến có ngày X ≠ ngày Y \| 1 \|/);
  assert.match(out, /\+3: 1/);
  // 6a: 2 BD10 có XNĐ (E1, E5), 2 giá trị khác nhau
  assert.match(out, /BD10 đến có XNĐ \| 2 \|/);
  assert.match(out, /Số giá trị XNĐ khác nhau \(tới giây\) \| 2 \|/);
  // 7: 4a4 (ngày MIN arrival_at, trừ tiền tố = mã BCVH): E1, E2, E3, E5 + mã ngắn (E4 không ngày) = 5; mới = 5 → giao 4; chỉ 4a4 = mã ngắn; chỉ mới = E4
  assert.match(out, /\| 4a4: BD10 trong khung \(ngày = MIN arrival_at\), trừ tiền tố = mã BCVH \| 5 \|/);
  assert.match(out, /Giao nhau \(cả hai\) \| 4 \|/);
  assert.match(out, /Chỉ có ở 4a4 \(ký tự 7–12 ≠ mã BCVH\) \| 1 \|/);
  assert.match(out, /Chỉ có ở định nghĩa mới \| 1 \|/);
  // Mã bưu cục (6 số) được phép; không lộ số hiệu đầy đủ
  assert.ok(out.includes('530100 (TTKT)') && out.includes('531120'));
  assert.ok(!/ZZ5D\d/.test(out), 'không in SHBG');
  for (const b of [code('530100', U, 1), code('531120', U, 2), code(U, '531120', 6)]) assert.ok(!out.includes(b), 'không in BD10 đầy đủ');
});

test('survey-bd10-den: từ chối cờ ghi / DB thiếu / --unit sai / ngày sai; mở DB chỉ đọc', () => {
  for (const flag of ['--apply', '--write', '--vacuum']) {
    const r = run('--db', dbFile, flag);
    assert.equal(r.status, 1, flag);
    assert.match(r.stderr, /chỉ đọc/);
  }
  assert.equal(run('--db', path.join(dir, 'khong-co.db')).status, 1);
  assert.equal(run('--db', dbFile, '--unit', '12345').status, 1);
  assert.equal(run('--db', dbFile, '--from', '01/10/2026').status, 1);
  assert.equal(run('--xyz').status, 1);
  assert.match(fs.readFileSync(SCRIPT, 'utf8'), /readonly: true/);
});
