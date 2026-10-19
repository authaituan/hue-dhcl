import { apiFetchJson } from './api';

// ==========================================
// TIỆN ÍCH DÙNG CHO «NẠP DỮ LIỆU NGUỒN»
// ==========================================

// Chuyển chuỗi ISO UTC (...Z) sang giờ Việt Nam: HH:mm dd/MM/yyyy
export function formatUtcToVnDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
  } catch (e) {
    return isoStr;
  }
}

// Chuyển chuỗi ISO UTC sang giờ ngắn: HH:mm dd/MM
export function formatUtcToVnShort(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
  } catch (e) {
    return isoStr;
  }
}

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
export function formatYmdToDmy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
}

// Định dạng số nguyên có dấu chấm ngăn nghìn (vd: 1.234)
export function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Lấy ngày hôm nay theo giờ Việt Nam dạng YYYY-MM-DD
export function getVnTodayYmd() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return formatter.format(d);
}

// Cộng/trừ N ngày từ YYYY-MM-DD
export function addDaysYmd(ymd, days) {
  const parts = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Tính số ngày giữa 2 mốc YYYY-MM-DD (bao gồm 2 đầu)
export function countDays(tuYmd, denYmd) {
  const p1 = tuYmd.split('-').map(Number);
  const p2 = denYmd.split('-').map(Number);
  const d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  return Math.round((d2 - d1) / (1000 * 3600 * 24)) + 1;
}

// Ánh xạ trạng thái ô sang nhãn và kiểu hiển thị
export const CELL_STATUS_MAP = {
  DA_NAP: {
    label: 'Đã nạp',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    cellClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100',
    textClass: 'text-emerald-700'
  },
  NHAP_TAY: {
    label: 'Nhập tay',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
    cellClass: 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200',
    textClass: 'text-gray-700'
  },
  RONG: {
    label: 'Rỗng',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    cellClass: 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100',
    textClass: 'text-purple-700'
  },
  LOI: {
    label: 'Lỗi',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    cellClass: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100',
    textClass: 'text-red-700'
  },
  CHO_FILE: {
    label: 'Chờ file',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    cellClass: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100',
    textClass: 'text-amber-700'
  },
  NGUON_CO_FILE_CHUA_NAP: {
    label: 'Chưa nạp',
    badgeClass: 'bg-white text-amber-700 border border-dashed border-amber-400 font-bold',
    cellClass: 'bg-white text-amber-700 border-2 border-dashed border-amber-400 hover:bg-amber-50 font-bold',
    textClass: 'text-amber-700'
  },
  NGUON_CHUA_CO_FILE: {
    label: 'Không file',
    badgeClass: 'bg-gray-50 text-gray-400 border-gray-200',
    cellClass: 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100',
    textClass: 'text-gray-400'
  },
  CHUA_DEN_GIO: {
    label: '—',
    badgeClass: 'bg-transparent text-gray-400',
    cellClass: 'bg-transparent text-gray-400 border-transparent cursor-default',
    textClass: 'text-gray-400'
  },
  CHUA_BAT_DAU: {
    label: '',
    badgeClass: 'bg-transparent text-gray-300',
    cellClass: 'bg-transparent text-gray-300 border-transparent cursor-default',
    textClass: 'text-gray-300'
  },
  MA_KHONG_KHOP: {
    label: 'Mã BCVH không khớp',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    cellClass: 'bg-rose-50 text-rose-700 border-rose-300',
    textClass: 'text-rose-700'
  }
};

// Ánh xạ lý do sang câu tiếng Việt rõ ràng
export const REASON_MAP = {
  REJECTED: 'File bị từ chối khi nạp',
  CONFLICT: 'File trùng tên nhưng khác nội dung',
  EMPTY: 'File rỗng (chỉ có tiêu đề)',
  NHAP_TAY_CO_SAN: 'Đã có dữ liệu nhập tay; nguồn có file chưa nạp',
  CHUA_NAP: 'File có trên nguồn, chưa nạp',
  QUA_GIO_MONG_DOI: 'Quá giờ mong đợi mà chưa thấy file',
  KHONG_THAY_TREN_NGUON: 'Chưa thấy file trên nguồn: cần nơi xuất bổ sung',
  MA_LA: 'Mã trong tên file không khớp 6 BCVH (kiểm tra mã ở nơi xuất file)',
  NGHI_NGO_IT: 'Số dòng ít hơn nhiều so với mức thường',
  NGHI_NGO_NHIEU: 'Số dòng nhiều hơn nhiều so với mức thường'
};

// Ánh xạ mã lỗi trong lượt lấy
export const RUN_FILE_ERROR_MAP = {
  NGUON_KHONG_CO: 'Nguồn không có file của đợt này',
  KHONG_THE_LAY_LAI: 'Nguồn đã đổi nội dung so với bản đã nạp: dùng «Thay thế ngày»',
  KICH_THUOC_LECH: 'Kích thước tải về lệch, lấy lại sau',
  DA_TU_CHOI: 'File từng bị từ chối, không tải lại',
  VUOT_TOI_DA: 'Vượt số file tối đa mỗi lượt',
  REJECTED: 'File bị từ chối khi nạp',
  CONFLICT: 'Trùng tên nhưng khác nội dung'
};

// Dịch kết quả của file / lần thử (dùng chung cho khung chi tiết và danh sách file của lượt)
// Quy tắc: DA_NAP «Đã nạp»; DA_CO «Đã có, không nạp đè»; CHUA_ON_DINH «File chưa ổn định, thử lại sau»;
// EMPTY «File rỗng»; LOI «Lỗi»; BO_QUA «Bỏ qua»; mọi mã khác «Không rõ». KHÔNG BAO GIỜ mặc định «Lỗi».
export function translateFileResult(ketQua) {
  switch (ketQua) {
    case 'DA_NAP':
      return 'Đã nạp';
    case 'DA_CO':
      return 'Đã có, không nạp đè';
    case 'CHUA_ON_DINH':
      return 'File chưa ổn định, thử lại sau';
    case 'EMPTY':
      return 'File rỗng';
    case 'LOI':
      return 'Lỗi';
    case 'BO_QUA':
      return 'Bỏ qua';
    default:
      return 'Không rõ';
  }
}

// Kiểu hiển thị theo kết quả file: chỉ LOI màu đỏ, DA_CO và các mã trung tính màu xám/xanh nhạt
export function getFileResultStyle(ketQua) {
  switch (ketQua) {
    case 'LOI':
      return {
        badgeClass: 'bg-red-100 text-red-800',
        textClass: 'text-red-700 font-semibold'
      };
    case 'DA_NAP':
      return {
        badgeClass: 'bg-emerald-100 text-emerald-800',
        textClass: 'text-emerald-700 font-semibold'
      };
    case 'DA_CO':
      return {
        badgeClass: 'bg-gray-100 text-gray-700',
        textClass: 'text-gray-700 font-medium'
      };
    case 'CHUA_ON_DINH':
      return {
        badgeClass: 'bg-amber-100 text-amber-800',
        textClass: 'text-amber-800 font-medium'
      };
    case 'EMPTY':
      return {
        badgeClass: 'bg-purple-100 text-purple-800',
        textClass: 'text-purple-700 font-medium'
      };
    case 'BO_QUA':
      return {
        badgeClass: 'bg-gray-100 text-gray-500',
        textClass: 'text-gray-500 font-medium'
      };
    default:
      return {
        badgeClass: 'bg-gray-100 text-gray-600',
        textClass: 'text-gray-600 font-medium'
      };
  }
}

// Tra cứu mục đã xem xét: từ da_xem_xet[] dựng bảng khóa loai|bcvh|ngay|dot (với NGAY, dot là chuỗi rỗng)
export function buildReviewedLookup(daXemXetList) {
  const map = {};
  if (!Array.isArray(daXemXetList)) return map;
  for (const item of daXemXetList) {
    if (!item || typeof item !== 'object') continue;
    const dotKey = item.loai === 'DOT' ? (item.dot || '') : '';
    const key = `${item.loai}|${item.bcvh}|${item.ngay}|${dotKey}`;
    map[key] = item;
  }
  return map;
}

// Gọi API đánh dấu đã xem xét
export async function markReviewedApi({ loai, bcvh, ngay, dot, ghi_chu }) {
  const payload = {
    loai,
    bcvh,
    ngay
  };
  if (loai === 'DOT') {
    payload.dot = dot;
  }
  if (typeof ghi_chu === 'string') {
    const trimmed = ghi_chu.trim();
    if (trimmed) {
      payload.ghi_chu = trimmed.slice(0, 200);
    }
  }

  return await apiFetchJson('/api/nap-nguon/da-xem-xet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Gọi API bỏ đánh dấu đã xem xét (DELETE)
export async function unmarkReviewedApi(id) {
  return await apiFetchJson(`/api/nap-nguon/da-xem-xet/${id}`, {
    method: 'DELETE'
  });
}

// Trích xuất BCVH và ngày từ tên file HangDen_<bcvh>_<yyyymmdd>_<hhmmss>.csv
export function parseBcvhAndDateFromFilename(filename) {
  if (!filename) return null;
  const match = String(filename).match(/HangDen_(\d{6})_(\d{4})(\d{2})(\d{2})_\d{6}/i);
  if (match) {
    return {
      bcvh: match[1],
      ngay: `${match[2]}-${match[3]}-${match[4]}`
    };
  }
  return null;
}

// Đếm số file trong files[] có mã lỗi NGUON_KHONG_CO
export function countFilesNguonKhongCo(files) {
  if (!Array.isArray(files)) return 0;
  return files.filter((f) => f && f.ma_loi === 'NGUON_KHONG_CO').length;
}



