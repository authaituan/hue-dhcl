// ==========================================
// GET /api/arrivals/dashboard/ket-qua-phat (PHAT-3b, docs/ai/04_DECISIONS.md #79): kết quả phát đã sẵn sàng hiển thị cho Dashboard
// «Điều hành hôm nay». Tính toán DÙNG LẠI của /api/phat/ty-le (phat.demNgay + phat.dungTyLe — cùng mẫu số, cùng 5 trạng thái, cùng mức cập nhật);
// KHÔNG có khung giờ và «tồn chờ» (đắt, chưa cần — xem 08_PHAT.md). Chỉ đọc DB.
// DASH-12b-3 (#92): trạng thái của MỖI LẦN ĐẾN theo LỊCH SỬ NHẬP (bản nhập cuối có ngày nhập VN D <= N < D'), không còn «trạng thái hiện tại» — xem phat.js (GAN_JOIN_NHAP).
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

/** DASH-12b-3: «đủ số liệu» của một kết quả dungTyLe: có hàng đến và tỷ lệ «Chưa có thông tin phát» < ngưỡng cảnh báo (0,10). */
function duSoLieu(t) {
  const c = t.theo_trang_thai.CHUA_CO_TT.ty_le;
  return t.mau_so > 0 && c !== null && c < CF.NGUONG_CHUA_CO_TT_CANH_BAO;
}

/** Kết quả phát của MỘT BCVH, MỘT ngày đến (day = null: BCVH chưa có file nào -> mọi số 0). */
function motBcvh(db, ma, day) {
  const d = day ? P.demNgay(db, ma, day, { demLoaiBo: true, theoLichSu: true }) : { tong: P.zeroMap(), khung: null, co_tt: 0, nhap_luc_max: null, loai_bo: 0 };
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
  let loaiBo = 0;
  for (const r of perTong) {
    P.congMap(so, r.tong);
    loaiBo += r.loai_bo;
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
    so_shbg_chuyen_tiep_loai_bo: loaiBo, // DASH-7f (xem phat.tyLeApi)
    theo_trang_thai: tong.theo_trang_thai,
    ptc: tong.theo_trang_thai.PTC.ty_le,
    muc_cap_nhat: tong.muc_cap_nhat,
    co_so_lieu_phat: coSoLieu,
    du_so_lieu: duSoLieu(tong), // DASH-12b-3: ngày đủ số liệu = mẫu số > 0 và «Chưa có TT» < NGUONG_CHUA_CO_TT_CANH_BAO
    so_lieu_den_luc: coSoLieu ? nhapLuc : null,
    so_lieu_den_luc_bangkok: coSoLieu ? P.gioBangkok(nhapLuc) : null,
    nguong: { ptc_dat: CF.NGUONG_PTC_DAT, chua_co_tt_canh_bao: CF.NGUONG_CHUA_CO_TT_CANH_BAO, san_xep_hang_bcvh: CF.SAN_XEP_HANG_BCVH },
    xep_hang_bcvh: xep,
    chua_du_du_lieu: chuaDu
  };
}

