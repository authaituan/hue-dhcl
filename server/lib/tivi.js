// ==========================================
// Vai trò TIVI — màn hình tivi chạy 24/24, CHỈ xem dashboard phần «đến» (DASH-3, docs/ai/04_DECISIONS.md #74).
//  - Allowlist, TỪ CHỐI MẶC ĐỊNH: authRequired (server/auth.js) gọi tiviAllows() ở MỌI request /api của tài khoản TIVI;
//    ngoài các cặp "PHƯƠNG THỨC đường dẫn" dưới đây đều 403 (kể cả route chỉ có authRequired, route thêm sau này).
//  - Phạm vi (scope): 'all' (toàn Trung tâm) hoặc MỘT mã trong 6 BCVH; lưu ở bảng riêng user_tivi_scope
//    (KHÔNG dùng user_bcvh — bảng đó vẫn chỉ là BCVH được giao của GDVH, #51).
// ==========================================
'use strict';

const TIVI_SCOPE_ALL = 'all';

// Đường dẫn đầy đủ (chữ thường, không có "/" cuối). Thêm endpoint cho TIVI = thêm dòng ở đây VÀ quyết định của PO.
const TIVI_ALLOWED = Object.freeze([
  'GET /api/auth/me',
  'GET /api/arrivals/dashboard/tong-quan-den',
  'GET /api/arrivals/dashboard/viec-can-lam',
  'GET /api/arrivals/dashboard/phuong-xa-tang'
]);

/** Request có thuộc allowlist của TIVI không. Đường dẫn được giải mã, đổi chữ thường, bỏ "/" cuối (Express khớp route không phân biệt hoa thường). */
function tiviAllows(req) {
  const raw = String(req.originalUrl || '').split('?')[0];
  let p;
  try {
    p = decodeURIComponent(raw);
  } catch (err) {
    return false;
  }
  p = p.toLowerCase().replace(/\/+$/, '');
  return TIVI_ALLOWED.includes(`${req.method} ${p}`);
}

// Idempotent, gọi từ server/db.js. Một dòng cho mỗi tài khoản TIVI đã được gán phạm vi.
function ensureTiviSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tivi_scope (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      scope TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Mã 6 BCVH nạp lười (giữ auth.js nhẹ, không kéo theo module truy vấn khi chỉ cần allowlist).
function validScopes() {
  return [TIVI_SCOPE_ALL, ...require('./userBcvh').VALID_BCVH_CODES];
}
const isValidTiviScope = (s) => typeof s === 'string' && validScopes().includes(s);

/** Phạm vi của tài khoản (null nếu chưa gán). */
function getTiviScope(db, userId) {
  const r = db.prepare('SELECT scope FROM user_tivi_scope WHERE user_id = ?').get(userId);
  return r ? r.scope : null;
}

/** Gán (scope là chuỗi hợp lệ) hoặc xoá (scope null) phạm vi. Gọi trong transaction của caller nếu cần. */
function setTiviScope(db, userId, scope) {
  if (scope === null) {
    db.prepare('DELETE FROM user_tivi_scope WHERE user_id = ?').run(userId);
    return;
  }
  db.prepare(`INSERT INTO user_tivi_scope (user_id, scope) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET scope = excluded.scope, updated_at = CURRENT_TIMESTAMP`).run(userId, scope);
}

module.exports = { TIVI_SCOPE_ALL, TIVI_ALLOWED, tiviAllows, ensureTiviSchema, validScopes, isValidTiviScope, getTiviScope, setTiviScope };
