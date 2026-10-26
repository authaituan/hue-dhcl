// ==========================================
// Test KTT-7b: «Lưu thoát» — server/lib/kttLuuThoat.js (hàm thuần: năm trạng thái, đạt / không đạt, hàng hoàn Tổ KHHH, bộ cộng) và
// server/lib/kttLuuThoatQuery.js (truy vấn theo ngày). DB tạm trong bộ nhớ + ensureKttSchema, dữ liệu GIẢ (SHBG KTT-DEMO-xxxx, mã BD10 giả). Không mở data/, không server, không DB thật.
// Lịch chuyến dùng 14 dòng mặc định của KTT-7a. 2026-10-20 là thứ Ba; 24/10 thứ Bảy; 25/10 Chủ nhật; 26/10 thứ Hai.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { ensureKttSchema, DIA_BAN_PHAT_MAC_DINH } = require('../server/lib/kttSchema');
const K = require('../server/lib/kttNapCap');
const L = require('../server/lib/kttLichChuyen');
const S = require('../server/lib/kttLuuThoat');
const QL = require('../server/lib/kttLuuThoatQuery');
const Q = require('../server/lib/kttQuery');

const TH = '533140'; // Thuận Hóa: 07:00, 12:30, 12:55 (nghỉ CN), 19:45, 22:00 — hạn đến = giờ rời − 60 phút
const HT = '535470'; // Hương Trà: 06:00, 12:00
const HTHUY = '536250'; // Hương Thủy: 06:30, 12:30 (nghỉ CN)
const LICH = (() => { const db = new Database(':memory:'); ensureKttSchema(db); try { return L.docLichChuyen(db).lich; } finally { db.close(); } })();
const NGU = (bayGio = '2026-10-23 10:00:00') => ({ lich: LICH, hanPhut: 60, bayGio });
const D = '2026-10-20';

// ---------- hàm thuần ----------
const pl = (o, bayGio) => S.phanLoaiShbg({ ngayDen: D, nhom: 'BCVH_HUE', maBcvh: TH, noiGuiGoc: null, quetDen: '2026-10-20 05:30:00', gioBd10Di: null, xndBd10: '2026-10-20 05:30:00', tenPhuong: null, ...o }, NGU(bayGio));
const tt = (o, bayGio) => pl(o, bayGio).trangThai;

test('năm trạng thái: đi trong ngày D đúng / trượt chuyến (T1, T2), đi D+1 đúng / trượt (T3, T4), đi từ D+2 hoặc chưa đi mà đã lỡ chuyến (T5)', () => {
  // quét 05:30 -> chuyến 07:00 (hạn 06:00)
  assert.equal(tt({ gioBd10Di: '2026-10-20 06:50:00' }), 'T1');
  assert.equal(tt({ gioBd10Di: '2026-10-20 08:00:00' }), 'T2');
  // quét 21:30 -> chuyến 07:00 ngày D+1 (hạn 21:00 của 22:00 đã qua)
  assert.equal(tt({ quetDen: '2026-10-20 21:30:00', gioBd10Di: '2026-10-21 06:30:00' }), 'T3');
  assert.equal(tt({ quetDen: '2026-10-20 21:30:00', gioBd10Di: '2026-10-21 09:00:00' }), 'T4');
  assert.equal(tt({ gioBd10Di: '2026-10-22 10:00:00' }), 'T5', 'đi từ D+2');
  assert.equal(tt({ gioBd10Di: '2026-10-22 06:00:00' }), 'T5', 'đi từ D+2 dù đúng chuyến');
  assert.equal(tt({ quetDen: '2026-10-20 11:00:00' }), 'T5', 'chưa đi, đã quá giờ xuất phát 12:30 (bayGio 23/10)');
  assert.equal(pl({ quetDen: '2026-10-20 11:00:00' }).chuyenKq, 'LO');
});

test('«đang chờ chuyến»: chưa đi và chưa tới giờ xuất phát của chuyến thuộc — KHÔNG vào trạng thái 5; đổi bayGio thì đổi kết quả', () => {
  const o = { quetDen: '2026-10-20 11:00:00' };
  assert.equal(tt(o, '2026-10-20 12:30:00'), 'DANG_CHO_CHUYEN', 'đúng giờ xuất phát: chưa lỡ');
  assert.equal(tt(o, '2026-10-20 12:30:01'), 'T5');
  assert.equal(tt(o, '2026-10-20 09:00:00'), 'DANG_CHO_CHUYEN');
  assert.equal(pl(o, '2026-10-20 09:00:00').chuyenKq, 'CHUA_DEN_GIO');
});

test('biên ngày và chuyến: lập 23:59:59 ngày D -> T1/T2; 00:00:00 ngày D+1 -> T3/T4; đúng giờ xuất phát -> DUNG_CHUYEN; sau 1 giây -> TRUOT_CHUYEN', () => {
  const dem = { quetDen: '2026-10-20 21:30:00' }; // chuyến 07:00 ngày 21
  assert.equal(tt({ ...dem, gioBd10Di: '2026-10-20 23:59:59' }), 'T1');
  assert.equal(tt({ ...dem, gioBd10Di: '2026-10-21 00:00:00' }), 'T3');
  assert.equal(tt({ ...dem, gioBd10Di: '2026-10-21 07:00:00' }), 'T3');
  assert.equal(tt({ ...dem, gioBd10Di: '2026-10-21 07:00:01' }), 'T4');
  const ngay = { quetDen: '2026-10-20 05:30:00' }; // chuyến 07:00 ngày 20
  assert.equal(tt({ ...ngay, gioBd10Di: '2026-10-20 07:00:00' }), 'T1');
  assert.equal(tt({ ...ngay, gioBd10Di: '2026-10-20 07:00:01' }), 'T2');
  assert.equal(pl({ ...ngay, gioBd10Di: '2026-10-20 07:00:00' }).chuyenKq, 'DUNG');
  assert.equal(pl({ ...ngay, gioBd10Di: '2026-10-20 07:00:01' }).chuyenKq, 'TRUOT');
  // quét 23:59:59 ngày D (chuyến 07:00 hôm sau) đi 00:00:00 D+1 -> T3
  assert.equal(tt({ quetDen: '2026-10-20 23:59:59', gioBd10Di: '2026-10-21 00:00:00' }), 'T3');
  // BD10 lập TRƯỚC ngày đến: vẫn «lưu thoát trong ngày» (lập trước 24:00 ngày D) và gắn cờ
  const truoc = pl({ gioBd10Di: '2026-10-19 23:00:00' });
  assert.deepEqual([truoc.trangThai, truoc.diTruocKhiDen], ['T1', true]);
  assert.equal(pl({ gioBd10Di: '2026-10-20 06:00:00' }).diTruocKhiDen, false);
});

