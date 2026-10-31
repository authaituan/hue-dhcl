// ==========================================
// Test KTT-17-1: nạp danh sách SHBG HÀNG HOÀN (ItemReturn) — bảng ktt_hang_hoan + nhật ký ktt_hang_hoan_nap (server/lib/kttHangHoan.js), CLI
// (scripts/ktt-hang-hoan-import.js), nhận file độc lập trên đường SFTP (server/lib/kttSftp.js), trường do_moi_hang_hoan của API trạng thái.
// Server thật trên DB tạm của harness; máy chủ SFTP GIẢ (không mạng); CSV sinh ngay trong test, SHBG GIẢ (ZZHH-…). Không mở data/, không đọc .env.
// KHÔNG kiểm phân loại hàng hoàn: danh sách này chưa được dùng vào chỉ số nào (KTT-17-2).
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const HH = require('../server/lib/kttHangHoan');
const Ktt = require('../server/lib/kttSftp');
const K = require('../server/lib/kttNapCap');
const SCHEMA = require('../server/lib/kttSchema');

const PORT = 5944;
const DIR = '/CSV_Report_530100';
const CLI = path.join(__dirname, '..', 'scripts', 'ktt-hang-hoan-import.js');
let ctx; let db; let workDir; let n = 0; let seq = 0; let token;
const khoiPhuc = [];

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-ktt-hh-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-hh-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  seedUser(db, { hrmCode: 'KH17_ADMIN', fullName: 'KH17_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  token = (await loginAs(ctx.baseUrl, 'KH17_ADMIN', 'Admin@123')).body.token;
});
after(async () => {
  await Ktt.stopKttScheduler();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
  fs.rmSync(workDir, { recursive: true, force: true });
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_hang_hoan_nap; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap; DELETE FROM ktt_nguon_file; DELETE FROM ktt_nap_lan;');
});

