// ==========================================
// Test KTT-8: API /api/ktt/* (server/routes/ktt.js + server/lib/kttApi.js): quyền, tham số, khớp hàm gốc, cache theo ngày, nhường vòng lặp, chi tiết phân trang,
// tham số giờ chốt ngày, bộ nhớ đệm xepChuyen. Server thật trên DB tạm của harness (file, nên worker_thread đọc cùng file); dữ liệu GIẢ (SHBG KTT-DEMO-xxx). Không mở data/, không DB thật, không mạng.
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
const L = require('../server/lib/kttLichChuyen');
const Q = require('../server/lib/kttQuery');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');
const KN = require('../server/config/ktt-nap');
const { taoDanhGia } = require('../server/lib/kttDanhGia');

const PORT = 5937;
const TH = '533140'; const HT = '535470';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT8_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT8_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT8_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT8_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-api-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Api.dongNen(); // đóng kết nối chỉ đọc của worker trước khi xóa file DB tạm
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o }); }
/** Một SHBG khai thác lại: túi đến + (nếu có) túi đi. */
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui });
  bg(den, shbg);
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg);
}
/** Ghi một cặp OK (độ mới = nguon). */
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
function duLieu() {
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // t1
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' }); // t2
  kt('KTT-DEMO-A3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // t3
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00' }); // t5
  kt('KTT-DEMO-A5', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi
  kt('KTT-DEMO-B1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' });
  kt('KTT-DEMO-B2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', nhan: HT });
  kt('KTT-DEMO-H1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120' }); // hàng hoàn
  kt('KTT-DEMO-X1', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-21 09:00:00', nhan: '530900' });
  kt('KTT-DEMO-C1', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 06:50:00' });
  capOk('2026-10-21 10:00:00');
}

// ---------- gọi API ----------
async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null, headers: res.headers };
}
const Q20 = '?tu=2026-10-20&den=2026-10-22';
const ROUTES = [['meta', '/api/ktt/meta'], ['luu-thoat', `/api/ktt/luu-thoat${Q20}`], ['tong-hop', `/api/ktt/tong-hop${Q20}`], ['chi-tiet', `/api/ktt/chi-tiet${Q20}&loai=t1`]];
const sang = (x) => JSON.parse(JSON.stringify(x));

// ---------- quyền ----------
test('quyền: mọi route /api/ktt/*: không token 401; ADMIN và TTVH 200; GDVH 403; TIVI 403; route lạ cũng bị chặn ở router (GDVH 403, ADMIN 404)', async () => {
  duLieu();
  for (const [ten, url] of ROUTES) {
    assert.equal((await goi(url)).status, 401, `${ten}: không token`);
    assert.equal((await goi(url, 'admin')).status, 200, `${ten}: ADMIN`);
    assert.equal((await goi(url, 'ttvh')).status, 200, `${ten}: TTVH`);
    assert.equal((await goi(url, 'gdvh')).status, 403, `${ten}: GDVH`);
    assert.equal((await goi(url, 'tivi')).status, 403, `${ten}: TIVI`);
  }
  assert.equal((await goi('/api/ktt/khong-co', 'gdvh')).status, 403);
  assert.equal((await goi('/api/ktt/khong-co', 'admin')).status, 404);
  for (const [ten, url] of ROUTES) assert.equal((await goi(url, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404, `${ten}: chỉ GET`);
});

test('ADMIN và TTVH thấy CÙNG số liệu (không lọc theo BCVH được giao); Cache-Control: no-store giữ nguyên', async () => {
  duLieu();
  const a = await goi(`/api/ktt/luu-thoat${Q20}`, 'admin');
  const t = await goi(`/api/ktt/luu-thoat${Q20}`, 'ttvh');
  assert.deepEqual(a.body, t.body);
  assert.match(a.headers.get('cache-control') || '', /no-store/);
});

test('kiểm tĩnh routes/ktt.js: requireRoles(ADMIN, TTVH) đứng TRƯỚC mọi route; chỉ router.get; không ghi DB', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ktt.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const iGuard = src.indexOf('router.use(requireRoles(ROLES.ADMIN, ROLES.TTVH))');
  assert.ok(iGuard > 0);
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete|all)\(/g)) { assert.equal(m[1], 'get'); assert.ok(m.index > iGuard); }
  assert.ok(!/\.run\(|\.exec\(|INSERT|UPDATE|DELETE/.test(src));
  const idx = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  assert.match(idx, /app\.use\('\/api\/ktt', kttRoutes\)/);
});

// ---------- tham số ----------
test('tham số sai -> 400 tiếng Việt nêu rõ tham số, không lộ chi tiết nội bộ: thiếu / sai định dạng / ngày không có thật (31/04) / den < tu / 32 ngày / khóa lạ / lặp tham số', async () => {
  duLieu();
  const loi = [
    ['/api/ktt/luu-thoat', /Thiếu tham số "tu" hoặc "den"/], ['/api/ktt/luu-thoat?tu=2026-10-20', /Thiếu tham số/], ['/api/ktt/luu-thoat?den=2026-10-20', /Thiếu tham số/],
    ['/api/ktt/luu-thoat?tu=2026/10/20&den=2026-10-21', /"tu" phải là ngày có thật/], ['/api/ktt/luu-thoat?tu=2026-10-20&den=abc', /"den" phải là ngày có thật/],
    ['/api/ktt/luu-thoat?tu=2026-04-31&den=2026-05-01', /"tu" phải là ngày có thật/], ['/api/ktt/luu-thoat?tu=2026-10-22&den=2026-10-21', /không sau "den"/],
    ['/api/ktt/luu-thoat?tu=2026-10-01&den=2026-11-01', /tối đa 31 ngày/], ['/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-20&x=1', /Tham số không hỗ trợ: "x"/],
    ['/api/ktt/luu-thoat?tu=2026-10-20&tu=2026-10-21&den=2026-10-21', /chỉ được truyền một lần/], ['/api/ktt/luu-thoat?tu[a]=1&den=2026-10-21', /không hỗ trợ/],
    ['/api/ktt/tong-hop?tu=2026-10-01&den=2026-11-01', /tối đa 31 ngày/], ['/api/ktt/tong-hop?tu=2026-10-20&den=2026-10-20&loai=t1', /Tham số không hỗ trợ: "loai"/],
    ['/api/ktt/meta?x=1', /Tham số không hỗ trợ/],
    ['/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20', /Tham số "loai" phải thuộc/], ['/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=abc', /Tham số "loai" phải thuộc/],
    ['/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=t1&page=0', /"page" phải là số nguyên ≥ 1/], ['/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=t1&page_size=201', /"page_size" phải là số nguyên 1\.\.200/],
    ['/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=t1&ma_bcvh=123456', /"ma_bcvh" phải là một trong 6 BCVH/]
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
  assert.deepEqual(ghi, [], 'lỗi 400 không ghi log lỗi hệ thống');
});

test('chống chèn SQL: giá trị độc hại bị từ chối (400), bảng còn nguyên', async () => {
  duLieu();
  const truoc = [db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c];
  const doc = ["2026-10-20'; DROP TABLE ktt_tui; --", "2026-10-20' OR '1'='1", '2026-10-20%27%3B%20DELETE%20FROM%20ktt_tui', '1; SELECT 1', '../../etc/passwd'];
  for (const x of doc) {
    for (const p of [`tu=${encodeURIComponent(x)}&den=2026-10-21`, `tu=2026-10-20&den=${encodeURIComponent(x)}`, `tu=2026-10-20&den=2026-10-21&loai=${encodeURIComponent(x)}`, `tu=2026-10-20&den=2026-10-21&loai=t1&ma_bcvh=${encodeURIComponent(x)}`]) {
      for (const route of ['luu-thoat', 'tong-hop', 'chi-tiet']) assert.equal((await goi(`/api/ktt/${route}?${p}`, 'admin')).status, 400, `${route}?${p}`);
    }
  }
  assert.deepEqual([db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c], truoc);
});

// ---------- khớp hàm gốc ----------
test('luu-thoat khớp TRỰC TIẾP luuThoatTheoNgay trên cùng dữ liệu: một ngày, nhiều ngày, có ngày trống; mỗi ngày có da_chot; meta.nguon_xuat_luc_moi_nhat', async () => {
  duLieu();
  for (const [tu, den] of [['2026-10-20', '2026-10-20'], ['2026-10-20', '2026-10-22'], ['2026-10-19', '2026-10-24'], ['2026-10-21', '2026-10-21']]) {
    Api.xoaCache();
    const r = await goi(`/api/ktt/luu-thoat?tu=${tu}&den=${den}`, 'admin');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, sang(QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den })), `${tu}..${den}`);
    assert.ok(r.body.theo_ngay.every((x) => typeof x.da_chot === 'boolean'));
    assert.equal(r.body.meta.nguon_xuat_luc_moi_nhat, '2026-10-21 10:00:00');
  }
  const r = (await goi('/api/ktt/luu-thoat?tu=2026-10-19&den=2026-10-24', 'admin')).body;
  assert.deepEqual(r.theo_ngay.map((x) => [x.ngay, x.tong_shbg_ngay]), [['2026-10-19', 0], ['2026-10-20', 5], ['2026-10-21', 4], ['2026-10-22', 1], ['2026-10-23', 0], ['2026-10-24', 0]], 'đủ ngày, ngày trống = 0');
  assert.deepEqual(r.theo_ngay.map((x) => x.da_chot), [true, true, false, false, false, false]);
});

