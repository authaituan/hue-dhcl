// ==========================================
// Test KTT-LICH-2: BD10 lập vào «ngày có chuyến nghỉ» (Chủ nhật của Hương Thủy 536250, Thuận An 537015, Phú Lộc 537220 — lịch chuẩn 05/11/2026).
//  - Phương án A (KTT-12, kttLichXe.gioLapBd10): không gán chuyến, đếm riêng ở `lap_ngay_nghi`, loại khỏi «lập sau giờ xe».
//  - Phương án B (luu-thoat, khong-dat-14h): chỉ cờ phụ `lap_ngay_nghi`; KHÔNG đổi «đi đúng chuyến» / «trượt chuyến» / mẫu số.
// DB tạm trong bộ nhớ + ensureKttSchema (lịch chuẩn), dữ liệu GIẢ (SHBG KTT-DEMO-xxx, BD10 giả). Không mở data/, không server, không DB thật.
// 25/10/2026 là Chủ nhật, 26/10 là thứ Hai.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const XE = require('../server/lib/kttLichXe');
const QL = require('../server/lib/kttLuuThoatQuery');
const Api = require('../server/lib/kttApi');
const K = require('../server/lib/kttNapCap');

const HY = '536250'; const TA = '537015'; const TH = '533140';
const NG = { nguon_xuat_luc: '2026-10-27 00:00:00', cap_nhat_luc: '2026-10-27 00:00:00' };
let seq = 0;
function dbMoi() { const db = new Database(':memory:'); ensureKttSchema(db); return db; }
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261025', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg) {
  them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG });
}
/** Một BD10 đi (một túi DI, không SHBG) về BCVH `nhan` lập lúc `gio`. */
function bd10Di(db, so, nhan, gio) { tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_so_hieu: so, bd10_di_gio_di: gio, gio_quet_tui_di: gio, bd10_di_ma_diem_nhan: nhan, bd10_di_ma_duong_thu: 'DT-X', bd10_di_ten_duong_thu: 'Đường thư X' }); }
/** Một SHBG khai thác: túi đến lúc `quet`, túi đi lập lúc `gioDi` về `nhan`. */
function kt(db, shbg, { quet, gioDi, nhan }) {
  const den = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-DEN-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: null });
  bg(db, den, shbg);
  const di = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: `BD10-DI-${seq}`, bd10_di_ma_diem_nhan: nhan });
  bg(db, di, shbg);
}
function capOk(db, nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}

test('phương án A (KTT-12): BD10 lập Chủ nhật sau chuyến CN cuối của BCVH có chuyến nghỉ -> KHÔNG gán chuyến, đếm riêng, không vào «lập sau giờ xe»; ngày thường và BCVH không nghỉ giữ nguyên', () => {
  const db = dbMoi();
  try {
    bd10Di(db, 'BD10-A1', HY, '2026-10-25 06:30:00'); // CN, trước 07:30: bình thường (gán 07:30, lập TRƯỚC xe)
    bd10Di(db, 'BD10-A2', HY, '2026-10-25 13:00:00'); // CN sau 07:30 (12:45 nghỉ): lập ngày nghỉ
    bd10Di(db, 'BD10-A3', HY, '2026-10-25 15:00:00'); // lập ngày nghỉ
    bd10Di(db, 'BD10-A4', HY, '2026-10-26 13:00:00'); // thứ Hai 13:00: chuyến 12:45 chạy -> gán, lập sau xe 15 phút
    bd10Di(db, 'BD10-A5', TA, '2026-10-25 14:00:00'); // Thuận An CN sau 07:30 (13:30 nghỉ): lập ngày nghỉ
    bd10Di(db, 'BD10-A6', TH, '2026-10-25 14:00:00'); // Thuận Hóa không có chuyến nghỉ: bình thường (gán 12:55, lập sau xe)
    const r = XE.gioLapBd10(db, { tuNgay: '2026-10-25', denNgay: '2026-10-26', minBd10: 1 });
    assert.equal(r.tong_bd10, 6, 'tổng mọi BD10 đi');
    assert.deepEqual(r.lap_ngay_nghi, { tong_bd10: 3, theo_bcvh: [{ ma_bcvh: HY, ten_bcvh: r.lap_ngay_nghi.theo_bcvh[0].ten_bcvh, so_bd10: 2 }, { ma_bcvh: TA, ten_bcvh: r.lap_ngay_nghi.theo_bcvh[1].ten_bcvh, so_bd10: 1 }] });
    assert.equal(r.dong.reduce((s, d) => s + d.so_bd10, 0), 3, 'các nhóm chỉ còn BD10 có gán chuyến');
    assert.equal(r.tong_bd10, r.dong.reduce((s, d) => s + d.so_bd10, 0) + r.lap_ngay_nghi.tong_bd10, 'tổng = các nhóm + lập ngày nghỉ');
    assert.equal(r.dong.reduce((s, d) => s + d.so_bd10_lap_sau_gio_xe, 0), 2, 'chỉ A4 (HY thứ Hai) và A6 (Thuận Hóa) lập sau giờ xe; A2, A3, A5 không bị tính');
    assert.ok(!r.dong.some((d) => d.ma_bcvh === TA), 'Thuận An chỉ có BD10 lập ngày nghỉ: không có nhóm');
    assert.ok(/KHÔNG gán chuyến/.test(r.quy_uoc));
    // không có BD10 lập ngày nghỉ: khối rỗng
    const rong = XE.gioLapBd10(db, { tuNgay: '2026-10-26', denNgay: '2026-10-26', minBd10: 1 });
    assert.deepEqual(rong.lap_ngay_nghi, { tong_bd10: 0, theo_bcvh: [] });
  } finally { db.close(); }
});

