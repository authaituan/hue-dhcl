// ==========================================
// Test THAMSO-1 (docs/ai/34_THAMSO1_BACKEND_BANG_THAM_SO.md, #94): bảng `tham_so` + nhật ký + lớp đọc tương thích (getter) + API /api/tham-so (chỉ ADMIN).
// Server thật trên DB tạm của harness; CSV / SHBG GIẢ (khung dựng dữ liệu như tests/phat-thang.test.js). Không mạng, không SFTP.
// ==========================================
'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { startTestServer, waitForServer, cleanupDbFiles, closeServer } = require('./helpers/serverHarness');
const { seedUser, loginAs } = require('./helpers/fixtures');
const { cachLySftpEnv } = require('./helpers/khongMang');
const { importArrivalFile, EXPECTED_HEADER } = require('../server/lib/arrivalsImport');
const { VALID_BCVH_CODES } = require('../server/lib/userBcvh');
const TS = require('../server/lib/thamSo');
const KN = require('../server/config/ktt-nap');
const DB_TS = require('../server/config/tham-so');
const MD = require('../server/config/tham-so-mac-dinh');
const CF = require('../server/lib/phatConfig');
const DT = require('../server/config/dashboard-thresholds');
const NN = require('../server/config/nap-nguon');
const TT = require('../server/config/thay-the');
const P = require('../server/lib/phat');
const PD = require('../server/lib/phatDashboard');
const N = require('../server/lib/napNguonDoc');
const XX = require('../server/lib/napNguonXemXet');
const XT = require('../server/lib/thayTheXemTruoc');

const PORT = 5978;
const [M, M2] = VALID_BCVH_CODES;
const USERS = {
  admin: { hrm: 'TS_ADMIN', pass: 'Admin@123', role: 'ADMIN' },
  ttvh: { hrm: 'TS_TTVH', pass: 'Ttvh@123', role: 'TTVH' },
  gdvh: { hrm: 'TS_GDVH', pass: 'Gdvh@123', role: 'GDVH' },
  tivi: { hrm: 'TS_TIVI', pass: 'Tivi@123', role: 'TIVI' }
};
const tokens = {};
const ids = {};
const khoiPhuc = [];
let ctx;
let workDir;
let seq = 0;
let shSeq = 0;

// ---------- dữ liệu giả (như phat-thang.test.js, rút gọn) ----------
const qt = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sh = () => `ZT${String(700000000 + (++shSeq))}VN`;
const rows = [];
function r(rc, ymd, hms, shbg) {
  seq++;
  return {
    Ma_BC_dong: '990001', BC_nhan_BG: rc, Ten_duong_thu: 'Đường A', SHBG: shbg, So_hieu_BD10: '',
    'Thời gian XN túi': `${ymd} ${hms}`, 'Thời gian XN BG': 'NULL', Ngay_gio_XND_BD10: 'NULL', Ngay_gio_XND_BD10_tai_TTKT: 'NULL',
    So_hieu_BD8: `T${seq}`, Khoi_luong_thuc_te: '500', Dich_vu_code: 'R', Ten_dich_vu: 'Dịch vụ giả', Ghi_chu: 'NULL',
    Ten_Xa_Phuong: 'Phường An', Ten_Tinh_Thanh: 'Tỉnh Thử'
  };
}
const hms = (i) => `${String(6 + (i % 15)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`;
function taoHang(rc, ymd, n) {
  const list = [];
  for (let i = 0; i < n; i++) { const s = sh(); list.push(s); rows.push(r(rc, ymd, hms(i), s)); }
  return list;
}
function writeFiles() {
  const groups = new Map();
  for (const row of rows) {
    const k = `${row.BC_nhan_BG}|${row['Thời gian XN túi'].slice(0, 10).replace(/-/g, '')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const [k, rs] of groups) {
    const [rc, ymd] = k.split('|');
    const file = path.join(workDir, 'csv', `HangDen_${rc}_${ymd}_093012.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '﻿' + [EXPECTED_HEADER.map(qt).join(','), ...rs.map((x) => EXPECTED_HEADER.map((h) => qt(x[h] ?? '')).join(','))].join('\r\n') + '\r\n');
    out.push(file);
  }
  return out.sort();
}
function ghiDot(bcvh, items, nhapLuc) {
  const bid = ctx.db.prepare('INSERT INTO phat_batches (bcvh, user_id, nhap_luc, so_nhap) VALUES (?, ?, ?, ?)').run(bcvh, ids.admin, nhapLuc, items.length).lastInsertRowid;
  const his = ctx.db.prepare('INSERT INTO phat_status_history (bcvh, shbg, trang_thai, trang_thai_truoc, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?, ?)');
  const up = ctx.db.prepare(`INSERT INTO phat_status_current (bcvh, shbg, trang_thai, batch_id, nhap_luc) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bcvh, shbg) DO UPDATE SET trang_thai = excluded.trang_thai, batch_id = excluded.batch_id, nhap_luc = excluded.nhap_luc`);
  ctx.db.transaction(() => { for (const [s, tt] of items) { his.run(bcvh, s, tt, null, bid, nhapLuc); up.run(bcvh, s, tt, bid, nhapLuc); } })();
}
function chia(list, plan) {
  const out = [];
  let i = 0;
  for (const [tt, n] of Object.entries(plan)) { for (let k = 0; k < n; k++) { if (tt !== 'CHUA_CO_TT') out.push([list[i], tt]); i++; } }
  return out;
}
const D = (dd) => `2026-10-${dd}`;
const luc = (dd) => `2026-10-${dd}T05:00:00Z`; // 12:00 giờ VN
// M: 01 đủ (6,7 %), 02 CHƯA đủ (đúng 10,0 %), 03 đủ (6,7 %, hôm nay). M2: 03 (36 bưu gửi, dưới sàn xếp hạng 50).
const PLAN = {
  M: { '01': { PTC: 25, PKTC: 3, CHUA_CO_TT: 2 }, '02': { PTC: 30, PKTC: 6, CHUA_CO_TT: 4 }, '03': { PTC: 50, PKTC: 6, CHUA_CO_TT: 4 } },
  M2: { '03': { PTC: 30, PKTC: 4, CHUA_CO_TT: 2 } }
};
const dem = (pl) => Object.values(pl).reduce((a, b) => a + b, 0);

