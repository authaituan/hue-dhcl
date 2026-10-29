import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Clock, RefreshCw, AlertCircle, Info } from 'lucide-react';
import QuyThoiGianDateRangePicker from '../quythoigian/QuyThoiGianDateRangePicker';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive,
  formatInt,
  formatPercent,
  formatDdMmYyyy,
  formatDdMm,
} from '../quythoigian/quyThoiGianFormatters';
import {
  formatKg,
  formatDecimal,
  getThuTiengViet,
  formatDateTimeWithoutSeconds,
} from './kttFormatters';
import {
  fetchKttMeta,
  fetchKttHangDenTongHop,
  fetchKttHangDenTheoGio,
  fetchKttHangDenTheoDuongThu,
  fetchKttHangDenXe,
} from './kttApi';
import KttTooltip from './KttTooltip';

// Danh sách 6 BCVH chuẩn của Huế theo thứ tự canvas A5
const BCVH_ORDER = [
  { ma: '533140', ten: 'Thuận Hóa' },
  { ma: '536250', ten: 'Hương Thủy' },
  { ma: '535470', ten: 'Hương Trà' },
  { ma: '537015', ten: 'Thuận An' },
  { ma: '537220', ten: 'Phú Lộc' },
  { ma: '535790', ten: 'A Lưới' },
];

// Bảng màu phân biệt cho các đường thư hàng đầu (tối đa 8 + khác)
const DUONG_THU_COLORS = [
  { bg: 'bg-[#1E40AF]', text: 'text-[#1E40AF]', border: 'border-[#1E40AF]', hex: '#1E40AF' }, // Navy
  { bg: 'bg-[#0D9488]', text: 'text-[#0D9488]', border: 'border-[#0D9488]', hex: '#0D9488' }, // Teal
  { bg: 'bg-[#D97706]', text: 'text-[#D97706]', border: 'border-[#D97706]', hex: '#D97706' }, // Amber
  { bg: 'bg-[#7C3AED]', text: 'text-[#7C3AED]', border: 'border-[#7C3AED]', hex: '#7C3AED' }, // Violet
  { bg: 'bg-[#E11D48]', text: 'text-[#E11D48]', border: 'border-[#E11D48]', hex: '#E11D48' }, // Rose
  { bg: 'bg-[#059669]', text: 'text-[#059669]', border: 'border-[#059669]', hex: '#059669' }, // Emerald
  { bg: 'bg-[#D946EF]', text: 'text-[#D946EF]', border: 'border-[#D946EF]', hex: '#D946EF' }, // Fuchsia
  { bg: 'bg-[#2563EB]', text: 'text-[#2563EB]', border: 'border-[#2563EB]', hex: '#2563EB' }, // Blue
];
const COLOR_KHAC = { bg: 'bg-[#6B7280]', text: 'text-[#6B7280]', border: 'border-[#6B7280]', hex: '#6B7280' };

/**
 * Tính màu cho ô nhiệt A5 cột Huế (tím)
 */
function getPurpleHeatStyle(ratio) {
  if (ratio === null || ratio === undefined || isNaN(ratio) || ratio < 0.005) {
    return { bg: 'bg-white', text: 'text-gray-400 font-normal' };
  }
  if (ratio < 0.05) return { bg: 'bg-[#FAF5FF]', text: 'text-[#6B21A8]' };
  if (ratio < 0.15) return { bg: 'bg-[#F3E8FF]', text: 'text-[#6B21A8] font-semibold' };
  if (ratio < 0.30) return { bg: 'bg-[#E9D5FF]', text: 'text-[#581C87] font-semibold' };
  if (ratio < 0.50) return { bg: 'bg-[#C084FC]', text: 'text-white font-bold' };
  return { bg: 'bg-[#7E22CE]', text: 'text-white font-bold' };
}

/**
 * Tính màu cho ô nhiệt A5 cột Ngoài Huế (đỏ)
 */
function getRedHeatStyle(ratio) {
  if (ratio === null || ratio === undefined || isNaN(ratio) || ratio < 0.005) {
    return { bg: 'bg-white', text: 'text-gray-400 font-normal' };
  }
  if (ratio < 0.05) return { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]' };
  if (ratio < 0.15) return { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B] font-semibold' };
  if (ratio < 0.30) return { bg: 'bg-[#FECACA]', text: 'text-[#7F1D1D] font-semibold' };
  if (ratio < 0.50) return { bg: 'bg-[#F87171]', text: 'text-white font-bold' };
  return { bg: 'bg-[#B91C1C]', text: 'text-white font-bold' };
}

function renderA5CellTooltip(rowName, colName, count, ratio, total, isFooter = false) {
  const ariaLabel = `${rowName} → ${colName} · ${formatInt(count)} bưu gửi (${formatPercent(ratio)})`;
  const content = (
    <div className="space-y-1">
      <div className="font-bold border-b border-gray-700 pb-1 text-white">
        {rowName} → {colName}
      </div>
      <div className="space-y-0.5 text-gray-200">
        <div>
          Số bưu gửi: <strong className="text-white tabular-nums">{formatInt(count)}</strong> bưu gửi
        </div>
        <div>
          {isFooter ? 'Tỷ trọng toàn mạng:' : 'Tỷ trọng của tuyến:'}{' '}
          <strong className="text-amber-300 tabular-nums">{formatPercent(ratio)}</strong>
        </div>
        <div>
          {isFooter ? 'Tổng bưu gửi đến:' : 'Tổng tuyến đường thư:'}{' '}
          <span className="text-gray-400 tabular-nums">{formatInt(total)}</span> bưu gửi
        </div>
      </div>
    </div>
  );
  return { ariaLabel, content };
}

