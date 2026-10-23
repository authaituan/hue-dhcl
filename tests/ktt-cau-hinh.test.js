// ==========================================
// Test KTT-4: server/lib/kttCauHinh.js — docCauHinhKtt(db) đọc ktt_cau_hinh_chuyen + ktt_cau_hinh (KTT-2).
// DB tạm trong bộ nhớ + ensureKttSchema; dữ liệu giả. Không mở data/, không dùng server.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const { docCauHinhKtt } = require('../server/lib/kttCauHinh');
const { NGUONG_MAC_DINH } = require('../server/lib/kttTinh');

function dbMoi() {
  const db = new Database(':memory:');
  ensureKttSchema(db);
  return db;
}

test('đọc đủ 12 mốc chuyến (6 BCVH) và 4 ngưỡng từ DB sau ensureKttSchema; không cảnh báo', () => {
  const db = dbMoi();
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.canhBao, []);
  assert.deepEqual(Object.keys(c.lich).sort(), ['533140', '535470', '535790', '536250', '537015', '537220']);
  assert.equal(Object.values(c.lich).reduce((s, a) => s + a.length, 0), 12);
  assert.deepEqual(c.lich['533140'], [
    { ten: 'SANG', gioMoc: '07:30', chotTruocPhut: 30 },
    { ten: 'TRUA', gioMoc: '14:00', chotTruocPhut: 30 },
    { ten: 'TOI', gioMoc: '22:30', chotTruocPhut: 30 }
  ]);
  assert.deepEqual(c.lich['535790'], [{ ten: 'SANG', gioMoc: '08:30', chotTruocPhut: 30 }]);
  assert.deepEqual(c.lich['536250'].map((x) => `${x.ten} ${x.gioMoc}`), ['SANG 09:30', 'TRUA 13:00']);
  assert.deepEqual(c.nguong, { treoPhut: 180, namLauToiDaPhut: 1440, chiTieuF13Gio: 14, chiTieuF13GioThuanHoaPhuXuan: 12 });
  assert.deepEqual(c.nguong, { ...NGUONG_MAC_DINH });
  db.close();
});

test('mỗi BCVH sắp xếp tăng dần theo gioMoc kể cả khi thứ tự thêm ngược; số liệu đọc ra là kiểu số', () => {
  const db = dbMoi();
  db.exec("DELETE FROM ktt_cau_hinh_chuyen");
  const them = db.prepare("INSERT INTO ktt_cau_hinh_chuyen (ma_bcvh, ten_chuyen, gio_moc, gio_chot_truoc_phut, cap_nhat_luc) VALUES (?, ?, ?, ?, '2026-10-23 00:00:00')");
  them.run('599901', 'TOI', '22:30', 45);
  them.run('599901', 'SANG', '07:30', 30);
  them.run('599901', 'TRUA', '09:05', 0);
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.lich['599901'].map((x) => x.gioMoc), ['07:30', '09:05', '22:30']);
  assert.deepEqual(c.lich['599901'].map((x) => x.chotTruocPhut), [30, 0, 45]);
  assert.ok(c.lich['599901'].every((x) => typeof x.chotTruocPhut === 'number'));
  db.close();
});

test('sửa một mốc / một ngưỡng thì đọc ra giá trị mới; hàm chỉ ĐỌC (không đổi DB)', () => {
  const db = dbMoi();
  db.prepare("UPDATE ktt_cau_hinh_chuyen SET gio_moc = '07:45', gio_chot_truoc_phut = 20 WHERE ma_bcvh = '533140' AND ten_chuyen = 'SANG'").run();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 200 WHERE khoa = 'treo_phut'").run();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 13.5 WHERE khoa = 'chi_tieu_f13_gio'").run();
  const truoc = db.pragma('data_version', { simple: true });
  const tong = db.prepare('SELECT total_changes() n').get().n;
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.lich['533140'][0], { ten: 'SANG', gioMoc: '07:45', chotTruocPhut: 20 });
  assert.equal(c.nguong.treoPhut, 200);
  assert.equal(c.nguong.chiTieuF13Gio, 13.5);
  assert.equal(c.nguong.namLauToiDaPhut, 1440);
  assert.deepEqual(c.canhBao, []);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, tong);
  assert.equal(db.pragma('data_version', { simple: true }), truoc);
  db.close();
});

