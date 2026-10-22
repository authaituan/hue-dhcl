const express = require('express');
const db = require('../db');
const { authRequired, requireRoles, requireAdmin } = require('../auth');
const { ROLES, VIEWER_ROLES } = require('../roles');
const q = require('../lib/arrivalsQuery');
const exp = require('../lib/arrivalsExport');
const bd10 = require('../lib/bd10Query');
const den = require('../lib/dashboardDenQuery');
const { getAssignedBcvh, VALID_BCVH_CODES } = require('../lib/userBcvh');
const phatDash = require('../lib/phatDashboard');
const phatVuHoi = require('../lib/phatVuHoi');
const { getTiviScope, isValidTiviScope } = require('../lib/tivi');
const { getMissingBatches } = require('../lib/arrivalsImport');
const thayThe = require('../lib/thayTheXemTruoc');
const thayTheThucHien = require('../lib/thayTheThucHien');
const thayTheNhatKy = require('../lib/thayTheNhatKy');
const thayTheKhoiPhuc = require('../lib/thayTheKhoiPhuc');
const quyThoiGianCache = require('../lib/quyThoiGianCache');

const router = express.Router();

// ==========================================
// DỮ LIỆU "HÀNG ĐẾN" — chỉ đọc. Quyền: ADMIN, TTVH, GDVH (vai trò khác 403, không token 401) — 04_DECISIONS.md #49.
// GDVH xem đủ 6 BCVH như TTVH, KỂ CẢ "chưa nhận tại BCVH" và "BD10 đến" (#72); giới hạn theo BCVH được giao chỉ áp ở
// TẢI / XUẤT file (/export-scope, /export, /not-received/export, /bd10-khong-xnd/export — #52, #57, #72).
// Cảnh báo / chất lượng dữ liệu chỉ ADMIN: /exceptions, /import-status -> 403 với TTVH/GDVH;
// /summary bỏ trường `canh_bao` với vai trò khác ADMIN (docs/ai/04_DECISIONS.md #34).
// Quy tắc đếm sản lượng + bộ lọc: server/lib/arrivalsQuery.js. Dashboard điều hành: /arrivals/dashboard/* (server/lib/dashboardDenQuery.js).
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
  const f = filters(req);
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
// Hàng đến theo đường thư / dịch vụ + hàng đi ngoài (SANLUONG-3d, 04_DECISIONS.md #36–#39, #76).
router.get('/arrivals/by-route', handle((req) => q.byRoute(db, filters(req)), 'by-route'));
router.get('/arrivals/by-service', handle((req) => q.byService(db, filters(req)), 'by-service'));
router.get('/arrivals/by-time', handle((req) => q.byTime(db, filters(req, ['granularity'])), 'by-time'));
router.get('/arrivals/by-ward', handle((req) => q.byWard(db, filters(req)), 'by-ward'));
router.get('/arrivals/quality-mocs', handle((req) => q.qualityMocs(db, filters(req)), 'quality-mocs'));
// «Quỹ thời gian còn lại khi hàng đến BCVH» (QUYTG-5): CHỈ ĐỌC, cùng quyền như «Sản lượng đến» (viewerGuard; TIVI 403 theo allowlist). Lõi: server/lib/quyThoiGianQuery.js, cache: quyThoiGianCache.js.
// Tham số: from, to (bắt buộc), receiver_code, ward_key; /luot thêm page, page_size, nhom, trang_thai, ly_do, nghi_ngo.
router.get('/arrivals/quy-thoi-gian/tong-hop', handle((req) => quyThoiGianCache.tongHop(db, req.query), 'quy-thoi-gian-tong-hop'));
router.get('/arrivals/quy-thoi-gian/luot', handle((req) => quyThoiGianCache.luot(db, req.query), 'quy-thoi-gian-luot'));
router.get('/arrivals/items', handle((req) => q.items(db, filters(req, ['page', 'page_size'])), 'items'));
router.get('/arrivals/lookup', handle((req) => q.lookup(db, req.query), 'lookup'));

// Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, #73). ADMIN, TTVH, GDVH xem mọi BCVH (#72); vai trò khác 403.
// bcvh_goi_y: BCVH được giao của GDVH (giao diện chọn sẵn), rỗng với vai trò khác. Tham số: bcvh (mã | all), date; phuong-xa-tang thêm gioi_han.
const goiY = (req) => ({ goiY: req.user.role === ROLES.GDVH ? getAssignedBcvh(req.user.id, db) : [] });
const TIVI_CHUA_GAN_PHAM_VI = 'Tài khoản màn hình tivi chưa được gán phạm vi (toàn Trung tâm hoặc một BCVH), vui lòng liên hệ quản trị viên';
// TIVI (#74): tham số bcvh LUÔN bị ép theo phạm vi của tài khoản (bỏ qua giá trị client gửi); chưa có phạm vi -> 403.
function dashScope(req, res, next) {
  if (req.user.role !== ROLES.TIVI) {
    req.dashQuery = req.query;
    return next();
  }
  const scope = getTiviScope(db, req.user.id);
  if (!isValidTiviScope(scope)) {
    return res.status(403).json({ error: TIVI_CHUA_GAN_PHAM_VI });
  }
  req.dashQuery = { ...req.query, bcvh: scope };
  next();
}
router.get('/arrivals/dashboard/tong-quan-den', dashScope, handle((req) => den.tongQuanDen(db, req.dashQuery, goiY(req)), 'dashboard-tong-quan-den'));
router.get('/arrivals/dashboard/viec-can-lam', dashScope, handle((req) => den.viecCanLam(db, req.dashQuery, goiY(req)), 'dashboard-viec-can-lam'));
router.get('/arrivals/dashboard/phuong-xa-tang', dashScope, handle((req) => den.phuongXaTang(db, req.dashQuery, goiY(req)), 'dashboard-phuong-xa-tang'));

