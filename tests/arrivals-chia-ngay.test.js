// ==========================================
// Test SANLUONG-5k: scripts/import-arrivals.js --chia-ngay — nạp MỘT file nhiều ngày, tự chia theo ngày đến BCVH, MỘT giao dịch.
// DB tạm riêng mỗi ca, CSV / SHBG GIẢ trong thư mục tạm. Không mở data/, không đọc .env, không mạng.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const A = require('../server/lib/arrivalsImport');
const S = require('../server/lib/sftpSync');
const N = require('../server/lib/napNguonDoc');

const IMPORT = path.join(__dirname, '..', 'scripts', 'import-arrivals.js');
const BC = '535470';
let workDir;
let n = 0;
let seq = 0;

before(() => { workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-chia-ngay-test-')); });
after(() => { fs.rmSync(workDir, { recursive: true, force: true }); });

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const dayOf = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const iso = (day, hms = '08:00:00') => `${day} ${hms}`;

/** Một dòng giả. o.tui = thời gian XN túi (ISO), o.ma = BC_nhan_BG. */
function dong(o = {}) {
  return { Ma_BC_dong: '990001', BC_nhan_BG: o.ma ?? BC, Ten_duong_thu: 'Đường thư giả', SHBG: o.shbg ?? `ZZ5K${String(++seq).padStart(7, '0')}VN`, So_hieu_BD10: '', 'Thời gian XN túi': o.tui ?? '',
    'Thời gian XN BG': o.bg ?? '', Ngay_gio_XND_BD10: '', Ngay_gio_XND_BD10_tai_TTKT: '', So_hieu_BD8: o.bd8 ?? `B${seq}`, Khoi_luong_thuc_te: '100', Dich_vu_code: 'R',
    Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: '', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử' };
}
function viet(ten, rows) {
  const f = path.join(workDir, `csv${++n}`, ten);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '﻿' + [A.EXPECTED_HEADER.map(q).join(','), ...rows.map((r) => A.EXPECTED_HEADER.map((h) => q(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
  return f;
}
/** File phủ 01..14/10: ngày d có d dòng (để mỗi nhóm một cỡ khác nhau). */
function file14(ten = `HangDen_${BC}_20261014_093000.csv`) {
  const rows = [];
  for (let d = 1; d <= 14; d++) for (let k = 0; k < d; k++) rows.push(dong({ tui: iso(dayOf(d), `0${k % 9}:10:00`) }));
  return { f: viet(ten, rows), tong: rows.length };
}

function taoDb() {
  const file = path.join(workDir, `db${++n}.db`);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT);
    CREATE TABLE commune_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, province_id TEXT);
    CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, type TEXT, commune_id TEXT);`);
  A.ensureArrivalSchema(db);
  S.ensureSftpSyncSchema(db);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  return file;
}
const doc = (file, sql) => { const db = new Database(file, { readonly: true }); try { return db.prepare(sql).all(); } finally { db.close(); } };
const chay = (file, args) => {
  const env = { ...process.env }; delete env.ARRIVALS_DB;
  return spawnSync(process.execPath, [IMPORT, ...args, '--db', file], { encoding: 'utf8', env, cwd: workDir });
};
const demAll = (file) => doc(file, 'SELECT (SELECT COUNT(*) FROM arrival_items) AS i, (SELECT COUNT(*) FROM arrival_import_files) AS f, (SELECT COUNT(*) FROM ward_bdx_map) AS w')[0];

test('file 14 ngày chia đúng 14 nhóm: tên / file_date / số dòng đúng, mỗi dòng thuộc đúng một nhóm, in từng ngày + tổng', () => {
  const db = taoDb();
  const { f, tong } = file14();
  const r = chay(db, [f, '--chia-ngay']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const files = doc(db, 'SELECT id, unit_code, file_name, file_date, file_time, source, status, row_count, inserted_count, sha256, file_size FROM arrival_import_files ORDER BY file_date');
  assert.equal(files.length, 14);
  files.forEach((x, i) => {
    const d = i + 1;
    assert.equal(x.file_date, dayOf(d));
    assert.equal(x.file_name, `HangDen_${BC}_202610${String(d).padStart(2, '0')}_235959.csv`);
    assert.deepEqual([x.unit_code, x.file_time, x.source, x.status, x.row_count, x.inserted_count], [BC, '23:59:59', 'MANUAL', 'OK', d, d]);
  });
  assert.equal(new Set(files.map((x) => x.sha256)).size, 1, 'sha256 = của file thật');
  assert.equal(files[0].file_size, fs.statSync(f).size);
  assert.equal(doc(db, 'SELECT COUNT(*) AS n FROM arrival_items')[0].n, tong);
  assert.equal(doc(db, 'SELECT COUNT(*) AS n FROM arrival_items i JOIN arrival_import_files f ON f.id = i.import_file_id WHERE i.arrival_date <> f.file_date')[0].n, 0, 'mỗi dòng nằm ở nhóm đúng ngày đến');
  assert.match(r.stdout, /2026-10-01 \|\s+1 \|\s+1 \|\s+1 \|\s+0 \|/);
  assert.match(r.stdout, /2026-10-14 \|\s+14 \|\s+14 \|\s+14 \|\s+0 \|/);
  assert.match(r.stdout, new RegExp(`Tổng: 14 ngày, ${tong} dòng, ${tong} SHBG \\(cộng theo ngày\\), ${tong} dòng nạp mới, 0 dòng bỏ qua`));
  assert.doesNotMatch(r.stdout + r.stderr, /ZZ5K/, 'không in SHBG');
});

test('không có cờ: hành vi cũ không đổi (file 14 ngày bị REJECTED, không ghi gì)', () => {
  const db = taoDb();
  const { f } = file14();
  const r = chay(db, [f]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /REJECTED/);
  assert.match(r.stdout, /ngoài khoảng/);
  assert.deepEqual(doc(db, 'SELECT status FROM arrival_import_files').map((x) => x.status), ['REJECTED']);
  assert.equal(demAll(db).i, 0);
  // và file nhỏ trong khoảng nạp như cũ: một bản ghi, đúng tên file
  const nho = viet(`HangDen_${BC}_20261014_100000.csv`, [dong({ tui: iso('2026-10-13') }), dong({ tui: iso('2026-10-14') })]);
  const r2 = chay(taoDb(), [nho]);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /HangDen_535470_20261014_100000\.csv\s+\|\s+OK/);
});

test('nạp lại cùng file: 0 dòng mới, mọi nhóm «đã nạp», DB không đổi', () => {
  const db = taoDb();
  const { f, tong } = file14();
  assert.equal(chay(db, [f, '--chia-ngay']).status, 0);
  const truoc = demAll(db);
  const r = chay(db, [f, '--chia-ngay']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`${tong} dòng, ${tong} SHBG \\(cộng theo ngày\\), 0 dòng nạp mới`));
  assert.equal((r.stdout.match(/đã nạp/g) || []).length, 14);
  assert.deepEqual(demAll(db), truoc);
});

test('đổi tên file (cùng nội dung) hoặc nạp file khác chồng ngày: dòng trùng khoá bị bỏ qua, nhóm vẫn khớp tên → CONFLICT hoàn tác toàn bộ', () => {
  const db = taoDb();
  const { f } = file14();
  assert.equal(chay(db, [f, '--chia-ngay']).status, 0);
  // cùng nội dung, tên khác giờ: sha giống, tên ảo giống → «đã nạp» hết, 0 mới
  const f2 = path.join(path.dirname(f), `HangDen_${BC}_20261014_180000.csv`);
  fs.copyFileSync(f, f2);
  const r = chay(db, [f2, '--chia-ngay']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /0 dòng nạp mới/);
  // file khác nội dung nhưng phủ cùng ngày: tên ảo trùng, sha khác → CONFLICT, không ghi gì thêm
  const khac = viet(`HangDen_${BC}_20261014_200000.csv`, [dong({ tui: iso('2026-10-14') }), dong({ tui: iso('2026-10-13') })]);
  const truoc = demAll(db);
  const r2 = chay(db, [khac, '--chia-ngay']);
  assert.equal(r2.status, 2, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /CONFLICT/);
  assert.match(r2.stdout, /Không ghi gì \(đã hoàn tác toàn bộ\)/);
  assert.deepEqual(demAll(db), truoc);
});

test('lỗi giữa chừng (sau nhóm thứ 5) → hoàn tác TOÀN BỘ: không file, không dòng, không phường/xã', async () => {
  const dbf = taoDb();
  const { f } = file14();
  const db = new Database(dbf);
  try {
    const d = await A.chuanBiFileChiaNgay(f);
    assert.equal(d.ketLuan, 'READY');
    assert.equal(d.nhom.length, 14);
    const kq = A.ghiFileChiaNgay(db, d, { sauMoiNhom: (ngay) => { if (ngay === dayOf(5)) throw new Error('gia lap loi'); } });
    assert.equal(kq.status, 'REJECTED');
    assert.match(kq.error, /đã hoàn tác toàn bộ/);
  } finally { db.close(); }
  assert.deepEqual(demAll(dbf), { i: 0, f: 0, w: 0 });
  // và nạp lại sau lỗi vẫn được
  assert.equal(chay(dbf, [f, '--chia-ngay']).status, 0);
  assert.equal(demAll(dbf).f, 14);
});

test('lưới «Nạp dữ liệu nguồn»: mỗi ngày 01–14/10 có đúng số dòng và 1 file nhập tay (không còn ô trống)', () => {
  const dbf = taoDb();
  const { f } = file14();
  assert.equal(chay(dbf, [f, '--chia-ngay']).status, 0);
  const db = new Database(dbf, { readonly: true });
  try {
    const kq = N.luoi({ db, now: new Date('2026-10-15T05:00:00Z'), tu: '2026-10-01', den: '2026-10-14', bcvh: BC });
    const ngay = kq.ngay_bcvh.filter((x) => x.bcvh === BC);
    assert.equal(ngay.length, 14);
    for (const x of ngay) {
      const d = Number(x.ngay.slice(8));
      assert.equal(x.tong_dong, d, `ngày ${x.ngay}`);
      assert.equal(x.so_file_db, 1);
    }
    const o = kq.o.filter((x) => x.bcvh === BC);
    assert.ok(o.length === 28 && o.every((x) => x.trang_thai === 'NHAP_TAY'), 'cả hai đợt S và C của mỗi ngày là NHAP_TAY: ' + [...new Set(o.map((x) => x.trang_thai))]);
  } finally { db.close(); }
});

test('dòng không có mốc đến và dòng ngày đến lạ (≤ 1%) → ngày trong tên file + cảnh báo; > 1% → REJECTED, không ghi gì', () => {
  const dbf = taoDb();
  const rows = [];
  for (let d = 10; d <= 14; d++) for (let k = 0; k < 40; k++) rows.push(dong({ tui: iso(dayOf(d)) }));
  rows.push(dong({ tui: '' }));                     // không có mốc nào
  rows.push(dong({ tui: iso('2026-03-01') }));       // cách nhiều tháng: 1/201 dòng có ngày đến (≈ 0,5%)
  const f = viet(`HangDen_${BC}_20261014_093000.csv`, rows);
  const r = chay(dbf, [f, '--chia-ngay']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Cảnh báo: 1\/201 dòng có ngày đến BCVH ngoài khoảng 2026-09-14\.\.2026-10-15 — xếp vào ngày trong tên file \(2026-10-14\)/);
  assert.match(r.stdout, /Cảnh báo: 1 dòng không có mốc đến BCVH nào — xếp vào ngày trong tên file \(2026-10-14\)/);
  assert.equal(doc(dbf, "SELECT COUNT(*) AS n FROM arrival_items WHERE arrival_date = '2026-03-01'")[0].n, 1, 'ngày đến giữ nguyên');
  assert.equal(doc(dbf, "SELECT row_count AS n FROM arrival_import_files WHERE file_date = '2026-10-14'")[0].n, 42, '40 + 2 dòng xếp vào ngày tên file');
  assert.equal(demAll(dbf).f, 5, 'không tạo nhóm cho tháng 3');
  // > 1%
  const dbf2 = taoDb();
  const xau = rows.slice(0, 200);
  for (let i = 0; i < 3; i++) xau.push(dong({ tui: iso('2026-03-01') }));
  const f2 = viet(`HangDen_${BC}_20261014_110000.csv`, xau);
  const r2 = chay(dbf2, [f2, '--chia-ngay']);
  assert.equal(r2.status, 2, r2.stdout);
  assert.match(r2.stdout, /REJECTED — 3\/203 dòng có ngày đến BCVH ngoài khoảng .* \(> 1%\)/);
  assert.deepEqual(demAll(dbf2), { i: 0, f: 0, w: 0 });
});

test('giới hạn: tên sai mẫu, thư mục, mã BC_nhan_BG không khớp tên (> 1%), 32 ngày khác nhau, ngày trong tên không có thật', () => {
  const dbf = taoDb();
  const ok = [dong({ tui: iso('2026-10-14') })];
  let r = chay(dbf, [viet('xuat-moi.csv', ok), '--chia-ngay']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED_NAME/);
  r = chay(dbf, [path.dirname(viet(`HangDen_${BC}_20261014_093000.csv`, ok)), '--chia-ngay']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--chia-ngay chỉ nhận MỘT file/);
  r = chay(dbf, [viet(`HangDen_${BC}_20261014_094000.csv`, [dong({ tui: iso('2026-10-14'), ma: '536250' }), dong({ tui: iso('2026-10-14') })]), '--chia-ngay']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /1\/2 dòng có BC_nhan_BG khác mã 535470 trong tên file/);
  // 32 ngày khác nhau trong [fd−30, fd+1] → vượt 31
  const nhieu = [];
  for (let off = -30; off <= 1; off++) { const t = new Date(Date.UTC(2026, 9, 14 + off)); nhieu.push(dong({ tui: iso(t.toISOString().slice(0, 10)) })); }
  r = chay(dbf, [viet(`HangDen_${BC}_20261014_095000.csv`, nhieu), '--chia-ngay']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /File phủ 32 ngày, vượt tối đa 31 ngày/);
  r = chay(dbf, [viet(`HangDen_${BC}_20261340_095000.csv`, ok), '--chia-ngay']);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /không có thật/);
  assert.deepEqual(demAll(dbf), { i: 0, f: 0, w: 0 }, 'không lần nào ghi gì');
  // 31 ngày: nhận
  const ba1 = nhieu.slice(1);
  r = chay(dbf, [viet(`HangDen_${BC}_20261014_096000.csv`, ba1), '--chia-ngay']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(demAll(dbf).f, 31);
});

test('file rỗng / chỉ BOM / chỉ tiêu đề với --chia-ngay: không ghi gì, mã thoát 0', () => {
  const dbf = taoDb();
  const bom = path.join(workDir, 'rong', `HangDen_${BC}_20261014_093000.csv`);
  fs.mkdirSync(path.dirname(bom), { recursive: true });
  fs.writeFileSync(bom, '﻿');
  assert.equal(chay(dbf, [bom, '--chia-ngay']).status, 0);
  assert.equal(chay(dbf, [viet(`HangDen_${BC}_20261014_093100.csv`, []), '--chia-ngay']).status, 0);
  assert.deepEqual(demAll(dbf), { i: 0, f: 0, w: 0 });
});
