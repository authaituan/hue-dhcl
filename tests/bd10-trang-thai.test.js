// ==========================================
// Test SANLUONG-4a9:
//  - #68 (đổi #60): "chưa nhận tại BCVH" loại bưu gửi mà BD10 của dòng đại diện là BD10 rỗng hoặc BD10 LẬP ĐI — áp ở /summary,
//    /not-received, /dashboard/center, /exceptions (cùng một truy vấn).
//  - #69: GET /api/arrivals/bd10-trang-thai/theo-ngay và /theo-buu-cuc-lap.
//  - #71: số bưu gửi (SHBG khác nhau) theo ô ở hai API /bd10-trang-thai/*.
//  - #70: ngày dữ liệu mới nhất và "đã chờ" tính theo ngày file OK mới nhất CỦA TỪNG BCVH (M: 09/10, M2: 05/10, M3: chưa có file).
// Server thật trên DB tạm; CSV / số hiệu GIẢ.
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
const { replaceAssignedBcvh } = require('../server/lib/userBcvh');
const Database = require('better-sqlite3');
const aq = require('../server/lib/arrivalsQuery');
const bd10 = require('../server/lib/bd10Query');
const exp = require('../server/lib/arrivalsExport');

const PORT = 5919;
const M = '533140'; // BCVH đang xem
const M2 = '535470'; // BCVH thứ hai — dữ liệu chậm: file mới nhất 05/10
const M3 = '536250'; // BCVH chưa có file nào
const NO_NAME = '777777'; // bưu cục lập KHÔNG có trong danh mục post_offices
const USERS = {
  admin: { hrm: 'TT_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'TT_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvhM: { hrm: 'TT_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 533140
  gdvhM2: { hrm: 'TT_GDVH2', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 535470
  gdvhNone: { hrm: 'TT_GDVH0', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'TT_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;

const b10 = (lap, nhan, n) => `${lap}${nhan}${String(n).padStart(7, '0')}`; // 19 ký tự giả
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const shbg = (n) => `ZZ9T${String(n).padStart(6, '0')}VN`;
function mkRow(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: M, Ten_duong_thu: 'Đường thư giả', SHBG: shbg(seq), So_hieu_BD10: '',
    'Thời gian XN túi': 'NULL', 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: `P${seq}`,
    Khoi_luong_thuc_te: '100', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', ...o
  };
}
// Thời gian 'DD HH:mm:ss' của tháng 10/2026, hoặc 'MM-DD HH:mm:ss'.
const stamp = (v) => (v === undefined ? 'NULL' : /^\d{2}-\d{2} /.test(v) ? `2026-${v}` : `2026-10-${v.slice(0, 2)} ${v.slice(3)}`);
// o: bag, itm, xnd, ttkt (mốc), rc (bưu cục nhận), fd (ngày file 'DD' cho dòng không có mốc BCVH), sh (SHBG cố định)
const r = (code, o = {}) => ({
  ...mkRow({
    So_hieu_BD10: code, 'Thời gian XN túi': stamp(o.bag), 'Thời gian XN BG': stamp(o.itm), Ngay_gio_XND_BD10: stamp(o.xnd),
    Ngay_gio_XND_BD10_tai_TTKT: stamp(o.ttkt), BC_nhan_BG: o.rc || M, ...(o.sh ? { SHBG: o.sh } : {})
  }),
  _fd: o.fd
});

// ---- Trạng thái BD10 đến của M. Khung kiểm tra 02/10 → 08/10; file mới nhất 09/10. ----
const A = b10('530100', M, 1); // S1: XN túi 02/10 nhưng XNĐ 03/10 -> ngày 03/10 (quy tắc X: có XNĐ -> ngày XNĐ)
const B = b10('531120', M, 2); // S2: dòng 1 đủ túi + BG 05/10, dòng 2 chỉ BG 04/10 -> ngày 04/10 (MIN túi/BG trên mọi dòng)
const C = b10('531120', M, 3); // S3: chỉ XN BG 06/10
const D = b10(NO_NAME, M, 4); // S1: XNĐ 06/10, bưu cục lập không có trong danh mục
const E = b10('530100', M, 5); // S4: không mốc nào (cũng dùng cho các bưu gửi "chưa nhận" của BD10 đến)
const F = b10('531120', M, 6); // S2 ngày 28/09: trước khung
const G = b10('530100', M, 7); // S1 ngày 09/10: sau khung
const OUT = b10(M, '531120', 8); // BD10 LẬP ĐI của M
const OTHER = b10('531120', '535790', 9); // BD10 loại khác (cả hai nửa ≠ M)
const K = b10('530100', M2, 10); // BD10 đến của M2: S2 ngày 05/10
const K2 = b10('531120', M2, 11); // BD10 đến của M2: S2 ngày 03/10
const ROWS = [
  r(A, { bag: '02 20:00:00', xnd: '03 07:00:00' }),
  r(B, { bag: '05 08:00:00', itm: '05 08:05:00' }), r(B, { itm: '04 22:00:00' }),
  r(C, { itm: '06 09:00:00' }),
  r(D, { bag: '06 08:00:00', itm: '06 08:05:00', xnd: '06 07:00:00' }),
  r(E, { fd: '04' }),
  r(F, { bag: '09-28 08:00:00', itm: '09-28 08:05:00' }),
  r(G, { bag: '09 08:00:00', xnd: '09 07:00:00' }),
  // Bị loại khỏi trạng thái BD10 đến: BD10 lập đi, BD10 rỗng (cùng ngày 05/10 -> ngày 05/10 phải là 0)
  r(OUT, { bag: '05 08:00:00', itm: '05 08:05:00' }), r('', { bag: '05 09:00:00', itm: '05 09:05:00' }),
  r(K, { bag: '05 08:00:00', itm: '05 08:05:00', rc: M2 }),
  r(K2, { bag: '03 08:00:00', itm: '03 08:05:00', rc: M2 }), r(K2, { bag: '05 09:00:00', itm: '05 09:05:00', rc: M2 }), // file M2 ngày 03 và 05
  // ---- "Chưa nhận tại BCVH" (#68): bưu gửi không mốc BCVH, có mốc lập BD10 ----
  r(E, { ttkt: '08 06:00:00', fd: '08', sh: shbg(901) }), // NR1: BD10 đến -> tính
  r(OUT, { ttkt: '03 06:00:00', fd: '04', sh: shbg(902) }), // NR2: BD10 lập đi -> loại
  r('', { ttkt: '03 06:00:00', fd: '04', sh: shbg(903) }), // NR3: BD10 rỗng -> loại
  r(OTHER, { ttkt: '03 06:00:00', fd: '04', sh: shbg(904) }), // NR4: BD10 loại khác -> tính
  // NR5: hai dòng; dòng đại diện (id nhỏ nhất) là BD10 lập đi -> loại cả bưu gửi
  r(OUT, { ttkt: '02 06:00:00', fd: '04', sh: shbg(905) }), r(E, { ttkt: '02 06:00:00', fd: '04', sh: shbg(905) }),
  // NR6: hai dòng; dòng đại diện là BD10 đến -> tính
  r(E, { ttkt: '02 06:00:00', fd: '04', sh: shbg(906) }), r(OUT, { ttkt: '02 06:00:00', fd: '04', sh: shbg(906) }),
  // NR7: bưu gửi chưa nhận của M2 (BD10 đến K), lập BD10 03/10, nằm trong file M2 ngày 05/10
  r(K, { ttkt: '03 06:00:00', fd: '05', sh: shbg(907), rc: M2 }),
  // ---- #71 số bưu gửi: thêm dòng vào BD10 đã có, KHÔNG đổi trạng thái / ngày của BD10 nào ----
  // X1: hai dòng trong CÙNG BD10 A -> đếm 1
  r(A, { bag: '03 08:00:00', xnd: '03 07:00:00', sh: shbg(951) }), r(A, { bag: '03 08:30:00', xnd: '03 07:00:00', sh: shbg(951) }),
  // X2: ở B (04/10) và C (06/10), cùng "chưa XNĐ", cùng bưu cục lập 531120 -> 1 trong ô bưu cục lập; có mặt ở hai ngày
  r(B, { bag: '05 10:00:00', sh: shbg(952) }), r(C, { itm: '06 10:00:00', sh: shbg(952) }),
  // X3: ở C (chưa XNĐ) và D (đã XNĐ), cùng ngày 06/10 -> có ở cả bg_da_xnd và bg_chua_xnd, bg_tong đếm 1
  r(C, { itm: '06 11:00:00', sh: shbg(953) }), r(D, { bag: '06 09:00:00', itm: '06 09:05:00', xnd: '06 07:00:00', sh: shbg(953) })
];
const dayOfRow = (row) => {
  const t = [row['Thời gian XN túi'], row['Thời gian XN BG'], row.Ngay_gio_XND_BD10].find((x) => x !== 'NULL');
  return t ? t.slice(0, 10) : `2026-10-${row._fd || '04'}`;
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

async function api(p, who) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const RANGE = 'from=2026-10-02&to=2026-10-08';
const NGAY = '/api/arrivals/bd10-trang-thai/theo-ngay';
const LAP = '/api/arrivals/bd10-trang-thai/theo-buu-cuc-lap';
const zero = { tong: 0, da_xnd: 0, chua_xnd: 0, ty_le_chua_xnd: null };
// Chỉ các khoá theo BD10 có từ 4a9 (khoá bưu gửi #71 kiểm ở ca riêng).
const old = ({ bg_tong, bg_da_xnd, bg_chua_xnd, ty_le_chua_xnd_bg, ...rest }) => rest;

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-bd10-tt-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-bd10-tt-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec(`
    INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử');
    INSERT INTO commune_post_offices (id, code, name, province_id) VALUES ('c1', '9901', 'Bưu điện phường An', 'p1');
    INSERT INTO post_offices (id, code, name, type, commune_id, new_ward_name) VALUES
      ('po1', '${M}', 'BCVH Thử Một', 'PH1', 'c1', 'Phường An'), ('po2', '${M2}', 'BCVH Thử Hai', 'PH1', 'c1', 'Phường An'),
      ('po3', '530100', 'TTKT Thử', 'PH1', 'c1', 'Phường An'), ('po4', '531120', 'Bưu cục Thử Lập', 'PH1', 'c1', 'Phường An');
  `);
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvhM, [M]);
  replaceAssignedBcvh(ctx.db, ids.gdvhM2, [M2]);
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

// ---------------- #68: "chưa nhận tại BCVH" ----------------
test('#68 chưa nhận: loại BD10 lập đi và BD10 rỗng (theo dòng đại diện); BD10 đến và BD10 loại khác vẫn tính', async () => {
  const s = (await api(`/api/arrivals/summary?from=2026-10-01&to=2026-10-09&receiver_code=${M}`, 'ttvh')).body.chua_nhan_tai_bcvh;
  // Tính: NR1 (đến, lập BD10 08/10), NR4 (loại khác, 03/10), NR6 (đại diện là BD10 đến, 02/10). Loại: NR2 (lập đi), NR3 (rỗng), NR5 (đại diện lập đi).
  assert.equal(s.tong, 3);
  assert.deepEqual(s.theo_ngay_lap.map((x) => [x.ngay, x.so_buu_gui]), [['2026-10-02', 1], ['2026-10-03', 1], ['2026-10-08', 1]]);
  assert.deepEqual(s.theo_tuoi, { '0-1': 1, '2': 0, '3+': 2 }, 'tuổi tính tới file mới nhất 09/10');
  const l = (await api(`/api/arrivals/not-received?from=2026-10-01&to=2026-10-09&receiver_code=${M}`, 'ttvh')).body;
  assert.deepEqual(l.items.map((i) => i.tracking_no), [shbg(906), shbg(904), shbg(901)], 'cũ nhất trước');
  assert.equal(l.pagination.total, 3);
  // Cùng một định nghĩa ở /exceptions và /dashboard/center
  const ex = (await api('/api/arrivals/exceptions?from=2026-10-01&to=2026-10-09&receiver_code=533140', 'admin')).body;
  assert.equal(ex.theo_ly_do.CHUA_NHAN_TAI_BCVH, 3);
  const c = (await api('/api/arrivals/dashboard/center?from=2026-10-01&to=2026-10-09', 'admin')).body.chua_nhan_tai_bcvh;
  assert.equal(c.tong, 4, '3 của M + NR7 của M2');
  // Xuất Excel dùng notReceivedList -> cùng số
  assert.equal(exp.countNotReceived(ctx.db, exp.parseExportParams({ receiver_code: M, from: '2026-10-01', to: '2026-10-09' })), 3);
});

test('#68 chưa nhận: khung hẹp / rộng vẫn theo ngày FILE như #60', async () => {
  const tong = async (qs) => (await api(`/api/arrivals/summary?${qs}&receiver_code=${M}`, 'ttvh')).body.chua_nhan_tai_bcvh.tong;
  assert.equal(await tong('from=2026-10-05&to=2026-10-08'), 1, 'chỉ file 08/10 (NR1)');
  assert.equal(await tong('from=2026-10-04&to=2026-10-04'), 2, 'file 04/10: NR4, NR6');
  assert.equal(await tong('from=2026-10-01&to=2026-10-03'), 0, 'không có file chứa bưu gửi chưa nhận');
  assert.equal(await tong('from=2026-09-01&to=2026-10-31'), 3);
});

// ---------------- #69: trạng thái BD10 đến theo ngày ----------------
test('theo-ngay: MỌI ngày trong khung (ngày trống = 0), quy tắc X, loại BD10 lập đi / rỗng, tổng ngày = tổng khung, ngoài khung, ngày dữ liệu mới nhất', async () => {
  const res = await api(`${NGAY}?${RANGE}&receiver_code=${M}`, 'ttvh');
  assert.equal(res.status, 200);
  const b = res.body;
  assert.deepEqual(Object.keys(b), ['khung', 'ngay_du_lieu_moi_nhat', 'theo_ngay', 'tong', 'ngoai_khung']);
  assert.deepEqual(b.khung, { from: '2026-10-02', to: '2026-10-08', quy_tac_ngay: 'X' });
  assert.equal(b.ngay_du_lieu_moi_nhat, '2026-10-09');
  assert.deepEqual(b.theo_ngay.map((d) => d.ngay), ['02', '03', '04', '05', '06', '07', '08'].map((d) => `2026-10-${d}`));
  const by = Object.fromEntries(b.theo_ngay.map(({ ngay, ...rest }) => [ngay.slice(8), old(rest)]));
  assert.deepEqual(by['02'], zero, 'A có XN túi 02/10 nhưng có XNĐ 03/10 -> không thuộc 02/10');
  assert.deepEqual(by['03'], { tong: 1, da_xnd: 1, chua_xnd: 0, ty_le_chua_xnd: 0 }, 'A: ngày XNĐ');
  assert.deepEqual(by['04'], { tong: 1, da_xnd: 0, chua_xnd: 1, ty_le_chua_xnd: 1 }, 'B: không XNĐ -> MIN túi/BG trên mọi dòng = 04/10');
  assert.deepEqual(by['05'], zero, 'BD10 lập đi và BD10 rỗng ngày 05/10 không tính');
  assert.deepEqual(by['06'], { tong: 2, da_xnd: 1, chua_xnd: 1, ty_le_chua_xnd: 0.5 }, 'C (S3) + D (S1)');
  assert.deepEqual(by['07'], zero);
  assert.deepEqual(by['08'], zero);
  assert.deepEqual(old(b.tong), { tong: 4, da_xnd: 2, chua_xnd: 2, ty_le_chua_xnd: 0.5 });
  const sum = (k) => b.theo_ngay.reduce((a, d) => a + d[k], 0);
  assert.deepEqual([sum('tong'), sum('da_xnd'), sum('chua_xnd')], [b.tong.tong, b.tong.da_xnd, b.tong.chua_xnd]);
  assert.deepEqual(b.ngoai_khung, { truoc_khung: 1, sau_khung: 1, khong_co_moc: 1 }, 'F trước, G sau, E (S4) không mốc');
  // Khớp chỉ số đang có ở /summary (không đổi khoá cũ)
  const s = (await api(`/api/arrivals/summary?${RANGE}&receiver_code=${M}`, 'ttvh')).body.bd10_den_khong_xnd;
  assert.deepEqual([s.tong_bd10_den, s.khong_xnd, s.theo_trang_thai.s1], [b.tong.tong, b.tong.chua_xnd, b.tong.da_xnd]);
  assert.deepEqual(s.ngoai_khung, b.ngoai_khung);
});

test('theo-ngay: tong = 0 -> ty_le_chua_xnd null; một ngày (from = to); bí danh unit', async () => {
  const e = (await api(`${NGAY}?from=2026-01-01&to=2026-01-02&receiver_code=${M}`, 'admin')).body;
  assert.deepEqual(e.theo_ngay.map(old), [{ ngay: '2026-01-01', ...zero }, { ngay: '2026-01-02', ...zero }]);
  assert.deepEqual(old(e.tong), zero);
  const one = (await api(`${NGAY}?from=2026-10-06&to=2026-10-06&unit=${M}`, 'admin')).body;
  assert.equal(one.theo_ngay.length, 1);
  assert.deepEqual(old(one.tong), { tong: 2, da_xnd: 1, chua_xnd: 1, ty_le_chua_xnd: 0.5 });
});

test('tham số: khung > 92 ngày -> 400 tiếng Việt (92 ngày được); chỉ nhận ngày; khoá lạ -> 400; unit ≠ receiver_code -> 400', async () => {
  assert.equal(bd10.TRANG_THAI_MAX_DAYS, exp.EXPORT_MAX_DAYS, 'cùng giới hạn với xuất file');
  for (const p of [NGAY, LAP]) {
    const over = await api(`${p}?from=2026-07-01&to=2026-10-01&receiver_code=${M}`, 'ttvh'); // 93 ngày
    assert.equal(over.status, 400);
    assert.match(over.body.error, /tối đa 92 ngày \(đã chọn 93 ngày\)/);
    assert.equal((await api(`${p}?from=2026-07-02&to=2026-10-01&receiver_code=${M}`, 'ttvh')).status, 200, '92 ngày');
    assert.equal((await api(`${p}?from=2026-10-02 08:00&to=2026-10-08&receiver_code=${M}`, 'ttvh')).status, 400, 'không nhận giờ');
    assert.equal((await api(`${p}?${RANGE}&nhom=khac`, 'ttvh')).status, 400);
    assert.equal((await api(`${p}?${RANGE}&unit=${M}&receiver_code=${M2}`, 'ttvh')).status, 400);
    assert.equal((await api(`${p}?to=2026-10-08`, 'ttvh')).status, 400, 'thiếu from');
  }
});

// ---------------- #69: theo bưu cục lập ----------------
test('theo-buu-cuc-lap: đủ từng bưu cục (không gộp 530100 / khác), sắp chua_xnd rồi tong giảm dần, tên từ danh mục, mã ngoài danh mục -> null, dòng tổng', async () => {
  const res = await api(`${LAP}?${RANGE}&receiver_code=${M}`, 'gdvhM');
  assert.equal(res.status, 200);
  const b = res.body;
  assert.deepEqual(Object.keys(b), ['khung', 'theo_buu_cuc_lap', 'tong', 'ngoai_khung']);
  assert.deepEqual(b.theo_buu_cuc_lap.map(old), [
    { ma_buu_cuc: '531120', ten_buu_cuc: 'Bưu cục Thử Lập', tong: 2, da_xnd: 0, chua_xnd: 2, ty_le_chua_xnd: 1 },
    { ma_buu_cuc: '530100', ten_buu_cuc: 'TTKT Thử', tong: 1, da_xnd: 1, chua_xnd: 0, ty_le_chua_xnd: 0 },
    { ma_buu_cuc: NO_NAME, ten_buu_cuc: null, tong: 1, da_xnd: 1, chua_xnd: 0, ty_le_chua_xnd: 0 }
  ]);
  assert.ok(!b.theo_buu_cuc_lap.some((x) => x.ma_buu_cuc === M), 'BD10 lập đi không có mặt');
  assert.deepEqual(old(b.tong), { tong: 4, da_xnd: 2, chua_xnd: 2, ty_le_chua_xnd: 0.5 });
  assert.deepEqual(b.ngoai_khung, { truoc_khung: 1, sau_khung: 1, khong_co_moc: 1 });
  // Một ngày: 06/10 -> C (531120, chưa XNĐ) và D (777777, đã XNĐ)
  const d6 = (await api(`${LAP}?from=2026-10-06&to=2026-10-06&receiver_code=${M}`, 'ttvh')).body.theo_buu_cuc_lap;
  assert.deepEqual(d6.map((x) => [x.ma_buu_cuc, x.chua_xnd, x.tong]), [['531120', 1, 1], [NO_NAME, 0, 1]]);
  const e = (await api(`${LAP}?from=2026-01-01&to=2026-01-01&receiver_code=${M}`, 'ttvh')).body;
  assert.deepEqual([e.theo_buu_cuc_lap, old(e.tong)], [[], zero]);
});

// ---------------- Quyền / phạm vi ----------------
test('phạm vi: công khai cho ADMIN/TTVH/GDVH; GDVH chỉ BCVH được giao (chưa giao -> 0); ADMIN/TTVH chọn được BCVH; STAFF 403, không token 401', async () => {
  const tong = async (p, qs, who) => (await api(`${p}?${RANGE}${qs}`, who)).body.tong.tong;
  for (const p of [NGAY, LAP]) {
    assert.equal(await tong(p, `&receiver_code=${M}`, 'admin'), 4);
    assert.equal(await tong(p, `&receiver_code=${M2}`, 'ttvh'), 2, 'K, K2 của M2');
    assert.equal(await tong(p, '', 'ttvh'), 6, 'không lọc: cả hai BCVH');
    assert.equal(await tong(p, '', 'gdvhM'), 4, 'GDVH được giao M chỉ thấy M');
    assert.equal(await tong(p, '', 'gdvhM2'), 2);
    assert.equal(await tong(p, `&receiver_code=${M}`, 'gdvhM2'), 0, 'lọc BCVH không được giao -> không lộ');
    assert.equal(await tong(p, '', 'gdvhNone'), 0);
    assert.equal((await api(`${p}?${RANGE}`, 'staff')).status, 403);
    assert.equal((await api(`${p}?${RANGE}`)).status, 401);
  }
  const none = (await api(`${NGAY}?${RANGE}`, 'gdvhNone')).body;
  assert.equal(none.theo_ngay.length, 7, 'vẫn đủ ngày, số 0');
  assert.deepEqual(none.ngoai_khung, { truoc_khung: 0, sau_khung: 0, khong_co_moc: 0 });
});

// ---------------- #70: mốc "đã chờ" và ngày dữ liệu mới nhất theo từng BCVH ----------------
test('#70 latestFileDate / latestFileDates: theo BCVH, chọn nhiều -> ngày muộn nhất, BCVH không file -> null, DB trống -> null', () => {
  assert.deepEqual([...aq.latestFileDates(ctx.db)].sort(), [[M, '2026-10-09'], [M2, '2026-10-05']]);
  assert.equal(aq.latestFileDate(ctx.db, [M]), '2026-10-09');
  assert.equal(aq.latestFileDate(ctx.db, [M2]), '2026-10-05');
  assert.equal(aq.latestFileDate(ctx.db, [M2, M]), '2026-10-09');
  assert.equal(aq.latestFileDate(ctx.db, [M3]), null);
  assert.equal(aq.latestFileDate(ctx.db), '2026-10-09', 'không chọn = mọi BCVH');
  const empty = new Database(':memory:');
  empty.exec('CREATE TABLE arrival_import_files (unit_code TEXT, file_date TEXT, status TEXT)');
  assert.equal(aq.latestFileDate(empty), null);
  assert.equal(aq.latestFileDates(empty).size, 0);
  empty.close();
});

test('#70 theo-ngay: ngay_du_lieu_moi_nhat theo BCVH đang chọn / phạm vi GDVH', async () => {
  const d = async (qs, who = 'ttvh') => (await api(`${NGAY}?${RANGE}${qs}`, who)).body.ngay_du_lieu_moi_nhat;
  assert.equal(await d(`&receiver_code=${M}`), '2026-10-09');
  assert.equal(await d(`&receiver_code=${M2}`), '2026-10-05');
  assert.equal(await d(`&receiver_code=${M},${M2}`), '2026-10-09', 'chọn cả hai -> ngày muộn hơn');
  assert.equal(await d(''), '2026-10-09', 'không chọn = mọi BCVH');
  assert.equal(await d(`&unit=${M3}`), null, 'BCVH chưa có file');
  assert.equal(await d('', 'gdvhM2'), '2026-10-05', 'GDVH: theo BCVH được giao');
  assert.equal(await d('', 'gdvhNone'), null);
  const m3 = (await api(`${NGAY}?${RANGE}&receiver_code=${M3}`, 'ttvh')).body;
  assert.deepEqual(old(m3.tong), zero, 'BCVH không có file: không lỗi, không số');
});

test('#70 chưa nhận: "đã chờ" tới ngày file mới nhất của BCVH nhận (M2: 05/10, không phải 09/10); chọn hai BCVH mỗi mục giữ mốc riêng', async () => {
  const sum = async (qs) => (await api(`/api/arrivals/summary?from=2026-10-01&to=2026-10-09${qs}`, 'ttvh')).body.chua_nhan_tai_bcvh;
  const m2 = await sum(`&receiver_code=${M2}`);
  assert.equal(m2.tong, 1);
  assert.deepEqual(m2.theo_ngay_lap, [{ ngay: '2026-10-03', so_buu_gui: 1, tuoi: 2 }], '05/10 − 03/10 = 2 (mốc cả DB 09/10 sẽ là 6)');
  assert.deepEqual(m2.theo_tuoi, { '0-1': 0, '2': 1, '3+': 0 });
  assert.equal(m2.cu_nhat_ngay, 2);
  const both = await sum(`&receiver_code=${M},${M2}`);
  // M: NR6 lập 02/10 -> 7, NR4 lập 03/10 -> 6, NR1 lập 08/10 -> 1 (mốc 09/10); M2: NR7 lập 03/10 -> 2 (mốc 05/10)
  assert.deepEqual(both.theo_ngay_lap, [
    { ngay: '2026-10-02', so_buu_gui: 1, tuoi: 7 }, { ngay: '2026-10-03', so_buu_gui: 1, tuoi: 6 },
    { ngay: '2026-10-03', so_buu_gui: 1, tuoi: 2 }, { ngay: '2026-10-08', so_buu_gui: 1, tuoi: 1 }
  ], 'cùng ngày lập, khác BCVH -> hai phần tử theo tuổi');
  assert.deepEqual(both.theo_tuoi, { '0-1': 1, '2': 1, '3+': 2 });
  assert.equal(both.cu_nhat_ngay, 7);
  const l = (await api(`/api/arrivals/not-received?from=2026-10-01&to=2026-10-09&receiver_code=${M},${M2}`, 'ttvh')).body.items;
  assert.deepEqual(l.map((i) => [i.tracking_no, i.receiver_code, i.tuoi_ngay]),
    [[shbg(906), M, 7], [shbg(904), M, 6], [shbg(907), M2, 2], [shbg(901), M, 1]]);
  const ex = (await api('/api/arrivals/exceptions?from=2026-10-01&to=2026-10-09&ly_do=CHUA_NHAN_TAI_BCVH', 'admin')).body.items;
  assert.equal(ex.find((i) => i.tracking_no === shbg(907)).tuoi_ngay, 2);
  // Xuất Excel (cột Da_cho_ngay) lấy từ cùng notReceivedList
  const ctxM2 = exp.parseExportParams({ receiver_code: M2, from: '2026-10-01', to: '2026-10-09' });
  assert.equal(aq.notReceivedList(ctx.db, { ...ctxM2.f, page: 1, pageSize: 10 }).items[0].tuoi_ngay, 2);
  const m3 = await sum(`&receiver_code=${M3}`);
  assert.deepEqual(m3, { tong: 0, cu_nhat_ngay: null, theo_tuoi: { '0-1': 0, '2': 0, '3+': 0 }, theo_ngay_lap: [] });
});

test('#70 BD10 đến không XNĐ: theo_tuoi, tuoi của danh sách và bộ lọc tuoi theo mốc của BCVH nhận', async () => {
  const s = async (qs) => (await api(`/api/arrivals/summary?${RANGE}${qs}`, 'ttvh')).body.bd10_den_khong_xnd.theo_tuoi;
  // M2 (mốc 05/10): K ngày 05/10 -> 0, K2 ngày 03/10 -> 2
  assert.deepEqual(await s(`&receiver_code=${M2}`), { '0-1': 1, '2': 1, '3+': 0 });
  // M (mốc 09/10): B 04/10 -> 5, C 06/10 -> 3
  assert.deepEqual(await s(`&receiver_code=${M}`), { '0-1': 0, '2': 0, '3+': 2 });
  assert.deepEqual(await s(`&receiver_code=${M},${M2}`), { '0-1': 1, '2': 1, '3+': 2 });
  const list = async (qs) => (await api(`/api/arrivals/bd10-khong-xnd?${RANGE}&receiver_code=${M},${M2}${qs}`, 'ttvh')).body.items;
  assert.deepEqual((await list('')).map((i) => [i.ma_bcvh, i.ngay, i.tuoi]),
    [[M2, '2026-10-03', 2], [M, '2026-10-04', 5], [M2, '2026-10-05', 0], [M, '2026-10-06', 3]]);
  assert.deepEqual((await list('&tuoi=0-1')).map((i) => i.ngay), ['2026-10-05']);
  assert.deepEqual((await list('&tuoi=2')).map((i) => i.ngay), ['2026-10-03']);
  assert.deepEqual((await list('&tuoi=3%2B')).map((i) => i.ngay), ['2026-10-04', '2026-10-06']);
  const c = (await api(`/api/arrivals/dashboard/center?${RANGE}`, 'ttvh')).body.bd10_den_khong_xnd.theo_tuoi;
  assert.deepEqual(c, { '0-1': 1, '2': 1, '3+': 2 }, '/dashboard/center cùng quy tắc');
});

// ---------------- #71: số bưu gửi theo ô ----------------
const bgOf = ({ bg_tong, bg_da_xnd, bg_chua_xnd, ty_le_chua_xnd_bg }) => ({ bg_tong, bg_da_xnd, bg_chua_xnd, ty_le_chua_xnd_bg });
const bg = (t, da, chua, ty) => ({ bg_tong: t, bg_da_xnd: da, bg_chua_xnd: chua, ty_le_chua_xnd_bg: ty });
const BG0 = bg(0, 0, 0, null);

test('#71 theo-ngay: SHBG khác nhau theo ô; lặp trong một BD10 đếm 1; hai trạng thái cùng ngày -> có ở cả hai, bg_tong đếm 1; tong cả khung distinct', async () => {
  const b = (await api(`${NGAY}?${RANGE}&receiver_code=${M}`, 'ttvh')).body;
  assert.deepEqual(Object.keys(b.theo_ngay[0]), ['ngay', 'tong', 'da_xnd', 'chua_xnd', 'ty_le_chua_xnd', 'bg_tong', 'bg_da_xnd', 'bg_chua_xnd', 'ty_le_chua_xnd_bg']);
  const by = Object.fromEntries(b.theo_ngay.map((d) => [d.ngay.slice(8), bgOf(d)]));
  assert.deepEqual(by['02'], BG0, 'ngày không dữ liệu: 0, tỉ lệ null');
  assert.deepEqual(by['03'], bg(2, 2, 0, 0), 'A: SHBG của A + X1 (hai dòng) = 2');
  assert.deepEqual(by['04'], bg(3, 0, 3, 1), 'B: hai SHBG cũ + X2');
  assert.deepEqual(by['05'], BG0, 'BD10 lập đi và BD10 rỗng không tính');
  assert.deepEqual(by['06'], bg(4, 2, 3, 0.75), 'C (SHBG cũ, X2, X3) + D (SHBG cũ, X3): X3 ở cả hai, bg_tong = 4');
  assert.ok(by['06'].bg_da_xnd + by['06'].bg_chua_xnd > by['06'].bg_tong, 'da + chua có thể > tong');
  assert.deepEqual(by['07'], BG0);
  assert.deepEqual(bgOf(b.tong), bg(8, 4, 5, 0.625), 'cả khung: distinct, KHÔNG cộng các ngày');
  const sumDays = b.theo_ngay.reduce((a, d) => a + d.bg_tong, 0);
  assert.equal(sumDays, 9, 'X2 có ở hai ngày');
  assert.ok(b.tong.bg_tong <= sumDays);
  // khoá cũ giữ giá trị
  assert.deepEqual(old(b.tong), { tong: 4, da_xnd: 2, chua_xnd: 2, ty_le_chua_xnd: 0.5 });
  assert.deepEqual(b.ngoai_khung, { truoc_khung: 1, sau_khung: 1, khong_co_moc: 1 });
  // khung không có dữ liệu: tong 0, tỉ lệ null
  assert.deepEqual(bgOf((await api(`${NGAY}?from=2026-01-01&to=2026-01-01&receiver_code=${M}`, 'ttvh')).body.tong), BG0);
});

test('#71 theo-buu-cuc-lap: SHBG ở hai BD10 cùng trạng thái cùng bưu cục lập đếm 1; thứ tự vẫn theo số BD10', async () => {
  const b = (await api(`${LAP}?${RANGE}&receiver_code=${M}`, 'ttvh')).body;
  assert.deepEqual(b.theo_buu_cuc_lap.map((x) => [x.ma_buu_cuc, bgOf(x)]), [
    ['531120', bg(5, 0, 5, 1)], // B (2 SHBG + X2) + C (SHBG cũ, X2, X3): X2 một lần
    ['530100', bg(2, 2, 0, 0)],
    [NO_NAME, bg(2, 2, 0, 0)]
  ]);
  assert.deepEqual(b.theo_buu_cuc_lap.map(old)[0], { ma_buu_cuc: '531120', ten_buu_cuc: 'Bưu cục Thử Lập', tong: 2, da_xnd: 0, chua_xnd: 2, ty_le_chua_xnd: 1 });
  assert.deepEqual(bgOf(b.tong), bg(8, 4, 5, 0.625));
  assert.deepEqual(bgOf((await api(`${LAP}?from=2026-01-01&to=2026-01-01&receiver_code=${M}`, 'ttvh')).body.tong), BG0);
});

test('#71 phạm vi số bưu gửi như số BD10: GDVH chỉ BCVH được giao; chưa giao -> 0', async () => {
  for (const p of [NGAY, LAP]) {
    const t = async (qs, who) => bgOf((await api(`${p}?${RANGE}${qs}`, who)).body.tong);
    assert.deepEqual(await t('', 'gdvhM2'), bg(4, 0, 4, 1), 'M2: K (SHBG cũ + NR7) + K2 (hai SHBG)');
    assert.deepEqual(await t(`&receiver_code=${M}`, 'gdvhM2'), BG0);
    assert.deepEqual(await t('', 'gdvhNone'), BG0);
    assert.deepEqual(await t('', 'gdvhM'), bg(8, 4, 5, 0.625));
    assert.deepEqual(await t('', 'admin'), bg(12, 4, 9, 0.75), 'cả hai BCVH');
  }
});
