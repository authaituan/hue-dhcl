import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { formatPercent } from './DailyOpsDashboard';
import {
  PTC_THANG_CAU_HINH, PtcSparkline, ChenhChip, PtcThangFooter, chuoiTheoNgay, formatPct1, ddMm, nhanLuyKe
} from './DailyOpsPtcThang';
import { VuHoiChipLine } from '../../utils/vuHoi';
import { PTC_DAT, CHUA_CO_TT_CANH_BAO } from '../../lib/thamSoDuPhong';

/**
 * Hàng thẻ PTC dành cho Dashboard «Điều hành hôm nay» (PHAT-3c; hai cột HÔM NAY | LŨY KẾ ở DASH-12b-3):
 * Gồm: 1 thẻ PTC lớn + 4 thẻ nhỏ (Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có thông tin phát).
 * - Ngưỡng lấy từ `ketQuaPhat.nguong` (ptc_dat, chua_co_tt_canh_bao); mục tiêu PTC cũng là vạch nét đứt của đường diễn biến.
 * - PTC >= ngưỡng: thẻ xanh; < ngưỡng: thẻ vàng. Chưa có thông tin phát >= ngưỡng cảnh báo: thẻ đỏ.
 * - HÔM NAY hiện SỐ THẬT theo quy tắc ngày đến (#92): chưa xử lý gì thì 0 (0,0%), Chưa có TT 100% kèm «Hôm nay chưa có xử lý» (chỉ «—» khi không có hàng đến).
 *   Ngày chưa đủ số liệu (`du_so_lieu` = false) không có chip mục tiêu và không vào lũy kế.
 * - LŨY KẾ TỪ 01/MM: chỉ các ngày đủ số liệu (`thang`: phản hồi ket-qua-phat-thang; null = đang tải; false = lỗi).
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

/** Một cột số lớn của thẻ PTC lớn: nhãn, số, tử / mẫu (+ ghi chú một dòng). */
function CotSo({ nhan, so, mau, tyLe, mauChu = 'text-dark', ghiChu = null, trong = false }) {
  return (
    <div className="min-w-0 shrink-0 w-[96px]">
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{nhan}</div>
      {trong ? (
        <div className="hue-num-md leading-none my-0.5 text-gray-400">…</div>
      ) : (
        <>
          <div className={`hue-num-md leading-none my-0.5 ${mauChu}`}>{tyLe}</div>
          <div className="text-[11px] font-semibold text-gray-600 whitespace-nowrap font-sans">{so} / {mau}</div>
        </>
      )}
      {ghiChu && <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{ghiChu}</div>}
    </div>
  );
}

