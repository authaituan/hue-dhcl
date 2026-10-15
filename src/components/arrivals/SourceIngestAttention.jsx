import React, { useState } from 'react';
import {
  AlertCircle,
  RefreshCw,
  ArrowRight,
  CheckSquare,
  Square,
  AlertTriangle,
  X
} from 'lucide-react';
import {
  formatYmdToDmy,
  REASON_MAP,
  formatNumber
} from '../../utils/sourceIngest';

export default function SourceIngestAttention({
  items = [],
  bcvhList = [],
  onTriggerLayLai,
  onNavigateReplaceDay,
  isExecuting
}) {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [showLimit, setShowLimit] = useState(50);
  const [showManualDataConfirm, setShowManualDataConfirm] = useState(false);
  const [pendingItemsToSubmit, setPendingItemsToSubmit] = useState([]);

  const safeBcvhList = Array.isArray(bcvhList) ? bcvhList : [];
  const safeItems = Array.isArray(items) ? items : [];

  // Hàm lấy tên BCVH
  const getBcvhName = (code) => {
    if (!code) return '—';
    const found = safeBcvhList.find((b) => b && b.ma === code);
    return found ? (typeof found.ten === 'string' ? found.ten : `BCVH ${code}`) : `BCVH ${code}`;
  };

  // Sắp xếp mới nhất trước
  const sortedItems = [...safeItems].sort((a, b) => {
    const ngayA = (a && typeof a.ngay === 'string') ? a.ngay : '';
    const ngayB = (b && typeof b.ngay === 'string') ? b.ngay : '';
    return ngayB.localeCompare(ngayA);
  });

  // Đếm thống kê theo loại
  const totalCount = sortedItems.length;
  const thieuCount = sortedItems.filter(
    (i) => i && (i.trang_thai === 'CHO_FILE' || i.trang_thai === 'NGUON_CHUA_CO_FILE' || i.trang_thai === 'NGUON_CO_FILE_CHUA_NAP')
  ).length;
  const rongCount = sortedItems.filter((i) => i && i.trang_thai === 'RONG').length;
  const loiCount = sortedItems.filter((i) => i && i.trang_thai === 'LOI').length;
  const nghiNgoCount = sortedItems.filter((i) => i && i.loai === 'NGAY').length;

  // Lọc các item có thể chọn để «Lấy lại» (chỉ loại DOT và không phải NGUON_CHUA_CO_FILE)
  const isSelectable = (item) => {
    if (!item || typeof item !== 'object') return false;
    return (
      item.loai === 'DOT' &&
      item.trang_thai !== 'NGUON_CHUA_CO_FILE' &&
      ['LOI', 'RONG', 'NGUON_CO_FILE_CHUA_NAP', 'CHO_FILE'].includes(item.trang_thai)
    );
  };

  const getItemKey = (item) => `${item?.bcvh}_${item?.ngay}_${item?.dot || 'ALL'}_${item?.loai}`;

  const selectableItems = sortedItems.filter(isSelectable);

  // Chọn hoặc bỏ chọn một hàng
  const handleToggleRow = (item) => {
    const key = getItemKey(item);
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Chọn tất cả các hàng có thể chọn (tối đa 20)
  const handleSelectAll = () => {
    if (selectedKeys.length === selectableItems.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(selectableItems.slice(0, 20).map(getItemKey));
    }
  };

  // Xác nhận lấy lại các đợt đã chọn
  const handleConfirmBatchLayLai = () => {
    const targetItems = selectableItems.filter((i) => selectedKeys.includes(getItemKey(i)));
    if (targetItems.length === 0) return;

    // Kiểm tra xem có đợt nào có dữ liệu nhập tay có sẵn không
    const hasManualData = targetItems.some((i) => i.ly_do === 'NHAP_TAY_CO_SAN');
    if (hasManualData) {
      setPendingItemsToSubmit(targetItems);
      setShowManualDataConfirm(true);
      return;
    }

    submitLayLai(targetItems);
  };

  const submitLayLai = (itemsToSubmit) => {
    const payloadItems = itemsToSubmit.map((i) => ({
      bcvh: i.bcvh,
      ngay: i.ngay,
      dot: i.dot
    }));
    onTriggerLayLai(payloadItems);
    setSelectedKeys([]);
    setShowManualDataConfirm(false);
  };

  // Lấy lại đơn lẻ một đợt
  const handleSingleLayLai = (item) => {
    if (item.ly_do === 'NHAP_TAY_CO_SAN') {
      setPendingItemsToSubmit([item]);
      setShowManualDataConfirm(true);
      return;
    }
    submitLayLai([item]);
  };

  // Ánh xạ nhãn trạng thái tình trạng
  const renderStatusBadge = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.loai === 'MA_LA') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          Mã BCVH không khớp
        </span>
      );
    }
    if (item.loai === 'NGAY') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          {item.nghi_ngo === 'NHIEU' ? 'Nghi ngờ: nhiều' : 'Nghi ngờ: ít'}
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
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
            {typeof item.trang_thai === 'string' ? item.trang_thai : '—'}
          </span>
        );
    }
  };

  const renderReasonText = (item) => {
    if (!item || typeof item !== 'object') return '—';
    if (item.loai === 'MA_LA') {
      const tenFile = typeof item.ten_file === 'string' ? item.ten_file : 'lạ';
      return `File ${tenFile}, mã trong tên file không khớp 6 BCVH (kiểm tra mã ở nơi xuất file)`;
    }
    if (item.ly_do && REASON_MAP[item.ly_do]) {
      return REASON_MAP[item.ly_do];
    }
    if (item.nghi_ngo === 'IT') return 'Số dòng ít hơn nhiều so với mức thường';
    if (item.nghi_ngo === 'NHIEU') return 'Số dòng nhiều hơn nhiều so với mức thường';
    return (typeof item.ly_do === 'string' && item.ly_do) ? 'Xem chi tiết ô' : '—';
  };

  const visibleItems = sortedItems.slice(0, showLimit);

  if (totalCount === 0) {
    return null;
  }

  const selectedCount = selectedKeys.length;
  const isOverLimit = selectedCount > 20;

  return (
    <div className="card-soft rounded-2xl border border-orange-200 overflow-hidden shadow-2xs space-y-0">
      {/* HEADER B0 */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-50/90 to-amber-50/50 border-b border-orange-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
            <h3 className="text-sm font-bold text-gray-900 tracking-tight">
              B0. Ngày bị thiếu cần xử lý ({formatNumber(totalCount)} mục)
            </h3>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {formatNumber(totalCount)} đợt cần xem · {formatNumber(thieuCount)} thiếu · {formatNumber(rongCount)} rỗng · {formatNumber(loiCount)} lỗi · {formatNumber(nghiNgoCount)} nghi ngờ (ít/nhiều)
          </p>
        </div>

        {/* NÚT THỰC HIỆN LẤY LẠI NHIỀU ĐỢT */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={handleConfirmBatchLayLai}
              disabled={isExecuting || isOverLimit}
              className={`flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                isOverLimit
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang gửi…</span>
                </>
              ) : (
                <span>Lấy lại {selectedCount} đợt đã chọn</span>
              )}
            </button>
          )}

          {isOverLimit && (
            <span className="text-[11px] text-red-600 font-semibold">
              Tối đa 20 đợt mỗi lần
            </span>
          )}
        </div>
      </div>

      {/* BẢNG DANH SÁCH CẦN XỬ LÝ */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50/90 text-gray-500 font-semibold border-b border-gray-200 uppercase text-[11px] tracking-wider">
              <th className="py-3 px-3 w-10 text-center">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-gray-400 hover:text-orange-600 cursor-pointer"
                  title="Chọn tất cả (tối đa 20)"
                >
                  {selectedKeys.length > 0 && selectedKeys.length === selectableItems.length ? (
                    <CheckSquare className="w-4 h-4 text-orange-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3">Ngày</th>
              <th className="py-3 px-3">BCVH</th>
              <th className="py-3 px-3">Đợt</th>
              <th className="py-3 px-3">Tình trạng</th>
              <th className="py-3 px-4">Lý do</th>
              <th className="py-3 px-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleItems.map((item, idx) => {
              if (!item || typeof item !== 'object') return null;
              const key = getItemKey(item);
              const isChecked = selectedKeys.includes(key);
              const selectable = isSelectable(item);

              return (
                <tr
                  key={idx}
                  className={`hover:bg-gray-50/80 transition-colors ${
                    isChecked ? 'bg-orange-50/30' : ''
                  }`}
                >
                  {/* Ô CHỌN */}
                  <td className="py-2.5 px-3 text-center">
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRow(item)}
                        className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
                        aria-label={`Chọn đợt ${item.bcvh} ngày ${item.ngay}`}
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* NGÀY */}
                  <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                    {typeof item.ngay === 'string' ? formatYmdToDmy(item.ngay) : '—'}
                  </td>

                  {/* BCVH */}
                  <td className="py-2.5 px-3 font-semibold text-gray-800 whitespace-nowrap">
                    {item.loai === 'MA_LA'
                      ? `Mã ${typeof item.ma_la === 'string' ? item.ma_la : 'lạ'}, không khớp 6 BCVH`
                      : getBcvhName(item.bcvh)}
                  </td>

                  {/* ĐỢT */}
                  <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">
                    {item.loai === 'NGAY' ? (
                      <span className="font-semibold text-gray-900">Cả ngày</span>
                    ) : item.dot === 'S' ? (
                      'Sáng'
                    ) : (
                      'Chiều'
                    )}
                  </td>

                  {/* TÌNH TRẠNG */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {renderStatusBadge(item)}
                  </td>

                  {/* LÝ DO */}
                  <td className="py-2.5 px-4 text-gray-600 leading-snug">
                    {renderReasonText(item)}
                  </td>

                  {/* HÀNH ĐỘNG */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    {item.loai === 'NGAY' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateReplaceDay &&
                          onNavigateReplaceDay({ bcvh: item.bcvh, ngay: item.ngay })
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                      >
                        <span>Thay thế ngày</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : item.trang_thai === 'NGUON_CHUA_CO_FILE' ? (
                      <button
                        type="button"
                        disabled
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 bg-gray-100 cursor-not-allowed"
                        title="Nguồn chưa có file, không thể lấy lại"
                      >
                        Lấy lại
                      </button>
                    ) : item.loai === 'DOT' && selectable ? (
                      <button
                        type="button"
                        onClick={() => handleSingleLayLai(item)}
                        disabled={isExecuting}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        Lấy lại
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER BẢNG & NÚT XEM THÊM */}
      <div className="p-3.5 bg-gray-50/90 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-500">
        <div>
          Tối đa 20 đợt mỗi lần, nạp lần lượt, ghi ai bấm và lúc nào. File đã nạp thì không nạp đè.
        </div>

        {sortedItems.length > showLimit && (
          <button
            type="button"
            onClick={() => setShowLimit((prev) => prev + 50)}
            className="text-orange-600 font-bold hover:underline cursor-pointer"
          >
            Xem thêm {sortedItems.length - showLimit} mục nữa…
          </button>
        )}
      </div>

      {/* MODAL XÁC NHẬN KHI CÓ DỮ LIỆU NHẬP TAY (NHAP_TAY_CO_SAN) */}
      {showManualDataConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4 text-left">
            <button
              type="button"
              onClick={() => setShowManualDataConfirm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-amber-900">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">Xác nhận lấy lại đợt có dữ liệu nhập tay</h3>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Ngày này đang có dữ liệu nhập tay. «Lấy lại» chỉ THÊM các dòng chỉ có ở file nguồn, không xóa gì.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowManualDataConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => submitLayLai(pendingItemsToSubmit)}
                className="px-5 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
