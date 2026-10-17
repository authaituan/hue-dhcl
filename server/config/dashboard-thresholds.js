// ==========================================
// Hằng số mức điều hành của Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, docs/ai/04_DECISIONS.md #73).
// Tạm, PO chốt 11/10/2026 (đợt DASH-6b, 14/10/2026: bỏ «hàng nặng» và «TB 4 tuần», đổi mốc đánh giá — #76).
// THAMSO-1 (#94): giá trị mặc định ở server/config/tham-so-mac-dinh.js, ADMIN chỉnh qua /api/tham-so. Mọi thuộc tính là GETTER (enumerable) trả giá trị hiệu lực
// lúc gọi; đối tượng lồng trả bản chụp đóng băng mới cùng hình dạng và thứ tự khóa. KHÔNG sao chép giá trị lúc nạp module (destructuring `const { GIO_CHUYEN_CHIEU } = require(...)`
// sẽ đóng băng giá trị): đọc qua đối tượng xuất khẩu tại chỗ dùng.
// MỘT nơi duy nhất cho các ngưỡng này; mọi so sánh dùng ">=" và phép nhân số nguyên (không dính sai số làm tròn).
// Ba mức: 'xu_ly_ngay' (Xử lý ngay), 'trong_ngay' (Trong ngày), 'binh_thuong' (Bình thường) — chữ hiển thị do giao diện tạo.
// ==========================================
'use strict';
const T = require('../lib/thamSo');

const DASHBOARD_DEN_THRESHOLDS = T.taoDoiTuong({
  // Hàng đến muộn: arrival_at từ GIO_MUON:00:00 trở đi trong ngày (giờ địa phương).
  GIO_MUON: T.theoKhoa('gio_muon'),
  // Chưa nhận tại BCVH: có bưu gửi đã chờ >= xu_ly_ngay_tu_ngay ngày -> Xử lý ngay; chỉ có bưu gửi chờ trong ngày -> Trong ngày; không có -> Bình thường.
  CHUA_NHAN: T.theoHam(() => Object.freeze({ xu_ly_ngay_tu_ngay: T.lay('chua_nhan_xu_ly_ngay_tu_ngay') })),
  // BD10 đến chưa XNĐ: tỉ lệ (theo BD10) >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày; còn lại -> Bình thường.
  BD10_CHUA_XND: T.theoHam(() => Object.freeze({ xu_ly_ngay_pct: T.lay('bd10_chua_xnd_xu_ly_ngay_pct'), trong_ngay_pct: T.lay('bd10_chua_xnd_trong_ngay_pct') })),
  // Sản lượng lệch so với CÙNG THỨ TUẦN TRƯỚC (cùng giờ dữ liệu): |lệch| >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày.
  // «Hôm qua» chỉ để hiển thị, KHÔNG dùng để gắn mức. Hàng đi ngoài chỉ hiển thị, không có ngưỡng (đến khi có >= 4 tuần dữ liệu thật).
  LECH_SAN_LUONG: T.theoHam(() => Object.freeze({ trong_ngay_pct: T.lay('lech_san_luong_trong_ngay_pct'), xu_ly_ngay_pct: T.lay('lech_san_luong_xu_ly_ngay_pct') })),
  // Chỉ gắn mức sản lượng lệch khi mốc so sánh (tuần trước, cùng giờ) có từ SAN_SO_SANH_TOI_THIEU bưu gửi trở lên (tránh nhiễu số nhỏ)
  // VÀ giờ dữ liệu (den_luc, không phải đồng hồ máy) đã từ GIO_BAT_DAU_DANH_GIA giờ. Không đủ -> không gắn mức, trả trạng thái «chưa đủ dữ liệu».
  SAN_SO_SANH_TOI_THIEU: T.theoKhoa('san_so_sanh_toi_thieu'),
  // Phường/xã: số chênh % (tang_so_hom_qua_pct, lech_so_tuan_truoc_pct) chỉ tính khi mốc so sánh >= SAN_SO_SANH_PHUONG_XA bưu gửi (số phường/xã nhỏ hơn nhiều sản lượng cả BCVH).
  SAN_SO_SANH_PHUONG_XA: T.theoKhoa('san_so_sanh_phuong_xa'),
  GIO_BAT_DAU_DANH_GIA: T.theoKhoa('gio_bat_dau_danh_gia')
});

// DASH-9b: mốc «chuyến chiều» (hàng đến lượt 2): bưu gửi có arrival_at từ GIO_CHUYEN_CHIEU:00:00 trở đi. Để NGOÀI DASHBOARD_DEN_THRESHOLDS có chủ đích:
// đối tượng đó được trả nguyên cho client ở `nguong` và có test khóa danh sách khóa — thêm khóa sẽ đổi hợp đồng cũ.
module.exports = T.taoDoiTuong({
  DASHBOARD_DEN_THRESHOLDS,
  GIO_CHUYEN_CHIEU: T.theoKhoa('gio_chuyen_chieu')
});
