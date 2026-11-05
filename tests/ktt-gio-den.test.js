// ==========================================
// Test KTT-KD-3b: màn «Giờ đến trong ngày» — ba route chỉ-thêm (gio-den, gio-den/theo-ngay, con-lai-theo-gio) + lõi thuần kttGioDen.js.
//  - Σ theo_gio[24] = shbg; Σ đường thư + «Khác» = tổng; kiện đi ngoài ≤ shbg; tách ngày thường / Chủ nhật;
//  - chuyến thư đến: hai lần đến cách đúng 60 phút gộp, cách 61 phút tách; mỗi chuyến một giờ giữa mỗi ngày; đường thư không tên / không mã là dòng riêng;
//  - dấu hiệu cấp đường thư (mỗi cờ tương đối gắn đúng 20% trên bộ giả biết trước), mẫu ít co theo số ngày; hai mốc cùng mẫu số;
//  - dải «còn lại theo giờ»: lịch chuẩn 05/11, chỉ tiêu 12 giờ Thuận Hóa, con_lai_gio ÂM, null khi không xếp được chuyến;
//  - quyền (ADMIN, TTVH, TTKT 200; GDVH, TIVI 403), tham số sai 400.
// Dữ liệu GIẢ (SHBG KTT-DEMO-xxx, BD10 giả); server thật trên DB tạm của harness. Không mở data/, không DB thật.
// Ngày: 2026-10-11 Chủ nhật; 10-12 … 10-17 thứ Hai … thứ Bảy; bayGio (độ mới) = 2026-10-23 10:00:00.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const BT = require('../server/lib/kttBucTranh');
const GD = require('../server/lib/kttGioDen');
const L = require('../server/lib/kttLichChuyen');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');

const PORT = 5993;
const HY = '536250'; const TH = '533140'; const TA = '537015'; const AL = '535790';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'GD_ADMIN', pass: 'Admin@123', role: 'ADMIN' }, ttvh: { hrm: 'GD_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'GD_GDVH', pass: 'Gdvh@123', role: 'GDVH' }, tivi: { hrm: 'GD_TIVI', pass: 'Tivi@123', role: 'TIVI' }, ttkt: { hrm: 'GD_TTKT', pass: 'Ttkt@123', role: 'TTKT' }
};
before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-gd-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa LIKE 'ktt_bt_%'");
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0; let soShbg = 0;
const them = (bang, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); };
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 1000, ma_xa_phuong: '49620', ...NG, ...o }); }
/** Một SHBG khai thác về BCVH `nhan`; `dt` null = chưa có mã đường thư, `ten` null = chưa có tên. */
function kt({ quet, xnd, nhan = HY, dt = 'DT-A', ten, lich = 'L1', luong = 'KHAI_THAC_DEN', bd10 = 'BD10-GD-1', gam = 1000 }) {
  soShbg++;
  const shbg = `KTT-DEMO-${String(soShbg).padStart(5, '0')}`;
  const den = tui({ chieu: 'DEN', luong, co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_duong_thu: dt, bd10_den_ten_duong_thu: ten === undefined ? (dt ? `Tên ${dt}` : null) : ten, bd10_den_ma_lich: lich, bd10_den_ten_lich: `Lịch ${lich}`, so_hieu_bd8: luong === 'DI_NGOAI' ? shbg : null });
  bg(den, shbg, { khoi_luong_thuc_te_g: gam });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: null, gio_quet_tui_di: null, bd10_di_so_hieu: null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg, { khoi_luong_thuc_te_g: gam });
  return shbg;
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ngayGio = (ngay, phut) => `${ngay} ${hhmm(phut)}:00`;

/**
 * Bộ có đáp án (khoảng 11/10–17/10, 7 ngày: 1 Chủ nhật + 6 ngày thường):
 *  - DT-A (có tên, lịch L1): 4 ngày (CN 11/10, 12/10, 13/10, 17/10) × [6 SHBG quét 05:00–05:25 + 4 SHBG quét 11:00–11:30] = 40 SHBG, hai chuyến thư đến mỗi ngày (cách 5 giờ 30);
 *  - DT-K (luồng DI_NGOAI): 4 ngày × 3 SHBG lúc 09:00 = 12 kiện đi ngoài;
 *  - DT-G60: 12/10 5 SHBG lúc 08:00 + 5 SHBG lúc 09:00 (cách đúng 60 phút → một chuyến); DT-G61: 5 lúc 08:00 + 5 lúc 09:01 (61 phút → hai chuyến);
 *  - DT-N (có mã, KHÔNG có tên): 6 SHBG 12/10; một nhóm KHÔNG có mã đường thư: 5 SHBG 12/10;
 *  - DT-X (mẫu ít): 8 SHBG; một SHBG DT-N2 không có xác nhận BD10 (mốc A không đo được).
 */
