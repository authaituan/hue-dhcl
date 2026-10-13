// ==========================================
// Test: xuất Excel dữ liệu thô "Hàng đến" của một BCVH (SANLUONG-3c-3) — GET /api/arrivals/export-scope và /export.
// Server thật trên DB tạm; CSV/tài khoản GIẢ sinh trong thư mục tạm (không có số hiệu thật). File xuất được mở lại
// bằng exceljs để kiểm tiêu đề, kiểu ô (chuỗi), ô rỗng, định dạng giờ, phạm vi dòng.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { replaceAssignedBcvh } = require('../server/lib/userBcvh');
const { EXPORT_COLUMNS, BATCH_SIZE } = require('../server/lib/arrivalsExport');

const PORT = 5915;
const BC = '533140'; // BCVH được xuất
const BC2 = '535470'; // BCVH khác (GDVH được giao)
const BC3 = '536250'; // BCVH khác (GDVH không được giao)
const HEADERS = ['BC_nhan_BG', 'Ten_duong_thu', 'SHBG', 'So_hieu_BD8', 'So_hieu_BD10',
  'Thoi_gian_XN_BG', 'Thoi_gian_XN_tui', 'Ngay_gio_XND_BD10', 'Dich_vu_code'];
const USERS = {
  admin: { hrm: 'EX_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'EX_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'EX_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  gdvhNone: { hrm: 'EX_GDVH0', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'EX_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;

function row(over = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: BC, Ten_duong_thu: 'Đường thư giả', SHBG: `ZZ9${String(seq).padStart(8, '0')}VN`,
    So_hieu_BD10: 'BD10-A', 'Thời gian XN túi': '', 'Thời gian XN BG': '', Ngay_gio_XND_BD10: '',
    Ngay_gio_XND_BD10_tai_TTKT: '', So_hieu_BD8: `T-${seq}`, Khoi_luong_thuc_te: '100', Dich_vu_code: 'R',
    Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: '', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', ...over
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

// ---- Dữ liệu giả (BCVH 533140), file ngày 04/10 và 05/10/2026. Giờ trong CSV kiểu Mỹ "M/D/YYYY h:mm:ss AM/PM". ----
const BD10_19 = '9900019900990000001'; // 19 chữ số giả
const BD10_ZERO = '0001234567890123456'; // 19 chữ số, bắt đầu bằng 0
const TRK_ZERO = '0012345678'; // số hiệu giả toàn chữ số, bắt đầu bằng 00
const WEIRD_SVC = '<R&"\'>\n😀';
const FILE_04 = [
  // A1: số 0 đầu; giờ 3:05:09 PM -> 15:05:09; ngày 1 chữ số (4/10 = 04/10, KHÔNG phải 10/04)
  row({ SHBG: TRK_ZERO, So_hieu_BD8: '00450-A', So_hieu_BD10: BD10_19, Ten_duong_thu: 'Đường thư 01', Dich_vu_code: 'R',
    'Thời gian XN túi': '10/4/2026 3:05:09 PM', 'Thời gian XN BG': '10/4/2026 3:10:00 PM' }),
  // A2: cùng SHBG với A1 nhưng dòng khác -> KHÔNG gộp. 12:00:00 AM = 00:00:00; 12:30:00 PM = 12:30:00
  row({ SHBG: TRK_ZERO, So_hieu_BD8: '00451', So_hieu_BD10: BD10_ZERO, Ten_duong_thu: 'Đường thư 01', Dich_vu_code: 'E',
    'Thời gian XN túi': '10/4/2026 12:00:00 AM', 'Thời gian XN BG': '10/4/2026 12:30:00 PM', Ngay_gio_XND_BD10: '10/4/2026 12:00:00 PM' }),
  // A3: chuyển hoàn + tỉnh khác, hầu hết ô rỗng -> vẫn xuất; ô rỗng để trống
  row({ SHBG: 'ZZ800000003VN', So_hieu_BD8: '', So_hieu_BD10: '', Ten_duong_thu: '', Dich_vu_code: '', Ghi_chu: 'Chuyển hoàn',
    Ten_Tinh_Thanh: 'TP. Hà Nội', 'Thời gian XN túi': '10/4/2026 9:01:02 AM' }),
  // A4: chỉ có mốc XND BD10
  row({ SHBG: 'ZZ800000004VN', Ngay_gio_XND_BD10: '10/4/2026 7:08:09 AM' }),
  // A5: túi 23:00 ngày 04/10, bưu gửi 00:10 ngày 05/10 -> theo "arrival" nằm ngày 04, theo "item" nằm ngày 05
  row({ SHBG: 'ZZ800000005VN', 'Thời gian XN túi': '10/4/2026 11:00:00 PM', 'Thời gian XN BG': '10/5/2026 12:10:00 AM' })
];
const FILE_05 = [row({ SHBG: 'ZZ800000006VN', 'Thời gian XN túi': '10/5/2026 8:00:00 AM', 'Thời gian XN BG': '10/5/2026 8:05:00 AM' })];
const FILE_04_BC2 = [
  row({ BC_nhan_BG: BC2, SHBG: 'ZZ800000007VN', 'Thời gian XN túi': '10/4/2026 8:00:00 AM' }),
  row({ BC_nhan_BG: BC2, SHBG: 'ZZ800000008VN', 'Thời gian XN túi': '10/4/2026 8:30:00 AM' })
];
const FILE_04_BC3 = [row({ BC_nhan_BG: BC3, SHBG: 'ZZ800000009VN', 'Thời gian XN túi': '10/4/2026 9:00:00 AM' })];

const RANGE_0405 = 'from=2026-10-04&to=2026-10-05';
// Thứ tự file: (ngày theo tiêu chí, id) — A1..A5 (ngày 04) rồi B1 (ngày 05).
const EXPECTED_0405 = [
  [BC, 'Đường thư 01', TRK_ZERO, '00450-A', BD10_19, '04/10/2026 15:10:00', '04/10/2026 15:05:09', null, 'R'],
  [BC, 'Đường thư 01', TRK_ZERO, '00451', BD10_ZERO, '04/10/2026 12:30:00', '04/10/2026 00:00:00', '04/10/2026 12:00:00', 'E'],
  [BC, null, 'ZZ800000003VN', null, null, null, '04/10/2026 09:01:02', null, null],
  [BC, 'Đường thư giả', 'ZZ800000004VN', expectBd8('ZZ800000004VN'), 'BD10-A', null, null, '04/10/2026 07:08:09', 'R'],
  [BC, 'Đường thư giả', 'ZZ800000005VN', expectBd8('ZZ800000005VN'), 'BD10-A', '05/10/2026 00:10:00', '04/10/2026 23:00:00', null, 'R'],
  [BC, 'Đường thư giả', 'ZZ800000006VN', expectBd8('ZZ800000006VN'), 'BD10-A', '05/10/2026 08:05:00', '05/10/2026 08:00:00', null, 'R']
];
// So_hieu_BD8 của các dòng sinh bằng row() phụ thuộc thứ tự tạo -> tra từ DB khi so sánh (placeholder).
function expectBd8(trk) { return { fromDb: trk }; }

async function get(p, who) {
  const headers = {};
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  return fetch(`${ctx.baseUrl}${p}`, { headers });
}
async function getJson(p, who) {
  const res = await get(p, who);
  let body = null;
  try { body = await res.json(); } catch (e) { /* không có body */ }
  return { status: res.status, body };
}
const exportUrl = (code, qs) => `/api/arrivals/export?receiver_code=${code}&${qs}`;
async function readXlsx(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { wb, ws: wb.worksheets[0], buf };
}
// Mọi dòng sau dòng tiêu đề -> mảng 9 giá trị (null nếu ô rỗng).
function dataRows(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    out.push(HEADERS.map((_, i) => r.getCell(i + 1).value));
  });
  return out;
}
async function exportRows(code, qs, who = 'admin') {
  const res = await get(exportUrl(code, qs), who);
  assert.equal(res.status, 200, await res.clone().text().catch(() => ''));
  const { ws } = await readXlsx(res);
  return dataRows(ws);
}
// Thay placeholder BD8 bằng giá trị thật trong DB (chỉ để so sánh; BD8 sinh tự động bởi row()).
function resolveExpected(rows) {
  return rows.map((r) => r.map((v) => (v && typeof v === 'object'
    ? ctx.db.prepare('SELECT bd8_no FROM arrival_items WHERE tracking_no = ? AND receiver_code = ?').get(v.fromDb, BC).bd8_no
    : v)));
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-arrivals-export-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-arrivals-export-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES ('po1', '${BC}', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An');
  `);
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvh, [BC2]);
  for (const [name, rows] of [[`HangDen_${BC}_20261004_093012.csv`, FILE_04], [`HangDen_${BC}_20261005_093012.csv`, FILE_05],
    [`HangDen_${BC2}_20261004_093012.csv`, FILE_04_BC2], [`HangDen_${BC3}_20261004_093012.csv`, FILE_04_BC3]]) {
    const r = await importArrivalFile(ctx.db, writeCsv(name, rows));
    assert.equal(r.status, 'OK', JSON.stringify(r));
  }
});

after(async () => {
  delete process.env.ARRIVALS_EXPORT_MAX_ROWS;
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('bảng ánh xạ: đúng 9 tiêu đề, đúng thứ tự, đúng cột DB', () => {
  assert.deepEqual(EXPORT_COLUMNS.map((c) => c.header), HEADERS);
  assert.deepEqual(EXPORT_COLUMNS.map((c) => c.field), ['receiver_code', 'route_name', 'tracking_no', 'bd8_no', 'bd10_no',
    'item_confirmed_at', 'bag_confirmed_at', 'bd10_confirmed_at', 'service_code']);
  assert.ok(!EXPORT_COLUMNS.some((c) => c.field === 'bd10_ttkt_confirmed_at'));
  const cols = new Set(ctx.db.prepare('PRAGMA table_info(arrival_items)').all().map((c) => c.name));
  for (const c of EXPORT_COLUMNS) assert.ok(cols.has(c.field), c.field);
});

test('file xuất: header HTTP, một sheet, dòng 1 đúng 9 tiêu đề (văn bản), không thừa cột', async () => {
  const res = await get(exportUrl(BC, RANGE_0405), 'ttvh');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="HangDen_${BC}_2026-10-04_2026-10-05.xlsx"`);
  const { wb, ws } = await readXlsx(res);
  assert.equal(wb.worksheets.length, 1);
  assert.match(ws.name, /^[^\\/?*[\]:]{1,31}$/);
  assert.equal(ws.columnCount, 9);
  const head = ws.getRow(1);
  for (let i = 1; i <= 9; i++) {
    const c = head.getCell(i);
    assert.equal(c.value, HEADERS[i - 1]);
    assert.equal(c.type, ExcelJS.ValueType.String);
    assert.equal(c.numFmt, '@');
  }
  assert.equal(head.getCell(10).value, null, 'không có cột thứ 10');
});

