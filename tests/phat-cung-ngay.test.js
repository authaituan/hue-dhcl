// ==========================================
// Test DASH-7e: «Xử lý và tỷ lệ phát» (tổng, bcvh=all, không chọn ngày) chỉ cộng BCVH có «hôm nay» riêng đúng NGÀY CHUNG — mẫu số, tử số (5 trạng thái),
// khung giờ, tồn chờ, giờ nhập — cùng tập T với thẻ «Sản lượng đến» của Điều hành (DASH-7d). Gọi thẳng hàm (phat.tyLeApi, phatDashboard.ketQuaPhat,
// dashboardDenQuery.tongQuanDen) trên DB tạm; CSV / số hiệu GIẢ.
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
const aq = require('../server/lib/arrivalsQuery');

const PORT = 5938;
const [M, M2, M3, M4, M5, M6] = VALID_BCVH_CODES; // 533140, 535470, 536250, 537015, 537220, 535790
// Dùng: M (533140), M2 (535470), M5 (537220) có file 16/10; M6 (535790) là BCVH chậm chỉ có file 15/10; M3 (536250), M4 (537015) chưa có file nào.
let ctx;
let workDir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = (k) => `ZZ7E${k}VN`;
const b10 = (n) => `530100${M2}${String(n).padStart(7, '0')}`; // chỉ mục duy nhất (SHBG, BD10, BD8): cùng SHBG + BD8 ở hai BCVH phải khác BD10
function r(rc, day, hms, shbg, extra = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường thư giả', SHBG: shbg, So_hieu_BD10: extra.bd10 || '',
    'Thời gian XN túi': `2026-10-${day} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: extra.bd8 || `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
// 16/10 (ngày chung): M: X, Y, P; M2: Z1, Z2; M5: W — 6 SHBG, không SHBG nào qua 2 BCVH.
// 15/10: M: S1, S2; M2: S1 (trùng với M), S3; M6 (chậm): T1, T2, T3.
const ROWS = [
  r(M, '16', '09:00:00', sh('X'), { bd8: 'BX' }), r(M, '16', '10:00:00', sh('Y')), r(M, '16', '08:00:00', sh('P')),
  r(M2, '16', '13:00:00', sh('Z1')), r(M2, '16', '14:00:00', sh('Z2')),
  r(M5, '16', '14:30:00', sh('W')),
  r(M, '15', '09:00:00', sh('S1'), { bd8: 'BS1' }), r(M, '15', '10:00:00', sh('S2')),
  r(M2, '15', '11:00:00', sh('S1'), { bd10: b10(3), bd8: 'BS1' }), r(M2, '15', '12:00:00', sh('S3')),
  r(M6, '15', '08:00:00', sh('T1')), r(M6, '15', '09:00:00', sh('T2')), r(M6, '15', '16:00:00', sh('T3'))
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

// Ghi thẳng một đợt nhập GIẢ vào phat_status_current (như tests/phat-dashboard.test.js). items: [[shbg, mã trạng thái]].
function ghiDot(bcvh, items, nhapLuc, userId) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, userId, nhapLuc, items.length).lastInsertRowid;
  const ins = ctx.db.prepare('INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)');
  ctx.db.transaction(() => { for (const [s, tt] of items) ins.run(bcvh, s, tt, bid, nhapLuc); })();
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-cungngay-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-cungngay-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec("INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử')");
  const uid = seedUser(ctx.db, { hrmCode: 'PC_ADMIN', fullName: 'PC_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  ghiDot(M, [[sh('X'), 'PTC'], [sh('Y'), 'PKTC']], '2026-10-16T08:00:00.000Z', uid); // P: chưa có thông tin
  ghiDot(M2, [[sh('Z1'), 'PTC'], [sh('Z2'), 'CHUYEN_HOAN']], '2026-10-16T09:00:00.000Z', uid);
  ghiDot(M5, [[sh('W'), 'PTC']], '2026-10-16T07:00:00.000Z', uid);
  ghiDot(M6, [[sh('T1'), 'PTC'], [sh('T2'), 'PTC']], '2026-10-16T09:30:00.000Z', uid); // BCVH chậm, ngoài tổng: đợt nhập MUỘN NHẤT
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const soTT = (t) => Object.fromEntries(Object.entries(t.theo_trang_thai).map(([k, v]) => [k, v.so]));
const NGOAI = [{ ma: M3, ngay: null }, { ma: M4, ngay: null }, { ma: M6, ngay: '2026-10-15' }];

test('(a) /api/phat/ty-le all: BCVH chậm (chỉ có file ngày trước) ngoài mẫu số và tử số; bcvh_ngoai_tong đúng', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all' });
  assert.equal(t.ngay, '2026-10-16');
  assert.equal(t.cung_ngay, false, 'vẫn báo các BCVH lệch ngày (không đổi)');
  assert.equal(t.mau_so, 6, 'M 3 + M2 2 + M5 1; không cộng 3 của BCVH chậm');
  assert.deepEqual(soTT(t), { PTC: 3, PKTC: 1, CHUYEN_HOAN: 1, CHUA_CO_TT: 1, LAC_HUONG: 0 }, 'tử số: không gồm 2 PTC của BCVH chậm');
  assert.equal(t.so_bcvh_trong_tong, 3);
  assert.deepEqual(t.bcvh_ngoai_tong, NGOAI);
  assert.equal(t.theo_khung_gio_den.reduce((a, k) => a + k.so_den, 0), 6, 'khung giờ cũng chỉ trong tổng');
  assert.equal(t.so_lieu_den_luc, '2026-10-16T09:00:00.000Z', 'giờ nhập: đợt muộn nhất của BCVH trong tổng (đợt 09:30 của BCVH chậm không tính)');
  const byUnit = aq.latestFileDates(ctx.db);
  const ton = [M, M2, M5].reduce((a, c) => a + Object.values(P.tonCho(ctx.db, c, byUnit.get(c), byUnit).nhom).reduce((x, y) => x + y, 0), 0);
  assert.equal(t.ton_cho.tong, ton, 'tồn chờ chỉ cộng BCVH trong tổng');
});

test('(a2) /api/arrivals/dashboard/ket-qua-phat all: cùng tập T; xếp hạng vẫn xét mọi BCVH theo ngày riêng', () => {
  const k = phatDash.ketQuaPhat(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay: null });
  assert.equal(k.mau_so, 6);
  assert.deepEqual(soTT(k), { PTC: 3, PKTC: 1, CHUYEN_HOAN: 1, CHUA_CO_TT: 1, LAC_HUONG: 0 });
  assert.equal(k.ptc, 0.5);
  assert.equal(k.cung_ngay, false);
  assert.equal(k.so_bcvh_trong_tong, 3);
  assert.deepEqual(k.bcvh_ngoai_tong, NGOAI);
  assert.equal(k.so_lieu_den_luc, '2026-10-16T09:00:00.000Z');
  assert.deepEqual(k.pham_vi, VALID_BCVH_CODES, 'pham_vi không đổi');
  assert.ok(Array.isArray(k.chua_du_du_lieu) && k.chua_du_du_lieu.some((x) => x.bcvh === M6), 'BCVH chậm vẫn có trong danh sách chưa đủ dữ liệu (xét theo ngày riêng)');
});

test('(4) đối chiếu thẻ Điều hành: mẫu số phát = tong_cong_theo_bcvh = buu_gui khi không SHBG nào qua 2 BCVH; cùng tập T; từ DASH-7f mẫu số = buu_gui cả khi có SHBG qua 2 BCVH', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all' });
  const tq = den.tongQuanDen(ctx.db, {});
  assert.equal(t.mau_so, tq.san_luong.tong_cong_theo_bcvh);
  assert.equal(tq.san_luong.so_shbg_qua_nhieu_bcvh, 0);
  assert.equal(t.mau_so, tq.san_luong.buu_gui);
  assert.equal(t.so_bcvh_trong_tong, tq.so_bcvh_trong_tong);
  assert.deepEqual(t.bcvh_ngoai_tong, tq.bcvh_ngoai_tong);
  // Ngày rõ ràng 15/10 (S1 qua 2 BCVH): từ DASH-7f mẫu số phát = buu_gui (6, S1 chỉ tính cho M2 — mốc muộn hơn); tong_cong_theo_bcvh (công thức A) vẫn 7
  const t15 = P.tyLeApi(ctx.db, { bcvh: 'all', ngay: '2026-10-15' });
  const tq15 = den.tongQuanDen(ctx.db, { date: '2026-10-15' });
  assert.equal(t15.mau_so, 6);
  assert.equal(t15.mau_so, tq15.san_luong.buu_gui);
  assert.equal(tq15.san_luong.tong_cong_theo_bcvh, 7);
  assert.equal(tq15.san_luong.so_shbg_qua_nhieu_bcvh, 1);
});

