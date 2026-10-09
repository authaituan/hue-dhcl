// ==========================================
// Gán GDVH ↔ BCVH (bảng user_bcvh, nhiều-nhiều; hiện mỗi GDVH được gán 1 BCVH) — 04_DECISIONS.md #51.
// Giới hạn này CHỈ áp cho xuất file (SANLUONG-3c-3), KHÔNG hạn chế dữ liệu xem (#52).
// ==========================================
'use strict';
const { DASHBOARD_BCVH } = require('./dashboardQuery');

const VALID_BCVH_CODES = DASHBOARD_BCVH.map((b) => b.ma);

// Idempotent, gọi từ server/db.js. Khoá ngoại tới users(id): tài khoản không bị xoá cứng (chỉ khoá).
function ensureUserBcvhSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_bcvh (
      user_id TEXT NOT NULL REFERENCES users(id),
      bcvh_code TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, bcvh_code)
    );
  `);
}

// Mã BCVH đã gán cho một tài khoản (mảng, sắp tăng dần; rỗng nếu chưa gán). 3c-3 gọi hàm này khi xuất file.
// Tham số db tuỳ chọn (script/test); mặc định dùng DB của server (nạp lười để require file này không mở DB).
function getAssignedBcvh(userId, db = require('../db')) {
  return db.prepare('SELECT bcvh_code FROM user_bcvh WHERE user_id = ? ORDER BY bcvh_code').all(userId).map((r) => r.bcvh_code);
}

// Thay TOÀN BỘ tập BCVH của một tài khoản. Gọi trong transaction của caller nếu cần gộp với việc khác.
function replaceAssignedBcvh(db, userId, codes) {
  db.prepare('DELETE FROM user_bcvh WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO user_bcvh (user_id, bcvh_code) VALUES (?, ?)');
  for (const code of codes) ins.run(userId, code);
}

module.exports = { VALID_BCVH_CODES, ensureUserBcvhSchema, getAssignedBcvh, replaceAssignedBcvh };
