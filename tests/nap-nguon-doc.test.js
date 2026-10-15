// ==========================================
// Test SANLUONG-5f-1: API ĐỌC màn «Nạp dữ liệu nguồn» (server/lib/napNguonDoc.js + server/routes/napNguon.js, /api/nap-nguon/*). Chỉ ADMIN, chỉ GET.
// Server thật + DB tạm của harness; dữ liệu GIẢ nhét thẳng vào các bảng (không CSV, không mạng, không ssh2). `now` được tiêm (giờ cục bộ). SFTP_* bị cách ly.
// Không SHBG nào xuất hiện ở đây (API không đọc arrival_items); quét \d{15,} trên mọi phản hồi.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const N = require('../server/lib/napNguonDoc');
const S = require('../server/lib/sftpSync');
const CF = require('../server/config/nap-nguon');

const PORT = 5932;
const USERS = {
  admin: { hrm: 'NN_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'NN_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'NN_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'NN_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'NN_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhuc = [cachLySftpEnv()];
let ctx;

const BC = { TH: '533140', HT: '535470', HTHUY: '536250', TA: '537015', PL: '537220', AL: '535790' };
const HOM_NAY = '2026-10-14';
const luc = (ngay, gio = '08:00') => { const [y, m, d] = ngay.split('-').map(Number); const [h, mi] = gio.split(':').map(Number); return new Date(y, m - 1, d, h, mi, 0); };
const NOW = luc(HOM_NAY, '08:00'); // cục bộ: sáng, trước giờ mong đợi

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-napnguon-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  for (const r of khoiPhuc.reverse()) r();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});
beforeEach(() => {
  cachLySftpEnv();
  for (const t of ['sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'arrival_items', 'arrival_import_files']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- dữ liệu giả ----------
let seq = 0;
const ten = (bcvh, ngay, gio) => `HangDen_${bcvh}_${ngay.replace(/-/g, '')}_${gio}.csv`;
/** Một bản ghi arrival_import_files. gio 'hhmmss'. */
function fileDb({ bcvh, ngay, gio = '093012', status = 'OK', source = 'SFTP', rows = 100, error = null }) {
  seq++;
  ctx.db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, status, error, source, imported_at)
    VALUES (?, ?, ?, ?, 1000, ?, ?, ?, ?, ?, '2026-10-14 01:02:03')`)
    .run(bcvh, ten(bcvh, ngay, gio), ngay, `${gio.slice(0, 2)}:${gio.slice(2, 4)}:${gio.slice(4, 6)}`, `h${seq}`, rows, status, error, source);
}
function nguon({ bcvh, ngay, gio = '093012', con = 1, tenFile = null }) {
  ctx.db.prepare(`INSERT INTO sftp_source_files (thu_muc, ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, giu_nguyen_tu, con_tren_nguon) VALUES ('/thu-muc-nguon-bi-mat', ?, 5000, 1760400000000, '2026-10-14T01:00:00.000Z', '2026-10-14T02:00:00.000Z', '2026-10-14T01:00:00.000Z', ?)`)
    .run(tenFile || ten(bcvh, ngay, gio), con);
}
function luot({ trigger = 'TIMER', loi = 0, ghiChu = null, xong = true, batDau = '2026-10-14T01:00:00.000Z' } = {}) {
  return Number(ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at, finished_at, "trigger", tong_liet_ke, da_nap, loi, ghi_chu_loi) VALUES (?, ?, ?, 12, 2, ?, ?)')
    .run(batDau, xong ? '2026-10-14T01:00:05.000Z' : null, trigger, loi, ghiChu).lastInsertRowid);
}
function fileLuot(runId, tenFile, { ketQua = 'DA_NAP', soDong = 100, ms = 250, maLoi = null, chiTiet = null } = {}) {
  return Number(ctx.db.prepare('INSERT INTO sftp_sync_files (run_id, thu_muc, ten_file, ket_qua, so_dong, thoi_gian_ms, ma_loi, chi_tiet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(runId, '/thu-muc-nguon-bi-mat', tenFile, ketQua, soDong, ms, maLoi, chiTiet).lastInsertRowid);
}
const o = (kq, bcvh, ngay, dot) => kq.o.find((x) => x.bcvh === bcvh && x.ngay === ngay && x.dot === dot);
const luoi = (extra = {}) => N.luoi({ db: ctx.db, now: NOW, tu: '2026-10-12', den: '2026-10-15', ...extra });

const goi = (who, url) => fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// =====================================================================
// TRẠNG THÁI Ô
// =====================================================================
test('mỗi trạng thái của ô: DA_NAP, RONG, LOI, NHAP_TAY, NGUON_CO_FILE_CHUA_NAP (kể cả ngày nhập tay), NGUON_CHUA_CO_FILE, CHUA_DEN_GIO; tổng hợp và can_xu_ly đúng', () => {
  const n = '2026-10-12';
  fileDb({ bcvh: BC.TH, ngay: n, gio: '093012' }); // DA_NAP sáng
  fileDb({ bcvh: BC.TH, ngay: n, gio: '163011', status: 'EMPTY', rows: 0 }); // RONG chiều
  fileDb({ bcvh: BC.HT, ngay: n, gio: '093012', status: 'REJECTED', error: 'Sai tiêu đề (3 cột)', rows: 0 }); // LOI sáng
  fileDb({ bcvh: BC.HT, ngay: n, gio: '163011', status: 'CONFLICT', error: 'Trùng tên', rows: 0 }); // LOI chiều
  fileDb({ bcvh: BC.HTHUY, ngay: n, gio: '235959', source: 'MANUAL', rows: 500 }); // NHAP_TAY cả ngày
  nguon({ bcvh: BC.TA, ngay: n, gio: '093012' }); // nguồn có file sáng, DB chưa có
  fileDb({ bcvh: BC.PL, ngay: n, gio: '235959', source: 'MANUAL', rows: 500 });
  nguon({ bcvh: BC.PL, ngay: n, gio: '163011' }); // ngày nhập tay + nguồn có file chiều
  // BCVH A Lưới: không có gì ngày 12 -> NGUON_CHUA_CO_FILE
  const kq = luoi();
  assert.equal(o(kq, BC.TH, n, 'S').trang_thai, 'DA_NAP');
  assert.equal(o(kq, BC.TH, n, 'C').trang_thai, 'RONG');
  assert.equal(o(kq, BC.TH, n, 'C').ly_do, 'EMPTY');
  assert.deepEqual([o(kq, BC.HT, n, 'S').trang_thai, o(kq, BC.HT, n, 'S').ly_do, o(kq, BC.HT, n, 'C').ly_do], ['LOI', 'REJECTED', 'CONFLICT']);
  assert.match(o(kq, BC.HT, n, 'S').chi_tiet.file_db[0].loi, /Sai tiêu đề/);
  assert.deepEqual([o(kq, BC.HTHUY, n, 'S').trang_thai, o(kq, BC.HTHUY, n, 'C').trang_thai], ['NHAP_TAY', 'NHAP_TAY']);
  assert.equal(o(kq, BC.HTHUY, n, 'S').chi_tiet.file_db[0].nguon, 'MANUAL');
  assert.deepEqual([o(kq, BC.TA, n, 'S').trang_thai, o(kq, BC.TA, n, 'S').ly_do, o(kq, BC.TA, n, 'C').trang_thai], ['NGUON_CO_FILE_CHUA_NAP', 'CHUA_NAP', 'NGUON_CHUA_CO_FILE']);
  assert.deepEqual([o(kq, BC.PL, n, 'S').trang_thai, o(kq, BC.PL, n, 'C').trang_thai, o(kq, BC.PL, n, 'C').ly_do], ['NHAP_TAY', 'NGUON_CO_FILE_CHUA_NAP', 'NHAP_TAY_CO_SAN']);
  assert.deepEqual([o(kq, BC.AL, n, 'S').trang_thai, o(kq, BC.AL, n, 'S').ly_do], ['NGUON_CHUA_CO_FILE', 'KHONG_THAY_TREN_NGUON']);
  // hôm nay 08:00: chưa tới giờ; ngày mai: chưa tới giờ
  assert.deepEqual([o(kq, BC.TH, HOM_NAY, 'S').trang_thai, o(kq, BC.TH, HOM_NAY, 'C').trang_thai, o(kq, BC.TH, '2026-10-15', 'S').trang_thai], ['CHUA_DEN_GIO', 'CHUA_DEN_GIO', 'CHUA_DEN_GIO']);
  // cấu trúc
  assert.equal(kq.o.length, 4 * 6 * 2);
  assert.equal(kq.ngay_bcvh.length, 4 * 6);
  assert.deepEqual(kq.o.slice(0, 3).map((x) => [x.ngay, x.bcvh, x.dot]), [['2026-10-15', BC.TH, 'S'], ['2026-10-15', BC.TH, 'C'], ['2026-10-15', BC.HT, 'S']], 'ngày mới nhất trước, rồi thứ tự BCVH, S trước C');
  assert.equal(kq.tong_hop.theo_trang_thai.DA_NAP, 1);
  assert.equal(kq.tong_hop.theo_trang_thai.LOI, 2);
  assert.equal(kq.tong_hop.theo_trang_thai.NHAP_TAY, 3);
  assert.equal(Object.values(kq.tong_hop.theo_trang_thai).reduce((a, b) => a + b, 0), kq.o.length, 'tổng theo trạng thái = số ô (chưa tính mã lạ)');
  const cx = kq.can_xu_ly.map((x) => `${x.bcvh}|${x.ngay}|${x.dot}|${x.trang_thai}`);
  assert.ok(cx.includes(`${BC.HT}|${n}|S|LOI`) && cx.includes(`${BC.TA}|${n}|S|NGUON_CO_FILE_CHUA_NAP`) && cx.includes(`${BC.AL}|${n}|C|NGUON_CHUA_CO_FILE`) && cx.includes(`${BC.TH}|${n}|C|RONG`));
  assert.ok(!cx.some((x) => x.includes('|DA_NAP') || x.includes('|NHAP_TAY') || x.includes('|CHUA_DEN_GIO')));
  assert.ok(kq.can_xu_ly.every((x, i, a) => i === 0 || a[i - 1].ngay >= x.ngay), 'mới nhất trước');
});

test('ranh giới sáng / chiều: file 11:59:59 thuộc đợt SÁNG, 12:00:00 thuộc đợt CHIỀU (RANH_GIOI_DOT = 12:00)', () => {
  assert.equal(CF.RANH_GIOI_DOT, '12:00');
  assert.deepEqual([N.dotCua('11:59:59'), N.dotCua('12:00:00'), N.dotCua('09:30:12'), N.dotCua('16:30:11')], ['S', 'C', 'S', 'C']);
  const n = '2026-10-12';
  fileDb({ bcvh: BC.TH, ngay: n, gio: '115959' });
  fileDb({ bcvh: BC.HT, ngay: n, gio: '120000' });
  const kq = luoi();
  assert.deepEqual([o(kq, BC.TH, n, 'S').trang_thai, o(kq, BC.TH, n, 'C').trang_thai], ['DA_NAP', 'NGUON_CHUA_CO_FILE']);
  assert.deepEqual([o(kq, BC.HT, n, 'S').trang_thai, o(kq, BC.HT, n, 'C').trang_thai], ['NGUON_CHUA_CO_FILE', 'DA_NAP']);
});

test('hôm nay trước / sau giờ mong đợi cộng ân hạn (tiêm now): CHUA_DEN_GIO -> CHO_FILE; có file thì DA_NAP; nguồn có file thì NGUON_CO_FILE_CHUA_NAP', () => {
  const doc = (gio) => { const k = N.luoi({ db: ctx.db, now: luc(HOM_NAY, gio), tu: HOM_NAY, den: HOM_NAY, bcvh: BC.TH }); return [o(k, BC.TH, HOM_NAY, 'S').trang_thai, o(k, BC.TH, HOM_NAY, 'C').trang_thai]; };
  assert.equal(CF.AN_HAN_PHUT, 60);
  assert.deepEqual(doc('00:00'), ['CHUA_DEN_GIO', 'CHUA_DEN_GIO']);
  assert.deepEqual(doc('10:29'), ['CHUA_DEN_GIO', 'CHUA_DEN_GIO'], 'trong ân hạn: 09:30 + 60 phút');
  assert.deepEqual(doc('10:30'), ['CHO_FILE', 'CHUA_DEN_GIO']);
  assert.deepEqual(doc('17:29'), ['CHO_FILE', 'CHUA_DEN_GIO']);
  assert.deepEqual(doc('17:30'), ['CHO_FILE', 'CHO_FILE']);
  assert.equal(o(N.luoi({ db: ctx.db, now: luc(HOM_NAY, '11:00'), tu: HOM_NAY, den: HOM_NAY, bcvh: BC.TH }), BC.TH, HOM_NAY, 'S').ly_do, 'QUA_GIO_MONG_DOI');
  fileDb({ bcvh: BC.TH, ngay: HOM_NAY, gio: '093012' });
  nguon({ bcvh: BC.TH, ngay: HOM_NAY, gio: '163011' });
  assert.deepEqual(doc('18:00'), ['DA_NAP', 'NGUON_CO_FILE_CHUA_NAP']);
});

test('nguon_co_file: null khi chưa từng quét nguồn; true / false khi đã có thông tin nguồn (ngày chỉ có file sáng)', () => {
  const n = '2026-10-12';
  fileDb({ bcvh: BC.TH, ngay: n, gio: '093012' });
  let kq = luoi();
  assert.ok(kq.o.every((x) => x.nguon_co_file === null) && kq.ngay_bcvh.every((x) => x.nguon_co_file === null));
  nguon({ bcvh: BC.TH, ngay: n, gio: '093012' }); // nguồn chỉ có file SÁNG
  nguon({ bcvh: BC.HT, ngay: '2026-10-13', gio: '093012' });
  kq = luoi();
  assert.equal(o(kq, BC.TH, n, 'S').nguon_co_file, true);
  assert.equal(o(kq, BC.TH, n, 'C').nguon_co_file, true, 'cờ ở mức ngày: nguồn có (ít nhất) một file');
  assert.equal(o(kq, BC.TH, n, 'C').trang_thai, 'NGUON_CHUA_CO_FILE', 'nguồn chỉ có file sáng nên đợt chiều không có');
  assert.equal(o(kq, BC.AL, n, 'S').nguon_co_file, false);
  assert.equal(o(kq, BC.HT, '2026-10-13', 'C').nguon_co_file, true);
  // file đã biến mất khỏi nguồn (con_tren_nguon = 0) không tính là «nguồn có»
  nguon({ bcvh: BC.PL, ngay: n, gio: '093012', con: 0 });
  assert.equal(o(luoi(), BC.PL, n, 'S').nguon_co_file, false);
  assert.equal(o(luoi(), BC.PL, n, 'S').trang_thai, 'NGUON_CHUA_CO_FILE');
});

test('MA_KHONG_KHOP: file đúng mẫu tên nhưng mã ngoài 6 BCVH (từ sftp_source_files hoặc nhật ký BO_QUA/MA_LA) nằm riêng trong can_xu_ly với bcvh null; không thuộc ô nào; lọc theo bcvh thì ẩn', () => {
  nguon({ bcvh: '999001', ngay: '2026-10-13', gio: '093012' });
  const r = luot();
  fileLuot(r, ten('999002', '2026-10-12', '163011'), { ketQua: 'BO_QUA', soDong: null, maLoi: 'MA_LA' });
  nguon({ bcvh: '999003', ngay: '2026-10-13', gio: '093012', con: 0 }); // đã biến mất khỏi nguồn: không tính
  const kq = luoi();
  const la = kq.can_xu_ly.filter((x) => x.trang_thai === 'MA_KHONG_KHOP');
  assert.deepEqual(la.map((x) => [x.bcvh, x.ngay, x.dot, x.ma_la, x.loai]), [[null, '2026-10-13', 'S', '999001', 'MA_LA'], [null, '2026-10-12', 'C', '999002', 'MA_LA']]);
  assert.equal(kq.tong_hop.theo_trang_thai.MA_KHONG_KHOP, 2);
  assert.ok(kq.o.every((x) => BC_LIST.includes(x.bcvh)));
  assert.equal(luoi({ bcvh: BC.TH }).can_xu_ly.filter((x) => x.trang_thai === 'MA_KHONG_KHOP').length, 0);
});
const BC_LIST = Object.values(BC);

// =====================================================================
// NGHI NGỜ ÍT / NHIỀU
// =====================================================================
test('nghi ngờ ít / nhiều theo trung vị cùng thứ trong tuần (4 tuần trước, ≥ 3 ngày mẫu): ngưỡng < 0,5× và > 2,5×; CHUA_DU_MAU; không xét hôm nay', () => {
  const dich = '2026-10-12';
  for (const k of [1, 2, 3, 4]) fileDb({ bcvh: BC.TH, ngay: S.congNgay(dich, -7 * k), gio: '235959', source: 'MANUAL', rows: 1000 });
  const nghi = (rows, ngay = dich) => {
    ctx.db.prepare("DELETE FROM arrival_import_files WHERE file_date = ? AND unit_code = ?").run(ngay, BC.TH);
    fileDb({ bcvh: BC.TH, ngay, gio: '093012', rows: Math.floor(rows / 2) }); fileDb({ bcvh: BC.TH, ngay, gio: '163011', rows: rows - Math.floor(rows / 2) });
    const e = N.luoi({ db: ctx.db, now: NOW, tu: ngay, den: ngay, bcvh: BC.TH }).ngay_bcvh[0];
    return [e.nghi_ngo, e.tong_dong, e.trung_vi, e.so_mau];
  };
  assert.deepEqual(nghi(400), ['IT', 400, 1000, 4]);
  assert.deepEqual(nghi(499), ['IT', 499, 1000, 4]);
  assert.deepEqual(nghi(500), [null, 500, 1000, 4], 'đúng 0,5× không phải ít');
  assert.deepEqual(nghi(1000), [null, 1000, 1000, 4]);
  assert.deepEqual(nghi(2500), [null, 2500, 1000, 4], 'đúng 2,5× không phải nhiều');
  assert.deepEqual(nghi(2501), ['NHIEU', 2501, 1000, 4]);
  // trong lưới: ô của ngày đó mang cờ, can_xu_ly có mục mức NGÀY
  nghi(300);
  const kq = luoi({ bcvh: BC.TH });
  assert.equal(o(kq, BC.TH, dich, 'S').nghi_ngo, 'IT');
  assert.equal(o(kq, BC.TH, dich, 'C').nghi_ngo, 'IT');
  assert.ok(kq.can_xu_ly.some((x) => x.loai === 'NGAY' && x.ngay === dich && x.ly_do === 'NGHI_NGO_IT' && x.dot === null));
  assert.equal(kq.tong_hop.nghi_ngo.IT, 1);
  // ô DA_NAP vẫn có thể nghi ngờ
  assert.equal(o(kq, BC.TH, dich, 'S').trang_thai, 'DA_NAP');
  // chưa đủ mẫu: chỉ 2 ngày mẫu
  ctx.db.prepare("DELETE FROM arrival_import_files WHERE file_date IN (?, ?)").run(S.congNgay(dich, -21), S.congNgay(dich, -28));
  assert.deepEqual(nghi(300), ['CHUA_DU_MAU', 300, null, 2]);
  assert.ok(!luoi({ bcvh: BC.TH }).can_xu_ly.some((x) => x.loai === 'NGAY'), 'CHUA_DU_MAU không vào can_xu_ly');
  // mẫu của BCVH khác không dùng; hôm nay không xét
  fileDb({ bcvh: BC.TH, ngay: HOM_NAY, gio: '093012', rows: 1 });
  for (const k of [1, 2, 3]) fileDb({ bcvh: BC.TH, ngay: S.congNgay(HOM_NAY, -7 * k), gio: '235959', source: 'MANUAL', rows: 1000 });
  assert.equal(N.luoi({ db: ctx.db, now: NOW, tu: HOM_NAY, den: HOM_NAY, bcvh: BC.TH }).ngay_bcvh[0].nghi_ngo, null);
  assert.equal(N.luoi({ db: ctx.db, now: NOW, tu: dich, den: dich, bcvh: BC.HT }).ngay_bcvh[0].nghi_ngo, null, 'BCVH khác không có file ngày đó');
});

// =====================================================================
// MỘT Ô
// =====================================================================
test('/o: file mong đợi, file trong DB / trên nguồn, thời gian nạp, lần thử gần nhất, lịch sử tối đa 20 (mới nhất trước), mã lỗi + chi tiết đã lọc', () => {
  const n = '2026-10-12';
  fileDb({ bcvh: BC.TH, ngay: n, gio: '093012', rows: 2300 });
  nguon({ bcvh: BC.TH, ngay: n, gio: '093012' });
  const nameS = ten(BC.TH, n, '093012');
  const r1 = luot({ trigger: 'TIMER', batDau: '2026-10-12T02:00:00.000Z' });
  fileLuot(r1, nameS, { ketQua: 'LOI', soDong: null, ms: 40, maLoi: 'KICH_THUOC_LECH', chiTiet: 'Tải về 10 byte nhưng danh sách báo 20 byte' });
  const r2 = luot({ trigger: 'MANUAL', batDau: '2026-10-12T03:00:00.000Z' });
  fileLuot(r2, nameS, { ketQua: 'DA_NAP', soDong: 2300, ms: 812 });
  for (let i = 0; i < 25; i++) fileLuot(luot({ batDau: `2026-10-13T0${i % 9}:00:00.000Z` }), nameS, { ketQua: 'DA_CO', soDong: null, ms: 1 });
  fileLuot(r2, ten(BC.TH, n, '163011'), { ketQua: 'LOI', soDong: null, maLoi: 'KHAC_DOT' }); // đợt chiều: không lẫn vào lịch sử đợt sáng
  const m = N.mot({ db: ctx.db, now: NOW, bcvh: BC.TH, ngay: n, dot: 'S' });
  assert.deepEqual([m.trang_thai, m.ten_bcvh, m.dot], ['DA_NAP', 'BCVH Thuận Hóa', 'S']);
  assert.deepEqual(m.file_mong_doi, { mau_ten: `HangDen_${BC.TH}_20261012_<hhmmss>.csv`, gio_mong_doi: '09:30', an_han_phut: 60 });
  assert.equal(m.lich_su.length, 20);
  assert.ok(m.lich_su.every((x) => x.ten === nameS), 'chỉ đợt sáng của ô này');
  assert.ok(m.lich_su[0].lan_id > m.lich_su[19].lan_id, 'mới nhất trước');
  assert.equal(m.lan_thu_gan_nhat.lan_id, m.lich_su[0].lan_id);
  assert.deepEqual(m.file_db.map((f) => [f.ten, f.nguon, f.trang_thai, f.so_dong, f.nap_luc]), [[nameS, 'SFTP', 'OK', 2300, '2026-10-14T01:02:03Z']]);
  assert.deepEqual([m.file_nguon[0].ten, m.file_nguon[0].kich_thuoc, m.file_nguon[0].mtime, m.file_nguon[0].con_tren_nguon], [nameS, 5000, '2025-10-14T00:00:00.000Z', true]);
  assert.deepEqual([m.thong_tin_nap.so_dong, m.thong_tin_nap.thoi_gian_nap_ms], [2300, 812]);
  assert.equal(m.tong_ngay.tong_dong, 2300);
  // ô lỗi: mã lỗi + chi tiết
  fileDb({ bcvh: BC.HT, ngay: n, gio: '163011', status: 'REJECTED', error: 'Dòng 5: sai định dạng', rows: 0 });
  fileLuot(luot({ loi: 1 }), ten(BC.HT, n, '163011'), { ketQua: 'LOI', soDong: null, maLoi: 'REJECTED', chiTiet: 'Importer từ chối: Dòng 5: sai định dạng' });
  const l = N.mot({ db: ctx.db, now: NOW, bcvh: BC.HT, ngay: n, dot: 'C' });
  assert.deepEqual([l.trang_thai, l.ly_do, l.loi.ma], ['LOI', 'REJECTED', 'REJECTED']);
  assert.match(l.loi.chi_tiet, /sai định dạng/);
  assert.equal(l.thong_tin_nap, null);
});

// =====================================================================
// LƯỢT
// =====================================================================
test('lọc hàng khoá «Thay thế ngày» khỏi danh sách lượt, lượt gần nhất, đang chạy; chi tiết lượt khoá trả 404', () => {
  const that = luot({ trigger: 'TIMER', batDau: '2026-10-14T01:00:00.000Z' });
  const khoa = luot({ trigger: 'MANUAL', xong: false, batDau: '2026-10-14T01:30:00.000Z', ghiChu: `${CF.TIEN_TO_KHOA_THAY_THE} (không phải lượt đồng bộ). Nếu còn treo, tự đóng sau 30 phút` });
  const khoaXong = luot({ trigger: 'MANUAL', xong: true, batDau: '2026-10-14T01:40:00.000Z', ghiChu: `${CF.TIEN_TO_KHOA_THAY_THE} (x)` });
  const now = new Date('2026-10-14T01:35:00.000Z');
  const tq = N.tongQuan({ db: ctx.db, now, tuDong: {} });
  assert.deepEqual(tq.luot_gan_nhat, { id: that, bat_dau: '2026-10-14T01:00:00.000Z', cach_chay: 'TU_DONG', ket_qua: 'THANH_CONG' });
  assert.equal(tq.dang_chay, null, 'hàng khoá chưa kết thúc không phải «đang chạy»');
  const ds = N.dsLuot({ db: ctx.db, now });
  assert.deepEqual([ds.tong, ds.luot.map((x) => x.id)], [1, [that]]);
  for (const id of [khoa, khoaXong]) assert.throws(() => N.chiTietLuot({ db: ctx.db, now, id }), (e) => e.httpStatus === 404);
  // lượt thật đang chạy (< 30 phút) -> dang_chay; quá 30 phút -> TREO, không còn đang chạy
  const chay = luot({ trigger: 'MANUAL', xong: false, batDau: '2026-10-14T01:20:00.000Z' });
  assert.deepEqual(N.tongQuan({ db: ctx.db, now, tuDong: {} }).dang_chay, { id: chay, bat_dau: '2026-10-14T01:20:00.000Z' });
  assert.equal(N.dsLuot({ db: ctx.db, now }).luot[0].ket_qua, 'DANG_CHAY');
  const sau = new Date('2026-10-14T03:00:00.000Z');
  assert.equal(N.tongQuan({ db: ctx.db, now: sau, tuDong: {} }).dang_chay, null);
  assert.equal(N.dsLuot({ db: ctx.db, now: sau }).luot[0].ket_qua, 'TREO');
});

test('danh sách lượt: phân trang (mặc định 20, tối đa 100), mới nhất trước, trường đủ; chi tiết lượt kèm từng file; người bấm = null (chưa có dữ liệu)', () => {
  const ids = [];
  for (let i = 0; i < 25; i++) ids.push(luot({ trigger: i % 2 ? 'TIMER' : 'MANUAL', loi: i === 24 ? 2 : 0 }));
  const t1 = N.dsLuot({ db: ctx.db, now: NOW });
  assert.deepEqual([t1.trang, t1.kich_thuoc, t1.tong, t1.so_trang, t1.luot.length], [1, 20, 25, 2, 20]);
  assert.equal(t1.luot[0].id, ids[24]);
  assert.deepEqual([t1.luot[0].ket_qua, t1.luot[0].cach_chay, t1.luot[1].cach_chay, t1.luot[0].nguoi], ['CO_LOI', 'TAY', 'TU_DONG', null]);
  assert.deepEqual(Object.keys(t1.luot[0]), ['id', 'bat_dau', 'ket_thuc', 'cach_chay', 'liet_ke', 'da_nap', 'da_co', 'chua_on_dinh', 'rong', 'bo_qua_khac', 'loi', 'ket_qua', 'nguoi', 'ghi_chu_loi']);
  const t2 = N.dsLuot({ db: ctx.db, now: NOW, trang: '2', kichThuoc: '10' });
  assert.deepEqual([t2.trang, t2.kich_thuoc, t2.luot.length, t2.luot[0].id], [2, 10, 10, ids[14]]);
  assert.equal(N.dsLuot({ db: ctx.db, now: NOW, trang: '3', kichThuoc: '10' }).luot.length, 5);
  assert.equal(N.dsLuot({ db: ctx.db, now: NOW, trang: '9' }).luot.length, 0);
  assert.equal(N.dsLuot({ db: ctx.db, now: NOW, kichThuoc: '100' }).luot.length, 25);
  fileLuot(ids[3], ten(BC.TH, '2026-10-12', '093012'));
  fileLuot(ids[3], ten(BC.HT, '2026-10-12', '163011'), { ketQua: 'LOI', soDong: null, maLoi: 'REJECTED', chiTiet: 'x' });
  const ct = N.chiTietLuot({ db: ctx.db, now: NOW, id: String(ids[3]) });
  assert.equal(ct.id, ids[3]);
  assert.deepEqual(ct.files.map((f) => [f.ten, f.ket_qua, f.ma_loi]), [[ten(BC.TH, '2026-10-12', '093012'), 'DA_NAP', null], [ten(BC.HT, '2026-10-12', '163011'), 'LOI', 'REJECTED']]);
  assert.ok(!('thu_muc' in ct.files[0]), 'không trả đường dẫn thư mục nguồn');
});

test('tổng quan: ánh xạ trạng thái hẹn giờ (TAT / CHO / DANG_CHAY / TAM_DUNG + lý do), giờ chạy kế tiếp, chu kỳ, số thư mục, giờ mong đợi', () => {
  const dung = (st, soThuMuc = 2) => N.tongQuan({ db: ctx.db, now: NOW, tuDong: { st, soThuMuc } });
  const tat = dung(null, null);
  assert.deepEqual(tat.tu_dong, { bat: false, trang_thai: 'TAT', ly_do_tam_dung: null, loi_luc: null, chu_ky_phut: null, so_thu_muc: null, luot_ke_tiep_luc: null });
  assert.equal(dung({ trangThai: 'CAU_HINH_SAI' }).tu_dong.trang_thai, 'TAT');
  assert.equal(dung({ trangThai: 'CHUA_KHOI_DONG' }).tu_dong.bat, false);
  const cho = dung({ trangThai: 'CHO', chuKyPhut: 10, luotKeTiep: '2026-10-14T01:10:00.000Z', luotGanNhat: { luc: '2026-10-14T01:00:00.000Z', ketQua: 'XONG' } });
  assert.deepEqual(cho.tu_dong, { bat: true, trang_thai: 'CHO', ly_do_tam_dung: null, loi_luc: null, chu_ky_phut: 10, so_thu_muc: 2, luot_ke_tiep_luc: '2026-10-14T01:10:00.000Z' });
  assert.equal(dung({ trangThai: 'DANG_CHAY', chuKyPhut: 10 }).tu_dong.trang_thai, 'DANG_CHAY');
  const vt = dung({ trangThai: 'TAM_DUNG', lyDo: 'VAN_TAY_SAI', luotGanNhat: { luc: '2026-10-14T00:50:00.000Z', ketQua: 'TAM_DUNG' } }).tu_dong;
  assert.deepEqual([vt.bat, vt.trang_thai, vt.ly_do_tam_dung, vt.loi_luc], [true, 'TAM_DUNG', 'VAN_TAY', '2026-10-14T00:50:00.000Z']);
  assert.equal(dung({ trangThai: 'TAM_DUNG', lyDo: 'XAC_THUC' }).tu_dong.ly_do_tam_dung, 'XAC_THUC');
  assert.equal(dung({ trangThai: 'CHO', luotGanNhat: { luc: 'x', ketQua: 'LOI_KET_NOI' } }).tu_dong.loi_luc, 'x');
  assert.deepEqual(tat.gio_mong_doi, { sang: '09:30', chieu: '16:30', an_han_phut: 60 });
  assert.equal(tat.luot_gan_nhat, null);
  assert.equal(tat.dang_chay, null);
});

// =====================================================================
// ROUTE: quyền, tham số, chỉ đọc, bí mật
// =====================================================================
const DUONG_DAN = ['/api/nap-nguon/tong-quan', '/api/nap-nguon/luoi?tu=2026-10-12&den=2026-10-14', `/api/nap-nguon/o?bcvh=${BC.TH}&ngay=2026-10-12&dot=S`, '/api/nap-nguon/luot', '/api/nap-nguon/luot/1'];

test('quyền: ADMIN 200 (hoặc 404 với lượt không có); TTVH, GDVH, STAFF, TIVI 403; không token 401 — cả năm đầu API', async () => {
  const r = luot();
  fileLuot(r, ten(BC.TH, '2026-10-12', '093012'));
  const urls = [...DUONG_DAN.slice(0, 4), `/api/nap-nguon/luot/${r}`];
  for (const u of urls) {
    assert.equal((await goi('admin', u)).status, 200, u);
    for (const who of ['ttvh', 'gdvh', 'staff', 'tivi']) assert.equal((await goi(who, u)).status, 403, `${who} ${u}`);
    assert.equal((await goi(null, u)).status, 401, u);
  }
  assert.equal((await goi('admin', '/api/nap-nguon/luot/999999')).status, 404);
  // chỉ GET
  for (const u of urls) {
    const x = await fetch(`${ctx.baseUrl}${u}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.ok([404, 405].includes(x.status), `POST ${u} -> ${x.status}`);
  }
});

test('tham số sai -> 400 có mã: lưới (thiếu / sai ngày, tu > den, quá 62 ngày, mã BCVH lạ, tham số lạ), /o (thiếu bcvh, dot lạ, ngày sai), lượt (trang, kích thước), mã lượt không phải số', async () => {
  const sai = async (u) => { const r = await goi('admin', u); assert.deepEqual([r.status, r.body && r.body.ma], [400, 'THAM_SO_SAI'], u); };
  for (const u of ['/api/nap-nguon/luoi', '/api/nap-nguon/luoi?tu=2026-10-12', '/api/nap-nguon/luoi?tu=2026-10-12&den=2026-02-30', '/api/nap-nguon/luoi?tu=12/10/2026&den=2026-10-13',
    '/api/nap-nguon/luoi?tu=2026-10-14&den=2026-10-12', '/api/nap-nguon/luoi?tu=2026-01-01&den=2026-03-04', `/api/nap-nguon/luoi?tu=2026-10-12&den=2026-10-13&bcvh=000000`,
    '/api/nap-nguon/luoi?tu=2026-10-12&den=2026-10-13&x=1', '/api/nap-nguon/tong-quan?x=1',
    '/api/nap-nguon/o', `/api/nap-nguon/o?bcvh=${BC.TH}&ngay=2026-10-12`, `/api/nap-nguon/o?bcvh=${BC.TH}&ngay=2026-10-12&dot=X`, `/api/nap-nguon/o?bcvh=${BC.TH}&ngay=nope&dot=S`, '/api/nap-nguon/o?bcvh=1&ngay=2026-10-12&dot=S',
    '/api/nap-nguon/luot?trang=0', '/api/nap-nguon/luot?trang=abc', '/api/nap-nguon/luot?kich_thuoc=0', '/api/nap-nguon/luot?kich_thuoc=101', '/api/nap-nguon/luot?kich_thuoc=-1', '/api/nap-nguon/luot/abc', '/api/nap-nguon/luot/1.5']) {
    await sai(u);
  }
  // đúng 62 ngày còn được; 63 ngày bị từ chối
  assert.equal((await goi('admin', '/api/nap-nguon/luoi?tu=2026-08-14&den=2026-10-14')).status, 200);
  assert.equal(soNgayTest('2026-08-14', '2026-10-14'), 62);
  assert.equal((await goi('admin', '/api/nap-nguon/luoi?tu=2026-08-13&den=2026-10-14')).status, 400);
});
const soNgayTest = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

test('CHỈ ĐỌC: số dòng và nội dung mọi bảng trước = sau khi gọi cả năm đầu API (kể cả lỗi)', async () => {
  fileDb({ bcvh: BC.TH, ngay: '2026-10-12' });
  nguon({ bcvh: BC.TH, ngay: '2026-10-12' });
  fileLuot(luot(), ten(BC.TH, '2026-10-12', '093012'));
  const bang = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((x) => x.name);
  const chup = () => JSON.stringify(bang.filter((t) => t !== 'users').map((t) => [t, ctx.db.prepare(`SELECT * FROM "${t}"`).all()]));
  const truoc = chup();
  for (const u of [...DUONG_DAN, '/api/nap-nguon/luoi?tu=x', '/api/nap-nguon/luot/99999']) await goi('admin', u);
  N.luoi({ db: ctx.db, now: NOW, tu: '2026-10-01', den: '2026-10-14' });
  assert.equal(chup(), truoc);
  assert.ok(bang.includes('arrival_items'));
});

test('không lộ bí mật: đặt SFTP_HOST / USER / PASSWORD giả rồi quét mọi phản hồi (kể cả chuỗi lỗi chứa chúng và số dài); không trả host, cổng, thư mục nguồn, vân tay', async () => {
  const luu = {};
  const gia = { SFTP_HOST: 'nas-bi-mat.noi-bo.example', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-bi-mat', SFTP_PASSWORD: 'mat-khau-bi-mat', SFTP_DIRS: '/thu-muc-nguon-bi-mat', SFTP_HOSTKEY_SHA256: 'b'.repeat(64) };
  for (const k of Object.keys(gia)) { luu[k] = process.env[k]; process.env[k] = gia[k]; }
  try {
    const n = '2026-10-12';
    fileDb({ bcvh: BC.TH, ngay: n, gio: '093012', status: 'REJECTED', error: `Lỗi mat-khau-bi-mat từ nguoi-dung-bi-mat@nas-bi-mat.noi-bo.example mã ${'1234567890'.repeat(2)}`, rows: 0 });
    nguon({ bcvh: BC.TH, ngay: n, gio: '093012' });
    const r = luot({ loi: 1, ghiChu: `Không kết nối được nas-bi-mat.noi-bo.example: mat-khau-bi-mat ${'1234567890'.repeat(2)}` });
    fileLuot(r, ten(BC.TH, n, '093012'), { ketQua: 'LOI', soDong: null, maLoi: 'REJECTED', chiTiet: `đăng nhập nguoi-dung-bi-mat thất bại mat-khau-bi-mat ${'1234567890'.repeat(2)}` });
    const toan = [];
    for (const u of [...DUONG_DAN.slice(0, 4), `/api/nap-nguon/luot/${r}`, `/api/nap-nguon/o?bcvh=${BC.TH}&ngay=${n}&dot=S`]) {
      const x = await goi('admin', u);
      assert.equal(x.status, 200, u);
      toan.push(JSON.stringify(x.body));
    }
    const s = toan.join('\n');
    for (const bm of ['mat-khau-bi-mat', 'nguoi-dung-bi-mat', 'nas-bi-mat', 'thu-muc-nguon-bi-mat', 'b'.repeat(64), '5454']) assert.ok(!s.includes(bm), `lộ ${bm}`);
    assert.ok(!/\d{15,}/.test(s), 'không có dãy ≥ 15 chữ số');
    const tq = JSON.parse(toan[0]);
    assert.deepEqual(Object.keys(tq.tu_dong).sort(), ['bat', 'chu_ky_phut', 'loi_luc', 'luot_ke_tiep_luc', 'ly_do_tam_dung', 'so_thu_muc', 'trang_thai']);
    assert.equal(tq.tu_dong.so_thu_muc, 1, 'chỉ số đếm thư mục');
    assert.equal(tq.tu_dong.trang_thai, 'TAT', 'hẹn giờ không chạy trong test');
  } finally {
    for (const k of Object.keys(gia)) { if (luu[k] === undefined) delete process.env[k]; else process.env[k] = luu[k]; }
  }
});

test('route lưới: lọc theo bcvh; ngày mặc định hợp lệ; phản hồi có đủ khoá và không có dãy ≥ 15 chữ số', async () => {
  fileDb({ bcvh: BC.TH, ngay: '2026-10-12' });
  const r = await goi('admin', `/api/nap-nguon/luoi?tu=2026-10-12&den=2026-10-13&bcvh=${BC.TH}`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ['tu', 'den', 'bcvh', 'hom_nay', 'ds_bcvh', 'gio_mong_doi', 'o', 'ngay_bcvh', 'can_xu_ly', 'tong_hop']);
  assert.equal(r.body.o.length, 4);
  assert.ok(r.body.o.every((x) => x.bcvh === BC.TH));
  assert.deepEqual(r.body.ds_bcvh, [{ ma: BC.TH, ten: 'BCVH Thuận Hóa' }]);
  assert.deepEqual(Object.keys(r.body.o[0]), ['bcvh', 'ngay', 'dot', 'trang_thai', 'ly_do', 'nghi_ngo', 'nguon_co_file', 'chi_tiet']);
  assert.ok(!/\d{15,}/.test(JSON.stringify(r.body)));
  const tong = await goi('admin', '/api/nap-nguon/luoi?tu=2026-10-12&den=2026-10-13');
  assert.equal(tong.body.o.length, 2 * 6 * 2);
  assert.deepEqual(tong.body.ds_bcvh.map((x) => x.ma), Object.values(BC).sort((a, b) => ['533140', '535470', '536250', '537015', '537220', '535790'].indexOf(a) - ['533140', '535470', '536250', '537015', '537220', '535790'].indexOf(b)));
});

// =====================================================================
// HIỆU NĂNG
// =====================================================================
test('đo thời gian lưới 62 ngày × 6 BCVH × 2 đợt trên DB giả ~150.000 dòng arrival_items (báo số, không đặt ngưỡng cứng)', async (t) => {
  const insF = ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, status, source) VALUES (?, ?, ?, ?, 1, ?, ?, 'OK', ?)");
  const insI = ctx.db.prepare('INSERT INTO arrival_items (import_file_id, tracking_no, bd8_no, receiver_code, arrival_date) VALUES (?, ?, ?, ?, ?)');
  const insN = ctx.db.prepare("INSERT INTO sftp_source_files (thu_muc, ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, giu_nguyen_tu, con_tren_nguon) VALUES ('/x', ?, 1, 1, 'a', 'b', 'a', 1)");
  const insS = ctx.db.prepare("INSERT INTO sftp_sync_files (run_id, thu_muc, ten_file, ket_qua) VALUES (?, '/x', ?, 'DA_NAP')");
  const run = luot();
  let nFile = 0;
  ctx.db.transaction(() => {
    for (let d = 0; d < 62 + 28; d++) {
      const ngay = S.congNgay('2026-07-15', d);
      for (const ma of Object.values(BC)) {
        for (const gio of ['093012', '163011']) {
          const id = insF.run(ma, ten(ma, ngay, gio), ngay, `${gio.slice(0, 2)}:${gio.slice(2, 4)}:${gio.slice(4, 6)}`, `p${nFile++}`, 100 + (d % 7) * 20, 'SFTP').lastInsertRowid;
          if (nFile % 7 === 0) for (let i = 0; i < 1000; i++) insI.run(id, `ZY${nFile}X${i}`, `q${i}`, ma, ngay);
          insN.run(ten(ma, ngay, gio));
          insS.run(run, ten(ma, ngay, gio));
        }
      }
    }
  })();
  const dong = ctx.db.prepare('SELECT COUNT(*) AS n FROM arrival_items').get().n;
  const t0 = process.hrtime.bigint();
  const kq = N.luoi({ db: ctx.db, now: NOW, tu: '2026-08-14', den: '2026-10-14' });
  const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
  t.diagnostic(`ĐO lưới 62 ngày: ${ms} ms (${kq.o.length} ô; arrival_items ${dong} dòng; ${nFile} file; JSON ${Math.round(JSON.stringify(kq).length / 1024)} KB)`);
  assert.equal(kq.o.length, 62 * 6 * 2);
  const t1 = process.hrtime.bigint();
  const r = await goi('admin', '/api/nap-nguon/luoi?tu=2026-08-14&den=2026-10-14');
  t.diagnostic(`ĐO qua HTTP: ${Number((process.hrtime.bigint() - t1) / 1000000n)} ms`);
  assert.equal(r.status, 200);
  const t2 = process.hrtime.bigint();
  N.mot({ db: ctx.db, now: NOW, bcvh: BC.TH, ngay: '2026-10-01', dot: 'S' });
  t.diagnostic(`ĐO một ô: ${Number((process.hrtime.bigint() - t2) / 1000000n)} ms`);
});

// =====================================================================
// KIỂM TĨNH
// =====================================================================
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kiểm tĩnh: lõi không có câu lệnh ghi SQL (kể cả trong chú thích), không nạp thư viện SFTP, không mở DB; route chỉ khai báo GET và dùng requireAdmin', () => {
  const raw = doc('server', 'lib', 'napNguonDoc.js');
  assert.ok(!/INSERT|UPDATE|DELETE|ALTER|CREATE/i.test(raw), 'lõi không chứa INSERT / UPDATE / DELETE / ALTER / CREATE');
  assert.ok(!raw.includes('ssh2') && !/require\(['"]\.\.?\/(db|sftpConnect)/.test(raw));
  const sql = [...boChuThich(raw).matchAll(/prepare\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/g)].map((m) => m[1].trim().toUpperCase());
  assert.ok(sql.length >= 8 && sql.every((x) => x.startsWith('SELECT')), sql.map((x) => x.slice(0, 30)).join(' | '));
  const rt = boChuThich(doc('server', 'routes', 'napNguon.js'));
  const lenh = [...rt.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'(?:\s*,\s*(\w+))?/g)];
  assert.equal(lenh.length, 5);
  assert.ok(lenh.every((m) => m[1] === 'get' && m[2].startsWith('/nap-nguon/') && m[3] === 'requireAdmin'), JSON.stringify(lenh.map((m) => m.slice(1))));
  assert.ok(!/prepare|\.run\(|\.exec\(/.test(rt), 'route không chạm DB trực tiếp ngoài lõi');
  assert.ok(/napNguonRoutes/.test(doc('server', 'index.js')));
  for (const f of ['arrivalsImport.js', 'sftpSync.js', 'sftpScheduler.js', 'sftpConnect.js', 'thayTheXemTruoc.js', 'thayTheThucHien.js']) assert.ok(!doc('server', 'lib', f).includes('napNguonDoc'), f);
});
