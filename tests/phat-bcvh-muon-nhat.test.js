// ==========================================
// Test DASH-7f: tỷ lệ phát — mỗi SHBG trong MỘT NGÀY chỉ tính cho BCVH có mốc đến (R2, arrival_at sớm nhất tại BCVH đó) MUỘN NHẤT; hòa -> mã BCVH nhỏ hơn.
// Hàng đi ngoài (BD8 = SHBG) không có quy tắc riêng. Gọi thẳng hàm (phat.tyLeApi, phatDashboard.ketQuaPhat, dashboardDenQuery.tongQuanDen) trên DB tạm; dữ liệu GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const P = require('../server/lib/phat');
const phatDash = require('../server/lib/phatDashboard');
const den = require('../server/lib/dashboardDenQuery');

const PORT = 5939;
const [M, M2, , , M5, M6] = VALID_BCVH_CODES; // 533140 (nhỏ nhất), 535470, 537220, 535790
let ctx;
let workDir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = (k) => `ZZ7F${k}VN`;
function r(rc, day, hms, shbg, extra = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường thư giả', SHBG: shbg, So_hieu_BD10: extra.bd10 || '',
    'Thời gian XN túi': `2026-10-${day} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: extra.bd8 || `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
const b10 = (n) => `530100${M2}${String(n).padStart(7, '0')}`;
// 16/10 (ngày chung của M, M2, M5): A: M 08:00 -> M2 13:00 (M2 muộn hơn); C: hòa 10:00 (M nhỏ hơn thắng); D: hàng đi ngoài (BD8 = SHBG) M 09:00 -> M2 12:00;
// G: M có 2 dòng 08:00 và 15:00, M2 10:00 -> R2 của M là 08:00 nên M2 thắng; E chỉ ở M; F chỉ ở M2; W chỉ ở M5; B: M 15/10 22:00 rồi M2 16/10 03:00.
// 15/10: B (M, 22:00), H: M 10:00 rồi M6 18:00 (M6 — BCVH chậm chỉ có file 15/10 — thắng).
const ROWS = [
  r(M, '16', '08:00:00', sh('A')), r(M2, '16', '13:00:00', sh('A'), { bd10: b10(1) }),
  r(M, '16', '10:00:00', sh('C')), r(M2, '16', '10:00:00', sh('C'), { bd10: b10(2) }),
  r(M, '16', '09:00:00', sh('D'), { bd8: sh('D') }), r(M2, '16', '12:00:00', sh('D'), { bd8: sh('D'), bd10: b10(3) }),
  r(M, '16', '08:00:00', sh('G')), r(M, '16', '15:00:00', sh('G')), r(M2, '16', '10:00:00', sh('G'), { bd10: b10(4) }),
  r(M, '16', '11:00:00', sh('E')), r(M2, '16', '14:00:00', sh('F')), r(M5, '16', '14:30:00', sh('W')),
  r(M, '15', '22:00:00', sh('B')), r(M2, '16', '03:00:00', sh('B'), { bd10: b10(5) }),
  r(M, '15', '10:00:00', sh('H')), r(M6, '15', '18:00:00', sh('H'))
];

function writeFiles() {
  const groups = new Map();
  for (const row of ROWS) {
    const k = `${row.BC_nhan_BG}|${row['Thời gian XN túi'].slice(0, 10).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const [k, rs] of groups) {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(qt).join(','), ...rs.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}

function ghiDot(bcvh, items, nhapLuc, userId) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, userId, nhapLuc, items.length).lastInsertRowid;
  const ins = ctx.db.prepare('INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)');
  ctx.db.transaction(() => { for (const [s, tt] of items) ins.run(bcvh, s, tt, bid, nhapLuc); })();
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-munhat-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-munhat-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec("INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử')");
  const uid = seedUser(ctx.db, { hrmCode: 'PM_ADMIN', fullName: 'PM_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  // Bản ghi của BCVH đến TRƯỚC (M) cho A, D, G, H: phải bị bỏ qua — chỉ bản ghi (BCVH muộn nhất, SHBG) là tử số.
  ghiDot(M, [[sh('A'), 'PKTC'], [sh('D'), 'PKTC'], [sh('G'), 'PKTC'], [sh('C'), 'PTC'], [sh('E'), 'PKTC'], [sh('H'), 'PKTC'], [sh('B'), 'LAC_HUONG']], '2026-10-16T08:00:00.000Z', uid);
  ghiDot(M2, [[sh('A'), 'PTC'], [sh('B'), 'CHUYEN_HOAN'], [sh('D'), 'PTC'], [sh('G'), 'PTC'], [sh('C'), 'PKTC']], '2026-10-16T09:00:00.000Z', uid); // F: chưa có thông tin
  ghiDot(M5, [[sh('W'), 'PTC']], '2026-10-16T07:00:00.000Z', uid);
  ghiDot(M6, [[sh('H'), 'PTC']], '2026-10-16T06:00:00.000Z', uid);
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const soTT = (t) => Object.fromEntries(Object.entries(t.theo_trang_thai).map(([k, v]) => [k, v.so]));
const tong5 = (t) => Object.values(soTT(t)).reduce((a, b) => a + b, 0);

test('(a)(c)(d)(e) 16/10 một BCVH: SHBG chuyển tiếp chỉ ở BCVH có mốc đến muộn nhất; hòa mốc -> mã nhỏ hơn; hàng đi ngoài tính như mọi SHBG', () => {
  const m = P.tyLeApi(ctx.db, { bcvh: M });
  assert.equal(m.ngay, '2026-10-16');
  assert.equal(m.mau_so, 2, 'M: C (hòa, mã nhỏ), E; mất A, D, G cho M2 (G: R2 của M là 08:00 chứ không phải 15:00)');
  assert.deepEqual(soTT(m), { PTC: 1, PKTC: 1, CHUYEN_HOAN: 0, CHUA_CO_TT: 0, LAC_HUONG: 0 });
  assert.equal(m.so_shbg_chuyen_tiep_loai_bo, 3);
  const m2 = P.tyLeApi(ctx.db, { bcvh: M2 });
  assert.equal(m2.mau_so, 5, 'M2: A, B, D (hàng đi ngoài), G, F; mất C do hòa mốc');
  assert.deepEqual(soTT(m2), { PTC: 3, PKTC: 0, CHUYEN_HOAN: 1, CHUA_CO_TT: 1, LAC_HUONG: 0 }, 'tử số lấy bản ghi của M2: A, D, G = PTC; B = chuyển hoàn; F chưa có');
  assert.equal(m2.so_shbg_chuyen_tiep_loai_bo, 1);
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M5 }).mau_so, 1, 'SHBG chỉ ở một BCVH: y như trước');
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M5 }).so_shbg_chuyen_tiep_loai_bo, 0);
  assert.equal(tong5(m), m.mau_so);
  assert.equal(tong5(m2), m2.mau_so);
  assert.equal(m.theo_khung_gio_den.reduce((a, k) => a + k.so_den, 0), m.mau_so, 'khung giờ cũng theo BCVH được gán');
});

test('(a)(f) bcvh=all: mỗi SHBG một lần; 5 trạng thái cộng bằng mẫu số; không đổi các trường cũ', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all' });
  assert.equal(t.ngay, '2026-10-16');
  assert.equal(t.mau_so, 8, 'A, B, C, D, E, F, G, W — mỗi SHBG một lần (trước đây 12)');
  assert.deepEqual(soTT(t), { PTC: 5, PKTC: 1, CHUYEN_HOAN: 1, CHUA_CO_TT: 1, LAC_HUONG: 0 });
  assert.equal(tong5(t), t.mau_so);
  assert.equal(t.so_shbg_chuyen_tiep_loai_bo, 4, 'số SHBG được gán lại: M 3 + M2 1');
  assert.equal(t.theo_khung_gio_den.reduce((a, k) => a + k.so_den, 0), 8);
  for (const k of ['bcvh', 'ngay', 'cung_ngay', 'so_bcvh_trong_tong', 'bcvh_ngoai_tong', 'theo_trang_thai', 'muc_cap_nhat', 'ton_cho', 'so_lieu_den_luc']) assert.ok(k in t, `thiếu ${k}`);
  const k = phatDash.ketQuaPhat(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay: null });
  assert.equal(k.mau_so, 8);
  assert.deepEqual(soTT(k), soTT(t));
  assert.equal(k.so_shbg_chuyen_tiep_loai_bo, 4);
  const xepTong = k.xep_hang_bcvh.reduce((a, x) => a + x.mau_so, 0);
  assert.ok(xepTong <= 8, 'xếp hạng theo BCVH cũng dùng mẫu số đã gán, tổng các BCVH không vượt tổng');
});

test('(b) qua nửa đêm: ngày 15 tính B cho M, ngày 16 tính B cho M2 (tỷ lệ ngày 15 không đổi khi ngày 16 có dữ liệu mới)', () => {
  const m15 = P.tyLeApi(ctx.db, { bcvh: M, ngay: '2026-10-15' });
  assert.equal(m15.mau_so, 1, 'M ngày 15: B (22:00); H thuộc M6 (18:00 muộn hơn 10:00)');
  assert.equal(m15.so_shbg_chuyen_tiep_loai_bo, 1);
  assert.deepEqual(soTT(m15), { PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, CHUA_CO_TT: 0, LAC_HUONG: 1 }, 'B ở M: bản ghi riêng của M (lạc hướng)');
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M2, ngay: '2026-10-15' }).mau_so, 0, 'M2 không có hàng 15/10');
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M2, ngay: '2026-10-16' }).mau_so, 5, 'ngày 16 B tính cho M2 (có trong 5)');
});

test('(h) ngày lệch (DASH-7e): BCVH chậm vẫn ngoài tổng; một BCVH chậm tính theo ngày riêng của nó', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all' });
  assert.equal(t.so_bcvh_trong_tong, 3);
  assert.ok(t.bcvh_ngoai_tong.some((x) => x.ma === M6 && x.ngay === '2026-10-15'));
  assert.equal(t.cung_ngay, false);
  const m6 = P.tyLeApi(ctx.db, { bcvh: M6 });
  assert.equal(m6.ngay, '2026-10-15');
  assert.equal(m6.mau_so, 1, 'H thuộc M6 (mốc 18:00 muộn hơn M 10:00)');
  assert.deepEqual(soTT(m6), { PTC: 1, PKTC: 0, CHUYEN_HOAN: 0, CHUA_CO_TT: 0, LAC_HUONG: 0 });
});

test('(g) đối chiếu tong-quan-den: mẫu số tỷ lệ phát bcvh=all = san_luong.buu_gui (cùng tập BCVH, công thức B), ngày chung và ngày rõ ràng', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all' });
  const tq = den.tongQuanDen(ctx.db, {});
  assert.equal(t.mau_so, tq.san_luong.buu_gui);
  assert.equal(t.so_bcvh_trong_tong, tq.so_bcvh_trong_tong);
  assert.equal(t.so_shbg_chuyen_tiep_loai_bo, tq.san_luong.so_shbg_qua_nhieu_bcvh, 'số SHBG gán lại = số SHBG xuất hiện ở >= 2 BCVH (mỗi SHBG chuyển tiếp qua 2 BCVH)');
  const t15 = P.tyLeApi(ctx.db, { bcvh: 'all', ngay: '2026-10-15' });
  const tq15 = den.tongQuanDen(ctx.db, { date: '2026-10-15' });
  assert.equal(t15.mau_so, 2, 'B (M) + H (M6)');
  assert.equal(t15.mau_so, tq15.san_luong.buu_gui);
  const t16 = P.tyLeApi(ctx.db, { bcvh: 'all', ngay: '2026-10-16' });
  assert.equal(t16.mau_so, den.tongQuanDen(ctx.db, { date: '2026-10-16' }).san_luong.buu_gui);
});

test('tyLeNgay (trước/sau khi nhập đợt) dùng cùng quy tắc: M ngày 16 chỉ còn 2', () => {
  assert.equal(P.tyLeNgay(ctx.db, M, '2026-10-16').mau_so, 2);
  assert.equal(P.tyLeNgay(ctx.db, M2, '2026-10-16').mau_so, 5);
});

test('tonCho: SHBG chưa có thông tin chỉ tính ở BCVH được gán (F thuộc M2; C hòa mốc thuộc M)', () => {
  const byUnit = new Map([[M, '2026-10-16'], [M2, '2026-10-16']]);
  const tong = (c) => Object.values(P.tonCho(ctx.db, c, '2026-10-16', byUnit).nhom).reduce((a, b) => a + b, 0);
  assert.equal(tong(M), 0, 'M: C và E đều đã có trạng thái; A, D, G thuộc M2');
  assert.equal(tong(M2), 1, 'M2: chỉ F chưa có thông tin');
});
