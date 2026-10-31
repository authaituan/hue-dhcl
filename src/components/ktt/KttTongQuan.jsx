import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowRight,
  TrendingUp,
  Truck,
  Layers,
  Activity,
} from 'lucide-react';
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
  formatDecimal,
  getThuTiengViet,
  formatDateTimeWithoutSeconds,
} from './kttFormatters';
import { fetchKttMeta, fetchKttTongQuan } from './kttApi';
import KttTooltip from './KttTooltip';

/**
 * Ngưỡng màu tỷ lệ đi cùng ngày:
 * >= 60%: Xanh (#1F7A5C)
 * 50% .. 60%: Vàng (#A87A12 / #E0A82E)
 * < 50%: Đỏ (#B3202A)
 */
function getTyLeColorClass(val) {
  if (val === null || val === undefined || isNaN(val)) return 'text-gray-400';
  const num = Number(val);
  if (num >= 0.6) return 'text-[#1F7A5C]';
  if (num >= 0.5) return 'text-[#A87A12]';
  return 'text-[#B3202A]';
}

function getTyLeBorderColorClass(val) {
  if (val === null || val === undefined || isNaN(val)) return 'border-gray-200';
  const num = Number(val);
  if (num >= 0.6) return 'border-[#1F7A5C]';
  if (num >= 0.5) return 'border-[#E0A82E]';
  return 'border-[#B3202A]';
}

function getTyLeBgColorHex(val) {
  if (val === null || val === undefined || isNaN(val)) return '#D1D5DB';
  const num = Number(val);
  if (num >= 0.6) return '#1F7A5C';
  if (num >= 0.5) return '#E0A82E';
  return '#B3202A';
}

