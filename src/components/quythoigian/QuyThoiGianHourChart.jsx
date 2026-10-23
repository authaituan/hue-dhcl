import React from 'react';
import { formatInt } from './quyThoiGianFormatters';

const BARS_CONFIG = [
  { key: 'QUA_HAN', label: 'Quá hạn', color: '#B3202A' },
  { key: 'SAP_HET', label: 'Sắp hết', color: '#E0A82E' },
  { key: 'CON_2_6', label: 'Còn 2–6 giờ', color: '#4DAA88' },
  { key: 'CON_TREN_6', label: 'Còn trên 6 giờ', color: '#1F7A5C' },
];

export default function QuyThoiGianHourChart({ theoGio = [] }) {
  // Tìm giá trị max của chinh để tính tỉ lệ chiều cao cột (ít nhất là 10 để tránh chia cho 0)
  const maxChinh = Math.max(1, ...theoGio.map((g) => g.chinh || 0));

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
      <div className="mb-4">
        <h2 className="hue-h2 text-[17px]">
          Hàng đến BCVH theo khung giờ trong ngày
        </h2>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Khung giờ theo lúc bưu cục nhận bưu gửi; mỗi cột có chia theo dải thời gian còn lại, gồm bưu gửi đo được và giao nhận trực tiếp.
        </p>
      </div>

      {/* Vùng biểu đồ cột */}
      <div className="pt-8 pb-4 border-b border-cream-line">
        <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-[190px]">
          {theoGio.map((item, idx) => {
            const total = item.chinh || 0;
            const colHeightPct = total > 0 ? Math.max(8, Math.round((total / maxChinh) * 100)) : 0;
            const dai = item.dai || {};

            return (
              <div key={idx} className="flex flex-col items-center h-full justify-end group">
                {/* Số tổng trên đỉnh cột */}
                <div className="text-xs font-bold text-[#4A1D6E] mb-1 font-sans text-center">
                  {total > 0 ? formatInt(total) : '0'}
                </div>

                {/* Thân cột xếp chồng */}
                <div
                  className="w-full max-w-[64px] rounded-t-[4px] overflow-hidden flex flex-col-reverse transition-all duration-300"
                  style={{ height: `${colHeightPct}%`, minHeight: total > 0 ? '6px' : '0' }}
                >
                  {/* Bốn dải xếp chồng: từ dưới lên trên Quá hạn -> Sắp hết -> Còn 2-6 -> Còn >6 */}
                  {BARS_CONFIG.map((b) => {
                    const count = dai[b.key] || 0;
                    if (count <= 0) return null;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div
                        key={b.key}
                        style={{ height: `${pct}%`, backgroundColor: b.color }}
                        title={`${b.label}: ${formatInt(count)} (${pct.toFixed(1)}%)`}
                        className="w-full transition-opacity hover:opacity-90"
                      />
                    );
                  })}
                </div>

                {/* Nhãn khung giờ dưới đáy */}
                <div className="mt-2 text-xs text-gray-700 font-medium text-center whitespace-nowrap">
                  {item.khung}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chú giải (Legend) */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-3 text-xs">
        {BARS_CONFIG.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5 text-gray-700">
            <span
              className="w-3 h-3 rounded-[3px] shrink-0"
              style={{ backgroundColor: b.color }}
            />
            <span>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
