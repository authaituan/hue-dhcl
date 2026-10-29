// ==========================================
// Test KTT-16-1: độ phủ dữ liệu «Hàng đến BCVH» cho đối chiếu — server/lib/kttDoPhuBcvh.js, Api.doPhuBcvh, GET /api/ktt/doi-chieu/do-phu.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG DEMO-xxx, tên file HangDen_<mã>_<ngày>_<giờ>.csv do test tự dựng). Không mở data/, không DB thật, không mạng.
// Kịch bản chung: sáu BCVH có file từ 01/10 đến 28/10/2026, trừ khi ca nói khác. Hai đợt mỗi ngày (09:30 = S, 15:00 = C).
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const Api = require('../server/lib/kttApi');
const DP = require('../server/lib/kttDoPhuBcvh');
const { MA_BCVH_HUE } = require('../server/lib/kttTinh');

const PORT = 5999;
const BCVH = MA_BCVH_HUE;
const [A, B, C, D6, E, F] = BCVH;
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT16_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT16_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT16_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT16_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-do-phu-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const u of Object.values(USERS)) seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
  for (const [k, u] of Object.entries(USERS)) tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM arrival_items; DELETE FROM arrival_import_files;');
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
const ngayCong = (ngay, n) => new Date(Date.UTC(+ngay.slice(0, 4), +ngay.slice(5, 7) - 1, +ngay.slice(8, 10) + n)).toISOString().slice(0, 10);
const dsNgay = (tu, den) => { const ds = []; for (let d = tu; d <= den; d = ngayCong(d, 1)) ds.push(d); return ds; };

