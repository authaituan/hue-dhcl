// ==========================================
// AUTH MODULE - JWT + RBAC (Role-Based Access Control)
// Nguyên tắc tạm thời (PO sẽ chốt chi tiết sau):
//   - STAFF: chỉ đọc (read-only)
//   - Role quản lý (khác STAFF, vd ADMIN/MANAGER): được ghi (write)
// Dùng crypto built-in cho password hashing (scrypt) - KHÔNG thêm native dep.
// ==========================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

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
    role: user.role || 'STAFF'
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// ------------------------------------------
// Role helper: quản lý = bất kỳ role nào KHÁC 'STAFF'
// ------------------------------------------
function isManager(role) {
  return !!role && role !== 'STAFF';
}

// ------------------------------------------
// Middleware: bắt buộc có token hợp lệ (dùng cho route ghi POST/PUT)
// ------------------------------------------
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Thiếu hoặc sai định dạng token (Authorization: Bearer <token>)' });
  }
  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

// ------------------------------------------
// Middleware: bắt buộc role quản lý (chạy SAU authRequired)
// STAFF chỉ đọc -> chặn ghi tại đây.
// ------------------------------------------
function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Chưa xác thực' });
  }
  if (!isManager(req.user.role)) {
    return res.status(403).json({ error: 'Không đủ quyền: chỉ role quản lý mới được thao tác ghi (STAFF chỉ đọc)' });
  }
  next();
}

// ------------------------------------------
// Middleware: chỉ role ADMIN (chạy SAU authRequired). Dùng cho cấu hình dashboard.
// So khớp đúng giá trị role đang lưu ('ADMIN').
// ------------------------------------------
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Chưa xác thực' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Không đủ quyền: chỉ quản trị viên (ADMIN) mới được cấu hình Dashboard' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  isManager,
  authRequired,
  requireManager,
  requireAdmin,
  JWT_SECRET,
  TOKEN_EXPIRY
};
