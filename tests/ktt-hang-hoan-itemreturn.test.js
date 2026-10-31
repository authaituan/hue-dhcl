// ==========================================
// Test KTT-17-2: «hàng hoàn» theo DANH SÁCH ItemReturn (ktt_hang_hoan), thay quy tắc lộ trình 7b (531120 → 533140).
// Hàng hoàn = SHBG có trong ktt_hang_hoan VÀ đích là một trong 6 BCVH Huế; mọi nơi gửi; MỘT khối hoàn chung; cách xử lý trong chỉ số không đổi.
// DB trong bộ nhớ + ensureKttSchema, dữ liệu GIẢ (SHBG KTT-DEMO-xxx, ItemReturn giả = vài dòng ktt_hang_hoan). Không mở data/, không server, không đọc .env.
// ==========================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const K = require('../server/lib/kttNapCap');
const QL = require('../server/lib/kttLuuThoatQuery');
const Q = require('../server/lib/kttQuery');
const D = require('../server/lib/kttDiNgay');
const DQ = require('../server/lib/kttDiNgayQuery');
const Api = require('../server/lib/kttApi');
const HH = require('../server/lib/kttHangHoan');

const BCVH = ['533140', '535470', '535790', '536250', '537015', '537220'];
const TH = '533140'; const HT = '535470';
const NGAY = '2026-10-20';
const BAY_GIO = '2026-10-23 10:00:00';
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
let seq = 0;

