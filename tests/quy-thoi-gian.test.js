// ==========================================
// Test QUYTG-2: lõi thuần server/lib/quyThoiGian.js (không DB, không server). Dữ liệu giả; không phụ thuộc TZ máy.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../server/lib/quyThoiGian');

const H = 3600;
const thuc = (tu, den) => Q.thoiGianThucGiay(tu, den);

test('hằng số', () => {
  assert.deepEqual({ ...Q.KHUNG_LOAI_TRU }, { batDauGio: 21, ketThucGio: 7 });
  assert.deepEqual({ ...Q.CHI_TIEU_GIO }, { F1_3: 14, F4_1: 12.5, F4_2: 11.5 });
});

test('bảng mẫu', () => {
  assert.equal(thuc('2026-10-20 08:00:00', '2026-10-20 10:00:00'), 2 * H);
  assert.equal(thuc('2026-10-20 20:00:00', '2026-10-21 08:00:00'), 2 * H);
  assert.equal(thuc('2026-10-20 22:00:00', '2026-10-21 06:00:00'), 0);
  assert.equal(thuc('2026-10-20 22:00:00', '2026-10-21 09:00:00'), 2 * H);
  assert.equal(thuc('2026-10-20 06:00:00', '2026-10-20 08:00:00'), 1 * H);
  assert.equal(thuc('2026-10-20 08:00:00', '2026-10-22 08:00:00'), 28 * H);
  assert.equal(thuc('2026-10-20 15:25:00', '2026-10-21 07:45:14'), 22814);
  assert.deepEqual(Q.tachGioPhutGiay(22814), { dau: '+', gio: 6, phut: 20, giay: 14 });
});

test('quỹ còn lại', () => {
  const tu = '2026-10-20 15:25:00'; const den = '2026-10-21 07:45:14';
  assert.equal(Q.quyConLaiGiay(tu, den, Q.CHI_TIEU_GIO.F1_3), 27586);
  assert.deepEqual(Q.tachGioPhutGiay(27586), { dau: '+', gio: 7, phut: 39, giay: 46 });
  assert.equal(Q.quyConLaiGiay(tu, den, Q.CHI_TIEU_GIO.F4_1), 12.5 * H - 22814);
  assert.equal(Q.quyConLaiGiay(tu, den, Q.CHI_TIEU_GIO.F4_2), 11.5 * H - 22814);
  // hết quỹ -> âm
  assert.equal(Q.quyConLaiGiay('2026-10-20 08:00:00', '2026-10-20 21:00:00', 11.5), 11.5 * H - 13 * H);
  assert.ok(Q.quyConLaiGiay('2026-10-20 08:00:00', '2026-10-20 21:00:00', 11.5) < 0);
});

test('biên khung nửa mở [21:00:00, 07:00:00)', () => {
  assert.equal(thuc('2026-10-20 21:00:00', '2026-10-20 21:00:01'), 0); // giây 21:00:00 thuộc khung
  assert.equal(thuc('2026-10-20 20:59:59', '2026-10-20 21:00:00'), 1);
  assert.equal(thuc('2026-10-20 20:59:59', '2026-10-20 21:00:01'), 1);
  assert.equal(thuc('2026-10-20 06:59:59', '2026-10-20 07:00:00'), 0);
  assert.equal(thuc('2026-10-20 06:59:59', '2026-10-20 07:00:01'), 1);
  assert.equal(thuc('2026-10-20 07:00:00', '2026-10-20 07:00:01'), 1); // giây 07:00:00 không thuộc khung
  assert.equal(thuc('2026-10-20 08:00:00', '2026-10-20 21:00:00'), 13 * H); // kết thúc đúng 21:00:00
  assert.equal(thuc('2026-10-20 20:00:00', '2026-10-21 07:00:00'), 1 * H); // kết thúc đúng 07:00:00
});

test('nằm trọn trong khung; bắt đầu trong khung đầu ngày', () => {
  assert.equal(thuc('2026-10-20 22:00:00', '2026-10-20 23:00:00'), 0);
  assert.equal(thuc('2026-10-20 02:00:00', '2026-10-20 05:00:00'), 0);
  assert.equal(thuc('2026-10-20 02:00:00', '2026-10-20 09:00:00'), 2 * H);
});