// ---------- gọi API ----------
async function goi(method, url, who, body, raw) {
  const headers = { ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) };
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ctx.baseUrl}${url}`, { method, headers, body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)) });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : null };
}
const get = (who = 'admin') => goi('GET', '/api/tham-so', who);
const put = (body, who = 'admin') => goi('PUT', '/api/tham-so', who, body);
const veMd = (body, who = 'admin') => goi('POST', '/api/tham-so/ve-mac-dinh', who, body);
const nk = (qs = '', who = 'admin') => goi('GET', `/api/tham-so/nhat-ky${qs}`, who);
const sua = (khoa, gia_tri, ly_do = 'Thử nghiệm') => put({ ly_do, thay_doi: [{ khoa, gia_tri }] });
const muc = (b, khoa) => b.tham_so.find((x) => x.khoa === khoa);
const soNhatKy = () => ctx.db.prepare('SELECT COUNT(*) AS n FROM tham_so_nhat_ky').get().n;
const soDong = () => ctx.db.prepare('SELECT COUNT(*) AS n FROM tham_so').get().n;
const nguongDen = (qs = `?bcvh=${M}`) => goi('GET', `/api/arrivals/dashboard/tong-quan-den${qs}`, 'admin');
const kqPhat = (qs = `?bcvh=${M}`) => goi('GET', `/api/arrivals/dashboard/ket-qua-phat${qs}`, 'admin');
const kqThang = (qs = `?bcvh=${M}`) => goi('GET', `/api/arrivals/dashboard/ket-qua-phat-thang${qs}`, 'admin');

before(async () => {
  khoiPhuc.push(cachLySftpEnv());
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhcl-tham-so-test-'));
  ctx = startTestServer({ port: PORT, dbFileName: `dhcl-test-tham-so-${Date.now()}.db` });
  await waitForServer(ctx.baseUrl);
  for (const [k, u] of Object.entries(USERS)) {
    ids[k] = seedUser(ctx.db, { hrmCode: u.hrm, fullName: u.hrm, role: u.role, password: u.pass });
    tokens[k] = (await loginAs(ctx.baseUrl, u.hrm, u.pass)).body.token;
  }
  const st = {};
  st.m01 = taoHang(M, D('01'), dem(PLAN.M['01']));
  st.m02 = taoHang(M, D('02'), dem(PLAN.M['02']));
  st.m03 = taoHang(M, D('03'), dem(PLAN.M['03']));
  st.m2_03 = taoHang(M2, D('03'), dem(PLAN.M2['03']));
  for (const f of writeFiles()) {
    const res = await importArrivalFile(ctx.db, f);
    assert.equal(res.status, 'OK', `${path.basename(f)}: ${res.error}`);
  }
  ghiDot(M, chia(st.m01, PLAN.M['01']), luc('01'));
  ghiDot(M, chia(st.m02, PLAN.M['02']), luc('02'));
  ghiDot(M, chia(st.m03, PLAN.M['03']), luc('03'));
  ghiDot(M2, chia(st.m2_03, PLAN.M2['03']), luc('03'));
  PD.xoaCachePhatThang();
});
after(async () => {
  for (const k of khoiPhuc.reverse()) k();
  await closeServer(ctx.server);
  cleanupDbFiles(ctx.testDbPath, ctx.db);
  fs.rmSync(workDir, { recursive: true, force: true });
});
beforeEach(() => {
  ctx.db.prepare('DELETE FROM tham_so').run();
  ctx.db.prepare('DELETE FROM tham_so_nhat_ky').run();
  ctx.db.prepare('DELETE FROM nap_nguon_da_xem_xet').run();
  ctx.db.prepare("DELETE FROM arrival_import_files WHERE sha256 LIKE 's%'").run(); // file giả của các ca nap-nguon
  TS.khoiTao(ctx.db); // về mặc định
  PD.xoaCachePhatThang();
});

// =====================================================================
// 1. Danh bạ
// =====================================================================
const GETTER_THEO_KHOA = {
  ptc_dat: () => CF.NGUONG_PTC_DAT, chua_co_tt_canh_bao: () => CF.NGUONG_CHUA_CO_TT_CANH_BAO, san_xep_hang_bcvh: () => CF.SAN_XEP_HANG_BCVH,
  nguong_ngang_diem: () => CF.NGUONG_NGANG_DIEM, so_ngay_toi_thieu_so_sanh: () => CF.SO_NGAY_TOI_THIEU_SO_SANH, san_mau_so_so_sanh: () => CF.SAN_MAU_SO_SO_SANH,
  lech_san_luong_trong_ngay_pct: () => DT.DASHBOARD_DEN_THRESHOLDS.LECH_SAN_LUONG.trong_ngay_pct, lech_san_luong_xu_ly_ngay_pct: () => DT.DASHBOARD_DEN_THRESHOLDS.LECH_SAN_LUONG.xu_ly_ngay_pct,
  san_so_sanh_toi_thieu: () => DT.DASHBOARD_DEN_THRESHOLDS.SAN_SO_SANH_TOI_THIEU, san_so_sanh_phuong_xa: () => DT.DASHBOARD_DEN_THRESHOLDS.SAN_SO_SANH_PHUONG_XA,
  gio_bat_dau_danh_gia: () => DT.DASHBOARD_DEN_THRESHOLDS.GIO_BAT_DAU_DANH_GIA, gio_muon: () => DT.DASHBOARD_DEN_THRESHOLDS.GIO_MUON, gio_chuyen_chieu: () => DT.GIO_CHUYEN_CHIEU,
  bd10_chua_xnd_trong_ngay_pct: () => DT.DASHBOARD_DEN_THRESHOLDS.BD10_CHUA_XND.trong_ngay_pct, bd10_chua_xnd_xu_ly_ngay_pct: () => DT.DASHBOARD_DEN_THRESHOLDS.BD10_CHUA_XND.xu_ly_ngay_pct,
  chua_nhan_xu_ly_ngay_tu_ngay: () => DT.DASHBOARD_DEN_THRESHOLDS.CHUA_NHAN.xu_ly_ngay_tu_ngay,
  phuong_xa_tang_cao_pct: () => TS.lay('phuong_xa_tang_cao_pct'), // chưa có hằng số cũ: chỉ có qua lớp đọc
  nguong_mat_shbg_do: () => TT.NGUONG_MAT_SHBG_DO,
  gio_mong_doi_sang: () => NN.GIO_MONG_DOI_SANG, gio_mong_doi_chieu: () => NN.GIO_MONG_DOI_CHIEU, an_han_phut: () => NN.AN_HAN_PHUT,
  nguong_it: () => NN.NGUONG_IT, nguong_nhieu: () => NN.NGUONG_NHIEU, so_tuan_mau: () => NN.SO_TUAN_MAU, toi_thieu_ngay_mau: () => NN.TOI_THIEU_NGAY_MAU,
  ktt_chu_ky_quet_phut: () => KN.CHU_KY_QUET_PHUT, ktt_cho_cap_phut: () => KN.CHO_CAP_PHUT, ktt_cu_gio: () => KN.CU_GIO, ktt_khung_gio_tu: () => KN.KHUNG_GIO_TU,
  ktt_khung_gio_den: () => KN.KHUNG_GIO_DEN, ktt_so_cap_toi_thieu_ngay: () => KN.SO_CAP_TOI_THIEU_NGAY, ktt_gio_chot_ngay: () => KN.GIO_CHOT_NGAY
};
const CHI_DOC = ['nguong_du_so_lieu', 'ranh_gioi_dot', 'khung_gio_den', 'nhom_cho', 'rang_ngay_nap_truoc', 'rang_ngay_nap_sau', 'ty_le_ngoai_khoang_toi_da'];

test('danh bạ: mọi `mac_dinh` khớp hằng số mặc định VÀ giá trị hiệu lực của 4 file hằng số (khi chưa ai chỉnh)', () => {
  const sua = DB_TS.DANH_BA.filter((x) => !x.chi_doc);
  assert.deepEqual(sua.map((x) => x.khoa).sort(), Object.keys(GETTER_THEO_KHOA).sort(), 'đúng 32 khóa sửa được');
  for (const x of sua) {
    assert.deepEqual(x.mac_dinh, MD[x.khoa], x.khoa);
    assert.deepEqual(GETTER_THEO_KHOA[x.khoa](), x.mac_dinh, `getter ${x.khoa}`);
    assert.deepEqual(TS.lay(x.khoa), x.mac_dinh, `lay ${x.khoa}`);
  }
  assert.equal(CF.NGUONG_DU_SO_LIEU, MD.nguong_du_so_lieu);
  assert.equal(NN.RANH_GIOI_DOT, MD.ranh_gioi_dot);
  assert.deepEqual(DB_TS.THEO_KHOA.get('khung_gio_den').mac_dinh, require('../server/config/phat').KHUNG_GIO_DEN);
  assert.deepEqual(DB_TS.THEO_KHOA.get('nhom_cho').mac_dinh, require('../server/config/phat').NHOM_CHO);
});

test('danh bạ: khóa duy nhất; chi_doc đúng danh sách; mọi khóa sửa được có kiểu, min, max và mặc định hợp lệ', () => {
  const ks = DB_TS.DANH_BA.map((x) => x.khoa);
  assert.equal(new Set(ks).size, ks.length);
  assert.deepEqual(DB_TS.DANH_BA.filter((x) => x.chi_doc).map((x) => x.khoa).sort(), [...CHI_DOC].sort());
  const kieuHopLe = ['phan_so', 'thap_phan', 'so_nguyen', 'phan_tram_nguyen', 'gio_nguyen', 'gio_hhmm'];
  for (const x of DB_TS.DANH_BA.filter((y) => !y.chi_doc)) {
    assert.ok(kieuHopLe.includes(x.kieu), `${x.khoa}: kiểu`);
    assert.ok(x.min !== null && x.max !== null, `${x.khoa}: min/max`);
    assert.equal(TS.kiemTraGiaTri(x, x.mac_dinh), null, `${x.khoa}: mặc định phải hợp lệ`);
    assert.ok(DB_TS.NHOM.some((n) => n.ma === x.nhom), `${x.khoa}: nhóm`);
  }
});

test('danh bạ: mọi khóa (kể cả chỉ-đọc) có mo_ta, anh_huong, vi_du, nhin_thay_o không rỗng; ví dụ sửa được có hai vế «Đặt … Đặt …»', () => {
  for (const x of DB_TS.DANH_BA) {
    for (const f of ['nhan', 'mo_ta', 'anh_huong', 'vi_du']) assert.ok(typeof x[f] === 'string' && x[f].trim().length > 10, `${x.khoa}.${f}`);
    assert.ok(Array.isArray(x.nhin_thay_o) && x.nhin_thay_o.length >= 1 && x.nhin_thay_o.every((s) => typeof s === 'string' && s.trim()), `${x.khoa}.nhin_thay_o`);
    if (!x.chi_doc) assert.match(x.vi_du, /Đặt .+Đặt /s, `${x.khoa}: ví dụ hai vế`);
  }
  for (const k of ['gio_mong_doi_sang', 'gio_mong_doi_chieu', 'an_han_phut', 'nguong_it', 'nguong_nhieu', 'so_tuan_mau', 'toi_thieu_ngay_mau']) {
    assert.match(DB_TS.THEO_KHOA.get(k).anh_huong, /Đã xem xét/, `${k}: nêu hậu quả «Đã xem xét»`);
  }
  assert.match(DB_TS.THEO_KHOA.get('gio_muon').mo_ta, /sau_15h/);
  assert.match(DB_TS.THEO_KHOA.get('chua_nhan_xu_ly_ngay_tu_ngay').mo_ta, /cho_tu_1_ngay/);
});

test('danh bạ (THAMSO-3a): không chuỗi nào (nhãn nhóm, mọi trường mọi khóa, thông báo ràng buộc) chứa «THAMSO-» hoặc «viết cứng»', () => {
  const chuoi = [];
  const gom = (v) => { if (typeof v === 'string') chuoi.push(v); else if (Array.isArray(v)) v.forEach(gom); else if (v && typeof v === 'object') Object.values(v).forEach(gom); };
  gom(DB_TS.NHOM); gom(DB_TS.DANH_BA); gom(DB_TS.RANG_BUOC.map((r) => r.thong_bao));
  assert.ok(chuoi.length > 100);
  for (const c of chuoi) assert.ok(!/THAMSO-|viết cứng/i.test(c), c);
});

// Chụp từ `main` (161e68b) TRƯỚC khi sửa: JSON.stringify của từng đối tượng hằng số, đúng thứ tự khóa.
const CHUP = {
  phatConfig: '{"NGUONG_PTC_DAT":0.82,"NGUONG_CHUA_CO_TT_CANH_BAO":0.1,"SAN_XEP_HANG_BCVH":50,"SAN_XEP_HANG_PHUONG_XA":10,"NGUONG_NGANG_DIEM":0.5,"SO_NGAY_TOI_THIEU_SO_SANH":2,"SAN_MAU_SO_SO_SANH":50',
  thresholds: '{"DASHBOARD_DEN_THRESHOLDS":{"GIO_MUON":15,"CHUA_NHAN":{"xu_ly_ngay_tu_ngay":1},"BD10_CHUA_XND":{"xu_ly_ngay_pct":10,"trong_ngay_pct":5},"LECH_SAN_LUONG":{"trong_ngay_pct":15,"xu_ly_ngay_pct":25},"SAN_SO_SANH_TOI_THIEU":50,"SAN_SO_SANH_PHUONG_XA":10,"GIO_BAT_DAU_DANH_GIA":12},"GIO_CHUYEN_CHIEU":10}',
  napNguon: '{"GIO_MONG_DOI_SANG":"09:30","GIO_MONG_DOI_CHIEU":"16:30","AN_HAN_PHUT":60,"RANH_GIOI_DOT":"12:00","SO_NGAY_TOI_DA":62,"NGUONG_IT":0.5,"NGUONG_NHIEU":2.5,"SO_TUAN_MAU":4,"TOI_THIEU_NGAY_MAU":3,"SO_FILE_TOI_DA_LAY_NGAY":20,"SO_O_TOI_DA_LAY_LAI":20,"KICH_THUOC_LUOT_MAC_DINH":20,"KICH_THUOC_LUOT_TOI_DA":100,"LICH_SU_TOI_DA":20,"TIEN_TO_KHOA_THAY_THE":"Khóa tạm của «Thay thế ngày»"}',
  thayThe: '{"NGUONG_MAT_SHBG_DO":0.05,"SO_SHBG_MAU":20,"SO_NGAY_GIU_THUNG_RAC":30,"SO_BAN_SAO_LUU_GIU":5,"DEM_SAO_LUU_BYTE":33554432}'
};

test('tương thích: JSON.stringify các đối tượng hằng số == bản chụp từ main (cùng thứ tự khóa); phatConfig chỉ THÊM NGUONG_DU_SO_LIEU ở cuối', () => {
  assert.equal(JSON.stringify(CF), `${CHUP.phatConfig},"NGUONG_DU_SO_LIEU":0.1}`);
  assert.equal(JSON.stringify(DT), CHUP.thresholds);
  assert.equal(JSON.stringify(NN), CHUP.napNguon);
  assert.equal(JSON.stringify(TT), CHUP.thayThe);
});

test('tương thích: thuộc tính theo tham số là getter ENUMERABLE, không configurable; Object.keys / spread / đóng băng đúng; đối tượng lồng là bản chụp đóng băng', () => {
  for (const o of [CF, DT, NN, TT, DT.DASHBOARD_DEN_THRESHOLDS]) {
    assert.ok(Object.isFrozen(o));
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(o))) { assert.equal(d.enumerable, true, k); assert.equal(d.configurable, false, k); }
  }
  assert.equal(typeof Object.getOwnPropertyDescriptor(CF, 'NGUONG_PTC_DAT').get, 'function');
  assert.equal(Object.getOwnPropertyDescriptor(CF, 'NGUONG_DU_SO_LIEU').get, undefined, 'quy tắc chỉ đọc: giá trị cố định');
  assert.deepEqual(Object.keys({ ...DT.DASHBOARD_DEN_THRESHOLDS }), ['GIO_MUON', 'CHUA_NHAN', 'BD10_CHUA_XND', 'LECH_SAN_LUONG', 'SAN_SO_SANH_TOI_THIEU', 'SAN_SO_SANH_PHUONG_XA', 'GIO_BAT_DAU_DANH_GIA']);
  assert.ok(Object.isFrozen(DT.DASHBOARD_DEN_THRESHOLDS.LECH_SAN_LUONG));
  assert.throws(() => { 'use strict'; CF.NGUONG_PTC_DAT = 1; }, TypeError);
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
});

test('lớp đọc tải riêng (chưa khoiTao, không DB): trả mặc định — chạy tiến trình con chỉ nạp các file hằng số', () => {
  const out = execFileSync(process.execPath, ['-e',
    `const a=require('./server/lib/phatConfig'),b=require('./server/config/dashboard-thresholds'),c=require('./server/config/nap-nguon'),d=require('./server/config/thay-the');
     process.stdout.write(JSON.stringify([a,b,c,d]));`], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(out, JSON.stringify([JSON.parse(`${CHUP.phatConfig},"NGUONG_DU_SO_LIEU":0.1}`), JSON.parse(CHUP.thresholds), JSON.parse(CHUP.napNguon), JSON.parse(CHUP.thayThe)]));
});

// =====================================================================
// 2. API đọc, quyền
// =====================================================================
test('GET /api/tham-so: hình dạng — nhóm, tham_so[39 khóa: 32 sửa được + 7 chỉ-đọc], phien_ban; chưa sửa thì la_mac_dinh true, cap_nhat_* null', async () => {
  const g = await get();
  assert.equal(g.status, 200);
  assert.deepEqual(Object.keys(g.body), ['nhom', 'tham_so', 'phien_ban']);
  assert.equal(g.body.tham_so.length, 39);
  assert.deepEqual(Object.keys(g.body.tham_so[0]), ['khoa', 'nhom', 'nhan', 'mo_ta', 'anh_huong', 'vi_du', 'nhin_thay_o', 'kieu', 'don_vi', 'min', 'max', 'rang_buoc', 'mac_dinh', 'gia_tri', 'la_mac_dinh', 'chi_doc', 'cap_nhat_luc', 'cap_nhat_boi']);
  for (const x of g.body.tham_so) { assert.equal(x.la_mac_dinh, true, x.khoa); assert.equal(x.cap_nhat_luc, null); assert.equal(x.cap_nhat_boi, null); assert.deepEqual(x.gia_tri, x.mac_dinh); }
  assert.deepEqual(g.body.tham_so.filter((x) => x.chi_doc).map((x) => x.khoa).sort(), [...CHI_DOC].sort());
  assert.ok(g.body.nhom.every((n) => g.body.tham_so.some((x) => x.nhom === n.ma)));
  assert.doesNotMatch(JSON.stringify(g.body), /password|token|secret/i);
});

for (const [ten, goiHam] of [
  ['GET /api/tham-so', (who) => get(who)],
  ['PUT /api/tham-so', (who) => put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }] }, who)],
  ['POST /api/tham-so/ve-mac-dinh', (who) => veMd({ ly_do: 'x', khoa: ['ptc_dat'] }, who)],
  ['GET /api/tham-so/nhat-ky', (who) => nk('', who)]
]) {
  test(`quyền ${ten}: ADMIN 200; TTVH, GDVH, TIVI 403; không token 401 — và 403 không ghi gì`, async () => {
    assert.equal((await goiHam('admin')).status, 200);
    for (const who of ['ttvh', 'gdvh', 'tivi']) assert.equal((await goiHam(who)).status, 403, who);
    const pt = ten.split(' ')[0];
    assert.equal((await goi(pt, ten.split(' ')[1], null, pt === 'GET' ? undefined : {})).status, 401);
  });
}

test('quyền: các lần bị 403 / 401 không ghi dòng nào vào tham_so hay nhật ký; ADMIN đổi vai trò khác vẫn bị chặn (GDVH không PUT được)', async () => {
  const n0 = [soDong(), soNhatKy()];
  for (const who of ['ttvh', 'gdvh', 'tivi']) await put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.7 }] }, who);
  await goi('PUT', '/api/tham-so', null, { ly_do: 'x', thay_doi: [] });
  assert.deepEqual([soDong(), soNhatKy()], n0);
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
});

// =====================================================================
// 3. Kiểm tra hợp lệ
// =====================================================================
async function chuaDoi(fn) {
  const truoc = [soDong(), soNhatKy(), TS.phienBan(), JSON.stringify(TS.layNhieu())];
  const res = await fn();
  assert.deepEqual([soDong(), soNhatKy(), TS.phienBan(), JSON.stringify(TS.layNhieu())], truoc, 'yêu cầu bị từ chối không được để lại dấu vết');
  return res;
}

test('kiểm tra kiểu: chuỗi số, null, boolean, mảng, đối tượng, -0, thập phân > 4 chữ số bị từ chối THAM_SO_SAI; không đổi gì', async () => {
  for (const v of ['0.8', null, true, [0.8], { a: 1 }, 'abc', '']) {
    const res = await chuaDoi(() => sua('ptc_dat', v));
    assert.deepEqual([res.status, res.body.ma], [400, 'THAM_SO_SAI'], JSON.stringify(v));
  }
  const am = await chuaDoi(() => goi('PUT', '/api/tham-so', 'admin', undefined, '{"ly_do":"x","thay_doi":[{"khoa":"ptc_dat","gia_tri":-0}]}'));
  assert.deepEqual([am.status, am.body.ma], [400, 'THAM_SO_SAI'], '-0');
  const dai = await chuaDoi(() => sua('ptc_dat', 0.82345));
  assert.deepEqual([dai.status, dai.body.ma], [400, 'THAM_SO_SAI']);
  const nguyen = await chuaDoi(() => sua('san_xep_hang_bcvh', 50.5));
  assert.deepEqual([nguyen.status, nguyen.body.ma], [400, 'THAM_SO_SAI']);
  assert.equal(TS.kiemTraGiaTri(DB_TS.THEO_KHOA.get('ptc_dat'), NaN).code, 'THAM_SO_SAI');
  assert.equal(TS.kiemTraGiaTri(DB_TS.THEO_KHOA.get('ptc_dat'), Infinity).code, 'THAM_SO_SAI');
  assert.equal(TS.kiemTraGiaTri(DB_TS.THEO_KHOA.get('ptc_dat'), -0).code, 'THAM_SO_SAI');
});

test('kiểm tra min / max: biên trong chấp nhận, ngoài biên NGOAI_KHOANG (mỗi kiểu số)', async () => {
  const bang = [
    ['ptc_dat', 0.5, 0.99, 0.49, 1], ['chua_co_tt_canh_bao', 0.01, 0.5, 0.005, 0.51], ['san_xep_hang_bcvh', 1, 1000, 0, 1001],
    ['nguong_ngang_diem', 0.1, 5, 0.05, 5.1], ['so_ngay_toi_thieu_so_sanh', 1, 31, 0, 32], ['lech_san_luong_trong_ngay_pct', 1, 14, 0, 101],
    ['gio_muon', 0, 23, -1, 24], ['an_han_phut', 0, 240, -1, 241], ['nguong_mat_shbg_do', 0.01, 0.2, 0.009, 0.21], ['so_tuan_mau', 4, 12, 0, 13]
  ];
  for (const [k, lo, hi, duoi, tren] of bang) {
    for (const v of [lo, hi]) assert.equal((await sua(k, v)).status, 200, `${k}=${v}`);
    for (const v of [duoi, tren]) {
      const res = await chuaDoi(() => sua(k, v));
      assert.deepEqual([res.status, res.body.ma], [400, 'NGOAI_KHOANG'], `${k}=${v}`);
    }
    await veMd({ ly_do: 'dọn', khoa: [k] });
  }
});

test('kiểm tra giờ HH:MM: định dạng sai THAM_SO_SAI; giờ hợp lệ chấp nhận; ràng buộc sang < 12:00 ≤ chiều', async () => {
  for (const v of ['9:30', '24:00', '09:60', '0930', 930, '09:30:00', ' 09:30']) {
    const res = await chuaDoi(() => sua('gio_mong_doi_sang', v));
    assert.deepEqual([res.status, res.body.ma], [400, 'THAM_SO_SAI'], JSON.stringify(v));
  }
  assert.equal((await sua('gio_mong_doi_sang', '08:00')).status, 200);
  assert.equal(TS.lay('gio_mong_doi_sang'), '08:00');
  assert.equal((await sua('gio_mong_doi_chieu', '12:00')).status, 200, 'chiều == ranh giới 12:00 vẫn hợp lệ (≤)');
  assert.equal((await chuaDoi(() => sua('gio_mong_doi_sang', '12:00'))).body.ma, 'RANG_BUOC', 'sáng phải < 12:00');
  assert.equal((await chuaDoi(() => sua('gio_mong_doi_chieu', '11:59'))).body.ma, 'RANG_BUOC', 'chiều phải ≥ 12:00');
});

test('ràng buộc chéo: tính trên tập SAU khi áp bản sửa — sửa MỘT khóa của cặp phá ràng buộc thì từ chối; sửa cả hai khóa cùng lúc thì chấp nhận', async () => {
  const cap = [
    ['lech_san_luong_trong_ngay_pct', 30, 'lech_san_luong_xu_ly_ngay_pct', 10, 40], ['bd10_chua_xnd_trong_ngay_pct', 12, 'bd10_chua_xnd_xu_ly_ngay_pct', 3, 20]
  ];
  for (const [a, vaPha, b, vbPha, vbOk] of cap) {
    assert.equal((await chuaDoi(() => sua(a, vaPha))).body.ma, 'RANG_BUOC', `${a}=${vaPha}`);
    assert.equal((await chuaDoi(() => sua(b, vbPha))).body.ma, 'RANG_BUOC', `${b}=${vbPha}`);
    assert.equal((await put({ ly_do: 'x', thay_doi: [{ khoa: a, gia_tri: vaPha }, { khoa: b, gia_tri: vbOk }] })).status, 200, 'sửa cả hai cùng lúc');
    await veMd({ ly_do: 'dọn', khoa: [a, b] });
  }
  assert.equal((await chuaDoi(() => sua('nguong_it', 0.96))).body.ma, 'NGOAI_KHOANG');
  assert.equal((await chuaDoi(() => sua('nguong_nhieu', 1.05))).body.ma, 'NGOAI_KHOANG');
  assert.equal((await sua('nguong_it', 0.95)).status, 200);
  assert.equal((await sua('nguong_nhieu', 1.1)).status, 200);
  assert.equal((await chuaDoi(() => sua('toi_thieu_ngay_mau', 5))).body.ma, 'RANG_BUOC', 'ngày mẫu tối thiểu 5 > số tuần mẫu 4');
  assert.equal((await chuaDoi(() => sua('so_tuan_mau', 2))).body.ma, 'RANG_BUOC', 'số tuần mẫu 2 < ngày mẫu tối thiểu 3');
  assert.equal((await put({ ly_do: 'x', thay_doi: [{ khoa: 'so_tuan_mau', gia_tri: 2 }, { khoa: 'toi_thieu_ngay_mau', gia_tri: 2 }] })).status, 200);
});

test('khóa lạ KHOA_LA; khóa chỉ-đọc KHOA_CHI_DOC (nhóm 2 không sửa được, cả khi kèm khóa hợp lệ khác — không ghi gì)', async () => {
  const la = await chuaDoi(() => sua('khong_co_khoa_nay', 1));
  assert.deepEqual([la.status, la.body.ma], [400, 'KHOA_LA']);
  assert.equal((await chuaDoi(() => sua('__proto__', 1))).body.ma, 'KHOA_LA');
  assert.equal((await chuaDoi(() => sua('toString', 1))).body.ma, 'KHOA_LA');
  for (const k of CHI_DOC) {
    const res = await chuaDoi(() => sua(k, DB_TS.THEO_KHOA.get(k).mac_dinh));
    assert.deepEqual([res.status, res.body.ma], [400, 'KHOA_CHI_DOC'], k);
  }
  const lan = await chuaDoi(() => put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'nguong_du_so_lieu', gia_tri: 0.2 }] }));
  assert.equal(lan.body.ma, 'KHOA_CHI_DOC');
  assert.equal(CF.NGUONG_DU_SO_LIEU, 0.1);
});

test('lý do: thiếu / rỗng / toàn khoảng trắng / không phải chuỗi -> THIEU_LY_DO; 201 ký tự -> THAM_SO_SAI; 200 ký tự được và được cắt khoảng trắng', async () => {
  for (const ly of [undefined, '', '   ', 5, null]) {
    const res = await chuaDoi(() => put({ ly_do: ly, thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }] }));
    assert.deepEqual([res.status, res.body.ma], [400, 'THIEU_LY_DO'], JSON.stringify(ly));
  }
  assert.equal((await chuaDoi(() => sua('ptc_dat', 0.8, 'a'.repeat(201)))).body.ma, 'THAM_SO_SAI');
  assert.equal((await sua('ptc_dat', 0.8, `  ${'b'.repeat(200)}  `)).status, 200);
  assert.equal(ctx.db.prepare('SELECT ly_do FROM tham_so_nhat_ky').get().ly_do, 'b'.repeat(200));
});

test('hình dạng thân yêu cầu: không phải đối tượng, trường thừa, thay_doi rỗng / không phải mảng / > 30, phần tử thừa trường, thiếu gia_tri, khóa trùng', async () => {
  const hop = (k) => ({ khoa: k, gia_tri: 0.8 });
  const truong = [
    ['mảng', [] ], ['trường thừa', { ly_do: 'x', thay_doi: [hop('ptc_dat')], them: 1 }], ['thay_doi rỗng', { ly_do: 'x', thay_doi: [] }],
    ['thay_doi không phải mảng', { ly_do: 'x', thay_doi: { khoa: 'ptc_dat', gia_tri: 0.8 } }], ['thiếu thay_doi', { ly_do: 'x' }],
    ['phần tử thừa trường', { ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8, ghi: 1 }] }], ['thiếu gia_tri', { ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat' }] }],
    ['khóa trùng', { ly_do: 'x', thay_doi: [hop('ptc_dat'), hop('ptc_dat')] }], ['phần tử null', { ly_do: 'x', thay_doi: [null] }],
    ['khoa không phải chuỗi', { ly_do: 'x', thay_doi: [{ khoa: 5, gia_tri: 1 }] }]
  ];
  for (const [ten, body] of truong) {
    const res = await chuaDoi(() => put(body));
    assert.deepEqual([res.status, res.body.ma], [400, 'THAM_SO_SAI'], ten);
  }
  const nhieu = Array.from({ length: 31 }, (_, i) => ({ khoa: DB_TS.DANH_BA[i % 32].khoa + (i >= 32 ? 'x' : ''), gia_tri: 1 }));
  assert.equal((await chuaDoi(() => put({ ly_do: 'x', thay_doi: nhieu }))).body.ma, 'THAM_SO_SAI', '31 phần tử');
  assert.equal((await chuaDoi(() => goi('PUT', '/api/tham-so?x=1', 'admin', { ly_do: 'x', thay_doi: [hop('ptc_dat')] }))).body.ma, 'THAM_SO_SAI', 'tham số truy vấn lạ');
});

test('tất cả hoặc không: yêu cầu có phần tử thứ hai sai thì phần tử đầu KHÔNG được ghi (DB, RAM, nhật ký, phiên bản)', async () => {
  const res = await chuaDoi(() => put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'san_xep_hang_bcvh', gia_tri: 0 }] }));
  assert.equal(res.body.ma, 'NGOAI_KHOANG');
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
  assert.equal(muc((await get()).body, 'ptc_dat').la_mac_dinh, true);
});

// =====================================================================
// 4. Ghi / đọc / nhật ký / hoàn mặc định
// =====================================================================
test('PUT một giá trị: 200 trả như GET; ghi `tham_so` (JSON, UTC ISO, mã HRM); nhật ký đủ; phiên bản +1; getter đổi ngay', async () => {
  const p0 = TS.phienBan();
  const res = await put({ ly_do: 'PO yêu cầu hạ mục tiêu', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'gio_muon', gia_tri: 16 }] });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['nhom', 'tham_so', 'phien_ban']);
  const x = muc(res.body, 'ptc_dat');
  assert.deepEqual([x.gia_tri, x.mac_dinh, x.la_mac_dinh, x.cap_nhat_boi], [0.8, 0.82, false, 'TS_ADMIN']);
  assert.match(x.cap_nhat_luc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(res.body.phien_ban, p0 + 1, 'MỘT lần ghi nhiều khóa = MỘT lần tăng phiên bản');
  assert.equal(CF.NGUONG_PTC_DAT, 0.8);
  assert.equal(DT.DASHBOARD_DEN_THRESHOLDS.GIO_MUON, 16);
  const dong = ctx.db.prepare('SELECT * FROM tham_so ORDER BY khoa').all();
  assert.deepEqual(dong.map((d) => [d.khoa, d.gia_tri, d.cap_nhat_boi, d.che_do]), [['gio_muon', '16', 'TS_ADMIN', 'tay'], ['ptc_dat', '0.8', 'TS_ADMIN', 'tay']]);
  const log = ctx.db.prepare('SELECT * FROM tham_so_nhat_ky ORDER BY id').all();
  assert.deepEqual(log.map((l) => [l.khoa, l.gia_tri_cu, l.gia_tri_moi, l.nguoi_ma, l.ly_do, l.loai]), [
    ['ptc_dat', '0.82', '0.8', 'TS_ADMIN', 'PO yêu cầu hạ mục tiêu', 'SUA'], ['gio_muon', '15', '16', 'TS_ADMIN', 'PO yêu cầu hạ mục tiêu', 'SUA']
  ]);
  assert.ok(log.every((l) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(l.thoi_diem_utc)));
});

test('khởi động lại (khoiTao từ DB) giữ nguyên giá trị đã chỉnh', async () => {
  await sua('san_xep_hang_bcvh', 30);
  await sua('gio_mong_doi_sang', '08:45');
  TS.khoiTao(ctx.db);
  assert.equal(CF.SAN_XEP_HANG_BCVH, 30);
  assert.equal(NN.GIO_MONG_DOI_SANG, '08:45');
});

test('gán giá trị BẰNG mặc định: XÓA dòng ghi đè (không ghim), ghi nhật ký loại SUA (khi đang khác mặc định); la_mac_dinh true', async () => {
  await sua('ptc_dat', 0.8);
  assert.equal(soDong(), 1);
  const res = await sua('ptc_dat', 0.82);
  assert.equal(res.status, 200);
  assert.equal(soDong(), 0, 'không còn dòng ghi đè');
  assert.equal(muc(res.body, 'ptc_dat').la_mac_dinh, true);
  assert.equal(muc(res.body, 'ptc_dat').cap_nhat_luc, null);
  const log = ctx.db.prepare('SELECT gia_tri_cu, gia_tri_moi, loai FROM tham_so_nhat_ky ORDER BY id').all();
  assert.deepEqual(log[1], { gia_tri_cu: '0.8', gia_tri_moi: '0.82', loai: 'SUA' });
  const n0 = soNhatKy();
  const dau = await sua('ptc_dat', 0.82); // gán mặc định khi chưa có dòng: THAMSO-1a — bỏ qua, không nhật ký, không tạo dòng
  assert.equal(dau.status, 200);
  assert.equal(soDong(), 0);
  assert.equal(soNhatKy(), n0);
});

test('hoàn về mặc định: theo khóa, ghi nhật ký VE_MAC_DINH với giá trị cũ / mới thật; khóa lạ / chỉ-đọc / trùng / thiếu lý do bị từ chối', async () => {
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'san_xep_hang_bcvh', gia_tri: 30 }] });
  const res = await veMd({ ly_do: 'Hoàn lại', khoa: ['ptc_dat'] });
  assert.equal(res.status, 200);
  assert.equal(muc(res.body, 'ptc_dat').la_mac_dinh, true);
  assert.equal(muc(res.body, 'san_xep_hang_bcvh').la_mac_dinh, false);
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
  assert.deepEqual(ctx.db.prepare("SELECT khoa, gia_tri_cu, gia_tri_moi, loai, ly_do FROM tham_so_nhat_ky WHERE loai = 'VE_MAC_DINH'").all(),
    [{ khoa: 'ptc_dat', gia_tri_cu: '0.8', gia_tri_moi: '0.82', loai: 'VE_MAC_DINH', ly_do: 'Hoàn lại' }]);
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', khoa: ['la'] }))).body.ma, 'KHOA_LA');
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', khoa: ['ranh_gioi_dot'] }))).body.ma, 'KHOA_CHI_DOC');
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', khoa: ['ptc_dat', 'ptc_dat'] }))).body.ma, 'THAM_SO_SAI');
  assert.equal((await chuaDoi(() => veMd({ ly_do: '', khoa: ['ptc_dat'] }))).body.ma, 'THIEU_LY_DO');
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', khoa: [] }))).body.ma, 'THAM_SO_SAI');
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', khoa: ['ptc_dat'], them: 1 }))).body.ma, 'THAM_SO_SAI');
});

test('hoàn về mặc định tat_ca: chỉ khóa đang có ghi đè; không có gì để hoàn thì 200 và KHÔNG ghi nhật ký; khoa + tat_ca cùng lúc bị từ chối', async () => {
  const rong = await veMd({ ly_do: 'x', tat_ca: true });
  assert.equal(rong.status, 200);
  assert.equal(soNhatKy(), 0);
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'an_han_phut', gia_tri: 30 }] });
  const n0 = soNhatKy();
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', tat_ca: true, khoa: ['ptc_dat'] }))).body.ma, 'THAM_SO_SAI');
  assert.equal((await chuaDoi(() => veMd({ ly_do: 'x', tat_ca: 1 }))).body.ma, 'THAM_SO_SAI');
  const res = await veMd({ ly_do: 'Dọn', tat_ca: true });
  assert.equal(res.status, 200);
  assert.ok(res.body.tham_so.every((x) => x.la_mac_dinh));
  assert.equal(soNhatKy() - n0, 2);
  assert.equal(soDong(), 0);
});

test('hoàn về mặc định phá ràng buộc chéo -> RANG_BUOC (so_tuan_mau = 2 và toi_thieu = 2; hoàn toi_thieu về 3 > 2)', async () => {
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'so_tuan_mau', gia_tri: 2 }, { khoa: 'toi_thieu_ngay_mau', gia_tri: 2 }] });
  const res = await chuaDoi(() => veMd({ ly_do: 'x', khoa: ['toi_thieu_ngay_mau'] }));
  assert.deepEqual([res.status, res.body.ma], [400, 'RANG_BUOC']);
});

test('nhật ký: mới trước, đủ trường, lọc theo khóa; phân trang; trả người (mã + tên)', async () => {
  for (let i = 0; i < 5; i++) await sua('san_xep_hang_bcvh', 40 + i, `Lần ${i}`);
  await sua('ptc_dat', 0.8, 'Khác khóa');
  const a = await nk();
  assert.equal(a.status, 200);
  assert.deepEqual(Object.keys(a.body), ['items', 'pagination']);
  assert.deepEqual(Object.keys(a.body.items[0]), ['id', 'khoa', 'loai', 'gia_tri_cu', 'gia_tri_moi', 'thoi_diem', 'nguoi', 'ly_do']);
  assert.deepEqual(a.body.items.map((x) => x.ly_do), ['Khác khóa', 'Lần 4', 'Lần 3', 'Lần 2', 'Lần 1', 'Lần 0']);
  assert.deepEqual(a.body.items[0].nguoi, { ma: 'TS_ADMIN', ten: 'TS_ADMIN' });
  assert.deepEqual([a.body.items[1].gia_tri_cu, a.body.items[1].gia_tri_moi], [43, 44]);
  const k = await nk('?khoa=san_xep_hang_bcvh');
  assert.equal(k.body.pagination.total, 5);
  const p = await nk('?page=2&page_size=2');
  assert.deepEqual([p.body.items.length, p.body.pagination], [2, { total: 6, page: 2, page_size: 2, total_pages: 3 }]);
  assert.deepEqual(p.body.items.map((x) => x.ly_do), ['Lần 3', 'Lần 2']);
  assert.equal((await nk('?page=9')).body.items.length, 0);
});

test('nhật ký: lọc ngày theo giờ Việt Nam (UTC+7), ≤ 92 ngày; tham số sai / lạ / page_size > 100 bị 400', async () => {
  const ins = ctx.db.prepare("INSERT INTO tham_so_nhat_ky (khoa, gia_tri_cu, gia_tri_moi, thoi_diem_utc, nguoi_ma, ly_do, loai) VALUES ('ptc_dat', '0.82', '0.8', ?, 'TS_ADMIN', ?, 'SUA')");
  ins.run('2026-10-10T16:59:59.000Z', 'a'); // 23:59:59 ngày 10 giờ VN
  ins.run('2026-10-10T17:00:00.000Z', 'b'); // 00:00:00 ngày 11 giờ VN
  ins.run('2026-10-11T16:59:59.000Z', 'c'); // 23:59:59 ngày 11
  const ly = async (qs) => (await nk(qs)).body.items.map((x) => x.ly_do).sort();
  assert.deepEqual(await ly('?tu=2026-10-11&den=2026-10-11'), ['b', 'c']);
  assert.deepEqual(await ly('?den=2026-10-10'), ['a']);
  assert.deepEqual(await ly('?tu=2026-10-11'), ['b', 'c']);
  for (const qs of ['?tu=2026-13-01', '?tu=abc', '?den=2026-02-30', '?tu=2026-10-12&den=2026-10-11', '?tu=2026-01-01&den=2026-10-11', '?page=0', '?page=x', '?page_size=101', '?lung=1', '?khoa=khong_co']) {
    assert.equal((await nk(qs)).status, 400, qs);
  }
  assert.equal((await nk('?tu=2026-07-12&den=2026-10-11')).status, 200, 'đúng 92 ngày');
});

test('SECURITY_LOG: ghi sự kiện tham_so_sua / tham_so_ve_mac_dinh với người + khóa + kết quả, KHÔNG ghi lý do và giá trị', async () => {
  await new Promise((rs) => setTimeout(rs, 100));
  const batDau = fs.existsSync(process.env.SECURITY_LOG) ? fs.statSync(process.env.SECURITY_LOG).size : 0;
  await put({ ly_do: 'LY-DO-BI-MAT-12345', thay_doi: [{ khoa: 'san_xep_hang_bcvh', gia_tri: 777 }] });
  await put({ ly_do: 'LY-DO-BI-MAT-12345', thay_doi: [{ khoa: 'san_xep_hang_bcvh', gia_tri: 0 }] });
  await veMd({ ly_do: 'LY-DO-BI-MAT-12345', khoa: ['san_xep_hang_bcvh'] });
  await new Promise((rs) => setTimeout(rs, 200));
  const text = fs.readFileSync(process.env.SECURITY_LOG).subarray(batDau).toString('utf8');
  const dong = text.split('\n').filter((l) => l.includes('"tham_so_')).map((l) => JSON.parse(l));
  assert.deepEqual(dong.map((d) => [d.event, d.ket_qua, d.hrm_code, d.role]), [
    ['tham_so_sua', 'ok', 'TS_ADMIN', 'ADMIN'], ['tham_so_sua', 'NGOAI_KHOANG', 'TS_ADMIN', 'ADMIN'], ['tham_so_ve_mac_dinh', 'ok', 'TS_ADMIN', 'ADMIN']
  ]);
  assert.deepEqual(dong[0].khoa, ['san_xep_hang_bcvh']);
  assert.ok(!text.includes('LY-DO-BI-MAT-12345'));
  assert.ok(!/gia_tri|ly_do|:777\b/.test(text), 'không có trường giá trị / lý do');
});

// =====================================================================
// 5. Tương thích: đổi tham số -> các endpoint hiện có phản ánh NGAY, hình dạng không đổi
// =====================================================================
const KHOA_NGUONG_DEN = ['BD10_CHUA_XND', 'CHUA_NHAN', 'GIO_BAT_DAU_DANH_GIA', 'GIO_MUON', 'LECH_SAN_LUONG', 'SAN_SO_SANH_PHUONG_XA', 'SAN_SO_SANH_TOI_THIEU'];

test('tong-quan-den: `nguong` đúng 7 khóa cũ, phản ánh ghi đè ngay (kể cả đối tượng lồng); sau_15h.tu_gio và chuyen_chieu.tu_gio theo giờ mới; GIO_CHUYEN_CHIEU vẫn ngoài `nguong`', async () => {
  const a = (await nguongDen()).body;
  assert.deepEqual(Object.keys(a.nguong).sort(), KHOA_NGUONG_DEN);
  assert.deepEqual([a.sau_15h.tu_gio, a.chuyen_chieu.tu_gio], [15, 10]);
  await put({ ly_do: 'x', thay_doi: [
    { khoa: 'gio_muon', gia_tri: 16 }, { khoa: 'gio_chuyen_chieu', gia_tri: 11 }, { khoa: 'lech_san_luong_xu_ly_ngay_pct', gia_tri: 30 },
    { khoa: 'bd10_chua_xnd_trong_ngay_pct', gia_tri: 2 }, { khoa: 'chua_nhan_xu_ly_ngay_tu_ngay', gia_tri: 3 }, { khoa: 'san_so_sanh_toi_thieu', gia_tri: 60 },
    { khoa: 'san_so_sanh_phuong_xa', gia_tri: 12 }, { khoa: 'gio_bat_dau_danh_gia', gia_tri: 13 }
  ] });
  const b = (await nguongDen()).body;
  assert.deepEqual(Object.keys(b.nguong).sort(), KHOA_NGUONG_DEN);
  assert.deepEqual(b.nguong, {
    GIO_MUON: 16, CHUA_NHAN: { xu_ly_ngay_tu_ngay: 3 }, BD10_CHUA_XND: { xu_ly_ngay_pct: 10, trong_ngay_pct: 2 }, LECH_SAN_LUONG: { trong_ngay_pct: 15, xu_ly_ngay_pct: 30 },
    SAN_SO_SANH_TOI_THIEU: 60, SAN_SO_SANH_PHUONG_XA: 12, GIO_BAT_DAU_DANH_GIA: 13
  });
  assert.deepEqual([b.sau_15h.tu_gio, b.chuyen_chieu.tu_gio], [16, 11], 'tên khóa sau_15h giữ nguyên');
  assert.ok(!('GIO_CHUYEN_CHIEU' in b.nguong));
});

test('mức điều hành đọc tham số lúc gọi: mucSanLuong / danhGiaSanLuong / mucBd10 / mucChuaNhan đổi mức khi đổi ngưỡng (không dùng bản sao lúc nạp module)', async () => {
  const Q = require('../server/lib/dashboardDenQuery');
  assert.equal(Q.mucSanLuong(120, 100), Q.MUC.TRONG_NGAY, 'lệch 20 % với mặc định 15/25');
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'lech_san_luong_trong_ngay_pct', gia_tri: 21 }, { khoa: 'lech_san_luong_xu_ly_ngay_pct', gia_tri: 40 }] });
  assert.equal(Q.mucSanLuong(120, 100), Q.MUC.BINH_THUONG);
  assert.equal(Q.mucSanLuong(60, 100), Q.MUC.XU_LY_NGAY, 'lệch 40 % = ngưỡng mới «Xử lý ngay»');
  assert.equal(Q.mucBd10(6, 100), Q.MUC.TRONG_NGAY);
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'bd10_chua_xnd_trong_ngay_pct', gia_tri: 7 }] });
  assert.equal(Q.mucBd10(6, 100), Q.MUC.BINH_THUONG);
  assert.equal(Q.danhGiaSanLuong(10, 60, 13).trang_thai !== 'chua_du_du_lieu', true);
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'san_so_sanh_toi_thieu', gia_tri: 70 }] });
  assert.equal(Q.danhGiaSanLuong(10, 60, 13).ly_do, 'moc_duoi_san');
});

test('phuong-xa-tang: THÊM khóa tang_cao_pct ngay sau gioi_han (giá trị = tham số), mọi khóa cũ còn nguyên', async () => {
  const a = (await goi('GET', `/api/arrivals/dashboard/phuong-xa-tang?bcvh=${M}`, 'admin')).body;
  const khoa = Object.keys(a);
  assert.ok(khoa.indexOf('tang_cao_pct') === khoa.indexOf('gioi_han') + 1);
  assert.equal(a.tang_cao_pct, 20);
  console.log('KHOA_PHUONG_XA_TANG', JSON.stringify(khoa));
  await sua('phuong_xa_tang_cao_pct', 35);
  assert.equal((await goi('GET', `/api/arrivals/dashboard/phuong-xa-tang?bcvh=${M}`, 'admin')).body.tang_cao_pct, 35);
});

test('ket-qua-phat: `nguong` đúng 3 khóa, theo ghi đè; xếp hạng theo san_xep_hang_bcvh mới (M2 có 36 bưu gửi: dưới sàn 50, đủ sàn 30)', async () => {
  const all = '?bcvh=all';
  const a = (await kqPhat(all)).body;
  assert.deepEqual(Object.keys(a.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'san_xep_hang_bcvh']);
  assert.deepEqual(a.nguong, { ptc_dat: 0.82, chua_co_tt_canh_bao: 0.1, san_xep_hang_bcvh: 50 });
  assert.ok(a.chua_du_du_lieu.some((x) => x.bcvh === M2 && x.ly_do === 'duoi_san'));
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.9 }, { khoa: 'chua_co_tt_canh_bao', gia_tri: 0.2 }, { khoa: 'san_xep_hang_bcvh', gia_tri: 30 }] });
  const b = (await kqPhat(all)).body;
  assert.deepEqual(b.nguong, { ptc_dat: 0.9, chua_co_tt_canh_bao: 0.2, san_xep_hang_bcvh: 30 });
  assert.ok(b.xep_hang_bcvh.some((x) => x.bcvh === M2), 'M2 nay được xếp hạng');
  assert.ok(!b.chua_du_du_lieu.some((x) => x.bcvh === M2));
});

test('ket-qua-phat-thang: `nguong` 5 khóa theo ghi đè; đổi so_ngay_toi_thieu_so_sanh = 3 thì chênh về null, đổi san_mau_so_so_sanh = 61 cũng vậy', async () => {
  const a = (await kqThang()).body;
  assert.deepEqual(Object.keys(a.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'nguong_ngang_diem', 'so_ngay_toi_thieu_so_sanh', 'san_mau_so_so_sanh']);
  assert.notEqual(a.chenh, null, 'mặc định: 2 ngày đủ, hôm nay 60 ≥ 50');
  await sua('so_ngay_toi_thieu_so_sanh', 3);
  const b = (await kqThang()).body;
  assert.equal(b.chenh, null);
  assert.equal(b.nguong.so_ngay_toi_thieu_so_sanh, 3);
  await veMd({ ly_do: 'x', khoa: ['so_ngay_toi_thieu_so_sanh'] });
  await sua('san_mau_so_so_sanh', 61);
  const c = (await kqThang()).body;
  assert.equal(c.chenh, null);
  assert.equal(c.nguong.san_mau_so_so_sanh, 61);
});

test('nap-nguon: tong-quan trả gio_mong_doi theo tham số (sáng / chiều / ân hạn); trạng thái ô hôm nay đổi theo giờ + ân hạn mới', async () => {
  const a = (await goi('GET', '/api/nap-nguon/tong-quan', 'admin')).body;
  assert.deepEqual(a.gio_mong_doi, { sang: '09:30', chieu: '16:30', an_han_phut: 60 });
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'gio_mong_doi_sang', gia_tri: '08:00' }, { khoa: 'gio_mong_doi_chieu', gia_tri: '15:00' }, { khoa: 'an_han_phut', gia_tri: 30 }] });
  const b = (await goi('GET', '/api/nap-nguon/tong-quan', 'admin')).body;
  assert.deepEqual(b.gio_mong_doi, { sang: '08:00', chieu: '15:00', an_han_phut: 30 });
  const hn = '2026-10-14';
  const at = (g) => { const [h, mi] = g.split(':').map(Number); const k = N.luoi({ db: ctx.db, now: new Date(2026, 9, 14, h, mi, 0), tu: hn, den: hn, bcvh: M }); return k.o.find((x) => x.dot === 'S').trang_thai; };
  assert.equal(at('08:29'), 'CHUA_DEN_GIO');
  assert.equal(at('08:30'), 'CHO_FILE', '08:00 + ân hạn 30 phút');
});

test('nap-nguon: nghi ngờ ít / nhiều theo nguong_it, nguong_nhieu, so_tuan_mau, toi_thieu_ngay_mau mới (trung vị 100 dòng; ngày thử 40 / 300 dòng)', async () => {
  const d0 = '2026-10-07';
  const them = (ymd, n) => {
    seq++;
    ctx.db.prepare(`INSERT INTO arrival_import_files (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, status, error, source, imported_at)
      VALUES (?, ?, ?, '09:30:12', 1000, ?, ?, 'OK', NULL, 'SFTP', '2026-10-14 01:02:03')`).run(M, `HangDen_${M}_${ymd.replace(/-/g, '')}_093012.csv`, ymd, `s${seq}`, n);
  };
  const lui = (k) => { const d = new Date(`${d0}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - k); return d.toISOString().slice(0, 10); };
  for (const k of [7, 14, 21, 28]) them(lui(k), 100);
  const nghi = () => N.luoi({ db: ctx.db, now: new Date(2026, 9, 14, 20, 0, 0), tu: d0, den: d0, bcvh: M }).ngay_bcvh.find((x) => x.ngay === d0).nghi_ngo;
  them(d0, 40);
  assert.equal(nghi(), 'IT');
  await sua('nguong_it', 0.3);
  assert.notEqual(nghi(), 'IT', '40 ≥ 0,3 × 100');
  await veMd({ ly_do: 'x', khoa: ['nguong_it'] });
  assert.equal(nghi(), 'IT');
  ctx.db.prepare('DELETE FROM arrival_import_files WHERE file_date = ?').run(d0);
  them(d0, 300);
  assert.equal(nghi(), 'NHIEU');
  await sua('nguong_nhieu', 3.5);
  assert.notEqual(nghi(), 'NHIEU', '300 ≤ 3,5 × 100');
  await veMd({ ly_do: 'x', khoa: ['nguong_nhieu'] });
  assert.equal(nghi(), 'NHIEU');
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'toi_thieu_ngay_mau', gia_tri: 5 }, { khoa: 'so_tuan_mau', gia_tri: 5 }] });
  assert.equal(nghi(), 'CHUA_DU_MAU', 'chỉ có 4 ngày mẫu, cần ≥ 5');
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'so_tuan_mau', gia_tri: 4 }, { khoa: 'toi_thieu_ngay_mau', gia_tri: 4 }] });
  assert.equal(nghi(), 'NHIEU', 'đủ 4 ngày mẫu');
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'so_tuan_mau', gia_tri: 3 }, { khoa: 'toi_thieu_ngay_mau', gia_tri: 3 }] });
  assert.equal(nghi(), 'NHIEU', 'chỉ lấy 3 tuần, đủ 3');
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'so_tuan_mau', gia_tri: 2 }, { khoa: 'toi_thieu_ngay_mau', gia_tri: 3 }] }).then((r) => assert.equal(r.body.ma, 'RANG_BUOC'));
});

