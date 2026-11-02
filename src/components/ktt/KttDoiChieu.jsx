import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Clock, RefreshCw, AlertCircle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import QuyThoiGianDateRangePicker from '../quythoigian/QuyThoiGianDateRangePicker';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive,
  formatInt,
  formatPercent,
  formatDdMmYyyy,
} from '../quythoigian/quyThoiGianFormatters';
import { formatDateTimeWithoutSeconds, formatDecimal, getThuTiengViet } from './kttFormatters';
import {
  fetchKttMeta,
  fetchKttDoiChieuTongHop,
  fetchKttDoiChieuThoiGianNhan,
  fetchKttDoiChieuChuaThay,
  fetchKttDoiChieuDanhGia,
} from './kttApi';
import KttTooltip from './KttTooltip';
import KttDoiChieuDanhGia from './KttDoiChieuDanhGia';
import KttNutXuat from './KttNutXuat';

// Danh sách 6 BCVH chuẩn Huế theo thứ tự canvas
const BCVH_LIST = [
  { ma: '533140', ten: 'Thuận Hóa' },
  { ma: '536250', ten: 'Hương Thủy' },
  { ma: '535470', ten: 'Hương Trà' },
  { ma: '537015', ten: 'Thuận An' },
  { ma: '537220', ten: 'Phú Lộc' },
  { ma: '535790', ten: 'A Lưới' },
];

/**
 * Tính giờ đến dự kiến từ mốc 14:00 cộng số giờ (dùng cho câu mô tả mục 3.3)
 */
function congGioTu14h(soGio) {
  if (soGio === null || soGio === undefined || isNaN(soGio)) return '—';
  const tongPhut = 14 * 60 + Math.round(Number(soGio) * 60);
  const gio = Math.floor(tongPhut / 60) % 24;
  const phut = tongPhut % 60;
  const hhmm = `${String(gio).padStart(2, '0')}:${String(phut).padStart(2, '0')}`;
  if (tongPhut >= 24 * 60) {
    return `${hhmm} (hôm sau)`;
  }
  return hhmm;
}

