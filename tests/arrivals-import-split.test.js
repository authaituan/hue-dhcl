// ==========================================
// Test SANLUONG-5g-1: tách importer thành chuanBiFile (bất đồng bộ, không đụng DB) và ghiFileDaChuanBi (đồng bộ, gọi được trong giao dịch ngoài).
//  - TƯƠNG ĐƯƠNG: importArrivalFile (importer hiện hành) == chuanBiFile + ghiFileDaChuanBi gọi rời trên DB thứ hai (REF; SANLUONG-5g-5 thay bản chụp trước 5g-1)
//    về giá trị trả về (kể cả thứ tự khoá) VÀ nội dung 3 bảng (arrival_import_files, arrival_items, ward_bdx_map), trên cùng bộ file giả.
//  - chuanBiFile không đụng DB; ghiFileDaChuanBi đồng bộ; lồng giao dịch (savepoint); tuỳ chọn ghiTuChoi.
// Server thật + DB tạm của harness (phía importArrivalFile), DB bộ nhớ riêng (phía REF). CSV / SHBG GIẢ (9 chữ số, không có dãy ≥ 15 chữ số).
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const RealDatabase = require('better-sqlite3'); // nạp TRƯỚC khi harness thay thế (DB bộ nhớ của REF)
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const NEW = require('../server/lib/arrivalsImport');
// Phía tham chiếu: ghép tay hai nửa (chuanBiFile rồi ghiFileDaChuanBi) trên DB riêng; importArrivalFile phải cho cùng kết quả và cùng nội dung bảng.
const REF = {
  ensureArrivalSchema: NEW.ensureArrivalSchema,
  async importArrivalFile(db, filePath, { source = 'MANUAL' } = {}) {
    const daChuanBi = await NEW.chuanBiFile(filePath, { source });
    return NEW.ghiFileDaChuanBi(db, daChuanBi, { source });
  },
  async importArrivalDirectory(db, thuMuc, opts = {}) {
    const ket = [];
    const hop = [];
    for (const n of fs.readdirSync(thuMuc).filter((t) => fs.statSync(path.join(thuMuc, t)).isFile())) {
      const m = /^HangDen_(\d+)_(\d{8})_(\d{6})\.csv$/i.exec(n);
      if (m) hop.push({ n, key: `${m[2]} ${m[3]} ${m[1]}` });
      else if (/\.csv$/i.test(n)) ket.push({ fileName: n, status: 'SKIPPED_NAME', error: 'Tên file không đúng mẫu' });
    }
    hop.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const v of hop) ket.push(await REF.importArrivalFile(db, path.join(thuMuc, v.n), opts));
    return ket;
  }
};

const PORT = 5929;
let ctx;
let dbRef;
let dir;
let seq = 0;

const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZZ${String(900000000 + (++seq))}VN`;
const H = NEW.EXPECTED_HEADER;

/** Một dòng CSV giả (đối tượng theo tên cột). o: bag / itm / xnd / ttkt (chuỗi thời gian nguyên văn), ward, tinh... */
function row(o = {}) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: o.rc || '533140', Ten_duong_thu: 'Đường A', SHBG: o.sh || sh(), So_hieu_BD10: o.bd10 || '',
    'Thời gian XN túi': o.bag ?? 'NULL', 'Thời gian XN BG': o.itm ?? 'NULL', Ngay_gio_XND_BD10: o.xnd ?? 'NULL', Ngay_gio_XND_BD10_tai_TTKT: o.ttkt ?? 'NULL',
    So_hieu_BD8: o.bd8 ?? `P${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: o.ward ?? 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
const csv = (rows, header = H) => Buffer.from('﻿' + [header.map(qt).join(','), ...rows.map((r) => header.map((h) => qt(r[h] ?? '')).join(','))].join('\r\n') + '\r\n');
const ghi = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };

