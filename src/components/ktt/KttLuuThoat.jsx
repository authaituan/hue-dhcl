import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import QuyThoiGianDateRangePicker from '../quythoigian/QuyThoiGianDateRangePicker';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive,
  formatInt,
  formatPercent,
  formatDdMmYyyy,
  formatDdMm,
  formatDateTime,
} from '../quythoigian/quyThoiGianFormatters';
import { formatKg } from './kttFormatters';
import { fetchKttMeta, fetchKttLuuThoat, downloadKttLuuThoat } from './kttApi';
import KttTheoNguon from './KttTheoNguon';
import KttBanDoNhiet from './KttBanDoNhiet';
import KttChiTiet from './KttChiTiet';
import KttErrorBoundary from './KttErrorBoundary';

// Thứ trong tuần tiếng Việt
function getThuTiengViet(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const names = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return names[day];
}

// Trừ số phút từ chuỗi HH:MM
function truPhut(hhmm, phut) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  let tongPhut = h * 60 + m - phut;
  if (tongPhut < 0) tongPhut += 24 * 60;
  const hMoi = Math.floor(tongPhut / 60);
  const mMoi = tongPhut % 60;
  return `${String(hMoi).padStart(2, '0')}:${String(mMoi).padStart(2, '0')}`;
}

const EXPORT_STATUS_OPTIONS = [
  { key: '', label: 'Tất cả bưu gửi đến KTT' },
  { key: 't1', label: '1 · Đi trong ngày, đúng chuyến' },
  { key: 't2', label: '2 · Đi trong ngày, trượt chuyến' },
  { key: 't3', label: '3 · Đi hôm sau, đúng chuyến' },
  { key: 't4', label: '4 · Đi hôm sau, trượt chuyến' },
  { key: 't5', label: '5 · Từ 2 ngày hoặc chưa đi' },
  { key: 'dang_cho_chuyen', label: 'Đang chờ chuyến' },
  { key: 'hang_hoan', label: 'Hàng hoàn Tổ KHHH' },
];

