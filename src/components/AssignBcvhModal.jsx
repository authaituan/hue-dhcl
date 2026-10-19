import React, { useState, useEffect, useRef } from 'react';
import { X, Building2 } from 'lucide-react';
import { apiUpdateUserBcvh } from '../utils/api';
import { BCVH_LIST } from '../constants/bcvh';

export default function AssignBcvhModal({ user, onClose, onSuccess }) {
  const [selectedCodes, setSelectedCodes] = useState(() => user.bcvh_codes || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const modalRef = useRef(null);
  const triggerElement = useRef(document.activeElement);

  // Focus modal khi mở và trả lại tiêu điểm khi đóng
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
    const prev = triggerElement.current;
    return () => {
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, []);

  // Đóng khi bấm phím Esc (trừ khi đang lưu)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  const allCodes = BCVH_LIST.map((b) => b.ma);
  const isAllSelected = allCodes.length > 0 && allCodes.every((c) => selectedCodes.includes(c));

  const handleToggleAll = () => {
    if (loading) return;
    if (isAllSelected) {
      setSelectedCodes([]);
    } else {
      setSelectedCodes([...allCodes]);
    }
  };

  const handleToggleCode = (code) => {
    if (loading) return;
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSave = async () => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await apiUpdateUserBcvh(user.id, selectedCodes);
      if (!res.ok) {
        if (res.status === 401 || res.status === 0 || !res.error) {
          setError('Phiên đăng nhập hết hạn hoặc mất kết nối. Đăng nhập lại rồi thử lại. Phân quyền cũ giữ nguyên.');
        } else {
          setError(res.error);
        }
        return;
      }
      onSuccess(user.id, res.data?.bcvh_codes ?? selectedCodes);
      onClose();
    } catch (_) {
      setError('Phiên đăng nhập hết hạn hoặc mất kết nối. Đăng nhập lại rồi thử lại. Phân quyền cũ giữ nguyên.');
    } finally {
      setLoading(false);
    }
  };

  const k = selectedCodes.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-bcvh-title"
        className="card-soft w-full max-w-[520px] rounded-[14px] border border-gray-200 border-t-4 border-t-amber-400 shadow-none overflow-hidden bg-white outline-none"
      >
        {/* Tiêu đề hộp */}
        <div className="p-5 border-b border-cream-line flex items-center justify-between bg-white">
          <div>
            <h3 id="assign-bcvh-title" className="hue-h2 text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-500" />
              <span>Gán BCVH cho GĐ BCVH</span>
            </h3>
            <div className="text-xs text-gray-500 mt-1">
              {user.full_name} · mã HRM {user.hrm_code}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Đóng"
            className="text-body hover:text-title cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {/* Mô tả */}
          <p className="text-xs text-gray-600 leading-relaxed bg-cream-light p-3 rounded-[10px] border border-gray-200">
            GĐ BCVH xem được số liệu mọi BCVH. <strong>BCVH được gán</strong> là nơi tài khoản này được <strong>nhập trạng thái phát</strong> và <strong>tải bảng kê kết quả phát</strong>.
          </p>

          {/* Nhãn và liên kết Chọn tất cả */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              CHỌN BCVH
            </span>
            <button
              type="button"
              onClick={handleToggleAll}
              disabled={loading}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer disabled:opacity-50"
            >
              {isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>

          {/* Danh sách 6 BCVH */}
          <div className="space-y-2">
            {BCVH_LIST.map((b) => {
              const isChecked = selectedCodes.includes(b.ma);
              const shortName = b.ten.replace(/^BCVH\s+/, '');
              return (
                <label
                  key={b.ma}
                  className={`flex items-center justify-between p-3 rounded-[10px] border transition-colors cursor-pointer text-xs ${
                    isChecked
                      ? 'bg-cream-light border-[#D9CBA8]'
                      : 'bg-white border-gray-200 hover:bg-cream-light/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleCode(b.ma)}
                      disabled={loading}
                      className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer accent-orange-600"
                    />
                    <span className="font-bold text-gray-800">{shortName}</span>
                  </div>
                  <span className="tabular-nums text-gray-500 font-medium">{b.ma}</span>
                </label>
              );
            })}
          </div>

          {/* Cảnh báo vàng khi k = 0 */}
          {k === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-[8px] text-xs font-medium leading-relaxed">
              Chưa chọn BCVH nào: tài khoản này sẽ <strong>chưa nhập được trạng thái phát</strong> và <strong>chưa tải được bảng kê</strong>. Vẫn xem được số liệu mọi BCVH.
            </div>
          )}

          {/* Bộ đếm */}
          <div className="text-xs text-gray-600 font-medium">
            Đã chọn <strong>{k}/6</strong> BCVH
          </div>

          {/* Trạng thái 1: Đang lưu */}
          {loading && (
            <div className="space-y-2">
              <div className="text-xs text-gray-700">
                Đang lưu phân quyền cho <strong>{user.full_name}</strong>…
              </div>
              <div className="progress-soft w-full overflow-hidden">
                <div className="progress-bar-soft w-full animate-pulse" />
              </div>
            </div>
          )}

          {/* Trạng thái 2: Lưu lỗi */}
          {error && (
            <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 space-y-2">
              <div>
                <strong>Không lưu được.</strong> {error}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-red-300 rounded text-red-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
                >
                  Thử lại
                </button>
              </div>
            </div>
          )}

          {/* Các nút Hủy và Lưu */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-cream-line">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="btn-primary px-5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
