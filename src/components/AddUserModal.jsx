import React, { useState } from 'react';
import { X, UserPlus, AlertCircle, Tv } from 'lucide-react';
import { apiFetchJson } from '../utils/api';
import { BCVH_LIST } from '../constants/bcvh';

const ROLE_OPTIONS = ['STAFF', 'TTVH', 'GDVH', 'ADMIN', 'TIVI'];
const ROLE_HINTS = {
  STAFF: ' (chỉ xem Dashboard, mặc định)',
  TTVH: ' (xem toàn bộ dữ liệu 6 BCVH)',
  GDVH: ' (xem toàn bộ dữ liệu 6 BCVH)',
  ADMIN: ' (toàn quyền)',
  TIVI: ' (chỉ xem dashboard tivi, không xuất file)',
};

const TIVI_SCOPE_OPTIONS = [
  { value: 'all', label: 'Toàn Trung tâm' },
  ...BCVH_LIST.map((b) => ({ value: b.ma, label: `${b.ten} (${b.ma})` })),
];

export default function AddUserModal({ onClose, onSuccess }) {
  const [hrmCode, setHrmCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('STAFF');
  const [tiviScope, setTiviScope] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isTivi = role === 'TIVI';

  const handleRoleChange = (e) => {
    setRole(e.target.value);
    // Xóa phạm vi nếu đổi khỏi TIVI
    if (e.target.value !== 'TIVI') setTiviScope('');
  };

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
    if (isTivi && !tiviScope) {
      setError('Chưa chọn phạm vi thì tivi không xem được dữ liệu');
      return;
    }

    setLoading(true);
    setError('');

    // CHỈ gửi tivi_scope khi vai trò là TIVI
    const body = {
      hrm_code: hrmCode.trim(),
      full_name: fullName.trim(),
      role,
      password,
      ...(isTivi ? { tivi_scope: tiviScope } : {}),
    };

    const result = await apiFetchJson('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (!result.ok) {
      // Hiển thị nguyên thông báo tiếng Việt từ API (400/403)
      setError(result.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="card-soft w-full max-w-md rounded-[14px] border border-gray-200 shadow-none overflow-hidden bg-white">
        <div className="p-5 border-b border-cream-line flex items-center justify-between bg-white">
          <h3 className="hue-h2 text-base flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-400" />
            <span>Thêm User Mới</span>
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
              onChange={handleRoleChange}
              className="w-full input-soft p-3 rounded-xl text-xs"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}{ROLE_HINTS[r]}</option>
              ))}
            </select>
          </div>

          {/* Ô phạm vi: CHỈ hiện khi vai trò là TIVI */}
          {isTivi && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
              <div className="flex items-center gap-2 text-blue-800">
                <Tv className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-[11px] uppercase">Phạm vi màn hình tivi</span>
              </div>
              <select
                value={tiviScope}
                onChange={(e) => setTiviScope(e.target.value)}
                className="w-full input-soft p-3 rounded-xl text-xs"
                required
              >
                <option value="">-- Chọn phạm vi --</option>
                {TIVI_SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {!tiviScope && (
                <p className="text-[11px] text-amber-700 font-medium">
                  ⚠ Chưa chọn phạm vi thì tivi không xem được dữ liệu.
                </p>
              )}
            </div>
          )}

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
              className="w-full py-3 rounded-[8px] bg-[#4A1D6E] text-white font-bold border-b-[3px] border-[#E0A82E] flex items-center justify-center gap-2 disabled:opacity-60 shadow-none transition-all cursor-pointer"
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
