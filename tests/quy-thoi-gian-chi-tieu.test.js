// ==========================================
// Test QUYTG-7b: chỉ tiêu F1.3 theo BCVH nhận + phường/xã nhận (server/lib/quyThoiGianChiTieu.js), nối vào danhGiaMotLuot và truy vấn.
// Mã BCVH thật chỉ dùng như chuỗi mã; tên phường/xã, SHBG, BD10 đều GIẢ / do test đặt. DB RAM, không server, không phụ thuộc TZ máy.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureArrivalSchema, deriveArrival, wardKey } = require('../server/lib/arrivalsImport');
const CT = require('../server/lib/quyThoiGianChiTieu');
const N = require('../server/lib/quyThoiGianNhom');
const QQ = require('../server/lib/quyThoiGianQuery');

const TH = '533140';
const NAM_BCVH = ['535470', '536250', '537015', '537220', '535790'];

test('hằng số và cấu hình ngoại lệ', () => {
  assert.equal(CT.CHI_TIEU_MAC_DINH_GIO, 14);
  assert.deepEqual(JSON.parse(JSON.stringify(CT.NGOAI_LE_CHI_TIEU)), [{ maBcvh: TH, phuong: ['Thuận Hóa', 'Phú Xuân'], gio: 12 }]);
  assert.equal(CT.maCoNgoaiLe(TH), true);
  assert.equal(CT.maCoNgoaiLe(` ${TH} `), true);
  assert.equal(CT.maCoNgoaiLe(535470), false);
  assert.equal(CT.maCoNgoaiLe(null), false);
});

test('chiTieuGio: 533140 + Thuận Hóa / Phú Xuân (mọi cách viết) -> 12', () => {
  for (const p of ['Thuận Hóa', 'Phường Thuận Hóa', 'PHÚ XUÂN', '  phú  xuân ', 'Xã Phú Xuân', 'P. Phú Xuân', 'P.Phú Xuân', 'TT. Thuận Hóa', 'Thị trấn Phú Xuân',
    'phường thuận hóa', 'PHƯỜNG PHÚ XUÂN', ' Phú Xuân\t']) {
    assert.equal(CT.chiTieuGio(TH, p), 12, p);
  }
  assert.equal(CT.chiTieuGio(` ${TH} `, 'Phú Xuân'), 12);
  assert.equal(CT.chiTieuGio(533140, 'Phú Xuân'), 12); // mã kiểu số
  assert.equal(CT.chiTieuGio(TH, 'Thuận Hóa'.normalize('NFD')), 12); // NFD -> NFC
});

test('chiTieuGio: 533140 + phường khác / rỗng -> 14; KHÔNG bỏ dấu để so', () => {
  for (const p of ['Thuận Hòa', 'Thủy Xuân', 'Phú Xuân Đông', 'Hương Long', 'Thuan Hoa', 'Phu Xuan', 'Thuận Hóa 2', 'Xuân', 'Phú', 'Phường', 'Thuận', 'Hóa',
    '', '   ', null, undefined, 'NULL', 'null', ' Null ', 123]) {
    assert.equal(CT.chiTieuGio(TH, p), 14, String(p));
  }
});

test('chiTieuGio: 5 BCVH khác và mã lạ -> luôn 14, kể cả Thuận Hóa / Phú Xuân', () => {
  for (const ma of [...NAM_BCVH, '539999', '', null, undefined]) {
    for (const p of ['Thuận Hóa', 'Phú Xuân', 'Phường Phú Xuân', '', null]) assert.equal(CT.chiTieuGio(ma, p), 14, `${ma} ${p}`);
  }
});

test('chuanHoaTenXaPhuong: chuẩn hóa chữ, giữ dấu thanh và dấu mũ', () => {
  assert.equal(CT.chuanHoaTenXaPhuong('  Phường   Thuận  Hóa '), 'thuận hóa');
  assert.equal(CT.chuanHoaTenXaPhuong('PHÚ XUÂN'), 'phú xuân');
  assert.notEqual(CT.chuanHoaTenXaPhuong('Thuận Hòa'), CT.chuanHoaTenXaPhuong('Thuận Hóa'));
  assert.notEqual(CT.chuanHoaTenXaPhuong('Thủy Xuân'), CT.chuanHoaTenXaPhuong('Phú Xuân'));
  assert.equal(CT.chuanHoaTenXaPhuong('Phú Xuân').includes('ú'), true); // dấu còn nguyên
  for (const x of ['', '  ', null, undefined, 'NULL', ' null ']) assert.equal(CT.chuanHoaTenXaPhuong(x), '', String(x));
  // Ð (U+00D0) -> Đ rồi chữ thường: «ÐÔNG HÀ» và «Đông Hà» cùng một dạng
  assert.equal(CT.chuanHoaTenXaPhuong('Ðông Hà'), CT.chuanHoaTenXaPhuong('Đông Hà'));
  assert.equal(CT.chuanHoaTenXaPhuong('ÐÔNG HÀ'), 'đông hà');
  assert.equal(CT.chuanHoaTenXaPhuong('ðông hà'), 'đông hà');
  // chỉ bỏ MỘT tiền tố, chỉ ở đầu
  assert.equal(CT.chuanHoaTenXaPhuong('Xã Phường Phú'), 'phường phú');
  assert.equal(CT.chuanHoaTenXaPhuong('Phú Xã'), 'phú xã');
  assert.equal(CT.chuanHoaTenXaPhuong('Xuân Phú'), 'xuân phú'); // «x» không có dấu chấm không phải tiền tố
});