test('«Đã xem xét» khi đổi tham số nạp nguồn (kết quả chạy thử, THAMSO-0 mục 2.2): ô hôm nay CHO_FILE đã xem xét -> đổi giờ mong đợi: mục RỜI cả can_xu_ly lẫn da_xem_xet; trả giá trị cũ thì dấu CŨ CÒN hiệu lực', async () => {
  const hn = '2026-10-14';
  const now = new Date(2026, 9, 14, 11, 0, 0); // 11:00: đợt sáng quá 09:30 + 60 phút
  const luoi = () => N.luoi({ db: ctx.db, now, tu: hn, den: hn, bcvh: M });
  const cx = (k) => k.can_xu_ly.find((x) => x.loai === 'DOT' && x.dot === 'S' && x.ngay === hn);
  assert.equal(cx(luoi()).trang_thai, 'CHO_FILE');
  XX.danhDau({ db: ctx.db, now, user: { hrm_code: 'TS_ADMIN' }, body: { loai: 'DOT', bcvh: M, ngay: hn, dot: 'S' } });
  let k = luoi();
  assert.deepEqual([!!cx(k), k.da_xem_xet.length], [false, 1], 'đã xem xét: rời can_xu_ly, vào da_xem_xet');
  await sua('gio_mong_doi_sang', '11:30');
  k = luoi();
  assert.deepEqual([!!cx(k), k.da_xem_xet.length], [false, 0], 'không còn cần xử lý nên cũng không còn ở «đã xem xét»');
  assert.equal(k.o.find((x) => x.dot === 'S').trang_thai, 'CHUA_DEN_GIO');
  await veMd({ ly_do: 'x', khoa: ['gio_mong_doi_sang'] });
  k = luoi();
  assert.deepEqual([!!cx(k), k.da_xem_xet.length], [false, 1], 'bản ghi được giữ: về giá trị cũ thì dấu cũ còn hiệu lực');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM nap_nguon_da_xem_xet WHERE huy_luc IS NULL').get().n, 1);
});

