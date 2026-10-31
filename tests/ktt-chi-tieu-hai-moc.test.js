// ==========================================
// Test KTT-10b: chỉ tiêu «đạt 14 giờ» đo SONG SONG hai mốc — mốc A (xnd: bd10_den_xnd -> giờ lập BD10 đi) và mốc B (quet_tui_den: gio_quet_tui_den -> giờ lập BD10 đi).
// Hàm thuần của server/lib/kttLuuThoat.js + truy vấn server/lib/kttLuuThoatQuery.js + script chỉ đọc scripts/ktt-kiem-dot-nap.js.
// DB tạm trong bộ nhớ / file tạm + ensureKttSchema, dữ liệu GIẢ (SHBG KTT-DEMO-xxxx). Không mở data/, không server, không DB thật.
// 2026-10-20 là thứ Ba; Thuận Hóa chạy 07:00, 12:30, 12:55 (nghỉ CN), 19:45, 22:00; hạn đến = giờ rời − 60 phút.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const S = require('../server/lib/kttLuuThoat');
const QL = require('../server/lib/kttLuuThoatQuery');
const KIEM = require('../scripts/ktt-kiem-dot-nap');

const TH = '533140';
const D = '2026-10-20';
const BAY_GIO = '2026-10-23 10:00:00';
const OPT = { tuNgay: D, denNgay: D, bayGio: BAY_GIO };

// ---------- dữ liệu giả (cùng mẫu tests/ktt-luu-thoat.test.js) ----------
let seq = 0;
const dbMoi = () => { const db = new Database(':memory:'); ensureKttSchema(db); return db; };
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg, o = {}) {
  them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ...NG, ...o });
}
function tuiDen(db, { quet, xnd = quet, diemGui = null, shbgs = [], phuong = '49122', bd10 = 'BD10-DEN-1' }) {
  const t = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: diemGui });
  for (const s of shbgs) bg(db, t, s, { ma_xa_phuong: phuong });
  return t;
}
function tuiDi(db, { gioDi, nhan, shbgs, phuong = '49122' }) {
  const t = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan ? 'BD10-DI-1' : null, bd10_di_ma_diem_nhan: nhan });
  for (const s of shbgs) bg(db, t, s, { ma_xa_phuong: phuong });
  return t;
}
function kt(db, shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null, hoan = false }) {
  if (hoan) them(db, 'ktt_hang_hoan', { shbg, ...NG }); // KTT-17-2: hàng hoàn = SHBG có trong ktt_hang_hoan
  tuiDen(db, { quet, xnd: xnd === undefined ? quet : xnd, diemGui, shbgs: [shbg] });
  if (gioDi || nhan) tuiDi(db, { gioDi, nhan, shbgs: [shbg] });
}
const ngayCua = (kq, d) => kq.theo_ngay.find((x) => x.ngay === d);

