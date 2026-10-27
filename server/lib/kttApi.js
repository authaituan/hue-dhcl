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
const { MA_BCVH_HUE } = require('./kttTinh');

const CUA_SO_NAP_NGAY = 8; // ngày nằm trong cửa sổ nạp = từ độ mới dữ liệu lùi chừng này ngày trở lại (mỗi lần xuất lùi 7 ngày + 1 ngày đệm)
const TUOI_CHUA_CHOT_MS = 10 * 60 * 1000;
const TUOI_DA_CHOT_MS = 6 * 60 * 60 * 1000;
const NGAY_TOI_DA_TRONG_NHO = 400;
const MUC_KHAC_TOI_DA = 200;

const ngayLui = (ngay, n) => L.dinhDang(L.giayCua(`${ngay} 00:00:00`) - n * 86400).slice(0, 10);
const nhuong = () => new Promise((r) => setImmediate(r));
const boNho = { ngay: new Map(), tongHop: new Map(), chiTiet: new Map(), dangTinh: new Map(), phienBan: null };
const dem = { ngayTinh: 0, tongHopTinh: 0, chiTietTinh: 0, workerLan: 0, noiTuyenLan: 0 };

function xoaCache() {
  boNho.ngay.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.dangTinh.clear(); boNho.phienBan = null;
  dem.ngayTinh = 0; dem.tongHopTinh = 0; dem.chiTietTinh = 0; dem.workerLan = 0; dem.noiTuyenLan = 0;
}
const thongKe = () => ({ ngay: boNho.ngay.size, tong_hop: boNho.tongHop.size, chi_tiet: boNho.chiTiet.size, ...dem });

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
  const pb = `${thamSo.phienBan()}|${chuKyLich(db)}`;
  if (boNho.phienBan !== pb) { boNho.ngay.clear(); boNho.tongHop.clear(); boNho.chiTiet.clear(); boNho.phienBan = pb; }
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
async function layNgay(db, ngay, doMoi, now) {
  const e = boNho.ngay.get(ngay);
  const token = PD.dauHieuDb(db);
  if (e) {
    const tuoi = now - e.luc;
    // Ngày TRONG cửa sổ nạp (độ mới lùi 8 ngày): vô hiệu khi độ mới đổi, KỂ CẢ ngày đã chốt — UPSERT cập nhật dòng tại chỗ (số dòng / tổng id không đổi). Ngày cũ hơn: giữ ≤ 6 giờ theo chữ ký.
    const trongCuaSo = ngay >= ngayLui(doMoi.slice(0, 10), CUA_SO_NAP_NGAY);
    const conHan = e.daChot
      ? (tuoi < TUOI_DA_CHOT_MS && e.chuKy === chuKyNgay(db, ngay) && (!trongCuaSo || e.doMoi === doMoi))
      : (tuoi < TUOI_CHUA_CHOT_MS && e.doMoi === doMoi && e.token === token);
    if (conHan) return e.kq;
    boNho.ngay.delete(ngay);
  }
  return chiaSe(`n|${ngay}|${doMoi}`, async () => {
    await nhuong(); // nhường vòng lặp sự kiện TRƯỚC mỗi ngày tính: request khác (vd /meta) được phục vụ giữa các ngày
    const tk = PD.dauHieuDb(db);
    const ck = chuKyNgay(db, ngay);
    dem.ngayTinh++;
    const kq = QL.luuThoatTheoNgay(db, { tuNgay: ngay, denNgay: ngay, bayGio: doMoi });
    datMuc(boNho.ngay, NGAY_TOI_DA_TRONG_NHO, ngay, { luc: now, kq, daChot: kq.theo_ngay[0].da_chot, doMoi, token: tk, chuKy: ck });
    return kq;
  });
}

