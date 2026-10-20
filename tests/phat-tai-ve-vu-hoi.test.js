// ==========================================
// Test TAIVE-3: bảng kê GET /api/phat/tai-ve thêm cột «Đã vu hồi» (sau «Trạng thái phát») và bộ lọc trang_thai=DA_VU_HOI.
// Server thật trên DB tạm; CSV hàng đến / SHBG / người dùng / đợt nhập GIẢ. Đối chiếu số dòng với GET /api/arrivals/dashboard/vu-hoi và ty-le.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const ExcelJS = require('exceljs');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { replaceAssignedBcvh, VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const PD = require('../server/lib/phatDashboard');
const PVH = require('../server/lib/phatVuHoi');

const PORT = 5981;
const [M, M3, M4] = [VALID_BCVH_CODES[0], VALID_BCVH_CODES[2], VALID_BCVH_CODES[3]];
const TAI_VE = '/api/phat/tai-ve';
const API = '/api/arrivals/dashboard';
const HEADER = ['Số hiệu bưu gửi', 'BCVH', 'Ngày giờ đến', 'Trạng thái phát', 'Đã vu hồi', 'Ghi chú', 'Giờ nhập', 'Đợt nhập', 'Người nhập'];
const TEN = { PTC: 'Phát thành công', PKTC: 'Phát không thành công', CHUYEN_HOAN: 'Chuyển hoàn', LAC_HUONG: 'Lạc hướng', CHUA_CO_TT: 'Chưa có thông tin phát' };
const TT_LOC = ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT', 'DA_VU_HOI'];
const tokens = {};
const ids = {};
let ctx;
let workDir;
let seq = 0;
let shSeq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZV${String(700000000 + (++shSeq))}VN`;
const D = (dd) => `2026-10-${dd}`;
const rows = [];
function r(rc, ymd, hms, shbg) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường A', SHBG: shbg, So_hieu_BD10: '',
    'Thời gian XN túi': `${ymd} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: `T${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
/** n SHBG mới đến BCVH rc ngày ymd, cộng `them` = SHBG đã có đến lại (07:00). */
function taoHang(rc, ymd, n, them = []) {
  const list = [...them];
  them.forEach((s) => rows.push(r(rc, ymd, '07:00:00', s)));
  for (let i = 0; i < n; i++) { const s = sh(); list.push(s); rows.push(r(rc, ymd, `${String(8 + i).padStart(2, '0')}:00:00`, s)); }
  return list;
}
function writeFiles() {
  const groups = new Map();
  for (const row of rows) {
    const k = `${row.BC_nhan_BG}|${row['Thời gian XN túi'].slice(0, 10).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  return [...groups].map(([k, rs]) => {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(qt).join(','), ...rs.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    return file;
  }).sort();
}
/** Ghi MỘT đợt nhập GIẢ. items: [[shbg, mã, vuHoi(0|1)]]; nhapLuc UTC ISO. Trả id đợt. */
function ghiDot(bcvh, items, nhapLuc, trangThai = 'da_nhap') {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap, trang_thai) VALUES (?, ?, ?, ?, ?)').run(bcvh, ids.admin, nhapLuc, items.length, trangThai).lastInsertRowid;
  const cur = ctx.db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?');
  const his = ctx.db.prepare('INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, ghi_chu, batch_id, nhap_luc, da_vu_hoi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const up = ctx.db.prepare(`INSERT INTO phat_status_current (bcvh, shbg, trang_thai, ghi_chu, batch_id, nhap_luc, da_vu_hoi) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bcvh, shbg) DO UPDATE SET trang_thai = excluded.trang_thai, ghi_chu = excluded.ghi_chu, batch_id = excluded.batch_id, nhap_luc = excluded.nhap_luc, da_vu_hoi = excluded.da_vu_hoi`);
  ctx.db.transaction(() => {
    for (const [s, tt, vh] of items) {
      const prev = cur.get(bcvh, s);
      his.run(bcvh, s, tt, prev ? prev.trang_thai : null, null, bid, nhapLuc, vh || 0);
      up.run(bcvh, s, tt, null, bid, nhapLuc, vh || 0);
    }
  })();
  return Number(bid);
}
async function call(p, who = 'admin') {
  const headers = who ? { Authorization: `Bearer ${tokens[who]}` } : {};
  const res = await fetch(`${ctx.baseUrl}${p}`, { method: 'GET', headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: res.status, body: await res.json(), res };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), res };
}
async function tai(query, who = 'admin') {
  const out = await call(`${TAI_VE}?${query}`, who);
  if (out.status !== 200) return out;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buf);
  const all = [];
  wb.worksheets[0].eachRow({ includeEmpty: false }, (row) => all.push(Array.from({ length: 9 }, (_, i) => row.getCell(i + 1).value)));
  return { ...out, header: all[0], dong: all.slice(1) };
}
const theo = (t, s) => t.dong.find((d) => d[0] === s);
const vuHoiApi = async (bcvh, ngay) => (await call(`${API}/vu-hoi?ngay_den=${ngay}&bcvh=${bcvh}`)).body.tong;
const st = {};

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-taive3-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-taive3-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  const mk = async (hrm, role) => {
    ids[hrm] = seedUser(ctx.db, { hrmCode: hrm, fullName: `Tên ${hrm}`, role, password: 'Pass@123' });
    tokens[hrm] = (await loginAs(ctx.baseUrl, hrm, 'Pass@123')).body.token;
  };
  await mk('V3_ADMIN', 'ADMIN'); await mk('V3_TTVH', 'TTVH'); await mk('V3_GDVH', 'GDVH'); await mk('V3_GDVH0', 'GDVH'); await mk('V3_TIVI', 'TIVI');
  tokens.admin = tokens.V3_ADMIN; ids.admin = ids.V3_ADMIN;
  replaceAssignedBcvh(ctx.db, ids.V3_GDVH, [M]);

  // M: X đến ngày 17 và 18 (đến lại), 11 SHBG mới ngày 18 (+ 2 SHBG mới ngày 17); M3: 4; M4: 2.
  st.x = sh();
  taoHang(M, D('17'), 2, [st.x]);
  st.m = taoHang(M, D('18'), 11, [st.x]).slice(1);
  st.m3 = taoHang(M3, D('18'), 4);
  st.m4 = taoHang(M4, D('18'), 2);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  const [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11] = st.m;
  // Giờ VN = UTC + 7: 05:00Z = 12:00, 08:00Z = 15:00
  ghiDot(M, [[st.x, 'PKTC', 1]], '2026-10-17T05:00:00Z'); // #92: nhập ngày 17 chỉ tính cho lần đến 17
  ghiDot(M, [[a1, 'PKTC', 1], [a2, 'PKTC', 1], [a3, 'PKTC', 0], [a4, 'PTC', 0], [a5, 'CHUYEN_HOAN', 0], [a6, 'LAC_HUONG', 0],
    [a7, 'PKTC', 1], [a8, 'PKTC', 1], [a9, 'PKTC', 0]], '2026-10-18T05:00:00Z');
  ghiDot(M, [[a7, 'PTC', 0], [a8, 'PKTC', 0]], '2026-10-18T08:00:00Z'); // bản cuối: a7 -> PTC, a8 -> PKTC không cờ
  st.dotHoanTac = ghiDot(M, [[a9, 'PKTC', 1]], '2026-10-18T09:00:00Z', 'da_hoan_tac'); // bị bỏ qua: a9 vẫn PKTC không cờ
  // a10, a11: chưa có TT
  ghiDot(M3, [[st.m3[0], 'PKTC', 1], [st.m3[1], 'PKTC', 0], [st.m3[2], 'PTC', 0]], '2026-10-18T05:00:00Z');
  ghiDot(M4, [[st.m4[0], 'PKTC', 1]], '2026-10-18T05:00:00Z');
  st.a = { a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11 };
  PD.xoaCachePhatThang();
  PVH.xoaCache();
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('1. 9 cột đúng thứ tự; «Có» chỉ ở PKTC có cờ; mọi dòng còn lại (PKTC không cờ, PTC, Chuyển hoàn, Lạc hướng, Chưa có TT) để trống', async () => {
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  assert.equal(t.status, 200);
  assert.deepEqual(t.header, HEADER);
  const { a1, a2, a3, a4, a5, a6, a10 } = st.a;
  for (const s of [a1, a2]) assert.deepEqual([theo(t, s)[3], theo(t, s)[4]], [TEN.PKTC, 'Có'], s); // dòng vu hồi vẫn «Phát không thành công»
  assert.deepEqual([theo(t, a3)[3], theo(t, a3)[4]], [TEN.PKTC, null]);
  assert.deepEqual([theo(t, a4)[3], theo(t, a4)[4]], [TEN.PTC, null]);
  assert.deepEqual([theo(t, a5)[3], theo(t, a5)[4]], [TEN.CHUYEN_HOAN, null]);
  assert.deepEqual([theo(t, a6)[3], theo(t, a6)[4]], [TEN.LAC_HUONG, null]);
  assert.deepEqual([theo(t, a10)[3], theo(t, a10)[4]], [TEN.CHUA_CO_TT, null]);
  assert.equal(theo(t, a1)[8], 'Tên V3_ADMIN (V3_ADMIN)', 'các cột sau «Đã vu hồi» dịch đúng một ô');
  assert.equal(theo(t, a1)[6], '18/10/2026 12:00:00');
  assert.ok(t.dong.every((d) => d[4] === null || (d[4] === 'Có' && d[3] === TEN.PKTC)), '«Có» chỉ đi với PKTC');
  assert.equal(t.dong.filter((d) => d[4] === 'Có').length, 2);
});

