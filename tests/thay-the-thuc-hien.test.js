// ==========================================
// Test SANLUONG-5g-3: THỰC HIỆN «Thay thế ngày của một BCVH» (server/lib/thayTheThucHien.js + route POST /api/arrivals/thay-the/thuc-hien + scripts/thay-the-ngay.js).
// Server thật + DB tạm của harness, `client` GIẢ (không mạng, không ssh2; SFTP_* bị cách ly và nguồn mặc định CẤM MẠNG). CSV / SHBG GIẢ dựng lúc chạy
// (13 ký tự, tiền tố ZZ9; không có dãy ≥ 15 chữ số). Thư mục sao lưu là thư mục tạm — không đụng data/.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv, nguonCamMang } = require('./helpers/khongMang');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const X = require('../server/lib/thayTheXemTruoc');
const TT = require('../server/lib/thayTheThucHien');
const S = require('../server/lib/sftpSync');
const Sch = require('../server/lib/sftpScheduler');
const CF = require('../server/config/thay-the');

const PORT = 5931;
const B = '533140';
const NGAY = '2026-10-10';
const D1 = '/CSV_Report_533140';
const NOW = new Date('2026-10-14T05:00:00Z');
const USERS = {
  admin: { hrm: 'TH_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'TH_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'TH_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'TH_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'TH_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhuc = [cachLySftpEnv()]; // cách ly SFTP_* ngay từ đầu file, và LẠI sau khi harness nạp server/index.js (nó nạp .env)
let ctx;
let RealDatabase;
let dir;
let tmpRoot;
let sauLuu;
let giay = 0;

const shbg = (i) => `ZZ${String(900000000 + i)}VN`;
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
let seq = 0;
function csv(ds, { ma = B, ngay = NGAY, header = EXPECTED_HEADER } = {}) {
  const rows = ds.map((d) => {
    const o = typeof d === 'string' ? { sh: d } : d;
    seq++;
    return {
      Ma_BC_dong: '990001', BC_nhan_BG: ma, Ten_duong_thu: 'Đường A', SHBG: o.sh, So_hieu_BD10: '', 'Thời gian XN túi': o.bag || `${ngay} 08:00:00`,
      'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL', So_hieu_BD8: o.bd8 ?? `P${seq}`, Khoi_luong_thuc_te: '500',
      Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
    };
  });
  return Buffer.from('﻿' + [header.map(qt).join(','), ...rows.map((r) => header.map((h) => qt(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
}
const rangeShbg = (a, b) => Array.from({ length: b - a }, (_, i) => shbg(a + i));
const ten = (ma, ymd, hms) => `HangDen_${ma}_${ymd.replace(/-/g, '')}_${hms}.csv`;
const f = (buf, mtime = 1760400000000) => ({ buf, mtime });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const SANG = ten(B, NGAY, '093012');
const CHIEU = ten(B, NGAY, '163011');

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-thaythe-data-'));
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-thaythe-tmp-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-thaythe-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  RealDatabase = ctx.db.constructor;
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  X.datNguon(null);
  for (const r of khoiPhuc.reverse()) r();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  for (const p of [dir, tmpRoot]) fs.rmSync(p, { recursive: true, force: true });
});
beforeEach(() => {
  cachLySftpEnv();
  X.datNguon(nguonCamMang([D1]));
  try { ctx.db.exec('DROP TRIGGER IF EXISTS tg_test_loi'); } catch (e) { /* chưa có */ }
  for (const t of ['thung_rac_dong', 'thung_rac_file', 'thay_the_nhat_ky', 'sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'phat_status_current', 'arrival_items', 'arrival_import_files', 'ward_bdx_map']) {
    ctx.db.prepare(`DELETE FROM ${t}`).run();
  }
  giay = 0;
  sauLuu = fs.mkdtempSync(path.join(tmpRoot, 'sl-'));
});

// ---------- tiện ích ----------
const nap = async (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); const r = await importArrivalFile(ctx.db, p); assert.ok(['OK', 'EMPTY'].includes(r.status), `${name}: ${r.status} ${r.error || ''}`); return r; };
const napCu = (ds, hms = '235959') => nap(ten(B, NGAY, hms), csv(ds));

function nguonGia(files, { loiList = null, loiGet = null, chan = null } = {}) {
  const calls = { list: 0, get: [], end: 0 };
  return {
    calls, files,
    async list(d) {
      calls.list++;
      if (chan) await chan;
      if (loiList) throw loiList;
      return Object.entries(files[d] || {}).map(([name, x]) => ({ type: x.type || '-', name, size: x.type === 'd' ? 0 : x.buf.length, modifyTime: x.mtime }));
    },
    async get(xa, cb) {
      const name = xa.slice(xa.lastIndexOf('/') + 1);
      calls.get.push(name);
      if (loiGet) throw loiGet;
      fs.writeFileSync(cb, files[xa.slice(0, xa.lastIndexOf('/'))][name].buf);
    },
    async end() { calls.end++; }
  };
}
function nguonChuan(moi, opts) {
  const h = Math.ceil(moi.length / 2);
  return nguonGia({ [D1]: { [SANG]: f(csv(moi.slice(0, h))), [CHIEU]: f(csv(moi.slice(h))) } }, opts);
}
/** tap_file_nguon của «bản xem trước»: mọi file trong nguồn giả (giả định đều dùng được). */
const duKienTu = (src, tenLoc = null) => Object.entries(src.files[D1] || {}).filter(([t, x]) => x.buf.length > 3 && (!tenLoc || tenLoc.includes(t))).map(([t, x]) => ({ ten: t, sha256: sha(x.buf) }));

/** Gọi lõi với mặc định hợp lệ. extra.at: thời điểm cố định; mặc định mỗi lần cách nhau 1 phút. */
function thay(src, extra = {}) {
  const { at, options, ...rest } = extra;
  const t = at || new Date(NOW.getTime() + (++giay) * 60000);
  return TT.thayTheNgay({
    client: src, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, sauLuuDir: sauLuu, now: () => t, nguoiThucHien: 'TH_ADMIN',
    xacNhan: { ma_bcvh: B, ngay: NGAY }, tapFileNguonDuKien: duKienTu(src), dongYMat: false, options: { ...options }, ...rest
  });
}

const BANG = ['arrival_items', 'arrival_import_files', 'ward_bdx_map', 'phat_status_current', 'thay_the_nhat_ky', 'thung_rac_file', 'thung_rac_dong', 'sftp_sync_runs'];
const chup = (boKhoa = false) => JSON.stringify(BANG.filter((t) => !(boKhoa && t === 'sftp_sync_runs')).map((t) => [t, ctx.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
const dem = (t, where = '1=1', ...p) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get(...p).n;
const tmpSach = () => fs.readdirSync(tmpRoot).filter((n) => n.startsWith('hue-dhcl-thaythe-')).length === 0;
const dsSaoLuu = () => fs.readdirSync(sauLuu);
const dangKhoa = () => dem('sftp_sync_runs', 'finished_at IS NULL');
const dongNgay = () => dem('arrival_items', 'import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = ? AND file_date = ?)', B, NGAY);
const fileNgay = () => ctx.db.prepare('SELECT file_name, status, source FROM arrival_import_files WHERE unit_code = ? AND file_date = ? ORDER BY file_time, id').all(B, NGAY);
const loi = (code, http) => (e) => e instanceof X.XemTruocLoi && e.code === code && e.httpStatus === http;
const dung = async (promiseFn, code, http) => assert.rejects(promiseFn, (e) => (e.code === code && (http === undefined || e.httpStatus === http)), `mong ${code}`);

// =====================================================================
// THÀNH CÔNG
// =====================================================================
test('thay thành công: xóa tập cũ (kể cả nhập tay _235959), nạp tập mới, thùng rác + nhật ký + sao lưu đúng; file ngoài tập còn nguyên', async () => {
  await napCu(rangeShbg(0, 100));
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(300, 310), { ngay: '2026-10-11' })); // sáng D+1
  await nap(ten('535470', NGAY, '093012'), csv(rangeShbg(400, 410), { ma: '535470' })); // BCVH khác
  await nap(ten(B, '2026-10-09', '093012'), csv(rangeShbg(500, 510), { ngay: '2026-10-09' })); // ngày khác
  const idCu = ctx.db.prepare('SELECT id FROM arrival_import_files WHERE file_name = ?').get(ten(B, NGAY, '235959')).id;
  const ngoai = () => JSON.stringify(ctx.db.prepare("SELECT * FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE NOT (unit_code = ? AND file_date = ?)) ORDER BY id").all(B, NGAY));
  const ngoaiTruoc = ngoai();
  const fileNgoaiTruoc = JSON.stringify(ctx.db.prepare("SELECT * FROM arrival_import_files WHERE NOT (unit_code = ? AND file_date = ?) ORDER BY id").all(B, NGAY));
  const src = nguonChuan(rangeShbg(0, 110));

  const kq = await thay(src);

  assert.deepEqual([kq.so_dong_xoa, kq.so_file_xoa, kq.so_dong_nap, kq.so_file_nap, kq.chay_kho], [100, 1, 110, 2, false]);
  assert.deepEqual([kq.so_sanh.shbg_mat_that, kq.so_sanh.shbg_mat_can_tren, kq.canh_bao.muc, kq.canh_bao.can_dong_y_mat], [0, 0, 'AN_TOAN', false]);
  assert.deepEqual(fileNgay(), [{ file_name: SANG, status: 'OK', source: 'SFTP' }, { file_name: CHIEU, status: 'OK', source: 'SFTP' }]);
  assert.equal(dongNgay(), 110);
  assert.equal(ngoai(), ngoaiTruoc, 'dòng của file ngoài tập còn nguyên');
  assert.equal(JSON.stringify(ctx.db.prepare("SELECT * FROM arrival_import_files WHERE NOT (unit_code = ? AND file_date = ?) ORDER BY id").all(B, NGAY)), fileNgoaiTruoc, 'bản ghi file ngoài tập còn nguyên');
  // thùng rác
  const rf = ctx.db.prepare('SELECT * FROM thung_rac_file').all();
  assert.equal(rf.length, 1);
  assert.deepEqual([rf[0].id, rf[0].file_name, rf[0].status, rf[0].source], [idCu, ten(B, NGAY, '235959'), 'OK', 'MANUAL']);
  assert.equal(dem('thung_rac_dong'), 100);
  assert.equal(dem('thung_rac_dong', 'import_file_id = ?', idCu), 100);
  // nhật ký
  const nk = ctx.db.prepare('SELECT * FROM thay_the_nhat_ky').all();
  assert.equal(nk.length, 1);
  assert.deepEqual([nk[0].bcvh, nk[0].ngay, nk[0].nguoi_thuc_hien, nk[0].so_file_cu, nk[0].so_dong_cu, nk[0].so_file_moi, nk[0].so_dong_moi, nk[0].shbg_cu, nk[0].shbg_mat_that, nk[0].shbg_mat_can_tren, nk[0].muc_canh_bao, nk[0].dong_y_mat, nk[0].ket_qua, nk[0].thung_rac_da_don],
    [B, NGAY, 'TH_ADMIN', 1, 100, 2, 110, 100, 0, 0, 'AN_TOAN', 0, 'THANH_CONG', 0]);
  assert.match(nk[0].thoi_diem_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(nk[0].duong_dan_sao_luu, kq.sao_luu.duong_dan);
  assert.equal(nk[0].thung_rac_het_han_luc, new Date(Date.parse(nk[0].thoi_diem_utc) + 30 * 86400000).toISOString());
  assert.deepEqual(JSON.parse(nk[0].tap_file_cu).map((x) => x.file_name), [ten(B, NGAY, '235959')]);
  assert.deepEqual(JSON.parse(nk[0].tap_file_moi).map((x) => [x.ten, x.trang_thai, x.so_dong, x.sha256]), [[SANG, 'OK', 55, sha(src.files[D1][SANG].buf)], [CHIEU, 'OK', 55, sha(src.files[D1][CHIEU].buf)]]);
  assert.equal(kq.nhat_ky_id, nk[0].id);
  // sao lưu: một bản, mở lại được, chứa dữ liệu TRƯỚC khi thay
  assert.deepEqual(dsSaoLuu(), [kq.sao_luu.tep]);
  assert.match(kq.sao_luu.tep, /^truoc-thay-the_533140_2026-10-10_\d{8}T\d{6}Z\.db$/);
  const bak = new RealDatabase(kq.sao_luu.duong_dan, { readonly: true });
  try {
    assert.equal(bak.prepare('SELECT COUNT(*) AS n FROM arrival_items WHERE import_file_id = ?').get(idCu).n, 100);
    assert.equal(bak.prepare("SELECT COUNT(*) AS n FROM arrival_import_files WHERE source = 'SFTP' AND unit_code = ? AND file_date = ?").get(B, NGAY).n, 0, 'sao lưu là bản TRƯỚC thay');
  } finally { bak.close(); }
  // khoá đã nhả, tệp tạm sạch, client.end
  assert.equal(dangKhoa(), 0);
  assert.equal(dem('sftp_sync_runs'), 0);
  assert.ok(tmpSach());
  assert.equal(src.calls.end, 1);
  assert.deepEqual(src.calls.get.sort(), [CHIEU, SANG].sort());
  assert.ok(!/\d{15,}/.test(JSON.stringify(kq)), 'kết quả không có dãy ≥ 15 chữ số');
  assert.ok(!JSON.stringify(kq).includes('ZZ9'), 'kết quả không có SHBG');
});

test('REJECTED / CONFLICT cùng tên và file nhập tay _235959 bị xóa đúng (kể cả vào thùng rác); bản ghi mới sạch', async () => {
  await napCu(rangeShbg(0, 20));
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (?, ?, ?, '16:30:11', 10, 'aa', 'REJECTED', 'x')").run(B, CHIEU, NGAY);
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (?, ?, ?, '09:30:12', 10, 'bb', 'CONFLICT', 'x')").run(B, SANG, NGAY);
  const kq = await thay(nguonChuan(rangeShbg(0, 20)));
  assert.equal(kq.so_file_xoa, 3);
  assert.deepEqual(fileNgay().map((x) => x.status), ['OK', 'OK']);
  assert.deepEqual(ctx.db.prepare('SELECT status FROM thung_rac_file ORDER BY id').all().map((x) => x.status).sort(), ['CONFLICT', 'OK', 'REJECTED']);
});

test('trạng thái phát không đổi; SHBG cũ còn ở file mới tự nối lại; SHBG mất vẫn giữ trạng thái và được đếm', async () => {
  await napCu(rangeShbg(0, 100));
  const them = (s, b = B) => ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', 1, '2026-10-12T01:00:00Z')").run(b, s);
  for (const i of [0, 1, 2, 95, 99]) them(shbg(i));
  them(shbg(5), '535470');
  const phatTruoc = JSON.stringify(ctx.db.prepare('SELECT * FROM phat_status_current ORDER BY rowid').all());
  const noi = () => ctx.db.prepare('SELECT COUNT(DISTINCT p.shbg) AS n FROM phat_status_current p JOIN arrival_items a ON a.tracking_no = p.shbg WHERE p.bcvh = ?').get(B).n;
  assert.equal(noi(), 5);
  const kq = await thay(nguonChuan(rangeShbg(0, 96)), { dongYMat: true }); // mất 96..99 (4/100): 99 có trạng thái
  assert.equal(JSON.stringify(ctx.db.prepare('SELECT * FROM phat_status_current ORDER BY rowid').all()), phatTruoc, 'không xóa / sửa trạng thái phát');
  assert.equal(noi(), 4, '0, 1, 2, 95 tự nối lại; 99 không còn dòng hàng đến');
  assert.deepEqual(kq.phat, { co_bang: true, so_shbg_co_trang_thai: 5, con_o_ban_moi: 4, khong_con: 1 });
});

// =====================================================================
// XÁC NHẬN, ĐỒNG Ý MẤT DỮ LIỆU, «MẤT THẬT»
// =====================================================================
test('xacNhan sai mã / sai ngày / thiếu / sai dạng: từ chối XAC_NHAN_SAI (400), không khoá, không mạng, không sao lưu, DB y nguyên', async () => {
  await napCu(rangeShbg(0, 30));
  const truoc = chup();
  for (const xn of [{ ma_bcvh: '535470', ngay: NGAY }, { ma_bcvh: B, ngay: '2026-10-11' }, null, undefined, 'x', [B, NGAY], {}, { ma_bcvh: B }, { ma_bcvh: 533140, ngay: NGAY }]) {
    const src = nguonChuan(rangeShbg(0, 30));
    await dung(() => thay(src, { xacNhan: xn }), 'XAC_NHAN_SAI', 400);
    assert.equal(src.calls.list, 0, 'chưa liệt kê nguồn');
    assert.equal(src.calls.end, 1);
  }
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), []);
  assert.ok((await thay(nguonChuan(rangeShbg(0, 30)))).so_dong_nap === 30, 'cờ / khoá đã trả: thay được sau các lần từ chối');
});

test('mất thật > 0: thiếu dongYMat (hoặc khác true) -> CAN_DONG_Y_MAT_DU_LIEU (409), DB y nguyên, KHÔNG sao lưu; có dongYMat === true thì thay được', async () => {
  await napCu(rangeShbg(0, 100));
  const truoc = chup();
  for (const dy of [false, undefined, 'true', 1, null]) {
    await dung(() => thay(nguonChuan(rangeShbg(5, 100)), { dongYMat: dy }), 'CAN_DONG_Y_MAT_DU_LIEU', 409);
  }
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), [], 'chưa sao lưu vô ích');
  const kq = await thay(nguonChuan(rangeShbg(5, 100)), { dongYMat: true });
  assert.deepEqual([kq.so_sanh.shbg_mat_that, kq.so_sanh.shbg_mat_can_tren, kq.so_sanh.ty_le_mat_that, kq.canh_bao.muc, kq.dong_y_mat], [5, 5, 0.05, 'CAN_XAC_NHAN', true]);
  assert.equal(ctx.db.prepare('SELECT dong_y_mat, shbg_mat_that, muc_canh_bao FROM thay_the_nhat_ky').get().dong_y_mat, 1);
});

test('mức cảnh báo dựa trên «mất thật»: 6/100 là ĐỎ; số cận trên vẫn được trả', async () => {
  await napCu(rangeShbg(0, 100));
  const kq = await thay(nguonChuan(rangeShbg(6, 100)), { dongYMat: true });
  assert.deepEqual([kq.canh_bao.muc, kq.so_sanh.shbg_mat_that, kq.so_sanh.shbg_mat_can_tren, kq.so_sanh.ty_le_mat_can_tren], ['DO', 6, 6, 0.06]);
  assert.equal(ctx.db.prepare('SELECT muc_canh_bao FROM thay_the_nhat_ky').get().muc_canh_bao, 'DO');
});

test('«mất thật» khác mức cận trên: SHBG còn ở file NGOÀI tập (vd file sáng D+1 cùng BCVH) không tính là mất; file của BCVH khác thì vẫn tính là mất', async () => {
  await napCu(rangeShbg(0, 100));
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(0, 10), { ngay: NGAY }));
  const truoc = chup();
  // cận trên = 10 (SHBG 0..9 không có ở file mới) nhưng cả 10 còn ở file D+1 -> mất thật = 0 -> thay được không cần đồng ý
  const kq = await thay(nguonChuan(rangeShbg(10, 100)));
  assert.deepEqual([kq.so_sanh.shbg_mat_can_tren, kq.so_sanh.shbg_mat_that, kq.canh_bao.muc, kq.canh_bao.can_dong_y_mat], [10, 0, 'AN_TOAN', false]);
  assert.equal(dem('arrival_items', "import_file_id IN (SELECT id FROM arrival_import_files WHERE file_date = '2026-10-11')"), 10, 'file D+1 còn nguyên');
  assert.notEqual(chup(), truoc);
  // D+1 chỉ giữ 5 trong 10 -> mất thật 5
  ctx.db.prepare('DELETE FROM thung_rac_dong').run(); ctx.db.prepare('DELETE FROM thung_rac_file').run(); ctx.db.prepare('DELETE FROM thay_the_nhat_ky').run();
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  await napCu(rangeShbg(0, 100));
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(0, 5), { ngay: NGAY }));
  const k2 = await thay(nguonChuan(rangeShbg(10, 100)), { dongYMat: true });
  assert.deepEqual([k2.so_sanh.shbg_mat_can_tren, k2.so_sanh.shbg_mat_that], [10, 5]);
  // cùng SHBG nhưng ở file của BCVH KHÁC không cứu được
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  await napCu(rangeShbg(0, 100));
  await nap(ten('535470', NGAY, '093012'), csv(rangeShbg(0, 10), { ma: '535470' }));
  const k3 = await thay(nguonChuan(rangeShbg(10, 100)), { dongYMat: true });
  assert.deepEqual([k3.so_sanh.shbg_mat_can_tren, k3.so_sanh.shbg_mat_that, k3.canh_bao.muc], [10, 10, 'DO']);
});

