// ==========================================
// Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, docs/ai/04_DECISIONS.md #73). Chỉ đọc DB.
// KHÔNG cài cách đếm mới cho chỉ số đã có: số bưu gửi đi qua aq.buildCountedCte() (SHBG khác nhau, lần đến sớm nhất trong khoảng),
// "chưa nhận" = aq.notReceivedStats(), "BD10 chưa XNĐ" = bd10.stats(), ngày dữ liệu = aq.latestFileDate() (#70).
// Mới: "lượt đến" = tổ hợp (SHBG, BD10, BD8) khác nhau (#11), hàng nặng >= 2 kg, sau 15:00, so cùng giờ, mức điều hành.
//
// "Hôm nay" của MỖI BCVH = ngày file OK mới nhất của BCVH đó (hoặc tham số date); "cùng giờ" = tới den_luc của BCVH
// (arrival_at lớn nhất trong ngày). So sánh thiếu ngày (không có file OK ngày đó) -> null, không trả 0.
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');
const bd10 = require('./bd10Query');
const { DASHBOARD_BCVH, bcvhNames } = require('./dashboardQuery');
const { DASHBOARD_DEN_THRESHOLDS: TH } = require('../config/dashboard-thresholds');

const { QueryParamError, DATE_RE, validYmd, addDays } = aq;
const BCVH_CODES = DASHBOARD_BCVH.map((b) => b.ma);
const MUC = Object.freeze({ XU_LY_NGAY: 'xu_ly_ngay', TRONG_NGAY: 'trong_ngay', BINH_THUONG: 'binh_thuong' });
const MUC_RANK = { xu_ly_ngay: 0, trong_ngay: 1, binh_thuong: 2 };
const LOAI_RANK = { chua_nhan_tai_bcvh: 0, bd10_chua_xnd: 1 };
const GIOI_HAN_MAC_DINH = 5;
const GIOI_HAN_TOI_DA = 50;

const round2 = (x) => Math.round(x * 100) / 100;
const ratio4 = (n, d) => (d ? Math.round((n / d) * 10000) / 10000 : null);
const pctChange = (v, ref) => (ref ? round2(((v - ref) / ref) * 100) : null);
const worst = (list) => list.filter(Boolean).sort((a, b) => MUC_RANK[a] - MUC_RANK[b])[0] || null;

// ------------------------------------------
// Tham số: bcvh (một mã trong 6 BCVH | all, mặc định all), date (YYYY-MM-DD, mặc định ngày dữ liệu mới nhất của từng BCVH), gioi_han.
// ------------------------------------------
function one(query, k) {
  const v = query[k];
  if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
  return v === undefined ? '' : String(v).trim();
}

