// ==========================================
// Test KTT-6: đường nạp TỰ ĐỘNG «Hàng tại KTT» qua SFTP — ghép cặp, nạp cả cặp một giao dịch, chạy lại an toàn, nhật ký / độ mới / cảnh báo,
// hẹn giờ, API ADMIN (server/lib/kttNapCap.js, server/lib/kttSftp.js, server/routes/kttNap.js).
// Server thật trên DB tạm của harness; máy chủ SFTP GIẢ (không mạng, không ssh2), đồng hồ GIẢ, CSV GIẢ (mã KTT-DEMO-xxxx, bưu cục 599xxx).
// Không mở data/, không đọc .env, không SFTP thật.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Ktt = require('../server/lib/kttSftp');
const Sch = require('../server/lib/sftpScheduler');
const KN = require('../server/config/ktt-nap');
const I = require('../server/lib/kttImport');

const PORT = 5934;
const DIR = '/CSV_Report_530100';
let ctx; let db; let workDir; let n = 0; let seq = 0;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT6_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT6_TTVH', pass: 'Ttvh@123', role: 'TTVH' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-ktt-sftp-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-sftp-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Ktt.stopKttScheduler();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
  fs.rmSync(workDir, { recursive: true, force: true });
});
beforeEach(() => { db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap; DELETE FROM ktt_nguon_file; DELETE FROM ktt_nap_lan;'); });

// ---------- dữ liệu giả ----------
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const NGUON = '2026-10-20 09:00:00.000';
function tui(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020', Tui_MailTripNumber: '3', Tui_PostBagIndex: String(++seq),
    So_hieu_BD8: `KTT-DEMO-${seq}`, Chieu: 'DEN', Dich_nhom: 'BCVH_HUE', Luong: 'KHAI_THAC_DEN', Ten_dich_vu: 'Dịch vụ, "giả"',
    BD10_den_XND: '2026-10-19 07:10:05.123', Gio_quet_tui_den: '2026-10-19 07:00:00.000', BD10_di_gio_di: '', Nguon_xuat_luc: NGUON, ...o
  };
}
function bg(o = {}) {
  return {
    Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020', Tui_MailTripNumber: '3', Tui_PostBagIndex: '1',
    SHBG: `KTT-DEMO-${String(++seq).padStart(5, '0')}`, Khoi_luong_thuc_te: '250', Ma_Xa_Phuong: '99001', TI_den_theo_tui_luc: '2026-10-19 07:30:00.000', Nguon_xuat_luc: NGUON, ...o
  };
}
/** Ghi CSV kiểu SSMS (BOM, nháy kép, CRLF). rows rỗng -> file chỉ có BOM (hoặc 0 byte nếu opts.khong). */
function ghi(dir, ten, rows, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, ten);
  if (!rows.length) fs.writeFileSync(f, opts.khong ? '' : '﻿');
  else {
    const cols = opts.cols || Object.keys(rows[0]);
    fs.writeFileSync(f, '﻿' + [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n');
  }
  return f;
}
const tenT = (khoa) => `KTT_Tui_${khoa}.csv`;
const tenB = (khoa) => `KTT_BuuGui_${khoa}.csv`;
const nguonCua = (khoa) => `${khoa.slice(0, 4)}-${khoa.slice(4, 6)}-${khoa.slice(6, 8)} ${khoa.slice(9, 11)}:${khoa.slice(11, 13)}:${khoa.slice(13, 15)}`;
/** Dựng một cặp trên đĩa. tr / br: mảng dòng (hoặc null = dùng tr). o.thuMuc: nơi ghi. */
function cap(khoa, tr, br, o = {}) {
  const dir = o.thuMuc || path.join(workDir, `c${++n}`);
  const ft = ghi(dir, tenT(khoa), tr, o.t);
  const fb = ghi(dir, tenB(khoa), br, o.b);
  return { khoa, nguonTen: nguonCua(khoa), tui: { path: ft, name: tenT(khoa), size: fs.statSync(ft).size, mtime: 1 }, buuGui: { path: fb, name: tenB(khoa), size: fs.statSync(fb).size, mtime: 1 } };
}
const dem = (b) => db.prepare(`SELECT COUNT(*) c FROM ${b}`).get().c;
const hangCap = (khoa) => db.prepare('SELECT * FROM ktt_nap_cap WHERE khoa_cap = ?').get(khoa);
const NOW = new Date(Date.UTC(2026, 9, 20, 3, 0, 0)); // 10:00 giờ VN ngày 20/10/2026

// ---------- nạp một cặp ----------
test('cặp đủ: nạp OK trong một giao dịch, nhật ký cặp có tên file, nguon_xuat_luc, giờ nhỏ nhất / lớn nhất và số đếm; độ mới = nguon_xuat_luc lớn nhất của cặp OK', () => {
  const t1 = tui({ Gio_quet_tui_den: '2026-10-19 06:00:00' }); const t2 = tui({ Gio_quet_tui_den: '2026-10-19 08:00:00' });
  const r = K.napCap(db, cap('20261020_090000', [t1, t2], [bg(), bg(), bg()]), { now: NOW });
  assert.equal(r.ketQua, 'OK');
  const h = hangCap('20261020_090000');
  assert.deepEqual([h.ket_qua, h.ten_file_tui, h.ten_file_buu_gui, h.nguon_xuat_luc], ['OK', tenT('20261020_090000'), tenB('20261020_090000'), '2026-10-20 09:00:00']);
  assert.deepEqual([h.tui_doc, h.tui_them, h.tui_cap_nhat, h.tui_bo_qua, h.tui_loi, h.bg_doc, h.bg_them], [2, 2, 0, 0, 0, 3, 3]);
  assert.equal(h.gio_min, '2026-10-19 06:00:00'); assert.ok(h.gio_max >= '2026-10-19 08:00:00');
  assert.equal(h.sha_tui.length, 64);
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan')], [2, 3, 2]);
  assert.equal(K.docDoMoi(db).nguon_xuat_luc, '2026-10-20 09:00:00');
  K.napCap(db, cap('20261020_150000', [tui({ Nguon_xuat_luc: '2026-10-20 15:00:00' })], [bg({ Nguon_xuat_luc: '2026-10-20 15:00:00' })]), { now: NOW });
  assert.equal(K.docDoMoi(db).nguon_xuat_luc, '2026-10-20 15:00:00', 'độ mới theo nguon_xuat_luc lớn nhất của cặp OK');
});

test('nạp lại CÙNG cặp (cùng nội dung): số dòng không đổi, kết quả DA_NAP, nhật ký giữ nguyên số đếm của lần đầu', () => {
  const tr = [tui(), tui()]; const br = [bg(), bg()];
  K.napCap(db, cap('20261020_090000', tr, br), { now: NOW });
  const truoc = [dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan'), dem('ktt_nap_cap')];
  const r = K.napCap(db, cap('20261020_090000', tr, br), { now: NOW });
  assert.equal(r.ketQua, 'DA_NAP');
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan'), dem('ktt_nap_cap')], truoc);
  assert.equal(hangCap('20261020_090000').tui_them, 2);
});

test('lần 2 cập nhật dòng của lần 1 (09:00 chưa có giờ đi, 15:00 đã có); file CŨ đến muộn KHÔNG ghi đè', () => {
  const goc = tui({ BD10_di_gio_di: '' });
  K.napCap(db, cap('20261020_090000', [goc], [bg({ Tui_PostBagIndex: goc.Tui_PostBagIndex })]), { now: NOW });
  assert.equal(db.prepare('SELECT bd10_di_gio_di FROM ktt_tui').get().bd10_di_gio_di, null);
  const moi = { ...goc, BD10_di_gio_di: '2026-10-20 11:30:00', Nguon_xuat_luc: '2026-10-20 15:00:00' };
  K.napCap(db, cap('20261020_150000', [moi], [bg({ Tui_PostBagIndex: goc.Tui_PostBagIndex, Nguon_xuat_luc: '2026-10-20 15:00:00' })]), { now: NOW });
  assert.equal(dem('ktt_tui'), 1);
  assert.deepEqual([hangCap('20261020_150000').tui_cap_nhat, hangCap('20261020_150000').tui_them], [1, 0]);
  const r = db.prepare('SELECT bd10_di_gio_di, nguon_xuat_luc FROM ktt_tui').get();
  assert.deepEqual({ ...r }, { bd10_di_gio_di: '2026-10-20 11:30:00', nguon_xuat_luc: '2026-10-20 15:00:00' });
  // cặp 09:00 bản KHÁC (sửa) đến muộn sau cặp 15:00: nguồn cũ hơn -> không ghi đè, chỉ đếm bỏ qua
  const muon = { ...goc, BD10_di_gio_di: '', Ten_dich_vu: 'Bản cũ đến muộn' };
  K.napCap(db, cap('20261020_100000', [{ ...muon, Nguon_xuat_luc: '2026-10-20 10:00:00' }], []), { now: NOW });
  const sau = db.prepare('SELECT bd10_di_gio_di, ten_dich_vu FROM ktt_tui').get();
  assert.deepEqual({ ...sau }, { bd10_di_gio_di: '2026-10-20 11:30:00', ten_dich_vu: 'Dịch vụ, "giả"' });
  assert.equal(hangCap('20261020_100000').tui_bo_qua, 1);
});

test('cùng TÊN khác nội dung (sha256 khác): TỪ CHỐI, không đổi dữ liệu, giữ dòng OK, mở cảnh báo; cùng tên cùng nội dung (bản sao ở nơi khác): DA_NAP', () => {
  const tr = [tui()]; const br = [bg()];
  K.napCap(db, cap('20261020_090000', tr, br), { now: NOW });
  const truoc = [dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan')];
  const r = K.napCap(db, cap('20261020_090000', [...tr, tui()], br), { now: NOW });
  assert.equal(r.ketQua, 'TU_CHOI'); assert.equal(r.ma, 'TRUNG_TEN_KHAC_NOI_DUNG');
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan')], truoc);
  assert.equal(hangCap('20261020_090000').ket_qua, 'OK', 'dòng OK không bị đè (giữ độ mới)');
  const bien = db.prepare("SELECT * FROM ktt_nap_cap WHERE ket_qua = 'TU_CHOI'").all();
  assert.equal(bien.length, 1); assert.match(bien[0].thong_bao, /KTT_Tui_20261020_090000\.csv/);
  const cb = K.canhBao(db, NOW).filter((x) => x.ma === 'CAP_TU_CHOI');
  assert.equal(cb.length, 1); assert.equal(cb[0].khoa_cap, '20261020_090000');
  assert.equal(K.napCap(db, cap('20261020_090000', tr, br), { now: NOW }).ketQua, 'DA_NAP');
});

test('file RỖNG (chỉ BOM hoặc 0 byte) hợp lệ: cặp OK với 0 dòng, nguon_xuat_luc lấy từ tên file; cặp rỗng chạy lại là DA_NAP', () => {
  const r = K.napCap(db, cap('20261020_090000', [], [], { b: { khong: true } }), { now: NOW });
  assert.equal(r.ketQua, 'OK');
  const h = hangCap('20261020_090000');
  assert.deepEqual([h.tui_doc, h.bg_doc, h.nguon_xuat_luc, h.gio_min], [0, 0, '2026-10-20 09:00:00', null]);
  assert.equal(K.docDoMoi(db).nguon_xuat_luc, '2026-10-20 09:00:00');
  assert.equal(K.napCap(db, cap('20261020_090000', [], [], { b: { khong: true } }), { now: NOW }).ketQua, 'DA_NAP');
});

test('BOM, nháy kép, dấu phẩy trong ô, CRLF: đọc đúng; tiêu đề trên một file và ô có dấu phẩy không làm lệch cột', () => {
  const t = tui({ Ten_dich_vu: 'A, "B", C' });
  K.napCap(db, cap('20261020_090000', [t], [bg()]), { now: NOW });
  assert.equal(db.prepare('SELECT ten_dich_vu FROM ktt_tui').get().ten_dich_vu, 'A, "B", C');
});

test('khóa túi 7 phần và khóa bưu gửi (+ SHBG chuẩn hóa HOA, Ð -> Đ, trim); khóa trùng TRONG file: dòng sau thay dòng trước, đếm ở trung', () => {
  const a = bg({ SHBG: ' ktt-demo-đ1 ' }); const b = bg({ SHBG: 'KTT-DEMO-Ð1', Khoi_luong_thuc_te: '999' });
  K.napCap(db, cap('20261020_090000', [tui({ Tui_PostBagIndex: '77' }), tui({ Tui_PostBagIndex: '77', Ten_dich_vu: 'Dòng sau' })], [a, b]), { now: NOW });
  assert.equal(dem('ktt_tui'), 1); assert.equal(dem('ktt_buu_gui'), 1);
  assert.equal(db.prepare('SELECT shbg FROM ktt_buu_gui').get().shbg, 'KTT-DEMO-Đ1');
  assert.equal(db.prepare('SELECT khoi_luong_thuc_te_g FROM ktt_buu_gui').get().khoi_luong_thuc_te_g, 999);
  assert.equal(db.prepare('SELECT ten_dich_vu FROM ktt_tui').get().ten_dich_vu, 'Dòng sau');
  const h = hangCap('20261020_090000');
  assert.deepEqual([h.tui_trung, h.tui_them, h.tui_cap_nhat, h.bg_trung, h.bg_them], [1, 1, 0, 1, 1]);
});

test('dòng đã có trong cửa sổ [giờ trong tên file - 7 ngày, giờ trong tên file] mà KHÔNG còn trong ảnh chụp mới: chỉ ĐẾM, không xóa; túi trong cửa sổ nếu MỘT trong bốn cột giờ nằm trong cửa sổ; bưu gửi theo túi chứa nó', () => {
  const NGOAI = { Gio_quet_tui_den: '2026-09-01 07:00:00', BD10_den_XND: '2026-09-01 07:10:00', Gio_quet_tui_di: '', BD10_di_gio_di: '' };
  const a = tui({ Gio_quet_tui_di: '' }); // còn trong ảnh chụp mới (dòng đầu quyết định tiêu đề: có cột Gio_quet_tui_di)
  const b = tui(); // trong cửa sổ (quét đến + XNĐ), vắng ở ảnh chụp mới
  const xa = tui({ ...NGOAI }); // cả bốn cột ngoài cửa sổ
  const chiDi = tui({ ...NGOAI, BD10_di_gio_di: '2026-10-18 10:00:00' }); // chỉ bd10_di_gio_di trong cửa sổ
  const chiQuetDi = tui({ ...NGOAI, Gio_quet_tui_di: '2026-10-18 11:00:00' }); // chỉ gio_quet_tui_di trong cửa sổ
  const chiXnd = tui({ ...NGOAI, BD10_den_XND: '2026-10-18 12:00:00' }); // chỉ bd10_den_xnd trong cửa sổ
  const luu = (x) => ({ Tui_PostBagIndex: x.Tui_PostBagIndex });
  const bgB = bg({ ...luu(b), TI_den_theo_tui_luc: '2026-09-01 00:00:00' }); // túi trong cửa sổ, ti_den_theo_tui_luc NGOÀI: vẫn đếm
  const bgXa = bg({ ...luu(xa), TI_den_theo_tui_luc: '2026-10-19 07:30:00' }); // túi ngoài cửa sổ, ti_den_theo_tui_luc TRONG: không đếm
  const bgChiDi = bg({ ...luu(chiDi) });
  const bgMoCoi = bg({ Tui_PostBagIndex: 'KHONG-CO-TUI' }); // chưa có túi trong DB: không đếm
  K.napCap(db, cap('20261020_090000', [a, b, xa, chiDi, chiQuetDi, chiXnd], [bg(luu(a)), bgB, bgXa, bgChiDi, bgMoCoi]), { now: NOW });
  K.napCap(db, cap('20261020_150000', [{ ...a, Nguon_xuat_luc: '2026-10-20 15:00:00' }], [{ ...bg(luu(a)), Nguon_xuat_luc: '2026-10-20 15:00:00' }]), { now: NOW });
  const h = hangCap('20261020_150000');
  assert.equal(h.tui_khong_con, 4, 'b, chiDi, chiQuetDi, chiXnd (a còn; xa ngoài cửa sổ)');
  assert.equal(h.bg_khong_con, 3, 'bưu gửi cũ của túi a (ảnh chụp mới có bưu gửi khác), bgB, bgChiDi; không đếm bgXa (túi ngoài cửa sổ), bgMoCoi (không có túi)');
  assert.equal(dem('ktt_tui'), 6, 'không xóa dòng nào');
  // cửa sổ theo GIỜ TRONG TÊN FILE: cặp tên 20261026_090000 -> [19/10 09:00, 26/10 09:00]; mọi túi cũ (quét đến / XNĐ ≤ 19/10 07:10, các giờ đi ≤ 18/10) đã ra ngoài cửa sổ nên không đếm
  K.napCap(db, cap('20261026_090000', [{ ...a, Nguon_xuat_luc: '2026-10-26 09:00:00' }], [], { b: { khong: true } }), { now: NOW });
  assert.equal(hangCap('20261026_090000').tui_khong_con, 0);
});

test('một file sai cột: HOÀN TÁC CẢ CẶP (túi không vào dù file túi đúng), ghi nhật ký TỪ CHỐI chỉ nêu tên file / cột; sửa file thì nạp được', () => {
  const tr = [tui(), tui()];
  const hong = bg(); delete hong.Tui_PostBagIndex;
  const r = K.napCap(db, cap('20261020_090000', tr, [hong]), { now: NOW });
  assert.equal(r.ketQua, 'TU_CHOI'); assert.equal(r.ma, 'FILE_SAI');
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui'), dem('ktt_nap_lan')], [0, 0, 0]);
  const h = hangCap('20261020_090000');
  assert.equal(h.ket_qua, 'TU_CHOI'); assert.match(h.thong_bao, /KTT_BuuGui_20261020_090000\.csv.*Tui_PostBagIndex/);
  assert.equal(K.napCap(db, cap('20261020_090000', tr, [bg()]), { now: NOW }).ketQua, 'OK');
  assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui')], [2, 1]);
  assert.equal(hangCap('20261020_090000').ket_qua, 'OK');
});

test('cặp 30 ngày (lịch sử) nạp được qua cùng đường; dòng quá cửa sổ 7 ngày không bị đếm «không còn»', () => {
  const rows = Array.from({ length: 300 }, (_, i) => tui({ Gio_quet_tui_den: `2026-09-${String(22 + (i % 8)).padStart(2, '0')} 07:00:00` }));
  const r = K.napCap(db, cap('20261024_090000', rows.map((x) => ({ ...x, Nguon_xuat_luc: '2026-10-24 09:00:00' })), [bg({ Nguon_xuat_luc: '2026-10-24 09:00:00' })]), { now: NOW });
  assert.equal(r.ketQua, 'OK'); assert.equal(dem('ktt_tui'), 300);
  assert.equal(hangCap('20261024_090000').tui_khong_con, 0);
});

test('tên file: phanTichTenKtt chỉ nhận mẫu đúng và ngày giờ có thật', () => {
  assert.deepEqual(K.phanTichTenKtt('KTT_Tui_20261020_090000.csv'), { loai: 'TUI', khoa: '20261020_090000', nguon: '2026-10-20 09:00:00' });
  assert.equal(K.phanTichTenKtt('KTT_BuuGui_20261020_150000.csv').loai, 'BUU_GUI');
  for (const x of ['KTT_Tui_20261320_090000.csv', 'KTT_Tui_20261020_250000.csv', 'KTT_Tui_20260230_090000.csv', 'KTT_Tui_20261020_090000.CSV', 'HangDen_533140_20261020_093012.csv', 'KTT_X_20261020_090000.csv', 'KTT_Tui_20261020_090000.csv.tmp']) assert.equal(K.phanTichTenKtt(x), null, x);
});

// ---------- SQLITE_BUSY ----------
test('SQLITE_BUSY: thử lại có giới hạn (3 lần, chờ 2 / 5 / 10 giây), cạn thì ném; lỗi khác không thử lại', async () => {
  const cho = [];
  let lan = 0;
  const busy = () => { const e = new Error('database is locked'); e.code = 'SQLITE_BUSY'; return e; };
  assert.equal(await Ktt.thuLaiKhiBusy(() => { if (++lan < 3) throw busy(); return 'xong'; }, async (ms) => cho.push(ms), () => {}), 'xong');
  assert.deepEqual(cho, [2000, 5000]);
  lan = 0;
  await assert.rejects(Ktt.thuLaiKhiBusy(() => { lan++; throw busy(); }, async () => {}, () => {}), (e) => e.code === 'SQLITE_BUSY');
  assert.equal(lan, 4);
  lan = 0;
  await assert.rejects(Ktt.thuLaiKhiBusy(() => { lan++; throw new Error('khác'); }, async () => {}, () => {}), /khác/);
  assert.equal(lan, 1);
});

// ---------- quét SFTP giả ----------
function nguonGia(files, { chan = null } = {}) {
  const calls = { list: 0, get: [], end: 0 };
  return {
    calls, files,
    async list() { calls.list++; if (chan) await chan; return Object.entries(files).map(([name, x]) => ({ type: '-', name, size: x.buf.length, modifyTime: x.mtime })); },
    async get(xa, cucBo) { const ten = xa.slice(xa.lastIndexOf('/') + 1); calls.get.push(ten); fs.writeFileSync(cucBo, files[ten].buf); },
    async end() { calls.end++; }
  };
}
const csvBuf = (rows) => Buffer.from('﻿' + [Object.keys(rows[0]).map(q).join(','), ...rows.map((r) => Object.keys(rows[0]).map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n');
const T0 = Date.UTC(2026, 9, 20, 2, 10, 0); // 09:10 VN
const MIN = 60000;
/** Một lượt quét tại thời điểm `ms`. */
const quet = (client, ms, o = {}) => Ktt.quetMotLan({ client, db, thuMuc: DIR, now: () => new Date(ms), sleep: async () => {}, tmpDir: workDir, onDinhGiay: 60, ...o });
const tmpSach = () => fs.readdirSync(workDir).filter((x) => x.startsWith('hue-dhcl-ktt-')).length === 0;

test('quét: một file đến trước -> CHỜ CẶP, KHÔNG nạp nửa cặp; file kia đến -> chờ ổn định (hai lượt) rồi nạp; lượt sau không tải lại', async () => {
  const k = '20261020_090000';
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 } };
  const c = nguonGia(files);
  let r = await quet(c, T0);
  assert.equal(r.dem.capChoCap, 1); assert.equal(c.calls.get.length, 0);
  assert.equal(hangCap(k).ket_qua, 'CHO_CAP'); assert.equal(dem('ktt_tui'), 0);
  r = await quet(c, T0 + 10 * MIN);
  assert.equal(c.calls.get.length, 0, 'vẫn chờ cặp');
  files[tenB(k)] = { buf: csvBuf([bg()]), mtime: 20 };
  r = await quet(c, T0 + 20 * MIN);
  assert.equal(r.dem.capChuaOnDinh, 1, 'file mới xuất hiện chưa ổn định'); assert.equal(dem('ktt_tui'), 0);
  r = await quet(c, T0 + 30 * MIN);
  assert.equal(r.dem.capNap, 1); assert.deepEqual(c.calls.get.sort(), [tenB(k), tenT(k)].sort());
  assert.equal(hangCap(k).ket_qua, 'OK'); assert.deepEqual([dem('ktt_tui'), dem('ktt_buu_gui')], [1, 1]);
  assert.ok(tmpSach(), 'xóa tệp tạm');
  r = await quet(c, T0 + 40 * MIN);
  assert.equal(r.dem.capDaCo, 1); assert.equal(c.calls.get.length, 2, 'không tải lại mỗi lượt');
});

test('quét: file đổi kích thước giữa hai lượt -> chưa ổn định, chưa nạp; file lạ / sai mẫu / thư mục bị bỏ qua và chỉ đếm', async () => {
  const k = '20261020_090000';
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([bg()]), mtime: 10 }, 'HangDen_533140_20261020_093012.csv': { buf: Buffer.from('x'), mtime: 1 }, 'ghi_chu.txt': { buf: Buffer.from('x'), mtime: 1 } };
  const c = nguonGia(files);
  await quet(c, T0);
  files[tenB(k)] = { buf: csvBuf([bg(), bg()]), mtime: 11 };
  let r = await quet(c, T0 + 10 * MIN);
  assert.equal(r.dem.capChuaOnDinh, 1); assert.equal(r.dem.fileLa, 2); assert.equal(c.calls.get.length, 0);
  r = await quet(c, T0 + 20 * MIN);
  assert.equal(r.dem.capNap, 1); assert.equal(dem('ktt_buu_gui'), 2);
});

test('quét: cặp lịch sử 30 ngày và cặp thường nạp theo thứ tự cũ trước; tối đa SO_CAP_TOI_DA_MOI_LUOT cặp mỗi lượt, phần còn lại hoãn sang lượt sau', async () => {
  const files = {};
  for (let i = 1; i <= 12; i++) {
    const k = `202610${String(i).padStart(2, '0')}_090000`;
    const ng = `2026-10-${String(i).padStart(2, '0')} 09:00:00`;
    files[tenT(k)] = { buf: csvBuf([tui({ Tui_PostBagIndex: `L${i}`, Nguon_xuat_luc: ng })]), mtime: i };
    files[tenB(k)] = { buf: csvBuf([bg({ Tui_PostBagIndex: `L${i}`, Nguon_xuat_luc: ng })]), mtime: i };
  }
  const c = nguonGia(files);
  await quet(c, T0);
  let r = await quet(c, T0 + 10 * MIN);
  assert.equal(r.dem.capNap, KN.SO_CAP_TOI_DA_MOI_LUOT); assert.equal(r.dem.capVuotToiDa, 12 - KN.SO_CAP_TOI_DA_MOI_LUOT);
  assert.deepEqual(r.cap.map((x) => x.khoa), Array.from({ length: KN.SO_CAP_TOI_DA_MOI_LUOT }, (_, i) => `202610${String(i + 1).padStart(2, '0')}_090000`), 'cũ trước');
  r = await quet(c, T0 + 20 * MIN);
  assert.equal(r.dem.capNap, 12 - KN.SO_CAP_TOI_DA_MOI_LUOT); assert.equal(dem('ktt_tui'), 12);
});

test('quét: cặp TỪ CHỐI (sai cột) không bị tải lại mỗi lượt; file sửa lại (đổi mtime) thì nạp được', async () => {
  const k = '20261020_090000';
  const hong = bg(); delete hong.SHBG;
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([hong]), mtime: 10 } };
  const c = nguonGia(files);
  await quet(c, T0);
  let r = await quet(c, T0 + 10 * MIN);
  assert.equal(r.dem.capTuChoi, 1); assert.equal(c.calls.get.length, 2); assert.equal(dem('ktt_tui'), 0);
  r = await quet(c, T0 + 20 * MIN);
  assert.equal(r.dem.capDaCo, 1); assert.equal(c.calls.get.length, 2, 'không tải lại');
  files[tenB(k)] = { buf: csvBuf([bg()]), mtime: 30 };
  await quet(c, T0 + 30 * MIN);
  r = await quet(c, T0 + 40 * MIN);
  assert.equal(r.dem.capNap, 1); assert.equal(hangCap(k).ket_qua, 'OK');
});

test('quét: SQLITE_BUSY kéo dài -> thử lại rồi ghi LỖI (không ném ra ngoài), thử lại ở lượt sau tối đa SO_LAN_THU_TOI_DA lần; hết bận thì nạp OK', async () => {
  const k = '20261020_090000';
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([bg()]), mtime: 10 } };
  const c = nguonGia(files);
  const cho = [];
  let ban = true;
  const napFn = (d, cp, o) => { if (ban) { const e = new Error('database is locked'); e.code = 'SQLITE_BUSY'; throw e; } return K.napCap(d, cp, o); };
  await quet(c, T0, { napFn });
  let r = await quet(c, T0 + 10 * MIN, { napFn, sleep: async (ms) => cho.push(ms) });
  assert.equal(r.dem.capLoi, 1); assert.deepEqual(cho, [2000, 5000, 10000]);
  const h = hangCap(k);
  assert.deepEqual([h.ket_qua, h.ma_loi, h.so_lan_thu], ['LOI', 'SQLITE_BUSY', 1]);
  assert.equal(K.canhBao(db, new Date(T0)).filter((x) => x.ma === 'CAP_LOI').length, 1);
  assert.equal(dem('ktt_tui'), 0); assert.ok(tmpSach());
  ban = false;
  r = await quet(c, T0 + 20 * MIN, { napFn });
  assert.equal(r.dem.capNap, 1); assert.equal(hangCap(k).ket_qua, 'OK'); assert.equal(hangCap(k).so_lan_thu, 0);
  // thử lại có giới hạn: lỗi mãi thì dừng sau SO_LAN_THU_TOI_DA lượt (cùng kích thước + mtime)
  const k2 = '20261020_150000';
  files[tenT(k2)] = { buf: csvBuf([tui({ Nguon_xuat_luc: '2026-10-20 15:00:00' })]), mtime: 11 }; files[tenB(k2)] = { buf: csvBuf([bg({ Nguon_xuat_luc: '2026-10-20 15:00:00' })]), mtime: 11 };
  ban = true;
  await quet(c, T0 + 30 * MIN, { napFn });
  const get0 = c.calls.get.length;
  for (let i = 0; i < KN.SO_LAN_THU_TOI_DA + 3; i++) await quet(c, T0 + (40 + i * 10) * MIN, { napFn });
  assert.equal(hangCap(k2).so_lan_thu, KN.SO_LAN_THU_TOI_DA);
  assert.equal(c.calls.get.length - get0, KN.SO_LAN_THU_TOI_DA * 2, 'mỗi lần thử tải hai file; dừng sau số lần tối đa');
});

