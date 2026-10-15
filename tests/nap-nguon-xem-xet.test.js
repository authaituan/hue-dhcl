// ==========================================
// Test SANLUONG-5f-1c: «Đã xem xét» cho mục cần xử lý (server/lib/napNguonXemXet.js, luoi() trong napNguonDoc.js, POST/DELETE /api/nap-nguon/da-xem-xet).
// Server thật + DB tạm của harness; dữ liệu GIẢ nhét thẳng vào các bảng (không CSV, không mạng, không ssh2). Ngày tính theo ngày thật của máy (đường POST dùng giờ thật).
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const N = require('../server/lib/napNguonDoc');

const PORT = 5935;
const USERS = {
  admin: { hrm: 'XX_ADMIN', name: 'Quản trị Xét', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'XX_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'XX_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'XX_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'XX_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhuc = [cachLySftpEnv()];
let ctx;

const TH = '533140';
const HT = '535470';
const p2 = (n) => String(n).padStart(2, '0');
const ngay = (lui) => { const d = new Date(); d.setDate(d.getDate() + lui); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const N0 = ngay(-3); // ngày thử

before(async () => {
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-xemxet-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.name || u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  for (const r of khoiPhuc.reverse()) r();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
});
beforeEach(() => {
  cachLySftpEnv();
  for (const t of ['nap_nguon_da_xem_xet', 'sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'arrival_items', 'arrival_import_files']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- dữ liệu giả ----------
let seq = 0;
const ten = (bcvh, n, gio) => `HangDen_${bcvh}_${n.replace(/-/g, '')}_${gio}.csv`;
function fileDb({ bcvh = TH, ngay: n = N0, gio = '093012', status = 'OK', source = 'SFTP', rows = 100, error = null }) {
  seq++;
  ctx.db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, status, error, source, imported_at)
    VALUES (?, ?, ?, ?, 1000, ?, ?, ?, ?, ?, '2026-10-14 01:02:03')`)
    .run(bcvh, ten(bcvh, n, gio), n, `${gio.slice(0, 2)}:${gio.slice(2, 4)}:${gio.slice(4, 6)}`, `x${seq}`, rows, status, error, source);
}
function nguon({ bcvh = TH, ngay: n = N0, gio = '093012', kichThuoc = 5000, con = 1 }) {
  ctx.db.prepare(`INSERT INTO sftp_source_files (thu_muc, ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, giu_nguyen_tu, con_tren_nguon) VALUES ('/thu-muc-nguon-bi-mat', ?, ?, 1760400000000, '2026-10-14T01:00:00.000Z', '2026-10-14T02:00:00.000Z', '2026-10-14T01:00:00.000Z', ?)`)
    .run(ten(bcvh, n, gio), kichThuoc, con);
}
/** Ngày nghi ngờ ÍT: 3 tuần mẫu 100 dòng, ngày thử `dong` dòng. */
function ngayIt(dong = 10, bcvh = TH, n = N0) {
  for (const k of [7, 14, 21]) { const d = new Date(`${n}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - k); fileDb({ bcvh, ngay: d.toISOString().slice(0, 10), rows: 100 }); }
  fileDb({ bcvh, ngay: n, rows: dong, gio: '103000' });
}
const luoi = (extra = {}) => N.luoi({ db: ctx.db, now: new Date(), tu: ngay(-5), den: ngay(-1), bcvh: TH, ...extra });
const cx = (kq, loai, bcvh, n, dot) => kq.can_xu_ly.find((x) => x.loai === loai && x.bcvh === bcvh && x.ngay === n && x.dot === dot);
const xx = (kq, loai, bcvh, n, dot) => kq.da_xem_xet.find((x) => x.loai === loai && x.bcvh === bcvh && x.ngay === n && x.dot === dot);
const hoatDong = () => ctx.db.prepare('SELECT * FROM nap_nguon_da_xem_xet WHERE huy_luc IS NULL').all();

const goi = (who, method, url, body) => fetch(`${ctx.baseUrl}${url}`, {
  method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const danhDau = (body, who = 'admin') => goi(who, 'POST', '/api/nap-nguon/da-xem-xet', body);
const huy = (id, who = 'admin') => goi(who, 'DELETE', `/api/nap-nguon/da-xem-xet/${id}`);
const dotLoi = () => fileDb({ gio: '093012', status: 'REJECTED', error: 'Sai tiêu đề', rows: 0 }); // ô S của N0 = LOI

// =====================================================================
test('(a) đánh dấu mục DOT: rời can_xu_ly, vào da_xem_xet[], tong_hop.da_xem_xet tăng; o[] và theo_trang_thai không đổi', async () => {
  dotLoi();
  const truoc = luoi();
  assert.ok(cx(truoc, 'DOT', TH, N0, 'S'));
  assert.deepEqual([truoc.da_xem_xet, truoc.tong_hop.da_xem_xet], [[], 0]);
  const r = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S', ghi_chu: 'Đã đủ dữ liệu' });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['da_co', 'id']);
  assert.equal(r.body.da_co, false);
  const sau = luoi();
  assert.equal(cx(sau, 'DOT', TH, N0, 'S'), undefined);
  assert.equal(sau.can_xu_ly.length, truoc.can_xu_ly.length - 1, 'số cần xử lý (banner) giảm 1');
  const m = xx(sau, 'DOT', TH, N0, 'S');
  assert.ok(m);
  assert.equal(m.id, r.body.id);
  assert.deepEqual([m.trang_thai, m.ly_do, m.ghi_chu, m.nguoi.ma, m.nguoi.ten], ['LOI', 'REJECTED', 'Đã đủ dữ liệu', 'XX_ADMIN', 'Quản trị Xét']);
  assert.match(m.luc, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.ok(!('dau_van_tay' in m));
  assert.equal(sau.tong_hop.da_xem_xet, 1);
  assert.deepEqual(sau.tong_hop.theo_trang_thai, truoc.tong_hop.theo_trang_thai);
  assert.deepEqual(sau.tong_hop.nghi_ngo, truoc.tong_hop.nghi_ngo);
  assert.deepEqual(sau.o, truoc.o);
  assert.ok(sau.can_xu_ly.every((x) => !('dau_van_tay' in x)));
  // lọc theo BCVH đang xem: BCVH khác không thấy
  assert.deepEqual(luoi({ bcvh: HT }).da_xem_xet, []);
  // cũng thấy qua API GET
  const g = await goi('admin', 'GET', `/api/nap-nguon/luoi?tu=${ngay(-5)}&den=${ngay(-1)}&bcvh=${TH}`);
  assert.equal(g.body.tong_hop.da_xem_xet, 1);
});

test('(b) đánh dấu mục NGAY (nghi ngờ ít): dot phải bỏ; rời can_xu_ly', async () => {
  ngayIt(10);
  const truoc = luoi();
  assert.equal(cx(truoc, 'NGAY', TH, N0, null).ly_do, 'NGHI_NGO_IT');
  assert.equal((await danhDau({ loai: 'NGAY', bcvh: TH, ngay: N0, dot: 'S' })).status, 400, 'NGAY không được có dot');
  const r = await danhDau({ loai: 'NGAY', bcvh: TH, ngay: N0 });
  assert.equal(r.status, 200);
  const sau = luoi();
  assert.equal(cx(sau, 'NGAY', TH, N0, null), undefined);
  const m = xx(sau, 'NGAY', TH, N0, null);
  assert.deepEqual([m.dot, m.trang_thai, m.ly_do, m.nghi_ngo], [null, null, 'NGHI_NGO_IT', 'IT']);
  assert.equal(sau.tong_hop.nghi_ngo.IT, truoc.tong_hop.nghi_ngo.IT, 'tong_hop.nghi_ngo không đổi');
});

test('(c) dấu vân tay đổi → mục tự quay lại can_xu_ly, bản cũ còn trong DB', async () => {
  // c1: nguồn thêm file / đổi kích thước (ô NGUON_CO_FILE_CHUA_NAP)
  nguon({ gio: '093012', kichThuoc: 3 });
  let r = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  assert.equal(r.status, 200);
  assert.ok(xx(luoi(), 'DOT', TH, N0, 'S'));
  nguon({ gio: '101500', kichThuoc: 8 }); // file mới cùng đợt sáng
  assert.ok(cx(luoi(), 'DOT', TH, N0, 'S'), 'thêm file nguồn → quay lại');
  assert.equal(xx(luoi(), 'DOT', TH, N0, 'S'), undefined);
  ctx.db.prepare('DELETE FROM sftp_source_files WHERE ten_file LIKE ?').run('%101500%');
  assert.ok(xx(luoi(), 'DOT', TH, N0, 'S'), 'trở về đúng tình trạng cũ → dấu hiệu lực lại (cùng dấu vân tay)');
  ctx.db.prepare('UPDATE sftp_source_files SET kich_thuoc = 4 WHERE ten_file LIKE ?').run('%093012%');
  assert.ok(cx(luoi(), 'DOT', TH, N0, 'S'), 'đổi kích thước → quay lại');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet').get().n, 1, 'bản ghi cũ giữ nguyên làm lịch sử');

  // c2: ô đổi trạng thái / lý do (nguồn có file → ô đã nạp lỗi CONFLICT)
  ctx.db.prepare('DELETE FROM nap_nguon_da_xem_xet').run();
  ctx.db.prepare('DELETE FROM sftp_source_files').run();
  fileDb({ gio: '163011', status: 'REJECTED', error: 'x', rows: 0 });
  r = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'C' });
  assert.equal(r.status, 200);
  assert.ok(xx(luoi(), 'DOT', TH, N0, 'C'));
  ctx.db.prepare("UPDATE arrival_import_files SET status = 'CONFLICT' WHERE file_time = '16:30:11'").run();
  assert.ok(cx(luoi(), 'DOT', TH, N0, 'C'), 'lý do đổi REJECTED → CONFLICT');
  ctx.db.prepare("UPDATE arrival_import_files SET status = 'OK' WHERE file_time = '16:30:11'").run();
  assert.equal(cx(luoi(), 'DOT', TH, N0, 'C'), undefined, 'ô đã DA_NAP: không còn cần xử lý');
  assert.equal(xx(luoi(), 'DOT', TH, N0, 'C'), undefined, 'và dấu không hiệu lực (trạng thái khác)');

  // c3: NGAY — tong_dong đổi
  ctx.db.prepare('DELETE FROM nap_nguon_da_xem_xet').run();
  for (const t of ['arrival_import_files']) ctx.db.prepare(`DELETE FROM ${t}`).run();
  ngayIt(10);
  r = await danhDau({ loai: 'NGAY', bcvh: TH, ngay: N0 });
  assert.equal(r.status, 200);
  assert.ok(xx(luoi(), 'NGAY', TH, N0, null));
  ctx.db.prepare("UPDATE arrival_import_files SET row_count = 20 WHERE file_date = ? AND file_time = '10:30:00'").run(N0);
  assert.ok(cx(luoi(), 'NGAY', TH, N0, null), 'tong_dong đổi 10 → 20 vẫn IT nhưng dấu đã đổi');
  assert.equal(hoatDong().length, 1);
});

test('(d) hủy đánh dấu: mục quay lại, bản ghi giữ (huy_luc, huy_nguoi_ma); hủy lại / id lạ → 404 KHONG_TIM_THAY', async () => {
  dotLoi();
  const { body } = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  const r = await huy(body.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: body.id, da_huy: true });
  const sau = luoi();
  assert.ok(cx(sau, 'DOT', TH, N0, 'S'));
  assert.equal(sau.tong_hop.da_xem_xet, 0);
  const dong = ctx.db.prepare('SELECT * FROM nap_nguon_da_xem_xet WHERE id = ?').get(body.id);
  assert.ok(dong.huy_luc);
  assert.equal(dong.huy_nguoi_ma, 'XX_ADMIN');
  for (const id of [body.id, 99999, 'abc']) {
    const k = await huy(id);
    assert.deepEqual([k.status, k.body.ma], [404, 'KHONG_TIM_THAY']);
    assert.ok(k.body.error);
  }
  // sau khi hủy có thể đánh dấu lại (bản mới)
  const l = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  assert.equal(l.body.da_co, false);
  assert.notEqual(l.body.id, body.id);
});

test('(e) đánh dấu hai lần cùng dấu vân tay: idempotent (da_co true, cùng id); lỗi thời → hủy bản cũ, một bản hoạt động', async () => {
  nguon({ gio: '093012', kichThuoc: 3 });
  const a = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  const b = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S', ghi_chu: 'lần hai' });
  assert.deepEqual([b.status, b.body.da_co, b.body.id], [200, true, a.body.id]);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet').get().n, 1);
  nguon({ gio: '110000', kichThuoc: 9 }); // dấu vân tay đổi → bản a lỗi thời
  const c = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  assert.deepEqual([c.status, c.body.da_co], [200, false]);
  assert.notEqual(c.body.id, a.body.id);
  const tat = ctx.db.prepare('SELECT id, huy_luc FROM nap_nguon_da_xem_xet ORDER BY id').all();
  assert.equal(tat.length, 2);
  assert.ok(tat[0].huy_luc && !tat[1].huy_luc);
  assert.equal(hoatDong().length, 1);
  assert.ok(xx(luoi(), 'DOT', TH, N0, 'S'));
});

test('(f) mục không nằm trong can_xu_ly → 409 KHONG_CAN_XU_LY; MA_LA / loai lạ → 400', async () => {
  fileDb({ gio: '093012' }); // ô S đã nạp
  const a = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' });
  assert.deepEqual([a.status, a.body.ma], [409, 'KHONG_CAN_XU_LY']);
  assert.ok(a.body.error);
  const n = await danhDau({ loai: 'NGAY', bcvh: TH, ngay: N0 });
  assert.deepEqual([n.status, n.body.ma], [409, 'KHONG_CAN_XU_LY']);
  for (const loai of ['MA_LA', 'XYZ', undefined, 1]) {
    const r = await danhDau({ loai, bcvh: TH, ngay: N0, dot: 'S' });
    assert.deepEqual([r.status, r.body.ma], [400, 'THAM_SO_SAI']);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet').get().n, 0);
});

test('(g) quyền: không token 401; TTVH / GDVH / STAFF / TIVI 403 cho cả POST và DELETE; không ghi gì', async () => {
  dotLoi();
  const body = { loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' };
  assert.equal((await danhDau(body, null)).status, 401);
  assert.equal((await huy(1, null)).status, 401);
  for (const who of ['ttvh', 'gdvh', 'staff', 'tivi']) {
    assert.equal((await danhDau(body, who)).status, 403, `POST ${who}`);
    assert.equal((await huy(1, who)).status, 403, `DELETE ${who}`);
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet').get().n, 0);
});

test('(h) thân / tham số sai → 400 THAM_SO_SAI; ghi_chu > 200 ký tự → 400, đúng 200 thì nhận', async () => {
  dotLoi();
  const ok = { loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S' };
  const sai = [
    {}, { ...ok, dot: undefined }, { ...ok, dot: 'X' }, { ...ok, bcvh: '999999' }, { ...ok, bcvh: 5 }, { ...ok, ngay: '2026-13-40' }, { ...ok, ngay: undefined },
    { ...ok, la: 1 }, { ...ok, ghi_chu: 5 }, { ...ok, ghi_chu: 'a'.repeat(201) }, []
  ];
  for (const b of sai) {
    const r = await danhDau(b);
    assert.deepEqual([r.status, r.body && r.body.ma], [400, 'THAM_SO_SAI'], JSON.stringify(b));
  }
  assert.equal((await goi('admin', 'POST', '/api/nap-nguon/da-xem-xet', undefined)).status, 400, 'không có thân');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet').get().n, 0);
  const g = await danhDau({ ...ok, ghi_chu: 'b'.repeat(200) });
  assert.equal(g.status, 200);
  assert.equal(luoi().da_xem_xet[0].ghi_chu.length, 200);
});

test('(i) chưa có bản ghi nào: luoi trả đúng như trước (da_xem_xet = [], tong_hop.da_xem_xet = 0); bảng thiếu cũng không làm hỏng', () => {
  dotLoi();
  const kq = luoi();
  assert.deepEqual([kq.da_xem_xet, kq.tong_hop.da_xem_xet], [[], 0]);
  assert.ok(cx(kq, 'DOT', TH, N0, 'S'));
  for (const k of ['tu', 'den', 'bcvh', 'hom_nay', 'ds_bcvh', 'gio_mong_doi', 'ngay_bat_dau', 'o', 'ngay_bcvh', 'can_xu_ly', 'tong_hop']) assert.ok(k in kq, k);
  assert.deepEqual(Object.keys(kq.tong_hop).sort(), ['da_xem_xet', 'nghi_ngo', 'theo_trang_thai']);
  // db không có bảng mới: bọc giả
  const gia = { prepare: (s) => { if (/nap_nguon_da_xem_xet/.test(s)) throw new Error('no such table: nap_nguon_da_xem_xet'); return ctx.db.prepare(s); } };
  assert.deepEqual(N.luoi({ db: gia, now: new Date(), tu: ngay(-5), den: ngay(-1), bcvh: TH }).da_xem_xet, []);
});

test('(j) SECURITY_LOG: một dòng mỗi lần đánh dấu / hủy; không có ghi chú, SHBG hay dãy ≥ 15 chữ số', async () => {
  dotLoi();
  const truoc = fs.existsSync(process.env.SECURITY_LOG) ? fs.statSync(process.env.SECURITY_LOG).size : 0;
  const ghiChu = 'GHI-CHU-BI-MAT-XYZ';
  const a = await danhDau({ loai: 'DOT', bcvh: TH, ngay: N0, dot: 'S', ghi_chu: ghiChu });
  await huy(a.body.id);
  await new Promise((r) => setTimeout(r, 200));
  const s = fs.readFileSync(process.env.SECURITY_LOG).subarray(truoc).toString('utf8').split('\n').filter((l) => l.includes('da_xem_xet'));
  const dd = s.filter((l) => l.includes('"event":"nap_nguon_da_xem_xet"'));
  const hh = s.filter((l) => l.includes('"event":"nap_nguon_huy_da_xem_xet"'));
  assert.equal(dd.length, 1);
  assert.equal(hh.length, 1);
  const j = JSON.parse(dd[0]);
  assert.deepEqual([j.hrm_code, j.role, j.ket_qua, j.loai, j.bcvh, j.ngay], ['XX_ADMIN', 'ADMIN', 'ok', 'DOT', TH, N0]);
  const toan = s.join('\n');
  assert.ok(!toan.includes(ghiChu));
  assert.ok(!/\d{15,}/.test(toan));
});

test('(l) đo thời gian luoi 62 ngày × 6 BCVH (có bản ghi đã xem xét) vẫn nhanh', () => {
  const tu = ngay(-62);
  const den = ngay(-1);
  const ds = N.MA_BCVH;
  for (let i = 1; i <= 62; i += 3) for (const b of ds) fileDb({ bcvh: b, ngay: ngay(-i), gio: '093012', status: i % 2 ? 'REJECTED' : 'OK', rows: 50 });
  for (const r of ctx.db.prepare("SELECT DISTINCT unit_code AS b, file_date AS n FROM arrival_import_files WHERE status = 'REJECTED' LIMIT 100").all()) {
    ctx.db.prepare(`INSERT INTO nap_nguon_da_xem_xet (loai, bcvh, ngay, dot, trang_thai, ly_do, dau_van_tay, nguoi_ma, tao_luc) VALUES ('DOT', ?, ?, 'S', 'LOI', 'REJECTED', 'x', 'XX_ADMIN', '2026-10-14T00:00:00.000Z')`).run(r.b, r.n);
  }
  N.luoi({ db: ctx.db, now: new Date(), tu, den }); // khởi động nóng
  const t0 = process.hrtime.bigint();
  const kq = N.luoi({ db: ctx.db, now: new Date(), tu, den });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`luoi 62 ngày × 6 BCVH: ${ms.toFixed(1)} ms (${kq.o.length} ô)`);
  assert.equal(kq.o.length, 62 * 6 * 2);
  assert.ok(ms < 1000, `luoi chậm: ${ms} ms`);
});
