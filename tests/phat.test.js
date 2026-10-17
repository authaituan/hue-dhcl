// ==========================================
// Test PHAT-1 chặng 1 (#75): lược đồ phat_*, file mẫu, tải lên + kiểm tra từng dòng, biên tập, nhập từng phần (commit),
// file lỗi, quyền, bản kiểm tra hết hạn, nhật ký. Server thật trên DB tạm; CSV / SHBG GIẢ (9 chữ số, không dãy ≥ 15 chữ số).
// Chặng 2 (cuối file): hoàn tác đợt, danh sách đợt, API tỷ lệ, 3 chỉnh của PO (loai_tru, ghi chú bị cắt, giờ Bangkok).
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');
const Database = require('better-sqlite3'); // nạp TRƯỚC khi harness thay thế (ca migration cần DB riêng trong bộ nhớ)
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { replaceAssignedBcvh, VALID_BCVH_CODES } = require('../server/lib/userBcvh');
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
  gdvhM2b: { hrm: 'PH_GDVH3', pass: 'Gdvh@123', role: 'GDVH' }, // cũng được giao 535470 (người khác, cùng BCVH)
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
  r({ sh: sh(11), bag: '02 08:30:00', bd8: 'D1' }), r({ sh: sh(11), bag: '03 09:30:00', bd8: 'D2' }), // đến lại: ngày 02 và 03
  // Chặng 2 — thêm SHBG cho BCVH thứ hai (535470): ngày 02 có sh(10), sh(21), sh(22); ngày 04 có sh(23)..sh(27)
  r({ sh: sh(21), bag: '02 14:30:00', rc: M2 }), r({ sh: sh(22), bag: '02 20:00:00', rc: M2 }),
  r({ sh: sh(23), bag: '04 09:15:00', rc: M2 }), r({ sh: sh(24), bag: '04 13:00:00', rc: M2 }), r({ sh: sh(25), bag: '04 16:00:00', rc: M2 }),
  r({ sh: sh(26), bag: '04 14:00:00', rc: M2 }), r({ sh: sh(27), bag: '04 12:00:00', rc: M2 })
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
  replaceAssignedBcvh(ctx.db, ids.gdvhM2b, [M2]);
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
  assert.deepEqual(cols('phat_batches'), ['id', 'bcvh', 'user_id', 'nhap_luc', 'ten_file', 'sha256', 'so_nhap', 'so_bo_qua', 'so_loi', 'so_khong_doi', 'trang_thai', 'hoan_tac_luc', 'hoan_tac_boi', 'draft_id', 'so_canh_bao']);
  assert.ok(cols('phat_draft_rows').includes('ghi_chu_bi_cat'));
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
test('quyền: ADMIN, TTVH mọi BCVH; GDVH chỉ BCVH được gán; GDVH chưa gán, STAFF, TIVI 403; không token 401; bản kiểm tra của người khác 404', async () => {
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
  // Truy cập bản kiểm tra của admin (BCVH M): người khác không thấy
  const id = st.d1;
  const calls = (who) => Promise.all([
    call('GET', `/api/phat/drafts/${id}`, who), call('GET', `/api/phat/drafts/${id}/rows`, who),
    call('GET', `/api/phat/drafts/${id}/errors.xlsx`, who, undefined, { binary: true }),
    call('PATCH', `/api/phat/drafts/${id}/rows`, who, { rows: [{ id: 1, ghi_chu: 'x' }] }), call('DELETE', `/api/phat/drafts/${id}/rows`, who, { ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/fill`, who, { trang_thai: 'PTC', ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/assign-list`, who, { trang_thai: 'PTC', shbg: [sh(1)] }),
    call('POST', `/api/phat/drafts/${id}/commit`, who, { mode: 'hop-le' })
  ]);
  // PHAT-1b: bản kiểm tra thuộc người tạo (admin): GDVH khác -> 404 (không lộ sự tồn tại); STAFF, TIVI bị chặn từ cổng nhập -> 403
  for (const who of ['gdvhM2', 'gdvhNone', 'gdvhM']) assert.deepEqual((await calls(who)).map((x) => x.status), Array(8).fill(404), who);
  for (const who of ['staff', 'tivi']) assert.deepEqual((await calls(who)).map((x) => x.status), Array(8).fill(403), who);
  assert.deepEqual((await calls(undefined)).map((x) => x.status), Array(8).fill(401));
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'ttvh')).status, 200, 'TTVH xem được bản của người khác');
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

