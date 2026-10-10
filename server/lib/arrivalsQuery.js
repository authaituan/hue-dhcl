// ==========================================
// Truy vấn "Hàng đến" — NƠI DUY NHẤT cài quy tắc đếm SẢN LƯỢNG ĐẾN (docs/ai/04_DECISIONS.md #28–#34).
// Chỉ đọc DB. Mọi giá trị người dùng đi qua tham số `@`; tên cột chỉ lấy từ whitelist.
//
// Sản lượng đến = số SHBG khác nhau. Mỗi SHBG đếm 1 lần trong khoảng lọc, tại lần đến SỚM NHẤT trong khoảng theo
// tiêu chí ngày giờ đã chọn (tiêu chí "Đến BCVH" = arrival_at của dòng, tính theo R2: XN túi -> XN bưu gửi -> XNĐ BD10, #59); hoà thời điểm -> dòng id nhỏ nhất ("dòng đại diện"). Phường/xã, tỉnh, khối lượng,
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
// Hàng nặng = bưu gửi có khối lượng (của dòng đại diện) LỚN HƠN ngưỡng; rỗng/0 không nặng (04_DECISIONS.md #37).
// Tham số heavy_g cho phép đổi ngưỡng trong khoảng MIN..MAX. ADMIN sửa ngưỡng trên giao diện: ticket sau
// (cần bảng cấu hình) — ngoài phạm vi SANLUONG-3d.
const HEAVY_THRESHOLD_G_DEFAULT = 2500;
const HEAVY_THRESHOLD_G_MIN = 500;
const HEAVY_THRESHOLD_G_MAX = 30000;
// Chuyến thư BD10 đi từ TTKT: số hiệu BD10 bắt đầu bằng tiền tố này thì script xuất CSV LUÔN để trống Ngay_gio_XND_BD10 (#60) — MỘT chỗ duy nhất.
const TTKT_BD10_PREFIX = '530100';
// "Đủ trạng thái theo nguồn BD10" (#61): ttkt = có XN túi + XN bưu gửi; khac = đủ 3 mốc; khong_bd10 = có XN bưu gửi.
const SOURCE_GROUPS = [
  { nhom: 'ttkt', ten: 'Chuyến thư từ TTKT', du: 'XN túi + XN bưu gửi' },
  { nhom: 'khac', ten: 'Chuyến thư từ bưu cục khác', du: 'XN túi + XN bưu gửi + XNĐ BD10' },
  { nhom: 'khong_bd10', ten: 'Không có số hiệu BD10 (hàng không qua chuyến thư)', du: 'XN bưu gửi' }
];
// Gói (tổ hợp mốc 0–7, pk 0–5) vào MỘT số nguyên để GROUP BY một khoá (nhanh hơn nhóm nhiều khoá); giải mã bằng decodeSourceRows().
const SOURCE_CODE_SQL = '(m_bag * 24 + m_bd10 * 12 + m_item * 6 + pk)';
function decodeSourceRows(rows) {
  return rows.map((r) => {
    const kk = Math.floor(r.code / 6);
    const pk = r.code % 6;
    return { key: `${(kk >> 2) & 1}${(kk >> 1) & 1}${kk & 1}`, nguon: SOURCE_GROUPS[Math.floor(pk / 2)].nhom, du: pk % 2 === 1, n: r.n };
  });
}
const NO_ROUTE_LABEL = 'Chưa có tên đường thư';
const NO_SERVICE_LABEL = 'Chưa có tên dịch vụ';

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

