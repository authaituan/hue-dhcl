// ==========================================
// VUHOI-2: tỷ lệ «Đã vu hồi» theo NGÀY ĐẾN và theo THÁNG (docs/ai/08_PHAT.md, 04_DECISIONS.md #107). Chỉ đọc DB, KHÔNG sửa số liệu khác.
// Tỷ lệ vu hồi = số SHBG PKTC có cờ vu hồi / số SHBG PKTC, cùng cách chọn bản nhập như ketQuaPhat (#92): P.GAN_CTE + P.NHAP_CTE + P.NHAP_ROW (không đổi),
// cờ lấy từ ĐÚNG dòng lịch sử đã chọn (r.sel = id phat_status_history) — nối thêm, không đổi tập hàng. Đợt đã hoàn tác bị loại sẵn trong NHAP_CTE.
// Máy chủ chỉ trả số + `hien_thi` (mã), KHÔNG trả chuỗi tiếng Việt; giao diện tự hiển thị.
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const den = require('./dashboardDenQuery');
const P = require('./phat');
const PD = require('./phatDashboard');
const C = require('../config/phat');
const { VALID_BCVH_CODES } = require('./userBcvh');

const { QueryParamError, DATE_RE, validYmd } = aq;
const HIEN_THI = Object.freeze({ CHUA_CO_SO_LIEU: 'CHUA_CO_SO_LIEU', SO_TUYET_DOI: 'SO_TUYET_DOI', TY_LE: 'TY_LE' });

/** Quy tắc hiển thị (thứ tự ưu tiên, #107): tử số 0 -> chưa có số liệu; mẫu số < ngưỡng -> số tuyệt đối; còn lại -> tỷ lệ (0..1, không làm tròn). */
function dung(pktc, daVuHoi) {
  if (daVuHoi === 0) return { pktc, da_vu_hoi: 0, ty_le: null, hien_thi: HIEN_THI.CHUA_CO_SO_LIEU };
  if (pktc < C.NGUONG_MAU_SO_VU_HOI) return { pktc, da_vu_hoi: daVuHoi, ty_le: null, hien_thi: HIEN_THI.SO_TUYET_DOI };
  return { pktc, da_vu_hoi: daVuHoi, ty_le: daVuHoi / pktc, hien_thi: HIEN_THI.TY_LE };
}

/** { pktc, da_vu_hoi } thô của MỘT BCVH, MỘT ngày đến (bản nhập được chọn theo #92). */
function demNgay(db, bcvh, day) {
  const f = den.windowFilter(bcvh, day, '23:59:59');
  const r = P.runGan(db, f, day, day,
    `SELECT COALESCE(SUM(r.tt0 = 'PKTC'), 0) AS pktc, COALESCE(SUM(r.tt0 = 'PKTC' AND h.da_vu_hoi = 1), 0) AS vh
     FROM (${P.NHAP_ROW}) r LEFT JOIN phat_status_history h ON h.id = r.sel`,
    { bcvh, x_day: day }, { them: P.NHAP_CTE, materialize: true })[0];
  return { pktc: r.pktc, da_vu_hoi: r.vh };
}

// Bộ nhớ đệm (đo ở cỡ 243.000 dòng: tháng toàn Trung tâm ~4 giây không cache). Khóa MỚI `vh1|BCVH|ngày` (không dùng `v3|` của phatDashboard). Vô hiệu: dấu hiệu DB đổi
// (PD.dauHieuDb = data_version + total_changes: bắt MỌI đường ghi — nhập phát, hoàn tác, nạp SFTP, thay thế / khôi phục, script — rộng hơn các sự kiện làm v3| mất hiệu lực)
// hoặc quá 10 phút (chốt an toàn như tầng 2 của phatDashboard). Chỉ lưu số thô { pktc, da_vu_hoi }; ngưỡng hiển thị đọc lúc gọi nên không cần vào khóa.
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const CACHE_MAX = 4000;
const cache = new Map();
let cacheDauHieu = null;
const xoaCache = () => { cache.clear(); cacheDauHieu = null; };

/** demNgay qua cache theo (BCVH, ngày). `dauHieu` = PD.dauHieuDb(db) lấy MỘT lần mỗi yêu cầu. */
function demNgayCoCache(db, bcvh, day, dauHieu, now = Date.now()) {
  if (cacheDauHieu !== dauHieu) { cache.clear(); cacheDauHieu = dauHieu; }
  const khoa = `vh1|${bcvh}|${day}`;
  const c = cache.get(khoa);
  if (c && now - c.luc < CACHE_MAX_AGE_MS) return c.kq;
  const kq = demNgay(db, bcvh, day);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(khoa, { luc: now, kq });
  return kq;
}

