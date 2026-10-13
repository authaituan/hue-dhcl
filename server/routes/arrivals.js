const express = require('express');
const db = require('../db');
const { authRequired, requireRoles, requireAdmin } = require('../auth');
const { ROLES, VIEWER_ROLES } = require('../roles');
const q = require('../lib/arrivalsQuery');
const dash = require('../lib/dashboardQuery');
const exp = require('../lib/arrivalsExport');
const bd10 = require('../lib/bd10Query');
const den = require('../lib/dashboardDenQuery');
const { getAssignedBcvh } = require('../lib/userBcvh');
const { getTiviScope, isValidTiviScope } = require('../lib/tivi');
const { getMissingBatches } = require('../lib/arrivalsImport');

const router = express.Router();

// ==========================================
// DỮ LIỆU "HÀNG ĐẾN" — chỉ đọc. Quyền: ADMIN, TTVH, GDVH (STAFF 403, không token 401) — 04_DECISIONS.md #49.
// GDVH xem đủ 6 BCVH như TTVH, KỂ CẢ "chưa nhận tại BCVH" và "BD10 đến" (#72); giới hạn theo BCVH được giao chỉ áp ở
// TẢI / XUẤT file (/export-scope, /export, /not-received/export, /bd10-khong-xnd/export — #52, #57, #72).
// Cảnh báo / chất lượng dữ liệu chỉ ADMIN: /exceptions, /import-status -> 403 với TTVH/GDVH;
// /summary bỏ trường `canh_bao` với vai trò khác ADMIN (docs/ai/04_DECISIONS.md #34).
// Quy tắc đếm sản lượng + bộ lọc: server/lib/arrivalsQuery.js. Dashboard điều hành: /arrivals/dashboard/* (server/lib/dashboardQuery.js).
// ==========================================
// TIVI đi qua lớp này nhưng authRequired đã giới hạn TIVI vào allowlist (3 endpoint dashboard «đến», server/lib/tivi.js — #74).
const viewerGuard = requireRoles(VIEWER_ROLES);
router.use('/arrivals', authRequired, (req, res, next) => (req.user.role === ROLES.TIVI ? next() : viewerGuard(req, res, next)));

const FILTER_KEYS = ['from', 'to', 'date_basis', 'receiver_code', 'ward_key'];
const isAdmin = (req) => req.user && req.user.role === ROLES.ADMIN;

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

// Khoá `chua_nhan_tai_bcvh` (#60, #68) và `bd10_den_khong_xnd` (#67): CÔNG KHAI cho mọi vai trò xem "Sản lượng đến" — không sau cờ ADMIN,
// không giới hạn theo BCVH được giao (#72): số của BCVH đang chọn (receiver_code / unit) như sản lượng.
router.get('/arrivals/summary', handle((req) => {
  const f = filters(req, ['heavy_g']);
  const out = q.summary(db, f, { isAdmin: isAdmin(req) });
  out.bd10_den_khong_xnd = bd10.stats(db, f);
  return out;
}, 'summary'));
// "BD10 đến không XNĐ": danh sách BD10 thuộc tử số (S2 + S3), phân trang, cũ nhất trước. Tham số: from, to, receiver_code (hoặc unit), nhom, tuoi, page, page_size.
router.get('/arrivals/bd10-khong-xnd', handle((req) => {
  const { f, nhom, tuoi } = bd10.parseListQuery(req.query);
  return bd10.list(db, f, { nhom, tuoi });
}, 'bd10-khong-xnd'));
// "Trạng thái BD10 đến" (SANLUONG-4a9, #69): công khai như trên (#72). Tham số: from, to (chỉ ngày, ≤ 92 ngày), receiver_code (hoặc unit).
router.get('/arrivals/bd10-trang-thai/theo-ngay', handle((req) => bd10.trangThaiTheoNgay(db, bd10.parseTrangThaiQuery(req.query)), 'bd10-trang-thai-theo-ngay'));
router.get('/arrivals/bd10-trang-thai/theo-buu-cuc-lap', handle((req) => bd10.trangThaiTheoBuuCucLap(db, bd10.parseTrangThaiQuery(req.query)), 'bd10-trang-thai-theo-buu-cuc-lap'));
// "Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH": danh sách chi tiết (phân trang, cũ nhất trước) — mọi vai trò xem được "Sản lượng đến", mọi BCVH (#72).
router.get('/arrivals/not-received', handle((req) => q.notReceivedList(db,
  q.parseFilters(req.query, { allowed: ['from', 'to', 'receiver_code', 'page', 'page_size'] })), 'not-received'));