function duLieu() {
  for (const ng of ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-17']) {
    for (let i = 0; i < 6; i++) kt({ quet: ngayGio(ng, 300 + i * 5), bd10: `BD10-${ng}-1` });
    for (let i = 0; i < 4; i++) kt({ quet: ngayGio(ng, 660 + i * 10), bd10: `BD10-${ng}-2` });
    for (let i = 0; i < 3; i++) kt({ quet: ngayGio(ng, 540 + i), dt: 'DT-K', lich: 'L9', luong: 'DI_NGOAI', bd10: `BD10-${ng}-K` });
  }
  for (let i = 0; i < 5; i++) kt({ quet: ngayGio('2026-10-12', 480), dt: 'DT-G60', lich: 'L2', bd10: 'BD10-G60' });
  for (let i = 0; i < 5; i++) kt({ quet: ngayGio('2026-10-12', 540), dt: 'DT-G60', lich: 'L2', bd10: 'BD10-G60' });
  for (let i = 0; i < 5; i++) kt({ quet: ngayGio('2026-10-12', 480), dt: 'DT-G61', lich: 'L3', bd10: 'BD10-G61' });
  for (let i = 0; i < 5; i++) kt({ quet: ngayGio('2026-10-12', 541), dt: 'DT-G61', lich: 'L3', bd10: 'BD10-G61' });
  for (let i = 0; i < 6; i++) kt({ quet: ngayGio('2026-10-12', 600 + i), dt: 'DT-N', ten: null, lich: 'L4', bd10: 'BD10-N' });
  for (let i = 0; i < 5; i++) kt({ quet: ngayGio('2026-10-12', 700 + i), dt: null, lich: 'L5', bd10: 'BD10-0' });
  for (let i = 0; i < 8; i++) kt({ quet: ngayGio('2026-10-12', 800 + i), dt: 'DT-X', lich: 'L6', bd10: 'BD10-X' });
  kt({ quet: '2026-10-12 08:00:00', xnd: null, dt: 'DT-N2', lich: 'L7', bd10: 'BD10-NOXND' });
  capOk(BAY_GIO);
}
const CA = { tu: '2026-10-11', den: '2026-10-17' };
const QS = (o = {}) => `?${new URLSearchParams({ ...CA, ...o }).toString()}`;
async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
const BASE = '/api/ktt/luu-thoat/buc-tranh-duong-thu';
const TONG24 = (r) => r.theo_gio.reduce((s, x) => s + x.shbg, 0);

// ---------- bộ giả cho hàm thuần ----------
/** spec: [{ dt, ngay (chỉ số ngày), n, phut(i), kien (0|2) }]; 1 BCVH Thuận Hóa; cột số đúng định dạng của BT.gop. */
function dungR(spec, soNgay = 10, ngayCN = []) {
  const cot = Object.fromEntries(BT.COT.map((k) => [k, []]));
  const tu = { dt: [], dtTen: [], lich: ['L'], lichTen: ['Lịch'], ck: ['533140|07:00|06:00'] };
  const ngayI = []; const idx = new Map();
  for (const sp of spec) {
    if (!idx.has(sp.dt)) { idx.set(sp.dt, tu.dt.length); tu.dt.push(sp.dt); tu.dtTen.push(sp.ten === undefined ? `Tên ${sp.dt}` : sp.ten); }
    for (let i = 0; i < sp.n; i++) {
      const p = sp.phut(i);
      cot.dt.push(idx.get(sp.dt)); cot.lich.push(0); cot.bcvh.push(5); cot.nh.push(0); cot.kien.push(typeof sp.kien === 'function' ? sp.kien(i) : (sp.kien === undefined ? 0 : sp.kien)); cot.kg.push(1); cot.ctg.push(14);
      for (const h of ['A', 'B']) { cot[`t${h}`].push(p); cot[`ck${h}`].push(0); cot[`cho${h}`].push(3600); cot[`bien${h}`].push(500); cot[`hs${h}`].push(0); }
      ngayI.push(sp.ngay);
    }
  }
  const ngays = Array.from({ length: soNgay }, (_, i) => ({ ngay: `2026-10-${String(1 + i).padStart(2, '0')}`, thu: ngayCN.includes(i) ? 'CN' : '2' }));
  return { n: ngayI.length, ngayI, ngays, cot, tu };
}
const NGAYS10 = (R) => R.ngays;

// ---------- hàm thuần ----------
test('chuyến thư đến của đường thư: hai lần đến cách đúng 60 phút gộp một chuyến; cách 61 phút tách hai (mỗi băng ≥ 5 bưu gửi)', () => {
  const mk = (cach) => dungR([{ dt: 'D', ngay: 0, n: 5, phut: () => 480 }, { dt: 'D', ngay: 0, n: 5, phut: () => 480 + cach }]);
  const ng = { ...BT.NGUONG_MAC_DINH };
  assert.equal(GD.dungChuyen(mk(60), 'B', ng).get(0).bang.length, 1, '60 phút: một chuyến');
  assert.equal(GD.dungChuyen(mk(61), 'B', ng).get(0).bang.length, 2, '61 phút: hai chuyến');
  const R = mk(61);
  const v = GD.tinhGioDen(R, { moc: 'B', nguong: ng, ngays: NGAYS10(R), nSong: 30 }).duong_thu[0];
  assert.equal(v.chuyen.length, 2);
  assert.equal(v.gio_den_ngay.so_mau, 2, 'mỗi chuyến một giờ mỗi ngày: 2 giờ-chuyến-ngày, không phải 10 bưu gửi');
  assert.equal(v.gio_den_ngay.so_chuyen_ngay, 2);
});

