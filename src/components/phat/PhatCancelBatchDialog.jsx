import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { formatInt } from './ProcessingDeliveryView';
import { BCVH_LIST } from '../../constants/bcvh';

// Định dạng giờ Bangkok: YYYY-MM-DD HH:mm:ss -> HH:mm dd/mm/yyyy
function formatBangkokDateTime(str) {
  if (!str) return '—';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!m) return str;
  return `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}`;
}

export default function PhatCancelBatchDialog({
  batch,
  onClose,
  onCancelSuccess,
  onRefreshList
}) {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  // Trạng thái hiển thị trong dialog: 'LOADING' | 'CONFIRM' (A) | 'BLOCKED' (B) | 'ALREADY_CANCELLED' (C) | 'ERROR'
  const [dialogState, setDialogState] = useState('LOADING');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Tên BCVH
  const bcvhObj = BCVH_LIST.find((b) => b.ma === batch?.bcvh);
  const bcvhName = bcvhObj ? bcvhObj.ten : (batch?.bcvh || 'BCVH');

  // Gọi undo-preview khi mở modal
  useEffect(() => {
    let isMounted = true;
    async function fetchPreview() {
      if (!batch?.id) return;
      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const res = await apiFetchJson(`/api/phat/batches/${batch.id}/undo-preview`);
        if (!isMounted) return;

        if (res.ok) {
          const data = res.data || {};
          setPreviewData(data);
          if (data.co_the_hoan_tac) {
            setDialogState('CONFIRM'); // Trạng thái A
          } else if (data.ly_do_khong_the === 'BI_CHAN') {
            setDialogState('BLOCKED'); // Trạng thái B
          } else if (data.ly_do_khong_the === 'DA_HOAN_TAC') {
            setDialogState('ALREADY_CANCELLED'); // Trạng thái C
          } else {
            setDialogState('CONFIRM');
          }
        } else {
          // Lỗi từ máy chủ khi gọi preview (403, 404, 500...)
          setPreviewError(res.error || 'Không kiểm tra được đợt nhập');
          setDialogState('ERROR');
        }
      } catch (_) {
        if (!isMounted) return;
        setPreviewError('Lỗi kết nối khi kiểm tra đợt nhập');
        setDialogState('ERROR');
      } finally {
        if (isMounted) setLoadingPreview(false);
      }
    }

    fetchPreview();
    return () => {
      isMounted = false;
    };
  }, [batch?.id]);

  // Xử lý khi người dùng bấm xác nhận «Hủy đợt nhập này»
  const handleConfirmCancel = async () => {
    if (isSubmitting || !batch?.id) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiFetchJson(`/api/phat/batches/${batch.id}/undo`, {
        method: 'POST'
      });

      if (res.ok) {
        // Trạng thái D: Thành công -> đóng modal và chuyển kết quả ra ngoài màn lịch sử
        onCancelSuccess(res.data);
      } else if (res.status === 409) {
        // Nhận 409: đổi nội dung hộp thoại sang B hoặc C theo thân 409, KHÔNG đóng hộp
        const errData = res.data || {};
        if (errData.dot_vuong_chi_tiet || errData.so_shbg_vuong) {
          // Trạng thái B: Bị chặn bởi đợt sau
          setPreviewData((prev) => ({
            ...prev,
            ...errData,
            so_shbg_vuong: errData.so_shbg_vuong ?? prev?.so_shbg_vuong ?? 0,
            dot_vuong_chi_tiet: errData.dot_vuong_chi_tiet || prev?.dot_vuong_chi_tiet || []
          }));
          setDialogState('BLOCKED');
        } else {
          // Trạng thái C: Đã hủy trước đó
          setPreviewData((prev) => ({
            ...prev,
            ...errData,
            hoan_tac_luc_bangkok: errData.hoan_tac_luc_bangkok,
            hoan_tac_boi: errData.hoan_tac_boi
          }));
          setDialogState('ALREADY_CANCELLED');
        }
      } else {
        // Lỗi 403, 404, 500 khác
        setSubmitError(res.error || 'Có lỗi xảy ra khi hủy đợt nhập');
        setDialogState('ERROR');
      }
    } catch (_) {
      setSubmitError('Lỗi kết nối máy chủ khi thực hiện hủy đợt nhập');
      setDialogState('ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden text-left p-6 space-y-5">
        {/* Nút X đóng góc trên */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── 1. ĐANG KIỂM TRA (LOADING) ─────────────────────────────────── */}
        {dialogState === 'LOADING' && (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
            <div className="text-sm font-semibold text-gray-700">
              Đang kiểm tra…
            </div>
            <div className="text-xs text-gray-500">
              Đang đối soát trạng thái các bưu gửi của đợt #{batch?.id}
            </div>
          </div>
        )}

        {/* ── 2. TRẠNG THÁI A: XÁC NHẬN HỦY (co_the_hoan_tac = true) ────── */}
        {dialogState === 'CONFIRM' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                Hủy đợt nhập #{batch?.id}?
              </h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Đợt nhập lúc {formatBangkokDateTime(batch?.nhap_luc_bangkok)} của {batch?.nhap_boi?.full_name || 'Người dùng'}, {bcvhName}, file {batch?.ten_file}.
              </p>
            </div>

            {/* Hộp thống kê bưu gửi sẽ bị đổi */}
            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-4 space-y-2.5">
              <div className="text-sm font-[900] text-gray-900">
                {formatInt(previewData?.so_nhap ?? batch?.so_nhap)} bưu gửi sẽ bị đổi:
              </div>
              <div className="space-y-1.5 text-xs text-gray-700">
                <div className="flex items-center justify-between">
                  <span>Quay về trạng thái trước đó</span>
                  <strong className="font-bold text-gray-900">
                    {formatInt(previewData?.so_se_khoi_phuc)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Bị xóa trạng thái (về «Chưa có thông tin phát»)</span>
                  <strong className="font-bold text-gray-900">
                    {formatInt(previewData?.so_se_xoa_trang_thai)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Ghi chú lưu ý */}
            <p className="text-xs text-gray-500 leading-relaxed">
              Lịch sử vẫn được giữ lại. Tỷ lệ phát của các ngày liên quan được tính lại ngay sau khi hủy.
            </p>

            {/* Hàng nút bấm */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                Không hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmitting ? 'Đang hủy…' : 'Hủy đợt nhập này'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── 3. TRẠNG THÁI B: CHƯA HỦY ĐƯỢC (BI_CHAN hoặc 409 vướng) ───── */}
        {dialogState === 'BLOCKED' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-red-600 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span>Chưa hủy được đợt nhập #{batch?.id}</span>
              </h3>
              <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                <strong className="font-bold text-gray-900">{formatInt(previewData?.so_shbg_vuong)}</strong> bưu gửi của đợt này đã được đổi trạng thái bởi đợt nhập sau. Hãy hủy các đợt sau trước:
              </p>
            </div>

            {/* Bảng các đợt sau gây vướng */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Đợt</th>
                    <th className="py-2.5 px-3">Giờ nhập</th>
                    <th className="py-2.5 px-3">Người nhập</th>
                    <th className="py-2.5 px-3 text-right">Đã nhập</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {(previewData?.dot_vuong_chi_tiet || []).map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-3 font-bold text-gray-900">#{d.id}</td>
                      <td className="py-2.5 px-3">{formatBangkokDateTime(d.nhap_luc_bangkok)}</td>
                      <td className="py-2.5 px-3">{d.nhap_boi?.full_name || d.nhap_boi?.hrm_code || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">{formatInt(d.so_nhap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500 italic leading-relaxed">
              Hủy lần lượt từ đợt mới nhất lùi dần về đợt này.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* ── 4. TRẠNG THÁI C: ĐÃ HỦY TRƯỚC ĐÓ ──────────────────────────── */}
        {dialogState === 'ALREADY_CANCELLED' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                Đợt #{batch?.id} đã được hủy
              </h3>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                {previewData?.hoan_tac_boi?.full_name ? (
                  <>
                    <strong className="text-gray-900 font-semibold">{previewData.hoan_tac_boi.full_name}</strong> đã hủy đợt này lúc {formatBangkokDateTime(previewData.hoan_tac_luc_bangkok)}. Danh sách sẽ được làm mới.
                  </>
                ) : (
                  'Đợt này đã được hủy trước đó.'
                )}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRefreshList();
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Làm mới danh sách
              </button>
            </div>
          </div>
        )}

        {/* ── 5. LỖI KHÁC (403, 404, 500...) ───────────────────────────── */}
        {dialogState === 'ERROR' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Không thể thực hiện</div>
                <div className="leading-relaxed">
                  {submitError || previewError || 'Có lỗi xảy ra, vui lòng thử lại.'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
