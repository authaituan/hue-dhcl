// ==========================================
// Test DASH-6b (#76): đánh giá mức sản lượng lệch của Dashboard «Cần điều hành ngay hôm nay» — phần «đến».
// Mốc DUY NHẤT để gắn mức = cùng thứ TUẦN TRƯỚC, cùng giờ DỮ LIỆU (den_luc, không phải đồng hồ máy); «hôm qua» chỉ hiển thị.
// Điều kiện gắn mức: mốc >= 50 bưu gửi VÀ den_luc từ 12:00; thiếu một điều kiện -> không gắn mức, trả chua_du_du_lieu + lý do.
// Hàng đi ngoài chỉ hiển thị, KHÔNG gắn mức và không sinh việc cần làm.
// Server thật trên DB tạm; CSV / số hiệu GIẢ. Ngày dữ liệu (tháng 10/2026) cố định, không phụ thuộc đồng hồ máy chạy test.
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

const PORT = 5923;
const A = '533140'; const B = '535470'; const C = '536250'; const D = '537015'; const E = '537220'; const F = '535790';
const TQ = '/api/arrivals/dashboard/tong-quan-den';
const VIEC = '/api/arrivals/dashboard/viec-can-lam';
let ctx;
let workDir;
let token;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const pad = (n) => String(n).padStart(2, '0');
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`; // phút trong ngày -> HH:MM:00

/**
 * n bưu gửi của (bcvh, ngày): n−1 bưu gửi lúc 06:00, 06:01, … và bưu gửi CUỐI đúng giờ `last` (HH:MM:SS) -> den_luc = last.
 * after: số bưu gửi thêm lúc 17:00 trở đi (sau mọi mốc cắt dùng trong test: không được tính vào «cùng giờ»).
 * diNgoai: BD8 = SHBG cho mọi bưu gửi (hàng đi ngoài).
 */
function dayRows(bcvh, day, n, last, { after: extra = 0, diNgoai = false, ward = 'Phường An' } = {}) {
  const rows = [];
  const mk = (time) => {
    seq++;
    const sh = `ZZ8${String(seq).padStart(8, '0')}VN`;
    rows.push({
      bcvh, day, Ma_BC_dong: '990001', BC_nhan_BG: bcvh, Ten_duong_thu: 'Đường thư giả', SHBG: sh, So_hieu_BD10: '',
      'Thời gian XN túi': `${day} ${time}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
      So_hieu_BD8: diNgoai ? sh : `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
      Ten_Xa_Phuong: ward, Ten_Tinh_Thanh: 'Tỉnh Thử'
    });
  };
  for (let i = 0; i < n - 1; i++) mk(clock(360 + i));
  mk(last);
  for (let i = 0; i < extra; i++) mk(clock(1020 + i));
  return rows;
}

const D20 = '2026-10-20'; const W13 = '2026-10-13'; const Y19 = '2026-10-19';
const D21 = '2026-10-21'; const W14 = '2026-10-14';
const D03 = '2026-11-03'; const D02 = '2026-11-02'; const W27 = '2026-10-27';
const PX = '/api/arrivals/dashboard/phuong-xa-tang';
const D10 = '2026-11-10'; const D09 = '2026-11-09'; const W03 = '2026-11-03';
const ROWS = [
  // A: 20/10 125 bưu gửi tới 13:30 (mọi bưu gửi hôm nay đều đi ngoài); tuần trước 13/10: 100 tới cùng giờ + 30 sau 17:00 (không tính) -> +25% = Xử lý ngay
  ...dayRows(A, D20, 125, '13:30:00', { diNgoai: true }), ...dayRows(A, W13, 100, '07:00:00', { after: 30 }),
  // A: 21/10 60 bưu gửi tới ĐÚNG 12:00:00; tuần trước 14/10 đúng 50 bưu gửi (đúng sàn) + 20 sau 17:00 -> +20% = Trong ngày
  ...dayRows(A, D21, 60, '12:00:00'), ...dayRows(A, W14, 50, '08:00:00', { after: 20 }),
  // B: 114 vs tuần trước 100 = +14% -> Bình thường; hôm qua 300 (hôm nay −62%) chỉ hiển thị, KHÔNG dùng để gắn mức
  ...dayRows(B, D20, 114, '14:00:00'), ...dayRows(B, W13, 100, '07:00:00'), ...dayRows(B, Y19, 300, '09:00:00'),
  // C: 85 vs 100 = −15% -> Trong ngày
  ...dayRows(C, D20, 85, '13:00:00'), ...dayRows(C, W13, 100, '07:00:00'),
  // D: +25% nhưng den_luc 11:59:59 (chưa tới 12:00) -> không gắn mức
  ...dayRows(D, D20, 125, '11:59:59'), ...dayRows(D, W13, 100, '07:00:00'),
  // E: tuần trước là ngày lẻ chỉ 2 bưu gửi (hồi quy +4.900% sai) -> không gắn mức
  ...dayRows(E, D20, 100, '13:00:00'), ...dayRows(E, W13, 2, '07:00:00'),
  // F: không có file tuần trước -> không gắn mức
  ...dayRows(F, D20, 60, '14:00:00'),
  // D, 03/11: số chênh có sàn. Hôm qua 02/11 đúng 50 bưu gửi (đủ sàn -> có số), tuần trước 27/10 chỉ 49 (dưới sàn -> chenh = null). Hôm nay 60, đều đi ngoài.
  ...dayRows(D, D03, 60, '13:00:00', { diNgoai: true }), ...dayRows(D, D02, 50, '09:00:00'), ...dayRows(D, W27, 49, '09:00:00'),
  // F, 10/11, số chênh phường/xã có sàn riêng 10: Phường Bình hôm qua 10 (có số) / tuần trước 9 (null); Phường An hôm qua 9 (null) / tuần trước 10 (có số)
  ...dayRows(F, D10, 20, '13:00:00', { ward: 'Phường Bình' }), ...dayRows(F, D10, 20, '12:30:00', { ward: 'Phường An' }),
  ...dayRows(F, D09, 10, '09:00:00', { ward: 'Phường Bình' }), ...dayRows(F, D09, 9, '09:00:00', { ward: 'Phường An' }),
  ...dayRows(F, W03, 9, '09:00:00', { ward: 'Phường Bình' }), ...dayRows(F, W03, 10, '09:00:00', { ward: 'Phường An' })
];

function writeFiles() {
  const groups = new Map();
  for (const row of ROWS) {
    const k = `${row.bcvh}|${row.day.replace(/-/g, '')}`;
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

async function api(p) {
  const res = await fetch(`${ctx.baseUrl}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const row = (body, ma) => body.theo_bcvh.find((x) => x.ma === ma);

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-dash-danhgia-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-dash-danhgia-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  ctx.db.exec("INSERT INTO province_post_offices (id, code, name) VALUES ('p1', '99', 'BĐTP Thử')");
  seedUser(ctx.db, { hrmCode: 'DG_TTVH', fullName: 'DG_TTVH', role: 'TTVH', password: 'Ttvh@123' });
  token = (await loginAs(ctx.baseUrl, 'DG_TTVH', 'Ttvh@123')).body.token;
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

