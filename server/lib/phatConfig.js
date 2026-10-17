// ==========================================
// Hằng số MÁY CHỦ dùng chung cho kết quả phát hiển thị trên Dashboard / tivi (PHAT-3b, docs/ai/04_DECISIONS.md #79).
// THAMSO-1 (#94): giá trị mặc định nằm ở server/config/tham-so-mac-dinh.js; ADMIN chỉnh qua /api/tham-so. Các thuộc tính dưới đây là GETTER
// (enumerable, đóng băng) trả giá trị hiệu lực lúc gọi — tên, thứ tự khóa và hình dạng giữ nguyên như bản tĩnh trước đây. Giao diện lấy ngưỡng
// từ phản hồi của endpoint (`nguong`), không tự khai báo lại (riêng màn 13 còn bản sao — THAMSO-2).
// ==========================================
'use strict';
const T = require('./thamSo');
const MD = require('../config/tham-so-mac-dinh');

module.exports = T.taoDoiTuong({
  // Tô màu thẻ PTC: ptc >= NGUONG_PTC_DAT -> đạt; chưa có thông tin phát >= NGUONG_CHUA_CO_TT_CANH_BAO -> cảnh báo (CHỈ màu; không còn quyết định «đủ số liệu»).
  NGUONG_PTC_DAT: T.theoKhoa('ptc_dat'),
  NGUONG_CHUA_CO_TT_CANH_BAO: T.theoKhoa('chua_co_tt_canh_bao'),

  // Sàn mẫu số để được XẾP HẠNG theo PTC: BCVH có mẫu số (SHBG đến trong ngày) dưới sàn -> «chưa đủ dữ liệu», không xếp hạng.
  SAN_XEP_HANG_BCVH: T.theoKhoa('san_xep_hang_bcvh'),
  // Sàn cho xếp hạng phường/xã. CHỈ KHAI BÁO, chưa dùng (để PHAT-3d); không nằm trong danh bạ tham số.
  SAN_XEP_HANG_PHUONG_XA: MD.san_xep_hang_phuong_xa,

  // DASH-12b — «kết quả phát từ đầu tháng»: so tỷ lệ hôm nay với lũy kế tháng (đơn vị: điểm phần trăm).
  // |chênh| < NGUONG_NGANG_DIEM -> «ngang». Chỉ trả chênh khi lũy kế có >= SO_NGAY_TOI_THIEU_SO_SANH ngày có số liệu VÀ mẫu số hôm nay >= SAN_MAU_SO_SO_SANH.
  NGUONG_NGANG_DIEM: T.theoKhoa('nguong_ngang_diem'),
  SO_NGAY_TOI_THIEU_SO_SANH: T.theoKhoa('so_ngay_toi_thieu_so_sanh'),
  SAN_MAU_SO_SO_SANH: T.theoKhoa('san_mau_so_so_sanh'),

  // THAMSO-1 (#94): QUY TẮC ĐỊNH NGHĨA «ngày đủ số liệu» (#92-4): «Chưa có TT» < NGUONG_DU_SO_LIEU. CHỈ ĐỌC: không theo ghi đè, tách khỏi mức tô màu ở trên.
  NGUONG_DU_SO_LIEU: MD.nguong_du_so_lieu
});