// Kết quả phát cho Dashboard «Điều hành hôm nay» (PHAT-3b, #79). ADMIN, TTVH, GDVH xem được; vai trò khác 403 (viewerGuard).
// TIVI (DASH-10b): chỉ tài khoản phạm vi 'all' và chỉ khi `bcvh` vắng / 'all' (tiviPhatGuard); phạm vi một BCVH hoặc xin BCVH cụ thể -> 403, không ép ngầm như 3 endpoint «đến».
// Phạm vi: ADMIN, TTVH, GDVH đều xem ĐỦ 6 BCVH như 3 endpoint dashboard «đến» (#72) — không giới hạn theo user_bcvh (xếp hạng cần so sánh các BCVH);
// GDVH chưa được giao BCVH nào vẫn có dữ liệu. Giới hạn theo BCVH được giao chỉ còn ở NHẬP / HỦY / LỊCH SỬ / BẢN KIỂM TRA của /api/phat/* (routes/phat.js).
// Không có `bcvh` (hoặc `all`) = cả 6 BCVH.
function tiviPhatGuard(req, res, next) {
  if (req.user.role !== ROLES.TIVI) return next();
  const scope = getTiviScope(db, req.user.id);
  if (!isValidTiviScope(scope)) return res.status(403).json({ error: TIVI_CHUA_GAN_PHAM_VI });
  const b = req.query.bcvh;
  if (scope !== 'all' || (b !== undefined && b !== '' && b !== 'all')) {
    return res.status(403).json({ error: 'Tài khoản màn hình tivi chỉ xem được kết quả phát của toàn Trung tâm' });
  }
  next();
}
function phatScope(req, res, next) {
  try {
    req.phatParams = phatDash.parseParams(req.query);
  } catch (err) {
    if (err instanceof q.QueryParamError) return res.status(400).json({ error: err.message });
    return next(err);
  }
  req.phatCodes = req.phatParams.bcvh === 'all' ? VALID_BCVH_CODES : [req.phatParams.bcvh];
  next();
}
router.get('/arrivals/dashboard/ket-qua-phat', tiviPhatGuard, phatScope, handle((req) => phatDash.ketQuaPhat(db, req.phatCodes, req.phatParams), 'dashboard-ket-qua-phat'));
// Kết quả phát TỪ ĐẦU THÁNG (DASH-12b): lũy kế + chuỗi theo ngày + chênh lệch; cùng tham số / kiểm định / phạm vi như ket-qua-phat. KHÔNG nằm trong TIVI_ALLOWED -> TIVI 403.
router.get('/arrivals/dashboard/ket-qua-phat-thang', tiviPhatGuard, phatScope, handle((req) => phatDash.ketQuaPhatThang(db, req.phatCodes, req.phatParams), 'dashboard-ket-qua-phat-thang'));
// Tỷ lệ «Đã vu hồi» theo NGÀY ĐẾN / THÁNG (VUHOI-2, #107): cùng guard + phạm vi quyền như ket-qua-phat-thang (không nằm trong TIVI_ALLOWED -> TIVI 403). Tham số riêng: ngay_den | thang, bcvh.
const vuHoiParse = (khoa) => (req, res, next) => {
  try {
    req.vuHoiParams = phatVuHoi.parse(req.query, khoa);
  } catch (err) {
    if (err instanceof q.QueryParamError) return res.status(400).json({ error: err.message });
    return next(err);
  }
  next();
};
router.get('/arrivals/dashboard/vu-hoi', tiviPhatGuard, vuHoiParse('ngay_den'), handle((req) => phatVuHoi.vuHoiNgay(db, req.vuHoiParams), 'dashboard-vu-hoi'));
router.get('/arrivals/dashboard/vu-hoi-thang', tiviPhatGuard, vuHoiParse('thang'), handle((req) => phatVuHoi.vuHoiThang(db, req.vuHoiParams), 'dashboard-vu-hoi-thang'));

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