/** Bộ dữ liệu có đáp án tính tay (mọi SHBG đích Thuận Hóa, chỉ tiêu 14 giờ, bayGio 23/10 10:00). */
function duLieu(db) {
  kt(db, 'KTT-DEMO-S1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' }); // A đạt, B đạt
  kt(db, 'KTT-DEMO-S2', { quet: '2026-10-20 05:00:00', gioDi: '2026-10-21 14:00:01', xnd: '2026-10-20 14:00:00' }); // A 14h + 1s: không đạt; B (từ 05:00): không đạt
  kt(db, 'KTT-DEMO-S3', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', xnd: null }); // thiếu XNĐ: A không đo được; B đạt
  kt(db, 'KTT-DEMO-S4', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', xnd: '2026-10-20 08:00:00' }); // XNĐ sau giờ đi: A không đo được; B đạt
  kt(db, 'KTT-DEMO-S5', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi, không có túi đi; tới bayGio đã quá 14 giờ
  // «đi trước khi đến»: BD10 đi lập 06:00, túi đến quét 08:00 (XNĐ 05:00): A đạt, B không đo được (mốc sau giờ đi)
  tuiDen(db, { quet: '2026-10-20 08:00:00', xnd: '2026-10-20 05:00:00', shbgs: ['KTT-DEMO-S6'] });
  tuiDi(db, { gioDi: '2026-10-20 06:00:00', nhan: TH, shbgs: ['KTT-DEMO-S6'] });
  // hai túi đến: gốc 10/10, ghép 20/10 (không sau giờ đi): B theo túi ghép đạt; nếu lấy túi gốc thì không đạt
  tuiDen(db, { quet: '2026-10-10 05:30:00', shbgs: ['KTT-DEMO-S7'], bd10: 'BD10-DEN-G' });
  tuiDen(db, { quet: '2026-10-20 05:30:00', shbgs: ['KTT-DEMO-S7'], bd10: 'BD10-DEN-H' });
  tuiDi(db, { gioDi: '2026-10-20 06:50:00', nhan: TH, shbgs: ['KTT-DEMO-S7'] });
  // ngoài mẫu số: thiếu giờ quét đến (chỉ có XNĐ) và hàng hoàn
  const t = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: null, bd10_den_so_hieu: 'BD10-DEN-Z', bd10_den_xnd: '2026-10-20 07:00:00' });
  bg(db, t, 'KTT-DEMO-S8', { ma_xa_phuong: '49122' });
  tuiDi(db, { gioDi: '2026-10-20 09:00:00', nhan: TH, shbgs: ['KTT-DEMO-S8'] });
  kt(db, 'KTT-DEMO-S9', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '531120', hoan: true });
}

test('hàm thuần: danhGiaChiTieu (mốc A) không đổi — vẫn là lõi tinhTuMoc với batDau = xnd; nhãn cũ giữ nguyên', () => {
  const o = { gioLapBd10Di: '2026-10-21 14:00:00', bayGio: BAY_GIO, maBcvh: '535470' };
  const xnd = '2026-10-20 14:00:00';
  assert.deepEqual(S.danhGiaChiTieu({ xnd, ...o }), S.tinhTuMoc(xnd, o));
  assert.deepEqual(S.danhGiaChiTieu({ xnd, ...o }), { trangThai: 'DAT', thucGiay: 14 * 3600, chiTieuGio: 14 });
  assert.equal(S.danhGiaChiTieu({ xnd, ...o, gioLapBd10Di: '2026-10-21 14:00:01' }).trangThai, 'KHONG_DAT');
  assert.equal(S.danhGiaChiTieu({ xnd: null, ...o }).trangThai, 'CHUA_DO_DUOC');
  assert.equal(S.danhGiaChiTieu({ xnd: '2026-10-22 10:00:00', ...o }).trangThai, 'XND_SAU_GIO_DI');
});

test('hàm thuần: ketQuaTheoMoc tách đo được / không đo được; chưa đi quá chỉ tiêu vẫn là «chưa đi» (có cờ), không phải không đạt', () => {
  const o = { bayGio: BAY_GIO, maBcvh: '535470' };
  const kq = (batDau, gioLapBd10Di) => S.ketQuaTheoMoc(S.tinhTuMoc(batDau, { ...o, gioLapBd10Di }), !!gioLapBd10Di, !!batDau);
  assert.equal(kq('2026-10-20 14:00:00', '2026-10-21 14:00:00').trangThai, 'DAT');
  assert.equal(kq('2026-10-20 14:00:00', '2026-10-21 14:00:01').trangThai, 'KHONG_DAT');
  assert.equal(kq(null, '2026-10-21 14:00:00').trangThai, 'THIEU_MOC');
  assert.equal(kq('2026-10-22 10:00:00', '2026-10-21 14:00:00').trangThai, 'MOC_SAU_GIO_DI');
  assert.deepEqual([kq('2026-10-20 14:00:00', null).trangThai, kq('2026-10-20 14:00:00', null).chuaDiQuaChiTieu], ['CHUA_DI', true]);
  assert.deepEqual([kq('2026-10-23 09:00:00', null).trangThai, kq('2026-10-23 09:00:00', null).chuaDiQuaChiTieu], ['CHUA_DI', false]);
  assert.equal(kq(null, null).trangThai, 'THIEU_MOC', 'vừa thiếu mốc vừa chưa đi: thiếu mốc');
  assert.equal(S.hopLeMocChiTieu('xnd'), true);
  assert.equal(S.hopLeMocChiTieu('quet_tui_den'), true);
  assert.equal(S.hopLeMocChiTieu('khac'), false);
  assert.equal(S.MOC_CHI_TIEU_MAC_DINH, 'xnd');
});

