// ==========================================
// Dashboard điều hành (SANLUONG-3e): tình hình hôm nay của 6 BCVH, điểm cần điều hành, xu hướng, phường/xã tăng, tổng hợp Trung tâm.
// Chỉ đọc DB. KHÔNG cài quy tắc đếm thứ hai: mọi con số đi qua buildCountedCte() của server/lib/arrivalsQuery.js
// (SHBG khác nhau, đếm 1 lần tại lần đến sớm nhất TRONG khoảng; ở đây mỗi ngày là một khoảng riêng 00:00 → as_of).
// Quyết định nghiệp vụ: docs/ai/04_DECISIONS.md #41–#47. Điểm cần điều hành (lãnh đạo) KHÁC cảnh báo dữ liệu ADMIN-only (#34).
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const { QueryParamError, DATE_RE, validYmd, addDays, pct2 } = aq;

// 6 BCVH của Trung tâm (PO 08–09/10/2026, #41). Tên lấy từ post_offices theo mã nếu khớp; không khớp dùng tên dưới đây.
const DASHBOARD_BCVH = Object.freeze([
  Object.freeze({ ma: '533140', ten: 'BCVH Thuận Hóa' }),
  Object.freeze({ ma: '535470', ten: 'BCVH Hương Trà' }),
  Object.freeze({ ma: '536250', ten: 'BCVH Hương Thủy' }),
  Object.freeze({ ma: '537015', ten: 'BCVH Thuận An' }),
  Object.freeze({ ma: '537220', ten: 'BCVH Phú Lộc' }),
  Object.freeze({ ma: '535790', ten: 'BCVH A Lưới' })
]);
const BCVH_CODES = DASHBOARD_BCVH.map((b) => b.ma);

