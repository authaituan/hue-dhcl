// ==========================================
// Test DASH-12b: GET /api/arrivals/dashboard/ket-qua-phat-thang — kết quả phát TỪ ĐẦU THÁNG (lũy kế = tổng tử / tổng mẫu của TỪNG ngày, chuỗi theo ngày,
// chênh lệch theo giá trị làm tròn hiển thị, ngưỡng «ngang», cache 60 giây có vô hiệu theo chữ ký dữ liệu), quyền (TIVI 403) và ket-qua-phat không đổi.
// Server thật trên DB tạm; CSV / SHBG GIẢ. Khung dựng dữ liệu như tests/phat-dashboard.test.js.
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
const PD = require('../server/lib/phatDashboard');

const PORT = 5941;
const [M, M2, M3, M4, M5, M6] = VALID_BCVH_CODES;
const URL = '/api/arrivals/dashboard/ket-qua-phat-thang';
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
/** n SHBG mới đến BCVH rc ngày ymd ('2026-10-DD'); `them` = SHBG đã có (đến lại) cũng đến ngày này. Trả danh sách SHBG của ngày (thêm trước, mới sau). */
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
function ghiDot(bcvh, items, nhapLuc) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, ids.admin, nhapLuc, items.length).lastInsertRowid;
  const ins = ctx.db.prepare('INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)');
  ctx.db.transaction(() => { for (const [s, tt] of items) ins.run(bcvh, s, tt, bid, nhapLuc); })();
  return bid;
}
function chia(list, plan) {
  const out = [];
  let i = 0;
  for (const [tt, n] of Object.entries(plan)) for (let k = 0; k < n; k++) out.push([list[i++], tt]);
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
const T = '2026-10-07T03:00:00Z';
const st = {};
const TT5 = ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT'];
const ratio4 = (n, d) => Math.round((n / d) * 10000) / 10000;

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

  // M: file ngày 01, 02, 04, 05, 06 (KHÔNG có file ngày 03). Ngày 04 có hàng nhưng chưa ai nhập phát. Một SHBG của ngày 01 đến lại ngày 02.
  st.m01 = taoHang(M, D('01'), 20);
  st.m02 = taoHang(M, D('02'), 30, [st.m01[0]]);
  st.m04 = taoHang(M, D('04'), 40);
  st.m05 = taoHang(M, D('05'), 25);
  st.m06 = taoHang(M, D('06'), 60);
  // M2: file ngày 05 (40) và 06 (50 = đúng sàn so sánh).
  st.m2_05 = taoHang(M2, D('05'), 40);
  st.m2_06 = taoHang(M2, D('06'), 50);
  // M3: file ngày 04 (30) và 05 (49 = dưới sàn so sánh 1 đơn vị); dữ liệu mới nhất 05 (lệch ngày so với M, M2).
  st.m3_04 = taoHang(M3, D('04'), 30);
  st.m3_05 = taoHang(M3, D('05'), 49);
  // M4: chỉ file ngày 01 (ngày đầu tháng). M5: chỉ file 30/09 (cuối tháng trước). M6: chưa có file nào.
  st.m4_01 = taoHang(M4, D('01'), 80);
  st.m5 = taoHang(M5, '2026-09-30', 55);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }

  ghiDot(M, chia(st.m01, { PTC: 10 }), T); // ngày 01: 10/20 PTC (SHBG đến lại st.m01[0] nằm trong 10 này)
  ghiDot(M, chia(st.m02.slice(1), { PTC: 29 }), T); // ngày 02: 30/30 PTC (SHBG đến lại đã có PTC)
  ghiDot(M, chia(st.m05, { PTC: 5, PKTC: 5 }), T); // ngày 05: 5 PTC, 5 PKTC, 15 chưa
  ghiDot(M, chia(st.m06, { PTC: 36, PKTC: 6, CHUYEN_HOAN: 3, LAC_HUONG: 3 }), T); // ngày 06: 60, 12 chưa
  ghiDot(M2, chia(st.m2_05, { PTC: 20 }), T);
  ghiDot(M2, chia(st.m2_06, { PTC: 45 }), T);
  ghiDot(M3, chia(st.m3_04, { PTC: 15 }), T);
  ghiDot(M3, chia(st.m3_05, { PTC: 25 }), T);
  ghiDot(M4, chia(st.m4_01, { PTC: 40 }), T);
  ghiDot(M5, chia(st.m5, { PTC: 33 }), T);
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
});

