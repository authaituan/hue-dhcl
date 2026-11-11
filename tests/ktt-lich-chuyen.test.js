// ==========================================
// Test KTT-7a / KTT-LICH-2 (lịch chuẩn 05/11/2026): lịch chuyến chính thức (bảng ktt_lich_chuyen + ktt_lich_cau_hinh, server/lib/kttSchema.js) và các hàm thuần của server/lib/kttLichChuyen.js.
// DB tạm trong bộ nhớ (không tạo data/, không mở DB thật). Dữ liệu là LỊCH XE, không phải dữ liệu bưu gửi.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const S = require('../server/lib/kttSchema');
const L = require('../server/lib/kttLichChuyen');

const BCVH = { HUONG_TRA: '535470', HUONG_THUY: '536250', A_LUOI: '535790', THUAN_AN: '537015', PHU_LOC: '537220', THUAN_HOA: '533140' };
function moiDb() { const db = new Database(':memory:'); S.ensureKttSchema(db); return db; }
const lichMd = () => { const db = moiDb(); try { return L.docLichChuyen(db).lich; } finally { db.close(); } };
const LICH = lichMd();
const dong = (ma, gio, ngay = 'CA_TUAN', o = {}) => ({ ma_bcvh: ma, gio_xuat_phat: gio, ngay_chay: ngay, nhan: null, dang_dung: 1, ...o });
const xep = (ma, gio, lich = LICH, tuyChon) => L.xepChuyen(lich, ma, gio, tuyChon);
const dang = (r) => (r.ok ? `${r.chuyen.ngay} ${r.chuyen.gio_xuat_phat}${r.qua_dem ? ' qua_dem' : ''}` : r.ly_do);

// 24/10/2026 thứ Bảy, 25/10 Chủ nhật, 26/10 thứ Hai.

// ---------- schema / dữ liệu mặc định ----------
test('mặc định: đủ 14 dòng đúng LỊCH CHUẨN 05/11/2026; hạn 60 phút + lich_phien_ban ở ktt_lich_cau_hinh; chạy lại không nhân đôi', () => {
  const db = moiDb();
  try {
    S.ensureKttSchema(db); S.ensureKttSchema(db);
    const rows = db.prepare('SELECT ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung FROM ktt_lich_chuyen ORDER BY ma_bcvh, gio_xuat_phat').all();
    assert.equal(rows.length, 14);
    const theo = (ma) => rows.filter((r) => r.ma_bcvh === ma).map((r) => `${r.gio_xuat_phat}${r.ngay_chay === 'NGHI_CN' ? '*' : ''}`);
    assert.deepEqual(theo(BCVH.HUONG_TRA), ['06:10', '12:00']);
    assert.deepEqual(theo(BCVH.HUONG_THUY), ['07:30', '12:45*']);
    assert.deepEqual(theo(BCVH.A_LUOI), ['08:00']);
    assert.deepEqual(theo(BCVH.THUAN_AN), ['07:30', '13:30*']);
    assert.deepEqual(theo(BCVH.PHU_LOC), ['07:30', '13:00*']);
    assert.deepEqual(theo(BCVH.THUAN_HOA), ['07:00', '12:45', '12:55', '19:45', '22:00']);
    assert.ok(rows.every((r) => r.dang_dung === 1));
    assert.ok(db.prepare('SELECT ngay_chay_xac_nhan x FROM ktt_lich_chuyen').all().every((r) => r.x === 1), 'lịch Chủ nhật của cả 6 BCVH đã xác nhận');
    assert.equal(rows.filter((r) => r.ngay_chay === 'NGHI_CN').length, 3, 'chỉ 3 chuyến nghỉ Chủ nhật: Hương Thủy 12:45, Thuận An 13:30, Phú Lộc 13:00');
    assert.equal(rows.find((r) => r.gio_xuat_phat === '22:00').nhan, 'C4');
    assert.deepEqual(db.prepare('SELECT khoa, gia_tri FROM ktt_lich_cau_hinh').all().map((r) => ({ ...r })), [{ khoa: 'han_den_truoc_chuyen_phut', gia_tri: 60 }, { khoa: 'lich_phien_ban', gia_tri: S.LICH_PHIEN_BAN }]);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_lich_cau_hinh').get().c, 2);
    // bảng cũ không bị đổi
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_cau_hinh').get().c, 4);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_cau_hinh_chuyen').get().c, 0, 'lịch V1 không còn seed (KTT-LICH-2)');
    assert.throws(() => db.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, cap_nhat_luc) VALUES ('1', '7:00', 'CA_TUAN', 'x')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, cap_nhat_luc) VALUES ('1', '07:00', 'THU_BAY', 'x')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, cap_nhat_luc) VALUES ('535470', '06:10', 'CA_TUAN', 'x')").run(), /UNIQUE/);
  } finally { db.close(); }
});

