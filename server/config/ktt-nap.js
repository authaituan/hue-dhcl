// ==========================================
// Hằng số MÁY CHỦ của đường nạp «Hàng tại KTT» qua SFTP (KTT-6, docs/ai/39_KTT_NAP_SFTP.md). MỘT nơi duy nhất.
// Các giá trị đánh dấu (*) là GETTER (enumerable) đọc tham số hiệu lực lúc gọi (chỉnh được qua /api/tham-so, chỉ ADMIN); mặc định ở server/config/tham-so-mac-dinh.js.
// ==========================================
'use strict';
const T = require('../lib/thamSo');

module.exports = T.taoDoiTuong({
  CHU_KY_QUET_PHUT: T.theoKhoa('ktt_chu_ky_quet_phut'), // (*) chu kỳ quét thư mục SFTP của KTT
  CHO_CAP_PHUT: T.theoKhoa('ktt_cho_cap_phut'), // (*) mới có một file của cặp: chờ chừng này phút rồi cảnh báo «thiếu file»
  CU_GIO: T.theoKhoa('ktt_cu_gio'), // (*) dữ liệu cũ: quá chừng này giờ (chỉ tính giờ trong khung) kể từ cặp OK gần nhất
  KHUNG_GIO_TU: T.theoKhoa('ktt_khung_gio_tu'), // (*)
  KHUNG_GIO_DEN: T.theoKhoa('ktt_khung_gio_den'), // (*)
  SO_CAP_TOI_THIEU_NGAY: T.theoKhoa('ktt_so_cap_toi_thieu_ngay'), // (*)
  // Giới hạn kỹ thuật (không phải tham số điều hành)
  SO_CAP_TOI_DA_MOI_LUOT: 10, // số cặp tối đa nạp trong một lượt quét (cũ trước)
  SO_LAN_THU_TOI_DA: 5, // một cặp LỖI (tải / ghi) được thử lại tối đa chừng này lần cho cùng kích thước + mtime
  SO_NGAY_XEM_LAI: 7, // cảnh báo «thiếu cặp theo ngày» xét tối đa chừng này ngày đã qua
  SO_NGAY_GIU_CANH_BAO: 14, // cặp TỪ CHỐI / LỖI cũ hơn chừng này ngày thôi báo
  THU_MUC_MAC_DINH: '/CSV_Report_530100'
});