test('nội dung: dòng thô theo thứ tự, mã 0 đầu và chuỗi 19 chữ số giữ nguyên, ô rỗng trống thật, giờ dd/MM/yyyy HH:mm:ss', async () => {
  const rows = await exportRows(BC, RANGE_0405, 'ttvh');
  assert.deepEqual(rows, resolveExpected(EXPECTED_0405));
});

test('mọi ô dữ liệu là chuỗi (numFmt "@"), không có ô số/ngày/công thức; ô rỗng là null', async () => {
  const res = await get(exportUrl(BC, RANGE_0405), 'admin');
  const { ws } = await readXlsx(res);
  let cells = 0; let empties = 0;
  ws.eachRow({ includeEmpty: true }, (r) => {
    for (let i = 1; i <= 9; i++) {
      const c = r.getCell(i);
      cells++;
      assert.equal(c.numFmt, '@', `${c.address} numFmt`);
      if (c.value === null) { empties++; assert.equal(c.type, ExcelJS.ValueType.Null, c.address); continue; }
      assert.equal(typeof c.value, 'string', `${c.address} kiểu ${typeof c.value}`);
      assert.equal(c.type, ExcelJS.ValueType.String, c.address);
      assert.ok(!(c.value instanceof Date) && c.value !== 'null' && c.value !== '0' && c.value !== '', c.address);
    }
  });
  assert.equal(cells, 9 * (EXPECTED_0405.length + 1));
  assert.ok(empties >= 8, 'có ô rỗng thật');
  // 19 chữ số còn nguyên chữ số (không thành 9.9E+18) ngay trong XML gốc
  const { buf } = await readXlsx(await get(exportUrl(BC, RANGE_0405), 'admin'));
  const xml = await sheetXml(buf);
  assert.ok(xml.includes(`<v>${BD10_19}</v>`) && xml.includes(`<v>${BD10_ZERO}</v>`) && xml.includes(`<v>${TRK_ZERO}</v>`));
  assert.ok(!/<c [^>]*t="n"/.test(xml) && !/<f>/.test(xml));
});

