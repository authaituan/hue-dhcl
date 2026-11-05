// ==========================================
// Test KTT-KD-1: «Vì sao không đạt 14 giờ» — nhóm nguyên nhân A–E, hai mức tổng, tỷ lệ chuẩn, cắt theo thứ / nguồn hàng / BCVH × loại ngày, dư địa theo giờ, đợt đến,
// chi-tiet / xlsx dựa chiTieu14h[m] (không nhầm với khối dat_khong_dat mốc A). Dữ liệu GIẢ (SHBG KTT-DEMO-xxx), server thật trên DB tạm của harness.
// Lịch (GIẢ ĐỊNH của test, tests/helpers/lichKichBan.js — KHÔNG phải lịch chuẩn 05/11): Hương Thủy 536250 chạy 06:30 và 12:30 NGHI Chủ nhật; Thuận Hóa 533140 chạy 07:00, 12:30, 12:55 (nghỉ CN), 19:45, 22:00; hạn đến = giờ rời − 60 phút.
// Ngày: 2026-10-11 là Chủ nhật; 10-12 thứ Hai; 10-17 thứ Bảy; 10-19 thứ Hai. bayGio (độ mới) = 2026-10-23 10:00:00.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const Database = require('better-sqlite3');
const { ensureKttSchema } = require('../server/lib/kttSchema');
const { datLichKichBan } = require('./helpers/lichKichBan'); // KTT-LICH-2: kịch bản dựng quanh ngày nghỉ Chủ nhật dùng bộ lịch GIẢ ĐỊNH (không phải lịch chuẩn)
const K = require('../server/lib/kttNapCap');
const L = require('../server/lib/kttLichChuyen');
const S = require('../server/lib/kttLuuThoat');
const C = require('../server/lib/kttChuyen');
const QL = require('../server/lib/kttLuuThoatQuery');
const KD = require('../server/lib/kttKhongDat14h');
const Api = require('../server/lib/kttApi');
const TS = require('../server/lib/thamSo');

