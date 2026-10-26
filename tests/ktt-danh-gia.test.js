// ==========================================
// Test KTT-5: server/lib/kttDanhGia.js — taoDanhGia(tongHop, tuyChon) sinh nhận xét có số liệu.
// Hàm thuần: phần lớn ca dựng sẵn đối tượng `tongHop` giả; một ca chạy xuyên DB tạm (tongHopKtt) với dữ liệu giả. Không mở data/, không dùng server.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const Q = require('../server/lib/kttQuery');
const { taoDanhGia, ngayBatThuong, NGUONG_DANH_GIA, CAU_GIAI_TRINH } = require('../server/lib/kttDanhGia');

const CTD = 'CHUYEN_TIEP_DI';
const KTL = 'KHAI_THAC_LAI';
const hang = (o) => ({ ngay: '2026-10-20', maBcvh: '533140', chuyen: 'SANG', nguon: CTD, donVi: 'TUI', tong: 0, DUNG_CHUYEN: 0, TRE_CHUYEN: 0, LO_CHUYEN: 0, CHUA_DEN_MOC: 0, soChuyenTre: 0, treTu2Ngay: 0, ...o });
const tim = (kq, ma) => kq.find((x) => x.ma === ma);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const XAU = /NaN|undefined|Infinity|\[object|null/;

function tongHopMau() {
  return {
    khoangNgay: { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: '2026-10-23 10:00:00' },
    canhBao: [],
    chuyen: {
      chotTruocPhut: [30],
      theoBcvhChuyen: [
        hang({ maBcvh: '533140', chuyen: 'SANG', tong: 100, DUNG_CHUYEN: 90, TRE_CHUYEN: 6, LO_CHUYEN: 2, CHUA_DEN_MOC: 2, treTu2Ngay: 1 }),
        hang({ maBcvh: '535470', chuyen: 'TRUA', tong: 50, DUNG_CHUYEN: 30, TRE_CHUYEN: 15, LO_CHUYEN: 5, treTu2Ngay: 3 })
      ],
      theoNgay: [{ ngay: '2026-10-20', nguon: CTD, donVi: 'TUI', tong: 150, daCham: 148, dungChuyen: 120, treChuyen: 21, loChuyen: 7 }],
      theoGioQuetDen: [
        { gio: 7, chuyen: 'TRUA', nguon: CTD, donVi: 'TUI', tong: 623, dungChuyen: 600, treChuyen: 23 },
        { gio: 7, chuyen: 'SANG', nguon: CTD, donVi: 'TUI', tong: 20, dungChuyen: 20, treChuyen: 0 },
        { gio: 8, chuyen: 'TRUA', nguon: CTD, donVi: 'TUI', tong: 100, dungChuyen: 100, treChuyen: 0 }
      ],
      denSatGio: [{ maBcvh: '533140', chuyen: 'SANG', nguon: CTD, donVi: 'TUI', soDenSatGio: 40, kipChuyenSat: 10, sangChuyenKe: 25, chuaDi: 5 }],
      khongApDung: []
    },
    tonTreo: {
      treoPhut: 180,
      tong: { tui: 12, shbg: 90 },
      theoLoai: [
        { loai: 'CHUA_QUET_DI', nhom: 'BCVH_HUE', tuoi: 'T_TREN_3N', tui: 4, shbg: 30 },
        { loai: 'CHUA_QUET_DI', nhom: 'BCVH_HUE', tuoi: 'T_1_3N', tui: 5, shbg: 40 },
        { loai: 'CHUA_MO_TUI', nhom: 'KTT', tuoi: 'T_3_12H', tui: 3, shbg: 20 }
      ],
      theoTuoi: [{ tuoi: 'T_1_3N', tui: 5, shbg: 40 }, { tuoi: 'T_3_12H', tui: 3, shbg: 20 }, { tuoi: 'T_TREN_3N', tui: 4, shbg: 30 }],
      theoBcvh: [{ maBcvh: '535470', tui: 7, shbg: 50 }, { maBcvh: 'KHONG_RO_BCVH', tui: 5, shbg: 40 }],
      theoNgay: [{ ngay: '2026-10-20', tong: 200, treo: 12 }],
      chuaDenNguong: 2,
      khongCoMocQuetDen: 0
    },
    namLau: {
      namLauToiDaPhut: 1440,
      theoBac: [
        { nguon: CTD, donVi: 'TUI', luong: 'DI_NGOAI', caQuet: 'DEM', nhom: 'BCVH_HUE', bac: 'A_DEN_3H', soDon: 50, namLau: 0 },
        { nguon: CTD, donVi: 'TUI', luong: 'DI_NGOAI', caQuet: 'DEM', nhom: 'BCVH_HUE', bac: 'D_12_24H', soDon: 30, namLau: 12 },
        { nguon: CTD, donVi: 'TUI', luong: 'DI_NGOAI', caQuet: 'NGAY', nhom: 'BCVH_HUE', bac: 'E_TREN_24H', soDon: 20, namLau: 20 },
        { nguon: CTD, donVi: 'TUI', luong: 'DI_NGOAI', caQuet: 'NGAY', nhom: 'BCVH_HUE', bac: 'AM', soDon: 2, namLau: 0 },
        { nguon: CTD, donVi: 'TUI', luong: 'DI_NGOAI', caQuet: 'NGAY', nhom: 'KHAC', bac: 'E_TREN_24H', soDon: 40, namLau: 0 }
      ],
      tongNguon: {}
    },
    chiTieuF13: { tongCong: { tong: 106, soDoDuoc: 90, XND_SAU_GIO_DI: 10, CHUA_XAC_NHAN_DEN: 5, CAN_KIEM_TRA_LAI: 1, THIEU_BAY_GIO: 0, quy: { AM: 9, T0_2H: 20, T2_6H: 30, TREN_6H: 31 } } },
    chatLuongDuLieu: { shbgKhaiThacLai: 1000, shbgKhongRoDich: 80, shbgCanKiemTraLai: 3, tuiCanKiemTraLai: 2, tuiChuyenTiepDi: 150, bd10Den: 50, bd10DenChuaXacNhan: 7 }
  };
}

test('đầu vào rỗng / không phải đối tượng / khoảng ngày không có dữ liệu → mảng rỗng, không câu sai', () => {
  assert.deepEqual(taoDanhGia(null), []);
  assert.deepEqual(taoDanhGia(undefined), []);
  assert.deepEqual(taoDanhGia('x'), []);
  assert.deepEqual(taoDanhGia({}), []);
  const db = new Database(':memory:');
  ensureKttSchema(db);
  const rong = Q.tongHopKtt(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: '2026-10-23 10:00:00' });
  assert.deepEqual(taoDanhGia(rong), []);
  db.close();
});

