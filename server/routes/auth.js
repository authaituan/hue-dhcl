const express = require('express');
const db = require('../db');
const { signToken, verifyPassword } = require('../auth');

const router = express.Router();

// ==========================================
// Rate limit đăng nhập: chống brute-force đoán mật khẩu.
// Giới hạn theo cặp (IP + hrm_code) — không chặn nhầm nhiều người dùng
// chung 1 mạng (NAT/wifi công ty) đăng nhập các tài khoản KHÁC nhau, chỉ
// chặn việc dò mật khẩu liên tục nhắm vào 1 tài khoản cụ thể.
// Lưu trong bộ nhớ tiến trình (Map, không dùng DB/Redis) — đủ dùng cho quy
// mô 1 instance hiện tại; sẽ tự reset khi restart server (đánh đổi chấp
// nhận được, không phải phòng thủ tuyệt đối cho hệ thống nhiều instance).
// IP lấy từ req.clientIp (server/security.js): chỉ tin X-Forwarded-For khi
// kết nối đến từ proxy khai báo trong TRUSTED_PROXIES.
// Thêm 1 trần THEO IP (LOGIN_IP_MAX_FAILS lần sai / 15 phút, mọi tài khoản cộng
// dồn): chặn 1 máy dò lần lượt nhiều tài khoản, mỗi tài khoản vài lần.
// ==========================================
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const LOGIN_IP_MAX_FAILS = Number(process.env.LOGIN_IP_MAX_FAILS) || 20;
const loginAttempts = new Map(); // key: "ip|hrm_code" hoặc "ip|*" -> { count, windowStart }

function getLoginRateLimitKey(req, hrmCode) {
  return `${req.clientIp || req.ip}|${hrmCode}`;
}

function getLoginIpKey(req) {
  return `${req.clientIp || req.ip}|*`;
}

function checkLoginRateLimit(key, max = LOGIN_MAX_ATTEMPTS) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    return { limited: false };
  }
  if (entry.count >= max) {
    const retryAfterMs = LOGIN_WINDOW_MS - (now - entry.windowStart);
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  return { limited: false };
}

function recordFailedLogin(key) {
  const now = Date.now();
  if (loginAttempts.size > 10000) {
    // Dọn mục đã hết cửa sổ để Map không phình vô hạn khi bị dò liên tục.
    for (const [k, v] of loginAttempts) {
      if (now - v.windowStart > LOGIN_WINDOW_MS) loginAttempts.delete(k);
    }
  }
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

// ==========================================
// 0. AUTHENTICATION API (Đăng nhập + JWT)
// ==========================================
// POST /api/auth/login  { hrm_code, password }
// Trả về JWT nếu hợp lệ. Dùng token này ở header cho các route ghi:
//   Authorization: Bearer <token>
router.post('/auth/login', (req, res) => {
  try {
    const { hrm_code, password } = req.body || {};
    if (!hrm_code || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập mã HRM và mật khẩu' });
    }

    const rateLimitKey = getLoginRateLimitKey(req, hrm_code);
    const ipKey = getLoginIpKey(req);
    const ipCheck = checkLoginRateLimit(ipKey, LOGIN_IP_MAX_FAILS);
    const accountCheck = checkLoginRateLimit(rateLimitKey);
    const rateLimitCheck = ipCheck.limited ? ipCheck : accountCheck;
    if (rateLimitCheck.limited) {
      req.app.locals.security.log({ event: 'login_limited', ip: req.clientIp, hrm_code: String(hrm_code).slice(0, 50), scope: ipCheck.limited ? 'ip' : 'account' });
      res.set('Retry-After', String(rateLimitCheck.retryAfterSeconds));
      return res.status(429).json({
        error: `Đăng nhập sai quá nhiều lần, vui lòng thử lại sau ${Math.ceil(rateLimitCheck.retryAfterSeconds / 60)} phút`
      });
    }

    const user = db.prepare("SELECT * FROM users WHERE hrm_code = ?").get(hrm_code);
    // Thông báo chung để tránh lộ thông tin tài khoản tồn tại hay không.
    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      recordFailedLogin(rateLimitKey);
      recordFailedLogin(ipKey);
      req.app.locals.security.log({ event: 'login_fail', ip: req.clientIp, hrm_code: String(hrm_code).slice(0, 50) });
      return res.status(401).json({ error: 'Mã HRM hoặc mật khẩu không đúng' });
    }

    // Mật khẩu đúng nhưng tài khoản đã bị vô hiệu hoá -> vẫn chặn đăng nhập, dùng
    // message RIÊNG (khác lỗi sai mật khẩu) để người dùng biết rõ cần liên hệ quản
    // trị viên. Kiểm tra SAU KHI verify mật khẩu đúng (không phải trước) để tránh lộ
    // trạng thái vô hiệu hoá của 1 tài khoản cho người chưa chứng minh biết mật khẩu.
    if (user.deactivated_at) {
      req.app.locals.security.log({ event: 'login_deactivated', ip: req.clientIp, hrm_code: user.hrm_code });
      return res.status(401).json({ error: 'Tài khoản đã bị vô hiệu hoá, vui lòng liên hệ quản trị viên' });
    }

    clearLoginAttempts(rateLimitKey);
    req.app.locals.security.log({ event: 'login_ok', ip: req.clientIp, hrm_code: user.hrm_code });
    const token = signToken(user);
    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        hrm_code: user.hrm_code,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