// =====================================================================
// NGUỒN: MÃ BĂM, TẬP RỖNG, FILE LỖI
// =====================================================================
test('sha256 lệch bản xem trước, file mới xuất hiện, file đã chọn biến mất, nội dung đổi: NGUON_DA_DOI (409), DB y nguyên, không sao lưu', async () => {
  await napCu(rangeShbg(0, 40));
  const truoc = chup();
  const src = nguonChuan(rangeShbg(0, 40));
  const dk = duKienTu(src);
  // (1) mã băm khác
  await dung(() => thay(src, { tapFileNguonDuKien: [{ ten: SANG, sha256: 'f'.repeat(64) }, dk[1]] }), 'NGUON_DA_DOI', 409);
  // (2) nguồn có thêm file mà bản xem trước không có
  await dung(() => thay(src, { tapFileNguonDuKien: [dk[0]] }), 'NGUON_DA_DOI', 409);
  // (3) bản xem trước có file mà nguồn không còn
  await dung(() => thay(src, { tapFileNguonDuKien: [...dk, { ten: ten(B, NGAY, '200000'), sha256: 'a'.repeat(64) }] }), 'NGUON_DA_DOI', 409);
  // (4) tap_file nêu tên có trong bản xem trước nhưng đã biến mất khỏi nguồn
  await dung(() => thay(src, { tapFile: [SANG, ten(B, NGAY, '200000')], tapFileNguonDuKien: [dk[0], { ten: ten(B, NGAY, '200000'), sha256: 'a'.repeat(64) }] }), 'NGUON_DA_DOI', 409);
  // (5) nội dung file đổi sau khi xem trước
  const src2 = nguonChuan(rangeShbg(0, 40));
  const dk2 = duKienTu(src2);
  src2.files[D1][CHIEU] = f(csv(rangeShbg(20, 41)));
  await dung(() => thay(src2, { tapFileNguonDuKien: dk2 }), 'NGUON_DA_DOI', 409);
  // (6) tên lạ, không thuộc bản xem trước: tham số sai
  await dung(() => thay(src, { tapFile: ['khong-co.csv'] }), 'TAP_FILE_KHONG_HOP_LE', 400);
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), []);
  assert.ok(tmpSach());
  // tap_file_nguon sai dạng: tham số sai
  for (const sai of [null, 'x', [{ ten: SANG }], [{ ten: SANG, sha256: 'xyz' }], [dk[0], dk[0]], [{ ten: SANG, sha256: dk[0].sha256, la: 1 }]]) {
    await dung(() => thay(src, { tapFileNguonDuKien: sai }), 'THAM_SO_SAI', 400);
  }
  assert.equal(chup(), truoc);
});