test('giá trị PO sửa tay SAU migration KHÔNG bị ghi đè khi chạy lại ensureKttSchema (ngày chạy, nhãn, dang_dung, hạn 60 phút)', () => {
  const db = moiDb();
  try {
    db.prepare("UPDATE ktt_lich_chuyen SET ngay_chay = 'NGHI_CN', nhan = 'PO sửa', dang_dung = 0 WHERE ma_bcvh = '535470' AND gio_xuat_phat = '06:10'").run();
    db.prepare("UPDATE ktt_lich_cau_hinh SET gia_tri = 45 WHERE khoa = 'han_den_truoc_chuyen_phut'").run();
    S.ensureKttSchema(db);
    const r = db.prepare("SELECT ngay_chay, nhan, dang_dung FROM ktt_lich_chuyen WHERE ma_bcvh = '535470' AND gio_xuat_phat = '06:10'").get();
    assert.deepEqual({ ...r }, { ngay_chay: 'NGHI_CN', nhan: 'PO sửa', dang_dung: 0 });
    assert.equal(db.prepare("SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = 'han_den_truoc_chuyen_phut'").get().gia_tri, 45);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_lich_chuyen').get().c, 14);
    const d = L.docLichChuyen(db);
    assert.equal(d.hanDenTruocChuyenPhut, 45);
    assert.equal(d.lich.find((x) => x.ma_bcvh === '535470' && x.gio_xuat_phat === '06:10').dang_dung, 0);
  } finally { db.close(); }
});

// ---------- migration lịch chuẩn (KTT-LICH-2) ----------
const dongTheoMa = (db) => db.prepare('SELECT ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung, ngay_chay_xac_nhan FROM ktt_lich_chuyen ORDER BY ma_bcvh, gio_xuat_phat').all().map((r) => ({ ...r }));
/** DB như trước KTT-LICH-2: lịch 26/10, KHÔNG có cột ngay_chay_xac_nhan, khóa lich_phien_ban vắng. */
function dbLichCu() {
  const db = new Database(':memory:');
  S.ensureKttSchema(db);
  db.exec('DELETE FROM ktt_lich_chuyen; DELETE FROM ktt_lich_cau_hinh WHERE khoa = \'lich_phien_ban\'; ALTER TABLE ktt_lich_chuyen DROP COLUMN ngay_chay_xac_nhan;');
  const them = db.prepare("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, ghi_chu, cap_nhat_luc) VALUES (?, ?, ?, ?, ?, 'x')");
  for (const [ma, g, n, nh] of [['535470', '06:00', 'CA_TUAN'], ['535470', '12:00', 'CA_TUAN'], ['536250', '06:30', 'NGHI_CN'], ['536250', '12:30', 'NGHI_CN'], ['535790', '08:00', 'CA_TUAN'], ['537015', '07:30', 'CA_TUAN'], ['537015', '13:30', 'NGHI_CN'],
    ['537220', '07:30', 'CA_TUAN'], ['537220', '13:00', 'NGHI_CN'], ['533140', '07:00', 'CA_TUAN'], ['533140', '12:30', 'CA_TUAN'], ['533140', '19:45', 'CA_TUAN'], ['533140', '22:00', 'CA_TUAN', 'C4'], ['533140', '12:55', 'NGHI_CN']]) them.run(ma, g, n, nh || null, null);
  return db;
}
const CHUAN = () => S.LICH_CHUYEN_MAC_DINH.map(([ma, g, n, nh]) => ({ ma_bcvh: ma, gio_xuat_phat: g, ngay_chay: n, nhan: nh, dang_dung: 1, ngay_chay_xac_nhan: 1 })).sort((a, b) => (a.ma_bcvh + a.gio_xuat_phat < b.ma_bcvh + b.gio_xuat_phat ? -1 : 1));

test('migration lich_phien_ban: DB lịch cũ (không có cột xác nhận) -> đúng 14 dòng lịch chuẩn, thêm cột; chạy lần hai KHÔNG đổi gì', () => {
  const db = dbLichCu();
  try {
    S.ensureKttSchema(db);
    assert.deepEqual(dongTheoMa(db), CHUAN());
    assert.equal(db.prepare("SELECT gia_tri FROM ktt_lich_cau_hinh WHERE khoa = 'lich_phien_ban'").get().gia_tri, S.LICH_PHIEN_BAN);
    const truoc = db.prepare('SELECT * FROM ktt_lich_chuyen ORDER BY id').all();
    S.ensureKttSchema(db);
    assert.deepEqual(db.prepare('SELECT * FROM ktt_lich_chuyen ORDER BY id').all(), truoc, 'lần hai: từng dòng (kể cả id, cap_nhat_luc) giữ nguyên');
  } finally { db.close(); }
});

test('migration lich_phien_ban: DB «lai» (dòng cũ + dòng mới cùng có) về đúng lịch chuẩn; dòng PO tắt / sửa tay trước migration bị ghi đè theo chuẩn; id dòng trùng được giữ', () => {
  const db = dbLichCu();
  try {
    db.exec("INSERT INTO ktt_lich_chuyen (ma_bcvh, gio_xuat_phat, ngay_chay, nhan, ghi_chu, cap_nhat_luc) VALUES ('536250', '07:30', 'NGHI_CN', 'lai', NULL, 'x'), ('536250', '12:45', 'CA_TUAN', NULL, NULL, 'x'), ('533140', '12:45', 'CA_TUAN', NULL, NULL, 'x'), ('535470', '06:10', 'CA_TUAN', NULL, NULL, 'x')");
    db.exec("UPDATE ktt_lich_chuyen SET dang_dung = 0, nhan = 'tắt tay' WHERE ma_bcvh = '535790'");
    const idA = db.prepare("SELECT id FROM ktt_lich_chuyen WHERE ma_bcvh = '535790'").get().id;
    S.ensureKttSchema(db);
    assert.deepEqual(dongTheoMa(db), CHUAN());
    assert.equal(db.prepare("SELECT id FROM ktt_lich_chuyen WHERE ma_bcvh = '535790'").get().id, idA);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_lich_chuyen').get().c, 14);
  } finally { db.close(); }
});

