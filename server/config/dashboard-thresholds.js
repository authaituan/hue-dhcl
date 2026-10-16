// ==========================================
// Hằng số mức điều hành của Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, docs/ai/04_DECISIONS.md #73).
// Tạm, PO chốt 11/10/2026 (đợt DASH-6b, 14/10/2026: bỏ «hàng nặng» và «TB 4 tuần», đổi mốc đánh giá — #76); sẽ chuyển sang màn hình cấu hình tham số toàn site.
// MỘT nơi duy nhất cho các ngưỡng này; mọi so sánh dùng ">=" và phép nhân số nguyên (không dính sai số làm tròn).
// Ba mức: 'xu_ly_ngay' (Xử lý ngay), 'trong_ngay' (Trong ngày), 'binh_thuong' (Bình thường) — chữ hiển thị do giao diện tạo.
// ==========================================
'use strict';

const DASHBOARD_DEN_THRESHOLDS = Object.freeze({
  // Hàng đến muộn: arrival_at từ GIO_MUON:00:00 trở đi trong ngày (giờ địa phương).
  GIO_MUON: 15,
  // Chưa nhận tại BCVH: có bưu gửi đã chờ >= xu_ly_ngay_tu_ngay ngày -> Xử lý ngay; chỉ có bưu gửi chờ trong ngày -> Trong ngày; không có -> Bình thường.
  CHUA_NHAN: Object.freeze({ xu_ly_ngay_tu_ngay: 1 }),
  // BD10 đến chưa XNĐ: tỉ lệ (theo BD10) >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày; còn lại -> Bình thường.
  BD10_CHUA_XND: Object.freeze({ xu_ly_ngay_pct: 10, trong_ngay_pct: 5 }),
  // Sản lượng lệch so với CÙNG THỨ TUẦN TRƯỚC (cùng giờ dữ liệu): |lệch| >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày.
  // «Hôm qua» chỉ để hiển thị, KHÔNG dùng để gắn mức. Hàng đi ngoài chỉ hiển thị, không có ngưỡng (đến khi có >= 4 tuần dữ liệu thật).
  LECH_SAN_LUONG: Object.freeze({ trong_ngay_pct: 15, xu_ly_ngay_pct: 25 }),
  // Chỉ gắn mức sản lượng lệch khi mốc so sánh (tuần trước, cùng giờ) có từ SAN_SO_SANH_TOI_THIEU bưu gửi trở lên (tránh nhiễu số nhỏ)
  // VÀ giờ dữ liệu (den_luc, không phải đồng hồ máy) đã từ GIO_BAT_DAU_DANH_GIA giờ. Không đủ -> không gắn mức, trả trạng thái «chưa đủ dữ liệu».
  SAN_SO_SANH_TOI_THIEU: 50,
  // Phường/xã: số chênh % (tang_so_hom_qua_pct, lech_so_tuan_truoc_pct) chỉ tính khi mốc so sánh >= SAN_SO_SANH_PHUONG_XA bưu gửi (số phường/xã nhỏ hơn nhiều sản lượng cả BCVH). TẠM.
  SAN_SO_SANH_PHUONG_XA: 10,
  GIO_BAT_DAU_DANH_GIA: 12
});

// DASH-9b: mốc «chuyến chiều» (hàng đến lượt 2): bưu gửi có arrival_at từ GIO_CHUYEN_CHIEU:00:00 trở đi. Để NGOÀI DASHBOARD_DEN_THRESHOLDS có chủ đích:
// đối tượng đó được trả nguyên cho client ở `nguong` và có test khóa danh sách khóa — thêm khóa sẽ đổi hợp đồng cũ.
const GIO_CHUYEN_CHIEU = 10;

module.exports = { DASHBOARD_DEN_THRESHOLDS, GIO_CHUYEN_CHIEU };