/** Một file giả. rows = số dòng; thieu = số dòng KHÔNG có giờ nhận (arrival_at NULL). */
function file(ma, ngay, gio, { status = 'OK', rows = 0, thieu = 0 } = {}) {
  seq++;
  const id = db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status, source)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'MANUAL')`).run(ma, `HangDen_${ma}_${ngay.replace(/-/g, '')}_${gio.replace(/:/g, '')}.csv`, ngay, gio, `sha-${seq}`, rows, rows, status).lastInsertRowid;
  for (let i = 0; i < rows; i++) {
    db.prepare('INSERT INTO arrival_items (import_file_id, tracking_no, arrival_at, arrival_date) VALUES (?, ?, ?, ?)')
      .run(id, `DEMO-${seq}-${i}`, i < thieu ? null : `${ngay} 08:00:00`, i < thieu ? null : ngay);
  }
  return id;
}
/** Phủ [tu, den] cho một BCVH: hai file OK mỗi ngày (S 09:30, C 15:00), trừ ngày trong `bo`; ngày trong `rong` chỉ có file EMPTY. */
function phu(ma, tu, den, { bo = [], rong = [], rows = 2 } = {}) {
  for (const d of dsNgay(tu, den)) {
    if (bo.includes(d)) continue;
    if (rong.includes(d)) { file(ma, d, '09:30:00', { status: 'EMPTY' }); continue; }
    file(ma, d, '09:30:00', { rows });
    file(ma, d, '15:00:00', { rows: 1 });
  }
}
const phuTatCa = (tu, den, o = {}) => { for (const ma of BCVH) phu(ma, tu, den, o); };
const lay = (kq, ma) => kq.bcvh.find((b) => b.ma === ma);
const ngay = (b, d) => b.theo_ngay.find((x) => x.ngay === d);
const goi1 = (tu, den, now) => Api.doPhuBcvh(db, { tu, den }, now === undefined ? undefined : { now });

async function goi(url, who) {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}

// ---------- ba trạng thái và các con số của một (BCVH, ngày) ----------
test('một ngày không file ở mọi BCVH (giống 24/10): KHONG_CO_FILE cả sáu, liệt kê ở từng BCVH, cờ dương tính giả đúng cho D = 22, 23, 24', async () => {
  phuTatCa('2026-10-01', '2026-10-28', { bo: ['2026-10-24'] });
  const kq = await goi1('2026-10-20', '2026-10-26'); // dữ liệu tới 28/10 nên D = 26 vẫn đủ D..D+2
  assert.equal(kq.bcvh.length, 6);
  assert.deepEqual(kq.bcvh.map((b) => b.ma), BCVH, 'đúng sáu BCVH Huế theo thứ tự hằng có sẵn');
  for (const b of kq.bcvh) {
    assert.equal(ngay(b, '2026-10-24').trang_thai, 'KHONG_CO_FILE', b.ma);
    assert.deepEqual(b.ngay_khong_co_file, ['2026-10-24'], b.ma);
    assert.deepEqual(b.ngay_chi_file_rong, [], b.ma);
    assert.equal(ngay(b, '2026-10-23').trang_thai, 'CO_DU_LIEU');
    assert.deepEqual(b.theo_ngay.filter((x) => x.co_the_duong_tinh_gia).map((x) => x.ngay), ['2026-10-22', '2026-10-23', '2026-10-24'], `${b.ma}: D mà D..D+2 chạm 24/10`);
    assert.deepEqual(ngay(b, '2026-10-22').ngay_thieu_trong_d_d2, ['2026-10-24']);
    assert.equal(ngay(b, '2026-10-21').co_the_duong_tinh_gia, false);
    assert.equal(ngay(b, '2026-10-25').co_the_duong_tinh_gia, false);
    const k = ngay(b, '2026-10-24');
    assert.deepEqual([k.so_file_ok, k.so_file_empty, k.so_dong, k.so_dot, k.gio_file_moi_nhat, k.ty_le_thieu_gio_nhan], [0, 0, 0, 0, null, null]);
  }
});

test('file EMPTY: chỉ có EMPTY → CHI_FILE_RONG (đúng BCVH, đúng ngày, kéo cờ D..D+2); EMPTY cùng ngày với file OK → CO_DU_LIEU nhưng so_file_empty vẫn hiện', async () => {
  phuTatCa('2026-10-01', '2026-10-28');
  // BCVH E: ngày 22/10 chỉ có file rỗng; BCVH F: ngày 22/10 có một file rỗng + một file OK
  db.exec(`DELETE FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code IN ('${E}', '${F}') AND file_date = '2026-10-22');
    DELETE FROM arrival_import_files WHERE unit_code IN ('${E}', '${F}') AND file_date = '2026-10-22'`);
  file(E, '2026-10-22', '09:30:00', { status: 'EMPTY' });
  file(F, '2026-10-22', '09:30:00', { status: 'EMPTY' });
  file(F, '2026-10-22', '15:00:00', { rows: 3 });
  const kq = await goi1('2026-10-20', '2026-10-25');
  const e = lay(kq, E); const f = lay(kq, F);
  const e22 = ngay(e, '2026-10-22');
  assert.deepEqual([e22.trang_thai, e22.so_file_ok, e22.so_file_empty, e22.so_dong, e22.so_dot], ['CHI_FILE_RONG', 0, 1, 0, 1]);
  assert.deepEqual(e.ngay_chi_file_rong, ['2026-10-22']);
  assert.deepEqual(e.ngay_khong_co_file, []);
  assert.deepEqual(e.theo_ngay.filter((x) => x.co_the_duong_tinh_gia).map((x) => x.ngay), ['2026-10-20', '2026-10-21', '2026-10-22']);
  const f22 = ngay(f, '2026-10-22');
  assert.deepEqual([f22.trang_thai, f22.so_file_ok, f22.so_file_empty, f22.so_dong, f22.so_dot, f22.gio_file_moi_nhat], ['CO_DU_LIEU', 1, 1, 3, 2, '15:00:00']);
  assert.deepEqual(f.ngay_chi_file_rong, [], 'ngày có file OK không bị liệt kê là chỉ-file-rỗng');
  assert.equal(f22.co_the_duong_tinh_gia, false);
  for (const ma of [A, B, C, D6]) assert.deepEqual(lay(kq, ma).ngay_chi_file_rong, [], ma);
});

test('số liệu một ngày: số file OK, số dòng, số đợt (S/C), giờ file mới nhất, tỷ lệ dòng thiếu giờ nhận; REJECTED / CONFLICT không tính', async () => {
  phuTatCa('2026-10-01', '2026-10-28');
  db.exec(`DELETE FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = '${B}' AND file_date = '2026-10-21');
    DELETE FROM arrival_import_files WHERE unit_code = '${B}' AND file_date = '2026-10-21'`);
  file(B, '2026-10-21', '09:30:00', { rows: 4, thieu: 1 });
  file(B, '2026-10-21', '15:00:00', { rows: 6, thieu: 4 });
  file(B, '2026-10-21', '18:00:00', { status: 'REJECTED', rows: 50 });
  file(B, '2026-10-21', '19:00:00', { status: 'CONFLICT' });
  const o = ngay(lay(await goi1('2026-10-21', '2026-10-21'), B), '2026-10-21');
  assert.equal(o.so_file_ok, 2);
  assert.equal(o.so_file_empty, 0);
  assert.equal(o.so_dong, 10);
  assert.equal(o.so_dot, 2);
  assert.equal(o.gio_file_moi_nhat, '15:00:00', 'file bị từ chối không làm giờ mới nhất');
  assert.equal(o.ty_le_thieu_gio_nhan, 0.5);
  assert.equal(o.trang_thai, 'CO_DU_LIEU');
  // ngày chỉ có file bị từ chối = không có file
  db.exec(`DELETE FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = '${B}' AND file_date = '2026-10-27');
    DELETE FROM arrival_import_files WHERE unit_code = '${B}' AND file_date = '2026-10-27'`);
  file(B, '2026-10-27', '09:30:00', { status: 'REJECTED' });
  assert.equal(ngay(lay(await goi1('2026-10-27', '2026-10-27'), B), '2026-10-27').trang_thai, 'KHONG_CO_FILE');
});

// ---------- theo BCVH và cửa sổ ----------
test('BCVH bắt đầu muộn: ngày đầu riêng, cửa sổ riêng và cửa sổ chung bắt đầu ở ngày muộn nhất; ngày trước ngày đầu KHONG_CO_FILE và ngoài cửa sổ', async () => {
  for (const ma of [A, B, C, D6, E]) phu(ma, '2026-10-01', '2026-10-28');
  phu(F, '2026-10-05', '2026-10-28');
  const kq = await goi1('2026-10-03', '2026-10-08');
  assert.equal(lay(kq, A).ngay_dau, '2026-10-01');
  assert.equal(lay(kq, F).ngay_dau, '2026-10-05');
  assert.deepEqual(lay(kq, F).cua_so, { tu: '2026-10-05', den: '2026-10-26' });
  assert.deepEqual(lay(kq, A).cua_so, { tu: '2026-10-01', den: '2026-10-26' });
  assert.deepEqual(kq.cua_so_chung, { tu: '2026-10-05', den: '2026-10-26' });
  assert.deepEqual(kq.cua_so_thuc_te, { tu: '2026-10-05', den: '2026-10-08' }, 'giao với khoảng yêu cầu');
  assert.deepEqual(lay(kq, F).ngay_khong_co_file, ['2026-10-03', '2026-10-04']);
  assert.equal(ngay(lay(kq, F), '2026-10-04').trong_cua_so, false);
  assert.equal(ngay(lay(kq, F), '2026-10-05').trong_cua_so, true);
  assert.equal(ngay(lay(kq, A), '2026-10-04').trong_cua_so, true);
  assert.equal(ngay(lay(kq, F), '2026-10-04').co_the_duong_tinh_gia, true, 'D = 04/10 chạm ngày chưa có file');
  assert.equal(ngay(lay(kq, F), '2026-10-05').co_the_duong_tinh_gia, false);
});

test('độ mới cắt 48 giờ cuối: D + 48 giờ ≤ độ mới (D tính từ 00:00); sát ranh giới và trước ranh giới một giây', () => {
  // ngày đầu 01/10, độ mới là file OK mới nhất (ngày + giờ)
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-10-28 09:30:04').cua_so, { tu: '2026-10-01', den: '2026-10-26' });
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-10-28 00:00:00').cua_so, { tu: '2026-10-01', den: '2026-10-26' }, '26/10 00:00 + 48 giờ = 28/10 00:00 ≤ độ mới');
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-10-27 23:59:59').cua_so, { tu: '2026-10-01', den: '2026-10-25' }, 'thiếu một giây: ngày 26/10 chưa đủ');
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-11-01 00:00:00').cua_so, { tu: '2026-10-01', den: '2026-10-30' }, 'qua ranh giới tháng');
  // độ mới chưa tới ngày đầu + 48 giờ → không có cửa sổ, có lý do
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-10-02 12:00:00'), { cua_so: null, ly_do: 'DO_MOI_CHUA_DU_48_GIO' });
  assert.deepEqual(DP.cuaSoCuaBcvh('2026-10-01', '2026-10-03 00:00:00').cua_so, { tu: '2026-10-01', den: '2026-10-01' });
  assert.deepEqual(DP.cuaSoCuaBcvh(null, null), { cua_so: null, ly_do: 'CHUA_CO_DU_LIEU' });
});

test('độ mới cắt 48 giờ cuối qua DB: BCVH chậm kéo cửa sổ chung lùi; ngày cuối của khoảng yêu cầu nằm ngoài cửa sổ thực tế', async () => {
  for (const ma of [A, B, C, D6, E]) phu(ma, '2026-10-01', '2026-10-28');
  phu(F, '2026-10-01', '2026-10-24'); // BCVH F chậm 4 ngày: độ mới 24/10 15:00
  const kq = await goi1('2026-10-20', '2026-10-28');
  assert.equal(lay(kq, F).ngay_cuoi, '2026-10-24');
  assert.equal(lay(kq, F).do_moi, '2026-10-24 15:00:00');
  assert.deepEqual(lay(kq, F).cua_so, { tu: '2026-10-01', den: '2026-10-22' });
  assert.deepEqual(kq.cua_so_chung, { tu: '2026-10-01', den: '2026-10-22' });
  assert.deepEqual(kq.cua_so_thuc_te, { tu: '2026-10-20', den: '2026-10-22' });
  assert.equal(ngay(lay(kq, A), '2026-10-26').trong_cua_so, true);
  assert.equal(ngay(lay(kq, A), '2026-10-27').trong_cua_so, false);
  assert.equal(ngay(lay(kq, F), '2026-10-23').trong_cua_so, false);
  // ngày 25/10 trở đi F chưa có file: KHONG_CO_FILE và kéo cờ cho D = 23, 24
  assert.deepEqual(lay(kq, F).ngay_khong_co_file, ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
  assert.equal(ngay(lay(kq, F), '2026-10-23').co_the_duong_tinh_gia, true);
  assert.equal(ngay(lay(kq, F), '2026-10-22').co_the_duong_tinh_gia, false);
});

test('không có cửa sổ chung: BCVH chưa có dữ liệu / độ mới chưa đủ 48 giờ → cua_so_chung null, nêu BCVH chặn; DB trống → tất cả null', async () => {
  const trong = await goi1('2026-10-20', '2026-10-22');
  assert.equal(trong.cua_so_chung, null);
  assert.equal(trong.cua_so_thuc_te, null);
  assert.deepEqual(trong.bcvh_chan_cua_so_chung, BCVH);
  for (const b of trong.bcvh) {
    assert.deepEqual([b.ngay_dau, b.ngay_cuoi, b.do_moi, b.cua_so, b.ly_do_khong_co_cua_so], [null, null, null, null, 'CHUA_CO_DU_LIEU']);
    assert.equal(b.theo_ngay.length, 3);
    assert.ok(b.theo_ngay.every((x) => x.trang_thai === 'KHONG_CO_FILE' && x.co_the_duong_tinh_gia && !x.trong_cua_so));
  }
  for (const ma of [A, B, C, D6, E]) phu(ma, '2026-10-01', '2026-10-28');
  file(F, '2026-10-27', '15:00:00', { rows: 1 }); // F mới có đúng một ngày
  Api.xoaCache();
  const kq = await goi1('2026-10-20', '2026-10-22');
  assert.equal(lay(kq, F).cua_so, null);
  assert.equal(lay(kq, F).ly_do_khong_co_cua_so, 'DO_MOI_CHUA_DU_48_GIO');
  assert.equal(kq.cua_so_chung, null);
  assert.deepEqual(kq.bcvh_chan_cua_so_chung, [F]);
  assert.equal(kq.cua_so_thuc_te, null);
});

test('cửa sổ chung bắt đầu ở ngày đầu muộn nhất khi bốn BCVH vào 01/10, hai BCVH vào 27/09 và 30/09 (hình dạng bản sao thật, dữ liệu giả)', async () => {
  for (const ma of [B, D6, E, F]) phu(ma, '2026-10-01', '2026-10-28');
  phu(A, '2026-09-27', '2026-10-28');
  phu(C, '2026-09-30', '2026-10-28');
  const kq = await goi1('2026-09-25', '2026-10-05');
  assert.equal(kq.cua_so_chung.tu, '2026-10-01');
  assert.deepEqual(kq.cua_so_thuc_te, { tu: '2026-10-01', den: '2026-10-05' });
  assert.deepEqual([lay(kq, A).ngay_dau, lay(kq, C).ngay_dau], ['2026-09-27', '2026-09-30']);
});

test('ngày dữ liệu đầu và độ mới chỉ tính file OK (file EMPTY đứng đầu / đứng cuối không kéo dài cửa sổ)', async () => {
  phu(A, '2026-10-02', '2026-10-28');
  file(A, '2026-10-01', '09:30:00', { status: 'EMPTY' });
  file(A, '2026-10-29', '09:30:00', { status: 'EMPTY' });
  for (const ma of [B, C, D6, E, F]) phu(ma, '2026-10-02', '2026-10-28');
  const kq = await goi1('2026-10-01', '2026-10-03');
  assert.equal(lay(kq, A).ngay_dau, '2026-10-02');
  assert.equal(lay(kq, A).ngay_cuoi, '2026-10-28');
  assert.equal(ngay(lay(kq, A), '2026-10-01').trang_thai, 'CHI_FILE_RONG');
  assert.equal(ngay(lay(kq, A), '2026-10-01').trong_cua_so, false);
});

// ---------- giới hạn tham số ----------
test('tham số: 31 ngày nhận; quá 31 ngày, thiếu, sai định dạng, ngược, khóa lạ → 400 tiếng Việt', async () => {
  phuTatCa('2026-10-01', '2026-11-05');
  const ok = await goi('/api/ktt/doi-chieu/do-phu?tu=2026-10-01&den=2026-10-31', 'admin');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.so_ngay, 31);
  assert.equal(ok.body.bcvh[0].theo_ngay.length, 31);
  const qua = await goi('/api/ktt/doi-chieu/do-phu?tu=2026-10-01&den=2026-11-01', 'admin');
  assert.equal(qua.status, 400);
  assert.equal(qua.body.ma, 'KTT_KHOANG_QUA_DAI');
  assert.match(qua.body.error, /31 ngày/);
  for (const [url, ma] of [
    ['', 'KTT_THIEU_THAM_SO'], ['?tu=2026-10-01', 'KTT_THIEU_THAM_SO'], ['?tu=2026-10-01&den=', 'KTT_THIEU_THAM_SO'],
    ['?tu=2026-13-01&den=2026-13-02', 'KTT_NGAY_SAI'], ['?tu=01/10/2026&den=2026-10-02', 'KTT_NGAY_SAI'],
    ['?tu=2026-10-05&den=2026-10-01', 'KTT_KHOANG_NGAY_SAI'], ['?tu=2026-10-01&den=2026-10-02&bcvh=533140', 'KTT_THAM_SO_LA'],
    ['?tu=2026-10-01&tu=2026-10-02&den=2026-10-03', 'KTT_THAM_SO_SAI']
  ]) {
    const r = await goi(`/api/ktt/doi-chieu/do-phu${url}`, 'ttvh');
    assert.equal(r.status, 400, url);
    assert.equal(r.body.ma, ma, url);
    assert.match(r.body.error, /[À-ỹ]/, `thông báo tiếng Việt: ${url}`);
  }
  assert.throws(() => DP.tinhDoPhu({ tuNgay: '2026-10-01', denNgay: '2026-11-01' }), (e) => e.code === 'KTT_KHOANG_QUA_DAI');
});

// ---------- quyền ----------
test('quyền: không token 401; ADMIN và TTVH 200 cùng số liệu; GDVH 403; TIVI 403; chỉ GET', async () => {
  phuTatCa('2026-10-01', '2026-10-28');
  const url = '/api/ktt/doi-chieu/do-phu?tu=2026-10-20&den=2026-10-22';
  assert.equal((await goi(url)).status, 401);
  const a = await goi(url, 'admin');
  const t = await goi(url, 'ttvh');
  assert.equal(a.status, 200);
  assert.equal(t.status, 200);
  assert.deepEqual(a.body, t.body);
  assert.equal((await goi(url, 'gdvh')).status, 403);
  assert.equal((await goi(url, 'tivi')).status, 403);
  const post = await fetch(`${ctx.baseUrl}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 404);
  assert.equal(a.body.cua_so_chung.tu, '2026-10-01');
  assert.ok(a.body.bcvh.every((b) => typeof b.ten === 'string' && b.ten.length > 0), 'tên BCVH lấy từ danh mục có sẵn');
});

