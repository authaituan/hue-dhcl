import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Download, AlertCircle, Filter, ChevronLeft, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent, formatDdMm } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatTimeShort } from './kttFormatters';
import { fetchKttKhongDat14h, downloadKttKhongDat14h, fetchKttChiTietKhongDat14h } from './kttApi';

const NHOM_INFO = {
  A: {
    key: 'A',
    nhan: 'Lỡ chuyến sát giờ',
    moTa: 'Đến sát giờ xe rời, không kịp làm thủ tục chuyến đó',
    color: 'border-amber-400 bg-amber-50/60 text-amber-900',
    barColor: 'bg-amber-400',
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  B: {
    key: 'B',
    nhan: 'Trượt chuyến',
    moTa: 'Đến kịp chuyến nhưng lập BD10 đi sau giờ xe rời',
    color: 'border-red-400 bg-red-50/60 text-red-900',
    barColor: 'bg-red-500',
    badgeColor: 'bg-red-100 text-red-800',
  },
  C: {
    key: 'C',
    nhan: 'Đi đúng chuyến, vẫn quá chỉ tiêu',
    moTa: 'Lập BD10 đi kịp chuyến nhưng thời gian chờ chuyến kế vẫn quá chỉ tiêu',
    color: 'border-blue-400 bg-blue-50/60 text-blue-900',
    barColor: 'bg-blue-500',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  D: {
    key: 'D',
    nhan: 'Chưa phân loại được',
    moTa: 'Lưới an toàn hệ thống (hiện luôn 0)',
    color: 'border-gray-300 bg-gray-50 text-gray-700',
    barColor: 'bg-gray-400',
    badgeColor: 'bg-gray-200 text-gray-700',
  },
  E: {
    key: 'E',
    nhan: 'Chưa đi, đã quá chỉ tiêu',
    moTa: 'Chưa lập BD10 đi và thời gian lưu tại KTT đã quá chỉ tiêu',
    color: 'border-purple-400 bg-purple-50/60 text-purple-900',
    barColor: 'bg-purple-500',
    badgeColor: 'bg-purple-100 text-purple-800',
  },
};

// Định dạng 'YYYY-MM-DD HH:MM:SS' -> 'dd/mm/yyyy hh:mm', hoặc 'YYYY-MM-DD' -> 'dd/mm/yyyy'
function formatNgayGioVn(tsStr, fallbackYmd) {
  const s = tsStr ? String(tsStr).trim() : '';
  const mFull = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  if (mFull) return `${mFull[3]}/${mFull[2]}/${mFull[1]} ${mFull[4]}`;
  const ymd = (s || (fallbackYmd ? String(fallbackYmd).trim() : '')).slice(0, 10);
  const mDate = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mDate) {
    const timePart = formatTimeShort(tsStr);
    return timePart && timePart !== '—'
      ? `${mDate[3]}/${mDate[2]}/${mDate[1]} ${timePart}`
      : `${mDate[3]}/${mDate[2]}/${mDate[1]}`;
  }
  return null;
}

export default function KttKhongDat14h({
  dateRange,
  selectedBcvh,
  mocChiTieu,
  filterDuongThu,
  onClearDuongThu,
  unit: controlledUnit,
  onUnitChange,
  chiTieuInfo,
}) {
  const [moc, setMoc] = useState(mocChiTieu === 'quet_tui_den' ? 'B' : 'A');
  const [localUnit, setLocalUnit] = useState('shbg'); // 'shbg' | 'kg'
  const unit = controlledUnit ?? localUnit;
  const setUnit = onUnitChange || setLocalUnit;
  const [selectedNhom, setSelectedNhom] = useState('tat_ca'); // 'tat_ca' | 'A' | 'B' | 'C' | 'D' | 'E'
  const [selectedHourCell, setSelectedHourCell] = useState(null); // { nguon, ten, gio } | null
  const [selectedChuyen, setSelectedChuyen] = useState(null);
  const [expandedRoutes, setExpandedRoutes] = useState({});

  const selectedHour = selectedHourCell ? selectedHourCell.gio : null;
  const effectiveNguon = selectedHourCell?.nguon || filterDuongThu || undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Chi tiết kiểm chứng bưu gửi
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 25, total_pages: 1 });

  // Xuất file xlsx
  const [exportLoading, setExportLoading] = useState(false);

  // Mã yêu cầu tuần tự chống chạy đua (3.6)
  const dataRequestIdRef = useRef(0);
  const itemsRequestIdRef = useRef(0);

  // Đồng bộ mốc từ ngoài
  useEffect(() => {
    if (mocChiTieu === 'quet_tui_den') {
      setMoc('B');
    } else {
      setMoc('A');
    }
  }, [mocChiTieu]);

  // Tải dữ liệu chính của khối (chống chạy đua bằng dataRequestIdRef; đổi bộ lọc xóa ngay dữ liệu cũ)
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const reqId = ++dataRequestIdRef.current;
    setLoading(true);
    setError(null);
    setData(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      moc,
      ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
      nguon: filterDuongThu || undefined,
    };

    try {
      const res = await fetchKttKhongDat14h(params);
      if (reqId !== dataRequestIdRef.current) return;
      if (res.ok) {
        setData(res.data);
      } else {
        setError(res.error || 'Lỗi tải dữ liệu Không đạt 14 giờ');
        setData(null);
      }
    } catch (err) {
      if (reqId !== dataRequestIdRef.current) return;
      setError('Lỗi kết nối khi tải dữ liệu Không đạt 14 giờ.');
      setData(null);
    } finally {
      if (reqId === dataRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, moc, selectedBcvh, filterDuongThu]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tải danh sách kiểm chứng chi tiết bưu gửi (chống chạy đua bằng itemsRequestIdRef)
  const loadItems = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const reqId = ++itemsRequestIdRef.current;
    setItemsLoading(true);
    setItemsError(null);
    setItems([]);

    try {
      const res = await fetchKttChiTietKhongDat14h({
        tu: dateRange.from,
        den: dateRange.to,
        moc,
        nhom: selectedNhom,
        ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
        nguon: effectiveNguon,
        gio_den: selectedHour !== null ? selectedHour : undefined,
        chuyen: selectedChuyen || undefined,
        page,
        page_size: pageSize,
      });

      if (reqId !== itemsRequestIdRef.current) return;

      if (res.ok) {
        setItems(res.data.items || []);
        setPagination(res.data.pagination || { total: 0, page: 1, page_size: pageSize, total_pages: 1 });
      } else {
        setItemsError(res.error || 'Không tải được danh sách kiểm chứng');
        setItems([]);
      }
    } catch (err) {
      if (reqId !== itemsRequestIdRef.current) return;
      setItemsError('Lỗi kết nối khi tải danh sách kiểm chứng.');
      setItems([]);
    } finally {
      if (reqId === itemsRequestIdRef.current) {
        setItemsLoading(false);
      }
    }
  }, [dateRange, moc, selectedNhom, selectedBcvh, effectiveNguon, selectedHour, selectedChuyen, page, pageSize]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Reset trang khi đổi bộ lọc
  useEffect(() => {
    setPage(1);
  }, [selectedNhom, selectedBcvh, filterDuongThu, selectedHourCell, selectedChuyen, moc]);

  // Reset dòng mở rộng và ô giờ chọn khi đổi phạm vi lọc chính
  useEffect(() => {
    setExpandedRoutes({});
    setSelectedHourCell(null);
  }, [dateRange?.from, dateRange?.to, selectedBcvh, filterDuongThu]);

  // Xử lý xuất Excel
  const handleExport = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setExportLoading(true);
    try {
      await downloadKttKhongDat14h({
        tu: dateRange.from,
        den: dateRange.to,
        moc,
        nhom: selectedNhom,
        ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
        nguon: effectiveNguon,
        gio_den: selectedHour !== null ? selectedHour : undefined,
        chuyen: selectedChuyen || undefined,
      });
    } catch (err) {
      alert('Chưa tải được file Excel. Vui lòng thử lại sau ít phút.');
    } finally {
      setExportLoading(false);
    }
  };

  // Mốc dữ liệu hiện tại
  const mocKey = moc === 'B' ? 'quet_tui_den' : 'xnd';
  const tongMoc = data?.tong?.theo_moc?.[mocKey] || null;

  // Chỉ tiêu giờ & giờ chốt chuyến (lấy từ API con-lai-theo-gio ở cha nếu có; không điền cứng)
  const chiTieuGio = chiTieuInfo?.chiTieuGio ?? null;
  const chiTieuNgoaiLe = chiTieuInfo?.chiTieuNgoaiLe || null;
  const hasNgoaiLePhuong = Boolean(
    chiTieuNgoaiLe?.gio != null &&
    Array.isArray(chiTieuNgoaiLe?.phuong_xa) &&
    chiTieuNgoaiLe.phuong_xa.length > 0,
  );
  const hanDenTruocPhut = chiTieuInfo?.hanDenTruocPhut ?? 60;
  const cutOffHourSet = useMemo(() => {
    return new Set(chiTieuInfo?.cutOffHours || []);
  }, [chiTieuInfo]);

  // Tổng hợp bảng gọn mỗi đường thư một dòng + lưới 24 giờ từ theo_duong_thu & theo_gio_duong_thu
  const { routeRows, maxKdBar } = useMemo(() => {
    const byRoute = data?.theo_duong_thu || [];
    const byHourRoute = data?.theo_gio_duong_thu || [];

    const hourMap = new Map();
    for (const hRow of byHourRoute) {
      if (!hourMap.has(hRow.nguon)) {
        hourMap.set(hRow.nguon, Array(24).fill(null));
      }
      const arr = hourMap.get(hRow.nguon);
      if (hRow.gio >= 0 && hRow.gio <= 23) {
        arr[hRow.gio] = hRow;
      }
    }

    const rows = byRoute.map((dt) => {
      const dtm = dt.theo_moc?.[mocKey] || null;
      const doDuocShbg = dtm?.do_duoc ?? null;
      const kdShbg = dtm?.khong_dat_da_di ?? null;
      const chuaDiShbg = dtm?.chua_di_qua_chi_tieu ?? null;
      const kdKg = dtm?.tong?.da_di ? dtm.tong.da_di.kg : null;
      const chuaDiKg = dtm?.nhom?.E ? dtm.nhom.E.kg : null;

      const kdDisplay = unit === 'kg' ? kdKg : kdShbg;
      const chuaDiDisplay = unit === 'kg' ? chuaDiKg : chuaDiShbg;
      const isFew = doDuocShbg != null && doDuocShbg < 20;
      const pct = !isFew && doDuocShbg != null && doDuocShbg > 0 && kdShbg != null
        ? kdShbg / doDuocShbg
        : null;

      const routeHours = hourMap.get(dt.nguon) || Array(24).fill(null);
      let bestH = null;
      let bestVal = 0;
      // Giờ đến nhiều nhất cố định theo số bưu gửi (không đổi khi chuyển sang kg)
      for (let h = 0; h < 24; h++) {
        const hItem = routeHours[h];
        if (!hItem) continue;
        const hVal = hItem.theo_moc?.[mocKey]?.do_duoc ?? hItem.shbg ?? 0;
        if (hVal > bestVal) {
          bestVal = hVal;
          bestH = h;
        }
      }
      const peakHourLabel = bestH !== null
        ? `${String(bestH).padStart(2, '0')}–${String((bestH + 1) % 24).padStart(2, '0')} giờ`
        : '—';

      const hourlyCells = Array.from({ length: 24 }, (_, h) => {
        const hItem = routeHours[h];
        const hMoc = hItem?.theo_moc?.[mocKey] || null;
        const val = unit === 'kg'
          ? (hMoc?.tong?.da_di ? hMoc.tong.da_di.kg : null)
          : (hMoc?.khong_dat_da_di ?? null);
        return { gio: h, val };
      });
      const maxHourVal = Math.max(
        0,
        ...hourlyCells.map((c) => (c.val != null && c.val > 0 ? c.val : 0)),
      );

      return {
        nguon: dt.nguon,
        ten: dt.nguon_ten || dt.nguon || 'Chưa rõ đường thư',
        ma: dt.nguon_ten && dt.nguon && dt.nguon_ten !== dt.nguon ? dt.nguon : null,
        peakHourLabel,
        doDuocShbg,
        kdShbg,
        kdDisplay,
        chuaDiDisplay,
        isFew,
        pct,
        hourlyCells,
        maxHourVal,
      };
    });

    rows.sort((a, b) => {
      const av = a.kdDisplay != null ? a.kdDisplay : -1;
      const bv = b.kdDisplay != null ? b.kdDisplay : -1;
      if (bv !== av) return bv - av;
      const as = a.kdShbg != null ? a.kdShbg : -1;
      const bs = b.kdShbg != null ? b.kdShbg : -1;
      if (bs !== as) return bs - as;
      const ac = a.chuaDiDisplay != null ? a.chuaDiDisplay : -1;
      const bc = b.chuaDiDisplay != null ? b.chuaDiDisplay : -1;
      if (bc !== ac) return bc - ac;
      return String(a.ten).localeCompare(String(b.ten), 'vi');
    });

    const maxBar = Math.max(
      0,
      ...rows
        .filter((r) => !r.isFew && r.kdDisplay != null && r.kdDisplay > 0)
        .map((r) => r.kdDisplay),
    );

    return { routeRows: rows, maxKdBar: maxBar };
  }, [data, mocKey, unit]);

  const toggleRoute = (nguon) => {
    setExpandedRoutes((prev) => ({
      ...prev,
      [nguon]: !prev[nguon],
    }));
  };

  const handleHourCellClick = (row, gio) => {
    setSelectedHourCell((prev) =>
      prev && prev.nguon === row.nguon && prev.gio === gio
        ? null
        : { nguon: row.nguon, ten: row.ten, gio },
    );
  };

  // Render giá trị sản lượng theo unit (null -> «chưa đủ số liệu», 0 thật -> 0)
  const renderValue = (shbg, kg) => {
    if (unit === 'kg') {
      if (kg === null || kg === undefined || Number.isNaN(Number(kg))) {
        return <span className="text-gray-400">chưa đủ số liệu</span>;
      }
      return <span>{formatKg(kg, { withUnit: true })}</span>;
    }
    if (shbg === null || shbg === undefined || Number.isNaN(Number(shbg))) {
      return <span className="text-gray-400">chưa đủ số liệu</span>;
    }
    return <span>{formatInt(shbg)} bưu gửi</span>;
  };

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 mt-6 space-y-6 shadow-sm min-w-0">
      {/* ── HEADER KHỐI & BỘ CHỌN ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-bold text-gray-900 tracking-tight">
              Vì sao không đạt 14 giờ
            </h2>
            <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
              Phân tích 5 nhóm nguyên nhân loại trừ nhau
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Bóc tách nguồn gốc phát sinh không đạt chỉ tiêu theo nhóm nguyên nhân, chuyến thư đến, khung giờ và chuyến xe
          </p>
        </div>

        {/* Các nút bấm chuyển mốc & đơn vị */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Giờ xác nhận BD10 đến / Giờ quét túi đến */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => setMoc('A')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                moc === 'A'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Giờ xác nhận BD10 đến (chính thức)
            </button>
            <button
              type="button"
              onClick={() => setMoc('B')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                moc === 'B'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Giờ quét túi đến
            </button>
          </div>

          {/* Đơn vị Bưu gửi / kg */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs" role="group" aria-label="Đơn vị">
            <button
              type="button"
              onClick={() => setUnit('shbg')}
              aria-pressed={unit === 'shbg'}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                unit === 'shbg'
                  ? 'bg-[#4A1D6E] text-white shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Bưu gửi
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              aria-pressed={unit === 'kg'}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                unit === 'kg'
                  ? 'bg-[#4A1D6E] text-white shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Khối lượng (kg)
            </button>
          </div>
        </div>
      </div>

      {/* ── GIẢI THÍCH CỐ ĐỊNH & 3 CHIP KẾT CỤC (3.1, 3.2) ──────────── */}
      <div className="space-y-3">
        <p className="text-[13.5px] leading-relaxed text-[#2B2233] max-w-[75ch]">
          Mỗi bưu gửi hàng đến BCVH Huế được tính{' '}
          <strong className="text-[#4A1D6E]">từ lúc BD10 đến được xác nhận</strong> đến lúc{' '}
          <strong className="text-[#4A1D6E]">hàng đi khỏi BCVH</strong>
          {chiTieuGio != null ? (
            <>
              . Chỉ tiêu là <strong className="text-[#4A1D6E]">{chiTieuGio} giờ</strong>
              {hasNgoaiLePhuong && (
                <>
                  {' '}
                  (riêng phường {chiTieuNgoaiLe.phuong_xa.join(', ')} là{' '}
                  <strong className="text-[#4A1D6E]">{chiTieuNgoaiLe.gio} giờ</strong>)
                </>
              )}
              , không tính khung 21:00–07:00
            </>
          ) : (
            <>, không tính khung 21:00–07:00</>
          )}
          . Bảng cho biết đường thư nào, đến lúc nào, đang làm hàng quá chỉ tiêu.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="border border-[#E2D9C6] rounded-lg p-3 bg-[#FAF8F4]/60 space-y-1">
            <div className="flex items-center gap-2 font-bold text-xs text-[#2B2233]">
              <span className="w-3 h-3 rounded-sm bg-[#1F7A5C] shrink-0" />
              <span>Đạt</span>
            </div>
            <p className="text-xs text-[#6B5F73]">Đã đi trong chỉ tiêu.</p>
            <p className="text-[11.5px] font-semibold text-[#4A3F55]">
              Nằm trong «Đo được», không hiện thành cột riêng.
            </p>
          </div>

          <div className="border border-[#E2D9C6] rounded-lg p-3 bg-[#FAF8F4]/60 space-y-1">
            <div className="flex items-center gap-2 font-bold text-xs text-[#2B2233]">
              <span className="w-3 h-3 rounded-sm bg-[#B3202A] shrink-0" />
              <span>Không đạt (đã đi)</span>
            </div>
            <p className="text-xs text-[#6B5F73]">Đã đi nhưng quá chỉ tiêu.</p>
            <p className="text-[11.5px] font-semibold text-[#4A3F55]">
              Tỷ lệ = không đạt ÷ đo được.
            </p>
          </div>

          <div className="border border-[#E2D9C6] rounded-lg p-3 bg-[#FAF8F4]/60 space-y-1">
            <div className="flex items-center gap-2 font-bold text-xs text-[#2B2233]">
              <span className="w-3 h-3 rounded-sm bg-[#C9791B] shrink-0" />
              <span>Chưa đi, đã quá chỉ tiêu</span>
            </div>
            <p className="text-xs text-[#6B5F73]">
              Còn nằm ở BCVH, đã quá hạn. Chưa biết bao giờ đi.
            </p>
            <p className="text-[11.5px] font-semibold text-[#4A3F55]">
              Số riêng, không nằm trong tỷ lệ.
            </p>
          </div>
        </div>
      </div>

      {/* ── THỐNG KÊ TỶ LỆ CHUẨN ────────────────────────────────────── */}
      {tongMoc && (
        <div className="bg-[#FFFBEF] border border-[#FDE68A] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="text-gray-900 font-medium flex items-center gap-2">
              <span>
                Tỷ lệ không đạt đã đi (chuẩn):{' '}
                <strong className="text-red-700 text-sm font-bold">
                  {tongMoc.ty_le_khong_dat !== null ? formatPercent(tongMoc.ty_le_khong_dat) : '—'}
                </strong>
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-700">
                (đo được {tongMoc.khong_dat_da_di != null ? formatInt(tongMoc.khong_dat_da_di) : '—'} / {tongMoc.do_duoc != null ? formatInt(tongMoc.do_duoc) : '—'} bưu gửi)
              </span>
            </div>
            <div className="text-[11px] text-gray-600">
              * Tỷ lệ chuẩn = Không đạt đã đi (nhóm A+B+C+D) chia cho Tổng đo được ({moc === 'B' ? 'giờ quét túi đến' : 'giờ xác nhận BD10 đến (chính thức)'}). Nhóm E (chưa đi, đã quá chỉ tiêu) có {tongMoc.chua_di_qua_chi_tieu != null ? formatInt(tongMoc.chua_di_qua_chi_tieu) : '—'} bưu gửi, không nằm trong tổng đo được của tỷ lệ đã đi.
            </div>
          </div>

          {filterDuongThu && (
            <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-amber-300 text-amber-900 text-xs">
              <span>Đang lọc đường thư: <strong>{filterDuongThu}</strong></span>
              <button
                type="button"
                onClick={onClearDuongThu}
                className="text-gray-400 hover:text-gray-700 font-bold ml-1"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TRẠNG THÁI TẢI / LỖI ────────────────────────────────────── */}
      {loading && (
        <div className="py-16 text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent mb-3" />
          <p className="text-sm font-medium">Đang tính toán phân tích Không đạt 14 giờ...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="shrink-0 px-3 py-1 rounded-lg border border-red-300 bg-white text-red-700 text-xs font-semibold hover:bg-red-100 cursor-pointer"
          >
            Tải lại
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── 1. THẺ 5 NHÓM NGUYÊN NHÂN ──────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>Thẻ nhóm nguyên nhân</span>
                <span className="text-xs font-normal text-gray-500">
                  (Nhấp vào thẻ để lọc danh sách kiểm chứng)
                </span>
              </h3>
              {selectedNhom !== 'tat_ca' && (
                <button
                  type="button"
                  onClick={() => setSelectedNhom('tat_ca')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Bỏ lọc nhóm (xem tất cả)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {['A', 'B', 'C', 'D', 'E'].map((k) => {
                const info = NHOM_INFO[k];
                const nhomData = tongMoc?.nhom?.[k] || null;
                const isSelected = selectedNhom === k;
                const shbg = nhomData?.shbg ?? null;
                const kg = nhomData?.kg ?? null;
                const tyLe = tongMoc?.do_duoc > 0 && shbg != null ? (k === 'E' ? null : shbg / tongMoc.do_duoc) : null;

                return (
                  <div
                    key={k}
                    onClick={() => setSelectedNhom(isSelected ? 'tat_ca' : k)}
                    className={`rounded-xl p-3.5 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-gray-900 shadow-md ring-2 ring-gray-900/10'
                        : info.color
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-xs uppercase tracking-wide">
                          Nhóm {k}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${info.badgeColor}`}>
                          {k === 'E' ? 'Chưa đi' : 'Đã đi'}
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-gray-900 leading-snug">
                        {info.nhan}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-1 leading-normal">
                        {info.moTa}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-200/60 flex items-baseline justify-between">
                      <span className="text-base font-bold text-gray-900 tabular-nums">
                        {renderValue(shbg, kg)}
                      </span>
                      {tyLe !== null && (
                        <span className="text-xs font-semibold text-gray-600 tabular-nums">
                          {formatPercent(tyLe)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 2. ĐƯỜNG THƯ NÀO LÀM HÀNG KHÔNG ĐẠT (BẢNG GỌN 5 CỘT) ──── */}
          <div className="space-y-3 pt-2 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#4A1D6E]">
                  Đường thư nào làm hàng không đạt
                </h3>
                <p className="text-xs text-[#6B5F73]">
                  Xếp theo số không đạt (đã đi), nhiều nhất ở trên. Bấm một dòng để xem theo từng giờ đến.
                </p>
              </div>
            </div>

            {data.co_du_lieu === false || routeRows.length === 0 ? (
              <div className="border border-[#E2D9C6] rounded-xl p-8 text-center text-xs text-[#6B5F73] bg-[#FAF8F4]/50">
                Không có dữ liệu đường thư trong khoảng đã chọn.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E2D9C6] rounded-xl bg-white">
                <div className="min-w-[760px] flex flex-col">
                  {/* Đầu bảng 5 cột */}
                  <div className="grid grid-cols-[minmax(150px,1.3fr)_110px_96px_minmax(220px,2fr)_130px] gap-3 items-end px-3 py-2.5 text-xs font-bold text-[#6B5F73] border-b-2 border-[#E2D9C6] bg-[#FAF8F4]">
                    <div>Đường thư đến</div>
                    <div>
                      Giờ đến nhiều nhất
                      <small className="block font-medium text-[11px]">theo số bưu gửi</small>
                    </div>
                    <div className="text-right">
                      Đo được
                      <small className="block font-medium text-[11px]">bưu gửi</small>
                    </div>
                    <div>
                      Không đạt (đã đi)
                      <small className="block font-medium text-[11px]">
                        {unit === 'kg'
                          ? 'số kg và % theo bưu gửi'
                          : 'số lượng và % trên đo được'}
                      </small>
                    </div>
                    <div className="text-right">Chưa đi, đã quá chỉ tiêu</div>
                  </div>

                  {/* Các dòng đường thư */}
                  {routeRows.map((row) => {
                    const isExpanded = Boolean(expandedRoutes[row.nguon]);
                    const barWidth = !row.isFew && row.kdDisplay != null && row.kdDisplay > 0 && maxKdBar > 0
                      ? Math.max((row.kdDisplay / maxKdBar) * 100, 2)
                      : 0;

                    return (
                      <div key={row.nguon} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => toggleRoute(row.nguon)}
                          aria-expanded={isExpanded}
                          className="grid grid-cols-[minmax(150px,1.3fr)_110px_96px_minmax(220px,2fr)_130px] gap-3 items-center px-3 py-2.5 border-b border-[#E2D9C6] text-left text-[13px] text-[#2B2233] hover:bg-[#EFE8F4]/70 focus-visible:outline-2 focus-visible:outline-[#E0A82E] focus-visible:outline-offset-[-2px] transition-colors cursor-pointer w-full bg-transparent"
                        >
                          <div className="font-semibold flex items-start gap-1.5 min-w-0">
                            <span className="mt-0.5 text-[#6B5F73] shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate">{row.ten}</span>
                              {row.ma && (
                                <small className="block font-normal text-[11px] text-[#6B5F73]">
                                  {row.ma}
                                </small>
                              )}
                            </span>
                          </div>

                          <div className="tabular-nums text-xs text-[#4A3F55]">
                            {row.peakHourLabel}
                          </div>

                          <div className="text-right tabular-nums">
                            {row.doDuocShbg == null ? (
                              <span className="text-xs text-gray-400">chưa đủ số liệu</span>
                            ) : (
                              <>
                                <span>{formatInt(row.doDuocShbg)}</span>
                                {row.isFew && (
                                  <span className="block mt-0.5">
                                    <span className="inline-block text-[11px] font-semibold text-[#6B5F73] bg-[#EFE8F4] rounded px-1.5 py-0.5">
                                      Ít mẫu
                                    </span>
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex-1 h-3.5 rounded-[3px] bg-[#EFE8F4] relative overflow-hidden">
                              {barWidth > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-[#B3202A] rounded-[3px]"
                                  style={{ width: `${barWidth}%` }}
                                />
                              )}
                            </div>
                            <div className="w-[138px] shrink-0 text-right tabular-nums whitespace-nowrap font-bold">
                              {row.kdDisplay == null ? (
                                <span className="text-xs text-gray-400 font-normal">
                                  chưa đủ số liệu
                                </span>
                              ) : (
                                <>
                                  <span>
                                    {unit === 'kg'
                                      ? formatKg(row.kdDisplay, { withUnit: true })
                                      : formatInt(row.kdDisplay)}
                                  </span>{' '}
                                  <span className="font-medium text-[#6B5F73]">
                                    {row.isFew
                                      ? '—'
                                      : row.pct !== null
                                      ? formatPercent(row.pct)
                                      : '—'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div
                            className={`text-right tabular-nums ${
                              row.chuaDiDisplay == null
                                ? 'text-xs text-gray-400 font-normal'
                                : row.chuaDiDisplay > 0
                                ? 'text-[#C9791B] font-bold'
                                : 'text-[#6B5F73]'
                            }`}
                          >
                            {row.chuaDiDisplay == null
                              ? 'chưa đủ số liệu'
                              : unit === 'kg'
                              ? formatKg(row.chuaDiDisplay, { withUnit: true })
                              : formatInt(row.chuaDiDisplay)}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 py-3 border-b border-[#E2D9C6] bg-[#F7F4EE]">
                            <div className="mb-2">
                              <h4 className="text-[13px] font-bold text-[#4A3F55]">
                                {row.ten}: hàng không đạt theo giờ quét túi đến
                              </h4>
                              {moc === 'A' && (
                                <p className="text-[11.5px] text-[#6B5F73] mt-0.5">
                                  Lưới này luôn tính theo giờ quét túi đến.
                                </p>
                              )}
                            </div>
                            <div
                              className="grid gap-1"
                              style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                            >
                              {row.hourlyCells.map((cell) => {
                                const hasVal = cell.val != null && cell.val > 0;
                                const ratio = hasVal && row.maxHourVal > 0 ? cell.val / row.maxHourVal : 0;
                                const bgAlpha = hasVal ? (0.14 + ratio * 0.68).toFixed(2) : null;
                                const isCut = cutOffHourSet.has(cell.gio);
                                const isHourActive = selectedHourCell?.nguon === row.nguon && selectedHourCell?.gio === cell.gio;
                                const hh = String(cell.gio).padStart(2, '0');
                                const cellLabel = hasVal
                                  ? unit === 'kg'
                                    ? formatKg(cell.val)
                                    : formatInt(cell.val)
                                  : '';

                                return (
                                  <div
                                    key={cell.gio}
                                    className={`flex flex-col items-center gap-1 text-[10.5px] ${
                                      isCut ? 'text-[#4A1D6E] font-bold' : 'text-[#6B5F73]'
                                    }`}
                                  >
                                    {hasVal ? (
                                      <button
                                        type="button"
                                        onClick={() => handleHourCellClick(row, cell.gio)}
                                        title={`${hh}h: ${
                                          unit === 'kg'
                                            ? formatKg(cell.val, { withUnit: true })
                                            : `${formatInt(cell.val)} bưu gửi`
                                        } (bấm để lọc danh sách kiểm chứng)`}
                                        style={{ backgroundColor: `rgba(179, 32, 42, ${bgAlpha})` }}
                                        className={`w-full h-[34px] rounded-[3px] flex items-center justify-center text-[10.5px] font-bold tabular-nums cursor-pointer transition-all ${
                                          ratio > 0.55 ? 'text-white' : 'text-[#2B2233]'
                                        } ${isHourActive ? 'ring-2 ring-[#4A1D6E] ring-offset-1' : 'hover:opacity-90'}`}
                                      >
                                        {cellLabel}
                                      </button>
                                    ) : (
                                      <div className="w-full h-[34px] rounded-[3px] bg-[#EFE8F4]" />
                                    )}
                                    <span>{isCut ? `▼ ${hh}` : hh}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-xs text-[#6B5F73] mt-2">
                              Mỗi ô là một giờ đến, số trong ô là{' '}
                              {unit === 'kg' ? 'khối lượng (kg)' : 'bưu gửi'} không đạt. Bấm vào ô
                              có số để lọc danh sách kiểm chứng bên dưới.
                              {cutOffHourSet.size > 0
                                ? ` Dấu ▼ là giờ chốt chuyến (giờ xe rời − ${hanDenTruocPhut} phút) theo lịch chuẩn.`
                                : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3.5 text-xs text-[#6B5F73]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#B3202A] inline-block" />
                Không đạt (đã đi)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-[3px] bg-[#C9791B] inline-block" />
                Chưa đi, đã quá chỉ tiêu
              </span>
              <span>«Ít mẫu»: dưới 20 bưu gửi đo được, không tính tỷ lệ</span>
            </div>
          </div>

          {/* ── 3. THANH CHỒNG THEO ĐƯỜNG THƯ VÀ BCVH ĐÍCH ─────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            {/* Theo đường thư */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
              <h4 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                <span>Phân bố theo đường thư đến (Top)</span>
                <span className="text-[11px] font-normal text-gray-500">bưu gửi không đạt</span>
              </h4>
              <div className="space-y-2">
                {(() => {
                  const topRoutes = [...(data.theo_duong_thu || [])]
                    .sort((a, b) => (b.theo_moc?.[mocKey]?.khong_dat_da_di ?? -1) - (a.theo_moc?.[mocKey]?.khong_dat_da_di ?? -1))
                    .slice(0, 8);
                  const maxKd = Math.max(0, ...topRoutes.map((r) => r.theo_moc?.[mocKey]?.khong_dat_da_di ?? 0));

                  return topRoutes.map((dt, idx) => {
                    const dtm = dt.theo_moc?.[mocKey] || {};
                    const kd = dtm.khong_dat_da_di;
                    const doDuoc = dtm.do_duoc;
                    const isFew = doDuoc != null && doDuoc < 20;
                    const pct = kd != null && kd > 0 && maxKd > 0
                      ? Math.min(100, Math.max(2, (kd / maxKd) * 100))
                      : 0;

                    return (
                      <div key={dt.nguon || idx} className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-800 font-medium">
                          <span className="truncate max-w-[240px]" title={dt.nguon_ten || dt.nguon}>
                            {dt.nguon_ten || dt.nguon}
                          </span>
                          <span className="tabular-nums font-semibold text-red-700">
                            {kd == null ? (
                              <span className="text-gray-400 font-normal">chưa đủ số liệu</span>
                            ) : isFew ? (
                              <>
                                {formatInt(kd)}{' '}
                                <span className="text-[#6B5F73] font-normal">(Ít mẫu)</span>
                              </>
                            ) : (
                              `${formatInt(kd)} (${formatPercent(dtm.ty_le_khong_dat)})`
                            )}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                          {pct > 0 && (
                            <div
                              className="h-full bg-red-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Theo BCVH đích */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
              <h4 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                <span>Phân bố theo BCVH đích</span>
                <span className="text-[11px] font-normal text-gray-500">bưu gửi không đạt</span>
              </h4>
              <div className="space-y-2">
                {(() => {
                  const sortedBcvh = [...(data.theo_bcvh || [])]
                    .sort((a, b) => (b.theo_moc?.[mocKey]?.khong_dat_da_di ?? -1) - (a.theo_moc?.[mocKey]?.khong_dat_da_di ?? -1));
                  const maxKd = Math.max(0, ...sortedBcvh.map((b) => b.theo_moc?.[mocKey]?.khong_dat_da_di ?? 0));

                  return sortedBcvh.map((b, idx) => {
                    const bm = b.theo_moc?.[mocKey] || {};
                    const bcvhObj = BCVH_LIST.find((item) => item.ma === b.ma_bcvh);
                    const kd = bm.khong_dat_da_di;
                    const doDuoc = bm.do_duoc;
                    const isFew = doDuoc != null && doDuoc < 20;
                    const pct = kd != null && kd > 0 && maxKd > 0
                      ? Math.min(100, Math.max(2, (kd / maxKd) * 100))
                      : 0;

                    return (
                      <div key={b.ma_bcvh || idx} className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-800 font-medium">
                          <span>{bcvhObj ? bcvhObj.ten : b.ma_bcvh} ({b.ma_bcvh})</span>
                          <span className="tabular-nums font-semibold text-red-700">
                            {kd == null ? (
                              <span className="text-gray-400 font-normal">chưa đủ số liệu</span>
                            ) : isFew ? (
                              <>
                                {formatInt(kd)}{' '}
                                <span className="text-[#6B5F73] font-normal">(Ít mẫu)</span>
                              </>
                            ) : (
                              `${formatInt(kd)} (${formatPercent(bm.ty_le_khong_dat)})`
                            )}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                          {pct > 0 && (
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* ── 4. BẢNG BCVH × CHUYẾN ──────────────────────────────────── */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                <span>Bảng BCVH × Chuyến xe cấp 2</span>
              </h3>
              <span className="text-xs text-gray-500">
                Phân tích số bưu gửi không đạt theo từng chuyến xe đi
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">BCVH</th>
                    <th className="py-2.5 px-2">Chuyến xe đi</th>
                    <th className="py-2.5 px-2 text-right">Lỡ chuyến sát giờ (A)</th>
                    <th className="py-2.5 px-2 text-right">Trượt chuyến (B)</th>
                    <th className="py-2.5 px-2 text-right">Đúng chuyến quá hạn (C)</th>
                    <th className="py-2.5 px-2 text-right">Chưa đi quá hạn (E)</th>
                    <th className="py-2.5 px-3 text-right">Tổng không đạt đã đi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.theo_bcvh_chuyen || []).slice(0, 15).map((row, idx) => {
                    const rowMoc = row.theo_moc?.[mocKey] || {};
                    const nhomObj = rowMoc.nhom || {};
                    const bcvhObj = BCVH_LIST.find((item) => item.ma === row.ma_bcvh);

                    return (
                      <tr key={`${row.ma_bcvh}-${row.chuyen}-${idx}`} className="hover:bg-[#FFFBEF] transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                          {bcvhObj ? bcvhObj.ten : row.ma_bcvh}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums font-medium text-gray-800">
                          Chuyến {row.chuyen}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-amber-800 font-medium">
                          {nhomObj.A?.shbg != null ? formatInt(nhomObj.A.shbg) : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-red-700 font-medium">
                          {nhomObj.B?.shbg != null ? formatInt(nhomObj.B.shbg) : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-blue-700 font-medium">
                          {nhomObj.C?.shbg != null ? formatInt(nhomObj.C.shbg) : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-purple-700 font-medium">
                          {nhomObj.E?.shbg != null ? formatInt(nhomObj.E.shbg) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-red-800">
                          {rowMoc.khong_dat_da_di != null ? formatInt(rowMoc.khong_dat_da_di) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 5. PHÂN BỐ KHUNG THỜI GIAN CHỜ & XU HƯỚNG THEO NGÀY ───── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            {/* Phân bố khung thời gian chờ */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
              <h4 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                <span>Phân bố khung thời gian chờ (trừ 21:00–07:00)</span>
                <span className="text-[11px] font-normal text-gray-500">giờ thực lưu tại KTT</span>
              </h4>
              <div className="space-y-2">
                {(data.phan_bo_cho || []).map((pb, idx) => {
                  const pbm = pb.theo_moc?.[mocKey] || {};
                  const daDi = pbm.khong_dat_da_di;
                  const chuaDi = pbm.chua_di_qua_chi_tieu;
                  const tongKhung = daDi != null && chuaDi != null
                    ? daDi + chuaDi
                    : (daDi != null ? daDi : chuaDi);
                  const nhanKhung = {
                    den_14h: 'Đến 14 giờ',
                    '14_16h': '14 – 16 giờ',
                    '16_20h': '16 – 20 giờ',
                    '20_24h': '20 – 24 giờ',
                    '24_36h': '24 – 36 giờ',
                    '36_48h': '36 – 48 giờ',
                    tren_48h: 'Trên 48 giờ',
                  }[pb.khung_cho] || pb.khung_cho;

                  return (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                      <span className="font-medium text-gray-800 w-28">{nhanKhung}</span>
                      <div className="flex-1 px-3">
                        <div className="flex items-center gap-1 text-[11px] text-gray-500">
                          {daDi != null ? (
                            <span className="text-red-700 font-semibold">{formatInt(daDi)} đã đi</span>
                          ) : (
                            <span className="text-gray-400">chưa đủ số liệu</span>
                          )}
                          {chuaDi != null && chuaDi > 0 && (
                            <span className="text-purple-700 font-semibold">· {formatInt(chuaDi)} chưa đi</span>
                          )}
                        </div>
                      </div>
                      <span className="tabular-nums font-bold text-gray-900">
                        {tongKhung != null ? formatInt(tongKhung) : <span className="text-gray-400 font-normal">chưa đủ số liệu</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Xu hướng theo ngày */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
              <h4 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                <span>Xu hướng không đạt theo ngày đến</span>
                <span className="text-[11px] font-normal text-gray-500">theo ngày D</span>
              </h4>
              <div className="overflow-y-auto max-h-56 space-y-1.5 pr-1">
                {(data.theo_ngay || []).map((ng, idx) => {
                  const ngm = ng.theo_moc?.[mocKey] || {};
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                      <span className="font-medium text-gray-800 tabular-nums">
                        {formatDdMm(ng.ngay)} ({ng.ngay})
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-red-700 font-semibold tabular-nums">
                          {ngm.khong_dat_da_di != null ? formatInt(ngm.khong_dat_da_di) : '—'} không đạt
                        </span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-600 tabular-nums">
                          {ngm.do_duoc != null ? formatInt(ngm.do_duoc) : '—'} đo được
                        </span>
                      </div>
                      <span className="font-bold text-gray-900 tabular-nums w-12 text-right">
                        {ngm.ty_le_khong_dat != null ? formatPercent(ngm.ty_le_khong_dat) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── 6. DANH SÁCH KIỂM CHỨNG & NÚT XUẤT XLSX ─────────────────── */}
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span>Danh sách kiểm chứng bưu gửi không đạt</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Đối chiếu từng bưu gửi, thời gian xác nhận đến, giờ quét túi và giờ rời KTT
                </p>
              </div>

              {/* Nút Xuất xlsx Sheet 10 */}
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F7A5C] text-white hover:bg-[#18634B] shadow-2xs transition-colors self-start sm:self-auto disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exportLoading ? 'Đang xuất...' : 'Xuất xlsx (Sheet 10)'}
              </button>
            </div>

            {/* Các chip lọc danh sách kiểm chứng */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500 font-medium mr-1">Lọc theo nhóm:</span>
              <button
                type="button"
                onClick={() => setSelectedNhom('tat_ca')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedNhom === 'tat_ca'
                    ? 'bg-gray-900 text-white font-semibold'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tất cả nhóm
              </button>
              {['A', 'B', 'C', 'D', 'E'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedNhom(k)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedNhom === k
                      ? 'bg-gray-900 text-white font-semibold'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Nhóm {k}: {NHOM_INFO[k].nhan}
                </button>
              ))}

              {selectedHourCell !== null && (
                <div className="ml-auto flex flex-col items-end gap-0.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-blue-900">
                  <button
                    type="button"
                    onClick={() => setSelectedHourCell(null)}
                    className="font-semibold flex items-center gap-1 text-xs text-blue-800 hover:text-blue-950 cursor-pointer"
                  >
                    <span>
                      {selectedHourCell.ten} · giờ quét túi đến: {selectedHourCell.gio} giờ
                    </span>
                    <span className="font-bold">×</span>
                  </button>
                  <span className="text-[11px] text-blue-700 leading-snug">
                    Danh sách gồm cả hàng chưa đi đã quá chỉ tiêu, nên có thể nhiều hơn số trong ô.
                  </span>
                  {moc === 'A' && (
                    <span className="text-[11px] text-blue-700 leading-snug">
                      Lưới này luôn tính theo giờ quét túi đến.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Bảng danh sách bưu gửi */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[950px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Mã bưu gửi</th>
                    <th className="py-2.5 px-2">Ngày đến</th>
                    <th className="py-2.5 px-2">Giờ đến</th>
                    <th className="py-2.5 px-2">Đường thư đến</th>
                    <th className="py-2.5 px-2">BCVH đích</th>
                    <th className="py-2.5 px-2 text-right">Khối lượng</th>
                    <th className="py-2.5 px-2">Nhóm nguyên nhân</th>
                    <th className="py-2.5 px-3">Chuyến xe đi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itemsLoading && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500">
                        Đang tải danh sách kiểm chứng...
                      </td>
                    </tr>
                  )}

                  {!itemsLoading && itemsError && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-red-600">
                        {itemsError}
                      </td>
                    </tr>
                  )}

                  {!itemsLoading && !itemsError && items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 italic">
                        Không có bưu gửi nào thỏa mãn bộ lọc hiện tại.
                      </td>
                    </tr>
                  )}

                  {!itemsLoading &&
                    !itemsError &&
                    items.map((item, idx) => {
                      const nhomKey = item.nhom_nguyen_nhan || item.nhom || 'A';
                      const nhomBadge = NHOM_INFO[nhomKey] || NHOM_INFO.A;
                      const gioXnd = item.gio_xac_nhan_bd10_den ?? item.xndBd10 ?? null;
                      const gioQuet = item.gio_quet_tui_den ?? item.quetDen ?? null;
                      const gioMocChon = moc === 'B' ? (gioQuet || gioXnd) : (gioXnd || gioQuet);
                      const ngayDenText = formatNgayGioVn(gioMocChon, item.ngay_luu_thoat || item.ngayDen);
                      const duongThuTen = item.duong_thu_den_ten || item.duong_thu_den_ma || null;
                      const bcvhObj = BCVH_LIST.find((b) => b.ma === item.ma_bcvh);
                      const bcvhLabel = bcvhObj?.ten || item.ten_bcvh || item.ma_bcvh || null;
                      const chuyenDiText = item.gio_xuat_phat
                        ? formatNgayGioVn(item.gio_xuat_phat)
                        : (item.gioXuatPhat ? formatTimeShort(item.gioXuatPhat) : item.chuyen_lien_ke || null);

                      return (
                        <tr key={`${item.shbg || idx}`} className="hover:bg-[#FFFBEF] transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-gray-900 font-mono">
                            {item.shbg}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums text-gray-700 font-medium">
                            {ngayDenText || <span className="text-gray-400 font-normal">chưa có trong dữ liệu</span>}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums text-gray-700">
                            {!gioXnd && !gioQuet ? (
                              <span className="text-gray-400">chưa có trong dữ liệu</span>
                            ) : (
                              <>
                                <div>Xác nhận: {formatTimeShort(gioXnd)}</div>
                                <div className="text-[11px] text-gray-500">
                                  Quét túi: {formatTimeShort(gioQuet)}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 px-2 font-medium text-gray-800">
                            {duongThuTen ? (
                              <>
                                <span>{duongThuTen}</span>
                                {item.duong_thu_den_ten && item.duong_thu_den_ma && item.duong_thu_den_ten !== item.duong_thu_den_ma && (
                                  <span className="block text-[11px] font-normal text-gray-500">
                                    {item.duong_thu_den_ma}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400 font-normal">chưa có trong dữ liệu</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-gray-800">
                            {bcvhLabel || <span className="text-gray-400">chưa có trong dữ liệu</span>}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-gray-800">
                            {formatKg(item.kg != null ? item.kg : (item.gam != null ? item.gam / 1000 : null), { withUnit: true })}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${nhomBadge.badgeColor}`}>
                              Nhóm {nhomKey}: {nhomBadge.nhan}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 tabular-nums">
                            {chuyenDiText || '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Phân trang */}
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
                <div>
                  Tổng cộng <strong className="font-semibold text-gray-900">{formatInt(pagination.total)}</strong> bưu gửi kiểm chứng
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || itemsLoading}
                    className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    Trang {page} / {pagination.total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                    disabled={page >= pagination.total_pages || itemsLoading}
                    className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
