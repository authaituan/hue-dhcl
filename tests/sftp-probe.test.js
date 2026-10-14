// ==========================================
// Test SANLUONG-5b: các hàm thuần của công cụ thử kết nối SFTP chỉ đọc (server/lib/sftpFiles.js) + kiểm tĩnh scripts/sftp-probe.js.
// KHÔNG mạng, KHÔNG DB, KHÔNG chạy script. Dữ liệu giả.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const F = require('../server/lib/sftpFiles');
const { FILE_NAME_RE: IMPORT_RE } = require('../server/lib/arrivalsImport');

const e = (name, size = 1000, mtime = 1760400000000, type = '-') => ({ type, name, size, modifyTime: mtime });

test('phân tích tên file: đúng mẫu, dùng cùng mẫu với importer', () => {
  assert.equal(F.FILE_NAME_RE.source, IMPORT_RE.source);
  assert.deepEqual(F.phanTichTen('HangDen_533140_20261014_093012.csv'), {
    maDonVi: '533140', ngay: '2026-10-14', gio: '09:30:12', khoa: '20261014093012', ngayHopLe: true
  });
  assert.equal(F.phanTichTen('HangDen_535470_20261004_150011.csv').maDonVi, '535470');
  // ngày giờ không có thật: vẫn khớp mẫu (importer cũng nhận tên) nhưng đánh dấu
  assert.equal(F.phanTichTen('HangDen_533140_20261340_093012.csv').ngayHopLe, false);
  assert.equal(F.phanTichTen('HangDen_533140_20260230_093012.csv').ngayHopLe, false);
  assert.equal(F.phanTichTen('HangDen_533140_20261014_256012.csv').ngayHopLe, false);
  assert.equal(F.phanTichTen('HangDen_533140_20240229_093012.csv').ngayHopLe, true, 'năm nhuận');
});

test('phân tích tên file: tên sai mẫu -> null', () => {
  for (const bad of ['HangDen_533140_20261014_093012.csv.part', 'HangDen_533140_20261014_093012.CSV', 'hangden_533140_20261014_093012.csv',
    'HangDen__20261014_093012.csv', 'HangDen_533140_2026101_093012.csv', 'HangDen_533140_20261014_09301.csv', 'HangDen_533140_20261014_093012.csv ',
    'xHangDen_533140_20261014_093012.csv', 'HangDen_533140_20261014_093012.csvx', 'HangDen_533140_20261014_093012.xlsx', '', '#recycle', '.hidden.csv']) {
    assert.equal(F.phanTichTen(bad), null, bad);
  }
});

test('lọc thư mục: giữ file đúng mẫu; bỏ #recycle, tên bắt đầu bằng ".", thư mục con, liên kết, đuôi lạ; đếm lý do; tối đa 5 tên mẫu', () => {
  const entries = [
    e('HangDen_533140_20261014_093012.csv', 410000), e('HangDen_533140_20261014_150011.csv', 3),
    e('#recycle', 0, 0, 'd'), e('#RECYCLE', 0, 0, 'd'), e('.DS_Store'), e('.tmp.csv'),
    e('con', 0, 0, 'd'), e('HangDen_533140_20261013_093012.csv', 10, 0, 'l'), // liên kết
    e('HangDen_533140_20261014_093012.csv.part'), e('ghi-chu.txt'), e('HangDen_533140_20261014_093012.CSV'),
    e('khac1.csv'), e('khac2.csv'), e('khac3.csv')
  ];
  const kq = F.locMuc(entries, '/CSV_Report_533140');
  assert.deepEqual(kq.khop.map((f) => f.name), ['HangDen_533140_20261014_093012.csv', 'HangDen_533140_20261014_150011.csv']);
  assert.equal(kq.boQua.tong, entries.length - 2);
  assert.deepEqual(kq.boQua.theoLyDo, { recycle: 2, an: 2, khong_phai_file: 2, khac_mau: 6 });
  assert.equal(kq.boQua.tenMau.length, 5, 'tối đa 5 tên');
  assert.deepEqual(kq.canhBao, { ngayKhongHopLe: 0 });
  assert.equal(kq.khop[0].mtime, 1760400000000);
  assert.equal(kq.khop[0].khoa, '20261014093012');
});

