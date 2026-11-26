import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import { formatInt, shiftDay } from '../quythoigian/quyThoiGianFormatters';
import { formatKgDecimal, getQuickDateRange } from './kttFormatters';
import {
  fetchKttMeta,
  fetchKttHuongDongTongHop,
  fetchKttHuongDongDanhSach,
  fetchKttHuongDongTui,
  downloadKttHuongDong,
} from './kttApi';
import KttTooltip from './KttTooltip';

const LOAI_HINH_OPTIONS = [
  { id: 'tat_ca', label: 'Tất cả' },
  { id: 'GD1', label: 'GD1' },
  { id: 'GD2_GD3', label: 'GD2/GD3' },
  { id: 'VHX', label: 'VHX' },
  { id: '531120', label: '531120' },
];

function countDaysInclusive(from, to) {
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function formatDdMm(ymd) {
  if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return ymd || '';
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

function formatDdMmYyyy(ymd) {
  if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return ymd || '';
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

function isDayIncomplete(ngay, nguonXuatLucMoiNhat) {
  if (!nguonXuatLucMoiNhat || typeof nguonXuatLucMoiNhat !== 'string' || nguonXuatLucMoiNhat.length < 10) {
    return false;
  }
  const latestDate = nguonXuatLucMoiNhat.slice(0, 10);
  const latestTime = nguonXuatLucMoiNhat.length >= 19 ? nguonXuatLucMoiNhat.slice(11, 19) : '';
  if (ngay > latestDate) return true;
  if (ngay === latestDate && latestTime !== '23:59:59') return true;
  return false;
}

/**
 * Nút thả xuống «Tải Excel» dùng chung cho đầu khối và khối danh sách bưu gửi.
 */
function ExcelDropdownButton({ tu, den, loaiHinh, disabled }) {
  const [open, setOpen] = useState(false);
  const [confirmChiTiet, setConfirmChiTiet] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open && !confirmChiTiet) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, confirmChiTiet]);

  const handleDownload = async (kieu) => {
    if (downloading || !tu || !den) return;
    setOpen(false);
    setConfirmChiTiet(false);
    setDownloading(true);
    setErr(null);
    try {
      await downloadKttHuongDong({ tu, den, kieu, loai_hinh: loaiHinh });
    } catch (e) {
      setErr(e?.message || 'Chưa tải được file. Thử lại sau.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative inline-flex flex-col items-end">
      <button
        type="button"
        disabled={disabled || downloading}
        onClick={() => {
          setErr(null);
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold text-white bg-[#4A1D6E] hover:bg-[#3B1758] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
      >
        {downloading ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
            <span>Đang chuẩn bị…</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-white shrink-0" />
            <span>Tải Excel</span>
          </>
        )}
      </button>

      {open && !downloading && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#E4D5AE] rounded-lg shadow-lg z-30 py-1">
          <button
            type="button"
            onClick={() => handleDownload('nhac_viec')}
            className="w-full text-left px-3 py-2.5 min-h-[44px] text-xs text-gray-800 hover:bg-[#FAF5E8] transition-colors cursor-pointer"
          >
            Danh sách nhắc việc (không số hiệu)
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirmChiTiet(true);
            }}
            className="w-full text-left px-3 py-2.5 min-h-[44px] text-xs text-gray-800 hover:bg-[#FAF5E8] transition-colors cursor-pointer border-t border-[#F0E8D4]"
          >
            Chi tiết có số hiệu bưu gửi
          </button>
        </div>
      )}

      {confirmChiTiet && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[#FFF6DC] border border-[#E0A82E] rounded-lg shadow-lg z-30 p-3 space-y-2.5">
          <p className="text-xs font-medium text-gray-900">
            File có số hiệu bưu gửi, chỉ dùng nội bộ
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmChiTiet(false)}
              className="px-3 py-1.5 min-h-[44px] text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={() => handleDownload('chi_tiet')}
              className="px-3 py-1.5 min-h-[44px] text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md cursor-pointer"
            >
              Tiếp tục tải
            </button>
          </div>
        </div>
      )}

      {err && <span className="mt-1 text-[11px] text-red-600">{err}</span>}
    </div>
  );
}

