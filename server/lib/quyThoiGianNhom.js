// ==========================================
// Lõi THUẦN phân nhóm số hiệu BD10 và đánh giá «quỹ thời gian» của MỘT lượt (QUYTG-3), ghép trên ./quyThoiGian (QUYTG-2).
// Không đụng DB; chỉ require('./quyThoiGian'). Chưa gắn vào truy vấn hay API.
//
// Phân nhóm — phanNhomBd10(bd10No, maBcvhNhan). Chuẩn hoá: ép về chuỗi, trim(); null / undefined / rỗng / chỉ khoảng trắng / chữ NULL (không phân biệt hoa thường) -> RONG.
// Rồi theo THỨ TỰ ƯU TIÊN (điều kiện đầu đúng thì dừng):
//   (a) ngắn hơn 6 ký tự                                   -> KHONG_HOP_LE
//   (b) 6 ký tự đầu = MA_KTT                               -> KTT
//   (c) maBcvhNhan (trim) khác rỗng và 6 ký tự đầu = nó    -> LAP_DI_TAI_BCVH  («lập đi»: so 6 ký tự đầu BD10 với mã BCVH nhận — cùng quy tắc #68 của «chưa nhận»)
//   (d) bắt đầu '53'                                       -> NOI_TINH_KHAC
//   (e) còn lại                                            -> NGOAI_53
// Đánh giá — danhGiaMotLuot trả { nhom, trangThai, lyDo, thoiGianThucGiay, quyConLaiGiay, nghiNgo, chiTieuGio, nguonMocBatDau } (luôn đủ 8 khóa, khóa không áp dụng = null; không ném lỗi).
//   Đầu vào tùy chọn chiTieuF13Gio (số > 0, mặc định 14; QUYTG-7b): chỉ tiêu F1_3 của lượt; chiTieuGio = số giờ đã dùng. F4_1 / F4_2 giữ nguyên:
//   trangThai KHONG_DO_DUOC: nhóm LAP_DI_TAI_BCVH / RONG / KHONG_HOP_LE (lý do theo nhóm); hoặc thiếu mốc KTT (lý do theo nhóm KTT / NOI_TINH_KHAC); hoặc có KTT mà thiếu XNĐ BCVH; nhóm NGOAI_53 thiếu XNĐ BCVH (THIEU_XND_BCVH).
//   Nhóm NGOAI_53 (QUYTG-7a; PO 21–22/10/2026: hàng tỉnh khác giao TRỰC TIẾP cho BCVH, không qua KTT): mốc bắt đầu = chính XNĐ BCVH, giá trị KTT (nếu có) bị bỏ qua.
//   Đọc được XNĐ -> DO_DUOC, thoiGianThucGiay = 0, quyConLaiGiay = chỉ tiêu × 3600 (không âm), lyDo null, nghiNgo false, nguonMocBatDau 'XND_BCVH'. Vẫn là lượt chính ở tổng hợp.
//   nguonMocBatDau: 'KTT' khi đo (hoặc AM) từ mốc KTT; 'XND_BCVH' cho NGOAI_53 đo được; null khi KHONG_DO_DUOC.
//   trangThai AM: đọc được cả hai mốc và XNĐ < KTT; lyDo KTT_SAU_XND_BCVH; thoiGianThucGiay là số âm đối xứng; quyConLaiGiay = null.
//   trangThai DO_DUOC: đọc được cả hai mốc, XNĐ >= KTT; lyDo null; quyConLaiGiay = { F1_3, F4_1, F4_2 } (giây, có thể âm = hết quỹ).
//   nghiNgo = true khi đọc được cả hai mốc và |XNĐ − KTT| (hiệu gộp, giây) > ngưỡng (mặc định 7 ngày); vẫn trả đủ số, lyDo giữ nguyên.
// ==========================================
'use strict';
const Q = require('./quyThoiGian');

// Trùng TTKT_BD10_PREFIX ở arrivalsQuery.js:42; cố ý KHÔNG require để lõi thuần không kéo theo module DB (thống nhất ở ticket sau).
const MA_KTT = '530100';

