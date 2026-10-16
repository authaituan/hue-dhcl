// ==========================================
// Test DASH-7c-b: «Toàn Trung tâm» (bcvh=all) của tong-quan-den đếm bưu gửi KHÁC NHAU xuyên BCVH (công thức B);
// số từng BCVH và bcvh=<một BCVH> giữ nguyên. Server thật trên DB tạm; CSV / số hiệu GIẢ.
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

const PORT = 5936;
const M = '533140'; // có file 20, 19, 13/10
const M2 = '535470'; // có file 20, 19/10 (KHÔNG có 13/10 -> thiếu mốc tuần trước)
const M3 = '536250'; // có file 20/10 nhưng KHÔNG có dòng nào có mốc BCVH (chỉ dòng chưa nhận)
let ctx;
let workDir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
// Chỉ mục duy nhất (SHBG, BD10, BD8, mốc bưu gửi) của arrival_items: cùng SHBG + cùng BD8 ở hai BCVH phải khác BD10 mới nạp được cả hai dòng.
const b10 = (n) => `530100${M2}${String(n).padStart(7, '0')}`;
const sh = (k) => `ZZ7C${k}VN`;
const ts = (v) => (v === undefined ? 'NULL' : `2026-10-${v.slice(0, 2)} ${v.slice(3)}`);
function r(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: o.rc, Ten_duong_thu: 'Đường thư giả', SHBG: o.sh, So_hieu_BD10: o.bd10 || '',
    'Thời gian XN túi': ts(o.bag), 'Thời gian XN BG': ts(undefined), Ngay_gio_XND_BD10: ts(undefined), Ngay_gio_XND_BD10_tai_TTKT: ts(o.ttkt),
    So_hieu_BD8: o.bd8 !== undefined ? o.bd8 : `P${seq}`, Khoi_luong_thuc_te: String(o.w ?? 500), Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', _fd: o.fd
  };
}

