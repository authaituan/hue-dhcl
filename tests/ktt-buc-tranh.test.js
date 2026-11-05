// ==========================================
// Test KTT-KD-1 pha 2 (bản sửa 2): «Bức tranh đường thư đến» — băng giờ (chuyến thư đến), cờ theo ngưỡng TƯƠNG ĐỐI (đúng 20% bị gắn trên bộ giả biết trước), «mẫu ít»,
// loại ngày (Chủ nhật), luu_y_lich cho ô Chủ nhật, đẳng thức mẫu số hai mốc, cache theo ngày (hủy đúng ngày), mốc mặc định A, quyền (từ chối mặc định).
// Dữ liệu GIẢ (SHBG KTT-DEMO-xxx); server thật trên DB tạm của harness. Lịch mặc định: Hương Thủy 536250 06:30 + 12:30 NGHI Chủ nhật; Thuận Hóa 533140 07:00, 12:30, 12:55 (nghỉ CN), 19:45, 22:00.
// Ngày: 2026-10-11 và 10-18 là Chủ nhật; 10-12, 10-13 thứ Hai, thứ Ba; bayGio (độ mới) = 2026-10-23 10:00:00 (cửa sổ nạp: từ 10-15).
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const BT = require('../server/lib/kttBucTranh');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');
const { vaiTroAllows } = require('../server/lib/allowlistVaiTro');

