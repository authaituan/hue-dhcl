// ==========================================
// Test: server/lib/arrivalsImport.js + scripts/import-arrivals.js — nạp CSV "Hàng đến".
// Mọi CSV đều là dữ liệu GIẢ sinh trong thư mục tạm (không dùng số hiệu thật).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const lib = require(path.join(ROOT, 'server', 'lib', 'arrivalsImport.js'));
const { ensureArrivalSchema, importArrivalFile, importArrivalDirectory, getMissingBatches, setWardMapping, refreshWardMap, wardKey, parseUsDateTime, EXPECTED_HEADER } = lib;

let workDir;
let seq = 0;
const openDbs = [];

function newDb() {
  const file = path.join(workDir, `db-${++seq}.db`);
  const db = new Database(file);
  openDbs.push(db);
  db.exec(`
    CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
    CREATE TABLE commune_post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, province_id TEXT NOT NULL REFERENCES province_post_offices(id));
    CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT, commune_id TEXT NOT NULL REFERENCES commune_post_offices(id));
    INSERT INTO province_post_offices VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices VALUES
      ('c-phu-xuan', '9901', 'Bưu điện phường Phú Xuân', 'p1'),
      ('c-chan-may', '9902', 'Bưu điện xã Chân Mây - Lăng Cô', 'p1'),
      ('c-abc', '9903', 'Bưu điện xã Abc', 'p1'),
      ('c-x1', '9904', 'Bưu điện phường Trùng', 'p1'),
      ('c-x2', '9905', 'Bưu điện xã Trùng', 'p1');
  `);
  ensureArrivalSchema(db);
  return { db, file };
}