test('khóa mới ktt_bt_san_luong_lon_phan_vi: có ở config máy chủ (mặc định 80) và đọc được lúc gọi', () => {
  const CFG = require('../server/config/ktt-buc-tranh');
  assert.equal(CFG.SAN_LUONG_LON_PHAN_VI, 80);
  assert.equal(TS.lay('ktt_bt_san_luong_lon_phan_vi'), 80);
});

/** 10 đường thư × 10 ngày: tổng sản lượng, độ dao động, độ rộng giờ đến và tỷ lệ kiện đi ngoài ĐỘC LẬP nhau (hoán vị khác nhau) -> mỗi cờ tương đối gắn đúng 2/10. */
function bo10() {
  const spec = [];
  for (let j = 0; j < 10; j++) {
    const base = 40 + 3 * ((j * 7) % 10); // tổng khác nhau (san_luong_lon)
    const dao = 1 + ((j * 3) % 10); // dao động khác nhau
    const rong = 6 * ((j * 9) % 10); // bước giờ giữa các ngày (độ rộng P90−P10 = 8 bước)
    const kienPct = 5 + 5 * ((j * 7) % 10); // 5%..50%
    for (let d = 0; d < 10; d++) {
      const n = base + (d % 2 === 0 ? 1 : -1) * dao;
      spec.push({ dt: `DT${String(j).padStart(2, '0')}`, ngay: d, n, phut: () => 480 + d * rong, kien: (i) => (i < Math.round((n * kienPct) / 100) ? 2 : 0) });
    }
  }
  return dungR(spec);
}
const NG_TEST = { ...BT.NGUONG_MAC_DINH, mauToiThieu: 30 };

test('dấu hiệu cấp đường thư: mỗi cờ tương đối (không đều sản lượng, giờ đến không cố định, nhiều kiện đi ngoài, sản lượng lớn) gắn đúng 2/10 = 20% và đúng đường thư có số đo cao nhất', () => {
  const R = bo10();
  const v = GD.tinhGioDen(R, { moc: 'B', nguong: { ...NG_TEST, sanLuongLonPhanVi: 80 }, ngays: NGAYS10(R), nSong: 30, chon: R.tu.dt }).duong_thu;
  assert.equal(v.length, 10);
  const gan = (co) => v.filter((x) => x.co[co]).map((x) => x.khoa).sort();
  const top2 = (f) => v.slice().sort((a, b) => f(b) - f(a)).slice(0, 2).map((x) => x.khoa).sort();
  assert.equal(gan('san_luong_khong_deu').length, 2);
  assert.deepEqual(gan('san_luong_khong_deu'), top2((x) => x.co_gia_tri_do.dao_dong));
  assert.equal(gan('gio_den_khong_co_dinh').length, 2);
  assert.deepEqual(gan('gio_den_khong_co_dinh'), top2((x) => x.co_gia_tri_do.do_rong_gio_den_phut));
  assert.equal(gan('nhieu_kien_di_ngoai').length, 2);
  assert.deepEqual(gan('nhieu_kien_di_ngoai'), top2((x) => x.kien_di_ngoai.ty_le));
  assert.ok(v.filter((x) => x.co.nhieu_kien_di_ngoai).every((x) => x.kien_di_ngoai.ty_le >= 0.3));
  assert.equal(gan('san_luong_lon').length, 2);
  assert.deepEqual(gan('san_luong_lon'), top2((x) => x.shbg));
  assert.equal(v.filter((x) => x.co.mau_it).length, 0);
  // khóa phân vị đổi được: 90 -> chỉ 1 đường thư lớn nhất
  const v90 = GD.tinhGioDen(R, { moc: 'B', nguong: { ...NG_TEST, sanLuongLonPhanVi: 90 }, ngays: NGAYS10(R), nSong: 30, chon: R.tu.dt }).duong_thu;
  assert.equal(v90.filter((x) => x.co.san_luong_lon).length, 1);
  // độ lệch chuẩn chia N−1: đường thư có sản lượng xen kẽ base ± dao
  const x0 = v.find((x) => x.khoa === 'DT00'); // j=0: base 40, dao 1 -> 41/39 ×5
  assert.equal(x0.san_luong_ngay.ngay_thuong.do_lech_chuan, Math.round(Math.sqrt((10 * 1) / 9) * 10) / 10);
});