test('mốc A đúng như cũ: khối dat_khong_dat không đổi nhãn / số; chi_tieu_14h.xnd khớp khối cũ (không đạt cũ = không đạt + chưa đi đã quá chỉ tiêu)', () => {
  const db = dbMoi();
  duLieu(db);
  const kq = QL.luuThoatTheoNgay(db, OPT);
  const t = ngayCua(kq, D).tong;
  assert.deepEqual({ ...t.dat_khong_dat }, { moc: 'bd10_den_xnd -> bd10_di_gio_di', dat: 3, khong_dat: 2, chua_di: 0, chua_do_duoc: 1, xnd_sau_gio_di: 1, ty_le_dat: 0.6 });
  const a = t.chi_tieu_14h.theo_moc.xnd;
  assert.equal(a.moc, 'bd10_den_xnd -> bd10_di_gio_di');
  assert.deepEqual([a.mau_so, a.do_duoc, a.dat, a.khong_dat], [7, 4, 3, 1]);
  assert.deepEqual({ ...a.khong_do_duoc }, { tong: 3, thieu_moc: 1, moc_sau_gio_di: 1, chua_di: 1 });
  assert.equal(a.chua_di_da_qua_chi_tieu, 1);
  // đối chiếu với khối cũ
  const cu = t.dat_khong_dat;
  assert.equal(cu.dat, a.dat);
  assert.equal(cu.khong_dat, a.khong_dat + a.chua_di_da_qua_chi_tieu);
  assert.equal(cu.chua_di + a.chua_di_da_qua_chi_tieu, a.khong_do_duoc.chua_di);
  assert.equal(cu.chua_do_duoc, a.khong_do_duoc.thieu_moc);
  assert.equal(cu.xnd_sau_gio_di, a.khong_do_duoc.moc_sau_gio_di);
  assert.equal(a.do_duoc + a.khong_do_duoc.tong, a.mau_so, 'đo được + không đo được = mẫu số');
  assert.equal(kq.meta.moc.chi_tieu, 'bd10_den_xnd -> bd10_di_gio_di');
  db.close();
});

test('mốc B: đo được x/y và tách lý do không đo được (mốc sau giờ lập BD10 đi, chưa đi); ty_le chỉ trên phần đo được', () => {
  const db = dbMoi();
  duLieu(db);
  const t = ngayCua(QL.luuThoatTheoNgay(db, OPT), D).tong;
  const b = t.chi_tieu_14h.theo_moc.quet_tui_den;
  assert.equal(b.moc, 'gio_quet_tui_den -> bd10_di_gio_di');
  assert.deepEqual([b.mau_so, b.do_duoc, b.dat, b.khong_dat], [7, 5, 4, 1]);
  assert.deepEqual({ ...b.khong_do_duoc }, { tong: 2, thieu_moc: 0, moc_sau_gio_di: 1, chua_di: 1 });
  assert.equal(b.chua_di_da_qua_chi_tieu, 1);
  assert.equal(b.ty_le_dat_tren_do_duoc, 4 / 5, 'tỷ lệ trên phần đo được (5), không phải trên mẫu số (7)');
  assert.equal(b.do_duoc + b.khong_do_duoc.tong, b.mau_so);
  assert.equal(t.chi_tieu_14h.mau_so, 7, 'mẫu số: SHBG đã phân loại; thiếu giờ quét đến (S8) và hàng hoàn (S9) không vào');
  db.close();
});

