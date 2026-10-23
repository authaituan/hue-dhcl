// ==========================================
// Test KTT-4: server/lib/kttTinh.js — hàm thuần tính chỉ tiêu, chuyến, «đến sát giờ», «nằm lâu», «treo» cho «Hàng tại KTT».
// Dữ liệu GIẢ (mã đơn vị là danh mục công khai; SHBG / BD10 không dùng ở đây). Không DB, không server, không mạng.
// Cuối file: kết quả giống nhau ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (chạy tiến trình con).
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const T = require('../server/lib/kttTinh');

const KTT_TINH = path.join(__dirname, '..', 'server', 'lib', 'kttTinh.js');
const LICH_V1 = {
  '533140': [{ ten: 'SANG', gioMoc: '07:30', chotTruocPhut: 30 }, { ten: 'TRUA', gioMoc: '14:00', chotTruocPhut: 30 }, { ten: 'TOI', gioMoc: '22:30', chotTruocPhut: 30 }],
  '535790': [{ ten: 'SANG', gioMoc: '08:30', chotTruocPhut: 30 }]
};
const CAU_HINH = { lich: LICH_V1, nguong: { ...T.NGUONG_MAC_DINH }, canhBao: [] };
const d = (gio) => `2026-10-20 ${gio}`; // ngày d = 20/10/2026
const d1 = (gio) => `2026-10-21 ${gio}`;
const chuyen = (o) => T.danhGiaChuyen({ maBcvh: '533140', cauHinh: CAU_HINH, ...o });

// ---------- hằng số ----------
test('hằng số: MA_KTT, 6 mã BCVH Huế, NHOM_DICH', () => {
  assert.equal(T.MA_KTT, '530100');
  assert.deepEqual([...T.MA_BCVH_HUE].sort(), ['533140', '535470', '535790', '536250', '537015', '537220']);
  assert.deepEqual(Object.keys(T.NHOM_DICH).sort(), ['BCVH_HUE', 'HE1_530900', 'KHAC', 'KHONG_RO', 'KTT']);
});

// ---------- đích ----------
test('phanNhomDich: có BD10 đi -> theo mã nhận BD10 đi (không xét phường / xã)', () => {
  const bang = { 49135: '533140' };
  assert.deepEqual(T.phanNhomDich({ maNhanBd10Di: '535790', maPhuongXa: '49135', bangPhuongXa: bang }), { nhom: 'BCVH_HUE', maBcvh: '535790', nguon: 'BD10_DI' });
  assert.deepEqual(T.phanNhomDich({ maNhanBd10Di: '530900', maPhuongXa: '49135', bangPhuongXa: bang }), { nhom: 'HE1_530900', maBcvh: null, nguon: 'BD10_DI' });
  assert.deepEqual(T.phanNhomDich({ maNhanBd10Di: '530100', bangPhuongXa: bang }), { nhom: 'KTT', maBcvh: null, nguon: 'BD10_DI' });
  assert.deepEqual(T.phanNhomDich({ maNhanBd10Di: '510100', maPhuongXa: '49135', bangPhuongXa: bang }), { nhom: 'KHAC', maBcvh: null, nguon: 'BD10_DI' });
  assert.equal(T.phanNhomDich({ maNhanBd10Di: ' 536250 ' }).maBcvh, '536250');
});

test('phanNhomDich: chưa có BD10 đi -> tra phường / xã; không tra được -> KHONG_RO; mã tra ra 530900 -> HE1_530900', () => {
  const bang = { 49135: '533140', 49000: '530900', 49001: '599999' };
  for (const rong of [undefined, null, '', '   ']) {
    assert.deepEqual(T.phanNhomDich({ maNhanBd10Di: rong, maPhuongXa: '49135', bangPhuongXa: bang }), { nhom: 'BCVH_HUE', maBcvh: '533140', nguon: 'PHUONG_XA' });
  }
  assert.equal(T.phanNhomDich({ maPhuongXa: 49135, bangPhuongXa: bang }).maBcvh, '533140'); // mã phường dạng số
  assert.deepEqual(T.phanNhomDich({ maPhuongXa: '49000', bangPhuongXa: bang }), { nhom: 'HE1_530900', maBcvh: null, nguon: 'PHUONG_XA' });
  assert.equal(T.phanNhomDich({ maPhuongXa: '49001', bangPhuongXa: bang }).nhom, 'KHAC');
  const khongRo = { nhom: 'KHONG_RO', maBcvh: null, nguon: null };
  assert.deepEqual(T.phanNhomDich({ maPhuongXa: '00000', bangPhuongXa: bang }), khongRo);
  assert.deepEqual(T.phanNhomDich({ maPhuongXa: '', bangPhuongXa: bang }), khongRo);
  assert.deepEqual(T.phanNhomDich({ maPhuongXa: '49135' }), khongRo);
  assert.deepEqual(T.phanNhomDich({ maPhuongXa: 'constructor', bangPhuongXa: bang }), khongRo); // không lấy thuộc tính kế thừa
  assert.deepEqual(T.phanNhomDich({ chieu: 'DI', maNhanTui: '535790' }), khongRo); // maNhanTui chưa dùng ở V1
  assert.deepEqual(T.phanNhomDich(), khongRo);
});