export default function KttTongQuan({ authUser, onNavigateTab }) {
  // Khoảng ngày: mặc định 30 ngày kết thúc ở ngày của độ mới dữ liệu
  const [dateRange, setDateRange] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // Meta dữ liệu (độ mới, cấu hình F1.3, hạn trước chuyến)
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Dữ liệu Tổng quan
  const [tongQuanData, setTongQuanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Chống stale request
  const reqIdRef = useRef(0);

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
          const latestDay =
            rawLuc && typeof rawLuc === 'string' && rawLuc.length >= 10
              ? rawLuc.slice(0, 10)
              : getTodayVnYmd();
          setDateRange({
            from: shiftDay(latestDay, -29), // đúng 30 ngày inclusive
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

  // 2. Kiểm tra khoảng ngày (tối đa 31 ngày)
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return `Khoảng ngày tối đa 31 ngày (đang chọn ${days} ngày).`;
    return null;
  }, []);

  // 3. Tải dữ liệu Tổng quan
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) return;

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchKttTongQuan({ tu: dateRange.from, den: dateRange.to });

      if (reqIdRef.current !== reqId) return;

      if (!res.ok) throw new Error(res.error || 'Lỗi tải dữ liệu tổng quan');
      setTongQuanData(res.data);
    } catch (e) {
      if (reqIdRef.current === reqId) {
        setError(e.message || 'Lỗi kết nối khi tải số liệu tổng quan.');
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
    tongQuanData?.ly_do === 'CHUA_CO_DU_LIEU' ||
    (!loading && tongQuanData && !tongQuanData.co_du_lieu);
  const cuaSo = tongQuanData?.cua_so_thuc_te;
  const doMoi = tongQuanData?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;
  const hangHoanChuaNap = tongQuanData?.hang_hoan_chua_nap ?? meta?.hang_hoan_chua_nap;
  const hangHoanNguonXuatLuc = tongQuanData?.hang_hoan_nguon_xuat_luc || meta?.hang_hoan_nguon_xuat_luc;

  // Dữ liệu Điểm chính (3 thẻ B1)
  const the = tongQuanData?.di_cung_ngay?.the;
  const ltBcvh = the?.lien_tinh_den_bcvh;
  const ntBcvhKhongHoan = the?.noi_tinh_den_bcvh?.khong_hang_hoan;
  const ntDiLienTinh = the?.noi_tinh_di_lien_tinh;

  // B2 theo ngày rút gọn
  const theoNgayList = tongQuanData?.di_cung_ngay?.theo_ngay || [];

  // Danh sách cảnh báo từ API
  const canhBaoList = tongQuanData?.canh_bao || [];

  return (
    <div className="space-y-6 px-6 pb-12 max-w-full min-w-0">
      {/* ── ĐẦU TRANG: TIÊU ĐỀ, PHẠM VI SỐ LIỆU & BỘ CHỌN NGÀY ────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hue-h1">Tổng quan · Hàng tại KTT</h1>
            {doMoi && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Dữ liệu đến lúc {formatDateTimeWithoutSeconds(doMoi)}
              </span>
            )}
            {hangHoanChuaNap ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <Clock className="w-3 h-3 text-amber-600" />
                Chưa nạp danh sách hàng hoàn; số hoàn = 0 chưa đúng
              </span>
            ) : hangHoanNguonXuatLuc ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Danh sách hoàn cập nhật lúc {formatDateTimeWithoutSeconds(hangHoanNguonXuatLuc)}
              </span>
            ) : null}
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
            idPrefix="ktt-tong-quan"
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
      {loading && tongQuanData && (
        <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs font-semibold text-[#5A4A62]">
          <span className="w-2 h-2 rounded-full bg-[#1F7A5C] animate-ping" />
          <span>Đang tính số liệu…</span>
        </div>
      )}

      {/* Khung xương khi tải lần đầu */}
      {(!dateRange || metaLoading || (loading && !tongQuanData)) && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-[14px] border border-gray-200" />
            ))}
          </div>
          <div className="h-44 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
        </div>
      )}

      {/* NỘI DUNG CHÍNH */}
      {tongQuanData && !isChuaCoDuLieu && (
        <div
          className={`space-y-6 transition-opacity duration-200 min-w-0 max-w-full ${
            loading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {/* ── 1. BA HỘP: NGUỒN SỐ LIỆU / CÁCH ĐỌC / ĐƠN VỊ ĐẾM ────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0 max-w-full">
            {/* Hộp 1: Nguồn số liệu */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                <Activity className="w-4 h-4 text-[#1F7A5C]" />
                <span>Nguồn số liệu</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Hệ thống nạp tự động từ cơ sở dữ liệu Trung tâm Khai thác Huế (530100). Dữ liệu được
                tổng hợp đồng nhất cho mọi phân hệ.
              </p>
              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                <div>
                  Độ mới:{' '}
                  <strong className="text-gray-800">
                    {formatDateTimeWithoutSeconds(doMoi)}
                  </strong>
                </div>
                {cuaSo?.tu_ngay && cuaSo?.den_ngay && (
                  <div>
                    Phạm vi thực tế:{' '}
                    <strong className="text-gray-800">
                      {formatDdMmYyyy(cuaSo.tu_ngay)} – {formatDdMmYyyy(cuaSo.den_ngay)}
                    </strong>
                    {cuaSo.so_ngay_co_du_lieu ? ` (${cuaSo.so_ngay_co_du_lieu} ngày có số)` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Hộp 2: Cách đọc */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                <Info className="w-4 h-4 text-[#A87A12]" />
                <span>Cách đọc số liệu</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong>Đi cùng ngày:</strong> Bưu gửi có giờ lập BD10 đi trước 24:00 của ngày đến
                KTT. Hàng rớt lại gồm: đi hôm sau, đi từ 2 ngày trở lên, hoặc chưa đi quá 24 giờ.
              </p>
              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                Hàng chuyển hoàn được tách riêng, không cộng vào tổng và tỷ lệ chung để đảm bảo
                phản ánh đúng chất lượng điều hành.
              </div>
            </div>

            {/* Hộp 3: Đơn vị đếm & Chỉ tiêu */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                <Layers className="w-4 h-4 text-[#4A1D6E]" />
                <span>Đơn vị đếm & Chỉ tiêu</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Đơn vị tính là bưu gửi (SHBG) duy nhất theo từng ngày đến và chuyến xe (BD10).
              </p>
              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
                <div>
                  Chỉ tiêu F1.3:{' '}
                  <strong className="text-gray-800">
                    {meta?.chi_tieu_f13_gio !== undefined ? meta.chi_tieu_f13_gio : 14} giờ
                  </strong>{' '}
                  (Thuận Hóa / Phú Xuân:{' '}
                  <strong className="text-gray-800">
                    {meta?.chi_tieu_f13_gio_thuan_hoa_phu_xuan !== undefined
                      ? meta.chi_tieu_f13_gio_thuan_hoa_phu_xuan
                      : 12}{' '}
                    giờ
                  </strong>
                  )
                </div>
                <div>
                  Hạn đến trước chuyến:{' '}
                  <strong className="text-gray-800">
                    {meta?.han_den_truoc_chuyen_phut !== undefined
                      ? meta.han_den_truoc_chuyen_phut
                      : 60}{' '}
                    phút
                  </strong>{' '}
                  theo lịch C2.
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. ĐIỂM CHÍNH: BA THẺ NHƯ B1 VÀ CỘT B2 TỪNG NGÀY ───────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="hue-h2 text-base font-bold text-gray-900">
                  Điểm chính · Tỷ lệ đi cùng ngày
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Đồng nhất hoàn toàn với số liệu trang B · Tỷ lệ đi cùng ngày trong cùng khoảng
                  thời gian.
                </p>
              </div>
            </div>

            {/* 3 thẻ điểm chính */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0 max-w-full">
              {/* Thẻ 1: Liên tỉnh đến → BCVH */}
              <div
                className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(
                  ltBcvh?.ty_le?.cung_ngay
                )}`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Liên tỉnh đến → 6 BCVH Huế
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div
                      className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(
                        ltBcvh?.ty_le?.cung_ngay
                      )}`}
                    >
                      {formatPercent(ltBcvh?.ty_le?.cung_ngay)}
                    </div>
                    <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Mẫu số:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatInt(ltBcvh?.tong_shbg)}
                    </strong>{' '}
                    bưu gửi
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <div>
                    Hôm sau:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatPercent(ltBcvh?.ty_le?.hom_sau)}
                    </strong>
                  </div>
                  <div>
                    Chưa đi &gt; 24h:{' '}
                    <strong className="text-[#B3202A] font-bold tabular-nums">
                      {formatPercent(ltBcvh?.ty_le?.chua_di_tren_24h)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Thẻ 2: Nội tỉnh → BCVH */}
              <div
                className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(
                  ntBcvhKhongHoan?.ty_le?.cung_ngay
                )}`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Nội tỉnh → 6 BCVH Huế (k.hàng hoàn)
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div
                      className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(
                        ntBcvhKhongHoan?.ty_le?.cung_ngay
                      )}`}
                    >
                      {formatPercent(ntBcvhKhongHoan?.ty_le?.cung_ngay)}
                    </div>
                    <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Mẫu số:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatInt(ntBcvhKhongHoan?.tong_shbg)}
                    </strong>{' '}
                    bưu gửi
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <div>
                    Hôm sau:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatPercent(ntBcvhKhongHoan?.ty_le?.hom_sau)}
                    </strong>
                  </div>
                  <div>
                    Chưa đi &gt; 24h:{' '}
                    <strong className="text-[#B3202A] font-bold tabular-nums">
                      {formatPercent(ntBcvhKhongHoan?.ty_le?.chua_di_tren_24h)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Thẻ 3: Nội tỉnh → Liên tỉnh */}
              <div
                className={`bg-white rounded-[14px] p-5 border shadow-none flex flex-col justify-between min-w-0 ${getTyLeBorderColorClass(
                  ntDiLienTinh?.ty_le?.cung_ngay
                )}`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Nội tỉnh → Liên tỉnh (xe Cấp 1)
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div
                      className={`text-3xl font-extrabold tabular-nums ${getTyLeColorClass(
                        ntDiLienTinh?.ty_le?.cung_ngay
                      )}`}
                    >
                      {formatPercent(ntDiLienTinh?.ty_le?.cung_ngay)}
                    </div>
                    <span className="text-xs font-semibold text-gray-500">cùng ngày</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Mẫu số:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatInt(ntDiLienTinh?.tong_shbg)}
                    </strong>{' '}
                    bưu gửi
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <div>
                    Hôm sau:{' '}
                    <strong className="text-gray-800 font-bold tabular-nums">
                      {formatPercent(ntDiLienTinh?.ty_le?.hom_sau)}
                    </strong>
                  </div>
                  <div>
                    Rớt lại:{' '}
                    <strong className="text-[#B3202A] font-bold tabular-nums">
                      {formatPercent(ntDiLienTinh?.ty_le?.ro_lai)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột B2 từng ngày */}
            {theoNgayList.length > 0 && (
              <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Diễn biến tỷ lệ đi cùng ngày tới 6 BCVH theo ngày
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1F7A5C]" />
                      <span>≥ 60%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E0A82E]" />
                      <span>50% – 60%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#B3202A]" />
                      <span>&lt; 50%</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 max-w-full">
                  <div className="h-56 flex items-end gap-1.5 sm:gap-2 pb-2 pt-8 border-b border-gray-200 overflow-x-auto md:overflow-x-visible max-w-full">
                    {theoNgayList.map((d) => {
                      const rate = d.ty_le_cung_ngay;
                      const pctVal = rate !== null && rate !== undefined && !isNaN(rate) ? Math.round(rate * 100) : null;
                      const barPercent = pctVal !== null ? Math.max(6, Math.min(100, pctVal)) : 4;
                      const thu = getThuTiengViet(d.ngay);
                      const isSunday = d.chu_nhat;
                      const isChuaChot = !d.da_chot;

                      const tooltipAria = `${formatDdMm(d.ngay)} (${thu}) · ${formatInt(d.mau_so)} bưu gửi · đi cùng ngày ${formatPercent(rate)}${isSunday ? ' · Chủ nhật' : ''}${isChuaChot ? ' · Số tạm' : ''}`;

                      const tooltipContent = (
                        <div className="space-y-1">
                          <div className="font-bold flex items-center justify-between gap-3 border-b border-gray-700 pb-1">
                            <span>{formatDdMmYyyy(d.ngay)} ({thu})</span>
                            {isSunday && <span className="text-purple-300 font-semibold">Chủ nhật</span>}
                          </div>
                          <div className="space-y-0.5 text-gray-200">
                            <div>
                              Mẫu số: <strong className="text-white tabular-nums">{formatInt(d.mau_so)}</strong> bưu gửi
                            </div>
                            <div>
                              Cùng ngày: <strong className="text-white tabular-nums">{formatInt(d.cung_ngay)}</strong> bưu gửi
                            </div>
                            <div>
                              Tỷ lệ: <strong className="tabular-nums text-amber-300">{formatPercent(rate)}</strong>
                            </div>
                            {isChuaChot && (
                              <div className="text-[#E0A82E] font-semibold text-[10px] pt-0.5">
                                * Số tạm (chưa chốt)
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
                          className="flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center group relative cursor-pointer focus:outline-none"
                        >
                          {/* Huy hiệu số tạm nếu chưa chốt */}
                          {isChuaChot && (
                            <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 rounded-sm mb-1 pointer-events-none">
                              Tạm
                            </span>
                          )}

                          {/* Nhãn % trên đỉnh cột */}
                          <div
                            className={`text-[9px] font-bold tabular-nums mb-1 pointer-events-none ${getTyLeColorClass(
                              rate
                            )}`}
                          >
                            {pctVal !== null ? `${pctVal}%` : '–'}
                          </div>

                          {/* Cột trực quan */}
                          <div
                            style={{
                              height: `${barPercent}%`,
                              backgroundColor: getTyLeBgColorHex(rate),
                            }}
                            className={`w-full max-w-[24px] rounded-t-[4px] transition-all group-focus:ring-2 group-focus:ring-[#4A1D6E] ${
                              isSunday ? 'ring-2 ring-[#4A1D6E] ring-offset-1' : ''
                            }`}
                          />

                          {/* Nhãn ngày bên dưới trục */}
                          <div className="mt-1.5 text-center pointer-events-none">
                            <div
                              className={`text-[10px] font-bold tabular-nums ${
                                isSunday ? 'text-[#B3202A]' : 'text-gray-700'
                              }`}
                            >
                              {formatDdMm(d.ngay)}
                            </div>
                            <div
                              className={`text-[9px] truncate max-w-[48px] ${
                                isSunday ? 'text-[#B3202A] font-semibold' : 'text-gray-400'
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
              </div>
            )}
          </div>

          {/* ── 3. NHẬN XÉT, ĐÁNH GIÁ (CHỈ HIỆN CẢNH BÁO DO API TRẢ) ────────── */}
          <div className="space-y-3">
            <div>
              <h2 className="hue-h2 text-base font-bold text-gray-900">
                Nhận xét, đánh giá tự động
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Các cảnh báo và lưu ý được phân tích và trả về trực tiếp từ máy chủ theo ngưỡng quy
                định.
              </p>
            </div>

            {canhBaoList.length > 0 ? (
              <div className="space-y-2.5">
                {canhBaoList.map((cb, idx) => {
                  const isCanhBao = cb.muc === 'CANH_BAO';
                  const isLuuY = cb.muc === 'LUU_Y';

                  // Kiểu hộp theo mức cảnh báo
                  const boxStyle = isCanhBao
                    ? 'bg-red-50/80 border-red-200 text-red-900'
                    : isLuuY
                    ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                    : 'bg-[#FAF5FF] border-[#E9D5FF] text-[#581C87]';

                  const badgeStyle = isCanhBao
                    ? 'bg-[#FBE3E5] text-[#B3202A]'
                    : isLuuY
                    ? 'bg-[#FFF1CC] text-[#A87A12]'
                    : 'bg-[#EFE6F5] text-[#4A1D6E]';

                  const badgeText = isCanhBao ? 'Cảnh báo' : isLuuY ? 'Lưu ý' : 'Thông tin';

                  return (
                    <div
                      key={`${cb.ma}-${idx}`}
                      className={`p-4 rounded-[12px] border flex items-start gap-3 text-xs leading-relaxed ${boxStyle}`}
                      role="alert"
                    >
                      <div className="shrink-0 mt-0.5">
                        {isCanhBao ? (
                          <AlertCircle className="w-4 h-4 text-[#B3202A]" />
                        ) : isLuuY ? (
                          <AlertTriangle className="w-4 h-4 text-[#A87A12]" />
                        ) : (
                          <Info className="w-4 h-4 text-[#6B21A8]" />
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}
                          >
                            {badgeText}
                          </span>
                          <span className="font-bold text-gray-900">
                            {cb.ma === 'DEN_TU_12H_SANG_HOM_SAU' &&
                              'Hàng quét túi đến từ 12:00 chuyển tiếp chậm'}
                            {cb.ma === 'NOI_TINH_DI_BCVH_CHAM' &&
                              'Hàng nội tỉnh chuyển về các BCVH Huế có tỷ lệ thấp'}
                            {cb.ma === 'CHU_NHAT_CHAM_HON' &&
                              'Tỷ lệ đi cùng ngày vào Chủ nhật thấp hơn ngày thường'}
                          </span>
                        </div>

                        {/* Nội dung cảnh báo: số liệu lấy trực tiếp từ các trường của API, không số cứng */}
                        <div className="text-gray-800">
                          {cb.ma === 'DEN_TU_12H_SANG_HOM_SAU' && (
                            <span>
                              Hàng quét túi đến từ 12:00 có tỷ lệ đi cùng ngày là{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.tu_12h)}
                              </strong>{' '}
                              (thấp hơn mức{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.truoc_12h)}
                              </strong>{' '}
                              của hàng đến trước 12:00), chiếm{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.ty_le_hang_tu_12h)}
                              </strong>{' '}
                              tổng sản lượng bưu gửi đến ({formatInt(cb.shbg_tu_12h)} bưu gửi).
                            </span>
                          )}

                          {cb.ma === 'NOI_TINH_DI_BCVH_CHAM' && (
                            <span>
                              Hàng nội tỉnh chuyển về 6 BCVH Huế có tỷ lệ đi cùng ngày đạt{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.cung_ngay)}
                              </strong>
                              ; tỷ lệ rớt sang hôm sau là{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.hom_sau)}
                              </strong>{' '}
                              trên tổng mẫu số {formatInt(cb.mau_so)} bưu gửi.
                            </span>
                          )}

                          {cb.ma === 'CHU_NHAT_CHAM_HON' && (
                            <span>
                              Tỷ lệ đi cùng ngày trung bình vào Chủ nhật đạt{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.chu_nhat)}
                              </strong>
                              , thấp hơn mức{' '}
                              <strong className="font-bold tabular-nums">
                                {formatPercent(cb.ngay_thuong)}
                              </strong>{' '}
                              của các ngày thường trong tuần.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-[#DDF1E8]/50 border border-[#1F7A5C]/20 rounded-[12px] text-xs text-[#1F7A5C] flex items-center gap-2 font-medium">
                <Info className="w-4 h-4 shrink-0" />
                <span>Không có cảnh báo bất thường nào trong khoảng thời gian đã chọn.</span>
              </div>
            )}
          </div>

          {/* ── 4. CÁC CHỨC NĂNG CHI TIẾT (LIÊN KẾT 4 TAB ĐÃ CÓ) ───────────── */}
          <div className="space-y-3">
            <div>
              <h2 className="hue-h2 text-base font-bold text-gray-900">
                Các chức năng chi tiết
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Bấm vào từng thẻ chuyên đề để chuyển nhanh đến phân hệ phân tích chuyên sâu.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0 max-w-full">
              {/* Thẻ 1: Lưu thoát */}
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('luu_thoat')}
                className="bg-white rounded-[14px] p-5 border border-gray-200 text-left hover:border-amber-400 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-amber-800">
                    Lưu thoát trong ngày
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
                    Giám sát tiến độ xử lý bưu gửi theo giờ, cảnh báo trượt chuyến, hàng nằm lâu và
                    phân loại lưu thoát chi tiết theo 6 BCVH.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>Mở phân hệ</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Thẻ 2: A · Hàng đến */}
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('a_hang_den')}
                className="bg-white rounded-[14px] p-5 border border-gray-200 text-left hover:border-emerald-400 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Truck className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-emerald-800">
                    A · Hàng đến từ xe Cấp 1
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
                    Thống kê bưu gửi và xe Cấp 1 đến KTT theo ngày, phân bổ theo giờ, đợt xe chính và
                    bản đồ nhiệt hướng hàng tới các BCVH.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
                  <span>Mở phân hệ</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Thẻ 3: B · Tỷ lệ */}
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('b_ty_le')}
                className="bg-white rounded-[14px] p-5 border border-gray-200 text-left hover:border-blue-400 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-800">
                    B · Tỷ lệ đi cùng ngày
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
                    Tỷ lệ đi cùng ngày theo từng hướng hàng, diễn biến theo ngày, phân bố theo giờ quét
                    túi đến và top đường thư có hàng rớt lại.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-blue-700">
                  <span>Mở phân hệ</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              {/* Thẻ 4: B · Lịch xe */}
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('b_lich_xe')}
                className="bg-white rounded-[14px] p-5 border border-gray-200 text-left hover:border-purple-400 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-purple-800">
                    B · Lịch xe, đường thư
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
                    Giờ lập BD10 so với giờ xe rời KTT theo lịch C2, giờ nhận túi từ các đường thư đến
                    và lưới giám sát điều hành 6 BCVH.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-purple-700">
                  <span>Mở phân hệ</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
