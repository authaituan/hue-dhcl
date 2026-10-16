// ==========================================
// GET /api/arrivals/dashboard/ket-qua-phat (PHAT-3b, docs/ai/04_DECISIONS.md #79): kết quả phát đã sẵn sàng hiển thị cho Dashboard
// «Điều hành hôm nay». Tính toán DÙNG LẠI của /api/phat/ty-le (phat.demNgay + phat.dungTyLe — cùng mẫu số, cùng 5 trạng thái, cùng mức cập nhật);
// KHÔNG có khung giờ và «tồn chờ» (đắt, chưa cần — xem 08_PHAT.md). Chỉ đọc DB.
//  - «Hôm nay» của MỖI BCVH = ngày file OK mới nhất của BCVH đó (như tong-quan-den, #70); `ngay` ép một ngày chung.
//  - co_so_lieu_phat / so_lieu_den_luc tính THEO NGÀY: chỉ xét SHBG đến ngày đó có dòng trạng thái; ngày chưa ai nhập -> false / null
//    (không mượn giờ của đợt nhập ngày khác như /ty-le).
//  - Xếp hạng BCVH: theo PTC giảm dần trên cả mẫu số; BCVH mẫu số dưới sàn hoặc chưa nhập trong ngày -> «chưa đủ dữ liệu», không xếp cuối.
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const P = require('./phat');
const CF = require('./phatConfig');
const { bcvhNames } = require('./dashboardQuery');
const { VALID_BCVH_CODES } = require('./userBcvh');

const { QueryParamError, DATE_RE, validYmd } = aq;
const LY_DO = Object.freeze({ CHUA_NHAP: 'chua_nhap', DUOI_SAN: 'duoi_san' });
// 4 trạng thái còn lại ngoài PTC (đã có ở khoá `ptc`), thêm vào từng phần tử xếp hạng (PHAT-3b-1).
const TT_KHAC = Object.freeze(['PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT']);