test('mẫu ít co theo số ngày của khoảng: ngưỡng = ceil(ktt_bt_mau_toi_thieu × số ngày / 30); trả kèm ngưỡng đã tính; không gắn cờ tương đối cho đường thư mẫu ít', () => {
  const R = dungR([{ dt: 'A', ngay: 0, n: 30, phut: () => 480 }, { dt: 'A', ngay: 1, n: 30, phut: () => 480 }, { dt: 'B', ngay: 0, n: 10, phut: () => 500 }]);
  const chay = (nSong) => GD.tinhGioDen(R, { moc: 'B', nguong: BT.NGUONG_MAC_DINH, ngays: NGAYS10(R), nSong, chon: ['A', 'B'] });
  const v7 = chay(7); const v30 = chay(30); const v31 = chay(31);
  assert.deepEqual([v7.nguong_ap_dung.mau_toi_thieu_ap_dung, v30.nguong_ap_dung.mau_toi_thieu_ap_dung, v31.nguong_ap_dung.mau_toi_thieu_ap_dung], [24, 100, 104]);
  assert.deepEqual(v7.duong_thu.map((x) => [x.khoa, x.co.mau_it]), [['A', false], ['B', true]], '7 ngày: ngưỡng 24, A (60) đủ mẫu, B (10) mẫu ít');
  assert.deepEqual(v30.duong_thu.map((x) => [x.khoa, x.co.mau_it]), [['A', true], ['B', true]], '30 ngày: ngưỡng 100, cả hai mẫu ít');
  assert.ok(v30.duong_thu.every((x) => !x.co.san_luong_khong_deu && !x.co.gio_den_khong_co_dinh && !x.co.nhieu_kien_di_ngoai && !x.co.san_luong_lon));
});

test('dòng «Khác» và tổng: Σ đường thư hiển thị + khac = tong theo bưu gửi, kg và từng giờ; không chọn thì 5 đường lớn nhất; đường thư không tên là dòng riêng (không vào «Khác» khi được chọn)', () => {
  const R = bo10();
  const v = GD.tinhGioDen(R, { moc: 'A', nguong: NG_TEST, ngays: NGAYS10(R), nSong: 10 });
  assert.equal(v.duong_thu.length, 5);
  assert.equal(v.khac.so_duong_thu, 5);
  assert.equal(v.duong_thu.reduce((s, x) => s + x.shbg, 0) + v.khac.shbg, v.tong.shbg);
  for (let h = 0; h < 24; h++) assert.equal(v.duong_thu.reduce((s, x) => s + x.theo_gio[h].shbg, 0) + v.khac.theo_gio[h].shbg, v.tong.theo_gio[h].shbg, `giờ ${h}`);
  assert.equal(v.duong_thu.reduce((s, x) => s + x.kg, 0) + v.khac.kg, v.tong.kg);
  assert.equal(v.danh_sach.length, 10);
  const R2 = dungR([{ dt: 'X', ten: null, ngay: 0, n: 50, phut: () => 480 }, { dt: 'Y', ngay: 0, n: 40, phut: () => 500 }]);
  const v2 = GD.tinhGioDen(R2, { moc: 'B', nguong: NG_TEST, ngays: NGAYS10(R2), nSong: 10, chon: ['X'] });
  assert.deepEqual(v2.duong_thu.map((x) => [x.khoa, x.ten]), [['X', null]]);
  assert.equal(v2.khac.so_duong_thu, 1);
});

test('meo_theo_lo ở cấp đường thư: chỉ mốc A; true khi trung vị A lệch mốc B từ ktt_bt_meo_theo_lo_phut của một chuyến; mốc B = null', () => {
  const R = dungR([{ dt: 'D', ngay: 0, n: 10, phut: () => 480 }]);
  R.cot.tA = R.cot.tA.map(() => 480 + 400); // A lệch B (480) 400 phút
  const a = GD.tinhGioDen(R, { moc: 'A', nguong: NG_TEST, ngays: NGAYS10(R), nSong: 10 }).duong_thu[0];
  const b = GD.tinhGioDen(R, { moc: 'B', nguong: NG_TEST, ngays: NGAYS10(R), nSong: 10 }).duong_thu[0];
  assert.equal(a.meo_theo_lo, true);
  assert.equal(b.meo_theo_lo, null);
});

