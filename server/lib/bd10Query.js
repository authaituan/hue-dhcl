// ==========================================
// Chỉ số "BD10 đến không XNĐ" (SANLUONG-4a6, docs/ai/04_DECISIONS.md #67) — đơn vị BD10, tính lúc truy vấn từ arrival_items
// (nhóm theo số hiệu BD10), KHÔNG có bảng / cột riêng và KHÔNG đổi chỉ số nào khác (sản lượng, chưa nhận, ngày đến R2 …).
//
// Mã BD10 = [6 ký tự bưu cục lập][6 ký tự bưu cục nhận][phần còn lại].
// BD10 ĐẾN của BCVH M: ký tự 7–12 = M (= receiver_code của dòng) và 6 ký tự đầu ≠ M. BD10 lập đi (6 ký tự đầu = M), BD10 rỗng, mã < 12 ký tự: loại.
// Trạng thái, xét trên MỌI dòng của BD10 (không giới hạn file / ngày):
//   S1 có XNĐ BD10 | S2 không XNĐ, ≥ 1 dòng đủ cả XN túi lẫn XN bưu gửi | S3 không XNĐ, có XN túi hoặc XN bưu gửi nhưng không dòng nào đủ cả hai |
//   S4 không XNĐ và không có XN nào.
// Tử số N = S2 + S3 (BD10 đến không XNĐ). Mẫu số D = S1 + S2 + S3 có ngày trong khung. S4 không có mốc nào nên không gán được ngày: trả riêng.
// Ngày của BD10 (quy tắc X): MIN(XNĐ) nếu có; nếu không có XNĐ thì MIN của XN túi và XN bưu gửi trên mọi dòng (cả hai cột).
// Tuổi ("đã chờ") của N: số ngày từ ngày gán đến ngày file OK mới nhất CỦA BCVH NHẬN (ký tự 7–12 = receiver_code; #70; cùng hàm với chua_nhan_tai_bcvh); nhóm '0-1' / '2' / '3+'.
// Phạm vi BCVH theo vai trò: scopedFilters() như chua_nhan_tai_bcvh (GDVH chỉ BCVH được giao; chưa được giao -> 0).
// ==========================================
'use strict';
const aq = require('./arrivalsQuery');

const NHOM = Object.freeze(['530100', 'khac']);
const TUOI = Object.freeze(['0-1', '2', '3+']);
const MAX_PAGE_SIZE = 200;

// Dòng thuộc "BD10 đến": mã đủ 12 ký tự, ký tự 7–12 = bưu cục nhận của dòng, 6 ký tự đầu ≠ bưu cục nhận.
const SCOPE_SQL = "bd10_no <> '' AND length(bd10_no) >= 12 AND substr(bd10_no, 7, 6) = receiver_code AND substr(bd10_no, 1, 6) <> receiver_code";
const XN_MIN_SQL = 'CASE WHEN bag_min IS NULL THEN item_min WHEN item_min IS NULL THEN bag_min WHEN bag_min < item_min THEN bag_min ELSE item_min END';

function perBd10Sql(f) {
  const recv = f.receiverCodes.length ? 'AND receiver_code IN (SELECT value FROM json_each(@recv))' : '';
  return `SELECT *, COALESCE(xnd_min, ${XN_MIN_SQL}) AS ts FROM (
      SELECT bd10_no, receiver_code,
        CASE WHEN MAX(bd10_confirmed_at IS NOT NULL) THEN 'S1'
             WHEN MAX(bag_confirmed_at IS NOT NULL AND item_confirmed_at IS NOT NULL) THEN 'S2'
             WHEN MAX(bag_confirmed_at IS NOT NULL OR item_confirmed_at IS NOT NULL) THEN 'S3' ELSE 'S4' END AS st,
        MIN(bd10_confirmed_at) AS xnd_min, MAX(bd10_confirmed_at) AS xnd_max,
        MIN(bag_confirmed_at) AS bag_min, MIN(item_confirmed_at) AS item_min,
        MAX(bag_confirmed_at IS NOT NULL) AS has_bag, MAX(item_confirmed_at IS NOT NULL) AS has_itm
      FROM arrival_items WHERE ${SCOPE_SQL} ${recv}
      GROUP BY bd10_no, receiver_code)`;
}
function params(f) {
  const p = { dfrom: f.fromDate, dto: f.toDate, ttkt: aq.TTKT_BD10_PREFIX };
  if (f.receiverCodes.length) p.recv = JSON.stringify(f.receiverCodes);
  return p;
}
const ratio = (n, d) => (d ? Math.round((n / d) * 10000) / 10000 : null);
const group = (b10) => (b10.slice(0, 6) === aq.TTKT_BD10_PREFIX ? '530100' : 'khac');