/** GET /api/ktt/luu-thoat?tu=&den= — cùng kết quả như kttLuuThoatQuery.luuThoatTheoNgay trên khoảng đó. `now`: chỉ để test. */
async function luuThoat(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const doMoi = QL.docDoMoi(db);
  if (!doMoi) return QL.luuThoatTheoNgay(db, { tuNgay: k.tuNgay, denNgay: k.denNgay }); // chưa có dữ liệu: kết quả rỗng có lý do (rẻ, không đệm)
  dongBoPhienBan(db);
  const ds = [];
  for (const ngay of k.ngays) ds.push(await layNgay(db, ngay, doMoi.nguon_xuat_luc, now));
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
const metaDoMoi = (doMoi, bayGio) => ({ nguon_xuat_luc_moi_nhat: doMoi ? doMoi.nguon_xuat_luc : null, bay_gio: bayGio, ly_do: doMoi ? null : 'CHUA_CO_DU_LIEU' });

/** GET /api/ktt/tong-hop?tu=&den= — tongHopKtt + khối «Đánh giá» (danh_gia) + meta. */
async function tongHop(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query);
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`; // chưa có dữ liệu: cố định, không đọc đồng hồ
  const tinh = async () => { dem.tongHopTinh++; const kq = await chayNen(db, 'tongHop', { tuNgay: k.tuNgay, denNgay: k.denNgay, bayGio }); return { ...kq, meta: metaDoMoi(doMoi, bayGio) }; };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.tongHop, MUC_KHAC_TOI_DA, `${k.tuNgay}|${k.denNgay}`, now, doMoi.nguon_xuat_luc, tinh);
}

const LOAI_CU = new Set(Q.LOAI_CHI_TIET);
/** GET /api/ktt/chi-tiet?tu=&den=&loai=&ma_bcvh=&page=&page_size= — loai: loại của kttQuery.chiTiet HOẶC nhóm lưu thoát (QL.NHOM_LUU_THOAT). Phân trang như /api/arrivals/items (page, page_size ≤ 200). */
async function chiTiet(db, query, { now = Date.now() } = {}) {
  const k = docKhoang(query, ['loai', 'ma_bcvh', 'page', 'page_size']);
  const loai = mot(query, 'loai');
  const nhom = Object.prototype.hasOwnProperty.call(QL.NHOM_LUU_THOAT, loai) ? loai : null;
  if (loai === undefined || (!LOAI_CU.has(loai) && nhom === null)) throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "loai" phải thuộc: ${[...Q.LOAI_CHI_TIET, ...Object.keys(QL.NHOM_LUU_THOAT)].join(', ')}.`);
  const ma = mot(query, 'ma_bcvh');
  const page = mot(query, 'page');
  const size = mot(query, 'page_size');
  const trang = page === undefined || page === '' ? 1 : Number(page);
  const kichThuocTrang = size === undefined || size === '' ? 50 : Number(size);
  if (!Number.isInteger(trang) || trang < 1) throw new Q.LoiKtt('KTT_TRANG_SAI', 'Tham số "page" phải là số nguyên ≥ 1.');
  if (!Number.isInteger(kichThuocTrang) || kichThuocTrang < 1 || kichThuocTrang > QL.TRANG_TOI_DA) throw new Q.LoiKtt('KTT_TRANG_SAI', `Tham số "page_size" phải là số nguyên 1..${QL.TRANG_TOI_DA}.`);
  if (ma !== undefined && ma !== '' && !MA_BCVH_HUE.includes(ma)) throw new Q.LoiKtt('KTT_BCVH_SAI', 'Tham số "ma_bcvh" phải là một trong 6 BCVH Huế.');
  const maBcvh = ma === undefined || ma === '' ? null : ma;
  const doMoi = QL.docDoMoi(db);
  const bayGio = doMoi ? doMoi.nguon_xuat_luc : `${k.denNgay} 00:00:00`;
  const tinh = async () => {
    dem.chiTietTinh++;
    const r = nhom
      ? await chayNen(db, 'chiTietLuuThoat', { tuNgay: k.tuNgay, denNgay: k.denNgay, nhom, maBcvh, trang, kichThuocTrang, bayGio })
      : await chayNen(db, 'chiTietCu', { tuNgay: k.tuNgay, denNgay: k.denNgay, loai, maBcvh, trang, kichThuocTrang, bayGio });
    return {
      items: r.dong,
      pagination: { total: r.tong, page: trang, page_size: r.kichThuocTrang, total_pages: r.soTrang },
      meta: { loai, ma_bcvh: maBcvh, tu: k.tuNgay, den: k.denNgay, ...metaDoMoi(doMoi, bayGio) }
    };
  };
  if (!doMoi) return tinh();
  return layMuc(db, boNho.chiTiet, MUC_KHAC_TOI_DA, `${loai}|${maBcvh || ''}|${k.tuNgay}|${k.denNgay}|${trang}|${kichThuocTrang}`, now, doMoi.nguon_xuat_luc, tinh);
}