test('2. trang_thai=DA_VU_HOI: chỉ PKTC có cờ; số dòng = da_vu_hoi của vu-hoi (từng BCVH và all)', async () => {
  for (const b of [M, M3, M4, 'all']) {
    const t = await tai(`ngay_den=${D('18')}&bcvh=${b}&trang_thai=DA_VU_HOI`);
    assert.equal(t.status, 200, b);
    assert.equal(t.dong.length, (await vuHoiApi(b, D('18'))).da_vu_hoi, `${b}: dòng = da_vu_hoi`);
    assert.ok(t.dong.length > 0);
    assert.ok(t.dong.every((d) => d[3] === TEN.PKTC && d[4] === 'Có'), b);
  }
  const m = await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=DA_VU_HOI`);
  assert.deepEqual(m.dong.map((d) => d[0]).sort(), [st.a.a1, st.a.a2].sort());
});

test('3. trang_thai=PKTC gồm cả dòng có cờ; số dòng = pktc của vu-hoi', async () => {
  for (const b of [M, M3, M4, 'all']) {
    const t = await tai(`ngay_den=${D('18')}&bcvh=${b}&trang_thai=PKTC`);
    assert.equal(t.dong.length, (await vuHoiApi(b, D('18'))).pktc, `${b}: dòng = pktc`);
    assert.ok(t.dong.every((d) => d[3] === TEN.PKTC));
  }
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=PKTC`);
  assert.ok(t.dong.some((d) => d[4] === 'Có') && t.dong.some((d) => d[4] === null), 'PKTC có cả dòng có cờ lẫn không cờ');
  const { a1, a2, a3, a8, a9 } = st.a;
  assert.deepEqual(t.dong.map((d) => d[0]).sort(), [a1, a2, a3, a8, a9].sort());
});

