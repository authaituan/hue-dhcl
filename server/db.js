const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'hue-dhcl.db');
const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize database schema tables
db.exec(`
  -- Province table (BĐT/TP)
  CREATE TABLE IF NOT EXISTS province_post_offices (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Commune table (BĐX - Bưu điện Xã)
  CREATE TABLE IF NOT EXISTS commune_post_offices (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    central_commune_code TEXT,
    province_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(province_id) REFERENCES province_post_offices(id)
  );

  -- Post Office table (MBC - Bưu cục)
  CREATE TABLE IF NOT EXISTS post_offices (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'GD3',
    address TEXT,
    commune_id TEXT NOT NULL,
    bdkv_code TEXT,
    bdkv_name TEXT,
    has_computer INTEGER DEFAULT 1,
    old_ward_code TEXT,          -- Mã Phường/Xã CŨ (trước sáp nhập)
    old_ward_name TEXT,          -- Tên Phường/Xã CŨ
    district_name TEXT,          -- Tên Quận/Huyện
    new_ward_code TEXT,          -- Mã Phường/Xã MỚI (sau sáp nhập)
    new_ward_name TEXT,          -- Tên Phường/Xã MỚI
    phone TEXT,                  -- Số điện thoại bưu cục
    operational_status TEXT DEFAULT 'ACTIVE', -- Tình trạng hoạt động
    latitude REAL,               -- Vĩ độ (toạ độ bản đồ)
    longitude REAL,              -- Kinh độ
    responsible_user_id TEXT,    -- Người Phụ Trách bưu cục (users.id). KHÔNG có FOREIGN
                                  -- KEY cứng — validate ở tầng ứng dụng.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(commune_id) REFERENCES commune_post_offices(id)
  );

  -- User table (tài khoản đăng nhập, khoá theo mã HRM)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    hrm_code TEXT UNIQUE,
    full_name TEXT NOT NULL,
    raw_name TEXT,
    post_office_code TEXT,
    commune_code TEXT,
    post_office_id TEXT,
    role TEXT DEFAULT 'STAFF',
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deactivated_at DATETIME DEFAULT NULL, -- vô hiệu hoá: NULL = còn hoạt động, có giá trị = đã bị khoá
    FOREIGN KEY(post_office_id) REFERENCES post_offices(id)
  );
`);

// ==========================================
// Bảng dashboard_widgets (Dashboard động). Idempotent; seed bộ ô mặc định khi bảng RỖNG.
// kind SYSTEM = ô cố định do code tính (chỉ đổi title/size/visible, không xoá);
// kind CHART = biểu đồ tuỳ chỉnh theo cấu hình (nguồn/nhóm theo/bộ lọc đều qua whitelist,
// xem server/lib/dashboardSources.js). Cấu hình áp dụng cho mọi người dùng.
// ==========================================
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_widgets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('SYSTEM', 'CHART')),
      system_key TEXT UNIQUE,
      title TEXT NOT NULL,
      source TEXT,
      group_by TEXT,
      chart_type TEXT,
      top_n INTEGER DEFAULT 10,
      filters TEXT,
      size TEXT NOT NULL DEFAULT 'M' CHECK (size IN ('S', 'M', 'L', 'XL', 'FULL')),
      position INTEGER NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  require('./lib/dashboardDefaults').seedDefaultWidgets(db);
} catch (err) {
  console.error('[db] Lỗi tạo bảng dashboard_widgets:', err.message);
}

// ==========================================
// Dữ liệu "Hàng đến" (arrival_import_files, arrival_items, ward_bdx_map). Idempotent.
// Schema đặt trong server/lib/arrivalsImport.js để công cụ dòng lệnh dùng chung trên DB bất kỳ.
// ==========================================
try {
  require('./lib/arrivalsImport').ensureArrivalSchema(db);
} catch (err) {
  console.error('[db] Lỗi tạo bảng dữ liệu Hàng đến:', err.message);
}

// ==========================================
// Gán GDVH ↔ BCVH (user_bcvh). Idempotent. Schema đặt trong server/lib/userBcvh.js.
// ==========================================
try {
  require('./lib/userBcvh').ensureUserBcvhSchema(db);
} catch (err) {
  console.error('[db] Lỗi tạo bảng user_bcvh:', err.message);
}

module.exports = db;
