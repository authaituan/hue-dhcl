import { formatInt } from '../quythoigian/quyThoiGianFormatters';

/**
 * Định dạng khối lượng (kg) với dấu chấm hàng nghìn kiểu vi-VN.
 * Nếu số nguyên thì hiển thị số nguyên, nếu có thập phân thì tối đa 1 chữ số thập phân.
 * Ví dụ: 6316 -> '6.316', 729 -> '729', 5.6 -> '5,6', null/undefined -> '—'
 * @param {number|null|undefined} kg 
 * @param {Object} [options]
 * @param {boolean} [options.withUnit=false] Có kèm ' kg' ở cuối không
 * @param {number} [options.maxDecimals=1] Số chữ số thập phân tối đa
 */
export function formatKg(kg, { withUnit = false, maxDecimals = 1 } = {}) {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  const val = Number(kg);
  if (val === 0) return withUnit ? '0 kg' : '0';
  
  // Nếu là số tròn chục/trăm/nguyên hoặc >= 100 kg, ưu tiên làm tròn nguyên như canvas (6.316 kg, 3.467 kg)
  // Nếu có phần thập phân cần thiết thì hiển thị tối đa maxDecimals
  const hasDecimal = Math.abs(val - Math.round(val)) >= 0.05 && maxDecimals > 0;
  const str = val.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasDecimal ? maxDecimals : 0,
  });
  return withUnit ? `${str} kg` : str;
}

/**
 * Định dạng kg cho từng bưu gửi trong bảng chi tiết (1 chữ số thập phân kiểu vi-VN: 5,6)
 * @param {number|null|undefined} kg 
 */
export function formatKgDecimal(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  const val = Number(kg);
  return val.toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Rút gọn chuỗi ngày giờ 'YYYY-MM-DD HH:mm:ss' hoặc 'HH:mm:ss' thành 'HH:mm'
 * @param {string|null|undefined} str 
 */
export function formatTimeShort(str) {
  if (!str) return '—';
  const s = String(str).trim();
  // Nếu là 'YYYY-MM-DD HH:mm:ss' -> lấy HH:mm
  const m = s.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
  if (m) return m[1];
  return s;
}

/**
 * Định dạng hiển thị giờ và ngày gọn cho bảng chi tiết (ví dụ '16:48' hoặc '07:10 (hôm sau)')
 * @param {string|null|undefined} timeStr 
 * @param {string|null|undefined} ngayDen 
 */
export function formatGioChiTiet(timeStr, ngayDen) {
  if (!timeStr) return '—';
  const s = String(timeStr).trim();
  const timeMatch = s.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (timeMatch && ngayDen) {
    const [, datePart, hhmm] = timeMatch;
    if (datePart > ngayDen) {
      return `${hhmm} hôm sau`;
    }
    return hhmm;
  }
  return formatTimeShort(s);
}

/**
 * Định dạng nhãn trạng thái thân thiện, không bao giờ để lộ mã kỹ thuật như 'ro_lai'
 * @param {string|null|undefined} code 
 */
export function formatTrangThaiNhan(code) {
  if (!code) return '—';
  const c = String(code).trim();
  if (c === 'ro_lai') return 'Rớt lại';
  if (c === 'truot_chuyen') return 'Trượt chuyến';
  if (c === 'khong_dat') return 'Không đạt 14 giờ';
  if (c === 'dat') return 'Đạt 14 giờ';
  if (c === 'dang_cho_chuyen') return 'Đang chờ chuyến';
  if (c === 'hang_hoan') return 'Hàng hoàn Tổ KHHH';
  return c;
}

/**
 * Định dạng số thập phân kiểu Việt Nam với dấu phẩy, ví dụ: 73.2 -> '73,2', -0.1 -> '-0,1', null -> '—'
 * Thống nhất dấu âm là ký tự '-' chuẩn ASCII.
 * @param {number|null|undefined} n
 * @param {number} [maxDecimals=1]
 */
export function formatDecimal(n, maxDecimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const val = Number(n);
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const str = absVal.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  return isNegative ? `-${str}` : str;
}

/**
 * Lấy thứ trong tuần tiếng Việt từ chuỗi YYYY-MM-DD (dùng UTC để không lệch múi giờ)
 * @param {string|null|undefined} ymd
 */
export function getThuTiengViet(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length < 3) return '';
  const [y, m, d] = parts.map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const names = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return names[day] || '';
}

/**
 * Định dạng ngày giờ không giây: 'YYYY-MM-DD HH:mm:ss' -> 'DD/MM/YYYY HH:mm'
 * @param {string|null|undefined} str
 */
export function formatDateTimeWithoutSeconds(str) {
  if (!str) return '—';
  const s = String(str).replace('T', ' ').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return s;
  const [, yyyy, mm, dd, hh, min] = m;
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}


