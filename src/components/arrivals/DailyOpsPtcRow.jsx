import React from 'react';
import { AlertCircle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatPercent } from './DailyOpsDashboard';

/**
 * Hàng thẻ PTC dành cho Dashboard «Điều hành hôm nay» (PHAT-3c):
 * Gồm: 1 thẻ PTC lớn + 4 thẻ nhỏ (Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có thông tin phát).
 * - Ngưỡng lấy từ `ketQuaPhat.nguong` (ptc_dat, chua_co_tt_canh_bao).
 * - PTC >= ngưỡng: thẻ xanh; < ngưỡng: thẻ vàng.
 * - Chưa có thông tin phát >= ngưỡng cảnh báo: thẻ đỏ.
 * - co_so_lieu_phat = false: hiện «Chưa có số liệu phát», các thẻ nhỏ hiện «—», tuyệt đối không hiện 0%.
 * - Dòng «số liệu đến lúc» chỉ hiện khi `so_lieu_den_luc` có giá trị.
 */
/**
 * Chuyển chuỗi giờ Bangkok (e.g. '2026-10-14 17:45:48' hoặc '2026-10-14T17:45:48')
 * thành định dạng «HH:mm · dd/MM/yyyy» (bỏ giây, tách chuỗi thuần túy không dùng new Date).
 */
export function formatBangkokTime(str) {
  if (!str) return '';
  const s = String(str).trim();
  // Khớp YYYY-MM-DD HH:mm(:ss)? hoặc YYYY-MM-DDTHH:mm(:ss)?
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return `${h}:${mi} · ${d}/${mo}/${y}`;
  }
  // Khớp dd/MM/yyyy HH:mm(:ss)?
  const m2 = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/.exec(s);
  if (m2) {
    const [, d, mo, y, h, mi] = m2;
    return `${h}:${mi} · ${d}/${mo}/${y}`;
  }
  return s;
}

