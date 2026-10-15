// ==========================================
// Hằng số MÁY CHỦ của chức năng «Thay thế ngày của một BCVH» (SANLUONG-5g-2, docs/ai/15_THAY_THE_NGAY_XEM_TRUOC.md).
// TẠM, PO chốt 14/10/2026 — sẽ chuyển sang module ngưỡng chỉnh được trên giao diện (chưa làm). MỘT nơi duy nhất.
// ==========================================
'use strict';

// Tỷ lệ SHBG có ở dữ liệu cũ nhưng KHÔNG có ở file mới (mất) vượt ngưỡng này thì báo ĐỎ (mức `DO`). Đúng bằng ngưỡng vẫn là `CAN_XAC_NHAN`.
const NGUONG_MAT_SHBG_DO = 0.05;
// Số SHBG mẫu (thuộc tập chỉ có ở dữ liệu cũ) trả về cho ADMIN trong bản xem trước. KHÔNG ghi vào log / tài liệu / báo cáo.
const SO_SHBG_MAU = 20;

module.exports = Object.freeze({ NGUONG_MAT_SHBG_DO, SO_SHBG_MAU });