// ==========================================
// DASH-12b: GET /api/arrivals/dashboard/ket-qua-phat-thang — kết quả phát TỪ ĐẦU THÁNG (lũy kế + chuỗi theo ngày + chênh lệch). Không đổi ketQuaPhat.
//  - «Tháng» = tháng chứa NGÀY DỮ LIỆU (ngày của thẻ ngày: p.ngay hoặc ngày file OK mới nhất; bcvh=all: ngày chung — P.tapNgayChung). Khoảng [YYYY-MM-01, ngày].
//    Ngày 01 mà file chưa về -> ngày dữ liệu vẫn thuộc tháng trước -> lũy kế vẫn là tháng trước (trả `thang` để giao diện ghi rõ).
//  - TỪNG ngày gọi P.demNgay (đúng như thẻ ngày) rồi CỘNG theo mã trạng thái; tỷ lệ tháng = tổng tử / tổng mẫu. KHÔNG truy vấn một khoảng ngày:
//    buildCountedCte gom mỗi SHBG một dòng trên cả khoảng nên SHBG đến hai ngày sẽ chỉ được đếm một lần (không khớp thẻ ngày).
//  - DASH-12b-3 (#92, thay #91-1): số của mỗi ngày đến dựng từ LỊCH SỬ NHẬP (demNgay theoLichSu): lần đến D của một SHBG lấy bản nhập cuối có ngày nhập VN N,
//    D <= N < D' (D' = lần đến kế tiếp). Nhập muộn vẫn tính cho ngày đến tương ứng, không đổi số các lần đến khác.
//  - Ngày của một BCVH chỉ xét khi BCVH có file OK với file_date = ngày đó (như #73). Ngày «đủ số liệu» (duSoLieu trên TẬP BCVH gộp của ngày: mẫu số > 0 và
//    «Chưa có TT» < NGUONG_CHUA_CO_TT_CANH_BAO) mới vào lũy kế; ngày chưa đủ bị loại cả tử lẫn mẫu, tỷ lệ trong `theo_ngay` là null (giao diện ngắt đường).
//  - bcvh=all không chọn ngày: tập BCVH = tap.trong của NGÀY CHUNG (khớp thẻ ngày), dùng cho MỌI ngày của tháng để so cùng tập.
//  - Cache trong bộ nhớ, HAI tầng: toàn kết quả (60 giây + chuKyDuLieu) và từng (BCVH, ngày) (chuKyTheoNgay) — xem ketQuaPhatThang / demNgayCoCache.
// ==========================================
const CACHE_MS = 60 * 1000;
const CACHE_MAX = 64;
const cache = new Map();
// Tầng 2 (DASH-12b-2): cache theo TỪNG (BCVH, ngày) với chữ ký riêng — khi dữ liệu đổi chỉ tính lại ngày / BCVH bị ảnh hưởng.
const DAY_CACHE_MAX = 4000;
const DAY_CACHE_MAX_AGE_MS = 10 * 60 * 1000; // chốt an toàn: chữ ký không bắt được thay đổi hiếm (vd dùng lại id) -> tối đa 10 phút
const dayCache = new Map();
const xoaCachePhatThang = () => { cache.clear(); dayCache.clear(); sigMemo.tok = null; };
const xoaTang1PhatThang = () => { cache.clear(); }; // chỉ để test: buộc dựng lại từ tầng 2 (kiểm riêng chữ ký theo ngày)
const demNgayDaDem = { n: 0 }; // đếm số lần gọi demNgay thật (test / đo), không ảnh hưởng nghiệp vụ
const CF_TT = ['PTC', 'PKTC', 'CHUYEN_HOAN', 'LAC_HUONG', 'CHUA_CO_TT'];

/** Chữ ký trạng thái dữ liệu: đổi khi có đợt nhập phát mới (id, nhap_luc), hoàn tác (hoan_tac_luc) hoặc file / dòng hàng đến mới. */
/**
 * DẤU HIỆU «DB ĐÃ ĐỔI» (DASH-12b-4, yêu cầu nghiệm thu: chữ ký tính từ TRẠNG THÁI TRONG DB, không từ bộ đếm trong tiến trình):
 *  - `PRAGMA data_version`: đổi khi một KẾT NỐI KHÁC ghi vào file DB (scripts/*.js chạy tiến trình riêng, tiến trình máy chủ thứ hai...);
 *  - `total_changes()`: số dòng kết nối NÀY đã ghi (nạp SFTP, «Thay thế ngày», «Khôi phục», nhập phát, hoàn tác... chạy trong tiến trình máy chủ).
 * Hai số cùng nhau bắt MỌI đường ghi (kể cả ghi vào bảng không liên quan: vô hiệu rộng hơn, chấp nhận). Rẻ (O(1)): dùng làm khoá tầng 1 và làm nhãn của bộ nhớ đệm chữ ký.
 */
function dauHieuDb(db) {
  const dv = db.pragma('data_version', { simple: true });
  const tc = db.prepare('SELECT total_changes() AS n').get().n;
  return `${dv}.${tc}`;
}

