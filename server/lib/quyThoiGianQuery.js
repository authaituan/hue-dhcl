// ==========================================
// Lõi truy vấn «Quỹ thời gian còn lại khi hàng đến BCVH» (QUYTG-4). Chỉ đọc DB. Chưa có route / cache / giao diện.
//
// Tập SHBG = đúng tập `s` của aq.buildCountedCte với date_basis = 'arrival' (khung ngày theo arrival_at, mỗi SHBG một lần) -> số lượt = «Sản lượng đến» cùng bộ lọc.
// Dòng ĐO của mỗi SHBG (MỘT truy vấn gộp, không truy vấn theo từng SHBG): trong các dòng CÙNG BCVH nhận với dòng đại diện của `s`, lấy dòng có XNĐ BD10 SỚM nhất
// (bỏ dòng XNĐ trống; hòa -> id nhỏ nhất; KHÔNG giới hạn theo khung ngày). Mốc KTT và bd10_no lấy từ CÙNG dòng đó. Không dòng nào có XNĐ -> dùng chính dòng đại diện (xnd = null).
// Đánh giá từng lượt bằng danhGiaMotLuot (quyThoiGianNhom.js); tổng hợp luôn từ danh sách lượt (cùng một nguồn), không có SQL đếm thứ hai.
// Chỉ tiêu "chinh" = đo được (DO_DUOC) và KHÔNG nghi ngờ; con_quy / het_quy và trung vị tính trên lượt chinh.
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const Q = require('./quyThoiGian');
const N = require('./quyThoiGianNhom');
const CT = require('./quyThoiGianChiTieu');

const { QueryParamError } = aq;
const CHI_TIEU = Object.keys(Q.CHI_TIEU_GIO); // F1_3, F4_1, F4_2
const TRANG_THAI = Object.freeze(['DO_DUOC', 'AM', 'KHONG_DO_DUOC']);
const LY_DO_KHONG_DO = Object.freeze([
  N.LY_DO.LAP_DI_TAI_BCVH, N.LY_DO.KHONG_CO_BD10, N.LY_DO.BD10_KHONG_HOP_LE, N.LY_DO.NHAN_TRUC_TIEP_KHONG_QUA_KTT,
  N.LY_DO.KHONG_QUA_KTT, N.LY_DO.THIEU_XAC_NHAN_KTT, N.LY_DO.THIEU_XND_BCVH
]);
const KHOA_LOC_RIENG = ['nhom', 'trang_thai', 'ly_do', 'nghi_ngo'];
const KHOA_LOC_CHUNG = ['from', 'to', 'receiver_code', 'ward_key'];

// ------------------------------------------
// Tham số
// ------------------------------------------
/** Tách khóa lọc riêng (nhom / trang_thai / ly_do) và bỏ date_basis khỏi query; phần còn lại đi qua aq.parseFilters (khóa lạ -> QueryParamError). */
function docThamSo(query, { coPhanTrang }) {
  const goc = query && typeof query === 'object' ? { ...query } : {};
  delete goc.date_basis; // khung ngày luôn theo arrival_at
  const rieng = {};
  if (coPhanTrang) {
    for (const k of KHOA_LOC_RIENG) {
      const v = goc[k];
      delete goc[k];
      if (v === undefined || v === '') continue;
      if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
      rieng[k] = String(v).trim();
    }
    if (rieng.nhom !== undefined && !Object.prototype.hasOwnProperty.call(N.NHOM_BD10, rieng.nhom)) throw new QueryParamError(`Tham số "nhom" phải là một trong: ${Object.keys(N.NHOM_BD10).join(', ')}`);
    if (rieng.trang_thai !== undefined && !TRANG_THAI.includes(rieng.trang_thai)) throw new QueryParamError(`Tham số "trang_thai" phải là một trong: ${TRANG_THAI.join(', ')}`);
    if (rieng.ly_do !== undefined && !Object.prototype.hasOwnProperty.call(N.LY_DO, rieng.ly_do)) throw new QueryParamError(`Tham số "ly_do" phải là một trong: ${Object.keys(N.LY_DO).join(', ')}`);
    if (rieng.nghi_ngo !== undefined) {
      const v = rieng.nghi_ngo.toLowerCase();
      if (v === '1' || v === 'true') rieng.nghi_ngo = true;
      else if (v === '0' || v === 'false') rieng.nghi_ngo = false;
      else throw new QueryParamError('Tham số "nghi_ngo" phải là 1/true (chỉ lượt nghi ngờ) hoặc 0/false (loại lượt nghi ngờ)');
    }
  }
  const allowed = coPhanTrang ? [...KHOA_LOC_CHUNG, 'page', 'page_size'] : KHOA_LOC_CHUNG;
  const f = aq.parseFilters(goc, { allowed });
  f.dateBasis = 'arrival';
  return { f, rieng };
}