test('quét: lỗi tải (kích thước lệch) ghi LOI không làm hỏng lượt; thông báo không lộ tên đăng nhập / mật khẩu', async () => {
  const k = '20261020_090000';
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([bg()]), mtime: 10 } };
  const c = nguonGia(files);
  c.get = async () => { throw new Error('mat-khau-gia loi tai'); };
  await quet(c, T0);
  const r = await quet(c, T0 + 10 * MIN, { bimat: ['mat-khau-gia'] });
  assert.equal(r.dem.capLoi, 1);
  assert.doesNotMatch(hangCap(k).thong_bao, /mat-khau-gia/); assert.ok(tmpSach());
});

// ---------- cảnh báo (a)–(d) bằng đồng hồ giả ----------
const gio = (s) => { const [d, t] = s.split(' '); const [y, mo, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(Date.UTC(y, mo - 1, dd, h - 7, mi, 0)); }; // giờ VN -> Date
const okCap = (nguon) => K.ghiCap(db, { khoa_cap: `${nguon.slice(0, 4)}${nguon.slice(5, 7)}${nguon.slice(8, 10)}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`, ket_qua: 'OK', nguon_xuat_luc: `${nguon}:00`, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
const maCb = (now) => K.canhBao(db, now).map((x) => x.ma);

test('cảnh báo (a) thiếu file: mới có một file, sau ngưỡng chờ (tham số) mới báo; chỉ nêu tên file và số phút', () => {
  const luc = gio('2026-10-20 15:05');
  K.ghiChoCap(db, { khoa: '20261020_150000', loai: 'TUI', ten: tenT('20261020_150000'), size: 5, mtime: 1, now: luc });
  okCap('2026-10-20 09:00'); okCap('2026-10-19 09:00'); okCap('2026-10-19 15:00');
  assert.ok(!maCb(gio('2026-10-20 15:30')).includes('THIEU_FILE'));
  assert.ok(!maCb(new Date(luc.getTime() + (KN.CHO_CAP_PHUT - 1) * MIN)).includes('THIEU_FILE'));
  const cb = K.canhBao(db, new Date(luc.getTime() + KN.CHO_CAP_PHUT * MIN)).find((x) => x.ma === 'THIEU_FILE');
  assert.deepEqual({ ...cb }, { ma: 'THIEU_FILE', khoa_cap: '20261020_150000', co_file: tenT('20261020_150000'), thieu: 'BUU_GUI', phut_cho: KN.CHO_CAP_PHUT });
});

test('cảnh báo (b) ngày đã qua có ít hơn 2 cặp OK: chỉ xét từ ngày có cặp OK đầu tiên; đủ cặp thì hết', () => {
  okCap('2026-10-18 09:00'); okCap('2026-10-18 15:00'); okCap('2026-10-19 09:00'); okCap('2026-10-20 09:00'); okCap('2026-10-20 15:00'); okCap('2026-10-21 09:00');
  const now = gio('2026-10-21 09:30');
  assert.deepEqual(K.canhBao(db, now).filter((x) => x.ma === 'THIEU_CAP_NGAY').map((x) => [x.ngay, x.so_cap_ok]), [['2026-10-19', 1]]);
  okCap('2026-10-19 15:00');
  assert.ok(!maCb(now).includes('THIEU_CAP_NGAY'));
  assert.ok(!maCb(gio('2026-10-18 20:00')).includes('THIEU_CAP_NGAY'), 'ngày đầu tiên (hôm nay) không xét; không có ngày trước đó');
});

test('cảnh báo (c) cặp TỪ CHỐI / LỖI: nêu tên file và mã, không có nội dung dòng; cặp đã sửa thì hết', () => {
  K.ghiLoiCap(db, { khoa: '20261020_090000', tui: { name: tenT('20261020_090000') }, buuGui: { name: tenB('20261020_090000'), path: 'x' } }, { ma: 'SQLITE_BUSY', thongBao: 'bận', now: NOW });
  const cb = K.canhBao(db, NOW).find((x) => x.ma === 'CAP_LOI');
  assert.deepEqual([cb.khoa_cap, cb.ten_file_tui, cb.ten_file_buu_gui, cb.ma_loi, cb.so_lan_thu], ['20261020_090000', tenT('20261020_090000'), tenB('20261020_090000'), 'SQLITE_BUSY', 1]);
  db.exec("UPDATE ktt_nap_cap SET ket_qua = 'OK'");
  assert.ok(!maCb(NOW).includes('CAP_LOI'));
  assert.ok(!JSON.stringify(K.canhBao(db, NOW)).includes('KTT-DEMO'));
});

test('cảnh báo (d) dữ liệu cũ: chỉ tính giờ trong khung 07:00–22:00; chưa có cặp OK nào cũng báo; qua đêm không tự báo sai', () => {
  assert.ok(maCb(gio('2026-10-20 10:00')).includes('DU_LIEU_CU'), 'chưa có cặp OK nào');
  okCap('2026-10-20 09:00');
  assert.ok(!maCb(gio('2026-10-20 18:59')).includes('DU_LIEU_CU'), '9 giờ 59 phút');
  const cu = K.canhBao(db, gio('2026-10-20 19:01')).find((x) => x.ma === 'DU_LIEU_CU');
  assert.deepEqual([cu.nguon_xuat_luc, cu.gio_trong_khung, cu.nguong_gio], ['2026-10-20 09:00:00', 10, KN.CU_GIO]);
  okCap('2026-10-20 15:00');
  assert.ok(!maCb(gio('2026-10-20 22:30')).includes('DU_LIEU_CU'), '15:00 -> 22:00 chỉ 7 giờ trong khung');
  assert.ok(!maCb(gio('2026-10-21 07:30')).includes('DU_LIEU_CU'), 'ban đêm không tính: 7 giờ 30 phút');
  assert.ok(!maCb(gio('2026-10-21 09:30')).includes('DU_LIEU_CU'), 'mặc định 10 giờ: 7 + 2,5 giờ, chưa báo (không báo sớm mỗi sáng khi cặp 09:00 sắp về)');
  assert.ok(maCb(gio('2026-10-21 10:05')).includes('DU_LIEU_CU'), 'quá 10 giờ trong khung mà cặp 09:00 vẫn chưa về');
});

test('phutTrongKhung: giờ trong khung qua nhiều ngày, không phụ thuộc múi giờ máy', () => {
  assert.equal(K.phutTrongKhung('2026-10-20 15:00:00', '2026-10-21 08:00:00', 7, 22), 7 * 60 + 60);
  assert.equal(K.phutTrongKhung('2026-10-20 23:00:00', '2026-10-21 06:00:00', 7, 22), 0);
  assert.equal(K.phutTrongKhung('2026-10-20 06:00:00', '2026-10-22 23:00:00', 7, 22), 3 * 15 * 60);
  assert.equal(K.nowVn(new Date(Date.UTC(2026, 9, 20, 18, 30, 0))), '2026-10-21 01:30:00');
});

// ---------- hẹn giờ ----------
function dongHoGia(batDau = T0) {
  let t = batDau; let id = 0; const hen = [];
  return {
    now: () => new Date(t),
    setTimeout: (fn, ms) => { const h = { id: ++id, at: t + ms, fn }; hen.push(h); return h; },
    clearTimeout: (h) => { const i = hen.indexOf(h); if (i >= 0) hen.splice(i, 1); },
    async tien(ms) {
      const dich = t + ms;
      for (;;) {
        const ke = hen.filter((h) => h.at <= dich).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!ke) break;
        hen.splice(hen.indexOf(ke), 1); t = Math.max(t, ke.at); await ke.fn();
      }
      t = dich;
    },
    soHen: () => hen.length
  };
}
const ENV = Object.freeze({ SFTP_SYNC_ENABLED: '1', SFTP_HOST: 'nas.gia.local', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_HOSTKEY_SHA256: 'a'.repeat(64), SFTP_STABLE_SECONDS: '60' });
function dung({ env = ENV, client = null, ketNoi = null, clock = dongHoGia(), logs = [], ...rest } = {}) {
  const ds = [];
  const b = Ktt.taoBoHenGioKtt({ db, env, clock, tmpDir: workDir, sleep: async () => {}, log: (m) => logs.push(m), choPhepTrongTest: true,
    hangDen: () => ({ trangThai: 'TAT' }), tamDungHangDen: () => false, ketNoi: ketNoi || (async (cfg) => { ds.push(cfg.dirs); return client; }), ...rest });
  b.batDau();
  return { b, clock, logs, ds };
}

test('hẹn giờ KTT: mặc định TẮT (chỉ "1" mới bật); KHÔNG chạy trong test / harness; không cần SFTP_DIRS; thư mục mặc định /CSV_Report_530100, đổi bằng SFTP_KTT_DIR', () => {
  for (const v of [undefined, '', '0', 'true', 'yes']) {
    const { b, clock, logs } = dung({ env: { ...ENV, SFTP_SYNC_ENABLED: v } });
    assert.equal(b.trangThai().trangThai, 'TAT'); assert.equal(clock.soHen(), 0); assert.equal(logs.length, 0);
  }
  const trong = Ktt.taoBoHenGioKtt({ db, env: { ...ENV, NODE_TEST_CONTEXT: '1' }, clock: dongHoGia(), log: () => {} });
  trong.batDau();
  assert.equal(trong.trangThai().trangThai, 'TAT'); assert.equal(trong.trangThai().lyDo, 'MOI_TRUONG_TEST');
  const { b, clock } = dung();
  assert.deepEqual([b.trangThai().trangThai, b.trangThai().thuMuc, clock.soHen(), b.trangThai().chuKyPhut], ['CHO', DIR, 1, KN.CHU_KY_QUET_PHUT]);
  assert.equal(Ktt.docCauHinhKtt({ ...ENV, SFTP_KTT_DIR: '/Khac_530100' }).thuMuc, '/Khac_530100');
  assert.equal(Ktt.docCauHinhKtt({ ...ENV, SFTP_DIRS: '/HangDen_Khac' }).thuMuc, DIR, 'không dùng SFTP_DIRS của Hàng đến');
  assert.equal(Sch.docTrangThaiSftp().trangThai !== 'DANG_CHAY', true);
  assert.deepEqual(Ktt.docCauHinhKtt({}), { bat: false });
});

test('hẹn giờ KTT: thiếu / sai cấu hình -> KHÔNG khởi động, KHÔNG ném lỗi, đúng MỘT dòng log chỉ nêu TÊN biến', () => {
  for (const k of ['SFTP_HOST', 'SFTP_USER', 'SFTP_PASSWORD', 'SFTP_HOSTKEY_SHA256']) {
    const env = { ...ENV }; delete env[k];
    const { b, clock, logs } = dung({ env });
    assert.equal(b.trangThai().trangThai, 'CAU_HINH_SAI', k); assert.equal(clock.soHen(), 0);
    assert.equal(logs.length, 1); assert.match(logs[0], new RegExp(k)); assert.doesNotMatch(logs[0], /nguoi-dung-gia|mat-khau-gia|nas\.gia\.local/);
  }
  const { b, logs } = dung({ env: { ...ENV, SFTP_KTT_DIR: 'khong-bat-dau-bang-gach' } });
  assert.equal(b.trangThai().trangThai, 'CAU_HINH_SAI'); assert.match(logs[0], /SFTP_KTT_DIR/);
});

test('hẹn giờ KTT: lượt đầu sau 45 giây, kết nối, quét, ngắt kết nối, hẹn lại theo tham số chu kỳ; không chạy chồng (khoá trong tiến trình)', async () => {
  const k = '20261020_090000';
  let mo; const chan = new Promise((r) => { mo = r; });
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([bg()]), mtime: 10 } };
  const client = nguonGia(files, { chan });
  const { b, clock, logs } = dung({ client });
  const chay = clock.tien(46000);
  await new Promise((r) => setImmediate(r));
  assert.equal(b.trangThai().trangThai, 'DANG_CHAY');
  const trung = await b.chayNgay();
  assert.equal(trung.ketQua, 'BI_KHOA_TIEN_TRINH');
  mo(); await chay;
  assert.equal(client.calls.end, 1); assert.equal(b.trangThai().trangThai, 'CHO');
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');
  assert.ok(logs.some((l) => /Quét xong/.test(l)));
  assert.ok(logs.every((l) => !/mat-khau-gia|nguoi-dung-gia/.test(l)));
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN); // lượt 2: file ổn định -> nạp
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN);
  assert.equal(hangCap(k).ket_qua, 'OK');
  await b.dung();
  assert.equal(clock.soHen(), 0);
});