test('conLaiTheoGio (hàm thuần): con_lai_gio ÂM khi chuyến kế tiếp cách nhiều ngày; null khi không xếp được chuyến (không trả 0); Thuận Hóa có con_lai_12h, BCVH khác null', () => {
  const m = new Database(':memory:');
  try {
    ensureKttSchema(m);
    m.prepare('DELETE FROM ktt_lich_chuyen WHERE ma_bcvh IN (?, ?)').run(TH, TA);
    m.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung, cap_nhat_luc) VALUES (?, '20:00', 'NGHI_CN', 'Giả', 1, '2026-11-05 00:00:00')").run(TH);
    const d = L.docLichChuyen(m);
    const ra = GD.conLaiTheoGio(d.lich, d.hanDenTruocChuyenPhut, { loaiNgay: 'chu_nhat' });
    const th = ra.find((x) => x.ma_bcvh === TH).loai_ngay[0].gio;
    // Chủ nhật 08:30: chuyến 20:00 nghỉ Chủ nhật -> thứ Hai 20:00; chờ = 08:30→21:00 (12,5) + 07:00→20:00 (13) = 25,5 giờ -> còn lại 14 − 25,5 = −11,5
    assert.equal(th[8].gio_xe_ke_tiep, '20:00');
    assert.equal(th[8].sang_ngay_sau, true);
    assert.equal(th[8].cho_theo_lich_gio, 25.5);
    assert.equal(th[8].con_lai_gio, -11.5);
    assert.equal(th[8].con_lai_12h, -13.5);
    assert.equal(th[8].gio_chot, '19:00');
    // Thuận An không còn dòng lịch nào: không xếp được -> null cả hàng
    const ta = ra.find((x) => x.ma_bcvh === TA).loai_ngay[0].gio;
    assert.ok(ta.every((g) => g.con_lai_gio === null && g.cho_theo_lich_gio === null && g.gio_xe_ke_tiep === null && g.gio_chot === null && g.sang_ngay_sau === null && g.con_lai_12h === null));
    assert.equal(ra.find((x) => x.ma_bcvh === HY).loai_ngay[0].gio[8].con_lai_12h, null, 'BCVH không có ngoại lệ 12 giờ: con_lai_12h = null');
  } finally { m.close(); }
});

