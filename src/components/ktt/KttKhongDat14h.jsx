import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, AlertCircle, Filter, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Layers, Calendar, BarChart2, Clock } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent, formatDdMm } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatDecimal, formatTimeShort } from './kttFormatters';
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
    moTa: 'Chưa lập BD10 đi và thời gian lưu tại KTT đã vượt 14 giờ',
    color: 'border-purple-400 bg-purple-50/60 text-purple-900',
    barColor: 'bg-purple-500',
    badgeColor: 'bg-purple-100 text-purple-800',
  },
};

export default function KttKhongDat14h({
  dateRange,
  selectedBcvh,
  mocChiTieu,
  filterDuongThu,
  onClearDuongThu,
}) {
  const [moc, setMoc] = useState('A');
  const [unit, setUnit] = useState('shbg'); // 'shbg' | 'kg'
  const [selectedNhom, setSelectedNhom] = useState('tat_ca'); // 'tat_ca' | 'A' | 'B' | 'C' | 'D' | 'E'
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedChuyen, setSelectedChuyen] = useState(null);

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

  // Đồng bộ mốc từ ngoài
  useEffect(() => {
    if (mocChiTieu === 'quet_tui_den') {
      setMoc('B');
    } else {
      setMoc('A');
    }
  }, [mocChiTieu]);

  // Tải dữ liệu chính của khối
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      moc,
      ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
      nguon: filterDuongThu || undefined,
    };

    try {
      const res = await fetchKttKhongDat14h(params);
      if (res.ok) {
        setData(res.data);
      } else {
        setError(res.error || 'Lỗi tải dữ liệu Không đạt 14 giờ');
      }
    } catch (err) {
      setError('Lỗi kết nối khi tải dữ liệu Không đạt 14 giờ.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, moc, selectedBcvh, filterDuongThu]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tải danh sách kiểm chứng chi tiết bưu gửi
  const loadItems = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setItemsLoading(true);
    setItemsError(null);

    try {
      const res = await fetchKttChiTietKhongDat14h({
        tu: dateRange.from,
        den: dateRange.to,
        moc,
        nhom: selectedNhom,
        ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
        nguon: filterDuongThu || undefined,
        gio_den: selectedHour !== null ? selectedHour : undefined,
        chuyen: selectedChuyen || undefined,
        page,
        page_size: pageSize,
      });

      if (res.ok) {
        setItems(res.data.items || []);
        setPagination(res.data.pagination || { total: 0, page: 1, page_size: pageSize, total_pages: 1 });
      } else {
        setItemsError(res.error || 'Không tải được danh sách kiểm chứng');
        setItems([]);
      }
    } catch (err) {
      setItemsError('Lỗi kết nối khi tải danh sách kiểm chứng.');
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, [dateRange, moc, selectedNhom, selectedBcvh, filterDuongThu, selectedHour, selectedChuyen, page, pageSize]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Reset trang khi đổi bộ lọc
  useEffect(() => {
    setPage(1);
  }, [selectedNhom, selectedBcvh, filterDuongThu, selectedHour, selectedChuyen, moc]);

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
        nguon: filterDuongThu || undefined,
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

  // Render giá trị sản lượng theo unit
  const renderValue = (shbg, kg) => {
    if (unit === 'kg') {
      if (kg === null || kg === undefined) return <span className="text-gray-400">chưa đủ số liệu</span>;
      return <span>{formatKg(kg, { withUnit: true })}</span>;
    }
    return <span>{formatInt(shbg)} bưu gửi</span>;
  };

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 mt-6 space-y-6 shadow-sm">
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
            Bóc tách nguồn gốc phát sinh không đạt chỉ tiêu theo nhóm nguyên nhân, đợt đến, khung giờ và chuyến xe
          </p>
        </div>

        {/* Các nút bấm chuyển mốc & đơn vị */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mốc A / B */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => setMoc('A')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                moc === 'A'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mốc A (Xác nhận BD10 đến)
            </button>
            <button
              type="button"
              onClick={() => setMoc('B')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                moc === 'B'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mốc B (Quét túi đến)
            </button>
          </div>

          {/* Đơn vị Bưu gửi / kg */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => setUnit('shbg')}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                unit === 'shbg'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Bưu gửi
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                unit === 'kg'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Khối lượng (kg)
            </button>
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
                (đo được {formatInt(tongMoc.khong_dat_da_di)} / {formatInt(tongMoc.do_duoc)} bưu gửi)
              </span>
            </div>
            <div className="text-[11px] text-gray-600">
              * Tỷ lệ chuẩn = Không đạt đã đi (nhóm A+B+C+D) chia cho Tổng đo được mốc {moc}. Nhóm E (chưa đi, đã quá chỉ tiêu) có {formatInt(tongMoc.chua_di_qua_chi_tieu)} bưu gửi, không nằm trong mẫu số tỷ lệ đã đi.
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
          <span>{error}</span>
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
                const nhomData = tongMoc?.nhom?.[k] || { shbg: 0, kg: 0 };
                const isSelected = selectedNhom === k;
                const shbg = nhomData.shbg || 0;
                const tyLe = tongMoc?.do_duoc > 0 ? (k === 'E' ? null : shbg / tongMoc.do_duoc) : null;

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
                        {renderValue(shbg, nhomData.kg)}
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

          {/* ── 2. GIỜ ĐẾN × ĐƯỜNG THƯ ─────────────────────────────────── */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Giờ đến × Đường thư</span>
              </h3>
              <span className="text-xs text-gray-500">
                Phân bố số lượng không đạt theo giờ hàng đến và đường thư
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Giờ đến</th>
                    <th className="py-2.5 px-3">Đường thư đến</th>
                    <th className="py-2.5 px-2 text-right">Không đạt đã đi</th>
                    <th className="py-2.5 px-2 text-right">Chưa đi quá chỉ tiêu</th>
                    <th className="py-2.5 px-2 text-right">Tổng đo được</th>
                    <th className="py-2.5 px-2 text-right">Tỷ lệ không đạt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.theo_gio_duong_thu || []).slice(0, 15).map((row, idx) => {
                    const rowMoc = row.theo_moc?.[mocKey] || {};
                    return (
                      <tr
                        key={`${row.gio}-${row.nguon}-${idx}`}
                        onClick={() => {
                          setSelectedHour(row.gio);
                        }}
                        className="hover:bg-[#FFFBEF] transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-semibold text-gray-900 tabular-nums">
                          {String(row.gio).padStart(2, '0')}:00 – {String(row.gio).padStart(2, '0')}:59
                        </td>
                        <td className="py-2.5 px-3 font-medium text-gray-800">
                          {row.nguon_ten || row.nguon || '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-red-700">
                          {renderValue(rowMoc.khong_dat_da_di, row.kg)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-medium text-purple-700">
                          {formatInt(rowMoc.chua_di_qua_chi_tieu || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-gray-700 font-medium">
                          {formatInt(rowMoc.do_duoc || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold text-gray-900">
                          {rowMoc.ty_le_khong_dat !== null ? formatPercent(rowMoc.ty_le_khong_dat) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                {(data.theo_duong_thu || []).slice(0, 8).map((dt, idx) => {
                  const dtm = dt.theo_moc?.[mocKey] || {};
                  const totalKd = dtm.khong_dat_da_di || 0;
                  const maxKd = data.theo_duong_thu?.[0]?.theo_moc?.[mocKey]?.khong_dat_da_di || 1;
                  const pct = Math.min(100, Math.max(5, (totalKd / maxKd) * 100));

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-800 font-medium">
                        <span className="truncate max-w-[240px]" title={dt.nguon_ten || dt.nguon}>
                          {dt.nguon_ten || dt.nguon}
                        </span>
                        <span className="tabular-nums font-semibold text-red-700">
                          {formatInt(totalKd)} ({formatPercent(dtm.ty_le_khong_dat)})
                        </span>
                      </div>
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Theo BCVH đích */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
              <h4 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                <span>Phân bố theo BCVH đích</span>
                <span className="text-[11px] font-normal text-gray-500">bưu gửi không đạt</span>
              </h4>
              <div className="space-y-2">
                {(data.theo_bcvh || []).map((b, idx) => {
                  const bm = b.theo_moc?.[mocKey] || {};
                  const bcvhObj = BCVH_LIST.find((item) => item.ma === b.ma_bcvh);
                  const totalKd = bm.khong_dat_da_di || 0;
                  const maxKd = data.theo_bcvh?.[0]?.theo_moc?.[mocKey]?.khong_dat_da_di || 1;
                  const pct = Math.min(100, Math.max(5, (totalKd / maxKd) * 100));

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-800 font-medium">
                        <span>{bcvhObj ? bcvhObj.ten : b.ma_bcvh} ({b.ma_bcvh})</span>
                        <span className="tabular-nums font-semibold text-red-700">
                          {formatInt(totalKd)} ({formatPercent(bm.ty_le_khong_dat)})
                        </span>
                      </div>
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
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
                          {formatInt(nhomObj.A?.shbg || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-red-700 font-medium">
                          {formatInt(nhomObj.B?.shbg || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-blue-700 font-medium">
                          {formatInt(nhomObj.C?.shbg || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-purple-700 font-medium">
                          {formatInt(nhomObj.E?.shbg || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-red-800">
                          {formatInt(rowMoc.khong_dat_da_di || 0)}
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
                  const daDi = pbm.khong_dat_da_di || 0;
                  const chuaDi = pbm.chua_di_qua_chi_tieu || 0;
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
                          <span className="text-red-700 font-semibold">{formatInt(daDi)} đã đi</span>
                          {chuaDi > 0 && (
                            <span className="text-purple-700 font-semibold">· {formatInt(chuaDi)} chưa đi</span>
                          )}
                        </div>
                      </div>
                      <span className="tabular-nums font-bold text-gray-900">
                        {formatInt(daDi + chuaDi)}
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
                          {formatInt(ngm.khong_dat_da_di || 0)} không đạt
                        </span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-600 tabular-nums">
                          {formatInt(ngm.do_duoc || 0)} đo được
                        </span>
                      </div>
                      <span className="font-bold text-gray-900 tabular-nums w-12 text-right">
                        {ngm.ty_le_khong_dat !== null ? formatPercent(ngm.ty_le_khong_dat) : '—'}
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

              {selectedHour !== null && (
                <button
                  type="button"
                  onClick={() => setSelectedHour(null)}
                  className="px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-medium flex items-center gap-1 ml-auto"
                >
                  Giờ {selectedHour}h <span>×</span>
                </button>
              )}
            </div>

            {/* Bảng danh sách bưu gửi */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[950px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Mã bưu gửi</th>
                    <th className="py-2.5 px-2">Ngày đến</th>
                    <th className="py-2.5 px-2">Giờ đến (A/B)</th>
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

                      return (
                        <tr key={`${item.shbg || idx}`} className="hover:bg-[#FFFBEF] transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-gray-900 font-mono">
                            {item.shbg}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums text-gray-700 font-medium">
                            {item.ngay_den || item.ngay || '—'}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums text-gray-700">
                            <div>A: {formatTimeShort(item.bd10_den_xnd || item.gio_den_a)}</div>
                            <div className="text-[11px] text-gray-500">
                              B: {formatTimeShort(item.gio_quet_den || item.gio_den_b)}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-medium text-gray-800">
                            {item.duong_thu_ten || item.duong_thu || '—'}
                          </td>
                          <td className="py-2.5 px-2 text-gray-800">
                            {item.bcvh_ten || item.ma_bcvh || '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-gray-800">
                            {formatKg(item.kg || (item.gam ? item.gam / 1000 : null), { withUnit: true })}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${nhomBadge.badgeColor}`}>
                              Nhóm {nhomKey}: {nhomBadge.nhan}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 tabular-nums">
                            {item.chuyen_di || item.gio_xuat_phat || item.chuyen || '—'}
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
