// ==========================================
// Test DASH-7d: «Toàn Trung tâm» (bcvh=all) của tong-quan-den chỉ cộng các BCVH có «hôm nay» riêng đúng NGÀY CHUNG (ngay_du_lieu).
// BCVH chậm (chưa có file ngày chung) / chưa có file nào: ngoài tổng, dòng riêng giữ nguyên. Server thật trên DB tạm; CSV / số hiệu GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const den = require('../server/lib/dashboardDenQuery');
const aq = require('../server/lib/arrivalsQuery');

const PORT = 5937;
const M = '533140'; // file 16/10, 15/10
const M2 = '535470'; // file 16/10, 15/10
const M5 = '537015'; // file 16/10
const MS = '535790'; // BCVH chậm: chỉ có file 15/10 và 14/10 (chưa có 16/10)
// 536250 và 537220: chưa có file nào
let ctx;
let workDir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = (k) => `ZZ7D${k}VN`;
const ts = (v) => (v === undefined ? 'NULL' : `2026-10-${v.slice(0, 2)} ${v.slice(3)}`);
// Chỉ mục duy nhất (SHBG, BD10, BD8, mốc bưu gửi): cùng SHBG + cùng BD8 ở hai BCVH phải khác BD10 mới nạp được cả hai dòng.
const b10 = (n) => `530100${M2}${String(n).padStart(7, '0')}`;
function r(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: o.rc, Ten_duong_thu: 'Đường thư giả', SHBG: o.sh, So_hieu_BD10: o.bd10 || '',
    'Thời gian XN túi': ts(o.bag), 'Thời gian XN BG': ts(undefined), Ngay_gio_XND_BD10: ts(undefined), Ngay_gio_XND_BD10_tai_TTKT: ts(undefined),
    So_hieu_BD8: o.bd8 !== undefined ? o.bd8 : `P${seq}`, Khoi_luong_thuc_te: String(o.w ?? 500), Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}

// ---- 16/10 (ngày chung): M: X, Y, P (đi ngoài), M2: X (trùng X với M), Z; M5: W (14:30). A = 3 + 2 + 1 = 6; B = {X, Y, P, Z, W} = 5; qua 2 BCVH: X = 1.
// ---- 15/10 (hôm qua): M: S1, S2 (đi ngoài); M2: S1 (trùng), S3 -> B mốc = 3 (A mốc = 4). MS (chậm): T1, T2, T3 (T3 đi ngoài, 16:00 — sau 15:00).
// ---- 14/10: MS có U1 (nếu MS bị lọt vào tập hôm qua của tổng, mốc sẽ lệch).
const ROWS = [
  r({ rc: M, sh: sh('X'), bag: '16 09:00:00', bd8: 'BX1', w: 100 }),
  r({ rc: M, sh: sh('Y'), bag: '16 10:00:00', w: 200 }),
  r({ rc: M, sh: sh('P'), bag: '16 08:00:00', bd8: sh('P'), w: 1000 }),
  r({ rc: M2, sh: sh('X'), bag: '16 13:00:00', bd10: b10(2), bd8: 'BX1', w: 150 }),
  r({ rc: M2, sh: sh('Z'), bag: '16 14:00:00', w: 400 }),
  r({ rc: M5, sh: sh('W'), bag: '16 14:30:00', w: 50 }),
  r({ rc: M, sh: sh('S1'), bag: '15 09:00:00', bd8: 'BS1' }),
  r({ rc: M, sh: sh('S2'), bag: '15 10:00:00', bd8: sh('S2') }),
  r({ rc: M2, sh: sh('S1'), bag: '15 11:00:00', bd10: b10(3), bd8: 'BS1' }),
  r({ rc: M2, sh: sh('S3'), bag: '15 12:00:00' }),
  r({ rc: MS, sh: sh('T1'), bag: '15 08:00:00' }),
  r({ rc: MS, sh: sh('T2'), bag: '15 09:00:00' }),
  r({ rc: MS, sh: sh('T3'), bag: '15 16:00:00', bd8: sh('T3') }),
  r({ rc: MS, sh: sh('U1'), bag: '14 09:00:00' })
];
const dayOfRow = (row) => row['Thời gian XN túi'].slice(0, 10);