test('kiểm tĩnh: lõi thuần kttGioDen.js không đọc DB, đồng hồ máy hay Date.parse; không ghi cứng giờ xe', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../server/lib/kttGioDen.js'), 'utf8');
  assert.doesNotMatch(src, /require\('(better-sqlite3|\.\.\/db|\.\/thamSo)'\)|Date\.now|Date\.parse|new Date\(\)|\.prepare\(/);
  assert.doesNotMatch(src, /['"](06:30|12:30|07:00|12:45|07:30)['"]/);
});

// ---------- API ----------
test('API gio-den: Σ theo_gio[24] = shbg; Σ đường thư + khac = tong; kiện ≤ shbg; hai mốc cùng mẫu số (mốc A đo được ít hơn 1); ngoai_pham_vi', async () => {
  duLieu();
  const r = await goi(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den${QS()}`, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.moc, 'A');
  assert.deepEqual(r.body.so_ngay, { tong: 7, thuong: 6, chu_nhat: 1 });
  assert.deepEqual(Object.keys(r.body.theo_moc), ['A', 'B']);
  const A = r.body.theo_moc.A; const B = r.body.theo_moc.B;
  assert.equal(A.mau_so, B.mau_so);
  assert.equal(B.do_duoc, B.mau_so);
  assert.equal(A.do_duoc, A.mau_so - 1, 'mốc A: một bưu gửi không có xác nhận BD10');
  for (const v of [A, B]) {
    assert.equal(v.do_duoc, v.tong.shbg);
    assert.equal(v.duong_thu.reduce((s, x) => s + x.shbg, 0) + v.khac.shbg, v.tong.shbg, 'Σ đường thư + Khác = tổng');
    for (let h = 0; h < 24; h++) assert.equal(v.duong_thu.reduce((s, x) => s + x.theo_gio[h].shbg, 0) + v.khac.theo_gio[h].shbg, v.tong.theo_gio[h].shbg);
    assert.equal(v.tong.theo_gio.reduce((s, x) => s + x.shbg, 0), v.tong.shbg);
    for (const x of v.duong_thu) {
      assert.equal(TONG24(x), x.shbg, `${x.khoa}: Σ 24 giờ = shbg`);
      assert.equal(x.theo_gio.length, 24);
      assert.ok(x.kien_di_ngoai.shbg <= x.shbg);
      assert.equal(x.theo_gio.reduce((s, g) => s + g.kien_di_ngoai, 0), x.kien_di_ngoai.shbg);
      assert.ok(x.theo_gio.every((g) => g.kien_di_ngoai <= g.shbg));
    }
    assert.equal(v.danh_sach.reduce((s, x) => s + x.shbg, 0), v.tong.shbg);
  }
  assert.deepEqual(Object.keys(r.body.ngoai_pham_vi).slice(0, 4), ['di_ngoai_6_bcvh', 'khong_ro_dich', 'khong_co_gio_quet', 'hang_hoan']);
  assert.doesNotMatch(JSON.stringify(r.body), /KTT-DEMO|BD10-/, 'không số hiệu bưu gửi / BD10 trong phản hồi');
});

test('API gio-den: DT-A giờ theo hai chuyến (05h và 11h), chuyến mỗi ngày một giờ; tách ngày thường / Chủ nhật; loai_ngay lọc đúng', async () => {
  duLieu();
  const r = await goi(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den${QS({ duong_thu: 'DT-A' })}`, 'ttvh');
  assert.equal(r.status, 200);
  const a = r.body.theo_moc.B.duong_thu[0];
  assert.equal(a.khoa, 'DT-A');
  assert.equal(a.ten, 'Tên DT-A');
  assert.equal(a.shbg, 40);
  assert.equal(a.theo_gio[5].shbg, 24);
  assert.equal(a.theo_gio[11].shbg, 16);
  assert.equal(a.theo_gio.filter((g) => g.shbg > 0).length, 2);
  assert.equal(a.chuyen.length, 2, 'hai chuyến thư đến');
  assert.equal(a.gio_den_ngay.so_mau, 8, '4 ngày × 2 chuyến');
  assert.equal(a.gio_den_ngay.so_chuyen_ngay, 2);
  assert.deepEqual([a.gio_den_ngay.p10, a.gio_den_ngay.p90, a.gio_den_ngay.do_rong_phut], ['05:15', '11:20', 365]);
  assert.deepEqual([a.san_luong_ngay.ngay_thuong.so_ngay_cua_so, a.san_luong_ngay.ngay_thuong.so_ngay_co_hang, a.san_luong_ngay.chu_nhat.so_ngay_cua_so, a.san_luong_ngay.chu_nhat.so_ngay_co_hang], [6, 3, 1, 1]);
  assert.equal(a.san_luong_ngay.ngay_thuong.tong, 30);
  assert.equal(a.san_luong_ngay.chu_nhat.tong, 10);
  assert.equal(a.trong_tui.shbg + a.kien_di_ngoai.shbg, a.shbg);
  const cn = await goi(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den${QS({ duong_thu: 'DT-A', loai_ngay: 'chu_nhat' })}`, 'admin');
  assert.equal(cn.body.theo_moc.B.duong_thu[0].shbg, 10, 'chỉ ngày Chủ nhật 11/10');
  const th = await goi(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den${QS({ duong_thu: 'DT-A', loai_ngay: 'thuong' })}`, 'admin');
  assert.equal(th.body.theo_moc.B.duong_thu[0].shbg, 30);
  assert.equal(th.body.theo_moc.B.tong.shbg + cn.body.theo_moc.B.tong.shbg, r.body.theo_moc.B.tong.shbg, 'thường + Chủ nhật = tất cả');
});

test('API gio-den: DT-G60 một chuyến, DT-G61 hai chuyến; đường thư không tên (ten null) và hàng không mã (__RONG__) là dòng riêng; mẫu ít co theo 7 ngày (24)', async () => {
  duLieu();
  const chon = ['DT-G60', 'DT-G61', 'DT-N', '__RONG__', 'DT-X', 'DT-K'].map((k) => `&duong_thu=${encodeURIComponent(k)}`).join('');
  const r = await goi(`${BASE}/gio-den${QS({ moc: 'B' })}${chon}`, 'admin');
  assert.equal(r.status, 200);
  const v = r.body.theo_moc.B;
  const pick = (k) => v.duong_thu.find((x) => x.khoa === k);
  assert.equal(pick('DT-G60').chuyen.length, 1);
  assert.equal(pick('DT-G61').chuyen.length, 2);
  assert.equal(pick('DT-N').ten, null);
  assert.equal(pick('DT-N').ma, 'DT-N');
  assert.equal(pick('__RONG__').ma, null);
  assert.equal(pick('__RONG__').ten, null);
  assert.equal(pick('__RONG__').shbg, 5);
  assert.equal(v.nguong_ap_dung.mau_toi_thieu_ap_dung, 24);
  assert.equal(pick('DT-X').co.mau_it, true);
  assert.equal(pick('DT-K').co.mau_it, true, '12 bưu gửi < 24');
  assert.equal(v.khac.so_duong_thu, v.danh_sach.length - 6, 'đường thư được chọn không nằm trong Khác');
});

test('API gio-den/theo-ngay: mọi ngày của khoảng, cờ Chủ nhật, co_hang, mỗi chuyến một giờ giữa; dải thường gặp trên các giờ-chuyến-ngày', async () => {
  duLieu();
  const r = await goi(`${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'DT-A', moc: 'B' })}`, 'ttkt');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.duong_thu, { khoa: 'DT-A', ma: 'DT-A', ten: 'Tên DT-A' });
  const B = r.body.theo_moc.B;
  assert.equal(B.ngay.length, 7);
  assert.deepEqual(B.ngay.map((d) => d.ngay), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  assert.deepEqual(B.ngay.map((d) => d.la_chu_nhat), [true, false, false, false, false, false, false]);
  assert.deepEqual(B.ngay.map((d) => d.co_hang), [true, true, true, false, false, false, true]);
  const d1 = B.ngay[0];
  assert.deepEqual(d1.chuyen.map((c) => [c.thu_tu, c.gio_giua, c.shbg]), [[1, '05:15', 6], [2, '11:20', 4]]);
  assert.equal(d1.shbg, 10);
  assert.deepEqual(B.ngay[3].chuyen, []);
  assert.equal(B.ngay[3].shbg, 0);
  assert.deepEqual([B.dai_thuong_gap.p10, B.dai_thuong_gap.trung_vi, B.dai_thuong_gap.p90, B.dai_thuong_gap.so_mau], ['05:15', '11:20', '11:20', 8]);
  assert.equal(B.so_ngay_co_hang, 4);
  assert.equal(B.so_ngay_cua_so, 7);
  assert.equal(B.chuyen_cua_duong_thu.length, 2);
  const thuong = await goi(`${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'DT-A', moc: 'B', loai_ngay: 'thuong' })}`, 'admin');
  assert.equal(thuong.body.theo_moc.B.ngay.length, 7, 'danh sách ngày không phụ thuộc loai_ngay');
  assert.equal(thuong.body.theo_moc.B.so_ngay_co_hang, 3);
  assert.equal(thuong.body.theo_moc.B.so_ngay_cua_so, 6);
  const rong = await goi(`${BASE}/gio-den/theo-ngay${QS({ duong_thu: '__RONG__' })}`, 'admin');
  assert.equal(rong.status, 200);
  assert.equal(rong.body.duong_thu.ma, null);
});

test('API con-lai-theo-gio: lịch chuẩn 05/11 từ hệ thống; Hương Thủy 06:30 -> chuyến 07:30 còn 13,5 giờ; Thuận Hóa 06:30 -> 12:45 còn 8,25 giờ, con_lai_12h 6,25; Chủ nhật Hương Thủy 12:30 -> sang thứ Hai', async () => {
  const r = await goi(`${BASE}/con-lai-theo-gio`, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.theo_bcvh.length, 6);
  const hy = r.body.theo_bcvh.find((x) => x.ma_bcvh === HY);
  const th = r.body.theo_bcvh.find((x) => x.ma_bcvh === TH);
  assert.deepEqual(hy.loai_ngay.map((x) => x.loai_ngay), ['thuong', 'chu_nhat']);
  assert.equal(hy.chi_tieu_gio, 14);
  assert.equal(hy.chi_tieu_gio_ngoai_le, null);
  assert.equal(th.chi_tieu_gio_ngoai_le.gio, 12);
  const hyT = hy.loai_ngay[0].gio; const thT = th.loai_ngay[0].gio;
  assert.equal(hyT.length, 24);
  assert.deepEqual([hyT[6].gio_xe_ke_tiep, hyT[6].gio_chot, hyT[6].cho_theo_lich_gio, hyT[6].con_lai_gio, hyT[6].sang_ngay_sau], ['07:30', '06:30', 0.5, 13.5, false]);
  assert.deepEqual([thT[6].gio_xe_ke_tiep, thT[6].gio_chot, thT[6].con_lai_gio, thT[6].con_lai_12h, thT[6].chi_tieu_gio], ['12:45', '11:45', 8.25, 6.25, 14]);
  assert.equal(thT[3].con_lai_gio, 14, 'đêm 21:00–07:00 không tính: hàng đến 03:30, xe 07:00 -> còn đủ 14 giờ');
  assert.equal(hyT[3].con_lai_gio, 13.5, 'Hương Thủy xe 07:30: chỉ 30 phút sau 07:00 được tính');
  assert.equal(hy.loai_ngay[1].gio[12].gio_xe_ke_tiep, '07:30', 'Chủ nhật: chuyến 12:45 nghỉ -> chuyến kế tiếp là thứ Hai 07:30');
  assert.equal(hy.loai_ngay[1].gio[12].sang_ngay_sau, true);
  assert.equal(hy.loai_ngay[1].gio[12].con_lai_gio, 5);
  assert.ok(r.body.theo_bcvh.filter((x) => x.ma_bcvh !== TH).every((b) => b.loai_ngay.every((l) => l.gio.every((g) => g.con_lai_12h === null))));
  const al = r.body.theo_bcvh.find((x) => x.ma_bcvh === AL).loai_ngay[1].gio[9];
  assert.equal(al.gio_xe_ke_tiep, '08:00', 'A Lưới chạy cả Chủ nhật');
  const loc = await goi(`${BASE}/con-lai-theo-gio?bcvh=${TH}&loai_ngay=chu_nhat`, 'ttvh');
  assert.equal(loc.body.theo_bcvh.length, 1);
  assert.equal(loc.body.theo_bcvh[0].loai_ngay.length, 1);
  assert.equal(loc.body.meta.han_den_truoc_chuyen_phut, 60);
  assert.doesNotMatch(JSON.stringify(r.body), /KTT-DEMO|BD10-/);
});

test('API con-lai-theo-gio: giá trị không tính được là null (xóa hết lịch Thuận An), đổi lịch có hiệu lực ngay (không đệm)', async () => {
  const cu = db.prepare('SELECT * FROM ktt_lich_chuyen WHERE ma_bcvh = ?').all(TA);
  assert.ok(cu.length > 0);
  try {
    db.prepare('DELETE FROM ktt_lich_chuyen WHERE ma_bcvh = ?').run(TA);
    const r = await goi(`${BASE}/con-lai-theo-gio?bcvh=${TA}`, 'admin');
    assert.equal(r.status, 200);
    assert.ok(r.body.theo_bcvh[0].loai_ngay.every((l) => l.gio.every((g) => g.con_lai_gio === null && g.gio_xe_ke_tiep === null)));
  } finally {
    for (const x of cu) db.prepare('INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, ghi_chu, dang_dung, cap_nhat_luc, ngay_chay_xac_nhan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(x.ma_bcvh, x.gio_xuat_phat, x.ngay_chay, x.nhan, x.ghi_chu, x.dang_dung, x.cap_nhat_luc, x.ngay_chay_xac_nhan);
  }
  const r2 = await goi(`${BASE}/con-lai-theo-gio?bcvh=${TA}`, 'admin');
  assert.ok(r2.body.theo_bcvh[0].loai_ngay[0].gio.some((g) => g.con_lai_gio !== null));
});

test('quyền: ba route mới — không token 401; ADMIN, TTVH, TTKT 200; GDVH, TIVI 403; chỉ GET', async () => {
  duLieu();
  for (const url of [`${BASE}/gio-den${QS()}`, `${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'DT-A' })}`, `${BASE}/con-lai-theo-gio`]) {
    assert.equal((await goi(url, null)).status, 401, url);
    for (const w of ['admin', 'ttvh', 'ttkt']) assert.equal((await goi(url, w)).status, 200, `${w} ${url}`);
    for (const w of ['gdvh', 'tivi']) assert.equal((await goi(url, w)).status, 403, `${w} ${url}`);
    const post = await fetch(`${ctx.baseUrl}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}` } });
    assert.ok([404, 405].includes(post.status), `POST ${url} -> ${post.status}`);
    const ttktPost = await fetch(`${ctx.baseUrl}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.ttkt}` } });
    assert.equal(ttktPost.status, 403, 'TTKT chỉ GET (allowlist)');
  }
});

