// ==========================================
// Hằng số MÁY CHỦ của chức năng «Thay thế ngày của một BCVH» (SANLUONG-5g-2, docs/ai/15_THAY_THE_NGAY_XEM_TRUOC.md). MỘT nơi duy nhất.
// TẠM, PO chốt 14/10/2026. THAMSO-1 (#94): NGUONG_MAT_SHBG_DO nay chỉnh được qua /api/tham-so (chỉ ADMIN, trần 20%; mặc định ở server/config/tham-so-mac-dinh.js) — thuộc tính là GETTER.
// ==========================================
'use strict';
const T = require('../lib/thamSo');

module.exports = T.taoDoiTuong({
  // Tỷ lệ SHBG có ở dữ liệu cũ nhưng KHÔNG có ở file mới (mất) vượt ngưỡng này thì báo ĐỎ (mức `DO`). Đúng bằng ngưỡng vẫn là `CAN_XAC_NHAN`.
  NGUONG_MAT_SHBG_DO: T.theoKhoa('nguong_mat_shbg_do'),
  // Số SHBG mẫu (thuộc tập chỉ có ở dữ liệu cũ) trả về cho ADMIN trong bản xem trước. KHÔNG ghi vào log / tài liệu / báo cáo.
  SO_SHBG_MAU: 20,
  // SANLUONG-5g-3 (PO chốt 14–15/10/2026): thùng rác giữ 30 ngày; giữ 5 bản sao lưu gần nhất; đệm dung lượng trống khi sao lưu (ngoài 1,2 × cỡ DB + WAL).
  SO_NGAY_GIU_THUNG_RAC: 30,
  SO_BAN_SAO_LUU_GIU: 5,
  DEM_SAO_LUU_BYTE: 32 * 1024 * 1024
});
