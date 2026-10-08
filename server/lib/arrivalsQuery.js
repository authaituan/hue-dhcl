// ==========================================
// Truy vấn "Hàng đến" — NƠI DUY NHẤT cài quy tắc đếm SẢN LƯỢNG ĐẾN (docs/ai/04_DECISIONS.md #28–#34).
// Chỉ đọc DB. Mọi giá trị người dùng đi qua tham số `@`; tên cột chỉ lấy từ whitelist.
//
// Sản lượng đến = số SHBG khác nhau. Mỗi SHBG đếm 1 lần trong khoảng lọc, tại lần đến SỚM NHẤT trong khoảng theo
// tiêu chí ngày giờ đã chọn; hoà thời điểm -> dòng id nhỏ nhất ("dòng đại diện"). Phường/xã, tỉnh, khối lượng,
// bưu cục nhận lấy từ dòng đại diện. Không xét bd10_no/bd8_no khi đếm. Mọi dòng vẫn được lưu đủ.
// ==========================================
'use strict';
const { wardKey } = require('./arrivalsImport');

// Tiêu chí ngày giờ: cột thời gian đầy đủ (so sánh chính xác) + cột ngày dẫn xuất (thu hẹp ứng viên qua chỉ mục).
const DATE_BASES = {
  arrival: { time: 'arrival_at', date: 'arrival_date', label: 'Đến BCVH (mốc sớm nhất)' },
  bag: { time: 'bag_confirmed_at', date: 'bag_date', label: 'Xác nhận túi' },
  bd10: { time: 'bd10_confirmed_at', date: 'bd10_date', label: 'Xác nhận BD10' },
  item: { time: 'item_confirmed_at', date: 'item_date', label: 'Xác nhận bưu gửi' }
};
// Nhóm phân loại ở bảng phường/xã (vẫn tính vào sản lượng).
const SPECIAL_GROUPS = {
  OUT_PROVINCE: 'Phường/xã tỉnh khác',
  NO_PROVINCE: 'Chưa xác định tỉnh',
  NO_WARD: 'Chưa xác định phường/xã'
};
// 7 tổ hợp mốc BCVH (túi, BD10, bưu gửi) có ít nhất 1 mốc.
const MOC_COMBOS = [
  [1, 1, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]
].map(([bag, bd10, item]) => ({
  key: `${bag}${bd10}${item}`, bag, bd10, item,
  label: [bag && 'XN túi', bd10 && 'XND BD10', item && 'XN bưu gửi'].filter(Boolean).join(' + ')
}));
const MAX_RANGE_DAYS = 731;
const MAX_HOUR_RANGE_DAYS = 7;
const MAX_PAGE_SIZE = 200;
const EXCEPTION_LIMIT = 50;

class QueryParamError extends Error {}

// ------------------------------------------
// Tỉnh "nhà": từ khoá lấy từ danh mục province_post_offices (vd "BĐTP Huế" -> "hue").
// Tên tỉnh CSV (bỏ tiền tố Tỉnh/Thành phố/TP.) là tỉnh nhà nếu BẰNG hoặc KẾT THÚC bằng từ khoá.
// ------------------------------------------
const stripProvincePrefix = (k) => k.replace(/^(tinh|thanh pho|tp\.?)\s+/, '').trim();

function homeProvinceKeys(db) {
  return db.prepare('SELECT name FROM province_post_offices').all()
    .map((p) => stripProvincePrefix(wardKey(p.name).replace(/^(bdtp|bdt|buu dien)\s+/, '')))
    .filter(Boolean);
}

function isHomeProvince(name, homeKeys) {
  const k = stripProvincePrefix(wardKey(name));
  return !!k && homeKeys.some((h) => k === h || k.endsWith(` ${h}`));
}

// Hàm SQL arrivals_is_home(province_name): đăng ký 1 lần / kết nối; từ khoá nạp lại mỗi truy vấn.
const homeState = new WeakMap();
function prepareHomeFunction(db) {
  let st = homeState.get(db);
  if (!st) {
    st = { keys: [], memo: new Map() };
    homeState.set(db, st);
    db.function('arrivals_is_home', { deterministic: false }, (name) => {
      const k = name || '';
      if (!st.memo.has(k)) st.memo.set(k, isHomeProvince(k, st.keys) ? 1 : 0);
      return st.memo.get(k);
    });
  }
  st.keys = homeProvinceKeys(db);
  st.memo.clear();
}