async function sheetXml(buf) {
  // Đọc XML gốc của sheet1 từ zip (jszip là phụ thuộc của exceljs).
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  return zip.file('xl/worksheets/sheet1.xml').async('string');
}

test('giờ: DB lưu YYYY-MM-DD HH:MM:SS -> dd/MM/yyyy HH:mm:ss; 12 trưa/12 đêm/ngày 1 chữ số không nhầm ngày-tháng', async () => {
  const db = ctx.db.prepare(`SELECT tracking_no, bag_confirmed_at, item_confirmed_at, bd10_confirmed_at FROM arrival_items
    WHERE receiver_code = ? AND bd8_no IN ('00450-A', '00451') ORDER BY id`).all(BC);
  assert.deepEqual(db.map((r) => [r.bag_confirmed_at, r.item_confirmed_at, r.bd10_confirmed_at]), [
    ['2026-10-04 15:05:09', '2026-10-04 15:10:00', null],
    ['2026-10-04 00:00:00', '2026-10-04 12:30:00', '2026-10-04 12:00:00']
  ]);
  const rows = await exportRows(BC, 'from=2026-10-04&to=2026-10-04');
  assert.deepEqual([rows[0][5], rows[0][6]], ['04/10/2026 15:10:00', '04/10/2026 15:05:09']);
  assert.deepEqual([rows[1][5], rows[1][6], rows[1][7]], ['04/10/2026 12:30:00', '04/10/2026 00:00:00', '04/10/2026 12:00:00']);
});