test('lọc thư mục: file của NHIỀU mã trong cùng một thư mục đều được giữ (mã thư mục không còn là điều kiện lọc); cảnh báo ngày không hợp lệ; tên lạ được che; danh sách rỗng', () => {
  const kq = F.locMuc([e('HangDen_535470_20261014_093012.csv'), e('HangDen_533140_20261399_093012.csv'), e('HangDen_537220_20261014_093012.csv'), e('a\u0007b\nc.txt')]);
  assert.deepEqual(kq.khop.map((x) => x.maDonVi), ['535470', '533140', '537220']);
  assert.deepEqual(kq.canhBao, { ngayKhongHopLe: 1 });
  assert.equal(kq.boQua.tenMau[0], 'a?b?c.txt');
  assert.deepEqual(F.locMuc([]).khop, []);
  assert.deepEqual(F.locMuc(null).boQua.tong, 0);
  assert.ok(!('khacMaThuMuc' in kq.canhBao) && F.maTuTenThuMuc === undefined, 'quy tắc mã thư mục đã bỏ (SANLUONG-5c-1)');
});

test('thống kê theo mã đơn vị: mã đã biết không có file vẫn được liệt kê (0 file); mã lạ được đánh dấu; sắp theo giá trị số', () => {
  const kq = F.locMuc([e('HangDen_535470_20261014_093012.csv'), e('HangDen_533140_20261013_093012.csv'), e('HangDen_533140_20261014_093012.csv', 5, 7), e('HangDen_99_20261014_093012.csv')]);
  const tk = F.thongKeTheoMa(kq.khop, ['533140', '535470', '537220']);
  assert.deepEqual(tk.map((x) => [x.ma, x.soFile, x.laMa]), [['99', 1, true], ['533140', 2, false], ['535470', 1, false], ['537220', 0, false]]);
  assert.equal(tk[1].moiNhat.name, 'HangDen_533140_20261014_093012.csv');
  assert.equal(tk[3].moiNhat, null);
  assert.equal(F.soSanhMa('99', '533140') < 0, true);
  assert.equal(F.soSanhMa('533140', '535470') < 0, true);
  assert.equal(F.soSanhMa('533140', '533140'), 0);
});

test('tóm tắt: số file, mới nhất / cũ nhất theo tên, file ≤ 3 KB', () => {
  const kq = F.locMuc([
    e('HangDen_533140_20261013_150011.csv', 3072, 1000), e('HangDen_533140_20261014_093012.csv', 410000, 3000),
    e('HangDen_533140_20261014_150011.csv', 3, 2000), e('HangDen_533140_20261012_093012.csv', 3073, 500)
  ], '/CSV_Report_533140');
  const t = F.tomTat(kq.khop);
  assert.equal(t.soFile, 4);
  assert.deepEqual(t.moiNhat, { name: 'HangDen_533140_20261014_150011.csv', size: 3, mtime: 2000 }, 'mới nhất theo TÊN, không theo mtime');
  assert.equal(t.cuNhat.name, 'HangDen_533140_20261012_093012.csv');
  assert.equal(t.soFileNho, 2, '3072 và 3 là ≤ 3 KB; 3073 thì không');
  assert.deepEqual(F.tomTat([]), { soFile: 0, moiNhat: null, cuNhat: null, soFileNho: 0 });
});

test('quy tắc file ổn định: giữ nguyên = ổn định; đổi kích thước / mtime / mới xuất hiện = chưa; biến mất được báo', () => {
  const l1 = [e('a.csv', 100, 10), e('b.csv', 200, 20), e('c.csv', 300, 30), e('d.csv', 400, 40)];
  const l2 = [e('a.csv', 100, 10), e('b.csv', 250, 20), e('c.csv', 300, 31), e('e.csv', 5, 50)];
  const r = F.fileOnDinh(l1, l2);
  assert.deepEqual(r.onDinh, ['a.csv']);
  assert.deepEqual(r.chuaOnDinh, [{ name: 'b.csv', lyDo: 'doi_kich_thuoc' }, { name: 'c.csv', lyDo: 'doi_mtime' }, { name: 'e.csv', lyDo: 'moi_xuat_hien' }]);
  assert.deepEqual(r.moiXuatHien, ['e.csv']);
  assert.deepEqual(r.bienMat, ['d.csv']);
  // chấp nhận cả khoá mtime (kết quả locMuc) lẫn modifyTime (kết quả list)
  assert.deepEqual(F.fileOnDinh([{ name: 'a', size: 1, mtime: 5 }], [{ name: 'a', size: 1, modifyTime: 5 }]).onDinh, ['a']);
  assert.deepEqual(F.fileOnDinh(null, null), { onDinh: [], chuaOnDinh: [], moiXuatHien: [], bienMat: [] });
});

