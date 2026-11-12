// ==========================================
// «Hàng tại KTT» (KTT-8): lớp ỨNG DỤNG của API /api/ktt/* — kiểm tham số, BỘ NHỚ ĐỆM theo ngày, chạy KHÔNG làm đứng máy chủ. CHỈ ĐỌC DB.
// Tính toán nằm ở kttQuery.js / kttLuuThoatQuery.js / kttDanhGia.js (KHÔNG đổi ngữ nghĩa); file này chỉ gọi chúng. Tài liệu: docs/ai/42_KTT_API.md.
//
// «Bây giờ» = ĐỘ MỚI dữ liệu (kttNapCap.docDoMoi), không phải đồng hồ máy. Bộ nhớ đệm trong bộ nhớ tiến trình (không bảng DB), theo mẫu quyThoiGianCache.js:
//  - luu-thoat: MỖI NGÀY một mục. Ngày CHƯA chốt: giữ ≤ 10 phút VÀ cùng độ mới VÀ cùng dấu hiệu DB (PD.dauHieuDb = data_version + total_changes); nạp lần mới (độ mới đổi) là tính lại.
//    Ngày ĐÃ chốt (da_chot) TRONG cửa sổ nạp (từ độ mới lùi 8 ngày): như ngày chưa chốt về độ mới — độ mới đổi là tính lại (UPSERT cập nhật dòng tại chỗ, chữ ký không bắt được); giữ ≤ 6 giờ.
//    Ngày đã chốt CŨ HƠN cửa sổ: giữ ≤ 6 giờ (như «ngày xa» của QUYTG-9a), bỏ sớm khi CHỮ KÝ ngày (số dòng + tổng id của túi quét đến trong ngày) đổi; độ mới đổi không làm tính lại.
//    Khoảng ngày chỉ tính phần ngày chưa có (hoặc hết hạn) trong bộ nhớ; tính TỪNG NGÀY, nhường vòng lặp sự kiện (setImmediate) trước mỗi ngày tính.
//  - tong-hop, chi-tiet: mục theo cả khoảng / tham số, giữ ≤ 10 phút, cùng độ mới và dấu hiệu DB; tính ở worker_thread riêng (kttWorker.js) nên không chặn máy chủ.
//  - Đổi tham số hệ thống (thamSo.phienBan) hoặc lịch chuyến (ktt_lich_chuyen / ktt_lich_cau_hinh) → xóa hết.
// Giới hạn đã biết: ngày CŨ HƠN cửa sổ nạp không thấy sửa tại chỗ (không đổi số dòng) trong tối đa 6 giờ — nhưng ngày cũ hơn 8 ngày không còn nằm trong ảnh chụp nào nên không còn được nạp cập nhật.
// KTT_WORKER=0: tong-hop / chi-tiet chạy thẳng trong tiến trình chính (không worker_thread); mặc định bật.
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const Q = require('./kttQuery');
const QL = require('./kttLuuThoatQuery');
const L = require('./kttLichChuyen');
const PD = require('./phatDashboard');
const thamSo = require('./thamSo');
const CT = require('./quyThoiGianChiTieu');
const { docCauHinhKtt } = require('./kttCauHinh');
const { TAC_VU } = require('./kttWorker');
const X = require('./kttXuat');
const KD = require('./kttKhongDat14h');
const BT = require('./kttBucTranh');
const GD = require('./kttGioDen');
const CFG_BT = require('../config/ktt-buc-tranh');
const S = require('./kttLuuThoat');
const { MA_BCVH_HUE } = require('./kttTinh');
const D = require('./kttDiNgay');
const HH = require('./kttHangHoan');
const DQ = require('./kttDiNgayQuery');
const LX = require('./kttLichXe');
const DP = require('./kttDoPhuBcvh');
const DC = require('./kttDoiChieu');
const DG = require('./kttDanhGiaDoiChieu');
const DX = require('./kttDoiChieuXuat');
const { bcvhNames } = require('./dashboardQuery');
const HDC = require('./kttHuongDong'); // KTT-DC-1: «Hướng đóng chuyến nội tỉnh»
const HDX = require('./kttHuongDongXuat');

const CUA_SO_NAP_NGAY = 8; // ngày nằm trong cửa sổ nạp = từ độ mới dữ liệu lùi chừng này ngày trở lại (mỗi lần xuất lùi 7 ngày + 1 ngày đệm)
const TUOI_CHUA_CHOT_MS = 10 * 60 * 1000;
const TUOI_DA_CHOT_MS = 6 * 60 * 60 * 1000;
const NGAY_TOI_DA_TRONG_NHO = 400;
const MUC_KHAC_TOI_DA = 200;

const ngayLui = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) - n * 86400).slice(0, 10);
const nhuong = () => new Promise((r) => setImmediate(r));
const boNho = { ngay: new Map(), ngayB: new Map(), ngayDC: new Map(), ngayHD: new Map(), tongHop: new Map(), chiTiet: new Map(), doPhu: new Map(), dangTinh: new Map(), phienBan: null, hangHoan: null, phienHoan: null };
const dem = { ngayTinh: 0, ngayBTinh: 0, tongHopTinh: 0, chiTietTinh: 0, hangDenTinh: 0, doPhuTinh: 0, ngayDCTinh: 0, workerLan: 0, noiTuyenLan: 0 };

function xoaCache() {
  boNho.ngay.clear(); boNho.ngayB.clear(); boNho.ngayDC.clear(); boNho.ngayHD.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.doPhu.clear(); boNho.dangTinh.clear(); boNho.phienBan = null;
  dem.ngayTinh = 0; dem.ngayBTinh = 0; dem.tongHopTinh = 0; dem.chiTietTinh = 0; dem.hangDenTinh = 0; dem.doPhuTinh = 0; dem.ngayDCTinh = 0; dem.workerLan = 0; dem.noiTuyenLan = 0;
}
const thongKe = () => ({ ngay: boNho.ngay.size, ngay_b: boNho.ngayB.size, ngay_dc: boNho.ngayDC.size, ngay_hd: boNho.ngayHD.size, tong_hop: boNho.tongHop.size, chi_tiet: boNho.chiTiet.size, do_phu: boNho.doPhu.size, ...dem });

// ------------------------------------------
// Tham số
// ------------------------------------------
function chiNhan(query, ds) {
  for (const k of Object.keys(query || {})) if (!ds.includes(k)) throw new Q.LoiKtt('KTT_THAM_SO_LA', `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
}
function mot(query, ten) {
  const v = query[ten];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "${ten}" chỉ được truyền một lần, dạng chuỗi.`);
  return v;
}
/** tu, den (YYYY-MM-DD) BẮT BUỘC (như QUYTG); ≤ 31 ngày; den < tu hoặc ngày không có thật -> LoiKtt (400, tiếng Việt). Khóa lạ -> LoiKtt. */
function docKhoang(query, khoaThem = []) {
  chiNhan(query, ['tu', 'den', ...khoaThem]);
  const tu = mot(query, 'tu');
  const den = mot(query, 'den');
  if (tu === undefined || den === undefined || tu === '' || den === '') throw new Q.LoiKtt('KTT_THIEU_THAM_SO', 'Thiếu tham số "tu" hoặc "den" (định dạng YYYY-MM-DD).');
  if (!Q.ngayHopLe(tu)) throw new Q.LoiKtt('KTT_NGAY_SAI', 'Tham số "tu" phải là ngày có thật, định dạng YYYY-MM-DD.');
  if (!Q.ngayHopLe(den)) throw new Q.LoiKtt('KTT_NGAY_SAI', 'Tham số "den" phải là ngày có thật, định dạng YYYY-MM-DD.');
  if (tu > den) throw new Q.LoiKtt('KTT_KHOANG_NGAY_SAI', 'Tham số "tu" phải không sau "den".');
  const { ngays } = QL.chuanHoaNgay({ tuNgay: tu, denNgay: den });
  return { tuNgay: tu, denNgay: den, ngays };
}

// ------------------------------------------
// Vô hiệu hóa chung: tham số hệ thống + lịch chuyến
// ------------------------------------------
function chuKyLich(db) {
  try {
    const a = db.prepare("SELECT COALESCE(group_concat(ma_bcvh || '@' || gio_xuat_phat || ':' || ngay_chay || ':' || dang_dung || ':' || ngay_chay_xac_nhan, ';'), '') AS s FROM (SELECT * FROM ktt_lich_chuyen ORDER BY ma_bcvh, gio_xuat_phat)").get().s;
    const b = db.prepare("SELECT COALESCE(group_concat(khoa || '=' || gia_tri, ';'), '') AS s FROM (SELECT * FROM ktt_lich_cau_hinh ORDER BY khoa)").get().s;
    const v = db.prepare("SELECT COALESCE(MAX(gia_tri), 0) AS v FROM ktt_lich_cau_hinh WHERE khoa = 'lich_phien_ban'").get().v; // KTT-LICH-2: phiên bản lịch chuẩn đã áp dụng vào chữ ký (đổi phiên bản = hủy mọi cache)
    return `${a}#${b}#v${v}`;
  } catch (e) { return 'khong-doc-duoc'; }
}
function dongBoPhienBan(db) {
  const hh = HH.docDanhSachHangHoan(db, { chiThongTin: true }); // KTT-17-2: danh sách hàng hoàn mới (nạp ItemReturn) -> khóa đổi -> xóa đệm, số tự đổi không cần khởi động lại
  boNho.hangHoan = HH.metaHangHoan(hh);
  boNho.phienHoan = hh.phienBan;
  const pb = `${thamSo.phienBan()}|${chuKyLich(db)}|${hh.phienBan}`;
  if (boNho.phienBan !== pb) { boNho.ngay.clear(); boNho.ngayB.clear(); boNho.ngayDC.clear(); boNho.ngayHD.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.phienBan = pb; }
}

/** Chữ ký của một ngày đến: số dòng + tổng id của túi quét đến trong ngày (bắt thêm / xóa / khôi phục dòng). */
function chuKyNgay(db, ngay) {
  try {
    const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s FROM ktt_tui WHERE gio_quet_tui_den >= ? AND gio_quet_tui_den < ?").get(`${ngay} 00:00:00`, `${Q.ngayKeTiep(ngay)} 00:00:00`);
    return `${r.n}.${r.s}`;
  } catch (e) { return 'khong-doc-duoc'; }
}

// ------------------------------------------
// Chạy nền
// ------------------------------------------
let worker = null;
let dangCho = new Map();
let idLenh = 0;
let workerHong = false;

function khoiDongWorker() {
  const { Worker } = require('worker_threads');
  const w = new Worker(path.join(__dirname, 'kttWorker.js'));
  w.unref();
  w.on('message', (m) => {
    const c = dangCho.get(m.id);
    if (!c) return;
    dangCho.delete(m.id);
    if (m.ok) c.resolve(m.kq); else c.reject(loiTuWorker(m.loi));
  });
  const hong = (e) => {
    const loi = Object.assign(new Error(e && e.message ? e.message : 'worker dừng'), { code: 'KTT_WORKER_LOI' });
    for (const c of dangCho.values()) c.reject(loi);
    dangCho = new Map();
    if (worker === w) worker = null;
  };
  w.on('error', hong);
  w.on('exit', () => hong(null));
  return w;
}
function loiTuWorker(l) {
  if (l && l.code && /^KTT_/.test(l.code)) return new Q.LoiKtt(l.code, l.message);
  return Object.assign(new Error(l ? l.message : 'Lỗi'), { code: 'KTT_WORKER_TAC_VU_LOI' });
}
const duongDanDb = (db) => (db && !db.memory && db.name && fs.existsSync(db.name) ? db.name : null);

/** Chạy tác vụ nặng: worker_thread riêng khi DB là file (không chặn máy chủ); DB trong bộ nhớ / worker hỏng -> chạy thẳng sau khi nhường vòng lặp. */
async function chayNen(db, ten, args) {
  const dd = duongDanDb(db);
  if (dd && !workerHong && process.env.KTT_WORKER !== '0') {
    try {
      if (!worker) worker = khoiDongWorker();
      const id = ++idLenh;
      dem.workerLan++;
      return await new Promise((resolve, reject) => { dangCho.set(id, { resolve, reject }); worker.postMessage({ id, duongDan: dd, ten, args }); });
    } catch (e) {
      if (e && e.code !== 'KTT_WORKER_LOI') throw e;
      workerHong = true; // worker không chạy được: chuyển sang chạy thẳng, ghi một dòng log (không dữ liệu)
      try { console.error('[ktt-api] worker không chạy được, chuyển sang chạy thẳng trong tiến trình chính'); } catch (e2) { /* bỏ qua */ }
    }
  }
  await nhuong();
  dem.noiTuyenLan++;
  return TAC_VU[ten](db, args);
}
/** Dừng worker (đóng kết nối chỉ đọc của nó). Gọi khi tắt máy chủ / cuối test. */
async function dongNen() {
  const w = worker;
  worker = null; dangCho = new Map(); workerHong = false;
  if (w) { try { await w.terminate(); } catch (e) { /* đã dừng */ } }
}

// Hai request cùng cần một mục: chỉ tính MỘT lần.
function chiaSe(khoa, tao) {
  let p = boNho.dangTinh.get(khoa);
  if (!p) { p = tao().finally(() => boNho.dangTinh.delete(khoa)); boNho.dangTinh.set(khoa, p); }
  return p;
}
function datMuc(map, toiDa, khoa, muc) {
  map.delete(khoa);
  while (map.size >= toiDa) map.delete(map.keys().next().value);
  map.set(khoa, muc);
}

// ------------------------------------------
// luu-thoat
// ------------------------------------------
/** KTT-10c: query `moc_chi_tieu` (`xnd` mặc định | `quet_tui_den`) — chỉ chọn mốc nuôi khối `dat_khong_dat`; khối `chi_tieu_14h` luôn đủ hai mốc. Giá trị lạ -> LoiKtt (400). */
function docMocChiTieu(query) {
  const v = mot(query, 'moc_chi_tieu');
  if (v === undefined || v === '') return S.MOC_CHI_TIEU_MAC_DINH;
  if (!S.hopLeMocChiTieu(v)) throw new Q.LoiKtt('KTT_MOC_SAI', `Tham số "moc_chi_tieu" phải là một trong: ${Object.values(S.MOC_CHI_TIEU).join(', ')} (mặc định ${S.MOC_CHI_TIEU_MAC_DINH}).`);
  return v;
}

/** Mục cache của MỘT ngày còn dùng được không. Ngày TRONG cửa sổ nạp (độ mới lùi 8 ngày): vô hiệu khi độ mới đổi, KỂ CẢ ngày đã chốt — UPSERT cập nhật dòng tại chỗ (số dòng / tổng id không đổi). Ngày cũ hơn: giữ ≤ 6 giờ theo chữ ký. */
function conHanNgay(db, e, ngay, doMoi, now, token) {
  const tuoi = now - e.luc;
  const trongCuaSo = ngay >= ngayLui(doMoi.slice(0, 10), CUA_SO_NAP_NGAY);
  return e.daChot
    ? (tuoi < TUOI_DA_CHOT_MS && e.chuKy === chuKyNgay(db, ngay) && (!trongCuaSo || e.doMoi === doMoi))
    : (tuoi < TUOI_CHUA_CHOT_MS && e.doMoi === doMoi && e.token === token);
}