test('đủ điều kiện (mốc >= 50, từ 12:00): ngưỡng 15% / 25% theo tuần trước — A +25% Xử lý ngay, B +14% Bình thường, C −15% Trong ngày', async () => {
  const b = (await api(`${TQ}?date=${D20}`)).body;
  const a = row(b, A);
  assert.equal(a.den_luc, `${D20} 13:30:00`);
  assert.deepEqual(a.so_tuan_truoc, { gia_tri: 100, chenh_pct: 25 }, '30 bưu gửi sau 17:00 của tuần trước không nằm trong «cùng giờ»');
  assert.deepEqual(a.danh_gia_san_luong, { trang_thai: 'da_danh_gia', ly_do: null });
  assert.equal(a.muc_chi_tiet.san_luong, 'xu_ly_ngay');
  assert.equal(a.muc, 'xu_ly_ngay');
  const bb = row(b, B);
  assert.deepEqual(bb.danh_gia_san_luong, { trang_thai: 'da_danh_gia', ly_do: null });
  assert.equal(bb.muc_chi_tiet.san_luong, 'binh_thuong');
  const c = row(b, C);
  assert.deepEqual([c.so_tuan_truoc.chenh_pct, c.muc_chi_tiet.san_luong, c.muc], [-15, 'trong_ngay', 'trong_ngay']);
});

test('«hôm qua» chỉ hiển thị, không dùng để gắn mức: B hôm nay −62% so hôm qua nhưng vẫn Bình thường', async () => {
  const bb = row((await api(`${TQ}?date=${D20}`)).body, B);
  assert.deepEqual(bb.so_hom_qua, { gia_tri: 300, chenh_pct: -62 });
  assert.equal(bb.muc_chi_tiet.san_luong, 'binh_thuong');
  assert.equal(bb.muc, 'binh_thuong');
});

