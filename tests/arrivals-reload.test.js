// ==========================================
// Test SANLUONG-3i: xoá dữ liệu sản lượng đến (scripts/reset-arrivals.js), tách một file CSV nhiều ngày theo ngày
// (scripts/split-arrivals-csv.js) và nạp lại; importer đọc cột theo TÊN (cột thừa, bí danh không dấu).
// Server thật trên DB tạm; CSV / số hiệu GIẢ sinh trong thư mục tạm.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, importArrivalDirectory, ensureArrivalSchema, EXPECTED_HEADER, getMissingBatches } = require('../server/lib/arrivalsImport');
const { resetArrivals, ARRIVAL_TABLES } = require('../scripts/reset-arrivals');
const { splitCsv } = require('../scripts/split-arrivals-csv');
const { replaceAssignedBcvh } = require('../server/lib/userBcvh');

const PORT = 5917;
const BC = '533140';
const TTKT = '530100';
const OTHER = '531120';
let ctx;
let workDir;
let token;
const SCRIPTS = path.join(__dirname, '..', 'scripts');

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const mdy = (day, hhmm) => { // day 'YYYY-MM-DD', hhmm 'H:MM:SS' 24h -> 'M/D/YYYY h:mm:ss AM|PM'
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi, se] = hhmm.split(':').map(Number);
  return `${m}/${d}/${y} ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayOf = (n) => `2026-10-${String(n).padStart(2, '0')}`;
const prevDay = (n) => (n === 1 ? '2026-09-30' : dayOf(n - 1));
const trk = (d, k) => `ZZ3D${d}K${k}VN`;
const bd10 = (prefix, d, k) => `${prefix}77${d}${k}`.padEnd(19, '0');

// File gốc kiểu "xuất mới": phủ 01–09/10, header: cột XN tên không dấu, thêm 2 cột lạ, đổi chỗ vài cột.
const HEADER = (() => {
  const h = EXPECTED_HEADER.map((c) => ({ 'Thời gian XN túi': 'Thoi_gian_XN_tui', 'Thời gian XN BG': 'Thoi_gian_XN_BG' }[c] || c));
  return [...h.slice(8), ...h.slice(0, 8), 'Cot_Thua_A', 'Cot_Thua_B'];
})();
function mkRow(o) {
  const base = {
    Ma_BC_dong: '990001', BC_nhan_BG: BC, Ten_duong_thu: 'Đường thư giả', SHBG: '', So_hieu_BD10: '', Thoi_gian_XN_tui: '', Thoi_gian_XN_BG: '', Ngay_gio_XND_BD10: '',
    Ngay_gio_XND_BD10_tai_TTKT: '', So_hieu_BD8: '', Khoi_luong_thuc_te: '100', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: '',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', Cot_Thua_A: 'x', Cot_Thua_B: 'y'
  };
  return { ...base, ...o };
}
function multiDayRows() {
  const rows = [];
  for (let d = 1; d <= 9; d++) {
    const day = dayOf(d);
    // r1: nhóm ttkt, đủ (túi + bưu gửi); BD10 tiền tố TTKT, XNĐ BD10 CÓ GIÁ TRỊ (script xuất mới) -> vẫn thuộc nhóm ttkt theo tiền tố
    rows.push(mkRow({ SHBG: trk(d, 1), So_hieu_BD10: bd10(TTKT, d, 1), So_hieu_BD8: `B${d}1`, Thoi_gian_XN_tui: mdy(day, '8:00:00'), Thoi_gian_XN_BG: mdy(day, '8:10:00'),
      Ngay_gio_XND_BD10: mdy(day, '7:00:00'), Ngay_gio_XND_BD10_tai_TTKT: mdy(prevDay(d), '22:00:00') }));
    // r2: nhóm khác, chỉ túi + XNĐ BD10
    rows.push(mkRow({ SHBG: trk(d, 2), So_hieu_BD10: bd10(OTHER, d, 2), So_hieu_BD8: `B${d}2`, Thoi_gian_XN_tui: mdy(day, '9:00:00'), Ngay_gio_XND_BD10: mdy(day, '7:30:00') }));
    // r3: không BD10, chỉ XN bưu gửi
    rows.push(mkRow({ SHBG: trk(d, 3), So_hieu_BD8: `B${d}3`, Thoi_gian_XN_BG: mdy(day, '10:00:00') }));
    // r4: chưa nhận (không mốc BCVH, có mốc lập BD10 ngày d)
    rows.push(mkRow({ SHBG: trk(d, 4), So_hieu_BD10: bd10(TTKT, d, 4), So_hieu_BD8: `B${d}4`, Ngay_gio_XND_BD10_tai_TTKT: mdy(day, '2:00:00') }));
  }
  // không mốc nào (kể cả lập BD10) -> xếp vào ngày cuối
  rows.push(mkRow({ SHBG: trk(9, 6), So_hieu_BD10: bd10(TTKT, 9, 6), So_hieu_BD8: 'B96' }));
  return rows;
}
function writeMultiDay(file) {
  const rows = multiDayRows();
  const lines = [HEADER.map(q).join(','), ...rows.map((r) => HEADER.map((h) => q(r[h] ?? '')).join(','))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n');
  return rows.length;
}
// File "cũ" hằng ngày (16 cột chuẩn) để có sẵn dữ liệu cần xoá.
function writeOld(name, day) {
  const f = path.join(workDir, 'old', name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = { ...mkRow({ SHBG: `ZZ3OLD${day.slice(8)}VN`, So_hieu_BD10: bd10(OTHER, 9, 9), So_hieu_BD8: 'OLD', Thoi_gian_XN_tui: mdy(day, '8:00:00') }) };
  r['Thời gian XN túi'] = r.Thoi_gian_XN_tui;
  const lines = [EXPECTED_HEADER.map(q).join(','), EXPECTED_HEADER.map((h) => q(r[h] ?? '')).join(',')];
  fs.writeFileSync(f, '﻿' + lines.join('\r\n') + '\r\n');
  return f;
}

async function api(p) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const counts = (db) => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  .map((t) => [t.name, db.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n]));

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-arrivals-reload-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-arrivals-reload-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '${BC}', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An');
  `);
  const uid = seedUser(ctx.db, { hrmCode: 'RL_ADMIN', fullName: 'RL', role: 'ADMIN', password: 'Admin@123' });
  replaceAssignedBcvh(ctx.db, uid, [BC]);
  token = (await loginAs(ctx.baseUrl, 'RL_ADMIN', 'Admin@123')).body.token;
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('reset: chỉ xoá arrival_items + arrival_import_files; mọi bảng khác (users, user_bcvh, danh mục, ward_bdx_map) giữ nguyên; chạy thử không ghi; lặp lại an toàn', async () => {
  for (const [n, day] of [['HangDen_533140_20261004_093012.csv', '2026-10-04'], ['HangDen_533140_20261005_093012.csv', '2026-10-05']]) {
    assert.equal((await importArrivalFile(ctx.db, writeOld(n, day))).status, 'OK');
  }
  ctx.db.prepare("INSERT OR REPLACE INTO ward_bdx_map (ward_key, ward_name, commune_id, source) VALUES ('phuong test', 'Phường Test', 'c1', 'MANUAL')").run();
  const before = counts(ctx.db);
  assert.ok(before.arrival_items >= 2 && before.arrival_import_files === 2 && before.users >= 1 && before.user_bcvh >= 1 && before.ward_bdx_map >= 1);

  const dry = resetArrivals(ctx.db, { apply: false });
  assert.deepEqual(counts(ctx.db), before, 'chạy thử không ghi');
  assert.deepEqual(dry.tables.map((t) => t.name), ARRIVAL_TABLES);
  assert.deepEqual(ARRIVAL_TABLES, ['arrival_items', 'arrival_import_files']);
  assert.equal(dry.tables[0].rows, before.arrival_items);
  assert.ok(dry.kept.includes('users') && dry.kept.includes('user_bcvh') && dry.kept.includes('ward_bdx_map') && dry.kept.includes('post_offices'));
  assert.ok(!dry.kept.some((t) => ARRIVAL_TABLES.includes(t)));

  resetArrivals(ctx.db, { apply: true });
  const after1 = counts(ctx.db);
  assert.equal(after1.arrival_items, 0);
  assert.equal(after1.arrival_import_files, 0);
  for (const [t, n] of Object.entries(before)) if (!ARRIVAL_TABLES.includes(t)) assert.equal(after1[t], n, `${t} giữ nguyên`);
  assert.equal(ctx.db.prepare("SELECT source FROM ward_bdx_map WHERE ward_key = 'phuong test'").get().source, 'MANUAL');
  // lần 2: an toàn, 0 dòng
  const again = resetArrivals(ctx.db, { apply: true });
  assert.deepEqual(again.tables.map((t) => t.rows), [0, 0]);
  assert.deepEqual(counts(ctx.db), after1);

  // nạp lại từ đầu: không còn "đã nạp", id file bắt đầu lại từ 1
  const r = await importArrivalFile(ctx.db, path.join(workDir, 'old', 'HangDen_533140_20261004_093012.csv'));
  assert.equal(r.status, 'OK');
  assert.ok(!r.alreadyImported, 'sau reset không còn "đã nạp"');
  assert.equal(ctx.db.prepare('SELECT id FROM arrival_import_files').get().id, 1, 'bộ đếm id đặt lại');
  resetArrivals(ctx.db, { apply: true });
});