// Dòng CSV đủ 16 cột theo tên trường; mặc định là 1 dòng hợp lệ của ngày 04/10/2026.
let trackSeq = 0;
function row(over = {}) {
  trackSeq++;
  const base = {
    Ma_BC_dong: '990001', BC_nhan_BG: '990099', Ten_duong_thu: 'Đường thư thử', SHBG: `ZZ${String(trackSeq).padStart(9, '0')}VN`,
    So_hieu_BD10: '9900019900990000001', 'Thời gian XN túi': '10/4/2026 8:00:00 AM', 'Thời gian XN BG': '10/4/2026 8:10:00 AM',
    Ngay_gio_XND_BD10: '10/4/2026 8:05:00 AM', Ngay_gio_XND_BD10_tai_TTKT: '10/3/2026 9:00:00 PM', So_hieu_BD8: `990001990099TST${String(trackSeq).padStart(14, '0')}`,
    Khoi_luong_thuc_te: '250', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ thử', Ghi_chu: 'Bộ;Thử (Túi)', Ten_Xa_Phuong: 'Phường Phú Xuân', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
  return { ...base, ...over };
}

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
function writeCsv(name, rows, { header = EXPECTED_HEADER, bom = true } = {}) {
  const lines = [header.map(q).join(',')];
  for (const r of rows) lines.push(header.map((h) => q(r[h] ?? '')).join(','));
  const file = path.join(workDir, `f${++seq}`, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n', 'utf8');
  return file;
}
const count = (db, sql, ...p) => db.prepare(sql).get(...p).n;

before(() => { workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-arrivals-test-')); });
after(() => {
  for (const db of openDbs) if (db.open) db.close(); // Windows: phải đóng DB trước khi xoá thư mục tạm
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('parseUsDateTime: M/D/YYYY kiểu Mỹ (4/10 không đảo thành 10/4), 12 AM/PM, giá trị sai', () => {
  assert.deepEqual(parseUsDateTime('10/4/2026 8:29:46 AM'), { ok: true, value: '2026-10-04 08:29:46' });
  assert.deepEqual(parseUsDateTime('4/10/2026 3:05:09 PM'), { ok: true, value: '2026-04-10 15:05:09' });
  assert.equal(parseUsDateTime('12/31/2026 12:00:00 AM').value, '2026-12-31 00:00:00');
  assert.equal(parseUsDateTime('1/1/2026 12:30:00 PM').value, '2026-01-01 12:30:00');
  assert.deepEqual(parseUsDateTime(''), { ok: true, value: null });
  for (const bad of ['13/1/2026 1:00:00 AM', '2/30/2026 1:00:00 AM', '2026-10-04 08:00:00', '10/4/2026 13:00:00 PM', '10/4/2026 8:00 AM']) {
    assert.equal(parseUsDateTime(bad).ok, false, bad);
  }
});

test('wardKey: bỏ dấu, gộp Đ/Ð/đ, gộp gạch ngang và khoảng trắng', () => {
  assert.equal(wardKey('Xã Chân Mây – Lăng Cô'), 'xa chan may - lang co');
  assert.equal(wardKey('xã  chân mây-lăng cô'), 'xa chan may - lang co');
  assert.equal(wardKey('Phường Ðông'), wardKey('Phường Đông'));
  assert.equal(wardKey('PHƯỜNG đông'), 'phuong dong');
  assert.equal(wardKey(''), '');
});

test('nạp đúng: arrival_at = mốc sớm nhất của 3 mốc (kể cả khi thiếu mốc), số hiệu 19 chữ số giữ nguyên, khối lượng rỗng -> NULL', async () => {
  const { db } = newDb();
  const rows = [
    row({ SHBG: 'ZZ100000001VN', 'Thời gian XN túi': '10/4/2026 7:00:00 AM' }), // túi sớm nhất
    row({ SHBG: 'ZZ100000002VN', 'Thời gian XN túi': '', Ngay_gio_XND_BD10: '10/4/2026 6:00:00 AM' }), // thiếu túi, BD10 sớm nhất
    row({ SHBG: 'ZZ100000003VN', 'Thời gian XN túi': '', Ngay_gio_XND_BD10: '', 'Thời gian XN BG': '10/4/2026 9:00:00 AM' }), // chỉ còn XN BG
    row({ SHBG: 'ZZ100000004VN', 'Thời gian XN túi': '', Ngay_gio_XND_BD10: '', 'Thời gian XN BG': '', Khoi_luong_thuc_te: '' }), // không mốc nào
    row({ SHBG: 'ZZ100000005VN', 'Thời gian XN BG': '10/4/2026 7:30:00 AM', 'Thời gian XN túi': '10/4/2026 7:30:00 AM', Ngay_gio_XND_BD10: '10/4/2026 7:31:00 AM' }) // bằng nhau -> ưu tiên túi
  ];
  const r = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', rows));
  assert.equal(r.status, 'OK');
  assert.equal(r.inserted, 5);
  const got = Object.fromEntries(db.prepare('SELECT * FROM arrival_items').all().map((x) => [x.tracking_no, x]));
  assert.deepEqual([got.ZZ100000001VN.arrival_at, got.ZZ100000001VN.arrival_at_basis, got.ZZ100000001VN.arrival_evidence_count], ['2026-10-04 07:00:00', 'bag', 3]);
  assert.deepEqual([got.ZZ100000002VN.arrival_at, got.ZZ100000002VN.arrival_at_basis, got.ZZ100000002VN.arrival_evidence_count], ['2026-10-04 06:00:00', 'bd10', 2]);
  assert.deepEqual([got.ZZ100000003VN.arrival_at, got.ZZ100000003VN.arrival_at_basis, got.ZZ100000003VN.arrival_evidence_count], ['2026-10-04 09:00:00', 'item', 1]);
  assert.deepEqual([got.ZZ100000004VN.arrival_at, got.ZZ100000004VN.arrival_date, got.ZZ100000004VN.arrival_at_basis, got.ZZ100000004VN.arrival_evidence_count], [null, null, null, 0]);
  assert.equal(got.ZZ100000005VN.arrival_at_basis, 'bag');
  assert.equal(got.ZZ100000001VN.arrival_date, '2026-10-04', '4/10 không bị đảo');
  assert.equal(got.ZZ100000001VN.bd10_no, '9900019900990000001', 'số hiệu 19 chữ số giữ nguyên dạng CHỮ');
  assert.equal(typeof got.ZZ100000001VN.bd10_no, 'string');
  assert.equal(got.ZZ100000004VN.weight_g, null);
  assert.equal(got.ZZ100000001VN.weight_g, 250);
  assert.equal(got.ZZ100000002VN.bag_confirmed_at, null);
  assert.equal(got.ZZ100000002VN.bag_date, null);
  assert.equal(got.ZZ100000001VN.item_date, '2026-10-04');
  assert.equal(got.ZZ100000001VN.receiver_code, '990099');
  assert.equal(r.stats.noArrivalDate, 1);
});

test('lượt đến (SHBG+BD10+BD8) khác số SHBG khác nhau; dòng cùng lượt chỉ khác giờ XN BG được lưu đủ', async () => {
  const { db } = newDb();
  const rows = [
    row({ SHBG: 'ZZ200000001VN', So_hieu_BD8: 'TUI-A' }),
    row({ SHBG: 'ZZ200000001VN', So_hieu_BD8: 'TUI-B' }), // khác BD8 -> lượt mới
    row({ SHBG: 'ZZ200000002VN', So_hieu_BD8: 'TUI-A', 'Thời gian XN BG': '10/4/2026 8:10:00 AM' }),
    row({ SHBG: 'ZZ200000002VN', So_hieu_BD8: 'TUI-A', 'Thời gian XN BG': '10/4/2026 8:20:00 AM' }) // cùng lượt, khác giờ
  ];
  await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', rows));
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 4, 'mọi dòng được lưu');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM (SELECT 1 FROM arrival_items GROUP BY tracking_no, bd10_no, bd8_no)'), 3, 'số lượt đến');
  assert.equal(count(db, 'SELECT COUNT(DISTINCT tracking_no) n FROM arrival_items'), 2, 'số bưu gửi khác nhau');
  assert.equal(count(db, "SELECT COUNT(DISTINCT bd8_no) n FROM arrival_items WHERE bd8_no <> ''"), 2, 'số túi/kiện');
});

test('khoá chống trùng: dòng trùng khoá bị bỏ qua (kể cả khi mã rỗng và giờ XN BG rỗng)', async () => {
  const { db } = newDb();
  const dup = row({ SHBG: 'ZZ300000001VN' });
  const emptyKey = row({ SHBG: '', So_hieu_BD10: '', So_hieu_BD8: '', 'Thời gian XN BG': '' });
  const r = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', [dup, { ...dup, Ghi_chu: 'khác cột ngoài khoá' }, emptyKey, { ...emptyKey }]));
  assert.equal(r.status, 'OK');
  assert.equal(r.rowCount, 4);
  assert.equal(r.inserted, 2);
  assert.equal(r.ignored, 2);
  const f = db.prepare('SELECT inserted_count, ignored_duplicate_count FROM arrival_import_files').get();
  assert.deepEqual(f, { inserted_count: 2, ignored_duplicate_count: 2 });
  // Trùng khoá giữa 2 file cũng bị bỏ qua
  const r2 = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_150011.csv', [dup]));
  assert.equal(r2.inserted, 0);
  assert.equal(r2.ignored, 1);
});

test('idempotent: nạp lại cùng file -> "đã nạp", số dòng không đổi; trùng tên khác nội dung -> CONFLICT, không nạp', async () => {
  const { db, file: dbFile } = newDb();
  const f = writeCsv('HangDen_990099_20261005_093012.csv', [row(), row()]);
  assert.equal((await importArrivalFile(db, f)).inserted, 2);
  const again = await importArrivalFile(db, f);
  assert.equal(again.alreadyImported, true);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 2);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_import_files'), 1);

  fs.appendFileSync(f, `${EXPECTED_HEADER.map((h) => q(row()[h])).join(',')}\r\n`);
  const c = await importArrivalFile(db, f);
  assert.equal(c.status, 'CONFLICT');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 2, 'không nạp thêm dòng');
  assert.deepEqual(db.prepare('SELECT status FROM arrival_import_files ORDER BY id').all().map((x) => x.status), ['OK', 'CONFLICT']);

  // Công cụ dòng lệnh: CONFLICT -> mã thoát khác 0
  db.close();
  const cli = spawnSync(process.execPath, ['scripts/import-arrivals.js', f, '--db', dbFile], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cli.status, 2, cli.stderr);
  assert.match(cli.stdout, /CONFLICT/);
});

test('file rỗng: 0 byte, chỉ BOM, chỉ tiêu đề -> EMPTY, hợp lệ, 0 dòng', async () => {
  const { db } = newDb();
  const dir = path.join(workDir, 'empty');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'HangDen_990099_20261004_150011.csv'), '');
  fs.writeFileSync(path.join(dir, 'HangDen_990099_20261005_150011.csv'), Buffer.from([0xef, 0xbb, 0xbf]));
  const headerOnly = writeCsv('HangDen_990099_20261006_150011.csv', []);
  for (const f of [path.join(dir, 'HangDen_990099_20261004_150011.csv'), path.join(dir, 'HangDen_990099_20261005_150011.csv'), headerOnly]) {
    const r = await importArrivalFile(db, f);
    assert.equal(r.status, 'EMPTY', path.basename(f));
    assert.equal(r.rowCount, 0);
  }
  assert.equal(count(db, "SELECT COUNT(*) n FROM arrival_import_files WHERE status = 'EMPTY'"), 3);
});

test('sai tiêu đề -> REJECTED, nêu cột lệch, không nạp dòng nào', async () => {
  const { db } = newDb();
  const header = [...EXPECTED_HEADER];
  [header[5], header[6]] = [header[6], header[5]];
  const r = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', [row()], { header }));
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /cột 6/);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 0);
  assert.equal(db.prepare('SELECT status FROM arrival_import_files').get().status, 'REJECTED');

  const fewer = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_150011.csv', [row()], { header: EXPECTED_HEADER.slice(0, 15) }));
  assert.equal(fewer.status, 'REJECTED');
});

