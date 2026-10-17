// ==========================================
// THAMSO-3: Các hàm tiện ích định dạng tham số hệ thống
// Quy đổi đơn vị hiển thị, cắt chuỗi, định dạng giờ VN
// ==========================================

import { formatUtcToVnDateTime } from '../../utils/sourceIngest';

export { formatUtcToVnDateTime };

/**
 * Lấy câu đầu tiên của mô tả (cắt ở dấu chấm đầu tiên).
 * Nếu không có dấu chấm, trả về nguyên văn.
 */
export function tachCauDau(moTa) {
  if (!moTa || typeof moTa !== 'string') return '';
  const idx = moTa.indexOf('.');
  if (idx !== -1) {
    return moTa.slice(0, idx + 1).trim();
  }
  return moTa.trim();
}

/**
 * Tách ví dụ dạng "Đặt X: ... Đặt Y: ..." thành hai thẻ.
 * Nếu không tách được, trả về null để component hiển thị nguyên văn trong 1 thẻ.
 */
export function tachViDu(viDu) {
  if (!viDu || typeof viDu !== 'string') return null;
  const str = viDu.trim();

  // Tìm các vị trí bắt đầu bằng "Đặt "
  const re = /(?:^|\s)(Đặt\s+[^]+?)(?=(?:\s+Đặt\s+|$))/g;
  const matches = [];
  let m;
  while ((m = re.exec(str)) !== null) {
    matches.push(m[1].trim());
  }

  if (matches.length >= 2) {
    return [matches[0], matches.slice(1).join(' ')];
  }

  // Thử tách theo dấu chấm nếu có 2 câu rõ ràng
  const sentences = str.split(/(?<=\.)\s+/);
  if (sentences.length === 2 && sentences[0].length > 10 && sentences[1].length > 10) {
    return [sentences[0].trim(), sentences[1].trim()];
  }

  return null;
}

/**
 * Định dạng giá trị hiển thị cho bảng hoặc thẻ
 * @param {any} val - Giá trị từ API (hoặc draft)
 * @param {string} kieu - phan_so | phan_tram_nguyen | gio_nguyen | gio_hhmm | thap_phan | so_nguyen | danh_sach
 * @param {string} donVi - Đơn vị từ API
 */