/**
 * Bộ nhớ đệm các chữ ký tính từ DB (đắt hơn dấu hiệu nhưng chỉ tính lại khi dấu hiệu đổi). Mỗi chữ ký tính LƯỜI, từng (ngày) / (BCVH) / (BCVH, ngày) một truy vấn
 * ngắn — để khởi động nóng chia được thành các lát ngắn và nhường vòng lặp sự kiện giữa các lát.
 *  - sigNgay(d): dữ liệu ĐẾN của ngày d của MỌI BCVH (quy tắc gán DASH-7f xét tranh chấp giữa các BCVH): số dòng, tổng id, tổng giờ đến (arrival_at), tổng ký tự cơ sở —
 *    bắt thêm / xoá / khôi phục dòng VÀ sửa tại chỗ (scripts/rederive-arrival.js UPDATE arrival_at / arrival_at_basis / arrival_date);
 *  - sigLai(b, d): ngày đến kế tiếp D' của các SHBG đến ngày d tại b («đến lại»): số dòng đến sau, tổng id, tổng ngày của các dòng đó;
 *  - sigDot(b): trạng thái phát của b: phat_batches (số, id lớn nhất, nhap_luc lớn nhất, hoan_tac_luc lớn nhất, tổng id đợt hoàn tác) + phat_status_history (số, tổng id, id lớn nhất);
 *  - sigFile(d): file hàng đến của mọi BCVH có file_date trong [d − 1, d + 3] (kiểm tra hợp lý arrival_date ∈ [ngày file − 3, + 1]): số, tổng id, imported_at lớn nhất, đếm theo trạng thái.
 */
const sigMemo = { tok: null, ngay: new Map(), lai: new Map(), dot: new Map(), file: new Map() };
function memoSig(db) {
  const tok = dauHieuDb(db);
  if (sigMemo.tok !== tok) { sigMemo.tok = tok; sigMemo.ngay.clear(); sigMemo.lai.clear(); sigMemo.dot.clear(); sigMemo.file.clear(); }
  return sigMemo;
}
const SIG_AT = "COALESCE(SUM(CAST(strftime('%s', arrival_at) AS INTEGER)), 0)";
function sigNgay(db, d) {
  const m = memoSig(db);
  if (!m.ngay.has(d)) {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s, ${SIG_AT} AS t, COALESCE(SUM(unicode(arrival_at_basis)), 0) AS b FROM arrival_items WHERE arrival_date = @d`).get({ d });
    m.ngay.set(d, `${r.n}.${r.s}.${r.t}.${r.b}`);
  }
  return m.ngay.get(d);
}
function sigLai(db, ma, d) {
  const m = memoSig(db);
  const k = `${ma}|${d}`;
  if (!m.lai.has(k)) {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(a2.id), 0) AS s, COALESCE(SUM(CAST(replace(a2.arrival_date, '-', '') AS INTEGER)), 0) AS t
      FROM arrival_items a1 JOIN arrival_items a2 INDEXED BY ix_arrival_items_tracking ON a2.receiver_code = a1.receiver_code AND a2.tracking_no = a1.tracking_no AND a2.arrival_date > a1.arrival_date
      WHERE a1.receiver_code = @ma AND a1.arrival_date = @d`).get({ ma, d }); // INDEXED BY: không gợi ý thì SQLite chọn quét ix_arrival_items_recv_date cho a2 (đo: 52 giây / ngày ở 744.000 dòng, so với 2 ms)
    m.lai.set(k, `${r.n}.${r.s}.${r.t}`);
  }
  return m.lai.get(k);
}
function sigDot(db, ma) {
  const m = memoSig(db);
  if (!m.dot.has(ma)) {
    const b = db.prepare("SELECT COUNT(*) AS n, MAX(id) AS i, MAX(nhap_luc) AS t, MAX(hoan_tac_luc) AS h, COALESCE(SUM(CASE WHEN trang_thai = 'da_hoan_tac' THEN id END), 0) AS u FROM phat_batches WHERE bcvh = @ma").get({ ma });
    const h = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s, MAX(id) AS i FROM phat_status_history WHERE bcvh = @ma').get({ ma });
    m.dot.set(ma, `${b.n}.${b.i}.${b.t}.${b.h}.${b.u}/${h.n}.${h.s}.${h.i}`);
  }
  return m.dot.get(ma);
}
function sigFile(db, d) {
  const m = memoSig(db);
  if (!m.file.has(d)) {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(id), 0) AS s, MAX(imported_at) AS t, COALESCE(SUM(unicode(status)), 0) AS u FROM arrival_import_files WHERE file_date BETWEEN @a AND @b`)
      .get({ a: aq.addDays(d, -1), b: aq.addDays(d, 3) });
    m.file.set(d, `${r.n}.${r.s}.${r.t}.${r.u}`);
  }
  return m.file.get(d);
}

/** Tròn nửa lên về 0,1 điểm phần trăm, trả SỐ NGUYÊN đơn vị 0,1 (từ tỷ lệ 4 chữ số `ratio4`, đúng giá trị giao diện hiển thị: ty_le × 100 làm tròn 1 chữ số). */
const dec1 = (tyLe) => (tyLe === null || tyLe === undefined ? null : Math.floor((Math.round(tyLe * 10000) + 5) / 10));
/** Chênh (hôm nay − lũy kế) theo giá trị ĐÃ LÀM TRÒN hiển thị: { chenh_diem (điểm), huong } hoặc null nếu thiếu tỷ lệ. */
function chenhHienThi(tyLeHomNay, tyLeLuyKe) {
  const a = dec1(tyLeHomNay);
  const b = dec1(tyLeLuyKe);
  if (a === null || b === null) return null;
  const d = a - b; // số nguyên (đơn vị 0,1 điểm): không sai số dấu phẩy động
  return { chenh_diem: d / 10, huong: Math.abs(d) < CF.NGUONG_NGANG_DIEM * 10 ? 'ngang' : d > 0 ? 'tang' : 'giam' };
}

/**
 * Chữ ký của (BCVH b, ngày d) = hợp của MỌI thứ ảnh hưởng kết quả demNgay(b, d, theoLichSu): dữ liệu đến của d (mọi BCVH), «đến lại» sau d của các SHBG của d tại b,
 * trạng thái phát của b, file hàng đến quanh d. Nghi ngờ thì rộng hơn: thêm / xoá / khôi phục / sửa tại chỗ bất kỳ dòng nào của ngày d, bất kỳ đợt nhập / hoàn tác nào của b.
 * Tính lười + nhớ theo dấu hiệu DB (xem sigMemo); `chuKyTheoNgay` giữ hình dạng cũ ({ ngay(ma, d), dot(ma) }) cho demNgayCoCache.
 */
function chuKyTheoNgay(db) {
  return { ngay: (ma, d) => `${sigNgay(db, d)}#${sigLai(db, ma, d)}#${sigFile(db, d)}`, dot: (ma) => sigDot(db, ma) };
}