function parseParams(query, { withLimit = false } = {}) {
  const allowed = ['bcvh', 'date', ...(withLimit ? ['gioi_han'] : [])];
  for (const k of Object.keys(query || {})) if (!allowed.includes(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  const b = one(query, 'bcvh');
  let codes = BCVH_CODES;
  if (b && b !== 'all') {
    if (!BCVH_CODES.includes(b)) throw new QueryParamError(`Tham số "bcvh" phải là "all" hoặc một trong: ${BCVH_CODES.join(', ')}`);
    codes = [b];
  }
  const d = one(query, 'date');
  if (d) {
    const m = DATE_RE.exec(d);
    if (!m || !validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError('Tham số "date" phải là ngày hợp lệ dạng YYYY-MM-DD');
  }
  let gioiHan = GIOI_HAN_MAC_DINH;
  const g = withLimit ? one(query, 'gioi_han') : '';
  if (g) {
    gioiHan = Number(g);
    if (!Number.isInteger(gioiHan) || gioiHan < 1 || gioiHan > GIOI_HAN_TOI_DA) throw new QueryParamError(`Tham số "gioi_han" phải là số nguyên 1..${GIOI_HAN_TOI_DA}`);
  }
  return { bcvh: codes.length === 1 && b !== 'all' && b ? b : 'all', codes, date: d || null, gioiHan };
}

// ------------------------------------------
// Ngữ cảnh từng BCVH
// ------------------------------------------
/** { ma, day, denLuc ('YYYY-MM-DD HH:MM:SS' | null), cut ('HH:MM:SS' | null) }. day = date || ngày file OK mới nhất của BCVH (#70). */
function bcvhContext(db, ma, date, byUnit) {
  const day = date || aq.latestFileDate(db, [ma], byUnit);
  if (!day) return { ma, day: null, denLuc: null, cut: null };
  const denLuc = db.prepare('SELECT MAX(arrival_at) AS t FROM arrival_items WHERE receiver_code = @ma AND arrival_date = @d').get({ ma, d: day }).t;
  return { ma, day, denLuc: denLuc || null, cut: denLuc ? denLuc.slice(11, 19) : null };
}

/** Các ngày (trong `days`) BCVH `ma` có file OK. */
function filesPresent(db, ma, days) {
  const rows = db.prepare(`SELECT DISTINCT file_date AS d FROM arrival_import_files
    WHERE status = 'OK' AND unit_code = @ma AND file_date IN (SELECT value FROM json_each(@days))`).all({ ma, days: JSON.stringify(days) });
  return new Set(rows.map((r) => r.d));
}

/** Bộ lọc khoảng 00:00 → cut của một ngày, một BCVH, theo giờ đến BCVH (arrival_at). */
const windowFilter = (ma, day, cut) => ({
  dateBasis: 'arrival', receiverCodes: [ma], wardKey: null, heavyG: aq.HEAVY_THRESHOLD_G_DEFAULT,
  from: `${day} 00:00:00`, to: `${day} ${cut}`, fromDate: day, toDate: day
});

function runCounted(db, f, select, extra = {}) {
  const { sql, params } = aq.buildCountedCte(db, f);
  return db.prepare(`WITH ${sql} ${select}`).all({ ...params, ...extra });
}
const countBg = (db, f) => runCounted(db, f, 'SELECT COUNT(*) AS n FROM s')[0].n;

const sameWeekdays = (day) => Array.from({ length: TH.SO_TUAN_SO_SANH }, (_, i) => addDays(day, -7 * (i + 1)));

// ------------------------------------------
// Mức điều hành (thuần, không đụng DB)
// ------------------------------------------
/** |hôm nay − TB| / TB theo LECH_SAN_LUONG; sumWeeks = tổng n ngày cùng thứ. null nếu không so sánh được. */
function mucSanLuong(today, sumWeeks, n) {
  if (!n || !sumWeeks) return null;
  const mag = Math.abs(today * n - sumWeeks) * 100;
  if (mag >= TH.LECH_SAN_LUONG.xu_ly_ngay_pct * sumWeeks) return MUC.XU_LY_NGAY;
  if (mag >= TH.LECH_SAN_LUONG.trong_ngay_pct * sumWeeks) return MUC.TRONG_NGAY;
  return MUC.BINH_THUONG;
}
function mucChuaNhan(tong, choTu1Ngay) {
  if (!tong) return MUC.BINH_THUONG;
  return choTu1Ngay > 0 ? MUC.XU_LY_NGAY : MUC.TRONG_NGAY;
}
function mucBd10(chua, tong) {
  if (!tong) return MUC.BINH_THUONG;
  if (chua * 100 >= TH.BD10_CHUA_XND.xu_ly_ngay_pct * tong) return MUC.XU_LY_NGAY;
  if (chua * 100 >= TH.BD10_CHUA_XND.trong_ngay_pct * tong) return MUC.TRONG_NGAY;
  return MUC.BINH_THUONG;
}

// ------------------------------------------
// "Chưa nhận" và "BD10 chưa XNĐ" của MỘT BCVH, khung = đúng ngày đang xem (dùng lại hàm có sẵn; "đã chờ" theo #70)
// ------------------------------------------
function issuesOf(db, c) {
  const f = { receiverCodes: [c.ma], fromDate: c.day, toDate: c.day };
  const nr = aq.notReceivedStats(db, f);
  const choTu1 = nr.theo_ngay_lap.reduce((a, x) => a + (x.tuoi >= TH.CHUA_NHAN.xu_ly_ngay_tu_ngay ? x.so_buu_gui : 0), 0);
  const s = bd10.stats(db, f);
  return {
    chua_nhan: { buu_gui: nr.tong, cho_tu_1_ngay: choTu1, cho_lau_nhat_ngay: nr.cu_nhat_ngay, muc: mucChuaNhan(nr.tong, choTu1) },
    bd10_chua_xnd: { so: s.khong_xnd, tong: s.tong_bd10_den, ty_le: s.ty_le, muc: mucBd10(s.khong_xnd, s.tong_bd10_den) }
  };
}

// ------------------------------------------
// Sản lượng của MỘT BCVH: hôm nay (lượt, bưu gửi, hàng nặng, sau 15:00) + so hôm qua / TB 4 tuần cùng thứ cùng giờ
// ------------------------------------------
function volumeOf(db, c) {
  const empty = { luot: 0, buu_gui: 0, nang: 0, co_kl: 0, muon: 0, hom_qua: null, tb: null, sum_tuan: 0, so_tuan: 0 };
  if (!c.cut) return empty;
  const f = windowFilter(c.ma, c.day, c.cut);
  const t = runCounted(db, f, `SELECT COUNT(*) AS bg, COALESCE(SUM(weight_g >= @nang), 0) AS nang, COALESCE(SUM(weight_g > 0), 0) AS co_kl,
      COALESCE(SUM(t >= @muon), 0) AS muon FROM s`, { nang: TH.HANG_NANG_G, muon: `${c.day} ${String(TH.GIO_MUON).padStart(2, '0')}:00:00` })[0];
  const luot = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT tracking_no, bd10_no, bd8_no FROM arrival_items
    WHERE receiver_code = @ma AND arrival_date = @d AND arrival_at BETWEEN @from AND @to)`).get({ ma: c.ma, d: c.day, from: f.from, to: f.to }).n;
  const y = addDays(c.day, -1);
  const weeks = sameWeekdays(c.day);
  const present = filesPresent(db, c.ma, [y, ...weeks]);
  const homQua = present.has(y) ? countBg(db, windowFilter(c.ma, y, c.cut)) : null;
  const weekVals = weeks.filter((d) => present.has(d)).map((d) => countBg(db, windowFilter(c.ma, d, c.cut)));
  const sumTuan = weekVals.reduce((a, x) => a + x, 0);
  return {
    luot, buu_gui: t.bg, nang: t.nang, co_kl: t.co_kl, muon: t.muon,
    hom_qua: homQua, tb: weekVals.length ? round2(sumTuan / weekVals.length) : null, sum_tuan: sumTuan, so_tuan: weekVals.length
  };
}

function napLuc(db, codes) {
  const t = db.prepare("SELECT MAX(imported_at) AS t FROM arrival_import_files WHERE status = 'OK' AND unit_code IN (SELECT value FROM json_each(@codes))")
    .get({ codes: JSON.stringify(codes) }).t;
  return t ? `${t.replace(' ', 'T')}Z` : null; // imported_at = CURRENT_TIMESTAMP của SQLite (UTC)
}

function headerOf(db, p, ctxs, goiY) {
  const days = [...new Set(ctxs.filter((c) => c.day).map((c) => c.day))].sort();
  const dens = ctxs.map((c) => c.denLuc).filter(Boolean).sort();
  return {
    bcvh: p.bcvh,
    bcvh_goi_y: goiY,
    ngay_du_lieu: days.length ? days[days.length - 1] : null,
    cung_ngay_du_lieu: days.length <= 1,
    den_luc: dens.length ? dens[dens.length - 1] : null,
    nap_luc: napLuc(db, p.codes)
  };
}

// ------------------------------------------
// GET /api/arrivals/dashboard/tong-quan-den
// ------------------------------------------
function tongQuanDen(db, query, { goiY = [] } = {}) {
  const p = parseParams(query);
  const names = bcvhNames(db);
  const byUnit = aq.latestFileDates(db);
  const ctxs = p.codes.map((ma) => bcvhContext(db, ma, p.date, byUnit));

  const rows = ctxs.map((c) => {
    const base = { ma: c.ma, ten: names.get(c.ma), co_du_lieu: !!c.day, ngay_du_lieu: c.day, den_luc: c.denLuc };
    if (!c.day) {
      return {
        ...base, san_luong: { luot: 0, buu_gui: 0 }, so_hom_qua: null, so_tb_4_tuan: null,
        chua_nhan: { buu_gui: 0, cho_tu_1_ngay: 0, cho_lau_nhat_ngay: null }, bd10_chua_xnd: { so: 0, tong: 0, ty_le: null },
        muc: null, muc_chi_tiet: { san_luong: null, chua_nhan: null, bd10_chua_xnd: null }, _v: null
      };
    }
    const v = volumeOf(db, c);
    const is = issuesOf(db, c);
    const mSl = mucSanLuong(v.buu_gui, v.sum_tuan, v.so_tuan);
    return {
      ...base,
      san_luong: { luot: v.luot, buu_gui: v.buu_gui },
      so_hom_qua: v.hom_qua === null ? null : { gia_tri: v.hom_qua, chenh_pct: pctChange(v.buu_gui, v.hom_qua) },
      so_tb_4_tuan: v.tb === null ? null : { gia_tri: v.tb, chenh_pct: pctChange(v.buu_gui, v.tb), so_tuan: v.so_tuan },
      chua_nhan: { buu_gui: is.chua_nhan.buu_gui, cho_tu_1_ngay: is.chua_nhan.cho_tu_1_ngay, cho_lau_nhat_ngay: is.chua_nhan.cho_lau_nhat_ngay },
      bd10_chua_xnd: { so: is.bd10_chua_xnd.so, tong: is.bd10_chua_xnd.tong, ty_le: is.bd10_chua_xnd.ty_le },
      muc: worst([mSl, is.chua_nhan.muc, is.bd10_chua_xnd.muc]),
      muc_chi_tiet: { san_luong: mSl, chua_nhan: is.chua_nhan.muc, bd10_chua_xnd: is.bd10_chua_xnd.muc },
      _v: v
    };
  });

  // Tổng phạm vi: cộng các BCVH; so sánh chỉ trên các BCVH có mốc so sánh (cùng tập ở tử và mẫu).
  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const vs = rows.filter((r) => r._v).map((r) => r._v);
  const withY = vs.filter((v) => v.hom_qua !== null);
  const withTb = vs.filter((v) => v.tb !== null);
  const bg = sum(vs, (v) => v.buu_gui);
  const nang = sum(vs, (v) => v.nang);
  const coKl = sum(vs, (v) => v.co_kl);
  const yRef = sum(withY, (v) => v.hom_qua);
  const tbRef = round2(sum(withTb, (v) => v.tb));
  const canChuY = rows.filter((r) => r.muc === MUC.XU_LY_NGAY || r.muc === MUC.TRONG_NGAY).length;

  return {
    ...headerOf(db, p, ctxs, goiY),
    nguong: TH,
    san_luong: {
      luot: sum(vs, (v) => v.luot),
      buu_gui: bg,
      so_hom_qua_cung_gio: withY.length ? { gia_tri: yRef, chenh_pct: pctChange(sum(withY, (v) => v.buu_gui), yRef), so_bcvh: withY.length } : null,
      so_tb_4_tuan_cung_thu: withTb.length ? { gia_tri: tbRef, chenh_pct: pctChange(sum(withTb, (v) => v.buu_gui), tbRef), so_bcvh: withTb.length } : null
    },
    hang_nang: { buu_gui: nang, ty_le: ratio4(nang, coKl), mau_so: coKl, khong_co_khoi_luong: bg - coKl, nguong_g: TH.HANG_NANG_G },
    // da_toi_gio: có BCVH nào dữ liệu đã tới mốc GIO_MUON chưa (chưa tới thì số 0 không có nghĩa "không có hàng muộn").
    sau_15h: { buu_gui: sum(vs, (v) => v.muon), ty_le: ratio4(sum(vs, (v) => v.muon), bg), tu_gio: TH.GIO_MUON,
      da_toi_gio: ctxs.some((c) => c.cut && Number(c.cut.slice(0, 2)) >= TH.GIO_MUON) },
    bcvh_can_chu_y: { so: canChuY, tong: rows.length },
    theo_bcvh: rows.map(({ _v, ...r }) => r)
  };
}

// ------------------------------------------
// GET /api/arrivals/dashboard/viec-can-lam — chỉ "chưa nhận tại BCVH" và "BD10 chưa XNĐ" ở mức Xử lý ngay / Trong ngày.
// ------------------------------------------
function viecCanLam(db, query, { goiY = [] } = {}) {
  const p = parseParams(query);
  const names = bcvhNames(db);
  const byUnit = aq.latestFileDates(db);
  const ctxs = p.codes.map((ma) => bcvhContext(db, ma, p.date, byUnit));
  const items = [];
  for (const c of ctxs) {
    if (!c.day) continue;
    const is = issuesOf(db, c);
    const common = { bcvh: c.ma, ten_bcvh: names.get(c.ma), ngay: c.day };
    if (is.chua_nhan.muc !== MUC.BINH_THUONG) {
      items.push({
        muc: is.chua_nhan.muc, loai: 'chua_nhan_tai_bcvh', ...common, tieu_de_khoa: `chua_nhan_tai_bcvh.${is.chua_nhan.muc}`,
        so_lieu: { buu_gui: is.chua_nhan.buu_gui, cho_tu_1_ngay: is.chua_nhan.cho_tu_1_ngay, cho_lau_nhat_ngay: is.chua_nhan.cho_lau_nhat_ngay },
        duong_dan: { api: '/api/arrivals/not-received', receiver_code: c.ma, from: c.day, to: c.day },
        _w: is.chua_nhan.buu_gui
      });
    }
    if (is.bd10_chua_xnd.muc !== MUC.BINH_THUONG) {
      items.push({
        muc: is.bd10_chua_xnd.muc, loai: 'bd10_chua_xnd', ...common, tieu_de_khoa: `bd10_chua_xnd.${is.bd10_chua_xnd.muc}`,
        so_lieu: { chua_xnd: is.bd10_chua_xnd.so, tong_bd10_den: is.bd10_chua_xnd.tong, ty_le: is.bd10_chua_xnd.ty_le },
        duong_dan: { api: '/api/arrivals/bd10-khong-xnd', unit: c.ma, from: c.day, to: c.day },
        _w: is.bd10_chua_xnd.so
      });
    }
  }
  items.sort((a, b) => MUC_RANK[a.muc] - MUC_RANK[b.muc] || LOAI_RANK[a.loai] - LOAI_RANK[b.loai] || b._w - a._w || a.bcvh.localeCompare(b.bcvh));
  return { ...headerOf(db, p, ctxs, goiY), items: items.map(({ _w, ...x }) => x) };
}

// ------------------------------------------
// GET /api/arrivals/dashboard/phuong-xa-tang — số bưu gửi đến theo phường/xã (nhóm HOME như /wards-surge), cùng giờ trong ngày.
// ------------------------------------------
const WARD_SQL = "SELECT ward_key, MIN(ward_name) AS ten, COUNT(*) AS n FROM s WHERE nhom = 'HOME' GROUP BY ward_key";

function phuongXaTang(db, query, { goiY = [] } = {}) {
  const p = parseParams(query, { withLimit: true });
  const names = bcvhNames(db);
  const byUnit = aq.latestFileDates(db);
  const ctxs = p.codes.map((ma) => bcvhContext(db, ma, p.date, byUnit));
  const items = [];
  for (const c of ctxs) {
    if (!c.cut) continue;
    const y = addDays(c.day, -1);
    const yy = addDays(c.day, -2);
    const weeks = sameWeekdays(c.day);
    const present = filesPresent(db, c.ma, [y, yy, ...weeks]);
    const countsOf = (day) => (day === c.day || present.has(day)
      ? new Map(runCounted(db, windowFilter(c.ma, day, c.cut), WARD_SQL).map((r) => [r.ward_key, r])) : null);
    const today = countsOf(c.day);
    const yMap = countsOf(y);
    const yyMap = countsOf(yy);
    const weekMaps = weeks.filter((d) => present.has(d)).map(countsOf);
    const keys = new Set([...today.keys(), ...(yMap ? yMap.keys() : [])]);
    for (const k of keys) {
      const n = (m) => (m ? (m.get(k)?.n || 0) : null);
      const homNay = n(today);
      const homQua = n(yMap);
      const tb = weekMaps.length ? round2(weekMaps.reduce((a, m) => a + (m.get(k)?.n || 0), 0) / weekMaps.length) : null;
      items.push({
        ten: today.get(k)?.ten || yMap?.get(k)?.ten, ward_key: k, bcvh: c.ma, ten_bcvh: names.get(c.ma), ngay: c.day,
        hom_kia: n(yyMap), hom_qua: homQua, hom_nay: homNay,
        tang_so_hom_qua: homQua === null ? null : homNay - homQua,
        tang_so_hom_qua_pct: pctChange(homNay, homQua),
        tb_4_tuan_cung_thu: tb, so_tuan: weekMaps.length,
        lech_so_tb_pct: pctChange(homNay, tb)
      });
    }
  }
  const nz = (x) => (x === null ? -Infinity : x);
  items.sort((a, b) => nz(b.tang_so_hom_qua) - nz(a.tang_so_hom_qua) || b.hom_nay - a.hom_nay
    || a.bcvh.localeCompare(b.bcvh) || a.ward_key.localeCompare(b.ward_key));
  return { ...headerOf(db, p, ctxs, goiY), gioi_han: p.gioiHan, items: items.slice(0, p.gioiHan) };
}

module.exports = {
  MUC, GIOI_HAN_MAC_DINH, GIOI_HAN_TOI_DA, parseParams, mucSanLuong, mucChuaNhan, mucBd10, tongQuanDen, viecCanLam, phuongXaTang,
  // Dùng chung cho module «Xử lý và tỷ lệ phát» (PHAT-1): chỉ thêm export, không đổi cách tính.
  bcvhContext, windowFilter, runCounted
};