// Ngưỡng hàng nặng (gam) từ tham số `heavy_g`; rỗng/không có -> mặc định. Dùng chung với dashboardQuery.js.
function parseHeavyG(raw) {
  if (raw === undefined || raw === '') return HEAVY_THRESHOLD_G_DEFAULT;
  if (!/^\d+$/.test(raw) || Number(raw) < HEAVY_THRESHOLD_G_MIN || Number(raw) > HEAVY_THRESHOLD_G_MAX) {
    throw new QueryParamError(`Tham số "heavy_g" phải là số nguyên gam từ ${HEAVY_THRESHOLD_G_MIN} đến ${HEAVY_THRESHOLD_G_MAX}`);
  }
  return Number(raw);
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
  f.heavyG = allowedSet.has('heavy_g') ? parseHeavyG(one('heavy_g')) : HEAVY_THRESHOLD_G_DEFAULT;
  if (allowedSet.has('granularity')) {
    const g = one('granularity') || 'day';
    if (g !== 'day' && g !== 'hour') throw new QueryParamError('Tham số "granularity" phải là day hoặc hour');
    if (g === 'hour' && requireRange && dayDiff(f.fromDate, f.toDate) + 1 > MAX_HOUR_RANGE_DAYS) {
      throw new QueryParamError(`Xem theo giờ chỉ cho khoảng tối đa ${MAX_HOUR_RANGE_DAYS} ngày`);
    }
    f.granularity = g;
  }
  if (allowedSet.has('ly_do')) {
    const r = one('ly_do');
    if (r !== undefined && r !== '') {
      if (!Object.prototype.hasOwnProperty.call(REASON_TEXT, r)) throw new QueryParamError(`Tham số "ly_do" không hợp lệ. Chọn một trong: ${Object.keys(REASON_TEXT).join(', ')}`);
      f.reason = r;
    }
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
// withMocTimes=true: thêm bag_at / item_at vào `s` = giờ XN túi / XN bưu gửi SỚM NHẤT trên các dòng của bưu gửi trong khoảng
// (chỉ thêm cột, không đổi cách đếm; Dashboard dùng để tính khoảng XN túi -> XN bưu gửi).
// withSource=true: thêm vào `s` cột pk = nhóm nguồn BD10 + "đủ theo nguồn" của dòng đại diện, gói thành một số 0–5: pk = 2 * nhóm + đủ
// (nhóm 0 = TTKT: đủ = có XN túi + XN bưu gửi; 1 = khác: đủ 3 mốc; 2 = không BD10: có XN bưu gửi) — tính từng dòng ở `r` rồi theo dòng đại diện. Chỉ thêm cột, không đổi cách đếm.
// Đặc điểm của dòng đại diện được gắn vào ĐUÔI khoá MIN(t || id || ...) (khoá đã duy nhất theo t, id nên đuôi không ảnh hưởng thứ tự)
// để không phải đọc thêm cột của arrival_items ở `s` (đọc thêm làm chậm ~60%).
function buildCountedCte(db, f, { materialize = false, withMocTimes = false, withSource = false } = {}) {
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
        ${b.time} AS t${withMocTimes ? ', bag_confirmed_at AS bag_at, item_confirmed_at AS item_at' : ''}${withSource ? `,
        char(65 + CASE
          WHEN bd10_no = '' THEN 4 + (item_confirmed_at IS NOT NULL)
          WHEN substr(bd10_no, 1, ${TTKT_BD10_PREFIX.length}) = @ttkt_prefix THEN (bag_confirmed_at IS NOT NULL) * (item_confirmed_at IS NOT NULL)
          ELSE 2 + (bag_confirmed_at IS NOT NULL) * (item_confirmed_at IS NOT NULL) * (bd10_confirmed_at IS NOT NULL) END) AS pk` : ''},
        (bag_confirmed_at IS NOT NULL) AS m_bag, (bd10_confirmed_at IS NOT NULL) AS m_bd10, (item_confirmed_at IS NOT NULL) AS m_item
      FROM arrival_items WHERE ${where.join(' AND ')}
    ),
    firsts AS (
      SELECT tracking_no, MIN(t || printf('%012d', id)${withSource ? ' || pk' : ''}) AS k, COUNT(DISTINCT import_file_id) AS file_count,
        MAX(m_bag) AS m_bag, MAX(m_bd10) AS m_bd10, MAX(m_item) AS m_item${withMocTimes ? ', MIN(bag_at) AS bag_at, MIN(item_at) AS item_at' : ''}
      FROM r GROUP BY tracking_no
    ),
    s AS ${materialize ? 'MATERIALIZED' : 'NOT MATERIALIZED'} (
      SELECT x.tracking_no, x.file_count, x.m_bag, x.m_bd10, x.m_item${withMocTimes ? ', x.bag_at, x.item_at' : ''}${withSource
        ? ', unicode(substr(x.k, 32, 1)) - 65 AS pk' : ''},
        substr(x.k, 1, 19) AS t, a.id, a.import_file_id, a.receiver_code, a.ward_name, a.ward_key, a.province_name,
        a.weight_g, a.bd10_no, a.bd8_no, a.route_name, a.service_code, a.service_name, a.arrival_at, a.arrival_at_basis, a.arrival_date,
        CASE WHEN a.province_name <> '' AND NOT arrivals_is_home(a.province_name) THEN 'OUT_PROVINCE'
             WHEN a.ward_key = '' THEN 'NO_WARD'
             WHEN a.province_name = '' THEN 'NO_PROVINCE'
             ELSE 'HOME' END AS nhom
      FROM firsts x JOIN arrival_items a ON a.id = CAST(substr(x.k, 20, 12) AS INTEGER)
      ${sWhere.length ? `WHERE ${sWhere.join(' AND ')}` : ''}
    )`;
  if (withSource) params.ttkt_prefix = TTKT_BD10_PREFIX;
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
// đều không có mốc nào. Không vào sản lượng; báo riêng. Kèm: ttkt_at = thời điểm bên gửi duyệt đóng chuyến SỚM NHẤT
// (bd10_ttkt_confirmed_at, không rỗng) trên các dòng của bưu gửi — có giá trị = "đã đóng chuyến, chưa nhận tại BCVH" (#60).
function undatedSql(f) {
  const recv = f.receiverCodes.length ? 'AND a.receiver_code IN (SELECT value FROM json_each(@recv))' : '';
  return `
    SELECT a.tracking_no, MIN(a.id) AS id, MIN(a.receiver_code) AS receiver_code, MIN(NULLIF(a.bd10_ttkt_confirmed_at, '')) AS ttkt_at
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

// ---- "Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" (#60): MỘT truy vấn dùng chung cho summary, /center, /not-received, /exceptions ----
// Tuổi (ngày) = ngày của file mới nhất đã nạp (OK) − ngày lập BD10 (bd10_ttkt_confirmed_at, sớm nhất của bưu gửi); nhóm 0-1 / 2 / 3+.
function latestFileDate(db) {
  return db.prepare("SELECT MAX(file_date) AS d FROM arrival_import_files WHERE status = 'OK'").get().d;
}
const dayAge = (latest, ngay) => (latest ? Math.max(0, Math.round((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${ngay}T00:00:00Z`)) / 86400000)) : 0);
const ageBucket = (age) => (age <= 1 ? '0-1' : age === 2 ? '2' : '3+');
const NOT_RECEIVED_WHERE = 'ttkt_at IS NOT NULL';

const emptyNotReceived = () => ({ tong: 0, cu_nhat_ngay: null, theo_tuoi: { '0-1': 0, '2': 0, '3+': 0 }, theo_ngay_lap: [] });

/** allowed = null (không giới hạn) | mảng mã BCVH được phép (GDVH: BCVH được giao). Trả { f, empty }: empty = không còn BCVH nào được xem. */
function scopedFilters(f, allowed) {
  if (!allowed) return { f, empty: false };
  const codes = f.receiverCodes.length ? f.receiverCodes.filter((c) => allowed.includes(c)) : allowed;
  return codes.length ? { f: { ...f, receiverCodes: codes }, empty: false } : { f, empty: true };
}

/** { tong, cu_nhat_ngay, theo_tuoi, theo_ngay_lap: [{ ngay, so_buu_gui, tuoi }] } cũ nhất trước; allowed như scopedFilters. */
function notReceivedStats(db, f, allowed = null) {
  const sc = scopedFilters(f, allowed);
  if (sc.empty) return emptyNotReceived();
  const latest = latestFileDate(db);
  const rows = db.prepare(`SELECT substr(ttkt_at, 1, 10) AS ngay, COUNT(*) AS n FROM (${undatedSql(sc.f)}) WHERE ${NOT_RECEIVED_WHERE} GROUP BY ngay ORDER BY ngay`).all(undatedParams(sc.f));
  const out = emptyNotReceived();
  for (const r of rows) {
    const tuoi = dayAge(latest, r.ngay);
    out.tong += r.n;
    out.theo_tuoi[ageBucket(tuoi)] += r.n;
    out.theo_ngay_lap.push({ ngay: r.ngay, so_buu_gui: r.n, tuoi });
  }
  out.cu_nhat_ngay = out.theo_ngay_lap.length ? out.theo_ngay_lap[0].tuoi : null;
  return out;
}

/** Số bưu gửi không mốc BCVH nào VÀ không có mốc lập BD10 (không thuộc "chưa nhận"; báo riêng cho ADMIN). */
function noMocNoTtkt(db, f) {
  return db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(f)}) WHERE ttkt_at IS NULL`).get(undatedParams(f)).n;
}

/** Danh sách chi tiết, phân trang, cũ nhất trước. */
function notReceivedList(db, f, allowed = null) {
  const sc = scopedFilters(f, allowed);
  const page = { page: f.page, page_size: f.pageSize };
  if (sc.empty) return { items: [], pagination: { total: 0, ...page, total_pages: 0 }, meta: { from: f.from, to: f.to } };
  const latest = latestFileDate(db);
  const params = undatedParams(sc.f);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(sc.f)}) WHERE ${NOT_RECEIVED_WHERE}`).get(params).n;
  const rows = db.prepare(`SELECT u.tracking_no, u.receiver_code, a.bd8_no, a.bd10_no, a.route_name, u.ttkt_at AS thoi_diem_lap_bd10
    FROM (${undatedSql(sc.f)}) u JOIN arrival_items a ON a.id = u.id WHERE u.${NOT_RECEIVED_WHERE}
    ORDER BY u.ttkt_at, u.tracking_no LIMIT @lim OFFSET @off`).all({ ...params, lim: f.pageSize, off: (f.page - 1) * f.pageSize });
  return {
    items: rows.map((r) => ({ ...r, tuoi_ngay: dayAge(latest, r.thoi_diem_lap_bd10.slice(0, 10)) })),
    pagination: { total, ...page, total_pages: Math.ceil(total / f.pageSize) },
    meta: { from: f.from, to: f.to }
  };
}

const BD10_EARLY = `(s.arrival_at_basis = 'bd10' AND s.arrival_date < (SELECT file_date FROM arrival_import_files WHERE id = s.import_file_id))`;

// ------------------------------------------
// API
// ------------------------------------------
function summary(db, f, { isAdmin, scopeCodes = null }) {
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
      (SELECT COUNT(*) FROM s WHERE weight_g > @heavy) AS hang_nang,
      (SELECT COUNT(DISTINCT r.bd8_no) FROM r WHERE r.bd8_no <> '' AND r.tracking_no IN (SELECT tracking_no FROM s)) AS tui_kien,
      (SELECT json_group_array(DISTINCT ward_key) FROM s WHERE nhom = 'HOME') AS wards${admin}`, { heavy: f.heavyG }, { materialize: true });
  const catalog = catalogWardKeys(db);
  const out = {
    san_luong: t.san_luong,
    khoi_luong_g: t.khoi_luong_g,
    tui_kien: t.tui_kien,
    hang_nang: t.hang_nang,
    ty_le_hang_nang: pct2(t.hang_nang, t.san_luong),
    nguong_hang_nang_g: f.heavyG,
    dia_ban_phat: { co: JSON.parse(t.wards).filter((k) => catalog.has(k)).length, tong: catalog.size },
    meta: metaFor(f)
  };
  // Mọi vai trò xem được "Sản lượng đến" (#60); GDVH chỉ thấy BCVH được giao (scopeCodes). Không đặt trong canh_bao (ADMIN-only).
  out.chua_nhan_tai_bcvh = notReceivedStats(db, f, scopeCodes);
  if (isAdmin) {
    const p = undatedParams(f);
    const undatedRows = db.prepare(`SELECT COUNT(*) AS n FROM arrival_items a JOIN arrival_import_files fl ON fl.id = a.import_file_id
      WHERE a.arrival_date IS NULL AND fl.file_date BETWEEN @dfrom AND @dto
      ${f.receiverCodes.length ? 'AND a.receiver_code IN (SELECT value FROM json_each(@recv))' : ''}`).get(p).n;
    const ev = JSON.parse(t.ev);
    const kmk = noMocNoTtkt(db, f);
    out.canh_bao = {
      chua_xac_dinh_ngay_den: out.chua_nhan_tai_bcvh.tong + kmk, // LỖI THỜI (#60): = chua_nhan_tai_bcvh.tong + khong_moc_khong_ttkt; giữ để giao diện cũ không vỡ
      khong_moc_khong_ttkt: kmk,
      moc_bd10_som: t.bd10_early,
      den_lai_trong_khoang: t.den_lai,
      so_moc_theo_dong: { 3: ev['3'], 2: ev['2'], 1: ev['1'], 0: undatedRows },
      ghi_chu: 'Số mốc 3/2/1 tính trên các dòng trong khoảng của bưu gửi đã đếm; 0 = dòng không có mốc nào trong các file có ngày file thuộc khoảng.'
    };
  }
  return out;
}

// Tỷ lệ % làm tròn 2 chữ số thập phân.
function pct2(n, d) {
  return d ? Math.round((n / d) * 10000) / 100 : 0;
}

// Gom theo 1 khoá nhóm (đường thư / dịch vụ) trên dòng đại diện của các bưu gửi đã đếm — 1 lần quét CTE:
// GROUP BY (nhóm, giờ trong ngày) rồi cộng dồn trong JS. Khoá rỗng = nhóm riêng "chưa có tên".
function groupWithHours(db, f, keySql, extraCols) {
  return run(db, f, `SELECT ${keySql} AS g, ${extraCols}
      CAST(substr(t, 12, 2) AS INTEGER) AS gio, COUNT(*) AS n,
      COALESCE(SUM(weight_g > @heavy), 0) AS nang, COALESCE(SUM(weight_g), 0) AS kl
    FROM s GROUP BY g, gio`, { heavy: f.heavyG });
}

function foldGroups(rows) {
  const groups = new Map();
  for (const r of rows) {
    let x = groups.get(r.g);
    if (!x) { x = { g: r.g, ma: r.ma, ten: r.ten, san_luong: 0, hang_nang: 0, kl: 0, gio: new Map() }; groups.set(r.g, x); }
    x.san_luong += r.n; x.hang_nang += r.nang; x.kl += r.kl;
    x.gio.set(r.gio, (x.gio.get(r.gio) || 0) + r.n);
  }
  return [...groups.values()];
}

// Giờ trong ngày (0–23) có nhiều bưu gửi đến nhất; hoà thì giờ sớm hơn.
function busiestHour(gio) {
  let best = null;
  for (const [h, n] of gio) if (best === null || n > gio.get(best) || (n === gio.get(best) && h < best)) best = h;
  return best;
}

function sortGroups(list) {
  return list.sort((a, b) => b.san_luong - a.san_luong || String(a.ten).localeCompare(String(b.ten), 'vi'));
}

const ROUTE_KEY_SQL = "CASE WHEN TRIM(route_name) = '' THEN '' ELSE route_name END";
const SERVICE_KEY_SQL = "CASE WHEN TRIM(service_code) = '' AND TRIM(service_name) = '' THEN '' ELSE service_code || char(31) || service_name END";

function byRoute(db, f) {
  return shapeByRoute(f, groupWithHours(db, f, ROUTE_KEY_SQL, 'MIN(route_name) AS ten, NULL AS ma,'));
}

// Dựng kết quả từ các dòng (nhóm, giờ) — tách riêng để Dashboard gom nhiều khối trong MỘT lần chạy CTE.
function shapeByRoute(f, rows) {
  const groups = foldGroups(rows);
  const total = groups.reduce((a, x) => a + x.san_luong, 0);
  const shape = (x, ten) => ({
    ten, san_luong: x.san_luong, ty_trong: pct2(x.san_luong, total), gio_nhieu_nhat: busiestHour(x.gio),
    hang_nang: x.hang_nang, ty_le_hang_nang: pct2(x.hang_nang, x.san_luong)
  });
  const empty = groups.find((x) => x.g === '') || { san_luong: 0, hang_nang: 0, gio: new Map() };
  return {
    san_luong: total,
    nguong_hang_nang_g: f.heavyG,
    items: sortGroups(groups.filter((x) => x.g !== '').map((x) => shape(x, x.ten))),
    chua_co_ten: shape(empty, NO_ROUTE_LABEL),
    meta: metaFor(f)
  };
}

function byService(db, f) {
  return shapeByService(f, groupWithHours(db, f, SERVICE_KEY_SQL, 'MIN(service_code) AS ma, MIN(service_name) AS ten,'));
}

function shapeByService(f, rows) {
  const groups = foldGroups(rows);
  const total = groups.reduce((a, x) => a + x.san_luong, 0);
  const shape = (x, ma, ten) => ({
    ma, ten, san_luong: x.san_luong, ty_trong: pct2(x.san_luong, total),
    khoi_luong_tb_g: x.san_luong ? Math.round(x.kl / x.san_luong) : 0,
    hang_nang: x.hang_nang, ty_le_hang_nang: pct2(x.hang_nang, x.san_luong)
  });
  const empty = groups.find((x) => x.g === '') || { san_luong: 0, hang_nang: 0, kl: 0 };
  return {
    san_luong: total,
    nguong_hang_nang_g: f.heavyG,
    items: sortGroups(groups.filter((x) => x.g !== '').map((x) => shape(x, x.ma || null, x.ten || x.ma))),
    chua_co_ten: shape(empty, null, NO_SERVICE_LABEL),
    meta: metaFor(f)
  };
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

// Một lần chạy CTE: nhóm theo (tổ hợp mốc, nguồn BD10, đủ-theo-nguồn) rồi cộng trong JS.
function qualityMocs(db, f) {
  const rows = decodeSourceRows(run(db, f, `SELECT ${SOURCE_CODE_SQL} AS code, COUNT(*) AS n FROM s GROUP BY code`, {}, { withSource: true }));
  return shapeQualityMocs(db, f, sumBy(rows, 'key'), rows);
}

function sumBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + r.n);
  return [...m.entries()].map(([k, n]) => ({ key: k, n }));
}

