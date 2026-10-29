import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, RefreshCw, Clock, ListFilter, Download } from 'lucide-react';
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
  fetchKttDiCungNgayTongHop,
  fetchKttDiCungNgayTheoNgay,
  fetchKttDiCungNgayTheoGio,
  fetchKttRotLaiTheoDuongThu,
  downloadKttLuuThoat,
} from './kttApi';
import { getToken, decodeJwtPayload } from '../../utils/api';
import KttDanhSachDiNgay from './KttDanhSachDiNgay';

/**
 * Ngưỡng màu tỷ lệ đi cùng ngày:
 * - >= 60%: Xanh (#1F7A5C)
 * - 50% .. 60%: Vàng (#A87A12 / #E0A82E)
 * - < 50%: Đỏ (#B3202A)
 */
function getTyLeColorClass(val) {
  if (val === null || val === undefined || isNaN(val)) return 'text-gray-400';
  const num = Number(val);
  if (num >= 0.6) return 'text-[#1F7A5C]';
  if (num >= 0.5) return 'text-[#A87A12]';
  return 'text-[#B3202A]';
}

function getTyLeBgColorHex(val) {
  if (val === null || val === undefined || isNaN(val)) return '#D1D5DB';
  const num = Number(val);
  if (num >= 0.6) return '#1F7A5C';
  if (num >= 0.5) return '#E0A82E';
  return '#B3202A';
}

function getTyLeBorderColorClass(val) {
  if (val === null || val === undefined || isNaN(val)) return 'border-gray-200';
  const num = Number(val);
  if (num >= 0.6) return 'border-[#1F7A5C]';
  if (num >= 0.5) return 'border-[#E0A82E]';
  return 'border-[#B3202A]';
}

