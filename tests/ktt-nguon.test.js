// ==========================================
// Test KTT-8c: kg và nhóm theo nguồn (theo_nguon) trong /api/ktt/luu-thoat; chi-tiet 17 trường + loai ro_lai / truot_chuyen + tham số nguon; xuat/luu-thoat với ma_bcvh / nguon.
// Server thật trên DB tạm của harness (file, worker_thread đọc cùng file); dữ liệu GIẢ (SHBG KTT-DEMO-xxx, đường thư DT-xx). Không mở data/, không DB thật, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const NG = require('../server/lib/kttNguon');
const X = require('../server/lib/kttXuat');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');

const PORT = 5997;
const TH = '533140'; const HT = '535470';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KT8C_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KT8C_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KT8C_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KT8C_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-nguon-${Date.now()}.db` });
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
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NGX = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NGX, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NGX, ...o }); }
function kt(shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = '599001', duong = ['DT-A', 'Đường thư A'], gam = 100 }) {
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: duong[0], bd10_den_ten_duong_thu: duong[1] });
  bg(den, shbg, { khoi_luong_thuc_te_g: gam });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(di, shbg, { khoi_luong_thuc_te_g: gam });
  return den;
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}
/** Lịch mặc định: Thuận Hóa 07:00 / 12:30 / 19:45 …; Hương Trà 06:00 / 12:00. Độ mới 21/10 10:00. */
function duLieu() {
  const a1 = kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', gam: 1000 }); // t1, đúng chuyến
  // A1 còn nằm trong một túi đến thứ hai (quét sớm hơn): vẫn là MỘT SHBG, kg cộng một lần
  const den2 = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-10-20 05:00:00', bd10_den_so_hieu: 'BD10-D-EXTRA', bd10_den_xnd: '2026-10-20 05:00:00', bd10_den_ma_diem_gui: '599001', bd10_den_ma_duong_thu: 'DT-A', bd10_den_ten_duong_thu: 'Đường thư A' });
  bg(den2, 'KTT-DEMO-A1', { khoi_luong_thuc_te_g: 1000 });
  assert.ok(a1);
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00', gam: 2500 }); // t2, trượt chuyến
  kt('KTT-DEMO-A3', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-21 06:30:00', nhan: HT, gam: null }); // HT, D+1 trượt chuyến 12:00 -> t4; thiếu khối lượng
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-23 10:00:00', gam: 300 }); // t5 (đi từ D+2)
  kt('KTT-DEMO-A5', { quet: '2026-10-20 11:00:00', nhan: null, gam: 400 }); // chưa đi, lỡ chuyến 12:30 -> t5 (lỡ)
  kt('KTT-DEMO-B1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 11:00:00', nhan: HT, duong: ['DT-B', 'Đường thư B'], gam: 500 }); // HT đi 11:00 ≤ 12:00 -> t1
  kt('KTT-DEMO-B2', { quet: '2026-10-21 08:00:00', nhan: null, duong: ['DT-B', 'Đường thư B'], gam: 600 }); // đang chờ chuyến 12:30 (độ mới 10:00)
  kt('KTT-DEMO-N1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '533999', gam: 200 }); // nơi gửi 53… -> NOI_TINH, dù có đường thư DT-A
  kt('KTT-DEMO-N2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', nhan: HT, diemGui: '531120', gam: 250 }); // từ 531120 nhưng đích HT: hàng thường, NOI_TINH (không phải hàng hoàn)
  kt('KTT-DEMO-K1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 05:50:00', nhan: HT, diemGui: null, duong: [null, null], gam: 350 }); // thiếu mã đường thư -> KHONG_RO_NGUON
  kt('KTT-DEMO-H1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120', gam: 700 }); // hàng hoàn Tổ KHHH: không vào theo_nguon
  kt('KTT-DEMO-X1', { quet: '2026-10-21 08:00:00', gioDi: '2026-10-21 09:00:00', nhan: '530900', gam: 800 }); // ngoài phạm vi
  kt('KTT-DEMO-Q0', { quet: null, xnd: '2026-10-21 06:00:00', gioDi: '2026-10-21 07:00:00', gam: 900 }); // thiếu giờ quét đến
  capOk('2026-10-21 10:00:00');
}
async function goi(url, who = 'admin', init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: res.status, body: await res.json(), headers: res.headers };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
const Q20 = '?tu=2026-10-20&den=2026-10-22';
const TT5 = ['t1', 't2', 't3', 't4', 't5'];
const tong = (ds, f) => ds.reduce((s, x) => s + f(x), 0);
const gan = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.0015, `${msg}: ${a} ≠ ${b}`);
const lt = async (q = Q20) => (await goi(`/api/ktt/luu-thoat${q}`)).body;
async function docXuat(url) {
  const r = await goi(url);
  assert.equal(r.status, 200, url);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  const ws = wb.getWorksheet(X.TEN_SHEET_7);
  const dong = [];
  ws.eachRow((row, i) => { if (i > 1) dong.push(row.getCell(1).value); });
  const tt = new Map();
  wb.getWorksheet(X.TEN_SHEET_THONG_TIN).eachRow((row, i) => { if (i > 1) tt.set(row.getCell(1).value, row.getCell(2).value); });
  return { dong, tt };
}

// ---------- kg ----------
test('kg: mỗi khối có kg; SHBG thiếu khối lượng tính 0 và đếm vào meta.shbg_thieu_khoi_luong; mỗi SHBG đóng góp đúng một lần (kể cả nằm trong nhiều túi)', async () => {
  duLieu();
  const r = await lt();
  const d20 = r.theo_ngay.find((x) => x.ngay === '2026-10-20');
  // ngày 20: A1 1,0 (túi thứ hai không cộng lại) + A2 2,5 + A3 (thiếu = 0) + A4 0,3 + A5 0,4 + B1 0,5 + N1 0,2 = 4,9; hàng hoàn H1 thuộc ngày 21
  gan(d20.tong.kg, 4.9, 'kg ngày 20');
  gan(d20.tong.trang_thai.t1.kg, 1.0 + 0.5 + 0.2, 't1'); gan(d20.tong.trang_thai.t2.kg, 2.5, 't2'); gan(d20.tong.trang_thai.t4.kg, 0, 't4 (A3 thiếu khối lượng)');
  gan(d20.tong.trang_thai.t5.kg, 0.7, 't5');
  assert.equal(d20.tong.trang_thai.t1.shbg, 3);
  gan(d20.theo_bcvh[TH].kg, 1.0 + 2.5 + 0.3 + 0.4 + 0.2, 'kg BCVH Thuận Hóa'); gan(d20.theo_bcvh[HT].kg, 0.5, 'kg BCVH Hương Trà');
  // ngày 21: hàng hoàn có kg riêng; khối tổng không chứa hàng hoàn
  const d21 = r.theo_ngay.find((x) => x.ngay === '2026-10-21');
  gan(d21.hang_hoan.kg, 0.7, 'kg hàng hoàn');
  gan(d21.tong.kg, 0.6 + 0.25 + 0.35 + 0.9, 'kg ngày 21 (B2 + N2 + K1 + Q0 thiếu giờ quét; X1 ngoài phạm vi và H1 hàng hoàn không tính)');
  gan(d21.tong.trang_thai.dang_cho_chuyen.kg, 0.6, 'kg đang chờ chuyến');
  // tong_cong và từng BCVH cộng đúng các ngày
  gan(r.tong_cong.kg, tong(r.theo_ngay, (n) => n.tong.kg), 'tong_cong.kg');
  for (const m of [TH, HT]) gan(r.tong_cong.theo_bcvh[m].kg, tong(r.theo_ngay, (n) => n.theo_bcvh[m].kg), `tong_cong.theo_bcvh.${m}.kg`);
  for (const t of [...TT5, 'dang_cho_chuyen']) gan(r.tong_cong.trang_thai[t].kg, tong(r.theo_ngay, (n) => n.tong.trang_thai[t].kg), `tong_cong ${t}`);
  // thiếu khối lượng: A3 (gam null); mọi SHBG khác đều có
  assert.equal(r.meta.shbg_thieu_khoi_luong, 1);
  assert.equal(r.theo_ngay.find((x) => x.ngay === '2026-10-22').tong.kg, 0);
});

// ---------- theo_nguon ----------
test('theo_nguon: nhóm đúng (NOI_TINH, đường thư, KHONG_RO_NGUON), hàng hoàn không có mặt, sắp theo shbg giảm dần, các trường theo định nghĩa', async () => {
  duLieu();
  const r = await lt();
  const ma = (n) => n.theo_nguon.map((g) => g.ma);
  const d20 = r.theo_ngay.find((x) => x.ngay === '2026-10-20');
  const d21 = r.theo_ngay.find((x) => x.ngay === '2026-10-21');
  assert.deepEqual(ma(d20), ['DT-A', 'DT-B', 'NOI_TINH'].sort((a, b) => (d20.theo_nguon.find((g) => g.ma === b).shbg - d20.theo_nguon.find((g) => g.ma === a).shbg) || (a < b ? -1 : 1)));
  assert.ok(!ma(d20).includes('KHONG_RO_NGUON'));
  const nt = d20.theo_nguon.find((g) => g.ma === 'NOI_TINH');
  assert.equal(nt.ten, 'Nội tỉnh · các điểm khác'); assert.equal(nt.shbg, 1); // N1 (có đường thư DT-A nhưng nơi gửi 53…)
  const a = d20.theo_nguon.find((g) => g.ma === 'DT-A');
  assert.equal(a.ten, 'Đường thư A');
  assert.equal(a.shbg, 5); // A1 A2 A3 A4 A5 (N1 không ở đây)
  assert.deepEqual(TT5.map((t) => a.trang_thai[t].shbg), [1, 1, 0, 1, 2]);
  assert.equal(a.trang_thai.dang_cho_chuyen.shbg, 0);
  assert.equal(a.ro_lai, 3, 'ro_lai = t3 + t4 + t5');
  assert.equal(a.truot_chuyen, 4, 'A2 + A3 + A4 đi trượt chuyến, A5 chưa đi và lỡ chuyến');
  // ngày 21: K1 không rõ nguồn, N2 NOI_TINH (từ 531120 nhưng đích khác Thuận Hóa), hàng hoàn H1 không có mặt
  assert.deepEqual(ma(d21).sort(), ['DT-B', 'KHONG_RO_NGUON', 'NOI_TINH']);
  assert.equal(d21.theo_nguon.find((g) => g.ma === 'KHONG_RO_NGUON').ten, 'Không rõ nguồn');
  assert.equal(d21.theo_nguon.find((g) => g.ma === 'DT-B').trang_thai.dang_cho_chuyen.shbg, 1);
  assert.equal(d21.theo_nguon.find((g) => g.ma === 'DT-B').shbg, 0, 'shbg của nhóm chỉ gồm t1…t5; đang chờ chuyến tách riêng');
  assert.ok(!JSON.stringify(d21.theo_nguon).includes('H1'));
  // sắp xếp giảm dần theo shbg ở mọi cấp
  for (const lst of [...r.theo_ngay.map((n) => n.theo_nguon), r.tong_cong.theo_nguon]) {
    for (let i = 1; i < lst.length; i++) assert.ok(lst[i - 1].shbg >= lst[i].shbg);
  }
  // mẫu rút gọn của một nhóm
  assert.deepEqual(Object.keys(a).sort(), ['dat_khong_dat', 'kg', 'ma', 'ro_lai', 'shbg', 'ten', 'theo_bcvh', 'trang_thai', 'truot_chuyen']);
  assert.deepEqual(Object.keys(a.dat_khong_dat).sort(), ['dat', 'khong_dat', 'ty_le_dat']);
  assert.deepEqual(Object.keys(a.theo_bcvh[TH]).sort(), ['kg', 'khong_dat', 'ro_lai', 'shbg', 'truot_chuyen']);
});

test('cộng khớp ở mọi cấp: Σ nhóm = khối tổng ngày (t1…t5, đang chờ chuyến, kg); Σ theo_bcvh trong nhóm = nhóm; Σ nhóm theo từng BCVH = khối BCVH; ro_lai = t3+t4+t5; truot_chuyen = trượt + lỡ; tong_cong cộng các ngày', async () => {
  duLieu();
  const r = await lt();
  const kiem = (ten, khoi, nhoms) => {
    for (const t of [...TT5, 'dang_cho_chuyen']) {
      assert.equal(tong(nhoms, (g) => g.trang_thai[t].shbg), khoi.trang_thai[t].shbg, `${ten} ${t} shbg`);
      gan(tong(nhoms, (g) => g.trang_thai[t].kg), khoi.trang_thai[t].kg, `${ten} ${t} kg`);
    }
    gan(tong(nhoms, (g) => g.kg), tong(TT5, (t) => khoi.trang_thai[t].kg), `${ten} kg (năm trạng thái)`);
    assert.equal(tong(nhoms, (g) => g.shbg), tong(TT5, (t) => khoi.trang_thai[t].shbg), `${ten} shbg`);
    assert.equal(tong(nhoms, (g) => g.ro_lai), khoi.trang_thai.t3.shbg + khoi.trang_thai.t4.shbg + khoi.trang_thai.t5.shbg, `${ten} ro_lai`);
    assert.equal(tong(nhoms, (g) => g.truot_chuyen), khoi.dung_chuyen.truot_chuyen + khoi.dung_chuyen.lo_chuyen, `${ten} truot_chuyen`);
    assert.equal(tong(nhoms, (g) => g.dat_khong_dat.dat), khoi.dat_khong_dat.dat, `${ten} dat`);
    assert.equal(tong(nhoms, (g) => g.dat_khong_dat.khong_dat), khoi.dat_khong_dat.khong_dat, `${ten} khong_dat`);
  };
  const cap = [...r.theo_ngay.map((n) => [n.ngay, n.tong, n.theo_nguon, n.theo_bcvh]), ['tong_cong', r.tong_cong, r.tong_cong.theo_nguon, r.tong_cong.theo_bcvh]];
  for (const [ten, khoi, nhoms, bcvh] of cap) {
    kiem(ten, khoi, nhoms);
    for (const g of nhoms) { // Σ theo_bcvh trong nhóm = nhóm
      const b = Object.values(g.theo_bcvh);
      assert.equal(tong(b, (x) => x.shbg), g.shbg, `${ten} ${g.ma} Σ bcvh shbg`);
      gan(tong(b, (x) => x.kg), g.kg, `${ten} ${g.ma} Σ bcvh kg`);
      assert.equal(tong(b, (x) => x.ro_lai), g.ro_lai, `${ten} ${g.ma} Σ bcvh ro_lai`);
      assert.equal(tong(b, (x) => x.truot_chuyen), g.truot_chuyen, `${ten} ${g.ma} Σ bcvh truot`);
      assert.equal(tong(b, (x) => x.khong_dat), g.dat_khong_dat.khong_dat, `${ten} ${g.ma} Σ bcvh khong_dat`);
    }
    for (const m of [TH, HT]) { // Σ nhóm theo từng BCVH = khối BCVH
      const k = bcvh[m];
      const bn = nhoms.map((g) => g.theo_bcvh[m] || { shbg: 0, kg: 0, ro_lai: 0, truot_chuyen: 0, khong_dat: 0 });
      assert.equal(tong(bn, (x) => x.shbg), tong(TT5, (t) => k.trang_thai[t].shbg), `${ten} ${m} shbg`);
      gan(tong(bn, (x) => x.kg), tong(TT5, (t) => k.trang_thai[t].kg), `${ten} ${m} kg`);
      assert.equal(tong(bn, (x) => x.ro_lai), k.trang_thai.t3.shbg + k.trang_thai.t4.shbg + k.trang_thai.t5.shbg, `${ten} ${m} ro_lai`);
      assert.equal(tong(bn, (x) => x.truot_chuyen), k.dung_chuyen.truot_chuyen + k.dung_chuyen.lo_chuyen, `${ten} ${m} truot`);
      assert.equal(tong(bn, (x) => x.khong_dat), k.dat_khong_dat.khong_dat, `${ten} ${m} khong_dat`);
    }
  }
  // ghép nhiều ngày = tính một lần cả khoảng (kg và theo_nguon cũng khớp)
  Api.xoaCache();
  assert.deepEqual(r.tong_cong.theo_nguon, JSON.parse(JSON.stringify(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22' }).tong_cong.theo_nguon)));
  assert.equal(r.tong_cong.kg, JSON.parse(JSON.stringify(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22' }).tong_cong.kg)));
});

test('ngày trống và chưa có dữ liệu: các trường mới có mặt với giá trị 0 / mảng rỗng, không lỗi', async () => {
  duLieu();
  const r = await lt('?tu=2026-09-01&den=2026-09-02');
  assert.equal(r.theo_ngay[0].tong.kg, 0);
  assert.deepEqual(r.theo_ngay[0].theo_nguon, []);
  assert.deepEqual(r.tong_cong.theo_nguon, []);
  assert.equal(r.tong_cong.kg, 0);
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  Api.xoaCache();
  const rong = await lt();
  assert.equal(rong.tong_cong, null);
  assert.equal(rong.theo_ngay[0].tong.kg, 0);
  assert.deepEqual(rong.theo_ngay[0].theo_nguon, []);
});

// ---------- chi-tiet ----------
const SNAKE17 = ['shbg', 'duong_thu_den_ma', 'duong_thu_den_ten', 'gio_quet_tui_den', 'gio_xac_nhan_bd10_den', 'kg', 'ma_bcvh', 'ten_bcvh', 'chuyen_lien_ke', 'gio_xuat_phat', 'han_den_muon_nhat', 'gio_lap_bd10_di', 'gio_cho_gio', 'dat_khong_dat', 'phan_loai', 'trang_thai', 'ngay_luu_thoat'];
const ct = async (q) => (await goi(`/api/ktt/chi-tiet${Q20}&${q}`)).body;
const tatCa = async (q) => {
  const ra = [];
  for (let p = 1; ; p++) { const b = await ct(`${q}&page=${p}&page_size=2`); ra.push(...b.items); if (p >= b.pagination.total_pages) return { items: ra, total: b.pagination.total }; }
};

test('chi-tiet: dòng có ĐỦ 17 trường snake_case của sheet 7 (cùng giá trị với file xlsx); trường cũ giữ nguyên; không có dữ liệu cá nhân', async () => {
  duLieu();
  const b = await ct('loai=t1');
  const a1 = b.items.find((i) => i.shbg === 'KTT-DEMO-A1');
  for (const k of SNAKE17) assert.ok(k in a1, `thiếu ${k}`);
  assert.deepEqual(a1.duong_thu_den_ma, 'DT-A'); assert.equal(a1.duong_thu_den_ten, 'Đường thư A');
  assert.equal(a1.gio_quet_tui_den, '2026-10-20 05:30:00'); assert.equal(a1.gio_xac_nhan_bd10_den, '2026-10-20 05:30:00');
  assert.equal(a1.kg, 1); assert.equal(a1.ma_bcvh, TH); assert.equal(a1.ten_bcvh, 'Thuận Hóa');
  assert.equal(a1.chuyen_lien_ke, 'Thuận Hóa 07:00 (20/10/2026)'); assert.equal(a1.gio_xuat_phat, '2026-10-20 07:00:00'); assert.equal(a1.han_den_muon_nhat, '2026-10-20 06:00:00');
  assert.equal(a1.gio_lap_bd10_di, '2026-10-20 06:50:00'); assert.equal(a1.dat_khong_dat, 'Đạt'); assert.equal(a1.phan_loai, 'Đã phân loại 5 trạng thái');
  assert.match(a1.trang_thai, /^1 – /); assert.equal(a1.ngay_luu_thoat, '2026-10-20');
  // trường cũ còn nguyên
  assert.equal(a1.trangThai, 'T1'); assert.equal(a1.datKhongDat, 'DAT'); assert.equal(a1.maBcvh, TH);
  assert.ok(!/lai_xe|bien_so|nguoi|user|password|hrm/i.test(JSON.stringify(b)));
  // hàng thiếu giờ quét đến: «Không tính»; hàng hoàn: «Loại trừ»
  assert.equal((await ct('loai=khong_co_gio_quet_den')).items[0].dat_khong_dat, 'Không tính');
  assert.equal((await ct('loai=hang_hoan')).items[0].dat_khong_dat, 'Loại trừ');
  // A3 thiếu khối lượng -> kg null ở dòng (trống), đúng 0 ở tổng
  assert.equal((await ct('loai=t4')).items[0].kg, null);
});

test('chi-tiet loai=ro_lai và truot_chuyen: đúng tập SHBG; tổng khớp ô tương ứng của luu-thoat; loai cũ giữ nguyên', async () => {
  duLieu();
  const r = await lt();
  const roLai = await tatCa('loai=ro_lai');
  assert.deepEqual(roLai.items.map((i) => i.shbg).sort(), ['KTT-DEMO-A3', 'KTT-DEMO-A4', 'KTT-DEMO-A5'].sort());
  assert.ok(roLai.items.every((i) => ['T3', 'T4', 'T5'].includes(i.trangThai)));
  assert.equal(roLai.total, r.tong_cong.trang_thai.t3.shbg + r.tong_cong.trang_thai.t4.shbg + r.tong_cong.trang_thai.t5.shbg);
  const truot = await tatCa('loai=truot_chuyen');
  assert.equal(truot.total, r.tong_cong.dung_chuyen.truot_chuyen + r.tong_cong.dung_chuyen.lo_chuyen);
  assert.deepEqual(truot.items.map((i) => i.shbg).sort(), ['KTT-DEMO-A2', 'KTT-DEMO-A3', 'KTT-DEMO-A4', 'KTT-DEMO-A5'].sort());
  assert.ok(truot.items.every((i) => ['TRUOT', 'LO'].includes(i.ketQuaChuyen) && i.trangThai !== 'DANG_CHO_CHUYEN'));
  // phân trang ổn định: ghép các trang cỡ 2 = một trang cỡ 200
  const mot = (await ct('loai=truot_chuyen&page_size=200')).items.map((i) => i.shbg);
  assert.deepEqual(truot.items.map((i) => i.shbg), mot);
  // loai cũ vẫn chạy
  assert.equal((await goi(`/api/ktt/chi-tiet${Q20}&loai=lo_chuyen&page_size=200`)).status, 200);
  assert.equal((await goi(`/api/ktt/chi-tiet${Q20}&loai=t1`)).status, 200);
  assert.ok((await goi('/api/ktt/meta')).body.loai_chi_tiet.includes('ro_lai'));
});

test('chi-tiet: nguon và ma_bcvh lọc đúng; tổng khớp ô của theo_nguon; nguon + loai cũ hoặc nguon sai định dạng -> 400, bảng còn nguyên', async () => {
  duLieu();
  const r = await lt();
  const g = (ma) => r.tong_cong.theo_nguon.find((x) => x.ma === ma);
  for (const [loai, lay] of [['t1', (x) => x.trang_thai.t1.shbg], ['t5', (x) => x.trang_thai.t5.shbg], ['ro_lai', (x) => x.ro_lai], ['truot_chuyen', (x) => x.truot_chuyen], ['khong_dat', (x) => x.dat_khong_dat.khong_dat], ['dat', (x) => x.dat_khong_dat.dat]]) {
    for (const ma of r.tong_cong.theo_nguon.map((x) => x.ma)) {
      const b = await ct(`loai=${loai}&nguon=${ma}&page_size=200`);
      assert.equal(b.pagination.total, lay(g(ma)), `${loai} ${ma}`);
      assert.ok(b.items.every((i) => (ma === 'NOI_TINH' ? true : ['DT-A', 'DT-B'].includes(ma) ? i.duong_thu_den_ma === ma : true)), `${loai} ${ma}`);
    }
  }
  assert.deepEqual((await ct('loai=t1&nguon=NOI_TINH')).items.map((i) => i.shbg).sort(), ['KTT-DEMO-N1', 'KTT-DEMO-N2']);
  assert.deepEqual((await ct('loai=t1&nguon=DT-A&ma_bcvh=' + TH)).items.map((i) => i.shbg), ['KTT-DEMO-A1']);
  assert.deepEqual((await ct('loai=t1&nguon=DT-B&ma_bcvh=' + TH)).items, []);
  const khongRo = await ct('loai=t1&nguon=KHONG_RO_NGUON&page_size=200');
  assert.deepEqual(khongRo.items.map((i) => i.shbg), ['KTT-DEMO-K1']);
  assert.equal((await ct('loai=t1&ma_bcvh=' + HT + '&page_size=200')).items.every((i) => i.ma_bcvh === HT), true);
  // 400
  const truoc = [db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c];
  const xau = ["x'; DROP TABLE ktt_tui; --", 'DT-A OR 1=1', 'a'.repeat(41), '<script>', 'DT-A%00'];
  for (const x of xau) {
    const rr = await goi(`/api/ktt/chi-tiet${Q20}&loai=t1&nguon=${encodeURIComponent(x)}`);
    assert.equal(rr.status, 400, x);
    assert.match(rr.body.error, /"nguon"/);
    assert.match(rr.body.ma, /^KTT_/);
    assert.ok(!/SQLITE|stack|node_modules/i.test(JSON.stringify(rr.body)));
    assert.equal((await goi(`/api/ktt/xuat/luu-thoat${Q20}&nguon=${encodeURIComponent(x)}`)).status, 400, x);
  }
  const cu = await goi(`/api/ktt/chi-tiet${Q20}&loai=lo_chuyen&nguon=DT-A`);
  assert.equal(cu.status, 400); assert.match(cu.body.error, /chỉ dùng với các nhóm lưu thoát/);
  assert.equal((await goi(`/api/ktt/chi-tiet${Q20}&loai=t1&nguon=DT-A&nguon=DT-B`)).status, 400);
  assert.deepEqual([db.prepare('SELECT COUNT(*) c FROM ktt_tui').get().c, db.prepare('SELECT COUNT(*) c FROM ktt_buu_gui').get().c], truoc);
});

// ---------- xuat ----------
test('xuat/luu-thoat với ma_bcvh / nguon: số dòng sheet 7 = tổng ô tương ứng; sheet «Thông tin» ghi bộ lọc; dòng đối chiếu khớp', async () => {
  duLieu();
  const r = await lt();
  const caso = [
    ['', null], [`&ma_bcvh=${TH}`, 'tong+hoan'], [`&ma_bcvh=${HT}`, 'tong'], ['&nguon=DT-A&trang_thai=ro_lai', null], ['&nguon=DT-A&trang_thai=truot_chuyen', null], ['&nguon=NOI_TINH&trang_thai=t1', null],
    [`&nguon=DT-A&ma_bcvh=${TH}&trang_thai=truot_chuyen`, null], [`&ma_bcvh=${TH}&trang_thai=ro_lai`, null], [`&ma_bcvh=${TH}&trang_thai=hang_hoan`, null], ['&trang_thai=ro_lai', null], ['&trang_thai=truot_chuyen', null]
  ];
  for (const [q, _] of caso) {
    const { dong, tt } = await docXuat(`/api/ktt/xuat/luu-thoat${Q20}${q}`);
    const p = new URLSearchParams(q);
    const mong = X.soKhop(r, { nhom: p.get('trang_thai'), maBcvh: p.get('ma_bcvh'), nguon: p.get('nguon') });
    assert.notEqual(mong, null, q);
    assert.equal(dong.length, mong, `số dòng ${q}`);
    assert.equal(tt.get('Số dòng kiểm tra'), dong.length, q);
    assert.match(tt.get('Đối chiếu với màn hình Lưu thoát'), /khớp số dòng/, q);
    assert.match(tt.get('Cửa sổ'), new RegExp(`BCVH: ${p.get('ma_bcvh') || 'không'}`), q);
    assert.match(tt.get('Cửa sổ'), new RegExp(`nguồn: ${p.get('nguon') || 'không'}`), q);
    // mỗi dòng nằm trong chi-tiet cùng bộ lọc (khi có trang_thai)
    if (p.get('trang_thai')) {
      const c = await tatCa(`loai=${p.get('trang_thai')}${p.get('nguon') ? `&nguon=${p.get('nguon')}` : ''}${p.get('ma_bcvh') ? `&ma_bcvh=${p.get('ma_bcvh')}` : ''}`);
      assert.deepEqual([...dong].sort(), c.items.map((i) => i.shbg).sort(), q);
    }
  }
  // lọc theo BCVH Thuận Hóa gồm cả hàng hoàn (đích Thuận Hóa); Hương Trà thì không
  const th = (await docXuat(`/api/ktt/xuat/luu-thoat${Q20}&ma_bcvh=${TH}`)).dong;
  assert.ok(th.includes('KTT-DEMO-H1'));
  const ht = (await docXuat(`/api/ktt/xuat/luu-thoat${Q20}&ma_bcvh=${HT}`)).dong;
  assert.ok(!ht.includes('KTT-DEMO-H1') && ht.includes('KTT-DEMO-B1'));
  // bộ lọc không có ô tương ứng: file vẫn đúng, dòng đối chiếu nói rõ
  const kh = await docXuat(`/api/ktt/xuat/luu-thoat${Q20}&nguon=DT-A`);
  assert.match(kh.tt.get('Đối chiếu với màn hình Lưu thoát'), /không đối chiếu được/);
  assert.ok(kh.dong.length >= 5);
  // ma_bcvh sai -> 400
  assert.equal((await goi(`/api/ktt/xuat/luu-thoat${Q20}&ma_bcvh=123456`)).status, 400);
  assert.equal((await goi(`/api/ktt/xuat/luu-thoat${Q20}&ma_bcvh=${TH}'%20OR%201=1`)).status, 400);
});

