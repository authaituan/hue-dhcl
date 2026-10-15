import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';

// Định dạng số có dấu chấm ngăn cách hàng nghìn
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Chuyển yyyy-mm-dd thành dd/mm/yyyy
function toDmy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
}

// Bảng thông báo tiếng Việt theo mã lỗi
const DIALOG_ERROR_MESSAGES = {
  NGUON_DA_DOI: 'Máy chủ nguồn đã thay đổi tệp tin hoặc mã băm so với lần xem trước. Vui lòng đóng hộp thoại và bấm «Xem trước lại» để cập nhật.',
  DANG_THAY_THE: 'Hệ thống đang có một tiến trình thay thế khác đang thực hiện. Vui lòng thử lại sau ít phút.',
  DANG_CO_LUOT_DONG_BO: 'Hệ thống đang có lượt đồng bộ dữ liệu tự động đang chạy. Vui lòng thử lại sau khi hoàn tất.',
  CAN_DONG_Y_MAT_DU_LIEU: 'Có bưu gửi bị mất thật so với dữ liệu cũ. Cần tích chọn đồng ý mất dữ liệu để tiếp tục.',
  DU_LIEU_DA_DOI: 'Dữ liệu của đơn vị và ngày này trong cơ sở dữ liệu đã thay đổi giữa lúc xem trước và lúc thực hiện.',
  XAC_NHAN_SAI: 'Thông tin xác nhận mã BCVH hoặc ngày không khớp.',
  THAM_SO_SAI: 'Tham số yêu cầu không hợp lệ.',
  TAP_FILE_KHONG_HOP_LE: 'Tập tệp tin yêu cầu không hợp lệ hoặc không thuộc đơn vị/ngày này.',
  FILE_NGUON_LOI: 'Tệp dữ liệu trên máy chủ nguồn bị lỗi định dạng hoặc lỗi tải về.',
  KHONG_CO_FILE_DE_THAY: 'Không có tệp dữ liệu hợp lệ nào để thay thế.',
  CHUA_CAU_HINH_SFTP: 'Chưa cấu hình thông tin kết nối máy chủ nguồn trên hệ thống.',
  NGUON_XAC_THUC: 'Không thể xác thực với máy chủ nguồn (sai thông tin đăng nhập).',
  NGUON_VAN_TAY: 'Không xác minh được máy chủ nguồn.',
  NGUON_MANG: 'Lỗi mạng hoặc hết thời gian chờ kết nối máy chủ nguồn.',
  NGUON_THU_MUC: 'Thư mục trên máy chủ nguồn không tồn tại hoặc không thể truy cập.',
  NGUON_KHAC: 'Lỗi phát sinh từ máy chủ nguồn.',
  KHONG_DU_CHO_SAO_LUU: 'Không đủ dung lượng đĩa trống để tạo bản sao lưu an toàn trước khi thay thế.',
  SAO_LUU_LOI: 'Quá trình sao lưu cơ sở dữ liệu gặp lỗi.',
  GHI_THAT_BAI: 'Giao dịch thay thế dữ liệu thất bại và đã được tự động phục hồi.',
  LOI_HE_THONG: 'Lỗi hệ thống trong quá trình thực hiện.',
};

