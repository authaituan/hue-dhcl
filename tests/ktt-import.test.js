// ==========================================
// Test KTT-2: lớp dữ liệu «Hàng tại KTT» — schema (server/lib/kttSchema.js), importer (server/lib/kttImport.js), CLI (scripts/ktt-import.js).
// Server thật trên DB tạm của harness (kiểm cả dòng gọi ensureKttSchema trong server/db.js); CSV sinh ngay trong test, dữ liệu GIẢ
// (mã bưu cục 599xxx, SHBG ZZKTT…, tên giả). Không mở data/, không đọc .env, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const SCHEMA = require('../server/lib/kttSchema');
const K = require('../server/lib/kttImport');

const PORT = 5995;
const CLI = path.join(__dirname, '..', 'scripts', 'ktt-import.js');
const BANG_KTT = ['ktt_nap_lan', 'ktt_tui', 'ktt_buu_gui', 'ktt_cau_hinh_chuyen', 'ktt_cau_hinh'];
let ctx;
let db;
let workDir;
let n = 0;

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-ktt-test-'));
});
after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
  fs.rmSync(workDir, { recursive: true, force: true });
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_lan;');
});

// ---------- khung dựng dữ liệu giả ----------
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
let seq = 0;

/** Một dòng túi giả theo TÊN cột CSV. o ghi đè / thêm cột (kể cả cột lạ). */
function tui(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020',
    Tui_MailTripNumber: '3', Tui_PostBagIndex: String(++seq), So_hieu_BD8: `ZZBD8${seq}`, Ma_loai_tui: 'T1', Chieu: 'DEN', Dich_nhom: 'BCVH_HUE',
    Luong: 'KHAI_THAC_DEN', Co_mo_tui: '1', Co_dong_tui: '0', So_luong_tui: '1', So_dong_dispatch: '1', Khoi_luong_tui: '12.5', Khoi_luong_quy_doi_tui: '1',
    Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', BD10_den_so_hieu: `ZZBD10D${seq}`, BD10_den_XND: '2026-10-20 07:10:05.123', Gio_quet_tui_den: '2026-10-20 07:00:00.000',
    So_lan_quet_den: '1', So_bd10_den: '1', Gio_quet_tui_di: '', BD10_di_so_hieu: '', BD10_di_gio_di: '', Nguon_xuat_luc: '2026-10-20 23:00:00.000', ...o
  };
}
/** Một dòng bưu gửi giả. */
function bg(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020', Tui_MailTripNumber: '3', Tui_PostBagIndex: '1',
    SHBG: `ZZKTT${String(++seq).padStart(7, '0')}VN`, Khoi_luong_thuc_te: '250', Khoi_luong_quy_doi: '1', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả',
    Ma_Xa_Phuong: '99001', Ten_Xa_Phuong: 'Phường Giả', Ma_Tinh_Thanh: '99', Ten_Tinh_Thanh: 'Tỉnh Giả', TI_den_theo_tui_luc: '2026-10-20 07:30:00.000',
    TI_xac_nhan_den_luc: '', TI_dong_chuyen_thu_di_luc: '', Nguon_xuat_luc: '2026-10-20 23:00:00.000', ...o
  };
}
/** Ghi CSV: tiêu đề = khóa của dòng đầu (hoặc opts.cols). Trả đường dẫn. */
function ghi(ten, rows, opts = {}) {
  const cols = opts.cols || Object.keys(rows[0]);
  const f = path.join(workDir, `d${++n}`, ten);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '﻿' + [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n');
  return f;
}
const TEN_TUI = (hms = '230000', ymd = '20261020') => `KTT_Tui_${ymd}_${hms}.csv`;
const TEN_BG = (hms = '230000', ymd = '20261020') => `KTT_BuuGui_${ymd}_${hms}.csv`;
const dem = (bang) => db.prepare(`SELECT COUNT(*) c FROM ${bang}`).get().c;
const motTui = (post) => db.prepare('SELECT * FROM ktt_tui WHERE post_bag_index = ?').get(String(post));
/** Ảnh chụp dữ liệu (bỏ các cột phụ thuộc lần nạp) để so sánh kết quả hai thứ tự nạp. */
const anh = (bang) => db.prepare(`SELECT * FROM ${bang} ORDER BY id`).all().map(({ id, nap_lan_id, cap_nhat_luc, ...r }) => r);

// ---------- cấu hình mặc định + schema ----------
test('bảng cấu hình: đúng 12 mốc chuyến và 4 khóa ngưỡng mặc định V1; chạy lại không nhân dòng', () => {
  const chuyen = db.prepare('SELECT ma_bcvh, ten_chuyen, gio_moc, gio_chot_truoc_phut, ghi_chu FROM ktt_cau_hinh_chuyen ORDER BY ma_bcvh, ten_chuyen').all();
  assert.equal(chuyen.length, 12);
  const dang = (ma) => chuyen.filter((c) => c.ma_bcvh === ma).map((c) => `${c.ten_chuyen} ${c.gio_moc}`).sort();
  assert.deepEqual(dang('533140'), ['SANG 07:30', 'TOI 22:30', 'TRUA 14:00']);
  assert.deepEqual(dang('535470'), ['SANG 07:00', 'TRUA 12:30']);
  assert.deepEqual(dang('535790'), ['SANG 08:30']);
  assert.deepEqual(dang('536250'), ['SANG 09:30', 'TRUA 13:00']);
  assert.deepEqual(dang('537015'), ['SANG 08:00', 'TRUA 13:30']);
  assert.deepEqual(dang('537220'), ['SANG 08:00', 'TRUA 13:30']);
  assert.ok(chuyen.every((c) => c.gio_chot_truoc_phut === 30 && c.ghi_chu === 'V1 ước lượng từ giờ đi thực tế, chờ PO cung cấp giờ chính xác'));
  const nguong = Object.fromEntries(db.prepare('SELECT khoa, gia_tri FROM ktt_cau_hinh').all().map((r) => [r.khoa, r.gia_tri]));
  assert.deepEqual(nguong, { treo_phut: 180, nam_lau_toi_da_phut: 1440, chi_tieu_f13_gio: 14, chi_tieu_f13_gio_thuan_hoa_phu_xuan: 12 });

  SCHEMA.ensureKttSchema(db);
  SCHEMA.ensureKttSchema(db);
  assert.equal(dem('ktt_cau_hinh_chuyen'), 12);
  assert.equal(dem('ktt_cau_hinh'), 4);
});

test('bảng cấu hình: giá trị PO đã sửa tay KHÔNG bị ghi đè khi chạy lại ensureKttSchema', () => {
  db.prepare("UPDATE ktt_cau_hinh_chuyen SET gio_moc = '07:45', gio_chot_truoc_phut = 45, ghi_chu = 'PO đã chỉnh' WHERE ma_bcvh = '533140' AND ten_chuyen = 'SANG'").run();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 200 WHERE khoa = 'treo_phut'").run();
  try {
    SCHEMA.ensureKttSchema(db);
    const c = db.prepare("SELECT gio_moc, gio_chot_truoc_phut, ghi_chu FROM ktt_cau_hinh_chuyen WHERE ma_bcvh = '533140' AND ten_chuyen = 'SANG'").get();
    assert.deepEqual({ ...c }, { gio_moc: '07:45', gio_chot_truoc_phut: 45, ghi_chu: 'PO đã chỉnh' });
    assert.equal(db.prepare("SELECT gia_tri FROM ktt_cau_hinh WHERE khoa = 'treo_phut'").get().gia_tri, 200);
    assert.equal(dem('ktt_cau_hinh_chuyen'), 12);
  } finally {
    db.prepare("UPDATE ktt_cau_hinh_chuyen SET gio_moc = '07:30', gio_chot_truoc_phut = 30, ghi_chu = ? WHERE ma_bcvh = '533140' AND ten_chuyen = 'SANG'").run(SCHEMA.GHI_CHU_CHUYEN_V1);
    db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 180 WHERE khoa = 'treo_phut'").run();
  }
});

test('schema: server/db.js đã tạo đủ năm bảng + chỉ mục; tạo hai lần không lỗi, không đổi bảng của module khác', () => {
  const co = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  for (const b of BANG_KTT) assert.ok(co.has(b), `thiếu bảng ${b}`);
  const chiMuc = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name));
  for (const i of ['ix_ktt_tui_gio_quet_den', 'ix_ktt_tui_gio_di', 'ix_ktt_tui_chieu_luong', 'ix_ktt_tui_dich_nhom', 'ix_ktt_buu_gui_shbg', 'ix_ktt_buu_gui_tui']) assert.ok(chiMuc.has(i), `thiếu chỉ mục ${i}`);

  const khac = () => db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'ktt\\_%' ESCAPE '\\' AND name NOT LIKE 'ix\\_ktt\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all();
  const truocKhac = JSON.stringify(khac());
  const truocArrival = JSON.stringify(db.prepare('PRAGMA table_info(arrival_items)').all());
  assert.ok(JSON.parse(truocArrival).length > 10);
  assert.doesNotThrow(() => { SCHEMA.ensureKttSchema(db); SCHEMA.ensureKttSchema(db); });
  assert.equal(JSON.stringify(db.prepare('PRAGMA table_info(arrival_items)').all()), truocArrival);
  assert.equal(JSON.stringify(khac()), truocKhac);
});

