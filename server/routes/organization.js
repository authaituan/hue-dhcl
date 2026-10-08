const express = require('express');
const db = require('../db');

const router = express.Router();

// ==========================================
// ĐƠN VỊ TỔ CHỨC (chỉ đọc): danh sách BĐX và bưu cục cho dropdown/lọc.
// Tạo/sửa/xoá Tỉnh/BĐX/Bưu cục CHỈ qua route Quản lý mạng lưới (routes/network.js).
// ==========================================
router.get('/organization/communes', (req, res) => {
  try {
    const communes = db.prepare(`
      SELECT c.*, COUNT(p.id) as unit_count
      FROM commune_post_offices c
      LEFT JOIN post_offices p ON p.commune_id = c.id
      GROUP BY c.id
      ORDER BY c.code ASC
    `).all();
    res.json(communes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/organization/post-offices', (req, res) => {
  try {
    const { communeId } = req.query;
    let sql = `
      SELECT p.*, c.name as commune_name
      FROM post_offices p
      JOIN commune_post_offices c ON p.commune_id = c.id
    `;
    let params = [];
    if (communeId) {
      sql += " WHERE p.commune_id = ?";
      params.push(communeId);
    }
    sql += " ORDER BY p.code ASC";
    const postOffices = db.prepare(sql).all(...params);
    res.json(postOffices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