test('chưa tới 12:00 (giờ DỮ LIỆU den_luc 11:59:59): D lệch +25% vẫn KHÔNG gắn mức; đúng 12:00:00 thì đánh giá (A 21/10, mốc đúng 50 -> +20% Trong ngày)', async () => {
  const d = row((await api(`${TQ}?date=${D20}`)).body, D);
  assert.equal(d.den_luc, `${D20} 11:59:59`);
  assert.deepEqual(d.so_tuan_truoc, { gia_tri: 100, chenh_pct: 25 }, 'vẫn hiển thị số so sánh');
  assert.deepEqual(d.danh_gia_san_luong, { trang_thai: 'chua_du_du_lieu', ly_do: 'chua_toi_gio' });
  assert.equal(d.muc_chi_tiet.san_luong, null);
  assert.equal(d.muc, 'binh_thuong', 'không còn mức nào khác -> Bình thường');
  const a = row((await api(`${TQ}?date=${D21}&bcvh=${A}`)).body, A);
  assert.equal(a.den_luc, `${D21} 12:00:00`);
  assert.deepEqual(a.so_tuan_truoc, { gia_tri: 50, chenh_pct: 20 });
  assert.deepEqual(a.danh_gia_san_luong, { trang_thai: 'da_danh_gia', ly_do: null });
  assert.equal(a.muc_chi_tiet.san_luong, 'trong_ngay');
});

test('mốc dưới 50 bưu gửi (hồi quy ngày lẻ chỉ 2 bưu gửi) và thiếu tuần trước: KHÔNG gắn mức, có lý do', async () => {
  const b = (await api(`${TQ}?date=${D20}`)).body;
  const e = row(b, E);
  assert.deepEqual(e.so_tuan_truoc, { gia_tri: 2, chenh_pct: null }, 'giá trị mốc vẫn hiển thị; không có số chênh (+4.900% vô nghĩa) và không gắn mức');
  assert.deepEqual(e.danh_gia_san_luong, { trang_thai: 'chua_du_du_lieu', ly_do: 'moc_duoi_san' });
  assert.equal(e.muc_chi_tiet.san_luong, null);
  assert.equal(e.muc, 'binh_thuong');
  const f = row(b, F);
  assert.equal(f.so_tuan_truoc, null);
  assert.deepEqual(f.danh_gia_san_luong, { trang_thai: 'chua_du_du_lieu', ly_do: 'thieu_tuan_truoc' });
  assert.equal(f.muc_chi_tiet.san_luong, null);
  // BCVH có mức Xử lý ngay / Trong ngày: A (+25%) và C (−15%); D, E, F không gắn mức
  assert.deepEqual(b.bcvh_can_chu_y, { so: 2, tong: 6 });
});

test('mốc «cùng giờ» theo giờ dữ liệu: hôm qua và tuần trước cắt đúng den_luc của hôm nay, không dùng đồng hồ máy', async () => {
  // Ngày dữ liệu cố định (tháng 10/2026): kết quả không đổi dù máy chạy test đang ở giờ/ngày nào.
  const a = row((await api(`${TQ}?date=${D20}&bcvh=${A}`)).body, A);
  assert.equal(a.san_luong.buu_gui, 125);
  assert.equal(a.so_tuan_truoc.gia_tri, 100);
  assert.equal(a.so_hom_qua, null, 'A không có file 19/10 -> null, không trả 0');
  // Cùng một ngày, đổi giờ dữ liệu (ngày 21/10 tới 12:00) -> mốc cắt đổi theo: tuần trước 14/10 chỉ tính tới 12:00, không tính 20 bưu gửi sau 17:00
  const a21 = row((await api(`${TQ}?date=${D21}&bcvh=${A}`)).body, A);
  assert.equal(a21.so_tuan_truoc.gia_tri, 50);
});

test('hàng đi ngoài chỉ hiển thị: tăng +100 điểm so tuần trước vẫn không sinh mức, không sinh việc cần làm', async () => {
  const b = (await api(`${TQ}?date=${D20}&bcvh=${A}`)).body;
  assert.deepEqual(b.hang_di_ngoai, {
    buu_gui: 125, ty_le: 1, mau_so: 125,
    so_hom_qua_cung_gio: null,
    so_tuan_truoc_cung_gio: { buu_gui: 0, ty_le: 0, mau_so: 100, chenh_diem: 100, so_bcvh: 1 }
  });
  assert.ok(!('muc' in b.hang_di_ngoai));
  assert.deepEqual(Object.keys(row(b, A).muc_chi_tiet), ['san_luong', 'chua_nhan', 'bd10_chua_xnd']);
  const v = (await api(`${VIEC}?date=${D20}`)).body;
  assert.deepEqual(v.items, [], 'không có chưa nhận / BD10 chưa XNĐ nên không có việc; không có loại «hàng nặng»/«hàng đi ngoài»');
});