test('SHBG đo được ở một mốc, không đo được ở mốc kia: đếm đủ hai chiều và khớp từng nhóm', () => {
  const db = dbMoi();
  duLieu(db);
  const c = ngayCua(QL.luuThoatTheoNgay(db, OPT), D).tong.chi_tieu_14h;
  assert.equal(c.theo_moc.xnd.do_duoc_khong_do_duoc_o_moc_kia, 1, 'S6: đi trước khi đến — có XNĐ, mốc quét đến sau giờ đi');
  assert.equal(c.theo_moc.quet_tui_den.do_duoc_khong_do_duoc_o_moc_kia, 2, 'S3 thiếu XNĐ, S4 XNĐ sau giờ đi');
  assert.equal(c.do_duoc_ca_hai_moc, 3, 'S1, S2, S7');
  assert.equal(c.do_duoc_ca_hai_moc + c.theo_moc.xnd.do_duoc_khong_do_duoc_o_moc_kia, c.theo_moc.xnd.do_duoc);
  assert.equal(c.do_duoc_ca_hai_moc + c.theo_moc.quet_tui_den.do_duoc_khong_do_duoc_o_moc_kia, c.theo_moc.quet_tui_den.do_duoc);
  db.close();
});

test('túi đến: SHBG có 2 túi đến chọn túi ghép (không sau giờ đi); đếm ghép khác gốc và số bị ảnh hưởng nếu dùng túi gốc; SHBG không có túi đi', () => {
  const db = dbMoi();
  duLieu(db);
  const q = ngayCua(QL.luuThoatTheoNgay(db, OPT), D).tong.chi_tieu_14h.chat_luong_tui_den;
  assert.deepEqual({ ...q }, { khong_co_tui_di: 1, nhieu_tui_den: 1, tui_den_ghep_khac_goc: 1, khac_ket_qua_neu_dung_tui_goc: 1 });
  // S7: túi ghép (20/10 05:30) ra «đạt» ở B; nếu lấy túi gốc (10/10 05:30) thì không đạt -> đúng 1 SHBG khác kết quả
  assert.equal(ngayCua(QL.luuThoatTheoNgay(db, OPT), D).tong.chi_tieu_14h.theo_moc.quet_tui_den.dat, 4);
  db.close();
});

test('túi đến trùng giờ hoặc ghép sai: hai túi đến cùng giờ quét → khác id nhưng cùng kết quả (không tính là khác kết quả); hai túi đến đều sau giờ đi → mốc sau giờ đi', () => {
  const db = dbMoi();
  tuiDen(db, { quet: '2026-10-20 05:30:00', shbgs: ['KTT-DEMO-TR'], bd10: 'BD10-DEN-1' });
  tuiDen(db, { quet: '2026-10-20 05:30:00', shbgs: ['KTT-DEMO-TR'], bd10: 'BD10-DEN-2' });
  tuiDi(db, { gioDi: '2026-10-20 06:50:00', nhan: TH, shbgs: ['KTT-DEMO-TR'] });
  tuiDen(db, { quet: '2026-10-20 09:00:00', shbgs: ['KTT-DEMO-SAU'], bd10: 'BD10-DEN-3' });
  tuiDen(db, { quet: '2026-10-20 10:00:00', shbgs: ['KTT-DEMO-SAU'], bd10: 'BD10-DEN-4' });
  tuiDi(db, { gioDi: '2026-10-20 08:00:00', nhan: TH, shbgs: ['KTT-DEMO-SAU'] });
  const c = ngayCua(QL.luuThoatTheoNgay(db, OPT), D).tong.chi_tieu_14h;
  assert.equal(c.chat_luong_tui_den.nhieu_tui_den, 2);
  assert.equal(c.chat_luong_tui_den.khac_ket_qua_neu_dung_tui_goc, 0, 'cùng giờ quét: chọn túi nào cũng ra cùng kết quả');
  assert.equal(c.theo_moc.quet_tui_den.khong_do_duoc.moc_sau_gio_di, 1, 'mọi túi đến đều sau giờ đi: không chọn được túi hợp lệ');
  assert.equal(c.theo_moc.quet_tui_den.dat, 1);
  db.close();
});