test('migration: rollback cả giao dịch nếu lỗi giữa chừng (lịch cũ nguyên vẹn, khóa phiên bản chưa ghi); chỉ chạy một lần, đổi tay sau đó được giữ', () => {
  const db = dbLichCu();
  try {
    db.exec("CREATE TRIGGER chan_chen BEFORE INSERT ON ktt_lich_chuyen WHEN NEW.gio_xuat_phat = '12:45' AND NEW.ma_bcvh = '536250' BEGIN SELECT RAISE(ABORT, 'chan thu'); END;");
    assert.throws(() => S.ensureKttSchema(db), /chan thu/);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM ktt_lich_cau_hinh WHERE khoa = 'lich_phien_ban'").get().c, 0, 'khóa chưa ghi');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ktt_lich_chuyen').get().c, 14);
    assert.ok(db.prepare("SELECT 1 FROM ktt_lich_chuyen WHERE ma_bcvh = '536250' AND gio_xuat_phat = '06:30'").get(), 'dòng cũ chưa bị xóa');
    db.exec('DROP TRIGGER chan_chen');
    S.ensureKttSchema(db);
    assert.deepEqual(dongTheoMa(db), CHUAN());
    db.exec("UPDATE ktt_lich_chuyen SET ngay_chay = 'NGHI_CN', ngay_chay_xac_nhan = 0 WHERE ma_bcvh = '533140' AND gio_xuat_phat = '12:55'");
    S.ensureKttSchema(db);
    const r = db.prepare("SELECT ngay_chay, ngay_chay_xac_nhan x FROM ktt_lich_chuyen WHERE ma_bcvh = '533140' AND gio_xuat_phat = '12:55'").get();
    assert.deepEqual({ ...r }, { ngay_chay: 'NGHI_CN', x: 0 }, 'sau migration, sửa tay không bị ghi đè');
  } finally { db.close(); }
});

test('migration: DB mới sinh ra đúng lịch chuẩn (khóa phiên bản = LICH_PHIEN_BAN); phiên bản DB CAO HƠN thì không đụng gì', () => {
  const db = moiDb();
  try {
    assert.deepEqual(dongTheoMa(db), CHUAN());
    db.exec("UPDATE ktt_lich_cau_hinh SET gia_tri = gia_tri + 1 WHERE khoa = 'lich_phien_ban'; DELETE FROM ktt_lich_chuyen WHERE ma_bcvh = '535790'");
    S.ensureKttSchema(db);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM ktt_lich_chuyen WHERE ma_bcvh = '535790'").get().c, 0);
  } finally { db.close(); }
});

test('docLichChuyen: có ngay_chay_xac_nhan (mặc định 1); bảng dựng tay thiếu cột -> coi là đã xác nhận; bcvhChuaXacNhanChuNhat chỉ trả BCVH có dòng đang dùng đánh dấu 0', () => {
  const db = moiDb();
  try {
    assert.ok(L.docLichChuyen(db).lich.every((x) => x.ngay_chay_xac_nhan === 1));
    assert.deepEqual(L.bcvhChuaXacNhanChuNhat(L.docLichChuyen(db).lich), []);
    db.exec("UPDATE ktt_lich_chuyen SET ngay_chay_xac_nhan = 0 WHERE ma_bcvh IN ('537220', '536250') AND gio_xuat_phat IN ('13:00', '07:30')");
    assert.deepEqual(L.bcvhChuaXacNhanChuNhat(L.docLichChuyen(db).lich), ['536250', '537220']);
    db.exec("UPDATE ktt_lich_chuyen SET dang_dung = 0 WHERE ma_bcvh = '537220'");
    assert.deepEqual(L.bcvhChuaXacNhanChuNhat(L.docLichChuyen(db).lich), ['536250'], 'dòng tắt không tính');
  } finally { db.close(); }
  assert.deepEqual(L.bcvhChuaXacNhanChuNhat(LICH), []);
  assert.deepEqual(L.bcvhChuaXacNhanChuNhat(null), []);
});

test('docLichChuyen: đọc đủ 14 dòng, sắp theo mã + giờ, hạn 60, không cảnh báo', () => {
  const db = moiDb();
  try {
    const d = L.docLichChuyen(db);
    assert.equal(d.lich.length, 14); assert.equal(d.hanDenTruocChuyenPhut, 60); assert.deepEqual(d.canhBao, []);
    assert.deepEqual(d.lich.map((x) => `${x.ma_bcvh} ${x.gio_xuat_phat}`), [...d.lich.map((x) => `${x.ma_bcvh} ${x.gio_xuat_phat}`)].sort());
  } finally { db.close(); }
});

