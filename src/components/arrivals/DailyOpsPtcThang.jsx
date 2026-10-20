import React from 'react';

/**
 * Các phần «từ đầu tháng» của hàng thẻ kết quả phát (DASH-12c, dựng lại ở DASH-12b-3). Dữ liệu: `GET /api/arrivals/dashboard/ket-qua-phat-thang`.
 *  - HÔM NAY và LŨY KẾ là hai luồng riêng: lũy kế chỉ gồm các ngày ĐỦ SỐ LIỆU (máy chủ: «Chưa có TT» < 10%); ngày chưa đủ ngắt đường (null).
 *  - Chênh «điểm so với tháng» do MÁY CHỦ tính (đã làm tròn khớp số hiển thị); null -> «Chưa đủ dữ liệu để so». Màu tốt / xấu do giao diện:
 *    PTC tăng là tốt; Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có TT tăng là xấu. `ngang` (|chênh| < 0,5 điểm, theo máy chủ) -> trung tính.
 *  - Ngưỡng («ngang», sàn so sánh, mục tiêu PTC) nằm ở máy chủ (`nguong`), không khai báo lại ở đây.
 */

// Mã trạng thái -> trường trong theo_ngay[] và chiều xấu khi tăng
export const PTC_THANG_CAU_HINH = Object.freeze({
  PTC: { truong: 'ptc', xauKhiTang: false },
  PKTC: { truong: 'ty_le_pktc', xauKhiTang: true },
  CHUYEN_HOAN: { truong: 'ty_le_chuyen_hoan', xauKhiTang: true },
  LAC_HUONG: { truong: 'ty_le_lac_huong', xauKhiTang: true },
  CHUA_CO_TT: { truong: 'ty_le_chua_co_tt', xauKhiTang: true }
});