test('schema: cột DB khớp đúng bảng ánh xạ CSV -> DB; 7 cột khóa là TEXT NOT NULL; UNIQUE đúng khóa; không FOREIGN KEY sang ktt_tui', () => {
  const he = ['nap_lan_id', 'cap_nhat_luc'];
  for (const [bang, cot, khoa] of [['ktt_tui', SCHEMA.COT_TUI, 7], ['ktt_buu_gui', SCHEMA.COT_BUU_GUI, 8]]) {
    const info = db.prepare(`PRAGMA table_info(${bang})`).all();
    assert.deepEqual(info.map((c) => c.name).sort(), ['id', ...cot.map((c) => c.db), ...he].sort());
    const keys = cot.filter((c) => c.key);
    assert.equal(keys.length, khoa);
    for (const c of keys) {
      const i = info.find((x) => x.name === c.db);
      assert.equal(i.type, 'TEXT', `${bang}.${c.db}`);
      assert.equal(i.notnull, 1);
    }
    const uniq = db.prepare(`PRAGMA index_list(${bang})`).all().filter((x) => x.unique && x.origin === 'u');
    assert.equal(uniq.length, 1);
    assert.deepEqual(db.prepare(`PRAGMA index_info(${uniq[0].name})`).all().map((x) => x.name), keys.map((c) => c.db));
    assert.equal(db.prepare(`PRAGMA foreign_key_list(${bang})`).all().filter((f) => f.table !== 'ktt_nap_lan').length, 0);
  }
  const nl = db.prepare('PRAGMA index_list(ktt_nap_lan)').all().filter((x) => x.unique && x.origin === 'u');
  assert.deepEqual(db.prepare(`PRAGMA index_info(${nl[0].name})`).all().map((x) => x.name), ['loai', 'sha256']);
  const tuiTypes = Object.fromEntries(db.prepare('PRAGMA table_info(ktt_tui)').all().map((c) => [c.name, c.type]));
  for (const c of ['co_mo_tui', 'co_dong_tui', 'so_luong_tui', 'so_dong_dispatch']) assert.equal(tuiTypes[c], 'INTEGER');
  for (const c of ['khoi_luong_tui_kg', 'khoi_luong_quy_doi_tui']) assert.equal(tuiTypes[c], 'REAL');
});

test('schema: không bảng KTT nào có cột cấm (lái xe, biển số, người thao tác, mật khẩu, DestinationPOSCode, status, transfer)', () => {
  const CAM = /lai_?xe|driver|bien_?so|plate|nguoi|operator|user|pass|destination|status|transfer|trang_thai_bd10/i;
  for (const b of ['ktt_tui', 'ktt_buu_gui', 'ktt_cau_hinh_chuyen', 'ktt_cau_hinh']) {
    for (const c of db.prepare(`PRAGMA table_info(${b})`).all()) assert.ok(!CAM.test(c.name), `${b}.${c.name}`);
  }
  for (const c of [...SCHEMA.COT_TUI, ...SCHEMA.COT_BUU_GUI]) assert.ok(!CAM.test(c.csv) && !CAM.test(c.db), c.csv);
  // ktt_nap_lan có cột trang_thai của LẦN NẠP (OK / REJECTED), không phải status của BD10 — chỉ kiểm không có tên cột nào khác bị cấm
  for (const c of db.prepare('PRAGMA table_info(ktt_nap_lan)').all()) assert.ok(!CAM.test(c.name.replace('trang_thai', 'x')), c.name);
});