test('docLichChuyen: bảng thiếu / hỏng / dòng sai -> lịch rỗng hoặc bỏ dòng sai + canhBao, KHÔNG ném lỗi', () => {
  const db = new Database(':memory:');
  try {
    const trong = L.docLichChuyen(db);
    assert.deepEqual([trong.lich, trong.hanDenTruocChuyenPhut], [[], 60]); assert.equal(trong.canhBao.length, 2);
    db.exec('CREATE TABLE ktt_lich_chuyen (ma_bcvh TEXT, gio_xuat_phat TEXT, ngay_chay TEXT, nhan TEXT, dang_dung INTEGER); CREATE TABLE ktt_lich_cau_hinh (khoa TEXT, gia_tri NUMERIC);');
    db.exec("INSERT INTO ktt_lich_chuyen VALUES ('535470', '06:00', 'CA_TUAN', NULL, 1), ('535470', '25:99', 'CA_TUAN', NULL, 1), ('535470', '12:00', 'THU_BAY', NULL, 1);");
    db.exec("INSERT INTO ktt_lich_cau_hinh VALUES ('han_den_truoc_chuyen_phut', 'abc');");
    const d = L.docLichChuyen(db);
    assert.equal(d.lich.length, 1); assert.equal(d.hanDenTruocChuyenPhut, 60); assert.equal(d.canhBao.length, 3);
    db.exec('DROP TABLE ktt_lich_chuyen; CREATE TABLE ktt_lich_chuyen (x INTEGER);');
    const h = L.docLichChuyen(db);
    assert.deepEqual(h.lich, []); assert.ok(h.canhBao.some((c) => /Không đọc được ktt_lich_chuyen/.test(c)));
  } finally { db.close(); }
});

// ---------- xếp chuyến ----------
test('Hương Thủy: đến thứ Bảy 13:00 -> chuyến 07:30 Chủ nhật (Chủ nhật có chuyến 07:30), qua đêm; Chủ nhật 08:00 -> 07:30 thứ Hai (12:45 nghỉ CN); thứ Hai 06:20 -> 07:30 cùng ngày', () => {
  let r = xep(BCVH.HUONG_THUY, '2026-10-24 13:00:00');
  assert.deepEqual([r.ok, r.chuyen.ngay, r.chuyen.gio_xuat_phat, r.qua_dem], [true, '2026-10-25', '07:30', true]);
  assert.equal(dang(xep(BCVH.HUONG_THUY, '2026-10-25 06:30:00')), '2026-10-25 07:30', 'Chủ nhật: chuyến 07:30 chạy, hạn 06:30');
  assert.equal(dang(xep(BCVH.HUONG_THUY, '2026-10-25 08:00:00')), '2026-10-26 07:30 qua_dem', 'Chủ nhật sau 07:30: chuyến 12:45 nghỉ, sang thứ Hai');
  r = xep(BCVH.HUONG_THUY, '2026-10-26 06:20:00');
  assert.deepEqual([r.chuyen.ngay, r.chuyen.gio_xuat_phat, r.qua_dem, r.chuyen.xuat_phat_luc, r.chuyen.han_den_luc], ['2026-10-26', '07:30', false, '2026-10-26 07:30:00', '2026-10-26 06:30:00']);
  assert.equal(dang(xep(BCVH.HUONG_THUY, '2026-10-26 06:50:00')), '2026-10-26 12:45', '06:50 đã quá hạn 06:30 của chuyến 07:30');
});

test('lịch chuẩn: MỖI BCVH × ngày thường / Chủ nhật có đúng các chuyến chạy trong ngày (giờ rời), chạy cả Chủ nhật trừ ba chuyến nghỉ', () => {
  const thuong = '2026-10-26'; const cn = '2026-10-25';
  const gio = (ma, ngay) => L.chuyenTrongNgay(LICH, ma, ngay).map((c) => c.gio_xuat_phat);
  assert.deepEqual([gio(BCVH.THUAN_HOA, thuong), gio(BCVH.THUAN_HOA, cn)], [['07:00', '12:45', '12:55', '19:45', '22:00'], ['07:00', '12:45', '12:55', '19:45', '22:00']], 'Thuận Hóa Chủ nhật đủ 5 chuyến');
  assert.deepEqual([gio(BCVH.HUONG_THUY, thuong), gio(BCVH.HUONG_THUY, cn)], [['07:30', '12:45'], ['07:30']], 'Hương Thủy Chủ nhật chỉ 07:30');
  assert.deepEqual([gio(BCVH.HUONG_TRA, thuong), gio(BCVH.HUONG_TRA, cn)], [['06:10', '12:00'], ['06:10', '12:00']]);
  assert.deepEqual([gio(BCVH.THUAN_AN, thuong), gio(BCVH.THUAN_AN, cn)], [['07:30', '13:30'], ['07:30']]);
  assert.deepEqual([gio(BCVH.PHU_LOC, thuong), gio(BCVH.PHU_LOC, cn)], [['07:30', '13:00'], ['07:30']]);
  for (const ngay of ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) assert.deepEqual(gio(BCVH.A_LUOI, ngay), ['08:00'], `A Lưới chạy cả tuần (${ngay})`);
});

