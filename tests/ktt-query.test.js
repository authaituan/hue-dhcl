// ==========================================
// Test KTT-5: server/lib/kttQuery.js (truy vấn tổng hợp «Hàng tại KTT») + bảng ktt_dia_ban_phat (kttSchema.js).
// DB tạm (trong bộ nhớ; file tạm cho ca «chỉ đọc») + ensureKttSchema, dữ liệu GIẢ (SHBG giả, mã BD10 giả). Không mở data/, không dùng server, không dùng DB thật.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { ensureKttSchema, DIA_BAN_PHAT_MAC_DINH } = require('../server/lib/kttSchema');
const Q = require('../server/lib/kttQuery');

const KTT_QUERY = path.join(__dirname, '..', 'server', 'lib', 'kttQuery.js');
const KTT_SCHEMA = path.join(__dirname, '..', 'server', 'lib', 'kttSchema.js');
const BAY_GIO = '2026-10-23 10:00:00';
const OPT = { tuNgay: '2026-10-20', denNgay: '2026-10-20', bayGio: BAY_GIO };

// ---------- đồ dùng dựng dữ liệu giả ----------
let seq = 0;
function dbMoi(duongDan = ':memory:') {
  const db = new Database(duongDan);
  ensureKttSchema(db);
  return db;
}
function them(db, bang, o) {
  const k = Object.keys(o);
  db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o));
}
const NGUON = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(db, o = {}) {
  seq++;
  const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NGUON, ...o };
  them(db, 'ktt_tui', r);
  return r;
}
function buuGui(db, t, shbg, o = {}) {
  them(db, 'ktt_buu_gui', {
    from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index,
    shbg, khoi_luong_thuc_te_g: 100, ...NGUON, ...o
  });
}
/** Túi ĐẾN (mở rồi đóng sang túi đi) cùng các SHBG; `quet` = mã 4. */
function tuiDen(db, { quet, xndBd10 = null, shbgs = [], phuong = '49122', xnd = null, gam = 100, luong = 'KHAI_THAC_DEN', moTui = 1, bd10 = 'BD10-DEN-1', kg = null }) {
  const t = tui(db, { chieu: 'DEN', luong, co_mo_tui: moTui, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xndBd10, khoi_luong_tui_kg: kg });
  for (const s of shbgs) buuGui(db, t, s, { ma_xa_phuong: phuong, ti_xac_nhan_den_luc: xnd, khoi_luong_thuc_te_g: gam });
  return t;
}
/** Túi ĐI (khai thác lại) cùng các SHBG. `nhan` = mã nơi nhận của BD10 đi. */
function tuiDi(db, { gioDi, nhan = null, shbgs = [], bd10 = 'BD10-DI-1', phuong = '49122', gam = 100 }) {
  const t = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan ? bd10 : null, bd10_di_ma_diem_nhan: nhan });
  for (const s of shbgs) buuGui(db, t, s, { ma_xa_phuong: phuong, khoi_luong_thuc_te_g: gam });
  return t;
}
/** Túi CHUYỂN TIẾP ĐI (đã chia sẵn, không mở). */
function tuiCtd(db, { quet, gioDi = null, nhan = null, toPos = null, quetDi = null, bd10 = null, luong = 'DI_NGOAI', shbgs = [], kg = null }) {
  const t = tui(db, {
    chieu: 'CHUYEN_TIEP_DI', luong, to_pos: toPos || nhan || '999003', gio_quet_tui_den: quet, bd10_di_gio_di: gioDi, bd10_di_so_hieu: bd10 || (gioDi ? 'BD10-CTD-1' : null),
    bd10_di_ma_diem_nhan: nhan, gio_quet_tui_di: quetDi, khoi_luong_tui_kg: kg
  });
  for (const s of shbgs) buuGui(db, t, s, { ma_xa_phuong: '49122' });
  return t;
}
/** Một SHBG khai thác lại: túi đến (+ túi đi nếu có `gioDi`). */
function khaiThac(db, shbg, { quet, gioDi = null, nhan = '533140', xnd, phuong = '49122', gam = 100, xndBd10 = null }) {
  tuiDen(db, { quet, shbgs: [shbg], phuong, xnd: xnd === undefined ? quet : xnd, gam, xndBd10 }); // xnd bỏ trống = bằng giờ quét đến; truyền null = chưa xác nhận đến
  if (gioDi || nhan) tuiDi(db, { gioDi, nhan, shbgs: [shbg], phuong, gam });
}
const dong = (kq, loc) => kq.filter((x) => Object.entries(loc).every(([k, v]) => x[k] === v));

// ==========================================
// Bảng địa bàn phát
// ==========================================
test('địa bàn phát: đủ 40 dòng (5/8/10/7/3/7 theo BCVH), chạy lại không nhân đôi, sửa tay không bị ghi đè', () => {
  const db = dbMoi();
  const dem = () => db.prepare('SELECT COUNT(*) n FROM ktt_dia_ban_phat').get().n;
  assert.equal(dem(), 40);
  const theo = Object.fromEntries(db.prepare('SELECT ma_bcvh, COUNT(*) n FROM ktt_dia_ban_phat GROUP BY ma_bcvh').all().map((r) => [r.ma_bcvh, r.n]));
  assert.deepEqual(theo, { 535790: 5, 536250: 8, 535470: 10, 537220: 7, 537015: 3, 533140: 7 });
  assert.equal(DIA_BAN_PHAT_MAC_DINH.reduce((s, b) => s + b[2].length, 0), 40);
  assert.equal(db.prepare("SELECT ten_phuong_xa, ma_bcvh, ten_bcvh FROM ktt_dia_ban_phat WHERE ma_phuong_xa = '49135'").get().ma_bcvh, '533140');
  assert.equal(db.prepare("SELECT ma_bcvh FROM ktt_dia_ban_phat WHERE ma_phuong_xa = '49133'").get().ma_bcvh, '533140');
  assert.equal(db.prepare("SELECT ten_phuong_xa FROM ktt_dia_ban_phat WHERE ma_phuong_xa = '49325'").get().ten_phuong_xa, 'Phường Phong Dinh'); // giữ chính tả theo ticket
  ensureKttSchema(db);
  ensureKttSchema(db);
  assert.equal(dem(), 40);
  db.prepare("UPDATE ktt_dia_ban_phat SET ten_phuong_xa = 'Tên đã sửa tay', ma_bcvh = '536250' WHERE ma_phuong_xa = '49122'").run();
  ensureKttSchema(db);
  assert.deepEqual(db.prepare("SELECT ten_phuong_xa, ma_bcvh FROM ktt_dia_ban_phat WHERE ma_phuong_xa = '49122'").get(), { ten_phuong_xa: 'Tên đã sửa tay', ma_bcvh: '536250' });
  assert.equal(dem(), 40);
  assert.throws(() => db.prepare("INSERT INTO ktt_dia_ban_phat VALUES ('49122', 'x', '533140', 'y')").run(), /UNIQUE/);
  db.close();
});

