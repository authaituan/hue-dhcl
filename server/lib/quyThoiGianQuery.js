// ==========================================
// Lõi truy vấn «Thời gian Khai thác-Vận chuyển» (QUYTG-4). Chỉ đọc DB.
//
// QUYTG-9a (PO chốt 23/10/2026): CỘNG TỪNG NGÀY. Mỗi lượt = một (SHBG, ngày đến): khung ngày theo arrival_at, SHBG đến lại ở ngày khác của khoảng được tính ở MỖI ngày đến
// (khác aq.buildCountedCte vốn đếm mỗi SHBG một lần trên cả khoảng — hàm đó KHÔNG đổi). Khoảng một ngày cho kết quả y hệt trước (= «Sản lượng đến» cùng bộ lọc);
// khoảng nhiều ngày: tổng = Σ các ngày, nên có thể lớn hơn «Sản lượng đến» của cả khoảng đúng bằng số lượt đến lại. Không lọc BCVH: SHBG đi qua nhiều BCVH cùng ngày vẫn một lượt (xuyên BCVH trong ngày).
// Dòng ĐO của mỗi lượt (MỘT truy vấn gộp, không truy vấn theo từng SHBG): trong các dòng CÙNG BCVH nhận với dòng đại diện của lượt, lấy dòng có XNĐ BD10 SỚM nhất
// (bỏ dòng XNĐ trống; hòa -> id nhỏ nhất; KHÔNG giới hạn theo ngày — lượt đến lại dùng cùng dòng đo với lần đến đầu: còn nợ, xem docs/ai/35). Mốc KTT và bd10_no lấy từ CÙNG dòng đó. Không dòng nào có XNĐ -> dùng chính dòng đại diện (xnd = null).
// Đánh giá từng lượt bằng danhGiaMotLuot (quyThoiGianNhom.js); tổng hợp luôn từ danh sách lượt (cùng một nguồn), không có SQL đếm thứ hai.
// Chỉ tiêu "chinh" = đo được (DO_DUOC) và KHÔNG nghi ngờ; con_quy / het_quy và trung vị tính trên lượt chinh.
// QUYTG-7: mỗi lượt thêm duong_thu, ngay_den, nguon_moc_bat_dau, dai (QUA_HAN | SAP_HET | CON_2_6 | CON_TREN_6 theo quyConLaiGiay.F1_3; null nếu không phải lượt chinh);
// tổng hợp thêm dải / đường thư / BCVH / khung giờ và theoNgayQuyThoiGian — vẫn từ CÙNG danh sách lượt, không SQL đếm thứ hai.
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const Q = require('./quyThoiGian');
const N = require('./quyThoiGianNhom');
const CT = require('./quyThoiGianChiTieu');
const { VALID_BCVH_CODES } = require('./userBcvh');

const { QueryParamError } = aq;
const CHI_TIEU = Object.keys(Q.CHI_TIEU_GIO); // F1_3, F4_1, F4_2
const TRANG_THAI = Object.freeze(['DO_DUOC', 'AM', 'KHONG_DO_DUOC']);
const LY_DO_KHONG_DO = Object.freeze([
  N.LY_DO.LAP_DI_TAI_BCVH, N.LY_DO.KHONG_CO_BD10, N.LY_DO.BD10_KHONG_HOP_LE, N.LY_DO.NHAN_TRUC_TIEP_KHONG_QUA_KTT,
  N.LY_DO.KHONG_QUA_KTT, N.LY_DO.THIEU_XAC_NHAN_KTT, N.LY_DO.THIEU_XND_BCVH
]);
const KHOA_LOC_RIENG = ['nhom', 'trang_thai', 'ly_do', 'nghi_ngo', 'duong_thu', 'dai'];
const KHOA_LOC_CHUNG = ['from', 'to', 'receiver_code', 'ward_key'];

// QUYTG-7: dải thời gian còn lại F1_3 của lượt chính (nửa mở, giây): QUA_HAN < 0; SAP_HET [0, 7.200); CON_2_6 [7.200, 21.600); CON_TREN_6 >= 21.600. Ngưỡng là hằng số (chưa nối sổ «Tham số hệ thống»).
const NGUONG_SAP_HET_GIAY = 2 * 3600;
const NGUONG_CON_2_6_GIAY = 6 * 3600;
const DAI = Object.freeze(['QUA_HAN', 'SAP_HET', 'CON_2_6', 'CON_TREN_6']);
// QUYTG-7c: giá trị lọc `dai` của /luot = 4 dải + CON_THOI_GIAN (= CON_2_6 hoặc CON_TREN_6). DAI giữ 4 dải (khóa của bộ đếm tổng hợp).
const CON_THOI_GIAN = 'CON_THOI_GIAN';
const DAI_LOC = Object.freeze([...DAI, CON_THOI_GIAN]);
const DUONG_THU_TRONG = 'Chưa rõ đường thư';
// QUYTG-9a: trần khoảng ngày của CẢ BA route (/tong-hop, /luot, /theo-ngay), đếm theo ngày của from / to.
const MAX_NGAY_KHOANG = 31;
// QUYTG-9a (TẠM, PO chốt 23/10/2026; chưa nối sổ «Tham số hệ thống»): (BCVH, ngày) có ÍT HƠN số lượt đến này thì không vào lũy kế (DUOI_SAN). BCVH nhỏ có thể dưới sàn dù đủ file; PO chỉnh khi có số thật.
const SAN_NGAY_CO_DU_LIEU = 50;
// Khung giờ XNĐ BCVH (nửa mở): chỉ số theo giờ 0-9 / 10-11 / 12-13 / 14-15 / 16-17 / 18-23.
const KHUNG_GIO = Object.freeze(['Trước 10h', '10–12h', '12–14h', '14–16h', '16–18h', 'Sau 18h']);