test('tập mới rỗng (tap_file rỗng, nguồn trống, chỉ file BOM): KHONG_CO_FILE_DE_THAY (422), DB y nguyên', async () => {
  await napCu(rangeShbg(0, 20));
  const truoc = chup();
  await dung(() => thay(nguonChuan(rangeShbg(0, 20)), { tapFile: [], tapFileNguonDuKien: [] }), 'KHONG_CO_FILE_DE_THAY', 422);
  await dung(() => thay(nguonGia({ [D1]: {} }), { tapFileNguonDuKien: [] }), 'KHONG_CO_FILE_DE_THAY', 422);
  const chiBom = nguonGia({ [D1]: { [SANG]: f(Buffer.from([0xef, 0xbb, 0xbf])) } });
  await dung(() => thay(chiBom, { tapFileNguonDuKien: [] }), 'KHONG_CO_FILE_DE_THAY', 422);
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), []);
});

test('file REJECTED / lỗi tải trong tập chọn: FILE_NGUON_LOI (422), KHÔNG xóa gì; bỏ tích file đó thì thay được bằng phần còn lại', async () => {
  await napCu(rangeShbg(0, 20));
  const truoc = chup();
  const hong = csv([{ sh: shbg(1), bag: 'không phải ngày' }]);
  const tot = csv(rangeShbg(0, 20));
  const mk = () => nguonGia({ [D1]: { [SANG]: f(hong), [CHIEU]: f(tot) } });
  const src = mk();
  await assert.rejects(() => thay(src, { tapFileNguonDuKien: [{ ten: CHIEU, sha256: sha(tot) }] }), (e) => e.code === 'FILE_NGUON_LOI' && e.httpStatus === 422 && e.message.includes(SANG));
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), []);
  assert.ok(tmpSach());
  const loiTai = nguonChuan(rangeShbg(0, 20), { loiGet: Object.assign(new Error('đứt giả'), { code: 'ECONNRESET' }) });
  await assert.rejects(() => thay(loiTai), (e) => e.code === 'FILE_NGUON_LOI' && /ECONNRESET/.test(e.message));
  assert.equal(loiTai.calls.end, 1);
  assert.equal(chup(), truoc);
  // bỏ tích SANG (hỏng): chỉ dùng CHIEU
  const kq = await thay(mk(), { tapFile: [CHIEU], tapFileNguonDuKien: [{ ten: CHIEU, sha256: sha(tot) }] });
  assert.equal(kq.so_file_nap, 1);
  assert.deepEqual(fileNgay().map((x) => x.file_name), [CHIEU]);
});