async function layNgay(db, ngay, doMoi, now, mocChiTieu = S.MOC_CHI_TIEU_MAC_DINH) {
  const khoa = `${mocChiTieu}|${ngay}`; // KTT-10c: khóa gồm mốc — hai mốc là hai mục riêng (khối `dat_khong_dat` khác nhau)
  const e = boNho.ngay.get(khoa);
  const token = PD.dauHieuDb(db);
  if (e) {
    if (conHanNgay(db, e, ngay, doMoi, now, token)) return e.kq;
    boNho.ngay.delete(khoa);
  }
  return chiaSe(`n|${khoa}|${doMoi}`, async () => {
    await nhuong(); // nhường vòng lặp sự kiện TRƯỚC mỗi ngày tính: request khác (vd /meta) được phục vụ giữa các ngày
    const tk = PD.dauHieuDb(db);
    const ck = chuKyNgay(db, ngay);
    dem.ngayTinh++;
    const kq = QL.luuThoatTheoNgay(db, { tuNgay: ngay, denNgay: ngay, bayGio: doMoi, mocChiTieu, nang: mocChiTieu === S.MOC_CHI_TIEU_MAC_DINH }); // KTT-KD-1: bộ nặng chỉ ở mục mốc mặc định (cả hai mốc đã có trong đó)
    datMuc(boNho.ngay, NGAY_TOI_DA_TRONG_NHO, khoa, { luc: now, kq, daChot: kq.theo_ngay[0].da_chot, doMoi, token: tk, chuKy: ck });
    return kq;
  });
}

/** GET /api/ktt/luu-thoat?tu=&den=[&moc_chi_tieu=] — cùng kết quả như kttLuuThoatQuery.luuThoatTheoNgay trên khoảng đó (cùng mocChiTieu); meta.moc_chi_tieu = mốc đã dùng (từ lõi). `now`: chỉ để test. */
async function luuThoat(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['moc_chi_tieu']);
  const mocChiTieu = docMocChiTieu(query);
  const doMoi = QL.docDoMoi(db);
  if (!doMoi) return QL.luuThoatTheoNgay(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, mocChiTieu }); // chưa có dữ liệu: kết quả rỗng có lý do (rẻ, không đệm)
  dongBoPhienBan(db);
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now, mocChiTieu));
  const kq = QL.ghepKhoang(ds);
  // Ngày ĐÃ chốt có thể lấy từ lần tính trước (độ mới cũ hơn): độ mới / «bây giờ» của phản hồi luôn là độ mới HIỆN TẠI.
  kq.bay_gio = doMoi.nguon_xuat_luc; kq.nguon_xuat_luc_moi_nhat = doMoi.nguon_xuat_luc;
  kq.meta = { ...kq.meta, nguon_xuat_luc_moi_nhat: doMoi.nguon_xuat_luc, bay_gio: doMoi.nguon_xuat_luc };
  return kq;
}

// ------------------------------------------
// tong-hop, chi-tiet
// ------------------------------------------
async function layMuc(db, map, toiDa, khoa, now, doMoi, tinh) {
  dongBoPhienBan(db);
  const token = PD.dauHieuDb(db);
  const e = map.get(khoa);
  if (e && now - e.luc < TUOI_CHUA_CHOT_MS && e.token === token && e.doMoi === doMoi) return e.kq;
  if (e) map.delete(khoa);
  return chiaSe(`${toiDa}|${khoa}|${doMoi}`, async () => {
    const tk = PD.dauHieuDb(db);
    const kq = await tinh();
    datMuc(map, toiDa, khoa, { luc: now, kq, token: tk, doMoi });
    return kq;
  });
}
const metaDoMoi = (doMoi, bayGio, db) => ({ nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null, bay_gio: bayGio, ly_do: doMoi ? null : 'CHUA_CO_DU_LIEU', ...HH.metaHangHoan(HH.docDanhSachHangHoan(db, { chiThongTin: true })) });

