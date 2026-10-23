import React from 'react';
import {
  formatInt,
  formatPercent,
  NGUONG_IT_SO_LIEU_KHUNG_GIO
} from './quyThoiGianFormatters';

const BARS_CONFIG = [
  { key: 'QUA_HAN', label: 'Quá hạn', color: '#B3202A' },
  { key: 'SAP_HET', label: 'Sắp hết', color: '#E0A82E' },
  { key: 'CON_2_6', label: 'Còn 2–6 giờ', color: '#4DAA88' },
  { key: 'CON_TREN_6', label: 'Còn trên 6 giờ', color: '#1F7A5C' },
];

export default function QuyThoiGianHourTable({ theoGio = [], tong = {} }) {
  // Tính tổng cho dòng "Cả khoảng chọn" từ tong hoặc cộng từ theoGio
  const tongChinh = tong.chinh ?? theoGio.reduce((acc, g) => acc + (g.chinh || 0), 0);
  const tongQuaHan = tong.dai?.QUA_HAN ?? theoGio.reduce((acc, g) => acc + (g.dai?.QUA_HAN || 0), 0);
  const tongSapHet = tong.dai?.SAP_HET ?? theoGio.reduce((acc, g) => acc + (g.dai?.SAP_HET || 0), 0);
  const tongTyLeQuaHan = tong.ty_le_qua_han ?? (tongChinh > 0 ? tongQuaHan / tongChinh : null);
  const tongDai = tong.dai || {
    QUA_HAN: tongQuaHan,
    SAP_HET: tongSapHet,
    CON_2_6: theoGio.reduce((acc, g) => acc + (g.dai?.CON_2_6 || 0), 0),
    CON_TREN_6: theoGio.reduce((acc, g) => acc + (g.dai?.CON_TREN_6 || 0), 0)
  };

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="hue-h2">
            Hàng đến BCVH theo khung giờ
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Khung giờ theo lúc bưu cục nhận bưu gửi; gồm bưu gửi đo được và giao nhận trực tiếp.
          </p>
        </div>

        {/* Chú giải bốn màu NGAY TRÊN bảng */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          {BARS_CONFIG.map((b) => (
            <div key={b.key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left table-soft">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Khung giờ</th>
              <th className="text-right whitespace-nowrap">Đo được</th>
              <th className="min-w-[180px] max-w-[260px]">Cơ cấu thời gian còn lại</th>
              <th className="text-right whitespace-nowrap">Quá hạn</th>
              <th className="text-right whitespace-nowrap">Sắp hết hạn</th>
            </tr>
          </thead>
          <tbody>
            {theoGio.map((row, idx) => {
              const chinh = row.chinh || 0;
              const isItSoLieu = chinh < NGUONG_IT_SO_LIEU_KHUNG_GIO;
              const dai = row.dai || {};
              const quaHan = dai.QUA_HAN || 0;
              const sapHet = dai.SAP_HET || 0;
              const tyLeQuaHan = chinh > 0 ? quaHan / chinh : null;

              return (
                <tr key={idx} className="hover:bg-cream-light/40 transition-colors">
                  <td className="font-semibold text-gray-900 whitespace-nowrap">
                    {row.khung}
                  </td>
                  <td className="text-right font-medium text-gray-700">
                    {formatInt(chinh)}
                  </td>
                  <td className="min-w-[180px] max-w-[260px] py-2">
                    {chinh > 0 ? (
                      <div className="h-4.5 w-full rounded-[4px] overflow-hidden flex bg-gray-100 border border-cream-line">
                        {BARS_CONFIG.map((b) => {
                          const count = dai[b.key] || 0;
                          if (count <= 0) return null;
                          const pct = (count / chinh) * 100;
                          return (
                            <div
                              key={b.key}
                              style={{ width: `${pct}%`, backgroundColor: b.color }}
                              title={`${b.label}: ${formatInt(count)} (${pct.toFixed(1)}%)`}
                              className="h-full"
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-4.5 w-full rounded-[4px] bg-gray-100 border border-cream-line flex items-center justify-center text-xs text-gray-400">
                        —
                      </div>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {chinh === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : isItSoLieu ? (
                      <span className="italic text-gray-500">
                        {formatInt(quaHan)} · ít số liệu
                      </span>
                    ) : (
                      <span className="font-bold text-[#B3202A]">
                        {formatInt(quaHan)} · {formatPercent(tyLeQuaHan)}
                      </span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap font-medium text-[#A87A12]">
                    {chinh > 0 ? formatInt(sapHet) : '—'}
                  </td>
                </tr>
              );
            })}

            {/* Dòng cuối "Cả khoảng chọn" */}
            <tr className="bg-cream-head/60 font-semibold border-t-2 border-[#D9CBA8]">
              <td className="text-gray-900">
                Cả khoảng chọn
              </td>
              <td className="text-right text-gray-900">
                {formatInt(tongChinh)}
              </td>
              <td className="min-w-[180px] max-w-[260px] py-2">
                {tongChinh > 0 ? (
                  <div className="h-4.5 w-full rounded-[4px] overflow-hidden flex bg-gray-100 border border-cream-line">
                    {BARS_CONFIG.map((b) => {
                      const count = tongDai[b.key] || 0;
                      if (count <= 0) return null;
                      const pct = (count / tongChinh) * 100;
                      return (
                        <div
                          key={b.key}
                          style={{ width: `${pct}%`, backgroundColor: b.color }}
                          title={`${b.label}: ${formatInt(count)} (${pct.toFixed(1)}%)`}
                          className="h-full"
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-4.5 w-full rounded-[4px] bg-gray-100 border border-cream-line flex items-center justify-center text-xs text-gray-400">
                    —
                  </div>
                )}
              </td>
              <td className="text-right whitespace-nowrap text-[#B3202A]">
                {tongChinh > 0 ? `${formatInt(tongQuaHan)} · ${formatPercent(tongTyLeQuaHan)}` : '—'}
              </td>
              <td className="text-right whitespace-nowrap text-[#A87A12]">
                {tongChinh > 0 ? formatInt(tongSapHet) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