test('1 dòng ngày giờ sai định dạng -> REJECTED cả file, thông báo không chứa nội dung dòng', async () => {
  const { db } = newDb();
  const rows = [row(), row(), row({ 'Thời gian XN BG': '2026-10-04 08:00:00' })];
  const r = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', rows));
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /Dòng 4/);
  assert.ok(!r.error.includes('2026-10-04 08:00:00') && !r.error.includes('ZZ'), 'không lộ nội dung dòng');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 0);

  const w = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_150011.csv', [row({ Khoi_luong_thuc_te: '1,5' })]));
  assert.equal(w.status, 'REJECTED');
  assert.match(w.error, /Khoi_luong_thuc_te/);
});

test('kiểm tra khoảng hợp lý: <= 1% dòng ngoài [ngày file − 3, +1] -> nạp + cảnh báo; > 1% -> REJECTED', async () => {
  const { db } = newDb();
  const old = { 'Thời gian XN túi': '9/20/2026 8:00:00 AM' };
  const mk = (nOut) => Array.from({ length: 200 }, (_, i) => row(i < nOut ? old : {}));
  const ok = await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', mk(2)));
  assert.equal(ok.status, 'OK');
  assert.match(ok.warning, /2\/200/);
  assert.match(db.prepare('SELECT warning FROM arrival_import_files').get().warning, /2026-10-01\.\.2026-10-05/);
  const bad = await importArrivalFile(db, writeCsv('HangDen_990099_20261005_093012.csv', mk(3)));
  assert.equal(bad.status, 'REJECTED');
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 200);
});