/** GET /api/ktt/tong-hop?tu=&den= — tongHopKtt + khối «Đánh giá» (danh_gia) + meta. */
async function tongHop(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`; // chưa có dữ liệu: cố định, không đọc đồng hồ
  const tinh = async () => { dem.tongHopTinh++; const kq = await chayNen(db, 'tongHop', { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio }); return { ...kq, meta: metaDoMoi(doMoi, bayGio, db) }; };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.tongHop, MUC_KHAC_TOI_DA, `${k.tuNgay}|${k.denNgay}`, now, doMoi.nguon_xuat_luc, tinh);
}

const LOAI_CU = new Set(Q.LOAI_CHI_TIET);
const NG = require('./kttNguon');

/** `ma_bcvh` tùy chọn: một trong 6 BCVH Huế. Trả mã hoặc null. */
function docMaBcvh(query) {
  const ma = mot(query, 'ma_bcvh');
  if (ma !== undefined && ma !== '' && !MA_BCVH_HUE.includes(ma)) throw new Q.LoiKtt('KTT_BCVH_SAI', 'Tham số "ma_bcvh" phải là một trong 6 BCVH Huế.');
  return ma === undefined || ma === '' ? null : ma;
}
/** `nguon` tùy chọn (KTT-8c): mã nhóm nguồn (NOI_TINH, KHONG_RO_NGUON hoặc mã đường thư đến); kiểm bằng biểu thức chính quy, chỉ dùng để so sánh chuỗi. Trả mã hoặc null. */
function docNguon(query) {
  const v = mot(query, 'nguon');
  if (v === undefined || v === '') return null;
  if (!NG.RE_MA_NGUON.test(v)) throw new Q.LoiKtt('KTT_NGUON_SAI', 'Tham số "nguon" chỉ gồm chữ, số, _ . - / và khoảng trắng, tối đa 40 ký tự.');
  return v;
}
// ------------------------------------------
// KTT-KD-1 pha 2 (bản sửa 2): «Bức tranh đường thư đến»
// ------------------------------------------
/** `moc` của khối bức tranh: A (xác nhận BD10 đến, mặc định) | B (quét túi đến); chấp nhận thêm `xnd` / `quet_tui_den`. Lạ -> LoiKtt (400). */
function docMocBt(query) {
  const v = mot(query, 'moc');
  if (v === undefined || v === '') return BT.MOC_MAC_DINH;
  const u = v.toUpperCase();
  if (u === 'A' || v === S.MOC_CHI_TIEU.XND) return 'A';
  if (u === 'B' || v === S.MOC_CHI_TIEU.QUET_TUI_DEN) return 'B';
  throw new Q.LoiKtt('KTT_MOC_SAI', 'Tham số "moc" phải là A (xác nhận BD10 đến, mặc định) hoặc B (quét túi đến).');
}
const LOAI_NGAY_BT = ['thuong', 'chu_nhat', 'tat_ca'];
function docLoaiNgayBt(query) {
  const v = mot(query, 'loai_ngay');
  if (v === undefined || v === '') return 'tat_ca';
  if (!LOAI_NGAY_BT.includes(v)) throw new Q.LoiKtt('KTT_LOAI_NGAY_SAI', `Tham số "loai_ngay" phải là một trong: ${LOAI_NGAY_BT.join(', ')}.`);
  return v;
}
/** Ngưỡng của bức tranh, đọc từ tham số hệ thống LÚC GỌI (đổi ở màn tham số có hiệu lực ngay; cột số theo ngày trong bộ nhớ đệm không chứa ngưỡng nào). */
const nguongBt = () => ({
  gapPhut: CFG_BT.GAP_CUM_PHUT, cumNhoShbg: CFG_BT.CUM_NHO_SHBG, mauToiThieu: CFG_BT.MAU_TOI_THIEU, phanViTuongDoi: CFG_BT.PHAN_VI_TUONG_DOI, kienDiNgoaiPct: CFG_BT.KIEN_DI_NGOAI_PCT, kienNgoaiPhanVi: CFG_BT.KIEN_NGOAI_PHAN_VI,
  chuyenGomHeSo: CFG_BT.CHUYEN_GOM_HE_SO, satGioChotPhut: CFG_BT.SAT_GIO_CHOT_PHUT, ngayToiThieu: CFG_BT.NGAY_TOI_THIEU, conLaiGio: CFG_BT.CON_LAI_GIO,
  tyLeNganConLaiPct: CFG_BT.TY_LE_CON_LAI_PCT, meoTheoLoPhut: CFG_BT.MEO_THEO_LO_PHUT
});
const CAN_BT = Object.freeze({ cum: { o: false, chuyen: false, the: false }, chuyen: { o: true, chuyen: true, the: false }, danh_gia: { o: true, chuyen: true, the: true } });
const PHAN_BT = Object.freeze({
  cum: (v) => ({ mau_so: v.mau_so, do_duoc: v.do_duoc, khong_do_duoc: v.khong_do_duoc, cum: v.cum, thong_ke_co: v.thong_ke_co, nguong_ap_dung: v.nguong_ap_dung }),
  chuyen: (v) => ({ mau_so: v.mau_so, do_duoc: v.do_duoc, khong_do_duoc: v.khong_do_duoc, chuyen: v.chuyen, o: v.o }),
  danh_gia: (v) => ({ mau_so: v.mau_so, do_duoc: v.do_duoc, khong_do_duoc: v.khong_do_duoc, the: v.the, thong_ke_co: v.thong_ke_co, mau_it: v.mau_it, nguong_ap_dung: v.nguong_ap_dung })
});

/**
 * Dùng chung cho ba route /luu-thoat/buc-tranh-duong-thu[/chuyen-xe|/danh-gia]?tu=&den=[&moc=A|B&loai_ngay=thuong|chu_nhat|tat_ca&bcvh=<mã>]: cột số theo SHBG của từng ngày nằm trong mục cache theo ngày
 * của /luu-thoat (cùng lượt duyệt, cùng khóa hủy: độ mới / chữ ký ngày / tham số / lịch / danh sách hàng hoàn); ở đây chỉ ghép ngày, dựng băng giờ và bảng (tính mỗi lần gọi, ~vài chục mili giây).
 * Trả `theo_moc: { A: {...}, B: {...} }` (CẢ HAI mốc ở mọi bảng); `moc` = mốc hiển thị mặc định (A).
 */
async function bucTranh(db, query, phan, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['moc', 'loai_ngay', 'bcvh']);
  const moc = docMocBt(query);
  const loaiNgay = docLoaiNgayBt(query);
  const bcvhS = mot(query, 'bcvh');
  if (bcvhS !== undefined && bcvhS !== '' && !MA_BCVH_HUE.includes(bcvhS)) throw new Q.LoiKtt('KTT_BCVH_SAI', 'Tham số "bcvh" phải là một trong 6 BCVH Huế.');
  const bcvh = bcvhS === undefined || bcvhS === '' ? null : bcvhS;
  const ra = { khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, moc, moc_mac_dinh: BT.MOC_MAC_DINH, bo_loc: { loai_ngay: loaiNgay, bcvh } };
  const doMoi = QL.docDoMoi(db);
  if (!doMoi) return { ...ra, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: 'CHUA_CO_DU_LIEU', theo_moc: null, canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.'] };
  dongBoPhienBan(db);
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now, S.MOC_CHI_TIEU_MAC_DINH)); // cột số của bức tranh nằm trong mục mốc mặc định (cả hai mốc cùng một mục)
  const lt = QL.ghepKhoang(ds);
  const R = BT.gop(lt.tranh);
  const lichDoc = L.docLichChuyen(db);
  const ngays = k.ngays.map((ngay) => ({ ngay, thu: BT.thuCua(ngay) }));
  const nguong = nguongBt();
  const theo_moc = {};
  for (const m of BT.HAI_MOC) {
    const v = BT.tinhMoc(R, { moc: m, loaiNgay, bcvh, nguong, lich: lichDoc.lich, ngays, can: CAN_BT[phan] });
    theo_moc[m] = PHAN_BT[phan](v);
  }
  const tc = lt.tong_cong;
  const mauSo = tc ? ['t1', 't2', 't3', 't4', 't5', 'dang_cho_chuyen'].reduce((s, t) => s + tc.trang_thai[t].shbg, 0) : 0;
  const nhomLoai = tc ? { hang_hoan: tc.hang_hoan.tong_shbg, ngoai_6_bcvh: tc.ngoai_bay_chip.ngoai_pham_vi_tong, khong_ro_dich: tc.ngoai_bay_chip.khong_ro_dich, khong_co_gio_quet_den: tc.ngoai_bay_chip.khong_co_gio_quet_den, khong_xep_duoc_chuyen: tc.ngoai_bay_chip.khong_xep_duoc_chuyen_tong } : null;
  const loaiTong = nhomLoai ? Object.values(nhomLoai).reduce((s, x) => s + x, 0) : 0;
  const ct14 = (m) => (tc ? { do_duoc: tc.chi_tieu_14h.theo_moc[BT.MOC_BT[m]].do_duoc, mau_so: mauSo } : null);
  return {
    ...ra, bay_gio: doMoi.nguon_xuat_luc, nguon_xuat_luc_moi_nhat: doMoi.nguon_xuat_luc, co_du_lieu: lt.co_du_lieu, ly_do: null,
    theo_moc,
    meta: {
      // đẳng thức (toàn cửa sổ, KHÔNG phụ thuộc bộ lọc): tổng bưu gửi = mẫu số lưu thoát + các nhóm loại; mẫu số = SHBG của bức tranh
      dang_thuc: {
        tong_shbg: tc ? tc.tong_shbg_ngay : 0, mau_so: mauSo, nhom_loai: nhomLoai, tong_nhom_loai: loaiTong, lech_tong: tc ? tc.tong_shbg_ngay - mauSo - loaiTong : 0,
        shbg_trong_buc_tranh: R.n, lech_mau_so: R.n - mauSo
      },
      do_duoc_chi_tieu_14h: { A: ct14('A'), B: ct14('B') },
      luu_y_lich: { bcvh_chuyen_nghi_chu_nhat: L.bcvhChuaXacNhanChuNhat(lichDoc.lich), bcvh_chu_nhat_chua_xac_nhan: L.bcvhChuaXacNhanChuNhat(lichDoc.lich), ghi_chu: 'KTT-LICH-2 (lịch chuẩn 05/11/2026): luu_y_lich = true chỉ khi BCVH có dòng lịch chưa xác nhận (cột ngay_chay_xac_nhan = 0); hiện không BCVH nào. Tên khóa bcvh_chuyen_nghi_chu_nhat giữ để không đổi hợp đồng, nghĩa mới = chưa xác nhận.' },
      quy_uoc: {
        don_vi: 'SHBG thuộc mẫu số lưu thoát (6 BCVH, không hàng hoàn, có giờ quét túi đến, xếp được chuyến)', cum: '(đường thư BD10 đến, lịch BD10 đến, băng giờ); băng tách khi hai lần đến liền nhau cách trên ktt_bt_gap_cum_phut',
        moc_a: 'giờ xác nhận BD10 đến (bd10_den_xnd), méo theo lô', moc_b: 'giờ quét túi đến', gio_den: 'phút kể từ 00:00 ngày đến D, trình bày HH:MM; băng vắt qua nửa đêm có vat_dem = true',
        luu_thoat_theo_lich: 'từ lúc hàng đến tới giờ xe rời (đã trừ 21:00–07:00); không gồm giờ chốt phát và thời gian xe chạy đến BCVH; còn lại = chỉ tiêu (14 hoặc 12 giờ) − lưu thoát theo lịch, có thể âm',
        nguong_tuong_doi: 'tính trên các cụm của bộ lọc hiện tại; chỉ xét cụm không «mẫu ít»'
      }
    },
    canh_bao: [
      'Mốc A đo từ giờ xác nhận BD10 đến (gom theo lô) nên có thể méo; cụm có meo_theo_lo = true cần đọc theo mốc B. Không có tỷ lệ chung: mọi con số đi kèm «đo được x/y» của mốc đó.',
      ...lt.canh_bao.filter((c) => !/bưu gửi không rõ đích/.test(c))
    ]
  };
}
const bucTranhCum = (db, query, opts) => bucTranh(db, query, 'cum', opts);
const bucTranhChuyenXe = (db, query, opts) => bucTranh(db, query, 'chuyen', opts);
const bucTranhDanhGia = (db, query, opts) => bucTranh(db, query, 'danh_gia', opts);

// ------------------------------------------
// KTT-KD-3b: màn «Giờ đến trong ngày» — ba route CHỈ THÊM (docs/ai/42_KTT_API.md mục 22, quyết định #128). Cùng cache theo ngày với bức tranh (layNgay), không thêm lượt duyệt SHBG.
// ------------------------------------------
const nguongGioDen = () => ({ ...nguongBt(), sanLuongLonPhanVi: CFG_BT.SAN_LUONG_LON_PHAN_VI });
function docBcvhBt(query) {
  const s = mot(query, 'bcvh');
  if (s !== undefined && s !== '' && !MA_BCVH_HUE.includes(s)) throw new Q.LoiKtt('KTT_BCVH_SAI', 'Tham số "bcvh" phải là một trong 6 BCVH Huế.');
  return s === undefined || s === '' ? null : s;
}
/** `duong_thu` lặp tối đa GD.SO_DONG_TOI_DA lần (route 1). Mã khớp RE_MA_NGUON; `__RONG__` = hàng chưa có mã đường thư. */
function docDuongThuNhieu(query) {
  const v = query.duong_thu;
  if (v === undefined || v === '') return [];
  const ds = (Array.isArray(v) ? v : [v]).filter((x) => x !== '');
  if (ds.some((x) => typeof x !== 'string' || !NG.RE_MA_NGUON.test(x))) throw new Q.LoiKtt('KTT_DUONG_THU_SAI', 'Tham số "duong_thu" chỉ gồm chữ, số, _ . - / và khoảng trắng, tối đa 40 ký tự.');
  const ra = [...new Set(ds)];
  if (ra.length > GD.SO_DONG_TOI_DA) throw new Q.LoiKtt('KTT_DUONG_THU_QUA_NHIEU', `Tham số "duong_thu" chọn tối đa ${GD.SO_DONG_TOI_DA} đường thư.`);
  return ra;
}
function docDuongThuMot(query) {
  const v = mot(query, 'duong_thu');
  if (v === undefined || v === '') throw new Q.LoiKtt('KTT_THIEU_THAM_SO', 'Thiếu tham số "duong_thu" (mã đường thư).');
  if (!NG.RE_MA_NGUON.test(v)) throw new Q.LoiKtt('KTT_DUONG_THU_SAI', 'Tham số "duong_thu" chỉ gồm chữ, số, _ . - / và khoảng trắng, tối đa 40 ký tự.');
  return v;
}
const soNgayCua = (ngays) => ({ tong: ngays.length, thuong: ngays.filter((d) => d.thu !== 'CN').length, chu_nhat: ngays.filter((d) => d.thu === 'CN').length });
/** Bó cột số của khoảng (cùng nguồn với bucTranh): { doMoi, lt, R } hoặc null khi chưa có dữ liệu. */
async function layBoGioDen(db, k, now) {
  const doMoi = QL.docDoMoi(db);
  if (!doMoi) return null;
  dongBoPhienBan(db);
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now, S.MOC_CHI_TIEU_MAC_DINH));
  const lt = QL.ghepKhoang(ds);
  return { doMoi, lt, R: BT.gop(lt.tranh) };
}
/** Số đếm ngoài phạm vi 6 BCVH (cả cửa sổ, không phụ thuộc bộ lọc) từ meta.dang_thuc: màn ghi «chưa gồm N bưu gửi đi ngoài 6 BCVH». */
function ngoaiPhamVi(lt) {
  const tc = lt.tong_cong;
  if (!tc) return { di_ngoai_6_bcvh: 0, khong_ro_dich: 0, khong_co_gio_quet: 0, hang_hoan: 0, tong_shbg: 0, ghi_chu: 'Chưa có dữ liệu.' };
  return { di_ngoai_6_bcvh: tc.ngoai_bay_chip.ngoai_pham_vi_tong, khong_ro_dich: tc.ngoai_bay_chip.khong_ro_dich, khong_co_gio_quet: tc.ngoai_bay_chip.khong_co_gio_quet_den, hang_hoan: tc.hang_hoan.tong_shbg, tong_shbg: tc.tong_shbg_ngay, ghi_chu: 'Chỉ gồm hàng đến 6 BCVH Huế (cùng mẫu số bức tranh, không hàng hoàn); các nhóm này nằm NGOÀI số liệu của màn.' };
}
/** KTT-KD-3b3: mã cảnh báo cho giao diện (giao diện KHÔNG in `canh_bao` thô: chuỗi đó có chữ nội bộ). Mã có thể có: xem docs/ai/42_KTT_API.md mục 22. */
const CANH_BAO_MA = Object.freeze({ CHUA_CO_DU_LIEU: 'CHUA_CO_DU_LIEU', MOC_A_CO_THE_MEO: 'MOC_A_CO_THE_MEO', CANH_BAO_HE_THONG: 'CANH_BAO_HE_THONG' });
const canhBaoMaGioDen = (ltCanhBao) => [CANH_BAO_MA.MOC_A_CO_THE_MEO, ...(ltCanhBao.some((c) => !/bưu gửi không rõ đích/.test(c)) ? [CANH_BAO_MA.CANH_BAO_HE_THONG] : [])];
const QUY_UOC_GIO_DEN = Object.freeze({
  duong_thu: 'gộp theo MÃ đường thư (mọi lịch, mọi cụm); hàng chưa có mã là một dòng riêng (khoa __RONG__, ma null); đường thư chưa có tên: ten null',
  chuyen: 'chuyến thư đến = băng giờ của đường thư: các lần đến cách nhau không quá ktt_bt_gap_cum_phut (60) phút là một chuyến (một xe được xác nhận trước và sau), băng dưới ktt_bt_cum_nho_shbg gộp vào băng gần nhất, vắt đêm nối thành một',
  gio_den_ngay: 'mỗi chuyến một giờ mỗi ngày (giờ giữa); P10 / giờ giữa / P90 tính trên các giờ-chuyến-ngày, không trên từng bưu gửi',
  moc: 'A = giờ xác nhận BD10 đến (chính thức, giờ trong ngày vòng 24 giờ, méo theo lô); B = giờ quét túi đến',
  mau_it: 'dưới ktt_bt_mau_toi_thieu × (số ngày của khoảng / 30), làm tròn lên (nguong_ap_dung.mau_toi_thieu_ap_dung)'
});

/** GET /api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den?tu=&den=[&moc=&loai_ngay=&bcvh=&duong_thu=…] — đường thư × 0–23 giờ, hai mốc, dấu hiệu cấp đường thư. */
async function gioDen(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['moc', 'loai_ngay', 'bcvh', 'duong_thu']);
  const moc = docMocBt(query);
  const loaiNgay = docLoaiNgayBt(query);
  const bcvh = docBcvhBt(query);
  const chon = docDuongThuNhieu(query);
  const ngays = k.ngays.map((ngay) => ({ ngay, thu: BT.thuCua(ngay) }));
  const ra = { khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, so_ngay: soNgayCua(ngays), moc, moc_mac_dinh: BT.MOC_MAC_DINH, bo_loc: { loai_ngay: loaiNgay, bcvh, duong_thu: chon } };
  const bo = await layBoGioDen(db, k, now);
  if (!bo) return { ...ra, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: 'CHUA_CO_DU_LIEU', theo_moc: null, ngoai_pham_vi: ngoaiPhamVi({}), canh_bao_ma: [CANH_BAO_MA.CHUA_CO_DU_LIEU], canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.'] };
  const co = GD.khoaDuongThuCoTrong(bo.R);
  for (const c of chon) if (!co.has(c)) throw new Q.LoiKtt('KTT_DUONG_THU_LA', 'Tham số "duong_thu": không có đường thư này trong khoảng ngày đã chọn.');
  const nguong = nguongGioDen();
  const theo_moc = {};
  for (const m of BT.HAI_MOC) theo_moc[m] = GD.tinhGioDen(bo.R, { moc: m, loaiNgay, bcvh, nguong, ngays, chon, nSong: k.ngays.length });
  const np = ngoaiPhamVi(bo.lt);
  return {
    ...ra, bay_gio: bo.doMoi.nguon_xuat_luc, nguon_xuat_luc_moi_nhat: bo.doMoi.nguon_xuat_luc, co_du_lieu: bo.lt.co_du_lieu, ly_do: null,
    theo_moc, ngoai_pham_vi: np,
    meta: { dang_thuc: { tong_shbg: np.tong_shbg, mau_so: bo.R.n, shbg_trong_buc_tranh: bo.R.n }, quy_uoc: QUY_UOC_GIO_DEN },
    canh_bao_ma: canhBaoMaGioDen(bo.lt.canh_bao),
    canh_bao: ['Mốc A đo từ giờ xác nhận BD10 đến (gom theo lô) nên có thể méo; đường thư có meo_theo_lo = true cần đọc theo mốc B.', ...bo.lt.canh_bao.filter((c) => !/bưu gửi không rõ đích/.test(c))]
  };
}

/** GET …/gio-den/theo-ngay?tu=&den=&duong_thu=<mã>[&moc=&loai_ngay=&bcvh=] — mọi ngày của khoảng của MỘT đường thư (mỗi chuyến một giờ giữa). */
async function gioDenTheoNgay(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['moc', 'loai_ngay', 'bcvh', 'duong_thu']);
  const moc = docMocBt(query);
  const loaiNgay = docLoaiNgayBt(query);
  const bcvh = docBcvhBt(query);
  const khoa = docDuongThuMot(query);
  const ngays = k.ngays.map((ngay) => ({ ngay, thu: BT.thuCua(ngay) }));
  const ra = { khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, so_ngay: soNgayCua(ngays), moc, moc_mac_dinh: BT.MOC_MAC_DINH, bo_loc: { loai_ngay: loaiNgay, bcvh, duong_thu: khoa } };
  const bo = await layBoGioDen(db, k, now);
  if (!bo) return { ...ra, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: 'CHUA_CO_DU_LIEU', duong_thu: null, theo_moc: null, canh_bao_ma: [CANH_BAO_MA.CHUA_CO_DU_LIEU], canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.'] };
  if (!GD.khoaDuongThuCoTrong(bo.R).has(khoa)) throw new Q.LoiKtt('KTT_DUONG_THU_LA', 'Tham số "duong_thu": không có đường thư này trong khoảng ngày đã chọn.');
  const dtI = bo.R.tu.dt.findIndex((m) => GD.khoaCua(m) === khoa);
  const nguong = nguongGioDen();
  const theo_moc = {};
  for (const m of BT.HAI_MOC) theo_moc[m] = GD.tinhTheoNgay(bo.R, { moc: m, loaiNgay, bcvh, khoa, nguong, ngays });
  return {
    ...ra, bay_gio: bo.doMoi.nguon_xuat_luc, nguon_xuat_luc_moi_nhat: bo.doMoi.nguon_xuat_luc, co_du_lieu: bo.lt.co_du_lieu, ly_do: null,
    duong_thu: { khoa, ma: bo.R.tu.dt[dtI] || null, ten: bo.R.tu.dtTen[dtI] || null }, theo_moc,
    meta: { quy_uoc: { ...QUY_UOC_GIO_DEN, ngay: 'mọi ngày của khoảng đều có dòng (co_hang false khi không có hàng), không phụ thuộc loai_ngay; loai_ngay chỉ quyết định các ngày được tính vào dai_thuong_gap, so_ngay_* và tb_ngay_co_hang' } },
    canh_bao_ma: [CANH_BAO_MA.MOC_A_CO_THE_MEO],
    canh_bao: ['Mốc A đo từ giờ xác nhận BD10 đến (gom theo lô) nên có thể méo; xem thêm mốc B.']
  };
}

/** GET …/con-lai-theo-gio[?loai_ngay=&bcvh=] — dải «còn so với chỉ tiêu» theo giờ đến (phút :30) × BCVH × loại ngày; lịch lấy từ ktt_lich_chuyen, không cần tu / den, không đọc dữ liệu hàng. */
async function conLaiTheoGio(db, query) {
  chiNhan(query, ['loai_ngay', 'bcvh']);
  const loaiNgay = docLoaiNgayBt(query);
  const bcvh = docBcvhBt(query);
  const lichDoc = L.docLichChuyen(db);
  const ten = bcvhNames(db);
  return {
    bo_loc: { loai_ngay: loaiNgay, bcvh },
    theo_bcvh: GD.conLaiTheoGio(lichDoc.lich, lichDoc.hanDenTruocChuyenPhut, { bcvh, loaiNgay, tenBcvh: ten }),
    meta: {
      han_den_truoc_chuyen_phut: lichDoc.hanDenTruocChuyenPhut,
      quy_uoc: {
        gio_den: 'hàng đến giờ g coi như đến phút :30 của giờ g (không phải giờ thật của từng bưu gửi)',
        con_lai_gio: 'chỉ tiêu (chi_tieu_gio) − thời gian lưu thoát theo lịch (cho_theo_lich_gio, đã trừ 21:00–07:00) tới giờ xe kế tiếp rời; có thể ÂM; null khi không xếp được chuyến',
        gio_chot: 'giờ xe rời − hạn đến trước chuyến (Quyết định #112)',
        con_lai_12h: 'chỉ có ở BCVH có ngoại lệ chỉ tiêu 12 giờ (Thuận Hóa 533140: phường/xã trong chi_tieu_gio_ngoai_le), còn lại null',
        loai_ngay: 'thuong: ngày thường (không phải Chủ nhật); chu_nhat: dòng lịch NGHI_CN không chạy'
      },
      canh_bao_lich: lichDoc.canhBao || []
    }
  };
}

/**
 * Hủy cache ĐÚNG NGÀY (mọi mốc) — gọi khi một ngày bị nạp lại / thay thế / khôi phục. Trả số mục đã hủy. Các ngày khác giữ nguyên.
 * (Cơ chế tự động ở conHanNgay vẫn là chốt chặn: độ mới đổi, chữ ký ngày đổi.)
 */
function huyCacheNgay(ngays) {
  let n = 0;
  const ds = new Set(ngays || []);
  for (const khoa of [...boNho.ngay.keys()]) if (ds.has(khoa.split('|')[1])) { boNho.ngay.delete(khoa); n++; }
  for (const ngay of ds) { if (boNho.ngayB.delete(ngay)) n++; if (boNho.ngayDC.delete(ngay)) n++; if (boNho.ngayHD.delete(ngay)) n++; }
  boNho.tongHop.clear(); boNho.chiTiet.clear();
  return n;
}

// ------------------------------------------
// KTT-KD-1: vì sao không đạt 14 giờ
// ------------------------------------------
const THAM_SO_KD = ['moc_chi_tieu', 'nhom_nguyen_nhan', 'gio_den', 'chuyen', 'thu', 'nguon_hang'];
const RE_CHUYEN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Bộ lọc nhóm nguyên nhân (chi-tiet, xlsx): moc_chi_tieu (xnd mặc định | quet_tui_den), nhom_nguyen_nhan (A–E | tat_ca), gio_den 0–23, chuyen HH:MM, thu 2–7 | CN, nguon_hang. */
function docKd(query) {
  const moc = docMocChiTieu(query);
  const nhom = mot(query, 'nhom_nguyen_nhan');
  if (nhom !== undefined && nhom !== '' && nhom !== 'tat_ca' && !KD.NHOM.includes(nhom)) throw new Q.LoiKtt('KTT_NHOM_SAI', 'Tham số "nhom_nguyen_nhan" phải là một trong: A, B, C, D, E, tat_ca.');
  const gioS = mot(query, 'gio_den');
  let gio = null;
  if (gioS !== undefined && gioS !== '') { gio = Number(gioS); if (!/^\d{1,2}$/.test(gioS) || gio < 0 || gio > 23) throw new Q.LoiKtt('KTT_GIO_SAI', 'Tham số "gio_den" phải là số nguyên 0..23.'); }
  const chuyen = mot(query, 'chuyen');
  if (chuyen !== undefined && chuyen !== '' && !RE_CHUYEN.test(chuyen)) throw new Q.LoiKtt('KTT_CHUYEN_SAI', 'Tham số "chuyen" phải có dạng HH:MM (giờ xe rời KTT).');
  const thu = mot(query, 'thu');
  if (thu !== undefined && thu !== '' && !KD.THU.includes(thu)) throw new Q.LoiKtt('KTT_THU_SAI', 'Tham số "thu" phải là một trong: 2, 3, 4, 5, 6, 7, CN.');
  const nh = mot(query, 'nguon_hang');
  if (nh !== undefined && nh !== '' && !Object.values(Q.NGUON_HANG).includes(nh)) throw new Q.LoiKtt('KTT_NGUON_HANG_SAI', `Tham số "nguon_hang" phải là một trong: ${Object.values(Q.NGUON_HANG).join(', ')}.`);
  return { moc, nhom: nhom === undefined || nhom === '' ? 'tat_ca' : nhom, gio, chuyen: chuyen === undefined || chuyen === '' ? null : chuyen, thu: thu === undefined || thu === '' ? null : thu, nguonHang: nh === undefined || nh === '' ? null : nh };
}

/**
 * GET /api/ktt/luu-thoat/khong-dat-14h?tu=&den=[&ma_bcvh=&nguon=&thu=&nguon_hang=&bien_sat_gio_phut=30|60|90&top=] — các bảng «Vì sao không đạt 14 giờ» của MỌI mốc (bộ nặng của từng ngày, cùng cache theo ngày với /luu-thoat).
 * Bộ lọc ma_bcvh / nguon / thu / nguon_hang áp cho mọi bảng (riêng du_dia_theo_gio không có chiều `nguon`; dot_den không có `nguon_hang` riêng ngoài lọc chung).
 */
async function khongDat14h(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['ma_bcvh', 'nguon', 'thu', 'nguon_hang', 'bien_sat_gio_phut', 'top', 'moc']);
  const mocBt = docMocBt(query); // pha 2 bản sửa 2: mốc mặc định A (PO 04/11/2026); API vẫn trả cả hai mốc ở mọi bảng, `moc` chỉ chọn mốc xếp `dot_den`
  const maBcvh = docMaBcvh(query);
  const nguon = docNguon(query);
  const thuS = mot(query, 'thu');
  if (thuS !== undefined && thuS !== '' && !KD.THU.includes(thuS)) throw new Q.LoiKtt('KTT_THU_SAI', 'Tham số "thu" phải là một trong: 2, 3, 4, 5, 6, 7, CN.');
  const nhS = mot(query, 'nguon_hang');
  if (nhS !== undefined && nhS !== '' && !Object.values(Q.NGUON_HANG).includes(nhS)) throw new Q.LoiKtt('KTT_NGUON_HANG_SAI', `Tham số "nguon_hang" phải là một trong: ${Object.values(Q.NGUON_HANG).join(', ')}.`);
  const bs = mot(query, 'bien_sat_gio_phut');
  const bienSat = bs === undefined || bs === '' ? KD.SAT_GIO_MAC_DINH : Number(bs);
  if (!KD.SAT_GIO_PHUT.includes(bienSat)) throw new Q.LoiKtt('KTT_BIEN_SAT_GIO_SAI', `Tham số "bien_sat_gio_phut" phải là một trong: ${KD.SAT_GIO_PHUT.join(', ')} (mặc định ${KD.SAT_GIO_MAC_DINH}).`);
  const tp = mot(query, 'top');
  const top = tp === undefined || tp === '' ? 15 : Number(tp);
  if (!Number.isInteger(top) || top < 1 || top > 50) throw new Q.LoiKtt('KTT_TOP_SAI', 'Tham số "top" phải là số nguyên 1..50.');
  const loc = { maBcvh, nguon, thu: thuS === undefined || thuS === '' ? null : thuS, nguonHang: nhS === undefined || nhS === '' ? null : nhS };
  const doMoi = QL.docDoMoi(db);
  const ra = { khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay }, bo_loc: { ma_bcvh: loc.maBcvh, nguon: loc.nguon, thu: loc.thu, nguon_hang: loc.nguonHang }, bien_sat_gio_phut: bienSat };
  if (!doMoi) return { ...ra, bay_gio: null, nguon_xuat_luc_moi_nhat: null, co_du_lieu: false, ly_do: 'CHUA_CO_DU_LIEU', canh_bao: ['Chưa có dữ liệu «Hàng tại KTT» (chưa nạp cặp file nào): chưa tính được.'] };
  dongBoPhienBan(db);
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now, S.MOC_CHI_TIEU_MAC_DINH)); // cả hai mốc cùng nằm trong mục mốc mặc định
  const nang = KD.gopNang(ds.flatMap((x) => x.nang || []));
  const lt = QL.ghepKhoang(ds);
  const mocTop = BT.MOC_BT[mocBt]; // dot_den xếp theo mốc `moc` (mặc định A); cả hai mốc đều có trong theo_moc của từng đợt
  return {
    ...ra, bay_gio: doMoi.nguon_xuat_luc, nguon_xuat_luc_moi_nhat: doMoi.nguon_xuat_luc, co_du_lieu: lt.co_du_lieu, ly_do: null,
    moc: mocBt, moc_mac_dinh: BT.MOC_MAC_DINH, moc_goi_y_chan_doan: KD.MOC[1], moc_dot_den: mocTop,
    lap_ngay_nghi: { shbg: lt.meta.lap_ngay_nghi_shbg || 0, theo_bcvh: lt.meta.lap_ngay_nghi || {}, ghi_chu: 'Cờ phụ (KTT-LICH-2): bưu gửi có BD10 đi lập Chủ nhật sau chuyến Chủ nhật cuối còn chạy của BCVH có chuyến nghỉ; vẫn nằm trong mẫu số và nhóm nguyên nhân, chỉ đếm riêng.' },
    nhan_nhom: KD.NHAN_NHOM, ly_do_xep_nhom: KD.LY_DO_XEP_NHOM,
    tong: KD.tongNhom(nang, loc),
    theo_ngay: KD.gomChieu(nang, loc, ['ngay'], true),
    theo_thu: KD.gomChieu(nang, loc, ['thu'], true),
    theo_nguon_hang: KD.gomChieu(nang, loc, ['nh'], true),
    theo_bcvh: KD.gomChieu(nang, loc, ['bcvh'], true),
    theo_bcvh_loai_ngay: KD.gomChieu(nang, loc, ['bcvh', 'loai_ngay'], true),
    theo_duong_thu: KD.gomChieu(nang, loc, ['nguon'], true),
    theo_gio_den: KD.gomChieu(nang, loc, ['gio'], true),
    theo_gio_duong_thu: KD.gomChieu(nang, loc, ['gio', 'nguon'], true),
    theo_bcvh_chuyen: KD.gomChieu(nang, loc, ['bcvh', 'chuyen'], false),
    phan_bo_cho: KD.phanBoCho(nang, loc),
    du_dia_theo_gio: KD.duDiaTheoGio(nang, loc),
    dot_den: KD.dotDen(nang, loc, mocTop, bienSat, top),
    canh_bao: [
      'Mốc A đo từ giờ xác nhận BD10 đến chung của cả đợt nên có thể méo theo lô; mốc B (quét túi đến) phù hợp để chẩn đoán. Mốc mặc định của khối là A (PO 04/11/2026). Chỉ tiêu chính thức không đổi.',
      ...lt.canh_bao.filter((c) => !/bưu gửi không rõ đích/.test(c)),
      ...(loc.nguon ? ['du_dia_theo_gio không có chiều đường thư nên không áp bộ lọc `nguon`.'] : [])
    ],
    meta: { do_chinh_xac_phan_vi: { bien_an_toan_phut: KD.BUOC_BIEN, cho_theo_lich_gio: KD.BUOC_CHO / 60, du_dia_gio: KD.BUOC_DU / 60 }, khong_ap_loc_nguon: ['du_dia_theo_gio'] }
  };
}

/** GET /api/ktt/chi-tiet?tu=&den=&loai=&ma_bcvh=&page=&page_size= — loai: loại của kttQuery.chiTiet HOẶC nhóm lưu thoát (QL.NHOM_LUU_THOAT). Phân trang như /api/arrivals/items (page, page_size ≤ 200). */
async function chiTiet(db, query, { now = Date.now() } = {}) {
  const laKd = query && query.loai === KD.LOAI_CHI_TIET; // KTT-KD-1: tham số nhóm nguyên nhân chỉ được nhận với loai=khong_dat_14h (loai khác: khóa lạ -> 400 như trước)
  const k = docKhoang(query, ['loai', 'ma_bcvh', 'page', 'page_size', 'nguon', ...(laKd ? THAM_SO_KD : [])]);
  const loai = mot(query, 'loai');
  const nhom = Object.prototype.hasOwnProperty.call(QL.NHOM_LUU_THOAT, loai) || loai === KD.LOAI_CHI_TIET ? loai : null;
  if (loai === undefined || (!LOAI_CU.has(loai) && nhom === null)) throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "loai" phải thuộc: ${[...Q.LOAI_CHI_TIET, ...Object.keys(QL.NHOM_LUU_THOAT), KD.LOAI_CHI_TIET].join(', ')}.`);
  const page = mot(query, 'page');
  const size = mot(query, 'page_size');
  const trang = page === undefined || page === '' ? 1 : Number(page);
  const kichThuocTrang = size === undefined || size === '' ? 50 : Number(size);
  if (!Number.isInteger(trang) || trang < 1) throw new Q.LoiKtt('KTT_TRANG_SAI', 'Tham số "page" phải là số nguyên ≥ 1.');
  if (!Number.isInteger(kichThuocTrang) || kichThuocTrang < 1 || kichThuocTrang > QL.TRANG_TOI_DA) throw new Q.LoiKtt('KTT_TRANG_SAI', `Tham số "page_size" phải là số nguyên 1..${QL.TRANG_TOI_DA}.`);
  const maBcvh = docMaBcvh(query);
  const nguon = docNguon(query);
  if (nguon !== null && nhom === null) throw new Q.LoiKtt('KTT_NGUON_SAI', 'Tham số "nguon" chỉ dùng với các nhóm lưu thoát (t1…t5, ro_lai, truot_chuyen…).');
  const kd = loai === KD.LOAI_CHI_TIET ? docKd(query) : null; // KTT-KD-1
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`;
  const tinh = async () => {
    dem.chiTietTinh++;
    const r = nhom
      ? await chayNen(db, 'chiTietLuuThoat', { tuNgay: k.tuNgay, denNgay: k.denNgay, nhom, maBcvh, nguon, trang, kichThuocTrang, bayGio, kd })
      : await chayNen(db, 'chiTietCu', { tuNgay: k.tuNgay, denNgay: k.denNgay, loai, maBcvh, trang, kichThuocTrang, bayGio });
    return {
      items: r.dong,
      pagination: { total: r.tong, page: trang, page_size: r.kichThuocTrang, total_pages: r.soTrang },
      meta: { loai, ma_bcvh: maBcvh, nguon, tu: k.tuNgay, den: k.denNgay, ...(kd ? { moc_chi_tieu: kd.moc, nhom_nguyen_nhan: kd.nhom, gio_den: kd.gio, chuyen: kd.chuyen, thu: kd.thu, nguon_hang: kd.nguonHang } : {}), ...metaDoMoi(doMoi, bayGio, db) }
    };
  };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `${loai}|${maBcvh || ''}|${nguon || ''}|${kd ? JSON.stringify(kd) : ''}|${k.tuNgay}|${k.denNgay}|${trang}|${kichThuocTrang}`, now, doMoi.nguon_xuat_luc, tinh);
}

// ------------------------------------------
// xuat/luu-thoat (KTT-8b)
// ------------------------------------------
/**
 * GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=] — chuẩn bị nội dung file: { tenFile, thongTin, dong }. Chưa ghi gì ra response (route ghi sau khi mọi kiểm tra đã qua, nên lỗi vẫn là JSON 400).
 * Cột «đã chốt» lấy từ luuThoat() (CÙNG cache theo ngày với /luu-thoat); các dòng SHBG tính ở worker bằng CÙNG lượt duyệt với /chi-tiet. `nguoiXuat`, `now`: tên đăng nhập và đồng hồ (test).
 */
async function xuatLuuThoat(db, query, { now = Date.now(), nguoiXuat = null } = {}) {
  const k = docKhoang(query, ['trang_thai', 'ma_bcvh', 'nguon']);
  const nhom = mot(query, 'trang_thai');
  const maBcvh = docMaBcvh(query);
  const nguon = docNguon(query);
  if (nhom !== undefined && nhom !== '' && !Object.prototype.hasOwnProperty.call(QL.NHOM_LUU_THOAT, nhom)) {
    throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "trang_thai" phải thuộc: ${Object.keys(QL.NHOM_LUU_THOAT).join(', ')}.`);
  }
  const loc = nhom === undefined || nhom === '' ? null : nhom;
  const doMoi = QL.docDoMoi(db);
  const tran = X.tranDong();
  const [luuThoatKq, r] = await Promise.all([
    luuThoat(db, { tu: k.tuNgay, den: k.denNgay }, { now }),
    doMoi ? chayNen(db, 'xuatLuuThoat', { tuNgay: k.tuNgay, denNgay: k.denNgay, nhom: loc, maBcvh, nguon, bayGio: doMoi.nguon_xuat_luc, tranDong: tran }) : { tong: 0, vuotTran: false, dong: [] }
  ]);
  if (r.vuotTran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${r.tong} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc thêm bộ lọc "trang_thai".`);
  const lich = L.docLichChuyen(db);
  const thongTin = X.dongThongTin({
    tu: k.tuNgay, den: k.denNgay, nhom: loc, maBcvh, nguon, luuThoat: luuThoatKq, soDong: r.dong.length, nguoiXuat, xuatLuc: X.gioVietNam(now),
    hanPhut: lich.hanDenTruocChuyenPhut, gioChot: QL.gioChot()
  });
  return { tenFile: X.tenFile(k.tuNgay, k.denNgay), thongTin, dong: r.dong, tong: r.dong.length, khoang: k, nhom: loc, maBcvh, nguon };
}


/**
 * GET /api/ktt/xuat/khong-dat-14h?tu=&den=[&moc_chi_tieu=&nhom_nguyen_nhan=&ma_bcvh=&nguon=&gio_den=&chuyen=&thu=&nguon_hang=] — chuẩn bị file xlsx sheet 10 { tenFile, thongTin, dong, cot, tenSheet, khoang, ... }.
 * Số dòng = pagination.total của /chi-tiet?loai=khong_dat_14h cùng tham số = số trên màn hình (bảng `tong`/chiều tương ứng của khongDat14h).
 */
async function xuatKhongDat14h(db, query, { now = Date.now(), nguoiXuat = null } = {}) {
  const k = docKhoang(query, ['ma_bcvh', 'nguon', ...THAM_SO_KD]);
  const maBcvh = docMaBcvh(query);
  const nguon = docNguon(query);
  const kd = docKd(query);
  const doMoi = QL.docDoMoi(db);
  const tran = X.tranDong();
  const r = doMoi ? await chayNen(db, 'xuatKhongDat14h', { tuNgay: k.tuNgay, denNgay: k.denNgay, kd, maBcvh, nguon, bayGio: doMoi.nguon_xuat_luc, tranDong: tran }) : { tong: 0, vuotTran: false, dong: [] };
  if (r.vuotTran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${r.tong} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc thêm bộ lọc.`);
  let soManHinh = null;
  if (doMoi) {
    dongBoPhienBan(db);
    const ds = [];
    for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now, S.MOC_CHI_TIEU_MAC_DINH));
    soManHinh = KD.demTheoLoc(KD.gopNang(ds.flatMap((x) => x.nang || [])), { maBcvh, nguon, thu: kd.thu, nguonHang: kd.nguonHang }, kd);
  } else soManHinh = 0;
  const lich = L.docLichChuyen(db);
  const thongTin = X.dongThongTin10({ tu: k.tuNgay, den: k.denNgay, kd, maBcvh, nguon, doMoi: doMoi ? doMoi.nguon_xuat_luc : null, soDong: r.dong.length, soManHinh, nguoiXuat, xuatLuc: X.gioVietNam(now), hanPhut: lich.hanDenTruocChuyenPhut });
  return { tenFile: X.tenFile10(k.tuNgay, k.denNgay, kd.moc), thongTin, dong: r.dong, tong: r.dong.length, khoang: k, kd, maBcvh, nguon, cot: X.COT_SHEET10, tenSheet: X.TEN_SHEET_10 };
}