function writeFiles() {
  const groups = new Map();
  for (const row of ROWS) {
    const k = `${row.BC_nhan_BG}|${dayOfRow(row).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const [k, rows] of groups) {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(qt).join(','), ...rows.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-dash-cungngay-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dash-cungngay-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec("INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử')");
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const tq = (query = {}) => den.tongQuanDen(ctx.db, query);

test('(a) BCVH chậm (chỉ có file ngày trước) không vào tổng; bcvh_ngoai_tong đúng; dòng riêng của BCVH chậm giữ số ngày cũ', () => {
  const b = tq();
  assert.equal(b.ngay_du_lieu, '2026-10-16');
  assert.equal(b.cung_ngay_du_lieu, false, 'vẫn báo các BCVH lệch ngày (không đổi)');
  assert.equal(b.san_luong.buu_gui, 5, 'B trên T = {M, M2, M5}: X, Y, P, Z, W (không có T1..T3 của BCVH chậm)');
  assert.equal(b.san_luong.tong_cong_theo_bcvh, 6, 'A trên T: 3 + 2 + 1');
  assert.equal(b.san_luong.so_shbg_qua_nhieu_bcvh, 1);
  assert.equal(b.san_luong.luot, 6, 'lượt cộng trên T');
  assert.equal(b.so_bcvh_trong_tong, 3);
  assert.deepEqual(b.bcvh_ngoai_tong, [
    { ma: '536250', ngay: null }, { ma: '537220', ngay: null }, { ma: MS, ngay: '2026-10-15' }
  ]);
  const ms = b.theo_bcvh.find((x) => x.ma === MS);
  assert.equal(ms.ngay_du_lieu, '2026-10-15');
  assert.equal(ms.san_luong.buu_gui, 3, 'dòng riêng vẫn là số ngày cũ của nó');
  assert.equal(b.theo_bcvh.length, 6);
  assert.equal(b.bcvh_can_chu_y.tong, 6, 'BCVH cần chú ý x/6 vẫn xét cả 6 BCVH (không đổi)');
});

test('(a2) hàng đi ngoài, sau 15:00, den_luc, da_toi_gio chỉ lấy từ T', () => {
  const b = tq();
  assert.equal(b.hang_di_ngoai.buu_gui, 1, 'P; T3 đi ngoài của BCVH chậm không tính');
  assert.equal(b.hang_di_ngoai.mau_so, 5);
  assert.equal(b.san_luong.tui_kien, 5, 'BX1 (dùng ở 2 BCVH), BD8 của Y, P, Z, W');
  assert.equal(b.san_luong.khoi_luong_g, 100 + 200 + 1000 + 400 + 50);
  assert.equal(b.sau_15h.buu_gui, 0, 'T3 (16:00, BCVH chậm) không tính');
  assert.equal(b.sau_15h.da_toi_gio, false, 'trong T chưa BCVH nào tới 15:00 (BCVH chậm tới 16:00 ngày cũ không tính)');
  assert.equal(b.den_luc, '2026-10-16 14:30:00', 'den_luc lấy từ T');
});

test('(b) mọi BCVH cùng ngày (ép date): mọi BCVH vào tổng, kết quả như DASH-7c-b', () => {
  const b = tq({ date: '2026-10-16' });
  assert.equal(b.so_bcvh_trong_tong, 6);
  assert.deepEqual(b.bcvh_ngoai_tong, []);
  assert.equal(b.san_luong.buu_gui, 5);
  assert.equal(b.san_luong.tong_cong_theo_bcvh, 6);
  assert.equal(b.san_luong.so_shbg_qua_nhieu_bcvh, 1);
});

test('(c) mốc so sánh tính trên CÙNG tập T (BCVH chậm không lọt vào mốc; so_bcvh = số BCVH trong T có mốc)', () => {
  const b = tq();
  // Hôm qua = 15/10: M và M2 có file; M5 không có -> tập {M, M2}; B mốc = {S1, S2, S3} = 3 (A mốc = 4). MS (ngoài T) có 14/10 nhưng không góp.
  assert.deepEqual(b.san_luong.so_hom_qua_cung_gio, { gia_tri: 3, chenh_pct: null, so_bcvh: 2 });
  assert.equal(b.hang_di_ngoai.so_hom_qua_cung_gio.buu_gui, 1, 'S2');
  assert.equal(b.hang_di_ngoai.so_hom_qua_cung_gio.mau_so, 3);
  assert.equal(b.hang_di_ngoai.so_hom_qua_cung_gio.so_bcvh, 2);
  assert.equal(b.san_luong.so_tuan_truoc_cung_gio, null, 'không BCVH nào trong T có file ngày 09/10');
});

test('(d) BCVH chưa có file nào: ngoài T với ngay null, dòng riêng co_du_lieu=false, không lỗi', () => {
  const b = tq();
  const none = b.theo_bcvh.find((x) => x.ma === '536250');
  assert.equal(none.co_du_lieu, false);
  assert.equal(none.ngay_du_lieu, null);
  assert.deepEqual(none.san_luong, { luot: 0, buu_gui: 0 });
  assert.ok(b.bcvh_ngoai_tong.some((x) => x.ma === '536250' && x.ngay === null));
});

test('(e) SHBG xuyên 2 BCVH trong T vẫn đếm theo B (A − 1)', () => {
  const b = tq();
  assert.equal(b.san_luong.tong_cong_theo_bcvh - b.san_luong.buu_gui, 1);
  assert.equal(b.theo_bcvh.find((x) => x.ma === M).san_luong.buu_gui, 3);
  assert.equal(b.theo_bcvh.find((x) => x.ma === M2).san_luong.buu_gui, 2);
});

test('(f) bcvh=<một BCVH>: không đổi (không trường mới; den_luc, số của chính BCVH đó, kể cả BCVH chậm)', () => {
  const ms = tq({ bcvh: MS });
  assert.equal(ms.ngay_du_lieu, '2026-10-15');
  assert.equal(ms.san_luong.buu_gui, 3);
  assert.deepEqual(Object.keys(ms.san_luong), ['luot', 'buu_gui', 'so_hom_qua_cung_gio', 'so_tuan_truoc_cung_gio']);
  assert.equal('so_bcvh_trong_tong' in ms, false);
  assert.equal('bcvh_ngoai_tong' in ms, false);
  assert.equal(ms.den_luc, '2026-10-15 16:00:00');
  assert.equal(ms.sau_15h.buu_gui, 1);
  assert.equal(ms.sau_15h.da_toi_gio, true);
  assert.equal(ms.hang_di_ngoai.buu_gui, 1);
  const m = tq({ bcvh: M });
  assert.equal(m.san_luong.buu_gui, 3);
  assert.equal(m.theo_bcvh[0].san_luong.buu_gui, 3);
});

test('(g) tổng của Điều hành = «Sản lượng đến» (aq.summary) ngày chung, cùng 6 BCVH, khi BCVH chậm chưa có file ngày đó', () => {
  const f = aq.parseFilters({ from: '2026-10-16', to: '2026-10-16', receiver_code: ['533140', '535470', '536250', '537015', '537220', '535790'] },
    { allowed: ['from', 'to', 'receiver_code'] });
  const s = aq.summary(ctx.db, f, { isAdmin: false });
  const b = tq();
  assert.equal(b.san_luong.buu_gui, s.san_luong);
  assert.equal(b.hang_di_ngoai.buu_gui, s.hang_di_ngoai);
  assert.equal(b.san_luong.tui_kien, s.tui_kien);
  assert.equal(b.san_luong.khoi_luong_g, s.khoi_luong_g);
});