export default function KttLuuThoat({ authUser }) {
  // Khoảng ngày mặc định: chờ meta lấy ngày của độ mới dữ liệu (KTT-13a)
  const [dateRange, setDateRange] = useState(null);

  const [selectedBcvh, setSelectedBcvh] = useState('all');
  const [mocChiTieu, setMocChiTieu] = useState('xnd');
  const [validationError, setValidationError] = useState(null);

  // Dữ liệu từ API
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Xuất Excel
  const [selectedExportStatus, setSelectedExportStatus] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Hộp giải thích nhóm ngoài 7 trạng thái
  const [showNgoaiBayChipModal, setShowNgoaiBayChipModal] = useState(false);

  // Ô bản đồ nhiệt đang chọn (lọc danh sách chi tiết + xuất)
  const [selectedCell, setSelectedCell] = useState(null);

  // Reset selectedCell khi đổi BCVH hoặc đổi khoảng ngày ở đầu trang
  useEffect(() => {
    setSelectedCell(null);
  }, [selectedBcvh, dateRange]);

  // Ref chống stale response khi đổi khoảng ngày nhanh
  const reqIdRef = useRef(0);

  // 1. Tải meta một lần khi vào trang; xác định khoảng ngày mặc định theo độ mới dữ liệu
  useEffect(() => {
    let active = true;
    setMetaLoading(true);
    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setMeta(res.data);
          setMetaError(null);
          const rawLuc = res.data.nguon_xuat_luc_moi_nhat;
          const latestDay = (rawLuc && typeof rawLuc === 'string' && rawLuc.length >= 10)
            ? rawLuc.slice(0, 10)
            : getTodayVnYmd();
          setDateRange({
            from: shiftDay(latestDay, -6),
            to: latestDay,
          });
        } else {
          setMetaError(res.error || 'Không tải được lịch chuyến');
          const today = getTodayVnYmd();
          setDateRange({
            from: shiftDay(today, -6),
            to: today,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setMetaError('Không tải được lịch chuyến');
        const today = getTodayVnYmd();
        setDateRange({
          from: shiftDay(today, -6),
          to: today,
        });
      })
      .finally(() => {
        if (active) {
          setMetaLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 2. Validate khoảng ngày (tối đa 31 ngày)
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return 'Khoảng ngày tối đa 31 ngày (đang chọn ' + days + ' ngày).';
    return null;
  }, []);

  // 3. Tải dữ liệu lưu thoát (hỗ trợ tham số moc_chi_tieu)
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) {
      return;
    }
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) {
      setLoading(false);
      return;
    }

    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchKttLuuThoat({ tu: dateRange.from, den: dateRange.to, moc_chi_tieu: mocChiTieu });
      if (currentReqId !== reqIdRef.current) return;

      if (res.ok) {
        setData(res.data);
      } else {
        setError(res.error || 'Có lỗi xảy ra khi tải dữ liệu Hàng tại KTT.');
        setData(null);
      }
    } catch (err) {
      if (currentReqId !== reqIdRef.current) return;
      setError('Lỗi hệ thống khi đọc dữ liệu Hàng tại KTT.');
      setData(null);
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, mocChiTieu, validateRange]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      loadData();
    }
  }, [dateRange, mocChiTieu, loadData]);

  // Xử lý đổi khoảng ngày
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // 4. Xử lý tải Excel Sheet 7
  const handleDownloadExcel = async () => {
    if (validationError || !dateRange) return;
    setExportLoading(true);
    setExportError(null);

    const effBcvh = selectedCell?.ma_bcvh || (selectedBcvh !== 'all' ? selectedBcvh : undefined);
    const effNguon = selectedCell?.nguon || undefined;

    try {
      const res = await downloadKttLuuThoat({
        tu: dateRange.from,
        den: dateRange.to,
        trang_thai: selectedExportStatus,
        ma_bcvh: effBcvh,
        nguon: effNguon,
      });
      if (!res.ok) {
        setExportError(res.error || 'Không tải được tệp Excel.');
      }
    } catch (e) {
      setExportError('Lỗi kết nối khi tải file.');
    } finally {
      setExportLoading(false);
    }
  };

  // Dữ liệu khối 3-5 theo BCVH đã chọn
  const activeBlockData = useMemo(() => {
    if (!data?.tong_cong) return null;
    if (selectedBcvh === 'all') return data.tong_cong;
    return data.tong_cong.theo_bcvh?.[selectedBcvh] || null;
  }, [data, selectedBcvh]);

  const activeHangHoan = useMemo(() => {
    if (!data?.tong_cong?.hang_hoan) return null;
    // Hàng hoàn chỉ của Thuận Hóa; nếu chọn BCVH khác Thuận Hóa thì ẩn khối hàng hoàn (không dựng số 0)
    if (selectedBcvh !== 'all' && selectedBcvh !== '533140') {
      return null;
    }
    return data.tong_cong.hang_hoan;
  }, [data, selectedBcvh]);

  // Số lượng cho từng chip xuất (phản ánh đúng bộ lọc BCVH đang chọn)
  const getExportCount = (key) => {
    if (!data?.tong_cong) return null;
    if (selectedCell) return null; // KTT-13a: Đang lọc theo ô heatmap thì chip hiện «–»
    const targetBlock = selectedBcvh === 'all'
      ? data.tong_cong
      : data.tong_cong.theo_bcvh?.[selectedBcvh];
    if (!targetBlock) return 0;
    if (key === '') return targetBlock.tong_shbg_ngay ?? 0;
    if (key === 'hang_hoan') {
      if (selectedBcvh !== 'all' && selectedBcvh !== '533140') return 0;
      return (selectedBcvh === 'all'
        ? data.tong_cong.hang_hoan?.tong_shbg
        : (data.tong_cong.theo_bcvh?.['533140']?.hang_hoan?.tong_shbg ?? data.tong_cong.hang_hoan?.tong_shbg)) ?? 0;
    }
    return targetBlock.trang_thai?.[key]?.shbg ?? 0;
  };

  // Khối phân rã ngoài bảy trạng thái theo BCVH đang chọn (KTT-13a)
  const currentNgoaiBayChip = useMemo(() => {
    if (!data?.tong_cong) return null;
    if (selectedBcvh === 'all') {
      return data.tong_cong.ngoai_bay_chip || null;
    }
    const bBlock = data.tong_cong.theo_bcvh?.[selectedBcvh];
    if (!bBlock) return null;
    if (bBlock.ngoai_bay_chip) return bBlock.ngoai_bay_chip;
    const kpl = bBlock.khong_phan_loai || {};
    const khongCoGio = kpl.khong_co_gio_quet_den ?? 0;
    const khongXepTong = Object.values(kpl.khong_xep_duoc_chuyen || {}).reduce((s, x) => s + x, 0);
    return {
      khong_ro_dich: 0,
      ngoai_pham_vi_tong: 0,
      khong_co_gio_quet_den: khongCoGio,
      khong_xep_duoc_chuyen_tong: khongXepTong,
      tong: khongCoGio + khongXepTong,
    };
  }, [data, selectedBcvh]);

  // Gom lịch chuyến theo từng BCVH
  const groupedLichChuyen = useMemo(() => {
    const lich = meta?.lich_chuyen || [];
    const hanPhut = meta?.han_den_truoc_chuyen_phut ?? 60;
    const map = new Map();

    BCVH_LIST.forEach((b) => {
      map.set(b.ma, {
        ma: b.ma,
        ten: b.ten,
        chuyen: [],
      });
    });

    lich.forEach((c) => {
      if (c.dang_dung !== 0 && map.has(c.ma_bcvh)) {
        map.get(c.ma_bcvh).chuyen.push(c);
      }
    });

    // Sắp xếp các chuyến theo giờ
    map.forEach((item) => {
      item.chuyen.sort((a, b) => a.gio_xuat_phat.localeCompare(b.gio_xuat_phat));
    });

    return Array.from(map.values()).map((item) => {
      const mocXuatPhat = item.chuyen.map((c) => {
        const sao = c.ngay_chay === 'NGHI_CN' ? '*' : '';
        const nhanStr = c.nhan ? ` (${c.nhan})` : '';
        return `${c.gio_xuat_phat}${sao}${nhanStr}`;
      }).join(' · ');

      const mocHanDen = item.chuyen.map((c) => {
        const sao = c.ngay_chay === 'NGHI_CN' ? '*' : '';
        return `${truPhut(c.gio_xuat_phat, hanPhut)}${sao}`;
      }).join(' · ');

      const cnNghi = item.chuyen.filter((c) => c.ngay_chay === 'NGHI_CN').map((c) => c.gio_xuat_phat);
      const total = item.chuyen.length;

      let cnText = '—';
      if (total > 0 && cnNghi.length === total) {
        cnText = 'Nghỉ cả ngày';
      } else if (cnNghi.length > 0) {
        cnText = `Nghỉ ${cnNghi.join(', ')}`;
      }

      return {
        ma: item.ma,
        ten: item.ten,
        mocXuatPhat: mocXuatPhat || '—',
        mocHanDen: mocHanDen || '—',
        chuNhat: cnText,
      };
    });
  }, [meta]);

  const nguonXuatLuc = data?.meta?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;
  const isChuaCoDuLieu = data && (data.ly_do === 'CHUA_CO_DU_LIEU' || data.tong_cong === null);
  const isKhoangKhongCoHang = data && !isChuaCoDuLieu && !data.co_du_lieu;
  const hasNoData = !data?.co_du_lieu;

  return (
    <div className="p-6 space-y-5">
      {/* ── 1. TIÊU ĐỀ & BỘ LỌC ĐẦU TRANG ─────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="ktt-h1">Lưu thoát trong ngày</h1>
            {nguonXuatLuc && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A5C]" />
                Dữ liệu đến lúc {formatDateTime(String(nguonXuatLuc).slice(0, 16))}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Trung tâm Khai thác · 530100 · Hàng tại KTT
          </p>
        </div>

        {/* Hàng bộ lọc: Mốc chỉ tiêu, BCVH & Khoảng ngày */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bộ chọn mốc chỉ tiêu 14 giờ (A/B) */}
          <div className="flex items-center bg-white px-2 py-1 rounded-[10px] border border-[#D9CBA8] shadow-none text-xs gap-1">
            <span className="font-semibold text-gray-600 pl-1 mr-1 whitespace-nowrap">Mốc 14 giờ:</span>
            <button
              type="button"
              id="ktt-moc-xnd-btn"
              onClick={() => setMocChiTieu('xnd')}
              className={`px-2.5 py-1 rounded-[6px] font-bold transition-all cursor-pointer ${
                mocChiTieu === 'xnd'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-[#FAF5E8]'
              }`}
              title="Mốc A: Xác nhận BD10 đến (ConfirmDate) → Giờ lập BD10 đi"
            >
              Mốc A (XNĐ)
            </button>
            <button
              type="button"
              id="ktt-moc-quet-btn"
              onClick={() => setMocChiTieu('quet_tui_den')}
              className={`px-2.5 py-1 rounded-[6px] font-bold transition-all cursor-pointer ${
                mocChiTieu === 'quet_tui_den'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-[#FAF5E8]'
              }`}
              title="Mốc B: Quét túi đến KTT → Giờ lập BD10 đi"
            >
              Mốc B (Quét túi đến)
            </button>
          </div>

          {/* Dropdown BCVH */}
          <div className="flex items-center bg-white px-2.5 py-1.5 rounded-[10px] border border-[#D9CBA8] shadow-none text-xs">
            <span className="font-semibold text-gray-600 mr-2 whitespace-nowrap">BCVH đích:</span>
            <select
              id="ktt-bcvh-select"
              aria-label="BCVH đích"
              value={selectedBcvh}
              onChange={(e) => setSelectedBcvh(e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Tất cả 6 BCVH Huế</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten}
                </option>
              ))}
            </select>
          </div>

          {/* Bộ chọn khoảng ngày tái dùng */}
          <QuyThoiGianDateRangePicker
            dateRange={dateRange || { from: '', to: '' }}
            onChangeDateRange={handleDateRangeChange}
            idPrefix="ktt-luu-thoat"
          />
        </div>
      </div>

      {/* Dòng ghi chú định hướng như canvas */}
      <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] px-3.5 py-2 text-xs text-[#5A4A62]">
        Trang này dùng để điều hành từng ngày. Tối đa 31 ngày theo đúng bộ chọn ngày của hệ thống.
      </div>

      {/* Cảnh báo validate ngày nếu người dùng chọn sai khoảng */}
      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center gap-2 font-medium" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Hộp lỗi khi gọi API */}
      {error && !validationError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline shrink-0 cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Trạng thái chưa có dữ liệu nạp lần nào */}
      {!loading && isChuaCoDuLieu && (
        <div className="bg-white rounded-[14px] p-8 border border-gray-200 text-center text-sm text-gray-500 italic shadow-none">
          Chưa có dữ liệu Hàng tại KTT
        </div>
      )}

      {/* Khoảng ngày đã chọn không có hàng nhưng DB có dữ liệu */}
      {!loading && isKhoangKhongCoHang && (
        <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] p-4 text-center text-xs font-semibold text-[#5A4A62]">
          Khoảng đã chọn không có hàng
        </div>
      )}

      {/* Chỉ báo đang tải khi đổi khoảng ngày */}
      {loading && data && (
        <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs font-semibold text-[#5A4A62]">
          <span className="w-2 h-2 rounded-full bg-[#1F7A5C] animate-ping" />
          <span>Đang tải…</span>
        </div>
      )}

      {/* Trạng thái khung xương đang tải */}
      {(!dateRange || metaLoading || (loading && !data)) && (
        <div className="space-y-4 animate-pulse">
          <div className="h-44 bg-white rounded-[14px] border border-gray-200 p-6" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-[14px] border border-gray-200" />
            ))}
          </div>
          <div className="h-48 bg-white rounded-[14px] border border-gray-200" />
        </div>
      )}

      {/* NỘI DUNG CHÍNH (Khi có dữ liệu) */}
      {data && !isChuaCoDuLieu && (
        <div className={`space-y-5 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
          {/* ── 2. BẢNG «THEO NGÀY HÀNG ĐẾN» ───────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none">
            <div className="mb-3">
              <h2 className="ktt-h2 text-[17px]">Theo ngày hàng đến</h2>
              <p className="text-xs text-gray-600 mt-1">
                Ngày chưa chốt hiện <span className="text-[#A87A12] font-semibold">«Số tạm»</span>; ngày chốt khi dữ liệu 09:00 của hôm sau về.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="table-soft w-full min-w-[700px] text-left">
                <thead>
                  <tr>
                    <th className="text-left">NGÀY</th>
                    <th className="text-center">CHỐT SỐ</th>
                    <th className="text-right">HÀNG ĐẾN TÍNH CHỈ TIÊU</th>
                    <th className="text-right">ĐI TRONG NGÀY</th>
                    <th className="text-right">RỚT LẠI SANG HÔM SAU</th>
                    <th className="text-right">ĐẠT 14 GIỜ (TRÊN SỐ ĐO ĐƯỢC)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.theo_ngay && data.theo_ngay.length > 0 ? (
                    data.theo_ngay.map((row) => {
                      const dayBlock = selectedBcvh === 'all' ? row.tong : row.theo_bcvh?.[selectedBcvh];
                      const ddmm = formatDdMmYyyy(row.ngay).slice(0, 5);
                      const thu = getThuTiengViet(row.ngay);

                      if (!row.co_du_lieu) {
                        return (
                          <tr key={row.ngay} className="opacity-50">
                            <td className="font-medium whitespace-nowrap">
                              {ddmm} ({thu})
                            </td>
                            <td className="text-center">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">
                                Chưa có hàng đến
                              </span>
                            </td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                          </tr>
                        );
                      }

                      if (!dayBlock) {
                        return (
                          <tr key={row.ngay} className="hover:bg-[#FFFBEF] transition-colors">
                            <td className="font-medium whitespace-nowrap text-gray-900">
                              {ddmm} ({thu})
                            </td>
                            <td className="text-center">
                              {row.da_chot ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                                  Đã chốt
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF1CC] text-[#A87A12]">
                                  Số tạm
                                </span>
                              )}
                            </td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                            <td className="text-right italic text-gray-400">—</td>
                          </tr>
                        );
                      }

                      const mauSo = dayBlock.luu_thoat?.mau_so ?? 0;
                      const rotLaiShbg = (dayBlock.trang_thai?.t3?.shbg ?? 0) +
                        (dayBlock.trang_thai?.t4?.shbg ?? 0) +
                        (dayBlock.trang_thai?.t5?.shbg ?? 0);
                      const tyLeRotLai = mauSo > 0 ? rotLaiShbg / mauSo : null;

                      return (
                        <tr key={row.ngay} className="hover:bg-[#FFFBEF] transition-colors">
                          <td className="font-medium whitespace-nowrap text-gray-900">
                            {ddmm} ({thu})
                          </td>
                          <td className="text-center">
                            {row.da_chot ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                                Đã chốt
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF1CC] text-[#A87A12]">
                                Số tạm
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums font-medium text-gray-900">
                            {formatInt(mauSo)}
                          </td>
                          <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                            {formatPercent(dayBlock.luu_thoat?.ty_le)}
                          </td>
                          <td className="text-right tabular-nums font-semibold text-[#A87A12]">
                            {formatPercent(tyLeRotLai)}
                          </td>
                          {(() => {
                            const dayC14 = dayBlock.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                            const doDuoc = dayC14?.do_duoc ?? 0;
                            const mauSo14 = dayC14?.mau_so ?? 0;
                            const tyLe14 = doDuoc > 0 ? dayC14.ty_le_dat_tren_do_duoc : null;
                            const tooltip = `Đo được ${formatInt(doDuoc)}/${formatInt(mauSo14)} · đạt ${formatInt(dayC14?.dat ?? 0)} · không đạt ${formatInt(dayC14?.khong_dat ?? 0)}`;
                            return (
                              <td
                                className="text-right tabular-nums font-semibold text-[#4A1D6E] cursor-help"
                                title={tooltip}
                              >
                                {tyLe14 !== null ? formatPercent(tyLe14) : '—'}
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-gray-500 italic">
                        Không có ngày nào trong khoảng chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 8. KHUNG «XUẤT XLSX · SHEET 7» ─────────────────────────────── */}
          <div
            className="bg-white rounded-[10px] border border-gray-200 border-t-4 border-t-amber-400 p-5 shadow-none"
            aria-busy={exportLoading ? 'true' : 'false'}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cột trái */}
              <div className="flex flex-col justify-between">
                <div>
                  <h2 className="ktt-h2 text-[17px]">
                    Xuất xlsx · Sheet 7
                  </h2>
                  <p className="text-xs text-gray-600 leading-relaxed mt-1.5">
                    Một dòng là một bưu gửi, 18 cột, kèm sheet «Thông tin». Xuất theo khoảng ngày đang chọn (tối đa 31 ngày, tối đa 200.000 dòng) và trạng thái chọn bên cạnh. Chỉ ADMIN và TTVH.
                  </p>
                  <p className="text-xs text-[#A87A12] font-semibold mt-1">
                    {(() => {
                      const effBcvh = selectedCell?.ma_bcvh || (selectedBcvh !== 'all' ? selectedBcvh : null);
                      const effNguon = selectedCell?.nguon || null;
                      const bcvhName = effBcvh ? (BCVH_LIST.find((b) => b.ma === effBcvh)?.ten || effBcvh) : null;
                      const nguonName = selectedCell?.nguonTen || effNguon;

                      if (bcvhName && nguonName) {
                        return `Đang lọc theo: BCVH ${bcvhName} · Nguồn ${nguonName}`;
                      }
                      if (bcvhName) {
                        return `Đang lọc theo: BCVH ${bcvhName}`;
                      }
                      if (nguonName) {
                        return `Đang lọc theo: Nguồn ${nguonName}`;
                      }
                      return 'Ghi rõ: xuất cả 6 BCVH.';
                    })()}
                  </p>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    FILE GỒM CÁC CỘT
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs text-gray-600">
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">SHBG</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">Đường thư đến</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">Giờ quét đến</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">ConfirmDate</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">BCVH đích</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">Chuyến liền kề</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">Giờ BD10 đi</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line" title="Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi)">Mốc A</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line" title="Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi)">Mốc B</span>
                    <span className="px-2 py-0.5 bg-cream-head rounded border border-cream-line">Trạng thái (1–5)</span>
                  </div>
                </div>
              </div>

              {/* Cột phải */}
              <div>
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  CHỌN TRẠNG THÁI XUẤT
                </div>

                {/* 8 chip chọn */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {EXPORT_STATUS_OPTIONS.map((opt) => {
                    const isSelected = selectedExportStatus === opt.key;
                    const count = getExportCount(opt.key);
                    const countText = (hasNoData || count === null) ? '—' : formatInt(count);
                    return (
                      <button
                        key={opt.key || 'ALL'}
                        type="button"
                        onClick={() => setSelectedExportStatus(opt.key)}
                        disabled={exportLoading}
                        className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-[#4A1D6E] text-white font-bold border border-transparent shadow-none'
                            : 'bg-white text-gray-700 border border-[#D9CBA8] font-medium hover:bg-[#FFFBEF]'
                        }`}
                      >
                        {opt.label} · {countText}
                      </button>
                    );
                  })}
                </div>

                {/* Khi đang lọc theo ô heatmap (KTT-13a) */}
                {selectedCell && (
                  <div className="mb-3 text-xs text-[#A87A12] bg-[#FFFBEF] border border-[#E4D5AE] rounded-[8px] px-3 py-2 flex items-center justify-between">
                    <span>
                      Đang lọc theo ô {selectedCell.label || 'bản đồ nhiệt'} : bỏ lọc để xem số các nhóm
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(null)}
                      className="font-bold underline text-[#4A1D6E] ml-2 cursor-pointer shrink-0"
                    >
                      Bỏ lọc
                    </button>
                  </div>
                )}

                {/* Dòng «Không vào bảy trạng thái» (KTT-13a) */}
                {!selectedCell && currentNgoaiBayChip && currentNgoaiBayChip.tong > 0 && (
                  <div className="mb-3">
                    <button
                      type="button"
                      onClick={() => setShowNgoaiBayChipModal((prev) => !prev)}
                      aria-expanded={showNgoaiBayChipModal ? 'true' : 'false'}
                      className="text-xs text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-[#FAF5E8] border border-gray-200 hover:border-[#D9CBA8] rounded-[8px] px-3 py-1.5 transition-colors cursor-pointer text-left w-full"
                    >
                      <span className="font-semibold text-gray-900">
                        Không vào bảy trạng thái: {formatInt(currentNgoaiBayChip.tong)}
                      </span>
                      {' ('}
                      <span>không rõ đích {formatInt(currentNgoaiBayChip.khong_ro_dich ?? 0)}</span>
                      {' · '}
                      <span>ngoài 6 BCVH {formatInt(currentNgoaiBayChip.ngoai_pham_vi_tong ?? 0)}</span>
                      {' · '}
                      <span>thiếu giờ quét {formatInt(currentNgoaiBayChip.khong_co_gio_quet_den ?? 0)}</span>
                      {' · '}
                      <span>không xếp được chuyến {formatInt(currentNgoaiBayChip.khong_xep_duoc_chuyen_tong ?? 0)}</span>
                      {') '}
                      <span className="text-[11px] text-[#4A1D6E] font-medium underline ml-1">
                        {showNgoaiBayChipModal ? 'Thu gọn' : 'Xem giải thích'}
                      </span>
                    </button>

                    {/* Hộp giải thích chi tiết khi bấm vào dòng */}
                    {showNgoaiBayChipModal && (
                      <div className="mt-2 p-3.5 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs text-[#5A4A62] space-y-2">
                        <div className="flex items-center justify-between font-bold text-gray-800">
                          <span>Giải thích các nhóm bưu gửi không vào bảy trạng thái:</span>
                          <button
                            type="button"
                            onClick={() => setShowNgoaiBayChipModal(false)}
                            className="text-gray-500 hover:text-gray-800 underline font-normal cursor-pointer"
                          >
                            Đóng
                          </button>
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-gray-700">
                          <li>
                            <strong>Không rõ đích ({formatInt(currentNgoaiBayChip.khong_ro_dich ?? 0)}):</strong> Bưu gửi không xác định được bưu cục đến (mã xã phường không hợp lệ hoặc thiếu thông tin nơi nhận).
                          </li>
                          <li>
                            <strong>Ngoài 6 BCVH Huế ({formatInt(currentNgoaiBayChip.ngoai_pham_vi_tong ?? 0)}):</strong> Bưu gửi đi các tỉnh khác hoặc các điểm ngoài 6 BCVH nội tỉnh (Hệ 1 / 530900, bưu cục ngoài tỉnh, hoặc bưu cục KTT 530100).
                          </li>
                          <li>
                            <strong>Thiếu giờ quét túi đến ({formatInt(currentNgoaiBayChip.khong_co_gio_quet_den ?? 0)}):</strong> Bưu gửi chỉ có giờ xác nhận BD10 đến hoặc các mốc khác mà thiếu giờ quét túi đến tại KTT.
                          </li>
                          <li>
                            <strong>Không xếp được chuyến ({formatInt(currentNgoaiBayChip.khong_xep_duoc_chuyen_tong ?? 0)}):</strong> Bưu gửi đến nhưng không khớp với lịch chuyến xe nào đã cấu hình (ví dụ không có lịch xe cho tuyến đường thư đó).
                          </li>
                        </ul>
                        <div className="text-[11px] text-gray-500 italic pt-1 border-t border-[#E4D5AE]">
                          Đẳng thức: 7 trạng thái + hàng hoàn + số ở dòng này = Tất cả bưu gửi đến KTT.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Trạng thái tải */}
                {exportLoading && (
                  <div className="mb-3 space-y-2">
                    <div className="text-xs text-gray-700">
                      Đang tạo tệp Excel cho khoảng ngày {dateRange ? `${formatDdMmYyyy(dateRange.from)} – ${formatDdMmYyyy(dateRange.to)}` : ''}…
                    </div>
                    <div className="progress-soft w-full overflow-hidden">
                      <div className="progress-bar-soft w-full animate-pulse" />
                    </div>
                  </div>
                )}

                {/* Lỗi tải */}
                {exportError && (
                  <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 space-y-2 mb-3">
                    <div>
                      <strong>Không tải được.</strong> {exportError}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setExportError(null)}
                        className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-red-300 rounded text-red-700 text-xs font-semibold cursor-pointer"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadExcel}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold cursor-pointer"
                      >
                        Thử lại
                      </button>
                    </div>
                  </div>
                )}

                {/* Nút bấm tải */}
                <div>
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    disabled={exportLoading || !!validationError}
                    className={`btn-primary px-4 py-2.5 rounded-[8px] text-xs font-bold transition-colors inline-flex items-center gap-2 ${
                      exportLoading || validationError ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {exportLoading
                        ? 'Đang tạo…'
                        : (selectedCell
                          ? 'Tải xlsx'
                          : `Tải xlsx · ${formatInt(getExportCount(selectedExportStatus) ?? 0)} bưu gửi`)}
                    </span>
                  </button>
                  <div className="text-[11px] text-gray-500 mt-2">
                    Tên file: KTT_LuuThoat_{dateRange?.from}_{dateRange?.to}.xlsx. Quá 200.000 dòng thì hãy thu hẹp khoảng ngày hoặc chọn trạng thái.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. CÁC THẺ TỔNG SỐ LIỆU ────────────────────────────────────── */}
          {activeBlockData && (() => {
            const mauSo = activeBlockData.luu_thoat?.mau_so ?? 0;
            const luuThoatTuSo = activeBlockData.luu_thoat?.tu_so ?? 0;
            const rotLaiShbg = (activeBlockData.trang_thai?.t3?.shbg ?? 0) +
              (activeBlockData.trang_thai?.t4?.shbg ?? 0) +
              (activeBlockData.trang_thai?.t5?.shbg ?? 0);
            const tyLeRotLai = !hasNoData && mauSo > 0 ? rotLaiShbg / mauSo : null;
            const truotChuyenShbg = (activeBlockData.dung_chuyen?.truot_chuyen ?? 0) +
              (activeBlockData.dung_chuyen?.lo_chuyen ?? 0);
            const tyLeTruotChuyen = !hasNoData && mauSo > 0 ? truotChuyenShbg / mauSo : null;
            const hangHoanTong = activeHangHoan?.tong_shbg ?? 0;

            // Quy ước kg: Σ t1..t5.kg cho phần hàng đến tính chỉ tiêu
            const kgT1DenT5 = (activeBlockData.trang_thai?.t1?.kg ?? 0) +
              (activeBlockData.trang_thai?.t2?.kg ?? 0) +
              (activeBlockData.trang_thai?.t3?.kg ?? 0) +
              (activeBlockData.trang_thai?.t4?.kg ?? 0) +
              (activeBlockData.trang_thai?.t5?.kg ?? 0);
            const kgDiTrongNgay = (activeBlockData.trang_thai?.t1?.kg ?? 0) +
              (activeBlockData.trang_thai?.t2?.kg ?? 0);
            const kgRotLai = (activeBlockData.trang_thai?.t3?.kg ?? 0) +
              (activeBlockData.trang_thai?.t4?.kg ?? 0) +
              (activeBlockData.trang_thai?.t5?.kg ?? 0);
            const kgT3 = activeBlockData.trang_thai?.t3?.kg ?? 0;

            const todayVn = getTodayVnYmd();
            const isHomNay = dateRange.from === todayVn && dateRange.to === todayVn;
            const sectionTitle = isHomNay
              ? 'Hôm nay hàng đến lưu thoát được bao nhiêu, rớt lại bao nhiêu'
              : `Hàng đến từ ${formatDdMm(dateRange.from)} đến ${formatDdMm(dateRange.to)} lưu thoát được bao nhiêu, rớt lại bao nhiêu`;

            return (
              <div className="space-y-3">
                <div>
                  <h2 className="ktt-h2 text-[17px]">
                    {sectionTitle}
                  </h2>
                  <p className="text-xs text-gray-600 mt-1">
                    Đến bao nhiêu, đi được bao nhiêu, rớt lại bao nhiêu (đúng lịch hay trượt chuyến), đi đâu tỷ lệ nào, rớt lại của BCVH nào và nguồn nào.
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                  {/* Thẻ 1: Hàng đến tính chỉ tiêu */}
                  <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                        HÀNG ĐẾN TÍNH CHỈ TIÊU
                      </div>
                      <div className="hue-num-lg my-1.5 text-gray-900">
                        {hasNoData ? '—' : formatInt(mauSo)}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {hasNoData
                        ? 'bưu gửi'
                        : (activeHangHoan
                          ? `bưu gửi · ${formatKg(kgT1DenT5, { withUnit: true })} · chưa gồm ${formatInt(hangHoanTong)} hàng chuyển hoàn`
                          : `bưu gửi · ${formatKg(kgT1DenT5, { withUnit: true })}`)}
                    </div>
                  </div>

                  {/* Thẻ 2: Lưu thoát: đi trong ngày */}
                  <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                        LƯU THOÁT: ĐI TRONG NGÀY
                      </div>
                      <div className="hue-num-lg my-1.5 text-[#1F7A5C]">
                        {hasNoData ? '—' : formatInt(luuThoatTuSo)}
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-[#1F7A5C] tabular-nums">
                      {hasNoData ? '—' : `${formatPercent(activeBlockData.luu_thoat?.ty_le)} · ${formatKg(kgDiTrongNgay, { withUnit: true })}`}
                    </div>
                  </div>

                  {/* Thẻ 3: Rớt lại sang hôm sau */}
                  <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                        RỚT LẠI SANG HÔM SAU
                      </div>
                      <div className="hue-num-lg my-1.5 text-[#A87A12]">
                        {hasNoData ? '—' : formatInt(rotLaiShbg)}
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-[#A87A12] tabular-nums">
                      {hasNoData ? '—' : `${formatPercent(tyLeRotLai)} · ${formatKg(kgRotLai, { withUnit: true })}`}
                    </div>
                  </div>

                  {/* Thẻ 4: 3 · Đi hôm sau, đúng chuyến */}
                  <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                        3 · ĐI HÔM SAU, ĐÚNG CHUYẾN
                      </div>
                      <div className="hue-num-lg my-1.5 text-[#4A1D6E]">
                        {hasNoData ? '—' : formatInt(activeBlockData.trang_thai?.t3?.shbg ?? 0)}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {hasNoData ? 'đến sau chuyến cuối cùng' : `đến sau chuyến cuối cùng · ${formatKg(kgT3, { withUnit: true })}`}
                    </div>
                  </div>

                  {/* Thẻ 5: Trượt chuyến (cần xử lý) */}
                  <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                        TRƯỢT CHUYẾN (CẦN XỬ LÝ)
                      </div>
                      <div className="hue-num-lg my-1.5 text-[#B3202A]">
                        {hasNoData ? '—' : formatInt(truotChuyenShbg)}
                      </div>
                    </div>
                    <div className="text-[11px] font-semibold text-[#B3202A] tabular-nums">
                      {hasNoData ? '—' : `${formatPercent(tyLeTruotChuyen)} hàng đến`}
                    </div>
                  </div>

                  {/* Thẻ 6: Đạt chỉ tiêu 14 giờ hai mốc */}
                  <KttErrorBoundary>
                    {(() => {
                      const c14 = activeBlockData?.chi_tieu_14h;
                      const mocA = c14?.theo_moc?.xnd;
                      const mocB = c14?.theo_moc?.quet_tui_den;

                      return (
                        <div
                          id="ktt-kpi-card-14h"
                          className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[140px]"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                              ĐẠT CHỈ TIÊU 14 GIỜ
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium italic">trên số đo được</span>
                          </div>

                          {hasNoData || !c14 ? (
                            <div className="py-4 text-gray-400 italic text-xs text-center">—</div>
                          ) : (
                            <div className="space-y-2 my-auto">
                              {/* Dòng Mốc A */}
                              <div
                                className={`p-1.5 rounded-[8px] transition-colors cursor-help border ${
                                  mocChiTieu === 'xnd'
                                    ? 'bg-[#FAF5E8] border-[#E4D5AE]'
                                    : 'bg-gray-50/70 border-transparent hover:bg-gray-100/70'
                                }`}
                                title={`Mốc A: ${formatInt(mocA?.khong_do_duoc?.tong ?? 0)} không đo được (chưa đi: ${formatInt(mocA?.khong_do_duoc?.chua_di ?? 0)}, thiếu XNĐ: ${formatInt(mocA?.khong_do_duoc?.thieu_moc ?? 0)}, XNĐ sau giờ đi: ${formatInt(mocA?.khong_do_duoc?.moc_sau_gio_di ?? 0)})`}
                              >
                                <div className="flex items-center justify-between gap-1 leading-tight">
                                  <span className="text-[11px] font-bold text-gray-900 truncate">
                                    Mốc A (XNĐ → BD10 đi)
                                  </span>
                                  <span className="text-xs font-bold text-[#1F7A5C] tabular-nums shrink-0">
                                    {mocA?.do_duoc > 0 ? formatPercent(mocA.ty_le_dat_tren_do_duoc) : '—'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-600 tabular-nums mt-0.5 leading-snug">
                                  đo được <strong>{formatInt(mocA?.do_duoc ?? 0)}</strong>/{formatInt(mocA?.mau_so ?? 0)} · đạt {formatInt(mocA?.dat ?? 0)} · không đạt {formatInt(mocA?.khong_dat ?? 0)}
                                </div>
                              </div>

                              {/* Dòng Mốc B */}
                              <div
                                className={`p-1.5 rounded-[8px] transition-colors cursor-help border ${
                                  mocChiTieu === 'quet_tui_den'
                                    ? 'bg-[#FAF5E8] border-[#E4D5AE]'
                                    : 'bg-gray-50/70 border-transparent hover:bg-gray-100/70'
                                }`}
                                title={`Mốc B: ${formatInt(mocB?.khong_do_duoc?.tong ?? 0)} không đo được (chưa đi: ${formatInt(mocB?.khong_do_duoc?.chua_di ?? 0)}, thiếu giờ quét đến: ${formatInt(mocB?.khong_do_duoc?.thieu_moc ?? 0)}, quét đến sau giờ đi: ${formatInt(mocB?.khong_do_duoc?.moc_sau_gio_di ?? 0)})`}
                              >
                                <div className="flex items-center justify-between gap-1 leading-tight">
                                  <span className="text-[11px] font-bold text-gray-900 truncate">
                                    Mốc B (quét túi đến → BD10 đi)
                                  </span>
                                  <span className="text-xs font-bold text-[#1F7A5C] tabular-nums shrink-0">
                                    {mocB?.do_duoc > 0 ? formatPercent(mocB.ty_le_dat_tren_do_duoc) : '—'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-600 tabular-nums mt-0.5 leading-snug">
                                  đo được <strong>{formatInt(mocB?.do_duoc ?? 0)}</strong>/{formatInt(mocB?.mau_so ?? 0)} · đạt {formatInt(mocB?.dat ?? 0)} · không đạt {formatInt(mocB?.khong_dat ?? 0)}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="text-[10px] text-gray-400 pt-1 leading-tight border-t border-gray-100">
                            Di chuột vào mốc để xem chi tiết lý do không đo được
                          </div>
                        </div>
                      );
                    })()}
                  </KttErrorBoundary>
                </div>

                {/* Dòng chú thích khi có bưu gửi thiếu khối lượng */}
                {data.meta?.shbg_thieu_khoi_luong > 0 && (
                  <div className="text-[11px] text-gray-500 italic pt-0.5">
                    * {formatInt(data.meta.shbg_thieu_khoi_luong)} bưu gửi chưa có khối lượng, tổng kg là số tối thiểu
                  </div>
                )}

                {/* Khối «Theo nguồn hàng» (KTT-13a, KTT-14) */}
                {data.tong_cong?.theo_nguon_hang && (() => {
                  const tnh = data.tong_cong.theo_nguon_hang;
                  const kt = tnh.khai_thac;
                  const ct = tnh.chuyen_tiep;

                  const ktMauSo = kt?.tong?.luu_thoat?.mau_so ?? 0;
                  const ktTyLeLuu = !hasNoData && ktMauSo > 0 ? (kt?.tong?.luu_thoat?.ty_le ?? null) : null;
                  const ktC14 = kt?.tong?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                  const ktDoDuoc = ktC14?.do_duoc ?? 0;
                  const ktTyLe14 = !hasNoData && ktDoDuoc > 0 ? (ktC14?.ty_le_dat_tren_do_duoc ?? null) : null;

                  const ctMauSo = ct?.tong?.luu_thoat?.mau_so ?? 0;
                  const ctTyLeLuu = !hasNoData && ctMauSo > 0 ? (ct?.tong?.luu_thoat?.ty_le ?? null) : null;
                  const ctC14 = ct?.tong?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                  const ctDoDuoc = ctC14?.do_duoc ?? 0;
                  const ctTyLe14 = !hasNoData && ctDoDuoc > 0 ? (ctC14?.ty_le_dat_tren_do_duoc ?? null) : null;

                  return (
                    <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-3 mt-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Theo nguồn hàng
                        </div>
                        {selectedBcvh !== 'all' && (
                          <span className="text-[11px] text-gray-500 italic">
                            Số liệu nguồn hàng tính trên toàn KTT
                          </span>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="table-soft w-full min-w-[550px] text-xs text-left">
                          <thead>
                            <tr>
                              <th className="text-left font-semibold text-gray-600">NGUỒN HÀNG</th>
                              <th className="text-right font-semibold text-gray-600">BƯU GỬI TÍNH CHỈ TIÊU</th>
                              <th className="text-right font-semibold text-gray-600">ĐI TRONG NGÀY</th>
                              <th className="text-right font-semibold text-gray-600">ĐẠT 14 GIỜ</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="hover:bg-[#FFFBEF] transition-colors">
                              <td className="font-medium text-gray-900">
                                Hàng khai thác (KTT mở túi, chia lại)
                              </td>
                              <td className="text-right tabular-nums font-semibold text-gray-900">
                                {hasNoData ? '—' : formatInt(ktMauSo)}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                {hasNoData || ktTyLeLuu === null ? '—' : formatPercent(ktTyLeLuu)}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[#4A1D6E]">
                                {hasNoData || ktTyLe14 === null ? '—' : formatPercent(ktTyLe14)}
                              </td>
                            </tr>
                            <tr className="hover:bg-[#FFFBEF] transition-colors">
                              <td className="font-medium text-gray-900">
                                Hàng chuyển tiếp (đi nguyên túi)
                              </td>
                              <td className="text-right tabular-nums font-semibold text-gray-900">
                                {hasNoData ? '—' : formatInt(ctMauSo)}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                {hasNoData || ctTyLeLuu === null ? '—' : formatPercent(ctTyLeLuu)}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[#4A1D6E]">
                                {hasNoData || ctTyLe14 === null ? '—' : formatPercent(ctTyLe14)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="text-[11px] text-gray-500 leading-relaxed pt-0.5">
                        * Hàng chuyển tiếp: túi đến KTT rồi đi tiếp nguyên túi (hàng đi ngoài, túi chia sẵn), KTT không mở túi; vẫn tính chỉ tiêu nếu đích là 6 BCVH Huế.
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── 4. THANH NĂM TRẠNG THÁI + ĐANG CHỜ CHUYẾN ───────────────────── */}
          {activeBlockData && (() => {
            const mauSo = activeBlockData.luu_thoat?.mau_so ?? 0;
            const t1 = activeBlockData.trang_thai?.t1?.shbg ?? 0;
            const t2 = activeBlockData.trang_thai?.t2?.shbg ?? 0;
            const t3 = activeBlockData.trang_thai?.t3?.shbg ?? 0;
            const t4 = activeBlockData.trang_thai?.t4?.shbg ?? 0;
            const t5 = activeBlockData.trang_thai?.t5?.shbg ?? 0;
            const dangChoChuyen = activeBlockData.trang_thai?.dang_cho_chuyen?.shbg ?? 0;

            const p1 = !hasNoData && mauSo > 0 ? (t1 / mauSo) * 100 : 0;
            const p2 = !hasNoData && mauSo > 0 ? (t2 / mauSo) * 100 : 0;
            const p3 = !hasNoData && mauSo > 0 ? (t3 / mauSo) * 100 : 0;
            const p4 = !hasNoData && mauSo > 0 ? (t4 / mauSo) * 100 : 0;
            const p5 = !hasNoData && mauSo > 0 ? (t5 / mauSo) * 100 : 0;

            const luuThoatShbg = t1 + t2;
            const rotLaiShbg = t3 + t4 + t5;
            const tyLeLuuThoat = !hasNoData && mauSo > 0 ? luuThoatShbg / mauSo : null;
            const tyLeRotLai = !hasNoData && mauSo > 0 ? rotLaiShbg / mauSo : null;

            return (
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
                <div>
                  <h2 className="ktt-h2 text-[17px]">Tổng quan trong ngày</h2>
                  <div className="flex flex-wrap items-center justify-between text-xs text-gray-700 mt-2 font-medium">
                    <span>
                      Hàng đến tính chỉ tiêu: đi được bao nhiêu, rớt lại bao nhiêu
                    </span>
                    <span className="tabular-nums">
                      Lưu thoát: đi trong ngày · <strong>{hasNoData ? '—' : formatInt(luuThoatShbg)}</strong> ({hasNoData ? '—' : formatPercent(tyLeLuuThoat)}) &nbsp;—&nbsp; Rớt lại · <strong>{hasNoData ? '—' : formatInt(rotLaiShbg)}</strong> ({hasNoData ? '—' : formatPercent(tyLeRotLai)})
                    </span>
                  </div>
                </div>

                {/* Thanh 5 trạng thái xếp chồng */}
                <div className="w-full h-7 rounded-lg overflow-hidden flex bg-gray-100">
                  {p1 > 0 && (
                    <div
                      style={{ width: `${p1}%` }}
                      className="bg-[#1F7A5C] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden transition-all"
                      title={`1 · Đi trong ngày, đúng chuyến: ${formatInt(t1)} (${p1.toFixed(1)}%)`}
                    >
                      {p1 >= 4 ? `${Math.round(p1)}%` : ''}
                    </div>
                  )}
                  {p2 > 0 && (
                    <div
                      style={{ width: `${p2}%` }}
                      className="bg-[#7FBFA6] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden transition-all"
                      title={`2 · Đi trong ngày, trượt chuyến: ${formatInt(t2)} (${p2.toFixed(1)}%)`}
                    >
                      {p2 >= 4 ? `${Math.round(p2)}%` : ''}
                    </div>
                  )}
                  {p3 > 0 && (
                    <div
                      style={{ width: `${p3}%` }}
                      className="bg-[#B79BCB] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden transition-all"
                      title={`3 · Đi hôm sau, đúng chuyến: ${formatInt(t3)} (${p3.toFixed(1)}%)`}
                    >
                      {p3 >= 4 ? `${Math.round(p3)}%` : ''}
                    </div>
                  )}
                  {p4 > 0 && (
                    <div
                      style={{ width: `${p4}%` }}
                      className="bg-[#E0A82E] h-full flex items-center justify-center text-[11px] font-bold text-[#3B1450] tabular-nums px-1 overflow-hidden transition-all"
                      title={`4 · Đi hôm sau, trượt chuyến: ${formatInt(t4)} (${p4.toFixed(1)}%)`}
                    >
                      {p4 >= 4 ? `${Math.round(p4)}%` : ''}
                    </div>
                  )}
                  {p5 > 0 && (
                    <div
                      style={{ width: `${p5}%` }}
                      className="bg-[#B3202A] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden transition-all"
                      title={`5 · Từ 2 ngày hoặc chưa đi: ${formatInt(t5)} (${p5.toFixed(1)}%)`}
                    >
                      {p5 >= 4 ? `${Math.round(p5)}%` : ''}
                    </div>
                  )}
                </div>

                {/* 5 thẻ t1..t5 dưới thanh */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-4 border-t-[#1F7A5C] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">1 · Đi trong ngày, đúng chuyến</div>
                    <div className="text-base font-bold text-[#1F7A5C] mt-1 tabular-nums">
                      {hasNoData ? '—' : formatInt(t1)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-4 border-t-[#7FBFA6] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">2 · Đi trong ngày, trượt chuyến</div>
                    <div className="text-base font-bold text-[#7FBFA6] mt-1 tabular-nums">
                      {hasNoData ? '—' : formatInt(t2)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-4 border-t-[#B79BCB] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">3 · Đi hôm sau, đúng chuyến</div>
                    <div className="text-base font-bold text-[#B79BCB] mt-1 tabular-nums">
                      {hasNoData ? '—' : formatInt(t3)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-4 border-t-[#E0A82E] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">4 · Đi hôm sau, trượt chuyến</div>
                    <div className="text-base font-bold text-[#E0A82E] mt-1 tabular-nums">
                      {hasNoData ? '—' : formatInt(t4)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-4 border-t-[#B3202A] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">5 · Từ 2 ngày hoặc chưa đi</div>
                    <div className="text-base font-bold text-[#B3202A] mt-1 tabular-nums">
                      {hasNoData ? '—' : formatInt(t5)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                    </div>
                  </div>
                </div>

                {/* Dòng chú thích màu + Đang chờ chuyến */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-gray-600">
                  <div>
                    Xanh: đi trong ngày. Tím: đi hôm sau đúng chuyến. Vàng, đỏ: trượt chuyến, cần xử lý.
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-[#EFE6F5] text-[#4A1D6E] border border-[#D8BDEB]">
                      Đang chờ chuyến: {hasNoData ? '—' : `${formatInt(dangChoChuyen)} bưu gửi`}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      chưa tới giờ xuất phát, không tính vào tỷ lệ.
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── 5. KHỐI HÀNG HOÀN TỔ KHHH (531120) ─────────────────────────── */}
          {selectedBcvh !== 'all' && selectedBcvh !== '533140' ? (
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none">
              <h2 className="ktt-h2 text-[17px] mb-1">
                Hàng chuyển hoàn của Tổ KHHH (531120)
              </h2>
              <p className="text-xs text-gray-500 italic">
                Chỉ áp dụng cho Thuận Hóa
              </p>
            </div>
          ) : (
            activeHangHoan && (
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
                <div>
                  <h2 className="ktt-h2 text-[17px]">
                    Hàng chuyển hoàn của Tổ KHHH (531120): hiện riêng, không tính chỉ tiêu 14 giờ
                  </h2>
                  <p className="text-xs text-gray-600 mt-1">
                    Bưu gửi 531120 đã chấp nhận, bị chuyển hoàn, về BCVH Thuận Hóa để phát hoàn. Hiện riêng để nhìn sản lượng và hiện trạng; không cộng vào các con số và tỷ lệ của trang.
                  </p>
                </div>

                {/* 4 thẻ nhỏ hàng hoàn */}
                {(() => {
                  const hhTong = activeHangHoan.tong_shbg ?? 0;
                  const hhT1 = activeHangHoan.trang_thai?.t1?.shbg ?? 0;
                  const hhT2 = activeHangHoan.trang_thai?.t2?.shbg ?? 0;
                  const hhT3 = activeHangHoan.trang_thai?.t3?.shbg ?? 0;
                  const hhT4 = activeHangHoan.trang_thai?.t4?.shbg ?? 0;
                  const hhT5 = activeHangHoan.trang_thai?.t5?.shbg ?? 0;
                  const hhDangCho = activeHangHoan.trang_thai?.dang_cho_chuyen?.shbg ?? 0;

                  const hhKg = (activeHangHoan.trang_thai?.t1?.kg ?? 0) +
                    (activeHangHoan.trang_thai?.t2?.kg ?? 0) +
                    (activeHangHoan.trang_thai?.t3?.kg ?? 0) +
                    (activeHangHoan.trang_thai?.t4?.kg ?? 0) +
                    (activeHangHoan.trang_thai?.t5?.kg ?? 0);
                  const hhDiTrongNgayKg = (activeHangHoan.trang_thai?.t1?.kg ?? 0) +
                    (activeHangHoan.trang_thai?.t2?.kg ?? 0);
                  const hhT3Kg = activeHangHoan.trang_thai?.t3?.kg ?? 0;

                  const hhLuuThoat = hhT1 + hhT2;
                  const hhRotLai = hhT3 + hhT4 + hhT5;
                  const hhTruot = (activeHangHoan.dung_chuyen?.truot_chuyen ?? 0) +
                    (activeHangHoan.dung_chuyen?.lo_chuyen ?? 0);
                  const hhMauSo = activeHangHoan.luu_thoat?.mau_so ?? (hhLuuThoat + hhRotLai);
                  const hhTyLeLuu = !hasNoData && hhMauSo > 0 ? hhLuuThoat / hhMauSo : null;
                  const hhTyLeRot = !hasNoData && hhMauSo > 0 ? hhRotLai / hhMauSo : null;
                  const hhTyLeTruot = !hasNoData && hhMauSo > 0 ? hhTruot / hhMauSo : null;

                  const hp1 = !hasNoData && hhMauSo > 0 ? (hhT1 / hhMauSo) * 100 : 0;
                  const hp2 = !hasNoData && hhMauSo > 0 ? (hhT2 / hhMauSo) * 100 : 0;
                  const hp3 = !hasNoData && hhMauSo > 0 ? (hhT3 / hhMauSo) * 100 : 0;
                  const hp4 = !hasNoData && hhMauSo > 0 ? (hhT4 / hhMauSo) * 100 : 0;
                  const hp5 = !hasNoData && hhMauSo > 0 ? (hhT5 / hhMauSo) * 100 : 0;

                  return (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                        <div className="p-3.5 bg-gray-50 rounded-[10px] border border-gray-200">
                          <div className="text-[11px] font-bold text-gray-600 uppercase">HÀNG HOÀN ĐẾN TRONG KHOẢNG</div>
                          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{hasNoData ? '—' : formatInt(hhTong)}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {hasNoData ? 'bưu gửi · đều về Thuận Hóa' : `bưu gửi · ${formatKg(hhKg, { withUnit: true })} · đều về Thuận Hóa`}
                          </div>
                        </div>
                        <div className="p-3.5 bg-gray-50 rounded-[10px] border border-gray-200">
                          <div className="text-[11px] font-bold text-gray-600 uppercase">ĐI TRONG NGÀY</div>
                          <div className="text-xl font-bold text-[#1F7A5C] mt-1 tabular-nums">{hasNoData ? '—' : formatInt(hhLuuThoat)}</div>
                          <div className="text-[11px] font-semibold text-[#1F7A5C] mt-0.5">
                            {hasNoData ? '—' : `${formatPercent(hhTyLeLuu)} · ${formatKg(hhDiTrongNgayKg, { withUnit: true })}`}
                          </div>
                        </div>
                        <div className="p-3.5 bg-gray-50 rounded-[10px] border border-gray-200">
                          <div className="text-[11px] font-bold text-gray-600 uppercase">3 · ĐI HÔM SAU, ĐÚNG CHUYẾN</div>
                          <div className="text-xl font-bold text-[#4A1D6E] mt-1 tabular-nums">{hasNoData ? '—' : formatInt(hhT3)}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {hasNoData ? 'đến sau mốc 21:00 của chuyến cuối 22:00' : `đến sau mốc 21:00 của chuyến cuối 22:00 · ${formatKg(hhT3Kg, { withUnit: true })}`}
                          </div>
                        </div>
                        <div className="p-3.5 bg-gray-50 rounded-[10px] border border-gray-200">
                          <div className="text-[11px] font-bold text-gray-600 uppercase">TRƯỢT CHUYẾN, TỪ 2 NGÀY / CHƯA ĐI</div>
                          <div className="text-xl font-bold text-[#B3202A] mt-1 tabular-nums">{hasNoData ? '—' : formatInt(hhTruot)}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{hasNoData ? '—' : `${formatPercent(hhTyLeTruot)} · chỉ để theo dõi`}</div>
                        </div>
                      </div>

                      {/* Thanh tỷ lệ hàng hoàn */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-xs text-gray-600 tabular-nums">
                          <span>Lưu thoát: đi trong ngày · <strong>{hasNoData ? '—' : formatInt(hhLuuThoat)}</strong> ({hasNoData ? '—' : formatPercent(hhTyLeLuu)})</span>
                          <span>Rớt lại · <strong>{hasNoData ? '—' : formatInt(hhRotLai)}</strong> ({hasNoData ? '—' : formatPercent(hhTyLeRot)})</span>
                        </div>
                        <div className="w-full h-5 rounded-md overflow-hidden flex bg-gray-100">
                          {hp1 > 0 && <div style={{ width: `${hp1}%` }} className="bg-[#1F7A5C] h-full" title={`1 · Đúng chuyến: ${hhT1}`} />}
                          {hp2 > 0 && <div style={{ width: `${hp2}%` }} className="bg-[#7FBFA6] h-full" title={`2 · Trượt chuyến: ${hhT2}`} />}
                          {hp3 > 0 && <div style={{ width: `${hp3}%` }} className="bg-[#B79BCB] h-full" title={`3 · Đi hôm sau đúng: ${hhT3}`} />}
                          {hp4 > 0 && <div style={{ width: `${hp4}%` }} className="bg-[#E0A82E] h-full" title={`4 · Đi hôm sau trượt: ${hhT4}`} />}
                          {hp5 > 0 && <div style={{ width: `${hp5}%` }} className="bg-[#B3202A] h-full" title={`5 · Từ 2 ngày: ${hhT5}`} />}
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-gray-600 tabular-nums pt-1">
                          <span>1 · Đi trong ngày đúng: <strong>{hasNoData ? '—' : formatInt(hhT1)}</strong></span>
                          <span>2 · Đi trong ngày trượt: <strong>{hasNoData ? '—' : formatInt(hhT2)}</strong></span>
                          <span>3 · Đi hôm sau đúng: <strong>{hasNoData ? '—' : formatInt(hhT3)}</strong></span>
                          <span>4 · Đi hôm sau trượt: <strong>{hasNoData ? '—' : formatInt(hhT4)}</strong></span>
                          <span>5 · Từ 2 ngày hoặc chưa đi: <strong>{hasNoData ? '—' : formatInt(hhT5)}</strong></span>
                          {hhDangCho > 0 && (
                            <span className="px-2 py-0.5 bg-[#EFE6F5] text-[#4A1D6E] rounded">
                              Đang chờ: <strong>{hasNoData ? '—' : formatInt(hhDangCho)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )
          )}

          {/* ── 6. THEO BCVH ĐÍCH & THEO NGUỒN / ĐƯỜNG THƯ ĐẾN ─────────────── */}
          {data.tong_cong && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              {/* Cột trái: Theo BCVH đích (6 thẻ + Bảng tỷ trọng) */}
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-5">
                <div>
                  <h2 className="ktt-h2 text-[17px]">Theo BCVH đích</h2>
                  <p className="text-xs text-gray-600 mt-1">
                    Sản lượng, tỷ lệ lưu thoát và tỷ trọng phân bổ trên 6 Bưu cục Vận hành Huế.
                  </p>
                </div>

                {/* 6 thẻ BCVH */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {BCVH_LIST.map((b) => {
                    const bBlock = data.tong_cong.theo_bcvh?.[b.ma];
                    const bMauSo = bBlock?.luu_thoat?.mau_so ?? 0;
                    const bDi = bBlock?.luu_thoat?.tu_so ?? 0;
                    const bRot = (bBlock?.trang_thai?.t3?.shbg ?? 0) +
                      (bBlock?.trang_thai?.t4?.shbg ?? 0) +
                      (bBlock?.trang_thai?.t5?.shbg ?? 0);
                    const bTruot = (bBlock?.dung_chuyen?.truot_chuyen ?? 0) +
                      (bBlock?.dung_chuyen?.lo_chuyen ?? 0);
                    const bTyLeRot = !hasNoData && bMauSo > 0 ? bRot / bMauSo : null;
                    const bTyLeTruot = !hasNoData && bMauSo > 0 ? bTruot / bMauSo : null;
                    const bTyLeLuu = !hasNoData ? bBlock?.luu_thoat?.ty_le : null;

                    // kg của bcvh (Σ t1..t5.kg)
                    const bKg = (bBlock?.trang_thai?.t1?.kg ?? 0) +
                      (bBlock?.trang_thai?.t2?.kg ?? 0) +
                      (bBlock?.trang_thai?.t3?.kg ?? 0) +
                      (bBlock?.trang_thai?.t4?.kg ?? 0) +
                      (bBlock?.trang_thai?.t5?.kg ?? 0);

                    return (
                      <div
                        key={b.ma}
                        className={`p-4 rounded-[12px] border transition-colors ${
                          selectedBcvh === b.ma
                            ? 'border-[#4A1D6E] bg-[#FAF5E8]'
                            : 'border-gray-200 bg-white hover:bg-[#FFFBEF]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-gray-900">{b.ten}</span>
                          <span className="text-xs font-bold text-gray-900 tabular-nums">
                            {hasNoData ? '—' : `${formatInt(bMauSo)} bưu gửi`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1.5 tabular-nums">
                          <span className="font-semibold text-gray-900">{hasNoData ? '—' : formatInt(bMauSo)}</span>
                          {' · '}
                          <span>{hasNoData ? '—' : formatKg(bKg, { withUnit: true })}</span>
                          {' · rớt '}
                          <strong className="text-[#A87A12]">{hasNoData ? '—' : formatPercent(bTyLeRot)}</strong>
                          {' · trượt '}
                          <strong className="text-[#B3202A]">{hasNoData ? '—' : formatPercent(bTyLeTruot)}</strong>
                        </div>
                        {/* Thanh lưu thoát */}
                        <div className="w-full h-2 rounded-full overflow-hidden bg-gray-200 mt-3 flex">
                          <div
                            style={{ width: `${(bTyLeLuu ?? 0) * 100}%` }}
                            className="bg-[#1F7A5C] h-full"
                            title={`Lưu thoát: ${formatPercent(bTyLeLuu)}`}
                          />
                          <div
                            style={{ width: `${(bTyLeRot ?? 0) * 100}%` }}
                            className="bg-[#E0A82E] h-full"
                            title={`Rớt lại: ${formatPercent(bTyLeRot)}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bảng tỷ trọng từng BCVH */}
                <div>
                  <div className="mb-2">
                    <div className="text-sm font-bold text-gray-800">Tỷ trọng từng BCVH</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-soft w-full min-w-[500px] text-left">
                      <thead>
                        <tr>
                          <th className="text-left">BCVH</th>
                          <th className="text-right">
                            TỶ TRỌNG HÀNG ĐI
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              trong {formatInt(data.tong_cong.luu_thoat?.tu_so ?? 0)} hàng đi
                            </div>
                          </th>
                          <th className="text-right">
                            TỶ TRỌNG RỚT LẠI
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              {(() => {
                                const tRot = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
                                  (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
                                  (data.tong_cong.trang_thai?.t5?.shbg ?? 0);
                                return `trong ${formatInt(tRot)} hàng rớt`;
                              })()}
                            </div>
                          </th>
                          <th className="text-right">
                            RỚT LẠI BCVH
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              trong hàng đến
                            </div>
                          </th>
                          <th className="text-right">
                            ĐẠT 14 GIỜ (TRÊN SỐ ĐO ĐƯỢC)
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              trong hàng đến của BCVH này
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const tongDi = data.tong_cong.luu_thoat?.tu_so ?? 0;
                          const tongRot = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
                            (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
                            (data.tong_cong.trang_thai?.t5?.shbg ?? 0);

                          return BCVH_LIST.map((b) => {
                            const bBlock = data.tong_cong.theo_bcvh?.[b.ma];
                            const bMauSo = bBlock?.luu_thoat?.mau_so ?? 0;
                            const bDi = bBlock?.luu_thoat?.tu_so ?? 0;
                            const bRot = (bBlock?.trang_thai?.t3?.shbg ?? 0) +
                              (bBlock?.trang_thai?.t4?.shbg ?? 0) +
                              (bBlock?.trang_thai?.t5?.shbg ?? 0);

                            const tyTrongDi = tongDi > 0 ? bDi / tongDi : null;
                            const tyTrongRot = tongRot > 0 ? bRot / tongRot : null;
                            const tyLeRotChinh = bMauSo > 0 ? bRot / bMauSo : null;
                            const bC14 = bBlock?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                            const doDuoc = bC14?.do_duoc ?? 0;
                            const mauSo14 = bC14?.mau_so ?? 0;
                            const tyLeDat14 = doDuoc > 0 ? bC14.ty_le_dat_tren_do_duoc : null;
                            const bTooltip = `Đo được ${formatInt(doDuoc)}/${formatInt(mauSo14)} · đạt ${formatInt(bC14?.dat ?? 0)} · không đạt ${formatInt(bC14?.khong_dat ?? 0)}`;

                            return (
                              <tr key={b.ma} className="hover:bg-[#FFFBEF] transition-colors">
                                <td className="font-semibold text-gray-900 whitespace-nowrap">
                                  {b.ten}
                                </td>
                                <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                  {formatPercent(tyTrongDi)}
                                </td>
                                <td className="text-right tabular-nums font-semibold text-[#A87A12]">
                                  {formatPercent(tyTrongRot)}
                                </td>
                                <td className="text-right tabular-nums font-medium text-gray-800">
                                  {formatPercent(tyLeRotChinh)}
                                </td>
                                <td
                                  className="text-right tabular-nums font-medium text-[#4A1D6E] cursor-help"
                                  title={bTooltip}
                                >
                                  {tyLeDat14 !== null ? formatPercent(tyLeDat14) : '—'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-2">
                    Hai cột «Tỷ trọng» cộng 100% theo cột. Hai cột «trong hàng đến của BCVH này» là tỷ lệ riêng của từng BCVH.
                  </div>
                </div>
              </div>

              {/* Cột phải: Theo nguồn / đường thư đến (thẻ nguồn + Chuyển hoàn + Bảng tỷ trọng) */}
              <KttTheoNguon
                data={data}
                selectedBcvh={selectedBcvh}
                activeHangHoan={activeHangHoan}
                mocChiTieu={mocChiTieu}
              />
            </div>
          )}

          {/* ── 7. BẢN ĐỒ NHIỆT: NGUỒN / ĐƯỜNG THƯ × BCVH ĐÍCH ──────────────── */}
          <KttBanDoNhiet
            data={data}
            selectedBcvh={selectedBcvh}
            selectedCell={selectedCell}
            onSelectCell={(cell) => {
              if (
                selectedCell?.nguon === cell.nguon &&
                selectedCell?.ma_bcvh === cell.ma_bcvh &&
                selectedCell?.loai === cell.loai
              ) {
                setSelectedCell(null);
              } else {
                setSelectedCell(cell);
              }
            }}
            onExportCell={async (cell) => {
              if (!dateRange) return;
              setExportLoading(true);
              try {
                await downloadKttLuuThoat({
                  tu: dateRange.from,
                  den: dateRange.to,
                  trang_thai: cell?.loai || 'ro_lai',
                  ma_bcvh: cell?.ma_bcvh || (selectedBcvh !== 'all' ? selectedBcvh : undefined),
                  nguon: cell?.nguon || undefined,
                });
              } finally {
                setExportLoading(false);
              }
            }}
            exportLoading={exportLoading}
          />

          {/* ── 8. DANH SÁCH CHI TIẾT THEO TRẠNG THÁI ───────────────────────── */}
          <KttChiTiet
            dateRange={dateRange}
            selectedBcvh={selectedBcvh}
            mocChiTieu={mocChiTieu}
            filterCell={selectedCell}
            onClearFilterCell={() => setSelectedCell(null)}
          />

          {/* ── 7. BẢNG «MỐC CHUYẾN THEO BCVH» ─────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="ktt-h2 text-[17px]">Mốc chuyến theo BCVH</h2>
                {metaError && (
                  <span className="text-xs text-red-600 font-semibold italic">
                    (Không tải được lịch chuyến)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                * = chạy 6 ngày/tuần, nghỉ Chủ nhật (theo cấu hình lịch chuyến). Hàng đến vào Chủ nhật hoặc sau chuyến cuối được tính vào chuyến đầu tiên liền kề có xe đi.
              </p>
              {metaError && (
                <p className="text-xs text-red-500 mt-1 italic">
                  Không tải được lịch chuyến
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="table-soft w-full min-w-[700px] text-left">
                <thead>
                  <tr>
                    <th className="text-left">BCVH</th>
                    <th className="text-left">
                      GIỜ XUẤT PHÁT (LỊCH C2)
                      <div className="text-[10px] font-normal normal-case text-gray-500">
                        mốc hàng phải đi
                      </div>
                    </th>
                    <th className="text-left">
                      HÀNG ĐẾN MUỘN NHẤT ĐỂ KỊP CHUYẾN
                      <div className="text-[10px] font-normal normal-case text-gray-500">
                        {metaError ? '—' : `− ${meta?.han_den_truoc_chuyen_phut ?? 60} phút khai thác`}
                      </div>
                    </th>
                    <th className="text-left">CHỦ NHẬT</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedLichChuyen.map((item) => (
                    <tr key={item.ma} className="hover:bg-[#FFFBEF] transition-colors">
                      <td className="font-semibold text-gray-900 whitespace-nowrap">
                        {item.ten}
                      </td>
                      <td className="tabular-nums font-medium text-gray-800">
                        {metaError ? '—' : item.mocXuatPhat}
                      </td>
                      <td className="tabular-nums font-medium text-gray-600">
                        {metaError ? '—' : item.mocHanDen}
                      </td>
                      <td className="text-xs text-gray-600">
                        {metaError ? '—' : item.chuNhat}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