test('quy tắc file ổn định: khoảng cách giữa hai lần liệt kê quá ngắn -> ném lỗi', () => {
  assert.throws(() => F.fileOnDinh([], [], { khoangGiay: 3, toiThieuGiay: 10 }), RangeError);
  assert.doesNotThrow(() => F.fileOnDinh([], [], { khoangGiay: 10, toiThieuGiay: 10 }));
  assert.doesNotThrow(() => F.fileOnDinh([], [], { toiThieuGiay: 10 }), 'không truyền khoảng thực = không kiểm');
});

test('vân tay: tính SHA256 đúng dạng ssh-keygen; chuẩn hoá nhận SHA256:base64 (có/không đệm) và hex (hoa/thường, có dấu ":")', () => {
  const key = Buffer.from('khoa-may-chu-gia-de-thu-nghiem');
  const digest = crypto.createHash('sha256').update(key).digest();
  const v = F.tinhVanTay(key);
  assert.equal(v.hex, digest.toString('hex'));
  assert.equal(v.sha256, `SHA256:${digest.toString('base64').replace(/=+$/, '')}`);
  assert.ok(!v.sha256.includes('='));
  const hex = v.hex;
  const coDem = `SHA256:${digest.toString('base64')}`; // có '=' ở cuối
  const colon = hex.toUpperCase().match(/../g).join(':');
  for (const dang of [v.sha256, coDem, `sha256:${v.sha256.slice(7)}`, `  ${v.sha256}  `, hex, hex.toUpperCase(), colon, `SHA256:${hex}`, v.sha256.slice(7)]) {
    assert.equal(F.chuanHoaVanTay(dang), hex, dang);
  }
});

test('vân tay: dạng sai bị từ chối (rỗng, MD5, sai độ dài, ký tự lạ) và thông báo không lặp lại giá trị đã nhập', () => {
  const bi = 'ab:cd:ef:01:23:45:67:89:ab:cd:ef:01:23:45:67:89'; // MD5 (16 byte)
  for (const bad of ['', '   ', bi, 'SHA256:abc', 'xyz', `${'g'.repeat(64)}`, 'SHA256:' + 'A'.repeat(50), null, undefined]) {
    assert.throws(() => F.chuanHoaVanTay(bad), F.CauHinhLoi, String(bad));
  }
  try { F.chuanHoaVanTay('SHA256:BÍ-MẬT-GIẢ'); assert.fail(); } catch (err) { assert.ok(!err.message.includes('BÍ-MẬT-GIẢ')); }
});

test('kiểm tra khoá máy chủ: chế độ xem luôn từ chối nhưng ghi vân tay; chế độ ghim chỉ nhận khoá khớp', () => {
  const key = Buffer.from('khoa-gia-1');
  const khac = Buffer.from('khoa-gia-2');
  const xem = F.taoKiemTraKhoa(null);
  assert.equal(xem.kiemTra(key), false, 'từ chối -> ngắt trước bước xác thực');
  assert.equal(xem.trangThai.vanTay.hex, F.tinhVanTay(key).hex);
  assert.equal(xem.trangThai.khop, null);

  const ghim = F.taoKiemTraKhoa(F.tinhVanTay(key).hex);
  assert.equal(ghim.kiemTra(key), true);
  assert.equal(ghim.trangThai.khop, true);
  assert.equal(ghim.kiemTra(khac), false);
  assert.equal(ghim.trangThai.khop, false);
  assert.equal(ghim.trangThai.vanTay.hex, F.tinhVanTay(khac).hex, 'ghi lại vân tay thực tế để báo');
});

const ENV_DU = { SFTP_HOST: 'nas.gia.local', SFTP_USER: 'nguoi-dung-gia', SFTP_PASSWORD: 'mat-khau-gia', SFTP_DIRS: '/CSV_Report_533140, /CSV_Report_535470', SFTP_HOSTKEY_SHA256: 'a'.repeat(64) };