export default function KttHangDen({ authUser }) {
  // Khoảng ngày: mặc định 7 ngày kết thúc ở ngày của độ mới dữ liệu
  const [dateRange, setDateRange] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // Meta dữ liệu (độ mới)
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Dữ liệu 4 endpoint A
  const [tongHopData, setTongHopData] = useState(null);
  const [theoGioData, setTheoGioData] = useState(null);
  const [theoDuongThuData, setTheoDuongThuData] = useState(null);
  const [xeData, setXeData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Chống stale request
  const reqIdRef = useRef(0);

  // 1. Tải meta lúc khởi tạo để tính khoảng 7 ngày mặc định
  useEffect(() => {
    let active = true;
    setMetaLoading(true);

    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setMeta(res.data);
          const rawLuc = res.data.nguon_xuat_luc_moi_nhat;
          const latestDay =
            rawLuc && typeof rawLuc === 'string' && rawLuc.length >= 10
              ? rawLuc.slice(0, 10)
              : getTodayVnYmd();
          setDateRange({
            from: shiftDay(latestDay, -6), // đúng 7 ngày inclusive kết thúc ở latestDay
            to: latestDay,
          });
        } else {
          const today = getTodayVnYmd();
          setDateRange({
            from: shiftDay(today, -6),
            to: today,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        const today = getTodayVnYmd();
        setDateRange({
          from: shiftDay(today, -6),
          to: today,
        });
      })
      .finally(() => {
        if (active) setMetaLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Kiểm tra khoảng ngày (tối đa 31 ngày)
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return `Khoảng ngày tối đa 31 ngày (đang chọn ${days} ngày).`;
    return null;
  }, []);

  // 3. Tải song song 4 endpoint của A
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) return;

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [thRes, tgRes, dtRes, xeRes] = await Promise.all([
        fetchKttHangDenTongHop({ tu: dateRange.from, den: dateRange.to }),
        fetchKttHangDenTheoGio({ tu: dateRange.from, den: dateRange.to }),
        fetchKttHangDenTheoDuongThu({ tu: dateRange.from, den: dateRange.to, top: 200 }),
        fetchKttHangDenXe({ tu: dateRange.from, den: dateRange.to }),
      ]);

      if (reqIdRef.current !== reqId) return;

      if (!thRes.ok) throw new Error(thRes.error || 'Lỗi tải tổng hợp hàng đến');
      if (!tgRes.ok) throw new Error(tgRes.error || 'Lỗi tải phân bổ theo giờ');
      if (!dtRes.ok) throw new Error(dtRes.error || 'Lỗi tải thống kê theo đường thư');
      if (!xeRes.ok) throw new Error(xeRes.error || 'Lỗi tải danh sách xe Cấp 1');

      setTongHopData(thRes.data);
      setTheoGioData(tgRes.data);
      setTheoDuongThuData(dtRes.data);
      setXeData(xeRes.data);
    } catch (e) {
      if (reqIdRef.current === reqId) {
        setError(e.message || 'Lỗi kết nối khi tải số liệu hàng đến.');
      }
    } finally {
      if (reqIdRef.current === reqId) {
        setLoading(false);
      }
    }
  }, [dateRange, validateRange]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      loadData();
    }
  }, [dateRange, loadData]);

  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // Trạng thái dữ liệu
  const isChuaCoDuLieu =
    tongHopData?.ly_do === 'CHUA_CO_DU_LIEU' ||
    (!loading && tongHopData && !tongHopData.co_du_lieu);
  const cuaSo = tongHopData?.cua_so_thuc_te;
  const doMoi = tongHopData?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;
  const soNgayCoDuLieu = cuaSo?.so_ngay_co_du_lieu || countDaysInclusive(dateRange?.from, dateRange?.to) || 1;

  // Kiểm tra có số kg thật không: kg > 0 và số bưu gửi thiếu khối lượng không bằng toàn bộ số bưu gửi
  const hasKg = useMemo(() => {
    if (!tongHopData) return false;
    const kg = Number(tongHopData.kg);
    if (!kg || isNaN(kg) || kg <= 0) return false;
    const thieuKg = tongHopData.meta?.shbg_thieu_khoi_luong;
    if (thieuKg !== undefined && thieuKg !== null && thieuKg === tongHopData.shbg) {
      return false;
    }
    return true;
  }, [tongHopData]);

  // Danh sách top đường thư và ánh xạ màu sắc
  const topDtList = theoGioData?.duong_thu_hang_dau || [];
  const colorMap = useMemo(() => {
    const map = new Map();
    topDtList.forEach((ma, idx) => {
      map.set(ma, DUONG_THU_COLORS[idx % DUONG_THU_COLORS.length]);
    });
    return map;
  }, [topDtList]);

  const getDtColor = (dtMa) => {
    return colorMap.get(dtMa) || COLOR_KHAC;
  };

  // 1. Thẻ tổng quan số liệu
  const tongShbg = tongHopData?.shbg || 0;
  const shbgTbNgay = tongHopData?.shbg_tb_moi_ngay;
  const tongKg = tongHopData?.kg;
  const kgTbShbg = tongHopData?.kg_tb_moi_shbg;
  const tongXe = tongHopData?.xe || 0;
  const xeTbNgay = tongHopData?.xe_tb_moi_ngay;
  const dich = tongHopData?.dich;
  const tpHueShbg = dich?.tp_hue?.shbg || 0;
  const tpHueTyLe = dich?.tp_hue?.ty_le;
  const tpHueXacDinhBcvh = dich?.tp_hue?.xac_dinh_bcvh || 0;
  const ngoaiHueShbg = dich?.ngoai_hue?.shbg || 0;
  const ngoaiHueTyLe = tongShbg > 0 ? ngoaiHueShbg / tongShbg : null;
  const quangTriShbg = dich?.ngoai_hue?.quang_tri || 0;
  const tinhKhacShbg = (dich?.ngoai_hue?.tinh_khac || 0) + (dich?.ngoai_hue?.khong_ro || 0);

  // A1: theo ngày
  const theoNgayList = tongHopData?.theo_ngay || [];
  const maxDailyShbg = useMemo(() => {
    if (!theoNgayList.length) return 1;
    return Math.max(...theoNgayList.map((d) => d.shbg || 0), 1);
  }, [theoNgayList]);

  // A2: xe Cấp 1 theo đường thư
  const theoDuongThuList = theoDuongThuData?.theo_duong_thu || [];
  const xeList = xeData?.xe || [];

  // Gom xe theo đường thư để vẽ timeline A2
  const xeByDuongThu = useMemo(() => {
    const map = new Map();
    // Khởi tạo theo danh sách đường thư
    theoDuongThuList.forEach((dt) => {
      map.set(dt.duong_thu_ma || '', {
        ma: dt.duong_thu_ma,
        ten: dt.duong_thu_ten,
        dotChinh: dt.dot_chinh || [],
        xeList: [],
      });
    });
    // Gán từng xe vào
    xeList.forEach((x) => {
      const ma = x.duong_thu_ma || '';
      let entry = map.get(ma);
      if (!entry) {
        entry = {
          ma: x.duong_thu_ma,
          ten: x.duong_thu_ten,
          dotChinh: [],
          xeList: [],
        };
        map.set(ma, entry);
      }
      entry.xeList.push(x);
    });
    return Array.from(map.values());
  }, [theoDuongThuList, xeList]);

  // A3: 24 giờ
  const theoGioList = theoGioData?.theo_gio || [];
  const maxHourlyShbg = useMemo(() => {
    if (!theoGioList.length) return 1;
    return Math.max(...theoGioList.map((g) => g.shbg || 0), 1);
  }, [theoGioList]);

  // Tạo tên ngắn hiển thị cho đường thư
  const dtTenMap = useMemo(() => {
    const map = new Map();
    theoDuongThuList.forEach((dt) => {
      map.set(dt.duong_thu_ma, dt.duong_thu_ten);
    });
    return map;
  }, [theoDuongThuList]);

  return (
    <div className="space-y-6 px-6 pb-12 max-w-full min-w-0">
      {/* ── ĐẦU TRANG: TIÊU ĐỀ, PHẠM VI SỐ LIỆU & BỘ CHỌN NGÀY ────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hue-h1">A · Hàng đến từ xe Cấp 1</h1>
            {doMoi && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Dữ liệu đến lúc {formatDateTimeWithoutSeconds(doMoi)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2">
            <span>Trung tâm Khai thác · 530100 · Hàng tại KTT</span>
            {cuaSo && cuaSo.tu_ngay && (
              <span className="text-gray-400">
                · Phạm vi số liệu:{' '}
                <strong className="text-gray-700">
                  {formatDdMmYyyy(cuaSo.tu_ngay)} – {formatDdMmYyyy(cuaSo.den_ngay)}
                </strong>
                {cuaSo.so_ngay_co_du_lieu ? ` (${cuaSo.so_ngay_co_du_lieu} ngày có dữ liệu)` : ''}
              </span>
            )}
          </p>
        </div>

        {/* Bộ chọn khoảng ngày */}
        <div className="flex items-center gap-2 shrink-0">
          <QuyThoiGianDateRangePicker
            dateRange={dateRange || { from: '', to: '' }}
            onChangeDateRange={handleDateRangeChange}
            idPrefix="ktt-a-hang-den"
          />
        </div>
      </div>

      {/* Cảnh báo validate ngày nếu chọn quá 31 ngày */}
      {validationError && (
        <div
          className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center gap-2 font-medium"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Hộp lỗi khi gọi API */}
      {error && !validationError && (
        <div
          className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline shrink-0 cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      )}

      {/* Chưa nạp lần nào */}
      {!loading && isChuaCoDuLieu && (
        <div className="bg-white rounded-[14px] p-8 border border-gray-200 text-center text-sm text-gray-500 italic shadow-none">
          Chưa có dữ liệu Hàng tại KTT
        </div>
      )}

      {/* Chỉ báo đang tính khi đổi ngày nhưng đã có dữ liệu cũ */}
      {loading && tongHopData && (
        <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs font-semibold text-[#5A4A62]">
          <span className="w-2 h-2 rounded-full bg-[#1F7A5C] animate-ping" />
          <span>Đang tính số liệu…</span>
        </div>
      )}

      {/* Khung xương khi tải lần đầu */}
      {(!dateRange || metaLoading || (loading && !tongHopData)) && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-[14px] border border-gray-200" />
            ))}
          </div>
          <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-80 bg-white rounded-[14px] border border-gray-200" />
        </div>
      )}

      {/* NỘI DUNG CHÍNH */}
      {tongHopData && !isChuaCoDuLieu && (
        <div
          className={`space-y-6 transition-opacity duration-200 min-w-0 max-w-full ${
            loading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {/* ── 1. NĂM THẺ SỐ LIỆU CHÍNH ────────────────────────────────────── */}
          <div
            className={`grid gap-4 min-w-0 max-w-full ${
              hasKg
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {/* Thẻ 1: Bưu gửi đến */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none flex flex-col justify-between min-w-0">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Bưu gửi đến
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-gray-900 tabular-nums">
                    {formatInt(tongShbg)}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">bưu gửi</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                TB mỗi ngày:{' '}
                <strong className="text-gray-800 font-bold tabular-nums">
                  {shbgTbNgay !== null && shbgTbNgay !== undefined ? formatInt(shbgTbNgay) : '—'}
                </strong>{' '}
                bưu gửi
              </div>
            </div>

            {/* Thẻ 2: Khối lượng (chỉ hiện khi có kg thật) */}
            {hasKg && (
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none flex flex-col justify-between min-w-0">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Khối lượng đến
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div className="text-3xl font-extrabold text-gray-900 tabular-nums">
                      {formatKg(tongKg)}
                    </div>
                    <span className="text-xs font-semibold text-gray-500">kg</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                  TB / bưu gửi:{' '}
                  <strong className="text-gray-800 font-bold tabular-nums">
                    {kgTbShbg !== null && kgTbShbg !== undefined ? formatDecimal(kgTbShbg, 2) : '—'}
                  </strong>{' '}
                  kg
                </div>
              </div>
            )}

            {/* Thẻ 3: Xe Cấp 1 đến */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none flex flex-col justify-between min-w-0">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Xe Cấp 1 đến (BD10)
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-gray-900 tabular-nums">
                    {formatInt(tongXe)}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">xe</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                TB mỗi ngày:{' '}
                <strong className="text-gray-800 font-bold tabular-nums">
                  {xeTbNgay !== null && xeTbNgay !== undefined ? formatDecimal(xeTbNgay, 1) : '—'}
                </strong>{' '}
                xe
              </div>
            </div>

            {/* Thẻ 4: % Đích TP Huế */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none flex flex-col justify-between min-w-0">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  % Đích TP Huế
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-[#1F7A5C] tabular-nums">
                    {formatPercent(tpHueTyLe)}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                <span className="tabular-nums font-bold text-gray-800">{formatInt(tpHueShbg)}</span>{' '}
                bưu gửi (rõ BCVH:{' '}
                <strong className="text-gray-800 font-bold tabular-nums">
                  {formatInt(tpHueXacDinhBcvh)}
                </strong>
                )
              </div>
            </div>

            {/* Thẻ 5: % Đích ngoài Huế */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none flex flex-col justify-between min-w-0">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  % Đích ngoài Huế
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-[#B3202A] tabular-nums">
                    {formatPercent(ngoaiHueTyLe)}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                Quảng Trị:{' '}
                <strong className="text-gray-800 font-bold tabular-nums">
                  {formatInt(quangTriShbg)}
                </strong>{' '}
                · Khác:{' '}
                <strong className="text-gray-800 font-bold tabular-nums">
                  {formatInt(tinhKhacShbg)}
                </strong>
              </div>
            </div>
          </div>

          {/* ── 2. A1: CỘT THEO NGÀY ────────────────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="hue-h2 text-base font-bold text-gray-900">
                  A1 · Lượng hàng và số xe đến theo ngày
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ngày tính theo giờ xác nhận BD10 đến từ xe Cấp 1 (gồm cả túi chuyển tiếp).
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#1F7A5C]" />
                  <span>Bưu gửi đến</span>
                </div>
                {hasKg && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[#0D9488]" />
                    <span>Khối lượng (kg)</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#E0A82E]" />
                  <span>Số xe (BD10)</span>
                </div>
              </div>
            </div>

            {/* Trực quan thanh cột theo ngày */}
            {theoNgayList.length > 0 ? (
              <div className="pt-2 max-w-full">
                <div className="h-56 flex items-end gap-2 sm:gap-3 pb-2 pt-8 border-b border-gray-200 overflow-x-auto md:overflow-x-visible max-w-full">
                  {theoNgayList.map((d) => {
                    const shbgPercent = Math.max(4, Math.round(((d.shbg || 0) / maxDailyShbg) * 100));
                    const thu = getThuTiengViet(d.ngay);
                    const isSunday = d.chu_nhat;

                    const tooltipAria = `${formatDdMm(d.ngay)} (${thu}) · ${formatInt(d.shbg)} bưu gửi${hasKg && d.kg ? ` · ${formatKg(d.kg, { withUnit: true })}` : ''}${d.xe ? ` · ${formatInt(d.xe)} xe BD10` : ''}`;

                    const tooltipContent = (
                      <div className="space-y-1">
                        <div className="font-bold flex items-center justify-between gap-3 border-b border-gray-700 pb-1">
                          <span>{formatDdMmYyyy(d.ngay)} ({thu})</span>
                          {isSunday && <span className="text-purple-300 font-semibold">Chủ nhật</span>}
                        </div>
                        <div className="space-y-0.5 text-gray-200">
                          <div>
                            Bưu gửi đến: <strong className="text-emerald-400 tabular-nums">{formatInt(d.shbg)}</strong> bưu gửi
                          </div>
                          {hasKg && d.kg !== undefined && d.kg !== null && (
                            <div>
                              Khối lượng: <strong className="text-teal-300 tabular-nums">{formatKg(d.kg, { withUnit: true })}</strong>
                            </div>
                          )}
                          {d.xe !== undefined && d.xe !== null && (
                            <div>
                              Số chuyến xe: <strong className="text-white tabular-nums">{formatInt(d.xe)}</strong> BD10
                            </div>
                          )}
                        </div>
                      </div>
                    );

                    return (
                      <KttTooltip
                        key={d.ngay}
                        ariaLabel={tooltipAria}
                        content={tooltipContent}
                        className="flex-1 min-w-[32px] max-w-[56px] h-full flex flex-col justify-end items-center group relative cursor-pointer focus:outline-none"
                      >
                        {/* Số trên đỉnh cột */}
                        <div className="text-[10px] font-bold text-gray-700 tabular-nums mb-1 pointer-events-none">
                          {formatInt(d.shbg)}
                        </div>

                        {/* Cột bưu gửi */}
                        <div
                          style={{ height: `${shbgPercent}%` }}
                          className={`w-full max-w-[32px] rounded-t-[4px] transition-all group-focus:ring-2 group-focus:ring-[#4A1D6E] ${
                            isSunday ? 'bg-[#E0A82E]' : 'bg-[#1F7A5C]'
                          }`}
                        />

                        {/* Nhãn ngày và thứ bên dưới trục */}
                        <div className="mt-2 text-center pointer-events-none">
                          <div
                            className={`text-[11px] font-bold tabular-nums ${
                              isSunday ? 'text-[#B3202A]' : 'text-gray-800'
                            }`}
                          >
                            {formatDdMm(d.ngay)}
                          </div>
                          <div
                            className={`text-[10px] truncate max-w-[56px] ${
                              isSunday ? 'text-[#B3202A] font-semibold' : 'text-gray-500'
                            }`}
                          >
                            {isSunday ? 'CN' : thu.replace('Thứ ', 'T')}
                          </div>
                        </div>
                      </KttTooltip>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-500 italic">
                Không có dữ liệu theo ngày
              </div>
            )}
          </div>

          {/* ── 3. A2: CÁC ĐỢT XE TRÊN TRỤC THỜI GIAN (0h–24h) ──────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="hue-h2 text-base font-bold text-gray-900">
                  A2 · Giờ xe Cấp 1 đến KTT theo từng đường thư
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mỗi chấm là một xe tại giờ xác nhận BD10 đến; kích thước chấm tương ứng với lượng
                  bưu gửi trên xe.
                </p>
              </div>
              <div className="text-xs text-gray-500 italic">Trục giờ trong ngày (0h – 24h)</div>
            </div>

            {/* Trục thời gian A2 */}
            {xeByDuongThu.length > 0 ? (
              <div className="overflow-x-auto pt-2">
                <div className="min-w-[760px] space-y-3">
                  {/* Tiêu đề trục giờ */}
                  <div className="flex items-center text-[10px] font-semibold text-gray-400 border-b border-gray-200 pb-1">
                    <div className="w-56 shrink-0 text-left pl-2">Đường thư đến</div>
                    <div className="flex-1 relative h-4">
                      <span className="absolute left-0">0h</span>
                      <span className="absolute left-[16.6%]">4h</span>
                      <span className="absolute left-[33.3%]">8h</span>
                      <span className="absolute left-[50%]">12h</span>
                      <span className="absolute left-[66.6%]">16h</span>
                      <span className="absolute left-[83.3%]">20h</span>
                      <span className="absolute right-0">24h</span>
                    </div>
                    <div className="w-48 shrink-0 text-right pr-2">Đợt chính [giờ (%)]</div>
                  </div>

                  {/* Từng dòng đường thư */}
                  {xeByDuongThu.map((entry) => {
                    const color = getDtColor(entry.ma);
                    const dotText =
                      entry.dotChinh.length > 0
                        ? entry.dotChinh
                            .map((d) => `${d.gio} (${formatPercent(d.ty_le)})`)
                            .join(', ')
                        : '—';

                    return (
                      <div
                        key={entry.ma || entry.ten}
                        className="flex items-center py-2 hover:bg-gray-50/80 rounded-lg transition-colors border-b border-gray-100 last:border-0"
                      >
                        {/* Tên đường thư */}
                        <div className="w-56 shrink-0 pl-2 pr-3">
                          <div className="text-xs font-bold text-gray-900 truncate" title={entry.ten}>
                            {entry.ten || '(chưa có tên)'}
                          </div>
                          <div className="text-[10px] text-gray-500 tabular-nums">
                            {entry.ma || '(không rõ mã)'} · {entry.xeList.length} xe
                          </div>
                        </div>

                        {/* Vùng vẽ các chấm xe trên trục 0h-24h */}
                        <div className="flex-1 relative h-7 bg-gray-50/50 rounded border border-gray-200/60 mx-1">
                          {/* Các đường kẻ dọc mốc 4h, 8h, 12h, 16h, 20h */}
                          <div className="absolute inset-0 flex justify-between pointer-events-none opacity-25">
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                            <div className="w-px h-full bg-gray-400" />
                          </div>

                          {/* Render từng chấm xe */}
                          {entry.xeList.map((x, idx) => {
                            // Giờ dạng HH:mm
                            const timeParts = (x.gio || '').split(':');
                            const hh = Number(timeParts[0]) || 0;
                            const mm = Number(timeParts[1]) || 0;
                            const minutes = hh * 60 + mm;
                            const leftPercent = Math.min(99, Math.max(1, (minutes / 1440) * 100));

                            // Kích thước chấm tương đối theo số bưu gửi (từ 8px đến 20px)
                            const sizePx = Math.max(8, Math.min(20, 8 + Math.round(Math.sqrt(x.shbg || 1) * 2)));

                            const shortBd10 = x.bd10
                              ? String(x.bd10).length > 6
                                ? `...${String(x.bd10).slice(-6)}`
                                : String(x.bd10)
                              : '—';
                            const xeThuStr = `xe thứ ${idx + 1}`;
                            const tooltipAria = `${entry.ten || entry.ma} · ${x.gio} · BD10 ${shortBd10} (${xeThuStr}) · ${formatInt(x.shbg)} bưu gửi${hasKg && x.kg ? ` · ${formatKg(x.kg, { withUnit: true })}` : ''}`;

                            const tooltipContent = (
                              <div className="space-y-1">
                                <div className="font-bold flex items-center justify-between gap-3 border-b border-gray-700 pb-1">
                                  <span>{entry.ten || entry.ma}</span>
                                  <span className="text-amber-300 font-semibold">{x.gio}</span>
                                </div>
                                <div className="space-y-0.5 text-gray-200">
                                  <div>
                                    BD10: <strong className="text-white font-mono">{shortBd10}</strong> ({xeThuStr})
                                  </div>
                                  <div>
                                    Số lượng: <strong className="text-emerald-400 tabular-nums">{formatInt(x.shbg)}</strong> bưu gửi
                                  </div>
                                  {hasKg && x.kg !== undefined && x.kg !== null && (
                                    <div>
                                      Khối lượng: <strong className="text-teal-300 tabular-nums">{formatKg(x.kg, { withUnit: true })}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );

                            return (
                              <KttTooltip
                                key={`${x.bd10}-${idx}`}
                                ariaLabel={tooltipAria}
                                content={tooltipContent}
                                style={{
                                  left: `${leftPercent}%`,
                                  width: `${sizePx}px`,
                                  height: `${sizePx}px`,
                                  backgroundColor: color.hex,
                                }}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full shadow-sm hover:scale-150 focus:scale-150 transition-transform cursor-pointer z-10 opacity-90 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white"
                              />
                            );
                          })}
                        </div>

                        {/* Cột đợt xe chính */}
                        <div
                          className="w-48 shrink-0 text-right pr-2 text-xs font-medium text-gray-700 truncate"
                          title={dotText}
                        >
                          {dotText}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-500 italic">
                Không có dữ liệu xe đến
              </div>
            )}
          </div>

          {/* ── 4. A3: CỘT XẾP CHỒNG THEO GIỜ ĐẾN (24 GIỜ) ──────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="hue-h2 text-base font-bold text-gray-900">
                  A3 · Phân bổ bưu gửi đến theo giờ và nhóm đường thư
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cột xếp chồng 24 giờ trong ngày theo đường thư lớn nhất.
                </p>
              </div>

              {/* Chú giải đường thư */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {topDtList.map((dtMa) => {
                  const c = getDtColor(dtMa);
                  const dtTen = dtTenMap.get(dtMa) || dtMa;
                  return (
                    <div key={dtMa} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                      <span className="text-gray-700 font-medium truncate max-w-[120px]" title={dtTen}>
                        {dtTen}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#6B7280]" />
                  <span className="text-gray-500 font-medium">Khác</span>
                </div>
              </div>
            </div>

            {/* Trực quan 24 cột xếp chồng */}
            {theoGioList.length > 0 ? (
              <div className="pt-2 max-w-full">
                <div className="h-56 flex items-end gap-1.5 pb-2 pt-8 border-b border-gray-200 overflow-x-auto md:overflow-x-visible max-w-full">
                  {theoGioList.map((g) => {
                    const totalH = g.shbg || 0;
                    const colHeightPercent = Math.max(4, Math.round((totalH / maxHourlyShbg) * 100));

                    const summaryAria = totalH > 0
                      ? `Giờ ${g.gio}:00–${g.gio}:59 · Tổng ${formatInt(totalH)} bưu gửi`
                      : `Giờ ${g.gio}:00–${g.gio}:59: không có bưu gửi`;

                    const tooltipContent = (
                      <div className="space-y-1.5 min-w-[220px]">
                        <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-3">
                          <span className="text-white">Giờ {g.gio}:00 – {g.gio}:59</span>
                          <span className="text-gray-300 font-normal">
                            Tổng: <strong className="text-white font-bold tabular-nums">{formatInt(totalH)}</strong> bưu gửi
                          </span>
                        </div>
                        {totalH === 0 ? (
                          <div className="text-gray-400 italic">Không có bưu gửi đến</div>
                        ) : (
                          <div className="space-y-1 text-[11px]">
                            {topDtList.map((ma) => {
                              const n = g.theo_duong_thu?.[ma] || 0;
                              if (!n) return null;
                              const ratio = n / totalH;
                              const c = getDtColor(ma);
                              const dtTen = dtTenMap.get(ma) || ma;
                              return (
                                <div key={ma} className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5 text-gray-200 truncate max-w-[150px]">
                                    <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: c.hex }} />
                                    <span className="truncate">{dtTen}</span>
                                  </span>
                                  <span className="tabular-nums font-semibold text-emerald-300">
                                    {formatInt(n)} bưu gửi ({formatPercent(ratio)})
                                  </span>
                                </div>
                              );
                            })}
                            {g.khac > 0 && (
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-300 truncate max-w-[150px]">
                                  <span className="w-2.5 h-2.5 rounded-xs shrink-0 bg-[#6B7280]" />
                                  <span>Khác</span>
                                </span>
                                <span className="tabular-nums font-semibold text-gray-300">
                                  {formatInt(g.khac)} bưu gửi ({formatPercent(g.khac / totalH)})
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <KttTooltip
                        key={g.gio}
                        ariaLabel={summaryAria}
                        content={tooltipContent}
                        className="flex-1 min-w-[20px] md:min-w-0 h-full flex flex-col justify-end items-center group relative cursor-pointer focus:outline-none"
                      >
                        {/* Nhãn số bưu gửi trên cột */}
                        {totalH > 0 && (
                          <div className="text-[9px] font-bold text-gray-700 tabular-nums mb-1 pointer-events-none">
                            {formatInt(totalH)}
                          </div>
                        )}

                        {/* Cột xếp chồng */}
                        <div
                          style={{ height: `${colHeightPercent}%` }}
                          className="w-full max-w-[24px] rounded-t-[4px] flex flex-col-reverse overflow-hidden bg-gray-100 group-focus:ring-2 group-focus:ring-[#4A1D6E]"
                        >
                          {/* Đoạn cho từng top đường thư */}
                          {topDtList.map((ma) => {
                            const count = g.theo_duong_thu?.[ma] || 0;
                            if (!count || !totalH) return null;
                            const segPercent = (count / totalH) * 100;
                            const color = getDtColor(ma);
                            return (
                              <div
                                key={ma}
                                style={{
                                  height: `${segPercent}%`,
                                  backgroundColor: color.hex,
                                }}
                                className="w-full shrink-0"
                              />
                            );
                          })}

                          {/* Đoạn khác */}
                          {g.khac > 0 && totalH > 0 && (
                            <div
                              style={{
                                height: `${(g.khac / totalH) * 100}%`,
                              }}
                              className="w-full shrink-0 bg-[#6B7280]"
                            />
                          )}
                        </div>

                        {/* Nhãn giờ */}
                        <div className="mt-1.5 text-[10px] text-gray-500 tabular-nums font-semibold pointer-events-none">
                          {g.gio}h
                        </div>
                      </KttTooltip>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-500 italic">
                Không có dữ liệu theo giờ
              </div>
            )}
          </div>

          {/* ── 5. A4: BẢNG CÁC ĐƯỜNG THƯ ĐẾN ───────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
            <div>
              <h2 className="hue-h2 text-base font-bold text-gray-900">
                A4 · Danh sách các đường thư đến KTT
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Tổng hợp chi tiết theo từng tuyến đường thư Cấp 1 đến Trung tâm Khai thác.
              </p>
            </div>

            {/* Bảng A4 */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left table-soft">
                <thead className="bg-[#FAF5E8] text-[#5A4A62] font-bold border-b border-[#E4D5AE]">
                  <tr>
                    <th className="py-3 px-3">Đường thư đến</th>
                    <th className="py-3 px-3 text-right">Xe TB mỗi ngày</th>
                    <th className="py-3 px-3">Giờ xe đến (các đợt chính)</th>
                    <th className="py-3 px-3 text-right">Bưu gửi</th>
                    {hasKg && (
                      <>
                        <th className="py-3 px-3 text-right">Khối lượng (kg)</th>
                        <th className="py-3 px-3 text-right">kg / bưu gửi</th>
                      </>
                    )}
                    <th className="py-3 px-3 text-right">% Đích TP Huế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {theoDuongThuList.map((row) => {
                    const dotText =
                      row.dot_chinh && row.dot_chinh.length > 0
                        ? row.dot_chinh
                            .map((d) => `${d.gio} (${formatPercent(d.ty_le)})`)
                            .join(', ')
                        : '—';

                    return (
                      <tr key={row.duong_thu_ma || row.duong_thu_ten} className="hover:bg-amber-50/40">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-gray-900">{row.duong_thu_ten}</div>
                          <div className="text-[10px] text-gray-500 tabular-nums">
                            {row.duong_thu_ma || '(không rõ mã)'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <div className="font-bold text-gray-900">
                            {row.xe_tb_moi_ngay !== null && row.xe_tb_moi_ngay !== undefined
                              ? `${formatDecimal(row.xe_tb_moi_ngay, 1)}`
                              : '—'}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            ≈ {formatInt(row.xe)} xe / {soNgayCoDuLieu} ngày
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 max-w-xs">{dotText}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums">
                          {formatInt(row.shbg)}
                        </td>
                        {hasKg && (
                          <>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                              {formatKg(row.kg)}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                              {formatDecimal(row.kg_tb_moi_shbg, 2)}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-3 text-right font-bold text-[#1F7A5C] tabular-nums">
                          {formatPercent(row.huong_hang?.tp_hue?.ty_le)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Dòng «Cộng» */}
                <tfoot className="bg-[#F8F6F0] font-bold border-t-2 border-[#E4D5AE] text-gray-900">
                  <tr>
                    <td className="py-3 px-3 uppercase tracking-wider">Cộng</td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <div>
                        {xeTbNgay !== null && xeTbNgay !== undefined
                          ? `${formatDecimal(xeTbNgay, 1)}`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-gray-600 font-normal">
                        ≈ {formatInt(tongXe)} xe / {soNgayCoDuLieu} ngày
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-500 font-normal">—</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatInt(tongShbg)}</td>
                    {hasKg && (
                      <>
                        <td className="py-3 px-3 text-right tabular-nums">{formatKg(tongKg)}</td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          {formatDecimal(kgTbShbg, 2)}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-3 text-right tabular-nums text-[#1F7A5C]">
                      {formatPercent(tpHueTyLe)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Hộp giải thích cách đọc Xe TB mỗi ngày */}
            <div className="p-3 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs text-[#5A4A62] flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-[#A87A12] mt-0.5" />
              <div>
                <strong>Cách đọc «Xe TB mỗi ngày»:</strong> Số xe trung bình mỗi ngày được tính bằng
                tổng số chuyến xe (BD10) đến chia cho <strong>{soNgayCoDuLieu} ngày</strong> thực tế
                có dữ liệu trong khoảng thời gian{' '}
                {cuaSo?.tu_ngay && cuaSo?.den_ngay && (
                  <strong>
                    {formatDdMmYyyy(cuaSo.tu_ngay)} đến {formatDdMmYyyy(cuaSo.den_ngay)}
                  </strong>
                )}
                .
              </div>
            </div>
          </div>

          {/* ── 6. A5: BẢN ĐỒ NHIỆT HƯỚNG HÀNG ──────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
            <div>
              <h2 className="hue-h2 text-base font-bold text-gray-900">
                A5 · Bản đồ nhiệt «Hướng hàng» theo đường thư
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Tỷ lệ phân bổ bưu gửi theo từng điểm phát; mỗi dòng đường thư cộng lại đúng 100%. Ô
                dưới 0,5% hiện «·».
              </p>
            </div>

            {/* Bảng nhiệt A5 */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  {/* Nhóm cấp 1: TP Huế & Ngoài Huế */}
                  <tr className="border-b border-gray-200">
                    <th
                      rowSpan={2}
                      className="py-2.5 px-3 bg-gray-100 text-gray-800 font-bold border-r border-gray-200 align-bottom min-w-[160px]"
                    >
                      Đường thư đến
                    </th>
                    <th
                      colSpan={7}
                      className="py-1.5 px-3 bg-[#FAF5FF] text-[#6B21A8] font-bold text-center border-r border-gray-200 uppercase tracking-wider text-[11px]"
                    >
                      TP Huế (Tím)
                    </th>
                    <th
                      colSpan={2}
                      className="py-1.5 px-3 bg-[#FEF2F2] text-[#991B1B] font-bold text-center uppercase tracking-wider text-[11px]"
                    >
                      Ngoài Huế (Đỏ)
                    </th>
                  </tr>

                  {/* Nhóm cấp 2: 6 BCVH + Chưa rõ + Quảng Trị + Tỉnh khác */}
                  <tr className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200 text-[11px]">
                    {BCVH_ORDER.map((b) => (
                      <th key={b.ma} className="py-2 px-2 text-right border-r border-gray-100 min-w-[76px]">
                        {b.ten}
                      </th>
                    ))}
                    <th className="py-2 px-2 text-right border-r border-gray-200 min-w-[90px] text-purple-900">
                      Chưa rõ BCVH
                    </th>
                    <th className="py-2 px-2 text-right border-r border-gray-100 min-w-[76px] text-red-900">
                      Quảng Trị
                    </th>
                    <th className="py-2 px-2 text-right min-w-[76px] text-red-900">Tỉnh khác</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {theoDuongThuList.map((row) => {
                    const rowTong = row.huong_hang?.tong || row.shbg || 0;
                    const hh = row.huong_hang;

                    return (
                      <tr key={row.duong_thu_ma || row.duong_thu_ten} className="hover:bg-gray-50/60">
                        {/* Tên đường thư */}
                        <td className="py-2 px-3 font-semibold text-gray-900 border-r border-gray-200 bg-gray-50/30">
                          <div className="truncate max-w-[160px]" title={row.duong_thu_ten}>
                            {row.duong_thu_ten}
                          </div>
                        </td>

                        {/* 6 BCVH */}
                        {BCVH_ORDER.map((b) => {
                          const count = hh?.theo_bcvh?.[b.ma] || 0;
                          const ratio = rowTong > 0 ? count / rowTong : 0;
                          const style = getPurpleHeatStyle(ratio);
                          const tip = renderA5CellTooltip(row.duong_thu_ten, b.ten, count, ratio, rowTong, false);
                          return (
                            <KttTooltip
                              as="td"
                              key={b.ma}
                              ariaLabel={tip.ariaLabel}
                              content={tip.content}
                              className={`py-2 px-2 text-right tabular-nums border-r border-gray-100 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4A1D6E] ${style.bg} ${style.text}`}
                            >
                              {ratio < 0.005 ? '·' : formatPercent(ratio)}
                            </KttTooltip>
                          );
                        })}

                        {/* Huế chưa rõ BCVH */}
                        {(() => {
                          const count = hh?.hue_chua_ro_bcvh || 0;
                          const ratio = rowTong > 0 ? count / rowTong : 0;
                          const style = getPurpleHeatStyle(ratio);
                          const tip = renderA5CellTooltip(row.duong_thu_ten, 'Chưa rõ BCVH', count, ratio, rowTong, false);
                          return (
                            <KttTooltip
                              as="td"
                              ariaLabel={tip.ariaLabel}
                              content={tip.content}
                              className={`py-2 px-2 text-right tabular-nums border-r border-gray-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4A1D6E] ${style.bg} ${style.text}`}
                            >
                              {ratio < 0.005 ? '·' : formatPercent(ratio)}
                            </KttTooltip>
                          );
                        })()}

                        {/* Quảng Trị */}
                        {(() => {
                          const count = hh?.ngoai_hue?.quang_tri || 0;
                          const ratio = rowTong > 0 ? count / rowTong : 0;
                          const style = getRedHeatStyle(ratio);
                          const tip = renderA5CellTooltip(row.duong_thu_ten, 'Quảng Trị', count, ratio, rowTong, false);
                          return (
                            <KttTooltip
                              as="td"
                              ariaLabel={tip.ariaLabel}
                              content={tip.content}
                              className={`py-2 px-2 text-right tabular-nums border-r border-gray-100 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3202A] ${style.bg} ${style.text}`}
                            >
                              {ratio < 0.005 ? '·' : formatPercent(ratio)}
                            </KttTooltip>
                          );
                        })()}

                        {/* Tỉnh khác */}
                        {(() => {
                          const count =
                            (hh?.ngoai_hue?.tinh_khac || 0) + (hh?.ngoai_hue?.khong_ro || 0);
                          const ratio = rowTong > 0 ? count / rowTong : 0;
                          const style = getRedHeatStyle(ratio);
                          const tip = renderA5CellTooltip(row.duong_thu_ten, 'Tỉnh khác', count, ratio, rowTong, false);
                          return (
                            <KttTooltip
                              as="td"
                              ariaLabel={tip.ariaLabel}
                              content={tip.content}
                              className={`py-2 px-2 text-right tabular-nums cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3202A] ${style.bg} ${style.text}`}
                            >
                              {ratio < 0.005 ? '·' : formatPercent(ratio)}
                            </KttTooltip>
                          );
                        })()}
                      </tr>
                    );
                  })}
                </tbody>

                {/* Dòng «Cộng» */}
                <tfoot className="bg-[#FAF5E8] font-bold border-t-2 border-[#E4D5AE] text-gray-900">
                  <tr>
                    <td className="py-2.5 px-3 uppercase tracking-wider border-r border-gray-200">
                      Cộng
                    </td>
                    {BCVH_ORDER.map((b) => {
                      const count = dich?.theo_bcvh?.[b.ma] || 0;
                      const ratio = tongShbg > 0 ? count / tongShbg : 0;
                      const tip = renderA5CellTooltip('Tất cả đường thư', b.ten, count, ratio, tongShbg, true);
                      return (
                        <KttTooltip
                          as="td"
                          key={b.ma}
                          ariaLabel={tip.ariaLabel}
                          content={tip.content}
                          className="py-2.5 px-2 text-right tabular-nums border-r border-gray-100 text-[#6B21A8] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4A1D6E]"
                        >
                          {ratio < 0.005 ? '·' : formatPercent(ratio)}
                        </KttTooltip>
                      );
                    })}
                    {(() => {
                      const count = dich?.hue_chua_ro_bcvh || 0;
                      const ratio = tongShbg > 0 ? count / tongShbg : 0;
                      const tip = renderA5CellTooltip('Tất cả đường thư', 'Chưa rõ BCVH', count, ratio, tongShbg, true);
                      return (
                        <KttTooltip
                          as="td"
                          ariaLabel={tip.ariaLabel}
                          content={tip.content}
                          className="py-2.5 px-2 text-right tabular-nums border-r border-gray-200 text-[#6B21A8] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#4A1D6E]"
                        >
                          {ratio < 0.005 ? '·' : formatPercent(ratio)}
                        </KttTooltip>
                      );
                    })()}
                    {(() => {
                      const count = dich?.ngoai_hue?.quang_tri || 0;
                      const ratio = tongShbg > 0 ? count / tongShbg : 0;
                      const tip = renderA5CellTooltip('Tất cả đường thư', 'Quảng Trị', count, ratio, tongShbg, true);
                      return (
                        <KttTooltip
                          as="td"
                          ariaLabel={tip.ariaLabel}
                          content={tip.content}
                          className="py-2.5 px-2 text-right tabular-nums border-r border-gray-100 text-[#B3202A] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
                        >
                          {ratio < 0.005 ? '·' : formatPercent(ratio)}
                        </KttTooltip>
                      );
                    })()}
                    {(() => {
                      const count = (dich?.ngoai_hue?.tinh_khac || 0) + (dich?.ngoai_hue?.khong_ro || 0);
                      const ratio = tongShbg > 0 ? count / tongShbg : 0;
                      const tip = renderA5CellTooltip('Tất cả đường thư', 'Tỉnh khác', count, ratio, tongShbg, true);
                      return (
                        <KttTooltip
                          as="td"
                          ariaLabel={tip.ariaLabel}
                          content={tip.content}
                          className="py-2.5 px-2 text-right tabular-nums text-[#B3202A] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
                        >
                          {ratio < 0.005 ? '·' : formatPercent(ratio)}
                        </KttTooltip>
                      );
                    })()}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