test('hẹn giờ KTT: đang có lượt «Hàng đến» (khoá sftp_sync_runs) -> bỏ qua, không kết nối; hẹn giờ «Hàng đến» tạm dừng vì xác thực -> không kết nối', async () => {
  let ketNoiLan = 0;
  const { b } = dung({ ketNoi: async () => { ketNoiLan++; return nguonGia({}); } });
  db.prepare('INSERT INTO sftp_sync_runs (started_at, "trigger") VALUES (?, ?)').run(new Date(T0).toISOString(), 'TIMER');
  try {
    const r = await b.chayNgay();
    assert.equal(r.ketQua, 'BI_KHOA_DB'); assert.equal(ketNoiLan, 0);
  } finally { db.prepare('DELETE FROM sftp_sync_runs').run(); }
  const c2 = dung({ hangDen: () => ({ trangThai: 'TAM_DUNG' }), ketNoi: async () => { ketNoiLan++; return nguonGia({}); } });
  assert.equal((await c2.b.chayNgay()).ketQua, 'HANG_DEN_TAM_DUNG'); assert.equal(ketNoiLan, 0);
});

test('hẹn giờ KTT: lỗi mạng -> thử lại chu kỳ sau; lỗi XÁC THỰC / VÂN TAY -> TẠM DỪNG (và báo «Hàng đến» tạm dừng), không tự thử lại', async () => {
  let lan = 0; const baoHd = [];
  const { b, clock } = dung({ ketNoi: async () => { lan++; const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; } });
  await clock.tien(46000);
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'LOI_KET_NOI'); assert.equal(b.trangThai().trangThai, 'CHO');
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN); assert.equal(lan, 2);
  const c2 = dung({ tamDungHangDen: (ly) => { baoHd.push(ly); return true; }, ketNoi: async () => { const e = new Error('All configured authentication methods failed'); throw e; } });
  await c2.clock.tien(46000);
  assert.equal(c2.b.trangThai().trangThai, 'TAM_DUNG'); assert.equal(c2.b.trangThai().lyDo, 'XAC_THUC'); assert.deepEqual(baoHd, ['XAC_THUC']);
  await c2.clock.tien(10 * 60 * MIN); assert.equal(c2.clock.soHen(), 0);
  const c3 = dung({ ketNoi: async () => { const e = new Error('hostkey'); e.saiVanTay = true; throw e; } });
  await c3.clock.tien(46000); assert.equal(c3.b.trangThai().lyDo, 'VAN_TAY_SAI');
});