// ------------------------------------------
// KTT-12: đi cùng ngày (B1–B3), hàng rớt lại, lịch xe (B4–B6), danh sách bấm ô, hàng đến (A), tổng quan
// ------------------------------------------
// Số liệu B của MỖI NGÀY là một «bó» cộng được (kttDiNgay.taoNgay), cache theo ngày với đúng quy tắc của luu-thoat (conHanNgay); khoảng ngày = cộng các bó.
// Mọi endpoint B (tong-hop, theo-ngay, theo-gio, rotlai, lich-xe/theo-duong-thu, theo-bcvh, tong-quan) cắt ra từ CÙNG các bó nên không thể lệch nhau.
async function layNgayB(db, ngay, doMoi, now) {
  const e = boNho.ngayB.get(ngay);
  const token = PD.dauHieuDb(db);
  if (e) {
    if (conHanNgay(db, e, ngay, doMoi, now, token)) return e.kq;
    boNho.ngayB.delete(ngay);
  }
  const dangDC = boNho.dangTinh.get(`dc|${ngay}|${doMoi}`); // KTT-16-2: lượt đối chiếu của CHÍNH ngày này đang chạy cũng sẽ cất bó B: chờ rồi dùng, không duyệt hai lần
  if (dangDC) {
    await dangDC;
    const e2 = boNho.ngayB.get(ngay);
    if (e2 && conHanNgay(db, e2, ngay, doMoi, now, PD.dauHieuDb(db))) return e2.kq;
  }
  return chiaSe(`b|${ngay}|${doMoi}`, async () => {
    await nhuong(); // nhường vòng lặp sự kiện trước mỗi ngày tính (như luu-thoat)
    const tk = PD.dauHieuDb(db);
    const ck = chuKyNgay(db, ngay);
    dem.ngayBTinh++;
    const kq = DQ.tinhNgay(db, ngay, doMoi);
    kq.da_chot = S.daChot(ngay, doMoi, QL.gioChot());
    datMuc(boNho.ngayB, NGAY_TOI_DA_TRONG_NHO, ngay, { luc: now, kq, daChot: kq.da_chot, doMoi, token: tk, chuKy: ck });
    return kq;
  });
}

