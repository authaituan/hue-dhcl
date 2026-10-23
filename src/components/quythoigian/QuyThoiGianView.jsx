import React, { useState, useEffect, useCallback, useMemo } from 'react';
import QuyThoiGianOverview from './QuyThoiGianOverview';
import QuyThoiGianLuotView from './QuyThoiGianLuotView';
import {
  fetchQuyThoiGianTongHop,
  fetchQuyThoiGianTheoNgay,
  fetchExportScope
} from './quyThoiGianApi';

/**
 * Lấy ngày hôm nay theo múi giờ Việt Nam dạng YYYY-MM-DD
 */
function getTodayVnYmd() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return formatter.format(d);
}

/**
 * Tính ngày trước hoặc sau n ngày từ chuỗi YYYY-MM-DD
 */
function shiftDay(ymd, offsetDays) {
  if (!ymd) return getTodayVnYmd();
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export default function QuyThoiGianView({ authUser }) {
  // Chế độ màn hình: 'overview' (Màn 1: Tổng quan) | 'luot' (Màn 2: Danh sách bưu gửi)
  const [currentScreen, setCurrentScreen] = useState('overview');

  // Ngày đang chọn (mặc định hôm nay theo giờ VN)
  const [selectedDate, setSelectedDate] = useState(getTodayVnYmd);

  // BCVH đang chọn (mặc định 'all' cho ADMIN/TTVH, GDVH sẽ cập nhật sau khi nạp scope)
  const [selectedBcvh, setSelectedBcvh] = useState('all');

  // Dữ liệu Màn 1
  const [overviewData, setOverviewData] = useState(null);
  const [recentDaysData, setRecentDaysData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Bộ lọc truyền từ Màn 1 sang Màn 2 (ví dụ bấm xem đường thư hoặc lý do không đo được)
  const [luotFilters, setLuotFilters] = useState({});

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

  // 2. Tải dữ liệu Màn 1 (Tổng quan & 7 ngày gần đây)
  const loadOverview = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);

    // Tính 7 ngày gần đây: to = selectedDate, from = selectedDate - 6 ngày
    const from7Days = shiftDay(selectedDate, -6);

    try {
      const [tongHopRes, theoNgayRes] = await Promise.all([
        fetchQuyThoiGianTongHop({
          from: selectedDate,
          to: selectedDate,
          receiver_code: selectedBcvh,
        }),
        fetchQuyThoiGianTheoNgay({
          from: from7Days,
          to: selectedDate,
          receiver_code: selectedBcvh,
        }),
      ]);

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
      setError(err?.message || 'Lỗi kết nối khi tải dữ liệu.');
      setOverviewData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedBcvh]);

  useEffect(() => {
    let active = true;
    loadOverview();
    return () => {
      active = false;
    };
  }, [loadOverview]);

  // Điều hướng ngày: Lùi 1 ngày
  const handlePrevDate = () => {
    setSelectedDate((prev) => shiftDay(prev, -1));
  };

  // Điều hướng ngày: Tiến 1 ngày
  const handleNextDate = () => {
    setSelectedDate((prev) => shiftDay(prev, 1));
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
          selectedDate={selectedDate}
          onChangeDate={setSelectedDate}
          onPrevDate={handlePrevDate}
          onNextDate={handleNextDate}
          selectedBcvh={selectedBcvh}
          onChangeBcvh={setSelectedBcvh}
          data={overviewData}
          recentDaysData={recentDaysData}
          loading={loading}
          error={error}
          onRetry={loadOverview}
          onNavigateToLuot={handleNavigateToLuot}
        />
      ) : (
        <QuyThoiGianLuotView
          selectedDate={selectedDate}
          selectedBcvh={selectedBcvh}
          initialFilters={luotFilters}
          summaryData={overviewData}
          onBackToOverview={handleBackToOverview}
        />
      )}
    </div>
  );
}
