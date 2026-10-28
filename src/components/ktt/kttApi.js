import { apiFetchJson, apiDownloadExcel } from '../../utils/api';

/**
 * Lấy siêu dữ liệu Hàng tại KTT: độ mới, lịch chuyến (14 dòng), hạn đến trước chuyến, giờ chốt ngày, ngưỡng...
 */
export async function fetchKttMeta() {
  return apiFetchJson('/api/ktt/meta');
}

/**
 * Lấy dữ liệu lưu thoát theo khoảng ngày
 * @param {Object} params { tu, den, moc_chi_tieu } YYYY-MM-DD
 */
export async function fetchKttLuuThoat({ tu, den, moc_chi_tieu }) {
  const params = { tu, den };
  if (moc_chi_tieu) params.moc_chi_tieu = String(moc_chi_tieu);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/luu-thoat?${query}`);
}

/**
 * Lấy danh sách chi tiết bưu gửi (KTT-8, KTT-8c, KTT-9b)
 * @param {Object} params { tu, den, loai, ma_bcvh, nguon, page, page_size }
 */
export async function fetchKttChiTiet({ tu, den, loai, ma_bcvh, nguon, page = 1, page_size = 50 }) {
  const params = { tu, den, loai: String(loai || 'ro_lai') };
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (nguon) params.nguon = String(nguon);
  if (page) params.page = String(page);
  if (page_size) params.page_size = String(page_size);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/chi-tiet?${query}`);
}

/**
 * Tải file Excel Sheet 7 Hàng rớt lại / Lưu thoát (hỗ trợ lọc ma_bcvh, nguon)
 * @param {Object} params { tu, den, trang_thai, ma_bcvh, nguon }
 */
export async function downloadKttLuuThoat({ tu, den, trang_thai, ma_bcvh, nguon }) {
  const params = { tu, den };
  if (trang_thai) params.trang_thai = String(trang_thai);
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (nguon) params.nguon = String(nguon);
  const query = new URLSearchParams(params).toString();
  const url = `/api/ktt/xuat/luu-thoat?${query}`;
  const defaultFilename = `KTT_LuuThoat_${tu}_${den}.xlsx`;
  return apiDownloadExcel(url, defaultFilename);
}