test('(b) mọi BCVH trong phạm vi cùng ngày: kết quả y như trước (không BCVH nào ngoài tổng)', () => {
  const k = phatDash.ketQuaPhat(ctx.db, [M, M2, M5], { bcvh: 'all', ngay: null });
  assert.equal(k.mau_so, 6);
  assert.equal(k.so_bcvh_trong_tong, 3);
  assert.deepEqual(k.bcvh_ngoai_tong, []);
  assert.equal(k.cung_ngay, true);
  assert.equal(k.ngay, '2026-10-16');
});

test('(c) có ngày rõ ràng: giữ hành vi cũ (mọi BCVH trong phạm vi tính ngày đó)', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: 'all', ngay: '2026-10-16' });
  assert.equal(t.mau_so, 6, 'BCVH chậm không có hàng ngày 16/10 -> 0');
  assert.equal(t.cung_ngay, true);
  assert.deepEqual(t.bcvh_ngoai_tong, []);
  assert.equal(t.so_bcvh_trong_tong, 4, 'các BCVH có file (M, M2, M5, BCVH chậm), như phạm vi tính trước đây');
  const k = phatDash.ketQuaPhat(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay: '2026-10-15' });
  assert.equal(k.mau_so, 1 + 2 + 3, '15/10: M 1 (S1 thuộc M2, muộn hơn) + M2 2 + BCVH chậm 3 (cả BCVH chậm vì ngày được chọn rõ) — DASH-7f');
  assert.equal(k.so_bcvh_trong_tong, 6);
  assert.deepEqual(k.bcvh_ngoai_tong, []);
});

