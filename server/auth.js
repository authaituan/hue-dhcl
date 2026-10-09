// ==========================================
// AUTH MODULE - JWT + RBAC (Role-Based Access Control)
// 4 vai trò có tên (server/roles.js): ADMIN, TTVH, GDVH, STAFF. Quyền theo từng route dùng
// requireRoles(...) với danh sách tường minh (docs/ai/04_DECISIONS.md #49–#50).
// Dùng crypto built-in cho password hashing (scrypt) - KHÔNG thêm native dep.
// ==========================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ROLES, isValidRole } = require('./roles');

// Secret BẮT BUỘC lấy từ ENV (hoặc .env). Thiếu -> server không khởi động, trừ khi
// ALLOW_INSECURE_DEV=1 (chỉ cho máy dev: dùng secret mặc định, ai đọc mã nguồn cũng biết).
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.ALLOW_INSECURE_DEV === '1') {
    JWT_SECRET = 'dev-hue-dhcl-secret-change-me';
    console.warn('[auth] CẢNH BÁO: ALLOW_INSECURE_DEV=1, đang dùng JWT_SECRET mặc định cho DEV. KHÔNG dùng cho production.');
  } else {
    throw new Error('[auth] Thiếu JWT_SECRET: đặt biến môi trường hoặc file .env (xem docs/ai/06_DEPLOYMENT.md mục 1). Chỉ khi dev mới dùng ALLOW_INSECURE_DEV=1.');
  }
}
const TOKEN_EXPIRY = process.env.JWT_EXPIRY || '8h';

// ------------------------------------------
// Password hashing (scrypt) — lưu dạng "salt:hash" hex
// ------------------------------------------
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const hashBuf = Buffer.from(hash, 'hex');
  const derivedBuf = Buffer.from(derived, 'hex');
  if (hashBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, derivedBuf);
}

// ------------------------------------------
// JWT sign
// ------------------------------------------
function signToken(user) {
  const payload = {
    id: user.id,
    hrm_code: user.hrm_code || null,
    full_name: user.full_name || null,
    role: user.role || ROLES.STAFF
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// ------------------------------------------
// Middleware: bắt buộc token hợp lệ VÀ tra DB ở MỌI request (quyết định #50):
//   - vai trò và trạng thái khoá lấy từ DB, KHÔNG tin vai trò trong token
//     (đổi vai trò / khoá tài khoản có hiệu lực ngay, token cũ vẫn dùng được nếu còn quyền);
//   - tài khoản bị khoá hoặc không còn -> 401; vai trò ngoài danh sách hợp lệ (vd MANAGER chưa chuyển đổi) -> 403.
// db.js được nạp LƯỜI ở lần gọi đầu: fixtures/script require auth.js chỉ để băm mật khẩu, không được
// mở nhầm data/hue-dhcl.db.
// ------------------------------------------
let userStateStmt = null;
function getUserState(id) {
  if (!userStateStmt) userStateStmt = require('./db').prepare('SELECT role, deactivated_at FROM users WHERE id = ?');
  return userStateStmt.get(id);
}

function authRequired(req, res, next) {
  // index.js đã áp authRequired cho mọi /api; route gắn thêm lần nữa thì không tra DB lần hai.
  if (req.authChecked) return next();
  const header = req.headers['authorization'] || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Thiếu hoặc sai định dạng token (Authorization: Bearer <token>)' });
  }
  let decoded;
  try {
    decoded = jwt.verify(parts[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
  let state;
  try {
    state = getUserState(decoded.id);
  } catch (err) {
    console.error('Auth lookup error:', err);
    return res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra tài khoản' });
  }
  if (!state || state.deactivated_at) {
    return res.status(401).json({ error: 'Tài khoản không còn hoạt động hoặc đã bị vô hiệu hoá, vui lòng đăng nhập lại hoặc liên hệ quản trị viên' });
  }
  if (!isValidRole(state.role)) {
    return res.status(403).json({ error: 'Vai trò của tài khoản không hợp lệ, vui lòng liên hệ quản trị viên' });
  }
  req.user = { ...decoded, role: state.role };
  req.authChecked = true;
  next();
}

// ------------------------------------------
// Middleware: chỉ cho các vai trò liệt kê TƯỜNG MINH (chạy SAU authRequired).
// Không có quy tắc "khác STAFF": vai trò không nằm trong danh sách đều bị 403.
// ------------------------------------------
function makeRoleGuard(allowed, message) {
  return function requireRolesMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa xác thực' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: message });
    }
    next();
  };
}

function requireRoles(...roles) {
  return makeRoleGuard(roles.flat(), 'Không đủ quyền thực hiện thao tác này');
}

// Lớp bọc mỏng: chỉ ADMIN.
const requireAdmin = makeRoleGuard([ROLES.ADMIN], 'Không đủ quyền: chỉ quản trị viên (ADMIN) mới được thực hiện thao tác này');

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  authRequired,
  requireRoles,
  requireAdmin,
  JWT_SECRET,
  TOKEN_EXPIRY
};
