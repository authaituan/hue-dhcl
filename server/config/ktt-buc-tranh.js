// ==========================================
// Hằng số MÁY CHỦ của «Bức tranh đường thư đến» (KTT-KD-1 pha 2, docs/ai/41_KTT_LUU_THOAT.md mục 20). MỘT nơi duy nhất.
// Mọi giá trị là GETTER đọc tham số hiệu lực lúc gọi (chỉnh được qua /api/tham-so, chỉ ADMIN); mặc định ở server/config/tham-so-mac-dinh.js.
// ==========================================
'use strict';
const T = require('../lib/thamSo');

module.exports = T.taoDoiTuong({
  GAP_CUM_PHUT: T.theoKhoa('ktt_bt_gap_cum_phut'),
  CUM_NHO_SHBG: T.theoKhoa('ktt_bt_cum_nho_shbg'),
  MAU_TOI_THIEU: T.theoKhoa('ktt_bt_mau_toi_thieu'),
  PHAN_VI_TUONG_DOI: T.theoKhoa('ktt_bt_phan_vi_tuong_doi'),
  KIEN_DI_NGOAI_PCT: T.theoKhoa('ktt_bt_kien_di_ngoai_pct'),
  CHUYEN_GOM_HE_SO: T.theoKhoa('ktt_bt_chuyen_gom_he_so'),
  SAT_GIO_CHOT_PHUT: T.theoKhoa('ktt_bt_sat_gio_chot_phut'),
  NGAY_TOI_THIEU: T.theoKhoa('ktt_bt_ngay_toi_thieu'),
  CON_LAI_GIO: T.theoKhoa('ktt_bt_con_lai_gio'),
  TY_LE_CON_LAI_PCT: T.theoKhoa('ktt_bt_ty_le_con_lai_pct'),
  MEO_THEO_LO_PHUT: T.theoKhoa('ktt_bt_meo_theo_lo_phut')
});