/** Tỷ lệ (phân số, 4 chữ số) -> «56,8%»: làm tròn nửa lên về 0,1 điểm bằng số nguyên, đúng cách máy chủ tính chênh (không sai số dấu phẩy động). */
export function formatPct1(r) {
  if (r === null || r === undefined || Number.isNaN(Number(r))) return '—';
  const tenths = Math.floor((Math.round(Number(r) * 10000) + 5) / 10);
  return `${(tenths / 10).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatChenhDiem(d) {
  const abs = Math.abs(d).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (d > 0) return `+${abs}`;
  if (d < 0) return `−${abs}`;
  return abs;
}

/** 'YYYY-MM-DD' -> 'dd/MM' (cắt chuỗi thuần túy, không new Date). */
export const ddMm = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

/** Ngày ĐỦ số liệu cuối cùng của chuỗi (null nếu chưa có ngày nào). */
export function ngayDuCuoi(thang) {
  const ds = (thang?.theo_ngay || []).filter((d) => d.du_so_lieu);
  return ds.length ? ds[ds.length - 1].ngay : null;
}

/**
 * Đường diễn biến: values[i] là tỷ lệ (0–1) hoặc null (ngày chưa đủ số liệu -> ngắt đường). `muc` (tuỳ chọn) = vạch nét đứt mục tiêu.
 * Biên độ nhỏ không bị khuếch đại: trục dọc luôn rộng ít nhất `minSpan` (phân số; 0,04 = 4 điểm) nên dao động dưới 1 điểm vẽ gần phẳng.
 * Trả null nếu không có điểm nào.
 */
export function PtcSparkline({ values, muc = null, minSpan = 0.04, nhan, className = 'w-full h-8' }) {
  const W = 120;
  const H = 30;
  const PAD = 3;
  const n = values.length;
  const co = values.map((v, i) => (v === null || v === undefined ? null : { i, v: Number(v) })).filter(Boolean);
  if (co.length === 0) return null;
  const coMuc = muc !== null && muc !== undefined;
  const tat = co.map((p) => p.v).concat(coMuc ? [Number(muc)] : []);
  let lo = Math.min(...tat);
  let hi = Math.max(...tat);
  const span = Math.max(hi - lo, minSpan);
  const mid = (hi + lo) / 2;
  lo = mid - span / 2;
  hi = mid + span / 2;
  const x = (i) => (n <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const doan = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (cur.length) doan.push(cur);
      cur = [];
    } else {
      cur.push({ i, v: Number(v) });
    }
  });
  if (cur.length) doan.push(cur);
  const last = co[co.length - 1];
  const dot = (cx, cy, w, c) => <path d={`M${cx.toFixed(1)} ${cy.toFixed(1)}h0`} stroke={c} strokeWidth={w} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={nhan} preserveAspectRatio="none">
      {coMuc && (
        <line x1="0" x2={W} y1={y(Number(muc))} y2={y(Number(muc))} stroke="#1F7A5C" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      )}
      {doan.map((d, k) => (d.length === 1
        ? <g key={k}>{dot(x(d[0].i), y(d[0].v), 4, '#9A8AA0')}</g>
        : <polyline key={k} points={d.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke="#9A8AA0" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />))}
      {dot(x(last.i), y(last.v), 6, '#4A1D6E')}
    </svg>
  );
}

/** Chip chênh «▲/▼ x điểm so với tháng». chenh = thang.chenh[mã] hoặc null (chưa đủ dữ liệu để so). `ngan`: bản rút gọn (chân thẻ nhỏ). */
export function ChenhChip({ chenh, xauKhiTang, ngan = false, xuongDong = false }) {
  const nowrap = xuongDong ? 'leading-tight' : 'whitespace-nowrap';
  if (!chenh) {
    return <span className="text-[11px] text-gray-400">{ngan ? 'Chưa đủ dữ liệu để so' : 'Chưa đủ dữ liệu để so với tháng'}</span>;
  }
  if (chenh.huong === 'ngang') {
    return <span className={`inline-block px-1.5 py-0.5 text-[11px] font-bold rounded bg-stone-100 text-stone-600 border border-stone-200 ${nowrap}`}>≈ Ngang tháng ({formatChenhDiem(chenh.chenh_diem)} điểm)</span>;
  }
  const tang = chenh.huong === 'tang';
  const xau = tang === xauKhiTang;
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[11px] font-bold rounded border ${nowrap} ${xau ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
      {tang ? '▲' : '▼'} {formatChenhDiem(chenh.chenh_diem)} điểm{ngan ? '' : ' so với tháng'}
    </span>
  );
}

/** Nhãn khoảng lũy kế: «01/10→» (đủ đến hôm nay) hoặc «01/10→16/10» (hôm nay chưa đủ: ghi ngày đủ cuối cùng). */
export function nhanLuyKe(thang) {
  const L = thang?.luy_ke;
  if (!L) return '';
  const cuoi = ngayDuCuoi(thang);
  const tu = ddMm(L.tu_ngay);
  if (!cuoi) return tu;
  return thang.hom_nay?.du_so_lieu || cuoi === L.den_ngay ? `${tu}→` : `${tu}→${ddMm(cuoi)}`;
}

/**
 * Chân thẻ nhỏ cao 44px, nền xám nhạt: «01/MM→ số · %» và chênh «▲/▼ x điểm». thang: null = đang tải; false / không có luy_ke = lỗi / chưa có số liệu.
 */
export function PtcThangFooter({ thang, ma, vuHoiThang = null }) {
  const cfg = PTC_THANG_CAU_HINH[ma];
  const khung = 'min-h-[44px] shrink-0 bg-cream-foot border-t border-cream-line px-4 py-1.5 flex flex-col justify-center gap-0.5 text-[11px] leading-[14px] overflow-hidden';
  if (thang === null || thang === undefined) return <div className={`${khung} text-gray-400`}>Từ đầu tháng: …</div>;
  const L = thang && thang.luy_ke;
  if (!L || !cfg) return <div className={`${khung} text-gray-400`}>Từ đầu tháng: chưa có số liệu</div>;
  const tt = L.theo_trang_thai?.[ma];
  const co = L.so_ngay_co_so_lieu > 0 && L.mau_so > 0;

  let vuHoiThangNode = null;
  const luyPktcSo = L.theo_trang_thai?.PKTC?.so;
  const khopPktc = vuHoiThang && vuHoiThang.pktc === luyPktcSo;
  if (ma === 'PKTC' && khopPktc && vuHoiThang.hien_thi) {
    const { hien_thi, da_vu_hoi = 0, pktc = 0, ty_le } = vuHoiThang;
    const prefix = nhanLuyKe(thang);
    if (hien_thi === 'TY_LE') {
      vuHoiThangNode = (
        <span className="min-w-0 truncate text-gray-500 font-semibold">
          Vu hồi {prefix} <span className="font-bold text-gray-800 font-sans">{Number(da_vu_hoi).toLocaleString('vi-VN')} / {Number(pktc).toLocaleString('vi-VN')}</span> · {formatPct1(ty_le)}
        </span>
      );
    } else if (hien_thi === 'SO_TUYET_DOI') {
      vuHoiThangNode = (
        <span className="min-w-0 truncate text-gray-500 font-semibold">
          Vu hồi {prefix} <span className="font-bold text-gray-800 font-sans">{Number(da_vu_hoi).toLocaleString('vi-VN')} / {Number(pktc).toLocaleString('vi-VN')}</span>
        </span>
      );
    } else if (hien_thi === 'CHUA_CO_SO_LIEU') {
      vuHoiThangNode = (
        <span className="min-w-0 truncate text-gray-500 font-semibold">
          Vu hồi {prefix ? `${prefix} ` : ''}<span className="text-gray-400 font-medium">chưa có số liệu</span>
        </span>
      );
    }
  }

  return (
    <div className={khung}>
      <span className="min-w-0 truncate text-gray-500 font-semibold" title={`Lũy kế ${ddMm(L.tu_ngay)} → ${ddMm(ngayDuCuoi(thang) || L.den_ngay)}, ${L.so_ngay_co_so_lieu}/${L.so_ngay_trong_khoang} ngày đủ số liệu`}>
        {co ? (
          <>{nhanLuyKe(thang)} <span className="font-bold text-gray-800 font-sans">{(tt?.so ?? 0).toLocaleString('vi-VN')}</span> · {formatPct1(tt?.ty_le)}</>
        ) : (
          <span className="text-gray-400 font-medium">Chưa có ngày đủ số liệu</span>
        )}
      </span>
      {vuHoiThangNode}
      <span className="min-w-0 leading-none"><ChenhChip chenh={thang.chenh?.[ma] || null} xauKhiTang={cfg.xauKhiTang} ngan /></span>
    </div>
  );
}

/** Dãy giá trị của một loại trong theo_ngay (cho PtcSparkline). */
export function chuoiTheoNgay(thang, ma) {
  const cfg = PTC_THANG_CAU_HINH[ma];
  if (!thang || !cfg) return [];
  return (thang.theo_ngay || []).map((d) => d[cfg.truong]);
}
