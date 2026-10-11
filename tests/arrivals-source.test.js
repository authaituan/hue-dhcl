// ==========================================
// Test SANLUONG-3g: quy tắc ngày đến R2 (tính lại bằng scripts/rederive-arrival.js), chỉ số "đã đóng chuyến, chưa nhận tại BCVH" (ADMIN),
// chất lượng khai thác theo nguồn BD10 (tiền tố TTKT). Server thật trên DB tạm; CSV / số hiệu GIẢ (tiền tố 530100 giả cho nhóm TTKT).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, ensureArrivalSchema, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { TTKT_BD10_PREFIX } = require('../server/lib/arrivalsQuery');
const { rederive } = require('../scripts/rederive-arrival');
const { replaceAssignedBcvh } = require('../server/lib/userBcvh');

const PORT = 5916;
const BC = '533140';
const BC2 = '535470'; // BCVH thứ hai (GDVH được giao BCVH này)
const TTKT = TTKT_BD10_PREFIX; // '530100'
const OTHER = '531120'; // tiền tố bưu cục khác (giả)
const USERS = {
  admin: { hrm: 'SR_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'SR_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  staff: { hrm: 'SR_STAFF', pass: 'Staff@123', role: 'STAFF' },
  gdvhBc: { hrm: 'SR_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 533140
  gdvhBc2: { hrm: 'SR_GDVH2', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 535470
  gdvhNone: { hrm: 'SR_GDVH0', pass: 'Gdvh@123', role: 'GDVH' } // chưa được giao
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;

const bd10 = (prefix, n) => `${prefix}99${String(n).padStart(11, '0')}`; // 19 chữ số giả
function row(over = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: BC, Ten_duong_thu: 'Đường thư giả', SHBG: `ZZ6${String(seq).padStart(8, '0')}VN`,
    So_hieu_BD10: '', 'Thời gian XN túi': '', 'Thời gian XN BG': '', Ngay_gio_XND_BD10: '', Ngay_gio_XND_BD10_tai_TTKT: '',
    So_hieu_BD8: `T-${seq}`, Khoi_luong_thuc_te: '100', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: '',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', ...over
  };
}
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
function writeCsv(name, rows) {
  const file = path.join(workDir, `${++seq}`, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [EXPECTED_HEADER.map(q).join(','), ...rows.map((r) => EXPECTED_HEADER.map((h) => q(r[h] ?? '')).join(','))];
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n');
  return file;
}
const BAG = 'Thời gian XN túi';
const ITEM = 'Thời gian XN BG';
const BD10T = 'Ngay_gio_XND_BD10';
const TTKT_AT = 'Ngay_gio_XND_BD10_tai_TTKT';
const id = (n) => `ZZ6S${String(n).padStart(7, '0')}VN`;

// File 04/10 — mốc đều ngày 04/10. Nhóm TTKT (BD10 530100…: XNĐ BD10 luôn trống), khác (531120…), không BD10.
const FILE_04 = [
  row({ SHBG: id(1), So_hieu_BD10: bd10(TTKT, 1), [BAG]: '10/4/2026 8:00:00 AM', [ITEM]: '10/4/2026 8:10:00 AM', [TTKT_AT]: '10/4/2026 1:00:00 AM' }), // ttkt đủ
  row({ SHBG: id(2), So_hieu_BD10: bd10(TTKT, 2), [BAG]: '10/4/2026 8:00:00 AM' }), // ttkt thiếu (chỉ túi)
  row({ SHBG: id(3), So_hieu_BD10: bd10(TTKT, 3), [ITEM]: '10/4/2026 8:10:00 AM' }), // ttkt thiếu (chỉ bưu gửi)
  row({ SHBG: id(4), So_hieu_BD10: bd10(OTHER, 4), [BAG]: '10/4/2026 8:00:00 AM', [ITEM]: '10/4/2026 8:10:00 AM', [BD10T]: '10/4/2026 7:00:00 AM' }), // khác đủ 3 mốc
  row({ SHBG: id(5), So_hieu_BD10: bd10(OTHER, 5), [BAG]: '10/4/2026 8:00:00 AM', [ITEM]: '10/4/2026 8:10:00 AM' }), // khác thiếu XNĐ BD10
  row({ SHBG: id(6), So_hieu_BD10: bd10(OTHER, 6), [BAG]: '10/4/2026 8:00:00 AM', [BD10T]: '10/4/2026 7:00:00 AM' }), // khác thiếu XN bưu gửi
  row({ SHBG: id(7), So_hieu_BD10: '', [ITEM]: '10/4/2026 9:00:00 AM' }), // không BD10: đủ (có XN bưu gửi)
  row({ SHBG: id(8), So_hieu_BD10: '', [BAG]: '10/4/2026 9:00:00 AM' }), // không BD10: thiếu (chỉ túi)
  row({ SHBG: id(9), So_hieu_BD10: '', [BAG]: '10/4/2026 9:00:00 AM', [ITEM]: '10/4/2026 9:05:00 AM' }), // không BD10: đủ
  // Nhiều dòng, nhiều tiền tố: dòng đại diện = dòng có arrival_at sớm nhất (TTKT, túi 08:00) -> nhóm ttkt, đủ
  row({ SHBG: id(10), So_hieu_BD10: bd10(TTKT, 10), [BAG]: '10/4/2026 8:00:00 AM', [ITEM]: '10/4/2026 8:05:00 AM' }),
  row({ SHBG: id(10), So_hieu_BD10: bd10(OTHER, 10), [BAG]: '10/4/2026 9:30:00 AM' }),
  // Chưa nhận tại BCVH: không mốc BCVH nào, có mốc đóng chuyến
  row({ SHBG: id(21), So_hieu_BD10: bd10(TTKT, 21), [TTKT_AT]: '10/4/2026 1:00:00 AM' }), // N1: sẽ có mốc ở file 06
  row({ SHBG: id(22), So_hieu_BD10: bd10(TTKT, 22), [TTKT_AT]: '10/3/2026 11:00:00 PM' }), // N2: tuổi 3
  row({ SHBG: id(23), So_hieu_BD10: bd10(TTKT, 23) }) // N3: không mốc nào kể cả đóng chuyến
];
const FILE_05 = [
  row({ SHBG: id(24), So_hieu_BD10: bd10(TTKT, 24), [TTKT_AT]: '10/5/2026 2:00:00 AM' }) // N5: tuổi 1
];
const FILE_06 = [
  row({ SHBG: id(25), So_hieu_BD10: bd10(TTKT, 25), [TTKT_AT]: '10/6/2026 3:00:00 AM' }), // N4: tuổi 0
  row({ SHBG: id(21), So_hieu_BD10: bd10(TTKT, 21), [BAG]: '10/6/2026 8:00:00 AM', [TTKT_AT]: '10/4/2026 1:00:00 AM', So_hieu_BD8: 'T-N1-LATER' }) // N1 được nhận
];
// BCVH thứ hai: chỉ có bưu gửi chưa nhận (không mốc BCVH, có mốc lập BD10) -> không ảnh hưởng sản lượng của 533140
const FILE_04_BC2 = [row({ BC_nhan_BG: BC2, SHBG: id(31), So_hieu_BD10: bd10(TTKT, 31), [TTKT_AT]: '10/4/2026 4:00:00 AM' })];
const BC_ONLY = `receiver_code=${BC}`;
const R_0405 = `from=2026-10-04&to=2026-10-05&${BC_ONLY}`;
const R_0406 = `from=2026-10-04&to=2026-10-06&${BC_ONLY}`;

async function api(p, who) {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-arrivals-source-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-arrivals-source-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '${BC}', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An');
  `);
  const uids = {};
  for (const [k, u] of Object.entries(USERS)) {
    uids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, uids.gdvhBc, [BC]);
  replaceAssignedBcvh(ctx.db, uids.gdvhBc2, [BC2]);
  for (const [name, rows] of [[`HangDen_${BC}_20261004_093012.csv`, FILE_04], [`HangDen_${BC}_20261005_093012.csv`, FILE_05], [`HangDen_${BC}_20261006_093012.csv`, FILE_06],
    [`HangDen_${BC2}_20261004_093012.csv`, FILE_04_BC2]]) {
    const r = await importArrivalFile(ctx.db, writeCsv(name, rows));
    assert.equal(r.status, 'OK', JSON.stringify(r));
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

// ------------------------------------------
// R2 + tính lại dữ liệu đã nạp
// ------------------------------------------
test('rederive R2: túi; túi+bưu gửi; BD10 sớm bất thường không thắng túi; chỉ BD10; ba mốc trống; nhiều dòng; chạy lại 2 lần giống nhau', () => {
  const file = path.join(workDir, 'rederive.db');
  const db = new Database(file);
  ensureArrivalSchema(db);
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'533140','f.csv','2026-10-04','093012',1,'x','OK')").run();
  const ins = db.prepare(`INSERT INTO arrival_items (import_file_id, tracking_no, bd8_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at, bd10_ttkt_confirmed_at,
    arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const date = (t) => (t ? t.slice(0, 10) : null);
  // Cột arrival_* ghi theo quy tắc CŨ (mốc sớm nhất, hoà: túi → BD10 → bưu gửi) để thấy script đổi gì.
  const oldRule = (bag, item, b10) => {
    const marks = [['bag', bag], ['bd10', b10], ['item', item]].filter(([, v]) => v);
    if (!marks.length) return [null, null, null, 0];
    let best = marks[0]; for (const m of marks) if (m[1] < best[1]) best = m;
    return [best[1], best[0], date(best[1]), marks.length];
  };
  const add = (trk, bd8, bag, item, b10, ttkt) => ins.run(trk, bd8, bag, item, b10, ttkt, ...oldRule(bag, item, b10));
  add('S1', 'a', '2026-10-04 08:00:00', null, null, null); // chỉ túi: không đổi
  add('S2', 'a', '2026-10-04 08:00:00', '2026-10-04 08:10:00', null, null); // túi + bưu gửi: không đổi
  add('S3', 'a', '2026-10-04 09:00:00', '2026-10-04 08:00:00', '2026-10-02 07:00:00', null); // BD10 sớm bất thường: cũ = bd10 02/10 -> R2 = túi 04/10 09:00
  add('S4', 'a', null, null, '2026-10-04 06:00:00', null); // chỉ BD10: không đổi
  add('S5', 'a', null, null, null, '2026-10-04 01:00:00'); // ba mốc trống (chỉ TTKT): vẫn NULL, TTKT không thành ngày đến
  add('S6', 'a', null, '2026-10-04 08:10:00', '2026-10-04 06:00:00', null); // item + bd10: cũ = bd10 06:00 -> R2 = bưu gửi 08:10
  add('S7', 'a', '2026-10-04 10:00:00', null, null, null); // nhiều dòng một bưu gửi: dòng 1
  add('S7', 'b', null, null, '2026-10-03 22:00:00', null); // dòng 2: chỉ BD10 (không đổi)
  db.close();

  const open = (readonly) => new Database(file, { readonly });
  const snapshot = () => { const d = open(true); const r = d.prepare('SELECT * FROM arrival_items ORDER BY id').all(); d.close(); return JSON.stringify(r); };

  const before1 = snapshot();
  const dry = open(true);
  const s0 = rederive(dry, { apply: false });
  dry.close();
  assert.equal(snapshot(), before1, 'chạy thử KHÔNG ghi');
  assert.equal(s0.total, 8);
  assert.equal(s0.changed, 2, 'S3 và S6');
  assert.equal(s0.later, 1, 'S3: 02/10 -> 04/10 (muộn đi)');
  assert.equal(s0.sameDay, 1, 'S6: cùng ngày, đổi giờ + mốc căn cứ');
  assert.equal(s0.earlier, 0);
  assert.deepEqual([...s0.basis.entries()].sort(), [['bd10 -> bag', 1], ['bd10 -> item', 1]]);
  assert.equal(s0.dayPairs.get('2026-10-02 -> 2026-10-04'), 1);

  const rw = open(false);
  const s1 = rederive(rw, { apply: true });
  rw.close();
  assert.equal(s1.changed, 2);
  const after1 = snapshot();
  const d2 = open(true);
  const got = Object.fromEntries(d2.prepare('SELECT tracking_no, bd8_no, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count FROM arrival_items ORDER BY id').all().map((r) => [`${r.tracking_no}${r.bd8_no}`, r]));
  d2.close();
  assert.deepEqual([got.S3a.arrival_at, got.S3a.arrival_at_basis, got.S3a.arrival_date, got.S3a.arrival_evidence_count], ['2026-10-04 09:00:00', 'bag', '2026-10-04', 3], 'BD10 sớm không thắng túi');
  assert.deepEqual([got.S6a.arrival_at, got.S6a.arrival_at_basis], ['2026-10-04 08:10:00', 'item']);
  assert.deepEqual([got.S4a.arrival_at, got.S4a.arrival_at_basis], ['2026-10-04 06:00:00', 'bd10'], 'chỉ BD10: dùng BD10');
  assert.deepEqual([got.S5a.arrival_at, got.S5a.arrival_date, got.S5a.arrival_at_basis, got.S5a.arrival_evidence_count], [null, null, null, 0], 'TTKT không làm ngày đến');
  assert.deepEqual([got.S7a.arrival_at_basis, got.S7b.arrival_at_basis], ['bag', 'bd10']);
  // lần 2 (idempotent): 0 dòng đổi, dữ liệu y nguyên
  const rw2 = open(false);
  const s2 = rederive(rw2, { apply: true });
  rw2.close();
  assert.equal(s2.changed, 0);
  assert.equal(snapshot(), after1);
  fs.rmSync(file, { force: true });
});

test('scripts/rederive-arrival.js: mặc định chạy thử (không ghi, in số liệu, không in số hiệu); --apply mới ghi; DB không tồn tại -> lỗi', () => {
  const file = path.join(workDir, 'cli.db');
  const db = new Database(file);
  ensureArrivalSchema(db);
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'533140','f.csv','2026-10-04','093012',1,'x','OK')").run();
  db.prepare(`INSERT INTO arrival_items (import_file_id, tracking_no, bag_confirmed_at, bd10_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count)
    VALUES (1, 'ZZ6CLI0000001VN', '2026-10-04 09:00:00', '2026-10-02 07:00:00', '2026-10-02 07:00:00', 'bd10', '2026-10-02', 2)`).run();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  const script = path.join(__dirname, '..', 'scripts', 'rederive-arrival.js');
  const dry = spawnSync(process.execPath, [script, '--db', file], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /CHẠY THỬ/);
  assert.match(dry.stdout, /Sẽ đổi 1 dòng/);
  assert.ok(!dry.stdout.includes('ZZ6CLI'), 'không in số hiệu');
  const peek = () => { const d = new Database(file, { readonly: true }); const r = d.prepare('SELECT arrival_date FROM arrival_items').get().arrival_date; d.close(); return r; };
  assert.equal(peek(), '2026-10-02', 'chạy thử không ghi');
  const app = spawnSync(process.execPath, [script, '--db', file, '--apply'], { encoding: 'utf8' });
  assert.equal(app.status, 0, app.stderr);
  assert.match(app.stdout, /Đã ghi 1 dòng/);
  assert.equal(peek(), '2026-10-04');
  const again = spawnSync(process.execPath, [script, '--db', file, '--apply'], { encoding: 'utf8' });
  assert.match(again.stdout, /Đã ghi 0 dòng/);
  const bad = spawnSync(process.execPath, [script, '--db', path.join(workDir, 'khong-co.db')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(spawnSync(process.execPath, [script, '--xyz'], { encoding: 'utf8' }).status, 1);
  fs.rmSync(file, { force: true });
});

test('R2 trong DB đã nạp: ngày đến theo túi → bưu gửi → BD10; tổng sản lượng 11 (04–06/10)', async () => {
  const rows = ctx.db.prepare('SELECT tracking_no, arrival_at, arrival_at_basis FROM arrival_items WHERE tracking_no = ? ORDER BY id').all(id(4));
  assert.deepEqual(rows.map((r) => [r.arrival_at, r.arrival_at_basis]), [['2026-10-04 08:00:00', 'bag']], 'đủ 3 mốc: túi thắng dù BD10 07:00 sớm hơn');
  const s = (await api(`/api/arrivals/summary?${R_0406}`, 'ttvh')).body;
  assert.equal(s.san_luong, 11);
});

// ------------------------------------------
// Chất lượng khai thác theo nguồn BD10
// ------------------------------------------
test('quality-mocs.tong_hop.theo_nguon: 3 nhóm, đủ theo nguồn, tổng ba nhóm = sản lượng; trường cũ còn nguyên', async () => {
  const m = (await api(`/api/arrivals/quality-mocs?${R_0405}`, 'ttvh')).body; // N1 chưa có mốc BCVH trong khoảng này
  assert.equal(m.san_luong, 10);
  const th = m.tong_hop;
  const by = Object.fromEntries(th.theo_nguon.map((g) => [g.nhom, g]));
  assert.deepEqual(th.theo_nguon.map((g) => g.nhom), ['ttkt', 'khac', 'khong_bd10']);
  assert.deepEqual([by.ttkt.so_buu_gui, by.ttkt.du_theo_nguon, by.ttkt.thieu], [4, 2, 2], 'ttkt: id1 đủ, id10 (đại diện TTKT) đủ; id2, id3 thiếu');
  assert.deepEqual([by.khac.so_buu_gui, by.khac.du_theo_nguon, by.khac.thieu], [3, 1, 2], 'khác: chỉ id4 đủ 3 mốc');
  assert.deepEqual([by.khong_bd10.so_buu_gui, by.khong_bd10.du_theo_nguon, by.khong_bd10.thieu], [3, 2, 1], 'không BD10: id7, id9 đủ; id8 thiếu');
  assert.deepEqual([by.ttkt.ty_le_du, by.khac.ty_le_du, by.khong_bd10.ty_le_du], [50, 33.33, 66.67]);
  assert.equal(th.theo_nguon.reduce((a, g) => a + g.so_buu_gui, 0), m.san_luong, 'tổng ba nhóm = sản lượng');
  assert.deepEqual(th.du_trang_thai_theo_nguon, { so_buu_gui: 5, ty_le: 50 });
  // id10 có 2 tiền tố BD10 trên 2 dòng: nhóm theo BD10 của dòng đại diện (túi 08:00 -> TTKT) — đã kiểm ở so_buu_gui/du của ttkt ở trên
  // trường cũ giữ nguyên ý nghĩa: đủ 3 mốc = 1 (id4); có XNĐ BD10 = 2 (id4, id6); không XNĐ BD10 = 8
  assert.equal(th.du_trang_thai.so_buu_gui, 1);
  assert.equal(th.co_xnd_bd10.so_buu_gui, 2);
  assert.equal(th.khong_xnd_bd10.so_buu_gui, 8);
  assert.equal(m.to_hop.length, 7);
  assert.ok(m.ty_le_co_moc && typeof m.khong_co_moc === 'number');
  // khoảng 04–06: N1 vào sản lượng (nhóm ttkt, chỉ túi -> thiếu)
  const m2 = (await api(`/api/arrivals/quality-mocs?${R_0406}`, 'ttvh')).body;
  const by2 = Object.fromEntries(m2.tong_hop.theo_nguon.map((g) => [g.nhom, g]));
  assert.deepEqual([m2.san_luong, by2.ttkt.so_buu_gui, by2.ttkt.thieu], [11, 5, 3]);
  assert.equal(m2.tong_hop.theo_nguon.reduce((a, g) => a + g.so_buu_gui, 0), m2.san_luong);
});

test('quality-mocs: khoảng rỗng không chia cho 0; BD10 trống thuộc nhóm khong_bd10; mọi vai trò xem được, STAFF 403', async () => {
  const e = (await api('/api/arrivals/quality-mocs?from=2025-01-01&to=2025-01-02', 'ttvh')).body.tong_hop;
  assert.deepEqual(e.theo_nguon.map((g) => [g.so_buu_gui, g.du_theo_nguon, g.thieu, g.ty_le_du]), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(e.du_trang_thai_theo_nguon, { so_buu_gui: 0, ty_le: 0 });
  assert.equal((await api(`/api/arrivals/quality-mocs?${R_0405}`, 'staff')).status, 403);
  assert.equal((await api(`/api/arrivals/quality-mocs?${R_0405}`)).status, 401);
});

test('dashboard /center: chat_luong.tong_hop.theo_nguon khớp /quality-mocs cùng khoảng; trường cũ còn nguyên', async () => {
  const c = (await api(`/api/arrivals/dashboard/center?from=2026-10-04&to=2026-10-05`, 'ttvh')).body;
  const m = (await api(`/api/arrivals/quality-mocs?from=2026-10-04&to=2026-10-05`, 'ttvh')).body;
  assert.deepEqual(c.chat_luong.tong_hop.theo_nguon, m.tong_hop.theo_nguon);
  assert.deepEqual(c.chat_luong.tong_hop.du_trang_thai_theo_nguon, m.tong_hop.du_trang_thai_theo_nguon);
  assert.equal(c.chat_luong.san_luong, m.san_luong);
  assert.deepEqual(c.chat_luong.tong_hop.du_trang_thai, m.tong_hop.du_trang_thai);
  assert.deepEqual(c.chat_luong.to_hop, m.to_hop);
});

test('/meta: tiêu chí bd10 có ghi chú và tỷ lệ bị loại; tiêu chí khác không đổi', async () => {
  const meta = (await api('/api/arrivals/meta', 'ttvh')).body;
  const b = meta.date_bases.find((x) => x.key === 'bd10');
  assert.equal(b.ghi_chu, 'Không gồm bưu gửi trên chuyến thư từ TTKT');
  const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items').get().n;
  const khong = ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items WHERE bd10_confirmed_at IS NULL').get().n;
  const ttkt = ctx.db.prepare("SELECT COUNT(*) AS n FROM arrival_items WHERE bd10_no LIKE '530100%'").get().n;
  assert.equal(b.ty_le_bi_loai, Math.round((khong / n) * 10000) / 100);
  assert.equal(b.ty_le_ttkt, Math.round((ttkt / n) * 10000) / 100);
  assert.equal(b.don_vi, 'dong');
  assert.deepEqual(meta.date_bases.find((x) => x.key === 'bag'), { key: 'bag', label: 'Xác nhận túi' });
});

// ------------------------------------------
// "Đã đóng chuyến, chưa nhận tại BCVH" (ADMIN)
// ------------------------------------------
test('chua_nhan_tai_bcvh (mọi vai trò xem được): tong, cu_nhat_ngay, theo_tuoi (0-1 / 2 / 3+), theo_ngay_lap; canh_bao ADMIN giữ chua_xac_dinh_ngay_den cũ; rời nhóm khi file sau có mốc', async () => {
  const exp1 = {
    tong: 3,
    cu_nhat_ngay: 3,
    theo_tuoi: { '0-1': 1, '2': 1, '3+': 1 },
    theo_ngay_lap: [{ ngay: '2026-10-03', so_buu_gui: 1, tuoi: 3 }, { ngay: '2026-10-04', so_buu_gui: 1, tuoi: 2 }, { ngay: '2026-10-05', so_buu_gui: 1, tuoi: 1 }]
  };
  // Tuổi tính tới file mới nhất đã nạp (06/10): N2 (03/10) = 3, N1 (04/10) = 2, N5 (05/10) = 1. N1 chưa có túi trong khoảng 04–05.
  for (const who of ['admin', 'ttvh', 'gdvhBc']) {
    const r = await api(`/api/arrivals/summary?${R_0405}`, who);
    assert.equal(r.status, 200, who);
    assert.deepEqual(r.body.chua_nhan_tai_bcvh, exp1, who);
    assert.ok(!('chua_nhan_tai_bcvh' in (r.body.canh_bao || {})), 'không đặt trong canh_bao');
  }
  assert.equal((await api(`/api/arrivals/summary?${R_0405}`, 'staff')).status, 403);
  assert.equal((await api(`/api/arrivals/summary?${R_0405}`)).status, 401);
  const a = (await api(`/api/arrivals/summary?${R_0405}`, 'admin')).body.canh_bao;
  assert.equal(a.khong_moc_khong_ttkt, 1, 'N3: không mốc BCVH và không có cả mốc lập BD10 — báo riêng, không lẫn vào chưa nhận');
  assert.equal(a.chua_xac_dinh_ngay_den, 4, 'trường cũ (lỗi thời) = chưa nhận + không mốc nào');
  assert.equal(exp1.tong + a.khong_moc_khong_ttkt, a.chua_xac_dinh_ngay_den);
  assert.ok(!('canh_bao' in (await api(`/api/arrivals/summary?${R_0405}`, 'ttvh')).body), 'TTVH không thấy canh_bao');
  // File 06 bổ sung túi cho N1 và có N4 mới: N1 rời nhóm và vào sản lượng theo ngày thật 06/10
  const b = (await api(`/api/arrivals/summary?${R_0406}`, 'admin')).body;
  assert.deepEqual(b.chua_nhan_tai_bcvh.theo_ngay_lap, [
    { ngay: '2026-10-03', so_buu_gui: 1, tuoi: 3 }, { ngay: '2026-10-05', so_buu_gui: 1, tuoi: 1 }, { ngay: '2026-10-06', so_buu_gui: 1, tuoi: 0 }
  ]);
  assert.deepEqual(b.chua_nhan_tai_bcvh.theo_tuoi, { '0-1': 2, '2': 0, '3+': 1 });
  assert.equal(b.san_luong, 11, 'N1 vào sản lượng');
  const lk = (await api(`/api/arrivals/lookup?tracking_no=${id(21)}`, 'ttvh')).body;
  assert.deepEqual(lk.dong.map((d) => d.moc_dung_lam_thoi_diem_den), ['XN túi', 'Không có mốc nào (chưa xác định ngày đến)']);
  // Khoảng không có gì -> số 0, cu_nhat_ngay null
  const e = (await api(`/api/arrivals/summary?from=2025-01-01&to=2025-01-02&${BC_ONLY}`, 'ttvh')).body.chua_nhan_tai_bcvh;
  assert.deepEqual(e, { tong: 0, cu_nhat_ngay: null, theo_tuoi: { '0-1': 0, '2': 0, '3+': 0 }, theo_ngay_lap: [] });
});

test('chua_nhan_tai_bcvh CÔNG KHAI (#72): mọi vai trò xem số của BCVH đang chọn, GDVH kể cả BCVH không được giao / chưa được giao BCVH nào', async () => {
  const q2 = 'from=2026-10-04&to=2026-10-05'; // không lọc BCVH
  const tong = async (qs, who) => (await api(`/api/arrivals/summary?${qs}`, who)).body.chua_nhan_tai_bcvh.tong;
  assert.equal(await tong(q2, 'admin'), 4, '533140: 3 + 535470: 1');
  assert.equal(await tong(q2, 'ttvh'), 4);
  assert.equal(await tong(`${q2}&receiver_code=${BC2}`, 'ttvh'), 1);
  for (const who of ['gdvhBc', 'gdvhBc2', 'gdvhNone']) {
    assert.equal(await tong(q2, who), 4, `${who}: không lọc -> đủ các BCVH như ADMIN`);
    assert.equal(await tong(`${q2}&receiver_code=${BC}`, who), 3, `${who}: chọn 533140 -> đúng số của ADMIN`);
    assert.equal(await tong(`${q2}&receiver_code=${BC2}`, who), 1);
  }
  assert.deepEqual((await api(`/api/arrivals/summary?${q2}&receiver_code=${BC}`, 'gdvhNone')).body.chua_nhan_tai_bcvh,
    (await api(`/api/arrivals/summary?${q2}&receiver_code=${BC}`, 'admin')).body.chua_nhan_tai_bcvh, 'GDVH chưa được giao = ADMIN, cả object');
  const sl = async (who) => (await api(`/api/arrivals/summary?${q2}`, who)).body.san_luong;
  assert.equal(await sl('gdvhBc2'), await sl('ttvh'));
  // /dashboard/center cùng quy tắc
  const c = async (who) => (await api(`/api/arrivals/dashboard/center?${q2}`, who)).body.chua_nhan_tai_bcvh;
  assert.equal((await c('ttvh')).tong, 4);
  assert.equal((await c('gdvhBc')).tong, 4);
  assert.equal((await c('gdvhBc2')).tong, 4);
  assert.equal((await c('gdvhNone')).tong, 4);
  assert.deepEqual(Object.keys(await c('ttvh')), ['tong', 'cu_nhat_ngay', 'theo_tuoi', 'theo_ngay_lap']);
  assert.equal((await api(`/api/arrivals/dashboard/center?${q2}`, 'staff')).status, 403);
});

test('GET /not-received: danh sách chi tiết, cũ nhất trước, phân trang, công khai mọi BCVH (#72), STAFF 403 / không token 401', async () => {
  const l = (await api(`/api/arrivals/not-received?${R_0405}`, 'ttvh')).body;
  assert.deepEqual(l.items.map((i) => i.tracking_no), [id(22), id(21), id(24)], 'N2 (03/10), N1 (04/10), N5 (05/10): cũ nhất trước');
  assert.deepEqual(l.items.map((i) => i.tuoi_ngay), [3, 2, 1]);
  const n2 = l.items[0];
  assert.deepEqual(Object.keys(n2).sort(), ['bd10_no', 'bd8_no', 'receiver_code', 'route_name', 'thoi_diem_lap_bd10', 'tracking_no', 'tuoi_ngay']);
  assert.equal(n2.bd10_no, bd10(TTKT, 22));
  assert.equal(n2.route_name, 'Đường thư giả');
  assert.equal(n2.thoi_diem_lap_bd10, '2026-10-03 23:00:00');
  assert.deepEqual(l.pagination, { total: 3, page: 1, page_size: 50, total_pages: 1 });
  const p2 = (await api(`/api/arrivals/not-received?${R_0405}&page_size=2&page=2`, 'ttvh')).body;
  assert.deepEqual(p2.items.map((i) => i.tracking_no), [id(24)]);
  assert.deepEqual(p2.pagination, { total: 3, page: 2, page_size: 2, total_pages: 2 });
  assert.equal((await api(`/api/arrivals/not-received?${R_0405}&page_size=0`, 'ttvh')).status, 400);
  assert.equal((await api(`/api/arrivals/not-received?${R_0405}&ward_key=x`, 'ttvh')).status, 400, 'khoá lạ');
  // phạm vi
  const all = 'from=2026-10-04&to=2026-10-05';
  assert.equal((await api(`/api/arrivals/not-received?${all}`, 'admin')).body.pagination.total, 4);
  assert.deepEqual((await api(`/api/arrivals/not-received?${all}&receiver_code=${BC2}`, 'gdvhBc')).body.items.map((i) => i.tracking_no), [id(31)], 'GDVH xem BCVH không được giao');
  assert.equal((await api(`/api/arrivals/not-received?${all}&receiver_code=${BC}`, 'gdvhBc2')).body.pagination.total, 3);
  assert.deepEqual((await api(`/api/arrivals/not-received?${all}`, 'gdvhNone')).body,
    (await api(`/api/arrivals/not-received?${all}`, 'admin')).body, 'GDVH chưa được giao = ADMIN');
  assert.equal((await api(`/api/arrivals/not-received?${all}`, 'staff')).status, 403);
  assert.equal((await api(`/api/arrivals/not-received?${all}`)).status, 401);
  // nguồn dùng chung: khớp số của chỉ số và của /exceptions
  const ex = (await api(`/api/arrivals/exceptions?${R_0405}`, 'admin')).body;
  assert.equal(ex.theo_ly_do.CHUA_NHAN_TAI_BCVH, l.pagination.total);
});

test('GET /not-received/export: xlsx (mọi ô chuỗi), quyền như /export (GDVH chỉ BCVH được giao), nhật ký', async () => {
  const get = async (qs, who) => fetch(`${ctx.baseUrl}/api/arrivals/not-received/export?${qs}`, { headers: { Authorization: `Bearer ${tokens[who]}` } });
  const Q = `receiver_code=${BC}&from=2026-10-04&to=2026-10-05`;
  const res = await get(Q, 'ttvh');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="ChuaNhan_${BC}_2026-10-04_2026-10-05.xlsx"`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  const ws = wb.worksheets[0];
  assert.deepEqual(ws.getRow(1).values.slice(1), ['SHBG', 'So_hieu_BD8', 'So_hieu_BD10', 'Ten_duong_thu', 'Thoi_gian_lap_BD10', 'Da_cho_ngay']);
  const rows = [];
  ws.eachRow((r, n) => { if (n > 1) rows.push(r.values.slice(1)); });
  assert.deepEqual(rows.map((r) => [r[0], r[4], r[5]]), [[id(22), '03/10/2026 23:00:00', '3'], [id(21), '04/10/2026 01:00:00', '2'], [id(24), '05/10/2026 02:00:00', '1']]);
  assert.equal(rows[0][2], bd10(TTKT, 22), 'số hiệu 19 chữ số giữ nguyên dạng chuỗi');
  ws.eachRow((r) => r.eachCell((c) => assert.equal(typeof c.value, 'string')));
  // quyền
  assert.equal((await get(Q, 'gdvhBc')).status, 200);
  assert.equal((await get(Q, 'gdvhBc2')).status, 403);
  assert.equal((await get(Q, 'gdvhNone')).status, 403);
  assert.equal((await get(Q, 'staff')).status, 403);
  assert.equal((await get('from=2026-10-04&to=2026-10-05', 'admin')).status, 400, 'thiếu receiver_code');
  assert.equal((await fetch(`${ctx.baseUrl}/api/arrivals/not-received/export?${Q}`)).status, 401);
  // khoảng rỗng -> file chỉ có tiêu đề
  const emp = new ExcelJS.Workbook();
  await emp.xlsx.load(Buffer.from(await (await get(`receiver_code=${BC}&from=2026-09-01&to=2026-09-02`, 'admin')).arrayBuffer()));
  assert.equal(emp.worksheets[0].actualRowCount, 1);
  // nhật ký có kind, không có dữ liệu bưu gửi
  await new Promise((r) => setTimeout(r, 150));
  const log = fs.readFileSync(process.env.SECURITY_LOG, 'utf8');
  assert.ok(/"kind":"not_received"/.test(log));
  assert.ok(!log.includes(id(22)) && !log.includes(bd10(TTKT, 22)));
});

test('/exceptions: lý do CHUA_NHAN_TAI_BCVH kèm SHBG, BD8, BD10, đường thư, thời điểm đóng chuyến, tuổi; lọc ly_do; phân trang; chỉ ADMIN', async () => {
  const all = (await api(`/api/arrivals/exceptions?${R_0405}`, 'admin')).body;
  assert.deepEqual(all.theo_ly_do, { MOC_BD10_SOM: 0, DEN_LAI_TRONG_KHOANG: 0, CHUA_NHAN_TAI_BCVH: 3, KHONG_CO_MOC: 1 });
  assert.equal(all.pagination.total, 4);
  const cn = all.items.filter((e) => e.ly_do === 'CHUA_NHAN_TAI_BCVH');
  assert.equal(cn.length, 3);
  const n2 = cn.find((e) => e.tracking_no === id(22));
  assert.equal(n2.bd10_no, bd10(TTKT, 22));
  assert.ok(n2.bd8_no && n2.route_name === 'Đường thư giả');
  assert.equal(n2.thoi_diem_dong_chuyen, '2026-10-03 23:00:00');
  assert.equal(n2.tuoi_ngay, 3);
  assert.equal(cn.find((e) => e.tracking_no === id(24)).tuoi_ngay, 1);
  assert.match(n2.ly_do_text, /chưa có XN nhận tại BCVH/);
  const nm = all.items.find((e) => e.ly_do === 'KHONG_CO_MOC');
  assert.equal(nm.tracking_no, id(23), 'không mốc & không TTKT báo riêng, không lẫn vào CHUA_NHAN');
  // lọc + phân trang
  const only = (await api(`/api/arrivals/exceptions?${R_0405}&ly_do=CHUA_NHAN_TAI_BCVH&page_size=2`, 'admin')).body;
  assert.equal(only.items.length, 2);
  assert.deepEqual(only.pagination, { total: 3, page: 1, page_size: 2, total_pages: 2 });
  const p2 = (await api(`/api/arrivals/exceptions?${R_0405}&ly_do=CHUA_NHAN_TAI_BCVH&page_size=2&page=2`, 'admin')).body;
  assert.equal(p2.items.length, 1);
  assert.equal(new Set([...only.items, ...p2.items].map((e) => e.tracking_no)).size, 3, 'các trang không trùng');
  // trang cắt ngang ranh giới giữa hai lý do
  const mid = (await api(`/api/arrivals/exceptions?${R_0405}&page_size=2&page=2`, 'admin')).body;
  assert.deepEqual(mid.items.map((e) => e.ly_do), ['CHUA_NHAN_TAI_BCVH', 'KHONG_CO_MOC']);
  assert.equal((await api(`/api/arrivals/exceptions?${R_0405}&ly_do=XYZ`, 'admin')).status, 400);
  assert.equal((await api(`/api/arrivals/exceptions?${R_0405}&page=0`, 'admin')).status, 400);
  for (const who of ['ttvh', 'staff']) assert.equal((await api(`/api/arrivals/exceptions?${R_0405}`, who)).status, 403, who);
  assert.equal((await api(`/api/arrivals/exceptions?${R_0405}`)).status, 401);
});

test('báo cáo không rò số hiệu thật: dữ liệu test chỉ là số giả (tiền tố TTKT là hằng số cấu hình)', () => {
  assert.equal(TTKT_BD10_PREFIX, '530100');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'arrivalsQuery.js'), 'utf8');
  assert.equal((src.match(/'530100'/g) || []).length, 1, 'tiền tố TTKT chỉ khai báo MỘT chỗ');
});
