// ==========================================
// Test KTT-8d: GET /api/ktt/xuat/hom-sau-chua-di (sheet «Thông tin» + «8 Hôm sau-chưa đi»): quyền, tham số, số dòng = /danh-sach cùng tham số = ô màn hình B (B5, bảng rớt lại),
// «Thông tin» đủ mục, kiểu ô (SHBG văn bản, giờ không lệch múi giờ), trần dòng, chưa có dữ liệu.
// Server thật trên DB tạm của harness (file, nên worker_thread đọc cùng file); dữ liệu GIẢ (SHBG KTT-DEMO-xxx, mã điểm / đường thư giả). Không mở data/, không DB thật, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const Api = require('../server/lib/kttApi');
const X = require('../server/lib/kttXuat');
const NGUON = require('../server/lib/kttNguon');
const TS = require('../server/lib/thamSo');

const PORT = 5994;
const TH = '533140'; const HT = '535470';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT8D_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT8D_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT8D_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT8D_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-xuat8-${Date.now()}.db` });
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
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  TS.khoiTao(db);
  Api.xoaCache();
  delete process.env.KTT_XUAT_TRAN_DONG;
});

// ---------- dữ liệu giả (cùng mẫu với ktt-di-cung-ngay.test.js) ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
function kt(shbg, { quet, gioDi = null, nhan = TH, diemGui = '999001', dt = 'DT-A', dtTen = 'Đường thư giả A', gam = 100 }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: diemGui, bd10_den_ten_diem_gui: `Điểm ${diemGui}`, bd10_den_ma_duong_thu: dt, bd10_den_ten_duong_thu: dtTen });
  bg(den, shbg, { khoi_luong_thuc_te_g: gam });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan, bd10_di_ma_duong_thu: nhan ? `DI-${nhan}` : null });
  bg(di, shbg, { khoi_luong_thuc_te_g: gam });
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/** Ba ngày 20–22/10: liên tỉnh (xe Cấp 1) hai đường thư, nội tỉnh đi liên tỉnh, hàng hoàn. Độ mới 23/10 10:00 (mọi ngày đã chốt). */
function duLieu() {
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // cùng ngày
  kt('KTT-DEMO-A3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00', gam: 1234 }); // hôm sau
  kt('KTT-DEMO-A6', { quet: '2026-10-21 21:00:00', gioDi: '2026-10-22 06:30:00', nhan: HT }); // hôm sau
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00', nhan: HT }); // từ 2 ngày
  kt('KTT-DEMO-A5', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi (trên 24 giờ)
  kt('KTT-DEMO-A7', { quet: '2026-10-21 08:00:00', nhan: null, diemGui: '999003' }); // chưa đi (trên 24 giờ), nơi gửi khác cùng đường thư
  kt('KTT-DEMO-C2', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-23 05:00:00', dt: 'DT-B', dtTen: 'Đường thư giả B' }); // hôm sau
  kt('KTT-DEMO-H2', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00', diemGui: '531120' }); // hàng hoàn, hôm sau
  kt('KTT-DEMO-X2', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-22 09:00:00', nhan: '530900', diemGui: '530101' }); // nội tỉnh đi liên tỉnh, hôm sau (đường thư DT-A)
  kt('KTT-DEMO-X3', { quet: '2026-10-21 08:00:00', nhan: null, diemGui: '530101' }); // nội tỉnh đi liên tỉnh, chưa đi
  capOk('2026-10-23 10:00:00');
}

// ---------- gọi API + đọc file ----------
async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: res.status, body: await res.json(), headers: res.headers };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
async function docFile(r) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf); return wb; }
/** Sheet 8 -> mảng đối tượng theo khóa api của COT_SHEET8. */
function dongSheet8(wb) {
  const kq = [];
  wb.getWorksheet(X.TEN_SHEET_8).eachRow((row, i) => { if (i === 1) return; const o = {}; X.COT_SHEET8.forEach((c, j) => { o[c.api] = row.getCell(j + 1).value; }); kq.push(o); });
  return kq;
}
function thongTin(wb) {
  const m = new Map();
  wb.getWorksheet(X.TEN_SHEET_THONG_TIN).eachRow((row, i) => { if (i > 1) m.set(row.getCell(1).value, row.getCell(2).value); });
  return m;
}
const U = '/api/ktt/xuat/hom-sau-chua-di';
const Q20 = '?tu=2026-10-20&den=2026-10-22';
const gioO = (d) => (d instanceof Date ? d.toISOString().slice(0, 19).replace('T', ' ') : d);

/** Tham số một dòng B5 theo quy ước KTT-8d2: mã rỗng -> __RONG__; hàng thường -> hang_hoan=0, hàng hoàn -> hang_hoan=1. */
function thamSoO(r, huong) {
  const ma = (v) => encodeURIComponent(v || NGUON.MA_LOC_RONG);
  return `&duong_thu=${ma(r.duong_thu_ma)}&noi_gui=${ma(r.noi_gui_ma)}&huong=${huong}&hang_hoan=${r.hang_hoan ? 1 : 0}`;
}

// Các ô giao diện đang bấm (KttLichXe B5, KttDiCungNgay bảng rớt lại «Danh sách» / ô Hôm sau / Chưa đi): tham số y như kttApi.fetchKttDanhSachDiNgay gửi.
const O_BAM = [
  '', // toàn bộ (B1)
  '&duong_thu=DT-A&huong=lien_tinh_den_bcvh', // bảng rớt lại theo đường thư (B2 · cột Danh sách / Hôm sau / Chưa đi)
  '&duong_thu=DT-B&huong=lien_tinh_den_bcvh',
  '&duong_thu=DT-A&noi_gui=999001&huong=lien_tinh_den_bcvh', // B5 mục 1
  '&duong_thu=DT-A&noi_gui=999003&huong=lien_tinh_den_bcvh',
  '&duong_thu=DT-A&noi_gui=531120&huong=noi_tinh_den_bcvh&hang_hoan=1', // B5 dòng «Hoàn»
  '&duong_thu=DT-A&noi_gui=530101&huong=noi_tinh_di_lien_tinh', // B5 mục 3
  `&ma_bcvh=${HT}`
];

// ---------- quyền ----------
test('quyền: không token 401; ADMIN và TTVH 200 (xlsx); GDVH 403; TIVI 403; chỉ GET', async () => {
  duLieu();
  const q = `${U}${Q20}&loai=hom-sau`;
  assert.equal((await goi(q)).status, 401);
  for (const who of ['admin', 'ttvh']) {
    const r = await goi(q, who);
    assert.equal(r.status, 200, who);
    assert.match(r.headers.get('content-type'), /spreadsheetml\.sheet/);
  }
  assert.equal((await goi(q, 'gdvh')).status, 403);
  assert.equal((await goi(q, 'tivi')).status, 403);
  assert.equal((await goi(q, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404);
});

test('tên file ASCII theo loai và khoảng, attachment, no-store', async () => {
  duLieu();
  const r = await goi(`${U}${Q20}&loai=chua-di-24h`, 'admin');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="KTT_HomSauChuaDi_chua-di-24h_2026-10-20_2026-10-22\.xlsx"$/);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
});

// ---------- tham số ----------
test('tham số sai -> 400 tiếng Việt như /danh-sach: thiếu loai, loai lạ, page (không hỗ trợ), huong / hang_hoan / ma_bcvh sai, chèn chuỗi lạ', async () => {
  duLieu();
  const loi = [
    [`${U}${Q20}`, /"loai" phải thuộc/], [`${U}${Q20}&loai=t1`, /"loai" phải thuộc/], [`${U}${Q20}&loai=hom-sau&page=1`, /Tham số không hỗ trợ: "page"/],
    [`${U}${Q20}&loai=hom-sau&huong=abc`, /"huong" phải thuộc/], [`${U}${Q20}&loai=hom-sau&hang_hoan=2`, /"hang_hoan" phải là 0 \/ false/],
    [`${U}${Q20}&loai=hom-sau&ma_bcvh=999999`, /6 BCVH Huế/], [`${U}${Q20}&loai=hom-sau&duong_thu=${encodeURIComponent("a';--")}`, /"duong_thu" phải là MÃ/],
    [`${U}?tu=2026-10-01&den=2026-11-01&loai=hom-sau`, /tối đa 31 ngày/], [`${U}?tu=2026-10-20&loai=hom-sau`, /Thiếu tham số/]
  ];
  for (const [url, re] of loi) {
    const r = await goi(url, 'admin');
    assert.equal(r.status, 400, url);
    assert.match(r.body.error, re, url);
    assert.deepEqual(Object.keys(r.body).sort(), ['error', 'ma']);
  }
});

// ---------- số dòng khớp ----------
test('số dòng sheet 8 = pagination.total của /danh-sach cùng tham số = «Số dòng kiểm tra», cùng tập SHBG, cho MỌI ô bấm × hai nhóm', async () => {
  duLieu();
  let coDong = 0;
  for (const loai of ['hom-sau', 'chua-di-24h']) {
    for (const o of O_BAM) {
      const ds = (await goi(`/api/ktt/danh-sach${Q20}&loai=${loai}${o}&page_size=200`, 'admin')).body;
      const wb = await docFile(await goi(`${U}${Q20}&loai=${loai}${o}`, 'admin'));
      const d8 = dongSheet8(wb);
      const tt = thongTin(wb);
      assert.equal(d8.length, ds.pagination.total, `${loai}${o}`);
      assert.equal(tt.get('Số dòng kiểm tra'), d8.length, `${loai}${o}`);
      assert.deepEqual(d8.map((x) => x.shbg).sort(), ds.items.map((x) => x.shbg).sort(), `${loai}${o}`);
      if (o.includes('ma_bcvh')) assert.match(tt.get('Đối chiếu với màn hình B'), /không đối chiếu được/);
      else assert.match(tt.get('Đối chiếu với màn hình B'), new RegExp(`có ${d8.length} SHBG: khớp số dòng`), `${loai}${o}`);
      coDong += d8.length;
    }
  }
  assert.ok(coDong > 10, 'dữ liệu giả có dòng ở nhiều ô');
});

test('khớp ô màn hình: B5 (lich-xe/theo-duong-thu) và bảng rớt lại (rotlai/theo-duong-thu) — số trong ô = số dòng sheet 8', async () => {
  duLieu();
  const b5 = (await goi(`/api/ktt/lich-xe/theo-duong-thu${Q20}`, 'admin')).body;
  let soO = 0;
  for (const [huong, muc] of Object.entries(b5).filter(([, v]) => v && Array.isArray(v.dong))) {
    for (const r of muc.dong) {
      for (const [loai, truong] of [['hom-sau', 'hom_sau'], ['chua-di-24h', 'chua_di_tren_24h']]) {
        const q = thamSoO(r, huong);
        const n = dongSheet8(await docFile(await goi(`${U}${Q20}&loai=${loai}${q}`, 'admin'))).length;
        assert.equal(n, r[truong], `${huong} ${r.noi_gui_ma} ${r.duong_thu_ma} ${loai}`);
        soO++;
      }
    }
  }
  assert.ok(soO >= 8, `đã thử ${soO} ô B5`);
  const rl = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}`, 'admin')).body.dong;
  for (const r of rl) {
    const q = `&duong_thu=${r.duong_thu_ma || NGUON.MA_LOC_RONG}&huong=lien_tinh_den_bcvh`;
    assert.equal(dongSheet8(await docFile(await goi(`${U}${Q20}&loai=hom-sau${q}`, 'admin'))).length, r.hom_sau, r.duong_thu_ma);
    assert.equal(dongSheet8(await docFile(await goi(`${U}${Q20}&loai=chua-di-24h${q}`, 'admin'))).length, r.chua_di_tren_24h, r.duong_thu_ma);
  }
});