test('lịch chuẩn: hàng đến SAU chuyến cuối của ngày -> chuyến ĐẦU ngày kế có chạy (đúng cả khi ngày kế là Chủ nhật)', () => {
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-24 21:30:00')), '2026-10-25 07:00 qua_dem', 'T7 sau 21:00 -> Chủ nhật 07:00 (Thuận Hóa chạy đủ)');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-24 11:30:00')), '2026-10-25 06:10 qua_dem', 'T7 sau 11:00 -> Chủ nhật 06:10');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-25 11:30:00')), '2026-10-26 06:10 qua_dem');
  assert.equal(dang(xep(BCVH.A_LUOI, '2026-10-24 08:30:00')), '2026-10-25 08:00 qua_dem', 'A Lưới chạy Chủ nhật');
  assert.equal(dang(xep(BCVH.A_LUOI, '2026-10-25 08:30:00')), '2026-10-26 08:00 qua_dem');
  assert.equal(dang(xep(BCVH.THUAN_AN, '2026-10-24 13:00:00')), '2026-10-25 07:30 qua_dem', 'Thuận An T7 sau 12:30 -> Chủ nhật 07:30 (chuyến sáng chạy)');
  assert.equal(dang(xep(BCVH.THUAN_AN, '2026-10-25 07:00:00')), '2026-10-26 07:30 qua_dem', 'Thuận An Chủ nhật sau 06:30: 13:30 nghỉ -> thứ Hai');
  assert.equal(dang(xep(BCVH.PHU_LOC, '2026-10-25 12:00:00')), '2026-10-26 07:30 qua_dem', 'Phú Lộc Chủ nhật: 13:00 nghỉ -> thứ Hai');
});

test('lapNgayNghi: Chủ nhật, BCVH có chuyến nghỉ, giờ lập sau chuyến Chủ nhật cuối còn chạy (cả ngày nếu không còn chuyến Chủ nhật); ngày thường / BCVH không nghỉ / giờ sai -> false', () => {
  const n = (ma, g) => L.lapNgayNghi(LICH, ma, g);
  assert.equal(n(BCVH.HUONG_THUY, '2026-10-25 07:30:00'), false, 'đúng giờ chuyến cuối còn chạy: chưa phải ngày nghỉ');
  assert.equal(n(BCVH.HUONG_THUY, '2026-10-25 07:30:01'), true);
  assert.equal(n(BCVH.HUONG_THUY, '2026-10-25 13:00:00'), true);
  assert.equal(n(BCVH.HUONG_THUY, '2026-10-25 06:00:00'), false);
  assert.equal(n(BCVH.HUONG_THUY, '2026-10-26 13:00:00'), false, 'thứ Hai');
  assert.equal(n(BCVH.THUAN_AN, '2026-10-25 14:00:00'), true);
  assert.equal(n(BCVH.PHU_LOC, '2026-10-25 06:59:00'), false);
  for (const ma of [BCVH.THUAN_HOA, BCVH.HUONG_TRA, BCVH.A_LUOI]) assert.equal(n(ma, '2026-10-25 23:00:00'), false, `${ma} không có chuyến nghỉ`);
  assert.equal(n(BCVH.HUONG_THUY, 'abc'), false); assert.equal(n(BCVH.HUONG_THUY, null), false);
  // BCVH có dòng nghỉ nhưng không còn chuyến Chủ nhật nào: cả ngày
  assert.equal(L.lapNgayNghi([dong('1', '06:30', 'NGHI_CN'), dong('1', '12:30', 'NGHI_CN')], '1', '2026-10-25 00:10:00'), true);
  assert.equal(L.lapNgayNghi([dong('1', '06:30', 'NGHI_CN', { dang_dung: 0 })], '1', '2026-10-25 12:00:00'), false, 'dòng tắt không tính là chuyến nghỉ');
});

test('biên: đến đúng hạn (giờ rời − 60 phút) kịp chuyến đó; trễ 1 giây thì chuyến kế; hạn là tham số', () => {
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 05:10:00')), '2026-10-26 06:10');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 05:10:01')), '2026-10-26 12:00');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 11:00:00')), '2026-10-26 12:00');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 11:00:01')), '2026-10-27 06:10 qua_dem');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 05:40:00', LICH, { hanDenTruocChuyenPhut: 30 })), '2026-10-26 06:10');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 05:40:01', LICH, { hanDenTruocChuyenPhut: 30 })), '2026-10-26 12:00');
  assert.equal(dang(xep(BCVH.HUONG_TRA, '2026-10-26 05:10:00.999')), '2026-10-26 06:10', 'phần mili giây bị cắt');
});