/** Bó từng ngày + bó khoảng. Chưa có dữ liệu (chưa nạp cặp nào): các bó rỗng, doMoi = null. */
async function boDiNgay(db, k, now) {
  const doMoi = QL.docDoMoi(db);
  dongBoPhienBan(db);
  if (!doMoi) { const ds = k.ngays.map((n) => D.taoNgay(n)); return { doMoi: null, ds, m: D.congCacNgay(ds) }; }
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgayB(db, ngay, doMoi.nguon_xuat_luc, now));
  return { doMoi, ds, m: D.congCacNgay(ds) };
}

/** Phần đầu chung của mọi phản hồi KTT-12: khoảng ngày yêu cầu, cửa sổ ngày THỰC TẾ có dữ liệu, «Dữ liệu đến» (độ mới) — như /luu-thoat. */
function dauPhanHoi(k, doMoi, cuaSo, extra = {}) {
  return {
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay, so_ngay: k.ngays.length },
    cua_so_thuc_te: { tu_ngay: cuaSo.tu_ngay, den_ngay: cuaSo.den_ngay, so_ngay_co_du_lieu: cuaSo.so_ngay_co_du_lieu === undefined ? null : cuaSo.so_ngay_co_du_lieu },
    nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null, bay_gio: doMoi ? doMoi.nguon_xuat_luc : null,
    co_du_lieu: !!doMoi && cuaSo.tu_ngay !== null, ly_do: doMoi ? null : 'CHUA_CO_DU_LIEU', ...(boNho.hangHoan || {}), ...extra
  };
}
const cuaSoB = (m) => ({ tu_ngay: m.ngay_dau, den_ngay: m.ngay_cuoi, so_ngay_co_du_lieu: m.so_ngay_co_du_lieu });
const dauB = (k, b, extra) => dauPhanHoi(k, b.doMoi, cuaSoB(b.m), extra);
const DINH_NGHIA_B = Object.freeze({
  cung_ngay: 'BD10 đi (giờ lập) trước 24:00 ngày đến KTT (ngày của giờ quét túi đến) — cùng định nghĩa trạng thái 1 + 2 của /luu-thoat',
  ro_lai: 'không đi cùng ngày = hôm sau + từ 2 ngày + chưa đi (= trạng thái 3 + 4 + 5 của /luu-thoat); không tính hàng «đang chờ chuyến»',
  chua_di: 'chưa có BD10 đi; trên 24 giờ khi (độ mới dữ liệu − giờ quét túi đến) > 24 giờ đồng hồ liên tục',
  hang_hoan: 'hàng hoàn (SHBG trong danh sách ItemReturn, đích 6 BCVH Huế, mọi nơi gửi) tách riêng, không cộng vào tổng và tỷ lệ',
  moc_gio_den: 'gio_quet_tui_den'
});

function docSoNguyen(query, ten, min, max, macDinh) {
  const v = mot(query, ten);
  if (v === undefined || v === '') return macDinh;
  const n = Number(v);
  if (!/^\d+$/.test(v) || !Number.isInteger(n) || n < min || n > max) throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "${ten}" phải là số nguyên ${min}..${max}.`);
  return n;
}
/**
 * Tham số mã (đường thư, nơi gửi): cùng biểu thức chính quy như `nguon`, chỉ để so sánh chuỗi (không vào SQL). Bỏ khoảng trắng đầu / cuối (dữ liệu so sánh cũng đã trim).
 * KTT-8d2: `__RONG__` (NG.MA_LOC_RONG) = «mã null hoặc rỗng». Phải là MÃ, không phải tên hiển thị (tên có thể có ngoặc, dài hơn 40 ký tự nên bị từ chối).
 */
function docMa(query, ten) {
  const v0 = mot(query, ten);
  const v = typeof v0 === 'string' ? v0.trim() : v0;
  if (v === undefined || v === '') return null;
  if (!NG.RE_MA_NGUON.test(v)) throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "${ten}" phải là MÃ (không phải tên hiển thị): chỉ gồm chữ, số, _ . - / và khoảng trắng, tối đa 40 ký tự; ${NG.MA_LOC_RONG} = mã rỗng.`);
  return v;
}
/** KTT-8d2: `hang_hoan` — 0 / false = LOẠI hàng hoàn; 1 / true = CHỈ hàng hoàn; vắng hoặc rỗng = cả hai (không lọc). Trả false | true | null; giá trị khác -> 400. */
function docHangHoan(query) {
  const v = mot(query, 'hang_hoan');
  if (v === undefined || v === '') return null;
  const t = String(v).trim().toLowerCase();
  if (t === '0' || t === 'false') return false;
  if (t === '1' || t === 'true') return true;
  throw new Q.LoiKtt('KTT_THAM_SO_SAI', 'Tham số "hang_hoan" phải là 0 / false (loại hàng hoàn), 1 / true (chỉ hàng hoàn) hoặc để trống (cả hai).');
}

/** GET /api/ktt/dicungngay/tong-hop?tu=&den= — thẻ B1: ba hướng, % cùng ngày / hôm sau / từ 2 ngày / chưa đi (dưới, trên 24 giờ). */
async function diCungNgayTongHop(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const b = await boDiNgay(db, k, now);
  return { ...dauB(k, b), ...D.tongHop(b.m), dinh_nghia: DINH_NGHIA_B };
}

/** GET /api/ktt/dicungngay/theo-ngay?tu=&den= — B2: % cùng ngày từng ngày (hàng đi 6 BCVH Huế, không kể hàng hoàn), cờ Chủ nhật, cờ đã chốt. */
async function diCungNgayTheoNgay(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const b = await boDiNgay(db, k, now);
  const theo = D.theoNgay(b.ds, Object.fromEntries(b.ds.map((d) => [d.ngay, !!d.da_chot])));
  return { ...dauB(k, b), theo_ngay: theo, so_sanh_chu_nhat: D.soSanhChuNhat(theo), dinh_nghia: DINH_NGHIA_B };
}

/** GET /api/ktt/dicungngay/theo-gio?tu=&den= — B3: theo giờ quét túi đến (0..23). */
async function diCungNgayTheoGio(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const b = await boDiNgay(db, k, now);
  return { ...dauB(k, b), theo_gio: D.theoGio(b.m), chia_12h: D.chia12h(b.m), dinh_nghia: DINH_NGHIA_B };
}

/** GET /api/ktt/rotlai/theo-duong-thu?tu=&den=[&top=] — hàng rớt lại của các đường thư Cấp 1 lớn nhất (mặc định 8) đi 6 BCVH Huế. */
async function rotLaiTheoDuongThu(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['top']);
  const top = docSoNguyen(query, 'top', 1, 50, 8);
  const b = await boDiNgay(db, k, now);
  return { ...dauB(k, b), ...D.rotLaiTheoDuongThu(b.m, top), dinh_nghia: DINH_NGHIA_B };
}

/** B4 cho [tuNgay, denNgay]: không cần bó SHBG, đọc BD10 đi trực tiếp; chạy ở worker, đệm theo (khoảng, minBd10) như tong-hop / chi-tiet. */
async function layGioLapBd10(db, k, minBd10, now) {
  const doMoi = QL.docDoMoi(db);
  const tinh = async () => chayNen(db, 'gioLapBd10', { tuNgay: k.tuNgay, denNgay: k.denNgay, minBd10 });
  if (!doMoi) return { doMoi: null, r: await tinh() };
  return { doMoi, r: await layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `b4|${minBd10}|${k.tuNgay}|${k.denNgay}`, now, doMoi.nguon_xuat_luc, tinh) };
}

/** GET /api/ktt/lich-xe/gio-lap-bd10?tu=&den=[&min_bd10=] — B4. */
async function lichXeGioLapBd10(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['min_bd10']);
  const minBd10 = docSoNguyen(query, 'min_bd10', 1, LX.MIN_BD10_TOI_DA, LX.MIN_BD10_MAC_DINH);
  const { doMoi, r } = await layGioLapBd10(db, k, minBd10, now);
  return { ...dauPhanHoi(k, doMoi, { tu_ngay: r.cua_so_thuc_te.tu_ngay, den_ngay: r.cua_so_thuc_te.den_ngay }), ...r };
}

/** GET /api/ktt/lich-xe/theo-duong-thu?tu=&den=[&top=] — B5: theo (nơi gửi, đường thư đến), ba mục (Cấp 1 → BCVH, nội tỉnh → BCVH, nội tỉnh → liên tỉnh). */
async function lichXeTheoDuongThu(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['top']);
  const top = docSoNguyen(query, 'top', 1, 50, 0);
  const b = await boDiNgay(db, k, now);
  const tops = top ? { lien_tinh_den_bcvh: top, noi_tinh_den_bcvh: top, noi_tinh_di_lien_tinh: top } : {};
  return { ...dauB(k, b), ...D.theoDuongThu(b.m, tops), dinh_nghia: DINH_NGHIA_B };
}

