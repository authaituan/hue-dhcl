// ==========================================
// Lõi nạp dữ liệu "Hàng đến" (CSV HangDen_<mã BC nhận>_<yyyymmdd>_<hhmmss>.csv).
// Dùng chung cho nạp tay (scripts/import-arrivals.js) và đồng bộ SFTP sau này.
// KHÔNG viết cứng mã bưu cục hay thư mục: mã đơn vị lấy từ tên file.
// Quyết định nghiệp vụ: docs/ai/04_DECISIONS.md #11–#20; khảo sát định dạng: docs/ai/07_SANLUONG_AUDIT.md.
// Không bao giờ ghi nội dung dòng dữ liệu vào thông báo lỗi / log (chỉ số dòng + tên cột).
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse');

const FILE_NAME_RE = /^HangDen_(\d+)_(\d{8})_(\d{6})\.csv$/;

// Tiêu đề chuẩn (16 cột, đúng thứ tự) -> tên cột trong arrival_items.
const COLUMNS = [
  ['Ma_BC_dong', 'sender_code'],
  ['BC_nhan_BG', 'receiver_code'],
  ['Ten_duong_thu', 'route_name'],
  ['SHBG', 'tracking_no'],
  ['So_hieu_BD10', 'bd10_no'],
  ['Thời gian XN túi', 'bag_confirmed_at'],
  ['Thời gian XN BG', 'item_confirmed_at'],
  ['Ngay_gio_XND_BD10', 'bd10_confirmed_at'],
  ['Ngay_gio_XND_BD10_tai_TTKT', 'bd10_ttkt_confirmed_at'],
  ['So_hieu_BD8', 'bd8_no'],
  ['Khoi_luong_thuc_te', 'weight_g'],
  ['Dich_vu_code', 'service_code'],
  ['Ten_dich_vu', 'service_name'],
  ['Ghi_chu', 'note'],
  ['Ten_Xa_Phuong', 'ward_name'],
  ['Ten_Tinh_Thanh', 'province_name']
];
const EXPECTED_HEADER = COLUMNS.map(([h]) => h);
const TIME_FIELDS = ['bag_confirmed_at', 'item_confirmed_at', 'bd10_confirmed_at', 'bd10_ttkt_confirmed_at'];
const TEXT_FIELDS = COLUMNS.map(([, f]) => f).filter((f) => !TIME_FIELDS.includes(f) && f !== 'weight_g');
// Quy tắc ngày đến R2 (04_DECISIONS.md #59): arrival_at = mốc ĐẦU TIÊN KHÔNG TRỐNG theo thứ tự XN túi -> XN bưu gửi -> XNĐ BD10
// (không còn "mốc sớm nhất"). KHÔNG dùng bd10_ttkt_confirmed_at. Ba mốc đều trống -> NULL.
const ARRIVAL_SOURCES = [['bag', 'bag_confirmed_at'], ['item', 'item_confirmed_at'], ['bd10', 'bd10_confirmed_at']];

const RANGE_DAYS_BEFORE = 3;
const RANGE_DAYS_AFTER = 1;
const MAX_OUT_OF_RANGE_RATIO = 0.01;

class ArrivalFileError extends Error {}