test('phương án B (luu-thoat): cờ phụ meta.lap_ngay_nghi_shbg / lap_ngay_nghi theo BCVH; KHÔNG đổi đúng chuyến / trượt chuyến / mẫu số; cộng được giữa ngày', () => {
  const db = dbMoi();
  try {
    kt(db, 'KTT-DEMO-N1', { quet: '2026-10-25 05:00:00', gioDi: '2026-10-25 13:00:00', nhan: HY }); // chuyến 07:30 CN, lập 13:00 (ngày nghỉ): trượt chuyến, có cờ
    kt(db, 'KTT-DEMO-N2', { quet: '2026-10-25 05:00:00', gioDi: '2026-10-25 06:40:00', nhan: HY }); // lập 06:40 ≤ 07:30: đúng chuyến, không cờ
    kt(db, 'KTT-DEMO-N3', { quet: '2026-10-25 05:00:00', gioDi: '2026-10-25 14:00:00', nhan: TH }); // Thuận Hóa không có chuyến nghỉ: không cờ (chuyến 07:00 CN, trượt)
    kt(db, 'KTT-DEMO-N4', { quet: '2026-10-26 05:00:00', gioDi: '2026-10-26 13:00:00', nhan: HY }); // thứ Hai: không cờ (trượt 07:30)
    const bayGio = '2026-10-27 10:00:00';
    const ngay = (d) => QL.luuThoatTheoNgay(db, { tuNgay: d, denNgay: d, bayGio });
    const cn = ngay('2026-10-25');
    assert.equal(cn.meta.lap_ngay_nghi_shbg, 1);
    assert.deepEqual(cn.meta.lap_ngay_nghi, { [HY]: 1 });
    const hy = cn.tong_cong.theo_bcvh[HY];
    assert.deepEqual([hy.dung_chuyen.tu_so, hy.dung_chuyen.truot_chuyen, hy.dung_chuyen.mau_so], [1, 1, 2], 'cờ phụ không đổi định nghĩa: SHBG lập ngày nghỉ vẫn là trượt chuyến và vẫn trong mẫu số');
    const hai = ngay('2026-10-26');
    assert.equal(hai.meta.lap_ngay_nghi_shbg, 0); assert.deepEqual(hai.meta.lap_ngay_nghi, {});
    const gop = QL.ghepKhoang([cn, hai]);
    assert.equal(gop.meta.lap_ngay_nghi_shbg, 1); assert.deepEqual(gop.meta.lap_ngay_nghi, { [HY]: 1 });
    const ca = QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-25', denNgay: '2026-10-26', bayGio });
    assert.deepEqual([ca.meta.lap_ngay_nghi_shbg, ca.meta.lap_ngay_nghi], [gop.meta.lap_ngay_nghi_shbg, gop.meta.lap_ngay_nghi], 'cả khoảng = ghép từng ngày');
  } finally { db.close(); }
});

test('phương án B (khong-dat-14h): khối lap_ngay_nghi cùng số với luu-thoat, không đổi nhóm nguyên nhân', async () => {
  const db = dbMoi();
  try {
    kt(db, 'KTT-DEMO-N1', { quet: '2026-10-25 05:00:00', gioDi: '2026-10-25 13:00:00', nhan: HY });
    kt(db, 'KTT-DEMO-N2', { quet: '2026-10-25 05:00:00', gioDi: '2026-10-25 06:40:00', nhan: HY });
    capOk(db, '2026-10-27 10:00:00');
    Api.xoaCache();
    const r = await Api.khongDat14h(db, { tu: '2026-10-25', den: '2026-10-25' });
    assert.equal(r.lap_ngay_nghi.shbg, 1);
    assert.deepEqual(r.lap_ngay_nghi.theo_bcvh, { [HY]: 1 });
    assert.ok(/vẫn nằm trong mẫu số/.test(r.lap_ngay_nghi.ghi_chu));
    assert.equal(r.tong.shbg, 2, 'cả hai SHBG vẫn trong tổng');
  } finally { Api.xoaCache(); db.close(); }
});