test('dữ liệu thô: không gộp theo bưu gửi, không loại hàng chuyển hoàn / tỉnh khác; số dòng khớp truy vấn DB độc lập', async () => {
  const rows = await exportRows(BC, RANGE_0405);
  assert.equal(rows.filter((r) => r[2] === TRK_ZERO).length, 2, '2 dòng cùng SHBG đều xuất');
  assert.ok(rows.some((r) => r[2] === 'ZZ800000003VN'), 'dòng chuyển hoàn / tỉnh khác vẫn xuất');
  const n = ctx.db.prepare(`SELECT COUNT(*) AS n FROM arrival_items WHERE receiver_code = ? AND arrival_date BETWEEN '2026-10-04' AND '2026-10-05'`).get(BC).n;
  assert.equal(rows.length, n);
});

test('chỉ dòng của đúng BCVH và trong khoảng ngày', async () => {
  assert.equal((await exportRows(BC, RANGE_0405)).every((r) => r[0] === BC), true);
  assert.deepEqual((await exportRows(BC, 'from=2026-10-05&to=2026-10-05')).map((r) => r[2]), ['ZZ800000006VN']);
  assert.deepEqual(await exportRows(BC, 'from=2026-10-06&to=2026-10-06'), []);
  const only04 = await exportRows(BC, 'from=2026-10-04&to=2026-10-04');
  assert.equal(only04.length, 5);
  assert.ok(!only04.some((r) => r[2] === 'ZZ800000006VN'), 'dòng ngày 05 không lọt vào ngày 04');
  const bc2 = await exportRows(BC2, RANGE_0405);
  assert.deepEqual(bc2.map((r) => r[2]), ['ZZ800000007VN', 'ZZ800000008VN']);
  assert.ok(bc2.every((r) => r[0] === BC2));
});