const bd10Gia = (n) => `530100${'533140'}${String(n).padStart(7, '0')}`; // BD10 giả dựng lúc chạy (mã nguồn không chứa dãy số dài)
const NAME = 'HangDen_533140_20261014_093012.csv';
const hopLe = () => csv([
  row({ bag: '2026-10-14 08:00:00.123', itm: '2026-10-14T08:05:00' }), // ISO có mili giây + dạng T
  row({ bag: '10/14/2026 10:00:00 AM', xnd: '10/14/2026 9:30:00 AM', bd10: bd10Gia(1) }), // kiểu Mỹ
  row({ bag: 'NULL', itm: '2026-10-14 12:00:00', ward: 'NULL' }), // NULL = rỗng, thiếu phường
  row({ bag: '2026-10-13 23:50:00', ward: 'Phường Bình' }),
  row({ ttkt: '2026-10-14 06:00:00', bd10: bd10Gia(2) }) // không mốc BCVH nào
]);

// ---------- dựng DB ----------
function taoDbBoNho(mod) {
  const db = new RealDatabase(':memory:');
  db.exec('CREATE TABLE commune_post_offices (id TEXT PRIMARY KEY, name TEXT)'); // refreshWardMap đọc bảng này (rỗng)
  mod.ensureArrivalSchema(db);
  return db;
}
const xoaSach = (db) => {
  for (const t of ['arrival_items', 'arrival_import_files', 'ward_bdx_map']) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'arrival_import_files'").run();
};
const dump = (db) => ({
  files: db.prepare('SELECT id, unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, ignored_duplicate_count, status, error, warning, source FROM arrival_import_files ORDER BY id').all(),
  items: db.prepare('SELECT * FROM arrival_items ORDER BY id').all(),
  wards: db.prepare('SELECT ward_key, ward_name, commune_id, source FROM ward_bdx_map ORDER BY ward_key').all()
});
const dem = (db, t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-import-split-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-import-split-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  dbRef = taoDbBoNho(REF);
});
after(async () => {
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  dbRef.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => { xoaSach(ctx.db); xoaSach(dbRef); });

/** Chạy cùng một chuỗi bước trên bản CŨ (dbRef) và bản MỚI (ctx.db); so từng giá trị trả về (kể cả thứ tự khoá) và nội dung 3 bảng. steps: [() => đường dẫn file]. */
async function soSanh(steps, nhan) {
  const ketQua = [];
  for (const [i, buoc] of steps.entries()) {
    const p = buoc();
    let rRef; let rNew; let eRef = null; let eNew = null;
    try { rRef = await REF.importArrivalFile(dbRef, p); } catch (e) { eRef = e; }
    try { rNew = await NEW.importArrivalFile(ctx.db, p); } catch (e) { eNew = e; }
    if (eRef || eNew) {
      assert.ok(eRef && eNew, `${nhan} bước ${i}: cả hai phải cùng ném lỗi`);
      assert.deepEqual([eNew.code, eNew.name], [eRef.code, eRef.name]);
      ketQua.push({ nem: eNew.code });
      continue;
    }
    assert.deepEqual(rNew, rRef, `${nhan} bước ${i}: giá trị trả về`);
    assert.deepEqual(Object.keys(rNew), Object.keys(rRef), `${nhan} bước ${i}: thứ tự khoá`);
    assert.deepEqual(dump(ctx.db), dump(dbRef), `${nhan} bước ${i}: nội dung bảng`);
    ketQua.push(rNew);
  }
  return ketQua;
}

// ---------- 1. tương đương ----------
test('tương đương: file hợp lệ nhiều dòng (ISO / ISO T / kiểu Mỹ / NULL / thiếu phường / không mốc BCVH)', async () => {
  const [r] = await soSanh([() => ghi(NAME, hopLe())], 'hợp lệ');
  assert.equal(r.status, 'OK');
  assert.equal(r.rowCount, 5);
  assert.equal(r.inserted, 5);
  assert.ok(r.stats && r.stats.distinctTracking === 5);
  assert.ok(dem(ctx.db, 'ward_bdx_map') > 0);
});

test('tương đương: file rỗng — 0 byte, chỉ BOM, chỉ có tiêu đề', async () => {
  const rs = await soSanh([
    () => ghi('HangDen_533140_20261013_093012.csv', Buffer.alloc(0)),
    () => ghi('HangDen_533140_20261013_150011.csv', Buffer.from([0xef, 0xbb, 0xbf])),
    () => ghi('HangDen_533140_20261014_150011.csv', csv([]))
  ], 'rỗng');
  assert.deepEqual(rs.map((x) => [x.status, x.rowCount]), [['EMPTY', 0], ['EMPTY', 0], ['EMPTY', 0]]);
  assert.equal(dem(ctx.db, 'arrival_items'), 0);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 3);
  assert.ok(rs[2].stats, 'file chỉ tiêu đề có stats, file 0 byte / BOM thì không');
  assert.ok(!('stats' in rs[0]));
});

