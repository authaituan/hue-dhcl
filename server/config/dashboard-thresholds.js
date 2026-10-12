// ==========================================
// Hằng số mức điều hành của Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (DASH-1, docs/ai/04_DECISIONS.md #73).
// Tạm, PO chốt 11/10/2026; sẽ chuyển sang màn hình cấu hình tham số toàn site.
// MỘT nơi duy nhất cho các ngưỡng này; mọi so sánh dùng ">=" và phép nhân số nguyên (không dính sai số làm tròn).
// Ba mức: 'xu_ly_ngay' (Xử lý ngay), 'trong_ngay' (Trong ngày), 'binh_thuong' (Bình thường) — chữ hiển thị do giao diện tạo.
// ==========================================
'use strict';

const DASHBOARD_DEN_THRESHOLDS = Object.freeze({
  // Hàng nặng: bưu gửi có khối lượng (gam) >= HANG_NANG_G. Khác ngưỡng hàng nặng của màn hình sản lượng (#37, > 2.500 g).
  HANG_NANG_G: 2000,
  // Hàng đến muộn: arrival_at từ GIO_MUON:00:00 trở đi trong ngày (giờ địa phương).
  GIO_MUON: 15,
  // Chưa nhận tại BCVH: có bưu gửi đã chờ >= xu_ly_ngay_tu_ngay ngày -> Xử lý ngay; chỉ có bưu gửi chờ trong ngày -> Trong ngày; không có -> Bình thường.
  CHUA_NHAN: Object.freeze({ xu_ly_ngay_tu_ngay: 1 }),
  // BD10 đến chưa XNĐ: tỉ lệ (theo BD10) >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày; còn lại -> Bình thường.
  BD10_CHUA_XND: Object.freeze({ xu_ly_ngay_pct: 10, trong_ngay_pct: 5 }),
  // Sản lượng lệch so với TB 4 tuần cùng thứ (cùng giờ): |lệch| >= xu_ly_ngay_pct -> Xử lý ngay; >= trong_ngay_pct -> Trong ngày (chỉ gắn mức, chưa dùng thống kê).
  LECH_SAN_LUONG: Object.freeze({ trong_ngay_pct: 15, xu_ly_ngay_pct: 25 }),
  // Số ngày cùng thứ tối đa để tính "TB 4 tuần cùng thứ".
  SO_TUAN_SO_SANH: 4
});

module.exports = { DASHBOARD_DEN_THRESHOLDS };
