// ==========================================
// Test DASH-1 (#73): Dashboard «Cần điều hành ngay hôm nay» — phần «đến».
// GET /api/arrivals/dashboard/tong-quan-den, /viec-can-lam, /phuong-xa-tang + hằng số mức (server/config/dashboard-thresholds.js).
// DASH-6b (#76): hàng đi ngoài thay hàng nặng; hai mốc so sánh hôm qua / cùng thứ tuần trước. Đánh giá mức sản lượng có sàn + giờ: dashboard-den-danh-gia.test.js.
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
const den = require('../server/lib/dashboardDenQuery');
const { DASHBOARD_DEN_THRESHOLDS: TH } = require('../server/config/dashboard-thresholds');

const PORT = 5920;
const M = '533140'; // BCVH chính: file các ngày 20, 19, 18, 13/10 (thiếu 06/10, 29/09, 22/09)
const M2 = '535470'; // chỉ có file ngày 20/10 -> so sánh = null
const D = '2026-10-20';
const USERS = {
  admin: { hrm: 'DD_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'DD_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvhM: { hrm: 'DD_GDVH1', pass: 'Gdvh@123', role: 'GDVH' }, // được giao 533140
  gdvhNone: { hrm: 'DD_GDVH0', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'DD_STAFF', pass: 'Staff@123', role: 'STAFF' }
};
const tokens = {};
let ctx;
let workDir;
let seq = 0;

const b10 = (lap, nhan, n) => `${lap}${nhan}${String(n).padStart(7, '0')}`; // 19 ký tự giả
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = (k) => `ZZ7D${k}VN`;
const ts = (v) => (v === undefined ? 'NULL' : `2026-10-${v.slice(0, 2)} ${v.slice(3)}`);
// o: sh, rc, bag, itm, xnd, ttkt ('DD HH:mm:ss'), bd10, bd8, w (gam), ward, fd (ngày file 'DD' cho dòng không có mốc)
function r(o) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: o.rc || M, Ten_duong_thu: 'Đường thư giả', SHBG: o.sh, So_hieu_BD10: o.bd10 || '',
    'Thời gian XN túi': ts(o.bag), 'Thời gian XN BG': ts(o.itm), Ngay_gio_XND_BD10: ts(o.xnd), Ngay_gio_XND_BD10_tai_TTKT: ts(o.ttkt),
    So_hieu_BD8: o.bd8 !== undefined ? o.bd8 : `P${seq}`, Khoi_luong_thuc_te: String(o.w ?? 500), Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: o.ward || 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử', _fd: o.fd
  };
}