const emptyStats = (f) => ({
  tong_bd10_den: 0, khong_xnd: 0, ty_le: null,
  theo_nhom: { '530100': { tong: 0, khong_xnd: 0, ty_le: null }, khac: { tong: 0, khong_xnd: 0, ty_le: null } },
  theo_tuoi: { '0-1': 0, '2': 0, '3+': 0 }, theo_trang_thai: { s1: 0, s2: 0, s3: 0 },
  ngoai_khung: { truoc_khung: 0, sau_khung: 0, khong_co_moc: 0 },
  ghi_nhan: { xnd_khong_dong_nhat: 0 },
  khung: { from: f.fromDate, to: f.toDate, quy_tac_ngay: 'X' }
});

/** Chỉ số tổng hợp cho khung f (parseFilters: from/to/receiverCodes). allowed như scopedFilters. */
function stats(db, f, allowed = null) {
  const out = emptyStats(f);
  const sc = aq.scopedFilters(f, allowed);
  if (sc.empty) return out;
  const byUnit = aq.latestFileDates(db);
  const rows = db.prepare(`SELECT receiver_code AS rc, CASE WHEN substr(bd10_no, 1, 6) = @ttkt THEN '530100' ELSE 'khac' END AS grp, st, substr(ts, 1, 10) AS d,
      COUNT(*) AS n, COALESCE(SUM(xnd_min <> xnd_max), 0) AS xnd_khac
    FROM (${perBd10Sql(sc.f)}) GROUP BY rc, grp, st, d`).all(params(sc.f));
  for (const r of rows) {
    if (r.st === 'S4') { out.ngoai_khung.khong_co_moc += r.n; continue; }
    if (r.d < sc.f.fromDate) { out.ngoai_khung.truoc_khung += r.n; continue; }
    if (r.d > sc.f.toDate) { out.ngoai_khung.sau_khung += r.n; continue; }
    const g = out.theo_nhom[r.grp];
    out.tong_bd10_den += r.n;
    g.tong += r.n;
    out.theo_trang_thai[r.st.toLowerCase()] += r.n;
    out.ghi_nhan.xnd_khong_dong_nhat += r.xnd_khac;
    if (r.st === 'S2' || r.st === 'S3') {
      out.khong_xnd += r.n;
      g.khong_xnd += r.n;
      out.theo_tuoi[aq.ageBucket(aq.ageAt(byUnit, r.rc, r.d))] += r.n;
    }
  }
  out.ty_le = ratio(out.khong_xnd, out.tong_bd10_den);
  for (const g of Object.values(out.theo_nhom)) g.ty_le = ratio(g.khong_xnd, g.tong);
  return out;
}

