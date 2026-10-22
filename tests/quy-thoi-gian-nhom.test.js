// ==========================================
// Test QUYTG-3: lõi thuần server/lib/quyThoiGianNhom.js (không DB, không server). Mã BCVH và BD10 GIẢ; không phụ thuộc TZ máy.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../server/lib/quyThoiGianNhom');
const Q = require('../server/lib/quyThoiGian');

const BC = '539999';
const KTT_BD10 = '530100539999610211';
const KHAC_BD10 = '531120539999610211';
const nhom = (b, m = BC) => N.phanNhomBd10(b, m);
const luot = (o) => N.danhGiaMotLuot({ bd10No: KTT_BD10, maBcvhNhan: BC, ktt: '2026-10-20 15:25:00', xnd: '2026-10-21 07:45:14', ...o });
const NGOAI = '700916539999610211';
const KHOA = ['chiTieuGio', 'lyDo', 'nghiNgo', 'nguonMocBatDau', 'nhom', 'quyConLaiGiay', 'thoiGianThucGiay', 'trangThai'];

test('hằng số và nhãn đủ', () => {
  assert.equal(N.MA_KTT, '530100');
  assert.equal(N.NGUONG_NGHI_NGO_GIAY, 604800);
  assert.deepEqual(Object.keys(N.NHOM_BD10).sort(), ['KHONG_HOP_LE', 'KTT', 'LAP_DI_TAI_BCVH', 'NGOAI_53', 'NOI_TINH_KHAC', 'RONG']);
  for (const k of Object.keys(N.NHOM_BD10)) { assert.equal(N.NHOM_BD10[k], k); assert.ok(N.NHAN_NHOM[k]); }
  for (const k of Object.keys(N.LY_DO)) { assert.equal(N.LY_DO[k], k); assert.ok(N.NHAN_LY_DO[k], k); }
  assert.equal(N.NHAN_NHOM.KTT, 'Qua KTT (530100)');
  assert.equal(N.NHAN_NHOM.NGOAI_53, 'Tỉnh khác, trực tiếp');
});

test('phanNhomBd10: các nhóm', () => {
  assert.equal(nhom(KTT_BD10), 'KTT');
  assert.equal(nhom('539999530100610203'), 'LAP_DI_TAI_BCVH');
  assert.equal(nhom(KHAC_BD10), 'NOI_TINH_KHAC');
  assert.equal(nhom('532350539999610211'), 'NOI_TINH_KHAC');
  assert.equal(nhom('700916539999610211'), 'NGOAI_53');
  for (const x of ['', ' ', '   ', 'NULL', 'null', ' Null ', null, undefined]) assert.equal(nhom(x), 'RONG', String(x));
  assert.equal(nhom('53012'), 'KHONG_HOP_LE');
  assert.equal(nhom('5'), 'KHONG_HOP_LE');
});

test('phanNhomBd10: khoảng trắng, thứ tự ưu tiên, kiểu số', () => {
  assert.equal(nhom('  530100539999610211  '), 'KTT');
  assert.equal(nhom(' 539999530100610203 '), 'LAP_DI_TAI_BCVH');
  assert.equal(N.phanNhomBd10('530100539999610211', ' 539999 '), 'KTT');
  assert.equal(N.phanNhomBd10('530100539999610211', '530100'), 'KTT'); // KTT thắng lập đi
  assert.equal(N.phanNhomBd10('539999530100610203'), 'NOI_TINH_KHAC'); // không truyền mã BCVH
  assert.equal(N.phanNhomBd10('539999530100610203', ''), 'NOI_TINH_KHAC');
  assert.equal(N.phanNhomBd10('539999530100610203', '   '), 'NOI_TINH_KHAC');
  assert.equal(N.phanNhomBd10('539999530100610203', null), 'NOI_TINH_KHAC');
  assert.equal(N.phanNhomBd10('700916539999610211', '700916'), 'LAP_DI_TAI_BCVH'); // lập đi thắng NGOAI_53
  assert.equal(N.phanNhomBd10(530100539999610211, 539999), 'KTT'); // kiểu số
  assert.equal(N.phanNhomBd10(539999530100610203, 539999), 'LAP_DI_TAI_BCVH');
  assert.equal(N.phanNhomBd10(700916539999610211, 539999), 'NGOAI_53');
  assert.equal(N.phanNhomBd10('539999'), 'NOI_TINH_KHAC'); // đúng 6 ký tự
  assert.equal(N.phanNhomBd10('539999', BC), 'LAP_DI_TAI_BCVH');
  assert.equal(N.phanNhomBd10('NULL', BC), 'RONG');
});