test('tương đương: dòng trùng trong file (INSERT OR IGNORE) và nạp lại cùng file (idempotent)', async () => {
  const r1 = row({ bag: '2026-10-14 08:00:00' });
  const buf = csv([r1, r1, row({ bag: '2026-10-14 09:00:00' })]);
  const rs = await soSanh([() => ghi(NAME, buf), () => ghi(NAME, buf), () => ghi(NAME, buf)], 'trùng');
  assert.deepEqual([rs[0].rowCount, rs[0].inserted, rs[0].ignored], [3, 2, 1]);
  assert.equal(rs[1].alreadyImported, true);
  assert.equal(rs[2].alreadyImported, true);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 1);
});

test('tương đương: cùng tên khác nội dung -> CONFLICT (không nạp), ghi bản ghi CONFLICT', async () => {
  const rs = await soSanh([() => ghi(NAME, hopLe()), () => ghi(NAME, hopLe())], 'conflict'); // lần 2: SHBG khác -> nội dung khác
  assert.equal(rs[1].status, 'CONFLICT');
  assert.match(rs[1].error, /Trùng tên với file đã nạp/);
  assert.equal(dem(ctx.db, 'arrival_items'), 5);
  assert.deepEqual(ctx.db.prepare('SELECT status FROM arrival_import_files ORDER BY id').all().map((x) => x.status), ['OK', 'CONFLICT']);
});