test('sheet 7 theo ô (việc 3 KTT-8d): xuat/luu-thoat?nguon=<mã đường thư>&trang_thai=ro_lai đã lọc được theo đường thư và theo ngày (tu = den) — khớp cột «rớt lại» của bảng rớt lại', async () => {
  duLieu();
  const sheet7 = async (q) => { const wb = await docFile(await goi(`/api/ktt/xuat/luu-thoat${q}`, 'admin')); return wb.getWorksheet(X.TEN_SHEET_7).rowCount - 1; };
  for (const [tu, den] of [['2026-10-20', '2026-10-22'], ['2026-10-20', '2026-10-20'], ['2026-10-21', '2026-10-21'], ['2026-10-22', '2026-10-22']]) {
    const rl = (await goi(`/api/ktt/rotlai/theo-duong-thu?tu=${tu}&den=${den}`, 'admin')).body.dong;
    for (const r of rl) assert.equal(await sheet7(`?tu=${tu}&den=${den}&nguon=${r.duong_thu_ma}&trang_thai=ro_lai`), r.ro_lai, `${tu} ${r.duong_thu_ma}`);
  }
});

// ---------- cấu trúc, kiểu ô ----------
test('file: hai sheet «Thông tin», «8 Hôm sau-chưa đi»; tiêu đề cột; SHBG văn bản, giờ đúng số nguồn, KL kg, nhóm / hướng ra chữ; sắp theo (ngày D, SHBG)', async () => {
  duLieu();
  const wb = await docFile(await goi(`${U}${Q20}&loai=hom-sau`, 'admin'));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', '8 Hôm sau-chưa đi']);
  assert.deepEqual(wb.getWorksheet(X.TEN_SHEET_8).getRow(1).values.slice(1), X.COT_SHEET8.map((c) => c.tieuDe));
  const d = dongSheet8(wb);
  const a3 = d.find((x) => x.shbg === 'KTT-DEMO-A3');
  assert.equal(typeof a3.shbg, 'string');
  assert.equal(gioO(a3.gio_den_ktt), '2026-10-20 21:30:00');
  assert.equal(gioO(a3.bd10_di_gio_lap), '2026-10-21 06:30:00');
  assert.equal(a3.kg, 1.234);
  assert.equal(a3.cho_gio, 9);
  assert.equal(a3.nhom, 'Hôm sau');
  assert.equal(a3.huong, X.NHAN_HUONG_8.lien_tinh_den_bcvh);
  assert.equal(a3.hang_hoan, 'Không');
  assert.equal(a3.ma_bcvh, TH);
  assert.equal(d.find((x) => x.shbg === 'KTT-DEMO-H2').hang_hoan, 'Có');
  const khoa = d.map((x) => `${x.ngay_den}|${x.shbg}`);
  assert.deepEqual(khoa, [...khoa].sort());
  const chua = dongSheet8(await docFile(await goi(`${U}${Q20}&loai=chua-di-24h&duong_thu=DT-A&noi_gui=999001`, 'admin')));
  assert.deepEqual(chua.map((x) => x.shbg), ['KTT-DEMO-A5']);
  assert.equal(chua[0].bd10_di_gio_lap, null);
  assert.equal(chua[0].cho_gio, 71); // 20/10 11:00 -> độ mới 23/10 10:00
});

