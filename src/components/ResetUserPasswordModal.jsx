import React, { useState } from 'react';
import { X, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetchJson } from '../utils/api';

// Modal reset mật khẩu cho user KHÁC (dùng bởi role quản lý) — KHÔNG cần biết
// mật khẩu cũ, chỉ nhập mật khẩu mới 2 lần để xác nhận khớp nhau.
export default function ResetUserPasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
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

    const result = await apiFetchJson(`/api/users/${user.id}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-md rounded-2xl border border-gray-200 shadow-soft overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white">
          <h3 className="font-bold text-base text-[--color-title] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#EAB308]" />
            <span>Reset Mật Khẩu</span>
          </h3>
          <button onClick={onClose} className="text-[--color-body] hover:text-[--color-title]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[--color-title]">
            Đặt lại mật khẩu cho: <span className="font-bold text-[--color-title]">{user.full_name}</span>{' '}
            <span className="font-mono text-orange-400">({user.hrm_code})</span>. Không cần biết mật khẩu cũ.
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Đặt lại mật khẩu thành công!</span>
            </div>
          )}

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
              autoFocus
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
              className="btn btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Đang Đặt Lại...' : success ? 'Đã Xong' : 'ĐẶT LẠI MẬT KHẨU'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