test('SHBG chưa đi: không đo được ở CẢ hai mốc, kể cả khi đã quá chỉ tiêu; đổi bayGio không làm nó thành đo được', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-CD', { quet: '2026-10-20 11:00:00', nhan: null });
  for (const bayGio of ['2026-10-20 12:00:00', BAY_GIO]) {
    const c = ngayCua(QL.luuThoatTheoNgay(db, { ...OPT, bayGio }), D).tong.chi_tieu_14h;
    for (const m of ['xnd', 'quet_tui_den']) assert.deepEqual([c.theo_moc[m].do_duoc, c.theo_moc[m].khong_do_duoc.chua_di], [0, 1], `${m} ${bayGio}`);
    assert.equal(c.theo_moc.xnd.chua_di_da_qua_chi_tieu, bayGio === BAY_GIO ? 1 : 0);
    assert.equal(c.theo_moc.xnd.ty_le_dat_tren_do_duoc, null, 'đo được 0: không có tỷ lệ');
  }
  db.close();
});

test('đổi tham số mốc: không đổi kết quả của mốc kia; mặc định = xnd = hành vi cũ; chỉ khối dat_khong_dat đổi mốc nuôi', () => {
  const db = dbMoi();
  duLieu(db);
  const mac = QL.luuThoatTheoNgay(db, OPT);
  const xnd = QL.luuThoatTheoNgay(db, { ...OPT, mocChiTieu: 'xnd' });
  const b = QL.luuThoatTheoNgay(db, { ...OPT, mocChiTieu: 'quet_tui_den' });
  assert.deepEqual(mac, xnd, 'không truyền = xnd');
  const kA = ngayCua(mac, D).tong;
  const kB = ngayCua(b, D).tong;
  // cả hai mốc song song giống hệt nhau, bất kể tham số
  assert.deepEqual(kB.chi_tieu_14h.theo_moc, kA.chi_tieu_14h.theo_moc);
  assert.equal(kA.chi_tieu_14h.moc_mac_dinh, 'xnd');
  assert.equal(kB.chi_tieu_14h.moc_mac_dinh, 'quet_tui_den');
  // khối cũ nay nuôi bằng mốc B (nhãn cũ: thiếu mốc -> chua_do_duoc, mốc sau giờ đi -> xnd_sau_gio_di)
  assert.deepEqual({ ...kB.dat_khong_dat }, { moc: 'gio_quet_tui_den -> bd10_di_gio_di', dat: 4, khong_dat: 2, chua_di: 0, chua_do_duoc: 0, xnd_sau_gio_di: 1, ty_le_dat: 4 / 6 });
  assert.equal(b.meta.moc.chi_tieu, 'gio_quet_tui_den -> bd10_di_gio_di');
  // mọi phần khác không đổi: năm trạng thái, lưu thoát, đúng chuyến, tổng
  for (const k of ['trang_thai', 'luu_thoat', 'dung_chuyen', 'chi_tiet_trang_thai_5', 'tong_shbg', 'khong_phan_loai', 'kg']) assert.deepEqual(kB[k], kA[k], k);
  assert.deepEqual(b.theo_ngay[0].hang_hoan.trang_thai, mac.theo_ngay[0].hang_hoan.trang_thai);
  // sai giá trị: lỗi tiếng Việt có mã
  assert.throws(() => QL.luuThoatTheoNgay(db, { ...OPT, mocChiTieu: 'khac' }), (e) => e.code === 'KTT_MOC_SAI' && /mocChiTieu/.test(e.message));
  db.close();
});

