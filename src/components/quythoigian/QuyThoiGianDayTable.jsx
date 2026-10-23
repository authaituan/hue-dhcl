import React from 'react';
import {
  formatInt,
  formatPercent,
  formatDdMm,
  NGUONG_IT_SO_LIEU_BANG
} from './quyThoiGianFormatters';

export default function QuyThoiGianDayTable({
  dayData = [],
  dateRange = { from: '', to: '' },
  onSelectDate,
}) {
  const isSingleDay = dateRange.from === dateRange.to;

  // Sắp ngày giảm dần (mới nhất lên trước)
  const sortedDays = [...dayData].sort((a, b) => (b.ngay_den || '').localeCompare(a.ngay_den || ''));

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
      <div className="mb-3">
        <h2 className="hue-h2">
          Theo từng ngày trong khoảng đã chọn
        </h2>
        <p className="text-xs text-gray-600 mt-1">
          {isSingleDay
            ? 'Đang chọn một ngày; hiển thị 7 ngày tính đến ngày này.'
            : 'Số liệu từng ngày theo thứ tự mới nhất trước; bấm một ngày để thu về ngày đó.'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left table-soft">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Ngày</th>
              <th className="text-right whitespace-nowrap">Đến</th>
              <th className="text-right whitespace-nowrap">Đo được</th>
              <th className="text-right whitespace-nowrap">Quá hạn</th>
              <th className="whitespace-nowrap">Tỉ lệ quá hạn</th>
              <th className="text-right whitespace-nowrap">Sắp hết hạn</th>
            </tr>
          </thead>
          <tbody>
            {sortedDays.map((row, idx) => {
              const ngayDen = row.ngay_den;
              // Dòng nằm trong khoảng chọn
              const isInSelectedRange = ngayDen >= dateRange.from && ngayDen <= dateRange.to;
              const chinh = row.chinh || 0;
              const isItSoLieu = chinh < NGUONG_IT_SO_LIEU_BANG;
              const tyLe = row.ty_le_qua_han !== null ? row.ty_le_qua_han * 100 : null;
              const ddMmStr = formatDdMm(ngayDen);

              return (
                <tr
                  key={idx}
                  className={`transition-colors cursor-pointer ${
                    isInSelectedRange
                      ? 'bg-[#FFF8E6] hover:bg-[#FFF1CC] font-semibold'
                      : 'hover:bg-cream-light/40'
                  }`}
                  onClick={() => onSelectDate(ngayDen)}
                  title={`Bấm để chọn ngày ${ddMmStr}`}
                >
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate(ngayDen);
                      }}
                      className={`text-left hover:underline cursor-pointer ${
                        isInSelectedRange ? 'text-[#4A1D6E] font-bold' : 'text-gray-900'
                      }`}
                    >
                      {ddMmStr} {isInSelectedRange && (isSingleDay ? '— đang xem' : '— trong khoảng')}
                    </button>
                  </td>
                  <td className="text-right font-medium text-gray-700 whitespace-nowrap">
                    {formatInt(row.den)}
                  </td>
                  <td className="text-right font-medium text-gray-700 whitespace-nowrap">
                    {formatInt(chinh)}
                  </td>
                  <td className="text-right font-bold text-[#B3202A] whitespace-nowrap">
                    {formatInt(row.qua_han)}
                  </td>
                  <td className="min-w-[140px] whitespace-nowrap">
                    {chinh === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : isItSoLieu ? (
                      <span className="italic text-gray-500 text-xs">
                        {formatPercent(row.ty_le_qua_han)} (ít số liệu)
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-cream-line h-2 rounded-full overflow-hidden max-w-[80px]">
                          <div
                            className="bg-[#B3202A] h-full rounded-full"
                            style={{ width: `${Math.min(100, tyLe || 0)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 w-12 text-right">
                          {formatPercent(row.ty_le_qua_han)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="text-right font-medium text-[#A87A12] whitespace-nowrap">
                    {formatInt(row.sap_het)}
                  </td>
                </tr>
              );
            })}
            {sortedDays.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-xs text-gray-500 italic py-6">
                  Chưa có dữ liệu cho các ngày trong khoảng này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