test('CSV: dấu " và xuống dòng trong ô được đọc đúng', async () => {
  const { db } = newDb();
  await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', [row({ SHBG: 'ZZ400000001VN', Ghi_chu: 'có "ngoặc"\r\nvà, dấu phẩy' })]));
  assert.equal(db.prepare('SELECT note FROM arrival_items').get().note, 'có "ngoặc"\r\nvà, dấu phẩy');
});

test('nạp thư mục: bỏ qua tên sai mẫu, nạp theo thứ tự (ngày, giờ)', async () => {
  const { db } = newDb();
  const dir = path.join(workDir, 'dir');
  fs.mkdirSync(dir);
  for (const n of ['HangDen_990099_20261005_093012.csv', 'HangDen_990099_20261004_150011.csv', 'HangDen_990099_20261004_093012.csv']) {
    fs.copyFileSync(writeCsv(n, [row()]), path.join(dir, n));
  }
  fs.writeFileSync(path.join(dir, 'HangDen_sai_ten.csv'), 'x');
  fs.writeFileSync(path.join(dir, 'ghi-chu.txt'), 'x');
  const res = await importArrivalDirectory(db, dir);
  assert.deepEqual(res.map((r) => `${r.fileName}:${r.status}`), [
    'HangDen_sai_ten.csv:SKIPPED_NAME',
    'HangDen_990099_20261004_093012.csv:OK',
    'HangDen_990099_20261004_150011.csv:OK',
    'HangDen_990099_20261005_093012.csv:OK'
  ]);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_import_files'), 3, 'file sai tên không ghi vào DB');
});