test('cấu trúc: mỗi nhận xét có ma / mucDo / cau / soLieu / loc; mucDo hợp lệ; ma không trùng; không đổi đầu vào (hàm thuần, xác định)', () => {
  const th = deepFreeze(tongHopMau());
  const kq = taoDanhGia(th);
  assert.ok(kq.length >= 12);
  for (const x of kq) {
    assert.deepEqual(Object.keys(x).sort(), ['cau', 'loc', 'ma', 'mucDo', 'soLieu']);
    assert.ok(['THONG_TIN', 'LUU_Y', 'CANH_BAO'].includes(x.mucDo), x.ma);
    assert.equal(typeof x.cau, 'string');
    assert.ok(x.cau.length > 10 && !XAU.test(x.cau), `${x.ma}: ${x.cau}`);
    assert.ok(x.loc === null || typeof x.loc.loai === 'string', x.ma);
  }
  assert.equal(new Set(kq.map((x) => x.ma)).size, kq.length);
  assert.deepEqual(taoDanhGia(th), kq);
});

test('đúng chuyến: tỷ lệ hàng đi đúng chuyến, nêu BCVH thấp nhất; mức theo ngưỡng', () => {
  const x = tim(taoDanhGia(tongHopMau()), `DUNG_CHUYEN_${CTD}`);
  assert.equal(x.cau, 'Hàng đi đúng chuyến (túi chuyển tiếp đi): 120/148 túi (81,1%) đi đúng chuyến. Thấp nhất: Hương Trà (535470) 30/50 (60%).');
  assert.equal(x.mucDo, 'LUU_Y');
  assert.deepEqual(x.loc, { loai: 'tre_chuyen' });
  assert.equal(x.soLieu.dungChuyen, 120);
  assert.equal(x.soLieu.daCham, 148); // không tính CHUA_DEN_MOC
  // thấp hơn 75% → CANH_BAO; từ 90% → THONG_TIN
  const thap = tongHopMau();
  thap.chuyen.theoBcvhChuyen[0].DUNG_CHUYEN = 10;
  assert.equal(tim(taoDanhGia(thap), `DUNG_CHUYEN_${CTD}`).mucDo, 'CANH_BAO');
  const tot = tongHopMau();
  tot.chuyen.theoBcvhChuyen = [hang({ tong: 100, DUNG_CHUYEN: 95, TRE_CHUYEN: 5 })];
  const t = tim(taoDanhGia(tot), `DUNG_CHUYEN_${CTD}`);
  assert.equal(t.mucDo, 'THONG_TIN');
  assert.ok(!/Thấp nhất/.test(t.cau), 'chỉ nêu BCVH thấp nhất khi có từ hai BCVH');
  // ngưỡng ghi đè được
  assert.equal(tim(taoDanhGia(tot, { nguong: { dungChuyenTot: 0.99 } }), `DUNG_CHUYEN_${CTD}`).mucDo, 'LUU_Y');
  assert.equal(NGUONG_DANH_GIA.dungChuyenTot, 0.9);
});

