// ==========================================
// Test SANLUONG-5g-5: NHẬT KÝ «Thay thế ngày» (API đọc), KHÔI PHỤC từ thùng rác, khoá memo bd10Share.
//   server/lib/thayTheNhatKy.js, server/lib/thayTheKhoiPhuc.js, routes /api/arrivals/thay-the/nhat-ky[/:id] và /khoi-phuc/{xem-truoc,thuc-hien}.
// Server thật + DB tạm của harness; nguồn SFTP GIẢ (client giả cho «Thay thế»; nguồn mặc định CẤM MẠNG, đếm số lần gọi). CSV / SHBG GIẢ dựng lúc chạy
// (13 ký tự, tiền tố ZZ9; không có dãy ≥ 15 chữ số). Thư mục sao lưu là thư mục tạm — không đụng data/.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv, MANG_BI_CAM } = require('./helpers/khongMang');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const X = require('../server/lib/thayTheXemTruoc');
const TT = require('../server/lib/thayTheThucHien');
const NK = require('../server/lib/thayTheNhatKy');
const KP = require('../server/lib/thayTheKhoiPhuc');
const aq = require('../server/lib/arrivalsQuery');

const PORT = 5934;
const B = '533140';
const NGAY = '2026-10-10';
const D1 = '/CSV_Report_533140';
const NOW = new Date('2026-10-14T05:00:00Z');
const USERS = {
  admin: { hrm: 'KP_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'KP_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KP_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'KP_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhucEnv = [cachLySftpEnv()];
let ctx;
let dir;
let tmpRoot;
let sauLuu;
let giay = 0;
let soLanChamMang = 0;

const shbg = (i) => `ZZ${String(900000000 + i)}VN`;
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
let seq = 0;
function csv(ds, { ma = B, ngay = NGAY } = {}) {
  const rows = ds.map((d) => {
    const o = typeof d === 'string' ? { sh: d } : d;
    seq++;
    return {
      Ma_BC_dong: '990001', BC_nhan_BG: ma, Ten_duong_thu: 'Đường A', SHBG: o.sh, So_hieu_BD10: '', 'Thời gian XN túi': o.bag || `${ngay} 08:00:00`,
      'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: o.bd8 ?? `P${seq}`, Khoi_luong_thuc_te: '500',
      Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
    };
  });
  const header = EXPECTED_HEADER;
  return Buffer.from('﻿' + [header.map(qt).join(','), ...rows.map((r) => header.map((h) => qt(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
}
/** Dòng có khoá cố định (BD8 'B8'): cùng SHBG ở hai lần nạp = cùng khoá nghiệp vụ. */
const co = (a, b) => Array.from({ length: b - a }, (_, i) => ({ sh: shbg(a + i), bd8: 'B8' }));
const ten = (ma, ymd, hms) => `HangDen_${ma}_${ymd.replace(/-/g, '')}_${hms}.csv`;
const SANG = ten(B, NGAY, '093012');
const CHIEU = ten(B, NGAY, '163011');
const f = (buf) => ({ buf, mtime: 1760400000000 });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-khoiphuc-data-'));
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-khoiphuc-tmp-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-khoiphuc-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhucEnv.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: `Tên ${u.hrm}`, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  X.datNguon(null);
  for (const r of khoiPhucEnv.reverse()) r();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  for (const p of [dir, tmpRoot]) fs.rmSync(p, { recursive: true, force: true });
});
beforeEach(() => {
  cachLySftpEnv();
  try { ctx.db.exec('DROP TRIGGER IF EXISTS tg_test_loi'); } catch (e) { /* chưa có */ }
  for (const t of ['thay_the_khoi_phuc', 'thung_rac_dong', 'thung_rac_file', 'thay_the_nhat_ky', 'sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'phat_status_current', 'arrival_items', 'arrival_import_files', 'ward_bdx_map']) {
    ctx.db.prepare(`DELETE FROM ${t}`).run();
  }
  giay = 0;
  soLanChamMang = 0;
  sauLuu = fs.mkdtempSync(path.join(tmpRoot, 'sl-'));
  // nguồn mặc định CẤM MẠNG và ĐẾM: khôi phục / nhật ký không bao giờ được gọi tới
  X.datNguon({ ketNoi: async () => { soLanChamMang++; throw new Error(MANG_BI_CAM); }, dirs: [D1], bimat: [], sauLuuDir: sauLuu });
});

// ---------- tiện ích ----------
const nap = async (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); const r = await importArrivalFile(ctx.db, p); assert.ok(['OK', 'EMPTY'].includes(r.status), `${name}: ${r.status}`); return r; };
const napCu = (ds, hms = '235959') => nap(ten(B, NGAY, hms), csv(ds));
function nguonChuan(moi) {
  const h = Math.ceil(moi.length / 2);
  const files = { [D1]: { [SANG]: f(csv(moi.slice(0, h))), [CHIEU]: f(csv(moi.slice(h))) } };
  return {
    files,
    async list(d) { return Object.entries(files[d] || {}).map(([name, x]) => ({ type: '-', name, size: x.buf.length, modifyTime: x.mtime })); },
    async get(xa, cb) { fs.writeFileSync(cb, files[xa.slice(0, xa.lastIndexOf('/'))][xa.slice(xa.lastIndexOf('/') + 1)].buf); },
    async end() { /* không có gì */ }
  };
}
const crypto = require('crypto');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const duKienTu = (src) => Object.entries(src.files[D1]).map(([t, x]) => ({ ten: t, sha256: sha(x.buf) }));
function thay(moi, { dongYMat = true } = {}) {
  const src = nguonChuan(moi);
  const t = new Date(NOW.getTime() + (++giay) * 60000);
  return TT.thayTheNgay({
    client: src, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, sauLuuDir: sauLuu, now: () => t, nguoiThucHien: 'KP_ADMIN',
    xacNhan: { ma_bcvh: B, ngay: NGAY }, tapFileNguonDuKien: duKienTu(src), dongYMat
  });
}
/** Khôi phục qua lõi với mặc định hợp lệ. */
function khoiPhuc(nhatKyId, extra = {}) {
  const { at, options, ...rest } = extra;
  const t = at || new Date(NOW.getTime() + 3600000 + (++giay) * 60000);
  return KP.khoiPhuc({ db: ctx.db, nhatKyId, xacNhan: { ma_bcvh: B, ngay: NGAY }, nguoiThucHien: 'KP_ADMIN', sauLuuDir: sauLuu, now: () => t, options: { ...options }, ...rest });
}
const BANG = ['arrival_items', 'arrival_import_files', 'ward_bdx_map', 'phat_status_current', 'thay_the_nhat_ky', 'thung_rac_file', 'thung_rac_dong', 'thay_the_khoi_phuc', 'sftp_sync_runs'];
const chup = () => JSON.stringify(BANG.map((t) => [t, ctx.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
const dem = (t, where = '1=1', ...p) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get(...p).n;
const dangKhoa = () => dem('sftp_sync_runs', 'finished_at IS NULL');
const dongNgay = () => dem('arrival_items', 'import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = ? AND file_date = ?)', B, NGAY);
const loiMa = (ma, http) => (e) => e.code === ma && (http === undefined || e.httpStatus === http);
const goi = (who, method, url, body) => fetch(`${ctx.baseUrl}/api${url}`, {
  method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const docLog = () => { try { return fs.readFileSync(process.env.SECURITY_LOG, 'utf8'); } catch (e) { return ''; } };

/** Kịch bản nền: file nhập tay _235959 có 100 dòng (khoá cố định), thay bằng 60 dòng đầu → thùng rác giữ 100 dòng, DB sống 60 dòng. Trả kết quả thay. */
async function kichBanNen() {
  await napCu(co(0, 100));
  const kq = await thay(co(0, 60));
  assert.equal(dongNgay(), 60);
  // Hạn thùng rác đặt xa để các ca gọi qua route (đồng hồ thật) không phụ thuộc ngày chạy test; ca «hết hạn» dùng `at` ở lõi.
  ctx.db.prepare("UPDATE thay_the_nhat_ky SET thung_rac_het_han_luc = '2099-01-01T00:00:00.000Z' WHERE id = ?").run(kq.nhat_ky_id);
  kq.thung_rac.het_han_luc = '2099-01-01T00:00:00.000Z';
  return kq;
}
const them = (n, o = {}) => ctx.db.prepare(`INSERT INTO thay_the_nhat_ky (thoi_diem_utc, nguoi_thuc_hien, bcvh, ngay, tap_file_cu, tap_file_moi, so_file_cu, so_dong_cu, so_file_moi, so_dong_moi, shbg_cu,
  shbg_mat_that, shbg_mat_can_tren, muc_canh_bao, dong_y_mat, duong_dan_sao_luu, ket_qua, thung_rac_het_han_luc) VALUES (@t, @n, @b, @d, '[]', '[]', 1, @sd, 2, @sn, 100, 3, 3, 'AN_TOAN', 0, @sl, 'THANH_CONG', @h)`)
  .run({ t: o.t || `2026-09-${String(10 + n).padStart(2, '0')}T01:00:00.000Z`, n: o.nguoi || 'KP_ADMIN', b: o.bcvh || B, d: o.ngay || NGAY, sd: 100 + n, sn: 90 + n, sl: o.sl ?? null, h: o.h || '2099-01-01T00:00:00.000Z' }).lastInsertRowid;

// =====================================================================
// VIỆC 1 — NHẬT KÝ (API ĐỌC)
// =====================================================================
test('nhật ký: danh sách và chi tiết đúng trường, giờ UTC + Bangkok, người {ma, ten}, mất thật, thùng rác; KHÔNG lộ đường dẫn / SHBG / nội dung dòng', async () => {
  const kq = await kichBanNen();
  const r = await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 1);
  assert.deepEqual(r.body.pagination, { total: 1, page: 1, page_size: 20, total_pages: 1 });
  const m = r.body.items[0];
  assert.equal(m.id, kq.nhat_ky_id);
  assert.deepEqual([m.bcvh, m.ngay], [B, NGAY]);
  assert.match(m.thoi_diem, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(m.thoi_diem_bangkok, `${new Date(Date.parse(m.thoi_diem) + 7 * 3600000).toISOString().slice(0, 19)}+07:00`);
  assert.deepEqual(m.nguoi, { ma: 'KP_ADMIN', ten: 'Tên KP_ADMIN' });
  assert.deepEqual([m.so_dong_xoa, m.so_dong_nap, m.so_file_xoa, m.so_file_nap], [100, 60, 1, 2]);
  assert.deepEqual(m.mat_that, { so_shbg: 40, tren_so_shbg_cu: 100, ty_le_phan_tram: 40, can_tren_so_shbg: 40 });
  assert.equal(m.canh_bao.da_dong_y_mat, true);
  assert.deepEqual(m.sao_luu, { tep: kq.sao_luu.tep, kich_thuoc: null });
  assert.deepEqual(m.thung_rac, { het_han_luc: kq.thung_rac.het_han_luc, con_khoi_phuc_duoc: true, da_khoi_phuc: false });
  const ct = await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky/${m.id}`);
  assert.equal(ct.status, 200);
  assert.deepEqual([ct.body.thung_rac.so_dong, ct.body.thung_rac.so_file], [100, 1]);
  assert.deepEqual(ct.body.tap_file_cu.map((x) => [x.ten, x.trang_thai, x.nguon, x.so_dong]), [[ten(B, NGAY, '235959'), 'OK', 'MANUAL', 100]]);
  assert.deepEqual(ct.body.tap_file_moi.map((x) => [x.ten, x.trang_thai, x.so_dong]), [[SANG, 'OK', 30], [CHIEU, 'OK', 30]]);
  assert.equal(ct.body.khoi_phuc, null);
  for (const txt of [JSON.stringify(r.body), JSON.stringify(ct.body)]) {
    assert.ok(!txt.includes(sauLuu), 'không có đường dẫn thư mục sao lưu');
    assert.ok(!/[\\/]/.test(m.sao_luu.tep));
    assert.ok(!txt.includes('ZZ9'), 'không có SHBG');
    assert.ok(!/\d{15,}/.test(txt));
    assert.ok(!/duong_dan|tracking|shbg_mau/.test(txt), 'không có trường đường dẫn / dòng thùng rác');
  }
  assert.equal(soLanChamMang, 0);
});

test('nhật ký: lọc bcvh / tu_ngay / den_ngay / nguoi, phân trang, mới trước; tham số sai 400 kèm ma', async () => {
  const a = them(1, { ngay: '2026-09-01', nguoi: 'KP_ADMIN' });
  const b = them(2, { ngay: '2026-09-15', nguoi: 'KP_TTVH' });
  const c = them(3, { ngay: '2026-10-01', bcvh: '535470', nguoi: 'KP_ADMIN' });
  const ids = (r) => r.body.items.map((x) => x.id);
  assert.deepEqual(ids(await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky')), [c, b, a], 'mới trước theo thoi_diem');
  assert.deepEqual(ids(await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky?bcvh=${B}`)), [b, a]);
  assert.deepEqual(ids(await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?tu_ngay=2026-09-10&den_ngay=2026-09-30')), [b]);
  assert.deepEqual(ids(await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?tu_ngay=2026-09-15')), [c, b]);
  assert.deepEqual(ids(await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?nguoi=KP_TTVH')), [b]);
  const p = await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?page=2&page_size=2');
  assert.deepEqual(ids(p), [a]);
  assert.deepEqual(p.body.pagination, { total: 3, page: 2, page_size: 2, total_pages: 2 });
  assert.equal((await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?page_size=100')).status, 200);
  const sai = [
    '?page_size=101', '?page_size=0', '?page=0', '?page=abc', '?bcvh=999999', '?tu_ngay=2026-13-01', '?tu_ngay=10/10/2026', '?den_ngay=2026-02-30',
    '?tu_ngay=2026-10-05&den_ngay=2026-10-01', '?tu_ngay=2026-01-01&den_ngay=2026-04-05', '?la=1'
  ];
  for (const q of sai) {
    const r = await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.body.ma, 'THAM_SO_SAI', q);
    assert.ok(typeof r.body.error === 'string' && !('ma_loi' in r.body));
  }
  assert.equal((await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky?tu_ngay=2026-01-01&den_ngay=2026-04-02')).status, 200, 'đúng 92 ngày');
  assert.equal((await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky/abc')).status, 400);
  const kt = await goi('admin', 'GET', '/arrivals/thay-the/nhat-ky/999999');
  assert.deepEqual([kt.status, kt.body.ma], [404, 'KHONG_TIM_THAY']);
});

test('quyền: 4 API chỉ ADMIN — không token 401; TTVH, GDVH, TIVI 403', async () => {
  const kq = await kichBanNen();
  const ca = [
    ['GET', '/arrivals/thay-the/nhat-ky'], ['GET', `/arrivals/thay-the/nhat-ky/${kq.nhat_ky_id}`],
    ['POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: kq.nhat_ky_id }],
    ['POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY } }]
  ];
  const truoc = chup();
  for (const [me, url, body] of ca) {
    assert.equal((await goi(null, me, url, body)).status, 401, `${url} không token`);
    for (const who of ['ttvh', 'gdvh', 'tivi']) assert.equal((await goi(who, me, url, body)).status, 403, `${url} ${who}`);
  }
  assert.equal(chup(), truoc, 'bị từ chối thì DB không đổi');
});

// =====================================================================
// VIỆC 2 — KHÔI PHỤC
// =====================================================================
test('xem trước: CHỈ ĐỌC (DB không đổi, không khoá, không sao lưu, không mạng); đếm đúng dòng sẽ thêm / đã có / file tạo lại', async () => {
  const kq = await kichBanNen();
  const truoc = chup();
  const r = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: kq.nhat_ky_id });
  assert.equal(r.status, 200);
  assert.equal(chup(), truoc, 'DB không đổi');
  assert.deepEqual(fs.readdirSync(sauLuu), [kq.sao_luu.tep], 'không tạo bản sao lưu mới');
  assert.equal(dangKhoa(), 0);
  assert.equal(soLanChamMang, 0);
  const b = r.body;
  assert.deepEqual([b.so_dong_trong_thung_rac, b.so_dong_se_them, b.so_dong_da_co, b.so_dong_gan_sang_file_khac, b.so_dong_khong_khoi_phuc], [100, 40, 60, 0, 0]);
  assert.deepEqual([b.so_file_se_tao_lai, b.so_file_gan_vao_hien_hanh, b.so_file_bo_qua, b.co_the_khoi_phuc], [1, 0, 0, true]);
  assert.deepEqual(b.tap_file.map((x) => [x.ten, x.hanh_dong, x.so_dong_se_them, x.so_dong_da_co]), [[ten(B, NGAY, '235959'), 'TAO_LAI', 40, 60]]);
  assert.ok(!JSON.stringify(b).includes('ZZ9'));
  assert.ok(!JSON.stringify(b).includes(sauLuu));
  // tham số sai
  assert.equal((await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', {})).body.ma, 'THAM_SO_SAI');
  assert.equal((await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: '1; DROP' })).status, 400);
  assert.equal((await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: kq.nhat_ky_id, x: 1 })).status, 400);
  assert.equal((await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: 987654 })).body.ma, 'KHONG_TIM_THAY');
});

test('thực hiện thành công: chỉ THÊM (không xóa / không đổi dòng sống), tạo lại file với id gốc, id dòng cấp mới, phát không đổi, đánh dấu đã khôi phục, ghi nhật ký', async () => {
  const kq = await kichBanNen();
  ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', 1, '2026-10-12T01:00:00Z')").run(B, shbg(5));
  const phatTruoc = JSON.stringify(ctx.db.prepare('SELECT * FROM phat_status_current').all());
  const songTruoc = ctx.db.prepare('SELECT * FROM arrival_items ORDER BY id').all();
  const fileSongTruoc = ctx.db.prepare('SELECT * FROM arrival_import_files ORDER BY id').all();
  const idGoc = ctx.db.prepare('SELECT id FROM thung_rac_file').get().id;
  const rac = chup().length;

  const r = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.so_dong_them, r.body.so_dong_da_co, r.body.so_dong_gan_sang_file_khac, r.body.so_dong_khong_khoi_phuc, r.body.so_file_tao_lai], [40, 60, 0, 0, 1]);
  assert.match(r.body.sao_luu.tep, /^truoc-khoi-phuc_533140_2026-10-10_\d{8}T\d{6}Z\.db$/);
  assert.ok(!('duong_dan' in r.body.sao_luu) && !JSON.stringify(r.body).includes(sauLuu));
  assert.ok(!JSON.stringify(r.body).includes('ZZ9'));

  assert.equal(dongNgay(), 100);
  // dòng sống cũ còn nguyên (cùng id, cùng nội dung): chỉ có thêm
  const songSau = ctx.db.prepare('SELECT * FROM arrival_items WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').all(JSON.stringify(songTruoc.map((x) => x.id)));
  assert.deepEqual(songSau, songTruoc);
  const fileSongSau = ctx.db.prepare('SELECT * FROM arrival_import_files WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').all(JSON.stringify(fileSongTruoc.map((x) => x.id)));
  assert.deepEqual(fileSongSau, fileSongTruoc, 'bản ghi file sống không đổi (kể cả row_count)');
  // file tạo lại đúng id gốc, trạng thái và nguồn gốc
  const lai = ctx.db.prepare('SELECT * FROM arrival_import_files WHERE file_name = ?').get(ten(B, NGAY, '235959'));
  assert.deepEqual([lai.id, lai.status, lai.source, lai.row_count], [idGoc, 'OK', 'MANUAL', 100]);
  assert.equal(dem('arrival_items', 'import_file_id = ?', idGoc), 40);
  // id dòng mới KHÔNG là id gốc trong thùng rác (cấp mới, không đụng dòng sống)
  assert.equal(dem('arrival_items', 'import_file_id = ? AND id IN (SELECT id FROM arrival_items WHERE import_file_id <> ?)', idGoc, idGoc), 0);
  assert.equal(JSON.stringify(ctx.db.prepare('SELECT * FROM phat_status_current').all()), phatTruoc, 'trạng thái phát không đổi');
  assert.ok(rac > 0);
  // thùng rác còn nguyên (đến hạn mới dọn) + nhật ký khôi phục
  assert.equal(dem('thung_rac_dong'), 100);
  const kp = ctx.db.prepare('SELECT * FROM thay_the_khoi_phuc').all();
  assert.equal(kp.length, 1);
  assert.deepEqual([kp[0].nhat_ky_id, kp[0].nguoi_thuc_hien, kp[0].so_dong_them, kp[0].so_dong_da_co, kp[0].so_file_tao_lai], [kq.nhat_ky_id, 'KP_ADMIN', 40, 60, 1]);
  assert.equal(ctx.db.prepare('SELECT ket_qua FROM thay_the_nhat_ky WHERE id = ?').get(kq.nhat_ky_id).ket_qua, 'THANH_CONG', 'không dùng DA_HOAN_TAC');
  // nhật ký đọc hiện đã khôi phục
  const ct = await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky/${kq.nhat_ky_id}`);
  assert.deepEqual([ct.body.thung_rac.da_khoi_phuc, ct.body.thung_rac.con_khoi_phuc_duoc], [true, false]);
  assert.deepEqual([ct.body.khoi_phuc.so_dong_them, ct.body.khoi_phuc.nguoi.ma], [40, 'KP_ADMIN']);
  // khoá nhả, sao lưu chứa dữ liệu TRƯỚC khôi phục
  assert.equal(dangKhoa(), 0);
  assert.equal(dem('sftp_sync_runs'), 0);
  assert.equal(soLanChamMang, 0);
  const log = docLog();
  assert.ok(!log.includes('ZZ9'));
});

test('khôi phục hai lần: lần hai 409 DA_KHOI_PHUC (cả xem trước lẫn thực hiện), DB y nguyên', async () => {
  const kq = await kichBanNen();
  await khoiPhuc(kq.nhat_ky_id);
  const truoc = chup();
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id), loiMa('DA_KHOI_PHUC', 409));
  const x = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: kq.nhat_ky_id });
  assert.deepEqual([x.status, x.body.ma], [409, 'DA_KHOI_PHUC']);
  const t = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY } });
  assert.deepEqual([t.status, t.body.ma], [409, 'DA_KHOI_PHUC']);
  assert.equal(chup(), truoc);
  assert.equal(dem('thay_the_khoi_phuc'), 1);
});

test('hết hạn / đã dọn: 409 THUNG_RAC_HET_HAN; chưa đến hạn thì khôi phục được', async () => {
  const kq = await kichBanNen();
  const het = new Date(kq.thung_rac.het_han_luc);
  const truoc = chup();
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { at: het }), loiMa('THUNG_RAC_HET_HAN', 409), 'đúng thời điểm hết hạn');
  assert.equal(chup(), truoc);
  // đã dọn
  TT.donThungRac(ctx.db, het);
  assert.equal(dem('thung_rac_dong'), 0);
  const r = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY } });
  assert.deepEqual([r.status, r.body.ma], [409, 'THUNG_RAC_HET_HAN']);
  const x = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/xem-truoc', { nhat_ky_id: kq.nhat_ky_id });
  assert.deepEqual([x.status, x.body.ma], [409, 'THUNG_RAC_HET_HAN']);
  const c = await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky/${kq.nhat_ky_id}`);
  assert.equal(c.body.thung_rac.con_khoi_phuc_duoc, false);
});

test('khoá chung: lượt đồng bộ đang chạy / bộ hẹn giờ DANG_CHAY -> 409 DANG_CO_LUOT_DONG_BO; giữ khoá suốt lượt; hai lần cùng lúc -> DANG_THAY_THE; nhả sau khi xong', async () => {
  const kq = await kichBanNen();
  const t = new Date(NOW.getTime() + 7200000);
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date(t.getTime() - 5 * 60000).toISOString());
  const truoc = chup();
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { at: t }), loiMa('DANG_CO_LUOT_DONG_BO', 409));
  assert.equal(chup(), truoc);
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ?').run(t.toISOString());
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { at: t, options: { dangDongBo: () => true } }), loiMa('DANG_CO_LUOT_DONG_BO', 409));
  // giữ khoá suốt lượt, lượt thứ hai bị chặn
  let mo; const chan = new Promise((r) => { mo = r; });
  const p = khoiPhuc(kq.nhat_ky_id, { at: t, options: { truocGiaoDich: () => chan } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(dangKhoa(), 1, 'đang giữ khoá chung');
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { at: t }), loiMa('DANG_THAY_THE', 409));
  await assert.rejects(() => thay(co(0, 10)), loiMa('DANG_THAY_THE', 409), '«Thay thế» cũng bị chặn');
  mo();
  const kqp = await p;
  assert.equal(kqp.so_dong_them, 40);
  assert.equal(dangKhoa(), 0);
  assert.equal(dem('sftp_sync_runs', 'ghi_chu_loi LIKE ?', 'Khóa tạm%'), 0, 'hàng khoá giữ chỗ đã được xóa');
});

test('xác nhận: thiếu / sai mã BCVH / sai ngày / dd/mm/yyyy / khoá lạ -> XAC_NHAN_SAI (400), DB y nguyên; chưa động khoá hay sao lưu', async () => {
  const kq = await kichBanNen();
  const truoc = chup();
  const sai = [undefined, null, 'x', {}, { ma_bcvh: B }, { ngay: NGAY }, { ma_bcvh: '535470', ngay: NGAY }, { ma_bcvh: B, ngay: '2026-10-11' },
    { ma_bcvh: B, ngay: '10/10/2026' }, { ma_bcvh: B, ngay: NGAY, them: 1 }];
  for (const xn of sai) {
    const r = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, ...(xn === undefined ? {} : { xac_nhan: xn }) });
    assert.equal(r.status, 400, JSON.stringify(xn));
    assert.equal(r.body.ma, xn && typeof xn === 'object' && !Array.isArray(xn) && Object.keys(xn).includes('them') ? 'XAC_NHAN_SAI' : 'XAC_NHAN_SAI');
  }
  assert.equal(chup(), truoc);
  assert.deepEqual(fs.readdirSync(sauLuu), [kq.sao_luu.tep]);
  assert.equal((await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY }, la: 1 })).body.ma, 'THAM_SO_SAI');
});

test('lỗi giữa chừng hoàn lại sạch: ném sau khi thêm, và lỗi DB thật (trigger) -> 500 KHOI_PHUC_THAT_BAI, DB y nguyên, khoá nhả', async () => {
  const kq = await kichBanNen();
  const truoc = chup();
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { options: { sauKhiThem: () => { throw new Error('GIA_LAP'); } } }), loiMa('KHOI_PHUC_THAT_BAI', 500));
  assert.equal(chup(), truoc, 'hoàn lại: không file / dòng / nhật ký khôi phục nào còn');
  assert.equal(dangKhoa(), 0);
  ctx.db.exec("CREATE TRIGGER tg_test_loi BEFORE INSERT ON thay_the_khoi_phuc BEGIN SELECT RAISE(ABORT, 'loi gia lap'); END");
  const r = await goi('admin', 'POST', '/arrivals/thay-the/khoi-phuc/thuc-hien', { nhat_ky_id: kq.nhat_ky_id, xac_nhan: { ma_bcvh: B, ngay: NGAY } });
  assert.deepEqual([r.status, r.body.ma], [500, 'KHOI_PHUC_THAT_BAI']);
  assert.ok(!JSON.stringify(r.body).includes(sauLuu));
  assert.equal(chup(), truoc);
  assert.equal(dangKhoa(), 0);
  ctx.db.exec('DROP TRIGGER tg_test_loi');
  assert.equal((await khoiPhuc(kq.nhat_ky_id)).so_dong_them, 40, 'sau khi hết lỗi khôi phục được bình thường');
});