// ---------- nạp ----------
test('nạp mới; nạp lại cùng file -> bỏ qua; file khác tên nhưng cùng nội dung -> bỏ qua', () => {
  const rows = [tui(), tui(), tui()];
  const f = ghi(TEN_TUI(), rows);
  const r1 = K.importKttTui(db, f);
  assert.equal(r1.status, 'OK');
  assert.deepEqual([r1.dong, r1.them, r1.capNhat, r1.boQua, r1.loi], [3, 3, 0, 0, 0]);
  assert.equal(dem('ktt_tui'), 3);
  const nl = db.prepare('SELECT * FROM ktt_nap_lan').all();
  assert.equal(nl.length, 1);
  assert.equal(nl[0].loai, 'TUI');
  assert.equal(nl[0].ten_file, TEN_TUI());
  assert.match(nl[0].sha256, /^[0-9a-f]{64}$/);
  assert.match(nl[0].nap_luc, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.deepEqual([nl[0].so_dong_doc, nl[0].so_dong_them, nl[0].so_dong_cap_nhat, nl[0].so_dong_bo_qua, nl[0].so_dong_loi, nl[0].trang_thai], [3, 3, 0, 0, 0, 'OK']);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_tui WHERE nap_lan_id = ?').get(nl[0].id).c, 3);

  const r2 = K.importKttTui(db, f);
  assert.equal(r2.status, 'DA_NAP');
  assert.equal(r2.them, 0);

  const f2 = ghi(TEN_TUI('235959'), rows); // cùng nội dung (cùng chuỗi byte), khác tên
  assert.equal(fs.readFileSync(f2, 'utf8'), fs.readFileSync(f, 'utf8'));
  assert.equal(K.importKttTui(db, f2).status, 'DA_NAP');
  assert.equal(dem('ktt_tui'), 3);
  assert.equal(dem('ktt_nap_lan'), 1);
});

test('hai loại file độc lập: cùng nội dung sha256 ở loại khác không bị coi là đã nạp; tên sai mẫu bị từ chối', () => {
  const f = ghi(TEN_BG(), [bg()]);
  assert.equal(K.importKttBuuGui(db, f).status, 'OK');
  assert.equal(dem('ktt_buu_gui'), 1);
  const sai = K.importKttTui(db, ghi('KTT_Tui_2026-10-20.csv', [tui()]));
  assert.equal(sai.status, 'SAI_TEN');
  assert.match(sai.error, /KTT_Tui_<yyyymmdd>_<hhmmss>\.csv/);
  assert.equal(K.importKttBuuGui(db, ghi(TEN_TUI('010101'), [bg()])).status, 'SAI_TEN');
  assert.equal(dem('ktt_tui'), 0);
});

test('UPSERT: BD10 đi xuất hiện ở lần xuất sau thì cập nhật dòng túi; file xuất CŨ HƠN không ghi đè dòng mới; thứ tự nạp không đổi kết quả', () => {
  const khoa = { Tui_PostBagIndex: '77' };
  const cu = (extra = {}) => tui({ ...khoa, So_hieu_BD8: 'ZZBD8-CU', Nguon_xuat_luc: '2026-10-20 10:00:00.000', ...extra });
  const moi = (extra = {}) => tui({ ...khoa, So_hieu_BD8: 'ZZBD8-MOI', BD10_di_so_hieu: 'ZZBD10DI1', BD10_di_gio_di: '2026-10-20 12:00:00.000', Gio_quet_tui_di: '2026-10-20 11:45:00.000', Nguon_xuat_luc: '2026-10-20 13:00:00.000', ...extra });
  const rieng = (i) => tui({ Tui_PostBagIndex: String(900 + i), Nguon_xuat_luc: '2026-10-20 10:00:00.000' });
  const fCu = ghi(TEN_TUI('100000'), [cu(), rieng(1)]);
  const fMoi = ghi(TEN_TUI('130000'), [moi(), rieng(2)]);

  const a1 = K.importKttTui(db, fCu);
  assert.deepEqual([a1.them, a1.capNhat, a1.boQua], [2, 0, 0]);
  assert.equal(motTui(77).bd10_di_so_hieu, null);
  const a2 = K.importKttTui(db, fMoi);
  assert.deepEqual([a2.them, a2.capNhat, a2.boQua], [1, 1, 0]);
  const t = motTui(77);
  assert.equal(t.so_hieu_bd8, 'ZZBD8-MOI');
  assert.equal(t.bd10_di_so_hieu, 'ZZBD10DI1');
  assert.equal(t.bd10_di_gio_di, '2026-10-20 12:00:00');
  assert.equal(t.nguon_xuat_luc, '2026-10-20 13:00:00');
  const thuTuXuoi = anh('ktt_tui');
  assert.equal(dem('ktt_tui'), 3);

  // thứ tự ngược: nạp file mới trước, rồi file cũ -> dòng của file cũ bị bỏ qua, kết quả như nhau
  db.exec('DELETE FROM ktt_tui; DELETE FROM ktt_nap_lan;');
  K.importKttTui(db, fMoi);
  const b2 = K.importKttTui(db, fCu);
  assert.deepEqual([b2.them, b2.capNhat, b2.boQua], [1, 0, 1]);
  assert.equal(motTui(77).bd10_di_so_hieu, 'ZZBD10DI1');
  const sx = (a) => [...a].sort((x, y) => x.post_bag_index.localeCompare(y.post_bag_index));
  assert.deepEqual(sx(anh('ktt_tui')), sx(thuTuXuoi));
});

test('UPSERT bưu gửi: khóa (túi + SHBG); nguồn bằng nhau thì dòng mới thay thế', () => {
  const x = bg({ SHBG: 'ZZKTT-A1VN', TI_xac_nhan_den_luc: '', Nguon_xuat_luc: '2026-10-20 10:00:00.000' });
  K.importKttBuuGui(db, ghi(TEN_BG('100000'), [x]));
  const y = { ...x, TI_xac_nhan_den_luc: '2026-10-20 09:00:00.000', Nguon_xuat_luc: '2026-10-20 10:00:00.000' };
  const r = K.importKttBuuGui(db, ghi(TEN_BG('100001'), [y]));
  assert.deepEqual([r.them, r.capNhat, r.boQua], [0, 1, 0]);
  assert.equal(db.prepare('SELECT ti_xac_nhan_den_luc v FROM ktt_buu_gui').get().v, '2026-10-20 09:00:00');
  const cu = { ...x, TI_xac_nhan_den_luc: '2026-10-19 09:00:00.000', Nguon_xuat_luc: '2026-10-19 10:00:00.000' };
  const r2 = K.importKttBuuGui(db, ghi(TEN_BG('100002'), [cu]));
  assert.deepEqual([r2.them, r2.capNhat, r2.boQua], [0, 0, 1]);
  assert.equal(db.prepare('SELECT ti_xac_nhan_den_luc v FROM ktt_buu_gui').get().v, '2026-10-20 09:00:00');
  assert.equal(dem('ktt_buu_gui'), 1);
});

test('cột lạ bị bỏ (kể cả BD10_di_status, BD10_di_TransferDate); không lưu giá trị của chúng', () => {
  const r = tui({ Tui_PostBagIndex: '5', BD10_di_status: 'DA_DI_GIA', BD10_di_TransferDate: '2026-10-20 05:05:05.000', Tui_DestinationPOSCode: '599777', Ten_lai_xe: 'Lái Xe Giả', Bien_so: '99A-00000' });
  const res = K.importKttTui(db, ghi(TEN_TUI(), [r]));
  assert.equal(res.status, 'OK');
  assert.deepEqual([...res.cotLa].sort(), ['BD10_di_TransferDate', 'BD10_di_status', 'Bien_so', 'Ten_lai_xe', 'Tui_DestinationPOSCode']);
  const hang = JSON.stringify(motTui(5));
  for (const giaTri of ['DA_DI_GIA', '05:05:05', '599777', 'Lái Xe Giả', '99A-00000']) assert.ok(!hang.includes(giaTri), giaTri);
});

test('thiếu cột khóa hoặc Nguon_xuat_luc -> từ chối cả file, không ghi dòng nào, có lỗi rõ ràng', () => {
  const day = tui();
  const { Tui_Year, ...thieuKhoa } = day;
  const r = K.importKttTui(db, ghi(TEN_TUI('010000'), [thieuKhoa]));
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /thiếu cột bắt buộc: Tui_Year/);
  const { Nguon_xuat_luc, ...thieuNguon } = tui();
  const r2 = K.importKttTui(db, ghi(TEN_TUI('020000'), [thieuNguon]));
  assert.equal(r2.status, 'REJECTED');
  assert.match(r2.error, /Nguon_xuat_luc/);
  const { SHBG, ...thieuShbg } = bg();
  assert.match(K.importKttBuuGui(db, ghi(TEN_BG('030000'), [thieuShbg])).error, /SHBG/);
  assert.equal(dem('ktt_tui') + dem('ktt_buu_gui'), 0);
  const nl = db.prepare("SELECT trang_thai FROM ktt_nap_lan ORDER BY id").all().map((x) => x.trang_thai);
  assert.deepEqual(nl, ['REJECTED', 'REJECTED', 'REJECTED']);
  // file thiếu cột được sửa (nội dung khác) vẫn nạp được; và REJECTED không chặn nạp lại cùng tên
  assert.equal(K.importKttTui(db, ghi(TEN_TUI('010000'), [day])).status, 'OK');
});