test('theo giờ quét đến: «Quét đến 7 giờ: 623 túi vào chuyến trưa, chỉ 20 túi kịp chuyến sáng»', () => {
  const x = tim(taoDanhGia(tongHopMau()), `DUNG_CHUYEN_THEO_GIO_${CTD}`);
  assert.ok(x.cau.startsWith('Quét đến 7 giờ: 623 túi vào chuyến trưa, chỉ 20 túi kịp chuyến sáng'), x.cau);
  assert.equal(x.soLieu.gioQuetDen, 7);
  assert.equal(x.soLieu.tong, 643);
  assert.deepEqual(x.loc, { loai: 'tre_chuyen' });
  // chuyến đứng sau chiếm ít hơn chuyến đứng trước: không dùng «chỉ … kịp»
  const th = tongHopMau();
  th.chuyen.theoGioQuetDen = [
    { gio: 12, chuyen: 'SANG', nguon: KTL, donVi: 'SHBG', tong: 90, dungChuyen: 90, treChuyen: 0 },
    { gio: 12, chuyen: 'TRUA', nguon: KTL, donVi: 'SHBG', tong: 40, dungChuyen: 40, treChuyen: 0 }
  ];
  const y = tim(taoDanhGia(th), `DUNG_CHUYEN_THEO_GIO_${KTL}`);
  assert.ok(y.cau.startsWith('Quét đến 12 giờ: 90 bưu gửi vào chuyến sáng, 40 bưu gửi vào chuyến trưa'), y.cau);
  assert.equal(y.loc, null); // không có hàng trễ ở giờ đó
});

test('hàng đi trễ: số đi chuyến sau, số đi muộn từ 2 ngày, số lỡ chuyến; không trễ → câu «không có»', () => {
  const x = tim(taoDanhGia(tongHopMau()), `DI_TRE_${CTD}`);
  assert.equal(x.cau, 'Hàng đi trễ (túi chuyển tiếp đi): 21 túi đi chuyến sau (4 túi đi muộn từ 2 ngày), 7 túi lỡ chuyến (chưa đi dù đã quá mốc), trên 148 túi đã chấm.');
  assert.equal(x.mucDo, 'CANH_BAO'); // 28/148 ≥ 10%
  assert.deepEqual(x.loc, { loai: 'tre_chuyen' });
  const th = tongHopMau();
  th.chuyen.theoBcvhChuyen = [hang({ tong: 60, DUNG_CHUYEN: 58, LO_CHUYEN: 2 })];
  const y = tim(taoDanhGia(th), `DI_TRE_${CTD}`);
  assert.equal(y.mucDo, 'LUU_Y');
  assert.deepEqual(y.loc, { loai: 'lo_chuyen' });
  th.chuyen.theoBcvhChuyen = [hang({ tong: 60, DUNG_CHUYEN: 60 })];
  const z = tim(taoDanhGia(th), `DI_TRE_${CTD}`);
  assert.equal(z.mucDo, 'THONG_TIN');
  assert.equal(z.cau, 'Hàng đi trễ (túi chuyển tiếp đi): không có túi nào đi chuyến sau hoặc lỡ chuyến trong 60 túi đã chấm.');
  assert.equal(z.loc, null);
});

