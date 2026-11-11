// ==========================================
// Test KTT-RL-1: trường `ro_lai_truot_chuyen` (rớt lại, trong đó trượt chuyến) ở theo_nguon: nhóm, theo_bcvh trong nhóm, từng ngày, tong_cong.
// Định nghĩa: SHBG vừa thuộc ro_lai (t3 + t4 + t5) vừa thuộc truot_chuyen (đi trượt + chưa đi lỡ chuyến) = truot_chuyen trừ t2.
// Server thật trên DB tạm của harness; dữ liệu GIẢ (SHBG KTT-DEMO-xxx, đường thư DT-xx). Không mở data/, không DB thật, không mạng.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const K = require('../server/lib/kttNapCap');
const NG = require('../server/lib/kttNguon');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');

const PORT = 5994;
const TH = '533140'; const HT = '535470';
let ctx; let db;
let token;
const khoiPhuc = [];

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-rl1-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  seedUser(db, { hrmCode: 'KTRL1_ADMIN', fullName: 'KTRL1_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  token = (await loginAs(ctx.baseUrl, 'KTRL1_ADMIN', 'Admin@123')).body.token;
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
function them(bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (...ds) => ds.forEach((shbg) => them('ktt_hang_hoan', { shbg, nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' }));
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
/**
 * Lịch chuẩn 05/11: Thuận Hóa 07:00 / 12:45 …; Hương Trà 06:10 / 12:00. Độ mới 27/10 10:00. Mỗi loại một hoặc hai SHBG, trải trên hai đường thư và hai BCVH.
 * Ca A6 cần chuyến cách ngày đến ≥ 2 ngày; lịch chuẩn không còn BCVH nào như vậy, nên test GIẢ ĐỊNH Hương Thủy nghỉ cả Chủ nhật (đổi dòng 07:30 thành NGHI_CN trong DB tạm của file này).
 */
function duLieu() {
  db.exec("UPDATE ktt_lich_chuyen SET ngay_chay = 'NGHI_CN' WHERE ma_bcvh = '536250' AND gio_xuat_phat = '07:30'");
  kt('KTT-DEMO-A1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // t1
  kt('KTT-DEMO-A2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' }); // t2: đi trong ngày D, trượt chuyến (KHÔNG rớt lại)
  kt('KTT-DEMO-A3', { quet: '2026-10-20 23:00:00', gioDi: '2026-10-21 06:50:00' }); // t3: đi hôm sau, đúng chuyến
  kt('KTT-DEMO-A4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-21 08:00:00' }); // t4: đi hôm sau, trượt chuyến
  kt('KTT-DEMO-A5', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-23 10:00:00' }); // t5 đi trượt chuyến
  kt('KTT-DEMO-A6', { quet: '2026-10-24 14:00:00', gioDi: '2026-10-26 06:20:00', nhan: '536250' }); // t5 đi ĐÚNG chuyến: thứ Bảy sau chuyến 12:45, (giả định) Hương Thủy nghỉ cả Chủ nhật -> chuyến thứ Hai 07:30
  kt('KTT-DEMO-A7', { quet: '2026-10-20 11:00:00', nhan: null }); // t5 chưa đi, lỡ chuyến (chuyến 12:45)
  kt('KTT-DEMO-B1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-21 06:30:00', nhan: HT, duong: ['DT-B', 'Đường thư B'] }); // HT, D+1 trượt chuyến 12:00 -> t4
  kt('KTT-DEMO-B2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 12:30:00', nhan: HT, duong: ['DT-B', 'Đường thư B'] }); // HT, đi trong ngày D, trượt -> t2
  kt('KTT-DEMO-B3', { quet: '2026-10-27 08:00:00', nhan: null, duong: ['DT-B', 'Đường thư B'] }); // đang chờ chuyến 12:45 (độ mới 27/10 10:00): không rớt lại, không trượt
  kt('KTT-DEMO-N1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-23 10:00:00', nhan: HT, diemGui: '533999' }); // NOI_TINH, HT, đi muộn -> t5 trượt (ngày 21)
  kt('KTT-DEMO-H1', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-22 10:00:00', diemGui: '531120' }); // hàng hoàn: không vào theo_nguon
  hoan('KTT-DEMO-H1');
  capOk('2026-10-27 10:00:00');
}
async function goi(url) {
  const res = await fetch(`${ctx.baseUrl}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}
const Q20 = '?tu=2026-10-20&den=2026-10-27';
const tong = (ds, f) => ds.reduce((s, x) => s + f(x), 0);
const lt = async (q = Q20) => (await goi(`/api/ktt/luu-thoat${q}`)).body;
const ct = async (q) => (await goi(`/api/ktt/chi-tiet${Q20}&${q}&page_size=200`)).body;

/** Đếm ĐỘC LẬP bằng lượt duyệt chi tiết (không qua kttNguon.taoNguon): SHBG vừa t3/t4/t5 vừa trượt/lỡ, theo ngày × nhóm × BCVH. */
function demDocLap() {
  const kq = new Map(); // `${ngay}|${nguon}|${bcvh}` -> số
  const shbgs = [];
  QL.duyetLuuThoat(db, { tuNgay: '2026-10-20', denNgay: '2026-10-27', bayGio: '2026-10-27 10:00:00', khop: (k) => k.nhom === 'PHAN_LOAI' && ['T3', 'T4', 'T5'].includes(k.trangThai) && ['TRUOT', 'LO'].includes(k.chuyenKq) }, (u) => {
    const kh = `${u.ngayDen}|${NG.nguonCua(u).ma}|${u.maBcvh}`;
    kq.set(kh, (kq.get(kh) || 0) + 1);
    shbgs.push(u.shbg);
  });
  return { kq, shbgs: shbgs.sort() };
}
const demTheo = (m, loc) => [...m.entries()].filter(([k]) => loc(k.split('|'))).reduce((s, [, v]) => s + v, 0);

test('ro_lai_truot_chuyen = t4 + t5 đi trượt + t5 chưa đi lỡ chuyến = truot_chuyen − t2; không gồm t2, t3, t5 đúng chuyến, đang chờ chuyến', async () => {
  duLieu();
  const r = await lt();
  const a = r.tong_cong.theo_nguon.find((g) => g.ma === 'DT-A');
  assert.deepEqual(['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'].map((t) => a.trang_thai[t].shbg), [1, 1, 1, 1, 3, 0]);
  assert.equal(a.ro_lai, 5);
  assert.equal(a.truot_chuyen, 4, 'A2 (t2) + A4 + A5 + A7');
  assert.equal(a.ro_lai_truot_chuyen, 3, 'A4 (t4) + A5 (t5 đi trượt) + A7 (t5 lỡ)');
  assert.equal(a.ro_lai_truot_chuyen, a.truot_chuyen - a.trang_thai.t2.shbg);
  const b = r.tong_cong.theo_nguon.find((g) => g.ma === 'DT-B');
  assert.equal(b.trang_thai.dang_cho_chuyen.shbg, 1);
  assert.equal(b.ro_lai_truot_chuyen, 1, 'B1 (t4); B2 là t2, B3 đang chờ chuyến không tính');
  assert.equal(b.truot_chuyen, 2);
  assert.deepEqual(demDocLap().shbgs, ['KTT-DEMO-A4', 'KTT-DEMO-A5', 'KTT-DEMO-A7', 'KTT-DEMO-B1', 'KTT-DEMO-N1']);
  // định nghĩa khớp danh sách chi-tiet: tập truot_chuyen trừ tập t2
  const truot = (await ct('loai=truot_chuyen')).items;
  const t2 = new Set((await ct('loai=t2')).items.map((i) => i.shbg));
  assert.ok([...t2].every((s) => truot.some((i) => i.shbg === s)), 't2 là tập con của truot_chuyen');
  assert.deepEqual(truot.filter((i) => !t2.has(i.shbg)).map((i) => i.shbg).sort(), demDocLap().shbgs);
  const roLai = new Set((await ct('loai=ro_lai')).items.map((i) => i.shbg));
  assert.ok(demDocLap().shbgs.every((s) => roLai.has(s)), 'mọi SHBG của ro_lai_truot_chuyen cũng thuộc ro_lai');
});

test('bất biến ≤ và cộng khớp ở mọi cấp (nhóm, theo_bcvh trong nhóm, từng ngày, tong_cong); khớp số đếm độc lập từ danh sách chi tiết', async () => {
  duLieu();
  const r = await lt();
  const doc = demDocLap();
  const cap = [...r.theo_ngay.map((n) => [n.ngay, n.theo_nguon]), ['tong_cong', r.tong_cong.theo_nguon]];
  for (const [ten, nhoms] of cap) {
    const ngay = ten === 'tong_cong' ? () => true : (p) => p[0] === ten;
    for (const g of nhoms) {
      assert.ok(Number.isInteger(g.ro_lai_truot_chuyen), `${ten} ${g.ma} có trường`);
      assert.ok(g.ro_lai_truot_chuyen <= g.ro_lai && g.ro_lai_truot_chuyen <= g.truot_chuyen, `${ten} ${g.ma} ≤ ro_lai, ≤ truot_chuyen`);
      assert.equal(g.ro_lai_truot_chuyen, g.truot_chuyen - g.trang_thai.t2.shbg, `${ten} ${g.ma} = truot_chuyen − t2`);
      assert.equal(tong(Object.values(g.theo_bcvh), (x) => x.ro_lai_truot_chuyen), g.ro_lai_truot_chuyen, `${ten} ${g.ma} Σ theo_bcvh`);
      for (const [m, x] of Object.entries(g.theo_bcvh)) {
        assert.ok(x.ro_lai_truot_chuyen <= x.ro_lai && x.ro_lai_truot_chuyen <= x.truot_chuyen, `${ten} ${g.ma} ${m} ≤`);
        assert.equal(x.ro_lai_truot_chuyen, demTheo(doc.kq, (p) => ngay(p) && p[1] === g.ma && p[2] === m), `${ten} ${g.ma} ${m} khớp đếm độc lập`);
      }
      assert.equal(g.ro_lai_truot_chuyen, demTheo(doc.kq, (p) => ngay(p) && p[1] === g.ma), `${ten} ${g.ma} khớp đếm độc lập`);
    }
    assert.equal(tong(nhoms, (g) => g.ro_lai_truot_chuyen), demTheo(doc.kq, ngay), `${ten} Σ nhóm khớp đếm độc lập`);
  }
  assert.equal(doc.shbgs.length, tong(r.tong_cong.theo_nguon, (g) => g.ro_lai_truot_chuyen));
  // tong_cong = Σ ngày, ở cấp nhóm và cấp theo_bcvh
  const lay = (n, ma) => n.theo_nguon.find((x) => x.ma === ma);
  for (const g of r.tong_cong.theo_nguon) {
    assert.equal(g.ro_lai_truot_chuyen, tong(r.theo_ngay, (n) => (lay(n, g.ma) || { ro_lai_truot_chuyen: 0 }).ro_lai_truot_chuyen), `${g.ma} tong_cong = Σ ngày`);
    for (const m of Object.keys(g.theo_bcvh)) {
      assert.equal(g.theo_bcvh[m].ro_lai_truot_chuyen, tong(r.theo_ngay, (n) => { const x = lay(n, g.ma); return x && x.theo_bcvh[m] ? x.theo_bcvh[m].ro_lai_truot_chuyen : 0; }), `${g.ma} ${m} tong_cong = Σ ngày`);
    }
  }
  assert.equal(r.tong_cong.theo_nguon.find((g) => g.ma === 'NOI_TINH').ro_lai_truot_chuyen, 1, 'N1');
  assert.ok(!JSON.stringify(r.tong_cong.theo_nguon).includes('H1'), 'hàng hoàn không vào');
  // ghép nhiều ngày = tính một lần cả khoảng
  Api.xoaCache();
  assert.deepEqual(r.tong_cong.theo_nguon, JSON.parse(JSON.stringify(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-27' }).tong_cong.theo_nguon)));
});

test('khoảng không có dữ liệu: không có nhóm; hàm thuần congNguon cộng trường mới ở nhóm và theo_bcvh', async () => {
  duLieu();
  const r = await lt('?tu=2026-09-01&den=2026-09-02');
  assert.deepEqual(r.tong_cong.theo_nguon, []);
  const g = (n) => ({ ma: 'X', ten: 'X', shbg: n, kg: 0, trang_thai: Object.fromEntries(NG.KHOA_TT.map((t) => [t, { shbg: 0, kg: 0 }])), ro_lai: n, truot_chuyen: n, ro_lai_truot_chuyen: n, dat_khong_dat: { dat: 0, khong_dat: 0, ty_le_dat: null }, theo_bcvh: { [TH]: { shbg: n, kg: 0, ro_lai: n, truot_chuyen: n, ro_lai_truot_chuyen: n, khong_dat: 0 } } });
  const c = NG.congNguon([[g(2)], [g(3)]])[0];
  assert.equal(c.ro_lai_truot_chuyen, 5);
  assert.equal(c.theo_bcvh[TH].ro_lai_truot_chuyen, 5);
});
