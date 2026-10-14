import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, RefreshCw, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatRatePercent } from './ProcessingDeliveryView';
import PhatCancelBatchDialog from './PhatCancelBatchDialog';
import CustomDatePicker from '../common/CustomDatePicker';

// Kiểm tra định dạng ngày dd/mm/yyyy hợp lệ
function isValidDateDMY(str) {
  if (!str) return true;
  const trimmed = str.trim();
  if (!trimmed) return true;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2000 || y > 2100) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

// Chuyển dd/mm/yyyy -> YYYY-MM-DD
function dmyToYmd(str) {
  if (!str) return '';
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// Định dạng giờ Bangkok: YYYY-MM-DD HH:mm:ss -> HH:mm dd/mm/yyyy
function formatBangkokDateTime(str) {
  if (!str) return '—';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!m) return str;
  return `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}`;
}

function formatNgayDM(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : str;
}

function formatNgayDMY(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : str;
}

const STATUS_KEYS = [
  { ma: 'PTC', nhan: 'Phát thành công', color: 'text-[#059669]' },
  { ma: 'PKTC', nhan: 'Phát không thành công', color: 'text-[#dc2626]' },
  { ma: 'CHUYEN_HOAN', nhan: 'Chuyển hoàn', color: 'text-[#ea580c]' },
  { ma: 'LAC_HUONG', nhan: 'Lạc hướng', color: 'text-[#7c3aed]' },
  { ma: 'CHUA_CO_TT', nhan: 'Chưa có thông tin phát', color: 'text-[#334155]' }
];

