import React, { useState } from 'react';
import {
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';
import CustomDatePicker from './CustomDatePicker';
import {
  formatYmdToDmy,
  getVnTodayYmd,
  addDaysYmd,
  countDays,
  CELL_STATUS_MAP,
  buildReviewedLookup,
  formatUtcToVnDateTime
} from '../../utils/sourceIngest';

export default function SourceIngestGrid({
  gridData,
  tu,
  den,
  selectedBcvh,
  onApplyFilter,
  onSelectCell,
  loading
}) {
  const [activeChip, setActiveChip] = useState('7_DAYS'); // '7_DAYS' | 'PREV_WEEK' | 'THIS_MONTH' | 'PREV_MONTH' | 'CUSTOM'
  const [customTu, setCustomTu] = useState(tu);
  const [customDen, setCustomDen] = useState(den);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [dateError, setDateError] = useState('');
  const [onlyProblemDays, setOnlyProblemDays] = useState(false);

  const dsBcvh = Array.isArray(gridData?.ds_bcvh) ? gridData.ds_bcvh : [];
  const homNay = (gridData && typeof gridData.hom_nay === 'string') ? gridData.hom_nay : getVnTodayYmd();
  const oList = Array.isArray(gridData?.o) ? gridData.o : [];
  const ngayBatDauMap = (gridData?.ngay_bat_dau && typeof gridData.ngay_bat_dau === 'object') ? gridData.ngay_bat_dau : {};

  // Xử lý các chip thời gian nhanh
  const handleChipClick = (chipKey) => {
    setActiveChip(chipKey);
    setDateError('');

    const todayStr = homNay;
    const parts = todayStr.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    let newTu = todayStr;
    let newDen = todayStr;

    if (chipKey === '7_DAYS') {
      newDen = todayStr;
      newTu = addDaysYmd(todayStr, -6);
      setShowCustomRange(false);
      onApplyFilter(newTu, newDen, selectedBcvh);
    } else if (chipKey === 'PREV_WEEK') {
      // Thứ 2 tuần trước đến Chủ nhật tuần trước
      const dayOfWeek = d.getUTCDay(); // 0 is Sunday, 1 is Monday
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = addDaysYmd(todayStr, -daysSinceMonday);
      const prevMonday = addDaysYmd(thisMonday, -7);
      const prevSunday = addDaysYmd(prevMonday, 6);
      newTu = prevMonday;
      newDen = prevSunday;
      setShowCustomRange(false);
      onApplyFilter(newTu, newDen, selectedBcvh);
    } else if (chipKey === 'THIS_MONTH') {
      const pad = (n) => String(n).padStart(2, '0');
      newTu = `${parts[0]}-${pad(parts[1])}-01`;
      newDen = todayStr;
      setShowCustomRange(false);
      onApplyFilter(newTu, newDen, selectedBcvh);
    } else if (chipKey === 'PREV_MONTH') {
      const prevMonthDate = new Date(Date.UTC(parts[0], parts[1] - 2, 1));
      const pYear = prevMonthDate.getUTCFullYear();
      const pMonth = prevMonthDate.getUTCMonth() + 1;
      const pad = (n) => String(n).padStart(2, '0');
      newTu = `${pYear}-${pad(pMonth)}-01`;
      // Ngày cuối cùng của tháng trước
      const lastDayOfPrevMonth = new Date(Date.UTC(parts[0], parts[1] - 1, 0)).getUTCDate();
      newDen = `${pYear}-${pad(pMonth)}-${pad(lastDayOfPrevMonth)}`;
      setShowCustomRange(false);
      onApplyFilter(newTu, newDen, selectedBcvh);
    } else if (chipKey === 'CUSTOM') {
      setShowCustomRange(true);
    }
  };

  // Áp dụng khoảng ngày tùy chọn
  const handleApplyCustomRange = () => {
    setDateError('');
    if (!customTu || !customDen) {
      setDateError('Vui lòng chọn đủ từ ngày và đến ngày.');
      return;
    }
    if (customTu > customDen) {
      setDateError('Từ ngày phải nhỏ hơn hoặc bằng đến ngày.');
      return;
    }
    const days = countDays(customTu, customDen);
    if (days > 62) {
      setDateError(`Khoảng ngày tối đa là 62 ngày (đang chọn ${days} ngày).`);
      return;
    }
    onApplyFilter(customTu, customDen, selectedBcvh);
  };

  // Tra cứu ô theo (bcvh, ngay, dot)
  const cellLookup = {};
  for (const o of oList) {
    if (o && typeof o === 'object') {
      const key = `${o.bcvh}_${o.ngay}_${o.dot}`;
      cellLookup[key] = o;
    }
  }

  // Tra cứu các mục đã xem xét
  const reviewedLookup = buildReviewedLookup(gridData?.da_xem_xet);

  // Danh sách các ngày trong khoảng (sắp xếp mới nhất ở trên)
  const dayList = [];
  if (tu && den && tu <= den) {
    let cur = den;
    while (cur >= tu) {
      dayList.push(cur);
      cur = addDaysYmd(cur, -1);
    }
  }

  // Lọc theo cột BCVH nếu có chọn 1 BCVH cụ thể
  const visibleBcvhList = selectedBcvh
    ? dsBcvh.filter((b) => b && b.ma === selectedBcvh)
    : dsBcvh;

  // Lọc chỉ hiện ngày có vấn đề
  const filteredDays = dayList.filter((day) => {
    if (!onlyProblemDays) return true;
    for (const b of visibleBcvhList) {
      if (!b) continue;
      const oS = cellLookup[`${b.ma}_${day}_S`];
      const oC = cellLookup[`${b.ma}_${day}_C`];
      const checkO = (o) => {
        if (!o) return false;
        if (['LOI', 'RONG', 'CHO_FILE', 'NGUON_CO_FILE_CHUA_NAP', 'NGUON_CHUA_CO_FILE'].includes(o.trang_thai)) {
          return true;
        }
        if (o.nghi_ngo === 'IT' || o.nghi_ngo === 'NHIEU') {
          return true;
        }
        return false;
      };
      if (checkO(oS) || checkO(oC)) return true;
    }
    return false;
  });

  return (
    <div className="card-soft rounded-2xl border border-gray-200 overflow-hidden shadow-2xs space-y-4 p-5">
      {/* THANH ĐIỀU KHIỂN & CHIP LỌC TRÊN LƯỚI */}
      <div className="space-y-3 pb-3 border-b border-gray-100">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          {/* CÁC CHIP THỜI GIAN NHANH */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: '7_DAYS', label: '7 ngày gần nhất' },
              { id: 'PREV_WEEK', label: 'Tuần trước' },
              { id: 'THIS_MONTH', label: 'Tháng này' },
              { id: 'PREV_MONTH', label: 'Tháng trước' },
              { id: 'CUSTOM', label: 'Tùy chọn…' }
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleChipClick(chip.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeChip === chip.id
                    ? 'bg-orange-500 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* LỌC BCVH & TOGGLE CHỈ NGÀY CÓ VẤN ĐỀ */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Lọc BCVH */}
            <div className="relative">
              <select
                value={selectedBcvh}
                onChange={(e) => onApplyFilter(tu, den, e.target.value)}
                className="appearance-none bg-white border border-gray-300 text-gray-800 text-xs font-medium rounded-xl pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-2xs"
                aria-label="Chọn bưu cục để xem"
              >
                <option value="">Tất cả 6 BCVH</option>
                {dsBcvh.map((b) => (
                  <option key={b.ma} value={b.ma}>
                    {typeof b.ten === 'string' ? b.ten : `BCVH ${b.ma}`} ({b.ma})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-2 pointer-events-none" />
            </div>

            {/* Toggle chỉ ngày có vấn đề */}
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyProblemDays}
                onChange={(e) => setOnlyProblemDays(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
              />
              <span>Chỉ hiện ngày có vấn đề</span>
            </label>
          </div>
        </div>

        {/* BỘ CHỌN KHOẢNG NGÀY TÙY CHỌN (KHI CHỌN CHIP CUSTOM) */}
        {showCustomRange && (
          <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-200 flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-150">
            <span className="font-semibold text-gray-700">Khoảng ngày:</span>
            <div className="flex items-center gap-2">
              <CustomDatePicker
                value={customTu}
                onChange={setCustomTu}
                maxDate={homNay}
                ariaLabel="Từ ngày"
              />
              <span className="text-gray-400">→</span>
              <CustomDatePicker
                value={customDen}
                onChange={setCustomDen}
                maxDate={homNay}
                ariaLabel="Đến ngày"
              />
            </div>
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="px-4 py-1.5 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700 transition-colors cursor-pointer shadow-2xs"
            >
              Áp dụng
            </button>
            <span className="text-gray-400 text-[11px]">(tối đa 62 ngày)</span>
            {dateError && (
              <span className="text-red-600 font-semibold text-xs ml-2">
                {dateError}
              </span>
            )}
          </div>
        )}
      </div>

      {/* TIÊU ĐỀ LƯỚI & THÔNG TIN KHOẢNG NGÀY ĐANG XEM */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange-600" />
          <h3 className="font-bold text-gray-800 uppercase tracking-wide text-xs">
            F. Lưới dữ liệu theo ngày ({formatYmdToDmy(tu)} – {formatYmdToDmy(den)} · {countDays(tu, den)} ngày)
          </h3>
        </div>
        <div className="text-[11px] text-gray-400">
          {loading ? 'Đang cập nhật lưới…' : `Hiển thị ${filteredDays.length} dòng`}
        </div>
      </div>

      {/* BẢNG LƯỚI F */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-cream-head text-gray-600 border-b border-cream-line text-[12px]">
              <th className="py-2.5 px-3 font-bold w-28 uppercase tracking-wider">
                Ngày
              </th>
              {visibleBcvhList.map((b) => {
                if (!b) return null;
                const tenClean = typeof b.ten === 'string' ? b.ten.replace('BCVH ', '') : (b.ma || '');
                return (
                  <th key={b.ma} className="py-2.5 px-2 text-center font-bold">
                    <div>{tenClean}</div>
                    <div className="text-[10px] text-gray-400 tabular-nums font-normal">
                      {b.ma}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-line tabular-nums">
            {filteredDays.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleBcvhList.length + 1}
                  className="py-12 text-center text-xs text-gray-500"
                >
                  {onlyProblemDays
                    ? 'Không có ngày nào có vấn đề trong khoảng đã chọn.'
                    : 'Không có dữ liệu trong khoảng ngày đã chọn.'}
                </td>
              </tr>
            ) : (
              filteredDays.map((day) => {
                const isToday = day === homNay;

                return (
                  <tr
                    key={day}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isToday ? 'bg-orange-50/40 font-semibold' : ''
                    }`}
                  >
                    {/* CỘT NGÀY */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs text-gray-900 flex items-center gap-1.5">
                      <span>{formatYmdToDmy(day)}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-orange-500 text-white">
                          HÔM NAY
                        </span>
                      )}
                    </td>

                    {/* CÁC CỘT BCVH: CẶP S / C */}
                    {visibleBcvhList.map((b) => {
                      if (!b) return null;
                      const oS = cellLookup[`${b.ma}_${day}_S`];
                      const oC = cellLookup[`${b.ma}_${day}_C`];
                      const ngayBatDau = ngayBatDauMap[b.ma];
                      const isNghiNgo = (oS?.nghi_ngo === 'IT' || oS?.nghi_ngo === 'NHIEU' || oC?.nghi_ngo === 'IT' || oC?.nghi_ngo === 'NHIEU');
                      const reviewedItemS = reviewedLookup[`DOT|${b.ma}|${day}|S`];
                      const reviewedItemC = reviewedLookup[`DOT|${b.ma}|${day}|C`];
                      const reviewedNgayItem = reviewedLookup[`NGAY|${b.ma}|${day}|`];

                      return (
                        <td key={b.ma} className="py-2 px-1 text-center align-middle">
                          <div className="relative inline-flex items-center justify-center gap-1 bg-gray-50/50 p-1 rounded-xl border border-gray-100">
                            {/* DẤU CHẤM CAM GÓC CẶP S/C KHI CÓ NGHI NGỜ (ĐỔI THÀNH CHẤM RỖNG NẾU ĐÃ XEM XÉT) */}
                            {isNghiNgo && (
                              reviewedNgayItem ? (
                                <span
                                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-orange-500 bg-white ring-2 ring-white"
                                  title={`Đã xem xét bởi ${reviewedNgayItem.nguoi?.ten || reviewedNgayItem.nguoi?.ma || '—'} lúc ${formatUtcToVnDateTime(reviewedNgayItem.luc)}`}
                                />
                              ) : (
                                <span
                                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white"
                                  title="Có cảnh báo nghi ngờ số lượng dòng ít/nhiều"
                                />
                              )
                            )}

                            {/* Ô SÁNG */}
                            <CellButton
                              cell={oS}
                              dot="S"
                              bcvh={b.ma}
                              ngay={day}
                              ngayBatDau={ngayBatDau}
                              reviewedItem={reviewedItemS}
                              onClick={() => onSelectCell({ bcvh: b.ma, ngay: day, dot: 'S' })}
                            />

                            {/* Ô CHIỀU */}
                            <CellButton
                              cell={oC}
                              dot="C"
                              bcvh={b.ma}
                              ngay={day}
                              ngayBatDau={ngayBatDau}
                              reviewedItem={reviewedItemC}
                              onClick={() => onSelectCell({ bcvh: b.ma, ngay: day, dot: 'C' })}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CHÚ GIẢI MÀU Ở CHÂN LƯỚI */}
      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-gray-700">Chú giải:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-400" />
            <span>Đã nạp</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-400" />
            <span>Nhập tay</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
            <span>Chờ file</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-400" />
            <span>Lỗi</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-100 border border-purple-400" />
            <span>Rỗng</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-white border border-dashed border-orange-500" />
            <span>Chưa nạp</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="relative w-3.5 h-3.5 rounded bg-white border border-stone-300 flex items-center justify-center text-[8px] font-bold text-gray-500">
              ✓
            </span>
            <span>Đã xem xét: viền xám, dấu ✓</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
            <span>Không file</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span>Nghi ngờ (ít/nhiều)</span>
          </span>
        </div>

        <div className="text-gray-400 italic">
          Bấm một ô S (Sáng) hoặc C (Chiều) để xem chi tiết
        </div>
      </div>
    </div>
  );
}

// Component con hiển thị 1 nhãn S hoặc C
function CellButton({ cell, dot, bcvh, ngay, ngayBatDau, reviewedItem, onClick }) {
  const trangThai = (cell && typeof cell.trang_thai === 'string') ? cell.trang_thai : '';
  const cfg = (trangThai && CELL_STATUS_MAP[trangThai]) || {
    label: dot,
    cellClass: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
  };

  // Trạng thái CHUA_BAT_DAU: để trống, tooltip ngày bắt đầu
  if (trangThai === 'CHUA_BAT_DAU') {
    return (
      <span
        className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] text-gray-300 tabular-nums cursor-default"
        title={ngayBatDau ? `Trước ngày BCVH này bắt đầu có dữ liệu (${formatYmdToDmy(ngayBatDau)})` : 'Chưa bắt đầu'}
      >
        &nbsp;
      </span>
    );
  }

  // Trạng thái CHUA_DEN_GIO: chỉ hiện «—»
  if (trangThai === 'CHUA_DEN_GIO') {
    return (
      <span
        className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] text-gray-400 tabular-nums cursor-default"
        title="Chưa đến giờ mong đợi"
      >
        —
      </span>
    );
  }

  const isReviewed = Boolean(reviewedItem);
  let cellClass = `relative w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer border ${cfg.cellClass}`;
  let title = `${dot === 'S' ? 'Sáng' : 'Chiều'} · ${cfg.label || trangThai}`;

  if (isReviewed) {
    const reviewerName = reviewedItem?.nguoi
      ? (typeof reviewedItem.nguoi.ten === 'string' && reviewedItem.nguoi.ten
          ? reviewedItem.nguoi.ten
          : (typeof reviewedItem.nguoi.ma === 'string' ? reviewedItem.nguoi.ma : '—'))
      : '—';
    const reviewedTimeVn = typeof reviewedItem?.luc === 'string' ? formatUtcToVnDateTime(reviewedItem.luc) : '—';
    title = `Đã xem xét bởi ${reviewerName} lúc ${reviewedTimeVn}`;

    // Đổi kiểu viền: viền LIỀN màu xám (stone-300), không viền đứt
    cellClass = cellClass
      .replace(/border-dashed/g, 'border-solid')
      .replace(/border-[a-z]+-[0-9]+/g, 'border-stone-300');
    if (!cellClass.includes('border-stone-300')) {
      cellClass += ' border-stone-300 border-solid';
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cellClass}
      title={title}
    >
      <span>{dot}</span>
      {isReviewed && (
        <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-gray-500 leading-none pointer-events-none">
          ✓
        </span>
      )}
    </button>
  );
}
