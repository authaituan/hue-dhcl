import React, { useState } from 'react';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import { apiFetchJson } from '../utils/api';

const ROLE_OPTIONS = ['STAFF', 'ADMIN', 'MANAGER'];

export default function AddUserModal({ onClose, onSuccess }) {
  const [hrmCode, setHrmCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('STAFF');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hrmCode.trim() || !fullName.trim()) {
      setError('Vui lòng nhập đầy đủ Mã HRM và Họ và Tên');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    setLoading(true);
    setError('');

    const result = await apiFetchJson('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hrm_code: hrmCode.trim(),
        full_name: fullName.trim(),
        role,
        password
      })
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-md rounded-2xl border border-gray-200 shadow-soft overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-white">
          <h3 className="font-bold text-base text-[--color-title] flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-400" />
            <span>Thêm User Mới</span>
          </h3>
          <button onClick={onClose} className="text-[--color-body] hover:text-[--color-title]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Mã HRM
            </label>
            <input
              type="text"
              value={hrmCode}
              onChange={(e) => setHrmCode(e.target.value)}
              placeholder="Ví dụ: HRM-53010"
              className="w-full input-soft p-3 rounded-xl text-xs"
              autoFocus
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Họ Và Tên
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full input-soft p-3 rounded-xl text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Vai Trò (Role)
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full input-soft p-3 rounded-xl text-xs"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}{r === 'STAFF' ? ' (chỉ xem, mặc định)' : ' (được ghi/quản lý)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[--color-title] uppercase mb-1">
              Mật Khẩu Ban Đầu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="w-full input-soft p-3 rounded-xl text-xs"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Đang Tạo...' : 'TẠO TÀI KHOẢN'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
