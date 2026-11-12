// ==========================================
// Test KTT-DC-1: tab «Hướng đóng chuyến nội tỉnh» — /api/ktt/huong-dong-chuyen/{tong-hop,danh-sach} và /api/ktt/xuat/huong-dong-chuyen.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx, mã điểm giả). Không mở data/, không DB thật, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');
const HDC = require('../server/lib/kttHuongDong');

const PORT = 5990;
const TH = '533140'; const HT = '535470'; const HTH = '536250';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'DC1_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'DC1_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'DC1_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'DC1_TIVI', pass: 'Tivi@123', role: 'TIVI' },
  ttkt: { hrm: 'DC1_TTKT', pass: 'Ttkt@123', role: 'TTKT' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-dc1-${Date.now()}.db` });
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
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap; DELETE FROM post_offices; DELETE FROM commune_post_offices; DELETE FROM province_post_offices;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0; let nShbg = 0;
const them = (bang, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); };
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
const hoan = (...ds) => ds.forEach((shbg) => them('ktt_hang_hoan', { shbg, nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' }));
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', dich_vu_code: 'E', ten_dich_vu: 'EMS giả', ...NG, ...o }); }
const sh = () => `KTT-DEMO-${String(++nShbg).padStart(4, '0')}`;
const NT = '530101'; // nơi gửi BD10 nội tỉnh giả (bắt đầu 53)
/** N2: túi ĐẾN vào 530100 (từ nơi `from`, chuyến `so`, đóng lúc `dong`) + túi ĐI sang BCVH `nhan`. */
function n2(from, ngay, { so = '1', dong = `${ngay} 04:00:00`, quet = `${ngay} 05:30:00`, xnd = `${ngay} 05:30:00`, nhan = TH, gam = 100, dv = 'E', gioDi = `${ngay} 20:00:00`, diemGui = NT, shbg = sh() } = {}) {
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', from_pos: from, mail_trip_number: so, co_mo_tui: 1, chuyen_thu_gio_dong: dong, gio_quet_tui_den: quet, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_so_hieu: `BD10-D-${seq}` });
  bg(t, shbg, { khoi_luong_thuc_te_g: gam, dich_vu_code: dv });
  const d = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: `BD10-I-${seq}`, bd10_di_ma_diem_nhan: nhan });
  bg(d, shbg);
  return shbg;
}
/** N1: chỉ có túi chuyển tiếp đi (đóng thẳng BCVH `nhan`). */
function n1(from, ngay, { so = '9', nhan = TH, gam = 100, shbg = sh() } = {}) {
  const t = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DA_CHIA_SAN', from_pos: from, to_pos: nhan, mail_trip_number: so, chuyen_thu_gio_dong: `${ngay} 03:00:00`, gio_quet_tui_den: `${ngay} 05:30:00`, bd10_den_xnd: `${ngay} 05:30:00`, bd10_den_ma_diem_gui: NT, bd10_di_gio_di: `${ngay} 06:00:00`, bd10_di_ma_diem_nhan: nhan, bd10_di_so_hieu: `BD10-C-${seq}` });
  bg(t, shbg, { khoi_luong_thuc_te_g: gam });
  return shbg;
}
/** N3: vừa có túi ĐẾN vào 530100 vừa có túi chuyển tiếp. */
function n3(from, ngay, { so = '5' } = {}) {
  const s = sh();
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', from_pos: from, mail_trip_number: so, co_mo_tui: 1, chuyen_thu_gio_dong: `${ngay} 04:00:00`, gio_quet_tui_den: `${ngay} 05:30:00`, bd10_den_xnd: `${ngay} 05:30:00`, bd10_den_ma_diem_gui: NT });
  bg(t, s);
  const c = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DA_CHIA_SAN', from_pos: from, to_pos: TH, mail_trip_number: '55', chuyen_thu_gio_dong: `${ngay} 03:00:00`, gio_quet_tui_den: `${ngay} 05:35:00`, bd10_den_ma_diem_gui: NT, bd10_di_gio_di: `${ngay} 06:00:00`, bd10_di_ma_diem_nhan: TH });
  bg(c, s);
  return s;
}
/** Chuyến SẠCH: túi ĐẾN vào 530100 chỉ có hàng liên tỉnh (nơi gửi BD10 không bắt đầu 53). */
function sach(from, ngay, so) {
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', from_pos: from, mail_trip_number: so, co_mo_tui: 1, chuyen_thu_gio_dong: `${ngay} 04:00:00`, gio_quet_tui_den: `${ngay} 05:30:00`, bd10_den_xnd: `${ngay} 05:30:00`, bd10_den_ma_diem_gui: '999001' });
  bg(t, sh());
  const d = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: '530900', bd10_di_gio_di: `${ngay} 20:00:00`, bd10_di_ma_diem_nhan: '530900', bd10_di_so_hieu: `BD10-I-${seq}` });
  bg(d, `KTT-DEMO-LT${seq}`);
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
function danhMuc() {
  them('province_post_offices', { id: 'p1', code: '53', name: 'BĐTP giả' });
  them('commune_post_offices', { id: 'c1', code: '5300', name: 'Bưu điện phường giả', province_id: 'p1' });
  const po = (code, name, type) => them('post_offices', { id: `po-${code}`, code, name, type, commune_id: 'c1' });
  po('536001', 'Điểm VHX giả', 'VHX'); po('530000', 'Huế giả', 'GD1'); po('531120', 'Khách hàng lớn giả', 'GD3'); po('536100', 'Điểm GD2 giả', 'GD2'); po('535710', 'Điểm KT2 giả', 'KT2');
  po(TH, 'BCVH Thuận Hóa giả', 'PH1'); po(HT, 'BCVH Hương Trà giả', 'PH2');
}
/**
 * Ngày 20–22 (độ mới 2026-10-23 10:00):
 *  536001 VHX: N20: n2×12 (chuyến 1: 7, chuyến 2: 5; một hàng chuyến ghi ngày cũ) + N1×10; ngày 21: n2×3 → N2 = 15, N1 = 10 (đủ 20 mẫu) + chuyến sạch ngày 20.
 *  530000 GD1: 2 N2 (ngày 20) + 1 N1 (ngày 21) + 1 hàng hoàn (không tính) → ít mẫu.
 *  531120: 3 N2 + 1 N3 (ngày 21).   777777 (không có trong danh mục): 1 N2 ngày 22 (đến BCVH Hương Trà).
 *  536100 GD2: 2 N2 ngày 22 (dịch vụ C) + 21 N1 ngày 22 → N2 / (N1 + N2) tính được, ngày cả hai kiểu 1.
 *  535710 KT2: 1 N2 ngày 21 (nhóm KHAC).   BCVH 533140 làm nơi đóng: 2 N2 + 1 N1 ngày 20 (bị loại khỏi bảng, nối số ở meta).
 */
function duLieu() {
  danhMuc();
  for (let i = 0; i < 7; i++) n2('536001', '2026-10-20', { so: '1' });
  for (let i = 0; i < 4; i++) n2('536001', '2026-10-20', { so: '2' });
  n2('536001', '2026-10-20', { so: '3', dong: '2026-09-01 08:00:00' }); // chuyến thư ghi ngày cũ (> 7 ngày)
  for (let i = 0; i < 10; i++) n1('536001', '2026-10-20', { so: '9' });
  for (let i = 0; i < 3; i++) n2('536001', '2026-10-21', { so: '4' });
  sach('536001', '2026-10-20', '8');
  n2('530000', '2026-10-20'); n2('530000', '2026-10-20');
  n1('530000', '2026-10-21');
  const h = n2('530000', '2026-10-21'); hoan(h);
  for (let i = 0; i < 3; i++) n2('531120', '2026-10-21', { so: '6', gam: 2000 });
  n3('531120', '2026-10-21');
  n2('777777', '2026-10-22', { nhan: HT, so: '7' });
  n2('536100', '2026-10-22', { dv: 'C', so: '11' }); n2('536100', '2026-10-22', { dv: 'C', so: '11' });
  for (let i = 0; i < 21; i++) n1('536100', '2026-10-22', { so: '12', nhan: HT });
  n2('535710', '2026-10-21', { so: '13' });
  n2(TH, '2026-10-20', { so: '20', nhan: HTH }); n2(TH, '2026-10-20', { so: '20', nhan: HTH }); n1(TH, '2026-10-20', { so: '21', nhan: HTH });
  capOk('2026-10-23 10:00:00');
}

async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null, headers: res.headers, res };
}
const Q = '?tu=2026-10-20&den=2026-10-22';
const TH_URL = `/api/ktt/huong-dong-chuyen/tong-hop${Q}`;
const DS_URL = `/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=536001`;
const XUAT_NV = `/api/ktt/xuat/huong-dong-chuyen${Q}&kieu=nhac_viec`;
const XUAT_CT = `/api/ktt/xuat/huong-dong-chuyen${Q}&kieu=chi_tiet`;

// ---------- quét nội dung (chuỗi thử để chứng minh quét bắt được) ----------
const RE_SHBG_THU = /KTT-DEMO-\d+|\b[A-Z]{2}\d{9}[A-Z]{2}\b/;
const RE_TU_CAM = /Mốc\s*[AB]|đợt|bản đồ nhiệt|heatmap|tuổi/iu;
const RE_DIEN_THOAI = /(?<!\d)0\d{9,10}(?!\d)/;
function quetWorkbook(wb) {
  const kq = { shbg: 0, tuCam: 0, dienThoai: 0, o: 0 };
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => {
    const v = c.value; const t = v === null || v === undefined ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((x) => x.text).join('') : String(v.result ?? '')) : String(v);
    kq.o++;
    if (RE_SHBG_THU.test(t)) kq.shbg++;
    if (RE_TU_CAM.test(t)) kq.tuCam++;
    if (RE_DIEN_THOAI.test(t)) kq.dienThoai++;
  })));
  return kq;
}
async function docXlsx(url, who) {
  const r = await goi(url, who);
  assert.equal(r.status, 200, `xlsx ${url}`);
  const buf = Buffer.from(await r.res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { wb, headers: r.headers, buf };
}

// ---------- quyền, tham số ----------
test('quyền: không token 401; ADMIN, TTVH, TTKT 200 (cùng số liệu); GDVH, TIVI 403; chỉ GET; qua router thật cả xuất Excel', async () => {
  duLieu();
  for (const [ten, url] of [['tong-hop', TH_URL], ['danh-sach', DS_URL], ['xuat nhac_viec', XUAT_NV], ['xuat chi_tiet', XUAT_CT]]) {
    assert.equal((await goi(url)).status, 401, `${ten}: không token`);
    assert.equal((await goi(url, 'admin')).status, 200, `${ten}: ADMIN`);
    assert.equal((await goi(url, 'ttvh')).status, 200, `${ten}: TTVH`);
    assert.equal((await goi(url, 'ttkt')).status, 200, `${ten}: TTKT`);
    assert.equal((await goi(url, 'gdvh')).status, 403, `${ten}: GDVH`);
    assert.equal((await goi(url, 'tivi')).status, 403, `${ten}: TIVI`);
    assert.equal((await goi(url, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404, `${ten}: chỉ GET`);
  }
  assert.deepEqual((await goi(TH_URL, 'admin')).body, (await goi(TH_URL, 'ttkt')).body);
});

test('tham số sai -> 400 tiếng Việt: thiếu / sai ngày, vượt 31 ngày, khóa lạ, lặp tham số, loai_hinh / nhom / kieu / noi_dong sai, 6 BCVH làm nơi đóng', async () => {
  duLieu();
  const sai = [
    '/api/ktt/huong-dong-chuyen/tong-hop', '/api/ktt/huong-dong-chuyen/tong-hop?tu=2026-10-20', '/api/ktt/huong-dong-chuyen/tong-hop?tu=2026-13-40&den=2026-10-22',
    '/api/ktt/huong-dong-chuyen/tong-hop?tu=2026-10-22&den=2026-10-20', '/api/ktt/huong-dong-chuyen/tong-hop?tu=2026-10-01&den=2026-11-05', // 36 ngày
    `${TH_URL}&la=1`, `${TH_URL}&loai_hinh=XYZ`, `${TH_URL}&loai_hinh=GD1&loai_hinh=VHX`,
    `/api/ktt/huong-dong-chuyen/danh-sach${Q}`, `${DS_URL}&nhom=abc`, `${DS_URL}&chi_ghi_ngay_cu=2`, `${DS_URL}&page=0`, `${DS_URL}&page_size=201`, `${DS_URL}&la=1`,
    `/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=${TH}`, `/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=a%20b%3Bc%27--`,
    `/api/ktt/xuat/huong-dong-chuyen${Q}`, `/api/ktt/xuat/huong-dong-chuyen${Q}&kieu=khac`, `${XUAT_NV}&la=1`, `${XUAT_NV}&loai_hinh=XYZ`
  ];
  for (const url of sai) {
    const r = await goi(url, 'admin');
    assert.equal(r.status, 400, url);
    assert.match(r.body.error, /[a-zà-ỹ]/i, url);
    assert.ok(r.body.ma, url);
  }
  // đúng 31 ngày vẫn 200
  assert.equal((await goi('/api/ktt/huong-dong-chuyen/tong-hop?tu=2026-10-01&den=2026-10-31', 'admin')).status, 200);
});

// ---------- tính toán ----------
test('tổng hợp: N1 / N2 / N3, nơi ít mẫu, chuyến lẫn / sạch, hai kiểu cùng ngày, 6 BCVH bị loại nhưng nối số đúng, mã ngoài danh mục, cờ chuyến ghi ngày cũ', async () => {
  duLieu();
  const r = await goi(TH_URL, 'admin');
  assert.equal(r.status, 200);
  const m = r.body.meta;
  // tập: 15 + 10 (536001) + 2 + 1 (530000, hàng hoàn không tính) + 3 + 1 (531120, N3) + 1 (777777) + 2 + 21 (536100) + 1 (535710) + 3 (533140)
  assert.equal(m.n1, 10 + 1 + 21 + 1, 'N1');
  assert.equal(m.n2, 15 + 2 + 3 + 1 + 2 + 1 + 2, 'N2');
  assert.equal(m.n3, 1, 'N3');
  assert.equal(m.tong_noi_tinh, m.n1 + m.n2 + m.n3, 'N1 + N2 + N3 = tổng nội tỉnh');
  assert.equal(m.do_6_bcvh_dong, 2, '6 BCVH đóng: 2 N2');
  assert.equal(m.dong_vao_530100, m.n2 - m.do_6_bcvh_dong, 'N2 = vào 530100 (không 6 BCVH) + 6 BCVH');
  assert.equal(m.dong_vao_530100_toan_tap, m.dong_vao_530100);
  assert.equal(m.so_noi_dong, 6);
  assert.deepEqual(m.bcvh_da_loai.map((x) => x.ma).sort(), [...HDC.MA_BCVH_LOAI].sort());
  assert.equal(m.cach_tinh_ngay.ten, 'ngay_hang_den');
  const noi = Object.fromEntries(r.body.theo_noi_dong.map((x) => [x.ma, x]));
  assert.ok(!noi[TH] && !noi[HT], '6 BCVH không có trong bảng');
  assert.deepEqual(r.body.theo_noi_dong.map((x) => x.ma), ['536001', '531120', '530000', '536100', '777777', '535710'].sort((a, b) => noi[b].dong_vao_530100 - noi[a].dong_vao_530100 || (a < b ? -1 : 1)));
  const a = noi['536001'];
  assert.equal(a.dong_vao_530100, 15); assert.equal(a.dong_thang_bcvh, 10); assert.equal(a.chua_ro, 0);
  assert.equal(a.it_mau, false); assert.ok(Math.abs(a.ty_le - 15 / 25) < 1e-9);
  assert.equal(a.ngay_dong_ca_hai_kieu, 1, 'ngày 20 vừa N1 vừa N2; ngày 21 chỉ N2');
  assert.equal(a.ngay_co_dong_vao_530100, 2);
  assert.equal(a.chuyen_vao_530100, 5, 'chuyến 1, 2, 3, 4 (lẫn) + chuyến 8 (sạch)');
  assert.equal(a.chuyen_co_lan, 4);
  assert.equal(a.dong_chuyen_ghi_ngay_cu, 1);
  assert.equal(a.ten, 'Điểm VHX giả'); assert.equal(a.loai_hinh, 'VHX'); assert.equal(a.bdx, 'Bưu điện phường giả'); assert.equal(a.nhom_loai_hinh, 'VHX');
  assert.deepEqual(a.dich_vu_nhieu_nhat, { ma: 'E', ten: 'EMS giả', so: 15 });
  assert.equal(a.bcvh_dich_nhieu_nhat.ma, TH); assert.equal(a.bcvh_dich_nhieu_nhat.so, 15);
  assert.equal(a.kg, 1.5);
  const g = noi['530000']; // hàng hoàn không tính; 2 N2 + 1 N1 < 20
  assert.equal(g.dong_vao_530100, 2); assert.equal(g.dong_thang_bcvh, 1); assert.equal(g.it_mau, true); assert.equal(g.ty_le, null); assert.equal(g.nhom_loai_hinh, 'GD1');
  const k = noi['531120']; // N3 không cộng vào N2; chuyến chứa N3 vẫn là «chuyến có lẫn»
  assert.equal(k.dong_vao_530100, 3); assert.equal(k.chua_ro, 1); assert.equal(k.nhom_loai_hinh, '531120'); assert.equal(k.kg, 6);
  assert.equal(k.chuyen_co_lan, 2, 'chuyến 6 (N2) + chuyến 5 (N3)');
  const x = noi['777777'];
  assert.equal(x.ten, null); assert.equal(x.loai_hinh, null); assert.equal(x.bdx, null); assert.equal(x.nhom_loai_hinh, 'KHAC');
  assert.equal(x.bcvh_dich_nhieu_nhat.ma, HT); assert.equal(x.bcvh_dich_nhieu_nhat.ten, 'Hương Trà');
  const d = noi['536100'];
  assert.equal(d.dong_vao_530100, 2); assert.equal(d.dong_thang_bcvh, 21); assert.equal(d.it_mau, false); assert.ok(Math.abs(d.ty_le - 2 / 23) < 1e-9);
  assert.equal(d.ngay_dong_ca_hai_kieu, 1); assert.deepEqual(d.dich_vu_nhieu_nhat, { ma: 'C', ten: 'EMS giả', so: 2 });
  assert.equal(noi['535710'].nhom_loai_hinh, 'KHAC'); assert.equal(noi['535710'].loai_hinh, 'KT2');
  assert.equal(m.so_hang_ghi_ngay_cu, 1);
  assert.equal(m.so_hang_ghi_ngay_cu_ca_6_bcvh, 1);
  assert.equal(m.so_chuyen_thu_ghi_ngay_cu, 1);
  // đẳng thức bắt buộc
  const tongNoi = r.body.theo_noi_dong.reduce((s, y) => s + y.dong_vao_530100, 0);
  assert.equal(tongNoi, m.dong_vao_530100);
  assert.equal(r.body.theo_loai_hinh.reduce((s, y) => s + y.dong_vao_530100, 0), m.dong_vao_530100);
  assert.equal(r.body.theo_ngay.reduce((s, y) => s + y.dong_vao_530100, 0), m.dong_vao_530100);
  assert.equal(r.body.theo_ngay.length, 3);
  assert.deepEqual(r.body.theo_ngay.map((y) => y.ngay), ['2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(r.body.theo_loai_hinh.reduce((s, y) => s + y.so_noi, 0), m.so_noi_dong);
  assert.deepEqual(r.body.theo_loai_hinh.map((y) => y.nhom), HDC.LOAI_HINH);
  assert.equal(m.so_chuyen_co_lan, r.body.theo_noi_dong.reduce((s, y) => s + y.chuyen_co_lan, 0));
  assert.ok(m.so_chuyen_vao_530100 >= m.so_chuyen_co_lan);
  // không có số hiệu bưu gửi trong khối tổng hợp
  assert.ok(!RE_SHBG_THU.test(JSON.stringify(r.body)));
});

test('lọc loai_hinh: các tổng của nhóm khớp nhau; nhóm khác không lẫn vào', async () => {
  duLieu();
  for (const [nhom, soNoi, tong] of [['VHX', 1, 15], ['GD1', 1, 2], ['GD2_GD3', 1, 2], ['531120', 1, 3], ['KHAC', 2, 2]]) {
    const r = await goi(`${TH_URL}&loai_hinh=${nhom}`, 'admin');
    assert.equal(r.status, 200);
    assert.equal(r.body.meta.dong_vao_530100, tong, nhom);
    assert.equal(r.body.theo_noi_dong.reduce((s, y) => s + y.dong_vao_530100, 0), tong, nhom);
    assert.equal(r.body.theo_loai_hinh.length, 1); assert.equal(r.body.theo_loai_hinh[0].nhom, nhom); assert.equal(r.body.theo_loai_hinh[0].dong_vao_530100, tong);
    assert.equal(r.body.theo_ngay.reduce((s, y) => s + y.dong_vao_530100, 0), tong, nhom);
    assert.equal(r.body.meta.so_noi_dong, soNoi, nhom);
    assert.ok(r.body.theo_noi_dong.every((y) => y.nhom_loai_hinh === nhom));
    assert.equal(r.body.meta.n2, 26, 'tổng toàn tập không đổi khi lọc (để nối số)');
  }
});

test('không có dữ liệu: bảng rỗng có lý do, không lỗi', async () => {
  const r = await goi(TH_URL, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.co_du_lieu, false); assert.equal(r.body.ly_do, 'CHUA_CO_DU_LIEU');
  assert.deepEqual(r.body.theo_noi_dong, []); assert.equal(r.body.meta.dong_vao_530100, 0);
  assert.equal(r.body.theo_ngay.length, 3);
});

test('danh sách bưu gửi của một nơi: số dòng = dong_vao_530100; phân trang; cờ ngày cũ; N3 riêng; không tên / địa chỉ / số điện thoại', async () => {
  duLieu();
  const t = (await goi(TH_URL, 'admin')).body.theo_noi_dong.find((y) => y.ma === '536001');
  const r = await goi(DS_URL, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.pagination.total, t.dong_vao_530100);
  assert.equal(r.body.items.length, 15);
  const it = r.body.items[0];
  assert.deepEqual(Object.keys(it).sort(), ['bcvh_dich', 'chua_ro', 'chuyen_ghi_ngay_cu', 'dich_vu', 'kg', 'ma_noi_dong', 'ngay_den', 'ngay_dong_chuyen', 'shbg', 'so_chuyen_thu', 'ten_noi_dong', 'so_bg_trong_tui', 'tui_lon', 'ma_tui', 'khoa_tui'].sort()); // KTT-DC-3: chỉ THÊM 4 trường
  assert.equal(it.ma_noi_dong, '536001'); assert.equal(it.bcvh_dich.ma, TH); assert.equal(it.chua_ro, false);
  assert.equal(r.body.items.filter((x) => x.chuyen_ghi_ngay_cu).length, t.dong_chuyen_ghi_ngay_cu);
  assert.deepEqual(r.body.items.map((x) => x.ngay_den), [...r.body.items.map((x) => x.ngay_den)].sort(), 'sắp theo ngày hàng đến');
  const cu = await goi(`${DS_URL}&chi_ghi_ngay_cu=1`, 'admin');
  assert.equal(cu.body.pagination.total, 1); assert.equal(cu.body.items[0].chuyen_ghi_ngay_cu, true); assert.equal(cu.body.items[0].ngay_dong_chuyen, '2026-09-01');
  const p1 = await goi(`${DS_URL}&page_size=6&page=1`, 'admin'); const p3 = await goi(`${DS_URL}&page_size=6&page=3`, 'admin');
  assert.equal(p1.body.items.length, 6); assert.equal(p3.body.items.length, 3); assert.equal(p1.body.pagination.total_pages, 3);
  const n3r = await goi(`/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=531120&nhom=chua_ro`, 'admin');
  assert.equal(n3r.body.pagination.total, 1); assert.equal(n3r.body.items[0].chua_ro, true);
  const kh = await goi(`/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=999888`, 'admin');
  assert.equal(kh.status, 200); assert.equal(kh.body.pagination.total, 0);
  const s = JSON.stringify(r.body).replace(/KTT-DEMO-\d+/g, '');
  assert.ok(!RE_DIEN_THOAI.test(s) && !/địa chỉ|dia_chi|ten_nguoi|phone/i.test(s));
});

test('cache theo ngày: lần hai dùng bó đã có; nạp thêm dữ liệu / xóa cache thì số cập nhật', async () => {
  duLieu();
  const a = await goi(TH_URL, 'admin');
  const dem1 = Api.thongKe().ngay_hd;
  assert.equal(dem1, 3, 'ba ngày, ba bó');
  const b = await goi(TH_URL, 'admin');
  assert.deepEqual(a.body, b.body);
  assert.equal(Api.thongKe().ngay_hd, 3);
  n2('536001', '2026-10-21', { so: '30' });
  capOk('2026-10-23 11:00:00');
  const c = await goi(TH_URL, 'admin');
  assert.equal(c.body.meta.n2, a.body.meta.n2 + 1, 'độ mới đổi -> tính lại');
});

// ---------- xuất Excel ----------
test('xuất «nhắc việc» qua router thật: ba sheet, tổng khớp, KHÔNG có số hiệu bưu gửi, không từ cấm, quét bắt được chuỗi thử', async () => {
  duLieu();
  const { wb, headers } = await docXlsx(XUAT_NV, 'admin');
  assert.match(headers.get('content-type'), /spreadsheetml/);
  assert.match(headers.get('content-disposition'), /KTT-huong-dong-chuyen_nhac-viec_20261020_20261022\.xlsx/);
  assert.deepEqual(wb.worksheets.map((s) => s.name), ['Nhắc việc', 'Theo ngày (20 nơi đầu)', 'Giải thích']);
  const ws = wb.getWorksheet('Nhắc việc');
  let n2sum = 0; let nrows = 0; let lan = 0; let tongRow = null;
  ws.eachRow((row, i) => {
    if (i < 3) return;
    if (typeof row.getCell(1).value === 'number') { nrows++; n2sum += row.getCell(7).value; lan += row.getCell(12).value; }
    if (String(row.getCell(3).value || '').startsWith('TỔNG')) tongRow = row;
  });
  const th = (await goi(TH_URL, 'admin')).body;
  assert.equal(nrows, th.theo_noi_dong.length); assert.equal(n2sum, th.meta.dong_vao_530100);
  assert.equal(tongRow.getCell(7).value, th.meta.dong_vao_530100);
  assert.equal(lan, th.theo_noi_dong.reduce((s, y) => s + y.chuyen_co_lan, 0));
  assert.equal(ws.getRow(2).getCell(2).value, 'Mã bưu cục');
  assert.equal(ws.getRow(3).getCell(3).value, 'Điểm VHX giả', 'tiếng Việt có dấu đúng');
  assert.equal(ws.getRow(2).getCell(7).value, 'Hàng nội tỉnh đóng vào 530100 (3 ngày)');
  assert.deepEqual(ws.views[0], { ...ws.views[0], state: 'frozen', ySplit: 2 });
  assert.ok(ws.autoFilter);
  let itMau = 0; ws.eachRow((row, i) => { if (i >= 3 && row.getCell(9).value === 'Ít mẫu') itMau++; });
  assert.equal(itMau, th.theo_noi_dong.filter((y) => y.it_mau).length);
  const mt = wb.getWorksheet('Theo ngày (20 nơi đầu)');
  let ok = true; mt.eachRow((row, i) => { if (i >= 3 && typeof row.getCell(1).value === 'number') { let s = 0; for (let c = 4; c <= 6; c++) s += Number(row.getCell(c).value || 0); if (s !== row.getCell(7).value) ok = false; } });
  assert.ok(ok, 'ma trận: tổng ngày theo nơi = cột cộng');
  assert.ok(wb.getWorksheet('Giải thích').rowCount >= 20);
  const q = quetWorkbook(wb);
  assert.equal(q.shbg, 0, 'không số hiệu bưu gửi'); assert.equal(q.tuCam, 0, 'không từ cấm'); assert.equal(q.dienThoai, 0);
  // chứng minh quét bắt được chuỗi thử
  const thu = new ExcelJS.Workbook(); thu.addWorksheet('t').addRow(['KTT-DEMO-0001', 'Mốc A', 'đợt', 'bản đồ nhiệt', 'heatmap', 'tuổi', '0912345678', 'VN123456789VN']);
  const qt = quetWorkbook(thu);
  assert.equal(qt.shbg, 2); assert.equal(qt.tuCam, 5); assert.equal(qt.dienThoai, 1);
  // Unicode: chữ HOA / thường có dấu cũng bị bắt
  assert.ok(RE_TU_CAM.test('MỐC B') && RE_TU_CAM.test('Đợt') && RE_TU_CAM.test('TUỔI'));
});

test('xuất «chi tiết» qua router thật: số dòng = dòng N2; N3 sheet riêng; dòng đầu cảnh báo; cột ngày hàng đến và «ngày cũ»; không cột cá nhân', async () => {
  duLieu();
  const { wb } = await docXlsx(XUAT_CT, 'ttvh');
  assert.deepEqual(wb.worksheets.map((s) => s.name), ['Chi tiết', 'Chưa chắc']);
  const th = (await goi(TH_URL, 'admin')).body;
  const ct = wb.getWorksheet('Chi tiết');
  assert.equal(ct.getRow(1).getCell(1).value, 'File chứa số hiệu bưu gửi thật. Không đưa lên GitHub, không dán vào chat.');
  assert.equal(ct.rowCount - 3, th.meta.dong_vao_530100, 'số dòng = dòng vào 530100 (không kể 6 BCVH)');
  const head = ct.getRow(3).values.slice(1);
  assert.ok(head.includes('Ngày hàng đến Khai thác') && head.includes('Chuyến thư ghi ngày cũ (hơn 7 ngày): có/không') && head.includes('Số hiệu bưu gửi'));
  assert.ok(!head.some((h) => /tên người|địa chỉ|điện thoại|người gửi|người nhận/i.test(String(h))));
  let co = 0; ct.eachRow((row, i) => { if (i >= 4 && row.getCell(6).value === 'có') co++; });
  assert.equal(co, 1);
  assert.equal(wb.getWorksheet('Chưa chắc').rowCount - 3, th.meta.n3);
  const lh = await docXlsx(`${XUAT_CT}&loai_hinh=VHX`, 'admin');
  assert.equal(lh.wb.getWorksheet('Chi tiết').rowCount - 3, 15);
  const q = quetWorkbook(wb); assert.ok(q.shbg > 0, 'file chi tiết CÓ số hiệu (quét bắt được)'); assert.equal(q.tuCam, 0);
});

test('xuất: vượt trần dòng -> 400 JSON; route chỉ thêm GET; 6 BCVH không viết cứng ở lõi mới', async () => {
  duLieu();
  process.env.KTT_XUAT_TRAN_DONG = '5';
  try {
    const r = await goi(XUAT_CT, 'admin');
    assert.equal(r.status, 400); assert.equal(r.body.ma, 'KTT_QUA_NHIEU_DONG');
  } finally { delete process.env.KTT_XUAT_TRAN_DONG; }
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ktt.js'), 'utf8');
  assert.ok(!/router\.(post|put|patch|delete)\(/.test(src));
  const lib = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttHuongDong.js'), 'utf8');
  assert.ok(!/'533140'|'535470'|'536250'|'537220'|'537015'|'535790'/.test(lib), '6 BCVH lấy từ kttTinh.MA_BCVH_HUE, không viết cứng thêm');
});

test('nhãn trong mã xuất và trả lời không có từ cấm (quét nguồn nhãn)', () => {
  const nguon = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttHuongDongXuat.js'), 'utf8');
  const nhan = nguon.split('\n').filter((l) => !/^\s*\/\/|^\/\*|^ \*/.test(l)).join('\n');
  assert.ok(!RE_TU_CAM.test(nhan), 'kttHuongDongXuat.js: không từ cấm trong nhãn');
});

// ---------- KTT-DC-2: trong_loc, đổi tên khóa, chuyến lẫn nhất quán, các ca biên ----------
const DONG = (r) => r.theo_noi_dong.reduce((t, y) => t + y.dong_vao_530100, 0);
const LAN = (r) => r.theo_noi_dong.reduce((t, y) => t + y.chuyen_co_lan, 0);
function danhMucThem(...ds) { for (const [code, name, type] of ds) them('post_offices', { id: `po-${code}`, code, name, type, commune_id: 'c1' }); }

test('trong_loc: luôn có; không lọc = số toàn tập; từng nhóm khớp bảng, theo_ngay, số nơi, chuyến lẫn; 5 nhóm cộng = toàn tập; tỷ trọng 8 nơi đầu', async () => {
  duLieu();
  const full = (await goi(TH_URL, 'admin')).body; const m = full.meta; const t = m.trong_loc;
  assert.deepEqual(Object.keys(t).sort(), ['chuyen_co_lan', 'dong_vao_530100', 'loai_hinh', 'so_noi_dong', 'ty_trong_8_noi_dau', 'nguong_bg_trong_tui', 'bg_trong_tui_lon', 'bg_trong_tui_nho', 'so_tui_lon', 'so_noi_dong_tui_lon', 'ty_trong_8_noi_dau_tui_lon'].sort()); // KTT-DC-3: chỉ THÊM
  assert.equal(t.loai_hinh, null);
  assert.equal(t.dong_vao_530100, m.dong_vao_530100_toan_tap, 'không lọc = toàn tập'); assert.equal(t.dong_vao_530100, DONG(full)); assert.equal(t.dong_vao_530100, full.theo_ngay.reduce((s, y) => s + y.dong_vao_530100, 0));
  assert.equal(t.so_noi_dong, m.so_noi_dong); assert.equal(t.so_noi_dong, full.theo_noi_dong.length);
  assert.equal(t.chuyen_co_lan, m.so_chuyen_co_lan); assert.equal(t.chuyen_co_lan, LAN(full));
  const top8 = full.theo_noi_dong.slice(0, 8).reduce((s, y) => s + y.dong_vao_530100, 0);
  assert.ok(Math.abs(t.ty_trong_8_noi_dau - top8 / t.dong_vao_530100) < 1e-12);
  assert.equal(top8, t.dong_vao_530100, 'dữ liệu giả có 6 nơi (≤ 8): 8 nơi đầu = tất cả -> tỷ trọng 1');
  const cong = { dong: 0, noi: 0, lan: 0 };
  for (const g of HDC.LOAI_HINH) {
    const b = (await goi(`${TH_URL}&loai_hinh=${g}`, 'admin')).body; const x = b.meta.trong_loc;
    assert.equal(x.loai_hinh, g);
    assert.equal(x.dong_vao_530100, DONG(b), g); assert.equal(x.dong_vao_530100, b.meta.dong_vao_530100, g); assert.equal(x.dong_vao_530100, b.theo_ngay.reduce((s, y) => s + y.dong_vao_530100, 0), g);
    assert.equal(x.so_noi_dong, b.theo_noi_dong.length, g); assert.equal(x.chuyen_co_lan, LAN(b), g); assert.equal(x.chuyen_co_lan, b.meta.so_chuyen_co_lan, g);
    const t8 = b.theo_noi_dong.slice(0, 8).reduce((s, y) => s + y.dong_vao_530100, 0);
    assert.ok(Math.abs(x.ty_trong_8_noi_dau - t8 / x.dong_vao_530100) < 1e-12, g);
    assert.equal(b.meta.n2, m.n2, 'khóa cũ của meta vẫn là toàn tập');
    cong.dong += x.dong_vao_530100; cong.noi += x.so_noi_dong; cong.lan += x.chuyen_co_lan;
  }
  assert.deepEqual(cong, { dong: t.dong_vao_530100, noi: t.so_noi_dong, lan: t.chuyen_co_lan }, 'tổng 5 nhóm = toàn tập');
});

test('trong_loc: ty_trong_8_noi_dau tính trên 8 nơi đầu của phạm vi lọc (không phải toàn tập); null khi phạm vi rỗng', async () => {
  danhMuc();
  for (let i = 0; i < 10; i++) { const ma = `5362${String(i).padStart(2, '0')}`; danhMucThem([ma, `VHX ${i}`, 'VHX']); for (let j = 0; j < 10 - i; j++) n2(ma, '2026-10-20', { so: String(i + 1) }); } // 10, 9, ..., 1 hàng
  capOk('2026-10-23 10:00:00');
  const r = (await goi(`${TH_URL}&loai_hinh=VHX`, 'admin')).body; const x = r.meta.trong_loc;
  assert.equal(x.dong_vao_530100, 55); assert.equal(x.so_noi_dong, 10);
  assert.ok(Math.abs(x.ty_trong_8_noi_dau - (10 + 9 + 8 + 7 + 6 + 5 + 4 + 3) / 55) < 1e-12, '52 / 55');
  const rong = (await goi(`${TH_URL}&loai_hinh=GD1`, 'admin')).body.meta.trong_loc; // không nơi GD1 nào có hàng
  assert.deepEqual(rong, { loai_hinh: 'GD1', dong_vao_530100: 0, so_noi_dong: 0, chuyen_co_lan: 0, ty_trong_8_noi_dau: null, nguong_bg_trong_tui: 15, bg_trong_tui_lon: 0, bg_trong_tui_nho: 0, so_tui_lon: 0, so_noi_dong_tui_lon: 0, ty_trong_8_noi_dau_tui_lon: null });
});

test('không có dữ liệu: trong_loc có, toàn 0, ty_trong_8_noi_dau null', async () => {
  const b = (await goi(TH_URL, 'admin')).body;
  assert.deepEqual(b.meta.trong_loc, { loai_hinh: null, dong_vao_530100: 0, so_noi_dong: 0, chuyen_co_lan: 0, ty_trong_8_noi_dau: null, nguong_bg_trong_tui: 15, bg_trong_tui_lon: 0, bg_trong_tui_nho: 0, so_tui_lon: 0, so_noi_dong_tui_lon: 0, ty_trong_8_noi_dau_tui_lon: null });
});

test('khóa mới: so_hang_ghi_ngay_cu (bưu gửi) và so_chuyen_thu_ghi_ngay_cu (chuyến thư khác nhau); KHÔNG còn khóa cũ trong JSON và Excel', async () => {
  duLieu();
  n2('536001', '2026-10-20', { so: '3', dong: '2026-09-01 08:00:00' }); n2('536001', '2026-10-20', { so: '3', dong: '2026-09-01 08:00:00' }); // thêm 2 hàng cùng chuyến ghi ngày cũ (cùng khóa 6 cột)
  n2('536100', '2026-10-22', { so: '11', dong: '2026-09-05 08:00:00' }); // chuyến ghi cũ khác (nơi khác)
  const b = (await goi(TH_URL, 'admin')).body; const m = b.meta;
  assert.equal(m.so_hang_ghi_ngay_cu, 4, '1 + 2 + 1 bưu gửi'); assert.equal(m.so_chuyen_thu_ghi_ngay_cu, 2, 'chuyến 3 (536001) và chuyến 11 (536100)');
  assert.equal(m.so_hang_ghi_ngay_cu, b.theo_noi_dong.reduce((s, y) => s + y.dong_chuyen_ghi_ngay_cu, 0));
  assert.ok(m.so_chuyen_thu_ghi_ngay_cu <= m.so_hang_ghi_ngay_cu);
  assert.equal(m.so_hang_ghi_ngay_cu_ca_6_bcvh, m.so_hang_ghi_ngay_cu, 'dữ liệu giả: 6 BCVH không có hàng ghi cũ');
  assert.ok(!JSON.stringify(b).includes('so_chuyen_ghi_ngay_cu'), 'không còn khóa cũ (kể cả ..._ca_6_bcvh)');
  const l = (await goi(`${TH_URL}&loai_hinh=VHX`, 'admin')).body.meta; assert.equal(l.so_hang_ghi_ngay_cu, 3); assert.equal(l.so_chuyen_thu_ghi_ngay_cu, 1);
  const { wb } = await docXlsx(XUAT_NV, 'admin'); const txt = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => txt.push(String(c.value && c.value.richText ? c.value.richText.map((x) => x.text).join('') : (c.value ?? ''))))));
  const gt = txt.find((t) => t.startsWith('• Hàng hoàn không tính'));
  assert.match(gt, /Có 4 bưu gửi \(thuộc 2 chuyến thư\)/);
  assert.ok(!txt.some((t) => t.includes('so_chuyen_ghi_ngay_cu')));
});

test('ranh «Ít mẫu»: đúng 19 (N1 + N2) là ít mẫu, ty_le null; đúng 20 là tính tỷ lệ', async () => {
  danhMuc(); danhMucThem(['536210', 'VHX 19', 'VHX'], ['536211', 'VHX 20', 'VHX'], ['536212', 'VHX 21', 'VHX']);
  for (const [ma, soN2, soN1] of [['536210', 12, 7], ['536211', 13, 7], ['536212', 14, 7]]) { for (let i = 0; i < soN2; i++) n2(ma, '2026-10-20', { so: '1' }); for (let i = 0; i < soN1; i++) n1(ma, '2026-10-20', { so: '9' }); }
  capOk('2026-10-23 10:00:00');
  const by = Object.fromEntries((await goi(TH_URL, 'admin')).body.theo_noi_dong.map((y) => [y.ma, y]));
  assert.deepEqual([by['536210'].it_mau, by['536210'].ty_le], [true, null], '12 + 7 = 19');
  assert.equal(by['536211'].it_mau, false); assert.ok(Math.abs(by['536211'].ty_le - 13 / 20) < 1e-12, '13 + 7 = 20');
  assert.equal(by['536212'].it_mau, false); assert.ok(Math.abs(by['536212'].ty_le - 14 / 21) < 1e-12);
  const { wb } = await docXlsx(XUAT_NV, 'admin'); const ws = wb.getWorksheet('Nhắc việc'); const hien = {};
  ws.eachRow((row, i) => { if (i >= 3 && typeof row.getCell(1).value === 'number') hien[row.getCell(2).value] = row.getCell(9).value; });
  assert.equal(hien['536210'], 'Ít mẫu'); assert.ok(Math.abs(hien['536211'] - 0.65) < 1e-12);
});

test('nơi chỉ có hàng N3: không có trong bảng; chuyến của nó không tính vào chuyến lẫn; meta = Σ bảng = trong_loc = Σ theo_ngay; danh sách chua_ro vẫn có', async () => {
  duLieu();
  danhMucThem(['536300', 'VHX chỉ N3', 'VHX']);
  n3('536300', '2026-10-21', { so: '5' }); n3('536300', '2026-10-22', { so: '6' });
  const b = (await goi(TH_URL, 'admin')).body; const m = b.meta;
  assert.ok(!b.theo_noi_dong.some((y) => y.ma === '536300'), 'bảng không liệt kê nơi chỉ có N3');
  assert.equal(m.so_noi_dong, 6, 'số nơi không đổi (vẫn 6 nơi có N2)');
  assert.equal(m.n3, 3, 'N3 vẫn nằm ở số toàn tập: 1 của 531120 + 2 của 536300');
  assert.equal(m.so_chuyen_co_lan, LAN(b)); assert.equal(m.so_chuyen_co_lan, m.trong_loc.chuyen_co_lan);
  assert.equal(m.so_chuyen_co_lan, b.theo_ngay.reduce((s, y) => s + y.chuyen_co_lan, 0), 'chuyến của các nơi trong bảng không trải nhiều ngày ở dữ liệu giả');
  assert.ok(m.so_chuyen_vao_530100 >= m.so_chuyen_co_lan + 2, 'chuyến vào 530100 tính MỌI nơi (kể cả nơi chỉ có N3): 2 chuyến thêm');
  const lh = (await goi(`${TH_URL}&loai_hinh=VHX`, 'admin')).body; assert.equal(lh.meta.trong_loc.chuyen_co_lan, LAN(lh)); assert.equal(lh.meta.so_chuyen_co_lan, LAN(lh));
  const ds = (await goi(`/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=536300&nhom=chua_ro`, 'admin')).body;
  assert.equal(ds.pagination.total, 2); assert.equal(ds.items[0].ten_noi_dong, 'VHX chỉ N3'); assert.equal((await goi(`/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=536300`, 'admin')).body.pagination.total, 0);
  const ct = (await docXlsx(XUAT_CT, 'admin')).wb; assert.equal(ct.getWorksheet('Chưa chắc').rowCount - 3, 3, 'N3 của nơi chỉ có N3 vẫn có ở sheet «Chưa chắc»');
});

test('hàng không có giờ quét túi đến: tính theo ngày xác nhận BD10 đến; không có cả hai thì không vào cửa sổ', async () => {
  danhMuc();
  n2('536001', '2026-10-21', { so: '4', quet: null, xnd: '2026-10-21 05:40:00' }); // chỉ có xác nhận BD10 đến
  n2('536001', '2026-10-22', { so: '5', quet: null, xnd: null }); // không có cả hai: ngoài mọi cửa sổ
  capOk('2026-10-23 10:00:00');
  const b = (await goi(TH_URL, 'admin')).body;
  assert.equal(b.meta.n2, 1); assert.equal(b.meta.trong_loc.dong_vao_530100, 1);
  assert.deepEqual(b.theo_ngay.map((y) => y.dong_vao_530100), [0, 1, 0]);
  const ds = (await goi(DS_URL, 'admin')).body; assert.equal(ds.pagination.total, 1); assert.equal(ds.items[0].ngay_den, '2026-10-21');
});

// ==========================================
// KTT-DC-3: ngưỡng «túi lớn» (số BG nội tỉnh trong túi), trường mới, danh sách, Excel, cache.
// ==========================================
const NG_URL = (n, extra = '') => `${TH_URL}&nguong=${n}${extra}`;
/**
 * MỘT túi ĐẾN vào 530100 từ `from` chứa `n2` bưu gửi N2 (mỗi bưu gửi có túi ĐI riêng sang BCVH lần lượt trong `nhan`) và `n3` bưu gửi N3 (còn có túi chuyển tiếp).
 * `soHieu` (so_hieu_bd8) đặt tay được để tạo mã túi trùng nhau.
 */
function tuiNhieu(from, ngay, { n2: so2 = 0, n3: so3 = 0, so = '1', nhan = [TH], soHieu = null, dong = `${ngay} 04:00:00` } = {}) {
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', from_pos: from, mail_trip_number: so, co_mo_tui: 1, chuyen_thu_gio_dong: dong, gio_quet_tui_den: `${ngay} 05:30:00`, bd10_den_xnd: `${ngay} 05:30:00`, bd10_den_ma_diem_gui: NT, bd10_den_so_hieu: `BD10-D-${seq}`, ...(soHieu ? { so_hieu_bd8: soHieu } : {}) });
  for (let i = 0; i < so2; i++) {
    const s = sh(); const n = nhan[i % nhan.length];
    bg(t, s);
    const d = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: n, bd10_di_gio_di: `${ngay} 20:00:00`, gio_quet_tui_di: `${ngay} 20:00:00`, bd10_di_so_hieu: `BD10-I-${seq}`, bd10_di_ma_diem_nhan: n });
    bg(d, s);
  }
  for (let i = 0; i < so3; i++) {
    const s = sh(); bg(t, s);
    const c = tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DA_CHIA_SAN', from_pos: from, to_pos: TH, mail_trip_number: `c${seq}`, chuyen_thu_gio_dong: `${ngay} 03:00:00`, gio_quet_tui_den: `${ngay} 05:35:00`, bd10_den_ma_diem_gui: NT, bd10_di_gio_di: `${ngay} 06:00:00`, bd10_di_ma_diem_nhan: TH });
    bg(c, s);
  }
  return t;
}
/**
 * Dữ liệu ranh ngưỡng (ngày 20, 21, 22):
 *  536001 VHX: túi 14, 15 (hai BCVH đích), 16 (ba BCVH đích) ngày 20 + túi 20 ngày 21 (chuyến ghi ngày cũ) -> ở ngưỡng 15: lớn 15 + 16 + 20 = 51, nhỏ 14.
 *  536002 VHX: chỉ túi nhỏ (5) -> không có túi lớn nhưng có bg_trong_tui_nho.
 *  536003 VHX: túi 12 N2 + 3 N3 (= 15, LỚN, N2 = 12 vào tử số, N3 chỉ góp cỡ túi) + túi nhỏ 2 N2 (nơi có cả lớn lẫn nhỏ), ngày 21.
 *  531120 (GD3): túi 30 ngày 22 -> lớn. TH (một trong 6 BCVH) đóng túi 40 ngày 20 -> bị loại khỏi bảng.
 */
function duLieuTui() {
  danhMuc();
  danhMucThem(['536002', 'VHX hai', 'VHX'], ['536003', 'VHX ba', 'VHX']);
  tuiNhieu('536001', '2026-10-20', { n2: 14, so: '1', soHieu: 'TUI-TRUNG' });
  tuiNhieu('536001', '2026-10-20', { n2: 15, so: '2', nhan: [TH, HT], soHieu: 'TUI-TRUNG' });
  tuiNhieu('536001', '2026-10-20', { n2: 16, so: '3', nhan: [TH, HT, HTH] });
  tuiNhieu('536001', '2026-10-21', { n2: 20, so: '4', dong: '2026-09-01 08:00:00' });
  tuiNhieu('536002', '2026-10-20', { n2: 5, so: '5' });
  tuiNhieu('536003', '2026-10-21', { n2: 12, n3: 3, so: '6' });
  tuiNhieu('536003', '2026-10-21', { n2: 2, so: '7' });
  tuiNhieu('531120', '2026-10-22', { n2: 30, so: '8' });
  tuiNhieu(TH, '2026-10-20', { n2: 40, so: '9', nhan: [HTH] });
  capOk('2026-10-23 10:00:00');
}
const Nh = (b, ma) => b.theo_noi_dong.find((y) => y.ma === ma);
/** Mọi đẳng thức của mục 3 trên một trả lời tong-hop. */
function kiemDangThuc(b, nhan) {
  const m = b.meta; const t = m.trong_loc;
  const sum = (f) => b.theo_noi_dong.reduce((s, y) => s + y[f], 0);
  assert.equal(sum('bg_trong_tui_lon'), m.bg_trong_tui_lon, `${nhan}: Σ bảng = meta`);
  assert.equal(t.bg_trong_tui_lon, m.bg_trong_tui_lon, `${nhan}: trong_loc = meta`);
  assert.equal(b.theo_loai_hinh.reduce((s, y) => s + y.bg_trong_tui_lon, 0), m.bg_trong_tui_lon, `${nhan}: Σ theo_loai_hinh`);
  assert.equal(b.theo_ngay.reduce((s, y) => s + y.bg_trong_tui_lon, 0), m.bg_trong_tui_lon, `${nhan}: Σ theo_ngay`);
  assert.equal(m.bg_trong_tui_lon + m.bg_trong_tui_nho, m.dong_vao_530100, `${nhan}: lớn + nhỏ = đóng vào 530100`);
  assert.equal(t.bg_trong_tui_lon + t.bg_trong_tui_nho, t.dong_vao_530100, `${nhan}: trong_loc lớn + nhỏ`);
  for (const y of b.theo_noi_dong) assert.equal(y.bg_trong_tui_lon + y.bg_trong_tui_nho, y.dong_vao_530100, `${nhan}: nơi ${y.ma}`);
  assert.equal(m.so_tui_lon, sum('so_tui_lon')); assert.equal(m.so_noi_dong_tui_lon, b.theo_noi_dong.filter((y) => y.bg_trong_tui_lon > 0).length);
  assert.equal(b.theo_loai_hinh.reduce((s, y) => s + y.so_noi_dong_tui_lon, 0), m.so_noi_dong_tui_lon);
  for (const k of ['nguong_bg_trong_tui', 'bg_trong_tui_lon', 'bg_trong_tui_nho', 'so_tui_lon', 'so_noi_dong_tui_lon', 'ty_trong_8_noi_dau_tui_lon']) assert.deepEqual(t[k], m[k], `${nhan}: trong_loc.${k} = meta.${k}`);
  for (const y of b.theo_noi_dong) assert.ok(y.chuyen_co_tui_lon <= y.chuyen_vao_530100 && y.chuyen_co_tui_lon <= y.so_tui_lon, `${nhan}: chuyến có túi lớn hợp lý`);
}

test('KTT-DC-3: ranh ngưỡng 14 / 15 / 16 — túi đúng bằng ngưỡng là túi LỚN (≥); đổi ngưỡng đổi đúng số', async () => {
  duLieuTui();
  const lay = async (n) => (await goi(NG_URL(n), 'admin')).body;
  const b14 = await lay(14); const b15 = await lay(15); const b16 = await lay(16); const b17 = await lay(17); const b21 = await lay(21);
  const a = (b) => Nh(b, '536001');
  assert.deepEqual([a(b14).bg_trong_tui_lon, a(b14).so_tui_lon, a(b14).bg_trong_tui_nho], [14 + 15 + 16 + 20, 4, 0], 'ngưỡng 14: túi 14 cũng lớn');
  assert.deepEqual([a(b15).bg_trong_tui_lon, a(b15).so_tui_lon, a(b15).bg_trong_tui_nho], [15 + 16 + 20, 3, 14], 'ngưỡng 15: túi 15 LỚN, túi 14 nhỏ');
  assert.deepEqual([a(b16).bg_trong_tui_lon, a(b16).so_tui_lon, a(b16).bg_trong_tui_nho], [16 + 20, 2, 29], 'ngưỡng 16: túi 15 thành nhỏ');
  assert.deepEqual([a(b17).bg_trong_tui_lon, a(b17).so_tui_lon], [20, 1]);
  assert.deepEqual([a(b21).bg_trong_tui_lon, a(b21).so_tui_lon, a(b21).bg_trong_tui_nho, a(b21).so_bg_tui_lon_nhat], [0, 0, 65, 20], 'ngưỡng 21: hết túi lớn; túi nhiều BG nhất vẫn là túi 20');
  assert.equal(a(b15).so_bg_tui_lon_nhat, 20);
  for (const [b, n] of [[b14, 14], [b15, 15], [b16, 16], [b17, 17], [b21, 21]]) { assert.equal(b.meta.nguong_bg_trong_tui, n); assert.equal(b.meta.trong_loc.nguong_bg_trong_tui, n); assert.equal(b.meta.nguon_nguong_bg_trong_tui, 'yêu cầu'); kiemDangThuc(b, `nguong ${n}`); }
});

test('KTT-DC-3: túi chứa cả N2 lẫn N3 (cỡ túi đếm cả hai, tử số chỉ N2); túi nhiều BCVH đích; nơi có cả túi lớn lẫn nhỏ; nơi chỉ có túi nhỏ; 6 BCVH bị loại', async () => {
  duLieuTui();
  const b = (await goi(TH_URL, 'admin')).body; // ngưỡng mặc định 15
  assert.equal(b.meta.nguong_bg_trong_tui, 15); assert.equal(b.meta.nguon_nguong_bg_trong_tui, 'mặc định');
  const c = Nh(b, '536003');
  assert.deepEqual([c.dong_vao_530100, c.chua_ro, c.bg_trong_tui_lon, c.bg_trong_tui_nho, c.so_tui_lon, c.so_bg_tui_lon_nhat], [14, 3, 12, 2, 1, 15], 'túi 12 N2 + 3 N3 = 15 là LỚN; N3 không vào tử số, vẫn ở chua_ro');
  assert.equal(Nh((await goi(NG_URL(16), 'admin')).body, '536003').bg_trong_tui_lon, 0, 'ngưỡng 16: cỡ 15 là túi nhỏ');
  const d = Nh(b, '536002');
  assert.deepEqual([d.dong_vao_530100, d.bg_trong_tui_lon, d.bg_trong_tui_nho, d.so_tui_lon, d.chuyen_co_tui_lon, d.so_bg_tui_lon_nhat], [5, 0, 5, 0, 0, 5], 'nơi chỉ có túi nhỏ: vẫn trong bảng, có bg_trong_tui_nho, không có túi lớn');
  const a = Nh(b, '536001');
  assert.deepEqual([a.bg_trong_tui_lon, a.bg_trong_tui_nho, a.chuyen_co_tui_lon, a.chuyen_vao_530100], [51, 14, 3, 4], 'nơi có cả lớn lẫn nhỏ; túi nhiều BCVH đích tính một túi');
  assert.equal(b.theo_noi_dong.some((y) => y.ma === TH), false, '6 BCVH không là nơi đóng trong bảng');
  assert.equal(Nh(b, '531120').bg_trong_tui_lon, 30);
  assert.equal(b.meta.do_6_bcvh_dong, 40);
  assert.equal(b.meta.bg_trong_tui_lon, 51 + 12 + 30); assert.equal(b.meta.bg_trong_tui_nho, 14 + 5 + 2);
  assert.equal(b.meta.so_tui_lon, 3 + 1 + 1); assert.equal(b.meta.so_noi_dong_tui_lon, 3);
  assert.equal(b.meta.ty_trong_8_noi_dau_tui_lon, null, 'chỉ 3 nơi có túi lớn (≤ 8) -> null');
  assert.equal(b.theo_noi_dong.length, 4, 'danh sách nơi không đổi theo ngưỡng');
  assert.deepEqual((await goi(NG_URL(200), 'admin')).body.theo_noi_dong.map((y) => y.ma), b.theo_noi_dong.map((y) => y.ma));
  kiemDangThuc(b, 'mặc định');
});

test('KTT-DC-3: đẳng thức khi lọc từng loai_hinh ở nhiều ngưỡng; giảm đơn điệu khi tăng ngưỡng; số cũ không đổi', async () => {
  duLieuTui();
  const goc = (await goi(TH_URL, 'admin')).body.meta;
  for (const loai of [null, ...HDC.LOAI_HINH]) {
    let truoc = Infinity; let truocTui = Infinity;
    for (const n of [1, 5, 10, 14, 15, 16, 20, 21, 50, 200]) {
      const b = (await goi(NG_URL(n, loai ? `&loai_hinh=${loai}` : ''), 'admin')).body;
      kiemDangThuc(b, `${loai} / ${n}`);
      assert.ok(b.meta.bg_trong_tui_lon <= truoc, `không tăng khi tăng ngưỡng (${loai} / ${n})`); truoc = b.meta.bg_trong_tui_lon;
      assert.ok(b.meta.so_tui_lon <= truocTui); truocTui = b.meta.so_tui_lon;
      assert.equal(b.meta.n2, goc.n2); assert.equal(b.meta.tong_noi_tinh, goc.tong_noi_tinh); assert.equal(b.meta.n3, goc.n3);
    }
  }
  const b1 = (await goi(NG_URL(1), 'admin')).body; assert.equal(b1.meta.bg_trong_tui_lon, b1.meta.dong_vao_530100, 'ngưỡng 1: mọi túi là lớn');
  const b200 = (await goi(NG_URL(200), 'admin')).body; assert.equal(b200.meta.bg_trong_tui_lon, 0); assert.equal(b200.meta.ty_trong_8_noi_dau_tui_lon, null);
  const b = (await goi(TH_URL, 'admin')).body;
  assert.deepEqual(b.theo_ngay.map((y) => [y.ngay, y.bg_trong_tui_lon, y.so_noi_dong_tui_lon]), [['2026-10-20', 31, 1], ['2026-10-21', 32, 2], ['2026-10-22', 30, 1]], 'theo ngày hàng đến');
});

test('KTT-DC-3: tỷ trọng 8 nơi đầu của hàng trong túi lớn: tính khi > 8 nơi có túi lớn, xếp theo bg_trong_tui_lon', async () => {
  danhMuc();
  for (let i = 0; i < 10; i++) { const ma = `5363${String(i).padStart(2, '0')}`; danhMucThem([ma, `VHX ${i}`, 'VHX']); tuiNhieu(ma, '2026-10-20', { n2: 20 + i, so: String(i + 1) }); }
  tuiNhieu('536001', '2026-10-20', { n2: 3, so: '99' }); // nơi chỉ có túi nhỏ: không tính vào 8 nơi
  capOk('2026-10-23 10:00:00');
  const b = (await goi(`${TH_URL}&loai_hinh=VHX`, 'admin')).body;
  const lon = [29, 28, 27, 26, 25, 24, 23, 22, 21, 20]; const tong = lon.reduce((s, x) => s + x, 0);
  assert.equal(b.meta.bg_trong_tui_lon, tong); assert.equal(b.meta.so_noi_dong_tui_lon, 10);
  assert.ok(Math.abs(b.meta.ty_trong_8_noi_dau_tui_lon - lon.slice(0, 8).reduce((s, x) => s + x, 0) / tong) < 1e-12);
  assert.deepEqual(b.meta.trong_loc.ty_trong_8_noi_dau_tui_lon, b.meta.ty_trong_8_noi_dau_tui_lon);
  kiemDangThuc(b, 'tỷ trọng');
  assert.equal(b.theo_noi_dong[0].dong_vao_530100, 29, 'thứ tự mặc định vẫn theo dong_vao_530100');
});

test('KTT-DC-3: tham số nguong sai kiểu / ngoài khoảng -> 400 ở cả ba route; 1 và 200 hợp lệ', async () => {
  duLieuTui();
  const goiY = { tong: (v) => `${TH_URL}&nguong=${v}`, ds: (v) => `${DS_URL}&nguong=${v}`, xuat: (v) => `${XUAT_NV}&nguong=${v}` };
  for (const v of ['0', '201', '-1', '1.5', 'abc', '15%2C5', '1e1', '0x10', '%20%2015']) {
    for (const [ten, f] of Object.entries(goiY)) {
      const r = await goi(f(v), 'admin');
      assert.equal(r.status, 400, `${ten} nguong=${v}`); assert.match(r.body.error, /nguong/, `${ten} ${v}`);
    }
  }
  assert.equal((await goi(`${TH_URL}&nguong=15&nguong=20`, 'admin')).status, 400, 'lặp tham số');
  for (const v of ['1', '200']) for (const f of Object.values(goiY)) assert.equal((await goi(f(v), 'admin')).status, 200, `nguong=${v}`);
  assert.equal((await goi(`${DS_URL}&chi_tui_lon=2`, 'admin')).status, 400);
  assert.equal((await goi(`${TH_URL}&chi_tui_lon=1`, 'admin')).status, 400, 'chi_tui_lon chỉ có ở danh sách');
});

test('KTT-DC-3: nguồn của ngưỡng — mặc định / cấu hình (tham số hệ thống) / yêu cầu; yêu cầu thắng cấu hình; danh bạ tham số', async () => {
  duLieuTui();
  assert.equal((await goi(TH_URL, 'admin')).body.meta.nguon_nguong_bg_trong_tui, 'mặc định');
  TS.__thuDatRam('ktt_dc_nguong_bg_trong_tui', 20);
  try {
    const cauHinh = (await goi(TH_URL, 'admin')).body;
    assert.equal(cauHinh.meta.nguong_bg_trong_tui, 20); assert.equal(cauHinh.meta.nguon_nguong_bg_trong_tui, 'cấu hình');
    assert.equal(Nh(cauHinh, '536001').bg_trong_tui_lon, 20, 'ngưỡng 20 từ cấu hình: chỉ túi 20');
    const yc = (await goi(NG_URL(15), 'admin')).body;
    assert.equal(yc.meta.nguong_bg_trong_tui, 15); assert.equal(yc.meta.nguon_nguong_bg_trong_tui, 'yêu cầu');
    const ds = (await goi(`${DS_URL}&chi_tui_lon=1`, 'admin')).body;
    assert.equal(ds.meta.nguong_bg_trong_tui, 20); assert.equal(ds.meta.nguon_nguong_bg_trong_tui, 'cấu hình'); assert.equal(ds.pagination.total, 20);
  } finally { TS.__thuDatRam('ktt_dc_nguong_bg_trong_tui', undefined); }
  assert.equal((await goi(TH_URL, 'admin')).body.meta.nguon_nguong_bg_trong_tui, 'mặc định');
  const DB_TS = require('../server/config/tham-so');
  const m = DB_TS.THEO_KHOA.get('ktt_dc_nguong_bg_trong_tui');
  assert.ok(m && !m.chi_doc); assert.equal(m.mac_dinh, 15); assert.equal(m.min, 1); assert.equal(m.max, 200); assert.equal(m.nhom, 'hang_tai_ktt');
  assert.ok(TS.kiemTraGiaTri(m, 0) && TS.kiemTraGiaTri(m, 201) && TS.kiemTraGiaTri(m, 1.5) && !TS.kiemTraGiaTri(m, 15), 'giá trị ngoài khoảng bị từ chối, 15 hợp lệ');
});

test('KTT-DC-3: cache — kích thước túi tính một lần theo ngày; đổi ngưỡng không tính lại ngày nào và cho kết quả khác, đúng', async () => {
  duLieuTui();
  Api.xoaCache();
  let tinh = 0; const goc = HDC.tinhNgay; HDC.tinhNgay = (...a) => { tinh++; return goc(...a); };
  try {
    const b15 = (await goi(NG_URL(15), 'admin')).body;
    assert.equal(tinh, 3, 'ba ngày của khoảng, mỗi ngày một lần');
    const b20 = (await goi(NG_URL(20), 'admin')).body; const b16 = (await goi(NG_URL(16), 'admin')).body; const mac = (await goi(TH_URL, 'admin')).body;
    assert.equal(tinh, 3, 'đổi ngưỡng KHÔNG tính lại và không mất cache');
    assert.notEqual(b15.meta.bg_trong_tui_lon, b20.meta.bg_trong_tui_lon);
    assert.equal(b15.meta.bg_trong_tui_lon, 51 + 12 + 30); assert.equal(b20.meta.bg_trong_tui_lon, 20 + 30); assert.equal(b16.meta.bg_trong_tui_lon, 16 + 20 + 30);
    assert.deepEqual(mac, { ...b15, meta: { ...b15.meta, nguon_nguong_bg_trong_tui: 'mặc định' } }, 'ngưỡng mặc định 15 = yêu cầu 15 (trừ nguồn)');
    await goi(`${DS_URL}&nguong=17`, 'admin'); await goi(`${XUAT_NV}&nguong=18`, 'admin'); await goi(`${XUAT_CT}&nguong=19`, 'admin');
    assert.equal(tinh, 3, 'danh sách và xuất dùng chung bó ngày');
  } finally { HDC.tinhNgay = goc; }
});

test('KTT-DC-3: danh sách — so_bg_trong_tui, tui_lon, ma_tui, khoa_tui; mã túi trùng vẫn phân biệt bằng khóa túi; chi_tui_lon=1 và kết hợp chi_ghi_ngay_cu; không dữ liệu cá nhân', async () => {
  duLieuTui();
  const tat = (await goi(`${DS_URL}&page_size=100`, 'admin')).body;
  assert.equal(tat.pagination.total, 65, '536001: 14 + 15 + 16 + 20 bưu gửi N2');
  assert.equal(tat.items.filter((x) => x.tui_lon).length, 51); assert.equal(tat.items.filter((x) => !x.tui_lon).length, 14);
  for (const x of tat.items) { assert.equal(x.tui_lon, x.so_bg_trong_tui >= 15); assert.ok([14, 15, 16, 20].includes(x.so_bg_trong_tui)); assert.equal(x.khoa_tui.split('|').length, 7, '6 cột chuyến + chỉ số túi'); }
  const trung = tat.items.filter((x) => x.ma_tui === 'TUI-TRUNG');
  assert.equal(trung.length, 14 + 15, 'hai túi dùng chung mã túi');
  assert.equal(new Set(trung.map((x) => x.khoa_tui)).size, 2, 'mã trùng nhưng khóa túi phân biệt hai túi');
  assert.deepEqual([...new Set(trung.map((x) => x.so_bg_trong_tui))].sort(), [14, 15]);
  const lon = (await goi(`${DS_URL}&page_size=100&chi_tui_lon=1`, 'admin')).body;
  assert.equal(lon.pagination.total, 51); assert.ok(lon.items.every((x) => x.tui_lon)); assert.equal(lon.meta.chi_tui_lon, true);
  assert.equal((await goi(`${DS_URL}&chi_tui_lon=0`, 'admin')).body.pagination.total, 65);
  const cu = (await goi(`${DS_URL}&page_size=100&chi_tui_lon=1&chi_ghi_ngay_cu=1`, 'admin')).body;
  assert.equal(cu.pagination.total, 20, '(túi lớn) VÀ (chuyến ghi ngày cũ): chỉ túi 20 ngày 21'); assert.ok(cu.items.every((x) => x.tui_lon && x.chuyen_ghi_ngay_cu));
  assert.equal((await goi(`${DS_URL}&chi_ghi_ngay_cu=1&nguong=21`, 'admin')).body.pagination.total, 20);
  assert.equal((await goi(`${DS_URL}&chi_ghi_ngay_cu=1&chi_tui_lon=1&nguong=21`, 'admin')).body.pagination.total, 0, 'ngưỡng 21: túi 20 không còn lớn');
  assert.equal((await goi(`${DS_URL}&nguong=16&page_size=100`, 'admin')).body.items.filter((x) => x.tui_lon).length, 36);
  const n3 = (await goi(`/api/ktt/huong-dong-chuyen/danh-sach${Q}&noi_dong=536003&nhom=chua_ro`, 'admin')).body;
  assert.equal(n3.pagination.total, 3); assert.ok(n3.items.every((x) => x.so_bg_trong_tui === 15 && x.tui_lon === true && x.chua_ro === true), 'BG N3 cũng có cỡ túi');
  const s = JSON.stringify(tat).replace(/KTT-DEMO-\d+/g, '');
  assert.ok(!RE_DIEN_THOAI.test(s) && !/địa chỉ|dia_chi|ten_nguoi|phone/i.test(s));
});

const RE_TU_CAM3 = /Mốc\s*[AB]|đợt|bản đồ nhiệt|heatmap|tuổi|quỹ|trung vị|(?<![\p{L}])cờ(?![\p{L}])/iu;
const vanBan = (c) => (c.value && c.value.richText ? c.value.richText.map((x) => x.text).join('') : String(c.value ?? ''));
test('KTT-DC-3: Excel «nhắc việc» có 4 cột túi lớn, «Giải thích» nêu quy tắc và ngưỡng bằng chữ đời thường; không số hiệu bưu gửi, không từ cấm', async () => {
  duLieuTui();
  const { wb } = await docXlsx(XUAT_NV, 'admin');
  const ws = wb.getWorksheet('Nhắc việc');
  const head = ws.getRow(2).values.slice(1).map(String);
  const cot = (t) => { assert.ok(head.includes(t), t); return head.indexOf(t) + 1; };
  const iL = cot('Hàng trong túi lớn'); const iN = cot('Hàng trong túi nhỏ (được phép)'); const iT = cot('Số túi lớn'); const iM = cot('Túi lớn nhất (số bưu gửi)');
  const th = (await goi(TH_URL, 'admin')).body;
  let sL = 0; let sN = 0; let sT = 0; let hang = 0;
  ws.eachRow((row, i) => { if (i >= 3 && typeof row.getCell(1).value === 'number') { hang++; sL += row.getCell(iL).value; sN += row.getCell(iN).value; sT += row.getCell(iT).value; assert.equal(row.getCell(iM).value, Nh(th, String(row.getCell(2).value)).so_bg_tui_lon_nhat); } });
  assert.equal(hang, th.theo_noi_dong.length); assert.equal(sL, th.meta.bg_trong_tui_lon); assert.equal(sN, th.meta.bg_trong_tui_nho); assert.equal(sT, th.meta.so_tui_lon);
  const text = []; wb.getWorksheet('Giải thích').eachRow((r) => text.push(String(r.getCell(1).value)));
  assert.ok(text.some((t) => /túi có từ 15 bưu gửi nội tỉnh trở lên là túi lớn/.test(t)), 'ngưỡng 15 bằng chữ đời thường');
  assert.ok(text.some((t) => /không đếm hàng đi tỉnh khác nằm cùng túi/.test(t)));
  const q = quetWorkbook(wb); assert.equal(q.shbg, 0); assert.equal(q.dienThoai, 0);
  let cam = 0; wb.eachSheet((s) => s.eachRow((row) => row.eachCell((c) => { if (RE_TU_CAM3.test(vanBan(c))) cam++; })));
  assert.equal(cam, 0, 'không từ cấm (bản mở rộng: quỹ, cờ, trung vị)');
  for (const thu of ['Mốc A', 'đợt', 'tuổi', 'quỹ', 'cờ', 'trung vị', 'Trung Vị', 'heatmap', 'bản đồ nhiệt', 'MỐC B']) assert.ok(RE_TU_CAM3.test(thu), `quét bắt được: ${thu}`);
  assert.ok(!RE_TU_CAM3.test('Thuận Hóa, cơ sở, mờ, cờ-lê'.replace('cờ-lê', 'cơ-lê')), 'không bắt nhầm chữ khác');
  const x20 = await docXlsx(`${XUAT_NV}&nguong=20`, 'admin'); const t20 = []; x20.wb.getWorksheet('Giải thích').eachRow((r) => t20.push(String(r.getCell(1).value)));
  assert.ok(t20.some((t) => /túi có từ 20 bưu gửi nội tỉnh trở lên là túi lớn/.test(t)));
  let l20 = 0; x20.wb.getWorksheet('Nhắc việc').eachRow((row, i) => { if (i >= 3 && typeof row.getCell(1).value === 'number') l20 += row.getCell(iL).value; });
  assert.equal(l20, (await goi(NG_URL(20), 'admin')).body.meta.bg_trong_tui_lon);
});

test('KTT-DC-3: Excel «chi tiết» có cột ngưỡng, số BG nội tỉnh trong túi, mã túi, «túi lớn: có/không»; dòng đầu cảnh báo như cũ', async () => {
  duLieuTui();
  const { wb } = await docXlsx(XUAT_CT, 'admin');
  const ws = wb.getWorksheet('Chi tiết');
  assert.match(String(ws.getRow(1).getCell(1).value), /Không đưa lên GitHub/);
  const head = ws.getRow(3).values.slice(1).map(String);
  const i = (t) => { assert.ok(head.includes(t), t); return head.indexOf(t) + 1; };
  const cNg = i('Ngưỡng túi lớn (số bưu gửi nội tỉnh)'); const cSo = i('Số bưu gửi nội tỉnh trong túi'); i('Mã túi'); const cCo = i('Túi lớn: có/không');
  let dong = 0; let lon = 0;
  ws.eachRow((row, r) => {
    if (r < 4) return; dong++;
    const so = row.getCell(cSo).value; const co = row.getCell(cCo).value;
    assert.equal(row.getCell(cNg).value, 15); assert.equal(co, so >= 15 ? 'có' : 'không'); if (co === 'có') lon++;
  });
  const th = (await goi(TH_URL, 'admin')).body;
  assert.equal(dong, th.meta.dong_vao_530100); assert.equal(lon, th.meta.bg_trong_tui_lon);
  let n3 = 0; wb.getWorksheet('Chưa chắc').eachRow((row, r) => { if (r >= 4) { n3++; assert.equal(row.getCell(cSo).value, 15); assert.equal(row.getCell(cCo).value, 'có'); } });
  assert.equal(n3, 3);
  const x16 = await docXlsx(`${XUAT_CT}&nguong=16`, 'admin'); let l16 = 0;
  x16.wb.getWorksheet('Chi tiết').eachRow((row, r) => { if (r >= 4) { assert.equal(row.getCell(cNg).value, 16); if (row.getCell(cCo).value === 'có') l16++; } });
  assert.equal(l16, (await goi(NG_URL(16), 'admin')).body.meta.bg_trong_tui_lon);
  let cam = 0; wb.eachSheet((s) => s.eachRow((row, r) => { if (r > 1) row.eachCell((c) => { if (RE_TU_CAM3.test(vanBan(c))) cam++; }); }));
  assert.equal(cam, 0);
});

test('KTT-DC-3: quyền với tham số mới — ADMIN / TTVH / TTKT 200; GDVH / TIVI 403; không token 401', async () => {
  duLieuTui();
  for (const [ten, url] of [['tong-hop', NG_URL(20)], ['danh-sach', `${DS_URL}&nguong=20&chi_tui_lon=1`], ['xuat nhac_viec', `${XUAT_NV}&nguong=20`], ['xuat chi_tiet', `${XUAT_CT}&nguong=20`]]) {
    assert.equal((await goi(url)).status, 401, ten);
    for (const w of ['admin', 'ttvh', 'ttkt']) assert.equal((await goi(url, w)).status, 200, `${ten} ${w}`);
    for (const w of ['gdvh', 'tivi']) assert.equal((await goi(url, w)).status, 403, `${ten} ${w}`);
  }
  assert.deepEqual((await goi(NG_URL(20), 'admin')).body, (await goi(NG_URL(20), 'ttkt')).body);
});

test('KTT-DC-3: không có dữ liệu — các số túi lớn bằng 0, không lỗi; MỘT chỗ duy nhất định nghĩa «từ ngưỡng trở lên»', async () => {
  const b = (await goi(NG_URL(15), 'admin')).body;
  assert.equal(b.meta.bg_trong_tui_lon, 0); assert.equal(b.meta.bg_trong_tui_nho, 0); assert.equal(b.meta.so_tui_lon, 0); assert.equal(b.meta.nguong_bg_trong_tui, 15);
  assert.equal(b.theo_ngay.every((y) => y.bg_trong_tui_lon === 0 && y.so_noi_dong_tui_lon === 0), true);
  assert.equal(HDC.laTuiLon(15, 15), true); assert.equal(HDC.laTuiLon(14, 15), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttHuongDong.js'), 'utf8');
  assert.ok((src.match(/laTuiLon\(/g) || []).length >= 4, 'mọi chỗ dùng gọi hàm chung');
  assert.equal((src.match(/>= nguong/g) || []).length, 1, 'dấu so sánh với ngưỡng chỉ ở MỘT chỗ');
});
