// ==========================================
// Test TAIVE-1: GET /api/phat/tai-ve — «Bảng kê kết quả phát theo ngày đến» (Excel). Server thật trên DB tạm; CSV / SHBG / người dùng GIẢ.
// (a) số dòng = mẫu số ty-le (một BCVH) và ketQuaPhat (all), (b) đủ 5 trạng thái + «Chưa có TT» để trống cột phía nhập, (c) lọc trang_thai + mã sai 400,
// (d) SHBG hai ngày đến, (e) đợt hoàn tác bị bỏ qua, (f) người nhập đã xóa, (g) quyền, (h) BCVH chưa có hàng đến, (i) giới hạn dòng, (j) tệp đọc lại được.
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

const PORT = 5943;
const [M, M2, M3, M4] = VALID_BCVH_CODES;
const TAI_VE = '/api/phat/tai-ve';
const TY_LE = '/api/phat/ty-le';
const KQP = '/api/arrivals/dashboard/ket-qua-phat';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER = ['Số hiệu bưu gửi', 'BCVH', 'Ngày giờ đến', 'Trạng thái phát', 'Đã vu hồi', 'Ghi chú', 'Giờ nhập', 'Đợt nhập', 'Người nhập'];
const TEN_TT = { PTC: 'Phát thành công', PKTC: 'Phát không thành công', CHUYEN_HOAN: 'Chuyển hoàn', LAC_HUONG: 'Lạc hướng', CHUA_CO_TT: 'Chưa có thông tin phát' };
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
/** n SHBG đến BCVH rc ngày ymd; `them` = SHBG đã có (đến lại, 07:00:00) cũng đến ngày này. Trả danh sách SHBG của ngày. */
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
    fs.writeFileSync(file, '\uFEFF' + [EXPECTED_HEADER.map(qt).join(','), ...rs.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}
/** Ghi MỘT đợt nhập GIẢ (phat_batches + phat_status_history + phat_status_current). items: [[shbg, mã, ghi chú?]]; nhapLuc UTC ISO. Trả id đợt. */
function ghiDot(bcvh, items, nhapLuc, userId = ids.admin, trangThai = 'da_nhap') {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap, trang_thai) VALUES (?, ?, ?, ?, ?)').run(bcvh, userId, nhapLuc, items.length, trangThai).lastInsertRowid;
  const cur = ctx.db.prepare('SELECT trang_thai FROM phat_status_current WHERE bcvh = ? AND shbg = ?');
  const his = ctx.db.prepare('INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, ghi_chu, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const up = ctx.db.prepare(`INSERT INTO phat_status_current (bcvh, shbg, trang_thai, ghi_chu, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(bcvh, shbg) DO UPDATE SET trang_thai = excluded.trang_thai, ghi_chu = excluded.ghi_chu, batch_id = excluded.batch_id, nhap_luc = excluded.nhap_luc`);
  ctx.db.transaction(() => {
    for (const [s, tt, gc] of items) {
      const prev = cur.get(bcvh, s);
      his.run(bcvh, s, tt, prev ? prev.trang_thai : null, gc || null, bid, nhapLuc);
      up.run(bcvh, s, tt, gc || null, bid, nhapLuc);
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
/** Tải bảng kê và đọc lại bằng ExcelJS: { status, res, header, cells (ô), dong (giá trị) }. */
async function tai(query, who = 'admin') {
  const out = await call(`${TAI_VE}?${query}`, who);
  if (out.status !== 200) return out;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out.buf);
  const ws = wb.worksheets[0];
  const all = [];
  ws.eachRow({ includeEmpty: false }, (row) => all.push(Array.from({ length: 9 }, (_, i) => row.getCell(i + 1))));
  return { ...out, header: all[0].map((c) => c.value), cells: all.slice(1), dong: all.slice(1).map((cs) => cs.map((c) => c.value)) };
}
const theoShbg = (o, s) => o.dong.find((d) => d[0] === s);
const D = (dd) => `2026-10-${dd}`;
const st = {};

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-taive-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-taive-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  const mk = async (hrm, role) => {
    ids[hrm] = seedUser(ctx.db, { hrmCode: hrm, fullName: `Tên ${hrm}`, role, password: 'Pass@123' });
    tokens[hrm] = (await loginAs(ctx.baseUrl, hrm, 'Pass@123')).body.token;
  };
  await mk('TV_ADMIN', 'ADMIN'); await mk('TV_TTVH', 'TTVH'); await mk('TV_GDVH', 'GDVH'); await mk('TV_GDVH0', 'GDVH'); await mk('TV_TIVI', 'TIVI');
  tokens.admin = tokens.TV_ADMIN;
  ids.admin = ids.TV_ADMIN;
  replaceAssignedBcvh(ctx.db, ids.TV_GDVH, [M]);
  ids.nguoiXoa = seedUser(ctx.db, { hrmCode: 'TV_XOA', fullName: 'Người sẽ xóa', role: 'GDVH', password: 'Pass@123' });

  // M: x đến 17 và 18 (đến lại); 8 SHBG ngày 18, 4 SHBG ngày 17
  st.x = sh();
  st.m17 = taoHang(M, D('17'), 4, [st.x]);
  st.m18 = taoHang(M, D('18'), 8, [st.x]);
  // M3: 6 SHBG ngày 18 — có đợt hoàn tác; M4: 3 SHBG ngày 18 (để all gồm 3 BCVH)
  st.m3 = taoHang(M3, D('18'), 6);
  st.m4 = taoHang(M4, D('18'), 3);
  // Ngày 19 (riêng cho ca k, không đổi số liệu a–j): X đến M 08:00 và M3 13:00 cùng ngày (DASH-7f: M3 có mốc muộn hơn nên giữ X); 3 SHBG thường ở M, 2 ở M3
  st.x2 = sh();
  rows.push(r(M, D('19'), '08:00:00', st.x2));
  rows.push(r(M3, D('19'), '13:00:00', st.x2));
  st.m19 = taoHang(M, D('19'), 3);
  st.m3_19 = taoHang(M3, D('19'), 2);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  const [, l1, l2, l3, l4] = st.m18;
  ghiDot(M, [[st.x, 'PTC', 'Nhập ngày 17']], '2026-10-17T05:00:00Z'); // 12:00 VN ngày 17 -> chỉ tính cho lần đến 17
  st.dotAdmin = ghiDot(M, [[l1, 'PTC', 'Đã giao'], [l2, 'PKTC', 'Vắng nhà'], [l3, 'CHUYEN_HOAN']], '2026-10-18T05:00:00Z');
  st.dotXoa = ghiDot(M, [[l4, 'LAC_HUONG', 'Sai địa chỉ']], '2026-10-18T08:00:00Z', ids.nguoiXoa);
  ctx.db.prepare('DELETE FROM users WHERE id = ?').run(ids.nguoiXoa);
  const [s0, s1, s2, s3] = st.m3;
  ghiDot(M3, [[s0, 'PTC'], [s1, 'PTC'], [s2, 'PKTC', 'Đợt giữ lại']], '2026-10-18T05:00:00Z');
  st.dotHoanTac = ghiDot(M3, [[s2, 'PTC', 'Đợt đã hoàn tác'], [s3, 'PTC']], '2026-10-18T08:00:00Z', ids.admin, 'da_hoan_tac');
  PD.xoaCachePhatThang();
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('(a) số dòng = mẫu số ty-le (một BCVH) và = mẫu số ketQuaPhat (all), cùng ngày', async () => {
  for (const [bcvh, n] of [[M, 8], [M3, 6], [M4, 3]]) {
    const t = await tai(`ngay_den=${D('18')}&bcvh=${bcvh}`);
    const tl = (await call(`${TY_LE}?bcvh=${bcvh}&ngay=${D('18')}`)).body;
    assert.equal(t.dong.length, n);
    assert.equal(t.dong.length, tl.mau_so, `${bcvh}: dòng = mẫu số ty-le`);
    for (const m of Object.keys(TEN_TT)) assert.equal(t.dong.filter((d) => d[3] === TEN_TT[m]).length, tl.theo_trang_thai[m].so, `${bcvh} ${m}`);
  }
  const all = await tai(`ngay_den=${D('18')}&bcvh=all`);
  const kq = (await call(`${KQP}?bcvh=all&ngay=${D('18')}`)).body;
  assert.equal(all.dong.length, 17);
  assert.equal(all.dong.length, kq.mau_so, 'all: dòng = mẫu số ketQuaPhat');
  for (const m of Object.keys(TEN_TT)) assert.equal(all.dong.filter((d) => d[3] === TEN_TT[m]).length, kq.theo_trang_thai[m].so, `all ${m}`);
  assert.equal((await tai(`ngay_den=${D('17')}&bcvh=${M}`)).dong.length, 4);
});

test('(b)(j) đủ 5 trạng thái; «Chưa có TT» để trống cột phía nhập; tiêu đề đúng thứ tự; mọi ô là văn bản; giờ Việt Nam; tên tệp, header', async () => {
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  assert.equal(t.status, 200);
  assert.equal(t.res.headers.get('content-type'), XLSX);
  assert.equal(t.res.headers.get('content-disposition'), `attachment; filename="BangKe_KetQuaPhat_${M}_20261018.xlsx"`);
  assert.deepEqual(t.header, HEADER);
  const [, l1, l2, l3, l4, l5] = st.m18;
  assert.deepEqual(new Set(t.dong.map((d) => d[3])), new Set(Object.values(TEN_TT)));
  for (const cs of t.cells) for (const c of cs) assert.ok(c.value === null || typeof c.value === 'string', `ô phải là văn bản: ${c.value}`);
  const d1 = theoShbg(t, l1);
  assert.match(d1[1], new RegExp(`^${M} · .+`));
  assert.equal(d1[3], 'Phát thành công');
  assert.equal(d1[4], null); // TAIVE-3: không có cờ vu hồi
  assert.equal(d1[5], 'Đã giao');
  assert.equal(d1[6], '18/10/2026 12:00:00'); // 05:00Z = 12:00 giờ VN
  assert.equal(d1[7], `#${st.dotAdmin}`);
  assert.equal(d1[8], 'Tên TV_ADMIN (TV_ADMIN)');
  assert.match(d1[2], /^18\/10\/2026 \d\d:\d\d:\d\d$/);
  assert.equal(theoShbg(t, l2)[3], 'Phát không thành công');
  assert.equal(theoShbg(t, l3)[3], 'Chuyển hoàn');
  assert.equal(theoShbg(t, l3)[5], null); // không có ghi chú
  assert.equal(theoShbg(t, l4)[3], 'Lạc hướng');
  const c = theoShbg(t, l5);
  assert.equal(c[3], 'Chưa có thông tin phát');
  assert.deepEqual([c[4], c[5], c[6], c[7], c[8]], [null, null, null, null, null]);
  assert.ok(t.cells.every((cs) => typeof cs[0].value === 'string' && /^ZT\d+VN$/.test(cs[0].value)), 'SHBG giữ nguyên là văn bản');
});

test('(c) lọc trang_thai từng mã; mã sai / lặp / tham số lạ / ngày sai / thiếu bcvh -> 400', async () => {
  const dem = { PTC: 1, PKTC: 1, CHUYEN_HOAN: 1, LAC_HUONG: 1, CHUA_CO_TT: 4 };
  for (const [ma, n] of Object.entries(dem)) {
    const t = await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=${ma}`);
    assert.equal(t.dong.length, n, ma);
    assert.ok(t.dong.every((d) => d[3] === TEN_TT[ma]));
  }
  for (const q of [
    `ngay_den=${D('18')}&bcvh=${M}&trang_thai=XYZ`, `ngay_den=${D('18')}&bcvh=${M}&trang_thai=ptc`, `ngay_den=${D('18')}&bcvh=${M}&khac=1`,
    `ngay_den=${D('18')}&bcvh=${M}&trang_thai=PTC&trang_thai=PKTC`, `bcvh=${M}`, `ngay_den=2026-02-31&bcvh=${M}`, `ngay_den=18-10-2026&bcvh=${M}`,
    `ngay_den=${D('18')}`, `ngay_den=${D('18')}&bcvh=999999`, `ngay_den=${D('18')}&bcvh=`
  ]) {
    assert.equal((await call(`${TAI_VE}?${q}`)).status, 400, q);
  }
});

test('(d) SHBG hai ngày đến: dòng chỉ ở ngày đang tải; trạng thái theo #92 (nhập ngày 17 chỉ tính cho lần đến 17)', async () => {
  const t17 = await tai(`ngay_den=${D('17')}&bcvh=${M}`);
  const t18 = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  assert.equal(t17.dong.filter((d) => d[0] === st.x).length, 1);
  assert.equal(t18.dong.filter((d) => d[0] === st.x).length, 1);
  const x17 = theoShbg(t17, st.x);
  const x18 = theoShbg(t18, st.x);
  assert.equal(x17[3], 'Phát thành công');
  assert.equal(x17[5], 'Nhập ngày 17');
  assert.equal(x17[2], '17/10/2026 07:00:00');
  assert.equal(x18[3], 'Chưa có thông tin phát');
  assert.equal(x18[2], '18/10/2026 07:00:00');
  assert.equal(x18[6], null);
  assert.ok(!t17.dong.some((d) => st.m18.slice(1).includes(d[0])), 'ngày 17 không có SHBG chỉ đến ngày 18');
});

test('(e) đợt đã hoàn tác bị bỏ qua', async () => {
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M3}`);
  const [s0, , s2, s3] = st.m3;
  assert.equal(theoShbg(t, s2)[3], 'Phát không thành công');
  assert.equal(theoShbg(t, s2)[5], 'Đợt giữ lại');
  assert.equal(theoShbg(t, s3)[3], 'Chưa có thông tin phát');
  assert.equal(theoShbg(t, s0)[3], 'Phát thành công');
  assert.ok(!t.dong.some((d) => d[7] === `#${st.dotHoanTac}`));
});

test('(f) người nhập đã xóa -> «(đã xóa)» kèm mã người dùng', async () => {
  const t = await tai(`ngay_den=${D('18')}&bcvh=${M}`);
  const d = theoShbg(t, st.m18[4]);
  assert.equal(d[8], `(đã xóa) ${ids.nguoiXoa}`);
  assert.equal(d[7], `#${st.dotXoa}`);
  assert.equal(d[6], '18/10/2026 15:00:00');
});

test('(g) quyền: ADMIN, TTVH một BCVH và all; GDVH BCVH được giao 200, BCVH khác và all 403; GDVH chưa giao, TIVI, vai trò lạ 403; không token 401', async () => {
  for (const who of ['TV_ADMIN', 'TV_TTVH']) {
    assert.equal((await tai(`ngay_den=${D('18')}&bcvh=${M3}`, who)).status, 200);
    assert.equal((await tai(`ngay_den=${D('18')}&bcvh=all`, who)).status, 200);
  }
  assert.equal((await tai(`ngay_den=${D('18')}&bcvh=${M}`, 'TV_GDVH')).status, 200);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M3}`, 'TV_GDVH')).status, 403);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=all`, 'TV_GDVH')).status, 403);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}`, 'TV_GDVH0')).status, 403);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}`, 'TV_TIVI')).status, 403);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}`, null)).status, 401);
  // vai trò không hợp lệ (đã bỏ): không đăng nhập được, hoặc đăng nhập được thì 403
  seedUser(ctx.db, { hrmCode: 'TV_LAT', fullName: 'Vai trò lạ', role: 'STAFF', password: 'Pass@123' });
  const dn = await loginAs(ctx.baseUrl, 'TV_LAT', 'Pass@123');
  if (dn.status === 200) {
    tokens.lat = dn.body.token;
    assert.equal((await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}`, 'lat')).status, 403);
  } else {
    assert.ok([401, 403].includes(dn.status), `đăng nhập vai trò lạ: ${dn.status}`);
  }
});

