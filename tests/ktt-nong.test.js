// ==========================================
// Test KTT-15: làm nóng cache «Hàng tại KTT» nền (server/lib/kttNong.js). Kết quả sau làm nóng = kết quả nguội (deepEqual), làm nóng CHỈ ĐỌC DB, KTT_WARM=0 thì không chạy,
// nạp mới -> cache vô hiệu rồi được làm nóng lại, request giữa chừng không tính trùng, lỗi không làm sập. Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx).
// Không mở data/, không DB thật, không mạng. 20/10/2026 là thứ Ba. Độ mới 23/10 10:00.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const Nong = require('../server/lib/kttNong');
const TS = require('../server/lib/thamSo');

const PORT = 5975;
const TH = '533140'; const HT = '535470'; const HTHUY = '536250';
const DOMOI = '2026-10-23 10:00:00';
let ctx; let db;
const khoiPhuc = [];

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-nong-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  TS.khoiTao(db);
  Api.xoaCache();
  Nong.datLai();
  duLieu();
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: DOMOI, cap_nhat_luc: DOMOI };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
function kt(shbg, { quet, gioDi = null, nhan = TH, diemGui = null }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg);
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
function ct(shbg, { quet, gioDi = null, nhan = TH }) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DI_NGOAI', to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: '999001', bd10_den_ma_duong_thu: 'CT-01', bd10_den_ten_duong_thu: 'Đường thư chuyển tiếp giả', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-CI-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(t, shbg);
}
const ngay = (i) => new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10); // 14/10 .. 23/10
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/** Mười ngày 14..23/10: mỗi ngày khai thác (đúng giờ, hôm sau, chưa đi), chuyển tiếp (đi, chưa đi). */
function duLieu() {
  for (let i = 0; i < 10; i++) {
    const d = ngay(i); const d1 = new Date(Date.UTC(2026, 9, 15 + i)).toISOString().slice(0, 10);
    const nhan = [TH, HT, HTHUY][i % 3];
    kt(`KTT-DEMO-K1-${i}`, { quet: `${d} 05:30:00`, gioDi: `${d} 06:50:00`, nhan });
    kt(`KTT-DEMO-K2-${i}`, { quet: `${d} 21:30:00`, gioDi: `${d1} 06:30:00`, nhan });
    kt(`KTT-DEMO-K3-${i}`, { quet: `${d} 11:00:00`, nhan: TH });
    ct(`KTT-DEMO-C1-${i}`, { quet: `${d} 05:30:00`, gioDi: `${d} 06:50:00`, nhan: HT });
    ct(`KTT-DEMO-C2-${i}`, { quet: `${d} 08:00:00`, nhan: null });
    kt(`KTT-DEMO-H-${i}`, { quet: `${d} 03:00:00`, gioDi: `${d} 05:30:00`, nhan: TH, diemGui: '531120' });
  }
  capOk(DOMOI);
}

const Q7 = { tu: '2026-10-17', den: '2026-10-23' }; // cửa sổ chuẩn 7 ngày kết thúc ở ngày của độ mới
const Q12 = { tu: '2026-10-12', den: '2026-10-23' };
const ENV12 = { KTT_WARM_NGAY: '12' };
const NHANH = { nghiCuaSoMs: 0, nghiThuaMs: 0, log: () => {} };
/** Mọi endpoint mà lần mở trang dùng, ở cửa sổ q (tuần tự: kết quả nguội phải xác định). */
async function tatCa(q) {
  return {
    ls: await Api.luuThoat(db, q), lsQuet: await Api.luuThoat(db, { ...q, moc_chi_tieu: 'quet_tui_den' }),
    b1: await Api.diCungNgayTongHop(db, q), b2: await Api.diCungNgayTheoNgay(db, q), b3: await Api.diCungNgayTheoGio(db, q), rot: await Api.rotLaiTheoDuongThu(db, q),
    b4: await Api.lichXeGioLapBd10(db, q), b5: await Api.lichXeTheoDuongThu(db, q), b6: await Api.lichXeTheoBcvh(db, q),
    a1: await Api.hangDenTongHop(db, q), a3: await Api.hangDenTheoGio(db, q), a4: await Api.hangDenTheoDuongThu(db, q), a2: await Api.hangDenXe(db, q), tq: await Api.tongQuan(db, q)
  };
}
const dongDb = () => ({
  tui: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s FROM ktt_tui').get(), bg: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s FROM ktt_buu_gui').get(),
  cap: db.prepare('SELECT COUNT(*) AS n FROM ktt_nap_cap').get(), thayDoi: db.prepare('SELECT total_changes() AS n').get().n
});

