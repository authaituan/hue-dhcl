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
  if (hang_hoan !== undefined && hang_hoan !== null && hang_hoan !== '') {
    params.hang_hoan = (hang_hoan === 1 || hang_hoan === '1' || hang_hoan === true) ? '1' : '0';
  }
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (page) params.page = String(page);
  if (page_size) params.page_size = String(page_size);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/danh-sach?${query}`);
}

/**
 * Tải file Excel Sheet 8 Hôm sau - chưa đi trên 24 giờ (KTT-8d)
 * @param {Object} params { tu, den, loai, duong_thu, noi_gui, huong, hang_hoan, ma_bcvh }
 */
export async function downloadKttHomSauChuaDi({
  tu,
  den,
  loai,
  duong_thu,
  noi_gui,
  huong,
  hang_hoan,
  ma_bcvh,
}) {
  const params = { tu, den, loai: String(loai || 'hom-sau') };
  if (duong_thu) params.duong_thu = String(duong_thu);
  if (noi_gui) params.noi_gui = String(noi_gui);
  if (huong) params.huong = String(huong);
  if (hang_hoan !== undefined && hang_hoan !== null && hang_hoan !== '') {
    params.hang_hoan = (hang_hoan === 1 || hang_hoan === '1' || hang_hoan === true) ? '1' : '0';
  }
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  const query = new URLSearchParams(params).toString();
  const url = `/api/ktt/xuat/hom-sau-chua-di?${query}`;
  const defaultFilename = `KTT_HomSauChuaDi_${params.loai}_${tu}_${den}.xlsx`;
  return apiDownloadExcel(url, defaultFilename);
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

/**
 * KTT-16-2 / KTT-16-5 (3.1): Đối chiếu BCVH - Tổng hợp đối chiếu (hai thanh xếp chồng)
 * @param {Object} params { tu, den, ma_bcvh }
 */
export async function fetchKttDoiChieuTongHop({ tu, den, ma_bcvh }) {
  const params = { tu, den };
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/doi-chieu/tong-hop?${query}`);
}

/**
 * KTT-16-3 / KTT-16-5 (3.1): Đối chiếu BCVH - Thời gian BCVH nhận (p50/p90, % cùng ngày)
 * @param {Object} params { tu, den, ma_bcvh }
 */
export async function fetchKttDoiChieuThoiGianNhan({ tu, den, ma_bcvh }) {
  const params = { tu, den };
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/doi-chieu/thoi-gian-nhan?${query}`);
}

/**
 * KTT-16-3 / KTT-16-5 (3.1): Đối chiếu BCVH - Chuyến mất dấu & Nguồn chưa thấy
 * @param {Object} params { tu, den, ma_bcvh }
 */
export async function fetchKttDoiChieuChuaThay({ tu, den, ma_bcvh }) {
  const params = { tu, den };
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/doi-chieu/chua-thay?${query}`);
}

/**
 * KTT-16-4 / KTT-16-5 (3.1): Đối chiếu BCVH - Các mục Đánh giá (sinh từ backend)
 * @param {Object} params { tu, den, ma_bcvh }
 */
export async function fetchKttDoiChieuDanhGia({ tu, den, ma_bcvh }) {
  const params = { tu, den };
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/doi-chieu/danh-gia?${query}`);
}

/**
 * KTT-16-4 / KTT-16-5 (3.6): Tải file Excel đối chiếu BCVH (sheet 1 đến 6)
 * @param {string} route Tên route (chua-thay, chuyen-mat-dau, chuyen-tiep-chua-quet-di, thay-o-bcvh-khac, chuyen-cham, da-co-tai-dich)
 * @param {Object} params { tu, den, maBcvh, ma_bcvh }
 */
export async function taiExcelDoiChieu(route, { tu, den, maBcvh, ma_bcvh }) {
  const params = { tu, den };
  const bcvh = maBcvh || ma_bcvh;
  if (bcvh && bcvh !== 'all') params.ma_bcvh = String(bcvh);
  const query = new URLSearchParams(params).toString();
  const url = `/api/ktt/doi-chieu/xuat/${route}?${query}`;
  const defaultFilename = `KTT_DoiChieu_${route}_${tu}_${den}.xlsx`;
  const res = await apiDownloadExcel(url, defaultFilename);
  if (!res.ok) {
    throw new Error(res.error || 'Chưa tải được file. Thử lại sau ít phút.');
  }
  return res;
}

/**
 * KTT-KD-1 / KTT-KD-2: Lấy dữ liệu Bức tranh đường thư đến (cụm / chuyến thư đến)
 * @param {Object} params { tu, den, moc, loai_ngay, bcvh }
 */
export async function fetchKttBucTranhCum({ tu, den, moc = 'A', loai_ngay = 'tat_ca', bcvh }) {
  const params = { tu, den };
  if (moc) params.moc = String(moc);
  if (loai_ngay && loai_ngay !== 'tat_ca') params.loai_ngay = String(loai_ngay);
  if (bcvh && bcvh !== 'all') params.bcvh = String(bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu?${query}`);
}