export default function KttHuongDong() {
  const [meta, setMeta] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  // Bộ lọc: mở tab KHÔNG tự tải, người dùng chủ động chọn ngày hoặc bấm 30 ngày / 7 ngày
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [loaiHinh, setLoaiHinh] = useState('tat_ca');

  // Trạng thái tải dữ liệu
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [rangeError, setRangeError] = useState(null);
  const [tongHopData, setTongHopData] = useState(null);
  const [stripData, setStripData] = useState(null);

  // Bảng hướng đi: mở từng túi của 1 nơi đóng
  const [expandedPlaceTui, setExpandedPlaceTui] = useState(null);
  const [tuiLoading, setTuiLoading] = useState(false);
  const [tuiError, setTuiError] = useState(null);
  const [tuiData, setTuiData] = useState(null);
  const [tuiPage, setTuiPage] = useState(1);

  // Bảng chi tiết: mở nhóm chỉ có túi nhỏ + mở danh sách bưu gửi của 1 nơi đóng
  const [showSmallOnly, setShowSmallOnly] = useState(false);
  const [selectedNoiDong, setSelectedNoiDong] = useState(null);
  const [chiTuiLon, setChiTuiLon] = useState(true);
  const [dsPage, setDsPage] = useState(1);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsError, setDsError] = useState(null);
  const [dsData, setDsData] = useState(null);

  // Khối «Cách tính và giới hạn»
  const [showGuide, setShowGuide] = useState(false);

  // Tải nhẹ meta để nút «30 ngày» / «7 ngày» bám theo ngày dữ liệu mới nhất
  useEffect(() => {
    let active = true;
    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (res.ok && res.data) {
          setMeta(res.data);
        }
      })
      .catch(() => {
        // Bỏ qua lỗi mạng ở bước meta phụ trợ; khi tải chính thức sẽ báo đầy đủ
      });
    return () => {
      active = false;
    };
  }, []);

  // Gọi API khi đã có đủ tu, den hợp lệ (<= 31 ngày)
  useEffect(() => {
    if (!tu || !den) return;

    if (tu > den) {
      setRangeError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
      return;
    }

    const numDays = countDaysInclusive(tu, den);
    if (numDays > 31) {
      setRangeError('Chọn tối đa 31 ngày');
      return;
    }

    setRangeError(null);
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    setSelectedNoiDong(null);
    setDsData(null);
    setExpandedPlaceTui(null);
    setTuiData(null);
    setShowSmallOnly(false);

    // Thứ hạng chỉ tính khi khoảng chọn đúng 1 ngày
    const isSingleDay = tu === den;
    const stripTu = shiftDay(den, -29);

    const mainPromise = fetchKttHuongDongTongHop({ tu, den, loai_hinh: loaiHinh });
    const stripPromise = isSingleDay
      ? fetchKttHuongDongTongHop({ tu: stripTu, den, loai_hinh: loaiHinh })
      : null;

    Promise.all([mainPromise, stripPromise])
      .then(([mainRes, stripRes]) => {
        if (!active) return;
        if (mainRes.status === 403 || stripRes?.status === 403) {
          setForbidden(true);
          return;
        }
        if (!mainRes.ok) {
          setErrorMsg(mainRes.error || 'Không tải được dữ liệu.');
          setTongHopData(null);
          setStripData(null);
          return;
        }
        setTongHopData(mainRes.data);
        if (isSingleDay) {
          setStripData(stripRes?.ok ? stripRes.data : null);
        } else {
          setStripData(mainRes.data);
        }
      })
      .catch((e) => {
        if (!active) return;
        setErrorMsg(e?.message || 'Lỗi kết nối máy chủ.');
        setTongHopData(null);
        setStripData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tu, den, loaiHinh]);

  // Bảng hướng đi: Tải danh sách từng túi khi bấm dòng một nơi
  useEffect(() => {
    if (!expandedPlaceTui || !tu || !den) return;
    let active = true;
    setTuiLoading(true);
    setTuiError(null);

    fetchKttHuongDongTui({
      tu,
      den,
      ma_noi: expandedPlaceTui.ma,
      chi_tui_lon: 1,
      page: tuiPage,
      page_size: 50,
    })
      .then((res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setTuiError(res.error || 'Không tải được danh sách túi.');
          setTuiData(null);
          return;
        }
        setTuiData(res.data);
      })
      .catch((e) => {
        if (!active) return;
        setTuiError(e?.message || 'Lỗi kết nối máy chủ.');
        setTuiData(null);
      })
      .finally(() => {
        if (active) setTuiLoading(false);
      });

    return () => {
      active = false;
    };
  }, [expandedPlaceTui, tu, den, tuiPage]);

  // Bảng chi tiết: Tải danh sách bưu gửi khi bấm một dòng nơi đóng
  useEffect(() => {
    if (!selectedNoiDong || !tu || !den) return;
    let active = true;
    setDsLoading(true);
    setDsError(null);

    fetchKttHuongDongDanhSach({
      tu,
      den,
      noi_dong: selectedNoiDong.ma,
      nhom: 'dong_vao_530100',
      chi_tui_lon: chiTuiLon ? 1 : 0,
      page: dsPage,
      page_size: 50,
    })
      .then((res) => {
        if (!active) return;
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) {
          setDsError(res.error || 'Không tải được danh sách bưu gửi.');
          setDsData(null);
          return;
        }
        setDsData(res.data);
      })
      .catch((e) => {
        if (!active) return;
        setDsError(e?.message || 'Lỗi kết nối máy chủ.');
        setDsData(null);
      })
      .finally(() => {
        if (active) setDsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedNoiDong, tu, den, chiTuiLon, dsPage]);

  const handleQuickRange = (days) => {
    const range = getQuickDateRange(days, meta);
    setTu(range.from);
    setDen(range.to);
  };

  const quick30 = useMemo(() => getQuickDateRange(30, meta), [meta]);
  const quick7 = useMemo(() => getQuickDateRange(7, meta), [meta]);
  const is30Active = tu === quick30.from && den === quick30.to;
  const is7Active = tu === quick7.from && den === quick7.to;

  const apiMeta = tongHopData?.meta;
  const nguong = apiMeta?.nguong_bg_trong_tui;
  const theoNoiDong = tongHopData?.theo_noi_dong || [];

  // Danh sách 6 BCVH lấy từ meta.huong_bcvh (đúng thứ tự cố định từ API)
  const bcvhCols = useMemo(() => {
    return apiMeta?.huong_bcvh || [];
  }, [apiMeta]);

  // Chia nhóm dòng bảng: nơi có túi lớn (>= N) và nơi chỉ có túi nhỏ (< N)
  const { largePlaces, smallOnlyPlaces, maxOtherBgLon } = useMemo(() => {
    const large = theoNoiDong
      .filter((r) => (r.bg_trong_tui_lon || 0) > 0)
      .sort((a, b) => {
        if (a.ma === '531120' && b.ma !== '531120') return -1;
        if (b.ma === '531120' && a.ma !== '531120') return 1;
        return b.bg_trong_tui_lon - a.bg_trong_tui_lon || (a.ma < b.ma ? -1 : 1);
      });

    const smallOnly = theoNoiDong
      .filter((r) => (r.bg_trong_tui_lon || 0) === 0 && (r.bg_trong_tui_nho || 0) > 0)
      .sort((a, b) => b.bg_trong_tui_nho - a.bg_trong_tui_nho || (a.ma < b.ma ? -1 : 1));

    const maxOther = Math.max(
      0,
      ...large.filter((r) => r.ma !== '531120').map((r) => r.bg_trong_tui_lon || 0)
    );

    return { largePlaces: large, smallOnlyPlaces: smallOnly, maxOtherBgLon: maxOther };
  }, [theoNoiDong]);

  // Cộng các dòng đang hiện cho dòng tổng ở cuối bảng chi tiết
  const largeTotals = useMemo(() => {
    return largePlaces.reduce(
      (acc, r) => ({
        bgLon: acc.bgLon + (r.bg_trong_tui_lon || 0),
        bgNho: acc.bgNho + (r.bg_trong_tui_nho || 0),
        soTuiLon: acc.soTuiLon + (r.so_tui_lon || 0),
      }),
      { bgLon: 0, bgNho: 0, soTuiLon: 0 }
    );
  }, [largePlaces]);

  const smallOnlyTotals = useMemo(() => {
    return smallOnlyPlaces.reduce(
      (acc, r) => ({
        bgNho: acc.bgNho + (r.bg_trong_tui_nho || 0),
      }),
      { bgNho: 0 }
    );
  }, [smallOnlyPlaces]);

  // Thứ hạng ngày khi chọn đúng 1 ngày (DC-6 4.2)
  const rankInfo = useMemo(() => {
    if (!tu || !den || tu !== den || !stripData?.theo_ngay) return null;
    const nx = stripData.nguon_xuat_luc_moi_nhat || tongHopData?.nguon_xuat_luc_moi_nhat;
    if (!nx) return null;
    const days = stripData.theo_ngay;
    const completeDays = days.filter((d) => !isDayIncomplete(d.ngay, nx));
    if (!completeDays.length) return null;
    const targetDay = completeDays.find((d) => d.ngay === tu);
    if (!targetDay) return null;
    const targetVal = targetDay.bg_trong_tui_lon || 0;
    const rank = 1 + completeDays.filter((d) => (d.bg_trong_tui_lon || 0) > targetVal).length;
    const firstDay = completeDays[0].ngay;
    const lastDay = completeDays[completeDays.length - 1].ngay;
    return {
      rank,
      numDays: completeDays.length,
      firstDay,
      lastDay,
    };
  }, [tu, den, stripData, tongHopData]);

  // Thao tác bấm dòng ở Bảng hướng đi (mở từng túi)
  const handleHuongRowClick = (place) => {
    if (expandedPlaceTui?.ma === place.ma) {
      setExpandedPlaceTui(null);
      setTuiData(null);
      return;
    }
    setExpandedPlaceTui(place);
    setTuiPage(1);
  };

  // Thao tác bấm dòng ở Bảng chi tiết (mở danh sách bưu gửi)
  const handleChiTietRowClick = (row) => {
    if (selectedNoiDong?.ma === row.ma) {
      setSelectedNoiDong(null);
      setDsData(null);
      return;
    }
    setSelectedNoiDong(row);
    setChiTuiLon(true);
    setDsPage(1);
  };

  if (forbidden) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">Tài khoản không có quyền xem</span>
        </div>
      </div>
    );
  }

  const dongVaoTong = apiMeta?.trong_loc?.dong_vao_530100 ?? apiMeta?.dong_vao_530100 ?? 0;
  const isEmptyData =
    tongHopData &&
    !loading &&
    !errorMsg &&
    (tongHopData.co_du_lieu === false || (theoNoiDong.length === 0 && dongVaoTong === 0));

  const totalDays = tu && den ? countDaysInclusive(tu, den) : 0;

  return (
    <div className="px-4 sm:px-6 py-4 max-w-[1400px] mx-auto space-y-4">
      {/* Tiêu đề trang (h1) + Ô phạm vi số liệu (bên phải tiêu đề) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-semibold text-gray-600">
            Trung tâm Khai thác · 530100 · Hàng tại KTT
          </div>
          <h1 className="hue-h1 text-2xl font-bold text-[#4A1D6E]">
            Hướng đóng chuyến nội tỉnh
          </h1>
        </div>

        {tu && den && apiMeta && nguong !== undefined && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Phạm vi số liệu</span>
            <span className="text-xs font-bold text-[#4A1D6E] bg-[#EFE6F5] rounded-md px-2.5 py-1">
              {formatDdMmYyyy(tu)} đến {formatDdMmYyyy(den)}, {totalDays} ngày
            </span>
            <span className="text-xs font-bold text-[#4A1D6E] bg-[#EFE6F5] rounded-md px-2.5 py-1">
              Ngưỡng: từ {nguong} BG trong túi
            </span>
          </div>
        )}
      </div>

      {/* Bộ lọc: Khoảng ngày, Loại hình nơi đóng, Tải xuống */}
      <div className="bg-white border border-[#E4D5AE] rounded-xl p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-xs font-semibold text-gray-600 self-center mr-1">
                Khoảng ngày
              </span>
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                <span>Từ ngày</span>
                <input
                  type="date"
                  value={tu}
                  onChange={(e) => setTu(e.target.value)}
                  className="px-2.5 py-2 min-h-[44px] text-xs bg-white border border-[#D9CBA8] rounded-lg text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                <span>Đến ngày</span>
                <input
                  type="date"
                  value={den}
                  onChange={(e) => setDen(e.target.value)}
                  className="px-2.5 py-2 min-h-[44px] text-xs bg-white border border-[#D9CBA8] rounded-lg text-gray-900"
                />
              </label>
              <button
                type="button"
                onClick={() => handleQuickRange(30)}
                className={`px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  is30Active
                    ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                    : 'bg-[#FAF6EC] text-gray-900 border-[#D9CBA8] hover:bg-[#F3EDE0]'
                }`}
              >
                30 ngày
              </button>
              <button
                type="button"
                onClick={() => handleQuickRange(7)}
                className={`px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  is7Active
                    ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                    : 'bg-[#FAF6EC] text-gray-900 border-[#D9CBA8] hover:bg-[#F3EDE0]'
                }`}
              >
                7 ngày
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-600 mr-1">
                Loại hình nơi đóng
              </span>
              {LOAI_HINH_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLoaiHinh(opt.id)}
                  className={`px-3 py-2 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    loaiHinh === opt.id
                      ? 'bg-[#4A1D6E] text-white border-[#4A1D6E]'
                      : 'bg-white text-gray-700 border-[#D9CBA8] hover:bg-[#FAF6EC]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 items-end ml-auto">
            <span className="text-xs font-semibold text-gray-600">Tải xuống</span>
            <ExcelDropdownButton
              tu={tu}
              den={den}
              loaiHinh={loaiHinh}
              disabled={!tu || !den || !!rangeError || loading}
            />
          </div>
        </div>
      </div>

      {/* Trạng thái chưa chọn ngày */}
      {(!tu || !den) && !loading && !rangeError && (
        <div className="bg-[#FFFBEF] border border-[#E4D5AE] rounded-xl p-6 text-center text-sm text-gray-600">
          Chọn «30 ngày», «7 ngày» hoặc nhập đủ «Từ ngày» và «Đến ngày» để xem số liệu.
        </div>
      )}

      {/* Lỗi khoảng ngày > 31 ngày */}
      {rangeError && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-2.5 text-amber-900 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
          <span>{rangeError}</span>
        </div>
      )}

      {/* Trạng thái đang tải */}
      {loading && (
        <div className="bg-white border border-[#E4D5AE] rounded-xl p-6 flex items-center justify-center gap-2.5 text-sm text-[#4A1D6E] font-medium">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>Đang tải, lần đầu có thể mất vài giây</span>
        </div>
      )}

      {/* Trạng thái lỗi API */}
      {errorMsg && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2.5 text-red-700 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Trạng thái rỗng */}
      {isEmptyData && (
        <div className="bg-white border border-[#E4D5AE] rounded-xl p-6 text-center text-sm text-gray-600">
          Không có hàng trong khoảng này
        </div>
      )}

      {/* Nội dung chính khi có dữ liệu */}
      {tongHopData && !loading && !errorMsg && !rangeError && !isEmptyData && nguong !== undefined && (
        <section className="bg-white border border-[#E4D5AE] rounded-xl p-5 space-y-5">
          {/* Tiêu đề khối & dòng mô tả */}
          <div>
            <h2 className="hue-h2 text-[17px]">
              Hàng nội tỉnh (túi) đóng đến 530100 không đóng thẳng BCVH
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Dữ liệu đang tính đối với túi &gt;={nguong} BG
            </p>
          </div>

          {/* Hai ô số */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ô 1: Sản lượng (viền trên vàng thẫm #8A6100) */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#8A6100] shadow-none flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                  Sản lượng
                </div>
                <div className="hue-num-lg my-1.5 text-[#8A6100]">
                  {formatInt(apiMeta.bg_trong_tui_lon || 0)}
                </div>
              </div>
              <div className="text-[11px] text-gray-600 mt-2 pt-2 border-t border-gray-100">
                bưu gửi trong {formatInt(apiMeta.so_tui_lon || 0)} túi
                {rankInfo && (
                  <span>
                    {' '}· cao thứ {rankInfo.rank} trong {rankInfo.numDays} ngày ({formatDdMm(rankInfo.firstDay)} đến {formatDdMm(rankInfo.lastDay)})
                  </span>
                )}
              </div>
            </div>

            {/* Ô 2: Số BC/VHX đóng (viền trên tím đậm #4A1D6E) */}
            <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-t-4 border-t-[#4A1D6E] shadow-none flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
                  Số BC/VHX đóng
                </div>
                <div className="hue-num-lg my-1.5 text-[#4A1D6E]">
                  {formatInt(apiMeta.so_noi_dong_tui_lon ?? largePlaces.length)}
                </div>
              </div>
              <div className="text-[11px] text-gray-600 mt-2 pt-2 border-t border-gray-100">
                nơi có túi từ {nguong} BG trở lên
              </div>
            </div>
          </div>

          {/* Bảng hướng đi */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF5E8] border-b-2 border-[#E4D5AE] text-gray-700">
                  <th className="text-left py-2.5 px-3 font-bold align-bottom">
                    Nơi đóng chuyến thư
                  </th>
                  {bcvhCols.map((col) => (
                    <th
                      key={col.ma_bcvh}
                      className="text-center py-2 px-1 font-bold align-bottom leading-tight"
                    >
                      <div>{col.ten_bcvh}</div>
                      <div className="text-[11px] font-normal text-gray-500">
                        {col.ma_bcvh}
                      </div>
                    </th>
                  ))}
                  <th className="text-right py-2.5 px-3 font-bold align-bottom leading-tight">
                    <div>Cộng</div>
                    <div className="text-[11px] font-normal text-gray-500">bưu gửi</div>
                  </th>
                  <th className="text-right py-2.5 px-3 font-bold align-bottom leading-tight">
                    <div>Số túi</div>
                    <div className="text-[11px] font-normal text-gray-500">túi</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {largePlaces.map((r) => {
                  const isExpanded = expandedPlaceTui?.ma === r.ma;
                  const rowTotalBg = r.bg_trong_tui_lon || 1;

                  return (
                    <React.Fragment key={r.ma}>
                      <tr
                        onClick={() => handleHuongRowClick(r)}
                        className={`border-b border-[#E4D5AE] cursor-pointer transition-colors ${
                          isExpanded ? 'bg-[#F5EEFA]' : 'hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <td className="py-2.5 px-3 align-middle text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-gray-900 tabular-nums">
                              {r.ma}
                            </span>
                            <span className="text-gray-900">
                              {r.ten || 'chưa có tên'}
                            </span>
                            {r.loai_hinh && (
                              <span className="inline-block text-[11px] font-bold rounded px-1.5 py-0.5 bg-[#EFE6F5] text-[#4A1D6E]">
                                {r.loai_hinh}
                              </span>
                            )}
                          </div>
                        </td>

                        {bcvhCols.map((col) => {
                          const h = r.huong_bcvh?.find((x) => x.ma_bcvh === col.ma_bcvh) || {
                            bg: 0,
                            so_tui: 0,
                          };
                          const bg = h.bg || 0;
                          const soTui = h.so_tui || 0;

                          if (bg === 0) {
                            return (
                              <td
                                key={col.ma_bcvh}
                                className="py-1 px-1 align-middle text-center text-gray-500 font-bold"
                              >
                                ·
                              </td>
                            );
                          }

                          const alpha = 0.08 + 0.72 * (bg / rowTotalBg);
                          const textColor = alpha > 0.5 ? '#FFFFFF' : '#2B2233';
                          const subColor = alpha > 0.5 ? 'rgba(255,255,255,0.85)' : '#6B5F73';
                          const pct = Math.round((bg / rowTotalBg) * 100);
                          const tooltip = `${formatInt(bg)} BG, ${pct}% của nơi này`;

                          return (
                            <td key={col.ma_bcvh} className="py-1 px-1 align-middle">
                              <KttTooltip content={tooltip} className="w-full">
                                <div
                                  style={{
                                    background: `rgba(74, 29, 110, ${alpha.toFixed(2)})`,
                                    color: textColor,
                                  }}
                                  className="rounded-md min-h-[46px] flex flex-col items-center justify-center leading-tight tabular-nums select-none"
                                >
                                  <span className="text-sm font-semibold">
                                    {formatInt(bg)} BG
                                  </span>
                                  <span style={{ color: subColor }} className="text-[11.5px]">
                                    {formatInt(soTui)} túi
                                  </span>
                                </div>
                              </KttTooltip>
                            </td>
                          );
                        })}

                        <td className="py-2.5 px-3 align-middle text-right font-bold text-xs tabular-nums text-gray-900">
                          {formatInt(r.bg_trong_tui_lon)}
                        </td>
                        <td className="py-2.5 px-3 align-middle text-right text-xs tabular-nums text-gray-900">
                          {formatInt(r.so_tui_lon)}
                        </td>
                      </tr>

                      {/* Mở một nơi: từng túi (DC-6 4.4) */}
                      {isExpanded && (
                        <>
                          {tuiLoading && (
                            <tr className="bg-[#FAF6EC] border-b border-[#E4D5AE]">
                              <td
                                colSpan={bcvhCols.length + 3}
                                className="py-3 px-4 text-center text-xs text-[#4A1D6E] font-medium"
                              >
                                <RefreshCw className="w-3.5 h-3.5 animate-spin inline mr-1.5" />
                                <span>Đang tải, lần đầu có thể mất vài giây</span>
                              </td>
                            </tr>
                          )}

                          {tuiError && !tuiLoading && (
                            <tr className="bg-red-50 border-b border-red-200">
                              <td
                                colSpan={bcvhCols.length + 3}
                                className="py-3 px-4 text-center text-xs text-red-700"
                              >
                                {tuiError}
                              </td>
                            </tr>
                          )}

                          {tuiData && !tuiLoading && !tuiError && (
                            <>
                              {tuiData.items?.length === 0 ? (
                                <tr className="bg-[#FAF6EC] border-b border-[#E4D5AE]">
                                  <td
                                    colSpan={bcvhCols.length + 3}
                                    className="py-3 px-4 text-center text-xs text-gray-500"
                                  >
                                    Không có hàng trong khoảng này
                                  </td>
                                </tr>
                              ) : (
                                tuiData.items.map((bag) => {
                                  const bagTotalBg = bag.bg_n2 || bag.so_bg_trong_tui || 1;

                                  return (
                                    <tr
                                      key={bag.khoa_tui || bag.ma_tui}
                                      className="bg-[#FAF6EC] border-b border-[#F0E8D4]"
                                    >
                                      <td className="py-2 px-3 pl-8 align-middle text-xs">
                                        <div className="flex flex-col gap-0.5">
                                          <div className="text-[11px] text-gray-500">
                                            {bag.ngay_dong_chuyen
                                              ? formatDdMmYyyy(bag.ngay_dong_chuyen)
                                              : '—'}
                                            {' · '}
                                            <span className="font-mono text-gray-700">
                                              {bag.ma_tui || '—'}
                                            </span>
                                          </div>
                                          <div className="font-semibold text-[#4A1D6E]">
                                            {formatInt(bag.so_bg_trong_tui)} BG trong túi
                                          </div>
                                        </div>
                                      </td>

                                      {bcvhCols.map((col) => {
                                        const h = bag.huong_bcvh?.find(
                                          (x) => x.ma_bcvh === col.ma_bcvh
                                        ) || { bg: 0 };
                                        const bg = h.bg || 0;

                                        if (bg === 0) {
                                          return (
                                            <td
                                              key={col.ma_bcvh}
                                              className="py-1 px-1 align-middle text-center text-gray-400 font-bold"
                                            >
                                              ·
                                            </td>
                                          );
                                        }

                                        const alpha = 0.08 + 0.72 * (bg / bagTotalBg);
                                        const textColor = alpha > 0.5 ? '#FFFFFF' : '#2B2233';
                                        const pct = Math.round((bg / bagTotalBg) * 100);
                                        const tooltip = `${formatInt(bg)} BG, ${pct}% của túi này`;

                                        return (
                                          <td key={col.ma_bcvh} className="py-1 px-1 align-middle">
                                            <KttTooltip content={tooltip} className="w-full">
                                              <div
                                                style={{
                                                  background: `rgba(74, 29, 110, ${alpha.toFixed(2)})`,
                                                  color: textColor,
                                                }}
                                                className="rounded-md min-h-[36px] flex items-center justify-center text-xs font-semibold tabular-nums select-none"
                                              >
                                                <span>{formatInt(bg)} BG</span>
                                              </div>
                                            </KttTooltip>
                                          </td>
                                        );
                                      })}

                                      <td className="py-2 px-3 align-middle text-right font-bold text-xs tabular-nums text-gray-900">
                                        {formatInt(bag.bg_n2 || 0)}
                                      </td>
                                      <td className="py-2 px-3 align-middle text-right text-xs tabular-nums text-gray-600">
                                        1
                                      </td>
                                    </tr>
                                  );
                                })
                              )}

                              {tuiData.pagination && tuiData.pagination.total_pages > 1 && (
                                <tr className="bg-[#FAF6EC] border-b border-[#E4D5AE]">
                                  <td
                                    colSpan={bcvhCols.length + 3}
                                    className="py-2 px-4 text-right"
                                  >
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        disabled={tuiPage <= 1}
                                        onClick={() => setTuiPage((p) => Math.max(1, p - 1))}
                                        className="px-2.5 py-1 text-xs font-medium bg-white border border-[#D9CBA8] rounded-md disabled:opacity-50 cursor-pointer"
                                      >
                                        Trang trước
                                      </button>
                                      <span className="text-xs text-gray-600 tabular-nums">
                                        {tuiPage}/{tuiData.pagination.total_pages}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={tuiPage >= tuiData.pagination.total_pages}
                                        onClick={() =>
                                          setTuiPage((p) =>
                                            Math.min(tuiData.pagination.total_pages, p + 1)
                                          )
                                        }
                                        className="px-2.5 py-1 text-xs font-medium bg-white border border-[#D9CBA8] rounded-md disabled:opacity-50 cursor-pointer"
                                      >
                                        Trang sau
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Dòng cuối Bảng hướng đi */}
                <tr className="font-bold border-t-2 border-[#E4D5AE] text-xs">
                  <td className="py-2.5 px-3 border-t-2 border-[#E4D5AE] text-left tabular-nums">
                    Cộng {formatInt(largePlaces.length)} nơi
                  </td>
                  {bcvhCols.map((col) => (
                    <td
                      key={col.ma_bcvh}
                      className="py-2 px-1 border-t-2 border-[#E4D5AE] text-center leading-tight tabular-nums"
                    >
                      <div>{formatInt(col.bg || 0)} BG</div>
                      <div className="text-[11.5px] font-normal text-gray-500">
                        {formatInt(col.so_tui || 0)} túi
                      </div>
                    </td>
                  ))}
                  <td className="py-2.5 px-3 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                    {formatInt(apiMeta.bg_trong_tui_lon || 0)}
                  </td>
                  <td className="py-2.5 px-3 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                    {formatInt(apiMeta.so_tui_lon || 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bảng chi tiết */}
          <div className="pt-2 border-t border-[#F0E8D4] space-y-3">
            <h3 className="hue-h2 text-[17px]">Chi tiết từng nơi đóng</h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF5E8] border-b-2 border-[#E4D5AE] text-gray-700">
                    <th className="text-left py-2 px-2.5 font-bold align-bottom">
                      Nơi đóng chuyến thư
                    </th>
                    <th className="text-left py-2 px-2.5 font-bold align-bottom">
                      Hàng trong túi từ {nguong} BG trở lên
                    </th>
                    <th className="text-right py-2 px-2.5 font-bold align-bottom">
                      Hàng trong túi dưới {nguong} BG
                    </th>
                    <th className="text-right py-2 px-2.5 font-bold align-bottom">
                      Số túi từ {nguong} BG trở lên
                    </th>
                    <th className="text-right py-2 px-2.5 font-bold align-bottom">
                      Túi nhiều nhất (bưu gửi)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {largePlaces.map((r) => {
                    const is531120 = r.ma === '531120';
                    const isSelected = selectedNoiDong?.ma === r.ma;
                    const p531120 =
                      is531120 && (apiMeta.bg_trong_tui_lon || 0) > 0
                        ? Math.round((r.bg_trong_tui_lon / apiMeta.bg_trong_tui_lon) * 100)
                        : 0;
                    const barPct =
                      !is531120 && maxOtherBgLon > 0
                        ? (r.bg_trong_tui_lon / maxOtherBgLon) * 100
                        : 0;

                    return (
                      <tr
                        key={r.ma}
                        onClick={() => handleChiTietRowClick(r)}
                        className={`border-b border-[#E4D5AE] cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F5EEFA]' : 'hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <td className="py-2 px-2.5 align-middle text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-gray-900 tabular-nums">
                              {r.ma}
                            </span>
                            <span className="text-gray-900">
                              {r.ten || 'chưa có tên'}
                            </span>
                            {r.loai_hinh && (
                              <span className="inline-block text-[11px] font-bold rounded px-1.5 py-0.5 bg-[#EFE6F5] text-[#4A1D6E]">
                                {r.loai_hinh}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 align-middle text-xs">
                          {is531120 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[#8A6100] tabular-nums">
                                {formatInt(r.bg_trong_tui_lon)}
                              </span>
                              <span className="text-gray-500">
                                ({p531120}% sản lượng)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-[170px]">
                              <div className="flex-1 h-4 rounded bg-[#F6F1E7] min-w-[60px] overflow-hidden">
                                <div
                                  className="h-4 rounded bg-[#4A1D6E]"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <span className="font-bold text-gray-900 tabular-nums whitespace-nowrap">
                                {formatInt(r.bg_trong_tui_lon)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums text-gray-900 align-middle">
                          {formatInt(r.bg_trong_tui_nho)}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums text-gray-900 align-middle">
                          {formatInt(r.so_tui_lon)}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums text-gray-900 align-middle">
                          {formatInt(r.so_bg_tui_lon_nhat)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Dòng cuối 1: Cộng x nơi có túi từ N BG trở lên */}
                  <tr className="font-bold border-t-2 border-[#E4D5AE] text-xs">
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] tabular-nums">
                      Cộng {formatInt(largePlaces.length)} nơi có túi từ {nguong} BG trở lên
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] tabular-nums">
                      {formatInt(largeTotals.bgLon)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                      {formatInt(largeTotals.bgNho)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                      {formatInt(largeTotals.soTuiLon)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE]" />
                  </tr>

                  {/* Dòng cuối 2: y nơi chỉ có túi dưới N BG (bấm để mở) */}
                  <tr
                    onClick={() => setShowSmallOnly((v) => !v)}
                    className="border-b border-[#E4D5AE] text-gray-600 cursor-pointer hover:bg-[#F3EDE0] text-xs"
                  >
                    <td className="py-2 px-2.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {showSmallOnly ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {formatInt(smallOnlyPlaces.length)} nơi chỉ có túi dưới {nguong} BG (bấm để mở)
                        </span>
                      </span>
                    </td>
                    <td className="py-2 px-2.5 tabular-nums">0</td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-medium">
                      {formatInt(smallOnlyTotals.bgNho)}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums">0</td>
                    <td className="py-2 px-2.5" />
                  </tr>

                  {showSmallOnly &&
                    smallOnlyPlaces.map((r) => (
                      <tr
                        key={`small-${r.ma}`}
                        onClick={() => handleChiTietRowClick(r)}
                        className="bg-white border-b border-[#F0E8D4] text-gray-600 cursor-pointer hover:bg-[#FAF6EC] text-xs"
                      >
                        <td className="py-2 pl-8 pr-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-900 tabular-nums">
                              {r.ma}
                            </span>
                            <span>{r.ten || 'chưa có tên'}</span>
                            {r.loai_hinh && (
                              <span className="inline-block text-[11px] font-bold rounded px-1.5 py-0.5 bg-[#EFE6F5] text-[#4A1D6E]">
                                {r.loai_hinh}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 tabular-nums">0</td>
                        <td className="py-2 px-2.5 text-right tabular-nums">
                          {formatInt(r.bg_trong_tui_nho)}
                        </td>
                        <td className="py-2 px-2.5 text-right tabular-nums">0</td>
                        <td className="py-2 px-2.5 text-right tabular-nums">
                          {formatInt(r.so_bg_tui_lon_nhat)}
                        </td>
                      </tr>
                    ))}

                  {/* Dòng cuối 3: Cộng z nơi có hàng vào 530100 */}
                  <tr className="font-bold border-t-2 border-[#E4D5AE] text-xs">
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] tabular-nums">
                      Cộng {formatInt(theoNoiDong.length)} nơi có hàng vào 530100
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] tabular-nums">
                      {formatInt(apiMeta.bg_trong_tui_lon || 0)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                      {formatInt(apiMeta.bg_trong_tui_nho || 0)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE] text-right tabular-nums">
                      {formatInt(apiMeta.so_tui_lon || 0)}
                    </td>
                    <td className="py-2 px-2.5 border-t-2 border-[#E4D5AE]" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Khối thu gọn 1: Danh sách bưu gửi của nơi đóng */}
          <div className="border border-dashed border-[#E4D5AE] rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <b>Danh sách bưu gửi của nơi đóng</b>{' '}
                <span className="text-gray-600">
                  · bấm một dòng ở bảng trên để mở: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng; hộp chọn «Chỉ túi từ {nguong} BG trở lên» bật sẵn
                </span>
                {selectedNoiDong && (
                  <span className="font-bold text-[#4A1D6E]">
                    {' '}· {selectedNoiDong.ma} ({selectedNoiDong.ten || 'chưa có tên'})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <ExcelDropdownButton
                  tu={tu}
                  den={den}
                  loaiHinh={loaiHinh}
                  disabled={!tu || !den || !!rangeError || loading}
                />
                {selectedNoiDong && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNoiDong(null);
                      setDsData(null);
                    }}
                    className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#D9CBA8] text-gray-600 hover:bg-[#FAF6EC] cursor-pointer"
                    aria-label="Đóng danh sách bưu gửi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {selectedNoiDong && (
              <div className="space-y-3 pt-2 border-t border-[#F0E8D4]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-900 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={chiTuiLon}
                      onChange={(e) => {
                        setChiTuiLon(e.target.checked);
                        setDsPage(1);
                      }}
                      className="w-4 h-4 accent-[#4A1D6E] rounded cursor-pointer"
                    />
                    <span>Chỉ túi từ {nguong} BG trở lên</span>
                  </label>

                  {dsData?.pagination && (
                    <span className="text-xs text-gray-600 tabular-nums">
                      Tổng {formatInt(dsData.pagination.total)} bưu gửi · trang{' '}
                      {dsData.pagination.page}/{Math.max(1, dsData.pagination.total_pages)}
                    </span>
                  )}
                </div>

                {dsLoading && (
                  <div className="py-4 flex items-center justify-center gap-2 text-xs text-[#4A1D6E]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tải danh sách…</span>
                  </div>
                )}

                {dsError && !dsLoading && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {dsError}
                  </div>
                )}

                {dsData && !dsLoading && !dsError && (
                  <>
                    {dsData.items?.length === 0 ? (
                      <div className="py-4 text-center text-xs text-gray-500">
                        Không có bưu gửi phù hợp.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#FAF5E8] border-b-2 border-[#E4D5AE] text-gray-700">
                              <th className="text-left py-2 px-2.5 font-bold">Số hiệu</th>
                              <th className="text-left py-2 px-2.5 font-bold">Ngày hàng đến</th>
                              <th className="text-left py-2 px-2.5 font-bold">Ngày đóng chuyến thư</th>
                              <th className="text-right py-2 px-2.5 font-bold">Số bưu gửi trong túi</th>
                              <th className="text-left py-2 px-2.5 font-bold">Mã túi</th>
                              <th className="text-left py-2 px-2.5 font-bold">BCVH đích</th>
                              <th className="text-left py-2 px-2.5 font-bold">Dịch vụ</th>
                              <th className="text-right py-2 px-2.5 font-bold">Khối lượng (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dsData.items.map((item) => (
                              <tr
                                key={`${item.shbg}-${item.khoa_tui || ''}`}
                                className="border-b border-[#F0E8D4] hover:bg-[#FAF6EC]"
                              >
                                <td className="py-2 px-2.5 font-mono font-semibold text-gray-900">
                                  {item.shbg}
                                </td>
                                <td className="py-2 px-2.5 tabular-nums text-gray-900">
                                  {formatDdMmYyyy(item.ngay_den)}
                                </td>
                                <td className="py-2 px-2.5 tabular-nums text-gray-600">
                                  {item.ngay_dong_chuyen ? formatDdMmYyyy(item.ngay_dong_chuyen) : '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums font-semibold text-gray-900">
                                  {formatInt(item.so_bg_trong_tui)}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-gray-600">
                                  {item.ma_tui || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-gray-900">
                                  {item.bcvh_dich?.ten
                                    ? `${item.bcvh_dich.ma} · ${item.bcvh_dich.ten}`
                                    : item.bcvh_dich?.ma || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-gray-600">
                                  {item.dich_vu?.ten || item.dich_vu?.ma || '—'}
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums text-gray-900">
                                  {formatKgDecimal(item.kg)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {dsData.pagination && dsData.pagination.total_pages > 1 && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={dsPage <= 1}
                          onClick={() => setDsPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 min-h-[44px] text-xs font-medium bg-white border border-[#D9CBA8] rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Trang trước
                        </button>
                        <button
                          type="button"
                          disabled={dsPage >= dsData.pagination.total_pages}
                          onClick={() =>
                            setDsPage((p) => Math.min(dsData.pagination.total_pages, p + 1))
                          }
                          className="px-3 py-1.5 min-h-[44px] text-xs font-medium bg-white border border-[#D9CBA8] rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Trang sau
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Khối thu gọn 2: Cách tính và giới hạn (DC-6 4.6) */}
          <div className="border border-dashed border-[#E4D5AE] rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <b>Cách tính và giới hạn</b>{' '}
                <span className="text-gray-600">· mở ra để đọc</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="px-3.5 py-1.5 min-h-[44px] text-xs font-medium text-gray-800 bg-white border border-[#D9CBA8] rounded-full hover:bg-[#FAF6EC] transition-colors cursor-pointer"
              >
                {showGuide ? 'Đóng' : 'Mở'}
              </button>
            </div>

            {showGuide && (
              <ul className="mt-3 pt-3 border-t border-[#F0E8D4] list-disc pl-5 space-y-1.5 text-xs text-gray-600 leading-relaxed">
                <li>
                  Túi từ {nguong} bưu gửi trở lên là dấu hiệu cần nhắc, chưa phải kết luận đóng sai. Cỡ túi chỉ đếm bưu gửi nội tỉnh; hàng đi tỉnh khác nằm cùng túi không tính.
                </li>
                <li>
                  Ngưỡng {nguong} là mặc định, đặt ở tham số hệ thống; dấu «từ {nguong} trở lên» (≥) chưa được xác nhận lần cuối. Bảng không gồm 6 BCVH làm nơi đóng.
                </li>
                <li>
                  Bảng hướng đi: mỗi dòng là một nơi đóng chuyến thư vào 530100, chỉ tính bưu gửi trong túi từ {nguong} BG trở lên; mỗi cột là BCVH mà 530100 đóng tiếp hàng đó đi. Dòng trên của ô là số bưu gửi, dòng dưới là số túi có ít nhất một bưu gửi đi BCVH đó. Một túi chứa hàng đi nhiều BCVH được tính ở mỗi BCVH, nên số túi trong một dòng không cộng lại thành số túi của nơi đóng. Ô đậm hơn là hướng chiếm phần lớn hơn của nơi đóng; dấu chấm là không có hàng đi hướng đó.
                </li>
                <li>
                  Số túi ở dòng «Cộng» của mỗi cột là tổng số túi của các nơi có hàng đi BCVH đó.
                </li>
                <li>
                  Bảng chi tiết: 531120 hiện số liệu riêng; thanh của các nơi còn lại chia theo mức lớn nhất của nhóm đó, không so với 531120. Hai dòng cuối nối số với tổng hàng vào 530100 trong khoảng ngày: {formatInt(dongVaoTong)} = {formatInt(apiMeta.bg_trong_tui_lon || 0)} + {formatInt(apiMeta.bg_trong_tui_nho || 0)}.
                </li>
                <li>
                  531120: chưa biết có thoả thuận đóng chuyến riêng hay không.
                </li>
                <li>
                  Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc; hệ thống chưa có cột điểm chấp nhận. Chưa tính hàng hoàn.
                </li>
                <li>
                  Ngày hàng đến được tính như màn «Hàng tại Khai thác tỉnh»; ngày chưa trọn không tính vào thứ hạng.
                </li>
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