// ------------------------------------------
// Kiểm tham số
// ------------------------------------------
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;
function validYmd(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// "YYYY-MM-DD" | "YYYY-MM-DD HH:MM" | "YYYY-MM-DDTHH:MM" -> "YYYY-MM-DD HH:MM:SS" (đầu/cuối ngày nếu chỉ có ngày).
function parseBound(raw, name, isEnd) {
  const s = String(raw).trim();
  let m = DATE_RE.exec(s);
  if (m) {
    if (!validYmd(+m[1], +m[2], +m[3])) throw new QueryParamError(`Tham số "${name}" không phải ngày hợp lệ`);
    return `${m[1]}-${m[2]}-${m[3]} ${isEnd ? '23:59:59' : '00:00:00'}`;
  }
  m = DATETIME_RE.exec(s);
  if (m) {
    if (!validYmd(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59) throw new QueryParamError(`Tham số "${name}" không phải ngày giờ hợp lệ`);
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00`;
  }
  throw new QueryParamError(`Tham số "${name}" phải dạng YYYY-MM-DD hoặc YYYY-MM-DD HH:MM`);
}
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function toList(v, name) {
  if (v === undefined || v === '') return [];
  const arr = (Array.isArray(v) ? v : [v]).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);
  if (arr.length > 100) throw new QueryParamError(`Tham số "${name}" quá nhiều giá trị (tối đa 100)`);
  return arr;
}

/** Chuẩn hoá query string. allowed = khoá được phép (khoá lạ -> 400). requireRange=false: không cần from/to. */
function parseFilters(query, { allowed, requireRange = true } = {}) {
  const allowedSet = new Set(allowed);
  for (const k of Object.keys(query || {})) if (!allowedSet.has(k)) throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  const one = (k) => {
    const v = query[k];
    if (Array.isArray(v)) throw new QueryParamError(`Tham số "${k}" chỉ nhận 1 giá trị`);
    return v === undefined ? undefined : String(v).trim();
  };
  const f = { dateBasis: 'arrival', receiverCodes: [], wardKey: null };
  if (requireRange) {
    const from = one('from'); const to = one('to');
    if (!from) throw new QueryParamError('Thiếu tham số "from" (YYYY-MM-DD hoặc YYYY-MM-DD HH:MM)');
    if (!to) throw new QueryParamError('Thiếu tham số "to" (YYYY-MM-DD hoặc YYYY-MM-DD HH:MM)');
    f.from = parseBound(from, 'from', false);
    f.to = parseBound(to, 'to', true);
    if (f.from > f.to) throw new QueryParamError('"from" phải nhỏ hơn hoặc bằng "to"');
    f.fromDate = f.from.slice(0, 10);
    f.toDate = f.to.slice(0, 10);
    if (dayDiff(f.fromDate, f.toDate) + 1 > MAX_RANGE_DAYS) throw new QueryParamError(`Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày`);
  }
  if (allowedSet.has('date_basis')) {
    const b = one('date_basis');
    if (b !== undefined && b !== '') {
      if (!Object.prototype.hasOwnProperty.call(DATE_BASES, b)) {
        throw new QueryParamError(`Tham số "date_basis" không hợp lệ. Chọn một trong: ${Object.keys(DATE_BASES).join(', ')}`);
      }
      f.dateBasis = b;
    }
  }
  if (allowedSet.has('receiver_code')) {
    f.receiverCodes = toList(query.receiver_code, 'receiver_code');
    for (const c of f.receiverCodes) if (!/^\d{1,12}$/.test(c)) throw new QueryParamError('Tham số "receiver_code" phải là mã số (chỉ chữ số)');
  }
  if (allowedSet.has('ward_key')) {
    const w = one('ward_key');
    if (w !== undefined && w !== '') {
      if (w.length > 120) throw new QueryParamError('Tham số "ward_key" quá dài');
      f.wardKey = wardKey(w); // nhận cả tên phường/xã gốc
    }
  }
  if (allowedSet.has('granularity')) {
    const g = one('granularity') || 'day';
    if (g !== 'day' && g !== 'hour') throw new QueryParamError('Tham số "granularity" phải là day hoặc hour');
    if (g === 'hour' && requireRange && dayDiff(f.fromDate, f.toDate) + 1 > MAX_HOUR_RANGE_DAYS) {
      throw new QueryParamError(`Xem theo giờ chỉ cho khoảng tối đa ${MAX_HOUR_RANGE_DAYS} ngày`);
    }
    f.granularity = g;
  }
  if (allowedSet.has('page')) {
    const p = one('page'); const s = one('page_size');
    f.page = p === undefined || p === '' ? 1 : Number(p);
    f.pageSize = s === undefined || s === '' ? 50 : Number(s);
    if (!Number.isInteger(f.page) || f.page < 1) throw new QueryParamError('Tham số "page" phải là số nguyên ≥ 1');
    if (!Number.isInteger(f.pageSize) || f.pageSize < 1 || f.pageSize > MAX_PAGE_SIZE) {
      throw new QueryParamError(`Tham số "page_size" phải là số nguyên 1..${MAX_PAGE_SIZE}`);
    }
  }
  return f;
}

// ------------------------------------------
// CTE lõi:
//   r      : dòng có thời điểm (theo tiêu chí) trong [from, to] (+ bưu cục nhận nếu lọc);
//   firsts : mỗi SHBG 1 khoá "thời điểm||id" nhỏ nhất -> dòng đại diện; kèm số file và mốc "có" trên mọi dòng trong khoảng;
//   s      : dòng đại diện + nhóm phân loại (lọc phường/xã nếu có) = tập SHBG được đếm.
// ------------------------------------------
// materialize=true khi câu lệnh đọc lại `s` nhiều lần (/summary); còn lại để SQLite gộp thẳng vào truy vấn.
function buildCountedCte(db, f, { materialize = false } = {}) {
  const b = DATE_BASES[f.dateBasis]; // whitelist
  prepareHomeFunction(db);
  const params = { from: f.from, to: f.to, dfrom: f.fromDate, dto: f.toDate };
  const where = [`${b.date} BETWEEN @dfrom AND @dto`, `${b.time} BETWEEN @from AND @to`];
  if (f.receiverCodes.length) {
    where.push('receiver_code IN (SELECT value FROM json_each(@recv))');
    params.recv = JSON.stringify(f.receiverCodes);
  } else if (f.dateBasis !== 'arrival') {
    // Chỉ mục của bag/bd10/item là (receiver_code, <ngày>) -> đưa danh sách mã nhận vào để dùng được chỉ mục.
    where.push('receiver_code IN (SELECT DISTINCT receiver_code FROM arrival_items)');
  }
  const sWhere = [];
  if (f.wardKey) { sWhere.push('a.ward_key = @ward'); params.ward = f.wardKey; }

  const sql = `
    r AS MATERIALIZED (
      SELECT id, tracking_no, import_file_id, bd8_no, arrival_evidence_count,
        ${b.time} AS t,
        (bag_confirmed_at IS NOT NULL) AS m_bag, (bd10_confirmed_at IS NOT NULL) AS m_bd10, (item_confirmed_at IS NOT NULL) AS m_item
      FROM arrival_items WHERE ${where.join(' AND ')}
    ),
    firsts AS (
      SELECT tracking_no, MIN(t || printf('%012d', id)) AS k, COUNT(DISTINCT import_file_id) AS file_count,
        MAX(m_bag) AS m_bag, MAX(m_bd10) AS m_bd10, MAX(m_item) AS m_item
      FROM r GROUP BY tracking_no
    ),
    s AS ${materialize ? 'MATERIALIZED' : 'NOT MATERIALIZED'} (
      SELECT x.tracking_no, x.file_count, x.m_bag, x.m_bd10, x.m_item,
        substr(x.k, 1, 19) AS t, a.id, a.import_file_id, a.receiver_code, a.ward_name, a.ward_key, a.province_name,
        a.weight_g, a.bd10_no, a.bd8_no, a.service_code, a.service_name, a.arrival_at, a.arrival_at_basis, a.arrival_date,
        CASE WHEN a.province_name <> '' AND NOT arrivals_is_home(a.province_name) THEN 'OUT_PROVINCE'
             WHEN a.ward_key = '' THEN 'NO_WARD'
             WHEN a.province_name = '' THEN 'NO_PROVINCE'
             ELSE 'HOME' END AS nhom
      FROM firsts x JOIN arrival_items a ON a.id = CAST(substr(x.k, -12) AS INTEGER)
      ${sWhere.length ? `WHERE ${sWhere.join(' AND ')}` : ''}
    )`;
  return { sql, params };
}

function run(db, f, select, extra = {}, opts = {}) {
  const { sql, params } = buildCountedCte(db, f, opts);
  return db.prepare(`WITH ${sql} ${select}`).all({ ...params, ...extra });
}

// Tổng số phường/xã của tỉnh theo danh mục: số tên phường/xã MỚI khác nhau (chuẩn hoá) trong post_offices.
function catalogWardKeys(db) {
  return new Set(db.prepare("SELECT DISTINCT new_ward_name AS w FROM post_offices WHERE new_ward_name IS NOT NULL AND new_ward_name <> ''")
    .all().map((r) => wardKey(r.w)).filter(Boolean));
}

// Bưu gửi "chưa xác định ngày đến": SHBG mà MỌI dòng trong các file có ngày file thuộc khoảng (và bưu cục nhận nếu lọc)
// đều không có mốc nào. Không vào sản lượng; báo riêng.
function undatedSql(f) {
  const recv = f.receiverCodes.length ? 'AND a.receiver_code IN (SELECT value FROM json_each(@recv))' : '';
  return `
    SELECT a.tracking_no, MIN(a.id) AS id, MIN(a.receiver_code) AS receiver_code
    FROM arrival_items a JOIN arrival_import_files fl ON fl.id = a.import_file_id
    WHERE a.tracking_no IN (SELECT b.tracking_no FROM arrival_items b JOIN arrival_import_files g ON g.id = b.import_file_id
                            WHERE b.arrival_date IS NULL AND g.file_date BETWEEN @dfrom AND @dto)
      AND fl.file_date BETWEEN @dfrom AND @dto ${recv}
    GROUP BY a.tracking_no HAVING MAX(a.arrival_at IS NOT NULL) = 0`;
}
function undatedParams(f) {
  const p = { dfrom: f.fromDate, dto: f.toDate };
  if (f.receiverCodes.length) p.recv = JSON.stringify(f.receiverCodes);
  return p;
}

const BD10_EARLY = `(s.arrival_at_basis = 'bd10' AND s.arrival_date < (SELECT file_date FROM arrival_import_files WHERE id = s.import_file_id))`;

// ------------------------------------------
// API
// ------------------------------------------
function summary(db, f, { isAdmin }) {
  // 1 câu lệnh: s được vật chất hoá 1 lần (MATERIALIZED), mọi chỉ số đọc lại từ s / r.
  const admin = isAdmin ? `,
      (SELECT COALESCE(SUM(${BD10_EARLY}), 0) FROM s) AS bd10_early,
      (SELECT COALESCE(SUM(file_count > 1), 0) FROM s) AS den_lai,
      (SELECT json_object('3', COALESCE(SUM(r.arrival_evidence_count = 3), 0), '2', COALESCE(SUM(r.arrival_evidence_count = 2), 0),
                          '1', COALESCE(SUM(r.arrival_evidence_count = 1), 0))
         FROM r WHERE r.tracking_no IN (SELECT tracking_no FROM s)) AS ev` : '';
  const [t] = run(db, f, `SELECT
      (SELECT COUNT(*) FROM s) AS san_luong,
      (SELECT COALESCE(SUM(weight_g), 0) FROM s) AS khoi_luong_g,
      (SELECT COUNT(DISTINCT r.bd8_no) FROM r WHERE r.bd8_no <> '' AND r.tracking_no IN (SELECT tracking_no FROM s)) AS tui_kien,
      (SELECT json_group_array(DISTINCT ward_key) FROM s WHERE nhom = 'HOME') AS wards${admin}`, {}, { materialize: true });
  const catalog = catalogWardKeys(db);
  const out = {
    san_luong: t.san_luong,
    khoi_luong_g: t.khoi_luong_g,
    tui_kien: t.tui_kien,
    dia_ban_phat: { co: JSON.parse(t.wards).filter((k) => catalog.has(k)).length, tong: catalog.size },
    meta: metaFor(f)
  };
  if (isAdmin) {
    const p = undatedParams(f);
    const undated = db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(f)})`).get(p).n;
    const undatedRows = db.prepare(`SELECT COUNT(*) AS n FROM arrival_items a JOIN arrival_import_files fl ON fl.id = a.import_file_id
      WHERE a.arrival_date IS NULL AND fl.file_date BETWEEN @dfrom AND @dto
      ${f.receiverCodes.length ? 'AND a.receiver_code IN (SELECT value FROM json_each(@recv))' : ''}`).get(p).n;
    const ev = JSON.parse(t.ev);
    out.canh_bao = {
      chua_xac_dinh_ngay_den: undated,
      moc_bd10_som: t.bd10_early,
      den_lai_trong_khoang: t.den_lai,
      so_moc_theo_dong: { 3: ev['3'], 2: ev['2'], 1: ev['1'], 0: undatedRows },
      ghi_chu: 'Số mốc 3/2/1 tính trên các dòng trong khoảng của bưu gửi đã đếm; 0 = dòng không có mốc nào trong các file có ngày file thuộc khoảng.'
    };
  }
  return out;
}

function hourSeries(from, to) {
  const out = [];
  const start = Date.parse(`${from.slice(0, 10)}T${from.slice(11, 13)}:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T${to.slice(11, 13)}:00:00Z`);
  for (let t = start; t <= end; t += 3600000) out.push(new Date(t).toISOString().slice(0, 13).replace('T', ' '));
  return out;
}

function byTime(db, f) {
  const len = f.granularity === 'hour' ? 13 : 10;
  const rows = run(db, f, `SELECT substr(t, 1, ${len}) AS moc, COUNT(*) AS san_luong, COALESCE(SUM(weight_g), 0) AS khoi_luong_g
    FROM s GROUP BY moc`);
  const map = new Map(rows.map((r) => [r.moc, r]));
  const keys = [];
  if (f.granularity === 'hour') keys.push(...hourSeries(f.from, f.to));
  else for (let d = f.fromDate; d <= f.toDate; d = addDays(d, 1)) keys.push(d);
  return {
    granularity: f.granularity,
    items: keys.map((k) => ({
      moc: f.granularity === 'hour' ? `${k}:00` : k,
      san_luong: map.get(k)?.san_luong || 0,
      khoi_luong_g: map.get(k)?.khoi_luong_g || 0
    })),
    meta: metaFor(f)
  };
}

function byWard(db, f) {
  const rows = run(db, f, `SELECT CASE WHEN nhom = 'HOME' THEN ward_key ELSE nhom END AS g, nhom,
      MIN(ward_name) AS ward_name, COUNT(*) AS san_luong, COALESCE(SUM(weight_g), 0) AS khoi_luong_g
    FROM s GROUP BY g ORDER BY san_luong DESC, g`);
  const total = rows.reduce((a, r) => a + r.san_luong, 0);
  const pct = (n) => (total ? Math.round((n / total) * 10000) / 100 : 0);
  const items = rows.filter((r) => r.nhom === 'HOME').map((r) => ({
    ward_key: r.g, ward_name: r.ward_name, san_luong: r.san_luong, ty_trong: pct(r.san_luong), khoi_luong_g: r.khoi_luong_g
  }));
  const nhom = Object.keys(SPECIAL_GROUPS).map((k) => {
    const r = rows.find((x) => x.g === k);
    return { nhom: k, ten: SPECIAL_GROUPS[k], san_luong: r?.san_luong || 0, ty_trong: pct(r?.san_luong || 0), khoi_luong_g: r?.khoi_luong_g || 0 };
  });
  return { san_luong: total, items, nhom_phan_loai: nhom, meta: metaFor(f) };
}

function qualityMocs(db, f) {
  const rows = run(db, f, 'SELECT m_bag || m_bd10 || m_item AS key, COUNT(*) AS n FROM s GROUP BY key');
  const map = new Map(rows.map((r) => [r.key, r.n]));
  const total = rows.reduce((a, r) => a + r.n, 0);
  const pct = (n) => (total ? Math.round((n / total) * 10000) / 100 : 0);
  const has = (field) => MOC_COMBOS.filter((c) => c[field]).reduce((a, c) => a + (map.get(c.key) || 0), 0);
  return {
    san_luong: total,
    to_hop: MOC_COMBOS.map((c) => ({ ...c, so_buu_gui: map.get(c.key) || 0, ty_le: pct(map.get(c.key) || 0) })),
    ty_le_co_moc: { bag: pct(has('bag')), bd10: pct(has('bd10')), item: pct(has('item')) },
    khong_co_moc: db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(f)})`).get(undatedParams(f)).n,
    ghi_chu: 'Mốc "có" = ít nhất một dòng của bưu gửi (trong khoảng lọc) có giá trị. Bưu gửi không có mốc nào (khong_co_moc) không vào sản lượng.',
    meta: metaFor(f)
  };
}

function items(db, f) {
  const offset = (f.page - 1) * f.pageSize;
  const rows = run(db, f, `SELECT tracking_no, t AS thoi_diem, receiver_code, ward_name, province_name, nhom, weight_g,
      bd10_no, bd8_no, service_code, service_name, arrival_at_basis, COUNT(*) OVER () AS total_count
    FROM s ORDER BY t, tracking_no LIMIT @lim OFFSET @off`, { lim: f.pageSize, off: offset });
  const n = rows.length ? rows[0].total_count : run(db, f, 'SELECT COUNT(*) AS n FROM s')[0].n;
  rows.forEach((r) => { delete r.total_count; });
  return { items: rows, pagination: { total: n, page: f.page, page_size: f.pageSize, total_pages: Math.ceil(n / f.pageSize) }, meta: metaFor(f) };
}

const BASIS_LABEL = { bag: 'XN túi', bd10: 'XND BD10', item: 'XN bưu gửi' };

function lookup(db, query) {
  for (const k of Object.keys(query || {})) if (k !== 'tracking_no') throw new QueryParamError(`Tham số không hỗ trợ: "${k}"`);
  if (Array.isArray(query.tracking_no)) throw new QueryParamError('Tham số "tracking_no" chỉ nhận 1 giá trị');
  const t = String(query.tracking_no || '').trim();
  if (!t) throw new QueryParamError('Thiếu tham số "tracking_no"');
  if (!/^[A-Za-z0-9]{1,40}$/.test(t)) throw new QueryParamError('Tham số "tracking_no" chỉ gồm chữ và số (tối đa 40 ký tự)');
  const rows = db.prepare(`
    SELECT a.id, fl.file_name, fl.file_date, a.receiver_code, a.bag_confirmed_at, a.bd10_confirmed_at, a.item_confirmed_at,
      a.arrival_at, a.arrival_at_basis, a.arrival_evidence_count, a.bd10_no, a.bd8_no, a.ward_name, a.province_name, a.weight_g,
      a.service_code, a.service_name
    FROM arrival_items a JOIN arrival_import_files fl ON fl.id = a.import_file_id
    WHERE a.tracking_no = @t ORDER BY a.arrival_at IS NULL, a.arrival_at, a.id LIMIT 200
  `).all({ t });
  return {
    tracking_no: t,
    so_dong: rows.length,
    dong: rows.map((r) => ({
      ...r,
      moc_dung_lam_thoi_diem_den: r.arrival_at_basis ? BASIS_LABEL[r.arrival_at_basis] : 'Không có mốc nào (chưa xác định ngày đến)'
    })),
    ghi_chu: 'Thời điểm đến của mỗi dòng = mốc sớm nhất trong 3 mốc BCVH; sản lượng đếm bưu gửi tại lần đến sớm nhất trong khoảng lọc.'
  };
}

const REASON_TEXT = {
  MOC_BD10_SOM: 'Mốc XND BD10 sớm hơn ngày file chứa nó',
  DEN_LAI_TRONG_KHOANG: 'Bưu gửi có mặt ở nhiều file trong khoảng (đến lại)',
  KHONG_CO_MOC: 'Không có mốc nào (chưa xác định ngày đến)'
};

function exceptions(db, f) {
  const early = run(db, f, `SELECT tracking_no, t AS thoi_diem, receiver_code, 'MOC_BD10_SOM' AS ly_do FROM s WHERE ${BD10_EARLY} ORDER BY t LIMIT ${EXCEPTION_LIMIT}`);
  const again = run(db, f, `SELECT tracking_no, t AS thoi_diem, receiver_code, 'DEN_LAI_TRONG_KHOANG' AS ly_do FROM s WHERE file_count > 1 ORDER BY t LIMIT ${EXCEPTION_LIMIT}`);
  const undated = db.prepare(`SELECT tracking_no, NULL AS thoi_diem, receiver_code, 'KHONG_CO_MOC' AS ly_do FROM (${undatedSql(f)}) ORDER BY id LIMIT ${EXCEPTION_LIMIT}`)
    .all(undatedParams(f));
  return {
    items: [...early, ...again, ...undated].slice(0, EXCEPTION_LIMIT).map((r) => ({ ...r, ly_do_text: REASON_TEXT[r.ly_do] })),
    gioi_han: EXCEPTION_LIMIT,
    meta: metaFor(f)
  };
}

function metaFor(f) {
  return { from: f.from, to: f.to, date_basis: f.dateBasis, tieu_chi: DATE_BASES[f.dateBasis].label };
}

function meta(db) {
  prepareHomeFunction(db);
  const receivers = db.prepare(`
    SELECT a.receiver_code AS code, COUNT(*) AS row_count, p.name, p.type
    FROM arrival_items a LEFT JOIN post_offices p ON p.code = a.receiver_code
    GROUP BY a.receiver_code ORDER BY a.receiver_code
  `).all();
  const wards = db.prepare(`
    SELECT ward_key, MIN(ward_name) AS ward_name, COUNT(*) AS row_count, MAX(arrivals_is_home(province_name)) AS tinh_nha
    FROM arrival_items WHERE ward_key <> '' GROUP BY ward_key ORDER BY row_count DESC
  `).all().map((w) => ({ ...w, tinh_nha: !!w.tinh_nha }));
  const range = db.prepare('SELECT MIN(arrival_at) AS min_time, MAX(arrival_at) AS max_time FROM arrival_items').get();
  return {
    receivers,
    wards,
    date_range: range,
    date_bases: Object.entries(DATE_BASES).map(([key, v]) => ({ key, label: v.label })),
    nhom_phan_loai: Object.entries(SPECIAL_GROUPS).map(([key, label]) => ({ key, label })),
    limits: { max_range_days: MAX_RANGE_DAYS, max_hour_range_days: MAX_HOUR_RANGE_DAYS, max_page_size: MAX_PAGE_SIZE }
  };
}

function importStatus(db, { getMissingBatches }) {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM arrival_import_files GROUP BY status').all();
  const problems = db.prepare(`
    SELECT f.file_name, f.status, f.error, f.imported_at,
      EXISTS (SELECT 1 FROM arrival_import_files g WHERE g.file_name = f.file_name AND g.status IN ('OK', 'EMPTY')) AS has_accepted_version
    FROM arrival_import_files f WHERE f.status IN ('REJECTED', 'CONFLICT') ORDER BY f.imported_at DESC, f.id DESC
  `).all().map((r) => ({ ...r, has_accepted_version: !!r.has_accepted_version }));
  return { by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), problems, missing_batches: getMissingBatches(db) };
}

module.exports = {
  DATE_BASES, SPECIAL_GROUPS, MOC_COMBOS, MAX_PAGE_SIZE, MAX_RANGE_DAYS, MAX_HOUR_RANGE_DAYS, QueryParamError,
  parseFilters, buildCountedCte, summary, byTime, byWard, qualityMocs, items, lookup, exceptions, meta, importStatus,
  homeProvinceKeys, isHomeProvince, catalogWardKeys
};