/**
 * KTT-KD-1 / KTT-KD-2: Lấy dữ liệu chuyến xe cấp 2 và ô
 * @param {Object} params { tu, den, moc, loai_ngay, bcvh }
 */
export async function fetchKttBucTranhChuyenXe({ tu, den, moc = 'A', loai_ngay = 'tat_ca', bcvh }) {
  const params = { tu, den };
  if (moc) params.moc = String(moc);
  if (loai_ngay && loai_ngay !== 'tat_ca') params.loai_ngay = String(loai_ngay);
  if (bcvh && bcvh !== 'all') params.bcvh = String(bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu/chuyen-xe?${query}`);
}

/**
 * KTT-KD-1 / KTT-KD-2: Lấy dữ liệu thẻ đánh giá (Pareto) và mẫu ít
 * @param {Object} params { tu, den, moc, loai_ngay, bcvh }
 */
export async function fetchKttBucTranhDanhGia({ tu, den, moc = 'A', loai_ngay = 'tat_ca', bcvh }) {
  const params = { tu, den };
  if (moc) params.moc = String(moc);
  if (loai_ngay && loai_ngay !== 'tat_ca') params.loai_ngay = String(loai_ngay);
  if (bcvh && bcvh !== 'all') params.bcvh = String(bcvh);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu/danh-gia?${query}`);
}

/**
 * KTT-KD-1 / KTT-KD-2: Lấy dữ liệu khối «Vì sao không đạt 14 giờ»
 * @param {Object} params { tu, den, moc, ma_bcvh, nguon, thu, nguon_hang, bien_sat_gio_phut, top }
 */
