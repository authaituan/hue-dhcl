// ==========================================
// Module «Xử lý và tỷ lệ phát» (PHAT-1, docs/ai/08_PHAT.md): MỘT file hằng số.
// Trạng thái phát, khung giờ đến, nhóm chờ, giới hạn, bảng chuyển trạng thái bất thường, mã lỗi + lý do.
// Quy tắc nghiệp vụ chuẩn: PHAT-0 (tóm tắt ở docs/ai/08_PHAT.md).
// ==========================================
'use strict';

// 5 trạng thái (danh sách cố định). SHBG đã đến mà chưa có trạng thái được tính là CHUA_CO_TT.
const TRANG_THAI = Object.freeze([
  Object.freeze({ ma: 'PTC', nhan: 'Phát thành công' }),
  Object.freeze({ ma: 'PKTC', nhan: 'Phát không thành công' }),
  Object.freeze({ ma: 'CHUYEN_HOAN', nhan: 'Chuyển hoàn' }),
  Object.freeze({ ma: 'CHUA_CO_TT', nhan: 'Chưa có thông tin phát' }),
  Object.freeze({ ma: 'LAC_HUONG', nhan: 'Lạc hướng' })
]);
const TT_MA = Object.freeze(TRANG_THAI.map((t) => t.ma));
const TT_NHAN = Object.freeze(Object.fromEntries(TRANG_THAI.map((t) => [t.ma, t.nhan])));
const TT_CHUA_CO = 'CHUA_CO_TT';

// «Đã vu hồi» (VUHOI-1): CỜ PHỤ của PKTC (cột da_vu_hoi), KHÔNG phải trạng thái thứ 6 — không nằm trong TRANG_THAI / TT_MA / CHECK 5 mã.
const DA_VU_HOI = Object.freeze({ ma: 'DA_VU_HOI', nhan: 'Đã vu hồi', trang_thai: 'PKTC' });
const DANH_SACH_NHAN = Object.freeze([...TRANG_THAI.map((t) => t.nhan), DA_VU_HOI.nhan]); // 6 nhãn người dùng được chọn / nhập
const nhanTrangThai = (ma, vuHoi) => (vuHoi && ma === DA_VU_HOI.trang_thai ? DA_VU_HOI.nhan : TT_NHAN[ma]);

// 6 khung giờ đến BCVH (theo arrival_at): [tu, den) tính bằng giờ; den = null là không giới hạn.
const KHUNG_GIO_DEN = Object.freeze([
  Object.freeze({ ma: 'TRUOC_10', nhan: 'Trước 10h', tu: 0, den: 10 }),
  Object.freeze({ ma: '10_12', nhan: '10–12h', tu: 10, den: 12 }),
  Object.freeze({ ma: '12_14', nhan: '12–14h', tu: 12, den: 14 }),
  Object.freeze({ ma: '14_16', nhan: '14–16h', tu: 14, den: 16 }),
  Object.freeze({ ma: '16_18', nhan: '16–18h', tu: 16, den: 18 }),
  Object.freeze({ ma: 'SAU_18', nhan: 'Sau 18h', tu: 18, den: null })
]);

// 4 nhóm «chưa có thông tin phát, đã chờ bao lâu» (phút kể từ giờ đến; dùng ở PHAT-1 Việc 6).
const NHOM_CHO = Object.freeze([
  Object.freeze({ ma: 'DUOI_2H', nhan: 'Dưới 2 giờ', tu_phut: 0, den_phut: 120 }),
  Object.freeze({ ma: '2_4H', nhan: '2–4 giờ', tu_phut: 120, den_phut: 240 }),
  Object.freeze({ ma: 'TREN_4H', nhan: 'Trên 4 giờ', tu_phut: 240, den_phut: null }),
  Object.freeze({ ma: 'QUA_NGAY', nhan: 'Qua ngày', tu_phut: null, den_phut: null }) // đến từ ngày trước ngày xét
]);

const GIOI_HAN = Object.freeze({
  MAX_DONG: 20000,
  MAX_BYTES: 10 * 1024 * 1024,
  GIU_BAN_KIEM_TRA_NGAY: 7,
  MAX_GHI_CHU: 500, // dài hơn thì CẮT và cảnh báo vàng (CANH_BAO_GHI_CHU_CAT), vẫn nhập
  TON_CHO_LUI_NGAY: 30, // «tồn chờ» chỉ xét SHBG đến trong chừng này ngày trước ngày xét (tránh quét cả lịch sử)
  MAX_SUA_MOT_LAN: 1000, // số phần tử tối đa của PATCH /rows
  TRANG_MAC_DINH: 50,
  TRANG_TOI_DA: 200,
  MAX_NGAY_LIEN_QUAN: 31 // số ngày tối đa trả về trong «tỷ lệ trước / sau» của commit
});