export default function DailyOpsPtcRow({ ketQuaPhat, phatError }) {
  // Trạng thái D: Lỗi quyền (403) hoặc lỗi mạng khi tải kết quả phát
  if (phatError) {
    return (
      <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] p-4 rounded-2xl flex items-center gap-3 shadow-2xs">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
        <div className="text-xs">
          <span className="font-bold">Kết quả phát: </span>
          <span>{phatError}</span>
        </div>
      </div>
    );
  }

  // Khi chưa có dữ liệu kết quả phát (đang tải)
  if (!ketQuaPhat) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="md:col-span-2 lg:col-span-2 h-32 bg-white rounded-2xl border border-gray-200 p-5 animate-pulse" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200 p-4 animate-pulse" />
        ))}
      </div>
    );
  }

  const {
    co_so_lieu_phat: coSoLieu,
    ptc,
    mau_so: mauSo = 0,
    theo_trang_thai: theoTrangThai,
    so_lieu_den_luc: soLieuDenLuc,
    so_lieu_den_luc_bangkok: soLieuDenLucBangkok,
    nguong
  } = ketQuaPhat;

  // Lấy ngưỡng từ API (không dùng hằng số riêng)
  const nguongPtc = nguong?.ptc_dat ?? 0.82;
  const nguongChuaCoTt = nguong?.chua_co_tt_canh_bao ?? 0.10;

  const pktc = theoTrangThai?.PKTC;
  const chuyenHoan = theoTrangThai?.CHUYEN_HOAN;
  const lacHuong = theoTrangThai?.LAC_HUONG;
  const chuaCoTt = theoTrangThai?.CHUA_CO_TT;
  const soPtc = theoTrangThai?.PTC?.so ?? 0;

  // Đánh giá đạt/chưa đạt ngưỡng PTC
  const isPtcDat = coSoLieu && ptc !== null && ptc !== undefined && ptc >= nguongPtc;
  // Cảnh báo Chưa có thông tin phát
  const isChuaCoTtCanhBao = coSoLieu && chuaCoTt?.ty_le !== null && chuaCoTt?.ty_le !== undefined && chuaCoTt.ty_le >= nguongChuaCoTt;

  // Kiểu hiển thị thẻ PTC lớn
  let ptcCardBg = 'bg-white border-[#e7e5e4]';
  let ptcTextColor = 'text-[#292524]';
  let ptcBadge = null;

  if (!coSoLieu) {
    // Trạng thái C: Chưa có số liệu phát
    ptcCardBg = 'bg-white border-[#e7e5e4]';
    ptcBadge = (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-300">
        Chưa có số liệu phát
      </span>
    );
  } else if (isPtcDat) {
    // Trạng thái A: Đạt ngưỡng PTC (thẻ xanh)
    ptcCardBg = 'bg-[#ecfdf5] border-[#a7f3d0]';
    ptcTextColor = 'text-[#047857]';
    ptcBadge = (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        <span>Đạt mục tiêu (≥ {Math.round(nguongPtc * 100)}%)</span>
      </span>
    );
  } else {
    // Trạng thái A2: Dưới ngưỡng PTC (thẻ vàng)
    ptcCardBg = 'bg-[#fffbeb] border-[#fde68a]';
    ptcTextColor = 'text-[#b45309]';
    ptcBadge = (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        <span>Chưa đạt mục tiêu (&lt; {Math.round(nguongPtc * 100)}%)</span>
      </span>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      {/* 1. THẺ PTC LỚN (chiếm 2 cột trên màn lớn) */}
      <div className={`md:col-span-2 lg:col-span-2 rounded-2xl border p-5 shadow-2xs flex flex-col justify-between transition-all ${ptcCardBg}`}>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] font-bold text-[#78716c] uppercase tracking-wider">
              Tỷ lệ phát thành công (PTC)
            </span>
            {ptcBadge}
          </div>

          {!coSoLieu ? (
            /* Tuyệt đối KHÔNG hiện 0% khi chưa có số liệu phát */
            <div className="my-2.5">
              <div className="text-xl sm:text-2xl font-black text-[#78716c] leading-tight">
                Chưa có số liệu phát
              </div>
              <div className="text-xs text-[#a8a29e] mt-1">
                Mẫu số: {mauSo.toLocaleString('vi-VN')} bưu gửi đến
              </div>
            </div>
          ) : (
            <div className="my-2">
              <div className={`text-3xl sm:text-4xl font-black leading-none ${ptcTextColor}`}>
                {formatPercent(ptc)}
              </div>
              <div className="text-xs font-semibold text-[#57534e] mt-1.5">
                {soPtc.toLocaleString('vi-VN')} / {mauSo.toLocaleString('vi-VN')} bưu gửi phát thành công
              </div>
            </div>
          )}
        </div>

        {/* Dòng «số liệu đến lúc»: CHỈ hiện khi so_lieu_den_luc có giá trị */}
        {soLieuDenLuc && (
          <div className="text-[11px] text-[#78716c] pt-2 mt-2 border-t border-black/5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#a8a29e] shrink-0" />
            <span>Số liệu đến lúc: {formatBangkokTime(soLieuDenLucBangkok || soLieuDenLuc)}</span>
          </div>
        )}
      </div>

      {/* 2. THẺ NHỎ: PHÁT KHÔNG THÀNH CÔNG */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-bold text-[#78716c] uppercase tracking-wider mb-1 line-clamp-1">
            Phát không thành công
          </div>
          <div className="text-2xl font-black text-[#0f2747] leading-tight my-1">
            {!coSoLieu ? '—' : (pktc?.so ?? 0).toLocaleString('vi-VN')}
          </div>
        </div>
        <div className="text-xs font-semibold text-[#57534e] pt-2 border-t border-[#f5f5f4]">
          {!coSoLieu ? '—' : formatPercent(pktc?.ty_le)}
        </div>
      </div>

      {/* 3. THẺ NHỎ: CHUYỂN HOÀN */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-bold text-[#78716c] uppercase tracking-wider mb-1 line-clamp-1">
            Chuyển hoàn
          </div>
          <div className="text-2xl font-black text-[#0f2747] leading-tight my-1">
            {!coSoLieu ? '—' : (chuyenHoan?.so ?? 0).toLocaleString('vi-VN')}
          </div>
        </div>
        <div className="text-xs font-semibold text-[#57534e] pt-2 border-t border-[#f5f5f4]">
          {!coSoLieu ? '—' : formatPercent(chuyenHoan?.ty_le)}
        </div>
      </div>

      {/* 4. THẺ NHỎ: LẠC HƯỚNG */}
      <div className="bg-white rounded-2xl border border-[#e7e5e4] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-bold text-[#78716c] uppercase tracking-wider mb-1 line-clamp-1">
            Lạc hướng
          </div>
          <div className="text-2xl font-black text-[#0f2747] leading-tight my-1">
            {!coSoLieu ? '—' : (lacHuong?.so ?? 0).toLocaleString('vi-VN')}
          </div>
        </div>
        <div className="text-xs font-semibold text-[#57534e] pt-2 border-t border-[#f5f5f4]">
          {!coSoLieu ? '—' : formatPercent(lacHuong?.ty_le)}
        </div>
      </div>

      {/* 5. THẺ NHỎ: CHƯA CÓ THÔNG TIN PHÁT (cảnh báo đỏ nếu >= ngưỡng) */}
      <div className={`rounded-2xl border p-4 sm:p-5 shadow-2xs flex flex-col justify-between transition-all ${
        isChuaCoTtCanhBao
          ? 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
          : 'bg-white border-[#e7e5e4]'
      }`}>
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className={`text-[11px] font-bold uppercase tracking-wider line-clamp-1 ${
              isChuaCoTtCanhBao ? 'text-[#991b1b]' : 'text-[#78716c]'
            }`}>
              Chưa có TT phát
            </span>
            {isChuaCoTtCanhBao && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 border border-red-200 shrink-0">
                ≥ {Math.round(nguongChuaCoTt * 100)}%
              </span>
            )}
          </div>
          <div className={`text-2xl font-black leading-tight my-1 ${
            isChuaCoTtCanhBao ? 'text-[#991b1b]' : 'text-[#0f2747]'
          }`}>
            {!coSoLieu ? '—' : (chuaCoTt?.so ?? 0).toLocaleString('vi-VN')}
          </div>
        </div>
        <div className={`text-xs font-semibold pt-2 border-t ${
          isChuaCoTtCanhBao ? 'border-red-200 text-[#b91c1c]' : 'border-[#f5f5f4] text-[#57534e]'
        }`}>
          {!coSoLieu ? '—' : formatPercent(chuaCoTt?.ty_le)}
        </div>
      </div>
    </div>
  );
}