test('tap_file: chỉ thay bằng một phần các file của ngày; file không chọn không bị tải, không được ghi; mất tính theo tập chọn', async () => {
  await napCu(rangeShbg(0, 100));
  const src = nguonChuan(rangeShbg(0, 100));
  await dung(() => thay(src, { tapFile: [SANG], tapFileNguonDuKien: duKienTu(src, [SANG]) }), 'CAN_DONG_Y_MAT_DU_LIEU', 409);
  const src2 = nguonChuan(rangeShbg(0, 100));
  const kq = await thay(src2, { tapFile: [SANG], tapFileNguonDuKien: duKienTu(src2, [SANG]), dongYMat: true });
  assert.deepEqual(src2.calls.get, [SANG]);
  assert.deepEqual([kq.so_file_nap, kq.so_dong_nap, kq.so_sanh.shbg_mat_that, kq.canh_bao.muc], [1, 50, 50, 'DO']);
  assert.deepEqual(fileNgay().map((x) => x.file_name), [SANG]);
});

test('file BOM / rỗng trong tập chọn được ghi bản ghi EMPTY (không tính vào mã băm dự kiến); phải còn ít nhất một file dùng được', async () => {
  await napCu(rangeShbg(0, 20));
  const tot = csv(rangeShbg(0, 20));
  const bom = ten(B, NGAY, '235959');
  const src = nguonGia({ [D1]: { [SANG]: f(tot), [bom]: f(Buffer.from([0xef, 0xbb, 0xbf])) } });
  const kq = await thay(src);
  assert.deepEqual(kq.tap_file_moi.map((x) => [x.ten, x.trang_thai]), [[SANG, 'OK'], [bom, 'EMPTY']]);
  assert.deepEqual(fileNgay().map((x) => x.status), ['OK', 'EMPTY']);
  assert.deepEqual(kq.tap_file_rong, [bom]);
});

// =====================================================================
// NGUYÊN KHỐI
// =====================================================================
test('nguyên khối: file thứ hai bị REJECTED sau khi file thứ nhất đã ghi và tập cũ đã xóa -> hoàn tác cả hai, DB y nguyên', async () => {
  await napCu(rangeShbg(0, 100));
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(300, 305), { ngay: '2026-10-11' }));
  const truoc = chup();
  const thuc = [];
  const ghiFn = (db, d, op) => {
    thuc.push(d.fileName);
    if (thuc.length === 1) {
      const r = require('../server/lib/arrivalsImport').ghiFileDaChuanBi(db, d, op);
      assert.equal(r.status, 'OK');
      assert.ok(db.prepare('SELECT COUNT(*) AS n FROM arrival_items WHERE import_file_id = ?').get(db.prepare('SELECT id FROM arrival_import_files WHERE file_name = ?').get(d.fileName).id).n > 0, 'file đầu đã ghi thật');
      return r;
    }
    assert.equal(dongNgay(), 55, 'tập cũ đã bị xóa, chỉ còn file đầu trong giao dịch');
    return { fileName: d.fileName, status: 'REJECTED', error: 'giả lập' };
  };
  await assert.rejects(() => thay(nguonChuan(rangeShbg(0, 110)), { options: { ghiFn } }), (e) => e.code === 'GHI_THAT_BAI' && e.httpStatus === 500 && /đã hoàn tác/.test(e.message));
  assert.deepEqual(thuc, [SANG, CHIEU]);
  assert.equal(chup(), truoc, 'DB y nguyên (mọi bảng liên quan, kể cả thùng rác, nhật ký, khoá)');
  assert.equal(dem('thung_rac_dong') + dem('thung_rac_file') + dem('thay_the_nhat_ky'), 0);
  assert.equal(dangKhoa(), 0);
  assert.ok(tmpSach());
});

test('nguyên khối: ném lỗi lúc ghi file thứ hai, hoặc ngay sau khi xóa -> hoàn tác toàn bộ; lần sau vẫn thay được', async () => {
  await napCu(rangeShbg(0, 100));
  const truoc = chup();
  let n = 0;
  const ghiNem = (db, d, op) => { if (++n === 2) throw Object.assign(new Error('nổ giả'), { code: 'NO_GIA' }); return require('../server/lib/arrivalsImport').ghiFileDaChuanBi(db, d, op); };
  await assert.rejects(() => thay(nguonChuan(rangeShbg(0, 110)), { options: { ghiFn: ghiNem } }), (e) => e.code === 'GHI_THAT_BAI' && /NO_GIA/.test(e.message));
  assert.equal(chup(), truoc);
  await assert.rejects(() => thay(nguonChuan(rangeShbg(0, 110)), { options: { sauKhiXoa: () => { assert.equal(dongNgay(), 0); throw new Error('nổ sau xóa'); } } }), (e) => e.code === 'GHI_THAT_BAI');
  assert.equal(chup(), truoc);
  const kq = await thay(nguonChuan(rangeShbg(0, 110)));
  assert.equal(kq.so_dong_nap, 110);
});

test('nguyên khối: DB từ chối thật một dòng của file thứ hai (trigger) -> importer trả REJECTED -> hoàn tác cả file thứ nhất, DB y nguyên', async () => {
  await napCu(rangeShbg(0, 100));
  const truoc = chup();
  ctx.db.exec(`CREATE TRIGGER tg_test_loi BEFORE INSERT ON arrival_items WHEN NEW.tracking_no = '${shbg(105)}' BEGIN SELECT RAISE(ABORT, 'loi-gia'); END`);
  try {
    await assert.rejects(() => thay(nguonChuan(rangeShbg(0, 110))), (e) => e.code === 'GHI_THAT_BAI' && e.message.includes(CHIEU));
    assert.equal(chup(), truoc);
  } finally { ctx.db.exec('DROP TRIGGER IF EXISTS tg_test_loi'); }
});

test('dữ liệu của (BCVH, ngày) đổi giữa lúc chuẩn bị và lúc giao dịch (có người nạp thêm): DU_LIEU_DA_DOI (409), hoàn tác, không thay', async () => {
  await napCu(rangeShbg(0, 50));
  let saudoi = null;
  const truocGiaoDich = async () => { await napCu(rangeShbg(60, 70), '120000'); saudoi = chup(true); };
  await dung(() => thay(nguonChuan(rangeShbg(0, 50)), { options: { truocGiaoDich } }), 'DU_LIEU_DA_DOI', 409);
  assert.equal(chup(true), saudoi, 'không thay đổi gì thêm ngoài thay đổi của người khác');
  assert.equal(dangKhoa(), 0);
  assert.equal(dem('thay_the_nhat_ky'), 0);
});