test('date_basis: mặc định arrival; item/bag/bd10 chọn dòng theo mốc tương ứng', async () => {
  const d05 = 'from=2026-10-05&to=2026-10-05';
  assert.deepEqual((await exportRows(BC, `${d05}&date_basis=arrival`)).map((r) => r[2]), ['ZZ800000006VN']);
  assert.deepEqual((await exportRows(BC, d05)).map((r) => r[2]), ['ZZ800000006VN'], 'mặc định = arrival');
  assert.deepEqual((await exportRows(BC, `${d05}&date_basis=item`)).map((r) => r[2]), ['ZZ800000005VN', 'ZZ800000006VN']);
  assert.deepEqual((await exportRows(BC, 'from=2026-10-04&to=2026-10-04&date_basis=bd10')).map((r) => r[2]), [TRK_ZERO, 'ZZ800000004VN']);
  assert.equal((await exportRows(BC, 'from=2026-10-04&to=2026-10-04&date_basis=bag')).length, 4);
  assert.equal((await getJson(exportUrl(BC, `${d05}&date_basis=xyz`), 'admin')).status, 400);
});

test('khoảng rỗng -> 200, file hợp lệ chỉ có dòng tiêu đề', async () => {
  const res = await get(exportUrl(BC, 'from=2026-09-01&to=2026-09-02'), 'admin');
  assert.equal(res.status, 200);
  const { ws } = await readXlsx(res);
  assert.deepEqual(ws.getRow(1).values.slice(1), HEADERS);
  assert.deepEqual(dataRows(ws), []);
  assert.equal(ws.actualRowCount, 1);
});

test('quyền: không token 401; STAFF 403; ADMIN/TTVH mọi BCVH; GDVH chỉ BCVH được giao', async () => {
  for (const p of ['/api/arrivals/export-scope', exportUrl(BC, RANGE_0405)]) {
    assert.equal((await getJson(p)).status, 401, p);
    assert.equal((await getJson(p, 'staff')).status, 403, p);
  }
  for (const who of ['admin', 'ttvh']) {
    for (const code of [BC, BC2, BC3]) assert.equal((await get(exportUrl(code, RANGE_0405), who)).status, 200, `${who} ${code}`);
    const scope = (await getJson('/api/arrivals/export-scope', who)).body.bcvh;
    assert.equal(scope.length, 6);
    assert.ok(scope.every((b) => /^\d{6}$/.test(b.ma) && typeof b.ten === 'string' && b.ten));
    assert.equal(scope.find((b) => b.ma === BC).ten, 'BCVH Thử Một', 'tên lấy từ danh mục như /dashboard/tong-quan-den');
  }
  assert.equal((await get(exportUrl(BC2, RANGE_0405), 'gdvh')).status, 200);
  for (const code of [BC, BC3]) {
    const r = await getJson(exportUrl(code, RANGE_0405), 'gdvh');
    assert.equal(r.status, 403, code);
    assert.match(r.body.error, /không được phép xuất/);
  }
  assert.deepEqual((await getJson('/api/arrivals/export-scope', 'gdvh')).body.bcvh.map((b) => b.ma), [BC2]);
  // GDVH chưa được giao BCVH nào
  assert.deepEqual((await getJson('/api/arrivals/export-scope', 'gdvhNone')).body, { bcvh: [] });
  for (const code of [BC, BC2]) assert.equal((await getJson(exportUrl(code, RANGE_0405), 'gdvhNone')).status, 403, code);
});