test('xóa khóa ngưỡng -> mặc định + canhBao nêu khóa; các khóa còn lại giữ giá trị trong DB', () => {
  const db = dbMoi();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 240 WHERE khoa = 'nam_lau_toi_da_phut'").run();
  db.prepare("DELETE FROM ktt_cau_hinh WHERE khoa IN ('treo_phut', 'chi_tieu_f13_gio')").run();
  const c = docCauHinhKtt(db);
  assert.equal(c.nguong.treoPhut, 180);
  assert.equal(c.nguong.chiTieuF13Gio, 14);
  assert.equal(c.nguong.namLauToiDaPhut, 240);
  assert.equal(c.canhBao.length, 2);
  assert.ok(c.canhBao.some((s) => s.includes('treo_phut')));
  assert.ok(c.canhBao.some((s) => s.includes('chi_tieu_f13_gio')));
  assert.equal(Object.keys(c.lich).length, 6);
  db.close();
});

test('giá trị ngưỡng hỏng (chữ, 0, âm) -> mặc định + canhBao', () => {
  const db = dbMoi();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 'abc' WHERE khoa = 'treo_phut'").run();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = 0 WHERE khoa = 'nam_lau_toi_da_phut'").run();
  db.prepare("UPDATE ktt_cau_hinh SET gia_tri = -5 WHERE khoa = 'chi_tieu_f13_gio'").run();
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.nguong, { ...NGUONG_MAC_DINH });
  assert.equal(c.canhBao.length, 3);
  db.close();
});

test('xóa hết mốc chuyến -> lich rỗng + canhBao; xóa bảng -> mặc định + canhBao, không ném lỗi', () => {
  const db = dbMoi();
  db.exec('DELETE FROM ktt_cau_hinh_chuyen');
  const c1 = docCauHinhKtt(db);
  assert.deepEqual(c1.lich, {});
  assert.equal(c1.canhBao.length, 1);
  db.exec('DROP TABLE ktt_cau_hinh_chuyen; DROP TABLE ktt_cau_hinh');
  let c2;
  assert.doesNotThrow(() => { c2 = docCauHinhKtt(db); });
  assert.deepEqual(c2.lich, {});
  assert.deepEqual(c2.nguong, { ...NGUONG_MAC_DINH });
  assert.equal(c2.canhBao.length, 2);
  db.close();
});

test('DB trống hoàn toàn (chưa chạy ensureKttSchema): cấu hình mặc định rỗng lịch kèm canhBao, không ném lỗi', () => {
  const db = new Database(':memory:');
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.lich, {});
  assert.deepEqual(c.nguong, { ...NGUONG_MAC_DINH });
  assert.equal(c.canhBao.length, 2);
  db.close();
});

test('dòng mốc chuyến hỏng (tên chuyến lạ) bị bỏ + canhBao (bảng hiện không có CHECK nếu tạo thủ công)', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ktt_cau_hinh_chuyen (ma_bcvh TEXT, ten_chuyen TEXT, gio_moc TEXT, gio_chot_truoc_phut INTEGER);
           CREATE TABLE ktt_cau_hinh (khoa TEXT, gia_tri NUMERIC);
           INSERT INTO ktt_cau_hinh_chuyen VALUES ('599901', 'SANG', '07:30', 30), ('599901', 'CHIEU', '16:00', 30), ('599901', 'TOI', '25:00', 30);`);
  const c = docCauHinhKtt(db);
  assert.deepEqual(c.lich['599901'], [{ ten: 'SANG', gioMoc: '07:30', chotTruocPhut: 30 }]);
  assert.equal(c.canhBao.filter((s) => s.includes('không hợp lệ')).length, 2);
  db.close();
});
