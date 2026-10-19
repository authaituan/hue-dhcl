// ==========================================
// THAMSO-1 (docs/ai/34_THAMSO1_BACKEND_BANG_THAM_SO.md, 04_DECISIONS.md #94): API «Tham số hệ thống» — CHỈ ADMIN (401 không token; 403 TTVH, GDVH, TIVI).
// GET  /tham-so                         danh bạ + giá trị hiệu lực + mặc định + ai sửa gần nhất
// PUT  /tham-so                         { ly_do, thay_doi: [{ khoa, gia_tri }] }  (1–30 phần tử; ghi hết hoặc không ghi gì)
// POST /tham-so/ve-mac-dinh             { ly_do, khoa: [..] } hoặc { ly_do, tat_ca: true }
// GET  /tham-so/nhat-ky                 ?khoa, tu, den (YYYY-MM-DD giờ Việt Nam, ≤ 92 ngày), page, page_size (≤ 100) — mới trước
// Lỗi { error, ma }: 400 THAM_SO_SAI / KHOA_LA / KHOA_CHI_DOC / NGOAI_KHOANG / RANG_BUOC / THIEU_LY_DO · 500 LOI_HE_THONG.
// SECURITY_LOG: ai, vai trò, danh sách khóa, kết quả (KHÔNG ghi lý do, KHÔNG ghi giá trị).
// ==========================================
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const TS = require('../lib/thamSo');

const router = express.Router();

const chiNhanQuery = (req, ds) => {
  for (const k of Object.keys(req.query)) if (!ds.includes(k)) throw new TS.ThamSoLoi('THAM_SO_SAI', `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`, 400);
};
const thanJson = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null);
const chiTruong = (body, ds) => {
  if (!body) throw new TS.ThamSoLoi('THAM_SO_SAI', 'Thân yêu cầu phải là một đối tượng JSON', 400);
  for (const k of Object.keys(body)) if (!ds.includes(k)) throw new TS.ThamSoLoi('THAM_SO_SAI', `Trường không hỗ trợ: "${String(k).slice(0, 40)}"`, 400);
};
const ghiLog = (req, event, ketQua, extra = {}) => req.app.locals.security.log({
  event, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role, ket_qua: ketQua, ...extra
});
const loi = (res, err, ten) => {
  if (err instanceof TS.ThamSoLoi) return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
  console.error(`Tham-so ${ten} error:`, err && err.code ? err.code : (err && err.name));
  return res.status(500).json({ error: 'Lỗi hệ thống khi xử lý tham số', ma: 'LOI_HE_THONG' });
};

router.get('/tham-so', requireAdmin, (req, res) => {
  try {
    chiNhanQuery(req, []);
    return res.json(TS.danhSach(db));
  } catch (err) { return loi(res, err, 'danh-sach'); }
});

router.put('/tham-so', requireAdmin, (req, res) => {
  let khoa;
  try {
    const body = thanJson(req);
    chiTruong(body, ['ly_do', 'thay_doi']);
    chiNhanQuery(req, []);
    khoa = Array.isArray(body.thay_doi) ? body.thay_doi.map((p) => (p && typeof p.khoa === 'string' ? p.khoa.slice(0, 60) : null)).filter(Boolean) : [];
    const da = TS.datNhieu(db, req.user, body.thay_doi, body.ly_do);
    ghiLog(req, 'tham_so_sua', 'ok', { khoa: da });
    return res.json(TS.danhSach(db));
  } catch (err) {
    if (err instanceof TS.ThamSoLoi) ghiLog(req, 'tham_so_sua', err.code, { khoa });
    return loi(res, err, 'sua');
  }
});

router.post('/tham-so/ve-mac-dinh', requireAdmin, (req, res) => {
  let khoa;
  try {
    const body = thanJson(req);
    chiTruong(body, ['ly_do', 'khoa', 'tat_ca']);
    chiNhanQuery(req, []);
    if (body.tat_ca !== undefined && body.tat_ca !== true) throw new TS.ThamSoLoi('THAM_SO_SAI', '"tat_ca" chỉ nhận true', 400);
    khoa = Array.isArray(body.khoa) ? body.khoa.map((k) => (typeof k === 'string' ? k.slice(0, 60) : null)).filter(Boolean) : [];
    const da = TS.veMacDinh(db, req.user, body.khoa, body.ly_do, { tatCa: body.tat_ca === true });
    ghiLog(req, 'tham_so_ve_mac_dinh', 'ok', { khoa: da });
    return res.json(TS.danhSach(db));
  } catch (err) {
    if (err instanceof TS.ThamSoLoi) ghiLog(req, 'tham_so_ve_mac_dinh', err.code, { khoa });
    return loi(res, err, 've-mac-dinh');
  }
});

router.get('/tham-so/nhat-ky', requireAdmin, (req, res) => {
  try {
    chiNhanQuery(req, ['khoa', 'tu', 'den', 'page', 'page_size']);
    return res.json(TS.nhatKy(db, req.query));
  } catch (err) { return loi(res, err, 'nhat-ky'); }
});

module.exports = router;
