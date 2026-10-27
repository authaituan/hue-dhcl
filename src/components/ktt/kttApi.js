import { apiFetchJson, apiDownloadExcel } from '../../utils/api';

/**
 * Lấy siêu dữ liệu Hàng tại KTT: độ mới, lịch chuyến (14 dòng), hạn đến trước chuyến, giờ chốt ngày, ngưỡng...
 */
export async function fetchKttMeta() {
  return apiFetchJson('/api/ktt/meta');
}

/**
 * Lấy dữ liệu lưu thoát theo khoảng ngày
 * @param {Object} params { tu, den } YYYY-MM-DD
 */
export async function fetchKttLuuThoat({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/luu-thoat?${query}`);
}

/**
 * Tải file Excel Sheet 7 Hàng rớt lại / Lưu thoát
 * @param {Object} params { tu, den, trang_thai }
 */
export async function downloadKttLuuThoat({ tu, den, trang_thai }) {
  const params = { tu, den };
  if (trang_thai) params.trang_thai = trang_thai;
  const query = new URLSearchParams(params).toString();
  const url = `/api/ktt/xuat/luu-thoat?${query}`;
  const defaultFilename = `KTT_LuuThoat_${tu}_${den}.xlsx`;
  return apiDownloadExcel(url, defaultFilename);
}
