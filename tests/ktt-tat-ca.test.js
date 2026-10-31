// ==========================================
// Test KTT-11b: số «Tất cả» của khung Xuất xlsx. (1) `tong_shbg_ngay` của từng khối BCVH = số dòng xlsx khi lọc `ma_bcvh` (SHBG của khối + hàng hoàn Thuận Hóa);
// (2) khối phân rã `ngoai_bay_chip` (không rõ đích, ngoài 6 BCVH, thiếu giờ quét túi đến, không xếp được chuyến) và đẳng thức
// t1…t5 + đang chờ + hàng hoàn + ngoai_bay_chip.tong = tong_shbg_ngay ở từng ngày, khoảng ngày (tong_cong) và kết quả ghép từng ngày.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx). Không mở data/, không DB thật, không mạng.
// 20/10/2026 là thứ Ba. Độ mới 23/10 10:00: các ngày 20, 21 đã chốt, 23 «số tạm» có hàng đang chờ chuyến.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const X = require('../server/lib/kttXuat');
const TS = require('../server/lib/thamSo');

const PORT = 5977;
const TH = '533140'; const HT = '535470'; const HTHUY = '536250';
const SAU_BCVH = [TH, HT, HTHUY, '537015', '537220', '535790'];
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db; let token;
const khoiPhuc = [];

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-tat-ca-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  seedUser(db, { hrmCode: 'KT11B_TTVH', fullName: 'KT11B_TTVH', role: 'TTVH', password: 'Ttvh@123' });
  token = (await loginAs(ctx.baseUrl, 'KT11B_TTVH', 'Ttvh@123')).body.token;
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (...ds) => ds.forEach((shbg) => them('ktt_hang_hoan', { shbg, nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' })); // KTT-17-2: hàng hoàn = SHBG có trong ktt_hang_hoan
const NG = { nguon_xuat_luc: BAY_GIO, cap_nhat_luc: BAY_GIO };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null, phuong = '49122' }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg, { ma_xa_phuong: phuong });
  if (gioDi || nhan) {
    const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
    bg(di, shbg, { ma_xa_phuong: phuong });
  }
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/** Đủ mọi loại: t1…t5, đang chờ, hàng hoàn (cả hàng hoàn thiếu giờ quét), Hệ 1 / KHAC / KTT, thiếu giờ quét, không xếp được chuyến, không rõ đích. */
function duLieu() {
  db.exec(`DELETE FROM ktt_lich_chuyen WHERE ma_bcvh = '${HTHUY}'`); // BCVH này không còn chuyến nào -> «không xếp được chuyến»
  // ---- 20/10
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // t1
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', nhan: HT }); // t1 (Hương Trà)
  kt('KTT-DEMO-A3', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' }); // t2
  kt('KTT-DEMO-A4', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // t3
  kt('KTT-DEMO-A5', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 09:00:00' }); // t4
  kt('KTT-DEMO-A6', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00' }); // t5 (đi từ D+2)
  kt('KTT-DEMO-A7', { quet: '2026-10-20 11:00:00', nhan: null }); // t5 (chưa đi, lỡ chuyến 12:30)
  kt('KTT-DEMO-H1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '531120' }); // hàng hoàn
  hoan('KTT-DEMO-H1');
  kt('KTT-DEMO-H2', { quet: null, xnd: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:00:00', diemGui: '531120' }); // hàng hoàn, thiếu giờ quét đến: vẫn là hàng hoàn
  hoan('KTT-DEMO-H2');
  kt('KTT-DEMO-X1', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', nhan: '530900' }); // ngoài 6 BCVH: Hệ 1
  kt('KTT-DEMO-X2', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', nhan: '700123' }); // ngoài: KHAC
  kt('KTT-DEMO-X3', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', nhan: '530100' }); // ngoài: KTT
  kt('KTT-DEMO-N1', { quet: null, xnd: '2026-10-20 07:00:00', gioDi: '2026-10-20 09:00:00' }); // thiếu giờ quét đến (Thuận Hóa)
  kt('KTT-DEMO-K1', { quet: '2026-10-20 08:00:00', nhan: null, phuong: '00000' }); // không rõ đích
  kt('KTT-DEMO-L1', { quet: '2026-10-20 03:00:00', gioDi: '2026-10-20 05:00:00', nhan: HTHUY }); // không xếp được chuyến (không có lịch)
  // ---- 21/10
  kt('KTT-DEMO-B1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' }); // t1
  kt('KTT-DEMO-B2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', nhan: HT }); // t1
  kt('KTT-DEMO-H3', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120' }); // hàng hoàn
  hoan('KTT-DEMO-H3');
  kt('KTT-DEMO-X4', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-21 09:00:00', nhan: '530900' }); // Hệ 1
  kt('KTT-DEMO-N2', { quet: null, xnd: '2026-10-21 07:00:00', gioDi: '2026-10-21 09:00:00', nhan: HT }); // thiếu giờ quét đến (Hương Trà)
  kt('KTT-DEMO-L2', { quet: '2026-10-21 03:00:00', gioDi: '2026-10-21 05:00:00', nhan: HTHUY }); // không xếp được chuyến
  // ---- 23/10 (độ mới 10:00): đang chờ chuyến 12:30
  kt('KTT-DEMO-W1', { quet: '2026-10-23 08:00:00', nhan: null }); // đang chờ chuyến
  kt('KTT-DEMO-W2', { quet: '2026-10-23 08:00:00', gioDi: '2026-10-23 09:00:00', nhan: '530900' }); // Hệ 1
  capOk(BAY_GIO);
  Api.xoaCache();
}

// ---------- gọi API + đếm dòng xlsx ----------
async function goi(url) {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: res.status, body: await res.json() };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
}
async function soDongXlsx(tu, den, loc = '') {
  const r = await goi(`/api/ktt/xuat/luu-thoat?tu=${tu}&den=${den}${loc}`);
  assert.equal(r.status, 200, loc);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  let n = 0;
  wb.getWorksheet(X.TEN_SHEET_7).eachRow((row, i) => { if (i > 1) n++; });
  return n;
}
const tu = '2026-10-20'; const den = '2026-10-23';
const QDAY = `?tu=${tu}&den=${den}`;
const chip7 = (k) => ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'].reduce((s, m) => s + k.trang_thai[m].shbg, 0);
/** Đẳng thức: bảy chip + ngoai_bay_chip.tong = tong_shbg_ngay (k = một ngày hoặc tong_cong). */
const dangThuc = (k) => chip7(k) + k.hang_hoan.tong_shbg + k.ngoai_bay_chip.tong;

// ---------- 1. phân rã «Tất cả» ----------
test('ngoai_bay_chip: giá trị đúng theo ngày và bất biến bảy chip + phân rã = tong_shbg_ngay (ngày, khoảng, tong_cong)', async () => {
  duLieu();
  const r = await goi(`/api/ktt/luu-thoat${QDAY}`);
  assert.equal(r.status, 200);
  const lt = r.body;
  const n20 = lt.theo_ngay.find((x) => x.ngay === '2026-10-20');
  assert.deepEqual(n20.ngoai_bay_chip, {
    khong_ro_dich: 1, ngoai_pham_vi: { HE1_530900: 1, KHAC: 1, KTT: 1 }, ngoai_pham_vi_tong: 3, khong_co_gio_quet_den: 1,
    khong_xep_duoc_chuyen: { KHONG_CO_LICH: 1 }, khong_xep_duoc_chuyen_tong: 1, tong: 6
  });
  assert.equal(n20.hang_hoan.tong_shbg, 2, 'hàng hoàn thiếu giờ quét nằm trong hàng hoàn, không trong thiếu giờ quét');
  assert.equal(n20.tong_shbg_ngay, 15);
  for (const n of lt.theo_ngay) {
    const k = { trang_thai: n.tong.trang_thai, hang_hoan: n.hang_hoan, ngoai_bay_chip: n.ngoai_bay_chip };
    assert.equal(dangThuc(k), n.tong_shbg_ngay, `ngày ${n.ngay}`);
  }
  const tc = lt.tong_cong;
  assert.equal(dangThuc(tc), tc.tong_shbg_ngay, 'tong_cong');
  assert.equal(tc.tong_shbg_ngay, lt.theo_ngay.reduce((s, n) => s + n.tong_shbg_ngay, 0));
  assert.deepEqual(tc.ngoai_bay_chip.ngoai_pham_vi, { HE1_530900: 3, KHAC: 1, KTT: 1 });
  assert.deepEqual([tc.ngoai_bay_chip.khong_ro_dich, tc.ngoai_bay_chip.khong_co_gio_quet_den, tc.ngoai_bay_chip.khong_xep_duoc_chuyen_tong, tc.ngoai_bay_chip.tong], [1, 2, 2, 10]);
  assert.deepEqual(tc.ngoai_bay_chip.khong_xep_duoc_chuyen, { KHONG_CO_LICH: 2 });
});

test('khong_phan_loai cấp ngày và tong_cong giữ nguyên hình dạng cũ (chỉ thêm trường mới)', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const n20 = lt.theo_ngay.find((x) => x.ngay === '2026-10-20');
  assert.deepEqual(Object.keys(n20.khong_phan_loai).sort(), ['khong_ro_dich', 'ngoai_pham_vi', 'tong']);
  assert.deepEqual(Object.keys(lt.tong_cong.khong_phan_loai).sort(), ['khong_ro_dich', 'ngoai_pham_vi']);
});

test('ghepKhoang(từng ngày) = tính cả khoảng: ngoai_bay_chip, tong_shbg_ngay theo BCVH; không phụ thuộc moc_chi_tieu', async () => {
  duLieu();
  const ngays = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
  const tungNgay = ngays.map((d) => QL.luuThoatTheoNgay(db, { tuNgay: d, denNgay: d, bayGio: BAY_GIO }));
  const ghep = QL.ghepKhoang(tungNgay);
  const ca = QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO });
  assert.deepEqual(ghep.tong_cong.ngoai_bay_chip, ca.tong_cong.ngoai_bay_chip);
  assert.deepEqual(ghep.theo_ngay.map((n) => n.ngoai_bay_chip), ca.theo_ngay.map((n) => n.ngoai_bay_chip));
  for (const m of SAU_BCVH) assert.equal(ghep.tong_cong.theo_bcvh[m].tong_shbg_ngay, ca.tong_cong.theo_bcvh[m].tong_shbg_ngay, m);
  assert.equal(ca.tong_cong.theo_bcvh[TH].tong_shbg_ngay, ca.theo_ngay.reduce((s, n) => s + n.theo_bcvh[TH].tong_shbg_ngay, 0));
  const caB = QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO, mocChiTieu: 'quet_tui_den' });
  assert.deepEqual(caB.tong_cong.ngoai_bay_chip, ca.tong_cong.ngoai_bay_chip);
  for (const m of SAU_BCVH) assert.equal(caB.tong_cong.theo_bcvh[m].tong_shbg_ngay, ca.tong_cong.theo_bcvh[m].tong_shbg_ngay, m);
  const viaApi = (await goi(`/api/ktt/luu-thoat${QDAY}&moc_chi_tieu=quet_tui_den`)).body;
  assert.deepEqual(viaApi.tong_cong.ngoai_bay_chip, ca.tong_cong.ngoai_bay_chip);
});

// ---------- 2. tong_shbg_ngay theo BCVH = số dòng xlsx ----------
test('tong_shbg_ngay của từng BCVH = số dòng xlsx ?ma_bcvh= (kể cả Thuận Hóa có hàng hoàn) = kttXuat.soKhop; tổng 6 BCVH = xlsx không lọc', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const tc = lt.tong_cong;
  assert.equal(tc.theo_bcvh[TH].tong_shbg_ngay, tc.theo_bcvh[TH].tong_shbg + tc.hang_hoan.tong_shbg, 'Thuận Hóa cộng hàng hoàn');
  assert.equal(tc.theo_bcvh[HT].tong_shbg_ngay, tc.theo_bcvh[HT].tong_shbg, 'BCVH khác không cộng hàng hoàn');
  for (const m of SAU_BCVH) {
    const dong = await soDongXlsx(tu, den, `&ma_bcvh=${m}`);
    assert.equal(tc.theo_bcvh[m].tong_shbg_ngay, dong, `xlsx ${m}`);
    assert.equal(X.soKhop(lt, { maBcvh: m }), dong, `soKhop ${m}`);
  }
  assert.ok(tc.theo_bcvh[TH].tong_shbg_ngay > tc.theo_bcvh[TH].luu_thoat.mau_so, 'trước KTT-11b chip rơi về mau_so (chỉ t1…t5)');
  assert.equal(tc.tong_shbg_ngay, await soDongXlsx(tu, den), 'Tất cả 6 BCVH = xlsx không lọc');
  assert.equal(X.soKhop(lt, {}), tc.tong_shbg_ngay);
  // từng ngày
  for (const n of lt.theo_ngay) {
    if (!n.co_du_lieu) continue;
    assert.equal(n.tong_shbg_ngay, await soDongXlsx(n.ngay, n.ngay), `xlsx ${n.ngay}`);
    assert.equal(n.theo_bcvh[TH].tong_shbg_ngay, await soDongXlsx(n.ngay, n.ngay, `&ma_bcvh=${TH}`), `xlsx ${n.ngay} Thuận Hóa`);
  }
});

test('chưa có dữ liệu / ngày trống: tong_shbg_ngay theo BCVH = 0 và ngoai_bay_chip toàn số 0', async () => {
  const r = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  assert.equal(r.tong_cong, null);
  for (const n of r.theo_ngay) {
    for (const m of SAU_BCVH) assert.equal(n.theo_bcvh[m].tong_shbg_ngay, 0);
    assert.deepEqual(n.ngoai_bay_chip, { khong_ro_dich: 0, ngoai_pham_vi: {}, ngoai_pham_vi_tong: 0, khong_co_gio_quet_den: 0, khong_xep_duoc_chuyen: {}, khong_xep_duoc_chuyen_tong: 0, tong: 0 });
  }
  duLieu();
  const c = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const trong = c.theo_ngay.find((x) => x.ngay === '2026-10-22');
  assert.equal(trong.co_du_lieu, false);
  assert.equal(trong.tong_shbg_ngay, 0);
  assert.equal(trong.ngoai_bay_chip.tong, 0);
});
