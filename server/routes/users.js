const express = require('express');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { hashPassword, verifyPassword, authRequired, requireManager } = require('../auth');
const { normalizeStr } = require('../lib/helpers');

const router = express.Router();

// ==========================================
// 5. USER ADMINISTRATION API
// ==========================================
// Danh sách user — KHÔNG bao giờ trả password_hash (SELECT tường minh từng cột).
// CHỈ trả tài khoản đăng nhập THẬT (password_hash IS NOT NULL) — DB kế thừa có thể
// còn dòng users không có mật khẩu, không lẫn vào danh sách tài khoản đăng nhập.
router.get('/users', authRequired, requireManager, (req, res) => {
  try {
    // Vẫn trả về CẢ user đã vô hiệu hoá — UI cần thấy để biết ai đang bị khoá + có
    // nút Kích Hoạt Lại.
    const users = db.prepare(`
      SELECT id, hrm_code, full_name, role, post_office_code, commune_code, post_office_id, created_at, deactivated_at
      FROM users
      WHERE password_hash IS NOT NULL
      ORDER BY created_at DESC
    `).all();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autocomplete "Người Phụ Trách" bưu cục: tối đa 10 user còn hoạt động khớp
// hrm_code HOẶC full_name (chuẩn hoá bỏ dấu, không phân biệt hoa thường).
// Đặt TRƯỚC các route /users/:id để route tĩnh không bị nuốt nhầm.
router.get('/users/search', authRequired, requireManager, (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const normQ = normalizeStr(q);
    const all = db.prepare(`
      SELECT id, hrm_code, full_name, post_office_code, commune_code
      FROM users
      WHERE deactivated_at IS NULL
      ORDER BY created_at DESC
    `).all();

    const results = all.filter((u) => {
      const normHrm = normalizeStr(u.hrm_code);
      const normName = normalizeStr(u.full_name);
      return normHrm.includes(normQ) || normName.includes(normQ);
    }).slice(0, 10);

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tạo user mới. hrm_code bắt buộc + unique, password bắt buộc >= 6 ký tự,
// hash bằng hashPassword() trước khi lưu (không bao giờ lưu plaintext).
router.post('/users', authRequired, requireManager, (req, res) => {
  try {
    const { hrm_code, full_name, role, password } = req.body || {};

    if (!hrm_code || typeof hrm_code !== 'string' || !hrm_code.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Mã HRM' });
    }
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Họ và Tên' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const trimmedHrmCode = hrm_code.trim();
    const existing = db.prepare("SELECT id FROM users WHERE hrm_code = ?").get(trimmedHrmCode);
    if (existing) {
      return res.status(400).json({ error: 'Mã HRM này đã tồn tại trong hệ thống' });
    }

    const finalRole = (role && typeof role === 'string' && role.trim()) ? role.trim() : 'STAFF';
    const id = uuidv4();

    db.prepare(`
      INSERT INTO users (id, hrm_code, full_name, role, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, trimmedHrmCode, full_name.trim(), finalRole, hashPassword(password));

    res.status(201).json({
      message: 'Tạo tài khoản người dùng thành công',
      id,
      hrm_code: trimmedHrmCode,
      full_name: full_name.trim(),
      role: finalRole
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sửa full_name/role của 1 user. Chặn tự đổi role của chính mình (so
// req.user.id với :id) để tránh tự khoá quyền quản lý của chính mình.
router.put('/users/:id', authRequired, requireManager, (req, res) => {
  try {
    const { full_name, role } = req.body || {};
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    const wantsRoleChange = role !== undefined && typeof role === 'string' && role.trim() && role.trim() !== existing.role;
    if (wantsRoleChange && req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Không thể tự đổi quyền (role) của chính mình, tránh tự khoá quyền quản lý' });
    }

    const finalFullName = (full_name !== undefined && typeof full_name === 'string' && full_name.trim())
      ? full_name.trim()
      : existing.full_name;
    const finalRole = wantsRoleChange ? role.trim() : existing.role;

    db.prepare("UPDATE users SET full_name = ?, role = ? WHERE id = ?").run(finalFullName, finalRole, req.params.id);

    res.json({ message: 'Cập nhật người dùng thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset mật khẩu cho user KHÁC — không cần biết mật khẩu cũ (dùng cho quản lý).
router.put('/users/:id/reset-password', authRequired, requireManager, (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), req.params.id);

    res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vô hiệu hoá tài khoản (KHÔNG xoá cứng, chỉ set deactivated_at) — chặn đăng nhập
// từ lần sau (xem POST /api/auth/login). Chặn tự vô hiệu hoá chính mình (so
// req.user.id với :id) — copy đúng pattern đã dùng để chặn tự đổi role.
router.put('/users/:id/deactivate', authRequired, requireManager, (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Không thể tự vô hiệu hoá chính tài khoản đang đăng nhập' });
    }

    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    db.prepare("UPDATE users SET deactivated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

    res.json({ message: 'Đã vô hiệu hoá tài khoản' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Khôi phục tài khoản đã vô hiệu hoá (set deactivated_at = NULL).
router.put('/users/:id/reactivate', authRequired, requireManager, (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    db.prepare("UPDATE users SET deactivated_at = NULL WHERE id = ?").run(req.params.id);

    res.json({ message: 'Đã kích hoạt lại tài khoản' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tự đổi mật khẩu CỦA CHÍNH MÌNH — chỉ cần authRequired (KHÔNG cần
// requireManager, mọi user kể cả STAFF đều tự đổi được). Bắt buộc verify
// đúng mật khẩu hiện tại trước khi cho đổi.
router.put('/users/me/password', authRequired, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), req.user.id);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