// =====================================================================
// SAO LƯU
// =====================================================================
test('sao lưu lỗi (thư mục không ghi được) hoặc không đủ chỗ: từ chối (500 / 507), DB y nguyên, không để lại tệp dở', async () => {
  await napCu(rangeShbg(0, 40));
  const truoc = chup();
  const laFile = path.join(tmpRoot, 'khong-phai-thu-muc');
  fs.writeFileSync(laFile, 'x');
  await dung(() => thay(nguonChuan(rangeShbg(0, 40)), { sauLuuDir: laFile }), 'SAO_LUU_LOI', 500);
  assert.equal(chup(), truoc);
  await dung(() => thay(nguonChuan(rangeShbg(0, 40)), { options: { dungLuongTrong: () => 0 } }), 'KHONG_DU_CHO_SAO_LUU', 507);
  assert.equal(chup(), truoc);
  assert.deepEqual(dsSaoLuu(), []);
  assert.equal(dangKhoa(), 0);
  assert.ok(tmpSach());
  assert.equal(TT.THOAT_THEO_LOI.SAO_LUU_LOI, 11);
  assert.equal(TT.THOAT_THEO_LOI.KHONG_DU_CHO_SAO_LUU, 11);
});

test('giữ đúng 5 bản sao lưu gần nhất (xóa bản cũ, không đụng tệp lạ); tên có giờ UTC, mã BCVH và ngày', async () => {
  await napCu(rangeShbg(0, 30));
  fs.writeFileSync(path.join(sauLuu, 'ghi-chu.txt'), 'x');
  fs.writeFileSync(path.join(sauLuu, 'hue-dhcl.db.20260101.bak'), 'x');
  const ten7 = [];
  for (let i = 0; i < 7; i++) ten7.push((await thay(nguonChuan(rangeShbg(0, 30)))).sao_luu.tep);
  const con = dsSaoLuu().filter((t) => t.startsWith('truoc-thay-the_')).sort();
  assert.equal(con.length, CF.SO_BAN_SAO_LUU_GIU);
  assert.deepEqual(con, ten7.slice(2).sort(), 'giữ 5 bản mới nhất');
  assert.ok(dsSaoLuu().includes('ghi-chu.txt') && dsSaoLuu().includes('hue-dhcl.db.20260101.bak'));
  for (const t of con) assert.match(t, /^truoc-thay-the_533140_2026-10-10_\d{8}T\d{6}Z(_\d+)?\.db$/);
  // cùng một giây: không ghi đè bản trước
  const t = new Date('2026-10-20T00:00:00Z');
  const a = await thay(nguonChuan(rangeShbg(0, 30)), { at: t });
  const b = await thay(nguonChuan(rangeShbg(0, 30)), { at: t });
  assert.notEqual(a.sao_luu.tep, b.sao_luu.tep);
  assert.ok(fs.existsSync(a.sao_luu.duong_dan) && fs.existsSync(b.sao_luu.duong_dan));
});

// =====================================================================
// THÙNG RÁC
// =====================================================================
test('thùng rác quá 30 ngày bị dọn ở lần thay kế tiếp; chưa hết hạn thì giữ; hết hạn đúng thời điểm thì dọn bằng hàm riêng (nhật ký giữ lại)', async () => {
  await napCu(rangeShbg(0, 20));
  const k1 = await thay(nguonChuan(rangeShbg(0, 20)));
  assert.equal(dem('thung_rac_dong'), 20);
  ctx.db.prepare('UPDATE thay_the_nhat_ky SET thung_rac_het_han_luc = ? WHERE id = ?').run(new Date(NOW.getTime() - 86400000).toISOString(), k1.nhat_ky_id);
  const k2 = await thay(nguonChuan(rangeShbg(0, 20)));
  assert.deepEqual([k2.da_don.thung_rac.mua, k2.da_don.thung_rac.dong, k2.da_don.thung_rac.file], [1, 20, 1]);
  assert.equal(dem('thung_rac_dong', 'thung_rac_id = ?', k1.nhat_ky_id), 0);
  assert.equal(dem('thung_rac_file', 'thung_rac_id = ?', k1.nhat_ky_id), 0);
  assert.equal(dem('thung_rac_dong', 'thung_rac_id = ?', k2.nhat_ky_id), 20, 'mẻ mới còn');
  assert.equal(ctx.db.prepare('SELECT thung_rac_da_don FROM thay_the_nhat_ky WHERE id = ?').get(k1.nhat_ky_id).thung_rac_da_don, 1);
  assert.equal(dem('thay_the_nhat_ky'), 2, 'nhật ký không bị xóa');
  const het = new Date(k2.thung_rac.het_han_luc);
  assert.deepEqual(TT.donThungRac(ctx.db, new Date(het.getTime() - 1)), { mua: 0, dong: 0, file: 0 });
  assert.deepEqual(TT.donThungRac(ctx.db, het), { mua: 1, dong: 20, file: 2 });
  assert.deepEqual(TT.donThungRac(ctx.db, het), { mua: 0, dong: 0, file: 0 }, 'dọn lặp lại không làm gì');
});

test('thiết kế thùng rác đủ khôi phục nguyên trạng: cột khớp bảng gốc; chép ngược lại cho đúng id và liên kết file ↔ dòng', async () => {
  const cot = (t) => ctx.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.deepEqual(cot('thung_rac_dong'), ['rac_id', 'thung_rac_id', ...cot('arrival_items')]);
  assert.deepEqual(cot('thung_rac_file'), ['rac_id', 'thung_rac_id', ...cot('arrival_import_files')]);
  assert.deepEqual(TT.COT_DONG, cot('arrival_items'));
  assert.deepEqual(TT.COT_FILE, cot('arrival_import_files'));
  await napCu(rangeShbg(0, 60), '235959');
  await nap(ten(B, NGAY, '120000'), csv([...rangeShbg(100, 110), { sh: shbg(100), bd8: 'KHAC' }]));
  const lay = () => ({
    files: ctx.db.prepare('SELECT * FROM arrival_import_files WHERE unit_code = ? AND file_date = ? ORDER BY id').all(B, NGAY),
    dong: ctx.db.prepare('SELECT * FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = ? AND file_date = ?) ORDER BY id').all(B, NGAY)
  });
  const truoc = lay();
  assert.equal(truoc.files.length, 2);
  const kq = await thay(nguonChuan(rangeShbg(0, 80)), { dongYMat: true });
  assert.notDeepEqual(lay(), truoc);
  // mô phỏng hoàn tác (5g-5 sẽ làm thật): xóa mới, chép từ thùng rác
  ctx.db.transaction(() => {
    ctx.db.prepare('DELETE FROM arrival_items WHERE import_file_id IN (SELECT id FROM arrival_import_files WHERE unit_code = ? AND file_date = ?)').run(B, NGAY);
    ctx.db.prepare('DELETE FROM arrival_import_files WHERE unit_code = ? AND file_date = ?').run(B, NGAY);
    ctx.db.prepare(`INSERT INTO arrival_import_files (${TT.COT_FILE.join(', ')}) SELECT ${TT.COT_FILE.join(', ')} FROM thung_rac_file WHERE thung_rac_id = ? ORDER BY id`).run(kq.nhat_ky_id);
    ctx.db.prepare(`INSERT INTO arrival_items (${TT.COT_DONG.join(', ')}) SELECT ${TT.COT_DONG.join(', ')} FROM thung_rac_dong WHERE thung_rac_id = ? ORDER BY id`).run(kq.nhat_ky_id);
  })();
  assert.deepEqual(lay(), truoc);
});

