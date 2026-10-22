// ==========================================
// Lõi THUẦN đo «thời gian thực» giữa hai mốc giờ (mốc KTT -> mốc BCVH) và «quỹ thời gian còn lại» (QUYTG-2).
// Không đụng DB, không require module nào của app. Chưa gắn vào API.
//
// Quy ước:
//  - Đầu vào là chuỗi giờ địa phương như DB đang lưu: 'YYYY-MM-DD HH:MM:SS' (chấp nhận 'T' thay khoảng trắng; phần lẻ giây '.f'..'.fffffff' bị CẮT như importer).
//  - Mọi phép tính bằng GIÂY UTC cố định dựng từ Date.UTC(các trường đã tách): không phụ thuộc TZ máy, không có giờ mùa hè.
//    Không đọc chuỗi giờ bằng hàm dựng ngày của JS (new Date với chuỗi, hay hàm phân tích chuỗi ngày).
//  - Khung loại trừ lặp MỌI ngày, nửa mở [21:00:00, 07:00:00) vắt qua nửa đêm: giây 21:00:00 THUỘC khung, giây 07:00:00 KHÔNG thuộc khung.
//  - Thời gian thực = số giây trong [tu, den) trừ phần giao với khung. den < tu -> số ÂM đối xứng. Không làm tròn.
// ==========================================
'use strict';

const KHUNG_LOAI_TRU = Object.freeze({ batDauGio: 21, ketThucGio: 7 });
const CHI_TIEU_GIO = Object.freeze({ F1_3: 14, F4_1: 12.5, F4_2: 11.5 });

const GIAY_NGAY = 86400;
const GIAY_BAT_DAU = KHUNG_LOAI_TRU.batDauGio * 3600; // 75600
const GIAY_KET_THUC = KHUNG_LOAI_TRU.ketThucGio * 3600; // 25200
const GIAY_LOAI_TRU_MOI_NGAY = GIAY_KET_THUC + (GIAY_NGAY - GIAY_BAT_DAU); // 36000

const GIO_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/;

/** Chuỗi giờ -> số giây kể từ gốc UTC cố định; không hợp lệ / rỗng / 'NULL' / không phải chuỗi -> null (không ném lỗi). */
function docGiay(chuoi) {
  if (typeof chuoi !== 'string') return null;
  const m = GIO_RE.exec(chuoi.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < 1000 || mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const k = new Date(ms);
  if (k.getUTCMonth() !== mo - 1 || k.getUTCDate() !== d) return null; // ngày không tồn tại (30/02...)
  return ms / 1000;
}

/** Số giây bị loại trừ tích lũy từ gốc đến giây x (x là số giây UTC cố định). */
function loaiTruTichLuy(x) {
  const ngay = Math.floor(x / GIAY_NGAY);
  const r = x - ngay * GIAY_NGAY;
  return ngay * GIAY_LOAI_TRU_MOI_NGAY + Math.min(r, GIAY_KET_THUC) + Math.max(0, r - GIAY_BAT_DAU);
}

/** Thời gian thực (giây) từ `tu` đến `den`, trừ khung 21:00–07:00. Không đọc được một trong hai -> null; den < tu -> số âm; tu == den -> 0. */
function thoiGianThucGiay(tu, den) {
  const a = docGiay(tu);
  const b = docGiay(den);
  if (a === null || b === null) return null;
  if (b < a) return -thoiGianThucGiay(den, tu);
  return (b - a) - (loaiTruTichLuy(b) - loaiTruTichLuy(a));
}

/** Quỹ còn lại (giây) = chiTieuGio * 3600 - thời gian thực; null nếu không đo được; có thể âm (hết quỹ). */
function quyConLaiGiay(tu, den, chiTieuGio) {
  const thuc = thoiGianThucGiay(tu, den);
  if (thuc === null) return null;
  return chiTieuGio * 3600 - thuc;
}

/** { dau: '+'|'-', gio, phut, giay } theo giá trị tuyệt đối của số giây (phần lẻ bị bỏ); 0 -> dấu '+'. */
function tachGioPhutGiay(giayNguyen) {
  const t = Math.floor(Math.abs(giayNguyen));
  return { dau: giayNguyen < 0 ? '-' : '+', gio: Math.floor(t / 3600), phut: Math.floor((t % 3600) / 60), giay: t % 60 };
}

module.exports = { KHUNG_LOAI_TRU, CHI_TIEU_GIO, docGiay, thoiGianThucGiay, quyConLaiGiay, tachGioPhutGiay };