// =====================================================================================================================
// CHẶNG 2: hoàn tác đợt, danh sách đợt, API tỷ lệ, 3 chỉnh của PO. Dùng BCVH 535470 (M2) với SHBG sh(10), sh(21..27).
// =====================================================================================================================
const curM2 = (s) => ctx.db.prepare('SELECT * FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M2, s);
const batchRow = (id) => ctx.db.prepare('SELECT * FROM phat_batches WHERE id = ?').get(id);
const undo = (who, id) => call('POST', `/api/phat/batches/${id}/undo`, who);
/** Tải lên rồi nhập các dòng hợp lệ cho M2; trả { draft (kết quả tạo bản kiểm tra), ...kết quả commit }. */
async function nhapM2(who, rows, ten = 'm2.xlsx', body = { mode: 'hop-le' }) {
  const up = await upload(who, M2, await xlsxBuf(rows), ten);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const res = await call('POST', `/api/phat/drafts/${up.body.id}/commit`, who, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { draft: up.body, ...res.body };
}

// ---------------- Chỉnh 2: ghi chú quá 500 ký tự ----------------
test('chỉnh 2 — ghi chú quá 500 ký tự: cảnh báo vàng «Ghi chú bị cắt», vẫn nhập, ghi chú cắt còn 500; sửa ghi chú ngắn thì hết cảnh báo', async () => {
  const dai = (n) => 'g'.repeat(n);
  const up = await upload('admin', M2, await xlsxBuf([
    [sh(21), 'Phát thành công', dai(600)], // r2: bị cắt
    [sh(22), 'Phát thành công', dai(500)], // r3: đúng 500 -> không cắt
    [sh(23), 'Phát thành công', dai(501)], // r4: 501 -> cắt
    [sh(24), 'Phát thành công', `  ${dai(500)}  `] // r5: khoảng trắng hai đầu không tính
  ]));
  assert.equal(up.status, 201);
  assert.deepEqual([up.body.tong_hop.hop_le, up.body.tong_hop.canh_bao, up.body.tong_hop.loi], [4, 2, 0], 'vẫn hợp lệ, 2 cảnh báo');
  const L = byLine(await rowsOf(up.body.id));
  assert.equal(L[2].canh_bao, 'Ghi chú bị cắt (tối đa 500 ký tự)');
  assert.deepEqual([L[2].ghi_chu.length, L[3].ghi_chu.length, L[4].ghi_chu.length, L[5].ghi_chu.length], [500, 500, 500, 500]);
  assert.equal(L[3].canh_bao, null);
  assert.equal(L[5].canh_bao, null);
  assert.equal((await call('GET', `/api/phat/drafts/${up.body.id}/rows?canh_bao=1`, 'admin')).body.items.length, 2);
  // Sửa: ghi chú ngắn -> hết cảnh báo; ghi chú dài -> có lại
  await call('PATCH', `/api/phat/drafts/${up.body.id}/rows`, 'admin', { rows: [{ id: L[2].id, ghi_chu: 'ngắn' }, { id: L[3].id, ghi_chu: dai(700) }] });
  const X = byLine(await rowsOf(up.body.id));
  assert.deepEqual([X[2].canh_bao, X[2].ghi_chu, X[3].canh_bao, X[3].ghi_chu.length], [null, 'ngắn', 'Ghi chú bị cắt (tối đa 500 ký tự)', 500]);
  // Gộp với cảnh báo chuyển bất thường (thuần)
  const c = { nhom: new Map(), trongDen: new Map([[sh(21), 1]]), hienCo: new Map([[sh(21), 'PTC']]) };
  const e = P.danhGia({ shbg: sh(21), trang_thai: 'PKTC', trang_thai_file: 'x', loi_o: null, ghi_chu_bi_cat: 1 }, c);
  assert.deepEqual([e.ket_qua, e.canh_bao], ['HOP_LE', 'Chuyển bất thường: Phát thành công → Phát không thành công · Ghi chú bị cắt (tối đa 500 ký tự)']);
  // Dòng lỗi không mang cảnh báo
  assert.equal(P.danhGia({ shbg: sh(21), trang_thai: 'PTC', trang_thai_file: 'x', loi_o: null, ghi_chu_bi_cat: 1 }, c).canh_bao, null);
});

test('giờ nhập theo múi Asia/Bangkok (UTC+7): đổi đúng, kể cả qua nửa đêm và qua năm', () => {
  assert.equal(P.gioBangkok('2026-10-12T17:30:00Z'), '2026-10-13 00:30:00');
  assert.equal(P.gioBangkok('2026-12-31T20:00:00Z'), '2027-01-01 03:00:00');
  assert.equal(P.gioBangkok('2026-10-13T00:00:00Z'), '2026-10-13 07:00:00');
  assert.equal(P.gioBangkok(null), null);
  assert.equal(P.gioBangkok('không phải giờ'), null);
  assert.equal(C.MUI_GIO, 'Asia/Bangkok');
});

test('migration: DB có sẵn bảng chặng 1 (thiếu cột mới) được thêm cột, không mất dữ liệu', () => {
  const old = new Database(':memory:');
  old.exec(`CREATE TABLE phat_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, bcvh TEXT NOT NULL, user_id TEXT NOT NULL, nhap_luc TEXT NOT NULL, ten_file TEXT, sha256 TEXT,
      so_nhap INTEGER NOT NULL DEFAULT 0, so_bo_qua INTEGER NOT NULL DEFAULT 0, so_loi INTEGER NOT NULL DEFAULT 0,
      trang_thai TEXT NOT NULL DEFAULT 'da_nhap', hoan_tac_luc TEXT, hoan_tac_boi TEXT, draft_id TEXT);
    CREATE TABLE phat_draft_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, draft_id TEXT NOT NULL, so_dong_goc INTEGER NOT NULL, shbg TEXT NOT NULL,
      trang_thai_file TEXT NOT NULL DEFAULT '', trang_thai TEXT, ghi_chu TEXT, loi_o TEXT, trang_thai_hien_co TEXT, ket_qua TEXT NOT NULL DEFAULT 'BO_QUA_TRONG',
      ma_loi TEXT, chi_tiet_loi TEXT, canh_bao TEXT, batch_id INTEGER);
    INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_loi) VALUES ('1', 'u', 'x', 7);`);
  P.ensurePhatSchema(old);
  P.ensurePhatSchema(old); // lần hai: không lỗi
  const cols = (t) => old.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(cols('phat_batches').includes('so_khong_doi') && cols('phat_draft_rows').includes('ghi_chu_bi_cat'));
  assert.deepEqual({ ...old.prepare('SELECT so_loi, so_khong_doi FROM phat_batches').get() }, { so_loi: 7, so_khong_doi: 0 });
  assert.ok(cols('phat_batches').includes('so_canh_bao'));
  assert.equal(old.prepare('SELECT so_canh_bao FROM phat_batches').get().so_canh_bao, null, 'đợt cũ: so_canh_bao = NULL (không rõ), không tính ngược');
  old.close();
});

// ---------------- Việc 4: hoàn tác ----------------
test('hoàn tác: 409 khi đợt sau đã đổi SHBG (kèm số SHBG vướng); hoàn tác ngược thứ tự; khôi phục cả ghi chú / đợt / giờ nhập; có lịch sử; mở khóa dòng bản kiểm tra', async () => {
  const A = await nhapM2('admin', [[sh(21), 'Phát thành công', 'ghi chú A'], [sh(22), 'Phát không thành công', null], [sh(23), 'Lạc hướng', 'g'.repeat(600)]], 'A.xlsx');
  assert.equal(A.so_nhap, 3);
  assert.equal(curM2(sh(23)).ghi_chu.length, 500, 'ghi chú dài đã cắt còn 500 khi nhập');
  const B = await nhapM2('ttvh', [[sh(21), 'Chuyển hoàn', 'ghi chú B'], [sh(10), 'Phát thành công', null]], 'B.xlsx');
  assert.equal(B.so_nhap, 2);
  assert.equal(B.draft.tong_hop.canh_bao, 1, 'PTC -> Chuyển hoàn: cảnh báo, không chặn');

  // Hoàn tác A khi B đã đổi sh(21): 409
  const chan = await undo('admin', A.batch_id);
  assert.equal(chan.status, 409);
  assert.deepEqual([chan.body.so_shbg_vuong, chan.body.dot_vuong], [1, [B.batch_id]]);
  assert.match(chan.body.error, /1 SHBG của đợt này đã được thay đổi bởi đợt nhập sau/);
  assert.equal(batchRow(A.batch_id).trang_thai, 'da_nhap');
  assert.equal(curM2(sh(21)).trang_thai, 'CHUYEN_HOAN');

  // Hoàn tác B (đợt sau cùng): khôi phục trạng thái ngay trước, kể cả ghi chú, đợt và giờ nhập của A
  const ub = await undo('ttvh', B.batch_id);
  assert.equal(ub.status, 200, JSON.stringify(ub.body));
  assert.deepEqual([ub.body.so_hoan_tac, ub.body.so_khoi_phuc, ub.body.so_xoa_trang_thai], [2, 1, 1]);
  const s21 = curM2(sh(21));
  assert.deepEqual([s21.trang_thai, s21.ghi_chu, s21.batch_id, s21.nhap_luc], ['PTC', 'ghi chú A', A.batch_id, A.nhap_luc]);
  assert.equal(curM2(sh(10)), undefined, 'trước đó chưa có -> xoá dòng');
  const bb = batchRow(B.batch_id);
  assert.deepEqual([bb.trang_thai, bb.hoan_tac_boi], ['da_hoan_tac', st.ids.ttvh]);
  assert.equal(bb.hoan_tac_luc, ub.body.hoan_tac_luc);
  assert.ok(Math.abs(Date.parse(bb.hoan_tac_luc) - Date.now()) < 30000, 'giờ hoàn tác do máy chủ');
  assert.equal(ub.body.hoan_tac_luc_bangkok, P.gioBangkok(ub.body.hoan_tac_luc));
  // Tỷ lệ trước / sau của ngày liên quan (02/10: sh(10), sh(21), sh(22))
  const [tr] = ub.body.ty_le_truoc; const [sa] = ub.body.ty_le_sau;
  assert.deepEqual([tr.ngay, tr.mau_so, tr.muc_cap_nhat, sa.mau_so, sa.muc_cap_nhat], ['2026-10-02', 3, 1, 3, 0.6667]);
  // Lịch sử: giữ 2 dòng gốc của B + 2 dòng hoàn tác
  const his = ctx.db.prepare('SELECT shbg, trang_thai, trang_thai_truoc FROM phat_status_history WHERE batch_id = ? ORDER BY id').all(B.batch_id).map((h) => ({ ...h }));
  assert.equal(his.length, 4);
  assert.deepEqual(his.slice(2), [{ shbg: sh(21), trang_thai: 'PTC', trang_thai_truoc: 'CHUYEN_HOAN' }, { shbg: sh(10), trang_thai: 'CHUA_CO_TT', trang_thai_truoc: 'PTC' }]);
  // Dòng bản kiểm tra của B được mở khóa và kiểm tra lại (trước: DA_NHAP)
  const rowsB = byLine(await rowsOf(B.draft.id));
  assert.deepEqual([rowsB[2].ket_qua, rowsB[3].ket_qua], ['HOP_LE', 'HOP_LE']);

  // Bây giờ hoàn tác A được (B đã hoàn tác không còn tính)
  const ua = await undo('admin', A.batch_id);
  assert.equal(ua.status, 200);
  assert.deepEqual([ua.body.so_xoa_trang_thai, ua.body.so_khoi_phuc], [3, 0]);
  assert.equal([21, 22, 23].filter((n) => curM2(sh(n))).length, 0);
  assert.equal((await undo('admin', A.batch_id)).status, 409, 'đã hoàn tác');
  assert.match((await undo('admin', A.batch_id)).body.error, /đã được hoàn tác trước đó/);
  for (const bad of ['99999999', 'abc', '1.5', '0', '-1']) assert.equal((await undo('admin', bad)).status, 404, bad);

  // Sửa-nhập-lại sau hoàn tác: bản kiểm tra của B còn dùng được
  const lai = await call('POST', `/api/phat/drafts/${B.draft.id}/commit`, 'ttvh', { mode: 'hop-le' });
  assert.equal(lai.status, 200, JSON.stringify(lai.body));
  assert.equal(lai.body.so_nhap, 2);
  assert.equal(curM2(sh(21)).ghi_chu, 'ghi chú B');
  assert.equal((await undo('ttvh', lai.body.batch_id)).status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_status_current WHERE bcvh = ?').get(M2).n, 0, 'M2 sạch trạng thái');
});

test('hoàn tác: quyền — ADMIN, TTVH, hoặc chính người nhập (còn được phép với BCVH); người khác cùng BCVH, GDVH BCVH khác / chưa gán, STAFF, TIVI: 403', async () => {
  const D = await nhapM2('gdvhM2', [[sh(24), 'Phát thành công', null]], 'D.xlsx');
  for (const who of ['gdvhM2b', 'gdvhM', 'gdvhNone', 'staff', 'tivi']) assert.equal((await undo(who, D.batch_id)).status, 403, who);
  assert.match((await undo('gdvhM2b', D.batch_id)).body.error, /Chỉ ADMIN, TTVH hoặc chính người nhập/);
  assert.equal((await undo(undefined, D.batch_id)).status, 401);
  assert.equal(batchRow(D.batch_id).trang_thai, 'da_nhap', 'các lệnh bị từ chối không đổi gì');
  // Chính người nhập nhưng đã bị bỏ gán BCVH -> không hoàn tác được
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, []);
  assert.equal((await undo('gdvhM2', D.batch_id)).status, 403);
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M2]);
  // TTVH hoàn tác đợt của người khác
  const u1 = await undo('ttvh', D.batch_id);
  assert.equal(u1.status, 200);
  assert.equal(batchRow(D.batch_id).hoan_tac_boi, st.ids.ttvh);
  // Chính người nhập hoàn tác đợt của mình
  const D2 = await nhapM2('gdvhM2', [[sh(24), 'Phát không thành công', null]], 'D2.xlsx');
  assert.equal((await undo('gdvhM2', D2.batch_id)).status, 200);
  // ADMIN hoàn tác đợt của GDVH
  const D3 = await nhapM2('gdvhM2', [[sh(24), 'Lạc hướng', null]], 'D3.xlsx');
  assert.equal((await undo('admin', D3.batch_id)).status, 200);
  assert.equal(curM2(sh(24)), undefined);
});

// ---------------- Việc 5: danh sách đợt nhập ----------------
test('danh sách đợt nhập: chỉ BCVH được phép; ai, giờ (UTC + Bangkok), tên file, sha256, số nhập / bỏ qua / lỗi / không đổi, đã hoàn tác chưa; phân trang', async () => {
  const F1 = await nhapM2('gdvhM2', [[sh(26), 'Phát thành công', null]], 'F.xlsx');
  const G1 = await nhapM2('ttvh', [[sh(27), 'Phát không thành công', null]], 'G.xlsx');
  const dbCount = (b) => ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches WHERE bcvh = ?').get(b).n;
  const ds = (who, qs = '') => call('GET', `/api/phat/batches${qs}`, who);

  const a = (await ds('admin', `?bcvh=${M2}&size=200`)).body;
  assert.equal(a.pagination.total, dbCount(M2));
  assert.deepEqual(a.items.slice(0, 2).map((x) => x.id), [G1.batch_id, F1.batch_id], 'mới nhất trước');
  const g = a.items[0];
  assert.deepEqual(Object.keys(g), ['id', 'bcvh', 'nhap_luc', 'nhap_luc_bangkok', 'nhap_boi', 'ten_file', 'sha256', 'so_nhap', 'so_bo_qua', 'so_loi', 'so_khong_doi', 'so_canh_bao',
    'trang_thai', 'hoan_tac_luc', 'hoan_tac_luc_bangkok', 'hoan_tac_boi', 'co_quyen_hoan_tac']);
  assert.deepEqual([g.bcvh, g.ten_file, g.so_nhap, g.trang_thai, g.hoan_tac_boi], [M2, 'G.xlsx', 1, 'da_nhap', null]);
  assert.deepEqual(g.nhap_boi, { id: st.ids.ttvh, hrm_code: 'PH_TTVH', full_name: 'PH_TTVH' });
  assert.equal(g.nhap_luc_bangkok, P.gioBangkok(g.nhap_luc));
  assert.match(g.sha256, /^[0-9a-f]{64}$/);
  const huy = a.items.find((x) => x.trang_thai === 'da_hoan_tac');
  assert.ok(huy && huy.hoan_tac_luc && huy.hoan_tac_boi.hrm_code && huy.hoan_tac_luc_bangkok, 'đợt đã hoàn tác kèm ai, giờ');
  assert.equal(huy.co_quyen_hoan_tac, false);

  // co_quyen_hoan_tac theo người xem (chỉ phần quyền)
  const quyen = async (who) => Object.fromEntries((await ds(who, `?bcvh=${M2}&size=200`)).body.items.map((x) => [x.id, x.co_quyen_hoan_tac]));
  const [qa, qt, qg, qg2] = [await quyen('admin'), await quyen('ttvh'), await quyen('gdvhM2'), await quyen('gdvhM2b')];
  assert.deepEqual([qa[F1.batch_id], qa[G1.batch_id], qt[F1.batch_id], qt[G1.batch_id]], [true, true, true, true]);
  assert.deepEqual([qg[F1.batch_id], qg[G1.batch_id], qg2[F1.batch_id]], [true, false, false], 'GDVH chỉ đợt của chính mình');

  // Phạm vi theo người xem
  const tatCa = (await ds('admin', '?size=200')).body;
  assert.equal(tatCa.pagination.total, dbCount(M) + dbCount(M2));
  assert.ok(tatCa.items.some((x) => x.bcvh === M) && tatCa.items.some((x) => x.bcvh === M2));
  const gM = (await ds('gdvhM', '?size=200')).body;
  assert.ok(gM.items.length > 0 && gM.items.every((x) => x.bcvh === M), 'GDVH chỉ thấy đợt của BCVH được giao');
  assert.equal(gM.pagination.total, dbCount(M));
  assert.ok((await ds('gdvhM2', '?size=200')).body.items.every((x) => x.bcvh === M2));
  assert.equal((await ds('gdvhM2', `?bcvh=${M}`)).status, 403);
  assert.match((await ds('gdvhM2', `?bcvh=${M}`)).body.error, /chỉ được xem các đợt nhập của BCVH được giao/);
  assert.equal((await ds('gdvhNone')).status, 403);
  assert.match((await ds('gdvhNone')).body.error, /chưa được gán BCVH nào/);
  assert.equal((await ds('gdvhNone', `?bcvh=${M}`)).status, 403);
  assert.equal((await ds('ttvh', `?bcvh=${M}`)).status, 200);
  for (const who of ['staff', 'tivi']) assert.equal((await ds(who)).status, 403, who);
  assert.equal((await ds(undefined)).status, 401);
  // Phân trang và tham số
  const p2 = (await ds('admin', `?bcvh=${M2}&page=2&size=2`)).body;
  assert.deepEqual([p2.items.length, p2.pagination.page, p2.pagination.page_size, p2.pagination.total_pages], [Math.min(2, Math.max(0, dbCount(M2) - 2)), 2, 2, Math.ceil(dbCount(M2) / 2)]);
  assert.equal((await ds('admin', '?size=201')).status, 400);
  assert.equal((await ds('admin', '?page=0')).status, 400);
  assert.equal((await ds('admin', '?bcvh=999999')).status, 400);
  assert.equal((await ds('admin', '?x=1')).status, 400);
});