test('đến sát giờ: số đến sát giờ, tỷ lệ kịp, tỷ lệ sang chuyến kế (và số chưa đi)', () => {
  const x = tim(taoDanhGia(tongHopMau()), `DEN_SAT_GIO_${CTD}`);
  assert.equal(x.cau, 'Đến sát giờ (túi chuyển tiếp đi): 40 túi quét đến trong 30 phút cuối trước mốc chuyến; 10 (25%) kịp chuyến, 25 (62,5%) sang chuyến kế, 5 chưa đi.');
  assert.equal(x.mucDo, 'LUU_Y'); // 62,5% ≥ 50%
  assert.deepEqual(x.loc, { loai: 'den_sat_gio' });
  assert.equal(x.soLieu.tyLeSangChuyenKe, 0.625);
  const th = tongHopMau();
  th.chuyen.chotTruocPhut = [30, 45];
  th.chuyen.denSatGio = [{ maBcvh: '533140', chuyen: 'SANG', nguon: KTL, donVi: 'SHBG', soDenSatGio: 10, kipChuyenSat: 9, sangChuyenKe: 1, chuaDi: 0 }];
  const y = tim(taoDanhGia(th), `DEN_SAT_GIO_${KTL}`);
  assert.equal(y.cau, 'Đến sát giờ (bưu gửi khai thác lại): 10 bưu gửi quét đến trong khoảng chốt cuối trước mốc chuyến; 9 (90%) kịp chuyến, 1 (10%) sang chuyến kế.');
  assert.equal(y.mucDo, 'THONG_TIN');
});

test('treo: tổng theo loại và tuổi, riêng trên 3 ngày, BCVH đích nhiều nhất, kèm «KTT cần kiểm tra và giải trình»', () => {
  const x = tim(taoDanhGia(tongHopMau()), 'TREO');
  assert.equal(x.cau, `Treo: 12 túi (90 bưu gửi) có mã quét đến mà chưa có bước tiếp theo quá 3 giờ (chưa quét đi 9 túi, chưa mở túi 3 túi); 4 túi treo trên 3 ngày; BCVH đích nhiều nhất: Hương Trà (535470) 7 túi. ${CAU_GIAI_TRINH}`);
  assert.equal(x.mucDo, 'CANH_BAO');
  assert.deepEqual(x.loc, { loai: 'treo' });
  assert.equal(x.soLieu.tren3Ngay, 4);
  // không có túi nào trên 3 ngày và tỷ lệ thấp → LUU_Y
  const th = tongHopMau();
  th.tonTreo.theoTuoi = th.tonTreo.theoTuoi.filter((t) => t.tuoi !== 'T_TREN_3N');
  th.tonTreo.theoNgay = [{ ngay: '2026-10-20', tong: 1000, treo: 12 }];
  const y = tim(taoDanhGia(th), 'TREO');
  assert.equal(y.mucDo, 'LUU_Y');
  assert.ok(/; 0 túi treo trên 3 ngày;/.test(y.cau));
  // không treo: câu «không có», chỉ khi có túi đã xét
  const khong = { tonTreo: { treoPhut: 180, tong: { tui: 0, shbg: 0 }, theoLoai: [], theoTuoi: [], theoBcvh: [], theoNgay: [{ ngay: '2026-10-20', tong: 30, treo: 0 }] } };
  assert.equal(tim(taoDanhGia(khong), 'TREO').cau, 'Treo: không có túi nào treo trong 30 túi đã xét.');
  assert.deepEqual(taoDanhGia({ tonTreo: { tong: { tui: 0, shbg: 0 }, theoNgay: [] } }), []);
  // thiếu ngưỡng giờ: không nêu «quá …»
  const z = tongHopMau();
  delete z.tonTreo.treoPhut;
  assert.ok(!/quá \d/.test(tim(taoDanhGia(z), 'TREO').cau));
});