test('(h) BCVH chưa có hàng đến ngày đó -> 400 đúng câu thông báo (cả khi có lọc trạng thái)', async () => {
  const o = await call(`${TAI_VE}?ngay_den=${D('25')}&bcvh=${M2}`);
  assert.equal(o.status, 400);
  assert.match(o.body.error, /^.+ chưa có file hàng đến cho ngày 25\/10\/2026\.$/);
  assert.ok(!o.body.error.startsWith('undefined'));
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('25')}&bcvh=${M2}&trang_thai=PTC`)).body.error, o.body.error);
  assert.equal((await call(`${TAI_VE}?ngay_den=${D('25')}&bcvh=all`)).status, 400);
});

test('(i) vượt giới hạn dòng -> 400 (ngưỡng hạ bằng TAIVE_MAX_DONG, không dựng 50.000 dòng); lọc ra ít dòng hơn thì vẫn tải', async () => {
  const TV = require('../server/lib/phatTaiVe');
  assert.equal(TV.GIOI_HAN_DONG, 50000);
  assert.equal(TV.maxDong(), 50000);
  const cu = process.env.TAIVE_MAX_DONG;
  process.env.TAIVE_MAX_DONG = '5';
  try {
    assert.equal(TV.maxDong(), 5);
    const o = await call(`${TAI_VE}?ngay_den=${D('18')}&bcvh=${M}`);
    assert.equal(o.status, 400);
    assert.match(o.body.error, /vượt giới hạn 5 dòng/);
    assert.equal((await tai(`ngay_den=${D('18')}&bcvh=${M}&trang_thai=PTC`)).status, 200);
    process.env.TAIVE_MAX_DONG = '99999999'; // chỉ được HẠ xuống
    assert.equal(TV.maxDong(), 50000);
  } finally {
    if (cu === undefined) delete process.env.TAIVE_MAX_DONG; else process.env.TAIVE_MAX_DONG = cu;
  }
});

test('(k) SHBG đến hai BCVH trong cùng ngày (19/10): all chỉ 1 dòng, BCVH giữ theo DASH-7f (mốc đến muộn nhất); số dòng khớp ty-le và ketQuaPhat', async () => {
  const N = D('19');
  const tM = await tai(`ngay_den=${N}&bcvh=${M}`);
  const tM3 = await tai(`ngay_den=${N}&bcvh=${M3}`);
  const all = await tai(`ngay_den=${N}&bcvh=all`);
  // DASH-7f (tests/phat-bcvh-muon-nhat.test.js): BCVH có mốc đến SỚM NHẤT-tại-BCVH-đó MUỘN NHẤT giữ SHBG; hòa mốc -> mã nhỏ hơn. Ở đây M 08:00 < M3 13:00 -> M3 giữ.
  assert.equal(all.dong.filter((d) => d[0] === st.x2).length, 1, 'all: X đúng 1 dòng');
  assert.equal(tM.dong.filter((d) => d[0] === st.x2).length, 0, 'M (mốc 08:00) không giữ X');
  const x = theoShbg(tM3, st.x2);
  assert.ok(x, 'M3 (mốc 13:00) giữ X');
  assert.equal(x[2], '19/10/2026 13:00:00');
  assert.match(theoShbg(all, st.x2)[1], new RegExp(`^${M3} · `));
  // số dòng khớp ty-le từng BCVH và ketQuaPhat all
  assert.equal(tM.dong.length, 3);
  assert.equal(tM3.dong.length, 3);
  assert.equal(tM.dong.length, (await call(`${TY_LE}?bcvh=${M}&ngay=${N}`)).body.mau_so);
  assert.equal(tM3.dong.length, (await call(`${TY_LE}?bcvh=${M3}&ngay=${N}`)).body.mau_so);
  assert.equal(all.dong.length, (await call(`${KQP}?bcvh=all&ngay=${N}`)).body.mau_so);
  assert.equal(all.dong.length, tM.dong.length + tM3.dong.length, 'tổng hai BCVH = all');
  assert.equal(new Set(all.dong.map((d) => d[0])).size, all.dong.length, 'all: không SHBG nào lặp');
});