test('tương đương: file bị từ chối (REJECTED) — thiếu cột, ngày giờ sai, ngoài khoảng ngày, CSV hỏng; có cảnh báo ≤ 1 % thì vẫn nạp', async () => {
  const thieuCot = H.filter((h) => h !== 'SHBG');
  const rs = await soSanh([
    () => ghi('HangDen_533140_20261011_093012.csv', csv([row({ bag: '2026-10-11 08:00:00' })], thieuCot)),
    () => ghi('HangDen_533140_20261012_093012.csv', csv([row({ bag: '2026-10-12 25:99:00' })])),
    () => ghi('HangDen_533140_20261013_093012.csv', csv([row({ bag: '2026-01-01 08:00:00' }), row({ bag: '2026-10-13 08:00:00' })])),
    () => ghi('HangDen_533140_20261014_093012.csv', Buffer.from('﻿"A","B"\r\n"1","2","3"\r\n')),
    () => ghi('HangDen_533140_20261015_093012.csv', csv([...Array.from({ length: 199 }, () => row({ bag: '2026-10-15 08:00:00' })), row({ bag: '2026-01-01 08:00:00' })]))
  ], 'từ chối');
  assert.deepEqual(rs.map((x) => x.status), ['REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'OK']);
  assert.match(rs[0].error, /thiếu cột/);
  assert.match(rs[1].error, /ngày giờ/);
  assert.match(rs[2].error, /ngoài khoảng/);
  assert.match(rs[3].error, /Lỗi đọc CSV|Sai tiêu đề/);
  assert.match(rs[4].warning, /ngoài khoảng/);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM arrival_import_files WHERE status = 'REJECTED'").get().n, 4, 'mặc định VẪN ghi REJECTED (hành vi cũ)');
});

test('tương đương: tên file / mã sai (SKIPPED_NAME, không ghi DB) và file không tồn tại (cùng ném lỗi)', async () => {
  const rs = await soSanh([
    () => ghi('khong-dung-mau.csv', hopLe()),
    () => ghi('HangDen_533140_2026101_093012.csv', hopLe()),
    () => ghi('HangDen__20261014_093012.csv', hopLe()),
    () => ghi('HangDen_533140_20261014_093012.csv.part', hopLe()),
    () => path.join(dir, 'HangDen_533140_20261020_093012.csv') // không tồn tại
  ], 'tên sai');
  assert.deepEqual(rs.slice(0, 4).map((x) => x.status), ['SKIPPED_NAME', 'SKIPPED_NAME', 'SKIPPED_NAME', 'SKIPPED_NAME']);
  assert.deepEqual(Object.keys(rs[0]), ['fileName', 'status', 'error']);
  assert.equal(rs[4].nem, 'ENOENT');
  assert.equal(dem(ctx.db, 'arrival_import_files'), 0);
});

test('tương đương: source (SFTP) và importArrivalDirectory theo thứ tự (ngày, giờ)', async () => {
  const d = fs.mkdtempSync(path.join(dir, 'thu-muc-'));
  fs.writeFileSync(path.join(d, 'HangDen_533140_20261014_150011.csv'), csv([row({ bag: '2026-10-14 15:00:00' })]));
  fs.writeFileSync(path.join(d, 'HangDen_533140_20261013_093012.csv'), csv([row({ bag: '2026-10-13 08:00:00' })]));
  fs.writeFileSync(path.join(d, 'ghi-chu.csv'), csv([]));
  const rRef = await REF.importArrivalDirectory(dbRef, d, { source: 'SFTP' });
  const rNew = await NEW.importArrivalDirectory(ctx.db, d, { source: 'SFTP' });
  assert.deepEqual(rNew, rRef);
  assert.deepEqual(dump(ctx.db), dump(dbRef));
  assert.deepEqual(ctx.db.prepare('SELECT source FROM arrival_import_files').all().map((x) => x.source), ['SFTP', 'SFTP']);
});

// ---------- 2. chuanBiFile không đụng DB ----------
test('chuanBiFile: không nhận db, không truy cập DB; không tạo bảng, không ghi gì, kể cả với file hợp lệ / rỗng / bị từ chối', async () => {
  const src = NEW.chuanBiFile.toString();
  assert.ok(!/\bdb\b/.test(src), 'thân chuanBiFile không nhắc db');
  assert.equal(NEW.chuanBiFile.length, 1, 'chỉ nhận filePath (+ options mặc định)');
  const snap = () => JSON.stringify([ctx.db.prepare("SELECT name FROM sqlite_master ORDER BY name").all(), dem(ctx.db, 'arrival_items'), dem(ctx.db, 'arrival_import_files'), dem(ctx.db, 'ward_bdx_map')]);
  const truoc = snap();
  const files = [
    ghi(NAME, hopLe()), ghi('HangDen_533140_20261013_150011.csv', Buffer.from([0xef, 0xbb, 0xbf])), ghi('HangDen_533140_20261012_150011.csv', Buffer.alloc(0)),
    ghi('HangDen_533140_20261011_093012.csv', csv([row({ bag: '2026-10-11 25:99:00' })])), ghi('xau.csv', csv([]))
  ];
  const ds = [];
  for (const p of files) ds.push(await NEW.chuanBiFile(p));
  assert.equal(snap(), truoc, 'DB nguyên vẹn');
  assert.deepEqual(ds.map((x) => [x.ketLuan, x.trangThaiDuKien]), [['READY', 'OK'], ['EMPTY_FILE', 'EMPTY'], ['EMPTY_FILE', 'EMPTY'], ['REJECTED', 'REJECTED'], ['SKIPPED_NAME', 'SKIPPED_NAME']]);
  // có thể gọi khi mọi kết nối DB đều đóng
  const db0 = new RealDatabase(':memory:');
  db0.close();
  assert.equal((await NEW.chuanBiFile(files[0])).ketLuan, 'READY');
});

test('chuanBiFile: đối tượng «đã chuẩn bị» đủ thông tin để ghi; sha256 / kích thước khớp file; không giữ dữ liệu thô', async () => {
  const buf = hopLe();
  const p = ghi('HangDen_533140_20261014_093012.csv', buf);
  const d = await NEW.chuanBiFile(p, { source: 'SFTP' });
  assert.deepEqual(d.meta, {
    unit_code: '533140', file_name: 'HangDen_533140_20261014_093012.csv', file_date: '2026-10-14', file_time: '09:30:12',
    file_size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), source: 'SFTP'
  });
  assert.deepEqual([d.rowCount, d.items.length, d.warning, d.error, d.parsed.unitCode], [5, 5, null, null, '533140']);
  assert.ok(d.items.every((i) => !('import_file_id' in i) && typeof i.tracking_no === 'string'), 'dòng đã chuẩn hoá, chưa có import_file_id');
  assert.ok(d.stats.arrivalMin && d.stats.distinctTracking === 5);
  assert.ok(Object.values(d).every((v) => !Buffer.isBuffer(v)), 'không giữ Buffer file thô');
  assert.ok(!JSON.stringify(d).includes('records'));
  // file bị từ chối: có lý do, không có dòng
  const bad = await NEW.chuanBiFile(ghi('HangDen_533140_20261010_093012.csv', csv([row({ bag: 'không phải ngày' })])));
  assert.equal(bad.ketLuan, 'REJECTED');
  assert.match(bad.error, /Dòng 2: cột "Thời gian XN túi" sai định dạng/);
  assert.deepEqual([bad.items.length, bad.rowCount], [0, 0]);
  // tên sai: không đọc file (đường dẫn không tồn tại vẫn không ném)
  const skip = await NEW.chuanBiFile(path.join(dir, 'khong-co.csv'));
  assert.equal(skip.ketLuan, 'SKIPPED_NAME');
  // file không tồn tại nhưng tên đúng: ném lỗi đọc như cũ
  await assert.rejects(() => NEW.chuanBiFile(path.join(dir, 'HangDen_533140_20261020_093012.csv')), (e) => e.code === 'ENOENT');
});

// ---------- 3. ghiFileDaChuanBi đồng bộ ----------
test('ghiFileDaChuanBi: ĐỒNG BỘ — giá trị trả về không phải Promise; hàm không async; mã nguồn không async / await / .then(', async () => {
  const d = await NEW.chuanBiFile(ghi(NAME, hopLe()));
  const r = NEW.ghiFileDaChuanBi(ctx.db, d);
  assert.ok(!(r instanceof Promise));
  assert.equal(typeof r.then, 'undefined');
  assert.equal(NEW.ghiFileDaChuanBi.constructor.name, 'Function');
  assert.equal(r.status, 'OK');
  const src = NEW.ghiFileDaChuanBi.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\basync\b|\bawait\b|\.then\(/.test(src));
  // importArrivalFile vẫn trả Promise
  const pr = NEW.importArrivalFile(ctx.db, path.join(dir, NAME));
  assert.ok(pr instanceof Promise);
  assert.equal((await pr).alreadyImported, true, 'cùng file đã nạp ở bước trên');
});

// ---------- 4. lồng giao dịch ----------
test('lồng giao dịch: ghi trong db.transaction rồi ném lỗi -> hoàn tác hết (cả bản ghi file lẫn dòng); thành công -> đủ dòng; không tự commit', async () => {
  const d = await NEW.chuanBiFile(ghi(NAME, hopLe()));
  const ngoai = ctx.db.transaction((nem) => {
    const r = NEW.ghiFileDaChuanBi(ctx.db, d);
    assert.equal(ctx.db.inTransaction, true, 'vẫn trong giao dịch ngoài sau khi ghi (không tự commit)');
    assert.equal(r.status, 'OK');
    assert.equal(dem(ctx.db, 'arrival_items'), 5, 'thấy dòng ngay trong giao dịch');
    if (nem) throw new Error('hoàn tác giả');
    return r;
  });
  assert.throws(() => ngoai(true), /hoàn tác giả/);
  assert.equal(dem(ctx.db, 'arrival_items'), 0);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 0);
  assert.equal(dem(ctx.db, 'ward_bdx_map'), 0, 'cả ward_bdx_map được hoàn tác');
  const r = ngoai(false);
  assert.equal(r.inserted, 5);
  assert.equal(ctx.db.inTransaction, false);
  assert.equal(dem(ctx.db, 'arrival_items'), 5);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 1);
});

