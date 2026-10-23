/**
 * Các hàm định dạng và nhãn tiếng Việt cho module Thời gian Khai thác - Vận chuyển
 * Tuân thủ quy tắc: Không dùng chữ bị cấm (tuổi, nghi ngờ, quỹ, bưu cục văn hóa xã, F4.1, F4.2)
 */

/* TẠM — PO có thể đổi */
export const NGUONG_IT_SO_LIEU_BANG = 30; // dòng có chinh < 30 -> tỉ lệ quá hạn hiện chữ nghiêng xám kèm nhãn «ít số liệu»
export const NGUONG_IT_SO_LIEU_KHUNG_GIO = 10; // khung giờ có chinh < 10 -> chữ nghiêng «ít số liệu»
export const NGUONG_SO_SANH_LUY_KE_CHINH = 50; // chỉ hiện chênh lệch so với lũy kế khi khoảng chọn có >= 50 bưu gửi đo được
export const NGUONG_SO_SANH_LUY_KE_SO_NGAY = 2; // và lũy kế có >= 2 ngày có dữ liệu

/**
 * Lấy ngày hôm nay theo múi giờ Việt Nam dạng YYYY-MM-DD
 */
export function getTodayVnYmd() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return formatter.format(d);
}

/**
 * Tính ngày trước hoặc sau n ngày từ chuỗi YYYY-MM-DD (dùng Date.UTC để không bị lệch múi giờ)
 */
export function shiftDay(ymd, offsetDays) {
  if (!ymd) return getTodayVnYmd();
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * Đếm số ngày (bao gồm cả 2 đầu mút) giữa from và to dạng YYYY-MM-DD
 */
export function countDaysInclusive(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return 0;
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000) + 1;
}

/**
 * Định dạng điểm chênh lệch so với lũy kế (ví dụ: +1,2 điểm -> tăng 1,2 điểm; -0,8 điểm -> giảm 0,8 điểm)
 * @param {number|null} diff Điểm phần trăm chênh lệch (đã nhân 100)
 */
export function formatDiemChenhLech(diff) {
  if (diff === null || diff === undefined || isNaN(diff)) return '—';
  const val = Number(diff);
  if (Math.abs(val) < 0.05) return 'không đổi';
  const absStr = Math.abs(val).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return val > 0 ? `tăng ${absStr} điểm` : `giảm ${absStr} điểm`;
}

export function formatInt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

/**
 * Định dạng tỷ lệ dạng 0..1 thành chuỗi % với 1 chữ số thập phân, dùng dấu phẩy kiểu Việt Nam
 * Ví dụ: 0.125 -> 12,5%; null/undefined -> '—'
 */
export function formatPercent(r) {
  if (r === null || r === undefined || isNaN(r)) return '—';
  const val = Number(r) * 100;
  return `${val.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Chuyển số giây thành chuỗi thời gian dạng "6 g 20 p" (hoặc kèm giây nếu cần)
 * @param {number|null} giay 
 * @param {Object} options
 * @param {boolean} [options.withSign=false] Có thêm dấu + trước số dương không
 * @param {boolean} [options.withSeconds=false] Có hiện giây không
 */
export function formatDurationGiay(giay, { withSign = false, withSeconds = false } = {}) {
  if (giay === null || giay === undefined || isNaN(giay)) return '—';
  const num = Number(giay);
  const isNegative = num < 0;
  const abs = Math.abs(num);

  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = Math.floor(abs % 60);

  const mStr = String(m).padStart(2, '0');
  let result = h > 0 ? `${h} g ${mStr} p` : `${m} p`;
  if (withSeconds && s > 0) {
    result += ` ${String(s).padStart(2, '0')} s`;
  }

  if (isNegative) {
    return `-${result}`;
  }
  if (withSign && num > 0) {
    return `+${result}`;
  }
  return result;
}

/**
 * Định dạng chuỗi ngày YYYY-MM-DD sang DD/MM/YYYY
 */
export function formatDdMmYyyy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length >= 3) {
    return `${parts[2].slice(0, 2)}/${parts[1]}/${parts[0]}`;
  }
  return String(ymd);
}

/**
 * Định dạng chuỗi ngày YYYY-MM-DD sang DD/MM
 */
export function formatDdMm(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length >= 3) {
    return `${parts[2].slice(0, 2)}/${parts[1]}`;
  }
  return String(ymd);
}

/**
 * Định dạng ngày giờ từ chuỗi API 'YYYY-MM-DD HH:mm:ss' sang 'DD/MM HH:mm:ss' hoặc 'DD/MM/YYYY HH:mm:ss'
 */
export function formatDateTime(str, includeYear = true) {
  if (!str) return '—';
  // Chuẩn hóa định dạng
  const s = String(str).replace('T', ' ');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  const [, yyyy, mm, dd, hh, min, ss] = m;
  const secPart = ss !== undefined ? `:${ss}` : '';
  if (includeYear) {
    return `${dd}/${mm}/${yyyy} ${hh}:${min}${secPart}`;
  }
  return `${dd}/${mm} ${hh}:${min}${secPart}`;
}

/**
 * Tên hiển thị thân thiện cho nhóm BD10
 */
export const NHOM_BD10_LABELS = {
  KTT: 'Qua TTKT',
  NGOAI_53: 'Giao nhận trực tiếp',
  LAP_DI_TAI_BCVH: 'Lập đi tại BCVH',
  NOI_TINH_KHAC: 'Nội tỉnh khác',
  RONG: 'Không có số BD10',
  KHONG_HOP_LE: 'BD10 không hợp lệ',
};

/**
 * Tên nhãn cho các lý do không đo được
 */
export const LY_DO_KHONG_DO_LABELS = {
  LAP_DI_TAI_BCVH: 'Lập đi tại BCVH',
  THIEU_XAC_NHAN_KTT: 'Thiếu mốc tại Trung tâm khai thác',
  KHONG_QUA_KTT: 'BD10 nguồn khác (không qua Trung tâm khai thác)',
  KHONG_CO_BD10: 'Không có số BD10',
  BD10_KHONG_HOP_LE: 'Số BD10 không hợp lệ',
  THIEU_XND_BCVH: 'Thiếu mốc BCVH nhận',
  NHAN_TRUC_TIEP_KHONG_QUA_KTT: 'Nhận trực tiếp, không qua TTKT',
};
