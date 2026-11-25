import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  RefreshCw,
  Package,
  X,
} from 'lucide-react';
import { formatInt, shiftDay } from '../quythoigian/quyThoiGianFormatters';
import { formatDecimal, formatKgDecimal, getQuickDateRange } from './kttFormatters';
import {
  fetchKttMeta,
  fetchKttHuongDongTongHop,
  fetchKttHuongDongDanhSach,
  downloadKttHuongDong,
} from './kttApi';

const LOAI_HINH_OPTIONS = [
  { id: 'tat_ca', label: 'Tất cả' },
  { id: 'GD1', label: 'GD1' },
  { id: 'GD2_GD3', label: 'GD2/GD3' },
  { id: 'VHX', label: 'VHX' },
  { id: '531120', label: '531120' },
];

const LOAI_HINH_LABEL_MAP = {
  '531120': '531120',
  GD2_GD3: 'GD2/GD3',
  VHX: 'VHX',
  GD1: 'GD1',
  KHAC: 'Khác',
};

const NICE_LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

function countDaysInclusive(from, to) {
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function formatDdMm(ymd) {
  if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return ymd || '';
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

function formatDdMmYyyy(ymd) {
  if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return ymd || '';
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

/**
 * Nút thả xuống «Tải Excel ▾» dùng chung cho đầu khối và khối danh sách bưu gửi.
 */
function ExcelDropdownButton({ tu, den, loaiHinh, disabled }) {
  const [open, setOpen] = useState(false);
  const [confirmChiTiet, setConfirmChiTiet] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open && !confirmChiTiet) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, confirmChiTiet]);

  const handleDownload = async (kieu) => {
    if (downloading || !tu || !den) return;
    setOpen(false);
    setConfirmChiTiet(false);
    setDownloading(true);
    setErr(null);
    try {
      await downloadKttHuongDong({ tu, den, kieu, loai_hinh: loaiHinh });
    } catch (e) {
      setErr(e?.message || 'Chưa tải được file. Thử lại sau.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative inline-flex flex-col items-end">
      <button
        type="button"
        disabled={disabled || downloading}
        onClick={() => {
          setErr(null);
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 rounded-lg transition-colors cursor-pointer"
      >
        {downloading ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600 shrink-0" />
            <span>Đang chuẩn bị…</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-gray-600 shrink-0" />
            <span>Tải Excel ▾</span>
          </>
        )}
      </button>

      {open && !downloading && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#E4D5AE] rounded-lg shadow-lg z-30 py-1">
          <button
            type="button"
            onClick={() => handleDownload('nhac_viec')}
            className="w-full text-left px-3 py-2.5 min-h-[44px] text-xs text-gray-800 hover:bg-[#FAF5E8] transition-colors cursor-pointer"
          >
            Danh sách nhắc việc (không số hiệu)
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirmChiTiet(true);
            }}
            className="w-full text-left px-3 py-2.5 min-h-[44px] text-xs text-gray-800 hover:bg-[#FAF5E8] transition-colors cursor-pointer border-t border-[#F0E8D4]"
          >
            Chi tiết có số hiệu bưu gửi
          </button>
        </div>
      )}

      {confirmChiTiet && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[#FFF6DC] border border-[#E0A82E] rounded-lg shadow-lg z-30 p-3 space-y-2.5">
          <p className="text-xs font-medium text-gray-900">
            File có số hiệu bưu gửi, chỉ dùng nội bộ
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmChiTiet(false)}
              className="px-3 py-1.5 min-h-[44px] text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => handleDownload('chi_tiet')}
              className="px-3 py-1.5 min-h-[44px] text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md cursor-pointer"
            >
              Tiếp tục tải
            </button>
          </div>
        </div>
      )}

      {err && <span className="mt-1 text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

/**
 * Biểu đồ chấm thang log: «Từng túi lớn vượt ngưỡng bao nhiêu»
 */
function DotPlotTuiLon({ places, nguong }) {
  const dotPlaces = useMemo(
    () => places.filter((r) => (r.so_tui_lon || 0) > 0 && (r.so_bg_tui_lon_nhat || 0) > 0),
    [places]
  );

  if (!dotPlaces.length || !nguong) return null;

  const minVal = Math.min(nguong, ...dotPlaces.map((r) => r.so_bg_tui_lon_nhat));
  const maxVal = Math.max(nguong, ...dotPlaces.map((r) => r.so_bg_tui_lon_nhat));

  let domainMin = NICE_LOG_TICKS[0];
  for (const t of NICE_LOG_TICKS) {
    if (t <= minVal) domainMin = t;
  }
  let domainMax = NICE_LOG_TICKS[NICE_LOG_TICKS.length - 1];
  for (const t of NICE_LOG_TICKS) {
    if (t >= maxVal) {
      domainMax = t;
      break;
    }
  }
  if (domainMax <= domainMin) {
    domainMax = domainMin * 2;
  }

  const ticks = NICE_LOG_TICKS.filter((t) => t >= domainMin && t <= domainMax);
  const logMin = Math.log10(domainMin);
  const logMax = Math.log10(domainMax);
  const logSpan = logMax - logMin || 1;

  const has531120 = dotPlaces[0]?.ma === '531120';
  const hasOthersAfter531120 = has531120 && dotPlaces.length > 1;

  const svgWidth = 720;
  const padLeft = 170;
  const padRight = 56;
  const plotWidth = svgWidth - padLeft - padRight;
  const padTop = 26;
  const rowHeight = 28;
  const dividerGap = hasOthersAfter531120 ? 14 : 0;
  const padBottom = 38;
  const svgHeight = padTop + dotPlaces.length * rowHeight + dividerGap + padBottom;

  const xOf = (val) => {
    const clamped = Math.max(domainMin, val);
    return padLeft + ((Math.log10(clamped) - logMin) / logSpan) * plotWidth;
  };

  const xThreshold = xOf(nguong);
  const yAxisBottom = svgHeight - padBottom;

  const ariaSummary = `Biểu đồ chấm hiển thị ${dotPlaces.length} nơi đóng có túi từ ${nguong} bưu gửi trở lên; ngưỡng là ${nguong}; nơi cao nhất là ${dotPlaces[0].ma} với ${dotPlaces[0].so_bg_tui_lon_nhat} bưu gửi.`;

  return (
    <div className="bg-white border border-[#E4D5AE] rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-bold text-[#4A1D6E]">Từng túi lớn vượt ngưỡng bao nhiêu</h3>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full min-w-[600px] h-auto select-none"
          role="img"
          aria-label={ariaSummary}
        >
          {/* Vạch lưới dọc theo các mốc thang log */}
          {ticks.map((tick) => {
            const tx = xOf(tick);
            return (
              <g key={tick}>
                <line
                  x1={tx}
                  y1={padTop - 4}
                  x2={tx}
                  y2={yAxisBottom}
                  stroke="#F0E8D4"
                  strokeWidth={1}
                />
                <text
                  x={tx}
                  y={yAxisBottom + 14}
                  textAnchor="middle"
                  className="fill-[#7A6A80] text-[10px]"
                >
                  {formatInt(tick)}
                </text>
              </g>
            );
          })}

          {/* Vạch ngưỡng nét đứt */}
          <line
            x1={xThreshold}
            y1={padTop - 8}
            x2={xThreshold}
            y2={yAxisBottom}
            stroke="#B3202A"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text
            x={xThreshold}
            y={padTop - 12}
            textAnchor="middle"
            className="fill-[#B3202A] text-[11px] font-semibold"
          >
            ngưỡng {nguong}
          </text>

          {/* Đường kẻ ngăn sau 531120 nếu có các nơi khác */}
          {hasOthersAfter531120 && (
            <line
              x1={8}
              y1={padTop + rowHeight + dividerGap / 2 - 2}
              x2={svgWidth - 8}
              y2={padTop + rowHeight + dividerGap / 2 - 2}
              stroke="#E4D5AE"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Các dòng nơi đóng */}
          {dotPlaces.map((r, idx) => {
            const is531120 = r.ma === '531120';
            const extraY = hasOthersAfter531120 && idx > 0 ? dividerGap : 0;
            const cy = padTop + idx * rowHeight + rowHeight / 2 + extraY;
            const cx = xOf(r.so_bg_tui_lon_nhat);
            const dotColor = is531120 ? '#D97706' : '#4A1D6E';
            const lineColor = is531120 ? '#F59E0B' : '#9F63C4';
            const displayLabel = r.ten ? `${r.ma} · ${r.ten}` : `${r.ma} · chưa có tên`;

            return (
              <g key={r.ma}>
                <text
                  x={padLeft - 10}
                  y={cy + 4}
                  textAnchor="end"
                  className={
                    is531120
                      ? 'fill-[#92400E] text-[11px] font-bold'
                      : 'fill-[#2A1B33] text-[11px] font-medium'
                  }
                >
                  {displayLabel.length > 24 ? `${displayLabel.slice(0, 23)}…` : displayLabel}
                </text>

                {r.so_bg_tui_lon_nhat >= nguong && (
                  <line
                    x1={xThreshold}
                    y1={cy}
                    x2={cx}
                    y2={cy}
                    stroke={lineColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {is531120 ? (
                  <rect
                    x={cx - 5.5}
                    y={cy - 5.5}
                    width={11}
                    height={11}
                    rx={2}
                    fill={dotColor}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                  />
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={dotColor}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                  />
                )}

                <text
                  x={cx + 9}
                  y={cy + 4}
                  textAnchor="start"
                  className={
                    is531120
                      ? 'fill-[#92400E] text-[11px] font-bold tabular-nums'
                      : 'fill-[#4A1D6E] text-[11px] font-semibold tabular-nums'
                  }
                >
                  {formatInt(r.so_bg_tui_lon_nhat)}
                </text>
              </g>
            );
          })}

          {/* Nhãn trục X */}
          <text
            x={padLeft + plotWidth / 2}
            y={svgHeight - 4}
            textAnchor="middle"
            className="fill-[#5A4A62] text-[11px] font-medium"
          >
            Số BG nội tỉnh trong túi (thang log)
          </text>
        </svg>
      </div>
      <p className="text-xs text-[#5A4A62] leading-relaxed">
        Mỗi chấm là túi có nhiều BG nhất của một nơi đóng, đo bằng số BG nội tỉnh trong túi trên thang log (mỗi vạch gấp khoảng 2 đến 2,5 lần vạch trước); đoạn nối từ vạch ngưỡng {nguong} đến chấm cho thấy mức vượt. 531120 tách riêng ở trên cùng, màu vàng.
      </p>
    </div>
  );
}

/**
 * Dải sản lượng theo ngày: «Sản lượng theo ngày» (30 ngày kết thúc ở Đến ngày)
 */
function DaiSanLuongTheoNgay({ days, tu, den, nguong, nguonXuatLucMoiNhat }) {
  if (!days || !days.length) return null;

  const latestDate =
    nguonXuatLucMoiNhat && typeof nguonXuatLucMoiNhat === 'string' && nguonXuatLucMoiNhat.length >= 10
      ? nguonXuatLucMoiNhat.slice(0, 10)
      : null;
  const latestTime =
    nguonXuatLucMoiNhat && typeof nguonXuatLucMoiNhat === 'string' && nguonXuatLucMoiNhat.length >= 19
      ? nguonXuatLucMoiNhat.slice(11, 19)
      : '';

  const isDayIncomplete = (ngay) => {
    if (!latestDate) return false;
    if (ngay > latestDate) return true;
    if (ngay === latestDate && latestTime !== '23:59:59') return true;
    return false;
  };

  const incompleteDays = days.filter((d) => isDayIncomplete(d.ngay));
  const completeDays = days.filter((d) => !isDayIncomplete(d.ngay));

  const totalComplete = completeDays.reduce((s, d) => s + (d.bg_trong_tui_lon || 0), 0);
  const avgComplete = completeDays.length > 0 ? Math.round(totalComplete / completeDays.length) : 0;

  const maxBar = Math.max(
    1,
    ...completeDays.map((d) => d.bg_trong_tui_lon || 0),
    avgComplete
  );

  // Xếp hạng khi khoảng chọn đúng 1 ngày và ngày đó thuộc nhóm ngày trọn
  let rankSentence = '';
  if (tu && den && tu === den) {
    const targetDay = completeDays.find((d) => d.ngay === tu);
    if (targetDay) {
      const val = targetDay.bg_trong_tui_lon || 0;
      const rank = 1 + completeDays.filter((d) => (d.bg_trong_tui_lon || 0) > val).length;
      rankSentence = `${formatDdMm(tu)} đứng thứ ${rank} trong ${completeDays.length} ngày. `;
    }
  }

  const firstComplete = completeDays[0]?.ngay;
  const lastComplete = completeDays[completeDays.length - 1]?.ngay;

  const avgBottomPct = maxBar > 0 ? Math.min(100, (avgComplete / maxBar) * 100) : 0;

  return (
    <div className="bg-white border border-[#E4D5AE] rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#4A1D6E]">Sản lượng theo ngày</h3>
        {completeDays.length > 0 && (
          <span className="text-xs font-medium text-[#7A6A80]">
            trung bình {formatInt(avgComplete)} BG/ngày
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="relative min-w-[680px] h-40 pt-6 pb-6 px-2 border-b border-[#E4D5AE]">
          {/* Vạch nét đứt trung bình */}
          {completeDays.length > 0 && (
            <div
              className="absolute left-2 right-2 border-t-2 border-dashed border-[#B3202A]/70 pointer-events-none z-10"
              style={{ bottom: `calc(24px + ${(avgBottomPct / 100) * 104}px)` }}
            >
              <span className="absolute right-0 -top-4 bg-white/90 px-1 text-[10px] font-semibold text-[#B3202A]">
                trung bình {formatInt(avgComplete)}
              </span>
            </div>
          )}

          <div className="flex items-end justify-between gap-1 h-[104px]">
            {days.map((d) => {
              const incomplete = isDayIncomplete(d.ngay);
              const inRange = tu && den && d.ngay >= tu && d.ngay <= den;
              const val = d.bg_trong_tui_lon || 0;
              const barHeightPx = incomplete
                ? 36
                : val > 0
                  ? Math.max(4, Math.round((val / maxBar) * 104))
                  : 2;

              const tooltipText = incomplete
                ? `${formatDdMm(d.ngay)}: chưa trọn`
                : `${formatDdMm(d.ngay)}: ${formatInt(val)} BG trong túi từ ${nguong} BG trở lên`;

              return (
                <div
                  key={d.ngay}
                  title={tooltipText}
                  className="flex-1 min-w-[16px] flex flex-col items-center justify-end h-full group relative"
                >
                  {!incomplete && inRange && (
                    <span className="text-[10px] font-bold text-[#4A1D6E] tabular-nums mb-0.5 leading-none">
                      {formatInt(val)}
                    </span>
                  )}

                  {incomplete ? (
                    <div
                      className="w-full max-w-[20px] border-2 border-dashed border-[#9A8AA0] rounded-t bg-[#FAF6EC]"
                      style={{ height: `${barHeightPx}px` }}
                    />
                  ) : (
                    <div
                      className={`w-full max-w-[20px] rounded-t transition-colors ${
                        inRange
                          ? 'bg-[#4A1D6E]'
                          : 'bg-[#D8BDEB] group-hover:bg-[#BF93DB]'
                      }`}
                      style={{ height: `${barHeightPx}px` }}
                    />
                  )}

                  <span
                    className={`absolute -bottom-5 text-[9px] tabular-nums whitespace-nowrap ${
                      inRange ? 'font-bold text-[#4A1D6E]' : 'text-[#7A6A80]'
                    }`}
                  >
                    {d.ngay.slice(8, 10)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-[#5A4A62] leading-relaxed">
        {rankSentence}
        {completeDays.length > 0 && (
          <>
            Cột mỗi ngày là số BG trong túi từ {nguong} BG trở lên; vạch nét đứt là mức trung bình{' '}
            {formatInt(avgComplete)} BG/ngày ({completeDays.length} ngày {formatDdMm(firstComplete)} đến{' '}
            {formatDdMm(lastComplete)}, tổng {formatInt(totalComplete)}).
          </>
        )}
        {incompleteDays.length > 0 && (
          <>
            {' '}
            {incompleteDays
              .map((d) => `Ngày ${formatDdMm(d.ngay)} chưa trọn nên khung nét đứt, không tính.`)
              .join(' ')}
          </>
        )}
      </p>
    </div>
  );
}

export default function KttHuongDong() {
  const [meta, setMeta] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  // Bộ lọc: mở tab KHÔNG tự tải, người dùng chủ động chọn ngày hoặc bấm 30 ngày / 7 ngày
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [loaiHinh, setLoaiHinh] = useState('tat_ca');

  // Trạng thái tải dữ liệu
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [rangeError, setRangeError] = useState(null);
  const [tongHopData, setTongHopData] = useState(null);
  const [stripData, setStripData] = useState(null);

  // Bảng: mở nhóm chỉ có túi nhỏ + mở danh sách bưu gửi của 1 nơi đóng
  const [showSmallOnly, setShowSmallOnly] = useState(false);
  const [selectedNoiDong, setSelectedNoiDong] = useState(null);
  const [chiTuiLon, setChiTuiLon] = useState(true);
  const [dsPage, setDsPage] = useState(1);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsError, setDsError] = useState(null);
  const [dsData, setDsData] = useState(null);

  // Khối «Cách tính và giới hạn»
  const [showGuide, setShowGuide] = useState(false);

  // Tải nhẹ meta để nút «30 ngày» / «7 ngày» bám theo ngày dữ liệu mới nhất
  useEffect(() => {
    let active = true;
    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (res.ok && res.data) {
          setMeta(res.data);
        }
      })
      .catch(() => {
        // Bỏ qua lỗi mạng ở bước meta phụ trợ; khi tải chính thức sẽ báo đầy đủ
      });
    return () => {
      active = false;
    };
  }, []);

  // Gọi API khi đã có đủ tu, den hợp lệ (<= 31 ngày)
  useEffect(() => {
    if (!tu || !den) return;

    if (tu > den) {
      setRangeError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
      return;
    }

    const numDays = countDaysInclusive(tu, den);
    if (numDays > 31) {
      setRangeError('Chọn tối đa 31 ngày');
      return;
    }

    setRangeError(null);
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    setSelectedNoiDong(null);
    setDsData(null);
    setShowSmallOnly(false);

    const needSeparateStrip = numDays < 30;
    const stripTu = shiftDay(den, -29);

    const mainPromise = fetchKttHuongDongTongHop({ tu, den, loai_hinh: loaiHinh });
    const stripPromise = needSeparateStrip
      ? fetchKttHuongDongTongHop({ tu: stripTu, den, loai_hinh: loaiHinh })
      : null;

    Promise.all([mainPromise, stripPromise])
      .then(([mainRes, stripRes]) => {
        if (!active) return;
        if (mainRes.status === 403 || stripRes?.status === 403) {
          setForbidden(true);
          return;
        }
        if (!mainRes.ok) {
          setErrorMsg(mainRes.error || 'Không tải được dữ liệu.');
          setTongHopData(null);
          setStripData(null);
          return;
        }
        setTongHopData(mainRes.data);
        if (needSeparateStrip) {
          setStripData(stripRes?.ok ? stripRes.data : null);
        } else {
          setStripData(mainRes.data);
        }
      })
      .catch((e) => {
        if (!active) return;
        setErrorMsg(e?.message || 'Lỗi kết nối máy chủ.');
        setTongHopData(null);
        setStripData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tu, den, loaiHinh]);

  // Tải danh sách bưu gửi khi bấm một dòng nơi đóng
  useEffect(() => {
    if (!selectedNoiDong || !tu || !den) return;
    let active = true;
    setDsLoading(true);
    setDsError(null);

    fetchKttHuongDongDanhSach({
      tu,
      den,
      noi_dong: selectedNoiDong.ma,
      nhom: 'dong_vao_530100',
      chi_tui_lon: chiTuiLon ? 1 : 0,
      page: dsPage,
      page_size: 50,
    })
      .then((res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setDsError(res.error || 'Không tải được danh sách bưu gửi.');
          setDsData(null);
          return;
        }
        setDsData(res.data);
      })
      .catch((e) => {
        if (!active) return;
        setDsError(e?.message || 'Lỗi kết nối máy chủ.');
        setDsData(null);
      })
      .finally(() => {
        if (active) setDsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedNoiDong, tu, den, chiTuiLon, dsPage]);

  const handleQuickRange = (days) => {
    const range = getQuickDateRange(days, meta);
    setTu(range.from);
    setDen(range.to);
  };

  const quick30 = useMemo(() => getQuickDateRange(30, meta), [meta]);
  const quick7 = useMemo(() => getQuickDateRange(7, meta), [meta]);
  const is30Active = tu === quick30.from && den === quick30.to;
  const is7Active = tu === quick7.from && den === quick7.to;

  const apiMeta = tongHopData?.meta;
  const nguong = apiMeta?.nguong_bg_trong_tui;
  const theoNoiDong = tongHopData?.theo_noi_dong || [];
  const theoLoaiHinh = tongHopData?.theo_loai_hinh || [];

  // Chia nhóm dòng bảng: nơi có túi lớn (>= N) và nơi chỉ có túi nhỏ (< N)
  const { largePlaces, smallOnlyPlaces, maxOtherBgLon } = useMemo(() => {
    const large = theoNoiDong
      .filter((r) => (r.bg_trong_tui_lon || 0) > 0)
      .sort((a, b) => {
        if (a.ma === '531120' && b.ma !== '531120') return -1;
        if (b.ma === '531120' && a.ma !== '531120') return 1;
        return b.bg_trong_tui_lon - a.bg_trong_tui_lon || (a.ma < b.ma ? -1 : 1);
      });

    const smallOnly = theoNoiDong
      .filter((r) => (r.bg_trong_tui_lon || 0) === 0 && (r.bg_trong_tui_nho || 0) > 0)
      .sort((a, b) => b.bg_trong_tui_nho - a.bg_trong_tui_nho || (a.ma < b.ma ? -1 : 1));

    const maxOther = Math.max(
      0,
      ...large.filter((r) => r.ma !== '531120').map((r) => r.bg_trong_tui_lon || 0)
    );

    return { largePlaces: large, smallOnlyPlaces: smallOnly, maxOtherBgLon: maxOther };
  }, [theoNoiDong]);

  // Cộng các dòng đang hiện cho 2 dòng tổng ở cuối bảng
  const largeTotals = useMemo(() => {
    return largePlaces.reduce(
      (acc, r) => ({
        bgLon: acc.bgLon + (r.bg_trong_tui_lon || 0),
        bgNho: acc.bgNho + (r.bg_trong_tui_nho || 0),
        soTuiLon: acc.soTuiLon + (r.so_tui_lon || 0),
      }),
      { bgLon: 0, bgNho: 0, soTuiLon: 0 }
    );
  }, [largePlaces]);

  const smallOnlyTotals = useMemo(() => {
    return smallOnlyPlaces.reduce(
      (acc, r) => ({
        bgNho: acc.bgNho + (r.bg_trong_tui_nho || 0),
      }),
      { bgNho: 0 }
    );
  }, [smallOnlyPlaces]);

  // Kiểm đẳng thức và kiểm 6 BCVH ngay trên màn (không tự chỉnh số)
  const integrityWarnings = useMemo(() => {
    if (!tongHopData || !apiMeta) return [];
    const warnings = [];
    const sumNoiDongLon = theoNoiDong.reduce((s, r) => s + (r.bg_trong_tui_lon || 0), 0);
    if (sumNoiDongLon !== (apiMeta.bg_trong_tui_lon || 0)) {
      warnings.push(
        `Chênh tổng cột túi lớn (${formatInt(sumNoiDongLon)}) so với meta (${formatInt(apiMeta.bg_trong_tui_lon || 0)}).`
      );
    }
    const dongVaoLoc = apiMeta.trong_loc?.dong_vao_530100 ?? apiMeta.dong_vao_530100 ?? 0;
    const sumLonNho = (apiMeta.bg_trong_tui_lon || 0) + (apiMeta.bg_trong_tui_nho || 0);
    if (sumLonNho !== dongVaoLoc) {
      warnings.push(
        `Tổng túi lớn + túi nhỏ (${formatInt(sumLonNho)}) khác tổng hàng vào 530100 (${formatInt(dongVaoLoc)}).`
      );
    }
    const excludedSet = new Set((apiMeta.bcvh_da_loai || []).map((b) => b.ma));
    const leaked = theoNoiDong.filter((r) => excludedSet.has(r.ma)).map((r) => r.ma);
    if (leaked.length > 0) {
      warnings.push(`Phát hiện mã BCVH Huế trong bảng nơi đóng: ${leaked.join(', ')}.`);
    }
    return warnings;
  }, [tongHopData, apiMeta, theoNoiDong]);

  // Chuỗi loại hình cho chú thích dưới bảng
  const loaiHinhCaption = useMemo(() => {
    if (!theoLoaiHinh.length) return '';
    const mapByNhom = Object.fromEntries(theoLoaiHinh.map((x) => [x.nhom, x]));
    const totalBgLon = apiMeta?.bg_trong_tui_lon || 0;
    const order = ['531120', 'GD2_GD3', 'VHX', 'GD1', 'KHAC'];
    const parts = [];
    for (const key of order) {
      const item = mapByNhom[key];
      if (!item) continue;
      const val = item.bg_trong_tui_lon || 0;
      if (key === 'KHAC' && val <= 0) continue;
      const label = LOAI_HINH_LABEL_MAP[key] || key;
      if (val === 0) {
        parts.push(`${label}: 0`);
      } else {
        const pct = totalBgLon > 0 ? formatDecimal((val / totalBgLon) * 100, 1) : '0';
        if (key === '531120') {
          parts.push(`${label}: ${formatInt(val)} (${pct}%)`);
        } else {
          parts.push(`${label}: ${formatInt(val)} (${item.so_noi_dong_tui_lon || 0} nơi, ${pct}%)`);
        }
      }
    }
    return parts.join('; ');
  }, [theoLoaiHinh, apiMeta]);

  const handleRowClick = (row) => {
    if (selectedNoiDong?.ma === row.ma) {
      setSelectedNoiDong(null);
      setDsData(null);
      return;
    }
    setSelectedNoiDong(row);
    setChiTuiLon(true);
    setDsPage(1);
  };

  if (forbidden) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">Tài khoản không có quyền xem</span>
        </div>
      </div>
    );
  }

  const dongVaoTong = apiMeta?.trong_loc?.dong_vao_530100 ?? apiMeta?.dong_vao_530100 ?? 0;
  const isEmptyData =
    tongHopData &&
    !loading &&
    !errorMsg &&
    (tongHopData.co_du_lieu === false || (theoNoiDong.length === 0 && dongVaoTong === 0));

  return (
    <div className="px-4 sm:px-6 py-4 max-w-[1400px] mx-auto space-y-4">
      {/* Tiêu đề khối + Bộ lọc */}
      <div className="bg-white border border-[#E4D5AE] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#4A1D6E]">
              {nguong !== undefined && nguong !== null
                ? `Nơi đóng chuyến thư vào 530100 có hàng nội tỉnh trong túi từ ${nguong} BG trở lên`
                : 'Nơi đóng chuyến thư vào 530100'}
            </h2>
            {tongHopData?.nguon_xuat_luc_moi_nhat && (
              <p className="text-xs text-[#7A6A80] mt-0.5">
                Dữ liệu đến {tongHopData.nguon_xuat_luc_moi_nhat}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#5A4A62]">Tải xuống:</span>
            <ExcelDropdownButton
              tu={tu}
              den={den}
              loaiHinh={loaiHinh}
              disabled={!tu || !den || !!rangeError || loading}
            />
          </div>
        </div>

        {/* Hàng bộ lọc */}
        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-[#F0E8D4]">
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-xs font-semibold text-[#5A4A62] self-center mr-1">
              Khoảng ngày:
            </span>
            <label className="flex flex-col gap-1 text-xs text-[#5A4A62]">
              <span>Từ ngày</span>
              <input
                type="date"
                value={tu}
                onChange={(e) => setTu(e.target.value)}
                className="px-2.5 py-2 min-h-[44px] text-xs bg-white border border-[#D9CBA8] rounded-lg text-[#2A1B33]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#5A4A62]">
              <span>Đến ngày</span>
              <input
                type="date"
                value={den}
                onChange={(e) => setDen(e.target.value)}
                className="px-2.5 py-2 min-h-[44px] text-xs bg-white border border-[#D9CBA8] rounded-lg text-[#2A1B33]"
              />
            </label>
            <button
              type="button"
              onClick={() => handleQuickRange(30)}
              className={`px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                is30Active
                  ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                  : 'bg-[#FAF6EC] text-[#2A1B33] border-[#D9CBA8] hover:bg-[#F3EDE0]'
              }`}
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(7)}
              className={`px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                is7Active
                  ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                  : 'bg-[#FAF6EC] text-[#2A1B33] border-[#D9CBA8] hover:bg-[#F3EDE0]'
              }`}
            >
              7 ngày
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <span className="text-xs font-semibold text-[#5A4A62] mr-1">
              Loại hình nơi đóng:
            </span>
            {LOAI_HINH_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLoaiHinh(opt.id)}
                className={`px-3 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  loaiHinh === opt.id
                    ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                    : 'bg-white text-[#5A4A62] border-[#D9CBA8] hover:bg-[#FAF6EC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trạng thái chưa chọn ngày */}
      {(!tu || !den) && !loading && !rangeError && (
        <div className="bg-[#FFFBEF] border border-[#E4D5AE] rounded-xl p-6 text-center text-sm text-[#5A4A62]">
          Chọn «30 ngày», «7 ngày» hoặc nhập đủ «Từ ngày» và «Đến ngày» để xem số liệu.
        </div>
      )}

      {/* Lỗi khoảng ngày > 31 ngày */}
      {rangeError && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-2.5 text-amber-900 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
          <span>{rangeError}</span>
        </div>
      )}

      {/* Trạng thái đang tải */}
      {loading && (
        <div className="bg-white border border-[#E4D5AE] rounded-xl p-6 flex items-center justify-center gap-2.5 text-sm text-[#4A1D6E] font-medium">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>Đang tải, lần đầu có thể mất vài giây</span>
        </div>
      )}

      {/* Trạng thái lỗi API */}
      {errorMsg && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2.5 text-red-700 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Trạng thái rỗng */}
      {isEmptyData && (
        <div className="bg-white border border-[#E4D5AE] rounded-xl p-6 text-center text-sm text-[#5A4A62]">
          Không có hàng trong khoảng này
        </div>
      )}

      {/* Cảnh báo kiểm đẳng thức nếu có */}
      {integrityWarnings.length > 0 && !loading && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-1 text-xs text-red-800">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Cảnh báo đối chiếu số liệu từ API</span>
          </div>
          {integrityWarnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Nội dung chính khi có dữ liệu */}
      {tongHopData && !loading && !errorMsg && !rangeError && !isEmptyData && nguong !== undefined && (
        <>
          {/* Hai ô tổng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E4D5AE] rounded-xl p-4">
              <div className="text-xs font-semibold text-[#7A6A80] uppercase tracking-wide">
                Sản lượng
              </div>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-extrabold text-[#4A1D6E] tabular-nums">
                  {formatInt(apiMeta.bg_trong_tui_lon || 0)}
                </span>
                <span className="text-sm text-[#5A4A62]">
                  bưu gửi trong {formatInt(apiMeta.so_tui_lon || 0)} túi
                </span>
              </div>
            </div>

            <div className="bg-white border border-[#E4D5AE] rounded-xl p-4">
              <div className="text-xs font-semibold text-[#7A6A80] uppercase tracking-wide">
                Số BC/VHX đóng
              </div>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-extrabold text-[#4A1D6E] tabular-nums">
                  {formatInt(apiMeta.so_noi_dong_tui_lon || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Dải sản lượng theo ngày */}
          {stripData?.theo_ngay && (
            <DaiSanLuongTheoNgay
              days={stripData.theo_ngay}
              tu={tu}
              den={den}
              nguong={nguong}
              nguonXuatLucMoiNhat={
                stripData.nguon_xuat_luc_moi_nhat || tongHopData.nguon_xuat_luc_moi_nhat
              }
            />
          )}

          {/* Biểu đồ chấm */}
          <DotPlotTuiLon places={largePlaces} nguong={nguong} />

          {/* Bảng: Chi tiết từng nơi đóng */}
          <div className="bg-white border border-[#E4D5AE] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#4A1D6E]">Chi tiết từng nơi đóng</h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF5E8] border-y border-[#E4D5AE] text-[#4A1D6E]">
                    <th className="text-left py-2.5 px-3 font-bold">Nơi đóng chuyến thư</th>
                    <th className="text-right py-2.5 px-3 font-bold">
                      Hàng trong túi từ {nguong} BG trở lên
                    </th>
                    <th className="text-right py-2.5 px-3 font-bold">
                      Hàng trong túi dưới {nguong} BG
                    </th>
                    <th className="text-right py-2.5 px-3 font-bold">
                      Số túi từ {nguong} BG trở lên
                    </th>
                    <th className="text-right py-2.5 px-3 font-bold">
                      Túi nhiều nhất (bưu gửi)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {largePlaces.map((r) => {
                    const is531120 = r.ma === '531120';
                    const isSelected = selectedNoiDong?.ma === r.ma;
                    const p531120 =
                      is531120 && (apiMeta.bg_trong_tui_lon || 0) > 0
                        ? Math.round((r.bg_trong_tui_lon / apiMeta.bg_trong_tui_lon) * 100)
                        : 0;
                    const barPct =
                      !is531120 && maxOtherBgLon > 0
                        ? Math.round((r.bg_trong_tui_lon / maxOtherBgLon) * 100)
                        : 0;

                    return (
                      <tr
                        key={r.ma}
                        onClick={() => handleRowClick(r)}
                        className={`border-b border-[#F0E8D4] cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#F5EEFA]'
                            : is531120
                              ? 'bg-[#FFFBEF] hover:bg-[#FFF6DC]'
                              : 'hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#2A1B33] tabular-nums">{r.ma}</span>
                            <span className="text-[#2A1B33]">
                              {r.ten || 'chưa có tên'}
                            </span>
                            {r.loai_hinh && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#F3EDE0] text-[#5A4A62] border border-[#E4D5AE]">
                                {r.loai_hinh}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {is531120 ? (
                            <span className="font-bold text-[#92400E] tabular-nums">
                              {formatInt(r.bg_trong_tui_lon)} ({p531120}% sản lượng)
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 h-2 bg-[#F3EDE0] rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-[#4A1D6E] rounded-full"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <span className="font-semibold text-[#2A1B33] tabular-nums min-w-[36px]">
                                {formatInt(r.bg_trong_tui_lon)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#5A4A62]">
                          {formatInt(r.bg_trong_tui_nho)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#2A1B33]">
                          {formatInt(r.so_tui_lon)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[#2A1B33]">
                          {formatInt(r.so_bg_tui_lon_nhat)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Dòng cuối 1: Cộng x nơi có túi từ N BG trở lên */}
                  <tr className="bg-[#FBF7EC] border-b border-[#E4D5AE] font-semibold text-[#2A1B33]">
                    <td className="py-2.5 px-3">
                      Cộng {formatInt(largePlaces.length)} nơi có túi từ {nguong} BG trở lên
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(largeTotals.bgLon)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(largeTotals.bgNho)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(largeTotals.soTuiLon)}
                    </td>
                    <td className="py-2.5 px-3 text-right">—</td>
                  </tr>

                  {/* Dòng cuối 2: y nơi chỉ có túi dưới N BG (bấm để mở) */}
                  <tr
                    onClick={() => setShowSmallOnly((v) => !v)}
                    className="bg-[#FAF6EC] border-b border-[#E4D5AE] text-[#5A4A62] cursor-pointer hover:bg-[#F3EDE0]"
                  >
                    <td className="py-2.5 px-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {showSmallOnly ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {formatInt(smallOnlyPlaces.length)} nơi chỉ có túi dưới {nguong} BG (bấm để mở)
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">0</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">
                      {formatInt(smallOnlyTotals.bgNho)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">0</td>
                    <td className="py-2.5 px-3 text-right">—</td>
                  </tr>

                  {showSmallOnly &&
                    smallOnlyPlaces.map((r) => (
                      <tr
                        key={`small-${r.ma}`}
                        onClick={() => handleRowClick(r)}
                        className="bg-white border-b border-[#F0E8D4] text-[#5A4A62] cursor-pointer hover:bg-[#FAF6EC]"
                      >
                        <td className="py-2 pl-8 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#2A1B33] tabular-nums">{r.ma}</span>
                            <span>{r.ten || 'chưa có tên'}</span>
                            {r.loai_hinh && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#F3EDE0] border border-[#E4D5AE]">
                                {r.loai_hinh}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">0</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {formatInt(r.bg_trong_tui_nho)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">0</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {formatInt(r.so_bg_tui_lon_nhat)}
                        </td>
                      </tr>
                    ))}

                  {/* Dòng cuối 3: Cộng z nơi có hàng vào 530100 */}
                  <tr className="bg-[#FAF5E8] font-bold text-[#4A1D6E]">
                    <td className="py-2.5 px-3">
                      Cộng {formatInt(theoNoiDong.length)} nơi có hàng vào 530100
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(apiMeta.bg_trong_tui_lon || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(apiMeta.bg_trong_tui_nho || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatInt(apiMeta.so_tui_lon || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chú thích dưới bảng */}
            <p className="text-xs text-[#5A4A62] leading-relaxed">
              531120 hiện số liệu riêng; thanh của các nơi còn lại chia theo mức lớn nhất của nhóm đó, không so với 531120. Theo loại hình (BG trong túi từ {nguong} BG trở lên): {loaiHinhCaption}. Hai dòng cuối nối số với tổng hàng vào 530100 trong khoảng ngày ({formatInt(dongVaoTong)}).
            </p>
          </div>

          {/* Khối thu gọn 1: Danh sách bưu gửi của nơi đóng */}
          <div className="bg-white border border-[#E4D5AE] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#4A1D6E] shrink-0" />
                  <h3 className="text-sm font-bold text-[#4A1D6E]">
                    Danh sách bưu gửi của nơi đóng
                    {selectedNoiDong
                      ? ` · ${selectedNoiDong.ma} (${selectedNoiDong.ten || 'chưa có tên'})`
                      : ''}
                  </h3>
                </div>
                <p className="text-xs text-[#7A6A80] mt-0.5">
                  bấm một dòng ở bảng trên để mở: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng; hộp chọn «Chỉ túi từ {nguong} BG trở lên» bật sẵn
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ExcelDropdownButton
                  tu={tu}
                  den={den}
                  loaiHinh={loaiHinh}
                  disabled={!tu || !den || !!rangeError || loading}
                />
                {selectedNoiDong && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNoiDong(null);
                      setDsData(null);
                    }}
                    className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#D9CBA8] text-[#5A4A62] hover:bg-[#FAF6EC] cursor-pointer"
                    aria-label="Đóng danh sách bưu gửi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {selectedNoiDong && (
              <div className="space-y-3 pt-2 border-t border-[#F0E8D4]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A1B33] cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={chiTuiLon}
                      onChange={(e) => {
                        setChiTuiLon(e.target.checked);
                        setDsPage(1);
                      }}
                      className="w-4 h-4 accent-[#4A1D6E] rounded cursor-pointer"
                    />
                    <span>Chỉ túi từ {nguong} BG trở lên</span>
                  </label>

                  {dsData?.pagination && (
                    <span className="text-xs text-[#7A6A80] tabular-nums">
                      Tổng {formatInt(dsData.pagination.total)} bưu gửi · trang{' '}
                      {dsData.pagination.page}/{Math.max(1, dsData.pagination.total_pages)}
                    </span>
                  )}
                </div>

                {dsLoading && (
                  <div className="py-4 flex items-center justify-center gap-2 text-xs text-[#4A1D6E]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tải danh sách…</span>
                  </div>
                )}

                {dsError && !dsLoading && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {dsError}
                  </div>
                )}

                {dsData && !dsLoading && !dsError && (
                  <>
                    {dsData.items?.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#7A6A80]">
                        Không có bưu gửi phù hợp.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#FAF5E8] border-y border-[#E4D5AE] text-[#4A1D6E]">
                              <th className="text-left py-2 px-2.5 font-bold">Số hiệu</th>
                              <th className="text-left py-2 px-2.5 font-bold">Ngày hàng đến</th>
                              <th className="text-left py-2 px-2.5 font-bold">Ngày đóng chuyến thư</th>
                              <th className="text-right py-2 px-2.5 font-bold">Số BG trong túi</th>
                              <th className="text-left py-2 px-2.5 font-bold">Mã túi</th>
                              <th className="text-left py-2 px-2.5 font-bold">BCVH đích</th>
                              <th className="text-left py-2 px-2.5 font-bold">Dịch vụ</th>
                              <th className="text-right py-2 px-2.5 font-bold">Khối lượng (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dsData.items.map((item) => (
                              <tr
                                key={`${item.shbg}-${item.khoa_tui || ''}`}
                                className="border-b border-[#F0E8D4] hover:bg-[#FAF6EC]"
                              >
                                <td className="py-2 px-2.5 font-mono font-semibold text-[#2A1B33]">
                                  {item.shbg}
                                </td>
                                <td className="py-2 px-2.5 tabular-nums text-[#2A1B33]">
                                  {formatDdMmYyyy(item.ngay_den)}
                                </td>
                                <td className="py-2 px-2.5 tabular-nums text-[#5A4A62]">
                                  {item.ngay_dong_chuyen ? formatDdMmYyyy(item.ngay_dong_chuyen) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums font-semibold text-[#2A1B33]">
                                  {formatInt(item.so_bg_trong_tui)}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[#5A4A62]">
                                  {item.ma_tui || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-[#2A1B33]">
                                  {item.bcvh_dich?.ten
                                    ? `${item.bcvh_dich.ma} · ${item.bcvh_dich.ten}`
                                    : item.bcvh_dich?.ma || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-[#5A4A62]">
                                  {item.dich_vu?.ten || item.dich_vu?.ma || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums text-[#2A1B33]">
                                  {formatKgDecimal(item.kg)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {dsData.pagination && dsData.pagination.total_pages > 1 && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={dsPage <= 1}
                          onClick={() => setDsPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 min-h-[44px] text-xs font-medium bg-white border border-[#D9CBA8] rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Trang trước
                        </button>
                        <button
                          type="button"
                          disabled={dsPage >= dsData.pagination.total_pages}
                          onClick={() =>
                            setDsPage((p) => Math.min(dsData.pagination.total_pages, p + 1))
                          }
                          className="px-3 py-1.5 min-h-[44px] text-xs font-medium bg-white border border-[#D9CBA8] rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Trang sau
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Khối thu gọn 2: Cách tính và giới hạn */}
          <div className="bg-white border border-[#E4D5AE] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="w-full px-4 py-3 min-h-[44px] flex items-center justify-between text-left hover:bg-[#FAF6EC] transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-sm font-bold text-[#4A1D6E]">
                <Info className="w-4 h-4 shrink-0" />
                <span>Cách tính và giới hạn · mở ra để đọc</span>
              </span>
              {showGuide ? (
                <ChevronDown className="w-4 h-4 text-[#5A4A62] shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#5A4A62] shrink-0" />
              )}
            </button>

            {showGuide && (
              <ul className="px-6 pb-4 pt-1 list-disc space-y-1.5 text-xs text-[#5A4A62] leading-relaxed border-t border-[#F0E8D4]">
                <li>
                  Túi từ {nguong} bưu gửi trở lên là dấu hiệu cần nhắc, chưa phải kết luận đóng sai. Cỡ túi chỉ đếm bưu gửi nội tỉnh; hàng đi tỉnh khác nằm cùng túi không tính.
                </li>
                <li>
                  Ngưỡng {nguong} là mặc định, đặt ở tham số hệ thống. Bảng không gồm 6 BCVH làm nơi đóng.
                </li>
                <li>531120: chưa biết có thoả thuận đóng chuyến riêng hay không.</li>
                <li>
                  Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc; hệ thống chưa có cột điểm chấp nhận. Chưa tính hàng hoàn.
                </li>
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

