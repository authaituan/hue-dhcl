// ==========================================
// Test DASH-12b / 12b-2 / 12b-3: GET /api/arrivals/dashboard/ket-qua-phat-thang — kết quả phát TỪ ĐẦU THÁNG và quy tắc «trạng thái theo NGÀY ĐẾN» (#92):
// mỗi LẦN ĐẾN D của một SHBG tại một BCVH lấy bản NHẬP CUỐI (lịch sử nhập, bỏ đợt hoàn tác) có ngày nhập giờ VN N, D <= N < D' (D' = lần đến kế tiếp).
// Ngày «đủ số liệu» = «Chưa có TT» < 10%. Lũy kế = tổng tử / tổng mẫu của các ngày đủ; chuỗi theo ngày; chênh theo giá trị làm tròn hiển thị;
// cache hai tầng; quyền (TIVI 403). Server thật trên DB tạm; CSV / SHBG GIẢ. Khung dựng dữ liệu như tests/phat-dashboard.test.js.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { replaceAssignedBcvh, VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const { setTiviScope } = require('../server/lib/tivi');
const CF = require('../server/lib/phatConfig');
const P = require('../server/lib/phat');
const PD = require('../server/lib/phatDashboard');

const PORT = 5941;
const [M, M2, M3, M4, M5, M6] = VALID_BCVH_CODES;
const URL = '/api/arrivals/dashboard/ket-qua-phat-thang';
const KQP = '/api/arrivals/dashboard/ket-qua-phat';
const USERS = {
  admin: { hrm: 'PT_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'PT_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'PT_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'PT_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'PT_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const ids = {};
let ctx;
let workDir;
let seq = 0;
let shSeq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZT${String(800000000 + (++shSeq))}VN`;
function r(rc, ymd, hms, shbg) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường A', SHBG: shbg, So_hieu_BD10: '',
    'Thời gian XN túi': `${ymd} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: `T${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
const rows = [];
const hms = (i) => `${String(6 + (i % 15)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
/** n SHBG đến BCVH rc ngày ymd; `them` = SHBG đã có (đến lại) cũng đến ngày này (đứng đầu danh sách). Trả danh sách SHBG của ngày. */
function taoHang(rc, ymd, n, them = []) {
  const list = [...them];
  for (const s of them) rows.push(r(rc, ymd, '07:00:00', s));
  for (let i = 0; i < n - them.length; i++) {
    const s = sh();
    list.push(s);
    rows.push(r(rc, ymd, hms(i), s));
  }
  return list;
}
function writeFiles() {
  const groups = new Map();
  for (const row of rows) {
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
/**
 * Ghi MỘT đợt nhập GIẢ: phat_batches + phat_status_history (nguồn của quy tắc DASH-12b-3) + phat_status_current (như nhập thật).
 * items: [[shbg, mã trạng thái]]; nhapLuc: UTC ISO (ngày nhập VN = nhapLuc + 7 giờ). Trả id đợt.
 */
function ghiDot(bcvh, items, nhapLuc) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, ids.admin, nhapLuc, items.length).lastInsertRowid;
  const cur = ctx.db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?');
  const his = ctx.db.prepare('INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?, ?)');
  const up = ctx.db.prepare(`INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bcvh, shbg) DO UPDATE SET trang_thai = excluded.trang_thai, batch_id = excluded.batch_id, nhap_luc = excluded.nhap_luc`);
  ctx.db.transaction(() => {
    for (const [s, tt] of items) {
      const prev = cur.get(bcvh, s);
      his.run(bcvh, s, tt, prev ? prev.trang_thai : null, bid, nhapLuc);
      up.run(bcvh, s, tt, bid, nhapLuc);
    }
  })();
  return bid;
}
/** Đánh dấu đợt đã hoàn tác (như hoanTacDot: trang_thai = da_hoan_tac; dòng lịch sử gắn batch_id của đợt bị hoàn tác nên cùng bị loại). */
function hoanTac(bid) {
  ctx.db.prepare("UPDATE phat_batches SET trang_thai = 'da_hoan_tac', hoan_tac_luc = ? WHERE id = ?").run(new Date().toISOString().replace(/\.\d+Z$/, 'Z'), bid);
}
/** Gán lần lượt các trạng thái (theo thứ tự khóa của plan) cho các SHBG đầu danh sách; bỏ CHUA_CO_TT (không nhập). */
function chia(list, plan) {
  const out = [];
  let i = 0;
  for (const [tt, n] of Object.entries(plan)) {
    for (let k = 0; k < n; k++) { if (tt !== 'CHUA_CO_TT') out.push([list[i], tt]); i++; }
  }
  return out;
}
async function call(p, who) {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  const res = await fetch(`${ctx.baseUrl}${p}`, { method: 'GET', headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
const kq = (qs, who = 'admin') => call(`${URL}${qs}`, who);
const D = (dd) => `2026-10-${dd}`;
const luc = (dd) => `2026-10-${dd}T05:00:00Z`; // 12:00 giờ VN ngày dd (nhập TRONG ngày đến)
const TT5 = ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT'];
const ratio4 = (n, d) => Math.round((n / d) * 10000) / 10000;
const st = {};
const tongLS = (bcvh, dd) => P.demNgay(ctx.db, bcvh, D(dd), { theoLichSu: true }).tong;
const so = (t) => Object.fromEntries(TT5.map((m) => [m, t[m]]));
const plan0 = (p) => Object.assign({ PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 0 }, p);

// Bảng số liệu theo ngày đến (mỗi ngày nhập TRONG ngày đó, giờ VN). CHUA_CO_TT = SHBG đến nhưng chưa nhập.
const PLAN = {
  M: { '01': { PKTC: 5, PTC: 10, CHUYEN_HOAN: 2, LAC_HUONG: 2, CHUA_CO_TT: 1 }, '02': { PTC: 30 }, '04': { CHUA_CO_TT: 40 },
    '05': { PTC: 20, PKTC: 4, CHUA_CO_TT: 1 }, '06': { PTC: 40, PKTC: 8, CHUYEN_HOAN: 4, LAC_HUONG: 3, CHUA_CO_TT: 5 } },
  M2: { '05': { PTC: 30, PKTC: 8, CHUA_CO_TT: 2 }, '06': { PTC: 44, PKTC: 3, CHUYEN_HOAN: 1, CHUA_CO_TT: 2 } },
  M3: { '04': { PTC: 29, CHUA_CO_TT: 1 }, '05': { PTC: 45, PKTC: 3, CHUA_CO_TT: 1 } }, // 05: 49 SHBG (dưới sàn so sánh 1 đơn vị)
  M4: { '01': { PTC: 76, PKTC: 2, CHUA_CO_TT: 2 } }
};
const dem = (pl) => Object.values(pl).reduce((a, b) => a + b, 0);

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-thang-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-thang-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvh, [M]);
  setTiviScope(ctx.db, ids.tivi, 'all');

  // ---- Hàng đến
  st.m01 = taoHang(M, D('01'), dem(PLAN.M['01']));
  st.shared = st.m01[0]; // đến ngày 01 VÀ 02 (ví dụ PO: ngày 01 nhập PKTC, ngày 02 nhập PTC -> 01 tính PKTC, 02 tính PTC)
  st.m02 = taoHang(M, D('02'), dem(PLAN.M['02']), [st.shared]);
  st.m04 = taoHang(M, D('04'), dem(PLAN.M['04']));
  st.m05 = taoHang(M, D('05'), dem(PLAN.M['05']));
  st.m06 = taoHang(M, D('06'), dem(PLAN.M['06']));
  st.m2_05 = taoHang(M2, D('05'), dem(PLAN.M2['05']));
  st.m2_06 = taoHang(M2, D('06'), dem(PLAN.M2['06']));
  st.m3_04 = taoHang(M3, D('04'), dem(PLAN.M3['04']));
  st.m3_05 = taoHang(M3, D('05'), dem(PLAN.M3['05']));
  st.m4_01 = taoHang(M4, D('01'), dem(PLAN.M4['01']));
  st.m5 = taoHang(M5, '2026-09-30', 55); // chỉ file 30/09 (cuối tháng trước)
  // M6: kịch bản quy tắc 2 (SHBG đến ngày 02 / 03)
  const [A, B, C, E, F, G, H, I, K, L1, L2] = Array.from({ length: 11 }, () => sh());
  st.m6 = { A, B, C, E, F, G, H, I, K, L1, L2 };
  [A, B, C, F, G, H, I, K].forEach((s, i) => rows.push(r(M6, D('02'), hms(i), s))); // ngày 02: A B C F G H I K
  [A, B, C, E, K, L1, L2].forEach((s, i) => rows.push(r(M6, D('03'), hms(i), s))); // ngày 03: A B C E K L1 L2 (A, B, C, K đến cả hai ngày)
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }

  // ---- Nhập: mỗi ngày đến được nhập TRONG ngày đó (12:00 giờ VN)
  ghiDot(M, chia(st.m01, PLAN.M['01']), luc('01')); // st.shared là phần tử đầu: PKTC
  ghiDot(M, chia(st.m02, PLAN.M['02']), luc('02')); // st.shared: PTC (giao lại)
  ghiDot(M, chia(st.m05, PLAN.M['05']), luc('05'));
  ghiDot(M, chia(st.m06, PLAN.M['06']), luc('06'));
  ghiDot(M2, chia(st.m2_05, PLAN.M2['05']), luc('05'));
  ghiDot(M2, chia(st.m2_06, PLAN.M2['06']), luc('06'));
  ghiDot(M3, chia(st.m3_04, PLAN.M3['04']), luc('04'));
  ghiDot(M3, chia(st.m3_05, PLAN.M3['05']), luc('05'));
  ghiDot(M4, chia(st.m4_01, PLAN.M4['01']), luc('01'));
  ghiDot(M5, chia(st.m5, { PTC: 50, PKTC: 3, CHUA_CO_TT: 2 }), '2026-09-30T05:00:00Z');
  // M6 (giờ VN = UTC + 7): b02 nhập ngày 02, b03 ngày 03, bQ / bH sẽ bị hoàn tác trong ca cuối
  ghiDot(M6, [[A, 'PKTC'], [C, 'PTC'], [E, 'PKTC'], [F, 'PKTC'], [I, 'PKTC'], [K, 'PKTC']], '2026-10-02T05:00:00Z'); // E đến ngày 03: nhập TRƯỚC khi đến
  ghiDot(M6, [[A, 'PTC'], [B, 'PTC'], [F, 'PTC']], '2026-10-03T05:00:00Z');
  st.bQ = ghiDot(M6, [[I, 'PTC'], [K, 'PTC']], '2026-10-03T06:00:00Z');
  st.bH = ghiDot(M6, [[H, 'PTC']], '2026-10-04T06:00:00Z');
  ghiDot(M6, [[L1, 'PTC']], '2026-10-02T16:59:59Z'); // 23:59:59 giờ VN ngày 02: TRƯỚC khi đến (ngày 03) -> chưa có TT
  ghiDot(M6, [[L2, 'PTC']], '2026-10-02T17:00:00Z'); // 00:00:00 giờ VN ngày 03: đúng ngày đến -> tính
  PD.xoaCachePhatThang();
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

const ngayOf = (b, d) => b.theo_ngay.find((x) => x.ngay === D(d));

test('hằng số so sánh tháng nằm ở phatConfig và trả qua khối nguong', async () => {
  assert.equal(CF.NGUONG_NGANG_DIEM, 0.5);
  assert.equal(CF.SO_NGAY_TOI_THIEU_SO_SANH, 2);
  assert.equal(CF.SAN_MAU_SO_SO_SANH, 50);
  const b = (await kq(`?bcvh=${M}`)).body;
  assert.equal(b.nguong.nguong_ngang_diem, 0.5);
  assert.equal(b.nguong.so_ngay_toi_thieu_so_sanh, 2);
  assert.equal(b.nguong.san_mau_so_so_sanh, 50);
  assert.equal(b.nguong.ptc_dat, 0.82);
  assert.equal(b.nguong.chua_co_tt_canh_bao, 0.1);
});

test('quy tắc 2 — SHBG đến hai ngày: ngày 01 nhập PKTC, ngày 02 nhập PTC -> 01 tính PKTC, 02 tính PTC; chỉ ngày 1 hoặc chỉ ngày 2; «mang sang» và biên giờ', () => {
  // M6, ngày 02: A PKTC (b02) | B chưa (b03 nhập ngày 03 >= D'=03) | C PTC | F PTC (bản nhập cuối b03) | G chưa | H PTC (nhập muộn ngày 04, bH) | I PTC (bQ) | K PKTC (b02; bQ ngày 03 thuộc lần đến 03)
  assert.deepEqual(so(tongLS(M6, '02')), plan0({ PTC: 4, PKTC: 2, CHUA_CO_TT: 2 }));
  // ngày 03: A PTC | B PTC (chỉ nhập ngày 03) | C chưa (chỉ nhập ngày 02) | E chưa (nhập ngày 02, TRƯỚC khi đến: «mang sang») | K PTC (bQ) | L1 chưa (23:59 VN ngày 02) | L2 PTC (00:00 VN ngày 03)
  assert.deepEqual(so(tongLS(M6, '03')), plan0({ PTC: 4, CHUA_CO_TT: 3 }));
  // trạng thái của M (SHBG đến lại): 01 tính PKTC, 02 tính PTC
  const t01 = tongLS(M, '01');
  const t02 = tongLS(M, '02');
  assert.equal(t01.PKTC, 5, 'st.shared (PKTC ngày 01) nằm trong 5 PKTC của ngày 01');
  assert.equal(t02.PTC, 30, 'st.shared (PTC ngày 02) nằm trong 30 PTC của ngày 02; nhập ngày 02 không đổi ngày 01');
  // hành vi CŨ (mặc định, /ty-le): trạng thái hiện tại duy nhất -> ngày 01 cũng thấy PTC của st.shared (không đổi, chỉ khác khi gọi theoLichSu)
  const cu = P.demNgay(ctx.db, M, D('01')).tong;
  assert.equal(cu.PTC, 11, 'mặc định giữ nguyên: ngày 01 mang PTC hiện tại của st.shared');
  assert.equal(cu.PKTC, 4);
});

test('lũy kế = tổng tử / tổng mẫu của các ngày ĐỦ số liệu (khác trung bình tỷ lệ ngày); ngày 04 chưa nhập và ngày 03 không file bị loại', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  assert.equal(b.ngay, D('06'));
  assert.equal(b.thang, '2026-10');
  const L = b.luy_ke;
  assert.deepEqual([L.tu_ngay, L.den_ngay, L.thang], [D('01'), D('06'), '2026-10']);
  // ngày đủ: 01 (20), 02 (30), 05 (25), 06 (60); ngày 04 (40, chưa 100%) loại cả tử lẫn mẫu
  assert.equal(L.mau_so, 20 + 30 + 25 + 60);
  assert.equal(L.theo_trang_thai.PTC.so, 10 + 30 + 20 + 40);
  assert.equal(L.theo_trang_thai.PTC.ty_le, ratio4(100, 135));
  assert.notEqual(L.theo_trang_thai.PTC.ty_le, ratio4((0.5 + 1 + 0.8 + 40 / 60) / 4, 1), 'không phải trung bình tỷ lệ ngày');
  assert.equal(L.theo_trang_thai.PKTC.so, 5 + 4 + 8);
  assert.equal(L.theo_trang_thai.CHUYEN_HOAN.so, 2 + 4);
  assert.equal(L.theo_trang_thai.LAC_HUONG.so, 2 + 3);
  assert.equal(L.theo_trang_thai.CHUA_CO_TT.so, 1 + 0 + 1 + 5);
  assert.equal(L.so_ngay_co_so_lieu, 4, 'đổi nghĩa (#92): số ngày ĐỦ số liệu');
  assert.equal(L.so_ngay_co_file, 5);
  assert.equal(L.so_ngay_trong_khoang, 6);
  assert.deepEqual(b.theo_ngay.map((x) => x.ngay), ['01', '02', '03', '04', '05', '06'].map(D));
  assert.deepEqual(ngayOf(b, '01'), {
    ngay: D('01'), mau_so: 20, ptc: 0.5, ty_le_pktc: 0.25, ty_le_chuyen_hoan: 0.1, ty_le_lac_huong: 0.1, ty_le_chua_co_tt: 0.05, co_so_lieu_phat: true, du_so_lieu: true
  });
  assert.equal(ngayOf(b, '06').ptc, ratio4(40, 60));
  assert.deepEqual(b.hom_nay, { ngay: D('06'), du_so_lieu: true, mau_so: 60 });
});

test('ngày thiếu file / ngày có hàng đến nhưng chưa xử lý: tỷ lệ null (ngắt đường), không vào lũy kế; du_so_lieu false', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  const d3 = ngayOf(b, '03');
  assert.deepEqual([d3.mau_so, d3.co_so_lieu_phat, d3.du_so_lieu], [0, false, false]);
  for (const k of ['ptc', 'ty_le_pktc', 'ty_le_chuyen_hoan', 'ty_le_lac_huong', 'ty_le_chua_co_tt']) assert.equal(d3[k], null, `03 ${k}`);
  const d4 = ngayOf(b, '04');
  assert.deepEqual([d4.mau_so, d4.co_so_lieu_phat, d4.du_so_lieu], [40, false, false]);
  for (const k of ['ptc', 'ty_le_pktc', 'ty_le_chuyen_hoan', 'ty_le_lac_huong', 'ty_le_chua_co_tt']) assert.equal(d4[k], null, `04 ${k}`);
  assert.equal(b.luy_ke.theo_trang_thai.PTC.ty_le, ratio4(100, 135), 'nếu ngày 04 bị tính, PTC sẽ thấp hơn nhiều');
});

test('hôm nay chưa xử lý (ngày 04 của M): PTC / PKTC / CH / LH đều 0 (0,0%), Chưa có TT 100%, du_so_lieu false, chenh null, không vào lũy kế', async () => {
  const k = (await call(`${KQP}?bcvh=${M}&ngay=${D('04')}`, 'admin')).body;
  assert.equal(k.mau_so, 40);
  for (const m of ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG']) assert.deepEqual([k.theo_trang_thai[m].so, k.theo_trang_thai[m].ty_le], [0, 0], m);
  assert.deepEqual([k.theo_trang_thai.CHUA_CO_TT.so, k.theo_trang_thai.CHUA_CO_TT.ty_le], [40, 1]);
  assert.equal(k.ptc, 0);
  assert.equal(k.co_so_lieu_phat, false, 'không có xử lý nào cho hàng đến ngày này');
  assert.equal(k.so_lieu_den_luc, null);
  assert.equal(k.du_so_lieu, false);
  const t = (await kq(`?bcvh=${M}&ngay=${D('04')}`)).body;
  assert.deepEqual(t.hom_nay, { ngay: D('04'), du_so_lieu: false, mau_so: 40 });
  assert.equal(t.chenh, null, 'hôm nay chưa đủ số liệu -> không so');
  assert.equal(t.luy_ke.so_ngay_co_so_lieu, 2);
  assert.equal(t.luy_ke.mau_so, 20 + 30);
});

test('ket-qua-phat: khóa cũ còn nguyên + du_so_lieu; ngày đủ / chưa đủ theo ngưỡng', async () => {
  const k = (await call(`${KQP}?bcvh=${M}`, 'admin')).body;
  for (const key of ['bcvh', 'pham_vi', 'ngay', 'cung_ngay', 'mau_so', 'so_shbg_chuyen_tiep_loai_bo', 'theo_trang_thai', 'ptc', 'muc_cap_nhat', 'co_so_lieu_phat',
    'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'nguong', 'xep_hang_bcvh', 'chua_du_du_lieu']) assert.ok(key in k, key);
  assert.equal(k.du_so_lieu, true, 'ngày 06: Chưa có TT 5/60 = 8,3% < 10%');
  assert.deepEqual(Object.keys(k.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'san_xep_hang_bcvh']);
});

test('«đủ số liệu»: Chưa có TT 9,9% / 10,0% / 10,1% (đúng 10,0% là chưa đủ)', () => {
  const t = (chua) => P.dungTyLe({ PTC: 1000 - chua, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: chua });
  assert.equal(PD.duSoLieu(t(99)), true);
  assert.equal(PD.duSoLieu(t(100)), false);
  assert.equal(PD.duSoLieu(t(101)), false);
  assert.equal(PD.duSoLieu(P.dungTyLe({ PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 0 })), false, 'mẫu số 0');
});

test('chênh lệch: theo giá trị đã làm tròn hiển thị; hướng tăng / giảm / ngang; backend không quyết tốt xấu', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  assert.deepEqual(Object.keys(b.chenh), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT']);
  assert.deepEqual(b.chenh.PTC, { chenh_diem: -7.4, huong: 'giam' }); // 66,7 − 74,1 (40/60 và 100/135)
  assert.deepEqual(b.chenh.PKTC, { chenh_diem: 0.7, huong: 'tang' }); // 13,3 − 12,6
  assert.deepEqual(b.chenh.CHUYEN_HOAN, { chenh_diem: 2.3, huong: 'tang' }); // 6,7 − 4,4
  assert.deepEqual(b.chenh.LAC_HUONG, { chenh_diem: 1.3, huong: 'tang' }); // 5,0 − 3,7
  assert.deepEqual(b.chenh.CHUA_CO_TT, { chenh_diem: 3.1, huong: 'tang' }); // 8,3 − 5,2
});

test('làm tròn: chênh-từ-gốc khác chênh-từ-hiển-thị thì backend trả theo giá trị hiển thị (56,8 − 61,2 = −4,4)', () => {
  assert.deepEqual(PD.chenhHienThi(0.5684, 0.6115), { chenh_diem: -4.4, huong: 'giam' });
  assert.equal(PD.dec1(0.5684), 568);
  assert.equal(PD.dec1(0.6115), 612);
  assert.equal(PD.chenhHienThi(null, 0.5), null);
  assert.equal(PD.chenhHienThi(0.5, null), null);
});

test('ngưỡng «ngang»: |chênh| 0,4 / 0,5 / 0,6 điểm (0,5 không còn là ngang)', () => {
  assert.deepEqual(PD.chenhHienThi(0.504, 0.5), { chenh_diem: 0.4, huong: 'ngang' });
  assert.deepEqual(PD.chenhHienThi(0.5, 0.504), { chenh_diem: -0.4, huong: 'ngang' });
  assert.deepEqual(PD.chenhHienThi(0.505, 0.5), { chenh_diem: 0.5, huong: 'tang' });
  assert.deepEqual(PD.chenhHienThi(0.5, 0.505), { chenh_diem: -0.5, huong: 'giam' });
  assert.deepEqual(PD.chenhHienThi(0.506, 0.5), { chenh_diem: 0.6, huong: 'tang' });
  assert.deepEqual(PD.chenhHienThi(0.5, 0.506), { chenh_diem: -0.6, huong: 'giam' });
  assert.deepEqual(PD.chenhHienThi(0.5, 0.5), { chenh_diem: 0, huong: 'ngang' });
});

test('chỉ trả chênh khi >= 2 ngày đủ số liệu và mẫu số hôm nay >= 50 (49 -> null, 50 -> có)', async () => {
  const a = (await kq(`?bcvh=${M2}`)).body; // ngày 05 (40) + 06 (50): hôm nay 50 = sàn
  assert.equal(a.luy_ke.so_ngay_co_so_lieu, 2);
  assert.ok(a.chenh && a.chenh.PTC.chenh_diem !== undefined);
  const b = (await kq(`?bcvh=${M3}`)).body; // ngày 04 (30) + 05 (49): hôm nay 49
  assert.equal(b.luy_ke.so_ngay_co_so_lieu, 2);
  assert.equal(b.hom_nay.mau_so, 49);
  assert.equal(b.chenh, null);
  const c = (await kq(`?bcvh=${M}&ngay=${D('05')}`)).body; // 3 ngày đủ nhưng hôm nay 25
  assert.equal(c.luy_ke.so_ngay_co_so_lieu, 3);
  assert.equal(c.chenh, null);
});

test('ngày 01 (một ngày): chênh = null; ngày dữ liệu cuối tháng trước khi ngày 01 chưa về: lũy kế vẫn là tháng trước', async () => {
  const a = (await kq(`?bcvh=${M4}`)).body;
  assert.equal(a.ngay, D('01'));
  assert.equal(a.theo_ngay.length, 1);
  assert.equal(a.luy_ke.so_ngay_co_so_lieu, 1);
  assert.equal(a.luy_ke.mau_so, 80);
  assert.equal(a.luy_ke.theo_trang_thai.PTC.ty_le, ratio4(76, 80));
  assert.equal(a.chenh, null);
  const c = (await kq(`?bcvh=${M5}`)).body;
  assert.equal(c.ngay, '2026-09-30');
  assert.equal(c.thang, '2026-09');
  assert.equal(c.luy_ke.tu_ngay, '2026-09-01');
  assert.equal(c.luy_ke.den_ngay, '2026-09-30');
  assert.equal(c.theo_ngay.length, 30);
  assert.equal(c.luy_ke.so_ngay_co_file, 1);
  assert.equal(c.luy_ke.mau_so, 55);
  assert.equal(c.luy_ke.theo_trang_thai.PTC.ty_le, ratio4(50, 55));
});

test('mẫu số 0: mọi tỷ lệ null, không NaN; BCVH chưa có file nào: không có ngày dữ liệu', async () => {
  const z = (await kq(`?bcvh=${M3}&ngay=${D('03')}`)).body; // M3 chưa có hàng ngày 01–03
  assert.equal(z.luy_ke.mau_so, 0);
  assert.equal(z.luy_ke.so_ngay_co_so_lieu, 0);
  for (const m of TT5) assert.equal(z.luy_ke.theo_trang_thai[m].ty_le, null, m);
  assert.equal(z.chenh, null);
  assert.deepEqual(z.hom_nay, { ngay: D('03'), du_so_lieu: false, mau_so: 0 });
  assert.ok(z.theo_ngay.every((x) => x.ptc === null && x.mau_so === 0));
  assert.ok(!JSON.stringify(z).includes('NaN'));
  // BCVH chưa có file nào (mã giả): không có ngày dữ liệu
  const n = PD.ketQuaPhatThang(ctx.db, ['999999'], { bcvh: '999999', ngay: null });
  assert.deepEqual([n.ngay, n.thang, n.hom_nay, n.luy_ke, n.theo_ngay, n.chenh], [null, null, null, null, [], null]);
});

test('bcvh=all: dùng NGÀY CHUNG (BCVH lệch ngày nằm ngoài tập cho cả tháng); lũy kế khớp tổng thẻ ngày', async () => {
  const b = (await kq('')).body;
  assert.equal(b.bcvh, 'all');
  assert.equal(b.ngay, D('06'));
  assert.equal(b.so_bcvh_trong_tong, 2, 'chỉ M và M2 có dữ liệu đến ngày 06');
  assert.deepEqual(b.bcvh_ngoai_tong.map((x) => x.ma).sort(), [M3, M4, M5, M6].sort());
  const L = b.luy_ke;
  // ngày 01: M 20 | 02: M 30 | 04: M 40 (chưa xử lý, loại) | 05: M 25 + M2 40 | 06: M 60 + M2 50. M3, M4, M5, M6 không vào.
  assert.equal(L.mau_so, 20 + 30 + 65 + 110);
  assert.equal(L.theo_trang_thai.PTC.so, 10 + 30 + (20 + 30) + (40 + 44));
  assert.equal(L.theo_trang_thai.PTC.ty_le, ratio4(10 + 30 + 50 + 84, 225));
  assert.equal(L.so_ngay_co_so_lieu, 4);
  assert.equal(ngayOf(b, '06').mau_so, 110);
  const the = (await call(KQP, 'admin')).body;
  assert.equal(the.ngay, b.ngay);
  assert.equal(the.mau_so, ngayOf(b, '06').mau_so);
  assert.equal(the.ptc, ngayOf(b, '06').ptc);
  assert.equal(the.du_so_lieu, b.hom_nay.du_so_lieu);
  const e = (await kq(`?bcvh=all&ngay=${D('05')}`)).body; // chọn ngày: T = mọi BCVH
  assert.equal(e.so_bcvh_trong_tong, undefined);
  assert.equal(ngayOf(e, '05').mau_so, 25 + 40 + 49);
});

test('một BCVH: M2 độc lập, phạm vi trả về', async () => {
  const a = (await kq(`?bcvh=${M2}`)).body;
  assert.deepEqual(a.pham_vi, [M2]);
  assert.equal(a.luy_ke.mau_so, 90);
  assert.equal(a.luy_ke.theo_trang_thai.PTC.so, 74);
  assert.equal(a.luy_ke.so_ngay_co_file, 2);
  assert.equal(a.luy_ke.so_ngay_trong_khoang, 6, 'ngày 01–06');
});

test('tham số và quyền: 400 tham số lạ; STAFF 403, không token 401; ADMIN / TTVH / GDVH 200; TIVI 403 (kể cả phạm vi all)', async () => {
  assert.equal((await kq('?tu=2026-10-01')).status, 400);
  assert.equal((await kq('?bcvh=xyz')).status, 400);
  assert.equal((await kq('?ngay=2026-02-30')).status, 400);
  assert.equal((await kq('', null)).status, 401);
  assert.equal((await kq('', 'staff')).status, 403);
  for (const who of ['admin', 'ttvh', 'gdvh']) {
    assert.equal((await kq('', who)).status, 200, who);
    assert.equal((await kq(`?bcvh=${M2}`, who)).status, 200, `${who} BCVH không được giao vẫn xem được (#79)`);
  }
  assert.equal((await kq('', 'tivi')).status, 403);
  assert.equal((await kq('?bcvh=all', 'tivi')).status, 403);
  const { TIVI_ALLOWED } = require('../server/lib/tivi');
  assert.ok(!TIVI_ALLOWED.some((x) => x.includes('ket-qua-phat-thang')));
});

test('Tivi vẫn gọi được ket-qua-phat (200, phạm vi all) với khóa cũ + du_so_lieu; không có khóa của endpoint tháng', async () => {
  const res = await call(KQP, 'tivi');
  assert.equal(res.status, 200);
  const b = res.body;
  for (const k of ['ptc', 'nguong', 'co_so_lieu_phat', 'xep_hang_bcvh', 'chua_du_du_lieu', 'du_so_lieu']) assert.ok(k in b, k);
  assert.ok(!('luy_ke' in b) && !('theo_ngay' in b) && !('chenh' in b));
});

// ---- Các ca dưới ĐỔI dữ liệu: để cuối file, theo thứ tự ----
test('quy tắc 2 (M6): nhập muộn tính cho NGÀY ĐẾN (95% -> 98%); hoàn tác đợt: ngày sau quay về Chưa có TT, ngày trước giữ', () => {
  const { G, K, I, H } = st.m6;
  const t02a = so(tongLS(M6, '02'));
  const t03a = so(tongLS(M6, '03'));
  assert.deepEqual(t02a, plan0({ PTC: 4, PKTC: 2, CHUA_CO_TT: 2 }));
  // nhập muộn: G (đến ngày 02) được nhập ngày 04 -> số ngày 02 tăng (PTC + 1, Chưa -1); ngày 03 KHÔNG đổi
  ghiDot(M6, [[G, 'PTC']], '2026-10-04T05:00:00Z');
  assert.deepEqual(so(tongLS(M6, '02')), plan0({ PTC: 5, PKTC: 2, CHUA_CO_TT: 1 }));
  assert.deepEqual(so(tongLS(M6, '03')), t03a);
  // hoàn tác bQ (đợt ngày 03 của I, K): ngày 03 của K quay về chưa; ngày 02 giữ: I về PKTC (bản nhập trước), K vẫn PKTC
  hoanTac(st.bQ);
  assert.deepEqual(so(tongLS(M6, '03')), plan0({ PTC: 3, CHUA_CO_TT: 4 }));
  assert.deepEqual(so(tongLS(M6, '02')), plan0({ PTC: 4, PKTC: 3, CHUA_CO_TT: 1 }));
  // hoàn tác bH: H (nhập muộn ngày 04) về chưa
  hoanTac(st.bH);
  assert.deepEqual(so(tongLS(M6, '02')), plan0({ PTC: 3, PKTC: 3, CHUA_CO_TT: 2 }));
  void K; void I; void H;
});

test('nhập muộn đổi số ngày đến tương ứng (M ngày 05) và không đổi ngày khác; cache bị vô hiệu sau đợt nhập mới và sau hoàn tác', async () => {
  const codes = [M];
  const p = { bcvh: M, ngay: null };
  PD.xoaCachePhatThang();
  const a1 = PD.ketQuaPhatThang(ctx.db, codes, p);
  const a2 = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(a1, a2, 'lần gọi thứ hai trong 60 giây lấy từ cache (cùng đối tượng)');
  assert.notEqual(PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }), a1, 'cache: false luôn tính lại');
  assert.deepEqual(PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }), a1, 'cùng dữ liệu thì cùng kết quả');
  assert.notEqual(PD.ketQuaPhatThang(ctx.db, codes, p, { now: Date.now() + 61 * 1000 }), a1, 'quá 60 giây tính lại');

  const http1 = (await kq(`?bcvh=${M}`)).body;
  assert.equal(ngayOf(http1, '05').ptc, ratio4(20, 25));
  assert.equal(http1.luy_ke.theo_trang_thai.PTC.so, 100);
  // SHBG cuối ngày 05 (chưa nhập) được nhập MUỘN vào ngày 06 -> tính cho ngày đến 05 (không phải 06)
  const bid = ghiDot(M, [[st.m05[24], 'PTC']], '2026-10-06T08:00:00Z');
  const http2 = (await kq(`?bcvh=${M}`)).body;
  assert.equal(ngayOf(http2, '05').ptc, ratio4(21, 25), '21/25 sau khi nhập muộn');
  assert.equal(http2.luy_ke.theo_trang_thai.PTC.so, 101);
  assert.equal(ngayOf(http2, '06').ptc, ratio4(40, 60), 'ngày 06 không đổi');
  const a3 = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.notEqual(a3, a1, 'đợt nhập mới vô hiệu cache');
  hoanTac(bid);
  const a4 = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.notEqual(a4, a3, 'hoàn tác vô hiệu cache');
  assert.equal(ngayOf(a4, '05').ptc, ratio4(20, 25), 'hoàn tác: ngày 05 quay về số cũ');
});

// Cache theo từng (BCVH, ngày) (DASH-12b-2): đổi dữ liệu chỉ tính lại phần bị ảnh hưởng, kết quả luôn bằng bản không cache.
test('cache theo (BCVH, ngày): đợt nhập của BCVH khác không tính lại; đợt nhập của một BCVH chỉ tính lại BCVH đó; file mới tính lại các ngày liên quan', () => {
  const codes = VALID_BCVH_CODES;
  const p = { bcvh: 'all', ngay: null }; // ngày chung 06 -> tập [M, M2]
  const bang = (a, b) => assert.deepEqual(a, b, 'kết quả có cache == không cache');
  const dem2 = () => PD.soLanDemNgay();
  const them = (bcvh) => ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, 0)').run(bcvh, ids.admin, new Date().toISOString().replace(/\.\d+Z$/, 'Z'));

  PD.xoaCachePhatThang();
  let c0 = dem2();
  const a = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem2() - c0, 5 + 2, 'lần đầu: mỗi (BCVH, ngày có file) một lần: M 5 ngày, M2 2 ngày');

  them(M3); // BCVH NGOÀI tập: chữ ký toàn cục đổi -> dựng lại kết quả nhưng KHÔNG tính lại ngày nào
  c0 = dem2();
  const b = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.notEqual(b, a);
  assert.equal(dem2() - c0, 0);
  bang(b, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));

  them(M2); // chỉ M2 (2 ngày) tính lại
  c0 = dem2();
  const c = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem2() - c0, 2, 'chỉ các ngày có file của M2');
  bang(c, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));

  // file mới (EMPTY, không đổi số liệu) ở ngày 06 (DASH-12b-4): chỉ các ngày có 06 trong cửa sổ [ngày − 1, ngày + 3] (03..07) — không còn tính lại cả tháng
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, 'FILE_GIA_DAY_06.csv', ?, '235959', 1, 'sha-gia-day-06', 0, 0, 'EMPTY')").run(M3, D('06'));
  c0 = dem2();
  const d = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem2() - c0, 3 + 2, 'M: ngày 04, 05, 06; M2: ngày 05, 06 (ngày 01, 02 không đổi)');
  bang(d, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));
  assert.deepEqual(d.luy_ke, a.luy_ke, 'số liệu không đổi vì file mới không có dòng nào');
  c0 = dem2();
  PD.ketQuaPhatThang(ctx.db, [M], { bcvh: M, ngay: D('02') });
  assert.equal(dem2() - c0, 0, 'ngày 01, 02 của M: file 06 nằm ngoài cửa sổ của chúng -> vẫn từ cache');
});