test('thiếu chỗ / sao lưu lỗi: 507 KHONG_DU_CHO_SAO_LUU, chưa thêm gì', async () => {
  const kq = await kichBanNen();
  const truoc = chup();
  await assert.rejects(() => khoiPhuc(kq.nhat_ky_id, { options: { dungLuongTrong: () => 1024 } }), loiMa('KHONG_DU_CHO_SAO_LUU', 507));
  assert.equal(chup(), truoc);
  assert.equal(dangKhoa(), 0);
});

test('file REJECTED trong thùng rác KHÔNG tạo lại; xem trước nêu rõ; dòng của file tạo lại được vẫn khôi phục', async () => {
  await napCu(co(0, 50));
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (?, ?, ?, '16:30:11', 10, 'aa', 'REJECTED', 'x')").run(B, CHIEU, NGAY);
  const kq = await thay(co(0, 10));
  const x = KP.xemTruoc({ db: ctx.db, nhatKyId: kq.nhat_ky_id, now: new Date(NOW.getTime() + 3600000) });
  assert.equal(x.so_file_bo_qua, 1);
  assert.ok(x.canh_bao.some((c) => c.ma === 'FILE_TU_CHOI_KHONG_TAO_LAI'));
  assert.deepEqual(x.tap_file.map((t) => t.hanh_dong).sort(), ['BO_QUA_TU_CHOI', 'TAO_LAI']);
  const r = await khoiPhuc(kq.nhat_ky_id);
  assert.equal(r.so_dong_them, 40);
  assert.equal(dem('arrival_import_files', "status IN ('REJECTED', 'CONFLICT')"), 0, 'không tạo lại bản ghi từ chối (tránh DA_TU_CHOI)');
});

