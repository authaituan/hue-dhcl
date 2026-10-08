const express = require('express');
const db = require('../db');

const router = express.Router();

// ==========================================
// DASHBOARD — số liệu tổng quan cố định (dành cho ô SYSTEM sau này).
// Hiện chỉ có số đếm mạng lưới; biểu đồ tuỳ chỉnh đi qua routes/dashboardWidgets.js.
// ==========================================
router.get('/dashboard/stats', (req, res) => {
  try {
    const totalCommunes = db.prepare("SELECT COUNT(*) as count FROM commune_post_offices").get().count;
    const totalPostOffices = db.prepare("SELECT COUNT(*) as count FROM post_offices").get().count;

    res.json({
      summary: {
        totalCommunes,
        totalPostOffices
      }
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