test('cấu hình: đủ biến -> đọc đúng; cổng mặc định 22; thư mục tách bằng dấu phẩy, bỏ trùng; vân tay chuẩn hoá', () => {
  const c = F.docCauHinh(ENV_DU);
  assert.deepEqual([c.host, c.port, c.user, c.password], ['nas.gia.local', 22, 'nguoi-dung-gia', 'mat-khau-gia']);
  assert.deepEqual(c.dirs, ['/CSV_Report_533140', '/CSV_Report_535470']);
  assert.equal(c.ghimHex, 'a'.repeat(64));
  assert.equal(F.docCauHinh({ ...ENV_DU, SFTP_PORT: '2222', SFTP_DIRS: '/x,/x, /y,,' }).port, 2222);
  assert.deepEqual(F.docCauHinh({ ...ENV_DU, SFTP_DIRS: '/x,/x, /y,,' }).dirs, ['/x', '/y']);
  assert.equal(F.docCauHinh({ ...ENV_DU, SFTP_PASSWORD: ' có khoảng trắng ' }).password, ' có khoảng trắng ', 'mật khẩu giữ nguyên khoảng trắng');
});

test('cấu hình: thiếu biến bắt buộc -> CauHinhLoi chỉ nêu TÊN biến (không lộ giá trị)', () => {
  for (const k of ['SFTP_HOST', 'SFTP_USER', 'SFTP_PASSWORD', 'SFTP_DIRS', 'SFTP_HOSTKEY_SHA256']) {
    const env = { ...ENV_DU };
    delete env[k];
    assert.throws(() => F.docCauHinh(env), (err) => err instanceof F.CauHinhLoi && err.thieu.includes(k) && !err.message.includes('mat-khau-gia') && !err.message.includes('nguoi-dung-gia'), k);
  }
  assert.throws(() => F.docCauHinh({}), (err) => err.thieu.length === 5);
  // chưa ghim vân tay: thông báo hướng dẫn chạy --show-fingerprint
  const { SFTP_HOSTKEY_SHA256, ...khongGhim } = ENV_DU;
  assert.throws(() => F.docCauHinh(khongGhim), /--show-fingerprint/);
  // giá trị rỗng / chỉ khoảng trắng cũng là thiếu
  assert.throws(() => F.docCauHinh({ ...ENV_DU, SFTP_HOST: '   ' }), (err) => err.thieu.includes('SFTP_HOST'));
});

test('cấu hình: giá trị sai (cổng, vân tay, quá nhiều thư mục) bị từ chối', () => {
  for (const [k, v] of [['SFTP_PORT', '0'], ['SFTP_PORT', '70000'], ['SFTP_PORT', 'abc'], ['SFTP_PORT', '22.5'], ['SFTP_HOSTKEY_SHA256', 'md5:xyz'],
    ['SFTP_DIRS', Array.from({ length: 21 }, (_, i) => `/d${i}`).join(',')]]) {
    assert.throws(() => F.docCauHinh({ ...ENV_DU, [k]: v }), (err) => err instanceof F.CauHinhLoi && err.thieu.includes(k), `${k}=${v}`);
  }
});

test('cấu hình chế độ --show-fingerprint: chỉ cần SFTP_HOST (không cần user / mật khẩu / thư mục / vân tay)', () => {
  const c = F.docCauHinh({ SFTP_HOST: 'nas.gia.local' }, { showFingerprint: true });
  assert.deepEqual([c.host, c.port, c.user, c.password, c.dirs, c.ghimHex], ['nas.gia.local', 22, null, null, [], null]);
  assert.throws(() => F.docCauHinh({}, { showFingerprint: true }), (err) => err.thieu.length === 1 && err.thieu[0] === 'SFTP_HOST');
});

test('tham số dòng lệnh', () => {
  assert.deepEqual(F.docThamSo([]), { showFingerprint: false, gioiHan: 20, onDinhGiay: null, troGiup: false });
  assert.equal(F.docThamSo(['--show-fingerprint']).showFingerprint, true);
  assert.equal(F.docThamSo(['--gioi-han=0']).gioiHan, 0);
  assert.equal(F.docThamSo(['--on-dinh']).onDinhGiay, 10);
  assert.equal(F.docThamSo(['--on-dinh=30']).onDinhGiay, 30);
  assert.equal(F.docThamSo(['--help']).troGiup, true);
  for (const bad of [['--put'], ['--on-dinh=0'], ['--on-dinh=500'], ['--gioi-han=-1'], ['x'], ['--show-fingerprint', '--on-dinh']]) {
    assert.throws(() => F.docThamSo(bad), F.CauHinhLoi, bad.join(' '));
  }
});