test('D2(a): đã có bản OK cùng tên (file SFTP vừa nạp) -> dòng GẮN vào bản ghi đó, nêu số dòng gắn sang file khác, row_count không đổi', async () => {
  await napCu(co(0, 5)); // nền để có dữ liệu cũ
  const k1 = await thay(co(0, 40)); // SANG / CHIEU (OK, SFTP) có 40 dòng; _235959 vào thùng rác
  const rowCountTruoc = ctx.db.prepare('SELECT file_name, row_count FROM arrival_import_files ORDER BY id').all();
  const k2 = await thay(co(100, 120)); // thay lại CÙNG TÊN SANG / CHIEU: thùng rác #2 giữ 40 dòng của SANG / CHIEU cũ
  assert.equal(dongNgay(), 20);
  const x = KP.xemTruoc({ db: ctx.db, nhatKyId: k2.nhat_ky_id, now: new Date(NOW.getTime() + 3600000) });
  assert.deepEqual([x.so_file_gan_vao_hien_hanh, x.so_file_se_tao_lai, x.so_dong_se_them, x.so_dong_gan_sang_file_khac], [2, 0, 40, 40]);
  assert.deepEqual(x.tap_file.map((t) => t.hanh_dong), ['GAN_VAO_FILE_HIEN_HANH', 'GAN_VAO_FILE_HIEN_HANH']);
  assert.ok(x.canh_bao.some((c) => c.ma === 'DONG_GAN_SANG_FILE_KHAC'));
  const idHienHanh = ctx.db.prepare('SELECT id, file_name, row_count FROM arrival_import_files WHERE status = ? ORDER BY id').all('OK');
  const r = await khoiPhuc(k2.nhat_ky_id);
  assert.deepEqual([r.so_dong_them, r.so_dong_gan_sang_file_khac, r.so_file_tao_lai], [40, 40, 0]);
  assert.equal(dongNgay(), 60);
  assert.deepEqual(ctx.db.prepare('SELECT id, file_name, row_count FROM arrival_import_files WHERE status = ? ORDER BY id').all('OK'), idHienHanh, 'không thêm / đổi bản ghi file; row_count không đổi');
  assert.equal(dem('arrival_items', 'import_file_id IN (SELECT value FROM json_each(?))', JSON.stringify(idHienHanh.map((x2) => x2.id))), 60);
  assert.ok(rowCountTruoc.length >= 2);
  const kp = ctx.db.prepare('SELECT * FROM thay_the_khoi_phuc WHERE nhat_ky_id = ?').get(k2.nhat_ky_id);
  assert.deepEqual([kp.so_dong_gan_sang_file_khac, kp.so_file_gan_vao_hien_hanh, kp.so_file_tao_lai], [40, 2, 0]);
  const ct = await goi('admin', 'GET', `/arrivals/thay-the/nhat-ky/${k2.nhat_ky_id}`);
  assert.equal(ct.body.khoi_phuc.so_dong_gan_sang_file_khac, 40);
});