test('tham số: duong_thu lạ -> 400 (cả hai route); quá 8 đường thư -> 400; thiếu duong_thu ở theo-ngay -> 400; khóa lạ, bcvh sai, moc sai, lặp -> 400; chưa có dữ liệu -> co_du_lieu false', async () => {
  const rong = await goi(`${BASE}/gio-den${QS()}`, 'admin');
  assert.equal(rong.status, 200);
  assert.deepEqual([rong.body.co_du_lieu, rong.body.ly_do, rong.body.theo_moc], [false, 'CHUA_CO_DU_LIEU', null]);
  const rongNgay = await goi(`${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'DT-A' })}`, 'admin');
  assert.equal(rongNgay.status, 200);
  assert.equal(rongNgay.body.co_du_lieu, false);
  duLieu();
  const la = await goi(`${BASE}/gio-den${QS({ duong_thu: 'KHONG-CO' })}`, 'admin');
  assert.equal(la.status, 400); assert.match(la.body.error, /duong_thu/);
  const la2 = await goi(`${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'KHONG-CO' })}`, 'admin');
  assert.equal(la2.status, 400); assert.match(la2.body.error, /duong_thu/);
  const nhieu = `${BASE}/gio-den${QS()}&${Array.from({ length: 9 }, (_, i) => `duong_thu=D${i}`).join('&')}`;
  const r9 = await goi(nhieu, 'admin');
  assert.equal(r9.status, 400); assert.match(r9.body.error, /tối đa 8/);
  const tam = await goi(`${BASE}/gio-den${QS()}&${Array.from({ length: 8 }, () => 'duong_thu=DT-A').join('&')}`, 'admin');
  assert.equal(tam.status, 200, 'trùng mã được gộp, không tính là 8 đường thư');
  for (const [url, re] of [
    [`${BASE}/gio-den/theo-ngay${QS()}`, /duong_thu/], [`${BASE}/gio-den${QS({ x: '1' })}`, /không hỗ trợ/], [`${BASE}/gio-den${QS({ bcvh: '999999' })}`, /bcvh/],
    [`${BASE}/gio-den${QS({ moc: 'Z' })}`, /moc/], [`${BASE}/gio-den/theo-ngay${QS({ duong_thu: 'DT-A' })}&duong_thu=DT-K`, /một lần/], [`${BASE}/gio-den${QS({ duong_thu: 'a;b' })}`, /duong_thu/],
    [`${BASE}/gio-den?tu=2026-10-11`, /tu|den/], [`${BASE}/con-lai-theo-gio?tu=2026-10-11`, /không hỗ trợ/], [`${BASE}/con-lai-theo-gio?loai_ngay=x`, /loai_ngay/]
  ]) {
    const r = await goi(url, 'admin');
    assert.equal(r.status, 400, url);
    assert.match(r.body.error, re, url);
  }
});

test('không đổi route cũ: ba route bức tranh vẫn đủ khóa, nguong_ap_dung không có khóa mới của KTT-KD-3b', async () => {
  duLieu();
  const r = await goi(`${BASE}${QS()}`, 'admin');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.theo_moc.A.nguong_ap_dung).sort(), ['chuyenGomHeSo', 'conLaiGio', 'cumNhoShbg', 'gapPhut', 'kienDiNgoaiPct', 'kienNgoaiPhanVi', 'mauToiThieu', 'meoTheoLoPhut', 'ngayToiThieu', 'phan_vi_dao_dong', 'phan_vi_do_rong_phut', 'phan_vi_kien_ngoai', 'phanViTuongDoi', 'satGioChotPhut', 'so_cum_tinh_nguong', 'tyLeNganConLaiPct'].sort());
});
