// ==========================================
// THAMSO-2: Giá trị dự phòng cho giao diện
// Mỗi hằng số bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả.
// ==========================================

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const PTC_DAT = 0.82;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const CHUA_CO_TT_CANH_BAO = 0.10;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const SAN_XEP_HANG_BCVH = 50;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const SAN_SO_SANH_TOI_THIEU = 50;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const GIO_BAT_DAU_DANH_GIA = 12;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const BD10_CHUA_XND_XU_LY_NGAY_PCT = 10;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const CHUA_NHAN_XU_LY_NGAY_TU_NGAY = 1;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const PHUONG_XA_TANG_CAO_PCT = 20;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const AN_HAN_PHUT = 60;

// bằng mặc định máy chủ server/config/tham-so-mac-dinh.js; chỉ dùng khi API chưa trả
export const NGUONG_MAT_SHBG_DO = 0.05;

export const THAM_SO_DU_PHONG = Object.freeze({
  PTC_DAT,
  CHUA_CO_TT_CANH_BAO,
  SAN_XEP_HANG_BCVH,
  SAN_SO_SANH_TOI_THIEU,
  GIO_BAT_DAU_DANH_GIA,
  BD10_CHUA_XND_XU_LY_NGAY_PCT,
  CHUA_NHAN_XU_LY_NGAY_TU_NGAY,
  PHUONG_XA_TANG_CAO_PCT,
  AN_HAN_PHUT,
  NGUONG_MAT_SHBG_DO,
});

export default THAM_SO_DU_PHONG;