test('thay-the: mức cảnh báo theo nguong_mat_shbg_do (mất 6 / 100: 5 % -> DO, 10 % -> CAN_XAC_NHAN); nguong_do trả theo tham số', async () => {
  assert.equal(XT.mucCanhBaoTheo(6, 100), 'DO');
  assert.equal(XT.mucCanhBaoTheo(5, 100), 'CAN_XAC_NHAN', 'đúng bằng ngưỡng vẫn là CAN_XAC_NHAN');
  assert.equal(XT.mucCanhBaoTheo(0, 100), 'AN_TOAN');
  await sua('nguong_mat_shbg_do', 0.1);
  assert.equal(XT.mucCanhBaoTheo(6, 100), 'CAN_XAC_NHAN');
  assert.equal(XT.mucCanhBaoTheo(11, 100), 'DO');
  assert.equal(TT.NGUONG_MAT_SHBG_DO, 0.1);
});

// ---------- THAMSO-2a: GET /api/phat/ty-le THÊM khóa `nguong` ----------
const tyLe = (who = 'admin', qs = `?bcvh=${M}`) => goi('GET', `/api/phat/ty-le${qs}`, who);

test('ty-le (a): có khóa `nguong` đúng 3 khóa, đúng giá trị mặc định, cùng hình dạng / thứ tự với ket-qua-phat; nằm CUỐI phản hồi', async () => {
  for (const qs of [`?bcvh=${M}`, '?bcvh=all', `?bcvh=${M}&ngay=${D('02')}`]) {
    const t = (await tyLe('admin', qs)).body;
    assert.deepEqual(Object.keys(t.nguong), ['ptc_dat', 'chua_co_tt_canh_bao', 'san_xep_hang_bcvh'], qs);
    assert.deepEqual(t.nguong, { ptc_dat: 0.82, chua_co_tt_canh_bao: 0.1, san_xep_hang_bcvh: 50 }, qs);
    assert.equal(Object.keys(t).at(-1), 'nguong', qs);
    assert.deepEqual(t.nguong, (await kqPhat(qs)).body.nguong, `cùng nguong với ket-qua-phat (${qs})`);
  }
});