// SANLUONG-5g-2 — XEM TRƯỚC «Thay thế ngày của một BCVH» (CHỈ ĐỌC; chưa xoá, chưa nạp — thay thật là 5g-3). Chỉ ADMIN (TTVH, GDVH, TIVI -> 403; không token -> 401).
// POST vì gọi mạng (liệt kê + tải file từ nguồn SFTP). Thân JSON: { bcvh, ngay (YYYY-MM-DD, ngày trong TÊN FILE), tap_file?: [tên file] (mặc định tất cả file của (bcvh, ngày) trên nguồn) }.
// Lỗi: 400 tham số, 409 đang có lượt đồng bộ / đang có bản xem trước khác, 503 chưa cấu hình SFTP, 502 lỗi nguồn (mạng / xác thực / vân tay / thư mục — KHÔNG thử lại).
// Ghi SECURITY_LOG một dòng: ai, BCVH, ngày, kết quả (KHÔNG có SHBG, KHÔNG có mật khẩu). Route là nơi nạp lớp kết nối SFTP (sftpConnect.js, nạp lười).
router.post('/arrivals/thay-the/xem-truoc', requireAdmin, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const ghiLog = (ketQua, extra = {}) => req.app.locals.security.log({
    event: 'arrivals_thay_the_xem_truoc', ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
    bcvh: typeof body.bcvh === 'string' ? body.bcvh.slice(0, 12) : null, ngay: typeof body.ngay === 'string' ? body.ngay.slice(0, 10) : null, ket_qua: ketQua, ...extra
  });
  try {
    for (const k of Object.keys(body)) {
      if (!['bcvh', 'ngay', 'tap_file'].includes(k)) throw new thayThe.XemTruocLoi(thayThe.MA_LOI.THAM_SO_SAI, `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
    }
    thayThe.kiemTraDauVao({ bcvh: body.bcvh, ngay: body.ngay, tapFile: body.tap_file });
    const nguon = thayThe.layNguon();
    const kq = await thayThe.xemTruocThayThe({
      client: nguon.client || null, ketNoi: nguon.ketNoi, dirs: nguon.dirs, db, bcvh: body.bcvh, ngay: body.ngay, tapFile: body.tap_file ?? null, bimat: nguon.bimat || []
    });
    ghiLog('ok', { muc: kq.canh_bao.muc, khong_the_thay: kq.canh_bao.khong_the_thay });
    return res.json(kq);
  } catch (err) {
    if (err instanceof thayThe.XemTruocLoi) {
      ghiLog(err.code);
      return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
    }
    console.error('Arrivals thay-the xem-truoc error:', err && err.code ? err.code : (err && err.name));
    ghiLog('LOI_HE_THONG');
    return res.status(500).json({ error: 'Lỗi hệ thống khi xem trước thay thế', ma: 'LOI_HE_THONG' });
  }
});

// SANLUONG-5g-3 — THỰC HIỆN «Thay thế ngày của một BCVH» NGUYÊN KHỐI (xóa + nạp lại MỘT giao dịch; sao lưu toàn DB, thùng rác, khoá chung với đồng bộ, nhật ký). Chỉ ADMIN (401 / 403 như xem trước).
// Thân JSON: { bcvh, ngay, tap_file? (mặc định tất cả), tap_file_nguon: [{ten, sha256}] (lấy từ bản xem trước), xac_nhan: {ma_bcvh, ngay} (gõ lại), dong_y_mat_du_lieu? (true nếu «mất thật» > 0) }; khoá lạ -> 400.
// Lỗi: 400 tham số / xác nhận sai · 409 đang có lượt đồng bộ hoặc lần thay khác / nguồn đã đổi so với bản xem trước (NGUON_DA_DOI) / thiếu đồng ý mất dữ liệu / dữ liệu đã đổi · 422 file nguồn lỗi hoặc tập mới rỗng
// · 502 nguồn SFTP · 503 chưa cấu hình · 507 không đủ chỗ sao lưu · 500 sao lưu lỗi hoặc giao dịch hoàn tác. Mọi lỗi đều KHÔNG để lại thay đổi trong DB.
// Ghi SECURITY_LOG một dòng (ai, BCVH, ngày, kết quả; KHÔNG SHBG, KHÔNG mật khẩu). Phản hồi chỉ có số lượng + tên tệp sao lưu (không đường dẫn).
router.post('/arrivals/thay-the/thuc-hien', requireAdmin, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const ghiLog = (ketQua, extra = {}) => req.app.locals.security.log({
    event: 'arrivals_thay_the_thuc_hien', ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
    bcvh: typeof body.bcvh === 'string' ? body.bcvh.slice(0, 12) : null, ngay: typeof body.ngay === 'string' ? body.ngay.slice(0, 10) : null, ket_qua: ketQua, ...extra
  });
  try {
    for (const k of Object.keys(body)) {
      if (!['bcvh', 'ngay', 'tap_file', 'tap_file_nguon', 'xac_nhan', 'dong_y_mat_du_lieu'].includes(k)) throw new thayThe.XemTruocLoi(thayThe.MA_LOI.THAM_SO_SAI, `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
    }
    thayThe.kiemTraDauVao({ bcvh: body.bcvh, ngay: body.ngay, tapFile: body.tap_file });
    if (body.dong_y_mat_du_lieu !== undefined && typeof body.dong_y_mat_du_lieu !== 'boolean') throw new thayThe.XemTruocLoi(thayThe.MA_LOI.THAM_SO_SAI, 'Tham số "dong_y_mat_du_lieu" phải là true / false');
    const xn = body.xac_nhan;
    if (xn && typeof xn === 'object' && !Array.isArray(xn) && Object.keys(xn).some((k) => !['ma_bcvh', 'ngay'].includes(k))) throw new thayThe.XemTruocLoi(thayThe.MA_LOI.THAM_SO_SAI, 'Tham số "xac_nhan" chỉ gồm ma_bcvh và ngay');
    thayTheThucHien.kiemTraDuKien(body.tap_file_nguon);
    const nguon = thayThe.layNguon();
    const kq = await thayTheThucHien.thayTheNgay({
      client: nguon.client || null, ketNoi: nguon.ketNoi, dirs: nguon.dirs, db, bcvh: body.bcvh, ngay: body.ngay, tapFile: body.tap_file ?? null,
      tapFileNguonDuKien: body.tap_file_nguon, xacNhan: body.xac_nhan, dongYMat: body.dong_y_mat_du_lieu === true, nguoiThucHien: req.user.hrm_code,
      sauLuuDir: nguon.sauLuuDir || null, bimat: nguon.bimat || []
    });
    ghiLog('ok', { nhat_ky_id: kq.nhat_ky_id, so_dong_xoa: kq.so_dong_xoa, so_dong_nap: kq.so_dong_nap, shbg_mat_that: kq.so_sanh.shbg_mat_that, muc: kq.canh_bao.muc });
    const { duong_dan: _boDuongDan, ...saoLuuRutGon } = kq.sao_luu; // không trả đường dẫn đầy đủ qua API
    return res.json({ ...kq, sao_luu: saoLuuRutGon });
  } catch (err) {
    if (err instanceof thayThe.XemTruocLoi) {
      ghiLog(err.code);
      return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
    }
    console.error('Arrivals thay-the thuc-hien error:', err && err.code ? err.code : (err && err.name));
    ghiLog('LOI_HE_THONG');
    return res.status(500).json({ error: 'Lỗi hệ thống khi thực hiện thay thế (DB không bị thay đổi nếu giao dịch chưa hoàn tất)', ma: 'LOI_HE_THONG' });
  }
});

