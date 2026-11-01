import React, { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { taiExcelDoiChieu } from './kttApi';

/**
 * KTT-16-5 mục 3.6: Nút tải file Excel đối chiếu BCVH (sheet 1 đến 6)
 * @param {string} route Tên route xuất (chua-thay, chuyen-mat-dau, chuyen-tiep-chua-quet-di, thay-o-bcvh-khac, chuyen-cham, da-co-tai-dich)
 * @param {string} tu Ngày bắt đầu (YYYY-MM-DD)
 * @param {string} den Ngày kết thúc (YYYY-MM-DD)
 * @param {string} maBcvh Mã BCVH (hoặc 'all' / null)
 */
export default function KttNutXuat({ route, tu, den, maBcvh }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (loading) return;
    if (!route || !tu || !den) {
      setError('Thiếu thông tin ngày để tải file.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await taiExcelDoiChieu(route, { tu, den, maBcvh });
    } catch (err) {
      setError(err?.message || 'Chưa tải được file. Thử lại sau ít phút.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-[6px] transition-colors cursor-pointer shrink-0 shadow-none hover:border-gray-400"
        title="Tải bảng tính Excel"
      >
        {loading ? (
          <>
            <RefreshCw className="w-3 h-3 animate-spin text-orange-600 shrink-0" />
            <span>Đang chuẩn bị…</span>
          </>
        ) : (
          <>
            <Download className="w-3 h-3 text-gray-500 shrink-0" />
            <span>Tải Excel</span>
          </>
        )}
      </button>

      {error && (
        <span className="text-[11px] text-red-600 font-normal">
          {error}
        </span>
      )}
    </div>
  );
}