const B1 = b10('530100', M, 1); // BD10 đến M: S1 (XNĐ 20/10)
const B2 = b10('531120', M, 2); // BD10 đến M: S3 (chỉ XN túi 20/10)
const B3 = b10('530100', M, 3); // BD10 đến M không có mốc nào (dùng cho bưu gửi chưa nhận)
// Hàng đi ngoài (#76) = SHBG có ≥ 1 dòng BD8 (cắt khoảng trắng, viết hoa) = SHBG; BD8 rỗng / BD8 của SHBG khác không tính.
const ROWS = [
  // ---- M, ngày 20/10 (hôm nay). Dữ liệu tới 16:00:00 (den_luc). Đi ngoài hôm nay: A2, A3, A5 (3/7).
  r({ sh: sh('A1'), bag: '20 08:00:00', xnd: '20 07:00:00', bd10: B1, w: 1999, bd8: sh('A2') }), // BD8 = SHBG của bưu gửi KHÁC -> không đi ngoài
  r({ sh: sh('A2'), bag: '20 09:00:00', bd10: B2, w: 2000, bd8: sh('A2') }), // BD8 = SHBG -> đi ngoài
  r({ sh: sh('A3'), bag: '20 14:59:59', w: 2001, bd8: sh('A3').toLowerCase() }), // 14:59:59 -> KHÔNG sau 15:00; BD8 viết thường (before() thêm khoảng trắng) -> đi ngoài
  r({ sh: sh('A4'), bag: '20 15:00:00', w: 0, ward: 'Phường Bình', bd8: '' }), // 15:00:00 -> sau 15:00; BD8 rỗng -> không đi ngoài
  r({ sh: sh('A5'), bag: '20 10:00:00', bd8: sh('A5'), ward: 'Phường Bình' }), // một bưu gửi, HAI lượt (BD8 khác); một dòng BD8 = SHBG, một dòng của túi khác -> đi ngoài (lẫn)
  r({ sh: sh('A5'), bag: '20 11:00:00', bd8: 'X2', ward: 'Phường Bình' }),
  r({ sh: sh('A6'), bag: '20 12:00:00', itm: '20 12:05:00', bd8: 'Y1', ward: 'Phường Chi' }), // hai dòng cùng (SHBG, BD10, BD8) -> 1 lượt
  r({ sh: sh('A6'), bag: '20 12:00:00', itm: '20 12:10:00', bd8: 'Y1', ward: 'Phường Chi' }),
  r({ sh: sh('A7'), bag: '20 16:00:00', ward: 'Phường Bình' }),
  // Chưa nhận tại BCVH (không mốc BCVH, có mốc lập BD10), trong file 20/10
  r({ sh: sh('N1'), bd10: B3, ttkt: '19 06:00:00', fd: '20' }), // BD10 đến, lập 19/10 -> đã chờ 1 ngày
  r({ sh: sh('N2'), bd10: b10(M, '531120', 4), ttkt: '20 06:00:00', fd: '20' }), // BD10 lập đi -> loại
  r({ sh: sh('N3'), bd10: '', ttkt: '20 06:00:00', fd: '20' }), // BD10 rỗng -> loại
  r({ sh: sh('N4'), bd10: B3, ttkt: '20 05:00:00', fd: '20' }), // BD10 đến, lập 20/10 -> chờ trong ngày
  // ---- M, 19/10 (hôm qua): một bưu gửi trước 16:00, một sau
  r({ sh: sh('Y1'), bag: '19 10:00:00', bd8: sh('Y1') }), r({ sh: sh('Y2'), bag: '19 17:00:00', bd8: sh('Y2') }), // Y2 sau 16:00: không tính
  // ---- M, 18/10 (hôm kia)
  r({ sh: sh('Z1'), bag: '18 09:00:00', ward: 'Phường Bình' }),
  // ---- M, 13/10 (cùng thứ, 1 tuần trước): 2 bưu gửi trước 16:00, 1 sau
  r({ sh: sh('W1'), bag: '13 09:00:00', bd8: sh('W1') }), r({ sh: sh('W2'), bag: '13 15:30:00' }), r({ sh: sh('W3'), bag: '13 16:30:00', bd8: sh('W3') }),
  // ---- M2, 20/10: 20 BD10 đến (19 có XNĐ, 1 không) -> 5% đúng ngưỡng "Trong ngày"; 1 bưu gửi chưa nhận lập 20/10
  ...Array.from({ length: 20 }, (_, i) => r({
    sh: sh(`K${String(i).padStart(2, '0')}`), rc: M2, bag: '20 08:00:00', bd10: b10('530100', M2, 10 + i), ...(i ? { xnd: '20 07:00:00' } : {})
  })),
  r({ sh: sh('KN'), rc: M2, bd10: b10('530100', M2, 99), ttkt: '20 06:00:00', fd: '20' })
];
const dayOfRow = (row) => {
  const t = [row['Thời gian XN túi'], row['Thời gian XN BG'], row.Ngay_gio_XND_BD10].find((x) => x !== 'NULL');
  return t ? t.slice(0, 10) : `2026-10-${row._fd}`;
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
const TQ = '/api/arrivals/dashboard/tong-quan-den';
const VIEC = '/api/arrivals/dashboard/viec-can-lam';
const PX = '/api/arrivals/dashboard/phuong-xa-tang';

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-dash-den-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dash-den-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec("INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử')");
  const ids = {};
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  replaceAssignedBcvh(ctx.db, ids.gdvhM, [M]);
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  // Chuẩn hoá cắt khoảng trắng: file nạp đã bỏ khoảng trắng hai đầu, nên đặt thẳng vào DB cho A3 (viết thường + khoảng trắng).
  ctx.db.prepare('UPDATE arrival_items SET bd8_no = ? WHERE tracking_no = ?').run(`  ${sh('A3').toLowerCase()} `, sh('A3'));
});