test('lược đồ mới: ba bảng có đủ cột / chỉ mục, tạo lại nhiều lần không lỗi, giờ lưu UTC ghi chú trong lược đồ', () => {
  for (const t of ['thay_the_nhat_ky', 'thung_rac_file', 'thung_rac_dong']) assert.ok(ctx.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t), t);
  TT.ensureThayTheSchema(ctx.db);
  TT.ensureThayTheSchema(ctx.db);
  const cot = ctx.db.prepare('PRAGMA table_info(thay_the_nhat_ky)').all().map((c) => c.name);
  for (const c of ['id', 'thoi_diem_utc', 'nguoi_thuc_hien', 'bcvh', 'ngay', 'tap_file_cu', 'tap_file_moi', 'so_dong_cu', 'so_dong_moi', 'shbg_mat_that', 'shbg_mat_can_tren', 'muc_canh_bao', 'dong_y_mat', 'duong_dan_sao_luu', 'ket_qua', 'thung_rac_het_han_luc']) assert.ok(cot.includes(c), c);
  assert.throws(() => ctx.db.prepare("INSERT INTO thay_the_nhat_ky (thoi_diem_utc, nguoi_thuc_hien, bcvh, ngay, tap_file_cu, tap_file_moi, muc_canh_bao, ket_qua, thung_rac_het_han_luc) VALUES ('x', 'x', 'x', 'x', '[]', '[]', 'LA', 'THANH_CONG', 'x')").run());
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'thayTheThucHien.js'), 'utf8'), /UTC/);
});

// =====================================================================
// KHOÁ
// =====================================================================
test('khoá: có lượt đồng bộ đang chạy -> DANG_CO_LUOT_DONG_BO (409), không liệt kê nguồn, DB y nguyên, client.end vẫn gọi; hết khoá thì thay được', async () => {
  await napCu(rangeShbg(0, 20));
  const t = new Date(NOW.getTime() + 60000);
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date(NOW.getTime() - 5 * 60000).toISOString());
  const truoc = chup();
  const src = nguonChuan(rangeShbg(0, 20));
  await assert.rejects(() => thay(src, { at: t }), loi('DANG_CO_LUOT_DONG_BO', 409));
  assert.equal(src.calls.list, 0);
  assert.equal(src.calls.end, 1);
  assert.equal(chup(), truoc);
  const hs = X.kiemTraKhoa; // khoá do bộ hẹn giờ trong tiến trình (tiêm trạng thái DANG_CHAY)
  await assert.rejects(() => thay(nguonChuan(rangeShbg(0, 20)), { at: new Date(NOW.getTime() + 3 * 3600000), options: { dangDongBo: () => true } }), loi('DANG_CO_LUOT_DONG_BO', 409));
  assert.equal(typeof hs, 'function');
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ?').run(NOW.toISOString());
  assert.equal((await thay(nguonChuan(rangeShbg(0, 20)))).so_dong_nap, 20);
});

test('khoá được GIỮ suốt lượt thay: lõi đồng bộ (syncSftpOnce) và bộ hẹn giờ thấy khoá và bỏ qua lượt; nhả sau khi xong', async () => {
  await napCu(rangeShbg(0, 20));
  let mo; const chan = new Promise((r) => { mo = r; });
  const t = new Date(NOW.getTime() + 60000);
  const src = nguonChuan(rangeShbg(0, 20), { chan });
  const p = thay(src, { at: t });
  await new Promise((r) => setImmediate(r));
  assert.equal(dangKhoa(), 1, 'đang giữ khoá');
  // lõi đồng bộ
  const kqSync = await S.syncSftpOnce({ client: nguonGia({ [D1]: {} }), db: ctx.db, dirs: [D1], now: () => t, sleep: async () => {}, tmpDir: tmpRoot });
  assert.equal(kqSync.biKhoa, true);
  assert.equal(dem('sftp_sync_files'), 0);
  // bộ hẹn giờ
  let soKetNoi = 0;
  const env = { SFTP_SYNC_ENABLED: '1', SFTP_HOST: 'nas.gia.local', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_DIRS: D1, SFTP_HOSTKEY_SHA256: 'a'.repeat(64) };
  const clock = { now: () => t, setTimeout: () => ({}), clearTimeout: () => {} };
  const bo = Sch.taoBoHenGio({ db: ctx.db, env, clock, tmpDir: tmpRoot, sleep: async () => {}, log: () => {}, choPhepTrongTest: true, ketNoi: async () => { soKetNoi++; return nguonGia({ [D1]: {} }); } });
  bo.batDau();
  await bo.chayNgay();
  assert.equal(bo.trangThai().luotGanNhat.ketQua, 'BI_KHOA_DB');
  assert.equal(soKetNoi, 0, 'hẹn giờ bỏ qua lượt, không kết nối');
  await bo.dung();
  // hai lần thay cùng lúc
  const src2 = nguonChuan(rangeShbg(0, 20));
  await assert.rejects(() => thay(src2, { at: t }), (e) => e.code === 'DANG_THAY_THE' && e.httpStatus === 409);
  assert.equal(src2.calls.list, 0);
  assert.equal(src2.calls.end, 1);
  mo();
  const kq = await p;
  assert.equal(kq.so_dong_nap, 20);
  assert.equal(dangKhoa(), 0, 'đã nhả');
  assert.ok((await thay(nguonChuan(rangeShbg(0, 20)))).so_dong_nap === 20, 'cờ trong bộ nhớ đã trả');
});

test('khoá được nhả và cờ được trả kể cả khi lỗi (nguồn, tải, xác nhận, ghi, sao lưu); client.end luôn gọi; tệp tạm luôn xóa', async () => {
  await napCu(rangeShbg(0, 20));
  const thu = async (src, extra) => { await assert.rejects(() => thay(src, extra)); assert.equal(dangKhoa(), 0); assert.equal(src.calls.end, 1); assert.ok(tmpSach()); };
  await thu(nguonGia({}, { loiList: Object.assign(new Error('No such file'), { code: 2 }) }));
  await thu(nguonChuan(rangeShbg(0, 20), { loiGet: new Error('lỗi tải') }));
  await thu(nguonChuan(rangeShbg(0, 20)), { sauLuuDir: path.join(tmpRoot, 'khong-phai-thu-muc') });
  await thu(nguonChuan(rangeShbg(0, 20)), { options: { sauKhiXoa: () => { throw new Error('x'); } } });
  await thu(nguonChuan(rangeShbg(0, 20)), { xacNhan: null });
  await thu(nguonChuan(rangeShbg(0, 20)), { ngay: '2026-13-40' });
  // lỗi kết nối (ketNoi ném): vẫn nhả khoá
  await assert.rejects(() => TT.thayTheNgay({ ketNoi: async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); }, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot,
    sauLuuDir: sauLuu, now: () => NOW, xacNhan: { ma_bcvh: B, ngay: NGAY }, tapFileNguonDuKien: [] }), (e) => e.code === 'NGUON_MANG' && e.httpStatus === 502);
  assert.equal(dangKhoa(), 0);
  assert.equal((await thay(nguonChuan(rangeShbg(0, 20)))).so_dong_nap, 20);
});

// =====================================================================
// CHẠY KHÔ
// =====================================================================
test('chạy khô: tải + tính mất thật, KHÔNG khoá, KHÔNG sao lưu, KHÔNG ghi; chạy được với DB mở chỉ-đọc', async () => {
  await napCu(rangeShbg(0, 100));
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(0, 3), { ngay: NGAY }));
  const truoc = chup();
  const chua = path.join(tmpRoot, 'se-khong-duoc-tao');
  const src = nguonChuan(rangeShbg(8, 100));
  const kq = await thay(src, { sauLuuDir: chua, tapFileNguonDuKien: null, xacNhan: null, options: { chayKho: true } });
  assert.equal(kq.chay_kho, true);
  assert.deepEqual([kq.so_sanh.shbg_mat_can_tren, kq.so_sanh.shbg_mat_that, kq.canh_bao.can_dong_y_mat, kq.canh_bao.muc], [8, 5, true, 'CAN_XAC_NHAN']);
  assert.deepEqual(kq.tap_file_nguon.map((x) => x.ten), [SANG, CHIEU]);
  assert.equal(chup(), truoc);
  assert.ok(!fs.existsSync(chua));
  assert.equal(src.calls.end, 1);
  assert.ok(tmpSach());
  const ro = new RealDatabase(ctx.testDbPath, { readonly: true });
  try {
    const kq2 = await TT.thayTheNgay({ client: nguonChuan(rangeShbg(8, 100)), dirs: [D1], db: ro, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, now: () => NOW, options: { chayKho: true } });
    assert.equal(kq2.so_sanh.shbg_mat_that, 5);
  } finally { ro.close(); }
  // chạy khô cũng báo nếu đang có lượt đồng bộ
  await assert.rejects(() => thay(nguonChuan(rangeShbg(8, 100)), { options: { chayKho: true, dangDongBo: () => true }, tapFileNguonDuKien: null, xacNhan: null }), loi('DANG_CO_LUOT_DONG_BO', 409));
});