/** P.demNgay(ma, d) (chỉ lấy tong + co_tt) qua cache theo (BCVH, ngày); chữ ký đổi hoặc quá DAY_CACHE_MAX_AGE_MS thì tính lại. */
function demNgayCoCache(db, ma, d, ky, now) {
  const khoa = `v3|${ma}|${d}`; // v3: quy tắc nhập DASH-12b-3 (đổi khoá để không dùng lại kết quả theo quy tắc cũ)
  const chuKy = `${ky.ngay(ma, d)}#${ky.dot(ma)}`;
  const c = dayCache.get(khoa);
  if (c && c.chuKy === chuKy && now - c.luc < DAY_CACHE_MAX_AGE_MS) return c.kq;
  demNgayDaDem.n += 1;
  const r = P.demNgay(db, ma, d, { theoLichSu: true });
  const kq = { tong: r.tong, co_tt: r.co_tt };
  if (dayCache.size >= DAY_CACHE_MAX) dayCache.clear();
  dayCache.set(khoa, { chuKy, luc: now, kq });
  return kq;
}

/** Phần chuẩn bị dùng chung của tinhThang và khoiDongNong: ngày dữ liệu, tập BCVH, danh sách ngày của tháng, file có mặt, chữ ký theo ngày. */
function chuanBiThang(db, codes, p) {
  const byUnit = aq.latestFileDates(db);
  let ngay = p.ngay;
  let trong = codes;
  let tap = null;
  if (p.bcvh === 'all') {
    tap = P.tapNgayChung(byUnit, codes, p.ngay);
    ngay = tap.ngay_chung;
    trong = tap.trong;
  } else if (!ngay) {
    ngay = byUnit.get(codes[0]) || null;
  }
  if (!ngay) return { ngay: null, trong, tap };
  const tu = `${ngay.slice(0, 7)}-01`;
  const ngays = [];
  for (let d = tu; d <= ngay; d = aq.addDays(d, 1)) ngays.push(d);
  const files = new Set(db.prepare(`SELECT unit_code AS ma, file_date AS d FROM arrival_import_files
    WHERE status = 'OK' AND file_date BETWEEN @a AND @b AND unit_code IN (SELECT value FROM json_each(@j))`)
    .all({ a: tu, b: ngay, j: JSON.stringify(trong) }).map((r) => `${r.ma}|${r.d}`));
  return { ngay, trong, tap, tu, ngays, files, chuKyNgay: chuKyTheoNgay(db) };
}

