// ==========================================
// Hằng số MÁY CHỦ của tab «Hướng đóng chuyến nội tỉnh» (KTT-DC-3, docs/ai/42_KTT_API.md mục 23). MỘT nơi duy nhất.
// Getter đọc tham số hiệu lực lúc gọi (chỉnh được qua /api/tham-so, chỉ ADMIN); mặc định ở server/config/tham-so-mac-dinh.js.
// ==========================================
'use strict';
const T = require('../lib/thamSo');

module.exports = T.taoDoiTuong({
  NGUONG_BG_TRONG_TUI: T.theoKhoa('ktt_dc_nguong_bg_trong_tui')
});