// ---------- chỉ tiêu F1.3 ----------
test('tinhChiTieu: 20/10 15:25:00 -> 21/10 07:45:14, 14 giờ = còn 27586 giây (khớp QUYTG-2)', () => {
  const r = T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), bay_gio: d1('12:00:00'), maBcvh: '533140', maPhuong: '40000', nguong: T.NGUONG_MAC_DINH });
  assert.deepEqual(r, { trangThai: 'DO_DUOC', daQuaGiay: 22814, conLaiGiay: 27586, chiTieuGio: 14 });
});

test('tinhChiTieu: chỉ tiêu 12 giờ cho phường 49135 và 49133 (Thuận Hóa, Phú Xuân), 14 giờ cho phường khác', () => {
  for (const phuong of ['49135', '49133', 49135]) {
    const r = T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: '533140', maPhuong: phuong, nguong: T.NGUONG_MAC_DINH });
    assert.deepEqual([r.trangThai, r.chiTieuGio, r.conLaiGiay], ['DO_DUOC', 12, 12 * 3600 - 22814]);
  }
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: '533140', maPhuong: '49134' }).chiTieuGio, 14);
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: '533140' }).chiTieuGio, 14); // không truyền maPhuong / nguong -> mặc định
  const tuyChinh = { ...T.NGUONG_MAC_DINH, chiTieuF13Gio: 15, chiTieuF13GioThuanHoaPhuXuan: 11 };
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: '533140', maPhuong: '49135', nguong: tuyChinh }).chiTieuGio, 11);
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: '533140', nguong: tuyChinh }).chiTieuGio, 15);
});

test('tinhChiTieu: XND_SAU_GIO_DI khi xnd > gioDi (hiệu âm, không tính quỹ, không đổi về 0)', () => {
  const r = T.tinhChiTieu({ xnd: d1('08:00:00'), gioDi: d1('07:45:00'), maBcvh: '537015' });
  assert.equal(r.trangThai, 'XND_SAU_GIO_DI');
  assert.equal(r.daQuaGiay, -900);
  assert.equal(r.conLaiGiay, null);
});

test('tinhChiTieu: chưa đi thì tính đến bay_gio; gioDi rỗng / sai định dạng coi như chưa đi', () => {
  const a = T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: null, bay_gio: d1('07:45:14'), maBcvh: '533140' });
  assert.deepEqual([a.trangThai, a.conLaiGiay], ['DO_DUOC', 27586]);
  for (const di of ['', 'NULL', 'không-phải-giờ', undefined]) assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: di, bay_gio: d1('07:45:14'), maBcvh: '533140' }).conLaiGiay, 27586);
  // đã đi thì KHÔNG dùng bay_gio
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d('16:25:00'), bay_gio: d1('07:45:14'), maBcvh: '533140' }).daQuaGiay, 3600);
  assert.equal(T.tinhChiTieu({ xnd: d('15:25:00'), maBcvh: '533140' }).trangThai, 'THIEU_BAY_GIO');
});

test('tinhChiTieu: KHONG_CHAM với đích không phải BCVH Huế (kể cả khi thiếu xnd)', () => {
  for (const ma of ['530900', '599999', '', null, undefined]) {
    const r = T.tinhChiTieu({ xnd: d('15:25:00'), gioDi: d1('07:45:14'), maBcvh: ma });
    assert.deepEqual([r.trangThai, r.daQuaGiay, r.conLaiGiay], ['KHONG_CHAM', null, null]);
  }
  assert.equal(T.tinhChiTieu({ xnd: null, maBcvh: '599999', bay_gio: d('10:00:00') }).trangThai, 'KHONG_CHAM');
});

test('tinhChiTieu: CHUA_XAC_NHAN_DEN khi xnd rỗng; CAN_KIEM_TRA_LAI khi hai mốc cách nhau quá 7 ngày (đúng 7 ngày vẫn đo được)', () => {
  for (const x of [null, undefined, '', '   ', 'NULL', 'hỏng']) assert.equal(T.tinhChiTieu({ xnd: x, gioDi: d1('07:45:14'), maBcvh: '533140' }).trangThai, 'CHUA_XAC_NHAN_DEN');
  const xa = T.tinhChiTieu({ xnd: '2026-10-01 08:00:00', gioDi: d('08:00:00'), maBcvh: '533140' });
  assert.equal(xa.trangThai, 'CAN_KIEM_TRA_LAI');
  assert.ok(xa.daQuaGiay > 0 && xa.conLaiGiay < 0); // vẫn trả số liệu thô để xem
  assert.equal(T.tinhChiTieu({ xnd: '2026-10-13 08:00:00', gioDi: d('08:00:00'), maBcvh: '533140' }).trangThai, 'DO_DUOC');
  assert.equal(T.tinhChiTieu({ xnd: '2026-10-13 08:00:00', gioDi: d('08:00:01'), maBcvh: '533140' }).trangThai, 'CAN_KIEM_TRA_LAI');
  assert.equal(T.tinhChiTieu({ xnd: '2026-10-01 08:00:00', bay_gio: d('08:00:00'), maBcvh: '533140' }).trangThai, 'CAN_KIEM_TRA_LAI'); // chưa đi, đo đến bay_gio
});