// =====================================================================
// ROUTE
// =====================================================================
const goi = (who, body) => fetch(`${ctx.baseUrl}/api/arrivals/thay-the/thuc-hien`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const thanBody = (src, extra = {}) => ({ bcvh: B, ngay: NGAY, tap_file_nguon: duKienTu(src), xac_nhan: { ma_bcvh: B, ngay: NGAY }, dong_y_mat_du_lieu: false, ...extra });
const datNguon = (src, extra = {}) => X.datNguon({ ketNoi: async () => src, dirs: [D1], sauLuuDir: sauLuu, ...extra });
const docLog = () => { try { return fs.readFileSync(process.env.SECURITY_LOG, 'utf8'); } catch (e) { return ''; } };
const choLog = () => new Promise((r) => setTimeout(r, 120));

test('route POST /api/arrivals/thay-the/thuc-hien: ADMIN 200 (tóm tắt, không SHBG, không đường dẫn); TTVH, GDVH, STAFF, TIVI 403; không token 401', async () => {
  await napCu(rangeShbg(0, 30));
  const src = nguonChuan(rangeShbg(0, 40));
  datNguon(src);
  const body = thanBody(src);
  const truoc = chup();
  for (const who of ['ttvh', 'gdvh', 'staff', 'tivi']) assert.equal((await goi(who, body)).status, 403, who);
  assert.equal((await goi(null, body)).status, 401);
  assert.equal(chup(), truoc, 'người không đủ quyền không làm đổi gì');
  assert.equal(src.calls.get.length, 0);
  const r = await goi('admin', body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.so_dong_xoa, r.body.so_dong_nap, r.body.so_file_nap, r.body.so_sanh.shbg_mat_that], [30, 40, 2, 0]);
  assert.match(r.body.sao_luu.tep, /^truoc-thay-the_533140_2026-10-10_/);
  assert.equal(r.body.sao_luu.duong_dan, undefined);
  const chuoi = JSON.stringify(r.body);
  assert.ok(!chuoi.includes('ZZ9') && !chuoi.includes(sauLuu.replace(/\\/g, '\\\\')) && !/\d{15,}/.test(chuoi));
  assert.equal(dongNgay(), 40);
  assert.deepEqual(dsSaoLuu(), [r.body.sao_luu.tep]);
  assert.equal(ctx.db.prepare('SELECT nguoi_thuc_hien FROM thay_the_nhat_ky').get().nguoi_thuc_hien, 'TH_ADMIN');
});

test('route: tham số sai 400; xác nhận sai 400; khoá 409; nguồn đã đổi 409; cần đồng ý mất dữ liệu 409; tập rỗng / file lỗi 422; nguồn 502; chưa cấu hình 503; sao lưu lỗi 500', async () => {
  await napCu(rangeShbg(0, 100));
  const truoc = chup();
  const src = nguonChuan(rangeShbg(0, 100));
  datNguon(src);
  const ok = thanBody(src);
  const ma = async (body, status, code) => { const r = await goi('admin', body); assert.deepEqual([r.status, r.body.ma], [status, code], JSON.stringify(r.body)); return r; };
  await ma({ ...ok, bcvh: '000000' }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, ngay: '2026-99-99' }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, xoa: true }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, tap_file: 'x' }, 400, 'TAP_FILE_KHONG_HOP_LE');
  await ma({ ...ok, tap_file_nguon: undefined }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, tap_file_nguon: [{ ten: SANG, sha256: 'xyz' }] }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, dong_y_mat_du_lieu: 'yes' }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, xac_nhan: undefined }, 400, 'XAC_NHAN_SAI');
  await ma({ ...ok, xac_nhan: { ma_bcvh: B, ngay: '2026-10-11' } }, 400, 'XAC_NHAN_SAI');
  await ma({ ...ok, xac_nhan: { ma_bcvh: B, ngay: NGAY, them: 1 } }, 400, 'THAM_SO_SAI');
  await ma({ ...ok, tap_file_nguon: [{ ten: SANG, sha256: 'f'.repeat(64) }, ok.tap_file_nguon[1]] }, 409, 'NGUON_DA_DOI');
  await ma({ ...ok, tap_file: [] , tap_file_nguon: [] }, 422, 'KHONG_CO_FILE_DE_THAY');
  const mat = nguonChuan(rangeShbg(20, 100));
  datNguon(mat);
  await ma(thanBody(mat), 409, 'CAN_DONG_Y_MAT_DU_LIEU');
  datNguon(nguonChuan(rangeShbg(0, 100), { loiGet: new Error('x') }));
  await ma(ok, 422, 'FILE_NGUON_LOI');
  const id = ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date().toISOString()).lastInsertRowid;
  datNguon(src);
  await ma(ok, 409, 'DANG_CO_LUOT_DONG_BO');
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  X.datNguon({ ketNoi: async () => { throw Object.assign(new Error('All configured authentication methods failed'), {}); }, dirs: [D1], sauLuuDir: sauLuu });
  await ma(ok, 502, 'NGUON_XAC_THUC');
  X.datNguon(null);
  const c = await ma(ok, 503, 'CHUA_CAU_HINH_SFTP');
  assert.match(c.body.error, /SFTP_/);
  datNguon(src, { sauLuuDir: path.join(tmpRoot, 'khong-phai-thu-muc') });
  fs.writeFileSync(path.join(tmpRoot, 'khong-phai-thu-muc'), 'x');
  await ma(ok, 500, 'SAO_LUU_LOI');
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ?').run(new Date().toISOString());
  assert.equal(dongNgay(), 100, 'mọi lỗi: dữ liệu y nguyên');
  assert.equal(dem('thay_the_nhat_ky'), 0);
  assert.deepEqual(dsSaoLuu(), []);
  void truoc;
});

test('SECURITY_LOG: mỗi lần thay một dòng (ai, BCVH, ngày, kết quả) — KHÔNG có SHBG, KHÔNG có mật khẩu / đường dẫn đầy đủ', async () => {
  await napCu(rangeShbg(0, 30));
  const src = nguonChuan(rangeShbg(10, 40));
  datNguon(src);
  const sl = () => docLog().split('\n').filter((l) => l.includes('arrivals_thay_the_thuc_hien'));
  const truoc = sl().length;
  assert.equal((await goi('admin', thanBody(src))).status, 409, 'mất 10 SHBG mà chưa đồng ý');
  const r = await goi('admin', thanBody(src, { dong_y_mat_du_lieu: true }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await choLog();
  const dong = sl();
  assert.equal(dong.length - truoc, 2);
  const j0 = JSON.parse(dong[dong.length - 2]);
  const j1 = JSON.parse(dong[dong.length - 1]);
  assert.deepEqual([j0.event, j0.ket_qua, j0.bcvh, j0.ngay, j0.hrm_code, j0.role], ['arrivals_thay_the_thuc_hien', 'CAN_DONG_Y_MAT_DU_LIEU', B, NGAY, 'TH_ADMIN', 'ADMIN']);
  assert.deepEqual([j1.ket_qua, j1.so_dong_xoa, j1.so_dong_nap, j1.shbg_mat_that, j1.nhat_ky_id], ['ok', 30, 30, 10, r.body.nhat_ky_id]);
  const toanBo = dong.join('\n');
  assert.ok(!toanBo.includes('ZZ9'), 'log không có SHBG');
  assert.ok(!/mat-khau|password|token/i.test(toanBo));
  assert.ok(!/\d{15,}/.test(toanBo));
  assert.ok(!toanBo.includes(sauLuu.replace(/\\/g, '\\\\')) && !toanBo.includes('truoc-thay-the'), 'log không có đường dẫn sao lưu');
});

// =====================================================================
// SCRIPT
// =====================================================================
test('script: tham số / xác nhận sai thoát mã 8; thiếu cấu hình SFTP thoát mã 2 — cả hai TRƯỚC khi mở DB hay kết nối (thư mục tạm, môi trường sạch)', () => {
  const kich = path.join(__dirname, '..', 'scripts', 'thay-the-ngay.js');
  const chay = (...args) => spawnSync(process.execPath, [kich, ...args], { cwd: tmpRoot, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '' }, encoding: 'utf8', timeout: 20000 });
  const ca = [
    [], ['--bcvh=000000', '--ngay=2026-10-10'], ['--bcvh=533140', '--ngay=2026-02-30'], ['--bcvh=533140', '--ngay=2026-10-10', '--xoa'],
    ['--bcvh=533140', '--ngay=2026-10-10', '--chi-lay='], ['--bcvh=533140', '--ngay=2026-10-10', '--chay-that'],
    ['--bcvh=533140', '--ngay=2026-10-10', '--chay-that', '--xac-nhan=535470:2026-10-10'], ['--bcvh=533140', '--ngay=2026-10-10', '--chay-that', '--xac-nhan=533140:2026-10-11'],
    ['--bcvh=533140', '--ngay=2026-10-10', '--chay-that', '--xac-nhan=533140-2026-10-10']
  ];
  for (const args of ca) {
    const r = chay(...args);
    assert.equal(r.status, 8, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /THAM_SO_SAI|TAP_FILE_KHONG_HOP_LE|XAC_NHAN_SAI/);
  }
  for (const args of [['--bcvh=533140', '--ngay=2026-10-10'], ['--bcvh=533140', '--ngay=2026-10-10', '--chay-that', '--xac-nhan=533140:2026-10-10', '--dong-y-mat']]) {
    const r = chay(...args);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /SFTP_HOST/);
    assert.ok(!/\d{15,}/.test(r.stdout + r.stderr));
  }
  assert.equal(TT.MA_THOAT.CAN_DONG_Y, 9);
  assert.equal(TT.MA_THOAT.NGUON_DA_DOI, 10);
  assert.equal(TT.MA_THOAT.SAO_LUU_LOI, 11);
  assert.equal(TT.THOAT_THEO_LOI.CAN_DONG_Y_MAT_DU_LIEU, 9);
  assert.equal(TT.THOAT_THEO_LOI.NGUON_DA_DOI, 10);
  assert.equal(TT.THOAT_THEO_LOI.DANG_CO_LUOT_DONG_BO, 7);
});

