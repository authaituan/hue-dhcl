// ==========================================
// Hằng số MÁY CHỦ của màn «Nạp dữ liệu nguồn» (SANLUONG-5f-1, docs/ai/17_NAP_DU_LIEU_NGUON_API_DOC.md). MỘT nơi duy nhất.
// THAMSO-1 (#94): các giá trị đánh dấu (*) nay chỉnh được qua /api/tham-so (chỉ ADMIN); mặc định ở server/config/tham-so-mac-dinh.js. Thuộc tính theo tham số là GETTER
// (enumerable) trả giá trị hiệu lực lúc gọi; `RANH_GIOI_DOT` là quy tắc định nghĩa nên CHỈ ĐỌC (giá trị mặc định cố định). Các hằng còn lại (giới hạn kỹ thuật) giữ nguyên.
// ==========================================
'use strict';
const T = require('../lib/thamSo');
const MD = require('./tham-so-mac-dinh');

module.exports = T.taoDoiTuong({
  // (*) Giờ mong đợi file mỗi đợt, theo giờ máy chủ (TZ phải là Asia/Ho_Chi_Minh khi triển khai). Đợt SÁNG: file_time < RANH_GIOI_DOT; CHIỀU: >= RANH_GIOI_DOT.
  GIO_MONG_DOI_SANG: T.theoKhoa('gio_mong_doi_sang'),
  GIO_MONG_DOI_CHIEU: T.theoKhoa('gio_mong_doi_chieu'),
  AN_HAN_PHUT: T.theoKhoa('an_han_phut'), // (*) ân hạn sau giờ mong đợi trước khi một đợt HÔM NAY bị coi là CHO_FILE
  RANH_GIOI_DOT: MD.ranh_gioi_dot, // quy tắc định nghĩa, chỉ đọc
  SO_NGAY_TOI_DA: 62, // số ngày tối đa của một lần gọi lưới
  // (*) Nghi ngờ ít / nhiều (mức NGÀY × BCVH): tổng số dòng so với TRUNG VỊ cùng BCVH, cùng thứ trong tuần, tối đa SO_TUAN_MAU tuần trước, cần >= TOI_THIEU_NGAY_MAU ngày mẫu
  NGUONG_IT: T.theoKhoa('nguong_it'), // < 0,5 × trung vị => IT
  NGUONG_NHIEU: T.theoKhoa('nguong_nhieu'), // > 2,5 × trung vị => NHIEU
  SO_TUAN_MAU: T.theoKhoa('so_tuan_mau'),
  TOI_THIEU_NGAY_MAU: T.theoKhoa('toi_thieu_ngay_mau'),
  // SANLUONG-5f-2: giới hạn của «Lấy ngay» / «Lấy lại»
  SO_FILE_TOI_DA_LAY_NGAY: 20, // số file tối đa mỗi lần «Lấy ngay» (KHÔNG dùng SFTP_SYNC_MAX_FILES)
  SO_O_TOI_DA_LAY_LAI: 20, // số ô (BCVH, ngày, đợt) tối đa mỗi lần «Lấy lại»
  // Phân trang danh sách lượt, lịch sử một ô
  KICH_THUOC_LUOT_MAC_DINH: 20,
  KICH_THUOC_LUOT_TOI_DA: 100,
  LICH_SU_TOI_DA: 20,
  // Hàng khoá của «Thay thế ngày» nằm trong sftp_sync_runs (server/lib/thayTheThucHien.js) — không phải lượt đồng bộ, phải LỌC BỎ
  TIEN_TO_KHOA_THAY_THE: 'Khóa tạm của «Thay thế ngày»'
});
