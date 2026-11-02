// ==========================================
// Allowlist theo vai trò, TỪ CHỐI MẶC ĐỊNH (khái quát hoá cơ chế TIVI, #74; vai trò TTKT: docs/ai/04_DECISIONS.md #123).
//  - Vai trò CÓ trong ALLOWLIST_THEO_VAI_TRO thì CHỈ được các mục khai báo; mọi request /api khác -> 403 (kể cả route chỉ có
//    authRequired và route thêm sau này). Vai trò không có trong bảng (ADMIN, TTVH, GDVH) không bị lớp này chặn, dùng requireRoles ở từng route.
//  - Mục dạng 'METHOD /đường-dẫn' khớp CHÍNH XÁC; mục kết thúc bằng '/**' khớp theo TIỀN TỐ ĐOẠN đường dẫn ('/api/ktt/**' khớp '/api/ktt/meta', KHÔNG khớp '/api/kttx').
//  - authRequired (server/auth.js) gọi vaiTroAllows() ở MỌI request /api, SAU khi tra DB lấy vai trò thật và TRƯỚC mọi guard của route.
// ==========================================
'use strict';

const path = require('path');
const { ROLES } = require('../roles');
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

/** Vai trò có allowlist không (có -> bị từ chối mặc định). */
const coAllowlist = (role) => Object.prototype.hasOwnProperty.call(ALLOWLIST_THEO_VAI_TRO, role);

/** Request có thuộc allowlist của vai trò không (vai trò không có allowlist -> true, lớp này không chặn). */
function vaiTroAllows(role, req) {
  if (!coAllowlist(role)) return true;
  const p = chuanHoaDuongDan(req.originalUrl);
  if (p === null) return false;
  return ALLOWLIST_THEO_VAI_TRO[role].some((m) => khop(m, req.method, p));
}

module.exports = { ALLOWLIST_THEO_VAI_TRO, chuanHoaDuongDan, coAllowlist, vaiTroAllows };