const dbMoi = () => { const db = new Database(':memory:'); ensureKttSchema(db); return db; };
function them(db, bang, o) { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); }
const hoan = (db, ...ds) => ds.forEach((shbg) => them(db, 'ktt_hang_hoan', { shbg, ...NG }));
function tui(db, o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them(db, 'ktt_tui', r); return r; }
function bg(db, t, shbg, o = {}) {
  them(db, 'ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 100, ma_xa_phuong: '49122', ...NG, ...o });
}
/** Một SHBG khai thác lại: túi đến (nơi gửi diemGui, đường thư dt) + túi đi (nhan, gioDi) nếu có nhan. phuong: mã phường/xã của bưu gửi. */
function kt(db, shbg, { quet = '2026-10-20 05:30:00', gioDi = '2026-10-20 06:50:00', nhan = TH, diemGui = '599001', dt = 'DT-A', phuong = '49122' } = {}) {
  const den = tui(db, { chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: `BD10-D-${seq}`, bd10_den_xnd: quet, bd10_den_ma_diem_gui: diemGui, bd10_den_ten_diem_gui: `Điểm ${diemGui}`, bd10_den_ma_duong_thu: dt, bd10_den_ten_duong_thu: `Đường thư ${dt}` });
  bg(db, den, shbg, { ma_xa_phuong: phuong });
  if (nhan) {
    const di = tui(db, { chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan, bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
    bg(db, di, shbg, { ma_xa_phuong: phuong });
  }
}
const capOk = (db, nguon = BAY_GIO) => K.ghiCap(db, { khoa_cap: `${nguon.slice(0, 10).replace(/-/g, '')}_100000`, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
const luuThoat = (db) => QL.luuThoatTheoNgay(db, { tuNgay: NGAY, denNgay: NGAY, bayGio: BAY_GIO });
const ngay = (kq) => kq.theo_ngay.find((x) => x.ngay === NGAY);
const b1 = (db) => { const m = D.congCacNgay([DQ.tinhNgay(db, NGAY, BAY_GIO)]); return { m, the: D.tongHop(m) }; };

test('a) có trong danh sách, đích là MỖI trong 6 BCVH (không chỉ 533140) -> hàng hoàn; mỗi BCVH tong_shbg_ngay = SHBG của khối + hoàn của BCVH đó', () => {
  const db = dbMoi();
  BCVH.forEach((m, i) => { kt(db, `KTT-DEMO-H${i}`, { nhan: m, diemGui: i % 2 ? '531120' : '599001' }); kt(db, `KTT-DEMO-T${i}`, { nhan: m }); });
  hoan(db, ...BCVH.map((_, i) => `KTT-DEMO-H${i}`));
  const n = ngay(luuThoat(db));
  assert.equal(n.hang_hoan.tong_shbg, 6);
  assert.equal(n.tong.tong_shbg, 6, 'chỉ 6 hàng thường');
  for (const m of BCVH) { assert.equal(n.theo_bcvh[m].tong_shbg, 1, m); assert.equal(n.theo_bcvh[m].tong_shbg_ngay, 2, `${m}: 1 thường + 1 hoàn`); }
  assert.equal(n.tong_shbg_ngay, 12);
  db.close();
});

test('b) có trong danh sách nhưng đích NGOÀI 6 BCVH (530900, tỉnh khác) -> KHÔNG hoàn, giữ phân loại cũ (ngoài phạm vi)', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-B1', { nhan: '530900' }); kt(db, 'KTT-DEMO-B2', { nhan: '700123' });
  hoan(db, 'KTT-DEMO-B1', 'KTT-DEMO-B2');
  const n = ngay(luuThoat(db));
  assert.equal(n.hang_hoan.tong_shbg, 0);
  assert.equal(n.khong_phan_loai.tong, 2); assert.equal(n.khong_phan_loai.ngoai_pham_vi.HE1_530900, 1); assert.equal(n.khong_phan_loai.ngoai_pham_vi.KHAC, 1);
  db.close();
});

test('c) có trong danh sách nhưng đích KHÔNG RÕ (chưa BD10 đi, phường/xã không tra được) -> KHÔNG hoàn, tính «không rõ đích»', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-C1', { nhan: null, phuong: '00000' });
  hoan(db, 'KTT-DEMO-C1');
  const kq = luuThoat(db); const n = ngay(kq);
  assert.equal(n.hang_hoan.tong_shbg, 0);
  assert.equal(n.khong_phan_loai.khong_ro_dich, 1); assert.equal(kq.meta.khong_ro_dich, 1);
  db.close();
});

test('d) hàng chuỗi 531120 → 530100 → 533140 KHÔNG trong danh sách -> hàng thường: vào noi_tinh_den_bcvh (không hoàn), tính vào tổng và tỷ lệ', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-D1', { diemGui: '531120' }); kt(db, 'KTT-DEMO-D2', { diemGui: '531120', gioDi: '2026-10-21 08:00:00' });
  capOk(db);
  const n = ngay(luuThoat(db));
  assert.equal(n.hang_hoan.tong_shbg, 0); assert.equal(n.tong.tong_shbg, 2); assert.equal(n.theo_bcvh[TH].tong_shbg, 2);
  assert.equal(n.tong.luu_thoat.mau_so, 2, 'vào mẫu số của tỷ lệ');
  const { the } = b1(db);
  assert.equal(the.noi_tinh_den_bcvh.khong_hang_hoan.tong_shbg, 2, 'nơi gửi 53… -> nội tỉnh, không phải hoàn');
  assert.equal(the.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 0); assert.equal(the.lien_tinh_den_bcvh.tong_shbg, 0);
  db.close();
});

test('e) hàng hoàn có nơi gửi KHÔNG-53: vào khối hoàn chung, không cộng vào tổng, KHÔNG vào lien_tinh_den_bcvh; ở B5 là dòng hang_hoan trong mục theo nơi gửi (không-53 -> liên tỉnh), không cộng vào «cong»; lọc danh sách khớp', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-E1', { diemGui: '599001' }); // hoàn, không-53
  kt(db, 'KTT-DEMO-E2', { diemGui: '530101' }); // hoàn, 53…
  kt(db, 'KTT-DEMO-E3', { diemGui: '599001' }); // thường, không-53
  hoan(db, 'KTT-DEMO-E1', 'KTT-DEMO-E2');
  capOk(db);
  const { m, the } = b1(db);
  assert.equal(the.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 2, 'MỘT khối hoàn chung cho cả hai nơi gửi');
  assert.equal(the.lien_tinh_den_bcvh.tong_shbg, 1, 'chỉ E3'); assert.equal(the.noi_tinh_den_bcvh.khong_hang_hoan.tong_shbg, 0);
  assert.equal(the.bcvh_hue_khong_hang_hoan.tong_shbg, 1);
  const b5 = D.theoDuongThu(m);
  const lien = b5.lien_tinh_den_bcvh; const noi = b5.noi_tinh_den_bcvh;
  assert.deepEqual(lien.dong.map((r) => [r.noi_gui_ma, r.hang_hoan, r.tong_shbg]).sort(), [['599001', false, 1], ['599001', true, 1]].sort());
  assert.equal(lien.cong.tong_shbg, 1, 'hàng hoàn không cộng vào cong'); assert.equal(noi.dong.length, 1); assert.equal(noi.dong[0].hang_hoan, true); assert.equal(noi.cong.tong_shbg, 0);
  const ds = (huong, hangHoan) => { const r = DQ.danhSach(db, { tuNgay: NGAY, denNgay: NGAY, loai: 'hom-sau', huong, hangHoan, bayGio: BAY_GIO }); return r; };
  const dsDuyet = (nhomCan, huong, hangHoan) => { const o = []; DQ.duyetDanhSach(db, { tuNgay: NGAY, denNgay: NGAY, bayGio: BAY_GIO }, { nhomCan, duongThu: null, noiGui: null, huong, hangHoan, maBcvh: null }, (u) => o.push(u.shbg)); return o.sort(); };
  assert.deepEqual(dsDuyet('cung_ngay', 'lien_tinh_den_bcvh', true), ['KTT-DEMO-E1'], 'lọc hoàn trong hướng liên tỉnh thấy E1');
  assert.deepEqual(dsDuyet('cung_ngay', 'lien_tinh_den_bcvh', false), ['KTT-DEMO-E3']);
  assert.deepEqual(dsDuyet('cung_ngay', 'noi_tinh_den_bcvh', true), ['KTT-DEMO-E2']);
  assert.ok(ds);
  db.close();
});

test('f) SHBG chưa có BD10 đi: không trong danh sách -> thường; trong danh sách và đích suy ra (phường/xã) thuộc 6 BCVH -> hoàn', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-F1', { nhan: null, gioDi: null, phuong: '49122' }); // thường
  kt(db, 'KTT-DEMO-F2', { nhan: null, gioDi: null, phuong: '49122' }); // hoàn
  hoan(db, 'KTT-DEMO-F2');
  const n = ngay(luuThoat(db));
  assert.equal(n.hang_hoan.tong_shbg, 1); assert.equal(n.tong.tong_shbg, 1);
  assert.equal(n.hang_hoan.tong_shbg + n.tong.tong_shbg + n.khong_phan_loai.tong, n.tong_shbg_ngay);
  db.close();
});