export async function fetchKttKhongDat14h({
  tu,
  den,
  moc = 'A',
  ma_bcvh,
  nguon,
  thu,
  nguon_hang,
  bien_sat_gio_phut,
  top = 15,
}) {
  const params = { tu, den };
  if (moc) params.moc = String(moc);
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (nguon) params.nguon = String(nguon);
  if (thu) params.thu = String(thu);
  if (nguon_hang) params.nguon_hang = String(nguon_hang);
  if (bien_sat_gio_phut) params.bien_sat_gio_phut = String(bien_sat_gio_phut);
  if (top) params.top = String(top);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/luu-thoat/khong-dat-14h?${query}`);
}

/**
 * KTT-KD-1 / KTT-KD-2: Tải file Excel Sheet 10 Không đạt 14 giờ
 * @param {Object} params { tu, den, moc, nhom, ma_bcvh, nguon, gio_den, chuyen, thu, nguon_hang }
 */
export async function downloadKttKhongDat14h({
  tu,
  den,
  moc = 'A',
  nhom,
  ma_bcvh,
  nguon,
  gio_den,
  chuyen,
  thu,
  nguon_hang,
}) {
  const params = { tu, den };
  if (moc) params.moc_chi_tieu = moc === 'B' || moc === 'quet_tui_den' ? 'quet_tui_den' : 'xnd';
  if (nhom && nhom !== 'tat_ca') params.nhom_nguyen_nhan = String(nhom);
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (nguon) params.nguon = String(nguon);
  if (gio_den !== undefined && gio_den !== null && gio_den !== '') params.gio_den = String(gio_den);
  if (chuyen) params.chuyen = String(chuyen);
  if (thu) params.thu = String(thu);
  if (nguon_hang) params.nguon_hang = String(nguon_hang);
  const query = new URLSearchParams(params).toString();
  const url = `/api/ktt/xuat/khong-dat-14h?${query}`;
  const mocTen = moc === 'B' || moc === 'quet_tui_den' ? 'MocB' : 'MocA';
  const defaultFilename = `KTT_KhongDat14h_${mocTen}_${tu}_${den}.xlsx`;
  return apiDownloadExcel(url, defaultFilename);
}

/**
 * KTT-KD-1 / KTT-KD-2: Lấy chi tiết bưu gửi không đạt 14 giờ (phục vụ danh sách kiểm chứng)
 * @param {Object} params { tu, den, moc, nhom, ma_bcvh, nguon, gio_den, chuyen, thu, nguon_hang, page, page_size }
 */
export async function fetchKttChiTietKhongDat14h({
  tu,
  den,
  moc = 'A',
  nhom,
  ma_bcvh,
  nguon,
  gio_den,
  chuyen,
  thu,
  nguon_hang,
  page = 1,
  page_size = 50,
}) {
  const params = { tu, den, loai: 'khong_dat_14h' };
  if (moc) params.moc_chi_tieu = moc === 'B' || moc === 'quet_tui_den' ? 'quet_tui_den' : 'xnd';
  if (nhom && nhom !== 'tat_ca') params.nhom_nguyen_nhan = String(nhom);
  if (ma_bcvh && ma_bcvh !== 'all') params.ma_bcvh = String(ma_bcvh);
  if (nguon) params.nguon = String(nguon);
  if (gio_den !== undefined && gio_den !== null && gio_den !== '') params.gio_den = String(gio_den);
  if (chuyen) params.chuyen = String(chuyen);
  if (thu) params.thu = String(thu);
  if (nguon_hang) params.nguon_hang = String(nguon_hang);
  if (page) params.page = String(page);
  if (page_size) params.page_size = String(page_size);
  const query = new URLSearchParams(params).toString();
  return apiFetchJson(`/api/ktt/chi-tiet?${query}`);
}

/**
 * KTT-KD-3c: Lấy dữ liệu Giờ đến trong ngày (khung bảng đường thư × 0-23 giờ)
 * @param {Object} params { tu, den, moc, loai_ngay, bcvh, duong_thu }
 */
export async function fetchKttGioDen({ tu, den, moc, loai_ngay = 'tat_ca', bcvh, duong_thu = [] }) {
  const usp = new URLSearchParams();
  if (tu) usp.set('tu', String(tu));
  if (den) usp.set('den', String(den));
  if (moc) usp.set('moc', String(moc));
  if (loai_ngay && loai_ngay !== 'tat_ca') usp.set('loai_ngay', String(loai_ngay));
  if (bcvh && bcvh !== 'all') usp.set('bcvh', String(bcvh));
  if (Array.isArray(duong_thu)) {
    for (const dt of duong_thu) {
      if (dt) usp.append('duong_thu', String(dt));
    }
  } else if (duong_thu) {
    usp.append('duong_thu', String(duong_thu));
  }
  const query = usp.toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den${query ? `?${query}` : ''}`);
}

/**
 * KTT-KD-3c: Lấy chi tiết giờ đến từng ngày của một đường thư
 * @param {Object} params { tu, den, duong_thu, moc, loai_ngay, bcvh }
 */
export async function fetchKttGioDenTheoNgay({ tu, den, duong_thu, moc, loai_ngay = 'tat_ca', bcvh }) {
  const usp = new URLSearchParams();
  if (tu) usp.set('tu', String(tu));
  if (den) usp.set('den', String(den));
  if (duong_thu) usp.set('duong_thu', String(duong_thu));
  if (moc) usp.set('moc', String(moc));
  if (loai_ngay && loai_ngay !== 'tat_ca') usp.set('loai_ngay', String(loai_ngay));
  if (bcvh && bcvh !== 'all') usp.set('bcvh', String(bcvh));
  const query = usp.toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu/gio-den/theo-ngay${query ? `?${query}` : ''}`);
}

/**
 * KTT-KD-3d: Dải «còn so với chỉ tiêu» theo giờ đến (phút :30) × BCVH × loại ngày
 * @param {Object} params { loai_ngay, bcvh }
 */
export async function fetchKttConLaiTheoGio({ loai_ngay = 'tat_ca', bcvh } = {}) {
  const usp = new URLSearchParams();
  if (loai_ngay && loai_ngay !== 'tat_ca') usp.set('loai_ngay', String(loai_ngay));
  if (bcvh && bcvh !== 'all') usp.set('bcvh', String(bcvh));
  const query = usp.toString();
  return apiFetchJson(`/api/ktt/luu-thoat/buc-tranh-duong-thu/con-lai-theo-gio${query ? `?${query}` : ''}`);
}