test('sheet «Thông tin» sheet 8: đủ mục (cửa sổ thực tế, ngày giờ + tài khoản xuất, định nghĩa nhóm, trạng thái số liệu, đơn vị, số dòng kiểm tra)', async () => {
  duLieu();
  const tt = thongTin(await docFile(await goi(`${U}${Q20}&loai=chua-di-24h&duong_thu=DT-A&huong=lien_tinh_den_bcvh`, 'ttvh')));
  assert.deepEqual([...tt.keys()], ['Cửa sổ', 'Dữ liệu đến', 'Chốt số theo ngày', 'Ngày xuất, người xuất', 'Trạng thái số liệu', 'Phạm vi bưu gửi', 'Định nghĩa: năm nhóm đi',
    'Định nghĩa: rớt lại', 'Định nghĩa: hôm sau', 'Định nghĩa: chưa đi trên 24 giờ', 'Định nghĩa: xe Cấp 1', 'Định nghĩa: chuyến liền kề',
    'Định nghĩa: hàng hoàn Tổ KHHH', 'Định nghĩa: số giờ chờ', 'Đơn vị', 'Số dòng kiểm tra', 'Đối chiếu với màn hình B']);
  assert.match(tt.get('Cửa sổ'), /^Từ ngày 20\/10\/2026 đến ngày 22\/10\/2026 \(sheet «8 Hôm sau-chưa đi».*Ngày có dữ liệu thực tế: 20\/10\/2026 – 22\/10\/2026 \(3 ngày\)/);
  assert.match(tt.get('Cửa sổ'), /Ô đã bấm: nhóm «Chưa đi trên 24 giờ»; đường thư đến: DT-A; nơi gửi BD10 đến: không \(tất cả\); hướng: Liên tỉnh/);
  assert.match(tt.get('Ngày xuất, người xuất'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(giờ Việt Nam\); tài khoản: KT8D_TTVH\.$/);
  assert.equal(tt.get('Chốt số theo ngày'), '20/10/2026: đã chốt; 21/10/2026: đã chốt; 22/10/2026: đã chốt');
  assert.match(tt.get('Trạng thái số liệu'), /^Đã chốt/);
  assert.match(tt.get('Định nghĩa: chưa đi trên 24 giờ'), /> 24 giờ/);
  assert.match(tt.get('Định nghĩa: xe Cấp 1'), /^Xe Cấp 1 = BD10 đến có nơi gửi KHÔNG bắt đầu bằng 53/);
  assert.ok(!JSON.stringify([...tt.values()]).includes('C3'), 'không còn định nghĩa C3 (chưa có căn cứ)');
  assert.match(tt.get('Đơn vị'), /Sheet «8 Hôm sau-chưa đi»: mỗi dòng là một SHBG/);
  assert.equal(tt.get('Số dòng kiểm tra'), 2);
  const s = JSON.stringify([...tt.values()]);
  assert.ok(!/Bearer|eyJ|@/.test(s), 'không token, không email');
});

test('số tạm: ngày chưa qua giờ chốt ghi «số tạm»', async () => {
  kt('KTT-DEMO-T1', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00' });
  capOk('2026-10-22 08:00:00');
  const tt = thongTin(await docFile(await goi(`${U}?tu=2026-10-21&den=2026-10-22&loai=hom-sau`, 'admin')));
  assert.match(tt.get('Trạng thái số liệu'), /^Số tạm/);
  assert.match(tt.get('Chốt số theo ngày'), /22\/10\/2026: số tạm/);
});

// ---------- giới hạn, trống ----------
test('trần số dòng: vượt -> 400 KTT_QUA_NHIEU_DONG, chưa gửi file; đúng bằng trần thì 200', async () => {
  duLieu();
  const n = (await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau`, 'admin')).body.pagination.total;
  process.env.KTT_XUAT_TRAN_DONG = String(n - 1);
  const r = await goi(`${U}${Q20}&loai=hom-sau`, 'admin');
  assert.equal(r.status, 400);
  assert.equal(r.body.ma, 'KTT_QUA_NHIEU_DONG');
  assert.match(r.body.error, new RegExp(`Có ${n} dòng, vượt giới hạn ${n - 1} dòng`));
  process.env.KTT_XUAT_TRAN_DONG = String(n);
  assert.equal((await goi(`${U}${Q20}&loai=hom-sau`, 'admin')).status, 200);
  assert.equal(X.TRAN_DONG_MAC_DINH, 200000);
});

test('chưa có dữ liệu / ô rỗng: file hợp lệ, chỉ tiêu đề, «Số dòng kiểm tra» = 0', async () => {
  const wb = await docFile(await goi(`${U}${Q20}&loai=hom-sau`, 'admin'));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', '8 Hôm sau-chưa đi']);
  assert.equal(dongSheet8(wb).length, 0);
  assert.equal(thongTin(wb).get('Số dòng kiểm tra'), 0);
  assert.match(thongTin(wb).get('Dữ liệu đến'), /Chưa có dữ liệu/);
  duLieu();
  const wb2 = await docFile(await goi(`${U}${Q20}&loai=hom-sau&duong_thu=KHONG-CO`, 'admin'));
  assert.equal(dongSheet8(wb2).length, 0);
  assert.match(thongTin(wb2).get('Đối chiếu với màn hình B'), /có 0 SHBG: khớp/);
});

// ---------- KTT-8d2: bộ kiểm mã, mã rỗng, hàng hoàn ----------
/** Dữ liệu giả riêng cho KTT-8d2: dòng không có mã đường thư / nơi gửi (null, '', toàn khoảng trắng), và hàng KHÔNG hoàn cùng (nơi gửi 531120, đường thư) với hàng hoàn. */
function duLieu8d2() {
  duLieu();
  kt('KTT-DEMO-H3', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00', diemGui: '531120', nhan: HT }); // KHÔNG hoàn (đích Hương Trà), cùng nơi gửi + đường thư với H2
  kt('KTT-DEMO-R1', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00', dt: null }); // đường thư null
  kt('KTT-DEMO-R2', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00', dt: '' }); // đường thư rỗng
  kt('KTT-DEMO-R3', { quet: '2026-10-21 08:00:00', nhan: null, dt: '   ' }); // đường thư toàn khoảng trắng, chưa đi
  kt('KTT-DEMO-R4', { quet: '2026-10-21 21:30:00', gioDi: '2026-10-22 06:30:00', diemGui: null }); // nơi gửi null
  capOk('2026-10-23 10:00:00');
}
const tongDs = async (loai, o) => (await goi(`/api/ktt/danh-sach${Q20}&loai=${loai}${o}&page_size=200`, 'admin')).body;

test('KTT-8d2 bộ kiểm mã (dữ liệu giả): nhận mã có khoảng trắng, chữ thường, dấu . - / _, chữ có dấu, đúng 40 ký tự; chặn quote, ; % \\ < > ngoặc, xuống dòng, 41 ký tự, rỗng', () => {
  const ok = ['DT-A', 'dt-a', 'Dt A 01', 'A.B/C_D-1', 'Đường 1/2', '123456', 'X'.repeat(40), '__RONG__', 'a b  c'];
  const loi = ["a'b", 'a"b', 'a;b', 'a--b;', 'a%b', 'a\\b', 'a<b>', '(không rõ đường thư)', 'a\nb', 'a\tb', 'a`b', 'a|b', 'X'.repeat(41), '', '${x}', 'a,b'];
  for (const v of ok) assert.ok(NGUON.RE_MA_NGUON.test(v), `nhận: ${JSON.stringify(v)}`);
  for (const v of loi) assert.ok(!NGUON.RE_MA_NGUON.test(v), `chặn: ${JSON.stringify(v)}`);
});

test('KTT-8d2 khopMaLoc: không lọc / __RONG__ (null, rỗng, khoảng trắng) / so từng ký tự sau trim', () => {
  const R = NGUON.MA_LOC_RONG;
  assert.equal(R, '__RONG__');
  for (const v of [null, undefined, '', '   ']) { assert.equal(NGUON.khopMaLoc(R, v), true, JSON.stringify(v)); assert.equal(NGUON.khopMaLoc(null, v), true); }
  assert.equal(NGUON.khopMaLoc(R, 'DT-A'), false);
  assert.equal(NGUON.khopMaLoc('DT-A', ' DT-A '), true);
  assert.equal(NGUON.khopMaLoc('DT-A', 'dt-a'), false, 'phân biệt hoa thường');
  assert.equal(NGUON.khopMaLoc('DT-A', null), false);
  assert.equal(NGUON.khopMaLoc('DT-A', 'DT-AB'), false);
  assert.equal(NGUON.khopMaLoc(null, 'DT-A'), true);
});

test('KTT-8d2 __RONG__: mỗi dòng B5 không có mã (đường thư / nơi gửi) lọc được, số dòng danh sách = số trong ô, sheet 8 = danh sách; bảng rớt lại cũng khớp', async () => {
  duLieu8d2();
  const b5 = (await goi(`/api/ktt/lich-xe/theo-duong-thu${Q20}`, 'admin')).body;
  let khongMa = 0;
  for (const [huong, muc] of Object.entries(b5).filter(([, v]) => v && Array.isArray(v.dong))) {
    for (const r of muc.dong) {
      if (r.duong_thu_ma && r.noi_gui_ma) continue;
      khongMa++;
      for (const [loai, truong] of [['hom-sau', 'hom_sau'], ['chua-di-24h', 'chua_di_tren_24h']]) {
        const q = thamSoO(r, huong);
        const ds = await tongDs(loai, q);
        assert.equal(ds.pagination.total, r[truong], `${huong} ${loai} ${q}`);
        assert.equal(dongSheet8(await docFile(await goi(`${U}${Q20}&loai=${loai}${q}`, 'admin'))).length, r[truong], `sheet 8 ${huong} ${loai}`);
      }
    }
  }
  assert.ok(khongMa >= 2, `có dòng B5 không mã: ${khongMa}`);
  // dòng «không có mã đường thư» của bảng rớt lại: trước đây bỏ tham số nên ra mọi hướng; nay đúng bằng ô
  const rl = (await goi(`/api/ktt/rotlai/theo-duong-thu${Q20}`, 'admin')).body.dong.find((r) => !r.duong_thu_ma);
  assert.ok(rl, 'bảng rớt lại có dòng không mã');
  assert.equal((await tongDs('hom-sau', '&duong_thu=__RONG__&huong=lien_tinh_den_bcvh')).pagination.total, rl.hom_sau);
  assert.equal((await tongDs('chua-di-24h', '&duong_thu=__RONG__&huong=lien_tinh_den_bcvh')).pagination.total, rl.chua_di_tren_24h);
  // meta nhắc lại tham số; danh sách thuộc đúng dòng không mã
  const ds = await tongDs('hom-sau', '&duong_thu=__RONG__');
  assert.equal(ds.meta.duong_thu, '__RONG__');
  assert.ok(ds.items.length > 0 && ds.items.every((x) => x.duong_thu_ma === null));
  const dn = await tongDs('hom-sau', '&noi_gui=__RONG__');
  assert.ok(dn.items.length > 0 && dn.items.every((x) => x.noi_gui_ma === null));
  // __RONG__ không lẫn dòng có mã; bỏ tham số vẫn ra cả hai
  const tatCa = (await tongDs('hom-sau', '')).pagination.total;
  const coMa = (await tongDs('hom-sau', '&duong_thu=DT-A')).pagination.total + (await tongDs('hom-sau', '&duong_thu=DT-B')).pagination.total;
  assert.equal(coMa + (await tongDs('hom-sau', '&duong_thu=__RONG__')).pagination.total, tatCa, 'có mã + không mã = tất cả');
});

test('KTT-8d2 «Thông tin» ghi (không có mã) cho __RONG__; khoảng trắng đầu / cuối tham số được bỏ', async () => {
  duLieu8d2();
  const tt = thongTin(await docFile(await goi(`${U}${Q20}&loai=hom-sau&duong_thu=__RONG__&noi_gui=999001`, 'admin')));
  assert.match(tt.get('Cửa sổ'), /đường thư đến: \(không có mã\); nơi gửi BD10 đến: 999001;/);
  const a = (await tongDs('hom-sau', '&duong_thu=DT-A')).pagination.total;
  assert.ok(a > 0);
  assert.equal((await tongDs('hom-sau', `&duong_thu=${encodeURIComponent('  DT-A ')}`)).pagination.total, a);
});

test('KTT-8d2 hang_hoan: 0 / false = loại hàng hoàn, 1 / true = chỉ hàng hoàn, trống / vắng = cả hai; ô B5 nội tỉnh với hang_hoan=0 = số trong ô', async () => {
  duLieu8d2();
  const goc = '&duong_thu=DT-A&noi_gui=531120&huong=noi_tinh_den_bcvh';
  const so = async (v) => (await tongDs('hom-sau', `${goc}${v}`)).pagination.total;
  const cuaHai = await so(''); const khongHoan = await so('&hang_hoan=0'); const chiHoan = await so('&hang_hoan=1');
  assert.ok(khongHoan >= 1 && chiHoan >= 1, 'dữ liệu có cả hai loại cùng nơi gửi / đường thư');
  assert.equal(cuaHai, khongHoan + chiHoan, 'trống = cả hai');
  assert.equal(await so('&hang_hoan='), cuaHai, 'rỗng = vắng');
  for (const v of ['false', 'FALSE', ' False ']) assert.equal(await so(`&hang_hoan=${encodeURIComponent(v)}`), khongHoan, v);
  for (const v of ['true', 'TRUE']) assert.equal(await so(`&hang_hoan=${v}`), chiHoan, v);
  // đúng số ô B5: dòng KHÔNG hoàn và dòng hoàn là hai dòng riêng
  const b5 = (await goi(`/api/ktt/lich-xe/theo-duong-thu${Q20}`, 'admin')).body.noi_tinh_den_bcvh.dong;
  const thuong = b5.find((r) => r.noi_gui_ma === '531120' && r.duong_thu_ma === 'DT-A' && !r.hang_hoan);
  const hoan = b5.find((r) => r.noi_gui_ma === '531120' && r.duong_thu_ma === 'DT-A' && r.hang_hoan);
  assert.equal(khongHoan, thuong.hom_sau);
  assert.equal(chiHoan, hoan.hom_sau);
  assert.ok((await tongDs('hom-sau', `${goc}&hang_hoan=0`)).items.every((x) => x.hang_hoan === false));
  assert.ok((await tongDs('hom-sau', `${goc}&hang_hoan=1`)).items.every((x) => x.hang_hoan === true));
  // sheet 8 theo cùng quy ước (và khớp danh sách); cache không lẫn giữa 0 / 1 / trống
  for (const [v, n] of [['&hang_hoan=0', khongHoan], ['&hang_hoan=false', khongHoan], ['&hang_hoan=1', chiHoan], ['', cuaHai]]) {
    assert.equal(dongSheet8(await docFile(await goi(`${U}${Q20}&loai=hom-sau${goc}${v}`, 'admin'))).length, n, v || 'trống');
  }
  const tt = thongTin(await docFile(await goi(`${U}${Q20}&loai=hom-sau${goc}&hang_hoan=0`, 'admin')));
  assert.match(tt.get('Cửa sổ'), /hàng hoàn Tổ KHHH: không kể hàng hoàn/);
  // giá trị lạ vẫn 400
  for (const v of ['2', 'yes', 'abc', '01']) assert.equal((await goi(`/api/ktt/danh-sach${Q20}&loai=hom-sau&hang_hoan=${v}`, 'admin')).status, 400, v);
});
