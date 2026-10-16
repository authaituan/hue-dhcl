import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';

// Định dạng số có dấu chấm ngăn cách hàng nghìn (vd: 1.020)
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
function toDmy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(ymd);
}

// Ánh xạ nhãn tiếng Việt cho hành động của file
const ACTION_LABELS = {
  TAO_LAI: {
    label: 'Tạo lại file',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  GAN_VAO_FILE_HIEN_HANH: {
    label: 'Gắn vào file hiện hành',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  BO_QUA_TU_CHOI: {
    label: 'Bỏ qua (bị từ chối)',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  KHONG_TAO_LAI_TRUNG_BAN_GHI: {
    label: 'Không tạo lại (trùng bản ghi)',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

export default function RestorePreviewDialog({
  isOpen,
  onClose,
  nhatKyId,
  bcvh,
  ngay,
  onProceedToConfirm,
}) {
  // RULES OF HOOKS: Mọi hooks ở đầu component, trước bất kỳ lệnh return nào
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);

  // Tải dữ liệu xem trước khi mở hộp thoại
  useEffect(() => {
    let active = true;

    async function fetchPreview() {
      if (!isOpen || !nhatKyId) return;

      setLoading(true);
      setError(null);
      setPreviewData(null);

      try {
        const res = await apiFetchJson('/api/arrivals/thay-the/khoi-phuc/xem-truoc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nhat_ky_id: nhatKyId }),
        });

        if (!active) return;

        if (res.ok) {
          setPreviewData(res.data);
        } else {
          const ma = res.data?.ma;
          const msg = res.data?.error || res.error || 'Có lỗi xảy ra khi xem trước khôi phục.';
          setError({ message: msg, ma });
        }
      } catch (err) {
        if (!active) return;
        setError({
          message: 'Lỗi mạng hoặc không thể kết nối tới máy chủ.',
          ma: 'NETWORK_ERROR',
        });
      } finally {
        if (active) setLoading(false);
      }
    }

    if (isOpen) {
      fetchPreview();
    }

    return () => {
      active = false;
    };
  }, [isOpen, nhatKyId]);

  // Đóng bằng phím Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const canProceed = Boolean(previewData?.co_the_khoi_phuc);
  const canhBaoList = previewData?.canh_bao || [];
  const fileList = previewData?.tap_file || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-dialog-title"
        className="card-soft bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200 overflow-hidden my-8 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-2xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="preview-dialog-title" className="text-base font-bold text-gray-900">
                Xem trước khôi phục dữ liệu
              </h3>
              <p className="text-xs text-gray-500">
                Đơn vị: <span className="font-semibold text-gray-700">{bcvh}</span> • Ngày:{' '}
                <span className="font-semibold text-gray-700">{toDmy(ngay)}</span> • Lần #{nhatKyId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 inline-flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Trạng thái đang tải */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500">
              <RefreshCw className="w-7 h-7 animate-spin text-orange-500" />
              <p className="text-xs font-semibold">Đang phân tích dữ liệu thùng rác để xem trước…</p>
            </div>
          )}

          {/* Trạng thái lỗi tải */}
          {error && !loading && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-rose-900">Không thể xem trước khôi phục</div>
                <div>{error.message}</div>
                {error.ma && (
                  <div className="font-mono text-[11px] text-rose-600">Mã lỗi: {error.ma}</div>
                )}
              </div>
            </div>
          )}

          {/* Dữ liệu xem trước thành công */}
          {previewData && !loading && (
            <>
              {/* Khối vàng thông báo nguyên tắc khôi phục */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs leading-relaxed flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-950 text-sm">Nguyên tắc khôi phục</div>
                  <p>
                    Khôi phục chỉ BỔ SUNG. Không xóa dữ liệu đang có, không đổi trạng thái phát. Dòng nào đã có (trùng khóa nghiệp vụ) sẽ bỏ qua.
                  </p>
                </div>
              </div>

              {/* 4 ô số thống kê */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Sẽ thêm lại */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                    Sẽ thêm lại
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    {formatNumber(previewData.so_dong_se_them)}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">dòng bổ sung</div>
                </div>

                {/* 2. Bỏ qua (đã có) */}
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                    Bỏ qua (đã có)
                  </div>
                  <div className="text-2xl font-bold text-gray-800 mt-1">
                    {formatNumber(previewData.so_dong_da_co)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">trùng khóa nghiệp vụ</div>
                </div>

                {/* 3. Gắn sang file khác */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                  <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide">
                    Gắn sang file khác
                  </div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">
                    {formatNumber(previewData.so_dong_gan_sang_file_khac)}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">đã nằm trong số sẽ thêm</div>
                </div>

                {/* 4. Không khôi phục */}
                <div className={`p-3.5 rounded-xl border ${
                  Number(previewData.so_dong_khong_khoi_phuc) > 0
                    ? 'bg-rose-50/70 border-rose-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wide ${
                    Number(previewData.so_dong_khong_khoi_phuc) > 0 ? 'text-rose-800' : 'text-gray-600'
                  }`}>
                    Không khôi phục
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${
                    Number(previewData.so_dong_khong_khoi_phuc) > 0 ? 'text-rose-700' : 'text-gray-800'
                  }`}>
                    {formatNumber(previewData.so_dong_khong_khoi_phuc)}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${
                    Number(previewData.so_dong_khong_khoi_phuc) > 0 ? 'text-rose-600' : 'text-gray-500'
                  }`}>
                    file bị từ chối hoặc xung đột
                  </div>
                </div>
              </div>

              {/* Danh sách cảnh báo */}
              {canhBaoList.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Cảnh báo chi tiết ({canhBaoList.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {canhBaoList.map((cb, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-2"
                      >
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{cb.noi_dung}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danh sách file trong lần khôi phục */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />
                    <span>Danh sách file liên quan ({fileList.length})</span>
                  </div>
                  <span className="text-[11px] text-gray-500 italic">
                    File bị từ chối hoặc xung đột sẽ không được tạo lại
                  </span>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-3.5 py-2.5">Tên file</th>
                          <th className="px-3 py-2.5">Trạng thái</th>
                          <th className="px-3 py-2.5">Hành động dự kiến</th>
                          <th className="px-3 py-2.5 text-right">Thùng rác</th>
                          <th className="px-3 py-2.5 text-right">Sẽ thêm</th>
                          <th className="px-3 py-2.5 text-right">Đã có</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {fileList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-center text-gray-400">
                              Không có thông tin file
                            </td>
                          </tr>
                        ) : (
                          fileList.map((f, idx) => {
                            const act = ACTION_LABELS[f.hanh_dong] || {
                              label: f.hanh_dong,
                              badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
                            };
                            return (
                              <tr key={idx} className="hover:bg-gray-50/70 transition-colors">
                                <td className="px-3.5 py-2 font-mono text-[11px] text-gray-900 break-all font-medium">
                                  {f.ten || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                  {f.trang_thai || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${act.badgeClass}`}
                                  >
                                    {act.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                                  {formatNumber(f.so_dong_trong_thung_rac)}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-emerald-700">
                                  {formatNumber(f.so_dong_se_them)}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-gray-500">
                                  {formatNumber(f.so_dong_da_co)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Thông báo nếu không thể khôi phục */}
              {!canProceed && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Không có dòng hay file nào có thể thêm lại. Không thể tiếp tục khôi phục.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl border border-gray-300 hover:bg-white text-gray-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Hủy
          </button>

          {canProceed && (
            <button
              type="button"
              onClick={() => onProceedToConfirm(previewData)}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <span>Tiếp tục khôi phục</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