// ---------- API ADMIN ----------
const goi = async (url, who) => {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
};

test('GET /api/nap-nguon/ktt/trang-thai: chỉ ADMIN; hình dạng; độ mới, cặp gần nhất, cảnh báo; không lộ sha256 / host / tài khoản / nội dung dòng', async () => {
  assert.equal((await goi('/api/nap-nguon/ktt/trang-thai')).status, 401);
  assert.equal((await goi('/api/nap-nguon/ktt/trang-thai', 'ttvh')).status, 403);
  assert.equal((await goi('/api/nap-nguon/ktt/trang-thai?x=1', 'admin')).status, 400);
  let r = await goi('/api/nap-nguon/ktt/trang-thai', 'admin');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ['tu_dong', 'do_moi', 'canh_bao', 'cap', 'tham_so']);
  assert.equal(r.body.do_moi, null); assert.equal(r.body.tu_dong.trang_thai, 'TAT'); assert.ok(r.body.canh_bao.some((x) => x.ma === 'DU_LIEU_CU'));
  K.napCap(db, cap('20261020_090000', [tui()], [bg()]), { now: NOW });
  r = await goi('/api/nap-nguon/ktt/trang-thai', 'admin');
  assert.equal(r.body.do_moi.nguon_xuat_luc, '2026-10-20 09:00:00');
  assert.deepEqual(r.body.cap.map((x) => [x.khoa_cap, x.ket_qua]), [['20261020_090000', 'OK']]);
  assert.deepEqual(r.body.tham_so, { chu_ky_quet_phut: 10, cho_cap_phut: 60, cu_gio: 10, khung_gio_tu: 7, khung_gio_den: 22, so_cap_toi_thieu_ngay: 2 });
  const txt = JSON.stringify(r.body);
  assert.ok(!/sha|KTT-DEMO|password|hostkey/i.test(txt));
  assert.ok(!/\d{15,}/.test(txt));
});

