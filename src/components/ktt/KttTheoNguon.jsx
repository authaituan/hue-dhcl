import React, { useMemo } from 'react';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';
import { formatKg } from './kttFormatters';
import KttTooltip from './KttTooltip';

export default function KttTheoNguon({ data, selectedBcvh, activeHangHoan }) {
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

  // Tổng hàng đến và tổng rớt lại dùng cho mẫu số cột tỷ trọng
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

  // Dữ liệu hàng chuyển hoàn Tổ KHHH 531120
  const hhStats = useMemo(() => {
    if (!data?.tong_cong?.hang_hoan) return null;
    if (selectedBcvh !== 'all' && selectedBcvh !== '533140') return null;
    const hh = activeHangHoan || data.tong_cong.hang_hoan;
    const shbg = hh.tong_shbg ?? 0;
    const kg = (hh.trang_thai?.t1?.kg ?? 0) +
      (hh.trang_thai?.t2?.kg ?? 0) +
      (hh.trang_thai?.t3?.kg ?? 0) +
      (hh.trang_thai?.t4?.kg ?? 0) +
      (hh.trang_thai?.t5?.kg ?? 0);
    const roLai = (hh.trang_thai?.t3?.shbg ?? 0) +
      (hh.trang_thai?.t4?.shbg ?? 0) +
      (hh.trang_thai?.t5?.shbg ?? 0);
    const luuThoat = Math.max(0, shbg - roLai);
    const truot = (hh.dung_chuyen?.truot_chuyen ?? 0) + (hh.dung_chuyen?.lo_chuyen ?? 0);
    const tyLeRot = !hasNoData && shbg > 0 ? roLai / shbg : null;
    const tyLeTruot = !hasNoData && shbg > 0 ? truot / shbg : null;
    const tyLeLuu = !hasNoData && shbg > 0 ? (shbg - roLai) / shbg : null;
    return { shbg, kg, luuThoat, roLai, truot, tyLeRot, tyLeTruot, tyLeLuu };
  }, [data, selectedBcvh, activeHangHoan, hasNoData]);

  if (!data?.tong_cong) return null;

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-5">
      {/* ── 1. THẺ THEO NGUỒN / ĐƯỜNG THƯ ĐẾN ───────────────────────────── */}
      <div>
        <h2 className="ktt-h2 text-[17px]">Theo nguồn / đường thư đến</h2>
        <p className="text-xs text-gray-600 mt-1">
          Sản lượng, khối lượng kg, tỷ lệ rớt lại và trượt chuyến theo từng luồng nguồn bưu gửi đến KTT.
        </p>
      </div>

      {/* Grid thẻ các nhóm nguồn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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

          const tyLeRot = !hasNoData && shbg > 0 ? roLai / shbg : null;
          const tyLeTruot = !hasNoData && shbg > 0 ? truot / shbg : null;
          const tyLeLuu = !hasNoData && shbg > 0 ? (shbg - roLai) / shbg : null;
          const luuThoat = Math.max(0, shbg - roLai);

          return (
            <div
              key={g.ma}
              className="p-4 rounded-[12px] border border-gray-200 bg-white hover:bg-[#FFFBEF] transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="font-bold text-sm text-gray-900 leading-snug">
                  {g.ten}
                </div>
                <div className="text-xs text-gray-600 mt-1.5 tabular-nums">
                  <span className="font-semibold text-gray-900">
                    {hasNoData ? '—' : formatInt(shbg)}
                  </span>
                  {' · '}
                  <span>{hasNoData ? '—' : formatKg(kg, { withUnit: true })}</span>
                  {' · rớt '}
                  <strong className="text-[#A87A12]">{formatPercent(tyLeRot)}</strong>
                  {' · trượt '}
                  <strong className="text-[#B3202A]">{formatPercent(tyLeTruot)}</strong>
                </div>
              </div>

              {/* Thanh lưu thoát nguồn chuẩn KttTooltip */}
              <KttTooltip
                ariaLabel={`${g.ten} · Mẫu số: ${formatInt(shbg)} bưu gửi · Lưu thoát: ${formatInt(luuThoat)} (${formatPercent(tyLeLuu)}) · Rớt lại: ${formatInt(roLai)} (${formatPercent(tyLeRot)}) · Trượt chuyến: ${formatInt(truot)} (${formatPercent(tyLeTruot)})`}
                content={
                  <div className="space-y-1 min-w-[200px]">
                    <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-2">
                      <span>{g.ten}</span>
                      <span className="text-gray-300 font-normal">
                        Mẫu số: <strong className="text-white font-bold tabular-nums">{formatInt(shbg)}</strong> bưu gửi
                      </span>
                    </div>
                    <div className="space-y-0.5 text-[11px] pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-emerald-300">Lưu thoát:</span>
                        <span className="tabular-nums font-bold text-white">{formatInt(luuThoat)} bưu gửi ({formatPercent(tyLeLuu)})</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-300">Rớt lại:</span>
                        <span className="tabular-nums font-bold text-white">{formatInt(roLai)} bưu gửi ({formatPercent(tyLeRot)})</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-red-300">Trượt chuyến:</span>
                        <span className="tabular-nums font-bold text-white">{formatInt(truot)} bưu gửi ({formatPercent(tyLeTruot)})</span>
                      </div>
                    </div>
                  </div>
                }
                className="w-full mt-3 cursor-pointer py-1 focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-full"
              >
                <div className="w-full h-2 rounded-full overflow-hidden bg-gray-200 flex">
                  <div
                    style={{ width: `${(tyLeLuu ?? 0) * 100}%` }}
                    className="bg-[#1F7A5C] h-full"
                  />
                  <div
                    style={{ width: `${(tyLeRot ?? 0) * 100}%` }}
                    className="bg-[#E0A82E] h-full"
                  />
                </div>
              </KttTooltip>
            </div>
          );
        })}
      </div>

      {/* Thẻ hàng chuyển hoàn Tổ KHHH (nếu áp dụng cho Thuận Hóa / Tất cả) */}
      {hhStats && (
        <div className="pt-2">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            KHÔNG TÍNH CHỈ TIÊU
          </div>
          <div className="p-4 rounded-[12px] border border-purple-200 bg-[#FAF5E8] flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-bold text-sm text-gray-900">
                Chuyển hoàn · Tổ KHHH 531120 (về Thuận Hóa)
              </span>
              <span className="text-xs text-gray-500 italic">
                chỉ để theo dõi, không tính vào chỉ tiêu
              </span>
            </div>
            <div className="text-xs text-gray-600 mt-1.5 tabular-nums">
              <span className="font-semibold text-gray-900">
                {hasNoData ? '—' : formatInt(hhStats.shbg)}
              </span>
              {' · '}
              <span>{hasNoData ? '—' : formatKg(hhStats.kg, { withUnit: true })}</span>
              {' · rớt '}
              <strong className="text-[#A87A12]">{formatPercent(hhStats.tyLeRot)}</strong>
              {' · trượt '}
              <strong className="text-[#B3202A]">{formatPercent(hhStats.tyLeTruot)}</strong>
            </div>
            {/* Thanh chuyển hoàn chuẩn KttTooltip */}
            <KttTooltip
              ariaLabel={`Chuyển hoàn Tổ KHHH · Mẫu số: ${formatInt(hhStats.shbg)} bưu gửi · Lưu thoát: ${formatInt(hhStats.luuThoat)} (${formatPercent(hhStats.tyLeLuu)}) · Rớt lại: ${formatInt(hhStats.roLai)} (${formatPercent(hhStats.tyLeRot)}) · Trượt chuyến: ${formatInt(hhStats.truot)} (${formatPercent(hhStats.tyLeTruot)})`}
              content={
                <div className="space-y-1 min-w-[210px]">
                  <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-2">
                    <span>Chuyển hoàn · Tổ KHHH 531120</span>
                    <span className="text-gray-300 font-normal">
                      Mẫu số: <strong className="text-white font-bold tabular-nums">{formatInt(hhStats.shbg)}</strong> bưu gửi
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-emerald-300">Lưu thoát:</span>
                      <span className="tabular-nums font-bold text-white">{formatInt(hhStats.luuThoat)} bưu gửi ({formatPercent(hhStats.tyLeLuu)})</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-amber-300">Rớt lại:</span>
                      <span className="tabular-nums font-bold text-white">{formatInt(hhStats.roLai)} bưu gửi ({formatPercent(hhStats.tyLeRot)})</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-red-300">Trượt chuyến:</span>
                      <span className="tabular-nums font-bold text-white">{formatInt(hhStats.truot)} bưu gửi ({formatPercent(hhStats.tyLeTruot)})</span>
                    </div>
                  </div>
                </div>
              }
              className="w-full mt-3 cursor-pointer py-1 focus:outline-none focus:ring-2 focus:ring-[#1F7A5C] rounded-full"
            >
              <div className="w-full h-2 rounded-full overflow-hidden bg-gray-200 flex">
                <div
                  style={{ width: `${(hhStats.tyLeLuu ?? 0) * 100}%` }}
                  className="bg-[#1F7A5C] h-full"
                />
                <div
                  style={{ width: `${(hhStats.tyLeRot ?? 0) * 100}%` }}
                  className="bg-[#E0A82E] h-full"
                />
              </div>
            </KttTooltip>
          </div>
        </div>
      )}

      {/* ── 2. BẢNG TỶ TRỌNG TỪNG NGUỒN ──────────────────────────────────── */}
      <div className="pt-3">
        <div className="mb-2">
          <div className="text-sm font-bold text-gray-800">Tỷ trọng từng nguồn</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-soft w-full min-w-[700px] text-left">
            <thead>
              <tr>
                <th className="text-left">Nguồn / đường thư đến</th>
                <th className="text-right">
                  TỶ TRỌNG HÀNG ĐẾN
                  <div className="text-[10px] font-normal normal-case text-gray-500">
                    trong tổng {formatInt(tongDen)} hàng đến
                  </div>
                </th>
                <th className="text-right">
                  TỶ TRỌNG HÀNG RỚT LẠI
                  <div className="text-[10px] font-normal normal-case text-gray-500">
                    trong tổng {formatInt(tongRot)} hàng rớt lại
                  </div>
                </th>
                <th className="text-right">
                  RỚT LẠI CỦA CHÍNH NGUỒN
                  <div className="text-[10px] font-normal normal-case text-gray-500">
                    trong hàng đến của nguồn này
                  </div>
                </th>
                <th className="text-right">
                  ĐẠT 14 GIỜ (TRÊN SỐ ĐO ĐƯỢC)
                  <div className="text-[10px] font-normal normal-case text-gray-500">
                    trong hàng đến của nguồn này
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedNguon.map((g) => {
                let shbg = g.shbg;
                let roLai = g.ro_lai;
                if (selectedBcvh !== 'all') {
                  const bCell = g.theo_bcvh?.[selectedBcvh];
                  shbg = bCell?.shbg ?? 0;
                  roLai = bCell?.ro_lai ?? 0;
                }

                const tyTrongDen = !hasNoData && tongDen > 0 ? shbg / tongDen : null;
                const tyTrongRot = !hasNoData && tongRot > 0 ? roLai / tongRot : null;
                const rotChinh = !hasNoData && shbg > 0 ? roLai / shbg : null;

                return (
                  <tr key={g.ma} className="hover:bg-[#FFFBEF] transition-colors">
                    <td className="font-semibold text-gray-900 whitespace-nowrap">
                      {g.ten}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-[#1F7A5C]">
                      {formatPercent(tyTrongDen)}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-[#A87A12]">
                      {formatPercent(tyTrongRot)}
                    </td>
                    <td className="text-right tabular-nums font-medium text-gray-800">
                      {formatPercent(rotChinh)}
                    </td>
                    <td
                      className="text-right tabular-nums font-medium text-gray-400 italic cursor-help"
                      title="Chưa có số liệu chỉ tiêu 14 giờ theo nguồn"
                    >
                      —
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-gray-500 mt-2">
          So «Tỷ trọng hàng đến» với «Tỷ trọng hàng rớt lại»: nguồn có tỷ trọng rớt lại lớn hơn tỷ trọng đến là nguồn rớt nhiều hơn mức chung. Hai cột «trong hàng đến của nguồn này» là tỷ lệ riêng của nguồn. Chỉ tính hàng tính chỉ tiêu.
        </div>
      </div>
    </div>
  );
}
