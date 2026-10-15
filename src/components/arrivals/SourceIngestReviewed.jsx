import React, { useState } from 'react';
import {
  formatYmdToDmy,
  formatUtcToVnDateTime,
  formatNumber
} from '../../utils/sourceIngest';
import { UnmarkReviewDialog } from './SourceIngestReviewDialog';

export default function SourceIngestReviewed({
  items = [],
  bcvhList = [],
  showReviewed,
  onToggleShowReviewed,
  onRefresh,
  onNotify
}) {
  const [unmarkingItem, setUnmarkingItem] = useState(null);

  if (!showReviewed) return null;

  const safeItems = Array.isArray(items) ? items : [];
  const safeBcvhList = Array.isArray(bcvhList) ? bcvhList : [];

  // Sắp xếp theo `luc` mới nhất trước
  const sortedItems = [...safeItems].sort((a, b) => {
    const lucA = (a && typeof a.luc === 'string') ? a.luc : '';
    const lucB = (b && typeof b.luc === 'string') ? b.luc : '';
    return lucB.localeCompare(lucA);
  });

  const getBcvhName = (code) => {
    if (!code) return '—';
    const found = safeBcvhList.find((b) => b && b.ma === code);
    return found ? (typeof found.ten === 'string' ? found.ten : `BCVH ${code}`) : `BCVH ${code}`;
  };

  const renderStatusBadge = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.loai === 'NGAY') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          {item.nghi_ngo === 'NHIEU' ? 'Nghi ngờ nhiều' : 'Nghi ngờ ít'}
        </span>
      );
    }
    switch (item.trang_thai) {
      case 'LOI':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
            Lỗi khi nạp
          </span>
        );
      case 'RONG':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            File rỗng
          </span>
        );
      case 'NGUON_CO_FILE_CHUA_NAP':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white text-orange-600 border border-dashed border-orange-400">
            Nguồn có file, chưa nạp
          </span>
        );
      case 'CHO_FILE':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Chờ file
          </span>
        );
      case 'NGUON_CHUA_CO_FILE':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
            Nguồn chưa có file
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            {typeof item.trang_thai === 'string' ? item.trang_thai : '—'}
          </span>
        );
    }
  };

  return (
    <div className="card-soft rounded-2xl border border-gray-200 overflow-hidden shadow-2xs space-y-0 mt-4">
      {/* HEADER CỦA THẺ ĐÃ XEM XÉT */}
      <div className="p-4 sm:p-5 bg-white border-b border-gray-200 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">
          Đã xem xét ({formatNumber(sortedItems.length)})
        </h3>
      </div>

      {/* DANH SÁCH BẢNG HOẶC THÔNG BÁO RỖNG */}
      {sortedItems.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-500">
          Chưa có mục nào được đánh dấu đã xem xét.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/90 text-gray-500 font-semibold border-b border-gray-200 uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3">Ngày</th>
                <th className="py-3 px-3">BCVH</th>
                <th className="py-3 px-3">Đợt</th>
                <th className="py-3 px-3">Tình trạng lúc xem xét</th>
                <th className="py-3 px-3">Người, lúc</th>
                <th className="py-3 px-4">Ghi chú</th>
                <th className="py-3 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedItems.map((item, idx) => {
                if (!item || typeof item !== 'object') return null;

                const reviewerName = item.nguoi
                  ? (typeof item.nguoi.ten === 'string' && item.nguoi.ten
                      ? item.nguoi.ten
                      : (typeof item.nguoi.ma === 'string' ? item.nguoi.ma : '—'))
                  : '—';

                const timeVn = typeof item.luc === 'string' ? formatUtcToVnDateTime(item.luc) : '—';
                const hasGhiChu = typeof item.ghi_chu === 'string' && item.ghi_chu.trim().length > 0;

                return (
                  <tr key={item.id || idx} className="hover:bg-gray-50/80 transition-colors">
                    {/* NGÀY */}
                    <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                      {typeof item.ngay === 'string' ? formatYmdToDmy(item.ngay) : '—'}
                    </td>

                    {/* BCVH */}
                    <td className="py-2.5 px-3 font-semibold text-gray-800 whitespace-nowrap">
                      {getBcvhName(item.bcvh)}
                    </td>

                    {/* ĐỢT */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">
                      {item.loai === 'NGAY' ? (
                        <span className="font-semibold text-gray-900">Cả ngày</span>
                      ) : item.dot === 'S' ? (
                        'Sáng'
                      ) : item.dot === 'C' ? (
                        'Chiều'
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* TÌNH TRẠNG LÚC XEM XÉT */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {renderStatusBadge(item)}
                    </td>

                    {/* NGƯỜI, LÚC */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs">
                      <div className="font-semibold text-gray-900">{reviewerName}</div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">{timeVn}</div>
                    </td>

                    {/* GHI CHÚ */}
                    <td className="py-2.5 px-4 text-gray-700 leading-snug max-w-xs break-words">
                      {hasGhiChu ? (
                        <span>{item.ghi_chu}</span>
                      ) : (
                        <span className="text-gray-400 italic">Không có ghi chú</span>
                      )}
                    </td>

                    {/* THAO TÁC */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setUnmarkingItem(item)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
                      >
                        Bỏ đánh dấu
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL XÁC NHẬN BỎ ĐÁNH DẤU */}
      <UnmarkReviewDialog
        isOpen={Boolean(unmarkingItem)}
        item={unmarkingItem}
        bcvhList={safeBcvhList}
        onClose={() => setUnmarkingItem(null)}
        onRefresh={onRefresh}
        onNotify={onNotify}
      />
    </div>
  );
}