after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('hằng số mức điều hành: một file, giá trị tạm PO chốt 11/10/2026 (DASH-6b 14/10/2026: sàn 50 và giờ 12, bỏ hàng nặng và TB 4 tuần)', () => {
  assert.deepEqual(Object.keys(TH).sort(), ['BD10_CHUA_XND', 'CHUA_NHAN', 'GIO_BAT_DAU_DANH_GIA', 'GIO_MUON', 'LECH_SAN_LUONG', 'SAN_SO_SANH_PHUONG_XA', 'SAN_SO_SANH_TOI_THIEU']);
  assert.equal(TH.SAN_SO_SANH_TOI_THIEU, 50);
  assert.equal(TH.SAN_SO_SANH_PHUONG_XA, 10);
  assert.equal(TH.GIO_BAT_DAU_DANH_GIA, 12);
  assert.equal(TH.GIO_MUON, 15);
  assert.deepEqual(TH.BD10_CHUA_XND, { xu_ly_ngay_pct: 10, trong_ngay_pct: 5 });
  assert.deepEqual(TH.LECH_SAN_LUONG, { trong_ngay_pct: 15, xu_ly_ngay_pct: 25 });
  assert.equal(TH.CHUA_NHAN.xu_ly_ngay_tu_ngay, 1);
  assert.ok(Object.isFrozen(TH));
});

test('mức điều hành (thuần): ranh giới ">=" của BD10, lệch sản lượng so tuần trước, chưa nhận', () => {
  assert.equal(den.mucBd10(1, 10), 'xu_ly_ngay', '10%');
  assert.equal(den.mucBd10(999, 10000), 'trong_ngay', '9,99%');
  assert.equal(den.mucBd10(1, 20), 'trong_ngay', '5%');
  assert.equal(den.mucBd10(499, 10000), 'binh_thuong', '4,99%');
  assert.equal(den.mucBd10(0, 0), 'binh_thuong', 'không có BD10 đến');
  assert.equal(den.mucSanLuong(125, 100), 'xu_ly_ngay', '+25%');
  assert.equal(den.mucSanLuong(75, 100), 'xu_ly_ngay', '−25%');
  assert.equal(den.mucSanLuong(124, 100), 'trong_ngay', '+24%');
  assert.equal(den.mucSanLuong(115, 100), 'trong_ngay', '+15%');
  assert.equal(den.mucSanLuong(85, 100), 'trong_ngay', '−15%');
  assert.equal(den.mucSanLuong(114, 100), 'binh_thuong');
  assert.equal(den.mucSanLuong(10, 0), null, 'mốc 0 -> null');
  assert.equal(den.mucSanLuong(10, null), null, 'không có tuần trước -> null');
  assert.equal(den.mucChuaNhan(0, 0), 'binh_thuong');
  assert.equal(den.mucChuaNhan(3, 0), 'trong_ngay');
  assert.equal(den.mucChuaNhan(3, 1), 'xu_ly_ngay');
});

