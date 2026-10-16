// ==========================================
// Test DASH-9b: tong-quan-den trả thêm `chuyen_chieu` {buu_gui, ty_le, tu_gio, da_toi_gio} = bưu gửi có giờ đến (arrival_at R2) từ 10:00:00 trở đi,
// cùng cấu trúc / ngày / tập T / công thức A (một BCVH) hoặc B (bcvh=all) như `sau_15h` (không đổi). Gọi thẳng dashboardDenQuery.tongQuanDen trên DB tạm; dữ liệu GIẢ.
// ==========================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const den = require('../server/lib/dashboardDenQuery');
const { GIO_CHUYEN_CHIEU } = require('../server/config/dashboard-thresholds');

const PORT = 5940;
const [M, M2, M3, , M5, M6] = VALID_BCVH_CODES; // M3 chưa có file nào
let ctx;
let workDir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = (k) => `ZZ9B${k}VN`;
function r(rc, day, hms, shbg) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường thư giả', SHBG: shbg, So_hieu_BD10: '',
    'Thời gian XN túi': `2026-10-${day} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
// 16/10 (ngày chung): M: A1 09:59:59, A2 10:00:00, A3 11:00, A4 15:30, E 09:00 (E còn ở M2 lúc 11:00); M2: E 11:00, F 14:41; M5: G 09:34.
// 15/10: M6 (BCVH chậm, ngoài tập T): H 12:00.
const ROWS = [
  r(M, '16', '09:59:59', sh('A1')), r(M, '16', '10:00:00', sh('A2')), r(M, '16', '11:00:00', sh('A3')), r(M, '16', '15:30:00', sh('A4')), r(M, '16', '09:00:00', sh('E')),
  r(M2, '16', '11:00:00', sh('E')), r(M2, '16', '14:41:00', sh('F')),
  r(M5, '16', '09:34:00', sh('G')),
  r(M6, '15', '12:00:00', sh('H'))
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

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-chuyen-chieu-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-chuyen-chieu-${Date.now()}.db` });
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

test('hằng số: GIO_CHUYEN_CHIEU = 10, nằm ngoài `nguong` (khóa của nguong không đổi)', () => {
  assert.equal(GIO_CHUYEN_CHIEU, 10);
  assert.ok(!('GIO_CHUYEN_CHIEU' in tq({ bcvh: M }).nguong));
});

test('một BCVH (công thức A): ranh giới 09:59:59 không tính / 10:00:00 tính; ty_le đúng; sau_15h không đổi', () => {
  const b = tq({ bcvh: M });
  assert.equal(b.san_luong.buu_gui, 5);
  assert.deepEqual(b.chuyen_chieu, { buu_gui: 3, ty_le: 0.6, tu_gio: 10, da_toi_gio: true }, 'A2 (10:00:00), A3, A4; A1 (09:59:59) và E (09:00) không');
  assert.deepEqual(b.sau_15h, { buu_gui: 1, ty_le: 0.2, tu_gio: 15, da_toi_gio: true }, 'chỉ A4 (15:30)');
  assert.deepEqual(Object.keys(b.chuyen_chieu), Object.keys(b.sau_15h), 'cùng cấu trúc và thứ tự khóa với sau_15h');
});

test('da_toi_gio theo giờ dữ liệu mới nhất: 09:34 -> false, 14:41 -> true', () => {
  const m5 = tq({ bcvh: M5 });
  assert.equal(m5.den_luc, '2026-10-16 09:34:00');
  assert.deepEqual(m5.chuyen_chieu, { buu_gui: 0, ty_le: 0, tu_gio: 10, da_toi_gio: false });
  const m2 = tq({ bcvh: M2 });
  assert.equal(m2.den_luc, '2026-10-16 14:41:00');
  assert.deepEqual(m2.chuyen_chieu, { buu_gui: 2, ty_le: 1, tu_gio: 10, da_toi_gio: true }, 'M2: E (11:00 là mốc sớm nhất TẠI M2 khi xét riêng) và F');
});

test('bcvh=all (công thức B): SHBG ở 2 BCVH chỉ đếm một lần theo giờ đến sớm nhất; BCVH ngoài tập T không vào', () => {
  const b = tq({});
  assert.equal(b.ngay_du_lieu, '2026-10-16');
  assert.equal(b.san_luong.buu_gui, 7, 'A1, A2, A3, A4, E, F, G (E một lần)');
  // E: M 09:00 và M2 11:00 -> mốc sớm nhất 09:00 -> KHÔNG thuộc chuyến chiều dù M2 nhận lúc 11:00
  assert.deepEqual(b.chuyen_chieu, { buu_gui: 4, ty_le: 0.5714, tu_gio: 10, da_toi_gio: true }, 'A2, A3, A4, F; H của BCVH chậm (15/10 12:00) không tính');
  assert.ok(b.bcvh_ngoai_tong.some((x) => x.ma === M6), 'M6 ngoài tập T');
  assert.deepEqual(b.sau_15h, { buu_gui: 1, ty_le: 0.1429, tu_gio: 15, da_toi_gio: true });
  // công thức A sẽ cho 3 + 2 + 0 = 5 và đếm E ở M2; tổng B chỉ 4
  assert.equal(tq({ bcvh: M }).chuyen_chieu.buu_gui + tq({ bcvh: M2 }).chuyen_chieu.buu_gui + tq({ bcvh: M5 }).chuyen_chieu.buu_gui, 5);
});

test('BCVH chậm xem riêng vẫn tính theo ngày của nó; BCVH chưa có dữ liệu: buu_gui 0, ty_le null (không NaN), da_toi_gio false', () => {
  const m6 = tq({ bcvh: M6 });
  assert.equal(m6.ngay_du_lieu, '2026-10-15');
  assert.deepEqual(m6.chuyen_chieu, { buu_gui: 1, ty_le: 1, tu_gio: 10, da_toi_gio: true });
  const m3 = tq({ bcvh: M3 });
  assert.equal(m3.san_luong.buu_gui, 0);
  assert.deepEqual(m3.chuyen_chieu, { buu_gui: 0, ty_le: null, tu_gio: 10, da_toi_gio: false });
  assert.equal(m3.chuyen_chieu.ty_le, m3.sau_15h.ty_le, 'cùng quy ước với sau_15h khi mẫu số 0');
});