test('nằm lâu: số và tỷ lệ, theo bậc, tách đêm / ngày; chỉ tính đích BCVH Huế; «KTT cần kiểm tra và giải trình»', () => {
  const x = tim(taoDanhGia(tongHopMau()), `NAM_LAU_${CTD}`);
  assert.equal(x.cau, `Nằm lâu (túi chuyển tiếp đi): 32/102 túi đã đi (31,4%) nằm lâu (đi trễ chuyến hoặc nằm quá 24 giờ). Theo bậc giờ nằm: đến 3 giờ 50, 12–24 giờ 30, trên 24 giờ 20, quét đến sau giờ đi 2. Quét đến ban đêm: 12/80 (15%); ban ngày: 20/22 (90,9%). ${CAU_GIAI_TRINH}`);
  assert.equal(x.mucDo, 'CANH_BAO');
  assert.deepEqual(x.loc, { loai: 'nam_lau' });
  assert.deepEqual(x.soLieu.dem, { soDon: 80, namLau: 12 });
  const th = tongHopMau();
  th.namLau.theoBac = [{ nguon: KTL, donVi: 'SHBG', luong: 'KHAI_THAC_DEN', caQuet: 'NGAY', nhom: 'BCVH_HUE', bac: 'A_DEN_3H', soDon: 100, namLau: 0 }];
  const y = tim(taoDanhGia(th), `NAM_LAU_${KTL}`);
  assert.equal(y.mucDo, 'THONG_TIN');
  assert.equal(y.loc, null);
  assert.ok(!/ban đêm/.test(y.cau), 'chỉ nêu đêm / ngày khi có cả hai');
  assert.equal(tim(taoDanhGia(th), `NAM_LAU_${CTD}`), undefined);
});

test('bất thường: ngày có tỷ lệ treo / trễ cao hơn hẳn các ngày còn lại (so với trung bình và độ lệch của các ngày còn lại)', () => {
  const treo = [10, 12, 8, 11, 90].map((t, i) => ({ ngay: `2026-10-2${i}`, tong: 200, treo: t }));
  const th = { tonTreo: { theoNgay: treo, tong: { tui: 0, shbg: 0 }, theoLoai: [] } };
  const x = tim(taoDanhGia(th), 'BAT_THUONG_NGAY_TREO');
  assert.equal(x.cau, 'Ngày bất thường về tỷ lệ treo: 24/10/2026 (45%, 90/200; trung bình các ngày còn lại 5,1%).');
  assert.equal(x.mucDo, 'LUU_Y');
  assert.deepEqual(x.loc, { loai: 'treo', ngay: '2026-10-24' });
  // trễ: gộp hai nguồn theo ngày
  const tre = [];
  for (let i = 0; i < 5; i++) {
    tre.push({ ngay: `2026-10-2${i}`, nguon: CTD, donVi: 'TUI', tong: 100, daCham: 100, dungChuyen: i === 3 ? 40 : 95, treChuyen: i === 3 ? 50 : 5, loChuyen: i === 3 ? 10 : 0 });
  }
  const y = tim(taoDanhGia({ chuyen: { theoNgay: tre } }), 'BAT_THUONG_NGAY_TRE_CHUYEN');
  assert.equal(y.cau, 'Ngày bất thường về tỷ lệ hàng đi trễ hoặc lỡ chuyến: 23/10/2026 (60%, 60/100; trung bình các ngày còn lại 5%).');
  assert.deepEqual(y.loc, { loai: 'tre_chuyen', ngay: '2026-10-23' });
  // các ngày đều nhau → không bất thường; dưới 4 ngày có đủ mẫu → không xét; ngày ít hơn 20 đơn vị bị bỏ qua
  assert.deepEqual(ngayBatThuong([10, 11, 9, 10, 10].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), NGUONG_DANH_GIA.batThuong), []);
  assert.deepEqual(ngayBatThuong([10, 12, 90].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), NGUONG_DANH_GIA.batThuong), []);
  assert.deepEqual(ngayBatThuong([...[10, 12, 8, 11].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), { ngay: '2026-10-24', tu: 5, mau: 5 }], NGUONG_DANH_GIA.batThuong), []);
  // chênh lệch nhỏ (dưới 10 điểm phần trăm) không bị đánh dấu dù độ lệch chuẩn bằng 0
  assert.deepEqual(ngayBatThuong([10, 10, 10, 10, 18].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), NGUONG_DANH_GIA.batThuong), []);
  assert.equal(ngayBatThuong([10, 10, 10, 10, 25].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), NGUONG_DANH_GIA.batThuong)[0].ngay, '2026-10-24');
  // ghi đè ngưỡng
  assert.equal(ngayBatThuong([10, 10, 10, 10, 18].map((t, i) => ({ ngay: `2026-10-2${i}`, tu: t, mau: 100 })), { ...NGUONG_DANH_GIA.batThuong, chenhLechToiThieu: 0.05 }).length, 1);
});