// ---------- cache, quyền ----------
test('cache: ngày đã nóng không tính lại khi gọi chi-tiet / xuat; đổi hạn đến thì ro_lai / truot_chuyen / theo_nguon đổi đúng', async () => {
  duLieu();
  await lt();
  const n = Api.thongKe().ngayTinh;
  assert.equal(n, 3);
  await lt();
  await goi(`/api/ktt/chi-tiet${Q20}&loai=ro_lai&nguon=DT-A`);
  await goi(`/api/ktt/xuat/luu-thoat${Q20}&nguon=DT-A&trang_thai=t1`);
  assert.equal(Api.thongKe().ngayTinh, n, 'không ngày nào bị tính lại');
  const truoc = (await lt()).tong_cong.theo_nguon.find((g) => g.ma === 'DT-A');
  // hạn 121 phút: A2 (quét 05:30, đi 08:00) sang chuyến 12:30 -> đúng chuyến: t2 -> t1, bớt một lượt trượt chuyến
  const goc = db.prepare("SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = 'han_den_truoc_chuyen_phut'").get().gia_tri;
  try {
    db.prepare("UPDATE ktt_lich_cau_hinh SET gia_tri = 121 WHERE khoa = 'han_den_truoc_chuyen_phut'").run();
    const sau = (await lt()).tong_cong.theo_nguon.find((g) => g.ma === 'DT-A');
    assert.equal(sau.trang_thai.t2.shbg, truoc.trang_thai.t2.shbg - 1);
    assert.equal(sau.truot_chuyen, truoc.truot_chuyen - 1);
    assert.equal(sau.ro_lai, truoc.ro_lai, 'ro_lai không đổi (A2 đi trong ngày D)');
    assert.equal((await ct('loai=truot_chuyen&nguon=DT-A&page_size=200')).pagination.total, sau.truot_chuyen);
  } finally { db.prepare("UPDATE ktt_lich_cau_hinh SET gia_tri = ? WHERE khoa = 'han_den_truoc_chuyen_phut'").run(goc); }
  // đổi giờ chốt -> da_chot đổi, theo_nguon vẫn có
  const put = (gia_tri) => fetch(`${ctx.baseUrl}/api/tham-so`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ly_do: 'Thử KTT-8c', thay_doi: [{ khoa: 'ktt_gio_chot_ngay', gia_tri }] }) });
  try {
    assert.equal((await put('15:00')).status, 200);
    const r = await lt('?tu=2026-10-20&den=2026-10-20');
    assert.equal(r.theo_ngay[0].da_chot, false);
    assert.ok(r.theo_ngay[0].theo_nguon.length >= 2);
  } finally { db.prepare("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'").run(); TS.khoiTao(db); }
});