// Hàng đến theo đường thư / dịch vụ + hàng nặng (SANLUONG-3d, 04_DECISIONS.md #36–#39).
router.get('/arrivals/by-route', handle((req) => q.byRoute(db, filters(req, ['heavy_g'])), 'by-route'));
router.get('/arrivals/by-service', handle((req) => q.byService(db, filters(req, ['heavy_g'])), 'by-service'));
router.get('/arrivals/by-time', handle((req) => q.byTime(db, filters(req, ['granularity'])), 'by-time'));
router.get('/arrivals/by-ward', handle((req) => q.byWard(db, filters(req)), 'by-ward'));
router.get('/arrivals/quality-mocs', handle((req) => q.qualityMocs(db, filters(req)), 'quality-mocs'));
router.get('/arrivals/items', handle((req) => q.items(db, filters(req, ['page', 'page_size'])), 'items'));
router.get('/arrivals/lookup', handle((req) => q.lookup(db, req.query), 'lookup'));

// Dashboard điều hành (SANLUONG-3e, 04_DECISIONS.md #41–#47): 6 BCVH, điểm cần điều hành, xu hướng, phường/xã tăng, tổng hợp Trung tâm.
// ADMIN, TTVH, GDVH. Điểm cần điều hành KHÁC cảnh báo dữ liệu ADMIN-only.
router.get('/arrivals/dashboard/overview', handle((req) => dash.overview(db, req.query), 'dashboard-overview'));
router.get('/arrivals/dashboard/trend', handle((req) => dash.trend(db, req.query), 'dashboard-trend'));
router.get('/arrivals/dashboard/wards-surge', handle((req) => dash.wardsSurge(db, req.query), 'dashboard-wards-surge'));
router.get('/arrivals/dashboard/center', handle((req) => dash.center(db, req.query), 'dashboard-center'));
// Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, #73). ADMIN, TTVH, GDVH xem mọi BCVH (#72); STAFF 403.
// bcvh_goi_y: BCVH được giao của GDVH (giao diện chọn sẵn), rỗng với vai trò khác. Tham số: bcvh (mã | all), date; phuong-xa-tang thêm gioi_han.
const goiY = (req) => ({ goiY: req.user.role === ROLES.GDVH ? getAssignedBcvh(req.user.id, db) : [] });
// TIVI (#74): tham số bcvh LUÔN bị ép theo phạm vi của tài khoản (bỏ qua giá trị client gửi); chưa có phạm vi -> 403.
function dashScope(req, res, next) {
  if (req.user.role !== ROLES.TIVI) {
    req.dashQuery = req.query;
    return next();
  }
  const scope = getTiviScope(db, req.user.id);
  if (!isValidTiviScope(scope)) {
    return res.status(403).json({ error: 'Tài khoản màn hình tivi chưa được gán phạm vi (toàn Trung tâm hoặc một BCVH), vui lòng liên hệ quản trị viên' });
  }
  req.dashQuery = { ...req.query, bcvh: scope };
  next();
}
router.get('/arrivals/dashboard/tong-quan-den', dashScope, handle((req) => den.tongQuanDen(db, req.dashQuery, goiY(req)), 'dashboard-tong-quan-den'));
router.get('/arrivals/dashboard/viec-can-lam', dashScope, handle((req) => den.viecCanLam(db, req.dashQuery, goiY(req)), 'dashboard-viec-can-lam'));
router.get('/arrivals/dashboard/phuong-xa-tang', dashScope, handle((req) => den.phuongXaTang(db, req.dashQuery, goiY(req)), 'dashboard-phuong-xa-tang'));