// =====================================================================
// KIỂM TĨNH
// =====================================================================
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LENH_GHI_SFTP = /\b(put|fastPut|delete|rename|mkdir|rmdir|chmod|append)\s*\(/;

/** Lấy thân của khối `db.transaction(() => { … })` đứng sau `prefix` (đếm ngoặc nhọn). */
function thanGiaoDich(src, prefix) {
  const i = src.indexOf(prefix);
  assert.ok(i >= 0, `không thấy ${prefix}`);
  const a = src.indexOf('{', i + prefix.length);
  let sau = 0;
  for (let k = a; k < src.length; k++) {
    if (src[k] === '{') sau++;
    else if (src[k] === '}' && --sau === 0) return src.slice(a, k + 1);
  }
  throw new Error('không khớp ngoặc');
}

test('kiểm tĩnh: lõi KHÔNG nạp thư viện SFTP, KHÔNG lệnh ghi SFTP (chỉ list / get / end), không mở DB; trong db.transaction của lõi KHÔNG có await', () => {
  const raw = doc('server', 'lib', 'thayTheThucHien.js');
  const code = boChuThich(raw);
  assert.ok(!raw.includes('ssh2-sftp-client') && !/require\(['"]ssh2/.test(raw));
  assert.ok(!LENH_GHI_SFTP.test(code), 'không có put / delete / rename / … ( ');
  assert.ok(!/require\(['"]\.\.?\/db/.test(raw), 'lõi không mở DB');
  const used = new Set([...code.matchAll(/\bketNoiXong\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['end', 'get'], 'lõi chỉ gọi get / end; list nằm ở X.lietKeNguonCuaNgay (đã được test tĩnh 5g-2)');
  const tx = thanGiaoDich(raw, 'const thucHien = db.transaction(');
  assert.ok(tx.length > 500, 'lấy được thân giao dịch');
  assert.ok(!/\bawait\b|\basync\b|\.then\(/.test(tx), 'giao dịch phải đồng bộ');
  assert.ok(/thucHien\.immediate\(\)/.test(code));
  assert.ok(/ghiTuChoi: false/.test(tx), 'nạp bằng ghiFileDaChuanBi với ghiTuChoi=false');
  // bốn việc đúng thứ tự trong giao dịch: thùng rác -> xóa dòng -> xóa file -> nạp
  const vt = (s) => tx.indexOf(s);
  assert.ok(vt('INSERT INTO thung_rac_file') > 0 && vt('INSERT INTO thung_rac_file') < vt('INSERT INTO thung_rac_dong') && vt('INSERT INTO thung_rac_dong') < vt('DELETE FROM arrival_items')
    && vt('DELETE FROM arrival_items') < vt('DELETE FROM arrival_import_files') && vt('DELETE FROM arrival_import_files') < vt('o.ghiFn('));
  // không dùng trạng thái phát
  assert.ok(!/phat_status_current/.test(code.replace(/X\.docPhiaPhat/g, '')), 'không đụng bảng trạng thái phát');
  // thứ tự các bước trong hàm: khoá -> sao lưu -> giao dịch -> dọn
  const hamThay = raw.slice(raw.indexOf('async function thayTheNgay'));
  const idx = ['batDauKhoa(db, batDau)', 'lietKeNguonCuaNgay', 'tinhMatThat(db', 'await saoLuu(', 'thucHien.immediate()', 'donThungRac(db'].map((s) => hamThay.indexOf(s));
  assert.ok(idx.every((x) => x > 0) && idx.every((x, k) => k === 0 || x > idx[k - 1]), idx.join(','));
});

test('kiểm tĩnh: script chạy khô mở DB chỉ-đọc, chỉ chế độ GHI khi --chay-that; không lệnh ghi SFTP; không in user / password; route chỉ ADMIN và không nạp thư viện SFTP', () => {
  const sc = boChuThich(doc('scripts', 'thay-the-ngay.js'));
  assert.ok(/chayThat \? \{ fileMustExist: true \} : \{ readonly: true, fileMustExist: true \}/.test(sc));
  assert.ok(!LENH_GHI_SFTP.test(sc));
  assert.ok(!/require\(['"]\.\.\/server\/db/.test(sc));
  assert.ok(!/INSERT|UPDATE|DELETE|CREATE|DROP/i.test(sc), 'script không tự viết câu lệnh ghi');
  for (const l of sc.split('\n').filter((x) => /\b(log|loi|console\.\w+)\s*\(/.test(x))) assert.ok(!/cfg\.(user|password)\b|SFTP_(USER|PASSWORD)\b|process\.env|tracking_no|shbg_mau|chiOCu|\.shbg\b/.test(l), l.trim());
  assert.ok(/--chay-that/.test(sc) && /--xac-nhan/.test(sc) && /--dong-y-mat/.test(sc));
  const rt = boChuThich(doc('server', 'routes', 'arrivals.js'));
  assert.ok(!rt.includes('ssh2-sftp-client'));
  assert.ok(/router\.post\('\/arrivals\/thay-the\/thuc-hien', requireAdmin/.test(rt));
  // không đổi hành vi importer / đồng bộ / hẹn giờ: các file này không nhắc tới lõi thay thế
  for (const f of ['arrivalsImport.js', 'sftpSync.js', 'sftpScheduler.js']) assert.ok(!doc('server', 'lib', f).includes('thayTheThucHien'), f);
});

test('kết quả / thông báo lỗi không chứa dãy ≥ 15 chữ số hay SHBG, kể cả khi lỗi', async () => {
  await napCu(rangeShbg(0, 40));
  const gom = [];
  const ghi = async (p) => { try { gom.push(JSON.stringify(await p)); } catch (e) { gom.push(e.message); } };
  await ghi(thay(nguonChuan(rangeShbg(20, 40))));
  await ghi(thay(nguonChuan(rangeShbg(20, 40)), { dongYMat: true }));
  await ghi(thay(nguonChuan(rangeShbg(0, 40), { loiGet: new Error(`lỗi ${shbg(1)}`) })));
  await ghi(thay(nguonChuan(rangeShbg(0, 40)), { xacNhan: null }));
  const s = gom.join('\n');
  assert.ok(gom.length === 4 && !/\d{15,}/.test(s) && !s.includes('ZZ9'));
});
