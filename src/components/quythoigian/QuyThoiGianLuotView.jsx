import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import {
  formatInt,
  formatDurationGiay,
  formatDateTime,
  formatDdMmYyyy,
  NHOM_BD10_LABELS,
  LY_DO_KHONG_DO_LABELS
} from './quyThoiGianFormatters';
import { fetchQuyThoiGianLuot } from './quyThoiGianApi';

const PAGE_SIZE = 50;

export default function QuyThoiGianLuotView({
  selectedDate,
  selectedBcvh,
  initialFilters = {},
  summaryData,
  onBackToOverview,
}) {
  // Bộ lọc Màn 2
  const [bcvh, setBcvh] = useState(selectedBcvh || 'all');
  const [statusChip, setStatusChip] = useState(initialFilters.statusChip || 'ALL');
  const [duongThu, setDuongThu] = useState(initialFilters.duong_thu || '');
  const [nhomBd10, setNhomBd10] = useState(initialFilters.nhom || '');
  const [chiNghiNgo, setChiNghiNgo] = useState(initialFilters.nghi_ngo === '1');
  const [specificLyDo, setSpecificLyDo] = useState(initialFilters.ly_do || '');

  // Dữ liệu danh sách & phân trang
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: PAGE_SIZE, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lấy tên BCVH từ mã
  const getBcvhShortName = (ma) => {
    const item = BCVH_LIST.find((b) => b.ma === ma);
    if (!item) return ma;
    return item.ten.replace('BCVH ', '');
  };

  // Tải danh sách lượt từ API
  const loadLuot = useCallback(async (pageToLoad = 1) => {
    setLoading(true);
    setError(null);

    const params = {
      from: selectedDate,
      to: selectedDate,
      page: pageToLoad,
      page_size: PAGE_SIZE,
    };

    if (bcvh && bcvh !== 'all') {
      params.receiver_code = bcvh;
    }
    if (duongThu) {
      params.duong_thu = duongThu;
    }
    if (nhomBd10) {
      params.nhom = nhomBd10;
    }
    if (chiNghiNgo) {
      params.nghi_ngo = '1';
    }

    // Ánh xạ chip tình trạng sang tham số API
    if (statusChip === 'QUA_HAN') {
      params.dai = 'QUA_HAN';
    } else if (statusChip === 'SAP_HET') {
      params.dai = 'SAP_HET';
    } else if (statusChip === 'CON_THOI_GIAN') {
      params.dai = 'CON_THOI_GIAN';
    } else if (statusChip === 'TRUC_TIEP') {
      params.nhom = 'NGOAI_53';
      params.trang_thai = 'DO_DUOC';
    } else if (statusChip === 'KHONG_DO') {
      params.trang_thai = 'KHONG_DO_DUOC';
      if (specificLyDo) {
        params.ly_do = specificLyDo;
      }
    }

    try {
      const res = await fetchQuyThoiGianLuot(params);
      if (res.ok) {
        setItems(res.data?.items || []);
        setPagination(res.data?.pagination || { total: 0, page: pageToLoad, page_size: PAGE_SIZE, total_pages: 1 });
      } else {
        setError(res.error || 'Có lỗi xảy ra khi tải danh sách bưu gửi.');
        setItems([]);
      }
    } catch (err) {
      setError(err?.message || 'Lỗi kết nối khi tải danh sách bưu gửi.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, bcvh, statusChip, duongThu, nhomBd10, chiNghiNgo, specificLyDo]);

  useEffect(() => {
    loadLuot(1);
  }, [loadLuot]);

  // Danh sách đường thư từ summaryData để đổ vào dropdown
  const routeOptions = (summaryData?.tong?.theo_duong_thu || []).map((r) => r.ten);

  // Đếm nhanh từ summaryData để hiển thị trên chip nếu đang xem toàn bộ
  const tongDai = summaryData?.tong?.dai || {};
  const countQuaHan = tongDai.QUA_HAN;
  const countSapHet = tongDai.SAP_HET;
  const countConLai = (tongDai.CON_2_6 || 0) + (tongDai.CON_TREN_6 || 0);
  const countTrucTiep = summaryData?.tong?.truc_tiep;
  const countKhongDo = summaryData?.tong?.khong_do_duoc;

  // Xác định dòng đầu và dòng cuối đang hiển thị
  const startRow = pagination.total > 0 ? (pagination.page - 1) * pagination.page_size + 1 : 0;
  const endRow = Math.min(pagination.page * pagination.page_size, pagination.total);

  return (
    <div className="p-6 space-y-5">
      {/* ── 1. ĐẦU TRANG & TIÊU ĐỀ ────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={onBackToOverview}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A1D6E] hover:underline mb-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Thời gian Khai thác-Vận chuyển</span>
        </button>

        <h1 className="hue-h1">
          Danh sách bưu gửi — thời gian còn lại để phát tại BCVH
        </h1>
        <p className="text-xs text-gray-600 mt-1">
          Hàng đến BCVH ngày {formatDdMmYyyy(selectedDate)} · {formatInt(pagination.total)} bưu gửi
        </p>
      </div>

      {/* ── 2. KHỐI BỘ LỌC ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-none space-y-4">
        {/* Hàng 1: Chip Tình trạng khi đến BCVH */}
        <div>
          <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2">
            Tình trạng khi đến BCVH
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Chip Tất cả */}
            <button
              type="button"
              onClick={() => { setStatusChip('ALL'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'ALL'
                  ? 'bg-[#E0A82E] text-gray-900 shadow-2xs'
                  : 'bg-white text-gray-700 border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Tất cả
            </button>

            {/* Chip Quá hạn */}
            <button
              type="button"
              onClick={() => { setStatusChip('QUA_HAN'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'QUA_HAN'
                  ? 'bg-[#B3202A] text-white shadow-2xs'
                  : 'bg-white text-[#B3202A] border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Quá hạn {countQuaHan !== undefined && `(${formatInt(countQuaHan)})`}
            </button>

            {/* Chip Sắp hết hạn */}
            <button
              type="button"
              onClick={() => { setStatusChip('SAP_HET'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'SAP_HET'
                  ? 'bg-[#E0A82E] text-gray-900 shadow-2xs'
                  : 'bg-white text-[#A87A12] border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Sắp hết hạn {countSapHet !== undefined && `(${formatInt(countSapHet)})`}
            </button>

            {/* Chip Còn thời gian */}
            <button
              type="button"
              onClick={() => { setStatusChip('CON_THOI_GIAN'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'CON_THOI_GIAN'
                  ? 'bg-[#1F7A5C] text-white shadow-2xs'
                  : 'bg-white text-[#1F7A5C] border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Còn thời gian {countConLai !== undefined && `(${formatInt(countConLai)})`}
            </button>

            {/* Chip Giao nhận trực tiếp */}
            <button
              type="button"
              onClick={() => { setStatusChip('TRUC_TIEP'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'TRUC_TIEP'
                  ? 'bg-[#1F7A5C] text-white shadow-2xs'
                  : 'bg-white text-[#1F7A5C] border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Giao nhận trực tiếp {countTrucTiep !== undefined && `(${formatInt(countTrucTiep)})`}
            </button>

            {/* Chip Không đo được */}
            <button
              type="button"
              onClick={() => { setStatusChip('KHONG_DO'); setSpecificLyDo(''); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusChip === 'KHONG_DO'
                  ? 'bg-gray-700 text-white shadow-2xs'
                  : 'bg-white text-gray-700 border border-[#D9CBA8] hover:bg-cream-light'
              }`}
            >
              Không đo được {countKhongDo !== undefined && `(${formatInt(countKhongDo)})`}
            </button>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc Dropdown (BCVH, Đường thư, Nguồn hàng) & Nút kiểm tra lại */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-cream-line">
          {/* Dropdown BCVH */}
          <div>
            <label htmlFor="luot-bcvh-select" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              BCVH
            </label>
            <select
              id="luot-bcvh-select"
              value={bcvh}
              onChange={(e) => setBcvh(e.target.value)}
              className="w-full text-xs font-medium text-gray-900 bg-white border border-[#D9CBA8] rounded-[8px] px-2.5 py-1.5 focus:outline-none focus:border-[#4A1D6E]"
            >
              <option value="all">Tất cả BCVH</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Đường thư */}
          <div>
            <label htmlFor="luot-duongthu-select" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Đường thư
            </label>
            <select
              id="luot-duongthu-select"
              value={duongThu}
              onChange={(e) => setDuongThu(e.target.value)}
              className="w-full text-xs font-medium text-gray-900 bg-white border border-[#D9CBA8] rounded-[8px] px-2.5 py-1.5 focus:outline-none focus:border-[#4A1D6E]"
            >
              <option value="">Tất cả đường thư</option>
              {routeOptions.map((ten) => (
                <option key={ten} value={ten}>
                  {ten}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Nguồn hàng (Nhóm BD10) */}
          <div>
            <label htmlFor="luot-nhom-select" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
              Nguồn hàng
            </label>
            <select
              id="luot-nhom-select"
              value={nhomBd10}
              onChange={(e) => setNhomBd10(e.target.value)}
              className="w-full text-xs font-medium text-gray-900 bg-white border border-[#D9CBA8] rounded-[8px] px-2.5 py-1.5 focus:outline-none focus:border-[#4A1D6E]"
            >
              <option value="">Tất cả nhóm BD10</option>
              <option value="KTT">Qua TTKT (530100)</option>
              <option value="NGOAI_53">Tỉnh khác, trực tiếp (ngoài 53)</option>
              <option value="LAP_DI_TAI_BCVH">Lập đi tại BCVH</option>
              <option value="NOI_TINH_KHAC">Giữa BCVH/BC (nội tỉnh khác)</option>
              <option value="RONG">Không có số BD10</option>
              <option value="KHONG_HOP_LE">Số BD10 không hợp lệ</option>
            </select>
          </div>

          {/* Nhóm lọc: Cần kiểm tra lại (hai mốc cách nhau > 7 ngày) */}
          <div className="lg:col-span-1">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1 whitespace-nowrap">
              Cần kiểm tra lại (hai mốc cách nhau &gt; 7 ngày)
            </div>
            <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-cream-light/40 text-xs">
              <button
                type="button"
                onClick={() => setChiNghiNgo(false)}
                className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  !chiNghiNgo
                    ? 'bg-[#4A1D6E] text-white font-bold'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Hiện tất cả
              </button>
              <button
                type="button"
                onClick={() => setChiNghiNgo(true)}
                className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  chiNghiNgo
                    ? 'bg-[#E0A82E] text-gray-900 font-bold'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Chỉ bưu gửi cần kiểm tra
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadLuot(pagination.page)}
            className="flex items-center gap-1 font-semibold underline hover:no-underline shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* ── 3. BẢNG DANH SÁCH BƯU GỬI ─────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-soft">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Số hiệu bưu gửi</th>
                <th className="whitespace-nowrap">BCVH</th>
                <th className="min-w-[120px] max-w-[180px]">Phường/xã nhận</th>
                <th className="min-w-[140px] max-w-[220px]">Đường thư</th>
                <th className="whitespace-nowrap">Nhóm BD10</th>
                <th className="whitespace-nowrap">Đến TT khai thác</th>
                <th className="whitespace-nowrap">BCVH nhận</th>
                <th className="whitespace-nowrap text-right">Đã qua</th>
                <th className="whitespace-nowrap text-right">Chỉ tiêu</th>
                <th className="whitespace-nowrap text-right">Còn lại</th>
                <th className="min-w-[180px]">Tình trạng / ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#4A1D6E]" />
                      <span>Đang tải danh sách bưu gửi...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-gray-500 italic">
                    Không tìm thấy bưu gửi nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const isAm = item.trangThai === 'AM';
                  const isNghiNgo = item.nghiNgo === true;
                  const isTrucTiep = item.nguon_moc_bat_dau === 'XND_BCVH';
                  const isKhongDo = item.trangThai === 'KHONG_DO_DUOC';

                  // Nền dòng: Lệch mốc (hồng nhạt), Cần kiểm tra lại (vàng nhạt), Giao nhận trực tiếp (xanh nhạt)
                  let rowBgClass = 'hover:bg-cream-light/40';
                  if (isAm) {
                    rowBgClass = 'bg-[#FDEEF0] hover:bg-[#FBE3E5]';
                  } else if (isNghiNgo) {
                    rowBgClass = 'bg-[#FFF8E6] hover:bg-[#FFF1CC]';
                  } else if (isTrucTiep) {
                    rowBgClass = 'bg-[#EAF6F1] hover:bg-[#DDF1E8]';
                  }

                  // Thời gian đã qua
                  let daQuaStr = '—';
                  if (isTrucTiep) {
                    daQuaStr = '0 g 00 p';
                  } else if (item.thoiGianThucGiay !== null && item.thoiGianThucGiay !== undefined) {
                    daQuaStr = formatDurationGiay(item.thoiGianThucGiay);
                  }

                  // Thời gian còn lại
                  const quyGiay = item.quyConLaiGiay?.F1_3;
                  let conLaiStr = '—';
                  let conLaiColorClass = 'text-gray-700';
                  if (quyGiay !== null && quyGiay !== undefined) {
                    conLaiStr = formatDurationGiay(quyGiay, { withSign: true });
                    conLaiColorClass = quyGiay < 0 ? 'text-[#B3202A] font-bold' : 'text-[#1F7A5C] font-bold';
                  }

                  // Tình trạng / Ghi chú
                  let tinhTrangBadge = null;
                  if (isAm) {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FBE3E5] text-[#B3202A] border border-[#F2B8BE]">
                        Lệch mốc: TTKT sau BCVH nhận
                      </span>
                    );
                  } else if (isNghiNgo) {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF1CC] text-[#A87A12] border border-[#F9E09C]">
                        Cần kiểm tra lại: hai mốc cách nhau &gt; 7 ngày
                      </span>
                    );
                  } else if (isTrucTiep) {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DDF1E8] text-[#1F7A5C] border border-[#B7E0CE]">
                        Giao nhận trực tiếp · tính từ lúc BCVH nhận
                      </span>
                    );
                  } else if (isKhongDo) {
                    const lyDoText = LY_DO_KHONG_DO_LABELS[item.lyDo] || item.lyDo || 'Không đủ điều kiện đo';
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F3EDE0] text-gray-700 border border-[#D9CBA8]">
                        {lyDoText}
                      </span>
                    );
                  } else if (item.dai === 'QUA_HAN') {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FBE3E5] text-[#B3202A] border border-[#F2B8BE]">
                        Quá hạn khi đến
                      </span>
                    );
                  } else if (item.dai === 'SAP_HET') {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF1CC] text-[#A87A12] border border-[#F9E09C]">
                        Sắp hết hạn: còn dưới 2 giờ
                      </span>
                    );
                  } else {
                    tinhTrangBadge = (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cream-light text-[#1F7A5C] border border-[#E4D5AE]">
                        Còn thời gian
                      </span>
                    );
                  }

                  // Phường/xã nhận (đọc khóa phuong_xa theo quyết định PO số 2)
                  const phuongXaText = item.phuong_xa || (item.phuong_trong ? 'Trống' : '—');

                  return (
                    <tr key={idx} className={`transition-colors ${rowBgClass}`}>
                      {/* Cột 1: Số hiệu bưu gửi (font-mono duy nhất) */}
                      <td className="font-mono font-bold text-gray-900 whitespace-nowrap">
                        {item.shbg}
                      </td>

                      {/* Cột 2: BCVH */}
                      <td className="font-medium text-gray-900 whitespace-nowrap">
                        {getBcvhShortName(item.receiver_code)}
                      </td>

                      {/* Cột 3: Phường/xã nhận */}
                      <td className="text-gray-700 min-w-[120px] max-w-[180px] break-words">
                        {phuongXaText}
                      </td>

                      {/* Cột 4: Đường thư */}
                      <td className="text-gray-700 min-w-[140px] max-w-[220px] break-words">
                        {item.duong_thu || '—'}
                      </td>

                      {/* Cột 5: Nhóm BD10 */}
                      <td className="text-gray-700 whitespace-nowrap">
                        {NHOM_BD10_LABELS[item.nhom] || item.nhom || '—'}
                      </td>

                      {/* Cột 6: Đến TTKT */}
                      <td className="text-gray-700 whitespace-nowrap">
                        {formatDateTime(item.ktt)}
                      </td>

                      {/* Cột 7: BCVH nhận */}
                      <td className="text-gray-700 whitespace-nowrap">
                        {formatDateTime(item.xnd)}
                      </td>

                      {/* Cột 8: Đã qua */}
                      <td className={`text-right font-medium whitespace-nowrap ${isAm ? 'text-[#B3202A] font-bold' : 'text-gray-900'}`}>
                        {daQuaStr}
                      </td>

                      {/* Cột 9: Chỉ tiêu */}
                      <td className="text-right font-medium text-gray-700 whitespace-nowrap">
                        {item.chi_tieu_gio ? `${item.chi_tieu_gio} giờ` : '—'}
                      </td>

                      {/* Cột 10: Còn lại */}
                      <td className={`text-right whitespace-nowrap ${conLaiColorClass}`}>
                        {conLaiStr}
                      </td>

                      {/* Cột 11: Tình trạng / Ghi chú */}
                      <td className="min-w-[180px]">
                        {tinhTrangBadge}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── 4. CHÂN BẢNG & PHÂN TRANG ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-cream-head border-t border-cream-line text-xs text-gray-700">
          <div>
            Hiển thị <strong>{startRow}–{endRow}</strong> / <strong>{formatInt(pagination.total)}</strong> bưu gửi · sắp theo thời gian còn lại tăng dần (quá hạn và sắp hết lên đầu)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadLuot(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#D9CBA8] rounded-[8px] font-semibold text-gray-900 hover:bg-cream-light disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Trước</span>
            </button>

            <span className="px-2 font-bold text-[#4A1D6E]">
              Trang {pagination.page} / {pagination.total_pages || 1}
            </span>

            <button
              type="button"
              onClick={() => loadLuot(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#D9CBA8] rounded-[8px] font-semibold text-gray-900 hover:bg-cream-light disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
            >
              <span>Sau</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. HỘP CÁCH ĐỌC CHÂN BẢNG ──────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-4 shadow-none text-xs leading-relaxed text-gray-700">
        <strong className="text-[#4A1D6E]">Cách đọc:</strong> «Còn lại» <span className="text-[#1F7A5C] font-bold">xanh</span> = còn thời gian; <span className="text-[#B3202A] font-bold">đỏ</span> = quá hạn (số âm: đã vượt chỉ tiêu bấy nhiêu). Dòng nền hồng nhạt = lệch mốc (Trung tâm khai thác xác nhận SAU khi BCVH nhận; vẫn hiển thị kèm lý do). Dòng nền vàng nhạt = cần kiểm tra lại (hai mốc cách nhau quá 7 ngày, có thể là hàng đến lại hoặc dữ liệu lệch; không tính vào tỉ lệ). Dòng «không đo được» để trống thời gian và ghi lý do ở cột cuối. Dòng «giao nhận trực tiếp»: đo từ lúc BCVH xác nhận BD10, đã qua 0, vẫn tính vào tỉ lệ.
      </div>
    </div>
  );
}
