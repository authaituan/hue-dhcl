// ==========================================
// Bảo vệ "ADMIN hoạt động cuối cùng" (04_DECISIONS.md #54): hệ thống luôn phải còn ít nhất 1 ADMIN hoạt động.
// Dùng ở routes/users.js khi hạ vai trò hoặc khoá một tài khoản.
// ==========================================
'use strict';
const { ROLES } = require('../roles');

const isActiveAdmin = (u) => !!u && u.role === ROLES.ADMIN && !u.deactivated_at;

// Số ADMIN còn hoạt động KHÁC tài khoản `excludeId`.
function countOtherActiveAdmins(db, excludeId) {
  return db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ? AND deactivated_at IS NULL AND id <> ?')
    .get(ROLES.ADMIN, excludeId).n;
}

// true nếu hạ vai trò / khoá `user` (hàng users: id, role, deactivated_at) sẽ làm mất ADMIN hoạt động cuối cùng.
function wouldRemoveLastAdmin(db, user) {
  return isActiveAdmin(user) && countOtherActiveAdmins(db, user.id) === 0;
}

module.exports = { isActiveAdmin, countOtherActiveAdmins, wouldRemoveLastAdmin };
