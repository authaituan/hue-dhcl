import React from 'react';
import { formatPct1, ddMm } from '../components/arrivals/DailyOpsPtcThang';

/**
 * QUY TẮC HIỂN THỊ THEO hien_thi (#107):
 * - TY_LE: «{da_vu_hoi} / {pktc} · {tỷ lệ %}» (định dạng % như các thẻ khác: dấu phẩy, 1 số lẻ)
 * - SO_TUYET_DOI: «{da_vu_hoi} / {pktc}» (KHÔNG hiện %, không tô đánh giá)
 * - CHUA_CO_SO_LIEU: «chưa có số liệu» (KHÔNG hiện 0%)
 * Đang tải hoặc lỗi (khác 403): ẩn dòng, không làm hỏng thẻ; hai lời gọi vu-hoi và vu-hoi-thang độc lập nhau.
 */
export function formatVuHoiText(data) {
  if (!data || !data.hien_thi) return null;
  const { hien_thi, da_vu_hoi = 0, pktc = 0, ty_le } = data;
  if (hien_thi === 'TY_LE') {
    const vh = Number(da_vu_hoi).toLocaleString('vi-VN');
    const p = Number(pktc).toLocaleString('vi-VN');
    const pct = formatPct1(ty_le);
    return `${vh} / ${p} · ${pct}`;
  }
  if (hien_thi === 'SO_TUYET_DOI') {
    const vh = Number(da_vu_hoi).toLocaleString('vi-VN');
    const p = Number(pktc).toLocaleString('vi-VN');
    return `${vh} / ${p}`;
  }
  if (hien_thi === 'CHUA_CO_SO_LIEU') {
    return 'chưa có số liệu';
  }
  return null;
}

/**
 * Dòng chip «Vu hồi» dưới nét đứt dùng chung cho các thẻ «Phát không thành công»:
 * - chip «Vu hồi» nền xám nhạt trung tính
 * - số liệu bám sát quy tắc 3 mã hien_thi
 */
export function VuHoiChipLine({ data }) {
  if (!data || !data.hien_thi) return null;
  const { hien_thi, da_vu_hoi = 0, pktc = 0, ty_le } = data;

  let textNode = null;
  if (hien_thi === 'TY_LE') {
    textNode = (
      <span className="font-semibold text-gray-700 font-sans tabular-nums truncate">
        {Number(da_vu_hoi).toLocaleString('vi-VN')} / {Number(pktc).toLocaleString('vi-VN')} · {formatPct1(ty_le)}
      </span>
    );
  } else if (hien_thi === 'SO_TUYET_DOI') {
    textNode = (
      <span className="font-semibold text-gray-700 font-sans tabular-nums truncate">
        {Number(da_vu_hoi).toLocaleString('vi-VN')} / {Number(pktc).toLocaleString('vi-VN')}
      </span>
    );
  } else if (hien_thi === 'CHUA_CO_SO_LIEU') {
    textNode = (
      <span className="text-gray-400 font-medium truncate">
        chưa có số liệu
      </span>
    );
  }

  if (!textNode) return null;

  return (
    <div className="mt-2 pt-2 border-t border-dashed border-gray-200 flex items-center gap-1.5">
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#EFE4F7] text-title border border-[#D8BDEB] shrink-0">
        Vu hồi
      </span>
      {textNode}
    </div>
  );
}

export { ddMm, formatPct1 };
