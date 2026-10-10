import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { formatDateOnly, parseFromApiDate } from './dateUtils';

export default function ArrivalsExport({ filters, exportScope, bcvhList }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const selectedCount = filters.receiver_code.length;
  const isOneBcvh = selectedCount === 1;
  const code = isOneBcvh ? filters.receiver_code[0] : null;
  const bcvhName = bcvhList.find(b => b.ma === code)?.ten || '';
  
  const isAllowed = code && exportScope.includes(code);
  
  let isRangeValid = false;
  let rangeDiff = 0;
  if (filters.from && filters.to) {
    try {
      const d1 = new Date(filters.from.slice(0, 10));
      const d2 = new Date(filters.to.slice(0, 10));
      rangeDiff = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
      isRangeValid = rangeDiff >= 0 && rangeDiff <= 92;
    } catch(e) {}
  }

  const isEnabled = isOneBcvh && isAllowed && isRangeValid;

  let disabledReason = '';
  if (!isOneBcvh) {
    disabledReason = 'Chỉ hỗ trợ tải dữ liệu của đúng 1 BCVH';
  } else if (!isAllowed) {
    disabledReason = 'BCVH này chưa được giao cho tài khoản của bạn';
  } else if (!isRangeValid) {
    disabledReason = 'Khoảng ngày quá dài (tối đa 92 ngày)';
  }

  const handleDownload = async () => {
    if (!isEnabled || loading) return;
    setLoading(true);
    setError(null);

    const dFrom = parseFromApiDate(filters.from, false);
    const dTo = parseFromApiDate(filters.to, true);
    
    const q = new URLSearchParams();
    q.set('from', formatDateOnly(dFrom));
    q.set('to', formatDateOnly(dTo));
    q.set('date_basis', filters.date_basis);
    q.set('receiver_code', code);

    try {
      const res = await apiFetch('/api/arrivals/export?' + q.toString());
      if (!res.ok) {
        let msg = 'Lỗi hệ thống khi tải file';
        try {
          const errData = await res.json();
          if (errData.error) msg = errData.error;
        } catch(e) {}
        setError(msg);
        setLoading(false);
        return;
      }

      // Lấy tên file từ header
      let filename = `HangDen_${code}_${filters.from.slice(0,10)}_${filters.to.slice(0,10)}.xlsx`;
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename="([^"]+)"/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1];
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch(err) {
      setError('Lỗi kết nối khi tải file');
    } finally {
      setLoading(false);
    }
  };

  let exportSummary = '';
  let exportNote = '';

  const selCount = filters.receiver_code.length;
  if (!code) {
    exportSummary = `Đang chọn ${selCount} BCVH. Mỗi lần chỉ tải dữ liệu của một BCVH.`;
    exportNote = 'Chọn đúng một BCVH ở mục Bưu cục nhận để tải dữ liệu.';
  } else if (!exportScope.includes(code)) {
    exportSummary = `Bạn xem được ${bcvhName} nhưng chỉ tải được BCVH được phân trong danh sách: ${exportScope.join(', ')}.`;
    exportNote = 'Chọn BCVH được phân ở mục Bưu cục nhận để tải dữ liệu.';
  } else if (!isRangeValid) {
    exportSummary = `Khoảng ngày không hợp lệ.`;
    exportNote = `Khoảng ngày tối đa 92 ngày và ngày kết thúc phải sau ngày bắt đầu. Đang chọn ${rangeDiff} ngày.`;
  } else {
    const dFrom = parseFromApiDate(filters.from, false);
    const dTo = parseFromApiDate(filters.to, true);
    const pad = n => n.toString().padStart(2, '0');
    const displayFrom = `${pad(dFrom.getDate())}/${pad(dFrom.getMonth()+1)}/${dFrom.getFullYear()}`;
    const displayTo = `${pad(dTo.getDate())}/${pad(dTo.getMonth()+1)}/${dTo.getFullYear()}`;
    
    exportSummary = `${code} · ${bcvhName} · từ ${displayFrom} đến ${displayTo} (cả ngày)`;
    exportNote = 'Tải đúng dữ liệu gốc đã thu thập, chưa lọc trùng.';
    
    const isFullDay = filters.from.endsWith('00:00') && filters.to.endsWith('23:59');
    if (!isFullDay) {
      exportNote = 'Xuất file tính theo ngày, không theo giờ. ' + exportNote;
    }
  }

  return (
    <div className="border-t border-[#e6ebf2] pt-[14px] flex flex-wrap items-center justify-between gap-3 mt-4">
      <div className="flex-[1_1_360px] min-w-0">
        <div className="text-[13px] text-[#1f2a37]">{exportSummary}</div>
        <div className="text-[12px] text-[#5b6777] mt-0.5">{exportNote}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleDownload}
          disabled={!isEnabled || loading}
          className={`h-[44px] px-[22px] border-0 rounded-lg text-[14px] font-semibold flex items-center justify-center ${
            isEnabled && !loading
              ? 'btn-primary cursor-pointer' 
              : 'bg-gray-300 text-white cursor-not-allowed'
          }`}
        >
          {loading ? (
            <span className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Đang tải...
            </span>
          ) : (
            'Tải dữ liệu để xử lý'
          )}
        </button>
        {error && <div className="text-[12px] text-red-600 mt-1 max-w-[250px] text-right font-medium">{error}</div>}
      </div>
    </div>
  );
}