/** GET /api/ktt/lich-xe/theo-bcvh?tu=&den= — B6: mỗi BCVH có cột hàng đến theo giờ, vạch lịch xe, giờ lập BD10 thực tế. */
async function lichXeTheoBcvh(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const [b, { r: b4 }] = await Promise.all([boDiNgay(db, k, now), layGioLapBd10(db, k, 1, now)]);
  return {
    ...dauB(k, b), bcvh: LX.theoBcvh(db, b.m, b4), quy_uoc: b4.quy_uoc,
    canh_bao: ['Số «hàng đến theo giờ» gồm cả bưu gửi khai thác lại (túi đến được mở) lẫn bưu gửi chỉ có túi chuyển tiếp đi (KTT không mở túi) — KTT-14.', ...b4.canh_bao]
  };
}

const THAM_SO_O_BAM = ['loai', 'duong_thu', 'noi_gui', 'huong', 'hang_hoan', 'ma_bcvh'];
/** Tham số của một ô bấm (dùng chung /danh-sach và /xuat/hom-sau-chua-di — KTT-8d): kiểm tra như nhau, lỗi -> LoiKtt (400). */
function docOBam(query) {
  const loai = mot(query, 'loai');
  if (loai === undefined || !Object.prototype.hasOwnProperty.call(DQ.LOAI_DANH_SACH, loai)) throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "loai" phải thuộc: ${Object.keys(DQ.LOAI_DANH_SACH).join(', ')}.`);
  const duongThu = docMa(query, 'duong_thu');
  const noiGui = docMa(query, 'noi_gui');
  const huong = mot(query, 'huong');
  const HUONG_DS = [D.HUONG.LIEN_TINH_DEN_BCVH, D.HUONG.NOI_TINH_DEN_BCVH, D.HUONG.NOI_TINH_DI_LIEN_TINH];
  if (huong !== undefined && huong !== '' && !HUONG_DS.includes(huong)) throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "huong" phải thuộc: ${HUONG_DS.join(', ')}.`);
  const hangHoan = docHangHoan(query);
  const maBcvh = docMaBcvh(query);
  return { loai, duongThu, noiGui, huong: huong || null, hangHoan, maBcvh };
}