test('bất thường: xác nhận đến sau giờ BD10 đi và quét đến sau giờ BD10 đi (tỷ lệ)', () => {
  const kq = taoDanhGia(tongHopMau());
  const x = tim(kq, 'XND_SAU_GIO_DI');
  assert.equal(x.cau, 'Xác nhận đến sau giờ BD10 đi: 10/100 bưu gửi (10%) trong số bưu gửi đo được chỉ tiêu F1.3 (đích BCVH Huế); không tính thời gian thực.');
  assert.equal(x.mucDo, 'CANH_BAO');
  assert.deepEqual(x.loc, { loai: 'xnd_sau_gio_di' });
  const q = tim(kq, `QUET_DEN_SAU_GIO_DI_${CTD}`);
  assert.equal(q.cau, 'Quét đến sau giờ BD10 đi (túi chuyển tiếp đi): 2/142 túi đã đi (1,4%); giữ nguyên số liệu nguồn, không chỉnh mốc.');
  assert.equal(q.mucDo, 'THONG_TIN');
  assert.deepEqual(q.loc, { loai: 'quet_den_sau_gio_di' });
  const khong = tongHopMau();
  khong.chiTieuF13.tongCong.XND_SAU_GIO_DI = 0;
  const k = tim(taoDanhGia(khong), 'XND_SAU_GIO_DI');
  assert.equal(k.mucDo, 'THONG_TIN');
  assert.equal(k.loc, null);
  assert.ok(/không có bưu gửi nào trong 90 bưu gửi/.test(k.cau));
});

test('chỉ tiêu F1.3: phân bố quỹ còn lại, có dải âm (không làm tròn về 0)', () => {
  const x = tim(taoDanhGia(tongHopMau()), 'CHI_TIEU_F13');
  assert.equal(x.cau, 'Chỉ tiêu F1.3: 90 bưu gửi đo được; quỹ thời gian còn lại: âm (quá chỉ tiêu) 9, 0–2 giờ 20, 2–6 giờ 30, trên 6 giờ 31.');
  assert.equal(x.mucDo, 'LUU_Y');
  assert.equal(x.soLieu.quy.AM, 9);
});

test('chất lượng dữ liệu: đích không rõ, BD10 đến chưa xác nhận, hàng «cần kiểm tra lại»; chỉ sinh khi > 0', () => {
  const kq = taoDanhGia(tongHopMau());
  const a = tim(kq, 'CHAT_LUONG_KHONG_RO_DICH');
  assert.ok(a.cau.startsWith('Chất lượng dữ liệu: 80/1000 bưu gửi (8%) không rõ đích'), a.cau);
  assert.equal(a.mucDo, 'CANH_BAO');
  assert.deepEqual(a.loc, { loai: 'khong_ro_dich' });
  const b = tim(kq, 'CHAT_LUONG_BD10_CHUA_XND');
  assert.ok(b.cau.startsWith('Chất lượng dữ liệu: 7/50 BD10 đến chưa có xác nhận đến (14%)'), b.cau);
  assert.equal(b.loc, null);
  const c = tim(kq, 'CHAT_LUONG_CAN_KIEM_TRA_LAI');
  assert.equal(c.cau, 'Chất lượng dữ liệu: 3 bưu gửi và 2 túi có hai mốc cách nhau quá 7 ngày («Cần kiểm tra lại»); không tính vào thống kê chính.');
  assert.deepEqual(c.loc, { loai: 'can_kiem_tra_lai' });
  const sach = tongHopMau();
  sach.chatLuongDuLieu = { shbgKhaiThacLai: 100, shbgKhongRoDich: 0, shbgCanKiemTraLai: 0, tuiCanKiemTraLai: 0, bd10Den: 10, bd10DenChuaXacNhan: 0 };
  assert.deepEqual(taoDanhGia(sach).filter((x) => x.ma.startsWith('CHAT_LUONG')), []);
  const nhe = tongHopMau();
  nhe.chatLuongDuLieu.shbgKhongRoDich = 10; // 1%
  assert.equal(tim(taoDanhGia(nhe), 'CHAT_LUONG_KHONG_RO_DICH').mucDo, 'LUU_Y');
});