function tinhThang(db, codes, p, { cache: dungCache = true } = {}) {
  const nguong = {
    ptc_dat: CF.NGUONG_PTC_DAT, chua_co_tt_canh_bao: CF.NGUONG_CHUA_CO_TT_CANH_BAO,
    nguong_ngang_diem: CF.NGUONG_NGANG_DIEM, so_ngay_toi_thieu_so_sanh: CF.SO_NGAY_TOI_THIEU_SO_SANH, san_mau_so_so_sanh: CF.SAN_MAU_SO_SO_SANH
  };
  const { ngay, trong, tap, tu, ngays, files, chuKyNgay } = chuanBiThang(db, codes, p);
  const dau = { bcvh: p.bcvh, pham_vi: codes, ngay, thang: ngay ? ngay.slice(0, 7) : null };
  const tapInfo = tap && !p.ngay ? { so_bcvh_trong_tong: tap.trong.length, bcvh_ngoai_tong: tap.ngoai } : {};
  if (!ngay) return { ...dau, hom_nay: null, luy_ke: null, theo_ngay: [], chenh: null, nguong };
  const now = Date.now();

  const luy = P.zeroMap();
  let soNgaySo = 0;
  let soNgayFile = 0;
  let homNay = null;
  const theoNgay = ngays.map((d) => {
    const so = P.zeroMap();
    let coTt = 0;
    let coFile = false;
    for (const ma of trong) {
      if (!files.has(`${ma}|${d}`)) continue; // BCVH không có file ngày này: không đóng góp
      coFile = true;
      const r = dungCache ? demNgayCoCache(db, ma, d, chuKyNgay, now) : P.demNgay(db, ma, d, { theoLichSu: true });
      P.congMap(so, r.tong);
      coTt += r.co_tt;
    }
    if (coFile) soNgayFile += 1;
    const t = P.dungTyLe(so);
    const duSo = duSoLieu(t); // DASH-12b-3: đủ số liệu trên tập BCVH gộp của ngày (thay co_tt > 0)
    if (duSo) { P.congMap(luy, so); soNgaySo += 1; }
    const tl = (m) => (duSo ? t.theo_trang_thai[m].ty_le : null);
    if (d === ngay) homNay = { t, duSo };
    return {
      ngay: d, mau_so: t.mau_so, ptc: tl('PTC'), ty_le_pktc: tl('PKTC'), ty_le_chuyen_hoan: tl('CHUYEN_HOAN'),
      ty_le_lac_huong: tl('LAC_HUONG'), ty_le_chua_co_tt: tl('CHUA_CO_TT'), co_so_lieu_phat: coTt > 0, du_so_lieu: duSo
    };
  });
  const tk = P.dungTyLe(luy);
  const luyKe = {
    thang: ngay.slice(0, 7), tu_ngay: tu, den_ngay: ngay, mau_so: tk.mau_so,
    theo_trang_thai: Object.fromEntries(CF_TT.map((m) => [m, { nhan: tk.theo_trang_thai[m].nhan, so: tk.theo_trang_thai[m].so, ty_le: tk.theo_trang_thai[m].ty_le }])),
    so_ngay_co_so_lieu: soNgaySo, so_ngay_co_file: soNgayFile, so_ngay_trong_khoang: ngays.length
  };
  // Chênh: chỉ khi đủ ngày có số liệu, hôm nay có số liệu phát và mẫu số hôm nay >= sàn; nếu không null (backend không quyết tốt / xấu).
  let chenh = null;
  if (homNay && homNay.duSo && soNgaySo >= CF.SO_NGAY_TOI_THIEU_SO_SANH && homNay.t.mau_so >= CF.SAN_MAU_SO_SO_SANH && tk.mau_so > 0) {
    chenh = Object.fromEntries(CF_TT.map((m) => [m, chenhHienThi(homNay.t.theo_trang_thai[m].ty_le, tk.theo_trang_thai[m].ty_le)]));
  }
  const hom = { ngay, du_so_lieu: !!(homNay && homNay.duSo), mau_so: homNay ? homNay.t.mau_so : 0 };
  return { ...dau, ...tapInfo, hom_nay: hom, luy_ke: luyKe, theo_ngay: theoNgay, chenh, nguong };
}