test('lồng giao dịch: hai file liên tiếp trong cùng MỘT giao dịch ngoài (cùng hoàn tác / cùng commit); cũng đúng với giao dịch mở bằng BEGIN tay', async () => {
  const a = await NEW.chuanBiFile(ghi('HangDen_533140_20261013_093012.csv', csv([row({ bag: '2026-10-13 08:00:00' }), row({ bag: '2026-10-13 09:00:00' })])));
  const b = await NEW.chuanBiFile(ghi('HangDen_533140_20261014_093012.csv', hopLe()));
  const hai = ctx.db.transaction((nem) => { const x = NEW.ghiFileDaChuanBi(ctx.db, a); const y = NEW.ghiFileDaChuanBi(ctx.db, b); if (nem) throw new Error('x'); return [x, y]; });
  assert.throws(() => hai(true));
  assert.deepEqual([dem(ctx.db, 'arrival_items'), dem(ctx.db, 'arrival_import_files')], [0, 0]);
  const [x, y] = hai(false);
  assert.deepEqual([x.inserted, y.inserted, dem(ctx.db, 'arrival_items'), dem(ctx.db, 'arrival_import_files')], [2, 5, 7, 2]);

  xoaSach(ctx.db);
  ctx.db.exec('BEGIN');
  try {
    NEW.ghiFileDaChuanBi(ctx.db, a);
    assert.equal(ctx.db.inTransaction, true);
    NEW.ghiFileDaChuanBi(ctx.db, b);
    assert.equal(dem(ctx.db, 'arrival_items'), 7);
  } finally { ctx.db.exec('ROLLBACK'); }
  assert.deepEqual([dem(ctx.db, 'arrival_items'), dem(ctx.db, 'arrival_import_files')], [0, 0], 'ROLLBACK tay hoàn tác cả hai');
});