// DASH-12b-4: SHBG «đến lại» — file mới chỉ tính lại ngày của chính SHBG đó (ngày đến kế tiếp D' đổi) cộng cửa sổ của file.
test('cache: file mới KHÔNG chứa SHBG đến lại chỉ tính lại cửa sổ của nó; file mới chứa SHBG đến lại tính lại thêm đúng ngày của SHBG đó', () => {
  const codes = VALID_BCVH_CODES;
  const p = { bcvh: 'all', ngay: null };
  const dem3 = () => PD.soLanDemNgay();
  const insF = ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, ?, ?, '235959', 1, ?, 1, 1, 'EMPTY')");
  const insI = ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key)
    VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`);
  const dong = (fid, rc, shbg, day) => insI.run(fid, rc, shbg, `B${shbg}`, `${day} 10:00:00`, `${day} 10:00:00`, day, day);
  PD.xoaCachePhatThang();
  PD.ketQuaPhatThang(ctx.db, codes, p);

  // (1) file ngày 08 với SHBG hoàn toàn mới: chỉ các ngày có 08 trong cửa sổ (05..09): M ngày 05, 06 và M2 ngày 05, 06
  const f1 = insF.run(M, 'CTRL_08.csv', D('08'), 'sha-ctrl-08').lastInsertRowid;
  dong(f1, M, sh(), D('08'));
  let c0 = dem3();
  const a = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem3() - c0, 2 + 2);
  assert.deepEqual(a, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));

  // (2) file ngày 09 chứa một SHBG đã đến M ngày 01: cửa sổ (06..10: M ngày 06, M2 ngày 06) + ngày 01 của M (D' của SHBG đó đổi)
  const f2 = insF.run(M, 'DEN_LAI_09.csv', D('09'), 'sha-denlai-09').lastInsertRowid;
  dong(f2, M, st.m01[1], D('09'));
  c0 = dem3();
  const b = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem3() - c0, 1 + 1 + 1, 'M ngày 06, M2 ngày 06 (cửa sổ) + M ngày 01 (SHBG đến lại)');
  assert.deepEqual(b, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));
  assert.deepEqual(b.luy_ke, a.luy_ke, 'ngày đến kế tiếp mới (09) vẫn sau ngày nhập nên số liệu không đổi');
  // ngày 02 của M (không có SHBG nào đến lại): vẫn từ cache
  c0 = dem3();
  PD.ketQuaPhatThang(ctx.db, [M], { bcvh: M, ngay: D('02') });
  assert.equal(dem3() - c0, 0);
});

test('khởi động nóng: tính sẵn hai tầng cache, nhường vòng lặp giữa các bước, sau đó không tính lại; dừng sớm được', async () => {
  PD.xoaCachePhatThang();
  let nhuong = 0;
  const r = await PD.khoiDongNong(ctx.db, { nghi: (f) => { nhuong += 1; setImmediate(f); } });
  assert.equal(r.loi, null);
  assert.ok(r.so_ngay_bcvh_tinh > 0 && nhuong >= r.so_ngay_bcvh_tinh, 'mỗi (BCVH, ngày) một lượt nhường');
  const c0 = PD.soLanDemNgay();
  const a = PD.ketQuaPhatThang(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay: null });
  const b = PD.ketQuaPhatThang(ctx.db, [M], { bcvh: M, ngay: null });
  const c = PD.ketQuaPhatThang(ctx.db, [M2], { bcvh: M2, ngay: null });
  assert.equal(PD.soLanDemNgay() - c0, 0, 'đã tính sẵn: không còn tính lại ngày nào');
  assert.deepEqual(a, PD.ketQuaPhatThang(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay: null }, { cache: false }));
  assert.deepEqual(b, PD.ketQuaPhatThang(ctx.db, [M], { bcvh: M, ngay: null }, { cache: false }));
  assert.deepEqual(c, PD.ketQuaPhatThang(ctx.db, [M2], { bcvh: M2, ngay: null }, { cache: false }));
  PD.xoaCachePhatThang();
  const r2 = await PD.khoiDongNong(ctx.db, { dung: () => true });
  assert.deepEqual([r2.so_ngay_bcvh_tinh, r2.loi], [0, null], 'dừng sớm không tính gì');
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// DASH-12b-4 — NGHIỆM THU: chữ ký tính từ TRẠNG THÁI TRONG DB, bắt MỌI đường ghi. Với mỗi nguyên nhân, sau sự kiện: kết quả có cache == kết quả tính lại từ đầu
// (so sánh trực tiếp, trên nhiều khung nhìn: all, M, M2, M ngày 05) VÀ sự kiện thật sự đổi kết quả (để ca không rỗng). Ghi trực tiếp bằng SQL như các đường ghi ngoài khối tính.
// ---------------------------------------------------------------------------------------------------------------------------------------
const KHUNG = () => [
  { codes: VALID_BCVH_CODES, p: { bcvh: 'all', ngay: null } }, { codes: [M], p: { bcvh: M, ngay: null } },
  { codes: [M2], p: { bcvh: M2, ngay: null } }, { codes: [M], p: { bcvh: M, ngay: D('05') } }
];
function sanh(ten, suKien, { doi = true } = {}) {
  const lay = (cache) => KHUNG().map((k) => PD.ketQuaPhatThang(ctx.db, k.codes, k.p, { cache }));
  const truoc = lay(true); // nạp / lấy từ cache
  suKien();
  const sau = lay(true);
  const moi = lay(false);
  assert.deepEqual(sau, moi, `${ten}: cache phải bằng kết quả tính lại từ đầu`);
  PD.xoaTang1PhatThang(); // bỏ tầng 1: kiểm RIÊNG tầng 2 (chữ ký theo ngày) — tầng 2 không được trả ngày cũ dù tầng 1 không cứu
  assert.deepEqual(lay(true), moi, `${ten}: tầng 2 (chữ ký theo ngày) phải bằng kết quả tính lại từ đầu`);
  if (doi) assert.notDeepEqual(sau, truoc, `${ten}: sự kiện phải đổi kết quả (ca không được rỗng)`);
}
const mDong = (ymd) => ctx.db.prepare('SELECT id, tracking_no AS s, import_file_id AS f FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? ORDER BY id').all(M, ymd);
const themFile = (rc, ten, ymd, status = 'OK') => ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, ?, ?, '235959', 1, ?, 1, 1, ?)").run(rc, ten, ymd, `sha-${ten}`, status).lastInsertRowid;
const themDong = (fid, rc, shbg, ymd, hh = '10:00:00') => ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key)
  VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`).run(fid, rc, shbg, `B${shbg}-${ymd}`, `${ymd} ${hh}`, `${ymd} ${hh}`, ymd, ymd).lastInsertRowid;