/** GET /api/ktt/danh-sach?loai=hom-sau|chua-di-24h&tu=&den=[&duong_thu=&noi_gui=&huong=&hang_hoan=&ma_bcvh=&page=&page_size=] — danh sách bấm ô (phân trang như /chi-tiet). */
async function danhSachDiNgay(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, [...THAM_SO_O_BAM, 'page', 'page_size']);
  const { loai, duongThu, noiGui, huong, hangHoan, maBcvh } = docOBam(query);
  const trang = docSoNguyen(query, 'page', 1, 1000000, 1);
  const kichThuocTrang = docSoNguyen(query, 'page_size', 1, DQ.TRANG_TOI_DA, 50);
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`;
  const tinh = async () => {
    dem.chiTietTinh++;
    const r = await chayNen(db, 'danhSachDiNgay', { tuNgay: k.tuNgay, denNgay: k.denNgay, loai, duongThu, noiGui, huong: huong || null, hangHoan, maBcvh, trang, kichThuocTrang, bayGio });
    return {
      items: r.dong, pagination: { total: r.tong, page: trang, page_size: r.kichThuocTrang, total_pages: r.soTrang },
      meta: { loai, duong_thu: duongThu, noi_gui: noiGui, huong: huong || null, hang_hoan: hangHoan, ma_bcvh: maBcvh, tu: k.tuNgay, den: k.denNgay, ...metaDoMoi(doMoi, bayGio, db) }
    };
  };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `ds|${loai}|${duongThu || ''}|${noiGui || ''}|${huong || ''}|${hangHoan === null ? '' : hangHoan ? 1 : 0}|${maBcvh || ''}|${k.tuNgay}|${k.denNgay}|${trang}|${kichThuocTrang}`, now, doMoi.nguon_xuat_luc, tinh);
}

/**
 * KTT-8d: GET /api/ktt/xuat/hom-sau-chua-di?tu=&den=&loai=hom-sau|chua-di-24h[&duong_thu=&noi_gui=&huong=&hang_hoan=&ma_bcvh=] — CÙNG tham số với /danh-sach (trừ page, page_size).
 * Chuẩn bị nội dung file sheet 8 { tenFile, thongTin, dong, sheet: 8 }; route ghi sau khi mọi kiểm tra đã qua (lỗi vẫn là JSON 400). Các dòng tính ở worker bằng CÙNG lượt duyệt
 * với /danh-sach (cùng «bây giờ»); «đã chốt», cửa sổ thực tế và số ô màn hình lấy từ bó B theo ngày (CÙNG cache với B1–B6).
 */
async function xuatHomSauChuaDi(db, query, { now = Date.now(), nguoiXuat = null } = {}) {
  const k = docKhoang(query, THAM_SO_O_BAM);
  const o = docOBam(query);
  const loc = DQ.boLocDanhSach(o);
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`; // như /danh-sach
  const tran = X.tranDong();
  const [b, r] = await Promise.all([
    boDiNgay(db, k, now),
    chayNen(db, 'xuatHomSauChuaDi', { tuNgay: k.tuNgay, denNgay: k.denNgay, loai: o.loai, duongThu: o.duongThu, noiGui: o.noiGui, huong: o.huong, hangHoan: o.hangHoan, maBcvh: o.maBcvh, bayGio, tranDong: tran })
  ]);
  if (r.vuotTran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${r.tong} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc chọn ô cụ thể hơn (đường thư, nơi gửi).`);
  const lich = L.docLichChuyen(db);
  const thongTin = X.dongThongTin8({
    tu: k.tuNgay, den: k.denNgay, loai: o.loai, loc, b, soDong: r.dong.length, soManHinh: D.soOManHinh(b.m, loc), nguoiXuat, xuatLuc: X.gioVietNam(now),
    hanPhut: lich.hanDenTruocChuyenPhut, gioChot: QL.gioChot()
  });
  return { tenFile: X.tenFile8(k.tuNgay, k.denNgay, o.loai), thongTin, dong: r.dong, sheet: 8, tong: r.dong.length, khoang: k, loai: o.loai, loc };
}

// ---- A: hàng đến
async function layHangDen(db, k, now) {
  const doMoi = QL.docDoMoi(db);
  const tinh = async () => { dem.hangDenTinh++; return chayNen(db, 'hangDen', { tuNgay: k.tuNgay, denNgay: k.denNgay }); };
  if (!doMoi) return { doMoi: null, a: await tinh() };
  const a = await layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `hd|${k.tuNgay}|${k.denNgay}`, now, doMoi.nguon_xuat_luc, tinh);
  return { doMoi, a };
}
const dauA = (k, h) => dauPhanHoi(k, h.doMoi, h.a.cua_so, { meta: h.a.meta });

/** GET /api/ktt/hang-den/tong-hop?tu=&den= — A: thẻ tổng (bưu gửi, kg, xe, đích) + A1 theo ngày. Ngày theo giờ xe đến (bd10_den_xnd). */
async function hangDenTongHop(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const h = await layHangDen(db, k, now);
  return { ...dauA(k, h), ...h.a.tong_hop };
}
/** GET /api/ktt/hang-den/theo-gio?tu=&den= — A3: bưu gửi đến theo giờ xe đến, chia theo đường thư lớn nhất. */
async function hangDenTheoGio(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const h = await layHangDen(db, k, now);
  return { ...dauA(k, h), duong_thu_hang_dau: h.a.duong_thu_hang_dau, theo_gio: h.a.theo_gio };
}
/** GET /api/ktt/hang-den/theo-duong-thu?tu=&den=[&top=] — A4 + đợt xe chính (A2) + hướng hàng (A5). */
async function hangDenTheoDuongThu(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['top']);
  const top = docSoNguyen(query, 'top', 1, 200, 0);
  const h = await layHangDen(db, k, now);
  return { ...dauA(k, h), so_duong_thu: h.a.theo_duong_thu.length, theo_duong_thu: top ? h.a.theo_duong_thu.slice(0, top) : h.a.theo_duong_thu, ten_bcvh: h.a.ten_bcvh };
}
/** GET /api/ktt/hang-den/xe?tu=&den= — A2: mỗi xe (BD10 đến) một dòng: giờ xác nhận, đường thư, số bưu gửi, kg. */
async function hangDenXe(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const h = await layHangDen(db, k, now);
  return { ...dauA(k, h), xe: h.a.xe };
}

// ---- Tổng quan: gom từ CÙNG các bó / bó A nên không tính lại riêng
const NGUONG_CANH_BAO = Object.freeze({ cung_ngay_thap: 0.5, chu_nhat_thap_hon: 0.05 }); // TẠM: ngưỡng chữ «cảnh báo» của tổng quan
const tyLe2 = (tu, mau) => (mau > 0 ? tu / mau : null);
function canhBaoTongQuan(tongHopB, chia12, soSanhCn) {
  const ds = [];
  const t12 = chia12.tu_12h;
  const t0 = chia12.truoc_12h;
  if (t12.mau_so > 0 && t12.ty_le.cung_ngay < NGUONG_CANH_BAO.cung_ngay_thap) {
    ds.push({ ma: 'DEN_TU_12H_SANG_HOM_SAU', muc: 'CANH_BAO', truoc_12h: t0.ty_le.cung_ngay, tu_12h: t12.ty_le.cung_ngay, shbg_tu_12h: t12.mau_so, ty_le_hang_tu_12h: tyLe2(t12.mau_so, t0.mau_so + t12.mau_so) });
  }
  const nt = tongHopB.noi_tinh_den_bcvh.khong_hang_hoan;
  if (nt.mau_so > 0 && nt.ty_le.cung_ngay < NGUONG_CANH_BAO.cung_ngay_thap) ds.push({ ma: 'NOI_TINH_DI_BCVH_CHAM', muc: 'CANH_BAO', cung_ngay: nt.ty_le.cung_ngay, hom_sau: nt.ty_le.hom_sau, mau_so: nt.mau_so });
  const cn = soSanhCn.chu_nhat;
  const th = soSanhCn.ngay_thuong;
  if (cn.so_ngay > 0 && th.so_ngay > 0 && cn.ty_le_trung_binh_ngay < th.ty_le_trung_binh_ngay - NGUONG_CANH_BAO.chu_nhat_thap_hon) {
    ds.push({ ma: 'CHU_NHAT_CHAM_HON', muc: 'LUU_Y', chu_nhat: cn.ty_le_trung_binh_ngay, ngay_thuong: th.ty_le_trung_binh_ngay });
  }
  return ds;
}

/** GET /api/ktt/tong-quan?tu=&den= — số thẻ của trang Tổng quan, gom từ các hàm B1/B2/B3/rớt lại và A (không tính lại riêng). */
async function tongQuan(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const [b, h] = await Promise.all([boDiNgay(db, k, now), layHangDen(db, k, now)]);
  const theo = D.theoNgay(b.ds, Object.fromEntries(b.ds.map((d) => [d.ngay, !!d.da_chot])));
  const the = D.tongHop(b.m);
  const chia12 = D.chia12h(b.m);
  const soSanhCn = D.soSanhChuNhat(theo);
  const { theo_ngay: boQua, ...tongHopA } = h.a.tong_hop; // eslint-disable-line no-unused-vars
  return {
    ...dauB(k, b), dinh_nghia: DINH_NGHIA_B,
    di_cung_ngay: {
      the,
      theo_ngay: theo.map((d) => ({ ngay: d.ngay, chu_nhat: d.chu_nhat, da_chot: d.da_chot, co_du_lieu: d.co_du_lieu, mau_so: d.bcvh_hue.mau_so, cung_ngay: d.bcvh_hue.cung_ngay, ty_le_cung_ngay: d.bcvh_hue.ty_le.cung_ngay })),
      so_sanh_chu_nhat: soSanhCn, chia_12h: chia12
    },
    rot_lai: D.rotLaiTheoDuongThu(b.m, 3),
    hang_den: { cua_so_thuc_te: h.a.cua_so, tong_hop: tongHopA, meta: h.a.meta },
    canh_bao: canhBaoTongQuan(the, chia12, soSanhCn)
  };
}

// ------------------------------------------
// meta
// ------------------------------------------
const SNAKE_NGUONG = { treoPhut: 'treo_phut', namLauToiDaPhut: 'nam_lau_toi_da_phut', chiTieuF13Gio: 'chi_tieu_f13_gio', chiTieuF13GioThuanHoaPhuXuan: 'chi_tieu_f13_gio_thuan_hoa_phu_xuan' };
/** GET /api/ktt/meta — rẻ, không đệm: độ mới, lịch chuyến (14 dòng), hạn đến trước chuyến, giờ chốt ngày, ngưỡng, chỉ tiêu, giới hạn. */
function meta(db) {
  const doMoi = QL.docDoMoi(db);
  const lich = L.docLichChuyen(db);
  const cauHinh = docCauHinhKtt(db);
  return {
    nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null, nap_luc: doMoi ? doMoi.nap_luc : null,
    lich_chuyen: lich.lich, han_den_truoc_chuyen_phut: lich.hanDenTruocChuyenPhut, gio_chot_ngay: QL.gioChot(),
    nguong: Object.fromEntries(Object.entries(cauHinh.nguong).map(([k, v]) => [SNAKE_NGUONG[k] || k, v])),
    chi_tieu_gio: { mac_dinh: CT.CHI_TIEU_MAC_DINH_GIO, ngoai_le: CT.NGOAI_LE_CHI_TIEU.map((e) => ({ ma_bcvh: e.maBcvh, phuong: [...e.phuong], gio: e.gio })) },
    gioi_han: { so_ngay_toi_da: 31, trang_toi_da: QL.TRANG_TOI_DA, trang_mac_dinh: 50 },
    loai_chi_tiet: [...Q.LOAI_CHI_TIET, ...Object.keys(QL.NHOM_LUU_THOAT)],
    canh_bao: [...lich.canhBao, ...cauHinh.canhBao.filter((c) => !/ktt_cau_hinh_chuyen/.test(c))] // KTT-LICH-2: lịch V1 không còn seed, bỏ cảnh báo «chưa có dòng»
  };
}

// ------------------------------------------
// KTT-16-1: độ phủ dữ liệu «Hàng đến BCVH» cho đối chiếu (chỉ đọc arrival_*, KHÔNG chạm bảng ktt_*)
// ------------------------------------------
/**
 * GET /api/ktt/doi-chieu/do-phu?tu=&den= — kttDoPhuBcvh.docDoPhu. Dữ liệu chỉ đổi khi arrival_* đổi, nên cache theo (tu, den) + dấu hiệu DB (data_version + total_changes), ≤ 10 phút;
 * KHÔNG qua dongBoPhienBan / độ mới KTT (không phụ thuộc lịch chuyến, tham số hay bảng ktt_*). Tính trực tiếp (ba truy vấn có chỉ mục), nhường vòng lặp trước khi tính.
 */
async function doPhuBcvh(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const token = PD.dauHieuDb(db);
  const khoa = `${k.tuNgay}|${k.denNgay}`;
  const e = boNho.doPhu.get(khoa);
  if (e && now - e.luc < TUOI_CHUA_CHOT_MS && e.token === token) return e.kq;
  if (e) boNho.doPhu.delete(khoa);
  return chiaSe(`dp|${khoa}`, async () => {
    await nhuong();
    const tk = PD.dauHieuDb(db);
    dem.doPhuTinh++;
    const kq = DP.docDoPhu(db, { tuNgay: k.tuNgay, denNgay: k.denNgay, tenBcvh: bcvhNames(db) });
    datMuc(boNho.doPhu, MUC_KHAC_TOI_DA, khoa, { luc: now, kq, token: tk });
    return kq;
  });
}

// ------------------------------------------
// KTT-16-2: ghép KTT ↔ «Hàng đến BCVH» và tổng hợp đối chiếu (kttDoiChieu.js)
// ------------------------------------------
/**
 * Bó đối chiếu MỘT ngày, cache theo ngày với quy tắc của bó B (conHanNgay: độ mới KTT, dấu hiệu DB, chữ ký túi) VÀ thêm hai chữ ký riêng của 16-2:
 *  - chữ ký dữ liệu BCVH của D..D+2 (chuKyBcvh: số file, tổng id, file mới nhất của 6 BCVH) — nạp thêm / thay file của các ngày đó mới tính lại ngày D;
 *  - phiên bản danh sách hàng hoàn (dongBoPhienBan xóa cả bộ nhớ này khi ItemReturn mới được nạp; còn so lại ở đây để chắc chắn).
 * Ngày đã chốt và cũ hơn cửa sổ nạp: nạp BCVH ở ngày khác KHÔNG tính lại (giữ cache); ngày chưa chốt: mọi thay đổi DB làm tính lại, như bó B.
 */
async function layNgayDC(db, ngay, doMoi, now) {
  const e = boNho.ngayDC.get(ngay);
  const token = PD.dauHieuDb(db);
  if (e) {
    if (conHanNgay(db, e, ngay, doMoi, now, token) && e.chuKyBcvh === DC.chuKyBcvh(db, ngay) && e.phienHoan === boNho.phienHoan) return e.kq;
    boNho.ngayDC.delete(ngay);
  }
  return chiaSe(`dc|${ngay}|${doMoi}`, async () => {
    await nhuong();
    const tk = PD.dauHieuDb(db);
    const ck = chuKyNgay(db, ngay);
    const cb = DC.chuKyBcvh(db, ngay);
    dem.ngayDCTinh++;
    // MỘT lượt duyệt SHBG cho cả bó đối chiếu lẫn bó B: bó B cũng được cất (nếu chưa có / hết hạn) nên lần nguội của hai nhóm API không duyệt hai lần.
    const t = DC.boThuThap(ngay);
    const kqB = DQ.tinhNgay(db, ngay, doMoi, t.them);
    const kq = t.xong(db);
    const daChotNgay = S.daChot(ngay, doMoi, QL.gioChot());
    kq.da_chot = daChotNgay;
    kqB.da_chot = daChotNgay;
    const eB = boNho.ngayB.get(ngay);
    if (!eB || !conHanNgay(db, eB, ngay, doMoi, now, tk)) {
      dem.ngayBTinh++; // bó B được tính trong chính lượt này
      datMuc(boNho.ngayB, NGAY_TOI_DA_TRONG_NHO, ngay, { luc: now, kq: kqB, daChot: daChotNgay, doMoi, token: tk, chuKy: ck });
    }
    datMuc(boNho.ngayDC, NGAY_TOI_DA_TRONG_NHO, ngay, { luc: now, kq, daChot: kq.da_chot, doMoi, token: tk, chuKy: ck, chuKyBcvh: cb, phienHoan: boNho.phienHoan });
    return kq;
  });
}

/**
 * GET /api/ktt/doi-chieu/tong-hop?tu=&den=[&ma_bcvh=] — thanh 1 (tập chính chia ba loại), thanh 2 (đã ghi đi chia ba loại), theo ngày và tổng. ma_bcvh lọc theo BCVH ĐÍCH (mặc định cả 6).
 * Cửa sổ kiểm tra được và trạng thái ngày lấy từ độ phủ KTT-16-1 (doPhuBcvh, cùng khoảng). Không có dữ liệu KTT: kết quả rỗng có `ly_do`.
 */
async function layBoDoiChieu(db, query, now) {
  const k = docKhoang(query, ['ma_bcvh']);
  const maBcvh = docMaBcvh(query);
  const doMoi = QL.docDoMoi(db);
  dongBoPhienBan(db);
  const bo = {};
  const daChot = {};
  if (doMoi) {
    for (const ngay of k.ngays) { const b = await layNgayDC(db, ngay, doMoi.nguon_xuat_luc, now); bo[ngay] = b; daChot[ngay] = b.da_chot; }
  }
  const doPhu = await doPhuBcvh(db, { tu: k.tuNgay, den: k.denNgay }, { now });
  return { k, maBcvh, doMoi, bo, daChot, doPhu };
}

/** Phần đầu chung của các route đối chiếu KTT-16-3 (khoảng ngày, cửa sổ, meta hàng hoàn). */
function dauDoiChieu({ k, maBcvh, doMoi, doPhu }) {
  return {
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay, so_ngay: k.ngays.length },
    ma_bcvh: maBcvh,
    nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null,
    co_du_lieu: !!doMoi,
    ly_do: doMoi ? null : 'CHUA_CO_DU_LIEU',
    cua_so_thuc_te: doPhu.cua_so_thuc_te,
    cua_so_theo_bcvh: Object.fromEntries(doPhu.bcvh.filter((x) => !maBcvh || x.ma === maBcvh).map((x) => [x.ma, x.cua_so]))
  };
}
const metaDoiChieu = () => ({ ...(boNho.hangHoan || {}), do_phu: '/api/ktt/doi-chieu/do-phu', nghi_duong_tinh_gia: 'có thể do BCVH thiếu dữ liệu (KTT-16-1: BCVH đích không có file dữ liệu trong D..D+2); không bị bỏ khỏi số liệu, chỉ để chú thích' });

/**
 * GET /api/ktt/doi-chieu/thoi-gian-nhan?tu=&den=[&ma_bcvh=] — KTT-16-3 (a): «Hàng đi KTT rồi, bao lâu thì BCVH nhận?». Độ trễ = mốc đến hợp lệ MUỘN NHẤT ở BCVH đích − giờ lập BD10 đi,
 * của SHBG thanh 2 phân loại `tai_dich` trong cửa sổ của đích. p50 / p90 (giờ) theo thứ hạng gần nhất trên histogram phút; độ trễ âm đếm riêng. Dùng chung bó ngày với tong-hop.
 */
async function doiChieuThoiGianNhan(db, query, { now = Date.now() } = {}) {
  const h = await layBoDoiChieu(db, query, now);
  return {
    ...dauDoiChieu(h),
    ...DC.ghepThoiGianNhan({ ngays: h.k.ngays, bo: h.bo, doPhu: h.doPhu, maBcvh: h.maBcvh }),
    meta: {
      ...metaDoiChieu(),
      dinh_nghia: 'do_tre = mốc đến hợp lệ muộn nhất ở BCVH đích − giờ lập BD10 đi; thanh 2 (đã giao đi, không hoàn), tai_dich, ngày D trong khoảng đối chiếu của đích; không gồm nhóm thiếu giờ quét túi đến',
      phan_vi: 'thứ hạng gần nhất (rank = ceil(p*n)) trên histogram phút, trả cận trên của bin (giờ, 3 chữ số)',
      do_tre_am: 'mau_tong = mau + am + khong_doc; am (mốc đến trước giờ lập BD10 đi) không vào p50 / p90 / ty_le_cung_ngay',
      cung_ngay: 'mẫu không âm có mốc đến cùng ngày lịch với giờ lập BD10 đi; ty_le_cung_ngay = cung_ngay / mau'
    }
  };
}

/**
 * GET /api/ktt/doi-chieu/chua-thay?tu=&den=[&ma_bcvh=] — KTT-16-3 (b) chuyến mất dấu và (c) nguồn của SHBG «chưa thấy». Danh sách chuyến có mã BD10 (chỉ ở phản hồi này).
 */
async function doiChieuChuaThay(db, query, { now = Date.now() } = {}) {
  const h = await layBoDoiChieu(db, query, now);
  const p = { ngays: h.k.ngays, bo: h.bo, doPhu: h.doPhu, maBcvh: h.maBcvh };
  return {
    ...dauDoiChieu(h),
    chuyen_mat_dau: DC.ghepChuyenMatDau(p),
    nguon_chua_thay: DC.ghepChuaThay(p),
    meta: {
      ...metaDoiChieu(),
      chuyen: 'chuyến = (mã BD10 đi, giờ lập BD10, BCVH đích); chỉ SHBG thanh 2 đã phân loại (không gồm thiếu giờ quét túi đến) trong khoảng đối chiếu của đích',
      mat_dau: 'mất dấu = mọi SHBG của chuyến chưa thấy và có từ so_shbg_toi_thieu SHBG; NGHI_THIEU_FILE (nghi ngờ thiếu file dữ liệu của BCVH) khi có SHBG chưa thấy ở ngày có thể do BCVH thiếu dữ liệu (chưa tính là mất dấu chắc chắn)',
      thanh_1: 'thanh_1.tong = tong_cong.tap_chinh.chua_thay của tong-hop; mỗi SHBG đúng một lý do',
      thieu_gio_quet_den: 'thieu_gio_quet_den.tong = khong_phan_loai_da_ghi_di.tong của tong-hop = da_thay + chua_thay + ngoai_cua_so (không thuộc thanh 1)'
    }
  };
}

async function doiChieuTongHop(db, query, { now = Date.now() } = {}) {
  const { k, maBcvh, doMoi, bo, daChot, doPhu } = await layBoDoiChieu(db, query, now);
  const kq = DC.ghepTongHop({ ngays: k.ngays, bo, daChot, doPhu, maBcvh });
  return {
    khoang_ngay: { tu_ngay: k.tuNgay, den_ngay: k.denNgay, so_ngay: k.ngays.length },
    ma_bcvh: maBcvh,
    nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null,
    co_du_lieu: !!doMoi,
    ly_do: doMoi ? null : 'CHUA_CO_DU_LIEU',
    cua_so_thuc_te: doPhu.cua_so_thuc_te,
    cua_so_theo_bcvh: Object.fromEntries(doPhu.bcvh.filter((x) => !maBcvh || x.ma === maBcvh).map((x) => [x.ma, x.cua_so])),
    ...kq,
    meta: {
      ...(boNho.hangHoan || {}),
      do_phu: '/api/ktt/doi-chieu/do-phu',
      khoa_ghep: 'tracking_no = SHBG (khớp chuỗi trực tiếp)',
      tra_cuu_file: 'file OK của 6 BCVH có file_date trong [D, D+2]',
      co_mat: 'có mặt ở BCVH = có dòng arrival_items với mốc đến hợp lệ (arrival_at); dòng chưa xác định ngày đến không tính. Nơi đến thực tế = BCVH có mốc muộn nhất; đã có mặt thì không xét trạng thái túi KTT',
      khong_phan_loai_da_ghi_di: 'nằm trong da_ghi_di.tong: có giờ lập BD10 đi nhưng thiếu giờ quét túi đến. Có mặt ở BCVH Y -> theo_bcvh_noi_den[Y]; không thấy -> chua_thay nếu D trong khoảng đối chiếu của cả sáu BCVH, ngược lại ngoai_cua_so (chưa đối chiếu được). da_ghi_di.tong - khong_phan_loai_da_ghi_di.tong = cung_ngay + hom_sau + tu_2_ngay của /dicungngay',
      thu_tu_uu_tien: 'có ở đích -> tai_dich; không ở đích nhưng có ở BCVH khác trong 6 BCVH -> bcvh_khac; không đâu -> chua_thay',
      nghi_duong_tinh_gia: 'tập con của chua_thay: ngày D..D+2 của BCVH đích có ngày không CO_DU_LIEU (co_the_duong_tinh_gia, KTT-16-1); không bị bỏ khỏi chua_thay',
      ngoai_cua_so: 'SHBG chưa đối chiếu được (nằm ngoài khoảng ngày có dữ liệu BCVH của BCVH đích): chỉ đếm, không phân loại'
    }
  };
}

// ------------------------------------------
// KTT-16-4: «Đánh giá» và xuất xlsx sheet 1–6 của trang Đối chiếu
// ------------------------------------------
/** Các kết quả ghép (cùng hàm thuần với tong-hop / thoi-gian-nhan / chua-thay) cho «Đánh giá» và số dòng đối chiếu của xuất xlsx. */
function ghepDoiChieuDayDu(h) {
  const p = { ngays: h.k.ngays, bo: h.bo, daChot: h.daChot, doPhu: h.doPhu, maBcvh: h.maBcvh };
  return {
    p, tongHop: DC.ghepTongHop(p), thoiGianNhan: DC.ghepThoiGianNhan(p),
    chuaThay: { chuyen_mat_dau: DC.ghepChuyenMatDau(p), nguon_chua_thay: DC.ghepChuaThay(p) },
    chuyenTiep: DC.ghepChuyenTiepChuaQuet(p), chuyenCham: DC.ghepChuyenCham(p)
  };
}

/**
 * GET /api/ktt/doi-chieu/danh-gia?tu=&den=[&ma_bcvh=] — KTT-16-4: khối «Đánh giá» sinh từ số thật (kttDanhGiaDoiChieu), cùng bó ngày với tong-hop / thoi-gian-nhan / chua-thay.
 * `so_dong_sheet`: số dòng của sheet 1–6 (= số dòng file xuất tương ứng).
 */
async function doiChieuDanhGia(db, query, { now = Date.now() } = {}) {
  const h = await layBoDoiChieu(db, query, now);
  const g = ghepDoiChieuDayDu(h);
  const danhGia = DG.taoDanhGiaDoiChieu({ ...g, doPhu: h.doPhu, ngays: h.k.ngays, maBcvh: h.maBcvh });
  const soDong = {};
  for (const s of [1, 2, 3, 4, 5, 6]) soDong[s] = { ten: DX.SHEET[s].ten, route: `/api/ktt/doi-chieu/xuat/${DX.SHEET[s].route}`, so_dong: DX.soApi(s, g.p, g.tongHop) };
  return {
    ...dauDoiChieu(h),
    danh_gia: h.doMoi ? danhGia : [],
    so_dong_sheet: soDong,
    hang_so: { chuyen_cham: DC.CHUYEN_CHAM, mat_dau: DC.MAT_DAU, cung_ngay_thap: DG.NGUONG_DANH_GIA.cungNgayThap },
    meta: {
      ...metaDoiChieu(),
      nguon: 'mỗi mục tái tạo được từ tong-hop (a, e), chua-thay (b, c, h), thoi-gian-nhan (f, g) và hai số của KTT-16-4 (chuyen_tiep_chua_quet_di: d; chuyen_cham: f); độ phủ KTT-16-1 (g)',
      dieu_kien: 'mục không đủ điều kiện hiện thì không có trong danh_gia (xem dieu_kien_hien của từng mục)'
    }
  };
}

const TEN_SHEET_XUAT_DC = Object.freeze({ 1: 'chua-thay', 2: 'chuyen-mat-dau', 3: 'chuyen-tiep-chua-quet-di', 4: 'thay-o-bcvh-khac', 5: 'chuyen-cham', 6: 'da-co-tai-dich' });
/**
 * GET /api/ktt/doi-chieu/xuat/<sheet>?tu=&den=[&ma_bcvh=] — KTT-16-4: chuẩn bị nội dung file xlsx { tenFile, thongTin, dong, cot, tenSheet, khoang, ... } (chưa ghi gì ra response).
 * Số dòng = số ở API tương ứng (DX.soApi). Sheet 1–4 duyệt lại SHBG từng ngày ở worker (bó chế độ lietKe, KHÔNG cache danh sách); sheet 5–6 cắt từ bó đã cache.
 */
async function xuatDoiChieu(db, query, sheet, opts = {}) {
  if (sheet > 4) return xuatDoiChieuTrong(db, query, sheet, opts); // sheet 5, 6 cắt từ bó cache, không duyệt SHBG: không giới hạn
  // Sheet 1–4 duyệt lại SHBG ở worker (một worker, tuần tự): tối đa MỘT lượt chạy + MỘT lượt chờ; lượt thứ ba trở đi bị từ chối (route trả 429). Bộ đếm luôn được trả lại ở finally.
  if (trangThaiXuat.dem >= GIOI_HAN_XUAT_DOI_CHIEU) throw new Q.LoiKtt('KTT_XUAT_BAN', 'Đang có xuất khác, thử lại sau ít phút.');
  trangThaiXuat.dem++;
  try { return await xuatDoiChieuTrong(db, query, sheet, opts); } finally { trangThaiXuat.dem--; }
}
const GIOI_HAN_XUAT_DOI_CHIEU = 2; // một đang chạy + một đang chờ
const trangThaiXuat = { dem: 0 };
async function xuatDoiChieuTrong(db, query, sheet, { now = Date.now(), nguoiXuat = null } = {}) {
  const h = await layBoDoiChieu(db, query, now);
  const g = ghepDoiChieuDayDu(h);
  const tran = X.tranDong();
  let dong;
  if (sheet === 5) dong = DX.dongSheet5(g.chuyenCham);
  else if (sheet === 6) dong = DX.dongSheet6(g.tongHop, h.maBcvh);
  else if (!h.doMoi) dong = [];
  else {
    const r = await chayNen(db, 'xuatDoiChieu', { sheet, ngays: h.k.ngays, doPhu: h.doPhu, maBcvh: h.maBcvh, bayGio: h.doMoi.nguon_xuat_luc, tranDong: tran });
    if (r.vuotTran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${r.tong} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc chọn một BCVH.`);
    dong = r.dong;
  }
  if (dong.length > tran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${dong.length} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc chọn một BCVH.`);
  const apiSo = DX.soApi(sheet, g.p, g.tongHop);
  const thongTin = DX.dongThongTin({
    sheet, tu: h.k.tuNgay, den: h.k.denNgay, maBcvh: h.maBcvh, doMoi: h.doMoi ? h.doMoi.nguon_xuat_luc : null, doPhu: h.doPhu, daChot: h.daChot, ngays: h.k.ngays,
    soDong: dong.length, soApi: apiSo, nguoiXuat, xuatLuc: X.gioVietNam(now), gioChot: QL.gioChot()
  });
  return {
    tenFile: DX.tenFile(sheet, h.k.tuNgay, h.k.denNgay), thongTin, dong, cot: DX.SHEET[sheet].cot, tenSheet: DX.SHEET[sheet].ten,
    khoang: { tuNgay: h.k.tuNgay, denNgay: h.k.denNgay }, maBcvh: h.maBcvh, sheet, tong: dong.length, soApi: apiSo
  };
}

// ------------------------------------------
// KTT-DC-1: «Hướng đóng chuyến nội tỉnh» (docs/ai/42_KTT_API.md mục 23)
// ------------------------------------------
// Bó MỖI NGÀY (kttHuongDong.tinhNgay) cache theo ngày với đúng quy tắc của luu-thoat / B (conHanNgay; xóa khi đổi tham số hệ thống, lịch, danh sách hàng hoàn). Tên / loại hình / BĐX
// KHÔNG nằm trong bó: đọc từ post_offices ở mỗi lần trả lời, nên đổi danh mục có hiệu lực ngay (không cần chữ ký cache riêng cho danh mục).
async function layNgayHD(db, ngay, doMoi, now) {
  const e = boNho.ngayHD.get(ngay);
  const token = PD.dauHieuDb(db);
  if (e) {
    if (conHanNgay(db, e, ngay, doMoi, now, token)) return e.kq;
    boNho.ngayHD.delete(ngay);
  }
  return chiaSe(`hd|${ngay}|${doMoi}`, async () => {
    await nhuong();
    const tk = PD.dauHieuDb(db);
    const ck = chuKyNgay(db, ngay);
    const kq = HDC.tinhNgay(db, ngay, doMoi);
    datMuc(boNho.ngayHD, NGAY_TOI_DA_TRONG_NHO, ngay, { luc: now, kq, daChot: S.daChot(ngay, doMoi, QL.gioChot()), doMoi, token: tk, chuKy: ck });
    return kq;
  });
}
async function boHuongDong(db, k, now) {
  const doMoi = QL.docDoMoi(db);
  dongBoPhienBan(db);
  if (!doMoi) return { doMoi: null, ds: k.ngays.map((n) => HDC.boRong(n)) };
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgayHD(db, ngay, doMoi.nguon_xuat_luc, now));
  return { doMoi, ds };
}
function docLoaiHinhHD(query) {
  const v = mot(query, 'loai_hinh');
  if (v === undefined || v === '') return null;
  if (!HDC.LOAI_HINH.includes(v)) throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "loai_hinh" phải thuộc: ${HDC.LOAI_HINH.join(', ')}.`);
  return v;
}
/** Cờ 0/1 (hoặc true/false); vắng = false. */
function docCo(query, ten) {
  const v = mot(query, ten);
  if (v === undefined || v === '') return false;
  const t = String(v).trim().toLowerCase();
  if (t === '1' || t === 'true') return true;
  if (t === '0' || t === 'false') return false;
  throw new Q.LoiKtt('KTT_THAM_SO_SAI', `Tham số "${ten}" phải là 0 / 1 (hoặc false / true).`);
}
const cuaSoHD = (ds) => { const c = ds.filter((d) => d.co_du_lieu); return { tu_ngay: c.length ? c[0].ngay : null, den_ngay: c.length ? c[c.length - 1].ngay : null, so_ngay_co_du_lieu: c.length }; };

