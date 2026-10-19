import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetchJson } from '../utils/api';

// Modal tự đổi mật khẩu của CHÍNH MÌNH — cho MỌI user đã đăng nhập, kể cả
// STAFF (route PUT /api/users/me/password chỉ cần authRequired, không cần
// requireManager). Bắt buộc nhập đúng mật khẩu hiện tại trước khi đổi.
export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu mới');
      return;
    }

    setLoading(true);
    setError('');

    const result = await apiFetchJson('/api/users/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  // Render qua Portal thẳng vào document.body: nút mở modal này nằm trong
  // <header> (có backdrop-filter tạo containing
  // block mới cho position:fixed), nếu không dùng Portal thì modal sẽ bị
  // "fixed" tương đối với <header> (cao 64px) thay vì toàn viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-md rounded-[14px] border border-gray-200 shadow-none overflow-hidden bg-white">
        <div className="p-5 border-b border-cream-line flex items-center justify-between bg-white">
          <h3 className="hue-h2 text-base flex items-center gap-2">
            <Lock className="w-5 h-5 text-orange-400" />
            <span>Đổi Mật Khẩu Của Tôi</span>
          </h3>
          <button onClick={onClose} className="text-[--color-body] hover:text-[--color-title]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Đổi mật khẩu thành công!</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Mật Khẩu Hiện Tại
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu đang dùng"
              className="w-full input-soft p-3 rounded-xl text-xs"
              autoFocus
              autoComplete="current-password"
              required
              disabled={success}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Mật Khẩu Mới
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="w-full input-soft p-3 rounded-xl text-xs"
              autoComplete="new-password"
              required
              disabled={success}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Xác Nhận Mật Khẩu Mới
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full input-soft p-3 rounded-xl text-xs"
              autoComplete="new-password"
              required
              disabled={success}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-3 rounded-[8px] bg-[#4A1D6E] text-white font-bold border-b-[3px] border-[#E0A82E] flex items-center justify-center gap-2 disabled:opacity-60 shadow-none transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Đang Đổi...' : success ? 'Đã Xong' : 'ĐỔI MẬT KHẨU'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