export function formatGiaTriHienThi(val, kieu, donVi = '') {
  if (val === null || val === undefined) return '—';

  switch (kieu) {
    case 'phan_so': {
      // Ví dụ: 0.82 -> 82% (làm tròn tối đa 2 chữ số thập phân khi hiển thị)
      const num = Number(val);
      if (isNaN(num)) return String(val);
      const pct = Math.round(num * 10000) / 100;
      return `${pct.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
    }

    case 'phan_tram_nguyen': {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      return `${num.toLocaleString('vi-VN')}%`;
    }

    case 'gio_nguyen': {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      return `${num} giờ`;
    }

    case 'gio_hhmm': {
      return String(val);
    }

    case 'thap_phan': {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      const formatted = num.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
      return donVi ? `${formatted} ${donVi}` : formatted;
    }

    case 'so_nguyen': {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      const formatted = num.toLocaleString('vi-VN');
      return donVi ? `${formatted} ${donVi}` : formatted;
    }

    case 'danh_sach': {
      if (Array.isArray(val)) {
        return `${val.length} mục`;
      }
      if (val && typeof val === 'object') {
        const keys = Object.keys(val);
        return `${keys.length} mục`;
      }
      return String(val);
    }

    default:
      return String(val);
  }
}

/**
 * Quy đổi giá trị API sang giá trị hiển thị trong ô nhập
 * @param {any} val - Giá trị API
 * @param {string} kieu - Kiểu tham số
 */
export function giaTriToInput(val, kieu) {
  if (val === null || val === undefined) return '';

  switch (kieu) {
    case 'phan_so': {
      // 0.82 -> 82 (nhập dưới dạng %)
      const num = Number(val);
      if (isNaN(num)) return '';
      return String(Math.round(num * 10000) / 100);
    }
    case 'gio_hhmm':
      return String(val);
    default:
      return String(val);
  }
}

/**
 * Quy đổi giá trị từ ô nhập sang giá trị gửi API
 * @param {string|number} inputVal - Giá trị người dùng nhập
 * @param {string} kieu - Kiểu tham số
 */
export function inputToGiaTri(inputVal, kieu) {
  if (inputVal === '' || inputVal === null || inputVal === undefined) return null;

  switch (kieu) {
    case 'phan_so': {
      // Nhập 82 -> gửi 0.82; nhập 82.5 -> gửi 0.825 (làm tròn tối đa 4 chữ số thập phân)
      const num = Number(inputVal);
      if (isNaN(num)) return null;
      return Math.round((num / 100) * 10000) / 10000;
    }

    case 'phan_tram_nguyen':
    case 'gio_nguyen':
    case 'so_nguyen': {
      const num = Number(inputVal);
      if (isNaN(num) || !Number.isInteger(num)) return null;
      return num;
    }

    case 'thap_phan': {
      const num = Number(inputVal);
      if (isNaN(num)) return null;
      return Math.round(num * 10000) / 10000;
    }

    case 'gio_hhmm':
      return String(inputVal).trim();

    default:
      return inputVal;
  }
}

/**
 * Kiểm tra tính hợp lệ cục bộ của giá trị nhập so với meta
 * @returns {string|null} Trả về thông báo lỗi hoặc null nếu hợp lệ
 */
export function validateParamValue(inputVal, meta) {
  if (inputVal === '' || inputVal === null || inputVal === undefined) {
    return 'Vui lòng nhập giá trị';
  }

  const { kieu, min, max, khoa } = meta;

  if (kieu === 'gio_hhmm') {
    const s = String(inputVal).trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
      return 'Định dạng giờ phải là HH:MM (00:00–23:59)';
    }
    if (min !== null && s < min) return `Giờ tối thiểu là ${min}`;
    if (max !== null && s > max) return `Giờ tối đa là ${max}`;
    return null;
  }

  const num = Number(inputVal);
  if (isNaN(num)) {
    return 'Giá trị phải là một số';
  }

  const isNguyen = kieu === 'so_nguyen' || kieu === 'phan_tram_nguyen' || kieu === 'gio_nguyen';
  if (isNguyen && !Number.isInteger(num)) {
    return 'Giá trị phải là số nguyên';
  }

  // Với kiểu phan_so: inputVal là % (50 -> 99) trong khi min, max là dạng 0.5 -> 0.99
  if (kieu === 'phan_so') {
    const valPhanSo = Math.round((num / 100) * 10000) / 10000;
    if (min !== null && valPhanSo < min) {
      return `Giá trị tối thiểu là ${Math.round(min * 100)}%`;
    }
    if (max !== null && valPhanSo > max) {
      return `Giá trị tối đa là ${Math.round(max * 100)}%`;
    }
    return null;
  }

  if (min !== null && num < min) {
    return `Giá trị tối thiểu là ${min.toLocaleString('vi-VN')}`;
  }
  if (max !== null && num > max) {
    return `Giá trị tối đa là ${max.toLocaleString('vi-VN')}`;
  }

  return null;
}

/**
 * Chuyển YYYY-MM-DD sang DD/MM/YYYY không dùng new Date('YYYY-MM-DD')
 */
export function ymdToDmy(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
}

/**
 * Bảng ánh xạ mã quy tắc định nghĩa sang nhãn tiếng Việt (khung_gio_den, nhom_cho)
 */
export const ANH_XA_MA_QUY_TAC = {
  TRUOC_10: 'Trước 10h',
  '10_12': '10–12h',
  '12_14': '12–14h',
  '14_16': '14–16h',
  '16_18': '16–18h',
  SAU_18: 'Sau 18h',
  DUOI_2H: 'Dưới 2 giờ',
  '2_4H': '2–4 giờ',
  TREN_4H: 'Trên 4 giờ',
  QUA_NGAY: 'Qua ngày'
};

/**
 * Hiển thị nhãn tiếng Việt cho mã quy tắc; nếu là mã lạ thì giữ nguyên
 */
export function formatMaQuyTac(ma) {
  if (!ma) return '';
  return ANH_XA_MA_QUY_TAC[ma] || String(ma);
}