// ---------------- Chỉnh 1: loai_tru và tách «lỗi cần sửa» khỏi «không đổi» ----------------
test('chỉnh 1 — errors.xlsx?loai_tru=KHONG_DOI bỏ dòng «không đổi»; kết quả commit và đợt nhập tách «lỗi cần sửa» khỏi «không đổi»', async () => {
  // Hiện có: sh(26) = PTC (đợt F), sh(27) = PKTC (đợt G)
  const up = await upload('admin', M2, await xlsxBuf([
    [sh(27), 'Phát không thành công', null], // KHONG_DOI
    ['AB12', 'Phát thành công', null], // SAI_DINH_DANG (lỗi cần sửa)
    [sh(26), 'Phát không thành công', null] // HOP_LE (bất thường: PTC -> PKTC)
  ]), 'e.xlsx');
  const th = up.body.tong_hop;
  assert.deepEqual([th.hop_le, th.loi, th.khong_doi, th.loi_can_sua, th.canh_bao], [1, 2, 1, 1, 1]);
  const id = up.body.id;
  const lay = async (qs) => {
    const r = await call('GET', `/api/phat/drafts/${id}/errors.xlsx${qs}`, 'admin', undefined, { binary: true });
    if (r.status !== 200) return r;
    const ws = (await loadXlsx(r.buf)).getWorksheet('PHAT');
    const out = []; ws.eachRow((row, n) => { if (n > 1) out.push(row.getCell(9).value); });
    return { status: 200, ly_do: out, so_dong: out.length };
  };
  assert.equal((await lay('')).so_dong, 2, 'mặc định: cả hai');
  const trong = await lay('?loai_tru=KHONG_DOI');
  assert.deepEqual([trong.status, trong.so_dong, trong.ly_do[0]], [200, 1, 'SHBG phải gồm 13 ký tự: 2 chữ, 9 số, 2 chữ']);
  assert.equal((await lay('?loai_tru=KHONG_DOI,SAI_DINH_DANG')).so_dong, 0, 'nhiều mã; còn lại file chỉ có tiêu đề');
  assert.equal((await lay('?loai_tru=SAI_DINH_DANG')).ly_do[0].startsWith('Trạng thái không đổi'), true);
  assert.equal((await lay('?loai_tru=XYZ')).status, 400);
  assert.match((await call('GET', `/api/phat/drafts/${id}/errors.xlsx?loai_tru=XYZ`, 'admin')).body.error, /Chỉ nhận: TRUNG_SHBG, TT_NGOAI_DS/);
  assert.equal((await lay('?loai_tru=a&loai_tru=b')).status, 400);
  assert.equal((await lay('?khac=1')).status, 400);
  // Commit: tách «lỗi cần sửa» / «không đổi»; đợt nhập ghi cả hai
  const res = await call('POST', `/api/phat/drafts/${id}/commit`, 'admin', { mode: 'hop-le' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.so_nhap, res.body.loi_can_sua, res.body.khong_doi, res.body.bo_qua_trong], [1, 1, 1, 0]);
  assert.deepEqual([res.body.tong_hop.loi, res.body.tong_hop.loi_can_sua, res.body.tong_hop.khong_doi], [2, 1, 1]);
  assert.equal(res.body.nhap_luc_bangkok, P.gioBangkok(res.body.nhap_luc));
  const b = batchRow(res.body.batch_id);
  assert.deepEqual([b.so_nhap, b.so_loi, b.so_khong_doi, b.so_bo_qua], [1, 1, 1, 0], 'so_loi = lỗi cần sửa, không gồm «không đổi»');
  const dong = (await ds_batch(res.body.batch_id)) || {};
  assert.equal(dong.so_khong_doi, 1);
});
async function ds_batch(id) {
  const all = (await call('GET', `/api/phat/batches?bcvh=${M2}&size=200`, 'admin')).body.items;
  return all.find((x) => x.id === id);
}

// ---------------- Việc 6: API tỷ lệ ----------------
test('tỷ lệ: mẫu số = SHBG đến ngày đó = san_luong của tong-quan-den; 5 nhóm; mức cập nhật; khung giờ đến; giờ nhập UTC + Bangkok', async () => {
  // Bắt đầu từ trạng thái sạch của M2
  ctx.db.exec(`DELETE FROM phat_status_current WHERE bcvh = '${M2}'; DELETE FROM phat_status_history WHERE bcvh = '${M2}'; UPDATE phat_batches SET trang_thai = 'da_hoan_tac' WHERE bcvh = '${M2}'`);
  const r0 = (await call('GET', `/api/phat/ty-le?bcvh=${M2}&ngay=2026-10-02`, 'ttvh')).body;
  assert.deepEqual([r0.mau_so, r0.muc_cap_nhat, r0.so_lieu_den_luc, r0.so_lieu_den_luc_bangkok, r0.theo_trang_thai.CHUA_CO_TT.so], [3, 0, null, null, 3], 'chưa có đợt nào');

  const S = await nhapM2('admin', [[sh(10), 'Phát thành công', null], [sh(21), 'Phát không thành công', null], [sh(23), 'Lạc hướng', null]], 'ty-le.xlsx');
  st.moc = S.nhap_luc;
  const tl = async (qs, who = 'ttvh') => (await call('GET', `/api/phat/ty-le${qs}`, who)).body;

  // --- Ngày 02/10 của M2: 3 SHBG (sh10 09:00 PTC, sh21 14:30 PKTC, sh22 20:00 chưa có)
  const d2 = await tl(`?bcvh=${M2}&ngay=2026-10-02`);
  assert.deepEqual(Object.keys(d2), ['bcvh', 'ngay', 'cung_ngay', 'mau_so', 'theo_trang_thai', 'muc_cap_nhat', 'so_shbg_chuyen_tiep_loai_bo', 'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'theo_khung_gio_den', 'ton_cho', 'nguong']); // THAMSO-2a: chỉ THÊM nguong ở cuối
  assert.deepEqual([d2.bcvh, d2.ngay, d2.cung_ngay, d2.mau_so, d2.muc_cap_nhat], [M2, '2026-10-02', true, 3, 0.6667]);
  assert.deepEqual(Object.keys(d2.theo_trang_thai), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'CHUA_CO_TT', 'LAC_HUONG']);
  assert.deepEqual(d2.theo_trang_thai.PTC, { nhan: 'Phát thành công', so: 1, ty_le: 0.3333 });
  assert.deepEqual(d2.theo_trang_thai.CHUA_CO_TT, { nhan: 'Chưa có thông tin phát', so: 1, ty_le: 0.3333 });
  assert.deepEqual([d2.theo_trang_thai.CHUYEN_HOAN.so, d2.theo_trang_thai.CHUYEN_HOAN.ty_le], [0, 0]);
  assert.equal(d2.mau_so, (await call('GET', `/api/arrivals/dashboard/tong-quan-den?bcvh=${M2}&date=2026-10-02`, 'admin')).body.san_luong.buu_gui, 'mẫu số khớp san_luong');
  assert.deepEqual([d2.so_lieu_den_luc, d2.so_lieu_den_luc_bangkok], [S.nhap_luc, P.gioBangkok(S.nhap_luc)]);
  // 6 khung giờ đến: trước 10h (sh10), 14–16h (sh21), sau 18h (sh22)
  assert.deepEqual(d2.theo_khung_gio_den.map((k) => [k.ma, k.so_den]), [['TRUOC_10', 1], ['10_12', 0], ['12_14', 0], ['14_16', 1], ['16_18', 0], ['SAU_18', 1]]);
  assert.deepEqual(d2.theo_khung_gio_den[0].theo_trang_thai.PTC, { nhan: 'Phát thành công', so: 1, ty_le: 1 });
  assert.deepEqual([d2.theo_khung_gio_den[0].muc_cap_nhat, d2.theo_khung_gio_den[5].muc_cap_nhat, d2.theo_khung_gio_den[1].muc_cap_nhat], [1, 0, null]);
  assert.equal(d2.theo_khung_gio_den[1].theo_trang_thai.PTC.ty_le, null, 'khung không có SHBG: tỷ lệ null');
  // Tồn chờ ngày 02: chỉ sh22 chưa có thông tin, đến 20:00 = mốc as_of -> dưới 2 giờ
  assert.deepEqual(d2.ton_cho, { moc_tinh_den: '2026-10-02 20:00:00', tong: 1, theo_nhom: [{ ma: 'DUOI_2H', nhan: 'Dưới 2 giờ', so: 1 }, { ma: '2_4H', nhan: '2–4 giờ', so: 0 }, { ma: 'TREN_4H', nhan: 'Trên 4 giờ', so: 0 }, { ma: 'QUA_NGAY', nhan: 'Qua ngày', so: 0 }] });

  // --- «Hôm nay» mặc định = ngày dữ liệu mới nhất của BCVH (04/10): 5 SHBG, sh23 Lạc hướng; tồn chờ có ranh giới 2 giờ / 4 giờ
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'CHUA_CO_TT', 0, '2026-10-12T00:00:00Z')").run(M2, sh(25)); // lưu rõ CHUA_CO_TT vẫn là «chưa có»
  const d4 = await tl(`?bcvh=${M2}`);
  assert.deepEqual([d4.ngay, d4.mau_so, d4.theo_trang_thai.LAC_HUONG.so, d4.theo_trang_thai.CHUA_CO_TT.so, d4.muc_cap_nhat], ['2026-10-04', 5, 1, 4, 0.2]);
  assert.equal(d4.mau_so, (await call('GET', `/api/arrivals/dashboard/tong-quan-den?bcvh=${M2}`, 'admin')).body.san_luong.buu_gui);
  assert.deepEqual(d4.theo_khung_gio_den.map((k) => k.so_den), [1, 0, 2, 1, 1, 0]);
  // as_of = 16:00: sh24 13:00 (3 giờ) 2–4h; sh25 16:00 (0) dưới 2h; sh26 14:00 (đúng 2 giờ) 2–4h; sh27 12:00 (đúng 4 giờ) trên 4h; sh22 ngày 02 = qua ngày
  assert.deepEqual(d4.ton_cho.theo_nhom.map((n) => n.so), [1, 2, 1, 1]);
  assert.deepEqual([d4.ton_cho.tong, d4.ton_cho.moc_tinh_den], [5, '2026-10-04 16:00:00']);

  // --- Ngày không có dữ liệu: mẫu số 0, tỷ lệ null; tồn chờ đều «qua ngày»
  const trong = await tl(`?bcvh=${M2}&ngay=2026-10-10`);
  assert.deepEqual([trong.mau_so, trong.muc_cap_nhat, trong.theo_trang_thai.PTC.ty_le, trong.ton_cho.moc_tinh_den], [0, null, null, null]);
  assert.deepEqual(trong.ton_cho.theo_nhom.map((n) => n.so), [0, 0, 0, 5]);

  // --- BCVH chưa có dữ liệu nào
  const rong = await tl('?bcvh=536250');
  assert.deepEqual([rong.ngay, rong.mau_so, rong.muc_cap_nhat, rong.so_lieu_den_luc, rong.ton_cho.tong], [null, 0, null, null, 0]);
  assert.equal(rong.theo_khung_gio_den.length, 6);

  // --- all: gộp các BCVH có dữ liệu; mỗi BCVH tính ngày của nó khi không chọn ngày
  const m = await tl(`?bcvh=${M}&ngay=2026-10-02`);
  const gop = await tl('?bcvh=all&ngay=2026-10-02');
  assert.equal(gop.mau_so, m.mau_so + d2.mau_so);
  assert.equal(gop.mau_so, (await call('GET', '/api/arrivals/dashboard/tong-quan-den?bcvh=all&date=2026-10-02', 'admin')).body.san_luong.buu_gui);
  for (const k of C.TT_MA) assert.equal(gop.theo_trang_thai[k].so, m.theo_trang_thai[k].so + d2.theo_trang_thai[k].so, k);
  assert.equal(gop.cung_ngay, true);
  const macDinh = await tl('');
  assert.deepEqual([macDinh.bcvh, macDinh.ngay, macDinh.cung_ngay], ['all', '2026-10-04', false], 'M mới nhất 03/10, M2 mới nhất 04/10');
  // DASH-7d/7e: khi các BCVH lệch ngày, cả thẻ tổng của Điều hành và «Xử lý và tỷ lệ phát» chỉ cộng BCVH có dữ liệu đúng ngày chung (04/10: chỉ M2 = 5);
  // M (mới nhất 03/10) nằm ngoài tổng, kể cả giờ nhập của đợt (so_lieu_den_luc) và tồn chờ. Mẫu số phát = tong_cong_theo_bcvh (cùng công thức A) của tong-quan-den.
  assert.equal(macDinh.mau_so, 5);
  assert.equal(macDinh.so_bcvh_trong_tong, 1);
  assert.deepEqual(macDinh.bcvh_ngoai_tong.find((x) => x.ma === M), { ma: M, ngay: '2026-10-03' });
  const tqAll = (await call('GET', '/api/arrivals/dashboard/tong-quan-den?bcvh=all', 'admin')).body;
  assert.equal(tqAll.so_bcvh_trong_tong, macDinh.so_bcvh_trong_tong, 'cùng tập T với thẻ Điều hành');
  assert.deepEqual(tqAll.bcvh_ngoai_tong, macDinh.bcvh_ngoai_tong);
  assert.equal(macDinh.mau_so, tqAll.san_luong.tong_cong_theo_bcvh);
  assert.equal(macDinh.mau_so, tqAll.san_luong.buu_gui, 'không SHBG nào qua 2 BCVH: A = B');
  assert.equal(macDinh.so_lieu_den_luc, ctx.db.prepare("SELECT MAX(nhap_luc) AS t FROM phat_batches WHERE trang_thai = 'da_nhap' AND bcvh = ?").get(M2).t, 'đợt gần nhất của các BCVH trong tổng');

  // --- Đợt đã hoàn tác không tính vào «số liệu tính đến lúc»
  const T = await nhapM2('admin', [[sh(24), 'Phát thành công', null]], 'ty-le2.xlsx');
  const sau = await tl(`?bcvh=${M2}&ngay=2026-10-04`);
  assert.equal(sau.so_lieu_den_luc, T.nhap_luc >= S.nhap_luc ? T.nhap_luc : S.nhap_luc);
  assert.equal((await undo('admin', T.batch_id)).status, 200);
  assert.equal((await tl(`?bcvh=${M2}&ngay=2026-10-04`)).so_lieu_den_luc, S.nhap_luc);
});