test('ty-le (b): ADMIN PUT /api/tham-so đổi ptc_dat / chua_co_tt_canh_bao / san_xep_hang_bcvh -> ty-le trả giá trị mới NGAY, không khởi động lại; hoàn về mặc định cũng ngay', async () => {
  await put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.9 }, { khoa: 'chua_co_tt_canh_bao', gia_tri: 0.2 }, { khoa: 'san_xep_hang_bcvh', gia_tri: 30 }] });
  assert.deepEqual((await tyLe()).body.nguong, { ptc_dat: 0.9, chua_co_tt_canh_bao: 0.2, san_xep_hang_bcvh: 30 });
  assert.deepEqual((await tyLe()).body.nguong, (await kqPhat()).body.nguong, 'ty-le và ket-qua-phat luôn cùng nguong');
  await sua('ptc_dat', 0.7);
  assert.equal((await tyLe()).body.nguong.ptc_dat, 0.7);
  await veMd({ ly_do: 'x', tat_ca: true });
  assert.deepEqual((await tyLe()).body.nguong, { ptc_dat: 0.82, chua_co_tt_canh_bao: 0.1, san_xep_hang_bcvh: 50 });
});

test('ty-le (c): mọi khóa cũ còn nguyên — phản hồi trừ `nguong` == P.tyLeApi (không đổi), cùng tên, kiểu, thứ tự khóa', async () => {
  for (const qs of [`?bcvh=${M}`, '?bcvh=all', `?bcvh=${M}&ngay=${D('02')}`, `?bcvh=${M2}`]) {
    const t = (await tyLe('admin', qs)).body;
    const { nguong, ...cu } = t;
    const [, bcvh, , ngay] = /bcvh=(\w+)(&ngay=([\d-]+))?/.exec(qs);
    const goc = JSON.parse(JSON.stringify(P.tyLeApi(ctx.db, { bcvh, ngay: ngay || null })));
    assert.deepEqual(Object.keys(cu), Object.keys(goc), `thứ tự khóa ${qs}`);
    assert.deepEqual(cu, goc, `giá trị ${qs}`);
    assert.ok(nguong);
  }
  const t = (await tyLe()).body;
  for (const k of ['bcvh', 'ngay', 'cung_ngay', 'mau_so', 'theo_trang_thai', 'so_shbg_chuyen_tiep_loai_bo', 'theo_khung_gio_den', 'ton_cho']) assert.ok(k in t, k);
});