test('không chạm mạng: lõi nhật ký / khôi phục không nạp thư viện SFTP, không dùng hàm kết nối; nguồn cấm mạng không bị gọi', () => {
  for (const t of ['thayTheNhatKy.js', 'thayTheKhoiPhuc.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', t), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/ssh2|sftpConnect|ketNoi|layNguon/.test(src), t);
    assert.ok(!/require\('\.\/sftp(Connect|Scheduler)'\)/.test(src), t);
  }
  assert.equal(soLanChamMang, 0);
});

// =====================================================================
// VIỆC 4 — khoá memo bd10Share
// =====================================================================
const bd10 = () => aq.meta(ctx.db).date_bases.find((k) => k.key === 'bd10');
const tyLeSql = () => {
  const n = dem('arrival_items');
  const khong = dem('arrival_items', 'bd10_confirmed_at IS NULL');
  return n ? Math.round((khong / n) * 10000) / 100 : 0;
};

test('bd10Share: khoá memo có MAX(id) file; sau «Thay thế» và «Khôi phục» tỷ lệ được tính lại đúng (không dùng giá trị cũ)', async () => {
  await napCu(co(0, 50));
  assert.equal(bd10().ty_le_bi_loai, 100);
  // Giả lập đúng kịch bản trùng khoá cũ: số dòng và id dòng lớn nhất y hệt, nhưng nội dung khác.
  const v1 = bd10().ty_le_bi_loai;
  ctx.db.prepare("UPDATE arrival_items SET bd10_confirmed_at = '2026-10-10 09:00:00' WHERE id % 2 = 0").run();
  assert.equal(bd10().ty_le_bi_loai, v1, 'đối chứng: chỉ đổi nội dung, khoá (n, mx) không đổi -> memo cũ (đây là lý do phải vô hiệu hoá tường minh)');
  aq.xoaBoNhoBd10Share(ctx.db);
  assert.equal(bd10().ty_le_bi_loai, tyLeSql());
  assert.notEqual(bd10().ty_le_bi_loai, v1);
  // MAX(id) của arrival_import_files là một phần của khoá: thêm file mới (không đổi số dòng) làm tính lại
  ctx.db.prepare("UPDATE arrival_items SET bd10_confirmed_at = NULL WHERE id % 2 = 0").run();
  aq.xoaBoNhoBd10Share(ctx.db);
  assert.equal(bd10().ty_le_bi_loai, 100);
  ctx.db.prepare("UPDATE arrival_items SET bd10_confirmed_at = '2026-10-10 09:00:00'").run();
  assert.equal(bd10().ty_le_bi_loai, 100, 'memo còn (khoá chưa đổi)');
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status) VALUES (?, 'khac.csv', ?, '01:00:00', 1, 'zz', 'REJECTED')").run(B, NGAY);
  assert.equal(bd10().ty_le_bi_loai, 0, 'MAX(id) file đổi -> tính lại');
  // «Thay thế» vô hiệu hoá tường minh: dòng mới có bd10 NULL hết -> 100 %
  const kq = await thay(co(0, 30));
  assert.equal(bd10().ty_le_bi_loai, tyLeSql());
  assert.equal(bd10().ty_le_bi_loai, 100);
  // đặt memo ở giá trị khác rồi «Khôi phục» phải tính lại
  ctx.db.prepare("UPDATE arrival_items SET bd10_confirmed_at = '2026-10-10 09:00:00'").run();
  aq.xoaBoNhoBd10Share(ctx.db);
  assert.equal(bd10().ty_le_bi_loai, 0);
  ctx.db.prepare("UPDATE arrival_items SET bd10_confirmed_at = NULL WHERE id = (SELECT MIN(id) FROM arrival_items)").run(); // đổi nội dung, khoá (n, mx) và file không đổi
  assert.equal(bd10().ty_le_bi_loai, 0, 'memo cũ');
  await khoiPhuc(kq.nhat_ky_id);
  assert.equal(bd10().ty_le_bi_loai, tyLeSql(), 'khôi phục đã vô hiệu hoá memo và tính lại');
});

