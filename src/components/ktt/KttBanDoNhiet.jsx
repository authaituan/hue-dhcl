import React, { useState, useMemo } from 'react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';
import { formatNguonTen, isNguonChuaCoTen } from './kttFormatters';
import KttTooltip from './KttTooltip';

/** Ngưỡng số bưu gửi tối thiểu của một ô để tô màu; dưới mức này chỉ hiện «Ít mẫu · N bưu gửi». */
export const NGUONG_IT_MAU_O = 20;

/**
 * Tính màu nền và màu chữ cho ô theo độ đậm của đỏ #B3202A trên nền kem,
 * đảm bảo độ tương phản chữ >= 4.5:1.
 */
function getCellTintStyle(ratio) {
  if (ratio === null || ratio === undefined || isNaN(ratio) || ratio <= 0) {
    return {
      className: 'bg-white hover:bg-[#FFFBEF] text-gray-900',
      subTextClass: 'text-gray-500',
    };
  }
  if (ratio <= 0.15) {
    return {
      className: 'bg-[#FDF2F2] hover:bg-[#FCE7E8] text-[#7A151C]',
      subTextClass: 'text-[#7A151C]/80',
    };
  }
  if (ratio <= 0.30) {
    return {
      className: 'bg-[#FBE4E5] hover:bg-[#F9D6D8] text-[#7A151C]',
      subTextClass: 'text-[#7A151C]/80',
    };
  }
  if (ratio <= 0.50) {
    return {
      className: 'bg-[#F5B5B8] hover:bg-[#F2A2A6] text-[#5C0D13]',
      subTextClass: 'text-[#5C0D13]/90',
    };
  }
  if (ratio <= 0.70) {
    return {
      className: 'bg-[#D9535B] hover:bg-[#C9424A] text-white',
      subTextClass: 'text-white/90',
    };
  }
  return {
    className: 'bg-[#B3202A] hover:bg-[#9B1921] text-white',
    subTextClass: 'text-white/90',
  };
}

function getMetricConfig(colorBy) {
  if (colorBy === 'truot_chuyen') {
    return { label: 'Vừa rớt lại vừa trượt chuyến' };
  }
  if (colorBy === 'khong_dat') {
    return { label: 'Không đạt 14 giờ' };
  }
  return { label: 'Rớt lại' };
}

