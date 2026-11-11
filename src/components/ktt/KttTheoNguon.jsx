import React, { useMemo } from 'react';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatNguonTen, isNguonChuaCoTen } from './kttFormatters';
import KttTooltip from './KttTooltip';

export default function KttTheoNguon({ data, selectedBcvh }) {
  const hasNoData = !data?.co_du_lieu;

  // Sắp xếp nhóm nguồn: các đường thư đến trước (theo shbg giảm dần từ API),
  // nhóm «Nội tỉnh · các điểm khác» (NOI_TINH) và «Không rõ nguồn» (KHONG_RO_NGUON) đặt cuối.
  const sortedNguon = useMemo(() => {
    const list = data?.tong_cong?.theo_nguon || [];
    const regular = list.filter((g) => g.ma !== 'NOI_TINH' && g.ma !== 'KHONG_RO_NGUON');
    const noiTinh = list.filter((g) => g.ma === 'NOI_TINH');
    const khongRo = list.filter((g) => g.ma === 'KHONG_RO_NGUON');
    return [...regular, ...noiTinh, ...khongRo];
  }, [data]);

  // Tổng hàng đến và tổng rớt lại dùng cho cột chiếm %
  const { tongDen, tongRot } = useMemo(() => {
    if (!data?.tong_cong) return { tongDen: 0, tongRot: 0 };
    if (selectedBcvh === 'all') {
      const den = data.tong_cong.luu_thoat?.mau_so ?? 0;
      const rot = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
        (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
        (data.tong_cong.trang_thai?.t5?.shbg ?? 0);
      return { tongDen: den, tongRot: rot };
    }
    const bBlock = data.tong_cong.theo_bcvh?.[selectedBcvh];
    const den = bBlock?.luu_thoat?.mau_so ?? 0;
    const rot = (bBlock?.trang_thai?.t3?.shbg ?? 0) +
      (bBlock?.trang_thai?.t4?.shbg ?? 0) +
      (bBlock?.trang_thai?.t5?.shbg ?? 0);
    return { tongDen: den, tongRot: rot };
  }, [data, selectedBcvh]);

  if (!data?.tong_cong) return null;

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="hue-h2 text-[17px]">
            Theo nguồn / đường thư đến ({formatInt(sortedNguon.length)} dòng)
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Sản lượng, khối lượng, tỷ lệ rớt lại và trượt chuyến theo từng luồng nguồn đến KTT.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-soft w-full min-w-[780px] text-left">
          <thead>
            <tr>
              <th className="text-left">NGUỒN / ĐƯỜNG THƯ</th>
              <th className="text-right">HÀNG ĐẾN</th>
              <th className="text-left min-w-[230px]">RỚT LẠI (% CỦA CHÍNH NGUỒN)</th>
              <th className="text-right">TRƯỢT CHUYẾN</th>
              <th className="text-right">
                CHIẾM % HÀNG ĐẾN
                <div className="text-[11px] font-normal normal-case text-gray-500">
                  trong {formatInt(tongDen)} hàng đến
                </div>
              </th>
              <th className="text-right">
                CHIẾM % TỔNG RỚT LẠI
                <div className="text-[11px] font-normal normal-case text-gray-500">
                  trong {formatInt(tongRot)} hàng rớt
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedNguon.map((g) => {
              let shbg = g.shbg;
              let kg = g.kg;
              let roLai = g.ro_lai;
              let truot = g.truot_chuyen;
              if (selectedBcvh !== 'all') {
                const bCell = g.theo_bcvh?.[selectedBcvh];
                shbg = bCell?.shbg ?? 0;
                kg = bCell?.kg ?? 0;
                roLai = bCell?.ro_lai ?? 0;
                truot = bCell?.truot_chuyen ?? 0;
              }

              const tyTrongDen = !hasNoData && tongDen > 0 ? shbg / tongDen : null;
              const tyTrongRot = !hasNoData && tongRot > 0 ? roLai / tongRot : null;
              const rotChinh = !hasNoData && shbg > 0 ? roLai / shbg : null;
              const tyLeLuu = !hasNoData && shbg > 0 ? Math.max(0, shbg - roLai) / shbg : null;
              const tyLeTruot = !hasNoData && shbg > 0 ? truot / shbg : null;
              const luuThoat = Math.max(0, shbg - roLai);
              const nguonLabelText = formatNguonTen(g);
              const chuaCoTen = isNguonChuaCoTen(g);

              return (
                <tr key={g.ma} className="hover:bg-[#FFFBEF] transition-colors">
                  <td className="font-semibold text-gray-900 whitespace-nowrap">
                    {chuaCoTen ? (
                      <>
                        <span className="italic text-gray-500 font-normal">Chưa có tên</span>
                        {' · '}
                        <span>{g.ma}</span>
                      </>
                    ) : (
                      g.ten
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    <div className="font-semibold text-gray-900">
                      {hasNoData ? '—' : formatInt(shbg)}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {hasNoData ? '—' : formatKg(kg, { withUnit: true })}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="tabular-nums font-medium text-gray-800 w-12 text-right shrink-0">
                        {hasNoData ? '—' : formatInt(roLai)}
                      </span>
                      <KttTooltip
                        ariaLabel={`${nguonLabelText} · Hàng đến: ${formatInt(shbg)} bưu gửi · Đi trong ngày: ${formatInt(luuThoat)} (${formatPercent(tyLeLuu)}) · Rớt lại: ${formatInt(roLai)} (${formatPercent(rotChinh)}) · Trượt chuyến: ${formatInt(truot)} (${formatPercent(tyLeTruot)})`}
                        content={
                          <div className="space-y-1 min-w-[210px]">
                            <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-2">
                              <span>{nguonLabelText}</span>
                              <span className="text-gray-300 font-normal tabular-nums">
                                {formatInt(shbg)} bưu gửi
                              </span>
                            </div>
                            <div className="space-y-0.5 text-[11px] pt-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-emerald-300">Đi trong ngày:</span>
                                <span className="tabular-nums font-bold text-white">{formatInt(luuThoat)} ({formatPercent(tyLeLuu)})</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-300">Rớt lại:</span>
                                <span className="tabular-nums font-bold text-white">{formatInt(roLai)} ({formatPercent(rotChinh)})</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-red-300">Trượt chuyến:</span>
                                <span className="tabular-nums font-bold text-white">{formatInt(truot)} ({formatPercent(tyLeTruot)})</span>
                              </div>
                            </div>
                          </div>
                        }
                        className="flex-1 min-w-[80px] cursor-pointer py-1 focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-full"
                      >
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-200 flex">
                          <div
                            style={{ width: `${(tyLeLuu ?? 0) * 100}%` }}
                            className="bg-[#1F7A5C] h-full"
                          />
                          <div
                            style={{ width: `${(rotChinh ?? 0) * 100}%` }}
                            className="bg-[#E0A82E] h-full"
                          />
                        </div>
                      </KttTooltip>
                      <span className="tabular-nums font-bold text-[#A87A12] w-12 text-right shrink-0">
                        {formatPercent(rotChinh)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums">
                    <div className="font-semibold text-[#B3202A]">
                      {formatPercent(tyLeTruot)}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {hasNoData ? '—' : `${formatInt(truot)} bưu gửi`}
                    </div>
                  </td>
                  <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                    {formatPercent(tyTrongDen)}
                  </td>
                  <td className="text-right tabular-nums font-semibold text-[#A87A12]">
                    {formatPercent(tyTrongRot)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
