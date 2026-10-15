// ==========================================
// SANLUONG-5f-1: API ĐỌC cho màn «Nạp dữ liệu nguồn» — CHỈ ADMIN (401 không token; 403 TTVH, GDVH, STAFF, TIVI). Chỉ GET, không ghi DB, không mạng.
// Lõi: server/lib/napNguonDoc.js. Tài liệu: docs/ai/17_NAP_DU_LIEU_NGUON_API_DOC.md.
// Không trả host / cổng / tài khoản / mật khẩu / vân tay của nguồn SFTP; chuỗi lỗi được che bí mật từ biến môi trường SFTP_* (nếu có) trước khi trả.
// ==========================================
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const N = require('../lib/napNguonDoc');
const Sch = require('../lib/sftpScheduler');
const F = require('../lib/sftpFiles');

const router = express.Router();

/** Bí mật cần che khỏi mọi chuỗi trả về (nếu cấu hình SFTP_* có trong môi trường máy chủ). */
const bimatMoiTruong = () => ['SFTP_PASSWORD', 'SFTP_USER', 'SFTP_HOST'].map((k) => process.env[k]).filter((v) => v && String(v).length >= 3);
/** Số thư mục nguồn cấu hình (chỉ lấy SỐ ĐẾM; null nếu chưa cấu hình / cấu hình sai). */
function soThuMuc() {
  try { return F.docCauHinh(process.env, { showFingerprint: false }).dirs.length; } catch (e) { return null; }
}
/** Từ chối tham số query lạ (400) để lỗi gõ sai tên không bị bỏ qua âm thầm. */
function chiNhan(req, ds) {
  for (const k of Object.keys(req.query)) {
    if (!ds.includes(k)) throw new N.NapNguonLoi('THAM_SO_SAI', `Tham số không hỗ trợ: "${String(k).slice(0, 40)}"`, 400);
  }
}
const mot = (v) => (Array.isArray(v) ? v[v.length - 1] : v);

const xuLy = (ten, fn) => (req, res) => {
  try {
    return res.json(fn(req));
  } catch (err) {
    if (err instanceof N.NapNguonLoi) return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
    console.error(`Nap-nguon ${ten} error:`, err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi đọc dữ liệu nạp nguồn', ma: 'LOI_HE_THONG' });
  }
};

router.get('/nap-nguon/tong-quan', requireAdmin, xuLy('tong-quan', (req) => {
  chiNhan(req, []);
  return N.tongQuan({ db, now: new Date(), tuDong: { st: Sch.docTrangThaiSftp(), soThuMuc: soThuMuc() } });
}));

router.get('/nap-nguon/luoi', requireAdmin, xuLy('luoi', (req) => {
  chiNhan(req, ['tu', 'den', 'bcvh']);
  return N.luoi({ db, now: new Date(), tu: mot(req.query.tu), den: mot(req.query.den), bcvh: mot(req.query.bcvh), bimat: bimatMoiTruong() });
}));

router.get('/nap-nguon/o', requireAdmin, xuLy('o', (req) => {
  chiNhan(req, ['bcvh', 'ngay', 'dot']);
  return N.mot({ db, now: new Date(), bcvh: mot(req.query.bcvh), ngay: mot(req.query.ngay), dot: mot(req.query.dot), bimat: bimatMoiTruong() });
}));

router.get('/nap-nguon/luot', requireAdmin, xuLy('luot', (req) => {
  chiNhan(req, ['trang', 'kich_thuoc']);
  return N.dsLuot({ db, now: new Date(), trang: mot(req.query.trang), kichThuoc: mot(req.query.kich_thuoc), bimat: bimatMoiTruong() });
}));

router.get('/nap-nguon/luot/:id', requireAdmin, xuLy('luot-chi-tiet', (req) => {
  chiNhan(req, []);
  return N.chiTietLuot({ db, now: new Date(), id: req.params.id, bimat: bimatMoiTruong() });
}));

module.exports = router;
