// ==========================================
// Test KTT-8b: GET /api/ktt/xuat/luu-thoat (server/routes/ktt.js + server/lib/kttXuat.js): quyền, tham số, hai sheet, khớp luu-thoat / chi-tiet, hàng hoàn «Loại trừ», ngày trống,
// kiểu ô (SHBG văn bản, giờ không lệch múi giờ, KL = gam / 1000), chống công thức, nhường vòng lặp, đổi tham số/lịch thì cột đổi đúng, trần dòng.
// Server thật trên DB tạm của harness (file, nên worker_thread đọc cùng file); dữ liệu GIẢ (SHBG KTT-DEMO-xxx). Không mở data/, không DB thật, không mạng.
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

const PORT = 5996;
const TH = '533140'; const HT = '535470';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT8B_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT8B_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT8B_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT8B_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-xuat-${Date.now()}.db` });
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

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null, gam = 100, duong = ['TH-01', 'Đường thư Huế 1'], phuong = '49122' }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: duong[0], bd10_den_ten_duong_thu: duong[1] });
  bg(den, shbg, { khoi_luong_thuc_te_g: gam, ma_xa_phuong: phuong });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg, { khoi_luong_thuc_te_g: gam, ma_xa_phuong: phuong });
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
function duLieu() {
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', gam: 1234 }); // t1
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' }); // t2
  kt('KTT-DEMO-A3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // t3
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00' }); // t5
  kt('KTT-DEMO-A5', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi, đã lỡ chuyến 12:30 ngày 20 (t5)
  kt('KTT-DEMO-B1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' });
  kt('KTT-DEMO-B2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', nhan: HT });
  kt('KTT-DEMO-H1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120' }); // hàng hoàn Tổ KHHH
  kt('KTT-DEMO-X1', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-21 09:00:00', nhan: '530900' }); // ngoài phạm vi
  kt('KTT-DEMO-C1', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 06:50:00' });
  kt('KTT-DEMO-N0', { quet: null, xnd: '2026-10-21 06:00:00', gioDi: '2026-10-21 07:00:00' }); // thiếu giờ quét đến: «Không tính»
  kt('KTT-DEMO-W1', { quet: '2026-10-21 08:00:00', nhan: null }); // đang chờ chuyến 12:30 (độ mới 10:00)
  capOk('2026-10-21 10:00:00');
}

// ---------- gọi API + đọc file ----------
async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: res.status, body: await res.json(), headers: res.headers };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
async function docFile(r) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  return wb;
}
/** Sheet 7 -> mảng đối tượng theo tiêu đề cột. */
function dongSheet7(wb) {
  const ws = wb.getWorksheet(X.TEN_SHEET_7);
  const tieuDe = X.COT_SHEET7.map((c) => c.tieuDe);
  const kq = [];
  ws.eachRow((row, i) => { if (i === 1) return; const o = {}; tieuDe.forEach((t, j) => { o[X.COT_SHEET7[j].khoa] = row.getCell(j + 1).value; }); kq.push(o); });
  return kq;
}
function thongTin(wb) {
  const m = new Map();
  wb.getWorksheet(X.TEN_SHEET_THONG_TIN).eachRow((row, i) => { if (i > 1) m.set(row.getCell(1).value, row.getCell(2).value); });
  return m;
}
const U = '/api/ktt/xuat/luu-thoat';
const Q20 = '?tu=2026-10-20&den=2026-10-22';
/** Date của ô -> 'YYYY-MM-DD HH:MM:SS' theo các số UTC (ô lưu số giờ nguồn bằng Date.UTC). */
const gioO = (d) => (d instanceof Date ? d.toISOString().slice(0, 19).replace('T', ' ') : d);
const TRANG_THAI_NHOM = Object.keys(QL.NHOM_LUU_THOAT);

// ---------- quyền ----------
test('quyền: không token 401; ADMIN và TTVH 200 (file xlsx); GDVH 403; TIVI 403; chỉ GET', async () => {
  duLieu();
  assert.equal((await goi(`${U}${Q20}`)).status, 401);
  for (const who of ['admin', 'ttvh']) {
    const r = await goi(`${U}${Q20}`, who);
    assert.equal(r.status, 200, who);
    assert.match(r.headers.get('content-type'), /spreadsheetml\.sheet/);
  }
  assert.equal((await goi(`${U}${Q20}`, 'gdvh')).status, 403);
  assert.equal((await goi(`${U}${Q20}`, 'tivi')).status, 403);
  assert.equal((await goi(`${U}${Q20}`, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404);
});

test('tên file chỉ ASCII, Content-Disposition attachment, no-store', async () => {
  duLieu();
  const r = await goi(`${U}${Q20}`, 'admin');
  const cd = r.headers.get('content-disposition');
  assert.match(cd, /^attachment; filename="KTT_LuuThoat_2026-10-20_2026-10-22\.xlsx"$/);
  assert.ok(/^[\x20-\x7e]+$/.test(cd));
  assert.match(r.headers.get('cache-control') || '', /no-store/);
});

// ---------- tham số ----------
test('tham số sai -> 400 tiếng Việt, không lộ nội bộ: thiếu / sai định dạng / 31-04 / den < tu / 32 ngày / khóa lạ / trang_thai lạ; chống chèn SQL, bảng còn nguyên', async () => {
  duLieu();
  const loi = [
    [U, /Thiếu tham số/], [`${U}?tu=2026-10-20`, /Thiếu tham số/], [`${U}?tu=2026/10/20&den=2026-10-21`, /"tu" phải là ngày có thật/],
    [`${U}?tu=2026-04-31&den=2026-05-01`, /"tu" phải là ngày có thật/], [`${U}?tu=2026-10-22&den=2026-10-21`, /không sau "den"/],
    [`${U}?tu=2026-10-01&den=2026-11-01`, /tối đa 31 ngày/], [`${U}${Q20}&x=1`, /Tham số không hỗ trợ: "x"/], [`${U}${Q20}&loai=t1`, /Tham số không hỗ trợ: "loai"/],
    [`${U}${Q20}&trang_thai=abc`, /"trang_thai" phải thuộc/], [`${U}${Q20}&trang_thai=t1&trang_thai=t2`, /chỉ được truyền một lần/]
  ];
  const ghi = [];
  const goc = console.error;
  console.error = (...a) => ghi.push(a.join(' '));
  try {
    for (const [url, re] of loi) {
      const r = await goi(url, 'admin');
      assert.equal(r.status, 400, url);
      assert.match(r.body.error, re, url);
      assert.match(r.body.ma, /^KTT_/, url);
      assert.deepEqual(Object.keys(r.body).sort(), ['error', 'ma']);
      assert.ok(!/stack|SQLITE|at \w+ \(|node_modules/i.test(JSON.stringify(r.body)), url);
    }
  } finally { console.error = goc; }
  assert.deepEqual(ghi, []);
  const truoc = [db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c];
  for (const x of ["2026-10-20'; DROP TABLE ktt_tui; --", "2026-10-20' OR '1'='1", '1; SELECT 1', '../../etc/passwd']) {
    for (const p of [`tu=${encodeURIComponent(x)}&den=2026-10-21`, `tu=2026-10-20&den=${encodeURIComponent(x)}`, `tu=2026-10-20&den=2026-10-21&trang_thai=${encodeURIComponent(x)}`]) {
      assert.equal((await goi(`${U}?${p}`, 'admin')).status, 400, p);
    }
  }
  assert.deepEqual([db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c], truoc);
});

// ---------- cấu trúc file ----------
test('file mở được: đúng hai sheet theo thứ tự «Thông tin», «7 Hàng rớt lại»; đúng tiêu đề cột; trục cố định', async () => {
  duLieu();
  const wb = await docFile(await goi(`${U}${Q20}`, 'admin'));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', '7 Hàng rớt lại']);
  assert.deepEqual(wb.getWorksheet('7 Hàng rớt lại').getRow(1).values.slice(1), X.COT_SHEET7.map((c) => c.tieuDe));
  assert.deepEqual(wb.getWorksheet('Thông tin').getRow(1).values.slice(1), ['Mục', 'Nội dung ghi trong sheet']);
  // KTT-10c: 18 cột — cột «Đạt / không đạt» một mốc thay bằng hai cột nêu rõ mốc đo
  assert.equal(X.COT_SHEET7.length, 18);
  const td = X.COT_SHEET7.map((c) => c.tieuDe);
  assert.equal(td[13], 'Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi)');
  assert.equal(td[14], 'Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi)');
  assert.ok(!td.includes('Đạt / không đạt chỉ tiêu 14 giờ'), 'bỏ cột một mốc cũ');
  assert.ok(!X.COT_SHEET7.some((c) => c.api === 'dat_khong_dat'));
});

// ---------- khớp nguồn ----------
test('số dòng sheet 7 = tổng SHBG của luu-thoat cùng khoảng; ô «Số dòng kiểm tra» đúng; mỗi dòng khớp bản ghi của chi-tiet (SHBG, chuyến, giờ lập BD10 đi, đạt / không đạt, phân loại)', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body;
  const wb = await docFile(await goi(`${U}${Q20}`, 'admin'));
  const dong = dongSheet7(wb);
  assert.equal(dong.length, 12);
  assert.equal(dong.length, lt.tong_cong.tong_shbg_ngay);
  assert.equal(new Set(dong.map((d) => d.shbg)).size, dong.length, 'một dòng một SHBG');
  const tt = thongTin(wb);
  assert.equal(tt.get('Số dòng kiểm tra'), dong.length);
  assert.match(tt.get('Đối chiếu với màn hình Lưu thoát'), /có 12 SHBG: khớp/);
  // chi-tiet: gom mọi nhóm "cơ bản" (mỗi SHBG thuộc đúng một nhóm trong số này) và so từng SHBG
  const chiTiet = new Map();
  for (const nhom of ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen', 'hang_hoan', 'khong_ro_dich', 'ngoai_pham_vi', 'khong_co_gio_quet_den', 'khong_xep_duoc_chuyen']) {
    const r = (await goi(`/api/ktt/chi-tiet${Q20}&loai=${nhom}&page_size=200`, 'admin')).body;
    for (const it of r.items) chiTiet.set(it.shbg, it);
  }
  assert.equal(chiTiet.size, dong.length);
  const NHAN_DAT = { DAT: 'Đạt', KHONG_DAT: 'Không đạt', CHUA_DI: 'Chưa đi (chưa quá chỉ tiêu)', CHUA_DO_DUOC: 'Chưa đo được (chưa có xác nhận đến)', XND_SAU_GIO_DI: 'Xác nhận đến sau giờ lập BD10 đi' };
  for (const d of dong) {
    const it = chiTiet.get(d.shbg);
    assert.ok(it, d.shbg);
    assert.equal(gioO(d.gio_quet_tui_den), it.quetDen, d.shbg);
    assert.equal(gioO(d.confirm_date), it.xndBd10, d.shbg);
    assert.equal(gioO(d.gio_lap_bd10_di) || null, it.gioLapBd10Di, d.shbg);
    assert.equal(d.ngay_d, it.ngayDen, d.shbg);
    assert.equal(d.bcvh_ma || null, it.maBcvh, d.shbg);
    if (it.gioXuatPhat) {
      assert.match(d.chuyen, new RegExp(` ${it.gioXuatPhat} \\(`), d.shbg);
      assert.equal(gioO(d.gio_xuat_phat).slice(0, 10), it.ngayChuyen, d.shbg);
      assert.equal(gioO(d.gio_xuat_phat).slice(11, 16), it.gioXuatPhat, d.shbg);
      // hạn đến = xuất phát − 60 phút (đọc từ cấu hình, không viết cứng)
      const xp = Date.parse(`${gioO(d.gio_xuat_phat).replace(' ', 'T')}Z`); const han = Date.parse(`${gioO(d.han_den).replace(' ', 'T')}Z`);
      assert.equal((xp - han) / 60000, 60, d.shbg);
    } else { assert.equal(d.chuyen, null, d.shbg); assert.equal(d.gio_xuat_phat, null, d.shbg); }
    if (it.nhom === 'HANG_HOAN') { assert.equal(d.moc_a, 'Loại trừ', d.shbg); assert.equal(d.moc_b, 'Loại trừ', d.shbg); assert.equal(it.dat_khong_dat, 'Loại trừ', d.shbg); }
    else if (it.datKhongDat && it.trangThai === null) { assert.equal(d.moc_a, 'Không tính', d.shbg); assert.equal(d.moc_b, 'Không tính', d.shbg); assert.equal(it.dat_khong_dat, 'Không tính', d.shbg); }
    else assert.equal(it.dat_khong_dat, it.datKhongDat ? NHAN_DAT[it.datKhongDat] : null, d.shbg); // trường cũ vẫn có trong chi-tiet
    assert.equal(d.moc_a, it.chi_tieu_14h_xnd, d.shbg);
    assert.equal(d.moc_b, it.chi_tieu_14h_quet_tui_den, d.shbg);
    assert.equal(d.gio_cho, it.thoiGianChoGiay === null ? null : it.thoiGianChoGiay / 3600, d.shbg);
    const nhanTT = { T1: /^1 –/, T2: /^2 –/, T3: /^3 –/, T4: /^4 –/, T5: /^5 –/, DANG_CHO_CHUYEN: /^Đang chờ chuyến/ };
    if (it.trangThai) assert.match(d.trang_thai, nhanTT[it.trangThai], d.shbg); else assert.equal(d.trang_thai, null, d.shbg);
  }
  // phân loại theo nhóm riêng
  const theoShbg = Object.fromEntries(dong.map((d) => [d.shbg, d]));
  assert.equal(theoShbg['KTT-DEMO-H1'].nhom, 'Hàng hoàn Tổ KHHH');
  assert.match(theoShbg['KTT-DEMO-X1'].nhom, /^Ngoài phạm vi/);
  assert.equal(theoShbg['KTT-DEMO-W1'].nhom, 'Đang chờ chuyến');
  assert.equal(theoShbg['KTT-DEMO-A1'].nhom, 'Đã phân loại 5 trạng thái');
});

test('bộ lọc trang_thai: chỉ ra đúng nhóm đó, số dòng = tổng của chi-tiet và của luu-thoat; mọi giá trị hợp lệ', async () => {
  duLieu();
  for (const nhom of TRANG_THAI_NHOM) {
    const wb = await docFile(await goi(`${U}${Q20}&trang_thai=${nhom}`, 'admin'));
    const dong = dongSheet7(wb);
    const ct = (await goi(`/api/ktt/chi-tiet${Q20}&loai=${nhom}&page_size=200`, 'admin')).body;
    assert.equal(dong.length, ct.pagination.total, nhom);
    assert.deepEqual(dong.map((d) => d.shbg).sort(), ct.items.map((i) => i.shbg).sort(), nhom);
    assert.equal(X.soShbgTheoLuuThoat((await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body, nhom), dong.length, `${nhom}: khớp luu-thoat`);
    assert.equal(thongTin(wb).get('Số dòng kiểm tra'), dong.length, nhom);
    assert.match(thongTin(wb).get('Cửa sổ'), new RegExp(`Bộ lọc trạng thái: ${nhom};.`), nhom);
  }
  const t1 = dongSheet7(await docFile(await goi(`${U}${Q20}&trang_thai=t1`, 'admin')));
  assert.ok(t1.length >= 1 && t1.every((d) => /^1 –/.test(d.trang_thai)));
});

test('hàng hoàn Tổ KHHH có mặt, cột đạt / không đạt ghi «Loại trừ», không vào tổng chỉ tiêu của luu-thoat', async () => {
  duLieu();
  const dong = dongSheet7(await docFile(await goi(`${U}${Q20}&trang_thai=hang_hoan`, 'admin')));
  assert.deepEqual(dong.map((d) => d.shbg), ['KTT-DEMO-H1']);
  assert.equal(dong[0].moc_a, 'Loại trừ'); assert.equal(dong[0].moc_b, 'Loại trừ');
  const lt = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body.tong_cong;
  const tong = lt.dat_khong_dat.dat + lt.dat_khong_dat.khong_dat + lt.dat_khong_dat.chua_di + lt.dat_khong_dat.chua_do_duoc + lt.dat_khong_dat.xnd_sau_gio_di;
  const khac = dongSheet7(await docFile(await goi(`${U}${Q20}`, 'admin'))).filter((d) => d.nhom === 'Đã phân loại 5 trạng thái' || d.nhom === 'Đang chờ chuyến');
  assert.equal(tong, khac.length, 'tổng chỉ tiêu không gồm hàng hoàn');
  assert.ok(khac.every((d) => d.moc_a !== 'Loại trừ' && d.moc_b !== 'Loại trừ'));
});

test('KTT-10c cột Mốc A / Mốc B: đếm nhãn trong file = khối chi_tieu_14h của luu-thoat cùng khoảng; đo được + không đo được = mẫu số; thiếu giờ quét đến «Không tính»; hàng hoàn «Loại trừ»', async () => {
  duLieu();
  const KHONG_DO = ['Không đo được (thiếu mốc)', 'Không đo được (mốc sau giờ lập BD10 đi)', 'Không đo được (chưa đi)'];
  for (const q of [Q20, '?tu=2026-10-20&den=2026-10-20', '?tu=2026-10-21&den=2026-10-21']) {
    const c14 = (await goi(`/api/ktt/luu-thoat${q}`, 'admin')).body.tong_cong.chi_tieu_14h;
    const dong = dongSheet7(await docFile(await goi(`${U}${q}`, 'admin')));
    for (const [cot, m] of [['moc_a', 'xnd'], ['moc_b', 'quet_tui_den']]) {
      const k = c14.theo_moc[m];
      const dem = (nhan) => dong.filter((d) => d[cot] === nhan).length;
      assert.equal(dem('Đạt'), k.dat, `${q} ${cot} đạt`);
      assert.equal(dem('Không đạt'), k.khong_dat, `${q} ${cot} không đạt`);
      assert.equal(dem('Đạt') + dem('Không đạt'), k.do_duoc, `${q} ${cot} đo được`);
      assert.equal(KHONG_DO.reduce((s, n) => s + dem(n), 0), k.khong_do_duoc.tong, `${q} ${cot} không đo được`);
      assert.equal(dem(KHONG_DO[0]), k.khong_do_duoc.thieu_moc); assert.equal(dem(KHONG_DO[1]), k.khong_do_duoc.moc_sau_gio_di); assert.equal(dem(KHONG_DO[2]), k.khong_do_duoc.chua_di);
      // mẫu số = mọi dòng không «Loại trừ» / «Không tính» / trống (ngoài phạm vi, không rõ đích)
      const mau = dong.filter((d) => d[cot] !== null && d[cot] !== 'Loại trừ' && d[cot] !== 'Không tính').length;
      assert.equal(mau, k.mau_so, `${q} ${cot} mẫu số`);
      assert.equal(k.do_duoc + k.khong_do_duoc.tong, k.mau_so, `${q} ${cot}: đo được + không đo được = mẫu số`);
    }
  }
  const dong = dongSheet7(await docFile(await goi(`${U}${Q20}`, 'admin')));
  const n0 = dong.find((d) => d.shbg === 'KTT-DEMO-N0');
  assert.equal(n0.nhom, 'Thiếu giờ quét túi đến');
  assert.equal(n0.moc_a, 'Không tính'); assert.equal(n0.moc_b, 'Không tính');
  assert.equal(dong.find((d) => d.shbg === 'KTT-DEMO-H1').moc_a, 'Loại trừ');
  assert.equal(dong.find((d) => d.shbg === 'KTT-DEMO-X1').moc_a, null, 'ngoài phạm vi: ô trống');
  const a5 = dong.find((d) => d.shbg === 'KTT-DEMO-A5'); // chưa đi: không đo được ở cả hai mốc (khối dat_khong_dat cũ có thể tính là không đạt)
  assert.equal(a5.moc_a, 'Không đo được (chưa đi)'); assert.equal(a5.moc_b, 'Không đo được (chưa đi)');
  const nhan = { T1: 'Đi trong ngày, đúng chuyến', T2: 'Đi trong ngày, trượt chuyến', T3: 'Đi hôm sau, đúng chuyến', T4: 'Đi hôm sau, trượt chuyến', T5: 'Từ 2 ngày hoặc chưa đi' };
  assert.equal(dong.find((d) => d.shbg === 'KTT-DEMO-A4').trang_thai, `5 – ${nhan.T5}`);
  assert.equal(dong.find((d) => d.shbg === 'KTT-DEMO-A3').trang_thai, `3 – ${nhan.T3}`);
  assert.equal(dong.find((d) => d.shbg === 'KTT-DEMO-A1').trang_thai, `1 – ${nhan.T1}`);
});

test('ngày không có dữ liệu: file vẫn hợp lệ (chỉ tiêu đề cột), «Số dòng kiểm tra» = 0; chưa có dữ liệu nào cũng vậy', async () => {
  duLieu();
  const wb = await docFile(await goi(`${U}?tu=2026-09-01&den=2026-09-03`, 'admin'));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', '7 Hàng rớt lại']);
  assert.equal(wb.getWorksheet('7 Hàng rớt lại').rowCount, 1);
  assert.equal(thongTin(wb).get('Số dòng kiểm tra'), 0);
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  Api.xoaCache();
  const wb2 = await docFile(await goi(`${U}${Q20}`, 'admin'));
  assert.equal(wb2.getWorksheet('7 Hàng rớt lại').rowCount, 1);
  assert.equal(thongTin(wb2).get('Số dòng kiểm tra'), 0);
  assert.match(thongTin(wb2).get('Dữ liệu đến'), /Chưa có dữ liệu/);
});

// ---------- kiểu ô ----------
test('kiểu ô: SHBG là văn bản; giờ là ô ngày giờ đúng số giờ nguồn (không lệch múi giờ); KL = gam / 1000; đường thư đến, BCVH', async () => {
  duLieu();
  const wb = await docFile(await goi(`${U}${Q20}&trang_thai=t1`, 'admin'));
  const ws = wb.getWorksheet('7 Hàng rớt lại');
  const a1 = dongSheet7(wb).find((d) => d.shbg === 'KTT-DEMO-A1');
  assert.ok(a1);
  const cot = (khoa) => X.COT_SHEET7.findIndex((c) => c.khoa === khoa) + 1;
  let hang = 0; ws.eachRow((r, i) => { if (i > 1 && r.getCell(1).value === 'KTT-DEMO-A1') hang = i; });
  assert.equal(ws.getCell(hang, 1).type, ExcelJS.ValueType.String);
  assert.equal(ws.getCell(hang, 1).numFmt, '@');
  for (const khoa of ['gio_quet_tui_den', 'confirm_date', 'gio_xuat_phat', 'han_den', 'gio_lap_bd10_di']) {
    const c = ws.getCell(hang, cot(khoa));
    assert.ok(c.value instanceof Date, khoa);
    assert.equal(c.numFmt, X.FMT_GIO, khoa);
  }
  assert.equal(gioO(a1.gio_quet_tui_den), '2026-10-20 05:30:00');
  assert.equal(gioO(a1.confirm_date), '2026-10-20 05:30:00');
  assert.equal(gioO(a1.gio_lap_bd10_di), '2026-10-20 06:50:00');
  assert.equal(gioO(a1.gio_xuat_phat), '2026-10-20 07:00:00');
  assert.equal(gioO(a1.han_den), '2026-10-20 06:00:00');
  assert.equal(a1.chuyen, 'Thuận Hóa 07:00 (20/10/2026)');
  assert.equal(a1.kl_kg, 1.234);
  assert.equal(a1.duong_thu_ten, 'Đường thư Huế 1');
  assert.equal(a1.duong_thu_ma, 'TH-01');
  assert.equal(a1.bcvh_ma, TH);
  assert.equal(a1.bcvh_ten, 'Thuận Hóa');
  assert.equal(a1.moc_a, 'Đạt'); assert.equal(a1.moc_b, 'Đạt');
  assert.equal(a1.ngay_d, '2026-10-20');
  assert.equal(a1.gio_cho, 0); // 05:30 -> 06:50 nằm trọn trong khung đêm 21:00–07:00: không tính
  const a2 = dongSheet7(await docFile(await goi(`${U}${Q20}&trang_thai=t2`, 'admin'))).find((d) => d.shbg === 'KTT-DEMO-A2');
  assert.equal(a2.gio_cho, 1); // 05:30 -> 08:00: chỉ tính 07:00–08:00
  assert.equal(a2.moc_a, 'Đạt'); assert.equal(a2.moc_b, 'Đạt');
});

test('thiếu dữ liệu -> ô trống, không đoán: KL thiếu, không có đường thư, chưa có giờ lập BD10 đi', async () => {
  kt('KTT-DEMO-N1', { quet: '2026-10-20 05:30:00', gioDi: null, nhan: null, duong: [null, null], gam: null });
  capOk('2026-10-21 10:00:00');
  const d = dongSheet7(await docFile(await goi(`${U}${Q20}`, 'admin')))[0];
  assert.equal(d.shbg, 'KTT-DEMO-N1');
  assert.equal(d.kl_kg, null); assert.equal(d.duong_thu_ten, null); assert.equal(d.duong_thu_ma, null); assert.equal(d.gio_lap_bd10_di, null);
});

test('chống chèn công thức: ô bắt đầu bằng = + - @ được ghi là VĂN BẢN (không phải công thức)', async () => {
  const doc = ['=1+1', '+SUM(A1)', '-2+3', '@SUM(1)', '=cmd|\' /C calc\'!A0'];
  doc.forEach((s, i) => kt(`KTT-DEMO-F${i}`, { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', duong: [doc[(i + 1) % doc.length], s] }));
  kt(doc[0], { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  kt(doc[1], { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  capOk('2026-10-21 10:00:00');
  const wb = await docFile(await goi(`${U}${Q20}`, 'admin'));
  const ws = wb.getWorksheet('7 Hàng rớt lại');
  const quet = new Set(doc);
  let dem = 0;
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.eachCell((c) => {
      assert.notEqual(c.type, ExcelJS.ValueType.Formula, `ô ${c.address} là công thức`);
      if (typeof c.value === 'string' && quet.has(c.value)) { dem++; assert.equal(c.type, ExcelJS.ValueType.String); assert.equal(c.numFmt, '@'); }
    });
  });
  assert.ok(dem >= 10, `đã gặp ${dem} ô độc hại`);
  assert.ok(dongSheet7(wb).some((d) => d.shbg === '=1+1'));
});

test('sheet «Thông tin»: đủ mục; tên đăng nhập người xuất (không token, không email); đã chốt / số tạm theo ngày; định nghĩa', async () => {
  duLieu();
  const r = await goi(`${U}${Q20}`, 'ttvh');
  const tt = thongTin(await docFile(r));
  assert.deepEqual([...tt.keys()], ['Cửa sổ', 'Dữ liệu đến', 'Chốt số theo ngày', 'Ngày xuất, người xuất', 'Trạng thái số liệu', 'Định nghĩa: năm trạng thái', 'Định nghĩa: đang chờ chuyến',
    'Định nghĩa: hàng hoàn Tổ KHHH', 'Định nghĩa: chỉ tiêu 14 giờ (hai mốc)', 'Định nghĩa: mốc chuyến và hạn đến', 'Định nghĩa: hai mốc giờ đến',
    'Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi)', 'Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi)', 'Chỉ tiêu 14 giờ – Không đo được', 'Đơn vị', 'Số dòng kiểm tra', 'Đối chiếu với màn hình Lưu thoát']);
  assert.match(tt.get('Cửa sổ'), /Từ ngày 20\/10\/2026 đến ngày 22\/10\/2026.*không \(tất cả\)/);
  assert.match(tt.get('Dữ liệu đến'), /2026-10-21 10:00:00/);
  assert.equal(tt.get('Chốt số theo ngày'), '20/10/2026: đã chốt; 21/10/2026: số tạm; 22/10/2026: số tạm');
  assert.match(tt.get('Ngày xuất, người xuất'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(giờ Việt Nam\); tài khoản: KT8B_TTVH\.$/);
  assert.match(tt.get('Trạng thái số liệu'), /^Số tạm/);
  assert.match(tt.get('Định nghĩa: hàng hoàn Tổ KHHH'), /531120.*Thuận Hóa \(533140\)/);
  assert.match(tt.get('Định nghĩa: mốc chuyến và hạn đến'), /− 60 phút/);
  const tokenTho = tokens.ttvh;
  assert.ok(!r.buf.toString('latin1').includes(tokenTho));
  assert.ok(!JSON.stringify([...tt.values()]).includes('@'), 'không có email');
  // tất cả đã chốt
  capOk('2026-10-23 12:00:00');
  Api.xoaCache();
  const tt2 = thongTin(await docFile(await goi(`${U}${Q20}`, 'admin')));
  assert.equal(tt2.get('Chốt số theo ngày'), '20/10/2026: đã chốt; 21/10/2026: đã chốt; 22/10/2026: đã chốt');
  assert.match(tt2.get('Trạng thái số liệu'), /^Đã chốt/);
});

// ---------- cache chung, tham số, lịch ----------
test('đổi ktt_gio_chot_ngay hoặc lịch chuyến / hạn đến thì cột «đã chốt» và chuyến liền kề đổi đúng (dùng cache chung)', async () => {
  duLieu(); // độ mới 21/10 10:00
  const chot = async () => thongTin(await docFile(await goi(`${U}?tu=2026-10-20&den=2026-10-20`, 'admin'))).get('Chốt số theo ngày');
  assert.equal(await chot(), '20/10/2026: đã chốt');
  const put = (gia_tri) => fetch(`${ctx.baseUrl}/api/tham-so`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'Thử KTT-8b', thay_doi: [{ khoa: 'ktt_gio_chot_ngay', gia_tri }] }) });
  try {
    assert.equal((await put('15:00')).status, 200);
    assert.equal(await chot(), '20/10/2026: số tạm');
    assert.equal((await put('10:00')).status, 200);
    assert.equal(await chot(), '20/10/2026: đã chốt');
  } finally { db.prepare("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'").run(); TS.khoiTao(db); }
  // lịch chuyến: A1 (quét 05:30 Thuận Hóa) đang vào chuyến 07:30 (hạn 06:00); đổi hạn sang 121 phút -> hạn 05:00 < 05:30 nên sang chuyến 12:30
  const a1 = async () => dongSheet7(await docFile(await goi(`${U}?tu=2026-10-20&den=2026-10-20&trang_thai=t1`, 'admin')))[0];
  const goc = db.prepare("SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = 'han_den_truoc_chuyen_phut'").get().gia_tri;
  try {
    assert.equal((await a1()).chuyen, 'Thuận Hóa 07:00 (20/10/2026)');
    db.prepare("UPDATE ktt_lich_cau_hinh SET gia_tri = 121 WHERE khoa = 'han_den_truoc_chuyen_phut'").run();
    const sau = dongSheet7(await docFile(await goi(`${U}?tu=2026-10-20&den=2026-10-20`, 'admin'))).find((d) => d.shbg === 'KTT-DEMO-A1');
    assert.equal(sau.chuyen, 'Thuận Hóa 12:30 (20/10/2026)', 'đổi hạn đến: chuyến liền kề đổi');
    assert.equal(gioO(sau.han_den), '2026-10-20 10:29:00');
    db.prepare("UPDATE ktt_lich_chuyen SET dang_dung = 0 WHERE ma_bcvh = ? AND gio_xuat_phat = '12:30'").run(TH);
    const tat = dongSheet7(await docFile(await goi(`${U}?tu=2026-10-20&den=2026-10-20`, 'admin'))).find((d) => d.shbg === 'KTT-DEMO-A1');
    assert.equal(tat.chuyen, 'Thuận Hóa 12:55 (20/10/2026)', 'tắt chuyến: chuyến liền kề đổi');
  } finally {
    db.prepare("UPDATE ktt_lich_cau_hinh SET gia_tri = ? WHERE khoa = 'han_den_truoc_chuyen_phut'").run(goc);
    db.prepare("UPDATE ktt_lich_chuyen SET dang_dung = 1 WHERE ma_bcvh = ? AND gio_xuat_phat = '12:30'").run(TH);
  }
});

test('xuất dùng CHUNG cache luu-thoat theo ngày: gọi xuất sau khi luu-thoat nóng thì không tính lại ngày nào', async () => {
  duLieu();
  await goi(`/api/ktt/luu-thoat${Q20}`, 'admin');
  const truoc = Api.thongKe().ngayTinh;
  assert.equal(truoc, 3);
  await goi(`${U}${Q20}`, 'admin');
  assert.equal(Api.thongKe().ngayTinh, truoc, 'không có ngày nào bị tính lại cho cột «đã chốt»');
});

// ---------- giới hạn ----------
test('trần số dòng: vượt -> 400 tiếng Việt «thu hẹp khoảng ngày hoặc thêm bộ lọc», chưa gửi file; không vượt thì 200', async () => {
  duLieu();
  process.env.KTT_XUAT_TRAN_DONG = '11';
  const r = await goi(`${U}${Q20}`, 'admin');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /vượt giới hạn 11 dòng.*thu hẹp khoảng ngày hoặc thêm bộ lọc/);
  assert.equal(r.body.ma, 'KTT_QUA_NHIEU_DONG');
  process.env.KTT_XUAT_TRAN_DONG = '12';
  assert.equal((await goi(`${U}${Q20}`, 'admin')).status, 200);
  assert.equal(X.TRAN_DONG_MAC_DINH, 200000);
});

// ---------- không làm đứng máy chủ ----------
test('nhường vòng lặp: khi đang xuất 31 ngày, /api/ktt/meta vẫn được phục vụ trước khi xuất xong', async () => {
  const hai = (n) => String(n).padStart(2, '0');
  db.exec('BEGIN');
  for (let d = 1; d <= 31; d++) for (let i = 0; i < 300; i++) {
    const quet = `2026-10-${hai(d)} ${hai(5 + (i % 10))}:${hai(i % 60)}:00`;
    kt(`KTT-DEMO-L${d}-${i}`, { quet, gioDi: i % 3 === 0 ? null : `2026-10-${hai(d)} ${hai(7 + (i % 10))}:${hai(i % 60)}:00`, nhan: i % 3 === 0 ? null : TH });
  }
  db.exec('COMMIT');
  capOk('2026-11-02 10:00:00');
  Api.xoaCache();
  const t0 = Date.now();
  let xongXuat = 0;
  const pXuat = goi(`${U}?tu=2026-10-01&den=2026-10-31`, 'admin').then((r) => { xongXuat = Date.now() - t0; return r; });
  await new Promise((r) => setTimeout(r, 20));
  const thoiGianMeta = [];
  for (let i = 0; i < 5; i++) {
    const t1 = Date.now();
    const m = await goi('/api/ktt/meta', 'admin');
    assert.equal(m.status, 200);
    thoiGianMeta.push(Date.now() - t1);
    assert.equal(xongXuat, 0, 'xuất chưa xong khi /meta đã trả lời');
    await new Promise((r) => setTimeout(r, 10));
  }
  const r = await pXuat;
  assert.equal(r.status, 200);
  assert.equal(dongSheet7(await docFile(r)).length, 31 * 300);
  assert.ok(Math.max(...thoiGianMeta) < xongXuat, `meta ${thoiGianMeta} ms < xuất ${xongXuat} ms`);
});

// ---------- tĩnh ----------
test('kiểm tĩnh: kttXuat không dùng new Date(chuỗi) / Date.parse / Date.now; route không ghi số hiệu bưu gửi vào log', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttXuat.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/Date\.parse|Date\.now|new Date\(\s*[a-zA-Z_`'"]/.test(src.replace(/new Date\(Date\.UTC\(/g, '').replace(/new Date\(ms \+/g, '')), 'chỉ new Date(Date.UTC(...)) và new Date(ms + …)');
  const route = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ktt.js'), 'utf8');
  const khoi = route.slice(route.indexOf("router.get('/xuat/luu-thoat'"));
  assert.ok(!/shbg/i.test(khoi), 'route xuất không nhắc SHBG trong log');
});