test('ward_bdx_map: tự khớp theo tên chuẩn hoá (kể cả gạch ngang khác loại), bỏ tiền tố chỉ khi duy nhất; MANUAL không bị ghi đè', async () => {
  const { db } = newDb();
  await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', [
    row({ Ten_Xa_Phuong: 'Phường Phú Xuân' }),
    row({ Ten_Xa_Phuong: 'Xã Chân Mây – Lăng Cô' }),
    row({ Ten_Xa_Phuong: 'Thị trấn Abc' }), // chỉ khớp khi bỏ tiền tố, duy nhất
    row({ Ten_Xa_Phuong: 'Thị trấn Trùng' }), // bỏ tiền tố ra 2 BĐX -> không gán
    row({ Ten_Xa_Phuong: 'Phường Không Có' }),
    row({ Ten_Xa_Phuong: '' })
  ]));
  const map = Object.fromEntries(db.prepare('SELECT ward_name, commune_id, source FROM ward_bdx_map').all().map((m) => [m.ward_name, m]));
  assert.equal(map['Phường Phú Xuân'].commune_id, 'c-phu-xuan');
  assert.equal(map['Xã Chân Mây – Lăng Cô'].commune_id, 'c-chan-may');
  assert.equal(map['Thị trấn Abc'].commune_id, 'c-abc');
  assert.equal(map['Thị trấn Trùng'].commune_id, null);
  assert.equal(map['Phường Không Có'].commune_id, null);
  assert.ok(Object.values(map).every((m) => m.source === 'AUTO'));
  assert.equal(Object.keys(map).length, 5, 'không tạo dòng cho phường rỗng');

  setWardMapping(db, 'Phường Không Có', 'c-x1');
  setWardMapping(db, 'Phường Phú Xuân', 'c-abc');
  refreshWardMap(db, ['Phường Phú Xuân', 'Phường Không Có']);
  const m2 = Object.fromEntries(db.prepare('SELECT ward_name, commune_id, source FROM ward_bdx_map').all().map((m) => [m.ward_name, m]));
  assert.deepEqual([m2['Phường Không Có'].commune_id, m2['Phường Không Có'].source], ['c-x1', 'MANUAL']);
  assert.equal(m2['Phường Phú Xuân'].commune_id, 'c-abc', 'tự khớp không ghi đè MANUAL');
  assert.throws(() => setWardMapping(db, 'Phường Phú Xuân', 'khong-co'), /Không có BĐX/);
});

test('getMissingBatches: ngày đã qua có < 2 file đã nạp (EMPTY vẫn tính; REJECTED không tính)', async () => {
  const { db } = newDb();
  const files = [
    ['HangDen_990099_20261001_093012.csv', [row({ 'Thời gian XN túi': '10/1/2026 8:00:00 AM' })]],
    ['HangDen_990099_20261001_150011.csv', []],
    ['HangDen_990099_20261002_093012.csv', [row({ 'Thời gian XN túi': '10/2/2026 8:00:00 AM' })]],
    ['HangDen_990099_20261004_093012.csv', [row()]],
    ['HangDen_990099_20261004_150011.csv', [row({ 'Thời gian XN BG': 'sai' })]], // REJECTED
    ['HangDen_990088_20261003_093012.csv', [row({ 'Thời gian XN túi': '10/3/2026 8:00:00 AM' })]],
    ['HangDen_990088_20261003_150011.csv', [row({ 'Thời gian XN túi': '10/3/2026 8:00:00 AM' })]]
  ];
  for (const [n, rows] of files) await importArrivalFile(db, writeCsv(n, rows));
  assert.deepEqual(getMissingBatches(db, { today: '2026-10-05' }), [
    { unit_code: '990088', date: '2026-10-04', file_count: 0 },
    { unit_code: '990099', date: '2026-10-02', file_count: 1 },
    { unit_code: '990099', date: '2026-10-03', file_count: 0 },
    { unit_code: '990099', date: '2026-10-04', file_count: 1 }
  ]);
  assert.deepEqual(getMissingBatches(db, { today: '2026-10-02' }), [], 'hôm nay chưa tính');
});