test('ty-le (d): quyền không đổi — ADMIN, TTVH, GDVH 200; TIVI 403; không token 401; tham số lạ vẫn 400', async () => {
  for (const who of ['admin', 'ttvh', 'gdvh']) { const r = await tyLe(who); assert.equal(r.status, 200, who); assert.ok(r.body.nguong, who); }
  for (const who of ['tivi']) { const r = await tyLe(who); assert.equal(r.status, 403, who); assert.ok(!r.body || !('nguong' in r.body), who); }
  assert.equal((await goi('GET', `/api/phat/ty-le?bcvh=${M}`, null)).status, 401);
  assert.equal((await goi('GET', '/api/phat/ty-le?bcvh=all&lung=1', 'admin')).status, 400);
  assert.equal((await goi('GET', '/api/phat/ty-le?bcvh=xyz', 'admin')).status, 400);
});

// =====================================================================
// 6. Tách ngưỡng «màu» và «đủ số liệu»
// =====================================================================
test('tách ngưỡng: đổi chua_co_tt_canh_bao (0,10 -> 0,50) KHÔNG đổi tập ngày đủ số liệu / lũy kế / chênh; nguong.chua_co_tt_canh_bao đổi', async () => {
  const a = (await kqThang()).body;
  assert.deepEqual(a.theo_ngay.map((x) => x.du_so_lieu), [true, false, true], 'ngày 02 đúng 10,0 % là chưa đủ');
  await sua('chua_co_tt_canh_bao', 0.5);
  PD.xoaCachePhatThang();
  const b = (await kqThang()).body;
  assert.equal(b.nguong.chua_co_tt_canh_bao, 0.5);
  assert.deepEqual(b.theo_ngay.map((x) => x.du_so_lieu), [true, false, true]);
  assert.deepEqual(b.luy_ke, a.luy_ke);
  assert.deepEqual(b.chenh, a.chenh);
  assert.equal((await kqPhat()).body.du_so_lieu, true);
  assert.equal((await kqPhat(`?bcvh=${M}&ngay=${D('02')}`)).body.du_so_lieu, false);
});