function daiCua(quyGiay) {
  if (quyGiay < 0) return 'QUA_HAN';
  if (quyGiay < NGUONG_SAP_HET_GIAY) return 'SAP_HET';
  if (quyGiay < NGUONG_CON_2_6_GIAY) return 'CON_2_6';
  return 'CON_TREN_6';
}
/** QUYTG-7c: tên phường/xã GỐC của dòng đo (cắt khoảng trắng hai đầu, không chuẩn hoá, không bỏ dấu); rỗng / null / chữ NULL -> null. */
function tenPhuongXaGoc(ten) {
  if (ten === null || ten === undefined) return null;
  const s = String(ten).trim();
  return s === '' || s.toUpperCase() === 'NULL' ? null : s;
}
/** Trả bản đã gặp đầu tiên của chuỗi `ten` trong `bang` (null giữ nguyên). */
function dungChung(bang, ten) {
  if (ten === null) return null;
  const co = bang.get(ten);
  if (co !== undefined) return co;
  bang.set(ten, ten);
  return ten;
}
/** Giây UTC (số) của 00:00 ngày 'YYYY-MM-DD' đã hợp lệ — dựng từ các trường số, không phân tích chuỗi bằng Date. */
const utcNgay = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const soNgay = (tu, den) => Math.round((utcNgay(den) - utcNgay(tu)) / 86400000) + 1;
/** Chỉ số khung giờ từ giờ trong chuỗi 'YYYY-MM-DD HH:MM:SS' (cắt chuỗi, không dựng Date). */
const chiSoKhungGio = (xnd) => { const h = Number(xnd.slice(11, 13)); return h < 10 ? 0 : h >= 18 ? 5 : (h >> 1) - 4; };

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
    if (rieng.dai !== undefined && !DAI_LOC.includes(rieng.dai)) throw new QueryParamError(`Tham số "dai" phải là một trong: ${DAI_LOC.join(', ')}`);
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
  if (soNgay(f.fromDate, f.toDate) > MAX_NGAY_KHOANG) throw new QueryParamError(`Khoảng thời gian tối đa ${MAX_NGAY_KHOANG} ngày`);
  return { f, rieng };
}

// ------------------------------------------
// Lấy lượt
// ------------------------------------------
/**
 * SQL lấy dòng ĐO của từng lượt (QUYTG-9a: một lượt = một (SHBG, ngày đến); KHÔNG dùng aq.buildCountedCte để không đổi cách đếm của /summary và dashboard).
 *  r      : dòng có arrival_at trong [from, to] (+ BCVH nhận nếu lọc);
 *  firsts : mỗi (SHBG, ngày đến) một khoá "arrival_at||id" nhỏ nhất -> dòng đại diện của lượt. theoBcvh=true thêm BCVH vào khoá nhóm (lũy kế: công thức A, mỗi (SHBG, BCVH, ngày) một lượt);
 *  s      : dòng đại diện (lọc phường/xã nếu có);
 *  m      : dòng ĐO = XNĐ sớm nhất trong các dòng CÙNG SHBG và CÙNG BCVH với dòng đại diện (không giới hạn theo ngày); nhóm theo (SHBG, BCVH) vì một SHBG có thể có đại diện ở nhiều BCVH.
 */
function sqlDongDo(f, { theoBcvh = false } = {}) {
  const where = ['arrival_date BETWEEN @dfrom AND @dto', 'arrival_at BETWEEN @from AND @to'];
  const params = { from: f.from, to: f.to, dfrom: f.fromDate, dto: f.toDate };
  if (f.receiverCodes.length) {
    where.push('receiver_code IN (SELECT value FROM json_each(@recv))');
    params.recv = JSON.stringify(f.receiverCodes);
  }
  if (f.wardKey) params.ward = f.wardKey;
  const sql = `WITH r AS MATERIALIZED (
      SELECT id, tracking_no, receiver_code, arrival_at AS t FROM arrival_items WHERE ${where.join(' AND ')}),
    firsts AS (
      SELECT tracking_no, MIN(t || printf('%012d', id)) AS k FROM r GROUP BY tracking_no, substr(t, 1, 10)${theoBcvh ? ', receiver_code' : ''}),
    s AS MATERIALIZED (
      SELECT x.tracking_no, substr(x.k, 1, 19) AS t, a.id, a.receiver_code
      FROM firsts x JOIN arrival_items a ON a.id = CAST(substr(x.k, 20, 12) AS INTEGER)${f.wardKey ? ' WHERE a.ward_key = @ward' : ''}),
    m AS (
      SELECT a.tracking_no AS tn, a.receiver_code AS rc, MIN(a.bd10_confirmed_at || printf('%012d', a.id)) AS k
      FROM arrival_items a JOIN (SELECT DISTINCT tracking_no, receiver_code FROM s) u ON u.tracking_no = a.tracking_no AND u.receiver_code = a.receiver_code
      WHERE a.bd10_confirmed_at IS NOT NULL AND a.bd10_confirmed_at <> ''
      GROUP BY a.tracking_no, a.receiver_code)
    SELECT r.receiver_code AS receiver_code, r.ward_name AS ward_name, r.tracking_no AS shbg, r.bd10_no AS bd10_no,
      r.bd10_ttkt_confirmed_at AS ktt, r.bd10_confirmed_at AS xnd, r.route_name AS route_name, s.t AS t_den
    FROM s LEFT JOIN m ON m.tn = s.tracking_no AND m.rc = s.receiver_code
    JOIN arrival_items r ON r.id = COALESCE(CAST(substr(m.k, 20, 12) AS INTEGER), s.id)`;
  return { sql, params };
}