// ---------- chỉ đọc, không chạm bảng KTT, cache ----------
test('chỉ đọc: không câu SQL nào nhắc bảng ktt_*, không ghi arrival_*; số dòng bảng trước = sau', async () => {
  phuTatCa('2026-10-01', '2026-10-28', { bo: ['2026-10-24'] });
  const truoc = db.prepare('SELECT (SELECT COUNT(*) FROM arrival_import_files) AS f, (SELECT COUNT(*) FROM arrival_items) AS i').get();
  const cauSql = [];
  const gian = { prepare: (sql) => { cauSql.push(sql); return db.prepare(sql); }, pragma: (...a) => db.pragma(...a), name: db.name, memory: db.memory };
  const kq = await Api.doPhuBcvh(gian, { tu: '2026-10-20', den: '2026-10-26' });
  assert.ok(kq.bcvh.length === 6 && cauSql.length >= 3);
  assert.ok(cauSql.every((s) => !/ktt_/i.test(s)), 'không đụng bảng ktt_*');
  assert.ok(cauSql.every((s) => !/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)/i.test(s)), 'chỉ đọc');
  assert.deepEqual(db.prepare('SELECT (SELECT COUNT(*) FROM arrival_import_files) AS f, (SELECT COUNT(*) FROM arrival_items) AS i').get(), truoc);
});