test('danhGiaMotLuot + chiTieuGio: quỹ F1_3 = giờ × 3600 − thực, cùng mốc', () => {
  const co = { bd10No: '530100533140610211', maBcvhNhan: TH, ktt: '2026-10-20 07:00:00', xnd: '2026-10-20 20:00:00' }; // thực 13 giờ = 46.800 s
  const r12 = N.danhGiaMotLuot({ ...co, chiTieuF13Gio: CT.chiTieuGio(TH, 'Thuận Hóa') });
  const r14 = N.danhGiaMotLuot({ ...co, chiTieuF13Gio: CT.chiTieuGio(TH, 'Thuận Hòa') });
  const rMd = N.danhGiaMotLuot(co);
  assert.equal(r12.thoiGianThucGiay, 46800);
  assert.equal(r14.thoiGianThucGiay, 46800);
  assert.equal(r12.chiTieuGio, 12);
  assert.equal(r14.chiTieuGio, 14);
  assert.equal(rMd.chiTieuGio, 14);
  assert.equal(r12.quyConLaiGiay.F1_3, 43200 - 46800);
  assert.equal(r14.quyConLaiGiay.F1_3, 50400 - 46800);
  assert.deepEqual(rMd.quyConLaiGiay, r14.quyConLaiGiay); // không truyền = 14
  for (const k of ['F4_1', 'F4_2']) assert.equal(r12.quyConLaiGiay[k], r14.quyConLaiGiay[k], k); // F4 không đổi
  assert.ok(r12.quyConLaiGiay.F1_3 < 0, '533140-Thuận Hóa: quá 12 giờ -> hết quỹ');
  assert.ok(r14.quyConLaiGiay.F1_3 > 0, 'BCVH khác: chưa quá 14 giờ -> còn quỹ');
});

test('danhGiaMotLuot: chiTieuF13Gio không hợp lệ -> 14; mọi trạng thái đều có chiTieuGio', () => {
  for (const x of [undefined, null, 0, -3, NaN, Infinity, '12', {}]) {
    const r = N.danhGiaMotLuot({ bd10No: '530100533140610211', maBcvhNhan: TH, ktt: '2026-10-20 07:00:00', xnd: '2026-10-20 20:00:00', chiTieuF13Gio: x });
    assert.equal(r.chiTieuGio, 14, String(x));
    assert.equal(r.quyConLaiGiay.F1_3, 3600, String(x));
  }
  const am = N.danhGiaMotLuot({ bd10No: '530100533140610211', maBcvhNhan: TH, ktt: '2026-10-20 20:00:00', xnd: '2026-10-20 07:00:00', chiTieuF13Gio: 12 });
  assert.deepEqual([am.trangThai, am.chiTieuGio, am.quyConLaiGiay], ['AM', 12, null]);
  const khong = N.danhGiaMotLuot({ bd10No: '', maBcvhNhan: TH, chiTieuF13Gio: 12 });
  assert.deepEqual([khong.trangThai, khong.chiTieuGio], ['KHONG_DO_DUOC', 12]);
  assert.equal(N.danhGiaMotLuot(null).chiTieuGio, 14);
  assert.equal(N.danhGiaMotLuot({ bd10No: '530100533140610211', maBcvhNhan: TH, ktt: '2026-10-20 07:00:00', xnd: '2026-10-20 20:00:00', chiTieuF13Gio: 12.5 }).quyConLaiGiay.F1_3, 45000 - 46800);
});

