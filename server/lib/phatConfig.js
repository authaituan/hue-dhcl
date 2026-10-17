// ==========================================
// Hằng số MÁY CHỦ dùng chung cho kết quả phát hiển thị trên Dashboard / tivi (PHAT-3b, docs/ai/04_DECISIONS.md #79).
// TẠM, PO chốt 14/10/2026 — sẽ chuyển sang màn hình cấu hình tham số toàn site (chưa làm). MỘT nơi duy nhất; giao diện lấy hai ngưỡng
// màu từ phản hồi của endpoint (`nguong`), không tự khai báo lại.
// ==========================================
'use strict';

// Tô màu thẻ PTC: ptc >= NGUONG_PTC_DAT -> đạt; chưa có thông tin phát >= NGUONG_CHUA_CO_TT_CANH_BAO -> cảnh báo.
// (Cùng giá trị đang nằm trong giao diện màn 13, ProcessingDeliveryView.jsx — PHAT-3c mới chuyển màn đó sang lấy từ máy chủ.)
const NGUONG_PTC_DAT = 0.82;
const NGUONG_CHUA_CO_TT_CANH_BAO = 0.10;

// Sàn mẫu số để được XẾP HẠNG theo PTC: BCVH có mẫu số (SHBG đến trong ngày) dưới sàn -> «chưa đủ dữ liệu», không xếp hạng.
const SAN_XEP_HANG_BCVH = 50;
// Sàn cho xếp hạng phường/xã. CHỈ KHAI BÁO, chưa dùng (để PHAT-3d).
const SAN_XEP_HANG_PHUONG_XA = 10;

// DASH-12b — «kết quả phát từ đầu tháng»: so tỷ lệ hôm nay với lũy kế tháng (đơn vị: điểm phần trăm).
// |chênh| < NGUONG_NGANG_DIEM -> «ngang». Chỉ trả chênh khi lũy kế có >= SO_NGAY_TOI_THIEU_SO_SANH ngày có số liệu VÀ mẫu số hôm nay >= SAN_MAU_SO_SO_SANH.
const NGUONG_NGANG_DIEM = 0.5;
const SO_NGAY_TOI_THIEU_SO_SANH = 2;
const SAN_MAU_SO_SO_SANH = 50;

module.exports = Object.freeze({
  NGUONG_PTC_DAT, NGUONG_CHUA_CO_TT_CANH_BAO, SAN_XEP_HANG_BCVH, SAN_XEP_HANG_PHUONG_XA,
  NGUONG_NGANG_DIEM, SO_NGAY_TOI_THIEU_SO_SANH, SAN_MAU_SO_SO_SANH
});