test('cộng nhiều ngày và ghép từng ngày: tong_cong.chi_tieu_14h = cộng các ngày; ghepKhoang(từng ngày) = tính cả khoảng; theo_bcvh khớp tổng', () => {
  const db = dbMoi();
  duLieu(db);
  kt(db, 'KTT-DEMO-N2', { quet: '2026-10-21 05:30:00', gioDi: '2026-10-21 06:50:00' });
  const tatCa = QL.luuThoatTheoNgay(db, { tuNgay: D, denNgay: '2026-10-21', bayGio: BAY_GIO });
  const ghep = QL.ghepKhoang([QL.luuThoatTheoNgay(db, OPT), QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-21', denNgay: '2026-10-21', bayGio: BAY_GIO })]);
  assert.deepEqual(ghep.tong_cong.chi_tieu_14h, tatCa.tong_cong.chi_tieu_14h);
  const c = tatCa.tong_cong.chi_tieu_14h;
  assert.equal(c.mau_so, 8);
  assert.equal(c.theo_moc.xnd.dat, 4);
  assert.equal(c.theo_moc.quet_tui_den.dat, 5);
  assert.equal(c.theo_moc.quet_tui_den.ty_le_dat_tren_do_duoc, 5 / 6);
  assert.deepEqual(tatCa.tong_cong.theo_bcvh[TH].chi_tieu_14h, c, 'mọi SHBG đích Thuận Hóa');
  assert.deepEqual(tatCa.tong_cong.theo_bcvh['535470'].chi_tieu_14h.theo_moc.xnd.do_duoc, 0);
  assert.equal(ngayCua(tatCa, '2026-10-21').tong.chi_tieu_14h.mau_so, 1);
  db.close();
});

test('hàng hoàn Tổ KHHH có khối chi_tieu_14h riêng (chỉ để xem), không vào mẫu số của tổng; ngày không có dữ liệu: số 0 và tỷ lệ null', () => {
  const db = dbMoi();
  duLieu(db);
  const n = ngayCua(QL.luuThoatTheoNgay(db, OPT), D);
  assert.equal(n.hang_hoan.chi_tieu_14h.mau_so, 1);
  assert.equal(n.tong.chi_tieu_14h.mau_so, 7);
  const rong = ngayCua(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-25', denNgay: '2026-10-25', bayGio: BAY_GIO }), '2026-10-25');
  assert.equal(rong.tong.chi_tieu_14h.mau_so, 0);
  assert.equal(rong.tong.chi_tieu_14h.theo_moc.xnd.ty_le_dat_tren_do_duoc, null);
  // chưa có dữ liệu: khối rỗng vẫn có đủ cấu trúc và mốc mặc định
  const chuaCo = QL.luuThoatTheoNgay(dbMoi(), { tuNgay: D, denNgay: D });
  assert.equal(chuaCo.theo_ngay[0].tong.chi_tieu_14h.moc_mac_dinh, 'xnd');
  db.close();
});

test('không đổi các số đang hiển thị: danh sách chi-tiet theo nhóm «không đạt» vẫn tính theo mốc A như trước KTT-10b', () => {
  const db = dbMoi();
  duLieu(db);
  const ds = QL.danhSachLuuThoat(db, { tuNgay: D, denNgay: D, nhom: 'khong_dat', bayGio: BAY_GIO });
  assert.equal(ds.tong, 2, 'S2 (không đạt) và S5 (chưa đi, đã quá chỉ tiêu) — như trước KTT-10b');
  // kiểm tĩnh «không dùng giờ máy» của kttLuuThoat.js đã có ở tests/ktt-luu-thoat.test.js (chạy cả với mã KTT-10b)
  db.close();
});

// ---------- script kiểm chỉ đọc (mục 5.4) ----------
const SCRIPT = path.join(__dirname, '..', 'scripts', 'ktt-kiem-dot-nap.js');
function taoDbFile() {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt-kiem-'));
  const file = path.join(thuMuc, 'ban-chep.db');
  const db = new Database(file); ensureKttSchema(db);
  duLieu(db);
  // nhật ký giả: một cặp OK, một cặp bị từ chối, hai file
  db.prepare("INSERT INTO ktt_nap_cap (khoa_cap, ten_file_tui, ten_file_buu_gui, nguon_xuat_luc, gio_min, gio_max, tui_doc, tui_them, bg_doc, ket_qua, thay_dau_luc, cap_nhat_luc) VALUES ('20261020_100000', 'KTT_Tui_20261020_100000.csv', 'KTT_BuuGui_20261020_100000.csv', '2026-10-20 10:00:00', '2026-10-20 00:00:00', '2026-10-20 09:59:00', 10, 10, 20, 'OK', '2026-10-20 10:05:00', '2026-10-20 10:05:00')").run();
  db.prepare("INSERT INTO ktt_nap_cap (khoa_cap, ten_file_tui, ma_loi, thong_bao, ket_qua, thay_dau_luc, cap_nhat_luc) VALUES ('20261020_140000', 'KTT_Tui_20261020_140000.csv', 'CSV_HONG', 'Sai CSV dòng 123456789012', 'TU_CHOI', '2026-10-20 14:05:00', '2026-10-20 14:05:00')").run();
  db.prepare("INSERT INTO ktt_nap_lan (loai, ten_file, sha256, nap_luc, so_dong_doc, so_dong_loi, trang_thai, thong_bao) VALUES ('TUI', 'KTT_Tui_20261020_140000.csv', 'abc', '2026-10-20 14:05:00', 5, 1, 'REJECTED', 'Dòng 3 sai')").run();
  db.close();
  return { thuMuc, file };
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const chay = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('script kiểm 18/10 và 20/10: chỉ đọc (DB không đổi byte nào), in bằng chứng từ nhật ký nạp và số dòng theo ngày, không in SHBG / BD10', () => {
  const { thuMuc, file } = taoDbFile();
  try {
    const truoc = sha(file);
    const r = chay('--db', file, '--ngay', '2026-10-20,2026-10-18');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(sha(file), truoc, 'DB không bị ghi');
    for (const s of ['## Ngày 2026-10-20 (thứ Ba)', '## Ngày 2026-10-18 (Chủ nhật)', 'TU_CHOI', 'CSV_HONG', 'REJECTED', 'Nhật ký nạp cặp', 'Giờ nguồn xuất', 'KHÔNG kết luận']) assert.ok(r.stdout.includes(s), s);
    assert.doesNotMatch(r.stdout, /KTT-DEMO|BD10-DEN|BD10-DI|123456789012/, 'không lộ SHBG / số hiệu BD10 / số dài');
    const j = JSON.parse(chay('--db', file, '--ngay', '2026-10-20', '--json').stdout);
    const hai0 = j[0].so_sanh.find((x) => x.ngay === '2026-10-20');
    assert.equal(hai0.tui.tong_co_gio_quet_den > 0, true);
    assert.equal(hai0.tui.khong_co_gio_quet_den_xnd_trong_ngay, 1, 'S8: chỉ có XNĐ trong ngày');
    assert.equal(j[0].nhat_ky_cap.length, 2);
    assert.equal(j[0].nhat_ky_file.length, 1);
    assert.equal(j[0].so_sanh.length, 4, 'cùng thứ tuần trước, ngày trước, ngày đó, ngày sau');
    assert.equal(j[1] === undefined, true);
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});

test('script kiểm: từ chối cờ ghi, thiếu --db, ngày sai, DB thật data/hue-dhcl.db, file không có; mã thoát 1 và thông báo tiếng Việt', () => {
  const { thuMuc, file } = taoDbFile();
  try {
    for (const args of [['--db', file, '--apply'], ['--db', file, '--delete'], [], ['--db', file, '--ngay', '2026-02-30'], ['--db', file, '--ngay', 'abc'], ['--db', path.join(__dirname, '..', 'data', 'hue-dhcl.db')], ['--db', path.join(thuMuc, 'khong-co.db')], ['--db', file, '--la']]) {
      const r = chay(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /Cách dùng/, args.join(' '));
    }
    assert.throws(() => KIEM.parseArgs(['--db', file, '--write']), /chỉ đọc/);
    assert.equal(KIEM.congNgay('2026-10-18', -7), '2026-10-11');
    assert.equal(KIEM.thuCua('2026-10-18'), 'Chủ nhật');
    assert.deepEqual(KIEM.parseArgs(['--db', file]).ngay, ['2026-10-18', '2026-10-20'], 'mặc định hai ngày 18/10 và 20/10');
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});

test('script kiểm: DB chưa có bảng KTT hoặc chưa nạp gì → vẫn chạy, báo «không có bảng» / không dòng nào, không lỗi', () => {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt-kiem-'));
  const file = path.join(thuMuc, 'trong.db');
  const db = new Database(file); db.exec('CREATE TABLE khac (x INTEGER)'); db.close();
  try {
    const r = chay('--db', file, '--ngay', '2026-10-20');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /không có bảng ktt_nap_cap/);
    assert.match(r.stdout, /không có bảng ktt_nap_lan/);
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});