// ------------------------------------------
// Lấy lượt
// ------------------------------------------
/** Một truy vấn gộp: mỗi phần tử của `s` -> một dòng đo { receiver_code, shbg, bd10_no, ktt, xnd }. */
function layDongDo(db, f) {
  const { sql, params } = aq.buildCountedCte(db, f, { materialize: true });
  return db.prepare(`WITH ${sql},
    m AS (
      SELECT a.tracking_no AS tn, MIN(a.bd10_confirmed_at || printf('%012d', a.id)) AS k
      FROM arrival_items a JOIN s ON s.tracking_no = a.tracking_no AND s.receiver_code = a.receiver_code
      WHERE a.bd10_confirmed_at IS NOT NULL AND a.bd10_confirmed_at <> ''
      GROUP BY a.tracking_no)
    SELECT r.receiver_code AS receiver_code, r.ward_name AS ward_name, r.tracking_no AS shbg, r.bd10_no AS bd10_no,
      r.bd10_ttkt_confirmed_at AS ktt, r.bd10_confirmed_at AS xnd
    FROM s LEFT JOIN m ON m.tn = s.tracking_no
    JOIN arrival_items r ON r.id = COALESCE(CAST(substr(m.k, 20, 12) AS INTEGER), s.id)`).all(params);
}

/** Toàn bộ lượt đã đánh giá của bộ lọc đã chuẩn hoá `f` (không phân trang). */
function tatCaLuot(db, f) {
  return layDongDo(db, f).map((d) => {
    const gio = CT.chiTieuGio(d.receiver_code, d.ward_name); // phường/xã của CHÍNH dòng đo (chữ gốc, không phải ward_key đã bỏ dấu)
    const r = N.danhGiaMotLuot({ bd10No: d.bd10_no, maBcvhNhan: d.receiver_code, ktt: d.ktt, xnd: d.xnd, chiTieuF13Gio: gio });
    return {
      receiver_code: d.receiver_code, shbg: d.shbg, bd10_no: d.bd10_no, nhom: r.nhom, ktt: d.ktt || null, xnd: d.xnd || null,
      trangThai: r.trangThai, lyDo: r.lyDo, thoiGianThucGiay: r.thoiGianThucGiay, quyConLaiGiay: r.quyConLaiGiay, nghiNgo: r.nghiNgo,
      chi_tieu_gio: r.chiTieuGio, phuong_trong: CT.maCoNgoaiLe(d.receiver_code) && CT.chuanHoaTenXaPhuong(d.ward_name) === ''
    };
  });
}

/** meta.chi_tieu_f13 cho giao diện ghi chú: chỉ tiêu mặc định + các ngoại lệ theo BCVH / phường-xã (bản sao, không trỏ vào hằng số). */
function metaChiTieuF13() {
  return {
    mac_dinh_gio: CT.CHI_TIEU_MAC_DINH_GIO,
    ngoai_le: CT.NGOAI_LE_CHI_TIEU.map((e) => ({ ma_bcvh: e.maBcvh, phuong: [...e.phuong], gio: e.gio }))
  };
}

const khoaSapXep =(l) => (l.quyConLaiGiay ? l.quyConLaiGiay.F1_3 : null);
function soSanhLuot(a, b) {
  const x = khoaSapXep(a); const y = khoaSapXep(b);
  if (x === null && y !== null) return 1;
  if (x !== null && y === null) return -1;
  if (x !== y) return x - y;
  return a.shbg < b.shbg ? -1 : a.shbg > b.shbg ? 1 : (a.receiver_code < b.receiver_code ? -1 : a.receiver_code > b.receiver_code ? 1 : 0);
}

/** Toàn bộ lượt của khung `f`, đã sắp (quỹ F1_3 tăng dần, null cuối, hòa theo shbg). Danh sách đầy đủ này là thứ được cache (quyThoiGianCache.js): KHÔNG sửa tại chỗ. */
function luotDaSapXep(db, f) {
  return tatCaLuot(db, f).sort(soSanhLuot);
}

/** Lọc (nhom / trang_thai / ly_do / nghi_ngo) và cắt trang từ danh sách đầy đủ đã sắp; không sửa `luotDay`. */
function trangTuLuot(luotDay, f, rieng) {
  let luot = luotDay;
  if (rieng.nhom) luot = luot.filter((l) => l.nhom === rieng.nhom);
  if (rieng.trang_thai) luot = luot.filter((l) => l.trangThai === rieng.trang_thai);
  if (rieng.ly_do) luot = luot.filter((l) => l.lyDo === rieng.ly_do);
  if (rieng.nghi_ngo !== undefined) luot = luot.filter((l) => l.nghiNgo === rieng.nghi_ngo);
  const total = luot.length;
  const items = luot.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
  return {
    items,
    pagination: { total, page: f.page, page_size: f.pageSize, total_pages: Math.ceil(total / f.pageSize) },
    meta: { from: f.from, to: f.to, date_basis: 'arrival', nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY, chi_tieu_f13: metaChiTieuF13() }
  };
}

