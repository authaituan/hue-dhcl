// ==========================================
// VAI TRÒ NGƯỜI DÙNG — MỘT nơi định nghĩa duy nhất (docs/ai/04_DECISIONS.md #49).
// Chuỗi ASCII, chữ hoa. Mọi chỗ so khớp vai trò (server, script) dùng module này,
// không viết lại chuỗi 'ADMIN' / 'STAFF'... ở nơi khác.
// ==========================================
'use strict';

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  TTVH: 'TTVH',
  GDVH: 'GDVH',
  STAFF: 'STAFF'
});

// Danh sách vai trò hợp lệ (thứ tự dùng cho thông báo lỗi / giao diện).
const VALID_ROLES = Object.freeze([ROLES.ADMIN, ROLES.TTVH, ROLES.GDVH, ROLES.STAFF]);

// Nhóm được XEM dữ liệu "Hàng đến", Dashboard điều hành và danh sách mạng lưới.
const VIEWER_ROLES = Object.freeze([ROLES.ADMIN, ROLES.TTVH, ROLES.GDVH]);

// Tên cũ cần chuyển đổi một lần (scripts/migrate-roles.js). KHÔNG còn hợp lệ ở runtime.
const LEGACY_ROLE_MAP = Object.freeze({ MANAGER: ROLES.TTVH });

function isValidRole(role) {
  return typeof role === 'string' && VALID_ROLES.includes(role);
}

module.exports = { ROLES, VALID_ROLES, VIEWER_ROLES, LEGACY_ROLE_MAP, isValidRole };