test('tách ngưỡng: «đủ số liệu» dùng NGUONG_DU_SO_LIEU cố định — 9,9 % đủ, 10,0 % chưa đủ, 10,1 % chưa đủ, dù mức màu bị chỉnh', async () => {
  const t = (ctt) => ({ mau_so: 1000, theo_trang_thai: { CHUA_CO_TT: { ty_le: ctt } } });
  await sua('chua_co_tt_canh_bao', 0.01);
  assert.deepEqual([PD.duSoLieu(t(0.099)), PD.duSoLieu(t(0.1)), PD.duSoLieu(t(0.101))], [true, false, false]);
  await sua('chua_co_tt_canh_bao', 0.5);
  assert.deepEqual([PD.duSoLieu(t(0.099)), PD.duSoLieu(t(0.1)), PD.duSoLieu(t(0.101))], [true, false, false]);
  assert.equal(PD.duSoLieu({ mau_so: 0, theo_trang_thai: { CHUA_CO_TT: { ty_le: null } } }), false);
});

// =====================================================================
// 7. Cache #93
// =====================================================================
test('cache tầng 1: khóa dựng bởi chuKyTang1 KHÁC khi CHỈ phienBan() đổi (dấu hiệu DB giữ nguyên) — cách (a)', () => {
  const db = ctx.db;
  const d0 = PD.dauHieuDb(db);
  const k0 = PD.chuKyTang1(db);
  TS.__thuDatRam('ptc_dat', 0.9);
  assert.equal(PD.dauHieuDb(db), d0, 'không ghi DB nên dấu hiệu DB không đổi');
  const k1 = PD.chuKyTang1(db);
  assert.notEqual(k1, k0);
  assert.equal(PD.chuKyTang1(db), k1, 'ổn định khi không đổi gì');
  TS.__thuDatRam('ptc_dat', undefined);
});

test('cache tầng 1: đổi giá trị TRONG RAM (không ghi DB) rồi gọi ketQuaPhatThang -> trả `nguong` mới, tầng 2 không tính lại (soLanDemNgay không tăng) — cách (b)', () => {
  const p = { bcvh: M, ngay: null };
  const a = PD.ketQuaPhatThang(ctx.db, [M], p);
  assert.equal(PD.ketQuaPhatThang(ctx.db, [M], p), a, 'lần 2 trúng cache tầng 1');
  const n0 = PD.soLanDemNgay();
  TS.__thuDatRam('nguong_ngang_diem', 1.5);
  const b = PD.ketQuaPhatThang(ctx.db, [M], p);
  assert.notEqual(b, a);
  assert.equal(b.nguong.nguong_ngang_diem, 1.5);
  assert.equal(a.nguong.nguong_ngang_diem, 0.5);
  assert.equal(PD.soLanDemNgay(), n0, 'tầng 2 chỉ lưu số đếm thô: không phải tính lại');
  TS.__thuDatRam('nguong_ngang_diem', undefined);
});

