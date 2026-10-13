import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Radio, RefreshCw, AlertTriangle, ArrowRight, ArrowLeft, ChevronRight, 
  ExternalLink, Clock, Package, AlertCircle, ChevronLeft, CheckCircle2
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';

// Alias dùng chung từ constants/bcvh.js
const DASHBOARD_BCVH = BCVH_LIST;

// Hàm định dạng chênh điểm thống nhất toàn site (PO sẽ chốt chuỗi sau)
export function formatPointDiff(diff) {
  if (diff === null || diff === undefined || isNaN(diff)) return '—';
  const abs = Math.abs(diff).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (diff > 0) return `cao hơn ${abs} điểm`;
  if (diff < 0) return `thấp hơn ${abs} điểm`;
  return 'không đổi';
}

export function formatPercent(r) {
  if (r === null || r === undefined || isNaN(r)) return '—';
  return `${(r * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatPctChange(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return 'chưa đủ dữ liệu';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// «+5,0% so tuần trước» khi có số chênh; null (thiếu mốc hoặc mốc dưới sàn 50 BG, DASH-6b) -> «chưa đủ dữ liệu so tuần trước». label: 'so tuần trước' | 'so hôm qua cùng giờ'.
export function formatSoSanh(pct, label) {
  if (pct === null || pct === undefined || isNaN(pct)) return `chưa đủ dữ liệu ${label}`;
  return `${formatPctChange(pct)} ${label}`;
}

// Lý do chưa đánh giá mức sản lượng (danh_gia_san_luong.ly_do của API) -> chữ ngắn để làm chú thích.
export function lyDoChuaDanhGia(dg) {
  if (!dg || dg.trang_thai !== 'chua_du_du_lieu') return '';
  if (dg.ly_do === 'thieu_tuan_truoc') return 'Chưa có dữ liệu cùng thứ tuần trước';
  if (dg.ly_do === 'moc_duoi_san') return 'Mốc tuần trước còn quá ít bưu gửi (dưới 50 BG)';
  if (dg.ly_do === 'chua_toi_gio') return 'Dữ liệu chưa tới 12:00 nên chưa đánh giá';
  return 'Chưa đủ dữ liệu so tuần trước';
}

// Chip tăng/giảm số bưu gửi của phường/xã so với hôm qua (quy tắc DASH-2b) — dùng chung cho Dashboard và màn tivi.
// loai: 'moi_co' (không có tỉ lệ so sánh) | 'bang' (bằng 0, không mũi tên) | 'giam' (xanh) | 'tang_cao' (tăng từ 20%, đỏ) | 'tang' (vàng).
export function wardChangeChip(item) {
  const tang = item.tang_so_hom_qua ?? 0; // số BG tăng/giảm so hôm qua
  const pct = item.tang_so_hom_qua_pct;   // null = mới có (hôm qua 0) hoặc mốc hôm qua dưới sàn 50 BG (DASH-6b: chỉ hiện số BG, không %)
  if (pct === null || pct === undefined) {
    if (!item.hom_qua) return { loai: 'moi_co', text: 'mới có' };
    if (tang === 0) return { loai: 'bang', text: '— 0 BG' };
    if (tang < 0) return { loai: 'giam', text: `▼ ${tang.toLocaleString('vi-VN')} BG` };
    return { loai: 'tang', text: `▲ +${tang.toLocaleString('vi-VN')} BG` };
  }
  if (tang === 0) return { loai: 'bang', text: '— 0 BG (0%)' };
  if (tang < 0) return { loai: 'giam', text: `▼ ${tang.toLocaleString('vi-VN')} BG (${formatPctChange(pct)})` };
  return {
    loai: pct >= 20 ? 'tang_cao' : 'tang',
    text: `▲ +${tang.toLocaleString('vi-VN')} BG (+${pct.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`
  };
}

export function formatTimeOnly(timeStr) {
  if (!timeStr) return '';
  // e.g. "2026-10-20 16:00:00" -> "16:00"
  if (timeStr.includes(' ')) {
    return timeStr.split(' ')[1].slice(0, 5);
  }
  if (timeStr.includes('T')) {
    return timeStr.split('T')[1].slice(0, 5);
  }
  return timeStr.slice(0, 5);
}

export function formatDateTimeSec(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Diễn giải tiêu đề việc cần làm từ tieu_de_khoa
// isAllView: true khi đang xem toàn Trung tâm (cần hiện tên BCVH); false khi xem một BCVH (bỏ tên BCVH để tránh lặp)
function formatActionTitle(item, isAllView) {
  const { loai, muc, tieu_de_khoa, ten_bcvh } = item;
  const bcvhSuffix = isAllView ? `: ${ten_bcvh}` : '';
  if (loai === 'chua_nhan_tai_bcvh') {
    if (muc === 'xu_ly_ngay') {
      return `Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH${bcvhSuffix}`;
    }
    return `Bưu gửi chưa có XN nhận tại BCVH${bcvhSuffix}`;
  }
  if (loai === 'bd10_chua_xnd') {
    if (muc === 'xu_ly_ngay') {
      return `BD10 đến chưa XNĐ cao (vượt 10%)${bcvhSuffix}`;
    }
    return `BD10 đến chưa XNĐ${bcvhSuffix}`;
  }
  return `${tieu_de_khoa}${bcvhSuffix}`;
}

function formatActionDetail(item) {
  const { loai, so_lieu } = item;
  if (loai === 'chua_nhan_tai_bcvh') {
    const choTu1 = so_lieu.cho_tu_1_ngay || 0;
    const cuNhat = so_lieu.cho_lau_nhat_ngay ?? 0;
    return `Đã chờ ${choTu1 > 0 ? `từ 1 ngày: ${choTu1} bưu gửi` : 'trong ngày'}. Cũ nhất: ${cuNhat} ngày. Chưa tính vào sản lượng đến.`;
  }
  if (loai === 'bd10_chua_xnd') {
    return `${so_lieu.chua_xnd} / ${so_lieu.tong_bd10_den} BD10 đến chưa XNĐ (${formatPercent(so_lieu.ty_le)}). Hoàn tất XNĐ để kiểm soát đủ hàng đến.`;
  }
  return '';
}

export default function DailyOpsDashboard({ authUser, onNavigate, onEnterTvMode }) {
  const isGdvH = authUser?.role === 'GDVH';
  
  // State phạm vi BCVH đang chọn ('all' hoặc mã bcvh cụ thể)
  const [selectedBcvh, setSelectedBcvh] = useState('all');
  const [hasUserSelected, setHasUserSelected] = useState(false);

  // Dữ liệu API
  const [tongQuan, setTongQuan] = useState(null);
  const [viecCanLam, setViecCanLam] = useState(null);
  const [phuongXa, setPhuongXa] = useState(null);

  // Trạng thái mạng / refresh
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [connectionLostAt, setConnectionLostAt] = useState(null);
  const [error403, setError403] = useState(null);

  // Carousel index cho danh sách việc cần điều hành
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isHoveringSlide, setIsHoveringSlide] = useState(false);

  // Gọi 3 API
  const fetchData = useCallback(async (bcvhCode) => {
    setIsRefreshing(true);
    const code = bcvhCode || 'all';

    try {
      const [tqRes, viecRes, pxRes] = await Promise.all([
        apiFetchJson(`/api/arrivals/dashboard/tong-quan-den?bcvh=${code}`),
        apiFetchJson(`/api/arrivals/dashboard/viec-can-lam?bcvh=${code}`),
        apiFetchJson(`/api/arrivals/dashboard/phuong-xa-tang?bcvh=${code}&gioi_han=5`)
      ]);

      // Kiểm tra 403
      if (tqRes.status === 403 || viecRes.status === 403 || pxRes.status === 403) {
        setError403('Tài khoản của bạn không có quyền xem thông tin điều hành hôm nay (STAFF không được truy cập).');
        setInitialLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (tqRes.ok && viecRes.ok && pxRes.ok) {
        setTongQuan(tqRes.data);
        setViecCanLam(viecRes.data);
        setPhuongXa(pxRes.data);
        setLastRefreshedAt(new Date());
        setConnectionLostAt(null);
        setError403(null);

        // Mặc định bcvh_goi_y cho GDVH khi lần đầu tải nếu người dùng chưa chủ động đổi
        if (!hasUserSelected && isGdvH) {
          const goiY = tqRes.data.bcvh_goi_y;
          if (goiY && goiY.length > 0 && selectedBcvh === 'all') {
            setSelectedBcvh(goiY[0]);
          }
        }
      } else {
        // Lỗi từ backend nhưng không phải 403: ghi nhận mất kết nối, giữ số cũ
        if (!connectionLostAt) setConnectionLostAt(new Date());
      }
    } catch (err) {
      // Lỗi mạng hoặc server không phản hồi: giữ số cũ, bật cảnh báo
      if (!connectionLostAt) setConnectionLostAt(new Date());
    } finally {
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedBcvh, hasUserSelected, isGdvH, connectionLostAt]);

  // Load ban đầu & khi đổi selectedBcvh
  useEffect(() => {
    fetchData(selectedBcvh);
  }, [selectedBcvh]);

  // Timer tự làm mới mỗi 60 giây và dừng khi tab ẩn
  useEffect(() => {
    let intervalId = null;

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        fetchData(selectedBcvh);
      }, 60000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (intervalId) clearInterval(intervalId);
      } else if (document.visibilityState === 'visible') {
        fetchData(selectedBcvh);
        startInterval();
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData, selectedBcvh]);

  // Handler đổi BCVH
  const handleSelectBcvh = (newCode) => {
    setSelectedBcvh(newCode);
    setHasUserSelected(true);
    setCurrentSlideIndex(0);
  };

  // Carousel timer cho danh sách việc cần điều hành
  const actionItems = useMemo(() => {
    return viecCanLam?.items || [];
  }, [viecCanLam]);

  useEffect(() => {
    if (isHoveringSlide || actionItems.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % actionItems.length);
    }, 6000); // 6 giây chuyển mục
    return () => clearInterval(timer);
  }, [isHoveringSlide, actionItems.length]);

  // Điều hướng sang màn hình chi tiết khi bấm nút xử lý
  const handleExecuteAction = (item) => {
    if (!onNavigate) return;
    if (item.loai === 'chua_nhan_tai_bcvh') {
      onNavigate({
        tab: 'arrivals',
        bcvh: item.bcvh,
        showNotReceivedDetail: true,
        date: item.ngay
      });
    } else if (item.loai === 'bd10_chua_xnd') {
      onNavigate({
        tab: 'arrivals',
        bcvh: item.bcvh,
        subTab: 'bd10_status',
        date: item.ngay
      });
    }
  };

  // ==========================================
  // XỬ LÝ LỖI QUYỀN TRUY CẬP (403)
  // ==========================================
  if (error403) {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-12 text-center bg-white rounded-2xl border border-red-200 shadow-sm">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-red-700 mb-2">Không đủ quyền truy cập</h2>
        <p className="text-gray-600 mb-6">{error403}</p>
        <p className="text-sm text-gray-500">Trang điều hành hôm nay chỉ dành cho vai trò Lãnh đạo Trung tâm và Giám đốc BCVH.</p>
      </div>
    );
  }

  // ==========================================
  // LOADING BAN ĐẦU (SKELETON)
  // ==========================================
  if (initialLoading && !tongQuan) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-10 bg-gray-200 rounded-lg w-1/3 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-gray-200 rounded-2xl p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
        <div className="h-40 bg-white border border-gray-200 rounded-2xl p-6 animate-pulse" />
        <div className="h-64 bg-white border border-gray-200 rounded-2xl p-6 animate-pulse" />
      </div>
    );
  }

  const isAllView = selectedBcvh === 'all';
  const currentBcvhObj = !isAllView ? DASHBOARD_BCVH.find((b) => b.ma === selectedBcvh) : null;
  const currentBcvhRow = !isAllView && tongQuan?.theo_bcvh?.find((r) => r.ma === selectedBcvh);

  // Đếm số việc theo mức
  const countXuLyNgay = actionItems.filter((i) => i.muc === 'xu_ly_ngay').length;
  const countTrongNgay = actionItems.filter((i) => i.muc === 'trong_ngay').length;

  return (
    <div className="p-6 space-y-6 text-[#292524] bg-[#f8f9fa] min-h-screen">
      {/* THANH CẢNH BÁO MẤT KẾT NỐI (GIỮ SỐ CŨ) */}
      {connectionLostAt && (
        <div className="bg-[#fffbeb] border border-[#f59e0b] text-[#92400e] px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#f59e0b] shrink-0" />
            <span className="text-sm font-medium">
              Mất kết nối từ {formatDateTimeSec(connectionLostAt)}. Đang tiếp tục thử kết nối lại... Số liệu đang hiển thị là dữ liệu gần nhất lúc {formatDateTimeSec(lastRefreshedAt)}.
            </span>
          </div>
          <button
            onClick={() => fetchData(selectedBcvh)}
            disabled={isRefreshing}
            className="px-3 py-1 bg-white border border-[#f59e0b] text-[#92400e] text-xs font-bold rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Thử lại
          </button>
        </div>
      )}

      {/* 1. THANH TRÊN CÙNG: TIÊU ĐỀ & TRẠNG THÁI & BỘ CHỌN BCVH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#e7e5e4] shadow-sm">
        <div className="flex flex-col gap-1">
          {!isAllView && (
            <button
              onClick={() => handleSelectBcvh('all')}
              className="text-xs font-semibold text-[#881337] hover:underline flex items-center gap-1 w-fit mb-0.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Về màn Trung tâm (lãnh đạo Trung tâm thấy)
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-[#881337] tracking-tight">
              {isAllView
                ? 'Cần điều hành ngay hôm nay'
                : `Cần điều hành ngay hôm nay · ${currentBcvhObj?.ten || selectedBcvh} (${selectedBcvh})`}
            </h1>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                connectionLostAt ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${connectionLostAt ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                {connectionLostAt ? 'Mất kết nối' : `Trực tiếp · Dữ liệu đến ${formatTimeOnly(tongQuan?.den_luc) || 'chưa có'}`}
              </span>
              {lastRefreshedAt && (
                <span className="text-[11px] text-[#78716c] hidden sm:inline" title="Lần làm mới thành công gần nhất">
                  (Cập nhật {formatDateTimeSec(lastRefreshedAt)})
                </span>
              )}
            </div>
          </div>
        </div>

          {/* BỘ CHỌN BCVH & VAI TRÒ + NÚT TIVI */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-[#f5f5f4] p-1.5 rounded-xl border border-[#e7e5e4]">
              <span className="text-xs font-bold text-[#57534e] px-2 whitespace-nowrap">
                {isAllView ? 'Lãnh đạo Trung tâm · 6 BCVH' : 'GĐ BCVH'}
              </span>
              <select
                id="select-bcvh-dashboard"
                value={selectedBcvh}
                onChange={(e) => handleSelectBcvh(e.target.value)}
                className="text-sm font-semibold text-[#292524] bg-white border border-[#d6d3d1] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#881337] cursor-pointer"
              >
                <option value="all">Toàn Trung tâm (6 BCVH)</option>
                {DASHBOARD_BCVH.map((b) => (
                  <option key={b.ma} value={b.ma}>
                    {b.ten} ({b.ma})
                  </option>
                ))}
              </select>
            </div>
            {onEnterTvMode && (
              <button
                onClick={() => onEnterTvMode(selectedBcvh)}
                title="Mở chế độ tivi (toàn màn hình)"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#57534e] bg-white border border-[#d6d3d1] rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                📺 Chế độ tivi
              </button>
            )}
          </div>
        </div>

      {/* 2. HÀNG A: CÁC THẺ CHỈ SỐ */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAllView ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {/* THẺ 1: SẢN LƯỢNG ĐẾN HÔM NAY */}
        <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold text-[#78716c] uppercase tracking-wider mb-1">
              {isAllView ? 'SẢN LƯỢNG ĐẾN HÔM NAY' : 'BƯU GỬI ĐẾN BCVH HÔM NAY'}
            </div>
            <div className="text-[34px] font-black text-[#0f2747] leading-none my-2">
              {isAllView
                ? (tongQuan?.san_luong?.buu_gui || 0).toLocaleString('vi-VN')
                : (currentBcvhRow?.san_luong?.buu_gui || 0).toLocaleString('vi-VN')}
            </div>
          </div>
          <div className="text-xs text-[#57534e] space-y-0.5 pt-2 border-t border-[#f5f5f4]">
            {isAllView ? (
              <div>
                <span>{formatSoSanh(tongQuan?.san_luong?.so_hom_qua_cung_gio?.chenh_pct, 'so hôm qua cùng giờ')}</span>
                <span className="mx-1.5">·</span>
                <span>{formatSoSanh(tongQuan?.san_luong?.so_tuan_truoc_cung_gio?.chenh_pct, 'so tuần trước')}</span>
              </div>
            ) : (
              <div>
                <span>{formatSoSanh(currentBcvhRow?.so_hom_qua?.chenh_pct, 'so hôm qua cùng giờ')}</span>
                <span className="mx-1.5">·</span>
                <span title={lyDoChuaDanhGia(currentBcvhRow?.danh_gia_san_luong)}>{formatSoSanh(currentBcvhRow?.so_tuan_truoc?.chenh_pct, 'so tuần trước')}</span>
              </div>
            )}
            <div className="text-[11px] text-[#a8a29e] italic">BG = bưu gửi (lần đến sớm nhất)</div>
          </div>
        </div>

        {/* THẺ 2: BCVH CẦN CHÚ Ý (CHỈ HIỆN KHI XEM TOÀN TRUNG TÂM ALL) */}
        {isAllView && (
          <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-[12px] font-bold text-[#78716c] uppercase tracking-wider mb-1">
                BCVH CẦN CHÚ Ý
              </div>
              <div className="text-[34px] font-black text-[#881337] leading-none my-2">
                {tongQuan?.bcvh_can_chu_y?.so || 0}
                <span className="text-xl text-[#78716c] font-bold"> / {tongQuan?.bcvh_can_chu_y?.tong || 6}</span>
              </div>
            </div>
            <div className="text-xs text-[#57534e] pt-2 border-t border-[#f5f5f4]">
              {tongQuan?.bcvh_can_chu_y?.so > 0 ? 'Có ít nhất một chỉ số vượt ngưỡng cảnh báo' : 'Tất cả BCVH ở mức bình thường'}
            </div>
          </div>
        )}

        {/* THẺ 3: HÀNG ĐI NGOÀI */}
        <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold text-[#78716c] uppercase tracking-wider mb-1">
              HÀNG ĐI NGOÀI
            </div>
            <div className="text-[34px] font-black text-[#0f2747] leading-none my-2">
              {formatPercent(tongQuan?.hang_di_ngoai?.ty_le)}
            </div>
          </div>
          <div className="text-xs text-[#57534e] pt-2 border-t border-[#f5f5f4]">
            <span>{(tongQuan?.hang_di_ngoai?.buu_gui || 0).toLocaleString('vi-VN')} bưu gửi hôm nay</span>
            <span className="text-[#a8a29e] block text-[11px]">
              {tongQuan?.hang_di_ngoai?.so_tuan_truoc_cung_gio?.chenh_diem !== null && tongQuan?.hang_di_ngoai?.so_tuan_truoc_cung_gio?.chenh_diem !== undefined
                ? `${formatPointDiff(tongQuan.hang_di_ngoai.so_tuan_truoc_cung_gio.chenh_diem)} so tuần trước`
                : 'chưa đủ dữ liệu so tuần trước'}
            </span>
          </div>
        </div>

        {/* THẺ 4: HÀNG ĐẾN SAU 15:00 */}
        <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold text-[#78716c] uppercase tracking-wider mb-1">
              HÀNG ĐẾN SAU 15:00
            </div>
            <div className="text-[34px] font-black text-[#0f2747] leading-none my-2">
              {tongQuan?.sau_15h?.da_toi_gio ? formatPercent(tongQuan?.sau_15h?.ty_le) : 'Chưa tới 15:00'}
            </div>
          </div>
          <div className="text-xs text-[#57534e] pt-2 border-t border-[#f5f5f4]">
            {tongQuan?.sau_15h?.da_toi_gio ? (
              <span>{(tongQuan?.sau_15h?.buu_gui || 0).toLocaleString('vi-VN')} bưu gửi hôm nay · khó phát hết trong ngày</span>
            ) : (
              <span className="text-[#a8a29e]">Dữ liệu hiện tại chưa tới mốc 15:00</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. HÀNG PTC (PLACEHOLDER «SẮP CÓ») */}
      <div className="bg-white rounded-2xl border border-[#fed7aa] p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-orange-50/50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-bold shrink-0">
            PTC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#292524] text-[15px]">Phát thành công (PTC)</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                Sắp có
              </span>
            </div>
            <p className="text-xs text-[#78716c] mt-0.5">
              Module «Xử lý và tỷ lệ phát» đang được xây dựng (tỷ lệ phát thành công, phát không thành công, chuyển hoàn).
            </p>
          </div>
        </div>
        <div className="text-xs font-semibold text-[#a8a29e] italic whitespace-nowrap">
          Chưa phát sinh dữ liệu phát
        </div>
      </div>

      {/* 4. KHỐI «CẦN ĐIỀU HÀNH NGAY HÔM NAY» / «VIỆC CỦA BCVH TÔI» */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[#881337]">
                {isAllView ? 'Danh sách cần điều hành' : `Việc của BCVH tôi · ${currentBcvhObj?.ten || selectedBcvh}`}
              </h2>
            </div>
            <p className="text-xs text-[#78716c] mt-0.5">
              Sản lượng được so với cùng thứ tuần trước (cùng giờ). «Xử lý ngay» đứng trước.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
              {countXuLyNgay} xử lý ngay
            </span>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {countTrongNgay} trong ngày
            </span>
          </div>
        </div>

        {/* DANH SÁCH VIỆC */}
        {actionItems.length === 0 ? (
          <div className="py-10 text-center bg-[#f0fdf4] rounded-xl border border-[#bbf7d0] text-[#15803d]">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <p className="font-bold text-[15px]">Hôm nay chưa có việc cần điều hành</p>
            <p className="text-xs mt-1 text-[#166534]">Tất cả chỉ số của {isAllView ? 'các BCVH' : currentBcvhObj?.ten} đều trong ngưỡng bình thường.</p>
          </div>
        ) : (
          <div 
            className="space-y-3"
            onMouseEnter={() => setIsHoveringSlide(true)}
            onMouseLeave={() => setIsHoveringSlide(false)}
          >
            {actionItems.map((item, idx) => {
              const isXuLy = item.muc === 'xu_ly_ngay';
              const cardBg = isXuLy ? 'bg-[#fff1f2] border-[#fecdd3]' : 'bg-[#fff7ed] border-[#fed7aa]';
              const badgeBg = isXuLy ? 'bg-[#ffe4e6] text-[#be123c]' : 'bg-[#ffedd5] text-[#c2410c]';
              const badgeText = isXuLy ? 'Xử lý ngay' : 'Trong ngày';
              const numColor = isXuLy ? 'text-[#be123c]' : 'text-[#c2410c]';

              return (
                <div 
                  key={`${item.bcvh}-${item.loai}-${idx}`}
                  className={`border rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-md ${cardBg}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-md whitespace-nowrap shrink-0 mt-0.5 ${badgeBg}`}>
                      {badgeText}
                    </span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-[15px] text-[#292524] leading-snug">
                        {formatActionTitle(item, isAllView)}
                      </h4>
                      <p className="text-xs text-[#57534e]">
                        {formatActionDetail(item)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-black/5 shrink-0">
                    <div className="text-left md:text-right">
                      {item.loai === 'chua_nhan_tai_bcvh' ? (
                        <div className="flex items-baseline md:justify-end gap-1">
                          <span className={`text-2xl font-black ${numColor}`}>
                            {item.so_lieu?.buu_gui?.toLocaleString('vi-VN')}
                          </span>
                          <span className="text-xs font-bold text-[#57534e]">bưu gửi</span>
                        </div>
                      ) : (
                        <div className="flex items-baseline md:justify-end gap-1">
                          <span className={`text-2xl font-black ${numColor}`}>
                            {formatPercent(item.so_lieu?.ty_le)}
                          </span>
                          <span className="text-xs font-bold text-[#57534e]">chưa XNĐ</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleExecuteAction(item)}
                      className={`px-4 py-2 text-xs font-bold text-white rounded-lg transition-colors flex items-center gap-1 shrink-0 ${
                        isXuLy ? 'bg-[#e11d48] hover:bg-[#be123c]' : 'bg-[#ea580c] hover:bg-[#c2410c]'
                      }`}
                    >
                      <span>Xử lý</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-[11px] text-[#a8a29e] pt-1 px-1">
              <span>{actionItems.length} việc cần lưu ý</span>
              <span>Rê chuột để dừng · Bấm «Xử lý →» để mở màn chi tiết</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. PLACEHOLDER: XẾP HẠNG & BIỂU ĐỒ KHUNG GIỜ (SẮP CÓ) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col items-center justify-center text-center py-10 space-y-2">
        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
          Sắp có
        </span>
        <h3 className="font-bold text-[16px] text-[#292524]">
          {isAllView ? 'Xếp hạng BCVH theo khung giờ và Kết quả phát toàn Trung tâm' : 'Hôm nay từng khung giờ thế nào?'}
        </h3>
        <p className="text-xs text-[#78716c] max-w-lg">
          Tính năng thống kê kết quả phát theo từng khung giờ và so sánh tiến độ phát đang thuộc module «Xử lý và tỷ lệ phát».
        </p>
      </div>

      {/* 6. BẢNG «HÔM NAY THEO TỪNG BCVH» (CHỈ HIỆN KHI XEM TOÀN TRUNG TÂM ALL) */}
      {isAllView && (
        <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-[#292524]">Hôm nay theo từng BCVH</h3>
              <p className="text-xs text-[#78716c] mt-0.5">
                Sản lượng đến tích luỹ từ 00:00 tới {formatTimeOnly(tongQuan?.den_luc) || 'hiện tại'}. Bấm vào BCVH để xem điều hành riêng của BCVH đó.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate({ tab: 'arrivals' })}
                className="text-xs font-bold text-[#881337] hover:underline flex items-center gap-1"
              >
                <span>Mở Sản lượng đến</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e7e5e4] rounded-xl">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-[#fafaf9] text-[#57534e] text-xs font-bold uppercase border-b border-[#e7e5e4]">
                <tr>
                  <th className="px-4 py-3">BCVH</th>
                  <th className="px-4 py-3 text-right">SẢN LƯỢNG ĐẾN</th>
                  <th className="px-4 py-3 text-right">SO HÔM QUA</th>
                  <th className="px-4 py-3 text-right">SO TUẦN TRƯỚC</th>
                  <th className="px-4 py-3 text-right">CHƯA NHẬN</th>
                  <th className="px-4 py-3 text-right">BD10 CHƯA XNĐ</th>
                  <th className="px-4 py-3 text-center">ĐÁNH GIÁ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7e5e4]">
                {tongQuan?.theo_bcvh?.map((row) => {
                  const isNoData = !row.co_du_lieu;

                  return (
                    <tr 
                      key={row.ma} 
                      onClick={() => handleSelectBcvh(row.ma)}
                      className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#881337] hover:underline flex items-center gap-1">
                          <span>{row.ten}</span>
                          <span className="text-xs font-normal text-[#a8a29e]">· {row.ma}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {isNoData ? <span className="text-xs text-[#a8a29e] italic">chưa có dữ liệu</span> : row.san_luong?.buu_gui?.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {isNoData || row.so_hom_qua?.chenh_pct === null || row.so_hom_qua?.chenh_pct === undefined ? (
                          <span className="text-[#a8a29e]">—</span>
                        ) : (
                          <span className={row.so_hom_qua.chenh_pct >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                            {formatPctChange(row.so_hom_qua.chenh_pct)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {isNoData || row.so_tuan_truoc?.chenh_pct === null || row.so_tuan_truoc?.chenh_pct === undefined ? (
                          <span className="text-[#a8a29e]" title={lyDoChuaDanhGia(row.danh_gia_san_luong)}>—</span>
                        ) : (
                          <span className={row.so_tuan_truoc.chenh_pct >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                            {formatPctChange(row.so_tuan_truoc.chenh_pct)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {isNoData ? (
                          <span className="text-[#a8a29e]">—</span>
                        ) : row.chua_nhan?.buu_gui > 0 ? (
                          <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            {row.chua_nhan.buu_gui.toLocaleString('vi-VN')}
                          </span>
                        ) : (
                          <span className="text-[#78716c]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {isNoData ? (
                          <span className="text-[#a8a29e]">—</span>
                        ) : (
                          <span>
                            {row.bd10_chua_xnd?.so} / {row.bd10_chua_xnd?.tong}
                            {row.bd10_chua_xnd?.ty_le !== null && ` · ${formatPercent(row.bd10_chua_xnd?.ty_le)}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isNoData || !row.muc ? (
                          <span className="text-[#a8a29e] text-xs">—</span>
                        ) : row.muc === 'xu_ly_ngay' ? (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-100 text-red-700 border border-red-200">
                            Xử lý ngay
                          </span>
                        ) : row.muc === 'trong_ngay' ? (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Trong ngày
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Bình thường
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-[#78716c] italic">
            Mức đánh giá do hệ thống tính từ sản lượng so với cùng thứ tuần trước, bưu gửi chưa nhận và BD10 chưa XNĐ. Ngưỡng đang là tạm thời.
          </p>
        </div>
      )}

      {/* 7. KHỐI «CHƯA NHẬN TẠI BCVH, ĐÃ CHỜ BAO LÂU?» */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#292524]">
              {isAllView ? 'Bưu gửi chưa nhận tại BCVH, đã chờ bao lâu?' : `Chưa nhận tại ${currentBcvhObj?.ten || selectedBcvh}`}
            </h3>
            <p className="text-xs text-[#78716c] mt-0.5">
              Phân loại theo thời gian chờ. <span className="font-bold text-amber-700">Chia theo giờ: sắp có</span>
            </p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate({
                tab: 'arrivals',
                bcvh: !isAllView ? selectedBcvh : undefined,
                showNotReceivedDetail: true
              })}
              className="text-xs font-bold text-[#881337] hover:underline flex items-center gap-1"
            >
              <span>Xem danh sách bưu gửi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isAllView ? (
          // BỐ CỤC BẢNG 5: THANH TỪNG BCVH
          <div className="space-y-3">
            {tongQuan?.theo_bcvh?.map((row) => {
              const cn = row.chua_nhan;
              const tongCn = cn?.buu_gui || 0;
              const tu1Ngay = cn?.cho_tu_1_ngay || 0;
              const trongNgay = Math.max(0, tongCn - tu1Ngay);
              const pTrongNgay = tongCn > 0 ? (trongNgay / tongCn) * 100 : 0;
              const pTu1Ngay = tongCn > 0 ? (tu1Ngay / tongCn) * 100 : 0;

              return (
                <div key={row.ma} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#fafaf9] border border-[#e7e5e4]">
                  <div className="w-44 shrink-0 font-bold text-sm text-[#292524]">
                    {row.ten}
                  </div>
                  
                  {/* THANH PHÂN BỐ */}
                  <div className="flex-1 flex items-center gap-2">
                    {tongCn === 0 ? (
                      <div className="h-6 w-full bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400 italic">
                        0 bưu gửi
                      </div>
                    ) : (
                      <div className="h-6 w-full bg-gray-200 rounded-lg overflow-hidden flex font-bold text-[11px] text-white">
                        {trongNgay > 0 && (
                          <div 
                            style={{ width: `${pTrongNgay}%` }} 
                            className="bg-amber-500 flex items-center justify-center px-1"
                            title={`Trong ngày: ${trongNgay} bưu gửi`}
                          >
                            {trongNgay}
                          </div>
                        )}
                        {tu1Ngay > 0 && (
                          <div 
                            style={{ width: `${pTu1Ngay}%` }} 
                            className="bg-red-600 flex items-center justify-center px-1"
                            title={`Từ 1 ngày trở lên: ${tu1Ngay} bưu gửi`}
                          >
                            {tu1Ngay}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* THÔNG TIN TỔNG & NÚT */}
                  <div className="w-48 shrink-0 flex items-center justify-end gap-3 text-right">
                    <div>
                      <span className="font-bold text-sm text-[#292524]">{tongCn} BG</span>
                      {tu1Ngay > 0 && cn?.cho_lau_nhat_ngay !== null && (
                        <span className="text-[11px] text-red-600 block">cũ nhất {cn.cho_lau_nhat_ngay} ngày</span>
                      )}
                    </div>
                    <button
                      onClick={() => onNavigate && onNavigate({
                        tab: 'arrivals',
                        bcvh: row.ma,
                        showNotReceivedDetail: true
                      })}
                      className="text-xs font-semibold text-[#881337] hover:underline whitespace-nowrap"
                    >
                      Xem →
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 text-xs text-[#78716c] pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-amber-500 rounded-sm" />
                <span>Trong ngày</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-600 rounded-sm" />
                <span>Từ 1 ngày trở lên (cần xử lý ngay)</span>
              </div>
            </div>
          </div>
        ) : (
          // BỐ CỤC BẢNG 7: DẠNG 4 Ô LỚN / TÓM TẮT DỄ HIỂU CHO GĐ BCVH
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-900 font-medium">
              {currentBcvhObj?.ten || selectedBcvh} còn <strong className="text-base text-red-700">{currentBcvhRow?.chua_nhan?.buu_gui || 0} bưu gửi</strong> chưa có xác nhận nhận tại BCVH. 
              {currentBcvhRow?.chua_nhan?.cho_tu_1_ngay > 0 ? (
                <span className="text-red-700 font-bold ml-1">Trong đó {currentBcvhRow.chua_nhan.cho_tu_1_ngay} bưu gửi đã chờ từ 1 ngày: cần xử lý ngay.</span>
              ) : (
                <span className="ml-1">Tất cả bưu gửi đều trong ngày.</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-white border border-gray-200 rounded-xl text-center shadow-sm">
                <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">DƯỚI 2 GIỜ</div>
                <div className="text-lg font-bold text-gray-400">Sắp có</div>
                <div className="text-[10px] text-gray-400">Chia theo giờ</div>
              </div>
              <div className="p-4 bg-white border border-gray-200 rounded-xl text-center shadow-sm">
                <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">2–4 GIỜ</div>
                <div className="text-lg font-bold text-gray-400">Sắp có</div>
                <div className="text-[10px] text-gray-400">Chia theo giờ</div>
              </div>
              <div className="p-4 bg-white border border-gray-200 rounded-xl text-center shadow-sm">
                <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">TRÊN 4 GIỜ</div>
                <div className="text-lg font-bold text-gray-400">Sắp có</div>
                <div className="text-[10px] text-gray-400">Chia theo giờ</div>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center shadow-sm">
                <div className="text-[11px] font-bold text-red-700 uppercase mb-1">TỪ 1 NGÀY</div>
                <div className="text-2xl font-black text-red-700">
                  {currentBcvhRow?.chua_nhan?.cho_tu_1_ngay || 0}
                </div>
                <div className="text-[10px] text-red-600 font-bold">Xử lý ngay</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 8. KHỐI «PHƯỜNG/XÃ SẢN LƯỢNG ĐẾN TĂNG MẠNH NHẤT HÔM NAY» */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-black text-[#292524]">
            Phường/xã sản lượng đến tăng mạnh nhất hôm nay
          </h3>
          <p className="text-xs text-[#78716c] mt-0.5">
            Chỉ tính sản lượng đến. Ba cột: hôm kia, hôm qua, hôm nay (cột cam đỏ). BG = bưu gửi. Chip bên phải: tăng so với hôm qua (đỏ nếu từ 20% trở lên, vàng nếu thấp hơn, xanh nếu giảm). Dòng nhỏ: so với trung bình 4 tuần cùng thứ.
          </p>
        </div>

        {phuongXa?.items?.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 bg-gray-50 rounded-xl">
            Chưa có phường/xã nào tăng đột biến hôm nay.
          </div>
        ) : (
          <div className="space-y-3">
            {phuongXa?.items?.map((item, idx) => {
              const maxVal = Math.max(item.hom_kia || 0, item.hom_qua || 0, item.hom_nay || 0, 1);
              const chip = wardChangeChip(item);

              return (
                <div 
                  key={`${item.ward_key}-${idx}`}
                  className="p-4 rounded-xl bg-[#fafaf9] border border-[#e7e5e4] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="w-52 shrink-0">
                    <div className="font-bold text-sm text-[#292524]">{item.ten || item.ward_key}</div>
                    {isAllView && (
                      <div className="text-xs text-[#78716c]">{item.ten_bcvh}</div>
                    )}
                  </div>

                  {/* 3 CỘT MINI CHART */}
                  <div className="flex items-end gap-3 h-14 shrink-0 px-2">
                    {/* Hôm kia */}
                    <div className="flex flex-col items-center justify-end h-full w-12">
                      <span className="text-[10px] text-gray-500 mb-1">{item.hom_kia !== null ? `${item.hom_kia} BG` : '—'}</span>
                      <div 
                        style={{ height: item.hom_kia !== null ? `${Math.max(15, (item.hom_kia / maxVal) * 36)}px` : '4px' }} 
                        className="w-full bg-[#93c5fd] rounded-t-sm"
                      />
                      <span className="text-[9px] text-gray-400 mt-0.5">hôm kia</span>
                    </div>

                    {/* Hôm qua */}
                    <div className="flex flex-col items-center justify-end h-full w-12">
                      <span className="text-[10px] text-gray-500 mb-1">{item.hom_qua !== null ? `${item.hom_qua} BG` : '—'}</span>
                      <div 
                        style={{ height: item.hom_qua !== null ? `${Math.max(15, (item.hom_qua / maxVal) * 36)}px` : '4px' }} 
                        className="w-full bg-[#3b82f6] rounded-t-sm"
                      />
                      <span className="text-[9px] text-gray-400 mt-0.5">hôm qua</span>
                    </div>

                    {/* Hôm nay */}
                    <div className="flex flex-col items-center justify-end h-full w-12">
                      <span className="text-[10px] font-bold text-[#ea580c] mb-1">{item.hom_nay} BG</span>
                      <div 
                        style={{ height: `${Math.max(15, (item.hom_nay / maxVal) * 36)}px` }} 
                        className="w-full bg-[#ea580c] rounded-t-sm"
                      />
                      <span className="text-[9px] font-bold text-[#ea580c] mt-0.5">hôm nay</span>
                    </div>
                  </div>

                  {/* CHIP TĂNG TRƯỞNG & DÒNG NHỎ SO TUẦN TRƯỚC */}
                  <div className="sm:text-right shrink-0">
                    <div>
                      {chip.loai === 'moi_co' ? (
                        // Chưa có hôm qua để so sánh
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                          {chip.text}
                        </span>
                      ) : (
                        // Bằng 0: xám, không mũi tên; giảm: xanh; tăng: đỏ nếu ≥ 20%, vàng nếu < 20%
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full inline-flex items-center gap-1 border ${{
                          bang: 'bg-gray-100 text-gray-500 border-gray-300',
                          giam: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                          tang_cao: 'bg-rose-100 text-rose-700 border-rose-300',
                          tang: 'bg-amber-100 text-amber-800 border-amber-300'
                        }[chip.loai]}`}>
                          {chip.text}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#78716c] mt-1">
                      {item.tuan_truoc_cung_gio !== null && item.tuan_truoc_cung_gio !== undefined ? (
                        <span>so tuần trước ({item.tuan_truoc_cung_gio} BG): {formatPctChange(item.lech_so_tuan_truoc_pct)}</span>
                      ) : (
                        <span>so tuần trước: chưa đủ dữ liệu</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