// ---- Tham số của danh sách / xuất file ----
// Lấy (và xoá) một tham số đơn khỏi base; rỗng -> null.
function takeOne(base, k) {
  const v = base[k];
  delete base[k];
  if (Array.isArray(v)) throw new aq.QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
  return v === undefined || v === '' ? null : String(v).trim();
}
// Bí danh `unit` -> `receiver_code` (sửa base tại chỗ).
function applyUnitAlias(base) {
  const unit = takeOne(base, 'unit');
  if (unit !== null) {
    if (base.receiver_code !== undefined && String(base.receiver_code).trim() !== unit) throw new aq.QueryParamError('Tham số "unit" và "receiver_code" không khớp (dùng một trong hai)');
    base.receiver_code = unit;
  }
}

/** Tách nhom, tuoi khỏi query và đổi bí danh `unit` -> `receiver_code`. Trả { base, nhom, tuoi }. */
function splitQuery(query) {
  const base = { ...query };
  const one = (k) => takeOne(base, k);
  applyUnitAlias(base);
  const nhom = one('nhom');
  const tuoi = one('tuoi');
  if (nhom !== null && !NHOM.includes(nhom)) throw new aq.QueryParamError(`Tham số "nhom" phải là một trong: ${NHOM.join(', ')}`);
  if (tuoi !== null && !TUOI.includes(tuoi)) throw new aq.QueryParamError(`Tham số "tuoi" phải là một trong: ${TUOI.join(', ')}`);
  return { base, nhom, tuoi };
}

// Cùng phép tính với aq.ageAt(): mốc = ngày file OK mới nhất của BCVH nhận, tra trong @latest_by_unit (JSON { mã: ngày } từ aq.latestFileDates); chưa có file -> 0.
const AGE_SQL = `MAX(0, CAST(ROUND(julianday(COALESCE(json_extract(@latest_by_unit, '$."' || receiver_code || '"'), substr(ts, 1, 10))) - julianday(substr(ts, 1, 10))) AS INTEGER))`;
function listWhere({ nhom, tuoi }) {
  const w = ["st IN ('S2', 'S3')", 'substr(ts, 1, 10) BETWEEN @dfrom AND @dto'];
  if (nhom === '530100') w.push('substr(bd10_no, 1, 6) = @ttkt');
  if (nhom === 'khac') w.push('substr(bd10_no, 1, 6) <> @ttkt');
  if (tuoi === '0-1') w.push(`${AGE_SQL} <= 1`);
  if (tuoi === '2') w.push(`${AGE_SQL} = 2`);
  if (tuoi === '3+') w.push(`${AGE_SQL} >= 3`);
  return w.join(' AND ');
}

/** Danh sách BD10 thuộc N (S2 + S3) trong khung, cũ nhất trước, phân trang. f cần page, pageSize. */
function list(db, f, opts = {}, allowed = null) {
  const sc = aq.scopedFilters(f, allowed);
  const pg = { page: f.page, page_size: f.pageSize };
  const meta = { from: f.from, to: f.to, quy_tac_ngay: 'X' };
  if (sc.empty) return { items: [], pagination: { total: 0, ...pg, total_pages: 0 }, meta };
  const byUnit = aq.latestFileDates(db);
  const p = { ...params(sc.f), latest_by_unit: JSON.stringify(Object.fromEntries(byUnit)) };
  const where = listWhere(opts);
  // Một lần quét: tổng số dòng lấy bằng COUNT(*) OVER (); chỉ khi trang vượt quá cuối (không có dòng nào) mới đếm riêng.
  const rows = db.prepare(`SELECT bd10_no, receiver_code, st, ts, has_bag, has_itm, COUNT(*) OVER () AS total FROM (${perBd10Sql(sc.f)}) WHERE ${where}
    ORDER BY ts, bd10_no, receiver_code LIMIT @lim OFFSET @off`).all({ ...p, lim: f.pageSize, off: (f.page - 1) * f.pageSize });
  const total = rows.length ? rows[0].total : db.prepare(`SELECT COUNT(*) AS n FROM (${perBd10Sql(sc.f)}) WHERE ${where}`).get(p).n;
  // Số bưu gửi / BD8 chỉ tính cho các BD10 của trang này (một lần quét có điều kiện).
  const counts = new Map();
  if (rows.length) {
    const found = db.prepare(`SELECT bd10_no, receiver_code, COUNT(DISTINCT tracking_no) AS shbg, COUNT(DISTINCT CASE WHEN bd8_no <> '' THEN bd8_no END) AS bd8
      FROM arrival_items WHERE bd10_no IN (SELECT value FROM json_each(@ids)) GROUP BY bd10_no, receiver_code`).all({ ids: JSON.stringify(rows.map((r) => r.bd10_no)) });
    for (const c of found) counts.set(`${c.bd10_no}|${c.receiver_code}`, c);
  }
  return {
    items: rows.map((r) => {
      const c = counts.get(`${r.bd10_no}|${r.receiver_code}`) || { shbg: 0, bd8: 0 };
      const ngay = r.ts.slice(0, 10);
      return {
        so_hieu_bd10: r.bd10_no, lap6: r.bd10_no.slice(0, 6), nhom: group(r.bd10_no), ma_bcvh: r.receiver_code, ngay, thoi_diem: r.ts, tuoi: aq.ageAt(byUnit, r.receiver_code, ngay),
        so_buu_gui: c.shbg, so_bd8: c.bd8, co_xn_tui: !!r.has_bag, co_xn_bg: !!r.has_itm, trang_thai: r.st
      };
    }),
    pagination: { total, ...pg, total_pages: Math.ceil(total / f.pageSize) },
    meta
  };
}