test('DASH-12b-4: chỉ số liệu không đổi thì cache trúng (không tính lại); mọi nguyên nhân dưới đây đều làm cache KHÔNG trả số cũ', () => {
  PD.xoaCachePhatThang();
  KHUNG().forEach((k) => PD.ketQuaPhatThang(ctx.db, k.codes, k.p));
  const c0 = PD.soLanDemNgay();
  KHUNG().forEach((k) => PD.ketQuaPhatThang(ctx.db, k.codes, k.p));
  assert.equal(PD.soLanDemNgay() - c0, 0, 'DB không đổi: 0 ngày tính lại');
});

test('nguyên nhân 1 — nạp file hàng đến mới / thêm dòng của ngày D (SFTP, import --chia-ngay)', () => {
  sanh('thêm file + dòng ngày 06 của M', () => { const f = themFile(M, 'NAP_06_B.csv', D('06')); themDong(f, M, sh(), D('06')); });
});

test('nguyên nhân 2 — xoá dòng hàng đến chỉ ở bảng dòng, không đụng bảng file (scripts/xoa-du-lieu-bcvh.js)', () => {
  const dong = mDong(D('06'));
  sanh('xoá một dòng ngày 06 của M', () => { ctx.db.prepare('DELETE FROM arrival_items WHERE id = ?').run(dong[0].id); });
});