/** Tham số: bcvh (một mã trong 6 BCVH | all, mặc định all), ngay (YYYY-MM-DD, mặc định ngày file OK mới nhất của từng BCVH). Tham số lạ / lặp -> 400. */
function parseParams(query) {
  for (const k of Object.keys(query || {})) if (!['bcvh', 'ngay'].includes(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  const one = (k) => {
    const v = query[k];
    if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
    return v === undefined ? '' : String(v).trim();
  };
  const b = one('bcvh') || 'all';
  if (b !== 'all' && !VALID_BCVH_CODES.includes(b)) throw new QueryParamError(`Tham số "bcvh" phải là "all" hoặc một trong: ${VALID_BCVH_CODES.join(', ')}`);
  const d = one('ngay');
  if (d) {
    const m = DATE_RE.exec(d);
    if (!m || !validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "ngay" phải là ngày hợp lệ dạng YYYY-MM-DD');
  }
  return { bcvh: b, ngay: d || null };
}

/** Kết quả phát của MỘT BCVH, MỘT ngày đến (day = null: BCVH chưa có file nào -> mọi số 0). */
function motBcvh(db, ma, day) {
  const d = day ? P.demNgay(db, ma, day) : { tong: P.zeroMap(), khung: null, co_tt: 0, nhap_luc_max: null };
  return { ma, day, ...d, ty_le: P.dungTyLe(d.tong) };
}

/** Xếp hạng theo PTC giảm dần (đồng hạng: cùng hạng, hạng kế tiếp nhảy cách — 1, 2, 2, 4; hòa thì theo mã BCVH). Chỉ BCVH đủ điều kiện. */
function xepHang(rows, names) {
  const ok = rows.filter((r) => r.ly_do === null).sort((a, b) => (b.ptc - a.ptc) || (a.ma < b.ma ? -1 : 1));
  let hang = 0;
  return ok.map((r, i) => {
    if (i === 0 || r.ptc !== ok[i - 1].ptc) hang = i + 1;
    return { bcvh: r.ma, ten: names.get(r.ma), mau_so: r.mau_so, ptc: r.ptc, hang, theo_trang_thai: r.khac };
  });
}

/**
 * codes: BCVH trong phạm vi được xem (đã giao với bộ lọc `bcvh` và quyền ở route). p: kết quả parseParams.
 * Phạm vi có từ 2 BCVH mới trả xep_hang_bcvh / chua_du_du_lieu (còn lại: null).
 */
function ketQuaPhat(db, codes, p) {
  const names = bcvhNames(db);
  const byUnit = aq.latestFileDates(db);
  const per = codes.map((ma) => motBcvh(db, ma, p.ngay || aq.latestFileDate(db, [ma], byUnit)));

  // DASH-7e: tổng (bcvh=all, không chọn ngày) chỉ cộng BCVH đúng ngày chung (P.tapNgayChung); xếp hạng và cung_ngay vẫn xét mọi BCVH theo ngày riêng.
  const tap = p.bcvh === 'all' ? P.tapNgayChung(byUnit, codes, p.ngay) : null;
  const perTong = tap ? per.filter((r) => tap.trong.includes(r.ma)) : per;
  const so = P.zeroMap();
  let coTt = 0;
  let nhapLuc = null;
  for (const r of perTong) {
    P.congMap(so, r.tong);
    coTt += r.co_tt;
    if (r.nhap_luc_max && (!nhapLuc || r.nhap_luc_max > nhapLuc)) nhapLuc = r.nhap_luc_max;
  }
  const tong = P.dungTyLe(so);
  const days = [...new Set(per.map((r) => r.day).filter(Boolean))].sort();
  const coSoLieu = coTt > 0;

  let xep = null;
  let chuaDu = null;
  if (codes.length >= 2) {
    // Dưới sàn xét TRƯỚC: mẫu số nhỏ thì «chưa nhập» không còn là lý do để bắt nhập; mẫu số 0 (BCVH chưa có hàng đến) cũng là dưới sàn.
    const xet = per.map((r) => ({
      ma: r.ma, mau_so: r.ty_le.mau_so, ptc: r.ty_le.theo_trang_thai.PTC.ty_le,
      khac: Object.fromEntries(TT_KHAC.map((m) => [m, r.ty_le.theo_trang_thai[m]])), // cùng dạng {nhan, so, ty_le} và cùng mẫu số với `ptc`
      ly_do: r.ty_le.mau_so < CF.SAN_XEP_HANG_BCVH ? LY_DO.DUOI_SAN : (r.co_tt === 0 ? LY_DO.CHUA_NHAP : null)
    }));
    xep = xepHang(xet, names);
    chuaDu = xet.filter((r) => r.ly_do !== null).map((r) => ({ bcvh: r.ma, ten: names.get(r.ma), mau_so: r.mau_so, ly_do: r.ly_do }));
  }

  return {
    bcvh: p.bcvh,
    pham_vi: codes,
    ngay: p.ngay || (days.length ? days[days.length - 1] : null),
    cung_ngay: days.length <= 1,
    ...(tap ? { so_bcvh_trong_tong: tap.trong.length, bcvh_ngoai_tong: tap.ngoai } : {}),
    mau_so: tong.mau_so,
    theo_trang_thai: tong.theo_trang_thai,
    ptc: tong.theo_trang_thai.PTC.ty_le,
    muc_cap_nhat: tong.muc_cap_nhat,
    co_so_lieu_phat: coSoLieu,
    so_lieu_den_luc: coSoLieu ? nhapLuc : null,
    so_lieu_den_luc_bangkok: coSoLieu ? P.gioBangkok(nhapLuc) : null,
    nguong: { ptc_dat: CF.NGUONG_PTC_DAT, chua_co_tt_canh_bao: CF.NGUONG_CHUA_CO_TT_CANH_BAO, san_xep_hang_bcvh: CF.SAN_XEP_HANG_BCVH },
    xep_hang_bcvh: xep,
    chua_du_du_lieu: chuaDu
  };
}

module.exports = { parseParams, ketQuaPhat, LY_DO };
