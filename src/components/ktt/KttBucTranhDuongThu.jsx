import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, Clock, Truck, ShieldAlert, AlertTriangle, Eye, Info, CheckCircle2 } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatDecimal, formatTimeShort } from './kttFormatters';
import { fetchKttBucTranhCum, fetchKttBucTranhChuyenXe, fetchKttBucTranhDanhGia } from './kttApi';

const LOAI_NGAY_OPTIONS = [
  { key: 'tat_ca', label: 'Tất cả loại ngày' },
  { key: 'thuong', label: 'Ngày thường' },
  { key: 'chu_nhat', label: 'Chủ nhật' },
];

export default function KttBucTranhDuongThu({
  dateRange,
  selectedBcvh,
  mocChiTieu,
  onSelectDuongThu,
}) {
  const [moc, setMoc] = useState('A');
  const [unit, setUnit] = useState('shbg'); // 'shbg' | 'kg'
  const [loaiNgay, setLoaiNgay] = useState('tat_ca');
  const [localBcvh, setLocalBcvh] = useState(selectedBcvh && selectedBcvh !== 'all' ? selectedBcvh : 'all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusCode, setStatusCode] = useState(null);

  const [cumData, setCumData] = useState(null);
  const [chuyenData, setChuyenData] = useState(null);
  const [danhGiaData, setDanhGiaData] = useState(null);

  // Đồng bộ mốc từ ngoài nếu thay đổi (mặc định A)
  useEffect(() => {
    if (mocChiTieu === 'quet_tui_den') {
      setMoc('B');
    } else {
      setMoc('A');
    }
  }, [mocChiTieu]);

  // Đồng bộ BCVH từ filter ngoài
  useEffect(() => {
    if (selectedBcvh && selectedBcvh !== 'all') {
      setLocalBcvh(selectedBcvh);
    }
  }, [selectedBcvh]);

  const loadAll = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    setError(null);
    setStatusCode(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      moc,
      loai_ngay: loaiNgay,
      bcvh: localBcvh !== 'all' ? localBcvh : undefined,
    };

    try {
      const [resCum, resChuyen, resDanhGia] = await Promise.all([
        fetchKttBucTranhCum(params),
        fetchKttBucTranhChuyenXe(params),
        fetchKttBucTranhDanhGia(params),
      ]);

      if (!resCum.ok) {
        setStatusCode(resCum.status);
        setError(resCum.error || 'Lỗi tải dữ liệu chuyến thư đến');
        return;
      }
      if (!resChuyen.ok) {
        setStatusCode(resChuyen.status);
        setError(resChuyen.error || 'Lỗi tải dữ liệu chuyến xe');
        return;
      }
      if (!resDanhGia.ok) {
        setStatusCode(resDanhGia.status);
        setError(resDanhGia.error || 'Lỗi tải dữ liệu đánh giá');
        return;
      }

      setCumData(resCum.data);
      setChuyenData(resChuyen.data);
      setDanhGiaData(resDanhGia.data);
    } catch (err) {
      setError('Lỗi kết nối khi tải Bức tranh đường thư đến.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, moc, loaiNgay, localBcvh]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Trích xuất dữ liệu theo mốc hiện tại
  const currentCumMoc = cumData?.theo_moc?.[moc] || null;
  const currentChuyenMoc = chuyenData?.theo_moc?.[moc] || null;
  const currentDanhGiaMoc = danhGiaData?.theo_moc?.[moc] || null;

  const cumList = useMemo(() => currentCumMoc?.cum || [], [currentCumMoc]);
  const chuyenList = useMemo(() => currentChuyenMoc?.chuyen || [], [currentChuyenMoc]);
  const theList = useMemo(() => currentDanhGiaMoc?.the || [], [currentDanhGiaMoc]);
  const mauItList = useMemo(() => currentDanhGiaMoc?.mau_it || [], [currentDanhGiaMoc]);

  // Map cụm id -> thông tin chuyến xe kế tiếp từ ô[] của chuyenData
  const oMap = useMemo(() => {
    const map = new Map();
    const oList = currentChuyenMoc?.o || [];
    for (const o of oList) {
      if (!map.has(o.cum_id)) {
        map.set(o.cum_id, []);
      }
      map.get(o.cum_id).push(o);
    }
    return map;
  }, [currentChuyenMoc]);

  // Render giá trị sản lượng theo unit
  const renderValue = (shbg, kg, thieuKg = 0) => {
    if (unit === 'kg') {
      if (kg === null || kg === undefined) return <span className="text-gray-400">chưa đủ số liệu</span>;
      return (
        <span>
          {formatKg(kg, { withUnit: true })}
          {thieuKg > 0 && (
            <span className="text-[10px] text-gray-400 block font-normal">
              ({formatInt(thieuKg)} chưa rõ kg)
            </span>
          )}
        </span>
      );
    }
    return <span>{formatInt(shbg)} bưu gửi</span>;
  };

  // Render mức độ thẻ
  const getMucBadge = (muc, co) => {
    if (co === 'sat_gio_chot' || muc === 'theo_doi') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]">
          <Eye className="w-3 h-3 text-[#6B21A8]" />
          THEO DÕI
        </span>
      );
    }
    if (muc === 'canh_bao') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
          <ShieldAlert className="w-3 h-3 text-[#991B1B]" />
          CẢNH BÁO
        </span>
      );
    }
    if (muc === 'luu_y') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
          <AlertTriangle className="w-3 h-3 text-[#92400E]" />
          LƯU Ý
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#DBEAFE]">
        <Info className="w-3 h-3 text-[#1E40AF]" />
        THÔNG TIN
      </span>
    );
  };

  if (statusCode === 403) {
    return (
      <div className="bg-white rounded-[14px] p-6 border border-gray-200 mt-6 text-center">
        <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 px-4 py-2 rounded-lg text-sm font-medium">
          <AlertCircle className="w-4 h-4" />
          không đủ quyền
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 mt-6 space-y-6 shadow-sm">
      {/* ── HEADER KHỐI & BỘ CHỌN ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-bold text-gray-900 tracking-tight">
              Bức tranh đường thư đến
            </h2>
            <span className="text-xs bg-[#F0FDF4] text-[#166534] border border-[#DCFCE7] px-2 py-0.5 rounded-full font-medium">
              Chuyến thư đến & chuyến xe cấp 2
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Nhận diện khung giờ hàng đến, đối chiếu giờ chốt chuyến và đánh giá khả năng lưu thoát theo lịch
          </p>
        </div>

        {/* Các nút bấm chuyển mốc, đơn vị và bộ lọc */}
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

          {/* Loại ngày */}
          <select
            value={loaiNgay}
            onChange={(e) => setLoaiNgay(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {LOAI_NGAY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Lịch xe BCVH */}
          <select
            value={localBcvh}
            onChange={(e) => setLocalBcvh(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">Tất cả BCVH đến</option>
            {BCVH_LIST.map((b) => (
              <option key={b.ma} value={b.ma}>
                {b.ten}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── CẢNH BÁO & THỐNG KÊ MỐC ─────────────────────────────────── */}
      {currentCumMoc && (
        <div className="bg-[#F8FAFC] border border-gray-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap text-gray-700">
            <span>
              Mẫu số lưu thoát: <strong className="text-gray-900 font-semibold">{formatInt(currentCumMoc.mau_so)}</strong> bưu gửi
            </span>
            <span className="text-gray-300">|</span>
            <span>
              Đo được mốc {moc}: <strong className="text-blue-700 font-semibold">{formatInt(currentCumMoc.do_duoc)}</strong> / {formatInt(currentCumMoc.mau_so)} bưu gửi
            </span>
            {currentCumMoc.khong_do_duoc > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-amber-700">
                  Không đo được: <strong>{formatInt(currentCumMoc.khong_do_duoc)}</strong> bưu gửi
                </span>
              </>
            )}
          </div>

          {moc === 'A' && cumList.some((c) => c.gio_den?.meo_theo_lo) && (
            <div className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              giờ đến theo mốc A bị méo theo lô xác nhận (khuyến nghị xem mốc B để chẩn đoán)
            </div>
          )}
        </div>
      )}

      {/* ── TRẠNG THÁI TẢI / LỖI / RỖNG ──────────────────────────────── */}
      {loading && (
        <div className="py-16 text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mb-3" />
          <p className="text-sm font-medium">Đang tính toán Bức tranh đường thư đến...</p>
          <p className="text-xs text-gray-400 mt-1">Lần tải 30 ngày có thể mất 10–12 giây</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && cumData && !cumData.co_du_lieu && (
        <div className="py-12 text-center text-gray-500">
          chưa có dữ liệu
        </div>
      )}

      {!loading && !error && cumData && cumData.co_du_lieu && (
        <>
          {/* ── 1. BIỂU ĐỒ KHUNG GIỜ ĐẾN VÀ CHUYẾN XE CẤP 2 KẾ TIẾP ────── */}
          <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Biểu đồ khung giờ đến và chuyến xe cấp 2 kế tiếp
                </h3>
              </div>
              <span className="text-[11px] text-gray-500 font-normal">
                Trục thời gian 24 giờ trong ngày (00:00 – 24:00)
              </span>
            </div>

            {/* Thông báo hướng dẫn khi đang chọn Tất cả BCVH */}
            {localBcvh === 'all' && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>chọn một BCVH để xem chuyến xe cấp 2 (hiển thị giờ xe rời và giờ chốt chuyến trên trục thời gian)</span>
              </div>
            )}

            {/* Trục 24 giờ trực quan */}
            <div className="overflow-x-auto pt-2 pb-1">
              <div className="min-w-[860px] relative">
                {/* Vạch giờ */}
                <div className="flex justify-between border-b border-gray-300 pb-1 text-[10px] text-gray-400 font-mono">
                  {Array.from({ length: 9 }).map((_, i) => {
                    const h = i * 3;
                    return (
                      <span key={h} className="text-center w-8">
                        {String(h).padStart(2, '0')}:00
                      </span>
                    );
                  })}
                </div>

                {/* Vạch các chuyến xe cấp 2 nếu đã chọn 1 BCVH cụ thể */}
                {localBcvh !== 'all' && (() => {
                  const chuyenC2 = chuyenList.filter((c) => c.ma_bcvh === localBcvh);
                  if (chuyenC2.length === 0) return null;

                  return (
                    <div className="relative h-7 my-1 border-b border-gray-200/80 bg-emerald-50/40 rounded px-1 flex items-center">
                      <div className="w-64 text-[11px] text-emerald-800 font-bold shrink-0 pr-2 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Chuyến xe cấp 2 ({localBcvh}):</span>
                      </div>
                      <div className="flex-1 relative h-full">
                        {chuyenC2.map((c, cidx) => {
                          const [xH, xM] = (c.gio_xuat_phat || '00:00').split(':').map(Number);
                          const [cH, cM] = (c.gio_chot || '00:00').split(':').map(Number);
                          const xPct = Math.min(100, Math.max(0, ((xH * 60 + xM) / 1440) * 100));
                          const cPct = Math.min(100, Math.max(0, ((cH * 60 + cM) / 1440) * 100));

                          return (
                            <React.Fragment key={cidx}>
                              {/* Vạch giờ chốt chuyến */}
                              <div
                                className="absolute top-0 bottom-0 border-l-2 border-dashed border-amber-500 z-10"
                                style={{ left: `${cPct}%` }}
                                title={`Giờ chốt chuyến: ${c.gio_chot} (hạn hàng đến)`}
                              >
                                <span className="absolute -top-3 left-0.5 text-[9px] font-mono text-amber-700 font-bold whitespace-nowrap bg-amber-50 px-0.5 rounded">
                                  Chốt {c.gio_chot}
                                </span>
                              </div>
                              {/* Vạch giờ xe rời */}
                              <div
                                className="absolute top-0 bottom-0 border-l-2 border-emerald-600 z-10"
                                style={{ left: `${xPct}%` }}
                                title={`Giờ xe rời: ${c.gio_xuat_phat}`}
                              >
                                <span className="absolute top-3 left-0.5 text-[9px] font-mono text-emerald-800 font-bold whitespace-nowrap bg-emerald-100 px-0.5 rounded">
                                  Rời {c.gio_xuat_phat}
                                </span>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <div className="w-24 shrink-0" />
                    </div>
                  );
                })()}

                {/* Các dải khung giờ đến của từng chuyến thư đến */}
                <div className="py-2.5 space-y-2">
                  {cumList.slice(0, 12).map((cum) => {
                    const tuHhmm = cum.bang_gio?.tu || '00:00';
                    const denHhmm = cum.bang_gio?.den || '23:59';
                    const [tuH, tuM] = tuHhmm.split(':').map(Number);
                    const [denH, denM] = denHhmm.split(':').map(Number);
                    const tuPhut = tuH * 60 + tuM;
                    const denPhut = cum.bang_gio?.vat_dem ? (denH * 60 + denM + 1440) : (denH * 60 + denM);
                    const startPct = Math.min(100, Math.max(0, (tuPhut / 1440) * 100));
                    const widthPct = Math.min(100 - startPct, Math.max(2, ((denPhut - tuPhut) / 1440) * 100));

                    const trungViHhmm = cum.gio_den?.trung_vi;
                    let tvPct = null;
                    if (trungViHhmm) {
                      const [tvH, tvM] = trungViHhmm.split(':').map(Number);
                      tvPct = ((tvH * 60 + tvM) / 1440) * 100;
                    }

                    // Nhãn hiển thị: Tên đường thư kèm khung giờ hoặc số thứ tự băng
                    const tenDt = cum.duong_thu?.ten || cum.duong_thu?.ma || cum.ten;
                    const bangStr = cum.so_bang_cua_nhom > 1
                      ? ` · Băng ${cum.thu_tu_bang} (${tuHhmm}–${denHhmm})`
                      : ` (${tuHhmm}–${denHhmm})`;
                    const nhanDong = `${tenDt}${bangStr}`;

                    // Cờ bất thường
                    const coBatThuong = cum.co?.that_thuong || cum.co?.khong_co_lich_co_dinh || cum.co?.nhieu_kien_di_ngoai;

                    return (
                      <div key={cum.id} className="relative h-6 flex items-center">
                        <div
                          className="w-64 truncate text-[11px] text-gray-800 font-medium shrink-0 pr-2 cursor-pointer hover:text-blue-700"
                          title={`${cum.ten} (Mã: ${cum.duong_thu?.ma || '—'})`}
                          onClick={() => onSelectDuongThu && onSelectDuongThu(cum.duong_thu?.ma)}
                        >
                          {nhanDong}
                        </div>
                        <div className="flex-1 relative h-4 bg-gray-200/50 rounded-full overflow-hidden">
                          {/* Thanh khung giờ đến */}
                          <div
                            className={`absolute top-0 bottom-0 rounded-full ${
                              coBatThuong ? 'bg-amber-400' : 'bg-blue-500'
                            }`}
                            style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                            title={`${cum.ten}: ${tuHhmm} – ${denHhmm}${cum.bang_gio?.vat_dem ? ' (vắt đêm)' : ''}`}
                          />
                          {/* Điểm trung vị giờ đến */}
                          {tvPct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-1.5 bg-gray-900 rounded-sm -ml-0.5 z-10"
                              style={{ left: `${tvPct}%` }}
                              title={`Trung vị giờ đến: ${trungViHhmm}`}
                            />
                          )}
                        </div>
                        <div className="w-24 text-right text-[11px] tabular-nums text-gray-500 shrink-0 pl-2">
                          {trungViHhmm || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chú giải cố định */}
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 pt-2 border-t border-gray-200">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded bg-blue-500 inline-block" /> Khung giờ đến chuẩn
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded bg-amber-400 inline-block" /> Cờ chú ý (Thất thường / Không có lịch cố định / Nhiều kiện đi ngoài)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-gray-900 inline-block rounded-xs" /> Trung vị giờ đến
                  </span>
                  {localBcvh !== 'all' && (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-0.5 bg-emerald-600 inline-block" /> Giờ xe rời
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-0.5 border-b-2 border-dashed border-amber-500 inline-block" /> Giờ chốt chuyến
                      </span>
                    </>
                  )}
                  <span className="ml-auto text-gray-400">
                    Giờ chốt chuyến = giờ xe rời − 60 phút
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. BẢNG ĐƯỜNG THƯ (CHUYẾN THƯ ĐẾN) ────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>Bảng đường thư (chuyến thư đến)</span>
                <span className="text-xs font-normal text-gray-500">
                  (Xếp Pareto theo sản lượng giảm dần)
                </span>
              </h3>
              <span className="text-xs text-gray-500">
                Tổng cộng {cumList.length} chuyến thư đến
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[1100px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Đường thư & lịch</th>
                    <th className="py-2.5 px-2">Khung giờ đến</th>
                    <th className="py-2.5 px-2 text-center">Xuất hiện</th>
                    <th className="py-2.5 px-2 text-right">TB/ngày (dao động)</th>
                    <th className="py-2.5 px-2 text-right">
                      {unit === 'kg' ? 'Khối lượng' : 'Bưu gửi'} (% lũy kế)
                    </th>
                    <th className="py-2.5 px-2 text-right">Kiện đi ngoài</th>
                    <th className="py-2.5 px-2">Chuyến xe cấp 2 kế tiếp</th>
                    <th className="py-2.5 px-2 text-right">Lưu thoát theo lịch</th>
                    <th className="py-2.5 px-2 text-right">Còn lại so với chỉ tiêu</th>
                    <th className="py-2.5 px-3">Dấu hiệu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cumList.map((cum) => {
                    const oList = oMap.get(cum.id) || [];
                    const firstO = oList[0] || null;

                    // Lưu thoát theo lịch & còn lại so với chỉ tiêu
                    const luuThoatGio = firstO?.luu_thoat_theo_lich?.trung_vi_gio ?? null;
                    const conLaiGio = firstO?.con_lai?.trung_vi_gio ?? null;
                    const isQuaChiTieu = conLaiGio !== null && conLaiGio < 0;

                    // Dao động sản lượng ngày
                    const snThuong = cum.san_luong_ngay?.ngay_thuong;
                    const tbNgay = snThuong?.tb;
                    const daoDong = snThuong?.dao_dong;

                    return (
                      <tr
                        key={cum.id}
                        onClick={() => onSelectDuongThu && onSelectDuongThu(cum.duong_thu?.ma)}
                        className="hover:bg-[#FFFBEF] transition-colors cursor-pointer"
                      >
                        {/* Đường thư & Lịch */}
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-gray-900">
                            {cum.duong_thu?.ten || cum.duong_thu?.ma || '(chưa có đường thư)'}
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {cum.duong_thu?.ma} · {cum.lich?.ten || cum.lich?.ma || 'Lịch mặc định'}
                          </div>
                        </td>

                        {/* Khung giờ đến */}
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-gray-800 tabular-nums">
                            {cum.bang_gio?.tu} – {cum.bang_gio?.den}
                            {cum.bang_gio?.vat_dem && (
                              <span className="text-[10px] text-purple-700 bg-purple-50 px-1 rounded ml-1 font-normal">
                                vắt đêm
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 tabular-nums font-normal">
                            Trung vị {cum.gio_den?.trung_vi || '—'} [P10 {cum.gio_den?.p10} – P90 {cum.gio_den?.p90}]
                          </div>
                          {cum.gio_den?.meo_theo_lo && (
                            <div className="text-[10px] text-amber-700 font-normal">
                              mốc A méo theo lô
                            </div>
                          )}
                        </td>

                        {/* Xuất hiện n/30 ngày */}
                        <td className="py-2.5 px-2 text-center tabular-nums">
                          <span className="font-medium text-gray-800">
                            {cum.ngay_co_hang}
                          </span>
                          <span className="text-gray-400">/{snThuong?.so_ngay_cua_so || cum.ngay_co_hang} ngày</span>
                        </td>

                        {/* TB/ngày (mức dao động) */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <div className="font-medium text-gray-900">
                            {tbNgay !== null && tbNgay !== undefined ? formatDecimal(tbNgay, 1) : '—'}
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {daoDong !== null && daoDong !== undefined
                              ? `±${formatPercent(daoDong)} dao động`
                              : '—'}
                          </div>
                        </td>

                        {/* Sản lượng & Lũy kế Pareto */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <div className="font-semibold text-gray-900">
                            {renderValue(cum.shbg, cum.kg, cum.shbg_thieu_kg)}
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {formatPercent(cum.ty_le_shbg)} (lũy kế {formatDecimal(cum.luy_ke_pct, 1)}%)
                          </div>
                        </td>

                        {/* Kiện đi ngoài */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <div className="font-medium text-gray-800">
                            {formatInt(cum.kien_di_ngoai?.shbg || 0)}
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {formatPercent(cum.kien_di_ngoai?.ty_le || 0)}
                          </div>
                        </td>

                        {/* Chuyến kế */}
                        <td className="py-2.5 px-2">
                          {firstO ? (
                            <div>
                              <div className="font-medium text-gray-900">
                                {firstO.ma_bcvh} · {firstO.chuyen_ten || 'Chuyến kế'}
                              </div>
                              <div className="text-[11px] text-gray-500 font-normal">
                                Giờ chốt: {firstO.gio_chot || '—'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">chưa đủ số liệu</span>
                          )}
                        </td>

                        {/* Lưu thoát theo lịch */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {luuThoatGio !== null ? (
                            <span className="font-medium text-gray-800">
                              {formatDecimal(luuThoatGio, 1)} giờ
                            </span>
                          ) : (
                            <span className="text-gray-400">chưa đủ số liệu</span>
                          )}
                        </td>

                        {/* Còn lại so với chỉ tiêu */}
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold">
                          {conLaiGio !== null ? (
                            isQuaChiTieu ? (
                              <span className="text-red-600">
                                quá chỉ tiêu {formatDecimal(Math.abs(conLaiGio), 1)} giờ
                              </span>
                            ) : (
                              <span className="text-[#1F7A5C]">
                                còn {formatDecimal(conLaiGio, 1)} giờ
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 font-normal">chưa đủ số liệu</span>
                          )}
                        </td>

                        {/* Dấu hiệu */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {cum.co?.mau_it && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                mẫu ít, chưa kết luận
                              </span>
                            )}
                            {cum.co?.that_thuong && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                Thất thường
                              </span>
                            )}
                            {cum.co?.khong_co_lich_co_dinh && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                Không có lịch cố định
                              </span>
                            )}
                            {cum.co?.nhieu_kien_di_ngoai && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
                                Nhiều kiện đi ngoài
                              </span>
                            )}
                            {!cum.co?.mau_it && !cum.co?.that_thuong && !cum.co?.khong_co_lich_co_dinh && !cum.co?.nhieu_kien_di_ngoai && (
                              <span className="text-gray-400 text-[11px]">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-gray-500 italic">
              * Giờ chốt chuyến = giờ xe rời − 60 phút. Dòng có «mẫu ít» không kết luận cờ thất thường hay không có lịch cố định.
            </div>
          </div>

          {/* ── 3. BẢNG THEO CHUYẾN XE CẤP 2 ────────────────────────────── */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-700" />
                <span>Bảng theo chuyến xe cấp 2 (xe đi)</span>
              </h3>
              <span className="text-xs text-gray-500">
                Tổng cộng {chuyenList.length} chuyến xe cấp 2
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[1000px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">BCVH đích & loại ngày</th>
                    <th className="py-2.5 px-2">Giờ xe rời & giờ chốt chuyến</th>
                    <th className="py-2.5 px-2 text-right">
                      {unit === 'kg' ? 'Khối lượng' : 'Sản lượng'} (% BCVH)
                    </th>
                    <th className="py-2.5 px-2 text-center">Tỷ trọng chia đều</th>
                    <th className="py-2.5 px-2 text-right">Lưu thoát theo lịch</th>
                    <th className="py-2.5 px-2 text-right">Còn lại so với chỉ tiêu</th>
                    <th className="py-2.5 px-2 text-right">Cách giờ chốt chuyến</th>
                    <th className="py-2.5 px-2 text-right">Sang hôm sau</th>
                    <th className="py-2.5 px-3">Nguồn cụm chính</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chuyenList.map((chuyen, idx) => {
                    const bcvhObj = BCVH_LIST.find((b) => b.ma === chuyen.ma_bcvh);
                    const bcvhTen = bcvhObj ? bcvhObj.ten : chuyen.ma_bcvh;
                    const conLai = chuyen.con_lai?.trung_vi_gio ?? null;
                    const isQuaChiTieu = conLai !== null && conLai < 0;

                    return (
                      <tr key={`${chuyen.ma_bcvh}-${chuyen.loai_ngay}-${chuyen.gio_xuat_phat}-${idx}`} className="hover:bg-[#FFFBEF] transition-colors">
                        {/* BCVH & loại ngày */}
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-gray-900">
                            {bcvhTen} ({chuyen.ma_bcvh})
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {chuyen.loai_ngay === 'chu_nhat' ? 'Chủ nhật' : 'Ngày thường'}
                            {chuyen.luu_y_lich && (
                              <span className="text-amber-700 bg-amber-50 px-1 rounded ml-1">
                                lịch Chủ nhật chưa tin cậy
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Giờ xuất phát & giờ chốt */}
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-gray-900 tabular-nums">
                            Xe rời: {chuyen.gio_xuat_phat}
                          </div>
                          <div className="text-[11px] text-gray-500 tabular-nums font-normal">
                            Giờ chốt chuyến: {chuyen.gio_chot}
                          </div>
                        </td>

                        {/* Sản lượng & % BCVH */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <div className="font-semibold text-gray-900">
                            {renderValue(chuyen.shbg, chuyen.kg, chuyen.shbg_thieu_kg)}
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal">
                            {formatPercent(chuyen.ty_le_san_luong_bcvh)} sản lượng BCVH
                          </div>
                          {chuyen.co?.chuyen_gom_nhieu_hang && (
                            <span className="inline-block mt-0.5 px-1 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                              Chuyến gom nhiều hàng
                            </span>
                          )}
                        </td>

                        {/* Tỷ trọng chia đều */}
                        <td className="py-2.5 px-2 text-center tabular-nums font-medium text-gray-700">
                          {formatPercent(chuyen.ty_trong_chia_deu)}
                          <div className="text-[10px] text-gray-400 font-normal">
                            ({chuyen.so_chuyen_trong_ngay} chuyến/ngày)
                          </div>
                        </td>

                        {/* Lưu thoát theo lịch */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {chuyen.luu_thoat_theo_lich?.trung_vi_gio !== null && chuyen.luu_thoat_theo_lich?.trung_vi_gio !== undefined ? (
                            <div>
                              <span className="font-medium text-gray-800">
                                {formatDecimal(chuyen.luu_thoat_theo_lich.trung_vi_gio, 1)} giờ
                              </span>
                              <div className="text-[10px] text-gray-400 font-normal">
                                P90: {formatDecimal(chuyen.luu_thoat_theo_lich.p90_gio, 1)}h
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">chưa đủ số liệu</span>
                          )}
                        </td>

                        {/* Còn lại so với chỉ tiêu */}
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold">
                          {conLai !== null ? (
                            isQuaChiTieu ? (
                              <span className="text-red-600">
                                quá chỉ tiêu {formatDecimal(Math.abs(conLai), 1)} giờ
                              </span>
                            ) : (
                              <span className="text-[#1F7A5C]">
                                còn {formatDecimal(conLai, 1)} giờ
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 font-normal">chưa đủ số liệu</span>
                          )}
                          {chuyen.con_lai?.qua_chi_tieu > 0 && (
                            <div className="text-[10px] text-red-600 font-normal">
                              ({formatInt(chuyen.con_lai.qua_chi_tieu)} quá chỉ tiêu)
                            </div>
                          )}
                        </td>

                        {/* Cách giờ chốt chuyến */}
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {chuyen.sat_gio_chot?.phut_trung_vi !== null && chuyen.sat_gio_chot?.phut_trung_vi !== undefined ? (
                            <div>
                              <span className="font-medium text-gray-800">
                                {formatInt(chuyen.sat_gio_chot.phut_trung_vi)} phút
                              </span>
                              {chuyen.sat_gio_chot?.ty_le > 0 && (
                                <div className="text-[10px] text-purple-700 bg-purple-50 px-1 rounded inline-block">
                                  {formatPercent(chuyen.sat_gio_chot.ty_le)} sát giờ chốt
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">chưa đủ số liệu</span>
                          )}
                        </td>

                        {/* Sang hôm sau */}
                        <td className="py-2.5 px-2 text-right tabular-nums font-medium text-gray-700">
                          {chuyen.hom_sau?.shbg > 0 ? (
                            <div>
                              <span>{formatInt(chuyen.hom_sau.shbg)}</span>
                              <div className="text-[10px] text-gray-500 font-normal">
                                {formatPercent(chuyen.hom_sau.ty_le)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>

                        {/* Nguồn cụm chính */}
                        <td className="py-2.5 px-3">
                          <div className="space-y-1">
                            {(chuyen.nguon_cum || []).slice(0, 3).map((nc, nidx) => (
                              <div key={nidx} className="text-[11px] text-gray-700 flex items-center justify-between gap-2">
                                <span className="truncate max-w-[140px]" title={nc.ten}>
                                  {nc.ten}
                                </span>
                                <span className="tabular-nums text-gray-500 font-medium shrink-0">
                                  {formatPercent(nc.ty_le)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 4. ĐÁNH GIÁ CHO MỤC NÀY & GHI CHÚ ĐỘ TIN CẬY ──────────── */}
          <div className="bg-[#FAF5FF]/50 border border-purple-200/70 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                <h3 className="text-sm font-bold text-gray-900">
                  Đánh giá cho mục này (thẻ tự sinh Pareto)
                </h3>
              </div>
              <span className="text-xs text-gray-500">
                Sắp xếp theo số bưu gửi bị ảnh hưởng giảm dần
              </span>
            </div>

            {/* Lưới các thẻ đánh giá */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {theList.map((the, idx) => (
                <div
                  key={`${the.co}-${the.doi_tuong?.id}-${idx}`}
                  className="bg-white border border-gray-200 rounded-xl p-3 shadow-2xs space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-gray-900">{the.nhan}</span>
                      {getMucBadge(the.muc, the.co)}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                      Đối tượng: <strong className="text-gray-800">{the.doi_tuong?.ten}</strong>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {the.ly_giai}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      Ảnh hưởng: <strong className="text-gray-900 font-semibold">{formatInt(the.shbg_anh_huong)}</strong> bưu gửi
                    </span>
                    <span>
                      Lũy kế: <strong className="text-purple-700 font-semibold">{formatDecimal(the.luy_ke_pct, 1)}%</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {theList.length === 0 && (
              <div className="text-center py-4 text-xs text-gray-500 italic">
                Không có thẻ cảnh báo hay lưu ý nào được kích hoạt với bộ lọc hiện tại.
              </div>
            )}

            {/* Danh sách mẫu ít */}
            {mauItList.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
                <span className="text-xs font-semibold text-gray-800">
                  Các chuyến thư đến có mẫu ít ({mauItList.length} cụm):
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {mauItList.map((m, midx) => (
                    <span
                      key={midx}
                      className="inline-flex items-center gap-1.5 text-[11px] bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md"
                    >
                      <span className="font-medium text-gray-800">{m.ten || m.id}</span>
                      <span className="tabular-nums">({formatInt(m.shbg)} bg)</span>
                      <span className="text-gray-400 font-normal">—</span>
                      <span className="text-gray-500 italic">{m.ghi_chu || 'mẫu ít, chưa kết luận'}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Ghi chú độ tin cậy và định nghĩa */}
            <div className="text-[11px] text-gray-500 space-y-1 pt-1 border-t border-purple-100">
              <p>
                <strong>Quy ước tính toán:</strong> Lưu thoát theo lịch tính từ lúc hàng đến tới giờ xe rời (đã trừ 21:00–07:00). Còn lại so với chỉ tiêu = chỉ tiêu (14 giờ, hoặc 12 giờ cho phường 49135, 49133) − thời gian lưu thoát theo lịch.
              </p>
              <p>
                <strong>Độ tin cậy:</strong> Cờ «sát giờ chốt chuyến» hiển thị ở mức THEO DÕI. Mọi số liệu kèm «đo được x/y» của mốc tương ứng, không tính tỷ lệ chung giữa hai mốc.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
