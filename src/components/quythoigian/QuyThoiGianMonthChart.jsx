import React, { useState, useMemo, useRef } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  formatInt,
  formatPercent,
  formatDdMm,
  formatDdMmYyyy,
  formatDiemChenhLech,
  NGUONG_SO_SANH_LUY_KE_CHINH,
  NGUONG_SO_SANH_LUY_KE_SO_NGAY
} from './quyThoiGianFormatters';
import { BCVH_LIST } from '../../constants/bcvh';

const LY_DO_MAP = {
  THIEU_FILE: 'Thiếu file',
  DANG_CAP_NHAT: 'Đang cập nhật',
  DUOI_SAN: 'Dưới 50 lượt'
};

export default function QuyThoiGianMonthChart({
  luyKeData,
  tongHopData,
  dateRange = { from: '', to: '' },
  selectedBcvh = 'all',
  loading = false,
  error = null,
  onRetry,
  onSelectDate,
}) {
  const containerRef = useRef(null);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [showThieuDetails, setShowThieuDetails] = useState(false);

  const getBcvhName = (ma) => {
    const item = BCVH_LIST.find((b) => b.ma === ma);
    return item ? item.ten : ma;
  };

  // Trạng thái đang tải lũy kế
  if (loading && !luyKeData) {
    return (
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
        </div>
        <div className="h-56 bg-cream-light/30 rounded-[10px] border border-cream-line flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-[#4A1D6E]">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Đang tải diễn biến cả tháng...</span>
          </div>
        </div>
      </div>
    );
  }

  // Trạng thái lỗi lũy kế
  if (error && !luyKeData) {
    return (
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="p-4 bg-red-50 border border-red-200 rounded-[10px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>Không tải được lũy kế tháng ({error}). Các phần khác của màn vẫn hiển thị bình thường.</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-300 rounded-[8px] hover:bg-red-50 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </button>
        </div>
      </div>
    );
  }

  const theoNgay = luyKeData?.theo_ngay || [];
  const soNgayCoDuLieu = luyKeData?.so_ngay_co_du_lieu || 0;
  const meta = luyKeData?.meta || {};

  // Tính toán đường và tọa độ SVG
  const SVG_WIDTH = 960;
  const SVG_HEIGHT = 260;
  const PAD_LEFT = 52;
  const PAD_RIGHT = 32;
  const PAD_TOP = 25;
  const PAD_BOTTOM = 45;
  const PLOT_W = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  // Tìm tỉ lệ % cao nhất để vẽ trục Y
  let maxPct = 0;
  theoNgay.forEach((item) => {
    if (item.ty_le_qua_han !== null && item.ty_le_qua_han !== undefined) {
      maxPct = Math.max(maxPct, item.ty_le_qua_han * 100);
    }
    if (item.luy_ke_ty_le !== null && item.luy_ke_ty_le !== undefined) {
      maxPct = Math.max(maxPct, item.luy_ke_ty_le * 100);
    }
  });

  // Làm tròn mốc trục Y (bước nhảy 5% hoặc 10%, tối thiểu 20%)
  const yCeil = Math.max(20, Math.ceil((maxPct + 2) / 10) * 10);
  const yTicks = [0, yCeil * 0.25, yCeil * 0.5, yCeil * 0.75, yCeil];

  const totalPoints = theoNgay.length;
  const getX = (idx) => {
    if (totalPoints <= 1) return PAD_LEFT + PLOT_W / 2;
    return PAD_LEFT + (idx / (totalPoints - 1)) * PLOT_W;
  };

  const getY = (pct) => {
    if (pct === null || pct === undefined || isNaN(pct)) return null;
    return PAD_TOP + PLOT_H - (Math.min(pct, yCeil) / yCeil) * PLOT_H;
  };

  // 1. Phân đoạn đường nét đứt đỏ (tỉ lệ riêng từng ngày, ngắt khi co_du_lieu = false)
  const redSegments = [];
  let currentRedSeg = [];
  theoNgay.forEach((item, idx) => {
    if (item.co_du_lieu && item.ty_le_qua_han !== null && item.ty_le_qua_han !== undefined) {
      currentRedSeg.push({ x: getX(idx), y: getY(item.ty_le_qua_han * 100), item, idx });
    } else {
      if (currentRedSeg.length > 0) {
        redSegments.push(currentRedSeg);
        currentRedSeg = [];
      }
    }
  });
  if (currentRedSeg.length > 0) redSegments.push(currentRedSeg);

  // 2. Phân đoạn đường tím (lũy kế, ngắt khi co_du_lieu = false)
  const purpleSegments = [];
  let currentPurpleSeg = [];
  theoNgay.forEach((item, idx) => {
    if (item.luy_ke_ty_le !== null && item.luy_ke_ty_le !== undefined) {
      currentPurpleSeg.push({ x: getX(idx), y: getY(item.luy_ke_ty_le * 100), item, idx });
    } else {
      if (currentPurpleSeg.length > 0) {
        purpleSegments.push(currentPurpleSeg);
        currentPurpleSeg = [];
      }
    }
  });
  if (currentPurpleSeg.length > 0) purpleSegments.push(currentPurpleSeg);

  // Dải vàng mờ bao phủ khoảng ngày đang chọn
  let bandXStart = null;
  let bandXEnd = null;
  const stepX = totalPoints > 1 ? PLOT_W / (totalPoints - 1) : PLOT_W;
  theoNgay.forEach((item, idx) => {
    if (item.ngay >= dateRange.from && item.ngay <= dateRange.to) {
      const x = getX(idx);
      if (bandXStart === null || x < bandXStart) bandXStart = x;
      if (bandXEnd === null || x > bandXEnd) bandXEnd = x;
    }
  });

  const hasBand = bandXStart !== null && bandXEnd !== null;
  const bandLeft = hasBand ? Math.max(PAD_LEFT, bandXStart - stepX / 2) : 0;
  const bandWidth = hasBand ? Math.min(PLOT_W + PAD_LEFT - bandLeft, bandXEnd - bandXStart + stepX) : 0;

  // Dòng so sánh khoảng chọn với lũy kế
  // Điều kiện: chinh >= 50 và soNgayCoDuLieu >= 2
  const tongHopChinh = tongHopData?.tong?.chinh || 0;
  const tongHopQuaHan = tongHopData?.tong?.dai?.QUA_HAN || 0;
  const tongHopConLai = (tongHopData?.tong?.dai?.CON_2_6 || 0) + (tongHopData?.tong?.dai?.CON_TREN_6 || 0);

  const luyKeChinh = luyKeData?.tong?.chinh || 0;
  const luyKeQuaHan = luyKeData?.tong?.dai?.QUA_HAN || 0;
  const luyKeConLai = (luyKeData?.tong?.dai?.CON_2_6 || 0) + (luyKeData?.tong?.dai?.CON_TREN_6 || 0);

  const duDieuKienSoSanh =
    tongHopChinh >= NGUONG_SO_SANH_LUY_KE_CHINH &&
    soNgayCoDuLieu >= NGUONG_SO_SANH_LUY_KE_SO_NGAY;

  let diffQuaHan = null;
  let diffConLai = null;
  if (duDieuKienSoSanh && tongHopChinh > 0 && luyKeChinh > 0) {
    const tlQhKhoang = (tongHopQuaHan / tongHopChinh) * 100;
    const tlQhLuyKe = (luyKeData?.tong?.ty_le_qua_han !== null && luyKeData?.tong?.ty_le_qua_han !== undefined)
      ? luyKeData.tong.ty_le_qua_han * 100
      : (luyKeQuaHan / luyKeChinh) * 100;
    diffQuaHan = tlQhKhoang - tlQhLuyKe;

    const tlClKhoang = (tongHopConLai / tongHopChinh) * 100;
    const tlClLuyKe = (luyKeConLai / luyKeChinh) * 100;
    diffConLai = tlClKhoang - tlClLuyKe;
  }

  // Danh sách các ngày thiếu số liệu của BCVH (chỉ khi xem Tất cả BCVH)
  const ngayBcvhThieu = [];
  if (selectedBcvh === 'all') {
    theoNgay.forEach((item) => {
      if (item.bcvh_thieu && item.bcvh_thieu.length > 0) {
        ngayBcvhThieu.push(item);
      }
    });
  }

  // Render SVG Path từ mảng điểm
  const makePathD = (pts) => {
    if (pts.length === 0) return '';
    return pts.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  };

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none space-y-4">
      {/* Tiêu đề & Chú giải */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="hue-h2">
            Diễn biến cả tháng
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Từ ngày {formatDdMmYyyy(luyKeData?.tu)} đến ngày {formatDdMmYyyy(luyKeData?.den)} · Bấm một ngày để thu khoảng chọn về ngày đó
          </p>
        </div>

        {/* Chú giải đường */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-700">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-0.75 bg-[#4A1D6E] shrink-0 rounded-full" />
            <span className="font-semibold text-[#4A1D6E]">Lũy kế tháng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 border-b-2 border-dashed border-[#B3202A] shrink-0" />
            <span className="font-semibold text-[#B3202A]">Tỉ lệ ngày</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[#FFF1CC] border border-[#E0A82E] shrink-0" />
            <span className="text-gray-600">Khoảng chọn</span>
          </div>
        </div>
      </div>

      {/* Dòng so sánh khoảng chọn với lũy kế (nếu đủ điều kiện) */}
      {duDieuKienSoSanh && diffQuaHan !== null && (
        <div className="bg-cream-light/60 border border-cream-line rounded-[10px] px-3.5 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800">Khoảng ngày đang chọn so với lũy kế:</span>
            <span className="text-gray-700">
              Quá hạn{' '}
              <strong className={diffQuaHan > 0 ? 'text-[#B3202A]' : diffQuaHan < 0 ? 'text-[#1F7A5C]' : 'text-gray-800'}>
                {formatDiemChenhLech(diffQuaHan)}
              </strong>
              {' '}· Còn thời gian{' '}
              <strong className={diffConLai > 0 ? 'text-[#1F7A5C]' : diffConLai < 0 ? 'text-[#B3202A]' : 'text-gray-800'}>
                {formatDiemChenhLech(diffConLai)}
              </strong>
            </span>
          </div>
          <span className="text-xs text-gray-500">
            (khoảng chọn {formatInt(tongHopChinh)} lượt đo, lũy kế {soNgayCoDuLieu} ngày)
          </span>
        </div>
      )}

      {/* Vùng vẽ biểu đồ SVG co giãn */}
      <div ref={containerRef} className="relative w-full overflow-hidden select-none">
        {soNgayCoDuLieu === 0 ? (
          <div className="h-48 rounded-[10px] border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-500 italic">
            Chưa có ngày đủ số liệu trong tháng.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-auto overflow-visible"
            aria-label="Biểu đồ diễn biến tỉ lệ quá hạn cả tháng"
          >
            {/* Lưới ngang & Nhãn trục Y */}
            {yTicks.map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={SVG_WIDTH - PAD_RIGHT}
                    y2={y}
                    stroke="#E4D5AE"
                    strokeDasharray="3,3"
                    strokeWidth={0.75}
                  />
                  <text
                    x={PAD_LEFT - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-xs fill-gray-500 font-sans"
                  >
                    {val.toFixed(0)}%
                  </text>
                </g>
              );
            })}

            {/* Dải vàng mờ bao phủ khoảng ngày đang chọn */}
            {hasBand && (
              <rect
                x={bandLeft}
                y={PAD_TOP}
                width={bandWidth}
                height={PLOT_H}
                fill="#FFF1CC"
                fillOpacity={0.65}
                stroke="#E0A82E"
                strokeWidth={1}
                strokeDasharray="4,4"
                rx={4}
              />
            )}

            {/* Trục X chính */}
            <line
              x1={PAD_LEFT}
              y1={PAD_TOP + PLOT_H}
              x2={SVG_WIDTH - PAD_RIGHT}
              y2={PAD_TOP + PLOT_H}
              stroke="#D9CBA8"
              strokeWidth={1.5}
            />

            {/* Đường nét đứt màu đỏ: Tỉ lệ riêng từng ngày */}
            {redSegments.map((seg, i) => (
              <path
                key={`red-${i}`}
                d={makePathD(seg)}
                fill="none"
                stroke="#B3202A"
                strokeWidth={2}
                strokeDasharray="5,4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* Đường liền màu tím: Lũy kế tháng */}
            {purpleSegments.map((seg, i) => (
              <path
                key={`purple-${i}`}
                d={makePathD(seg)}
                fill="none"
                stroke="#4A1D6E"
                strokeWidth={2.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* Các điểm ngày, nhãn trục X và điểm tương tác bấm chọn */}
            {theoNgay.map((item, idx) => {
              const x = getX(idx);
              const isSelected = item.ngay >= dateRange.from && item.ngay <= dateRange.to;
              const hasData = item.co_du_lieu;
              const lyDo = item.ly_do;
              const ddStr = formatDdMm(item.ngay);

              const tlNgay = item.ty_le_qua_han !== null && item.ty_le_qua_han !== undefined
                ? formatPercent(item.ty_le_qua_han)
                : '—';
              const tlLk = item.luy_ke_ty_le !== null && item.luy_ke_ty_le !== undefined
                ? formatPercent(item.luy_ke_ty_le)
                : '—';

              const yRed = hasData && item.ty_le_qua_han !== null ? getY(item.ty_le_qua_han * 100) : null;
              const yPurple = item.luy_ke_ty_le !== null ? getY(item.luy_ke_ty_le * 100) : null;

              return (
                <g key={item.ngay}>
                  {/* Nhãn ngày trên trục X */}
                  <text
                    x={x}
                    y={PAD_TOP + PLOT_H + 18}
                    textAnchor="middle"
                    className={`text-xs font-sans ${
                      isSelected ? 'font-bold fill-[#4A1D6E]' : 'fill-gray-600'
                    }`}
                  >
                    {ddStr}
                  </text>

                  {/* Dấu chấm trên đường tím lũy kế */}
                  {yPurple !== null && (
                    <circle
                      cx={x}
                      cy={yPurple}
                      r={isSelected ? 4 : 2.5}
                      fill="#4A1D6E"
                      stroke="#FFFFFF"
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Dấu chấm trên đường đỏ từng ngày */}
                  {yRed !== null && (
                    <circle
                      cx={x}
                      cy={yRed}
                      r={isSelected ? 3.5 : 2}
                      fill="#B3202A"
                      stroke="#FFFFFF"
                      strokeWidth={1}
                    />
                  )}

                  {/* Dấu nhỏ trên trục X biểu thị ngày mất dữ liệu */}
                  {!hasData && (
                    <g transform={`translate(${x}, ${PAD_TOP + PLOT_H})`}>
                      <circle
                        cx={0}
                        cy={0}
                        r={3.5}
                        fill="#E0A82E"
                        stroke="#B3202A"
                        strokeWidth={1}
                      />
                      <title>{`Ngày ${ddStr}: ${LY_DO_MAP[lyDo] || lyDo || 'Không đủ số liệu'}`}</title>
                    </g>
                  )}

                  {/* Cột tương tác bấm chọn và rê chuột (Accessibility & Tooltip) */}
                  <rect
                    x={x - stepX / 2}
                    y={PAD_TOP}
                    width={stepX}
                    height={PLOT_H + 25}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`Ngày ${formatDdMmYyyy(item.ngay)}: Tỉ lệ ngày ${tlNgay}, Lũy kế ${tlLk}${!hasData ? ` (chưa đủ số liệu: ${LY_DO_MAP[lyDo] || lyDo})` : ''}`}
                    className="cursor-pointer focus:outline-none focus:bg-[#4A1D6E]/10"
                    onClick={() => onSelectDate(item.ngay)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDate(item.ngay);
                      }
                    }}
                    onMouseEnter={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      const relX = rect ? e.clientX - rect.left : x;
                      setHoverPos({ x: relX, y: 30 });
                      setHoveredDay(item);
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    onFocus={() => {
                      setHoverPos({ x, y: 30 });
                      setHoveredDay(item);
                    }}
                    onBlur={() => setHoveredDay(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip hiển thị khi rê chuột (đã clamp để không bị cắt mép) */}
        {hoveredDay && (
          <div
            className="absolute z-20 pointer-events-none bg-gray-900 text-white rounded-[8px] p-2.5 text-xs shadow-lg space-y-1 transform -translate-x-1/2 transition-all duration-75 min-w-[170px]"
            style={{
              top: '20px',
              left: `${Math.max(90, Math.min(hoverPos.x, (containerRef.current?.offsetWidth || 900) - 90))}px`
            }}
          >
            <div className="font-bold text-amber-300 border-b border-gray-700 pb-1">
              Ngày {formatDdMmYyyy(hoveredDay.ngay)}
            </div>
            {hoveredDay.co_du_lieu ? (
              <>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-300">Đến:</span>
                  <span className="font-semibold">{formatInt(hoveredDay.den)}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-300">Đo được:</span>
                  <span className="font-semibold">{formatInt(hoveredDay.chinh)}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-300">Quá hạn:</span>
                  <span className="font-semibold text-red-400">{formatInt(hoveredDay.qua_han)}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs pt-0.5 border-t border-gray-800">
                  <span className="text-gray-300">Tỉ lệ ngày:</span>
                  <span className="font-bold text-red-400">{formatPercent(hoveredDay.ty_le_qua_han)}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-300">Lũy kế tháng:</span>
                  <span className="font-bold text-purple-300">{formatPercent(hoveredDay.luy_ke_ty_le)}</span>
                </div>
              </>
            ) : (
              <div className="text-xs text-amber-200 italic py-1">
                Chưa đủ số liệu: {LY_DO_MAP[hoveredDay.ly_do] || hoveredDay.ly_do}
              </div>
            )}
            <div className="text-xs text-gray-400 pt-1 text-center border-t border-gray-800">
              Nhấn để chọn ngày này
            </div>
          </div>
        )}
      </div>

      {/* Chú thích ngày thiếu số liệu của một số BCVH (khi xem Tất cả BCVH) */}
      {selectedBcvh === 'all' && ngayBcvhThieu.length > 0 && (
        <div className="pt-2 border-t border-cream-line">
          <button
            type="button"
            onClick={() => setShowThieuDetails(!showThieuDetails)}
            className="flex items-center gap-1.5 text-xs text-[#A87A12] hover:underline font-medium cursor-pointer"
          >
            <span>
              {ngayBcvhThieu.length} ngày thiếu số liệu của một số BCVH (không tính vào lũy kế)
            </span>
            {showThieuDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showThieuDetails && (
            <div className="mt-2.5 p-3 bg-amber-50/70 border border-amber-200 rounded-[8px] text-xs space-y-2">
              <div className="font-semibold text-gray-800">Danh sách các BCVH thiếu trong ngày:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {ngayBcvhThieu.map((item) => (
                  <div key={item.ngay} className="bg-white p-2 rounded border border-amber-200">
                    <div className="font-bold text-gray-900 mb-1">Ngày {formatDdMm(item.ngay)}</div>
                    <ul className="space-y-0.5 text-xs text-gray-700">
                      {item.bcvh_thieu.map((thieu, i) => (
                        <li key={i} className="flex justify-between gap-1">
                          <span>{getBcvhName(thieu.ma)}:</span>
                          <span className="font-medium text-[#B3202A]">{LY_DO_MAP[thieu.ly_do] || thieu.ly_do}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chú thích loại trùng xuyên BCVH */}
      {meta.loai_trung_xuyen_bcvh_trong_ngay && (
        <div className="text-xs text-gray-500 italic">
          Số «Tất cả BCVH» đã loại trùng bưu gửi đi qua nhiều BCVH trong ngày.
        </div>
      )}
    </div>
  );
}
