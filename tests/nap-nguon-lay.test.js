// ==========================================
// Test SANLUONG-5f-2: «Lấy ngay» và «Lấy lại» (server/lib/napNguonLay.js + POST /api/nap-nguon/lay-ngay | lay-lai) và phần ghi người bấm / loại lượt.
// Server thật + DB tạm của harness; nguồn SFTP GIẢ (không mạng, không ssh2; SFTP_* bị cách ly, nguồn mặc định CẤM MẠNG); CSV / số liệu GIẢ dựng lúc chạy (không dãy ≥ 15 chữ số);
// `sleep` được tiêm (không chờ 60 giây thật). Việc nạp chạy NỀN sau 202 — test đợi bằng napNguonLay.doiHetNen().
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv, nguonCamMang } = require('./helpers/khongMang');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const X = require('../server/lib/thayTheXemTruoc');
const L = require('../server/lib/napNguonLay');
const S = require('../server/lib/sftpSync');
const Sch = require('../server/lib/sftpScheduler');
const CF = require('../server/config/nap-nguon');

const PORT = 5933;
const D1 = '/CSV_Report_533140';
const MA = ['533140', '535470', '536250', '537015', '537220', '535790'];
const USERS = {
  admin: { hrm: 'LY_ADMIN', ten: 'Quản Trị Lấy', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'LY_TTVH', ten: 'ttvh', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'LY_GDVH', ten: 'gdvh', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'LY_TIVI', ten: 'tivi', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhuc = [cachLySftpEnv()];
let ctx;
let RealDatabase;
let tmpRoot;
const HOM = S.ngayBangkok(new Date());
const ngay = (n) => S.congNgay(HOM, n);

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-naplay-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-naplay-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  RealDatabase = ctx.db.constructor;
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.ten, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await L.doiHetNen();
  L.datTuyChon(null);
  X.datNguon(null);
  for (const r of khoiPhuc.reverse()) r();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await L.doiHetNen();
  cachLySftpEnv();
  X.datNguon(nguonCamMang([D1]));
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot });
  for (const t of ['sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'arrival_items', 'arrival_import_files', 'ward_bdx_map']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- dữ liệu giả ----------
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
let seq = 0;
function csv(n, { ma = '533140', ngayF = HOM, header = EXPECTED_HEADER } = {}) {
  const rows = Array.from({ length: n }, () => {
    seq++;
    return { Ma_BC_dong: '990001', BC_nhan_BG: ma, Ten_duong_thu: 'Đường A', SHBG: `ZZ${String(900000000 + seq)}VN`, So_hieu_BD10: '', 'Thời gian XN túi': `${ngayF} 08:00:00`, 'Thời gian XN BG': 'NULL',
      Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'x', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử' };
  });
  return Buffer.from('﻿' + [header.map(qt).join(','), ...rows.map((r) => header.map((h) => qt(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
}
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const ten = (ma, ngayF, hms) => `HangDen_${ma}_${ngayF.replace(/-/g, '')}_${hms}.csv`;
const f = (buf, mtime = 1760400000000) => ({ buf, mtime });
const loiXacThuc = () => Object.assign(new Error('All configured authentication methods failed'), { code: 'ERR_GENERIC_CLIENT' });

/** Nguồn giả. opts: loiKetNoi, loiList (ném ở list), chan (promise chặn list), bienDong (Set tên: mtime đổi ở lần liệt kê thứ hai), loiGet. */
function nguonGia(files, opts = {}) {
  const calls = { list: 0, get: [], end: 0 };
  const lanTheoDir = {};
  return {
    calls, files,
    async list(d) {
      calls.list++;
      lanTheoDir[d] = (lanTheoDir[d] || 0) + 1;
      if (opts.chan) await opts.chan;
      if (opts.loiList) throw opts.loiList;
      return Object.entries(files[d] || {}).map(([name, x]) => ({ type: '-', name, size: x.buf.length, modifyTime: x.mtime + (opts.bienDong && opts.bienDong.has(name) && lanTheoDir[d] > 1 ? 1 : 0) }));
    },
    async get(xa, cb) { const name = xa.slice(xa.lastIndexOf('/') + 1); calls.get.push(name); if (opts.loiGet) throw opts.loiGet; fs.writeFileSync(cb, files[xa.slice(0, xa.lastIndexOf('/'))][name].buf); },
    async end() { calls.end++; }
  };
}
const datNguon = (src, extra = {}) => X.datNguon({ ketNoi: async () => src, dirs: [D1], bimat: [], ...extra });

const goiGet = (who, url) => fetch(`${ctx.baseUrl}${url}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const goiPost = (who, url, body) => fetch(`${ctx.baseUrl}${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const layNgay = (who = 'admin', body = {}) => goiPost(who, '/api/nap-nguon/lay-ngay', body);
const layLai = (who, body) => goiPost(who, '/api/nap-nguon/lay-lai', body);
const nen = () => L.doiHetNen();

const hang = (id) => ctx.db.prepare('SELECT * FROM sftp_sync_runs WHERE id = ?').get(id);
const dsFile = (id) => ctx.db.prepare('SELECT ten_file, ket_qua, so_dong, ma_loi, chi_tiet FROM sftp_sync_files WHERE run_id = ? ORDER BY id').all(id);
const dem = (t, w = '1=1', ...p) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`).get(...p).n;
const tmpSach = () => fs.readdirSync(tmpRoot).filter((n) => n.startsWith('hue-dhcl-')).length === 0;
const nap = async (name, buf) => { const p = path.join(tmpRoot, name); fs.writeFileSync(p, buf); const r = await importArrivalFile(ctx.db, p, { source: 'SFTP' }); fs.rmSync(p, { force: true }); return r; };
const chupDuLieu = () => JSON.stringify([ctx.db.prepare('SELECT * FROM arrival_items ORDER BY id').all(), ctx.db.prepare('SELECT * FROM arrival_import_files ORDER BY id').all()]);

// =====================================================================
// KHỐI 1 — lược đồ, người bấm, loại lượt
// =====================================================================
test('cột mới của sftp_sync_runs: đã có sau khi khởi động; chạy lại không lỗi; DB cũ (chưa có cột) nâng cấp được, hàng cũ để NULL', () => {
  const cot = () => ctx.db.prepare('PRAGMA table_info(sftp_sync_runs)').all().map((c) => c.name);
  for (const c of ['loai', 'nguoi_bam_ma', 'nguoi_bam_ten', 'so_o_yeu_cau']) assert.ok(cot().includes(c), c);
  L.ensureLuotSchema(ctx.db);
  L.ensureLuotSchema(ctx.db);
  assert.deepEqual(L.COT_THEM.map((c) => c[0]), ['loai', 'nguoi_bam_ma', 'nguoi_bam_ten', 'so_o_yeu_cau']);
  assert.throws(() => ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, loai) VALUES ('x', 'LA')").run(), 'CHECK loai');
  // DB cũ
  const duong = path.join(tmpRoot, 'cu.db');
  const cu = new RealDatabase(duong);
  try {
    S.ensureSftpSyncSchema(cu);
    cu.prepare("INSERT INTO sftp_sync_runs (started_at, finished_at, \"trigger\") VALUES ('2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z', 'TIMER')").run();
    const truoc = cu.prepare('PRAGMA table_info(sftp_sync_runs)').all().map((c) => c.name);
    assert.ok(!truoc.includes('loai'));
    L.ensureLuotSchema(cu);
    L.ensureLuotSchema(cu);
    const sau = cu.prepare('PRAGMA table_info(sftp_sync_runs)').all().map((c) => c.name);
    assert.deepEqual(sau.filter((c) => !truoc.includes(c)), ['loai', 'nguoi_bam_ma', 'nguoi_bam_ten', 'so_o_yeu_cau']);
    const r = cu.prepare('SELECT * FROM sftp_sync_runs').get();
    assert.deepEqual([r.loai, r.nguoi_bam_ma, r.nguoi_bam_ten, r.so_o_yeu_cau, r.trigger], [null, null, null, null, 'TIMER']);
  } finally { cu.close(); fs.rmSync(duong, { force: true }); fs.rmSync(`${duong}-wal`, { force: true }); fs.rmSync(`${duong}-shm`, { force: true }); }
});

test('ghi người bấm: mã + họ tên (từ bảng users), started_at = giờ bấm (UTC), loai, trigger MANUAL; 5f-1 trả nguoi / loai ở /luot, /luot/:id, /tong-quan; lượt cũ nguoi = null', async () => {
  const cu = Number(ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, finished_at, \"trigger\") VALUES ('2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z', 'MANUAL')").run().lastInsertRowid);
  datNguon(nguonGia({ [D1]: {} }));
  const truoc = Date.now();
  const r = await layNgay();
  assert.equal(r.status, 202);
  assert.deepEqual(Object.keys(r.body), ['luot_id', 'bat_dau']);
  assert.ok(Math.abs(Date.parse(r.body.bat_dau) - truoc) < 5000);
  await nen();
  const h = hang(r.body.luot_id);
  assert.deepEqual([h.started_at, h.trigger, h.loai, h.nguoi_bam_ma, h.nguoi_bam_ten, h.so_o_yeu_cau], [r.body.bat_dau, 'MANUAL', 'LAY_NGAY', 'LY_ADMIN', 'Quản Trị Lấy', null]);
  assert.ok(h.finished_at, 'lượt đã đóng');
  const ct = await goiGet('admin', `/api/nap-nguon/luot/${r.body.luot_id}`);
  assert.deepEqual([ct.body.nguoi, ct.body.loai, ct.body.cach_chay, ct.body.ket_qua], [{ ma: 'LY_ADMIN', ten: 'Quản Trị Lấy' }, 'LAY_NGAY', 'TAY', 'THANH_CONG']);
  const ds = await goiGet('admin', '/api/nap-nguon/luot');
  assert.deepEqual(ds.body.luot.map((x) => [x.id, x.nguoi && x.nguoi.ma, x.loai]), [[r.body.luot_id, 'LY_ADMIN', 'LAY_NGAY'], [cu, null, null]]);
  const tq = await goiGet('admin', '/api/nap-nguon/tong-quan');
  assert.deepEqual(tq.body.luot_gan_nhat, { id: r.body.luot_id, bat_dau: r.body.bat_dau, cach_chay: 'TAY', loai: 'LAY_NGAY', nguoi: { ma: 'LY_ADMIN', ten: 'Quản Trị Lấy' }, ket_qua: 'THANH_CONG' });
  assert.ok(!JSON.stringify(ds.body).includes('"ip"') && !/token|password/i.test(JSON.stringify(hang(r.body.luot_id))), 'không lưu IP / token');
});

// =====================================================================
// QUYỀN, THÂN SAI
// =====================================================================
test('quyền: ADMIN 202; TTVH, GDVH, TIVI 403 (không chạm nguồn); không token 401 — cả lay-ngay lẫn lay-lai', async () => {
  const src = nguonGia({ [D1]: {} });
  datNguon(src);
  const bodyLai = { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] };
  for (const who of ['ttvh', 'gdvh', 'tivi']) {
    assert.equal((await layNgay(who)).status, 403, who);
    assert.equal((await layLai(who, bodyLai)).status, 403, who);
  }
  assert.equal((await layNgay(null)).status, 401);
  assert.equal((await layLai(null, bodyLai)).status, 401);
  assert.equal(src.calls.list, 0);
  assert.equal(dem('sftp_sync_runs'), 0, 'không tạo lượt');
  assert.equal((await layNgay('admin')).status, 202);
  await nen();
  assert.equal((await layLai('admin', bodyLai)).status, 202);
  await nen();
  assert.equal(dem('sftp_sync_runs'), 2);
});

test('thân sai -> 400 THAM_SO_SAI, không tạo lượt: lay-ngay (trường lạ, mảng), lay-lai (thiếu o, 0 hoặc 21 ô, trường lạ, bcvh / dot / ngày sai, ngày tương lai)', async () => {
  datNguon(nguonGia({ [D1]: {} }));
  const sai = async (r) => { assert.deepEqual([r.status, r.body.ma], [400, 'THAM_SO_SAI'], JSON.stringify(r.body)); };
  await sai(await layNgay('admin', { x: 1 }));
  await sai(await layNgay('admin', []));
  const o1 = { bcvh: '533140', ngay: ngay(-1), dot: 'S' };
  await sai(await layLai('admin', {}));
  await sai(await layLai('admin', { o: [] }));
  await sai(await layLai('admin', { o: 'x' }));
  await sai(await layLai('admin', { o: Array.from({ length: 21 }, (_, i) => ({ bcvh: '533140', ngay: ngay(-1 - i), dot: 'S' })) }));
  await sai(await layLai('admin', { o: [o1], them: 1 }));
  await sai(await layLai('admin', { o: [{ ...o1, x: 1 }] }));
  await sai(await layLai('admin', { o: [{ ...o1, bcvh: '000000' }] }));
  await sai(await layLai('admin', { o: [{ ...o1, bcvh: 533140 }] }));
  await sai(await layLai('admin', { o: [{ ...o1, dot: 'X' }] }));
  await sai(await layLai('admin', { o: [{ ...o1, dot: 's' }] }));
  await sai(await layLai('admin', { o: [{ ...o1, ngay: '2026-02-30' }] }));
  await sai(await layLai('admin', { o: [{ ...o1, ngay: '12/10/2026' }] }));
  await sai(await layLai('admin', { o: [{ ...o1, ngay: ngay(1) }] }));
  await sai(await layLai('admin', { o: [o1, null] }));
  assert.equal(dem('sftp_sync_runs'), 0);
  // đúng 20 ô thì được; trùng ô được loại trùng (giữ lần đầu)
  const hai = await layLai('admin', { o: [o1, o1, { ...o1, dot: 'C' }] });
  assert.equal(hai.status, 202);
  assert.deepEqual(hai.body.o.map((x) => x.dot), ['S', 'C']);
  await nen();
  assert.equal(hang(hai.body.luot_id).so_o_yeu_cau, 2);
  const hai0 = await layLai('admin', { o: Array.from({ length: CF.SO_O_TOI_DA_LAY_LAI }, (_, i) => ({ bcvh: '533140', ngay: ngay(-1 - i), dot: 'S' })) });
  assert.equal(hai0.status, 202);
  await nen();
});

// =====================================================================
// KHOÁ
// =====================================================================
test('khoá: lượt đang chạy -> 409 DANG_CHAY kèm luot_id; hàng khoá «Thay thế ngày» -> 409 không lộ chi tiết; lượt treo > 30 phút bị đóng và cho qua', async () => {
  const src = nguonGia({ [D1]: {} });
  datNguon(src);
  const dang = Number(ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, \"trigger\") VALUES (?, 'TIMER')").run(new Date(Date.now() - 5 * 60000).toISOString()).lastInsertRowid);
  const bodyLai = { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] };
  for (const r of [await layNgay(), await layLai('admin', bodyLai)]) {
    assert.deepEqual([r.status, r.body.ma, r.body.luot_id], [409, 'DANG_CHAY', dang]);
  }
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), dang);
  ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, \"trigger\", ghi_chu_loi) VALUES (?, 'MANUAL', ?)").run(new Date().toISOString(), `${CF.TIEN_TO_KHOA_THAY_THE} (không phải lượt đồng bộ). bí mật nội bộ`);
  for (const r of [await layNgay(), await layLai('admin', bodyLai)]) {
    assert.deepEqual([r.status, r.body.ma, r.body.luot_id], [409, 'DANG_CHAY', undefined]);
    assert.ok(!JSON.stringify(r.body).includes('Thay thế') && !JSON.stringify(r.body).includes('bí mật'), 'không lộ chi tiết hàng khoá');
  }
  assert.equal(src.calls.list, 0, 'bị khoá thì không chạm nguồn');
  assert.equal(dem('sftp_sync_runs', "loai IS NOT NULL"), 0);
  // lượt treo > 30 phút
  ctx.db.prepare('DELETE FROM sftp_sync_runs').run();
  const treo = Number(ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, \"trigger\") VALUES (?, 'TIMER')").run(new Date(Date.now() - 40 * 60000).toISOString()).lastInsertRowid);
  const ok = await layNgay();
  assert.equal(ok.status, 202);
  await nen();
  assert.match(hang(treo).ghi_chu_loi, /treo/);
  assert.ok(hang(treo).finished_at);
});

test('hẹn giờ TAM_DUNG (lỗi xác thực / vân tay): 409 TAM_DUNG và KHÔNG gọi nguồn; hẹn giờ đang DANG_CHAY: 409 DANG_CHAY', async () => {
  const src = nguonGia({ [D1]: {} });
  let ketNoi = 0;
  X.datNguon({ ketNoi: async () => { ketNoi++; return src; }, dirs: [D1], bimat: [] });
  const goc = Sch.docTrangThaiSftp;
  try {
    Sch.docTrangThaiSftp = () => ({ trangThai: 'TAM_DUNG', lyDo: 'VAN_TAY_SAI' });
    const body = { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] };
    for (const r of [await layNgay(), await layLai('admin', body)]) assert.deepEqual([r.status, r.body.ma, r.body.ly_do], [409, 'TAM_DUNG', 'VAN_TAY']);
    Sch.docTrangThaiSftp = () => ({ trangThai: 'TAM_DUNG', lyDo: 'XAC_THUC' });
    assert.equal((await layNgay()).body.ly_do, 'XAC_THUC');
    Sch.docTrangThaiSftp = () => ({ trangThai: 'DANG_CHAY' });
    assert.deepEqual([(await layNgay()).status, (await layNgay()).body.ma], [409, 'DANG_CHAY']);
  } finally { Sch.docTrangThaiSftp = goc; }
  assert.equal(ketNoi, 0, 'không kết nối');
  assert.equal(src.calls.list, 0);
  assert.equal(dem('sftp_sync_runs'), 0);
});

test('thiếu cấu hình SFTP -> 503 CHUA_CAU_HINH (chỉ nêu TÊN biến, không giá trị); không tạo lượt', async () => {
  X.datNguon(null);
  const body = { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] };
  for (const r of [await layNgay(), await layLai('admin', body)]) {
    assert.deepEqual([r.status, r.body.ma], [503, 'CHUA_CAU_HINH']);
    assert.match(r.body.error, /SFTP_/);
  }
  assert.equal(dem('sftp_sync_runs'), 0);
});

test('hai yêu cầu đồng thời (lay-ngay + lay-lai, và hai lay-ngay): đúng MỘT 202, yêu cầu kia 409 DANG_CHAY; khoá nhả sau khi xong', async () => {
  let mo; const chan = new Promise((r) => { mo = r; });
  const src = nguonGia({ [D1]: {} }, { chan });
  datNguon(src);
  const body = { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] };
  const [a, b] = await Promise.all([layNgay(), layLai('admin', body)]);
  assert.deepEqual([a.status, b.status].sort(), [202, 409]);
  const thua = a.status === 409 ? a : b;
  assert.equal(thua.body.ma, 'DANG_CHAY');
  const [c, d] = await Promise.all([layNgay(), layNgay()]);
  assert.deepEqual([c.status, d.status], [409, 409], 'lượt đầu vẫn đang chạy');
  const tq = await goiGet('admin', '/api/nap-nguon/tong-quan');
  assert.equal(tq.body.dang_chay.nguoi.ma, 'LY_ADMIN');
  assert.ok(['LAY_NGAY', 'LAY_LAI'].includes(tq.body.dang_chay.loai));
  mo();
  await nen();
  assert.equal(dem('sftp_sync_runs', 'finished_at IS NULL'), 0);
  assert.equal((await layNgay()).status, 202);
  await nen();
});

// =====================================================================
// «LẤY NGAY»
// =====================================================================
test('lay-ngay: cùng lõi đồng bộ (ổn định hai lần liệt kê, cửa sổ 3 ngày), tối đa 20 file, CŨ trước; file đã nạp bỏ qua (không nạp đè); file ngoài cửa sổ không lấy', async () => {
  const files = {};
  const mk = (ma, d, hms) => { files[ten(ma, d, hms)] = f(csv(2, { ma, ngayF: d })); };
  for (const d of [-3, -2, -1, 0]) for (const ma of MA) { mk(ma, ngay(d), '093012'); mk(ma, ngay(d), '163011'); } // 48 file trong cửa sổ
  mk('533140', ngay(-10), '093012'); // ngoài cửa sổ
  const da = ten('533140', ngay(-3), '093012');
  await nap(da, files[`${da}`].buf);
  const truocDa = chupDuLieu();
  const src = nguonGia({ [D1]: files });
  datNguon(src);
  const r = await layNgay();
  assert.equal(r.status, 202);
  await nen();
  const h = hang(r.body.luot_id);
  assert.ok(h.finished_at);
  const kq = dsFile(r.body.luot_id);
  const dn = kq.filter((x) => x.ket_qua === 'DA_NAP');
  assert.equal(dn.length, CF.SO_FILE_TOI_DA_LAY_NGAY);
  assert.equal(CF.SO_FILE_TOI_DA_LAY_NGAY, 20);
  assert.equal(kq.find((x) => x.ten_file === da).ket_qua, 'DA_CO', 'file đã nạp: bỏ qua');
  assert.equal(kq.filter((x) => x.ma_loi === 'VUOT_TOI_DA').length, 48 - 1 - 20);
  assert.ok(!kq.some((x) => x.ten_file === ten('533140', ngay(-10), '093012')), 'ngoài cửa sổ: không xét');
  // cũ trước: mọi file đã nạp có ngày <= ngày của file bị hoãn
  const nap_ = dn.map((x) => /_(\d{8})_/.exec(x.ten_file)[1]);
  const hoan = kq.filter((x) => x.ma_loi === 'VUOT_TOI_DA').map((x) => /_(\d{8})_/.exec(x.ten_file)[1]);
  assert.ok(Math.max(...nap_) <= Math.min(...hoan));
  assert.deepEqual([h.da_nap, h.da_co, h.loai, h.trigger], [20, 1, 'LAY_NGAY', 'MANUAL']);
  assert.equal(chupDuLieu().includes(JSON.stringify(JSON.parse(truocDa)[0][0])), true, 'dữ liệu có trước vẫn nguyên');
  assert.equal(src.calls.end, 1);
  assert.ok(tmpSach());
  // lần hai: lấy tiếp 20 file kế (cũ trước), không nạp lại
  const r2 = await layNgay();
  await nen();
  assert.equal(dsFile(r2.body.luot_id).filter((x) => x.ket_qua === 'DA_NAP').length, 20);
});

test('lay-ngay: file mtime đổi giữa hai lần liệt kê -> CHUA_ON_DINH, không nạp', async () => {
  const a = ten('533140', ngay(-1), '093012');
  const b = ten('533140', ngay(-1), '163011');
  const src = nguonGia({ [D1]: { [a]: f(csv(2, { ngayF: ngay(-1) })), [b]: f(csv(2, { ngayF: ngay(-1) })) } }, { bienDong: new Set([b]) });
  datNguon(src);
  const r = await layNgay();
  await nen();
  assert.deepEqual(dsFile(r.body.luot_id).map((x) => [x.ten_file, x.ket_qua]).sort(), [[a, 'DA_NAP'], [b, 'CHUA_ON_DINH']].sort());
  assert.deepEqual(src.calls.get, [a]);
});

// =====================================================================
// «LẤY LẠI»
// =====================================================================
test('lay-lai: ngày ngoài cửa sổ 3 ngày vẫn lấy được; nguồn không có file của ô -> NGUON_KHONG_CO; cờ da_co_nhap_tay; ghi người bấm + so_o_yeu_cau; kết quả từng ô trong sftp_sync_files', async () => {
  const cu = ngay(-10);
  const c = ten('533140', cu, '163011');
  const src = nguonGia({ [D1]: { [c]: f(csv(3, { ngayF: cu })), [ten('535470', cu, '093012')]: f(csv(2, { ma: '535470', ngayF: cu })) } });
  datNguon(src);
  await nap(ten('533140', cu, '235959'), csv(5, { ngayF: cu })); // nhập tay của 533140 hôm đó
  ctx.db.prepare("UPDATE arrival_import_files SET source = 'MANUAL' WHERE file_name = ?").run(ten('533140', cu, '235959'));
  const truoc = chupDuLieu();
  const r = await layLai('admin', { o: [{ bcvh: '533140', ngay: cu, dot: 'C' }, { bcvh: '533140', ngay: cu, dot: 'S' }, { bcvh: '535470', ngay: cu, dot: 'S' }] });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.deepEqual(r.body.o, [{ bcvh: '533140', ngay: cu, dot: 'C', da_co_nhap_tay: true }, { bcvh: '533140', ngay: cu, dot: 'S', da_co_nhap_tay: true }, { bcvh: '535470', ngay: cu, dot: 'S', da_co_nhap_tay: false }]);
  await nen();
  const h = hang(r.body.luot_id);
  assert.deepEqual([h.loai, h.trigger, h.so_o_yeu_cau, h.nguoi_bam_ma, h.nguoi_bam_ten, h.da_nap, h.bo_qua_khac, h.loi], ['LAY_LAI', 'MANUAL', 3, 'LY_ADMIN', 'Quản Trị Lấy', 2, 1, 0]);
  assert.ok(h.finished_at);
  const kq = dsFile(r.body.luot_id);
  assert.deepEqual(kq.map((x) => [x.ket_qua, x.ma_loi]).sort(), [['BO_QUA', 'NGUON_KHONG_CO'], ['DA_NAP', null], ['DA_NAP', null]]);
  assert.equal(kq.find((x) => x.ket_qua === 'BO_QUA').ten_file, `HangDen_533140_${cu.replace(/-/g, '')}_S`, 'ô không có file: tên đại diện của ô');
  assert.equal(dem('arrival_import_files', "file_name = ? AND status = 'OK'", c), 1);
  // chỉ THÊM: dữ liệu có trước nguyên vẹn
  const sau = JSON.parse(chupDuLieu());
  const cuItems = JSON.parse(truoc)[0];
  assert.deepEqual(sau[0].slice(0, cuItems.length), cuItems);
  assert.ok(sau[0].length > cuItems.length);
  assert.deepEqual(sau[1].slice(0, 1), JSON.parse(truoc)[1].slice(0, 1));
  assert.ok(tmpSach());
});

test('lay-lai: không nạp đè file đã OK (DA_CO, importer không chạy); một ô lỗi không chặn ô khác; REJECTED cũ lấy lại được khi nguồn đã sửa; CHUA_ON_DINH', async () => {
  const d = ngay(-2);
  const tot = ten('533140', d, '093012');
  const hong = ten('533140', d, '163011');
  const khac = ten('535470', d, '093012');
  const dinh = ten('536250', d, '093012');
  const files = { [tot]: f(csv(2, { ngayF: d })), [hong]: f(csv(2, { ngayF: d, header: ['a', 'b'] })), [khac]: f(csv(2, { ma: '535470', ngayF: d })), [dinh]: f(csv(2, { ma: '536250', ngayF: d })) };
  await nap(tot, files[tot].buf); // đã OK
  const truoc = chupDuLieu();
  let goiImporter = 0;
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot, importFn: async (...a) => { goiImporter++; return importArrivalFile(...a); } });
  const src = nguonGia({ [D1]: files }, { bienDong: new Set([dinh]) });
  datNguon(src);
  const cacO = [{ bcvh: '533140', ngay: d, dot: 'S' }, { bcvh: '533140', ngay: d, dot: 'C' }, { bcvh: '535470', ngay: d, dot: 'S' }, { bcvh: '536250', ngay: d, dot: 'S' }];
  const r = await layLai('admin', { o: cacO });
  await nen();
  const kq = Object.fromEntries(dsFile(r.body.luot_id).map((x) => [x.ten_file, x]));
  assert.equal(kq[tot].ket_qua, 'DA_CO');
  assert.equal(kq[hong].ket_qua, 'LOI');
  assert.equal(kq[hong].ma_loi, 'REJECTED');
  assert.equal(kq[khac].ket_qua, 'DA_NAP');
  assert.equal(kq[dinh].ket_qua, 'CHUA_ON_DINH');
  assert.equal(goiImporter, 2, 'chỉ file hỏng và file tốt của BCVH khác qua importer');
  assert.ok(!src.calls.get.includes(tot) && !src.calls.get.includes(dinh));
  const h = hang(r.body.luot_id);
  assert.deepEqual([h.da_nap, h.da_co, h.chua_on_dinh, h.loi], [1, 1, 1, 1]);
  assert.equal(dem('arrival_import_files', "file_name = ?", tot), 1, 'không nạp đè');
  assert.equal(JSON.parse(chupDuLieu())[0].slice(0, JSON.parse(truoc)[0].length).length, JSON.parse(truoc)[0].length);
  // nguồn đã sửa file hỏng (cùng tên, nội dung khác) -> lấy lại được dù có bản ghi REJECTED
  assert.equal(dem('arrival_import_files', "file_name = ? AND status = 'REJECTED'", hong), 1);
  files[hong] = f(csv(4, { ngayF: d }));
  const r2 = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'C' }] });
  await nen();
  assert.deepEqual(dsFile(r2.body.luot_id).map((x) => [x.ten_file, x.ket_qua, x.so_dong]), [[hong, 'DA_NAP', 4]]);
  assert.equal(dem('arrival_import_files', "file_name = ? AND status = 'OK'", hong), 1);
});

test('lay-lai ô RONG: bản ghi rỗng cùng kích thước -> DA_CO; nguồn nay có nội dung khác -> KHONG_THE_LAY_LAI (BO_QUA) có lý do cụ thể, không âm thầm bỏ qua, không ghi đè; ô khác vẫn chạy', async () => {
  const d = ngay(-2);
  const rong = ten('533140', d, '093012');
  const tot = ten('533140', d, '163011');
  assert.equal((await nap(rong, BOM)).status, 'EMPTY');
  const files = { [rong]: f(BOM), [tot]: f(csv(2, { ngayF: d })) };
  datNguon(nguonGia({ [D1]: files }));
  let r = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'S' }] });
  await nen();
  assert.deepEqual(dsFile(r.body.luot_id).map((x) => x.ket_qua), ['DA_CO']);
  files[rong] = f(csv(3, { ngayF: d }));
  const truoc = chupDuLieu();
  r = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'S' }, { bcvh: '533140', ngay: d, dot: 'C' }] });
  await nen();
  const kq = Object.fromEntries(dsFile(r.body.luot_id).map((x) => [x.ten_file, x]));
  assert.deepEqual([kq[rong].ket_qua, kq[rong].ma_loi], ['BO_QUA', 'KHONG_THE_LAY_LAI']);
  assert.match(kq[rong].chi_tiet, /^DA_GHI_RONG_KHAC_NOI_DUNG/);
  assert.equal(kq[tot].ket_qua, 'DA_NAP');
  assert.equal(dem('arrival_import_files', 'file_name = ?', rong), 1, 'bản ghi rỗng không bị ghi đè hay thêm CONFLICT');
  assert.equal(hang(r.body.luot_id).loi, 0);
  assert.ok(JSON.parse(chupDuLieu())[0].length > JSON.parse(truoc)[0].length);
});

// =====================================================================
// LỖI: xác thực / vân tay, bất ngờ, bí mật
// =====================================================================
test('lỗi xác thực / vân tay sai ở lượt tay: ghi lượt lỗi + đóng hàng + nhả khoá + đưa hẹn giờ về TAM_DUNG (đúng lý do), không thử lại — lay-ngay và lay-lai', async () => {
  const goi = [];
  const goc = Sch.tamDungHenGio;
  Sch.tamDungHenGio = (lyDo) => { goi.push(lyDo); return true; };
  try {
    let lan = 0;
    X.datNguon({ ketNoi: async () => { lan++; throw loiXacThuc(); }, dirs: [D1], bimat: ['mat-khau-gia'] });
    const a = await layNgay();
    await nen();
    assert.deepEqual([hang(a.body.luot_id).loi, !!hang(a.body.luot_id).finished_at], [1, true]);
    assert.match(hang(a.body.luot_id).ghi_chu_loi, /xac_thuc/);
    X.datNguon({ ketNoi: async () => { lan++; throw Object.assign(new Error('Handshake failed'), { saiVanTay: true }); }, dirs: [D1], bimat: [] });
    const b = await layLai('admin', { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] });
    await nen();
    assert.deepEqual([hang(b.body.luot_id).loi, !!hang(b.body.luot_id).finished_at], [1, true]);
    // xác thực sai ở lúc liệt kê (lay-lai)
    X.datNguon({ ketNoi: async () => nguonGia({}, { loiList: loiXacThuc() }), dirs: [D1], bimat: [] });
    const c = await layLai('admin', { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] });
    await nen();
    assert.equal(hang(c.body.luot_id).loi, 1);
    assert.deepEqual(goi, ['XAC_THUC', 'VAN_TAY_SAI', 'XAC_THUC']);
    assert.equal(lan, 2, 'mỗi lượt chỉ thử một lần');
    assert.equal(dem('sftp_sync_runs', 'finished_at IS NULL'), 0);
  } finally { Sch.tamDungHenGio = goc; }
});

test('bộ hẹn giờ: tamDungHenGio chuyển sang TAM_DUNG đúng lý do (chỉ khi đang bật), lặp lại không làm gì; chưa bật thì không có tác dụng', async () => {
  const ENV = { SFTP_SYNC_ENABLED: '1', SFTP_HOST: 'h.gia', SFTP_PORT: '5454', SFTP_USER: 'u-gia', SFTP_PASSWORD: 'p-gia', SFTP_DIRS: D1, SFTP_HOSTKEY_SHA256: 'a'.repeat(64) };
  const clock = { now: () => new Date(), setTimeout: () => ({}), clearTimeout: () => {} };
  const bo = Sch.taoBoHenGio({ db: ctx.db, env: ENV, clock, tmpDir: tmpRoot, sleep: async () => {}, log: () => {}, choPhepTrongTest: true, ketNoi: async () => nguonGia({}) });
  assert.equal(bo.tamDungNgoai('XAC_THUC', 'x'), false, 'chưa bật batDau()');
  bo.batDau();
  assert.equal(bo.trangThai().trangThai, 'CHO');
  assert.equal(bo.tamDungNgoai('VAN_TAY_SAI', 'x'), true);
  assert.deepEqual([bo.trangThai().trangThai, bo.trangThai().lyDo], ['TAM_DUNG', 'VAN_TAY_SAI']);
  assert.equal(bo.tamDungNgoai('XAC_THUC', 'x'), false);
  assert.equal(Sch.tamDungHenGio('XAC_THUC', 'x'), false, 'không phải hẹn giờ của máy chủ (harness tắt) -> không tác dụng');
  await bo.dung();
});

test('lỗi bất ngờ: syncFn ném, importFn ném, list ném, get ném — lượt vẫn ĐÓNG (finished_at), khoá nhả (yêu cầu sau vẫn 202), tệp tạm sạch, client.end gọi', async () => {
  const kiemTra = async (id) => { const h = hang(id); assert.ok(h.finished_at, 'đã đóng'); assert.ok(h.loi >= 1, 'có ghi lỗi'); assert.equal(dem('sftp_sync_runs', 'finished_at IS NULL'), 0); };
  // lay-ngay: lõi đồng bộ ném
  const s1 = nguonGia({ [D1]: {} });
  datNguon(s1);
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot, syncFn: async () => { throw new Error('nổ giả trong lõi'); } });
  const a = await layNgay();
  await nen();
  await kiemTra(a.body.luot_id);
  assert.match(hang(a.body.luot_id).ghi_chu_loi, /Lỗi bất ngờ/);
  assert.equal(s1.calls.end, 1);
  // lay-ngay: importFn ném (lõi bắt từng file)
  const d = ngay(-1);
  const s2 = nguonGia({ [D1]: { [ten('533140', d, '093012')]: f(csv(2, { ngayF: d })) } });
  datNguon(s2);
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot, importFn: async () => { throw new Error('nổ giả khi nạp'); } });
  const b = await layNgay();
  await nen();
  await kiemTra(b.body.luot_id);
  // lay-lai: importFn ném ở file đầu, file sau vẫn xử lý
  const c1 = ten('533140', d, '093012');
  const c2 = ten('535470', d, '093012');
  const s3 = nguonGia({ [D1]: { [c1]: f(csv(2, { ngayF: d })), [c2]: f(csv(2, { ma: '535470', ngayF: d })) } });
  datNguon(s3);
  let n = 0;
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot, importFn: async (...x) => { if (++n === 1) throw Object.assign(new Error('nổ giả'), { code: 'NO_GIA' }); return importArrivalFile(...x); } });
  const e = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'S' }, { bcvh: '535470', ngay: d, dot: 'S' }] });
  await nen();
  await kiemTra(e.body.luot_id);
  assert.deepEqual(dsFile(e.body.luot_id).map((x) => [x.ket_qua, x.ma_loi]), [['LOI', 'NO_GIA'], ['DA_NAP', null]]);
  // lay-lai: liệt kê ném lỗi mạng
  const s4 = nguonGia({}, { loiList: Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' }) });
  datNguon(s4);
  L.datTuyChon({ sleep: async () => {}, tmpDir: tmpRoot });
  const g = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'S' }] });
  await nen();
  await kiemTra(g.body.luot_id);
  assert.equal(s4.calls.end, 1);
  // lay-lai: get ném
  const s5 = nguonGia({ [D1]: { [c1]: f(csv(2, { ngayF: d })) } }, { loiGet: Object.assign(new Error('đứt giả'), { code: 'ECONNRESET' }) });
  ctx.db.prepare('DELETE FROM arrival_items').run();
  ctx.db.prepare('DELETE FROM arrival_import_files').run();
  datNguon(s5);
  const h = await layLai('admin', { o: [{ bcvh: '533140', ngay: d, dot: 'S' }] });
  await nen();
  await kiemTra(h.body.luot_id);
  assert.equal(dsFile(h.body.luot_id)[0].ma_loi, 'ECONNRESET');
  assert.ok(tmpSach());
  assert.equal((await layNgay()).status, 202);
  await nen();
});

test('không lộ bí mật: SFTP_* giả trong môi trường + chuỗi lỗi chứa chúng -> không có trong phản hồi POST, /luot/:id, /tong-quan, bản ghi lượt, SECURITY_LOG; không dãy ≥ 15 chữ số', async () => {
  const luu = {};
  const gia = { SFTP_HOST: 'nas-bi-mat.noi-bo.example', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-bi-mat', SFTP_PASSWORD: 'mat-khau-bi-mat', SFTP_DIRS: '/thu-muc-nguon-bi-mat', SFTP_HOSTKEY_SHA256: 'b'.repeat(64) };
  for (const k of Object.keys(gia)) { luu[k] = process.env[k]; process.env[k] = gia[k]; }
  try {
    const so = `${'1234567890'.repeat(2)}`;
    X.datNguon({ ketNoi: async () => { throw Object.assign(new Error(`connect ECONNREFUSED nas-bi-mat.noi-bo.example mat-khau-bi-mat nguoi-dung-bi-mat ${so}`), { code: 'ECONNREFUSED' }); }, dirs: [D1], bimat: ['mat-khau-bi-mat', 'nguoi-dung-bi-mat', 'nas-bi-mat.noi-bo.example'] });
    const a = await layNgay();
    const b = await layLai('admin', { o: [{ bcvh: '533140', ngay: ngay(-1), dot: 'S' }] });
    await nen();
    const toan = [JSON.stringify(a.body), JSON.stringify(b.body), JSON.stringify(ctx.db.prepare('SELECT * FROM sftp_sync_runs').all())];
    for (const u of [`/api/nap-nguon/luot/${a.body.luot_id}`, `/api/nap-nguon/luot/${b.body.luot_id}`, '/api/nap-nguon/tong-quan', '/api/nap-nguon/luot']) toan.push(JSON.stringify((await goiGet('admin', u)).body));
    await new Promise((r) => setTimeout(r, 120));
    toan.push(fs.readFileSync(process.env.SECURITY_LOG, 'utf8').split('\n').filter((l) => l.includes('nap_nguon_lay')).join('\n'));
    const s = toan.join('\n');
    for (const bm of ['mat-khau-bi-mat', 'nguoi-dung-bi-mat', 'nas-bi-mat', 'thu-muc-nguon-bi-mat', 'b'.repeat(64)]) assert.ok(!s.includes(bm), `lộ ${bm}`);
    assert.ok(!/\d{15,}/.test(s));
    assert.match(s, /nap_nguon_lay_ngay/);
    const dong = s.split('\n').filter((l) => l.includes('nap_nguon_lay_ngay') && l.startsWith('{'));
    const j = JSON.parse(dong[dong.length - 1]);
    assert.deepEqual([j.hrm_code, j.role, j.ket_qua, j.luot_id], ['LY_ADMIN', 'ADMIN', 'ok', a.body.luot_id]);
  } finally {
    for (const k of Object.keys(gia)) { if (luu[k] === undefined) delete process.env[k]; else process.env[k] = luu[k]; }
  }
});

// =====================================================================
// KIỂM TĨNH
// =====================================================================
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kiểm tĩnh: lõi lấy chỉ gọi list / get / end trên client, không nạp thư viện SFTP, không DELETE / UPDATE dữ liệu đã nạp; sửa sftpSync / sftpScheduler chỉ thêm tham số / hàm; không SQL ghi ngoài sftp_sync_*', () => {
  const raw = doc('server', 'lib', 'napNguonLay.js');
  const code = boChuThich(raw);
  assert.ok(!raw.includes('ssh2') && !/require\(['"]\.\.?\/(db|sftpConnect)/.test(raw));
  assert.ok(!/\b(put|fastPut|delete|rename|mkdir|rmdir|chmod|append)\s*\(/.test(code), 'không lệnh ghi SFTP');
  assert.deepEqual([...new Set([...code.matchAll(/\bclient\.(\w+)\s*\(/g)].map((m) => m[1]))].sort(), ['end', 'get', 'list']);
  const sql = [...code.matchAll(/(?:prepare|exec)\(\s*[`'"]([\s\S]*?)[`'"]\s*[,)]/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.ok(sql.length >= 6);
  for (const q of sql) {
    if (/^(INSERT|UPDATE|DELETE|ALTER)/i.test(q)) assert.ok(/sftp_sync_runs|sftp_sync_files/.test(q) && !/arrival_/.test(q), q.slice(0, 80));
  }
  assert.ok(!/(DELETE|UPDATE|INSERT)[^;`'"]*arrival_(items|import_files)/i.test(code), 'không ghi vào arrival_*');
  assert.ok(/importFn = tuyChon\.importFn \|\| importArrivalFile/.test(code), 'nạp qua importer có sẵn');
  // thêm tham số, không đổi hành vi: các test cũ (sftp-sync, sftp-scheduler) vẫn xanh nguyên văn; ở đây chỉ kiểm có tham số mới và không bị đổi chữ ký
  assert.match(doc('server', 'lib', 'sftpSync.js'), /luotCoSan/);
  assert.match(doc('server', 'lib', 'sftpScheduler.js'), /tamDungHenGio/);
  const rt = boChuThich(doc('server', 'routes', 'napNguon.js'));
  assert.ok(/router\.post\('\/nap-nguon\/lay-ngay', requireAdmin/.test(rt) && /router\.post\('\/nap-nguon\/lay-lai', requireAdmin/.test(rt));
  for (const f2 of ['arrivalsImport.js', 'thayTheXemTruoc.js', 'thayTheThucHien.js']) assert.ok(!doc('server', 'lib', f2).includes('napNguonLay'), f2);
});