test('tỷ lệ: tham số và quyền — ADMIN, TTVH, GDVH (mọi BCVH, kể cả chưa gán); STAFF, TIVI 403; không token 401', async () => {
  const g = (qs, who) => call('GET', `/api/phat/ty-le${qs}`, who);
  for (const who of ['admin', 'ttvh', 'gdvhM', 'gdvhM2', 'gdvhNone']) {
    assert.equal((await g(`?bcvh=${M}`, who)).status, 200, `${who} ${M}`);
    assert.equal((await g(`?bcvh=${M2}`, who)).status, 200, `${who} ${M2}`);
    assert.equal((await g('', who)).status, 200, `${who} all`);
  }
  assert.equal((await g(`?bcvh=${M}&ngay=2026-10-02`, 'gdvhM2')).body.mau_so, (await g(`?bcvh=${M}&ngay=2026-10-02`, 'admin')).body.mau_so);
  for (const who of ['staff', 'tivi']) assert.equal((await g('', who)).status, 403, who);
  assert.equal((await g('', undefined)).status, 401);
  for (const qs of ['?bcvh=999999', '?bcvh=533140&bcvh=535470', '?ngay=2026-02-30', '?ngay=abc', '?ngay=2026-10-02 08:00', '?x=1']) assert.equal((await g(qs, 'admin')).status, 400, qs);
});

// ---------------- Nhật ký (chặng 2) ----------------
test('nhật ký bảo mật: hoàn tác ghi sự kiện phat_undo; loai_tru được ghi; không có SHBG hay ghi chú', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const lines = fs.readFileSync(process.env.SECURITY_LOG, 'utf8').split('\n').filter((l) => l.includes('"event":"phat_'));
  const undos = lines.filter((l) => l.includes('"event":"phat_undo"')).map((l) => JSON.parse(l));
  assert.ok(undos.length >= 6, `có ${undos.length} sự kiện hoàn tác`);
  assert.deepEqual([undos[0].bcvh, typeof undos[0].batch_id, typeof undos[0].rows, typeof undos[0].user_id], [M2, 'number', 'number', 'string']);
  assert.ok(lines.some((l) => l.includes('"event":"phat_draft_errors"') && l.includes('"loai_tru":"KHONG_DOI"')));
  assert.ok(!lines.some((l) => /ZZ9\d{8}VN/.test(l)), 'không có SHBG trong nhật ký');
  assert.ok(!lines.some((l) => l.includes('ghi chú A') || l.includes('ghi chú B') || l.includes('gggggg')), 'không có ghi chú');
});

// ---------------- PHAT-1b: danh sách bản kiểm tra của tôi + quyền sở hữu ----------------
const dsBan = (who, qs = '') => call('GET', `/api/phat/drafts${qs}`, who);
const idsBan = (res) => res.body.items.map((x) => x.id);
/** Dòng hợp lệ chắc chắn cho M2: đổi trạng thái sh(25) sang giá trị khác hiện có. */
function dongHopLeM2() {
  const cur = ctx.db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M2, sh(25));
  return [[sh(25), cur && cur.trang_thai === 'PTC' ? 'Phát không thành công' : 'Phát thành công', null]];
}
async function banM2(who, ten) {
  const res = await upload(who, M2, await xlsxBuf([...dongHopLeM2(), [sh(26), 'Trạng thái lạ', null], [sh(27), null, null]]), ten);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id;
}

