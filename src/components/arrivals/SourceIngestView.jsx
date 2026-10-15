import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import {
  getVnTodayYmd,
  addDaysYmd,
  formatUtcToVnDateTime,
  formatNumber
} from '../../utils/sourceIngest';
import SourceIngestStatus from './SourceIngestStatus';
import SourceIngestAttention from './SourceIngestAttention';
import SourceIngestGrid from './SourceIngestGrid';
import SourceIngestRuns from './SourceIngestRuns';
import SourceIngestCellPanel from './SourceIngestCellPanel';
import SourceIngestErrorBoundary from './SourceIngestErrorBoundary';

export default function SourceIngestView({ authUser, onNavigateReplaceDay }) {
  const todayStr = getVnTodayYmd();
  const [tu, setTu] = useState(() => addDaysYmd(todayStr, -6));
  const [den, setDen] = useState(() => todayStr);
  const [selectedBcvh, setSelectedBcvh] = useState('');

  // Dữ liệu API
  const [overviewData, setOverviewData] = useState(null);
  const [gridData, setGridData] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  // Trigger làm mới danh sách lượt chạy
  const [runsRefreshTrigger, setRunsRefreshTrigger] = useState(0);

  // Ô được chọn để xem chi tiết (Mục C)
  const [selectedCellParams, setSelectedCellParams] = useState(null);

  const [trackingRun, setTrackingRun] = useState(null); // { id, bat_dau, loai, da_co_nhap_tay }
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccessSummary, setActionSuccessSummary] = useState(null);
  const [reviewNotice, setReviewNotice] = useState(null);

  const handleReviewNotify = useCallback((msg) => {
    setReviewNotice(msg);
    setTimeout(() => {
      setReviewNotice((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const trackingTimerRef = useRef(null);
  const autoRefreshTimerRef = useRef(null);

  // ==========================================
  // NẠP DỮ LIỆU TỔNG QUAN VÀ LƯỚI
  // ==========================================
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await apiFetchJson('/api/nap-nguon/tong-quan');
      if (res.ok) {
        setOverviewData(res.data);
      }
    } catch (e) {
      // bỏ qua lỗi âm thầm
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchGrid = useCallback(async (currentTu, currentDen, currentBcvh) => {
    setLoadingGrid(true);
    setGlobalError(null);
    try {
      const qs = new URLSearchParams({
        tu: currentTu,
        den: currentDen,
        ...(currentBcvh ? { bcvh: currentBcvh } : {})
      }).toString();
      const res = await apiFetchJson(`/api/nap-nguon/luoi?${qs}`);
      if (res.ok) {
        setGridData(res.data);
      } else {
        const errText = typeof res.error === 'string' ? res.error : (res.data?.error || 'Có lỗi khi nạp dữ liệu lưới.');
        setGlobalError(errText);
      }
    } catch (e) {
      setGlobalError('Lỗi kết nối khi nạp dữ liệu lưới.');
    } finally {
      setLoadingGrid(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchOverview();
    fetchGrid(tu, den, selectedBcvh);
    setRunsRefreshTrigger((prev) => prev + 1);
  }, [fetchOverview, fetchGrid, tu, den, selectedBcvh]);

  // Nạp lần đầu
  useEffect(() => {
    fetchOverview();
    fetchGrid(tu, den, selectedBcvh);
  }, []);

  // Tự động làm mới mỗi 60 giây (tạm dừng khi tab ẩn)
  useEffect(() => {
    const handleInterval = () => {
      if (document.hidden) return;
      fetchOverview();
      fetchGrid(tu, den, selectedBcvh);
    };

    autoRefreshTimerRef.current = setInterval(handleInterval, 60000);
    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [fetchOverview, fetchGrid, tu, den, selectedBcvh]);

  // Thay đổi bộ lọc lưới
  const handleApplyFilter = (newTu, newDen, newBcvh) => {
    setTu(newTu);
    setDen(newDen);
    setSelectedBcvh(newBcvh);
    fetchGrid(newTu, newDen, newBcvh);
  };

  // ==========================================
  // XỬ LÝ THEO DÕI LƯỢT CHẠY SAU KHI BẤM
  // ==========================================
  const startTrackingRun = (runId, startTime, loai, daCoNhapTay = false) => {
    setTrackingRun({ id: runId, bat_dau: startTime, loai, da_co_nhap_tay: daCoNhapTay });
    let attempts = 0;
    const maxAttempts = 200; // 200 * 3s = 600s = 10 phút

    if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);

    trackingTimerRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await apiFetchJson('/api/nap-nguon/tong-quan');
        if (res.ok) {
          setOverviewData(res.data);
          const dangChay = res.data?.dang_chay;

          // Nếu lượt đã chạy xong (dang_chay là null) hoặc quá 10 phút
          if (!dangChay || attempts >= maxAttempts) {
            clearInterval(trackingTimerRef.current);
            trackingTimerRef.current = null;
            setTrackingRun(null);

            // Gọi GET /api/nap-nguon/luot/:id một lần để lấy tóm tắt kết quả
            try {
              const runRes = await apiFetchJson(`/api/nap-nguon/luot/${runId}`);
              if (runRes.ok) {
                setActionSuccessSummary({
                  run: runRes.data,
                  da_co_nhap_tay: daCoNhapTay
                });
              }
            } catch (_) {}

            // Làm mới lại toàn bộ
            refreshAll();
          }
        }
      } catch (e) {
        // bỏ qua lỗi trong lúc poll
      }
    }, 3000);
  };

  // Dọn timer khi rời màn
  useEffect(() => {
    return () => {
      if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    };
  }, []);

  // Xử lý nút «Lấy ngay»
  const handleTriggerLayNgay = async () => {
    setIsExecutingAction(true);
    setActionError(null);
    setActionSuccessSummary(null);
    try {
      const res = await apiFetchJson('/api/nap-nguon/lay-ngay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res.ok) {
        startTrackingRun(res.data?.luot_id, res.data?.bat_dau, 'LAY_NGAY');
      } else {
        handleActionError(res);
      }
    } catch (e) {
      setActionError('Lỗi kết nối khi gửi yêu cầu lấy ngay.');
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Xử lý nút «Lấy lại»
  const handleTriggerLayLai = async (items) => {
    if (!items || items.length === 0) return;
    setIsExecutingAction(true);
    setActionError(null);
    setActionSuccessSummary(null);
    try {
      const payload = {
        o: items.map((i) => ({
          bcvh: i.bcvh,
          ngay: i.ngay,
          dot: i.dot
        }))
      };
      const res = await apiFetchJson('/api/nap-nguon/lay-lai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const hasNhapTayFlag = (res.data?.o || []).some((o) => o && o.da_co_nhap_tay);
        startTrackingRun(res.data?.luot_id, res.data?.bat_dau, 'LAY_LAI', hasNhapTayFlag);
      } else {
        handleActionError(res);
      }
    } catch (e) {
      setActionError('Lỗi kết nối khi gửi yêu cầu lấy lại.');
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleActionError = (res) => {
    if (res.status === 409) {
      if (res.data?.ma === 'DANG_CHAY') {
        setActionError('Đang có lượt chạy khác, vui lòng thực hiện lại sau.');
        return;
      }
      if (res.data?.ma === 'TAM_DUNG') {
        const lyDo = res.data?.ly_do;
        if (lyDo === 'XAC_THUC') {
          setActionError('Máy chủ nguồn từ chối thông tin đăng nhập. Hệ thống đã dừng thử lại để tránh bị khóa. Nhờ quản trị cập nhật thông tin đăng nhập trong cấu hình rồi khởi động lại máy chủ.');
        } else if (lyDo === 'VAN_TAY') {
          setActionError('Không xác minh được máy chủ nguồn: khóa bảo mật khác với khóa đã lưu. Hệ thống đã dừng thử lại để tránh bị chặn. Nhờ quản trị NAS xác nhận khóa mới, cập nhật cấu hình rồi khởi động lại máy chủ.');
        } else {
          setActionError('Hệ thống đã tạm dừng tự động lấy dữ liệu. Báo quản trị hệ thống.');
        }
        return;
      }
    }
    if (res.status === 503) {
      setActionError('Chưa cấu hình nguồn dữ liệu; báo quản trị hệ thống.');
      return;
    }
    const errText = typeof res.data?.error === 'string' ? res.data.error : (typeof res.error === 'string' ? res.error : 'Có lỗi xảy ra khi thực hiện thao tác.');
    setActionError(errText);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* TIÊU ĐỀ VIEW */}
      <div className="card-soft p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 uppercase tracking-wide">
              ADMIN ONLY
            </span>
            <h2 className="text-xl font-bold text-[--color-title] flex items-center gap-2">
              <Server className="w-5 h-5 text-orange-500" />
              <span>Nạp dữ liệu nguồn</span>
            </h2>
          </div>
          <p className="text-xs text-[--color-body] mt-1.5 leading-relaxed max-w-3xl">
            Theo dõi việc tự động lấy file từ máy chủ nguồn, phát hiện đợt thiếu/lỗi/nghi ngờ, bấm «Lấy ngay» và «Lấy lại».
          </p>
        </div>
      </div>

      {/* BANNER THÔNG BÁO LỖI HÀNH ĐỘNG NẾU CÓ */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{actionError}</div>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BANNER ĐANG THEO DÕI LƯỢT CHẠY */}
      {trackingRun && (
        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-300 text-xs text-orange-900 flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-orange-600 animate-spin shrink-0" />
            <span className="font-semibold">
              Đang lấy dữ liệu (lượt #{trackingRun.id})… Hệ thống đang tự động cập nhật kết quả.
            </span>
          </div>
          <span className="text-[11px] text-orange-700 font-mono">
            Bắt đầu: {typeof trackingRun.bat_dau === 'string' ? formatUtcToVnDateTime(trackingRun.bat_dau) : '—'}
          </span>
        </div>
      )}

      {/* BANNER TÓM TẮT KẾT QUẢ SAU KHI LƯỢT CHẠY XONG */}
      {actionSuccessSummary && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">
                Lượt #{actionSuccessSummary.run?.id} hoàn thành: {actionSuccessSummary.run?.ket_qua === 'THANH_CONG' ? 'Thành công' : 'Có lỗi'}
              </div>
              <div className="text-[11px] text-emerald-800">
                Đã nạp: <strong>{formatNumber(actionSuccessSummary.run?.da_nap)}</strong> tệp · Đã có: <strong>{formatNumber(actionSuccessSummary.run?.da_co)}</strong> · Lỗi: <strong>{formatNumber(actionSuccessSummary.run?.loi)}</strong>
                {actionSuccessSummary.da_co_nhap_tay && (
                  <span className="ml-2 font-semibold text-amber-800">
                    (Có đợt đã có dữ liệu nhập tay: chỉ thêm các dòng mới từ nguồn)
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessSummary(null)}
            className="px-3 py-1 bg-white border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-800 hover:bg-emerald-100/50 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* BANNER THÔNG BÁO XEM XÉT */}
      {reviewNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{reviewNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setReviewNotice(null)}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MỤC A. TÌNH TRẠNG CHUNG */}
      <SourceIngestStatus
        data={overviewData}
        loading={loadingOverview}
        onRefresh={refreshAll}
        onTriggerLayNgay={handleTriggerLayNgay}
        isPolling={Boolean(trackingRun)}
      />

      {/* MỤC B0. NGÀY BỊ THIẾU CẦN XỬ LÝ */}
      <SourceIngestAttention
        items={Array.isArray(gridData?.can_xu_ly) ? gridData.can_xu_ly : []}
        bcvhList={Array.isArray(gridData?.ds_bcvh) ? gridData.ds_bcvh : []}
        daXemXetList={Array.isArray(gridData?.da_xem_xet) ? gridData.da_xem_xet : []}
        daXemXetCount={typeof gridData?.tong_hop?.da_xem_xet === 'number' ? gridData.tong_hop.da_xem_xet : (Array.isArray(gridData?.da_xem_xet) ? gridData.da_xem_xet.length : 0)}
        onTriggerLayLai={handleTriggerLayLai}
        onNavigateReplaceDay={onNavigateReplaceDay}
        isExecuting={isExecutingAction || Boolean(trackingRun)}
        onRefresh={refreshAll}
        onNotify={handleReviewNotify}
      />

      {/* MỤC F. LƯỚI THEO NGÀY (BỌC ERROR BOUNDARY) */}
      <SourceIngestErrorBoundary>
        <SourceIngestGrid
          gridData={gridData}
          tu={tu}
          den={den}
          selectedBcvh={selectedBcvh}
          onApplyFilter={handleApplyFilter}
          onSelectCell={(cell) => setSelectedCellParams(cell)}
          loading={loadingGrid}
        />
      </SourceIngestErrorBoundary>

      {/* MỤC D. CÁC LƯỢT LẤY GẦN ĐÂY (BỌC ERROR BOUNDARY) */}
      <SourceIngestErrorBoundary>
        <SourceIngestRuns
          onNavigateReplaceDay={onNavigateReplaceDay}
          refreshTrigger={runsRefreshTrigger}
        />
      </SourceIngestErrorBoundary>

      {/* MỤC C. KHUNG CHI TIẾT MỘT Ô (BỌC ERROR BOUNDARY) */}
      {selectedCellParams && (
        <SourceIngestErrorBoundary
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4 text-center">
                <p className="text-xs text-gray-700 font-medium">
                  Không hiển thị được phần này. Tải lại trang hoặc báo quản trị.
                </p>
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCellParams(null)}
                    className="px-5 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          }
        >
          <SourceIngestCellPanel
            cellParams={selectedCellParams}
            daXemXetList={Array.isArray(gridData?.da_xem_xet) ? gridData.da_xem_xet : []}
            bcvhList={Array.isArray(gridData?.ds_bcvh) ? gridData.ds_bcvh : []}
            onClose={() => setSelectedCellParams(null)}
            onTriggerLayLai={handleTriggerLayLai}
            onNavigateReplaceDay={onNavigateReplaceDay}
            isExecuting={isExecutingAction || Boolean(trackingRun)}
            onRefresh={refreshAll}
            onNotify={handleReviewNotify}
          />
        </SourceIngestErrorBoundary>
      )}
    </div>
  );
}