const NHOM_BD10 = Object.freeze({
  KTT: 'KTT', LAP_DI_TAI_BCVH: 'LAP_DI_TAI_BCVH', NOI_TINH_KHAC: 'NOI_TINH_KHAC', NGOAI_53: 'NGOAI_53', RONG: 'RONG', KHONG_HOP_LE: 'KHONG_HOP_LE'
});
const NHAN_NHOM = Object.freeze({
  KTT: 'Qua KTT (530100)',
  LAP_DI_TAI_BCVH: 'BD10 lập đi tại BCVH',
  NOI_TINH_KHAC: 'Giữa BCVH/BC/VHX (53 khác)',
  NGOAI_53: 'Tỉnh khác, trực tiếp',
  RONG: 'Không có số BD10',
  KHONG_HOP_LE: 'Số BD10 không hợp lệ'
});

const LY_DO = Object.freeze({
  LAP_DI_TAI_BCVH: 'LAP_DI_TAI_BCVH',
  KHONG_CO_BD10: 'KHONG_CO_BD10',
  BD10_KHONG_HOP_LE: 'BD10_KHONG_HOP_LE',
  NHAN_TRUC_TIEP_KHONG_QUA_KTT: 'NHAN_TRUC_TIEP_KHONG_QUA_KTT',
  KHONG_QUA_KTT: 'KHONG_QUA_KTT',
  THIEU_XAC_NHAN_KTT: 'THIEU_XAC_NHAN_KTT',
  THIEU_XND_BCVH: 'THIEU_XND_BCVH',
  KTT_SAU_XND_BCVH: 'KTT_SAU_XND_BCVH',
  NGHI_NGO_QUA_7_NGAY: 'NGHI_NGO_QUA_7_NGAY'
});
const NHAN_LY_DO = Object.freeze({
  LAP_DI_TAI_BCVH: 'BD10 lập đi tại BCVH, không đo quỹ thời gian',
  KHONG_CO_BD10: 'Không có số BD10',
  BD10_KHONG_HOP_LE: 'Số BD10 không hợp lệ',
  NHAN_TRUC_TIEP_KHONG_QUA_KTT: 'Nhận trực tiếp từ tỉnh khác, không qua KTT',
  KHONG_QUA_KTT: 'Không qua KTT (BD10 giữa các đơn vị trong tỉnh)',
  THIEU_XAC_NHAN_KTT: 'Thiếu xác nhận đến tại KTT',
  THIEU_XND_BCVH: 'Thiếu XNĐ BD10 tại BCVH',
  KTT_SAU_XND_BCVH: 'Mốc KTT sau mốc XNĐ tại BCVH',
  NGHI_NGO_QUA_7_NGAY: 'Nghi ngờ: thời gian từ KTT đến BCVH quá 7 ngày'
});

const NGUONG_NGHI_NGO_GIAY = 7 * 86400;

function chuanHoa(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return /^null$/i.test(s) ? '' : s;
}

function phanNhomBd10(bd10No, maBcvhNhan) {
  const b = chuanHoa(bd10No);
  if (b === '') return NHOM_BD10.RONG;
  if (b.length < 6) return NHOM_BD10.KHONG_HOP_LE;
  const dau6 = b.slice(0, 6);
  if (dau6 === MA_KTT) return NHOM_BD10.KTT;
  const ma = maBcvhNhan === null || maBcvhNhan === undefined ? '' : String(maBcvhNhan).trim();
  if (ma !== '' && dau6 === ma) return NHOM_BD10.LAP_DI_TAI_BCVH;
  if (b.startsWith('53')) return NHOM_BD10.NOI_TINH_KHAC;
  return NHOM_BD10.NGOAI_53;
}

// NGOAI_53 không còn đòi mốc KTT (đo từ XNĐ BCVH) nên không có mặt ở đây; NHAN_TRUC_TIEP_KHONG_QUA_KTT chỉ còn giữ trong LY_DO để quyThoiGianQuery.js liệt kê lý do.
const LY_DO_THIEU_KTT = Object.freeze({
  KTT: LY_DO.THIEU_XAC_NHAN_KTT, NOI_TINH_KHAC: LY_DO.KHONG_QUA_KTT
});