test('scripts/reset-arrivals.js (dòng lệnh): chạy thử mặc định không ghi; --apply xoá; DB không tồn tại -> mã thoát 1', () => {
  const file = path.join(workDir, 'cli-reset.db');
  const db = new Database(file);
  ensureArrivalSchema(db);
  db.exec("CREATE TABLE users (id TEXT); INSERT INTO users VALUES ('u1');");
  db.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'533140','f.csv','2026-10-04','093012',1,'x','OK')").run();
  db.prepare("INSERT INTO arrival_items (import_file_id, tracking_no) VALUES (1, 'ZZ3CLI0001VN')").run();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  const script = path.join(SCRIPTS, 'reset-arrivals.js');
  const n = (sql) => { const d = new Database(file, { readonly: true }); const v = d.prepare(sql).get().n; d.close(); return v; };
  const dry = spawnSync(process.execPath, [script, '--db', file], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /CHẠY THỬ/);
  assert.match(dry.stdout, /arrival_items\s+1 dòng/);
  assert.match(dry.stdout, /Giữ nguyên[\s\S]*users/);
  assert.ok(!dry.stdout.includes('ZZ3CLI'));
  assert.equal(n('SELECT COUNT(*) AS n FROM arrival_items'), 1);
  const app = spawnSync(process.execPath, [script, '--db', file, '--apply'], { encoding: 'utf8' });
  assert.equal(app.status, 0, app.stderr);
  assert.equal(n('SELECT COUNT(*) AS n FROM arrival_items'), 0);
  assert.equal(n('SELECT COUNT(*) AS n FROM arrival_import_files'), 0);
  assert.equal(n('SELECT COUNT(*) AS n FROM users'), 1, 'users không bị đụng');
  assert.equal(spawnSync(process.execPath, [script, '--db', path.join(workDir, 'khong-co.db')], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [script, '--xyz'], { encoding: 'utf8' }).status, 1);
  fs.rmSync(file, { force: true });
});