test('g) danh sách RỖNG (hoặc chưa có bảng): hoàn = 0, không lỗi, meta.hang_hoan_chua_nap = true (và nguồn null); có danh sách thì cờ false + mốc lớn nhất', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-G1', { diemGui: '531120' });
  let kq = luuThoat(db);
  assert.equal(ngay(kq).hang_hoan.tong_shbg, 0); assert.equal(ngay(kq).tong.tong_shbg, 1);
  assert.deepEqual([kq.meta.hang_hoan_chua_nap, kq.meta.hang_hoan_nguon_xuat_luc, kq.meta.hang_hoan_tu_531120_dich_khac_thuan_hoa], [true, null, 0]);
  assert.equal(b1(db).the.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 0);
  const rong = QL.luuThoatTheoNgay(dbMoi(), { tuNgay: NGAY, denNgay: NGAY }); // chưa có dữ liệu: kết quả rỗng vẫn mang cờ
  assert.equal(rong.meta.hang_hoan_chua_nap, true);
  db.exec('DROP TABLE ktt_hang_hoan');
  kq = luuThoat(db);
  assert.equal(ngay(kq).hang_hoan.tong_shbg, 0); assert.equal(kq.meta.hang_hoan_chua_nap, true);
  db.exec('CREATE TABLE ktt_hang_hoan (id INTEGER PRIMARY KEY AUTOINCREMENT, shbg TEXT NOT NULL UNIQUE, nguon_xuat_luc TEXT NOT NULL, nap_lan_id INTEGER, cap_nhat_luc TEXT NOT NULL)');
  them(db, 'ktt_hang_hoan', { shbg: 'KTT-DEMO-G1', nguon_xuat_luc: '2026-10-22 18:00:00', cap_nhat_luc: '2026-10-22 18:00:00' });
  them(db, 'ktt_hang_hoan', { shbg: 'KTT-DEMO-GX', nguon_xuat_luc: '2026-10-23 09:00:00', cap_nhat_luc: '2026-10-23 09:00:00' });
  kq = luuThoat(db);
  assert.equal(ngay(kq).hang_hoan.tong_shbg, 1);
  assert.deepEqual([kq.meta.hang_hoan_chua_nap, kq.meta.hang_hoan_nguon_xuat_luc], [false, '2026-10-23 09:00:00']);
  db.close();
});