export default function ReplaceDayDialog({
  isOpen,
  onClose,
  bcvh,
  bcvhName,
  ngay, // YYYY-MM-DD
  previewData,
  selectedFiles,
  onSuccess,
}) {
  const [confirmBcvh, setConfirmBcvh] = useState('');
  const [confirmDate, setConfirmDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (!isOpen || !previewData) return null;

  const ngayDmy = toDmy(ngay);
  const canhBao = previewData.canh_bao || {};
  const soSanh = previewData.so_sanh || {};
  const shbgMatThat = Number(soSanh.shbg_mat_that ?? 0);
  const isKhongTheThay = Boolean(canhBao.khong_the_thay);
  const warningLevel = canhBao.muc || 'AN_TOAN'; // 'AN_TOAN' | 'CAN_XAC_NHAN' | 'DO'

  // Xác định loại hộp:
  // D: Không thể thay (chặn cứng, chỉ nút Đóng)
  // A: An toàn
  // B: Cần xác nhận
  // C: Đỏ (cảnh báo cao)
  const isBoxD = isKhongTheThay;
  const isBoxC = !isBoxD && warningLevel === 'DO';
  const isBoxB = !isBoxD && warningLevel === 'CAN_XAC_NHAN';
  const isBoxA = !isBoxD && !isBoxB && !isBoxC;

  // Kiểm tra điều kiện mở nút «Thay thế ngày này»
  const isAgreedValid = agreed;
  const isBcvhMatch = confirmBcvh.trim() === bcvh;
  const isDateMatch = confirmDate.trim() === ngayDmy;

  const missingConditions = [];
  if (!isAgreedValid) {
    missingConditions.push(shbgMatThat > 0 ? 'chưa tích đồng ý mất bưu gửi' : 'chưa tích đồng ý thay thế');
  }
  if (!isBcvhMatch) {
    missingConditions.push(`chưa gõ đúng mã BCVH (${bcvh})`);
  }
  if (!isDateMatch) {
    missingConditions.push(`chưa gõ đúng ngày (${ngayDmy})`);
  }

  const canSubmit = !isBoxD && missingConditions.length === 0 && !isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        bcvh,
        ngay, // yyyy-mm-dd
        tap_file: selectedFiles,
        tap_file_nguon: previewData.tap_file_nguon || [],
        xac_nhan: {
          ma_bcvh: confirmBcvh.trim(),
          ngay,
        },
      };

      if (shbgMatThat > 0 && agreed) {
        payload.dong_y_mat_du_lieu = true;
      }

      const res = await apiFetchJson('/api/arrivals/thay-the/thuc-hien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess(res.data);
        onClose();
      } else {
        const maLoi = res.data?.ma;
        let msg = DIALOG_ERROR_MESSAGES[maLoi];
        if (!msg) {
          msg = res.data?.error || res.error || 'Có lỗi xảy ra khi thực hiện thay thế.';
          msg += ' Báo người quản trị hệ thống.';
        }
        msg += ' (Dữ liệu cũ được giữ nguyên).';
        setSubmitError({ message: msg, code: maLoi || `HTTP_${res.status}` });
      }
    } catch (err) {
      setSubmitError({
        message: 'Lỗi mạng hoặc máy chủ không phản hồi. Báo người quản trị hệ thống. (Dữ liệu cũ được giữ nguyên).',
        code: 'NETWORK_ERROR',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden text-left my-8">
        {/* Nút X đóng góc trên */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 cursor-pointer"
          aria-label="Đóng hộp thoại"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header hộp thoại theo từng mức */}
        <div className={`p-6 border-b ${
          isBoxD ? 'bg-gray-50 border-gray-200' :
          isBoxC ? 'bg-red-50/80 border-red-200' :
          isBoxB ? 'bg-amber-50/80 border-amber-200' :
          'bg-emerald-50/80 border-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-white shadow-2xs shrink-0 mt-0.5">
              {isBoxD && <AlertCircle className="w-6 h-6 text-gray-700" />}
              {isBoxC && <ShieldAlert className="w-6 h-6 text-red-600" />}
              {isBoxB && <AlertTriangle className="w-6 h-6 text-amber-600" />}
              {isBoxA && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
            </div>
            <div>
              <h3 className={`text-base font-bold tracking-tight ${
                isBoxD ? 'text-gray-900' :
                isBoxC ? 'text-red-900' :
                isBoxB ? 'text-amber-900' :
                'text-emerald-900'
              }`}>
                {isBoxD && 'Không thể thay thế dữ liệu'}
                {isBoxC && 'Cảnh báo nguy hiểm: Tỷ lệ mất bưu gửi cao'}
                {isBoxB && 'Cần xác nhận: Có bưu gửi bị mất'}
                {isBoxA && 'Xác nhận thay thế ngày của BCVH'}
              </h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Đơn vị: <strong className="text-gray-900 font-semibold">{bcvhName} ({bcvh})</strong> — Ngày: <strong className="text-gray-900 font-semibold">{ngayDmy}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Nội dung chính */}
        <div className="p-6 space-y-5">
          {/* HỘP D: CHẶN CỨNG */}
          {isBoxD ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 space-y-1.5 leading-relaxed">
                <div className="font-bold text-sm text-gray-900">Lý do không thể thực hiện:</div>
                <div>{canhBao.ly_do_khong_the_thay || 'Không có tệp dữ liệu hợp lệ trên máy chủ nguồn hoặc không có dữ liệu để thay thế.'}</div>
                <div className="text-[11px] text-gray-500 pt-1">
                  Dữ liệu hiện có trong cơ sở dữ liệu được giữ nguyên.
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            /* HỘP A, B, C: FORM XÁC NHẬN ĐẦY ĐỦ */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Tóm tắt thông số thay thế */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-2 text-xs">
                <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                  <span>Kế hoạch thay thế:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700">
                  <div>
                    Số tệp nguồn được nạp:{' '}
                    <strong className="font-semibold text-gray-900">{selectedFiles.length} tệp</strong>
                  </div>
                  <div>
                    Dòng mới dự kiến:{' '}
                    <strong className="font-semibold text-gray-900">
                      {formatNumber(soSanh.dong_moi_sau_loc_trung)}
                    </strong>
                  </div>
                  <div>
                    Bưu gửi mới:{' '}
                    <strong className="font-semibold text-gray-900">
                      {formatNumber(soSanh.shbg_moi)}
                    </strong>
                  </div>
                  <div>
                    Bưu gửi mất thật:{' '}
                    <strong className={`font-bold ${shbgMatThat > 0 ? (isBoxC ? 'text-red-600' : 'text-amber-600') : 'text-emerald-700'}`}>
                      {formatNumber(shbgMatThat)}
                    </strong>
                  </div>
                </div>

                {/* Thông báo chi tiết cảnh báo cho B và C */}
                {isBoxC && (
                  <div className="mt-3 p-3 rounded-lg bg-red-100/70 border border-red-300 text-red-900 text-[11px] leading-relaxed">
                    <strong>Lưu ý nghiêm trọng:</strong> Tỷ lệ mất thật đã vượt ngưỡng an toàn ({formatNumber(canhBao.nguong_do * 100)}%). Thao tác này sẽ xóa toàn bộ dữ liệu ngày {ngayDmy} cũ của {bcvhName} và nạp lại từ {selectedFiles.length} tệp đã chọn.
                  </div>
                )}
                {isBoxB && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-900 text-[11px] leading-relaxed">
                    <strong>Lưu ý:</strong> Có {formatNumber(shbgMatThat)} bưu gửi trong dữ liệu cũ không xuất hiện ở tập tệp mới và không còn ở các tệp ngoài tập.
                  </div>
                )}
              </div>

              {/* Thông báo lỗi nếu có khi submit */}
              {submitError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>Không thể thực hiện thay thế</span>
                  </div>
                  <div className="leading-relaxed pl-5.5">{submitError.message}</div>
                  {submitError.code && (
                    <div className="text-[10px] text-red-500 font-mono pl-5.5">
                      Mã: {submitError.code}
                    </div>
                  )}
                </div>
              )}

              {/* Ô TÍCH ĐỒNG Ý */}
              <div className="p-3.5 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-1">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-800 font-medium select-none">
                  <input
                    id="checkbox-dong-y-mat-du-lieu"
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-0.5 w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer disabled:opacity-50"
                  />
                  <span>
                    {shbgMatThat > 0 ? (
                      <>
                        Tôi đồng ý chấp nhận mất{' '}
                        <strong className="text-red-600 font-bold">{formatNumber(shbgMatThat)}</strong>{' '}
                        bưu gửi khi thực hiện thay thế ngày này.
                      </>
                    ) : (
                      'Tôi đã kiểm tra kỹ thông tin và đồng ý thay thế dữ liệu ngày này.'
                    )}
                  </span>
                </label>
              </div>

              {/* HAI Ô GÕ XÁC NHẬN */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <label htmlFor="input-xac-nhan-bcvh" className="block text-xs font-semibold text-gray-700">
                    Gõ lại mã BCVH để xác nhận (<span className="font-mono text-orange-600 font-bold">{bcvh}</span>):
                  </label>
                  <input
                    id="input-xac-nhan-bcvh"
                    type="text"
                    value={confirmBcvh}
                    onChange={(e) => setConfirmBcvh(e.target.value)}
                    disabled={isSubmitting}
                    placeholder={`Gõ đúng: ${bcvh}`}
                    className="w-full text-xs font-mono font-medium px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="input-xac-nhan-ngay" className="block text-xs font-semibold text-gray-700">
                    Gõ lại ngày dd/mm/yyyy để xác nhận (<span className="font-mono text-orange-600 font-bold">{ngayDmy}</span>):
                  </label>
                  <input
                    id="input-xac-nhan-ngay"
                    type="text"
                    value={confirmDate}
                    onChange={(e) => setConfirmDate(e.target.value)}
                    disabled={isSubmitting}
                    placeholder={`Gõ đúng: ${ngayDmy}`}
                    className="w-full text-xs font-mono font-medium px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Dòng liệt kê điều kiện còn thiếu */}
              {missingConditions.length > 0 && !isSubmitting && (
                <div className="text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200/80 px-3 py-2 rounded-lg font-medium leading-relaxed">
                  Chưa mở nút: còn thiếu: {missingConditions.join(', ')}.
                </div>
              )}

              {/* Hàng nút bấm */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>

                <button
                  id="btn-thuc-hien-thay-the"
                  type="submit"
                  disabled={!canSubmit}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer ${
                    !canSubmit
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      : isBoxC
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : isBoxB
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang thay… có thể mất vài chục giây</span>
                    </>
                  ) : (
                    <span>Thay thế ngày này</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
