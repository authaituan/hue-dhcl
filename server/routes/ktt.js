// ==========================================
// KTT-8: API «Hàng tại KTT» — /api/ktt/*, CHỈ ĐỌC, CHỈ ADMIN và TTVH (GDVH 403, TIVI 403 ở authRequired / allowlist, không token 401). Mount riêng ở server/index.js
// (KHÔNG dưới /api/arrivals: đường đó mở cả GDVH). Mọi route đi qua `requireRoles(ADMIN, TTVH)` ngay đầu router. ADMIN và TTVH thấy CÙNG số liệu (không lọc theo BCVH được giao).
//   GET /api/ktt/meta                    độ mới dữ liệu, lịch chuyến (14 dòng), hạn đến trước chuyến, giờ chốt ngày, ngưỡng
//   GET /api/ktt/luu-thoat?tu=&den=[&moc_chi_tieu=xnd|quet_tui_den]   lưu thoát 5 trạng thái, đạt / không đạt, chỉ tiêu 14 giờ hai mốc, hàng hoàn (kttLuuThoatQuery.luuThoatTheoNgay), cache theo (mốc, ngày)
//   GET /api/ktt/tong-hop?tu=&den=       kttQuery.tongHopKtt + khối «Đánh giá» (danh_gia)
//   GET /api/ktt/chi-tiet?tu=&den=&loai=[&ma_bcvh=&page=&page_size=]   danh sách SHBG chi tiết (phân trang như /api/arrivals/items)
//   GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=&ma_bcvh=&nguon=]   KTT-8b/8c: file .xlsx (sheet «Thông tin» + «7 Hàng rớt lại»), lib/kttXuat.js
// Lỗi tham số -> 400 { error (tiếng Việt, nêu tham số sai), ma }; lỗi khác -> 500 thông báo chung (không lộ nội bộ), log chỉ có mã lỗi (không số hiệu bưu gửi).
// Lõi: server/lib/kttApi.js. Tài liệu: docs/ai/42_KTT_API.md.
// ==========================================
const express = require('express');
const db = require('../db');
const { requireRoles } = require('../auth');
const { ROLES } = require('../roles');
const Q = require('../lib/kttQuery');
const Api = require('../lib/kttApi');
const Xuat = require('../lib/kttXuat');

const router = express.Router();

// Mọi route của router này CHỈ cho ADMIN, TTVH (route thêm sau này cũng bị chặn mặc định).
router.use(requireRoles(ROLES.ADMIN, ROLES.TTVH));

const xuLy = (ten, fn) => async (req, res) => {
  try {
    return res.json(await fn(req));
  } catch (err) {
    if (err instanceof Q.LoiKtt) return res.status(400).json({ error: err.message, ma: err.code });
    console.error(`Ktt ${ten} error:`, err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi đọc dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' });
  }
};

router.get('/meta', xuLy('meta', (req) => {
  const khoa = Object.keys(req.query);
  if (khoa.length) throw new Q.LoiKtt('KTT_THAM_SO_LA', `Tham số không hỗ trợ: "${String(khoa[0]).slice(0, 40)}"`);
  return Api.meta(db);
}));
router.get('/luu-thoat', xuLy('luu-thoat', (req) => Api.luuThoat(db, req.query)));
router.get('/tong-hop', xuLy('tong-hop', (req) => Api.tongHop(db, req.query)));
router.get('/chi-tiet', xuLy('chi-tiet', (req) => Api.chiTiet(db, req.query)));

// KTT-8b: xuất xlsx sheet 7 «Lưu thoát» (+ sheet «Thông tin»). Mọi kiểm tra và tính toán xong TRƯỚC khi gửi header (lỗi vẫn là JSON 400/500); sau đó ghi luồng.
router.get('/xuat/luu-thoat', async (req, res) => {
  let kq;
  try {
    kq = await Api.xuatLuuThoat(db, req.query, { nguoiXuat: req.user.hrm_code || null });
  } catch (err) {
    if (err instanceof Q.LoiKtt) return res.status(400).json({ error: err.message, ma: err.code });
    console.error('Ktt xuat luu-thoat error:', err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi xuất dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' });
  }
  // Nhật ký: ai, khoảng ngày, bộ lọc, số dòng. KHÔNG ghi số hiệu bưu gửi.
  const ghiNhatKy = (rows, status) => req.app.locals.security.log({
    event: 'ktt_export', kind: 'luu-thoat', ip: req.clientIp, user_id: req.user.id, hrm_code: req.user.hrm_code, role: req.user.role,
    from: kq.khoang.tuNgay, to: kq.khoang.denNgay, trang_thai: kq.nhom, ma_bcvh: kq.maBcvh, nguon: kq.nguon, rows, status
  });
  let khachDi = false;
  res.on('close', () => { if (!res.writableFinished) khachDi = true; });
  res.status(200);
  res.setHeader('Content-Type', Xuat.XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${kq.tenFile}"`);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await Xuat.ghiXlsx(res, kq, () => khachDi);
    ghiNhatKy(r.rows, r.aborted ? 'aborted' : 'ok');
  } catch (err) {
    console.error('Ktt xuat luu-thoat error:', err && err.code ? err.code : (err && err.name));
    ghiNhatKy(null, 'error');
    res.destroy(); // đã gửi header: cắt kết nối để file dở không bị coi là hợp lệ
  }
});

module.exports = router;