// Xuất Excel dữ liệu thô của MỘT BCVH (SANLUONG-3c-3, 04_DECISIONS.md #55–#58). ADMIN/TTVH: mọi BCVH; GDVH: BCVH được giao.
router.get('/arrivals/export-scope', handle((req) => ({ bcvh: exp.exportScope(db, req.user) }), 'export-scope'));

// Xuất file dùng chung cho /export (dữ liệu thô) và /not-received/export (danh sách chưa nhận tại BCVH): cùng quyền, cùng giới hạn, cùng nhật ký.
function exportHandler({ kind, count, fileName, write, prepare = (req) => ({ query: req.query, extra: {} }) }) {
  return async (req, res) => {
    let ctx; let total;
    try {
      const { query, extra } = prepare(req);
      const code = exp.parseReceiverCode(query);
      if (!exp.allowedBcvhCodes(db, req.user).includes(code)) {
        return res.status(403).json({ error: 'Bạn không được phép xuất dữ liệu của BCVH này (tài khoản GDVH chỉ xuất được BCVH được giao)' });
      }
      ctx = { ...exp.parseExportParams(query), ...extra };
      total = count(db, ctx);
      const max = exp.maxRows();
      if (total > max) {
        return res.status(400).json({ error: `Khoảng ngày đã chọn có ${exp.formatCount(total)} dòng, vượt giới hạn ${exp.formatCount(max)} dòng một file. Hãy thu hẹp khoảng ngày` });
      }
    } catch (err) {
      if (err instanceof q.QueryParamError) return res.status(400).json({ error: err.message });
      console.error(`Arrivals ${kind} error:`, err);
      return res.status(500).json({ error: 'Lỗi hệ thống khi xuất dữ liệu Hàng đến' });
    }

    // Nhật ký: ai, BCVH nào, khoảng ngày, số dòng. KHÔNG ghi dữ liệu bưu gửi.
    const audit = (rows, status) => req.app.locals.security.log({
      event: 'arrivals_export', kind, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
      receiver_code: ctx.code, from: ctx.f.fromDate, to: ctx.f.toDate, date_basis: ctx.f.dateBasis, rows, status
    });
    let clientGone = false;
    res.on('close', () => { if (!res.writableFinished) clientGone = true; });
    res.status(200);
    res.setHeader('Content-Type', exp.XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName(ctx)}"`);
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await write(db, ctx, res, () => clientGone);
      audit(result.rows, result.aborted ? 'aborted' : 'ok');
    } catch (err) {
      // Đã gửi header: không thể đổi sang JSON lỗi -> cắt kết nối để file dở không bị coi là hợp lệ.
      console.error(`Arrivals ${kind} error:`, err);
      audit(null, 'error');
      res.destroy();
    }
  };
}
router.get('/arrivals/export', exportHandler({ kind: 'raw', count: exp.countRows, fileName: exp.exportFileName, write: exp.writeExport }));
router.get('/arrivals/bd10-khong-xnd/export', exportHandler({
  kind: 'bd10_khong_xnd', count: exp.countBd10, fileName: exp.bd10FileName, write: exp.writeBd10Export,
  prepare: (req) => { const { base, nhom, tuoi } = bd10.splitQuery(req.query); return { query: base, extra: { nhom, tuoi } }; }
}));
router.get('/arrivals/not-received/export', exportHandler({ kind: 'not_received', count: exp.countNotReceived, fileName: exp.notReceivedFileName, write: exp.writeNotReceivedExport }));

router.get('/arrivals/exceptions', requireAdmin, handle((req) => q.exceptions(db, filters(req, ['ly_do', 'page', 'page_size'])), 'exceptions'));
router.get('/arrivals/import-status', requireAdmin, handle((req) => {
  q.parseFilters(req.query, { allowed: [], requireRange: false });
  return q.importStatus(db, { getMissingBatches });
}, 'import-status'));

module.exports = router;