/** Phân trang tham số page / page_size đã do parseFilters; tiện ích bao: parse một lần từ query thô. */
function parseListQuery(query) {
  const { base, nhom, tuoi } = splitQuery(query);
  const f = aq.parseFilters(base, { allowed: ['from', 'to', 'receiver_code', 'page', 'page_size'] });
  return { f, nhom, tuoi };
}

// ==========================================
// "Trạng thái BD10 đến" theo ngày / theo bưu cục lập (SANLUONG-4a9, #69). Cùng tập BD10, trạng thái và quy tắc X với stats():
// đã XNĐ = S1, chưa XNĐ = S2 + S3, tong = S1 + S2 + S3 có ngày trong khung; S4 và BD10 có ngày ngoài khung trả riêng ở ngoai_khung.
// ==========================================
const TRANG_THAI_MAX_DAYS = 92; // cùng giới hạn với xuất file (arrivalsExport EXPORT_MAX_DAYS)

/** from, to (chỉ ngày), receiver_code | unit. Khung > TRANG_THAI_MAX_DAYS ngày -> 400. */
function parseTrangThaiQuery(query) {
  const base = { ...query };
  applyUnitAlias(base);
  for (const k of ['from', 'to']) {
    const v = base[k];
    if (typeof v === 'string' && v.trim() && !aq.DATE_RE.test(v.trim())) throw new aq.QueryParamError(`Tham số "${k}" phải dạng YYYY-MM-DD`);
  }
  const f = aq.parseFilters(base, { allowed: ['from', 'to', 'receiver_code'] });
  const days = aq.dayDiff(f.fromDate, f.toDate) + 1;
  if (days > TRANG_THAI_MAX_DAYS) {
    throw new aq.QueryParamError(`Khoảng ngày tối đa ${TRANG_THAI_MAX_DAYS} ngày (đã chọn ${days} ngày). Hãy thu hẹp khoảng ngày`);
  }
  return f;
}

const counter = () => ({ tong: 0, da_xnd: 0, chua_xnd: 0, ty_le_chua_xnd: null });
const addTo = (c, st, n) => { c.tong += n; if (st === 'S1') c.da_xnd += n; else c.chua_xnd += n; };
const finish = (c) => { c.ty_le_chua_xnd = ratio(c.chua_xnd, c.tong); return c; };

