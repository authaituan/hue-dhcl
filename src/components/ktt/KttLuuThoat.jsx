import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import QuyThoiGianDateRangePicker from '../quythoigian/QuyThoiGianDateRangePicker';
import {
  getTodayVnYmd,
  countDaysInclusive,
  formatInt,
  formatPercent,
  formatDdMmYyyy,
  formatDdMm,
  formatDateTime,
} from '../quythoigian/quyThoiGianFormatters';
import { formatKg, getQuickDateRange } from './kttFormatters';
import { fetchKttMeta, fetchKttLuuThoat, downloadKttLuuThoat } from './kttApi';
import KttTheoNguon from './KttTheoNguon';
import KttBanDoNhiet from './KttBanDoNhiet';
import KttChiTiet from './KttChiTiet';
import KttErrorBoundary from './KttErrorBoundary';
import KttTooltip from './KttTooltip';
import KttGioDenTrongNgay from './KttGioDenTrongNgay';
import KttCoTinhChiTieu from './KttCoTinhChiTieu';

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
  { key: 'hang_hoan', label: 'Hàng chuyển hoàn' },
];

export default function KttLuuThoat({ authUser }) {
  // Bộ lọc chung cả 3 cách xem: khoảng ngày và BCVH đích
  const [dateRange, setDateRange] = useState(null);
  const [selectedBcvh, setSelectedBcvh] = useState('all');

  // Công tắc «Xem theo»: 'luu_thoat' (mặc định: Lưu thoát) | 'chi_tieu' | 'gio_den'
  const [xemTheo, setXemTheo] = useState('luu_thoat');

  // Bộ lọc riêng của cách xem «Lưu thoát»
  const [mocChiTieu, setMocChiTieu] = useState('xnd');
  const [validationError, setValidationError] = useState(null);

  // Bộ lọc dùng chung giữa hai cách xem MỚI («Có tính chỉ tiêu» và «Chỉ xem giờ đến trong ngày»)
  const [sharedUnit, setSharedUnit] = useState('shbg');
  const [sharedLoaiNgay, setSharedLoaiNgay] = useState('thuong');
  const [sharedMoc, setSharedMoc] = useState(null); // null -> 'A' khi vào chi_tieu đầu tiên, 'B' khi vào gio_den đầu tiên; sau đó giữ chung
  const [sharedSelectedDuongThu, setSharedSelectedDuongThu] = useState([]);

  // Dữ liệu từ API meta và màn cũ
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Xuất Excel (Sheet 7 của màn cũ)
  const [selectedExportStatus, setSelectedExportStatus] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Hộp giải thích nhóm ngoài 7 trạng thái, danh sách chi tiết thu gọn, cách tính thu gọn
  const [showNgoaiBayChipModal, setShowNgoaiBayChipModal] = useState(false);
  const [showChiTiet, setShowChiTiet] = useState(false);
  const [showCachTinh, setShowCachTinh] = useState(false);

  // Ô bảng nguồn × BCVH đang chọn (lọc danh sách chi tiết + xuất)
  const [selectedCell, setSelectedCell] = useState(null);

  // Reset selectedCell khi đổi BCVH hoặc đổi khoảng ngày ở đầu trang
  useEffect(() => {
    setSelectedCell(null);
  }, [selectedBcvh, dateRange]);

  // Ref chống stale response khi đổi khoảng ngày nhanh
  const reqIdRef = useRef(0);

  // 1. Tải meta một lần khi vào trang; xác định khoảng ngày mặc định bằng hàm getQuickDateRange dùng chung
  useEffect(() => {
    let active = true;
    setMetaLoading(true);
    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setMeta(res.data);
          setMetaError(null);
          setDateRange(getQuickDateRange(7, res.data));
        } else {
          setMetaError(res.error || 'Không tải được lịch chuyến');
          setDateRange(getQuickDateRange(7, null));
        }
      })
      .catch(() => {
        if (!active) return;
        setMetaError('Không tải được lịch chuyến');
        setDateRange(getQuickDateRange(7, null));
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

  // 3. Tải dữ liệu lưu thoát cho cách xem «Lưu thoát» (chỉ gọi khi đang ở cách xem này)
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
    if (xemTheo === 'luu_thoat' && dateRange?.from && dateRange?.to) {
      loadData();
    }
  }, [xemTheo, dateRange, mocChiTieu, loadData]);

  // Chuyển nút «Xem theo» (giữ mặc định mốc theo cách xem khi mở lần đầu, sau đó giữ chung giữa 2 cách xem mới)
  const handleXemTheoChange = (nextView) => {
    if (nextView === 'chi_tieu' && sharedMoc === null) {
      setSharedMoc('A');
    } else if (nextView === 'gio_den' && sharedMoc === null) {
      setSharedMoc('B');
    }
    setXemTheo(nextView);
  };

  // Xử lý đổi khoảng ngày
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // Đổi khoảng ngày nhanh theo số ngày (7 ngày / 30 ngày) dùng cùng hàm getQuickDateRange
  const handleQuickRangeChange = (days) => {
    setDateRange(getQuickDateRange(days, meta));
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
    if (selectedBcvh === 'all') return data.tong_cong.hang_hoan;
    return data.tong_cong.theo_bcvh?.[selectedBcvh]?.hang_hoan || null;
  }, [data, selectedBcvh]);

  // Số lượng cho từng trạng thái xuất (phản ánh đúng bộ lọc BCVH đang chọn)
  const getExportCount = (key) => {
    if (!data?.tong_cong) return null;
    if (selectedCell) return null; // Đang lọc theo ô bảng nguồn × BCVH thì bỏ đếm chung
    const targetBlock = selectedBcvh === 'all'
      ? data.tong_cong
      : data.tong_cong.theo_bcvh?.[selectedBcvh];
    if (!targetBlock) return 0;
    if (key === '') return targetBlock.tong_shbg_ngay ?? 0;
    if (key === 'hang_hoan') {
      return (selectedBcvh === 'all'
        ? data.tong_cong.hang_hoan?.tong_shbg
        : data.tong_cong.theo_bcvh?.[selectedBcvh]?.hang_hoan?.tong_shbg) ?? 0;
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

  const nguonXuatLuc = (xemTheo === 'luu_thoat' ? data?.meta?.nguon_xuat_luc_moi_nhat : null) || meta?.nguon_xuat_luc_moi_nhat;
  const hangHoanChuaNap = (xemTheo === 'luu_thoat' ? data?.meta?.hang_hoan_chua_nap : undefined) ?? meta?.hang_hoan_chua_nap;
  const hangHoanNguonXuatLuc = (xemTheo === 'luu_thoat' ? data?.meta?.hang_hoan_nguon_xuat_luc : null) || meta?.hang_hoan_nguon_xuat_luc;
  const isChuaCoDuLieu = data && (data.ly_do === 'CHUA_CO_DU_LIEU' || data.tong_cong === null);
  const isKhoangKhongCoHang = data && !isChuaCoDuLieu && !data.co_du_lieu;
  const hasNoData = !data?.co_du_lieu;

  return (
    <div className="p-6 space-y-5">
      {/* ── 1. TIÊU ĐỀ & BỘ LỌC ĐẦU TRANG ─────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hue-h1">Lưu thoát trong ngày</h1>
            {nguonXuatLuc && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A5C]" />
                Dữ liệu đến lúc {formatDateTime(String(nguonXuatLuc).slice(0, 16))}
              </span>
            )}
            {hangHoanChuaNap ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Chưa nạp danh sách hàng hoàn; số hoàn = 0 chưa đúng
              </span>
            ) : hangHoanNguonXuatLuc ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A5C]" />
                Danh sách hoàn cập nhật lúc {formatDateTime(String(hangHoanNguonXuatLuc).slice(0, 16))}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Trung tâm Khai thác · 530100 · Hàng tại KTT
          </p>
        </div>

        {/* Hàng bộ lọc: Xem theo (3 nút), Bộ lọc mốc (chỉ màn cũ), BCVH & Khoảng ngày */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Công tắc «Xem theo» (3 nút theo phương án A — 3.3) */}
          <div className="flex flex-wrap items-center bg-white px-2 py-1 rounded-[10px] border border-[#D9CBA8] shadow-none text-xs gap-1">
            <span className="font-semibold text-gray-600 pl-1 mr-1 whitespace-nowrap">Xem theo:</span>
            <button
              type="button"
              id="ktt-xem-theo-luu-thoat-btn"
              onClick={() => handleXemTheoChange('luu_thoat')}
              className={`px-2.5 py-1 rounded-[6px] font-bold transition-all cursor-pointer ${
                xemTheo === 'luu_thoat'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-[#FAF5E8]'
              }`}
            >
              Lưu thoát
            </button>
            <button
              type="button"
              id="ktt-xem-theo-chi-tieu-btn"
              onClick={() => handleXemTheoChange('chi_tieu')}
              className={`px-2.5 py-1 rounded-[6px] font-bold transition-all cursor-pointer ${
                xemTheo === 'chi_tieu'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-[#FAF5E8]'
              }`}
            >
              Có tính chỉ tiêu (xe cấp 2)
            </button>
            <button
              type="button"
              id="ktt-xem-theo-gio-den-btn"
              onClick={() => handleXemTheoChange('gio_den')}
              className={`px-2.5 py-1 rounded-[6px] font-bold transition-all cursor-pointer ${
                xemTheo === 'gio_den'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-[#FAF5E8]'
              }`}
            >
              Chỉ xem giờ đến trong ngày (không tính chỉ tiêu)
            </button>
          </div>

          {/* Bộ chọn mốc chỉ tiêu 14 giờ của màn cũ (C1) — giữ bộ lọc riêng, không trùng với thanh lọc của 2 màn mới */}
          {xemTheo === 'luu_thoat' && (
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
                title="Giờ xác nhận BD10 đến (ConfirmDate) → Giờ lập BD10 đi"
              >
                Giờ xác nhận BD10 đến (chính thức)
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
                title="Giờ quét túi đến KTT → Giờ lập BD10 đi"
              >
                Giờ quét túi đến
              </button>
            </div>
          )}

          {/* Dropdown BCVH (chung cả 3 cách xem) */}
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

          {/* Bộ chọn khoảng ngày tái dùng (chung cả 3 cách xem) */}
          <QuyThoiGianDateRangePicker
            dateRange={dateRange || { from: '', to: '' }}
            onChangeDateRange={handleDateRangeChange}
            idPrefix="ktt-luu-thoat"
          />
        </div>
      </div>

      {/* ── CÁCH XEM 1: LƯU THOÁT ──────────────────────────────────────────── */}
      {xemTheo === 'luu_thoat' && (
        <div className="space-y-4">
          {/* Dòng ghi chú định hướng */}
          <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] px-3.5 py-1.5 text-xs text-[#5A4A62]">
            Trang này dùng để điều hành từng ngày · tối đa 31 ngày theo bộ chọn ngày của hệ thống.
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
              {/* ── 2. KẾT QUẢ ─────────────────────────────────────────────────── */}
              {activeBlockData && (() => {
                const mauSo = activeBlockData.luu_thoat?.mau_so ?? 0;
                const luuThoatTuSo = activeBlockData.luu_thoat?.tu_so ?? 0;
                const t1 = activeBlockData.trang_thai?.t1?.shbg ?? 0;
                const t2 = activeBlockData.trang_thai?.t2?.shbg ?? 0;
                const t3 = activeBlockData.trang_thai?.t3?.shbg ?? 0;
                const t4 = activeBlockData.trang_thai?.t4?.shbg ?? 0;
                const t5 = activeBlockData.trang_thai?.t5?.shbg ?? 0;
                const dangChoChuyen = activeBlockData.trang_thai?.dang_cho_chuyen?.shbg ?? 0;

                const rotLaiShbg = t3 + t4 + t5;
                const tyLeRotLai = !hasNoData && mauSo > 0 ? rotLaiShbg / mauSo : null;
                const truotChuyenShbg = (activeBlockData.dung_chuyen?.truot_chuyen ?? 0) +
                  (activeBlockData.dung_chuyen?.lo_chuyen ?? 0);
                const tyLeTruotChuyen = !hasNoData && mauSo > 0 ? truotChuyenShbg / mauSo : null;
                const diTuD2Dung = activeBlockData.chi_tiet_trang_thai_5?.di_tu_d2_dung_chuyen ?? 0;
                const hangHoanTong = activeHangHoan?.tong_shbg ?? 0;
                const tongTatCa = activeBlockData.tong_shbg_ngay ?? 0;

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

                const p1 = !hasNoData && mauSo > 0 ? (t1 / mauSo) * 100 : 0;
                const p2 = !hasNoData && mauSo > 0 ? (t2 / mauSo) * 100 : 0;
                const p3 = !hasNoData && mauSo > 0 ? (t3 / mauSo) * 100 : 0;
                const p4 = !hasNoData && mauSo > 0 ? (t4 / mauSo) * 100 : 0;
                const p5 = !hasNoData && mauSo > 0 ? (t5 / mauSo) * 100 : 0;

                const todayVn = getTodayVnYmd();
                const isHomNay = dateRange.from === todayVn && dateRange.to === todayVn;
                const sectionTitle = isHomNay
                  ? 'Hôm nay hàng đến lưu thoát được bao nhiêu, rớt lại bao nhiêu'
                  : `Hàng đến từ ${formatDdMm(dateRange.from)} đến ${formatDdMm(dateRange.to)} lưu thoát được bao nhiêu, rớt lại bao nhiêu`;

                const c14 = activeBlockData?.chi_tieu_14h;
                const mocA = c14?.theo_moc?.xnd;
                const mocB = c14?.theo_moc?.quet_tui_den;
                const bcvhSelectedName = selectedBcvh !== 'all'
                  ? (BCVH_LIST.find((b) => b.ma === selectedBcvh)?.ten || selectedBcvh)
                  : null;

                const legendItems = [
                  { code: 't1', label: '1 · Đi trong ngày, đúng chuyến', shbg: t1, color: '#1F7A5C' },
                  { code: 't2', label: '2 · Đi trong ngày, trượt chuyến', shbg: t2, color: '#7FBFA6' },
                  { code: 't3', label: '3 · Đi hôm sau, đúng chuyến', shbg: t3, color: '#B79BCB', extraKg: kgT3 },
                  { code: 't4', label: '4 · Đi hôm sau, trượt chuyến', shbg: t4, color: '#E0A82E' },
                  { code: 't5', label: '5 · Từ 2 ngày hoặc chưa đi', shbg: t5, color: '#B3202A' },
                ];

                return (
                  <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3.5">
                    <div>
                      <h2 className="hue-h2 text-[17px]">{sectionTitle}</h2>
                    </div>

                    {/* 4 thẻ kết quả chính */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Thẻ 1: Hàng đến tính chỉ tiêu */}
                      <div className="rounded-[10px] p-3.5 border border-gray-200 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                            HÀNG ĐẾN TÍNH CHỈ TIÊU
                          </div>
                          <div className="hue-num-lg my-1 text-gray-900">
                            {hasNoData ? '—' : formatInt(mauSo)}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 tabular-nums">
                          {hasNoData
                            ? 'bưu gửi'
                            : (activeHangHoan
                              ? `bưu gửi · ${formatKg(kgT1DenT5, { withUnit: true })} · chưa gồm ${formatInt(hangHoanTong)} hàng hoàn`
                              : `bưu gửi · ${formatKg(kgT1DenT5, { withUnit: true })}`)}
                        </div>
                      </div>

                      {/* Thẻ 2: Đi trong ngày */}
                      <div className="rounded-[10px] p-3.5 border border-gray-200 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                            ĐI TRONG NGÀY
                          </div>
                          <div className="hue-num-lg my-1 text-[#1F7A5C]">
                            {hasNoData ? '—' : formatInt(luuThoatTuSo)}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-[#1F7A5C] tabular-nums">
                          {hasNoData ? '—' : `${formatPercent(activeBlockData.luu_thoat?.ty_le)} · ${formatKg(kgDiTrongNgay, { withUnit: true })}`}
                        </div>
                      </div>

                      {/* Thẻ 3: Rớt lại sang hôm sau */}
                      <div className="rounded-[10px] p-3.5 border border-gray-200 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                            RỚT LẠI SANG HÔM SAU
                          </div>
                          <div className="hue-num-lg my-1 text-[#A87A12]">
                            {hasNoData ? '—' : formatInt(rotLaiShbg)}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-[#A87A12] tabular-nums">
                          {hasNoData ? '—' : `${formatPercent(tyLeRotLai)} · ${formatKg(kgRotLai, { withUnit: true })}`}
                        </div>
                      </div>

                      {/* Thẻ 4: Đạt 14 giờ (trên phần đo được) */}
                      <KttErrorBoundary>
                        <div
                          id="ktt-the-chi-tieu-14h"
                          className="rounded-[10px] p-3.5 border border-gray-200 flex flex-col justify-between"
                        >
                          <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase mb-1">
                            ĐẠT 14 GIỜ (TRÊN PHẦN ĐO ĐƯỢC)
                          </div>

                          {hasNoData || !c14 ? (
                            <div className="py-3 text-gray-400 italic text-xs text-center">—</div>
                          ) : (
                            <div className="space-y-1.5 my-auto">
                              <div
                                className={`p-1.5 rounded-[8px] transition-colors cursor-help border ${
                                  mocChiTieu === 'xnd'
                                    ? 'bg-[#FAF5E8] border-[#E4D5AE]'
                                    : 'bg-gray-50/70 border-transparent hover:bg-gray-100/70'
                                }`}
                                title={`Giờ xác nhận BD10 đến: ${formatInt(mocA?.khong_do_duoc?.tong ?? 0)} không đo được (chưa đi: ${formatInt(mocA?.khong_do_duoc?.chua_di ?? 0)}, thiếu XNĐ: ${formatInt(mocA?.khong_do_duoc?.thieu_moc ?? 0)}, XNĐ sau giờ đi: ${formatInt(mocA?.khong_do_duoc?.moc_sau_gio_di ?? 0)})`}
                              >
                                <div className="flex items-center justify-between gap-1 leading-tight">
                                  <span className="text-[11px] font-bold text-gray-900 truncate">
                                    Giờ xác nhận BD10 đến (chính thức)
                                  </span>
                                  <span className="text-xs font-bold text-[#1F7A5C] tabular-nums shrink-0">
                                    {mocA?.do_duoc > 0 ? formatPercent(mocA.ty_le_dat_tren_do_duoc) : '—'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-600 tabular-nums mt-0.5 leading-snug">
                                  đo được <strong>{formatInt(mocA?.do_duoc ?? 0)}</strong>/{formatInt(mocA?.mau_so ?? 0)} · đạt {formatInt(mocA?.dat ?? 0)} · không đạt {formatInt(mocA?.khong_dat ?? 0)}
                                </div>
                              </div>

                              <div
                                className={`p-1.5 rounded-[8px] transition-colors cursor-help border ${
                                  mocChiTieu === 'quet_tui_den'
                                    ? 'bg-[#FAF5E8] border-[#E4D5AE]'
                                    : 'bg-gray-50/70 border-transparent hover:bg-gray-100/70'
                                }`}
                                title={`Giờ quét túi đến: ${formatInt(mocB?.khong_do_duoc?.tong ?? 0)} không đo được (chưa đi: ${formatInt(mocB?.khong_do_duoc?.chua_di ?? 0)}, thiếu giờ quét đến: ${formatInt(mocB?.khong_do_duoc?.thieu_moc ?? 0)}, quét đến sau giờ đi: ${formatInt(mocB?.khong_do_duoc?.moc_sau_gio_di ?? 0)})`}
                              >
                                <div className="flex items-center justify-between gap-1 leading-tight">
                                  <span className="text-[11px] font-bold text-gray-900 truncate">
                                    Giờ quét túi đến
                                  </span>
                                  <span className="text-xs font-bold text-[#1F7A5C] tabular-nums shrink-0">
                                    {mocB?.do_duoc > 0 ? formatPercent(mocB.ty_le_dat_tren_do_duoc) : '—'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-600 tabular-nums mt-0.5 leading-snug">
                                  đo được <strong>{formatInt(mocB?.do_duoc ?? 0)}</strong>/{formatInt(mocB?.mau_so ?? 0)} · đạt {formatInt(mocB?.dat ?? 0)} · không đạt {formatInt(mocB?.khong_dat ?? 0)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </KttErrorBoundary>
                    </div>

                    {/* Chú thích thiếu khối lượng */}
                    {data.meta?.shbg_thieu_khoi_luong > 0 && (
                      <div className="text-[11px] text-gray-500 italic">
                        * {formatInt(data.meta.shbg_thieu_khoi_luong)} bưu gửi chưa có khối lượng, tổng kg là số tối thiểu
                      </div>
                    )}

                    {/* Thanh năm trạng thái */}
                    <KttTooltip
                      ariaLabel={`Năm trạng thái lưu thoát · Hàng đến tính chỉ tiêu: ${formatInt(mauSo)} bưu gửi · Đi trong ngày: ${formatInt(luuThoatTuSo)} (${formatPercent(activeBlockData.luu_thoat?.ty_le)}) · Rớt lại: ${formatInt(rotLaiShbg)} (${formatPercent(tyLeRotLai)})`}
                      content={
                        <div className="space-y-1.5 min-w-[240px]">
                          <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-3">
                            <span>Năm trạng thái lưu thoát</span>
                            <span className="text-gray-300 font-normal">
                              Tổng: <strong className="text-white font-bold tabular-nums">{formatInt(mauSo)}</strong> bưu gửi
                            </span>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            {legendItems.map((it) => (
                              <div key={it.code} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span style={{ backgroundColor: it.color }} className="w-2.5 h-2.5 rounded-xs shrink-0" />
                                  <span>{it.label}</span>
                                </span>
                                <span className="tabular-nums font-semibold text-white">
                                  {formatInt(it.shbg)} bưu gửi ({formatPercent(mauSo > 0 ? it.shbg / mauSo : 0)})
                                </span>
                              </div>
                            ))}
                            {dangChoChuyen > 0 && (
                              <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-800">
                                <span className="flex items-center gap-1.5 text-purple-300">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#4A1D6E] shrink-0" />
                                  <span>Đang chờ chuyến</span>
                                </span>
                                <span className="tabular-nums font-semibold text-purple-200">
                                  {formatInt(dangChoChuyen)} bưu gửi
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      }
                      className="w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-md"
                    >
                      <div className="w-full h-6 rounded-md overflow-hidden flex bg-gray-100">
                        {p1 > 0 && (
                          <div style={{ width: `${p1}%` }} className="bg-[#1F7A5C] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden">
                            {p1 >= 4 ? `${Math.round(p1)}%` : ''}
                          </div>
                        )}
                        {p2 > 0 && (
                          <div style={{ width: `${p2}%` }} className="bg-[#7FBFA6] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden">
                            {p2 >= 4 ? `${Math.round(p2)}%` : ''}
                          </div>
                        )}
                        {p3 > 0 && (
                          <div style={{ width: `${p3}%` }} className="bg-[#B79BCB] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden">
                            {p3 >= 4 ? `${Math.round(p3)}%` : ''}
                          </div>
                        )}
                        {p4 > 0 && (
                          <div style={{ width: `${p4}%` }} className="bg-[#E0A82E] h-full flex items-center justify-center text-[11px] font-bold text-[#3B1450] tabular-nums px-1 overflow-hidden">
                            {p4 >= 4 ? `${Math.round(p4)}%` : ''}
                          </div>
                        )}
                        {p5 > 0 && (
                          <div style={{ width: `${p5}%` }} className="bg-[#B3202A] h-full flex items-center justify-center text-[11px] font-bold text-white tabular-nums px-1 overflow-hidden">
                            {p5 >= 4 ? `${Math.round(p5)}%` : ''}
                          </div>
                        )}
                      </div>
                    </KttTooltip>

                    {/* Chú thích 5 trạng thái (số và %) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
                      {legendItems.map((it) => {
                        const pct = !hasNoData && mauSo > 0 ? it.shbg / mauSo : null;
                        return (
                          <div key={it.code} className="flex items-start gap-1.5 text-gray-700 leading-snug">
                            <span style={{ backgroundColor: it.color }} className="w-2.5 h-2.5 rounded-xs shrink-0 mt-1" />
                            <div>
                              <span>{it.label}</span>{' '}
                              <strong className="tabular-nums text-gray-900">{hasNoData ? '—' : formatInt(it.shbg)}</strong>{' '}
                              <span className="tabular-nums text-gray-500">({hasNoData ? '—' : formatPercent(pct)})</span>
                              {it.extraKg !== undefined && !hasNoData && (
                                <span className="text-[11px] text-gray-500 tabular-nums"> · {formatKg(it.extraKg, { withUnit: true })}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Dòng «Trượt chuyến, cần xử lý» */}
                    <div className="border-l-[3px] border-[#B3202A] pl-3 py-0.5 text-xs text-gray-800 tabular-nums">
                      <strong>Trượt chuyến, cần xử lý: {hasNoData ? '—' : formatInt(truotChuyenShbg)}</strong>{' '}
                      ({hasNoData ? '—' : `${formatPercent(tyLeTruotChuyen)} hàng đến`}){' '}
                      ={' '}
                      {hasNoData ? '—' : (
                        diTuD2Dung === 0 && truotChuyenShbg === t2 + t4 + t5
                          ? `${formatInt(t2)} + ${formatInt(t4)} + ${formatInt(t5)} (trạng thái 2 + 4 + 5)`
                          : `${formatInt(t2)} + ${formatInt(t4)} + ${formatInt(Math.max(0, t5 - diTuD2Dung))} (trạng thái 2 + 4 + phần trượt/chưa đi của 5)`
                      )}
                      . Nằm trong cả «đi trong ngày» lẫn «rớt lại», không cộng thêm.
                    </div>

                    {/* Dòng nối số */}
                    <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[8px] px-3 py-2 text-xs text-[#4A3F55] tabular-nums space-y-1.5">
                      <div>
                        {bcvhSelectedName ? (
                          <>
                            <strong>Nối số ({bcvhSelectedName}):</strong> tất cả bưu gửi của BCVH{' '}
                            <strong>{hasNoData ? '—' : formatInt(tongTatCa)}</strong> ={' '}
                            {hasNoData ? '—' : formatInt(mauSo)} tính chỉ tiêu +{' '}
                            {hasNoData ? '—' : formatInt(dangChoChuyen)} đang chờ chuyến +{' '}
                            {hasNoData ? '—' : formatInt(hangHoanTong)} hàng hoàn +{' '}
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.tong ?? 0)} ngoài chỉ tiêu (
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.khong_co_gio_quet_den ?? 0)} thiếu giờ quét
                            {(currentNgoaiBayChip?.khong_xep_duoc_chuyen_tong ?? 0) > 0
                              ? `, ${formatInt(currentNgoaiBayChip.khong_xep_duoc_chuyen_tong)} không xếp được chuyến`
                              : ''}
                            ). Hàng hoàn hiện riêng, không cộng vào chỉ tiêu.
                          </>
                        ) : (
                          <>
                            <strong>Nối số:</strong> tất cả bưu gửi đến KTT{' '}
                            <strong>{hasNoData ? '—' : formatInt(tongTatCa)}</strong> ={' '}
                            {hasNoData ? '—' : formatInt(mauSo)} tính chỉ tiêu +{' '}
                            {hasNoData ? '—' : formatInt(dangChoChuyen)} đang chờ chuyến +{' '}
                            {hasNoData ? '—' : formatInt(hangHoanTong)} hàng hoàn +{' '}
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.tong ?? 0)} ngoài chỉ tiêu (
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.khong_ro_dich ?? 0)} không rõ đích,{' '}
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.ngoai_pham_vi_tong ?? 0)} ngoài 6 BCVH,{' '}
                            {hasNoData ? '—' : formatInt(currentNgoaiBayChip?.khong_co_gio_quet_den ?? 0)} thiếu giờ quét
                            {(currentNgoaiBayChip?.khong_xep_duoc_chuyen_tong ?? 0) > 0
                              ? `, ${formatInt(currentNgoaiBayChip.khong_xep_duoc_chuyen_tong)} không xếp được chuyến`
                              : ''}
                            ). Hàng hoàn hiện riêng, không cộng vào chỉ tiêu.
                          </>
                        )}
                        {!selectedCell && currentNgoaiBayChip && currentNgoaiBayChip.tong > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowNgoaiBayChipModal((prev) => !prev)}
                            aria-expanded={showNgoaiBayChipModal ? 'true' : 'false'}
                            className="ml-2 text-[#4A1D6E] font-semibold underline hover:no-underline cursor-pointer"
                          >
                            {showNgoaiBayChipModal ? 'Thu gọn giải thích' : 'Xem giải thích'}
                          </button>
                        )}
                      </div>

                      {showNgoaiBayChipModal && currentNgoaiBayChip && currentNgoaiBayChip.tong > 0 && (
                        <div className="pt-2 border-t border-[#E4D5AE] space-y-1 text-xs text-gray-700">
                          <ul className="list-disc pl-4 space-y-0.5">
                            <li>
                              <strong>Không rõ đích ({formatInt(currentNgoaiBayChip.khong_ro_dich ?? 0)}):</strong> Bưu gửi không xác định được bưu cục đến.
                            </li>
                            <li>
                              <strong>Ngoài 6 BCVH Huế ({formatInt(currentNgoaiBayChip.ngoai_pham_vi_tong ?? 0)}):</strong> Bưu gửi đi các tỉnh khác hoặc các điểm ngoài 6 BCVH nội tỉnh (Hệ 1 / 530900, tỉnh khác, KTT 530100).
                            </li>
                            <li>
                              <strong>Thiếu giờ quét túi đến ({formatInt(currentNgoaiBayChip.khong_co_gio_quet_den ?? 0)}):</strong> Chỉ có giờ xác nhận BD10 đến hoặc mốc khác mà thiếu giờ quét túi đến tại KTT.
                            </li>
                            <li>
                              <strong>Không xếp được chuyến ({formatInt(currentNgoaiBayChip.khong_xep_duoc_chuyen_tong ?? 0)}):</strong> Không khớp với lịch chuyến xe đã cấu hình.
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Khối «Theo nguồn hàng» (Khai thác vs Chuyển tiếp) */}
                    {data.tong_cong?.theo_nguon_hang && (() => {
                      const tnh = data.tong_cong.theo_nguon_hang;
                      const kt = tnh.khai_thac;
                      const ct = tnh.chuyen_tiep;

                      const ktMauSo = kt?.tong?.luu_thoat?.mau_so ?? 0;
                      const ktTyLeLuu = !hasNoData && ktMauSo > 0 ? (kt?.tong?.luu_thoat?.ty_le ?? null) : null;
                      const ktC14 = kt?.tong?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                      const ktDoDuoc = ktC14?.do_duoc ?? 0;
                      const ktMauSo14 = ktC14?.mau_so ?? 0;
                      const ktTyLe14 = !hasNoData && ktDoDuoc > 0 ? (ktC14?.ty_le_dat_tren_do_duoc ?? null) : null;

                      const ctMauSo = ct?.tong?.luu_thoat?.mau_so ?? 0;
                      const ctTyLeLuu = !hasNoData && ctMauSo > 0 ? (ct?.tong?.luu_thoat?.ty_le ?? null) : null;
                      const ctC14 = ct?.tong?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                      const ctDoDuoc = ctC14?.do_duoc ?? 0;
                      const ctMauSo14 = ctC14?.mau_so ?? 0;
                      const ctTyLe14 = !hasNoData && ctDoDuoc > 0 ? (ctC14?.ty_le_dat_tren_do_duoc ?? null) : null;

                      return (
                        <div className="pt-1 border-t border-gray-100 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                              Theo nguồn hàng
                            </span>
                            {selectedBcvh !== 'all' && (
                              <span className="text-[11px] text-gray-500 italic">
                                Số liệu nguồn hàng tính trên toàn KTT
                              </span>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="table-soft w-full min-w-[520px] text-xs text-left">
                              <thead>
                                <tr>
                                  <th className="text-left">NGUỒN HÀNG</th>
                                  <th className="text-right">BƯU GỬI TÍNH CHỈ TIÊU</th>
                                  <th className="text-right">ĐI TRONG NGÀY</th>
                                  <th className="text-right">ĐẠT 14 GIỜ (TRÊN PHẦN ĐO ĐƯỢC)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="hover:bg-[#FFFBEF] transition-colors">
                                  <td className="font-medium text-gray-900">Hàng khai thác (KTT mở túi, chia lại)</td>
                                  <td className="text-right tabular-nums font-semibold text-gray-900">
                                    {hasNoData ? '—' : formatInt(ktMauSo)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                    {hasNoData || ktTyLeLuu === null ? '—' : formatPercent(ktTyLeLuu)}
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <span className="font-semibold text-[#4A1D6E]">
                                      {hasNoData || ktTyLe14 === null ? '—' : formatPercent(ktTyLe14)}
                                    </span>
                                    {!hasNoData && ktC14 && (
                                      <span className="text-[11px] text-gray-500 ml-1.5">
                                        (đo được {formatInt(ktDoDuoc)}/{formatInt(ktMauSo14)})
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                <tr className="hover:bg-[#FFFBEF] transition-colors">
                                  <td className="font-medium text-gray-900">Hàng chuyển tiếp (đi nguyên túi)</td>
                                  <td className="text-right tabular-nums font-semibold text-gray-900">
                                    {hasNoData ? '—' : formatInt(ctMauSo)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                    {hasNoData || ctTyLeLuu === null ? '—' : formatPercent(ctTyLeLuu)}
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <span className="font-semibold text-[#4A1D6E]">
                                      {hasNoData || ctTyLe14 === null ? '—' : formatPercent(ctTyLe14)}
                                    </span>
                                    {!hasNoData && ctC14 && (
                                      <span className="text-[11px] text-gray-500 ml-1.5">
                                        (đo được {formatInt(ctDoDuoc)}/{formatInt(ctMauSo14)})
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── HÀNG CHUYỂN HOÀN (HIỆN RIÊNG, THU GỌN) ────────────────────── */}
              {activeHangHoan && (() => {
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
                  <div className="bg-white rounded-[14px] p-4 border border-purple-200 shadow-none space-y-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="hue-h2 text-[16px]">
                        Hàng chuyển hoàn: hiện riêng, không tính chỉ tiêu 14 giờ
                      </h2>
                      <span className="text-[11px] text-gray-500">
                        Không cộng vào các con số và tỷ lệ của trang
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div className="px-3 py-2 bg-gray-50 rounded-[8px] border border-gray-200">
                        <div className="text-[11px] font-bold text-gray-600 uppercase">HÀNG HOÀN ĐẾN</div>
                        <div className="text-lg font-bold text-gray-900 tabular-nums">
                          {hasNoData ? '—' : formatInt(hhTong)}{' '}
                          <span className="text-[11px] font-normal text-gray-500">
                            {hasNoData ? '' : `· ${formatKg(hhKg, { withUnit: true })}`}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-gray-50 rounded-[8px] border border-gray-200">
                        <div className="text-[11px] font-bold text-gray-600 uppercase">ĐI TRONG NGÀY</div>
                        <div className="text-lg font-bold text-[#1F7A5C] tabular-nums">
                          {hasNoData ? '—' : formatInt(hhLuuThoat)}{' '}
                          <span className="text-[11px] font-semibold">
                            {hasNoData ? '' : `(${formatPercent(hhTyLeLuu)} · ${formatKg(hhDiTrongNgayKg, { withUnit: true })})`}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-gray-50 rounded-[8px] border border-gray-200">
                        <div className="text-[11px] font-bold text-gray-600 uppercase">3 · ĐI HÔM SAU, ĐÚNG CHUYẾN</div>
                        <div className="text-lg font-bold text-[#4A1D6E] tabular-nums">
                          {hasNoData ? '—' : formatInt(hhT3)}{' '}
                          <span className="text-[11px] font-normal text-gray-500">
                            {hasNoData ? '' : `· ${formatKg(hhT3Kg, { withUnit: true })}`}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-gray-50 rounded-[8px] border border-gray-200">
                        <div className="text-[11px] font-bold text-gray-600 uppercase">TRƯỢT CHUYẾN, TỪ 2 NGÀY / CHƯA ĐI</div>
                        <div className="text-lg font-bold text-[#B3202A] tabular-nums">
                          {hasNoData ? '—' : formatInt(hhTruot)}{' '}
                          <span className="text-[11px] font-semibold">
                            {hasNoData ? '' : `(${formatPercent(hhTyLeTruot)})`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <KttTooltip
                      ariaLabel={`Hàng chuyển hoàn · Tổng phân loại: ${formatInt(hhLuuThoat + hhRotLai)} bưu gửi · Đi trong ngày: ${formatInt(hhLuuThoat)} (${formatPercent(hhTyLeLuu)}) · Rớt lại: ${formatInt(hhRotLai)} (${formatPercent(hhTyLeRot)})`}
                      content={
                        <div className="space-y-1.5 min-w-[240px]">
                          <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-3">
                            <span>Hàng chuyển hoàn</span>
                            <span className="text-gray-300 font-normal">
                              Tổng: <strong className="text-white font-bold tabular-nums">{formatInt(hhLuuThoat + hhRotLai)}</strong> bưu gửi
                            </span>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between gap-3">
                              <span>1 · Đi trong ngày, đúng chuyến</span>
                              <span className="tabular-nums font-semibold text-emerald-300">{formatInt(hhT1)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>2 · Đi trong ngày, trượt chuyến</span>
                              <span className="tabular-nums font-semibold text-teal-200">{formatInt(hhT2)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>3 · Đi hôm sau, đúng chuyến</span>
                              <span className="tabular-nums font-semibold text-purple-200">{formatInt(hhT3)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>4 · Đi hôm sau, trượt chuyến</span>
                              <span className="tabular-nums font-semibold text-amber-300">{formatInt(hhT4)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>5 · Từ 2 ngày hoặc chưa đi</span>
                              <span className="tabular-nums font-semibold text-red-300">{formatInt(hhT5)}</span>
                            </div>
                            {hhDangCho > 0 && (
                              <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-800">
                                <span>Đang chờ chuyến</span>
                                <span className="tabular-nums font-semibold text-purple-200">{formatInt(hhDangCho)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      }
                      className="w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-md"
                    >
                      <div className="w-full h-3.5 rounded-md overflow-hidden flex bg-gray-100">
                        {hp1 > 0 && <div style={{ width: `${hp1}%` }} className="bg-[#1F7A5C] h-full" />}
                        {hp2 > 0 && <div style={{ width: `${hp2}%` }} className="bg-[#7FBFA6] h-full" />}
                        {hp3 > 0 && <div style={{ width: `${hp3}%` }} className="bg-[#B79BCB] h-full" />}
                        {hp4 > 0 && <div style={{ width: `${hp4}%` }} className="bg-[#E0A82E] h-full" />}
                        {hp5 > 0 && <div style={{ width: `${hp5}%` }} className="bg-[#B3202A] h-full" />}
                      </div>
                    </KttTooltip>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 tabular-nums">
                      <span>1 · Đúng: <strong>{hasNoData ? '—' : formatInt(hhT1)}</strong></span>
                      <span>2 · Trượt: <strong>{hasNoData ? '—' : formatInt(hhT2)}</strong></span>
                      <span>3 · Hôm sau đúng: <strong>{hasNoData ? '—' : formatInt(hhT3)}</strong></span>
                      <span>4 · Hôm sau trượt: <strong>{hasNoData ? '—' : formatInt(hhT4)}</strong></span>
                      <span>5 · Từ 2 ngày/chưa đi: <strong>{hasNoData ? '—' : formatInt(hhT5)}</strong></span>
                      <span>Rớt lại: <strong className="text-[#A87A12]">{hasNoData ? '—' : `${formatInt(hhRotLai)} (${formatPercent(hhTyLeRot)})`}</strong></span>
                      {hhDangCho > 0 && (
                        <span className="px-1.5 py-0.5 bg-[#EFE6F5] text-[#4A1D6E] rounded">
                          Đang chờ: <strong>{hasNoData ? '—' : formatInt(hhDangCho)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── 3. BẢNG «THEO NGÀY HÀNG ĐẾN» ───────────────────────────────── */}
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3">
                <div>
                  <h2 className="hue-h2 text-[17px]">Theo ngày hàng đến</h2>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Ngày chưa chốt hiện <span className="text-[#A87A12] font-semibold">«Số tạm»</span>; ngày chốt khi dữ liệu {meta?.gio_chot_ngay || '09:00'} của hôm sau về.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="table-soft w-full min-w-[680px] text-left">
                    <thead>
                      <tr>
                        <th className="text-left">NGÀY</th>
                        <th className="text-right">HÀNG ĐẾN TÍNH CHỈ TIÊU</th>
                        <th className="text-right">ĐI TRONG NGÀY</th>
                        <th className="text-right">RỚT LẠI</th>
                        <th className="text-right">ĐẠT 14 GIỜ (TRÊN PHẦN ĐO ĐƯỢC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.theo_ngay && data.theo_ngay.length > 0 ? (
                        data.theo_ngay.map((row) => {
                          const dayBlock = selectedBcvh === 'all' ? row.tong : row.theo_bcvh?.[selectedBcvh];
                          const ddmm = formatDdMmYyyy(row.ngay).slice(0, 5);
                          const thu = getThuTiengViet(row.ngay);
                          const statusBadge = !row.co_du_lieu ? (
                            <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">
                              Chưa có hàng đến
                            </span>
                          ) : row.da_chot ? (
                            <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                              Đã chốt
                            </span>
                          ) : (
                            <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF1CC] text-[#A87A12]">
                              Số tạm
                            </span>
                          );

                          if (!row.co_du_lieu || !dayBlock) {
                            return (
                              <tr key={row.ngay} className={!row.co_du_lieu ? 'opacity-50' : 'hover:bg-[#FFFBEF] transition-colors'}>
                                <td className="font-medium whitespace-nowrap text-gray-900">
                                  {ddmm} ({thu}){statusBadge}
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
                          const dayC14 = dayBlock.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                          const doDuoc = dayC14?.do_duoc ?? 0;
                          const mauSo14 = dayC14?.mau_so ?? 0;
                          const tyLe14 = doDuoc > 0 ? dayC14.ty_le_dat_tren_do_duoc : null;
                          const tooltip = `Đo được ${formatInt(doDuoc)}/${formatInt(mauSo14)} · đạt ${formatInt(dayC14?.dat ?? 0)} · không đạt ${formatInt(dayC14?.khong_dat ?? 0)}`;

                          return (
                            <tr key={row.ngay} className="hover:bg-[#FFFBEF] transition-colors">
                              <td className="font-medium whitespace-nowrap text-gray-900">
                                {ddmm} ({thu}){statusBadge}
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
                              <td
                                className="text-right tabular-nums cursor-help"
                                title={tooltip}
                              >
                                <span className="font-semibold text-[#4A1D6E]">
                                  {tyLe14 !== null ? formatPercent(tyLe14) : '—'}
                                </span>
                                {dayC14 && (
                                  <span className="text-[11px] text-gray-500 ml-1.5">
                                    (đo được {formatInt(doDuoc)}/{formatInt(mauSo14)})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-gray-500 italic">
                            Không có ngày nào trong khoảng chọn.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 4. THEO BCVH ĐÍCH (BẢNG CÓ THANH) & 5. THEO NGUỒN ───────────── */}
              {data.tong_cong && (
                <>
                  <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3">
                    <div>
                      <h2 className="hue-h2 text-[17px]">Theo BCVH đích</h2>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Sản lượng, tỷ lệ rớt lại và tỷ trọng phân bổ trên 6 Bưu cục Vận hành Huế.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="table-soft w-full min-w-[820px] text-left">
                        <thead>
                          <tr>
                            <th className="text-left">BCVH</th>
                            <th className="text-right">HÀNG ĐẾN</th>
                            <th className="text-left min-w-[230px]">RỚT LẠI (% CỦA CHÍNH BCVH)</th>
                            <th className="text-right">TRƯỢT CHUYẾN</th>
                            <th className="text-right">
                              CHIẾM % HÀNG ĐI
                              <div className="text-[11px] font-normal normal-case text-gray-500">
                                trong {formatInt(data.tong_cong.luu_thoat?.tu_so ?? 0)} hàng đi
                              </div>
                            </th>
                            <th className="text-right">
                              CHIẾM % HÀNG RỚT
                              <div className="text-[11px] font-normal normal-case text-gray-500">
                                {(() => {
                                  const tRot = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
                                    (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
                                    (data.tong_cong.trang_thai?.t5?.shbg ?? 0);
                                  return `trong ${formatInt(tRot)} hàng rớt`;
                                })()}
                              </div>
                            </th>
                            <th className="text-right">ĐẠT 14 GIỜ (TRÊN PHẦN ĐO ĐƯỢC)</th>
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
                              const bTruot = (bBlock?.dung_chuyen?.truot_chuyen ?? 0) +
                                (bBlock?.dung_chuyen?.lo_chuyen ?? 0);
                              const bKg = (bBlock?.trang_thai?.t1?.kg ?? 0) +
                                (bBlock?.trang_thai?.t2?.kg ?? 0) +
                                (bBlock?.trang_thai?.t3?.kg ?? 0) +
                                (bBlock?.trang_thai?.t4?.kg ?? 0) +
                                (bBlock?.trang_thai?.t5?.kg ?? 0);

                              const tyTrongDi = !hasNoData && tongDi > 0 ? bDi / tongDi : null;
                              const tyTrongRot = !hasNoData && tongRot > 0 ? bRot / tongRot : null;
                              const tyLeRotChinh = !hasNoData && bMauSo > 0 ? bRot / bMauSo : null;
                              const tyLeLuu = !hasNoData ? bBlock?.luu_thoat?.ty_le : null;
                              const tyLeTruot = !hasNoData && bMauSo > 0 ? bTruot / bMauSo : null;

                              const bC14 = bBlock?.chi_tieu_14h?.theo_moc?.[mocChiTieu];
                              const doDuoc = bC14?.do_duoc ?? 0;
                              const mauSo14 = bC14?.mau_so ?? 0;
                              const tyLeDat14 = !hasNoData && doDuoc > 0 ? bC14.ty_le_dat_tren_do_duoc : null;
                              const bTooltip = `Đo được ${formatInt(doDuoc)}/${formatInt(mauSo14)} · đạt ${formatInt(bC14?.dat ?? 0)} · không đạt ${formatInt(bC14?.khong_dat ?? 0)}`;

                              return (
                                <tr
                                  key={b.ma}
                                  className={`transition-colors ${
                                    selectedBcvh === b.ma ? 'bg-[#FAF5E8]' : 'hover:bg-[#FFFBEF]'
                                  }`}
                                >
                                  <td className="font-semibold text-gray-900 whitespace-nowrap">
                                    {b.ten}
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <div className="font-semibold text-gray-900">
                                      {hasNoData ? '—' : formatInt(bMauSo)}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      {hasNoData ? '—' : formatKg(bKg, { withUnit: true })}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-2.5">
                                      <span className="tabular-nums font-medium text-gray-800 w-12 text-right shrink-0">
                                        {hasNoData ? '—' : formatInt(bRot)}
                                      </span>
                                      <KttTooltip
                                        ariaLabel={`${b.ten} · Hàng đến: ${formatInt(bMauSo)} bưu gửi · Đi trong ngày: ${formatInt(bDi)} (${formatPercent(tyLeLuu)}) · Rớt lại: ${formatInt(bRot)} (${formatPercent(tyLeRotChinh)}) · Trượt chuyến: ${formatInt(bTruot)} (${formatPercent(tyLeTruot)})`}
                                        content={
                                          <div className="space-y-1 min-w-[200px]">
                                            <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-2">
                                              <span>{b.ten}</span>
                                              <span className="text-gray-300 font-normal tabular-nums">
                                                {formatInt(bMauSo)} bưu gửi
                                              </span>
                                            </div>
                                            <div className="space-y-0.5 text-[11px] pt-0.5">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-emerald-300">Đi trong ngày:</span>
                                                <span className="tabular-nums font-bold text-white">{formatInt(bDi)} ({formatPercent(tyLeLuu)})</span>
                                              </div>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-amber-300">Rớt lại:</span>
                                                <span className="tabular-nums font-bold text-white">{formatInt(bRot)} ({formatPercent(tyLeRotChinh)})</span>
                                              </div>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-red-300">Trượt chuyến:</span>
                                                <span className="tabular-nums font-bold text-white">{formatInt(bTruot)} ({formatPercent(tyLeTruot)})</span>
                                              </div>
                                            </div>
                                          </div>
                                        }
                                        className="flex-1 min-w-[80px] cursor-pointer py-1 focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-full"
                                      >
                                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-200 flex">
                                          <div
                                            style={{ width: `${(tyLeLuu ?? 0) * 100}%` }}
                                            className="bg-[#1F7A5C] h-full"
                                          />
                                          <div
                                            style={{ width: `${(tyLeRotChinh ?? 0) * 100}%` }}
                                            className="bg-[#E0A82E] h-full"
                                          />
                                        </div>
                                      </KttTooltip>
                                      <span className="tabular-nums font-bold text-[#A87A12] w-12 text-right shrink-0">
                                        {formatPercent(tyLeRotChinh)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="text-right tabular-nums">
                                    <div className="font-semibold text-[#B3202A]">
                                      {formatPercent(tyLeTruot)}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      {hasNoData ? '—' : `${formatInt(bTruot)} bưu gửi`}
                                    </div>
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                                    {formatPercent(tyTrongDi)}
                                  </td>
                                  <td className="text-right tabular-nums font-semibold text-[#A87A12]">
                                    {formatPercent(tyTrongRot)}
                                  </td>
                                  <td
                                    className="text-right tabular-nums cursor-help"
                                    title={bTooltip}
                                  >
                                    <div className="font-semibold text-[#4A1D6E]">
                                      {tyLeDat14 !== null ? formatPercent(tyLeDat14) : '—'}
                                    </div>
                                    {!hasNoData && bC14 && (
                                      <div className="text-[11px] text-gray-500">
                                        đo được {formatInt(doDuoc)}/{formatInt(mauSo14)}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── 5. THEO NGUỒN / ĐƯỜNG THƯ ĐẾN ──────────────────────────── */}
                  <KttTheoNguon
                    data={data}
                    selectedBcvh={selectedBcvh}
                  />
                </>
              )}

              {/* ── 6. RỚT LẠI NẰM Ở ĐÂU: NGUỒN × BCVH ĐÍCH ───────────────────── */}
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
                    setShowChiTiet(true);
                  }
                }}
              />

              {/* ── 7. DANH SÁCH VÀ XUẤT XLSX (SHEET 7) THU GỌN ───────────────── */}
              <div
                className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-3"
                aria-busy={exportLoading ? 'true' : 'false'}
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="hue-h2 text-[17px]">
                      Danh sách hàng đến trong ngày theo trạng thái
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowChiTiet((prev) => !prev)}
                      aria-expanded={showChiTiet ? 'true' : 'false'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#D9CBA8] bg-[#FAF5E8] hover:bg-[#FFFBEF] text-xs font-bold text-[#4A1D6E] cursor-pointer transition-colors"
                    >
                      <span>{showChiTiet ? 'Thu gọn danh sách' : 'Mở danh sách'}</span>
                      {showChiTiet ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="ktt-export-status-select" className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                      Trạng thái xuất:
                    </label>
                    <select
                      id="ktt-export-status-select"
                      aria-label="Trạng thái xuất"
                      value={selectedExportStatus}
                      onChange={(e) => setSelectedExportStatus(e.target.value)}
                      disabled={exportLoading}
                      className="px-2.5 py-1.5 rounded-[8px] border border-[#D9CBA8] bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4A1D6E] cursor-pointer disabled:opacity-50"
                    >
                      {EXPORT_STATUS_OPTIONS.map((opt) => {
                        const count = getExportCount(opt.key);
                        const countText = (hasNoData || count === null) ? '—' : formatInt(count);
                        return (
                          <option key={opt.key || 'ALL'} value={opt.key}>
                            {opt.label} · {countText}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={handleDownloadExcel}
                      disabled={exportLoading || !!validationError}
                      title="Xuất xlsx Sheet 7 (18 cột: SHBG, Đường thư đến, Giờ quét túi đến KTT, Giờ xác nhận BD10 đến, KL, BCVH đích, Chuyến liền kề, Giờ xuất phát, Hạn đến, Giờ lập BD10 đi, Chờ tính chỉ tiêu, 2 cột Chỉ tiêu 14 giờ, Phân loại, Trạng thái 1–5, Ngày lưu thoát). Tối đa 31 ngày, 200.000 dòng."
                      className={`btn-primary px-3.5 py-1.5 rounded-[8px] text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
                        exportLoading || validationError ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {exportLoading
                          ? 'Đang tạo…'
                          : (selectedCell
                            ? 'Xuất xlsx'
                            : `Xuất xlsx · ${formatInt(getExportCount(selectedExportStatus) ?? 0)}`)}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span>
                    Xuất xlsx Sheet 7 · tối đa 31 ngày, tối đa 200.000 dòng · Chỉ ADMIN và TTVH · Tên file: KTT_LuuThoat_{dateRange?.from}_{dateRange?.to}.xlsx
                  </span>
                  <span className="text-[#A87A12] font-semibold">
                    {(() => {
                      const effBcvh = selectedCell?.ma_bcvh || (selectedBcvh !== 'all' ? selectedBcvh : null);
                      const effNguon = selectedCell?.nguon || null;
                      const bcvhName = effBcvh ? (BCVH_LIST.find((b) => b.ma === effBcvh)?.ten || effBcvh) : null;
                      const nguonName = selectedCell?.nguonTen || effNguon;
                      if (bcvhName && nguonName) return `Đang lọc xuất: ${bcvhName} · Nguồn ${nguonName}`;
                      if (bcvhName) return `Đang lọc xuất: ${bcvhName}`;
                      if (nguonName) return `Đang lọc xuất: Nguồn ${nguonName}`;
                      return 'Đang xuất: cả 6 BCVH';
                    })()}
                  </span>
                </div>

                {selectedCell && (
                  <div className="text-xs text-[#A87A12] bg-[#FFFBEF] border border-[#E4D5AE] rounded-[8px] px-3 py-1.5 flex items-center justify-between">
                    <span>
                      Đang lọc theo ô {selectedCell.label || 'đã chọn'}: bỏ lọc để xem số các nhóm
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

                {exportLoading && (
                  <div className="space-y-1.5">
                    <div className="text-xs text-gray-700">
                      Đang tạo tệp Excel cho khoảng ngày {dateRange ? `${formatDdMmYyyy(dateRange.from)} – ${formatDdMmYyyy(dateRange.to)}` : ''}…
                    </div>
                    <div className="progress-soft w-full overflow-hidden">
                      <div className="progress-bar-soft w-full animate-pulse" />
                    </div>
                  </div>
                )}

                {exportError && (
                  <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>Không tải được.</strong> {exportError}
                    </div>
                    <div className="flex items-center gap-2">
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

                {showChiTiet && (
                  <div className="pt-2 border-t border-gray-100">
                    <KttChiTiet
                      dateRange={dateRange}
                      selectedBcvh={selectedBcvh}
                      mocChiTieu={mocChiTieu}
                      filterCell={selectedCell}
                      onClearFilterCell={() => setSelectedCell(null)}
                    />
                  </div>
                )}
              </div>

              {/* ── 8. «CÁCH TÍNH VÀ MỐC XE THEO LỊCH» THU GỌN ────────────────── */}
              <div className="bg-white rounded-[14px] border border-gray-200 shadow-none">
                <button
                  type="button"
                  onClick={() => setShowCachTinh((prev) => !prev)}
                  aria-expanded={showCachTinh ? 'true' : 'false'}
                  className="w-full px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer hover:bg-[#FFFBEF] rounded-[14px] transition-colors"
                >
                  <div>
                    <span className="font-bold text-sm text-[#4A1D6E]">
                      Cách tính và mốc xe theo lịch
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      Định nghĩa 5 trạng thái, phần đo được «đạt 14 giờ», hàng chuyển tiếp, cột file xuất và giờ xe theo lịch
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#4A1D6E] shrink-0">
                    <span>{showCachTinh ? 'Thu gọn' : 'Mở'}</span>
                    {showCachTinh ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>

                {showCachTinh && (
                  <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4 text-xs text-gray-700">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <div className="font-bold text-gray-900">Năm trạng thái lưu thoát &amp; trượt chuyến</div>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>1 · Đi trong ngày, đúng chuyến:</strong> lập BD10 đi trong ngày D, kịp giờ xuất phát của chuyến theo lịch.</li>
                          <li><strong>2 · Đi trong ngày, trượt chuyến:</strong> lập BD10 đi trong ngày D, nhưng sau giờ xuất phát của chuyến theo lịch.</li>
                          <li><strong>3 · Đi hôm sau, đúng chuyến:</strong> đến sau chuyến cuối hoặc sang ngày D+1, đi đúng chuyến đầu tiên liền kề.</li>
                          <li><strong>4 · Đi hôm sau, trượt chuyến:</strong> đi vào ngày D+1 nhưng trượt chuyến theo lịch.</li>
                          <li><strong>5 · Từ 2 ngày hoặc chưa đi:</strong> đi từ D+2 trở đi hoặc chưa đi mà đã quá giờ xuất phát của chuyến.</li>
                          <li><strong>Đang chờ chuyến:</strong> chưa đi và chưa tới giờ xuất phát của chuyến theo lịch; không tính vào tỷ lệ lưu thoát.</li>
                          <li><strong>Rớt lại = trạng thái 3 + 4 + 5.</strong> Trượt chuyến (cần xử lý) = hàng đi sau giờ xuất phát (gồm trạng thái 2, 4 và phần trượt/chưa đi của 5), nằm trong cả đi trong ngày lẫn rớt lại nên không cộng thêm.</li>
                        </ul>
                      </div>

                      <div className="space-y-1.5">
                        <div className="font-bold text-gray-900">Đạt 14 giờ, nguồn hàng &amp; bảng tỷ trọng</div>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>Đạt 14 giờ (trên phần đo được):</strong> tính thời gian chờ từ mốc bắt đầu đến giờ lập BD10 đi (bỏ khung đêm 21:00–07:00), đo song song theo <em>Giờ xác nhận BD10 đến (chính thức)</em> và <em>Giờ quét túi đến</em>; luôn ghi rõ «đo được x/y» vì không có tỷ lệ chung cho phần chưa đo được (chưa đi, thiếu mốc, mốc sau giờ đi).</li>
                          <li><strong>Hàng chuyển tiếp (đi nguyên túi):</strong> túi đến KTT rồi đi tiếp nguyên túi (hàng đi ngoài, túi chia sẵn), KTT không mở túi; vẫn tính chỉ tiêu nếu đích là 6 BCVH Huế.</li>
                          <li><strong>Hàng chuyển hoàn:</strong> bưu gửi có trong danh sách hàng hoàn và đích là 6 BCVH Huế; hiện riêng, không tính chỉ tiêu 14 giờ và không cộng vào các con số, tỷ lệ của trang.</li>
                          <li><strong>Bảng Theo BCVH đích &amp; Theo nguồn:</strong> hai cột «Chiếm % hàng đi» / «Chiếm % hàng đến» và «Chiếm % hàng rớt» / «Chiếm % tổng rớt lại» cộng 100% theo cột (ở bảng BCVH là toàn 6 BCVH); cột «Rớt lại» là tỷ lệ riêng của chính từng BCVH hoặc nguồn.</li>
                          <li><strong>Cột trong file xuất xlsx (Sheet 7):</strong> SHBG, Đường thư đến (tên, mã), Giờ quét túi đến KTT, Giờ xác nhận BD10 đến (ConfirmDate), KL (kg), BCVH đích (mã, tên), Chuyến liền kề, Giờ xuất phát, Hàng đến muộn nhất để kịp chuyến, Giờ lập BD10 đi, Giờ chờ tính chỉ tiêu, Chỉ tiêu 14 giờ – Giờ xác nhận BD10 đến, Chỉ tiêu 14 giờ – Giờ quét túi đến, Phân loại, Trạng thái (1–5), Ngày lưu thoát (18 cột, kèm sheet «Thông tin»).</li>
                        </ul>
                      </div>
                    </div>

                    {/* Bảng Mốc xe theo lịch */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-gray-900">Mốc xe theo lịch</h3>
                          {metaError && (
                            <span className="text-xs text-red-600 font-semibold italic">
                              (Không tải được lịch chuyến)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          * = chạy 6 ngày/tuần, nghỉ Chủ nhật (theo cấu hình lịch chuyến). Hàng đến vào Chủ nhật hoặc sau chuyến cuối được tính vào chuyến đầu tiên liền kề có xe đi.
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="table-soft w-full min-w-[700px] text-left">
                          <thead>
                            <tr>
                              <th className="text-left">BCVH</th>
                              <th className="text-left">
                                GIỜ XUẤT PHÁT (LỊCH C2)
                                <div className="text-[11px] font-normal normal-case text-gray-500">
                                  mốc hàng phải đi
                                </div>
                              </th>
                              <th className="text-left">
                                HÀNG ĐẾN MUỘN NHẤT ĐỂ KỊP CHUYẾN
                                <div className="text-[11px] font-normal normal-case text-gray-500">
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
            </div>
          )}
        </div>
      )}

      {/* ── CÁCH XEM 2: CÓ TÍNH CHỈ TIÊU (XE CẤP 2) ─────────────────────────── */}
      {xemTheo === 'chi_tieu' && (
        <KttErrorBoundary>
          <KttCoTinhChiTieu
            dateRange={dateRange}
            selectedBcvh={selectedBcvh}
            authUser={authUser}
            meta={meta}
            onQuickRangeChange={handleQuickRangeChange}
            activeMoc={sharedMoc ?? 'A'}
            onActiveMocChange={setSharedMoc}
            unit={sharedUnit}
            onUnitChange={setSharedUnit}
            loaiNgay={sharedLoaiNgay}
            onLoaiNgayChange={setSharedLoaiNgay}
            selectedDuongThu={sharedSelectedDuongThu}
            onSelectedDuongThuChange={setSharedSelectedDuongThu}
          />
        </KttErrorBoundary>
      )}

      {/* ── CÁCH XEM 3: CHỈ XEM GIỜ ĐẾN TRONG NGÀY (KHÔNG TÍNH CHỈ TIÊU) ─────── */}
      {xemTheo === 'gio_den' && (
        <KttErrorBoundary>
          <KttGioDenTrongNgay
            dateRange={dateRange}
            selectedBcvh={selectedBcvh}
            authUser={authUser}
            meta={meta}
            onQuickRangeChange={handleQuickRangeChange}
            activeMoc={sharedMoc ?? 'B'}
            onActiveMocChange={setSharedMoc}
            unit={sharedUnit}
            onUnitChange={setSharedUnit}
            loaiNgay={sharedLoaiNgay}
            onLoaiNgayChange={setSharedLoaiNgay}
            selectedDuongThu={sharedSelectedDuongThu}
            onSelectedDuongThuChange={setSharedSelectedDuongThu}
          />
        </KttErrorBoundary>
      )}
    </div>
  );
}