/** Một truy vấn gộp: mỗi lượt (SHBG, ngày đến) -> một dòng đo { receiver_code, shbg, bd10_no, ktt, xnd, t_den, ... }. */
function layDongDo(db, f, opts) {
  const { sql, params } = sqlDongDo(f, opts);
  return db.prepare(sql).all(params);
}

/** Đánh giá MỘT dòng đo thành lượt. `tenPhuong`: bảng dùng chung chuỗi tên phường/xã (xem tatCaLuot). */
function danhGiaDong(d, tenPhuong) {
  const gio = CT.chiTieuGio(d.receiver_code, d.ward_name); // phường/xã của CHÍNH dòng đo (chữ gốc, không phải ward_key đã bỏ dấu)
  const r = N.danhGiaMotLuot({ bd10No: d.bd10_no, maBcvhNhan: d.receiver_code, ktt: d.ktt, xnd: d.xnd, chiTieuF13Gio: gio });
  const chinh = r.trangThai === 'DO_DUOC' && !r.nghiNgo;
  return {
    receiver_code: d.receiver_code, shbg: d.shbg, bd10_no: d.bd10_no, nhom: r.nhom, ktt: d.ktt || null, xnd: d.xnd || null,
    trangThai: r.trangThai, lyDo: r.lyDo, thoiGianThucGiay: r.thoiGianThucGiay, quyConLaiGiay: r.quyConLaiGiay, nghiNgo: r.nghiNgo,
    chi_tieu_gio: r.chiTieuGio, phuong_trong: CT.maCoNgoaiLe(d.receiver_code) && CT.chuanHoaTenXaPhuong(d.ward_name) === '',
    duong_thu: String(d.route_name ?? '').trim() || DUONG_THU_TRONG, ngay_den: d.t_den.slice(0, 10), nguon_moc_bat_dau: r.nguonMocBatDau,
    dai: chinh ? daiCua(r.quyConLaiGiay.F1_3) : null, // chỉ lượt chính được xếp dải
    phuong_xa: dungChung(tenPhuong, tenPhuongXaGoc(d.ward_name)) // QUYTG-7c: cùng dòng đo với chi_tieu_gio
  };
}

/** Toàn bộ lượt đã đánh giá của bộ lọc đã chuẩn hoá `f` (không phân trang). */
function tatCaLuot(db, f) {
  const tenPhuong = new Map(); // ~40 tên phường/xã khác nhau trên ~10^5 lượt: dùng chung một chuỗi cho mỗi tên để danh sách trong cache không giữ mỗi lượt một bản sao
  return layDongDo(db, f).map((d) => danhGiaDong(d, tenPhuong));
}

/** meta.chi_tieu_f13 cho giao diện ghi chú: chỉ tiêu mặc định + các ngoại lệ theo BCVH / phường-xã (bản sao, không trỏ vào hằng số). */
function metaChiTieuF13() {
  return {
    mac_dinh_gio: CT.CHI_TIEU_MAC_DINH_GIO,
    ngoai_le: CT.NGOAI_LE_CHI_TIEU.map((e) => ({ ma_bcvh: e.maBcvh, phuong: [...e.phuong], gio: e.gio }))
  };
}

const khoaSapXep =(l) => (l.quyConLaiGiay ? l.quyConLaiGiay.F1_3 : null);
/**
 * Thứ tự /luot (QUYTG-9d): nhóm A = không nghi ngờ, có quỹ F1_3 (tăng dần); nhóm B = không nghi ngờ, quỹ null; nhóm C = nghi ngờ, CUỐI danh sách
 * (trong nhóm C cũng quỹ tăng dần, null cuối). Lượt nghi ngờ có quỹ âm rất sâu nên nếu để chung sẽ đẩy lượt quá hạn thật xuống dưới.
 * Hòa: shbg, receiver_code, ngay_den.
 */
function soSanhLuot(a, b) {
  if (a.nghiNgo !== b.nghiNgo) return a.nghiNgo ? 1 : -1;
  const x = khoaSapXep(a); const y = khoaSapXep(b);
  if (x === null && y !== null) return 1;
  if (x !== null && y === null) return -1;
  if (x !== y) return x - y;
  if (a.shbg !== b.shbg) return a.shbg < b.shbg ? -1 : 1;
  if (a.receiver_code !== b.receiver_code) return a.receiver_code < b.receiver_code ? -1 : 1;
  return a.ngay_den < b.ngay_den ? -1 : a.ngay_den > b.ngay_den ? 1 : 0; // QUYTG-9a: cùng SHBG có thể có lượt ở nhiều ngày
}