test('(d) một BCVH: không đổi (kể cả BCVH chậm), không trường mới', () => {
  const t = P.tyLeApi(ctx.db, { bcvh: M6 });
  assert.equal(t.mau_so, 3);
  assert.equal(t.ngay, '2026-10-15');
  assert.equal('so_bcvh_trong_tong' in t, false);
  assert.equal('bcvh_ngoai_tong' in t, false);
  assert.deepEqual(soTT(t), { PTC: 2, PKTC: 0, CHUYEN_HOAN: 0, CHUA_CO_TT: 1, LAC_HUONG: 0 });
  const k = phatDash.ketQuaPhat(ctx.db, [M6], { bcvh: M6, ngay: null });
  assert.equal(k.mau_so, 3);
  assert.equal('so_bcvh_trong_tong' in k, false);
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M }).mau_so, 3);
});

test('(e) BCVH chưa có file nào: không lỗi, ngoài tổng với ngay null', () => {
  const k = phatDash.ketQuaPhat(ctx.db, [M3], { bcvh: 'all', ngay: null });
  assert.equal(k.mau_so, 0);
  assert.equal(k.ptc, null);
  assert.equal(k.so_bcvh_trong_tong, 0);
  assert.deepEqual(k.bcvh_ngoai_tong, [{ ma: M3, ngay: null }]);
  assert.equal(k.ngay, null);
  assert.equal(P.tyLeApi(ctx.db, { bcvh: M3 }).mau_so, 0);
});

test('tapNgayChung: định nghĩa trùng thẻ Điều hành (ngày mới nhất; ngày rõ ràng ép mọi BCVH vào tổng)', () => {
  const byUnit = new Map([['a', '2026-10-16'], ['b', '2026-10-15'], ['c', '2026-10-16']]);
  assert.deepEqual(P.tapNgayChung(byUnit, ['a', 'b', 'c', 'd']), { ngay_chung: '2026-10-16', trong: ['a', 'c'], ngoai: [{ ma: 'b', ngay: '2026-10-15' }, { ma: 'd', ngay: null }] });
  assert.deepEqual(P.tapNgayChung(byUnit, ['a', 'b'], '2026-10-01'), { ngay_chung: '2026-10-01', trong: ['a', 'b'], ngoai: [] });
  assert.deepEqual(P.tapNgayChung(new Map(), ['a']), { ngay_chung: null, trong: [], ngoai: [{ ma: 'a', ngay: null }] });
});