test('danhGiaMotLuot: đo được (ví dụ chuẩn)', () => {
  const r = luot();
  assert.deepEqual(Object.keys(r).sort(), KHOA);
  assert.equal(r.nhom, 'KTT');
  assert.equal(r.trangThai, 'DO_DUOC');
  assert.equal(r.lyDo, null);
  assert.equal(r.thoiGianThucGiay, 22814);
  assert.deepEqual(r.quyConLaiGiay, { F1_3: 27586, F4_1: 22186, F4_2: 18586 });
  assert.equal(r.nghiNgo, false);
  assert.equal(r.nguonMocBatDau, 'KTT');
  assert.equal(luot({ bd10No: KHAC_BD10 }).nguonMocBatDau, 'KTT');
  assert.equal(luot({ bd10No: KHAC_BD10 }).trangThai, 'DO_DUOC'); // nhóm 53 khác có KTT
  assert.equal(luot({ bd10No: '700916539999610211' }).trangThai, 'DO_DUOC'); // ngoài 53 có KTT
  const bang = luot({ ktt: '2026-10-20 10:00:00', xnd: '2026-10-20 10:00:00' }); // bằng nhau
  assert.equal(bang.trangThai, 'DO_DUOC');
  assert.equal(bang.thoiGianThucGiay, 0);
  assert.equal(bang.quyConLaiGiay.F1_3, 14 * 3600);
});

test('danhGiaMotLuot: số âm', () => {
  const r = luot({ ktt: '2026-10-01 20:01:00', xnd: '2026-10-01 14:04:00' });
  assert.equal(r.trangThai, 'AM');
  assert.equal(r.lyDo, 'KTT_SAU_XND_BCVH');
  assert.ok(r.thoiGianThucGiay < 0);
  assert.equal(r.thoiGianThucGiay, -Q.thoiGianThucGiay('2026-10-01 14:04:00', '2026-10-01 20:01:00'));
  assert.equal(r.thoiGianThucGiay, -21420);
  assert.equal(r.quyConLaiGiay, null);
  assert.equal(r.nghiNgo, false);
});

test('danhGiaMotLuot: hết quỹ (F4_2 âm, F1_3 còn dương)', () => {
  const r = luot({ ktt: '2026-10-20 08:00:00', xnd: '2026-10-20 19:31:00' }); // 11 giờ 31 phút = 41460 giây
  assert.equal(r.trangThai, 'DO_DUOC');
  assert.equal(r.thoiGianThucGiay, 41460);
  assert.deepEqual(r.quyConLaiGiay, { F1_3: 8940, F4_1: 3540, F4_2: -60 });
  const het = luot({ ktt: '2026-10-20 07:00:00', xnd: '2026-10-20 21:00:00' }); // 14 giờ đúng
  assert.deepEqual(het.quyConLaiGiay, { F1_3: 0, F4_1: -5400, F4_2: -9000 });
});

test('danhGiaMotLuot: thiếu mốc theo nhóm', () => {
  const khongKtt = (b, v) => luot({ bd10No: b, ktt: v });
  for (const v of ['', null, undefined, 'NULL', 'null', '2026-13-40 00:00:00']) {
    assert.equal(khongKtt(KTT_BD10, v).lyDo, 'THIEU_XAC_NHAN_KTT');
    assert.equal(khongKtt(KHAC_BD10, v).lyDo, 'KHONG_QUA_KTT');
    assert.equal(khongKtt(NGOAI, v).trangThai, 'DO_DUOC'); // QUYTG-7a: ngoài 53 không cần KTT (đo từ XNĐ BCVH)
    assert.equal(khongKtt(KTT_BD10, v).trangThai, 'KHONG_DO_DUOC');
  }
  for (const v of ['', null, undefined, 'NULL', 'hỏng']) {
    for (const b of [KTT_BD10, KHAC_BD10, '700916539999610211']) {
      const r = luot({ bd10No: b, xnd: v });
      assert.equal(r.trangThai, 'KHONG_DO_DUOC');
      assert.equal(r.lyDo, 'THIEU_XND_BCVH');
      assert.equal(r.thoiGianThucGiay, null);
      assert.equal(r.quyConLaiGiay, null);
    }
  }
  // thiếu cả hai: ưu tiên báo thiếu KTT
  assert.equal(luot({ ktt: '', xnd: '' }).lyDo, 'THIEU_XAC_NHAN_KTT');
});