test('tham số sai -> 400 tiếng Việt (receiver_code, from, to, khoảng ngày, khoá lạ)', async () => {
  const bad = [
    ['/api/arrivals/export?from=2026-10-04&to=2026-10-05', /receiver_code/],
    [exportUrl('', RANGE_0405), /receiver_code/],
    [exportUrl('990099', RANGE_0405), /6 BCVH/],
    [exportUrl(`${BC},${BC2}`, RANGE_0405), /6 BCVH/],
    [`/api/arrivals/export?receiver_code=${BC}&receiver_code=${BC2}&${RANGE_0405}`, /1 mã BCVH/],
    [exportUrl(BC, 'to=2026-10-05'), /"from"/],
    [exportUrl(BC, 'from=2026-10-04'), /"to"/],
    [exportUrl(BC, 'from=2026-10-30&to=2026-10-04'), /nhỏ hơn hoặc bằng/],
    [exportUrl(BC, 'from=2026-02-30&to=2026-03-01'), /ngày hợp lệ/],
    [exportUrl(BC, 'from=04/10/2026&to=2026-10-05'), /YYYY-MM-DD/],
    [exportUrl(BC, 'from=2026-10-04%2008:00&to=2026-10-05'), /YYYY-MM-DD/],
    [exportUrl(BC, `${RANGE_0405}&ward_key=x`), /không hỗ trợ/],
    [exportUrl(BC, 'from=2026-01-01&to=2026-04-03'), /tối đa 92 ngày/] // 93 ngày
  ];
  for (const [p, re] of bad) {
    const r = await getJson(p, 'admin');
    assert.equal(r.status, 400, p);
    assert.match(r.body.error, re, p);
  }
  // biên 92 ngày được chấp nhận
  assert.equal((await get(exportUrl(BC, 'from=2026-01-01&to=2026-04-02'), 'admin')).status, 200);
});

test('vượt ngưỡng số dòng -> 400 nêu số dòng và gợi ý thu hẹp (ngưỡng đặt được); bằng ngưỡng vẫn xuất', async () => {
  process.env.ARRIVALS_EXPORT_MAX_ROWS = '5';
  try {
    const r = await getJson(exportUrl(BC, RANGE_0405), 'admin');
    assert.equal(r.status, 400);
    assert.match(r.body.error, /có 6 dòng/);
    assert.match(r.body.error, /giới hạn 5 dòng/);
    assert.match(r.body.error, /thu hẹp khoảng ngày/);
    assert.equal((await get(exportUrl(BC, 'from=2026-10-04&to=2026-10-04'), 'admin')).status, 200, '5 dòng = ngưỡng');
  } finally {
    delete process.env.ARRIVALS_EXPORT_MAX_ROWS;
  }
  assert.equal((await get(exportUrl(BC, RANGE_0405), 'admin')).status, 200);
});