const PORT = 5961;
const HY = '536250'; const TH = '533140';
const BAY_GIO = '2026-10-23 10:00:00';
let ctx; let db;
const tokens = {};
const khoiPhuc = [];
const USERS = {
  admin: { hrm: 'KD1_ADMIN', pass: 'Admin@123', role: 'ADMIN' }, ttvh: { hrm: 'KD1_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'KD1_GDVH', pass: 'Gdvh@123', role: 'GDVH' }, tivi: { hrm: 'KD1_TIVI', pass: 'Tivi@123', role: 'TIVI' }, ttkt: { hrm: 'KD1_TTKT', pass: 'Ttkt@123', role: 'TTKT' }
};
before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-ktt-kd1-${Date.now()}.db` });
  db = ctx.db;
  await waitForServer(ctx.baseUrl);
  khoiPhuc.push(cachLySftpEnv());
  for (const [k, u] of Object.entries(USERS)) {
    seedUser(db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
});
after(async () => {
  await Api.dongNen();
  for (const f of khoiPhuc) f();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, db);
});
beforeEach(() => {
  db.exec('DELETE FROM ktt_hang_hoan; DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui; DELETE FROM ktt_nap_cap;');
  db.exec("DELETE FROM tham_so WHERE khoa = 'ktt_gio_chot_ngay'");
  datLichKichBan(db);
  TS.khoiTao(db);
  Api.xoaCache();
});

// ---------- dữ liệu giả ----------
let seq = 0;
const them = (bang, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO ${bang} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...Object.values(o)); };
const NG = { nguon_xuat_luc: '2026-10-23 00:00:00', cap_nhat_luc: '2026-10-23 00:00:00' };
function tui(o = {}) { seq++; const r = { from_pos: '999001', to_pos: '530100', mail_trip_type: 'T', service_code: 'S1', year: '20261020', mail_trip_number: '1', post_bag_index: String(seq), ...NG, ...o }; them('ktt_tui', r); return r; }
function bg(t, shbg, o = {}) { them('ktt_buu_gui', { from_pos: t.from_pos, to_pos: t.to_pos, mail_trip_type: t.mail_trip_type, service_code: t.service_code, year: t.year, mail_trip_number: t.mail_trip_number, post_bag_index: t.post_bag_index, shbg, khoi_luong_thuc_te_g: 1000, ...NG, ...o }); }
/** Một SHBG khai thác: túi đến (BD10 `bd10`, nơi gửi `diemGui`) + (nếu `nhan`) túi đi. `gam`: khối lượng gam (mặc định 1000 = 1 kg); `phuong`: mã phường. */
function kt(shbg, { quet, gioDi = null, nhan = HY, xnd, diemGui = null, bd10 = 'BD10-KD1-1', gam = 1000, phuong = '49620', duongThu = 'DT-A', hoan = false }) {
  if (hoan) them('ktt_hang_hoan', { shbg, ...NG });
  const den = tui({ chieu: 'DEN', luong: 'KHAI_THAC_DEN', co_mo_tui: 1, gio_quet_tui_den: quet, bd10_den_so_hieu: bd10, bd10_den_xnd: xnd === undefined ? quet : xnd, bd10_den_ma_diem_gui: diemGui, bd10_den_ma_duong_thu: duongThu, bd10_den_ten_duong_thu: `Tên ${duongThu}` });
  bg(den, shbg, { ma_xa_phuong: phuong, khoi_luong_thuc_te_g: gam });
  if (gioDi || nhan) {
    const di = tui({ chieu: 'DI', luong: 'KHAI_THAC_DI', to_pos: nhan || '999002', bd10_di_gio_di: gioDi, gio_quet_tui_di: gioDi, bd10_di_so_hieu: nhan && gioDi ? `BD10-I-${seq}` : null, bd10_di_ma_diem_nhan: nhan });
    bg(di, shbg, { ma_xa_phuong: phuong, khoi_luong_thuc_te_g: gam });
  }
}
function capOk(nguon) {
  const khoa = `${nguon.slice(0, 10).replace(/-/g, '')}_${nguon.slice(11, 13)}${nguon.slice(14, 16)}00`;
  K.ghiCap(db, { khoa_cap: khoa, ket_qua: 'OK', nguon_xuat_luc: nguon, thay_dau_luc: '2026-10-01 00:00:00', nap_luc: '2026-10-01 00:00:00', cap_nhat_luc: '2026-10-01 00:00:00' });
}

/**
 * Bộ dữ liệu có đáp án tính tay (đích Hương Thủy, chỉ tiêu 14 giờ; mốc A = XNĐ = giờ quét nên hai mốc cho cùng nhóm).
 * Thứ Bảy 17/10 (thứ 7): chuyến 06:30 và 12:30 (hạn 05:30 / 11:30); Chủ nhật không có chuyến → hàng đến thứ Bảy chờ tới thứ Hai 06:30.
 */
function duLieu() {
  // C: đến 13:00 thứ Bảy (sau chuyến 12:30), đi thứ Hai 06:20 kịp chuyến 06:30, chờ 8 + 14 = 22 giờ > 14 -> đi đúng chuyến vẫn quá chỉ tiêu
  kt('KTT-DEMO-C1', { quet: '2026-10-17 13:00:00', gioDi: '2026-10-19 06:20:00', bd10: 'BD10-KD1-C' });
  // A (đúng chuyến): đến 12:00 (trong (11:30, 12:30]) = sát giờ, lỡ chuyến 12:30; đi thứ Hai 06:20 kịp chuyến kế
  kt('KTT-DEMO-A1', { quet: '2026-10-17 12:00:00', gioDi: '2026-10-19 06:20:00', bd10: 'BD10-KD1-A' });
  // A (trượt chuyến kế): sát giờ rồi đi thứ Hai 08:00 sau chuyến 06:30 -> truot_chuyen_ke
  kt('KTT-DEMO-A2', { quet: '2026-10-17 12:10:00', gioDi: '2026-10-19 08:00:00', bd10: 'BD10-KD1-A' });
  // B: đến 10:00 (kịp chuyến 12:30), đi thứ Hai 07:00: trượt, hai chuyến đã lỡ (thứ Bảy 12:30, thứ Hai 06:30); chờ 11 + 14 = 25 giờ
  kt('KTT-DEMO-B1', { quet: '2026-10-17 10:00:00', gioDi: '2026-10-19 07:00:00', bd10: 'BD10-KD1-B', gam: 0 }); // 0 g = không rõ
  // B: đi thứ Ba 09:00 -> bốn chuyến đã lỡ (3 trở lên)
  kt('KTT-DEMO-B3', { quet: '2026-10-17 10:00:00', gioDi: '2026-10-20 09:00:00', bd10: 'BD10-KD1-B', phuong: '49612', duongThu: 'DT-B' });
  // B ngày Chủ nhật 11/10: đến 10:00, đi thứ Ba 13/10 07:00 (chờ 11 + 14 giờ): trượt, ngày đến là Chủ nhật
  kt('KTT-DEMO-BS', { quet: '2026-10-11 10:00:00', gioDi: '2026-10-13 07:00:00', bd10: 'BD10-KD1-S' });
  // E: chưa đi, quá chỉ tiêu (bayGio 23/10 10:00); một SHBG sát giờ (12:20) và một không
  kt('KTT-DEMO-E1', { quet: '2026-10-17 10:00:00', nhan: null, bd10: 'BD10-KD1-B' });
  kt('KTT-DEMO-E2', { quet: '2026-10-17 12:20:00', nhan: null, bd10: 'BD10-KD1-A' });
  // đạt (đo được, không vào A–E) và chưa đi chưa quá chỉ tiêu (không vào A–E, không vào mẫu số)
  kt('KTT-DEMO-D1', { quet: '2026-10-19 05:00:00', gioDi: '2026-10-19 06:20:00', bd10: 'BD10-KD1-D' });
  kt('KTT-DEMO-N1', { quet: '2026-10-23 09:00:00', nhan: null, bd10: 'BD10-KD1-N' });
  // hàng chuyển hoàn: loại khỏi A–E dù chờ lâu
  kt('KTT-DEMO-H1', { quet: '2026-10-17 12:00:00', gioDi: '2026-10-19 06:20:00', bd10: 'BD10-KD1-H', hoan: true });
  capOk(BAY_GIO);
}
const Q = '?tu=2026-10-11&den=2026-10-23';
const CA = { tu: '2026-10-11', den: '2026-10-23' };
async function goi(url, who, init = {}) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...(init.headers || {}) };
  const res = await fetch(`${ctx.baseUrl}${url}`, { method: 'GET', ...init, headers });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null, headers: res.headers, res };
}
const nn = (lt, moc = 'quet_tui_den') => lt.tong_cong.chi_tieu_14h.theo_moc[moc].nguyen_nhan;
const dem = (x) => ['A', 'B', 'C', 'D', 'E'].map((k) => x[k].shbg);

// ---------- hàm thuần ----------
test('thứ trong tuần theo ngày đến D (Chủ nhật 11/10, 18/10, 25/10, 01/11; 12/10 là thứ Hai) và loại ngày', () => {
  assert.deepEqual(['2026-10-11', '2026-10-12', '2026-10-17', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-02'].map(KD.thuCua), ['CN', '2', '7', 'CN', 'CN', 'CN', '2']);
  assert.equal(KD.loaiNgay('CN'), 'chu_nhat');
  assert.equal(KD.loaiNgay('7'), 'thuong');
  assert.equal(KD.thuCua('sai'), null);
});

test('phanNhom (P2: A ưu tiên B): sát giờ là A dù đúng hay trượt chuyến kế; trượt không sát giờ là B; đúng chuyến là C; còn lại là D; chưa đi quá chỉ tiêu là E; đạt là null', () => {
  const kdat = { trangThai: 'KHONG_DAT', chuaDiQuaChiTieu: false };
  assert.deepEqual(KD.phanNhom(kdat, { denSatGio: true, trangThai: 'DUNG_CHUYEN' }), { nhom: 'A', lyDo: 'SAT_GIO_DUNG_CHUYEN', truotChuyenKe: false, daDi: true });
  assert.deepEqual(KD.phanNhom(kdat, { denSatGio: true, trangThai: 'TRE_CHUYEN' }), { nhom: 'A', lyDo: 'SAT_GIO_TRUOT_CHUYEN_KE', truotChuyenKe: true, daDi: true });
  assert.equal(KD.phanNhom(kdat, { denSatGio: false, trangThai: 'TRE_CHUYEN' }).nhom, 'B');
  assert.equal(KD.phanNhom(kdat, { denSatGio: false, trangThai: 'DUNG_CHUYEN' }).nhom, 'C');
  assert.equal(KD.phanNhom(kdat, { denSatGio: false, trangThai: 'KHONG_AP_DUNG' }).nhom, 'D', 'lưới an toàn');
  assert.equal(KD.phanNhom(kdat, null).nhom, 'D');
  const e = KD.phanNhom({ trangThai: 'CHUA_DI', chuaDiQuaChiTieu: true }, { denSatGio: true, trangThai: 'LO_CHUYEN' });
  assert.deepEqual([e.nhom, e.lyDo, e.daDi], ['E', 'CHUA_DI_QUA_CHI_TIEU_SAT_GIO', false]);
  assert.equal(KD.phanNhom({ trangThai: 'CHUA_DI', chuaDiQuaChiTieu: false }, {}), null);
  assert.equal(KD.phanNhom({ trangThai: 'DAT', chuaDiQuaChiTieu: false }, {}), null);
  assert.deepEqual([0, 1, 2, 3, 9, NaN].map(KD.khungSoChuyen), ['0', '1', '2', '3_tro_len', '3_tro_len', '0']);
});

// ---------- biên chuyến, qua đêm, Chủ nhật nghỉ chuyến, phường 12 giờ (hàm thuần + bộ cộng) ----------
function lichMacDinh() { const d = new Database(':memory:'); ensureKttSchema(d); datLichKichBan(d); const r = L.docLichChuyen(d); d.close(); return r; }
function cubeCua(quet, { maBcvh = HY, tenPhuong = null, gioDi = null } = {}) {
  const l = lichMacDinh();
  const ngu = { lich: l.lich, hanPhut: l.hanDenTruocChuyenPhut, bayGio: BAY_GIO };
  const u = { ngayDen: quet.slice(0, 10), nhom: 'BCVH_HUE', maBcvh, quetDen: quet, xndBd10: quet, gioBd10Di: gioDi, tenPhuong, nguonHang: 'khai_thac', gam: 1000, bd10Den: 'X' };
  const kq = S.phanLoaiShbg(u, ngu);
  const bo = KD.taoBo();
  bo.them(u, kq, ngu);
  const o = [...bo.nang().cube.values()];
  assert.equal(o.length, 1);
  return { o: o[0], kq };
}
test('biên an toàn: đến đúng hạn (biên 0), 1 phút trước hạn (biên 1), 1 giây sau hạn (sang chuyến kế, sát giờ)', () => {
  // thứ Bảy 17/10, Hương Thủy: chuyến 12:30 có hạn 11:30:00
  const dung = cubeCua('2026-10-17 11:30:00').o;
  assert.deepEqual([dung.sat[30], dung.sat[60], dung.sat[90]], [1, 1, 1]);
  assert.equal(dung.bienSum, 0);
  assert.equal(cubeCua('2026-10-17 11:30:00').kq.chuyen.gio_xuat_phat, '12:30');
  const truoc = cubeCua('2026-10-17 11:29:00');
  assert.equal(truoc.o.bienSum, 1);
  assert.equal(truoc.kq.chuyen.gio_xuat_phat, '12:30');
  const sau = cubeCua('2026-10-17 11:30:01');
  assert.equal(sau.kq.chuyen.ngay, '2026-10-19', 'quá hạn 1 giây: lỡ chuyến 12:30, sang thứ Hai 06:30 (Chủ nhật nghỉ)');
  assert.equal(sau.o.sat[90], 0, 'biên đến chuyến kế rất lớn: không còn sát giờ theo biên an toàn');
  assert.ok(sau.o.bienSum > 40 * 60);
  const dg = C.danhGiaChuyenLich({ quetDen: '2026-10-17 11:30:01', gioDi: null, bay_gio: BAY_GIO, maBcvh: HY, lich: lichMacDinh().lich, hanPhut: 60 });
  assert.equal(dg.denSatGio, true, 'denSatGio (quy tắc cũ, khung (hạn, giờ rời]) vẫn đúng');
  // ngưỡng 30/60/90 là tham số: đến 11:00 -> biên 30; 10:30 -> biên 60; 10:00 -> biên 90; 09:59:59 -> biên 90,02
  for (const [quet, mong] of [['2026-10-17 11:00:00', [1, 1, 1]], ['2026-10-17 10:30:00', [0, 1, 1]], ['2026-10-17 10:00:00', [0, 0, 1]], ['2026-10-17 09:59:59', [0, 0, 0]]]) {
    const o = cubeCua(quet).o;
    assert.deepEqual([o.sat[30], o.sat[60], o.sat[90]], mong, quet);
  }
});
test('qua đêm: đến 23:00 vào chuyến 06:30 hôm sau, chờ theo lịch 0 giờ (bỏ 21:00–07:00), dư địa bằng cả chỉ tiêu; Chủ nhật nghỉ chuyến: đến thứ Bảy 13:00 chờ tới thứ Hai 06:30 → dư địa âm', () => {
  const dem0 = cubeCua('2026-10-16 23:00:00').o;
  const cu = Object.keys(dem0.choH);
  assert.equal(dem0.choMax, 0);
  assert.equal(dem0.duMin, 14 * 60);
  assert.deepEqual(cu, ['0']);
  const cn = cubeCua('2026-10-17 13:00:00');
  assert.equal(cn.kq.chuyen.ngay, '2026-10-19');
  assert.equal(cn.o.choMax, 22, '13:00→21:00 = 8 giờ, Chủ nhật 07:00→21:00 = 14 giờ, thứ Hai 07:00 → 06:30: 0');
  assert.equal(cn.o.duMin, (14 - 22) * 60);
});
test('phường Thuận Hóa / Phú Xuân: chỉ tiêu 12 giờ → dư địa nhỏ hơn đúng 2 giờ so với phường khác cùng BCVH', () => {
  const x = cubeCua('2026-10-20 05:30:00', { maBcvh: TH, tenPhuong: 'Phường Thuận Hóa' });
  const y = cubeCua('2026-10-20 05:30:00', { maBcvh: TH, tenPhuong: 'Phường Kim Long' });
  assert.equal(x.kq.chiTieu14h.xnd.chiTieuGio, 12);
  assert.equal(y.kq.chiTieu14h.xnd.chiTieuGio, 14);
  assert.equal(y.o.duMin - x.o.duMin, 120);
  assert.equal(x.o.choMax, y.o.choMax);
});

// ---------- lõi: nhóm A–E, đẳng thức, kg ----------
test('nhóm A–E đúng đáp án tính tay; A+B+C+D = khong_dat; E = chua_di_da_qua_chi_tieu; A–E = dat_khong_dat.khong_dat — cả hai mốc', () => {
  duLieu();
  const lt = QL.luuThoatTheoNgay(db, { tuNgay: CA.tu, denNgay: CA.den, bayGio: BAY_GIO });
  for (const moc of ['xnd', 'quet_tui_den']) {
    const x = lt.tong_cong.chi_tieu_14h.theo_moc[moc];
    const n = x.nguyen_nhan;
    assert.deepEqual(dem(n), [2, 3, 1, 0, 2], moc);
    assert.equal(n.tong.da_di.shbg, x.khong_dat, `${moc}: A+B+C+D = khong_dat`);
    assert.equal(n.E.shbg, x.chua_di_da_qua_chi_tieu, `${moc}: E = chua_di_da_qua_chi_tieu`);
    assert.equal(n.tong.ca_chua_di.shbg, n.tong.da_di.shbg + n.E.shbg);
    assert.equal(x.khong_dat, 6);
    assert.equal(x.do_duoc, 7, 'đo được = đạt (D1) + không đạt đã đi; E không vào mẫu số');
    assert.equal(n.truot_chuyen_ke, 1);
    assert.deepEqual({ ...n.b_theo_so_chuyen_tre }, { '1': 0, '2': 1, '3_tro_len': 2 });
    assert.deepEqual({ ...n.e_theo_so_chuyen_tre }, { '0': 0, '1': 0, '2': 0, '3_tro_len': 2 });
    assert.equal(n.e_sat_gio, 1);
  }
  const b = lt.tong_cong.chi_tieu_14h.theo_moc.quet_tui_den.nguyen_nhan;
  // khối cũ dat_khong_dat (mốc A mặc định) trộn đã đi và chưa đi: = A–E
  assert.equal(lt.tong_cong.dat_khong_dat.khong_dat, b.tong.ca_chua_di.shbg);
  assert.equal(lt.tong_cong.dat_khong_dat.khong_dat, 8);
  const lb = QL.luuThoatTheoNgay(db, { tuNgay: CA.tu, denNgay: CA.den, bayGio: BAY_GIO, mocChiTieu: 'quet_tui_den' });
  assert.equal(lb.tong_cong.dat_khong_dat.khong_dat, 8);
  // theo BCVH: cộng 6 BCVH = tổng; hàng hoàn không có nhóm nguyên nhân
  const tongBcvh = Object.values(lt.tong_cong.theo_bcvh).reduce((s, k) => s + k.chi_tieu_14h.theo_moc.xnd.nguyen_nhan.tong.ca_chua_di.shbg, 0);
  assert.equal(tongBcvh, 8);
  assert.equal(lt.tong_cong.hang_hoan.chi_tieu_14h.theo_moc.xnd.nguyen_nhan, undefined, 'hàng hoàn loại khỏi A–E');
  // hai cờ nguồn cộng lại = tổng
  const nh = lt.tong_cong.theo_nguon_hang;
  assert.equal(nh.khai_thac.tong.chi_tieu_14h.theo_moc.xnd.nguyen_nhan.tong.ca_chua_di.shbg + nh.chuyen_tiep.tong.chi_tieu_14h.theo_moc.xnd.nguyen_nhan.tong.ca_chua_di.shbg, 8);
});

test('đẳng thức theo từng ngày; ghepKhoang từng ngày = tính cả khoảng (kể cả khối nguyen_nhan); khối nặng đi kèm kết quả nhưng KHÔNG vào JSON', () => {
  duLieu();
  const toanKhoang = QL.luuThoatTheoNgay(db, { tuNgay: CA.tu, denNgay: CA.den, bayGio: BAY_GIO });
  const ngay = [];
  for (let d = CA.tu; d <= CA.den; d = L.dinhDang(L.giayCua(`${d} 00:00:00`) + 86400).slice(0, 10)) ngay.push(QL.luuThoatTheoNgay(db, { tuNgay: d, denNgay: d, bayGio: BAY_GIO }));
  assert.deepEqual(JSON.parse(JSON.stringify(QL.ghepKhoang(ngay))), JSON.parse(JSON.stringify(toanKhoang)));
  for (const n of toanKhoang.theo_ngay) {
    const x = n.tong.chi_tieu_14h.theo_moc.quet_tui_den;
    assert.equal(x.nguyen_nhan.tong.da_di.shbg, x.khong_dat, n.ngay);
    assert.equal(x.nguyen_nhan.E.shbg, x.chua_di_da_qua_chi_tieu, n.ngay);
  }
  assert.ok(toanKhoang.nang.length === 13 && !Object.keys(toanKhoang).includes('nang'));
  assert.equal(JSON.stringify(toanKhoang).includes('BD10-KD1'), false, 'không lộ số hiệu BD10 trong /luu-thoat');
  assert.deepEqual(QL.ghepKhoang(ngay).nang.length, 13);
});

test('khối lượng: 0 g hoặc thiếu = «không rõ» (shbg_thieu_kg, không cộng kg); ô toàn thiếu kg trả kg null; kg còn lại cộng đúng', () => {
  duLieu();
  const lt = QL.luuThoatTheoNgay(db, { tuNgay: CA.tu, denNgay: CA.den, bayGio: BAY_GIO });
  const n = nn(lt);
  // B gồm B1 (0 g → không rõ), B3 và BS (1 kg mỗi cái)
  assert.deepEqual({ ...n.B }, { shbg: 3, kg: 2, shbg_thieu_kg: 1 });
  assert.deepEqual({ ...n.D }, { shbg: 0, kg: 0, shbg_thieu_kg: 0 });
  assert.equal(n.tong.da_di.kg, 6 - 1);
  // một ô chỉ có SHBG 0 g → kg null
  db.exec('DELETE FROM ktt_buu_gui; DELETE FROM ktt_tui;');
  kt('KTT-DEMO-Z1', { quet: '2026-10-17 10:00:00', gioDi: '2026-10-19 07:00:00', gam: 0 });
  const l2 = QL.luuThoatTheoNgay(db, { tuNgay: '2026-10-17', denNgay: '2026-10-17', bayGio: BAY_GIO });
  assert.deepEqual({ ...nn(l2).B }, { shbg: 1, kg: null, shbg_thieu_kg: 1 });
  assert.deepEqual({ ...nn(l2).A }, { shbg: 0, kg: 0, shbg_thieu_kg: 0 });
});

// ---------- API ----------
test('quyền: route mới và xlsx: không token 401; ADMIN, TTVH, TTKT 200; GDVH, TIVI 403; chỉ GET', async () => {
  duLieu();
  for (const url of [`/api/ktt/luu-thoat/khong-dat-14h${Q}`, `/api/ktt/xuat/khong-dat-14h${Q}`, `/api/ktt/chi-tiet${Q}&loai=khong_dat_14h`]) {
    assert.equal((await goi(url)).status, 401, url);
    for (const w of ['admin', 'ttvh', 'ttkt']) assert.equal((await goi(url, w)).status, 200, `${w} ${url}`);
    for (const w of ['gdvh', 'tivi']) assert.equal((await goi(url, w)).status, 403, `${w} ${url}`);
    assert.equal((await goi(url, 'admin', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 404, url);
  }
});

test('tham số: sai/thiếu -> 400 tiếng Việt, không lỗi 500', async () => {
  duLieu();
  const base = '/api/ktt/luu-thoat/khong-dat-14h';
  for (const [q, ma] of [['', 'KTT_THIEU_THAM_SO'], [`${Q}&thu=8`, 'KTT_THU_SAI'], [`${Q}&nguon_hang=abc`, 'KTT_NGUON_HANG_SAI'], [`${Q}&bien_sat_gio_phut=45`, 'KTT_BIEN_SAT_GIO_SAI'], [`${Q}&top=0`, 'KTT_TOP_SAI'], [`${Q}&ma_bcvh=999999`, 'KTT_BCVH_SAI'], [`${Q}&la=1`, 'KTT_THAM_SO_LA']]) {
    const r = await goi(`${base}${q}`, 'admin');
    assert.equal(r.status, 400, q);
    assert.equal(r.body.ma, ma, q);
    assert.match(r.body.error, /\S/);
  }
  const ct = `/api/ktt/chi-tiet${Q}&loai=khong_dat_14h`;
  for (const [q, ma] of [['&nhom_nguyen_nhan=Z', 'KTT_NHOM_SAI'], ['&gio_den=24', 'KTT_GIO_SAI'], ['&chuyen=7h', 'KTT_CHUYEN_SAI'], ['&thu=1', 'KTT_THU_SAI'], ['&moc_chi_tieu=abc', 'KTT_MOC_SAI']]) {
    const r = await goi(ct + q, 'admin');
    assert.equal(r.status, 400, q);
    assert.equal(r.body.ma, ma, q);
  }
  const la = await goi(`/api/ktt/chi-tiet${Q}&loai=t1&gio_den=5`, 'admin');
  assert.deepEqual([la.status, la.body.ma], [400, 'KTT_THAM_SO_LA'], 'tham số nhóm nguyên nhân chỉ dùng với loai=khong_dat_14h');
});

test('route mới: tổng khớp /luu-thoat; tỷ lệ = không đạt đã đi / đo được (E không vào mẫu số); mọi bảng cộng lại bằng tổng; cả hai mốc', async () => {
  duLieu();
  const lt = (await goi(`/api/ktt/luu-thoat${Q}`, 'admin')).body;
  const r = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}`, 'admin')).body;
  assert.equal(r.co_du_lieu, true);
  assert.equal(r.bien_sat_gio_phut, 60);
  for (const moc of ['xnd', 'quet_tui_den']) {
    const t = r.tong.theo_moc[moc];
    const g = lt.tong_cong.chi_tieu_14h.theo_moc[moc];
    assert.equal(t.khong_dat_da_di, g.khong_dat);
    assert.equal(t.chua_di_qua_chi_tieu, g.chua_di_da_qua_chi_tieu);
    assert.equal(t.do_duoc, g.do_duoc);
    assert.equal(t.ty_le_khong_dat, g.khong_dat / g.do_duoc, 'tỷ lệ chuẩn = không đạt đã đi / đo được');
    assert.deepEqual(['A', 'B', 'C', 'D', 'E'].map((k) => t.nhom[k].shbg), [2, 3, 1, 0, 2]);
    assert.equal(t.tong.ca_chua_di.shbg, 8);
    assert.notEqual(t.ty_le_khong_dat, t.tong.ca_chua_di.shbg / t.do_duoc, 'không trộn E vào tỷ lệ');
  }
  assert.equal(r.tong.shbg, lt.tong_cong.tong_shbg, 'mẫu số cùng phạm vi khối tong (không hàng hoàn)');
  const bang = ['theo_ngay', 'theo_thu', 'theo_nguon_hang', 'theo_bcvh', 'theo_bcvh_loai_ngay', 'theo_duong_thu', 'theo_gio_den', 'theo_gio_duong_thu', 'theo_bcvh_chuyen'];
  for (const ten of bang) for (const moc of ['xnd', 'quet_tui_den']) {
    const s = (f) => r[ten].reduce((a, x) => a + f(x.theo_moc[moc]), 0); // khong_dat_da_di, chua_di_qua_chi_tieu: số
    assert.equal(s((m) => m.khong_dat_da_di), 6, `${ten} ${moc}`);
    assert.equal(s((m) => m.chua_di_qua_chi_tieu), 2, `${ten} ${moc}`);
  }
  for (const ten of bang.filter((x) => x !== 'theo_bcvh_chuyen')) assert.equal(r[ten].reduce((a, x) => a + x.shbg, 0), r.tong.shbg, ten);
  assert.equal(r.phan_bo_cho.reduce((a, x) => a + x.theo_moc.quet_tui_den.khong_dat_da_di, 0), 6);
  assert.deepEqual(r.theo_thu.map((x) => x.thu), ['2', '6', '7', 'CN'], 'thứ Hai (D1), thứ Sáu (N1), thứ Bảy, Chủ nhật; sắp theo thứ');
  const cn = r.theo_thu.find((x) => x.thu === 'CN');
  assert.equal(cn.theo_moc.quet_tui_den.nhom.B.shbg, 1, 'SHBG B ngày đến Chủ nhật 11/10');
  const loai = Object.fromEntries(r.theo_bcvh_loai_ngay.map((x) => [`${x.ma_bcvh}|${x.loai_ngay}`, x]));
  assert.equal(loai[`${HY}|chu_nhat`].theo_moc.quet_tui_den.khong_dat_da_di, 1);
  assert.equal(loai[`${HY}|thuong`].theo_moc.quet_tui_den.khong_dat_da_di, 5);
  // lọc: thu=CN
  const lc = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}&thu=CN`, 'admin')).body;
  assert.equal(lc.tong.theo_moc.quet_tui_den.khong_dat_da_di, 1);
  assert.equal(lc.tong.theo_moc.quet_tui_den.chua_di_qua_chi_tieu, 0);
  const lh = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}&nguon_hang=chuyen_tiep`, 'admin')).body;
  assert.equal(lh.tong.theo_moc.quet_tui_den.tong.ca_chua_di.shbg, 0, 'toàn dữ liệu giả là hàng khai thác');
  const ld = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}&nguon=DT-B`, 'admin')).body;
  assert.equal(ld.tong.theo_moc.quet_tui_den.khong_dat_da_di, 1);
  assert.equal(ld.theo_duong_thu[0].nguon_ten, 'Tên DT-B');
});

test('dư địa theo giờ: ô giờ × BCVH × loại ngày; đợt đến xếp theo số không đạt đã đi, cột chua_di_qua_chi_tieu riêng; tham số bien_sat_gio_phut', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}&bien_sat_gio_phut=30&top=3`, 'admin')).body;
  assert.equal(r.bien_sat_gio_phut, 30);
  const o = r.du_dia_theo_gio.find((x) => x.gio === 10 && x.ma_bcvh === HY && x.loai_ngay === 'thuong');
  assert.ok(o, 'ô giờ 10, Hương Thủy, ngày thường');
  assert.equal(o.shbg, 3, 'B1, B3, E1 đến 10:00 thứ Bảy');
  assert.equal(o.bien_an_toan_phut.tb, 90);
  assert.equal(o.cho_theo_lich_gio.max, 2.5, 'chờ THEO LỊCH tới chuyến 12:30 thứ Bảy (không phải chờ thực tế tới giờ lập BD10 đi)');
  assert.equal(o.du_dia_gio.min, 14 - 2.5);
  assert.equal(o.sat_gio['30'], 0);
  assert.ok(!('vua_lo' in o), 'đã bỏ «vừa lỡ chuyến»');
  const cn = r.du_dia_theo_gio.find((x) => x.gio === 10 && x.ma_bcvh === HY && x.loai_ngay === 'chu_nhat');
  assert.equal(cn.shbg, 1);
  assert.ok(r.dot_den.length <= 3 && r.dot_den.length >= 2);
  const kd = r.dot_den.map((d) => d.khong_dat_da_di);
  assert.deepEqual(kd, [...kd].sort((a, b) => b - a), 'xếp giảm dần theo không đạt đã đi');
  const top = r.dot_den[0];
  assert.equal(top.khong_dat_da_di, 2);
  assert.equal(top.chua_di_qua_chi_tieu, 1, 'hai đợt cùng 2 không đạt đã đi; cột chưa đi quá chỉ tiêu (E) đứng riêng, đợt A đứng trước theo mã');
  assert.equal(top.shbg, 3);
  assert.ok(top.bd10_den && top.nhan && top.chuyen_ke && 'bien_an_toan_phut' in top && 'du_dia_gio' in top && top.sat_gio.bien_sat_gio_phut === 30);
  assert.ok(r.dot_den.some((d) => d.chua_di_qua_chi_tieu > 0), 'đợt có SHBG chưa đi quá chỉ tiêu hiện ở cột riêng');
  // kg: đợt B có 1 SHBG 0 g
  const dotB = r.dot_den.find((d) => d.bd10_den === 'BD10-KD1-B');
  assert.deepEqual([dotB.kg, dotB.shbg_thieu_kg], [2, 1]);
});