test('lũy kế = tổng tử / tổng mẫu của các ngày có số liệu (khác trung bình tỷ lệ ngày); ngày 04 chưa nhập bị loại; ngày 03 không file', async () => {
  const r1 = await kq(`?bcvh=${M}`);
  assert.equal(r1.status, 200);
  const b = r1.body;
  assert.equal(b.ngay, D('06'));
  assert.equal(b.thang, '2026-10');
  const L = b.luy_ke;
  assert.deepEqual([L.tu_ngay, L.den_ngay, L.thang], [D('01'), D('06'), '2026-10']);
  // ngày 01 (20), 02 (30), 05 (25), 06 (60); ngày 04 (40) co_tt = 0 bị loại cả tử lẫn mẫu
  assert.equal(L.mau_so, 135);
  assert.equal(L.theo_trang_thai.PTC.so, 10 + 30 + 5 + 36);
  assert.equal(L.theo_trang_thai.PTC.ty_le, 0.6);
  assert.notEqual(L.theo_trang_thai.PTC.ty_le, ratio4((0.5 + 1 + 0.2 + 0.6) / 4, 1), 'không phải trung bình tỷ lệ ngày (0,575)');
  assert.equal(L.theo_trang_thai.PKTC.so, 5 + 6);
  assert.equal(L.theo_trang_thai.CHUYEN_HOAN.so, 3);
  assert.equal(L.theo_trang_thai.LAC_HUONG.so, 3);
  assert.equal(L.theo_trang_thai.CHUA_CO_TT.so, 10 + 0 + 15 + 12);
  assert.equal(L.so_ngay_co_so_lieu, 4);
  assert.equal(L.so_ngay_co_file, 5);
  assert.equal(L.so_ngay_trong_khoang, 6);
  assert.ok(L.so_ngay_co_so_lieu < L.so_ngay_trong_khoang);
  // chuỗi: đủ mọi ngày 01..06
  assert.deepEqual(b.theo_ngay.map((x) => x.ngay), ['01', '02', '03', '04', '05', '06'].map(D));
  assert.deepEqual(ngayOf(b, '01'), {
    ngay: D('01'), mau_so: 20, ptc: 0.5, ty_le_pktc: 0, ty_le_chuyen_hoan: 0, ty_le_lac_huong: 0, ty_le_chua_co_tt: 0.5, co_so_lieu_phat: true
  });
  assert.equal(ngayOf(b, '06').ptc, 0.6);
  assert.equal(ngayOf(b, '06').ty_le_pktc, 0.1);
});

test('ngày thiếu file và ngày có file nhưng chưa nhập phát: tỷ lệ null (ngắt đường), không kéo PTC tháng xuống', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  const d3 = ngayOf(b, '03');
  assert.equal(d3.mau_so, 0);
  assert.equal(d3.co_so_lieu_phat, false);
  for (const k of ['ptc', 'ty_le_pktc', 'ty_le_chuyen_hoan', 'ty_le_lac_huong', 'ty_le_chua_co_tt']) assert.equal(d3[k], null, `03 ${k}`);
  const d4 = ngayOf(b, '04');
  assert.equal(d4.mau_so, 40, 'ngày 04 có hàng đến');
  assert.equal(d4.co_so_lieu_phat, false);
  for (const k of ['ptc', 'ty_le_pktc', 'ty_le_chuyen_hoan', 'ty_le_lac_huong', 'ty_le_chua_co_tt']) assert.equal(d4[k], null, `04 ${k}`);
  // nếu ngày 04 bị tính vào lũy kế, PTC sẽ là 81/175 = 0,4629
  assert.equal(b.luy_ke.theo_trang_thai.PTC.ty_le, 0.6);
});

test('SHBG đến hai ngày: lũy kế cộng TỪNG ngày (đếm hai lần), không như truy vấn một khoảng', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  const tong = b.theo_ngay.filter((x) => x.co_so_lieu_phat).reduce((a, x) => a + x.mau_so, 0);
  assert.equal(b.luy_ke.mau_so, tong);
  const rieng = ctx.db.prepare(`SELECT COUNT(DISTINCT tracking_no) AS n FROM arrival_items WHERE receiver_code = ? AND arrival_date BETWEEN ? AND ? AND arrival_date <> ?`)
    .get(M, D('01'), D('06'), D('04')).n;
  assert.equal(b.luy_ke.mau_so, rieng + 1, 'SHBG đến lại được đếm ở cả hai ngày');
});