test('lồng giao dịch: lỗi bất ngờ giữa chừng khi ghi một file -> file đó REJECTED, phần ghi dở bị hoàn tác (savepoint), giao dịch ngoài vẫn dùng được cho file khác', async () => {
  const hong = await NEW.chuanBiFile(ghi('HangDen_533140_20261013_093012.csv', csv([row({ bag: '2026-10-13 08:00:00' }), row({ bag: '2026-10-13 09:00:00' })])));
  delete hong.items[1].ward_key; // dòng 1 ghi xong, dòng 2 ném lỗi thiếu tham số
  const tot = await NEW.chuanBiFile(ghi('HangDen_533140_20261014_093012.csv', hopLe()));
  const kq = ctx.db.transaction(() => {
    const x = NEW.ghiFileDaChuanBi(ctx.db, hong, { ghiTuChoi: false });
    assert.equal(x.status, 'REJECTED');
    assert.match(x.error, /^Lỗi hệ thống/);
    assert.equal(dem(ctx.db, 'arrival_items'), 0, 'dòng đầu của file hỏng đã bị hoàn tác');
    assert.equal(dem(ctx.db, 'arrival_import_files'), 0, 'không ghi gì cho file hỏng (ghiTuChoi = false)');
    assert.equal(ctx.db.inTransaction, true);
    return NEW.ghiFileDaChuanBi(ctx.db, tot);
  })();
  assert.equal(kq.status, 'OK');
  assert.deepEqual([dem(ctx.db, 'arrival_items'), dem(ctx.db, 'arrival_import_files')], [5, 1]);
});