/** Toàn bộ lượt của khung `f`, đã sắp (xem soSanhLuot: lượt không nghi ngờ trước, quỹ F1_3 tăng dần, null cuối, hòa theo shbg; lượt nghi ngờ cuối). Danh sách đầy đủ này là thứ được cache (quyThoiGianCache.js): KHÔNG sửa tại chỗ. */
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
  if (rieng.duong_thu) luot = luot.filter((l) => l.duong_thu === rieng.duong_thu);
  if (rieng.dai === CON_THOI_GIAN) luot = luot.filter((l) => l.dai === 'CON_2_6' || l.dai === 'CON_TREN_6');
  else if (rieng.dai) luot = luot.filter((l) => l.dai === rieng.dai);
  const total = luot.length;
  const items = luot.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
  return {
    items,
    pagination: { total, page: f.page, page_size: f.pageSize, total_pages: Math.ceil(total / f.pageSize) },
    meta: { from: f.from, to: f.to, date_basis: 'arrival', nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY, chi_tieu_f13: metaChiTieuF13() }
  };
}

/**
 * query: from, to (bắt buộc), receiver_code, ward_key, page, page_size, nhom, trang_thai, ly_do, nghi_ngo (1/true | 0/false), duong_thu (khớp chính xác), dai (4 dải hoặc CON_THOI_GIAN = CON_2_6 + CON_TREN_6) (date_basis bị bỏ qua).
 * Trả { items, pagination: { total, page, page_size, total_pages }, meta }; items sắp: lượt không nghi ngờ theo quỹ F1_3 tăng dần (null cuối), rồi lượt nghi ngờ (QUYTG-9d) cũng theo quỹ tăng dần (null cuối); hòa theo shbg.
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
  return { tong_shbg: 0, do_duoc: 0, am: 0, khong_do_duoc: 0, nghi_ngo: 0, chinh: 0, truc_tiep: 0, lech_moc: 0, dai: demDai(), khong_do_duoc_theo_ly_do: khongDo };
}
function demDai() {
  const dai = {};
  for (const k of DAI) dai[k] = 0;
  return dai;
}
function congLuot(d, l) {
  d.tong_shbg++;
  if (l.trangThai === 'DO_DUOC') d.do_duoc++;
  else if (l.trangThai === 'AM') { d.am++; d.lech_moc++; }
  else { d.khong_do_duoc++; d.khong_do_duoc_theo_ly_do[l.lyDo]++; }
  if (l.nghiNgo) d.nghi_ngo++;
  if (l.trangThai === 'DO_DUOC' && !l.nghiNgo) d.chinh++;
  if (l.dai !== null) { d.dai[l.dai]++; if (l.nguon_moc_bat_dau === 'XND_BCVH') d.truc_tiep++; } // truc_tiep: tập con của chinh
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

// Bộ gom nhẹ cho theo_duong_thu / tong.theo_bcvh / theo-ngay (QUYTG-7). Mẫu số tỉ lệ và trung bình = lượt chính, GỒM lượt nhận trực tiếp (đã qua 0).
const gomRong = () => ({ den: 0, chinh: 0, truc_tiep: 0, lech_moc: 0, nghi_ngo: 0, khong_do_duoc: 0, dai: demDai(), tongThucGiay: 0 });
function congGom(g, l) {
  g.den++;
  if (l.trangThai === 'AM') g.lech_moc++;
  else if (l.trangThai === 'KHONG_DO_DUOC') g.khong_do_duoc++;
  if (l.nghiNgo) g.nghi_ngo++;
  if (l.dai !== null) {
    g.chinh++;
    g.dai[l.dai]++;
    g.tongThucGiay += l.thoiGianThucGiay;
    if (l.nguon_moc_bat_dau === 'XND_BCVH') g.truc_tiep++;
  }
}
const tyLeQuaHan = (g) => (g.chinh ? g.dai.QUA_HAN / g.chinh : null);
const trungBinhDaQua = (g) => (g.chinh ? Math.floor(g.tongThucGiay / g.chinh) : null); // làm tròn xuống giây nguyên
const soSanhChuoi = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Bảng xếp hạng: qua_han giảm dần, hòa theo den giảm dần rồi theo khóa tên tăng dần. */
const soSanhXepHang = (khoa) => (a, b) => b.qua_han - a.qua_han || b.den - a.den || soSanhChuoi(a[khoa], b[khoa]);
function dongXepHang(khoaTen, ten, g) {
  return { [khoaTen]: ten, den: g.den, chinh: g.chinh, truc_tiep: g.truc_tiep, qua_han: g.dai.QUA_HAN, sap_het: g.dai.SAP_HET, ty_le_qua_han: tyLeQuaHan(g) };
}

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
  const duongThu = new Map();
  const bcvhXepHang = new Map();
  const theoGio = KHUNG_GIO.map((khung) => ({ khung, chinh: 0, dai: demDai(), qua_han: 0, sap_het: 0 }));
  let phuongTrong = 0;
  for (const l of luot) {
    congLuot(tong, l);
    congLuot(theoNhom[l.nhom], l);
    let b = bcvh.get(l.receiver_code);
    if (!b) { b = { receiver_code: l.receiver_code, ...demRong() }; bcvh.set(l.receiver_code, b); }
    congLuot(b, l);
    let dt = duongThu.get(l.duong_thu);
    if (!dt) { dt = gomRong(); duongThu.set(l.duong_thu, dt); }
    congGom(dt, l);
    let bx = bcvhXepHang.get(l.receiver_code);
    if (!bx) { bx = gomRong(); bcvhXepHang.set(l.receiver_code, bx); }
    congGom(bx, l);
    if (laChinh(l)) {
      chinhTong.push(l);
      chinhTheoNhom[l.nhom].push(l);
      if (l.phuong_trong) phuongTrong++;
      const g = theoGio[chiSoKhungGio(l.xnd)];
      g.chinh++;
      g.dai[l.dai]++;
    }
  }
  for (const g of theoGio) { g.qua_han = g.dai.QUA_HAN; g.sap_het = g.dai.SAP_HET; }
  const chiTieuNhom = {};
  for (const k of Object.keys(N.NHOM_BD10)) chiTieuNhom[k] = chiTieuCua(chinhTheoNhom[k]);
  // Khóa MỚI nằm trong `tong` (theo_bcvh ở gốc là khóa cũ, giữ nguyên hình dạng và thứ tự theo mã).
  tong.ty_le_qua_han = tong.chinh ? tong.dai.QUA_HAN / tong.chinh : null;
  tong.phuong_trong = phuongTrong;
  tong.theo_bcvh = [...bcvhXepHang].map(([ma, g]) => dongXepHang('ma_bcvh', ma, g)).sort(soSanhXepHang('ma_bcvh'));
  tong.theo_duong_thu = [...duongThu].map(([ten, g]) => ({ ...dongXepHang('ten', ten, g), da_qua_trung_binh_giay: trungBinhDaQua(g) })).sort(soSanhXepHang('ten'));
  return {
    tong,
    theo_nhom: theoNhom,
    theo_bcvh: [...bcvh.values()].sort((a, b) => soSanhChuoi(a.receiver_code, b.receiver_code)),
    theo_gio: theoGio,
    chi_tieu: { tong: chiTieuCua(chinhTong), theo_nhom: chiTieuNhom, chi_tieu_gio: { ...Q.CHI_TIEU_GIO } },
    meta: { from: f.from, to: f.to, date_basis: 'arrival', chi_tieu: 'F1_3', nguong_sap_het_giay: NGUONG_SAP_HET_GIAY, nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY, chi_tieu_f13: metaChiTieuF13() }
  };
}

