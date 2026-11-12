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
function n2(from, ngay, { so = '1', dong = `${ngay} 04:00:00`, nhan = TH, gam = 100, dv = 'E', gioDi = `${ngay} 20:00:00`, diemGui = NT, shbg = sh() } = {}) {
  const t = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', from_pos: from, mail_trip_number: so, co_mo_tui: 1, chuyen_thu_gio_dong: dong, gio_quet_tui_den: `${ngay} 05:30:00`, bd10_den_xnd: `${ngay} 05:30:00`, bd10_den_ma_diem_gui: diemGui, bd10_den_so_hieu: `BD10-D-${seq}` });
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
  assert.equal(m.so_chuyen_ghi_ngay_cu, 1);
  assert.equal(m.so_chuyen_ghi_ngay_cu_ca_6_bcvh, 1);
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
  assert.deepEqual(Object.keys(it).sort(), ['bcvh_dich', 'chua_ro', 'chuyen_ghi_ngay_cu', 'dich_vu', 'kg', 'ma_noi_dong', 'ngay_den', 'ngay_dong_chuyen', 'shbg', 'so_chuyen_thu', 'ten_noi_dong'].sort());
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