test('Thuận Hóa: ngày thường 11:40 -> 12:45 (hạn 11:45); 11:50 -> 12:55 (hạn 11:55); Chủ nhật CÙNG giờ, cùng chuyến (chạy đủ 5 chuyến)', () => {
  const r = xep(BCVH.THUAN_HOA, '2026-10-26 11:40:00');
  assert.deepEqual([r.chuyen.gio_xuat_phat, r.chuyen.han_den_luc, r.qua_dem], ['12:45', '2026-10-26 11:45:00', false]);
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-25 11:40:00')), '2026-10-25 12:45');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-25 11:50:00')), '2026-10-25 12:55', 'Chủ nhật: 12:55 chạy');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-26 11:45:00')), '2026-10-26 12:45');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-26 11:45:01')), '2026-10-26 12:55');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-26 11:55:01')), '2026-10-26 19:45');
});

test('Thuận Hóa: đến 21:30 -> 07:00 ngày hôm sau (qua đêm); 20:59:59 -> 22:00 (C4) cùng ngày; 21:00:00 vẫn kịp 22:00', () => {
  const r = xep(BCVH.THUAN_HOA, '2026-10-26 21:30:00');
  assert.deepEqual([r.chuyen.ngay, r.chuyen.gio_xuat_phat, r.qua_dem], ['2026-10-27', '07:00', true]);
  const c4 = xep(BCVH.THUAN_HOA, '2026-10-26 20:59:59');
  assert.deepEqual([c4.chuyen.gio_xuat_phat, c4.chuyen.nhan, c4.qua_dem, c4.chuyen.han_den_luc], ['22:00', 'C4', false, '2026-10-26 21:00:00']);
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-26 21:00:00')), '2026-10-26 22:00');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-26 21:00:01')), '2026-10-27 07:00 qua_dem');
});

test('chuyển ngày đúng: cuối tháng, cuối năm, 29/02 năm nhuận, 28/02 năm thường', () => {
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-10-31 21:30:00')), '2026-11-01 07:00 qua_dem', 'Chủ nhật 01/11 Thuận Hóa vẫn chạy 07:00');
  assert.equal(dang(xep(BCVH.HUONG_THUY, '2026-10-31 13:00:00')), '2026-11-01 07:30 qua_dem', 'thứ Bảy 31/10 -> Chủ nhật 01/11 có chuyến 07:30');
  assert.equal(dang(xep(BCVH.HUONG_THUY, '2026-11-01 08:00:00')), '2026-11-02 07:30 qua_dem', 'Chủ nhật 01/11 sau 07:30 -> bỏ chuyến 12:45 nghỉ CN');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2026-12-31 21:30:00')), '2027-01-01 07:00 qua_dem');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2028-02-28 21:30:00')), '2028-02-29 07:00 qua_dem');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2028-02-29 21:30:00')), '2028-03-01 07:00 qua_dem');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2027-02-28 21:30:00')), '2027-03-01 07:00 qua_dem');
  assert.equal(dang(xep(BCVH.THUAN_HOA, '2028-02-29 06:00:00')), '2028-02-29 07:00');
});

test('lý do lỗi: KHONG_PHAI_BCVH_HUE, THIEU_GIO_DEN, GIO_DEN_SAI (31/04, giờ 24, định dạng lạ), KHONG_CO_LICH (xóa hết dòng của BCVH; chỉ có dòng tắt; quá 7 ngày kế)', () => {
  assert.deepEqual(xep('999999', '2026-10-26 08:00:00'), { ok: false, ly_do: 'KHONG_PHAI_BCVH_HUE' });
  assert.equal(xep('', '2026-10-26 08:00:00').ly_do, 'KHONG_PHAI_BCVH_HUE');
  for (const x of [null, undefined, '', '   ']) assert.equal(xep(BCVH.THUAN_HOA, x).ly_do, 'THIEU_GIO_DEN', JSON.stringify(x));
  for (const x of ['2026-04-31 08:00:00', '2026-10-26 24:00:00', '2026-13-01 08:00:00', '26/10/2026 08:00', '2026-10-26', 'abc', '2026-02-29 08:00:00', 5]) assert.equal(xep(BCVH.THUAN_HOA, x).ly_do, 'GIO_DEN_SAI', String(x));
  assert.equal(xep(BCVH.THUAN_HOA, '2026-10-26 08:00:00', LICH.filter((x) => x.ma_bcvh !== BCVH.THUAN_HOA)).ly_do, 'KHONG_CO_LICH');
  assert.equal(xep(BCVH.THUAN_HOA, '2026-10-26 08:00:00', []).ly_do, 'KHONG_CO_LICH');
  assert.equal(xep(BCVH.A_LUOI, '2026-10-26 08:00:00', [dong(BCVH.A_LUOI, '08:00', 'CA_TUAN', { dang_dung: 0 })]).ly_do, 'KHONG_CO_LICH', 'dòng tắt không tính');
  assert.equal(xep(BCVH.A_LUOI, '2026-10-26 08:00:00', null).ly_do, 'KHONG_CO_LICH');
  // chỉ có chuyến nghỉ Chủ nhật: vẫn tìm được thứ Hai; BCVH chỉ nghỉ CN và đến thứ Bảy -> thứ Hai (cách 2 ngày, trong giới hạn)
  assert.equal(dang(xep(BCVH.A_LUOI, '2026-10-24 23:00:00', [dong(BCVH.A_LUOI, '08:00', 'NGHI_CN')])), '2026-10-26 08:00 qua_dem');
});

