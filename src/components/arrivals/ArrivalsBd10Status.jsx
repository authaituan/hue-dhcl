import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, ArrowRight, X } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';

const formatDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const formatDayMonth = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}`;
};

const pct = (n) => {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

export default function ArrivalsBd10Status({ filters, onShowDetail, bcvhList }) {
  const fromDate = filters?.from?.slice(0, 10);
  const toDate = filters?.to?.slice(0, 10);
  const receiverCodes = filters?.receiver_code || [];

  // 1. Kiểm tra điều kiện: Đúng 1 BCVH
  const isSingleUnit = receiverCodes.length === 1;

  // 2. Kiểm tra điều kiện: Khung ngày <= 92 ngày
  const dayCount = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const f = new Date(fromDate);
    const t = new Date(toDate);
    return Math.round((t - f) / (1000 * 60 * 60 * 24)) + 1;
  }, [fromDate, toDate]);

  const isOverMaxDays = dayCount > 92;

  // State dữ liệu
  const [byDayData, setByDayData] = useState(null);
  const [byPostOfficeData, setByPostOfficeData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingPostOffice, setLoadingPostOffice] = useState(false);
  const [errorDay, setErrorDay] = useState(null);
  const [errorPostOffice, setErrorPostOffice] = useState(null);

  // Gọi API theo-buu-cuc-lap cho ngày chỉ định hoặc cả khung
  const fetchByPostOffice = async (targetDate, rCode) => {
    setLoadingPostOffice(true);
    setErrorPostOffice(null);
    try {
      const q = new URLSearchParams();
      if (targetDate) {
        q.set('from', targetDate);
        q.set('to', targetDate);
      } else {
        q.set('from', fromDate);
        q.set('to', toDate);
      }
      q.set('receiver_code', rCode);

      const res = await apiFetchJson(`/api/arrivals/bd10-trang-thai/theo-buu-cuc-lap?${q.toString()}`);
      if (res.ok) {
        setByPostOfficeData(res.data);
      } else {
        setErrorPostOffice(res.error || 'Lỗi tải dữ liệu theo bưu cục lập');
      }
    } catch (err) {
      setErrorPostOffice('Lỗi kết nối khi tải dữ liệu theo bưu cục lập');
    } finally {
      setLoadingPostOffice(false);
    }
  };

  // Khi bộ lọc BCVH / khung ngày thay đổi và bấm "Áp dụng": tải theo-ngay
  useEffect(() => {
    if (!isSingleUnit || isOverMaxDays) {
      setByDayData(null);
      setByPostOfficeData(null);
      setSelectedDate(null);
      return;
    }

    let isMounted = true;
    const loadDayData = async () => {
      setLoadingDay(true);
      setErrorDay(null);
      try {
        const q = new URLSearchParams();
        q.set('from', fromDate);
        q.set('to', toDate);
        q.set('receiver_code', receiverCodes[0]);

        const res = await apiFetchJson(`/api/arrivals/bd10-trang-thai/theo-ngay?${q.toString()}`);
        if (!isMounted) return;

        if (res.ok) {
          const data = res.data;
          setByDayData(data);

          // Xác định ngày mặc định
          const latest = data.ngay_du_lieu_moi_nhat;
          const isLatestInRange = latest && latest >= fromDate && latest <= toDate;
          const defaultDate = isLatestInRange ? latest : null;

          setSelectedDate(defaultDate);

          // Gọi theo-buu-cuc-lap với ngày mặc định
          fetchByPostOffice(defaultDate, receiverCodes[0]);
        } else {
          setErrorDay(res.error || 'Lỗi tải dữ liệu trạng thái BD10');
          setByDayData(null);
        }
      } catch (err) {
        if (isMounted) {
          setErrorDay('Lỗi kết nối khi tải dữ liệu trạng thái BD10');
          setByDayData(null);
        }
      } finally {
        if (isMounted) setLoadingDay(false);
      }
    };

    loadDayData();

    return () => {
      isMounted = false;
    };
  }, [fromDate, toDate, receiverCodes[0], isSingleUnit, isOverMaxDays]);

  // Handler khi click chọn/bỏ chọn ngày trên biểu đồ cột
  const handleToggleDate = (day) => {
    if (selectedDate === day) {
      // Bấm lại đúng cột đó -> về cả khung
      setSelectedDate(null);
      fetchByPostOffice(null, receiverCodes[0]);
    } else {
      // Chọn ngày mới -> chỉ gọi lại theo-buu-cuc-lap với from = to = day
      setSelectedDate(day);
      fetchByPostOffice(day, receiverCodes[0]);
    }
  };

  // Handler khi bấm nút bỏ chọn (✕) hoặc "Xem cả khung..."
  const handleClearSelectedDate = () => {
    setSelectedDate(null);
    fetchByPostOffice(null, receiverCodes[0]);
  };

  // ==========================================
  // Render điều kiện thông báo khi chưa thoả mãn
  // ==========================================

  if (!isSingleUnit) {
    return (
      <div className="bg-white rounded-[14px] border border-[#e7e5e4] p-10 text-center text-[#57534e]">
        <p className="text-[15px] font-medium">Chọn một BCVH để xem trạng thái BD10 đến.</p>
      </div>
    );
  }

  if (isOverMaxDays) {
    return (
      <div className="bg-white rounded-[14px] border border-[#e7e5e4] p-10 text-center text-[#57534e]">
        <p className="text-[15px] font-medium">Khung ngày tối đa 92 ngày để xem trạng thái BD10 đến.</p>
      </div>
    );
  }

  if (loadingDay) {
    return (
      <div className="flex items-center justify-center h-64 text-[#78716c]">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (errorDay) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 rounded-[14px] p-6 text-center text-[14px]">
        {errorDay}
      </div>
    );
  }

  if (!byDayData || byDayData.ngay_du_lieu_moi_nhat === null || !byDayData.theo_ngay || byDayData.theo_ngay.length === 0) {
    return (
      <div className="bg-white rounded-[14px] border border-[#e7e5e4] p-10 text-center text-[#57534e]">
        <p className="text-[15px] font-medium">Chưa có dữ liệu BD10 đến cho BCVH này trong khung ngày.</p>
      </div>
    );
  }

  // ==========================================
  // Tính toán số liệu 4 thẻ
  // ==========================================
  const isAllRange = selectedDate === null;
  const currentStats = isAllRange 
    ? byDayData.tong 
    : (byDayData.theo_ngay.find(d => d.ngay === selectedDate) || { tong: 0, da_xnd: 0, chua_xnd: 0, ty_le_chua_xnd: null });

  // So sánh ngày liền trước khi xem một ngày
  let compResult = null;
  if (!isAllRange) {
    const currentIndex = byDayData.theo_ngay.findIndex(d => d.ngay === selectedDate);
    const prevItem = currentIndex > 0 ? byDayData.theo_ngay[currentIndex - 1] : null;

    if (prevItem && prevItem.tong > 0) {
      if (currentStats.tong > 0 && currentStats.ty_le_chua_xnd !== null && prevItem.ty_le_chua_xnd !== null) {
        const currPct = currentStats.ty_le_chua_xnd * 100;
        const prevPct = prevItem.ty_le_chua_xnd * 100;
        const diff = Math.round(Math.abs(currPct - prevPct) * 10) / 10;
        const diffStr = diff.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

        let compText = 'không đổi';
        let compClass = 'text-[#57534e] font-medium';
        if (currPct < prevPct) {
          compText = `giảm ${diffStr} điểm`;
          compClass = 'text-[#15803d] font-bold';
        } else if (currPct > prevPct) {
          compText = `tăng ${diffStr} điểm`;
          compClass = 'text-[#b91c1c] font-bold';
        }

        compResult = {
          prevDate: formatDayMonth(prevItem.ngay),
          prevRate: pct(prevItem.ty_le_chua_xnd),
          compText,
          compClass
        };
      } else {
        compResult = {
          prevDate: formatDayMonth(prevItem.ngay),
          prevRate: pct(prevItem.ty_le_chua_xnd),
          compText: null,
          compClass: ''
        };
      }
    }
  }

  // Tìm ngày có tổng lớn nhất để làm mốc chiều cao biểu đồ
  const maxDayTong = Math.max(...byDayData.theo_ngay.map(d => d.tong), 1);

  const isViewingLatest = !isAllRange && selectedDate === byDayData.ngay_du_lieu_moi_nhat;

  return (
    <div className="space-y-6 text-[#292524]">
      {/* 1. HÀNG CHIP */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {!isAllRange ? (
            <>
              {isViewingLatest ? (
                <div className="bg-[#dbeafe] border border-[#93c5fd] text-[#1d4ed8] font-bold px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                  <span>Đang xem: hôm nay {formatDate(selectedDate)} (ngày dữ liệu mới nhất)</span>
                  <button 
                    onClick={handleClearSelectedDate}
                    className="hover:text-blue-900 font-bold ml-1 text-base leading-none"
                    title="Bỏ chọn ngày, xem cả khung"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="bg-[#dbeafe] border border-[#93c5fd] text-[#1d4ed8] font-bold px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                  <span>Đang xem: ngày {formatDate(selectedDate)}</span>
                  <button 
                    onClick={handleClearSelectedDate}
                    className="hover:text-blue-900 font-bold ml-1 text-base leading-none"
                    title="Bỏ chọn ngày, xem cả khung"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button
                onClick={handleClearSelectedDate}
                className="bg-white border border-[#1d4ed8] text-[#1d4ed8] font-bold px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition-colors"
              >
                Xem cả khung {formatDayMonth(fromDate)}→{formatDate(toDate)}
              </button>
            </>
          ) : (
            <span className="text-[14px] font-medium text-[#292524]">
              Đang xem: cả khung {formatDayMonth(fromDate)} → {formatDate(toDate)}
            </span>
          )}
        </div>
        <div className="text-[12px] text-[#78716c]">
          Mặc định là ngày dữ liệu mới nhất. Bấm cột khác để xem ngày đó; bỏ chọn để xem cả khung ngày.
        </div>
      </div>

      {/* 2. BỐN THẺ KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Thẻ 1: Tổng BD10 đến */}
        <div className="bg-white border border-[#e7e5e4] rounded-[14px] p-[16px_18px] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase text-[#57534e] tracking-wider mb-2">
              TỔNG BD10 ĐẾN
            </div>
            <div className="text-[38px] font-bold text-[#292524] leading-tight">
              {currentStats.tong.toLocaleString('vi-VN')}
            </div>
          </div>
          <div className="text-[12px] text-[#78716c] mt-2">
            {!isAllRange 
              ? `BD10 do bưu cục khác lập, nhận tại BCVH này, có ngày ${formatDayMonth(selectedDate)}`
              : 'BD10 do bưu cục khác lập, nhận tại BCVH này, trong khung ngày'}
          </div>
        </div>

        {/* Thẻ 2: Đã XNĐ BD10 */}
        <div className="bg-white border border-[#e7e5e4] rounded-[14px] p-[16px_18px] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase text-[#57534e] tracking-wider mb-2">
              ĐÃ XNĐ BD10
            </div>
            <div className="text-[38px] font-bold text-[#15803d] leading-tight">
              {currentStats.da_xnd.toLocaleString('vi-VN')}
            </div>
          </div>
          <div className="text-[12px] text-[#78716c] mt-2">
            {currentStats.tong > 0 
              ? `${(currentStats.da_xnd / currentStats.tong * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% tổng BD10 đến`
              : '—'}
          </div>
        </div>

        {/* Thẻ 3: Chưa XNĐ BD10 */}
        <div className="bg-[#fff1f2] border-2 border-[#fb7185] rounded-[14px] p-[16px_18px] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase text-[#9f1239] tracking-wider mb-2">
              CHƯA XNĐ BD10
            </div>
            <div className="text-[38px] font-bold text-[#9f1239] leading-tight">
              {currentStats.chua_xnd.toLocaleString('vi-VN')}
            </div>
          </div>
          <div className="text-[12px] text-[#9f1239] mt-2">
            Đã có XN túi / XN bưu gửi, chưa XNĐ
          </div>
        </div>

        {/* Thẻ 4: Tỉ lệ chưa XNĐ */}
        <div className="bg-white border border-[#e7e5e4] rounded-[14px] p-[16px_18px] flex flex-col justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase text-[#57534e] tracking-wider mb-2">
              TỈ LỆ CHƯA XNĐ
            </div>
            <div className="text-[38px] font-bold text-[#be123c] leading-tight">
              {pct(currentStats.ty_le_chua_xnd)}
            </div>
          </div>
          <div className="text-[12px] text-[#78716c] mt-2">
            {isAllRange ? (
              `Cả khung ${formatDayMonth(fromDate)} → ${formatDate(toDate)}`
            ) : compResult ? (
              <span>
                Hôm trước ({compResult.prevDate}): {compResult.prevRate}
                {compResult.compText && (
                  <> · <span className={compResult.compClass}>{compResult.compText}</span></>
                )}
              </span>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      {/* 3. DÒNG NHẮC VÀNG */}
      {isViewingLatest && (
        <div className="bg-[#fffbeb] border border-dashed border-[#fcd34d] text-[#92400e] text-[13px] rounded-[10px] py-2.5 px-4 font-medium">
          Ngày mới nhất: BD10 có thể chưa kịp XNĐ. Xem cả khung ngày để thấy tồn đọng.
        </div>
      )}

      {/* 4. KHỐI BIỂU ĐỒ «BD10 đến theo ngày (dd/MM → dd/MM)» */}
      <div className="bg-white border border-[#e7e5e4] rounded-[16px] p-[20px_24px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-[15px] font-bold text-[#292524]">
            BD10 đến theo ngày ({formatDayMonth(fromDate)} → {formatDayMonth(toDate)})
          </h3>
          <div className="flex items-center gap-5 text-[13px] text-[#57534e]">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm bg-[#86efac] shrink-0" />
              <span>Đã XNĐ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-sm bg-[#e11d48] shrink-0" />
              <span>Chưa XNĐ (số đỏ trên cột)</span>
            </div>
          </div>
        </div>

        {/* Vùng cột biểu đồ */}
        <div className="overflow-x-auto pb-2">
          <div 
            className="flex items-end gap-2 pt-6 pb-2 min-w-[500px]" 
            style={{ minWidth: `${Math.max(500, byDayData.theo_ngay.length * 48)}px`, height: '270px' }}
          >
            {byDayData.theo_ngay.map((d) => {
              const isSelected = selectedDate === d.ngay;
              const hasData = d.tong > 0;
              // Chiều cao cột: tối đa 190px (chừa 30px phía trên cho nhãn số đỏ)
              const colHeightPx = hasData ? Math.max(Math.round((d.tong / maxDayTong) * 190), 8) : 0;
              const chuaXndPct = hasData ? (d.chua_xnd / d.tong) * 100 : 0;
              const daXndPct = hasData ? (d.da_xnd / d.tong) * 100 : 0;

              return (
                <div 
                  key={d.ngay} 
                  className="flex-1 flex flex-col items-center justify-end h-full max-w-[56px] min-w-[34px] group"
                >
                  {/* Số chưa XNĐ đỏ trên cột */}
                  <div className="h-[22px] flex items-center justify-center">
                    {d.chua_xnd > 0 && (
                      <span className="text-[12px] font-bold text-[#9f1239]">
                        {d.chua_xnd.toLocaleString('vi-VN')}
                      </span>
                    )}
                  </div>

                  {/* Thân cột */}
                  <div className="w-full flex justify-center items-end" style={{ height: '190px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleDate(d.ngay)}
                      className={`w-full rounded-t-[6px] overflow-hidden flex flex-col justify-end transition-all cursor-pointer ${
                        isSelected 
                          ? 'outline outline-2 outline-[#1d4ed8] outline-offset-[3px]' 
                          : 'hover:opacity-90'
                      }`}
                      style={{ 
                        height: `${colHeightPx}px`,
                        minHeight: hasData ? '6px' : '0px'
                      }}
                      aria-label={`${formatDayMonth(d.ngay)}: tổng ${d.tong}, đã XNĐ ${d.da_xnd}, chưa XNĐ ${d.chua_xnd}`}
                      title={`${formatDayMonth(d.ngay)}: tổng ${d.tong}, đã XNĐ ${d.da_xnd}, chưa XNĐ ${d.chua_xnd}`}
                    >
                      {hasData && (
                        <>
                          {/* Phần trên: Chưa XNĐ (đỏ) */}
                          {d.chua_xnd > 0 && (
                            <div 
                              className="w-full bg-[#e11d48]" 
                              style={{ height: `${chuaXndPct}%` }}
                            />
                          )}
                          {/* Phần dưới: Đã XNĐ (xanh) */}
                          {d.da_xnd > 0 && (
                            <div 
                              className="w-full bg-[#86efac]" 
                              style={{ height: `${daXndPct}%` }}
                            />
                          )}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Nhãn ngày và tổng dưới cột */}
                  <button
                    type="button"
                    onClick={() => handleToggleDate(d.ngay)}
                    className="flex flex-col items-center mt-2 cursor-pointer w-full"
                  >
                    <span className={`text-[12px] ${isSelected ? 'font-bold text-[#1d4ed8]' : 'text-[#57534e]'}`}>
                      {formatDayMonth(d.ngay)}
                    </span>
                    <span className="text-[11px] text-[#78716c] tabular-nums">
                      {d.tong.toLocaleString('vi-VN')}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. KHỐI THEO BƯU CỤC LẬP BD10 */}
      <div className="bg-white border border-[#e7e5e4] rounded-[16px] p-[20px_24px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-[15px] font-bold text-[#292524]">
            Theo bưu cục lập BD10 {selectedDate ? `(ngày ${formatDayMonth(selectedDate)})` : '(cả khung)'}
          </h3>
          <button
            onClick={onShowDetail}
            className="bg-[#e11d48] hover:bg-[#be123c] text-white font-bold px-4 py-2 rounded-[10px] text-sm transition-colors flex items-center gap-1 shrink-0"
          >
            <span>Xem danh sách BD10 chưa XNĐ</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>

        {/* Bảng bưu cục lập */}
        <div className="overflow-x-auto border border-[#e7e5e4] rounded-lg">
          {loadingPostOffice ? (
            <div className="flex items-center justify-center py-12 text-[#78716c]">
              <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mr-2" />
              <span>Đang tải số liệu bưu cục lập...</span>
            </div>
          ) : errorPostOffice ? (
            <div className="p-6 text-center text-red-600 text-sm">
              {errorPostOffice}
            </div>
          ) : !byPostOfficeData || byPostOfficeData.theo_buu_cuc_lap.length === 0 ? (
            <div className="p-8 text-center text-[#78716c] text-sm">
              Không có dữ liệu bưu cục lập trong khoảng đang chọn.
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-[#fafaf9] text-[#57534e] text-[12px] font-bold uppercase border-b-2 border-[#e7e5e4]">
                <tr>
                  <th className="px-4 py-3">BƯU CỤC LẬP</th>
                  <th className="px-4 py-3 text-right">TỔNG BD10 ĐẾN</th>
                  <th className="px-4 py-3 text-right">ĐÃ XNĐ</th>
                  <th className="px-4 py-3 text-right">CHƯA XNĐ</th>
                  <th className="px-4 py-3 text-right">TỈ LỆ CHƯA XNĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7e5e4]">
                {byPostOfficeData.theo_buu_cuc_lap.map((row) => (
                  <tr key={row.ma_buu_cuc} className="hover:bg-[#fbfbfa] transition-colors">
                    <td className="px-4 py-3">
                      {row.ten_buu_cuc ? (
                        <>
                          <span className="font-medium text-[#292524]">{row.ten_buu_cuc}</span>
                          <span className="text-xs text-[#78716c] ml-1.5">· {row.ma_buu_cuc}</span>
                        </>
                      ) : (
                        <span className="font-medium text-[#292524]">{row.ma_buu_cuc}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#292524]">
                      {row.tong.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#15803d]">
                      {row.da_xnd.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {row.chua_xnd > 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#ffe4e6] text-[#be123c] font-bold text-[13px]">
                          {row.chua_xnd.toLocaleString('vi-VN')}
                        </span>
                      ) : (
                        <span className="text-[#78716c]">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#be123c]">
                      {pct(row.ty_le_chua_xnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fafaf9] border-t-2 border-[#e7e5e4] font-bold">
                <tr>
                  <td className="px-4 py-3 text-[#292524]">Cộng</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#292524]">
                    {byPostOfficeData.tong.tong.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#15803d]">
                    {byPostOfficeData.tong.da_xnd.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {byPostOfficeData.tong.chua_xnd > 0 ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#ffe4e6] text-[#be123c] font-bold text-[13px]">
                        {byPostOfficeData.tong.chua_xnd.toLocaleString('vi-VN')}
                      </span>
                    ) : (
                      <span className="text-[#78716c]">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#be123c]">
                    {pct(byPostOfficeData.tong.ty_le_chua_xnd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 6. DÒNG GHI CHÚ CUỐI */}
      <div className="bg-[#fffbeb] border border-dashed border-[#fcd34d] text-[#92400e] text-[13px] rounded-[10px] py-2.5 px-4 font-medium">
        Ngoài các số trên: BD10 chưa có mốc nào (không xác định được ngày): {(byDayData.ngoai_khung?.khong_co_moc || 0).toLocaleString('vi-VN')} · BD10 lập đi từ chính BCVH này và BD10 trống: không tính.
      </div>
    </div>
  );
}
