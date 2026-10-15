import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { formatYmdToDmy, markReviewedApi, unmarkReviewedApi } from '../../utils/sourceIngest';

/**
 * Hộp thoại đánh dấu một mục là «Đã xem xét» (chỉ ADMIN)
 */
export function MarkReviewDialog({
  isOpen,
  item,
  bcvhList = [],
  onClose,
  onRefresh,
  onNotify
}) {
  const [ghiChu, setGhiChu] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [is409Error, setIs409Error] = useState(false);
  const [generalError, setGeneralError] = useState(null);

  if (!isOpen || !item) return null;

  const safeBcvhList = Array.isArray(bcvhList) ? bcvhList : [];
  const foundBcvh = safeBcvhList.find((b) => b && b.ma === item.bcvh);
  const bcvhName = foundBcvh
    ? (typeof foundBcvh.ten === 'string' ? foundBcvh.ten : `BCVH ${item.bcvh}`)
    : `BCVH ${item.bcvh}`;

  const ngayDisplay = typeof item.ngay === 'string' ? formatYmdToDmy(item.ngay) : '—';
  const dotDisplay = item.loai === 'NGAY' ? 'Cả ngày' : (item.dot === 'S' ? 'Sáng' : item.dot === 'C' ? 'Chiều' : '—');

  // Nhãn trạng thái hiển thị theo bảng màu của 5f-3
  const renderStatusBadge = () => {
    if (item.loai === 'NGAY') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          {item.nghi_ngo === 'NHIEU' ? 'Nghi ngờ nhiều' : 'Nghi ngờ ít'}
        </span>
      );
    }
    switch (item.trang_thai) {
      case 'LOI':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            Lỗi khi nạp
          </span>
        );
      case 'RONG':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            File rỗng
          </span>
        );
      case 'NGUON_CO_FILE_CHUA_NAP':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-orange-600 border border-dashed border-orange-400">
            Nguồn có file, chưa nạp
          </span>
        );
      case 'CHO_FILE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Chờ file
          </span>
        );
      case 'NGUON_CHUA_CO_FILE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
            Nguồn chưa có file
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            {typeof item.trang_thai === 'string' ? item.trang_thai : '—'}
          </span>
        );
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setIs409Error(false);
    setGeneralError(null);

    try {
      const res = await markReviewedApi({
        loai: item.loai,
        bcvh: item.bcvh,
        ngay: item.ngay,
        dot: item.dot,
        ghi_chu: ghiChu
      });

      if (res.ok) {
        onClose();
        if (onRefresh) onRefresh();
        if (onNotify) onNotify('Đã đánh dấu đã xem xét.');
      } else {
        if (res.status === 409) {
          setIs409Error(true);
        } else {
          setGeneralError('Không lưu được. Thử lại sau.');
        }
      }
    } catch (e) {
      setGeneralError('Không lưu được. Thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshAndClose = () => {
    if (onRefresh) onRefresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4 text-left">
        {/* Nút đóng */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer disabled:opacity-50"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề */}
        <div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight">
            Đánh dấu đã xem xét?
          </h3>
        </div>

        {/* Khối tóm tắt */}
        <div className="p-4 bg-gray-50/90 rounded-xl border border-gray-100 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Ngày</span>
            <span className="font-bold text-gray-900">{ngayDisplay}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">BCVH</span>
            <span className="font-bold text-gray-900">{bcvhName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Đợt</span>
            <span className="font-bold text-gray-900">{dotDisplay}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Tình trạng</span>
            <div>{renderStatusBadge()}</div>
          </div>
        </div>

        {/* Đoạn giải thích */}
        <p className="text-xs text-gray-600 leading-relaxed">
          Mục này sẽ ẩn khỏi danh sách «Cần xử lý» và khỏi số đếm trên thanh cảnh báo. Dữ liệu không thay đổi. Dấu sẽ tự mất nếu file trên máy chủ nguồn, tình trạng ô hoặc số dòng của ngày thay đổi.
        </p>

        {/* Ô ghi chú */}
        <div className="space-y-1.5">
          <label htmlFor="ghi-chu-input" className="block text-xs font-semibold text-gray-700">
            Ghi chú (không bắt buộc)
          </label>
          <textarea
            id="ghi-chu-input"
            rows={3}
            maxLength={200}
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            disabled={isSubmitting}
            className="w-full text-xs text-gray-900 border border-gray-300 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-gray-50"
            placeholder=""
          />
          <div className="text-[11px] text-gray-400 text-right">
            {ghiChu.length}/200 ký tự
          </div>
        </div>

        {/* Thông báo lỗi 409 */}
        {is409Error && (
          <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl text-xs text-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150">
            <span>Mục này không còn cần xử lý. Hãy làm mới danh sách.</span>
            <button
              type="button"
              onClick={handleRefreshAndClose}
              className="px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
            >
              Làm mới danh sách
            </button>
          </div>
        )}

        {/* Lỗi chung khác */}
        {generalError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Các nút bấm */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-bold text-white bg-neutral-800 hover:bg-neutral-900 rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? 'Đang lưu…' : 'Đánh dấu'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hộp thoại xác nhận bỏ đánh dấu «Đã xem xét» (chỉ ADMIN)
 */
export function UnmarkReviewDialog({
  isOpen,
  item,
  bcvhList = [],
  onClose,
  onRefresh,
  onNotify
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState(null);

  if (!isOpen || !item) return null;

  const safeBcvhList = Array.isArray(bcvhList) ? bcvhList : [];
  const foundBcvh = safeBcvhList.find((b) => b && b.ma === item.bcvh);
  const bcvhName = foundBcvh
    ? (typeof foundBcvh.ten === 'string' ? foundBcvh.ten : `BCVH ${item.bcvh}`)
    : `BCVH ${item.bcvh}`;

  const ngayDisplay = typeof item.ngay === 'string' ? formatYmdToDmy(item.ngay) : '—';
  const dotDisplay = item.loai === 'NGAY' ? 'Cả ngày' : (item.dot === 'S' ? 'Sáng' : item.dot === 'C' ? 'Chiều' : '—');

  const handleUnmark = async () => {
    setIsSubmitting(true);
    setGeneralError(null);

    try {
      const res = await unmarkReviewedApi(item.id);
      if (res.ok) {
        onClose();
        if (onRefresh) onRefresh();
        if (onNotify) onNotify('Đã bỏ đánh dấu đã xem xét.');
      } else {
        if (res.status === 404) {
          onClose();
          if (onRefresh) onRefresh();
          if (onNotify) onNotify('Mục đã được bỏ đánh dấu trước đó.');
        } else {
          setGeneralError('Không lưu được. Thử lại sau.');
        }
      }
    } catch (e) {
      setGeneralError('Không lưu được. Thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4 text-left">
        {/* Nút đóng */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer disabled:opacity-50"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề */}
        <div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight">
            Bỏ đánh dấu đã xem xét?
          </h3>
        </div>

        {/* Nội dung xác nhận */}
        <p className="text-xs text-gray-700 leading-relaxed">
          Mục {ngayDisplay} · {bcvhName} · {dotDisplay} sẽ quay lại danh sách «Cần xử lý» và được tính lại vào số đếm trên thanh cảnh báo.
        </p>

        {/* Lỗi nếu có */}
        {generalError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Các nút bấm */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleUnmark}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-bold text-white bg-neutral-800 hover:bg-neutral-900 rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? 'Đang lưu…' : 'Bỏ đánh dấu'}
          </button>
        </div>
      </div>
    </div>
  );
}