test('quyền: luu-thoat, chi-tiet (loai mới + nguon), xuat (ma_bcvh + nguon): không token 401; ADMIN 200; TTVH 200; GDVH 403; TIVI 403', async () => {
  duLieu();
  for (const url of [`/api/ktt/luu-thoat${Q20}`, `/api/ktt/chi-tiet${Q20}&loai=ro_lai&nguon=DT-A`, `/api/ktt/xuat/luu-thoat${Q20}&ma_bcvh=${TH}&nguon=DT-A`]) {
    assert.equal((await goi(url, null)).status, 401, url);
    assert.equal((await goi(url, 'admin')).status, 200, url);
    assert.equal((await goi(url, 'ttvh')).status, 200, url);
    assert.equal((await goi(url, 'gdvh')).status, 403, url);
    assert.equal((await goi(url, 'tivi')).status, 403, url);
  }
});

test('hàm thuần kttNguon: nguonCua theo nơi gửi 53… / đường thư / thiếu; kg thiếu = 0', () => {
  assert.deepEqual(NG.nguonCua({ diemGuiDen: '533999', duongThuDenMa: 'X' }), { ma: 'NOI_TINH', ten: 'Nội tỉnh · các điểm khác' });
  assert.deepEqual(NG.nguonCua({ diemGuiDen: '599', duongThuDenMa: 'X1', duongThuDenTen: 'Tên X1' }), { ma: 'X1', ten: 'Tên X1' });
  assert.deepEqual(NG.nguonCua({ diemGuiDen: '599', duongThuDenMa: 'X1' }), { ma: 'X1', ten: 'X1' });
  assert.equal(NG.nguonCua({ diemGuiDen: null, duongThuDenMa: null }).ma, 'KHONG_RO_NGUON');
  assert.equal(NG.kgCua({ gam: null }), 0); assert.equal(NG.kgCua({ gam: 1234 }), 1.234); assert.equal(NG.thieuKhoiLuong({ gam: null }), true);
  assert.ok(NG.RE_MA_NGUON.test('DT-A') && NG.RE_MA_NGUON.test('Đường 1/2') && !NG.RE_MA_NGUON.test("a'b") && !NG.RE_MA_NGUON.test(''));
});

