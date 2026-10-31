// ==========================================
// KTT-6: API ĐỌC trạng thái đường nạp «Hàng tại KTT» (SFTP) — CHỈ ADMIN (401 không token; 403 vai trò khác). Chỉ GET, không ghi DB, không mạng.
// GET /api/nap-nguon/ktt/trang-thai -> { tu_dong, do_moi, do_moi_hang_hoan, canh_bao, cap, tham_so }. Không trả host / cổng / tài khoản / mật khẩu / vân tay, không sha256, không nội dung dòng.
// Lõi: server/lib/kttNapCap.js (nhật ký cặp, độ mới, cảnh báo) + server/lib/kttSftp.js (trạng thái hẹn giờ). Tài liệu: docs/ai/39_KTT_NAP_SFTP.md.
// Không đụng lưới «Nạp dữ liệu nguồn» của Hàng đến (routes/napNguon.js).
// ==========================================
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');
const K = require('../lib/kttNapCap');
const HH = require('../lib/kttHangHoan');
const Ktt = require('../lib/kttSftp');
const CF = require('../config/ktt-nap');

const router = express.Router();

/** Trạng thái hẹn giờ -> hình dạng trả về (lý do tạm dừng gọn, chỉ mã). */
function tuDong(st) {
  const trangThai = ['DANG_CHAY', 'CHO', 'TAM_DUNG', 'CAU_HINH_SAI'].includes(st.trangThai) ? st.trangThai : 'TAT';
  return {
    bat: trangThai !== 'TAT', trang_thai: trangThai, ly_do_tam_dung: trangThai === 'TAM_DUNG' ? ({ XAC_THUC: 'XAC_THUC', VAN_TAY_SAI: 'VAN_TAY' }[st.lyDo] || null) : null,
    chu_ky_phut: st.chuKyPhut ?? null, thu_muc: st.thuMuc ?? null, luot_ke_tiep_luc: st.luotKeTiep || null,
    luot_gan_nhat: st.luotGanNhat ? { luc: st.luotGanNhat.luc, ket_qua: st.luotGanNhat.ketQua, dem: st.luotGanNhat.dem || null } : null
  };
}

router.get('/nap-nguon/ktt/trang-thai', requireAdmin, (req, res) => {
  try {
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Không có tham số truy vấn nào được hỗ trợ', ma: 'THAM_SO_SAI' });
    const now = new Date();
    const moi = K.docDoMoi(db);
    const moiHh = HH.docDoMoiHangHoan(db);
    return res.json({
      tu_dong: tuDong(Ktt.docTrangThaiKtt()),
      do_moi: moi ? { nguon_xuat_luc: moi.nguon_xuat_luc, nap_luc: moi.nap_luc, khoa_cap: moi.khoa_cap } : null,
      do_moi_hang_hoan: moiHh ? { nguon_xuat_luc: moiHh.nguon_xuat_luc, nap_luc: moiHh.nap_luc } : null, // KTT-17-1: danh sách hàng hoàn (nạp riêng, không sinh cảnh báo)
      canh_bao: K.canhBao(db, now),
      cap: K.dsCap(db, 20),
      tham_so: { chu_ky_quet_phut: CF.CHU_KY_QUET_PHUT, cho_cap_phut: CF.CHO_CAP_PHUT, cu_gio: CF.CU_GIO, khung_gio_tu: CF.KHUNG_GIO_TU, khung_gio_den: CF.KHUNG_GIO_DEN, so_cap_toi_thieu_ngay: CF.SO_CAP_TOI_THIEU_NGAY }
    });
  } catch (err) {
    console.error('Ktt-nap trang-thai error:', err && err.code ? err.code : (err && err.name));
    return res.status(500).json({ error: 'Lỗi hệ thống khi đọc trạng thái nạp KTT', ma: 'LOI_HE_THONG' });
  }
});

module.exports = router;