test('kết quả sau làm nóng GIỐNG HỆT kết quả nguội (mọi endpoint của trang, cửa sổ 7 ngày), và lần mở đầu không tính thêm gì', async () => {
  const nguoi = await tatCa(Q7);
  assert.ok(nguoi.ls.tong_cong.tong_shbg_ngay > 0 && nguoi.b1.bcvh_hue_khong_hang_hoan.tong_shbg > 0 && nguoi.a1.shbg > 0, 'dữ liệu giả có số liệu thật để so');
  Api.xoaCache();
  const kq = await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  assert.equal(kq.da_chay, true); assert.equal(kq.loi, null); assert.equal(kq.bi_huy, false);
  assert.equal(kq.ngay_cua_so + kq.ngay_thua, 12);
  assert.equal(kq.muc_khoang, 1, 'chỉ cửa sổ 7 ngày (30 ngày lớn hơn KTT_WARM_NGAY=12)');
  const sau = Api.thongKe();
  assert.equal(sau.ngay_b, 12); assert.equal(sau.ngay, 24, 'mỗi ngày hai mốc luu-thoat');
  const nong = await tatCa(Q7);
  assert.deepEqual(nong, nguoi);
  const mo = Api.thongKe();
  for (const k of ['ngayTinh', 'ngayBTinh', 'hangDenTinh', 'workerLan']) assert.equal(mo[k], sau[k], `${k}: mở trang sau làm nóng không tính thêm`);
  // cửa sổ 12 ngày: các ngày cũ (lượt thưa) cũng đã nóng
  Api.xoaCache(); const nguoi12 = { ls: await Api.luuThoat(db, Q12), b1: await Api.diCungNgayTongHop(db, Q12), b2: await Api.diCungNgayTheoNgay(db, Q12) };
  Api.xoaCache(); await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  const s2 = Api.thongKe();
  assert.deepEqual({ ls: await Api.luuThoat(db, Q12), b1: await Api.diCungNgayTongHop(db, Q12), b2: await Api.diCungNgayTheoNgay(db, Q12) }, nguoi12);
  assert.equal(Api.thongKe().ngayTinh, s2.ngayTinh); assert.equal(Api.thongKe().ngayBTinh, s2.ngayBTinh);
});

test('làm nóng CHỈ ĐỌC: không dòng DB nào đổi (đếm dòng, tổng id, số thay đổi của kết nối)', async () => {
  const truoc = dongDb();
  await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  assert.deepEqual(dongDb(), truoc);
});

test('KTT_WARM=0 thì KHÔNG chạy: không tính ngày nào, không dùng worker; mặc định (không đặt) và giá trị khác "0" thì bật', async () => {
  const r = await Nong.batDauNong(db, { env: { KTT_WARM: '0' }, ...NHANH });
  assert.deepEqual(r, { da_chay: false, ly_do: 'TAT' });
  const s = Api.thongKe();
  assert.deepEqual([s.ngay, s.ngay_b, s.ngayTinh, s.ngayBTinh, s.workerLan, s.noiTuyenLan], [0, 0, 0, 0, 0, 0]);
  assert.equal(Nong.dangBat({}), true); assert.equal(Nong.dangBat({ KTT_WARM: '1' }), true); assert.equal(Nong.dangBat({ KTT_WARM: '' }), true); assert.equal(Nong.dangBat({ KTT_WARM: '0' }), false);
  assert.equal(Nong.soNgay({}), 31); assert.equal(Nong.soNgay({ KTT_WARM_NGAY: '9' }), 9); assert.equal(Nong.soNgay({ KTT_WARM_NGAY: '99' }), 31); assert.equal(Nong.soNgay({ KTT_WARM_NGAY: 'x' }), 31);
  assert.equal((await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '2' }, ...NHANH })).da_chay, true);
});

test('chưa có dữ liệu (chưa nạp cặp nào): không làm gì, không lỗi', async () => {
  db.exec('DELETE FROM ktt_nap_cap;');
  const r = await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  assert.equal(r.da_chay, true); assert.equal(r.ly_do, 'CHUA_CO_DU_LIEU'); assert.equal(r.loi, null);
  assert.equal(Api.thongKe().ngay_b, 0);
});

