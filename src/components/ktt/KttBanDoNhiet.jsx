import React, { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';

/**
 * Tính màu nền và màu chữ cho ô heatmap theo độ đậm của đỏ #B3202A trên nền kem,
 * đảm bảo độ tương phản chữ >= 4.5:1.
 */
function getHeatmapStyle(ratio) {
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
  // > 70%
  return {
    className: 'bg-[#B3202A] hover:bg-[#9B1921] text-white',
    subTextClass: 'text-white/90',
  };
}

export default function KttBanDoNhiet({
  data,
  selectedBcvh,
  selectedCell,
  onSelectCell,
  onExportCell,
  exportLoading,
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

  // Hàng chuyển hoàn Tổ KHHH
  const hhData = useMemo(() => {
    if (!data?.tong_cong?.hang_hoan) return null;
    const hh = data.tong_cong.hang_hoan;
    const shbg = hh.tong_shbg ?? 0;
    const roLai = (hh.trang_thai?.t3?.shbg ?? 0) +
      (hh.trang_thai?.t4?.shbg ?? 0) +
      (hh.trang_thai?.t5?.shbg ?? 0);
    const truot = (hh.dung_chuyen?.truot_chuyen ?? 0) + (hh.dung_chuyen?.lo_chuyen ?? 0);
    return { shbg, roLai, truot };
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
      map[b.ma] = { shbg, roLai, truot, khongDat };
    });

    // Grand total
    const grandShbg = data.tong_cong.luu_thoat?.mau_so ?? 0;
    const grandRoLai = (data.tong_cong.trang_thai?.t3?.shbg ?? 0) +
      (data.tong_cong.trang_thai?.t4?.shbg ?? 0) +
      (data.tong_cong.trang_thai?.t5?.shbg ?? 0);
    const grandTruot = (data.tong_cong.dung_chuyen?.truot_chuyen ?? 0) +
      (data.tong_cong.dung_chuyen?.lo_chuyen ?? 0);
    const grandKhongDat = data.tong_cong.dat_khong_dat?.khong_dat ?? 0;
    map.ALL = {
      shbg: grandShbg,
      roLai: grandRoLai,
      truot: grandTruot,
      khongDat: grandKhongDat,
    };

    return map;
  }, [data]);

  if (!data?.tong_cong) return null;

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
      {/* ── TIÊU ĐỀ & CÔNG TẮC TÔ MÀU ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="hue-h2 text-[17px]">
            Rớt lại nằm ở đâu: nguồn / đường thư × BCVH đích
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Mỗi ô: số bưu gửi rớt lại, tỷ lệ so với hàng đến của ô, và số trượt chuyến. Ô càng đỏ càng rớt nhiều. Bấm một ô để mở danh sách của ô đó.
          </p>
        </div>

        {/* 3 nút công tắc tô màu */}
        <div className="flex items-center gap-1.5 bg-[#FAF5E8] p-1 rounded-[10px] border border-[#E4D5AE] shrink-0 text-xs">
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
            Trượt chuyến
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

      {/* ── BẢNG BẢN ĐỒ NHIỆT ────────────────────────────────────────────────── */}
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
            {/* Các hàng nhóm nguồn */}
            {sortedNguon.map((g) => {
              return (
                <tr key={g.ma} className="hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-semibold text-gray-900 whitespace-nowrap">
                    {g.ten}
                  </td>

                  {/* 6 ô theo 6 BCVH */}
                  {BCVH_LIST.map((b) => {
                    const cell = g.theo_bcvh?.[b.ma];
                    const shbg = cell?.shbg ?? 0;
                    const roLai = cell?.ro_lai ?? 0;
                    const truot = cell?.truot_chuyen ?? 0;
                    const khongDat = cell?.khong_dat ?? 0;

                    let metricVal = roLai;
                    let subLabel = 'trượt';
                    let subVal = truot;
                    if (colorBy === 'truot_chuyen') {
                      metricVal = truot;
                      subLabel = 'rớt';
                      subVal = roLai;
                    } else if (colorBy === 'khong_dat') {
                      metricVal = khongDat;
                      subLabel = 'trượt';
                      subVal = truot;
                    }

                    const ratio = shbg > 0 ? metricVal / shbg : 0;
                    const style = getHeatmapStyle(hasNoData || shbg === 0 ? 0 : ratio);
                    const isSelected =
                      selectedCell?.nguon === g.ma &&
                      selectedCell?.ma_bcvh === b.ma &&
                      selectedCell?.loai === colorBy;

                    return (
                      <td key={b.ma} className="p-1">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectCell({
                              nguon: g.ma,
                              nguonTen: g.ten,
                              ma_bcvh: b.ma,
                              bcvhTen: b.ten,
                              loai: colorBy,
                              label: `${g.ten} × ${b.ten}`,
                            })
                          }
                          className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border border-gray-200/80 flex flex-col items-center justify-center transition-all cursor-pointer ${
                            style.className
                          } ${
                            isSelected
                              ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm'
                              : ''
                          }`}
                        >
                          {hasNoData || shbg === 0 ? (
                            <span className="text-gray-400 italic">—</span>
                          ) : (
                            <>
                              <div className="text-sm font-bold tabular-nums leading-tight">
                                {formatInt(metricVal)}
                              </div>
                              <div
                                className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                              >
                                {formatPercent(ratio)} của {formatInt(shbg)}
                              </div>
                              <div
                                className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                              >
                                {subLabel} {formatInt(subVal)}
                              </div>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}

                  {/* Ô Cộng của hàng nguồn g */}
                  {(() => {
                    const shbg = g.shbg;
                    const roLai = g.ro_lai;
                    const truot = g.truot_chuyen;
                    const khongDat = g.dat_khong_dat?.khong_dat ?? 0;

                    let metricVal = roLai;
                    let subLabel = 'trượt';
                    let subVal = truot;
                    if (colorBy === 'truot_chuyen') {
                      metricVal = truot;
                      subLabel = 'rớt';
                      subVal = roLai;
                    } else if (colorBy === 'khong_dat') {
                      metricVal = khongDat;
                      subLabel = 'trượt';
                      subVal = truot;
                    }

                    const ratio = shbg > 0 ? metricVal / shbg : 0;
                    const style = getHeatmapStyle(hasNoData || shbg === 0 ? 0 : ratio);
                    const isSelected =
                      selectedCell?.nguon === g.ma &&
                      !selectedCell?.ma_bcvh &&
                      selectedCell?.loai === colorBy;

                    return (
                      <td className="p-1 bg-[#FAF5E8]/30">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectCell({
                              nguon: g.ma,
                              nguonTen: g.ten,
                              ma_bcvh: null,
                              bcvhTen: 'Tất cả BCVH',
                              loai: colorBy,
                              label: `${g.ten} · Tất cả BCVH`,
                            })
                          }
                          className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border border-gray-300 flex flex-col items-center justify-center transition-all cursor-pointer ${
                            style.className
                          } ${
                            isSelected
                              ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm'
                              : ''
                          }`}
                        >
                          {hasNoData || shbg === 0 ? (
                            <span className="text-gray-400 italic">—</span>
                          ) : (
                            <>
                              <div className="text-sm font-bold tabular-nums leading-tight">
                                {formatInt(metricVal)}
                              </div>
                              <div
                                className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                              >
                                {formatPercent(ratio)} của {formatInt(shbg)}
                              </div>
                              <div
                                className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                              >
                                {subLabel} {formatInt(subVal)}
                              </div>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })()}
                </tr>
              );
            })}

            {/* ── DÒNG «CỘNG» ──────────────────────────────────────────────── */}
            <tr className="bg-[#FAF5E8]/60 font-semibold border-t-2 border-[#E4D5AE]">
              <td className="py-2.5 px-3 font-bold text-gray-900">Cộng</td>
              {BCVH_LIST.map((b) => {
                const total = bcvhTotals[b.ma] || { shbg: 0, roLai: 0, truot: 0, khongDat: 0 };
                let metricVal = total.roLai;
                let subLabel = 'trượt';
                let subVal = total.truot;
                if (colorBy === 'truot_chuyen') {
                  metricVal = total.truot;
                  subLabel = 'rớt';
                  subVal = total.roLai;
                } else if (colorBy === 'khong_dat') {
                  metricVal = total.khongDat;
                  subLabel = 'trượt';
                  subVal = total.truot;
                }

                const ratio = total.shbg > 0 ? metricVal / total.shbg : 0;
                const style = getHeatmapStyle(hasNoData || total.shbg === 0 ? 0 : ratio);
                const isSelected =
                  !selectedCell?.nguon &&
                  selectedCell?.ma_bcvh === b.ma &&
                  selectedCell?.loai === colorBy;

                return (
                  <td key={b.ma} className="p-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectCell({
                          nguon: null,
                          nguonTen: 'Tất cả nguồn',
                          ma_bcvh: b.ma,
                          bcvhTen: b.ten,
                          loai: colorBy,
                          label: `Tất cả nguồn × ${b.ten}`,
                        })
                      }
                      className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border border-gray-300 flex flex-col items-center justify-center transition-all cursor-pointer ${
                        style.className
                      } ${
                        isSelected
                          ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm'
                          : ''
                      }`}
                    >
                      {hasNoData || total.shbg === 0 ? (
                        <span className="text-gray-400 italic">—</span>
                      ) : (
                        <>
                          <div className="text-sm font-bold tabular-nums leading-tight">
                            {formatInt(metricVal)}
                          </div>
                          <div
                            className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                          >
                            {formatPercent(ratio)} của {formatInt(total.shbg)}
                          </div>
                          <div
                            className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                          >
                            {subLabel} {formatInt(subVal)}
                          </div>
                        </>
                      )}
                    </button>
                  </td>
                );
              })}

              {/* Ô Grand Total góc dưới bên phải */}
              {(() => {
                const total = bcvhTotals.ALL || { shbg: 0, roLai: 0, truot: 0, khongDat: 0 };
                let metricVal = total.roLai;
                let subLabel = 'trượt';
                let subVal = total.truot;
                if (colorBy === 'truot_chuyen') {
                  metricVal = total.truot;
                  subLabel = 'rớt';
                  subVal = total.roLai;
                } else if (colorBy === 'khong_dat') {
                  metricVal = total.khongDat;
                  subLabel = 'trượt';
                  subVal = total.truot;
                }

                const ratio = total.shbg > 0 ? metricVal / total.shbg : 0;
                const style = getHeatmapStyle(hasNoData || total.shbg === 0 ? 0 : ratio);
                const isSelected =
                  !selectedCell?.nguon && !selectedCell?.ma_bcvh && selectedCell?.loai === colorBy;

                return (
                  <td className="p-1 bg-[#FAF5E8]">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectCell({
                          nguon: null,
                          nguonTen: 'Tất cả nguồn',
                          ma_bcvh: null,
                          bcvhTen: 'Tất cả BCVH',
                          loai: colorBy,
                          label: 'Toàn bộ KTT',
                        })
                      }
                      className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border-2 border-gray-400 flex flex-col items-center justify-center transition-all cursor-pointer ${
                        style.className
                      } ${
                        isSelected
                          ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm'
                          : ''
                      }`}
                    >
                      {hasNoData || total.shbg === 0 ? (
                        <span className="text-gray-400 italic">—</span>
                      ) : (
                        <>
                          <div className="text-sm font-bold tabular-nums leading-tight">
                            {formatInt(metricVal)}
                          </div>
                          <div
                            className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                          >
                            {formatPercent(ratio)} của {formatInt(total.shbg)}
                          </div>
                          <div
                            className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                          >
                            {subLabel} {formatInt(subVal)}
                          </div>
                        </>
                      )}
                    </button>
                  </td>
                );
              })()}
            </tr>

            {/* ── DÒNG «CHUYỂN HOÀN · TỔ KHHH 531120» ─────────────────────── */}
            {hhData && (
              <tr className="bg-purple-50/20 text-xs">
                <td className="py-2.5 px-3">
                  <div className="font-bold text-gray-900">
                    Chuyển hoàn · Tổ KHHH 531120 (về Thuận Hóa)
                  </div>
                  <div className="text-[11px] text-gray-500 italic mt-0.5">
                    Không tính chỉ tiêu 14 giờ; không cộng vào dòng Cộng
                  </div>
                </td>

                {/* Cột Thuận Hóa */}
                <td className="p-1">
                  {(() => {
                    const ratio = hhData.shbg > 0 ? hhData.roLai / hhData.shbg : 0;
                    const style = getHeatmapStyle(hasNoData || hhData.shbg === 0 ? 0 : ratio);
                    const isSelected =
                      selectedCell?.loai === 'hang_hoan' && selectedCell?.ma_bcvh === '533140';

                    return (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCell({
                            nguon: null,
                            nguonTen: 'Chuyển hoàn Tổ KHHH',
                            ma_bcvh: '533140',
                            bcvhTen: 'Thuận Hóa',
                            loai: 'hang_hoan',
                            label: 'Chuyển hoàn Tổ KHHH (về Thuận Hóa)',
                          })
                        }
                        className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border border-purple-300 flex flex-col items-center justify-center transition-all cursor-pointer ${
                          style.className
                        } ${
                          isSelected
                            ? 'ring-2 ring-[#4A1D6E] ring-offset-1 font-bold shadow-sm'
                            : ''
                        }`}
                      >
                        {hasNoData || hhData.shbg === 0 ? (
                          <span className="text-gray-400 italic">—</span>
                        ) : (
                          <>
                            <div className="text-sm font-bold tabular-nums leading-tight">
                              {formatInt(hhData.roLai)}
                            </div>
                            <div
                              className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                            >
                              {formatPercent(ratio)} của {formatInt(hhData.shbg)}
                            </div>
                            <div
                              className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                            >
                              trượt {formatInt(hhData.truot)}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </td>

                {/* 5 BCVH còn lại: không có hàng hoàn Tổ KHHH */}
                {BCVH_LIST.slice(1).map((b) => (
                  <td key={b.ma} className="p-1 text-center text-gray-400 italic">
                    —
                  </td>
                ))}

                {/* Ô Cộng hàng hoàn */}
                <td className="p-1 bg-[#FAF5E8]/30">
                  {(() => {
                    const ratio = hhData.shbg > 0 ? hhData.roLai / hhData.shbg : 0;
                    const style = getHeatmapStyle(hasNoData || hhData.shbg === 0 ? 0 : ratio);
                    return (
                      <div
                        className={`w-full h-full min-h-[62px] p-2 rounded-[8px] border border-gray-300 flex flex-col items-center justify-center ${style.className}`}
                      >
                        {hasNoData || hhData.shbg === 0 ? (
                          <span className="text-gray-400 italic">—</span>
                        ) : (
                          <>
                            <div className="text-sm font-bold tabular-nums leading-tight">
                              {formatInt(hhData.roLai)}
                            </div>
                            <div
                              className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                            >
                              {formatPercent(ratio)} của {formatInt(hhData.shbg)}
                            </div>
                            <div
                              className={`text-[10px] tabular-nums mt-0.5 leading-tight ${style.subTextClass}`}
                            >
                              trượt {formatInt(hhData.truot)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── NÚT XUẤT THEO Ô TỪ HEATMAP ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs text-gray-600">
          {selectedCell ? (
            <span>
              Đang chọn ô: <strong className="text-[#4A1D6E]">{selectedCell.label}</strong>
            </span>
          ) : (
            <span>Chưa chọn ô nào (bấm ô bất kỳ trên bản đồ để lọc danh sách chi tiết hoặc xuất)</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onExportCell(selectedCell)}
          disabled={exportLoading || hasNoData}
          className={`btn-primary px-3.5 py-1.5 rounded-[8px] text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
            exportLoading || hasNoData ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>
            {exportLoading
              ? 'Đang tạo…'
              : selectedCell
              ? `Xuất xlsx · Ô đang chọn (${selectedCell.label})`
              : 'Xuất xlsx · Sheet 7'}
          </span>
        </button>
      </div>
    </div>
  );
}