test('thiếu cột tuỳ chọn không chặn: ô tương ứng để NULL và được báo trong cotTuyChonVang; tên cột chấp nhận không dấu / không phân biệt hoa thường', () => {
  const cols = ['tui_fromposcode', 'TUI_TOPOSCODE', 'Tui_MailTripType', 'Tui_ServiceCode', 'Tui_Year', 'Tui_MailTripNumber', 'Tui_PostBagIndex', 'Nguon_xuat_luc', 'So_hieu_BD8'];
  const r = tui({ Tui_PostBagIndex: '8' });
  const f = ghi(TEN_TUI(), [{ tui_fromposcode: r.Tui_FromPOSCode, TUI_TOPOSCODE: r.Tui_ToPOSCode, Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020', Tui_MailTripNumber: '3', Tui_PostBagIndex: '8', Nguon_xuat_luc: r.Nguon_xuat_luc, So_hieu_BD8: 'ZZ' }], { cols });
  const res = K.importKttTui(db, f);
  assert.equal(res.status, 'OK');
  assert.ok(res.cotTuyChonVang.includes('Gio_quet_tui_den'));
  const t = motTui(8);
  assert.equal(t.gio_quet_tui_den, null);
  assert.equal(t.so_hieu_bd8, 'ZZ');
});

test('dòng khóa rỗng bị bỏ qua và được đếm; lỗi mẫu chỉ có số dòng + tên cột + mã, không có giá trị; tối đa 20 mẫu', () => {
  const rows = [tui({ Tui_PostBagIndex: '1' }), tui({ Tui_ToPOSCode: '   ' }), tui({ Tui_PostBagIndex: '2', Gio_quet_tui_den: 'GIO-SAI-DINH-DANG-XYZ' }), tui({ Tui_PostBagIndex: '3', Nguon_xuat_luc: '' })];
  const res = K.importKttTui(db, ghi(TEN_TUI(), rows));
  assert.deepEqual([res.dong, res.them, res.loi], [4, 1, 3]);
  assert.deepEqual(res.loiMau, [
    { dong: 3, cot: 'Tui_ToPOSCode', ma: 'KHOA_RONG' },
    { dong: 4, cot: 'Gio_quet_tui_den', ma: 'GIO_SAI_DINH_DANG' },
    { dong: 5, cot: 'Nguon_xuat_luc', ma: 'NGUON_XUAT_RONG' }
  ]);
  assert.ok(!JSON.stringify(res).includes('GIO-SAI-DINH-DANG-XYZ'));
  const nl = db.prepare('SELECT * FROM ktt_nap_lan').get();
  assert.equal(nl.so_dong_loi, 3);
  assert.equal(JSON.parse(nl.loi_mau).length, 3);
  assert.equal(dem('ktt_tui'), 1);

  const nhieu = Array.from({ length: 30 }, (_, i) => tui({ Tui_PostBagIndex: String(100 + i), Tui_FromPOSCode: '' }));
  const r2 = K.importKttTui(db, ghi(TEN_TUI('120000'), nhieu));
  assert.equal(r2.loi, 30);
  assert.equal(r2.loiMau.length, 20);
  assert.equal(JSON.parse(db.prepare('SELECT loi_mau FROM ktt_nap_lan WHERE id = ?').get(r2.napLanId).loi_mau).length, 20);
});

test('giờ: có mili giây (cắt, không làm tròn), rỗng / chữ NULL -> NULL, sai định dạng -> dòng lỗi; số có dấu chấm thập phân; cờ 0/1', () => {
  const dung = tui({ Tui_PostBagIndex: '1', Gio_quet_tui_den: '2026-10-20 07:59:59.999', BD10_den_XND: 'NULL', Chuyen_thu_gio_dong: '', Gio_quet_tui_di: '2026-10-20 08:00:00',
    Khoi_luong_tui: '3.75', So_luong_tui: '4.0', Co_mo_tui: 'True', Co_dong_tui: '0', So_dong_dispatch: ' 12 ' });
  const sai = [
    tui({ Tui_PostBagIndex: '2', Gio_quet_tui_den: '20/10/2026 07:00' }),
    tui({ Tui_PostBagIndex: '3', Gio_quet_tui_den: '2026-02-30 07:00:00' }),
    tui({ Tui_PostBagIndex: '4', Gio_quet_tui_den: '2026-10-20 24:00:00' }),
    tui({ Tui_PostBagIndex: '5', Khoi_luong_tui: '3,5' }),
    tui({ Tui_PostBagIndex: '6', So_luong_tui: '2.5' }),
    tui({ Tui_PostBagIndex: '7', Co_mo_tui: 'maybe' })
  ];
  const res = K.importKttTui(db, ghi(TEN_TUI(), [dung, ...sai]));
  assert.deepEqual([res.them, res.loi], [1, 6]);
  assert.deepEqual(res.loiMau.map((e) => e.ma), ['GIO_SAI_DINH_DANG', 'GIO_SAI_DINH_DANG', 'GIO_SAI_DINH_DANG', 'SO_SAI_DINH_DANG', 'SO_SAI_DINH_DANG', 'CO_SAI_DINH_DANG']);
  assert.deepEqual(res.loiMau.map((e) => e.dong), [3, 4, 5, 6, 7, 8]);
  const t = motTui(1);
  assert.equal(t.gio_quet_tui_den, '2026-10-20 07:59:59');
  assert.equal(t.bd10_den_xnd, null);
  assert.equal(t.chuyen_thu_gio_dong, null);
  assert.equal(t.gio_quet_tui_di, '2026-10-20 08:00:00');
  assert.equal(t.khoi_luong_tui_kg, 3.75);
  assert.equal(t.so_luong_tui, 4);
  assert.equal(t.so_dong_dispatch, 12);
  assert.equal(t.co_mo_tui, 1);
  assert.equal(t.co_dong_tui, 0);
  assert.equal(db.prepare('SELECT typeof(so_luong_tui) a, typeof(khoi_luong_tui_kg) b FROM ktt_tui').get().a, 'integer');
});

test('cột Year (thực chất là NGÀY 20261020) và các khóa khác lưu nguyên TEXT, giữ số 0 đầu, không ép số', () => {
  const r = tui({ Tui_FromPOSCode: '053100', Tui_ToPOSCode: '0000', Tui_MailTripType: '01', Tui_ServiceCode: '007', Tui_Year: '20261020', Tui_MailTripNumber: '002', Tui_PostBagIndex: '0009' });
  K.importKttTui(db, ghi(TEN_TUI(), [r]));
  const t = db.prepare('SELECT * FROM ktt_tui').get();
  assert.deepEqual([t.from_pos, t.to_pos, t.mail_trip_type, t.service_code, t.year, t.mail_trip_number, t.post_bag_index], ['053100', '0000', '01', '007', '20261020', '002', '0009']);
  const kieu = db.prepare('SELECT typeof(year) y, typeof(from_pos) f, typeof(post_bag_index) p FROM ktt_tui').get();
  assert.deepEqual({ ...kieu }, { y: 'text', f: 'text', p: 'text' });
  K.importKttBuuGui(db, ghi(TEN_BG(), [bg({ Tui_FromPOSCode: '053100', Tui_ToPOSCode: '0000', Tui_MailTripType: '01', Tui_ServiceCode: '007', Tui_MailTripNumber: '002', Tui_PostBagIndex: '0009' })]));
  const b = db.prepare('SELECT typeof(year) y, year, post_bag_index p FROM ktt_buu_gui').get();
  assert.deepEqual({ ...b }, { y: 'text', year: '20261020', p: '0009' });
  // 7 cột khóa cùng có mới duy nhất: đổi MỘT cột (PostBagIndex '09' khác '0009') là túi khác
  K.importKttTui(db, ghi(TEN_TUI('235900'), [{ ...r, Tui_PostBagIndex: '9' }]));
  assert.equal(dem('ktt_tui'), 2);
});

test('mốc âm, mốc đi trước mốc đến, NULL: lưu nguyên giá trị nguồn, không chỉnh', () => {
  const r = tui({ Tui_PostBagIndex: '11', Gio_quet_tui_den: '2026-10-20 15:00:00.000', Gio_quet_tui_di: '2026-10-20 09:00:00.000', BD10_di_gio_di: '2026-10-20 08:00:00.000',
    BD10_den_XND: '2026-10-20 16:30:00.000', Khoi_luong_tui: '-2.5', Khoi_luong_quy_doi_tui: '0', So_lan_quet_den: '' });
  K.importKttTui(db, ghi(TEN_TUI(), [r]));
  const t = motTui(11);
  assert.equal(t.gio_quet_tui_den, '2026-10-20 15:00:00');
  assert.equal(t.gio_quet_tui_di, '2026-10-20 09:00:00'); // sớm hơn mốc quét đến: không chỉnh
  assert.equal(t.bd10_di_gio_di, '2026-10-20 08:00:00');
  assert.equal(t.bd10_den_xnd, '2026-10-20 16:30:00'); // BD10 đến xác nhận sau khi túi đã đi: không chỉnh
  assert.equal(t.khoi_luong_tui_kg, -2.5);
  assert.equal(t.khoi_luong_quy_doi_tui, 0);
  assert.equal(t.so_lan_quet_den, null);
  assert.equal(t.bd10_di_so_hieu, null);
});

test('túi không có dòng bưu gửi, bưu gửi có túi chưa nạp: vẫn nạp được (không FOREIGN KEY giữa hai bảng)', () => {
  assert.equal(K.importKttBuuGui(db, ghi(TEN_BG(), [bg({ Tui_PostBagIndex: '404' })])).status, 'OK');
  assert.equal(dem('ktt_buu_gui'), 1);
  assert.equal(dem('ktt_tui'), 0);
  assert.equal(K.importKttTui(db, ghi(TEN_TUI(), [tui({ Tui_PostBagIndex: '505' })])).status, 'OK');
  assert.equal(motTui(505).post_bag_index, '505');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ktt_buu_gui WHERE post_bag_index = '505'").get().c, 0);
  assert.equal(db.prepare('PRAGMA foreign_key_list(ktt_buu_gui)').all().some((f) => f.table === 'ktt_tui'), false);
});

test('một SHBG ở hai túi khác nhau (túi đến và túi đi) -> hai dòng riêng; cùng túi, cùng SHBG ở hai file -> một dòng', () => {
  const chung = { SHBG: 'ZZKTT-CHUNGVN' };
  const f = ghi(TEN_BG(), [bg({ ...chung, Tui_PostBagIndex: '1' }), bg({ ...chung, Tui_FromPOSCode: '599002', Tui_ToPOSCode: '599003', Tui_PostBagIndex: '2' })]);
  const r = K.importKttBuuGui(db, f);
  assert.deepEqual([r.dong, r.them], [2, 2]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ktt_buu_gui WHERE shbg = 'ZZKTT-CHUNGVN'").get().c, 2);
  const r2 = K.importKttBuuGui(db, ghi(TEN_BG('235000'), [bg({ ...chung, Tui_PostBagIndex: '1' })]));
  assert.deepEqual([r2.them, r2.capNhat], [0, 1]);
  assert.equal(dem('ktt_buu_gui'), 2);
});

test('lỗi cấu trúc CSV giữa file (số cột lệch) -> từ chối cả file, hoàn tác toàn bộ dòng đã đọc', () => {
  const f = ghi(TEN_TUI(), [tui(), tui()]);
  fs.appendFileSync(f, '"chi,co,ba,cot"\r\n');
  const r = K.importKttTui(db, f);
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /Lỗi đọc CSV \(CSV_RECORD_INCONSISTENT_FIELDS_LENGTH\) ở dòng 4/);
  assert.equal(dem('ktt_tui'), 0);
  const rong = path.join(workDir, 'rong', TEN_TUI('111111'));
  fs.mkdirSync(path.dirname(rong), { recursive: true });
  fs.writeFileSync(rong, '');
  assert.match(K.importKttTui(db, rong).error, /không có dòng tiêu đề/);
});

test('file có kích thước vài MiB (nhiều lô đọc, ký tự tiếng Việt nằm ở ranh giới lô) nạp đủ, đúng số dòng', () => {
  const rows = Array.from({ length: 6000 }, (_, i) => tui({ Tui_PostBagIndex: String(10000 + i), Ten_dich_vu: 'Dịch vụ giả Đường thư ' + 'ệ'.repeat(120) }));
  const f = ghi(TEN_TUI('180000'), rows);
  assert.ok(fs.statSync(f).size > 2 * (1 << 20), 'fixture cần > 2 MiB để qua nhiều lô');
  const r = K.importKttTui(db, f);
  assert.deepEqual([r.dong, r.them, r.loi], [6000, 6000, 0]);
  assert.equal(dem('ktt_tui'), 6000);
  assert.equal(db.prepare("SELECT ten_dich_vu FROM ktt_tui WHERE post_bag_index = '15999'").get().ten_dich_vu, 'Dịch vụ giả Đường thư ' + 'ệ'.repeat(120));
});

// ---------- chạy thử + thư mục ----------
test('--dry-run (importKttTui / importKttBuuGui / thư mục) không thay đổi DB; số liệu dự kiến bằng số liệu chạy thật', () => {
  const dir = path.join(workDir, 'thumuc');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'KTT_Tui_20261020_100000.csv'), fs.readFileSync(ghi(TEN_TUI('100000'), [tui({ Tui_PostBagIndex: '1', Nguon_xuat_luc: '2026-10-20 10:00:00' }), tui({ Tui_PostBagIndex: '2' })])));
  fs.writeFileSync(path.join(dir, 'KTT_Tui_20261020_130000.csv'), fs.readFileSync(ghi(TEN_TUI('130000'), [tui({ Tui_PostBagIndex: '1', Nguon_xuat_luc: '2026-10-20 13:00:00' })])));
  fs.writeFileSync(path.join(dir, 'KTT_BuuGui_20261020_100000.csv'), fs.readFileSync(ghi(TEN_BG('100000'), [bg(), bg({ Tui_PostBagIndex: '2' })])));
  fs.writeFileSync(path.join(dir, 'KTT_Sai_ten.csv'), 'a\n');
  fs.writeFileSync(path.join(dir, 'ghi_chu.txt'), 'bỏ qua');
  const chup = () => JSON.stringify(BANG_KTT.map((b) => db.prepare(`SELECT * FROM ${b} ORDER BY 1`).all()));
  const truoc = chup();
  const thu = K.importKttDuongDan(db, dir, { dryRun: true });
  assert.equal(chup(), truoc);
  assert.ok(thu.every((r) => r.dryRun === true));
  const tomTat = (rs) => rs.map((r) => [r.fileName, r.status, r.dong, r.them, r.capNhat, r.boQua, r.loi]);
  assert.deepEqual(thu.map((r) => r.fileName), ['KTT_BuuGui_20261020_100000.csv', 'KTT_Sai_ten.csv', 'KTT_Tui_20261020_100000.csv', 'KTT_Tui_20261020_130000.csv']);
  assert.equal(thu[1].status, 'SAI_TEN');
  const that = K.importKttDuongDan(db, dir);
  assert.deepEqual(tomTat(that), tomTat(thu));
  assert.deepEqual(that.find((r) => r.fileName === 'KTT_Tui_20261020_130000.csv').capNhat, 1); // file sau cập nhật dòng của file trước
  assert.notEqual(chup(), truoc);

  // dryRun trên một file (hàm đơn lẻ)
  const f = ghi(TEN_TUI('140000'), [tui({ Tui_PostBagIndex: '99' })]);
  const truoc2 = chup();
  const r = K.importKttTui(db, f, { dryRun: true });
  assert.deepEqual([r.status, r.dryRun, r.them], ['OK', true, 1]);
  assert.equal(chup(), truoc2);
  assert.equal(K.importKttTui(db, f).status, 'OK'); // chạy thử không ghi nhận file "đã nạp"
  // file hỏng ở chạy thử cũng không ghi nhận lần REJECTED
  const hong = ghi(TEN_TUI('150000'), [{ A: '1' }]);
  const truoc3 = chup();
  assert.equal(K.importKttTui(db, hong, { dryRun: true }).status, 'REJECTED');
  assert.equal(chup(), truoc3);
});

// ---------- CLI ----------
function chayCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, KTT_DB: '' } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function dbMoi(ten, taoSchema = true) {
  const p = path.join(workDir, ten);
  const d = new Database(p);
  if (taoSchema) SCHEMA.ensureKttSchema(d);
  d.close();
  return p;
}
const demNgoai = (p, bang) => { const d = new Database(p, { readonly: true }); try { return d.prepare(`SELECT COUNT(*) c FROM ${bang}`).get().c; } finally { d.close(); } };