// ---------- hiệu năng (KTT_PERF=1) ----------
test('hiệu năng xuất (KTT_PERF=1): 1 / 7 / 31 ngày dữ liệu giả — thời gian và bộ nhớ', { skip: process.env.KTT_PERF ? false : 'đặt KTT_PERF=1 để đo' }, async () => {
  let x = 777;
  const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
  const hai = (n) => String(n).padStart(2, '0');
  const ngayStr = (i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
  const gio = (i, phut) => `${ngayStr(i + Math.floor(phut / 1440))} ${hai(Math.floor(phut / 60) % 24)}:${hai(phut % 60)}:00`;
  const BCVH = require('../server/lib/kttLichChuyen').MA_BCVH_HUE;
  const PHUONG = ['49122', '49135', '49133', '49129', '49527', '49620', '49134', '49218', '49825', '49142'];
  const cotTui = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'chieu', 'luong', 'co_mo_tui', 'gio_quet_tui_den', 'bd10_den_so_hieu', 'bd10_den_xnd', 'bd10_den_ma_diem_gui', 'bd10_den_ma_duong_thu', 'bd10_den_ten_duong_thu', 'bd10_di_gio_di', 'bd10_di_ma_diem_nhan', 'bd10_di_so_hieu', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const cotBg = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'shbg', 'khoi_luong_thuc_te_g', 'ma_xa_phuong', 'ten_xa_phuong', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const insTui = db.prepare(`INSERT INTO ktt_tui (${cotTui.join(',')}) VALUES (${cotTui.map(() => '?').join(',')})`);
  const insBg = db.prepare(`INSERT INTO ktt_buu_gui (${cotBg.join(',')}) VALUES (${cotBg.map(() => '?').join(',')})`);
  const nx = '2026-11-01 00:00:00';
  let nTui = 0; let nBg = 0;
  db.exec('BEGIN');
  for (let d = 0; d < 31; d++) {
    for (let i = 0; i < 714; i++) {
      const quet = gio(d, 300 + rnd(1000));
      const t = ['990001', '530100', 'T', 'S1', `D${d}`, '1', String(++nTui)];
      insTui.run(...t, 'DEN', 'KHAI_THAC_DEN', 1, quet, `BD10-D-${d}-${i}`, rnd(12) === 0 ? null : gio(d, 300 + rnd(1100)), i % 40 === 0 ? '531120' : '599001', 'DT-01', 'Đường thư thử', null, null, null, nx, nx);
      const shbgs = [];
      for (let k = 0; k < 10; k++) { const s = `KTT-DEMO-${d}-${i}-${k}`; shbgs.push(s); insBg.run(...t, s, 100 + rnd(5000), PHUONG[rnd(PHUONG.length)], null, nx, nx); nBg++; }
      if (i % 2 === 0) {
        const nhan = rnd(20) === 0 ? '530900' : BCVH[rnd(6)];
        const td = ['990001', nhan, 'T', 'S1', `D${d}`, '2', String(++nTui)];
        insTui.run(...td, 'DI', 'KHAI_THAC_DI', 0, null, null, null, null, null, null, rnd(8) === 0 ? null : gio(d, 420 + rnd(1700)), nhan, `BD10-I-${d}-${i}`, nx, nx);
        for (const s of shbgs) { insBg.run(...td, s, 100, '49122', null, nx, nx); nBg++; }
      }
    }
  }
  db.exec('COMMIT');
  capOk(`${ngayStr(33)} 10:00:00`);
  const dong = [];
  for (const [ten, tu, den] of [['1 ngày', 10, 10], ['7 ngày', 10, 16], ['31 ngày', 0, 30]]) {
    Api.xoaCache();
    process.env.KTT_XUAT_TRAN_DONG = '400000'; // 31 ngày dữ liệu giả ≈ 221.000 dòng > trần mặc định 200.000: nâng trần để đo
    if (global.gc) global.gc();
    const rss0 = process.memoryUsage().rss;
    let rssMax = rss0;
    const tick = setInterval(() => { rssMax = Math.max(rssMax, process.memoryUsage().rss); }, 50);
    const t0 = process.hrtime.bigint();
    const r = await goi(`${U}?tu=${ngayStr(tu)}&den=${ngayStr(den)}`, 'admin');
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    clearInterval(tick);
    assert.equal(r.status, 200, ten);
    const nong = process.hrtime.bigint();
    await goi(`${U}?tu=${ngayStr(tu)}&den=${ngayStr(den)}`, 'admin');
    const msNong = Number(process.hrtime.bigint() - nong) / 1e6;
    dong.push(`# KTT-8b xuất ${ten}: ${ms.toFixed(0)} ms nguội, ${msNong.toFixed(0)} ms (lần 2), file ${(r.buf.length / 1048576).toFixed(2)} MB, RSS tiến trình test tăng tối đa ${((rssMax - rss0) / 1048576).toFixed(0)} MB (${nTui} túi / ${nBg} dòng nguồn)`);
  }
  console.log(dong.join('\n'));
});

test('KTT-10c sheet «Thông tin»: ba dòng tổng hợp chỉ tiêu 14 giờ (Mốc A, Mốc B, Không đo được) = khối chi_tieu_14h của luu-thoat; ghi «đo được x/y», không in tỷ lệ «đạt» chung; lọc BCVH dùng khối BCVH', async () => {
  duLieu();
  const kiem = async (q, chon) => {
    const c = chon((await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body.tong_cong).chi_tieu_14h;
    const tt = thongTin(await docFile(await goi(`${U}${Q20}${q}`, 'admin')));
    const a = c.theo_moc.xnd; const b = c.theo_moc.quet_tui_den;
    assert.match(tt.get(X.NHAN_TONG_14H.a), new RegExp(`^Đo được ${a.do_duoc}/${c.mau_so}: đạt ${a.dat}, không đạt ${a.khong_dat} \\(`), q);
    assert.match(tt.get(X.NHAN_TONG_14H.b), new RegExp(`^Đo được ${b.do_duoc}/${c.mau_so}: đạt ${b.dat}, không đạt ${b.khong_dat} \\(`), q);
    const k = (m) => `${m.khong_do_duoc.tong} \\(thiếu mốc ${m.khong_do_duoc.thieu_moc}, mốc sau giờ lập BD10 đi ${m.khong_do_duoc.moc_sau_gio_di}, chưa đi ${m.khong_do_duoc.chua_di}\\)`;
    assert.match(tt.get(X.NHAN_TONG_14H.k), new RegExp(`^Mốc A: ${k(a)}; Mốc B: ${k(b)}\\. Đo được \\+ không đo được = mẫu số ${c.mau_so} ở mỗi mốc\\.$`), q);
    assert.equal(a.do_duoc + a.khong_do_duoc.tong, c.mau_so); assert.equal(b.do_duoc + b.khong_do_duoc.tong, c.mau_so);
    for (const ten of Object.values(X.NHAN_TONG_14H)) assert.ok(!/%|tỷ lệ/i.test(tt.get(ten)), `${q} ${ten}: không có tỷ lệ`);
    return tt;
  };
  const tt = await kiem('', (tc) => tc);
  assert.match(tt.get(X.NHAN_TONG_14H.a), /6 BCVH, cả khoảng ngày, không theo bộ lọc trạng thái \/ nguồn/);
  assert.match(tt.get('Định nghĩa: chỉ tiêu 14 giờ (hai mốc)'), /Không có tỷ lệ «đạt» chung/);
  const tH = await kiem(`&ma_bcvh=${HT}`, (tc) => tc.theo_bcvh[HT]);
  assert.match(tH.get(X.NHAN_TONG_14H.a), new RegExp(`BCVH ${HT}, cả khoảng ngày`));
  await kiem('&trang_thai=t1', (tc) => tc); // bộ lọc trạng thái không đổi số tổng hợp (như màn hình)
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;'); Api.xoaCache();
  const rong = thongTin(await docFile(await goi(`${U}${Q20}`, 'admin')));
  for (const ten of Object.values(X.NHAN_TONG_14H)) assert.equal(rong.get(ten), 'Chưa có dữ liệu.');
});
