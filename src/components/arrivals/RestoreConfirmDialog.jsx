import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Database,
  Lock,
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

// Định dạng dung lượng KB/MB
function formatFileSize(kichThuoc) {
  if (kichThuoc === null || kichThuoc === undefined || isNaN(kichThuoc)) {
    return 'Chưa ghi nhận';
  }
  const bytes = Number(kichThuoc);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export default function RestoreConfirmDialog({
  isOpen,
  onClose,
  nhatKyId,
  bcvh,
  ngay, // YYYY-MM-DD
  soDongSeThem,
  onSuccess,
}) {
  // RULES OF HOOKS: Mọi hooks ở đầu component, trước bất kỳ lệnh return nào
  const [confirmBcvh, setConfirmBcvh] = useState('');
  const [confirmNgay, setConfirmNgay] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null); // { message, ma }
  const [resultData, setResultData] = useState(null); // dữ liệu khi thành công

  const bcvhInputRef = useRef(null);

  // Tập trung vào ô nhập đầu tiên khi mở hộp thoại
  useEffect(() => {
    if (isOpen && bcvhInputRef.current) {
      bcvhInputRef.current.focus();
    }
  }, [isOpen]);

  // Đóng bằng phím Esc (trừ khi đang gửi request)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        if (resultData || ['THUNG_RAC_HET_HAN', 'DA_KHOI_PHUC', 'KHONG_CO_GI_DE_KHOI_PHUC'].includes(errorInfo?.ma)) {
          onSuccess();
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, resultData, errorInfo, onSuccess, onClose]);

  if (!isOpen) return null;

  const targetBcvh = String(bcvh || '').trim();
  const targetNgay = String(ngay || '').trim();
  const ngayDmy = toDmy(targetNgay);

  const cleanInputBcvh = confirmBcvh.trim();
  const cleanInputNgay = confirmNgay.trim();

  // Khớp chính xác cả hai ô sau khi cắt khoảng trắng đầu/cuối
  const isBcvhMatch = cleanInputBcvh === targetBcvh;
  const isNgayMatch = cleanInputNgay === targetNgay;
  const canSubmit = isBcvhMatch && isNgayMatch && !isSubmitting && !resultData;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorInfo(null);

    try {
      const payload = {
        nhat_ky_id: nhatKyId,
        xac_nhan: {
          ma_bcvh: cleanInputBcvh,
          ngay: cleanInputNgay,
        },
      };

      const res = await apiFetchJson('/api/arrivals/thay-the/khoi-phuc/thuc-hien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setResultData(res.data);
      } else {
        const ma = res.data?.ma;
        const errMsg = res.data?.error || res.error || 'Có lỗi xảy ra khi thực hiện khôi phục.';

        let extraNote = '';
        if (ma === 'KHONG_DU_CHO_SAO_LUU') {
          extraNote = ' (Liên hệ quản trị NAS)';
        } else if (['SAO_LUU_LOI', 'KHOI_PHUC_THAT_BAI', 'LOI_HE_THONG'].includes(ma)) {
          extraNote = ' — Dữ liệu hiện tại được giữ nguyên';
        }

        setErrorInfo({
          message: `${errMsg}${extraNote}`,
          ma: ma || `HTTP_${res.status}`,
        });
      }
    } catch (err) {
      setErrorInfo({
        message: 'Lỗi mạng hoặc không thể kết nối tới máy chủ. Dữ liệu hiện tại được giữ nguyên.',
        ma: 'NETWORK_ERROR',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xác định mã lỗi có cho phép thử lại không
  const isFatalError = errorInfo && ['THUNG_RAC_HET_HAN', 'DA_KHOI_PHUC', 'KHONG_CO_GI_DE_KHOI_PHUC'].includes(errorInfo.ma);
  const isRetryableError = errorInfo && ['DANG_THAY_THE', 'DANG_CO_LUOT_DONG_BO'].includes(errorInfo.ma);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="card-soft bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-gray-200 overflow-hidden my-8"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-2xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-bold text-gray-900">
                Xác nhận khôi phục dữ liệu
              </h3>
              <p className="text-xs text-gray-500">Mã lần thay thế #{nhatKyId}</p>
            </div>
          </div>
          {!isSubmitting && (
            <button
              type="button"
              onClick={() => {
                if (resultData || isFatalError) {
                  onSuccess();
                } else {
                  onClose();
                }
              }}
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 inline-flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* TRƯỜNG HỢP: ĐÃ KHÔI PHỤC XONG THÀNH CÔNG */}
          {resultData ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed space-y-1">
                  <div className="font-bold text-sm text-emerald-900">
                    Đã khôi phục xong. Thêm {formatNumber(resultData.so_dong_them)} dòng, bỏ qua {formatNumber(resultData.so_dong_da_co)} dòng trùng.
                  </div>
                  <p className="text-emerald-700">
                    Dữ liệu đã được nạp an toàn vào hệ thống. Các dòng đã tồn tại được giữ nguyên vẹn.
                  </p>
                </div>
              </div>

              {/* Thông tin bản sao lưu trước khôi phục */}
              {resultData.sao_luu?.tep && (
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1">
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-gray-500" />
                    <span>Bản sao lưu trước khôi phục:</span>
                  </div>
                  <div className="tabular-nums text-[11px] text-gray-600 break-all">
                    {resultData.sao_luu.tep}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Dung lượng: {formatFileSize(resultData.sao_luu.kich_thuoc)}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onSuccess}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs inline-flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đóng và làm mới danh sách</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Thông báo hướng dẫn xác nhận */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                <p className="font-semibold text-sm mb-1 text-amber-900">
                  Gõ lại mã BCVH và ngày để xác nhận.
                </p>
                <p>
                  Khôi phục sẽ thêm lại{' '}
                  <span className="font-bold text-amber-900">{formatNumber(soDongSeThem)}</span> dòng cho đơn vị{' '}
                  <span className="font-bold text-amber-900">{targetBcvh}</span> ngày{' '}
                  <span className="font-bold text-amber-900">{ngayDmy}</span>.
                </p>
              </div>

              {/* Thông báo lỗi nếu có */}
              {errorInfo && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-rose-900">Không thể thực hiện khôi phục</div>
                    <div>{errorInfo.message}</div>
                    {errorInfo.ma && (
                      <div className="tabular-nums text-[11px] text-rose-600">Mã lỗi: {errorInfo.ma}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Trường hợp lỗi nghiêm trọng không cho thử lại (thùng rác hết hạn, đã khôi phục...) */}
              {isFatalError ? (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onSuccess}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-800 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Đóng và làm mới danh sách
                  </button>
                </div>
              ) : (
                <>
                  {/* Hai ô nhập xác nhận */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="confirm-bcvh-input" className="block text-xs font-semibold text-gray-700">
                        Mã BCVH (gõ chính xác <span className="tabular-nums text-orange-600 font-bold">{targetBcvh}</span>):
                      </label>
                      <input
                        id="confirm-bcvh-input"
                        ref={bcvhInputRef}
                        type="text"
                        value={confirmBcvh}
                        onChange={(e) => setConfirmBcvh(e.target.value)}
                        disabled={isSubmitting}
                        placeholder={targetBcvh}
                        className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all tabular-nums"
                      />
                      {!isBcvhMatch && confirmBcvh.length > 0 && (
                        <p className="text-[11px] text-rose-500">Mã BCVH chưa khớp</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirm-ngay-input" className="block text-xs font-semibold text-gray-700">
                        Ngày (năm-tháng-ngày, gõ chính xác <span className="tabular-nums text-orange-600 font-bold">{targetNgay}</span>):
                      </label>
                      <input
                        id="confirm-ngay-input"
                        type="text"
                        value={confirmNgay}
                        onChange={(e) => setConfirmNgay(e.target.value)}
                        disabled={isSubmitting}
                        placeholder={targetNgay}
                        className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all tabular-nums"
                      />
                      {!isNgayMatch && confirmNgay.length > 0 && (
                        <p className="text-[11px] text-rose-500">Ngày chưa khớp (định dạng YYYY-MM-DD)</p>
                      )}
                    </div>
                  </div>

                  {/* Nút hành động */}
                  <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>

                    {isRetryableError && (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !canSubmit}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                        <span>Thử lại</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className={`min-h-[44px] px-6 py-2.5 rounded-xl font-semibold text-xs transition-colors inline-flex items-center gap-2 ${
                        canSubmit
                          ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer shadow-xs'
                          : 'bg-gray-150 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang khôi phục…</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Khôi phục</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