export default function KttDiCungNgay({ authUser }) {
  // Khoảng ngày: mặc định 30 ngày kết thúc ở ngày của độ mới dữ liệu
  const [dateRange, setDateRange] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // Meta dữ liệu (độ mới)
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Dữ liệu 4 endpoint
  const [tongHopData, setTongHopData] = useState(null);
  const [theoNgayData, setTheoNgayData] = useState(null);
  const [theoGioData, setTheoGioData] = useState(null);
  const [rotLaiData, setRotLaiData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Trạng thái bấm ô xem danh sách bưu gửi
  const [selectedCellFilter, setSelectedCellFilter] = useState(null);

  // Xuất Sheet 7 hàng rớt lại theo đường thư
  const [exportingNguon, setExportingNguon] = useState(null);
  const [rowExportError, setRowExportError] = useState(null);

  const reqIdRef = useRef(0);

  const userRole = authUser?.role || (() => {
    try {
      const t = getToken();
      return t ? decodeJwtPayload(t)?.role : null;
    } catch (e) {
      return null;
    }
  })();
  const canExport = userRole === 'ADMIN' || userRole === 'TTVH';

  const handleExportRowSheet7 = async (maNguon) => {
    if (exportingNguon !== null || !dateRange || !maNguon || maNguon === '__RONG__') return;
    setExportingNguon(maNguon);
    setRowExportError(null);

    try {
      const res = await downloadKttLuuThoat({
        tu: dateRange.from,
        den: dateRange.to,
        trang_thai: 'ro_lai',
        nguon: maNguon,
      });

      if (!res.ok) {
        const isTran = res.error && (res.error.includes('KTT_QUA_NHIEU_DONG') || res.error.includes('vượt giới hạn'));
        if (isTran) {
          setRowExportError({
            nguon: maNguon,
            message: 'Quá nhiều dòng (trần 200.000). Thu hẹp khoảng ngày.',
            canRetry: false,
          });
        } else {
          setRowExportError({
            nguon: maNguon,
            message: res.error || 'Có lỗi xảy ra khi tạo file.',
            canRetry: true,
          });
        }
      }
    } catch (e) {
      setRowExportError({
        nguon: maNguon,
        message: 'Lỗi kết nối khi tải file.',
        canRetry: true,
      });
    } finally {
      setExportingNguon(null);
    }
  };

  // 1. Tải meta lúc khởi tạo để tính khoảng 30 ngày mặc định
  useEffect(() => {
    let active = true;
    setMetaLoading(true);

    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setMeta(res.data);
          const rawLuc = res.data.nguon_xuat_luc_moi_nhat;
          const latestDay = (rawLuc && typeof rawLuc === 'string' && rawLuc.length >= 10)
            ? rawLuc.slice(0, 10)
            : getTodayVnYmd();
          setDateRange({
            from: shiftDay(latestDay, -29), // đúng 30 ngày kết thúc ở latestDay
            to: latestDay,
          });
        } else {
          const today = getTodayVnYmd();
          setDateRange({
            from: shiftDay(today, -29),
            to: today,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        const today = getTodayVnYmd();
        setDateRange({
          from: shiftDay(today, -29),
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

  // 2. Validate khoảng ngày (tối đa 31 ngày)
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return `Khoảng ngày tối đa 31 ngày (đang chọn ${days} ngày).`;
    return null;
  }, []);

  // 3. Tải song song 4 endpoint khi đổi khoảng ngày
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) return;

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [thRes, tnRes, tgRes, rlRes] = await Promise.all([
        fetchKttDiCungNgayTongHop({ tu: dateRange.from, den: dateRange.to }),
        fetchKttDiCungNgayTheoNgay({ tu: dateRange.from, den: dateRange.to }),
        fetchKttDiCungNgayTheoGio({ tu: dateRange.from, den: dateRange.to }),
        fetchKttRotLaiTheoDuongThu({ tu: dateRange.from, den: dateRange.to, top: 8 }),
      ]);

      if (reqIdRef.current !== reqId) return;

      if (!thRes.ok) throw new Error(thRes.error || 'Lỗi tải tổng hợp đi cùng ngày');
      if (!tnRes.ok) throw new Error(tnRes.error || 'Lỗi tải tỷ lệ theo ngày');
      if (!tgRes.ok) throw new Error(tgRes.error || 'Lỗi tải tỷ lệ theo giờ');
      if (!rlRes.ok) throw new Error(rlRes.error || 'Lỗi tải hàng rớt lại theo đường thư');

      setTongHopData(thRes.data);
      setTheoNgayData(tnRes.data);
      setTheoGioData(tgRes.data);
      setRotLaiData(rlRes.data);
    } catch (e) {
      if (reqIdRef.current === reqId) {
        setError(e.message || 'Lỗi kết nối khi tải số liệu đi cùng ngày.');
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
    setSelectedCellFilter(null);
    setDateRange(newRange);
  };

  // Trạng thái dữ liệu
  const isChuaCoDuLieu = tongHopData?.ly_do === 'CHUA_CO_DU_LIEU' || (!loading && tongHopData && !tongHopData.co_du_lieu);
  const cuaSo = tongHopData?.cua_so_thuc_te;
  const doMoi = tongHopData?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;

  // Khối B1 ba thẻ
  const ltBcvh = tongHopData?.lien_tinh_den_bcvh;
  const ntBcvhKhongHoan = tongHopData?.noi_tinh_den_bcvh?.khong_hang_hoan;
  const ntBcvhCoHoan = tongHopData?.noi_tinh_den_bcvh?.co_hang_hoan;
  const ntHangHoan = tongHopData?.noi_tinh_den_bcvh?.hang_hoan;
  const ntDiLienTinh = tongHopData?.noi_tinh_di_lien_tinh;

  // B2 theo ngày
  const theoNgayList = theoNgayData?.theo_ngay || [];
  const soSanhCn = theoNgayData?.so_sanh_chu_nhat;

  // B3 theo giờ
  const theoGioList = theoGioData?.theo_gio || [];
  const chia12h = theoGioData?.chia_12h;

  // Rớt lại
  const rotLaiDong = rotLaiData?.dong || [];
  const rotLaiTong = rotLaiData?.tong_lien_tinh_den_bcvh;

  return (
    <div className="space-y-5 px-6 pb-12 max-w-full min-w-0">
      {/* ── ĐẦU TRANG: TIÊU ĐỀ, PHẠM VI SỐ LIỆU & BỘ CHỌN NGÀY ────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hue-h1">
              B · Tỷ lệ đi cùng ngày
            </h1>
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
                · Phạm vi số liệu: <strong className="text-gray-700">{formatDdMmYyyy(cuaSo.tu_ngay)} – {formatDdMmYyyy(cuaSo.den_ngay)}</strong>
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
            idPrefix="ktt-b-ty-le"
          />
        </div>
      </div>

      {/* Cảnh báo validate ngày nếu chọn quá 31 ngày */}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 bg-white rounded-[14px] border border-gray-200" />
            ))}
          </div>
          <div className="h-24 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
        </div>
      )}

      {/* NỘI DUNG CHÍNH */}
      {tongHopData && !isChuaCoDuLieu && (
        <div className={`space-y-5 transition-opacity duration-200 min-w-0 max-w-full ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* ── 1. B1 BA THẺ TỔNG HỢP ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0 max-w-full">
            {/* Thẻ 1: Liên tỉnh đến → BCVH */}
            <div className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(ltBcvh?.ty_le?.cung_ngay)}`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Liên tỉnh đến → 6 BCVH Huế
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(ltBcvh?.ty_le?.cung_ngay)}`}>
                    {formatPercent(ltBcvh?.ty_le?.cung_ngay)}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Mẫu số: <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ltBcvh?.tong_shbg)}</strong> bưu gửi
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <div>
                  Hôm sau: <strong className="text-gray-800 font-bold tabular-nums">{formatPercent(ltBcvh?.ty_le?.hom_sau)}</strong>
                </div>
                <div>
                  Chưa đi &gt; 24h: <strong className="text-[#B3202A] font-bold tabular-nums">{formatPercent(ltBcvh?.ty_le?.chua_di_tren_24h)}</strong>
                </div>
              </div>
            </div>

            {/* Thẻ 2: Nội tỉnh → BCVH Huế */}
            <div className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(ntBcvhKhongHoan?.ty_le?.cung_ngay)}`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Nội tỉnh → 6 BCVH Huế (k.hàng hoàn)
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(ntBcvhKhongHoan?.ty_le?.cung_ngay)}`}>
                    {formatPercent(ntBcvhKhongHoan?.ty_le?.cung_ngay)}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Mẫu số: <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ntBcvhKhongHoan?.tong_shbg)}</strong> bưu gửi
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <div>
                  Hôm sau: <strong className="text-gray-800 font-bold tabular-nums">{formatPercent(ntBcvhKhongHoan?.ty_le?.hom_sau)}</strong>
                </div>
                <div>
                  Chưa đi &gt; 24h: <strong className="text-[#B3202A] font-bold tabular-nums">{formatPercent(ntBcvhKhongHoan?.ty_le?.chua_di_tren_24h)}</strong>
                </div>
              </div>
            </div>

            {/* Thẻ 3: Nội tỉnh → Liên tỉnh */}
            <div className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(ntDiLienTinh?.ty_le?.cung_ngay)}`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Nội tỉnh → Liên tỉnh (xe Cấp 1)
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(ntDiLienTinh?.ty_le?.cung_ngay)}`}>
                    {formatPercent(ntDiLienTinh?.ty_le?.cung_ngay)}
                  </div>
                  <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Mẫu số: <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ntDiLienTinh?.tong_shbg)}</strong> bưu gửi
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <div>
                  Hôm sau: <strong className="text-gray-800 font-bold tabular-nums">{formatPercent(ntDiLienTinh?.ty_le?.hom_sau)}</strong>
                </div>
                <div>
                  Chưa đi &gt; 24h: <strong className="text-[#B3202A] font-bold tabular-nums">{formatPercent(ntDiLienTinh?.ty_le?.chua_di_tren_24h)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. HỘP «NỘI TỈNH ĐI BCVH HUẾ: CÓ VÀ KHÔNG KỂ HÀNG HOÀN» ─────── */}
          <div className="bg-[#FAF5E8] rounded-[14px] p-4 border border-[#E4D5AE] text-xs space-y-2 min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-bold text-gray-800">
                Nội tỉnh đi BCVH Huế (có và không kể hàng hoàn Tổ KHHH):
              </span>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span>Không kể hàng hoàn: </span>
                  <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ntBcvhKhongHoan?.tong_shbg)}</strong> bưu gửi
                  <span className="mx-1">·</span>
                  <span>Cùng ngày: </span>
                  <strong className="font-bold tabular-nums text-gray-800">{formatPercent(ntBcvhKhongHoan?.ty_le?.cung_ngay)}</strong>
                </div>
                <div>
                  <span>Có hàng hoàn: </span>
                  <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ntBcvhCoHoan?.tong_shbg)}</strong> bưu gửi
                  <span className="mx-1">·</span>
                  <span>Cùng ngày: </span>
                  <strong className="font-bold tabular-nums text-gray-800">{formatPercent(ntBcvhCoHoan?.ty_le?.cung_ngay)}</strong>
                </div>
                {ntHangHoan && (
                  <div className="text-gray-600">
                    <span>Hàng hoàn KHHH (531120): </span>
                    <strong className="text-gray-800 font-bold tabular-nums">{formatInt(ntHangHoan?.tong_shbg)}</strong> bưu gửi
                    <span className="mx-1">·</span>
                    <strong className="font-bold tabular-nums text-gray-800">{formatPercent(ntHangHoan?.ty_le?.cung_ngay)}</strong>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-600 italic">
              * Hàng chuyển hoàn từ Tổ KHHH (531120) về Thuận Hóa được theo dõi riêng, không tính vào chỉ tiêu 14 giờ và không tính vào tỷ lệ chung.
            </p>
          </div>

          {/* ── 3. B2 CỘT TỶ LỆ ĐI CÙNG NGÀY TỪNG NGÀY ────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="ktt-h2 text-[17px]">
                  Tỷ lệ đi cùng ngày từng ngày (Hàng đi 6 BCVH Huế)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Màu theo ngưỡng: từ 60% xanh, 50–60% vàng, dưới 50% đỏ. Cột có viền tím là Chủ nhật.
                </p>
              </div>

              {soSanhCn && soSanhCn.chu_nhat?.so_ngay > 0 && soSanhCn.ngay_thuong?.so_ngay > 0 && (
                <div className="flex items-center gap-3 text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-[8px]">
                  <span>
                    Chủ nhật ({soSanhCn.chu_nhat.so_ngay} ngày):{' '}
                    <strong className="tabular-nums font-bold text-gray-800">
                      {formatPercent(soSanhCn.chu_nhat.ty_le_trung_binh_ngay)}
                    </strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>
                    Ngày thường ({soSanhCn.ngay_thuong.so_ngay} ngày):{' '}
                    <strong className="tabular-nums font-bold text-gray-800">
                      {formatPercent(soSanhCn.ngay_thuong.ty_le_trung_binh_ngay)}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Biểu đồ cột CSS */}
            {theoNgayList.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 italic">
                Không có dữ liệu trong khoảng ngày đã chọn.
              </div>
            ) : (
              <div className="mt-4 max-w-full">
                <div className="h-56 flex items-end gap-1.5 sm:gap-2 pb-2 pt-8 border-b border-gray-200 overflow-x-auto md:overflow-x-visible max-w-full">
                  {theoNgayList.map((d, dIdx) => {
                    const tyLe = d.bcvh_hue?.ty_le?.cung_ngay;
                    const pctVal = tyLe !== null && tyLe !== undefined ? Math.round(tyLe * 100) : null;
                    const heightPct = pctVal !== null ? Math.max(8, pctVal) : 0;
                    const barColor = getTyLeBgColorHex(tyLe);
                    const isSunday = d.chu_nhat;
                    const isTam = !d.da_chot;
                    const thuStr = getThuTiengViet(d.ngay);

                    // Nội dung tooltip chuẩn hóa
                    const tooltipText = `${formatDdMm(d.ngay)} (${thuStr}) · ${formatInt(d.bcvh_hue?.mau_so)} bưu gửi · đi cùng ngày ${formatPercent(tyLe)}${isSunday ? ' · Chủ nhật' : ''}${isTam ? ' · Số tạm' : ''}`;

                    return (
                      <div
                        key={d.ngay}
                        tabIndex={0}
                        role="img"
                        aria-label={tooltipText}
                        className="flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center group relative cursor-pointer focus:outline-none"
                      >
                        {/* Tooltip chung nền tối, chữ trắng */}
                        <div className={`opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity absolute bottom-full mb-2 z-50 pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap min-w-[130px] ${
                          dIdx <= 1 ? 'left-0' : (dIdx >= theoNgayList.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2')
                        }`}>
                          <div className="font-bold flex items-center justify-between gap-2 border-b border-gray-700 pb-1">
                            <span>{formatDdMmYyyy(d.ngay)} ({thuStr})</span>
                            {isSunday && <span className="text-purple-300 font-semibold">Chủ nhật</span>}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            <div>Mẫu số: <strong className="tabular-nums">{formatInt(d.bcvh_hue?.mau_so)}</strong> bưu gửi</div>
                            <div>Cùng ngày: <strong className="tabular-nums">{formatInt(d.bcvh_hue?.cung_ngay)}</strong></div>
                            <div>Tỷ lệ: <strong className="tabular-nums text-amber-300">{formatPercent(tyLe)}</strong></div>
                            {isTam && (
                              <div className="text-[#E0A82E] font-semibold text-[10px] pt-0.5">
                                * Số tạm (chưa chốt)
                              </div>
                            )}
                          </div>
                        </div>

                        {/* % trên đầu cột */}
                        <div className="text-[10px] font-bold tabular-nums text-gray-600 mb-1">
                          {pctVal !== null ? `${pctVal}%` : '–'}
                        </div>

                        {/* Thanh cột */}
                        <div
                          style={{
                            height: pctVal !== null ? `${heightPct}%` : '4px',
                            backgroundColor: barColor,
                          }}
                          className={`w-full rounded-t-[4px] transition-all group-focus:ring-2 group-focus:ring-[#4A1D6E] ${
                            isSunday ? 'ring-2 ring-[#4A1D6E] ring-offset-1' : ''
                          }`}
                        />

                        {/* Nhãn ngày dưới đáy */}
                        <div className="mt-2 text-[10px] font-semibold text-gray-500 tabular-nums whitespace-nowrap">
                          {formatDdMm(d.ngay)}
                        </div>
                        {isSunday && (
                          <span className="text-[9px] font-bold text-[#4A1D6E]">CN</span>
                        )}
                        {isTam && !isSunday && (
                          <span className="text-[9px] font-semibold text-[#A87A12]">tạm</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Chú giải chân biểu đồ */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 mt-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#1F7A5C]" />
                      <span>Từ 60% trở lên (Đạt)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#E0A82E]" />
                      <span>50% đến dưới 60%</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#B3202A]" />
                      <span>Dưới 50%</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-gray-300 ring-2 ring-[#4A1D6E]" />
                      <span>Chủ nhật (viền tím)</span>
                    </span>
                  </div>
                  <div className="italic text-gray-400">
                    Số bưu gửi đi 6 BCVH Huế (không kể hàng hoàn)
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 4. B3 CỘT XẾP CHỒNG THEO GIỜ HÀNG ĐẾN ───────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="ktt-h2 text-[17px]">
                  Phân bố tình trạng giao đi theo giờ hàng đến (Giờ quét túi đến)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cột xếp chồng 5 nhóm màu theo 24 giờ. Hàng dưới thể hiện % đi cùng ngày (đỏ khi &lt; 50%).
                </p>
              </div>

              {/* Tóm tắt trước 12h và từ 12h có tooltip giải nghĩa */}
              {chia12h && (
                <div
                  tabIndex={0}
                  role="note"
                  aria-label="Chia theo giờ quét túi đến: trước 12:00 và từ 12:00 trở đi"
                  title="Chia theo giờ quét túi đến: trước 12:00 và từ 12:00 trở đi"
                  className="flex items-center gap-3 text-xs bg-[#FAF5E8] border border-[#E4D5AE] px-3 py-1.5 rounded-[8px] cursor-help"
                >
                  <span>
                    Trước 12h: <strong className="tabular-nums font-bold text-gray-800">{formatPercent(chia12h.truoc_12h?.ty_le?.cung_ngay)}</strong> ({formatInt(chia12h.truoc_12h?.mau_so)} bưu gửi)
                  </span>
                  <span className="text-amber-300">|</span>
                  <span>
                    Từ 12h: <strong className={`tabular-nums font-bold ${chia12h.tu_12h?.ty_le?.cung_ngay < 0.5 ? 'text-[#B3202A]' : 'text-gray-800'}`}>{formatPercent(chia12h.tu_12h?.ty_le?.cung_ngay)}</strong> ({formatInt(chia12h.tu_12h?.mau_so)} bưu gửi)
                  </span>
                </div>
              )}
            </div>

            {/* 24 cột giờ */}
            <div className="mt-4 max-w-full">
              <div className="h-56 flex items-end gap-1 sm:gap-1.5 pb-2 pt-8 border-b border-gray-200 overflow-x-auto md:overflow-x-visible max-w-full">
                {theoGioList.map((g) => {
                  const mau = g.mau_so || 0;
                  const c1 = g.cung_ngay || 0;
                  const c2 = g.hom_sau || 0;
                  const c3 = g.tu_2_ngay || 0;
                  const c4 = g.chua_di_duoi_24h || 0;
                  const c5 = g.chua_di_tren_24h || 0;
                  const tyLe = g.ty_le?.cung_ngay;

                  // Tính tỷ lệ chiều cao tương đối dựa trên mẫu số của giờ cao nhất
                  const maxMau = Math.max(...theoGioList.map((x) => x.mau_so || 0), 1);
                  const totalBarHeightPct = mau > 0 ? Math.max(10, Math.round((mau / maxMau) * 100)) : 0;

                  const summaryTip = mau > 0
                    ? `Giờ ${g.gio} (quét túi đến) · Tổng ${formatInt(mau)} bưu gửi · Đi cùng ngày ${formatPercent(tyLe)}`
                    : `Giờ ${g.gio}: không có bưu gửi`;

                  return (
                    <div
                      key={g.gio}
                      tabIndex={0}
                      role="img"
                      aria-label={summaryTip}
                      className="flex-1 min-w-[20px] md:min-w-0 h-full flex flex-col justify-end items-center relative group cursor-pointer focus:outline-none"
                    >
                      {/* Tooltip lớn bao quát 5 nhóm cho cả giờ (phủ toàn bộ chiều cao cột) */}
                      <div
                        className={`opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity absolute bottom-full mb-2 z-50 pointer-events-none bg-gray-900 text-white rounded-lg p-2.5 shadow-xl text-[11px] whitespace-nowrap min-w-[215px] ${
                          g.gio <= 3 ? 'left-0' : (g.gio >= 18 ? 'right-0' : 'left-1/2 -translate-x-1/2')
                        }`}
                      >
                        {mau === 0 ? (
                          <div className="font-semibold text-gray-200">
                            Giờ {g.gio}: không có bưu gửi
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-3">
                              <span className="text-white">Giờ {g.gio} (quét túi đến)</span>
                              <span className="text-gray-300 font-normal">
                                Tổng: <strong className="text-white font-bold tabular-nums">{formatInt(mau)}</strong> bưu gửi
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#1F7A5C] shrink-0" />
                                  <span>Đi cùng ngày</span>
                                </span>
                                <span className="tabular-nums font-semibold text-emerald-300">
                                  {c1 > 0 ? `${formatInt(c1)} bưu gửi (${formatPercent(g.ty_le?.cung_ngay)})` : '0'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#B79BCB] shrink-0" />
                                  <span>Hôm sau</span>
                                </span>
                                <span className="tabular-nums font-semibold text-purple-200">
                                  {c2 > 0 ? `${formatInt(c2)} bưu gửi (${formatPercent(g.ty_le?.hom_sau)})` : '0'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#E0A82E] shrink-0" />
                                  <span>Từ 2 ngày</span>
                                </span>
                                <span className="tabular-nums font-semibold text-amber-300">
                                  {c3 > 0 ? `${formatInt(c3)} bưu gửi (${formatPercent(g.ty_le?.tu_2_ngay)})` : '0'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#9CA3AF] shrink-0" />
                                  <span>Chưa đi dưới 24 giờ</span>
                                </span>
                                <span className="tabular-nums font-semibold text-gray-300">
                                  {c4 > 0 ? `${formatInt(c4)} bưu gửi (${formatPercent(mau > 0 ? c4 / mau : 0)})` : '0'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-gray-200">
                                  <span className="w-2.5 h-2.5 rounded-xs bg-[#B3202A] shrink-0" />
                                  <span>Chưa đi trên 24 giờ</span>
                                </span>
                                <span className="tabular-nums font-semibold text-red-300">
                                  {c5 > 0 ? `${formatInt(c5)} bưu gửi (${formatPercent(g.ty_le?.chua_di_tren_24h)})` : '0'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Số bưu gửi trên cột */}
                      <div className="text-[10px] font-bold tabular-nums text-gray-500 mb-1 pointer-events-none">
                        {mau > 0 ? formatInt(mau) : ''}
                      </div>

                      {/* Cột xếp chồng 5 nhóm màu */}
                      <div
                        style={{ height: `${totalBarHeightPct}%` }}
                        className="w-full flex flex-col-reverse rounded-t-[3px] overflow-hidden bg-gray-100 pointer-events-none"
                      >
                        {mau > 0 ? (
                          <>
                            {c1 > 0 && (
                              <div
                                style={{ height: `${(c1 / mau) * 100}%` }}
                                className="bg-[#1F7A5C] w-full"
                              />
                            )}
                            {c2 > 0 && (
                              <div
                                style={{ height: `${(c2 / mau) * 100}%` }}
                                className="bg-[#B79BCB] w-full"
                              />
                            )}
                            {c3 > 0 && (
                              <div
                                style={{ height: `${(c3 / mau) * 100}%` }}
                                className="bg-[#E0A82E] w-full"
                              />
                            )}
                            {c4 > 0 && (
                              <div
                                style={{ height: `${(c4 / mau) * 100}%` }}
                                className="bg-[#9CA3AF] w-full"
                              />
                            )}
                            {c5 > 0 && (
                              <div
                                style={{ height: `${(c5 / mau) * 100}%` }}
                                className="bg-[#B3202A] w-full"
                              />
                            )}
                          </>
                        ) : (
                          <div className="h-[2px] bg-gray-200 w-full" />
                        )}
                      </div>

                      {/* Nhãn giờ */}
                      <div className="mt-2 text-[10px] font-medium text-gray-600 tabular-nums pointer-events-none">
                        {g.gio}h
                      </div>

                      {/* Hàng % đi cùng ngày dưới trục giờ */}
                      <div
                        className={`mt-1 text-[10px] font-bold tabular-nums pointer-events-none ${
                          tyLe === null || tyLe === undefined ? 'text-gray-400' : (tyLe < 0.5 ? 'text-[#B3202A]' : 'text-gray-700')
                        }`}
                      >
                        <span>{formatPercent(tyLe)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chú giải 5 nhóm màu */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 mt-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#1F7A5C]" />
                    <span>Đi cùng ngày</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#B79BCB]" />
                    <span>Hôm sau</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#E0A82E]" />
                    <span>Từ 2 ngày</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#9CA3AF]" />
                    <span>Chưa đi &lt; 24h</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#B3202A]" />
                    <span>Chưa đi &gt; 24h</span>
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 italic">
                  Hàng dưới cùng: % đi cùng ngày (đỏ khi dưới 50%)
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. HÀNG RỚT LẠI: TỪ ĐƯỜNG THƯ NÀO ───────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="ktt-h2 text-[17px]">
                  Hàng rớt lại: từ đường thư nào (Xe Cấp 1 đến → 6 BCVH Huế)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bảng 8 đường thư Cấp 1 lớn nhất có hàng rớt lại. Bấm số/tỷ lệ ở cột «Hôm sau» hoặc «Chưa đi &gt; 24h» để xem danh sách bưu gửi.
                </p>
              </div>

              {rotLaiTong && (
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-[8px]">
                  Tổng Cấp 1: <strong className="font-bold tabular-nums text-gray-800">{formatInt(rotLaiTong.tong_shbg)}</strong> bưu gửi
                  <span className="mx-1">·</span>
                  Rớt lại: <strong className="font-bold tabular-nums text-[#B3202A]">{formatInt(rotLaiTong.ro_lai)}</strong> ({formatPercent(rotLaiTong.ty_le?.ro_lai)})
                </div>
              )}
            </div>

            {/* Thẻ 3 nhóm rớt lại nếu có số liệu từ API */}
            {rotLaiTong && (
              <div className="my-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-3 border-t-[#B79BCB] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">3 · Đi hôm sau</div>
                    <div className="text-base font-bold text-[#4A1D6E] mt-1 tabular-nums">
                      {formatInt(rotLaiTong.hom_sau)} <span className="text-xs font-normal text-gray-500">({formatPercent(rotLaiTong.ty_le?.hom_sau)})</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-3 border-t-[#E0A82E] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">4 · Từ 2 ngày</div>
                    <div className="text-base font-bold text-[#A87A12] mt-1 tabular-nums">
                      {formatInt(rotLaiTong.tu_2_ngay)} <span className="text-xs font-normal text-gray-500">({formatPercent(rotLaiTong.ty_le?.tu_2_ngay)})</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAF5E8] rounded-[10px] border-t-3 border-t-[#B3202A] text-xs">
                    <div className="text-[11px] font-bold text-gray-600">5 · Chưa đi &gt; 24 giờ</div>
                    <div className="text-base font-bold text-[#B3202A] mt-1 tabular-nums">
                      {formatInt(rotLaiTong.chua_di_tren_24h)} <span className="text-xs font-normal text-gray-500">({formatPercent(rotLaiTong.ty_le?.chua_di_tren_24h)})</span>
                    </div>
                  </div>
                </div>

                {/* Dòng chú thích thẻ rớt lại theo yêu cầu KTT-13b2 mục 7 */}
                <div className="mt-2 text-[11px] text-gray-500 italic">
                  * Số «Rớt lại» còn gồm hàng chưa đi dưới 24 giờ (chưa quá hạn xe)
                  {rotLaiTong.chua_di_duoi_24h !== undefined ? `: ${formatInt(rotLaiTong.chua_di_duoi_24h)} bưu gửi (${formatPercent(rotLaiTong.ty_le?.chua_di_duoi_24h)})` : ''}.
                </div>
              </div>
            )}

            {/* Bảng danh sách đường thư */}
            {rotLaiDong.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">
                Không có dữ liệu đường thư rớt lại trong khoảng đã chọn.
              </div>
            ) : (
              <>
                {/* Lỗi xuất Sheet 7 theo dòng */}
                {rowExportError && (
                <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2 mt-3 mb-2">
                  <div>
                    <strong>Lỗi xuất đường thư {rowExportError.nguon}:</strong> {rowExportError.message}
                  </div>
                  <div className="flex items-center gap-2">
                    {rowExportError.canRetry && (
                      <button
                        type="button"
                        onClick={() => handleExportRowSheet7(rowExportError.nguon)}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Thử lại
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRowExportError(null)}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-red-300 rounded text-red-700 text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto max-w-full mt-3">
                <table className="table-soft w-full min-w-[960px] text-left text-xs">
                  <thead>
                    <tr>
                      <th>ĐƯỜNG THƯ ĐẾN</th>
                      <th className="text-right">BƯU GỬI</th>
                      <th className="text-right">RỚT LẠI</th>
                      <th className="text-right">% RỚT LẠI</th>
                      <th className="text-right bg-purple-50/50 min-w-[125px] whitespace-nowrap">HÔM SAU</th>
                      <th className="text-right min-w-[100px] whitespace-nowrap">TỪ 2 NGÀY</th>
                      <th className="text-right bg-red-50/50 min-w-[145px] whitespace-nowrap">CHƯA ĐI &gt; 24H</th>
                      <th className="text-right">KHỐI LƯỢNG</th>
                      <th>ĐÍCH CHÍNH</th>
                      <th className="text-center w-20">DANH SÁCH</th>
                      {canExport && <th className="text-center w-36">XUẤT SHEET 7</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rotLaiDong.map((r) => {
                      const dtMa = r.duong_thu_ma ? r.duong_thu_ma : '__RONG__';
                      const dtTen = r.duong_thu_ten;
                      const roLaiPct = r.ty_le?.ro_lai || 0;
                      const isSelected = selectedCellFilter?.duongThu === dtMa;
                      const roLaiBarTip = `${formatInt(r.ro_lai)} rớt lại trên ${formatInt(r.tong_shbg)} bưu gửi (${formatPercent(r.ty_le?.ro_lai)})`;

                      return (
                        <tr
                          key={dtMa || 'khong-ro'}
                          className={`hover:bg-amber-50/40 transition-colors ${isSelected ? 'bg-amber-50/60 font-semibold' : ''}`}
                        >
                          <td className="font-medium text-gray-800">
                            <div>{dtTen || '(chưa có tên)'}</div>
                            {r.duong_thu_ma && <div className="text-[10px] text-gray-400 font-mono">{r.duong_thu_ma}</div>}
                          </td>
                          <td className="text-right tabular-nums font-semibold text-gray-800">
                            {formatInt(r.tong_shbg)}
                          </td>
                          <td className="text-right tabular-nums">
                            <div
                              tabIndex={0}
                              role="img"
                              aria-label={roLaiBarTip}
                              className="flex items-center justify-end gap-1.5 cursor-pointer group relative focus:outline-none"
                            >
                              <span className="font-bold text-[#B3202A]">{formatInt(r.ro_lai)}</span>
                              <div className="w-12 h-2 rounded bg-gray-200 overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(100, Math.round(roLaiPct * 100))}%` }}
                                  className="h-full bg-[#B3202A]"
                                />
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity absolute bottom-full mb-1 right-0 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                {roLaiBarTip}
                              </div>
                            </div>
                          </td>
                          <td className="text-right tabular-nums font-bold text-[#B3202A]">
                            {formatPercent(r.ty_le?.ro_lai)}
                          </td>

                          {/* Ô Hôm sau - BẤM ĐƯỢC */}
                          <td className="text-right tabular-nums bg-purple-50/40 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedCellFilter({
                                duongThu: dtMa,
                                duongThuTen: dtTen,
                                initialLoai: 'hom-sau',
                                huong: 'lien_tinh_den_bcvh',
                                title: `Đường thư ${dtTen || dtMa || '(không có mã)'} · Hôm sau`,
                              })}
                              className="font-bold text-[#4A1D6E] hover:underline cursor-pointer inline-flex items-center gap-1 py-0.5 px-1 rounded hover:bg-purple-100 whitespace-nowrap"
                              title="Bấm xem danh sách bưu gửi hôm sau"
                            >
                              {r.ty_le?.hom_sau === null || r.ty_le?.hom_sau === undefined ? (
                                <span>—</span>
                              ) : (
                                <>
                                  <span>{formatInt(r.hom_sau)}</span>
                                  <span className="text-[10px] text-purple-600 font-normal">({formatPercent(r.ty_le.hom_sau)})</span>
                                </>
                              )}
                            </button>
                          </td>

                          <td className="text-right tabular-nums text-gray-700 whitespace-nowrap">
                            {r.ty_le?.tu_2_ngay === null || r.ty_le?.tu_2_ngay === undefined ? (
                              <span>—</span>
                            ) : (
                              <>
                                <span>{formatInt(r.tu_2_ngay)}</span>
                                <span className="text-[10px] text-gray-400 font-normal">({formatPercent(r.ty_le.tu_2_ngay)})</span>
                              </>
                            )}
                          </td>

                          {/* Ô Chưa đi > 24h - BẤM ĐƯỢC */}
                          <td className="text-right tabular-nums bg-red-50/40 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedCellFilter({
                                duongThu: dtMa,
                                duongThuTen: dtTen,
                                initialLoai: 'chua-di-24h',
                                huong: 'lien_tinh_den_bcvh',
                                title: `Đường thư ${dtTen || dtMa || '(không có mã)'} · Chưa đi > 24h`,
                              })}
                              className="font-bold text-[#B3202A] hover:underline cursor-pointer inline-flex items-center gap-1 py-0.5 px-1 rounded hover:bg-red-100 whitespace-nowrap"
                              title="Bấm xem danh sách bưu gửi chưa đi > 24 giờ"
                            >
                              {r.ty_le?.chua_di_tren_24h === null || r.ty_le?.chua_di_tren_24h === undefined ? (
                                <span>—</span>
                              ) : (
                                <>
                                  <span>{formatInt(r.chua_di_tren_24h)}</span>
                                  <span className="text-[10px] text-red-600 font-normal">({formatPercent(r.ty_le.chua_di_tren_24h)})</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* Cột khối lượng: chỉ khi có kg thật từ API, ngược lại «–» */}
                          <td className="text-right tabular-nums text-gray-700">
                            {r.kg && r.kg > 0 ? formatKg(r.kg, { withUnit: true }) : '—'}
                          </td>

                          {/* Đích chính: 2 BCVH nhận nhiều nhất */}
                          <td className="text-gray-600 text-[11px]">
                            {r.dich_chinh && r.dich_chinh.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {r.dich_chinh.map((d) => (
                                  <span key={d.ma_bcvh}>
                                    {d.ma_bcvh}: <strong className="text-gray-800">{formatPercent(d.ty_le)}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : '—'}
                          </td>

                          {/* Cột danh sách */}
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedCellFilter({
                                duongThu: dtMa,
                                duongThuTen: dtTen,
                                initialLoai: 'hom-sau',
                                huong: 'lien_tinh_den_bcvh',
                                title: `Đường thư ${dtTen || dtMa || '(không có mã)'}`,
                              })}
                              className="px-2 py-1 rounded text-[11px] font-bold bg-[#FAF5E8] border border-[#E4D5AE] text-[#5A4A62] hover:bg-amber-100 cursor-pointer flex items-center justify-center gap-1 mx-auto"
                              title="Xem danh sách chi tiết"
                            >
                              <ListFilter className="w-3 h-3" />
                              <span>Xem</span>
                            </button>
                          </td>

                          {/* Cột xuất Sheet 7 cho dòng rớt lại */}
                          {canExport && (
                            <td className="text-center">
                              {(!r.duong_thu_ma || r.duong_thu_ma === '__RONG__') ? (
                                <span className="text-[10px] text-gray-400 italic">
                                  Không xuất theo đường thư cho nhóm không có mã
                                </span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleExportRowSheet7(r.duong_thu_ma)}
                                    disabled={exportingNguon !== null}
                                    className="btn-primary px-2.5 py-1 rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={`Xuất file Excel Sheet 7 (Hàng rớt lại) cho đường thư ${r.duong_thu_ma}`}
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>{exportingNguon === r.duong_thu_ma ? 'Đang tạo file…' : 'Xuất xlsx · Sheet 7'}</span>
                                  </button>
                                  <span className="text-[10px] text-gray-500 font-medium tabular-nums">
                                    {formatInt(r.ro_lai)} dòng
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>

          {/* ── 6. DANH SÁCH BẤM Ô NẰM NGAY DƯỚI ───────────────────────────── */}
          {selectedCellFilter && (
            <KttDanhSachDiNgay
              authUser={authUser}
              tu={dateRange.from}
              den={dateRange.to}
              initialLoai={selectedCellFilter.initialLoai || 'hom-sau'}
              duongThu={selectedCellFilter.duongThu}
              duongThuTen={selectedCellFilter.duongThuTen}
              noiGui={selectedCellFilter.noiGui}
              noiGuiTen={selectedCellFilter.noiGuiTen}
              huong={selectedCellFilter.huong}
              hangHoan={selectedCellFilter.hangHoan}
              maBcvh={selectedCellFilter.maBcvh}
              title={selectedCellFilter.title}
              onClose={() => setSelectedCellFilter(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
