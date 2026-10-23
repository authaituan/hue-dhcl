import React from 'react';
import CustomDatePicker from '../common/CustomDatePicker';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive
} from './quyThoiGianFormatters';

export default function QuyThoiGianDateRangePicker({
  dateRange = { from: '', to: '' },
  onChangeDateRange,
  idPrefix = 'qtg'
}) {
  const today = getTodayVnYmd();
  const currentMonthStart = today.slice(0, 7) + '-01';
  const past7DaysStart = shiftDay(today, -6);

  // Kiểm tra nút nhanh đang kích hoạt
  const isToday = dateRange.from === today && dateRange.to === today;
  const is7Days = dateRange.from === past7DaysStart && dateRange.to === today;
  const isThisMonth = dateRange.from === currentMonthStart && dateRange.to === today;

  // Chọn nút nhanh
  const handleQuickSelect = (type) => {
    if (type === 'today') {
      onChangeDateRange({ from: today, to: today });
    } else if (type === '7days') {
      onChangeDateRange({ from: past7DaysStart, to: today });
    } else if (type === 'thisMonth') {
      onChangeDateRange({ from: currentMonthStart, to: today });
    }
  };

  const handleFromChange = (newFrom) => {
    if (!newFrom) return;
    onChangeDateRange({ from: newFrom, to: dateRange.to });
  };

  const handleToChange = (newTo) => {
    if (!newTo) return;
    onChangeDateRange({ from: dateRange.from, to: newTo });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 3 Nút chọn nhanh */}
      <div className="inline-flex items-center bg-white rounded-[10px] border border-[#D9CBA8] p-0.5 shadow-none text-xs">
        <button
          type="button"
          onClick={() => handleQuickSelect('today')}
          className={`px-2.5 py-1 rounded-[8px] font-semibold transition-colors cursor-pointer ${
            isToday
              ? 'bg-[#4A1D6E] text-white'
              : 'text-gray-700 hover:bg-cream-light'
          }`}
        >
          Hôm nay
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('7days')}
          className={`px-2.5 py-1 rounded-[8px] font-semibold transition-colors cursor-pointer ${
            is7Days
              ? 'bg-[#4A1D6E] text-white'
              : 'text-gray-700 hover:bg-cream-light'
          }`}
        >
          7 ngày
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('thisMonth')}
          className={`px-2.5 py-1 rounded-[8px] font-semibold transition-colors cursor-pointer ${
            isThisMonth
              ? 'bg-[#4A1D6E] text-white'
              : 'text-gray-700 hover:bg-cream-light'
          }`}
        >
          Tháng này
        </button>
      </div>

      {/* Cụm 2 ô Từ ngày - Đến ngày */}
      <div className="flex items-center bg-white rounded-[10px] border border-[#D9CBA8] shadow-none px-2 py-1 text-xs gap-1.5">
        <span className="font-semibold text-gray-600 whitespace-nowrap">Từ</span>
        <div className="w-24 sm:w-28">
          <CustomDatePicker
            id={`${idPrefix}-from-date`}
            value={dateRange.from}
            onChange={handleFromChange}
            borderless
            className="w-full text-center font-bold text-gray-800"
          />
        </div>
        <span className="font-semibold text-gray-600 whitespace-nowrap">— Đến</span>
        <div className="w-24 sm:w-28">
          <CustomDatePicker
            id={`${idPrefix}-to-date`}
            value={dateRange.to}
            onChange={handleToChange}
            borderless
            className="w-full text-center font-bold text-gray-800"
          />
        </div>
      </div>
    </div>
  );
}
