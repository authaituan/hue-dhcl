// ==========================================
// Test PHAT-6: GET /api/phat/ty-le theo quy tắc NGÀY ĐẾN (#92) — khớp ket-qua-phat («Điều hành hôm nay») cho cùng BCVH, cùng ngày.
// Việc 0: SHBG đến hai ngày (D1, D2) tại cùng BCVH + một đợt nhập có ngày nhập N, D1 <= N < D2 -> ty-le phải ra đúng như ketQuaPhat (trước PHAT-6: ty-le đếm 1 PTC, ketQuaPhat 0).
// Việc 2: (a) hôm nay chưa ai nhập, (b) nhập một phần trong ngày, (c) SHBG hai ngày đến, (d) đợt hoàn tác bị bỏ qua, (e) ngày không có hàng đến — tử / mẫu của ty-le = ket-qua-phat.
// Việc 4: «Sau» của màn commit (demNgay cũ, không đổi) so với ty-le (#92) sau một đợt nhập THẬT. Server thật trên DB tạm; CSV / SHBG GIẢ.
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
const { VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const PD = require('../server/lib/phatDashboard');

const PORT = 5942;
const [M, M2, M3, M4, M5, M6] = VALID_BCVH_CODES;
const TY_LE = '/api/phat/ty-le';
const KQP = '/api/arrivals/dashboard/ket-qua-phat';
const TT5 = ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT'];
const tokens = {};
const ids = {};
let ctx;
let workDir;
let seq = 0;
let shSeq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZT${String(700000000 + (++shSeq))}VN`;
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
/** n SHBG đến BCVH rc ngày ymd; `them` = SHBG đã có (đến lại) cũng đến ngày này. Trả danh sách SHBG của ngày. */
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
/** Ghi MỘT đợt nhập GIẢ: phat_batches + phat_status_history + phat_status_current (như nhập thật). items: [[shbg, mã trạng thái]]; nhapLuc: UTC ISO. Trả id đợt. */
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
async function call(p, who = 'admin') {
  const res = await fetch(`${ctx.baseUrl}${p}`, { method: 'GET', headers: { Authorization: `Bearer ${tokens[who]}` } });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
const D = (dd) => `2026-10-${dd}`;
/** Số 5 trạng thái của một phản hồi dạng dungTyLe (ty-le hoặc ket-qua-phat). */
const so5 = (b) => Object.fromEntries(TT5.map((m) => [m, b.theo_trang_thai[m].so]));

const HOM_NAY_VN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày hiện tại theo giờ VN (nhapDot ghi nhap_luc = giờ máy chủ)
const lui = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const st = { c: {} };

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-phat-tyle-nd-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-phat-tyle-nd-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ids.admin = seedUser(ctx.db, { hrmCode: 'P6_ADMIN', fullName: 'P6_ADMIN', role: 'ADMIN', password: 'Admin@123' });
  tokens.admin = (await loginAs(ctx.baseUrl, 'P6_ADMIN', 'Admin@123')).body.token;

  // M — Việc 0 / (c): X đến 17 và 18; nhập PTC lúc 12:00 VN ngày 17 (D1 <= N < D2)
  st.x = sh();
  taoHang(M, D('17'), 4, [st.x]);
  taoHang(M, D('18'), 5, [st.x]);
  // M2 — (a): 6 SHBG đến 18; chỉ có nhập ngày 17 (trước khi đến)
  st.a = taoHang(M2, D('18'), 6);
  // M3 — (b): 10 SHBG đến 18, nhập một phần trong ngày
  st.b = taoHang(M3, D('18'), 10);
  // M4 — (c) nhiều ngày: X, Y đến 17 và 18; X còn đến 20; Z chỉ đến 18 (nhập sau khi đến, ngày 19)
  [st.c.x, st.c.y, st.c.z] = [sh(), sh(), sh()];
  taoHang(M4, D('17'), 5, [st.c.x, st.c.y]);
  taoHang(M4, D('18'), 6, [st.c.x, st.c.y, st.c.z]);
  taoHang(M4, D('20'), 4, [st.c.x]);
  // M5 — (d): 6 SHBG đến 18; đợt thứ hai bị hoàn tác. Cũng dùng cho (e): ngày 25 không có hàng đến.
  st.d = taoHang(M5, D('18'), 6);
  // M6 — Việc 4 (ngày theo giờ VN hiện tại vì nhapDot ghi giờ máy chủ): a1 a2 đến hôm nay; b1 đến hôm qua + hôm nay; c1 đến 2 ngày trước; c2 đến 2 ngày trước + hôm nay
  const dA = HOM_NAY_VN;
  const dB = lui(dA, 1);
  const dC = lui(dA, 2);
  st.v4 = { dA, dB, dC, a1: sh(), a2: sh(), b1: sh(), c1: sh(), c2: sh() };
  taoHang(M6, dC, 4, [st.v4.c1, st.v4.c2]);
  taoHang(M6, dB, 3, [st.v4.b1]);
  taoHang(M6, dA, 8, [st.v4.a1, st.v4.a2, st.v4.b1, st.v4.c2]);
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

/** ty-le và ket-qua-phat cho cùng BCVH, cùng ngày (ngay = null: không truyền, «hôm nay»); khẳng định khớp mẫu số, 5 trạng thái (số + tỷ lệ), mức cập nhật. */
async function khop(bcvh, ngay) {
  const qs = `?bcvh=${bcvh}${ngay ? `&ngay=${ngay}` : ''}`;
  const tl = (await call(`${TY_LE}${qs}`)).body;
  const kq = (await call(`${KQP}${qs}`)).body;
  assert.equal(tl.ngay, kq.ngay, 'cùng ngày');
  assert.equal(tl.mau_so, kq.mau_so, 'mẫu số');
  assert.deepEqual(tl.theo_trang_thai, kq.theo_trang_thai, 'tử số + tỷ lệ 5 trạng thái');
  assert.equal(tl.muc_cap_nhat, kq.muc_cap_nhat, 'mức cập nhật');
  assert.equal(tl.so_shbg_chuyen_tiep_loai_bo, kq.so_shbg_chuyen_tiep_loai_bo);
  // bảng khung giờ: cộng các khung = tổng
  const tong = Object.fromEntries(TT5.map((m) => [m, 0]));
  let den = 0;
  for (const k of tl.theo_khung_gio_den) { den += k.so_den; for (const m of TT5) tong[m] += k.theo_trang_thai[m].so; }
  assert.equal(den, tl.mau_so, 'khung giờ: tổng số đến = mẫu số');
  assert.deepEqual(tong, so5(tl), 'khung giờ: cộng các khung = tổng theo trạng thái');
  return { tl, kq };
}

test('Việc 0 — SHBG hai ngày đến (17 và 18), nhập PTC ngày 17: ngày 18 ty-le KHÔNG đếm (như ketQuaPhat); ngày 17 đếm', async () => {
  ghiDot(M, [[st.x, 'PTC']], '2026-10-17T05:00:00Z'); // 12:00 giờ VN ngày 17: D1 <= N < D2
  PD.xoaCachePhatThang();
  const { tl: t18 } = await khop(M, D('18'));
  assert.deepEqual(so5(t18), { PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 5 });
  const { tl: t17 } = await khop(M, D('17'));
  assert.deepEqual(so5(t17), { PTC: 1, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 3 });
});

test('(a) hôm nay chưa ai nhập (chỉ có nhập TRƯỚC khi đến): ty-le = ketQuaPhat, mọi tử số 0, Chưa có TT 100% — cả khi không truyền ngay', async () => {
  ghiDot(M2, st.a.slice(0, 3).map((s) => [s, 'PTC']), '2026-10-17T05:00:00Z');
  PD.xoaCachePhatThang();
  for (const ngay of [D('18'), null]) {
    const { tl, kq } = await khop(M2, ngay);
    assert.equal(tl.ngay, D('18'));
    assert.deepEqual(so5(tl), { PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 6 });
    assert.equal(tl.theo_trang_thai.CHUA_CO_TT.ty_le, 1);
    assert.equal(kq.co_so_lieu_phat, false);
  }
});

test('(b) đã nhập một phần trong ngày (hai đợt, bản cuối thắng): ty-le = ketQuaPhat', async () => {
  const [s0, s1, s2, s3, s4, s5] = st.b;
  ghiDot(M3, [[s0, 'PTC'], [s1, 'PTC'], [s2, 'PTC'], [s3, 'PTC'], [s4, 'PKTC']], '2026-10-18T05:00:00Z');
  ghiDot(M3, [[s0, 'CHUYEN_HOAN'], [s5, 'LAC_HUONG']], '2026-10-18T08:00:00Z');
  PD.xoaCachePhatThang();
  const { tl } = await khop(M3, D('18'));
  assert.deepEqual(so5(tl), { PTC: 3, PKTC: 1, CHUYEN_HOAN: 1, LAC_HUONG: 1, CHUA_CO_TT: 4 });
  assert.equal(tl.muc_cap_nhat, 0.6);
});

test("(c) SHBG hai ngày đến (17, 18) và ba ngày (17, 18, 20): mỗi lần đến lấy bản nhập cuối trong [D, D') — ty-le = ketQuaPhat từng ngày, và gộp all", async () => {
  const { x, y, z } = st.c;
  ghiDot(M4, [[x, 'PTC'], [y, 'PKTC']], '2026-10-17T05:00:00Z');
  ghiDot(M4, [[x, 'PKTC'], [y, 'PTC']], '2026-10-18T05:00:00Z');
  ghiDot(M4, [[z, 'PTC']], '2026-10-19T05:00:00Z'); // sau khi z đến (ngày 18), z không đến lại -> tính cho 18
  PD.xoaCachePhatThang();
  assert.deepEqual(so5((await khop(M4, D('17'))).tl), { PTC: 1, PKTC: 1, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 3 });
  assert.deepEqual(so5((await khop(M4, D('18'))).tl), { PTC: 2, PKTC: 1, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 3 });
  assert.deepEqual(so5((await khop(M4, D('20'))).tl), { PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 4 }, 'x nhập ngày 18 < 20 -> chưa có TT');
  // gộp all (có ngày): cùng mẫu số / 5 trạng thái với ket-qua-phat all
  const tl = (await call(`${TY_LE}?bcvh=all&ngay=${D('18')}`)).body;
  const kq = (await call(`${KQP}?bcvh=all&ngay=${D('18')}`)).body;
  assert.equal(tl.mau_so, kq.mau_so);
  assert.deepEqual(tl.theo_trang_thai, kq.theo_trang_thai);
  assert.equal(tl.muc_cap_nhat, kq.muc_cap_nhat);
});

test('(d) đợt đã hoàn tác bị bỏ qua: ty-le = ketQuaPhat', async () => {
  const [s0, s1, s2, s3] = st.d;
  ghiDot(M5, [[s0, 'PTC'], [s1, 'PTC'], [s2, 'PTC']], '2026-10-18T05:00:00Z');
  const bad = ghiDot(M5, [[s0, 'PKTC'], [s3, 'PKTC']], '2026-10-18T06:00:00Z');
  const truocHoanTac = (await khop(M5, D('18'))).tl;
  assert.deepEqual(so5(truocHoanTac), { PTC: 2, PKTC: 2, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 2 });
  // như hoanTacDot: da_hoan_tac + trả phat_status_current về bản trước đó
  ctx.db.prepare("UPDATE phat_batches SET trang_thai = 'da_hoan_tac', hoan_tac_luc = ? WHERE id = ?").run('2026-10-18T07:00:00Z', bad);
  ctx.db.prepare("UPDATE phat_status_current SET trang_thai = 'PTC', batch_id = (SELECT MIN(id) FROM phat_batches WHERE bcvh = ?) WHERE bcvh = ? AND shbg = ?").run(M5, M5, s0);
  ctx.db.prepare('DELETE FROM phat_status_current WHERE bcvh = ? AND shbg = ?').run(M5, s3);
  PD.xoaCachePhatThang();
  const { tl } = await khop(M5, D('18'));
  assert.deepEqual(so5(tl), { PTC: 3, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 3 });
});

test('(e) ngày không có hàng đến: mẫu số 0, tỷ lệ null, ty-le = ketQuaPhat', async () => {
  const { tl, kq } = await khop(M5, D('25'));
  assert.equal(tl.mau_so, 0);
  assert.equal(kq.mau_so, 0);
  assert.deepEqual(so5(tl), { PTC: 0, PKTC: 0, CHUYEN_HOAN: 0, LAC_HUONG: 0, CHUA_CO_TT: 0 });
  assert.equal(tl.muc_cap_nhat, null);
  for (const m of TT5) assert.equal(tl.theo_trang_thai[m].ty_le, null);
});

test('khóa phản hồi /api/phat/ty-le không đổi (không thêm, không bớt khóa, cùng thứ tự)', async () => {
  const tl = (await call(`${TY_LE}?bcvh=${M3}&ngay=${D('18')}`)).body;
  assert.deepEqual(Object.keys(tl), ['bcvh', 'ngay', 'cung_ngay', 'mau_so', 'theo_trang_thai', 'muc_cap_nhat', 'so_shbg_chuyen_tiep_loai_bo', 'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'theo_khung_gio_den', 'ton_cho', 'nguong']);
  assert.deepEqual(Object.keys(tl.theo_trang_thai), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'CHUA_CO_TT', 'LAC_HUONG']);
  assert.deepEqual(Object.keys(tl.theo_trang_thai.PTC), ['nhan', 'so', 'ty_le']);
  assert.deepEqual(Object.keys(tl.theo_khung_gio_den[0]), ['ma', 'nhan', 'so_den', 'theo_trang_thai', 'muc_cap_nhat']);
  assert.deepEqual(Object.keys(tl.ton_cho), ['moc_tinh_den', 'tong', 'theo_nhom']);
  assert.deepEqual(Object.keys(tl.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'san_xep_hang_bcvh']);
  const all = (await call(`${TY_LE}?bcvh=all&ngay=${D('18')}`)).body;
  assert.deepEqual(Object.keys(all), ['bcvh', 'ngay', 'cung_ngay', 'so_bcvh_trong_tong', 'bcvh_ngoai_tong', 'mau_so', 'theo_trang_thai', 'muc_cap_nhat', 'so_shbg_chuyen_tiep_loai_bo', 'so_lieu_den_luc', 'so_lieu_den_luc_bangkok', 'theo_khung_gio_den', 'ton_cho', 'nguong']);
});

// ---- Việc 4 (CHỈ ĐO): «Sau» của màn commit (tyLeNgay -> demNgay cũ) so với ty-le (#92) cho từng ngày liên quan ----
async function xlsxBuf(rowsX) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['SHBG', 'Trạng thái', 'Ghi chú']);
  for (const row of rowsX) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function post(p, body, who = 'admin') {
  const headers = { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' };
  const res = await fetch(`${ctx.baseUrl}${p}`, { method: 'POST', headers, body: Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('Việc 4 — đợt nhập THẬT: «Sau» của màn commit lệch ty-le (#92) đúng ở ngày đến cũ của SHBG đến lại; ngày đến mới nhất thì khớp', async () => {
  const v = st.v4;
  const up = await post(`/api/phat/drafts?bcvh=${M6}&ten_file=v4.xlsx`, await xlsxBuf([
    [v.a1, 'Phát thành công', null], [v.a2, 'Phát không thành công', null], [v.b1, 'Phát thành công', null], [v.c1, 'Chuyển hoàn', null], [v.c2, 'Phát thành công', null]
  ]));
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const cm = await post(`/api/phat/drafts/${up.body.id}/commit`, { mode: 'hop-le' });
  assert.equal(cm.status, 200, JSON.stringify(cm.body));
  PD.xoaCachePhatThang();
  const bang = [];
  for (const sau of cm.body.ty_le_sau) {
    const tl = (await call(`${TY_LE}?bcvh=${M6}&ngay=${sau.ngay}`)).body;
    bang.push({ ngay: sau.ngay, commit_sau: so5(sau), ty_le: so5(tl), mau_so: [sau.mau_so, tl.mau_so] });
  }
  console.log('VIEC4', JSON.stringify(bang));
  const o = (d) => bang.find((x) => x.ngay === d);
  assert.deepEqual(bang.map((x) => x.ngay), [v.dC, v.dB, v.dA]);
  for (const x of bang) assert.equal(x.mau_so[0], x.mau_so[1], 'mẫu số luôn bằng nhau');
  // Ngày mới nhất (dA): mọi nhập là TRONG ngày -> khớp
  assert.deepEqual(o(v.dA).commit_sau, o(v.dA).ty_le);
  // dB: b1 đến dB và dA, nhập hôm nay (>= D' = dA) -> #92 không tính cho dB; màn commit (trạng thái hiện tại) vẫn tính PTC
  assert.equal(o(v.dB).commit_sau.PTC - o(v.dB).ty_le.PTC, 1);
  // dC: c1 (chỉ đến dC) khớp; c2 đến dC và dA, nhập hôm nay -> #92 không tính cho dC; màn commit tính PTC
  assert.equal(o(v.dC).commit_sau.PTC - o(v.dC).ty_le.PTC, 1);
  assert.equal(o(v.dC).commit_sau.CHUYEN_HOAN, o(v.dC).ty_le.CHUYEN_HOAN);
});