// ---- 20/10 (hôm nay). M: X, Y, P (đi ngoài), Q (15:30, cut của M); M2: X (cùng túi BX1), P (đi ngoài), Z (16:00, cut của M2).
// A = 4 + 3 = 7; B = {X, Y, P, Q, Z} = 5; SHBG ở 2 BCVH: X, P = 2.
// ---- 19/10 (hôm qua) có ở M và M2. M cut 15:30, M2 cut 16:00.
// ---- 13/10 (tuần trước) chỉ M: 60 bưu gửi (đủ sàn 50) để thấy tử số tính trên đúng tập {M}.
const ROWS = [
  r({ rc: M, sh: sh('X'), bag: '20 09:00:00', bd8: 'BX1', w: 100 }),
  r({ rc: M, sh: sh('Y'), bag: '20 10:00:00', bd8: 'BY1', w: 200 }),
  r({ rc: M, sh: sh('P'), bag: '20 08:00:00', bd8: sh('P'), w: 1000 }),
  r({ rc: M, sh: sh('Q'), bag: '20 15:30:00', bd8: 'BQ', w: 300 }),
  r({ rc: M2, sh: sh('X'), bag: '20 13:00:00', bd10: b10(2), bd8: 'BX1', w: 150 }),
  r({ rc: M2, sh: sh('P'), bag: '20 12:00:00', bd10: b10(3), bd8: sh('P'), w: 700 }),
  r({ rc: M2, sh: sh('Z'), bag: '20 16:00:00', bd8: 'BZ', w: 400 }),
  // M3: chỉ bưu gửi chưa nhận (không mốc BCVH) trong file 20/10 -> BCVH có file nhưng không có bưu gửi đến
  r({ rc: M3, sh: sh('N1'), bd10: `530100${M3}0000001`, ttkt: '20 06:00:00', fd: '20' }),
  // hôm qua
  r({ rc: M, sh: sh('Y1'), bag: '19 09:00:00', bd8: sh('Y1') }),
  r({ rc: M, sh: sh('Y2'), bag: '19 11:00:00' }),
  r({ rc: M, sh: sh('V'), bag: '19 15:40:00' }), // SAU cut 15:30 của M -> bị loại TRƯỚC khi chọn dòng sớm nhất
  r({ rc: M2, sh: sh('Y1'), bag: '19 12:00:00', bd10: b10(4), bd8: sh('Y1') }), // trùng Y1 với M
  r({ rc: M2, sh: sh('Y3'), bag: '19 13:00:00' }),
  r({ rc: M2, sh: sh('V'), bag: '19 15:50:00' }), // trong cut 16:00 của M2 -> V vẫn được đếm (ở M2) dù dòng M sớm hơn
  // tuần trước (chỉ M)
  ...Array.from({ length: 60 }, (_, i) => r({ rc: M, sh: sh(`W${String(i).padStart(2, '0')}`), bag: '13 09:00:00' }))
];
const dayOfRow = (row) => {
  const t = row['Thời gian XN túi'];
  return t !== 'NULL' ? t.slice(0, 10) : `2026-10-${row._fd}`;
};

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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-dash-xuyen-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dash-xuyen-${Date.now()}.db` });
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

const tq = (query = {}) => den.tongQuanDen(ctx.db, { date: '2026-10-20', ...query });

test('(a) SHBG đến 2 BCVH ở giờ khác nhau: tổng B = A − 1 mỗi SHBG; dòng từng BCVH vẫn là số BCVH đó nhận', () => {
  const b = tq();
  assert.equal(b.san_luong.buu_gui, 5, 'B: X, Y, P, Q, Z');
  assert.equal(b.san_luong.tong_cong_theo_bcvh, 7, 'A: 4 + 3');
  assert.equal(b.san_luong.so_shbg_qua_nhieu_bcvh, 2, 'X và P');
  assert.equal(b.san_luong.tong_cong_theo_bcvh - b.san_luong.buu_gui, b.san_luong.so_shbg_qua_nhieu_bcvh, 'A − B = số SHBG qua 2 BCVH (không SHBG nào ở >= 3 BCVH)');
  assert.equal(b.theo_bcvh.find((x) => x.ma === M).san_luong.buu_gui, 4);
  assert.equal(b.theo_bcvh.find((x) => x.ma === M2).san_luong.buu_gui, 3);
  assert.equal(b.san_luong.luot, 7, 'lượt vẫn cộng từng BCVH (không thuộc phạm vi DASH-7c-b)');
});

test('(b) SHBG chỉ ở 1 BCVH: B = A (ngày 13/10 chỉ M có bưu gửi)', () => {
  const b = tq({ date: '2026-10-13' });
  // Ngày 13/10 chỉ M có dòng; M2/M3 bị ép theo date nhưng không có bưu gửi ngày đó nên không góp cửa sổ nào.
  assert.equal(b.san_luong.buu_gui, 60);
  assert.equal(b.san_luong.tong_cong_theo_bcvh, 60);
  assert.equal(b.san_luong.so_shbg_qua_nhieu_bcvh, 0);
});

test('(c) hàng đi ngoài xuyên BCVH: số đi ngoài, túi/kiện, khối lượng đúng B', () => {
  const b = tq();
  assert.equal(b.hang_di_ngoai.buu_gui, 1, 'P chỉ tính 1 lần (A sẽ là 2)');
  assert.equal(b.hang_di_ngoai.mau_so, 5);
  assert.equal(b.hang_di_ngoai.ty_le, 0.2);
  // BD8 khác nhau trên mọi dòng của 5 bưu gửi: BX1 (dùng ở cả 2 BCVH, 1 túi), BY1, P, BQ, BZ = 5 (A sẽ là 4 + 3 = 7)
  assert.equal(b.san_luong.tui_kien, 5);
  // Khối lượng dòng đại diện (sớm nhất): X(M)=100, Y=200, P(M 08:00)=1000, Q=300, Z=400 = 2000 g (A sẽ là 1600 + 1250 = 2850)
  assert.equal(b.san_luong.khoi_luong_g, 2000);
  assert.equal(b.sau_15h.buu_gui, 2, 'Q (15:30) và Z (16:00)');
  assert.equal(b.sau_15h.ty_le, 0.4);
});

test('(d) BCVH có file nhưng không có bưu gửi đến: không lỗi, số 0 ở dòng của BCVH đó, không ảnh hưởng tổng', () => {
  const b = tq();
  const m3 = b.theo_bcvh.find((x) => x.ma === M3);
  assert.equal(m3.co_du_lieu, true);
  assert.deepEqual(m3.san_luong, { luot: 0, buu_gui: 0 });
  assert.equal(b.san_luong.buu_gui, 5);
});

test('(e) mốc so sánh thiếu BCVH: tử và mẫu cùng tập BCVH, so_bcvh đúng', () => {
  const b = tq();
  // Tuần trước (13/10): chỉ M có file -> tập {M}; mẫu B(M, 13/10 tới 15:30) = 60; tử = B hôm nay CHỈ của M = 4 (X, Y, P, Q), không phải 5
  assert.deepEqual(b.san_luong.so_tuan_truoc_cung_gio, { gia_tri: 60, chenh_pct: -93.33, so_bcvh: 1 });
  // Hôm qua (19/10): M và M2 đều có -> tập {M, M2}. B ref = {Y1, Y2, Y3, V} = 4 (A sẽ là 3 + 4 = 7)
  const hq = b.san_luong.so_hom_qua_cung_gio;
  assert.equal(hq.gia_tri, 4);
  assert.equal(hq.so_bcvh, 2);
  assert.equal(hq.chenh_pct, null, 'mốc 4 dưới sàn 50');
  assert.equal(b.hang_di_ngoai.so_hom_qua_cung_gio.buu_gui, 1, 'Y1 đi ngoài (BD8 = SHBG) ở cả hai BCVH, đếm 1 lần');
  assert.equal(b.hang_di_ngoai.so_hom_qua_cung_gio.mau_so, 4);
  assert.equal(b.hang_di_ngoai.so_tuan_truoc_cung_gio.so_bcvh, 1);
});

test('(e2) cắt giờ theo BCVH của từng dòng áp TRƯỚC khi chọn dòng sớm nhất (V: dòng M 15:40 > cut 15:30 bị loại, V vẫn đếm ở M2)', () => {
  const wins = [
    { rc: M, day: '2026-10-19', to: '2026-10-19 15:30:00' },
    { rc: M2, day: '2026-10-19', to: '2026-10-19 16:00:00' }
  ];
  const withV = den.countAcross(ctx.db, wins);
  assert.equal(withV.bg, 4, 'Y1, Y2, Y3, V');
  assert.equal(den.countAcross(ctx.db, [wins[0]]).bg, 2, 'M một mình: Y1, Y2');
  assert.equal(den.countAcross(ctx.db, []).bg, 0, 'không cửa sổ -> 0, không lỗi');
});

test('(f) bcvh=<một BCVH>: kết quả y như trước (không trường mới, số = công thức riêng BCVH)', () => {
  const b = tq({ bcvh: M });
  assert.deepEqual(Object.keys(b.san_luong), ['luot', 'buu_gui', 'so_hom_qua_cung_gio', 'so_tuan_truoc_cung_gio']);
  assert.equal(b.san_luong.buu_gui, 4);
  assert.equal(b.hang_di_ngoai.buu_gui, 1);
  assert.equal(b.sau_15h.buu_gui, 1);
  assert.deepEqual(b.san_luong.so_tuan_truoc_cung_gio, { gia_tri: 60, chenh_pct: -93.33, so_bcvh: 1 });
  const all = tq();
  assert.deepEqual(all.theo_bcvh.find((x) => x.ma === M).san_luong, b.theo_bcvh[0].san_luong, 'dòng M trong all = dòng M khi chọn riêng');
});

test('(5) tổng B của dashboard = «Sản lượng đến» (aq.summary) cùng ngày, cùng 6 BCVH', () => {
  const f = aq.parseFilters({ from: '2026-10-20', to: '2026-10-20', receiver_code: ['533140', '535470', '537015', '537220', '535790', '536250'] },
    { allowed: ['from', 'to', 'receiver_code'] });
  const s = aq.summary(ctx.db, f, { isAdmin: false });
  const b = tq();
  assert.equal(b.san_luong.buu_gui, s.san_luong);
  assert.equal(b.hang_di_ngoai.buu_gui, s.hang_di_ngoai);
  assert.equal(b.san_luong.tui_kien, s.tui_kien);
  assert.equal(b.san_luong.khoi_luong_g, s.khoi_luong_g);
});
