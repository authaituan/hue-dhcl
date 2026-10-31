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
const S = require('./kttLuuThoat');
const { MA_BCVH_HUE } = require('./kttTinh');
const D = require('./kttDiNgay');
const HH = require('./kttHangHoan');
const DQ = require('./kttDiNgayQuery');
const LX = require('./kttLichXe');
const DP = require('./kttDoPhuBcvh');
const { bcvhNames } = require('./dashboardQuery');

const CUA_SO_NAP_NGAY = 8; // ngày nằm trong cửa sổ nạp = từ độ mới dữ liệu lùi chừng này ngày trở lại (mỗi lần xuất lùi 7 ngày + 1 ngày đệm)
const TUOI_CHUA_CHOT_MS = 10 * 60 * 1000;
const TUOI_DA_CHOT_MS = 6 * 60 * 60 * 1000;
const NGAY_TOI_DA_TRONG_NHO = 400;
const MUC_KHAC_TOI_DA = 200;

const ngayLui = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) - n * 86400).slice(0, 10);
const nhuong = () => new Promise((r) => setImmediate(r));
const boNho = { ngay: new Map(), ngayB: new Map(), tongHop: new Map(), chiTiet: new Map(), doPhu: new Map(), dangTinh: new Map(), phienBan: null, hangHoan: null };
const dem = { ngayTinh: 0, ngayBTinh: 0, tongHopTinh: 0, chiTietTinh: 0, hangDenTinh: 0, doPhuTinh: 0, workerLan: 0, noiTuyenLan: 0 };

