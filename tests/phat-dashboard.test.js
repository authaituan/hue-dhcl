// ==========================================
// Test PHAT-3b (#79): GET /api/arrivals/dashboard/ket-qua-phat — quyền, cờ «có số liệu phát» THEO NGÀY, sàn xếp hạng, thứ tự xếp hạng,
// hai ngưỡng màu, và /api/phat/ty-le không đổi. Server thật trên DB tạm; CSV / SHBG GIẢ (9 chữ số, không có dãy ≥ 15 chữ số).
// Kịch bản đo `ton_cho` (KHÔNG nằm trong endpoint) chỉ chạy khi PHAT_PERF=1: dữ liệu giả 6 BCVH × 31 ngày, in số đo (ms) ra màn hình.
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

const PORT = 5924;
const [M, M2, M3, M4, M5, M6] = VALID_BCVH_CODES; // 533140, 535470, 536250, 537015, 537220, 535790
const D = '2026-10-20';
const URL = '/api/arrivals/dashboard/ket-qua-phat';
const USERS = {
  admin: { hrm: 'PD_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'PD_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvhM: { hrm: 'PD_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao M (không ảnh hưởng endpoint kết quả phát; chỉ /api/phat/* nhập / lịch sử)
  gdvhMM2: { hrm: 'PD_GDVH2', pass: 'Gdvh@123', role: 'GDVH' }, // được giao M và M2
  gdvhNone: { hrm: 'PD_GDVH0', pass: 'Gdvh@123', role: 'GDVH' }, // chưa được giao
  staff: { hrm: 'PD_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'PD_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const ids = {};
let ctx;
let workDir;
let seq = 0;
let shSeq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZZ${String(900000000 + (++shSeq))}VN`;
const ts = (day, hms) => `2026-10-${day} ${hms}`;
function r(rc, day, hms, shbg) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường A', SHBG: shbg, So_hieu_BD10: '',
    'Thời gian XN túi': ts(day, hms), 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}

// n SHBG giả đến BCVH `rc` ngày `day` (DD), giờ rải 06:00–20:59; trả danh sách SHBG và ghi vào `rows`.
const rows = [];
function taoHang(rc, day, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = sh();
    list.push(s);
    rows.push(r(rc, day, `${String(6 + (i % 15)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`, s));
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

// Ghi thẳng một đợt nhập GIẢ vào phat_status_current (cách tạo dữ liệu của harness; đường nhập thật đã có test ở phat.test.js).
// items: [[shbg, mã trạng thái]]; nhapLuc: UTC ISO.
function ghiDot(bcvh, items, nhapLuc) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, ids.admin, nhapLuc, items.length).lastInsertRowid;
  const ins = ctx.db.prepare('INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)');
  ctx.db.transaction(() => { for (const [s, tt] of items) ins.run(bcvh, s, tt, bid, nhapLuc); })();
  return bid;
}
// Gán lần lượt các trạng thái cho các SHBG đầu danh sách: plan = { PTC: 36, PKTC: 6, ... }.
function chiaTrangThai(list, plan) {
  const out = [];
  let i = 0;
  for (const [tt, n] of Object.entries(plan)) for (let k = 0; k < n; k++) out.push([list[i++], tt]);
  return out;
}

async function call(p, who, extra = {}) {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  const res = await fetch(`${ctx.baseUrl}${p}`, { method: 'GET', headers, ...extra });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
const kq = async (qs, who = 'admin') => call(`${URL}${qs}`, who);

const T_20 = '2026-10-20T03:30:00Z'; // đợt nhập các SHBG ngày 20/10 (10:30 Bangkok)
const T_20B = '2026-10-20T05:45:00Z'; // đợt nhập thứ hai của M (12:45 Bangkok) — muộn hơn T_20
const T_18 = '2026-10-18T09:00:00Z'; // đợt nhập các SHBG ngày 18/10 (16:00 Bangkok)
const st = {};

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-dash-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-dash-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvhM, [M]);
  replaceAssignedBcvh(ctx.db, ids.gdvhMM2, [M, M2]);
  setTiviScope(ctx.db, ids.tivi, 'all');

  // Dữ liệu «đến» GIẢ. Ngày 20/10 là «hôm nay» của M, M2, M4, M5; M3 chỉ có file ngày 19/10; M6 chưa có file nào.
  st.m = taoHang(M, '20', 60); // mẫu số 60 (≥ sàn)
  st.m19 = taoHang(M, '19', 10); // ngày 19/10: có hàng, KHÔNG ai nhập
  st.m18 = taoHang(M, '18', 5); // ngày 18/10: nhập ở đợt sớm hơn
  st.m2 = taoHang(M2, '20', 50); // mẫu số 50 = đúng sàn -> được xếp hạng
  st.m3 = taoHang(M3, '19', 49); // mẫu số 49 = dưới sàn một đơn vị
  st.m4 = taoHang(M4, '20', 80); // đủ mẫu số nhưng chưa ai nhập
  st.m5 = taoHang(M5, '20', 55);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }

  // M: 60 SHBG ngày 20/10 -> PTC 36, PKTC 6, CHUYEN_HOAN 3, LAC_HUONG 3 (48 có trạng thái, 12 chưa) nhập ở hai đợt; ngày 18/10: 5 PTC.
  const mTT = chiaTrangThai(st.m, { PTC: 36, PKTC: 6, CHUYEN_HOAN: 3, LAC_HUONG: 3 });
  ghiDot(M, mTT.slice(0, 30), T_20);
  ghiDot(M, mTT.slice(30), T_20B);
  ghiDot(M, chiaTrangThai(st.m18, { PTC: 5 }), T_18);
  ghiDot(M2, chiaTrangThai(st.m2, { PTC: 45 }), T_20); // 45/50 = 0,9
  ghiDot(M3, chiaTrangThai(st.m3, { PTC: 49 }), T_20); // 100% nhưng dưới sàn
  ghiDot(M5, chiaTrangThai(st.m5, { PTC: 33 }), T_20); // 33/55 = 0,6 đúng bằng M (36/60)
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------- hằng số ----------------
test('hằng số máy chủ: hai ngưỡng màu PTC, sàn xếp hạng BCVH 50, sàn phường/xã 10 (chỉ khai báo), đóng băng', () => {
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
  assert.equal(CF.NGUONG_CHUA_CO_TT_CANH_BAO, 0.10);
  assert.equal(CF.SAN_XEP_HANG_BCVH, 50);
  assert.equal(CF.SAN_XEP_HANG_PHUONG_XA, 10);
  assert.ok(Object.isFrozen(CF));
  assert.equal(Object.keys(CF).length, 4);
});

// ---------------- quyền ----------------
test('quyền: không token 401; STAFF 403; TIVI 403 (kể cả đã có phạm vi); ADMIN, TTVH 200', async () => {
  assert.equal((await kq('', null)).status, 401);
  assert.equal((await kq('', 'staff')).status, 403);
  assert.equal((await kq('', 'tivi')).status, 403);
  assert.equal((await kq(`?bcvh=${M}`, 'tivi')).status, 403);
  assert.equal((await kq('')).status, 200);
  assert.equal((await kq('', 'ttvh')).status, 200);
  assert.equal((await kq(`?bcvh=${M2}`, 'ttvh')).status, 200);
});

test('quyền GDVH (#72): xem ĐỦ mọi BCVH như ADMIN, không phụ thuộc user_bcvh — được giao, chưa giao, xin BCVH bất kỳ', async () => {
  const admin = (await kq('')).body;
  for (const who of ['gdvhM', 'gdvhMM2', 'gdvhNone']) {
    const all = await kq('', who);
    assert.equal(all.status, 200, who);
    assert.deepEqual(all.body, admin, `${who}: cùng phản hồi với ADMIN`);
    assert.deepEqual(all.body.pham_vi, VALID_BCVH_CODES);
    assert.equal((await kq('?bcvh=all', who)).body.mau_so, 294);
  }
  // xin BCVH ngoài danh sách được giao, hoặc khi chưa được giao BCVH nào: vẫn 200 và đúng số của BCVH đó
  assert.equal((await kq(`?bcvh=${M2}`, 'gdvhM')).body.mau_so, 50);
  assert.equal((await kq(`?bcvh=${M5}`, 'gdvhMM2')).body.mau_so, 55);
  const none = (await kq(`?bcvh=${M4}`, 'gdvhNone')).body;
  assert.deepEqual(none.pham_vi, [M4]);
  assert.equal(none.mau_so, 80);
  assert.deepEqual((await kq(`?bcvh=${M}`, 'gdvhNone')).body, (await kq(`?bcvh=${M}`)).body);
});

test('tham số: lạ / lặp / sai -> 400', async () => {
  for (const qs of ['?date=2026-10-20', '?bcvh=999999', '?bcvh=533140&bcvh=535470', '?ngay=2026-13-40', '?ngay=20-10-2026', '?ngay=2026-10-20&ngay=2026-10-19', '?gioi_han=3']) {
    assert.equal((await kq(qs)).status, 400, qs);
  }
  assert.equal((await kq('?bcvh=all&ngay=')).status, 200, 'ngay rỗng = mặc định');
});

// ---------------- số liệu ----------------
test('một BCVH: mẫu số, 5 trạng thái (số + tỷ lệ), ptc, mức cập nhật; khớp /api/phat/ty-le', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  assert.equal(b.bcvh, M);
  assert.equal(b.ngay, D);
  assert.equal(b.cung_ngay, true);
  assert.equal(b.mau_so, 60);
  assert.deepEqual(Object.keys(b.theo_trang_thai), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'CHUA_CO_TT', 'LAC_HUONG']);
  assert.deepEqual(Object.fromEntries(Object.entries(b.theo_trang_thai).map(([k, v]) => [k, v.so])), { PTC: 36, PKTC: 6, CHUYEN_HOAN: 3, CHUA_CO_TT: 12, LAC_HUONG: 3 });
  assert.equal(b.theo_trang_thai.PTC.ty_le, 0.6);
  assert.equal(b.theo_trang_thai.CHUA_CO_TT.ty_le, 0.2);
  assert.equal(b.theo_trang_thai.PTC.nhan, 'Phát thành công');
  assert.equal(b.ptc, 0.6, 'PTC tính trên CẢ mẫu số');
  assert.equal(b.muc_cap_nhat, 0.8, '100% trừ tỷ lệ chưa có thông tin phát');
  // cùng số với /ty-le (dùng chung phép tính)
  const t = (await call(`/api/phat/ty-le?bcvh=${M}&ngay=${D}`, 'admin')).body;
  assert.equal(t.mau_so, b.mau_so);
  assert.deepEqual(t.theo_trang_thai, b.theo_trang_thai);
  assert.equal(t.muc_cap_nhat, b.muc_cap_nhat);
  // mẫu số khớp san_luong.buu_gui của tong-quan-den (dữ liệu tới hết ngày)
  const tq = (await call(`/api/arrivals/dashboard/tong-quan-den?bcvh=${M}&date=${D}`, 'admin')).body;
  assert.equal(tq.san_luong.buu_gui, b.mau_so);
});

test('tất cả BCVH: cộng đúng từng BCVH ở ngày «hôm nay» của riêng nó; cung_ngay=false khi lệch ngày', async () => {
  const b = (await kq('')).body;
  assert.equal(b.bcvh, 'all');
  assert.deepEqual(b.pham_vi, VALID_BCVH_CODES);
  assert.equal(b.ngay, D, 'ngày mới nhất');
  assert.equal(b.cung_ngay, false, 'M3 mới có dữ liệu tới 19/10');
  assert.equal(b.mau_so, 60 + 50 + 49 + 80 + 55);
  assert.equal(b.theo_trang_thai.PTC.so, 36 + 45 + 49 + 0 + 33);
  assert.equal(b.ptc, Math.round(((36 + 45 + 49 + 33) / 294) * 10000) / 10000);
  // ngay chung ép mọi BCVH về một ngày: M3 không có hàng ngày 20/10
  const d = (await kq(`?ngay=${D}`)).body;
  assert.equal(d.cung_ngay, true);
  assert.equal(d.mau_so, 60 + 50 + 80 + 55);
});

test('ngày không có hàng đến: mẫu số 0, tỷ lệ null, không có số liệu', async () => {
  const b = (await kq(`?bcvh=${M}&ngay=2026-10-10`)).body;
  assert.equal(b.mau_so, 0);
  assert.equal(b.ptc, null);
  assert.equal(b.muc_cap_nhat, null);
  assert.equal(b.co_so_lieu_phat, false);
  assert.equal(b.so_lieu_den_luc, null);
  assert.equal(b.so_lieu_den_luc_bangkok, null);
});

// ---------------- cờ theo ngày ----------------
test('co_so_lieu_phat / so_lieu_den_luc THEO NGÀY: ngày chưa ai nhập = false + null, không mượn giờ của đợt ngày khác', async () => {
  const hom = (await kq(`?bcvh=${M}`)).body;
  assert.equal(hom.co_so_lieu_phat, true);
  assert.equal(hom.so_lieu_den_luc, T_20B, 'đợt muộn nhất trong các SHBG của ngày 20/10');
  assert.equal(hom.so_lieu_den_luc_bangkok, '2026-10-20 12:45:00');

  const cu = (await kq(`?bcvh=${M}&ngay=2026-10-18`)).body;
  assert.equal(cu.co_so_lieu_phat, true);
  assert.equal(cu.so_lieu_den_luc, T_18, 'giờ của đợt nhập ngày 18/10, không phải đợt mới nhất toàn BCVH');
  assert.equal(cu.mau_so, 5);
  assert.equal(cu.ptc, 1);

  const chua = (await kq(`?bcvh=${M}&ngay=2026-10-19`)).body;
  assert.equal(chua.mau_so, 10);
  assert.equal(chua.co_so_lieu_phat, false, 'có 10 SHBG đến nhưng chưa ai nhập');
  assert.equal(chua.so_lieu_den_luc, null);
  assert.equal(chua.so_lieu_den_luc_bangkok, null);
  assert.equal(chua.ptc, 0);
  assert.equal(chua.muc_cap_nhat, 0);

  // /ty-le GIỮ NGUYÊN hành vi cũ: cùng ngày chưa ai nhập vẫn ra giờ của đợt gần nhất (đây chính là lỗi khảo sát mà endpoint mới sửa)
  const cuTyLe = (await call(`/api/phat/ty-le?bcvh=${M}&ngay=2026-10-19`, 'admin')).body;
  assert.equal(cuTyLe.so_lieu_den_luc, T_20B);
  // BCVH chưa từng có đợt nào
  const m4 = (await kq(`?bcvh=${M4}`)).body;
  assert.equal(m4.mau_so, 80);
  assert.equal(m4.co_so_lieu_phat, false);
  assert.equal(m4.so_lieu_den_luc, null);
});

test('cờ cấp tổng: đúng khi ít nhất một BCVH có số liệu trong ngày của nó; giờ = muộn nhất trong các BCVH có số liệu', async () => {
  const all = (await kq('')).body;
  assert.equal(all.co_so_lieu_phat, true);
  assert.equal(all.so_lieu_den_luc, T_20B);
  // chỉ nhìn các BCVH chưa ai nhập ở ngày 19/10 (M có 10 SHBG chưa nhập, M3 đã nhập hết ngày 19/10): đổi sang ngày 19/10
  const d19 = (await kq('?ngay=2026-10-19')).body;
  assert.equal(d19.co_so_lieu_phat, true, 'M3 có số liệu ngày 19/10');
  assert.equal(d19.so_lieu_den_luc, T_20);
  const d10 = (await kq('?ngay=2026-10-10')).body;
  assert.equal(d10.co_so_lieu_phat, false);
  assert.equal(d10.so_lieu_den_luc, null);
});

// ---------------- ngưỡng ----------------
test('hai ngưỡng màu có trong phản hồi (lấy từ hằng số máy chủ), kể cả khi không có số liệu', async () => {
  for (const qs of ['', `?bcvh=${M}`, `?bcvh=${M4}`, '?ngay=2026-10-10']) {
    const b = (await kq(qs)).body;
    assert.deepEqual(b.nguong, { ptc_dat: CF.NGUONG_PTC_DAT, chua_co_tt_canh_bao: CF.NGUONG_CHUA_CO_TT_CANH_BAO }, qs);
  }
});

// ---------------- xếp hạng ----------------
test('xếp hạng BCVH: PTC giảm dần; đồng hạng cùng hạng; sàn mẫu số 50 (đúng 50 được xếp, 49 thì không)', async () => {
  const b = (await kq('')).body;
  assert.deepEqual(b.xep_hang_bcvh.map((x) => [x.bcvh, x.hang, x.ptc, x.mau_so]), [
    [M2, 1, 0.9, 50], // mẫu số đúng sàn
    [M, 2, 0.6, 60], // đồng hạng với M5 (36/60 = 33/55), hòa theo mã BCVH
    [M5, 2, 0.6, 55]
  ]);
  assert.deepEqual(Object.keys(b.xep_hang_bcvh[0]), ['bcvh', 'ten', 'mau_so', 'ptc', 'hang']);
  assert.ok(typeof b.xep_hang_bcvh[0].ten === 'string' && b.xep_hang_bcvh[0].ten);
  assert.ok(!b.xep_hang_bcvh.some((x) => x.bcvh === M3), 'M3 PTC 100% nhưng mẫu số 49 < 50 -> không xếp hạng');
});

test('chưa đủ dữ liệu: dưới sàn / chưa nhập ghi lý do, KHÔNG xếp cuối; mẫu số 0 (chưa có file) là dưới sàn', async () => {
  const b = (await kq('')).body;
  const byCode = Object.fromEntries(b.chua_du_du_lieu.map((x) => [x.bcvh, x]));
  assert.deepEqual(Object.keys(byCode).sort(), [M3, M4, M6].sort());
  assert.equal(byCode[M3].mau_so, 49);
  assert.equal(byCode[M3].ly_do, 'duoi_san', 'PTC 100% nhưng dưới sàn');
  assert.ok(b.chua_du_du_lieu.every((x) => typeof x.ten === 'string' && x.ten));
  assert.equal(byCode[M4].ly_do, 'chua_nhap');
  assert.equal(byCode[M4].mau_so, 80);
  assert.equal(byCode[M6].ly_do, 'duoi_san');
  assert.equal(byCode[M6].mau_so, 0);
  assert.deepEqual(Object.keys(byCode[M4]), ['bcvh', 'ten', 'mau_so', 'ly_do']);
  assert.equal(b.xep_hang_bcvh.length + b.chua_du_du_lieu.length, 6, 'mỗi BCVH nằm đúng một danh sách');
  assert.ok(b.xep_hang_bcvh.every((x) => x.hang >= 1 && x.hang <= 3));
  assert.deepEqual(Object.values(PD.LY_DO).sort(), ['chua_nhap', 'duoi_san']);
});

test('xếp hạng theo ngày đã chọn: ngay=19/10 — M có 10 SHBG (dưới sàn) dù hôm nay đủ mẫu', async () => {
  const b = (await kq('?ngay=2026-10-19')).body;
  assert.deepEqual(b.xep_hang_bcvh, [], 'mọi BCVH đều dưới sàn hoặc chưa nhập ở ngày 19/10 (M3 49 < 50)');
  const byCode = Object.fromEntries(b.chua_du_du_lieu.map((x) => [x.bcvh, x]));
  assert.equal(byCode[M].ly_do, 'duoi_san');
  assert.equal(byCode[M].mau_so, 10);
});

test('xếp hạng chỉ khi phạm vi có từ 2 BCVH; GDVH thấy đủ các BCVH đủ điều kiện, kể cả khi chỉ được giao ít hoặc không được giao', async () => {
  const one = (await kq(`?bcvh=${M}`)).body;
  assert.equal(one.xep_hang_bcvh, null);
  assert.equal(one.chua_du_du_lieu, null);
  const admin = (await kq('')).body;
  for (const who of ['gdvhM', 'gdvhMM2', 'gdvhNone']) {
    const g = (await kq('', who)).body;
    assert.deepEqual(g.xep_hang_bcvh.map((x) => [x.bcvh, x.hang]), [[M2, 1], [M, 2], [M5, 2]], who);
    assert.deepEqual(g.chua_du_du_lieu, admin.chua_du_du_lieu, who);
    assert.equal(g.mau_so, 294, `${who}: cộng cả 6 BCVH`);
  }
  assert.equal((await kq(`?bcvh=${M2}`, 'gdvhMM2')).body.xep_hang_bcvh, null, 'một BCVH: không xếp hạng');
});

// ---------------- phạm vi của endpoint ----------------
test('không có khung giờ / tồn chờ; không lộ số hiệu bưu gửi', async () => {
  const txt = JSON.stringify((await kq('')).body) + JSON.stringify((await kq(`?bcvh=${M}`)).body);
  for (const k of ['theo_khung_gio_den', 'ton_cho', 'moc_tinh_den']) assert.ok(!txt.includes(k), k);
  assert.ok(!/\d{15,}/.test(txt));
  assert.ok(!txt.includes('ZZ9'), 'không có SHBG');
  assert.deepEqual(Object.keys((await kq(`?bcvh=${M}`)).body), [
    'bcvh', 'pham_vi', 'ngay', 'cung_ngay', 'mau_so', 'theo_trang_thai', 'ptc', 'muc_cap_nhat', 'co_so_lieu_phat',
    'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'nguong', 'xep_hang_bcvh', 'chua_du_du_lieu'
  ]);
});

test('/api/phat/ty-le không đổi: đủ khoá cũ, ton_cho + khung giờ, quyền cũ (TTVH 200, STAFF/TIVI 403)', async () => {
  const t = (await call(`/api/phat/ty-le?bcvh=${M}&ngay=${D}`, 'ttvh')).body;
  assert.deepEqual(Object.keys(t), ['bcvh', 'ngay', 'cung_ngay', 'mau_so', 'theo_trang_thai', 'muc_cap_nhat', 'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'theo_khung_gio_den', 'ton_cho']);
  assert.equal(t.theo_khung_gio_den.length, 6);
  assert.equal(t.ton_cho.theo_nhom.length, 4);
  assert.equal((await call('/api/phat/ty-le', 'staff')).status, 403);
  assert.equal((await call('/api/phat/ty-le', 'tivi')).status, 403);
  assert.equal((await call('/api/phat/ty-le?bcvh=all', 'gdvhNone')).status, 200, '/ty-le vẫn cho GDVH xem mọi BCVH (#72)');
  // phân quyền NHẬP / lịch sử của /api/phat/* không đổi: GDVH chưa được giao BCVH nào vẫn 403
  assert.equal((await call(`/api/phat/batches?bcvh=${M}`, 'gdvhNone')).status, 403);
  assert.equal((await call(`/api/phat/batches?bcvh=${M2}`, 'gdvhM')).status, 403);
  assert.equal((await call(`/api/phat/batches?bcvh=${M}`, 'gdvhM')).status, 200);
});

// ---------------- đo hiệu năng (không chạy mặc định) ----------------
// PHAT_PERF=1 npm test -- hoặc: PHAT_PERF=1 node --test tests/phat-dashboard.test.js
// 6 BCVH × 31 ngày × 4.000 SHBG/ngày (cỡ ngày của BCVH lớn nhất theo khảo sát PHAT-3a), 80% đã có trạng thái. In số đo (ms): KHÔNG kiểm ngưỡng.
test('PHAT_PERF — đo ton_cho và endpoint mới trên dữ liệu giả 6 BCVH × 31 ngày', { skip: process.env.PHAT_PERF !== '1', timeout: 600000 }, async () => {
  const SO_NGAY = 31;
  const MOI_NGAY = 4000;
  const dauNgay = Date.UTC(2026, 8, 1); // 01/09/2026 .. 01/10/2026
  const ngayStr = (k) => new Date(dauNgay + k * 86400000).toISOString().slice(0, 10);
  const TT = ['PTC', 'PTC', 'PKTC', 'CHUYEN_HOAN', null]; // 20% chưa có trạng thái
  const insFile = ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, ?, ?, '093012', 1, ?, ?, ?, 'OK')");
  const insItem = ctx.db.prepare(`INSERT INTO arrival_items (import_file_id, receiver_code, route_name, tracking_no, bd8_no, bag_confirmed_at, arrival_at, arrival_at_basis,
    arrival_date, arrival_evidence_count, bag_date, ward_key) VALUES (?, ?, 'Đường A', ?, ?, ?, ?, 'bag', ?, 1, ?, 'phuong an')`);
  const insTT = ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, '2026-10-01T10:00:00Z')");
  const bidP = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, 0)');
  let n = 0;
  const t0 = Date.now();
  ctx.db.transaction(() => {
    for (const bc of VALID_BCVH_CODES) {
      const bid = bidP.run(bc, ids.admin, '2026-10-01T10:00:00Z').lastInsertRowid;
      for (let k = 0; k < SO_NGAY; k++) {
        const day = ngayStr(k);
        const fid = insFile.run(bc, `PERF_${bc}_${day}.csv`, day, `${bc}${day}`, MOI_NGAY, MOI_NGAY).lastInsertRowid;
        for (let i = 0; i < MOI_NGAY; i++) {
          const s = `ZP${String(100000000 + (++n))}VN`;
          const t = `${day} ${String(6 + (i % 16)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
          insItem.run(fid, bc, s, `B${n}`, t, t, day, day);
          const tt = TT[i % 5];
          if (tt) insTT.run(bc, s, tt, bid);
        }
      }
    }
  })();
  const nap = Date.now() - t0;
  const ngay = ngayStr(SO_NGAY - 1); // 01/10: tồn chờ lùi 30 ngày = toàn bộ 31 ngày dữ liệu giả
  const chay = (f, lan = 5) => {
    const ms = [];
    for (let i = 0; i < lan; i++) { const a = process.hrtime.bigint(); f(); ms.push(Number(process.hrtime.bigint() - a) / 1e6); }
    ms.sort((x, y) => x - y);
    return `min ${ms[0].toFixed(0)} · trung vị ${ms[Math.floor(ms.length / 2)].toFixed(0)} · max ${ms[ms.length - 1].toFixed(0)}`;
  };
  const byUnit = require('../server/lib/arrivalsQuery').latestFileDates(ctx.db);
  const out = [
    `PHAT_PERF dữ liệu giả: ${VALID_BCVH_CODES.length} BCVH × ${SO_NGAY} ngày × ${MOI_NGAY} SHBG/ngày = ${n} dòng; 80% có trạng thái (nạp ${nap} ms)`,
    `  demNgay 1 BCVH 1 ngày (mẫu số + 5 trạng thái + khung giờ): ${chay(() => P.demNgay(ctx.db, M, ngay))} ms`,
    `  tonCho 1 BCVH (lùi 30 ngày):                              ${chay(() => P.tonCho(ctx.db, M, ngay, byUnit))} ms`,
    `  /ty-le gộp 6 BCVH (tyLeApi, gồm ton_cho):                   ${chay(() => P.tyLeApi(ctx.db, { bcvh: 'all', ngay }), 3)} ms`,
    `  endpoint mới ketQuaPhat 6 BCVH (không ton_cho):             ${chay(() => PD.ketQuaPhat(ctx.db, VALID_BCVH_CODES, { bcvh: 'all', ngay }))} ms`
  ];
  console.log(out.join('\n'));
  assert.ok(n === VALID_BCVH_CODES.length * SO_NGAY * MOI_NGAY);
});