test('PHAT-1b danh sách: chỉ bản của mình, mới nhất trước, đủ trường, không có nội dung dòng; tổng hợp khớp GET /drafts/:id', async () => {
  const a1 = await banM2('gdvhM2', 'a1.xlsx');
  const a2 = await banM2('gdvhM2b', 'a2.xlsx'); // người khác, cùng BCVH
  const a3 = await banM2('admin', 'a3.xlsx');
  const a4 = await banM2('gdvhM2', 'a4.xlsx');
  const b1 = (await upload('gdvhM', M, await xlsxBuf([[sh(7), 'Phát thành công', null]]), 'b1.xlsx')).body.id; // BCVH khác của người khác

  const mine = await dsBan('gdvhM2', `?bcvh=${M2}`);
  assert.equal(mine.status, 200);
  const ids = idsBan(mine);
  assert.ok(ids.includes(a1) && ids.includes(a4), 'có bản của mình');
  assert.ok(!ids.includes(a2) && !ids.includes(a3) && !ids.includes(b1), 'không có bản của người khác / BCVH khác');
  assert.ok(ids.indexOf(a4) < ids.indexOf(a1), 'mới nhất trước');
  assert.ok(mine.body.items.every((x) => x.nguoi_tao === 'PH_GDVH2' && x.bcvh === M2 && x.cua_toi === true));
  const it = mine.body.items.find((x) => x.id === a1);
  assert.deepEqual(Object.keys(it), ['id', 'bcvh', 'ten_file', 'tao_luc', 'tao_luc_bangkok', 'het_han_luc', 'nguoi_tao', 'cua_toi', 'tong_dong', 'hop_le', 'bo_qua', 'loi', 'da_nhap']);
  assert.equal(it.ten_file, 'a1.xlsx');
  assert.match(it.tao_luc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(it.tao_luc_bangkok, P.gioBangkok(it.tao_luc));
  const full = (await call('GET', `/api/phat/drafts/${a1}`, 'gdvhM2')).body;
  assert.equal(it.het_han_luc, full.het_han_luc);
  assert.deepEqual([it.tong_dong, it.hop_le, it.bo_qua, it.loi, it.da_nhap], [full.tong_hop.tong_dong, full.tong_hop.hop_le, full.tong_hop.bo_qua_trong, full.tong_hop.loi, full.tong_hop.da_nhap]);
  assert.deepEqual([it.tong_dong, it.hop_le, it.bo_qua, it.loi, it.da_nhap], [3, 1, 1, 1, 0]);
  assert.ok(!JSON.stringify(mine.body).includes(sh(25)), 'không trả nội dung dòng (SHBG)');
  // Sau khi nhập: da_nhap tăng, hop_le giảm
  assert.equal((await call('POST', `/api/phat/drafts/${a1}/commit`, 'gdvhM2', { mode: 'hop-le' })).status, 200);
  const sau = (await dsBan('gdvhM2', `?bcvh=${M2}`)).body.items.find((x) => x.id === a1);
  assert.deepEqual([sau.tong_dong, sau.hop_le, sau.bo_qua, sau.loi, sau.da_nhap], [3, 0, 1, 1, 1]);
  st.pb = { a1, a2, a3, a4, b1 };
});

test('PHAT-1b danh sách: ADMIN, TTVH — của mình, hoặc của mọi người với tat_ca=1; GDVH tat_ca=1 -> 403', async () => {
  const { a1, a2, a3, a4, b1 } = st.pb;
  const ownAdmin = await dsBan('admin', `?bcvh=${M2}`);
  assert.ok(idsBan(ownAdmin).includes(a3) && ![a1, a2, a4].some((x) => idsBan(ownAdmin).includes(x)), 'ADMIN không tat_ca: chỉ của mình');
  assert.ok(ownAdmin.body.items.every((x) => x.cua_toi));
  assert.deepEqual(idsBan(await dsBan('admin', `?bcvh=${M2}&tat_ca=0`)), idsBan(ownAdmin));
  for (const who of ['admin', 'ttvh']) {
    const all = await dsBan(who, `?bcvh=${M2}&tat_ca=1`);
    assert.equal(all.status, 200, who);
    for (const x of [a1, a2, a3, a4]) assert.ok(idsBan(all).includes(x), `${who} thấy ${x}`);
    assert.ok(!idsBan(all).includes(b1), 'đúng BCVH');
    const x2 = all.body.items.find((x) => x.id === a2);
    assert.deepEqual([x2.nguoi_tao, x2.cua_toi], ['PH_GDVH3', false]);
    assert.ok(all.body.items.some((x) => x.id === a3 && x.cua_toi === (who === 'admin')));
    const tg = all.body.items.map((x) => x.tao_luc);
    assert.deepEqual(tg, [...tg].sort().reverse(), 'mới nhất trước');
  }
  assert.ok(idsBan(await dsBan('ttvh', `?bcvh=${M2}`)).every((x) => ![a1, a2, a3, a4].includes(x)), 'TTVH không tat_ca: chưa có bản nào của mình');
  assert.equal((await dsBan('gdvhM2', `?bcvh=${M2}&tat_ca=1`)).status, 403);
  assert.equal((await dsBan('gdvhM2', `?bcvh=${M2}&tat_ca=0`)).status, 200);
  assert.equal((await dsBan('admin', `?bcvh=${M2}&tat_ca=2`)).status, 400);
  assert.equal((await dsBan('admin', `?bcvh=${M2}&tat_ca=1&tat_ca=1`)).status, 400);
});

test('PHAT-1b danh sách: quyền và tham số — GDVH chưa gán / BCVH khác, STAFF, TIVI 403; không token 401; thiếu / sai bcvh, tham số lạ 400', async () => {
  assert.equal((await dsBan('gdvhNone', `?bcvh=${M2}`)).status, 403);
  assert.match((await dsBan('gdvhNone', `?bcvh=${M2}`)).body.error, /chưa được gán BCVH nào/);
  assert.equal((await dsBan('gdvhM', `?bcvh=${M2}`)).status, 403, 'GDVH được gán M, không được xem danh sách M2');
  assert.equal((await dsBan('gdvhM', `?bcvh=${M}`)).status, 200);
  for (const who of ['staff', 'tivi']) assert.equal((await dsBan(who, `?bcvh=${M2}`)).status, 403, who);
  assert.equal((await dsBan(undefined, `?bcvh=${M2}`)).status, 401);
  assert.equal((await dsBan('admin')).status, 400, 'thiếu bcvh');
  assert.equal((await dsBan('admin', '?bcvh=999999')).status, 400);
  assert.equal((await dsBan('admin', `?bcvh=${M2}&x=1`)).status, 400);
  assert.equal((await dsBan('admin', `?bcvh=${M2}&page=1`)).status, 400);
});

test('PHAT-1b danh sách: bản hết hạn không hiện (bị dọn); bản còn hạn chưa có dòng vẫn hiện với tổng 0', async () => {
  const them = (id, het, rows) => {
    ctx.db.prepare('INSERT INTO phat_drafts (id, bcvh, user_id, tao_luc, het_han_luc, ten_file) VALUES (?, ?, ?, ?, ?, ?)').run(id, M2, st.ids.gdvhM2, '2026-01-01T00:00:00Z', het, id);
    for (let i = 0; i < rows; i++) ctx.db.prepare("INSERT INTO phat_draft_rows (draft_id, so_dong_goc, shbg) VALUES (?, ?, 'AB12')").run(id, i + 2);
  };
  them('pb-het-han', '2000-01-01T00:00:00Z', 2);
  them('pb-con-han', '2999-01-01T00:00:00Z', 0);
  const ds = await dsBan('gdvhM2', `?bcvh=${M2}`);
  assert.ok(!idsBan(ds).includes('pb-het-han'));
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_drafts WHERE id = 'pb-het-han'").get().n, 0, 'đã dọn khi truy cập');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id = 'pb-het-han'").get().n, 0);
  const conHan = ds.body.items.find((x) => x.id === 'pb-con-han');
  assert.deepEqual([conHan.tong_dong, conHan.hop_le, conHan.bo_qua, conHan.loi, conHan.da_nhap], [0, 0, 0, 0, 0]);
  // Hết hạn đúng lúc xem: bản có het_han_luc trong quá khứ cũng không hiện ở chế độ tat_ca
  ctx.db.prepare("UPDATE phat_drafts SET het_han_luc = '2026-01-02T00:00:00Z' WHERE id = 'pb-con-han'").run();
  assert.ok(!idsBan(await dsBan('admin', `?bcvh=${M2}&tat_ca=1`)).includes('pb-con-han'));
});

