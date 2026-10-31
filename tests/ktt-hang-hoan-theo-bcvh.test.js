// ==========================================
// Test KTT-17-3b: /luu-thoat có theo_bcvh[m].hang_hoan (khối hàng hoàn CỦA TỪNG BCVH, cùng hình dạng tong_cong.hang_hoan); nhãn «Hàng chuyển hoàn»;
// items[].hang_hoan (boolean) ở chi-tiet. DB trong bộ nhớ + ensureKttSchema, dữ liệu GIẢ (SHBG KTT-DEMO-xxx, ktt_hang_hoan giả). Không mở data/, không server, không đọc .env.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const K = require('../server/lib/kttNapCap');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const X = require('../server/lib/kttXuat');
const D = require('../server/lib/kttDong');

const BCVH = ['533140', '535470', '535790', '536250', '537015', '537220'];
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
const BAY_GIO = '2026-10-23 10:00:00';
let seq = 0;

const dbMoi = () => { const db = new Database(':memory:'); ensureKttSchema(db); return db; };
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (db, ...ds) => ds.forEach((shbg) => them(db, 'ktt_hang_hoan', { shbg, ...NG }));
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg, o = {}) {
  them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 250, ma_xa_phuong: '49122', ...NG, ...o });
}
/** quet: giờ quét túi đến; gioDi: giờ lập BD10 đi (null = chưa đi); nhan: BCVH đích. */
function kt(db, shbg, { quet = '2026-10-20 05:30:00', gioDi = '2026-10-20 06:50:00', nhan = '533140', diemGui = '599001' } = {}) {
  const den = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: 'DT-A' });
  bg(db, den, shbg);
  const di = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
  bg(db, di, shbg);
}
const capOk = (db) => K.ghiCap(db, { khoa_cap: '20261023_100000', ket_qua: 'OK', nguon_xuat_luc: BAY_GIO, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
const luuThoat = (db, tu = '2026-10-20', den = '2026-10-22') => QL.luuThoatTheoNgay(db, { tuNgay: tu, denNgay: den, bayGio: BAY_GIO });

/** Dữ liệu: hoàn ở 4 BCVH (nhiều trạng thái, nhiều ngày), hàng thường ở 6 BCVH, hoàn đích ngoài 6 BCVH (không tính). */
function duLieu(db) {
  const h = [];
  const them1 = (shbg, o) => { kt(db, shbg, o); h.push(shbg); };
  them1('KTT-DEMO-H1', { nhan: '533140', gioDi: '2026-10-20 06:50:00' }); // đi trong ngày
  them1('KTT-DEMO-H2', { nhan: '533140', quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' }); // hôm sau
  them1('KTT-DEMO-H3', { nhan: '533140', quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00', diemGui: '531120' });
  them1('KTT-DEMO-H4', { nhan: '536250', quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:20:00' });
  them1('KTT-DEMO-H5', { nhan: '536250', quet: '2026-10-22 05:30:00', gioDi: null }); // chưa đi
  them1('KTT-DEMO-H6', { nhan: '537220', quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 08:00:00' });
  them1('KTT-DEMO-H7', { nhan: '535470', quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00' }); // từ 2 ngày
  kt(db, 'KTT-DEMO-HX', { nhan: '530900' }); h.push('KTT-DEMO-HX'); // đích ngoài 6 BCVH: không hoàn
  BCVH.forEach((m, i) => kt(db, `KTT-DEMO-T${i}`, { nhan: m, quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' }));
  hoan(db, ...h);
  capOk(db);
}

/** So từng lá: số cộng được thì tổng 6 khối = khối chung; bỏ ty_le* (tỷ lệ), tui (túi đến khác nhau: một túi có thể chứa hàng hoàn của nhiều BCVH nên không cộng được, chỉ kiểm ≥). */
function soSanhLa(chung, dsKhoi, duong, loi) {
  if (chung === null || typeof chung !== 'object') {
    if (typeof chung === 'number') {
      const ten = duong[duong.length - 1];
      if (/^ty_le/.test(ten)) return;
      const tong = dsKhoi.reduce((s, x) => s + x, 0);
      if (ten === 'tui') { assert.ok(tong >= chung, `${duong.join('.')}: tổng túi theo BCVH ≥ túi chung`); return; }
      if (ten === 'kg' || /^kg_|_kg$/.test(ten)) { assert.ok(Math.abs(tong - chung) < 0.0075, `${duong.join('.')}: ${tong} vs ${chung}`); return; }
      assert.equal(tong, chung, `${duong.join('.')}`);
      loi.dem++;
    } else for (const x of dsKhoi) assert.equal(x, chung, duong.join('.'));
    return;
  }
  for (const k of Object.keys(chung)) soSanhLa(chung[k], dsKhoi.map((x) => (x === null || x === undefined ? x : x[k])), [...duong, k], loi);
}

test('đẳng thức: tổng theo_bcvh[m].hang_hoan trên 6 BCVH = tong_cong.hang_hoan ở mọi trường số (một ngày, khoảng nhiều ngày, từng ngày); tong_shbg = tong_shbg_ngay − tong_shbg của m', () => {
  const db = dbMoi(); duLieu(db);
  const kq = luuThoat(db);
  const tc = kq.tong_cong;
  assert.equal(tc.hang_hoan.tong_shbg, 7);
  const loi = { dem: 0 };
  soSanhLa(tc.hang_hoan, BCVH.map((m) => tc.theo_bcvh[m].hang_hoan), ['tong_cong.hang_hoan'], loi);
  assert.ok(loi.dem > 20, `đã so ${loi.dem} trường số`);
  for (const m of BCVH) assert.equal(tc.theo_bcvh[m].hang_hoan.tong_shbg, tc.theo_bcvh[m].tong_shbg_ngay - tc.theo_bcvh[m].tong_shbg, m);
  assert.deepEqual(BCVH.map((m) => tc.theo_bcvh[m].hang_hoan.tong_shbg), [3, 1, 0, 2, 0, 1], 'H1-H3 / H7 / không / H4-H5 / không / H6');
  for (const n of kq.theo_ngay) {
    soSanhLa(n.hang_hoan, BCVH.map((m) => n.theo_bcvh[m].hang_hoan), [`${n.ngay}.hang_hoan`], { dem: 0 });
    for (const m of BCVH) assert.equal(n.theo_bcvh[m].hang_hoan.tong_shbg, n.theo_bcvh[m].tong_shbg_ngay - n.theo_bcvh[m].tong_shbg);
  }
  // ghép từng ngày = tính cả khoảng (cùng cách cache theo ngày ở kttApi)
  const ghep = QL.ghepKhoang(['2026-10-20', '2026-10-21', '2026-10-22'].map((d) => luuThoat(db, d, d)));
  assert.deepEqual(ghep.tong_cong.theo_bcvh, tc.theo_bcvh);
  // trường cũ giữ nguyên (chỉ THÊM hang_hoan)
  assert.ok(['tong_shbg', 'tong_shbg_ngay', 'trang_thai', 'dung_chuyen', 'dat_khong_dat', 'chi_tieu_14h', 'kg'].every((k) => k in tc.theo_bcvh['533140']));
  db.close();
});

test('khối hoàn của BCVH không có hoàn: ĐỦ KHÓA như tong_cong.hang_hoan, số 0, không null; danh sách hoàn rỗng → 0 ở mọi BCVH; ngày / dữ liệu rỗng cũng có khối', () => {
  const db = dbMoi(); duLieu(db);
  const tc = luuThoat(db).tong_cong;
  const khoa = (o, tien = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? khoa(v, `${tien}${k}.`) : [`${tien}${k}`]));
  const khoaChung = khoa(tc.hang_hoan).sort();
  for (const m of ['535790', '537015']) {
    const b = tc.theo_bcvh[m].hang_hoan;
    assert.notEqual(b, null); assert.equal(b.tong_shbg, 0); assert.deepEqual(khoa(b).sort(), khoaChung, m);
    assert.deepEqual(Object.values(b.trang_thai).map((x) => x.shbg), [0, 0, 0, 0, 0, 0]);
  }
  db.exec('DELETE FROM ktt_hang_hoan');
  const trong = luuThoat(db);
  for (const m of BCVH) { assert.equal(trong.tong_cong.theo_bcvh[m].hang_hoan.tong_shbg, 0, m); assert.equal(trong.tong_cong.theo_bcvh[m].tong_shbg_ngay, trong.tong_cong.theo_bcvh[m].tong_shbg); }
  assert.equal(trong.tong_cong.hang_hoan.tong_shbg, 0); assert.equal(trong.meta.hang_hoan_chua_nap, true);
  const chuaCoDl = QL.luuThoatTheoNgay(dbMoi(), { tuNgay: '2026-10-20', denNgay: '2026-10-20' });
  assert.equal(chuaCoDl.tong_cong, null, 'chưa có dữ liệu: tong_cong null (như cũ)');
  assert.deepEqual(Object.keys(chuaCoDl.theo_ngay[0].theo_bcvh['533140']).includes('hang_hoan'), true, 'ngày rỗng vẫn có khối hang_hoan theo BCVH');
  assert.equal(chuaCoDl.theo_ngay[0].theo_bcvh['533140'].hang_hoan.tong_shbg, 0);
  db.close();
});

test('API (/luu-thoat có đệm theo ngày) trả theo_bcvh[m].hang_hoan giống tính trực tiếp', async () => {
  const db = dbMoi(); duLieu(db); Api.xoaCache();
  try {
    const r = await Api.luuThoat(db, { tu: '2026-10-20', den: '2026-10-22' });
    const truc = luuThoat(db);
    for (const m of BCVH) assert.deepEqual(r.tong_cong.theo_bcvh[m].hang_hoan, truc.tong_cong.theo_bcvh[m].hang_hoan, m);
    assert.deepEqual(r.theo_ngay.map((n) => n.theo_bcvh['533140'].hang_hoan.tong_shbg), truc.theo_ngay.map((n) => n.theo_bcvh['533140'].hang_hoan.tong_shbg));
  } finally { Api.xoaCache(); }
  db.close();
});

test('nhãn «Hàng chuyển hoàn»: phan_loai của chi-tiet, xlsx sheet 7 (cột Phân loại), tiêu đề cột sheet 8; items[].hang_hoan boolean đúng; xlsx không thêm cột', () => {
  const db = dbMoi(); duLieu(db);
  assert.equal(D.NHAN_HANG_HOAN, 'Hàng chuyển hoàn');
  const ds = QL.danhSachLuuThoat(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22', nhom: 'hang_hoan', bayGio: BAY_GIO, kichThuocTrang: 200 });
  assert.equal(ds.tong, 7);
  for (const r of ds.dong) { assert.equal(r.hang_hoan, true); assert.equal(r.phan_loai, 'Hàng chuyển hoàn'); }
  const thuong = QL.danhSachLuuThoat(db, { tuNgay: '2026-10-20', denNgay: '2026-10-22', nhom: 't1', bayGio: BAY_GIO, kichThuocTrang: 200 });
  assert.ok(thuong.tong > 0);
  for (const r of thuong.dong) { assert.equal(r.hang_hoan, false); assert.notEqual(r.phan_loai, 'Hàng chuyển hoàn'); assert.equal(typeof r.hang_hoan, 'boolean'); }
  // xlsx sheet 7: dòng hoàn có nhãn mới ở cột «Phân loại»; số cột không đổi
  const cotPhanLoai = X.COT_SHEET7.findIndex((c) => c.api === 'phan_loai');
  const u = { shbg: 'KTT-DEMO-H1', maBcvh: '533140', nguonHang: 'khai_thac' };
  const o = D.dongChiTiet(u, { nhom: 'HANG_HOAN', trangThai: 'T1' });
  assert.equal(o.hang_hoan, true); assert.equal(o.phan_loai, 'Hàng chuyển hoàn');
  assert.equal(X.dongSheet7(u, { nhom: 'HANG_HOAN', trangThai: 'T1' })[cotPhanLoai], 'Hàng chuyển hoàn');
  assert.ok(!X.COT_SHEET7.some((c) => c.api === 'hang_hoan'), 'sheet 7 không có cột hang_hoan (chỉ chi-tiet)');
  assert.equal(X.COT_SHEET8.find((c) => c.api === 'hang_hoan').tieuDe, 'Hàng chuyển hoàn');
  assert.equal(D.dongChiTiet(u, { nhom: 'PHAN_LOAI', trangThai: 'T1' }).hang_hoan, false);
  db.close();
});