test('cache: lần 2 không tính lại; nạp thêm file làm mất hiệu lực; quá 10 phút tính lại; hai khoảng khác nhau là hai mục', async () => {
  phuTatCa('2026-10-01', '2026-10-28', { bo: ['2026-10-24'] });
  const t0 = Date.now();
  const a1 = await goi1('2026-10-20', '2026-10-26', t0);
  const a2 = await goi1('2026-10-20', '2026-10-26', t0 + 1000);
  assert.equal(Api.thongKe().doPhuTinh, 1);
  assert.deepEqual(a1, a2);
  file(A, '2026-10-24', '09:30:00', { rows: 2 });
  const a3 = await goi1('2026-10-20', '2026-10-26', t0 + 2000);
  assert.equal(Api.thongKe().doPhuTinh, 2, 'nạp file mới → tính lại');
  assert.equal(ngay(lay(a3, A), '2026-10-24').trang_thai, 'CO_DU_LIEU');
  assert.equal(ngay(lay(a3, B), '2026-10-24').trang_thai, 'KHONG_CO_FILE');
  await goi1('2026-10-20', '2026-10-26', t0 + 2000 + Api.TUOI_CHUA_CHOT_MS + 1);
  assert.equal(Api.thongKe().doPhuTinh, 3, 'quá tuổi → tính lại');
  await goi1('2026-10-21', '2026-10-26', t0 + 3000 + Api.TUOI_CHUA_CHOT_MS);
  assert.equal(Api.thongKe().doPhuTinh, 4);
  assert.equal(Api.thongKe().do_phu, 2);
});