test('đến 21:30 (chuyến thuộc 07:00 hôm sau), BD10 đi 23:00 cùng ngày -> trạng thái 1 (đi trong ngày, đúng chuyến)', () => {
  const r = pl({ quetDen: '2026-10-20 21:30:00', gioBd10Di: '2026-10-20 23:00:00' });
  assert.deepEqual([r.trangThai, r.chuyenKq, r.chuyen.ngay, r.chuyen.gio_xuat_phat], ['T1', 'DUNG', '2026-10-21', '07:00']);
});

test('Chủ nhật và thứ Bảy: hàng đến Chủ nhật đi chuyến đầu tiên liền kề có xe (qua xepChuyen); Hương Thủy thứ Bảy 13:00 -> thứ Hai 06:30 (T5, đúng chuyến)', () => {
  const cn = S.phanLoaiShbg({ ngayDen: '2026-10-25', nhom: 'BCVH_HUE', maBcvh: TH, quetDen: '2026-10-25 11:40:00', gioBd10Di: '2026-10-25 19:30:00', xndBd10: '2026-10-25 11:40:00' }, NGU());
  assert.deepEqual([cn.trangThai, cn.chuyen.gio_xuat_phat], ['T1', '19:45'], 'Chủ nhật 12:55 nghỉ, 12:30 quá hạn -> 19:45');
  const t7 = S.phanLoaiShbg({ ngayDen: '2026-10-24', nhom: 'BCVH_HUE', maBcvh: HTHUY, quetDen: '2026-10-24 13:00:00', gioBd10Di: '2026-10-26 06:00:00', xndBd10: '2026-10-24 13:00:00' }, NGU());
  assert.deepEqual([t7.trangThai, t7.chuyenKq, t7.chuyen.ngay, t7.chuyen.gio_xuat_phat], ['T5', 'DUNG', '2026-10-26', '06:30']);
});

test('nhóm riêng: đích không rõ / ngoài phạm vi (530900, KHAC, KTT) / thiếu giờ quét đến / không xếp được chuyến — không vào năm trạng thái', () => {
  assert.equal(pl({ nhom: 'KHONG_RO', maBcvh: null }).nhom, 'KHONG_RO_DICH');
  for (const nhom of ['HE1_530900', 'KHAC', 'KTT']) assert.deepEqual(pl({ nhom, maBcvh: null }), { nhom: 'NGOAI_PHAM_VI', loaiDich: nhom });
  for (const q of [null, '', 'abc']) { const r = pl({ quetDen: q }); assert.deepEqual([r.nhom, r.trangThai], ['KHONG_CO_GIO_QUET_DEN', null], String(q)); }
  const r = S.phanLoaiShbg({ ngayDen: D, nhom: 'BCVH_HUE', maBcvh: HT, quetDen: '2026-10-20 05:30:00' }, { ...NGU(), lich: LICH.filter((x) => x.ma_bcvh !== HT) });
  assert.deepEqual([r.nhom, r.lyDo, r.trangThai], ['KHONG_XEP_DUOC_CHUYEN', 'KHONG_CO_LICH', null]);
});

// ---------- đạt / không đạt ----------
const dat = (o) => S.danhGiaChiTieu({ maBcvh: HT, bayGio: '2026-10-23 10:00:00', ...o });

test('đạt / không đạt: bỏ đêm 21:00–07:00 (đến 20:00, đi 08:00 hôm sau: chờ 2 giờ không kể đêm); mốc là bd10_den_xnd, không phải giờ quét đến', () => {
  const r = dat({ xnd: '2026-10-20 20:00:00', gioLapBd10Di: '2026-10-21 08:00:00' });
  assert.deepEqual([r.trangThai, r.thucGiay, r.chiTieuGio], ['DAT', 2 * 3600, 14]);
  // xác nhận lúc 22:00 (trong đêm), đi 07:00: chờ 0
  assert.equal(dat({ xnd: '2026-10-20 22:00:00', gioLapBd10Di: '2026-10-21 07:00:00' }).thucGiay, 0);
});

test('đạt / không đạt: biên 14 giờ (14:00:00 đạt, 14:00:01 không đạt)', () => {
  const xnd = '2026-10-20 14:00:00'; // 14:00 -> 21:00 = 7 giờ, 07:00 -> 14:00 hôm sau = 7 giờ
  assert.equal(dat({ xnd, gioLapBd10Di: '2026-10-21 14:00:00' }).trangThai, 'DAT');
  assert.equal(dat({ xnd, gioLapBd10Di: '2026-10-21 14:00:00' }).thucGiay, 14 * 3600);
  assert.equal(dat({ xnd, gioLapBd10Di: '2026-10-21 14:00:01' }).trangThai, 'KHONG_DAT');
});

test('đạt / không đạt: phường Thuận Hóa / Phú Xuân (theo TÊN phường) biên 12 giờ; phường khác và thiếu tên 14 giờ; BCVH khác 14 giờ', () => {
  const xnd = '2026-10-20 14:00:00';
  for (const ten of ['Phường Thuận Hóa', 'Phú Xuân', 'phường  phú xuân', 'P. Thuận Hóa']) {
    assert.equal(dat({ maBcvh: TH, tenPhuong: ten, xnd, gioLapBd10Di: '2026-10-21 12:00:00' }).trangThai, 'DAT', ten);
    assert.equal(dat({ maBcvh: TH, tenPhuong: ten, xnd, gioLapBd10Di: '2026-10-21 12:00:01' }).trangThai, 'KHONG_DAT', ten);
    assert.equal(dat({ maBcvh: TH, tenPhuong: ten, xnd, gioLapBd10Di: '2026-10-21 12:00:01' }).chiTieuGio, 12);
  }
  for (const ten of ['Phường Kim Long', null, '', 'Thuận Hòa']) assert.equal(dat({ maBcvh: TH, tenPhuong: ten, xnd, gioLapBd10Di: '2026-10-21 12:00:01' }).trangThai, 'DAT', String(ten));
  assert.equal(dat({ maBcvh: HT, tenPhuong: 'Phường Thuận Hóa', xnd, gioLapBd10Di: '2026-10-21 12:00:01' }).trangThai, 'DAT', 'ngoại lệ chỉ của BCVH Thuận Hóa');
});

