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

// ---------- SANLUONG-5f-2: GHI — «Lấy ngay» và «Lấy lại» (chỉ ADMIN; ghi người bấm; việc nạp chạy NỀN, trả 202 ngay) ----------
// 202 { luot_id, bat_dau } (lay-lai kèm o: [{bcvh, ngay, dot, da_co_nhap_tay}]) · 400 tham số · 409 DANG_CHAY (kèm luot_id nếu là lượt thật) / TAM_DUNG (hẹn giờ tạm dừng vì lỗi xác thực / vân tay: không kết nối) · 503 CHUA_CAU_HINH.
const L = require('../lib/napNguonLay');
const ghiLogLay = (req, event, ketQua, extra = {}) => req.app.locals.security.log({ event, ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role, ket_qua: ketQua, ...extra });
const xuLyGhi = (event, fn) => (req, res) => {
  try {
    const kq = fn(req);
    ghiLogLay(req, event, 'ok', { luot_id: kq.luot_id, so_o: Array.isArray(kq.o) ? kq.o.length : undefined });
    return res.status(202).json(kq);
  } catch (err) {
    if (err instanceof L.LayLoi || err instanceof N.NapNguonLoi) {
      ghiLogLay(req, event, err.code, err.extra && err.extra.luot_id ? { luot_id: err.extra.luot_id } : {});
      return res.status(err.httpStatus).json({ error: err.message, ma: err.code, ...(err.extra || {}) });
    }
    console.error(`Nap-nguon ${event} error:`, err && err.code ? err.code : (err && err.name));
    ghiLogLay(req, event, 'LOI_HE_THONG');
    return res.status(500).json({ error: 'Lỗi hệ thống khi khởi động lượt lấy dữ liệu', ma: 'LOI_HE_THONG' });
  }
};

router.post('/nap-nguon/lay-ngay', requireAdmin, xuLyGhi('nap_nguon_lay_ngay', (req) => {
  const body = req.body === undefined || req.body === null ? {} : req.body;
  if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new L.LayLoi('THAM_SO_SAI', 'Thân yêu cầu phải là {} (không có trường nào)', 400);
  return L.layNgay({ db, user: req.user });
}));

router.post('/nap-nguon/lay-lai', requireAdmin, xuLyGhi('nap_nguon_lay_lai', (req) => L.layLai({ db, user: req.user, body: req.body })));

// ---------- SANLUONG-5f-1c: «Đã xem xét» (chỉ ADMIN). POST 200 { id, da_co } · 400 THAM_SO_SAI · 409 KHONG_CAN_XU_LY · DELETE 200 { id, da_huy } · 404 KHONG_TIM_THAY ----------
// SECURITY_LOG: ai, BCVH, ngày, loại, hành động. KHÔNG ghi ghi chú, KHÔNG SHBG.
const XX = require('../lib/napNguonXemXet');
const xuLyXemXet = (hanhDong, fn) => (req, res) => {
  const event = `nap_nguon_${hanhDong}`;
  try {
    const kq = fn(req);
    ghiLogLay(req, event, 'ok', { muc_id: kq.id, loai: kq.loai, bcvh: kq.bcvh, ngay: kq.ngay, da_co: kq.da_co });
    return res.json(hanhDong === 'da_xem_xet' ? { id: kq.id, da_co: kq.da_co } : { id: kq.id, da_huy: true });
  } catch (err) {
    if (err instanceof N.NapNguonLoi) {
      ghiLogLay(req, event, err.code);
      return res.status(err.httpStatus).json({ error: err.message, ma: err.code });
    }
    console.error(`Nap-nguon ${event} error:`, err && err.code ? err.code : (err && err.name));
    ghiLogLay(req, event, 'LOI_HE_THONG');
    return res.status(500).json({ error: 'Lỗi hệ thống khi ghi trạng thái đã xem xét', ma: 'LOI_HE_THONG' });
  }
};

router.post('/nap-nguon/da-xem-xet', requireAdmin, xuLyXemXet('da_xem_xet', (req) => XX.danhDau({ db, now: new Date(), user: req.user, body: req.body })));

router.delete('/nap-nguon/da-xem-xet/:id', requireAdmin, xuLyXemXet('huy_da_xem_xet', (req) => XX.huy({ db, id: req.params.id, user: req.user })));

module.exports = router;
