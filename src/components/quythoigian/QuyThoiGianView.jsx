import React, { useState, useEffect, useCallback, useRef } from 'react';
import QuyThoiGianOverview from './QuyThoiGianOverview';
import QuyThoiGianLuotView from './QuyThoiGianLuotView';
import {
  fetchQuyThoiGianTongHop,
  fetchQuyThoiGianTheoNgay,
  fetchQuyThoiGianLuyKe,
  fetchExportScope
} from './quyThoiGianApi';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive
} from './quyThoiGianFormatters';

export default function QuyThoiGianView({ authUser }) {
  // Chế độ màn hình: 'overview' (Màn 1: Tổng quan) | 'luot' (Màn 2: Danh sách bưu gửi)
  const [currentScreen, setCurrentScreen] = useState('overview');

  // Khoảng ngày đang chọn (mặc định hôm nay theo giờ VN, Từ = Đến)
  const [dateRange, setDateRange] = useState(() => {
    const today = getTodayVnYmd();
    return { from: today, to: today };
  });

  // Lỗi kiểm tra tính hợp lệ của khoảng ngày
  const [validationError, setValidationError] = useState(null);

  // BCVH đang chọn (mặc định 'all' cho ADMIN/TTVH, GDVH sẽ cập nhật sau khi nạp scope)
  const [selectedBcvh, setSelectedBcvh] = useState('all');

  // Dữ liệu Màn 1 (Khoảng ngày)
  const [overviewData, setOverviewData] = useState(null);
  const [recentDaysData, setRecentDaysData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Dữ liệu Lũy kế tháng (Độc lập với khoảng ngày, chỉ đổi khi đổi BCVH)
  const [luyKeData, setLuyKeData] = useState(null);
  const [luyKeLoading, setLuyKeLoading] = useState(false);
  const [luyKeError, setLuyKeError] = useState(null);

  // Bộ lọc truyền từ Màn 1 sang Màn 2 (ví dụ bấm xem đường thư hoặc lý do không đo được)
  const [luotFilters, setLuotFilters] = useState({});

  // Request ID ref để chống stale request khi đổi khoảng ngày liên tục
  const overviewReqIdRef = useRef(0);
  const luyKeReqIdRef = useRef(0);

  // 1. Phân quyền BCVH ban đầu cho GDVH
  useEffect(() => {
    let active = true;
    if (authUser?.role === 'GDVH') {
      fetchExportScope()
        .then((res) => {
          if (!active) return;
          if (res.ok && res.data?.bcvh?.length > 0) {
            setSelectedBcvh(res.data.bcvh[0].ma);
          } else {
            setSelectedBcvh('all');
          }
        })
        .catch(() => {
          if (active) setSelectedBcvh('all');
        });
    }
    return () => {
      active = false;
    };
  }, [authUser?.role]);

  // 2. Validate khoảng ngày
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return 'Khoảng thời gian tối đa 31 ngày.';
    return null;
  }, []);

  // 3. Tải dữ liệu Màn 1 theo khoảng ngày (/tong-hop & /theo-ngay)
  const loadOverview = useCallback(async () => {
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) {
      setLoading(false);
      return;
    }

    const currentReqId = ++overviewReqIdRef.current;
    setLoading(true);
    setError(null);

    // Tính khoảng cho theo-ngay:
    // Nếu khoảng đúng 1 ngày (from === to): lấy 7 ngày tính đến ngày đó
    // Nếu khoảng >= 2 ngày: lấy đúng các ngày trong khoảng
    const isSingleDay = dateRange.from === dateRange.to;
    const theoNgayFrom = isSingleDay ? shiftDay(dateRange.to, -6) : dateRange.from;
    const theoNgayTo = dateRange.to;

    try {
      const [tongHopRes, theoNgayRes] = await Promise.all([
        fetchQuyThoiGianTongHop({
          from: dateRange.from,
          to: dateRange.to,
          receiver_code: selectedBcvh,
        }),
        fetchQuyThoiGianTheoNgay({
          from: theoNgayFrom,
          to: theoNgayTo,
          receiver_code: selectedBcvh,
        }),
      ]);

      // Nếu đã có request mới hơn thì bỏ qua kết quả này
      if (currentReqId !== overviewReqIdRef.current) return;

      if (tongHopRes.ok) {
        setOverviewData(tongHopRes.data);
      } else {
        setError(tongHopRes.error || 'Không tải được số liệu tổng hợp.');
        setOverviewData(null);
      }

      if (theoNgayRes.ok) {
        setRecentDaysData(theoNgayRes.data);
      } else {
        setRecentDaysData(null);
      }
    } catch (err) {
      if (currentReqId !== overviewReqIdRef.current) return;
      setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
      setOverviewData(null);
    } finally {
      if (currentReqId === overviewReqIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, selectedBcvh, validateRange]);

  // Kích hoạt loadOverview khi đổi khoảng ngày hoặc BCVH
  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // 4. Tải dữ liệu Lũy kế tháng (/luy-ke)
  // CHỈ gọi khi đổi BCVH, khi mở màn hoặc khi bấm Thử lại (KHÔNG phụ thuộc khoảng ngày)
  const loadLuyKe = useCallback(async () => {
    const currentReqId = ++luyKeReqIdRef.current;
    setLuyKeLoading(true);
    setLuyKeError(null);

    try {
      const res = await fetchQuyThoiGianLuyKe({
        receiver_code: selectedBcvh,
      });

      if (currentReqId !== luyKeReqIdRef.current) return;

      if (res.ok) {
        setLuyKeData(res.data);
      } else {
        setLuyKeError(res.error || 'Không tải được lũy kế tháng.');
      }
    } catch (err) {
      if (currentReqId !== luyKeReqIdRef.current) return;
      setLuyKeError(err?.message || 'Lỗi kết nối khi tải lũy kế.');
    } finally {
      if (currentReqId === luyKeReqIdRef.current) {
        setLuyKeLoading(false);
      }
    }
  }, [selectedBcvh]);

  // Kích hoạt loadLuyKe khi đổi BCVH hoặc mở màn
  useEffect(() => {
    loadLuyKe();
  }, [loadLuyKe]);

  // Cập nhật khoảng ngày từ component con
  const handleChangeDateRange = (newRange) => {
    setDateRange(newRange);
  };

  // Chuyển sang Màn 2 (Danh sách bưu gửi)
  const handleNavigateToLuot = (filters = {}) => {
    setLuotFilters(filters);
    setCurrentScreen('luot');
  };

  // Quay lại Màn 1 (Tổng quan)
  const handleBackToOverview = () => {
    setCurrentScreen('overview');
  };

  return (
    <div className="w-full">
      {currentScreen === 'overview' ? (
        <QuyThoiGianOverview
          dateRange={dateRange}
          onChangeDateRange={handleChangeDateRange}
          selectedBcvh={selectedBcvh}
          onChangeBcvh={setSelectedBcvh}
          data={overviewData}
          recentDaysData={recentDaysData}
          luyKeData={luyKeData}
          luyKeLoading={luyKeLoading}
          luyKeError={luyKeError}
          loading={loading}
          error={error}
          validationError={validationError}
          onRetry={loadOverview}
          onRetryLuyKe={loadLuyKe}
          onNavigateToLuot={handleNavigateToLuot}
        />
      ) : (
        <QuyThoiGianLuotView
          dateRange={dateRange}
          onChangeDateRange={handleChangeDateRange}
          selectedBcvh={selectedBcvh}
          onChangeBcvh={setSelectedBcvh}
          initialFilters={luotFilters}
          summaryData={overviewData}
          onBackToOverview={handleBackToOverview}
        />
      )}
    </div>
  );
}
