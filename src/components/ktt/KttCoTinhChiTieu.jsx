import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import {
  formatInt,
  formatPercent,
  formatDdMm,
} from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatDecimal, getQuickDateRange } from './kttFormatters';
import {
  fetchKttGioDen,
  fetchKttConLaiTheoGio,
  fetchKttBucTranhChuyenXe,
  fetchKttKhongDat14h,
} from './kttApi';
import KttKhongDat14h from './KttKhongDat14h';

// Bảng màu chuẩn đường thư theo bản vẽ v19
const ROUTE_PALETTE = [
  '#4A1D6E', // Tím bưu điện (đường 1)
  '#E0A82E', // Vàng hoàng kim (đường 2)
  '#1F7A5C', // Xanh ngọc (đường 3)
  '#B3202A', // Đỏ vang (đường 4)
  '#2F6FB0', // Xanh lam (đường 5)
  '#7A4FA3', // Tím nhạt (đường 6)
  '#C2185B', // Hồng cánh sen (đường 7)
  '#00838F', // Xanh mòng két (đường 8)
];
const COLOR_OTHER = '#8C8296'; // Xám gom «Khác»

// Chuyển đổi chuỗi HH:MM thành số phút từ 00:00
function hhmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const parts = hhmm.split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function KttCoTinhChiTieu({
  dateRange,
  selectedBcvh,
  authUser,
  onQuickRangeChange,
  meta,
  activeMoc: controlledMoc,
  onActiveMocChange,
  unit: controlledUnit,
  onUnitChange,
  loaiNgay: controlledLoaiNgay,
  onLoaiNgayChange,
  selectedDuongThu: controlledSelectedDuongThu,
  onSelectedDuongThuChange,
  mocChiTieu,
  onMocChiTieuChange,
}) {
  // Mốc giờ đến: 'A' (Giờ xác nhận BD10 đến - mặc định) hoặc 'B' (Giờ quét túi đến)
  const [localActiveMoc, setLocalActiveMoc] = useState(mocChiTieu === 'quet_tui_den' ? 'B' : 'A');
  // Đơn vị đo: 'shbg' (Bưu gửi) | 'kg' (Khối lượng (kg))
  const [localUnit, setLocalUnit] = useState('shbg');
  // Loại ngày: 'thuong' (Ngày thường) | 'chu_nhat' (Chủ nhật)
  const [localLoaiNgay, setLocalLoaiNgay] = useState('thuong');
  // Lọc đường thư: mảng các khóa đường thư được chọn (tối đa 8)
  const [localSelectedDuongThu, setLocalSelectedDuongThu] = useState([]);

  const activeMoc = controlledMoc ?? localActiveMoc;
  const setActiveMoc = onActiveMocChange || setLocalActiveMoc;
  const unit = controlledUnit ?? localUnit;
  const setUnit = onUnitChange || setLocalUnit;
  const loaiNgay = controlledLoaiNgay ?? localLoaiNgay;
  const setLoaiNgay = onLoaiNgayChange || setLocalLoaiNgay;
  const selectedDuongThu = controlledSelectedDuongThu ?? localSelectedDuongThu;
  const setSelectedDuongThu = onSelectedDuongThuChange || setLocalSelectedDuongThu;

  // BCVH áp dụng lịch xe cấp 2 (nếu selectedBcvh === 'all', mặc định BCVH đầu danh sách)
  const defaultBcvh = BCVH_LIST[0]?.ma || '';
  const [bcvhSchedule, setBcvhSchedule] = useState(
    selectedBcvh && selectedBcvh !== 'all' ? selectedBcvh : defaultBcvh
  );

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const filterDropdownRef = useRef(null);

  // Mở rộng tất cả đường thư ở bảng
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  // Trạng thái mở các chuyến con của từng đường thư
  const [openChuyen, setOpenChuyen] = useState({});
  // Trạng thái mở khối thu gọn «Vì sao không đạt 14 giờ» (tránh tải khi đóng)
  const [isKhongDatOpen, setIsKhongDatOpen] = useState(false);

  // Dữ liệu API
  const [gioDenData, setGioDenData] = useState(null);
  const [conLaiData, setConLaiData] = useState(null);
  const [chuyenXeData, setChuyenXeData] = useState(null);
  const [khongDatData, setKhongDatData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusCode, setStatusCode] = useState(null);
  const [conLaiError, setConLaiError] = useState(null);
  const [conLaiReloading, setConLaiReloading] = useState(false);
  const [chuyenXeError, setChuyenXeError] = useState(null);
  const [chuyenXeReloading, setChuyenXeReloading] = useState(false);
  const [khongDatError, setKhongDatError] = useState(null);

  // Ref chống race condition
  const mainRequestIdRef = useRef(0);
  const conLaiReqIdRef = useRef(0);
  const chuyenXeReqIdRef = useRef(0);

  // Đồng bộ activeMoc khi mocChiTieu bên ngoài thay đổi (nếu dùng chế độ uncontrolled)
  useEffect(() => {
    if (controlledMoc !== undefined) return;
    if (mocChiTieu === 'quet_tui_den') {
      setLocalActiveMoc('B');
    } else if (mocChiTieu === 'xnd') {
      setLocalActiveMoc('A');
    }
  }, [mocChiTieu, controlledMoc]);

  // Đồng bộ bcvhSchedule khi selectedBcvh bên ngoài thay đổi
  useEffect(() => {
    if (selectedBcvh && selectedBcvh !== 'all') {
      setBcvhSchedule(selectedBcvh);
    }
  }, [selectedBcvh]);

  // Đóng dropdown lọc khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
        setShowFilterDropdown(false);
      }
    }
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterDropdown]);

  // BCVH hiệu lực để tính lịch xe cấp 2
  const effBcvh = selectedBcvh !== 'all' ? selectedBcvh : bcvhSchedule;

  // Tải dữ liệu chính với chống race condition (3.5: xóa dữ liệu bộ lọc cũ ngay khi bộ lọc đổi, không giữ số cũ khi route lỗi)
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const reqId = ++mainRequestIdRef.current;
    conLaiReqIdRef.current++;
    chuyenXeReqIdRef.current++;

    setLoading(true);
    setError(null);
    setStatusCode(null);
    setConLaiError(null);
    setChuyenXeError(null);
    setKhongDatError(null);
    setGioDenData(null);
    setConLaiData(null);
    setChuyenXeData(null);
    setKhongDatData(null);

    const gioDenParams = {
      tu: dateRange.from,
      den: dateRange.to,
      loai_ngay: loaiNgay,
      bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
      duong_thu: selectedDuongThu.length > 0 ? selectedDuongThu : undefined,
    };

    const conLaiParams = {
      loai_ngay: loaiNgay,
      bcvh: effBcvh,
    };

    const chuyenXeParams = {
      tu: dateRange.from,
      den: dateRange.to,
      moc: activeMoc,
      loai_ngay: loaiNgay,
      bcvh: effBcvh,
    };

    const khongDatParams = {
      tu: dateRange.from,
      den: dateRange.to,
      moc: activeMoc,
      ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
    };

    try {
      const [sGioDen, sConLai, sChuyenXe, sKhongDat] = await Promise.allSettled([
        fetchKttGioDen(gioDenParams),
        fetchKttConLaiTheoGio(conLaiParams),
        fetchKttBucTranhChuyenXe(chuyenXeParams),
        fetchKttKhongDat14h(khongDatParams),
      ]);

      if (reqId !== mainRequestIdRef.current) return;

      const resGioDen = sGioDen.status === 'fulfilled' ? sGioDen.value : { ok: false, error: 'Lỗi kết nối khi tải dữ liệu hàng đến theo giờ' };
      if (!resGioDen.ok) {
        setStatusCode(resGioDen.status || null);
        if (resGioDen.status === 403) {
          setError('Tài khoản không có quyền xem');
        } else {
          setError(resGioDen.error || 'Lỗi tải dữ liệu hàng đến theo giờ');
        }
        setGioDenData(null);
      } else {
        setGioDenData(resGioDen.data);
      }

      const resConLai = sConLai.status === 'fulfilled' ? sConLai.value : { ok: false, error: 'Lỗi kết nối khi tải dải chỉ tiêu theo giờ' };
      if (resConLai.ok) {
        setConLaiData(resConLai.data);
        setConLaiError(null);
      } else {
        setConLaiData(null);
        setConLaiError(resConLai.error || 'Không tải được dữ liệu chỉ tiêu theo giờ');
      }

      const resChuyenXe = sChuyenXe.status === 'fulfilled' ? sChuyenXe.value : { ok: false, error: 'Lỗi kết nối khi tải dữ liệu theo chuyến xe cấp 2' };
      if (resChuyenXe.ok) {
        setChuyenXeData(resChuyenXe.data);
        setChuyenXeError(null);
      } else {
        setChuyenXeData(null);
        setChuyenXeError(resChuyenXe.error || 'Không tải được dữ liệu theo chuyến xe cấp 2');
      }

      const resKhongDat = sKhongDat.status === 'fulfilled' ? sKhongDat.value : { ok: false, error: 'Lỗi kết nối khi tải tóm tắt nguyên nhân không đạt' };
      if (resKhongDat.ok) {
        setKhongDatData(resKhongDat.data);
        setKhongDatError(null);
      } else {
        setKhongDatData(null);
        setKhongDatError(resKhongDat.error || 'Không tải được tóm tắt nguyên nhân không đạt');
      }
    } catch (err) {
      if (reqId !== mainRequestIdRef.current) return;
      setError('Lỗi kết nối khi tải dữ liệu hàng đến theo giờ');
      setGioDenData(null);
      setConLaiData(null);
      setChuyenXeData(null);
      setKhongDatData(null);
    } finally {
      if (reqId === mainRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange?.from, dateRange?.to, loaiNgay, selectedBcvh, selectedDuongThu, effBcvh, activeMoc]);

  // Tải lại riêng route con-lai-theo-gio khi lỗi
  const reloadConLai = useCallback(async () => {
    const mainReqId = mainRequestIdRef.current;
    const subReqId = ++conLaiReqIdRef.current;
    setConLaiReloading(true);
    setConLaiError(null);
    setConLaiData(null);
    try {
      const res = await fetchKttConLaiTheoGio({ loai_ngay: loaiNgay, bcvh: effBcvh });
      if (mainReqId !== mainRequestIdRef.current || subReqId !== conLaiReqIdRef.current) return;
      if (res.ok) {
        setConLaiData(res.data);
        setConLaiError(null);
      } else {
        setConLaiData(null);
        setConLaiError(res.error || 'Không tải được dữ liệu chỉ tiêu theo giờ');
      }
    } catch (err) {
      if (mainReqId !== mainRequestIdRef.current || subReqId !== conLaiReqIdRef.current) return;
      setConLaiData(null);
      setConLaiError('Lỗi kết nối khi tải dải chỉ tiêu theo giờ');
    } finally {
      if (mainReqId === mainRequestIdRef.current && subReqId === conLaiReqIdRef.current) {
        setConLaiReloading(false);
      }
    }
  }, [loaiNgay, effBcvh]);

  // Tải lại riêng route chuyen-xe khi lỗi
  const reloadChuyenXe = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const mainReqId = mainRequestIdRef.current;
    const subReqId = ++chuyenXeReqIdRef.current;
    setChuyenXeReloading(true);
    setChuyenXeError(null);
    setChuyenXeData(null);
    try {
      const res = await fetchKttBucTranhChuyenXe({
        tu: dateRange.from,
        den: dateRange.to,
        moc: activeMoc,
        loai_ngay: loaiNgay,
        bcvh: effBcvh,
      });
      if (mainReqId !== mainRequestIdRef.current || subReqId !== chuyenXeReqIdRef.current) return;
      if (res.ok) {
        setChuyenXeData(res.data);
        setChuyenXeError(null);
      } else {
        setChuyenXeData(null);
        setChuyenXeError(res.error || 'Không tải được dữ liệu theo chuyến xe cấp 2');
      }
    } catch (err) {
      if (mainReqId !== mainRequestIdRef.current || subReqId !== chuyenXeReqIdRef.current) return;
      setChuyenXeData(null);
      setChuyenXeError('Lỗi kết nối khi tải dữ liệu theo chuyến xe cấp 2');
    } finally {
      if (mainReqId === mainRequestIdRef.current && subReqId === chuyenXeReqIdRef.current) {
        setChuyenXeReloading(false);
      }
    }
  }, [dateRange?.from, dateRange?.to, activeMoc, loaiNgay, effBcvh]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mốc dữ liệu hiện tại (A hoặc B)
  const currentMocData = useMemo(() => {
    if (!gioDenData?.theo_moc) return null;
    return gioDenData.theo_moc[activeMoc] || null;
  }, [gioDenData, activeMoc]);

  // Số ngày của loại ngày đang lọc trong khoảng (dùng thống nhất cho /ngày ở mọi khối — 3.4)
  const soNgayCuaSo = useMemo(() => {
    const fromLoc = currentMocData?.tong?.san_luong_loc?.so_ngay_cua_so;
    if (fromLoc != null && fromLoc > 0) return fromLoc;
    if (loaiNgay === 'chu_nhat') return gioDenData?.so_ngay?.chu_nhat ?? null;
    if (loaiNgay === 'thuong') return gioDenData?.so_ngay?.thuong ?? null;
    return gioDenData?.so_ngay?.tong ?? null;
  }, [currentMocData, gioDenData, loaiNgay]);

  // Nhãn và trạng thái sáng cho 2 nút chọn nhanh (dùng MỘT hàm getQuickDateRange) (3.7)
  const quickRange7 = useMemo(() => getQuickDateRange(7, meta), [meta]);
  const quickRange30 = useMemo(() => getQuickDateRange(30, meta), [meta]);
  const isQuick7Active = Boolean(
    dateRange?.from && dateRange?.to &&
    dateRange.from === quickRange7.from && dateRange.to === quickRange7.to
  );
  const isQuick30Active = Boolean(
    dateRange?.from && dateRange?.to &&
    dateRange.from === quickRange30.from && dateRange.to === quickRange30.to
  );

  // Danh sách đường thư hiển thị trên biểu đồ và bảng
  // Gán màu ổn định cho từng đường thư
  const assignedRoutes = useMemo(() => {
    if (!currentMocData?.duong_thu) return [];
    const list = currentMocData.duong_thu;
    return list.map((dt, idx) => ({
      ...dt,
      color: ROUTE_PALETTE[idx % ROUTE_PALETTE.length],
    }));
  }, [currentMocData]);

  // Bộ đường thư hiển thị trên biểu đồ cột chồng
  const chartSeries = useMemo(() => {
    if (!currentMocData) return [];
    if (selectedDuongThu.length > 0) {
      return assignedRoutes.filter((r) => selectedDuongThu.includes(r.khoa));
    }
    const top5 = assignedRoutes.slice(0, 5);
    if (currentMocData.khac && (currentMocData.khac.shbg > 0 || (currentMocData.khac.so_duong_thu != null && currentMocData.khac.so_duong_thu > 0))) {
      return [
        ...top5,
        {
          ...currentMocData.khac,
          khoa: '__KHAC__',
          ten: currentMocData.khac.so_duong_thu != null
            ? `Khác (${currentMocData.khac.so_duong_thu} đường thư)`
            : 'Khác',
          color: COLOR_OTHER,
        },
      ];
    }
    return top5;
  }, [currentMocData, assignedRoutes, selectedDuongThu]);

  // Khối BCVH từ con-lai-theo-gio (3.9a & 3.9b)
  const conLaiBcvhBlock = useMemo(() => {
    if (!conLaiData?.theo_bcvh) return null;
    return conLaiData.theo_bcvh.find((b) => b.ma_bcvh === effBcvh) || conLaiData.theo_bcvh[0] || null;
  }, [conLaiData, effBcvh]);

  const chiTieuGio = conLaiBcvhBlock?.chi_tieu_gio ?? 14;
  const chiTieuNgoaiLe = conLaiBcvhBlock?.chi_tieu_gio_ngoai_le || null;
  const hanDenTruocPhut = conLaiData?.meta?.han_den_truoc_chuyen_phut ?? 60;

  // Dải 24 giờ của con-lai-theo-gio cho BCVH và loại ngày đang chọn
  const conLai24h = useMemo(() => {
    if (!conLaiBcvhBlock?.loai_ngay) return [];
    const loaiBlock = conLaiBcvhBlock.loai_ngay.find((l) => l.loai_ngay === loaiNgay) || conLaiBcvhBlock.loai_ngay[0];
    return loaiBlock?.gio || [];
  }, [conLaiBcvhBlock, loaiNgay]);

  const hasNgoaiLe12h = Boolean(chiTieuNgoaiLe && conLai24h.some((g) => g.con_lai_12h != null));

  // Map giờ chốt và giờ xe rời từ conLai24h
  const cutOffEvents = useMemo(() => {
    const list = [];
    conLai24h.forEach((g) => {
      if (g.gio_chot && !list.some((item) => item.gio_chot === g.gio_chot)) {
        list.push({
          gio_chot: g.gio_chot,
          gio_xe_ke_tiep: g.gio_xe_ke_tiep,
          phutChot: hhmmToMinutes(g.gio_chot),
          phutXuatPhat: hhmmToMinutes(g.gio_xe_ke_tiep),
        });
      }
    });
    return list;
  }, [conLai24h]);

  // Tính sản lượng trung bình / ngày từng giờ và tìm đỉnh cao nhất cho biểu đồ (3.4)
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      h,
      total: 0,
      segments: [],
    }));

    chartSeries.forEach((series) => {
      if (!series.theo_gio) return;
      const denom = series.san_luong_loc?.so_ngay_cua_so ?? soNgayCuaSo;
      if (!denom || denom <= 0) return;
      series.theo_gio.forEach((gItem) => {
        const h = gItem.gio;
        if (h >= 0 && h < 24) {
          const rawVal = unit === 'kg' ? gItem.kg : gItem.shbg;
          if (rawVal != null && rawVal > 0) {
            const val = rawVal / denom;
            hours[h].total += val;
            hours[h].segments.push({
              series,
              val,
            });
          }
        }
      });
    });

    const maxTotal = Math.max(...hours.map((h) => h.total), 1);
    return { hours, maxTotal };
  }, [chartSeries, unit, soNgayCuaSo]);

  // Giờ đông nhất và giờ có thời gian còn lại thấp nhất so với chỉ tiêu (để điền 3 thẻ đánh giá)
  const evaluationCards = useMemo(() => {
    if (!hourlyData || hourlyData.hours.length === 0) return null;
    let peakHour = 0;
    let peakVal = 0;
    let sumTotal = 0;

    hourlyData.hours.forEach((hItem) => {
      sumTotal += hItem.total;
      if (hItem.total > peakVal) {
        peakVal = hItem.total;
        peakHour = hItem.h;
      }
    });

    // Đường thư có sản lượng lớn nhất trong giờ cao điểm
    let peakRouteName = '—';
    let peakRouteVal = 0;
    if (hourlyData.hours[peakHour]?.segments) {
      hourlyData.hours[peakHour].segments.forEach((seg) => {
        if (seg.val > peakRouteVal) {
          peakRouteVal = seg.val;
          peakRouteName = seg.series.ten || 'Chưa có tên đường thư';
        }
      });
    }

    // Giờ có thời gian còn lại thấp nhất so với chỉ tiêu (chỉ xét các giờ có hàng)
    let lowestConLai = null;
    let lowestHour = null;
    hourlyData.hours.forEach((hItem) => {
      if (hItem.total > 0) {
        const conLaiItem = conLai24h[hItem.h];
        if (conLaiItem?.con_lai_gio != null) {
          if (lowestConLai === null || conLaiItem.con_lai_gio < lowestConLai) {
            lowestConLai = conLaiItem.con_lai_gio;
            lowestHour = hItem.h;
          }
        }
      }
    });

    // Đường thư lớn nhất toàn bộ
    const biggestRoute = assignedRoutes[0] || null;
    const bcvhName = conLaiBcvhBlock?.ten_bcvh || BCVH_LIST.find((b) => b.ma === effBcvh)?.ten || 'BCVH';

    return {
      peakHour,
      peakVal,
      peakPct: sumTotal > 0 ? Math.round((peakVal / sumTotal) * 100) : 0,
      peakRouteName,
      lowestHour,
      lowestConLai,
      bcvhName,
      biggestRoute,
    };
  }, [hourlyData, conLai24h, assignedRoutes, effBcvh, conLaiBcvhBlock]);

  // Cơ cấu A-E cho thanh stackbar của khối Vì sao không đạt 14 giờ
  const nhomSummary = useMemo(() => {
    const nhomObj = khongDatData?.tong?.theo_moc?.[activeMoc]?.nhom;
    if (!nhomObj) return null;
    const a = nhomObj.A?.shbg || 0;
    const b = nhomObj.B?.shbg || 0;
    const c = nhomObj.C?.shbg || 0;
    const d = nhomObj.D?.shbg || 0;
    const e = nhomObj.E?.shbg || 0;
    const total = a + b + c + d + e;
    if (total <= 0) return null;
    return {
      a: (a / total) * 100,
      b: (b / total) * 100,
      c: (c / total) * 100,
      d: (d / total) * 100,
      e: (e / total) * 100,
    };
  }, [khongDatData, activeMoc]);

  // Cảnh báo giờ xác nhận BD10 bị dồn
  const shouldShowCanhBaoMocA = useMemo(() => {
    if (activeMoc !== 'A') return false;
    if (gioDenData?.canh_bao_ma?.includes('MOC_A_CO_THE_MEO')) return true;
    return Boolean(
      currentMocData?.duong_thu?.some((dt) => dt.meo_theo_lo) ||
      currentMocData?.danh_sach?.some((dt) => dt.meo_theo_lo)
    );
  }, [gioDenData, currentMocData, activeMoc]);

  // Đổi mốc từ nút bên trong và đồng bộ ra ngoài
  const handleMocChange = (newMoc) => {
    setActiveMoc(newMoc);
    if (onMocChiTieuChange) {
      onMocChiTieuChange(newMoc === 'B' ? 'quet_tui_den' : 'xnd');
    }
  };

  // Toggle chọn đường thư vào biểu đồ
  const handleToggleRoute = (khoa) => {
    if (selectedDuongThu.includes(khoa)) {
      setSelectedDuongThu(selectedDuongThu.filter((k) => k !== khoa));
    } else {
      if (selectedDuongThu.length >= 8) return;
      setSelectedDuongThu([...selectedDuongThu, khoa]);
    }
  };

  // Chọn 5 đường lớn nhất
  const handleSelectTop5 = () => {
    if (currentMocData?.danh_sach) {
      const top5Khoa = currentMocData.danh_sach.slice(0, 5).map((d) => d.khoa);
      setSelectedDuongThu(top5Khoa);
    }
  };

  // Bỏ chọn tất cả
  const handleClearSelection = () => {
    setSelectedDuongThu([]);
  };

  return (
    <div className="space-y-4">
      {/* ── THANH BỘ CHỌN CHUNG Ở ĐẦU TRANG THEO BẢN VẼ V19 ─────────────────── */}
      <div className="bg-white rounded-[14px] p-4 border border-[#E4D5AE] shadow-none flex flex-wrap items-center justify-between gap-3">
        {/* Nhóm 1: Khoảng ngày nhanh («7 ngày» / «30 ngày» kèm ngày thật) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Khoảng ngày:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => onQuickRangeChange && onQuickRangeChange(7)}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                isQuick7Active
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              7 ngày ({formatDdMm(quickRange7.from)} – {formatDdMm(quickRange7.to)})
            </button>
            <button
              type="button"
              onClick={() => onQuickRangeChange && onQuickRangeChange(30)}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                isQuick30Active
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              30 ngày ({formatDdMm(quickRange30.from)} – {formatDdMm(quickRange30.to)})
            </button>
          </div>
        </div>

        {/* Nhóm 2: Lấy giờ đến theo */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Lấy giờ đến theo:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              id="ktt-chi-tieu-moc-a-btn"
              onClick={() => handleMocChange('A')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                activeMoc === 'A'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="Giờ xác nhận BD10 đến (giờ chính thức)"
            >
              Giờ xác nhận BD10 đến (chính thức)
            </button>
            <button
              type="button"
              id="ktt-chi-tieu-moc-b-btn"
              onClick={() => handleMocChange('B')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                activeMoc === 'B'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="Giờ quét túi đến KTT"
            >
              Giờ quét túi đến
            </button>
          </div>
        </div>

        {/* Nhóm 3: Đo bằng */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Đo bằng:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => setUnit('shbg')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                unit === 'shbg'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Bưu gửi
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                unit === 'kg'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Khối lượng (kg)
            </button>
          </div>
        </div>

        {/* Nhóm 4: Loại ngày */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Loại ngày:</span>
          <div className="inline-flex rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
            <button
              type="button"
              onClick={() => setLoaiNgay('thuong')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                loaiNgay === 'thuong'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Ngày thường
            </button>
            <button
              type="button"
              onClick={() => setLoaiNgay('chu_nhat')}
              className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                loaiNgay === 'chu_nhat'
                  ? 'bg-[#4A1D6E] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Chủ nhật
            </button>
          </div>
        </div>

        {/* Nhóm 5: Lịch xe cấp 2 của BCVH (v19) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
            Lịch xe cấp 2 của BCVH:
          </span>
          {selectedBcvh !== 'all' ? (
            <span className="px-2.5 py-1 rounded-[6px] bg-[#FAF5E8] border border-[#D9CBA8] text-xs font-bold text-[#4A1D6E]">
              {BCVH_LIST.find((b) => b.ma === selectedBcvh)?.ten || selectedBcvh}
            </span>
          ) : (
            <div className="inline-flex flex-wrap rounded-[8px] border border-[#D9CBA8] p-0.5 bg-[#FAF6EC]">
              {BCVH_LIST.map((b) => (
                <button
                  key={b.ma}
                  type="button"
                  onClick={() => setBcvhSchedule(b.ma)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                    bcvhSchedule === b.ma
                      ? 'bg-[#4A1D6E] text-white shadow-xs'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
                  }`}
                >
                  {b.ten.replace('BCVH ', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nhóm 6: Bộ lọc đường thư */}
        <div className="relative" ref={filterDropdownRef}>
          <button
            type="button"
            id="ktt-chi-tieu-loc-duong-thu-btn"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] border text-xs font-bold cursor-pointer transition-colors ${
              selectedDuongThu.length > 0
                ? 'border-[#4A1D6E] bg-[#F5EEFA] text-[#4A1D6E]'
                : 'border-[#D9CBA8] bg-white text-gray-700 hover:bg-[#FAF6EC]'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-[#4A1D6E]" />
            <span>Lọc đường thư</span>
            {selectedDuongThu.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#4A1D6E] text-white text-[10px]">
                {selectedDuongThu.length}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {/* Dropdown danh sách đường thư */}
          {showFilterDropdown && (
            <div className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-[12px] border border-[#D9CBA8] shadow-lg z-30 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-xs font-bold text-gray-800">
                  Lọc đường thư ({currentMocData?.danh_sach?.length || 0})
                </span>
                <span className="text-[11px] text-gray-500">Tối đa 8 đường thư</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Tìm đường thư…"
                  className="w-full text-xs px-2.5 py-1.5 pl-7 border border-[#D9CBA8] rounded-[6px] focus:outline-none focus:border-[#4A1D6E]"
                />
                <Filter className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSelectTop5}
                  className="px-2 py-1 bg-[#FAF6EC] hover:bg-[#F5EEFA] border border-[#D9CBA8] text-[#4A1D6E] rounded-[6px] text-[11px] font-semibold cursor-pointer"
                >
                  5 đường lớn nhất
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-[6px] text-[11px] font-semibold cursor-pointer"
                >
                  Bỏ chọn (xem tất cả)
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pt-1 divide-y divide-gray-50">
                {currentMocData?.danh_sach
                  ?.filter((dt) => {
                    const ten = (dt.ten || 'Chưa có tên đường thư').toLowerCase();
                    const ma = (dt.ma || '').toLowerCase();
                    const q = filterSearch.toLowerCase();
                    return ten.includes(q) || ma.includes(q);
                  })
                  .map((dt) => {
                    const isChecked = selectedDuongThu.includes(dt.khoa);
                    const disabled = !isChecked && selectedDuongThu.length >= 8;
                    return (
                      <label
                        key={dt.khoa}
                        className={`flex items-center justify-between py-1.5 px-1.5 rounded cursor-pointer text-xs ${
                          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={disabled}
                            onChange={() => handleToggleRoute(dt.khoa)}
                            className="rounded text-[#4A1D6E] focus:ring-0 cursor-pointer"
                          />
                          <span className="truncate text-gray-800 font-medium">
                            {dt.ten || 'Chưa có tên đường thư'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">
                          {formatInt(dt.shbg)}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dòng Legend các đường thư đang chọn / hiển thị */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {chartSeries.map((s) => (
          <button
            key={s.khoa}
            type="button"
            onClick={() => s.khoa !== '__KHAC__' && handleToggleRoute(s.khoa)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[16px] border text-xs font-medium cursor-pointer transition-all ${
              selectedDuongThu.includes(s.khoa)
                ? 'border-[#4A1D6E] bg-[#FAF5E8] shadow-xs'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-gray-800">{s.ten || 'Chưa có tên đường thư'}</span>
          </button>
        ))}
      </div>

      {/* Hiển thị lỗi kết nối nếu có */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[12px] text-xs text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Đang tải */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 bg-white rounded-[14px] border border-[#E4D5AE] text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-[#4A1D6E] animate-ping" />
          <span>Đang tải số liệu…</span>
        </div>
      )}

      {/* Chưa có dữ liệu */}
      {!loading && !error && gioDenData && !currentMocData && (
        <div className="bg-white rounded-[14px] p-8 border border-[#E4D5AE] text-center text-xs text-gray-500 italic">
          {gioDenData.ly_do === 'CHUA_CO_DU_LIEU' ? 'Chưa có dữ liệu' : 'Không có hàng trong khoảng này'}
        </div>
      )}

      {/* Nội dung khi có dữ liệu */}
      {!loading && currentMocData && (
        <div className="space-y-4">
          {/* ── SECTION 1: SẢN LƯỢNG HÀNG ĐẾN THEO GIỜ ───────────────────────── */}
          <section className="bg-white rounded-[14px] p-5 border border-[#E4D5AE] shadow-none space-y-4">
            <div className="space-y-1">
              <h2 className="hue-h2 text-[17px] text-[#4A1D6E] font-serif">
                Sản lượng hàng đến theo giờ
              </h2>
              <p className="text-xs text-gray-600">
                Mỗi cột là một giờ hàng đến Khai thác tỉnh, màu là đường thư. Dải bên dưới cho biết hàng đến giờ đó còn bao nhiêu giờ so với chỉ tiêu nếu xe cấp 2 đi đúng lịch. Chỉ đánh giá phần xe đến, hàng đến.
              </p>
            </div>

            {/* 3 Thẻ đánh giá (ev) */}
            {evaluationCards && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Thẻ 1: Giờ đông nhất */}
                <div className="bg-[#FAF6EC] rounded-[12px] p-3.5 border border-[#E4D5AE] space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBDDF5] text-[#4A1D6E]">
                    THÔNG TIN
                  </span>
                  <p className="text-xs text-[#5A4A62] leading-relaxed">
                    <strong>Đông nhất lúc {evaluationCards.peakHour}h.</strong> Giờ {evaluationCards.peakHour}h có{' '}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {unit === 'kg'
                        ? formatKg(evaluationCards.peakVal, { withUnit: true })
                        : `${formatInt(Math.round(evaluationCards.peakVal))} bưu gửi`}
                    </span>{' '}
                    mỗi ngày, {evaluationCards.peakPct}% {selectedDuongThu.length > 0 ? 'của các đường thư đã chọn' : 'cả ngày'}. Lớn nhất ở giờ này: {evaluationCards.peakRouteName}.
                  </p>
                </div>

                {/* Thẻ 2: Giờ đến thấp nhất so với chỉ tiêu */}
                <div
                  className={`rounded-[12px] p-3.5 border space-y-1 ${
                    evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 3
                      ? 'bg-red-50 border-red-200'
                      : evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 6
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-[#FAF6EC] border-[#E4D5AE]'
                  }`}
                >
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 3
                        ? 'bg-red-100 text-red-800'
                        : evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 6
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-[#EBDDF5] text-[#4A1D6E]'
                    }`}
                  >
                    {evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 3
                      ? 'CẢNH BÁO'
                      : evaluationCards.lowestConLai !== null && evaluationCards.lowestConLai < 6
                      ? 'LƯU Ý'
                      : 'THÔNG TIN'}
                  </span>
                  <p className="text-xs text-[#5A4A62] leading-relaxed">
                    <strong>
                      Giờ đến thấp nhất so với chỉ tiêu:{' '}
                      {evaluationCards.lowestHour !== null ? `${evaluationCards.lowestHour}h` : '—'}.
                    </strong>{' '}
                    Với lịch {evaluationCards.bcvhName}
                    {loaiNgay === 'chu_nhat' ? ' Chủ nhật' : ''}, hàng đến lúc{' '}
                    {evaluationCards.lowestHour !== null ? `${evaluationCards.lowestHour}h` : '—'} còn{' '}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {evaluationCards.lowestConLai !== null ? formatDecimal(evaluationCards.lowestConLai) : '—'}
                    </span>{' '}
                    giờ so với chỉ tiêu {chiTieuGio} giờ nếu xe đi đúng lịch.
                  </p>
                </div>

                {/* Thẻ 3: Đường thư lớn nhất */}
                <div className="bg-[#FAF6EC] rounded-[12px] p-3.5 border border-[#E4D5AE] space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBDDF5] text-[#4A1D6E]">
                    THÔNG TIN
                  </span>
                  <p className="text-xs text-[#5A4A62] leading-relaxed">
                    <strong>
                      {evaluationCards.biggestRoute?.ten || 'Chưa có tên đường thư'} lớn nhất.
                    </strong>{' '}
                    Lớn nhất trong phần đang xem (
                    {(() => {
                      const br = evaluationCards.biggestRoute;
                      if (!br) return '—';
                      if (unit === 'kg') {
                        const v = br.san_luong_loc?.kg_tb_moi_ngay_cua_so;
                        return v != null ? `${formatKg(v, { withUnit: true })} mỗi ngày` : '—';
                      }
                      const v = br.san_luong_loc?.shbg_tb_moi_ngay_cua_so;
                      return v != null ? `${formatInt(Math.round(v))} bưu gửi mỗi ngày` : '—';
                    })()}
                    ),{' '}
                    {evaluationCards.biggestRoute?.kien_di_ngoai?.ty_le != null
                      ? `${Math.round(evaluationCards.biggestRoute.kien_di_ngoai.ty_le * 100)}%`
                      : '—'}{' '}
                    là kiện đi ngoài.
                  </p>
                </div>
              </div>
            )}

            {/* Lỗi tải dải «còn so với chỉ tiêu» (3.5) */}
            {conLaiError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>Không tải được dải chỉ tiêu theo giờ: {conLaiError}</span>
                </div>
                <button
                  type="button"
                  onClick={reloadConLai}
                  disabled={conLaiReloading}
                  className="inline-flex items-center gap-1 font-semibold underline hover:no-underline cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {conLaiReloading ? 'Đang tải…' : 'Tải lại'}
                </button>
              </div>
            )}

            {/* Biểu đồ cột chồng SVG theo giờ và dải «còn so với chỉ tiêu» */}
            <div className="overflow-x-auto pt-2">
              <div className="min-w-[760px]">
                <svg
                  viewBox={hasNgoaiLe12h ? '0 0 1000 326' : '0 0 1000 290'}
                  className="w-full h-auto select-none font-sans"
                  role="img"
                  aria-label="Sản lượng hàng đến theo giờ, chia theo đường thư"
                >
                  {/* Đường kẻ ngang trục Y */}
                  {[0, 1, 2, 3].map((step) => {
                    const y = 220 - (step / 3) * 180;
                    const rawAtLine = (hourlyData.maxTotal * step) / 3;
                    return (
                      <g key={step}>
                        <line
                          x1={84}
                          y1={y}
                          x2={980}
                          y2={y}
                          stroke="#E5E7EB"
                          strokeDasharray={step > 0 ? '2 2' : undefined}
                        />
                        <text
                          x={78}
                          y={y + 4}
                          textAnchor="end"
                          fontSize={10}
                          fill="#6B7280"
                          className="tabular-nums font-mono"
                        >
                          {unit === 'kg' ? formatKg(rawAtLine) : formatInt(Math.round(rawAtLine))}
                        </text>
                      </g>
                    );
                  })}

                  {/* Đơn vị trục Y */}
                  <text x={84} y={24} fontSize={11} fontWeight={600} fill="#4B5563">
                    {unit === 'kg' ? 'kg / ngày' : 'bưu gửi / ngày'}
                  </text>

                  {/* Vạch kẻ giờ chốt chuyến và mốc giờ xe cấp 2 rời */}
                  {cutOffEvents.map((cut, idx) => {
                    const hourFrac = cut.phutChot / 60;
                    const xChot = 84 + (hourFrac / 24) * 896;
                    return (
                      <g key={idx}>
                        <line
                          x1={xChot}
                          y1={32}
                          x2={xChot}
                          y2={220}
                          stroke="#4A1D6E"
                          strokeDasharray="4 3"
                          strokeWidth={1.2}
                        />
                      </g>
                    );
                  })}

                  {/* Nhãn ký hiệu ▼ giờ xe cấp 2 rời trên đỉnh */}
                  {cutOffEvents.map((cut, idx) => {
                    const hourFrac = (cut.phutXuatPhat || 0) / 60;
                    const xDep = 84 + (hourFrac / 24) * 896;
                    return (
                      <text
                        key={idx}
                        x={xDep}
                        y={20}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={700}
                        fill="#4A1D6E"
                      >
                        ▼ {cut.gio_xe_ke_tiep}
                      </text>
                    );
                  })}

                  {/* 24 Cột giờ chồng */}
                  {hourlyData.hours.map((hItem) => {
                    const colWidth = 29;
                    const colX = 84 + (hItem.h / 24) * 896 + 4;
                    let currentY = 220;

                    return (
                      <g key={hItem.h}>
                        {/* Các đoạn chồng của cột */}
                        {hItem.segments.map((seg, sIdx) => {
                          const segHeight = (seg.val / hourlyData.maxTotal) * 180;
                          currentY -= segHeight;
                          return (
                            <rect
                              key={sIdx}
                              x={colX}
                              y={currentY}
                              width={colWidth}
                              height={segHeight}
                              fill={seg.series.color}
                            />
                          );
                        })}

                        {/* Tổng sản lượng giờ trên đỉnh cột (/ngày) */}
                        {hItem.total > 0 && (
                          <text
                            x={colX + colWidth / 2}
                            y={currentY - 4}
                            textAnchor="middle"
                            fontSize={10}
                            fill="#374151"
                            className="tabular-nums font-mono font-medium"
                          >
                            {unit === 'kg' ? formatKg(hItem.total) : formatInt(Math.round(hItem.total))}
                          </text>
                        )}

                        {/* Nhãn giờ */}
                        <text
                          x={colX + colWidth / 2}
                          y={236}
                          textAnchor="middle"
                          fontSize={11}
                          fill="#4B5563"
                          className="font-medium"
                        >
                          {hItem.h}h
                        </text>

                        {/* Ô dải «còn so với chỉ tiêu» chính (14h) */}
                        {(() => {
                          const conLaiItem = conLai24h[hItem.h];
                          const conLaiGio = conLaiItem?.con_lai_gio;
                          const bgFill =
                            conLaiGio == null
                              ? '#E5E7EB'
                              : conLaiGio < 3
                              ? '#B3202A'
                              : conLaiGio < 6
                              ? '#E0A82E'
                              : '#1F7A5C';
                          const textColor = conLaiGio == null ? '#4B5563' : '#FFFFFF';

                          return (
                            <g>
                              <rect
                                x={colX}
                                y={246}
                                width={colWidth}
                                height={28}
                                rx={4}
                                fill={bgFill}
                              />
                              <text
                                x={colX + colWidth / 2}
                                y={264}
                                textAnchor="middle"
                                fontSize={10.5}
                                fontWeight={700}
                                fill={textColor}
                                className="tabular-nums font-mono"
                              >
                                {conLaiGio != null ? formatDecimal(conLaiGio) : '—'}
                              </text>
                            </g>
                          );
                        })()}

                        {/* Ô dải ngoại lệ 12 giờ (Thuận Hóa — phường 49135, 49133) (3.9a) */}
                        {hasNgoaiLe12h && (() => {
                          const conLaiItem = conLai24h[hItem.h];
                          const conLai12 = conLaiItem?.con_lai_12h;
                          const bgFill12 =
                            conLai12 == null
                              ? '#E5E7EB'
                              : conLai12 < 3
                              ? '#B3202A'
                              : conLai12 < 6
                              ? '#E0A82E'
                              : '#1F7A5C';
                          const textColor12 = conLai12 == null ? '#4B5563' : '#FFFFFF';

                          return (
                            <g>
                              <rect
                                x={colX}
                                y={282}
                                width={colWidth}
                                height={28}
                                rx={4}
                                fill={bgFill12}
                              />
                              <text
                                x={colX + colWidth / 2}
                                y={300}
                                textAnchor="middle"
                                fontSize={10.5}
                                fontWeight={700}
                                fill={textColor12}
                                className="tabular-nums font-mono"
                              >
                                {conLai12 != null ? formatDecimal(conLai12) : '—'}
                              </text>
                            </g>
                          );
                        })()}
                      </g>
                    );
                  })}

                  {/* Nhãn bên trái cho hàng dải còn lại */}
                  <text
                    x={78}
                    y={264}
                    textAnchor="end"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="#4B5563"
                  >
                    {hasNgoaiLe12h ? `còn lại (${chiTieuGio}h)` : 'còn lại (giờ)'}
                  </text>
                  {hasNgoaiLe12h && (
                    <text
                      x={78}
                      y={300}
                      textAnchor="end"
                      fontSize={10.5}
                      fontWeight={600}
                      fill="#4A1D6E"
                    >
                      còn lại ({chiTieuNgoaiLe.gio}h)
                    </text>
                  )}
                </svg>
              </div>
            </div>

            {/* Chú giải (Legend) dưới biểu đồ */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-700 pt-2 border-t border-gray-100">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#1F7A5C] shrink-0" />
                <span>còn từ 6 giờ trở lên</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#E0A82E] shrink-0" />
                <span>còn dưới 6 giờ</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#B3202A] shrink-0" />
                <span>còn dưới 3 giờ hoặc quá chỉ tiêu</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border border-dashed border-[#4A1D6E] shrink-0" />
                <span>giờ chốt chuyến (xe rời − {hanDenTruocPhut} phút)</span>
              </span>
              <span className="text-[#4A1D6E] font-bold">▼ giờ xe cấp 2 rời</span>
              <span className="text-gray-500 italic">
                chỉ tiêu {chiTieuGio} giờ
                {chiTieuNgoaiLe
                  ? `; riêng ${conLaiBcvhBlock?.ten_bcvh || 'BCVH'} có thêm dải ${chiTieuNgoaiLe.gio} giờ cho phường ${chiTieuNgoaiLe.phuong_xa?.join(', ')}`
                  : ''}
              </span>
            </div>

            {/* Khung ĐỘ TIN CẬY SỐ LIỆU */}
            <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[12px] p-3.5 space-y-1 text-xs">
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#4A1D6E] shrink-0 uppercase tracking-wide">
                  ĐỘ TIN CẬY SỐ LIỆU:
                </span>
                <span className="text-[#5A4A62]">
                  {activeMoc === 'B' ? (
                    <>Đang xem giờ quét túi đến.</>
                  ) : (
                    <>Đang xem giờ xác nhận BD10 đến (giờ chính thức).</>
                  )}{' '}
                  Đo được <strong className="font-bold tabular-nums text-gray-900">{currentMocData.do_duoc != null ? formatInt(currentMocData.do_duoc) : '—'}</strong> / <span className="tabular-nums">{currentMocData.mau_so != null ? formatInt(currentMocData.mau_so) : '—'}</span> bưu gửi.
                  {shouldShowCanhBaoMocA && (
                    <span className="text-amber-800 ml-1 font-medium">
                      · Giờ xác nhận BD10 bị dồn (nhiều túi được xác nhận cùng một lúc), nên xem giờ quét túi đến để sát giờ xe thật
                    </span>
                  )}
                  {gioDenData?.canh_bao_ma?.includes('CANH_BAO_HE_THONG') && (
                    <span className="text-red-700 ml-1 font-medium">
                      · Hệ thống có cảnh báo về số liệu; liên hệ quản trị
                    </span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-gray-600 pl-0 sm:pl-0.5">
                Phạm vi: Chỉ gồm hàng đến 6 BCVH Huế; chưa gồm{' '}
                <strong className="font-semibold text-gray-800 tabular-nums">
                  {gioDenData?.ngoai_pham_vi?.di_ngoai_6_bcvh != null
                    ? formatInt(gioDenData.ngoai_pham_vi.di_ngoai_6_bcvh)
                    : '—'}
                </strong>{' '}
                bưu gửi đi ngoài 6 BCVH.
              </div>
            </div>
          </section>

          {/* ── SECTION 2: BẢNG THEO ĐƯỜNG THƯ ──────────────────────────────── */}
          <section className="bg-white rounded-[14px] p-5 border border-[#E4D5AE] shadow-none space-y-3">
            <div className="space-y-1">
              <h2 className="hue-h2 text-[17px] text-[#4A1D6E] font-serif">Theo đường thư</h2>
              <p className="text-xs text-gray-600">
                Xếp theo số bưu gửi giảm dần. Bấm một dòng để thêm hoặc bỏ đường thư đó khỏi biểu đồ (hoặc dùng «Lọc đường thư» để chọn tối đa 8). Một đường thư có thể có nhiều chuyến thư đến trong ngày; bấm «chuyến» để mở.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[960px] text-xs">
                <thead>
                  <tr className="bg-[#FAF5E8] border-b border-[#E4D5AE] text-[11px] font-bold text-gray-700">
                    <th className="py-2.5 px-3">Đường thư</th>
                    <th className="py-2.5 px-3 text-right">
                      {unit === 'kg' ? 'kg / ngày' : 'Bưu gửi / ngày'}
                    </th>
                    <th className="py-2.5 px-3 min-w-[150px]">Trong túi / kiện ngoài</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Giờ đến (trục 0–24h)</th>
                    <th className="py-2.5 px-3 text-center">Xe cấp 2 kế tiếp</th>
                    <th className="py-2.5 px-3 text-right">Còn so với chỉ tiêu</th>
                    <th className="py-2.5 px-3">Lưu ý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const displayList = showAllRoutes
                      ? assignedRoutes
                      : selectedDuongThu.length > 0
                      ? assignedRoutes.filter((r) => selectedDuongThu.includes(r.khoa))
                      : assignedRoutes.slice(0, 5);

                    return (
                      <>
                        {displayList.map((dt) => {
                          const isSelected = selectedDuongThu.includes(dt.khoa);
                          const isOther = dt.khoa === '__KHAC__';
                          const hasKnTyLe = dt.kien_di_ngoai?.ty_le != null;
                          const hasTuiTyLe = dt.trong_tui?.ty_le != null;
                          const knPct = hasKnTyLe ? Math.round(dt.kien_di_ngoai.ty_le * 100) : null;
                          const tuiPct = hasTuiTyLe
                            ? Math.round(dt.trong_tui.ty_le * 100)
                            : (knPct != null ? 100 - knPct : null);

                          // Lấy giờ xe kế tiếp và con_lai_gio từ conLai24h theo giờ đến của đường thư
                          const medHour = dt.gio_den_ngay?.trung_vi_phut != null
                            ? Math.floor(dt.gio_den_ngay.trung_vi_phut / 60)
                            : null;
                          const conLaiItem = medHour !== null ? conLai24h[medHour] : null;
                          const nxTruck = conLaiItem?.gio_xe_ke_tiep || '—';
                          const conLaiGio = conLaiItem?.con_lai_gio;

                          const conColor =
                            conLaiGio == null
                              ? 'text-gray-400'
                              : conLaiGio < 3
                              ? 'text-red-700 font-bold'
                              : conLaiGio < 6
                              ? 'text-amber-700 font-bold'
                              : 'text-emerald-700 font-bold';

                          const p10Min = dt.gio_den_ngay?.p10_phut;
                          const p90Min = dt.gio_den_ngay?.p90_phut;
                          const medMin = dt.gio_den_ngay?.trung_vi_phut;
                          const vatDem = Boolean(dt.gio_den_ngay?.vat_nua_dem || (p10Min != null && p90Min != null && p90Min < p10Min));

                          const leftPct = p10Min != null ? (p10Min / 1440) * 100 : 0;
                          const p90Pct = p90Min != null ? (p90Min / 1440) * 100 : 0;
                          const widthPct = p10Min != null && p90Min != null && !vatDem
                            ? Math.max(2, ((p90Min - p10Min) / 1440) * 100)
                            : 0;
                          const medPct = medMin != null ? (medMin / 1440) * 100 : 0;
                          const dtSoNgayCuaSo = dt.san_luong_loc?.so_ngay_cua_so ?? soNgayCuaSo;

                          const isOpen = openChuyen[dt.khoa] || false;

                          return (
                            <React.Fragment key={dt.khoa}>
                              <tr
                                onClick={() => !isOther && handleToggleRoute(dt.khoa)}
                                className={`transition-colors cursor-pointer ${
                                  isSelected ? 'bg-[#FAF5E8]' : 'hover:bg-gray-50'
                                }`}
                              >
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3 h-3 rounded-sm shrink-0"
                                      style={{ backgroundColor: dt.color }}
                                    />
                                    <span className="font-semibold text-gray-900">
                                      {dt.ten || 'Chưa có tên đường thư'}
                                    </span>
                                    {dt.chuyen && dt.chuyen.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenChuyen((prev) => ({
                                            ...prev,
                                            [dt.khoa]: !prev[dt.khoa],
                                          }));
                                        }}
                                        className="px-2 py-0.5 rounded-full bg-[#EBDDF5] text-[#4A1D6E] text-[10px] font-bold cursor-pointer hover:bg-[#D8BDEB]"
                                      >
                                        {dt.chuyen.length} chuyến
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                  {unit === 'kg'
                                    ? (dt.san_luong_loc?.kg_tb_moi_ngay_cua_so != null
                                        ? formatKg(dt.san_luong_loc.kg_tb_moi_ngay_cua_so, { withUnit: true })
                                        : '—')
                                    : (dt.san_luong_loc?.shbg_tb_moi_ngay_cua_so != null
                                        ? formatInt(Math.round(dt.san_luong_loc.shbg_tb_moi_ngay_cua_so))
                                        : '—')}
                                </td>
                                <td className="py-2.5 px-3">
                                  {tuiPct != null && knPct != null ? (
                                    <>
                                      <div className="w-full bg-gray-100 rounded h-2.5 overflow-hidden flex">
                                        <div
                                          style={{ width: `${tuiPct}%` }}
                                          className="bg-[#4A1D6E] h-full"
                                        />
                                        <div
                                          style={{ width: `${knPct}%` }}
                                          className="bg-[#E0A82E] h-full"
                                        />
                                      </div>
                                      <div className="text-[10px] text-gray-500 mt-1 tabular-nums">
                                        {tuiPct}% túi · {knPct}% kiện ngoài
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {medMin != null ? (
                                    <div>
                                      <div className="relative h-2.5 bg-gray-100 rounded w-full overflow-hidden">
                                        {vatDem ? (
                                          <>
                                            <div
                                              className="absolute top-0 bottom-0 rounded-l opacity-60"
                                              style={{
                                                left: `${leftPct}%`,
                                                right: '0%',
                                                backgroundColor: dt.color,
                                              }}
                                            />
                                            <div
                                              className="absolute top-0 bottom-0 rounded-r opacity-60"
                                              style={{
                                                left: '0%',
                                                width: `${Math.max(2, p90Pct)}%`,
                                                backgroundColor: dt.color,
                                              }}
                                            />
                                          </>
                                        ) : (
                                          <div
                                            className="absolute top-0 bottom-0 rounded opacity-60"
                                            style={{
                                              left: `${leftPct}%`,
                                              width: `${widthPct}%`,
                                              backgroundColor: dt.color,
                                            }}
                                          />
                                        )}
                                        <div
                                          className="absolute top-0 bottom-0 w-1 bg-gray-800 rounded-full"
                                          style={{ left: `${medPct}%` }}
                                        />
                                      </div>
                                      <div className="text-[10px] text-gray-500 mt-1 tabular-nums">
                                        {dt.gio_den_ngay?.p10}–{dt.gio_den_ngay?.p90} · thường quanh{' '}
                                        <strong className="text-gray-700">{dt.gio_den_ngay?.trung_vi}</strong>
                                        {dt.gio_den_ngay?.vat_nua_dem ? ' (qua nửa đêm)' : ''}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center tabular-nums font-medium text-gray-700">
                                  {nxTruck}
                                </td>
                                <td className={`py-2.5 px-3 text-right tabular-nums ${conColor}`}>
                                  {conLaiGio != null ? `${formatDecimal(conLaiGio)} giờ` : '—'}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {dt.co?.san_luong_khong_deu && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                        Sản lượng không đều
                                      </span>
                                    )}
                                    {dt.co?.gio_den_khong_co_dinh && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                        Giờ đến không cố định
                                      </span>
                                    )}
                                    {dt.co?.nhieu_kien_di_ngoai && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                        Nhiều kiện đi ngoài
                                      </span>
                                    )}
                                    {dt.co?.san_luong_lon && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBDDF5] text-[#4A1D6E]">
                                        Sản lượng lớn
                                      </span>
                                    )}
                                    {dt.co?.mau_it && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                        Ít số liệu
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Các dòng con chi tiết từng chuyến khi mở (chia cùng so_ngay_cua_so — 3.4) */}
                              {isOpen && dt.chuyen && dt.chuyen.map((c, cIdx) => (
                                <tr key={cIdx} className="bg-[#FAF6EC]/60 text-[11px] text-gray-600">
                                  <td className="py-1.5 px-3 pl-8">
                                    Chuyến {c.thu_tu}: {c.bang_gio?.tu}–{c.bang_gio?.den}
                                    {c.bang_gio?.vat_dem ? ' (vắt đêm)' : ''}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">
                                    {unit === 'kg'
                                      ? '—'
                                      : (c.shbg != null && dtSoNgayCuaSo > 0
                                          ? formatInt(Math.round(c.shbg / dtSoNgayCuaSo))
                                          : '—')}
                                  </td>
                                  <td></td>
                                  <td className="py-1.5 px-3 tabular-nums text-gray-500">
                                    Có hàng {c.so_ngay_co_hang != null ? c.so_ngay_co_hang : '—'} ngày
                                  </td>
                                  <td></td>
                                  <td></td>
                                  <td></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}

                        {/* Dòng gom Khác khi không lọc */}
                        {!showAllRoutes && selectedDuongThu.length === 0 && currentMocData.khac && (
                          <tr className="bg-gray-50 font-medium">
                            <td className="py-2.5 px-3 flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{ backgroundColor: COLOR_OTHER }}
                              />
                              <span>Khác ({currentMocData.khac.so_duong_thu != null ? currentMocData.khac.so_duong_thu : '—'} đường thư)</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                              {unit === 'kg'
                                ? (currentMocData.khac.san_luong_loc?.kg_tb_moi_ngay_cua_so != null
                                    ? formatKg(currentMocData.khac.san_luong_loc.kg_tb_moi_ngay_cua_so, { withUnit: true })
                                    : '—')
                                : (currentMocData.khac.san_luong_loc?.shbg_tb_moi_ngay_cua_so != null
                                    ? formatInt(Math.round(currentMocData.khac.san_luong_loc.shbg_tb_moi_ngay_cua_so))
                                    : '—')}
                            </td>
                            <td className="py-2.5 px-3">
                              {(() => {
                                const kh = currentMocData.khac;
                                const kTyLe = kh.kien_di_ngoai?.ty_le;
                                const tTyLe = kh.trong_tui?.ty_le;
                                const kShbg = kh.kien_di_ngoai?.shbg;
                                const totShbg = kh.shbg;
                                const kPct = kTyLe != null
                                  ? Math.round(kTyLe * 100)
                                  : (kShbg != null && totShbg > 0 ? Math.round((kShbg / totShbg) * 100) : null);
                                const tPct = tTyLe != null
                                  ? Math.round(tTyLe * 100)
                                  : (kPct != null ? 100 - kPct : null);
                                if (tPct == null || kPct == null) {
                                  return <span className="text-gray-400">—</span>;
                                }
                                return (
                                  <>
                                    <div className="w-full bg-gray-200 rounded h-2.5 overflow-hidden flex">
                                      <div style={{ width: `${tPct}%` }} className="bg-[#4A1D6E] h-full" />
                                      <div style={{ width: `${kPct}%` }} className="bg-[#E0A82E] h-full" />
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1 tabular-nums">
                                      {tPct}% túi · {kPct}% kiện ngoài
                                    </div>
                                  </>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-gray-400">—</td>
                            <td className="py-2.5 px-3 text-center text-gray-400">—</td>
                            <td className="py-2.5 px-3 text-right text-gray-400">—</td>
                            <td className="py-2.5 px-3 text-gray-400">—</td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAllRoutes(!showAllRoutes)}
                className="px-3 py-1.5 bg-[#4A1D6E] text-white rounded-[8px] text-xs font-bold hover:bg-[#3B1450] transition-colors cursor-pointer"
              >
                {showAllRoutes
                  ? 'Thu gọn xem 5 đường lớn nhất'
                  : `Xem tất cả ${assignedRoutes.length} đường thư`}
              </button>
              <span className="text-xs text-gray-500">
                {selectedDuongThu.length > 0
                  ? `Đang hiện ${selectedDuongThu.length} đường thư đã chọn.`
                  : showAllRoutes
                  ? `Hiện toàn bộ ${assignedRoutes.length} đường thư.`
                  : 'Hiện 5 đường thư lớn nhất, còn lại gộp ở dòng «Khác».'}
              </span>
            </div>
          </section>

          {/* ── KHỐI THU GỌN 1: THEO CHUYẾN XE CẤP 2 ─────────────────────────── */}
          <details className="bg-white rounded-[14px] border border-[#E4D5AE] shadow-none overflow-hidden group">
            <summary className="p-4 cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 hover:bg-[#FAF5E8] transition-colors">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-bold text-[#4A1D6E] font-serif">
                  Theo chuyến xe cấp 2
                </h2>
                <span className="text-xs text-gray-500">
                  Chuyến nào nhận nhiều hàng, cách giờ chốt chuyến bao nhiêu phút
                </span>
                {chuyenXeError && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                    Lỗi tải dữ liệu
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-[#4A1D6E] group-open:hidden">
                Mở
              </span>
              <span className="text-xs font-bold text-[#4A1D6E] hidden group-open:inline">
                Thu gọn
              </span>
            </summary>
            <div className="p-4 pt-2 border-t border-gray-100 space-y-3">
              {chuyenXeError ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>Không tải được dữ liệu theo chuyến xe cấp 2: {chuyenXeError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={reloadChuyenXe}
                    disabled={chuyenXeReloading}
                    className="inline-flex items-center gap-1 font-semibold underline hover:no-underline cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {chuyenXeReloading ? 'Đang tải…' : 'Tải lại'}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF5E8] text-[11px] font-bold text-gray-700 border-b border-[#E4D5AE]">
                        <th className="py-2.5 px-3">Chuyến xe cấp 2</th>
                        <th className="py-2.5 px-3">Giờ chốt chuyến</th>
                        <th className="py-2.5 px-3 text-right">
                          {unit === 'kg' ? 'kg / ngày' : 'Bưu gửi / ngày'}
                        </th>
                        <th className="py-2.5 px-3 text-right">Tỷ trọng</th>
                        <th className="py-2.5 px-3 text-right">
                          Cách giờ chốt chuyến (thường gặp)
                        </th>
                        <th className="py-2.5 px-3">Nhận từ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {chuyenXeData?.theo_moc?.[activeMoc]?.chuyen?.length > 0 ? (
                        chuyenXeData.theo_moc[activeMoc].chuyen.map((cItem, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="py-2 px-3 font-semibold text-gray-900">
                              {BCVH_LIST.find((b) => b.ma === cItem.ma_bcvh)?.ten || cItem.ma_bcvh} · {cItem.gio_xuat_phat}
                            </td>
                            <td className="py-2 px-3 tabular-nums text-gray-700">
                              {cItem.gio_chot}
                            </td>
                            <td className="py-2 px-3 text-right font-bold tabular-nums">
                              {unit === 'kg'
                                ? (cItem.kg != null && soNgayCuaSo > 0
                                    ? formatKg(cItem.kg / soNgayCuaSo, { withUnit: true })
                                    : '—')
                                : (cItem.shbg != null && soNgayCuaSo > 0
                                    ? formatInt(Math.round(cItem.shbg / soNgayCuaSo))
                                    : '—')}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums">
                              {cItem.ty_le_san_luong_bcvh != null ? formatPercent(cItem.ty_le_san_luong_bcvh) : '—'}
                              {cItem.co?.chuyen_gom_nhieu_hang && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                  gom nhiều hàng
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                              {cItem.sat_gio_chot?.phut_trung_vi != null ? `${cItem.sat_gio_chot.phut_trung_vi} phút` : '—'}
                            </td>
                            <td className="py-2 px-3 text-gray-500">
                              {cItem.nguon_cum?.map((nc) => nc.ten).join(', ') || '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-gray-400 italic">
                            Chưa có dữ liệu chuyến xe
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>

          {/* ── KHỐI THU GỌN 2: VÌ SAO KHÔNG ĐẠT 14 GIỜ ───────────────────────── */}
          <details
            open={isKhongDatOpen}
            onToggle={(e) => setIsKhongDatOpen(e.currentTarget.open)}
            className="bg-white rounded-[14px] border border-[#E4D5AE] shadow-none overflow-hidden group"
          >
            <summary className="p-4 cursor-pointer list-none flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF5E8] transition-colors">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-bold text-[#4A1D6E] font-serif">
                  Vì sao không đạt 14 giờ
                </h2>
                {nhomSummary && (
                  <div
                    className="flex h-4 rounded overflow-hidden w-48 bg-gray-100"
                    aria-label="Cơ cấu nhóm nguyên nhân"
                  >
                    <div style={{ width: `${nhomSummary.a}%`, backgroundColor: '#E0A82E' }} title="A lỡ chuyến sát giờ" />
                    <div style={{ width: `${nhomSummary.b}%`, backgroundColor: '#B3202A' }} title="B trượt chuyến" />
                    <div style={{ width: `${nhomSummary.c}%`, backgroundColor: '#2F6FB0' }} title="C đúng chuyến vẫn quá" />
                    <div style={{ width: `${nhomSummary.d}%`, backgroundColor: '#8C8296' }} title="D chưa phân loại" />
                    <div style={{ width: `${nhomSummary.e}%`, backgroundColor: '#7A4FA3' }} title="E chưa đi" />
                  </div>
                )}
                {khongDatError && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                    Lỗi tải tóm tắt
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  A lỡ chuyến sát giờ · B trượt chuyến · C đúng chuyến vẫn quá · D chưa phân loại · E chưa đi
                </span>
              </div>
              <span className="text-xs font-bold text-[#4A1D6E] group-open:hidden">
                Mở chi tiết
              </span>
              <span className="text-xs font-bold text-[#4A1D6E] hidden group-open:inline">
                Thu gọn
              </span>
            </summary>
            <div className="p-4 pt-0 border-t border-gray-100">
              {/* Nhúng khối KttKhongDat14h — nút xuất Excel duy nhất ở khối này; chỉ gắn khi mở */}
              {isKhongDatOpen && (
                <KttKhongDat14h
                  dateRange={dateRange}
                  selectedBcvh={selectedBcvh}
                  mocChiTieu={activeMoc === 'B' ? 'quet_tui_den' : 'xnd'}
                />
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