test('một file phủ nhiều ngày mang ngày 09/10 bị REJECTED (nhiều dòng ngoài [ngày file−3, +1]); không ghi dòng nào', async () => {
  const one = path.join(workDir, 'single', 'HangDen_533140_20261009_235959.csv');
  const total = writeMultiDay(one);
  assert.equal(total, 37);
  const r = await importArrivalFile(ctx.db, one);
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /ngoài khoảng/);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items').get().n, 0);
  resetArrivals(ctx.db, { apply: true }); // bỏ bản ghi REJECTED
});

test('tách theo ngày + nạp: 9 file đúng tên, đủ dòng, cột thừa / bí danh không dấu đọc được; sản lượng và "chưa nhận" đúng cho khoảng 02→08/10', async () => {
  const input = path.join(workDir, 'input', 'xuat-moi.csv');
  const total = writeMultiDay(input);
  const out = path.join(workDir, 'split-out');

  const dry = await splitCsv(input, out, { dryRun: true });
  assert.equal(fs.existsSync(out), false, 'chạy thử không tạo gì');
  assert.equal(dry.files.length, 9);

  const r = await splitCsv(input, out);
  assert.deepEqual(r.files.map((f) => f.name), Array.from({ length: 9 }, (_, i) => `HangDen_${BC}_202610${String(i + 1).padStart(2, '0')}_235959.csv`));
  assert.equal(r.files.reduce((a, f) => a + f.rows, 0), total, 'đủ dòng, không mất / thừa');
  assert.deepEqual(r.files.map((f) => f.rows), [4, 4, 4, 4, 4, 4, 4, 4, 5], 'ngày 09 nhận thêm 1 dòng không có mốc nào');
  assert.equal(r.ttktDated, 9, '9 dòng chưa nhận xếp theo ngày lập BD10');
  assert.equal(r.unplaced, 1);
  assert.deepEqual(fs.readdirSync(out).sort(), r.files.map((f) => f.name));

  const results = await importArrivalDirectory(ctx.db, out);
  assert.equal(results.length, 9);
  for (const x of results) {
    assert.equal(x.status, 'OK', `${x.fileName}: ${x.error}`);
    assert.equal(x.extraColumns, 2);
    assert.ok(!x.warning, `${x.fileName} không cảnh báo ngoài khoảng`);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items').get().n, total);
  const files = ctx.db.prepare('SELECT file_date, file_time FROM arrival_import_files ORDER BY file_date').all();
  assert.deepEqual(files.map((f) => f.file_date), Array.from({ length: 9 }, (_, i) => dayOf(i + 1)));
  assert.ok(files.every((f) => f.file_time === '23:59:59'));

  // Sản lượng: mỗi ngày 3 bưu gửi có mốc (r1, r2, r3) -> 02→08 = 21; 01→09 = 27
  const S = (a, b) => `from=${dayOf(a)}&to=${dayOf(b)}&receiver_code=${BC}`;
  const s = (await api(`/api/arrivals/summary?${S(2, 8)}`)).body;
  assert.equal(s.san_luong, 21);
  assert.equal((await api(`/api/arrivals/summary?${S(1, 9)}`)).body.san_luong, 27);
  // "Chưa nhận": r4 của mỗi ngày d (ngày lập BD10 = ngày file) -> trong 02→08 có 7; tuổi tính tới file mới nhất 09/10
  assert.equal(s.chua_nhan_tai_bcvh.tong, 7);
  assert.deepEqual(s.chua_nhan_tai_bcvh.theo_ngay_lap.map((x) => [x.ngay, x.tuoi]), [2, 3, 4, 5, 6, 7, 8].map((d) => [dayOf(d), 9 - d]));
  assert.deepEqual(s.chua_nhan_tai_bcvh.theo_tuoi, { '0-1': 1, '2': 1, '3+': 5 });
  assert.equal(s.canh_bao.moc_bd10_som, 0);
  assert.equal(s.canh_bao.khong_moc_khong_ttkt, 0);
  const all = (await api(`/api/arrivals/summary?${S(1, 9)}`)).body;
  assert.equal(all.chua_nhan_tai_bcvh.tong, 9);
  assert.equal(all.canh_bao.khong_moc_khong_ttkt, 1, 'dòng không mốc nào báo riêng');
  // Chất lượng theo nguồn: XNĐ BD10 có giá trị ở nhóm TTKT không làm đổi nhóm (theo tiền tố), đủ = túi + bưu gửi
  const m = (await api(`/api/arrivals/quality-mocs?${S(2, 8)}`)).body.tong_hop;
  const by = Object.fromEntries(m.theo_nguon.map((g) => [g.nhom, g]));
  assert.deepEqual([by.ttkt.so_buu_gui, by.ttkt.du_theo_nguon], [7, 7]);
  assert.deepEqual([by.khac.so_buu_gui, by.khac.du_theo_nguon], [7, 0], 'nhóm khác: thiếu XN bưu gửi');
  assert.deepEqual([by.khong_bd10.so_buu_gui, by.khong_bd10.du_theo_nguon], [7, 7]);
  // Ngày file đúng -> Dashboard coi từng ngày 01–09 là có file; thiếu đợt chỉ do mỗi ngày có 1 file (2 là chuẩn hằng ngày)
  const missing = getMissingBatches(ctx.db, { today: '2026-10-10' });
  assert.equal(missing.length, 9);
  assert.ok(missing.every((x) => x.file_count === 1));
  const ov = (await api('/api/arrivals/dashboard/overview')).body;
  assert.equal(ov.date, '2026-10-09');

  // Nạp lại thư mục: "đã nạp", không đổi gì
  const again = await importArrivalDirectory(ctx.db, out);
  assert.ok(again.every((x) => x.alreadyImported));
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items').get().n, total);
});

test('split-arrivals-csv: từ chối thư mục đầu ra trong repo / không rỗng, --time sai, ngày giờ sai; CLI không in số hiệu', async () => {
  const input = path.join(workDir, 'input2', 'xuat.csv');
  writeMultiDay(input);
  await assert.rejects(() => splitCsv(input, path.join(__dirname, '..', '_khong_duoc_tao_ra')), /NGOÀI repo/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', '_khong_duoc_tao_ra')), false);
  const used = path.join(workDir, 'dir-co-file');
  fs.mkdirSync(used);
  fs.writeFileSync(path.join(used, 'x.txt'), 'x');
  await assert.rejects(() => splitCsv(input, used), /chưa có hoặc rỗng/);
  await assert.rejects(() => splitCsv(input, path.join(workDir, 'o1'), { time: '25' }), /HHMMSS/);
  // ngày giờ sai định dạng -> nêu số dòng, không lộ nội dung
  const bad = path.join(workDir, 'input2', 'bad.csv');
  const rows = multiDayRows();
  rows[3].Thoi_gian_XN_tui = '04-10-2026 08:00:00';
  fs.writeFileSync(bad, [HEADER.map(q).join(','), ...rows.map((r) => HEADER.map((h) => q(r[h] ?? '')).join(','))].join('\r\n'));
  await assert.rejects(() => splitCsv(bad, path.join(workDir, 'o2')), (e) => /Dòng 5/.test(e.message) && !e.message.includes('ZZ3D'));
  // thiếu cột bắt buộc
  const miss = path.join(workDir, 'input2', 'miss.csv');
  fs.writeFileSync(miss, `${HEADER.filter((h) => h !== 'SHBG').map(q).join(',')}\r\n`);
  await assert.rejects(() => splitCsv(miss, path.join(workDir, 'o3')), /thiếu cột "SHBG"/);
  // CLI
  const outCli = path.join(workDir, 'o-cli');
  const cli = spawnSync(process.execPath, [path.join(SCRIPTS, 'split-arrivals-csv.js'), input, '--out', outCli], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Đã tạo 9 file/);
  assert.match(cli.stdout, /Tổng: 37 dòng \/ 37 dòng/);
  assert.ok(!/ZZ3D/.test(cli.stdout), 'không in số hiệu');
  assert.equal(spawnSync(process.execPath, [path.join(SCRIPTS, 'split-arrivals-csv.js'), input], { encoding: 'utf8' }).status, 1, 'thiếu --out');
  assert.equal(spawnSync(process.execPath, [path.join(SCRIPTS, 'split-arrivals-csv.js'), input, '--out', path.join(__dirname, '..', '_khong_duoc_tao_ra')], { encoding: 'utf8' }).status, 1);
});

test('3j: CSV xuất kiểu mới (ISO có mili giây / dạng T, chữ NULL) -> tách đúng ngày kể cả ngày 10/10 sau khung 01–09/10, giữ nguyên chuỗi gốc, nạp các file con ra OK', async () => {
  resetArrivals(ctx.db, { apply: true });
  const iso = (day, hms, ms = '.717') => `${day} ${hms}${ms}`;
  const rows = [];
  for (let d = 8; d <= 10; d++) {
    const day = dayOf(d);
    rows.push(mkRow({ SHBG: trk(d, 1), So_hieu_BD10: bd10(OTHER, d, 1), So_hieu_BD8: `B${d}1`, Thoi_gian_XN_tui: iso(day, '08:00:00'), Thoi_gian_XN_BG: 'NULL', Ngay_gio_XND_BD10: 'null', Ngay_gio_XND_BD10_tai_TTKT: ' NULL ' }));
    rows.push(mkRow({ SHBG: trk(d, 2), So_hieu_BD10: bd10(TTKT, d, 2), So_hieu_BD8: `B${d}2`, Thoi_gian_XN_tui: 'NULL', Thoi_gian_XN_BG: `${day}T09:00:00`, Ngay_gio_XND_BD10: iso(day, '07:00:00', '.5'), Ngay_gio_XND_BD10_tai_TTKT: iso(prevDay(d), '22:00:00', '') }));
    rows.push(mkRow({ SHBG: trk(d, 3), So_hieu_BD10: bd10(TTKT, d, 3), So_hieu_BD8: `B${d}3`, Thoi_gian_XN_tui: 'NULL', Thoi_gian_XN_BG: 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: iso(day, '02:00:00') }));
  }
  rows.push(mkRow({ SHBG: trk(10, 9), So_hieu_BD10: bd10(TTKT, 10, 9), So_hieu_BD8: 'B109', Thoi_gian_XN_tui: 'NULL', Thoi_gian_XN_BG: 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL' }));
  const input = path.join(workDir, 'input3j', 'xuat-iso.csv');
  fs.mkdirSync(path.dirname(input), { recursive: true });
  const writeRows = (file, list) => fs.writeFileSync(file, [HEADER.map(q).join(','), ...list.map((r) => HEADER.map((h) => q(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
  writeRows(input, rows);

  const out = path.join(workDir, 'split3j');
  const r = await splitCsv(input, out);
  assert.deepEqual(r.files.map((f) => [f.day, f.rows]), [['2026-10-08', 3], ['2026-10-09', 3], ['2026-10-10', 4]], 'ngày 10/10 có file riêng, không dồn vào 09/10; dòng không mốc xếp ngày cuối');
  assert.deepEqual(r.files.map((f) => f.name), ['HangDen_533140_20261008_235959.csv', 'HangDen_533140_20261009_235959.csv', 'HangDen_533140_20261010_235959.csv']);
  assert.equal(r.total, 10);
  assert.equal(r.unplaced, 1);
  assert.equal(r.ttktDated, 3);
  // giữ nguyên chuỗi gốc từng ô (không chuẩn hoá): mili giây, dạng T, NULL / null / " NULL "
  const txt = fs.readFileSync(path.join(out, 'HangDen_533140_20261010_235959.csv'), 'utf8');
  for (const keep of ['"2026-10-10 08:00:00.717"', '"2026-10-10T09:00:00"', '"2026-10-10 07:00:00.5"', '"2026-10-09 22:00:00"', '"NULL"', '"null"', '" NULL "']) {
    assert.ok(txt.includes(keep), `giữ nguyên ${keep}`);
  }

  const results = await importArrivalDirectory(ctx.db, out);
  assert.deepEqual(results.map((x) => x.status), ['OK', 'OK', 'OK']);
  assert.ok(results.every((x) => !x.warning), 'không cảnh báo ngoài khoảng (ngày đến = ngày file)');
  const one = ctx.db.prepare('SELECT bag_confirmed_at, item_confirmed_at, bd10_confirmed_at, bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis FROM arrival_items WHERE tracking_no = ?').get(trk(10, 1));
  assert.deepEqual({ ...one }, { bag_confirmed_at: '2026-10-10 08:00:00', item_confirmed_at: null, bd10_confirmed_at: null, bd10_ttkt_confirmed_at: null, arrival_at: '2026-10-10 08:00:00', arrival_at_basis: 'bag' });
  const S = (a, b) => `from=${dayOf(a)}&to=${dayOf(b)}&receiver_code=${BC}`;
  const s = (await api(`/api/arrivals/summary?${S(8, 10)}`)).body;
  assert.equal(s.san_luong, 6, '2 bưu gửi có mốc mỗi ngày × 3 ngày (gồm 10/10)');
  assert.equal(s.chua_nhan_tai_bcvh.tong, 3);
  assert.deepEqual(s.chua_nhan_tai_bcvh.theo_ngay_lap.map((x) => [x.ngay, x.tuoi]), [['2026-10-08', 2], ['2026-10-09', 1], ['2026-10-10', 0]]);
  assert.equal(s.canh_bao.khong_moc_khong_ttkt, 1);

  // giá trị sai: split nêu số dòng, không lộ giá trị
  const bad = path.join(workDir, 'input3j', 'bad.csv');
  const brow = rows.map((x) => ({ ...x }));
  brow[1].Thoi_gian_XN_BG = '2026-10-08 09:00';
  writeRows(bad, brow);
  await assert.rejects(() => splitCsv(bad, path.join(workDir, 'split3j-bad')), (e) => /Dòng 3/.test(e.message) && !e.message.includes('09:00') && !e.message.includes('ZZ3D'));
});
