// ==========================================
// THAMSO-1 (docs/ai/34_THAMSO1_BACKEND_BANG_THAM_SO.md, 04_DECISIONS.md #94): GIÁ TRỊ MẶC ĐỊNH của các tham số điều hành — MỘT nơi duy nhất.
// Các file hằng số cũ (phatConfig.js, dashboard-thresholds.js, nap-nguon.js, thay-the.js) đọc từ đây qua getter của server/lib/thamSo.js;
// danh bạ server/config/tham-so.js đọc từ đây để làm `mac_dinh`. File này KHÔNG phụ thuộc module nào (tránh vòng phụ thuộc).
// Muốn đổi mặc định trong mã: sửa ở đây (và cập nhật test khóa giá trị). Muốn chỉnh lúc chạy: dùng /api/tham-so (chỉ ADMIN).
// ==========================================
'use strict';

module.exports = Object.freeze({
  // ---- Kết quả phát (trước đây phatConfig.js) ----
  ptc_dat: 0.82,
  chua_co_tt_canh_bao: 0.10,
  nguong_du_so_lieu: 0.10, // CHỈ ĐỌC (quy tắc #92-4): «Chưa có TT» < ngưỡng này mới là ngày đủ số liệu
  san_xep_hang_bcvh: 50,
  san_xep_hang_phuong_xa: 10, // chỉ khai báo, chưa dùng, KHÔNG nằm trong danh bạ
  nguong_ngang_diem: 0.5,
  so_ngay_toi_thieu_so_sanh: 2,
  san_mau_so_so_sanh: 50,

  // ---- Dashboard «đến» (trước đây dashboard-thresholds.js) ----
  gio_muon: 15,
  chua_nhan_xu_ly_ngay_tu_ngay: 1,
  bd10_chua_xnd_xu_ly_ngay_pct: 10,
  bd10_chua_xnd_trong_ngay_pct: 5,
  lech_san_luong_trong_ngay_pct: 15,
  lech_san_luong_xu_ly_ngay_pct: 25,
  san_so_sanh_toi_thieu: 50,
  san_so_sanh_phuong_xa: 10,
  gio_bat_dau_danh_gia: 12,
  gio_chuyen_chieu: 10,
  phuong_xa_tang_cao_pct: 20, // MỚI (THAMSO-1): trước đây chỉ là số cứng ở giao diện (wardChangeChip)

  // ---- Nạp dữ liệu nguồn (trước đây nap-nguon.js) ----
  gio_mong_doi_sang: '09:30',
  gio_mong_doi_chieu: '16:30',
  an_han_phut: 60,
  ranh_gioi_dot: '12:00', // CHỈ ĐỌC (quy tắc)
  nguong_it: 0.5,
  nguong_nhieu: 2.5,
  so_tuan_mau: 4,
  toi_thieu_ngay_mau: 3,

  // ---- Thay thế ngày (trước đây thay-the.js) ----
  nguong_mat_shbg_do: 0.05
});