function MatrixCellButton({
  hasNoData,
  shbg,
  primaryVal,
  displayRatio,
  colorRatio,
  isSelected,
  borderClass = 'border-gray-200/80',
  tooltipTitle,
  tooltipAriaLabel,
  tooltipRows,
  onClick,
}) {
  const isEmpty = hasNoData || shbg === 0;
  const isFewSample = !isEmpty && shbg < NGUONG_IT_MAU_O;
  const style = isEmpty
    ? { className: 'bg-white hover:bg-[#FFFBEF] text-gray-900', subTextClass: 'text-gray-500' }
    : isFewSample
    ? { className: 'bg-[#FAF5E8]/70 hover:bg-[#FAF5E8] text-gray-800', subTextClass: 'text-gray-600' }
    : getCellTintStyle(colorRatio);

  const tooltipContent = !isEmpty ? (
    <div className="space-y-1.5 min-w-[210px]">
      <div className="font-bold border-b border-gray-700 pb-1 flex items-center justify-between gap-3">
        <span>{tooltipTitle}</span>
        <span className="text-gray-300 font-normal">
          Tổng: <strong className="text-white font-bold tabular-nums">{formatInt(shbg)}</strong> bưu gửi
        </span>
      </div>
      <div className="space-y-1 text-[11px]">
        {tooltipRows.map((row) => (
          <div key={row.label} className={`flex items-center justify-between gap-3 ${row.highlight ? '' : 'text-gray-300'}`}>
            <span className={row.highlight ? 'text-amber-300 font-semibold' : ''}>{row.label}:</span>
            <span className={`tabular-nums ${row.highlight ? 'font-bold text-white' : ''}`}>
              {row.valueText}
            </span>
          </div>
        ))}
      </div>
      <div className="pt-1 border-t border-gray-800 text-[11px] text-gray-400 italic">
        Bấm để xem danh sách chi tiết bưu gửi
      </div>
    </div>
  ) : null;

  return (
    <KttTooltip content={tooltipContent} ariaLabel={tooltipAriaLabel} className="w-full h-full">
      <button
        type="button"
        onClick={onClick}
        className={`w-full h-full min-h-[54px] px-2 py-1.5 rounded-[8px] border ${borderClass} flex flex-col items-center justify-center transition-all cursor-pointer ${
          style.className
        } ${isSelected ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm' : ''}`}
      >
        {isEmpty ? (
          <span className="text-gray-400 italic">—</span>
        ) : isFewSample ? (
          <>
            <div className="text-sm font-bold tabular-nums leading-tight">
              {formatInt(primaryVal)}
            </div>
            <div className={`text-[11px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}>
              Ít mẫu · {formatInt(shbg)} bưu gửi
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold tabular-nums leading-tight">
              {formatInt(primaryVal)}
            </div>
            <div className={`text-[11px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}>
              {formatPercent(displayRatio)} của {formatInt(shbg)}
            </div>
          </>
        )}
      </button>
    </KttTooltip>
  );
}

export default function KttBanDoNhiet({
  data,
  selectedBcvh,
  selectedCell,
  onSelectCell,
}) {
  const hasNoData = !data?.co_du_lieu;
  const [colorBy, setColorBy] = useState('ro_lai'); // 'ro_lai' | 'truot_chuyen' | 'khong_dat'

  // Nhóm nguồn sắp xếp: các đường thư đến trước, Nội tỉnh và Không rõ nguồn đặt cuối
  const sortedNguon = useMemo(() => {
    const list = data?.tong_cong?.theo_nguon || [];
    const regular = list.filter((g) => g.ma !== 'NOI_TINH' && g.ma !== 'KHONG_RO_NGUON');
    const noiTinh = list.filter((g) => g.ma === 'NOI_TINH');
    const khongRo = list.filter((g) => g.ma === 'KHONG_RO_NGUON');
    return [...regular, ...noiTinh, ...khongRo];
  }, [data]);

  // Hàng chuyển hoàn
  const hhData = useMemo(() => {
    if (!data?.tong_cong?.hang_hoan) return null;
    const calc = (hh) => {
      const shbg = hh?.tong_shbg ?? 0;
      const roLai = (hh?.trang_thai?.t3?.shbg ?? 0) +
        (hh?.trang_thai?.t4?.shbg ?? 0) +
        (hh?.trang_thai?.t5?.shbg ?? 0);
      const truot = (hh?.dung_chuyen?.truot_chuyen ?? 0) + (hh?.dung_chuyen?.lo_chuyen ?? 0);
      return { shbg, roLai, truot };
    };

    const theo_bcvh = {};
    BCVH_LIST.forEach((b) => {
      theo_bcvh[b.ma] = calc(data?.tong_cong?.theo_bcvh?.[b.ma]?.hang_hoan);
    });

    const tong = calc(data.tong_cong.hang_hoan);
    return { ...tong, theo_bcvh };
  }, [data]);

  // Dòng "Cộng" dưới đáy cho từng BCVH
  const bcvhTotals = useMemo(() => {
    if (!data?.tong_cong?.theo_bcvh) return {};
    const map = {};
    BCVH_LIST.forEach((b) => {
      const bBlock = data.tong_cong.theo_bcvh[b.ma];
      const shbg = bBlock?.luu_thoat?.mau_so ?? 0;
      const roLai = (bBlock?.trang_thai?.t3?.shbg ?? 0) +
        (bBlock?.trang_thai?.t4?.shbg ?? 0) +
        (bBlock?.trang_thai?.t5?.shbg ?? 0);
      const truot = (bBlock?.dung_chuyen?.truot_chuyen ?? 0) +
        (bBlock?.dung_chuyen?.lo_chuyen ?? 0);
      const khongDat = bBlock?.dat_khong_dat?.khong_dat ?? 0;
      const roLaiTruot = (data?.tong_cong?.theo_nguon || []).reduce(
        (s, g) => s + (g.theo_bcvh?.[b.ma]?.ro_lai_truot_chuyen ?? 0),
        0
      );
      map[b.ma] = { shbg, roLai, truot, khongDat, roLaiTruot };
    });

    const grandShbg = data.tong_cong.luu_thoat?.mau_so ?? 0;
    const grandRoLai = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
      (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
      (data.tong_cong.trang_thai?.t5?.shbg ?? 0);
    const grandTruot = (data.tong_cong.dung_chuyen?.truot_chuyen ?? 0) +
      (data.tong_cong.dung_chuyen?.lo_chuyen ?? 0);
    const grandKhongDat = data.tong_cong.dat_khong_dat?.khong_dat ?? 0;
    const grandRoLaiTruot = (data?.tong_cong?.theo_nguon || []).reduce(
      (s, g) => s + (g.ro_lai_truot_chuyen ?? 0),
      0
    );
    map.ALL = {
      shbg: grandShbg,
      roLai: grandRoLai,
      truot: grandTruot,
      khongDat: grandKhongDat,
      roLaiTruot: grandRoLaiTruot,
    };

    return map;
  }, [data]);

  if (!data?.tong_cong) return null;

  const { label: metricLabel } = getMetricConfig(colorBy);

  const buildStandardCellProps = ({ title, shbg, roLai, roLaiTruot, khongDat, showKhongDat = true }) => {
    let metricVal = roLai;
    if (colorBy === 'truot_chuyen') metricVal = roLaiTruot;
    else if (colorBy === 'khong_dat') metricVal = khongDat;

    const ratio = shbg > 0 ? metricVal / shbg : 0;
    const roLaiRatio = shbg > 0 ? roLai / shbg : 0;
    const primaryVal = colorBy === 'khong_dat' ? khongDat : roLai;
    const displayRatio = colorBy === 'khong_dat' ? ratio : roLaiRatio;

    const tooltipAriaLabel = hasNoData || shbg === 0
      ? `${title}: không có dữ liệu`
      : `${title} · ${metricLabel}: ${formatInt(metricVal)} bưu gửi (${formatPercent(ratio)}) trong tổng số ${formatInt(shbg)} bưu gửi · Vừa rớt lại vừa trượt chuyến: ${formatInt(roLaiTruot)} · Rớt lại: ${formatInt(roLai)}`;

    const tooltipRows = [
      {
        label: metricLabel,
        valueText: `${formatInt(metricVal)} bưu gửi (${formatPercent(ratio)})`,
        highlight: true,
      },
      {
        label: 'Rớt lại',
        valueText: `${formatInt(roLai)} bưu gửi (${formatPercent(roLaiRatio)})`,
      },
      {
        label: 'Vừa rớt lại vừa trượt chuyến',
        valueText: `${formatInt(roLaiTruot)} bưu gửi (${formatPercent(shbg > 0 ? roLaiTruot / shbg : 0)})`,
      },
    ];
    if (showKhongDat) {
      tooltipRows.push({
        label: 'Không đạt 14 giờ',
        valueText: `${formatInt(khongDat)} bưu gửi (${formatPercent(shbg > 0 ? khongDat / shbg : 0)})`,
      });
    }

    return {
      hasNoData,
      shbg,
      primaryVal,
      displayRatio,
      colorRatio: ratio,
      tooltipTitle: title,
      tooltipAriaLabel,
      tooltipRows,
    };
  };

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
      {/* ── TIÊU ĐỀ & CÔNG TẮC TÔ MÀU ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="hue-h2 text-[17px]">
            Rớt lại nằm ở đâu: nguồn × BCVH đích
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Mỗi ô: số rớt lại và % của ô. Ô dưới {NGUONG_IT_MAU_O} bưu gửi không tô màu, ghi «Ít mẫu». «Trượt chuyến» chỉ hiện khi rê chuột hoặc ở danh sách. Bấm một ô để mở danh sách.
          </p>
        </div>

        {/* 3 nút công tắc tô màu */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF5E8] p-1 rounded-[10px] border border-[#E4D5AE] shrink-0 text-xs">
          <span className="text-gray-600 font-semibold px-2 py-1">Tô màu theo:</span>
          <button
            type="button"
            onClick={() => setColorBy('ro_lai')}
            className={`px-3 py-1 rounded-[8px] font-bold transition-colors cursor-pointer ${
              colorBy === 'ro_lai'
                ? 'bg-[#4A1D6E] text-white shadow-none'
                : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            Rớt lại
          </button>
          <button
            type="button"
            onClick={() => setColorBy('truot_chuyen')}
            className={`px-3 py-1 rounded-[8px] font-bold transition-colors cursor-pointer ${
              colorBy === 'truot_chuyen'
                ? 'bg-[#4A1D6E] text-white shadow-none'
                : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            Vừa rớt lại vừa trượt chuyến
          </button>
          <button
            type="button"
            onClick={() => setColorBy('khong_dat')}
            className={`px-3 py-1 rounded-[8px] font-bold transition-colors cursor-pointer ${
              colorBy === 'khong_dat'
                ? 'bg-[#4A1D6E] text-white shadow-none'
                : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            Không đạt 14 giờ
          </button>
        </div>
      </div>

      {/* ── BẢNG MA TRẬN NGUỒN × BCVH ──────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E4D5AE] bg-[#FAF5E8]/60">
              <th className="py-2.5 px-3 font-bold text-gray-700 text-left min-w-[180px]">
                Nguồn / đường thư đến
              </th>
              {BCVH_LIST.map((b) => (
                <th
                  key={b.ma}
                  className={`py-2.5 px-2 text-center font-bold text-gray-800 ${
                    selectedBcvh === b.ma ? 'bg-[#FAF5E8] text-[#4A1D6E]' : ''
                  }`}
                >
                  {b.ten.replace('BCVH ', '')}
                </th>
              ))}
              <th className="py-2.5 px-3 text-center font-bold text-gray-900 bg-[#FAF5E8]">
                Cộng
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedNguon.map((g) => {
              const nguonLabelText = formatNguonTen(g);
              const chuaCoTen = isNguonChuaCoTen(g);

              return (
                <tr key={g.ma} className="hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-semibold text-gray-900 whitespace-nowrap">
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

                  {BCVH_LIST.map((b) => {
                    const cell = g.theo_bcvh?.[b.ma];
                    const props = buildStandardCellProps({
                      title: `${nguonLabelText} × ${b.ten}`,
                      shbg: cell?.shbg ?? 0,
                      roLai: cell?.ro_lai ?? 0,
                      roLaiTruot: cell?.ro_lai_truot_chuyen ?? 0,
                      khongDat: cell?.khong_dat ?? 0,
                    });
                    const isSelected =
                      selectedCell?.nguon === g.ma &&
                      selectedCell?.ma_bcvh === b.ma &&
                      selectedCell?.loai === colorBy;

                    return (
                      <td key={b.ma} className="p-1">
                        <MatrixCellButton
                          {...props}
                          isSelected={isSelected}
                          onClick={() =>
                            onSelectCell({
                              nguon: g.ma,
                              nguonTen: nguonLabelText,
                              ma_bcvh: b.ma,
                              bcvhTen: b.ten,
                              loai: colorBy,
                              label: `${nguonLabelText} × ${b.ten} · ${metricLabel}`,
                            })
                          }
                        />
                      </td>
                    );
                  })}

                  <td className="p-1 bg-[#FAF5E8]/30">
                    <MatrixCellButton
                      {...buildStandardCellProps({
                        title: `${nguonLabelText} · Tất cả BCVH`,
                        shbg: g.shbg ?? 0,
                        roLai: g.ro_lai ?? 0,
                        roLaiTruot: g.ro_lai_truot_chuyen ?? 0,
                        khongDat: g.dat_khong_dat?.khong_dat ?? 0,
                        showKhongDat: false,
                      })}
                      borderClass="border-gray-300"
                      isSelected={
                        selectedCell?.nguon === g.ma &&
                        !selectedCell?.ma_bcvh &&
                        selectedCell?.loai === colorBy
                      }
                      onClick={() =>
                        onSelectCell({
                          nguon: g.ma,
                          nguonTen: nguonLabelText,
                          ma_bcvh: null,
                          bcvhTen: 'Tất cả BCVH',
                          loai: colorBy,
                          label: `${nguonLabelText} · Tất cả BCVH · ${metricLabel}`,
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}

            {/* ── DÒNG «CỘNG» ──────────────────────────────────────────────── */}
            <tr className="bg-[#FAF5E8]/60 font-semibold border-t-2 border-[#E4D5AE]">
              <td className="py-2.5 px-3 font-bold text-gray-900">Cộng</td>
              {BCVH_LIST.map((b) => {
                const total = bcvhTotals[b.ma] || { shbg: 0, roLai: 0, truot: 0, khongDat: 0, roLaiTruot: 0 };
                return (
                  <td key={b.ma} className="p-1">
                    <MatrixCellButton
                      {...buildStandardCellProps({
                        title: `Tất cả nguồn × ${b.ten}`,
                        shbg: total.shbg,
                        roLai: total.roLai,
                        roLaiTruot: total.roLaiTruot ?? 0,
                        khongDat: total.khongDat,
                      })}
                      borderClass="border-gray-300"
                      isSelected={
                        !selectedCell?.nguon &&
                        selectedCell?.ma_bcvh === b.ma &&
                        selectedCell?.loai === colorBy
                      }
                      onClick={() =>
                        onSelectCell({
                          nguon: null,
                          nguonTen: 'Tất cả nguồn',
                          ma_bcvh: b.ma,
                          bcvhTen: b.ten,
                          loai: colorBy,
                          label: `Tất cả nguồn × ${b.ten} · ${metricLabel}`,
                        })
                      }
                    />
                  </td>
                );
              })}

              <td className="p-1 bg-[#FAF5E8]">
                {(() => {
                  const total = bcvhTotals.ALL || { shbg: 0, roLai: 0, truot: 0, khongDat: 0, roLaiTruot: 0 };
                  return (
                    <MatrixCellButton
                      {...buildStandardCellProps({
                        title: 'Toàn bộ KTT',
                        shbg: total.shbg,
                        roLai: total.roLai,
                        roLaiTruot: total.roLaiTruot ?? 0,
                        khongDat: total.khongDat,
                        showKhongDat: false,
                      })}
                      borderClass="border-2 border-gray-400"
                      isSelected={
                        !selectedCell?.nguon &&
                        !selectedCell?.ma_bcvh &&
                        selectedCell?.loai === colorBy
                      }
                      onClick={() =>
                        onSelectCell({
                          nguon: null,
                          nguonTen: 'Tất cả nguồn',
                          ma_bcvh: null,
                          bcvhTen: 'Tất cả BCVH',
                          loai: colorBy,
                          label: `Toàn bộ KTT · ${metricLabel}`,
                        })
                      }
                    />
                  );
                })()}
              </td>
            </tr>

            {/* ── DÒNG «HÀNG CHUYỂN HOÀN» ─────────────────────── */}
            {hhData && (
              <tr className="bg-purple-50/20 text-xs">
                <td className="py-2.5 px-3">
                  <div className="font-bold text-gray-900">Hàng chuyển hoàn</div>
                  <div className="text-[11px] text-gray-500 italic mt-0.5">
                    Không tính chỉ tiêu 14 giờ; không cộng vào dòng Cộng
                  </div>
                </td>

                {BCVH_LIST.map((b) => {
                  const bHh = hhData.theo_bcvh?.[b.ma] || { shbg: 0, roLai: 0, truot: 0 };
                  const ratio = bHh.shbg > 0 ? bHh.roLai / bHh.shbg : 0;
                  return (
                    <td key={b.ma} className="p-1">
                      <MatrixCellButton
                        hasNoData={hasNoData}
                        shbg={bHh.shbg}
                        primaryVal={bHh.roLai}
                        displayRatio={ratio}
                        colorRatio={ratio}
                        borderClass="border-purple-300"
                        tooltipTitle={`Hàng chuyển hoàn × ${b.ten}`}
                        tooltipAriaLabel={`Hàng chuyển hoàn × ${b.ten} · Rớt lại: ${formatInt(bHh.roLai)} (${formatPercent(ratio)}) trong ${formatInt(bHh.shbg)} bưu gửi · Trượt chuyến: ${formatInt(bHh.truot)}`}
                        tooltipRows={[
                          {
                            label: 'Rớt lại',
                            valueText: `${formatInt(bHh.roLai)} bưu gửi (${formatPercent(ratio)})`,
                            highlight: true,
                          },
                          {
                            label: 'Trượt chuyến',
                            valueText: `${formatInt(bHh.truot)} bưu gửi (${formatPercent(bHh.shbg > 0 ? bHh.truot / bHh.shbg : 0)})`,
                          },
                        ]}
                        isSelected={selectedCell?.loai === 'hang_hoan' && selectedCell?.ma_bcvh === b.ma}
                        onClick={() =>
                          onSelectCell({
                            nguon: null,
                            nguonTen: 'Hàng chuyển hoàn',
                            ma_bcvh: b.ma,
                            bcvhTen: b.ten,
                            loai: 'hang_hoan',
                            label: `Hàng chuyển hoàn · ${b.ten}`,
                          })
                        }
                      />
                    </td>
                  );
                })}

                <td className="p-1 bg-[#FAF5E8]/30">
                  {(() => {
                    const ratio = hhData.shbg > 0 ? hhData.roLai / hhData.shbg : 0;
                    return (
                      <MatrixCellButton
                        hasNoData={hasNoData}
                        shbg={hhData.shbg}
                        primaryVal={hhData.roLai}
                        displayRatio={ratio}
                        colorRatio={ratio}
                        borderClass="border-gray-300"
                        tooltipTitle="Hàng chuyển hoàn · Tất cả BCVH"
                        tooltipAriaLabel={`Hàng chuyển hoàn · Tất cả BCVH · Rớt lại: ${formatInt(hhData.roLai)} (${formatPercent(ratio)}) trong ${formatInt(hhData.shbg)} bưu gửi · Trượt chuyến: ${formatInt(hhData.truot)}`}
                        tooltipRows={[
                          {
                            label: 'Rớt lại',
                            valueText: `${formatInt(hhData.roLai)} bưu gửi (${formatPercent(ratio)})`,
                            highlight: true,
                          },
                          {
                            label: 'Trượt chuyến',
                            valueText: `${formatInt(hhData.truot)} bưu gửi (${formatPercent(hhData.shbg > 0 ? hhData.truot / hhData.shbg : 0)})`,
                          },
                        ]}
                        isSelected={selectedCell?.loai === 'hang_hoan' && !selectedCell?.ma_bcvh}
                        onClick={() =>
                          onSelectCell({
                            ma_bcvh: null,
                            loai: 'hang_hoan',
                            nguon: null,
                            nguonTen: 'Hàng chuyển hoàn',
                            label: 'Hàng chuyển hoàn',
                          })
                        }
                      />
                    );
                  })()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <div className="text-xs text-gray-600 pt-0.5">
          Đang lọc danh sách theo ô: <strong className="text-[#4A1D6E]">{selectedCell.label}</strong>
        </div>
      )}
    </div>
  );
}