test('h) nạp THÊM danh sách -> số đổi ở /luu-thoat và B1 KHÔNG cần xóa cache / khởi động lại (khóa đệm có phiên bản danh sách); meta đổi theo', async () => {
  const db = dbMoi();
  Api.xoaCache();
  kt(db, 'KTT-DEMO-H1'); kt(db, 'KTT-DEMO-H2'); kt(db, 'KTT-DEMO-H3');
  capOk(db); // ngày 20 đã chốt: nếu khóa đệm không đổi, số cũ sẽ được giữ
  const q = { tu: NGAY, den: NGAY };
  let lt = await Api.luuThoat(db, q); let tq = await Api.diCungNgayTongHop(db, q);
  assert.equal(ngay(lt).hang_hoan.tong_shbg, 0); assert.equal(tq.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 0);
  assert.equal(lt.meta.hang_hoan_chua_nap, true); assert.equal(tq.hang_hoan_chua_nap, true);
  assert.equal(ngay(lt).tong.tong_shbg, 3);
  lt = await Api.luuThoat(db, q); assert.equal(ngay(lt).hang_hoan.tong_shbg, 0, 'lần 2: trả từ đệm, vẫn 0');
  // PO nạp ItemReturn: ghi qua importer thật (cùng đường với CLI / SFTP)
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-ktt-hh2-'));
  try {
    const f = path.join(dir, 'KTT_HangHoan_20261023_100000.csv');
    fs.writeFileSync(f, 'SHBG,Nguon_xuat_luc\r\nKTT-DEMO-H1,2026-10-23 10:00:00.000\r\nKTT-DEMO-H2,2026-10-23 10:00:00.000\r\n');
    assert.equal(HH.napHangHoan(db, f).status, 'OK');
    lt = await Api.luuThoat(db, q); tq = await Api.diCungNgayTongHop(db, q);
    assert.equal(ngay(lt).hang_hoan.tong_shbg, 2, 'số đổi ngay sau khi nạp danh sách');
    assert.equal(ngay(lt).tong.tong_shbg, 1);
    assert.equal(tq.noi_tinh_den_bcvh.hang_hoan.tong_shbg, 2);
    assert.deepEqual([lt.meta.hang_hoan_chua_nap, lt.meta.hang_hoan_nguon_xuat_luc, tq.hang_hoan_chua_nap, tq.hang_hoan_nguon_xuat_luc], [false, '2026-10-23 10:00:00', false, '2026-10-23 10:00:00']);
    // file mới thêm SHBG thứ ba: lại đổi
    const f2 = path.join(dir, 'KTT_HangHoan_20261023_150000.csv');
    fs.writeFileSync(f2, 'SHBG,Nguon_xuat_luc\r\nKTT-DEMO-H3,2026-10-23 15:00:00.000\r\n');
    HH.napHangHoan(db, f2);
    lt = await Api.luuThoat(db, q);
    assert.equal(ngay(lt).hang_hoan.tong_shbg, 3, 'cộng dồn: H1, H2, H3');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); Api.xoaCache(); }
  db.close();
});