test('xepChuyen: tối đa 7 ngày kế (lịch trống ở mọi ngày thì KHONG_CO_LICH); chuyến nằm sau ngày thứ 7 không bao giờ được chọn', () => {
  // dòng NGHI_CN và đến thứ Bảy: ngày kế có chuyến ở thứ Hai (+2). Không thể có lịch cách > 7 ngày với hai loại ngày chạy; chặn bằng dòng bị tắt.
  assert.equal(L.SO_NGAY_TIM_TOI_DA, 7);
  assert.equal(xep(BCVH.A_LUOI, '2026-10-24 23:00:00', [dong(BCVH.A_LUOI, '08:00', 'CA_TUAN', { dang_dung: false })]).ly_do, 'KHONG_CO_LICH');
});

test('chuyenTrongNgay: loại dòng nghỉ Chủ nhật vào Chủ nhật và dòng tắt; sắp tăng theo giờ; có hạn đến', () => {
  const t = L.chuyenTrongNgay(LICH, BCVH.THUAN_HOA, '2026-10-26');
  assert.deepEqual(t.map((c) => c.gio_xuat_phat), ['07:00', '12:45', '12:55', '19:45', '22:00']);
  assert.equal(t[2].han_den_luc, '2026-10-26 11:55:00');
  assert.ok(t.every((c) => c.ma_bcvh === BCVH.THUAN_HOA && c.ngay === '2026-10-26' && !('_giayHan' in c)));
  assert.deepEqual(L.chuyenTrongNgay(LICH, BCVH.THUAN_HOA, '2026-10-25').map((c) => c.gio_xuat_phat), ['07:00', '12:45', '12:55', '19:45', '22:00']);
  assert.deepEqual(L.chuyenTrongNgay(LICH, BCVH.HUONG_THUY, '2026-10-25').map((c) => c.gio_xuat_phat), ['07:30']);
  assert.deepEqual(L.chuyenTrongNgay(LICH, BCVH.HUONG_THUY, '2026-10-24').map((c) => c.gio_xuat_phat), ['07:30', '12:45']);
  assert.deepEqual(L.chuyenTrongNgay([dong(BCVH.A_LUOI, '08:00', 'CA_TUAN', { dang_dung: 0 })], BCVH.A_LUOI, '2026-10-26'), []);
  assert.deepEqual(L.chuyenTrongNgay(LICH, BCVH.THUAN_HOA, '2026-02-30'), []);
  assert.deepEqual(L.chuyenTrongNgay(LICH, '999999', '2026-10-26'), []);
  assert.equal(L.chuyenTrongNgay(LICH, BCVH.A_LUOI, '2026-10-26', { hanDenTruocChuyenPhut: 15 })[0].han_den_luc, '2026-10-26 07:45:00');
});

// ---------- đánh giá đi chuyến ----------
const CHUYEN = xep(BCVH.THUAN_HOA, '2026-10-26 06:00:00').chuyen; // 07:00 ngày 26/10
test('danhGiaDiChuyen: có BD10 đi — đúng giờ rời KTT là DUNG_CHUYEN, sau 1 giây là TRUOT_CHUYEN', () => {
  assert.deepEqual(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 07:00:00', gioDen: '2026-10-26 06:00:00' }), { trang_thai: 'DUNG_CHUYEN', di_truoc_khi_den: false });
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 06:59:59', gioDen: '2026-10-26 06:00:00' }).trang_thai, 'DUNG_CHUYEN');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 07:00:01', gioDen: '2026-10-26 06:00:00' }).trang_thai, 'TRUOT_CHUYEN');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 07:00:00.900' }).trang_thai, 'DUNG_CHUYEN', 'ms bị cắt');
});
test('danhGiaDiChuyen: chưa có BD10 đi — CHUA_DEN_GIO nếu bayGio ≤ giờ rời, LO_CHUYEN nếu đã qua; bayGio là tham số', () => {
  for (const bd of [null, undefined, '']) {
    assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: bd, bayGio: '2026-10-26 07:00:00' }).trang_thai, 'CHUA_DEN_GIO');
    assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: bd, bayGio: '2026-10-26 07:00:01' }).trang_thai, 'LO_CHUYEN');
  }
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, bayGio: '2026-10-25 23:00:00' }).trang_thai, 'CHUA_DEN_GIO');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, bayGio: '2026-10-27 01:00:00' }).trang_thai, 'LO_CHUYEN');
});
test('danhGiaDiChuyen: lập BD10 trước giờ quét đến -> cờ di_truoc_khi_den (chỉ gắn cờ, vẫn đánh giá đúng / trượt chuyến)', () => {
  const a = L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 05:00:00', gioDen: '2026-10-26 05:30:00' });
  assert.deepEqual(a, { trang_thai: 'DUNG_CHUYEN', di_truoc_khi_den: true });
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 05:30:00', gioDen: '2026-10-26 05:30:00' }).di_truoc_khi_den, false, 'bằng giờ đến: chưa phải «trước»');
  const t = L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 08:00:00', gioDen: '2026-10-26 09:00:00' });
  assert.deepEqual(t, { trang_thai: 'TRUOT_CHUYEN', di_truoc_khi_den: true });
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: '2026-10-26 05:00:00' }).di_truoc_khi_den, false, 'không có gioDen: không gắn cờ');
});
test('danhGiaDiChuyen: đầu vào sai trả trang_thai null + ly_do, không ném lỗi', () => {
  assert.equal(L.danhGiaDiChuyen({}).ly_do, 'CHUYEN_SAI');
  assert.equal(L.danhGiaDiChuyen().ly_do, 'CHUYEN_SAI');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, gioLapBd10Di: 'abc' }).ly_do, 'GIO_BD10_SAI');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN }).ly_do, 'THIEU_BAY_GIO');
  assert.equal(L.danhGiaDiChuyen({ chuyen: CHUYEN, bayGio: '2026-02-30 00:00:00' }).ly_do, 'BAY_GIO_SAI');
});

