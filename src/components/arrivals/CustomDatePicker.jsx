import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export default function CustomDatePicker({ value, onChange, placeholder, minDate, maxDate }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // value is expected as a Date object or null
  const [currentMonth, setCurrentMonth] = useState(value || new Date());
  
  // Hours and minutes for select
  const [selectedHour, setSelectedHour] = useState(value ? value.getHours() : 0);
  const [selectedMinute, setSelectedMinute] = useState(value ? value.getMinutes() : 0);

  useEffect(() => {
    if (value) {
      setCurrentMonth(value);
      setSelectedHour(value.getHours());
      setSelectedMinute(value.getMinutes());
    }
  }, [value]);

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

  const pad = (n) => n.toString().padStart(2, '0');
  
  const displayString = value 
    ? `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`
    : '';

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday-start (0 = Monday, ..., 6 = Sunday)
  };

  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth());

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const handleDayClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day, selectedHour, selectedMinute, 0);
    onChange(newDate);
    setIsOpen(false);
  };

  const handleTimeChange = (type, val) => {
    const v = parseInt(val, 10);
    if (type === 'h') {
      setSelectedHour(v);
      if (value) onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), v, selectedMinute, 0));
    } else {
      setSelectedMinute(v);
      if (value) onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), selectedHour, v, 0));
    }
  };

  return (
    <div className="relative flex-1 min-w-0" ref={containerRef}>
      <div 
        className="h-[44px] px-3 border border-[#c5cfdc] rounded-lg text-[14px] flex items-center justify-between bg-white cursor-pointer"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter') setIsOpen(!isOpen); }}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {displayString || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-500" />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 p-3">
          <div className="flex items-center justify-between mb-3">
            <button 
              type="button"
              className="p-1 hover:bg-gray-100 rounded"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="font-semibold text-sm text-gray-800">
              Tháng {currentMonth.getMonth() + 1}/{currentMonth.getFullYear()}
            </div>
            <button 
              type="button"
              className="p-1 hover:bg-gray-100 rounded"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
              <div key={d} className="text-xs font-medium text-gray-500 py-1">{d}</div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={i} className="h-8"></div>;
              const isSelected = value && value.getDate() === d && value.getMonth() === currentMonth.getMonth() && value.getFullYear() === currentMonth.getFullYear();
              return (
                <button
                  key={i}
                  type="button"
                  className={`h-8 w-8 mx-auto rounded-full text-sm flex items-center justify-center transition-colors ${
                    isSelected 
                      ? 'bg-orange-500 text-white font-bold shadow-sm' 
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => handleDayClick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-100 pt-3 flex items-center justify-center gap-2">
            <select 
              className="px-2 py-1 border border-gray-200 rounded text-sm bg-white"
              value={selectedHour}
              onChange={(e) => handleTimeChange('h', e.target.value)}
            >
              {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{pad(i)}</option>)}
            </select>
            <span className="text-gray-500 font-medium">:</span>
            <select 
              className="px-2 py-1 border border-gray-200 rounded text-sm bg-white"
              value={selectedMinute}
              onChange={(e) => handleTimeChange('m', e.target.value)}
            >
              {Array.from({length: 60}).map((_, i) => <option key={i} value={i}>{pad(i)}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