/** Một lần quét: số BD10 theo (bưu cục lập, trạng thái, ngày quy tắc X); tách sẵn ngoai_khung. Trả { rows (trong khung), ngoai_khung }. */
function statusRows(db, f, allowed) {
  const ngoai_khung = { truoc_khung: 0, sau_khung: 0, khong_co_moc: 0 };
  const sc = aq.scopedFilters(f, allowed);
  if (sc.empty) return { rows: [], ngoai_khung };
  const all = db.prepare(`SELECT substr(bd10_no, 1, 6) AS lap, st, substr(ts, 1, 10) AS d, COUNT(*) AS n
    FROM (${perBd10Sql(sc.f)}) GROUP BY lap, st, d`).all(params(sc.f));
  const rows = [];
  for (const r of all) {
    if (r.st === 'S4') ngoai_khung.khong_co_moc += r.n;
    else if (r.d < f.fromDate) ngoai_khung.truoc_khung += r.n;
    else if (r.d > f.toDate) ngoai_khung.sau_khung += r.n;
    else rows.push(r);
  }
  return { rows, ngoai_khung };
}

/** MỌI ngày trong khung (ngày không có BD10 vẫn có phần tử, số 0), tổng cả khung, ngoai_khung,
 *  ngay_du_lieu_moi_nhat = file OK mới nhất của các BCVH đang chọn trong phạm vi (không chọn = mọi BCVH; không có file / không còn BCVH nào -> null; #70). */
function trangThaiTheoNgay(db, f, allowed = null) {
  const { rows, ngoai_khung } = statusRows(db, f, allowed);
  const sc = aq.scopedFilters(f, allowed);
  const days = new Map();
  for (let d = f.fromDate; d <= f.toDate; d = aq.addDays(d, 1)) days.set(d, { ngay: d, ...counter() });
  const tong = counter();
  for (const r of rows) { addTo(days.get(r.d), r.st, r.n); addTo(tong, r.st, r.n); }
  return {
    khung: { from: f.fromDate, to: f.toDate, quy_tac_ngay: 'X' },
    ngay_du_lieu_moi_nhat: sc.empty ? null : aq.latestFileDate(db, sc.f.receiverCodes),
    theo_ngay: [...days.values()].map(finish),
    tong: finish(tong),
    ngoai_khung
  };
}

/** Theo bưu cục lập (6 ký tự đầu BD10), sắp chua_xnd giảm dần rồi tong giảm dần (hoà: mã tăng dần); tên từ danh mục post_offices (không có -> null). */
function trangThaiTheoBuuCucLap(db, f, allowed = null) {
  const { rows, ngoai_khung } = statusRows(db, f, allowed);
  const by = new Map();
  const tong = counter();
  for (const r of rows) {
    if (!by.has(r.lap)) by.set(r.lap, { ma_buu_cuc: r.lap, ten_buu_cuc: null, ...counter() });
    addTo(by.get(r.lap), r.st, r.n);
    addTo(tong, r.st, r.n);
  }
  if (by.size) {
    const names = db.prepare('SELECT code, name FROM post_offices WHERE code IN (SELECT value FROM json_each(@codes))').all({ codes: JSON.stringify([...by.keys()]) });
    for (const p of names) if (p.name) by.get(p.code).ten_buu_cuc = p.name;
  }
  return {
    khung: { from: f.fromDate, to: f.toDate, quy_tac_ngay: 'X' },
    theo_buu_cuc_lap: [...by.values()].map(finish)
      .sort((a, b) => b.chua_xnd - a.chua_xnd || b.tong - a.tong || a.ma_buu_cuc.localeCompare(b.ma_buu_cuc)),
    tong: finish(tong),
    ngoai_khung
  };
}

module.exports = {
  NHOM, TUOI, MAX_PAGE_SIZE, SCOPE_SQL, TRANG_THAI_MAX_DAYS, stats, list, splitQuery, parseListQuery, group,
  parseTrangThaiQuery, trangThaiTheoNgay, trangThaiTheoBuuCucLap
};
