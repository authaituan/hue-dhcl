// ==========================================
// Hằng số MÁY CHỦ của màn «Nạp dữ liệu nguồn» (SANLUONG-5f-1, docs/ai/17_NAP_DU_LIEU_NGUON_API_DOC.md). MỘT nơi duy nhất.
// TẠM — PO CHƯA CHỐT các giá trị đánh dấu (*): sau này chuyển sang module ngưỡng chỉnh được trên giao diện.
// ==========================================
'use strict';

module.exports = Object.freeze({
  // (*) Giờ mong đợi file mỗi đợt, theo giờ máy chủ (TZ phải là Asia/Ho_Chi_Minh khi triển khai). Đợt SÁNG: file_time < RANH_GIOI_DOT; CHIỀU: >= RANH_GIOI_DOT.
  GIO_MONG_DOI_SANG: '09:30',
  GIO_MONG_DOI_CHIEU: '16:30',
  AN_HAN_PHUT: 60,        // (*) ân hạn sau giờ mong đợi trước khi một đợt HÔM NAY bị coi là CHO_FILE
  RANH_GIOI_DOT: '12:00', // (*)
  SO_NGAY_TOI_DA: 62,     // số ngày tối đa của một lần gọi lưới
  // (*) Nghi ngờ ít / nhiều (mức NGÀY × BCVH): tổng số dòng so với TRUNG VỊ cùng BCVH, cùng thứ trong tuần, tối đa SO_TUAN_MAU tuần trước, cần >= TOI_THIEU_NGAY_MAU ngày mẫu
  NGUONG_IT: 0.5,         // < 0,5 × trung vị => IT
  NGUONG_NHIEU: 2.5,      // > 2,5 × trung vị => NHIEU
  SO_TUAN_MAU: 4,
  TOI_THIEU_NGAY_MAU: 3,
  // Phân trang danh sách lượt, lịch sử một ô
  KICH_THUOC_LUOT_MAC_DINH: 20,
  KICH_THUOC_LUOT_TOI_DA: 100,
  LICH_SU_TOI_DA: 20,
  // Hàng khoá của «Thay thế ngày» nằm trong sftp_sync_runs (server/lib/thayTheThucHien.js) — không phải lượt đồng bộ, phải LỌC BỎ
  TIEN_TO_KHOA_THAY_THE: 'Khóa tạm của «Thay thế ngày»'
});