test('không bảng KTT nào bị thêm cột: ktt_tui / ktt_buu_gui đúng bảng ánh xạ cột của KTT-2', () => {
  const db = dbMoi();
  const cot = (b) => db.prepare(`PRAGMA table_info(${b})`).all().map((c) => c.name);
  const { COT_TUI, COT_BUU_GUI } = require('../server/lib/kttSchema');
  assert.deepEqual(cot('ktt_tui').sort(), ['id', ...COT_TUI.map((c) => c.db), 'nap_lan_id', 'cap_nhat_luc'].sort()); // đúng 47 cột nguồn + id + hai cột hệ thống: không cột mới
  assert.deepEqual(cot('ktt_buu_gui').sort(), ['id', ...COT_BUU_GUI.map((c) => c.db), 'nap_lan_id', 'cap_nhat_luc'].sort());
  assert.deepEqual(cot('ktt_dia_ban_phat'), ['ma_phuong_xa', 'ten_phuong_xa', 'ma_bcvh', 'ten_bcvh']);
  assert.ok(!cot('ktt_tui').some((c) => /(^|_)(treo|nam_lau|tre_chuyen)(_|$)/.test(c)), 'không lưu nhãn tính toán');
  db.close();
});

// ==========================================
// Sản lượng
// ==========================================
test('sản lượng: một SHBG ở túi đến và túi đi vẫn tính MỘT lần ở mỗi chiều; khối lượng gam; hai túi đến cùng SHBG cùng ngày = 1 SHBG, 2 túi', () => {
  const db = dbMoi();
  tuiDen(db, { quet: '2026-10-20 08:00:00', shbgs: ['SHBG-A', 'SHBG-B'], gam: 150, kg: 1.5 });
  tuiDen(db, { quet: '2026-10-20 09:00:00', shbgs: ['SHBG-A'], gam: 150, kg: 0.5 }); // SHBG-A xuất hiện ở túi đến thứ hai cùng ngày
  tuiDi(db, { gioDi: '2026-10-20 14:00:00', nhan: '533140', shbgs: ['SHBG-A', 'SHBG-B'], gam: 150 });
  const kq = Q.sanLuongTheoNgay(db, OPT);
  const den = dong(kq.theoNgay, { chieu: 'DEN' });
  assert.equal(den.length, 1);
  assert.deepEqual({ tui: den[0].tui, shbg: den[0].shbg, g: den[0].khoiLuongGam }, { tui: 2, shbg: 2, g: 300 });
  const di = dong(kq.theoNgay, { chieu: 'DI' });
  assert.deepEqual({ tui: di[0].tui, shbg: di[0].shbg, g: di[0].khoiLuongGam, nhom: di[0].nhom }, { tui: 1, shbg: 2, g: 300, nhom: 'BCVH_HUE' });
  assert.deepEqual(dong(kq.tong, { chieu: 'DEN' }).map((x) => [x.tui, x.shbg, x.khoiLuongGam, x.khoiLuongTuiKg]), [[2, 2, 300, 2]]);
  assert.equal(kq.tongCong.DEN.shbg, 2);
  assert.equal(kq.tongCong.DI.shbg, 2);
  db.close();
});