test('nguyên nhân 3 — sửa dòng tại chỗ (scripts/rederive-arrival.js UPDATE arrival_at / arrival_date): dời một dòng từ ngày 06 sang ngày 05', () => {
  const dong = mDong(D('06'));
  sanh('dời dòng 06 -> 05', () => { ctx.db.prepare("UPDATE arrival_items SET arrival_at = ?, arrival_date = ? WHERE id = ?").run(`${D('05')} 09:00:00`, D('05'), dong[1].id); });
  sanh('sửa giờ đến tại chỗ (cùng ngày, khác giờ)', () => { ctx.db.prepare("UPDATE arrival_items SET arrival_at = ? WHERE id = ?").run(`${D('06')} 19:30:00`, dong[2].id); }, { doi: false });
});

test('nguyên nhân 4 — ngày đến kế tiếp (SHBG đến lại) và đợt nhập phát: nhập muộn + lần đến sau cắt cửa sổ nhập', () => {
  const X = st.m05[1]; // đến M ngày 05, đã có PTC nhập ngày 05
  let bid;
  sanh('đợt nhập mới: X -> PKTC ngày 06 (tính cho lần đến 05, chưa có lần đến sau)', () => { bid = ghiDot(M, [[X, 'PKTC']], '2026-10-06T05:00:00Z'); });
  sanh('lần đến sau của X ngày 06 (ngày đến kế tiếp = 06): nhập ngày 06 chuyển sang lần đến 06', () => { themDong(themFile(M, 'DEN_LAI_06.csv', D('06')), M, X, D('06')); });
  sanh('hoàn tác đợt nhập', () => { hoanTac(bid); });
});