test('chênh lệch: theo giá trị đã làm tròn hiển thị; hướng tăng / giảm / ngang; backend không quyết tốt xấu', async () => {
  const b = (await kq(`?bcvh=${M}`)).body;
  assert.deepEqual(Object.keys(b.chenh), ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT']);
  assert.deepEqual(b.chenh.PTC, { chenh_diem: 0, huong: 'ngang' }); // 60,0 − 60,0
  assert.deepEqual(b.chenh.PKTC, { chenh_diem: 1.8, huong: 'tang' }); // 10,0 − 8,2 (11/135 = 0,0815)
  assert.deepEqual(b.chenh.LAC_HUONG, { chenh_diem: 2.8, huong: 'tang' }); // 5,0 − 2,2
  assert.deepEqual(b.chenh.CHUYEN_HOAN, { chenh_diem: 2.8, huong: 'tang' });
  assert.deepEqual(b.chenh.CHUA_CO_TT, { chenh_diem: -7.4, huong: 'giam' }); // 20,0 − 27,4
});

test('làm tròn: chênh-từ-gốc khác chênh-từ-hiển-thị thì backend trả theo giá trị hiển thị (56,8 − 61,2 = −4,4)', () => {
  // gốc 0,5684 − 0,6115 = −4,31 điểm (−4,3), nhưng hiển thị 56,8 và 61,2 -> −4,4
  assert.deepEqual(PD.chenhHienThi(0.5684, 0.6115), { chenh_diem: -4.4, huong: 'giam' });
  assert.equal(PD.dec1(0.5684), 568);
  assert.equal(PD.dec1(0.6115), 612); // nửa lên
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

test('chỉ trả chênh khi >= 2 ngày có số liệu và mẫu số hôm nay >= 50 (49 -> null, 50 -> có)', async () => {
  // M2: ngày 05 (40) + 06 (50): 2 ngày, hôm nay 50 = sàn -> có chênh
  const a = (await kq(`?bcvh=${M2}`)).body;
  assert.equal(a.luy_ke.so_ngay_co_so_lieu, 2);
  assert.ok(a.chenh && a.chenh.PTC.chenh_diem !== undefined, 'mẫu số hôm nay 50');
  // M3: ngày 04 (30) + 05 (49): 2 ngày nhưng hôm nay 49 -> null
  const b = (await kq(`?bcvh=${M3}`)).body;
  assert.equal(b.luy_ke.so_ngay_co_so_lieu, 2);
  assert.equal(ngayOf({ theo_ngay: b.theo_ngay }, '05').mau_so, 49);
  assert.equal(b.chenh, null);
  // M xem đến ngày 05: 3 ngày có số liệu nhưng mẫu số hôm nay 25 -> null
  const c = (await kq(`?bcvh=${M}&ngay=${D('05')}`)).body;
  assert.equal(c.luy_ke.so_ngay_co_so_lieu, 3);
  assert.equal(c.chenh, null);
});

test('ngày 01 (một ngày): chênh = null; ngày dữ liệu cuối tháng trước khi ngày 01 chưa về: lũy kế vẫn là tháng trước', async () => {
  const a = (await kq(`?bcvh=${M4}`)).body;
  assert.equal(a.ngay, D('01'));
  assert.equal(a.theo_ngay.length, 1);
  assert.equal(a.luy_ke.so_ngay_co_so_lieu, 1);
  assert.equal(a.luy_ke.mau_so, 80);
  assert.equal(a.luy_ke.theo_trang_thai.PTC.ty_le, 0.5);
  assert.equal(a.chenh, null);
  const c = (await kq(`?bcvh=${M5}`)).body;
  assert.equal(c.ngay, '2026-09-30');
  assert.equal(c.thang, '2026-09');
  assert.equal(c.luy_ke.tu_ngay, '2026-09-01');
  assert.equal(c.luy_ke.den_ngay, '2026-09-30');
  assert.equal(c.theo_ngay.length, 30);
  assert.equal(c.luy_ke.so_ngay_trong_khoang, 30);
  assert.equal(c.luy_ke.so_ngay_co_file, 1);
  assert.equal(c.luy_ke.mau_so, 55);
  assert.equal(c.luy_ke.theo_trang_thai.PTC.ty_le, 0.6);
});

test('mẫu số 0: mọi tỷ lệ null, không NaN; BCVH chưa có file nào: không có ngày dữ liệu', async () => {
  const z = (await kq(`?bcvh=${M3}&ngay=${D('03')}`)).body; // M3 chưa có hàng ngày 01–03
  assert.equal(z.luy_ke.mau_so, 0);
  assert.equal(z.luy_ke.so_ngay_co_so_lieu, 0);
  for (const m of TT5) assert.equal(z.luy_ke.theo_trang_thai[m].ty_le, null, m);
  assert.equal(z.chenh, null);
  assert.ok(z.theo_ngay.every((x) => x.ptc === null && x.mau_so === 0));
  assert.ok(!JSON.stringify(z).includes('NaN'));
  const n = (await kq(`?bcvh=${M6}`)).body;
  assert.equal(n.ngay, null);
  assert.equal(n.luy_ke, null);
  assert.deepEqual(n.theo_ngay, []);
  assert.equal(n.chenh, null);
});

test('bcvh=all: dùng NGÀY CHUNG (BCVH lệch ngày nằm ngoài tập cho cả tháng); lũy kế khớp tổng thẻ ngày', async () => {
  const b = (await kq('')).body;
  assert.equal(b.bcvh, 'all');
  assert.equal(b.ngay, D('06'));
  assert.equal(b.so_bcvh_trong_tong, 2, 'chỉ M và M2 có dữ liệu đến ngày 06');
  assert.deepEqual(b.bcvh_ngoai_tong.map((x) => x.ma).sort(), [M3, M4, M5, M6].sort());
  const L = b.luy_ke;
  // ngày 01: M 20; 02: M 30; 04: M 40 (chưa nhập, loại); 05: M 25 + M2 40; 06: M 60 + M2 50. M3, M4, M5 không vào dù có số liệu.
  assert.equal(L.mau_so, 20 + 30 + 65 + 110);
  assert.equal(L.theo_trang_thai.PTC.so, 10 + 30 + (5 + 20) + (36 + 45));
  assert.equal(L.theo_trang_thai.PTC.ty_le, ratio4(146, 225));
  assert.equal(L.so_ngay_co_so_lieu, 4);
  assert.equal(ngayOf(b, '06').mau_so, 110);
  // khớp thẻ ngày hôm nay
  const the = (await call('/api/arrivals/dashboard/ket-qua-phat', 'admin')).body;
  assert.equal(the.ngay, b.ngay);
  assert.equal(the.mau_so, ngayOf(b, '06').mau_so);
  assert.equal(the.ptc, ngayOf(b, '06').ptc);
  // chọn ngày rõ ràng: T = mọi BCVH
  const e = (await kq(`?bcvh=all&ngay=${D('05')}`)).body;
  assert.equal(e.so_bcvh_trong_tong, undefined);
  assert.equal(ngayOf(e, '05').mau_so, 25 + 40 + 49);
});

test('một BCVH: M và M2 độc lập, phạm vi trả về', async () => {
  const a = (await kq(`?bcvh=${M2}`)).body;
  assert.deepEqual(a.pham_vi, [M2]);
  assert.equal(a.luy_ke.mau_so, 90);
  assert.equal(a.luy_ke.theo_trang_thai.PTC.so, 65);
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

test('hồi quy: ket-qua-phat vẫn 200 cho TIVI phạm vi all, không có khoá của endpoint tháng', async () => {
  const b = (await call('/api/arrivals/dashboard/ket-qua-phat', 'tivi')).body;
  for (const k of ['ptc', 'nguong', 'co_so_lieu_phat', 'xep_hang_bcvh', 'chua_du_du_lieu']) assert.ok(k in b, k);
  assert.ok(!('luy_ke' in b) && !('theo_ngay' in b) && !('chenh' in b));
  assert.deepEqual(Object.keys(b.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'san_xep_hang_bcvh'], 'khối nguong của ket-qua-phat không đổi');
});

// Ca này ĐỔI dữ liệu: để cuối file.
test('nhập muộn làm đổi số ngày cũ; cache bị vô hiệu sau đợt nhập mới và sau hoàn tác', async () => {
  const codes = [M];
  const p = { bcvh: M, ngay: null };
  const a1 = PD.ketQuaPhatThang(ctx.db, codes, p);
  const a2 = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(a1, a2, 'lần gọi thứ hai trong 60 giây lấy từ cache (cùng đối tượng)');
  assert.equal(PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }) === a1, false, 'cache: false luôn tính lại');
  assert.deepEqual(PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }), a1, 'cùng dữ liệu thì cùng kết quả');
  // hết hạn 60 giây
  const muon = PD.ketQuaPhatThang(ctx.db, codes, p, { now: Date.now() + 61 * 1000 });
  assert.notEqual(muon, a1, 'quá 60 giây tính lại');

  const http1 = (await kq(`?bcvh=${M}`)).body;
  assert.equal(ngayOf(http1, '05').ptc, 0.2);
  assert.equal(http1.luy_ke.theo_trang_thai.PTC.so, 81);
  // Nhập muộn: 5 SHBG ngày 05 (còn chưa có trạng thái) -> PTC; ngay lập tức (trong 60 giây) số ngày cũ phải đổi
  const bid = ghiDot(M, st.m05.slice(10, 15).map((s) => [s, 'PTC']), '2026-10-08T02:00:00Z');
  const http2 = (await kq(`?bcvh=${M}`)).body;
  assert.equal(ngayOf(http2, '05').ptc, 0.4, '10/25 sau khi nhập muộn');
  assert.equal(http2.luy_ke.theo_trang_thai.PTC.so, 86);
  assert.equal(ngayOf(http2, '06').ptc, 0.6, 'ngày khác không đổi');
  const a3 = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.notEqual(a3, a1, 'đợt nhập mới vô hiệu cache');
  assert.equal(ngayOf(a3, '05').ptc, 0.4);
  // hoàn tác đợt (chỉ đặt cờ như nghiệp vụ): chữ ký đổi -> tính lại
  ctx.db.prepare("UPDATE phat_batches SET trang_thai = 'da_hoan_tac', hoan_tac_luc = '2026-10-08T03:00:00Z' WHERE id = ?").run(bid);
  assert.notEqual(PD.ketQuaPhatThang(ctx.db, codes, p), a3, 'hoàn tác vô hiệu cache');
});

// Cache theo từng (BCVH, ngày) (DASH-12b-2): đổi dữ liệu chỉ tính lại phần bị ảnh hưởng, kết quả luôn bằng bản không cache. Ca này ĐỔI dữ liệu: để cuối file.
test('cache theo (BCVH, ngày): đợt nhập của BCVH khác không tính lại; đợt nhập của một BCVH chỉ tính lại BCVH đó; file mới tính lại các ngày liên quan của mọi BCVH', () => {
  const codes = VALID_BCVH_CODES;
  const p = { bcvh: 'all', ngay: null }; // ngày chung 06 -> tập [M, M2]
  const bang = (a, b) => assert.deepEqual(a, b, 'kết quả có cache == không cache');
  const dem = () => PD.soLanDemNgay();
  const them = (bcvh) => ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, 0)').run(bcvh, ids.admin, new Date().toISOString().replace(/\.\d+Z$/, 'Z'));

  PD.xoaCachePhatThang();
  let c0 = dem();
  const a = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem() - c0, 5 + 2, 'lần đầu: mỗi (BCVH, ngày có file) một lần: M 5 ngày, M2 2 ngày');

  // đợt nhập của BCVH NGOÀI tập (M3): chữ ký toàn cục đổi -> tính lại kết quả nhưng KHÔNG tính lại ngày nào
  them(M3);
  c0 = dem();
  const b = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.notEqual(b, a, 'kết quả được dựng lại');
  assert.equal(dem() - c0, 0, 'không có (BCVH, ngày) nào đổi chữ ký');
  bang(b, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));

  // đợt nhập của M2: chỉ M2 (2 ngày) tính lại
  them(M2);
  c0 = dem();
  const c = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem() - c0, 2, 'chỉ các ngày có file của M2');
  bang(c, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));

  // một dòng file mới (trạng thái EMPTY: không đổi số liệu) với file_date 06: ảnh hưởng ngày 03..06 của mọi BCVH (arrival_date ∈ [file − 3, file + 1])
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, status) VALUES (?, 'FILE_GIA_DAY_06.csv', ?, '235959', 1, 'sha-gia-day-06', 0, 0, 'EMPTY')").run(M3, D('06'));
  c0 = dem();
  const d = PD.ketQuaPhatThang(ctx.db, codes, p);
  assert.equal(dem() - c0, 3 + 2, 'M: ngày 04, 05, 06; M2: ngày 05, 06 (các ngày file nằm trong [ngày − 1, ngày + 3] của file mới)');
  bang(d, PD.ketQuaPhatThang(ctx.db, codes, p, { cache: false }));
  assert.deepEqual(d.luy_ke, a.luy_ke, 'số liệu không đổi vì file mới không có dòng nào');
  // ngày không dính (01, 02): vẫn từ cache
  c0 = dem();
  PD.ketQuaPhatThang(ctx.db, [M], { bcvh: M, ngay: D('02') });
  assert.equal(dem() - c0, 0, 'ngày 01, 02 của M: file mới (06) không nằm trong cửa sổ [ngày − 1, ngày + 3] -> vẫn từ cache');
});