test('PHAT-1b sở hữu: người khác (cùng BCVH, BCVH khác, chưa gán) -> 404 ở mọi điểm cuối; STAFF, TIVI 403; bản không bị đổi', async () => {
  const id = await banM2('gdvhM2', 'chu.xlsx');
  const dongTruoc = JSON.stringify(await rowsOf(id, 'gdvhM2'));
  const batchTruoc = ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n;
  const calls = (who) => Promise.all([
    call('GET', `/api/phat/drafts/${id}`, who), call('GET', `/api/phat/drafts/${id}/rows`, who),
    call('GET', `/api/phat/drafts/${id}/errors.xlsx`, who, undefined, { binary: true }),
    call('PATCH', `/api/phat/drafts/${id}/rows`, who, { rows: [{ id: 1, ghi_chu: 'x' }] }), call('DELETE', `/api/phat/drafts/${id}/rows`, who, { ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/fill`, who, { trang_thai: 'PTC', ids: [1] }),
    call('POST', `/api/phat/drafts/${id}/assign-list`, who, { trang_thai: 'PTC', shbg: [sh(25)] }),
    call('POST', `/api/phat/drafts/${id}/commit`, who, { mode: 'hop-le' })
  ]);
  for (const who of ['gdvhM2b', 'gdvhM', 'gdvhNone']) assert.deepEqual((await calls(who)).map((x) => x.status), Array(8).fill(404), who);
  for (const who of ['staff', 'tivi']) assert.deepEqual((await calls(who)).map((x) => x.status), Array(8).fill(403), who);
  const lo = await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2b');
  assert.equal(lo.body.error, (await call('GET', '/api/phat/drafts/khong-co-id', 'gdvhM2b')).body.error, '404 giống hệt bản không tồn tại');
  assert.equal(JSON.stringify(await rowsOf(id, 'gdvhM2')), dongTruoc, 'các lệnh bị từ chối không đổi gì');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n, batchTruoc);
  // Người tạo làm được tất cả
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 200);
  assert.equal((await call('GET', `/api/phat/drafts/${id}/rows`, 'gdvhM2')).status, 200);
  assert.equal((await call('GET', `/api/phat/drafts/${id}/errors.xlsx`, 'gdvhM2', undefined, { binary: true })).status, 200);
  const dong0 = (await rowsOf(id, 'gdvhM2'))[0].id;
  assert.equal((await call('PATCH', `/api/phat/drafts/${id}/rows`, 'gdvhM2', { rows: [{ id: dong0, ghi_chu: 'của tôi' }] })).status, 200);
  st.pb.chu = id;
});

test('PHAT-1b sở hữu: ADMIN, TTVH xem được bản của người khác nhưng không sửa / điền / xoá dòng / tải file lỗi / commit được (403, không đổi gì)', async () => {
  const id = st.pb.chu;
  const batchTruoc = ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n;
  const dongTruoc = JSON.stringify(await rowsOf(id, 'gdvhM2'));
  for (const who of ['admin', 'ttvh']) {
    const g = await call('GET', `/api/phat/drafts/${id}`, who);
    assert.equal(g.status, 200, who);
    assert.equal(g.body.tong_hop.tong_dong, 3);
    assert.equal((await call('GET', `/api/phat/drafts/${id}/rows`, who)).body.items.length, 3);
    const sai = await Promise.all([
      call('GET', `/api/phat/drafts/${id}/errors.xlsx`, who, undefined, { binary: true }),
      call('PATCH', `/api/phat/drafts/${id}/rows`, who, { rows: [{ id: 1, ghi_chu: 'x' }] }), call('DELETE', `/api/phat/drafts/${id}/rows`, who, { filter: {} }),
      call('POST', `/api/phat/drafts/${id}/fill`, who, { trang_thai: 'PTC', filter: {} }),
      call('POST', `/api/phat/drafts/${id}/assign-list`, who, { trang_thai: 'PTC', shbg: [sh(25)] }),
      call('POST', `/api/phat/drafts/${id}/commit`, who, { mode: 'hop-le' })
    ]);
    assert.deepEqual(sai.map((x) => x.status), Array(6).fill(403), who);
    assert.match(sai[5].body.error, /chỉ xem được, không sửa hay nhập thay/);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches').get().n, batchTruoc, 'không có đợt nào do ADMIN / TTVH nhập thay');
  assert.equal(JSON.stringify(await rowsOf(id, 'gdvhM2')), dongTruoc);
  // Bản của chính ADMIN: ADMIN tải file lỗi và nhập được
  assert.equal((await call('GET', `/api/phat/drafts/${st.pb.a3}/errors.xlsx`, 'admin', undefined, { binary: true })).status, 200);
  const nhap = await call('POST', `/api/phat/drafts/${st.pb.a3}/commit`, 'admin', { mode: 'hop-le' });
  assert.notEqual(nhap.status, 403, 'bản của chính mình qua được cổng sở hữu');
  // Người tạo commit được bản của mình
  const ok = await call('POST', `/api/phat/drafts/${id}/commit`, 'gdvhM2', { mode: 'hop-le' });
  assert.equal(ok.status, 200);
  assert.equal(ctx.db.prepare('SELECT user_id FROM phat_batches WHERE id = ?').get(ok.body.batch_id).user_id, st.ids.gdvhM2);
});

test('PHAT-1b sở hữu: GDVH bị bỏ gán BCVH mất quyền ngay với bản của chính mình (403, kể cả danh sách); gán lại thì có lại; ADMIN vẫn xem', async () => {
  const id = await banM2('gdvhM2', 'mat-quyen.xlsx');
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, []);
  try {
    const calls = await Promise.all([
      call('GET', `/api/phat/drafts/${id}`, 'gdvhM2'), call('GET', `/api/phat/drafts/${id}/rows`, 'gdvhM2'),
      call('GET', `/api/phat/drafts/${id}/errors.xlsx`, 'gdvhM2', undefined, { binary: true }),
      call('PATCH', `/api/phat/drafts/${id}/rows`, 'gdvhM2', { rows: [{ id: 1, ghi_chu: 'x' }] }),
      call('POST', `/api/phat/drafts/${id}/commit`, 'gdvhM2', { mode: 'hop-le' }), dsBan('gdvhM2', `?bcvh=${M2}`)
    ]);
    assert.deepEqual(calls.map((x) => x.status), Array(6).fill(403));
    assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'admin')).status, 200, 'ADMIN vẫn xem');
  } finally {
    replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M2]);
  }
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 200, 'gán lại thì có lại');
  assert.ok(idsBan(await dsBan('gdvhM2', `?bcvh=${M2}`)).includes(id));
  // Chuyển gán sang BCVH khác cũng mất quyền với M2
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M]);
  try {
    assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 403);
  } finally {
    replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M2]);
  }
});

// ---------------- PHAT-1b (d): xoá cả bản kiểm tra ----------------
test('PHAT-1b xoá bản: người khác 404, STAFF/TIVI 403, không token 401; người tạo xoá được bản của mình; bản không tồn tại / xoá lần hai 404', async () => {
  const id = await banM2('gdvhM2', 'xoa1.xlsx');
  const dem = () => ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id = ?').get(id).n;
  const del = (who, i = id) => call('DELETE', `/api/phat/drafts/${i}`, who);
  for (const who of ['gdvhM2b', 'gdvhM', 'gdvhNone']) assert.equal((await del(who)).status, 404, who);
  for (const who of ['staff', 'tivi']) assert.equal((await del(who)).status, 403, who);
  assert.equal((await del(undefined)).status, 401);
  assert.equal(dem(), 3, 'các lệnh bị từ chối không đổi gì');
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 200);
  const ok = await del('gdvhM2');
  assert.deepEqual([ok.status, ok.body.da_xoa, ok.body.so_dong, ok.body.id], [200, true, 3, id]);
  assert.equal(dem(), 0, 'dòng của bản đã xoá');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_drafts WHERE id = ?').get(id).n, 0);
  assert.equal((await call('GET', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 404);
  assert.ok(!idsBan(await dsBan('gdvhM2', `?bcvh=${M2}`)).includes(id));
  assert.equal((await del('gdvhM2')).status, 404, 'xoá lần hai');
  assert.equal((await del('admin', 'khong-co-id')).status, 404);
});

test('PHAT-1b xoá bản: ADMIN, TTVH xoá mọi bản; GDVH bị bỏ gán BCVH không xoá được bản của chính mình (403)', async () => {
  const a = await banM2('gdvhM2', 'xoa-admin.xlsx');
  const b = await banM2('gdvhM2b', 'xoa-ttvh.xlsx');
  assert.equal((await call('DELETE', `/api/phat/drafts/${a}`, 'admin')).status, 200);
  assert.equal((await call('DELETE', `/api/phat/drafts/${b}`, 'ttvh')).status, 200);
  for (const i of [a, b]) assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_drafts WHERE id = ?').get(i).n, 0);
  const c = await banM2('gdvhM2', 'xoa-mat-quyen.xlsx');
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, []);
  try {
    assert.equal((await call('DELETE', `/api/phat/drafts/${c}`, 'gdvhM2')).status, 403);
  } finally {
    replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M2]);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_drafts WHERE id = ?').get(c).n, 1, 'bản còn nguyên');
  assert.equal((await call('DELETE', `/api/phat/drafts/${c}`, 'gdvhM2')).status, 200);
});

test('PHAT-1b xoá bản đã có dòng DA_NHAP: đợt nhập, trạng thái, lịch sử vẫn nguyên; hoàn tác đợt vẫn chạy và khôi phục đúng', async () => {
  const cur = () => ctx.db.prepare('SELECT * FROM phat_status_current WHERE bcvh = ? AND shbg = ?').get(M2, sh(25));
  const truoc = cur();
  const id = await banM2('gdvhM2', 'xoa-da-nhap.xlsx');
  const nhap = await call('POST', `/api/phat/drafts/${id}/commit`, 'gdvhM2', { mode: 'hop-le' });
  assert.equal(nhap.status, 200);
  const batchId = nhap.body.batch_id;
  const snap = () => JSON.stringify({
    batch: ctx.db.prepare('SELECT * FROM phat_batches WHERE id = ?').get(batchId),
    cur: cur(),
    his: ctx.db.prepare('SELECT * FROM phat_status_history ORDER BY id').all(),
    tong: ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_status_current').get().n
  });
  const truocXoa = snap();
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM phat_draft_rows WHERE draft_id = ? AND ket_qua = 'DA_NHAP'").get(id).n, 1);
  assert.equal((await call('DELETE', `/api/phat/drafts/${id}`, 'gdvhM2')).status, 200);
  assert.equal(snap(), truocXoa, 'đợt nhập, trạng thái hiện tại và lịch sử không đổi sau khi xoá bản');
  assert.equal(ctx.db.prepare('SELECT draft_id FROM phat_batches WHERE id = ?').get(batchId).draft_id, id, 'đợt vẫn ghi mã bản đã xoá');
  const ds = (await call('GET', `/api/phat/batches?bcvh=${M2}&size=200`, 'gdvhM2')).body.items;
  assert.ok(ds.find((x) => x.id === batchId && x.trang_thai === 'da_nhap'), 'danh sách đợt vẫn có đợt');
  // Hoàn tác khi bản kiểm tra không còn
  const hoan = await undo('gdvhM2', batchId);
  assert.equal(hoan.status, 200);
  assert.equal(batchRow(batchId).trang_thai, 'da_hoan_tac');
  const sau = cur();
  if (truoc) assert.deepEqual([sau.trang_thai, sau.ghi_chu, sau.batch_id], [truoc.trang_thai, truoc.ghi_chu, truoc.batch_id], 'khôi phục trạng thái ngay trước');
  else assert.equal(sau, undefined, 'trước đó chưa có -> xoá trạng thái');
});

// ---------------- PHAT-2b-1: nguoi_nhap_lua_chon ----------------
test('PHAT-2b-1 danh sách đợt: nguoi_nhap_lua_chon — người nhập khác nhau theo BCVH đang chọn, sắp theo tên, không theo trang, GDVH không thấy người của BCVH khác', async () => {
  const ds = (who, qs = '') => call('GET', `/api/phat/batches${qs}`, who);
  const them = (userId, bcvh, trangThai) => ctx.db.prepare(`INSERT INTO phat_batches (bcvh, user_id, nhap_luc, ten_file, so_nhap, trang_thai) VALUES (?, ?, '2026-10-10T01:00:00Z', 'nn.xlsx', 1, ?)`)
    .run(bcvh, userId, trangThai);
  // Hai người nhập chỉ có ở một BCVH: Bình ở M2 (nhập 2 đợt), Ân ở M (chỉ có đợt đã hoàn tác -> vẫn được kể)
  const binh = seedUser(ctx.db, { hrmCode: 'PH_NN_BINH', fullName: 'Bình Test', role: 'GDVH', password: 'Gdvh@123' });
  const an = seedUser(ctx.db, { hrmCode: 'PH_NN_AN', fullName: 'Ân Test', role: 'GDVH', password: 'Gdvh@123' });
  them(binh, M2, 'da_nhap'); them(binh, M2, 'da_nhap'); them(an, M, 'da_hoan_tac');

  const lay = (res) => res.body.nguoi_nhap_lua_chon;
  const ids = (res) => lay(res).map((x) => x.id);
  const tuDb = (codes) => ctx.db.prepare(`SELECT DISTINCT b.user_id AS id FROM phat_batches b WHERE b.bcvh IN (${codes.map(() => '?').join(',')})`).all(...codes).map((r) => r.id).sort();

  // Quản lý, đúng một BCVH
  const m2 = await ds('admin', `?bcvh=${M2}`);
  assert.equal(m2.status, 200);
  assert.deepEqual([...ids(m2)].sort(), tuDb([M2]), 'đúng tập người nhập của BCVH đang chọn, mỗi người một lần');
  assert.ok(ids(m2).includes(binh) && !ids(m2).includes(an));
  assert.deepEqual(Object.keys(lay(m2)[0]), ['id', 'hrm_code', 'full_name']);
  assert.deepEqual(lay(m2).find((x) => x.id === binh), { id: binh, hrm_code: 'PH_NN_BINH', full_name: 'Bình Test' });
  const ten = lay(m2).map((x) => x.full_name);
  assert.deepEqual(ten, [...ten].sort((x, y) => x.localeCompare(y, 'vi')), 'sắp theo full_name');

  // Không theo phân trang: size=1 trang 2 vẫn đủ danh sách
  const trang = await ds('admin', `?bcvh=${M2}&page=2&size=1`);
  assert.equal(trang.body.items.length, 1);
  assert.deepEqual(lay(trang), lay(m2));

  // Không chọn BCVH / all: mọi BCVH được phép; Ân (M, đợt đã hoàn tác) và Bình (M2) đều có, ân đứng trước bình
  const tat = await ds('admin', '?size=1');
  assert.deepEqual([...ids(tat)].sort(), tuDb([M, M2]));
  assert.ok(ids(tat).indexOf(an) < ids(tat).indexOf(binh) && ids(tat).indexOf(an) >= 0);
  assert.deepEqual(lay(await ds('admin', '?bcvh=all')), lay(tat));

  // GDVH chỉ thấy người nhập thuộc BCVH được giao (kể cả người khác nhập vào BCVH đó), không thấy BCVH khác
  const gM = await ds('gdvhM');
  assert.deepEqual([...ids(gM)].sort(), tuDb([M]));
  assert.ok(ids(gM).includes(an) && !ids(gM).includes(binh));
  const gM2 = await ds('gdvhM2');
  assert.deepEqual([...ids(gM2)].sort(), tuDb([M2]));
  assert.ok(ids(gM2).includes(binh) && !ids(gM2).includes(an));
  assert.ok(ids(gM2).includes(st.ids.ttvh), 'GDVH thấy cả người nhập khác (TTVH) vào BCVH của mình');
  assert.deepEqual(lay(await ds('gdvhM2', `?bcvh=${M2}`)), lay(gM2));
  // BCVH không được phép: 403, không trả danh sách
  const cam = await ds('gdvhM2', `?bcvh=${M}`);
  assert.equal(cam.status, 403);
  assert.equal(cam.body.nguoi_nhap_lua_chon, undefined);
  assert.equal((await ds('gdvhNone')).body.nguoi_nhap_lua_chon, undefined);
  // BCVH chưa có đợt nào: danh sách rỗng
  const trong = ctx.db.prepare('SELECT COUNT(*) AS n FROM phat_batches WHERE bcvh = ?');
  const chua = VALID_BCVH_CODES.find((c) => trong.get(c).n === 0);
  if (chua) assert.deepEqual(lay(await ds('admin', `?bcvh=${chua}`)), []);
});

// =====================================================================================================================
// PHAT-2b-1: số cảnh báo của đợt, xem trước hoàn tác, 409 giàu thông tin, lọc lịch sử, chữ 403 «hoàn tác».
// Mỗi ca dọn trạng thái M2 trước (SQL, như ca tỷ lệ ở trên) để SHBG sh(21..27) chưa có trạng thái.
// =====================================================================================================================
const sachM2 = () => ctx.db.exec(`DELETE FROM phat_status_current WHERE bcvh = '${M2}'; DELETE FROM phat_status_history WHERE bcvh = '${M2}';
  UPDATE phat_batches SET trang_thai = 'da_hoan_tac' WHERE bcvh = '${M2}' AND trang_thai = 'da_nhap'`);
const GHI_CHU_DAI = 'g'.repeat(600); // > 500 ký tự: cảnh báo «Ghi chú bị cắt»
const batchItem = async (id, who = 'admin', bcvh = M2) => (await call('GET', `/api/phat/batches?bcvh=${bcvh}&size=200`, who)).body.items.find((x) => x.id === id);

test('PHAT-2b-1 số cảnh báo của đợt: đếm lúc nhập (trước khi xoá canh_bao), mode da-chon chỉ đếm dòng được chọn, đợt cũ NULL; có trong /batches và phản hồi commit', async () => {
  sachM2();
  // hop-le: 1 dòng có cảnh báo (ghi chú dài), 1 dòng không
  const A = await nhapM2('admin', [[sh(21), 'Phát thành công', GHI_CHU_DAI], [sh(22), 'Phát thành công', 'ngắn']], 'cb-a.xlsx');
  assert.deepEqual([A.so_nhap, A.so_canh_bao, batchRow(A.batch_id).so_canh_bao], [2, 1, 1]);
  assert.equal((await batchItem(A.batch_id)).so_canh_bao, 1);
  // sau khi nhập canh_bao của dòng bị xoá, nhưng số của đợt vẫn giữ
  assert.equal((await rowsOf(A.draft.id, 'admin', '&canh_bao=1')).length, 0);

  // không cảnh báo -> 0 (không phải NULL)
  const B = await nhapM2('admin', [[sh(23), 'Phát thành công', null]], 'cb-b.xlsx');
  assert.deepEqual([B.so_canh_bao, batchRow(B.batch_id).so_canh_bao, (await batchItem(B.batch_id)).so_canh_bao], [0, 0, 0]);

  // chuyển bất thường cũng là cảnh báo: sh(21) PTC -> Chuyển hoàn
  const Cc = await nhapM2('ttvh', [[sh(21), 'Chuyển hoàn', null]], 'cb-c.xlsx');
  assert.equal(Cc.so_canh_bao, 1);

  // da-chon: 2 dòng cảnh báo + 1 dòng thường trong file, chỉ chọn 1 dòng cảnh báo + 1 dòng thường
  const up = await upload('admin', M2, await xlsxBuf([[sh(24), 'Phát thành công', GHI_CHU_DAI], [sh(25), 'Phát thành công', GHI_CHU_DAI], [sh(26), 'Phát thành công', null]]), 'cb-d.xlsx');
  assert.equal(up.body.tong_hop.canh_bao, 2);
  const L = byLine(await rowsOf(up.body.id));
  const D = await call('POST', `/api/phat/drafts/${up.body.id}/commit`, 'admin', { mode: 'da-chon', ids: [L[2].id, L[4].id] });
  assert.equal(D.status, 200, JSON.stringify(D.body));
  assert.deepEqual([D.body.so_nhap, D.body.so_canh_bao], [2, 1], 'chỉ đếm dòng được nhập');
  assert.equal(batchRow(D.body.batch_id).so_canh_bao, 1);
  // nhập tiếp dòng còn lại (có cảnh báo): đợt mới đếm riêng
  const E = await call('POST', `/api/phat/drafts/${up.body.id}/commit`, 'admin', { mode: 'hop-le' });
  assert.deepEqual([E.body.so_nhap, E.body.so_canh_bao], [1, 1]);

  // đợt cũ (có trước khi thêm cột): NULL = không rõ, KHÔNG tính ngược
  const cu = Number(ctx.db.prepare(`INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, '2026-09-01T00:00:00Z', 5)`).run(M2, st.ids.admin).lastInsertRowid);
  assert.equal(batchRow(cu).so_canh_bao, null);
  const it = await batchItem(cu);
  assert.equal(it.so_canh_bao, null);
  assert.ok('so_canh_bao' in it, 'khoá có mặt, giá trị null');
});

/** Chụp toàn bộ nội dung các bảng phat_* (để chứng minh một điểm cuối không ghi gì). */
const chupPhat = () => JSON.stringify(['phat_batches', 'phat_status_current', 'phat_status_history', 'phat_drafts', 'phat_draft_rows']
  .map((t) => ctx.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
const NGUOI = (key, hrm) => ({ id: st.ids[key], hrm_code: hrm, full_name: hrm });

test('PHAT-2b-1 undo-preview: khớp /undo thật, không ghi gì, đợt bị chặn có dot_vuong_chi_tiet, 409 giữ trường cũ và thêm trường mới, đợt đã hoàn tác', async () => {
  sachM2();
  const X = await nhapM2('admin', [[sh(21), 'Phát thành công', 'a'], [sh(22), 'Phát không thành công', null]], 'pv-x.xlsx');
  const Y = await nhapM2('ttvh', [[sh(21), 'Chuyển hoàn', 'b'], [sh(23), 'Phát thành công', null]], 'pv-y.xlsx');
  assert.equal(Y.so_canh_bao, 1, 'PTC → Chuyển hoàn');
  const pv = (who, id) => call('GET', `/api/phat/batches/${id}/undo-preview`, who);

  // Đợt Y (mới nhất): hoàn tác được; 1 SHBG khôi phục (sh(21) về PTC của X), 1 xoá (sh(23) trước đó chưa có)
  const truoc = chupPhat();
  const py = await pv('admin', Y.batch_id);
  assert.equal(py.status, 200, JSON.stringify(py.body));
  assert.deepEqual(py.body, {
    batch_id: Y.batch_id, bcvh: M2, trang_thai: 'da_nhap', so_nhap: 2, so_se_khoi_phuc: 1, so_se_xoa_trang_thai: 1,
    co_the_hoan_tac: true, ly_do_khong_the: null, so_shbg_vuong: 0, dot_vuong_chi_tiet: []
  });
  // Đợt X: bị chặn bởi Y (sh(21)); cả 2 SHBG của X trước đó chưa có trạng thái -> 2 xoá, 0 khôi phục
  const px = await pv('admin', X.batch_id);
  assert.equal(px.status, 200);
  const yRow = batchRow(Y.batch_id);
  assert.deepEqual(px.body, {
    batch_id: X.batch_id, bcvh: M2, trang_thai: 'da_nhap', so_nhap: 2, so_se_khoi_phuc: 0, so_se_xoa_trang_thai: 2,
    co_the_hoan_tac: false, ly_do_khong_the: 'BI_CHAN', so_shbg_vuong: 1,
    dot_vuong_chi_tiet: [{ id: Y.batch_id, nhap_luc: yRow.nhap_luc, nhap_luc_bangkok: P.gioBangkok(yRow.nhap_luc), nhap_boi: NGUOI('ttvh', 'PH_TTVH'), so_nhap: 2 }]
  });
  assert.equal(chupPhat(), truoc, 'xem trước không ghi gì (mọi bảng phat_* nguyên vẹn)');

  // 409 của /undo: giữ dot_vuong, so_shbg_vuong; thêm dot_vuong_chi_tiet (giống hệt xem trước)
  const chan = await undo('admin', X.batch_id);
  assert.equal(chan.status, 409);
  assert.deepEqual([chan.body.so_shbg_vuong, chan.body.dot_vuong], [1, [Y.batch_id]]);
  assert.deepEqual(chan.body.dot_vuong_chi_tiet, px.body.dot_vuong_chi_tiet);
  assert.match(chan.body.error, /1 SHBG của đợt này đã được thay đổi bởi đợt nhập sau/);

  // /undo thật của Y cho đúng số xem trước đã báo
  const uy = await undo('admin', Y.batch_id);
  assert.equal(uy.status, 200, JSON.stringify(uy.body));
  assert.deepEqual([uy.body.so_khoi_phuc, uy.body.so_xoa_trang_thai, uy.body.so_hoan_tac], [py.body.so_se_khoi_phuc, py.body.so_se_xoa_trang_thai, py.body.so_nhap]);

  // Y đã hoàn tác: xem trước báo DA_HOAN_TAC kèm giờ, người hoàn tác; số = 0
  const py2 = await pv('ttvh', Y.batch_id);
  assert.equal(py2.status, 200);
  const yh = batchRow(Y.batch_id);
  assert.deepEqual(py2.body, {
    batch_id: Y.batch_id, bcvh: M2, trang_thai: 'da_hoan_tac', so_nhap: 2, so_se_khoi_phuc: 0, so_se_xoa_trang_thai: 0,
    co_the_hoan_tac: false, ly_do_khong_the: 'DA_HOAN_TAC', so_shbg_vuong: 0, dot_vuong_chi_tiet: [],
    hoan_tac_luc: yh.hoan_tac_luc, hoan_tac_luc_bangkok: P.gioBangkok(yh.hoan_tac_luc), hoan_tac_boi: NGUOI('admin', 'PH_ADMIN')
  });
  // 409 «đã hoàn tác»: giữ hoan_tac_luc, thêm giờ Bangkok và người hoàn tác
  const lai = await undo('admin', Y.batch_id);
  assert.equal(lai.status, 409);
  assert.match(lai.body.error, /đã được hoàn tác trước đó/);
  assert.deepEqual([lai.body.hoan_tac_luc, lai.body.hoan_tac_luc_bangkok, lai.body.hoan_tac_boi],
    [yh.hoan_tac_luc, P.gioBangkok(yh.hoan_tac_luc), NGUOI('admin', 'PH_ADMIN')]);

  // Y đã hoàn tác không còn chặn X: xem trước X hoàn tác được, số khớp /undo thật
  const px2 = await pv('admin', X.batch_id);
  assert.deepEqual([px2.body.co_the_hoan_tac, px2.body.ly_do_khong_the, px2.body.so_shbg_vuong, px2.body.dot_vuong_chi_tiet], [true, null, 0, []]);
  const ux = await undo('admin', X.batch_id);
  assert.deepEqual([ux.body.so_khoi_phuc, ux.body.so_xoa_trang_thai], [px2.body.so_se_khoi_phuc, px2.body.so_se_xoa_trang_thai]);

  // Hai đợt cùng vướng một SHBG: dot_vuong_chi_tiet đủ cả hai, tăng dần theo id, nhập bởi người khác nhau
  const P1 = await nhapM2('admin', [[sh(24), 'Phát thành công', null]], 'pv-p1.xlsx');
  const P2 = await nhapM2('gdvhM2', [[sh(24), 'Phát không thành công', null]], 'pv-p2.xlsx');
  const P3 = await nhapM2('ttvh', [[sh(24), 'Phát thành công', null]], 'pv-p3.xlsx');
  const p1 = await pv('admin', P1.batch_id);
  assert.deepEqual([p1.body.ly_do_khong_the, p1.body.so_shbg_vuong, p1.body.dot_vuong_chi_tiet.map((d) => d.id)], ['BI_CHAN', 1, [P2.batch_id, P3.batch_id]]);
  assert.deepEqual(p1.body.dot_vuong_chi_tiet.map((d) => d.nhap_boi.id), [st.ids.gdvhM2, st.ids.ttvh]);
  assert.deepEqual((await undo('admin', P1.batch_id)).body.dot_vuong, [P2.batch_id, P3.batch_id]);
  for (const b of [P3, P2, P1]) assert.equal((await undo('admin', b.batch_id)).status, 200);
});

test('PHAT-2b-1 undo-preview và /undo: quyền và thứ tự kiểm như nhau (404, 403 BCVH, 403 chủ sở hữu); chữ 403 nói «hoàn tác»', async () => {
  sachM2();
  const D = await nhapM2('gdvhM2', [[sh(25), 'Phát thành công', null]], 'q-d.xlsx');
  const pv = (who, id) => call('GET', `/api/phat/batches/${id}/undo-preview`, who);
  const truoc = chupPhat();

  for (const lenh of [pv, undo]) {
    const ten = lenh === pv ? 'undo-preview' : 'undo';
    assert.equal((await lenh(undefined, D.batch_id)).status, 401, `${ten} không đăng nhập`);
    for (const who of ['staff', 'tivi']) assert.equal((await lenh(who, D.batch_id)).status, 403, `${ten} ${who}`);
    for (const bad of ['99999999', 'abc', '1.5', '0', '-1']) assert.equal((await lenh('admin', bad)).status, 404, `${ten} ${bad}`);
    assert.equal((await lenh('gdvhM2', '99999999')).status, 404, `${ten}: 404 trước mọi kiểm quyền`);
    // GDVH của BCVH khác: 403 BCVH (hoàn tác, không phải «nhập kết quả phát»)
    const khac = await lenh('gdvhM', D.batch_id);
    assert.equal(khac.status, 403, ten);
    assert.match(khac.body.error, /hoàn tác/, ten);
    assert.doesNotMatch(khac.body.error, /nhập kết quả phát/, ten);
    // GDVH chưa gán BCVH nào
    const chua = await lenh('gdvhNone', D.batch_id);
    assert.equal(chua.status, 403, ten);
    assert.match(chua.body.error, /chưa được gán BCVH nào nên chưa hoàn tác được/, ten);
    assert.doesNotMatch(chua.body.error, /nhập kết quả phát/, ten);
    // Cùng BCVH nhưng không phải người nhập: 403 chủ sở hữu
    const nguoiKhac = await lenh('gdvhM2b', D.batch_id);
    assert.equal(nguoiKhac.status, 403, ten);
    assert.match(nguoiKhac.body.error, /Chỉ ADMIN, TTVH hoặc chính người nhập/, ten);
  }
  assert.equal(chupPhat(), truoc, 'mọi lệnh bị từ chối không đổi gì');

  // Người nhập đã bị bỏ gán BCVH: cả hai đều 403 (BCVH), kèm chữ «hoàn tác»
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, []);
  for (const lenh of [pv, undo]) {
    const r = await lenh('gdvhM2', D.batch_id);
    assert.equal(r.status, 403);
    assert.match(r.body.error, /hoàn tác/);
  }
  replaceAssignedBcvh(ctx.db, st.ids.gdvhM2, [M2]);

  // Được phép: chính người nhập, ADMIN, TTVH
  for (const who of ['gdvhM2', 'admin', 'ttvh']) assert.equal((await pv(who, D.batch_id)).status, 200, who);
  assert.equal((await call('GET', `/api/phat/batches/${D.batch_id}/undo-preview?x=1`, 'admin')).status, 400, 'tham số lạ');
  assert.equal((await undo('gdvhM2', D.batch_id)).status, 200);
  // Chữ 403 của các điểm cuối khác không đổi
  assert.match((await call('GET', `/api/phat/template?bcvh=${M}&from=2026-10-02&to=2026-10-02`, 'gdvhM2')).body.error, /chỉ được nhập kết quả phát cho BCVH được giao/);
});

test('PHAT-2b-1 lọc lịch sử: tu_ngay / den_ngay theo giờ Bangkok (gồm hai đầu), nguoi_nhap, trang_thai, kết hợp, giá trị sai 400', async () => {
  const X3 = VALID_BCVH_CODES.find((c) => c !== M && c !== M2);
  const them = (userId, nhapLuc, trangThai) => Number(ctx.db.prepare(`INSERT INTO phat_batches (bcvh, user_id, nhap_luc, ten_file, so_nhap, trang_thai) VALUES (?, ?, ?, 'loc.xlsx', 1, ?)`)
    .run(X3, userId, nhapLuc, trangThai).lastInsertRowid);
  const { admin, ttvh } = st.ids;
  const a = them(admin, '2026-09-30T23:30:00Z', 'da_nhap'); // Bangkok 01/10 06:30 (UTC vẫn là 30/09)
  const b = them(ttvh, '2026-10-01T16:59:59Z', 'da_hoan_tac'); // Bangkok 01/10 23:59:59
  const c = them(admin, '2026-10-01T17:00:00Z', 'da_nhap'); // Bangkok 02/10 00:00:00
  const d = them(ttvh, '2026-10-02T16:59:59Z', 'da_nhap'); // Bangkok 02/10 23:59:59
  const e = them(admin, '2026-10-02T17:00:00Z', 'da_hoan_tac'); // Bangkok 03/10 00:00:00
  const ds = (qs, who = 'admin') => call('GET', `/api/phat/batches?bcvh=${X3}${qs}`, who);
  const ids = async (qs, who) => { const r = await ds(qs, who); assert.equal(r.status, 200, `${qs}: ${JSON.stringify(r.body)}`); return r.body.items.map((x) => x.id).sort((x, y) => x - y); };
  const hop = (...x) => x.sort((p, q) => p - q);

  assert.deepEqual(await ids(''), hop(a, b, c, d, e), 'không lọc: đủ');
  // Ngày theo Bangkok: đợt 23:30 UTC (30/09) thuộc 01/10 theo Bangkok
  assert.deepEqual(await ids('&tu_ngay=2026-10-01&den_ngay=2026-10-01'), hop(a, b), 'một ngày: gồm cả đầu 06:30 và cuối 23:59:59');
  assert.deepEqual(await ids('&tu_ngay=2026-09-30&den_ngay=2026-09-30'), [], 'đợt 23:30 UTC 30/09 KHÔNG thuộc ngày 30/09 Bangkok');
  assert.deepEqual(await ids('&tu_ngay=2026-10-02&den_ngay=2026-10-02'), hop(c, d), '00:00:00 Bangkok vào ngày mới; 23:59:59 còn trong ngày');
  assert.deepEqual(await ids('&tu_ngay=2026-10-03'), [e], 'chỉ tu_ngay (mở phía sau)');
  assert.deepEqual(await ids('&den_ngay=2026-10-01'), hop(a, b), 'chỉ den_ngay (mở phía trước), gồm cả ngày cuối');
  assert.deepEqual(await ids('&tu_ngay=2026-10-01&den_ngay=2026-10-03'), hop(a, b, c, d, e));
  assert.deepEqual(await ids('&tu_ngay=2026-10-04'), []);
  // người nhập, trạng thái
  assert.deepEqual(await ids(`&nguoi_nhap=${admin}`), hop(a, c, e));
  assert.deepEqual(await ids(`&nguoi_nhap=${ttvh}`), hop(b, d));
  assert.deepEqual(await ids('&nguoi_nhap=khong-co-nguoi-nay'), [], 'id không có: rỗng, không phải 400');
  assert.deepEqual(await ids('&trang_thai=da_hoan_tac'), hop(b, e));
  assert.deepEqual(await ids('&trang_thai=da_nhap'), hop(a, c, d));
  // kết hợp
  assert.deepEqual(await ids(`&tu_ngay=2026-10-01&den_ngay=2026-10-02&nguoi_nhap=${admin}&trang_thai=da_nhap`), hop(a, c), 'a (01/10 Bangkok) và c (02/10) đều của admin, đã nhập; e đã hoàn tác và sang 03/10');
  assert.deepEqual(await ids(`&tu_ngay=2026-10-02&den_ngay=2026-10-02&nguoi_nhap=${admin}&trang_thai=da_nhap`), [c]);
  assert.deepEqual(await ids(`&tu_ngay=2026-10-02&nguoi_nhap=${ttvh}&trang_thai=da_hoan_tac`), []);
  assert.deepEqual(await ids('&tu_ngay=&den_ngay=&nguoi_nhap=&trang_thai='), hop(a, b, c, d, e), 'giá trị rỗng = không lọc');
  // phân trang theo kết quả lọc; nguoi_nhap_lua_chon KHÔNG theo bộ lọc
  const trang = (await ds('&trang_thai=da_nhap&size=2&page=2')).body;
  assert.deepEqual([trang.pagination.total, trang.pagination.total_pages, trang.items.length], [3, 2, 1]);
  assert.deepEqual((await ds(`&nguoi_nhap=${admin}`)).body.nguoi_nhap_lua_chon.map((x) => x.id).sort(), [admin, ttvh].sort());
  // sắp xếp giữ nguyên: mới nhất trước
  assert.deepEqual((await ds('')).body.items.map((x) => x.id), [e, d, c, b, a]);
  // quyền xem theo BCVH không bị bộ lọc vượt qua
  assert.equal((await ds('&tu_ngay=2026-10-01', 'gdvhM2')).status, 403);
  assert.equal((await ds(`&nguoi_nhap=${admin}`, 'staff')).status, 403);
  assert.equal((await call('GET', `/api/phat/batches?bcvh=${M2}&nguoi_nhap=${admin}&tu_ngay=2026-10-01`, 'gdvhM2')).status, 200);

  // giá trị sai -> 400 tiếng Việt, nêu tên tham số
  const sai = [
    ['&tu_ngay=2026-13-01', /"tu_ngay".*YYYY-MM-DD/], ['&tu_ngay=abc', /"tu_ngay"/], ['&tu_ngay=2026-02-30', /"tu_ngay"/], ['&tu_ngay=2026-10-1', /"tu_ngay"/],
    ['&den_ngay=2026-10-01T00:00:00', /"den_ngay"/], ['&den_ngay=01/10/2026', /"den_ngay"/],
    ['&tu_ngay=2026-10-02&den_ngay=2026-10-01', /"tu_ngay" không được sau "den_ngay"/],
    ['&trang_thai=xyz', /"trang_thai".*da_nhap, da_hoan_tac/], ['&trang_thai=DA_NHAP', /"trang_thai"/],
    ['&nguoi_nhap=a&nguoi_nhap=b', /"nguoi_nhap"/], ['&trang_thai=da_nhap&trang_thai=da_hoan_tac', /"trang_thai"/], ['&tu_ngay=2026-10-01&tu_ngay=2026-10-02', /"tu_ngay"/],
    [`&nguoi_nhap=${'x'.repeat(65)}`, /"nguoi_nhap"/],
    ['&hoi=1', /Tham số không hỗ trợ: "hoi"/], ['&draft_id=1', /Tham số không hỗ trợ: "draft_id"/], ['&size=201', /"size"/], ['&page=0', /"page"/]
  ];
  for (const [qs, re] of sai) {
    const r = await ds(qs);
    assert.equal(r.status, 400, qs);
    assert.match(r.body.error, re, qs);
  }
  // phần tử /batches không có draft_id
  assert.equal('draft_id' in (await ds('')).body.items[0], false);
});
