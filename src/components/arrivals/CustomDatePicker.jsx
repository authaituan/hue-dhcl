import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const pad = (n) => n.toString().padStart(2, '0');

// Kiểm tra ngày có thật trong tháng/năm
function isValidDate(d, m, y) {
  if (m < 1 || m > 12) return false;
  if (y < 1900 || y > 2100) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d >= 1 && d <= daysInMonth;
}

// Chuyển Date hoặc YYYY-MM-DD sang { y, m, d, ymd, dmy }
function parseDateInput(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = val.getMonth() + 1;
    const d = val.getDate();
    return {
      y, m, d,
      ymd: `${y}-${pad(m)}-${pad(d)}`,
      dmy: `${pad(d)}/${pad(m)}/${y}`
    };
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const mYmd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mYmd) {
      const y = parseInt(mYmd[1], 10);
      const m = parseInt(mYmd[2], 10);
      const d = parseInt(mYmd[3], 10);
      return {
        y, m, d,
        ymd: `${y}-${pad(m)}-${pad(d)}`,
        dmy: `${pad(d)}/${pad(m)}/${y}`
      };
    }
    const mDmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mDmy) {
      const d = parseInt(mDmy[1], 10);
      const m = parseInt(mDmy[2], 10);
      const y = parseInt(mDmy[3], 10);
      return {
        y, m, d,
        ymd: `${y}-${pad(m)}-${pad(d)}`,
        dmy: `${pad(d)}/${pad(m)}/${y}`
      };
    }
  }
  return null;
}