// ---------- hàm thuần ----------
test('hàm thuần: không đổi đầu vào (lich, chuyen); cùng đầu vào cho cùng kết quả', () => {
  const lich = JSON.parse(JSON.stringify(LICH));
  const chuyen = { ...CHUYEN };
  const a = L.xepChuyen(lich, BCVH.THUAN_HOA, '2026-10-26 11:40:00');
  const b = L.xepChuyen(lich, BCVH.THUAN_HOA, '2026-10-26 11:40:00');
  L.chuyenTrongNgay(lich, BCVH.THUAN_HOA, '2026-10-26'); L.danhGiaDiChuyen({ chuyen, gioLapBd10Di: '2026-10-26 08:00:00' });
  assert.deepEqual(lich, LICH); assert.deepEqual(chuyen, CHUYEN); assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(L.MA_BCVH_HUE)); assert.equal(L.MA_BCVH_HUE.length, 6);
});

test('kiểm tĩnh mã nguồn kttLichChuyen.js: không new Date(chuỗi), không Date.parse, không Date.now, không đọc giờ máy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'kttLichChuyen.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/Date\.parse|Date\.now|new Date\(\s*\)|performance\.now|process\.hrtime/.test(src));
  for (const m of src.matchAll(/new Date\(([^;\n]*)/g)) assert.match(m[1], /^(Date\.UTC\(|ms\)|gocNgay\()/, `new Date( không an toàn: ${m[0].slice(0, 60)}`);
  assert.ok(!/require\(['"]\.\/(db|sqlite)/.test(src));
});

test('TZ: cùng kết quả ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (xếp chuyến qua đêm / Chủ nhật / 29/02 / cuối năm, đánh giá, DB tạm)', () => {
  const script = `
    const Database = require('better-sqlite3');
    const S = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttSchema.js'))});
    const L = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'lib', 'kttLichChuyen.js'))});
    const db = new Database(':memory:'); S.ensureKttSchema(db);
    const { lich } = L.docLichChuyen(db);
    const out = [];
    for (const [ma, g] of [['536250', '2026-10-24 13:00:00'], ['533140', '2026-10-25 11:40:00'], ['533140', '2026-10-26 21:30:00'], ['533140', '2028-02-29 21:30:00'], ['533140', '2026-12-31 23:59:59'], ['535470', '2027-03-28 02:00:00'], ['537220', '2026-03-29 01:30:00']]) out.push(L.xepChuyen(lich, ma, g));
    const c = L.xepChuyen(lich, '533140', '2026-10-26 06:00:00').chuyen;
    out.push(L.danhGiaDiChuyen({ chuyen: c, gioLapBd10Di: '2026-10-26 07:00:01', gioDen: '2026-10-26 06:00:00' }), L.danhGiaDiChuyen({ chuyen: c, bayGio: '2026-10-26 06:59:59' }));
    out.push(L.chuyenTrongNgay(lich, '533140', '2026-10-25'));
    out.push(L.lapNgayNghi(lich, '536250', '2026-10-25 13:00:00'), L.bcvhChuaXacNhanChuNhat(lich));
    process.stdout.write(JSON.stringify(out));
  `;
  const kq = ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'].map((tz) => {
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    return r.stdout;
  });
  assert.equal(kq[0], kq[1]); assert.equal(kq[1], kq[2]);
  const d = JSON.parse(kq[0]);
  assert.equal(`${d[0].chuyen.ngay} ${d[0].chuyen.gio_xuat_phat}`, '2026-10-25 07:30');
  assert.equal(`${d[1].chuyen.ngay} ${d[1].chuyen.gio_xuat_phat}`, '2026-10-25 12:45');
  assert.equal(`${d[3].chuyen.ngay} ${d[3].chuyen.gio_xuat_phat}`, '2028-03-01 07:00');
  assert.equal(`${d[4].chuyen.ngay} ${d[4].chuyen.gio_xuat_phat}`, '2027-01-01 07:00');
  assert.equal(d[7].trang_thai, 'TRUOT_CHUYEN'); assert.equal(d[8].trang_thai, 'CHUA_DEN_GIO');
  assert.equal(d[9].length, 5); assert.equal(d[10], true); assert.deepEqual(d[11], []);
});