// srcRows: [{ nguon, du, n }] (nhiều dòng/nhóm) -> tong_hop.theo_nguon + du_trang_thai_theo_nguon.
function shapeSource(total, srcRows) {
  const pct = (n, t) => (t ? Math.round((n / t) * 10000) / 100 : 0);
  const theo = SOURCE_GROUPS.map((g) => {
    const rs = srcRows.filter((r) => r.nguon === g.nhom);
    const n = rs.reduce((a, r) => a + r.n, 0);
    const du = rs.filter((r) => r.du).reduce((a, r) => a + r.n, 0);
    return { nhom: g.nhom, ten: g.ten, dieu_kien_du: g.du, so_buu_gui: n, du_theo_nguon: du, thieu: n - du, ty_le_du: pct(du, n) };
  });
  const duTong = theo.reduce((a, g) => a + g.du_theo_nguon, 0);
  return {
    theo_nguon: theo,
    du_trang_thai_theo_nguon: { so_buu_gui: duTong, ty_le: pct(duTong, total) }
  };
}

function shapeQualityMocs(db, f, rows, srcRows = null) {
  const map = new Map(rows.map((r) => [r.key, r.n]));
  const total = rows.reduce((a, r) => a + r.n, 0);
  const pct = (n) => (total ? Math.round((n / total) * 10000) / 100 : 0);
  const has = (field) => MOC_COMBOS.filter((c) => c[field]).reduce((a, c) => a + (map.get(c.key) || 0), 0);
  const stat = (n) => ({ so_buu_gui: n, ty_le: pct(n) });
  // Tổng hợp từ 7 tổ hợp, mẫu số = sản lượng đến. "Đủ trạng thái (SHBG, BD8, BD10)" = đủ XN bưu gửi + XN túi + XND BD10 (#43).
  const tongHop = {
    du_trang_thai: stat(map.get('111') || 0),
    co_xn_tui: stat(has('bag')),
    co_xnd_bd10: stat(has('bd10')),
    khong_xnd_bd10: stat(total - has('bd10')),
    co_xn_bg: stat(has('item')),
    ...(srcRows ? shapeSource(total, srcRows) : {})
  };
  return {
    san_luong: total,
    tong_hop: tongHop,
    to_hop: MOC_COMBOS.map((c) => ({ ...c, so_buu_gui: map.get(c.key) || 0, ty_le: pct(map.get(c.key) || 0) })),
    ty_le_co_moc: { bag: pct(has('bag')), bd10: pct(has('bd10')), item: pct(has('item')) },
    khong_co_moc: db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(f)})`).get(undatedParams(f)).n,
    ghi_chu: 'Mốc "có" = ít nhất một dòng của bưu gửi (trong khoảng lọc) có giá trị. Bưu gửi không có mốc nào (khong_co_moc) không vào sản lượng. '
      + 'Chuyến thư từ TTKT (BD10 bắt đầu 530100) luôn không có XNĐ BD10 (nguồn dữ liệu, không phải thiếu xác nhận): xem tong_hop.theo_nguon (nhóm theo BD10 của dòng đại diện).',
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
    ghi_chu: 'Thời điểm đến của mỗi dòng = mốc đầu tiên không trống theo thứ tự XN túi → XN bưu gửi → XNĐ BD10 (R2); sản lượng đếm bưu gửi tại lần đến sớm nhất trong khoảng lọc.'
  };
}

const REASON_TEXT = {
  MOC_BD10_SOM: 'Mốc XND BD10 sớm hơn ngày file chứa nó',
  DEN_LAI_TRONG_KHOANG: 'Bưu gửi có mặt ở nhiều file trong khoảng (đến lại)',
  CHUA_NHAN_TAI_BCVH: 'Đã đóng chuyến thư gửi về BCVH, chưa có XN nhận tại BCVH',
  KHONG_CO_MOC: 'Không có mốc nào kể cả mốc đóng chuyến (chưa xác định ngày đến)'
};
const REASON_ORDER = ['MOC_BD10_SOM', 'DEN_LAI_TRONG_KHOANG', 'CHUA_NHAN_TAI_BCVH', 'KHONG_CO_MOC'];

// Mỗi lý do: { count(): số bưu gửi, rows(n): n dòng đầu }.
function exceptionSources(db, f) {
  const latest = latestFileDate(db);
  let memo = null; // số "mốc BD10 sớm" và "đến lại" trong MỘT lần chạy CTE
  const counts = () => memo || (memo = run(db, f, `SELECT COALESCE(SUM(${BD10_EARLY}), 0) AS e, COALESCE(SUM(file_count > 1), 0) AS a FROM s`)[0]);
  // CHUA_NHAN dùng cùng truy vấn với notReceivedStats / notReceivedList (undatedSql + ttkt_at); KHONG_CO_MOC = còn lại (không có cả mốc lập BD10).
  const undated = (reason, where) => ({
    count: () => db.prepare(`SELECT COUNT(*) AS n FROM (${undatedSql(f)}) WHERE ${where}`).get(undatedParams(f)).n,
    rows: (n) => db.prepare(`SELECT u.tracking_no, NULL AS thoi_diem, u.receiver_code, '${reason}' AS ly_do,
        a.bd8_no, a.bd10_no, a.route_name, u.ttkt_at AS thoi_diem_dong_chuyen
      FROM (${undatedSql(f)}) u JOIN arrival_items a ON a.id = u.id WHERE u.${where} ORDER BY u.id LIMIT ${n}`).all(undatedParams(f))
      .map((r) => (r.thoi_diem_dong_chuyen ? { ...r, tuoi_ngay: dayAge(latest, r.thoi_diem_dong_chuyen.slice(0, 10)) } : r))
  });
  return {
    MOC_BD10_SOM: {
      count: () => counts().e,
      rows: (n) => run(db, f, `SELECT tracking_no, t AS thoi_diem, receiver_code, 'MOC_BD10_SOM' AS ly_do FROM s WHERE ${BD10_EARLY} ORDER BY t LIMIT ${n}`)
    },
    DEN_LAI_TRONG_KHOANG: {
      count: () => counts().a,
      rows: (n) => run(db, f, `SELECT tracking_no, t AS thoi_diem, receiver_code, 'DEN_LAI_TRONG_KHOANG' AS ly_do FROM s WHERE file_count > 1 ORDER BY t LIMIT ${n}`)
    },
    CHUA_NHAN_TAI_BCVH: undated('CHUA_NHAN_TAI_BCVH', NOT_RECEIVED_WHERE),
    KHONG_CO_MOC: undated('KHONG_CO_MOC', 'ttkt_at IS NULL')
  };
}

// Danh sách ngoại lệ (ADMIN), phân trang (mặc định 50/trang), lọc theo `ly_do`. Thứ tự: MOC_BD10_SOM, DEN_LAI, CHUA_NHAN, KHONG_CO_MOC.
function exceptions(db, f) {
  const src = exceptionSources(db, f);
  const reasons = f.reason ? [f.reason] : REASON_ORDER;
  const counts = Object.fromEntries(REASON_ORDER.map((k) => [k, src[k].count()]));
  const total = reasons.reduce((a, k) => a + counts[k], 0);
  const offset = (f.page - 1) * f.pageSize;
  let items = [];
  let skip = offset;
  for (const k of reasons) {
    if (items.length >= f.pageSize) break;
    if (skip >= counts[k]) { skip -= counts[k]; continue; }
    const need = skip + (f.pageSize - items.length);
    items = items.concat(src[k].rows(Math.min(need, counts[k])).slice(skip));
    skip = 0;
  }
  return {
    items: items.slice(0, f.pageSize).map((r) => ({ ...r, ly_do_text: REASON_TEXT[r.ly_do] })),
    gioi_han: f.pageSize,
    pagination: { total, page: f.page, page_size: f.pageSize, total_pages: Math.ceil(total / f.pageSize) },
    theo_ly_do: counts,
    meta: metaFor(f)
  };
}

function metaFor(f) {
  return { from: f.from, to: f.to, date_basis: f.dateBasis, tieu_chi: DATE_BASES[f.dateBasis].label };
}

// Tỷ lệ DÒNG (≈ bưu gửi) không có XNĐ BD10 / thuộc chuyến thư từ TTKT — cho ghi chú tiêu chí `bd10`. Nhớ theo (số dòng, id lớn nhất) để không quét lại.
const bd10ShareMemo = new WeakMap();
function bd10Share(db) {
  const st = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS mx FROM arrival_items').get();
  const hit = bd10ShareMemo.get(db);
  if (hit && hit.n === st.n && hit.mx === st.mx) return hit.value;
  const r = db.prepare(`SELECT COALESCE(SUM(bd10_confirmed_at IS NULL), 0) AS khong, COALESCE(SUM(substr(bd10_no, 1, ${TTKT_BD10_PREFIX.length}) = @p), 0) AS ttkt
    FROM arrival_items`).get({ p: TTKT_BD10_PREFIX });
  const pct = (x) => (st.n ? Math.round((x / st.n) * 10000) / 100 : 0);
  const value = { don_vi: 'dong', ty_le_bi_loai: pct(r.khong), ty_le_ttkt: pct(r.ttkt) };
  bd10ShareMemo.set(db, { n: st.n, mx: st.mx, value });
  return value;
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
    date_bases: Object.entries(DATE_BASES).map(([key, v]) => (key === 'bd10'
      ? { key, label: v.label, ghi_chu: 'Không gồm bưu gửi trên chuyến thư từ TTKT', ...bd10Share(db) }
      : { key, label: v.label })),
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
  HEAVY_THRESHOLD_G_DEFAULT, HEAVY_THRESHOLD_G_MIN, HEAVY_THRESHOLD_G_MAX, NO_ROUTE_LABEL, NO_SERVICE_LABEL,
  parseFilters, buildCountedCte, summary, byTime, byWard, byRoute, byService, qualityMocs, items, lookup, exceptions, meta, importStatus,
  homeProvinceKeys, isHomeProvince, catalogWardKeys,
  scopedFilters, notReceivedStats, notReceivedList, TTKT_BD10_PREFIX, SOURCE_GROUPS, SOURCE_CODE_SQL, decodeSourceRows, sumBy, REASON_ORDER,
  parseHeavyG, groupWithHours, foldGroups, sortGroups, busiestHour, pct2, DATE_RE, validYmd, addDays, dayDiff,
  ROUTE_KEY_SQL, SERVICE_KEY_SQL, shapeByService, shapeQualityMocs
};