test('CLI: nạp thư mục theo thứ tự tên, in tóm tắt (không in giá trị dòng); nạp lại báo đã nạp; --dry-run không ghi gì', () => {
  const dir = path.join(workDir, 'cli1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, TEN_TUI('100000')), fs.readFileSync(ghi(TEN_TUI(), [tui({ Tui_PostBagIndex: '1' }), tui({ Tui_PostBagIndex: '2', Gio_quet_tui_den: 'GIO-RAC-CLI' })])));
  fs.writeFileSync(path.join(dir, TEN_BG('100000')), fs.readFileSync(ghi(TEN_BG(), [bg()])));
  const dbp = dbMoi('cli1.db');

  const thu = chayCli([dir, '--dry-run', '--db', dbp]);
  assert.equal(thu.code, 0, thu.err);
  assert.match(thu.out, /CHẠY THỬ/);
  assert.equal(demNgoai(dbp, 'ktt_tui') + demNgoai(dbp, 'ktt_buu_gui') + demNgoai(dbp, 'ktt_nap_lan'), 0);

  const that = chayCli([dir, '--db', dbp]);
  assert.equal(that.code, 0, that.err);
  assert.match(that.out, /Tổng: 2 file, 2 dòng thêm, 0 cập nhật, 0 bỏ qua[^,]*, 1 dòng lỗi/);
  assert.match(that.out, /dòng 3: cột Gio_quet_tui_den — GIO_SAI_DINH_DANG/);
  assert.ok(!that.out.includes('GIO-RAC-CLI') && !that.out.includes('ZZKTT'));
  assert.ok(that.out.indexOf('KTT_BuuGui_') < that.out.indexOf('KTT_Tui_'));
  assert.equal(demNgoai(dbp, 'ktt_tui'), 1);
  assert.equal(demNgoai(dbp, 'ktt_buu_gui'), 1);

  const lai = chayCli([dir, '--db', dbp]);
  assert.equal(lai.code, 0);
  assert.match(lai.out, /DA_NAP/);
  assert.match(lai.out, /2 file đã nạp trước đó/);
});

test('CLI: --dry-run trên DB chưa có bảng KTT không tạo bảng nào; một file; mã thoát 2 khi file bị từ chối; sai cách dùng -> mã 1', () => {
  const f = ghi(TEN_TUI(), [tui({ Tui_PostBagIndex: '1' })]);
  const trong = dbMoi('cli2.db', false);
  const thu = chayCli([f, '--dry-run', '--db', trong]);
  assert.equal(thu.code, 0, thu.err);
  assert.match(thu.out, /1 dòng thêm/);
  const d = new Database(trong, { readonly: true });
  assert.equal(d.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name LIKE 'ktt\\_%' ESCAPE '\\'").get().c, 0);
  d.close();

  const dbp = dbMoi('cli3.db');
  const hong = ghi(TEN_TUI('010203'), [{ Chi_co_cot_la: 'x' }]);
  const r = chayCli([hong, '--db', dbp]);
  assert.equal(r.code, 2);
  assert.match(r.out, /REJECTED/);
  assert.match(r.out, /thiếu cột bắt buộc/);
  assert.equal(chayCli([]).code, 1);
  assert.equal(chayCli([f, '--khong-co', '--db', dbp]).code, 1);
  assert.equal(chayCli([path.join(workDir, 'khong-ton-tai'), '--db', dbp]).code, 1);
  assert.equal(chayCli([f, '--db', path.join(workDir, 'khong-co.db')]).code, 1);
});

// ---------- KTT-2b: đối chiếu tiêu đề với script nguồn, BOM, dấu nháy ----------
// Tiêu đề CHÍNH XÁC theo script KTT-1 (chép nguyên từ ticket KTT-2b, KHÔNG lấy từ COT_TUI / COT_BUU_GUI để đối chiếu độc lập).
const TIEU_DE_TUI = 'Tui_FromPOSCode,Tui_ToPOSCode,Tui_MailTripType,Tui_ServiceCode,Tui_Year,Tui_MailTripNumber,Tui_PostBagIndex,So_hieu_BD8,Ma_loai_tui,Chieu,Dich_nhom,Luong,Co_mo_tui,Co_dong_tui,Chuyen_thu_gio_dong,Chuyen_thu_gio_mo,So_luong_tui,So_dong_dispatch,Khoi_luong_tui,Khoi_luong_quy_doi_tui,Dich_vu_code,Ten_dich_vu,BD10_den_so_hieu,BD10_den_XND,BD10_den_ma_diem_gui,BD10_den_ten_diem_gui,BD10_den_ma_duong_thu,BD10_den_ten_duong_thu,BD10_den_ma_hinh_thuc_vc,BD10_den_ten_hinh_thuc_vc,BD10_den_ma_lich,BD10_den_ten_lich,So_bd10_den,Gio_quet_tui_den,So_lan_quet_den,BD10_di_so_hieu,BD10_di_status,BD10_di_gio_di,BD10_di_TransferDate,BD10_di_ma_diem_nhan,BD10_di_ten_diem_nhan,BD10_di_ma_duong_thu,BD10_di_ten_duong_thu,BD10_di_ma_hinh_thuc_vc,BD10_di_ten_hinh_thuc_vc,BD10_di_ma_lich,BD10_di_ten_lich,Gio_quet_tui_di,Nguon_xuat_luc'.split(',');
const TIEU_DE_BG = 'Tui_FromPOSCode,Tui_ToPOSCode,Tui_MailTripType,Tui_ServiceCode,Tui_Year,Tui_MailTripNumber,Tui_PostBagIndex,SHBG,Khoi_luong_thuc_te,Khoi_luong_quy_doi,Dich_vu_code,Ten_dich_vu,Ma_Xa_Phuong,Ten_Xa_Phuong,Ma_Tinh_Thanh,Ten_Tinh_Thanh,Ma_Quan_Huyen,Ten_Quan_Huyen,Ma_loai_buu_gui,Ten_loai_buu_gui,TI_den_theo_tui_luc,TI_xac_nhan_den_luc,TI_dong_chuyen_thu_di_luc,Nguon_xuat_luc'.split(',');
// Cột script xuất ra nhưng CỐ Ý không lưu (chẩn đoán).
const BO_TUI = ['BD10_di_status', 'BD10_di_TransferDate'];
// Cột DB mong đợi của các tên CSV có khác tên cột DB (ticket KTT-2b mục 2).
const DOI_TEN_TUI = { Khoi_luong_tui: 'khoi_luong_tui_kg', Khoi_luong_quy_doi_tui: 'khoi_luong_quy_doi_tui', BD10_den_XND: 'bd10_den_xnd', So_bd10_den: 'so_bd10_den', Chuyen_thu_gio_dong: 'chuyen_thu_gio_dong', Chuyen_thu_gio_mo: 'chuyen_thu_gio_mo' };

test('KTT-2b: bảng ánh xạ phủ đúng 49 cột túi (47 lưu + 2 bỏ) và 24 cột bưu gửi; tên CSV khớp NGUYÊN VĂN (kể cả hoa / thường)', () => {
  assert.equal(TIEU_DE_TUI.length, 49);
  assert.equal(TIEU_DE_BG.length, 24);
  assert.deepEqual(SCHEMA.COT_TUI.map((c) => c.csv).sort(), TIEU_DE_TUI.filter((h) => !BO_TUI.includes(h)).sort());
  assert.deepEqual(SCHEMA.COT_BUU_GUI.map((c) => c.csv).sort(), [...TIEU_DE_BG].sort());
  for (const [csv, dbCol] of Object.entries(DOI_TEN_TUI)) assert.equal(SCHEMA.COT_TUI.find((c) => c.csv === csv).db, dbCol, csv);
  assert.equal(SCHEMA.COT_BUU_GUI.find((c) => c.csv === 'Khoi_luong_thuc_te').db, 'khoi_luong_thuc_te_g');
  assert.equal(SCHEMA.COT_BUU_GUI.find((c) => c.csv === 'Khoi_luong_quy_doi').db, 'khoi_luong_quy_doi');
  for (const b of BO_TUI) assert.ok(!SCHEMA.COT_TUI.some((c) => c.csv === b));
});

test('KTT-2b: tiêu đề đúng như script (49 + 24 cột): nạp được, cotTuyChonVang rỗng, chỉ BD10_di_status / BD10_di_TransferDate bị bỏ, mọi cột khác đọc đúng giá trị', () => {
  const g = { text: (h) => `V_${h}`, time: () => '2026-10-20 06:05:04.987', int: () => '7', real: () => '1.25', bool: () => '1' };
  const hangTui = {};
  for (const h of TIEU_DE_TUI) hangTui[h] = '';
  for (const c of SCHEMA.COT_TUI) hangTui[c.csv] = g[c.kind](c.csv);
  Object.assign(hangTui, { Tui_Year: '20261020', BD10_di_status: 'TRANG_THAI_GIA', BD10_di_TransferDate: '2026-10-20 01:01:01.000' });
  const rt = K.importKttTui(db, ghi(TEN_TUI(), [hangTui], { cols: TIEU_DE_TUI }));
  assert.equal(rt.status, 'OK', rt.error);
  assert.deepEqual([rt.them, rt.loi], [1, 0]);
  assert.deepEqual(rt.cotTuyChonVang, []);
  assert.deepEqual([...rt.cotLa].sort(), [...BO_TUI].sort());
  const t = db.prepare('SELECT * FROM ktt_tui').get();
  for (const c of SCHEMA.COT_TUI) {
    const mongDoi = c.kind === 'time' ? '2026-10-20 06:05:04' : c.kind === 'text' ? hangTui[c.csv] : c.kind === 'real' ? 1.25 : c.kind === 'int' ? 7 : 1;
    assert.equal(t[c.db], mongDoi, `${c.csv} -> ${c.db}`);
  }
  assert.ok(!JSON.stringify(t).includes('TRANG_THAI_GIA') && !JSON.stringify(t).includes('01:01:01'));

  const hangBg = {};
  for (const c of SCHEMA.COT_BUU_GUI) hangBg[c.csv] = g[c.kind](c.csv);
  hangBg.Ten_Quan_Huyen = ''; // script chưa tra tên: luôn rỗng
  hangBg.Ten_loai_buu_gui = '';
  const rb = K.importKttBuuGui(db, ghi(TEN_BG(), [hangBg], { cols: TIEU_DE_BG }));
  assert.equal(rb.status, 'OK', rb.error);
  assert.deepEqual([rb.them, rb.loi], [1, 0]);
  assert.deepEqual(rb.cotTuyChonVang, []);
  assert.deepEqual(rb.cotLa, []);
  const b = db.prepare('SELECT * FROM ktt_buu_gui').get();
  for (const c of SCHEMA.COT_BUU_GUI) {
    const mongDoi = c.csv === 'Ten_Quan_Huyen' || c.csv === 'Ten_loai_buu_gui' ? null : c.kind === 'time' ? '2026-10-20 06:05:04' : c.kind === 'text' ? hangBg[c.csv] : 1.25;
    assert.equal(b[c.db], mongDoi, `${c.csv} -> ${c.db}`);
  }
});

test('KTT-2b: Ten_Quan_Huyen / Ten_loai_buu_gui luôn NULL: lưu NULL, không là lỗi; vắng cả cột cũng không vào cotTuyChonVang', () => {
  const cols = TIEU_DE_BG.filter((h) => h !== 'Ten_Quan_Huyen' && h !== 'Ten_loai_buu_gui');
  const r = K.importKttBuuGui(db, ghi(TEN_BG(), [bg()], { cols }));
  assert.equal(r.status, 'OK');
  assert.deepEqual(r.cotTuyChonVang, []);
  const b = db.prepare('SELECT ten_quan_huyen a, ten_loai_buu_gui b FROM ktt_buu_gui').get();
  assert.deepEqual({ ...b }, { a: null, b: null });
  assert.equal(db.prepare('SELECT so_dong_loi FROM ktt_nap_lan').get().so_dong_loi, 0);
});

test('KTT-2b: file kiểu SSMS «Save Results As…» — BOM UTF-8, tiêu đề không nháy, chuỗi có dấu phẩy / nháy kép trong dấu nháy chuẩn CSV; có / không BOM, CRLF / LF', () => {
  // Dòng túi 49 cột: chỉ điền khóa (7 cột đầu), Ten_dich_vu (cột thứ 22) và Nguon_xuat_luc (cột cuối).
  const hang = (post, ten) => {
    const o = new Array(49).fill('');
    Object.assign(o, ['599001', '599002', '1', 'R', '20261020', '3', post]);
    o[21] = ten;
    o[48] = '2026-10-20 23:00:00.000';
    return o.join(',');
  };
  const NHAY = '"Dịch vụ, có ""nháy"" và dấu phẩy"';
  const noiDung = (eol) => [TIEU_DE_TUI.join(','), hang('1', NHAY), hang('2', 'Dịch vụ thường')].join(eol) + eol;
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const ghiRaw = (ten, buf) => { const f = path.join(workDir, `raw${++n}`, ten); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f; };

  const co = K.importKttTui(db, ghiRaw(TEN_TUI('010000'), Buffer.concat([BOM, Buffer.from(noiDung('\r\n'), 'utf8')])));
  assert.equal(co.status, 'OK', co.error);
  assert.deepEqual([co.dong, co.them, co.loi], [2, 2, 0]);
  assert.equal(motTui(1).ten_dich_vu, 'Dịch vụ, có "nháy" và dấu phẩy');
  assert.equal(motTui(2).ten_dich_vu, 'Dịch vụ thường');
  assert.equal(motTui(1).from_pos, '599001');
  assert.deepEqual(co.cotTuyChonVang, []);

  db.exec('DELETE FROM ktt_tui; DELETE FROM ktt_nap_lan;');
  const khong = K.importKttTui(db, ghiRaw(TEN_TUI('020000'), Buffer.from(noiDung('\n'), 'utf8')));
  assert.deepEqual([khong.status, khong.them, khong.loi], ['OK', 2, 0]);
  assert.equal(motTui(1).ten_dich_vu, 'Dịch vụ, có "nháy" và dấu phẩy');

  // BOM + tiêu đề cũng nằm trong nháy kép: nếu BOM không được bỏ, nháy đầu dòng sẽ gây lỗi CSV
  db.exec('DELETE FROM ktt_tui; DELETE FROM ktt_nap_lan;');
  const tdNhay = TIEU_DE_TUI.map((h) => `"${h}"`).join(',');
  const nhay = K.importKttTui(db, ghiRaw(TEN_TUI('030000'), Buffer.concat([BOM, Buffer.from([tdNhay, hang('3', 'ABC')].join('\r\n') + '\r\n', 'utf8')])));
  assert.deepEqual([nhay.status, nhay.them, nhay.loi], ['OK', 1, 0]);

  // file bưu gửi có BOM
  const tdBg = ['Tui_FromPOSCode', 'Tui_ToPOSCode', 'Tui_MailTripType', 'Tui_ServiceCode', 'Tui_Year', 'Tui_MailTripNumber', 'Tui_PostBagIndex', 'SHBG', 'Ten_dich_vu', 'Nguon_xuat_luc'].join(',');
  const dongBg = ['599001', '599002', '1', 'R', '20261020', '3', '1', 'ZZKTT0000001VN', NHAY, '2026-10-20 23:00:00.000'].join(',');
  const bgf = K.importKttBuuGui(db, ghiRaw(TEN_BG('040000'), Buffer.concat([BOM, Buffer.from([tdBg, dongBg].join('\r\n') + '\r\n', 'utf8')])));
  assert.deepEqual([bgf.status, bgf.them], ['OK', 1]);
  assert.equal(db.prepare('SELECT ten_dich_vu v FROM ktt_buu_gui').get().v, 'Dịch vụ, có "nháy" và dấu phẩy');
});