test('nhiều lô: > BATCH_SIZE dòng không mất / trùng dòng ở ranh giới lô, đúng thứ tự (ngày, id)', async () => {
  const fileId = ctx.db.prepare('SELECT id FROM arrival_import_files LIMIT 1').get().id;
  const N = BATCH_SIZE * 2 + 3;
  const ins = ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, bd8_no, bag_confirmed_at, arrival_at,
    arrival_at_basis, arrival_date, bag_date) VALUES (?, ?, ?, ?, ?, ?, 'bag', ?, ?)`);
  ctx.db.transaction(() => {
    for (let i = 0; i < N; i++) {
      // Chèn xen 2 ngày (thứ tự phải theo ngày rồi id); ngày 20 có đúng BATCH_SIZE dòng (ranh giới lô), ngày 21 có BATCH_SIZE + 3.
      const day = i < 2 * BATCH_SIZE && i % 2 === 0 ? '2026-10-20' : '2026-10-21';
      const t = `${day} 08:00:00`;
      ins.run(fileId, BC, `ZZ7${String(i).padStart(8, '0')}VN`, `L${i}`, t, t, day, day);
    }
  })();
  const rows = await exportRows(BC, 'from=2026-10-20&to=2026-10-21');
  assert.equal(rows.length, N);
  assert.equal(new Set(rows.map((r) => r[2])).size, N, 'không trùng dòng');
  const expected = ctx.db.prepare(`SELECT tracking_no FROM arrival_items WHERE receiver_code = ? AND arrival_date BETWEEN '2026-10-20' AND '2026-10-21'
    ORDER BY arrival_date, id`).all(BC).map((r) => r.tracking_no);
  assert.deepEqual(rows.map((r) => r[2]), expected);
  ctx.db.prepare("DELETE FROM arrival_items WHERE arrival_date IN ('2026-10-20', '2026-10-21')").run();
});

test('ô dài / ký tự lạ: file vẫn mở được; ký tự điều khiển XML bị bỏ, ô cắt ở 32.767 ký tự, ký tự &<>"\' xuống dòng emoji giữ nguyên', async () => {
  const fileId = ctx.db.prepare('SELECT id FROM arrival_import_files LIMIT 1').get().id;
  const t = '2026-10-22 08:00:00';
  ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, route_name, service_code, bag_confirmed_at, arrival_at,
    arrival_at_basis, arrival_date, bag_date) VALUES (?, ?, 'ZZ-WEIRD', ?, ?, ?, ?, 'bag', '2026-10-22', '2026-10-22')`)
    .run(fileId, BC, `a\u0001b\u000Bc${'x'.repeat(40000)}`, WEIRD_SVC, t, t);
  try {
    const rows = await exportRows(BC, 'from=2026-10-22&to=2026-10-22');
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1].length, 32767);
    assert.ok(rows[0][1].startsWith('abcxxx'));
    assert.equal(rows[0][8], WEIRD_SVC);
  } finally {
    ctx.db.prepare("DELETE FROM arrival_items WHERE tracking_no = 'ZZ-WEIRD'").run();
  }
});

