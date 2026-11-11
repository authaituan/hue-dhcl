import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Clock,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  formatInt,
  formatPercent,
  formatDdMm,
} from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatDecimal, getQuickDateRange } from './kttFormatters';
import { fetchKttGioDen, fetchKttGioDenTheoNgay } from './kttApi';
import KttTooltip from './KttTooltip';

// Chuyển đổi chuỗi HH:MM thành số phút từ 00:00
function hhmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const parts = hhmm.split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Lấy thứ trong tuần viết gọn
function getThuGon(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return names[day];
}

// Tính màu nền ô 24 giờ theo tỷ trọng bưu gửi hoặc khối lượng của giờ so với cả ngày
function getHourCellStyle(val, total) {
  if (!val || val <= 0) {
    return 'bg-transparent text-gray-300 font-light';
  }
  const ratio = total > 0 ? val / total : 0;
  if (ratio < 0.05) return 'bg-[#F5EEFA] text-[#4A1D6E] font-normal';
  if (ratio < 0.12) return 'bg-[#EBDDF5] text-[#4A1D6E] font-medium';
  if (ratio < 0.25) return 'bg-[#D8BDEB] text-[#3B1450] font-semibold';
  if (ratio < 0.40) return 'bg-[#9F63C4] text-white font-bold';
  return 'bg-[#4A1D6E] text-white font-bold';
}