test('phân loại lỗi -> mã thoát: mạng, xác thực, vân tay, thư mục, khác', () => {
  const E = (message, code) => Object.assign(new Error(message), code === undefined ? {} : { code });
  const M = F.MA_THOAT;
  assert.deepEqual(M, { OK: 0, KHAC: 1, CAU_HINH: 2, MANG: 3, XAC_THUC: 4, VAN_TAY: 5, THU_MUC: 6 });
  for (const err of [E('getaddrinfo ENOTFOUND nas', 'ENOTFOUND'), E('connect ECONNREFUSED 10.0.0.1:22', 'ECONNREFUSED'), E('x', 'ETIMEDOUT'), E('Kết nối: quá 20 giây', 'ETIMEDOUT'),
    E('Timed out while waiting for handshake'), E('connect: Remote host has reset the connection: read ECONNRESET'), E('x', 'EHOSTUNREACH')]) {
    assert.equal(F.phanLoaiLoi(err).ma, M.MANG, err.message);
  }
  assert.equal(F.phanLoaiLoi(E('getConnection: All configured authentication methods failed', 'ERR_GENERIC_CLIENT')).ma, M.XAC_THUC);
  assert.equal(F.phanLoaiLoi(E('x', 'ERR_BAD_AUTH')).ma, M.XAC_THUC);
  // vân tay sai thắng mọi loại lỗi khác (ssh2 báo lỗi chung khi bị từ chối khoá)
  assert.equal(F.phanLoaiLoi(E('Handshake failed: signature verification failed'), { saiVanTay: true }).ma, M.VAN_TAY);
  assert.equal(F.phanLoaiLoi(E('list: No such file /CSV_Report_1', 2)).ma, M.THU_MUC);
  assert.equal(F.phanLoaiLoi(E('Permission denied /x', 3)).ma, M.THU_MUC);
  assert.equal(F.phanLoaiLoi(E('x', 'ENOENT')).ma, M.THU_MUC);
  assert.match(F.phanLoaiLoi(E('No such file', 2)).thongBao, /không tồn tại/);
  assert.equal(F.phanLoaiLoi(E('điều gì đó lạ')).ma, M.KHAC);
  assert.equal(F.phanLoaiLoi(undefined).ma, M.KHAC);
});

test('che bí mật khỏi thông báo; bỏ qua bí mật quá ngắn', () => {
  assert.equal(F.anBiMat('lỗi với mat-khau-gia cho nguoi-dung-gia', ['mat-khau-gia', 'nguoi-dung-gia', null, '']), 'lỗi với *** cho ***');
  assert.equal(F.anBiMat('abc ab', ['ab']), 'abc ab', 'chuỗi < 3 ký tự không che (tránh che nhầm)');
  assert.equal(F.anBiMat(undefined, ['xyz']), '');
});

test('hiển thị: mtime theo giờ Bangkok; dung lượng', () => {
  assert.equal(F.dinhDangMtime(Date.UTC(2026, 9, 14, 2, 30, 12)), '2026-10-14 09:30:12');
  assert.equal(F.dinhDangMtime(0), '?');
  assert.equal(F.dinhDangMtime(NaN), '?');
  assert.equal(F.dinhDangDungLuong(3072), '3,072 B (3.0 KB)');
});

// ---------- kiểm tĩnh script: CHỈ thao tác đọc ----------
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sftp-probe.js'), 'utf8');
const LIB = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'sftpFiles.js'), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('script chỉ gọi connect / list / end của thư viện SFTP; không có lệnh ghi / xoá / tải', () => {
  const code = stripComments(SCRIPT);
  const used = new Set([...code.matchAll(/\bsftp\.(\w+)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ['connect', 'end', 'list']);
  const CAM = ['put', 'fastPut', 'get', 'fastGet', 'delete', 'rmdir', 'rename', 'posixRename', 'mkdir', 'chmod', 'append', 'uploadDir', 'downloadDir', 'createReadStream', 'createWriteStream', 'cwd', 'realPath', 'exists', 'stat', 'rcopy'];
  for (const c of CAM) assert.ok(!new RegExp(`\\.${c}\\s*\\(`).test(code), `script không được gọi .${c}(`);
  assert.ok(!/require\(['"]\.\.\/server\/db/.test(code) && !/better-sqlite3/.test(code) && !/data\/hue-dhcl|\.env['"]/.test(code), 'script không mở DB');
  assert.ok(!/console\.\w+\([^)]*(password|\.user\b)/.test(code.replace(/cfg\.password, cfg\.user/g, '')), 'không in mật khẩu / tên đăng nhập');
});

test('thư viện hàm thuần không nạp thư viện SFTP, không mạng, không DB', () => {
  const code = stripComments(LIB);
  assert.ok(!/ssh2|require\(['"]net['"]\)|require\(['"]http|better-sqlite3|\.\/db/.test(code));
});
