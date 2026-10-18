const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../auth');
const { ROLES } = require('../roles');
const { parseFloatOrNull } = require('../lib/helpers');
const { resolveOrCreateOrgChain } = require('../lib/orgImport');

const router = express.Router();

// ==========================================
// QUẢN LÝ MẠNG LƯỚI (Network Management) — feat/network-management-backend
// ------------------------------------------------------------------
// Danh mục chuẩn BẮT BUỘC (Phương án B, PO chốt 2026-08-17). CHỈ các route dưới
// đây (cùng resolveOrCreateOrgChain) mới được tạo/sửa/xoá Tỉnh/BĐX/Bưu cục.
// post_offices có thêm 9 cột mới (old_ward_*, district_name, new_ward_*, phone,
// operational_status, latitude, longitude).
// Bảng 20 field JSON (import ⇄ export dùng CHUNG key): xem 03_ARCHITECTURE_MAP.md.
// Quyền: TOÀN BỘ module (đọc, ghi, nhập, xuất, xoá) chỉ ADMIN (THEME-1; trước đó 04_DECISIONS.md #49, #53 cho TTVH/GDVH đọc).
// ==========================================

// GET /api/network — danh sách bưu cục đầy đủ (join commune/province), hỗ trợ
// search (mã HOẶC tên bưu cục), lọc communeId, phân trang.
router.get('/network', authRequired, requireRoles(ROLES.ADMIN), (req, res) => {
  try {
    const { search, communeId, page = 1, limit = 20 } = req.query;

    let whereClause = ["1=1"];
    let params = [];

    if (search && search.trim()) {
      // Mở rộng (feat/network-submenu-restructure): khớp thêm cả Loại hình (p.type)
      // và Tình trạng hoạt động (p.operational_status), không chỉ mã/tên như trước.
      whereClause.push("(p.code LIKE ? OR p.name LIKE ? OR p.type LIKE ? OR p.operational_status LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (communeId) {
      whereClause.push("p.commune_id = ?");
      params.push(communeId);
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const countSql = `SELECT COUNT(*) as total FROM post_offices p WHERE ${whereClause.join(' AND ')}`;
    const total = db.prepare(countSql).get(...params).total;

    const items = db.prepare(`
      SELECT
        p.*,
        c.code as commune_code, c.name as commune_name,
        pv.code as province_code, pv.name as province_name,
        ur.full_name as responsible_user_name, ur.hrm_code as responsible_user_hrm
      FROM post_offices p
      JOIN commune_post_offices c ON p.commune_id = c.id
      JOIN province_post_offices pv ON c.province_id = pv.id
      LEFT JOIN users ur ON p.responsible_user_id = ur.id
      WHERE ${whereClause.join(' AND ')}
      ORDER BY p.code ASC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      items,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error("Get network error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/network/import — import mạng lưới từ Excel (20 cột). Được phép tạo
// mới Tỉnh/BĐX/Bưu cục qua resolveOrCreateOrgChain(). Validate fail-fast (thiếu
// maMbc -> lỗi ngay, không ghi gì). Bọc db.transaction().
router.post('/network/import', authRequired, requireRoles(ROLES.ADMIN), (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Danh sách dữ liệu import không hợp lệ hoặc rỗng' });
    }

    // Validate fail-fast TRƯỚC khi mở transaction: mỗi dòng phải có maMbc.
    const validationErrors = [];
    rows.forEach((r, idx) => {
      if (!r || typeof r.maMbc !== 'string' || !r.maMbc.trim()) {
        validationErrors.push({ row: idx + 1, message: 'Thiếu maMbc (mã bưu cục)' });
      }
    });
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Dữ liệu import có dòng không hợp lệ', errors: validationErrors });
    }

    const report = {
      provincesCreated: 0,
      communesCreated: 0,
      postOfficesCreated: 0,
      postOfficesUpdated: 0,
      errors: []
    };

    const importTxn = db.transaction((items) => {
      items.forEach((r, idx) => {
        resolveOrCreateOrgChain(r, report, idx + 1);
      });
    });

    try {
      importTxn(rows);
    } catch (txnError) {
      return res.status(400).json({ error: txnError.message });
    }

    res.json(report);
  } catch (error) {
    console.error("Import network error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/network/export-data — xuất toàn bộ bưu cục theo 20 field (cùng key
// với import), không phân trang.
router.get('/network/export-data', authRequired, requireRoles(ROLES.ADMIN), (req, res) => {
  try {
    const { search, communeId } = req.query;
    let whereClause = ["1=1"];
    let params = [];
    if (search && search.trim()) {
      whereClause.push("(p.code LIKE ? OR p.name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    if (communeId) {
      whereClause.push("p.commune_id = ?");
      params.push(communeId);
    }

    const rows = db.prepare(`
      SELECT
        p.*,
        c.code as commune_code, c.name as commune_name, c.central_commune_code as commune_central_code,
        pv.code as province_code, pv.name as province_name,
        ur.hrm_code as responsible_user_hrm
      FROM post_offices p
      JOIN commune_post_offices c ON p.commune_id = c.id
      JOIN province_post_offices pv ON c.province_id = pv.id
      LEFT JOIN users ur ON p.responsible_user_id = ur.id
      WHERE ${whereClause.join(' AND ')}
      ORDER BY p.code ASC
    `).all(...params);

    const items = rows.map((r) => ({
      maBdtTp: r.province_code,
      tenBdtTp: r.province_name,
      maBdx: r.commune_code,
      tenBuuDienXa: r.commune_name,
      buuDienXaTrungTam: r.commune_central_code || '',
      maMbc: r.code,
      tenBuuCuc: r.name,
      loai: r.type || '',
      diaChiChiTiet: r.address || '',
      maBdkv: r.bdkv_code || '',
      tenBdkv: r.bdkv_name || '',
      maPhuongXaCu: r.old_ward_code || '',
      tenPhuongXaCu: r.old_ward_name || '',
      tenQuanHuyen: r.district_name || '',
      maPhuongXaMoi: r.new_ward_code || '',
      tenPhuongXaMoi: r.new_ward_name || '',
      soDienThoai: r.phone || '',
      tinhTrangHoatDong: r.operational_status || '',
      viDo: (r.latitude !== null && r.latitude !== undefined) ? r.latitude : '',
      kinhDo: (r.longitude !== null && r.longitude !== undefined) ? r.longitude : '',
      maHrmNguoiPhuTrach: r.responsible_user_hrm || ''
    }));

    res.json({ items, total: items.length });
  } catch (error) {
    console.error("Export network error:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/network/post-offices/:id — sửa 1 bưu cục (gồm 9 cột mới). Chỉ ghi đè
// field CÓ GỬI trong body (undefined = giữ nguyên; '' = set null, trừ name/
// communeId có validate riêng).
router.put('/network/post-offices/:id', authRequired, requireRoles(ROLES.ADMIN), (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM post_offices WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bưu cục' });

    const b = req.body || {};
    // undefined -> giữ nguyên; '' -> null; giá trị khác -> dùng.
    const pick = (key, cur) => (b[key] !== undefined ? (String(b[key]).trim() === '' ? null : b[key]) : cur);

    // name: nếu gửi, không được rỗng.
    let finalName = existing.name;
    if (b.name !== undefined) {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return res.status(400).json({ error: 'Tên bưu cục không được để trống' });
      }
      finalName = b.name.trim();
    }

    // communeId: nếu gửi (khác rỗng), validate tồn tại.
    let finalCommuneId = existing.commune_id;
    if (b.communeId !== undefined && b.communeId !== null && b.communeId !== '') {
      const c = db.prepare("SELECT id FROM commune_post_offices WHERE id = ?").get(b.communeId);
      if (!c) return res.status(400).json({ error: 'BĐX (communeId) không tồn tại trong hệ thống' });
      finalCommuneId = b.communeId;
    }

    const finalLat = b.latitude !== undefined ? parseFloatOrNull(b.latitude) : existing.latitude;
    const finalLong = b.longitude !== undefined ? parseFloatOrNull(b.longitude) : existing.longitude;

    // responsible_user_id: nullable — undefined -> giữ nguyên; null/'' -> gỡ
    // gán (bỏ người phụ trách); giá trị khác -> validate tồn tại trong users.
    let finalResponsibleUserId = existing.responsible_user_id;
    if (b.responsible_user_id !== undefined) {
      if (b.responsible_user_id === null || b.responsible_user_id === '') {
        finalResponsibleUserId = null;
      } else {
        const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(b.responsible_user_id);
        if (!userExists) return res.status(400).json({ error: 'Người phụ trách (responsible_user_id) không tồn tại trong hệ thống' });
        finalResponsibleUserId = b.responsible_user_id;
      }
    }

    db.prepare(`
      UPDATE post_offices SET
        name = ?, type = ?, address = ?, commune_id = ?, bdkv_code = ?, bdkv_name = ?,
        old_ward_code = ?, old_ward_name = ?, district_name = ?, new_ward_code = ?,
        new_ward_name = ?, phone = ?, operational_status = ?, latitude = ?, longitude = ?,
        responsible_user_id = ?
      WHERE id = ?
    `).run(
      finalName,
      pick('type', existing.type),
      pick('address', existing.address),
      finalCommuneId,
      pick('bdkv_code', existing.bdkv_code),
      pick('bdkv_name', existing.bdkv_name),
      pick('old_ward_code', existing.old_ward_code),
      pick('old_ward_name', existing.old_ward_name),
      pick('district_name', existing.district_name),
      pick('new_ward_code', existing.new_ward_code),
      pick('new_ward_name', existing.new_ward_name),
      pick('phone', existing.phone),
      pick('operational_status', existing.operational_status),
      finalLat,
      finalLong,
      finalResponsibleUserId,
      req.params.id
    );

    res.json({ message: 'Cập nhật bưu cục thành công' });
  } catch (error) {
    console.error("Update post office error:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/network/post-offices/:id — thử XOÁ CỨNG. FK enforcement bật sẵn
// (better-sqlite3 mặc định foreign_keys = ON): nếu còn users tham
// chiếu -> SQLITE_CONSTRAINT_FOREIGNKEY -> bắt lỗi, trả 400 rõ ràng. KHÔNG thêm
// cột soft-delete mới cho post_offices.
router.delete('/network/post-offices/:id', authRequired, requireRoles(ROLES.ADMIN), (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM post_offices WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bưu cục' });

    try {
      db.prepare("DELETE FROM post_offices WHERE id = ?").run(req.params.id);
    } catch (fkErr) {
      if (fkErr.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY/i.test(fkErr.message || '')) {
        return res.status(400).json({ error: 'Bưu cục này đang có người dùng liên kết, không thể xoá.' });
      }
      throw fkErr;
    }

    res.json({ message: 'Đã xoá bưu cục thành công' });
  } catch (error) {
    console.error("Delete post office error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