test('nguyên nhân 5 — xoá một dòng lịch sử nhập phát chỉ ở bảng lịch sử (script xoá dữ liệu BCVH)', () => {
  // một dòng lịch sử CÒN hiệu lực của SHBG đang có lần đến ngày 06 tại M (các ca trước đã xoá / dời một số dòng đến)
  const h = ctx.db.prepare(`SELECT h.id FROM phat_status_history h JOIN phat_batches pb ON pb.id = h.batch_id AND pb.trang_thai = 'da_nhap'
    WHERE h.bcvh = ? AND h.shbg IN (SELECT tracking_no FROM arrival_items WHERE receiver_code = ? AND arrival_date = ?) ORDER BY h.id LIMIT 1`).get(M, M, D('06'));
  sanh('xoá dòng lịch sử của SHBG ngày 06', () => { ctx.db.prepare('DELETE FROM phat_status_history WHERE id = ?').run(h.id); });
});

test('nguyên nhân 6 — thêm / xoá / khôi phục FILE của BCVH («Thay thế ngày», «Khôi phục»)', () => {
  const dong = mDong(D('04'));
  const fids = [...new Set(dong.map((d) => d.f))];
  const sao = dong.map((d) => ctx.db.prepare('SELECT * FROM arrival_items WHERE id = ?').get(d.id));
  const fsao = fids.map((f) => ctx.db.prepare('SELECT * FROM arrival_import_files WHERE id = ?').get(f));
  sanh('xoá file + dòng ngày 04 (thay thế)', () => {
    ctx.db.prepare('DELETE FROM arrival_items WHERE import_file_id IN (SELECT value FROM json_each(?))').run(JSON.stringify(fids));
    ctx.db.prepare('DELETE FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(?))').run(JSON.stringify(fids));
  });
  sanh('khôi phục: thêm lại file (id cũ) + dòng (id mới) ngày 04', () => {
    const cotF = Object.keys(fsao[0]).join(', ');
    for (const f of fsao) ctx.db.prepare(`INSERT INTO arrival_import_files (${cotF}) VALUES (${Object.keys(f).map((k) => `@${k}`).join(', ')})`).run(f);
    const cotD = Object.keys(sao[0]).filter((c) => c !== 'id');
    for (const r of sao) ctx.db.prepare(`INSERT INTO arrival_items (${cotD.join(', ')}) VALUES (${cotD.map((k) => `@${k}`).join(', ')})`).run(r);
  });
});