test('tham số KTT: mặc định đúng; chỉnh được qua /api/tham-so (nhóm nap_ktt), ngoài khoảng / phá ràng buộc khung giờ bị từ chối, đổi có hiệu lực ngay cho cảnh báo', async () => {
  const put = async (thay) => {
    const res = await fetch(`${ctx.baseUrl}/api/tham-so`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'Thử KTT-6', thay_doi: thay }) });
    return { status: res.status, body: await res.json() };
  };
  const dat = (khoa, gia_tri) => ({ khoa, gia_tri });
  assert.equal((await put([dat('ktt_chu_ky_quet_phut', 1)])).status, 400);
  assert.equal((await put([dat('ktt_khung_gio_tu', 22)])).status, 400, 'từ giờ phải nhỏ hơn đến giờ (22)');
  assert.equal((await put([dat('ktt_cu_gio', 8)])).status, 200);
  try {
    assert.equal(KN.CU_GIO, 8);
    okCap('2026-10-20 15:00');
    assert.ok(!maCb(gio('2026-10-21 07:30')).includes('DU_LIEU_CU'), '7 giờ 30 phút');
    assert.ok(maCb(gio('2026-10-21 08:30')).includes('DU_LIEU_CU'), 'ngưỡng mới 8 giờ có hiệu lực ngay');
  } finally {
    await fetch(`${ctx.baseUrl}/api/tham-so/ve-mac-dinh`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'Hoàn', khoa: ['ktt_cu_gio'] }) });
  }
  assert.equal(KN.CU_GIO, 10);
});