test('i) hàng hoàn KHÔNG vào theo_nguon, bị loại khỏi mẫu số 14 giờ và đạt / không đạt (cách xử lý cũ giữ nguyên); chỉ TẬP hoàn đổi', () => {
  const db = dbMoi();
  kt(db, 'KTT-DEMO-I1', { diemGui: '599001' }); kt(db, 'KTT-DEMO-I2', { diemGui: '599001' }); kt(db, 'KTT-DEMO-I3', { diemGui: '530101' });
  const truoc = ngay(luuThoat(db));
  hoan(db, 'KTT-DEMO-I2');
  const sau = ngay(luuThoat(db));
  const nguonTong = (n) => n.theo_nguon.reduce((s, x) => s + x.shbg, 0);
  assert.equal(nguonTong(truoc), 3); assert.equal(nguonTong(sau), 2, 'hoàn không vào theo_nguon');
  assert.equal(sau.tong.tong_shbg, truoc.tong.tong_shbg - 1); assert.equal(sau.hang_hoan.tong_shbg, 1);
  const dkd = (k) => k.dat_khong_dat.dat + k.dat_khong_dat.khong_dat + k.dat_khong_dat.chua_di + k.dat_khong_dat.chua_do_duoc + k.dat_khong_dat.xnd_sau_gio_di;
  assert.equal(dkd(sau.tong), dkd(truoc.tong) - 1, 'loại khỏi đạt / không đạt của tổng');
  assert.equal(sau.hang_hoan.dat_khong_dat.dat + sau.hang_hoan.dat_khong_dat.khong_dat + sau.hang_hoan.dat_khong_dat.chua_do_duoc + sau.hang_hoan.dat_khong_dat.chua_di + sau.hang_hoan.dat_khong_dat.xnd_sau_gio_di, 1, 'chỉ để xem ở khối hoàn');
  const c14 = (k) => k.chi_tieu_14h.theo_moc.xnd.mau_so;
  assert.equal(c14(sau.tong), c14(truoc.tong) - 1, 'mẫu số 14 giờ loại hoàn');
  assert.equal(sau.tong.luu_thoat.mau_so, truoc.tong.luu_thoat.mau_so - 1);
  assert.equal(c14(sau.hang_hoan), 1, 'khối hoàn có chi_tieu_14h riêng, chỉ để xem');
  db.close();
});

test('docDanhSachHangHoan / phienBanHangHoan: Set theo SHBG; phiên bản đổi khi nạp; chiThongTin không nạp Set', () => {
  const db = dbMoi();
  const v0 = HH.phienBanHangHoan(db);
  assert.deepEqual([HH.docDanhSachHangHoan(db).soDong, HH.docDanhSachHangHoan(db).nguonXuatLuc], [0, null]);
  hoan(db, 'KTT-DEMO-V1', 'KTT-DEMO-V2');
  const dsach = HH.docDanhSachHangHoan(db);
  assert.deepEqual([dsach.soDong, dsach.set.has('KTT-DEMO-V1'), dsach.set.has('khong-co'), dsach.nguonXuatLuc], [2, true, false, '2026-10-23 00:00:00']);
  assert.notEqual(HH.phienBanHangHoan(db), v0); assert.equal(dsach.phienBan, HH.phienBanHangHoan(db));
  const nhe = HH.docDanhSachHangHoan(db, { chiThongTin: true });
  assert.deepEqual([nhe.set.size, nhe.soDong], [0, 2]);
  assert.deepEqual(HH.metaHangHoan(nhe), { hang_hoan_chua_nap: false, hang_hoan_nguon_xuat_luc: '2026-10-23 00:00:00' });
  assert.equal(Q.CHIEU.DEN, 'DEN');
  db.close();
});
