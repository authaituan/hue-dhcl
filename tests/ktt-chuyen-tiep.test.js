// ==========================================
// Test KTT-14: hàng «chuyển tiếp đi» (túi CHUYEN_TIEP_DI, KTT không mở túi) nằm trong tập Lưu thoát và mọi bảng dựa trên nó.
// Quy tắc: SHBG tính MỘT lần; có túi ĐẾN -> cách tính cũ (nguon_hang = khai_thac); chỉ có túi chuyển tiếp -> nguon_hang = chuyen_tiep, một dòng túi mang cả lần đến lẫn lần đi.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx). Không mở data/, không DB thật, không mạng. 20/10/2026 là thứ Ba. Độ mới 23/10 10:00.
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

const PORT = 5976;
const TH = '533140'; const HT = '535470';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db; let token; let tokenGdvh;
const khoiPhuc = [];

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-chuyen-tiep-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  seedUser(db, { hrmCode: 'KT14_TTVH', fullName: 'KT14_TTVH', role: 'TTVH', password: 'Ttvh@123' });
  seedUser(db, { hrmCode: 'KT14_GDVH', fullName: 'KT14_GDVH', role: 'GDVH', password: 'Gdvh@123' });
  token = (await loginAs(ctx.baseUrl, 'KT14_TTVH', 'Ttvh@123')).body.token;
  tokenGdvh = (await loginAs(ctx.baseUrl, 'KT14_GDVH', 'Gdvh@123')).body.token;
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
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: BAY_GIO, cap_nhat_luc: BAY_GIO };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
/** Hàng khai thác lại: túi ĐẾN (mở túi) + túi ĐI. */
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null, phuong = '49122' }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: 'TH-01', bd10_den_ten_duong_thu: 'Đường thư giả' });
  bg(den, shbg, { ma_xa_phuong: phuong });
  if (gioDi || nhan) {
    const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
    bg(di, shbg, { ma_xa_phuong: phuong });
  }
}
/** Hàng chuyển tiếp đi: MỘT túi CHUYEN_TIEP_DI (cả nơi gửi lẫn nơi nhận của túi đều không phải KTT) mang cả lần đến lẫn lần đi. shbgs: một hoặc nhiều SHBG cùng túi. */
function ct(shbgs, { quet, gioDi = null, nhan = TH, xnd, diemGui = '999001', luong = 'DI_NGOAI', phuong = '49122' }) {
  const t = tui({
    chieu: 'CHUYEN_TIEP_DI', luong, to_pos: '999002', co_mo_tui: 0, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-C-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui,
    bd10_den_ma_duong_thu: 'CT-01', bd10_den_ten_duong_thu: 'Đường thư chuyển tiếp giả', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-CI-${seq}` : null, bd10_di_ma_diem_nhan: nhan
  });
  for (const s of [].concat(shbgs)) bg(t, s, { ma_xa_phuong: phuong });
  return t;
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/**
 * Bộ dữ liệu: 20/10 — khai thác: K1 (t1), K2 (t3). Chuyển tiếp: C1 (t1, đi ngoài), C2 + C3 + C4 (túi chia sẵn, cùng một túi: C2 t1, C3 t3, C4 chưa đi lỡ chuyến -> t5),
 * CX (đích ngoài 6 BCVH), CK (không rõ đích), CH (hàng hoàn Tổ KHHH), CM (thiếu giờ quét túi đến), CD (xác nhận BD10 đến SAU giờ lập BD10 đi).
 * Cả hai loại túi: B1 (túi ĐẾN + túi chuyển tiếp trước đó) — phải tính MỘT lần, theo túi ĐẾN. 21/10: C5 (t1). 23/10 (độ mới 10:00): C6 (đang chờ chuyến).
 */
function duLieu() {
  kt('KTT-DEMO-K1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // khai thác, t1
  kt('KTT-DEMO-K2', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // khai thác, t3
  ct('KTT-DEMO-C1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // chuyển tiếp, t1
  ct(['KTT-DEMO-C2'], { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', luong: 'DA_CHIA_SAN', nhan: HT }); // túi chia sẵn, t1 (Hương Trà)
  ct('KTT-DEMO-C3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00', luong: 'DA_CHIA_SAN' }); // t3
  ct('KTT-DEMO-C4', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi, lỡ chuyến 12:30 -> t5; không rõ nơi nhận nên đích theo phường/xã (49122 -> Thuận Hóa)
  ct('KTT-DEMO-CX', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', nhan: '700123' }); // ngoài 6 BCVH (KHAC)
  ct('KTT-DEMO-CK', { quet: '2026-10-20 08:00:00', nhan: null, phuong: '00000' }); // không rõ đích
  ct('KTT-DEMO-CH', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '531120' }); // hàng hoàn Tổ KHHH (531120 -> Thuận Hóa): tách riêng
  ct('KTT-DEMO-CM', { quet: null, xnd: '2026-10-20 07:00:00', gioDi: '2026-10-20 09:00:00' }); // thiếu giờ quét túi đến
  ct('KTT-DEMO-CD', { quet: '2026-10-20 05:30:00', xnd: '2026-10-20 12:00:00', gioDi: '2026-10-20 06:50:00' }); // XNĐ sau giờ đi: mốc A không đo được, mốc B đo được
  // cả hai loại túi (chuyển tiếp 19/10 trước, rồi túi ĐẾN 20/10): tính MỘT lần, nguon_hang = khai_thac
  ct('KTT-DEMO-B1', { quet: '2026-10-19 20:00:00', gioDi: '2026-10-19 22:30:00' });
  kt('KTT-DEMO-B1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  ct('KTT-DEMO-C5', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' }); // 21/10, t1
  ct('KTT-DEMO-C6', { quet: '2026-10-23 08:00:00', nhan: null }); // đang chờ chuyến 12:30
  capOk(BAY_GIO);
  Api.xoaCache();
}

async function goi(url, tk = token) {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: { Authorization: `Bearer ${tk}` } });
  const ct2 = res.headers.get('content-type') || '';
  if (ct2.includes('json')) return { status: res.status, body: await res.json() };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
}
const tu = '2026-10-20'; const den = '2026-10-23';
const QDAY = `?tu=${tu}&den=${den}`;
const chip = (k) => ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'].reduce((s, m) => s + k.trang_thai[m].shbg, 0);
async function dsChiTiet(loai, them2 = '') {
  const r = await goi(`/api/ktt/chi-tiet${QDAY}&loai=${loai}&page_size=200${them2}`);
  assert.equal(r.status, 200);
  return r.body;
}

// ---------- 1. tập SHBG ----------
test('SHBG chỉ có túi chuyển tiếp nằm trong tập: đi cùng ngày / hôm sau / chưa đi; tính một lần; cờ nguồn', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const n20 = lt.theo_ngay.find((x) => x.ngay === '2026-10-20');
  // 20/10: K1 K2 | C1 C2 C3 C4 CX CK CH CM CD | B1 = 12 SHBG (B1 chỉ một lần)
  assert.equal(n20.tong_shbg_ngay, 12);
  const ts = n20.tong.trang_thai;
  assert.deepEqual([ts.t1.shbg, ts.t2.shbg, ts.t3.shbg, ts.t4.shbg, ts.t5.shbg, ts.dang_cho_chuyen.shbg], [5, 0, 2, 0, 1, 0], 't1: K1 C1 C2 CD B1; t3: K2 C3; t5: C4');
  assert.equal(n20.hang_hoan.tong_shbg, 1, 'CH là hàng hoàn Tổ KHHH (chuyển tiếp từ 531120 về Thuận Hóa)');
  assert.equal(n20.ngoai_bay_chip.ngoai_pham_vi.KHAC, 1);
  assert.equal(n20.ngoai_bay_chip.khong_ro_dich, 1);
  assert.equal(n20.ngoai_bay_chip.khong_co_gio_quet_den, 1, 'CM');
  assert.equal(chip(n20.tong) + n20.hang_hoan.tong_shbg + n20.ngoai_bay_chip.tong, n20.tong_shbg_ngay, 'đẳng thức tập = các nhóm');
  const n21 = lt.theo_ngay.find((x) => x.ngay === '2026-10-21');
  assert.equal(n21.tong.trang_thai.t1.shbg, 1, 'C5');
  const n23 = lt.theo_ngay.find((x) => x.ngay === '2026-10-23');
  assert.equal(n23.tong.trang_thai.dang_cho_chuyen.shbg, 1, 'C6');
  assert.equal(lt.tong_cong.tong_shbg_ngay, 14);
  assert.equal(lt.meta.shbg_chuyen_tiep, 11, 'C1…C6, CX, CK, CH, CM, CD');
  assert.equal(lt.meta.co_ca_hai_loai_tui, 1, 'B1');
  // mẫu số = 5 trạng thái đã chốt: t1 5 + t3 2 + t5 1 (ngày 20) + t1 1 (ngày 21) = 9; đúng cả khi tách hai cờ
  assert.equal(lt.tong_cong.luu_thoat.mau_so, 9);
});

test('cờ nguồn: theo_nguon_hang cộng lại = tổng; mỗi cờ có đẳng thức riêng; chi-tiet mang nguon_hang', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  for (const k of [lt.tong_cong, ...lt.theo_ngay]) {
    const kt2 = k.theo_nguon_hang.khai_thac; const ct2 = k.theo_nguon_hang.chuyen_tiep;
    assert.equal(kt2.tong_shbg_ngay + ct2.tong_shbg_ngay, k.tong_shbg_ngay);
    for (const g of [kt2, ct2]) assert.equal(chip(g.tong) + g.hang_hoan_shbg + g.ngoai_bay_chip.tong, g.tong_shbg_ngay);
    assert.equal(chip(kt2.tong) + chip(ct2.tong), chip(k.tong || k), 'năm trạng thái + đang chờ: hai cờ cộng lại = tổng');
    assert.equal(kt2.hang_hoan_shbg + ct2.hang_hoan_shbg, k.hang_hoan.tong_shbg);
    assert.equal(kt2.ngoai_bay_chip.tong + ct2.ngoai_bay_chip.tong, k.ngoai_bay_chip.tong);
  }
  assert.equal(lt.tong_cong.theo_nguon_hang.khai_thac.tong_shbg_ngay, 3, 'K1, K2, B1');
  assert.equal(lt.tong_cong.theo_nguon_hang.chuyen_tiep.tong_shbg_ngay, 11);
  // chi-tiet: mỗi dòng mang cờ nguồn; số dòng theo cờ khớp
  const t1 = await dsChiTiet('t1');
  const theoCo = {};
  for (const it of t1.items) theoCo[it.shbg] = it.nguon_hang;
  assert.deepEqual(theoCo, { 'KTT-DEMO-K1': 'khai_thac', 'KTT-DEMO-C1': 'chuyen_tiep', 'KTT-DEMO-C2': 'chuyen_tiep', 'KTT-DEMO-CD': 'chuyen_tiep', 'KTT-DEMO-B1': 'khai_thac', 'KTT-DEMO-C5': 'chuyen_tiep' });
  const luong = Object.fromEntries(t1.items.map((it) => [it.shbg, it.luong_tui]));
  assert.equal(luong['KTT-DEMO-C2'], 'DA_CHIA_SAN'); assert.equal(luong['KTT-DEMO-C1'], 'DI_NGOAI'); assert.equal(luong['KTT-DEMO-K1'], 'KHAI_THAC_DEN');
});

test('SHBG có cả hai loại túi: không đếm đôi (một dòng, theo túi ĐẾN), kể cả khi túi chuyển tiếp nằm ở ngày khác trong khoảng', async () => {
  // B1 có túi chuyển tiếp 20/10 05:30 (đi 06:50) VÀ túi ĐẾN 21/10 — tính đúng một lần, ở ngày của túi ĐẾN
  kt('KTT-DEMO-B1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' });
  ct('KTT-DEMO-B1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  capOk(BAY_GIO);
  Api.xoaCache();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  assert.equal(lt.tong_cong.tong_shbg_ngay, 1);
  assert.equal(lt.theo_ngay.find((x) => x.ngay === '2026-10-20').tong_shbg_ngay, 0);
  assert.equal(lt.theo_ngay.find((x) => x.ngay === '2026-10-21').tong_shbg_ngay, 1);
  assert.equal(lt.tong_cong.theo_nguon_hang.khai_thac.tong_shbg_ngay, 1);
  assert.equal(lt.tong_cong.theo_nguon_hang.chuyen_tiep.tong_shbg_ngay, 0);
  // cùng kết quả khi chỉ hỏi ngày 20/10: SHBG này không được đếm ở đó
  const m20 = (await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-20')).body;
  assert.equal(m20.tong_cong.tong_shbg_ngay, 0);
});

test('SHBG nằm trong nhiều túi chuyển tiếp: tính một lần, theo dòng có giờ lập BD10 đi muộn nhất; túi ĐI khác (tái đóng túi) bị bỏ qua và được đếm', async () => {
  ct('KTT-DEMO-M1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // lần 1
  ct('KTT-DEMO-M1', { quet: '2026-10-20 05:40:00', gioDi: '2026-10-20 13:00:00' }); // lần cuối: đi 13:00 (trượt chuyến 12:30)
  // M2: chuyển tiếp rồi KTT đóng lại túi ĐI khác
  ct('KTT-DEMO-M2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: TH, bd10_di_gio_di: '2026-10-20 14:00:00', gio_quet_tui_di: '2026-10-20 14:00:00', bd10_di_so_hieu: 'BD10-I-M2', bd10_di_ma_diem_nhan: TH });
  bg(di, 'KTT-DEMO-M2');
  capOk(BAY_GIO);
  Api.xoaCache();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  assert.equal(lt.tong_cong.tong_shbg_ngay, 2);
  assert.equal(lt.meta.chuyen_tiep_nhieu_tui, 1);
  assert.equal(lt.meta.chuyen_tiep_co_tui_di_khac, 1);
  const t1 = await dsChiTiet('t1');
  const m2 = t1.items.find((x) => x.shbg === 'KTT-DEMO-M2');
  assert.ok(m2, 'M2 tính theo BD10 đi của chính túi chuyển tiếp (06:50), không theo túi ĐI khác');
  assert.equal(m2.gio_lap_bd10_di, '2026-10-20 06:50:00');
  const t2 = await dsChiTiet('t2');
  assert.deepEqual(t2.items.map((x) => [x.shbg, x.gio_lap_bd10_di]), [['KTT-DEMO-M1', '2026-10-20 13:00:00']], 'M1 theo lần cuối');
});

test('hàng hoàn Tổ KHHH ở túi chuyển tiếp: tách riêng, không vào 14 giờ, không vào mẫu số', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const hoan = lt.tong_cong.hang_hoan;
  assert.equal(hoan.tong_shbg, 1);
  assert.equal(hoan.chi_tieu_14h.theo_moc.xnd.do_duoc + hoan.chi_tieu_14h.theo_moc.quet_tui_den.do_duoc >= 0, true);
  const dsHoan = await dsChiTiet('hang_hoan');
  assert.equal(dsHoan.pagination.total, 1);
  assert.equal(dsHoan.items[0].shbg, 'KTT-DEMO-CH');
  assert.equal(dsHoan.items[0].dat_khong_dat, 'Loại trừ');
  assert.equal(dsHoan.items[0].chi_tieu_14h_xnd, 'Loại trừ'); assert.equal(dsHoan.items[0].chi_tieu_14h_quet_tui_den, 'Loại trừ');
  // mẫu số của chỉ tiêu = SHBG đã phân loại, không có hàng hoàn
  assert.equal(lt.tong_cong.chi_tieu_14h.mau_so, chip(lt.tong_cong));
});

test('chỉ tiêu 14 giờ cho hàng chuyển tiếp: XNĐ sau giờ lập BD10 đi -> mốc A không đo được, mốc B đo được; thiếu giờ quét túi đến không vào mẫu số', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const c14 = lt.tong_cong.chi_tieu_14h;
  assert.equal(c14.theo_moc.xnd.khong_do_duoc.moc_sau_gio_di, 1, 'CD');
  assert.equal(c14.theo_moc.quet_tui_den.do_duoc, 8, 'mốc B đo được: các SHBG đã đi và đã phân loại (K1 K2 C1 C2 C3 CD B1 C5)');
  assert.equal(c14.mau_so, 10, 'mẫu số của khối chi_tieu_14h gồm cả SHBG đang chờ chuyến (C6), như trước KTT-14');
  const mocB = c14.theo_moc.quet_tui_den;
  assert.equal(mocB.dat + mocB.khong_dat, mocB.do_duoc);
  const cd = (await dsChiTiet('t1')).items.find((x) => x.shbg === 'KTT-DEMO-CD');
  assert.equal(cd.chi_tieu_14h_xnd, 'Không đo được (mốc sau giờ lập BD10 đi)'); assert.equal(cd.chi_tieu_14h_quet_tui_den, 'Đạt');
});

// ---------- 2. mọi bảng dùng CÙNG tập ----------
test('chi-tiet, xlsx, B1 (dicungngay), danh-sach, tong-quan cùng tập với /luu-thoat', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  const tc = lt.tong_cong;
  // chi-tiet từng nhóm
  for (const t of ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen']) assert.equal((await dsChiTiet(t)).pagination.total, tc.trang_thai[t].shbg, t);
  assert.equal((await dsChiTiet('hang_hoan')).pagination.total, tc.hang_hoan.tong_shbg);
  assert.equal((await dsChiTiet('ngoai_pham_vi')).pagination.total, 1);
  assert.equal((await dsChiTiet('khong_co_gio_quet_den')).pagination.total, 1);
  assert.equal((await dsChiTiet('ro_lai')).pagination.total, tc.trang_thai.t3.shbg + tc.trang_thai.t4.shbg + tc.trang_thai.t5.shbg);
  // xlsx: số dòng = số hiển thị
  const x = await goi(`/api/ktt/xuat/luu-thoat${QDAY}`);
  assert.equal(x.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buf);
  let n = 0; wb.getWorksheet(X.TEN_SHEET_7).eachRow((row, i) => { if (i > 1) n++; });
  assert.equal(n, tc.tong_shbg_ngay, 'xlsx = tong_shbg_ngay');
  assert.equal(X.soKhop(lt, {}), tc.tong_shbg_ngay);
  assert.equal(wb.getWorksheet(X.TEN_SHEET_7).getRow(1).cellCount, 18, 'sheet 7 vẫn 18 cột');
  const tm = {}; wb.getWorksheet('Thông tin').eachRow((row) => { tm[row.getCell(1).value] = String(row.getCell(2).value); });
  assert.ok(/khớp/.test(tm['Đối chiếu với màn hình Lưu thoát']), tm['Đối chiếu với màn hình Lưu thoát']);
  assert.ok(/chuyển tiếp/.test(tm['Phạm vi bưu gửi']));
  // B1: cùng định nghĩa «cùng ngày»
  const b1 = (await goi(`/api/ktt/dicungngay/tong-hop${QDAY}`)).body;
  const hue = b1.bcvh_hue_khong_hang_hoan;
  assert.equal(hue.mau_so, tc.luu_thoat.mau_so);
  assert.equal(hue.cung_ngay, tc.trang_thai.t1.shbg + tc.trang_thai.t2.shbg);
  assert.equal(hue.hom_sau, tc.trang_thai.t3.shbg + tc.trang_thai.t4.shbg);
  assert.equal(hue.dang_cho_chuyen, tc.trang_thai.dang_cho_chuyen.shbg);
  assert.equal(hue.ro_lai, tc.trang_thai.t3.shbg + tc.trang_thai.t4.shbg + tc.trang_thai.t5.shbg);
  // danh-sach (bấm ô) = ô B1; có nguon_hang
  const hs = (await goi(`/api/ktt/danh-sach${QDAY}&loai=hom-sau&page_size=200`)).body;
  assert.equal(hs.pagination.total, hue.hom_sau);
  assert.deepEqual(hs.items.map((i) => [i.shbg, i.nguon_hang]).sort(), [['KTT-DEMO-C3', 'chuyen_tiep'], ['KTT-DEMO-K2', 'khai_thac']]);
  // tong-quan = B1
  const tq = (await goi(`/api/ktt/tong-quan${QDAY}`)).body;
  assert.deepEqual(tq.di_cung_ngay.the.bcvh_hue_khong_hang_hoan, hue);
});

test('kết quả ghép từng ngày = tính cả khoảng (theo_nguon_hang, meta); API khớp lõi', async () => {
  duLieu();
  const ngays = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
  const tungNgay = ngays.map((d) => QL.luuThoatTheoNgay(db, { tuNgay: d, denNgay: d, bayGio: BAY_GIO }));
  const ghep = QL.ghepKhoang(tungNgay);
  const ca = QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO });
  assert.deepEqual(ghep.tong_cong.theo_nguon_hang, ca.tong_cong.theo_nguon_hang);
  assert.deepEqual(ghep.theo_ngay.map((n) => n.theo_nguon_hang), ca.theo_ngay.map((n) => n.theo_nguon_hang));
  assert.deepEqual(ghep.meta, ca.meta);
  const viaApi = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  assert.deepEqual(viaApi.tong_cong.theo_nguon_hang, JSON.parse(JSON.stringify(ca.tong_cong.theo_nguon_hang)));
});

test('chưa có dữ liệu: theo_nguon_hang toàn số 0, không lỗi', async () => {
  const r = (await goi(`/api/ktt/luu-thoat${QDAY}`)).body;
  assert.equal(r.tong_cong, null);
  for (const n of r.theo_ngay) {
    assert.equal(n.theo_nguon_hang.khai_thac.tong_shbg_ngay, 0); assert.equal(n.theo_nguon_hang.chuyen_tiep.tong_shbg_ngay, 0);
    assert.equal(n.theo_nguon_hang.chuyen_tiep.ngoai_bay_chip.tong, 0);
  }
});

// ---------- 3. quyền ----------
test('GDVH 403 ở các route dùng tập mới; không token 401', async () => {
  duLieu();
  for (const u of ['/api/ktt/luu-thoat', '/api/ktt/chi-tiet', '/api/ktt/xuat/luu-thoat', '/api/ktt/dicungngay/tong-hop', '/api/ktt/danh-sach', '/api/ktt/tong-quan', '/api/ktt/rotlai/theo-duong-thu']) {
    const r = await goi(`${u}${QDAY}&loai=hom-sau`, tokenGdvh);
    assert.equal(r.status, 403, u);
  }
  const khong = await fetch(`${ctx.baseUrl}/api/ktt/luu-thoat${QDAY}`);
  assert.equal(khong.status, 401);
});

// ---------- 4. không đổi cách tính của hàng khai thác ----------
test('hàng khai thác: số y như khi chưa có túi chuyển tiếp (thêm hàng chuyển tiếp không đổi khối khai_thac)', async () => {
  kt('KTT-DEMO-K1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  kt('KTT-DEMO-K2', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' });
  capOk(BAY_GIO); Api.xoaCache();
  const truoc = QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO });
  ct('KTT-DEMO-C1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  ct('KTT-DEMO-C2', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-22 06:30:00' });
  Api.xoaCache();
  const sau = QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO });
  assert.deepEqual(sau.tong_cong.theo_nguon_hang.khai_thac, truoc.tong_cong.theo_nguon_hang.khai_thac);
  assert.equal(truoc.tong_cong.tong_shbg_ngay, 2); assert.equal(sau.tong_cong.tong_shbg_ngay, 4);
});
