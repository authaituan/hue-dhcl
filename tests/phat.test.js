// ==========================================
// Test PHAT-1 chặng 1 (#75): lược đồ phat_*, file mẫu, tải lên + kiểm tra từng dòng, biên tập, nhập từng phần (commit),
// file lỗi, quyền, bản kiểm tra hết hạn, nhật ký. Server thật trên DB tạm; CSV / SHBG GIẢ (9 chữ số, không dãy ≥ 15 chữ số).
// Không kiểm: hoàn tác đợt, danh sách đợt, API tỷ lệ (chặng 2).
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
const C = require('../server/config/phat');
const P = require('../server/lib/phat');

const PORT = 5922;
const M = '533140';
const M2 = '535470';
const USERS = {
  admin: { hrm: 'PH_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'PH_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvhM: { hrm: 'PH_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 533140
  gdvhM2: { hrm: 'PH_GDVH2', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 535470
  gdvhNone: { hrm: 'PH_GDVH0', pass: 'Gdvh@123', role: 'GDVH' }, // chưa được giao
  staff: { hrm: 'PH_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'PH_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;
const st = {}; // trạng thái dùng chung giữa các test (chạy tuần tự trong file)

const sh = (n) => `ZZ${String(900000000 + n)}VN`; // 13 ký tự, đúng định dạng, 9 chữ số
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const ts = (v) => (v === undefined ? 'NULL' : `2026-10-${v.slice(0, 2)} ${v.slice(3)}`);
const NHAN = Object.fromEntries(C.TRANG_THAI.map((t) => [t.ma, t.nhan]));
function r(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: o.rc || M, Ten_duong_thu: o.route === undefined ? 'Đường A' : o.route, SHBG: o.sh, So_hieu_BD10: o.bd10 || '',
    'Thời gian XN túi': ts(o.bag), 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: ts(o.ttkt),
    So_hieu_BD8: o.bd8 || `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', _fd: o.fd
  };
}
const ROWS = [
  r({ sh: sh(1), bag: '02 08:00:00' }), r({ sh: sh(2), bag: '02 10:30:00' }), r({ sh: sh(3), bag: '02 13:00:00' }),
  r({ sh: sh(4), bag: '02 15:00:00' }), r({ sh: sh(5), bag: '02 17:00:00', route: 'NULL' }), r({ sh: sh(6), bag: '02 19:00:00' }),
  r({ sh: sh(7), bag: '03 09:00:00' }), r({ sh: sh(8), bag: '03 11:00:00' }),
  r({ sh: sh(9), bd10: `530100${M}0000001`, ttkt: '02 06:00:00', fd: '02' }), // có trong dữ liệu nhưng chưa có giờ đến BCVH
  r({ sh: sh(10), bag: '02 09:00:00', rc: M2 }), // BCVH khác
  r({ sh: sh(11), bag: '02 08:30:00', bd8: 'D1' }), r({ sh: sh(11), bag: '03 09:30:00', bd8: 'D2' }) // đến lại: ngày 02 và 03
];
const dayOfRow = (row) => {
  const t = row['Thời gian XN túi'] !== 'NULL' ? row['Thời gian XN túi'] : null;
  return t ? t.slice(0, 10) : `2026-10-${row._fd}`;
};

function writeFiles() {
  const groups = new Map();
  for (const row of ROWS) {
    const k = `${row.BC_nhan_BG}|${dayOfRow(row).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const [k, rows] of groups) {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(qt).join(','), ...rows.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}

async function call(method, p, who, body, opt = {}) {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  let payload;
  if (Buffer.isBuffer(body)) { headers['Content-Type'] = 'application/octet-stream'; payload = body; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${ctx.baseUrl}${p}`, { method, headers, body: payload });
  if (opt.binary) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}

async function xlsxBuf(rows, { headers = ['SHBG', 'Trạng thái', 'Ghi chú'], meta = null } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(row);
  if (meta) {
    const ms = wb.addWorksheet('_meta', { state: 'veryHidden' });
    for (const [k, v] of Object.entries(meta)) ms.addRow([k, String(v)]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const upload = (who, bcvh, buf, ten = 'file.xlsx') => call('POST', `/api/phat/drafts?bcvh=${bcvh}&ten_file=${encodeURIComponent(ten)}`, who, buf);
const loadXlsx = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
const rowsOf = async (id, who = 'admin', qs = '') => (await call('GET', `/api/phat/drafts/${id}/rows?size=200${qs}`, who)).body.items;
const byLine = (items) => Object.fromEntries(items.map((i) => [i.so_dong_goc, i]));

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  st.ids = ids;
  replaceAssignedBcvh(ctx.db, ids.gdvhM, [M]);
  replaceAssignedBcvh(ctx.db, ids.gdvhM2, [M2]);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------- Việc 1: lược đồ và hằng số ----------------
test('hằng số: 5 trạng thái, 6 khung giờ, 4 nhóm chờ, giới hạn, SHBG, bảng chuyển bất thường', () => {
  assert.deepEqual(C.TRANG_THAI.map((t) => t.ma), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'CHUA_CO_TT', 'LAC_HUONG']);
  assert.equal(C.TT_NHAN.CHUA_CO_TT, 'Chưa có thông tin phát');
  assert.equal(C.KHUNG_GIO_DEN.length, 6);
  assert.deepEqual(C.NHOM_CHO.map((n) => n.ma), ['DUOI_2H', '2_4H', 'TREN_4H', 'QUA_NGAY']);
  assert.deepEqual([C.GIOI_HAN.MAX_DONG, C.GIOI_HAN.MAX_BYTES, C.GIOI_HAN.GIU_BAN_KIEM_TRA_NGAY], [20000, 10 * 1024 * 1024, 7]);
  assert.ok(Object.isFrozen(C.GIOI_HAN) && Object.isFrozen(C.TRANG_THAI));
  assert.ok(C.SHBG_REGEX.test(sh(1)) && C.SHBG_REGEX.test('EL123456789JP'), 'hậu tố nước ngoài hợp lệ');
  assert.ok(!C.SHBG_REGEX.test('EL12345678VN') && !C.SHBG_REGEX.test('el123456789vn') && !C.SHBG_REGEX.test('EL1234567890VN'));
  // chuyển bất thường: đã có kết quả cuối mà đổi; đã có thông tin mà về «chưa có»; từ «chưa có» không bao giờ bất thường
  assert.ok(C.laChuyenBatThuong('PTC', 'CHUA_CO_TT') && C.laChuyenBatThuong('PTC', 'PKTC') && C.laChuyenBatThuong('CHUYEN_HOAN', 'PTC'));
  assert.ok(C.laChuyenBatThuong('PKTC', 'CHUA_CO_TT') && C.laChuyenBatThuong('LAC_HUONG', 'CHUA_CO_TT'));
  assert.ok(!C.laChuyenBatThuong('PKTC', 'PTC') && !C.laChuyenBatThuong('CHUA_CO_TT', 'PTC') && !C.laChuyenBatThuong('PTC', 'PTC'));
  assert.equal(C.CHUYEN_BAT_THUONG.length, 4 + 4 + 2);
  assert.equal(C.maxDong(), 20000);
});

test('khung giờ đến theo arrival_at: ranh giới 10h, 12h, 14h, 16h, 18h', () => {
  const k = (h) => P.khungGio(`2026-10-02 ${h}`).ma;
  assert.deepEqual(['00:00:00', '09:59:59', '10:00:00', '11:59:59', '12:00:00', '13:59:59', '14:00:00', '15:59:59', '16:00:00', '17:59:59', '18:00:00', '23:59:59'].map(k),
    ['TRUOC_10', 'TRUOC_10', '10_12', '10_12', '12_14', '12_14', '14_16', '14_16', '16_18', '16_18', 'SAU_18', 'SAU_18']);
  assert.equal(P.khungGio(null), null);
  assert.equal(P.khungGio(''), null);
  assert.equal(P.khungGio('2026-10-02'), null);
});

test('lược đồ phat_*: đủ bảng, cột gio_phat chừa trống, ràng buộc trạng thái ở máy chủ, chỉ mục', () => {
  const tables = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'phat_%'").all().map((x) => x.name).sort();
  assert.deepEqual(tables, ['phat_batches', 'phat_draft_rows', 'phat_drafts', 'phat_status_current', 'phat_status_history']);
  const cols = (t) => ctx.db.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name);
  assert.ok(cols('phat_status_current').includes('gio_phat'));
  assert.deepEqual(cols('phat_batches'), ['id', 'bcvh', 'user_id', 'nhap_luc', 'ten_file', 'sha256', 'so_nhap', 'so_bo_qua', 'so_loi', 'trang_thai', 'hoan_tac_luc', 'hoan_tac_boi', 'draft_id']);
  for (const c of ['id', 'bcvh', 'shbg', 'trang_thai', 'trang_thai_truoc', 'ghi_chu', 'batch_id', 'nhap_luc']) assert.ok(cols('phat_status_history').includes(c), c);
  for (const c of ['draft_id', 'so_dong_goc', 'shbg', 'trang_thai_file', 'ket_qua', 'ma_loi', 'chi_tiet_loi', 'canh_bao']) assert.ok(cols('phat_draft_rows').includes(c), c);
  assert.throws(() => ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES ('1', 'X', 'KHONG_CO', 1, 'x')").run(), /CHECK/);
  const idx = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'ix_phat_%'").all().map((x) => x.name);
  for (const i of ['ix_phat_rows_ketqua', 'ix_phat_rows_shbg', 'ix_phat_rows_batch', 'ix_phat_history_shbg', 'ix_phat_current_batch']) assert.ok(idx.includes(i), i);
  assert.equal(P.ensurePhatSchema(ctx.db), undefined, 'idempotent');
});

// ---------------- Việc 2: file mẫu ----------------
test('file mẫu «tất cả»: mỗi SHBG đúng một dòng (SHBG đến lại chỉ một dòng), cột khóa / mở khóa, danh sách chọn, sheet _meta ẩn', async () => {
  // Một SHBG đã có trạng thái + ghi chú bắt đầu bằng "=" để kiểm chống công thức
  ctx.db.prepare("INSERT INTO phat_batches (id, bcvh, user_id, nhap_luc, so_nhap) VALUES (900, ?, 'x', '2026-10-01T00:00:00Z', 1)").run(M);
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, ghi_chu, batch_id, nhap_luc) VALUES (?, ?, 'PKTC', '=1+1', 900, '2026-10-01T00:00:00Z')").run(M, sh(8));
  const res = await call('GET', `/api/phat/template?bcvh=${M}&from=2026-10-02&to=2026-10-03&scope=tat-ca`, 'admin', undefined, { binary: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="PHAT_${M}_2026-10-02_2026-10-03.xlsx"`);
  const wb = await loadXlsx(res.buf);
  const ws = wb.getWorksheet('PHAT');
  assert.deepEqual(ws.getRow(1).values.slice(1), ['SHBG', 'Ngày đến', 'Khung giờ đến', 'Đường thư', 'Trạng thái hiện có', 'Trạng thái', 'Ghi chú']);
  const rows = [];
  ws.eachRow((row, n) => { if (n > 1) rows.push(row.values.slice(1)); });
  assert.deepEqual(rows.map((x) => x[0]), [sh(1), sh(11), sh(2), sh(3), sh(4), sh(5), sh(6), sh(7), sh(8)], 'SHBG 9..11 loại: chưa có giờ đến / BCVH khác; sh(11) một dòng');
  assert.equal(new Set(rows.map((x) => x[0])).size, rows.length, 'không bao giờ trùng');
  const by = Object.fromEntries(rows.map((x) => [x[0], x]));
  assert.deepEqual(by[sh(1)].slice(1, 5), ['02/10/2026', 'Trước 10h', 'Đường A', 'Chưa có thông tin phát']);
  assert.equal(by[sh(11)][1], '02/10/2026', 'ngày đến sớm nhất trong khoảng');
  assert.equal(by[sh(2)][2], '10–12h');
  assert.equal(by[sh(6)][2], 'Sau 18h');
  assert.equal(by[sh(5)][3], '(không có)', 'đường thư trống');
  assert.deepEqual(by[sh(8)].slice(4, 7), ['Phát không thành công', 'Phát không thành công', '=1+1'], 'tất cả: nạp sẵn trạng thái hiện có + ghi chú');
  assert.ok(by[sh(1)][5] == null, 'chưa có trạng thái thì để trống');
  ws.eachRow((row, n) => { if (n > 1) assert.equal(typeof row.getCell(1).value, 'string', 'SHBG là văn bản'); });
  assert.equal(typeof ws.getCell(`G${rows.findIndex((x) => x[0] === sh(8)) + 2}`).value, 'string', 'ghi chú "=..." là văn bản thuần, không phải công thức');
  // Khóa sheet không mật khẩu; chỉ cột Trạng thái, Ghi chú mở khóa
  assert.equal(ws.sheetProtection.sheet, true);
  assert.ok(!ws.sheetProtection.hashValue && !ws.sheetProtection.saltValue, 'không đặt mật khẩu');
  for (const c of ['A2', 'B2', 'C2', 'D2', 'E2']) assert.notEqual(ws.getCell(c).protection && ws.getCell(c).protection.locked, false, `${c} bị khóa`);
  for (const c of ['F2', 'G2', 'F10', 'G10']) assert.equal(ws.getCell(c).protection.locked, false, `${c} mở khóa`);
  // Danh sách chọn 5 nhãn ở cột Trạng thái
  const dv = ws.dataValidations.model.F2;
  assert.equal(dv.type, 'list');
  assert.equal(dv.formulae[0], `"${C.TRANG_THAI.map((t) => t.nhan).join(',')}"`);
  assert.ok(ws.dataValidations.model.F10, 'áp cho mọi dòng');
  // Sheet ẩn _meta
  const meta = wb.getWorksheet('_meta');
  assert.equal(meta.state, 'veryHidden');
  const m = {}; meta.eachRow((row) => { m[row.getCell(1).value] = row.getCell(2).value; });
  assert.deepEqual([m.bcvh, m.tu_ngay, m.den_ngay, m.pham_vi, m.phien_ban_cot, m.so_dong], [M, '2026-10-02', '2026-10-03', 'tat-ca', '1', '9']);
  assert.match(m.xuat_luc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('file mẫu «chưa»: chỉ SHBG chưa có trạng thái (hoặc đang Chưa có thông tin phát); khoảng một ngày; khoảng trống vẫn ra file tiêu đề', async () => {
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'CHUA_CO_TT', 900, '2026-10-01T00:00:00Z')").run(M, sh(7));
  const get = async (qs) => {
    const res = await call('GET', `/api/phat/template?bcvh=${M}&${qs}`, 'ttvh', undefined, { binary: true });
    assert.equal(res.status, 200, qs);
    const ws = (await loadXlsx(res.buf)).getWorksheet('PHAT');
    const out = []; ws.eachRow((row, n) => { if (n > 1) out.push(row.getCell(1).value); });
    return out;
  };
  assert.deepEqual(await get('from=2026-10-02&to=2026-10-03&scope=chua'), [sh(1), sh(11), sh(2), sh(3), sh(4), sh(5), sh(6), sh(7)], 'bỏ sh(8) đã có PKTC; sh(7) đang CHUA_CO_TT vẫn có');
  assert.deepEqual(await get('from=2026-10-03&to=2026-10-03'), [sh(7), sh(11)], 'mặc định scope=chua; ngày 03: sh(7), sh(11) (sh(8) đã có)');
  assert.deepEqual(await get('from=2026-09-01&to=2026-09-02&scope=tat-ca'), []);
  ctx.db.prepare("DELETE FROM phat_status_current WHERE shbg IN (?, ?)").run(sh(7), sh(8));
  ctx.db.prepare('DELETE FROM phat_batches WHERE id = 900').run();
});

test('file mẫu: tham số sai -> 400; quá giới hạn dòng -> 400 tiếng Việt; BCVH ngoài 6 -> 400', async () => {
  const t = (qs, who = 'admin') => call('GET', `/api/phat/template?${qs}`, who);
  assert.equal((await t(`from=2026-10-02&to=2026-10-03`)).status, 400, 'thiếu bcvh');
  assert.equal((await t(`bcvh=999999&from=2026-10-02&to=2026-10-03`)).status, 400);
  assert.equal((await t(`bcvh=${M}&to=2026-10-03`)).status, 400, 'thiếu from');
  assert.equal((await t(`bcvh=${M}&from=2026-10-02&to=2026-10-01`)).status, 400, 'from > to');
  assert.equal((await t(`bcvh=${M}&from=2026-10-02&to=2026-10-03&scope=xx`)).status, 400);
  assert.equal((await t(`bcvh=${M}&from=2026-10-02&to=2026-10-03&ghe=1`)).status, 400, 'khoá lạ');
  assert.equal((await t(`bcvh=${M}&from=2026-10-02 08:00&to=2026-10-03`)).status, 400, 'chỉ nhận ngày');
  process.env.PHAT_MAX_DONG = '5';
  try {
    const r = await t(`bcvh=${M}&from=2026-10-02&to=2026-10-03&scope=tat-ca`);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /vượt giới hạn 5 dòng một file\. Hãy thu hẹp khoảng ngày/);
  } finally { delete process.env.PHAT_MAX_DONG; }
});

// ---------------- Việc 3: tải lên và kiểm tra từng dòng ----------------
test('kiểm tra từng dòng: mỗi mã lỗi, ô trống, chuẩn hoá, ô công thức, cảnh báo; dòng trống hoàn toàn bị bỏ', async () => {
  const rows = [
    [sh(1), 'Phát thành công', 'ghi chú 1'], // r2 HOP_LE
    [sh(2), 'phat khong thanh cong', null], // r3 HOP_LE (không dấu, chữ thường)
    [sh(3), null, null], // r4 trống
    [sh(4), 'Giao rồi', null], // r5 TT_NGOAI_DS
    [sh(5), 'Chuyển hoàn', null], // r6 TRUNG_SHBG
    [sh(5), 'Lạc hướng', null], // r7 TRUNG_SHBG
    ['ZZ999999999VN', 'Phát thành công', null], // r8 không có trong dữ liệu
    [sh(9), 'Phát thành công', null], // r9 có trong dữ liệu, chưa có giờ đến
    [sh(10), 'Phát thành công', null], // r10 thuộc BCVH khác
    ['AB12', 'Phát thành công', null], // r11 SAI_DINH_DANG
    [sh(6), 'Chưa có thông tin phát', null], // r12 KHONG_DOI (chưa có = CHUA_CO_TT)
    [` ${sh(7).toLowerCase()} `, 'PTC', null], // r13 HOP_LE (chuẩn hoá: cắt khoảng trắng, hoa; mã PTC)
    [sh(8), { formula: '"Phát thành công"', result: 'Phát thành công' }, null], // r14 HOP_LE (lấy result)
    [sh(11), { formula: '1/0', result: { error: '#DIV/0!' } }, null], // r15 SAI_DINH_DANG: lỗi công thức
    [null, null, null] // r16 dòng trống hoàn toàn: bỏ
  ];
  const res = await upload('admin', M, await xlsxBuf(rows), 'lan1.xlsx');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  st.d1 = res.body.id;
  const th = res.body.tong_hop;
  assert.deepEqual([th.tong_dong, th.hop_le, th.bo_qua_trong, th.loi, th.da_nhap, th.canh_bao], [14, 4, 1, 9, 0, 0]);
  assert.deepEqual(th.loi_theo_ma, { TRUNG_SHBG: 2, TT_NGOAI_DS: 1, KHONG_CO_TRONG_DEN: 3, SAI_DINH_DANG: 2, KHONG_DOI: 1 });
  assert.equal(res.body.bcvh, M);
  assert.match(res.body.het_han_luc, /Z$/);
  assert.equal(Date.parse(res.body.het_han_luc) - Date.parse(res.body.tao_luc), 7 * 86400000, 'giữ 7 ngày');
  const L = byLine(await rowsOf(st.d1));
  st.L1 = L;
  assert.equal(L[2].ket_qua, 'HOP_LE');
  assert.equal(L[3].ket_qua, 'HOP_LE');
  assert.equal(L[3].trang_thai, 'PKTC');
  assert.equal(L[4].ket_qua, 'BO_QUA_TRONG');
  assert.deepEqual([L[5].ma_loi, L[5].ket_qua], ['TT_NGOAI_DS', 'LOI']);
  assert.deepEqual([L[6].ma_loi, L[7].ma_loi], ['TRUNG_SHBG', 'TRUNG_SHBG'], 'gắn cho MỌI dòng trùng');
  assert.match(L[6].ly_do, /ở các dòng: 6, 7/);
  assert.match(L[7].ly_do, /ở các dòng: 6, 7/);
  assert.deepEqual([L[8].ma_loi, L[8].ly_do], ['KHONG_CO_TRONG_DEN', 'SHBG không có trong dữ liệu đến của BCVH này']);
  assert.deepEqual([L[9].ma_loi, L[9].ly_do], ['KHONG_CO_TRONG_DEN', 'có trong dữ liệu nhưng chưa có giờ đến BCVH']);
  assert.deepEqual([L[10].ma_loi, L[10].ly_do], ['KHONG_CO_TRONG_DEN', 'SHBG không có trong dữ liệu đến của BCVH này'], 'SHBG của BCVH khác');
  assert.deepEqual([L[11].ma_loi, L[11].trang_thai_hien_co], ['SAI_DINH_DANG', null]);
  assert.deepEqual([L[12].ma_loi, L[12].trang_thai_hien_co], ['KHONG_DOI', 'CHUA_CO_TT']);
  assert.equal(L[13].shbg, sh(7), 'đã chuẩn hoá');
  assert.deepEqual([L[13].ket_qua, L[13].trang_thai], ['HOP_LE', 'PTC']);
  assert.deepEqual([L[14].ket_qua, L[14].trang_thai], ['HOP_LE', 'PTC'], 'ô công thức: lấy result dạng chuỗi');
  assert.deepEqual([L[15].ma_loi, L[15].ly_do], ['SAI_DINH_DANG', 'ô chứa lỗi công thức']);
  assert.equal(L[16], undefined);
  assert.equal(L[2].ghi_chu, 'ghi chú 1');
  assert.equal(L[2].trang_thai_hien_co_nhan, 'Chưa có thông tin phát');
  // Lọc, tìm, phân trang
  const loc = (await call('GET', `/api/phat/drafts/${st.d1}/rows?ket_qua=LOI&ma_loi=TRUNG_SHBG`, 'admin')).body;
  assert.deepEqual(loc.items.map((x) => x.so_dong_goc), [6, 7]);
  assert.equal((await call('GET', `/api/phat/drafts/${st.d1}/rows?q=${sh(7).slice(2, 11)}`, 'admin')).body.items.length, 1);
  const pg = (await call('GET', `/api/phat/drafts/${st.d1}/rows?page=2&size=5`, 'admin')).body;
  assert.deepEqual([pg.items.length, pg.pagination], [5, { total: 14, page: 2, page_size: 5, total_pages: 3 }]);
  assert.equal((await call('GET', `/api/phat/drafts/${st.d1}/rows?size=201`, 'admin')).status, 400);
  assert.equal((await call('GET', `/api/phat/drafts/${st.d1}/rows?ket_qua=XX`, 'admin')).status, 400);
  assert.equal((await call('GET', `/api/phat/drafts/${st.d1}`, 'admin')).body.tong_hop.loi, 9);
});

test('cảnh báo chuyển bất thường: không chặn; ghi đè có lịch sử (kiểm ở phần nhập)', () => {
  const ctx0 = { nhom: new Map(), trongDen: new Map([[sh(1), 1]]), hienCo: new Map([[sh(1), 'PTC']]) };
  const e = P.danhGia({ shbg: sh(1), trang_thai: 'CHUA_CO_TT', trang_thai_file: 'x', loi_o: null }, ctx0);
  assert.deepEqual([e.ket_qua, e.canh_bao], ['HOP_LE', 'Chuyển bất thường: Phát thành công → Chưa có thông tin phát']);
  const e2 = P.danhGia({ shbg: sh(1), trang_thai: 'PKTC', trang_thai_file: 'x', loi_o: null }, ctx0);
  assert.equal(e2.canh_bao, 'Chuyển bất thường: Phát thành công → Phát không thành công');
  const ok = P.danhGia({ shbg: sh(1), trang_thai: 'PTC', trang_thai_file: 'x', loi_o: null }, ctx0);
  assert.deepEqual([ok.ket_qua, ok.ma_loi], ['LOI', 'KHONG_DOI']);
  assert.equal(P.danhGia({ shbg: sh(1), trang_thai: 'PTC', trang_thai_file: '', loi_o: 'TRANG_THAI' }, ctx0).ma_loi, 'SAI_DINH_DANG');
  assert.equal(P.danhGia({ shbg: '', trang_thai: null, trang_thai_file: '', loi_o: 'SHBG' }, ctx0).ket_qua, 'BO_QUA_TRONG', 'trống thắng lỗi ô SHBG');
});

test('đọc file: tiêu đề linh hoạt, CSV (dấu chấm phẩy, BOM), _meta, thiếu cột, định dạng, kích thước, giới hạn dòng', async () => {
  // Tiêu đề kiểu khác + cột lạ bị bỏ qua
  const a = await upload('admin', M, await xlsxBuf([['x', sh(1), 'phát thành công', 'n']], { headers: ['Ngày đến', 'shbg', 'TRANG_THAI', 'ghi chú'] }));
  assert.equal(a.status, 201);
  assert.equal(a.body.tong_hop.hop_le, 1);
  // CSV UTF-8 có BOM, dấu chấm phẩy
  const csv = Buffer.from('﻿SHBG;Trạng thái;Ghi chú\r\n' + `${sh(2)};Lạc hướng;"có, dấu phẩy"\r\n${sh(3)};;\r\n`, 'utf8');
  const c = await upload('admin', M, csv, 'nhap.csv');
  assert.equal(c.status, 201);
  assert.deepEqual([c.body.tong_hop.hop_le, c.body.tong_hop.bo_qua_trong], [1, 1]);
  assert.equal((await rowsOf(c.body.id))[0].ghi_chu, 'có, dấu phẩy');
  // Thiếu cột bắt buộc
  const t = await upload('admin', M, await xlsxBuf([[sh(1), 'x']], { headers: ['SHBG', 'Ghi chú'] }));
  assert.equal(t.status, 400);
  assert.match(t.body.error, /thiếu cột bắt buộc: Trạng thái/);
  assert.match((await upload('admin', M, await xlsxBuf([[sh(1), 'x']], { headers: ['A', 'B'] }))).body.error, /SHBG, Trạng thái/);
  // _meta: BCVH khác bị từ chối; đúng BCVH hoặc không có _meta thì nhận; phiên bản cột cũ bị từ chối
  const meta = (o) => ({ bcvh: M, phien_ban_cot: 1, ...o });
  const sai = await upload('admin', M, await xlsxBuf([[sh(1), 'PTC', null]], { meta: meta({ bcvh: M2 }) }));
  assert.equal(sai.status, 400);
  assert.match(sai.body.error, new RegExp(`xuất cho BCVH ${M2}, không phải BCVH ${M}`));
  assert.equal((await upload('admin', M, await xlsxBuf([[sh(1), 'PTC', null]], { meta: meta({}) }))).status, 201);
  const cu = await upload('admin', M, await xlsxBuf([[sh(1), 'PTC', null]], { meta: meta({ phien_ban_cot: 0 }) }));
  assert.equal(cu.status, 400);
  assert.match(cu.body.error, /phiên bản cũ/);
  // Định dạng / nội dung
  assert.equal((await upload('admin', M, Buffer.from('abc'), 'a.txt')).status, 400);
  assert.equal((await upload('admin', M, Buffer.from('không phải zip'), 'a.xlsx')).status, 400);
  assert.equal((await upload('admin', M, Buffer.from('PK\u0003\u0004 hỏng'), 'a.xlsx')).status, 400);
  assert.equal((await call('POST', `/api/phat/drafts?bcvh=${M}`, 'admin')).status, 400, 'không có thân');
  assert.equal((await upload('admin', M, await xlsxBuf([]), 'rong.xlsx')).status, 400, 'không có dòng dữ liệu');
  // Kích thước > 10 MB -> 413 tiếng Việt
  const lon = await upload('admin', M, Buffer.alloc(C.GIOI_HAN.MAX_BYTES + 1024, 1), 'lon.xlsx');
  assert.equal(lon.status, 413);
  assert.match(lon.body.error, /vượt quá giới hạn 10 MB/);
  // Quá giới hạn dòng
  process.env.PHAT_MAX_DONG = '3';
  try {
    const nhieu = await upload('admin', M, await xlsxBuf([1, 2, 3, 4].map((n) => [sh(n), 'PTC', null])));
    assert.equal(nhieu.status, 400);
    assert.match(nhieu.body.error, /vượt giới hạn 3 dòng một file/);
    assert.equal((await upload('admin', M, await xlsxBuf([1, 2, 3].map((n) => [sh(n), 'PTC', null])))).status, 201, 'đúng bằng giới hạn thì nhận');
  } finally { delete process.env.PHAT_MAX_DONG; }
});

// ---------------- Biên tập ----------------
test('biên tập: sửa trạng thái / ghi chú, xoá dòng trùng làm hết lỗi, điền hàng loạt, gán nhanh bằng danh sách', async () => {
  const id = st.d1;
  const L = st.L1;
  const patch = (rows) => call('PATCH', `/api/phat/drafts/${id}/rows`, 'admin', { rows });
  // Giá trị sai: 400 và không đổi gì
  assert.equal((await patch([{ id: L[5].id, trang_thai: 'Giao rồi' }])).status, 400);
  assert.equal((await patch([])).status, 400);
  assert.equal((await patch([{ id: 'x' }])).status, 400);
  assert.equal(byLine(await rowsOf(id))[5].ma_loi, 'TT_NGOAI_DS');
  // Sửa dòng TT_NGOAI_DS -> hợp lệ; xoá trạng thái dòng hợp lệ -> trống
  let kq = (await patch([{ id: L[5].id, trang_thai: 'Phát không thành công', ghi_chu: 'đã sửa' }, { id: L[3].id, trang_thai: '' }, { id: 999999, trang_thai: 'PTC' }])).body;
  assert.deepEqual([kq.da_sua, kq.khong_tim_thay, kq.bi_khoa], [2, 1, []]);
  let X = byLine(await rowsOf(id));
  assert.deepEqual([X[5].ket_qua, X[5].trang_thai, X[5].ghi_chu], ['HOP_LE', 'PKTC', 'đã sửa']);
  assert.deepEqual([X[3].ket_qua, X[3].trang_thai, X[3].trang_thai_file], ['BO_QUA_TRONG', null, '']);
  // Trùng: xoá bớt một dòng thì dòng còn lại hết lỗi
  kq = (await call('DELETE', `/api/phat/drafts/${id}/rows`, 'admin', { ids: [L[7].id] })).body;
  assert.equal(kq.da_xoa, 1);
  X = byLine(await rowsOf(id));
  assert.equal(X[7], undefined);
  assert.deepEqual([X[6].ket_qua, X[6].ma_loi, X[6].trang_thai], ['HOP_LE', null, 'CHUYEN_HOAN'], 'hết TRUNG_SHBG');
  assert.equal((await call('DELETE', `/api/phat/drafts/${id}/rows`, 'admin', {})).status, 400, 'phải có ids hoặc filter');
  assert.equal((await call('DELETE', `/api/phat/drafts/${id}/rows`, 'admin', { ids: [] })).status, 400);
  // Điền hàng loạt cho mọi dòng khớp bộ lọc (dòng trống: r3, r4)
  kq = (await call('POST', `/api/phat/drafts/${id}/fill`, 'admin', { trang_thai: 'Lạc hướng', filter: { ket_qua: 'BO_QUA_TRONG' } })).body;
  assert.equal(kq.da_dien, 2);
  X = byLine(await rowsOf(id));
  assert.deepEqual([X[3].ket_qua, X[4].ket_qua, X[3].trang_thai, X[4].trang_thai], ['HOP_LE', 'HOP_LE', 'LAC_HUONG', 'LAC_HUONG']);
  assert.equal((await call('POST', `/api/phat/drafts/${id}/fill`, 'admin', { filter: {} })).status, 400, 'thiếu trạng thái');
  assert.equal((await call('POST', `/api/phat/drafts/${id}/fill`, 'admin', { trang_thai: 'Lạc hướng' })).status, 400, 'thiếu ids / filter');
  assert.equal((await call('POST', `/api/phat/drafts/${id}/fill`, 'admin', { trang_thai: 'xx', filter: {} })).status, 400);
  // Gán nhanh bằng danh sách SHBG: ghép vào dòng của file, trả số khớp + SHBG không có trong file
  kq = (await call('POST', `/api/phat/drafts/${id}/assign-list`, 'admin', { trang_thai: 'CHUYEN_HOAN', shbg: [sh(1).toLowerCase(), ` ${sh(8)} `, 'ZZ988888888VN', sh(1)] })).body;
  assert.deepEqual([kq.so_dong_khop, kq.so_shbg_khop, kq.so_shbg_khong_co_trong_file, kq.shbg_khong_co_trong_file], [2, 2, 1, ['ZZ988888888VN']]);
  X = byLine(await rowsOf(id));
  assert.deepEqual([X[2].trang_thai, X[14].trang_thai, X[2].ket_qua, X[14].ket_qua], ['CHUYEN_HOAN', 'CHUYEN_HOAN', 'HOP_LE', 'HOP_LE']);
  assert.equal((await call('POST', `/api/phat/drafts/${id}/assign-list`, 'admin', { trang_thai: 'PTC', shbg: [] })).status, 400);
  // Sửa lỗi ô công thức ở cột Trạng thái -> gán trạng thái thì hết lỗi
  assert.equal(X[15].ma_loi, 'SAI_DINH_DANG');
  await patch([{ id: X[15].id, trang_thai: 'PTC' }]);
  assert.deepEqual([byLine(await rowsOf(id))[15].ket_qua], ['HOP_LE']);
  await patch([{ id: X[15].id, trang_thai: '' }]); // trả về trống để các bước sau dùng số liệu cố định
  assert.equal(byLine(await rowsOf(id))[15].ket_qua, 'BO_QUA_TRONG');
});

// ---------------- Nhập từng phần ----------------
test('nhập từng phần: «đã chọn» ghi dòng vẫn hợp lệ, báo dòng không ghi; giờ nhập do máy chủ; tỷ lệ trước / sau khớp tong-quan-den', async () => {
  const id = st.d1;
  const X = byLine(await rowsOf(id));
  const before = await call('GET', `/api/arrivals/dashboard/tong-quan-den?bcvh=${M}&date=2026-10-02`, 'admin');
  const nhapMax = Date.now();
  const res = await call('POST', `/api/phat/drafts/${id}/commit`, 'admin', {
    mode: 'da-chon', ids: [X[2].id, X[3].id, X[12].id, 999999], nhap_luc: '2000-01-01T00:00:00Z', gio_nhap: '1999'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const b = res.body;
  assert.equal(b.so_nhap, 2, 'r2 (Chuyển hoàn) và r3 (Lạc hướng) vì r3 đã được điền');
  assert.equal(b.so_khong_ghi, 2);
  assert.equal(b.khong_ghi.find((k) => k.so_dong_goc === 12).ly_do, 'Trạng thái không đổi so với hiện có (Chưa có thông tin phát)');
  assert.equal(b.khong_ghi.find((k) => k.so_dong_goc === null).ly_do, 'Không tìm thấy dòng trong bản kiểm tra');
  // Giờ nhập: do máy chủ, bỏ qua giờ client gửi
  assert.notEqual(b.nhap_luc, '2000-01-01T00:00:00Z');
  assert.ok(Math.abs(Date.parse(b.nhap_luc) - nhapMax) < 30000, 'giờ máy chủ');
  const batch = ctx.db.prepare('SELECT * FROM phat_batches WHERE id = ?').get(b.batch_id);
  assert.deepEqual([batch.nhap_luc, batch.bcvh, batch.user_id, batch.so_nhap, batch.trang_thai, batch.draft_id, batch.ten_file], [b.nhap_luc, M, st.ids.admin, 2, 'da_nhap', id, 'lan1.xlsx']);
  assert.match(batch.sha256, /^[0-9a-f]{64}$/);
  assert.ok(batch.so_loi >= 1 && batch.so_bo_qua >= 0);
  // Ghi hiện tại + lịch sử
  const cur = (s) => ctx.db.prepare('SELECT * FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M, s);
  assert.deepEqual([cur(sh(1)).trang_thai, cur(sh(2)).trang_thai, cur(sh(3)), cur(sh(1)).batch_id, cur(sh(1)).nhap_luc], ['CHUYEN_HOAN', 'LAC_HUONG', undefined, b.batch_id, b.nhap_luc]);
  const his = ctx.db.prepare('SELECT * FROM phat_status_history WHERE batch_id = ? ORDER BY shbg').all(b.batch_id);
  assert.deepEqual(his.map((h) => [h.shbg, h.trang_thai, h.trang_thai_truoc]), [[sh(1), 'CHUYEN_HOAN', null], [sh(2), 'LAC_HUONG', null]]);
  // Tỷ lệ ngày 02/10: mẫu số khớp san_luong của tong-quan-den; trước toàn «chưa có», sau có 2 trạng thái
  assert.equal(b.ty_le_truoc.length, 1);
  const T = b.ty_le_truoc[0]; const S = b.ty_le_sau[0];
  assert.equal(T.ngay, '2026-10-02');
  assert.equal(T.mau_so, before.body.san_luong.buu_gui);
  assert.equal(T.mau_so, 7, 'sh(1..6) + sh(11)');
  assert.deepEqual([T.theo_trang_thai.CHUA_CO_TT.so, T.muc_cap_nhat], [7, 0]);
  assert.deepEqual([S.mau_so, S.theo_trang_thai.CHUYEN_HOAN.so, S.theo_trang_thai.LAC_HUONG.so, S.theo_trang_thai.CHUA_CO_TT.so, S.muc_cap_nhat], [7, 1, 1, 5, 0.2857]);
  assert.equal(S.theo_trang_thai.CHUA_CO_TT.ty_le, 0.7143);
  assert.deepEqual(b.tong_hop, { ...b.tong_hop, da_nhap: 2 });
  // Dòng đã nhập bị khóa; lỗi và trống ở lại
  const Y = byLine(await rowsOf(id));
  assert.deepEqual([Y[2].ket_qua, Y[3].ket_qua, Y[12].ket_qua, Y[5].ket_qua], ['DA_NHAP', 'DA_NHAP', 'LOI', 'HOP_LE']);
  const khoa = (await call('PATCH', `/api/phat/drafts/${id}/rows`, 'admin', { rows: [{ id: Y[2].id, trang_thai: 'PTC' }] })).body;
  assert.deepEqual([khoa.da_sua, khoa.bi_khoa], [0, [Y[2].id]]);
  const khoaXoa = (await call('DELETE', `/api/phat/drafts/${id}/rows`, 'admin', { ids: [Y[2].id] })).body;
  assert.deepEqual([khoaXoa.da_xoa, khoaXoa.bi_khoa], [0, [Y[2].id]]);
  assert.equal((await call('POST', `/api/phat/drafts/${id}/fill`, 'admin', { trang_thai: 'PTC', ids: [Y[2].id] })).body.bi_khoa[0], Y[2].id);
  assert.equal(byLine(await rowsOf(id))[2].trang_thai, 'CHUYEN_HOAN');
  // da-chon không có ids -> 400; mode sai -> 400
  assert.equal((await call('POST', `/api/phat/drafts/${id}/commit`, 'admin', { mode: 'da-chon' })).status, 400);
  assert.equal((await call('POST', `/api/phat/drafts/${id}/commit`, 'admin', { mode: 'tat-ca' })).status, 400);
});

test('nhập các dòng hợp lệ còn lại; tỷ lệ nhiều ngày; dòng lỗi / trống ở lại để nhập đợt sau', async () => {
  const id = st.d1;
  const res = await call('POST', `/api/phat/drafts/${id}/commit`, 'admin', { mode: 'hop-le' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const b = res.body;
  // Còn hợp lệ: r4 (sh3 Lạc hướng), r5 (sh4 PKTC), r6 (sh5 Chuyển hoàn), r13 (sh7 PTC), r14 (sh8 Chuyển hoàn)
  assert.equal(b.so_nhap, 5);
  assert.deepEqual(b.ty_le_truoc.map((t) => t.ngay), ['2026-10-02', '2026-10-03']);
  const d3 = b.ty_le_sau[1];
  assert.deepEqual([d3.mau_so, d3.theo_trang_thai.PTC.so, d3.theo_trang_thai.CHUYEN_HOAN.so, d3.theo_trang_thai.CHUA_CO_TT.so, d3.muc_cap_nhat], [3, 1, 1, 1, 0.6667], 'ngày 03: sh(7), sh(8), sh(11)');
  assert.equal(d3.mau_so, (await call('GET', `/api/arrivals/dashboard/tong-quan-den?bcvh=${M}&date=2026-10-03`, 'admin')).body.san_luong.buu_gui);
  const th = b.tong_hop;
  assert.deepEqual([th.da_nhap, th.hop_le, th.loi, th.bo_qua_trong], [7, 0, 5, 1], 'lỗi ở lại: r8 r9 r10 r11 r12; r15 đã trả về trống');
});

// ---------------- File lỗi ----------------
test('file lỗi: cùng cấu trúc file mẫu + «Số dòng trong file gốc», «Lý do lỗi»; chỉ dòng lỗi; nhập lại thẳng được; sửa xong nhập được', async () => {
  const res = await call('GET', `/api/phat/drafts/${st.d1}/errors.xlsx`, 'admin', undefined, { binary: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="PHAT_LOI_533140_\d{4}-\d{2}-\d{2}\.xlsx"$/);
  const wb = await loadXlsx(res.buf);
  const ws = wb.getWorksheet('PHAT');
  assert.deepEqual(ws.getRow(1).values.slice(1), ['SHBG', 'Ngày đến', 'Khung giờ đến', 'Đường thư', 'Trạng thái hiện có', 'Trạng thái', 'Ghi chú', 'Số dòng trong file gốc', 'Lý do lỗi']);
  const rows = [];
  ws.eachRow((row, n) => { if (n > 1) rows.push(row.values.slice(1)); });
  assert.deepEqual(rows.map((x) => x[7]), ['8', '9', '10', '11', '12'], 'chỉ 5 dòng lỗi còn lại; số dòng trong file gốc');
  const by = Object.fromEntries(rows.map((x) => [x[7], x]));
  assert.deepEqual([by[11][0], by[11][8]], ['AB12', 'SHBG phải gồm 13 ký tự: 2 chữ, 9 số, 2 chữ']);
  assert.deepEqual([by[12][1], by[12][2], by[12][3], by[12][4], by[12][5]], ['02/10/2026', 'Sau 18h', 'Đường A', 'Chưa có thông tin phát', 'Chưa có thông tin phát']);
  assert.match(by[12][8], /Trạng thái không đổi/);
  assert.equal(by[9][8], 'có trong dữ liệu nhưng chưa có giờ đến BCVH');
  assert.ok(by[9][1] == null && by[10][1] == null, 'SHBG không có giờ đến / của BCVH khác: không có ngày đến');
  assert.ok(ws.dataValidations.model.F2, 'có danh sách chọn');
  assert.equal(ws.getCell('F2').protection.locked, false, 'cột Trạng thái mở khóa');
  assert.notEqual(ws.getCell('I2').protection && ws.getCell('I2').protection.locked, false, 'cột Lý do lỗi bị khóa');
  assert.equal(ws.sheetProtection.sheet, true);
  const meta = {}; wb.getWorksheet('_meta').eachRow((row) => { meta[row.getCell(1).value] = row.getCell(2).value; });
  assert.deepEqual([meta.bcvh, meta.pham_vi, meta.phien_ban_cot, meta.so_dong], [M, 'loi', '1', '5']);
  // Nhập lại thẳng file lỗi (cột thừa bị bỏ qua, _meta đúng BCVH): nhận, vẫn 5 lỗi
  const again = await upload('admin', M, res.buf, 'loi.xlsx');
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.deepEqual([again.body.tong_hop.tong_dong, again.body.tong_hop.loi, again.body.tong_hop.hop_le], [5, 5, 0]);
  // Sửa dòng KHONG_DOI (sh(6)) thành «Phát thành công» rồi nhập lại: dòng đó hợp lệ
  const w2 = await loadXlsx(res.buf);
  const s2 = w2.getWorksheet('PHAT');
  s2.eachRow((row, n) => { if (n > 1 && row.getCell(1).value === sh(6)) row.getCell(6).value = 'Phát thành công'; });
  const fixed = await upload('admin', M, Buffer.from(await w2.xlsx.writeBuffer()), 'loi-da-sua.xlsx');
  assert.equal(fixed.status, 201);
  assert.deepEqual([fixed.body.tong_hop.hop_le, fixed.body.tong_hop.loi], [1, 4]);
  // Ô do người dùng nhập bắt đầu bằng = + - @ vẫn là văn bản thuần trong file lỗi (không thành công thức)
  const inj = await upload('admin', M, await xlsxBuf([[sh(6), '=HYPERLINK("http://x")', '=1+1'], ['@SUM(A1)', 'PTC', '-2+3']]));
  assert.equal(inj.status, 201);
  const ie = await call('GET', `/api/phat/drafts/${inj.body.id}/errors.xlsx`, 'admin', undefined, { binary: true });
  const iws = (await loadXlsx(ie.buf)).getWorksheet('PHAT');
  iws.eachRow((row, n) => { if (n > 1) for (let c = 1; c <= 9; c++) { const v = row.getCell(c).value; assert.ok(v === null || v === undefined || typeof v === 'string', `ô ${n}:${c} là văn bản`); } });
  assert.equal(iws.getCell('A3').value, '@SUM(A1)');
  assert.equal(iws.getCell('F2').value, '=HYPERLINK("http://x")');
});

// ---------------- Nhập lần sau: ghi đè có lịch sử ----------------
test('nhập lần 2: khác trạng thái thì ghi đè và có lịch sử; không đổi thì báo lỗi; SHBG vắng giữ nguyên; cảnh báo bất thường không chặn', async () => {
  const rows = [
    [sh(1), 'Phát thành công', null], // hiện có Chuyển hoàn -> bất thường (cảnh báo), vẫn nhập
    [sh(2), 'Lạc hướng', null], // không đổi -> lỗi
    [sh(3), 'Chuyển hoàn', null], // Lạc hướng -> Chuyển hoàn: bình thường
    [sh(4), null, null] // trống
  ];
  const up = await upload('ttvh', M, await xlsxBuf(rows), 'lan2.xlsx');
  assert.equal(up.status, 201);
  const th = up.body.tong_hop;
  assert.deepEqual([th.hop_le, th.loi, th.bo_qua_trong, th.canh_bao, th.loi_theo_ma.KHONG_DOI], [2, 1, 1, 1, 1]);
  const items = byLine(await rowsOf(up.body.id));
  assert.equal(items[2].canh_bao, 'Chuyển bất thường: Chuyển hoàn → Phát thành công');
  assert.equal(items[2].trang_thai_hien_co, 'CHUYEN_HOAN');
  assert.equal(items[4].canh_bao, null);
  assert.equal((await call('GET', `/api/phat/drafts/${up.body.id}/rows?canh_bao=1`, 'admin')).body.items.length, 1);
  const cur = (s) => ctx.db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M, s);
  const keep = [cur(sh(4)).trang_thai, cur(sh(5)).trang_thai, cur(sh(7)).trang_thai];
  const batchesBefore = ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n;
  const res = await call('POST', `/api/phat/drafts/${up.body.id}/commit`, 'ttvh', { mode: 'hop-le' });
  assert.equal(res.status, 200);
  assert.equal(res.body.so_nhap, 2);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n, batchesBefore + 1, 'mỗi đợt một bản ghi riêng');
  assert.equal(cur(sh(1)).trang_thai, 'PTC');
  assert.equal(cur(sh(3)).trang_thai, 'CHUYEN_HOAN');
  assert.equal(cur(sh(2)).trang_thai, 'LAC_HUONG', 'dòng lỗi không ghi');
  assert.deepEqual([cur(sh(4)).trang_thai, cur(sh(5)).trang_thai, cur(sh(7)).trang_thai], keep, 'SHBG không có trong đợt mới giữ nguyên');
  const his = ctx.db.prepare('SELECT trang_thai, trang_thai_truoc FROM phat_status_history WHERE bcvh = ? AND shbg = ? ORDER BY id').all(M, sh(1));
  assert.deepEqual(his.map((h) => ({ ...h })), [{ trang_thai: 'CHUYEN_HOAN', trang_thai_truoc: null }, { trang_thai: 'PTC', trang_thai_truoc: 'CHUYEN_HOAN' }]);
  const batch = ctx.db.prepare('SELECT user_id, ten_file FROM phat_batches WHERE id = ?').get(res.body.batch_id);
  assert.deepEqual([batch.user_id, batch.ten_file], [st.ids.ttvh, 'lan2.xlsx']);
});

test('commit kiểm lại từng dòng tại thời điểm commit: dòng đã hết hợp lệ không được ghi; không còn dòng nào thì 400 và không tạo đợt', async () => {
  const up = await upload('admin', M, await xlsxBuf([[sh(6), 'Phát thành công', null], [sh(11), 'Phát không thành công', null]]), 'cu.xlsx');
  assert.equal(up.body.tong_hop.hop_le, 2);
  // Người khác nhập sh(6) = PTC từ lúc kiểm tra
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', 9999, '2026-10-12T00:00:00Z')").run(M, sh(6));
  const res = await call('POST', `/api/phat/drafts/${up.body.id}/commit`, 'admin', { mode: 'hop-le' });
  assert.equal(res.status, 200);
  assert.equal(res.body.so_nhap, 1);
  assert.equal(res.body.khong_ghi.length, 1);
  assert.equal(res.body.khong_ghi[0].so_dong_goc, 2);
  assert.match(res.body.khong_ghi[0].ly_do, /^Không còn hợp lệ tại thời điểm nhập: Trạng thái không đổi so với hiện có \(Phát thành công\)$/);
  const cur = (s) => ctx.db.prepare('SELECT trang_thai, batch_id FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M, s);
  assert.equal(cur(sh(6)).batch_id, 9999, 'không ghi đè');
  assert.equal(cur(sh(11)).trang_thai, 'PKTC');
  // Toàn bộ dòng đã hết hợp lệ -> 400, không tạo đợt, kết quả kiểm tra lại được lưu
  const up2 = await upload('admin', M, await xlsxBuf([[sh(6), 'Phát không thành công', null]]), 'cu2.xlsx');
  assert.equal(up2.body.tong_hop.hop_le, 1);
  ctx.db.prepare("UPDATE phat_status_current SET trang_thai = 'PKTC' WHERE bcvh = ? AND shbg = ?").run(M, sh(6));
  const n0 = ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n;
  const bad = await call('POST', `/api/phat/drafts/${up2.body.id}/commit`, 'admin', { mode: 'hop-le' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Không có dòng hợp lệ nào để nhập/);
  assert.equal(bad.body.khong_ghi.length, 1);
  assert.equal(bad.body.tong_hop.loi, 1);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n, n0);
  assert.equal((await call('GET', `/api/phat/drafts/${up2.body.id}`, 'admin')).body.tong_hop.loi, 1);
});

// ---------------- Quyền ----------------
test('quyền: ADMIN, TTVH mọi BCVH; GDVH chỉ BCVH được gán; GDVH chưa gán, STAFF, TIVI 403; không token 401; bản kiểm tra theo BCVH của nó', async () => {
  const tpl = (who, b) => call('GET', `/api/phat/template?bcvh=${b}&from=2026-10-02&to=2026-10-03`, who);
  const cho = { admin: [200, 200], ttvh: [200, 200], gdvhM: [200, 403], gdvhM2: [403, 200], gdvhNone: [403, 403], staff: [403, 403], tivi: [403, 403] };
  for (const [who, [a, b]] of Object.entries(cho)) {
    assert.equal((await tpl(who, M)).status, a, `template ${who} ${M}`);
    assert.equal((await tpl(who, M2)).status, b, `template ${who} ${M2}`);
  }
  assert.equal((await tpl(undefined, M)).status, 401);
  assert.match((await tpl('gdvhNone', M)).body.error, /chưa được gán BCVH nào/);
  assert.match((await tpl('gdvhM', M2)).body.error, /chỉ được nhập kết quả phát cho BCVH được giao/);
  // Tạo bản kiểm tra
  const buf = await xlsxBuf([[sh(10), 'Phát thành công', null]]);
  for (const [who, [a, b]] of Object.entries(cho)) {
    assert.equal((await upload(who, M, await xlsxBuf([[sh(7), 'Phát thành công', null]]))).status === 201, a === 200, `upload ${who} ${M}`);
    assert.equal((await upload(who, M2, buf)).status === 201, b === 200, `upload ${who} ${M2}`);
  }
  assert.equal((await upload(undefined, M, buf)).status, 401);
  assert.equal((await upload('admin', '999999', buf)).status, 400);
  // Truy cập bản kiểm tra của BCVH M: chỉ người được phép với M
  const id = st.d1;
  const calls = (who) => Promise.all([
    call('GET', `/api/phat/drafts/${id}`, who), call('GET', `/api/phat/drafts/${id}/rows`, who),
    call('GET', `/api/phat/drafts/${id}/errors.xlsx`, who, undefined, { binary: true }),
    call('PATCH', `/api/phat/drafts/${id}/rows`, who, { rows: [{ id: 1, ghi_chu: 'x' }] }), call('DELETE', `/api/phat/drafts/${id}/rows`, who, { ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/fill`, who, { trang_thai: 'PTC', ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/assign-list`, who, { trang_thai: 'PTC', shbg: [sh(1)] }),
    call('POST', `/api/phat/drafts/${id}/commit`, who, { mode: 'hop-le' })
  ]);
  for (const who of ['gdvhM2', 'gdvhNone', 'staff', 'tivi']) assert.deepEqual((await calls(who)).map((x) => x.status), Array(8).fill(403), who);
  assert.deepEqual((await calls(undefined)).map((x) => x.status), Array(8).fill(401));
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM')).status, 200);
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'ttvh')).status, 200);
  assert.equal((await call('GET', '/api/phat/drafts/khong-co-id', 'admin')).status, 404);
  assert.equal(byLine(await rowsOf(id))[2].trang_thai, 'CHUYEN_HOAN', 'các lệnh bị từ chối không đổi gì');
  // GDVH được gán thực hiện trọn quy trình cho BCVH của mình
  const mine = await upload('gdvhM', M, await xlsxBuf([[sh(7), 'Phát không thành công', null]]), 'gd.xlsx');
  assert.equal(mine.status, 201);
  assert.equal(mine.body.tong_hop.canh_bao, 1, 'PTC -> PKTC: cảnh báo, không chặn');
  const done = await call('POST', `/api/phat/drafts/${mine.body.id}/commit`, 'gdvhM', { mode: 'hop-le' });
  assert.equal(done.status, 200);
  assert.equal(ctx.db.prepare('SELECT user_id FROM phat_batches WHERE id = ?').get(done.body.batch_id).user_id, st.ids.gdvhM);
});

// ---------------- Hết hạn và nhật ký ----------------
test('bản kiểm tra hết hạn bị dọn (khi truy cập và khi gọi dọn), không ảnh hưởng dữ liệu đã nhập', async () => {
  const dem = (t) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const [cur0, bat0, his0] = [dem('phat_status_current'), dem('phat_batches'), dem('phat_status_history')];
  const them = (id, het) => {
    ctx.db.prepare("INSERT INTO phat_drafts (id, bcvh, user_id, tao_luc, het_han_luc) VALUES (?, ?, 'x', '2026-01-01T00:00:00Z', ?)").run(id, M, het);
    ctx.db.prepare("INSERT INTO phat_draft_rows (draft_id, so_dong_goc, shbg) VALUES (?, 2, 'AB12')").run(id);
  };
  them('het-han-1', '2000-01-01T00:00:00Z');
  them('het-han-2', '2000-01-02T00:00:00Z');
  them('con-han', '2999-01-01T00:00:00Z');
  const r1 = await call('GET', '/api/phat/drafts/het-han-1', 'admin');
  assert.equal(r1.status, 404);
  assert.match(r1.body.error, /đã hết hạn sau 7 ngày/);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id IN ('het-han-1', 'het-han-2')").get().n, 0, 'dòng của bản hết hạn đã xoá');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_drafts WHERE id IN ('het-han-1', 'het-han-2')").get().n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id = 'con-han'").get().n, 1, 'bản còn hạn giữ nguyên');
  them('het-han-3', '2000-01-03T00:00:00Z');
  assert.equal(P.purgeExpiredDrafts(ctx.db), 1, 'dọn khi gọi (khởi động)');
  assert.ok(P.purgeExpiredDrafts(ctx.db, '2999-06-01T00:00:00Z') >= 1, 'mốc giờ truyền vào: bản "con-han" (và mọi bản của các test trước) hết hạn tại mốc đó');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_drafts WHERE id = 'con-han'").get().n, 0);
  assert.equal(dem('phat_draft_rows'), 0, 'không còn dòng mồ côi');
  assert.deepEqual([dem('phat_status_current'), dem('phat_batches'), dem('phat_status_history')], [cur0, bat0, his0], 'dữ liệu đã nhập không bị đụng');
});

test('nhật ký bảo mật: ghi mọi thao tác ghi / tải, KHÔNG ghi nội dung dòng (SHBG, ghi chú)', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const lines = fs.readFileSync(process.env.SECURITY_LOG, 'utf8').split('\n').filter((l) => l.includes('"event":"phat_'));
  const ev = (e) => lines.filter((l) => l.includes(`"event":"${e}"`));
  for (const e of ['phat_template', 'phat_draft_create', 'phat_draft_edit', 'phat_draft_errors', 'phat_commit']) assert.ok(ev(e).length > 0, e);
  const commit = JSON.parse(ev('phat_commit')[0]);
  assert.deepEqual([commit.bcvh, commit.role, typeof commit.batch_id, typeof commit.rows, typeof commit.draft_id], [M, 'ADMIN', 'number', 'number', 'string']);
  const create = JSON.parse(ev('phat_draft_create')[0]);
  assert.match(create.sha256, /^[0-9a-f]{64}$/);
  assert.equal(create.ten_file, 'lan1.xlsx');
  assert.ok(!lines.some((l) => /ZZ9\d{8}VN/.test(l)), 'không có SHBG trong nhật ký');
  assert.ok(!lines.some((l) => l.includes('ghi chú 1') || l.includes('đã sửa')), 'không có ghi chú trong nhật ký');
});
