const express = require('express');
const db = require('../db');
const { authRequired, requireManager, requireAdmin } = require('../auth');
const q = require('../lib/arrivalsQuery');
const dash = require('../lib/dashboardQuery');
const { getMissingBatches } = require('../lib/arrivalsImport');

const router = express.Router();

// ==========================================
// DỮ LIỆU "HÀNG ĐẾN" — chỉ đọc. Quyền: MANAGER + ADMIN (STAFF 403, không token 401).
// Cảnh báo / chất lượng dữ liệu chỉ ADMIN: /exceptions, /import-status -> 403 với MANAGER;
// /summary bỏ trường `canh_bao` với MANAGER (docs/ai/04_DECISIONS.md #34).
// Quy tắc đếm sản lượng + bộ lọc: server/lib/arrivalsQuery.js. Dashboard điều hành: /arrivals/dashboard/* (server/lib/dashboardQuery.js).
// ==========================================
router.use('/arrivals', authRequired, requireManager);

const FILTER_KEYS = ['from', 'to', 'date_basis', 'receiver_code', 'ward_key'];
const isAdmin = (req) => req.user && req.user.role === 'ADMIN';

function handle(fn, label) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      if (err instanceof q.QueryParamError) return res.status(400).json({ error: err.message });
      // Không để SQL/stack trace lọt ra response.
      console.error(`Arrivals ${label} error:`, err);
      return res.status(500).json({ error: 'Lỗi hệ thống khi truy vấn dữ liệu Hàng đến' });
    }
  };
}

const filters = (req, extra = []) => q.parseFilters(req.query, { allowed: [...FILTER_KEYS, ...extra] });

router.get('/arrivals/meta', handle((req) => {
  q.parseFilters(req.query, { allowed: [], requireRange: false });
  return q.meta(db);
}, 'meta'));

router.get('/arrivals/summary', handle((req) => q.summary(db, filters(req, ['heavy_g']), { isAdmin: isAdmin(req) }), 'summary'));
// Hàng đến theo đường thư / dịch vụ + hàng nặng (SANLUONG-3d, 04_DECISIONS.md #36–#39).
router.get('/arrivals/by-route', handle((req) => q.byRoute(db, filters(req, ['heavy_g'])), 'by-route'));
router.get('/arrivals/by-service', handle((req) => q.byService(db, filters(req, ['heavy_g'])), 'by-service'));
router.get('/arrivals/by-time', handle((req) => q.byTime(db, filters(req, ['granularity'])), 'by-time'));
router.get('/arrivals/by-ward', handle((req) => q.byWard(db, filters(req)), 'by-ward'));
router.get('/arrivals/quality-mocs', handle((req) => q.qualityMocs(db, filters(req)), 'quality-mocs'));
router.get('/arrivals/items', handle((req) => q.items(db, filters(req, ['page', 'page_size'])), 'items'));
router.get('/arrivals/lookup', handle((req) => q.lookup(db, req.query), 'lookup'));

// Dashboard điều hành (SANLUONG-3e, 04_DECISIONS.md #41–#47): 6 BCVH, điểm cần điều hành, xu hướng, phường/xã tăng, tổng hợp Trung tâm.
// MANAGER + ADMIN (phân quyền TTVH/GĐVH: SANLUONG-3c). Điểm cần điều hành KHÁC cảnh báo dữ liệu ADMIN-only.
router.get('/arrivals/dashboard/overview', handle((req) => dash.overview(db, req.query), 'dashboard-overview'));
router.get('/arrivals/dashboard/trend', handle((req) => dash.trend(db, req.query), 'dashboard-trend'));
router.get('/arrivals/dashboard/wards-surge', handle((req) => dash.wardsSurge(db, req.query), 'dashboard-wards-surge'));
router.get('/arrivals/dashboard/center', handle((req) => dash.center(db, req.query), 'dashboard-center'));

router.get('/arrivals/exceptions', requireAdmin, handle((req) => q.exceptions(db, filters(req)), 'exceptions'));
router.get('/arrivals/import-status', requireAdmin, handle((req) => {
  q.parseFilters(req.query, { allowed: [], requireRange: false });
  return q.importStatus(db, { getMissingBatches });
}, 'import-status'));

module.exports = router;