// ------------------------------------------
// Theo ngày đến (QUYTG-7)
// ------------------------------------------
/** Như docThamSo không phân trang (từ QUYTG-9a trần 31 ngày đã nằm trong docThamSo cho cả ba route). */
function docThamSoTheoNgay(query) {
  return docThamSo(query, { coPhanTrang: false });
}
/** Mọi ngày từ `tu` đến `den` (YYYY-MM-DD), giảm dần. */
function cacNgayGiam(tu, den) {
  const ds = [];
  const dau = utcNgay(tu);
  for (let i = soNgay(tu, den) - 1; i >= 0; i--) ds.push(new Date(dau + i * 86400000).toISOString().slice(0, 10));
  return ds;
}

/** Tổng hợp theo ngày đến từ danh sách lượt đầy đủ của khung `f`; đủ mọi ngày trong khoảng (kể cả ngày 0 lượt), ngày giảm dần. */
function theoNgayTuLuot(luot, f) {
  const gom = new Map(cacNgayGiam(f.fromDate, f.toDate).map((n) => [n, gomRong()]));
  for (const l of luot) congGom(gom.get(l.ngay_den), l);
  return {
    ngay: [...gom].map(([ngay, g]) => ({
      ngay_den: ngay, den: g.den, chinh: g.chinh, truc_tiep: g.truc_tiep, lech_moc: g.lech_moc, nghi_ngo: g.nghi_ngo, khong_do_duoc: g.khong_do_duoc, dai: g.dai,
      qua_han: g.dai.QUA_HAN, ty_le_qua_han: tyLeQuaHan(g), sap_het: g.dai.SAP_HET, da_qua_trung_binh_giay: trungBinhDaQua(g)
    })),
    meta: { from: f.from, to: f.to, date_basis: 'arrival', chi_tieu: 'F1_3', nguong_sap_het_giay: NGUONG_SAP_HET_GIAY, nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY, chi_tieu_f13: metaChiTieuF13() }
  };
}

/** query: from, to (bắt buộc, tối đa 31 ngày), receiver_code, ward_key. Trả { ngay: [...], meta }. */
function theoNgayQuyThoiGian(db, query) {
  const { f } = docThamSoTheoNgay(query);
  return theoNgayTuLuot(tatCaLuot(db, f), f);
}

// ------------------------------------------
// Lũy kế tháng (QUYTG-9a): GET …/quy-thoi-gian/luy-ke. Từ ngày 01 của tháng chứa `den` đến `den` (mặc định: ngày mới nhất có dữ liệu), theo BCVH đang lọc,
// KHÔNG phụ thuộc khoảng ngày người dùng chọn. Cộng từng cặp (BCVH, ngày) «có dữ liệu»;
// tỉ lệ = Σ quá hạn / Σ chinh (cộng đếm rồi chia, KHÔNG trung bình tỉ lệ ngày). Cache theo (BCVH, ngày) / (tập BCVH, ngày) nằm ở quyThoiGianCache.js.
// QUYTG-9a-2 (CTO chốt): MỘT BCVH -> số của ngày = số của cặp (BCVH, ngày) (như trước). NHIỀU BCVH (kể cả «Tất cả» = cả 6) -> số của MỖI NGÀY lấy bằng đúng cách tính của /tong-hop
// trong ngày đó, trên các BCVH «có dữ liệu» của ngày (loại trùng SHBG đi qua nhiều BCVH trong ngày) -> bằng /tong-hop «Tất cả» của ngày khi cả 6 BCVH đều có dữ liệu. Tổng, luy_ke_* cộng từ các ngày đó.
// Sàn 50 / thiếu file / đang cập nhật vẫn xét RIÊNG TỪNG BCVH (số lượt riêng của BCVH, đếm nhẹ bằng SQL: demLuotTheoBcvhNgay).
// (BCVH, ngày) «có dữ liệu» khi: có ≥ 1 file OK với file_date = ngày (nếu không: THIEU_FILE); ngày mới nhất của phạm vi mà BCVH có < 2 file OK / EMPTY thì đang cập nhật
// (DANG_CAP_NHAT, chưa gồm); số lượt đến ≥ SAN_NGAY_CO_DU_LIEU (nếu không: DUOI_SAN).
// ------------------------------------------
const LY_DO_NGAY = Object.freeze({ THIEU_FILE: 'THIEU_FILE', DANG_CAP_NHAT: 'DANG_CAP_NHAT', DUOI_SAN: 'DUOI_SAN' });
const SO_FILE_DU_DOT = 2;
const KHOA_LUY_KE = ['receiver_code', 'den'];