// SANLUONG-5g-5 — NHẬT KÝ «Thay thế ngày» (API ĐỌC) và KHÔI PHỤC từ thùng rác. Tất cả CHỈ ADMIN (401 không token; 403 TTVH, GDVH, TIVI). Lõi: thayTheNhatKy.js, thayTheKhoiPhuc.js.
// GET  /arrivals/thay-the/nhat-ky      ?page, page_size (≤ 100), bcvh, tu_ngay, den_ngay (YYYY-MM-DD, ≤ 92 ngày), nguoi (mã HRM) — mới trước
// GET  /arrivals/thay-the/nhat-ky/:id  chi tiết một lần (không đường dẫn sao lưu, không SHBG, không nội dung dòng thùng rác)
// POST /arrivals/thay-the/khoi-phuc/xem-truoc  { nhat_ky_id }                              — chỉ đọc
// POST /arrivals/thay-the/khoi-phuc/thuc-hien  { nhat_ky_id, xac_nhan: { ma_bcvh, ngay } } — ngay dạng YYYY-MM-DD (như «Thay thế»)
// Lỗi { error, ma }: 400 THAM_SO_SAI / XAC_NHAN_SAI · 404 KHONG_TIM_THAY · 409 DANG_THAY_THE / DANG_CO_LUOT_DONG_BO / THUNG_RAC_HET_HAN / DA_KHOI_PHUC / KHONG_CO_GI_DE_KHOI_PHUC
// · 507 KHONG_DU_CHO_SAO_LUU · 500 SAO_LUU_LOI / KHOI_PHUC_THAT_BAI (đã hoàn lại, DB y nguyên).
const loiNhatKy = (res, err, ghiLog, ten) => {
  if (err instanceof thayTheNhatKy.NhatKyLoi || err instanceof thayThe.XemTruocLoi) {
    if (ghiLog) ghiLog(err.code);
    return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
  }
  console.error(`Arrivals ${ten} error:`, err && err.code ? err.code : (err && err.name));
  if (ghiLog) ghiLog('LOI_HE_THONG');
  return res.status(500).json({ error: 'Lỗi hệ thống khi xử lý nhật ký / khôi phục thay thế', ma: 'LOI_HE_THONG' });
};
const chiNhanQuery = (req, ds) => {
  for (const k of Object.keys(req.query)) {
    if (!ds.includes(k)) throw thayTheNhatKy.saiThamSo(`Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
  }
};
const chiNhanBody = (body, ds) => {
  for (const k of Object.keys(body)) {
    if (!ds.includes(k)) throw thayTheNhatKy.saiThamSo(`Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`);
  }
};
const thanJson = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

router.get('/arrivals/thay-the/nhat-ky', requireAdmin, (req, res) => {
  try {
    chiNhanQuery(req, ['page', 'page_size', 'bcvh', 'tu_ngay', 'den_ngay', 'nguoi']);
    return res.json(thayTheNhatKy.danhSach({ db, query: req.query, now: new Date() }));
  } catch (err) { return loiNhatKy(res, err, null, 'thay-the nhat-ky'); }
});

router.get('/arrivals/thay-the/nhat-ky/:id', requireAdmin, (req, res) => {
  try {
    chiNhanQuery(req, []);
    return res.json(thayTheNhatKy.chiTiet({ db, id: req.params.id, now: new Date() }));
  } catch (err) { return loiNhatKy(res, err, null, 'thay-the nhat-ky chi tiet'); }
});

const ghiLogKhoiPhuc = (req, event) => (ketQua, extra = {}) => req.app.locals.security.log({
  event, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
  nhat_ky_id: Number.isInteger(thanJson(req).nhat_ky_id) ? thanJson(req).nhat_ky_id : null, ket_qua: ketQua, ...extra
});

router.post('/arrivals/thay-the/khoi-phuc/xem-truoc', requireAdmin, (req, res) => {
  const ghiLog = ghiLogKhoiPhuc(req, 'arrivals_thay_the_khoi_phuc_xem_truoc');
  try {
    const body = thanJson(req);
    chiNhanBody(body, ['nhat_ky_id']);
    const kq = thayTheKhoiPhuc.xemTruoc({ db, nhatKyId: body.nhat_ky_id, now: new Date() });
    ghiLog('ok', { so_dong_se_them: kq.so_dong_se_them });
    return res.json(kq);
  } catch (err) { return loiNhatKy(res, err, ghiLog, 'thay-the khoi-phuc xem-truoc'); }
});

router.post('/arrivals/thay-the/khoi-phuc/thuc-hien', requireAdmin, async (req, res) => {
  const ghiLog = ghiLogKhoiPhuc(req, 'arrivals_thay_the_khoi_phuc');
  try {
    const body = thanJson(req);
    chiNhanBody(body, ['nhat_ky_id', 'xac_nhan']);
    const kq = await thayTheKhoiPhuc.khoiPhuc({
      db, nhatKyId: body.nhat_ky_id, xacNhan: body.xac_nhan, nguoiThucHien: req.user.hrm_code, sauLuuDir: thayThe.layThuMucSaoLuu() // chỉ test tiêm; không đọc cấu hình SFTP, không mạng
    });
    ghiLog('ok', { khoi_phuc_id: kq.khoi_phuc_id, so_dong_them: kq.so_dong_them, so_dong_da_co: kq.so_dong_da_co, so_dong_gan_sang_file_khac: kq.so_dong_gan_sang_file_khac });
    const { duong_dan: _boDuongDan, ...saoLuuRutGon } = kq.sao_luu; // không trả đường dẫn đầy đủ qua API
    return res.json({ ...kq, sao_luu: saoLuuRutGon });
  } catch (err) { return loiNhatKy(res, err, ghiLog, 'thay-the khoi-phuc thuc-hien'); }
});

module.exports = router;