test('câu văn trung tính: «treo» và «nằm lâu» gắn câu giải trình; không câu nào kết luận lỗi cá nhân', () => {
  const kq = taoDanhGia(tongHopMau());
  for (const x of kq) {
    if (x.ma === 'TREO' || x.ma.startsWith('NAM_LAU')) assert.ok(x.cau.endsWith(CAU_GIAI_TRINH), x.ma);
    else assert.ok(!x.cau.endsWith(CAU_GIAI_TRINH), x.ma);
    assert.ok(!/lỗi của|cố ý|gian lận|chây ỷ|nhân viên|người (làm|thao tác)/i.test(x.cau), `${x.ma}: ${x.cau}`);
  }
});

test('không bao giờ có NaN / undefined / Infinity / null trong chuỗi, kể cả khi số liệu thiếu hoặc hỏng', () => {
  const hong = [
    { chuyen: { theoBcvhChuyen: [{ nguon: CTD, DUNG_CHUYEN: NaN, TRE_CHUYEN: undefined, LO_CHUYEN: null, maBcvh: undefined }] } },
    { chuyen: { theoBcvhChuyen: [{ nguon: CTD, DUNG_CHUYEN: 5, TRE_CHUYEN: Infinity, LO_CHUYEN: 0, maBcvh: '533140' }], theoGioQuetDen: [{ gio: NaN, chuyen: 'SANG', nguon: CTD, tong: 4 }, { gio: 5, chuyen: 'SANG', nguon: CTD, tong: 4, treChuyen: undefined }], denSatGio: [{ nguon: CTD, soDenSatGio: Infinity }, { nguon: KTL, soDenSatGio: 5 }] } },
    { tonTreo: { tong: { tui: 'x', shbg: NaN }, theoNgay: [{ ngay: '2026-10-20', tong: NaN, treo: undefined }], theoLoai: null, theoBcvh: [{ maBcvh: undefined, tui: NaN }] } },
    { tonTreo: { tong: { tui: 3 }, theoNgay: [{ ngay: '2026-10-20', tong: 10, treo: 3 }], theoLoai: [{ loai: 'CHUA_QUET_DI', tui: NaN }], theoBcvh: [{ maBcvh: undefined, tui: 3 }] } },
    { namLau: { theoBac: [{ nguon: CTD, nhom: 'BCVH_HUE', bac: 'A_DEN_3H', soDon: NaN, namLau: undefined }, { nguon: KTL, nhom: 'BCVH_HUE', bac: 'Z', soDon: 3, namLau: 1 }] } },
    { chiTieuF13: { tongCong: { soDoDuoc: NaN, XND_SAU_GIO_DI: 2 } } },
    { chiTieuF13: { tongCong: { soDoDuoc: 4, XND_SAU_GIO_DI: 1, quy: {} } } },
    { chatLuongDuLieu: { shbgKhaiThacLai: 0, shbgKhongRoDich: 5, bd10Den: NaN, bd10DenChuaXacNhan: 2 } },
    { chatLuongDuLieu: { shbgCanKiemTraLai: undefined, tuiCanKiemTraLai: 3 } }
  ];
  for (const th of hong) {
    for (const x of taoDanhGia(th)) assert.ok(!XAU.test(x.cau), `${x.ma}: ${x.cau}`);
  }
  // câu sinh ra từ dữ liệu thật phải có số cụ thể
  assert.ok(taoDanhGia(hong[7]).length === 0, 'mẫu số 0 → không câu «không rõ đích»');
});