/** Tham số: bắt buộc `khoa` (ngay_den | thang) đúng định dạng; bcvh (một mã | all, mặc định all). Tham số lạ / lặp -> 400. */
function parse(query, khoa) {
  for (const k of Object.keys(query || {})) if (![khoa, 'bcvh'].includes(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  const one = (k) => {
    const v = query[k];
    if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
    return v === undefined ? '' : String(v).trim();
  };
  const b = one('bcvh') || 'all';
  if (b !== 'all' && !VALID_BCVH_CODES.includes(b)) throw new QueryParamError(`Tham số "bcvh" phải là "all" hoặc một trong: ${VALID_BCVH_CODES.join(', ')}`);
  const v = one(khoa);
  if (khoa === 'ngay_den') {
    const m = DATE_RE.exec(v);
    if (!m || !validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "ngay_den" là bắt buộc, dạng YYYY-MM-DD hợp lệ');
  } else {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (!m || !validYmd(+m[1], +m[2], 1)) throw new QueryParamError('Tham số "thang" là bắt buộc, dạng YYYY-MM hợp lệ');
  }
  return { bcvh: b, [khoa]: v };
}

const phamVi = (bcvh) => (bcvh === 'all' ? VALID_BCVH_CODES : [bcvh]);
const congDon = (ds) => dung(ds.reduce((a, x) => a + x.pktc, 0), ds.reduce((a, x) => a + x.da_vu_hoi, 0));
const nguong = () => C.NGUONG_MAU_SO_VU_HOI;

/** GET …/dashboard/vu-hoi?ngay_den=YYYY-MM-DD&bcvh=<mã|all> */
function vuHoiNgay(db, p) {
  const codes = phamVi(p.bcvh);
  const dauHieu = PD.dauHieuDb(db);
  const theoBcvh = codes.map((ma) => { const r = demNgayCoCache(db, ma, p.ngay_den, dauHieu); return { bcvh: ma, ...dung(r.pktc, r.da_vu_hoi) }; });
  const tong = congDon(theoBcvh);
  return { ngay_den: p.ngay_den, bcvh: p.bcvh, nguong_mau_so: nguong(), tong, theo_bcvh: theoBcvh };
}

/**
 * GET …/dashboard/vu-hoi-thang?thang=YYYY-MM&bcvh=<mã|all>. Tập ngày lấy bằng chính PD.ketQuaPhatThang (không viết lại điều kiện «có file» / «đủ số liệu»), `ngay` = ngày cuối tháng:
 *  - Một mã BCVH (VUHOI-2a): các ngày `du_so_lieu` của chính BCVH đó.
 *  - `all` (VUHOI-2c): D_all = các ngày `du_so_lieu` của ket-qua-phat-thang(all) (đủ số liệu xét trên tập GỘP). Mỗi BCVH chỉ đóng góp ở các ngày thuộc D_all mà chính nó có file
 *    (`mau_so` ngày đó > 0 trong theo_ngay riêng của BCVH). `tong`, `theo_bcvh`, `theo_ngay` cùng D_all nên Σ theo_bcvh = tong; số của một BCVH trong `all` có thể khác khi gọi riêng BCVH đó.
 * `theo_ngay` liệt kê MỌI ngày của tháng như ket-qua-phat-thang, thêm `du_so_lieu`; ngày bị loại = 0/0 CHUA_CO_SO_LIEU.
 */
function vuHoiThang(db, p) {
  const codes = phamVi(p.bcvh);
  const ngays = [];
  for (let d = `${p.thang}-01`; d.slice(0, 7) === p.thang; d = aq.addDays(d, 1)) ngays.push(d);
  const cuoi = ngays[ngays.length - 1];
  const dauHieu = PD.dauHieuDb(db);
  const dAll = p.bcvh === 'all'
    ? new Set(PD.ketQuaPhatThang(db, codes, { bcvh: 'all', ngay: cuoi }).theo_ngay.filter((x) => x.du_so_lieu).map((x) => x.ngay))
    : null;
  const sum = new Map(codes.map((ma) => [ma, { pktc: 0, da_vu_hoi: 0 }]));
  const ngay = new Map(ngays.map((d) => [d, { pktc: 0, da_vu_hoi: 0, du: false }]));
  for (const ma of codes) {
    const rieng = PD.ketQuaPhatThang(db, [ma], { bcvh: ma, ngay: cuoi }).theo_ngay;
    const hopLe = dAll ? rieng.filter((x) => dAll.has(x.ngay) && x.mau_so > 0) : rieng.filter((x) => x.du_so_lieu);
    for (const { ngay: d } of hopLe) {
      if (!ngay.has(d)) continue; // theo_ngay của ket-qua-phat-thang chỉ trong tháng của `ngay`; chốt thêm cho chắc
      const r = demNgayCoCache(db, ma, d, dauHieu);
      const n = ngay.get(d);
      n.pktc += r.pktc; n.da_vu_hoi += r.da_vu_hoi; n.du = true;
      sum.get(ma).pktc += r.pktc; sum.get(ma).da_vu_hoi += r.da_vu_hoi;
    }
  }
  const theoNgay = ngays.map((d) => { const n = ngay.get(d); return { ngay_den: d, du_so_lieu: dAll ? dAll.has(d) : n.du, ...dung(n.pktc, n.da_vu_hoi) }; });
  const theoBcvh = codes.map((ma) => ({ bcvh: ma, ...dung(sum.get(ma).pktc, sum.get(ma).da_vu_hoi) }));
  return { thang: p.thang, bcvh: p.bcvh, nguong_mau_so: nguong(), tong: congDon([...sum.values()]), theo_bcvh: theoBcvh, theo_ngay: theoNgay };
}

module.exports = { HIEN_THI, dung, demNgay, parse, vuHoiNgay, vuHoiThang, xoaCache };