test('4. không lọc: số dòng = mẫu số ty-le (thêm cột không thêm / bớt dòng); 6 giá trị lọc không trùng số dòng không lọc', async () => {
  for (const b of [M, M3, M4]) {
    const t = await tai(`ngay_den=${D('18')}&bcvh=${b}`);
    assert.equal(t.dong.length, (await call(`/api/phat/ty-le?bcvh=${b}&ngay=${D('18')}`)).body.mau_so, b);
    let tong = 0;
    for (const m of Object.keys(TEN)) tong += (await tai(`ngay_den=${D('18')}&bcvh=${b}&trang_thai=${m}`)).dong.length;
    assert.equal(tong, t.dong.length, `${b}: 5 trạng thái cộng lại = không lọc`);
  }
  const all = await tai(`ngay_den=${D('18')}&bcvh=all`);
  assert.equal(all.dong.length, (await call(`${API}/ket-qua-phat?bcvh=all&ngay=${D('18')}`)).body.mau_so);
  assert.equal(all.dong.length, 12 + 4 + 2, 'M (X + 11) + M3 (4) + M4 (2)');
});

test('5. #92: SHBG hai ngày đến, vu hồi nhập ngày 17 -> cờ ở bảng kê ngày đến 17, KHÔNG ở ngày đến 18', async () => {
  const t17 = await tai(`ngay_den=${D('17')}&bcvh=${M}`);
  const t18 = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  assert.deepEqual([theo(t17, st.x)[3], theo(t17, st.x)[4]], [TEN.PKTC, 'Có']);
  assert.deepEqual([theo(t18, st.x)[3], theo(t18, st.x)[4]], [TEN.CHUA_CO_TT, null]);
  const l17 = await tai(`ngay_den=${D('17')}&bcvh=${M}&trang_thai=DA_VU_HOI`);
  assert.equal(l17.dong.length, 1);
  assert.equal(l17.dong.length, (await vuHoiApi(M, D('17'))).da_vu_hoi);
  assert.ok(!(await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=DA_VU_HOI`)).dong.some((d) => d[0] === st.x));
});

test('6. bản cuối quyết định: nhập tiếp PTC / PKTC không cờ -> ô trống; đợt hoàn tác bị bỏ qua', async () => {
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  const { a7, a8, a9 } = st.a;
  assert.deepEqual([theo(t, a7)[3], theo(t, a7)[4]], [TEN.PTC, null], 'vu hồi rồi nhập PTC');
  assert.deepEqual([theo(t, a8)[3], theo(t, a8)[4]], [TEN.PKTC, null], 'vu hồi rồi nhập PKTC không cờ');
  assert.deepEqual([theo(t, a9)[3], theo(t, a9)[4]], [TEN.PKTC, null], 'đợt đánh dấu vu hồi đã hoàn tác bị bỏ qua');
  assert.ok(!t.dong.some((d) => d[7] === `#${st.dotHoanTac}`));
  assert.ok(!(await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=DA_VU_HOI`)).dong.some((d) => [a7, a8, a9].includes(d[0])));
});

test('7. quyền không đổi; trang_thai lạ -> 400 (thông báo nêu cả DA_VU_HOI)', async () => {
  for (const q of ['', '&trang_thai=DA_VU_HOI']) {
    for (const who of ['V3_ADMIN', 'V3_TTVH']) {
      assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M3}${q}`, who)).status, 200);
      assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=all${q}`, who)).status, 200);
    }
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}${q}`, 'V3_GDVH')).status, 200);
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M3}${q}`, 'V3_GDVH')).status, 403);
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=all${q}`, 'V3_GDVH')).status, 403);
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}${q}`, 'V3_GDVH0')).status, 403);
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}${q}`, 'V3_TIVI')).status, 403);
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}${q}`, null)).status, 401);
  }
  for (const v of ['XYZ', 'da_vu_hoi', 'VU_HOI', 'PTC&trang_thai=DA_VU_HOI']) {
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}&trang_thai=${v}`)).status, 400, v);
  }
  const o = await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}&trang_thai=XYZ`);
  assert.equal(o.body.error, 'Tham số "trang_thai" phải là một trong: PTC, PKTC, CHUYEN_HOAN, CHUA_CO_TT, LAC_HUONG, DA_VU_HOI');
});

test('8. bất biến: gọi bảng kê (mọi trang_thai) không đổi ket-qua-phat, ket-qua-phat-thang, ty-le, vu-hoi, vu-hoi-thang', async () => {
  const chup = async () => {
    PD.xoaCachePhatThang(); PVH.xoaCache();
    const lay = async (p) => { const o = await call(p); assert.equal(o.status, 200, p); return o.body; };
    return {
      tyLe: [await lay(`/api/phat/ty-le?bcvh=${M}&ngay=${D('18')}`), await lay(`/api/phat/ty-le?bcvh=${M}&ngay=${D('17')}`)],
      kqp: [await lay(`${API}/ket-qua-phat?bcvh=all&ngay=${D('18')}`), await lay(`${API}/ket-qua-phat?bcvh=${M}&ngay=${D('17')}`)],
      kqpt: [await lay(`${API}/ket-qua-phat-thang?bcvh=all&ngay=${D('18')}`)],
      vh: [await lay(`${API}/vu-hoi?ngay_den=${D('18')}&bcvh=all`), await lay(`${API}/vu-hoi?ngay_den=${D('17')}&bcvh=${M}`)],
      vht: [await lay(`${API}/vu-hoi-thang?thang=2026-10&bcvh=all`)]
    };
  };
  const truoc = await chup();
  for (const b of [M, 'all']) {
    assert.equal((await tai(`ngay_den=${D('18')}&bcvh=${b}`)).status, 200);
    for (const m of TT_LOC) assert.equal((await tai(`ngay_den=${D('18')}&bcvh=${b}&trang_thai=${m}`)).status, 200, m);
  }
  const sau = await chup();
  for (const k of Object.keys(truoc)) assert.deepEqual(sau[k], truoc[k], k);
});