test('danhGiaMotLuot: nhóm ngoài 53 đo từ XNĐ BCVH (QUYTG-7a)', () => {
  const ngoai = (o) => luot({ bd10No: NGOAI, ...o });
  const XND = '2026-10-21 07:45:14';
  const r = ngoai({ ktt: '', xnd: XND });
  assert.deepEqual(Object.keys(r).sort(), KHOA);
  assert.deepEqual([r.nhom, r.trangThai, r.lyDo, r.nghiNgo, r.nguonMocBatDau], ['NGOAI_53', 'DO_DUOC', null, false, 'XND_BCVH']);
  assert.equal(r.thoiGianThucGiay, 0);
  assert.equal(r.chiTieuGio, 14);
  assert.deepEqual(r.quyConLaiGiay, { F1_3: 50400, F4_1: 12.5 * 3600, F4_2: 11.5 * 3600 }); // 14 giờ = 50.400 s
  // chỉ tiêu của lượt (QUYTG-7b): 12 giờ -> 43.200 s; F4_1 / F4_2 không đổi
  const r12 = ngoai({ ktt: null, xnd: XND, chiTieuF13Gio: 12 });
  assert.equal(r12.chiTieuGio, 12);
  assert.equal(r12.quyConLaiGiay.F1_3, 43200);
  assert.deepEqual([r12.quyConLaiGiay.F4_1, r12.quyConLaiGiay.F4_2], [r.quyConLaiGiay.F4_1, r.quyConLaiGiay.F4_2]);
  assert.equal(r12.nguonMocBatDau, 'XND_BCVH');
  // có KTT giả (trước, sau, cách XNĐ rất xa, hỏng) vẫn bỏ qua; kết quả y hệt ca không có KTT; không âm, không nghi ngờ
  for (const ktt of ['2026-10-21 07:45:14', '2026-10-20 08:00:00', '2026-10-21 12:00:00', '2026-01-01 00:00:00', '2027-01-01 00:00:00', 'hỏng', 'NULL']) {
    assert.deepEqual(ngoai({ ktt, xnd: XND }), r, ktt);
    assert.deepEqual(ngoai({ ktt, xnd: XND, chiTieuF13Gio: 12 }), r12, ktt);
  }
  assert.ok(r.thoiGianThucGiay >= 0 && Object.values(r.quyConLaiGiay).every((g) => g > 0));
  // không có XNĐ (kể cả khi có KTT) -> không đo được
  for (const xnd of ['', null, undefined, 'NULL', 'hỏng', '2026-02-30 00:00:00']) {
    for (const ktt of ['', '2026-10-20 15:25:00']) {
      const k = ngoai({ ktt, xnd });
      assert.deepEqual([k.trangThai, k.lyDo, k.thoiGianThucGiay, k.quyConLaiGiay, k.nghiNgo, k.nguonMocBatDau], ['KHONG_DO_DUOC', 'THIEU_XND_BCVH', null, null, false, null], String(xnd));
    }
  }
  // các nhóm khác không đổi: KTT / 53 khác vẫn đo từ KTT; không đo -> nguonMocBatDau null
  assert.equal(luot({ xnd: '2026-10-20 15:25:00' }).nguonMocBatDau, 'KTT');
  assert.equal(luot({ ktt: '2026-10-21 09:00:00', xnd: '2026-10-21 08:00:00' }).nguonMocBatDau, 'KTT'); // AM vẫn đo từ KTT
  assert.equal(luot({ ktt: '' }).nguonMocBatDau, null);
  assert.equal(luot({ bd10No: KHAC_BD10, ktt: '' }).lyDo, 'KHONG_QUA_KTT');
  for (const b of ['539999530100610203', '', '53012']) assert.equal(luot({ bd10No: b }).nguonMocBatDau, null);
});

