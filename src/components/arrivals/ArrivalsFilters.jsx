import React, { useState, useEffect, useRef } from 'react';
import { Filter, Calendar } from 'lucide-react';
import ArrivalsExport from './ArrivalsExport';
import CustomDatePicker from './CustomDatePicker';
import { formatToApiDate, parseFromApiDate } from './dateUtils';

export default function ArrivalsFilters({ filters, onApply, meta, bcvhList, loading, exportScope }) {
  const [local, setLocal] = useState(filters);

  // Sync when external filters change
  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const toggleBcvh = (ma) => {
    setLocal(prev => {
      const isSelected = prev.receiver_code.includes(ma);
      if (isSelected) {
        return { ...prev, receiver_code: prev.receiver_code.filter(c => c !== ma) };
      } else {
        return { ...prev, receiver_code: [...prev.receiver_code, ma] };
      }
    });
  };

  const toggleAllBcvh = () => {
    setLocal(prev => {
      if (prev.receiver_code.length === bcvhList.length) {
        return { ...prev, receiver_code: [] };
      }
      return { ...prev, receiver_code: bcvhList.map(b => b.ma) };
    });
  };

  const handleApply = () => {
    if (local.receiver_code.length === 0) {
      alert("Vui lòng chọn ít nhất 1 BCVH");
      return;
    }
    // format datetime properly if needed.
    onApply(local);
  };



  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    setLocal(filters);
    setFromDate(parseFromApiDate(filters.from, false));
    setToDate(parseFromApiDate(filters.to, true));
    setDateError('');
  }, [filters]);

  const handleApplyClick = () => {
    if (local.receiver_code.length === 0) {
      alert("Vui lòng chọn ít nhất 1 BCVH");
      return;
    }
    if (!fromDate || !toDate) {
      setDateError('Vui lòng nhập ngày giờ đầy đủ');
      return;
    }
    if (fromDate > toDate) {
      setDateError('Thời gian "Từ" phải nhỏ hơn hoặc bằng "Đến"');
      return;
    }
    setDateError('');
    onApply({
      ...local,
      from: formatToApiDate(fromDate),
      to: formatToApiDate(toDate)
    });
  };

  return (
    <div className="card-soft p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        {/* Dates */}
        <div className="flex-[2_1_340px] flex flex-col gap-1">
          <label className="text-[12px] font-semibold text-gray-600">Từ ngày, đến ngày</label>
          <div className="flex items-center gap-2">
            <CustomDatePicker 
              value={fromDate} 
              onChange={setFromDate} 
              placeholder="dd/MM/yyyy"
            />
            <span className="text-gray-600">đến</span>
            <CustomDatePicker 
              value={toDate} 
              onChange={setToDate} 
              placeholder="dd/MM/yyyy"
            />
          </div>
          {dateError && <span className="text-red-500 text-[12px] mt-1">{dateError}</span>}
        </div>



        {/* Ward */}
        <div className="flex-[1_1_200px] flex flex-col gap-1">
          <label className="text-[12px] font-semibold text-gray-600">Địa bàn phát (phường/xã)</label>
          <select
            className="h-[44px] px-2.5 border border-input-border rounded-lg bg-white text-[14px]"
            value={local.ward_key}
            onChange={e => setLocal({ ...local, ward_key: e.target.value })}
          >
            <option value="">Tất cả phường/xã</option>
            {meta?.wards?.filter(w => w.tinh_nha).map(w => (
              <option key={w.ward_key} value={w.ward_key}>{w.ward_name || w.ward_key}</option>
            ))}
          </select>
        </div>

        {/* Apply Button */}
        <button
          type="button"
          onClick={handleApplyClick}
          disabled={loading}
          className="btn-primary h-[44px] px-[22px] border-0 rounded-lg text-[14px] font-semibold cursor-pointer flex items-center justify-center"
        >
          Áp dụng
        </button>
      </div>

      {/* BCVH selection */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="text-[12px] font-semibold text-gray-600">
          Bưu cục nhận <span className="font-normal">· {bcvhList.length === 1 ? 'xem được cả 6, chỉ tải BCVH được phân' : 'chọn một hoặc nhiều BCVH'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleAllBcvh}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              local.receiver_code.length === bcvhList.length 
                ? 'bg-orange-500 text-white border-orange-500 shadow-sm' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Tất cả (6 BCVH)
          </button>
          {bcvhList.map(b => {
            const isSelected = local.receiver_code.includes(b.ma);
            return (
              <button
                key={b.ma}
                onClick={() => toggleBcvh(b.ma)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  isSelected 
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {b.ma} · {b.ten}
              </button>
            );
          })}
        </div>
      </div>

      <ArrivalsExport 
        filters={local} 
        exportScope={exportScope}
        bcvhList={bcvhList}
      />
    </div>
  );
}