/** query: receiver_code (tùy chọn, mã trong 6 BCVH; vắng = cả 6), den (YYYY-MM-DD, tùy chọn). Khóa lạ / mã ngoài danh mục / ngày sai -> QueryParamError. Trả { codes (đã sắp, bỏ trùng), den (hoặc null) }. */
function docThamSoLuyKe(query) {
  const goc = query && typeof query === 'object' ? { ...query } : {};
  for (const k of Object.keys(goc)) if (!KHOA_LUY_KE.includes(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  let den = null;
  if (goc.den !== undefined) {
    if (Array.isArray(goc.den)) throw new QueryParamError('Tham số "den" chỉ nhận 1 giá trị');
    const s = String(goc.den).trim();
    if (s !== '') {
      const m = aq.DATE_RE.exec(s);
      if (!m || !aq.validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "den" phải là ngày hợp lệ dạng YYYY-MM-DD');
      den = s;
    }
  }
  const f = aq.parseFilters({ receiver_code: goc.receiver_code }, { allowed: ['receiver_code'], requireRange: false });
  const codes = [...new Set(f.receiverCodes)].sort();
  const la = codes.filter((c) => !VALID_BCVH_CODES.includes(c));
  if (la.length) throw new QueryParamError(`Tham số "receiver_code" phải là mã trong: ${VALID_BCVH_CODES.join(', ')}`);
  return { codes: codes.length ? codes : [...VALID_BCVH_CODES].sort(), den };
}

/** Mọi ngày từ `tu` đến `den` (YYYY-MM-DD), tăng dần. */
const cacNgayTang = (tu, den) => cacNgayGiam(tu, den).reverse();

/** Khung của lũy kế: { codes, tu, den, ngays, ngayMoiNhat }. Chưa có file OK nào trong phạm vi và không truyền `den` -> tu / den null, ngays rỗng. */
function khungLuyKe(db, p) {
  const ngayMoiNhat = aq.latestFileDate(db, p.codes, aq.latestFileDates(db));
  const den = p.den || ngayMoiNhat;
  if (!den) return { codes: p.codes, tu: null, den: null, ngays: [], ngayMoiNhat: null };
  const tu = `${den.slice(0, 7)}-01`;
  return { codes: p.codes, tu, den, ngays: cacNgayTang(tu, den), ngayMoiNhat };
}

/** File hàng đến của phạm vi: Map `mã|file_date` -> { ok (số file OK), tong (OK + EMPTY) }. Bảng nhỏ, đọc mỗi lần. */
function thongTinFile(db, codes, tu, den) {
  const out = new Map();
  const rows = db.prepare(`SELECT unit_code AS b, file_date AS d, COALESCE(SUM(status = 'OK'), 0) AS ok, COALESCE(SUM(status IN ('OK', 'EMPTY')), 0) AS tong
    FROM arrival_import_files WHERE file_date BETWEEN @tu AND @den AND unit_code IN (SELECT value FROM json_each(@j)) GROUP BY unit_code, file_date`)
    .all({ tu, den, j: JSON.stringify(codes) });
  for (const r of rows) out.set(`${r.b}|${r.d}`, { ok: r.ok, tong: r.tong });
  return out;
}

/**
 * Chữ ký dữ liệu hàng đến theo (BCVH, ngày đến) trong [tu, den]: Map `mã|ngày` -> chuỗi. MỘT truy vấn gộp. Đổi khi thêm / xóa dòng hoặc SỬA TẠI CHỖ giờ đến, XNĐ, KTT,
// phường/xã, số BD10 của dòng thuộc cặp. Không bắt được dòng của CÙNG SHBG ở ngày khác (dòng đo không giới hạn theo ngày): cache có chốt tuổi tối đa ở quyThoiGianCache.js.
 */
function chuKyDuLieu(db, codes, tu, den) {
  const out = new Map();
  const rows = db.prepare(`SELECT receiver_code AS b, arrival_date AS d, COUNT(*) AS n, COALESCE(SUM(id), 0) AS s,
      COALESCE(SUM(CAST(strftime('%s', arrival_at) AS INTEGER)), 0) AS a, COALESCE(SUM(CAST(strftime('%s', bd10_confirmed_at) AS INTEGER)), 0) AS x,
      COALESCE(SUM(CAST(strftime('%s', bd10_ttkt_confirmed_at) AS INTEGER)), 0) AS k, COALESCE(SUM(length(ward_name)), 0) AS w, COALESCE(SUM(length(bd10_no)), 0) AS bn
    FROM arrival_items WHERE arrival_date BETWEEN @tu AND @den AND receiver_code IN (SELECT value FROM json_each(@j)) GROUP BY receiver_code, arrival_date`)
    .all({ tu, den, j: JSON.stringify(codes) });
  for (const r of rows) out.set(`${r.b}|${r.d}`, `${r.n}.${r.s}.${r.a}.${r.x}.${r.k}.${r.w}.${r.bn}`);
  return out;
}
const CHU_KY_TRONG = '0';

/**
 * Số đếm theo (BCVH, ngày đến) trong [tu, den] của các BCVH `codes`: Map `mã|ngày` -> demRong(). MỘT truy vấn gộp đọc theo luồng (không giữ danh sách lượt).
 * Cặp không có lượt không có trong Map. Mỗi (SHBG, BCVH, ngày) một lượt.
 */
function tinhTheoBcvhNgay(db, codes, tu, den) {
  const f = { from: `${tu} 00:00:00`, to: `${den} 23:59:59`, fromDate: tu, toDate: den, receiverCodes: codes, wardKey: null };
  const { sql, params } = sqlDongDo(f, { theoBcvh: true });
  const tenPhuong = new Map();
  const out = new Map();
  for (const d of db.prepare(sql).iterate(params)) {
    const l = danhGiaDong(d, tenPhuong);
    const k = `${l.receiver_code}|${l.ngay_den}`;
    let g = out.get(k);
    if (!g) { g = demRong(); out.set(k, g); }
    congLuot(g, l);
  }
  return out;
}

/**
 * Số lượt theo (BCVH, ngày đến) trong [tu, den] của các BCVH `codes`: Map `mã|ngày` -> { tong_shbg }. Chỉ ĐẾM (một truy vấn SQL, không đánh giá từng lượt):
 * = tong_shbg của tinhTheoBcvhNgay, vì mỗi (SHBG, BCVH, ngày) là một lượt. Dùng cho sàn SAN_NGAY_CO_DU_LIEU ở chế độ nhiều BCVH.
 */
function demLuotTheoBcvhNgay(db, codes, tu, den) {
  const out = new Map();
  const rows = db.prepare(`SELECT receiver_code AS b, substr(arrival_at, 1, 10) AS d, COUNT(DISTINCT tracking_no) AS n FROM arrival_items
    WHERE arrival_date BETWEEN @tu AND @den AND arrival_at BETWEEN @from AND @to AND receiver_code IN (SELECT value FROM json_each(@j))
    GROUP BY receiver_code, substr(arrival_at, 1, 10)`).all({ tu, den, from: `${tu} 00:00:00`, to: `${den} 23:59:59`, j: JSON.stringify(codes) });
  for (const r of rows) out.set(`${r.b}|${r.d}`, { tong_shbg: r.n });
  return out;
}

/**
 * Số đếm của MỘT ngày cho các BCVH `codes` theo đúng cách /tong-hop tính (cùng sqlDongDo / danhGiaDong / congLuot, khung ngày đó, không lọc phường/xã): SHBG đi qua nhiều BCVH
 * trong ngày là MỘT lượt. Trả demRong() hoặc null nếu ngày không có lượt. `codes` phải là các BCVH «có dữ liệu» của ngày.
 */
function tinhNgayGop(db, codes, ngay) {
  const f = { from: `${ngay} 00:00:00`, to: `${ngay} 23:59:59`, fromDate: ngay, toDate: ngay, receiverCodes: [...codes].sort(), wardKey: null };
  const { sql, params } = sqlDongDo(f);
  const tenPhuong = new Map();
  const g = demRong();
  for (const d of db.prepare(sql).iterate(params)) congLuot(g, danhGiaDong(d, tenPhuong));
  return g.tong_shbg ? g : null;
}

/** Lý do (BCVH, ngày) KHÔNG vào lũy kế: THIEU_FILE > DANG_CAP_NHAT > DUOI_SAN; null = có dữ liệu. fi: thongTinFile của cặp; soLuot: số lượt đến của cặp. */
function lyDoThieuNgay(kh, ngay, fi, soLuot) {
  if (!fi || fi.ok < 1) return LY_DO_NGAY.THIEU_FILE;
  if (ngay === kh.ngayMoiNhat && fi.tong < SO_FILE_DU_DOT) return LY_DO_NGAY.DANG_CAP_NHAT;
  if (soLuot < SAN_NGAY_CO_DU_LIEU) return LY_DO_NGAY.DUOI_SAN;
  return null;
}
/** Lũy kế gộp (loại trùng xuyên BCVH trong ngày) khi xét NHIỀU BCVH; một BCVH giữ cách cộng riêng. */
const luyKeGop = (kh) => kh.codes.length > 1;

/** Cộng số đếm `a` (demRong) vào tổng `tong` và vào dòng ngày `n`. */
function congVaoLuyKe(tong, n, a) {
  tong.tong_shbg += a.tong_shbg; tong.do_duoc += a.do_duoc; tong.chinh += a.chinh; tong.truc_tiep += a.truc_tiep;
  for (const k of DAI) tong.dai[k] += a.dai[k];
  n.den += a.tong_shbg; n.chinh += a.chinh; n.qua_han += a.dai.QUA_HAN; // qua_han = ĐẾM QUÁ HẠN (dai.QUA_HAN), không lấy từ số lượt đến
}

/**
 * Ghép kết quả lũy kế (THUẦN). files: thongTinFile.
 *  - Một BCVH: agg = Map `mã|ngày` -> demRong() (thiếu = 0 lượt); số của ngày = số của cặp.
 *  - Nhiều BCVH: agg = Map `mã|ngày` -> { tong_shbg } (chỉ để xét sàn); gopNgay(ngày, các BCVH có dữ liệu) -> demRong() | null cho số của ngày.
 */
function ghepLuyKe(kh, files, agg, gopNgay = null) {
  const tong = { tong_shbg: 0, do_duoc: 0, chinh: 0, truc_tiep: 0, dai: demDai(), ty_le_qua_han: null };
  const theoNgay = [];
  const dangCapNhat = new Set();
  let luyQuaHan = 0;
  let luyChinh = 0;
  let soNgayCo = 0;
  for (const ngay of kh.ngays) {
    const n = { den: 0, chinh: 0, qua_han: 0 };
    const thieu = [];
    const coDuLieuMa = [];
    for (const ma of kh.codes) {
      const fi = files.get(`${ma}|${ngay}`);
      const a = agg.get(`${ma}|${ngay}`) || null;
      const lyDo = lyDoThieuNgay(kh, ngay, fi, a ? a.tong_shbg : 0);
      if (lyDo) {
        thieu.push({ ma, ly_do: lyDo });
        if (lyDo === LY_DO_NGAY.DANG_CAP_NHAT) dangCapNhat.add(ma);
        continue;
      }
      coDuLieuMa.push(ma);
      if (!gopNgay) congVaoLuyKe(tong, n, a);
    }
    const trong = coDuLieuMa.length;
    if (gopNgay && trong) {
      const g = gopNgay(ngay, coDuLieuMa);
      if (g) congVaoLuyKe(tong, n, g);
    }
    const coDuLieu = trong > 0;
    if (coDuLieu) { soNgayCo++; luyQuaHan += n.qua_han; luyChinh += n.chinh; }
    const lyDoNgay = coDuLieu ? null : (thieu.find((t) => t.ly_do === LY_DO_NGAY.DANG_CAP_NHAT) || thieu.find((t) => t.ly_do === LY_DO_NGAY.DUOI_SAN) || thieu[0] || { ly_do: LY_DO_NGAY.THIEU_FILE }).ly_do;
    theoNgay.push({
      ngay, co_du_lieu: coDuLieu, ly_do: lyDoNgay, so_bcvh_trong_ngay: trong, bcvh_thieu: thieu,
      den: n.den, chinh: n.chinh, qua_han: n.qua_han, ty_le_qua_han: coDuLieu && n.chinh ? n.qua_han / n.chinh : null,
      luy_ke_qua_han: luyQuaHan, luy_ke_chinh: luyChinh, luy_ke_ty_le: luyChinh ? luyQuaHan / luyChinh : null
    });
  }
  tong.ty_le_qua_han = tong.chinh ? tong.dai.QUA_HAN / tong.chinh : null;
  const cap = dangCapNhat.size > 0;
  return {
    tu: kh.tu, den: kh.den, thang: kh.den ? kh.den.slice(0, 7) : null, ngay_moi_nhat: kh.ngayMoiNhat, ngay_dang_cap_nhat: cap ? kh.ngayMoiNhat : null,
    so_ngay_co_du_lieu: soNgayCo, bcvh: kh.codes, tong, theo_ngay: theoNgay,
    meta: {
      cach_tinh: 'CONG_TUNG_NGAY', loai_trung_xuyen_bcvh_trong_ngay: gopNgay !== null, chi_tieu: 'F1_3', dang_cap_nhat: cap, bcvh_dang_cap_nhat: [...dangCapNhat].sort(), san_ngay_co_du_lieu: SAN_NGAY_CO_DU_LIEU,
      nguong_sap_het_giay: NGUONG_SAP_HET_GIAY, nguong_nghi_ngo_giay: N.NGUONG_NGHI_NGO_GIAY
    }
  };
}

/** Lũy kế KHÔNG qua cache (dùng cho test đối chiếu và làm chuẩn): query như docThamSoLuyKe. */
function luyKeQuyThoiGian(db, query) {
  const kh = khungLuyKe(db, docThamSoLuyKe(query));
  if (!kh.den) return ghepLuyKe(kh, new Map(), new Map());
  const files = thongTinFile(db, kh.codes, kh.tu, kh.den);
  if (!luyKeGop(kh)) return ghepLuyKe(kh, files, tinhTheoBcvhNgay(db, kh.codes, kh.tu, kh.den));
  return ghepLuyKe(kh, files, demLuotTheoBcvhNgay(db, kh.codes, kh.tu, kh.den), (ngay, codes) => tinhNgayGop(db, codes, ngay));
}

module.exports = {
  QueryParamError, TRANG_THAI, DAI, DAI_LOC, KHUNG_GIO, DUONG_THU_TRONG, NGUONG_SAP_HET_GIAY, NGUONG_CON_2_6_GIAY, MAX_NGAY_KHOANG, SAN_NGAY_CO_DU_LIEU, LY_DO_NGAY, daiCua,
  layLuotQuyThoiGian, tongHopQuyThoiGian, theoNgayQuyThoiGian, docThamSo, docThamSoTheoNgay, luotDaSapXep, trangTuLuot, tongHopTuLuot, theoNgayTuLuot,
  sqlDongDo, danhGiaDong, luyKeQuyThoiGian, docThamSoLuyKe, khungLuyKe, thongTinFile, chuKyDuLieu, CHU_KY_TRONG, tinhTheoBcvhNgay, demLuotTheoBcvhNgay, tinhNgayGop, luyKeGop, ghepLuyKe
};