test('bằng nhau, đảo chiều, khoảng ngắn', () => {
  assert.equal(thuc('2026-10-20 10:00:00', '2026-10-20 10:00:00'), 0);
  assert.equal(thuc('2026-10-20 22:00:00', '2026-10-20 22:00:00'), 0);
  assert.equal(thuc('2026-10-20 10:00:00', '2026-10-20 08:00:00'), -2 * H);
  assert.equal(thuc('2026-10-21 09:00:00', '2026-10-20 22:00:00'), -2 * H);
  assert.equal(thuc('2026-10-20 10:00:00', '2026-10-20 10:00:05'), 5);
  assert.equal(Q.quyConLaiGiay('2026-10-20 10:00:00', '2026-10-20 08:00:00', 14), 14 * H + 2 * H);
});

test('khoảng nhiều ngày, qua tháng, qua năm, 29/02', () => {
  assert.equal(thuc('2026-10-20 08:00:00', '2026-10-23 08:00:00'), 42 * H);
  assert.equal(thuc('2026-10-31 08:00:00', '2026-11-01 08:00:00'), 14 * H);
  assert.equal(thuc('2026-12-31 20:00:00', '2027-01-01 08:00:00'), 2 * H);
  assert.equal(thuc('2028-02-28 08:00:00', '2028-03-01 08:00:00'), 28 * H); // có 29/02
  assert.equal(thuc('2028-02-29 20:00:00', '2028-03-01 08:00:00'), 2 * H);
  assert.equal(thuc('2027-02-28 08:00:00', '2027-03-01 08:00:00'), 14 * H); // không có 29/02
});

test('đầu vào: dạng T, giây lẻ bị cắt, không hợp lệ -> null', () => {
  assert.equal(thuc('2026-10-20T08:00:00', '2026-10-20T10:00:00'), 2 * H);
  assert.equal(thuc('2026-10-20 08:00:00.717', '2026-10-20 10:00:00.999'), 2 * H);
  assert.equal(thuc(' 2026-10-20 08:00:00 ', '2026-10-20 10:00:00'), 2 * H);
  const xau = ['', '   ', null, undefined, 'NULL', 'null', 42, '2026-13-01 00:00:00', '2026-02-30 00:00:00', '2026-10-20 25:00:00',
    '2026-10-20 10:60:00', '2026-10-20 10:00:60', '2026-10-20 10:00', '2026-10-20', '10/20/2026 8:00:00 AM', '2026-10-20 08:00:00Z'];
  for (const x of xau) {
    assert.equal(Q.docGiay(x), null, `docGiay(${String(x)})`);
    assert.equal(thuc(x, '2026-10-20 10:00:00'), null);
    assert.equal(thuc('2026-10-20 10:00:00', x), null);
    assert.equal(Q.quyConLaiGiay(x, '2026-10-20 10:00:00', 14), null);
    assert.equal(Q.quyConLaiGiay('2026-10-20 10:00:00', x, 14), null);
  }
  assert.equal(Q.docGiay('2026-10-20 00:00:00') - Q.docGiay('2026-10-19 00:00:00'), 86400);
});

test('tachGioPhutGiay', () => {
  assert.deepEqual(Q.tachGioPhutGiay(3725), { dau: '+', gio: 1, phut: 2, giay: 5 });
  assert.deepEqual(Q.tachGioPhutGiay(-3725), { dau: '-', gio: 1, phut: 2, giay: 5 });
  assert.deepEqual(Q.tachGioPhutGiay(0), { dau: '+', gio: 0, phut: 0, giay: 0 });
  assert.deepEqual(Q.tachGioPhutGiay(-59), { dau: '-', gio: 0, phut: 0, giay: 59 });
});

test('đối xứng và cộng dồn trên lưới mốc giả', () => {
  const mocs = ['2026-10-20 00:00:00', '2026-10-20 06:59:59', '2026-10-20 07:00:00', '2026-10-20 12:34:56', '2026-10-20 20:59:59',
    '2026-10-20 21:00:00', '2026-10-20 23:59:59', '2026-10-21 03:00:00', '2026-10-21 07:00:00', '2026-10-22 15:15:15'];
  for (const a of mocs) {
    for (const b of mocs) {
      assert.equal(thuc(a, b) + thuc(b, a), 0);
      for (const c of mocs) {
        if (Q.docGiay(a) <= Q.docGiay(b) && Q.docGiay(b) <= Q.docGiay(c)) assert.equal(thuc(a, c), thuc(a, b) + thuc(b, c));
      }
    }
  }
});