const PORT = 5962;
const HY = '536250'; const TH = '533140'; const PL = '535470';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'BT_ADMIN', pass: 'Admin@123', role: 'ADMIN' }, ttvh: { hrm: 'BT_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'BT_GDVH', pass: 'Gdvh@123', role: 'GDVH' }, tivi: { hrm: 'BT_TIVI', pass: 'Tivi@123', role: 'TIVI' }, ttkt: { hrm: 'BT_TTKT', pass: 'Ttkt@123', role: 'TTKT' }
};
before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-bt-${Date.now()}.db` });
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
let seq = 0;
const them = (bang, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); };
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 1000, ...NG, ...o }); }
let soShbg = 0;
/** Một SHBG khai thác về BCVH `nhan`: quét túi đến `quet`, xác nhận BD10 đến `xnd` (mặc định = quet; null = không có), đường thư `dt`, lịch `lich`, luồng `luong`, đi lúc `gioDi`. */
function kt({ quet, xnd, nhan = HY, dt = 'DT-A', lich = 'L1', luong = 'KHAI_THAC_DEN', gioDi = null, bd10 = 'BD10-BT-1', gam = 1000, phuong = '49620' }) {
  soShbg++;
  const shbg = `KTT-DEMO-${String(soShbg).padStart(5, '0')}`;
  const den = tui({ chieu: 'DEN', luong, co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_duong_thu: dt, bd10_den_ten_duong_thu: `Tên ${dt}`, bd10_den_ma_lich: lich, bd10_den_ten_lich: `Lịch ${lich}`, so_hieu_bd8: luong === 'DI_NGOAI' ? shbg : null });
  bg(den, shbg, { ma_xa_phuong: phuong, khoi_luong_thuc_te_g: gam });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg, { ma_xa_phuong: phuong, khoi_luong_thuc_te_g: gam });
  return shbg;
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ngayGio = (ngay, phut) => `${ngay} ${hhmm(phut)}:00`;

/**
 * Bộ dữ liệu có đáp án: đường thư DT-A lịch L1 về Hương Thủy; hai băng giờ trong ngày (≈ 05:00 và ≈ 11:00, cách nhau 6 giờ) trong 3 ngày thường + 1 Chủ nhật;
 * một đường thư DT-X chỉ có 8 bưu gửi (mẫu ít); kiện đi ngoài DT-K (luồng DI_NGOAI); một SHBG không có XNĐ (mốc A không đo được).
 */
function duLieu() {
  const ngays = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-17'];
  for (const ng of ngays) {
    for (let i = 0; i < 6; i++) kt({ quet: ngayGio(ng, 300 + i * 5), xnd: ngayGio(ng, 300 + i * 5 + 3), bd10: `BD10-${ng}-1` }); // băng 05:00–05:25, chuyến 06:30 (hạn 05:30)
    for (let i = 0; i < 4; i++) kt({ quet: ngayGio(ng, 660 + i * 10), xnd: ngayGio(ng, 660 + i * 10 + 400), bd10: `BD10-${ng}-2` }); // băng 11:00–11:30, XNĐ lệch +6 giờ 40 (méo theo lô ở mốc A)
    for (let i = 0; i < 3; i++) kt({ quet: ngayGio(ng, 540 + i), dt: 'DT-K', lich: 'L9', luong: 'DI_NGOAI', bd10: `BD10-${ng}-K` });
  }
  kt({ quet: '2026-10-12 08:00:00', xnd: null, dt: 'DT-N', lich: 'L7', bd10: 'BD10-NOXND' }); // không có XNĐ
  for (let i = 0; i < 8; i++) kt({ quet: ngayGio('2026-10-12', 600 + i), dt: 'DT-X', lich: 'L5', bd10: 'BD10-X' });
  kt({ quet: '2026-10-12 09:00:00', nhan: TH, dt: 'DT-TH', lich: 'L2', bd10: 'BD10-TH' });
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

// ---------- bộ giả cho hàm thuần ----------
const COT = BT.COT;
/** spec: [{ dt, ngay (0..n-1), n (số bưu gửi), phut (hàm i -> phút đến), kien (0|2) }]; 1 BCVH Thuận Hóa, một chuyến. */
function dungR(spec, soNgay = 10, ngayCN = []) {
  const cot = Object.fromEntries(COT.map((k) => [k, []]));
  const tu = { dt: [], dtTen: [], lich: ['L'], lichTen: ['Lịch'], ck: ['533140|07:00|06:00'] };
  const ngayI = [];
  const idx = new Map();
  for (const sp of spec) {
    if (!idx.has(sp.dt)) { idx.set(sp.dt, tu.dt.length); tu.dt.push(sp.dt); tu.dtTen.push(`Tên ${sp.dt}`); }
    for (let i = 0; i < sp.n; i++) {
      const p = sp.phut(i);
      cot.dt.push(idx.get(sp.dt)); cot.lich.push(0); cot.bcvh.push(5); // 5 = Thuận Hóa 533140 trong MA_BCVH_HUE
      cot.nh.push(0); cot.kien.push(sp.kien === undefined ? 0 : sp.kien); cot.kg.push(1); cot.ctg.push(14);
      for (const h of ['A', 'B']) { cot[`t${h}`].push(p); cot[`ck${h}`].push(0); cot[`cho${h}`].push(3600); cot[`bien${h}`].push(500); cot[`hs${h}`].push(0); }
      ngayI.push(sp.ngay);
    }
  }
  const ngays = Array.from({ length: soNgay }, (_, i) => ({ ngay: `2026-10-${String(1 + i).padStart(2, '0')}`, thu: ngayCN.includes(i) ? 'CN' : '2' }));
  return { n: ngayI.length, ngayI, ngays, cot, tu };
}
/** 10 cụm × 10 ngày. Cụm j: sản lượng ngày xen kẽ 50 ± a_j (dao động a_j/50 tăng dần), giờ đến trải w_j phút (tăng dần, mọi khoảng cách ≤ 60 phút nên mỗi đường thư đúng một băng). */
function bo10Cum() {
  const spec = [];
  for (let j = 0; j < 10; j++) {
    for (let d = 0; d < 10; d++) {
      const n = 50 + (d % 2 === 0 ? 1 : -1) * (2 * j + 1);
      spec.push({ dt: `DT${String(j).padStart(2, '0')}`, ngay: d, n, phut: (i) => 480 + (i % (10 + 4 * j)) });
    }
  }
  return dungR(spec);
}

// ---------- hàm thuần ----------
test('chiaBang: khoảng cách đúng bằng ngưỡng giữ một băng, hơn 1 phút thì tách; băng dưới 5 bưu gửi gộp vào băng gần nhất; hai đầu nửa đêm nối thành băng vắt đêm', () => {
  const dem = (xs) => { const a = new Int32Array(1440); for (const [p, n] of xs) a[p] += n; return a; };
  assert.equal(BT.chiaBang(dem([[300, 10], [360, 10]]), 60, 5).length, 1, 'cách đúng 60 phút: cùng băng');
  assert.equal(BT.chiaBang(dem([[300, 10], [361, 10]]), 60, 5).length, 2, 'cách 61 phút: tách');
  assert.equal(BT.chiaBang(dem([[300, 10], [361, 10]]), 120, 5).length, 1, 'đổi ngưỡng 120: gộp');
  const nho = BT.chiaBang(dem([[300, 10], [310, 10], [700, 3], [900, 10]]), 60, 5);
  assert.equal(nho.length, 2, 'băng 3 bưu gửi gộp');
  assert.equal(nho[1].dau, 700, 'gộp vào băng gần nhất (900 cách 200, 310 cách 390)');
  const dem2 = dem([[5, 10], [20, 10], [720, 10], [1430, 10]]);
  const dem3 = BT.chiaBang(dem2, 60, 5);
  assert.equal(dem3.length, 2);
  const vat = dem3.find((b) => b.vat);
  assert.ok(vat && vat.dau === 1430 && vat.cuoi === 20 && vat.shbg === 30, 'băng vắt đêm 23:50 → 00:20');
});

test('nguongTuongDoi: phân vị 80 của 10 giá trị phân biệt gắn cờ đúng 2/10 = 20%; thiếu giá trị thì không có ngưỡng', () => {
  const x = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const nguong = BT.nguongTuongDoi(x, 80);
  assert.equal(x.filter((v) => v >= nguong).length, 2);
  assert.equal(BT.nguongTuongDoi([0.5], 80), null);
  assert.equal(BT.nguongTuongDoi([null, undefined, 0.2], 80), null);
});

test('bộ giả 10 cụm: Thất thường và Không có lịch cố định mỗi cờ gắn ĐÚNG 2 cụm (20%), là hai cụm có dao động / độ rộng lớn nhất; cả hai mốc', () => {
  const R = bo10Cum();
  for (const moc of ['A', 'B']) {
    const v = BT.tinhMoc(R, { moc, nguong: {} });
    assert.equal(v.cum.length, 10);
    const co = (c) => v.cum.filter((x) => x.co[c]).map((x) => x.duong_thu.ma).sort();
    assert.deepEqual(co('that_thuong'), ['DT08', 'DT09'], `${moc}: thất thường`);
    assert.deepEqual(co('khong_co_lich_co_dinh'), ['DT08', 'DT09'], `${moc}: không có lịch cố định`);
    assert.equal(v.thong_ke_co.that_thuong.ty_le, 0.2);
    assert.equal(v.thong_ke_co.khong_co_lich_co_dinh.ty_le, 0.2);
    assert.equal(v.mau_so, R.n); assert.equal(v.do_duoc, R.n);
    // số đo thô đi kèm cờ, ngưỡng áp dụng nằm trong phản hồi
    const c9 = v.cum.find((x) => x.duong_thu.ma === 'DT09');
    assert.ok(c9.so_do.dao_dong > v.nguong_ap_dung.phan_vi_dao_dong - 1e-9 && c9.so_do.do_rong_gio_den_phut >= v.nguong_ap_dung.phan_vi_do_rong_phut);
    assert.equal(c9.san_luong_ngay.ngay_thuong.so_ngay_co_hang, 10);
  }
});

test('«mẫu ít»: cụm dưới 100 bưu gửi ghi mau_it, KHÔNG gắn cờ thất thường / không có lịch / nhiều kiện và không vào phân bố tính ngưỡng', () => {
  const R = bo10Cum();
  // thêm cụm DTZ: 20 bưu gửi, 100% kiện đi ngoài, dao động rất lớn, giờ đến trải rất rộng nhưng liền nhau (một băng)
  const them = dungR([{ dt: 'DTZ', ngay: 0, n: 15, phut: (i) => 400 + i * 4, kien: 2 }, { dt: 'DTZ', ngay: 1, n: 5, phut: (i) => 400 + i * 4, kien: 2 }]);
  const gop = { ...R, n: R.n + them.n, ngayI: [...R.ngayI, ...them.ngayI], tu: { ...R.tu, dt: [...R.tu.dt, 'DTZ'], dtTen: [...R.tu.dtTen, 'Tên DTZ'] }, cot: Object.fromEntries(COT.map((k) => [k, [...R.cot[k], ...them.cot[k].map((x) => (k === 'dt' ? R.tu.dt.length : x))]])) };
  const v = BT.tinhMoc(gop, { moc: 'B', nguong: {} });
  const z = v.cum.find((c) => c.duong_thu.ma === 'DTZ');
  assert.equal(z.shbg, 20);
  assert.equal(z.co.mau_it, true);
  assert.deepEqual([z.co.that_thuong, z.co.khong_co_lich_co_dinh, z.co.nhieu_kien_di_ngoai], [false, false, false]);
  assert.equal(v.mau_it.length, 1);
  assert.match(v.mau_it[0].ghi_chu, /mẫu ít, chưa kết luận/);
  assert.equal(v.thong_ke_co.that_thuong.so_doi_tuong, 10, 'cụm mẫu ít không vào mẫu của cờ');
  assert.equal(v.cum.filter((c) => c.co.that_thuong).length, 2, 'thêm cụm mẫu ít không đổi số cụm bị gắn cờ');
});

test('nhieu_kien_di_ngoai từ 30%; luu_y_lich; chuyen_gom_nhieu_hang theo mức chia đều số chuyến (BCVH một chuyến không bao giờ bị gắn cờ)', () => {
  const spec = [];
  for (let d = 0; d < 10; d++) {
    spec.push({ dt: 'KIEN', ngay: d, n: 7, phut: (i) => 480 + i, kien: 2 }); // 7 × 10 = 70 kiện
    spec.push({ dt: 'KIEN', ngay: d, n: 23, phut: (i) => 480 + i, kien: 0 }); // 230 thường -> 70/300 = 23%
    spec.push({ dt: 'NHIEU', ngay: d, n: 12, phut: (i) => 600 + i, kien: 2 }); // 120 kiện
    spec.push({ dt: 'NHIEU', ngay: d, n: 28, phut: (i) => 600 + i, kien: 0 }); // 120/400 = 30%
  }
  const R = dungR(spec, 10, [0, 7]);
  const lich = [{ ma_bcvh: TH, gio_xuat_phat: '07:00', ngay_chay: 'CA_TUAN' }, { ma_bcvh: TH, gio_xuat_phat: '12:55', ngay_chay: 'NGHI_CN' }, { ma_bcvh: TH, gio_xuat_phat: '19:45', ngay_chay: 'CA_TUAN' }, { ma_bcvh: PL, gio_xuat_phat: '06:00', ngay_chay: 'CA_TUAN' }];
  const v = BT.tinhMoc(R, { moc: 'B', nguong: {}, lich });
  assert.equal(v.cum.find((c) => c.duong_thu.ma === 'NHIEU').co.nhieu_kien_di_ngoai, true, 'đúng 30%: gắn cờ (từ 30%)');
  assert.equal(v.cum.find((c) => c.duong_thu.ma === 'KIEN').co.nhieu_kien_di_ngoai, false, '23%: chưa');
  // luu_y_lich: Thuận Hóa có chuyến nghỉ Chủ nhật -> ô / chuyến Chủ nhật true, ngày thường false
  assert.ok(v.o.some((o) => o.loai_ngay === 'chu_nhat' && o.luu_y_lich === true), 'ô Chủ nhật của Thuận Hóa');
  assert.ok(v.o.filter((o) => o.loai_ngay === 'thuong').every((o) => o.luu_y_lich === false));
  assert.ok(v.chuyen.filter((c) => c.loai_ngay === 'chu_nhat').every((c) => c.luu_y_lich === true));
  // chuyen_gom: Thuận Hóa có 2 chuyến chạy Chủ nhật / 3 ngày thường; chuyến 07:00 nhận 100% sản lượng
  const t = v.chuyen.find((c) => c.loai_ngay === 'thuong');
  assert.equal(t.so_chuyen_trong_ngay, 3);
  assert.equal(t.co.chuyen_gom_nhieu_hang, true, '100% ≥ 1,5 × 33%');
  const mot = BT.tinhMoc(R, { moc: 'B', nguong: {}, lich: [{ ma_bcvh: TH, gio_xuat_phat: '07:00', ngay_chay: 'CA_TUAN' }] });
  assert.ok(mot.chuyen.every((c) => c.co.chuyen_gom_nhieu_hang === false), 'BCVH một chuyến: 100% < 1,5 × 100%');
  const luyKe = v.the.map((x) => x.luy_ke_pct);
  assert.equal(luyKe[luyKe.length - 1], 100);
  assert.ok(v.the.every((x, i) => i === 0 || v.the[i - 1].shbg_anh_huong >= x.shbg_anh_huong), 'Pareto: xếp theo số bưu gửi bị ảnh hưởng giảm dần');
});

/** 10 cụm × 10 ngày; cụm j có `kien(j)` kiện đi ngoài trên `n` bưu gửi mỗi ngày (cùng một băng giờ, ≥ 100 bưu gửi mỗi cụm). */
function bo10CumKien(n, kien) {
  const spec = [];
  for (let j = 0; j < 10; j++) {
    for (let d = 0; d < 10; d++) {
      spec.push({ dt: `DT${String(j).padStart(2, '0')}`, ngay: d, n: kien(j), phut: (i) => 480 + i, kien: 2 });
      spec.push({ dt: `DT${String(j).padStart(2, '0')}`, ngay: d, n: n - kien(j), phut: (i) => 480 + i, kien: 0 });
    }
  }
  return dungR(spec);
}

test('KTT-KD-1d nhieu_kien_di_ngoai = từ 30% VÀ thuộc 20% cụm có tỷ lệ cao nhất: tỷ lệ 5%…50% gắn đúng 2 cụm (45%, 50%); 30–40% ngoài top 20% KHÔNG gắn; cả hai mốc', () => {
  const R = bo10CumKien(20, (j) => j + 1); // 5%, 10%, …, 50%
  for (const moc of ['A', 'B']) {
    const v = BT.tinhMoc(R, { moc, nguong: {} });
    const co = v.cum.filter((c) => c.co.nhieu_kien_di_ngoai).map((c) => c.duong_thu.ma).sort();
    assert.deepEqual(co, ['DT08', 'DT09'], `${moc}: đúng 2/10 cụm = 20%`);
    for (const ma of ['DT05', 'DT06', 'DT07']) { // 30%, 35%, 40%: đạt 30% nhưng ngoài top 20%
      const c = v.cum.find((x) => x.duong_thu.ma === ma);
      assert.ok(c.kien_di_ngoai.ty_le >= 0.3 - 1e-9 && c.co.nhieu_kien_di_ngoai === false, `${moc} ${ma}: ≥ 30% nhưng ngoài top 20% — không gắn`);
    }
    assert.equal(v.cum.find((x) => x.duong_thu.ma === 'DT09').kien_di_ngoai.ty_le, 0.5, 'số đo thô vẫn trả như cũ');
    assert.equal(v.nguong_ap_dung.kienNgoaiPhanVi, 80);
    assert.ok(Math.abs(v.nguong_ap_dung.phan_vi_kien_ngoai - 0.45) < 1e-9);
    assert.equal(v.nguong_ap_dung.kienDiNgoaiPct, 30, 'khóa ngưỡng cũ giữ nguyên');
    assert.equal(v.the.filter((x) => x.co === 'nhieu_kien_di_ngoai').length, 2);
  }
  const p90 = BT.tinhMoc(R, { moc: 'B', nguong: { kienNgoaiPhanVi: 90 } });
  assert.deepEqual(p90.cum.filter((c) => c.co.nhieu_kien_di_ngoai).map((c) => c.duong_thu.ma), ['DT09'], 'đổi phân vị 90: còn 1/10 cụm');
});

test('KTT-KD-1d nhieu_kien_di_ngoai: cụm trong top 20% nhưng dưới 30% KHÔNG gắn (tỷ lệ 2,5%…25%); cụm mẫu ít không vào phân bố', () => {
  const R = bo10CumKien(40, (j) => j + 1); // 2,5% … 25%
  const v = BT.tinhMoc(R, { moc: 'B', nguong: {} });
  assert.equal(v.cum.length, 10);
  assert.equal(v.cum.filter((c) => c.co.nhieu_kien_di_ngoai).length, 0, 'top 20% = 22,5% và 25%, đều dưới 30%');
  assert.ok(v.cum.find((x) => x.duong_thu.ma === 'DT09').kien_di_ngoai.ty_le < 0.3);
  // cụm mẫu ít 100% kiện ngoài không làm đổi ngưỡng phân vị và không bị gắn cờ
  const R2 = bo10CumKien(20, (j) => j + 1);
  const them = dungR([{ dt: 'DTZ', ngay: 0, n: 15, phut: (i) => 480 + i, kien: 2 }]);
  const gop = { ...R2, n: R2.n + them.n, ngayI: [...R2.ngayI, ...them.ngayI], tu: { ...R2.tu, dt: [...R2.tu.dt, 'DTZ'], dtTen: [...R2.tu.dtTen, 'Tên DTZ'] }, cot: Object.fromEntries(COT.map((k) => [k, [...R2.cot[k], ...them.cot[k].map((x) => (k === 'dt' ? R2.tu.dt.length : x))]])) };
  const w = BT.tinhMoc(gop, { moc: 'B', nguong: {} });
  assert.equal(w.cum.find((c) => c.duong_thu.ma === 'DTZ').co.nhieu_kien_di_ngoai, false);
  assert.deepEqual(w.cum.filter((c) => c.co.nhieu_kien_di_ngoai).map((c) => c.duong_thu.ma).sort(), ['DT08', 'DT09']);
});

test('sat_gio_chot luôn là mức theo dõi, chỉ gắn khi có hàng từ 20 ngày; sat_chi_tieu theo tỷ lệ bưu gửi còn dưới 3 giờ; ô dưới 100 bưu gửi là «mẫu ít» và không gắn cờ', () => {
  assert.equal(BT.MUC_CO.sat_gio_chot, 'theo_doi');
  const dung = (soNgay, nMoiNgay) => {
    const spec = [];
    for (let d = 0; d < soNgay; d++) spec.push({ dt: 'S', ngay: d, n: nMoiNgay, phut: (i) => 480 + i });
    const R = dungR(spec, 25);
    R.cot.bienB = R.cot.bienB.map(() => 20); R.cot.choB = R.cot.choB.map(() => 12 * 3600); // cách giờ chốt 20 phút; chờ theo lịch 12 giờ -> còn lại 14 − 12 = 2 giờ
    return BT.tinhMoc(R, { moc: 'B', nguong: {} }).o[0];
  };
  const du = dung(25, 6); // 150 bưu gửi, 25 ngày
  assert.deepEqual([du.co.mau_it, du.co.sat_gio_chot, du.co.sat_chi_tieu], [false, true, true]);
  assert.equal(du.sat_gio_chot.phut_trung_vi, 20);
  assert.equal(du.con_lai.ty_le_duoi_nguong, 1);
  const it = dung(12, 6); // 72 bưu gửi
  assert.deepEqual([it.co.mau_it, it.co.sat_gio_chot, it.co.sat_chi_tieu], [true, false, false], 'ô mẫu ít: không gắn cờ');
  const ngan = dung(15, 10); // 150 bưu gửi nhưng chỉ 15 ngày có hàng (< 20)
  assert.deepEqual([ngan.co.mau_it, ngan.co.sat_gio_chot, ngan.co.sat_chi_tieu], [false, false, true], 'sát giờ chốt cần từ 20 ngày; sát chỉ tiêu không cần');
});

test('kiểm tĩnh: lõi thuần kttBucTranh.js không đọc DB, đồng hồ máy hay Date.parse', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttBucTranh.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /require\('(better-sqlite3|\.\.\/db|\.\/thamSo)'\)|Date\.now|Date\.parse|new Date\(\)|\.prepare\(/);
});

// ---------- API ----------
test('API: cả hai mốc ở mọi bảng, mốc mặc định A; đẳng thức mẫu số hai mốc; mốc A đo được ít hơn mốc B (thiếu XNĐ); Σ cụm = đo được; luy_ke_pct kết ở 100', async () => {
  duLieu();
  const r = await goi(`${BASE}${QS()}`, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.moc, 'A');
  assert.equal(r.body.moc_mac_dinh, 'A');
  assert.deepEqual(Object.keys(r.body.theo_moc), ['A', 'B']);
  const dt = r.body.meta.dang_thuc;
  assert.equal(dt.lech_tong, 0, 'tổng bưu gửi = mẫu số + các nhóm loại');
  assert.equal(dt.lech_mau_so, 0, 'số SHBG của bức tranh = mẫu số lưu thoát');
  assert.equal(r.body.theo_moc.A.mau_so, dt.mau_so);
  assert.equal(r.body.theo_moc.B.mau_so, dt.mau_so);
  assert.equal(r.body.theo_moc.B.do_duoc, dt.mau_so, 'mốc B: mọi bưu gửi có giờ quét');
  assert.equal(r.body.theo_moc.A.do_duoc, dt.mau_so - 1, 'mốc A: 1 bưu gửi không có XNĐ');
  assert.equal(r.body.theo_moc.A.khong_do_duoc, 1);
  for (const m of ['A', 'B']) {
    const v = r.body.theo_moc[m];
    assert.equal(v.cum.reduce((s, c) => s + c.shbg, 0), v.do_duoc, `${m}: Σ cụm = đo được`);
    assert.equal(v.cum[v.cum.length - 1].luy_ke_pct, 100);
    assert.ok(v.cum.every((c, i) => i === 0 || v.cum[i - 1].shbg >= c.shbg), 'xếp theo số bưu gửi (Pareto), không theo tỷ lệ');
    assert.ok(v.cum.every((c) => c.gio_den.moc === m && typeof c.gio_den.do_duoc === 'number' && typeof c.gio_den.mau_so === 'number'), 'mọi số kèm do_duoc / mau_so của mốc');
  }
  assert.deepEqual(r.body.meta.do_duoc_chi_tieu_14h.A.mau_so, dt.mau_so);
  assert.doesNotMatch(JSON.stringify(r.body), /KTT-DEMO|BD10-/, 'không số hiệu bưu gửi / BD10 trong phản hồi');
});

test('API: hai băng giờ của cùng (đường thư, lịch) tách thành hai chuyến thư đến; mốc A méo theo lô (meo_theo_lo) còn mốc B thì không', async () => {
  duLieu();
  const r = await goi(`${BASE}${QS({ moc: 'B' })}`, 'ttvh');
  const dtA = r.body.theo_moc.B.cum.filter((c) => c.duong_thu.ma === 'DT-A');
  assert.equal(dtA.length, 2, 'băng 05:00 và băng 11:00 (cách 5 giờ)');
  assert.deepEqual(dtA.map((c) => c.bang_gio.tu).sort(), ['05:00', '11:00']);
  assert.deepEqual(dtA.map((c) => c.shbg).sort(), [24, 16].sort());
  const a = r.body.theo_moc.A.cum.filter((c) => c.duong_thu.ma === 'DT-A');
  assert.equal(a.length, 2);
  const mat = a.find((c) => c.bang_gio.tu >= '17:00' || c.bang_gio.tu < '01:00' || c.gio_den.trung_vi > '17:00');
  assert.ok(mat, 'mốc A của băng sáng muộn bị XNĐ gom lô dời lên ≈ 17:40');
  assert.equal(mat.gio_den.meo_theo_lo, true, 'trung vị A lệch B ≥ 120 phút');
  assert.equal(r.body.theo_moc.B.cum.every((c) => c.gio_den.meo_theo_lo === null), true, 'mốc B không có cờ méo');
  const b = r.body.theo_moc.B.cum.find((c) => c.duong_thu.ma === 'DT-A' && c.bang_gio.tu === '05:00');
  assert.equal(b.san_luong_ngay.ngay_thuong.so_ngay_co_hang, 3, '12/10, 13/10 và thứ Bảy 17/10');
  assert.equal(b.san_luong_ngay.chu_nhat.so_ngay_co_hang, 1);
  assert.equal(b.san_luong_ngay.chu_nhat.tb, 6);
});

test('API: loai_ngay đúng Chủ nhật (11/10) — chu_nhat chỉ ngày Chủ nhật, thuong là phần còn lại, cộng lại bằng tat_ca; băng giờ không đổi khi đổi bộ lọc; bcvh lọc đúng', async () => {
  duLieu();
  const tong = async (o) => (await goi(`${BASE}${QS(o)}`, 'admin')).body.theo_moc.B;
  const tat = await tong({}); const cn = await tong({ loai_ngay: 'chu_nhat' }); const th = await tong({ loai_ngay: 'thuong' });
  const s = (v) => v.cum.reduce((x, c) => x + c.shbg, 0);
  assert.equal(s(cn), 13, 'Chủ nhật 11/10: 6 + 4 + 3');
  assert.equal(s(cn) + s(th), s(tat));
  assert.ok(cn.cum.every((c) => c.san_luong_ngay.ngay_thuong.so_ngay_co_hang === 0 && c.san_luong_ngay.chu_nhat.so_ngay_co_hang === 1));
  assert.equal(cn.cum.find((c) => c.duong_thu.ma === 'DT-A' && c.bang_gio.tu === '05:00').id, tat.cum.find((c) => c.duong_thu.ma === 'DT-A' && c.bang_gio.tu === '05:00').id, 'định danh cụm không đổi theo bộ lọc');
  const th533 = await tong({ bcvh: TH });
  assert.equal(s(th533), 1);
  const sai = await goi(`${BASE}${QS({ bcvh: '999999' })}`, 'admin');
  assert.equal(sai.status, 400);
  assert.match(sai.body.error, /bcvh/);
  assert.equal((await goi(`${BASE}${QS({ loai_ngay: 'cuoi_tuan' })}`, 'admin')).status, 400);
});

test('API chuyen-xe: ô Chủ nhật của BCVH có chuyến nghỉ Chủ nhật mang luu_y_lich = true (Hương Thủy, Thuận Hóa); BCVH không nghỉ (Hương Trà, A Lưới) và ngày thường là false; Hương Thủy Chủ nhật vẫn xếp sang 06:30 hôm sau', async () => {
  duLieu();
  const r = await goi(`${BASE}/chuyen-xe${QS()}`, 'ttkt');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.meta.luu_y_lich.bcvh_chuyen_nghi_chu_nhat, ['533140', '536250', '537015', '537220']);
  for (const m of ['A', 'B']) {
    const v = r.body.theo_moc[m];
    const cn = v.chuyen.filter((c) => c.loai_ngay === 'chu_nhat');
    assert.ok(cn.length > 0 && cn.every((c) => c.luu_y_lich === true));
    assert.ok(v.chuyen.filter((c) => c.loai_ngay === 'thuong').every((c) => c.luu_y_lich === false));
    assert.ok(v.o.filter((o) => o.loai_ngay === 'chu_nhat').every((o) => o.luu_y_lich === true));
    assert.equal(v.chuyen.reduce((s, c) => s + c.shbg, 0), v.do_duoc, `${m}: Σ chuyến = đo được`);
  }
  const hy = r.body.theo_moc.B.chuyen.find((c) => c.ma_bcvh === HY && c.loai_ngay === 'chu_nhat');
  assert.equal(hy.gio_xuat_phat, '06:30');
  assert.equal(hy.hom_sau.ty_le, 1, 'lịch hiện hành: Hương Thủy Chủ nhật 100% sang 06:30 hôm sau (KTT-LICH-2 sẽ sửa lịch)');
  // luu_thoat_theo_lich / con_lai: đến 05:00 Chủ nhật, xe 06:30 Thứ Hai: chờ theo lịch = 21:00–07:00 bị trừ -> (24h − 10h) − 5h ... số dương, còn lại = 14 − chờ
  assert.ok(hy.luu_thoat_theo_lich.trung_vi_gio > 0 && hy.con_lai.trung_vi_gio !== null);
  assert.equal(hy.con_lai.nguong_gio, 3);
});

test('API danh-gia: thẻ xếp Pareto (luy_ke_pct tăng dần đến 100), mỗi thẻ có mức, cờ, giá trị đo, ngưỡng áp dụng, lý giải; ngưỡng đến từ tham số hệ thống (đổi mẫu tối thiểu có hiệu lực ngay)', async () => {
  duLieu();
  const r = await goi(`${BASE}/danh-gia${QS({ moc: 'B' })}`, 'admin');
  assert.equal(r.status, 200);
  const v = r.body.theo_moc.B;
  assert.equal(v.nguong_ap_dung.mauToiThieu, 100);
  assert.ok(v.mau_it.length >= 3, 'mọi cụm của bộ giả dưới 100 bưu gửi');
  for (const t of v.the) { assert.ok(['canh_bao', 'luu_y', 'theo_doi', 'thong_tin'].includes(t.muc)); assert.ok(t.co && t.doi_tuong.id && t.ly_giai && t.nguong_ap_dung !== undefined && t.gia_tri_do !== undefined); }
  assert.ok(v.the.every((t) => t.co !== 'sat_gio_chot' || t.muc === 'theo_doi'));
  // hạ ngưỡng mẫu tối thiểu qua tham số hệ thống -> cụm 24 bưu gửi không còn «mẫu ít»
  const put = await fetch(`${ctx.baseUrl}/api/tham-so`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'test bức tranh', thay_doi: [{ khoa: 'ktt_bt_mau_toi_thieu', gia_tri: 10 }] }) });
  assert.equal(put.status, 200);
  const r2 = await goi(`${BASE}/danh-gia${QS({ moc: 'B' })}`, 'admin');
  assert.equal(r2.body.theo_moc.B.nguong_ap_dung.mauToiThieu, 10);
  assert.ok(r2.body.theo_moc.B.mau_it.length < v.mau_it.length);
});

test('khong-dat-14h: tham số moc, mặc định A (dot_den xếp theo mốc xnd); moc=B xếp theo quet_tui_den; moc lạ -> 400; gợi ý chẩn đoán vẫn là mốc B', async () => {
  duLieu();
  const mac = await goi(`/api/ktt/luu-thoat/khong-dat-14h${QS()}`, 'admin');
  assert.equal(mac.status, 200);
  assert.deepEqual([mac.body.moc, mac.body.moc_dot_den, mac.body.moc_goi_y_chan_doan], ['A', 'xnd', 'quet_tui_den']);
  const b = await goi(`/api/ktt/luu-thoat/khong-dat-14h${QS({ moc: 'B' })}`, 'admin');
  assert.deepEqual([b.body.moc, b.body.moc_dot_den], ['B', 'quet_tui_den']);
  assert.equal((await goi(`/api/ktt/luu-thoat/khong-dat-14h${QS({ moc: 'C' })}`, 'admin')).status, 400);
});

test('cache theo ngày: ngày cũ giữ khi gọi lại; thêm dòng vào ngày nào thì HỦY đúng ngày đó (chữ ký ngày), ngày khác giữ nguyên; huyCacheNgay hủy đúng ngày chỉ định', async () => {
  duLieu();
  const q = { tu: '2026-10-11', den: '2026-10-13' }; // cả ba ngày cũ hơn cửa sổ nạp (từ 15/10): hủy theo chữ ký / huyCacheNgay
  Api.xoaCache();
  await Api.bucTranhCum(db, q);
  assert.equal(Api.thongKe().ngayTinh, 3, 'lần nguội: tính 3 ngày (cả hai mốc trong MỘT mục mỗi ngày)');
  await Api.bucTranhChuyenXe(db, q); await Api.bucTranhDanhGia(db, q);
  assert.equal(Api.thongKe().ngayTinh, 3, 'ba route dùng chung cache theo ngày, không tính lại');
  // nạp thêm một bưu gửi vào 12/10 (nạp lại / thay thế / khôi phục ngày đó đổi chữ ký ngày)
  kt({ quet: '2026-10-12 08:30:00', dt: 'DT-N2', lich: 'L8', bd10: 'BD10-NEW' });
  const r = await Api.bucTranhCum(db, q);
  assert.equal(Api.thongKe().ngayTinh, 4, 'chỉ ngày 12/10 được tính lại');
  assert.ok(r.theo_moc.B.cum.some((c) => c.duong_thu.ma === 'DT-N2'), 'số mới của ngày đó hiện ngay');
  const n = Api.huyCacheNgay(['2026-10-13']);
  assert.ok(n >= 1);
  await Api.bucTranhCum(db, q);
  assert.equal(Api.thongKe().ngayTinh, 5, 'huyCacheNgay chỉ hủy 13/10');
  assert.equal(Api.huyCacheNgay(['2026-01-01']), 0, 'ngày chưa có trong bộ nhớ: không hủy gì');
});

test('cache theo ngày: độ mới dữ liệu đổi (nạp cặp mới) thì các ngày TRONG cửa sổ nạp được tính lại, ngày cũ hơn thì không', async () => {
  duLieu();
  const q = { tu: '2026-10-11', den: '2026-10-23' };
  Api.xoaCache();
  await Api.bucTranhCum(db, q);
  const truoc = Api.thongKe().ngayTinh;
  assert.equal(truoc, 13);
  capOk('2026-10-23 15:00:00');
  await Api.bucTranhCum(db, q);
  // cửa sổ nạp = từ độ mới lùi 8 ngày (15/10..23/10 = 9 ngày); 11/10..14/10 (đã chốt, cũ hơn) giữ nguyên
  assert.equal(Api.thongKe().ngayTinh - truoc, 9);
});

test('quyền: ba route mới — không token 401; ADMIN, TTVH, TTKT 200; GDVH, TIVI 403; chỉ GET; vai trò không có trong bảng allowlist bị từ chối mặc định', async () => {
  duLieu();
  for (const url of [`${BASE}${QS()}`, `${BASE}/chuyen-xe${QS()}`, `${BASE}/danh-gia${QS()}`]) {
    assert.equal((await goi(url, null)).status, 401, url);
    for (const w of ['admin', 'ttvh', 'ttkt']) assert.equal((await goi(url, w)).status, 200, `${w} ${url}`);
    for (const w of ['gdvh', 'tivi']) assert.equal((await goi(url, w)).status, 403, `${w} ${url}`);
    const post = await fetch(`${ctx.baseUrl}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}` } });
    assert.ok([404, 405].includes(post.status), `POST ${url} -> ${post.status}`);
    const ttktPost = await fetch(`${ctx.baseUrl}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.ttkt}` } });
    assert.equal(ttktPost.status, 403, 'TTKT chỉ GET (allowlist)');
  }
  const req = (method) => ({ method, originalUrl: `${BASE}${QS()}` });
  assert.equal(vaiTroAllows('TTKT', req('GET')), true);
  assert.equal(vaiTroAllows('TTKT', req('DELETE')), false);
  assert.equal(vaiTroAllows('VAI_TRO_MOI_CHUA_KHAI_BAO', req('GET')), false, 'vai trò mới không có mục trong bảng: allowlist RỖNG, từ chối mặc định (bài học ROLE-1b)');
  assert.equal(vaiTroAllows('TIVI', req('GET')), false);
});

test('tham số: sai / thừa / lặp -> 400 tiếng Việt (không 500); thiếu tu / den -> 400; chưa có dữ liệu -> co_du_lieu false, không lỗi', async () => {
  for (const [qs, re] of [[`${QS({ moc: 'Z' })}`, /moc/], [`${QS({ x: '1' })}`, /không hỗ trợ/], ['?tu=2026-10-11', /tu|den/], [`${QS()}&moc=A&moc=B`, /một lần/]]) {
    const r = await goi(`${BASE}${qs}`, 'admin');
    assert.equal(r.status, 400, qs);
    assert.match(r.body.error, re, qs);
  }
  const rong = await goi(`${BASE}${QS()}`, 'admin');
  assert.equal(rong.status, 200);
  assert.deepEqual([rong.body.co_du_lieu, rong.body.ly_do, rong.body.theo_moc], [false, 'CHUA_CO_DU_LIEU', null]);
});
