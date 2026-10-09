const express = require('express');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { hashPassword, verifyPassword, authRequired, requireAdmin } = require('../auth');
const { ROLES, VALID_ROLES, isValidRole } = require('../roles');
const { normalizeStr } = require('../lib/helpers');
const { wouldRemoveLastAdmin } = require('../lib/adminGuard');
const { VALID_BCVH_CODES, getAssignedBcvh, replaceAssignedBcvh } = require('../lib/userBcvh');

const router = express.Router();

// ==========================================
// 5. USER ADMINISTRATION API
// Mọi route quản trị tài khoản CHỈ ADMIN (04_DECISIONS.md #49); chỉ PUT /users/me/password mở cho mọi vai trò.
// ==========================================
const ROLE_ERROR = `Vai trò không hợp lệ (chỉ nhận: ${VALID_ROLES.join(', ')})`;

// Danh sách user — KHÔNG bao giờ trả password_hash (SELECT tường minh từng cột).
// CHỈ trả tài khoản đăng nhập THẬT (password_hash IS NOT NULL) — DB kế thừa có thể
// còn dòng users không có mật khẩu, không lẫn vào danh sách tài khoản đăng nhập.
router.get('/users', authRequired, requireAdmin, (req, res) => {
  try {
    // Vẫn trả về CẢ user đã vô hiệu hoá — UI cần thấy để biết ai đang bị khoá + có
    // nút Kích Hoạt Lại. `bcvh_codes` = mã BCVH đã gán (rỗng nếu không có).
    const users = db.prepare(`
      SELECT id, hrm_code, full_name, role, post_office_code, commune_code, post_office_id, created_at, deactivated_at
      FROM users
      WHERE password_hash IS NOT NULL
      ORDER BY created_at DESC
    `).all();
    const assigned = new Map();
    for (const r of db.prepare('SELECT user_id, bcvh_code FROM user_bcvh ORDER BY bcvh_code').all()) {
      if (!assigned.has(r.user_id)) assigned.set(r.user_id, []);
      assigned.get(r.user_id).push(r.bcvh_code);
    }
    res.json(users.map((u) => ({ ...u, bcvh_codes: assigned.get(u.id) || [] })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autocomplete "Người Phụ Trách" bưu cục: tối đa 10 user còn hoạt động khớp
// hrm_code HOẶC full_name (chuẩn hoá bỏ dấu, không phân biệt hoa thường).
// Đặt TRƯỚC các route /users/:id để route tĩnh không bị nuốt nhầm.
router.get('/users/search', authRequired, requireAdmin, (req, res) => {
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
// role: không gửi -> STAFF (quyền thấp nhất); có gửi thì phải thuộc danh sách hợp lệ, sai -> 400.
router.post('/users', authRequired, requireAdmin, (req, res) => {
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

    const finalRole = (role === undefined || role === null) ? ROLES.STAFF : (typeof role === 'string' ? role.trim() : role);
    if (!isValidRole(finalRole)) {
      return res.status(400).json({ error: ROLE_ERROR });
    }

    const trimmedHrmCode = hrm_code.trim();
    const existing = db.prepare("SELECT id FROM users WHERE hrm_code = ?").get(trimmedHrmCode);
    if (existing) {
      return res.status(400).json({ error: 'Mã HRM này đã tồn tại trong hệ thống' });
    }

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

// Sửa full_name/role của 1 user. Chặn: role ngoài danh sách (400), tự đổi role của chính mình,
// hạ vai trò ADMIN hoạt động cuối cùng. Rời vai trò GDVH thì xoá các dòng gán BCVH.
router.put('/users/:id', authRequired, requireAdmin, (req, res) => {
  try {
    const { full_name, role } = req.body || {};
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    let newRole = existing.role;
    if (role !== undefined) {
      const wanted = typeof role === 'string' ? role.trim() : role;
      if (!isValidRole(wanted)) return res.status(400).json({ error: ROLE_ERROR });
      newRole = wanted;
    }

    const wantsRoleChange = newRole !== existing.role;
    if (wantsRoleChange && req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Không thể tự đổi quyền (role) của chính mình, tránh tự khoá quyền quản lý' });
    }
    if (wantsRoleChange && wouldRemoveLastAdmin(db, existing)) {
      return res.status(400).json({ error: 'Không thể hạ vai trò của ADMIN hoạt động cuối cùng: hệ thống phải còn ít nhất một ADMIN' });
    }

    const finalFullName = (full_name !== undefined && typeof full_name === 'string' && full_name.trim())
      ? full_name.trim()
      : existing.full_name;

    db.transaction(() => {
      db.prepare("UPDATE users SET full_name = ?, role = ? WHERE id = ?").run(finalFullName, newRole, req.params.id);
      if (wantsRoleChange && existing.role === ROLES.GDVH) {
        db.prepare("DELETE FROM user_bcvh WHERE user_id = ?").run(req.params.id);
      }
    })();

    res.json({ message: 'Cập nhật người dùng thành công' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset mật khẩu cho user KHÁC — không cần biết mật khẩu cũ (chỉ ADMIN).
router.put('/users/:id/reset-password', authRequired, requireAdmin, (req, res) => {
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
// và mọi request tiếp theo của token cũ (authRequired tra DB mỗi request). Chặn tự vô hiệu hoá
// chính mình và chặn khoá ADMIN hoạt động cuối cùng.
router.put('/users/:id/deactivate', authRequired, requireAdmin, (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Không thể tự vô hiệu hoá chính tài khoản đang đăng nhập' });
    }

    const existing = db.prepare("SELECT id, role, deactivated_at FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (wouldRemoveLastAdmin(db, existing)) {
      return res.status(400).json({ error: 'Không thể khoá ADMIN hoạt động cuối cùng: hệ thống phải còn ít nhất một ADMIN' });
    }

    db.prepare("UPDATE users SET deactivated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

    res.json({ message: 'Đã vô hiệu hoá tài khoản' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Khôi phục tài khoản đã vô hiệu hoá (set deactivated_at = NULL).
router.put('/users/:id/reactivate', authRequired, requireAdmin, (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    db.prepare("UPDATE users SET deactivated_at = NULL WHERE id = ?").run(req.params.id);

    res.json({ message: 'Đã kích hoạt lại tài khoản' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gán BCVH cho GDVH (bảng user_bcvh, 04_DECISIONS.md #51). Chỉ ADMIN.
// Giới hạn theo BCVH chỉ áp ở xuất file (3c-3), không hạn chế dữ liệu xem (#52).
router.get('/users/:id/bcvh', authRequired, requireAdmin, (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json({ user_id: req.params.id, codes: getAssignedBcvh(req.params.id, db) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Thay TOÀN BỘ tập BCVH của một GDVH. codes rỗng hợp lệ (chưa được giao BCVH nào).
router.put('/users/:id/bcvh', authRequired, requireAdmin, (req, res) => {
  try {
    const { codes } = req.body || {};
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) {
      return res.status(400).json({ error: 'Trường codes phải là mảng mã BCVH (chuỗi)' });
    }
    const bad = codes.filter((c) => !VALID_BCVH_CODES.includes(c));
    if (bad.length) {
      return res.status(400).json({ error: `Mã BCVH không hợp lệ: ${[...new Set(bad)].join(', ')} (chỉ nhận: ${VALID_BCVH_CODES.join(', ')})` });
    }

    const existing = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (existing.role !== ROLES.GDVH) {
      return res.status(400).json({ error: 'Chỉ gán BCVH cho tài khoản có vai trò GDVH' });
    }

    const unique = [...new Set(codes)].sort();
    db.transaction(() => replaceAssignedBcvh(db, req.params.id, unique))();
    res.json({ message: 'Đã cập nhật BCVH được giao', user_id: req.params.id, codes: unique });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tự đổi mật khẩu CỦA CHÍNH MÌNH — chỉ cần authRequired (KHÔNG cần
// requireAdmin, mọi vai trò đều tự đổi được). Bắt buộc verify
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