export default function CustomDatePicker({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  minDate,
  maxDate,
  id,
  className = '',
  borderless = false,
  required = false,
  disabled = false,
  asDate = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Xác định mode: Date object hay YYYY-MM-DD string
  const isDateMode = asDate || (value instanceof Date);

  // Giá trị text đang hiển thị trong ô nhập
  const parsedVal = parseDateInput(value);
  const [inputText, setInputText] = useState(parsedVal ? parsedVal.dmy : '');
  const [localError, setLocalError] = useState('');

  // Tháng đang mở trong lịch
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (parsedVal && isValidDate(parsedVal.d, parsedVal.m, parsedVal.y)) {
      return new Date(parsedVal.y, parsedVal.m - 1, 1);
    }
    return new Date();
  });

  // Giờ/phút nếu value là Date object
  const [selectedHour, setSelectedHour] = useState(value instanceof Date ? value.getHours() : 0);
  const [selectedMinute, setSelectedMinute] = useState(value instanceof Date ? value.getMinutes() : 0);

  // Đồng bộ khi prop `value` thay đổi từ bên ngoài
  useEffect(() => {
    const p = parseDateInput(value);
    if (p) {
      setInputText(p.dmy);
      setCurrentMonth(new Date(p.y, p.m - 1, 1));
      if (value instanceof Date) {
        setSelectedHour(value.getHours());
        setSelectedMinute(value.getMinutes());
      }
      setLocalError('');
    } else {
      setInputText('');
      setLocalError('');
    }
  }, [value]);

  // Đóng lịch khi click ra ngoài hoặc bấm Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Chuẩn hóa min/max
  const minParsed = parseDateInput(minDate);
  const maxParsed = parseDateInput(maxDate);

  // Kiểm tra ngày có nằm trong min/max không
  const checkMinMax = (y, m, d) => {
    const ymd = `${y}-${pad(m)}-${pad(d)}`;
    if (minParsed && ymd < minParsed.ymd) {
      return `Ngày không được trước ${minParsed.dmy}`;
    }
    if (maxParsed && ymd > maxParsed.ymd) {
      return `Ngày không được sau ${maxParsed.dmy}`;
    }
    return null;
  };

  // Phát giá trị ra ngoài cho parent component
  const emitValue = (y, m, d) => {
    if (isDateMode) {
      const dateObj = new Date(y, m - 1, d, selectedHour, selectedMinute, 0);
      onChange(dateObj);
    } else {
      const ymdStr = `${y}-${pad(m)}-${pad(d)}`;
      onChange(ymdStr);
    }
  };

  const emitEmpty = () => {
    if (isDateMode) {
      onChange(null);
    } else {
      onChange('');
    }
  };

  // Xử lý khi người dùng gõ tay
  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputText(raw);
    setLocalError('');

    const trimmed = raw.trim();
    if (!trimmed) {
      if (!required) emitEmpty();
      return;
    }

    // Nếu gõ đủ 10 ký tự dd/mm/yyyy -> tự validate và kích hoạt onChange
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const d = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);

      if (!isValidDate(d, m, y)) {
        setLocalError('Ngày không có thật (kiểm tra lại số ngày trong tháng)');
        return;
      }

      const mmErr = checkMinMax(y, m, d);
      if (mmErr) {
        setLocalError(mmErr);
        return;
      }

      setLocalError('');
      emitValue(y, m, d);
      setCurrentMonth(new Date(y, m - 1, 1));
    }
  };

  // Xử lý khi rời ô nhập (blur)
  const handleInputBlur = () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      if (required) {
        setLocalError('Vui lòng nhập ngày');
      } else {
        setLocalError('');
        emitEmpty();
      }
      return;
    }

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      setLocalError('Định dạng ngày phải là dd/mm/yyyy');
      return;
    }

    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);

    if (!isValidDate(d, m, y)) {
      setLocalError('Ngày không có thật (kiểm tra lại số ngày trong tháng)');
      return;
    }

    const mmErr = checkMinMax(y, m, d);
    if (mmErr) {
      setLocalError(mmErr);
      return;
    }

    // Định dạng lại cho chuẩn 2 chữ số (vd: 5/10/2026 -> 05/10/2026)
    const formatted = `${pad(d)}/${pad(m)}/${y}`;
    setInputText(formatted);
    setLocalError('');
    emitValue(y, m, d);
  };

  // Lịch: tính toán số ngày trong tháng và ngày bắt đầu (Thứ 2 = 0)
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // 0 = Thứ 2, 6 = Chủ nhật
  };

  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth());

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  // Xử lý khi click chọn ngày trong popup lịch
  const handleDayClick = (day) => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth() + 1;
    const d = day;

    const mmErr = checkMinMax(y, m, d);
    if (mmErr) return;

    const dmy = `${pad(d)}/${pad(m)}/${y}`;
    setInputText(dmy);
    setLocalError('');
    emitValue(y, m, d);
    setIsOpen(false);
  };

  // Kiểm tra một ngày trong lịch có bị disabled không
  const isDayDisabled = (day) => {
    if (!day) return false;
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth() + 1;
    return !!checkMinMax(y, m, day);
  };

  return (
    <div className={`relative ${borderless ? 'inline-block' : 'flex-1 min-w-0'}`} ref={containerRef}>
      {borderless ? (
        /* Giao diện không viền dành cho pill thanh công cụ (Màn 13) */
        <div className={`flex items-center gap-1 ${className}`}>
          <input
            id={id}
            type="text"
            placeholder={placeholder}
            value={inputText}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled}
            className={`text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none w-24 ${
              localError ? 'text-red-600' : ''
            }`}
          />
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 transition-colors"
            title="Mở lịch chọn ngày"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      ) : (
        /* Giao diện tiêu chuẩn: ô nhập có viền bo tròn, nút lịch bên phải */
        <div
          className={`flex items-center justify-between bg-white border rounded-xl transition-all shadow-2xs ${
            localError
              ? 'border-red-400 focus-within:ring-2 focus-within:ring-red-400'
              : 'border-gray-200 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500'
          } ${className}`}
        >
          <input
            id={id}
            type="text"
            placeholder={placeholder}
            value={inputText}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled}
            className="w-full text-xs font-semibold text-gray-800 bg-transparent p-2.5 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="pr-3 text-gray-400 hover:text-orange-600 cursor-pointer transition-colors"
            title="Mở lịch chọn ngày"
            tabIndex={-1}
          >
            <CalendarIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {/* Hiển thị lỗi bên dưới ô nếu có */}
      {localError && (
        <div className="text-[11px] text-red-600 font-medium mt-1">
          {localError}
        </div>
      )}

      {/* Popup lịch chọn ngày trực quan tiếng Việt (Thứ 2 - CN) */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 p-3.5 animate-in fade-in duration-100">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors cursor-pointer"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-bold text-xs text-gray-800">
              Tháng {currentMonth.getMonth() + 1}/{currentMonth.getFullYear()}
            </div>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors cursor-pointer"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
              <div key={d} className="text-[11px] font-bold text-gray-400 py-1">
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={i} className="h-7 w-7"></div>;

              const isSelected = parsedVal &&
                parsedVal.d === d &&
                parsedVal.m === (currentMonth.getMonth() + 1) &&
                parsedVal.y === currentMonth.getFullYear();

              const disabledDay = isDayDisabled(d);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => handleDayClick(d)}
                  className={`h-7 w-7 mx-auto rounded-full text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                    disabledDay
                      ? 'text-gray-300 opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-orange-600 text-white font-bold shadow-sm'
                      : 'hover:bg-orange-50 text-gray-700 hover:text-orange-600'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