test('số chênh có sàn 50: mốc 49 -> chenh = null (vẫn giữ giá trị mốc), mốc 50 -> có số; áp cho sản lượng, hàng đi ngoài, phường/xã', async () => {
  const b = (await api(`${TQ}?bcvh=${D}&date=${D03}`)).body;
  const r = row(b, D);
  // sản lượng: hôm nay 60 so hôm qua 50 (+20%) và tuần trước 49 (không có số)
  assert.deepEqual(r.so_hom_qua, { gia_tri: 50, chenh_pct: 20 });
  assert.deepEqual(r.so_tuan_truoc, { gia_tri: 49, chenh_pct: null });
  assert.deepEqual(b.san_luong.so_hom_qua_cung_gio, { gia_tri: 50, chenh_pct: 20, so_bcvh: 1 });
  assert.deepEqual(b.san_luong.so_tuan_truoc_cung_gio, { gia_tri: 49, chenh_pct: null, so_bcvh: 1 });
  // hàng đi ngoài: hôm nay 100% so hôm qua 0% (mốc 50: +100 điểm) và tuần trước 0% (mốc 49: null)
  assert.deepEqual(b.hang_di_ngoai.so_hom_qua_cung_gio, { buu_gui: 0, ty_le: 0, mau_so: 50, chenh_diem: 100, so_bcvh: 1 });
  assert.deepEqual(b.hang_di_ngoai.so_tuan_truoc_cung_gio, { buu_gui: 0, ty_le: 0, mau_so: 49, chenh_diem: null, so_bcvh: 1 });
  // phường/xã dùng sàn riêng SAN_SO_SANH_PHUONG_XA = 10 (không phải 50): mốc 49 và 50 đều có số
  const w = (await api(`${PX}?bcvh=${D}&date=${D03}`)).body.items[0];
  assert.deepEqual([w.hom_nay, w.hom_qua, w.tang_so_hom_qua, w.tang_so_hom_qua_pct], [60, 50, 10, 20]);
  assert.deepEqual([w.tuan_truoc_cung_gio, w.lech_so_tuan_truoc_pct], [49, 22.45]);
  // đã xét ở các ca trên: mốc 100 có số (+25%), mốc đúng 50 có số (+20%), mốc 2 không có số
  const e = row((await api(`${TQ}?date=${D20}`)).body, E);
  assert.deepEqual(e.so_tuan_truoc, { gia_tri: 2, chenh_pct: null });
});

test('phường/xã: sàn riêng 10 bưu gửi — mốc 9 -> chenh_pct null (vẫn giữ số và số tuyệt đối), mốc 10 -> có số; áp cho cả hôm qua và tuần trước', async () => {
  const items = (await api(`${PX}?bcvh=${F}&date=${D10}`)).body.items;
  const by = (ten) => items.find((x) => x.ten === ten);
  const binh = by('Phường Bình');
  assert.deepEqual([binh.hom_nay, binh.hom_qua, binh.tang_so_hom_qua, binh.tang_so_hom_qua_pct], [20, 10, 10, 100], 'hôm qua đúng 10 -> có số');
  assert.deepEqual([binh.tuan_truoc_cung_gio, binh.lech_so_tuan_truoc_pct], [9, null], 'tuần trước 9 -> null');
  const an = by('Phường An');
  assert.deepEqual([an.hom_nay, an.hom_qua, an.tang_so_hom_qua, an.tang_so_hom_qua_pct], [20, 9, 11, null], 'hôm qua 9 -> null, số tuyệt đối vẫn có');
  assert.deepEqual([an.tuan_truoc_cung_gio, an.lech_so_tuan_truoc_pct], [10, 100], 'tuần trước đúng 10 -> có số');
  // sản lượng vẫn dùng sàn 50: cả hai mốc của F (tổng 19 và 19 bưu gửi) đều không có số chênh
  const f = row((await api(`${TQ}?bcvh=${F}&date=${D10}`)).body, F);
  assert.deepEqual([f.so_hom_qua.chenh_pct, f.so_tuan_truoc.chenh_pct], [null, null]);
});