test('đạt / không đạt: chưa xác nhận đến và xác nhận đến SAU khi đã đi ra nhóm riêng (số âm giữ nguyên, không làm tròn về 0)', () => {
  for (const x of [null, '', 'NULL', 'abc']) assert.equal(dat({ xnd: x, gioLapBd10Di: '2026-10-21 08:00:00' }).trangThai, 'CHUA_DO_DUOC', String(x));
  const am = dat({ xnd: '2026-10-20 10:00:00', gioLapBd10Di: '2026-10-20 09:00:00' });
  assert.deepEqual([am.trangThai, am.thucGiay], ['XND_SAU_GIO_DI', -3600]);
  assert.equal(dat({ xnd: '2026-10-20 10:00:00', gioLapBd10Di: '2026-10-20 10:00:00' }).trangThai, 'DAT', 'bằng nhau: chờ 0');
});

test('đạt / không đạt: hàng chưa đi tính tới bayGio — chưa quá chỉ tiêu là «chưa đi», quá rồi là không đạt; đổi bayGio đổi kết quả', () => {
  const xnd = '2026-10-20 14:00:00';
  assert.equal(dat({ xnd, bayGio: '2026-10-21 13:59:59' }).trangThai, 'CHUA_DI');
  assert.equal(dat({ xnd, bayGio: '2026-10-21 14:00:00' }).trangThai, 'CHUA_DI');
  assert.equal(dat({ xnd, bayGio: '2026-10-21 14:00:01' }).trangThai, 'KHONG_DAT');
  assert.equal(dat({ xnd, bayGio: '2026-10-20 13:00:00' }).trangThai, 'CHUA_DI', 'bayGio trước xác nhận đến: chưa đo');
  assert.equal(dat({ xnd, bayGio: 'sai' }).trangThai, 'CHUA_DO_DUOC');
});

// ---------- hàng hoàn Tổ KHHH ----------
test('hàng hoàn: túi đến gốc từ 531120 và đích Thuận Hóa vào nhóm riêng; 531120 đích BCVH Huế khác hoặc tỉnh khác KHÔNG vào nhóm hoàn', () => {
  const hoan = pl({ noiGuiGoc: '531120' });
  assert.deepEqual([hoan.nhom, hoan.trangThai, hoan.tu531120KhacThuanHoa], ['HANG_HOAN', 'T5', false]);
  assert.ok(hoan.datKhongDat, 'có đạt / không đạt chỉ để xem');
  const khac = pl({ noiGuiGoc: '531120', maBcvh: HT });
  assert.deepEqual([khac.nhom, khac.tu531120KhacThuanHoa], ['PHAN_LOAI', true], 'đích BCVH Huế khác Thuận Hóa: tính như hàng thường');
  assert.deepEqual(pl({ noiGuiGoc: '531120', nhom: 'KHAC', maBcvh: null }), { nhom: 'NGOAI_PHAM_VI', loaiDich: 'KHAC' }, 'đích tỉnh khác: không phải hàng hoàn');
  assert.deepEqual(pl({ noiGuiGoc: '530900', nhom: 'HE1_530900', maBcvh: null }).nhom, 'NGOAI_PHAM_VI');
  assert.equal(pl({ noiGuiGoc: '599999' }).nhom, 'PHAN_LOAI');
  assert.equal(pl({ noiGuiGoc: '531120', quetDen: null }).nhom, 'HANG_HOAN', 'hoàn thiếu giờ quét đến vẫn ở nhóm hoàn');
});

// ---------- truy vấn trên DB giả ----------
let seq = 0;
function dbMoi() { const db = new Database(':memory:'); ensureKttSchema(db); return db; }
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg, o = {}) {
  them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ...NG, ...o });
}
/** Túi ĐẾN. `diemGui` = nơi gửi BD10 đến (bd10_den_ma_diem_gui). */
function tuiDen(db, { quet, xnd = quet, diemGui = null, shbgs = [], phuong = '49122', tenPhuong = null, bd10 = 'BD10-DEN-1' }) {
  const t = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: diemGui });
  for (const s of shbgs) bg(db, t, s, { ma_xa_phuong: phuong, ten_xa_phuong: tenPhuong });
  return t;
}
function tuiDi(db, { gioDi, nhan, shbgs, phuong = '49122', quetDi = null }) {
  const t = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: quetDi || gioDi, bd10_di_so_hieu: nhan ? 'BD10-DI-1' : null, bd10_di_ma_diem_nhan: nhan });
  for (const s of shbgs) bg(db, t, s, { ma_xa_phuong: phuong });
  return t;
}
/** Một SHBG khai thác lại: túi đến (+ túi đi nếu có gioDi / nhan). */
function kt(db, shbg, { quet, gioDi = null, nhan = TH, xnd, diemGui = null, phuong = '49122', tenPhuong = null }) {
  const den = tuiDen(db, { quet, xnd: xnd === undefined ? quet : xnd, diemGui, shbgs: [shbg], phuong, tenPhuong });
  if (gioDi || nhan) tuiDi(db, { gioDi, nhan, shbgs: [shbg], phuong });
  return den;
}
const OPT = { tuNgay: D, denNgay: D, bayGio: '2026-10-23 10:00:00' };
const ngayCua = (kq, d) => kq.theo_ngay.find((x) => x.ngay === d);
const sl = (khoi) => Object.fromEntries(Object.entries(khoi.trang_thai).map(([k, v]) => [k, v.shbg]));
const tongNhom = (n) => n.tong.tong_shbg + n.hang_hoan.tong_shbg + n.khong_phan_loai.tong;