test('danhGiaMotLuot: nhóm không đo dù có đủ hai mốc', () => {
  const lapDi = luot({ bd10No: '539999530100610203' });
  assert.deepEqual([lapDi.nhom, lapDi.trangThai, lapDi.lyDo], ['LAP_DI_TAI_BCVH', 'KHONG_DO_DUOC', 'LAP_DI_TAI_BCVH']);
  for (const b of ['', ' ', 'NULL', null, undefined]) {
    const r = luot({ bd10No: b });
    assert.deepEqual([r.nhom, r.trangThai, r.lyDo], ['RONG', 'KHONG_DO_DUOC', 'KHONG_CO_BD10']);
  }
  const hong = luot({ bd10No: '53012' });
  assert.deepEqual([hong.nhom, hong.trangThai, hong.lyDo], ['KHONG_HOP_LE', 'KHONG_DO_DUOC', 'BD10_KHONG_HOP_LE']);
  for (const r of [lapDi, hong]) { assert.equal(r.thoiGianThucGiay, null); assert.equal(r.quyConLaiGiay, null); assert.equal(r.nghiNgo, false); }
});

test('danhGiaMotLuot: nghi ngờ quá 7 ngày', () => {
  const dung = luot({ ktt: '2026-10-01 08:00:00', xnd: '2026-10-08 08:00:00' });
  assert.equal(dung.nghiNgo, false);
  assert.equal(dung.trangThai, 'DO_DUOC');
  const hon = luot({ ktt: '2026-10-01 08:00:00', xnd: '2026-10-08 08:00:01' });
  assert.equal(hon.nghiNgo, true);
  assert.equal(hon.trangThai, 'DO_DUOC');
  assert.equal(hon.lyDo, null); // không thay bằng NGHI_NGO_QUA_7_NGAY
  assert.equal(typeof hon.thoiGianThucGiay, 'number');
  assert.ok(hon.quyConLaiGiay.F1_3 < 0);
  const am = luot({ ktt: '2026-10-08 08:00:01', xnd: '2026-10-01 08:00:00' });
  assert.equal(am.nghiNgo, true);
  assert.equal(am.trangThai, 'AM');
  assert.equal(am.lyDo, 'KTT_SAU_XND_BCVH');
  assert.equal(luot({ ktt: '2026-10-08 08:00:00', xnd: '2026-10-01 08:00:00' }).nghiNgo, false);
  // ngưỡng tùy chỉnh
  const hep = luot({ ktt: '2026-10-20 08:00:00', xnd: '2026-10-20 10:00:01', nguongNghiNgoGiay: 7200 });
  assert.equal(hep.nghiNgo, true);
  assert.equal(luot({ ktt: '2026-10-20 08:00:00', xnd: '2026-10-20 10:00:00', nguongNghiNgoGiay: 7200 }).nghiNgo, false);
  // thiếu mốc thì không nghi ngờ
  assert.equal(luot({ xnd: '' }).nghiNgo, false);
});

test('danhGiaMotLuot: đầu vào xấu không ném lỗi, luôn đủ khóa', () => {
  const xau = [undefined, null, 42, 'chuỗi', [], {}, { bd10No: 'NULL', ktt: 'NULL', xnd: 'NULL' }, { bd10No: KTT_BD10, ktt: 'NULL', xnd: undefined },
    { bd10No: KTT_BD10, ktt: '2026-02-30 00:00:00', xnd: '2026-10-21 25:00:00' }, { bd10No: 12345, maBcvhNhan: {}, ktt: 5, xnd: {} }];
  for (const x of xau) {
    let r;
    assert.doesNotThrow(() => { r = N.danhGiaMotLuot(x); });
    assert.deepEqual(Object.keys(r).sort(), KHOA);
    assert.ok(['DO_DUOC', 'AM', 'KHONG_DO_DUOC'].includes(r.trangThai));
  }
  assert.equal(N.danhGiaMotLuot().lyDo, 'KHONG_CO_BD10');
});

test('mọi kết quả đủ 8 khóa; lyDo luôn nằm trong LY_DO hoặc null', () => {
  const bd10s = [KTT_BD10, KHAC_BD10, '700916539999610211', '539999530100610203', '', '53012'];
  const moc = ['', '2026-10-20 08:00:00', '2026-10-27 08:00:01', '2026-10-13 07:59:59'];
  for (const b of bd10s) for (const k of moc) for (const x of moc) {
    const r = luot({ bd10No: b, ktt: k, xnd: x });
    assert.deepEqual(Object.keys(r).sort(), KHOA);
    assert.ok(r.lyDo === null || Object.values(N.LY_DO).includes(r.lyDo));
    assert.equal(r.lyDo === null, r.trangThai === 'DO_DUOC');
    assert.equal(r.quyConLaiGiay !== null, r.trangThai === 'DO_DUOC');
  }
});