function xoaCache() {
  boNho.ngay.clear(); boNho.ngayB.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.doPhu.clear(); boNho.dangTinh.clear(); boNho.phienBan = null;
  dem.ngayTinh = 0; dem.ngayBTinh = 0; dem.tongHopTinh = 0; dem.chiTietTinh = 0; dem.hangDenTinh = 0; dem.doPhuTinh = 0; dem.workerLan = 0; dem.noiTuyenLan = 0;
}
const thongKe = () => ({ ngay: boNho.ngay.size, ngay_b: boNho.ngayB.size, tong_hop: boNho.tongHop.size, chi_tiet: boNho.chiTiet.size, do_phu: boNho.doPhu.size, ...dem });

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
    const a = db.prepare("SELECT COALESCE(group_concat(ma_bcvh || '@' || gio_xuat_phat || ':' || ngay_chay || ':' || dang_dung, ';'), '') AS s FROM (SELECT * FROM ktt_lich_chuyen ORDER BY ma_bcvh, gio_xuat_phat)").get().s;
    const b = db.prepare("SELECT COALESCE(group_concat(khoa || '=' || gia_tri, ';'), '') AS s FROM (SELECT * FROM ktt_lich_cau_hinh ORDER BY khoa)").get().s;
    return `${a}#${b}`;
  } catch (e) { return 'khong-doc-duoc'; }
}
function dongBoPhienBan(db) {
  const hh = HH.docDanhSachHangHoan(db, { chiThongTin: true }); // KTT-17-2: danh sách hàng hoàn mới (nạp ItemReturn) -> khóa đổi -> xóa đệm, số tự đổi không cần khởi động lại
  boNho.hangHoan = HH.metaHangHoan(hh);
  const pb = `${thamSo.phienBan()}|${chuKyLich(db)}|${hh.phienBan}`;
  if (boNho.phienBan !== pb) { boNho.ngay.clear(); boNho.ngayB.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.phienBan = pb; }
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
    const kq = QL.luuThoatTheoNgay(db, { tuNgay: ngay, denNgay: ngay, bayGio: doMoi, mocChiTieu });
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
/** GET /api/ktt/chi-tiet?tu=&den=&loai=&ma_bcvh=&page=&page_size= — loai: loại của kttQuery.chiTiet HOẶC nhóm lưu thoát (QL.NHOM_LUU_THOAT). Phân trang như /api/arrivals/items (page, page_size ≤ 200). */
async function chiTiet(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['loai', 'ma_bcvh', 'page', 'page_size', 'nguon']);
  const loai = mot(query, 'loai');
  const nhom = Object.prototype.hasOwnProperty.call(QL.NHOM_LUU_THOAT, loai) ? loai : null;
  if (loai === undefined || (!LOAI_CU.has(loai) && nhom === null)) throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "loai" phải thuộc: ${[...Q.LOAI_CHI_TIET, ...Object.keys(QL.NHOM_LUU_THOAT)].join(', ')}.`);
  const page = mot(query, 'page');
  const size = mot(query, 'page_size');
  const trang = page === undefined || page === '' ? 1 : Number(page);
  const kichThuocTrang = size === undefined || size === '' ? 50 : Number(size);
  if (!Number.isInteger(trang) || trang < 1) throw new Q.LoiKtt('KTT_TRANG_SAI', 'Tham số "page" phải là số nguyên ≥ 1.');
  if (!Number.isInteger(kichThuocTrang) || kichThuocTrang < 1 || kichThuocTrang > QL.TRANG_TOI_DA) throw new Q.LoiKtt('KTT_TRANG_SAI', `Tham số "page_size" phải là số nguyên 1..${QL.TRANG_TOI_DA}.`);
  const maBcvh = docMaBcvh(query);
  const nguon = docNguon(query);
  if (nguon !== null && nhom === null) throw new Q.LoiKtt('KTT_NGUON_SAI', 'Tham số "nguon" chỉ dùng với các nhóm lưu thoát (t1…t5, ro_lai, truot_chuyen…).');
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`;
  const tinh = async () => {
    dem.chiTietTinh++;
    const r = nhom
      ? await chayNen(db, 'chiTietLuuThoat', { tuNgay: k.tuNgay, denNgay: k.denNgay, nhom, maBcvh, nguon, trang, kichThuocTrang, bayGio })
      : await chayNen(db, 'chiTietCu', { tuNgay: k.tuNgay, denNgay: k.denNgay, loai, maBcvh, trang, kichThuocTrang, bayGio });
    return {
      items: r.dong,
      pagination: { total: r.tong, page: trang, page_size: r.kichThuocTrang, total_pages: r.soTrang },
      meta: { loai, ma_bcvh: maBcvh, nguon, tu: k.tuNgay, den: k.denNgay, ...metaDoMoi(doMoi, bayGio, db) }
    };
  };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `${loai}|${maBcvh || ''}|${nguon || ''}|${k.tuNgay}|${k.denNgay}|${trang}|${kichThuocTrang}`, now, doMoi.nguon_xuat_luc, tinh);
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
    canh_bao: [...lich.canhBao, ...cauHinh.canhBao]
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

module.exports = {
  docKhoang, luuThoat, tongHop, chiTiet, xuatLuuThoat, xuatHomSauChuaDi, meta, doPhuBcvh,
  diCungNgayTongHop, diCungNgayTheoNgay, diCungNgayTheoGio, rotLaiTheoDuongThu, lichXeGioLapBd10, lichXeTheoDuongThu, lichXeTheoBcvh, danhSachDiNgay,
  hangDenTongHop, hangDenTheoGio, hangDenTheoDuongThu, hangDenXe, tongQuan, xoaCache, thongKe, dongNen, chayNen, TUOI_CHUA_CHOT_MS, TUOI_DA_CHOT_MS, NGAY_TOI_DA_TRONG_NHO,
  // KTT-15: chỉ cho kttNong.js (làm nóng) gọi ĐÚNG các hàm mà request đang dùng, nên kết quả nóng = kết quả nguội và request giữa chừng dùng chung lần tính (chiaSe).
  noiBoNong: { layNgay, layNgayB, layHangDen, layGioLapBd10, dongBoPhienBan, ngayLui, CUA_SO_NAP_NGAY }
};