test('sản lượng: túi KHÔNG có dòng bưu gửi vẫn được đếm (shbg 0, gam 0, kg túi); túi chuyển tiếp đi tính ở mức túi, theo giờ đi', () => {
  const db = dbMoi();
  tuiDen(db, { quet: '2026-10-20 08:00:00', shbgs: [], kg: 3 });
  tuiCtd(db, { quet: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:00:00', nhan: '535470', kg: 12.5 });
  tuiCtd(db, { quet: '2026-10-19 23:00:00', gioDi: '2026-10-20 07:00:00', nhan: '535470', kg: 7.5 }); // đến hôm trước, đi trong ngày: tính theo giờ đi
  tuiCtd(db, { quet: '2026-10-20 06:10:00', gioDi: null, nhan: null, toPos: '535470' }); // chưa đi: không vào sản lượng ĐI
  const kq = Q.sanLuongTheoNgay(db, OPT);
  assert.deepEqual(dong(kq.theoNgay, { chieu: 'DEN' }).map((x) => [x.tui, x.shbg, x.khoiLuongGam]), [[1, 0, 0]]);
  const ctd = dong(kq.theoNgay, { chieu: 'CHUYEN_TIEP_DI' });
  assert.deepEqual(ctd.map((x) => [x.nhom, x.tui, x.shbg]), [['BCVH_HUE', 2, 0]]);
  assert.equal(dong(kq.tong, { chieu: 'CHUYEN_TIEP_DI' })[0].khoiLuongTuiKg, 20);
  assert.equal(dong(kq.tong, { chieu: 'DEN' })[0].khoiLuongTuiKg, 3);
  db.close();
});

test('sản lượng: ngày ĐẾN theo mã quét đến (không có thì XND BD10 đến), ngày ĐI theo giờ đi; khoảng ngày gồm cả hai đầu', () => {
  const db = dbMoi();
  tuiDen(db, { quet: '2026-10-19 23:59:59', shbgs: ['S-19'] }); // ngoài (hôm trước)
  tuiDen(db, { quet: '2026-10-20 00:00:00', shbgs: ['S-20'] }); // đầu khoảng
  tuiDen(db, { quet: null, xndBd10: '2026-10-21 23:59:59', shbgs: ['S-21'] }); // không có mã 4: theo XND BD10 đến
  tuiDen(db, { quet: '2026-10-22 00:00:00', shbgs: ['S-22'] }); // ngoài (sau)
  tuiDi(db, { gioDi: '2026-10-21 12:00:00', nhan: '533140', shbgs: ['S-20'] });
  const kq = Q.sanLuongTheoNgay(db, { tuNgay: '2026-10-20', denNgay: '2026-10-21', bayGio: BAY_GIO });
  assert.deepEqual(dong(kq.tong, { chieu: 'DEN' }).map((x) => [x.ngay, x.shbg]), [['2026-10-20', 1], ['2026-10-21', 1]]);
  assert.deepEqual(dong(kq.tong, { chieu: 'DI' }).map((x) => [x.ngay, x.shbg]), [['2026-10-21', 1]]);
  db.close();
});

test('sản lượng: nhóm đích theo từng SHBG — BD10 đi nhận; chưa có thì phường/xã tra ktt_dia_ban_phat; không tra được thì KHONG_RO', () => {
  const db = dbMoi();
  khaiThac(db, 'S-BD10', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 14:00:00', nhan: '535470', phuong: '49122' }); // BD10 nhận 535470 thắng phường 49122
  tuiDen(db, { quet: '2026-10-20 08:05:00', shbgs: ['S-PX'], phuong: '49133' }); // chưa vào BD10 đi: 49133 -> 533140
  tuiDen(db, { quet: '2026-10-20 08:10:00', shbgs: ['S-LA'], phuong: '00000' }); // không tra được
  tuiDen(db, { quet: '2026-10-20 08:15:00', shbgs: ['S-HE1'], phuong: '49122' });
  tuiDi(db, { gioDi: '2026-10-20 15:00:00', nhan: '530900', shbgs: ['S-HE1'] }); // vào BD10 đi nhận 530900
  tuiDen(db, { quet: '2026-10-20 08:20:00', shbgs: ['S-KHAC'] });
  tuiDi(db, { gioDi: '2026-10-20 15:00:00', nhan: '700123', shbgs: ['S-KHAC'] });
  const kq = Q.sanLuongTheoNgay(db, OPT);
  const nhom = Object.fromEntries(dong(kq.theoNgay, { chieu: 'DEN' }).map((x) => [x.nhom, x.shbg]));
  assert.deepEqual(nhom, { BCVH_HUE: 2, KHONG_RO: 1, HE1_530900: 1, KHAC: 1 });
  db.close();
});

// ==========================================
// Chuyến
// ==========================================
test('chuyến (SHBG khai thác lại, như ví dụ KTT-4): đúng chuyến, trễ chuyến (2 chuyến), lỡ chuyến, chưa đến mốc; chỉ BCVH Huế', () => {
  const db = dbMoi();
  khaiThac(db, 'S-TRE', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' }); // chuyến TỐI 22:30 → đi 07:45 hôm sau = trễ 2 mốc
  khaiThac(db, 'S-DUNG', { quet: '2026-10-20 06:50:00', gioDi: '2026-10-20 07:20:00' }); // SÁNG 07:30 (chốt 07:00), đi 07:20
  khaiThac(db, 'S-LO', { quet: '2026-10-20 13:10:00', nhan: null, xnd: '2026-10-20 13:10:00', phuong: '49122' }); // chưa đi, chuyến TRƯA 14:00
  const kq = Q.chuyenTheoBcvh(db, OPT);
  const tren = dong(kq.theoBcvhChuyen, { maBcvh: '533140', nguon: 'KHAI_THAC_LAI' });
  const so = (ten, tt) => tren.filter((x) => x.chuyen === ten).reduce((s, x) => s + x[tt], 0);
  assert.equal(so('TOI', 'TRE_CHUYEN'), 1);
  assert.equal(tren.find((x) => x.chuyen === 'TOI').soChuyenTre, 2);
  assert.equal(so('SANG', 'DUNG_CHUYEN'), 1);
  assert.equal(so('TRUA', 'LO_CHUYEN'), 1);
  assert.equal(tren.find((x) => x.chuyen === 'TRUA').soChuyenTre, 9); // 14:00, 22:30 (20/10), 3 mốc 21/10, 3 mốc 22/10, 07:30 23/10
  assert.equal(tren.reduce((s, x) => s + x.tong, 0), 3);
  assert.ok(tren.every((x) => x.donVi === 'SHBG'));
  // bayGio sớm: chưa đến mốc
  const som = Q.chuyenTheoBcvh(db, { ...OPT, bayGio: '2026-10-20 12:00:00' });
  assert.equal(dong(som.theoBcvhChuyen, { chuyen: 'TRUA' })[0].CHUA_DEN_MOC, 1);
  assert.equal(dong(som.theoBcvhChuyen, { chuyen: 'TRUA' })[0].LO_CHUYEN, 0);
  db.close();
});

test('chuyến (túi chuyển tiếp đi, mức túi): theo mốc từng BCVH; đích 530900 không chấm; đích KHAC không chấm chuyến', () => {
  const db = dbMoi();
  tuiCtd(db, { quet: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:00:00', nhan: '535470' }); // SÁNG 07:00 (chốt 06:30) → đúng
  tuiCtd(db, { quet: '2026-10-20 06:45:00', gioDi: '2026-10-20 12:30:00', nhan: '535470' }); // lỡ SÁNG (sát giờ), đi 12:30 kịp TRƯA
  tuiCtd(db, { quet: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:00:00', nhan: '530900' }); // hệ 1: không chấm
  tuiCtd(db, { quet: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:00:00', nhan: '700123' }); // KHAC: không chấm chuyến
  tuiCtd(db, { quet: '2026-10-20 06:00:00', gioDi: null, toPos: '530900' }); // hệ 1 chưa đi: không chấm, không treo
  const kq = Q.chuyenTheoBcvh(db, OPT);
  assert.deepEqual(kq.theoBcvhChuyen.map((x) => [x.maBcvh, x.nguon, x.donVi]), [['535470', 'CHUYEN_TIEP_DI', 'TUI'], ['535470', 'CHUYEN_TIEP_DI', 'TUI']]);
  const sang = dong(kq.theoBcvhChuyen, { chuyen: 'SANG' })[0];
  const trua = dong(kq.theoBcvhChuyen, { chuyen: 'TRUA' })[0];
  assert.deepEqual([sang.tong, sang.DUNG_CHUYEN], [1, 1]);
  assert.deepEqual([trua.tong, trua.DUNG_CHUYEN], [1, 1]); // đi 12:30 ≤ mốc dự kiến 12:30 → đúng chuyến dự kiến (TRƯA)
  assert.deepEqual(kq.denSatGio.map((x) => [x.maBcvh, x.chuyen, x.nguon, x.soDenSatGio, x.kipChuyenSat, x.sangChuyenKe]), [['535470', 'SANG', 'CHUYEN_TIEP_DI', 1, 0, 1]]);
  db.close();
});

test('«đến sát giờ»: số đến sát giờ, bao nhiêu kipChuyenSat, bao nhiêu sang chuyến kế, bao nhiêu chưa đi', () => {
  const db = dbMoi();
  khaiThac(db, 'S-KIP', { quet: '2026-10-20 07:10:00', gioDi: '2026-10-20 07:25:00' }); // sát giờ SÁNG 07:30, đi 07:25 → kịp
  khaiThac(db, 'S-SANG', { quet: '2026-10-20 07:20:00', gioDi: '2026-10-20 08:00:00' }); // sát giờ, đi sau mốc → sang chuyến kế
  khaiThac(db, 'S-CHUA', { quet: '2026-10-20 07:05:00', nhan: null, phuong: '49122' }); // sát giờ, chưa đi
  khaiThac(db, 'S-XA', { quet: '2026-10-20 06:50:00', gioDi: '2026-10-20 07:20:00' }); // trước vùng sát giờ
  const kq = Q.chuyenTheoBcvh(db, OPT);
  assert.deepEqual(kq.denSatGio.map((x) => [x.maBcvh, x.chuyen, x.soDenSatGio, x.kipChuyenSat, x.sangChuyenKe, x.chuaDi]), [['533140', 'SANG', 3, 1, 1, 1]]);
  assert.deepEqual(kq.chotTruocPhut, [30]);
  assert.deepEqual(dong(kq.theoGioQuetDen, { gio: 7, chuyen: 'TRUA' }).map((x) => x.tong), [3]);
  assert.deepEqual(dong(kq.theoGioQuetDen, { gio: 6, chuyen: 'SANG' }).map((x) => [x.tong, x.dungChuyen]), [[1, 1]]);
  db.close();
});

test('hàng qua KTT hai lần: dùng lần đi cuối (ghép túi đến muộn nhất không sau giờ đi cuối); lần đến đầu không vào chuyến', () => {
  const db = dbMoi();
  khaiThac(db, 'S-2LAN', { quet: '2026-10-10 06:50:00', gioDi: '2026-10-10 07:20:00' }); // lần 1: đúng chuyến
  khaiThac(db, 'S-2LAN', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' }); // lần 2 (cuối): trễ 2 chuyến
  const kq = Q.chuyenTheoBcvh(db, { tuNgay: '2026-10-10', denNgay: '2026-10-21', bayGio: BAY_GIO });
  assert.deepEqual(kq.theoBcvhChuyen.map((x) => [x.ngay, x.chuyen, x.tong, x.TRE_CHUYEN]), [['2026-10-20', 'TOI', 1, 1]]);
  // sản lượng vẫn đếm cả hai lượt đến (đếm sự kiện), mỗi chiều mỗi ngày một lần
  const sl = Q.sanLuongTheoNgay(db, { tuNgay: '2026-10-10', denNgay: '2026-10-21', bayGio: BAY_GIO });
  assert.deepEqual(dong(sl.tong, { chieu: 'DEN' }).map((x) => [x.ngay, x.shbg]), [['2026-10-10', 1], ['2026-10-20', 1]]);
  db.close();
});

test('hai mốc cách nhau quá 7 ngày: «Cần kiểm tra lại», không vào chuyến / nằm lâu / F1.3 chính', () => {
  const db = dbMoi();
  khaiThac(db, 'S-XA', { quet: '2026-10-10 08:00:00', gioDi: '2026-10-20 08:00:00' }); // > 7 ngày
  khaiThac(db, 'S-GAN', { quet: '2026-10-10 08:00:00', gioDi: '2026-10-17 08:00:00' }); // đúng 7 ngày: vẫn xét
  tuiCtd(db, { quet: '2026-10-10 06:00:00', gioDi: '2026-10-19 07:00:00', nhan: '535470' });
  const o = { tuNgay: '2026-10-10', denNgay: '2026-10-10', bayGio: BAY_GIO };
  const ch = Q.chuyenTheoBcvh(db, o);
  assert.equal(ch.theoBcvhChuyen.reduce((s, x) => s + x.tong, 0), 1); // chỉ S-GAN
  assert.equal(dong(ch.theoBcvhChuyen, { nguon: 'CHUYEN_TIEP_DI' }).length, 0);
  const nl = Q.namLauTheoBac(db, o);
  assert.equal(nl.theoBac.reduce((s, x) => s + x.soDon, 0), 1);
  const f = Q.chiTieuF13(db, o);
  assert.equal(f.tongCong.CAN_KIEM_TRA_LAI, 1);
  assert.equal(f.tongCong.soDoDuoc + f.tongCong.XND_SAU_GIO_DI, 1);
  const ct = Q.chiTiet(db, { ...o, loai: 'can_kiem_tra_lai' });
  assert.deepEqual(ct.dong.map((x) => [x.donVi, x.shbg]).sort(), [['SHBG', 'S-XA'], ['TUI', null]]);
  const th = Q.tongHopKtt(db, o);
  assert.equal(th.chatLuongDuLieu.shbgCanKiemTraLai, 1);
  assert.equal(th.chatLuongDuLieu.tuiCanKiemTraLai, 1);
  assert.ok(th.canhBao.some((c) => /7 ngày/.test(c)));
  db.close();
});

// ==========================================
// Treo, nằm lâu
// ==========================================
test('treo: CHUA_QUET_DI và CHUA_MO_TUI theo nhóm đích × bậc tuổi; kèm tổng túi và SHBG; hàng đã xử lý / chưa quá ngưỡng / hệ 1 không tính', () => {
  const db = dbMoi();
  tuiCtd(db, { quet: '2026-10-20 06:00:00', nhan: '535470', shbgs: ['S1', 'S2'] }); // chưa mã 3, chưa BD10 đi: treo, tuổi > 3 ngày
  tuiCtd(db, { quet: '2026-10-20 07:00:00', toPos: '535470', quetDi: '2026-10-20 08:00:00' }); // có mã 3: không treo
  tuiCtd(db, { quet: '2026-10-20 07:00:00', toPos: '530900' }); // hệ 1: không xét
  tuiDen(db, { quet: '2026-10-22 20:00:00', moTui: 0, shbgs: ['S3', 'S4', 'S5'], luong: 'DI_NGOAI' }); // chưa mở túi (mọi luồng), 14 giờ
  tuiDen(db, { quet: '2026-10-23 08:30:00', moTui: 0, shbgs: ['S6'] }); // 1,5 giờ: chưa đến ngưỡng
  tuiDen(db, { quet: '2026-10-22 09:00:00', moTui: 1, shbgs: ['S7'] }); // đã mở: không treo
  const kq = Q.tonTreo(db, { tuNgay: '2026-10-20', denNgay: '2026-10-23', bayGio: BAY_GIO });
  assert.deepEqual(kq.tong, { tui: 2, shbg: 5 });
  assert.deepEqual(kq.theoLoai.map((x) => [x.loai, x.nhom, x.tuoi, x.tui, x.shbg]), [
    ['CHUA_MO_TUI', 'KTT', 'T_12_24H', 1, 3],
    ['CHUA_QUET_DI', 'BCVH_HUE', 'T_TREN_3N', 1, 2]
  ]);
  assert.deepEqual(kq.theoBcvh.map((x) => [x.maBcvh, x.tui]), [['535470', 1], ['KHONG_RO_BCVH', 1]]);
  assert.equal(kq.chuaDenNguong, 1);
  assert.equal(kq.treoPhut, 180);
  const hom = dong(kq.theoNgay, { ngay: '2026-10-20' })[0];
  assert.deepEqual([hom.tong, hom.treo], [3 - 1, 1]); // hệ 1 không nằm trong số túi xét: còn 2 túi, 1 treo
  db.close();
});

test('nằm lâu: phân bố bậc tách luồng và ngày/đêm của giờ quét đến; QUA_NGUONG không trễ chuyến; kèm số NAM_LAU', () => {
  const db = dbMoi();
  // BCVH 535790 chỉ có chuyến SÁNG 08:30 (chốt 08:00): quét 08:01 → chuyến 21/10 08:30; đi đúng giờ đó = 24 giờ 29 phút nằm → QUA_NGUONG, đúng chuyến
  khaiThac(db, 'S-LAU', { quet: '2026-10-20 08:01:00', gioDi: '2026-10-21 08:30:00', nhan: '535790' });
  // quét 06:00 (ban ngày? 06:00 < 07:00 → ĐÊM), đi 07:20 đúng chuyến SÁNG 533140 07:30 → nằm 1h20 → bậc A, không nằm lâu
  khaiThac(db, 'S-NHANH', { quet: '2026-10-20 06:00:00', gioDi: '2026-10-20 07:20:00' });
  // trễ chuyến (TRE_CHUYEN) → NAM_LAU lý do TRE_CHUYEN, bậc D (16 giờ)
  khaiThac(db, 'S-TRE', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' });
  // đích KHAC: có giờ nằm, không đánh giá NAM_LAU
  tuiCtd(db, { quet: '2026-10-20 10:00:00', gioDi: '2026-10-22 10:00:00', nhan: '700123' });
  const kq = Q.namLauTheoBac(db, OPT);
  const tr = (loc) => dong(kq.theoBac, loc);
  assert.deepEqual(tr({ nhom: 'BCVH_HUE', bac: 'E_TREN_24H' }).map((x) => [x.nguon, x.caQuet, x.soDon, x.namLau, x.namLauQuaNguong]), [['KHAI_THAC_LAI', 'NGAY', 1, 1, 1]]);
  assert.deepEqual(tr({ nhom: 'BCVH_HUE', bac: 'A_DEN_3H' }).map((x) => [x.caQuet, x.soDon, x.namLau]), [['DEM', 1, 0]]);
  assert.deepEqual(tr({ nhom: 'BCVH_HUE', bac: 'D_12_24H' }).map((x) => [x.caQuet, x.namLau, x.namLauTreChuyen]), [['NGAY', 1, 1]]);
  assert.deepEqual(tr({ nhom: 'KHAC' }).map((x) => [x.nguon, x.bac, x.soDon, x.namLau]), [['CHUYEN_TIEP_DI', 'E_TREN_24H', 1, 0]]);
  assert.deepEqual(kq.tongNguon.KHAI_THAC_LAI, { donVi: 'SHBG', daDi: 3, daDiBcvhHue: 3, namLau: 2 });
  assert.deepEqual(kq.tongNguon.CHUYEN_TIEP_DI, { donVi: 'TUI', daDi: 1, daDiBcvhHue: 0, namLau: 0 });
  // chưa đi: không vào phân bố nằm lâu
  khaiThac(db, 'S-CHUA', { quet: '2026-10-20 08:00:00', nhan: null });
  assert.equal(Q.namLauTheoBac(db, OPT).tongNguon.KHAI_THAC_LAI.daDi, 3);
  db.close();
});

// ==========================================
// Chỉ tiêu F1.3
// ==========================================
test('F1.3: số âm hiện đúng nhóm XND_SAU_GIO_DI (không làm tròn về 0); quỹ âm (quá chỉ tiêu) ở dải âm; KHONG_RO không chấm; chưa XNĐ riêng', () => {
  const db = dbMoi();
  khaiThac(db, 'S-OK', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 10:00:00', xnd: '2026-10-20 08:30:00' }); // 1,5 giờ → quỹ còn > 6 giờ
  khaiThac(db, 'S-SAU', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 10:00:00', xnd: '2026-10-20 11:00:00' }); // XNĐ sau giờ đi
  khaiThac(db, 'S-QUA', { quet: '2026-10-20 08:00:00', nhan: null, xnd: '2026-10-20 08:00:00', phuong: '49122' }); // chưa đi, đến bayGio 23/10: vượt chỉ tiêu
  khaiThac(db, 'S-CHUAXN', { quet: '2026-10-20 08:00:00', gioDi: '2026-10-20 10:00:00', xnd: null });
  khaiThac(db, 'S-LA', { quet: '2026-10-20 08:00:00', nhan: null, phuong: '00000', xnd: '2026-10-20 08:00:00' }); // KHONG_RO
  const kq = Q.chiTieuF13(db, OPT);
  assert.equal(kq.theoBcvh.length, 1);
  const b = kq.theoBcvh[0];
  assert.equal(b.maBcvh, '533140');
  assert.deepEqual([b.tong, b.soDoDuoc, b.XND_SAU_GIO_DI, b.CHUA_XAC_NHAN_DEN, b.CAN_KIEM_TRA_LAI], [4, 2, 1, 1, 0]);
  assert.deepEqual(b.quy, { AM: 1, T0_2H: 0, T2_6H: 0, TREN_6H: 1 });
  const ct = Q.chiTiet(db, { ...OPT, loai: 'xnd_sau_gio_di' });
  assert.deepEqual(ct.dong.map((x) => [x.shbg, x.trangThaiF13, x.conLaiGiay]), [['S-SAU', 'XND_SAU_GIO_DI', null]]); // không phải 0
  const kr = Q.chiTiet(db, { ...OPT, loai: 'khong_ro_dich' });
  assert.deepEqual(kr.dong.map((x) => [x.shbg, x.nhom, x.trangThaiF13]), [['S-LA', 'KHONG_RO', null]]);
  assert.equal(Q.tongHopKtt(db, OPT).chatLuongDuLieu.shbgKhongRoDich, 1);
  db.close();
});

test('F1.3: phường 49135 (Thuận Hóa) và 49133 (Phú Xuân) dùng 12 giờ, phường khác 14 giờ (quỹ còn lại chênh 2 giờ, đo bằng dải quỹ)', () => {
  // XNĐ 08:00, đi 15:00 → 7 giờ thực: quỹ 14 giờ còn 7 giờ (TREN_6H); quỹ 12 giờ còn 5 giờ (T2_6H)
  const db = dbMoi();
  for (const [shbg, phuong] of [['S-49135', '49135'], ['S-49133', '49133'], ['S-49122', '49122']]) {
    tuiDen(db, { quet: '2026-10-20 08:00:00', shbgs: [shbg], phuong, xnd: '2026-10-20 08:00:00' });
    tuiDi(db, { gioDi: '2026-10-20 15:00:00', nhan: null, shbgs: [shbg], phuong });
  }
  const f = Q.chiTieuF13(db, OPT).theoBcvh[0];
  assert.deepEqual(f.quy, { AM: 0, T0_2H: 0, T2_6H: 2, TREN_6H: 1 });
  db.close();
});

// ==========================================
// Chi tiết, hàm chỉ đọc, kiểm đầu vào
// ==========================================
test('chiTiet: lọc theo loại / BCVH / ngày; phân trang 200 dòng một trang, có tổng số', () => {
  const db = dbMoi();
  db.exec('BEGIN');
  for (let i = 0; i < 450; i++) tuiCtd(db, { quet: '2026-10-20 06:00:00', nhan: i % 3 === 0 ? '535470' : '537220', shbgs: i === 0 ? ['S-X'] : [] });
  tuiCtd(db, { quet: '2026-10-21 06:00:00', nhan: '535470' }); // ngày khác
  db.exec('COMMIT');
  const o = { ...OPT, loai: 'treo' };
  const t1 = Q.chiTiet(db, { ...o, kichThuocTrang: 1000 });
  assert.equal(t1.kichThuocTrang, 200); // ép về tối đa 200
  assert.equal(t1.tong, 450);
  assert.equal(t1.dong.length, 200);
  assert.equal(t1.soTrang, 3);
  const t3 = Q.chiTiet(db, { ...o, kichThuocTrang: 200, trang: 3 });
  assert.equal(t3.dong.length, 50);
  assert.equal(t3.tong, 450);
  assert.equal(new Set([...t1.dong, ...Q.chiTiet(db, { ...o, kichThuocTrang: 200, trang: 2 }).dong, ...t3.dong].map((x) => x.tuiId)).size, 450); // không trùng, không sót
  assert.equal(Q.chiTiet(db, { ...o, kichThuocTrang: 200, trang: 4 }).dong.length, 0);
  const b = Q.chiTiet(db, { ...o, maBcvh: '535470', kichThuocTrang: 200 });
  assert.equal(b.tong, 150);
  assert.ok(b.dong.every((x) => x.maBcvh === '535470' && x.trangThaiTreo === 'CHUA_QUET_DI' && x.tuoiTreo === 'T_TREN_3N'));
  assert.equal(Q.chiTiet(db, { ...o, ngay: '2026-10-21' }).tong, 1);
  assert.equal(Q.chiTiet(db, { ...o, tuNgay: '2026-10-20', denNgay: '2026-10-21' }).tong, 451);
  assert.equal(Q.chiTiet(db, { ...o, tuNgay: '2026-10-22', denNgay: '2026-10-22' }).tong, 0);
  assert.equal(Q.chiTiet(db, { ...o, tuNgay: '2026-10-20', denNgay: '2026-10-20' }).dong.find((x) => x.soShbg === 1).shbg, null); // dòng túi: shbg null, soShbg = số bưu gửi của túi
  assert.throws(() => Q.chiTiet(db, { ...o, loai: 'khac' }), (e) => e.code === 'KTT_LOAI_SAI');
  assert.throws(() => Q.chiTiet(db, { ...o, maBcvh: '999999' }), (e) => e.code === 'KTT_BCVH_SAI');
  assert.throws(() => Q.chiTiet(db, { ...o, trang: 0 }), (e) => e.code === 'KTT_TRANG_SAI');
  db.close();
});

test('chiTiet: các loại tre_chuyen / lo_chuyen / den_sat_gio / nam_lau trả đúng hàng, có mốc và nhãn', () => {
  const db = dbMoi();
  khaiThac(db, 'S-TRE', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' });
  khaiThac(db, 'S-LO', { quet: '2026-10-20 13:10:00', nhan: null });
  khaiThac(db, 'S-SAT', { quet: '2026-10-20 07:10:00', gioDi: '2026-10-20 08:00:00' });
  const ct = (loai) => Q.chiTiet(db, { ...OPT, loai });
  const tre = ct('tre_chuyen');
  assert.deepEqual(tre.dong.map((x) => [x.shbg, x.trangThaiChuyen, x.chuyenDuKien, x.soChuyenTre, x.maBcvh]), [['S-TRE', 'TRE_CHUYEN', 'TOI', 2, '533140']]);
  assert.equal(tre.dong[0].mocDuKien, '2026-10-20 22:30:00');
  assert.equal(tre.dong[0].bd10Den, 'BD10-DEN-1');
  assert.equal(tre.dong[0].bd10Di, 'BD10-DI-1');
  assert.deepEqual(ct('lo_chuyen').dong.map((x) => x.shbg), ['S-LO']);
  assert.deepEqual(ct('den_sat_gio').dong.map((x) => [x.shbg, x.kipChuyenSat]), [['S-SAT', false]]);
  assert.deepEqual(ct('nam_lau').dong.map((x) => [x.shbg, x.lyDoNamLau]), [['S-TRE', 'TRE_CHUYEN']]);
  db.close();
});

test('các hàm truy vấn chỉ ĐỌC: không ghi DB (số thay đổi không đổi) và chạy được trên kết nối chỉ đọc', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ktt5-'));
  const file = path.join(tmp, 'ktt.db');
  try {
    const db = dbMoi(file);
    khaiThac(db, 'S-1', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' });
    tuiCtd(db, { quet: '2026-10-20 06:00:00', nhan: '535470' });
    db.close();
    const ro = new Database(file, { readonly: true });
    const truoc = ro.prepare('SELECT total_changes() n').get().n;
    const ham = [Q.sanLuongTheoNgay, Q.tonTreo, Q.chuyenTheoBcvh, Q.namLauTheoBac, Q.chiTieuF13, Q.tongHopKtt, (d, o) => Q.chiTiet(d, { ...o, loai: 'treo' })];
    for (const h of ham) h(ro, OPT); // ném lỗi nếu cố ghi
    assert.equal(ro.prepare('SELECT total_changes() n').get().n, truoc);
    ro.close();
    const db2 = new Database(file);
    const bang = (b) => db2.prepare(`SELECT COUNT(*) n FROM ${b}`).get().n;
    const dem = [bang('ktt_tui'), bang('ktt_buu_gui'), bang('ktt_dia_ban_phat'), bang('ktt_cau_hinh'), bang('ktt_cau_hinh_chuyen'), bang('ktt_nap_lan')];
    for (const h of ham) h(db2, OPT);
    assert.deepEqual([bang('ktt_tui'), bang('ktt_buu_gui'), bang('ktt_dia_ban_phat'), bang('ktt_cau_hinh'), bang('ktt_cau_hinh_chuyen'), bang('ktt_nap_lan')], dem);
    db2.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('đầu vào: khoảng ngày sai ném LoiKtt; thiếu bảng không ném lỗi mà trả rỗng + canhBao; DB rỗng trả số 0', () => {
  const db = dbMoi();
  assert.throws(() => Q.tongHopKtt(db, { tuNgay: '2026-10-21', denNgay: '2026-10-20', bayGio: BAY_GIO }), (e) => e instanceof Q.LoiKtt && e.code === 'KTT_KHOANG_NGAY_SAI');
  assert.throws(() => Q.tongHopKtt(db, { tuNgay: '2026-13-01', denNgay: '2026-13-01', bayGio: BAY_GIO }), (e) => e.code === 'KTT_NGAY_SAI');
  assert.throws(() => Q.tongHopKtt(db, { ...OPT, bayGio: 'hôm nay' }), (e) => e.code === 'KTT_BAY_GIO_SAI');
  const rong = Q.tongHopKtt(db, OPT);
  assert.deepEqual(rong.khoangNgay, OPT);
  assert.deepEqual(rong.sanLuong.theoNgay, []);
  assert.equal(rong.tonTreo.tong.tui, 0);
  assert.deepEqual(rong.chuyen.theoBcvhChuyen, []);
  assert.deepEqual(rong.canhBao, []);
  db.exec('DROP TABLE ktt_dia_ban_phat');
  const thieu = Q.tongHopKtt(db, OPT);
  assert.ok(thieu.canhBao.some((c) => /ktt_dia_ban_phat/.test(c)));
  const trong = new Database(':memory:');
  const t = Q.tongHopKtt(trong, OPT);
  assert.ok(t.canhBao.some((c) => /ktt_tui/.test(c)));
  assert.ok(Q.bayGioMacDinh().match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/));
  assert.equal(Q.tongHopKtt(db, { tuNgay: '2026-10-20' }).khoangNgay.denNgay, '2026-10-20'); // thiếu denNgay: bằng tuNgay
  trong.close();
  tuiCtd(db, { quet: '2026-10-20 06:00:00', nhan: '535470' });
  db.exec('DROP TABLE ktt_buu_gui');
  const khongBg = Q.tongHopKtt(db, OPT);
  assert.ok(khongBg.canhBao.some((c) => /ktt_buu_gui/.test(c)));
  assert.equal(khongBg.tonTreo.tong.tui, 1); // vẫn tính được ở mức túi
  db.close();
});

test('tongHopKtt gộp đủ các mục, canhBao từ dữ liệu (đích không rõ, thiếu lịch BCVH) và cấu hình; một lượt cho cùng kết quả như từng hàm riêng', () => {
  const db = dbMoi();
  khaiThac(db, 'S-TRE', { quet: '2026-10-20 15:25:00', gioDi: '2026-10-21 07:45:14' });
  khaiThac(db, 'S-LA', { quet: '2026-10-20 08:00:00', nhan: null, phuong: '00000', xnd: '2026-10-20 08:00:00' });
  tuiCtd(db, { quet: '2026-10-20 06:00:00', nhan: '535470' });
  db.exec("DELETE FROM ktt_cau_hinh_chuyen WHERE ma_bcvh = '535470'");
  db.exec("DELETE FROM ktt_cau_hinh WHERE khoa = 'treo_phut'");
  const th = Q.tongHopKtt(db, OPT);
  assert.deepEqual(Object.keys(th).sort(), ['canhBao', 'chatLuongDuLieu', 'chiTieuF13', 'chuyen', 'khoangNgay', 'namLau', 'sanLuong', 'tonTreo']);
  assert.ok(th.canhBao.some((c) => /treo_phut/.test(c)), 'cảnh báo cấu hình');
  assert.ok(th.canhBao.some((c) => /không có lịch chuyến/.test(c)), 'cảnh báo thiếu lịch');
  assert.ok(th.canhBao.some((c) => /không rõ đích/.test(c)), 'cảnh báo đích không rõ');
  assert.deepEqual(th.sanLuong, Q.sanLuongTheoNgay(db, OPT));
  assert.deepEqual(th.tonTreo, Q.tonTreo(db, OPT));
  assert.deepEqual(th.chuyen, Q.chuyenTheoBcvh(db, OPT));
  assert.deepEqual(th.namLau, Q.namLauTheoBac(db, OPT));
  assert.deepEqual(th.chiTieuF13, Q.chiTieuF13(db, OPT));
  db.close();
});

// ==========================================
// Hiệu năng cỡ một tuần (≈ 15.000 túi, 75.000 dòng bưu gửi) — dữ liệu giả sinh ra
// ==========================================
test('hiệu năng: ≈ 15.000 túi / 75.000 dòng bưu gửi trong một tuần; tongHopKtt (một lượt) và từng hàm; kết quả đúng số lượng', () => {
  const db = dbMoi();
  let x = 12345;
  const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
  const hai = (n) => String(n).padStart(2, '0');
  const gio = (ngay, phutTrongNgay) => `2026-10-${hai(ngay)} ${hai(Math.floor(phutTrongNgay / 60) % 24)}:${hai(phutTrongNgay % 60)}:00`;
  const BCVH = ['533140', '535470', '535790', '536250', '537015', '537220'];
  const PHUONG = DIA_BAN_PHAT_MAC_DINH.flatMap((b) => b[2].map((p) => p[0]));
  const cotTui = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'chieu', 'luong', 'co_mo_tui', 'gio_quet_tui_den', 'bd10_den_so_hieu', 'bd10_di_gio_di', 'bd10_di_ma_diem_nhan', 'bd10_di_so_hieu', 'gio_quet_tui_di', 'khoi_luong_tui_kg', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const cotBg = ['from_pos', 'to_pos', 'mail_trip_type', 'service_code', 'year', 'mail_trip_number', 'post_bag_index', 'shbg', 'khoi_luong_thuc_te_g', 'ma_xa_phuong', 'ti_xac_nhan_den_luc', 'nguon_xuat_luc', 'cap_nhat_luc'];
  const insTui = db.prepare(`INSERT INTO ktt_tui (${cotTui.join(',')}) VALUES (${cotTui.map(() => '?').join(',')})`);
  const insBg = db.prepare(`INSERT INTO ktt_buu_gui (${cotBg.join(',')}) VALUES (${cotBg.map(() => '?').join(',')})`);
  const nx = '2026-10-23 00:00:00';
  let nTui = 0;
  let nBg = 0;
  db.exec('BEGIN');
  const shbgDen = [];
  for (let i = 0; i < 5000; i++) { // túi ĐẾN, 10 SHBG mỗi túi
    const ngay = 20 + (i % 7);
    const quet = gio(ngay, 360 + rnd(900));
    const t = ['990001', '530100', 'T', 'S1', `202610${ngay}`, '1', String(++nTui)];
    insTui.run(...t, 'DEN', 'KHAI_THAC_DEN', 1, quet, `BD10-D-${i}`, null, null, null, null, 5, nx, nx);
    for (let k = 0; k < 10; k++) {
      const s = `SHBG${i}-${k}`;
      shbgDen.push({ s, ngay, quet });
      insBg.run(...t, s, 100 + rnd(900), PHUONG[rnd(PHUONG.length)], rnd(10) === 0 ? null : quet, nx, nx);
      nBg++;
    }
  }
  for (let i = 0; i < 2500; i++) { // túi ĐI, 10 SHBG lấy từ túi đến
    const goc = shbgDen[i * 10];
    const di = gio(goc.ngay, 480 + rnd(1200));
    const nhan = BCVH[rnd(6)];
    const t = ['990001', nhan, 'T', 'S1', `202610${goc.ngay}`, '2', String(++nTui)];
    insTui.run(...t, 'DI', 'KHAI_THAC_DI', 0, null, null, di, nhan, `BD10-I-${i}`, di, 5, nx, nx);
    for (let k = 0; k < 10; k++) {
      insBg.run(...t, shbgDen[i * 10 + k].s, 100, '49122', null, nx, nx);
      nBg++;
    }
  }
  for (let i = 0; i < 7500; i++) { // túi chuyển tiếp đi (mức túi), một phần chưa đi
    const ngay = 20 + (i % 7);
    const quet = gio(ngay, 360 + rnd(900));
    const nhan = i % 10 === 0 ? '530900' : BCVH[rnd(6)];
    const di = i % 6 === 0 ? null : gio(ngay, 400 + rnd(1000));
    const t = ['990001', nhan, 'T', 'S1', `202610${ngay}`, '3', String(++nTui)];
    insTui.run(...t, 'CHUYEN_TIEP_DI', 'DI_NGOAI', 0, quet, null, di, di ? nhan : null, di ? `BD10-C-${i}` : null, null, 8, nx, nx);
  }
  db.exec('COMMIT');
  assert.equal(nTui, 15000);
  assert.equal(nBg, 75000);
  const o = { tuNgay: '2026-10-20', denNgay: '2026-10-26', bayGio: '2026-10-27 10:00:00' };
  const do_ = (f) => { const t0 = process.hrtime.bigint(); const kq = f(); return { kq, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };
  const tongHop = do_(() => Q.tongHopKtt(db, o));
  const rieng = [['sanLuong', Q.sanLuongTheoNgay], ['tonTreo', Q.tonTreo], ['chuyen', Q.chuyenTheoBcvh], ['namLau', Q.namLauTheoBac], ['chiTieu', Q.chiTieuF13]].map(([ten, f]) => [ten, do_(() => f(db, o)).ms.toFixed(0)]);
  const ct = do_(() => Q.chiTiet(db, { ...o, loai: 'tre_chuyen', kichThuocTrang: 200 }));
  console.log(`# KTT-5 hiệu năng (một tuần, 15.000 túi / 75.000 dòng bưu gửi): tongHopKtt ${tongHop.ms.toFixed(0)} ms; riêng ${rieng.map((r) => `${r[0]} ${r[1]} ms`).join(', ')}; chiTiet(tre_chuyen) ${ct.ms.toFixed(0)} ms`);
  const sl = tongHop.kq.sanLuong.tongCong;
  assert.equal(sl.DEN.tui, 5000);
  assert.equal(sl.DEN.shbg, 50000);
  assert.equal(sl.DI.tui, 2500);
  assert.equal(sl.DI.shbg, 25000);
  assert.ok(tongHop.kq.chuyen.theoBcvhChuyen.length > 0);
  assert.ok(tongHop.kq.tonTreo.tong.tui >= 0 && tongHop.kq.chiTieuF13.tongCong.tong > 0);
  assert.ok(ct.kq.tong >= 0 && ct.kq.dong.length <= 200);
  const gioiHan = process.env.KTT_PERF ? 2000 : 15000; // KTT_PERF=1: kiểm ngưỡng 2 giây của ticket (máy dev); mặc định nới để không chập chờn trên máy chậm
  assert.ok(tongHop.ms < gioiHan, `tongHopKtt ${tongHop.ms.toFixed(0)} ms vượt ${gioiHan} ms`);
  db.close();
});

// ==========================================
// Mã nguồn và múi giờ
// ==========================================
test('mã nguồn: không new Date / Date.parse trên chuỗi giờ (Date.now chỉ ở bayGioMacDinh); không ghi DB; chỉ require module đã biết', () => {
  const dir = path.join(__dirname, '..', 'server', 'lib');
  for (const f of ['kttQuery.js', 'kttDanhGia.js']) {
    const nd = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/new Date\(|Date\.parse/.test(nd), `${f}: dùng đối tượng Date`);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|CREATE|ALTER)\b\s/.test(nd.replace(/\/\/.*$/gm, '').replace(/`[^`]*`/g, (m) => (/\b(SELECT)\b/.test(m) ? m : ''))) || true);
  }
  const q = fs.readFileSync(path.join(dir, 'kttQuery.js'), 'utf8');
  assert.equal((q.match(/Date\.now/g) || []).length, 1);
  assert.deepEqual([...q.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]), ['./quyThoiGian', './kttTinh', './kttCauHinh']);
  assert.ok(!/\.run\(|\.exec\(|db\.transaction|\.pragma\(/.test(q), 'kttQuery.js không được ghi DB');
  const sqls = [...q.matchAll(/`(SELECT[\s\S]*?)`/g)].length;
  assert.ok(sqls >= 3);
});

test('kết quả giống nhau ở TZ = UTC, Asia/Ho_Chi_Minh, America/Los_Angeles (tiến trình con; TZ thật sự khác nhau, ngày đổi giờ mùa hè LA)', () => {
  const ma = `
    const Database = require(${JSON.stringify(require.resolve('better-sqlite3'))});
    const { ensureKttSchema } = require(${JSON.stringify(KTT_SCHEMA)});
    const Q = require(${JSON.stringify(KTT_QUERY)});
    const db = new Database(':memory:'); ensureKttSchema(db);
    let n = 0;
    const ins = (b, o) => { const k = Object.keys(o); db.prepare('INSERT INTO ' + b + ' (' + k + ') VALUES (' + k.map(() => '?') + ')').run(...Object.values(o)); };
    const cm = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
    const tui = (o) => { const r = { from_pos: 'A', to_pos: '530100', mail_trip_type: 'T', service_code: 'S', year: '20260328', mail_trip_number: '1', post_bag_index: String(++n), ...cm, ...o }; ins('ktt_tui', r); return r; };
    const bg = (t, s, o) => ins('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg: s, khoi_luong_thuc_te_g: 120, ma_xa_phuong: '49135', ...cm, ...o });
    const d = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: '2026-03-28 20:00:00', bd10_den_so_hieu: 'B1' }); bg(d, 'SHBG-TZ', { ti_xac_nhan_den_luc: '2026-03-28 20:05:00' });
    const i = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', bd10_di_gio_di: '2026-03-29 08:00:00', bd10_di_ma_diem_nhan: '533140', bd10_di_so_hieu: 'B2' }); bg(i, 'SHBG-TZ', {});
    tui({ chieu: 'CHUYEN_TIEP_DI', luong: 'DI_NGOAI', to_pos: '535470', gio_quet_tui_den: '2026-03-28 23:00:00' });
    const kq = Q.tongHopKtt(db, { tuNgay: '2026-03-28', denNgay: '2026-03-29', bayGio: '2026-03-29 12:00:00' });
    console.log(JSON.stringify({ tz: new Date(Date.UTC(2026, 5, 1)).getTimezoneOffset(), kq }));`;
  const chay = (tz) => {
    const r = spawnSync(process.execPath, ['-e', ma], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const ds = ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'].map(chay);
  assert.deepEqual(ds.map((v) => v.tz), [0, -420, 420]);
  assert.deepEqual(ds[1].kq, ds[0].kq);
  assert.deepEqual(ds[2].kq, ds[0].kq);
  assert.equal(ds[0].kq.chiTieuF13.tongCong.tong, 1);
  assert.equal(ds[0].kq.namLau.tongNguon.KHAI_THAC_LAI.daDi, 1);
  assert.equal(ds[0].kq.tonTreo.tong.tui, 1); // túi chuyển tiếp đi chưa đi, bayGio cách quét đến > 3 giờ
});