export default function KttGioDenTrongNgay({
  dateRange,
  selectedBcvh,
  authUser,
  onQuickRangeChange,
  meta,
  activeMoc: controlledMoc,
  onActiveMocChange,
  unit: controlledUnit,
  onUnitChange,
  loaiNgay: controlledLoaiNgay,
  onLoaiNgayChange,
  selectedDuongThu: controlledSelectedDuongThu,
  onSelectedDuongThuChange,
}) {
  // Mốc giờ đến: 'B' (Giờ quét túi đến - mặc định) hoặc 'A' (Giờ xác nhận BD10 đến)
  const [localActiveMoc, setLocalActiveMoc] = useState('B');
  // Đơn vị đo: 'shbg' (Bưu gửi) | 'kg' (Khối lượng (kg))
  const [localUnit, setLocalUnit] = useState('shbg');
  // Loại ngày: 'thuong' (Ngày thường) | 'chu_nhat' (Chủ nhật) | 'tat_ca'
  const [localLoaiNgay, setLocalLoaiNgay] = useState('thuong');
  // Lọc đường thư: mảng các khóa đường thư được chọn (tối đa 8)
  const [localSelectedDuongThu, setLocalSelectedDuongThu] = useState([]);

  const activeMoc = controlledMoc ?? localActiveMoc;
  const setActiveMoc = onActiveMocChange || setLocalActiveMoc;
  const unit = controlledUnit ?? localUnit;
  const setUnit = onUnitChange || setLocalUnit;
  const loaiNgay = controlledLoaiNgay ?? localLoaiNgay;
  const setLoaiNgay = onLoaiNgayChange || setLocalLoaiNgay;
  const selectedDuongThu = controlledSelectedDuongThu ?? localSelectedDuongThu;
  const setSelectedDuongThu = onSelectedDuongThuChange || setLocalSelectedDuongThu;
  // Dropdown chọn đường thư
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPopupOffset, setFilterPopupOffset] = useState(0);
  const filterDropdownRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterPopupRef = useRef(null);

  // Dữ liệu API chính
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusCode, setStatusCode] = useState(null);

  // Dòng chi tiết mở rộng từng ngày
  const [expandedKhoa, setExpandedKhoa] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState(null);

  // Mã định danh tuần tự và khóa yêu cầu để chống chạy đua (L1, L2)
  const mainRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const activeDetailKeyRef = useRef(null);

  // Đóng dropdown khi click ra ngoài hoặc bấm phím Esc (trả con trỏ về nút mở)
  useEffect(() => {
    function handleClickOutside(e) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setShowFilterDropdown(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowFilterDropdown(false);
        filterButtonRef.current?.focus();
      }
    }
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showFilterDropdown]);

  // Neo cửa sổ «Lọc đường thư» vào mép trái nút bấm và dịch vào trong nếu sát mép phải khung nhìn (3.12)
  useEffect(() => {
    if (!showFilterDropdown) {
      setFilterPopupOffset(0);
      return;
    }
    const updateOffset = () => {
      const wrapper = filterDropdownRef.current;
      const popup = filterPopupRef.current;
      if (!wrapper || !popup) return;
      const wrapRect = wrapper.getBoundingClientRect();
      const popupWidth = popup.offsetWidth || 320;
      const margin = 12;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      let offset = 0;
      if (wrapRect.left + popupWidth > vw - margin) {
        offset = vw - margin - popupWidth - wrapRect.left;
      }
      if (wrapRect.left + offset < margin) {
        offset = margin - wrapRect.left;
      }
      setFilterPopupOffset(offset);
    };
    updateOffset();
    window.addEventListener('resize', updateOffset);
    return () => window.removeEventListener('resize', updateOffset);
  }, [showFilterDropdown]);

  // M2 & L2: Khi đổi bộ lọc (khoảng ngày, loại ngày, BCVH, danh sách đường thư), đóng dòng mở rộng
  // và vô hiệu hóa mọi yêu cầu chi tiết đang bay
  useEffect(() => {
    detailRequestIdRef.current++;
    activeDetailKeyRef.current = null;
    setExpandedKhoa(null);
    setExpandedData(null);
  }, [dateRange?.from, dateRange?.to, loaiNgay, selectedBcvh, selectedDuongThu]);

  // Gọi API chính khi đổi bộ chọn (khoảng ngày, loại ngày, BCVH, danh sách đường thư đã chọn)
  // L1: Chống race condition: lưu mã yêu cầu tuần tự, bỏ qua kết quả/lỗi nếu yêu cầu không còn là mới nhất
  const loadMainData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const reqId = ++mainRequestIdRef.current;
    setLoading(true);
    setError(null);
    setStatusCode(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      loai_ngay: loaiNgay,
      bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
      duong_thu: selectedDuongThu.length > 0 ? selectedDuongThu : undefined,
    };

    try {
      const res = await fetchKttGioDen(params);
      // Chống race condition (L1): nếu đã có yêu cầu mới hơn thì bỏ qua hoàn toàn
      if (reqId !== mainRequestIdRef.current) return;
      if (!res.ok) {
        setStatusCode(res.status);
        if (res.status === 403) {
          setError('Tài khoản không có quyền xem');
        } else {
          setError(res.error || 'Lỗi tải dữ liệu giờ đến trong ngày');
        }
        setData(null);
      } else {
        setData(res.data);
      }
    } catch (err) {
      if (reqId !== mainRequestIdRef.current) return;
      setError('Lỗi kết nối khi tải dữ liệu giờ đến trong ngày');
      setData(null);
    } finally {
      if (reqId === mainRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange?.from, dateRange?.to, loaiNgay, selectedBcvh, selectedDuongThu]);

  useEffect(() => {
    loadMainData();
  }, [loadMainData]);

  // Tải chi tiết từng ngày của một đường thư khi mở dòng (không phụ thuộc activeMoc vì API trả cả 2 mốc)
  // L2: Khóa yêu cầu theo đường thư, bộ lọc hiện tại và mã yêu cầu tuần tự
  const loadTheoNgay = useCallback(async (khoa) => {
    if (!dateRange?.from || !dateRange?.to || !khoa) return;
    const reqId = ++detailRequestIdRef.current;
    const reqKey = `${khoa}|${loaiNgay}|${dateRange.from}|${dateRange.to}|${selectedBcvh}|${reqId}`;
    activeDetailKeyRef.current = reqKey;
    setExpandedLoading(true);
    setExpandedError(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      duong_thu: khoa,
      loai_ngay: loaiNgay,
      bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
    };

    try {
      const res = await fetchKttGioDenTheoNgay(params);
      // Chống race condition (L2): bỏ qua nếu người dùng đã đổi bộ lọc, chuyển dòng khác hoặc có yêu cầu mới hơn
      if (activeDetailKeyRef.current !== reqKey) return;
      if (!res.ok) {
        setExpandedError(res.error || 'Lỗi tải chi tiết từng ngày');
        setExpandedData(null);
      } else {
        setExpandedData(res.data);
      }
    } catch (err) {
      if (activeDetailKeyRef.current !== reqKey) return;
      setExpandedError('Lỗi kết nối khi tải chi tiết từng ngày');
      setExpandedData(null);
    } finally {
      if (activeDetailKeyRef.current === reqKey) {
        setExpandedLoading(false);
      }
    }
  }, [dateRange?.from, dateRange?.to, loaiNgay, selectedBcvh]);

  const handleToggleRow = (khoa) => {
    if (expandedKhoa === khoa) {
      detailRequestIdRef.current++;
      activeDetailKeyRef.current = null;
      setExpandedKhoa(null);
      setExpandedData(null);
    } else {
      setExpandedKhoa(khoa);
      setExpandedData(null);
      loadTheoNgay(khoa);
    }
  };

  // Trích xuất dữ liệu của mốc hiện tại
  const currentMocData = useMemo(() => {
    if (!data?.theo_moc) return null;
    return data.theo_moc[activeMoc] || null;
  }, [data, activeMoc]);

  const allDanhSach = useMemo(() => {
    return currentMocData?.danh_sach || [];
  }, [currentMocData]);

  const filteredDanhSach = useMemo(() => {
    if (!filterSearch.trim()) return allDanhSach;
    const q = filterSearch.trim().toLowerCase();
    return allDanhSach.filter((dt) => {
      const ten = (dt.ten || '').toLowerCase();
      const ma = (dt.ma || '').toLowerCase();
      return ten.includes(q) || ma.includes(q);
    });
  }, [allDanhSach, filterSearch]);

  // Xử lý chọn 5 đường thư lớn nhất
  const handleSelectTop5 = () => {
    const top5 = allDanhSach.slice(0, 5).map((x) => x.khoa);
    setSelectedDuongThu(top5);
  };

  // Bỏ chọn tất cả
  const handleClearSelection = () => {
    setSelectedDuongThu([]);
  };

  // Chọn / bỏ chọn 1 đường thư (tối đa 8)
  const handleToggleDuongThu = (khoa) => {
    if (selectedDuongThu.includes(khoa)) {
      setSelectedDuongThu(selectedDuongThu.filter((k) => k !== khoa));
    } else {
      if (selectedDuongThu.length >= 8) return;
      setSelectedDuongThu([...selectedDuongThu, khoa]);
    }
  };

  // Xác định giờ cao điểm nhất trong 24 giờ
  const maxHour = useMemo(() => {
    if (!currentMocData?.tong?.theo_gio) return null;
    const hours = currentMocData.tong.theo_gio;
    let max = hours[0];
    for (let i = 1; i < hours.length; i++) {
      const val = unit === 'kg' ? (hours[i].kg || 0) : (hours[i].shbg || 0);
      const curMax = unit === 'kg' ? (max.kg || 0) : (max.shbg || 0);
      if (val > curMax) {
        max = hours[i];
      }
    }
    return max;
  }, [currentMocData, unit]);

  // Kiểm tra cảnh báo bị dồn ở mốc xác nhận BD10 đến trên toàn bộ danh sách đường thư (R8, R-c)
  const hasMeoTheoLo = useMemo(() => {
    if (!currentMocData) return false;
    const coTrongDuongThu = currentMocData.duong_thu?.some((d) => d.meo_theo_lo === true);
    const coTrongDanhSach = currentMocData.danh_sach?.some((d) => d.meo_theo_lo === true);
    return Boolean(coTrongDuongThu || coTrongDanhSach);
  }, [currentMocData]);

  // M1: server luôn trả MOC_A_CO_THE_MEO ở mọi phản hồi, nên giao diện CHỈ in câu này khi
  // đang xem «Giờ xác nhận BD10 đến (chính thức)» HOẶC khi có ít nhất một dòng meo_theo_lo = true ở mốc đang xem
  const shouldShowCanhBaoMocA = useMemo(() => {
    if (!data?.canh_bao_ma?.includes('MOC_A_CO_THE_MEO')) return false;
    return activeMoc === 'A' || hasMeoTheoLo;
  }, [data, activeMoc, hasMeoTheoLo]);

  // Nhãn và trạng thái sáng cho 2 nút chọn nhanh (dùng MỘT hàm getQuickDateRange) (3.7)
  const quickRange7 = useMemo(() => getQuickDateRange(7, meta), [meta]);
  const quickRange30 = useMemo(() => getQuickDateRange(30, meta), [meta]);
  const isQuick7Active = Boolean(
    dateRange?.from && dateRange?.to &&
    dateRange.from === quickRange7.from && dateRange.to === quickRange7.to
  );
  const isQuick30Active = Boolean(
    dateRange?.from && dateRange?.to &&
    dateRange.from === quickRange30.from && dateRange.to === quickRange30.to
  );

  return (
    <div className="space-y-4">
      {/* ── THANH BỘ CHỌN CHUNG Ở ĐẦU TRANG ───────────────────────────────── */}
      <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none flex flex-wrap items-center justify-between gap-3">
        {/* Nhóm 1: Khoảng ngày nhanh («7 ngày» / «30 ngày» kèm ngày thật) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Khoảng ngày:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => onQuickRangeChange && onQuickRangeChange(7)}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                isQuick7Active
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              7 ngày ({formatDdMm(quickRange7.from)} – {formatDdMm(quickRange7.to)})
            </button>
            <button
              type="button"
              onClick={() => onQuickRangeChange && onQuickRangeChange(30)}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                isQuick30Active
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              30 ngày ({formatDdMm(quickRange30.from)} – {formatDdMm(quickRange30.to)})
            </button>
          </div>
        </div>

        {/* Nhóm 2: Lấy giờ đến theo */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Lấy giờ đến theo:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              id="ktt-moc-b-btn"
              onClick={() => setActiveMoc('B')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                activeMoc === 'B'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="Mặc định: Giờ quét túi đến KTT"
            >
              Giờ quét túi đến
            </button>
            <button
              type="button"
              id="ktt-moc-a-btn"
              onClick={() => setActiveMoc('A')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                activeMoc === 'A'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="Giờ xác nhận BD10 đến (giờ chính thức)"
            >
              Giờ xác nhận BD10 đến (chính thức)
            </button>
          </div>
        </div>

        {/* Nhóm 3: Đo bằng */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Đo bằng:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => setUnit('shbg')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                unit === 'shbg'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Bưu gửi
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                unit === 'kg'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Khối lượng (kg)
            </button>
          </div>
        </div>

        {/* Nhóm 4: Loại ngày */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Loại ngày:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => setLoaiNgay('thuong')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                loaiNgay === 'thuong'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Ngày thường
            </button>
            <button
              type="button"
              onClick={() => setLoaiNgay('chu_nhat')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                loaiNgay === 'chu_nhat'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Chủ nhật
            </button>
          </div>
        </div>

        {/* Nhóm 5: Bộ lọc đường thư */}
        <div className="relative" ref={filterDropdownRef}>
          <button
            type="button"
            ref={filterButtonRef}
            id="ktt-loc-duong-thu-btn"
            aria-expanded={showFilterDropdown}
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] border text-xs font-bold cursor-pointer transition-colors ${
              selectedDuongThu.length > 0
                ? 'border-[#4A1D6E] bg-[#F5EEFA] text-[#4A1D6E]'
                : 'border-[#D9CBA8] bg-white text-gray-700 hover:bg-[#FAF6EC]'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-[#4A1D6E]" />
            <span>Lọc đường thư</span>
            {selectedDuongThu.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#4A1D6E] text-white text-[10px]">
                {selectedDuongThu.length}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {/* Dropdown popup */}
          {showFilterDropdown && (
            <div
              ref={filterPopupRef}
              style={filterPopupOffset ? { transform: `translateX(${filterPopupOffset}px)` } : undefined}
              className="absolute left-0 mt-1 w-80 max-w-[calc(100vw-24px)] bg-white border border-[#D9CBA8] rounded-[12px] shadow-lg z-30 p-3 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-800">
                  Lọc đường thư (tối đa 8)
                </span>
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(false)}
                  className="text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Ô tìm kiếm */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc mã đường thư..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-[6px] focus:outline-none focus:border-[#4A1D6E]"
                />
              </div>

              {/* Nút thao tác nhanh */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSelectTop5}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#4A1D6E] bg-[#F5EEFA] hover:bg-[#EBDDF5] rounded-[6px] cursor-pointer"
                >
                  5 đường lớn nhất
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-[6px] cursor-pointer"
                >
                  Bỏ chọn (xem tất cả)
                </button>
              </div>

              {/* Danh sách đường thư cuộn */}
              <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-gray-50">
                {filteredDanhSach.length === 0 ? (
                  <p className="text-xs text-gray-500 py-3 text-center">Không tìm thấy đường thư nào</p>
                ) : (
                  filteredDanhSach.map((item) => {
                    const isSelected = selectedDuongThu.includes(item.khoa);
                    const isLimitReached = selectedDuongThu.length >= 8 && !isSelected;
                    return (
                      <label
                        key={item.khoa}
                        className={`flex items-start gap-2.5 py-1.5 px-2 rounded-[6px] text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#F5EEFA]'
                            : isLimitReached
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isLimitReached}
                          onChange={() => handleToggleDuongThu(item.khoa)}
                          className="mt-0.5 rounded border-gray-300 text-[#4A1D6E] focus:ring-[#4A1D6E]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 truncate">
                            {item.ten || 'Chưa có tên đường thư'}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500">
                            <span>{item.ma || (item.khoa === '__RONG__' ? 'Chưa có mã' : item.khoa)}</span>
                            <span>·</span>
                            <span>{formatInt(item.shbg)} bưu gửi</span>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TRẠNG THÁI TẢI / LỖI / 403 / RỖNG ──────────────────────────────── */}
      {loading && (
        <div className="bg-white rounded-[14px] p-8 border border-[#E4D5AE] text-center space-y-2">
          <div className="inline-block w-6 h-6 border-2 border-[#4A1D6E] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-gray-800">
            Đang tải, lần đầu có thể mất vài chục giây
          </p>
          <p className="text-xs text-gray-500">
            Hệ thống đang nạp và xử lý bảng giờ đến chi tiết...
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={loadMainData}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-[6px] font-bold text-xs cursor-pointer"
          >
            Tải lại
          </button>
        </div>
      )}

      {!loading && !error && data && !data.co_du_lieu && (
        <div className="bg-white rounded-[14px] p-8 border border-[#E4D5AE] text-center space-y-2">
          <p className="text-sm font-semibold text-gray-700">
            {data.canh_bao_ma?.includes('CHUA_CO_DU_LIEU') || data.ly_do === 'CHUA_CO_DU_LIEU'
              ? 'Chưa có số liệu trong khoảng này'
              : 'Không có hàng trong khoảng này'}
          </p>
          <p className="text-xs text-gray-500">
            {data.canh_bao_ma?.includes('CANH_BAO_HE_THONG')
              ? 'Hệ thống có cảnh báo về số liệu; liên hệ quản trị'
              : 'Vui lòng điều chỉnh khoảng ngày hoặc bộ lọc BCVH.'}
          </p>
        </div>
      )}

      {/* ── NỘI DUNG CHÍNH (KHI CÓ DỮ LIỆU) ─────────────────────────────────── */}
      {!loading && !error && data?.co_du_lieu !== false && currentMocData && (
        <>
          {/* ── KHUNG «ĐỘ TIN CẬY SỐ LIỆU» & PHẠM VI ──────────────────────── */}
          <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[12px] p-3.5 space-y-1 text-xs">
            <div className="flex items-start gap-2">
              <span className="font-bold text-[#4A1D6E] shrink-0 uppercase tracking-wide">
                ĐỘ TIN CẬY SỐ LIỆU:
              </span>
              <span className="text-[#5A4A62]">
                {activeMoc === 'B' ? (
                  <>Đang xem giờ quét túi đến.</>
                ) : (
                  <>Đang xem giờ xác nhận BD10 đến (giờ chính thức).</>
                )}{' '}
                Đo được <strong className="font-bold tabular-nums text-gray-900">{currentMocData.do_duoc != null ? formatInt(currentMocData.do_duoc) : '—'}</strong> / <span className="tabular-nums">{currentMocData.mau_so != null ? formatInt(currentMocData.mau_so) : '—'}</span> bưu gửi.
                {shouldShowCanhBaoMocA && (
                  <span className="text-amber-800 ml-1 font-medium">
                    · Giờ xác nhận BD10 bị dồn (nhiều túi được xác nhận cùng một lúc), nên xem giờ quét túi đến để sát giờ xe thật
                  </span>
                )}
                {data?.canh_bao_ma?.includes('CANH_BAO_HE_THONG') && (
                  <span className="text-red-700 ml-1 font-medium">
                    · Hệ thống có cảnh báo về số liệu; liên hệ quản trị
                  </span>
                )}
              </span>
            </div>
            <div className="text-[11px] text-gray-600 pl-0 sm:pl-0.5">
              Phạm vi: Chỉ gồm hàng đến 6 BCVH Huế; chưa gồm{' '}
              <strong className="font-semibold text-gray-800 tabular-nums">
                {data?.ngoai_pham_vi?.di_ngoai_6_bcvh != null ? formatInt(data.ngoai_pham_vi.di_ngoai_6_bcvh) : '—'}
              </strong>{' '}
              bưu gửi đi ngoài 6 BCVH.
            </div>
          </div>

          {/* ── 5 THẺ TÓM TẮT ĐẦU TRANG ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Thẻ 1: Tổng bưu gửi / kg */}
            <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none space-y-1">
              <div className="text-xs text-gray-600 font-medium">
                {unit === 'kg' ? 'Tổng khối lượng' : 'Tổng bưu gửi đến KTT'}
              </div>
              <div className="text-xl font-bold text-[#4A1D6E] tabular-nums font-serif">
                {unit === 'kg'
                  ? formatKg(currentMocData.tong?.san_luong_loc?.kg ?? currentMocData.tong?.kg, { withUnit: true })
                  : (() => {
                      const shbgVal = currentMocData.tong?.san_luong_loc?.shbg ?? currentMocData.tong?.shbg;
                      return shbgVal != null ? `${formatInt(shbgVal)} bưu gửi` : '—';
                    })()}
              </div>
              <div className="text-[11px] text-gray-500">
                Trung bình{' '}
                <strong className="text-gray-700 font-semibold tabular-nums">
                  {(() => {
                    const locTong = currentMocData.tong?.san_luong_loc;
                    if (unit === 'kg') {
                      const tbKg = locTong?.kg_tb_moi_ngay_cua_so;
                      return tbKg != null ? formatKg(tbKg, { withUnit: true }) : '—';
                    }
                    const tbShbg = locTong?.shbg_tb_moi_ngay_cua_so;
                    return tbShbg != null ? `${formatInt(Math.round(tbShbg))} bưu gửi` : '—';
                  })()}
                </strong>
                /ngày
              </div>
              {unit === 'kg' && currentMocData.tong?.san_luong_loc?.shbg_thieu_kg > 0 && (
                <div className="text-[10px] text-amber-700">
                  {formatInt(currentMocData.tong.san_luong_loc.shbg_thieu_kg)} bưu gửi chưa có số kg
                </div>
              )}
            </div>

            {/* Thẻ 2: Số đường thư */}
            <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none space-y-1">
              <div className="text-xs text-gray-600 font-medium">Đường thư ghi nhận</div>
              <div className="text-xl font-bold text-[#4A1D6E] tabular-nums font-serif">
                {currentMocData.tong?.so_duong_thu ?? '—'} đường thư
              </div>
              <div className="text-[11px] text-gray-500">
                <span className="text-amber-700 font-medium">
                  {currentMocData.thong_ke_co?.mau_it?.so_bi_gan_co ?? '—'} đường thư ít số liệu
                </span>
              </div>
            </div>

            {/* Thẻ 3: Kiện đi ngoài (3.4 & R1: tính % theo số kg thật khi unit === 'kg') */}
            <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none space-y-1">
              <div className="text-xs text-gray-600 font-medium">Kiện đi ngoài</div>
              <div className="text-xl font-bold text-[#4A1D6E] tabular-nums font-serif">
                {(() => {
                  if (unit === 'kg') {
                    const kienKg = currentMocData.tong?.kien_di_ngoai?.kg;
                    if (kienKg == null) return '—';
                    const tongKg = currentMocData.tong?.san_luong_loc?.kg ?? currentMocData.tong?.kg;
                    const tyLeKg = (tongKg != null && tongKg > 0) ? (kienKg / tongKg) : null;
                    return (
                      <>
                        {formatKg(kienKg, { withUnit: true })}
                        {tyLeKg != null && (
                          <span className="text-xs font-normal text-gray-600">
                            {' '}({formatPercent(tyLeKg)})
                          </span>
                        )}
                      </>
                    );
                  }
                  const kienShbg = currentMocData.tong?.kien_di_ngoai?.shbg;
                  if (kienShbg == null) return '—';
                  const tyLeShbg = currentMocData.tong?.kien_di_ngoai?.ty_le;
                  return (
                    <>
                      {formatInt(kienShbg)}
                      {tyLeShbg != null && (
                        <span className="text-xs font-normal text-gray-600">
                          {' '}({formatPercent(tyLeShbg)})
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="text-[11px] text-gray-500">
                {currentMocData.thong_ke_co?.nhieu_kien_di_ngoai?.so_bi_gan_co ?? '—'} đường thư nhiều kiện đi ngoài
              </div>
              {unit === 'kg' && (
                currentMocData.tong?.kien_di_ngoai?.kg == null ? (
                  <div className="text-[10px] text-amber-700">chưa có số kg</div>
                ) : currentMocData.tong?.kien_di_ngoai?.shbg_thieu_kg > 0 ? (
                  <div className="text-[10px] text-amber-700">
                    {formatInt(currentMocData.tong.kien_di_ngoai.shbg_thieu_kg)} bưu gửi chưa có số kg
                  </div>
                ) : null
              )}
            </div>

            {/* Thẻ 4: Trong túi */}
            <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none space-y-1">
              <div className="text-xs text-gray-600 font-medium">Trong túi</div>
              <div className="text-xl font-bold text-[#4A1D6E] tabular-nums font-serif">
                {(() => {
                  const trongTuiShbg = currentMocData.tong?.trong_tui?.shbg;
                  const trongTuiTyLe = currentMocData.tong?.trong_tui?.ty_le;
                  if (trongTuiShbg == null) return '—';
                  return (
                    <>
                      {formatInt(trongTuiShbg)}
                      {trongTuiTyLe != null && (
                        <span className="text-xs font-normal text-gray-600">
                          {' '}({formatPercent(trongTuiTyLe)})
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="text-[11px] text-gray-500">
                Bưu gửi trong túi (không đi ngoài)
              </div>
            </div>

            {/* Thẻ 5: Khung giờ nhiều hàng nhất */}
            <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none space-y-1">
              <div className="text-xs text-gray-600 font-medium">Khung giờ nhiều hàng nhất</div>
              <div className="text-xl font-bold text-[#4A1D6E] tabular-nums font-serif">
                {maxHour ? `${String(maxHour.gio).padStart(2, '0')}:00 – ${String(maxHour.gio).padStart(2, '0')}:59` : '—'}
              </div>
              <div className="text-[11px] text-gray-500">
                {(() => {
                  if (!maxHour) return '—';
                  const maxVal = unit === 'kg' ? maxHour.kg : maxHour.shbg;
                  if (maxVal == null) return '—';
                  const tongVal = unit === 'kg'
                    ? (currentMocData.tong?.san_luong_loc?.kg ?? currentMocData.tong?.kg)
                    : (currentMocData.tong?.san_luong_loc?.shbg ?? currentMocData.tong?.shbg);
                  const tyLe = (tongVal != null && tongVal > 0) ? (maxVal / tongVal) : null;
                  return (
                    <>
                      <span className="text-gray-800 font-semibold tabular-nums">
                        {unit === 'kg' ? formatKg(maxVal, { withUnit: true }) : `${formatInt(maxVal)} bưu gửi`}
                      </span>
                      {tyLe != null && (
                        <> ({formatPercent(tyLe)})</>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── 3 Ô NHẬN XÉT (L3: không ép 0 khi ngưỡng null; 3.6: bỏ cụm ngoặc khi ngưỡng null) ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Nhận xét 1: Giờ xe đến */}
            <div className="bg-[#FAF6EC] rounded-[12px] p-3.5 border border-[#E4D5AE] space-y-1">
              <div className="text-xs font-bold text-[#4A1D6E] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#4A1D6E]" />
                <span>Giờ đến các ngày</span>
              </div>
              <p className="text-xs text-[#5A4A62] leading-relaxed">
                Giờ đến không cố định: có{' '}
                <strong className="font-bold text-gray-900 tabular-nums">
                  {currentMocData.thong_ke_co?.gio_den_khong_co_dinh?.so_bi_gan_co ?? '—'}
                </strong>
                /
                <span className="tabular-nums">
                  {currentMocData.thong_ke_co?.gio_den_khong_co_dinh?.so_duong_thu_du_mau ?? '—'}
                </span>{' '}
                đường thư có giờ xe đến lệch nhau nhiều giữa các ngày
                {currentMocData.nguong_ap_dung?.muc_gio_den_khong_co_dinh_phut != null ? (
                  <>
                    {' '}(chênh lệch từ{' '}
                    <span className="font-semibold tabular-nums">
                      {currentMocData.nguong_ap_dung.muc_gio_den_khong_co_dinh_phut}
                    </span>{' '}
                    phút trở lên)
                  </>
                ) : null}
                .
              </p>
            </div>

            {/* Nhận xét 2: Sản lượng */}
            <div className="bg-[#FAF6EC] rounded-[12px] p-3.5 border border-[#E4D5AE] space-y-1">
              <div className="text-xs font-bold text-[#4A1D6E] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#4A1D6E]" />
                <span>Sản lượng đường thư</span>
              </div>
              <p className="text-xs text-[#5A4A62] leading-relaxed">
                Sản lượng: có{' '}
                <strong className="font-bold text-gray-900 tabular-nums">
                  {currentMocData.thong_ke_co?.san_luong_lon?.so_bi_gan_co ?? '—'}
                </strong>{' '}
                đường thư có sản lượng lớn
                {currentMocData.nguong_ap_dung?.muc_san_luong_lon_shbg != null ? (
                  <>
                    {' '}(từ{' '}
                    <span className="font-semibold tabular-nums">
                      {formatInt(currentMocData.nguong_ap_dung.muc_san_luong_lon_shbg)}
                    </span>{' '}
                    bưu gửi trở lên)
                  </>
                ) : null}
                ;{' '}
                <strong className="font-bold text-gray-900 tabular-nums">
                  {currentMocData.thong_ke_co?.san_luong_khong_deu?.so_bi_gan_co ?? '—'}
                </strong>
                /
                <span className="tabular-nums">
                  {currentMocData.thong_ke_co?.san_luong_khong_deu?.so_duong_thu_du_mau ?? '—'}
                </span>{' '}
                đường thư có sản lượng không đều giữa các ngày.
              </p>
            </div>

            {/* Nhận xét 3: Kiện đi ngoài */}
            <div className="bg-[#FAF6EC] rounded-[12px] p-3.5 border border-[#E4D5AE] space-y-1">
              <div className="text-xs font-bold text-[#4A1D6E] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#E0A82E]" />
                <span>Kiện đi ngoài</span>
              </div>
              <p className="text-xs text-[#5A4A62] leading-relaxed">
                Kiện đi ngoài: có{' '}
                <strong className="font-bold text-gray-900 tabular-nums">
                  {currentMocData.thong_ke_co?.nhieu_kien_di_ngoai?.so_bi_gan_co ?? '—'}
                </strong>
                /
                <span className="tabular-nums">
                  {currentMocData.thong_ke_co?.nhieu_kien_di_ngoai?.so_duong_thu_du_mau ?? '—'}
                </span>{' '}
                đường thư có nhiều kiện đi ngoài
                {currentMocData.nguong_ap_dung?.muc_nhieu_kien_di_ngoai != null ? (
                  <>
                    {' '}(từ{' '}
                    {currentMocData.nguong_ap_dung?.kien_di_ngoai_pct != null
                      ? `${currentMocData.nguong_ap_dung.kien_di_ngoai_pct}%`
                      : '30%'}{' '}
                    và từ{' '}
                    <span className="font-semibold tabular-nums">
                      {Math.round(currentMocData.nguong_ap_dung.muc_nhieu_kien_di_ngoai * 100)}%
                    </span>{' '}
                    trở lên)
                  </>
                ) : null}
                .
              </p>
            </div>
          </div>

          {/* ── BẢNG MÀU ĐƯỜNG THƯ × 0–23 GIỜ ───────────────────────────────── */}
          <div className="bg-white rounded-[14px] border border-[#E4D5AE] shadow-none overflow-hidden">
            <div className="overflow-x-auto min-w-full">
              <table className="w-full text-left border-collapse min-w-[1300px]">
                <thead>
                  <tr className="bg-[#FAF5E8] border-b border-[#E4D5AE] text-[11px] font-bold text-gray-700">
                    {/* Cột 1: Đường thư (sticky cố định) */}
                    <th className="sticky left-0 bg-[#FAF5E8] z-20 py-3 px-3 min-w-[220px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Đường thư
                    </th>
                    {/* 24 Cột giờ: 0h .. 23h */}
                    {Array.from({ length: 24 }, (_, h) => (
                      <th
                        key={h}
                        className="py-3 px-1 text-center w-8 min-w-[32px] font-semibold text-gray-600 text-[10px]"
                      >
                        {h}h
                      </th>
                    ))}
                    {/* Các cột tóm tắt bên phải (N2: thêm title giải thích mẫu số) */}
                    <th
                      className="py-3 px-2 text-right whitespace-nowrap min-w-[90px]"
                      title="Tính trung bình trên mọi ngày thuộc loại ngày đang lọc (kể cả ngày không phát sinh hàng)"
                    >
                      {unit === 'kg' ? 'kg/ngày' : 'Bưu gửi/ngày'}
                    </th>
                    <th className="py-3 px-2 text-center whitespace-nowrap min-w-[85px]">
                      Có hàng
                    </th>
                    <th className="py-3 px-2 text-center whitespace-nowrap min-w-[120px]">
                      Trong túi / kiện ngoài
                    </th>
                    <th className="py-3 px-2 text-center whitespace-nowrap min-w-[130px]">
                      Giờ đến thường gặp
                    </th>
                    <th className="py-3 px-2 text-center whitespace-nowrap min-w-[110px]">
                      Chênh giữa các ngày
                    </th>
                    <th className="py-3 px-3 text-left min-w-[150px]">
                      Lưu ý
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {/* Danh sách các đường thư */}
                  {currentMocData.duong_thu && currentMocData.duong_thu.map((item) => {
                    const isExpanded = expandedKhoa === item.khoa;
                    const locItem = item.san_luong_loc;
                    const soNgayCo = locItem?.so_ngay_co_hang;
                    const soNgayCua = locItem?.so_ngay_cua_so;

                    return (
                      <React.Fragment key={item.khoa}>
                        <tr
                          onClick={() => handleToggleRow(item.khoa)}
                          className={`hover:bg-[#FAF6EC] transition-colors cursor-pointer ${
                            isExpanded ? 'bg-[#F5EEFA]' : ''
                          }`}
                        >
                          {/* Cột 1: Đường thư (sticky) */}
                          <td className={`sticky left-0 z-10 py-2.5 px-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${
                            isExpanded ? 'bg-[#F5EEFA]' : 'bg-white'
                          }`}>
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-[#4A1D6E] shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-gray-900 truncate flex items-center gap-1.5">
                                  {item.thu_hang && item.thu_hang <= 5 && (
                                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#EBDDF5] text-[#4A1D6E]">
                                      #{item.thu_hang}
                                    </span>
                                  )}
                                  <span>{item.ten || 'Chưa có tên đường thư'}</span>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate">
                                  {item.ma || (item.khoa === '__RONG__' ? 'Chưa có mã' : item.khoa)}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 24 ô giờ: 0h .. 23h */}
                          {item.theo_gio && item.theo_gio.map((g) => {
                            const curVal = unit === 'kg' ? g.kg : g.shbg;
                            const totVal = unit === 'kg' ? item.kg : item.shbg;
                            const cellStyle = getHourCellStyle(curVal, totVal);
                            const hasVal = unit === 'kg' ? (g.kg != null && g.kg > 0) : (g.shbg != null && g.shbg > 0);
                            return (
                              <td
                                key={g.gio}
                                className={`p-0.5 text-center text-[10px] tabular-nums ${cellStyle}`}
                                title={`Giờ ${g.gio}:00–${g.gio}:59: ${formatInt(g.shbg)} bưu gửi, ${formatKg(g.kg, { withUnit: true })}, ${formatInt(g.kien_di_ngoai)} kiện đi ngoài`}
                              >
                                <div className="py-1 px-0.5 truncate">
                                  {hasVal ? (unit === 'kg' ? formatKg(curVal) : formatInt(curVal)) : '·'}
                                </div>
                              </td>
                            );
                          })}

                          {/* Bưu gửi/ngày hoặc kg/ngày */}
                          <td className="py-2.5 px-2 text-right font-medium tabular-nums text-gray-800">
                            {(() => {
                              if (unit === 'kg') {
                                const tbKg = locItem?.kg_tb_moi_ngay_cua_so;
                                return (
                                  <div>
                                    <div>{tbKg != null ? formatKg(tbKg) : '—'}</div>
                                    {locItem?.shbg_thieu_kg > 0 && (
                                      <div className="text-[9px] text-amber-700 font-normal truncate">
                                        {formatInt(locItem.shbg_thieu_kg)} bưu gửi chưa có số kg
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              const tbShbg = locItem?.shbg_tb_moi_ngay_cua_so;
                              return tbShbg != null ? `${formatInt(Math.round(tbShbg))}` : '—';
                            })()}
                          </td>

                          {/* Có hàng: n/N ngày */}
                          <td className="py-2.5 px-2 text-center text-[11px] tabular-nums text-gray-700 whitespace-nowrap">
                            {soNgayCo != null && soNgayCua != null ? `${soNgayCo}/${soNgayCua} ngày` : '—'}
                          </td>

                          {/* Trong túi / kiện ngoài */}
                          <td className="py-2.5 px-2 text-center text-[11px] tabular-nums text-gray-700 whitespace-nowrap">
                            <span className="font-semibold text-gray-800">
                              {item.trong_tui?.ty_le != null ? formatPercent(item.trong_tui.ty_le) : '—'}
                            </span>
                            {' / '}
                            <span className={item.co?.nhieu_kien_di_ngoai ? 'text-amber-800 font-bold' : 'text-gray-600'}>
                              {item.kien_di_ngoai?.ty_le != null ? formatPercent(item.kien_di_ngoai.ty_le) : '—'}
                            </span>
                          </td>

                          {/* Giờ đến thường gặp */}
                          <td className="py-2.5 px-2 text-center text-[11px] tabular-nums text-gray-800 whitespace-nowrap">
                            {item.co?.mau_it ? (
                              <span className="text-gray-400 italic">ít số liệu, chưa kết luận</span>
                            ) : item.gio_den_ngay?.p10 && item.gio_den_ngay?.p90 ? (
                              <span>
                                {item.gio_den_ngay.p10} – {item.gio_den_ngay.p90}
                                {item.gio_den_ngay.vat_nua_dem ? ' (qua nửa đêm)' : ''}
                                {item.gio_den_ngay.do_rong_phut != null ? ` · rộng ${item.gio_den_ngay.do_rong_phut} phút` : ''}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Chênh giữa các ngày */}
                          <td className="py-2.5 px-2 text-center text-[11px] tabular-nums text-gray-800 whitespace-nowrap">
                            {item.co?.mau_it ? (
                              <span className="text-gray-400 italic">chưa đủ ngày</span>
                            ) : item.gio_den_ngay?.do_rong_chuyen_phut !== null && item.gio_den_ngay?.do_rong_chuyen_phut !== undefined ? (
                              <span className={item.co?.gio_den_khong_co_dinh ? 'text-amber-800 font-bold' : 'text-gray-700'}>
                                {item.gio_den_ngay.do_rong_chuyen_phut} phút
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">chưa đủ ngày</span>
                            )}
                          </td>

                          {/* Lưu ý (Dấu hiệu) */}
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {item.co?.mau_it && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700">
                                  Ít số liệu
                                </span>
                              )}
                              {item.co?.san_luong_lon && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBDDF5] text-[#4A1D6E]">
                                  Sản lượng lớn
                                </span>
                              )}
                              {item.co?.gio_den_khong_co_dinh && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                                  Giờ đến không cố định
                                </span>
                              )}
                              {item.co?.san_luong_khong_deu && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-900">
                                  Sản lượng không đều
                                </span>
                              )}
                              {item.co?.nhieu_kien_di_ngoai && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-900">
                                  Nhiều kiện đi ngoài
                                </span>
                              )}
                              {!item.co?.mau_it &&
                                !item.co?.san_luong_lon &&
                                !item.co?.gio_den_khong_co_dinh &&
                                !item.co?.san_luong_khong_deu &&
                                !item.co?.nhieu_kien_di_ngoai && (
                                  <span className="text-gray-300">—</span>
                                )}
                            </div>
                          </td>
                        </tr>

                        {/* ── DÒNG MỞ RỘNG TỪNG NGÀY ───────────────────────── */}
                        {isExpanded && (
                          <tr className="bg-[#FAF6EC] border-y border-[#E4D5AE]">
                            <td colSpan={31} className="p-4">
                              <div className="bg-white rounded-[12px] p-4 border border-[#E4D5AE] shadow-xs space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                                  <div>
                                    <h3 className="text-xs font-bold text-gray-900">
                                      Biểu đồ giờ đến từng ngày · {item.ten || 'Chưa có tên đường thư'}
                                    </h3>
                                    <p className="text-[11px] text-gray-500">
                                      Khoảng giờ đến thường gặp:{' '}
                                      <strong className="text-[#4A1D6E] font-bold">
                                        {item.gio_den_ngay?.p10 || '—'} – {item.gio_den_ngay?.p90 || '—'}
                                        {item.gio_den_ngay?.vat_nua_dem ? ' (qua nửa đêm)' : ''}
                                      </strong>
                                      {' '}· Độ chênh lệch giữa các ngày:{' '}
                                      <strong className="text-gray-800 font-semibold">
                                        {item.gio_den_ngay?.do_rong_chuyen_phut !== null && item.gio_den_ngay?.do_rong_chuyen_phut !== undefined
                                          ? `${item.gio_den_ngay?.do_rong_chuyen_phut} phút`
                                          : 'chưa đủ ngày'}
                                      </strong>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRow(item.khoa)}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-[6px] cursor-pointer"
                                  >
                                    Đóng biểu đồ
                                  </button>
                                </div>

                                {expandedLoading && (
                                  <div className="py-8 text-center text-xs text-gray-500 space-y-1">
                                    <div className="inline-block w-5 h-5 border-2 border-[#4A1D6E] border-t-transparent rounded-full animate-spin" />
                                    <p>Đang tải chi tiết từng ngày...</p>
                                  </div>
                                )}

                                {expandedError && (
                                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-[8px] flex items-center justify-between">
                                    <span>{expandedError}</span>
                                    <button
                                      type="button"
                                      onClick={() => loadTheoNgay(item.khoa)}
                                      className="font-bold underline cursor-pointer"
                                    >
                                      Thử lại
                                    </button>
                                  </div>
                                )}

                                {!expandedLoading && !expandedError && expandedData?.duong_thu?.khoa === item.khoa && expandedData?.theo_moc?.[activeMoc]?.ngay && (
                                  <div className="space-y-2">
                                    {/* Trục giờ ngang 0h .. 23h (căn khớp chính xác các cột của hàng bên dưới) */}
                                    <div className="flex items-center gap-2 border-b border-gray-200 pb-1 px-1.5 text-[10px] text-gray-400 font-medium">
                                      <div className="w-16 shrink-0 text-left">Ngày</div>
                                      <div className="flex-1 grid grid-cols-24 gap-0 text-center">
                                        {Array.from({ length: 24 }, (_, h) => (
                                          <div key={h} className="text-center truncate">
                                            {h}h
                                          </div>
                                        ))}
                                      </div>
                                      <div className="w-40 shrink-0 text-right">
                                        {unit === 'kg' ? 'Khối lượng' : 'Sản lượng'}
                                      </div>
                                    </div>

                                    {/* Danh sách các ngày */}
                                    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                                      {expandedData.theo_moc[activeMoc].ngay.map((d) => {
                                        const thuText = getThuGon(d.ngay);
                                        const isCn = d.la_chu_nhat;
                                        return (
                                          <div
                                            key={d.ngay}
                                            className="flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-[#FAF6EC] transition-colors"
                                          >
                                            {/* Cột nhãn ngày */}
                                            <div className="w-16 shrink-0 font-medium text-gray-700 text-[11px] flex items-center gap-1">
                                              <span>{formatDdMm(d.ngay)}</span>
                                              <span
                                                className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                                  isCn
                                                    ? 'bg-amber-100 text-amber-900'
                                                    : 'bg-gray-100 text-gray-600'
                                                }`}
                                              >
                                                {thuText}
                                              </span>
                                            </div>

                                            {/* Trục 24 giờ cho ngày */}
                                            <div className="flex-1 relative h-6 bg-gray-50 rounded border border-gray-100 flex items-center">
                                              {/* Dải mờ thường gặp (vẽ đủ 2 đoạn khi vắt nửa đêm) */}
                                              {expandedData.theo_moc[activeMoc].dai_thuong_gap && (() => {
                                                const dai = expandedData.theo_moc[activeMoc].dai_thuong_gap;
                                                const phutDau = hhmmToMinutes(dai.p10);
                                                const phutCuoi = hhmmToMinutes(dai.p90);
                                                if (phutDau === null || phutCuoi === null) return null;
                                                if (dai.vat_nua_dem) {
                                                  const leftPct1 = (phutDau / 1440) * 100;
                                                  const widthPct2 = (phutCuoi / 1440) * 100;
                                                  return (
                                                    <>
                                                      <div
                                                        className="absolute top-0 bottom-0 bg-[#EBDDF5]/40 pointer-events-none rounded-r"
                                                        style={{ left: `${leftPct1}%`, right: '0%' }}
                                                      />
                                                      <div
                                                        className="absolute top-0 bottom-0 bg-[#EBDDF5]/40 pointer-events-none rounded-l"
                                                        style={{ left: '0%', width: `${widthPct2}%` }}
                                                      />
                                                    </>
                                                  );
                                                }
                                                const leftPct = (phutDau / 1440) * 100;
                                                const widthPct = Math.max(1, ((phutCuoi - phutDau) / 1440) * 100);
                                                return (
                                                  <div
                                                    className="absolute top-0 bottom-0 bg-[#EBDDF5]/40 pointer-events-none rounded"
                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                  />
                                                );
                                              })()}

                                              {/* Ngày không có hàng */}
                                              {!d.co_hang ? (
                                                <div className="w-full text-center text-[10px] text-gray-400 italic">
                                                  · không có hàng
                                                </div>
                                              ) : (
                                                /* Các chuyến trong ngày (chấm tròn) — dùng KttTooltip portal tránh bị cắt */
                                                d.chuyen && d.chuyen.map((c, ci) => {
                                                  const leftPct = (c.gio_giua_phut / 1440) * 100;
                                                  return (
                                                    <KttTooltip
                                                      key={ci}
                                                      placement="auto"
                                                      align="auto"
                                                      content={
                                                        <div className="w-64 whitespace-normal text-left text-[11px] leading-relaxed">
                                                          Chuyến đến khoảng {c.gio_giua}. Các lần đến cách nhau không quá {currentMocData.nguong_ap_dung?.gap_cum_phut != null ? `${currentMocData.nguong_ap_dung.gap_cum_phut} phút` : '—'} được gộp thành một chuyến, vì đó là cùng một xe được xác nhận trước và sau, không phải hai xe.
                                                        </div>
                                                      }
                                                      className="absolute -translate-x-1/2 cursor-pointer z-10 hover:z-30"
                                                      style={{ left: `${leftPct}%` }}
                                                    >
                                                      {isCn ? (
                                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-[#4A1D6E] bg-white shadow-xs hover:scale-125 transition-transform" />
                                                      ) : (
                                                        <div className="w-3.5 h-3.5 rounded-full bg-[#4A1D6E] shadow-xs hover:scale-125 transition-transform" />
                                                      )}
                                                    </KttTooltip>
                                                  );
                                                })
                                              )}
                                            </div>

                                            {/* Cột sản lượng của ngày */}
                                            <div className="w-40 shrink-0 text-right text-[11px] tabular-nums text-gray-600 flex items-center justify-end gap-2">
                                              <span className="font-semibold text-gray-900">
                                                {unit === 'kg' ? formatKg(d.kg, { withUnit: true }) : `${formatInt(d.shbg)} bưu gửi`}
                                              </span>
                                              <span className="text-[10px] text-gray-400">
                                                (túi: {d.trong_tui?.shbg != null ? formatInt(d.trong_tui.shbg) : '—'} · kiện: {d.kien_di_ngoai?.shbg != null ? formatInt(d.kien_di_ngoai.shbg) : '—'})
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Ghi chú cố định dưới biểu đồ từng ngày */}
                                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                                      <div className="flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        <span>
                                          Các lần đến cách nhau không quá {currentMocData.nguong_ap_dung?.gap_cum_phut != null ? `${currentMocData.nguong_ap_dung.gap_cum_phut} phút` : '—'} được gộp thành một chuyến (một chấm)
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4 text-[10px]">
                                        <span className="flex items-center gap-1">
                                          <span className="w-2.5 h-2.5 rounded-full bg-[#4A1D6E]" /> Ngày thường
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#4A1D6E] bg-white" /> Chủ nhật
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <span className="w-4 h-2 rounded bg-[#EBDDF5]" /> Dải thường gặp
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Dòng gộp «Khác» */}
                  {currentMocData.khac && currentMocData.khac.so_duong_thu > 0 && (
                    <tr className="bg-gray-50 font-medium">
                      <td className="sticky left-0 bg-gray-50 z-10 py-2.5 px-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        <div className="font-bold text-gray-700">Khác</div>
                        <div className="text-[11px] text-gray-500">
                          {currentMocData.khac.so_duong_thu} đường thư ngoài danh sách trên
                        </div>
                      </td>

                      {/* 24 ô giờ của dòng Khác */}
                      {currentMocData.khac.theo_gio && currentMocData.khac.theo_gio.map((g) => {
                        const curVal = unit === 'kg' ? g.kg : g.shbg;
                        const totVal = unit === 'kg' ? currentMocData.khac.kg : currentMocData.khac.shbg;
                        const cellStyle = getHourCellStyle(curVal, totVal);
                        const hasVal = unit === 'kg' ? (g.kg != null && g.kg > 0) : (g.shbg != null && g.shbg > 0);
                        return (
                          <td
                            key={g.gio}
                            className={`p-0.5 text-center text-[10px] tabular-nums ${cellStyle}`}
                            title={`Khác · Giờ ${g.gio}:00–${g.gio}:59: ${formatInt(g.shbg)} bưu gửi, ${formatKg(g.kg, { withUnit: true })}, ${formatInt(g.kien_di_ngoai)} kiện đi ngoài`}
                          >
                            <div className="py-1 px-0.5 truncate">
                              {hasVal ? (unit === 'kg' ? formatKg(curVal) : formatInt(curVal)) : '·'}
                            </div>
                          </td>
                        );
                      })}

                      {/* Bưu gửi/ngày hoặc kg/ngày */}
                      <td className="py-2.5 px-2 text-right tabular-nums text-gray-700 font-semibold">
                        {(() => {
                          const locKhac = currentMocData.khac?.san_luong_loc;
                          if (unit === 'kg') {
                            const tbKg = locKhac?.kg_tb_moi_ngay_cua_so;
                            return (
                              <div>
                                <div>{tbKg != null ? formatKg(tbKg) : '—'}</div>
                                {locKhac?.shbg_thieu_kg > 0 && (
                                  <div className="text-[9px] text-amber-700 font-normal truncate">
                                    {formatInt(locKhac.shbg_thieu_kg)} bưu gửi chưa có số kg
                                  </div>
                                )}
                              </div>
                            );
                          }
                          const tbShbg = locKhac?.shbg_tb_moi_ngay_cua_so;
                          return tbShbg != null ? `${formatInt(Math.round(tbShbg))}` : '—';
                        })()}
                      </td>

                      {/* Có hàng */}
                      <td className="py-2.5 px-2 text-center text-[11px] text-gray-500">
                        {(() => {
                          const locKhac = currentMocData.khac?.san_luong_loc;
                          if (locKhac?.so_ngay_co_hang != null && locKhac?.so_ngay_cua_so != null) {
                            return `${locKhac.so_ngay_co_hang}/${locKhac.so_ngay_cua_so} ngày`;
                          }
                          return '—';
                        })()}
                      </td>

                      {/* Trong túi / kiện ngoài */}
                      <td className="py-2.5 px-2 text-center text-[11px] tabular-nums text-gray-700">
                        {currentMocData.khac.trong_tui?.ty_le != null
                          ? formatPercent(currentMocData.khac.trong_tui.ty_le)
                          : '—'}
                        {' / '}
                        {currentMocData.khac.kien_di_ngoai?.ty_le != null
                          ? formatPercent(currentMocData.khac.kien_di_ngoai.ty_le)
                          : '—'}
                      </td>

                      {/* Giờ đến thường gặp */}
                      <td className="py-2.5 px-2 text-center text-[11px] text-gray-400">—</td>

                      {/* Chênh giữa các ngày */}
                      <td className="py-2.5 px-2 text-center text-[11px] text-gray-400">—</td>

                      {/* Lưu ý */}
                      <td className="py-2.5 px-3 text-[11px] text-gray-400">—</td>
                    </tr>
                  )}

                  {/* Dòng «Tổng cộng» */}
                  {currentMocData.tong && (
                    <tr className="bg-[#FAF5E8] font-bold border-t-2 border-[#E4D5AE] text-gray-900">
                      <td className="sticky left-0 bg-[#FAF5E8] z-10 py-3 px-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        <div className="font-bold text-[#4A1D6E]">Tổng cộng</div>
                        <div className="text-[11px] font-normal text-gray-500">
                          {currentMocData.tong.so_duong_thu} đường thư
                        </div>
                      </td>

                      {/* 24 ô giờ của dòng Tổng */}
                      {currentMocData.tong.theo_gio && currentMocData.tong.theo_gio.map((g) => {
                        const curVal = unit === 'kg' ? g.kg : g.shbg;
                        const totVal = unit === 'kg' ? currentMocData.tong.kg : currentMocData.tong.shbg;
                        const cellStyle = getHourCellStyle(curVal, totVal);
                        const hasVal = unit === 'kg' ? (g.kg != null && g.kg > 0) : (g.shbg != null && g.shbg > 0);
                        return (
                          <td
                            key={g.gio}
                            className={`p-0.5 text-center text-[10px] tabular-nums ${cellStyle}`}
                            title={`Tổng · Giờ ${g.gio}:00–${g.gio}:59: ${formatInt(g.shbg)} bưu gửi, ${formatKg(g.kg, { withUnit: true })}, ${formatInt(g.kien_di_ngoai)} kiện đi ngoài`}
                          >
                            <div className="py-1 px-0.5 truncate font-bold">
                              {hasVal ? (unit === 'kg' ? formatKg(curVal) : formatInt(curVal)) : '·'}
                            </div>
                          </td>
                        );
                      })}

                      {/* Bưu gửi/ngày hoặc kg/ngày */}
                      <td className="py-3 px-2 text-right tabular-nums text-[#4A1D6E] font-bold">
                        {(() => {
                          const locTong = currentMocData.tong?.san_luong_loc;
                          if (unit === 'kg') {
                            const tbKg = locTong?.kg_tb_moi_ngay_cua_so;
                            return (
                              <div>
                                <div>{tbKg != null ? formatKg(tbKg) : '—'}</div>
                                {locTong?.shbg_thieu_kg > 0 && (
                                  <div className="text-[9px] text-amber-700 font-normal truncate">
                                    {formatInt(locTong.shbg_thieu_kg)} bưu gửi chưa có số kg
                                  </div>
                                )}
                              </div>
                            );
                          }
                          const tbShbg = locTong?.shbg_tb_moi_ngay_cua_so;
                          return tbShbg != null ? `${formatInt(Math.round(tbShbg))}` : '—';
                        })()}
                      </td>

                      {/* Có hàng (R-e: dùng san_luong_loc.so_ngay_cua_so theo loại ngày) */}
                      <td className="py-3 px-2 text-center text-[11px] text-gray-600 font-normal">
                        {(() => {
                          const locTong = currentMocData.tong?.san_luong_loc;
                          if (locTong?.so_ngay_co_hang != null && locTong?.so_ngay_cua_so != null) {
                            return `${locTong.so_ngay_co_hang}/${locTong.so_ngay_cua_so} ngày`;
                          }
                          return '—';
                        })()}
                      </td>

                      {/* Trong túi / kiện ngoài */}
                      <td className="py-3 px-2 text-center text-[11px] tabular-nums text-gray-800">
                        {currentMocData.tong.trong_tui?.ty_le != null
                          ? formatPercent(currentMocData.tong.trong_tui.ty_le)
                          : '—'}
                        {' / '}
                        {currentMocData.tong.kien_di_ngoai?.ty_le != null
                          ? formatPercent(currentMocData.tong.kien_di_ngoai.ty_le)
                          : '—'}
                      </td>

                      {/* Giờ đến thường gặp */}
                      <td className="py-3 px-2 text-center text-[11px] text-gray-400">—</td>

                      {/* Chênh giữa các ngày */}
                      <td className="py-3 px-2 text-center text-[11px] text-gray-400">—</td>

                      {/* Lưu ý */}
                      <td className="py-3 px-3 text-[11px] text-gray-400">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── GIẢI THÍCH DẤU HIỆU CỐ ĐỊNH DƯỚI BẢNG ───────────────────────── */}
            <div className="p-4 bg-[#FAF6EC] border-t border-[#E4D5AE] space-y-2 text-xs">
              <div className="font-bold text-[#4A1D6E] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#4A1D6E]" />
                <span>
                  Các dấu hiệu so các đường thư với nhau, không dùng số cố định: nằm trong nhóm {currentMocData.nguong_ap_dung?.phan_vi_tuong_doi != null ? `${100 - currentMocData.nguong_ap_dung.phan_vi_tuong_doi}%` : '—'} cao nhất.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px] text-gray-700">
                <div className="p-2 rounded bg-white border border-[#E4D5AE]">
                  <strong className="text-gray-900 block">Sản lượng không đều:</strong>
                  <span>
                    {currentMocData.nguong_ap_dung?.muc_san_luong_khong_deu != null ? (
                      <>
                        mức chênh lệch sản lượng ngày thường từ{' '}
                        <span className="font-semibold tabular-nums text-[#4A1D6E]">
                          {formatDecimal(currentMocData.nguong_ap_dung.muc_san_luong_khong_deu, 2)}
                        </span>{' '}
                        trở lên.
                      </>
                    ) : (
                      'chưa đủ số liệu tính ngưỡng.'
                    )}
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E4D5AE]">
                  <strong className="text-gray-900 block">Giờ đến không cố định:</strong>
                  <span>
                    {currentMocData.nguong_ap_dung?.muc_gio_den_khong_co_dinh_phut != null ? (
                      <>
                        độ chênh lệch giữa các ngày từ{' '}
                        <span className="font-semibold tabular-nums text-[#4A1D6E]">
                          {currentMocData.nguong_ap_dung.muc_gio_den_khong_co_dinh_phut}
                        </span>{' '}
                        phút trở lên.
                      </>
                    ) : (
                      'chưa đủ số liệu tính ngưỡng.'
                    )}
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E4D5AE]">
                  <strong className="text-gray-900 block">Nhiều kiện đi ngoài:</strong>
                  <span>
                    {currentMocData.nguong_ap_dung?.muc_nhieu_kien_di_ngoai != null ? (
                      <>
                        tỷ lệ kiện đi ngoài từ {currentMocData.nguong_ap_dung?.kien_di_ngoai_pct != null ? `${currentMocData.nguong_ap_dung.kien_di_ngoai_pct}%` : '30%'} và từ{' '}
                        <span className="font-semibold tabular-nums text-[#4A1D6E]">
                          {Math.round(currentMocData.nguong_ap_dung.muc_nhieu_kien_di_ngoai * 100)}%
                        </span>{' '}
                        trở lên.
                      </>
                    ) : (
                      'chưa đủ số liệu tính ngưỡng.'
                    )}
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E4D5AE]">
                  <strong className="text-gray-900 block">Sản lượng lớn:</strong>
                  <span>
                    {currentMocData.nguong_ap_dung?.muc_san_luong_lon_shbg != null ? (
                      <>
                        sản lượng từ{' '}
                        <span className="font-semibold tabular-nums text-[#4A1D6E]">
                          {formatInt(currentMocData.nguong_ap_dung.muc_san_luong_lon_shbg)}
                        </span>{' '}
                        bưu gửi trở lên.
                      </>
                    ) : (
                      'chưa đủ số liệu tính ngưỡng.'
                    )}
                  </span>
                </div>
                <div className="p-2 rounded bg-white border border-[#E4D5AE]">
                  <strong className="text-gray-900 block">Ít số liệu:</strong>
                  <span>
                    dưới{' '}
                    <span className="font-semibold tabular-nums text-[#4A1D6E]">
                      {currentMocData.nguong_ap_dung?.mau_toi_thieu_ap_dung ?? currentMocData.nguong_ap_dung?.mau_toi_thieu_30_ngay ?? '—'}
                    </span>{' '}
                    bưu gửi trong khoảng đang xem.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
