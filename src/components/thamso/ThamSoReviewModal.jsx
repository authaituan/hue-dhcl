import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  RotateCcw
} from 'lucide-react';
import { formatGiaTriHienThi } from './thamSoFormat';

export default function ThamSoReviewModal({
  isOpen,
  draftChanges,
  allParams,
  onClose,
  onSave,
  onDiscard,
  saving = false,
  apiError = null
}) {
  const [commonLyDo, setCommonLyDo] = useState('');
  const [submitError, setSubmitError] = useState(null);

  // Mỗi lần mở modal: ô lý do trống (0/200), submitError trống
  useEffect(() => {
    if (isOpen) {
      setCommonLyDo('');
      setSubmitError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const draftList = Object.values(draftChanges);

  // Map lấy giá trị dự kiến của mọi tham số (sau khi áp bản nháp)
  const getSimulatedValue = (khoa) => {
    if (draftChanges[khoa] !== undefined) {
      return draftChanges[khoa].gia_tri;
    }
    const found = allParams.find((p) => p.khoa === khoa);
    return found ? found.gia_tri : undefined;
  };

  // Kiểm tra 2 cặp ràng buộc chéo Màn 4
  const lechTrongNgay = getSimulatedValue('lech_san_luong_trong_ngay_pct');
  const lechXuLyNgay = getSimulatedValue('lech_san_luong_xu_ly_ngay_pct');
  const isLechViolation = (
    lechTrongNgay !== undefined &&
    lechXuLyNgay !== undefined &&
    Number(lechTrongNgay) >= Number(lechXuLyNgay)
  );

  const bd10TrongNgay = getSimulatedValue('bd10_chua_xnd_trong_ngay_pct');
  const bd10XuLyNgay = getSimulatedValue('bd10_chua_xnd_xu_ly_ngay_pct');
  const isBd10Violation = (
    bd10TrongNgay !== undefined &&
    bd10XuLyNgay !== undefined &&
    Number(bd10TrongNgay) >= Number(bd10XuLyNgay)
  );

  const hasConstraintViolation = isLechViolation || isBd10Violation;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = commonLyDo.trim();
    if (!trimmed) {
      setSubmitError('Vui lòng nhập lý do thay đổi (bắt buộc, 1–200 ký tự)');
      return;
    }
    if (trimmed.length > 200) {
      setSubmitError('Lý do tối đa 200 ký tự');
      return;
    }
    if (hasConstraintViolation) {
      setSubmitError('Không thể lưu khi còn vi phạm ràng buộc chéo. Vui lòng sửa lại.');
      return;
    }
    setSubmitError(null);
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* HEADER */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/70 shrink-0">
          <div>
            <h3 id="modal-title" className="text-base font-bold text-[var(--color-title)]">
              Xem lại và lưu thay đổi ({draftList.length} tham số)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Kiểm tra các giá trị trước khi áp dụng vào hệ thống điều hành.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Lỗi API từ máy chủ */}
          {apiError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
              <div className="font-bold flex items-center gap-2 text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Máy chủ từ chối thay đổi</span>
              </div>
              <div className="leading-relaxed pl-6">{apiError}</div>
              <div className="text-[11px] text-red-600 pl-6">
                Các thay đổi của bạn vẫn được giữ nguyên để bạn chỉnh sửa lại.
              </div>
            </div>
          )}

          {/* Cảnh báo vi phạm ràng buộc chéo Màn 4 */}
          {hasConstraintViolation && (
            <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-xs text-red-950 space-y-2">
              <div className="font-bold flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Phát hiện vi phạm ràng buộc chéo</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-2 text-red-800">
                {isLechViolation && (
                  <li>
                    Mức lệch «Trong ngày» ({lechTrongNgay}%) phải nhỏ hơn mức lệch «Xử lý ngay» ({lechXuLyNgay}%).
                  </li>
                )}
                {isBd10Violation && (
                  <li>
                    Mức «Trong ngày» của BD10 chưa XNĐ ({bd10TrongNgay}%) phải nhỏ hơn mức «Xử lý ngay» ({bd10XuLyNgay}%).
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Khung xanh Ràng buộc đã đạt */}
          {!hasConstraintViolation && !apiError && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                Ràng buộc đã đạt: Tất cả giá trị đều hợp lệ và thỏa mãn các ràng buộc nghiệp vụ.
              </span>
            </div>
          )}

          {/* Bảng danh sách thay đổi */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider grid grid-cols-12 gap-2">
              <div className="col-span-6">Tham số</div>
              <div className="col-span-3 text-right">Giá trị cũ</div>
              <div className="col-span-3 text-right">Giá trị mới</div>
            </div>

            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {draftList.map((item) => {
                const param = item.param || allParams.find((p) => p.khoa === item.khoa);
                const isViolated = (
                  (isLechViolation && (item.khoa === 'lech_san_luong_trong_ngay_pct' || item.khoa === 'lech_san_luong_xu_ly_ngay_pct')) ||
                  (isBd10Violation && (item.khoa === 'bd10_chua_xnd_trong_ngay_pct' || item.khoa === 'bd10_chua_xnd_xu_ly_ngay_pct'))
                );

                return (
                  <div
                    key={item.khoa}
                    className={`px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs ${isViolated ? 'bg-red-50/70 border-l-4 border-l-red-500' : 'hover:bg-gray-50/50'}`}
                  >
                    <div className="col-span-6 min-w-0">
                      <div className="font-bold text-gray-800 truncate">
                        {param ? param.nhan : item.khoa}
                      </div>
                      <div className="tabular-nums text-[11px] text-gray-400">
                        {item.khoa}
                      </div>
                    </div>

                    <div className="col-span-3 text-right font-medium text-gray-400 line-through">
                      {param ? formatGiaTriHienThi(param.gia_tri, param.kieu, param.don_vi) : String(item.gia_tri_goc)}
                    </div>

                    <div className="col-span-3 text-right font-bold text-orange-600">
                      {param ? formatGiaTriHienThi(item.gia_tri, param.kieu, param.don_vi) : String(item.gia_tri)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Khung vàng Có hiệu lực ngay */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Có hiệu lực ngay:</strong> Khi bấm lưu, toàn bộ {draftList.length} tham số sẽ được cập nhật trong hệ thống và áp dụng ngay lập tức cho các màn hình điều hành và báo cáo.
            </div>
          </div>

          {/* Ô lý do thay đổi chung */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <label htmlFor="modal-ly-do" className="font-bold text-gray-800">
                Lý do thay đổi chung <span className="text-red-500">* (1–200 ký tự)</span>
              </label>
              <span className={`text-[11px] ${commonLyDo.length > 200 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                {commonLyDo.length}/200
              </span>
            </div>
            <textarea
              id="modal-ly-do"
              rows={3}
              maxLength={200}
              value={commonLyDo}
              onChange={(e) => {
                setCommonLyDo(e.target.value);
                setSubmitError(null);
              }}
              placeholder="Ghi rõ lý do điều chỉnh đợt tham số này để lưu vào nhật ký hệ thống..."
              className="w-full text-xs p-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 resize-none"
            />
            {submitError && (
              <div className="text-[11px] font-semibold text-red-600">
                {submitError}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Bỏ tất cả thay đổi</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
            >
              Quay lại sửa
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !commonLyDo.trim() || hasConstraintViolation}
              className="px-5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Đang lưu...' : `Lưu ${draftList.length} thay đổi`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
