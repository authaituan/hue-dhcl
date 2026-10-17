// ==========================================
// Test SANLUONG-5j: scripts/xoa-du-lieu-bcvh.js — xóa dữ liệu hàng đến theo BCVH và khoảng ngày trong TÊN FILE (chạy khô mặc định).
// Mỗi ca dùng một DB TẠM riêng trong thư mục tạm, dữ liệu / SHBG GIẢ. Không mở data/, không đọc .env, không mạng.
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
const { ensureArrivalSchema, importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const S = require('../server/lib/sftpSync');
const TT = require('../server/lib/thayTheThucHien');
const KP = require('../server/lib/thayTheKhoiPhuc');
const { ensurePhatSchema } = require('../server/lib/phat');
const XB = require('../scripts/xoa-du-lieu-bcvh');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'xoa-du-lieu-bcvh.js');
const IMPORT = path.join(__dirname, '..', 'scripts', 'import-arrivals.js');
const TU = '2026-10-01';
const DEN = '2026-10-14';
const XAC_NHAN = `XOA ${TU}..${DEN}`;
let workDir;
let soDb = 0;

before(() => { workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-xoa-bcvh-test-')); });
after(() => { fs.rmSync(workDir, { recursive: true, force: true }); });

// ---- dữ liệu giả
const trk = (k) => `ZZ5J${k}VN`;
const tenFile = (bcvh, ngay, gio) => `HangDen_${bcvh}_${ngay.replace(/-/g, '')}_${gio}.csv`;

function themFile(db, { bcvh, ngay, gio = '060000', status = 'OK', dong = [] }) {
  const id = Number(db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status, source)
    VALUES (?, ?, ?, ?, 100, ?, ?, ?, ?, 'MANUAL')`).run(bcvh, tenFile(bcvh, ngay, gio), ngay, gio, crypto.randomBytes(32).toString('hex'), dong.length, dong.length, status).lastInsertRowid);
  const ins = db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, bd10_no, bd8_no, item_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'item', ?, 1)`);
  dong.forEach(([shbg, den], i) => ins.run(id, bcvh, shbg, `BD10F${id}`, `BD8F${id}N${i}`, `${den} 08:00:00`, `${den} 08:00:00`, den));
  return id;
}

/** DB tạm có đủ lược đồ dùng tới + bộ dữ liệu giả chuẩn. Trả đường dẫn. */
function taoDb() {
  const file = path.join(workDir, `db${++soDb}`, 'hue-dhcl-test.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT);
    CREATE TABLE commune_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, province_id TEXT);`);
  ensureArrivalSchema(db);
  S.ensureSftpSyncSchema(db);
  TT.ensureThayTheSchema(db);
  ensurePhatSchema(db);
  // 535470: hai file 01/10, một file 14/10 (trong khoảng); 30/09 và 15/10 ngoài khoảng (15/10 có 2 dòng ngày đến 14/10)
  themFile(db, { bcvh: '535470', ngay: '2026-10-01', gio: '060000', dong: [[trk('A1'), '2026-09-30'], [trk('A2'), '2026-10-01'], [trk('A3'), '2026-10-01']] });
  themFile(db, { bcvh: '535470', ngay: '2026-10-01', gio: '140000', dong: [[trk('A3'), '2026-10-01'], [trk('A4'), '2026-10-01']] });
  themFile(db, { bcvh: '535470', ngay: '2026-10-14', dong: [[trk('A5'), '2026-10-14'], [trk('A6'), '2026-10-14']] });
  themFile(db, { bcvh: '535470', ngay: '2026-09-30', dong: [[trk('A0'), '2026-09-30']] });
  themFile(db, { bcvh: '535470', ngay: '2026-10-15', dong: [[trk('A6'), '2026-10-14'], [trk('A7'), '2026-10-14'], [trk('A8'), '2026-10-15']] });
  // 536250: file OK + file REJECTED cùng ngày
  themFile(db, { bcvh: '536250', ngay: '2026-10-05', dong: [[trk('B1'), '2026-10-05']] });
  themFile(db, { bcvh: '536250', ngay: '2026-10-05', gio: '070000', status: 'REJECTED' });
  // 537220: không nằm trong --bcvh của đa số ca
  themFile(db, { bcvh: '537220', ngay: '2026-10-02', dong: [[trk('C1'), '2026-10-02']] });
  // 533140 Thuận Hóa: cùng khoảng ngày — KHÔNG được đụng
  themFile(db, { bcvh: '533140', ngay: '2026-10-03', dong: [[trk('T1'), '2026-10-03'], [trk('T2'), '2026-10-03']] });
  themFile(db, { bcvh: '533140', ngay: '2026-10-10', dong: [[trk('T3'), '2026-10-10']] });
  // trạng thái phát: A2 chỉ ở file bị xóa (mồ côi), A6 còn ở file 15/10, T1 của 533140
  db.prepare("INSERT INTO phat_batches (id, bcvh, user_id, nhap_luc) VALUES (1, '535470', 'u1', '2026-10-02T03:00:00Z'), (2, '533140', 'u1', '2026-10-04T03:00:00Z')").run();
  const cur = db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', ?, '2026-10-02T03:00:00Z')");
  const his = db.prepare("INSERT INTO phat_status_history (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', ?, '2026-10-02T03:00:00Z')");
  for (const [b, s, id] of [['535470', trk('A2'), 1], ['535470', trk('A6'), 1], ['533140', trk('T1'), 2]]) { cur.run(b, s, id); his.run(b, s, id); }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  return file;
}

function moDoc(file, fn) {
  const db = new Database(file, { readonly: true });
  try { return fn(db); } finally { db.close(); }
}
const demBang = (file) => moDoc(file, (db) => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").pluck().all()
  .map((t) => [t, db.prepare(`SELECT COUNT(*) FROM "${t}"`).pluck().get()])));
const chup = (file, sql) => moDoc(file, (db) => db.prepare(sql).all());
const PHAT_SQL = ['SELECT * FROM phat_status_current ORDER BY bcvh, shbg', 'SELECT * FROM phat_status_history ORDER BY id', 'SELECT * FROM phat_batches ORDER BY id'];
const fileCon = (file, bcvh) => chup(file, `SELECT file_date, status FROM arrival_import_files WHERE unit_code = '${bcvh}' ORDER BY file_date, file_time`).map((r) => `${r.file_date}:${r.status}`);

function chay(args) {
  const env = { ...process.env };
  delete env.ARRIVALS_DB;
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env, cwd: workDir });
}
const co = (file) => ['--db', file, '--tu', TU, '--den', DEN];

// ------------------------------------------
test('tham số: 533140 luôn bị từ chối; mã lạ, ngày sai, tu > den, khoảng > 31 ngày, thiếu / sai xác nhận → mã thoát 8', () => {
  const sai = (argv, re) => assert.throws(() => XB.docThamSo(argv), (e) => e instanceof XB.XoaLoi && e.maThoat === 8 && re.test(e.message), argv.join(' '));
  const d = ['--tu', TU, '--den', DEN];
  for (const b of ['533140', ' 533140 ', '535470,533140', '533140,533140', '535470, 533140', 'x533140', '999999,533140']) sai(['--bcvh', b, ...d], /533140 \(Thuận Hóa\) KHÔNG được xóa/);
  sai(['--bcvh=533140', ...d], /Thuận Hóa/);
  sai(['--bcvh', '535470,999999', ...d], /Mã BCVH không hợp lệ: 999999/);
  sai(['--bcvh', '53547', ...d], /không hợp lệ/);
  sai(['--bcvh', ',', ...d], /rỗng/);
  sai(d, /Thiếu --bcvh/);
  for (const t of ['2026-13-01', '2026-02-30', '20261001', '2026-10-1', '']) sai(['--bcvh', '535470', '--tu', t, '--den', DEN], /--tu phải là ngày hợp lệ/);
  sai(['--bcvh', '535470', '--tu', TU, '--den', '2026-10-32'], /--den phải là ngày hợp lệ/);
  sai(['--bcvh', '535470', '--tu', DEN, '--den', TU], /--tu phải nhỏ hơn hoặc bằng --den/);
  sai(['--bcvh', '535470', '--tu', '2026-10-01', '--den', '2026-11-01'], /32 ngày, vượt tối đa 31/);
  assert.equal(XB.docThamSo(['--bcvh', '535470', '--tu', '2026-10-01', '--den', '2026-10-31']).den, '2026-10-31', '31 ngày: nhận');
  sai(['--bcvh', '535470', ...d, '--chay-that'], /cần đúng --xac-nhan "XOA 2026-10-01..2026-10-14"/);
  sai(['--bcvh', '535470', ...d, '--chay-that', '--xac-nhan', 'XOA 2026-10-01..2026-10-15'], /cần đúng --xac-nhan/);
  sai(['--bcvh', '535470', ...d, '--chay-that', '--xac-nhan', 'xoa 2026-10-01..2026-10-14'], /cần đúng --xac-nhan/);
  sai(['--bcvh', '535470', ...d, '--la'], /Tuỳ chọn không hỗ trợ/);
  sai(['--bcvh'], /Thiếu giá trị/);
  const ok = XB.docThamSo(['--bcvh', '537220, 535470,535470', ...d, '--chay-that', `--xac-nhan=${XAC_NHAN}`]);
  assert.deepEqual(ok.bcvh, ['535470', '537220'], 'bỏ trùng, theo thứ tự danh mục');
  assert.equal(ok.chayThat, true);
});

test('dòng lệnh: mã lạ / 533140 / ngày sai → mã thoát 8, DB y nguyên', () => {
  const file = taoDb();
  const truoc = demBang(file);
  for (const b of ['533140', '535470,533140', '123456']) {
    const r = chay(['--bcvh', b, ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
    assert.equal(r.status, 8, r.stderr);
    assert.match(r.stderr, b.includes('533140') ? /533140 \(Thuận Hóa\) KHÔNG được xóa/ : /Mã BCVH không hợp lệ/);
  }
  assert.equal(chay(['--bcvh', '535470', '--db', file, '--tu', '2026-10-01', '--den', '2026-12-01']).status, 8);
  assert.equal(chay(['--bcvh', '535470', '--db', path.join(workDir, 'khong-co.db'), '--tu', TU, '--den', DEN]).status, 2);
  assert.deepEqual(demBang(file), truoc);
  assert.deepEqual(fileCon(file, '533140'), ['2026-10-03:OK', '2026-10-10:OK']);
});

test('chạy khô (mặc định): in theo BCVH × file_date, tổng, cảnh báo dòng ngoài khoảng, trạng thái phát; KHÔNG ghi gì, không sao lưu, không in SHBG', () => {
  const file = taoDb();
  const truoc = demBang(file);
  const kichThuoc = fs.statSync(file).size;
  const r = chay(['--bcvh', '535470,536250', ...co(file)]);
  assert.equal(r.status, 0, r.stderr);
  const o = r.stdout;
  assert.match(o, /CHẠY KHÔ \(không ghi gì\)/);
  assert.match(o, /BCVH 535470 \(BCVH Hương Trà\)/);
  assert.match(o, /2026-10-01\s+2\s+5\s+4\s+2026-09-30\.\.2026-10-01/, 'hai file, 5 dòng, 4 SHBG khác nhau, ngày đến nhỏ nhất..lớn nhất');
  assert.match(o, /2026-10-14\s+1\s+2\s+2\s+2026-10-14\.\.2026-10-14/);
  assert.match(o, /cộng\s+3\s+7\s+6/);
  assert.match(o, /2026-10-05\s+2\s+1\s+1\s+2026-10-05/, '536250: file OK + file REJECTED đều tính là file');
  assert.match(o, /TỔNG: 5 file · 8 dòng · 7 SHBG/);
  assert.match(o, /CẢNH BÁO — KHÔNG xóa\] Còn 2 dòng có NGÀY ĐẾN trong 2026-10-01\.\.2026-10-14/);
  assert.match(o, /535470 {2}file_date 2026-10-15: 2 dòng · 2 SHBG/);
  assert.doesNotMatch(o, /file_date 2026-09-30/, 'file 30/09 không có dòng ngày đến trong khoảng');
  assert.match(o, /535470: 2 SHBG có trạng thái phát; 1 còn dòng hàng đến ở file khác; 1 sẽ MỒ CÔI/);
  assert.match(o, /--chay-that --xac-nhan "XOA 2026-10-01\.\.2026-10-14"/);
  assert.doesNotMatch(o, /533140/, 'không động tới 533140');
  assert.doesNotMatch(o + r.stderr, /ZZ5J/, 'không in SHBG');
  assert.deepEqual(demBang(file), truoc, 'không ghi gì');
  assert.equal(fs.statSync(file).size, kichThuoc);
  assert.equal(fs.existsSync(path.join(path.dirname(file), 'backups')), false, 'không sao lưu');
});

test('chạy thật thiếu / sai --xac-nhan: không xóa, mã thoát 8', () => {
  const file = taoDb();
  const truoc = demBang(file);
  for (const extra of [[], ['--xac-nhan', 'XOA 2026-10-01..2026-10-13'], ['--xac-nhan', '535470:2026-10-01']]) {
    const r = chay(['--bcvh', '535470', ...co(file), '--chay-that', ...extra]);
    assert.equal(r.status, 8, r.stderr);
    assert.match(r.stderr, /CHƯA xóa gì/);
  }
  assert.deepEqual(demBang(file), truoc);
  assert.equal(fs.existsSync(path.join(path.dirname(file), 'backups')), false);
});

test('chạy thật: xóa đúng BCVH × khoảng file_date và chỉ đó; 533140, BCVH khác, file ngoài khoảng (kể cả dòng có ngày đến trong khoảng) và trạng thái phát giữ nguyên; sao lưu + thùng rác + nhật ký', () => {
  const file = taoDb();
  const truoc = demBang(file);
  const phatTruoc = PHAT_SQL.map((q) => chup(file, q));
  const t533 = chup(file, "SELECT i.* FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id WHERE f.unit_code IN ('533140', '537220') ORDER BY i.id");
  const r = chay(['--bcvh', '535470,536250', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /đã xóa 8 dòng \/ 5 bản ghi file trong MỘT giao dịch/);
  // phạm vi
  assert.deepEqual(fileCon(file, '535470'), ['2026-09-30:OK', '2026-10-15:OK']);
  assert.deepEqual(fileCon(file, '536250'), []);
  assert.deepEqual(fileCon(file, '537220'), ['2026-10-02:OK']);
  assert.deepEqual(fileCon(file, '533140'), ['2026-10-03:OK', '2026-10-10:OK']);
  assert.deepEqual(chup(file, "SELECT i.* FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id WHERE f.unit_code IN ('533140', '537220') ORDER BY i.id"), t533);
  assert.equal(chup(file, "SELECT COUNT(*) AS n FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id WHERE f.file_date = '2026-10-15' AND i.arrival_date = '2026-10-14'")[0].n, 2,
    'dòng có ngày đến 14/10 nằm ở file 15/10 KHÔNG bị xóa');
  const sau = demBang(file);
  assert.equal(sau.arrival_items, truoc.arrival_items - 8);
  assert.equal(sau.arrival_import_files, truoc.arrival_import_files - 5);
  // trạng thái phát giữ nguyên
  assert.deepEqual(PHAT_SQL.map((q) => chup(file, q)), phatTruoc);
  // thùng rác + nhật ký: một mẻ cho mỗi (BCVH, file_date)
  const nk = chup(file, 'SELECT id, bcvh, ngay, so_file_cu, so_dong_cu, shbg_cu, shbg_mat_that, tap_file_moi, so_file_moi, ket_qua, dong_y_mat, nguoi_thuc_hien, duong_dan_sao_luu, thung_rac_het_han_luc FROM thay_the_nhat_ky ORDER BY id');
  assert.deepEqual(nk.map((n) => [n.bcvh, n.ngay, n.so_file_cu, n.so_dong_cu, n.shbg_cu]),
    [['535470', '2026-10-01', 2, 5, 4], ['535470', '2026-10-14', 1, 2, 2], ['536250', '2026-10-05', 2, 1, 1]]);
  assert.deepEqual(nk.map((n) => n.shbg_mat_that), [4, 1, 1], 'A6 còn ở file 15/10 nên không tính mất thật');
  assert.ok(nk.every((n) => n.tap_file_moi === '[]' && n.so_file_moi === 0 && n.ket_qua === 'THANH_CONG' && n.dong_y_mat === 1 && /^script:xoa-du-lieu-bcvh:/.test(n.nguoi_thuc_hien)));
  const hetHan = Date.parse(nk[0].thung_rac_het_han_luc) - Date.now();
  assert.ok(hetHan > 29 * 86400000 && hetHan <= 30 * 86400000 + 60000, 'thùng rác 30 ngày');
  assert.equal(sau.thung_rac_dong, 8);
  assert.equal(sau.thung_rac_file, 5);
  assert.equal(sau.sftp_sync_runs, 0, 'đã nhả khoá');
  // sao lưu: một bản, in CHỈ tên tệp
  const bk = fs.readdirSync(path.join(path.dirname(file), 'backups'));
  assert.equal(bk.length, 1);
  assert.match(bk[0], XB.TEN_SAO_LUU_RE);
  assert.match(bk[0], /^truoc-xoa-bcvh_535470-536250_2026-10-01_2026-10-14_/);
  assert.ok(r.stdout.includes(`sao lưu: ${bk[0]} (`));
  assert.ok(!r.stdout.includes(path.dirname(file)), 'không in đường dẫn thư mục');
  assert.equal(path.basename(nk[0].duong_dan_sao_luu), bk[0]);
  moDoc(path.join(path.dirname(file), 'backups', bk[0]), (db) => assert.equal(db.prepare('SELECT COUNT(*) FROM arrival_items').pluck().get(), truoc.arrival_items, 'bản sao lưu là DB trước khi xóa'));
  assert.doesNotMatch(r.stdout + r.stderr, /ZZ5J/);
  // chạy lại: không còn gì, không sao lưu thêm
  const lai = chay(['--bcvh', '535470,536250', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
  assert.equal(lai.status, 0, lai.stderr);
  assert.match(lai.stdout, /Không có file nào để xóa — KHÔNG sao lưu/);
  assert.equal(fs.readdirSync(path.join(path.dirname(file), 'backups')).filter((t) => t.endsWith('.db')).length, 1, '(-wal / -shm là do test mở bản sao lưu ở trên)');
});

test('xóa rồi nạp lại được bằng importer: trước khi xóa cùng file bị chặn («đã nạp»), cùng tên khác nội dung → CONFLICT; sau khi xóa nạp lại OK', async () => {
  const file = taoDb();
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const viet = (dir, shbgs) => {
    const f = path.join(workDir, dir, tenFile('537015', '2026-10-03', '093012'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const dong = shbgs.map((s, i) => ({ Ma_BC_dong: '990001', BC_nhan_BG: '537015', SHBG: s, So_hieu_BD8: `B${i}`, 'Thời gian XN túi': '10/3/2026 8:00:00 AM', Khoi_luong_thuc_te: '100' }));
    fs.writeFileSync(f, '﻿' + [EXPECTED_HEADER.map(q).join(','), ...dong.map((r) => EXPECTED_HEADER.map((h) => q(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    return f;
  };
  const csv = viet(`csv${soDb}a`, [trk('D1'), trk('D2'), trk('D3')]);
  const csvKhac = viet(`csv${soDb}b`, [trk('D1'), trk('D9')]);
  const nap = (f) => { const env = { ...process.env }; delete env.ARRIVALS_DB; return spawnSync(process.execPath, [IMPORT, f, '--db', file], { encoding: 'utf8', env, cwd: workDir }); };
  let r = nap(csv);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK\s+\|\s+3\s+\|\s+3/);
  r = nap(csv);
  assert.match(r.stdout, /OK \(đã nạp\)/, 'cùng tên + cùng sha256: bị chặn');
  r = nap(csvKhac);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /CONFLICT/, 'cùng tên khác nội dung: bị chặn');

  const x = chay(['--bcvh', '537015', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
  assert.equal(x.status, 0, x.stderr);
  assert.match(x.stdout, /2026-10-03\s+2\s+3\s+3/, 'xóa cả bản ghi OK lẫn bản ghi CONFLICT của ngày');
  assert.deepEqual(fileCon(file, '537015'), []);

  r = nap(csvKhac); // file MỚI (đã xuất lại) — khác sha256 — nạp được
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK\s+\|\s+2\s+\|\s+2/);
  assert.deepEqual(fileCon(file, '537015'), ['2026-10-03:OK']);
  // và bản cũ cũng nạp lại được nếu xóa lần nữa (không còn dấu «đã nạp» theo tên / sha256)
  assert.equal(chay(['--bcvh', '537015', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]).status, 0);
  const db = new Database(file);
  try {
    const k = await importArrivalFile(db, csv);
    assert.equal(k.status, 'OK');
    assert.ok(!k.alreadyImported);
    assert.equal(k.inserted, 3);
  } finally { db.close(); }
});

test('lỗi giữa chừng (bản ghi file thứ hai không xóa được) → hoàn tác TOÀN BỘ, mã thoát 1, khoá được nhả', () => {
  const file = taoDb();
  const db = new Database(file);
  db.exec("CREATE TRIGGER chan_xoa BEFORE DELETE ON arrival_import_files WHEN OLD.unit_code = '537220' BEGIN SELECT RAISE(ABORT, 'gia lap loi'); END;");
  db.close();
  const truoc = demBang(file);
  const r = chay(['--bcvh', '535470,537220', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /đã hoàn tác toàn bộ, DB y nguyên/);
  assert.deepEqual(demBang(file), truoc, 'dòng của 535470 (đã xóa trước trong giao dịch) cũng quay lại; không có nhật ký / thùng rác nửa vời');
  assert.deepEqual(fileCon(file, '535470'), ['2026-09-30:OK', '2026-10-01:OK', '2026-10-01:OK', '2026-10-14:OK', '2026-10-15:OK']);
});

test('lỗi giữa chừng (gọi trong tiến trình, sau khi đã xóa dòng của cặp đầu) → hoàn tác toàn bộ', async () => {
  const file = taoDb();
  const truoc = demBang(file);
  const db = new Database(file);
  try {
    await assert.rejects(XB.xoaThat({ db, bcvh: ['535470', '536250'], tu: TU, den: DEN, xacNhan: XAC_NHAN, options: { sauKhiXoa: (b) => { if (b === '536250') throw new Error('gia lap'); } } }),
      (e) => e instanceof XB.XoaLoi && e.maThoat === 1 && /hoàn tác toàn bộ/.test(e.message));
  } finally { db.close(); }
  assert.deepEqual(demBang(file), truoc);
});

test('đang có lượt đồng bộ SFTP (khoá ở sftp_sync_runs) → mã thoát 7, không xóa', () => {
  const file = taoDb();
  const db = new Database(file);
  db.prepare("INSERT INTO sftp_sync_runs (started_at, \"trigger\") VALUES (?, 'TIMER')").run(new Date().toISOString());
  db.close();
  const truoc = demBang(file);
  const r = chay(['--bcvh', '535470', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]);
  assert.equal(r.status, 7, r.stderr);
  assert.match(r.stderr, /Đang có một lượt đồng bộ SFTP chạy/);
  assert.deepEqual(demBang(file), truoc);
});

test('quay lại: «Khôi phục» của «Thay thế ngày» (5g-5) trả lại đúng một mẻ đã xóa', async () => {
  const file = taoDb();
  assert.equal(chay(['--bcvh', '535470', ...co(file), '--chay-that', '--xac-nhan', XAC_NHAN]).status, 0);
  const db = new Database(file);
  try {
    const nk = db.prepare("SELECT id FROM thay_the_nhat_ky WHERE bcvh = '535470' AND ngay = '2026-10-01'").get();
    const kq = await KP.khoiPhuc({ db, nhatKyId: nk.id, xacNhan: { ma_bcvh: '535470', ngay: '2026-10-01' }, nguoiThucHien: 'test', sauLuuDir: path.join(path.dirname(file), 'backups'), options: { dangDongBo: () => false } });
    assert.ok(kq);
    assert.equal(db.prepare("SELECT COUNT(*) FROM arrival_import_files WHERE unit_code = '535470' AND file_date = '2026-10-01'").pluck().get(), 2);
    assert.equal(db.prepare("SELECT COUNT(*) FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id WHERE f.unit_code = '535470' AND f.file_date = '2026-10-01'").pluck().get(), 5);
    assert.equal(db.prepare("SELECT COUNT(*) FROM arrival_import_files WHERE unit_code = '535470' AND file_date = '2026-10-14'").pluck().get(), 0, 'mẻ khác vẫn đang xóa');
  } finally { db.close(); }
});

test('giữ 5 bản sao lưu gần nhất của lệnh này; không đụng bản của «Thay thế»', () => {
  const dir = path.join(workDir, 'bk-don');
  fs.mkdirSync(dir, { recursive: true });
  const ten = (i) => `truoc-xoa-bcvh_535470_2026-10-01_2026-10-14_202610${String(i).padStart(2, '0')}T010000Z.db`;
  for (let i = 1; i <= 7; i++) fs.writeFileSync(path.join(dir, ten(i)), 'x');
  fs.writeFileSync(path.join(dir, 'truoc-thay-the_533140_2026-10-10_20261001T010000Z.db'), 'x');
  assert.equal(XB.donSaoLuuXoa(dir), 2);
  const con = fs.readdirSync(dir).sort();
  assert.deepEqual(con, ['truoc-thay-the_533140_2026-10-10_20261001T010000Z.db', ...[3, 4, 5, 6, 7].map(ten)].sort());
});
