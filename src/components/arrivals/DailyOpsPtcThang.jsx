import React from 'react';

/**
 * Khối «từ đầu tháng» dưới mỗi thẻ kết quả phát (DASH-12c; dữ liệu `GET /api/arrivals/dashboard/ket-qua-phat-thang`, DASH-12b):
 *  1. Lũy kế từ ngày 01 đến ngày dữ liệu: số bưu gửi + tỷ lệ (PTC: tử / mẫu).
 *  2. Chênh «điểm so với tháng» = tỷ lệ hôm nay − tỷ lệ lũy kế, do MÁY CHỦ tính (đã làm tròn khớp số hiển thị); null -> «chưa đủ dữ liệu để so».
 *     Màu theo chiều tốt / xấu do giao diện quyết (backend chỉ trả số): PTC tăng là tốt; Phát không thành công, Chuyển hoàn, Lạc hướng,
 *     Chưa có TT tăng là xấu. `ngang` (|chênh| < 0,5 điểm theo máy chủ) -> trung tính.
 *  3. Đường diễn biến theo ngày 01 → ngày dữ liệu; ngày chưa có số liệu (null) ngắt đường.
 * Ngưỡng «ngang» và sàn so sánh nằm ở máy chủ (`nguong`), không khai báo lại ở đây.
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
const ddMm = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

/** Đường diễn biến: values[i] là tỷ lệ (0–1) hoặc null (ngày không có số liệu -> ngắt đường). Trả null nếu không có điểm nào. */
export function PtcSparkline({ values, nhan }) {
  const W = 120;
  const H = 30;
  const PAD = 3;
  const n = values.length;
  const co = values.map((v, i) => (v === null || v === undefined ? null : { i, v: Number(v) })).filter(Boolean);
  if (co.length === 0) return null;
  const min = Math.min(...co.map((p) => p.v));
  const max = Math.max(...co.map((p) => p.v));
  const x = (i) => (n <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD));
  // tách thành các đoạn liên tiếp (không null)
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" role="img" aria-label={nhan} preserveAspectRatio="none">
      {doan.map((d, k) => (d.length === 1
        ? <path key={k} d={`M${x(d[0].i).toFixed(1)} ${y(d[0].v).toFixed(1)}h0`} stroke="#a8a29e" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        : <polyline key={k} points={d.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke="#a8a29e" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />))}
      <path d={`M${x(last.i).toFixed(1)} ${y(last.v).toFixed(1)}h0`} stroke="#0f2747" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Khối dưới thẻ. Props: thang = phản hồi ket-qua-phat-thang (hoặc null khi đang tải / lỗi); ma = mã trạng thái (PTC, PKTC, ...);
 * toi = true khi nền thẻ màu (đạt / chưa đạt / cảnh báo) — chỉ để chọn màu viền phân cách.
 */
export default function PtcThangBlock({ thang, ma, toi = false }) {
  const cfg = PTC_THANG_CAU_HINH[ma];
  const vien = toi ? 'border-black/10' : 'border-[#f5f5f4]';
  if (!thang || !thang.luy_ke || !cfg) {
    return (
      <div className={`mt-2 pt-2 border-t ${vien} text-[11px] text-[#a8a29e]`}>
        {thang === null || thang === undefined ? 'Từ đầu tháng: …' : 'Từ đầu tháng: chưa có số liệu'}
      </div>
    );
  }
  const L = thang.luy_ke;
  const tt = L.theo_trang_thai?.[ma];
  const coLuyKe = L.so_ngay_co_so_lieu > 0 && L.mau_so > 0;
  const soThang = tt?.so ?? 0;
  const chenh = thang.chenh?.[ma] || null;
  const values = (thang.theo_ngay || []).map((d) => d[cfg.truong]);
  const tuDen = `${ddMm(L.tu_ngay)}–${ddMm(L.den_ngay)}`;
  const thieuNgay = L.so_ngay_co_so_lieu < L.so_ngay_trong_khoang;

  let chip;
  if (!chenh) {
    chip = <span className="text-[11px] text-[#a8a29e]">Chưa đủ dữ liệu để so với tháng</span>;
  } else if (chenh.huong === 'ngang') {
    chip = <span className="px-1.5 py-0.5 text-[11px] font-bold rounded bg-stone-100 text-stone-600 border border-stone-200">≈ Ngang tháng ({formatChenhDiem(chenh.chenh_diem)} điểm)</span>;
  } else {
    const tang = chenh.huong === 'tang';
    const xau = tang === cfg.xauKhiTang;
    chip = (
      <span className={`px-1.5 py-0.5 text-[11px] font-bold rounded border ${xau ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
        {tang ? '▲' : '▼'} {formatChenhDiem(chenh.chenh_diem)} điểm so với tháng
      </span>
    );
  }

  return (
    <div className={`mt-2 pt-2 border-t ${vien} space-y-1.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold text-[#78716c] uppercase tracking-wider">Từ đầu tháng {L.thang?.slice(5, 7)}</span>
        <span className="text-[10px] text-[#a8a29e]">{tuDen}</span>
      </div>
      {coLuyKe ? (
        <div className="text-xs font-semibold text-[#57534e]">
          {soThang.toLocaleString('vi-VN')} bưu gửi · <span className="font-black text-[#0f2747]">{formatPct1(tt?.ty_le)}</span>
          {ma === 'PTC' && <span className="text-[#a8a29e] font-medium"> ({soThang.toLocaleString('vi-VN')} / {L.mau_so.toLocaleString('vi-VN')})</span>}
        </div>
      ) : (
        <div className="text-xs text-[#a8a29e]">Chưa có số liệu phát trong tháng</div>
      )}
      <div>{chip}</div>
      <PtcSparkline values={values} nhan={`Diễn biến ${tuDen}, ${L.so_ngay_co_so_lieu} ngày có số liệu`} />
      {thieuNgay && (
        <div className="text-[10px] text-amber-700">{L.so_ngay_co_so_lieu}/{L.so_ngay_trong_khoang} ngày có số liệu phát</div>
      )}
    </div>
  );
}