test('cache qua API: PUT -> ket-qua-phat-thang trả giá trị mới ngay, soLanDemNgay không tăng; ket-qua-phat và ket-qua-phat-thang cùng nguong.ptc_dat', async () => {
  await kqThang();
  const n0 = PD.soLanDemNgay();
  for (const v of [0.9, 0.7, 0.6]) {
    await sua('ptc_dat', v);
    const t = (await kqThang()).body;
    const d = (await kqPhat()).body;
    assert.equal(t.nguong.ptc_dat, v);
    assert.equal(d.nguong.ptc_dat, v);
  }
  await sua('nguong_ngang_diem', 2);
  assert.equal((await kqThang()).body.nguong.nguong_ngang_diem, 2);
  assert.equal(PD.soLanDemNgay(), n0);
});

// =====================================================================
// 8. Giá trị hỏng trong DB
// =====================================================================
test('giá trị hỏng trong DB (JSON sai, ngoài khoảng, khóa lạ, khóa chỉ-đọc, phá ràng buộc chéo): bỏ qua, dùng mặc định, ghi console.error KHÔNG kèm giá trị, server vẫn trả lời', async () => {
  const ins = ctx.db.prepare("INSERT INTO tham_so (khoa, gia_tri, cap_nhat_luc, cap_nhat_boi) VALUES (?, ?, '2026-10-17T00:00:00.000Z', 'SUA_TAY')");
  ins.run('ptc_dat', '{khong-phai-json');
  ins.run('san_xep_hang_bcvh', '99999');
  ins.run('khoa_la_xyz', '1');
  ins.run('nguong_du_so_lieu', '0.4');
  ins.run('gio_muon', '17'); // hợp lệ
  ins.run('lech_san_luong_trong_ngay_pct', '60'); // phá ràng buộc với xu_ly 25 -> cả cặp bị bỏ
  ins.run('san_mau_so_so_sanh', '"text"');
  const loiLog = [];
  const goc = console.error;
  console.error = (...a) => loiLog.push(a.join(' '));
  try { TS.khoiTao(ctx.db); } finally { console.error = goc; }
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
  assert.equal(CF.SAN_XEP_HANG_BCVH, 50);
  assert.equal(CF.NGUONG_DU_SO_LIEU, 0.1);
  assert.equal(DT.DASHBOARD_DEN_THRESHOLDS.GIO_MUON, 17, 'dòng hợp lệ vẫn được dùng');
  assert.deepEqual(DT.DASHBOARD_DEN_THRESHOLDS.LECH_SAN_LUONG, { trong_ngay_pct: 15, xu_ly_ngay_pct: 25 });
  assert.equal(CF.SAN_MAU_SO_SO_SANH, 50);
  assert.ok(loiLog.length >= 6);
  const gop = loiLog.join('\n');
  for (const giaTri of ['99999', 'khong-phai-json', '"text"', '0.4']) assert.ok(!gop.includes(giaTri), `không in giá trị ${giaTri}`);
  assert.equal((await get()).status, 200);
  assert.equal((await nguongDen()).status, 200);
  assert.equal((await kqThang()).status, 200);
});

test('bảng tham_so không tồn tại / hỏng: khoiTao không ném lỗi, trả mặc định', () => {
  const gia = { prepare() { throw new Error('no such table: tham_so'); } };
  const goc = console.error;
  const log = [];
  console.error = (...a) => log.push(a.join(' '));
  try { TS.khoiTao(gia); } finally { console.error = goc; }
  assert.equal(CF.NGUONG_PTC_DAT, 0.82);
  assert.equal(log.length, 1);
});

test('schema idempotent: ensureThamSoSchema chạy lại không lỗi, không mất dữ liệu; `che_do` chỉ nhận tay / tu_thong_ke', async () => {
  await sua('san_xep_hang_bcvh', 33);
  TS.ensureThamSoSchema(ctx.db);
  TS.ensureThamSoSchema(ctx.db);
  assert.equal(soDong(), 1);
  assert.throws(() => ctx.db.prepare("INSERT INTO tham_so (khoa, gia_tri, cap_nhat_luc, cap_nhat_boi, che_do) VALUES ('x', '1', 'a', 'b', 'khac')").run(), /CHECK/);
  assert.throws(() => ctx.db.prepare("INSERT INTO tham_so_nhat_ky (khoa, thoi_diem_utc, nguoi_ma, ly_do, loai) VALUES ('x', 'a', 'b', 'c', 'XOA')").run(), /CHECK/);
});

// =====================================================================
// THAMSO-1a. Ba tham số điều hành chưa có test riêng + PUT / hoàn mặc định không đổi gì
// =====================================================================
const TH = DT.DASHBOARD_DEN_THRESHOLDS;
const BA_THAM_SO = [
  { khoa: 'san_so_sanh_toi_thieu', ten: 'SAN_SO_SANH_TOI_THIEU', mac_dinh: 50, moi: 70, min: 1, max: 1000 },
  { khoa: 'san_so_sanh_phuong_xa', ten: 'SAN_SO_SANH_PHUONG_XA', mac_dinh: 10, moi: 15, min: 1, max: 1000 },
  { khoa: 'gio_bat_dau_danh_gia', ten: 'GIO_BAT_DAU_DANH_GIA', mac_dinh: 12, moi: 9, min: 0, max: 23 }
];
for (const t of BA_THAM_SO) {
  test(`${t.ten}: mặc định đúng; PUT đổi thì hàm đọc nhận giá trị mới; hoàn mặc định trả giá trị cũ; chặn ngoài min / max`, async () => {
    assert.equal(MD[t.khoa], t.mac_dinh);
    assert.equal(TH[t.ten], t.mac_dinh);
    assert.equal(TS.lay(t.khoa), t.mac_dinh);
    assert.equal((await sua(t.khoa, t.moi)).status, 200);
    assert.equal(TH[t.ten], t.moi);
    assert.equal(TS.lay(t.khoa), t.moi);
    assert.equal((await nguongDen()).body.nguong[t.ten], t.moi, 'API trả giá trị mới');
    const ve = await veMd({ ly_do: 'Hoàn lại', khoa: [t.khoa] });
    assert.equal(ve.status, 200);
    assert.equal(TH[t.ten], t.mac_dinh);
    assert.equal(muc(ve.body, t.khoa).la_mac_dinh, true);
    for (const v of [t.min - 1, t.max + 1]) {
      const res = await chuaDoi(() => sua(t.khoa, v));
      assert.deepEqual([res.status, res.body.ma], [400, 'NGOAI_KHOANG'], `${t.khoa} = ${v}`);
    }
    for (const v of [t.min, t.max]) assert.equal((await sua(t.khoa, v)).status, 200, `biên ${v}`);
    assert.equal(TH[t.ten], t.max);
  });
}

test('THAMSO-1a (B): PUT giá trị BẰNG hiện hành bị bỏ qua — không nhật ký, không đổi phiên bản, không đổi dòng ghi đè; 200 trả dữ liệu hiện hành', async () => {
  await sua('ptc_dat', 0.8);
  const truoc = { nk: soNhatKy(), pb: TS.phienBan(), dong: ctx.db.prepare('SELECT * FROM tham_so').all() };
  const bang = await put({ ly_do: 'Không đổi', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'gio_muon', gia_tri: 15 }] }); // 0.8 = hiện hành; 15 = mặc định đang dùng
  assert.equal(bang.status, 200);
  assert.equal(bang.body.phien_ban, truoc.pb);
  assert.equal(muc(bang.body, 'ptc_dat').gia_tri, 0.8);
  assert.deepEqual([soNhatKy(), TS.phienBan()], [truoc.nk, truoc.pb]);
  assert.deepEqual(ctx.db.prepare('SELECT * FROM tham_so').all(), truoc.dong, 'cap_nhat_luc / cap_nhat_boi không đổi');
});

test('THAMSO-1a (B): lô trộn — khóa không đổi bị bỏ, khóa có đổi vẫn ghi; một lần tăng phiên bản, nhật ký chỉ có khóa đổi', async () => {
  await sua('ptc_dat', 0.8);
  const n0 = soNhatKy();
  const p0 = TS.phienBan();
  const res = await put({ ly_do: 'Lô trộn', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.8 }, { khoa: 'gio_muon', gia_tri: 16 }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.phien_ban, p0 + 1);
  assert.deepEqual(ctx.db.prepare('SELECT khoa FROM tham_so_nhat_ky ORDER BY id DESC LIMIT 1').all().map((x) => x.khoa), ['gio_muon']);
  assert.equal(soNhatKy() - n0, 1);
});

test('THAMSO-1a (B): giá trị bằng hiện hành nhưng lô phá ràng buộc cặp vẫn bị từ chối như cũ (RANG_BUOC), kiểm tra kiểu / khoảng vẫn chạy trước', async () => {
  const sai = await chuaDoi(() => put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.82 }, { khoa: 'gio_mong_doi_sang', gia_tri: '13:00' }] }));
  assert.deepEqual([sai.status, sai.body.ma], [400, 'RANG_BUOC']);
  const khoang = await chuaDoi(() => put({ ly_do: 'x', thay_doi: [{ khoa: 'ptc_dat', gia_tri: 0.82 }, { khoa: 'san_xep_hang_bcvh', gia_tri: 0 }] }));
  assert.equal(khoang.body.ma, 'NGOAI_KHOANG');
});

test('THAMSO-1a (C): ve-mac-dinh trên khóa chưa bị ghi đè — 200, không nhật ký, không đổi phiên bản; lô trộn chỉ ghi khóa thật sự đang ghi đè', async () => {
  const p0 = TS.phienBan();
  const res = await veMd({ ly_do: 'Không cần', khoa: ['ptc_dat', 'gio_muon'] });
  assert.equal(res.status, 200);
  assert.equal(res.body.phien_ban, p0);
  assert.deepEqual([soNhatKy(), TS.phienBan(), soDong()], [0, p0, 0]);
  assert.ok(res.body.tham_so.every((x) => x.la_mac_dinh));
  await sua('ptc_dat', 0.8);
  const p1 = TS.phienBan();
  const n1 = soNhatKy();
  const tron = await veMd({ ly_do: 'Một trong hai', khoa: ['ptc_dat', 'gio_muon'] });
  assert.equal(tron.status, 200);
  assert.equal(tron.body.phien_ban, p1 + 1);
  assert.equal(soNhatKy() - n1, 1);
  assert.deepEqual(ctx.db.prepare("SELECT khoa, loai FROM tham_so_nhat_ky WHERE loai = 'VE_MAC_DINH'").all(), [{ khoa: 'ptc_dat', loai: 'VE_MAC_DINH' }]);
});