test('tong-hop khớp TRỰC TIẾP tongHopKtt + taoDanhGia (bayGio = độ mới) và có meta; chạy ở worker_thread riêng (DB file)', async () => {
  duLieu();
  const r = await goi(`/api/ktt/tong-hop${Q20}`, 'ttvh');
  assert.equal(r.status, 200);
  const th = Q.tongHopKtt(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22', bayGio: '2026-10-21 10:00:00' });
  assert.deepEqual({ ...r.body, meta: undefined, danh_gia: undefined }, { ...sang(th), meta: undefined, danh_gia: undefined });
  assert.deepEqual(r.body.danh_gia, sang(taoDanhGia(th)));
  assert.deepEqual(r.body.meta, { nguon_xuat_luc_moi_nhat: '2026-10-21 10:00:00', bay_gio: '2026-10-21 10:00:00', ly_do: null });
  assert.ok(Api.thongKe().workerLan >= 1 && Api.thongKe().noiTuyenLan === 0, 'tác vụ nặng chạy ở worker');
});

test('chưa có dữ liệu (không có cặp OK): luu-thoat / tong-hop / chi-tiet trả kết quả rỗng có lý do CHUA_CO_DU_LIEU, không đọc đồng hồ, không lỗi', async () => {
  const l = await goi(`/api/ktt/luu-thoat${Q20}`, 'admin');
  assert.deepEqual([l.status, l.body.ly_do, l.body.theo_ngay.length, l.body.co_du_lieu], [200, 'CHUA_CO_DU_LIEU', 3, false]);
  const t = await goi(`/api/ktt/tong-hop${Q20}`, 'admin');
  assert.deepEqual([t.status, t.body.meta.ly_do, t.body.meta.nguon_xuat_luc_moi_nhat], [200, 'CHUA_CO_DU_LIEU', null]);
  const c = await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin');
  assert.deepEqual([c.status, c.body.pagination.total, c.body.items, c.body.meta.ly_do], [200, 0, [], 'CHUA_CO_DU_LIEU']);
});

test('chỉ đọc: gọi mọi route không ghi DB (total_changes không đổi)', async () => {
  duLieu();
  const tc = () => db.prepare('SELECT total_changes() AS n').get().n;
  const truoc = tc();
  for (const [, url] of ROUTES) await goi(url, 'admin');
  assert.equal(tc(), truoc);
});

// ---------- meta ----------
test('meta: độ mới, lịch chuyến 14 dòng, hạn 60 phút, giờ chốt ngày, ngưỡng, chỉ tiêu, giới hạn, loại chi tiết', async () => {
  duLieu();
  const m = (await goi('/api/ktt/meta', 'admin')).body;
  assert.equal(m.nguon_xuat_luc_moi_nhat, '2026-10-21 10:00:00');
  assert.equal(m.lich_chuyen.length, 14); assert.equal(m.han_den_truoc_chuyen_phut, 60); assert.equal(m.gio_chot_ngay, '09:00');
  assert.deepEqual(m.nguong, { treo_phut: 180, nam_lau_toi_da_phut: 1440, chi_tieu_f13_gio: 14, chi_tieu_f13_gio_thuan_hoa_phu_xuan: 12 });
  assert.equal(m.chi_tieu_gio.mac_dinh, 14); assert.deepEqual(m.chi_tieu_gio.ngoai_le, [{ ma_bcvh: TH, phuong: ['Thuận Hóa', 'Phú Xuân'], gio: 12 }]);
  assert.deepEqual(m.gioi_han, { so_ngay_toi_da: 31, trang_toi_da: 200, trang_mac_dinh: 50 });
  for (const x of ['t1', 'dang_cho_chuyen', 'hang_hoan', 'dat', 'khong_dat', 'treo', 'nam_lau']) assert.ok(m.loai_chi_tiet.includes(x), x);
  assert.deepEqual(m.canh_bao, []);
});

// ---------- cache ----------
test('cache theo ngày: lần 2 cùng khoảng không tính lại; khoảng mở rộng chỉ tính ngày mới; kết quả có cache = không cache', async () => {
  duLieu();
  const a = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body;
  assert.equal(Api.thongKe().ngayTinh, 3);
  const b = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body;
  assert.equal(Api.thongKe().ngayTinh, 3, 'lần 2: không tính lại');
  assert.deepEqual(b, a);
  await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-23', 'admin');
  assert.equal(Api.thongKe().ngayTinh, 4, 'chỉ tính thêm ngày 23');
  await goi('/api/ktt/luu-thoat?tu=2026-10-21&den=2026-10-22', 'admin');
  assert.equal(Api.thongKe().ngayTinh, 4, 'khoảng con dùng lại hoàn toàn');
  Api.xoaCache();
  assert.deepEqual((await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body, a, 'không cache cho cùng kết quả');
  assert.equal(Api.thongKe().ngayTinh, 3);
});

test('cache: độ mới đổi tính lại ngày CHƯA chốt và ngày ĐÃ chốt TRONG cửa sổ nạp (lùi 8 ngày); ngày đã chốt CŨ HƠN cửa sổ giữ nguyên; đủ sau cặp 09:00 ngày kế thì ngày chuyển sang chốt', async () => {
  duLieu(); // độ mới 21/10 10:00: cửa sổ nạp từ 13/10; ngày 20 đã chốt (trong cửa sổ); 21, 22 chưa chốt
  kt('KTT-DEMO-CU', { quet: '2026-10-05 05:30:00', gioDi: '2026-10-05 06:50:00' }); // ngày 05: đã chốt, CŨ hơn cửa sổ
  const luu = async (ngay) => (await goi(`/api/ktt/luu-thoat?tu=${ngay}&den=${ngay}`, 'admin')).body;
  const cu1 = await luu('2026-10-05'); const t20a = await luu('2026-10-20'); const t21a = await luu('2026-10-21');
  assert.deepEqual([cu1.theo_ngay[0].da_chot, t20a.theo_ngay[0].da_chot, t21a.theo_ngay[0].da_chot], [true, true, false]);
  assert.equal(Api.thongKe().ngayTinh, 3);
  capOk('2026-10-21 15:00:00'); // nạp cặp mới
  const cu2 = await luu('2026-10-05');
  assert.equal(Api.thongKe().ngayTinh, 3, 'ngày đã chốt CŨ hơn cửa sổ: giữ nguyên');
  assert.deepEqual(cu2.theo_ngay, cu1.theo_ngay);
  const t20b = await luu('2026-10-20');
  assert.equal(Api.thongKe().ngayTinh, 4, 'ngày 20 đã chốt nhưng TRONG cửa sổ nạp: tính lại khi độ mới đổi');
  const t21b = await luu('2026-10-21');
  assert.equal(Api.thongKe().ngayTinh, 5, 'ngày 21 chưa chốt: tính lại');
  assert.equal(t20b.meta.nguon_xuat_luc_moi_nhat, '2026-10-21 15:00:00'); assert.equal(t21b.bay_gio, '2026-10-21 15:00:00');
  await luu('2026-10-20');
  assert.equal(Api.thongKe().ngayTinh, 5, 'cùng độ mới: dùng cache');
  capOk('2026-10-22 09:00:00'); // cặp 09:00 của ngày 22: ngày 21 thành đã chốt
  const t21c = await luu('2026-10-21');
  assert.equal(t21c.theo_ngay[0].da_chot, true);
  assert.deepEqual(t21c, sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-21', denNgay: '2026-10-21' })), 'ngày vừa tính lại = tính trực tiếp');
  const rang = (await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-21', 'admin')).body;
  assert.deepEqual(rang, sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-21' })), 'trong cửa sổ: kết quả có cache = không cache');
});

test('cache: ngày ĐÃ chốt TRONG cửa sổ nạp có BD10 đi cập nhật TẠI CHỖ (số dòng và tổng id không đổi) sau lần nạp mới -> kết quả đổi', async () => {
  duLieu();
  const luu = async () => (await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-20', 'admin')).body.theo_ngay[0];
  const truoc = await luu();
  assert.equal(truoc.da_chot, true);
  assert.deepEqual([truoc.tong.trang_thai.t1.shbg, truoc.tong.trang_thai.t5.shbg], [1, 2], 'A1 đi đúng chuyến; A4 (đi 22/10) và A5 (chưa đi, lỡ chuyến 12:30) ở trạng thái 5');
  const chuKy = db.prepare("SELECT COUNT(*) n, SUM(id) s FROM ktt_tui WHERE gio_quet_tui_den >= '2026-10-20 00:00:00' AND gio_quet_tui_den < '2026-10-21 00:00:00'").get();
  // UPSERT của lần nạp mới cập nhật dòng túi ĐI của A5 tại chỗ: có BD10 đi lúc 12:00 (≤ 12:30)
  const r = db.prepare("UPDATE ktt_tui SET bd10_di_gio_di = '2026-10-20 12:00:00', bd10_di_so_hieu = 'BD10-I-NEW', nguon_xuat_luc = '2026-10-21 15:00:00' WHERE id = (SELECT t.id FROM ktt_tui t JOIN ktt_buu_gui b ON b.post_bag_index = t.post_bag_index AND b.year = t.year AND b.shbg = 'KTT-DEMO-A5' WHERE t.chieu = 'DI')").run();
  assert.equal(r.changes, 1);
  assert.deepEqual(db.prepare("SELECT COUNT(*) n, SUM(id) s FROM ktt_tui WHERE gio_quet_tui_den >= '2026-10-20 00:00:00' AND gio_quet_tui_den < '2026-10-21 00:00:00'").get(), chuKy, 'chữ ký ngày (số dòng, tổng id) KHÔNG đổi');
  const chuaNap = await luu();
  assert.deepEqual(chuaNap, truoc, 'chưa có lần nạp mới (độ mới chưa đổi): cache giữ kết quả cũ');
  capOk('2026-10-21 15:00:00'); // lần nạp mới
  const sau = await luu();
  assert.deepEqual([sau.da_chot, sau.tong.trang_thai.t1.shbg, sau.tong.trang_thai.t5.shbg], [true, 2, 1], 'A5 chuyển t5 -> t1: kết quả đổi');
  assert.notDeepEqual(sau.tong, truoc.tong);
  assert.deepEqual(sau, sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20' }).theo_ngay[0]));
});

test('cache: ngày đã chốt CŨ HƠN cửa sổ chỉ tính lại khi chữ ký ngày đổi (thêm dòng) hoặc quá 6 giờ; ngày chưa chốt quá 10 phút hoặc có ghi DB thì tính lại', async () => {
  duLieu();
  kt('KTT-DEMO-CU', { quet: '2026-10-05 05:30:00', gioDi: '2026-10-05 06:50:00' });
  const t0 = 1_000_000_000_000;
  const q05 = { tu: '2026-10-05', den: '2026-10-05' }; const q21 = { tu: '2026-10-21', den: '2026-10-21' };
  await Api.luuThoat(db, q05, { now: t0 }); await Api.luuThoat(db, q21, { now: t0 });
  assert.equal(Api.thongKe().ngayTinh, 2);
  await Api.luuThoat(db, q05, { now: t0 + 5 * 60 * 1000 }); await Api.luuThoat(db, q21, { now: t0 + 5 * 60 * 1000 });
  assert.equal(Api.thongKe().ngayTinh, 2, 'trong 10 phút');
  await Api.luuThoat(db, q05, { now: t0 + 11 * 60 * 1000 }); await Api.luuThoat(db, q21, { now: t0 + 11 * 60 * 1000 });
  assert.equal(Api.thongKe().ngayTinh, 3, 'ngày 21 (chưa chốt) quá 10 phút; ngày 05 (chốt, cũ) giữ');
  kt('KTT-DEMO-MOI', { quet: '2026-10-05 06:00:00', gioDi: '2026-10-05 06:40:00' }); // thêm dòng vào ngày 05: chữ ký đổi
  await Api.luuThoat(db, q05, { now: t0 + 12 * 60 * 1000 }); await Api.luuThoat(db, q21, { now: t0 + 12 * 60 * 1000 });
  assert.equal(Api.thongKe().ngayTinh, 5, 'ngày 05 (chữ ký đổi) và ngày 21 (ghi DB) đều tính lại');
  await Api.luuThoat(db, q05, { now: t0 + 12 * 60 * 1000 + 7 * 3600 * 1000 }); await Api.luuThoat(db, q21, { now: t0 + 12 * 60 * 1000 + 7 * 3600 * 1000 });
  assert.equal(Api.thongKe().ngayTinh, 7, 'quá 6 giờ: cả hai tính lại');
});

test('cache: ghi DB không liên quan KHÔNG làm tính lại ngày đã chốt cũ hơn cửa sổ (chỉ ngày chưa chốt tính lại do dấu hiệu DB đổi)', async () => {
  duLieu();
  kt('KTT-DEMO-CU', { quet: '2026-10-05 05:30:00', gioDi: '2026-10-05 06:50:00' });
  const luu = (ngay) => goi(`/api/ktt/luu-thoat?tu=${ngay}&den=${ngay}`, 'admin');
  await luu('2026-10-05'); await luu('2026-10-21');
  db.prepare("INSERT OR REPLACE INTO ktt_cau_hinh (khoa, gia_tri, mo_ta, cap_nhat_luc) VALUES ('khoa_khac_ktt8', 1, 'x', 'x')").run();
  await luu('2026-10-05'); await luu('2026-10-21');
  assert.equal(Api.thongKe().ngayTinh, 3, 'ngày 21 tính lại, ngày 05 giữ');
  db.prepare("DELETE FROM ktt_cau_hinh WHERE khoa = 'khoa_khac_ktt8'").run();
});

test('KTT_WORKER=0: tong-hop / chi-tiet chạy thẳng trong tiến trình chính (không worker), kết quả y hệt; mặc định (không đặt) dùng worker', async () => {
  duLieu();
  const goc = process.env.KTT_WORKER;
  try {
    delete process.env.KTT_WORKER;
    Api.xoaCache();
    const a = (await goi(`/api/ktt/tong-hop${Q20}`, 'admin')).body;
    const c1 = (await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin')).body;
    assert.deepEqual([Api.thongKe().workerLan > 0, Api.thongKe().noiTuyenLan], [true, 0], 'mặc định: worker');
    process.env.KTT_WORKER = '0';
    Api.xoaCache();
    const b = (await goi(`/api/ktt/tong-hop${Q20}`, 'admin')).body;
    const c2 = (await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin')).body;
    assert.deepEqual([Api.thongKe().workerLan, Api.thongKe().noiTuyenLan], [0, 2], 'KTT_WORKER=0: chạy thẳng');
    assert.deepEqual(b, a); assert.deepEqual(c2, c1);
    process.env.KTT_WORKER = '1'; // giá trị khác '0': vẫn dùng worker
    Api.xoaCache();
    await goi(`/api/ktt/tong-hop${Q20}`, 'admin');
    assert.ok(Api.thongKe().workerLan >= 1);
  } finally { if (goc === undefined) delete process.env.KTT_WORKER; else process.env.KTT_WORKER = goc; }
});

test('cache tong-hop / chi-tiet: lần 2 không tính lại; độ mới đổi thì tính lại; kết quả giống nhau', async () => {
  duLieu();
  const a = (await goi(`/api/ktt/tong-hop${Q20}`, 'admin')).body;
  const b = (await goi(`/api/ktt/tong-hop${Q20}`, 'admin')).body;
  assert.equal(Api.thongKe().tongHopTinh, 1); assert.deepEqual(b, a);
  const c1 = (await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin')).body;
  const c2 = (await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin')).body;
  assert.equal(Api.thongKe().chiTietTinh, 1); assert.deepEqual(c2, c1);
  capOk('2026-10-21 15:00:00');
  await goi(`/api/ktt/tong-hop${Q20}`, 'admin');
  assert.equal(Api.thongKe().tongHopTinh, 2);
});

test('giờ chốt ngày là THAM SỐ: đổi qua /api/tham-so thì da_chot đổi đúng và cache bị xóa; xóa / hỏng tham số -> về mặc định 09:00, không ném lỗi', async () => {
  duLieu(); // độ mới 21/10 10:00
  const dc = async () => (await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-20', 'admin')).body.theo_ngay[0].da_chot;
  assert.equal(await dc(), true);
  const put = (gia_tri) => fetch(`${ctx.baseUrl}/api/tham-so`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'Thử KTT-8', thay_doi: [{ khoa: 'ktt_gio_chot_ngay', gia_tri }] }) });
  try {
    assert.equal((await put('15:00')).status, 200);
    assert.equal(KN.GIO_CHOT_NGAY, '15:00');
    assert.equal(await dc(), false, '10:00 < 15:00 ngày D+1');
    assert.equal((await goi('/api/ktt/meta', 'admin')).body.gio_chot_ngay, '15:00');
    assert.equal((await put('10:00')).status, 200);
    assert.equal(await dc(), true, 'đúng 10:00: đã chốt');
    assert.equal((await put('25:61')).status, 400, 'giá trị sai bị từ chối');
    // hỏng ghi đè trong DB -> khoiTao bỏ qua, dùng mặc định
    db.prepare("UPDATE tham_so SET gia_tri = '\"khong-phai-gio\"' WHERE khoa = 'ktt_gio_chot_ngay'").run();
    const goc = console.error; console.error = () => {};
    try { TS.khoiTao(db); } finally { console.error = goc; }
    assert.equal(KN.GIO_CHOT_NGAY, '09:00');
    assert.equal(await dc(), true);
    db.prepare("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'").run();
    TS.khoiTao(db);
    assert.equal(QL.gioChot(), '09:00');
  } finally { db.prepare("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'").run(); TS.khoiTao(db); }
  const tsList = (await goi('/api/tham-so', 'admin')).body.tham_so.find((x) => x.khoa === 'ktt_gio_chot_ngay');
  assert.deepEqual([tsList.nhom, tsList.mac_dinh, tsList.kieu], ['hang_tai_ktt', '09:00', 'gio_hhmm']);
});

// ---------- không làm đứng máy chủ ----------
test('nhường vòng lặp: khi luu-thoat 31 ngày đang tính lần đầu, request nhẹ (/meta) được phục vụ TRƯỚC khi nó xong; promise chưa xong sau một vòng lặp', async () => {
  duLieu();
  for (let i = 0; i < 40; i++) kt(`KTT-DEMO-L${i}`, { quet: `2026-10-${String(1 + (i % 28)).padStart(2, '0')} 05:30:00`, gioDi: `2026-10-${String(1 + (i % 28)).padStart(2, '0')} 06:50:00` });
  Api.xoaCache();
  const p = Api.luuThoat(db, { tu: '2026-10-01', den: '2026-10-31' });
  let xong = false;
  p.then(() => { xong = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(xong, false, 'chưa xong sau một vòng lặp');
  assert.ok(Api.thongKe().ngayTinh < 31, 'mới tính một phần');
  await p;
  assert.equal(Api.thongKe().ngayTinh, 31);
  Api.xoaCache();
  const t0 = process.hrtime.bigint();
  let tLuu = null; let tMeta = null;
  const pl = goi('/api/ktt/luu-thoat?tu=2026-10-01&den=2026-10-31', 'admin').then((r) => { tLuu = process.hrtime.bigint() - t0; return r; });
  const pm = goi('/api/ktt/meta', 'ttvh').then((r) => { tMeta = process.hrtime.bigint() - t0; return r; });
  const [rl, rm] = await Promise.all([pl, pm]);
  assert.equal(rl.status, 200); assert.equal(rm.status, 200);
  assert.ok(tMeta < tLuu, `/meta (${Number(tMeta) / 1e6} ms) phải xong trước luu-thoat 31 ngày (${Number(tLuu) / 1e6} ms)`);
});

test('hai request cùng khoảng chưa có cache: mỗi ngày chỉ tính MỘT lần (dùng chung lần tính đang chạy)', async () => {
  duLieu();
  const [a, b] = await Promise.all([goi(`/api/ktt/luu-thoat${Q20}`, 'admin'), goi(`/api/ktt/luu-thoat${Q20}`, 'ttvh')]);
  assert.deepEqual(a.body, b.body);
  assert.equal(Api.thongKe().ngayTinh, 3);
});

// ---------- chi tiết ----------
test('chi-tiet: phân trang đúng, tổng khớp luu-thoat, sắp xếp ổn định theo SHBG, trang cuối, không trùng dòng giữa các trang', async () => {
  for (let i = 1; i <= 5; i++) kt(`KTT-DEMO-P${i}`, { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  kt('KTT-DEMO-Q1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' });
  capOk('2026-10-21 10:00:00');
  const lt = (await goi('/api/ktt/luu-thoat?tu=2026-10-20&den=2026-10-20', 'admin')).body.theo_ngay[0].tong;
  const trang = async (page) => (await goi(`/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=t1&page=${page}&page_size=2`, 'admin')).body;
  const [p1, p2, p3, p4] = [await trang(1), await trang(2), await trang(3), await trang(4)];
  assert.deepEqual([p1.pagination.total, p1.pagination.total_pages, p1.pagination.page_size], [5, 3, 2]);
  assert.equal(p1.pagination.total, lt.trang_thai.t1.shbg, 'tổng khớp luu-thoat');
  assert.deepEqual([p1.items.length, p2.items.length, p3.items.length, p4.items.length], [2, 2, 1, 0]);
  const tat = [...p1.items, ...p2.items, ...p3.items].map((x) => x.shbg);
  assert.deepEqual(tat, ['KTT-DEMO-P1', 'KTT-DEMO-P2', 'KTT-DEMO-P3', 'KTT-DEMO-P4', 'KTT-DEMO-P5'], 'sắp xếp ổn định, không trùng');
  assert.deepEqual((await trang(1)).items, p1.items, 'gọi lại cho cùng thứ tự');
  const t2 = (await goi('/api/ktt/chi-tiet?tu=2026-10-20&den=2026-10-20&loai=t2', 'admin')).body;
  assert.deepEqual([t2.pagination.total, t2.items[0].shbg, t2.items[0].trangThai, t2.items[0].ketQuaChuyen], [1, 'KTT-DEMO-Q1', 'T2', 'TRUOT']);
});

test('chi-tiet: mọi nhóm lưu thoát có tổng KHỚP số của luu-thoat (năm trạng thái, đang chờ, hàng hoàn, đạt / không đạt, nhóm riêng); lọc ma_bcvh; loại cũ của kttQuery vẫn dùng được', async () => {
  duLieu();
  const ng = (await goi(`/api/ktt/luu-thoat${Q20}`, 'admin')).body;
  const tc = ng.tong_cong;
  const tong = async (loai, them = '') => (await goi(`/api/ktt/chi-tiet${Q20}&loai=${loai}${them}`, 'admin')).body.pagination.total;
  for (const t of ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen']) assert.equal(await tong(t), tc.trang_thai[t].shbg, t);
  assert.equal(await tong('hang_hoan'), tc.hang_hoan.tong_shbg);
  for (const [loai, kh] of [['dat', 'dat'], ['khong_dat', 'khong_dat'], ['chua_di', 'chua_di'], ['chua_do_duoc', 'chua_do_duoc'], ['xnd_sau_gio_di', 'xnd_sau_gio_di']]) assert.equal(await tong(loai), tc.dat_khong_dat[kh], loai);
  assert.equal(await tong('ngoai_pham_vi'), Object.values(tc.khong_phan_loai.ngoai_pham_vi).reduce((a, b) => a + b, 0));
  assert.equal(await tong('khong_ro_dich'), tc.khong_phan_loai.khong_ro_dich);
  assert.equal(await tong('t1', `&ma_bcvh=${HT}`), ng.tong_cong.theo_bcvh[HT].trang_thai.t1.shbg);
  assert.equal(await tong('t1', `&ma_bcvh=${TH}`), ng.tong_cong.theo_bcvh[TH].trang_thai.t1.shbg);
  const cu = await goi(`/api/ktt/chi-tiet${Q20}&loai=lo_chuyen`, 'ttvh');
  assert.equal(cu.status, 200); assert.ok(Array.isArray(cu.body.items)); assert.equal(cu.body.meta.loai, 'lo_chuyen');
  assert.equal(Object.keys(cu.body).sort().join(), 'items,meta,pagination');
});

test('chi-tiet: không rò thông tin cá nhân — chỉ các trường nghiệp vụ (SHBG, số hiệu BD, giờ, BCVH, nhãn); không tên người / biển số / lái xe / tài khoản', async () => {
  duLieu();
  const c = (await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`, 'admin')).body;
  const cho = new Set(['shbg', 'soHieuBd8', 'bd10Den', 'bd10Di', 'ngayDen', 'quetDen', 'xndBd10', 'gioLapBd10Di', 'maBcvh', 'nhomDich', 'nhom', 'trangThai', 'gioXuatPhat', 'ngayChuyen', 'ketQuaChuyen', 'lyDo', 'diTruocKhiDen', 'datKhongDat', 'chiTieuGio', 'thoiGianChoGiay', 'tenPhuong',
    // KTT-8c: 17 trường snake_case của sheet 7
    'duong_thu_den_ma', 'duong_thu_den_ten', 'gio_quet_tui_den', 'gio_xac_nhan_bd10_den', 'kg', 'ma_bcvh', 'ten_bcvh', 'chuyen_lien_ke', 'gio_xuat_phat', 'han_den_muon_nhat', 'gio_lap_bd10_di', 'gio_cho_gio', 'dat_khong_dat', 'phan_loai', 'trang_thai', 'ngay_luu_thoat',
    // KTT-10c: nhãn chỉ tiêu 14 giờ theo từng mốc
    'chi_tieu_14h_xnd', 'chi_tieu_14h_quet_tui_den']);
  assert.ok(c.items.length > 0);
  for (const it of c.items) for (const k of Object.keys(it)) assert.ok(cho.has(k), `trường lạ: ${k}`);
  assert.ok(!/lai_xe|bien_so|nguoi|user|password|hrm/i.test(JSON.stringify(c)));
  const cu = (await goi(`/api/ktt/chi-tiet${Q20}&loai=lo_chuyen&page_size=200`, 'admin')).body;
  assert.ok(cu.pagination.page_size <= 200);
});

// ---------- bộ nhớ đệm xepChuyen ----------
test('xepChuyen có bộ nhớ đệm cho kết quả Y HỆT bản không đệm trên lưới BCVH × giờ (cả Chủ nhật, qua đêm, cuối tháng / năm, 29/02) × hạn; lần 2 trúng đệm (cùng tham chiếu, đóng băng)', () => {
  const lich = L.docLichChuyen(db).lich;
  const ngays = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31', '2026-12-31', '2028-02-29', '2028-02-28'];
  let so = 0;
  for (const han of [60, 30, 0, 90]) {
    for (const ma of [...L.MA_BCVH_HUE, '999999']) {
      for (const ngay of ngays) {
        for (let phut = 0; phut < 1440; phut += 17) {
          const gio = `${ngay} ${String(Math.floor(phut / 60)).padStart(2, '0')}:${String(phut % 60).padStart(2, '0')}:${String((phut * 7) % 60).padStart(2, '0')}`;
          const kd = L.xepChuyenKhongDem(lich, ma, gio, { hanDenTruocChuyenPhut: han });
          const a = L.xepChuyen(lich, ma, gio, { hanDenTruocChuyenPhut: han });
          assert.deepEqual(a, kd, `${ma} ${gio} ${han}`);
          assert.equal(L.xepChuyen(lich, ma, gio, { hanDenTruocChuyenPhut: han }), a, 'lần 2: cùng tham chiếu');
          so++;
        }
      }
    }
  }
  assert.ok(so > 8000);
  const r = L.xepChuyen(lich, TH, '2026-10-26 11:40:00');
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.chuyen));
  // đầu vào lạ / mảng lịch khác nhau không bị lẫn nhau
  for (const x of [null, '', 'abc', '2026-04-31 08:00:00']) assert.deepEqual(L.xepChuyen(lich, TH, x), L.xepChuyenKhongDem(lich, TH, x));
  const lichKhac = lich.filter((x) => x.ma_bcvh !== TH);
  assert.equal(L.xepChuyen(lichKhac, TH, '2026-10-26 11:40:00').ly_do, 'KHONG_CO_LICH');
  assert.equal(L.xepChuyen(lich, TH, '2026-10-26 11:40:00').ok, true);
  assert.deepEqual(L.xepChuyen(lich, TH, '2026-10-26 11:40:00', { hanDenTruocChuyenPhut: 30 }), L.xepChuyenKhongDem(lich, TH, '2026-10-26 11:40:00', { hanDenTruocChuyenPhut: 30 }));
  assert.notDeepEqual(L.xepChuyen(lich, TH, '2026-10-26 11:40:00', { hanDenTruocChuyenPhut: 30 }), L.xepChuyen(lich, TH, '2026-10-26 11:40:00'));
});

test('kết quả lưu thoát giống nhau khi tắt bộ nhớ đệm xepChuyen (so khớp toàn bộ kết quả luuThoatTheoNgay)', () => {
  duLieu();
  const co = sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22' }));
  const goc = L.xepChuyen;
  L.xepChuyen = L.xepChuyenKhongDem;
  try { assert.deepEqual(sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22' })), co); } finally { L.xepChuyen = goc; }
});

// ---------- hiệu năng (KTT_PERF=1) ----------
test('hiệu năng API (KTT_PERF=1): 31 ngày dữ liệu giả — lần gọi nguội 1 / 7 / 31 ngày, nóng (cache), tong-hop nguội / nóng, song song; trước / sau tối ưu xepChuyen', { skip: process.env.KTT_PERF ? false : 'đặt KTT_PERF=1 để đo' }, async () => {
  let x = 777;
  const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
  const hai = (n) => String(n).padStart(2, '0');
  const ngayStr = (i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
  const gio = (i, phut) => `${ngayStr(i + Math.floor(phut / 1440))} ${hai(Math.floor(phut / 60) % 24)}:${hai(phut % 60)}:00`;
  const BCVH = L.MA_BCVH_HUE;
  const PHUONG = ['49122', '49135', '49133', '49129', '49527', '49620', '49134', '49218', '49825', '49142'];
  const cotTui = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'chieu', 'luong', 'co_mo_tui', 'gio_quet_tui_den', 'bd10_den_so_hieu', 'bd10_den_xnd', 'bd10_den_ma_diem_gui', 'bd10_di_gio_di', 'bd10_di_ma_diem_nhan', 'bd10_di_so_hieu', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const cotBg = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'shbg', 'ma_xa_phuong', 'ten_xa_phuong', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const insTui = db.prepare(`INSERT INTO ktt_tui (${cotTui.join(',')}) VALUES (${cotTui.map(() => '?').join(',')})`);
  const insBg = db.prepare(`INSERT INTO ktt_buu_gui (${cotBg.join(',')}) VALUES (${cotBg.map(() => '?').join(',')})`);
  const nx = '2026-11-01 00:00:00';
  let nTui = 0; let nBg = 0;
  db.exec('BEGIN');
  for (let d = 0; d < 31; d++) {
    for (let i = 0; i < 714; i++) {
      const quet = gio(d, 300 + rnd(1000));
      const t = ['990001', '530100', 'T', 'S1', `D${d}`, '1', String(++nTui)];
      insTui.run(...t, 'DEN', 'KHAI_THAC_DEN', 1, quet, `BD10-D-${d}-${i}`, rnd(12) === 0 ? null : gio(d, 300 + rnd(1100)), i % 40 === 0 ? '531120' : '599001', null, null, null, nx, nx);
      const shbgs = [];
      for (let k = 0; k < 10; k++) { const s = `KTT-DEMO-${d}-${i}-${k}`; shbgs.push(s); insBg.run(...t, s, PHUONG[rnd(PHUONG.length)], null, nx, nx); nBg++; }
      if (i % 2 === 0) {
        const nhan = rnd(20) === 0 ? '530900' : BCVH[rnd(6)];
        const td = ['990001', nhan, 'T', 'S1', `D${d}`, '2', String(++nTui)];
        insTui.run(...td, 'DI', 'KHAI_THAC_DI', 0, null, null, null, null, rnd(8) === 0 ? null : gio(d, 420 + rnd(1700)), nhan, `BD10-I-${d}-${i}`, nx, nx);
        for (const s of shbgs) { insBg.run(...td, s, '49122', null, nx, nx); nBg++; }
      }
    }
  }
  db.exec('COMMIT');
  capOk(`${ngayStr(33)} 10:00:00`);
  const ms = async (f) => { const t0 = process.hrtime.bigint(); const r = await f(); return { r, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };
  const lt = (tu, den) => goi(`/api/ktt/luu-thoat?tu=${ngayStr(tu)}&den=${ngayStr(den)}`, 'admin');
  const dong = [];
  // «trước»: không đệm xepChuyen
  const goc = L.xepChuyen;
  L.xepChuyen = L.xepChuyenKhongDem;
  Api.xoaCache(); const t1a = await ms(() => lt(10, 10)); Api.xoaCache(); const t7a = await ms(() => lt(10, 16)); Api.xoaCache(); const t31a = await ms(() => lt(0, 30));
  L.xepChuyen = goc;
  // «sau»: có đệm
  Api.xoaCache(); const t1 = await ms(() => lt(10, 10)); Api.xoaCache(); const t7 = await ms(() => lt(10, 16)); Api.xoaCache(); const t31 = await ms(() => lt(0, 30));
  const nong = await ms(() => lt(0, 30));
  assert.equal(t31.r.status, 200);
  Api.xoaCache();
  const th31 = await ms(() => goi(`/api/ktt/tong-hop?tu=${ngayStr(0)}&den=${ngayStr(30)}`, 'admin'));
  const th31n = await ms(() => goi(`/api/ktt/tong-hop?tu=${ngayStr(0)}&den=${ngayStr(30)}`, 'admin'));
  const ct = await ms(() => goi(`/api/ktt/chi-tiet?tu=${ngayStr(0)}&den=${ngayStr(30)}&loai=t1&page_size=200`, 'admin'));
  Api.xoaCache();
  const song = await ms(() => Promise.all(Array.from({ length: 10 }, (_, i) => lt(i * 3, i * 3 + 6))));
  const meta = await ms(() => goi('/api/ktt/meta', 'ttvh'));
  Api.xoaCache();
  let metaTrong = null;
  const pSong = Promise.all(Array.from({ length: 6 }, (_, i) => lt(i * 4, i * 4 + 6)));
  await new Promise((r) => setImmediate(r));
  metaTrong = await ms(() => goi('/api/ktt/meta', 'ttvh'));
  await pSong;
  dong.push(`# KTT-8 hiệu năng API (${nTui} túi / ${nBg} dòng, 31 ngày): luu-thoat nguội TRƯỚC đệm xepChuyen 1/7/31 ngày = ${t1a.ms.toFixed(0)}/${t7a.ms.toFixed(0)}/${t31a.ms.toFixed(0)} ms; SAU = ${t1.ms.toFixed(0)}/${t7.ms.toFixed(0)}/${t31.ms.toFixed(0)} ms; nóng 31 ngày = ${nong.ms.toFixed(0)} ms`);
  dong.push(`# tong-hop 31 ngày nguội ${th31.ms.toFixed(0)} ms (worker), nóng ${th31n.ms.toFixed(0)} ms; chi-tiet t1 31 ngày ${ct.ms.toFixed(0)} ms; 10 request luu-thoat 7 ngày song song nguội ${song.ms.toFixed(0)} ms; /meta rảnh ${meta.ms.toFixed(0)} ms, /meta khi 6 request nặng đang chạy ${metaTrong.ms.toFixed(0)} ms`);
  console.log(dong.join('\n'));
  assert.ok(nong.ms < t31.ms);
});

// ---------- KTT-10c: tham số moc_chi_tieu ----------
const LT = (q = '') => `/api/ktt/luu-thoat${Q20}${q}`;
/** Mọi khối có chi_tieu_14h của một kết quả luu-thoat: [tên, khối]. */
function cacKhoi(body) {
  const ds = [['tong_cong', body.tong_cong], ['tong_cong.hang_hoan', body.tong_cong.hang_hoan], ...Object.entries(body.tong_cong.theo_bcvh).map(([m, k]) => [`tong_cong.${m}`, k])];
  for (const n of body.theo_ngay) { ds.push([`${n.ngay}.tong`, n.tong], [`${n.ngay}.hang_hoan`, n.hang_hoan]); for (const [m, k] of Object.entries(n.theo_bcvh)) ds.push([`${n.ngay}.${m}`, k]); }
  return ds;
}
const boMocMacDinh = (c) => { const { moc_mac_dinh: _bo, ...r } = c; return r; };

test('KTT-10c moc_chi_tieu: bỏ qua / rỗng = xnd (như cũ); quet_tui_den chỉ đổi khối dat_khong_dat; meta.moc_chi_tieu; khối chi_tieu_14h đủ hai mốc và GIỐNG NHAU ở hai giá trị; khớp lõi', async () => {
  duLieu();
  const mac = (await goi(LT(), 'admin')).body;
  const rong = (await goi(LT('&moc_chi_tieu='), 'admin')).body;
  const a = (await goi(LT('&moc_chi_tieu=xnd'), 'admin'));
  const b = (await goi(LT('&moc_chi_tieu=quet_tui_den'), 'ttvh'));
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(mac, a.body, 'bỏ qua = xnd');
  assert.deepEqual(rong, a.body, 'rỗng = xnd');
  assert.deepEqual(a.body, sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22' })), 'mặc định khớp lõi như trước');
  assert.deepEqual(b.body, sang(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22', mocChiTieu: 'quet_tui_den' })), 'B khớp lõi');
  assert.equal(a.body.meta.moc_chi_tieu, 'xnd'); assert.equal(b.body.meta.moc_chi_tieu, 'quet_tui_den');
  assert.equal(a.body.meta.moc.chi_tieu, 'bd10_den_xnd -> bd10_di_gio_di'); assert.equal(b.body.meta.moc.chi_tieu, 'gio_quet_tui_den -> bd10_di_gio_di');
  assert.equal(a.body.tong_cong.dat_khong_dat.moc, 'bd10_den_xnd -> bd10_di_gio_di'); assert.equal(b.body.tong_cong.dat_khong_dat.moc, 'gio_quet_tui_den -> bd10_di_gio_di');
  const ka = cacKhoi(a.body); const kb = cacKhoi(b.body);
  assert.equal(ka.length, kb.length);
  for (let i = 0; i < ka.length; i++) {
    const [ten, x] = ka[i]; const y = kb[i][1];
    assert.deepEqual(Object.keys(x.chi_tieu_14h.theo_moc), ['xnd', 'quet_tui_den'], ten);
    assert.equal(x.chi_tieu_14h.moc_mac_dinh, 'xnd', ten); assert.equal(y.chi_tieu_14h.moc_mac_dinh, 'quet_tui_den', ten);
    assert.deepEqual(boMocMacDinh(y.chi_tieu_14h), boMocMacDinh(x.chi_tieu_14h), `${ten}: chi_tieu_14h không phụ thuộc tham số`);
    // ngoài dat_khong_dat và nhãn mốc mặc định, các số khác của khối không đổi
    const bo = (k) => { const { dat_khong_dat: _d, chi_tieu_14h: _c, theo_bcvh: _t, theo_nguon: _n, hang_hoan: _h, ...r } = k; return r; };
    assert.deepEqual(bo(y), bo(x), `${ten}: số khác không đổi`);
  }
});

test('KTT-10c: đo được + không đo được = mẫu số ở MỌI khối và cả hai mốc; mẫu số = SHBG có trạng thái; không có tỷ lệ «đạt» chung trên mẫu số', async () => {
  duLieu();
  for (const moc of ['xnd', 'quet_tui_den']) {
    const body = (await goi(LT(`&moc_chi_tieu=${moc}`), 'admin')).body;
    for (const [ten, k] of cacKhoi(body)) {
      const c = k.chi_tieu_14h;
      const coTrangThai = Object.values(k.trang_thai).reduce((s, x) => s + x.shbg, 0);
      assert.equal(c.mau_so, coTrangThai, `${moc} ${ten}: mẫu số`);
      for (const m of ['xnd', 'quet_tui_den']) {
        const x = c.theo_moc[m];
        assert.equal(x.mau_so, c.mau_so, `${moc} ${ten} ${m}`);
        assert.equal(x.do_duoc, x.dat + x.khong_dat, `${moc} ${ten} ${m}: đo được`);
        assert.equal(x.khong_do_duoc.tong, x.khong_do_duoc.thieu_moc + x.khong_do_duoc.moc_sau_gio_di + x.khong_do_duoc.chua_di, `${moc} ${ten} ${m}`);
        assert.equal(x.do_duoc + x.khong_do_duoc.tong, x.mau_so, `${moc} ${ten} ${m}: đo được + không đo được = mẫu số`);
        assert.ok(!('ty_le_dat' in x), 'không có tỷ lệ đạt chung');
      }
    }
  }
  const c = (await goi(LT(), 'admin')).body.tong_cong.chi_tieu_14h;
  assert.ok(c.mau_so > 0 && c.theo_moc.xnd.khong_do_duoc.chua_di >= 1, 'dữ liệu giả có SHBG chưa đi (không đo được)');
});

test('KTT-10c moc_chi_tieu sai -> 400 tiếng Việt (KTT_MOC_SAI), không lộ nội bộ; lặp tham số -> 400; /tong-hop, /chi-tiet, /xuat/luu-thoat KHÔNG nhận moc_chi_tieu (400)', async () => {
  duLieu();
  const ghi = []; const goc = console.error; console.error = (...x) => ghi.push(x.join(' '));
  try {
    for (const v of ['abc', 'XND', 'quet-tui-den', 'xnd%20', "xnd'%20OR%201=1--", 'quet_tui_den;DROP%20TABLE%20ktt_tui']) {
      const r = await goi(LT(`&moc_chi_tieu=${v}`), 'admin');
      assert.equal(r.status, 400, v);
      assert.equal(r.body.ma, 'KTT_MOC_SAI', v);
      assert.match(r.body.error, /Tham số "moc_chi_tieu" phải là một trong: xnd, quet_tui_den \(mặc định xnd\)\./, v);
    }
    const lap = await goi(LT('&moc_chi_tieu=xnd&moc_chi_tieu=quet_tui_den'), 'admin');
    assert.deepEqual([lap.status, lap.body.ma], [400, 'KTT_THAM_SO_SAI']); assert.match(lap.body.error, /"moc_chi_tieu" chỉ được truyền một lần/);
    for (const url of [`/api/ktt/tong-hop${Q20}&moc_chi_tieu=xnd`, `/api/ktt/chi-tiet${Q20}&loai=t1&moc_chi_tieu=xnd`, `/api/ktt/xuat/luu-thoat${Q20}&moc_chi_tieu=quet_tui_den`]) {
      const r = await goi(url, 'admin');
      assert.equal(r.status, 400, url);
      assert.deepEqual([r.body.ma, r.body.error], ['KTT_THAM_SO_LA', 'Tham số không hỗ trợ: "moc_chi_tieu"'], url);
    }
  } finally { console.error = goc; }
  assert.deepEqual(ghi, [], 'lỗi tham số không ghi log');
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM ktt_tui').get().n > 0, 'bảng còn nguyên');
});

test('KTT-10c cache: khóa theo (mốc, ngày) — mỗi mốc tính riêng một lần, không lẫn kết quả; chưa có dữ liệu vẫn trả meta.moc_chi_tieu', async () => {
  duLieu();
  const a1 = (await goi(LT(), 'admin')).body;
  assert.equal(Api.thongKe().ngayTinh, 3);
  const b1 = (await goi(LT('&moc_chi_tieu=quet_tui_den'), 'admin')).body;
  assert.equal(Api.thongKe().ngayTinh, 6, 'mốc B: mục riêng, tính 3 ngày');
  assert.equal(Api.thongKe().ngay, 6, 'sáu mục trong bộ nhớ');
  const a2 = (await goi(LT('&moc_chi_tieu=xnd'), 'admin')).body;
  const b2 = (await goi(LT('&moc_chi_tieu=quet_tui_den'), 'admin')).body;
  assert.equal(Api.thongKe().ngayTinh, 6, 'lần 2 của mỗi mốc: trúng cache');
  assert.deepEqual(a2, a1); assert.deepEqual(b2, b1);
  assert.equal(a2.tong_cong.dat_khong_dat.moc, 'bd10_den_xnd -> bd10_di_gio_di', 'không lấy nhầm mục của mốc B');
  assert.equal(b2.tong_cong.dat_khong_dat.moc, 'gio_quet_tui_den -> bd10_di_gio_di');
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;'); Api.xoaCache();
  const r = (await goi(LT('&moc_chi_tieu=quet_tui_den'), 'admin')).body;
  assert.deepEqual([r.ly_do, r.meta.moc_chi_tieu, r.meta.moc.chi_tieu], ['CHUA_CO_DU_LIEU', 'quet_tui_den', 'gio_quet_tui_den -> bd10_di_gio_di']);
  assert.equal(r.theo_ngay[0].tong.dat_khong_dat.moc, 'gio_quet_tui_den -> bd10_di_gio_di');
});
