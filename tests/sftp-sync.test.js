// ==========================================
// Test SANLUONG-5c: lõi đồng bộ SFTP (server/lib/sftpSync.js) + kiểm tĩnh scripts/sftp-sync.js.
// DB tạm của harness, `client` GIẢ (không mạng, không ssh2), CSV / SHBG GIẢ (9 chữ số, không có dãy ≥ 15 chữ số). Không chạy script.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RealDatabase = require('better-sqlite3'); // nạp TRƯỚC khi harness thay thế (ca chạy khô mở DB chỉ-đọc)
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { EXPECTED_HEADER, importArrivalFile } = require('../server/lib/arrivalsImport');
const S = require('../server/lib/sftpSync');
const F = require('../server/lib/sftpFiles');

const PORT = 5925;
const D1 = '/CSV_Report_533140';
const D2 = '/CSV_Report_535470';
const NOW = new Date('2026-10-14T05:00:00Z'); // 12:00 ngày 14/10 giờ Bangkok -> «từ ngày» mặc định 11/10
let ctx;
let tmpRoot;
let seq = 0;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-sftp-sync-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-sftp-sync-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
});
after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  for (const t of ['sftp_sync_files', 'sftp_sync_runs', 'arrival_items', 'arrival_import_files']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- dữ liệu giả ----------
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
/** CSV giả `n` dòng cho BCVH `ma`, ngày `ymd` (YYYY-MM-DD). Trả Buffer. */
function csv(ma, ymd, n = 3) {
  const lines = [EXPECTED_HEADER.map(qt).join(',')];
  for (let i = 0; i < n; i++) {
    seq++;
    const row = {
      Ma_BC_dong: '990001', BC_nhan_BG: ma, Ten_duong_thu: 'Đường A', SHBG: `ZZ${String(900000000 + seq)}VN`, So_hieu_BD10: '',
      'Thời gian XN túi': `${ymd} ${String(7 + i).padStart(2, '0')}:00:00`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
      So_hieu_BD8: `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL', Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
    };
    lines.push(EXPECTED_HEADER.map((h) => qt(row[h] ?? '')).join(','));
  }
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n');
}
const ngayTen = (x) => `${x.slice(15, 19)}-${x.slice(19, 21)}-${x.slice(21, 23)}`;
const ten = (ma, ymd, hms = '093012') => `HangDen_${ma}_${ymd.replace(/-/g, '')}_${hms}.csv`;

/** Máy chủ SFTP giả: files = { thư mục: { tên: { buf, mtime } } }. onList(dir, lanThu) cho phép đổi dữ liệu giữa hai lần liệt kê. */
function nguonGia(files, { onList = null, loiList = {}, loiGet = null } = {}) {
  const lan = {};
  const calls = { list: [], get: [] };
  const client = {
    calls,
    async list(dir) {
      calls.list.push(dir);
      lan[dir] = (lan[dir] || 0) + 1;
      if (loiList[dir]) throw loiList[dir];
      if (onList) onList(dir, lan[dir], files);
      return Object.entries(files[dir] || {}).map(([name, f]) => ({ type: f.type || '-', name, size: f.type === 'd' ? 0 : f.buf.length, modifyTime: f.mtime || 1760400000000 }));
    },
    async get(xa, cucBo) {
      calls.get.push(xa);
      if (loiGet) throw loiGet;
      const dir = xa.slice(0, xa.lastIndexOf('/'));
      const name = xa.slice(xa.lastIndexOf('/') + 1);
      fs.writeFileSync(cucBo, files[dir][name].buf);
    }
  };
  return client;
}
const f = (buf, mtime) => ({ buf, mtime: mtime || 1760400000000 });

async function chay(client, { dirs = [D1], options = {}, db = ctx.db, tmpDir = tmpRoot, now = () => NOW } = {}) {
  const ngu = [];
  const kq = await S.syncSftpOnce({ client, db, dirs, now, sleep: async (ms) => { ngu.push(ms); }, tmpDir, options });
  kq.ngu = ngu;
  return kq;
}
const rows = (sql, ...p) => ctx.db.prepare(sql).all(...p);
const dem = (t) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const byName = (kq) => Object.fromEntries(kq.files.map((x) => [x.tenFile, x]));
const tmpSach = () => fs.readdirSync(tmpRoot).filter((n) => n.startsWith('hue-dhcl-sftp-')).length === 0;

// ---------- lược đồ ----------
test('lược đồ: sftp_sync_runs / sftp_sync_files được tạo (qua server/db.js) với đúng cột; idempotent', () => {
  const cols = (t) => ctx.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.deepEqual(cols('sftp_sync_runs'), ['id', 'started_at', 'finished_at', 'trigger', 'dry_run', 'tong_liet_ke', 'da_nap', 'da_co', 'chua_on_dinh', 'rong', 'bo_qua_khac', 'loi', 'ghi_chu_loi']);
  assert.deepEqual(cols('sftp_sync_files'), ['id', 'run_id', 'thu_muc', 'ten_file', 'ket_qua', 'so_dong', 'thoi_gian_ms', 'ma_loi', 'chi_tiet']);
  assert.doesNotThrow(() => S.ensureSftpSyncSchema(ctx.db));
  ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at) VALUES ('2026-10-14T00:00:00.000Z')").run();
  assert.equal(ctx.db.prepare('SELECT "trigger" AS t FROM sftp_sync_runs').get().t, 'MANUAL', 'mặc định MANUAL');
  assert.throws(() => ctx.db.prepare("INSERT INTO sftp_sync_runs (started_at, \"trigger\") VALUES ('x', 'CRON')").run(), 'chỉ MANUAL | TIMER');
  assert.throws(() => ctx.db.prepare("INSERT INTO sftp_sync_files (run_id, thu_muc, ten_file, ket_qua) VALUES (1, 'd', 'n', 'KHAC')").run());
});

// ---------- chọn file ----------
test('bỏ qua DuBao_*, #recycle, tên bắt đầu ".", tên lạ; chỉ tải và nạp file HangDen_ hợp lệ', async () => {
  const a = ten('533140', '2026-10-14');
  const src = nguonGia({ [D1]: {
    [a]: f(csv('533140', '2026-10-14')), 'DuBao_533140_20261014.csv': f(csv('533140', '2026-10-14')), '#recycle': { type: 'd', buf: Buffer.alloc(0) },
    '.hidden': f(Buffer.from('x')), 'ghi-chu.txt': f(Buffer.from('xxxx')), 'HangDen_533140_20261014_093012.csv.part': f(Buffer.from('xxxx'))
  } });
  const kq = await chay(src);
  assert.deepEqual(kq.files.map((x) => [x.tenFile, x.ketQua]), [[a, 'DA_NAP']]);
  assert.deepEqual(src.calls.get, [`${D1}/${a}`]);
  assert.equal(kq.dem.boQuaKhac, 5);
  assert.equal(kq.dem.tongListKe, 6);
  assert.equal(dem('arrival_items'), 3);
  assert.equal(rows('SELECT source FROM arrival_import_files')[0].source, 'SFTP');
});

test('file ≤ 3 byte (chỉ BOM): sau khi ổn định vẫn TẢI, importer ghi đợt EMPTY; lượt sau DA_CO; getMissingBatches không báo thiếu đợt', async () => {
  const sang = ten('533140', '2026-10-13', '093012');
  const chieu = ten('533140', '2026-10-13', '150011'); // chiều Chủ nhật: chỉ có BOM
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const files = { [D1]: { [sang]: f(csv('533140', '2026-10-13')), [chieu]: f(bom) } };
  const src = nguonGia(files);
  let kq = await chay(src);
  const r = byName(kq);
  assert.equal(r[chieu].ketQua, 'EMPTY');
  assert.equal(r[chieu].soDong, 0);
  assert.equal(r[chieu].maLoi ?? null, null, 'không còn KHONG_TAI');
  assert.equal(r[sang].ketQua, 'DA_NAP');
  assert.deepEqual(src.calls.get, [`${D1}/${sang}`, `${D1}/${chieu}`], 'file 3 byte được tải');
  assert.equal(kq.dem.rong, 1);
  const ls = rows('SELECT file_name, status, row_count, source FROM arrival_import_files WHERE file_name = ?', chieu);
  assert.deepEqual(ls.map((x) => [x.status, x.row_count, x.source]), [['EMPTY', 0, 'SFTP']], 'importer ghi đợt EMPTY');
  assert.equal(rows('SELECT ket_qua FROM sftp_sync_files WHERE ten_file = ?', chieu)[0].ket_qua, 'EMPTY');
  assert.ok(tmpSach());

  // đủ 2 đợt cho ngày 13/10 -> không thiếu đợt (hôm nay = 14/10)
  const { getMissingBatches } = require('../server/lib/arrivalsImport');
  assert.deepEqual(getMissingBatches(ctx.db, { today: '2026-10-14' }), []);

  // lượt sau: cả hai đã có -> DA_CO, không tải nữa
  const src2 = nguonGia(files);
  kq = await chay(src2);
  assert.deepEqual(kq.files.map((x) => x.ketQua), ['DA_CO', 'DA_CO']);
  assert.equal(src2.calls.get.length, 0);
  assert.equal(dem('arrival_import_files'), 2);
});

test('đối chứng: nếu file 3 byte không được nạp thì ngày đó BỊ báo thiếu đợt (lý do phải để importer ghi EMPTY)', async () => {
  const sang = ten('533140', '2026-10-13', '093012');
  await chay(nguonGia({ [D1]: { [sang]: f(csv('533140', '2026-10-13')) } }));
  const { getMissingBatches } = require('../server/lib/arrivalsImport');
  assert.deepEqual(getMissingBatches(ctx.db, { today: '2026-10-14' }), [{ unit_code: '533140', date: '2026-10-13', file_count: 1 }]);
});

test('file 0–3 byte còn đang đổi giữa hai lần liệt kê -> CHUA_ON_DINH, KHÔNG tải; file rỗng 0 byte ổn định cũng đi qua importer', async () => {
  const dang = ten('533140', '2026-10-14', '093012');
  const rong = ten('533140', '2026-10-14', '150011');
  const files = { [D1]: { [dang]: f(Buffer.alloc(0)), [rong]: f(Buffer.alloc(0)) } };
  const src = nguonGia(files, { onList: (dir, lan, fs2) => { if (lan === 2) fs2[dir][dang] = f(Buffer.from([0xef, 0xbb, 0xbf])); } });
  const kq = await chay(src);
  assert.equal(byName(kq)[dang].ketQua, 'CHUA_ON_DINH');
  assert.equal(byName(kq)[rong].ketQua, 'EMPTY');
  assert.deepEqual(src.calls.get, [`${D1}/${rong}`]);
  assert.equal(rows('SELECT status FROM arrival_import_files WHERE file_name = ?', rong)[0].status, 'EMPTY');
  assert.equal(rows('SELECT 1 FROM arrival_import_files WHERE file_name = ?', dang).length, 0);
});

test('«từ ngày»: mặc định hôm nay (Bangkok) − 3 ngày; --tu-ngay ghi đè; ngày biên được lấy; file cũ chỉ đếm, không ghi từng file', async () => {
  const cu = ten('533140', '2026-10-10');
  const bien = ten('533140', '2026-10-11');
  const moi = ten('533140', '2026-10-14');
  const mk = () => nguonGia({ [D1]: { [cu]: f(csv('533140', '2026-10-10')), [bien]: f(csv('533140', '2026-10-11')), [moi]: f(csv('533140', '2026-10-14')) } });
  let src = mk();
  let kq = await chay(src);
  assert.equal(kq.tuNgay, '2026-10-11');
  assert.deepEqual(kq.files.map((x) => x.tenFile), [bien, moi]);
  assert.equal(kq.dem.boQuaKhac, 1);
  assert.equal(rows('SELECT 1 FROM sftp_sync_files WHERE ten_file = ?', cu).length, 0);
  assert.ok(!src.calls.get.some((g) => g.endsWith(cu)));

  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  src = mk();
  kq = await chay(src, { options: { tuNgay: '2026-10-14' } });
  assert.deepEqual(kq.files.map((x) => x.tenFile), [moi]);
  // soNgay = 0 -> chỉ hôm nay
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  kq = await chay(mk(), { options: { soNgay: 0 } });
  assert.equal(kq.tuNgay, '2026-10-14');
  // ranh giới ngày theo giờ Bangkok: 18:00Z ngày 13 = 01:00 ngày 14 giờ Bangkok
  kq = await chay(mk(), { now: () => new Date('2026-10-13T18:00:00Z') });
  assert.equal(kq.tuNgay, '2026-10-11');
});

test('đã nạp: DA_CO, KHÔNG tải; nguồn ghi đè (kích thước khác) chỉ cảnh báo, KHÔNG nạp đè, không sinh CONFLICT', async () => {
  const a = ten('533140', '2026-10-13');
  const b = ten('533140', '2026-10-14');
  const files = { [D1]: { [a]: f(csv('533140', '2026-10-13')), [b]: f(csv('533140', '2026-10-14')) } };
  let kq = await chay(nguonGia(files));
  assert.equal(kq.dem.daNap, 2);
  const truoc = dem('arrival_items');

  const src = nguonGia(files);
  kq = await chay(src);
  assert.deepEqual(kq.files.map((x) => x.ketQua), ['DA_CO', 'DA_CO']);
  assert.equal(src.calls.get.length, 0);
  assert.equal(kq.dem.daCo, 2);
  assert.equal(kq.dem.daNap, 0);

  files[D1][b] = f(csv('533140', '2026-10-14', 5)); // nguồn ghi đè bằng nội dung khác
  const src2 = nguonGia(files);
  kq = await chay(src2);
  const r = byName(kq);
  assert.equal(r[b].ketQua, 'DA_CO');
  assert.equal(r[b].maLoi, 'KICH_THUOC_KHAC_BAN_DA_NAP');
  assert.equal(r[a].maLoi, null);
  assert.equal(src2.calls.get.length, 0);
  assert.equal(dem('arrival_items'), truoc, 'không nạp đè');
  assert.equal(rows("SELECT 1 FROM arrival_import_files WHERE status = 'CONFLICT'").length, 0);
});

test('chưa ổn định: đổi kích thước / đổi mtime giữa hai lần liệt kê, hoặc chỉ xuất hiện ở lần 2 -> CHUA_ON_DINH, không tải, không nạp', async () => {
  const dinh = ten('533140', '2026-10-14', '093012');
  const doiSize = ten('533140', '2026-10-14', '093113');
  const doiMtime = ten('533140', '2026-10-14', '093214');
  const moiLan2 = ten('533140', '2026-10-14', '093315');
  const files = { [D1]: { [dinh]: f(csv('533140', '2026-10-14')), [doiSize]: f(csv('533140', '2026-10-14', 2)), [doiMtime]: f(csv('533140', '2026-10-14')) } };
  const src = nguonGia(files, { onList: (dir, lan, fs2) => {
    if (lan === 2) {
      fs2[dir][doiSize] = f(csv('533140', '2026-10-14', 4));
      fs2[dir][doiMtime] = f(fs2[dir][doiMtime].buf, 1760400099999);
      fs2[dir][moiLan2] = f(csv('533140', '2026-10-14'));
    }
  } });
  const kq = await chay(src);
  const r = byName(kq);
  assert.equal(r[dinh].ketQua, 'DA_NAP');
  for (const n of [doiSize, doiMtime, moiLan2]) assert.equal(r[n].ketQua, 'CHUA_ON_DINH', n);
  assert.equal(kq.dem.chuaOnDinh, 3);
  assert.deepEqual(src.calls.get, [`${D1}/${dinh}`]);
  assert.equal(dem('arrival_import_files'), 1);
  assert.deepEqual(kq.ngu, [60000], 'chờ SFTP_STABLE_SECONDS mặc định (60 s) giữa hai lần liệt kê, không so với đồng hồ máy');
  assert.equal(src.calls.list.length, 2);
  // lần chạy sau (đã ổn định) thì nạp
  const kq2 = await chay(nguonGia({ [D1]: { [dinh]: f(csv('533140', '2026-10-14')), [doiSize]: files[D1][doiSize] } }), { options: { onDinhGiay: 5 } });
  assert.equal(byName(kq2)[doiSize].ketQua, 'DA_NAP');
  assert.deepEqual(kq2.ngu, [5000]);
});

test('nạp theo thứ tự tên tăng dần (cũ trước), qua nhiều thư mục; từng file một', async () => {
  const n = [ten('533140', '2026-10-14', '150011'), ten('533140', '2026-10-12'), ten('533140', '2026-10-14', '093012'), ten('533140', '2026-10-13')];
  const m = [ten('535470', '2026-10-12', '083000')];
  const src = nguonGia({ [D1]: Object.fromEntries(n.map((x, i) => [x, f(csv('533140', ngayTen(x), 2 + i))])), [D2]: Object.fromEntries(m.map((x) => [x, f(csv('535470', '2026-10-12'))])) });
  const kq = await chay(src, { dirs: [D1, D2], options: { toiDa: 10 } });
  const mong = [...n, ...m].sort((a, b) => { const k = (x) => x.slice(-19, -4); return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : a < b ? -1 : 1; });
  assert.deepEqual(src.calls.get.map((g) => g.slice(g.lastIndexOf('/') + 1)), mong);
  assert.deepEqual(rows('SELECT file_name FROM arrival_import_files ORDER BY id').map((r) => r.file_name), mong, 'thứ tự nạp = thứ tự ghi lịch sử');
  assert.equal(kq.dem.daNap, 5);
});

test('--toi-da: chỉ nạp N file cũ nhất; phần còn lại BO_QUA VUOT_TOI_DA (để lần sau)', async () => {
  const t = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const src = nguonGia({ [D1]: Object.fromEntries(t.map((x, i) => [x, f(csv('533140', ['2026-10-12', '2026-10-13', '2026-10-14'][i]))])) });
  const kq = await chay(src, { options: { toiDa: 2 } });
  assert.deepEqual(kq.files.map((x) => [x.tenFile, x.ketQua, x.maLoi ?? null]), [[t[2], 'BO_QUA', 'VUOT_TOI_DA'], [t[0], 'DA_NAP', null], [t[1], 'DA_NAP', null]]);
  assert.equal(kq.dem.daNap, 2);
  assert.equal(src.calls.get.length, 2);
  // mặc định 5
  assert.equal(S.MAC_DINH.toiDa, 5);
});

test('lỗi một file KHÔNG dừng các file còn lại; ghi LOI + mã; tệp tạm được xoá', async () => {
  const t = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const src = nguonGia({ [D1]: Object.fromEntries(t.map((x, i) => [x, f(csv('533140', ['2026-10-12', '2026-10-13', '2026-10-14'][i]))])) });
  const importFn = async (db, p, opts) => {
    if (p.endsWith(t[1])) throw Object.assign(new Error('đĩa đầy giả'), { code: 'ENOSPC' });
    return importArrivalFile(db, p, opts);
  };
  const kq = await chay(src, { options: { importFn } });
  const r = byName(kq);
  assert.deepEqual([r[t[0]].ketQua, r[t[1]].ketQua, r[t[2]].ketQua], ['DA_NAP', 'LOI', 'DA_NAP']);
  assert.equal(r[t[1]].maLoi, 'ENOSPC');
  assert.equal(kq.dem.loi, 1);
  assert.equal(S.maThoat(kq), 1);
  assert.ok(tmpSach());
  const run = rows('SELECT * FROM sftp_sync_runs')[0];
  assert.ok(run.finished_at);
  assert.equal(run.loi, 1);
  assert.match(run.ghi_chu_loi, /ENOSPC/);
  assert.equal(rows("SELECT ket_qua FROM sftp_sync_files WHERE run_id = ? AND ket_qua = 'LOI'", run.id).length, 1);
});

test('importer từ chối (tiêu đề sai): LOI REJECTED kèm lý do ngắn; lần sau cùng kích thước -> BO_QUA DA_TU_CHOI (không tải lại); lỗi hệ thống tạm thời thì thử lại', async () => {
  const bad = ten('533140', '2026-10-13');
  const buf = Buffer.from('﻿"A","B"\r\n"1","2"\r\n');
  const files = { [D1]: { [bad]: f(buf) } };
  let src = nguonGia(files);
  let kq = await chay(src);
  assert.equal(byName(kq)[bad].ketQua, 'LOI');
  assert.equal(byName(kq)[bad].maLoi, 'REJECTED');
  assert.match(byName(kq)[bad].chiTiet, /Sai tiêu đề/);
  assert.equal(src.calls.get.length, 1);

  src = nguonGia(files);
  kq = await chay(src);
  assert.equal(byName(kq)[bad].ketQua, 'BO_QUA');
  assert.equal(byName(kq)[bad].maLoi, 'DA_TU_CHOI');
  assert.equal(src.calls.get.length, 0, 'không tải lại file đã bị từ chối cùng kích thước');

  // lỗi hệ thống tạm thời (không phải lỗi nội dung) -> thử lại
  const tam = ten('533140', '2026-10-14');
  const b2 = csv('533140', '2026-10-14');
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES ('533140', ?, '2026-10-14', '09:30:12', ?, 'aa', 'REJECTED', 'Lỗi hệ thống: SQLITE_BUSY')").run(tam, b2.length);
  src = nguonGia({ [D1]: { [tam]: f(b2) } });
  kq = await chay(src);
  assert.equal(byName(kq)[tam].ketQua, 'DA_NAP');
  assert.equal(src.calls.get.length, 1);
});

test('tải về lệch kích thước so với danh sách -> LOI KICH_THUOC_LECH, không nạp; lỗi tải cũng chỉ ghi LOI', async () => {
  const a = ten('533140', '2026-10-14');
  const buf = csv('533140', '2026-10-14');
  const src = nguonGia({ [D1]: { [a]: f(buf) } });
  src.get = async (xa, cucBo) => { fs.writeFileSync(cucBo, buf.subarray(0, buf.length - 10)); };
  let kq = await chay(src);
  assert.equal(byName(kq)[a].ketQua, 'LOI');
  assert.equal(byName(kq)[a].maLoi, 'KICH_THUOC_LECH');
  assert.equal(dem('arrival_import_files'), 0);
  assert.ok(tmpSach());

  const src2 = nguonGia({ [D1]: { [a]: f(buf) } }, { loiGet: Object.assign(new Error('connection reset giả'), { code: 'ECONNRESET' }) });
  kq = await chay(src2);
  assert.equal(byName(kq)[a].maLoi, 'ECONNRESET');
  assert.equal(dem('arrival_import_files'), 0);
  assert.ok(tmpSach());
});

test('một thư mục chứa file của NHIỀU mã (SANLUONG-5c-1): cả ba mã được nạp, không còn KHAC_MA_THU_MUC; mã lấy từ TÊN FILE; thống kê theo mã', async () => {
  const a1 = ten('533140', '2026-10-14', '162011');
  const a2 = ten('535470', '2026-10-14', '162011');
  const a3 = ten('537220', '2026-10-14', '162011');
  const src = nguonGia({ [D1]: { [a1]: f(csv('533140', '2026-10-14')), [a2]: f(csv('535470', '2026-10-14')), [a3]: f(csv('537220', '2026-10-14')) } });
  const kq = await chay(src); // D1 = /CSV_Report_533140: tên thư mục mang mã 533140 nhưng KHÔNG còn là điều kiện lọc
  assert.deepEqual(kq.files.map((x) => [x.maDonVi, x.ketQua]), [['533140', 'DA_NAP'], ['535470', 'DA_NAP'], ['537220', 'DA_NAP']]);
  assert.ok(!JSON.stringify(kq).includes('KHAC_MA_THU_MUC'));
  assert.equal(kq.dem.daNap, 3);
  assert.deepEqual(rows('SELECT unit_code, source FROM arrival_import_files ORDER BY unit_code').map((x) => [x.unit_code, x.source]), [['533140', 'SFTP'], ['535470', 'SFTP'], ['537220', 'SFTP']]);
  assert.deepEqual(rows('SELECT DISTINCT receiver_code FROM arrival_items ORDER BY receiver_code').map((x) => x.receiver_code), ['533140', '535470', '537220']);
  // thống kê theo mã: đủ 6 BCVH, mã chưa có file hiện 0
  assert.deepEqual(Object.keys(kq.theoMa).sort(), ['533140', '535470', '535790', '536250', '537015', '537220']);
  assert.equal(kq.theoMa['533140'].daNap, 1);
  assert.equal(kq.theoMa['537220'].tong, 1);
  assert.deepEqual(kq.theoMa['535790'], { tong: 0, daNap: 0, sapNap: 0, daCo: 0, chuaOnDinh: 0, rong: 0, loi: 0, boQua: 0, laMa: false });
  assert.equal(kq.dem.maLa, 0);
  // lượt sau: cả ba DA_CO
  const kq2 = await chay(nguonGia({ [D1]: { [a1]: f(csv('533140', '2026-10-14')), [a2]: f(csv('535470', '2026-10-14')), [a3]: f(csv('537220', '2026-10-14')) } }));
  assert.deepEqual(kq2.files.map((x) => x.ketQua), ['DA_CO', 'DA_CO', 'DA_CO']);
  assert.deepEqual([kq2.theoMa['533140'].daCo, kq2.theoMa['535470'].daCo, kq2.theoMa['537220'].daCo], [1, 1, 1]);
});

test('thứ tự nạp: ngày/giờ trong tên tăng dần, CÙNG thời điểm thì theo mã tăng dần; lặp lại cho kết quả giống nhau; không phụ thuộc thứ tự liệt kê', async () => {
  const ds = [
    ten('537220', '2026-10-14', '162011'), ten('533140', '2026-10-14', '162011'), ten('535470', '2026-10-14', '162011'),
    ten('535470', '2026-10-13', '162011'), ten('533140', '2026-10-14', '093012')
  ];
  const mong = [ten('535470', '2026-10-13', '162011'), ten('533140', '2026-10-14', '093012'), ten('533140', '2026-10-14', '162011'), ten('535470', '2026-10-14', '162011'), ten('537220', '2026-10-14', '162011')];
  const thuTu = [];
  for (const sx of [ds, [...ds].reverse()]) {
    ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
    const files = { [D1]: Object.fromEntries(sx.map((n) => [n, f(csv(n.slice(8, 14), ngayTen(n)))])) };
    const src = nguonGia(files);
    await chay(src, { options: { toiDa: 10 } });
    thuTu.push(src.calls.get.map((g) => g.slice(g.lastIndexOf('/') + 1)));
    assert.deepEqual(rows('SELECT file_name FROM arrival_import_files ORDER BY id').map((x) => x.file_name), mong);
  }
  assert.deepEqual(thuTu[0], mong);
  assert.deepEqual(thuTu[1], mong);
});

test('--toi-da và «từ ngày» áp dụng chung cho mọi mã: N file cũ nhất (theo ngày/giờ rồi mã) bất kể mã', async () => {
  const x = [ten('537220', '2026-10-12', '093012'), ten('533140', '2026-10-13', '093012'), ten('535470', '2026-10-13', '093012'), ten('533140', '2026-10-14', '093012'), ten('537220', '2026-10-10', '093012')];
  const src = nguonGia({ [D1]: Object.fromEntries(x.map((n) => [n, f(csv(n.slice(8, 14), ngayTen(n)))])) });
  const kq = await chay(src, { options: { toiDa: 2, tuNgay: '2026-10-11' } });
  assert.deepEqual(src.calls.get.map((g) => g.slice(g.lastIndexOf('/') + 1)), [x[0], x[1]], 'hai file cũ nhất trong cửa sổ, kể cả khác mã');
  assert.equal(byName(kq)[x[2]].maLoi, 'VUOT_TOI_DA');
  assert.equal(byName(kq)[x[3]].maLoi, 'VUOT_TOI_DA');
  assert.equal(byName(kq)[x[4]], undefined, 'ngoài «từ ngày»: không ghi từng file');
  assert.deepEqual([kq.theoMa['537220'].tong, kq.theoMa['537220'].daNap, kq.theoMa['537220'].boQua], [2, 1, 1], 'file trước «từ ngày» tính vào bỏ qua theo mã');
  assert.deepEqual([kq.theoMa['533140'].daNap, kq.theoMa['533140'].boQua], [1, 1]);
  assert.deepEqual([kq.theoMa['535470'].daNap, kq.theoMa['535470'].boQua], [0, 1]);
});

test('mã LẠ (không thuộc 6 BCVH): BO_QUA + MA_LA, KHÔNG tải, KHÔNG nạp (SANLUONG-5e đổi hành vi của 5c-1); hiện trong thống kê theo mã', async () => {
  const la = ten('999999', '2026-10-14');
  const ok = ten('533140', '2026-10-14');
  const src = nguonGia({ [D1]: { [la]: f(csv('999999', '2026-10-14')), [ok]: f(csv('533140', '2026-10-14')) } });
  const kq = await chay(src);
  assert.equal(byName(kq)[la].ketQua, 'BO_QUA');
  assert.equal(byName(kq)[la].maLoi, 'MA_LA');
  assert.match(byName(kq)[la].chiTiet, /không thuộc 6 BCVH/);
  assert.equal(byName(kq)[ok].ketQua, 'DA_NAP');
  assert.deepEqual(src.calls.get, [`${D1}/${ok}`], 'không tải file mã lạ');
  assert.equal(rows('SELECT 1 FROM arrival_import_files WHERE file_name = ?', la).length, 0, 'không nạp, không có «BCVH ma» trong lịch sử nạp');
  assert.equal(rows('SELECT DISTINCT receiver_code FROM arrival_items').length, 1);
  assert.deepEqual([kq.theoMa['999999'].laMa, kq.theoMa['999999'].tong, kq.theoMa['999999'].boQua, kq.theoMa['999999'].daNap], [true, 1, 1, 0]);
  assert.equal(kq.dem.maLa, 1);
  assert.equal(rows('SELECT ma_loi, ket_qua FROM sftp_sync_files WHERE ten_file = ?', la)[0].ma_loi, 'MA_LA');
  assert.equal(S.maThoat(kq), 0, 'mã lạ không làm lượt thất bại');
  // chạy khô cũng chỉ báo BO_QUA/MA_LA (không WOULD_IMPORT)
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  const kq2 = await chay(nguonGia({ [D1]: { [la]: f(csv('999999', '2026-10-14')) } }), { options: { dryRun: true } });
  assert.equal(byName(kq2)[la].ketQua, 'BO_QUA');
  assert.equal(byName(kq2)[la].maLoi, 'MA_LA');
  assert.equal(kq2.dem.wouldImport, 0);
  // danh mục tiêm vào (maDaBiet) quyết định thế nào là «lạ»
  const kq3 = await chay(nguonGia({ [D1]: { [la]: f(csv('999999', '2026-10-14')) } }), { options: { dryRun: true, maDaBiet: ['999999'] } });
  assert.equal(byName(kq3)[la].ketQua, 'WOULD_IMPORT');
  assert.deepEqual(Object.keys(kq3.theoMa), ['999999']);
  // mã lạ đã lỡ nằm trong lịch sử nạp từ trước thì vẫn là MA_LA (kiểm mã đứng trước kiểm «đã có»)
  await importArrivalFile(ctx.db, (() => { const p = path.join(tmpRoot, la); fs.writeFileSync(p, csv('999999', '2026-10-14')); return p; })(), { source: 'SFTP' });
  const kq4 = await chay(nguonGia({ [D1]: { [la]: f(csv('999999', '2026-10-14')) } }));
  assert.equal(byName(kq4)[la].maLoi, 'MA_LA');
});

test('chế độ BANG (hẹn giờ): MỘT lần liệt kê, KHÔNG chờ; ổn định xét qua bảng sftp_source_files giữa các lượt; file đổi thì xét lại', async () => {
  const a = ten('533140', '2026-10-14');
  let buf = csv('533140', '2026-10-14');
  const files = { [D1]: { [a]: f(buf, 1000) } };
  const luot = async (t, extra = {}) => { const src = nguonGia(files); const kq = await chay(src, { now: () => new Date(t), options: { oDinh: 'BANG', onDinhGiay: 60, ...extra } }); kq.src = src; return kq; };
  const T0 = Date.parse('2026-10-14T05:00:00Z');

  let kq = await luot(T0); // lần đầu thấy
  assert.equal(byName(kq)[a].ketQua, 'CHUA_ON_DINH');
  assert.deepEqual(kq.ngu, [], 'không chờ trong lượt');
  assert.equal(kq.src.calls.list.length, 1, 'một lần liệt kê');
  assert.equal(kq.src.calls.get.length, 0);
  let r = rows('SELECT * FROM sftp_source_files')[0];
  assert.deepEqual([r.thu_muc, r.ten_file, r.kich_thuoc, r.mtime, r.so_lan_giu_nguyen, r.con_tren_nguon], [D1, a, buf.length, 1000, 0, 1]);
  assert.equal(r.lan_dau_thay, new Date(T0).toISOString());

  files[D1][a] = f(buf = csv('533140', '2026-10-14', 4), 2000); // đổi giữa hai lượt
  kq = await luot(T0 + 10 * 60000);
  assert.equal(byName(kq)[a].ketQua, 'CHUA_ON_DINH', 'đổi kích thước / mtime -> bắt đầu đếm lại');
  r = rows('SELECT * FROM sftp_source_files')[0];
  assert.deepEqual([r.kich_thuoc, r.so_lan_giu_nguyen, r.giu_nguyen_tu, r.lan_dau_thay], [buf.length, 0, new Date(T0 + 10 * 60000).toISOString(), new Date(T0).toISOString()]);

  kq = await luot(T0 + 10 * 60000 + 30000); // giữ nguyên nhưng mới 30 giây < 60 giây
  assert.equal(byName(kq)[a].ketQua, 'CHUA_ON_DINH', 'chưa đủ SFTP_STABLE_SECONDS');
  assert.equal(rows('SELECT so_lan_giu_nguyen FROM sftp_source_files')[0].so_lan_giu_nguyen, 1);

  kq = await luot(T0 + 20 * 60000); // giữ nguyên qua 2 lượt cách nhau ≥ 60 giây
  assert.equal(byName(kq)[a].ketQua, 'DA_NAP');
  assert.equal(dem('arrival_import_files'), 1);
  assert.equal(rows('SELECT so_lan_giu_nguyen FROM sftp_source_files')[0].so_lan_giu_nguyen, 2);
});

test('sftp_source_files giữ file đã biến mất khỏi nguồn (con_tren_nguon = 0, lan_cuoi_thay = lần cuối thấy); xuất hiện lại thì được cập nhật', async () => {
  const a = ten('533140', '2026-10-14', '093012');
  const b = ten('535470', '2026-10-14', '093012');
  const files = { [D1]: { [a]: f(csv('533140', '2026-10-14')), [b]: f(csv('535470', '2026-10-14')) } };
  const luot = (t) => chay(nguonGia(files), { now: () => new Date(t), options: { oDinh: 'BANG', dryRun: false, toiDa: 0 + 5 } });
  const T0 = Date.parse('2026-10-14T05:00:00Z');
  await luot(T0);
  const luuB = files[D1][b];
  delete files[D1][b];
  await luot(T0 + 600000);
  const rb = rows('SELECT * FROM sftp_source_files WHERE ten_file = ?', b)[0];
  assert.equal(rb.con_tren_nguon, 0);
  assert.equal(rb.lan_cuoi_thay, new Date(T0).toISOString(), 'lần cuối thấy giữ nguyên');
  assert.equal(rows('SELECT con_tren_nguon FROM sftp_source_files WHERE ten_file = ?', a)[0].con_tren_nguon, 1);
  files[D1][b] = luuB;
  await luot(T0 + 1200000);
  const rb2 = rows('SELECT * FROM sftp_source_files WHERE ten_file = ?', b)[0];
  assert.deepEqual([rb2.con_tren_nguon, rb2.lan_cuoi_thay], [1, new Date(T0 + 1200000).toISOString()]);
  assert.equal(dem('sftp_source_files'), 2);
  // chạy khô KHÔNG ghi sftp_source_files
  ctx.db.prepare('DELETE FROM sftp_source_files').run();
  await chay(nguonGia(files), { options: { oDinh: 'BANG', dryRun: true } });
  assert.equal(dem('sftp_source_files'), 0);
});

test('nhường vòng lặp giữa hai file (nhuong) và dừng trước file kế tiếp khi huy() = true', async () => {
  const t = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const mk = () => nguonGia({ [D1]: Object.fromEntries(t.map((x, i) => [x, f(csv('533140', ['2026-10-12', '2026-10-13', '2026-10-14'][i]))])) });
  let nhuong = 0;
  let kq = await chay(mk(), { options: { nhuong: async () => { nhuong++; } } });
  assert.equal(nhuong, 3, 'sau mỗi file');
  assert.equal(kq.dem.daNap, 3);
  // huỷ sau file đầu
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  let da = false;
  kq = await chay(mk(), { options: { nhuong: async () => { da = true; }, huy: () => da } });
  assert.equal(kq.dem.daNap, 1);
  assert.equal(kq.daHuy, true);
  assert.ok(rows('SELECT finished_at FROM sftp_sync_runs ORDER BY id DESC')[0].finished_at, 'lượt vẫn được đóng');
  assert.ok(tmpSach());
});

test('ghiLuotThatBai: ghi một lượt đã kết thúc, loi = 1, ghi chú đã che bí mật và số dài', () => {
  const id = S.ghiLuotThatBai(ctx.db, NOW, 'TIMER', `không nối được với ${'7'.repeat(20)} mat-khau-gia`, ['mat-khau-gia']);
  const r = rows('SELECT * FROM sftp_sync_runs WHERE id = ?', id)[0];
  assert.deepEqual([r.trigger, r.loi, r.dry_run], ['TIMER', 1, 0]);
  assert.ok(r.finished_at);
  assert.ok(!/\d{15,}/.test(r.ghi_chu_loi) && !r.ghi_chu_loi.includes('mat-khau-gia'));
});

test('ghi nhận hành vi importer (không sửa): mã đơn vị lấy từ TÊN FILE, KHÔNG so với cột BC_nhan_BG trong nội dung', async () => {
  const sai = ten('535470', '2026-10-14');
  await chay(nguonGia({ [D1]: { [sai]: f(csv('533140', '2026-10-14')) } })); // tên 535470, nội dung nhận 533140
  assert.equal(rows('SELECT unit_code FROM arrival_import_files WHERE file_name = ?', sai)[0].unit_code, '535470');
  assert.equal(rows('SELECT DISTINCT receiver_code FROM arrival_items')[0].receiver_code, '533140');
});

test('thư mục không theo mẫu CSV_Report_<mã> và ngày không có thật trong tên', async () => {
  const x = ten('535470', '2026-10-14');
  const src2 = nguonGia({ '/du-lieu': { [x]: f(csv('535470', '2026-10-14')) } });
  assert.equal(byName(await chay(src2, { dirs: ['/du-lieu'] }))[x].ketQua, 'DA_NAP');
  const lo = 'HangDen_533140_20261340_093012.csv';
  const kq3 = await chay(nguonGia({ [D1]: { [lo]: f(csv('533140', '2026-10-14')) } }), { options: { tuNgay: '2000-01-01' } });
  assert.equal(byName(kq3)[lo].maLoi, 'NGAY_KHONG_HOP_LE');
});

test('lỗi một thư mục (không có / mạng) không dừng thư mục khác; mã thoát theo loại lỗi', async () => {
  const a = ten('535470', '2026-10-14');
  const src = nguonGia({ [D2]: { [a]: f(csv('535470', '2026-10-14')) } }, { loiList: { [D1]: Object.assign(new Error('No such file /CSV_Report_533140'), { code: 2 }) } });
  const kq = await chay(src, { dirs: [D1, D2] });
  assert.equal(kq.loiThuMuc.length, 1);
  assert.equal(kq.loiThuMuc[0].thuMuc, D1);
  assert.equal(kq.loiThuMuc[0].ma, 6);
  assert.equal(byName(kq)[a].ketQua, 'DA_NAP');
  assert.equal(S.maThoat(kq), 6);
  const run = rows('SELECT * FROM sftp_sync_runs')[0];
  assert.ok(run.finished_at);
  assert.equal(run.loi, 1);
  // mạng
  const kq2 = await chay(nguonGia({}, { loiList: { [D1]: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) } }));
  assert.equal(S.maThoat(kq2), 3);
  assert.equal(kq2.ngu.length, 0, 'không có thư mục liệt kê được thì không chờ');
  assert.equal(S.maThoat({ biKhoa: true, dem: { loi: 0 }, loiThuMuc: [] }), 7);
  assert.equal(S.maThoat({ biKhoa: false, dem: { loi: 0 }, loiThuMuc: [] }), 0);
});

// ---------- chạy khô ----------
test('chạy khô: KHÔNG tải, KHÔNG nạp, KHÔNG ghi sftp_sync_* ; WOULD_IMPORT theo đúng thứ tự và --toi-da', async () => {
  const t = ['2026-10-12', '2026-10-13', '2026-10-14'].map((d) => ten('533140', d));
  const da = ten('533140', '2026-10-11');
  await importArrivalFile(ctx.db, (() => { const p = path.join(tmpRoot, da); fs.writeFileSync(p, csv('533140', '2026-10-11')); return p; })(), { source: 'SFTP' });
  const files = { [D1]: { [da]: f(csv('533140', '2026-10-11')), ...Object.fromEntries(t.map((x, i) => [x, f(csv('533140', ['2026-10-12', '2026-10-13', '2026-10-14'][i]))])) } };
  const src = nguonGia(files);
  const truoc = [dem('arrival_items'), dem('arrival_import_files'), dem('sftp_sync_runs'), dem('sftp_sync_files')];
  const kq = await chay(src, { options: { dryRun: true, toiDa: 2 } });
  assert.deepEqual(src.calls.get, [], 'không tải');
  assert.deepEqual([dem('arrival_items'), dem('arrival_import_files'), dem('sftp_sync_runs'), dem('sftp_sync_files')], truoc, 'không ghi gì');
  assert.equal(kq.dryRun, true);
  assert.equal(kq.runId, null);
  const r = byName(kq);
  assert.equal(r[da].ketQua, 'DA_CO');
  assert.deepEqual([r[t[0]].ketQua, r[t[1]].ketQua, r[t[2]].ketQua], ['WOULD_IMPORT', 'WOULD_IMPORT', 'BO_QUA']);
  assert.equal(kq.dem.wouldImport, 2);
  assert.equal(kq.dem.daNap, 0);
  assert.ok(tmpSach());
});

test('chạy khô trên DB mở CHỈ-ĐỌC vẫn chạy được (script dùng cách này) và DB không đổi', async () => {
  const a = ten('533140', '2026-10-14');
  const ro = new RealDatabase(ctx.testDbPath, { readonly: true });
  try {
    const kq = await chay(nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } }), { db: ro, options: { dryRun: true } });
    assert.equal(byName(kq)[a].ketQua, 'WOULD_IMPORT');
    // lượt thật trên DB chỉ-đọc phải thất bại rõ ràng chứ không âm thầm
    await assert.rejects(() => chay(nguonGia({}), { db: ro }));
  } finally { ro.close(); }
  assert.equal(dem('arrival_import_files'), 0);
});

// ---------- khoá chống chạy chồng ----------
test('khoá: có lượt chưa kết thúc bắt đầu < 30 phút trước -> không bắt đầu, không liệt kê SFTP; lượt treo > 30 phút -> đóng + cho chạy', async () => {
  const a = ten('533140', '2026-10-14');
  const phutTruoc = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
  const idTreo = Number(ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(phutTruoc(5)).lastInsertRowid);
  const src = nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } });
  let kq = await chay(src);
  assert.equal(kq.biKhoa, true);
  assert.equal(kq.luotDangChay, idTreo);
  assert.equal(src.calls.list.length, 0);
  assert.equal(S.maThoat(kq), 7);
  assert.equal(dem('sftp_sync_runs'), 1);
  assert.equal(dem('arrival_import_files'), 0);

  // đúng ngưỡng 30 phút: coi là treo
  ctx.db.prepare('DELETE FROM sftp_sync_runs').run();
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(phutTruoc(30));
  kq = await chay(nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } }));
  assert.equal(kq.biKhoa, false);
  const ds = rows('SELECT * FROM sftp_sync_runs ORDER BY id');
  assert.equal(ds.length, 2);
  assert.ok(ds[0].finished_at, 'lượt treo được đóng');
  assert.match(ds[0].ghi_chu_loi, /treo/);
  assert.ok(ds[1].finished_at, 'lượt mới luôn có finished_at');
  assert.equal(ds[1].da_nap, 1);
  assert.equal(ds[1].dry_run, 0);

  // lượt đã kết thúc thì không chặn
  kq = await chay(nguonGia({ [D1]: {} }));
  assert.equal(kq.biKhoa, false);
  // chạy khô không bị chặn và chỉ báo
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(phutTruoc(1));
  kq = await chay(nguonGia({ [D1]: {} }), { options: { dryRun: true } });
  assert.equal(kq.biKhoa, false);
  assert.ok(kq.luotDangChay);
});

test('lượt luôn có finished_at kể cả khi lỗi bất ngờ giữa chừng', async () => {
  const a = ten('533140', '2026-10-14');
  const src = nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } });
  const orig = src.list;
  let lan = 0;
  src.list = async (d) => { if (++lan === 2) throw new Error('đứt giả'); return orig(d); };
  const kq = await chay(src);
  assert.ok(rows('SELECT finished_at FROM sftp_sync_runs')[0].finished_at);
  assert.equal(kq.dem.loi, 1);
});

// ---------- an toàn ----------
test('tên tệp tạm nguy hiểm bị từ chối trước khi ghép đường dẫn', () => {
  for (const bad of ['../HangDen_533140_20261014_093012.csv', 'a/HangDen_533140_20261014_093012.csv', 'a\\HangDen_533140_20261014_093012.csv', '..', '.', '',
    'HangDen_533140_20261014_093012.csv\u0000.txt', 'HangDen_533140_20261014_093012.csv/..', '/etc/passwd', 'C:\\x.csv', 'DuBao_533140_20261014.csv', `HangDen_${'1'.repeat(200)}_20261014_093012.csv`]) {
    assert.throws(() => S.kiemTraTenTep(bad), (e) => e.code === 'TEN_TEP_KHONG_AN_TOAN', JSON.stringify(bad));
  }
  assert.equal(S.kiemTraTenTep('HangDen_533140_20261014_093012.csv'), 'HangDen_533140_20261014_093012.csv');
});

test('tên nguy hiểm trong danh sách SFTP không bao giờ được tải (tên có "/" hoặc ".." không khớp mẫu)', async () => {
  const src = nguonGia({ [D1]: { '../HangDen_533140_20261014_093012.csv': f(csv('533140', '2026-10-14')), 'x/HangDen_533140_20261014_093012.csv': f(csv('533140', '2026-10-14')) } });
  const kq = await chay(src);
  assert.deepEqual(src.calls.get, []);
  assert.equal(kq.files.length, 0);
  assert.equal(kq.dem.boQuaKhac, 2);
});

test('tệp tạm và thư mục tạm bị xoá kể cả khi importer ném lỗi; tmp nằm dưới tmpDir được tiêm', async () => {
  const a = ten('533140', '2026-10-14');
  let thayTrong = null;
  const importFn = async (db, p) => { thayTrong = p; assert.ok(fs.existsSync(p), 'tệp tạm có mặt khi nạp'); assert.ok(p.startsWith(tmpRoot)); throw new Error('nổ giả'); };
  const kq = await chay(nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } }), { options: { importFn } });
  assert.equal(byName(kq)[a].ketQua, 'LOI');
  assert.ok(thayTrong && !fs.existsSync(thayTrong));
  assert.equal(path.basename(thayTrong), a, 'giữ NGUYÊN tên gốc (chống trùng theo tên)');
  assert.ok(tmpSach());
});

test('không có dãy ≥ 15 chữ số và không lộ bí mật trong log / ghi chú / bảng, kể cả khi lỗi mang số dài hoặc mật khẩu', async () => {
  const a = ten('533140', '2026-10-14');
  const logs = [];
  const soDai = '1234567'.repeat(3); // 21 chữ số, dựng lúc chạy để mã nguồn test không chứa dãy dài
  const importFn = async () => { throw new Error(`lỗi với ${soDai} và mat-khau-gia và nguoi-dung-gia`); };
  const kq = await chay(nguonGia({ [D1]: { [a]: f(csv('533140', '2026-10-14')) } }), { options: { importFn, bimat: ['mat-khau-gia', 'nguoi-dung-gia'], log: (m) => logs.push(m) } });
  const tatCa = JSON.stringify([kq, logs, rows('SELECT * FROM sftp_sync_files'), rows('SELECT * FROM sftp_sync_runs')]);
  assert.ok(!/\d{15,}/.test(tatCa));
  assert.ok(!tatCa.includes('mat-khau-gia') && !tatCa.includes('nguoi-dung-gia'));
  assert.match(byName(kq)[a].chiTiet, /\*\*\*/);
  assert.ok(logs.length >= 1);
  assert.equal(S.lamSach(`x ${'9'.repeat(20)} y`), 'x [số dài] y');
  assert.equal(S.lamSach(`x ${'9'.repeat(14)} y`), `x ${'9'.repeat(14)} y`, 'dưới 15 chữ số giữ nguyên');
});

// ---------- tham số / cấu hình ----------
test('tham số dòng lệnh và cấu hình đồng bộ', () => {
  assert.deepEqual(S.docThamSoSync([]), { chayThat: false, tuNgay: null, toiDa: 5, onDinhGiay: null, troGiup: false });
  const a = S.docThamSoSync(['--chay-that', '--tu-ngay=20261012', '--toi-da=1', '--on-dinh=0']);
  assert.deepEqual([a.chayThat, a.tuNgay, a.toiDa, a.onDinhGiay], [true, '2026-10-12', 1, 0]);
  for (const bad of [['--tu-ngay=2026-10-12'], ['--tu-ngay=20261340'], ['--toi-da=0'], ['--toi-da=x'], ['--on-dinh=601'], ['--xoa'], ['--put']]) {
    assert.throws(() => S.docThamSoSync(bad), F.CauHinhLoi, bad.join(' '));
  }
  assert.deepEqual(S.docCauHinhSync({}, {}), { soNgay: 3, onDinhGiay: 60, tuNgay: null, toiDa: 5 });
  assert.deepEqual(S.docCauHinhSync({ SFTP_SYNC_DAYS: '7', SFTP_STABLE_SECONDS: '90' }, { toiDa: 2 }), { soNgay: 7, onDinhGiay: 90, tuNgay: null, toiDa: 2 });
  assert.equal(S.docCauHinhSync({ SFTP_STABLE_SECONDS: '90' }, { onDinhGiay: 5 }).onDinhGiay, 5, 'tham số dòng lệnh thắng env');
  assert.equal(S.docCauHinhSync({ SFTP_SYNC_DAYS: '0' }, {}).soNgay, 0);
  for (const env of [{ SFTP_SYNC_DAYS: 'abc' }, { SFTP_SYNC_DAYS: '-1' }, { SFTP_STABLE_SECONDS: '9999' }]) {
    assert.throws(() => S.docCauHinhSync(env, {}), (e) => e instanceof F.CauHinhLoi && e.thieu.length === 1 && !/abc|9999/.test(e.message), JSON.stringify(env));
  }
});

// ---------- kiểm tĩnh ----------
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CAM = ['put', 'fastPut', 'delete', 'rename', 'posixRename', 'mkdir', 'rmdir', 'chmod', 'append', 'uploadDir', 'downloadDir', 'createWriteStream', 'rcopy', 'stat', 'exists', 'cwd'];

test('kiểm tĩnh sftpSync.js: không nạp thư viện SFTP; chỉ gọi client.list / client.get; không lệnh ghi SFTP; không require DB', () => {
  const code = boChuThich(doc('server', 'lib', 'sftpSync.js'));
  assert.ok(!/require\(['"]ssh2/.test(code) && !code.includes('ssh2-sftp-client'));
  const used = new Set([...code.matchAll(/\bclient\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['get', 'list']);
  for (const c of CAM) assert.ok(!new RegExp(`\\bclient\\.${c}\\s*\\(`).test(code), `client.${c}(`);
  assert.ok(!/require\(['"]\.\.?\/db/.test(code) && !/setInterval|node-cron/.test(code), 'không mở DB / không hẹn giờ');
});

test('kiểm tĩnh scripts/sftp-sync.js: SFTP chỉ connect / list / get / end; không lệnh ghi; không in user / password; không require server/db; không hẹn giờ', () => {
  const code = boChuThich(doc('scripts', 'sftp-sync.js'));
  const used = new Set([...code.matchAll(/\bsftp\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['connect', 'end', 'get', 'list']);
  for (const c of CAM) assert.ok(!new RegExp(`\\.${c}\\s*\\(`).test(code), `.${c}(`);
  assert.ok(!/require\(['"]\.\.\/server\/db/.test(code) && !/setInterval|node-cron/.test(code));
  const dongIn = code.split('\n').filter((l) => /\b(log|loi|console\.\w+)\s*\(/.test(l));
  assert.ok(dongIn.length > 5);
  for (const l of dongIn) assert.ok(!/cfg\.(user|password)\b|SFTP_(USER|PASSWORD)\b|process\.env/.test(l), l.trim());
});