function duLieuNamTrangThai(db) {
  kt(db, 'KTT-DEMO-T1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  kt(db, 'KTT-DEMO-T1B', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-20 23:00:00' });
  kt(db, 'KTT-DEMO-T2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00' });
  kt(db, 'KTT-DEMO-T3', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 06:30:00' });
  kt(db, 'KTT-DEMO-T4', { quet: '2026-10-20 21:30:00', gioDi: '2026-10-21 09:00:00' });
  kt(db, 'KTT-DEMO-T5A', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-22 10:00:00' });
  kt(db, 'KTT-DEMO-T5B', { quet: '2026-10-20 11:00:00', nhan: null }); // chưa đi, chuyến 12:30
}

test('luuThoatTheoNgay: mỗi trạng thái 1–5 có SHBG; tổng năm trạng thái + đang chờ + nhóm riêng = số SHBG của ngày; mỗi SHBG đúng một trạng thái', () => {
  const db = dbMoi();
  duLieuNamTrangThai(db);
  const nhom = [['KTT-DEMO-X530', { nhan: '530900' }], ['KTT-DEMO-XKHAC', { nhan: '700123' }]];
  for (const [s, o] of nhom) kt(db, s, { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', ...o });
  kt(db, 'KTT-DEMO-KRO', { quet: '2026-10-20 08:00:00', nhan: null, phuong: '00000' }); // không rõ đích
  const kq = QL.luuThoatTheoNgay(db, OPT);
  const n = ngayCua(kq, D);
  assert.deepEqual(sl(n.tong), { t1: 2, t2: 1, t3: 1, t4: 1, t5: 2, dang_cho_chuyen: 0 });
  assert.equal(n.tong.tong_shbg, 7);
  assert.deepEqual(n.khong_phan_loai, { khong_ro_dich: 1, ngoai_pham_vi: { HE1_530900: 1, KHAC: 1 }, tong: 3 });
  assert.equal(n.tong_shbg_ngay, 10);
  assert.equal(tongNhom(n), n.tong_shbg_ngay, 'tổng các nhóm = số SHBG của ngày');
  assert.equal(n.tong.trang_thai.t5.shbg, 2);
  assert.deepEqual(n.tong.chi_tiet_trang_thai_5, { di_tu_d2_dung_chuyen: 0, di_tu_d2_truot_chuyen: 1, chua_di_lo_chuyen: 1 });
  // tỷ lệ: lưu thoát = (T1+T2)/chốt = 3/7; đúng chuyến = (T1 + T3 + …đi đúng chuyến)/7
  assert.deepEqual([n.tong.luu_thoat.tu_so, n.tong.luu_thoat.mau_so], [3, 7]);
  assert.ok(Math.abs(n.tong.luu_thoat.ty_le - 3 / 7) < 1e-12);
  assert.deepEqual([n.tong.dung_chuyen.tu_so, n.tong.dung_chuyen.truot_chuyen, n.tong.dung_chuyen.lo_chuyen], [3, 3, 1]);
  assert.equal(n.tong.dung_chuyen.tu_so + n.tong.dung_chuyen.truot_chuyen + n.tong.dung_chuyen.lo_chuyen, n.tong.luu_thoat.mau_so);
  assert.equal(n.theo_bcvh[TH].tong_shbg, 7); assert.equal(n.theo_bcvh[HT].tong_shbg, 0);
  assert.equal(n.tong.luu_thoat.moc, 'gio_quet_tui_den'); assert.equal(n.tong.dat_khong_dat.moc, 'bd10_den_xnd -> bd10_di_gio_di');
  assert.equal(kq.meta.moc.gio_di, 'bd10_di_gio_di');
  db.close();
});

test('«đang chờ chuyến» không vào trạng thái 5 và không vào mẫu số; đổi bayGio đổi kết quả; mẫu số loại hàng hoàn / không rõ đích / thiếu giờ quét đến / đang chờ', () => {
  const db = dbMoi();
  duLieuNamTrangThai(db);
  const som = QL.luuThoatTheoNgay(db, { ...OPT, bayGio: '2026-10-20 12:00:00' });
  const n = ngayCua(som, D);
  assert.deepEqual(sl(n.tong), { t1: 2, t2: 1, t3: 1, t4: 1, t5: 1, dang_cho_chuyen: 1 });
  assert.equal(n.tong.luu_thoat.mau_so, 6, 'không gồm «đang chờ chuyến»');
  const muon = ngayCua(QL.luuThoatTheoNgay(db, OPT), D);
  assert.deepEqual(sl(muon.tong), { t1: 2, t2: 1, t3: 1, t4: 1, t5: 2, dang_cho_chuyen: 0 });
  assert.equal(muon.tong.luu_thoat.mau_so, 7);
  db.close();
});

test('số túi: nhiều SHBG cùng một túi đến đếm 1 túi; túi đến không có danh sách bưu gửi đếm riêng, không vào năm trạng thái', () => {
  const db = dbMoi();
  const den = tuiDen(db, { quet: '2026-10-20 05:30:00', shbgs: ['KTT-DEMO-A', 'KTT-DEMO-B', 'KTT-DEMO-C'] });
  tuiDi(db, { gioDi: '2026-10-20 06:50:00', nhan: TH, shbgs: ['KTT-DEMO-A', 'KTT-DEMO-B', 'KTT-DEMO-C'] });
  assert.ok(den);
  tuiDen(db, { quet: '2026-10-20 05:40:00', shbgs: [], bd10: 'BD10-DEN-2' });
  const n = ngayCua(QL.luuThoatTheoNgay(db, OPT), D);
  assert.deepEqual(n.tong.trang_thai.t1, { shbg: 3, tui: 1 });
  assert.equal(n.tui_khong_co_buu_gui, 1);
  assert.equal(n.tong_shbg_ngay, 3);
  db.close();
});

test('đạt / không đạt trong truy vấn: mốc bd10_den_xnd (không phải giờ quét đến); chưa xác nhận đến và xác nhận đến sau khi đã đi ra nhóm riêng; không cộng vào lưu thoát', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-DAT', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', xnd: '2026-10-20 05:30:00' });
  kt(db, 'KTT-DEMO-KDAT', { quet: '2026-10-20 05:00:00', gioDi: '2026-10-21 14:00:01', xnd: '2026-10-20 14:00:00' }); // 14 giờ + 1 giây (trừ đêm)
  kt(db, 'KTT-DEMO-CHUAXN', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', xnd: null });
  kt(db, 'KTT-DEMO-SAU', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', xnd: '2026-10-20 08:00:00' });
  kt(db, 'KTT-DEMO-CHUADI', { quet: '2026-10-20 11:00:00', nhan: null, xnd: '2026-10-20 11:00:00' });
  kt(db, 'KTT-DEMO-12H', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-21 12:00:01', xnd: '2026-10-20 14:00:00', phuong: '49135', tenPhuong: 'Phường Thuận Hóa' }); // 12 giờ + 1 giây
  const n = ngayCua(QL.luuThoatTheoNgay(db, OPT), D);
  assert.deepEqual({ ...n.tong.dat_khong_dat }, { moc: 'bd10_den_xnd -> bd10_di_gio_di', dat: 1, khong_dat: 3, chua_di: 0, chua_do_duoc: 1, xnd_sau_gio_di: 1, ty_le_dat: 0.25 });
  db.close();
});

test('hàng hoàn Tổ KHHH trong truy vấn: nhóm riêng, loại khỏi tổng / tỷ lệ; túi đến gốc (sớm nhất) quyết định; 531120 đích BCVH khác đếm ở meta', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-H1', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '531120' }); // hoàn (Thuận Hóa)
  kt(db, 'KTT-DEMO-H2', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 08:00:00', diemGui: '531120' }); // hoàn
  kt(db, 'KTT-DEMO-HX', { quet: '2026-10-20 04:30:00', gioDi: '2026-10-20 05:50:00', diemGui: '531120', nhan: HT }); // 531120 đích Hương Trà: KHÔNG hoàn
  kt(db, 'KTT-DEMO-HK', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 09:00:00', diemGui: '531120', nhan: '700123' }); // đích tỉnh khác
  kt(db, 'KTT-DEMO-TH', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00', diemGui: '599999' }); // thường
  // hai lần đến: túi đến gốc (10/10) từ 531120, lần đến ghép (20/10) từ nơi khác -> theo TÚI ĐẾN GỐC: hoàn
  tuiDen(db, { quet: '2026-10-10 05:30:00', diemGui: '531120', shbgs: ['KTT-DEMO-2LAN'], bd10: 'BD10-DEN-G' });
  tuiDen(db, { quet: '2026-10-20 05:30:00', diemGui: '599999', shbgs: ['KTT-DEMO-2LAN'], bd10: 'BD10-DEN-H' });
  tuiDi(db, { gioDi: '2026-10-20 06:50:00', nhan: TH, shbgs: ['KTT-DEMO-2LAN'] });
  const kq = QL.luuThoatTheoNgay(db, OPT);
  const n = ngayCua(kq, D);
  assert.equal(n.hang_hoan.tong_shbg, 3);
  assert.deepEqual(sl(n.hang_hoan), { t1: 2, t2: 1, t3: 0, t4: 0, t5: 0, dang_cho_chuyen: 0 }, 'hiện trạng năm trạng thái của nhóm hoàn');
  assert.deepEqual(sl(n.tong), { t1: 2, t2: 0, t3: 0, t4: 0, t5: 0, dang_cho_chuyen: 0 }, 'tổng chỉ gồm HX (Hương Trà) và TH');
  assert.equal(n.tong.luu_thoat.mau_so, 2, 'mẫu số không gồm hàng hoàn');
  assert.equal(n.hang_hoan.dat_khong_dat.dat + n.hang_hoan.dat_khong_dat.khong_dat + n.hang_hoan.dat_khong_dat.chua_do_duoc + n.hang_hoan.dat_khong_dat.chua_di + n.hang_hoan.dat_khong_dat.xnd_sau_gio_di, 3);
  assert.equal(n.khong_phan_loai.ngoai_pham_vi.KHAC, 1);
  assert.equal(kq.meta.hang_hoan_tu_531120_dich_khac_thuan_hoa, 1, 'HX: từ 531120, đích BCVH Huế khác Thuận Hóa');
  assert.equal(tongNhom(n), n.tong_shbg_ngay);
  assert.equal(n.theo_bcvh[HT].trang_thai.t1.shbg, 1);
  db.close();
});

test('nhóm riêng trong truy vấn: thiếu giờ quét đến (chỉ có xác nhận đến), không xếp được chuyến (xóa lịch của BCVH); meta đếm theo từng lý do', () => {
  const db = dbMoi();
  // thiếu giờ quét đến: túi đến chỉ có bd10_den_xnd trong ngày
  const t = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: null, bd10_den_so_hieu: 'BD10-DEN-Z', bd10_den_xnd: '2026-10-20 07:00:00' });
  bg(db, t, 'KTT-DEMO-KQD', { ma_xa_phuong: '49122' });
  tuiDi(db, { gioDi: '2026-10-20 09:00:00', nhan: TH, shbgs: ['KTT-DEMO-KQD'] });
  kt(db, 'KTT-DEMO-KLICH', { quet: '2026-10-20 03:00:00', gioDi: '2026-10-20 05:00:00', nhan: HT });
  db.exec(`DELETE FROM ktt_lich_chuyen WHERE ma_bcvh = '${HT}'`);
  kt(db, 'KTT-DEMO-OK', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  const kq = QL.luuThoatTheoNgay(db, OPT);
  const n = ngayCua(kq, D);
  assert.deepEqual(sl(n.tong), { t1: 1, t2: 0, t3: 0, t4: 0, t5: 0, dang_cho_chuyen: 0 });
  assert.equal(n.tong.tong_shbg, 3);
  assert.deepEqual(n.tong.khong_phan_loai, { khong_co_gio_quet_den: 1, khong_xep_duoc_chuyen: { KHONG_CO_LICH: 1 } });
  assert.deepEqual([kq.meta.khong_co_gio_quet_den, kq.meta.khong_xep_duoc_chuyen], [1, { KHONG_CO_LICH: 1 }]);
  assert.equal(n.theo_bcvh[HT].khong_phan_loai.khong_xep_duoc_chuyen.KHONG_CO_LICH, 1);
  assert.equal(tongNhom(n), n.tong_shbg_ngay);
  db.close();
});

test('khoảng ngày: đủ ngày trong khoảng (ngày trống = 0, co_du_lieu false); số liệu cộng TỪNG NGÀY; tong_cong = cộng các ngày; ngày thứ hai tính riêng theo ngày đến của nó', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-N20', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  kt(db, 'KTT-DEMO-N22A', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 08:00:00' });
  kt(db, 'KTT-DEMO-N22B', { quet: '2026-10-22 05:30:00', gioDi: '2026-10-22 06:50:00' });
  const kq = QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-19', denNgay: '2026-10-23', bayGio: '2026-10-23 10:00:00' });
  assert.deepEqual(kq.theo_ngay.map((x) => [x.ngay, x.tong_shbg_ngay, x.co_du_lieu]), [['2026-10-19', 0, false], ['2026-10-20', 1, true], ['2026-10-21', 0, false], ['2026-10-22', 2, true], ['2026-10-23', 0, false]]);
  assert.equal(ngayCua(kq, '2026-10-19').tong.luu_thoat.ty_le, null, 'ngày trống: không chia cho 0');
  assert.deepEqual(sl(ngayCua(kq, '2026-10-22').tong), { t1: 1, t2: 1, t3: 0, t4: 0, t5: 0, dang_cho_chuyen: 0 });
  assert.deepEqual(sl(kq.tong_cong), { t1: 2, t2: 1, t3: 0, t4: 0, t5: 0, dang_cho_chuyen: 0 });
  assert.deepEqual([kq.tong_cong.luu_thoat.tu_so, kq.tong_cong.luu_thoat.mau_so], [3, 3]);
  assert.equal(kq.tong_cong.tong_shbg_ngay, 3);
  // một ngày: cùng số với ngày đó trong khoảng
  const mot = QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-22', denNgay: '2026-10-22', bayGio: '2026-10-23 10:00:00' });
  assert.deepEqual(mot.theo_ngay[0].tong, ngayCua(kq, '2026-10-22').tong);
  assert.deepEqual(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-22', bayGio: '2026-10-23 10:00:00' }).theo_ngay.map((x) => x.ngay), ['2026-10-22'], 'thiếu denNgay: một ngày');
  db.close();
});

test('khoảng ngày: tối đa 31 ngày (32 ngày -> lỗi tiếng Việt); sai định dạng / đảo ngược -> LoiKtt', () => {
  const db = dbMoi();
  assert.equal(QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-01', denNgay: '2026-10-31', bayGio: '2026-11-01 10:00:00' }).theo_ngay.length, 31);
  assert.throws(() => QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-01', denNgay: '2026-11-01', bayGio: '2026-11-02 10:00:00' }), (e) => e instanceof Q.LoiKtt && e.code === 'KTT_KHOANG_QUA_DAI' && /tối đa 31 ngày/.test(e.message));
  assert.throws(() => QL.luuThoatTheoNgay(db, { tuNgay: '1900-01-01', denNgay: '2999-01-01', bayGio: '2026-11-01 10:00:00' }), /31 ngày/);
  for (const o of [{ tuNgay: '2026-10-32', denNgay: '2026-10-33' }, { tuNgay: 'abc' }, {}, { tuNgay: '2026-02-30', denNgay: '2026-02-30' }]) assert.throws(() => QL.luuThoatTheoNgay(db, { ...o, bayGio: '2026-11-01 10:00:00' }), (e) => e.code === 'KTT_NGAY_SAI', JSON.stringify(o));
  assert.throws(() => QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-05', denNgay: '2026-10-04', bayGio: '2026-11-01 10:00:00' }), (e) => e.code === 'KTT_KHOANG_NGAY_SAI');
  db.close();
});

test('da_chot: số của ngày D chỉ chốt khi độ mới dữ liệu ≥ 09:00 ngày D+1; ngày chưa chốt vẫn trả số', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-C', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  const o = { tuNgay: '2026-10-20', denNgay: '2026-10-21' };
  const a = QL.luuThoatTheoNgay(db, { ...o, bayGio: '2026-10-21 08:59:59' });
  assert.deepEqual(a.theo_ngay.map((x) => [x.ngay, x.da_chot]), [['2026-10-20', false], ['2026-10-21', false]]);
  assert.equal(a.theo_ngay[0].tong_shbg_ngay, 1, 'ngày chưa chốt vẫn có số');
  const b = QL.luuThoatTheoNgay(db, { ...o, bayGio: '2026-10-21 09:00:00' });
  assert.deepEqual(b.theo_ngay.map((x) => x.da_chot), [true, false]);
  const c = QL.luuThoatTheoNgay(db, { ...o, bayGio: '2026-10-22 09:00:00' });
  assert.deepEqual(c.theo_ngay.map((x) => x.da_chot), [true, true]);
  db.close();
});

test('«bây giờ» = độ mới dữ liệu (cặp OK gần nhất), không phải đồng hồ máy; chưa có dữ liệu -> kết quả rỗng có lý do; meta có nguon_xuat_luc_moi_nhat', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-M', { quet: '2026-10-20 11:00:00', nhan: null });
  const o = { tuNgay: D, denNgay: D };
  const rong = QL.luuThoatTheoNgay(db, o);
  assert.deepEqual([rong.co_du_lieu, rong.ly_do, rong.tong_cong, rong.theo_ngay.length, rong.theo_ngay[0].tong_shbg_ngay], [false, 'CHUA_CO_DU_LIEU', null, 1, 0]);
  assert.ok(rong.canh_bao.length >= 1);
  const ok = (nguon) => K.ghiCap(db, { khoa_cap: nguon.slice(0, 10).replace(/-/g, '') + '_' + nguon.slice(11, 13) + '0000', ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
  ok('2026-10-20 12:00:00');
  const a = QL.luuThoatTheoNgay(db, o);
  assert.equal(a.nguon_xuat_luc_moi_nhat, '2026-10-20 12:00:00'); assert.equal(a.meta.nguon_xuat_luc_moi_nhat, '2026-10-20 12:00:00');
  assert.equal(sl(ngayCua(a, D).tong).dang_cho_chuyen, 1, 'độ mới 12:00 < 12:30: đang chờ chuyến');
  ok('2026-10-20 13:00:00');
  const b = QL.luuThoatTheoNgay(db, o);
  assert.equal(sl(ngayCua(b, D).tong).t5, 1, 'độ mới 13:00 > 12:30: lỡ chuyến');
  assert.equal(b.theo_ngay[0].da_chot, false);
  ok('2026-10-21 09:00:00');
  assert.equal(QL.luuThoatTheoNgay(db, o).theo_ngay[0].da_chot, true);
  db.close();
});

test('không dùng giờ máy: đổi giờ máy (Date.now) không đổi kết quả; chỉ đổi bayGio mới đổi', () => {
  const db = dbMoi();
  duLieuNamTrangThai(db);
  const truoc = JSON.stringify(QL.luuThoatTheoNgay(db, OPT));
  const goc = Date.now;
  try {
    Date.now = () => { throw new Error('không được đọc giờ máy'); };
    assert.equal(JSON.stringify(QL.luuThoatTheoNgay(db, OPT)), truoc);
    Date.now = () => Date.UTC(2031, 0, 1);
    assert.equal(JSON.stringify(QL.luuThoatTheoNgay(db, OPT)), truoc);
  } finally { Date.now = goc; }
  assert.notEqual(JSON.stringify(QL.luuThoatTheoNgay(db, { ...OPT, bayGio: '2026-10-20 12:00:00' })), truoc);
  db.close();
});

test('kiểm tĩnh mã nguồn kttLuuThoat.js / kttLuuThoatQuery.js / kttChuyen.js: không Date.now, không new Date(chuỗi), không Date.parse; truy vấn chỉ SELECT', () => {
  for (const f of ['kttLuuThoat.js', 'kttLuuThoatQuery.js', 'kttChuyen.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!/Date\.now|Date\.parse|new Date\(/.test(src), `${f}: dùng đối tượng Date / giờ máy`);
    assert.ok(!/\.run\(|\.exec\(|db\.transaction|\.pragma\(/.test(src), `${f}: không được ghi DB`);
  }
});

test('kttQuery dùng lịch CHÍNH THỨC: chuyến mang tên giờ xe rời KTT (không còn SANG / TRUA / TOI); đổi lịch trong DB đổi kết quả; hạn đến theo ktt_lich_cau_hinh', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-Q', { quet: '2026-10-20 05:30:00', gioDi: '2026-10-20 06:50:00' });
  const a = Q.chuyenTheoBcvh(db, OPT);
  assert.deepEqual(a.theoBcvhChuyen.map((x) => [x.maBcvh, x.chuyen, x.DUNG_CHUYEN]), [[TH, '07:00', 1]]);
  assert.deepEqual(a.chotTruocPhut, [60]);
  db.exec("UPDATE ktt_lich_cau_hinh SET gia_tri = 30 WHERE khoa = 'han_den_truoc_chuyen_phut'"); // hạn 06:30: quét 05:30 vẫn chuyến 07:00; đổi quét sang 06:45 -> sát giờ
  assert.deepEqual(Q.chuyenTheoBcvh(db, OPT).chotTruocPhut, [30]);
  db.exec("UPDATE ktt_lich_chuyen SET dang_dung = 0 WHERE ma_bcvh = '533140' AND gio_xuat_phat = '07:00'");
  assert.deepEqual(Q.chuyenTheoBcvh(db, OPT).theoBcvhChuyen.map((x) => x.chuyen), ['12:30'], 'tắt chuyến 07:00: hàng quét 05:30 vào chuyến 12:30 (đi 06:50 vẫn đúng)');
  db.close();
});

// ---------- hiệu năng (KTT_PERF=1) ----------
test('hiệu năng (KTT_PERF=1): dữ liệu giả ≈ 15.000 túi / 75.000 dòng bưu gửi mỗi tuần, 31 ngày; số mili giây một ngày, 7 ngày, 31 ngày', { skip: process.env.KTT_PERF ? false : 'đặt KTT_PERF=1 để đo' }, () => {
  const db = dbMoi();
  let x = 777;
  const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
  const hai = (n) => String(n).padStart(2, '0');
  const ngayStr = (i) => { const d = new Date(Date.UTC(2026, 9, 1 + i)); return d.toISOString().slice(0, 10); };
  const gio = (i, phut) => `${ngayStr(i + Math.floor(phut / 1440))} ${hai(Math.floor(phut / 60) % 24)}:${hai(phut % 60)}:00`;
  const BCVH = ['533140', '535470', '535790', '536250', '537015', '537220'];
  const PHUONG = DIA_BAN_PHAT_MAC_DINH.flatMap((b) => b[2].map((p) => p[0]));
  const cotTui = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'chieu', 'luong', 'co_mo_tui', 'gio_quet_tui_den', 'bd10_den_so_hieu', 'bd10_den_xnd', 'bd10_den_ma_diem_gui', 'bd10_di_gio_di', 'bd10_di_ma_diem_nhan', 'bd10_di_so_hieu', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const cotBg = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'shbg', 'ma_xa_phuong', 'ten_xa_phuong', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const insTui = db.prepare(`INSERT INTO ktt_tui (${cotTui.join(',')}) VALUES (${cotTui.map(() => '?').join(',')})`);
  const insBg = db.prepare(`INSERT INTO ktt_buu_gui (${cotBg.join(',')}) VALUES (${cotBg.map(() => '?').join(',')})`);
  const nx = '2026-11-01 00:00:00';
  const SO_NGAY = 31;
  const TUI_DEN_NGAY = Math.round(5000 / 7); // ≈ 5.000 túi đến mỗi tuần, 10 SHBG mỗi túi
  let nTui = 0; let nBg = 0;
  db.exec('BEGIN');
  for (let d = 0; d < SO_NGAY; d++) {
    for (let i = 0; i < TUI_DEN_NGAY; i++) {
      const quet = gio(d, 300 + rnd(1000));
      const xnd = gio(d, 300 + rnd(1100));
      const t = ['990001', '530100', 'T', 'S1', `D${d}`, '1', String(++nTui)];
      insTui.run(...t, 'DEN', 'KHAI_THAC_DEN', 1, quet, `BD10-D-${d}-${i}`, rnd(12) === 0 ? null : xnd, i % 40 === 0 ? '531120' : '599001', null, null, null, nx, nx);
      const shbgs = [];
      for (let k = 0; k < 10; k++) { const s = `KTT-DEMO-${d}-${i}-${k}`; shbgs.push(s); insBg.run(...t, s, PHUONG[rnd(PHUONG.length)], null, nx, nx); nBg++; }
      if (i % 2 === 0) { // một nửa túi đến có túi đi (khai thác lại)
        const di = gio(d, 420 + rnd(1700));
        const nhan = rnd(20) === 0 ? '530900' : BCVH[rnd(6)];
        const td = ['990001', nhan, 'T', 'S1', `D${d}`, '2', String(++nTui)];
        insTui.run(...td, 'DI', 'KHAI_THAC_DI', 0, null, null, null, null, rnd(8) === 0 ? null : di, nhan, `BD10-I-${d}-${i}`, nx, nx);
        for (const s of shbgs) { insBg.run(...td, s, '49122', null, nx, nx); nBg++; }
      }
    }
  }
  db.exec('COMMIT');
  const mocBay = `${ngayStr(SO_NGAY + 2)} 10:00:00`;
  const do_ = (tu, den) => { const t0 = process.hrtime.bigint(); const kq = QL.luuThoatTheoNgay(db, { tuNgay: ngayStr(tu), denNgay: ngayStr(den), bayGio: mocBay }); return { kq, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };
  const mot = do_(10, 10); const bay = do_(10, 16); const ba1 = do_(0, 30);
  console.log(`# KTT-7b hiệu năng (${nTui} túi / ${nBg} dòng bưu gửi, 31 ngày): 1 ngày ${mot.ms.toFixed(0)} ms; 7 ngày ${bay.ms.toFixed(0)} ms; 31 ngày ${ba1.ms.toFixed(0)} ms; SHBG ${ba1.kq.tong_cong.tong_shbg_ngay}`);
  assert.equal(ba1.kq.theo_ngay.length, 31);
  assert.ok(ba1.kq.tong_cong.tong_shbg_ngay > 0);
  db.close();
});

// ---------- ba múi giờ ----------
test('TZ: cùng kết quả ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (năm trạng thái, đạt / không đạt, hàng hoàn, khoảng ngày, da_chot)', () => {
  const script = `
    const Database = require('better-sqlite3');
    const { ensureKttSchema } = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttSchema.js'))});
    const QL = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttLuuThoatQuery.js'))});
    const db = new Database(':memory:'); ensureKttSchema(db);
    let seq = 0;
    const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
    const them = (b, o) => { const k = Object.keys(o); db.prepare('INSERT INTO ' + b + ' (' + k.join(',') + ') VALUES (' + k.map(() => '?').join(',') + ')').run(...Object.values(o)); };
    const tui = (o) => { const r = { from_pos: '9', to_pos: '530100', mail_trip_type: 'T', service_code: 'S', year: '2026', mail_trip_number: '1', post_bag_index: String(++seq), ...NG, ...o }; them('ktt_tui', r); return r; };
    const bg = (t, shbg, o) => them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, ma_xa_phuong: '49122', ...NG, ...o });
    const kt = (shbg, quet, di, xnd, diemGui) => {
      const d = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: 'B' + seq, bd10_den_xnd: xnd, bd10_den_ma_diem_gui: diemGui || null }); bg(d, shbg, {});
      if (di) { const t = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: '533140', bd10_di_gio_di: di, bd10_di_ma_diem_nhan: '533140', bd10_di_so_hieu: 'X' + seq }); bg(t, shbg, {}); }
      else { const t = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: '533140', bd10_di_ma_diem_nhan: '533140' }); bg(t, shbg, {}); }
    };
    kt('A1', '2026-10-20 05:30:00', '2026-10-20 06:50:00', '2026-10-20 05:30:00');
    kt('A2', '2026-10-20 21:30:00', '2026-10-21 00:00:00', '2026-10-20 21:30:00');
    kt('A3', '2026-10-20 21:30:00', '2026-10-20 23:59:59', '2026-10-20 14:00:00');
    kt('A4', '2026-10-20 11:00:00', null, '2026-10-20 11:00:00');
    kt('A5', '2026-10-20 05:30:00', '2026-10-21 14:00:01', '2026-10-20 14:00:00', '531120');
    kt('B1', '2027-03-28 02:30:00', '2027-03-28 06:30:00', '2027-03-28 03:00:00');
    const kq = QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-19', denNgay: '2026-10-22', bayGio: '2026-10-21 09:00:00' });
    const kq2 = QL.luuThoatTheoNgay(db, { tuNgay: '2027-03-27', denNgay: '2027-03-29', bayGio: '2027-03-29 09:00:00' });
    process.stdout.write(JSON.stringify([kq, kq2]));
  `;
  const kq = ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'].map((tz) => {
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    return r.stdout;
  });
  assert.equal(kq[0], kq[1]); assert.equal(kq[1], kq[2]);
  const [a, b] = JSON.parse(kq[0]);
  const n = ngayCua(a, '2026-10-20');
  assert.deepEqual(Object.fromEntries(Object.entries(n.tong.trang_thai).map(([k, v]) => [k, v.shbg])), { t1: 2, t2: 0, t3: 1, t4: 0, t5: 1, dang_cho_chuyen: 0 });
  assert.equal(n.hang_hoan.tong_shbg, 1);
  assert.equal(a.theo_ngay.find((x) => x.ngay === '2026-10-20').da_chot, true);
  assert.equal(a.theo_ngay.find((x) => x.ngay === '2026-10-21').da_chot, false);
  assert.equal(ngayCua(b, '2027-03-28').tong_shbg_ngay, 1);
});