test('XML dòng dữ liệu: thoát & < > " \' đúng, giữ chữ có dấu, BỎ (xoá) ký tự điều khiển không hợp lệ trong XML 1.0', async () => {
  const fileId = ctx.db.prepare('SELECT id FROM arrival_import_files LIMIT 1').get().id;
  const t = '2026-10-23 08:00:00';
  const ROUTE = 'A & B <C> "D" \'E\' — Đường thư Thừa Thiên Huế: ắ ằ ẳ ẵ ặ ơ ư ữ ồ';
  // Mọi ký tự bị cấm trong XML 1.0 (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) + 0xFFFE, 0xFFFF (0x7F hợp lệ); giữa các chữ để thấy chúng bị xoá, không thay bằng khoảng trắng.
  const BAD = [];
  for (let c = 0; c <= 0x1F; c++) if (![0x09, 0x0A, 0x0D].includes(c)) BAD.push(String.fromCharCode(c));
  const ctrl = `X${BAD.join('Y')}Z`;
  const ins = ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, tracking_no, bd8_no, route_name, service_code, bag_confirmed_at, arrival_at,
    arrival_at_basis, arrival_date, bag_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bag', '2026-10-23', '2026-10-23')`);
  ins.run(fileId, BC, 'ZZ-XML-1', 'B1', `${ROUTE}\u0001`, 'R', t, t);
  ins.run(fileId, BC, 'ZZ-XML-2', 'B2', ctrl, `tab\there\r\nxuống dòng`, t, t);
  ins.run(fileId, BC, 'ZZ-XML-3', 'B3', `p\u007Fq￾r￿s`, 'R', t, t);
  try {
    const res = await get(exportUrl(BC, 'from=2026-10-23&to=2026-10-23'), 'admin');
    assert.equal(res.status, 200);
    const { ws, buf } = await readXlsx(res);
    const rows = dataRows(ws);
    assert.equal(rows.length, 3);
    // ExcelJS đọc lại (trình phân tích XML nghiêm ngặt) -> file hợp lệ, giá trị đúng
    assert.equal(rows[0][1], ROUTE, 'ký tự đặc biệt + chữ có dấu giữ nguyên, ký tự điều khiển bị xoá');
    assert.equal(rows[1][1], `X${'Y'.repeat(BAD.length - 1)}Z`, 'các ký tự điều khiển bị xoá, không thay bằng khoảng trắng');
    assert.equal(rows[1][8].replace(/\r/g, ''), 'tab\there\nxuống dòng', 'tab, xuống dòng hợp lệ trong XML được giữ');
    assert.equal(rows[2][1], 'pqrs', '0x7F hợp lệ trong XML 1.0 nên được giữ; 0xFFFE, 0xFFFF bị xoá');
    // Kiểm XML gốc: đã thoát, không còn ký tự cấm
    const xml = await sheetXml(buf);
    assert.ok(xml.includes('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;'), 'thoát & < > " \'');
    assert.ok(xml.includes('Đường thư Thừa Thiên Huế: ắ ằ ẳ ẵ ặ ơ ư ữ ồ'), 'chữ có dấu ghi nguyên (UTF-8)');
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(xml), 'XML không còn ký tự cấm của XML 1.0');
    assert.ok(!/A & B|<C>|"D"/.test(xml.slice(xml.indexOf('<sheetData>'))), 'không còn ký tự chưa thoát trong dữ liệu');
  } finally {
    ctx.db.prepare("DELETE FROM arrival_items WHERE tracking_no LIKE 'ZZ-XML-%'").run();
  }
});

test('nhật ký: mỗi lần xuất ghi ai / BCVH / khoảng ngày / số dòng vào security.log, không có dữ liệu bưu gửi', async () => {
  const file = process.env.SECURITY_LOG;
  const entries = () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((e) => e.event === 'arrivals_export');
  const sofar = entries().length;
  const res = await get(exportUrl(BC, RANGE_0405), 'ttvh');
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  for (let i = 0; i < 40 && entries().length === sofar; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(entries().length, sofar + 1, 'đúng một dòng nhật ký mới');
  const entry = entries().pop();
  assert.equal(entry.hrm_code, USERS.ttvh.hrm);
  assert.equal(entry.role, 'TTVH');
  assert.equal(entry.receiver_code, BC);
  assert.equal(entry.from, '2026-10-04');
  assert.equal(entry.to, '2026-10-05');
  assert.equal(entry.date_basis, 'arrival');
  assert.equal(entry.rows, EXPECTED_0405.length);
  assert.equal(entry.status, 'ok');
  const all = fs.readFileSync(file, 'utf8');
  for (const secret of [TRK_ZERO, BD10_19, BD10_ZERO, 'ZZ800000003VN', 'Đường thư 01']) assert.ok(!all.includes(secret), `nhật ký không chứa ${secret}`);
  // lần xuất bị từ chối (403/400) không ghi dòng xuất
  const n = entries().length;
  assert.equal((await get(exportUrl(BC3, RANGE_0405), 'gdvh')).status, 403);
  assert.equal((await get(exportUrl(BC, 'from=2026-10-04'), 'admin')).status, 400);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(entries().length, n);
});