test('xuyên DB tạm: tongHopKtt → taoDanhGia sinh đúng câu và số từ dữ liệu giả', () => {
  const db = new Database(':memory:');
  ensureKttSchema(db);
  let seq = 0;
  const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
  const them = (b, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${b} (${k}) VALUES (${k.map(() => '?')})`).run(...Object.values(o)); };
  const tui = (o) => { const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(++seq), ...NG, ...o }; them('ktt_tui', r); return r; };
  const bg = (t, shbg, o) => them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o });
  const ctd = (quet, gioDi, extra = {}) => tui({ chieu: CTD, luong: 'DI_NGOAI', to_pos: '535470', gio_quet_tui_den: quet, bd10_di_gio_di: gioDi, bd10_di_so_hieu: gioDi ? 'BD10-X' : null, bd10_di_ma_diem_nhan: gioDi ? '535470' : null, ...extra });
  ctd('2026-10-20 06:00:00', '2026-10-20 07:00:00'); // đúng chuyến SÁNG
  ctd('2026-10-20 06:45:00', '2026-10-20 12:30:00'); // đến sát giờ, sang chuyến kế (TRƯA), vẫn đúng chuyến dự kiến
  ctd('2026-10-20 06:00:00', null); // chưa đi: treo + lỡ chuyến
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-10-20 15:25:00', bd10_den_so_hieu: 'BD10-DEN-1' });
  bg(den, 'S-TRE', { ti_xac_nhan_den_luc: '2026-10-20 15:25:00' });
  const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', bd10_di_gio_di: '2026-10-21 07:45:14', bd10_di_ma_diem_nhan: '533140', bd10_di_so_hieu: 'BD10-DI-1' });
  bg(di, 'S-TRE', {});
  bg(den, 'S-LA', { ma_xa_phuong: '00000', ti_xac_nhan_den_luc: '2026-10-20 15:25:00' }); // không rõ đích
  const th = Q.tongHopKtt(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: '2026-10-23 10:00:00' });
  const kq = taoDanhGia(th);
  assert.equal(tim(kq, `DUNG_CHUYEN_${CTD}`).cau, 'Hàng đi đúng chuyến (túi chuyển tiếp đi): 2/3 túi (66,7%) đi đúng chuyến.');
  assert.equal(tim(kq, `DUNG_CHUYEN_${CTD}`).mucDo, 'CANH_BAO');
  assert.equal(tim(kq, `DUNG_CHUYEN_${KTL}`).cau, 'Hàng đi đúng chuyến (bưu gửi khai thác lại): 0/1 bưu gửi (0%) đi đúng chuyến.');
  assert.ok(tim(kq, `DI_TRE_${CTD}`).cau.includes('0 túi đi chuyến sau (0 túi đi muộn từ 2 ngày), 1 túi lỡ chuyến'));
  assert.ok(tim(kq, `DI_TRE_${KTL}`).cau.includes('1 bưu gửi đi chuyến sau (0 bưu gửi đi muộn từ 2 ngày), 0 bưu gửi lỡ chuyến'));
  assert.equal(tim(kq, `DEN_SAT_GIO_${CTD}`).cau, 'Đến sát giờ (túi chuyển tiếp đi): 1 túi quét đến trong 30 phút cuối trước mốc chuyến; 0 (0%) kịp chuyến, 1 (100%) sang chuyến kế.');
  assert.equal(tim(kq, 'TREO').cau, `Treo: 1 túi (0 bưu gửi) có mã quét đến mà chưa có bước tiếp theo quá 3 giờ (chưa quét đi 1 túi); 1 túi treo trên 3 ngày; BCVH đích nhiều nhất: Hương Trà (535470) 1 túi. ${CAU_GIAI_TRINH}`);
  assert.equal(tim(kq, 'TREO').mucDo, 'CANH_BAO');
  assert.ok(tim(kq, `NAM_LAU_${KTL}`).cau.startsWith('Nằm lâu (bưu gửi khai thác lại): 1/1 bưu gửi đã đi (100%) nằm lâu'));
  assert.ok(tim(kq, 'CHAT_LUONG_KHONG_RO_DICH').cau.startsWith('Chất lượng dữ liệu: 1/2 bưu gửi (50%) không rõ đích'));
  assert.ok(tim(kq, 'CHAT_LUONG_BD10_CHUA_XND').cau.startsWith('Chất lượng dữ liệu: 1/1 BD10 đến chưa có xác nhận đến (100%)'));
  assert.ok(tim(kq, 'CHI_TIEU_F13'));
  for (const x of kq) assert.ok(!XAU.test(x.cau), `${x.ma}: ${x.cau}`);
  // bộ lọc `loc` mở được chiTiet và ra đúng số liệu của câu
  assert.equal(Q.chiTiet(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: th.khoangNgay.bayGio, ...tim(kq, 'TREO').loc }).tong, 1);
  assert.equal(Q.chiTiet(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: th.khoangNgay.bayGio, ...tim(kq, `DI_TRE_${KTL}`).loc }).tong, 1);
  assert.equal(Q.chiTiet(db, { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: th.khoangNgay.bayGio, ...tim(kq, 'CHAT_LUONG_KHONG_RO_DICH').loc }).tong, 1);
  // khoảng ngày không có dữ liệu → không câu nào
  const rong = Q.tongHopKtt(db, { tuNgay: '2026-09-01', denNgay: '2026-09-07', bayGio: '2026-10-23 10:00:00' });
  assert.deepEqual(taoDanhGia(rong), []);
  db.close();
});