// ---------- ba múi giờ ----------
test('TZ: cùng một chuỗi thao tác cho CÙNG kết quả ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (nạp cặp, độ mới, cảnh báo, khung giờ)', () => {
  const script = `
    const Database = require('better-sqlite3'); const fs = require('fs'); const path = require('path'); const os = require('os');
    const { ensureKttSchema } = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttSchema.js'))});
    const K = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttNapCap.js'))});
    const db = new Database(':memory:'); ensureKttSchema(db);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt-tz-'));
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const w = (ten, rows) => { const f = path.join(dir, ten); fs.writeFileSync(f, '\\ufeff' + [Object.keys(rows[0]).map(q).join(','), ...rows.map((r) => Object.keys(r).map((c) => q(r[c])).join(','))].join('\\r\\n') + '\\r\\n'); return f; };
    const key = { Tui_FromPOSCode: '599001', Tui_ToPOSCode: '599002', Tui_MailTripType: '1', Tui_ServiceCode: 'R', Tui_Year: '20261020', Tui_MailTripNumber: '3', Tui_PostBagIndex: '1' };
    const res = [];
    for (const [k, ng] of [['20261020_090000', '2026-10-20 09:00:00'], ['20261020_150000', '2026-10-20 15:00:00']]) {
      const ft = w('KTT_Tui_' + k + '.csv', [{ ...key, Gio_quet_tui_den: '2026-10-19 23:30:00', Nguon_xuat_luc: ng }]);
      const fb = w('KTT_BuuGui_' + k + '.csv', [{ ...key, SHBG: 'KTT-DEMO-00001', TI_den_theo_tui_luc: '2026-10-19 23:30:00', Nguon_xuat_luc: ng }]);
      const c = { khoa: k, nguonTen: ng, tui: { path: ft, name: 'KTT_Tui_' + k + '.csv', size: 1, mtime: 1 }, buuGui: { path: fb, name: 'KTT_BuuGui_' + k + '.csv', size: 1, mtime: 1 } };
      const r = K.napCap(db, c, { now: new Date(Date.UTC(2026, 9, 20, 8, 0, 0)) });
      res.push(r.ketQua, r.cap.nguon_xuat_luc, r.cap.gio_min, r.cap.tui_khong_con);
    }
    const now = new Date(Date.UTC(2026, 9, 21, 1, 30, 0));
    res.push(K.docDoMoi(db).nguon_xuat_luc, K.nowVn(now), K.phutTrongKhung('2026-10-20 15:00:00', '2026-10-21 08:30:00', 7, 22), JSON.stringify(K.canhBao(db, now)), JSON.stringify(K.phanTichTenKtt('KTT_Tui_20261020_090000.csv')));
    process.stdout.write(JSON.stringify(res));
  `;
  const kq = ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'].map((tz) => {
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz, NODE_TEST_CONTEXT: '' }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    return r.stdout;
  });
  assert.equal(kq[0], kq[1]); assert.equal(kq[1], kq[2]);
  const d = JSON.parse(kq[0]);
  assert.deepEqual(d.slice(0, 4), ['OK', '2026-10-20 09:00:00', '2026-10-19 23:30:00', 0]);
  assert.equal(d[10], 7 * 60 + 90); // 15:00 -> 22:00 (7 giờ) + 07:00 -> 08:30 (1 giờ 30)
});

test('KTT-15: sau lượt có cặp nạp OK gọi sauNap đúng một lần (không chờ); lượt không nạp thì không gọi; sauNap ném lỗi không làm hỏng lượt', async () => {
  const k = '20261021_090000';
  const files = { [tenT(k)]: { buf: csvBuf([tui()]), mtime: 10 }, [tenB(k)]: { buf: csvBuf([bg()]), mtime: 10 } };
  const client = nguonGia(files);
  let goi = 0;
  const { b, clock } = dung({ client, sauNap: () => { goi++; throw new Error('sauNap hỏng'); } });
  await clock.tien(46000); // lượt 1: file chưa ổn định
  assert.equal(goi, 0);
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN); // lượt 2: ổn định -> nạp
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN);
  assert.equal(hangCap(k).ket_qua, 'OK');
  assert.equal(goi, 1, 'đúng một lần, ở lượt có cặp nạp OK');
  assert.equal(b.trangThai().luotGanNhat.ketQua, 'XONG');
  await clock.tien(KN.CHU_KY_QUET_PHUT * MIN); // lượt sau: cặp đã có -> không gọi nữa
  assert.equal(goi, 1);
  await b.dung();
});
