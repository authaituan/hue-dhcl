import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  Info,
  AlertTriangle,
  RotateCcw,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sliders
} from 'lucide-react';
import {
  formatGiaTriHienThi,
  giaTriToInput,
  inputToGiaTri,
  validateParamValue,
  tachViDu
} from './thamSoFormat';

export default function ThamSoDrawer({
  param,
  draftValue,
  nhomList = [],
  onClose,
  onApplyDraft,
  onResetDefault,
  isResetting = false,
  apiError = null
}) {
  if (!param) return null;

  // Nhãn tiếng Việt của nhóm
  const nhomItem = nhomList.find((n) => n.ma === param.nhom);
  const nhomNhan = nhomItem?.nhan || param.nhom;

  // Giá trị hiện tại (ưu tiên draftValue nếu đã có thay đổi trước đó, nếu không thì lấy param.gia_tri)
  const initialGiaTri = draftValue !== undefined ? draftValue : param.gia_tri;
  const [inputValue, setInputValue] = useState(() => giaTriToInput(initialGiaTri, param.kieu));
  const [resetLyDo, setResetLyDo] = useState('');
  const [localError, setLocalError] = useState(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  useEffect(() => {
    const val = draftValue !== undefined ? draftValue : param.gia_tri;
    setInputValue(giaTriToInput(val, param.kieu));
    setLocalError(null);
    setResetLyDo('');
  }, [param, draftValue]);

  // Kiểm tra tính hợp lệ khi inputValue thay đổi
  const convertedValue = inputToGiaTri(inputValue, param.kieu);
  const validationError = validateParamValue(inputValue, param);

  // So sánh với giá trị đang dùng (current in backend)
  const isChanged = convertedValue !== null && JSON.stringify(convertedValue) !== JSON.stringify(param.gia_tri);
  const isCurrentlyDefault = JSON.stringify(param.gia_tri) === JSON.stringify(param.mac_dinh);

  // Tách ví dụ
  const viDuSplit = tachViDu(param.vi_du);

  // Xử lý áp dụng thay đổi (vào danh sách soạn thảo - không gửi kèm lý do ở bước này)
  const handleApply = () => {
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    if (!isChanged) {
      onClose();
      return;
    }
    onApplyDraft(param.khoa, convertedValue);
    onClose();
  };

  // Xử lý hoàn về mặc định (gọi API ngay nên cần lý do)
  const handleConfirmReset = () => {
    if (!resetLyDo.trim()) {
      setLocalError('Vui lòng nhập lý do để hoàn về giá trị mặc định');
      return;
    }
    onResetDefault(param.khoa, resetLyDo.trim());
  };

  // Tính vị trí % trên thang min-max
  const calcScalePct = (val) => {
    if (param.min === null || param.max === null || param.min === param.max) return 50;
    let current = Number(val);
    let min = Number(param.min);
    let max = Number(param.max);
    if (param.kieu === 'phan_so') {
      current = Math.round(current * 100);
      min = Math.round(min * 100);
      max = Math.round(max * 100);
    }
    const pct = ((current - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-[640px] bg-white h-full flex flex-col shadow-2xl overflow-hidden border-l border-gray-200 animate-in slide-in-from-right duration-250"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* HEADER */}
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-4 bg-gray-50/70 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                {nhomNhan}
              </span>
              <span className="tabular-nums text-xs text-gray-500 truncate" title={param.khoa}>
                {param.khoa}
              </span>
            </div>
            <h2 id="drawer-title" className="text-lg font-bold text-[var(--color-title)] leading-snug">
              {param.nhan}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY (Cuộn được) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Thông báo lỗi từ API nếu có */}
          {apiError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>{apiError}</div>
            </div>
          )}

          {/* 1. Ý NGHĨA */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase font-bold text-gray-500 tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span>Ý nghĩa</span>
            </label>
            <div className="text-xs text-[var(--color-body)] leading-relaxed p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              {param.mo_ta}
            </div>
          </div>

          {/* 2. GIÁ TRỊ & Ô NHẬP */}
          <div className="space-y-3 p-4 rounded-xl border border-orange-200 bg-orange-50/20">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-orange-500" />
                <span>Giá trị thiết lập</span>
              </label>
              <div className="text-[11px] text-gray-500 font-medium">
                Mặc định: <strong className="text-gray-700">{formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi)}</strong>
              </div>
            </div>

            {/* Ô nhập */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                {param.kieu === 'gio_hhmm' ? (
                  <input
                    type="time"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full text-sm font-semibold px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                ) : (
                  <input
                    type="number"
                    step={param.kieu === 'phan_so' || param.kieu === 'thap_phan' ? 'any' : '1'}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setLocalError(null);
                    }}
                    placeholder={`Nhập ${param.don_vi || 'giá trị'}`}
                    className="w-full text-sm font-semibold px-3 py-2 pr-12 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                )}
                {param.kieu === 'phan_so' || param.kieu === 'phan_tram_nguyen' ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">
                    %
                  </span>
                ) : param.don_vi ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                    {param.don_vi}
                  </span>
                ) : null}
              </div>

              <div className="shrink-0 text-xs text-gray-500">
                {param.min !== null && param.max !== null && (
                  <span>
                    Khoảng: {param.kieu === 'phan_so' ? `${Math.round(param.min * 100)}% – ${Math.round(param.max * 100)}%` : `${param.min} – ${param.max}`}
                  </span>
                )}
              </div>
            </div>

            {/* Dòng so sánh Đang dùng X -> Sẽ đổi thành Y */}
            {isChanged && convertedValue !== null && (
              <div className="text-xs font-semibold p-2.5 rounded-lg bg-orange-100/70 text-orange-900 flex items-center gap-2">
                <span>Đang dùng: <strong>{formatGiaTriHienThi(param.gia_tri, param.kieu, param.don_vi)}</strong></span>
                <ArrowRight className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                <span>Sẽ đổi thành: <strong className="text-orange-700 underline">{formatGiaTriHienThi(convertedValue, param.kieu, param.don_vi)}</strong></span>
              </div>
            )}

            {/* Lỗi kiểm tra hợp lệ */}
            {(localError || validationError) && (
              <div className="text-[11px] font-semibold text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{localError || validationError}</span>
              </div>
            )}

            {/* Thang min-max (cho kiểu số) */}
            {param.kieu !== 'gio_hhmm' && param.min !== null && param.max !== null && (
              <div className="pt-2 space-y-1">
                <div className="relative h-2 bg-gray-200 rounded-full overflow-visible">
                  {/* Vạch mặc định */}
                  <div
                    style={{ left: `${calcScalePct(param.mac_dinh)}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-4 bg-gray-500 rounded-full z-1"
                    title={`Mặc định: ${formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi)}`}
                  />
                  {/* Vạch giá trị đang chọn */}
                  {convertedValue !== null && (
                    <div
                      style={{ left: `${calcScalePct(convertedValue)}%` }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-orange-500 rounded-full border-2 border-white shadow-sm z-2"
                      title={`Giá trị mới: ${formatGiaTriHienThi(convertedValue, param.kieu, param.don_vi)}`}
                    />
                  )}
                </div>
                <div className="relative text-[10px] text-gray-500 font-medium h-4 mt-1">
                  <span className="absolute left-0">Min: {param.kieu === 'phan_so' ? `${Math.round(param.min * 100)}%` : param.min}</span>
                  <span
                    style={{ left: `${Math.max(15, Math.min(85, calcScalePct(param.mac_dinh)))}%` }}
                    className="absolute -translate-x-1/2 text-gray-600 whitespace-nowrap font-semibold"
                  >
                    ↑ Mặc định
                  </span>
                  <span className="absolute right-0">Max: {param.kieu === 'phan_so' ? `${Math.round(param.max * 100)}%` : param.max}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. MINH HỌA (VÍ DỤ TÁCH 2 THẺ) */}
          {param.vi_du && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase font-bold text-gray-500 tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                <span>Minh họa ví dụ</span>
              </label>

              {viDuSplit ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed shadow-2xs">
                    <span className="text-[10px] font-bold text-amber-700 uppercase block mb-1">Phương án A</span>
                    {viDuSplit[0]}
                  </div>

                  <div className="relative p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed shadow-2xs">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Phương án B</span>
                    {viDuSplit[1]}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  {param.vi_du}
                </div>
              )}
            </div>
          )}

          {/* 4. ĐỔI THÌ ẢNH HƯỞNG GÌ */}
          {param.anh_huong && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase font-bold text-gray-500 tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Đổi thì ảnh hưởng gì?</span>
              </label>
              <div className="text-xs text-gray-700 leading-relaxed p-3.5 bg-blue-50/50 rounded-xl border border-blue-100">
                {param.anh_huong}
              </div>
            </div>
          )}

          {/* 5. BẠN SẼ THẤY Ở */}
          {Array.isArray(param.nhin_thay_o) && param.nhin_thay_o.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase font-bold text-gray-500 tracking-wider">
                Bạn sẽ nhìn thấy ở đâu
              </label>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside bg-gray-50 p-3 rounded-xl border border-gray-100">
                {param.nhin_thay_o.map((loc, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {loc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 6. RÀNG BUỘC (NẾU CÓ) */}
          {Array.isArray(param.rang_buoc) && param.rang_buoc.length > 0 && (
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
              <span className="font-bold text-[11px] uppercase tracking-wide text-purple-800 block">
                Ràng buộc chéo cần chú ý
              </span>
              {param.rang_buoc.map((rb, idx) => (
                <div key={idx} className="leading-relaxed">
                  • {rb}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-5 border-t border-gray-200 bg-gray-50 shrink-0 space-y-3">
          {/* Hộp xác nhận hoàn về mặc định */}
          {showConfirmReset ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
              <div className="text-xs font-bold text-amber-900">
                Xác nhận hoàn tham số "{param.nhan}" về giá trị mặc định ({formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi)})?
              </div>
              <div className="space-y-1">
                <input
                  type="text"
                  maxLength={200}
                  value={resetLyDo}
                  onChange={(e) => {
                    setResetLyDo(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="Nhập lý do hoàn về mặc định (bắt buộc, tối đa 200 ký tự)"
                  className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <div className="text-[10px] text-right text-gray-400">
                  {resetLyDo.length}/200
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={isResetting || !resetLyDo.trim()}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isResetting ? 'Đang hoàn...' : 'Xác nhận hoàn mặc định'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div>
                {!isCurrentlyDefault && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(true)}
                    className="px-3 py-2 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100/70 border border-amber-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Hoàn về giá trị mặc định của máy chủ"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Hoàn về mặc định ({formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi)})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={Boolean(validationError) || !isChanged}
                  className="px-5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Thêm vào thay đổi chưa lưu</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