// ---------- hàm thuần ----------
test('hàm thuần tinhDoPhu: không DB, kết quả như nhau cho cùng đầu vào; (BCVH, ngày) vắng mặt = KHONG_CO_FILE; sáu BCVH mặc định lấy từ MA_BCVH_HUE', () => {
  const vao = {
    tuNgay: '2026-10-10', denNgay: '2026-10-12',
    ngayFile: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].flatMap((d) => BCVH.map((ma) => ({ ma, ngay: d, so_file_ok: 1, so_file_empty: 0, so_dong: 4, so_dong_thieu_gio_nhan: 1, dot: ['S'], gio_file_moi_nhat: '09:30:00' }))),
    toanCuc: BCVH.map((ma) => ({ ma, ngay_dau: '2026-10-01', do_moi: '2026-10-14 09:30:00' }))
  };
  const r1 = DP.tinhDoPhu(vao);
  assert.deepEqual(r1.bcvh.map((b) => b.ma), BCVH);
  assert.deepEqual(DP.tinhDoPhu(JSON.parse(JSON.stringify(vao))), r1);
  assert.deepEqual(r1.cua_so_chung, { tu: '2026-10-01', den: '2026-10-12' });
  assert.equal(r1.bcvh[0].theo_ngay[0].ty_le_thieu_gio_nhan, 0.25);
  assert.ok(r1.bcvh.every((b) => b.theo_ngay.every((x) => x.trang_thai === 'CO_DU_LIEU' && !x.co_the_duong_tinh_gia)));
  vao.ngayFile = vao.ngayFile.filter((f) => !(f.ma === A && f.ngay === '2026-10-13'));
  const r2 = DP.tinhDoPhu(vao);
  assert.deepEqual(lay(r2, A).theo_ngay.map((x) => x.co_the_duong_tinh_gia), [false, true, true], 'D = 11, 12 chạm 13/10 (ngoài khoảng yêu cầu nhưng trong D+2)');
  assert.deepEqual(lay(r2, A).ngay_khong_co_file, [], 'danh sách chỉ tính ngày trong khoảng yêu cầu');
  assert.deepEqual(lay(r2, A).theo_ngay[1].ngay_thieu_trong_d_d2, ['2026-10-13']);
});