// ---------- 5. ghiTuChoi ----------
test('options.ghiTuChoi: mặc định ghi REJECTED / CONFLICT như cũ; ghiTuChoi = false thì KHÔNG có dòng mới ở arrival_import_files nhưng vẫn trả status + error', async () => {
  const xau = await NEW.chuanBiFile(ghi('HangDen_533140_20261012_093012.csv', csv([row({ bag: 'sai' })])));
  assert.equal(xau.ketLuan, 'REJECTED');
  let r = NEW.ghiFileDaChuanBi(ctx.db, xau, { ghiTuChoi: false });
  assert.equal(r.status, 'REJECTED');
  assert.match(r.error, /sai định dạng ngày giờ/);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 0, 'tắt: không ghi');
  r = NEW.ghiFileDaChuanBi(ctx.db, xau); // mặc định
  assert.equal(r.status, 'REJECTED');
  assert.deepEqual(ctx.db.prepare('SELECT status, error FROM arrival_import_files').all().map((x) => x.status), ['REJECTED'], 'mặc định: ghi');

  // CONFLICT
  xoaSach(ctx.db);
  const p = ghi(NAME, hopLe());
  NEW.ghiFileDaChuanBi(ctx.db, await NEW.chuanBiFile(p));
  const khac = await NEW.chuanBiFile(ghi(NAME, hopLe())); // cùng tên, nội dung khác
  r = NEW.ghiFileDaChuanBi(ctx.db, khac, { ghiTuChoi: false });
  assert.equal(r.status, 'CONFLICT');
  assert.equal(dem(ctx.db, 'arrival_import_files'), 1, 'tắt: không ghi CONFLICT');
  r = NEW.ghiFileDaChuanBi(ctx.db, khac);
  assert.equal(dem(ctx.db, 'arrival_import_files'), 2, 'mặc định: ghi CONFLICT');

  // trong giao dịch ngoài, tắt ghi từ chối rồi commit: bảng không đổi
  xoaSach(ctx.db);
  const n = ctx.db.transaction(() => NEW.ghiFileDaChuanBi(ctx.db, xau, { ghiTuChoi: false }).status)();
  assert.equal(n, 'REJECTED');
  assert.equal(dem(ctx.db, 'arrival_import_files'), 0);
});

test('options.source ghi đè nguồn; mặc định lấy từ chuanBiFile', async () => {
  const p = ghi(NAME, hopLe());
  const d = await NEW.chuanBiFile(p, { source: 'SFTP' });
  NEW.ghiFileDaChuanBi(ctx.db, d);
  assert.equal(ctx.db.prepare('SELECT source FROM arrival_import_files').get().source, 'SFTP');
  xoaSach(ctx.db);
  NEW.ghiFileDaChuanBi(ctx.db, d, { source: 'MANUAL' });
  assert.equal(ctx.db.prepare('SELECT source FROM arrival_import_files').get().source, 'MANUAL');
  xoaSach(ctx.db);
  NEW.ghiFileDaChuanBi(ctx.db, await NEW.chuanBiFile(p));
  assert.equal(ctx.db.prepare('SELECT source FROM arrival_import_files').get().source, 'MANUAL');
});

// ---------- 6. kiểm tĩnh ----------
test('kiểm tĩnh: importArrivalFile chỉ còn await chuanBiFile rồi ghiFileDaChuanBi; không đổi lược đồ (CHECK status giữ 4 giá trị)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'arrivalsImport.js'), 'utf8').replace(/\r\n/g, '\n');
  const m = /async function importArrivalFile\(db, filePath, \{ source = 'MANUAL' \} = \{\}\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m);
  assert.match(m[1], /await chuanBiFile\(filePath, \{ source \}\)/);
  assert.match(m[1], /return ghiFileDaChuanBi\(db, daChuanBi, \{ source \}\)/);
  assert.ok(src.includes("status TEXT NOT NULL CHECK (status IN ('OK', 'EMPTY', 'REJECTED', 'CONFLICT'))"));
  assert.ok(src.includes('INSERT OR IGNORE INTO arrival_items'));
  const ghiSrc = /function ghiFileDaChuanBi[\s\S]*?\n\}\n/.exec(src)[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\basync\b|\bawait\b|\.then\(/.test(ghiSrc));
  const chuanSrc = /async function chuanBiFile[\s\S]*?\n\}\n/.exec(src)[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bdb\b/.test(chuanSrc));
});