test('bd10Share: MAX(id) file là truy vấn chỉ mục — chi phí không đáng kể so với đếm dòng (đo trên 20.000 dòng giả)', () => {
  const RealDb = ctx.db.constructor;
  const m = new RealDb(':memory:');
  try {
    m.exec('CREATE TABLE arrival_import_files (id INTEGER PRIMARY KEY AUTOINCREMENT, x TEXT); CREATE TABLE arrival_items (id INTEGER PRIMARY KEY, f INTEGER)');
    const ins = m.prepare('INSERT INTO arrival_items (f) VALUES (?)');
    m.transaction(() => { for (let i = 0; i < 20000; i++) ins.run(i % 50); for (let i = 0; i < 500; i++) m.prepare('INSERT INTO arrival_import_files (x) VALUES (?)').run('x'); })();
    const dem2 = m.prepare('SELECT COUNT(*) AS n FROM arrival_items');
    const mx = m.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM arrival_import_files');
    const dao = (st, k) => { const t = process.hrtime.bigint(); for (let i = 0; i < k; i++) st.get(); return Number(process.hrtime.bigint() - t) / 1e6; };
    const tDem = dao(dem2, 200);
    const tMax = dao(mx, 200);
    assert.ok(tMax < tDem + 5, `MAX(id) ${tMax.toFixed(2)} ms / 200 lần so với COUNT ${tDem.toFixed(2)} ms`);
  } finally { m.close(); }
});