export default function PhatHistoryView({ onBack, authUser }) {
  // Bộ lọc
  const [filterBcvh, setFilterBcvh] = useState('all');
  const [filterFromDate, setFilterFromDate] = useState(''); // dd/mm/yyyy, mặc định để trống
  const [filterToDate, setFilterToDate] = useState('');     // dd/mm/yyyy, mặc định để trống
  const [filterUser, setFilterUser] = useState('');
  const [filterStatus, setFilterStatus] = useState('');     // '' | 'da_nhap' | 'da_hoan_tac'
  const [page, setPage] = useState(1);

  // Lỗi validate ngày ở phía client
  const [dateError, setDateError] = useState(null);

  // Dữ liệu từ API
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [nguoiNhapLuaChon, setNguoiNhapLuaChon] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [apiError, setApiError] = useState(null);

  // Quản lý modal hủy đợt nhập
  const [selectedBatchForCancel, setSelectedBatchForCancel] = useState(null);

  // Quản lý banner kết quả hủy thành công (Trạng thái D)
  const [cancelSuccessData, setCancelSuccessData] = useState(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);

  // Map mã BCVH -> tên ngắn gọn (ví dụ: '533140' -> 'Thuận Hóa')
  const bcvhMap = useMemo(() => {
    const map = {};
    for (const b of BCVH_LIST) {
      map[b.ma] = b.ten.replace(/^BCVH\s+/, '');
    }
    return map;
  }, []);

  // Kiểm tra tính hợp lệ của hai ô ngày
  const validateDateRange = useCallback((fromVal, toVal) => {
    if (fromVal && toVal && fromVal > toVal) {
      return '«Nhập từ ngày» không được sau «đến ngày»';
    }
    return null;
  }, []);

  // Tải danh sách đợt nhập
  const loadBatches = useCallback(async (bcvhVal, fromVal, toVal, userVal, statusVal, pageVal) => {
    const err = validateDateRange(fromVal, toVal);
    if (err) {
      setDateError(err);
      return;
    }
    setDateError(null);
    setLoading(true);
    setApiError(null);

    try {
      const params = new URLSearchParams();
      if (bcvhVal && bcvhVal !== 'all') {
        params.set('bcvh', bcvhVal);
      } else {
        params.set('bcvh', 'all');
      }

      // Luôn gửi size=20 tường minh cho trang Lịch sử
      params.set('size', '20');
      params.set('page', String(pageVal || 1));

      if (fromVal) params.set('tu_ngay', fromVal);
      if (toVal) params.set('den_ngay', toVal);

      if (userVal) params.set('nguoi_nhap', userVal);
      if (statusVal) params.set('trang_thai', statusVal);

      const res = await apiFetchJson(`/api/phat/batches?${params.toString()}`);
      if (res.ok) {
        setItems(res.data?.items || []);
        if (res.data?.nguoi_nhap_lua_chon) {
          setNguoiNhapLuaChon(res.data.nguoi_nhap_lua_chon);
        }
        if (res.data?.pagination) {
          setPagination(res.data.pagination);
        }
      } else {
        setItems([]);
        setApiError(res.error || 'Có lỗi xảy ra khi tải lịch sử nhập');
      }
    } catch (_) {
      setItems([]);
      setApiError('Lỗi kết nối khi tải lịch sử nhập');
    } finally {
      setLoading(false);
    }
  }, [validateDateRange]);

  // Gọi API khi các bộ lọc hoặc trang thay đổi
  useEffect(() => {
    loadBatches(filterBcvh, filterFromDate, filterToDate, filterUser, filterStatus, page);
  }, [filterBcvh, filterFromDate, filterToDate, filterUser, filterStatus, page, loadBatches]);

  // Xóa lọc
  const handleResetFilter = () => {
    setFilterBcvh('all');
    setFilterFromDate('');
    setFilterToDate('');
    setFilterUser('');
    setFilterStatus('');
    setDateError(null);
    setPage(1);
  };

  // Khi hủy thành công từ dialog (Trạng thái D)
  const handleCancelSuccess = (undoResult) => {
    setSelectedBatchForCancel(null);
    setCancelSuccessData(undoResult);
    setSelectedDateIndex(0);
    // Làm mới danh sách giữ nguyên bộ lọc và trang hiện tại
    loadBatches(filterBcvh, filterFromDate, filterToDate, filterUser, filterStatus, page);
  };

  // Tính toán dữ liệu hiển thị cho banner D
  const tyLeSauList = useMemo(() => {
    if (!cancelSuccessData?.ty_le_sau) return [];
    return [...cancelSuccessData.ty_le_sau].sort((a, b) => (a.ngay || '').localeCompare(b.ngay || ''));
  }, [cancelSuccessData]);

  const tyLeTruocList = useMemo(() => {
    if (!cancelSuccessData?.ty_le_truoc) return [];
    return [...cancelSuccessData.ty_le_truoc].sort((a, b) => (a.ngay || '').localeCompare(b.ngay || ''));
  }, [cancelSuccessData]);

  const nDays = tyLeSauList.length;
  const safeDateIndex = selectedDateIndex >= 0 && selectedDateIndex < nDays ? selectedDateIndex : 0;
  const currentSau = tyLeSauList[safeDateIndex] || {};
  const currentDay = currentSau.ngay || tyLeTruocList[safeDateIndex]?.ngay || '';
  const currentTruoc = tyLeTruocList.find((t) => t.ngay === currentDay) || tyLeTruocList[safeDateIndex] || {};

  const ngayFormatted = currentDay ? formatNgayDM(currentDay) : '';
  const mauSo = currentSau.mau_so ?? currentTruoc.mau_so ?? 0;

  const calcDiff = (sauRate, truocRate) => {
    if (sauRate === null || sauRate === undefined || truocRate === null || truocRate === undefined) return '—';
    const diff = Math.round((sauRate - truocRate) * 1000) / 10;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  };

  const getDiffColor = (ma, sauRate, truocRate) => {
    if (sauRate === null || truocRate === null) return 'text-gray-400';
    const diff = sauRate - truocRate;
    if (diff === 0) return 'text-gray-500';
    if (ma === 'PTC') return diff > 0 ? 'text-[#059669]' : 'text-[#dc2626]';
    return diff < 0 ? 'text-[#059669]' : 'text-[#dc2626]';
  };

  const isFilterActive = filterBcvh !== 'all' || filterFromDate !== '' || filterToDate !== '' || filterUser !== '' || filterStatus !== '';

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* ── THANH TIÊU ĐỀ & ĐIỀU HƯỚNG ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <div className="text-xs text-gray-500 font-medium">
            Xử lý và tỷ lệ phát › Lịch sử nhập
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight mt-1">
            Lịch sử nhập trạng thái phát
          </h1>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Xử lý và tỷ lệ phát</span>
        </button>
      </div>

      {/* ── BANNER D: THÀNH CÔNG SAU KHI HỦY ĐỢT NHẬP (NẾU CÓ) ──────────────── */}
      {cancelSuccessData && (
        <div className="bg-emerald-50/80 border-2 border-[#10b981] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-[900] text-gray-900 tracking-tight">
                Đã hủy đợt nhập #{cancelSuccessData.batch_id} lúc {formatBangkokDateTime(cancelSuccessData.hoan_tac_luc_bangkok)}
              </h2>
              <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                Khôi phục trạng thái cũ: <strong className="font-bold text-gray-900">{formatInt(cancelSuccessData.so_khoi_phuc)}</strong> bưu gửi. Xóa trạng thái: <strong className="font-bold text-gray-900">{formatInt(cancelSuccessData.so_xoa_trang_thai)}</strong> bưu gửi. Tỷ lệ phát đã được tính lại.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCancelSuccessData(null)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-emerald-100/50 transition-colors cursor-pointer"
              title="Đóng thông báo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bảng so sánh Trước/Sau bên trong banner */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-gray-900">
                Ngày {ngayFormatted}, trước và sau khi hủy đợt nhập
              </h3>
              <span className="text-[11px] text-gray-500">
                Mẫu số {formatInt(mauSo)} bưu gửi đến.
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/70 text-gray-500 font-bold border-b border-gray-200">
                    <th className="py-2 px-3">Trạng thái</th>
                    <th className="py-2 px-3 text-right">Trước</th>
                    <th className="py-2 px-3 text-right">Sau</th>
                    <th className="py-2 px-3 text-right">Chênh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {STATUS_KEYS.map((st) => {
                    const tRate = currentTruoc.theo_trang_thai?.[st.ma]?.ty_le ?? null;
                    const sRate = currentSau.theo_trang_thai?.[st.ma]?.ty_le ?? null;
                    const diffStr = calcDiff(sRate, tRate);
                    const diffColor = getDiffColor(st.ma, sRate, tRate);

                    return (
                      <tr key={st.ma} className="hover:bg-gray-50/50">
                        <td className={`py-2 px-3 font-semibold ${st.color}`}>
                          {st.nhan}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 font-medium">
                          {formatRatePercent(tRate)}
                        </td>
                        <td className="py-2 px-3 text-right font-[900] text-gray-900">
                          {formatRatePercent(sRate)}
                        </td>
                        <td className={`py-2 px-3 text-right font-bold ${diffColor}`}>
                          {diffStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Hàng chip chọn ngày nếu N > 1 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {nDays > 1 ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tyLeSauList.map((item, idx) => {
                      const isSelected = safeDateIndex === idx;
                      return (
                        <button
                          key={item.ngay || idx}
                          type="button"
                          onClick={() => setSelectedDateIndex(idx)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#ea580c] text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {formatNgayDM(item.ngay)}
                        </button>
                      );
                    })}
                  </div>
                  {nDays === 31 && (
                    <div className="text-[11px] text-gray-500 italic">
                      Hiển thị tối đa 31 ngày đến gần nhất
                    </div>
                  )}
                </div>
              ) : <div />}

              <div className="text-xs font-semibold text-emerald-900">
                {nDays === 1
                  ? `Đợt này chạm ngày ${formatNgayDMY(tyLeSauList[0]?.ngay || tyLeTruocList[0]?.ngay)}`
                  : `Đợt này chạm ${nDays} ngày đến`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BỘ LỌC (BẢNG 17) ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5 items-end">
          {/* 1. BCVH */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              BCVH
            </label>
            <select
              value={filterBcvh}
              onChange={(e) => {
                setFilterBcvh(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              <option value="all">Tất cả BCVH được xem</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Nhập từ ngày */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nhập từ ngày
            </label>
            <CustomDatePicker
              placeholder="dd/mm/yyyy"
              value={filterFromDate}
              onChange={(val) => {
                setFilterFromDate(val);
                setPage(1);
              }}
            />
          </div>

          {/* 3. Đến ngày */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              đến ngày
            </label>
            <CustomDatePicker
              placeholder="dd/mm/yyyy"
              value={filterToDate}
              onChange={(val) => {
                setFilterToDate(val);
                setPage(1);
              }}
            />
          </div>

          {/* 4. Người nhập */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Người nhập
            </label>
            <select
              value={filterUser}
              onChange={(e) => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">Tất cả</option>
              {nguoiNhapLuaChon.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.hrm_code || `User #${u.id}`}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Trạng thái */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Trạng thái
            </label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              <option value="">Tất cả</option>
              <option value="da_nhap">Đã nhập</option>
              <option value="da_hoan_tac">Đã hủy</option>
            </select>
          </div>

          {/* 6. Nút Xóa lọc */}
          <div>
            <button
              type="button"
              onClick={handleResetFilter}
              className="w-full text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-2.5 shadow-2xs transition-colors cursor-pointer"
            >
              Xóa lọc
            </button>
          </div>
        </div>

        {/* Thông báo lỗi định dạng ngày nếu có */}
        {dateError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium pt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{dateError}</span>
          </div>
        )}
      </div>

      {/* ── BẢNG DANH SÁCH ĐỢT NHẬP (BẢNG 17) ────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-orange-600 animate-spin mx-auto" />
            <div className="text-xs text-gray-500 font-medium">
              Đang tải lịch sử nhập...
            </div>
          </div>
        ) : apiError ? (
          <div className="p-8 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              type="button"
              onClick={() => loadBatches(filterBcvh, filterFromDate, filterToDate, filterUser, filterStatus, page)}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-xs text-gray-400">
            {isFilterActive ? 'Không có đợt nào khớp bộ lọc' : 'Chưa có đợt nhập nào'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200">
                  <th className="py-3 px-4">Đợt</th>
                  <th className="py-3 px-4">Giờ nhập</th>
                  <th className="py-3 px-4">Người nhập</th>
                  <th className="py-3 px-4">BCVH</th>
                  <th className="py-3 px-4">Tên file</th>
                  <th className="py-3 px-4 text-right">Đã nhập</th>
                  <th className="py-3 px-4 text-right">Lỗi</th>
                  <th className="py-3 px-4 text-center">Cảnh báo</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {items.map((b) => {
                  const bcvhName = bcvhMap[b.bcvh] || b.bcvh;
                  const isDaNhap = b.trang_thai === 'da_nhap';

                  return (
                    <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Đợt */}
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        #{b.id}
                      </td>

                      {/* Giờ nhập */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-gray-700 font-medium">
                        {formatBangkokDateTime(b.nhap_luc_bangkok)}
                      </td>

                      {/* Người nhập */}
                      <td className="py-3.5 px-4 font-medium text-gray-900">
                        {b.nhap_boi?.full_name || b.nhap_boi?.hrm_code || '—'}
                      </td>

                      {/* BCVH */}
                      <td className="py-3.5 px-4 font-medium text-gray-700">
                        {bcvhName}
                      </td>

                      {/* Tên file */}
                      <td className="py-3.5 px-4 text-gray-600 max-w-[200px] truncate" title={b.ten_file}>
                        {b.ten_file}
                      </td>

                      {/* Đã nhập */}
                      <td className="py-3.5 px-4 text-right font-bold text-gray-900">
                        {formatInt(b.so_nhap)}
                      </td>

                      {/* Lỗi */}
                      <td className="py-3.5 px-4 text-right font-medium text-gray-600">
                        {formatInt(b.so_loi)}
                      </td>

                      {/* Cảnh báo: > 0 nhãn vàng; 0 chữ xám «Không có»; null chữ xám «Không rõ» */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {b.so_canh_bao > 0 ? (
                          <span className="inline-block px-2.5 py-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                            {b.so_canh_bao} cảnh báo
                          </span>
                        ) : b.so_canh_bao === 0 ? (
                          <span className="text-gray-400 font-medium">Không có</span>
                        ) : (
                          <span className="text-gray-400 font-medium">Không rõ</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isDaNhap ? (
                          <span className="inline-block px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                            Đã nhập
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-block px-2.5 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200 rounded-full">
                              Đã hủy
                            </span>
                            <div className="text-[11px] text-gray-400">
                              Hủy bởi {b.hoan_tac_boi?.full_name || 'Người dùng'}, {formatBangkokDateTime(b.hoan_tac_luc_bangkok)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isDaNhap ? (
                          b.co_quyen_hoan_tac ? (
                            <button
                              type="button"
                              onClick={() => setSelectedBatchForCancel(b)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 bg-white border border-red-300 rounded-xl hover:bg-red-50 hover:border-red-400 transition-colors shadow-2xs cursor-pointer"
                            >
                              Hủy đợt nhập
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 font-medium">
                              Chỉ ADMIN, TTVH hoặc người nhập
                            </span>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── CHÂN BẢNG & PHÂN TRANG ─────────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-500">
            <div>
              Hiển thị <strong className="text-gray-900 font-semibold">{items.length}</strong> trên <strong className="text-gray-900 font-semibold">{formatInt(pagination.total)}</strong> đợt · «Không rõ» là đợt nhập trước khi hệ thống lưu số cảnh báo
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>

              <span className="px-2 font-bold text-gray-800">
                Trang {pagination.page} / {pagination.total_pages || 1}
              </span>

              <button
                type="button"
                disabled={page >= (pagination.total_pages || 1)}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── HỘP THOẠI HỦY ĐỢT NHẬP (BẢNG 18 A-C) ─────────────────────────── */}
      {selectedBatchForCancel && (
        <PhatCancelBatchDialog
          batch={selectedBatchForCancel}
          onClose={() => setSelectedBatchForCancel(null)}
          onCancelSuccess={handleCancelSuccess}
          onRefreshList={() => {
            setSelectedBatchForCancel(null);
            loadBatches(filterBcvh, filterFromDate, filterToDate, filterUser, filterStatus, page);
          }}
        />
      )}
    </div>
  );
}