// Số dòng tối đa của file mẫu / file nhập: mặc định GIOI_HAN.MAX_DONG; biến môi trường PHAT_MAX_DONG chỉ được HẠ xuống (test dùng ngưỡng nhỏ,
// như ARRIVALS_EXPORT_MAX_ROWS của xuất file).
function maxDong() {
  const n = Number(process.env.PHAT_MAX_DONG);
  return Number.isInteger(n) && n > 0 ? Math.min(n, GIOI_HAN.MAX_DONG) : GIOI_HAN.MAX_DONG;
}

// SHBG: 2 chữ + 9 số + 2 chữ (S10 của UPU). Hậu tố là mã nước nên KHÔNG ép VN (PO duyệt 13/10/2026).
const SHBG_REGEX = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/;
const SHBG_DO_DAI = 13;

// Sheet ẩn trong file mẫu / file lỗi. Tăng PHIEN_BAN_COT khi đổi cấu trúc cột: file phiên bản cũ bị từ chối.
const META_SHEET = '_meta';
const PHIEN_BAN_COT = 1;
const DUONG_THU_TRONG = '(không có)';

// Chuyển trạng thái BẤT THƯỜNG (chỉ CẢNH BÁO, không chặn). `tu` là trạng thái hiện có (chưa có = CHUA_CO_TT).
// Quy tắc đề xuất (PO duyệt khi nghiệm thu):
//  1. Đã có kết quả cuối (PTC, Chuyển hoàn) mà đổi sang trạng thái khác — kể cả về «Chưa có thông tin phát».
//  2. Đã có thông tin (PKTC, Lạc hướng) mà quay về «Chưa có thông tin phát».
const CHUYEN_BAT_THUONG = Object.freeze((() => {
  const out = [];
  for (const tu of ['PTC', 'CHUYEN_HOAN']) {
    for (const den of TT_MA) if (den !== tu) out.push(Object.freeze({ tu, den }));
  }
  for (const tu of ['PKTC', 'LAC_HUONG']) out.push(Object.freeze({ tu, den: TT_CHUA_CO }));
  return out;
})());
const BAT_THUONG_SET = new Set(CHUYEN_BAT_THUONG.map((c) => `${c.tu}>${c.den}`));
const laChuyenBatThuong = (tu, den) => BAT_THUONG_SET.has(`${tu}>${den}`);

// Kết quả của một dòng trong bản kiểm tra và mã lỗi.
const KET_QUA = Object.freeze({ HOP_LE: 'HOP_LE', BO_QUA_TRONG: 'BO_QUA_TRONG', LOI: 'LOI', DA_NHAP: 'DA_NHAP' });
const MA_LOI = Object.freeze({
  TRUNG_SHBG: 'TRUNG_SHBG',
  TT_NGOAI_DS: 'TT_NGOAI_DS',
  KHONG_CO_TRONG_DEN: 'KHONG_CO_TRONG_DEN',
  SAI_DINH_DANG: 'SAI_DINH_DANG',
  KHONG_DOI: 'KHONG_DOI'
});
// Một dòng có thể phạm nhiều lỗi; chỉ ghi lỗi ĐẦU TIÊN theo thứ tự này (sửa xong lỗi này mới hiện lỗi sau).
const THU_TU_LOI = Object.freeze([MA_LOI.SAI_DINH_DANG, MA_LOI.TRUNG_SHBG, MA_LOI.TT_NGOAI_DS, MA_LOI.KHONG_CO_TRONG_DEN, MA_LOI.KHONG_DOI]);

// Múi giờ hiển thị «số liệu tính đến lúc» (giờ nhập lưu UTC có chữ Z). Việt Nam không có giờ mùa hè nên cố định UTC+7.
const MUI_GIO = 'Asia/Bangkok';
const CANH_BAO_GHI_CHU_CAT = `Ghi chú bị cắt (tối đa ${GIOI_HAN.MAX_GHI_CHU} ký tự)`;
const CANH_BAO_BO_VU_HOI = 'Bỏ đánh dấu vu hồi';

const TRANG_THAI_DOT = Object.freeze({ DA_NHAP: 'da_nhap', DA_HOAN_TAC: 'da_hoan_tac' });

module.exports = {
  TRANG_THAI, TT_MA, TT_NHAN, TT_CHUA_CO, DA_VU_HOI, DANH_SACH_NHAN, nhanTrangThai, CANH_BAO_BO_VU_HOI, KHUNG_GIO_DEN, NHOM_CHO, GIOI_HAN, maxDong, SHBG_REGEX, SHBG_DO_DAI,
  META_SHEET, PHIEN_BAN_COT, DUONG_THU_TRONG, MUI_GIO, CANH_BAO_GHI_CHU_CAT, CHUYEN_BAT_THUONG, laChuyenBatThuong, KET_QUA, MA_LOI, THU_TU_LOI, TRANG_THAI_DOT
};