// Ngưỡng "điểm cần điều hành" (#45). MỘT đối tượng cấu hình; ADMIN chỉnh trên giao diện ở ticket sau (cần bảng cấu hình).
// Ngưỡng và định nghĩa "xác nhận chậm" là TẠM, PO xem lại sau ~2 tuần dữ liệu thật. Mọi so sánh dùng ">=".
const DASHBOARD_THRESHOLDS = Object.freeze({
  lech_san_luong: Object.freeze({ trong_ngay_pct: 15, xu_ly_ngay_pct: 25 }), // |sản lượng hôm nay − bình thường| / bình thường
  // Tỷ lệ hàng nặng hôm nay − tỷ lệ hàng nặng bình thường (gộp các ngày cùng thứ, cùng khung giờ), tính bằng ĐIỂM %. Không có tuần so sánh thì không đánh giá.
  hang_nang: Object.freeze({ heavy_g: aq.HEAVY_THRESHOLD_G_DEFAULT, trong_ngay_diem_pct: 7 }),
  den_muon: Object.freeze({ tu_gio: '15:00', trong_ngay_pct: 35 }), // hàng đến từ 15:00 / sản lượng của BCVH tính tới as_of
  xac_nhan_cham: Object.freeze({ trong_ngay_phut: 75, tam: true }), // trung vị khoảng XN túi → XN bưu gửi
  // Sản lượng bình thường (tb_4_tuan) của BCVH dưới mức này (SHBG) thì KHÔNG phát sinh điểm lệch sản lượng và hàng nặng (tránh nhiễu số nhỏ). TẠM.
  san_luong_toi_thieu: Object.freeze({ tb_4_tuan: 50, tam: true })
});
const BASELINE_WEEKS = 4; // số ngày cùng thứ tối đa để tính "bình thường"
const TREND_PREV_DAYS = 7;
const TREND_HOURS = Object.freeze([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
// Phường/xã chỉ xét khi đủ lớn để tránh nhiễu số nhỏ (#42).
const WARD_SURGE = Object.freeze({ min_hom_nay: 30, min_binh_thuong: 20, top: 5 });
const CENTER_TOP_ROUTES = 5;
const CENTER_DEFAULT_DAYS = 7;
const AS_OF_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MUC_RANK = { xu_ly_ngay: 0, trong_ngay: 1 };
const round2 = (x) => Math.round(x * 100) / 100;

// ------------------------------------------
// Kiểm tham số
// ------------------------------------------
function singleParam(query, k) {
  const v = query[k];
  if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
  return v === undefined ? undefined : String(v).trim();
}

function checkKeys(query, allowed) {
  for (const k of Object.keys(query || {})) if (!allowed.includes(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
}

function parseDate(raw) {
  if (raw === undefined || raw === '') return null;
  const m = DATE_RE.exec(raw);
  if (!m || !validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "date" phải là ngày hợp lệ dạng YYYY-MM-DD');
  return raw;
}

function parseAsOf(raw) {
  if (raw === undefined || raw === '') return null;
  if (!AS_OF_RE.test(raw)) throw new QueryParamError('Tham số "as_of" phải dạng HH:MM (00:00–23:59)');
  return raw;
}

// ------------------------------------------
// Ngữ cảnh: date, as_of mặc định
// ------------------------------------------
const codesJson = JSON.stringify(BCVH_CODES);
const FILE_FILTER = "status = 'OK' AND unit_code IN (SELECT value FROM json_each(@codes))";

/**
 * date mặc định = file_date mới nhất của file đã nạp (OK) của 6 BCVH.
 * as_of mặc định = giờ chạy của file nạp mới nhất của date (file_time lớn nhất, làm tròn xuống phút); date không có file -> 23:59.
 */
function resolveContext(db, { date, asOf }) {
  const latest = db.prepare(`SELECT MAX(file_date) AS d FROM arrival_import_files WHERE ${FILE_FILTER}`).get({ codes: codesJson }).d;
  const day = date || latest;
  if (!day) return { date: null, asOf: null, asOfSource: null, updatedAt: null };
  let asOfValue = asOf;
  let source = 'tham_so';
  if (!asOfValue) {
    const ft = db.prepare(`SELECT MAX(file_time) AS t FROM arrival_import_files WHERE ${FILE_FILTER} AND file_date = @d`).get({ codes: codesJson, d: day }).t;
    asOfValue = ft ? ft.slice(0, 5) : '23:59';
    source = ft ? 'file_nap_moi_nhat' : 'cuoi_ngay';
  }
  const upd = db.prepare(`SELECT MAX(imported_at) AS t FROM arrival_import_files WHERE ${FILE_FILTER}`).get({ codes: codesJson }).t;
  // imported_at do SQLite ghi bằng CURRENT_TIMESTAMP = UTC.
  const updatedAt = upd ? `${upd.replace(' ', 'T')}Z` : null;
  return { date: day, asOf: asOfValue, asOfSource: source, updatedAt };
}

// Mốc cuối khoảng: as_of là phút nguyên (đến hết giây :00 như tham số "to" của 3b); 23:59 = hết ngày.
const toTime = (asOf) => (asOf === '23:59' ? '23:59:59' : `${asOf}:00`);

function dayFilter(day, endTime, heavyG) {
  return {
    dateBasis: 'arrival', receiverCodes: BCVH_CODES, wardKey: null,
    from: `${day} 00:00:00`, to: `${day} ${endTime}`, fromDate: day, toDate: day, heavyG: heavyG || aq.HEAVY_THRESHOLD_G_DEFAULT
  };
}

function runWin(db, f, select, extra = {}, opts = {}) {
  const { sql, params } = aq.buildCountedCte(db, f, opts);
  return db.prepare(`WITH ${sql} ${select}`).all({ ...params, ...extra });
}

// Tên BCVH: post_offices theo mã nếu khớp, không thì tên cấu hình.
function bcvhNames(db) {
  const rows = db.prepare('SELECT code, name FROM post_offices WHERE code IN (SELECT value FROM json_each(@codes))').all({ codes: codesJson });
  const map = new Map();
  for (const r of rows) if (r.name && !map.has(r.code)) map.set(r.code, r.name);
  return new Map(DASHBOARD_BCVH.map((b) => [b.ma, map.get(b.ma) || b.ten]));
}

// Ngày (file_date) có file đã nạp, theo BCVH: Map<mã, Set<ngày>>.
function presentDays(db, days) {
  const rows = db.prepare(`SELECT DISTINCT unit_code AS ma, file_date AS d FROM arrival_import_files
    WHERE ${FILE_FILTER} AND file_date IN (SELECT value FROM json_each(@days))`).all({ codes: codesJson, days: JSON.stringify(days) });
  const map = new Map(BCVH_CODES.map((c) => [c, new Set()]));
  for (const r of rows) map.get(r.ma).add(r.d);
  return map;
}

const sameWeekdayDays = (date) => Array.from({ length: BASELINE_WEEKS }, (_, i) => addDays(date, -7 * (i + 1)));

function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ------------------------------------------
// Phân loại điểm cần điều hành (thuần, không đụng DB). So sánh bằng phép nhân số nguyên để không dính sai số làm tròn.
// ------------------------------------------
/** Lệch sản lượng so với bình thường. sumWeeks = tổng sản lượng của n tuần; trả null nếu không so sánh được hoặc dưới ngưỡng. */
function classifyDeviation(today, sumWeeks, n, th = DASHBOARD_THRESHOLDS.lech_san_luong) {
  if (!n || !sumWeeks) return null;
  const dev = today * n - sumWeeks; // (today − tb) × n
  const mag = Math.abs(dev) * 100;
  let muc = null;
  if (mag >= th.xu_ly_ngay_pct * sumWeeks) muc = 'xu_ly_ngay';
  else if (mag >= th.trong_ngay_pct * sumWeeks) muc = 'trong_ngay';
  if (!muc) return null;
  return { loai: dev < 0 ? 'san_luong_thap' : 'san_luong_cao', muc };
}

/** count / total ≥ pct% (total > 0). */
function reachesShare(count, total, pct) {
  return total > 0 && count * 100 >= pct * total;
}

/** Tỷ lệ hôm nay (a/b) − tỷ lệ bình thường (c/d) ≥ pts điểm %; b, d > 0. Phép nhân số nguyên: (a·d − c·b)·100 ≥ pts·b·d. */
function reachesPointGap(a, b, c, d, pts) {
  return b > 0 && d > 0 && (a * d - c * b) * 100 >= pts * b * d;
}

/** Danh sách điểm cần điều hành của 1 BCVH. r = dòng nội bộ của overview. */
function evaluateBcvh(r, th = DASHBOARD_THRESHOLDS) {
  const out = [];
  // Có tuần so sánh VÀ sản lượng bình thường (tb_4_tuan) ≥ mức tối thiểu: sum_tuan / so_tuan ≥ min.
  const enough = r.so_tuan > 0 && r.sum_tuan >= th.san_luong_toi_thieu.tb_4_tuan * r.so_tuan;
  const dev = enough ? classifyDeviation(r.san_luong, r.sum_tuan, r.so_tuan, th.lech_san_luong) : null;
  if (dev) {
    const lech = r.lech_tb_pct;
    out.push({
      ma_bcvh: r.ma, loai: dev.loai, muc: dev.muc, gia_tri: r.san_luong, so_sanh: r.tb_4_tuan, don_vi: 'buu_gui',
      lech_pct: lech, so_tuan: r.so_tuan, it_du_lieu: r.it_du_lieu,
      do_lech: round2(Math.abs(lech) / th.lech_san_luong.trong_ngay_pct)
    });
  }
  if (enough && reachesPointGap(r.hang_nang_so, r.san_luong, r.nang_tuan, r.sum_tuan, th.hang_nang.trong_ngay_diem_pct)) {
    const hom = pct2(r.hang_nang_so, r.san_luong);
    const bt = pct2(r.nang_tuan, r.sum_tuan);
    const gap = round2(hom - bt);
    // gia_tri = chênh lệch (điểm %); so_sanh = ngưỡng (điểm %); kèm tỷ lệ hôm nay và bình thường để giao diện ghép câu.
    out.push({
      ma_bcvh: r.ma, loai: 'hang_nang', muc: 'trong_ngay', gia_tri: gap, so_sanh: th.hang_nang.trong_ngay_diem_pct, don_vi: 'diem_pct',
      ty_le_hom_nay: hom, ty_le_binh_thuong: bt, so_luong: r.hang_nang_so, so_tuan: r.so_tuan, it_du_lieu: r.it_du_lieu,
      do_lech: round2(gap / th.hang_nang.trong_ngay_diem_pct)
    });
  }
  if (r.den_sau_15h_so !== null && reachesShare(r.den_sau_15h_so, r.san_luong, th.den_muon.trong_ngay_pct)) {
    const pct = pct2(r.den_sau_15h_so, r.san_luong);
    out.push({
      ma_bcvh: r.ma, loai: 'den_muon', muc: 'trong_ngay', gia_tri: pct, so_sanh: th.den_muon.trong_ngay_pct, don_vi: 'pct',
      so_luong: r.den_sau_15h_so, do_lech: round2(pct / th.den_muon.trong_ngay_pct)
    });
  }
  if (r.trung_vi_giay !== null && r.trung_vi_giay >= th.xac_nhan_cham.trong_ngay_phut * 60) {
    const phut = round2(r.trung_vi_giay / 60);
    out.push({
      ma_bcvh: r.ma, loai: 'xac_nhan_cham', muc: 'trong_ngay', gia_tri: phut, so_sanh: th.xac_nhan_cham.trong_ngay_phut, don_vi: 'phut',
      so_luong: r.so_mau_tre, do_lech: round2(phut / th.xac_nhan_cham.trong_ngay_phut)
    });
  }
  return out;
}

const sortIssues = (list) => list.sort((a, b) => MUC_RANK[a.muc] - MUC_RANK[b.muc] || b.do_lech - a.do_lech
  || a.ma_bcvh.localeCompare(b.ma_bcvh) || a.loai.localeCompare(b.loai));

// ------------------------------------------
// /overview
// ------------------------------------------
function parseOverviewParams(query) {
  checkKeys(query, ['date', 'as_of', 'heavy_g']);
  return {
    date: parseDate(singleParam(query, 'date')),
    asOf: parseAsOf(singleParam(query, 'as_of')),
    heavyG: aq.parseHeavyG(singleParam(query, 'heavy_g'))
  };
}

function effectiveThresholds(heavyG) {
  return {
    lech_san_luong: { ...DASHBOARD_THRESHOLDS.lech_san_luong },
    hang_nang: { ...DASHBOARD_THRESHOLDS.hang_nang, heavy_g: heavyG },
    den_muon: { ...DASHBOARD_THRESHOLDS.den_muon },
    xac_nhan_cham: { ...DASHBOARD_THRESHOLDS.xac_nhan_cham },
    san_luong_toi_thieu: { ...DASHBOARD_THRESHOLDS.san_luong_toi_thieu }
  };
}

function overview(db, query) {
  const p = parseOverviewParams(query);
  const ctx = resolveContext(db, p);
  const th = effectiveThresholds(p.heavyG);
  const names = bcvhNames(db);
  const hasData = db.prepare(`SELECT DISTINCT unit_code AS ma FROM arrival_import_files WHERE ${FILE_FILTER}`).all({ codes: codesJson });
  const hasDataSet = new Set(hasData.map((r) => r.ma));
  const base = { date: ctx.date, as_of: ctx.asOf, as_of_nguon: ctx.asOfSource, ngay_cap_nhat: ctx.updatedAt, nguong: th };

  const emptyRow = (b) => ({
    ma: b.ma, ten: names.get(b.ma), co_du_lieu: hasDataSet.has(b.ma), san_luong: 0, hom_qua: 0, tb_4_tuan: null, so_tuan: 0, it_du_lieu: true,
    lech_hom_qua_pct: null, lech_tb_pct: null, hang_nang: { so_buu_gui: 0, ty_le: 0, ty_le_binh_thuong: null }, den_sau_15h: null,
    xac_nhan_tre_trung_vi_phut: null, xac_nhan_tre_so_mau: 0
  });
  if (!ctx.date) {
    const { ma, ten, ...tong } = emptyRow({ ma: null });
    return { ...base, bcvh: DASHBOARD_BCVH.map(emptyRow), tong: { ...tong, so_bcvh_co_du_lieu: 0 }, issues: [] };
  }

  const end = toTime(ctx.asOf);
  const yesterday = addDays(ctx.date, -1);
  const weekDays = sameWeekdayDays(ctx.date);
  const present = presentDays(db, [yesterday, ...weekDays]);
  const lateEvaluated = ctx.asOf >= th.den_muon.tu_gio;

  // Hôm nay: đếm + hàng nặng + đến từ 15:00 theo BCVH; khoảng XN túi → XN bưu gửi (giây) của bưu gửi đủ 2 mốc.
  const fToday = dayFilter(ctx.date, end, p.heavyG);
  const todayRows = runWin(db, fToday, `SELECT receiver_code AS ma, COUNT(*) AS n, COALESCE(SUM(weight_g > @heavy), 0) AS nang,
      COALESCE(SUM(t >= @late), 0) AS muon FROM s GROUP BY receiver_code`, { heavy: p.heavyG, late: `${ctx.date} ${th.den_muon.tu_gio}:00` });
  const gapRows = runWin(db, fToday, `SELECT receiver_code AS ma,
      CAST(strftime('%s', item_at) AS INTEGER) - CAST(strftime('%s', bag_at) AS INTEGER) AS gap
    FROM s WHERE bag_at IS NOT NULL AND item_at IS NOT NULL`, {}, { withMocTimes: true });
  const today = new Map(todayRows.map((r) => [r.ma, r]));
  const gaps = new Map(BCVH_CODES.map((c) => [c, []]));
  for (const g of gapRows) gaps.get(g.ma)?.push(g.gap);

  // Hôm qua + các ngày cùng thứ: sản lượng và hàng nặng, cùng khoảng giờ 00:00 → as_of.
  const countOf = (day) => {
    const rows = runWin(db, dayFilter(day, end, p.heavyG), 'SELECT receiver_code AS ma, COUNT(*) AS n, COALESCE(SUM(weight_g > @heavy), 0) AS nang FROM s GROUP BY receiver_code', { heavy: p.heavyG });
    return new Map(rows.map((r) => [r.ma, r]));
  };
  const yCounts = countOf(yesterday);
  const weekCounts = new Map(weekDays.map((d) => [d, countOf(d)]));

  const rows = DASHBOARD_BCVH.map((b) => {
    const t = today.get(b.ma) || { n: 0, nang: 0, muon: 0 };
    const days = present.get(b.ma);
    const weeks = weekDays.filter((d) => days.has(d)).map((d) => weekCounts.get(d).get(b.ma) || { n: 0, nang: 0 });
    const sumTuan = weeks.reduce((a, x) => a + x.n, 0);
    const nangTuan = weeks.reduce((a, x) => a + x.nang, 0);
    const soTuan = weeks.length;
    const yPresent = days.has(yesterday);
    const y = yCounts.get(b.ma)?.n || 0;
    const g = gaps.get(b.ma);
    const medSec = median(g);
    return {
      ma: b.ma, ten: names.get(b.ma), co_du_lieu: hasDataSet.has(b.ma),
      san_luong: t.n, hom_qua: y,
      tb_4_tuan: soTuan ? round2(sumTuan / soTuan) : null, so_tuan: soTuan, it_du_lieu: soTuan < BASELINE_WEEKS,
      lech_hom_qua_pct: yPresent && y > 0 ? round2(((t.n - y) / y) * 100) : null,
      lech_tb_pct: soTuan && sumTuan > 0 ? round2(((t.n * soTuan - sumTuan) / sumTuan) * 100) : null,
      hang_nang_so: t.nang, den_sau_15h_so: lateEvaluated ? t.muon : null, sum_tuan: sumTuan, nang_tuan: nangTuan, hom_qua_co_du_lieu: yPresent,
      trung_vi_giay: medSec, so_mau_tre: g.length
    };
  });

  const issues = sortIssues(rows.flatMap((r) => evaluateBcvh(r, th)));

  const shape = (r) => ({
    ma: r.ma, ten: r.ten, co_du_lieu: r.co_du_lieu, san_luong: r.san_luong, hom_qua: r.hom_qua, tb_4_tuan: r.tb_4_tuan, so_tuan: r.so_tuan,
    it_du_lieu: r.it_du_lieu, lech_hom_qua_pct: r.lech_hom_qua_pct, lech_tb_pct: r.lech_tb_pct,
    hang_nang: { so_buu_gui: r.hang_nang_so, ty_le: pct2(r.hang_nang_so, r.san_luong), ty_le_binh_thuong: r.sum_tuan > 0 ? pct2(r.nang_tuan, r.sum_tuan) : null },
    den_sau_15h: r.den_sau_15h_so === null ? null : { so_buu_gui: r.den_sau_15h_so, ty_le: pct2(r.den_sau_15h_so, r.san_luong) },
    xac_nhan_tre_trung_vi_phut: r.trung_vi_giay === null ? null : round2(r.trung_vi_giay / 60),
    xac_nhan_tre_so_mau: r.so_mau_tre
  });

  // Dòng toàn 6 BCVH: tổng; tỷ lệ theo trọng số sản lượng (tổng tử / tổng mẫu); trung vị gộp mọi bưu gửi đủ 2 mốc.
  // So sánh với bình thường / hôm qua chỉ trên các BCVH có mốc so sánh (cùng tập ở tử và mẫu).
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const withBase = rows.filter((r) => r.so_tuan > 0);
  const withYest = rows.filter((r) => r.hom_qua_co_du_lieu && r.hom_qua > 0);
  const baseToday = sum(withBase, (r) => r.san_luong);
  const baseSumTb = sum(withBase, (r) => r.sum_tuan / r.so_tuan);
  const yToday = sum(withYest, (r) => r.san_luong);
  const yTotal = sum(withYest, (r) => r.hom_qua);
  const active = rows.filter((r) => r.co_du_lieu);
  const allGaps = rows.flatMap((r) => gaps.get(r.ma));
  const totalMed = median(allGaps);
  const total = shape({
    ma: null, ten: null, co_du_lieu: active.length > 0, san_luong: sum(rows, (r) => r.san_luong), hom_qua: sum(rows, (r) => r.hom_qua),
    tb_4_tuan: withBase.length ? round2(baseSumTb) : null,
    so_tuan: active.length ? Math.min(...active.map((r) => r.so_tuan)) : 0,
    it_du_lieu: !active.length || active.some((r) => r.it_du_lieu),
    lech_hom_qua_pct: yTotal ? round2(((yToday - yTotal) / yTotal) * 100) : null,
    lech_tb_pct: baseSumTb > 0 ? round2(((baseToday - baseSumTb) / baseSumTb) * 100) : null,
    hang_nang_so: sum(rows, (r) => r.hang_nang_so),
    sum_tuan: sum(withBase, (r) => r.sum_tuan), nang_tuan: sum(withBase, (r) => r.nang_tuan), // bình thường gộp trên các BCVH có tuần
    den_sau_15h_so: lateEvaluated ? sum(rows, (r) => r.den_sau_15h_so) : null,
    trung_vi_giay: totalMed, so_mau_tre: allGaps.length
  });
  delete total.ma; delete total.ten;
  total.so_bcvh_co_du_lieu = active.length;

  return { ...base, bcvh: rows.map(shape), tong: total, issues };
}

// ------------------------------------------
// /trend
// ------------------------------------------
function parseDateAsOfParams(query) {
  checkKeys(query, ['date', 'as_of']);
  return { date: parseDate(singleParam(query, 'date')), asOf: parseAsOf(singleParam(query, 'as_of')) };
}

function hourly(db, day, end, cut) {
  // Mỗi bưu gửi 1 lần tại lần đến sớm nhất trong ngày `day` (đến hết `end`); gom theo giờ, tách phần đã tới mốc `cut`.
  return runWin(db, dayFilter(day, end), `SELECT CAST(substr(t, 12, 2) AS INTEGER) AS gio, (substr(t, 12, 8) <= @cut) AS trong, COUNT(*) AS n
    FROM s GROUP BY gio, trong`, { cut });
}

function trend(db, query) {
  const p = parseDateAsOfParams(query);
  const ctx = resolveContext(db, p);
  const base = { date: ctx.date, as_of: ctx.asOf, as_of_nguon: ctx.asOfSource, ngay_cap_nhat: ctx.updatedAt };
  if (!ctx.date) return { ...base, ngay: [], theo_gio: [], so_tuan: 0, it_du_lieu: true };

  const end = toTime(ctx.asOf);
  const dates = Array.from({ length: TREND_PREV_DAYS + 1 }, (_, i) => addDays(ctx.date, i - TREND_PREV_DAYS));
  const weekDays = sameWeekdayDays(ctx.date);
  const present = presentDays(db, [...new Set([...dates, ...weekDays])]);
  const anyPresent = (d) => BCVH_CODES.some((c) => present.get(c).has(d));

  const data = new Map();
  for (const d of new Set([...dates, ...weekDays])) data.set(d, hourly(db, d, d === ctx.date ? end : '23:59:59', end));

  const ngay = dates.map((d) => ({
    ngay: d, san_luong: data.get(d).reduce((a, r) => a + r.n, 0), co_du_lieu: anyPresent(d), la_ngay_xet: d === ctx.date
  }));

  const weeks = weekDays.filter(anyPresent);
  const asHour = Number(ctx.asOf.slice(0, 2));
  const asMin = Number(ctx.asOf.slice(3, 5));
  const todayByHour = new Map();
  for (const r of data.get(ctx.date)) todayByHour.set(r.gio, (todayByHour.get(r.gio) || 0) + r.n);
  const theoGio = TREND_HOURS.map((h) => {
    // Giờ trước giờ của as_of: nguyên giờ; giờ chứa as_of: tới as_of (cả hôm nay lẫn các tuần); giờ sau: chưa tới (hôm nay = null).
    let sumWeeks = 0;
    for (const d of weeks) {
      for (const r of data.get(d)) if (r.gio === h && (h > asHour || r.trong)) sumWeeks += r.n;
    }
    return {
      gio: h,
      hom_nay: h > asHour ? null : (todayByHour.get(h) || 0),
      tb_4_tuan: weeks.length ? round2(sumWeeks / weeks.length) : null,
      chua_het_gio: h === asHour && asMin < 59
    };
  });
  return { ...base, ngay, theo_gio: theoGio, so_tuan: weeks.length, it_du_lieu: weeks.length < BASELINE_WEEKS };
}

// ------------------------------------------
// /wards-surge
// ------------------------------------------
function wardsSurge(db, query) {
  const p = parseDateAsOfParams(query);
  const ctx = resolveContext(db, p);
  const base = { date: ctx.date, as_of: ctx.asOf, as_of_nguon: ctx.asOfSource, ngay_cap_nhat: ctx.updatedAt, gioi_han: { ...WARD_SURGE } };
  if (!ctx.date) return { ...base, items: [] };

  const end = toTime(ctx.asOf);
  const weekDays = sameWeekdayDays(ctx.date);
  const present = presentDays(db, weekDays);
  const names = bcvhNames(db);
  // Chỉ phường/xã Huế (nhóm HOME — quy tắc ánh xạ của 3b); theo (BCVH của dòng đại diện, phường/xã).
  const wardSql = "SELECT receiver_code AS ma, ward_key, MIN(ward_name) AS ten, COUNT(*) AS n FROM s WHERE nhom = 'HOME' GROUP BY receiver_code, ward_key";
  const today = runWin(db, dayFilter(ctx.date, end), wardSql);
  const weekRows = new Map(weekDays.map((d) => [d, runWin(db, dayFilter(d, end), wardSql)]));

  const items = [];
  for (const t of today) {
    if (t.n < WARD_SURGE.min_hom_nay) continue;
    const days = weekDays.filter((d) => present.get(t.ma)?.has(d));
    const so = days.length;
    if (!so) continue;
    let sum = 0;
    for (const d of days) for (const r of weekRows.get(d)) if (r.ma === t.ma && r.ward_key === t.ward_key) sum += r.n;
    if (sum < WARD_SURGE.min_binh_thuong * so) continue; // bình thường (trung bình) < ngưỡng
    const tb = sum / so;
    if (t.n <= tb) continue; // chỉ phường/xã tăng
    items.push({
      bcvh: names.get(t.ma), ma_bcvh: t.ma, phuong_xa: t.ten, ward_key: t.ward_key, hom_nay: t.n, tb_4_tuan: round2(tb),
      so_tuan: so, it_du_lieu: so < BASELINE_WEEKS, tang_pct: round2(((t.n - tb) / tb) * 100), _raw: (t.n * so - sum) / sum
    });
  }
  items.sort((a, b) => b._raw - a._raw || b.hom_nay - a.hom_nay || a.ma_bcvh.localeCompare(b.ma_bcvh) || a.ward_key.localeCompare(b.ward_key));
  return { ...base, items: items.slice(0, WARD_SURGE.top).map(({ _raw, ...x }) => x) };
}

// ------------------------------------------
// /center
// ------------------------------------------
function centerFilters(db, query) {
  checkKeys(query, ['date', 'from', 'to', 'heavy_g']);
  const date = parseDate(singleParam(query, 'date'));
  let from = singleParam(query, 'from') || undefined;
  let to = singleParam(query, 'to') || undefined;
  const ctx = resolveContext(db, { date, asOf: null });
  if (!to) {
    if (!ctx.date) return { ctx, f: null };
    to = ctx.date;
  }
  if (!from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
    if (!m || !validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "to" không phải ngày hợp lệ');
    from = addDays(m[0], -(CENTER_DEFAULT_DAYS - 1));
  }
  const f = aq.parseFilters({ from, to, heavy_g: singleParam(query, 'heavy_g') }, { allowed: ['from', 'to', 'heavy_g'] });
  f.receiverCodes = BCVH_CODES;
  return { ctx, f };
}

// Một lần chạy CTE (s vật chất hoá) cho cả 3 khối của /center: đường thư theo (BCVH, tên), dịch vụ, tổ hợp mốc.
// Gọi 3 hàm riêng của 3b/3d sẽ chạy lại CTE 3 lần (~1,8 s trên 7 ngày × 1 triệu dòng). Vật chất hoá `s` nguyên bản (~20 cột) tốn thêm ~0,3 s,
// nên chỉ vật chất hoá bản hẹp `c` (8 cột cần dùng). Cách đếm không đổi: `c` chỉ chọn cột từ `s`.
const ROUTE_BY_BCVH_KEY = "CASE WHEN TRIM(route_name) = '' THEN '' ELSE receiver_code || char(31) || route_name END";
function centerAggregates(db, f) {
  const { sql, params } = aq.buildCountedCte(db, f);
  const agg = (key, ma, ten) => `SELECT ${key} AS g, ${ma} AS ma, ${ten} AS ten, 0 AS gio, COUNT(*) AS n,
      COALESCE(SUM(weight_g > @heavy), 0) AS nang, COALESCE(SUM(weight_g), 0) AS kl FROM c GROUP BY g`;
  const rows = db.prepare(`WITH ${sql},
    c AS MATERIALIZED (SELECT receiver_code, route_name, service_code, service_name, weight_g, m_bag, m_bd10, m_item FROM s)
    SELECT 'route' AS k, * FROM (${agg(ROUTE_BY_BCVH_KEY, 'MIN(receiver_code)', 'MIN(route_name)')})
    UNION ALL SELECT 'svc', * FROM (${agg(aq.SERVICE_KEY_SQL, 'MIN(service_code)', 'MIN(service_name)')})
    UNION ALL SELECT 'moc', m_bag || m_bd10 || m_item, NULL, NULL, 0, COUNT(*), 0, 0 FROM c GROUP BY m_bag || m_bd10 || m_item`)
    .all({ ...params, heavy: f.heavyG });
  const of = (k) => rows.filter((r) => r.k === k);
  return { route: of('route'), svc: of('svc'), moc: of('moc').map((r) => ({ key: r.g, n: r.n })) };
}

function center(db, query) {
  const { ctx, f } = centerFilters(db, query);
  if (!f) {
    return { date: null, from: null, to: null, ngay_cap_nhat: ctx.updatedAt, san_luong: 0, duong_thu: null, dich_vu: null, chat_luong: null };
  }
  const names = bcvhNames(db);
  const agg = centerAggregates(db, f);
  const total = aq.shapeQualityMocs(db, f, agg.moc); // bảng 7 tổ hợp + tong_hop

  // Đường thư theo (BCVH, tên). Bưu gửi không có tên gom thành MỘT nhóm chung cho cả Trung tâm (không gắn BCVH).
  const groups = aq.foldGroups(agg.route);
  const sanLuong = groups.reduce((a, x) => a + x.san_luong, 0);
  const row = (x) => ({
    ten: x.g === '' ? aq.NO_ROUTE_LABEL : x.ten, ma_bcvh: x.g === '' ? null : x.ma, ten_bcvh: x.g === '' ? null : (names.get(x.ma) || x.ma),
    san_luong: x.san_luong, ty_trong: pct2(x.san_luong, sanLuong), hang_nang: x.hang_nang, ty_le_hang_nang: pct2(x.hang_nang, x.san_luong),
    chua_co_ten: x.g === ''
  });
  const ranked = aq.sortGroups(groups.map((x) => ({ ...x, ten: x.g === '' ? aq.NO_ROUTE_LABEL : x.ten })));
  const top = ranked.slice(0, CENTER_TOP_ROUTES);
  const rest = ranked.slice(CENTER_TOP_ROUTES);
  const unnamed = groups.find((x) => x.g === '');
  const restNamed = rest.filter((x) => x.g !== '');
  const unnamedInTop = top.some((x) => x.g === '');

  const services = aq.shapeByService(f, agg.svc);
  return {
    date: ctx.date, from: f.from, to: f.to, ngay_cap_nhat: ctx.updatedAt,
    san_luong: sanLuong,
    nguong_hang_nang_g: f.heavyG,
    duong_thu: {
      top: top.map((x, i) => ({ hang: i + 1, ...row(x) })),
      con_lai: {
        so_duong_thu: restNamed.length,
        san_luong: restNamed.reduce((a, x) => a + x.san_luong, 0),
        hang_nang: restNamed.reduce((a, x) => a + x.hang_nang, 0)
      },
      // Nhóm chưa có tên: nằm trong `top` nếu đủ hạng, ngược lại cộng riêng (top + con_lai + chua_co_ten[ngoài top] = san_luong).
      chua_co_ten: { san_luong: unnamed ? unnamed.san_luong : 0, hang_nang: unnamed ? unnamed.hang_nang : 0, trong_top: unnamedInTop },
      tong_so_duong_thu: groups.filter((x) => x.g !== '').length
    },
    dich_vu: {
      san_luong: services.san_luong,
      items: services.items,
      chua_co_ten: services.chua_co_ten
    },
    chat_luong: {
      san_luong: total.san_luong, tong_hop: total.tong_hop, to_hop: total.to_hop, ty_le_co_moc: total.ty_le_co_moc, khong_co_moc: total.khong_co_moc
    }
  };
}

module.exports = {
  DASHBOARD_BCVH, DASHBOARD_THRESHOLDS, BASELINE_WEEKS, TREND_PREV_DAYS, TREND_HOURS, WARD_SURGE, CENTER_TOP_ROUTES, CENTER_DEFAULT_DAYS,
  overview, trend, wardsSurge, center, classifyDeviation, reachesShare, reachesPointGap, evaluateBcvh, median
};