// ------------------------------------------
// Schema (idempotent, chạy được trên DB đã có). Gọi từ server/db.js và từ công cụ dòng lệnh.
// ------------------------------------------
function ensureArrivalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arrival_import_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_date TEXT NOT NULL,
      file_time TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      ignored_duplicate_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('OK', 'EMPTY', 'REJECTED', 'CONFLICT')),
      error TEXT,
      warning TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'SFTP')),
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (file_name, sha256)
    );
    -- Mỗi tên file chỉ có tối đa 1 bản được chấp nhận (OK/EMPTY); REJECTED/CONFLICT được ghi thêm.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_arrival_files_accepted ON arrival_import_files(file_name) WHERE status IN ('OK', 'EMPTY');
    CREATE INDEX IF NOT EXISTS ix_arrival_files_unit_date ON arrival_import_files(unit_code, file_date);

    CREATE TABLE IF NOT EXISTS arrival_items (
      id INTEGER PRIMARY KEY,
      import_file_id INTEGER NOT NULL REFERENCES arrival_import_files(id),
      sender_code TEXT NOT NULL DEFAULT '',
      receiver_code TEXT NOT NULL DEFAULT '',
      route_name TEXT NOT NULL DEFAULT '',
      tracking_no TEXT NOT NULL DEFAULT '',
      bd10_no TEXT NOT NULL DEFAULT '',
      bd8_no TEXT NOT NULL DEFAULT '',
      bag_confirmed_at TEXT,
      item_confirmed_at TEXT,
      bd10_confirmed_at TEXT,
      bd10_ttkt_confirmed_at TEXT,
      weight_g INTEGER,
      service_code TEXT NOT NULL DEFAULT '',
      service_name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      ward_name TEXT NOT NULL DEFAULT '',
      province_name TEXT NOT NULL DEFAULT '',
      arrival_at TEXT,
      arrival_at_basis TEXT CHECK (arrival_at_basis IN ('bag', 'bd10', 'item')),
      arrival_date TEXT,
      arrival_evidence_count INTEGER NOT NULL DEFAULT 0,
      bag_date TEXT,
      bd10_date TEXT,
      item_date TEXT,
      ward_key TEXT NOT NULL DEFAULT ''
    );
    -- Khoá chống trùng dòng: (SHBG, BD10, BD8, giờ XN BG). Mã rỗng lưu '' (không NULL); giờ rỗng -> COALESCE.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_arrival_items_key
      ON arrival_items(tracking_no, bd10_no, bd8_no, COALESCE(item_confirmed_at, ''));
    CREATE INDEX IF NOT EXISTS ix_arrival_items_visit ON arrival_items(tracking_no, bd10_no, bd8_no);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_recv_date ON arrival_items(receiver_code, arrival_date);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_date ON arrival_items(arrival_date);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_bag_date ON arrival_items(receiver_code, bag_date);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_bd10_date ON arrival_items(receiver_code, bd10_date);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_item_date ON arrival_items(receiver_code, item_date);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_ward ON arrival_items(ward_key);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_tracking ON arrival_items(tracking_no);
    CREATE INDEX IF NOT EXISTS ix_arrival_items_file ON arrival_items(import_file_id);

    CREATE TABLE IF NOT EXISTS ward_bdx_map (
      ward_key TEXT PRIMARY KEY,
      ward_name TEXT NOT NULL,
      commune_id TEXT REFERENCES commune_post_offices(id),
      source TEXT NOT NULL CHECK (source IN ('AUTO', 'MANUAL')),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ------------------------------------------
// Chuẩn hoá
// ------------------------------------------
// Chữ thường, bỏ dấu, Đ/Ð/đ/ð -> d, mọi loại gạch ngang -> " - ", gộp khoảng trắng.
function wardKey(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[ĐđÐð]/g, 'd')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*[-‐-―−]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

const pad2 = (n) => String(n).padStart(2, '0');

// "M/D/YYYY h:mm:ss AM|PM" (kiểu Mỹ) -> "YYYY-MM-DD HH:MM:SS". Rỗng -> null. Sai -> null + ok=false.
function parseUsDateTime(v) {
  const s = String(v || '').trim();
  if (!s) return { ok: true, value: null };
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (!m) return { ok: false };
  const [mo, d, y, h12, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  if (mo < 1 || mo > 12 || h12 < 1 || h12 > 12 || mi > 59 || se > 59) return { ok: false };
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return { ok: false };
  const hh = (h12 % 12) + (m[7] === 'PM' ? 12 : 0);
  return { ok: true, value: `${y}-${pad2(mo)}-${pad2(d)} ${pad2(hh)}:${pad2(mi)}:${pad2(se)}` };
}

// Ô thời gian của file CSV (MỘT hàm dùng chung cho importer và scripts/split-arrivals-csv.js — #65). Nhận:
//   - rỗng, hoặc chữ NULL (không phân biệt hoa/thường, bỏ khoảng trắng hai đầu) -> { ok: true, value: null }
//   - "YYYY-MM-DD HH:mm:ss" hoặc "YYYY-MM-DDTHH:mm:ss", kèm phần giây lẻ ".f" … ".fffffff" (bị bỏ, KHÔNG đổi múi giờ: giá trị đã là giờ địa phương)
//   - "M/D/YYYY h:mm:ss AM|PM" (kiểu Mỹ, định dạng cũ)
// Chuỗi khác -> { ok: false }. Kết quả luôn "YYYY-MM-DD HH:MM:SS".
const ISO_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/;
function parseDateTimeCell(v) {
  const s = String(v ?? '').trim();
  if (!s || /^null$/i.test(s)) return { ok: true, value: null };
  const m = ISO_TIME_RE.exec(s);
  if (!m) return parseUsDateTime(s);
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || se > 59) return { ok: false };
  if (d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return { ok: false };
  return { ok: true, value: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` };
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

function parseFileName(fileName) {
  const m = FILE_NAME_RE.exec(fileName);
  if (!m) return null;
  const [, unitCode, ymd, hms] = m;
  return {
    unitCode,
    fileDate: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    fileTime: `${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}`
  };
}

// Đọc CSV dạng luồng (csv-parse). Lỗi CSV chỉ báo mã lỗi + số dòng, không kèm nội dung.
function readCsvRecords(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const parser = parse({ bom: true, relax_column_count: false, skip_empty_lines: true });
    parser.on('readable', () => { let r; while ((r = parser.read()) !== null) records.push(r); });
    parser.on('error', (err) => {
      reject(new ArrivalFileError(`Lỗi đọc CSV (${err.code || 'CSV_ERROR'}) ở dòng ${err.lines ?? '?'}`));
    });
    parser.on('end', () => resolve(records));
    fs.createReadStream(filePath).on('error', reject).pipe(parser);
  });
}

// Tên cột so khớp theo TÊN (không theo vị trí): bỏ dấu, không phân biệt hoa/thường, bỏ khoảng trắng/gạch dưới
// -> "Thời gian XN túi" = "Thoi_gian_XN_tui" = "thoi gian xn tui". Cột lạ (không thuộc 16 cột chuẩn) bị bỏ qua.
const colKey = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
// Cột bắt buộc: đủ để tính ngày đến, nhóm nguồn BD10, địa bàn. Còn lại (mã BC đóng, khối lượng, tên dịch vụ, ghi chú) có thể vắng -> rỗng.
const OPTIONAL_FIELDS = new Set(['sender_code', 'weight_g', 'service_name', 'note']);

/** Ánh xạ tiêu đề CSV -> chỉ số cột của từng trường (theo thứ tự COLUMNS; -1 = vắng, chỉ với cột tuỳ chọn). Sai -> ArrivalFileError. */
function resolveHeader(header) {
  const keyToIdx = new Map();
  const problems = [];
  header.forEach((h, i) => {
    const k = colKey(h);
    if (!k) return;
    if (keyToIdx.has(k)) problems.push(`cột trùng tên: "${String(h).trim()}"`);
    else keyToIdx.set(k, i);
  });
  const index = COLUMNS.map(([h, field]) => {
    const i = keyToIdx.get(colKey(h));
    if (i === undefined && !OPTIONAL_FIELDS.has(field)) problems.push(`thiếu cột "${h}"`);
    return i === undefined ? -1 : i;
  });
  if (problems.length) throw new ArrivalFileError(`Sai tiêu đề (${header.length} cột): ${problems.slice(0, 5).join('; ')}`);
  const used = new Set(index);
  return { index, extraColumns: header.filter((h, i) => !used.has(i) && String(h).trim() !== '').length };
}

/** Tính arrival_at / arrival_at_basis / arrival_date / arrival_evidence_count của MỘT dòng theo R2 (dùng chung với scripts/rederive-arrival.js). */
function deriveArrival(item) {
  const marks = ARRIVAL_SOURCES.filter(([, f]) => item[f]);
  item.arrival_evidence_count = marks.length;
  if (marks.length) {
    const [basis, field] = marks[0];
    item.arrival_at = item[field];
    item.arrival_at_basis = basis;
    item.arrival_date = item.arrival_at.slice(0, 10);
  } else {
    item.arrival_at = null;
    item.arrival_at_basis = null;
    item.arrival_date = null;
  }
  return item;
}

// 1 bản ghi CSV -> 1 dòng arrival_items (chưa có import_file_id). rowNo = số dòng trong file (tiêu đề = 1).
function toItem(rec, rowNo, columnIndex) {
  const item = {};
  COLUMNS.forEach(([header, field], i) => {
    const raw = columnIndex[i] >= 0 ? (rec[columnIndex[i]] ?? '') : '';
    if (TIME_FIELDS.includes(field)) {
      const p = parseDateTimeCell(raw);
      if (!p.ok) throw new ArrivalFileError(`Dòng ${rowNo}: cột "${header}" sai định dạng ngày giờ (cần YYYY-MM-DD HH:mm:ss[.fff] hoặc M/D/YYYY h:mm:ss AM/PM)`);
      item[field] = p.value;
    } else if (field === 'weight_g') {
      const s = String(raw).trim();
      if (s === '') item.weight_g = null;
      else if (/^\d+$/.test(s)) item.weight_g = Number(s);
      else throw new ArrivalFileError(`Dòng ${rowNo}: cột "${header}" không phải số nguyên (gam)`);
    } else {
      item[field] = String(raw); // giữ nguyên chuỗi gốc, mã/số hiệu luôn là CHỮ
    }
  });
  deriveArrival(item);
  item.bag_date = item.bag_confirmed_at ? item.bag_confirmed_at.slice(0, 10) : null;
  item.bd10_date = item.bd10_confirmed_at ? item.bd10_confirmed_at.slice(0, 10) : null;
  item.item_date = item.item_confirmed_at ? item.item_confirmed_at.slice(0, 10) : null;
  item.ward_key = wardKey(item.ward_name);
  return item;
}

// ------------------------------------------
// Ánh xạ phường/xã -> BĐX
// ------------------------------------------
const stripWardPrefix = (k) => k.replace(/^(phuong|xa|thi tran)\s+/, '');
const communeKey = (name) => wardKey(name).replace(/^buu dien\s+/, '');

function matchCommune(key, communes) {
  const full = communes.filter((c) => c.key === key);
  if (full.length === 1) return full[0].id;
  if (full.length > 1) return null;
  const bare = stripWardPrefix(key);
  const loose = communes.filter((c) => stripWardPrefix(c.key) === bare);
  return loose.length === 1 ? loose[0].id : null;
}

// Thêm phường/xã mới vào ward_bdx_map (AUTO). Không đụng dòng MANUAL; thử khớp lại dòng AUTO còn NULL.
function refreshWardMap(db, wardNames) {
  const communes = db.prepare('SELECT id, name FROM commune_post_offices').all().map((c) => ({ id: c.id, key: communeKey(c.name) }));
  const get = db.prepare('SELECT * FROM ward_bdx_map WHERE ward_key = ?');
  const ins = db.prepare("INSERT INTO ward_bdx_map (ward_key, ward_name, commune_id, source) VALUES (?, ?, ?, 'AUTO')");
  const upd = db.prepare("UPDATE ward_bdx_map SET commune_id = ?, updated_at = CURRENT_TIMESTAMP WHERE ward_key = ? AND source = 'AUTO'");
  let added = 0;
  const seen = new Set();
  for (const name of wardNames) {
    const key = wardKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = get.get(key);
    if (!row) { ins.run(key, name, matchCommune(key, communes)); added++; }
    else if (row.source === 'AUTO' && row.commune_id === null) {
      const id = matchCommune(key, communes);
      if (id) upd.run(id, key);
    }
  }
  return added;
}

function setWardMapping(db, wardName, communeId) {
  const key = wardKey(wardName);
  if (!key) throw new ArrivalFileError('Tên phường/xã rỗng');
  if (!db.prepare('SELECT 1 FROM commune_post_offices WHERE id = ?').get(communeId)) {
    throw new ArrivalFileError(`Không có BĐX id "${communeId}" trong danh mục`);
  }
  db.prepare(`
    INSERT INTO ward_bdx_map (ward_key, ward_name, commune_id, source) VALUES (?, ?, ?, 'MANUAL')
    ON CONFLICT(ward_key) DO UPDATE SET ward_name = excluded.ward_name, commune_id = excluded.commune_id,
      source = 'MANUAL', updated_at = CURRENT_TIMESTAMP
  `).run(key, wardName, communeId);
  return key;
}

// ------------------------------------------
// Nạp 1 file
// ------------------------------------------
function recordFile(db, meta, fields) {
  const row = { row_count: 0, inserted_count: 0, ignored_duplicate_count: 0, error: null, warning: null, ...fields };
  return db.prepare(`
    INSERT INTO arrival_import_files
      (unit_code, file_name, file_date, file_time, file_size, sha256, row_count, inserted_count, ignored_duplicate_count, status, error, warning, source)
    VALUES (@unit_code, @file_name, @file_date, @file_time, @file_size, @sha256, @row_count, @inserted_count, @ignored_duplicate_count, @status, @error, @warning, @source)
    ON CONFLICT(file_name, sha256) DO UPDATE SET
      row_count = excluded.row_count, inserted_count = excluded.inserted_count,
      ignored_duplicate_count = excluded.ignored_duplicate_count, status = excluded.status,
      error = excluded.error, warning = excluded.warning, source = excluded.source, imported_at = CURRENT_TIMESTAMP
    RETURNING id
  `).get({ ...meta, ...row }).id;
}

function summarize(items) {
  const times = items.map((i) => i.arrival_at).filter(Boolean).sort();
  const provinces = {};
  for (const i of items) provinces[i.province_name] = (provinces[i.province_name] || 0) + 1;
  return {
    arrivalMin: times[0] || null,
    arrivalMax: times[times.length - 1] || null,
    distinctTracking: new Set(items.map((i) => i.tracking_no)).size,
    missingWard: items.filter((i) => !i.ward_key).length,
    noArrivalDate: items.filter((i) => !i.arrival_at).length,
    provinces
  };
}

/**
 * Nạp 1 file CSV. Trả { fileName, status, alreadyImported?, rowCount, inserted, ignored, error?, warning?, stats? }.
 * status: OK | EMPTY | REJECTED | CONFLICT | SKIPPED_NAME (sai mẫu tên, không ghi DB).
 */
async function importArrivalFile(db, filePath, { source = 'MANUAL' } = {}) {
  const fileName = path.basename(filePath);
  const parsed = parseFileName(fileName);
  if (!parsed) return { fileName, status: 'SKIPPED_NAME', error: 'Tên file không đúng mẫu HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv' };

  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const meta = { unit_code: parsed.unitCode, file_name: fileName, file_date: parsed.fileDate, file_time: parsed.fileTime, file_size: buf.length, sha256, source };

  const accepted = db.prepare("SELECT * FROM arrival_import_files WHERE file_name = ? AND status IN ('OK', 'EMPTY')").get(fileName);
  if (accepted) {
    if (accepted.sha256 === sha256) {
      return { fileName, status: accepted.status, alreadyImported: true, rowCount: accepted.row_count, inserted: 0, ignored: 0 };
    }
    const error = `Trùng tên với file đã nạp (id ${accepted.id}) nhưng khác nội dung — không nạp, cần ADMIN kiểm tra`;
    recordFile(db, meta, { status: 'CONFLICT', error });
    return { fileName, status: 'CONFLICT', error, rowCount: 0, inserted: 0, ignored: 0 };
  }

  const isBomOnly = buf.length === 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  if (buf.length === 0 || isBomOnly) {
    recordFile(db, meta, { status: 'EMPTY' });
    return { fileName, status: 'EMPTY', rowCount: 0, inserted: 0, ignored: 0 };
  }

  try {
    const records = await readCsvRecords(filePath);
    if (!records.length) throw new ArrivalFileError('File không có dòng tiêu đề');
    const { index: columnIndex, extraColumns } = resolveHeader(records[0]);
    const items = records.slice(1).map((r, i) => toItem(r, i + 2, columnIndex));

    // Kiểm tra hợp lý: arrival_at trong [file_date - 3 ngày, file_date + 1 ngày].
    const lo = addDays(parsed.fileDate, -RANGE_DAYS_BEFORE);
    const hi = addDays(parsed.fileDate, RANGE_DAYS_AFTER);
    const dated = items.filter((i) => i.arrival_date);
    const outside = dated.filter((i) => i.arrival_date < lo || i.arrival_date > hi).length;
    let warning = null;
    if (outside) {
      const ratio = outside / dated.length;
      const msg = `${outside}/${dated.length} dòng có thời gian đến BCVH ngoài khoảng ${lo}..${hi}`;
      if (ratio > MAX_OUT_OF_RANGE_RATIO) throw new ArrivalFileError(`${msg} (> ${MAX_OUT_OF_RANGE_RATIO * 100}%)`);
      warning = msg;
    }

    const cols = [...TEXT_FIELDS, ...TIME_FIELDS, 'weight_g', 'arrival_at', 'arrival_at_basis', 'arrival_date',
      'arrival_evidence_count', 'bag_date', 'bd10_date', 'item_date', 'ward_key'];
    const ins = db.prepare(`INSERT OR IGNORE INTO arrival_items (import_file_id, ${cols.join(', ')}) VALUES (@import_file_id, ${cols.map((c) => '@' + c).join(', ')})`);

    const result = db.transaction(() => {
      const status = items.length ? 'OK' : 'EMPTY';
      const fileId = recordFile(db, meta, { status, row_count: items.length, warning });
      let inserted = 0;
      for (const it of items) inserted += ins.run({ ...it, import_file_id: fileId }).changes;
      const ignored = items.length - inserted;
      db.prepare('UPDATE arrival_import_files SET inserted_count = ?, ignored_duplicate_count = ? WHERE id = ?').run(inserted, ignored, fileId);
      const wardsAdded = refreshWardMap(db, items.map((i) => i.ward_name));
      return { status, inserted, ignored, wardsAdded };
    })();

    return { fileName, unitCode: parsed.unitCode, rowCount: items.length, warning, extraColumns, stats: summarize(items), ...result };
  } catch (err) {
    const error = err instanceof ArrivalFileError ? err.message : `Lỗi hệ thống: ${err.code || err.name || 'ERROR'}`;
    recordFile(db, meta, { status: 'REJECTED', error });
    return { fileName, status: 'REJECTED', error, rowCount: 0, inserted: 0, ignored: 0 };
  }
}

/** Nạp mọi file đúng mẫu tên trong thư mục, tuần tự theo (ngày, giờ) trong tên file. */
async function importArrivalDirectory(db, dir, opts = {}) {
  const names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile());
  const valid = [];
  const results = [];
  for (const n of names) {
    const p = parseFileName(n);
    if (p) valid.push({ n, key: `${p.fileDate} ${p.fileTime} ${p.unitCode}` });
    else if (/\.csv$/i.test(n)) results.push({ fileName: n, status: 'SKIPPED_NAME', error: 'Tên file không đúng mẫu' });
  }
  valid.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const v of valid) results.push(await importArrivalFile(db, path.join(dir, v.n), opts));
  return results;
}

// ------------------------------------------
// Thiếu đợt: mỗi ngày đã qua (từ ngày file sớm nhất của từng BCVH đến hôm qua) phải có >= 2 file đã nạp (OK/EMPTY).
// ------------------------------------------
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getMissingBatches(db, { today = localToday(), expectedPerDay = 2 } = {}) {
  const rows = db.prepare(`
    SELECT unit_code, file_date, COUNT(*) AS n FROM arrival_import_files
    WHERE status IN ('OK', 'EMPTY') GROUP BY unit_code, file_date
  `).all();
  const byUnit = new Map();
  for (const r of rows) {
    if (!byUnit.has(r.unit_code)) byUnit.set(r.unit_code, new Map());
    byUnit.get(r.unit_code).set(r.file_date, r.n);
  }
  const yesterday = addDays(today, -1);
  const missing = [];
  for (const [unit, days] of [...byUnit.entries()].sort()) {
    let d = [...days.keys()].sort()[0];
    while (d <= yesterday) {
      const n = days.get(d) || 0;
      if (n < expectedPerDay) missing.push({ unit_code: unit, date: d, file_count: n });
      d = addDays(d, 1);
    }
  }
  return missing;
}

module.exports = {
  EXPECTED_HEADER, FILE_NAME_RE, ArrivalFileError,
  ensureArrivalSchema, deriveArrival, ARRIVAL_SOURCES, importArrivalFile, importArrivalDirectory, getMissingBatches,
  refreshWardMap, setWardMapping, wardKey, parseUsDateTime, parseDateTimeCell, parseFileName, resolveHeader, readCsvRecords, COLUMNS, colKey
};