test('đánh giá sản lượng (thuần): thiếu tuần trước / mốc dưới sàn 50 / chưa tới 12:00 -> không gắn mức; đủ điều kiện -> ngưỡng 15% / 25%', () => {
  const dg = den.danhGiaSanLuong;
  const chua = (ly_do) => ({ trang_thai: 'chua_du_du_lieu', ly_do, muc: null });
  assert.deepEqual(dg(500, null, 18), chua('thieu_tuan_truoc'));
  assert.deepEqual(dg(500, 49, 18), chua('moc_duoi_san'), 'mốc 49 < 50');
  assert.deepEqual(dg(500, 2, 18), chua('moc_duoi_san'), 'hồi quy: tuần trước là ngày lẻ chỉ 2 bưu gửi');
  assert.deepEqual(dg(500, 100, 11), chua('chua_toi_gio'), '11:xx chưa tới 12:00');
  assert.deepEqual(dg(500, 100, null), chua('chua_toi_gio'));
  assert.deepEqual(dg(500, 49, 11), chua('moc_duoi_san'), 'nhiều lý do: theo thứ tự thiếu tuần trước -> dưới sàn -> chưa tới giờ');
  assert.deepEqual(dg(60, 50, 12), { trang_thai: 'da_danh_gia', ly_do: null, muc: 'trong_ngay' }, 'mốc đúng 50 và đúng 12h được đánh giá (+20%)');
  assert.equal(dg(125, 100, 15).muc, 'xu_ly_ngay');
  assert.equal(dg(75, 100, 15).muc, 'xu_ly_ngay');
  assert.equal(dg(115, 100, 15).muc, 'trong_ngay');
  assert.equal(dg(114, 100, 15).muc, 'binh_thuong');
  assert.equal(dg(114, 100, 15).trang_thai, 'da_danh_gia');
});