// ------------------------------------------
// xuat/luu-thoat (KTT-8b)
// ------------------------------------------
/**
 * GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=] — chuẩn bị nội dung file: { tenFile, thongTin, dong }. Chưa ghi gì ra response (route ghi sau khi mọi kiểm tra đã qua, nên lỗi vẫn là JSON 400).
 * Cột «đã chốt» lấy từ luuThoat() (CÙNG cache theo ngày với /luu-thoat); các dòng SHBG tính ở worker bằng CÙNG lượt duyệt với /chi-tiet. `nguoiXuat`, `now`: tên đăng nhập và đồng hồ (test).
 */
async function xuatLuuThoat(db, query, { now = Date.now(), nguoiXuat = null } = {}) {
  const k = docKhoang(query, ['trang_thai']);
  const nhom = mot(query, 'trang_thai');
  if (nhom !== undefined && nhom !== '' && !Object.prototype.hasOwnProperty.call(QL.NHOM_LUU_THOAT, nhom)) {
    throw new Q.LoiKtt('KTT_LOAI_SAI', `Tham số "trang_thai" phải thuộc: ${Object.keys(QL.NHOM_LUU_THOAT).join(', ')}.`);
  }
  const loc = nhom === undefined || nhom === '' ? null : nhom;
  const doMoi = QL.docDoMoi(db);
  const tran = X.tranDong();
  const [luuThoatKq, r] = await Promise.all([
    luuThoat(db, { tu: k.tuNgay, den: k.denNgay }, { now }),
    doMoi ? chayNen(db, 'xuatLuuThoat', { tuNgay: k.tuNgay, denNgay: k.denNgay, nhom: loc, bayGio: doMoi.nguon_xuat_luc, tranDong: tran }) : { tong: 0, vuotTran: false, dong: [] }
  ]);
  if (r.vuotTran) throw new Q.LoiKtt('KTT_QUA_NHIEU_DONG', `Có ${r.tong} dòng, vượt giới hạn ${tran} dòng mỗi file: hãy thu hẹp khoảng ngày hoặc thêm bộ lọc "trang_thai".`);
  const lich = L.docLichChuyen(db);
  const thongTin = X.dongThongTin({
    tu: k.tuNgay, den: k.denNgay, nhom: loc, luuThoat: luuThoatKq, soDong: r.dong.length, nguoiXuat, xuatLuc: X.gioVietNam(now),
    hanPhut: lich.hanDenTruocChuyenPhut, gioChot: QL.gioChot()
  });
  return { tenFile: X.tenFile(k.tuNgay, k.denNgay), thongTin, dong: r.dong, tong: r.dong.length, khoang: k, nhom: loc };
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

module.exports = { docKhoang, luuThoat, tongHop, chiTiet, xuatLuuThoat, meta, xoaCache, thongKe, dongNen, chayNen, TUOI_CHUA_CHOT_MS, TUOI_DA_CHOT_MS, NGAY_TOI_DA_TRONG_NHO };