// ---------- nằm thực tế, độ trễ xác nhận ----------
test('namThucTe: giờ đồng hồ liên tục kể cả 21:00–07:00; chưa đi đo đến bay_gio', () => {
  const dem = T.namThucTe({ quetDen: d('20:00:00'), gioDi: d1('08:00:00') });
  assert.deepEqual([dem.trangThai, dem.giay, dem.daDi], ['DO_DUOC', 12 * 3600, true]);
  const chua = T.namThucTe({ quetDen: d('15:25:00'), bay_gio: d1('07:45:14') });
  assert.deepEqual([chua.trangThai, chua.giay, chua.daDi], ['DO_DUOC', 58814, false]); // 16h20m14s liên tục
  assert.equal(T.namThucTe({ quetDen: d('10:00:00'), gioDi: d('10:00:00') }).giay, 0);
});

test('namThucTe: QUET_DEN_SAU_GIO_DI giữ số âm; thiếu mã 4; thiếu bay_gio', () => {
  const am = T.namThucTe({ quetDen: d('10:00:00'), gioDi: d('09:30:00') });
  assert.deepEqual([am.trangThai, am.giay], ['QUET_DEN_SAU_GIO_DI', -1800]);
  assert.equal(T.namThucTe({ quetDen: null, gioDi: d('09:30:00') }).trangThai, 'KHONG_CO_MOC_QUET_DEN');
  assert.equal(T.namThucTe({ quetDen: d('09:30:00') }).trangThai, 'THIEU_BAY_GIO');
});

test('doTreXacNhan: xnd − quetDen giây liên tục, có thể âm; thiếu mốc -> THIEU_MOC', () => {
  assert.deepEqual(T.doTreXacNhan({ quetDen: d('10:00:00'), xnd: d('10:30:00') }), { trangThai: 'DO_DUOC', giay: 1800 });
  assert.deepEqual(T.doTreXacNhan({ quetDen: d('20:00:00'), xnd: d1('08:00:00') }), { trangThai: 'DO_DUOC', giay: 43200 }); // không trừ khung đêm
  assert.equal(T.doTreXacNhan({ quetDen: d('10:00:00'), xnd: d('09:50:00') }).giay, -600);
  assert.deepEqual(T.doTreXacNhan({ quetDen: null, xnd: d('09:50:00') }), { trangThai: 'THIEU_MOC', giay: null });
  assert.equal(T.doTreXacNhan({ quetDen: d('09:50:00') }).trangThai, 'THIEU_MOC');
});

// ---------- bậc nằm lâu ----------
test('phanBacNamLau: biên 0, 180 phút, 181 phút, 360, 720, 1440, 1441 phút, số âm', () => {
  const p = (phut) => T.phanBacNamLau(phut * 60);
  assert.equal(p(0), 'A_DEN_3H');
  assert.equal(p(180), 'A_DEN_3H');
  assert.equal(p(181), 'B_3_6H');
  assert.equal(p(360), 'B_3_6H');
  assert.equal(p(361), 'C_6_12H');
  assert.equal(p(720), 'C_6_12H');
  assert.equal(p(721), 'D_12_24H');
  assert.equal(p(1440), 'D_12_24H');
  assert.equal(p(1441), 'E_TREN_24H');
  assert.equal(T.phanBacNamLau(-1), 'AM');
  assert.equal(T.phanBacNamLau(-86400), 'AM');
  assert.equal(T.phanBacNamLau(10800.5), 'B_3_6H');
  for (const x of [null, undefined, NaN, '3600']) assert.equal(T.phanBacNamLau(x), 'KHONG_RO');
});

// ---------- chuyến ----------
test('sinhMocChuyen: sinh theo ngày, tăng dần, bỏ mục lịch sai dạng', () => {
  const g = T.sinhMocChuyen([{ ten: 'TOI', gioMoc: '22:30', chotTruocPhut: 30 }, { ten: 'SANG', gioMoc: '07:30', chotTruocPhut: 30 }, { ten: 'X', gioMoc: '7:3', chotTruocPhut: 30 }, { ten: 'Y', gioMoc: '24:00', chotTruocPhut: 30 }], 0, 2);
  assert.deepEqual(g.map((x) => [x.ten, x.moc]), [['SANG', 27000], ['TOI', 81000], ['SANG', 27000 + 86400], ['TOI', 81000 + 86400]]);
});

test('danhGiaChuyen: 533140 quét đến 23:00, đi 07:20 hôm sau -> DUNG_CHUYEN, chuyến dự kiến SANG 07:30 hôm sau', () => {
  const r = chuyen({ quetDen: d('23:00:00'), gioDi: d1('07:20:00') });
  assert.equal(r.trangThai, 'DUNG_CHUYEN');
  assert.deepEqual(r.chuyenDuKien, { ten: 'SANG', moc: d1('07:30:00') });
  assert.deepEqual([r.soChuyenTre, r.denSatGio, r.kipChuyenSat, r.lyDo], [0, false, null, null]);
});