test('chi-tiet loai=khong_dat_14h dựa chiTieu14h[m]: số dòng = nhóm tương ứng; tất cả (A–E) ≠ chi_tieu_14h.khong_dat (3.084 vs 844 ở dữ liệu thật: ở đây 8 vs 6); lọc giờ / chuyến / thứ / nguồn hàng', async () => {
  duLieu();
  const r = (await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}`, 'admin')).body;
  const tong = async (q) => (await goi(`/api/ktt/chi-tiet${Q}&loai=khong_dat_14h&page_size=200${q}`, 'admin')).body;
  for (const moc of ['xnd', 'quet_tui_den']) {
    const t = r.tong.theo_moc[moc];
    assert.equal((await tong(`&moc_chi_tieu=${moc}`)).pagination.total, 8, `${moc} tất cả = A–E`);
    assert.notEqual((await tong(`&moc_chi_tieu=${moc}`)).pagination.total, t.khong_dat_da_di, 'không nhầm hai tập');
    for (const k of ['A', 'B', 'C', 'D', 'E']) assert.equal((await tong(`&moc_chi_tieu=${moc}&nhom_nguyen_nhan=${k}`)).pagination.total, t.nhom[k].shbg, `${moc} ${k}`);
  }
  const a = (await tong('&moc_chi_tieu=quet_tui_den&nhom_nguyen_nhan=A')).items;
  assert.deepEqual(a.map((x) => [x.nhom_nguyen_nhan, x.truot_chuyen_ke, x.ly_do_xep_nhom]).sort(), [['A', false, 'SAT_GIO_DUNG_CHUYEN'], ['A', true, 'SAT_GIO_TRUOT_CHUYEN_KE']].sort());
  assert.ok(a.every((x) => x.thu === '7' && x.sat_gio === true && x.moc_chi_tieu === 'quet_tui_den' && x.mo_ta_ly_do_xep_nhom));
  assert.equal((await tong('&moc_chi_tieu=quet_tui_den&gio_den=10')).pagination.total, 4, 'B1, B3, E1 (thứ Bảy 10:00) và BS (Chủ nhật 10:00)');
  assert.equal((await tong('&moc_chi_tieu=quet_tui_den&gio_den=10&nhom_nguyen_nhan=E')).pagination.total, 1);
  assert.equal((await tong('&moc_chi_tieu=quet_tui_den&chuyen=06:30')).pagination.total, 5, 'chuyến dự kiến 06:30: C1, A1, A2, E2 (thứ Bảy) và BS (Chủ nhật)');
  assert.equal((await tong('&moc_chi_tieu=quet_tui_den&thu=CN')).pagination.total, 1);
  assert.equal((await tong('&moc_chi_tieu=quet_tui_den&nguon_hang=chuyen_tiep')).pagination.total, 0);
  assert.equal((await tong(`&moc_chi_tieu=quet_tui_den&ma_bcvh=${TH}`)).pagination.total, 0);
});

test('xlsx sheet 10: số dòng = chi-tiet = bảng trên màn hình; 27 cột (18 của sheet 7 + 9 cột nhóm nguyên nhân); sheet «10 Không đạt 14 giờ»; kg không rõ để trống', async () => {
  duLieu();
  const res = await goi(`/api/ktt/xuat/khong-dat-14h${Q}&moc_chi_tieu=quet_tui_den&nhom_nguyen_nhan=B`, 'ttkt');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') || '', /KTT_KhongDat14h_MocB_2026-10-11_2026-10-23\.xlsx/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.res.arrayBuffer()));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Thông tin', '10 Không đạt 14 giờ']);
  const ws = wb.getWorksheet('10 Không đạt 14 giờ');
  assert.equal(ws.rowCount - 1, 3);
  assert.equal(ws.getRow(1).cellCount, 27);
  const tt = wb.getWorksheet('Thông tin');
  const doiChieu = []; tt.eachRow((r) => { if (r.getCell(1).value === 'Đối chiếu với màn hình') doiChieu.push(String(r.getCell(2).value)); });
  assert.match(doiChieu[0], /có 3 SHBG: khớp số dòng/);
  const kgCot = 6; const cells = []; ws.eachRow((r, i) => { if (i > 1) cells.push(r.getCell(kgCot).value); });
  assert.equal(cells.filter((x) => x === null || x === undefined).length, 1, 'đúng một SHBG 0 g để trống kg');
  // lỗi tham số vẫn là JSON 400 trước khi gửi header
  const bad = await goi(`/api/ktt/xuat/khong-dat-14h${Q}&gio_den=99`, 'admin');
  assert.equal(bad.status, 400);
});

test('chưa có dữ liệu: route mới trả co_du_lieu false, ly_do CHUA_CO_DU_LIEU, không lỗi', async () => {
  const r = await goi(`/api/ktt/luu-thoat/khong-dat-14h${Q}`, 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.co_du_lieu, false);
  assert.equal(r.body.ly_do, 'CHUA_CO_DU_LIEU');
});

test('kiểm tĩnh: lõi thuần của kttKhongDat14h.js không đọc DB, đồng hồ máy hay Date.parse; không có «vừa lỡ» trong hợp đồng', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'lib', 'kttKhongDat14h.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  assert.doesNotMatch(src, /\.prepare\(|\.exec\(|Date\.now|new Date\(\)|Date\.parse|require\('better-sqlite3'\)/);
  assert.doesNotMatch(src, /vua_lo|vuaLo/);
});