/** Thẻ nhỏ: nhãn (cả dòng), số hôm nay + tỷ lệ, đường diễn biến nhỏ bên phải, chân thẻ 44px «01/MM→ số · %» + chênh. */
function TheNho({ nhan, ma, so, tyLe, hienSo, thang, canhBao = false, nguongChu = null, vuHoiNgay = null, vuHoiThang = null }) {
  const mauNhan = canhBao ? 'text-red-800' : 'text-gray-500';
  const mauSo = canhBao ? 'text-red-800' : 'text-orange-600';
  const mauTyLe = canhBao ? 'text-red-700' : 'text-gray-600';
  return (
    <div className={`rounded-[14px] border shadow-none flex flex-col overflow-hidden transition-all ${canhBao ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <div className="p-4 pb-2 flex-1">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className={`text-[11px] font-bold uppercase tracking-wider line-clamp-1 ${mauNhan}`}>{nhan}</span>
          {canhBao && nguongChu && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 border border-red-200 shrink-0">{nguongChu}</span>
          )}
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className={`hue-num-sm leading-tight ${mauSo}`}>{hienSo ? so.toLocaleString('vi-VN') : '—'}</div>
            <div className={`text-xs font-semibold ${mauTyLe}`}>{hienSo ? formatPercent(tyLe) : '—'}</div>
          </div>
          <div className="w-[64px] shrink-0">
            <PtcSparkline values={chuoiTheoNgay(thang || null, ma)} nhan={`Diễn biến theo ngày: ${nhan}`} className="w-full h-8" />
          </div>
        </div>

        {ma === 'PKTC' && vuHoiNgay && (
          <VuHoiChipLine data={vuHoiNgay} />
        )}
      </div>
      <PtcThangFooter thang={thang} ma={ma} vuHoiThang={vuHoiThang} />
    </div>
  );
}

export default function DailyOpsPtcRow({ authUser, ketQuaPhat, phatError, thang = null }) {
  const isTivi = authUser?.role === 'TIVI';
  const [vuHoiNgay, setVuHoiNgay] = useState(null);
  const [vuHoiThang, setVuHoiThang] = useState(null);

  const effectiveNgay = ketQuaPhat?.ngay;
  const effectiveBcvh = ketQuaPhat?.bcvh || 'all';
  const effectiveThang = thang?.thang || (effectiveNgay ? effectiveNgay.slice(0, 7) : null);

  useEffect(() => {
    if (isTivi || !effectiveNgay || !effectiveBcvh) {
      setVuHoiNgay(null);
      return;
    }
    let active = true;
    apiFetchJson(`/api/arrivals/dashboard/vu-hoi?ngay_den=${effectiveNgay}&bcvh=${effectiveBcvh}`)
      .then((res) => {
        if (!active) return;
        setVuHoiNgay(res.ok && res.data?.tong ? res.data.tong : null);
      })
      .catch(() => {
        if (active) setVuHoiNgay(null);
      });
    return () => { active = false; };
  }, [isTivi, effectiveNgay, effectiveBcvh, ketQuaPhat]);

  useEffect(() => {
    if (isTivi || !effectiveThang || !effectiveBcvh) {
      setVuHoiThang(null);
      return;
    }
    let active = true;
    apiFetchJson(`/api/arrivals/dashboard/vu-hoi-thang?thang=${effectiveThang}&bcvh=${effectiveBcvh}`)
      .then((res) => {
        if (!active) return;
        setVuHoiThang(res.ok && res.data?.tong ? res.data.tong : null);
      })
      .catch(() => {
        if (active) setVuHoiThang(null);
      });
    return () => { active = false; };
  }, [isTivi, effectiveThang, effectiveBcvh, ketQuaPhat]);
  // Trạng thái D: Lỗi quyền (403) hoặc lỗi mạng khi tải kết quả phát
  if (phatError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-[14px] flex items-center gap-3 shadow-none">
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
        <div className="md:col-span-2 lg:col-span-2 h-32 bg-white rounded-[14px] border border-gray-200 p-5 animate-pulse" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-white rounded-[14px] border border-gray-200 p-4 animate-pulse" />
        ))}
      </div>
    );
  }

  const {
    ngay,
    ptc,
    mau_so: mauSo = 0,
    theo_trang_thai: theoTrangThai,
    du_so_lieu: duSoLieu,
    so_lieu_den_luc: soLieuDenLuc,
    so_lieu_den_luc_bangkok: soLieuDenLucBangkok,
    nguong
  } = ketQuaPhat;

  // Lấy ngưỡng từ API (không dùng hằng số riêng)
  const nguongPtc = nguong?.ptc_dat ?? PTC_DAT;
  const nguongChuaCoTt = nguong?.chua_co_tt_canh_bao ?? CHUA_CO_TT_CANH_BAO;

  const pktc = theoTrangThai?.PKTC;
  const chuyenHoan = theoTrangThai?.CHUYEN_HOAN;
  const lacHuong = theoTrangThai?.LAC_HUONG;
  const chuaCoTt = theoTrangThai?.CHUA_CO_TT;
  const soPtc = theoTrangThai?.PTC?.so ?? 0;

  // Có hàng đến thì hiện số thật (kể cả 0 / 0,0% khi hôm nay chưa xử lý); không có hàng đến thì «—».
  const hienSo = mauSo > 0;
  // `du_so_lieu` do máy chủ trả; thiếu (phản hồi cũ) thì coi như đủ khi có hàng đến
  const duSo = duSoLieu === undefined ? hienSo : !!duSoLieu;
  const homNayChuaXuLy = hienSo && !duSo;

  const isPtcDat = hienSo && duSo && ptc !== null && ptc !== undefined && ptc >= nguongPtc;
  // Cảnh báo Chưa có thông tin phát (hôm nay chưa xử lý thì 100% -> cảnh báo đỏ, đúng sự thật)
  const isChuaCoTtCanhBao = hienSo && chuaCoTt?.ty_le !== null && chuaCoTt?.ty_le !== undefined && chuaCoTt.ty_le >= nguongChuaCoTt;

  // Kiểu hiển thị thẻ PTC lớn
  let ptcCardBg = 'bg-white border-gray-200';
  let ptcTextColor = 'text-gray-800';
  let ptcBadge = null;

  if (!hienSo) {
    ptcBadge = (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-300">
        Chưa có hàng đến
      </span>
    );
  } else if (!duSo) {
    // Hôm nay chưa đủ số liệu: không đánh giá mục tiêu (số 0,0% do chưa xử lý, không phải kết quả kém)
    ptcTextColor = 'text-gray-600';
    ptcBadge = (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-300">
        Chưa đủ số liệu hôm nay
      </span>
    );
  } else if (isPtcDat) {
    ptcCardBg = 'bg-emerald-50 border-emerald-200';
    ptcTextColor = 'text-emerald-700';
    ptcBadge = (
      <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        <span>Đạt mục tiêu (≥ {Math.round(nguongPtc * 100)}%)</span>
      </span>
    );
  } else {
    ptcCardBg = 'bg-warning-light border-amber-400';
    ptcTextColor = 'text-amber-700';
    ptcBadge = (
      <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-white text-amber-700 border border-amber-400 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        <span>Chưa đạt mục tiêu (&lt; {Math.round(nguongPtc * 100)}%)</span>
      </span>
    );
  }

  // ---- LŨY KẾ (chỉ ngày đủ số liệu) ----
  const dangTai = thang === null || thang === undefined;
  const L = thang && thang.luy_ke;
  const luyPtc = L?.theo_trang_thai?.PTC;
  const coLuyKe = !!L && L.so_ngay_co_so_lieu > 0 && L.mau_so > 0;
  const nhanTu = L ? `TỪ ${ddMm(L.tu_ngay)}` : 'TỪ ĐẦU THÁNG';
  const denNgay = coLuyKe ? nhanLuyKe(thang) : '';
  const denDuCuoi = denNgay && !denNgay.endsWith('→') ? denNgay.split('→')[1] : null; // hôm nay chưa tính: ghi ngày đủ cuối cùng
  const luyGhiChu = coLuyKe
    ? `${denDuCuoi ? `đến ${denDuCuoi} · ` : ''}${L.so_ngay_co_so_lieu}/${L.so_ngay_trong_khoang} ngày đủ`
    : (L ? 'Chưa có ngày đủ số liệu' : null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      {/* 1. THẺ PTC LỚN (chiếm 2 cột trên màn lớn): hai cột HÔM NAY | TỪ 01/MM + chip chênh và đường diễn biến có vạch mục tiêu */}
      <div className={`md:col-span-2 lg:col-span-2 rounded-[14px] border p-4 shadow-none flex flex-col gap-1.5 transition-all ${ptcCardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-orange-600 uppercase tracking-wider">
            Tỷ lệ phát thành công (PTC)
          </span>
          {ptcBadge}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-x-3 gap-y-2">
          <CotSo
            nhan={`HÔM NAY${ngay ? ` · ${ddMm(ngay)}` : ''}`}
            so={soPtc.toLocaleString('vi-VN')}
            mau={mauSo.toLocaleString('vi-VN')}
            tyLe={hienSo ? formatPercent(ptc) : '—'}
            mauChu={ptcTextColor}
            ghiChu={homNayChuaXuLy ? 'Hôm nay chưa có xử lý' : (soLieuDenLuc ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />đến {formatBangkokTime(soLieuDenLucBangkok || soLieuDenLuc).replace(' · ', ' ').replace(/\/\d{4}$/, '')}</span> : null)}
          />
          <div className="hidden sm:block w-px bg-black/10 self-stretch shrink-0" />
          <CotSo
            nhan={nhanTu}
            so={(luyPtc?.so ?? 0).toLocaleString('vi-VN')}
            mau={(L?.mau_so ?? 0).toLocaleString('vi-VN')}
            tyLe={coLuyKe ? formatPct1(luyPtc?.ty_le) : '—'}
            trong={dangTai}
            ghiChu={dangTai ? null : luyGhiChu}
          />
          <div className="flex-1 min-w-[120px] flex flex-col justify-between gap-1">
            <div>
              {dangTai ? (
                <span className="text-[11px] text-gray-400">Từ đầu tháng: …</span>
              ) : !L ? (
                <span className="text-[11px] text-gray-400">Từ đầu tháng: chưa có số liệu</span>
              ) : (
                <ChenhChip chenh={thang.chenh?.PTC || null} xauKhiTang={PTC_THANG_CAU_HINH.PTC.xauKhiTang} xuongDong ngan />
              )}
            </div>
            <PtcSparkline
              values={chuoiTheoNgay(thang || null, 'PTC')}
              muc={nguongPtc}
              minSpan={0.1}
              nhan={`Diễn biến PTC theo ngày từ ${L ? ddMm(L.tu_ngay) : '01'}, nét đứt là mục tiêu ${Math.round(nguongPtc * 100)}%`}
              className="w-full h-8"
            />
          </div>
        </div>
        <div className="text-[10px] text-gray-400 leading-tight">
          Đường = diễn biến theo ngày · nét đứt = mục tiêu {Math.round(nguongPtc * 100)}%
        </div>

      </div>

      {/* 2–5. BỐN THẺ NHỎ */}
      <TheNho
        nhan="Phát không thành công"
        ma="PKTC"
        so={pktc?.so ?? 0}
        tyLe={pktc?.ty_le}
        hienSo={hienSo}
        thang={thang}
        vuHoiNgay={vuHoiNgay}
        vuHoiThang={vuHoiThang}
      />
      <TheNho nhan="Chuyển hoàn" ma="CHUYEN_HOAN" so={chuyenHoan?.so ?? 0} tyLe={chuyenHoan?.ty_le} hienSo={hienSo} thang={thang} />
      <TheNho nhan="Lạc hướng" ma="LAC_HUONG" so={lacHuong?.so ?? 0} tyLe={lacHuong?.ty_le} hienSo={hienSo} thang={thang} />
      <TheNho
        nhan="Chưa có TT phát"
        ma="CHUA_CO_TT"
        so={chuaCoTt?.so ?? 0}
        tyLe={chuaCoTt?.ty_le}
        hienSo={hienSo}
        thang={thang}
        canhBao={isChuaCoTtCanhBao}
        nguongChu={`≥ ${Math.round(nguongChuaCoTt * 100)}%`}
      />
    </div>
  );
}