test('danhGiaChuyen: quét đến 07:10 (mốc SANG 07:30, hạn chốt 07:00) -> đến sát giờ, chuyến dự kiến TRUA 14:00; đi 07:25 kịp chuyến sát; đi 12:00 thì DUNG_CHUYEN nhưng không kịp', () => {
  const kip = chuyen({ quetDen: d('07:10:00'), gioDi: d('07:25:00') });
  assert.equal(kip.denSatGio, true);
  assert.deepEqual(kip.chuyenDuKien, { ten: 'TRUA', moc: d('14:00:00') });
  assert.deepEqual(kip.chuyenSatGio, { ten: 'SANG', moc: d('07:30:00') });
  assert.equal(kip.kipChuyenSat, true);
  assert.equal(kip.trangThai, 'DUNG_CHUYEN');
  const khong = chuyen({ quetDen: d('07:10:00'), gioDi: d('12:00:00') });
  assert.deepEqual([khong.trangThai, khong.denSatGio, khong.kipChuyenSat], ['DUNG_CHUYEN', true, false]);
  const chuaDi = chuyen({ quetDen: d('07:10:00'), bay_gio: d('09:00:00') });
  assert.deepEqual([chuaDi.trangThai, chuaDi.denSatGio, chuaDi.kipChuyenSat], ['CHUA_DEN_MOC', true, null]);
});

test('danhGiaChuyen: quét đến 14:10, chuyến dự kiến TOI 22:30; đi 07:00 hôm sau -> TRE_CHUYEN, soChuyenTre = 1', () => {
  const r = chuyen({ quetDen: d('14:10:00'), gioDi: d1('07:00:00') });
  assert.equal(r.trangThai, 'TRE_CHUYEN');
  assert.deepEqual(r.chuyenDuKien, { ten: 'TOI', moc: d('22:30:00') });
  assert.equal(r.soChuyenTre, 1);
  assert.equal(r.denSatGio, false); // 14:10 đã quá mốc TRUA 14:00, không nằm trong (13:30, 14:00]
  assert.equal(chuyen({ quetDen: d('14:10:00'), gioDi: d1('07:30:00') }).soChuyenTre, 1); // đi đúng giờ mốc SANG: mốc đó chưa "qua"
  assert.equal(chuyen({ quetDen: d('14:10:00'), gioDi: d1('07:30:01') }).soChuyenTre, 2);
  assert.equal(chuyen({ quetDen: d('14:10:00'), gioDi: d('22:30:00') }).trangThai, 'DUNG_CHUYEN'); // đúng mốc: không trễ
  assert.equal(chuyen({ quetDen: d('14:10:00'), gioDi: d('22:30:01') }).trangThai, 'TRE_CHUYEN');
});

test('danhGiaChuyen: nhiều ngày trễ — danh sách mốc được kéo dài phủ tới gioDi (6 ngày: 1 + 3×5 = 16 chuyến)', () => {
  const r = chuyen({ quetDen: d('14:10:00'), gioDi: '2026-10-26 07:00:00' });
  assert.equal(r.trangThai, 'TRE_CHUYEN');
  assert.equal(r.soChuyenTre, 16);
});

test('danhGiaChuyen: 535790 (chỉ SANG 08:30) quét đến 09:00 -> chuyến dự kiến SANG 08:30 ngày sau', () => {
  const r = chuyen({ maBcvh: '535790', quetDen: d('09:00:00'), bay_gio: d('12:00:00') });
  assert.deepEqual(r.chuyenDuKien, { ten: 'SANG', moc: d1('08:30:00') });
  assert.equal(r.trangThai, 'CHUA_DEN_MOC');
  const sau = chuyen({ maBcvh: '535790', quetDen: d('09:00:00'), gioDi: d1('08:29:00') });
  assert.equal(sau.trangThai, 'DUNG_CHUYEN');
});

test('danhGiaChuyen: chưa đi — bay_gio quá mốc dự kiến -> LO_CHUYEN (kèm số chuyến đã lỡ); chưa quá -> CHUA_DEN_MOC', () => {
  const lo = chuyen({ quetDen: d('23:00:00'), bay_gio: d1('07:31:00') });
  assert.deepEqual([lo.trangThai, lo.soChuyenTre], ['LO_CHUYEN', 1]);
  const lo2 = chuyen({ quetDen: d('23:00:00'), bay_gio: d1('14:01:00') });
  assert.deepEqual([lo2.trangThai, lo2.soChuyenTre], ['LO_CHUYEN', 2]);
  assert.equal(chuyen({ quetDen: d('23:00:00'), bay_gio: d1('07:30:00') }).trangThai, 'CHUA_DEN_MOC'); // đúng mốc chưa lỡ
  const chua = chuyen({ quetDen: d('23:00:00'), bay_gio: d1('06:00:00') });
  assert.deepEqual([chua.trangThai, chua.soChuyenTre], ['CHUA_DEN_MOC', 0]);
});