/** GET /api/ktt/huong-dong-chuyen/tong-hop?tu=&den=[&loai_hinh=GD1|GD2_GD3|VHX|531120|KHAC] — bảng nơi đóng, theo loại hình, theo ngày (KTT-DC-1 mục 3A). */
async function huongDongTongHop(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['loai_hinh']);
  const loaiHinh = docLoaiHinhHD(query);
  const b = await boHuongDong(db, k, now);
  const danhMuc = HDC.docDanhMuc(db);
  const th = HDC.tongHop(b.ds, danhMuc, loaiHinh);
  const dau = dauPhanHoi(k, b.doMoi, cuaSoHD(b.ds));
  th.meta = { khoang_ngay: dau.khoang_ngay, cua_so_thuc_te: dau.cua_so_thuc_te, nguon_xuat_luc_moi_nhat: dau.nguon_xuat_luc_moi_nhat, bay_gio: dau.bay_gio, ...th.meta };
  return { ...dau, ...th };
}

/** GET /api/ktt/huong-dong-chuyen/danh-sach?tu=&den=&noi_dong=<mã>[&nhom=dong_vao_530100|chua_ro&chi_ghi_ngay_cu=0|1&page=&page_size=] — danh sách bưu gửi của MỘT nơi đóng (mục 3B). */
async function huongDongDanhSach(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['noi_dong', 'nhom', 'chi_ghi_ngay_cu', 'page', 'page_size']);
  const noi = docMa(query, 'noi_dong');
  if (!noi) throw new Q.LoiKtt('KTT_THIEU_THAM_SO', 'Thiếu tham số "noi_dong" (mã nơi đóng chuyến thư).');
  if (HDC.MA_BCVH_LOAI.includes(noi)) throw new Q.LoiKtt('KTT_THAM_SO_SAI', 'Tham số "noi_dong" không được là một trong 6 BCVH Huế (không nằm trong bảng nơi đóng).');
  const nhom = mot(query, 'nhom') || 'dong_vao_530100';
  if (nhom !== 'dong_vao_530100' && nhom !== 'chua_ro') throw new Q.LoiKtt('KTT_THAM_SO_SAI', 'Tham số "nhom" phải là dong_vao_530100 hoặc chua_ro.');
  const chiCu = docCo(query, 'chi_ghi_ngay_cu');
  const trang = docSoNguyen(query, 'page', 1, 1000000, 1);
  const kichThuoc = docSoNguyen(query, 'page_size', 1, Q.TRANG_TOI_DA, 50);
  const b = await boHuongDong(db, k, now);
  const danhMuc = HDC.docDanhMuc(db);
  const all = HDC.dongCuaNoi(b.ds, noi, { chua_ro: nhom === 'chua_ro', chiCu });
  const batDau = (trang - 1) * kichThuoc;
  const p = danhMuc[noi] || null;
  return {
    items: all.slice(batDau, batDau + kichThuoc).map((r) => HDC.dongApi(r, danhMuc)),
    pagination: { total: all.length, page: trang, page_size: kichThuoc, total_pages: Math.ceil(all.length / kichThuoc) },
    meta: { noi_dong: noi, ten_noi_dong: p ? p.ten : null, nhom, chi_ghi_ngay_cu: chiCu, tu: k.tuNgay, den: k.denNgay, nguon_xuat_luc_moi_nhat: b.doMoi ? b.doMoi.nguon_xuat_luc : null, ly_do: b.doMoi ? null : 'CHUA_CO_DU_LIEU' }
  };
}

/**
 * GET /api/ktt/xuat/huong-dong-chuyen?tu=&den=&kieu=nhac_viec|chi_tiet[&loai_hinh=] — hai file Excel (mục 3C). Trả { tenFile, khoang, kieu, loaiHinh, tong, viet } cho route (viet(out, dungChua) ghi luồng).
 * Mọi kiểm tra / tính toán xong TRƯỚC khi route gửi header (lỗi vẫn là JSON 400/500).
 */
async function xuatHuongDong(db, query, { now = Date.now(), nguoiXuat = null } = {}) {
  void nguoiXuat;
  const k = docKhoang(query, ['kieu', 'loai_hinh']);
  const kieu = mot(query, 'kieu');
  if (kieu !== 'nhac_viec' && kieu !== 'chi_tiet') throw new Q.LoiKtt('KTT_THAM_SO_SAI', 'Tham số "kieu" phải là nhac_viec hoặc chi_tiet.');
  const loaiHinh = docLoaiHinhHD(query);
  const b = await boHuongDong(db, k, now);
  const danhMuc = HDC.docDanhMuc(db);
  const doMoi = b.doMoi ? b.doMoi.nguon_xuat_luc : null;
  const dau = `${k.tuNgay.replace(/-/g, '')}_${k.denNgay.replace(/-/g, '')}`;
  const kq = { khoang: { tuNgay: k.tuNgay, denNgay: k.denNgay }, kieu, loaiHinh };
  if (kieu === 'nhac_viec') {
    const tong = HDC.tongHop(b.ds, danhMuc, loaiHinh);
    const tong7 = HDC.tongHop(b.ds.slice(-7), danhMuc, loaiHinh);
    const wb = HDX.taoNhacViec({ ds: b.ds, k, tong, tong7, danhMuc, doMoi });
    return { ...kq, tenFile: `KTT-huong-dong-chuyen_nhac-viec_${dau}.xlsx`, tong: tong.theo_noi_dong.length, viet: (out, dung) => HDX.ghiWorkbook(out, wb, tong.theo_noi_dong.length, dung) };
  }
  const loai = new Set(HDC.MA_BCVH_LOAI);
  const giu = (r) => !loai.has(r.noi) && (loaiHinh === null || HDC.nhomLoaiHinh(r.noi, danhMuc[r.noi] ? danhMuc[r.noi].loai : null) === loaiHinh);
  const dongN2 = []; const dongN3 = [];
  for (const d of b.ds) for (const r of d.rows) if (giu(r)) (r.chua_ro ? dongN3 : dongN2).push(r);
  const ord = (a, c) => (a.ngay_den < c.ngay_den ? -1 : a.ngay_den > c.ngay_den ? 1 : a.shbg < c.shbg ? -1 : a.shbg > c.shbg ? 1 : 0);
  dongN2.sort(ord); dongN3.sort(ord);
  const tran = X.tranDong();
  if (dongN2.length + dongN3.length > tran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${dongN2.length + dongN3.length} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc chọn loại hình.`);
  const wb = HDX.taoChiTiet({ k, dongN2, dongN3, danhMuc });
  return { ...kq, tenFile: `KTT-huong-dong-chuyen_chi-tiet_${dau}.xlsx`, tong: dongN2.length, viet: (out, dung) => HDX.ghiWorkbook(out, wb, dongN2.length + dongN3.length, dung) };
}

module.exports = {
  huongDongTongHop, huongDongDanhSach, xuatHuongDong,
  docKhoang, luuThoat, tongHop, chiTiet, xuatLuuThoat, xuatKhongDat14h, khongDat14h, docKd, bucTranhCum, bucTranhChuyenXe, bucTranhDanhGia, gioDen, gioDenTheoNgay, conLaiTheoGio, huyCacheNgay, docMocBt, xuatHomSauChuaDi, meta, doPhuBcvh,
  diCungNgayTongHop, diCungNgayTheoNgay, diCungNgayTheoGio, rotLaiTheoDuongThu, lichXeGioLapBd10, lichXeTheoDuongThu, lichXeTheoBcvh, danhSachDiNgay,
  doiChieuTongHop, doiChieuThoiGianNhan, doiChieuChuaThay, doiChieuDanhGia, xuatDoiChieu, TEN_SHEET_XUAT_DC, trangThaiXuat, hangDenTongHop, hangDenTheoGio, hangDenTheoDuongThu, hangDenXe, tongQuan, xoaCache, thongKe, dongNen, chayNen, TUOI_CHUA_CHOT_MS, TUOI_DA_CHOT_MS, NGAY_TOI_DA_TRONG_NHO,
  // KTT-15: chỉ cho kttNong.js (làm nóng) gọi ĐÚNG các hàm mà request đang dùng, nên kết quả nóng = kết quả nguội và request giữa chừng dùng chung lần tính (chiaSe).
  noiBoNong: { layNgay, layNgayB, layNgayDC, layNgayHD, layHangDen, layGioLapBd10, dongBoPhienBan, ngayLui, CUA_SO_NAP_NGAY }
};
