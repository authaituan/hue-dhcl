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
// Tuổi của N: số ngày từ ngày gán đến dữ liệu mới nhất đã nạp (cùng hàm với chua_nhan_tai_bcvh); nhóm '0-1' / '2' / '3+'.
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
  const latest = aq.latestFileDate(db);
  const rows = db.prepare(`SELECT CASE WHEN substr(bd10_no, 1, 6) = @ttkt THEN '530100' ELSE 'khac' END AS grp, st, substr(ts, 1, 10) AS d,
      COUNT(*) AS n, COALESCE(SUM(xnd_min <> xnd_max), 0) AS xnd_khac
    FROM (${perBd10Sql(sc.f)}) GROUP BY grp, st, d`).all(params(sc.f));
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
      out.theo_tuoi[aq.ageBucket(aq.dayAge(latest, r.d))] += r.n;
    }
  }
  out.ty_le = ratio(out.khong_xnd, out.tong_bd10_den);
  for (const g of Object.values(out.theo_nhom)) g.ty_le = ratio(g.khong_xnd, g.tong);
  return out;
}

// ---- Tham số của danh sách / xuất file ----
/** Tách nhom, tuoi khỏi query và đổi bí danh `unit` -> `receiver_code`. Trả { base, nhom, tuoi }. */
function splitQuery(query) {
  const base = { ...query };
  const one = (k) => {
    const v = base[k];
    delete base[k];
    if (Array.isArray(v)) throw new aq.QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
    return v === undefined || v === '' ? null : String(v).trim();
  };
  const unit = one('unit');
  if (unit !== null) {
    if (base.receiver_code !== undefined && String(base.receiver_code).trim() !== unit) throw new aq.QueryParamError('Tham số "unit" và "receiver_code" không khớp (dùng một trong hai)');
    base.receiver_code = unit;
  }
  const nhom = one('nhom');
  const tuoi = one('tuoi');
  if (nhom !== null && !NHOM.includes(nhom)) throw new aq.QueryParamError(`Tham số "nhom" phải là một trong: ${NHOM.join(', ')}`);
  if (tuoi !== null && !TUOI.includes(tuoi)) throw new aq.QueryParamError(`Tham số "tuoi" phải là một trong: ${TUOI.join(', ')}`);
  return { base, nhom, tuoi };
}

const AGE_SQL = 'MAX(0, CAST(ROUND(julianday(@latest) - julianday(substr(ts, 1, 10))) AS INTEGER))';
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
  const latest = aq.latestFileDate(db);
  const p = { ...params(sc.f), latest: latest || '0000-00-00' };
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
        so_hieu_bd10: r.bd10_no, lap6: r.bd10_no.slice(0, 6), nhom: group(r.bd10_no), ma_bcvh: r.receiver_code, ngay, thoi_diem: r.ts, tuoi: aq.dayAge(latest, ngay),
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

module.exports = { NHOM, TUOI, MAX_PAGE_SIZE, SCOPE_SQL, stats, list, splitQuery, parseListQuery, group };