// ---------- hiệu năng (KTT_PERF=1) ----------
test('hiệu năng luu-thoat (KTT_PERF=1): 31 ngày dữ liệu giả — nguội 1 / 7 / 31 ngày, nóng, kèm kg và theo_nguon', { skip: process.env.KTT_PERF ? false : 'đặt KTT_PERF=1 để đo' }, async () => {
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
      const dt = `DT-${hai(rnd(40))}`;
      insTui.run(...t, 'DEN', 'KHAI_THAC_DEN', 1, quet, `BD10-D-${d}-${i}`, rnd(12) === 0 ? null : gio(d, 300 + rnd(1100)), i % 40 === 0 ? '531120' : (rnd(6) === 0 ? '533999' : '599001'), dt, `Đường thư ${dt}`, null, null, null, nx, nx);
      const shbgs = [];
      for (let k = 0; k < 10; k++) { const s = `KTT-DEMO-${d}-${i}-${k}`; shbgs.push(s); insBg.run(...t, s, rnd(10) === 0 ? null : 100 + rnd(5000), PHUONG[rnd(PHUONG.length)], null, nx, nx); nBg++; }
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
  const ms = async (f) => { const t0 = process.hrtime.bigint(); const r = await f(); return { r, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };
  const luu = (tu, den) => goi(`/api/ktt/luu-thoat?tu=${ngayStr(tu)}&den=${ngayStr(den)}`);
  Api.xoaCache(); const t1 = await ms(() => luu(10, 10)); Api.xoaCache(); const t7 = await ms(() => luu(10, 16)); Api.xoaCache(); const t31 = await ms(() => luu(0, 30));
  const nong = await ms(() => luu(0, 30));
  assert.equal(t31.r.status, 200);
  const g = t31.r.body.tong_cong.theo_nguon.length;
  const kb = Buffer.byteLength(JSON.stringify(t31.r.body)) / 1024;
  console.log(`# KTT-8c hiệu năng luu-thoat (${nTui} túi / ${nBg} dòng, 31 ngày): nguội 1 / 7 / 31 ngày = ${t1.ms.toFixed(0)} / ${t7.ms.toFixed(0)} / ${t31.ms.toFixed(0)} ms; nóng 31 ngày = ${nong.ms.toFixed(0)} ms; ${g} nhóm nguồn ở tong_cong; JSON 31 ngày ${kb.toFixed(0)} KB`);
});