test('tong-quan-den một BCVH: lượt / bưu gửi, hàng đi ngoài, sau 15:00 ranh giới 15:00:00, so hôm qua / tuần trước cùng giờ dữ liệu', async () => {
  const res = await api(`${TQ}?bcvh=${M}`, 'ttvh');
  assert.equal(res.status, 200);
  const b = res.body;
  assert.deepEqual(Object.keys(b), ['bcvh', 'bcvh_goi_y', 'ngay_du_lieu', 'cung_ngay_du_lieu', 'den_luc', 'nap_luc', 'nguong',
    'san_luong', 'hang_di_ngoai', 'sau_15h', 'bcvh_can_chu_y', 'theo_bcvh']);
  assert.equal(b.bcvh, M);
  assert.equal(b.ngay_du_lieu, D, 'mặc định = ngày file mới nhất của BCVH');
  assert.equal(b.den_luc, `${D} 16:00:00`);
  assert.match(b.nap_luc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  // 7 bưu gửi; 8 lượt (A5 hai BD8 khác nhau; A6 hai dòng cùng SHBG/BD10/BD8 chỉ 1 lượt)
  assert.equal(b.san_luong.buu_gui, 7);
  assert.equal(b.san_luong.luot, 8);
  // hôm qua tới 16:00 (giờ DỮ LIỆU của hôm nay, không phải đồng hồ máy) -> 1 (Y2 lúc 17:00 không tính); cùng thứ tuần trước: 13/10 tới 16:00 -> 2 (W3 lúc 16:30 không tính)
  assert.deepEqual(b.san_luong.so_hom_qua_cung_gio, { gia_tri: 1, chenh_pct: null, so_bcvh: 1 });
  assert.deepEqual(b.san_luong.so_tuan_truoc_cung_gio, { gia_tri: 2, chenh_pct: null, so_bcvh: 1 });
  assert.ok(!('so_tb_4_tuan_cung_thu' in b.san_luong) && !('hang_nang' in b));
  // đi ngoài: A2, A3 (BD8 viết thường + khoảng trắng), A5 (một dòng BD8 = SHBG, một dòng của túi khác); A1 (BD8 của bưu gửi khác), A4 (BD8 rỗng), A6, A7 không. Mẫu số = 7 bưu gửi đến.
  // Hôm qua: Y1 đi ngoài (1/1 = 100%); tuần trước: W1 đi ngoài, W2 không (1/2 = 50%). Mốc dưới sàn 50 bưu gửi nên chenh_* = null (số chênh đủ sàn: dashboard-den-danh-gia.test.js).
  assert.deepEqual(b.hang_di_ngoai, {
    buu_gui: 3, ty_le: 0.4286, mau_so: 7,
    so_hom_qua_cung_gio: { buu_gui: 1, ty_le: 1, mau_so: 1, chenh_diem: null, so_bcvh: 1 },
    so_tuan_truoc_cung_gio: { buu_gui: 1, ty_le: 0.5, mau_so: 2, chenh_diem: null, so_bcvh: 1 }
  });
  // sau 15:00: A4 (15:00:00), A7 (16:00); A3 (14:59:59) không
  assert.deepEqual(b.sau_15h, { buu_gui: 2, ty_le: 0.2857, tu_gio: 15, da_toi_gio: true });
  const row = b.theo_bcvh[0];
  assert.equal(b.theo_bcvh.length, 1);
  assert.equal(row.ten, 'BCVH Thuận Hóa');
  assert.deepEqual(row.so_tuan_truoc, { gia_tri: 2, chenh_pct: null });
  assert.deepEqual(row.so_hom_qua, { gia_tri: 1, chenh_pct: null });
  assert.ok(!('so_tb_4_tuan' in row));
  // tuần trước chỉ 2 bưu gửi (< sàn 50) -> không gắn mức sản lượng dù lệch +250%
  assert.deepEqual(row.danh_gia_san_luong, { trang_thai: 'chua_du_du_lieu', ly_do: 'moc_duoi_san' });
  // chưa nhận: N1 (chờ 1 ngày), N4 (trong ngày); N2 lập đi, N3 BD10 rỗng bị loại
  assert.deepEqual(row.chua_nhan, { buu_gui: 2, cho_tu_1_ngay: 1, cho_lau_nhat_ngay: 1 });
  assert.deepEqual(row.bd10_chua_xnd, { so: 1, tong: 2, ty_le: 0.5 });
  assert.deepEqual(row.muc_chi_tiet, { san_luong: null, chua_nhan: 'xu_ly_ngay', bd10_chua_xnd: 'xu_ly_ngay' });
  assert.equal(row.muc, 'xu_ly_ngay');
  assert.deepEqual(b.bcvh_can_chu_y, { so: 1, tong: 1 });
});

test('tong-quan-den all: đủ 6 BCVH; thiếu dữ liệu so sánh -> null (không 0); tổng chỉ so trên BCVH có mốc; BCVH chưa có file', async () => {
  const b = (await api(TQ, 'admin')).body;
  assert.equal(b.bcvh, 'all');
  assert.equal(b.theo_bcvh.length, 6);
  const m2 = b.theo_bcvh.find((x) => x.ma === M2);
  assert.equal(m2.san_luong.buu_gui, 20);
  assert.equal(m2.so_hom_qua, null, 'M2 không có file 19/10');
  assert.equal(m2.so_tuan_truoc, null);
  assert.equal(m2.muc_chi_tiet.san_luong, null);
  assert.deepEqual(m2.danh_gia_san_luong, { trang_thai: 'chua_du_du_lieu', ly_do: 'thieu_tuan_truoc' });
  assert.deepEqual(m2.bd10_chua_xnd, { so: 1, tong: 20, ty_le: 0.05 });
  assert.equal(m2.muc_chi_tiet.bd10_chua_xnd, 'trong_ngay', '5% đúng ngưỡng');
  assert.deepEqual(m2.chua_nhan, { buu_gui: 1, cho_tu_1_ngay: 0, cho_lau_nhat_ngay: 0 });
  assert.equal(m2.muc, 'trong_ngay');
  const none = b.theo_bcvh.find((x) => x.ma === '537220');
  assert.deepEqual([none.co_du_lieu, none.ngay_du_lieu, none.muc, none.so_hom_qua], [false, null, null, null]);
  assert.equal(b.san_luong.buu_gui, 27);
  assert.deepEqual(b.san_luong.so_hom_qua_cung_gio, { gia_tri: 1, chenh_pct: null, so_bcvh: 1 }, 'chỉ M có hôm qua');
  assert.deepEqual(b.san_luong.so_tuan_truoc_cung_gio, { gia_tri: 2, chenh_pct: null, so_bcvh: 1 }, 'chỉ M có tuần trước; tử và mẫu cùng tập BCVH (M: 7 so với 2)');
  assert.deepEqual([b.hang_di_ngoai.buu_gui, b.hang_di_ngoai.mau_so, b.hang_di_ngoai.so_tuan_truoc_cung_gio.so_bcvh], [3, 27, 1], 'M2 không có đi ngoài');
  assert.deepEqual(b.bcvh_can_chu_y, { so: 2, tong: 6 });
  assert.equal(b.ngay_du_lieu, D);
  assert.equal(b.cung_ngay_du_lieu, true);
});

test('tong-quan-den: date không có dữ liệu -> số 0, so sánh null; tham số sai -> 400', async () => {
  const b = (await api(`${TQ}?bcvh=${M}&date=2026-10-22`, 'ttvh')).body;
  assert.equal(b.ngay_du_lieu, '2026-10-22');
  assert.equal(b.den_luc, null);
  assert.deepEqual([b.san_luong.buu_gui, b.san_luong.luot, b.san_luong.so_hom_qua_cung_gio, b.san_luong.so_tuan_truoc_cung_gio], [0, 0, null, null]);
  assert.deepEqual(b.hang_di_ngoai, { buu_gui: 0, ty_le: null, mau_so: 0, so_hom_qua_cung_gio: null, so_tuan_truoc_cung_gio: null });
  assert.equal(b.sau_15h.da_toi_gio, false);
  // Ngày cũ 19/10: dữ liệu tới 17:00; hôm qua 18/10 có file (Z1 09:00); cùng thứ tuần trước 12/10 không có file -> null
  const y = (await api(`${TQ}?bcvh=${M}&date=2026-10-19`, 'ttvh')).body;
  assert.equal(y.den_luc, '2026-10-19 17:00:00');
  assert.equal(y.san_luong.buu_gui, 2);
  assert.deepEqual(y.san_luong.so_hom_qua_cung_gio, { gia_tri: 1, chenh_pct: null, so_bcvh: 1 });
  assert.equal(y.san_luong.so_tuan_truoc_cung_gio, null);
  for (const qs of ['bcvh=999999', 'date=2026-02-30', 'gioi_han=3', 'bcvh=533140&bcvh=535470']) {
    assert.equal((await api(`${TQ}?${qs}`, 'ttvh')).status, 400, qs);
  }
});

test('viec-can-lam: chỉ "chưa nhận" và "BD10 chưa XNĐ" ở mức cần làm, Xử lý ngay trước, chỉ khoá và số', async () => {
  const b = (await api(VIEC, 'ttvh')).body;
  assert.deepEqual(b.items.map((i) => [i.muc, i.loai, i.bcvh]), [
    ['xu_ly_ngay', 'chua_nhan_tai_bcvh', M], ['xu_ly_ngay', 'bd10_chua_xnd', M],
    ['trong_ngay', 'chua_nhan_tai_bcvh', M2], ['trong_ngay', 'bd10_chua_xnd', M2]
  ]);
  const c = b.items[0];
  assert.deepEqual(Object.keys(c), ['muc', 'loai', 'bcvh', 'ten_bcvh', 'ngay', 'tieu_de_khoa', 'so_lieu', 'duong_dan']);
  assert.equal(c.tieu_de_khoa, 'chua_nhan_tai_bcvh.xu_ly_ngay');
  assert.deepEqual(c.so_lieu, { buu_gui: 2, cho_tu_1_ngay: 1, cho_lau_nhat_ngay: 1 });
  assert.deepEqual(c.duong_dan, { api: '/api/arrivals/not-received', receiver_code: M, from: D, to: D });
  assert.deepEqual(b.items[1].so_lieu, { chua_xnd: 1, tong_bd10_den: 2, ty_le: 0.5 });
  assert.deepEqual((await api(`${VIEC}?bcvh=537220`, 'ttvh')).body.items, [], 'BCVH chưa có dữ liệu');
});

test('phuong-xa-tang: cùng giờ trong ngày, xếp theo mức tăng so hôm qua (số tuyệt đối khi hôm qua = 0), thiếu ngày -> null, gioi_han', async () => {
  const b = (await api(`${PX}?bcvh=${M}`, 'ttvh')).body;
  assert.equal(b.gioi_han, 5);
  const rows = b.items.map((x) => [x.ten, x.hom_kia, x.hom_qua, x.hom_nay, x.tang_so_hom_qua, x.tang_so_hom_qua_pct, x.tuan_truoc_cung_gio, x.lech_so_tuan_truoc_pct]);
  assert.deepEqual(rows, [
    ['Phường Bình', 1, 0, 3, 3, null, 0, null], // A4, A5, A7; hôm qua 0 -> % null, vẫn xếp bằng số tuyệt đối
    ['Phường An', 0, 1, 3, 2, null, 2, null], // A1, A2, A3; hôm qua Y1 (Y2 sau 16:00 không tính); tuần trước 13/10: W1, W2
    ['Phường Chi', 0, 0, 1, 1, null, 0, null]
  ]);
  assert.equal((await api(`${PX}?bcvh=${M}&gioi_han=1`, 'ttvh')).body.items.length, 1);
  const m2 = (await api(`${PX}?bcvh=${M2}`, 'ttvh')).body.items;
  assert.deepEqual(m2.map((x) => [x.hom_qua, x.hom_kia, x.tang_so_hom_qua, x.tuan_truoc_cung_gio]), [[null, null, null, null]], 'M2 thiếu các ngày so sánh');
  assert.ok(!('tb_4_tuan_cung_thu' in b.items[0]) && !('so_tuan' in b.items[0]) && !('lech_so_tb_pct' in b.items[0]));
  assert.equal((await api(`${PX}?gioi_han=0`, 'ttvh')).status, 400);
  assert.equal((await api(`${PX}?gioi_han=51`, 'ttvh')).status, 400);
});

test('quyền: ADMIN / TTVH / GDVH xem mọi BCVH (GDVH chưa giao = ADMIN); bcvh_goi_y cho GDVH; STAFF 403; không token 401', async () => {
  for (const p of [TQ, VIEC, PX]) {
    const a = (await api(`${p}?bcvh=${M2}`, 'admin')).body;
    for (const who of ['ttvh', 'gdvhM', 'gdvhNone']) {
      const g = await api(`${p}?bcvh=${M2}`, who);
      assert.equal(g.status, 200, `${p} ${who}`);
      const { bcvh_goi_y: x, nap_luc: n1, ...gb } = g.body;
      const { bcvh_goi_y: y, nap_luc: n2, ...ab } = a;
      assert.deepEqual(gb, ab, `${p} ${who} = ADMIN`);
    }
    assert.deepEqual((await api(p, 'gdvhM')).body.bcvh_goi_y, [M]);
    assert.deepEqual((await api(p, 'gdvhNone')).body.bcvh_goi_y, []);
    assert.deepEqual((await api(p, 'ttvh')).body.bcvh_goi_y, []);
    assert.equal((await api(p, 'staff')).status, 403);
    assert.equal((await api(p)).status, 401);
  }
});