test('schema: ensureArrivalSchema chạy lại nhiều lần trên DB đã có dữ liệu; server/db.js tạo đủ bảng', async () => {
  const { db } = newDb();
  await importArrivalFile(db, writeCsv('HangDen_990099_20261004_093012.csv', [row()]));
  ensureArrivalSchema(db);
  ensureArrivalSchema(db);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM arrival_items'), 1);

  const target = path.join(workDir, 'app.db');
  const bs3 = require.resolve('better-sqlite3', { paths: [ROOT] });
  const code = `
    const real = require(${JSON.stringify(bs3)});
    function P(_p, o) { return new real(${JSON.stringify(target)}, o); }
    P.prototype = real.prototype;
    require.cache[${JSON.stringify(bs3)}].exports = P;
    for (let i = 0; i < 2; i++) { delete require.cache[require.resolve(${JSON.stringify(path.join(ROOT, 'server', 'db.js'))})]; require(${JSON.stringify(path.join(ROOT, 'server', 'db.js'))}).close(); }
  `;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/Lỗi tạo bảng dữ liệu Hàng đến/.test(r.stderr), r.stderr);
  const app = new Database(target, { readonly: true });
  const tables = app.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
  app.close();
  for (const t of ['arrival_import_files', 'arrival_items', 'ward_bdx_map']) assert.ok(tables.includes(t), t);
  try { fs.rmdirSync(path.join(ROOT, 'data')); } catch (e) { /* không có hoặc không rỗng */ }
});

test('CLI: in bảng tóm tắt, không in nội dung dòng; --check-days', async () => {
  const { db, file: dbFile } = newDb();
  db.close();
  const f = writeCsv('HangDen_990099_20261004_093012.csv', [row({ SHBG: 'ZZ900000001VN', Ghi_chu: 'NOI_DUNG_BI_MAT' }), row({ Ten_Tinh_Thanh: 'Tỉnh Khác' })]);
  const r = spawnSync(process.execPath, ['scripts/import-arrivals.js', f, '--db', dbFile], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /HangDen_990099_20261004_093012\.csv \| OK/);
  assert.ok(!r.stdout.includes('ZZ900000001VN') && !r.stdout.includes('NOI_DUNG_BI_MAT') && !r.stdout.includes('9900019900990000001'));
  const d = spawnSync(process.execPath, ['scripts/import-arrivals.js', '--check-days', '--db', dbFile, '--today', '2026-10-06'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /990099 {2}2026-10-04 {2}có 1 file/);
  assert.match(d.stdout, /990099 {2}2026-10-05 {2}có 0 file/);
  const noDb = spawnSync(process.execPath, ['scripts/import-arrivals.js', f, '--db', path.join(workDir, 'khong-co.db')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(noDb.status, 1);
  assert.ok(!fs.existsSync(path.join(workDir, 'khong-co.db')), 'không tự tạo DB');
  const sw = spawnSync(process.execPath, ['scripts/set-ward-map.js', 'Phường Không Có', 'c-x2', '--db', dbFile], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(sw.status, 0, sw.stderr);
  assert.match(sw.stdout, /MANUAL/);
  const swBad = spawnSync(process.execPath, ['scripts/set-ward-map.js', 'Phường Không Có', 'khong-co', '--db', dbFile], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(swBad.status, 1);
});