function ketQua(nhom, trangThai, lyDo, thuc, quy, nghiNgo, chiTieuGio, nguonMocBatDau) {
  return { nhom, trangThai, lyDo, thoiGianThucGiay: thuc, quyConLaiGiay: quy, nghiNgo, chiTieuGio, nguonMocBatDau };
}

/**
 * Quỹ { F1_3, F4_1, F4_2 } (giây) từ thời gian thực `thuc` (giây, đã đo MỘT lần bằng Q.thoiGianThucGiay); F1_3 theo chỉ tiêu của lượt `f13Gio`.
 * QUYTG-9a: đo thời gian thực một lần thay vì ba lần (cùng công thức `chiTieuGio * 3600 - thuc` của Q.quyConLaiGiay, kết quả y hệt) — lũy kế tháng đánh giá ~10^5 lượt mỗi lần tính.
 */
function quyCacChiTieu(thuc, f13Gio) {
  const quy = {};
  for (const [k, gio] of Object.entries(Q.CHI_TIEU_GIO)) quy[k] = (k === 'F1_3' ? f13Gio : gio) * 3600 - thuc;
  return quy;
}

function danhGiaMotLuot(luot) {
  const { bd10No, maBcvhNhan, ktt, xnd, nguongNghiNgoGiay = NGUONG_NGHI_NGO_GIAY, chiTieuF13Gio } = luot && typeof luot === 'object' ? luot : {};
  const f13Gio = typeof chiTieuF13Gio === 'number' && Number.isFinite(chiTieuF13Gio) && chiTieuF13Gio > 0 ? chiTieuF13Gio : Q.CHI_TIEU_GIO.F1_3;
  const nhom = phanNhomBd10(bd10No, maBcvhNhan);
  const khong = (lyDo) => ketQua(nhom, 'KHONG_DO_DUOC', lyDo, null, null, false, f13Gio, null);
  if (nhom === NHOM_BD10.LAP_DI_TAI_BCVH) return khong(LY_DO.LAP_DI_TAI_BCVH);
  if (nhom === NHOM_BD10.RONG) return khong(LY_DO.KHONG_CO_BD10);
  if (nhom === NHOM_BD10.KHONG_HOP_LE) return khong(LY_DO.BD10_KHONG_HOP_LE);

  if (nhom === NHOM_BD10.NGOAI_53) { // nhận trực tiếp: mốc bắt đầu = XNĐ BCVH, bỏ qua `ktt`
    if (Q.docGiay(xnd) === null) return khong(LY_DO.THIEU_XND_BCVH);
    const thucTrucTiep = Q.thoiGianThucGiay(xnd, xnd);
    return ketQua(nhom, 'DO_DUOC', null, thucTrucTiep, quyCacChiTieu(thucTrucTiep, f13Gio), false, f13Gio, 'XND_BCVH');
  }

  const gKtt = Q.docGiay(ktt);
  if (gKtt === null) return khong(LY_DO_THIEU_KTT[nhom]);
  const gXnd = Q.docGiay(xnd);
  if (gXnd === null) return khong(LY_DO.THIEU_XND_BCVH);

  const gop = gXnd - gKtt;
  const nghiNgo = Math.abs(gop) > nguongNghiNgoGiay;
  const thuc = Q.thoiGianThucGiay(ktt, xnd);
  if (gop < 0) return ketQua(nhom, 'AM', LY_DO.KTT_SAU_XND_BCVH, thuc, null, nghiNgo, f13Gio, 'KTT');
  return ketQua(nhom, 'DO_DUOC', null, thuc, quyCacChiTieu(thuc, f13Gio), nghiNgo, f13Gio, 'KTT');
}

module.exports = { MA_KTT, NHOM_BD10, NHAN_NHOM, LY_DO, NHAN_LY_DO, NGUONG_NGHI_NGO_GIAY, phanNhomBd10, danhGiaMotLuot };