// ---------- dữ liệu giả ----------
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const NGUON = '2026-10-31 18:02:02.123';
const hh = (shbg, nguon = NGUON, extra = {}) => ({ SHBG: shbg, Nguon_xuat_luc: nguon, ...extra });
const ma = (i) => `ZZHH-${String(i).padStart(5, '0')}`;
const tenH = (khoa) => `KTT_HangHoan_${khoa}.csv`;
/** CSV kiểu SSMS: BOM, nháy kép, CRLF (hoặc opts.eol). rows rỗng: file chỉ có BOM (opts.khong: 0 byte; opts.chiTieuDe: chỉ tiêu đề). */
function bufCsv(rows, opts = {}) {
  const eol = opts.eol || '\r\n';
  if (!rows.length) return opts.chiTieuDe ? Buffer.from(`﻿${(opts.cols || ['SHBG', 'Nguon_xuat_luc']).map(q).join(',')}${eol}`) : Buffer.from(opts.khong ? '' : '﻿');
  const cols = opts.cols || Object.keys(rows[0]);
  return Buffer.from((opts.khongBom ? '' : '﻿') + [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join(eol) + eol);
}
function ghi(ten, rows, opts = {}) {
  const dir = opts.dir || path.join(workDir, `h${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, ten);
  fs.writeFileSync(f, opts.buf || bufCsv(rows, opts));
  return f;
}
const dem = (b) => db.prepare(`SELECT COUNT(*) c FROM ${b}`).get().c;
const dsShbg = () => db.prepare('SELECT shbg FROM ktt_hang_hoan ORDER BY shbg').all().map((r) => r.shbg);
const dong = (shbg) => db.prepare('SELECT * FROM ktt_hang_hoan WHERE shbg = ?').get(shbg);
const so = (r) => [r.status, r.dong, r.them, r.capNhat, r.boQua, r.loi, r.trung];
const TEN1 = tenH('20261031_180202');

// ---------- importer ----------
test('schema: ktt_hang_hoan + ktt_hang_hoan_nap có đủ cột; ktt_nap_lan.loai vẫn CHỈ TUI / BUU_GUI (không sửa bảng cũ); ensureKttSchema chạy lại không lỗi', () => {
  const cot = (b) => db.prepare(`PRAGMA table_info(${b})`).all().map((c) => c.name);
  assert.deepEqual(cot('ktt_hang_hoan'), ['id', 'shbg', 'nguon_xuat_luc', 'nap_lan_id', 'cap_nhat_luc']);
  assert.deepEqual(cot('ktt_hang_hoan_nap'), ['id', 'ten_file', 'sha256', 'nap_luc', 'nguon_xuat_luc', 'so_dong_doc', 'so_dong_them', 'so_dong_cap_nhat', 'so_dong_bo_qua', 'so_dong_loi', 'so_dong_trung', 'trang_thai', 'thong_bao', 'loi_mau', 'size_file', 'mtime_file']);
  assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'ktt_nap_lan'").get().sql, /CHECK \(loai IN \('TUI', 'BUU_GUI'\)\)/);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ktt_hang_hoan'").get(), 'có chỉ mục theo shbg (UNIQUE)');
  SCHEMA.ensureKttSchema(db);
  assert.equal(SCHEMA.FILE_HANG_HOAN.bang, 'ktt_hang_hoan');
  assert.ok(!('HANG_HOAN' in SCHEMA.LOAI_FILE), 'không nằm trong LOAI_FILE (không ghép cặp)');
});

test('đủ cột (BOM, nháy kép, CRLF): nạp đúng; cột lạ bị bỏ; nguon_xuat_luc cắt mili giây; nhật ký không có SHBG', () => {
  const f = ghi(TEN1, [hh(ma(1), NGUON, { Cot_la: 'x' }), hh(ma(2), NGUON, { Cot_la: 'y' })]);
  const r = HH.importKttHangHoan(db, f);
  assert.deepEqual(so(r), ['OK', 2, 2, 0, 0, 0, 0]);
  assert.deepEqual(r.cotLa, ['Cot_la']);
  assert.deepEqual(dsShbg(), [ma(1), ma(2)]);
  assert.equal(dong(ma(1)).nguon_xuat_luc, '2026-10-31 18:02:02');
  const nl = db.prepare('SELECT * FROM ktt_hang_hoan_nap').get();
  assert.deepEqual([nl.ten_file, nl.trang_thai, nl.nguon_xuat_luc, nl.so_dong_doc, nl.so_dong_them], [TEN1, 'OK', '2026-10-31 18:02:02', 2, 2]);
  assert.equal(nl.sha256.length, 64);
  assert.ok(!JSON.stringify(nl).includes('ZZHH'));
  assert.deepEqual([dem('ktt_nap_lan'), dem('ktt_nap_cap'), dem('ktt_tui'), dem('ktt_buu_gui')], [0, 0, 0, 0], 'không đụng bảng KTT cũ');
});

test('LF thay CRLF, không BOM, đảo thứ tự cột, tên cột khác hoa/thường: đọc đúng', () => {
  const rows = [{ nguon_xuat_luc: NGUON, shbg: ma(1) }, { nguon_xuat_luc: NGUON, shbg: ma(2) }];
  const r = HH.importKttHangHoan(db, ghi(TEN1, rows, { eol: '\n', khongBom: true }));
  assert.deepEqual(so(r), ['OK', 2, 2, 0, 0, 0, 0]);
});

test('thiếu cột SHBG hoặc Nguon_xuat_luc: TỪ CHỐI cả file (REJECTED), không ghi dòng nào, ghi một dòng nhật ký; sửa file rồi nạp lại được', () => {
  const thieuNguon = ghi(TEN1, [{ SHBG: ma(1) }, { SHBG: ma(2) }]);
  const r = HH.importKttHangHoan(db, thieuNguon);
  assert.equal(r.status, 'REJECTED'); assert.match(r.error, /Nguon_xuat_luc/);
  assert.equal(dem('ktt_hang_hoan'), 0);
  const nl = db.prepare('SELECT * FROM ktt_hang_hoan_nap').all();
  assert.deepEqual(nl.map((x) => x.trang_thai), ['REJECTED']); assert.match(nl[0].thong_bao, /Nguon_xuat_luc/); assert.ok(!nl[0].thong_bao.includes('ZZHH'));
  const thieuShbg = HH.importKttHangHoan(db, ghi(tenH('20261031_180203'), [{ Nguon_xuat_luc: NGUON, Khac: 'x' }]));
  assert.equal(thieuShbg.status, 'REJECTED'); assert.match(thieuShbg.error, /SHBG/);
  const sua = HH.importKttHangHoan(db, ghi(TEN1, [hh(ma(1)), hh(ma(2))]));
  assert.deepEqual(so(sua), ['OK', 2, 2, 0, 0, 0, 0]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ktt_hang_hoan_nap WHERE trang_thai = 'OK'").get().c, 1);
});

test('file rỗng: 0 byte, chỉ BOM, chỉ tiêu đề đều hợp lệ (0 dòng, OK); nguon_xuat_luc của lần nạp lấy từ tên file', () => {
  const a = HH.importKttHangHoan(db, ghi(tenH('20261031_090000'), [], { khong: true }));
  const b = HH.importKttHangHoan(db, ghi(tenH('20261031_100000'), [], {}));
  const c = HH.importKttHangHoan(db, ghi(tenH('20261031_110000'), [], { chiTieuDe: true }));
  for (const r of [a, b, c]) assert.deepEqual([r.status, r.dong, r.them], ['OK', 0, 0]);
  assert.equal(dem('ktt_hang_hoan'), 0);
  assert.deepEqual(db.prepare('SELECT nguon_xuat_luc FROM ktt_hang_hoan_nap ORDER BY id').all().map((x) => x.nguon_xuat_luc), ['2026-10-31 09:00:00', '2026-10-31 10:00:00', '2026-10-31 11:00:00']);
  assert.equal(HH.docDoMoiHangHoan(db).nguon_xuat_luc, '2026-10-31 11:00:00');
});

test('chuẩn hóa SHBG: trim, CHỮ HOA, Ð (U+00D0) -> Đ; trùng trong file (sau chuẩn hóa) đếm riêng, còn một dòng', () => {
  const r = HH.importKttHangHoan(db, ghi(TEN1, [hh('  zzhh-đ01 '), hh('ZZHH-Ð01'), hh('zzhh-abc'), hh('ZZHH-ABC'), hh('ZZHH-ABC')]));
  assert.deepEqual(so(r), ['OK', 5, 2, 0, 0, 0, 3]);
  assert.deepEqual(dsShbg(), ['ZZHH-ABC', 'ZZHH-Đ01']);
});

test('dòng lỗi (SHBG rỗng, giờ sai định dạng, giờ rỗng) bị bỏ và đếm; mã lỗi KHÔNG kèm giá trị; dòng tốt vẫn được nạp', () => {
  const r = HH.importKttHangHoan(db, ghi(TEN1, [hh(ma(1)), hh(''), hh(ma(2), 'giờ-sai-ZZSECRET'), hh(ma(3), ''), hh(ma(4))]));
  assert.deepEqual(so(r), ['OK', 5, 2, 0, 0, 3, 0]);
  assert.deepEqual(dsShbg(), [ma(1), ma(4)]);
  assert.deepEqual(r.loiMau.map((e) => [e.cot, e.ma]), [['SHBG', 'KHOA_RONG'], ['Nguon_xuat_luc', 'GIO_SAI_DINH_DANG'], ['Nguon_xuat_luc', 'NGUON_XUAT_RONG']]);
  const luu = JSON.stringify(db.prepare('SELECT loi_mau FROM ktt_hang_hoan_nap').get());
  assert.ok(!luu.includes('ZZSECRET') && !luu.includes('ZZHH'), 'nhật ký không chứa giá trị');
});

test('nạp lại CÙNG file (sha256): DA_NAP, số dòng và nhật ký không đổi', () => {
  const f = ghi(TEN1, [hh(ma(1)), hh(ma(2))]);
  HH.importKttHangHoan(db, f);
  const truoc = [dem('ktt_hang_hoan'), dem('ktt_hang_hoan_nap'), JSON.stringify(db.prepare('SELECT * FROM ktt_hang_hoan ORDER BY id').all())];
  const r = HH.importKttHangHoan(db, f);
  assert.equal(r.status, 'DA_NAP');
  assert.deepEqual([dem('ktt_hang_hoan'), dem('ktt_hang_hoan_nap'), JSON.stringify(db.prepare('SELECT * FROM ktt_hang_hoan ORDER BY id').all())], truoc);
  // cùng nội dung, tên khác (bản sao): cũng DA_NAP
  assert.equal(HH.importKttHangHoan(db, ghi(tenH('20261031_190000'), null, { buf: fs.readFileSync(f) })).status, 'DA_NAP');
});

test('UPSERT: nguồn MỚI ≥ cũ thì cập nhật; nguồn CŨ HƠN đến muộn KHÔNG ghi đè; thứ tự nạp không làm mất SHBG', () => {
  HH.importKttHangHoan(db, ghi(tenH('20261031_100000'), [hh(ma(1), '2026-10-31 10:00:00'), hh(ma(2), '2026-10-31 10:00:00')]));
  const moi = HH.importKttHangHoan(db, ghi(tenH('20261031_150000'), [hh(ma(1), '2026-10-31 15:00:00'), hh(ma(3), '2026-10-31 15:00:00')]));
  assert.deepEqual(so(moi), ['OK', 2, 1, 1, 0, 0, 0]);
  assert.equal(dong(ma(1)).nguon_xuat_luc, '2026-10-31 15:00:00');
  const cu = HH.importKttHangHoan(db, ghi(tenH('20261031_120000'), [hh(ma(1), '2026-10-31 12:00:00'), hh(ma(4), '2026-10-31 12:00:00')]));
  assert.deepEqual(so(cu), ['OK', 2, 1, 0, 1, 0, 0]);
  assert.equal(dong(ma(1)).nguon_xuat_luc, '2026-10-31 15:00:00', 'không bị ghi đè bởi file cũ hơn');
  assert.deepEqual(dsShbg(), [ma(1), ma(2), ma(3), ma(4)]);
});

test('CỘNG DỒN: SHBG vắng trong file mới KHÔNG bị xóa (kể cả file rỗng); độ mới = nguon_xuat_luc lớn nhất của lần nạp OK', () => {
  HH.importKttHangHoan(db, ghi(tenH('20261031_100000'), [hh(ma(1), '2026-10-31 10:00:00'), hh(ma(2), '2026-10-31 10:00:00')]));
  HH.importKttHangHoan(db, ghi(tenH('20261107_100000'), [hh(ma(9), '2026-11-07 10:00:00')]));
  HH.importKttHangHoan(db, ghi(tenH('20261108_100000'), [], { khong: true }));
  assert.deepEqual(dsShbg(), [ma(1), ma(2), ma(9)]);
  assert.equal(HH.docDoMoiHangHoan(db).nguon_xuat_luc, '2026-11-08 10:00:00');
});

test('--dry-run (opts.dryRun): cùng số liệu như chạy thật nhưng KHÔNG ghi gì (cả nhật ký); tên sai mẫu: SAI_TEN, không đọc file', () => {
  const f = ghi(TEN1, [hh(ma(1)), hh(ma(2)), hh(ma(2))]);
  const thu = HH.importKttHangHoan(db, f, { dryRun: true });
  assert.equal(thu.dryRun, true); assert.deepEqual(so(thu), ['OK', 3, 2, 0, 0, 0, 1]);
  assert.deepEqual([dem('ktt_hang_hoan'), dem('ktt_hang_hoan_nap')], [0, 0]);
  assert.deepEqual(so(HH.importKttHangHoan(db, f)), ['OK', 3, 2, 0, 0, 0, 1]);
  const sai = HH.importKttHangHoan(db, ghi('HangHoan_ban_nhap.csv', [hh(ma(5))]));
  assert.equal(sai.status, 'SAI_TEN'); assert.equal(HH.phanTichTenHangHoan('KTT_HangHoan_20261331_000000.csv'), null);
  assert.equal(dem('ktt_hang_hoan'), 2);
  const dir = path.join(workDir, `d${++n}`);
  ghi(tenH('20261031_100000'), [hh(ma(7))], { dir }); ghi(tenH('20261031_150000'), [hh(ma(8))], { dir }); ghi('KTT_Tui_20261031_150000.csv', [hh(ma(9))], { dir });
  const rs = HH.importHangHoanDuongDan(db, dir);
  assert.deepEqual(rs.map((r) => r.fileName), [tenH('20261031_100000'), tenH('20261031_150000')], 'thư mục: chỉ KTT_HangHoan_*.csv, theo thứ tự tên');
});

// ---------- CLI ----------
const chayCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, KTT_DB: '' } });

test('CLI: --dry-run không ghi gì (kể cả DB chưa có bảng); chạy thật nạp đúng; chạy lại không đổi; không in SHBG; mã thoát 0 / 2 / 1', () => {
  const dbFile = path.join(workDir, `cli-${++n}.db`);
  new Database(dbFile).close(); // DB trống, chưa có bảng KTT
  const dir = path.join(workDir, `cli${++n}`);
  ghi(TEN1, [hh(ma(1)), hh(ma(2)), hh(ma(2))], { dir });
  let r = chayCli([dir, '--dry-run', '--db', dbFile]);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /CHẠY THỬ/); assert.match(r.stdout, /2 SHBG thêm/);
  const kiem = (fn) => { const d = new Database(dbFile, { readonly: true }); try { return fn(d); } finally { d.close(); } };
  assert.equal(kiem((d) => d.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name LIKE 'ktt_%'").get().c), 0, 'dry-run không dựng cả schema');
  r = chayCli([dir, '--db', dbFile]);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Số SHBG hàng hoàn trong DB: 2\./);
  assert.ok(!/ZZHH/.test(r.stdout + r.stderr), 'không in SHBG');
  assert.equal(kiem((d) => d.prepare('SELECT COUNT(*) c FROM ktt_hang_hoan').get().c), 2);
  r = chayCli([dir, '--db', dbFile]);
  assert.equal(r.status, 0); assert.match(r.stdout, /DA_NAP/); assert.equal(kiem((d) => d.prepare('SELECT COUNT(*) c FROM ktt_hang_hoan').get().c), 2);
  const hong = ghi(tenH('20261031_190000'), [{ SHBG: ma(1) }]);
  assert.equal(chayCli([hong, '--db', dbFile]).status, 2, 'file bị từ chối');
  assert.equal(chayCli(['--db', dbFile]).status, 1, 'thiếu đường dẫn');
  assert.equal(chayCli([path.join(workDir, 'khong-co'), '--db', dbFile]).status, 1);
});

// ---------- SFTP giả ----------
function nguonGia(files) {
  const calls = { get: [] };
  return {
    calls, files,
    async list() { return Object.entries(files).map(([name, x]) => ({ type: '-', name, size: x.buf.length, modifyTime: x.mtime })); },
    async get(xa, cucBo) { const ten = xa.slice(xa.lastIndexOf('/') + 1); calls.get.push(ten); fs.writeFileSync(cucBo, files[ten].buf); },
    async end() {}
  };
}
const T0 = Date.UTC(2026, 9, 31, 11, 10, 0); // 18:10 VN
const MIN = 60000;
const quet = (client, ms) => Ktt.quetMotLan({ client, db, thuMuc: DIR, now: () => new Date(ms), sleep: async () => {}, tmpDir: workDir, onDinhGiay: 60 });
const tmpSach = () => fs.readdirSync(workDir).filter((x) => x.startsWith('hue-dhcl-ktt-')).length === 0;
function tui(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261031', Tui_MailTripNumber: '3', Tui_PostBagIndex: String(++seq),
    So_hieu_BD8: `KTT-DEMO-${seq}`, Chieu: 'DEN', Dich_nhom: 'BCVH_HUE', Luong: 'KHAI_THAC_DEN', Gio_quet_tui_den: '2026-10-31 07:00:00.000', BD10_den_XND: '2026-10-31 07:10:00.000', Nguon_xuat_luc: '2026-10-31 09:00:00.000', ...o
  };
}
function bg(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261031', Tui_MailTripNumber: '3', Tui_PostBagIndex: '1',
    SHBG: `KTT-DEMO-${String(++seq).padStart(5, '0')}`, Khoi_luong_thuc_te: '250', Nguon_xuat_luc: '2026-10-31 09:00:00.000', ...o
  };
}

test('SFTP: file hàng hoàn ĐẾN MỘT MÌNH là file độc lập: chờ ổn định 2 lượt rồi nạp; không CHO_CAP, không THIEU_FILE (kể cả sau nhiều giờ), không bị tính là file lạ; lượt sau không tải lại', async () => {
  const files = { [TEN1]: { buf: bufCsv([hh(ma(1)), hh(ma(2))]), mtime: 10 } };
  const c = nguonGia(files);
  let r = await quet(c, T0);
  assert.equal(r.hangHoan.chuaOnDinh, 1); assert.equal(c.calls.get.length, 0); assert.equal(dem('ktt_hang_hoan'), 0);
  assert.equal(r.dem.fileLa, 0, 'không còn là file lạ'); assert.equal(r.dem.capChoCap, 0);
  r = await quet(c, T0 + 2 * MIN);
  assert.equal(r.hangHoan.nap, 1); assert.deepEqual(c.calls.get, [TEN1]);
  assert.deepEqual(dsShbg(), [ma(1), ma(2)]);
  const nl = db.prepare('SELECT * FROM ktt_hang_hoan_nap').get();
  assert.deepEqual([nl.trang_thai, nl.size_file, nl.mtime_file], ['OK', files[TEN1].buf.length, 10]);
  assert.equal(dem('ktt_nap_cap'), 0, 'không tạo trạng thái cặp');
  r = await quet(c, T0 + 4 * MIN);
  assert.equal(r.hangHoan.daCo, 1); assert.equal(c.calls.get.length, 1, 'không tải lại file đã OK cùng kích thước + mtime');
  const muon = new Date(T0 + 6 * 3600000);
  assert.ok(!K.canhBao(db, muon).some((x) => x.ma === 'THIEU_FILE'), 'không THIEU_FILE');
  assert.ok(tmpSach());
});

test('SFTP: cặp Tui/BuuGui đủ vẫn OK như cũ khi có thêm file hàng hoàn; hai bên không ảnh hưởng nhau', async () => {
  const k = '20261031_090000';
  const t = tui(); const b = bg({ Tui_PostBagIndex: t.Tui_PostBagIndex });
  const files = {
    [`KTT_Tui_${k}.csv`]: { buf: bufCsv([t]), mtime: 1 }, [`KTT_BuuGui_${k}.csv`]: { buf: bufCsv([b]), mtime: 2 }, [TEN1]: { buf: bufCsv([hh(ma(1))]), mtime: 3 }
  };
  const c = nguonGia(files);
  await quet(c, T0);
  const r = await quet(c, T0 + 2 * MIN);
  assert.equal(r.dem.capNap, 1); assert.equal(r.dem.capChoCap, 0); assert.equal(r.hangHoan.nap, 1);
  assert.equal(db.prepare("SELECT ket_qua FROM ktt_nap_cap WHERE khoa_cap = ?").get(k).ket_qua, 'OK');
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan'), dem('ktt_hang_hoan')], [1, 1, 2, 1]);
  assert.equal(dem('ktt_nap_cap'), 1);
  assert.equal(K.docDoMoi(db).nguon_xuat_luc, '2026-10-31 09:00:00', 'độ mới KTT chỉ theo cặp, không theo file hàng hoàn');
  // chỉ có MỘT file của cặp + file hàng hoàn: vẫn CHO_CAP đúng cho cặp, file hàng hoàn vẫn nạp
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_hang_hoan_nap; DELETE FROM ktt_nap_cap; DELETE FROM ktt_nguon_file;');
  const k2 = '20261031_150000';
  const c2 = nguonGia({ [`KTT_Tui_${k2}.csv`]: { buf: bufCsv([tui()]), mtime: 1 }, [TEN1]: { buf: bufCsv([hh(ma(1))]), mtime: 3 } });
  await quet(c2, T0); const r2 = await quet(c2, T0 + 2 * MIN);
  assert.equal(r2.dem.capChoCap, 1); assert.equal(r2.hangHoan.nap, 1);
  assert.equal(db.prepare('SELECT ket_qua FROM ktt_nap_cap WHERE khoa_cap = ?').get(k2).ket_qua, 'CHO_CAP');
});

test('SFTP: file hàng hoàn đổi nội dung (cùng tên, mtime mới) được tải lại và CỘNG DỒN; file hỏng bị TỪ CHỐI một lần và không tải lại', async () => {
  const files = { [TEN1]: { buf: bufCsv([hh(ma(1), '2026-10-31 18:00:00')]), mtime: 10 } };
  const c = nguonGia(files);
  await quet(c, T0); await quet(c, T0 + 2 * MIN);
  files[TEN1] = { buf: bufCsv([hh(ma(2), '2026-10-31 19:00:00')]), mtime: 20 };
  await quet(c, T0 + 4 * MIN); let r = await quet(c, T0 + 6 * MIN);
  assert.equal(r.hangHoan.nap, 1); assert.equal(c.calls.get.length, 2);
  assert.deepEqual(dsShbg(), [ma(1), ma(2)], 'cộng dồn, không xóa SHBG cũ');
  const hong = tenH('20261101_180000');
  files[hong] = { buf: bufCsv([{ SHBG: ma(3) }]), mtime: 30 };
  await quet(c, T0 + 8 * MIN); r = await quet(c, T0 + 10 * MIN);
  assert.equal(r.hangHoan.tuChoi, 1); assert.equal(dem('ktt_hang_hoan'), 2);
  const soGet = c.calls.get.length;
  r = await quet(c, T0 + 12 * MIN);
  assert.equal(r.hangHoan.daCo, 2, 'file đã TỪ CHỐI cùng kích thước + mtime không tải lại'); assert.equal(c.calls.get.length, soGet);
  assert.ok(tmpSach());
});

test('SFTP: tên sai mẫu (ngày không có thật / thiếu giờ) vẫn là file lạ, không nạp', async () => {
  const files = { 'KTT_HangHoan_20261331_180202.csv': { buf: bufCsv([hh(ma(1))]), mtime: 1 }, 'KTT_HangHoan_20261031.csv': { buf: bufCsv([hh(ma(1))]), mtime: 2 } };
  const c = nguonGia(files);
  await quet(c, T0); const r = await quet(c, T0 + 2 * MIN);
  assert.equal(r.dem.fileLa, 2); assert.equal(r.hangHoan.tong, 0); assert.equal(c.calls.get.length, 0); assert.equal(dem('ktt_hang_hoan'), 0);
});

// ---------- API ----------
test('GET /api/nap-nguon/ktt/trang-thai: do_moi_hang_hoan null khi chưa nạp, có { nguon_xuat_luc, nap_luc } sau khi nạp; vẫn chỉ ADMIN; không sinh cảnh báo mới', async () => {
  const goi = async (who) => { const res = await fetch(`${ctx.baseUrl}/api/nap-nguon/ktt/trang-thai`, { headers: who ? { Authorization: `Bearer ${token}` } : {} }); return { status: res.status, body: res.status === 200 ? await res.json() : null }; };
  assert.equal((await goi(false)).status, 401);
  let r = await goi(true);
  assert.equal(r.status, 200); assert.equal(r.body.do_moi_hang_hoan, null);
  const canhBaoTruoc = JSON.stringify(r.body.canh_bao);
  HH.importKttHangHoan(db, ghi(TEN1, [hh(ma(1)), hh(ma(2))]));
  r = await goi(true);
  assert.deepEqual(Object.keys(r.body.do_moi_hang_hoan), ['nguon_xuat_luc', 'nap_luc']);
  assert.equal(r.body.do_moi_hang_hoan.nguon_xuat_luc, '2026-10-31 18:02:02');
  assert.equal(JSON.stringify(r.body.canh_bao), canhBaoTruoc, 'không thêm cảnh báo');
  assert.ok(!JSON.stringify(r.body).includes('ZZHH') && !/sha/i.test(JSON.stringify(r.body)));
});