test('nạp cặp mới: cache cũ vô hiệu rồi được làm nóng lại với độ mới mới; kết quả = nguội', async () => {
  await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  const truoc = Api.thongKe();
  // cặp mới: độ mới 24/10 10:00, thêm hàng đến ngày 23 và 24
  const moi = '2026-10-24 10:00:00';
  const NGm = { nguon_xuat_luc: moi, cap_nhat_luc: moi };
  const tm = tui({ ...NGm, chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-10-24 04:00:00', bd10_den_so_hieu: 'BD10-D-MOI', bd10_den_xnd: '2026-10-24 04:00:00' });
  bg(tm, 'KTT-DEMO-MOI-1', NGm);
  const dm = tui({ ...NGm, chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: TH, bd10_di_gio_di: '2026-10-24 05:30:00', gio_quet_tui_di: '2026-10-24 05:30:00', bd10_di_so_hieu: 'BD10-I-MOI', bd10_di_ma_diem_nhan: TH });
  bg(dm, 'KTT-DEMO-MOI-1', NGm);
  capOk(moi);
  const Q = { tu: '2026-10-18', den: '2026-10-24' };
  const cu = await Api.luuThoat(db, Q); // chưa làm nóng lại: tính theo độ mới mới (cache cũ không được dùng)
  assert.equal(cu.bay_gio, moi);
  assert.ok(Api.thongKe().ngayTinh > truoc.ngayTinh, 'ngày trong cửa sổ nạp bị vô hiệu khi độ mới đổi');
  Api.xoaCache();
  const nguoi = await tatCa(Q);
  Api.xoaCache();
  const kq = await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  assert.equal(kq.loi, null);
  const s = Api.thongKe();
  assert.deepEqual(await tatCa(Q), nguoi);
  const sau = Api.thongKe();
  for (const k of ['ngayTinh', 'ngayBTinh', 'hangDenTinh']) assert.equal(sau[k], s[k], k);
});

test('request đến giữa chừng dùng chung lần tính đang chạy: không ngày nào bị tính hai lần', async () => {
  const p = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '3' }, ...NHANH });
  const r = await Api.luuThoat(db, { tu: '2026-10-23', den: '2026-10-23' });
  const r2 = await Api.diCungNgayTongHop(db, { tu: '2026-10-21', den: '2026-10-23' });
  await p;
  const s = Api.thongKe();
  assert.equal(s.ngayTinh, 6, '3 ngày × 2 mốc, mỗi mục một lần'); assert.equal(s.ngayBTinh, 3);
  assert.ok(r.co_du_lieu && r2.co_du_lieu);
});

test('hai lần gọi liên tiếp: lượt cũ nhường lượt mới (không chạy chồng), lượt mới chạy đủ', async () => {
  const a = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '3' }, ...NHANH });
  const b = Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '3' }, ...NHANH });
  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual([ra.da_chay, ra.ly_do], [false, 'DA_CO_LUOT_MOI']);
  assert.equal(rb.da_chay, true); assert.equal(rb.ngay_cua_so, 3); assert.equal(rb.bi_huy, false);
  assert.equal(Nong.docTrangThai().dang_chay, false);
  assert.equal(Api.thongKe().ngayBTinh, 3);
});

test('lượt đang chạy bị hủy khi máy chủ đóng (dung()) hoặc khi có lượt mới; không ném lỗi', async () => {
  let dem = 0;
  const r = await Nong.batDauNong(db, { env: ENV12, ...NHANH, dung: () => ++dem > 2 });
  assert.equal(r.bi_huy, true); assert.equal(r.loi, null);
  assert.equal(r.ngay_cua_so, 2, 'chạy đến khi dung() báo dừng, ở ranh giới ngày');
});

test('lỗi trong lúc làm nóng KHÔNG làm sập: Promise vẫn xong, ghi mã lỗi, không có số liệu trong log; lần sau chạy lại bình thường', async () => {
  const logs = [];
  const hong = new Proxy(db, { get(t, p) { if (p === 'prepare') return (sql) => { if (/CROSS JOIN/.test(sql)) throw Object.assign(new Error('KTT-DEMO-LOI 12345 nội dung nhạy cảm'), { code: 'LOI_GIA' }); return t.prepare(sql); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
  const r = await Nong.batDauNong(hong, { env: ENV12, ...NHANH, log: (m) => logs.push(m) });
  assert.equal(r.da_chay, true); assert.equal(r.loi, 'LOI_GIA');
  assert.equal(logs.length, 1); assert.match(logs[0], /^\[ktt-nong\]/); assert.doesNotMatch(logs[0], /KTT-DEMO|12345|nhạy cảm/);
  const tot = await Nong.batDauNong(db, { env: ENV12, ...NHANH });
  assert.equal(tot.loi, null); assert.equal(tot.ngay_cua_so + tot.ngay_thua, 12);
  // log hỏng cũng không làm sập
  assert.equal((await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '1' }, ...NHANH, log: () => { throw new Error('log hỏng'); } })).da_chay, true);
});

test('log thường: một dòng, chỉ có số ngày / mili giây (không số liệu nghiệp vụ, không mã bưu gửi)', async () => {
  const logs = [];
  await Nong.batDauNong(db, { env: { KTT_WARM_NGAY: '2' }, lyDo: 'KHOI_DONG', nghiCuaSoMs: 0, nghiThuaMs: 0, log: (m) => logs.push(m) });
  assert.equal(logs.length, 1); assert.match(logs[0], /^\[ktt-nong\] KHOI_DONG: 2\+0 ngày, 0 mục khoảng trong \d+ ms$/);
});
