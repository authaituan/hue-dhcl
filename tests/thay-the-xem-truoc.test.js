// ==========================================
// Test SANLUONG-5g-2: XEM TRƯỚC «Thay thế ngày của một BCVH» (server/lib/thayTheXemTruoc.js + route POST /api/arrivals/thay-the/xem-truoc).
// Server thật + DB tạm của harness, `client` GIẢ (không mạng, không ssh2). CSV / SHBG GIẢ dựng lúc chạy (13 ký tự, tiền tố ZZ9; không có dãy ≥ 15 chữ số).
// CHỈ ĐỌC: mọi ca đều kiểm số dòng mọi bảng trước và sau.
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
const { MANG_BI_CAM, cachLySftpEnv, nguonCamMang } = require('./helpers/khongMang');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const T = require('../server/lib/thayTheXemTruoc');
const CF = require('../server/config/thay-the');

const PORT = 5930;
const B = '533140';
const NGAY = '2026-10-10';
const D1 = '/CSV_Report_533140';
const NOW = new Date('2026-10-14T05:00:00Z');
const USERS = {
  admin: { hrm: 'XT_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'XT_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'XT_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  staff: { hrm: 'XT_STAFF', pass: 'Staff@123', role: 'STAFF' },
  tivi: { hrm: 'XT_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const khoiPhuc = [cachLySftpEnv()]; // test KHÔNG phụ thuộc môi trường (.env của máy): xóa SFTP_* ngay từ đầu file, và LẠI sau khi harness nạp server/index.js (nó nạp .env)
let ctx;
let dir;
let tmpRoot;

const shbg = (i) => `ZZ${String(900000000 + i)}VN`;
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
let seq = 0;
/** CSV giả: mỗi phần tử của `ds` là chuỗi SHBG (nguyên văn, có thể có khoảng trắng / chữ thường) hoặc { sh, bag }. ngay = ngày của mốc XN túi. */
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

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-xemtruoc-data-'));
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-xemtruoc-tmp-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-xemtruoc-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  T.datNguon(null);
  for (const f of khoiPhuc.reverse()) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
beforeEach(() => {
  cachLySftpEnv();
  T.datNguon(nguonCamMang([D1])); // nguồn mặc định CẤM MẠNG: ca nào cần nguồn thì tự đặt
  for (const t of ['sftp_sync_files', 'sftp_sync_runs', 'sftp_source_files', 'phat_status_current', 'arrival_items', 'arrival_import_files', 'ward_bdx_map']) ctx.db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- tiện ích ----------
const nap = async (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); const r = await importArrivalFile(ctx.db, p); assert.ok(['OK', 'EMPTY'].includes(r.status), `${name}: ${r.status} ${r.error || ''}`); return r; };
/** Nạp "dữ liệu cũ" của (B, NGAY): file nhập tay _235959 chứa các SHBG đã cho. */
const napCu = (ds, hms = '235959') => nap(ten(B, NGAY, hms), csv(ds));

function nguonGia(files, { loiList = null, loiGet = null, chan = null } = {}) {
  const calls = { list: 0, get: [], end: 0 };
  return {
    calls,
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
const xem = (client, extra = {}) => T.xemTruocThayThe({ client, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, now: () => NOW, ...extra });
const cacBang = () => ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const chup = () => JSON.stringify(cacBang().map((t) => [t, ctx.db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n]));
const tmpSach = () => fs.readdirSync(tmpRoot).filter((n) => n.startsWith('hue-dhcl-xemtruoc-')).length === 0;
const byTen = (kq) => Object.fromEntries(kq.nguon.tap_file.map((x) => [x.ten, x]));

const SANG = ten(B, NGAY, '093012');
const CHIEU = ten(B, NGAY, '163011');
/** Nguồn chuẩn: hai file SFTP ngày NGAY chứa `moi` (nửa đầu → sáng, nửa sau → chiều). */
function nguonChuan(moi) {
  const h = Math.ceil(moi.length / 2);
  return nguonGia({ [D1]: { [SANG]: f(csv(moi.slice(0, h))), [CHIEU]: f(csv(moi.slice(h))) } });
}

// ---------- mức cảnh báo ----------
test('AN_TOAN: file mới đủ (và thêm SHBG) -> không mất, không khoá; số liệu so sánh đúng', async () => {
  await napCu(rangeShbg(0, 100));
  const truoc = chup();
  const src = nguonChuan(rangeShbg(0, 110));
  const kq = await xem(src);
  assert.deepEqual([kq.so_sanh.shbg_cu, kq.so_sanh.shbg_moi, kq.so_sanh.shbg_chung, kq.so_sanh.shbg_chi_o_cu, kq.so_sanh.shbg_chi_o_moi, kq.so_sanh.ty_le_mat], [100, 110, 100, 0, 10, 0]);
  assert.deepEqual(kq.canh_bao, { muc: 'AN_TOAN', khoa_mac_dinh: false, nguong_do: 0.05, khong_the_thay: false, ly_do_khong_the_thay: null });
  assert.equal(kq.so_sanh.dong_cu, 100);
  assert.equal(kq.so_sanh.dong_moi_sau_loc_trung, 110);
  assert.deepEqual(kq.so_sanh.shbg_mau_chi_o_cu, []);
  assert.deepEqual(kq.so_sanh.theo_ngay_den, [{ ngay: NGAY, shbg_cu: 100, shbg_moi: 110 }]);
  assert.equal(chup(), truoc, 'KHÔNG ghi DB');
  assert.equal(src.calls.end, 1);
  assert.ok(tmpSach());
});

test('mức cảnh báo theo tỷ lệ mất: 3% CAN_XAC_NHAN; đúng 5% vẫn CAN_XAC_NHAN; 6% DO; khoá mặc định khi mất > 0', async () => {
  await napCu(rangeShbg(0, 100));
  for (const [mat, muc] of [[3, 'CAN_XAC_NHAN'], [5, 'CAN_XAC_NHAN'], [6, 'DO'], [50, 'DO'], [1, 'CAN_XAC_NHAN']]) {
    const kq = await xem(nguonChuan(rangeShbg(mat, 100)));
    assert.equal(kq.so_sanh.shbg_chi_o_cu, mat);
    assert.equal(kq.so_sanh.ty_le_mat, mat / 100);
    assert.equal(kq.canh_bao.muc, muc, `mất ${mat}/100`);
    assert.equal(kq.canh_bao.khoa_mac_dinh, true);
    assert.equal(kq.canh_bao.khong_the_thay, false);
  }
  assert.equal(CF.NGUONG_MAT_SHBG_DO, 0.05);
  assert.ok(Object.isFrozen(CF));
});

test('SHBG mẫu chỉ ở cũ: tối đa 20, sắp tăng dần, chỉ trong dữ liệu trả về', async () => {
  await napCu(rangeShbg(0, 100));
  const kq = await xem(nguonChuan(rangeShbg(30, 100)));
  assert.equal(kq.so_sanh.shbg_chi_o_cu, 30);
  assert.equal(kq.so_sanh.shbg_mau_chi_o_cu.length, 20);
  assert.deepEqual(kq.so_sanh.shbg_mau_chi_o_cu, rangeShbg(0, 20));
});

// ---------- phía DB ----------
test('phía DB: mọi file của (BCVH, ngày) mọi trạng thái và nguồn (nhập tay _235959 lẫn SFTP, REJECTED / CONFLICT); không lẫn BCVH khác hoặc ngày khác', async () => {
  await napCu(rangeShbg(0, 60)); // nhập tay
  await nap(ten(B, NGAY, '093012'), csv(rangeShbg(60, 100))); // đã nạp từ SFTP (cùng ngày)
  await nap(ten('535470', NGAY, '093012'), csv(rangeShbg(200, 250), { ma: '535470' })); // BCVH khác, cùng ngày
  await nap(ten(B, '2026-10-11', '093012'), csv(rangeShbg(300, 320), { ngay: '2026-10-11' })); // cùng BCVH, ngày khác
  ctx.db.prepare("UPDATE arrival_import_files SET source = 'SFTP' WHERE file_name = ?").run(ten(B, NGAY, '093012'));
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (?, ?, ?, '16:30:11', 10, 'aa', 'REJECTED', 'x')").run(B, ten(B, NGAY, '163011'), NGAY);
  ctx.db.prepare("INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, status, error) VALUES (?, ?, ?, '09:30:12', 10, 'bb', 'CONFLICT', 'x')").run(B, ten(B, NGAY, '093012'), NGAY);
  const kq = await xem(nguonGia({ [D1]: {} }));
  assert.deepEqual(kq.db.tap_file.map((x) => [x.file_name.slice(-10, -4), x.source, x.status, x.row_count, x.so_dong_thuc]),
    [['235959', 'MANUAL', 'OK', 60, 60], ['093012', 'SFTP', 'OK', 40, 40], ['163011', 'MANUAL', 'REJECTED', 0, 0], ['093012', 'MANUAL', 'CONFLICT', 0, 0]]);
  assert.deepEqual([kq.db.tong_dong, kq.db.shbg_khac_nhau, kq.db.dong_arrival_date_rong], [100, 100, 0]);
  assert.equal(kq.so_sanh.shbg_cu, 100);
  // dòng không có mốc BCVH -> arrival_date rỗng
  const kq2 = await xem(nguonGia({ [D1]: {} }), { bcvh: '535470' });
  assert.equal(kq2.db.shbg_khac_nhau, 50);
});

test('dòng chưa có ngày đến được đếm riêng và nằm trong theo_ngay_den với ngay = null', async () => {
  const dongKhongMoc = { sh: shbg(500), bag: 'NULL' };
  await napCu([...rangeShbg(0, 9), dongKhongMoc]);
  const kq = await xem(nguonChuan(rangeShbg(0, 9)));
  assert.equal(kq.db.dong_arrival_date_rong, 1);
  assert.deepEqual(kq.so_sanh.theo_ngay_den, [{ ngay: NGAY, shbg_cu: 9, shbg_moi: 9 }, { ngay: null, shbg_cu: 1, shbg_moi: 0 }]);
  assert.equal(kq.so_sanh.shbg_chi_o_cu, 1);
});

test('SHBG được chuẩn hoá (cắt khoảng trắng, viết hoa) ở cả hai phía: cùng SHBG khác cách viết không tính là mất', async () => {
  await napCu([`  ${shbg(1).toLowerCase()} `, shbg(2), `${shbg(3)}\t`]);
  const kq = await xem(nguonChuan([shbg(1), ` ${shbg(2).toLowerCase()}`, shbg(3)]));
  assert.deepEqual([kq.so_sanh.shbg_cu, kq.so_sanh.shbg_moi, kq.so_sanh.shbg_chung, kq.so_sanh.shbg_chi_o_cu], [3, 3, 3, 0]);
  assert.equal(kq.canh_bao.muc, 'AN_TOAN');
});

// ---------- phía nguồn ----------
test('nguồn: loại file khác mã, khác ngày, DuBao_*, #recycle, tên lạ; ≤ 3 byte là RONG và KHÔNG tải; file hợp lệ được tải', async () => {
  await napCu(rangeShbg(0, 20));
  const ok = ten(B, NGAY, '093012');
  const bufOk = csv(rangeShbg(0, 20));
  const src = nguonGia({ [D1]: {
    [ok]: f(bufOk),
    [ten('535470', NGAY, '093012')]: f(csv(rangeShbg(0, 5), { ma: '535470' })),
    [ten(B, '2026-10-11', '093012')]: f(csv(rangeShbg(0, 5), { ngay: '2026-10-11' })),
    [`DuBao_${B}_${NGAY.replace(/-/g, '')}.csv`]: f(csv(rangeShbg(0, 5))),
    '#recycle': { type: 'd', buf: Buffer.alloc(0), mtime: 0 },
    '.an.csv': f(Buffer.from('x')),
    'ghi-chu.txt': f(Buffer.from('xxxxx')),
    [ten(B, NGAY, '235959')]: f(Buffer.from([0xef, 0xbb, 0xbf]))
  } });
  const kq = await xem(src);
  assert.deepEqual(kq.nguon.tap_file.map((x) => [x.ten.slice(-10, -4), x.ket_luan]), [['093012', 'READY'], ['235959', 'RONG']]);
  assert.deepEqual(src.calls.get, [ok], 'chỉ tải file hợp lệ; file 3 byte không tải');
  assert.deepEqual([kq.nguon.bo_qua.khac_ma, kq.nguon.bo_qua.khac_ngay], [1, 1]);
  assert.ok(kq.nguon.bo_qua.ten_khac >= 4);
  assert.equal(byTen(kq)[ok].chon_mac_dinh, true);
  assert.equal(byTen(kq)[ok].so_dong, 20);
  assert.equal(byTen(kq)[ok].sha256, crypto.createHash('sha256').update(bufOk).digest('hex'));
  assert.deepEqual(kq.tap_file_nguon.map((x) => x.ten), [ok]);
  assert.ok(tmpSach());
});

test('tap_file_nguon: tên, kích thước, sha256 đúng bằng file đã dùng (để 5g-3 kiểm lại)', async () => {
  await napCu(rangeShbg(0, 10));
  const bufSang = csv(rangeShbg(0, 5));
  const bufChieu = csv(rangeShbg(5, 10));
  const kq = await xem(nguonGia({ [D1]: { [SANG]: f(bufSang), [CHIEU]: f(bufChieu) } }));
  assert.deepEqual(kq.tap_file_nguon, [
    { ten: SANG, kich_thuoc: bufSang.length, sha256: crypto.createHash('sha256').update(bufSang).digest('hex') },
    { ten: CHIEU, kich_thuoc: bufChieu.length, sha256: crypto.createHash('sha256').update(bufChieu).digest('hex') }
  ]);
});

test('file nguồn REJECTED hiện rõ và không tính; không còn file READY -> khong_the_thay', async () => {
  await napCu(rangeShbg(0, 10));
  const bad = csv([{ sh: shbg(1), bag: 'không phải ngày' }]);
  const src = nguonGia({ [D1]: { [SANG]: f(bad) } });
  const kq = await xem(src);
  assert.equal(byTen(kq)[SANG].ket_luan, 'REJECTED');
  assert.match(byTen(kq)[SANG].ly_do, /sai định dạng ngày giờ/);
  assert.deepEqual(kq.tap_file_nguon, []);
  assert.equal(kq.so_sanh.shbg_moi, 0);
  assert.equal(kq.so_sanh.shbg_chi_o_cu, 10);
  assert.deepEqual([kq.canh_bao.khong_the_thay, kq.canh_bao.ly_do_khong_the_thay, kq.canh_bao.muc], [true, 'KHONG_CO_FILE_HOP_LE', 'DO']);
  // một file tốt + một file hỏng: file hỏng không tính vào tập mới
  const kq2 = await xem(nguonGia({ [D1]: { [SANG]: f(bad), [CHIEU]: f(csv(rangeShbg(0, 10))) } }));
  assert.equal(kq2.canh_bao.khong_the_thay, false);
  assert.equal(kq2.so_sanh.shbg_moi, 10);
  assert.deepEqual(kq2.tap_file_nguon.map((x) => x.ten), [CHIEU]);
});

test('khong_the_thay: không có dữ liệu ở DB lẫn nguồn (KHONG_CO_DU_LIEU); có DB nhưng nguồn trống (KHONG_CO_FILE_HOP_LE); chỉ file RONG', async () => {
  let kq = await xem(nguonGia({ [D1]: {} }));
  assert.deepEqual([kq.canh_bao.khong_the_thay, kq.canh_bao.ly_do_khong_the_thay], [true, 'KHONG_CO_DU_LIEU']);
  assert.deepEqual([kq.so_sanh.shbg_cu, kq.so_sanh.ty_le_mat], [0, 0]);
  await napCu(rangeShbg(0, 10));
  kq = await xem(nguonGia({ [D1]: {} }));
  assert.deepEqual([kq.canh_bao.khong_the_thay, kq.canh_bao.ly_do_khong_the_thay], [true, 'KHONG_CO_FILE_HOP_LE']);
  kq = await xem(nguonGia({ [D1]: { [SANG]: f(Buffer.from([0xef, 0xbb, 0xbf])) } }));
  assert.equal(kq.canh_bao.khong_the_thay, true);
  assert.equal(kq.nguon.tap_file[0].ket_luan, 'RONG');
  // chỉ có nguồn, DB trống: thay được (nạp mới), không mất gì
  ctx.db.prepare('DELETE FROM arrival_items').run(); ctx.db.prepare('DELETE FROM arrival_import_files').run();
  kq = await xem(nguonChuan(rangeShbg(0, 10)));
  assert.deepEqual([kq.canh_bao.khong_the_thay, kq.canh_bao.muc, kq.so_sanh.shbg_cu, kq.so_sanh.shbg_moi], [false, 'AN_TOAN', 0, 10]);
});

test('tap_file: bỏ tích bớt file thì số liệu đổi theo; file không chọn không bị tải; tên lạ / rỗng bị từ chối', async () => {
  await napCu(rangeShbg(0, 100));
  const files = () => nguonChuan(rangeShbg(0, 100));
  let src = files();
  let kq = await xem(src);
  assert.equal(kq.so_sanh.shbg_chi_o_cu, 0);
  assert.ok(kq.nguon.tap_file.every((x) => x.chon && x.chon_mac_dinh));
  src = files();
  kq = await xem(src, { tapFile: [SANG] });
  assert.equal(src.calls.get.length, 1);
  assert.deepEqual(src.calls.get, [SANG]);
  assert.equal(byTen(kq)[CHIEU].chon, false);
  assert.equal(byTen(kq)[CHIEU].ket_luan, 'KHONG_CHON');
  assert.equal(byTen(kq)[CHIEU].chon_mac_dinh, true);
  assert.deepEqual([kq.so_sanh.shbg_moi, kq.so_sanh.shbg_chi_o_cu, kq.canh_bao.muc], [50, 50, 'DO']);
  assert.deepEqual(kq.tap_file_nguon.map((x) => x.ten), [SANG]);
  kq = await xem(files(), { tapFile: [] });
  assert.deepEqual([kq.canh_bao.khong_the_thay, kq.so_sanh.shbg_moi], [true, 0]);
  await assert.rejects(() => xem(files(), { tapFile: ['khong-co.csv'] }), (e) => e.code === 'TAP_FILE_KHONG_HOP_LE' && e.httpStatus === 400);
});

test('dòng trùng khoá của importer trong tập mới được lọc; dòng trùng dữ liệu CÒN LẠI (file ngoài tập, vd file sáng ngày kế tiếp) được báo', async () => {
  // file ngày kế tiếp (không thuộc tập bị xoá) chứa một dòng giống hệt dòng sẽ có trong file mới
  const chung = { sh: shbg(7), bd8: 'DONG-CHUNG' };
  await nap(ten(B, '2026-10-11', '093012'), csv([chung], { ngay: NGAY })); // ngày file 11, mốc nằm ở ngày 10 (cửa sổ [file−3, +1])
  await napCu(rangeShbg(0, 5));
  const r1 = { sh: shbg(1), bd8: 'X1' };
  const kq = await xem(nguonGia({ [D1]: { [SANG]: f(csv([r1, r1, chung, { sh: shbg(2), bd8: 'X2' }])) } }));
  assert.equal(kq.so_sanh.dong_moi_sau_loc_trung, 3, 'dòng r1 lặp bị lọc');
  assert.equal(kq.so_sanh.dong_moi_trung_du_lieu_con_lai, 1, 'dòng chung đã có ở file ngoài tập');
  assert.equal(kq.so_sanh.shbg_moi, 3);
});

// ---------- trạng thái phát ----------
test('ảnh hưởng trạng thái phát: đếm SHBG có trạng thái trong tập bị xoá; còn ở bản mới / không còn; không sửa gì', async () => {
  await napCu(rangeShbg(0, 20));
  const them = (s, b = B) => ctx.db.prepare("INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, 'PTC', 1, '2026-10-12T01:00:00Z')").run(b, s);
  for (const i of [0, 1, 2, 18, 19]) them(shbg(i));
  them(shbg(5), '535470'); // BCVH khác: không tính
  them(shbg(99)); // không thuộc tập bị xoá: không tính
  const truoc = chup();
  const kq = await xem(nguonChuan(rangeShbg(0, 15))); // mất 15..19 (5 SHBG), trong đó 18, 19 có trạng thái
  assert.deepEqual(kq.phat, { co_bang: true, so_shbg_co_trang_thai: 5, con_o_ban_moi: 3, khong_con: 2 });
  assert.equal(chup(), truoc, 'không sửa trạng thái phát');
  // không mất SHBG nào có trạng thái
  const kq2 = await xem(nguonChuan(rangeShbg(0, 20)));
  assert.deepEqual(kq2.phat, { co_bang: true, so_shbg_co_trang_thai: 5, con_o_ban_moi: 5, khong_con: 0 });
  // không có trạng thái nào
  ctx.db.prepare('DELETE FROM phat_status_current').run();
  assert.deepEqual((await xem(nguonChuan(rangeShbg(0, 20)))).phat, { co_bang: true, so_shbg_co_trang_thai: 0, con_o_ban_moi: 0, khong_con: 0 });
});

// ---------- an toàn / đồng thời ----------
test('KHÔNG ghi DB (số dòng mọi bảng trước = sau) trong mọi tình huống: thành công, lỗi nguồn, tham số sai, khoá', async () => {
  await napCu(rangeShbg(0, 30));
  const truoc = chup();
  await xem(nguonChuan(rangeShbg(0, 20)));
  await xem(nguonChuan(rangeShbg(0, 5)), { tapFile: [SANG] });
  await assert.rejects(() => xem(nguonGia({}, { loiList: Object.assign(new Error('x'), { code: 'ECONNRESET' }) })));
  await assert.rejects(() => xem(nguonGia({}), { bcvh: '999999' }));
  assert.equal(chup(), truoc);
  assert.ok(tmpSach());
});

test('file tạm bị xoá kể cả khi tải lỗi hoặc đọc lỗi; client.end luôn được gọi (cả khi lỗi đầu vào, lỗi nguồn, bị khoá)', async () => {
  await napCu(rangeShbg(0, 10));
  // get ném lỗi -> file REJECTED, vẫn trả kết quả
  let src = nguonGia({ [D1]: { [SANG]: f(csv(rangeShbg(0, 10))) } }, { loiGet: Object.assign(new Error('đứt giả'), { code: 'ECONNRESET' }) });
  let kq = await xem(src);
  assert.equal(byTen(kq)[SANG].ket_luan, 'REJECTED');
  assert.match(byTen(kq)[SANG].ly_do, /ECONNRESET/);
  assert.equal(src.calls.end, 1);
  assert.ok(tmpSach());
  // tải về lệch kích thước
  src = nguonGia({ [D1]: { [SANG]: f(csv(rangeShbg(0, 10))) } });
  const get0 = src.get;
  src.get = async (xa, cb) => { await get0(xa, cb); fs.appendFileSync(cb, 'x'); };
  kq = await xem(src);
  assert.match(byTen(kq)[SANG].ly_do, /KICH_THUOC_LECH/);
  assert.ok(tmpSach());
  // lỗi đầu vào / nguồn / khoá: end vẫn được gọi
  src = nguonGia({});
  await assert.rejects(() => xem(src, { ngay: '2026-13-40' }), (e) => e.code === 'THAM_SO_SAI');
  assert.equal(src.calls.end, 1);
  src = nguonGia({}, { loiList: Object.assign(new Error('No such file'), { code: 2 }) });
  await assert.rejects(() => xem(src), (e) => e.code === 'NGUON_THU_MUC');
  assert.equal(src.calls.end, 1);
  src = nguonGia({});
  await assert.rejects(() => xem(src, { options: { dangDongBo: () => true } }), (e) => e.code === 'DANG_CO_LUOT_DONG_BO');
  assert.equal(src.calls.end, 1);
  assert.equal(src.calls.list, 0, 'bị khoá thì không liệt kê nguồn');
});

test('khoá: có lượt đồng bộ đang chạy (khoá DB) -> DANG_CO_LUOT_DONG_BO (409), không liệt kê nguồn, không ghi gì; hết khoá thì chạy', async () => {
  ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date(NOW.getTime() - 5 * 60000).toISOString());
  const src = nguonGia({ [D1]: {} });
  const truoc = chup();
  await assert.rejects(() => xem(src), (e) => e instanceof T.XemTruocLoi && e.code === 'DANG_CO_LUOT_DONG_BO' && e.httpStatus === 409);
  assert.equal(src.calls.list, 0);
  assert.equal(chup(), truoc);
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ?').run(NOW.toISOString());
  assert.ok((await xem(nguonGia({ [D1]: {} }))).canh_bao);
});

test('hai lần xem trước chạy cùng lúc: lần hai bị chặn bằng cờ trong bộ nhớ (409); cờ được trả lại sau khi xong hoặc lỗi', async () => {
  let mo; const chan = new Promise((r) => { mo = r; });
  const src1 = nguonGia({ [D1]: {} }, { chan });
  const p1 = xem(src1);
  await new Promise((r) => setImmediate(r));
  await assert.rejects(() => xem(nguonGia({ [D1]: {} })), (e) => e.code === 'DANG_XEM_TRUOC' && e.httpStatus === 409);
  mo();
  await p1;
  assert.ok(await xem(nguonGia({ [D1]: {} })), 'cờ đã được trả');
  await assert.rejects(() => xem(nguonGia({}, { loiList: new Error('lỗi lạ') })));
  assert.ok(await xem(nguonGia({ [D1]: {} })), 'cờ được trả cả khi lỗi');
});

test('lỗi nguồn được phân loại (xác thực, vân tay, mạng, thư mục) và KHÔNG thử lại; thông báo không chứa bí mật', async () => {
  const thu = async (err, mong) => {
    let lan = 0;
    const ketNoi = async () => { lan++; throw err; };
    await assert.rejects(() => T.xemTruocThayThe({ ketNoi, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, now: () => NOW, bimat: ['mat-khau-gia', 'nguoi-dung-gia'] }),
      (e) => e.code === mong && e.httpStatus === 502 && !e.message.includes('mat-khau-gia') && !e.message.includes('nguoi-dung-gia'));
    assert.equal(lan, 1, 'không thử lại');
  };
  await thu(Object.assign(new Error('All configured authentication methods failed nguoi-dung-gia'), { code: 'ERR_GENERIC_CLIENT' }), 'NGUON_XAC_THUC');
  await thu(Object.assign(new Error('Handshake failed'), { saiVanTay: true }), 'NGUON_VAN_TAY');
  await thu(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'NGUON_MANG');
  await thu(Object.assign(new Error('Timed out while waiting for handshake'), {}), 'NGUON_MANG');
  const hong = nguonGia({}, { loiList: Object.assign(new Error('No such file /x mat-khau-gia'), { code: 2 }) });
  await assert.rejects(() => T.xemTruocThayThe({ client: hong, dirs: [D1], db: ctx.db, bcvh: B, ngay: NGAY, tmpDir: tmpRoot, now: () => NOW, bimat: ['mat-khau-gia'] }), (e) => e.code === 'NGUON_THU_MUC' && !e.message.includes('mat-khau-gia'));
  assert.equal(hong.calls.list, 1);
});

test('kiểm đầu vào: bcvh ngoài 6 BCVH, ngày sai định dạng / không có thật -> THAM_SO_SAI (400) có mã', async () => {
  for (const [bcvh, ngay] of [['999999', NGAY], [undefined, NGAY], ['533140', '2026-02-30'], ['533140', '10/10/2026'], ['533140', ''], ['533140', undefined], ['533140', '2026-13-01']]) {
    assert.throws(() => T.kiemTraDauVao({ bcvh, ngay }), (e) => e instanceof T.XemTruocLoi && e.code === 'THAM_SO_SAI' && e.httpStatus === 400, `${bcvh} ${ngay}`);
  }
  assert.deepEqual(T.kiemTraDauVao({ bcvh: B, ngay: '2024-02-29' }), { bcvh: B, ngay: '2024-02-29', tapFile: null });
  assert.throws(() => T.kiemTraDauVao({ bcvh: B, ngay: NGAY, tapFile: 'khong-phai-mang' }), (e) => e.code === 'TAP_FILE_KHONG_HOP_LE');
});

// ---------- route ----------
const goi = (who, body) => fetch(`${ctx.baseUrl}/api/arrivals/thay-the/xem-truoc`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const logFile = () => process.env.SECURITY_LOG;
const docLog = () => { try { return fs.readFileSync(logFile(), 'utf8'); } catch (e) { return ''; } };
const choLog = () => new Promise((r) => setTimeout(r, 120));

test('route POST /api/arrivals/thay-the/xem-truoc: ADMIN 200; TTVH, GDVH, STAFF, TIVI 403; không token 401', async () => {
  await napCu(rangeShbg(0, 10));
  const src = nguonChuan(rangeShbg(0, 10));
  T.datNguon({ ketNoi: async () => src, dirs: [D1] });
  const truoc = chup();
  const r = await goi('admin', { bcvh: B, ngay: NGAY });
  assert.equal(r.status, 200);
  assert.equal(r.body.canh_bao.muc, 'AN_TOAN');
  assert.equal(r.body.so_sanh.shbg_cu, 10);
  assert.equal(chup(), truoc, 'route không ghi DB');
  for (const who of ['ttvh', 'gdvh', 'staff', 'tivi']) assert.equal((await goi(who, { bcvh: B, ngay: NGAY })).status, 403, who);
  assert.equal((await goi(null, { bcvh: B, ngay: NGAY })).status, 401);
  assert.equal(src.calls.get.length, 2, 'chỉ lần của ADMIN mới tải');
});

test('route: tham số sai 400; khoá 409; lỗi nguồn 502 có mã; chưa cấu hình SFTP 503; tap_file hoạt động', async () => {
  await napCu(rangeShbg(0, 100));
  T.datNguon({ ketNoi: async () => nguonChuan(rangeShbg(0, 100)), dirs: [D1] });
  assert.equal((await goi('admin', { bcvh: '000000', ngay: NGAY })).status, 400);
  assert.equal((await goi('admin', { bcvh: B, ngay: '2026-99-99' })).status, 400);
  const la = await goi('admin', { bcvh: B, ngay: NGAY, xoa: true });
  assert.equal(la.status, 400);
  assert.equal(la.body.ma, 'THAM_SO_SAI');
  assert.equal((await goi('admin', { bcvh: B, ngay: NGAY, tap_file: 'x' })).status, 400);
  assert.equal((await goi('admin', { bcvh: B, ngay: NGAY, tap_file: ['khong-co.csv'] })).body.ma, 'TAP_FILE_KHONG_HOP_LE');
  const phan = await goi('admin', { bcvh: B, ngay: NGAY, tap_file: [SANG] });
  assert.equal(phan.status, 200);
  assert.equal(phan.body.so_sanh.shbg_moi, 50);
  assert.equal(phan.body.canh_bao.muc, 'DO');
  // khoá
  const id = ctx.db.prepare('INSERT INTO sftp_sync_runs (started_at) VALUES (?)').run(new Date().toISOString()).lastInsertRowid;
  const k = await goi('admin', { bcvh: B, ngay: NGAY });
  assert.deepEqual([k.status, k.body.ma], [409, 'DANG_CO_LUOT_DONG_BO']);
  ctx.db.prepare('UPDATE sftp_sync_runs SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  // lỗi nguồn
  T.datNguon({ ketNoi: async () => { throw Object.assign(new Error('All configured authentication methods failed'), {}); }, dirs: [D1] });
  const x = await goi('admin', { bcvh: B, ngay: NGAY });
  assert.deepEqual([x.status, x.body.ma], [502, 'NGUON_XAC_THUC']);
  // chưa cấu hình (SFTP_* đã bị cách ly): dùng đường đọc cấu hình môi trường thật của layNguon
  T.datNguon(null);
  const c = await goi('admin', { bcvh: B, ngay: NGAY });
  assert.deepEqual([c.status, c.body.ma], [503, 'CHUA_CAU_HINH_SFTP']);
  assert.match(c.body.error, /SFTP_/);
});

test('canh môi trường: dù process.env có SFTP_* (giá trị giả) hoặc .env nạp muộn, route KHÔNG gọi ketNoiSftp thật; nguồn mặc định cấm mạng', async () => {
  const SC = require('../server/lib/sftpConnect');
  const that = SC.ketNoiSftp;
  let soLanGoi = 0;
  SC.ketNoiSftp = async () => { soLanGoi++; throw new Error(MANG_BI_CAM); };
  const cu = { ...process.env };
  try {
    // 1. cấu hình giả ĐỦ và đúng dạng nằm trong process.env, nhưng test đã cách ly -> 503, không chạm kết nối
    Object.assign(process.env, { SFTP_HOST: '127.0.0.1', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_DIRS: D1, SFTP_HOSTKEY_SHA256: 'a'.repeat(64) });
    cachLySftpEnv();
    T.datNguon(null);
    const a = await goi('admin', { bcvh: B, ngay: NGAY });
    assert.deepEqual([a.status, a.body.ma], [503, 'CHUA_CAU_HINH_SFTP']);
    assert.equal(soLanGoi, 0);
    // 2. nếu lỡ biến SFTP_* còn trong môi trường, đường duy nhất tới mạng là sftpConnect.ketNoiSftp — đã bị thay bằng bản cấm mạng (đỏ ngay, không kết nối thật)
    Object.assign(process.env, { SFTP_HOST: '127.0.0.1', SFTP_PORT: '5454', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_DIRS: D1, SFTP_HOSTKEY_SHA256: 'a'.repeat(64) });
    const b = await goi('admin', { bcvh: B, ngay: NGAY });
    assert.equal(soLanGoi, 1, 'chỉ chạm bản giả');
    assert.equal(b.status, 502);
    assert.ok(!/mat-khau-gia|nguoi-dung-gia/.test(JSON.stringify(b.body)));
    // 3. nguồn mặc định của file test là cấm mạng
    T.datNguon(nguonCamMang([D1]));
    await assert.rejects(() => T.layNguon().ketNoi(), new RegExp(MANG_BI_CAM));
  } finally {
    SC.ketNoiSftp = that;
    for (const k of Object.keys(process.env)) if (/^SFTP_/.test(k)) delete process.env[k];
    for (const [k, v] of Object.entries(cu)) if (/^SFTP_/.test(k)) process.env[k] = v;
    cachLySftpEnv();
  }
});

test('SECURITY_LOG: mỗi lần xem trước một dòng (ai, BCVH, ngày, kết quả) — KHÔNG có SHBG, KHÔNG có mật khẩu', async () => {
  await napCu(rangeShbg(0, 30));
  T.datNguon({ ketNoi: async () => nguonChuan(rangeShbg(10, 30)), dirs: [D1] }); // mất 10 SHBG (có SHBG mẫu trong dữ liệu trả về)
  const truoc = docLog().split('\n').filter((l) => l.includes('arrivals_thay_the_xem_truoc')).length;
  const r = await goi('admin', { bcvh: B, ngay: NGAY });
  assert.equal(r.status, 200);
  assert.ok(r.body.so_sanh.shbg_mau_chi_o_cu.length > 0, 'SHBG mẫu CÓ trong dữ liệu trả về cho ADMIN');
  await goi('admin', { bcvh: B, ngay: 'sai' });
  await choLog();
  const dong = docLog().split('\n').filter((l) => l.includes('arrivals_thay_the_xem_truoc'));
  assert.equal(dong.length - truoc, 2);
  const j = JSON.parse(dong[dong.length - 2]);
  assert.deepEqual([j.event, j.hrm_code, j.role, j.bcvh, j.ngay, j.ket_qua, j.muc], ['arrivals_thay_the_xem_truoc', 'XT_ADMIN', 'ADMIN', B, NGAY, 'ok', 'DO']);
  assert.equal(JSON.parse(dong[dong.length - 1]).ket_qua, 'THAM_SO_SAI');
  const toanBo = dong.join('\n');
  assert.ok(!toanBo.includes('ZZ9'), 'log không có SHBG');
  assert.ok(!/mat-khau|password|token/i.test(toanBo));
  assert.ok(!/\d{15,}/.test(toanBo));
});

test('kết quả không có dãy ≥ 15 chữ số (SHBG giả 13 ký tự); cấu trúc kết quả đủ khoá', async () => {
  await napCu(rangeShbg(0, 20));
  const kq = await xem(nguonChuan(rangeShbg(0, 18)));
  assert.ok(!/\d{15,}/.test(JSON.stringify(kq)));
  assert.deepEqual(Object.keys(kq), ['bcvh', 'ngay', 'tao_luc', 'db', 'nguon', 'so_sanh', 'canh_bao', 'phat', 'tap_file_nguon']);
  assert.deepEqual(Object.keys(kq.so_sanh), ['dong_cu', 'dong_moi_sau_loc_trung', 'dong_moi_trung_du_lieu_con_lai', 'shbg_cu', 'shbg_moi', 'shbg_chi_o_cu', 'shbg_chi_o_moi', 'shbg_chung', 'ty_le_mat', 'theo_ngay_den', 'shbg_mau_chi_o_cu']);
  assert.equal(kq.tao_luc, NOW.toISOString());
});

test('script: tham số sai thoát mã 8; thiếu cấu hình SFTP thoát mã 2 — cả hai TRƯỚC khi mở DB hay kết nối (chạy ở thư mục tạm, môi trường sạch)', () => {
  const kich = path.join(__dirname, '..', 'scripts', 'thay-the-xem-truoc.js');
  const chay = (...args) => spawnSync(process.execPath, [kich, ...args], { cwd: tmpRoot, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '' }, encoding: 'utf8', timeout: 20000 });
  for (const args of [[], ['--bcvh=000000', '--ngay=2026-10-10'], ['--bcvh=533140', '--ngay=2026-02-30'], ['--bcvh=533140', '--ngay=2026-10-10', '--xoa'], ['--bcvh=533140', '--ngay=2026-10-10', '--chi-lay=']]) {
    const r = chay(...args);
    assert.equal(r.status, 8, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /THAM_SO_SAI|TAP_FILE_KHONG_HOP_LE/);
  }
  const r2 = chay('--bcvh=533140', '--ngay=2026-10-10');
  assert.equal(r2.status, 2, r2.stderr);
  assert.match(r2.stderr, /SFTP_HOST/);
  assert.ok(!/\d{15,}/.test(r2.stdout + r2.stderr));
});

// ---------- kiểm tĩnh ----------
const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kiểm tĩnh: lõi KHÔNG chứa lệnh ghi (INSERT / UPDATE / DELETE / CREATE / DROP), không nạp thư viện SFTP, không lệnh ghi của SFTP', () => {
  const raw = doc('server', 'lib', 'thayTheXemTruoc.js');
  assert.ok(!/INSERT|UPDATE|DELETE|CREATE|DROP/i.test(raw), 'cả trong chú thích');
  assert.ok(!raw.includes('ssh2-sftp-client') && !/require\(['"]ssh2/.test(raw));
  assert.ok(!/\b(put|fastPut|delete|rename|mkdir|rmdir|chmod|append)\s*\(/.test(boChuThich(raw)));
  assert.ok(!/require\(['"]\.\.?\/db/.test(raw), 'lõi không mở DB');
  const used = new Set([...boChuThich(raw).matchAll(/\bketNoiXong\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['end', 'get', 'list']);
  // DB: chỉ SELECT
  const sql = [...boChuThich(raw).matchAll(/prepare\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/g)].map((m) => m[1].trim().toUpperCase());
  assert.ok(sql.length >= 4 && sql.every((x) => x.startsWith('SELECT')), sql.join(' | ').slice(0, 200));
});

test('kiểm tĩnh: script chỉ đọc (DB readonly, không lệnh ghi SFTP, không in user / password); route chỉ nạp lớp kết nối qua lõi', () => {
  const sc = boChuThich(doc('scripts', 'thay-the-xem-truoc.js'));
  assert.ok(/readonly: true/.test(sc));
  assert.ok(!/\b(put|fastPut|delete|rename|mkdir|rmdir|chmod|append)\s*\(/.test(sc));
  assert.ok(!/INSERT|UPDATE|DELETE|CREATE|DROP/i.test(sc));
  assert.ok(!/require\(['"]\.\.\/server\/db/.test(sc));
  for (const l of sc.split('\n').filter((x) => /\b(log|loi|console\.\w+)\s*\(/.test(x))) assert.ok(!/cfg\.(user|password)\b|SFTP_(USER|PASSWORD)\b|process\.env/.test(l), l.trim());
  const rt = boChuThich(doc('server', 'routes', 'arrivals.js'));
  assert.ok(!rt.includes('ssh2-sftp-client'));
  assert.ok(/router\.post\('\/arrivals\/thay-the\/xem-truoc', requireAdmin/.test(rt));
});