test('nguyên nhân 7 — ghi từ KẾT NỐI KHÁC (script chạy tiến trình riêng): dấu hiệu data_version', () => {
  const Database = require('better-sqlite3');
  const db2 = new Database(ctx.testDbPath);
  try {
    sanh('kết nối thứ hai thêm dòng ngày 05 của M', () => {
      db2.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key)
        SELECT import_file_id, receiver_code, route_name, ?, 'B-NGOAI', bag_confirmed_at, arrival_at, arrival_at_basis, arrival_date, arrival_evidence_count, bag_date, ward_key FROM arrival_items WHERE receiver_code = ? AND arrival_date = ? LIMIT 1`).run(sh(), M, D('05'));
    });
  } finally { db2.close(); }
});

test('nguyên nhân 4b — CHỈ ngày đến kế tiếp đổi (dòng đến sau chèn vào file có sẵn: không đổi bảng file, không đổi dữ liệu ngày 05): chữ ký «đến lại» của ngày 05 phải bắt được', () => {
  const Y = sh();
  const f05 = mDong(D('05'))[0].f; // file có sẵn của M (ngày 05)
  themDong(f05, M, Y, D('05'), '08:00:00'); // Y đến M ngày 05
  ghiDot(M, [[Y, 'PKTC']], '2026-10-06T05:00:00Z'); // nhập ngày 06 (sau ngày đến 05)
  sanh('sự kiện: Y đến lại ngày 06, dòng chèn vào file có sẵn -> ngày đến kế tiếp của Y = 06 > ngày nhập? không: nhập ngày 06 không còn < 06', () => { themDong(f05, M, Y, D('06'), '08:30:00'); });
});