// ------------------------------------------
// Truy vấn trên DB RAM
// ------------------------------------------
function dbMau(dong) {
  const d = new Database(':memory:');
  ensureArrivalSchema(d);
  d.exec('CREATE TABLE province_post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT); CREATE TABLE post_offices (id TEXT PRIMARY KEY, code TEXT, name TEXT, new_ward_name TEXT)');
  d.prepare("INSERT INTO arrival_import_files (id, unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (1,'539999','f.csv','2026-10-20','093012',1,'x','OK')").run();
  const ins = d.prepare(`INSERT INTO arrival_items (id, import_file_id, receiver_code, ward_name, ward_key, tracking_no, bd10_no, bd8_no, bag_confirmed_at, item_confirmed_at,
    bd10_confirmed_at, bd10_ttkt_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, bd10_date, item_date)
    VALUES (@id, 1, @recv, @ward, @wkey, @trk, @bd10, '', @bag, NULL, @xnd, @ktt, @arrival_at, @arrival_at_basis, @arrival_date, @cnt, @bag_date, @bd10_date, NULL)`);
  dong.forEach((o, i) => {
    const it = deriveArrival({ bag_confirmed_at: o.xnd, item_confirmed_at: null, bd10_confirmed_at: o.xnd });
    ins.run({
      id: i + 1, recv: o.recv, ward: o.ward, wkey: wardKey(o.ward), trk: o.trk, bd10: `530100${o.recv}6102${String(i).padStart(2, '0')}`, bag: o.xnd, xnd: o.xnd, ktt: o.ktt,
      arrival_at: it.arrival_at, arrival_at_basis: it.arrival_at_basis, arrival_date: it.arrival_date, cnt: it.arrival_evidence_count,
      bag_date: o.xnd.slice(0, 10), bd10_date: o.xnd.slice(0, 10)
    });
  });
  return d;
}

const KTT = '2026-10-20 07:00:00';
const XND = '2026-10-20 20:00:00'; // thực 13 giờ
const DONG = [
  { trk: 'CT0001VN', recv: TH, ward: 'Thuận Hóa', ktt: KTT, xnd: XND },
  { trk: 'CT0002VN', recv: TH, ward: 'Phường Phú Xuân', ktt: KTT, xnd: XND },
  { trk: 'CT0003VN', recv: TH, ward: 'Thuận Hòa', ktt: KTT, xnd: XND },
  { trk: 'CT0004VN', recv: TH, ward: 'Thủy Xuân', ktt: KTT, xnd: XND },
  { trk: 'CT0005VN', recv: TH, ward: '', ktt: KTT, xnd: XND },
  { trk: 'CT0006VN', recv: '535470', ward: 'Thuận Hóa', ktt: KTT, xnd: XND },
  { trk: 'CT0007VN', recv: '535470', ward: '', ktt: KTT, xnd: XND },
  { trk: 'CT0008VN', recv: '538888', ward: 'Phú Xuân', ktt: KTT, xnd: XND }
];

test('truy vấn: chi_tieu_gio / phuong_trong / quỹ F1_3 từng lượt', () => {
  const d = dbMau(DONG);
  try {
    const kq = QQ.layLuotQuyThoiGian(d, { from: '2026-10-20', to: '2026-10-20', page_size: '200' });
    assert.equal(kq.items.length, DONG.length);
    const theo = (s) => kq.items.find((l) => l.shbg === s);
    const mong = {
      CT0001VN: [12, false, -3600], CT0002VN: [12, false, -3600], CT0003VN: [14, false, 3600], CT0004VN: [14, false, 3600], CT0005VN: [14, true, 3600],
      CT0006VN: [14, false, 3600], CT0007VN: [14, false, 3600], CT0008VN: [14, false, 3600]
    };
    for (const [s, [gio, trong, quy]] of Object.entries(mong)) {
      const l = theo(s);
      assert.deepEqual([l.chi_tieu_gio, l.phuong_trong, l.quyConLaiGiay.F1_3], [gio, trong, quy], s);
    }
    assert.equal(kq.items[0].quyConLaiGiay.F1_3, -3600); // sắp theo quỹ tăng dần: 2 lượt 12 giờ đứng đầu
    assert.deepEqual(kq.meta.chi_tieu_f13, { mac_dinh_gio: 14, ngoai_le: [{ ma_bcvh: TH, phuong: ['Thuận Hóa', 'Phú Xuân'], gio: 12 }] });

    const t = QQ.tongHopQuyThoiGian(d, { from: '2026-10-20', to: '2026-10-20' });
    assert.deepEqual(t.meta.chi_tieu_f13, kq.meta.chi_tieu_f13);
    assert.deepEqual(t.chi_tieu.tong.F1_3, { con_quy: 6, het_quy: 2 }); // chỉ 2 lượt 533140 + (Thuận Hóa | Phú Xuân) hết quỹ
    assert.equal(t.chi_tieu.chi_tieu_gio.F1_3, 14); // hằng số mặc định của lõi không đổi
    // meta là bản sao: sửa kết quả không làm hỏng cấu hình
    kq.meta.chi_tieu_f13.ngoai_le[0].phuong.push('X');
    assert.deepEqual(QQ.layLuotQuyThoiGian(d, { from: '2026-10-20', to: '2026-10-20' }).meta.chi_tieu_f13.ngoai_le[0].phuong, ['Thuận Hóa', 'Phú Xuân']);
  } finally { d.close(); }
});
