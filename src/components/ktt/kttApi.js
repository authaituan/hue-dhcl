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

/**
 * KTT-12 / KTT-13b: B1 Thẻ tổng hợp đi cùng ngày (3 hướng + nội tỉnh có/không kể hàng hoàn)
 * @param {Object} params { tu, den }
 */
export async function fetchKttDiCungNgayTongHop({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/dicungngay/tong-hop?${query}`);
}

/**
 * KTT-12 / KTT-13b: B2 Tỷ lệ đi cùng ngày từng ngày (cờ Chủ nhật, cờ đã chốt, so sánh CN)
 * @param {Object} params { tu, den }
 */
export async function fetchKttDiCungNgayTheoNgay({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/dicungngay/theo-ngay?${query}`);
}

/**
 * KTT-12 / KTT-13b: B3 Tỷ lệ đi cùng ngày theo giờ quét túi đến (24 giờ, trước/từ 12h)
 * @param {Object} params { tu, den }
 */
export async function fetchKttDiCungNgayTheoGio({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/dicungngay/theo-gio?${query}`);
}

/**
 * KTT-12 / KTT-13b: Hàng rớt lại theo đường thư Cấp 1
 * @param {Object} params { tu, den, top }
 */
export async function fetchKttRotLaiTheoDuongThu({ tu, den, top = 8 }) {
  const params = { tu, den };
  if (top) params.top = String(top);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/rotlai/theo-duong-thu?${query}`);
}

/**
 * KTT-12 / KTT-13b: B4 Giờ lập BD10 đi từng BCVH và xe rời KTT theo lịch C2
 * @param {Object} params { tu, den, min_bd10 }
 */
export async function fetchKttLichXeGioLapBd10({ tu, den, min_bd10 = 5 }) {
  const params = { tu, den };
  if (min_bd10 !== undefined && min_bd10 !== null) params.min_bd10 = String(min_bd10);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/lich-xe/gio-lap-bd10?${query}`);
}

/**
 * KTT-12 / KTT-13b: B5 Theo từng đường thư đến (3 nhóm)
 * @param {Object} params { tu, den, top }
 */
export async function fetchKttLichXeTheoDuongThu({ tu, den, top = 8 }) {
  const params = { tu, den };
  if (top) params.top = String(top);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/lich-xe/theo-duong-thu?${query}`);
}

/**
 * KTT-12 / KTT-13b: B6 Lưới thẻ 6 BCVH (hàng đến theo giờ, vạch lịch C2, tam giác vàng giờ lập TB)
 * @param {Object} params { tu, den }
 */
export async function fetchKttLichXeTheoBcvh({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/lich-xe/theo-bcvh?${query}`);
}

/**
 * KTT-12 / KTT-13b: Danh sách bưu gửi khi bấm ô (hôm sau / chưa đi trên 24 giờ)
 * @param {Object} params { tu, den, loai, duong_thu, noi_gui, huong, hang_hoan, ma_bcvh, page, page_size }
 */
export async function fetchKttDanhSachDiNgay({
  tu,
  den,
  loai,
  duong_thu,
  noi_gui,
  huong,
  hang_hoan,
  ma_bcvh,
  page = 1,
  page_size = 50,
}) {
  const params = { tu, den, loai: String(loai || 'hom-sau') };
  if (duong_thu) params.duong_thu = String(duong_thu);
  if (noi_gui) params.noi_gui = String(noi_gui);
  if (huong) params.huong = String(huong);
  if (hang_hoan !== undefined && hang_hoan !== null) params.hang_hoan = hang_hoan ? '1' : '0';
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (page) params.page = String(page);
  if (page_size) params.page_size = String(page_size);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/danh-sach?${query}`);
}

/**
 * KTT-12 / KTT-13c: A Thẻ tổng hợp hàng đến từ xe Cấp 1 + A1 theo ngày
 * @param {Object} params { tu, den }
 */
export async function fetchKttHangDenTongHop({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/hang-den/tong-hop?${query}`);
}

/**
 * KTT-12 / KTT-13c: A3 Bưu gửi đến theo giờ xe đến, chia theo đường thư lớn nhất
 * @param {Object} params { tu, den }
 */
export async function fetchKttHangDenTheoGio({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/hang-den/theo-gio?${query}`);
}

/**
 * KTT-12 / KTT-13c: A4 Các đường thư đến + A5 Bản đồ nhiệt hướng hàng + đợt xe
 * @param {Object} params { tu, den, top }
 */
export async function fetchKttHangDenTheoDuongThu({ tu, den, top = 200 }) {
  const params = { tu, den };
  if (top) params.top = String(top);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/hang-den/theo-duong-thu?${query}`);
}

/**
 * KTT-12 / KTT-13c: A2 Mỗi xe Cấp 1 (BD10 đến) một dòng theo giờ xác nhận
 * @param {Object} params { tu, den }
 */
export async function fetchKttHangDenXe({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/hang-den/xe?${query}`);
}

/**
 * KTT-12 / KTT-13c: Trang Tổng quan (gom số từ cùng các hàm B và A, không tính lại riêng)
 * @param {Object} params { tu, den }
 */
export async function fetchKttTongQuan({ tu, den }) {
  const query = new URLSearchParams({ tu, den }).toString();
  return apiFetchJson(`/api/ktt/tong-quan?${query}`);
}