export default function KttDoiChieu({ authUser }) {
  // Khoảng ngày mặc định: 30 ngày kết thúc ở ngày dữ liệu mới nhất (đảm bảo <= 31 ngày)
  const [dateRange, setDateRange] = useState(null);
  const [selectedBcvh, setSelectedBcvh] = useState('all');

  // Meta chung (độ mới)
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Dữ liệu 4 endpoint đối chiếu
  const [tongHopData, setTongHopData] = useState(null);
  const [thoiGianNhanData, setThoiGianNhanData] = useState(null);
  const [chuaThayData, setChuaThayData] = useState(null);
  const [danhGiaData, setDanhGiaData] = useState(null);

  // Trạng thái đang tải & lỗi
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState(null); // 'tong_hop' | 'chi_tiet' | null
  const [error, setError] = useState(null);

  // Trạng thái lọc & xem thêm cho danh sách chuyến mất dấu (mục 3.4)
  const [tripTypeFilter, setTripTypeFilter] = useState('ALL'); // 'ALL' | 'MAT_DAU_CHAC' | 'NGHI_THIEU_FILE'
  const [showAllTrips, setShowAllTrips] = useState(false);

  // Ref chống stale response khi thao tác nhanh
  const reqIdRef = useRef(0);

  // 1. Tải meta lúc khởi tạo để tính khoảng 30 ngày mặc định kết thúc ở ngày dữ liệu mới nhất
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
          // Mặc định 30 ngày kết thúc ở ngày dữ liệu mới nhất (countDaysInclusive = 30 <= 31)
          setDateRange({
            from: shiftDay(latestDay, -29),
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

  // 2. Thứ tự gọi: gọi tong-hop TRƯỚC (nguội ~16s), khi xong mới gọi song song 3 API còn lại
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;

    // Kiểm tra cơ bản ngày hợp lệ
    const days = countDaysInclusive(dateRange.from, dateRange.to);
    if (days <= 0) {
      setError('Đến ngày không được nhỏ hơn Từ ngày.');
      setTongHopData(null);
      setThoiGianNhanData(null);
      setChuaThayData(null);
      setDanhGiaData(null);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setLoadingPhase('tong_hop');
    setError(null);

    const bcvhParam = selectedBcvh === 'all' ? null : selectedBcvh;

    try {
      // BƯỚC 1: Gọi tong-hop TRƯỚC (lần đầu nguội ~16 giây)
      const thRes = await fetchKttDoiChieuTongHop({
        tu: dateRange.from,
        den: dateRange.to,
        ma_bcvh: bcvhParam,
      });

      if (reqIdRef.current !== reqId) return;

      if (!thRes.ok) {
        throw new Error(thRes.error || 'Lỗi tải tổng hợp đối chiếu');
      }

      setTongHopData(thRes.data);

      // BƯỚC 2: Khi tong-hop đã xong (dữ liệu đã nóng), gọi song song 3 API còn lại
      setLoadingPhase('chi_tiet');

      const [tgnRes, ctRes, dgRes] = await Promise.all([
        fetchKttDoiChieuThoiGianNhan({
          tu: dateRange.from,
          den: dateRange.to,
          ma_bcvh: bcvhParam,
        }),
        fetchKttDoiChieuChuaThay({
          tu: dateRange.from,
          den: dateRange.to,
          ma_bcvh: bcvhParam,
        }),
        fetchKttDoiChieuDanhGia({
          tu: dateRange.from,
          den: dateRange.to,
          ma_bcvh: bcvhParam,
        }),
      ]);

      if (reqIdRef.current !== reqId) return;

      if (!tgnRes.ok) throw new Error(tgnRes.error || 'Lỗi tải thời gian nhận');
      if (!ctRes.ok) throw new Error(ctRes.error || 'Lỗi tải chuyến mất dấu / nguồn chưa thấy');
      if (!dgRes.ok) throw new Error(dgRes.error || 'Lỗi tải đánh giá đối chiếu');

      setThoiGianNhanData(tgnRes.data);
      setChuaThayData(ctRes.data);
      setDanhGiaData(dgRes.data);
    } catch (e) {
      if (reqIdRef.current === reqId) {
        // Sửa nhỏ A: Khi API lỗi, ẩn các thẻ số (xóa data cũ) để không hiển thị số cũ dưới banner lỗi
        setError(e.message || 'Lỗi kết nối khi tải số liệu đối chiếu BCVH.');
        setTongHopData(null);
        setThoiGianNhanData(null);
        setChuaThayData(null);
        setDanhGiaData(null);
      }
    } finally {
      if (reqIdRef.current === reqId) {
        setLoading(false);
        setLoadingPhase(null);
      }
    }
  }, [dateRange, selectedBcvh]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      loadData();
    }
  }, [dateRange, selectedBcvh, loadData]);

  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // Trích xuất các thông tin meta
  const doMoi = tongHopData?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;
  const cuaSoThucTe = tongHopData?.cua_so_thuc_te;
  const hangHoanChuaNap = tongHopData?.meta?.hang_hoan_chua_nap ?? meta?.hang_hoan_chua_nap;
  const hangHoanNguonXuatLuc = tongHopData?.meta?.hang_hoan_nguon_xuat_luc || meta?.hang_hoan_nguon_xuat_luc;

  // Thống kê ngày đã chốt / số tạm
  const thongKeChot = useMemo(() => {
    if (!tongHopData?.theo_ngay) return null;
    const list = tongHopData.theo_ngay;
    const tongSo = list.length;
    const daChot = list.filter((x) => x.da_chot).length;
    const soTam = tongSo - daChot;
    return { tongSo, daChot, soTam };
  }, [tongHopData]);

  // Trạng thái dữ liệu
  const isChuaCoDuLieu =
    tongHopData?.ly_do === 'CHUA_CO_DU_LIEU' ||
    (!loading && tongHopData && !tongHopData.co_du_lieu);

  // Số liệu khối 3.2 từ tongHopData
  const tapChinh = tongHopData?.tong_cong?.tap_chinh;
  const daGhiDi = tongHopData?.tong_cong?.da_ghi_di;

  // Thanh 1 / Bốn thẻ (tập chính trong khoảng ngày đối chiếu được)
  const tapChinhTrongCuaSo = tapChinh?.trong_cua_so || 0;
  const tapChinhNgoaiCuaSo = tapChinh?.ngoai_cua_so || 0;
  const tapChinhTaiDich = tapChinh?.tai_dich || 0;
  const tapChinhBcvhKhac = tapChinh?.bcvh_khac || 0;
  const tapChinhChuaThay = tapChinh?.chua_thay || 0;
  const tapChinhNghiDuongTinhGia = tapChinh?.nghi_duong_tinh_gia || 0;

  // Tỷ lệ phần trăm của thanh 1 tính trên mẫu trong khoảng ngày đối chiếu được
  const tyLeTaiDich = tapChinhTrongCuaSo > 0 ? tapChinhTaiDich / tapChinhTrongCuaSo : 0;
  const tyLeBcvhKhac = tapChinhTrongCuaSo > 0 ? tapChinhBcvhKhac / tapChinhTrongCuaSo : 0;
  const tyLeChuaThay = tapChinhTrongCuaSo > 0 ? tapChinhChuaThay / tapChinhTrongCuaSo : 0;

  const pctTaiDich = tyLeTaiDich * 100;
  const pctBcvhKhac = tyLeBcvhKhac * 100;
  const pctChuaThay = tyLeChuaThay * 100;

  // Thanh 2 (da_ghi_di: tại đích / BCVH khác / chưa thấy)
  const dgTaiDich = daGhiDi?.tai_dich || 0;
  const dgBcvhKhac = daGhiDi?.bcvh_khac || 0;
  const dgChuaThay = daGhiDi?.chua_thay || 0;
  const daGhiDiTong = dgTaiDich + dgBcvhKhac + dgChuaThay;

  const tyLeDgTaiDich = daGhiDiTong > 0 ? dgTaiDich / daGhiDiTong : 0;
  const tyLeDgBcvhKhac = daGhiDiTong > 0 ? dgBcvhKhac / daGhiDiTong : 0;
  const tyLeDgChuaThay = daGhiDiTong > 0 ? dgChuaThay / daGhiDiTong : 0;

  const pctDgTaiDich = tyLeDgTaiDich * 100;
  const pctDgBcvhKhac = tyLeDgBcvhKhac * 100;
  const pctDgChuaThay = tyLeDgChuaThay * 100;

  // Danh sách BCVH hiển thị cho mục 3.3 theo bộ lọc BCVH
  const dsBcvhHienThi = useMemo(() => {
    if (selectedBcvh === 'all') return BCVH_LIST;
    return BCVH_LIST.filter((b) => b.ma === selectedBcvh);
  }, [selectedBcvh]);

  const bcvhMap = useMemo(() => new Map(BCVH_LIST.map((b) => [b.ma, b.ten])), []);

  // Trục tối đa theo dữ liệu thật (không cứng 7 giờ)
  const trucMax = useMemo(() => {
    const maxVal = Math.max(
      ...dsBcvhHienThi.map((b) => Number(thoiGianNhanData?.theo_bcvh?.[b.ma]?.p90_gio) || 0),
      1
    );
    return Math.max(Math.ceil(maxVal), 2);
  }, [dsBcvhHienThi, thoiGianNhanData]);

  // Ví dụ giải thích đọc biểu đồ sinh động từ dòng dữ liệu đầu tiên (không số cứng)
  const viDuDoc = useMemo(() => {
    const first = dsBcvhHienThi.find((b) => {
      const d = thoiGianNhanData?.theo_bcvh?.[b.ma];
      return d && Number(d.mau) > 0 && d.p50_gio !== null;
    });
    if (!first) return 'Ví dụ sẽ tự động hiển thị từ dữ liệu khi có số liệu.';
    const d = thoiGianNhanData.theo_bcvh[first.ma];
    return `Ví dụ ${first.ten}: 50% số hàng đã tới trước ${congGioTu14h(d.p50_gio)} (sau ${formatDecimal(d.p50_gio, 1)} giờ), 90% số hàng đã tới trước ${congGioTu14h(d.p90_gio)} (sau ${formatDecimal(d.p90_gio, 1)} giờ), ${formatPercent(d.ty_le_cung_ngay)} nhận ngay trong ngày KTT lập BD10 đi.`;
  }, [dsBcvhHienThi, thoiGianNhanData]);

  const tongAm = thoiGianNhanData?.tong_cong?.am || 0;

  // Dữ liệu khối 3.4 từ chuaThayData
  const chuyenMatDauData = chuaThayData?.chuyen_mat_dau;
  const danhSachChuyen = useMemo(() => chuyenMatDauData?.danh_sach || [], [chuyenMatDauData]);
  const soChuyenMatDau = chuyenMatDauData?.so_chuyen_mat_dau || 0;
  const matDauChac = chuyenMatDauData?.mat_dau_chac || { so_chuyen: 0, so_shbg: 0 };
  const nghiThieuFile = chuyenMatDauData?.nghi_thieu_file || { so_chuyen: 0, so_shbg: 0 };
  const tongShbgChuyenMatDau = matDauChac.so_shbg + nghiThieuFile.so_shbg;

  // Lọc danh sách chuyến mất dấu theo loại
  const filteredChuyen = useMemo(() => {
    if (tripTypeFilter === 'MAT_DAU_CHAC') {
      return danhSachChuyen.filter((c) => c.loai === 'MAT_DAU_CHAC');
    }
    if (tripTypeFilter === 'NGHI_THIEU_FILE') {
      return danhSachChuyen.filter((c) => c.loai === 'NGHI_THIEU_FILE');
    }
    return danhSachChuyen;
  }, [danhSachChuyen, tripTypeFilter]);

  const maxShbgChuyen = useMemo(() => {
    return Math.max(...danhSachChuyen.map((c) => c.so_shbg || 0), 1);
  }, [danhSachChuyen]);

  const displayedChuyen = showAllTrips ? filteredChuyen : filteredChuyen.slice(0, 15);

  // Nguồn của SHBG chưa thấy (mục 3.4 phải)
  const nguonChuaThayData = chuaThayData?.nguon_chua_thay;
  const thanh1Nguon = nguonChuaThayData?.thanh_1;
  const thanh1Tong = thanh1Nguon?.tong || 0;
  const theoBcvhNguon = thanh1Nguon?.theo_bcvh || {};
  const theoLyDoNguon = thanh1Nguon?.theo_ly_do || [];

  const thieuGioQuetDen = nguonChuaThayData?.thieu_gio_quet_den;
  const thieuGioTong = thieuGioQuetDen?.tong || 0;
  const thieuGioDaThay = thieuGioQuetDen?.da_thay?.tong || 0;
  const thieuGioChuaThay = thieuGioQuetDen?.chua_thay?.tong || 0;
  const thieuGioTheoNguon = thieuGioQuetDen?.chua_thay?.theo_nguon || [];

  return (
    <div className="space-y-6 px-6 pb-12 max-w-full min-w-0">
      {/* ── ĐẦU TRANG: TIÊU ĐỀ, DÒNG META & BỘ LỌC ─────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Sửa nhỏ C: Tiêu đề trang (h1) đổi thành «Đối chiếu hàng với các BCVH» */}
            <h1 className="hue-h1">
              Đối chiếu hàng với các BCVH
            </h1>

            {doMoi && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Dữ liệu đến lúc {formatDateTimeWithoutSeconds(doMoi)}
              </span>
            )}

            {hangHoanChuaNap ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                Chưa nạp danh sách hàng hoàn; số hoàn = 0 chưa đúng
              </span>
            ) : hangHoanNguonXuatLuc ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Danh sách hoàn cập nhật lúc {formatDateTimeWithoutSeconds(hangHoanNguonXuatLuc)}
              </span>
            ) : null}

            {thongKeChot && thongKeChot.tongSo > 0 && (
              thongKeChot.soTam === 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Đã chốt toàn bộ số liệu ({formatInt(thongKeChot.daChot)}/{formatInt(thongKeChot.tongSo)} ngày)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                  <Clock className="w-3 h-3 text-blue-600" />
                  {formatInt(thongKeChot.daChot)}/{formatInt(thongKeChot.tongSo)} ngày đã chốt · {formatInt(thongKeChot.soTam)} ngày số tạm
                </span>
              )
            )}
          </div>

          <p className="text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2">
            <span>Trung tâm Khai thác · 530100 · Hàng tại KTT</span>
            {cuaSoThucTe && cuaSoThucTe.tu && cuaSoThucTe.den ? (
              <span className="text-gray-500">
                · Khoảng ngày đối chiếu được:{' '}
                <strong className="text-gray-800">
                  {formatDdMmYyyy(cuaSoThucTe.tu)} – {formatDdMmYyyy(cuaSoThucTe.den)}
                </strong>
              </span>
            ) : (
              <span className="text-amber-700 italic">
                · Chưa có khoảng ngày đối chiếu được cho khoảng này
              </span>
            )}
          </p>
        </div>

        {/* Hàng bộ lọc: BCVH đích & Khoảng ngày */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Dropdown BCVH đích */}
          <div className="flex items-center bg-white px-2.5 py-1.5 rounded-[10px] border border-[#D9CBA8] text-xs">
            <span className="font-semibold text-gray-600 mr-2 whitespace-nowrap">BCVH đích:</span>
            <select
              id="ktt-doi-chieu-bcvh-select"
              aria-label="BCVH đích"
              value={selectedBcvh}
              onChange={(e) => setSelectedBcvh(e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Tất cả 6 BCVH Huế</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ma} - {b.ten}
                </option>
              ))}
            </select>
          </div>

          {/* Bộ chọn khoảng ngày */}
          <QuyThoiGianDateRangePicker
            dateRange={dateRange || { from: '', to: '' }}
            onChangeDateRange={handleDateRangeChange}
            idPrefix="ktt-doi-chieu"
          />
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline shrink-0 cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      )}

      {/* Thông báo đang tải */}
      {loading && (
        <div className="flex items-center justify-center gap-2.5 py-3 px-4 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs font-semibold text-[#5A4A62]">
          <RefreshCw className="w-4 h-4 animate-spin text-orange-600 shrink-0" />
          <span>
            {loadingPhase === 'tong_hop'
              ? 'Đang tải tổng hợp đối chiếu BCVH (lần đầu tính toán có thể mất khoảng 16 giây)...'
              : 'Đang tải chi tiết thời gian nhận, chuyến mất dấu và đánh giá đối chiếu...'}
          </span>
        </div>
      )}

      {/* Khung xương khi tải lần đầu */}
      {(!dateRange || metaLoading || (loading && !tongHopData && !error)) && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-[14px] border border-gray-200" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-44 bg-white rounded-[14px] border border-gray-200" />
            <div className="h-44 bg-white rounded-[14px] border border-gray-200" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
            <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
          </div>
        </div>
      )}

      {/* Chưa có dữ liệu */}
      {!loading && !error && isChuaCoDuLieu && (
        <div className="bg-white rounded-[14px] p-8 border border-gray-200 text-center text-sm text-gray-500 italic shadow-none">
          Chưa có dữ liệu đối chiếu trong khoảng thời gian đã chọn
        </div>
      )}

      {/* ── MỤC 3.2: BỐN THẺ + HAI THANH XẾP CHỒNG ───────────────────────── */}
      {!error && tongHopData && !isChuaCoDuLieu && (
        <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
          {/* Tiêu đề khối & dòng mô tả 3.2 (Sửa nhỏ D: Bỏ chữ kỹ thuật) */}
          <div>
            <h2 className="hue-h2 text-[17px]">
              Đối chiếu nhóm «chưa đi trên 24 giờ» với «Hàng đến BCVH»
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Đối chiếu theo SHBG chỉ làm được trong khoảng ngày có dữ liệu BCVH
              {cuaSoThucTe?.tu && cuaSoThucTe?.den
                ? ` (${formatDdMmYyyy(cuaSoThucTe.tu)} – ${formatDdMmYyyy(cuaSoThucTe.den)})`
                : ''}
              ; có {formatInt(tapChinhNgoaiCuaSo)} SHBG chưa đối chiếu được (nằm ngoài khoảng ngày có dữ liệu BCVH).
            </p>
          </div>

          {/* Bốn thẻ (lưới 4 cột; viền trên màu) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Thẻ 1: Chưa đi trên 24 giờ, trong khoảng ngày đối chiếu được */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#4A1D6E] shadow-none flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  Chưa đi trên 24 giờ, trong khoảng ngày đối chiếu được
                </div>
                <div className="text-3xl font-extrabold text-gray-900 mt-2 tabular-nums">
                  {formatInt(tapChinhTrongCuaSo)}
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                {tapChinhNgoaiCuaSo > 0 ? (
                  <span>
                    Thêm <strong className="text-gray-700 tabular-nums">{formatInt(tapChinhNgoaiCuaSo)}</strong> SHBG chưa đối chiếu được (nằm ngoài khoảng ngày có dữ liệu BCVH)
                  </span>
                ) : (
                  <span>Toàn bộ trong khoảng ngày đối chiếu được</span>
                )}
              </div>
            </div>

            {/* Thẻ 2: Đã có tại BCVH đích (xanh lá) */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#1F7A5C] shadow-none flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1F7A5C]">
                  Đã có tại BCVH đích
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-[#1F7A5C] tabular-nums">
                    {formatInt(tapChinhTaiDich)}
                  </div>
                  <div className="text-xs font-bold text-[#1F7A5C] tabular-nums">
                    {formatPercent(tyLeTaiDich)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                {formatPercent(tyLeTaiDich)} của nhóm
              </div>
            </div>

            {/* Thẻ 3: Thấy ở BCVH khác (vàng nâu) */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#D97706] shadow-none flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#B45309]">
                    Thấy ở BCVH khác
                  </div>
                  <KttNutXuat route="thay-o-bcvh-khac" tu={dateRange?.from} den={dateRange?.to} maBcvh={selectedBcvh} />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-[#B45309] tabular-nums">
                    {formatInt(tapChinhBcvhKhac)}
                  </div>
                  <div className="text-xs font-bold text-[#B45309] tabular-nums">
                    {formatPercent(tyLeBcvhKhac)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                {formatPercent(tyLeBcvhKhac)} của nhóm
              </div>
            </div>

            {/* Thẻ 4: Chưa thấy ở đâu (đỏ) */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#B3202A] shadow-none flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#B3202A]">
                    Chưa thấy ở đâu
                  </div>
                  <KttNutXuat route="chua-thay" tu={dateRange?.from} den={dateRange?.to} maBcvh={selectedBcvh} />
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-3xl font-extrabold text-[#B3202A] tabular-nums">
                    {formatInt(tapChinhChuaThay)}
                  </div>
                  <div className="text-xs font-bold text-[#B3202A] tabular-nums">
                    {formatPercent(tyLeChuaThay)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
                <span className="font-semibold text-red-700">Cần BCVH kiểm tra</span>
                {tapChinhNghiDuongTinhGia > 0 && (
                  <span className="text-gray-500 text-[11px] block mt-0.5">
                    (trong đó <strong className="text-gray-700 tabular-nums">{formatInt(tapChinhNghiDuongTinhGia)}</strong> có thể do BCVH thiếu dữ liệu)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Hai thanh xếp chồng */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Thanh 1: Nhóm «chưa đi trên 24 giờ»: hàng đang ở đâu */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-gray-900">
                  Nhóm «chưa đi trên 24 giờ»: hàng đang ở đâu ({formatInt(tapChinhTrongCuaSo)} SHBG)
                </h3>
              </div>

              {/* Thanh xếp chồng */}
              <div className="w-full h-7 rounded-full bg-gray-100 flex overflow-hidden p-0.5 border border-gray-200">
                {pctTaiDich > 0 && (
                  <KttTooltip
                    content={`Đã có tại BCVH đích: ${formatInt(tapChinhTaiDich)} SHBG (${formatPercent(tyLeTaiDich)})`}
                    style={{ width: `${pctTaiDich}%` }}
                    className="h-full bg-[#1F7A5C] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
                {pctBcvhKhac > 0 && (
                  <KttTooltip
                    content={`Thấy ở BCVH khác: ${formatInt(tapChinhBcvhKhac)} SHBG (${formatPercent(tyLeBcvhKhac)})`}
                    style={{ width: `${pctBcvhKhac}%` }}
                    className="h-full bg-[#D97706] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
                {pctChuaThay > 0 && (
                  <KttTooltip
                    content={`Chưa thấy ở đâu: ${formatInt(tapChinhChuaThay)} SHBG (${formatPercent(tyLeChuaThay)})`}
                    style={{ width: `${pctChuaThay}%` }}
                    className="h-full bg-[#B3202A] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
              </div>

              {/* Chú giải % */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#1F7A5C] shrink-0" />
                  <span className="text-gray-600">Đã có tại đích:</span>
                  <strong className="text-[#1F7A5C] tabular-nums">
                    {formatInt(tapChinhTaiDich)} ({formatPercent(tyLeTaiDich)})
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#D97706] shrink-0" />
                  <span className="text-gray-600">BCVH khác:</span>
                  <strong className="text-[#B45309] tabular-nums">
                    {formatInt(tapChinhBcvhKhac)} ({formatPercent(tyLeBcvhKhac)})
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#B3202A] shrink-0" />
                  <span className="text-gray-600">Chưa thấy:</span>
                  <strong className="text-[#B3202A] tabular-nums">
                    {formatInt(tapChinhChuaThay)} ({formatPercent(tyLeChuaThay)})
                  </strong>
                </div>
              </div>
            </div>

            {/* Thanh 2: Hàng KTT đã giao đi: đi đúng nơi chưa */}
            <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-gray-900">
                  Hàng KTT đã giao đi: đi đúng nơi chưa
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    Tổng: <strong className="text-gray-900 tabular-nums">{formatInt(daGhiDiTong)}</strong> SHBG
                  </span>
                  <KttNutXuat route="da-co-tai-dich" tu={dateRange?.from} den={dateRange?.to} maBcvh={selectedBcvh} />
                </div>
              </div>

              {/* Thanh xếp chồng */}
              <div className="w-full h-7 rounded-full bg-gray-100 flex overflow-hidden p-0.5 border border-gray-200">
                {pctDgTaiDich > 0 && (
                  <KttTooltip
                    content={`Đã có tại BCVH đích: ${formatInt(dgTaiDich)} SHBG (${formatPercent(tyLeDgTaiDich)})`}
                    style={{ width: `${pctDgTaiDich}%` }}
                    className="h-full bg-[#1F7A5C] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
                {pctDgBcvhKhac > 0 && (
                  <KttTooltip
                    content={`Thấy ở BCVH khác: ${formatInt(dgBcvhKhac)} SHBG (${formatPercent(tyLeDgBcvhKhac)})`}
                    style={{ width: `${pctDgBcvhKhac}%` }}
                    className="h-full bg-[#D97706] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
                {pctDgChuaThay > 0 && (
                  <KttTooltip
                    content={`Chưa thấy ở đâu: ${formatInt(dgChuaThay)} SHBG (${formatPercent(tyLeDgChuaThay)})`}
                    style={{ width: `${pctDgChuaThay}%` }}
                    className="h-full bg-[#B3202A] first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                )}
              </div>

              {/* Chú giải % */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#1F7A5C] shrink-0" />
                  <span className="text-gray-600">Đã có tại đích:</span>
                  <strong className="text-[#1F7A5C] tabular-nums">
                    {formatInt(dgTaiDich)} ({formatPercent(tyLeDgTaiDich)})
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#D97706] shrink-0" />
                  <span className="text-gray-600">BCVH khác:</span>
                  <strong className="text-[#B45309] tabular-nums">
                    {formatInt(dgBcvhKhac)} ({formatPercent(tyLeDgBcvhKhac)})
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#B3202A] shrink-0" />
                  <span className="text-gray-600">Chưa thấy:</span>
                  <strong className="text-[#B3202A] tabular-nums">
                    {formatInt(dgChuaThay)} ({formatPercent(tyLeDgChuaThay)})
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* ── MỤC 3.3: KHỐI «HÀNG ĐI KTT RỒI, BAO LÂU THÌ BCVH NHẬN?» ──────── */}
          {thoiGianNhanData && (
            <div className="space-y-4 pt-2 border-t border-gray-200">
              {/* Tiêu đề khối 3.3 (Sửa nhỏ D: bỏ chữ kỹ thuật) */}
              <div>
                <h2 className="hue-h2 text-[17px]">
                  Hàng đi KTT rồi, bao lâu thì BCVH nhận?
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Đo khoảng thời gian từ lúc KTT lập BD10 đi đến khi BCVH đích xác nhận đến.
                </p>
              </div>

              {/* Hai thẻ cạnh nhau */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Thẻ Trái: Thời gian từ BD10 đi đến BCVH nhận (giờ) */}
                <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <h3 className="text-sm font-bold text-gray-900">
                      Thời gian từ BD10 đi đến BCVH nhận (giờ)
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        Trục 0 đến {formatDecimal(trucMax, 1)} giờ
                      </span>
                      <KttNutXuat route="chuyen-cham" tu={dateRange?.from} den={dateRange?.to} maBcvh={selectedBcvh} />
                    </div>
                  </div>

                  {/* Danh sách từng BCVH */}
                  <div className="space-y-4">
                    {dsBcvhHienThi.map((b) => {
                      const bData = thoiGianNhanData?.theo_bcvh?.[b.ma];
                      const mau = bData?.mau || 0;
                      const p50 = bData?.p50_gio;
                      const p90 = bData?.p90_gio;
                      const am = bData?.am || 0;

                      if (!bData || mau === 0) {
                        return (
                          <div key={b.ma} className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-500">
                              <span className="font-semibold text-gray-700">{b.ma} · {b.ten}</span>
                              <span className="italic">Chưa có mẫu hợp lệ</span>
                            </div>
                            <div className="w-full h-5 rounded-full bg-slate-100 border border-gray-200" />
                          </div>
                        );
                      }

                      const pctP50 = Math.min(100, Math.max(0, ((p50 || 0) / trucMax) * 100));
                      const pctP90 = Math.min(100, Math.max(0, ((p90 || 0) / trucMax) * 100));

                      return (
                        <div key={b.ma} className="space-y-1.5">
                          {/* Dòng tiêu đề BCVH + thông tin */}
                          <div className="flex flex-wrap items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{b.ma} · {b.ten}</span>
                              <span className="text-gray-500">({formatInt(mau)} SHBG)</span>
                              {am > 0 && (
                                <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  {formatInt(am)} âm
                                </span>
                              )}
                            </div>
                            {/* Thời gian nhận: 50% và 90% */}
                            <div className="text-xs font-semibold tabular-nums text-purple-900">
                              50% tới trong {formatDecimal(p50, 1)} giờ · 90% tới trong {formatDecimal(p90, 1)} giờ
                            </div>
                          </div>

                          {/* Thanh nền và thanh thời gian nhận */}
                          <KttTooltip
                            content={`${b.ten}: 50% tới trong ${formatDecimal(p50, 1)} giờ (${congGioTu14h(p50)}) · 90% tới trong ${formatDecimal(p90, 1)} giờ (${congGioTu14h(p90)})`}
                            className="relative w-full h-5 rounded-full bg-slate-100 overflow-hidden border border-gray-200 cursor-pointer"
                          >
                            {/* Thanh nhạt đến 90% */}
                            {pctP90 > 0 && (
                              <div
                                style={{ width: `${pctP90}%` }}
                                className="absolute top-0 left-0 h-full bg-[#DDD6FE] rounded-full transition-all"
                              />
                            )}
                            {/* Thanh đậm đến 50% */}
                            {pctP50 > 0 && (
                              <div
                                style={{ width: `${pctP50}%` }}
                                className="absolute top-0 left-0 h-full bg-[#7C3AED] rounded-full transition-all"
                              />
                            )}
                          </KttTooltip>

                          {/* Câu mô tả tính từ dữ liệu thật (định dạng giờ Việt Nam, số thập phân dấu phẩy) */}
                          <div className="text-[11px] text-gray-600 leading-relaxed pl-1">
                            BD10 lập lúc 14:00: 50% số hàng đã tới trước{' '}
                            <strong className="text-gray-800">{congGioTu14h(p50)}</strong> (sau{' '}
                            <strong className="text-[#7C3AED]">{formatDecimal(p50, 1)} giờ</strong>), 90% số hàng đã tới trước{' '}
                            <strong className="text-gray-800">{congGioTu14h(p90)}</strong> (sau{' '}
                            <strong className="text-purple-900">{formatDecimal(p90, 1)} giờ</strong>), còn 10% tới muộn hơn.
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sửa nhỏ D: Vạch chia trục dùng cùng cỡ chữ và kiểu chữ thường */}
                  <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 px-1 font-medium">
                    <span>0 giờ</span>
                    <span>{formatDecimal(trucMax / 2, 1)} giờ</span>
                    <span>{formatDecimal(trucMax, 1)} giờ</span>
                  </div>
                </div>

                {/* Thẻ Phải: Bao nhiêu % hàng BCVH nhận ngay trong ngày KTT lập BD10 đi */}
                <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-2">
                      <h3 className="text-sm font-bold text-gray-900">
                        Bao nhiêu % hàng BCVH nhận ngay trong ngày KTT lập BD10 đi
                      </h3>
                      <span className="text-xs text-gray-500">
                        Mức chuẩn: ≥ 95%
                      </span>
                    </div>

                    {/* Danh sách từng BCVH */}
                    <div className="space-y-4">
                      {dsBcvhHienThi.map((b) => {
                        const bData = thoiGianNhanData?.theo_bcvh?.[b.ma];
                        const mau = bData?.mau || 0;
                        const cungNgay = bData?.cung_ngay || 0;
                        const tyLe = bData?.ty_le_cung_ngay;
                        const isDat = tyLe !== null && tyLe !== undefined && tyLe >= 0.95;

                        if (!bData || mau === 0) {
                          return (
                            <div key={b.ma} className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-500">
                                <span className="font-semibold text-gray-700">{b.ma} · {b.ten}</span>
                                <span className="italic">Chưa có mẫu</span>
                              </div>
                              <div className="w-full h-5 rounded-full bg-slate-100 border border-gray-200" />
                            </div>
                          );
                        }

                        const pctBar = Math.min(100, Math.max(0, (tyLe || 0) * 100));

                        return (
                          <div key={b.ma} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-900">{b.ma} · {b.ten}</span>
                              <div className="flex items-center gap-2 tabular-nums">
                                <span className="text-gray-500 text-[11px]">
                                  ({formatInt(cungNgay)}/{formatInt(mau)} SHBG)
                                </span>
                                <strong className={`text-sm font-extrabold ${isDat ? 'text-[#1F7A5C]' : 'text-[#B45309]'}`}>
                                  {formatPercent(tyLe)}
                                </strong>
                              </div>
                            </div>

                            {/* Thanh % */}
                            <KttTooltip
                              content={`${b.ten}: ${formatPercent(tyLe)} nhận trong ngày lập BD10 (${formatInt(cungNgay)}/${formatInt(mau)} SHBG)`}
                              className="w-full h-5 rounded-full bg-slate-100 overflow-hidden border border-gray-200 cursor-pointer"
                            >
                              <div
                                style={{ width: `${pctBar}%` }}
                                className={`h-full rounded-full transition-all ${isDat ? 'bg-[#1F7A5C]' : 'bg-[#D97706]'}`}
                              />
                            </KttTooltip>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chú giải % bên dưới thẻ phải */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-[#1F7A5C] shrink-0" />
                      <span className="text-gray-600">≥ 95% (mức cao, nhận kịp trong ngày)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-[#D97706] shrink-0" />
                      <span className="text-gray-600">&lt; 95% (cần lưu ý tỷ lệ qua ngày)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dưới khối: số SHBG có độ trễ âm tách riêng + chú thích định nghĩa */}
              <div className="text-xs text-gray-500 space-y-1 bg-[#FAF5E8] p-3.5 rounded-[10px] border border-[#E4D5AE]">
                {tongAm > 0 && (
                  <div className="flex items-start gap-1.5 text-amber-900">
                    <Info className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
                    <span>
                      Có <strong className="tabular-nums font-bold">{formatInt(tongAm)}</strong> SHBG có độ trễ âm (mốc đến BCVH ghi nhận trước giờ lập BD10 đi) được tách riêng, không nằm trong tính toán thời gian nhận hay tỷ lệ đến cùng ngày.
                    </span>
                  </div>
                )}
                <div className="text-gray-600 pl-5">
                  Chú thích: Đến cùng ngày = BCVH ghi nhận trong cùng ngày KTT lập BD10 đi.
                </div>
              </div>

              {/* Khối nhỏ: «Cách đọc biểu đồ» (bốn ô giải thích ngắn, Sửa nhỏ D: bỏ chữ kỹ thuật) */}
              <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#4A1D6E]" />
                  <span>Cách đọc biểu đồ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="bg-gray-50 p-3 rounded-[10px] border border-gray-100">
                    <div className="font-bold text-gray-800 mb-1">1. Phân bổ theo BCVH</div>
                    <div className="text-gray-600 leading-relaxed">
                      Mỗi dòng tương ứng với một BCVH đích, đo riêng tốc độ tiếp nhận bưu gửi của bưu cục đó.
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-[10px] border border-gray-100">
                    <div className="font-bold text-gray-800 mb-1">2. Mốc đo thời gian</div>
                    <div className="text-gray-600 leading-relaxed">
                      Mốc đo bằng giờ tính từ lúc KTT lập BD10 đi đến khi BCVH đích ghi nhận mốc đến hợp lệ.
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-[10px] border border-gray-100">
                    <div className="font-bold text-gray-800 mb-1">3. Thanh đậm và thanh nhạt</div>
                    <div className="text-gray-600 leading-relaxed">
                      Thanh đậm: thời gian để 50% số bưu gửi tới. Thanh nhạt: thời gian để 90% số bưu gửi tới. Cả hai tính từ lúc lập BD10 đi và chỉ tính các bưu gửi đã tới BCVH.
                    </div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-[10px] border border-purple-100">
                    <div className="font-bold text-purple-900 mb-1">4. Ví dụ từ dữ liệu</div>
                    <div className="text-purple-800 leading-relaxed">
                      {viDuDoc}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MỤC 3.4: KHỐI «CHUYẾN MẤT DẤU VÀ NGUỒN CỦA N SHBG CHƯA THẤY» ── */}
          {chuaThayData && (
            <div className="space-y-4 pt-2 border-t border-gray-200">
              {/* Tiêu đề khối 3.4 */}
              <div>
                <h2 className="hue-h2 text-[17px]">
                  Chuyến mất dấu và nguồn của {formatInt(thanh1Tong)} SHBG chưa thấy
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chi tiết các chuyến BD10 không ghi nhận hàng đến ở đích và phân tích nguồn gốc bưu gửi chưa thấy.
                </p>
              </div>

              {/* Lưới 2 cột (Trái: Chuyến mất dấu, Phải: Nguồn chưa thấy) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ── Trái: Các chuyến BD10 không thấy hàng ở đích ── */}
                <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4 flex flex-col justify-between">
                  <div className="space-y-3 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-2 shrink-0">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">
                          Các chuyến BD10 không thấy hàng ở đích
                        </h3>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Tổng cộng: <strong className="text-red-700 tabular-nums">{formatInt(tongShbgChuyenMatDau)}</strong> SHBG / <strong className="text-gray-900 tabular-nums">{formatInt(soChuyenMatDau)}</strong> chuyến
                        </div>
                      </div>

                      {/* Bộ chọn phân loại mất dấu và nút tải Excel */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-gray-100 p-0.5 rounded-[8px] text-[11px]">
                          <button
                            type="button"
                            onClick={() => setTripTypeFilter('ALL')}
                            className={`px-2 py-1 rounded-[6px] font-semibold transition-colors cursor-pointer ${
                              tripTypeFilter === 'ALL'
                                ? 'bg-white text-gray-900 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Tất cả ({soChuyenMatDau})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripTypeFilter('MAT_DAU_CHAC')}
                            className={`px-2 py-1 rounded-[6px] font-semibold transition-colors cursor-pointer ${
                              tripTypeFilter === 'MAT_DAU_CHAC'
                                ? 'bg-white text-red-700 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Mất dấu chắc chắn ({matDauChac.so_chuyen})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripTypeFilter('NGHI_THIEU_FILE')}
                            className={`px-2 py-1 rounded-[6px] font-semibold transition-colors cursor-pointer ${
                              tripTypeFilter === 'NGHI_THIEU_FILE'
                                ? 'bg-white text-amber-800 shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Nghi ngờ thiếu file ({nghiThieuFile.so_chuyen})
                          </button>
                        </div>
                        <KttNutXuat route="chuyen-mat-dau" tu={dateRange?.from} den={dateRange?.to} maBcvh={selectedBcvh} />
                      </div>
                    </div>

                    {/* Danh sách các chuyến */}
                    <div className="lg:flex-1 lg:min-h-[320px] lg:relative">
                      {displayedChuyen.length === 0 ? (
                        <div className="py-8 text-center text-xs text-gray-400 italic">
                          Không có chuyến nào thuộc phân loại này
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[480px] lg:max-h-none overflow-y-auto overflow-x-hidden pr-1 lg:absolute lg:inset-0">
                          {displayedChuyen.map((c, idx) => {
                            const ngayYmd = String(c.gio_lap || '').slice(0, 10);
                            const thu = getThuTiengViet(ngayYmd);
                            const isChuNhat = thu === 'Chủ nhật';
                            const bcvhTen = bcvhMap.get(c.ma_bcvh_dich) || c.ma_bcvh_dich;
                            const isMatDauChac = c.loai === 'MAT_DAU_CHAC';
                            const pctBar = Math.min(100, Math.max(0, ((c.so_shbg || 0) / maxShbgChuyen) * 100));

                            return (
                              <div
                                key={`${c.ma_bd10 || idx}-${c.gio_lap}-${c.ma_bcvh_dich}`}
                                className="p-3 bg-gray-50 rounded-[10px] border border-gray-100 hover:border-gray-200 transition-colors space-y-1.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-bold text-gray-900">
                                      {c.ma_bcvh_dich} · {bcvhTen}
                                    </span>
                                    {c.ma_bd10 && (
                                      <span className="text-[11px] font-medium text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                        {c.ma_bd10}
                                      </span>
                                    )}
                                    {isMatDauChac ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                                        Mất dấu chắc chắn
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                        Nghi ngờ thiếu file dữ liệu của BCVH
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <strong className="text-sm font-extrabold text-red-700 tabular-nums">
                                      {formatInt(c.so_chua_thay || c.so_shbg)}
                                    </strong>
                                    <span className="text-gray-500 text-xs ml-1">SHBG</span>
                                  </div>
                                </div>

                                {/* Thanh số lượng SHBG */}
                                <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                                  <div
                                    style={{ width: `${pctBar}%` }}
                                    className={`h-full rounded-full ${isMatDauChac ? 'bg-[#B3202A]' : 'bg-[#D97706]'}`}
                                  />
                                </div>

                                {/* Dòng ngày giờ lập và ghi chú */}
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-gray-500 pt-0.5">
                                  <div className="flex items-center gap-2">
                                    <span>Lập lúc: <strong className="text-gray-700">{formatDateTimeWithoutSeconds(c.gio_lap)}</strong></span>
                                    <span className={isChuNhat ? 'font-bold text-red-700 bg-red-50 px-1 rounded' : 'text-gray-600'}>
                                      {thu}
                                    </span>
                                  </div>

                                  {!isMatDauChac && (
                                    <span className="text-amber-800 italic text-[11px]">
                                      BCVH không có file dữ liệu của ngày này nên chưa chắc đã mất dấu
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nút Xem tất cả / Thu gọn nếu có nhiều chuyến */}
                  {filteredChuyen.length > 15 && (
                    <div className="pt-2 border-t border-gray-100 flex justify-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAllTrips((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A1D6E] hover:underline cursor-pointer py-1 px-3 rounded-[6px] hover:bg-purple-50 transition-colors"
                      >
                        {showAllTrips ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Thu gọn (hiện 15 chuyến)</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Xem tất cả {filteredChuyen.length} chuyến</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Phải: Nguồn của N SHBG chưa thấy ── */}
                <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="border-b border-gray-100 pb-2">
                      <h3 className="text-sm font-bold text-gray-900">
                        Nguồn của {formatInt(thanh1Tong)} SHBG chưa thấy
                      </h3>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Phân bổ theo bưu cục nhận và theo loại túi / kiện bưu gửi
                      </div>
                    </div>

                    {/* (i) Chia theo BCVH */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <span>(i) Chia theo BCVH đích</span>
                        <span className="tabular-nums font-semibold text-gray-500">
                          Tổng: {formatInt(thanh1Tong)} SHBG
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {BCVH_LIST.map((b) => {
                          const count = theoBcvhNguon[b.ma] || 0;
                          const pct = thanh1Tong > 0 ? (count / thanh1Tong) * 100 : 0;
                          return (
                            <div key={b.ma} className="bg-gray-50 p-2 rounded-[8px] border border-gray-100 space-y-1">
                              <div className="flex justify-between text-[11px] text-gray-700 font-semibold">
                                <span>{b.ten}</span>
                                <span className="text-[#B3202A] tabular-nums font-bold">{formatInt(count)}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                <div style={{ width: `${pct}%` }} className="h-full bg-[#B3202A] rounded-full" />
                              </div>
                              <div className="text-[11px] text-right text-gray-400 tabular-nums">
                                {formatPercent(thanh1Tong > 0 ? count / thanh1Tong : 0)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* (ii) Chia theo loại túi/kiện */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <span>(ii) Chia theo loại túi / kiện</span>
                        <span className="tabular-nums font-semibold text-gray-500">
                          {theoLyDoNguon.length} nhóm phân loại
                        </span>
                      </div>

                      <div className="space-y-2">
                        {theoLyDoNguon.map((item) => {
                          const soLuong = item.so_luong || 0;
                          const nghi = item.nghi_duong_tinh_gia || 0;
                          const pct = thanh1Tong > 0 ? (soLuong / thanh1Tong) * 100 : 0;

                          return (
                            <div key={item.ma || item.nhan} className="p-2.5 bg-gray-50 rounded-[8px] border border-gray-100 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                                <span className="font-semibold text-gray-800">
                                  {item.nhan}
                                </span>
                                <div className="flex items-center gap-1.5 tabular-nums">
                                  <strong className="text-gray-900 font-bold">{formatInt(soLuong)}</strong>
                                  <span className="text-gray-500 text-[11px]">
                                    ({formatPercent(thanh1Tong > 0 ? soLuong / thanh1Tong : 0)})
                                  </span>
                                </div>
                              </div>

                              <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                                <div style={{ width: `${pct}%` }} className="h-full bg-purple-600 rounded-full" />
                              </div>

                              {nghi > 0 && (
                                <div className="text-[11px] text-amber-700 flex items-center gap-1 pt-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  <span>trong đó {formatInt(nghi)} có thể do BCVH thiếu dữ liệu</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dòng chú thích bắt buộc */}
                    <div className="text-xs italic text-gray-500 bg-slate-50 p-2.5 rounded-[8px] border border-gray-200">
                      Hai cách chia khác nhau, không cộng với nhau.
                    </div>

                    {/* Nhóm thiếu giờ quét túi đến ở KTT */}
                    {thieuGioTong > 0 && (
                      <div className="p-3 bg-amber-50/70 rounded-[10px] border border-amber-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-bold text-amber-900">
                          <span>Nhóm thiếu giờ quét túi đến ở KTT:</span>
                          <span className="tabular-nums font-extrabold">{formatInt(thieuGioTong)} SHBG</span>
                        </div>
                        <div className="text-gray-600 space-y-0.5 text-[11px]">
                          <div>• Đã thấy ở đích: <strong className="text-emerald-800 tabular-nums">{formatInt(thieuGioDaThay)}</strong> SHBG</div>
                          <div>
                            • Chưa thấy: <strong className="text-red-700 tabular-nums">{formatInt(thieuGioChuaThay)}</strong> SHBG
                            {thieuGioTheoNguon.length > 0 && (
                              <span className="ml-1 text-gray-500">
                                ({thieuGioTheoNguon.map((n) => `${n.nhan}: ${formatInt(n.so_luong)}`).join(' · ')})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MỤC 3.5: KHỐI «ĐÁNH GIÁ» ────────────────────────────────────────── */}
          {danhGiaData && (
            <KttDoiChieuDanhGia
              danh_gia={danhGiaData.danh_gia}
              tu={dateRange?.from}
              den={dateRange?.to}
              maBcvh={selectedBcvh}
            />
          )}
        </div>
      )}
    </div>
  );
}
