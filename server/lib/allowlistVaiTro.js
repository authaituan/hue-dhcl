// ==========================================
// Allowlist theo vai trò, TỪ CHỐI MẶC ĐỊNH (khái quát hoá cơ chế TIVI, #74; vai trò TTKT: docs/ai/04_DECISIONS.md #123).
//  - Nhóm TOÀN QUYỀN (VAI_TRO_TOAN_QUYEN = VIEWER_ROLES: ADMIN, TTVH, GDVH) không bị lớp này chặn, dùng requireRoles ở từng route.
//  - MỌI vai trò hợp lệ khác chỉ được các mục khai báo trong ALLOWLIST_THEO_VAI_TRO; mọi request /api khác -> 403 (kể cả route chỉ có
//    authRequired và route thêm sau này). Vai trò KHÔNG có mục trong bảng -> allowlist RỖNG (từ chối tất cả), không bao giờ được mở (KTT-ROLE-1b).
//  - Mục dạng 'METHOD /đường-dẫn' khớp CHÍNH XÁC; mục kết thúc bằng '/**' khớp theo TIỀN TỐ ĐOẠN đường dẫn ('/api/ktt/**' khớp '/api/ktt/meta', KHÔNG khớp '/api/kttx').
//  - authRequired (server/auth.js) gọi vaiTroAllows() ở MỌI request /api, SAU khi tra DB lấy vai trò thật và TRƯỚC mọi guard của route.
// ==========================================
'use strict';

const path = require('path');
const { ROLES, VIEWER_ROLES } = require('../roles');
const { TIVI_ALLOWED } = require('./tivi');

const ALLOWLIST_THEO_VAI_TRO = Object.freeze({
  [ROLES.TIVI]: TIVI_ALLOWED,
  // TTKT: CHỈ module «Hàng tại Khai thác tỉnh» (chỉ đọc) + hai route chung bắt buộc.
  [ROLES.TTKT]: Object.freeze([
    'GET /api/ktt/**',
    'GET /api/auth/me',
    'PUT /api/users/me/password'
  ])
});

/** Nhóm toàn quyền ở lớp allowlist (bằng nhóm xem dữ liệu của server/roles.js; mỗi route vẫn tự dùng requireRoles). */
const VAI_TRO_TOAN_QUYEN = VIEWER_ROLES;

/** Chuẩn hoá đường dẫn trước khi so: bỏ query, giải mã MỘT lần (còn '%' hoặc '\' sau đó -> null = từ chối), chữ thường, gộp '//', xử lý '.' '..', bỏ '/' cuối. */
function chuanHoaDuongDan(originalUrl) {
  const raw = String(originalUrl || '').split('?')[0].split('#')[0];
  let p;
  try {
    p = decodeURIComponent(raw);
  } catch (err) {
    return null;
  }
  if (p.includes('%') || p.includes('\\') || p.includes('\0')) return null;
  p = path.posix.normalize(p.toLowerCase().replace(/\/{2,}/g, '/'));
  p = p.replace(/\/+$/, '');
  return p.startsWith('/') ? p : null;
}

function khop(muc, method, p) {
  const sp = muc.indexOf(' ');
  const mMuc = muc.slice(0, sp);
  const pMuc = muc.slice(sp + 1);
  if (mMuc !== method) return false;
  if (pMuc.endsWith('/**')) return p.startsWith(pMuc.slice(0, -2)); // giữ '/' cuối: '/api/ktt/'
  return p === pMuc;
}

/** Allowlist của vai trò ngoài nhóm toàn quyền: các mục khai báo; KHÔNG có mục -> rỗng (từ chối mọi request). */
function allowlistCua(role) {
  return Object.prototype.hasOwnProperty.call(ALLOWLIST_THEO_VAI_TRO, role) ? ALLOWLIST_THEO_VAI_TRO[role] : [];
}

/** Request có thuộc allowlist của vai trò không (nhóm toàn quyền -> true; vai trò khác không có mục -> false). */
function vaiTroAllows(role, req) {
  if (VAI_TRO_TOAN_QUYEN.includes(role)) return true;
  const p = chuanHoaDuongDan(req.originalUrl);
  if (p === null) return false;
  return allowlistCua(role).some((m) => khop(m, req.method, p));
}

module.exports = { ALLOWLIST_THEO_VAI_TRO, VAI_TRO_TOAN_QUYEN, chuanHoaDuongDan, allowlistCua, vaiTroAllows };