test('danhGiaChuyen: KHONG_AP_DUNG khi đích KHAC / BCVH không có lịch / thiếu mốc quét đến / thiếu bay_gio', () => {
  const kad = (r, lyDo) => { assert.equal(r.trangThai, 'KHONG_AP_DUNG'); assert.equal(r.lyDo, lyDo); assert.equal(r.chuyenDuKien, null); assert.equal(r.soChuyenTre, null); };
  kad(chuyen({ maBcvh: '599999', quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'DICH_KHONG_PHAI_BCVH_HUE');
  kad(chuyen({ maBcvh: '530900', quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'DICH_KHONG_PHAI_BCVH_HUE');
  kad(chuyen({ maBcvh: null, quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'DICH_KHONG_PHAI_BCVH_HUE');
  kad(chuyen({ maBcvh: '536250', quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'KHONG_CO_LICH'); // BCVH Huế nhưng cấu hình không có lịch
  kad(chuyen({ cauHinh: { lich: { 533140: [] } }, quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'KHONG_CO_LICH');
  kad(chuyen({ cauHinh: undefined, quetDen: d('10:00:00'), gioDi: d('11:00:00') }), 'KHONG_CO_LICH');
  kad(chuyen({ quetDen: null, gioDi: d('11:00:00') }), 'THIEU_MOC_QUET_DEN');
  kad(chuyen({ quetDen: d('10:00:00') }), 'THIEU_BAY_GIO');
});

test('danhGiaChuyen: cạnh biên — quét đến đúng mốc − 30 phút còn kịp; mốc − 29 phút là sát giờ', () => {
  const kip = chuyen({ quetDen: d('13:30:00'), bay_gio: d('13:45:00') });
  assert.deepEqual(kip.chuyenDuKien, { ten: 'TRUA', moc: d('14:00:00') });
  assert.equal(kip.denSatGio, false);
  const sat = chuyen({ quetDen: d('13:31:00'), bay_gio: d('13:45:00') });
  assert.equal(sat.denSatGio, true);
  assert.deepEqual(sat.chuyenDuKien, { ten: 'TOI', moc: d('22:30:00') });
  assert.deepEqual(sat.chuyenSatGio, { ten: 'TRUA', moc: d('14:00:00') });
  const dungMoc = chuyen({ quetDen: d('14:00:00'), bay_gio: d('14:05:00') }); // đúng mốc: vẫn nằm trong (mốc − chốt, mốc]
  assert.equal(dungMoc.denSatGio, true);
  assert.equal(dungMoc.chuyenDuKien.ten, 'TOI');
  const saiMoc = chuyen({ quetDen: d('14:00:01'), bay_gio: d('14:05:00') }); // quá mốc 1 giây: không còn "sát giờ"
  assert.equal(saiMoc.denSatGio, false);
  assert.equal(saiMoc.chuyenDuKien.ten, 'TOI');
});

test('danhGiaChuyen: hạn chốt riêng từng chuyến; mốc đầu ngày sau nửa đêm có hạn chốt rơi vào ngày trước', () => {
  const cfg = { lich: { 533140: [{ ten: 'SANG', gioMoc: '00:10', chotTruocPhut: 30 }, { ten: 'TRUA', gioMoc: '12:00', chotTruocPhut: 0 }] } };
  const sat = chuyen({ cauHinh: cfg, quetDen: d('23:50:00'), bay_gio: d1('00:05:00') });
  assert.equal(sat.denSatGio, true); // 23:50 ∈ (23:40, 00:10]
  assert.deepEqual(sat.chuyenSatGio, { ten: 'SANG', moc: d1('00:10:00') });
  assert.deepEqual(sat.chuyenDuKien, { ten: 'TRUA', moc: d1('12:00:00') });
  const khongChot = chuyen({ cauHinh: cfg, quetDen: d('12:00:00'), bay_gio: d('12:01:00') }); // chốt 0 phút: quét đúng mốc vẫn kịp
  assert.deepEqual(khongChot.chuyenDuKien, { ten: 'TRUA', moc: d('12:00:00') });
  assert.equal(khongChot.denSatGio, false);
});

test('danhGiaChuyen: gioDi sớm hơn quetDen vẫn trả DUNG_CHUYEN kèm cờ gioDiTruocQuetDen (không chỉnh mốc)', () => {
  const r = chuyen({ quetDen: d('10:00:00'), gioDi: d('09:00:00') });
  assert.deepEqual([r.trangThai, r.gioDiTruocQuetDen], ['DUNG_CHUYEN', true]);
});

// ---------- nằm lâu ----------
const NAM = (o) => T.trangThaiNamLau({ nhomDich: 'BCVH_HUE', nguong: T.NGUONG_MAC_DINH, ...o });

test('trangThaiNamLau: TRE_CHUYEN -> NAM_LAU dù nằm ngắn', () => {
  const tre = chuyen({ quetDen: d('14:10:00'), gioDi: d1('07:00:00') });
  const r = NAM({ gioDi: d1('07:00:00'), giayNam: 3600, danhGiaChuyen: tre });
  assert.deepEqual(r, { trangThai: 'NAM_LAU', lyDo: 'TRE_CHUYEN' });
});

test('trangThaiNamLau: đi đúng chuyến nằm 17 giờ qua đêm -> BINH_THUONG; 25 giờ -> NAM_LAU; đúng 24 giờ chưa vượt', () => {
  const cauHinh = { lich: { 535790: [{ ten: 'SANG', gioMoc: '08:30', chotTruocPhut: 30 }] } };
  const quetDen = d('15:00:00');
  const gioDi = d1('08:00:00');
  const dg = T.danhGiaChuyen({ quetDen, gioDi, maBcvh: '535790', cauHinh });
  assert.equal(dg.trangThai, 'DUNG_CHUYEN');
  const nam = T.namThucTe({ quetDen, gioDi });
  assert.equal(nam.giay, 17 * 3600);
  assert.deepEqual(NAM({ gioDi, giayNam: nam.giay, danhGiaChuyen: dg }), { trangThai: 'BINH_THUONG', lyDo: null });
  assert.deepEqual(NAM({ gioDi, giayNam: 25 * 3600, danhGiaChuyen: dg }), { trangThai: 'NAM_LAU', lyDo: 'QUA_NGUONG' });
  assert.equal(NAM({ gioDi, giayNam: 24 * 3600, danhGiaChuyen: dg }).trangThai, 'BINH_THUONG');
  assert.equal(NAM({ gioDi, giayNam: 24 * 3600 + 1, danhGiaChuyen: dg }).trangThai, 'NAM_LAU');
});

test('trangThaiNamLau: đích không phải BCVH Huế -> KHONG_DANH_GIA; chưa đi -> KHONG_DANH_GIA (không đánh giá nằm lâu); ngưỡng cấu hình được dùng', () => {
  for (const nhom of ['KHAC', 'HE1_530900', 'KTT', 'KHONG_RO']) {
    assert.deepEqual(NAM({ nhomDich: nhom, gioDi: d1('08:00:00'), giayNam: 99 * 3600 }), { trangThai: 'KHONG_DANH_GIA', lyDo: 'DICH_KHONG_PHAI_BCVH_HUE' });
  }
  assert.deepEqual(NAM({ gioDi: null, giayNam: 99 * 3600 }), { trangThai: 'KHONG_DANH_GIA', lyDo: 'CHUA_DI' });
  assert.deepEqual(NAM({ gioDi: '', giayNam: 99 * 3600, danhGiaChuyen: { trangThai: 'LO_CHUYEN' } }), { trangThai: 'KHONG_DANH_GIA', lyDo: 'CHUA_DI' });
  assert.equal(NAM({ gioDi: d1('08:00:00'), giayNam: 3 * 3600, nguong: { namLauToiDaPhut: 120 } }).trangThai, 'NAM_LAU');
  assert.deepEqual(NAM({ gioDi: d1('08:00:00'), giayNam: null }), { trangThai: 'KHONG_DANH_GIA', lyDo: 'THIEU_SO_LIEU' });
  assert.deepEqual(NAM({ gioDi: d1('08:00:00'), giayNam: -60 }), { trangThai: 'KHONG_DANH_GIA', lyDo: 'GIO_NAM_AM' });
  assert.equal(T.trangThaiNamLau({ nhomDich: 'BCVH_HUE', gioDi: d1('08:00:00'), giayNam: 3600 }).trangThai, 'BINH_THUONG'); // không truyền nguong / danhGiaChuyen
});

// ---------- treo ----------
test('trangThaiTreo: túi DI_NGOAI chiều đến chưa mở quá 180 phút -> CHUA_MO_TUI (đúng 180 phút chưa treo)', () => {
  const r = T.trangThaiTreo({ chieu: 'DEN', luong: 'DI_NGOAI', nhomDich: 'KHAC', quetDen: d('10:00:00'), coMoTui: false, bay_gio: d('13:01:00'), nguong: T.NGUONG_MAC_DINH });
  assert.deepEqual(r, { trangThai: 'CHUA_MO_TUI', tuoiGiay: 10860, tuoi: 'T_3_12H' });
  assert.equal(T.trangThaiTreo({ chieu: 'DEN', luong: 'DI_NGOAI', quetDen: d('10:00:00'), coMoTui: false, bay_gio: d('13:00:00') }).trangThai, 'CHUA_DEN_NGUONG');
});

test('trangThaiTreo: túi KHAI_THAC_DI chiều đi KHÔNG phải CHUA_MO_TUI (chưa mở túi không liên quan chiều đi)', () => {
  for (const chieu of ['DI', 'CHUYEN_TIEP_DI']) {
    const r = T.trangThaiTreo({ chieu, luong: 'KHAI_THAC_DI', nhomDich: 'BCVH_HUE', quetDen: d('10:00:00'), coMoTui: false, coQuetDi: true, coBd10Di: true, bay_gio: d('20:00:00'), nguong: T.NGUONG_MAC_DINH });
    assert.notEqual(r.trangThai, 'CHUA_MO_TUI');
    assert.equal(r.trangThai, 'KHONG_TREO'); // đã có mã 3 / BD10 đi, hoặc chiều DI không thuộc diện treo
  }
  // chiều chuyển tiếp đi chưa quét đi vẫn là CHUA_QUET_DI, không phải CHUA_MO_TUI
  assert.equal(T.trangThaiTreo({ chieu: 'CHUYEN_TIEP_DI', luong: 'KHAI_THAC_DI', nhomDich: 'BCVH_HUE', quetDen: d('10:00:00'), coMoTui: false, coQuetDi: false, coBd10Di: false, bay_gio: d('20:00:00') }).trangThai, 'CHUA_QUET_DI');
});
const TREO = (o) => T.trangThaiTreo({ chieu: 'CHUYEN_TIEP_DI', luong: 'KHAI_THAC_DI', nhomDich: 'BCVH_HUE', quetDen: d('10:00:00'), coMoTui: false, coQuetDi: false, coBd10Di: false, bay_gio: d('13:01:00'), nguong: T.NGUONG_MAC_DINH, ...o });

test('trangThaiTreo CHUA_QUET_DI: đúng ngưỡng 180 phút chưa treo, 181 phút treo', () => {
  assert.deepEqual(TREO({ bay_gio: d('13:00:00') }), { trangThai: 'CHUA_DEN_NGUONG', tuoiGiay: 10800, tuoi: null });
  assert.deepEqual(TREO({ bay_gio: d('13:01:00') }), { trangThai: 'CHUA_QUET_DI', tuoiGiay: 10860, tuoi: 'T_3_12H' });
  assert.equal(TREO({ bay_gio: d('12:59:59') }).trangThai, 'CHUA_DEN_NGUONG');
  assert.equal(TREO({ bay_gio: d('09:00:00') }).trangThai, 'CHUA_DEN_NGUONG'); // bay_gio sớm hơn mã 4: tuổi âm, chưa treo
});

test('trangThaiTreo CHUA_QUET_DI: có mã 3 / có BD10 đi / đích 530900 / chiều khác -> KHONG_TREO; đích KHAC và KHONG_RO vẫn xét', () => {
  assert.equal(TREO({ coQuetDi: true }).trangThai, 'KHONG_TREO');
  assert.equal(TREO({ coBd10Di: true }).trangThai, 'KHONG_TREO');
  assert.equal(TREO({ nhomDich: 'HE1_530900' }).trangThai, 'KHONG_TREO');
  assert.equal(TREO({ chieu: 'DI' }).trangThai, 'KHONG_TREO');
  assert.equal(TREO({ nhomDich: 'KHAC' }).trangThai, 'CHUA_QUET_DI');
  assert.equal(TREO({ nhomDich: 'KHONG_RO' }).trangThai, 'CHUA_QUET_DI');
});

test('trangThaiTreo CHUA_MO_TUI: chiều đến (MỌI luồng), không mở túi, quá ngưỡng', () => {
  const mo = (o) => TREO({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', ...o });
  assert.equal(mo({ bay_gio: d('13:00:00') }).trangThai, 'CHUA_DEN_NGUONG');
  assert.equal(mo({ bay_gio: d('13:01:00') }).trangThai, 'CHUA_MO_TUI');
  assert.equal(mo({ coMoTui: true }).trangThai, 'KHONG_TREO');
  // chiều đến, mọi luồng đều xét (kể cả DI_NGOAI và KHAI_THAC_DEN)
  for (const luong of ['DI_NGOAI', 'KHAI_THAC_DEN', 'DA_CHIA_SAN', 'KHAI_THAC_DI', null, undefined]) {
    assert.equal(mo({ luong, bay_gio: d('13:01:00') }).trangThai, 'CHUA_MO_TUI', String(luong));
    assert.equal(mo({ luong, bay_gio: d('13:00:00') }).trangThai, 'CHUA_DEN_NGUONG', String(luong));
    assert.equal(mo({ luong, coMoTui: true }).trangThai, 'KHONG_TREO', String(luong));
  }
  assert.equal(mo({ coQuetDi: true, coBd10Di: true }).trangThai, 'CHUA_MO_TUI'); // mã 3 / BD10 đi không liên quan túi chiều đến chưa mở
  assert.equal(mo({ nhomDich: 'HE1_530900' }).trangThai, 'CHUA_MO_TUI');
});

test('trangThaiTreo: thiếu mã 4 -> KHONG_CO_MOC_QUET_DEN (với hàng thuộc diện xét); hàng ngoài diện xét thì KHONG_TREO', () => {
  for (const q of [null, undefined, '', 'NULL']) {
    assert.equal(TREO({ quetDen: q }).trangThai, 'KHONG_CO_MOC_QUET_DEN');
    assert.equal(TREO({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', quetDen: q }).trangThai, 'KHONG_CO_MOC_QUET_DEN');
  }
  assert.equal(TREO({ quetDen: null, coQuetDi: true }).trangThai, 'KHONG_TREO');
  assert.equal(TREO({ bay_gio: null }).trangThai, 'THIEU_BAY_GIO');
});

test('trangThaiTreo: bậc tuổi 3–12 giờ, 12–24 giờ, 1–3 ngày, trên 3 ngày; ngưỡng cấu hình được dùng', () => {
  const tuoi = (giay) => TREO({ bay_gio: T.dinhDangGiay(Date.UTC(2026, 9, 20, 10, 0, 0) / 1000 + giay) });
  assert.equal(tuoi(5 * 3600).tuoi, 'T_3_12H');
  assert.equal(tuoi(12 * 3600).tuoi, 'T_3_12H');
  assert.equal(tuoi(12 * 3600 + 1).tuoi, 'T_12_24H');
  assert.equal(tuoi(24 * 3600).tuoi, 'T_12_24H');
  assert.equal(tuoi(24 * 3600 + 1).tuoi, 'T_1_3N');
  assert.equal(tuoi(3 * 86400).tuoi, 'T_1_3N');
  assert.equal(tuoi(3 * 86400 + 1).tuoi, 'T_TREN_3N');
  assert.equal(tuoi(4 * 86400).tuoi, 'T_TREN_3N');
  assert.equal(tuoi(4 * 86400).tuoiGiay, 4 * 86400);
  const ngan = TREO({ nguong: { treoPhut: 60 }, bay_gio: d('11:01:00') });
  assert.deepEqual([ngan.trangThai, ngan.tuoi], ['CHUA_QUET_DI', 'DUOI_3H']);
  assert.equal(TREO({ nguong: { treoPhut: 60 }, bay_gio: d('11:00:00') }).trangThai, 'CHUA_DEN_NGUONG');
  assert.equal(TREO({ nguong: undefined, bay_gio: d('13:01:00') }).trangThai, 'CHUA_QUET_DI'); // thiếu nguong -> 180
});

// ---------- dinhDangGiay ----------
test('dinhDangGiay: đảo ngược docGiay, kể cả năm nhuận và đầu / cuối năm', () => {
  const { docGiay } = require('../server/lib/quyThoiGian');
  for (const s of ['2024-02-29 23:59:59', '2026-12-31 23:59:59', '2027-01-01 00:00:00', '2026-03-01 00:00:00', '2100-02-28 12:34:56', '1970-01-01 00:00:00', '1969-12-31 23:59:59']) {
    assert.equal(T.dinhDangGiay(docGiay(s)), s);
  }
});

// ---------- mã nguồn thuần + múi giờ ----------
test('mã nguồn kttTinh.js / kttCauHinh.js: không dùng new Date( / Date.parse; kttTinh.js không require DB', () => {
  const tinh = fs.readFileSync(KTT_TINH, 'utf8');
  const cauHinh = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttCauHinh.js'), 'utf8');
  for (const [ten, noiDung] of [['kttTinh', tinh], ['kttCauHinh', cauHinh]]) {
    assert.ok(!/new Date\(|Date\.parse|Date\.now/.test(noiDung), `${ten}: dùng đối tượng Date`);
  }
  assert.ok(!/better-sqlite3|require\('\.\/db'\)|require\("\.\.\/db"\)/.test(tinh));
  assert.deepEqual([...tinh.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]), ['./quyThoiGian']);
});

test('kết quả giống nhau ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (tiến trình con; có kiểm TZ thật sự khác nhau)', () => {
  const ma = `
    const T = require(${JSON.stringify(KTT_TINH)});
    const cfg = { lich: { 533140: [{ ten: 'SANG', gioMoc: '07:30', chotTruocPhut: 30 }, { ten: 'TRUA', gioMoc: '14:00', chotTruocPhut: 30 }, { ten: 'TOI', gioMoc: '22:30', chotTruocPhut: 30 }] } };
    const ng = T.NGUONG_MAC_DINH;
    const kq = {
      chiTieu: T.tinhChiTieu({ xnd: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14', maBcvh: '533140', nguong: ng }),
      chuyenA: T.danhGiaChuyen({ quetDen: '2026-03-28 23:00:00', gioDi: '2026-03-29 07:20:00', maBcvh: '533140', cauHinh: cfg }),
      chuyenB: T.danhGiaChuyen({ quetDen: '2026-10-25 14:10:00', gioDi: '2026-10-26 07:00:00', maBcvh: '533140', cauHinh: cfg }),
      chuyenC: T.danhGiaChuyen({ quetDen: '2026-11-01 07:10:00', bay_gio: '2026-11-02 09:00:00', maBcvh: '533140', cauHinh: cfg }),
      nam: T.namThucTe({ quetDen: '2026-03-28 20:00:00', gioDi: '2026-03-29 08:00:00' }),
      treo: T.trangThaiTreo({ chieu: 'CHUYEN_TIEP_DI', nhomDich: 'KHAC', quetDen: '2026-11-01 01:00:00', bay_gio: '2026-11-01 05:00:00', nguong: ng }),
      dinhDang: T.dinhDangGiay(1792000000)
    };
    console.log(JSON.stringify({ tz: new Date(Date.UTC(2026, 5, 1)).getTimezoneOffset(), kq }));`;
  const chay = (tz) => {
    const r = spawnSync(process.execPath, ['-e', ma], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const ds = ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'].map(chay);
  assert.deepEqual(ds.map((x) => x.tz), [0, -420, 420], 'TZ của tiến trình con phải thật sự khác nhau (UTC, UTC+7, UTC−7 mùa hè)');
  assert.deepEqual(ds[1].kq, ds[0].kq);
  assert.deepEqual(ds[2].kq, ds[0].kq);
  assert.equal(ds[0].kq.chiTieu.conLaiGiay, 27586);
  assert.equal(ds[0].kq.nam.giay, 12 * 3600); // 28→29/03/2026 là ngày đổi giờ mùa hè ở Los Angeles: vẫn đúng 12 giờ
});