/**
 * query: from, to (bắt buộc), receiver_code, ward_key, page, page_size, nhom, trang_thai, ly_do, nghi_ngo (1/true | 0/false) (date_basis bị bỏ qua).
 * Trả { items, pagination: { total, page, page_size, total_pages }, meta }; items sắp theo quỹ F1_3 tăng dần (null cuối), hòa theo shbg.
 */
function layLuotQuyThoiGian(db, query) {
  const { f, rieng } = docThamSo(query, { coPhanTrang: true });
  return trangTuLuot(luotDaSapXep(db, f), f, rieng);
}

// ------------------------------------------
// Tổng hợp
// ------------------------------------------
function demRong() {
  const khongDo = {};
  for (const k of LY_DO_KHONG_DO) khongDo[k] = 0;
  return { tong_shbg: 0, do_duoc: 0, am: 0, khong_do_duoc: 0, nghi_ngo: 0, chinh: 0, khong_do_duoc_theo_ly_do: khongDo };
}
function congLuot(d, l) {
  d.tong_shbg++;
  if (l.trangThai === 'DO_DUOC') d.do_duoc++;
  else if (l.trangThai === 'AM') d.am++;
  else { d.khong_do_duoc++; d.khong_do_duoc_theo_ly_do[l.lyDo]++; }
  if (l.nghiNgo) d.nghi_ngo++;
  if (l.trangThai === 'DO_DUOC' && !l.nghiNgo) d.chinh++;
}
function trungVi(ds) {
  if (!ds.length) return null;
  const s = [...ds].sort((a, b) => a - b);
  const g = s.length >> 1;
  return s.length % 2 ? s[g] : (s[g - 1] + s[g]) / 2;
}
/** Chỉ tiêu trên các lượt chinh: { F1_3: {con_quy, het_quy}, F4_1, F4_2, thoi_gian_thuc_trung_vi_giay }. */
function chiTieuCua(luotChinh) {
  const out = {};
  for (const k of CHI_TIEU) {
    let con = 0; let het = 0;
    for (const l of luotChinh) { if (l.quyConLaiGiay[k] >= 0) con++; else het++; }
    out[k] = { con_quy: con, het_quy: het };
  }
  out.thoi_gian_thuc_trung_vi_giay = trungVi(luotChinh.map((l) => l.thoiGianThucGiay));
  return out;
}
const laChinh = (l) => l.trangThai === 'DO_DUOC' && !l.nghiNgo;

/** query như layLuotQuyThoiGian nhưng không có phân trang / lọc nhom, trang_thai, ly_do. Trả { tong, theo_nhom, theo_bcvh, chi_tieu, meta }. */
function tongHopQuyThoiGian(db, query) {
  const { f } = docThamSo(query, { coPhanTrang: false });
  return tongHopTuLuot(tatCaLuot(db, f), f);
}

/** Tổng hợp từ danh sách lượt đầy đủ (thứ tự bất kỳ) của khung `f`. */
function tongHopTuLuot(luot, f) {
  const tong = demRong();
  const theoNhom = {};
  for (const k of Object.keys(N.NHOM_BD10)) theoNhom[k] = { nhom: k, nhan: N.NHAN_NHOM[k], ...demRong() };
  const bcvh = new Map();
  const chinhTheoNhom = {};
  for (const k of Object.keys(N.NHOM_BD10)) chinhTheoNhom[k] = [];
  const chinhTong = [];
  for (const l of luot) {
    congLuot(tong, l);
    congLuot(theoNhom[l.nhom], l);
    let b = bcvh.get(l.receiver_code);
    if (!b) { b = { receiver_code: l.receiver_code, ...demRong() }; bcvh.set(l.receiver_code, b); }
    congLuot(b, l);
    if (laChinh(l)) { chinhTong.push(l); chinhTheoNhom[l.nhom].push(l); }
  }
  const chiTieuNhom = {};
  for (const k of Object.keys(N.NHOM_BD10)) chiTieuNhom[k] = chiTieuCua(chinhTheoNhom[k]);
  return {
    tong,
    theo_nhom: theoNhom,
    theo_bcvh: [...bcvh.values()].sort((a, b) => (a.receiver_code < b.receiver_code ? -1 : a.receiver_code > b.receiver_code ? 1 : 0)),
    chi_tieu: { tong: chiTieuCua(chinhTong), theo_nhom: chiTieuNhom, chi_tieu_gio: { ...Q.CHI_TIEU_GIO } },
    meta: { from: f.from, to: f.to, date_basis: 'arrival', nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY, chi_tieu_f13: metaChiTieuF13() }
  };
}

module.exports = { QueryParamError, TRANG_THAI, layLuotQuyThoiGian, tongHopQuyThoiGian, docThamSo, luotDaSapXep, trangTuLuot, tongHopTuLuot };