/**
 * codes / p như ketQuaPhat. Cache 60 giây theo (bcvh, ngay) VÀ dấu hiệu DB (dauHieuDb): bất kỳ đường ghi nào (SFTP, thay thế / khôi phục, nhập phát, hoàn tác, script) -> dựng lại ngay (tầng 2 chỉ tính lại ngày có chữ ký đổi).
 * opts.cache = false: không dùng cache (kịch bản đo). opts.now: chỉ để test.
 */
function ketQuaPhatThang(db, codes, p, { cache: dung = true, now = Date.now() } = {}) {
  if (!dung) return tinhThang(db, codes, p, { cache: false });
  const khoa = `${p.bcvh}|${p.ngay || ''}`;
  const chuKy = dauHieuDb(db);
  const c = cache.get(khoa);
  if (c && c.chuKy === chuKy && now - c.luc < CACHE_MS) return c.data;
  const data = tinhThang(db, codes, p);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(khoa, { chuKy, luc: now, data });
  return data;
}

/**
 * DASH-12b-4 — KHỞI ĐỘNG NÓNG: tính sẵn (chữ ký rồi cache tầng 2, tầng 1) tháng của `bcvh=all` và của từng BCVH, KHÔNG chặn máy chủ. Việc chia thành các LÁT ngắn:
 * mỗi lát là MỘT truy vấn (một chữ ký của một ngày / BCVH / (BCVH, ngày), hoặc một demNgay) rồi nhường vòng lặp sự kiện (`nghi`, mặc định setImmediate), nên yêu cầu khác
 * chen vào giữa các lát; không có lát nào dài hơn một truy vấn ngày (~vài chục - ~140 ms ở cỡ 744.000 dòng). `dung()` trả true thì dừng sớm (tắt máy chủ).
 * Kết quả đúng vì dùng đúng đường tính + chữ ký như yêu cầu thật (chữ ký đổi giữa chừng thì lát sau tự tính lại). Lỗi bị nuốt (trả qua `loi`).
 * Trả { so_ngay_bcvh_tinh, so_lat, ms, loi }.
 */
async function khoiDongNong(db, { nghi = (f) => setImmediate(f), dung = () => false } = {}) {
  const t0 = Date.now();
  const c0 = demNgayDaDem.n;
  let soLat = 0;
  const lat = async () => { soLat += 1; await new Promise((r) => nghi(r)); };
  let loi = null;
  try {
    const dsp = [{ bcvh: 'all', ngay: null, codes: VALID_BCVH_CODES }, ...VALID_BCVH_CODES.map((ma) => ({ bcvh: ma, ngay: null, codes: [ma] }))];
    for (const p of dsp) {
      if (dung()) break;
      const kh = chuanBiThang(db, p.codes, p);
      if (!kh.ngay) continue;
      for (const d of kh.ngays) { if (dung()) break; sigNgay(db, d); await lat(); sigFile(db, d); await lat(); }
      for (const ma of kh.trong) {
        if (dung()) break;
        sigDot(db, ma); await lat();
        for (const d of kh.ngays) {
          if (dung()) break;
          if (!kh.files.has(`${ma}|${d}`)) continue;
          sigLai(db, ma, d); await lat();
          demNgayCoCache(db, ma, d, kh.chuKyNgay, Date.now()); await lat();
        }
      }
      if (!dung()) ketQuaPhatThang(db, p.codes, p); // dựng + lưu tầng 1 (mọi ngày đã nằm trong tầng 2; chỉ ghép + so sánh)
    }
  } catch (err) {
    loi = err && err.message ? err.message : String(err);
  }
  return { so_ngay_bcvh_tinh: demNgayDaDem.n - c0, so_lat: soLat, ms: Date.now() - t0, loi };
}

module.exports = { parseParams, ketQuaPhat, ketQuaPhatThang, khoiDongNong, xoaCachePhatThang, xoaTang1PhatThang, chenhHienThi, dec1, duSoLieu, LY_DO, soLanDemNgay: () => demNgayDaDem.n };
