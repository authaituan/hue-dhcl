import React, { useEffect, useState } from 'react';
import { UserCog, Plus, KeyRound, Pencil, Check, X, AlertCircle, ShieldAlert, UserX, UserCheck2, Lock, Tv, Building2 } from 'lucide-react';
import { apiFetchJson } from '../utils/api';
import { BCVH_LIST } from '../constants/bcvh';
import AddUserModal from './AddUserModal';
import ResetUserPasswordModal from './ResetUserPasswordModal';
import AssignBcvhModal from './AssignBcvhModal';

const ROLE_OPTIONS = ['TTVH', 'GDVH', 'ADMIN', 'TIVI'];

// Chuyển mã tivi_scope thành tên hiển thị dễ đọc
function formatTiviScope(scope) {
  if (!scope) return null;
  if (scope === 'all') return 'Toàn Trung tâm';
  const found = BCVH_LIST.find((b) => b.ma === scope);
  return found ? found.ten : scope;
}

// Danh sách lựa chọn phạm vi cho TIVI
const TIVI_SCOPE_OPTIONS = [
  { value: 'all', label: 'Toàn Trung tâm' },
  ...BCVH_LIST.map((b) => ({ value: b.ma, label: `${b.ten} (${b.ma})` })),
];

// Định dạng hiển thị cột «BCVH ĐƯỢC GIAO» theo vai trò
function formatBcvhAssigned(u) {
  if (u.role === 'ADMIN' || u.role === 'TTVH') {
    return <span className="text-subtext text-xs">Tất cả (theo vai trò)</span>;
  }
  if (u.role === 'TIVI') {
    const scopeLabel = u.tivi_scope === 'all'
      ? 'toàn Trung tâm'
      : (BCVH_LIST.find((b) => b.ma === u.tivi_scope)?.ten?.replace(/^BCVH\s+/, '') || u.tivi_scope || 'toàn Trung tâm');
    return <span className="text-subtext text-xs">Phạm vi Tivi: {scopeLabel}</span>;
  }
  if (u.role === 'GDVH') {
    const codes = u.bcvh_codes || [];
    if (codes.length === 0) {
      return <span className="text-red-600 font-medium text-xs">Chưa gán BCVH nào</span>;
    }
    if (codes.length === 6) {
      return <span className="text-title font-semibold text-xs">6 BCVH (tất cả)</span>;
    }
    const names = codes.map((c) => {
      const found = BCVH_LIST.find((b) => b.ma === c);
      return found ? found.ten.replace(/^BCVH\s+/, '') : c;
    });
    return (
      <span className="text-title font-semibold text-xs">
        {codes.length} BCVH: {names.join(', ')}
      </span>
    );
  }
  return <span className="text-subtext text-xs">—</span>;
}

export default function UserAdminView({ authUser }) {
  const isAdmin = authUser?.role === 'ADMIN';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [assignBcvhTarget, setAssignBcvhTarget] = useState(null);

  // Sửa thông tin inline (họ tên + role + tivi_scope cùng lúc)
  const [editingId, setEditingId] = useState(null);
  const [editingFullName, setEditingFullName] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [editingTiviScope, setEditingTiviScope] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveError, setEditSaveError] = useState('');

  // Vô hiệu hoá / Kích hoạt lại
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const fetchUsers = () => {
    setLoading(true);
    setError('');
    apiFetchJson('/api/users').then((result) => {
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsers(Array.isArray(result.data) ? result.data : []);
    });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAssignBcvhSuccess = (userId, newCodes) => {
    setUsers((prevUsers) =>
      prevUsers.map((u) => (u.id === userId ? { ...u, bcvh_codes: newCodes } : u))
    );
    setAssignBcvhTarget(null);
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditingFullName(user.full_name || '');
    setEditingRole(user.role || '');
    // Nạp phạm vi hiện tại nếu là TIVI
    setEditingTiviScope(user.tivi_scope || '');
    setEditSaveError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSaveError('');
  };

  const handleEditRoleChange = (e) => {
    setEditingRole(e.target.value);
    // Xóa phạm vi khi đổi khỏi TIVI
    if (e.target.value !== 'TIVI') setEditingTiviScope('');
  };

  const saveEdit = async (userId) => {
    if (!editingFullName.trim()) {
      setEditSaveError('Họ và Tên không được để trống');
      return;
    }
    if (editingRole === 'TIVI' && !editingTiviScope) {
      setEditSaveError('Chưa chọn phạm vi thì tivi không xem được dữ liệu');
      return;
    }
    setEditSaving(true);
    setEditSaveError('');

    // CHỈ gửi tivi_scope khi vai trò mới là TIVI; vai trò khác không gửi khoá này
    const body = {
      full_name: editingFullName.trim(),
      role: editingRole,
      ...(editingRole === 'TIVI' ? { tivi_scope: editingTiviScope } : {}),
    };

    const result = await apiFetchJson(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setEditSaving(false);
    if (!result.ok) {
      // Hiện nguyên thông báo tiếng Việt từ API (400/403)
      setEditSaveError(result.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      return;
    }
    setEditingId(null);
    fetchUsers();
  };

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Xác nhận vô hiệu hoá tài khoản "${user.full_name}" (${user.hrm_code})? Tài khoản này sẽ không đăng nhập được nữa cho tới khi được kích hoạt lại.`)) {
      return;
    }
    setActionLoadingId(user.id);
    setActionError('');

    const result = await apiFetchJson(`/api/users/${user.id}/deactivate`, { method: 'PUT' });

    setActionLoadingId(null);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    fetchUsers();
  };

  const handleReactivate = async (user) => {
    setActionLoadingId(user.id);
    setActionError('');

    const result = await apiFetchJson(`/api/users/${user.id}/reactivate`, { method: 'PUT' });

    setActionLoadingId(null);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    fetchUsers();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="card-soft p-5 rounded-[14px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="hue-h1 text-2xl flex items-center gap-2">
            <UserCog className="w-5 h-5 text-orange-400" />
            <span>Quản Lý Người Dùng</span>
          </h1>
          <p className="text-xs text-body mt-1">
            Tạo tài khoản, sửa thông tin/phân quyền, reset mật khẩu, vô hiệu hoá/kích hoạt lại tài khoản.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-bold text-white bg-[#4A1D6E] border-b-[3px] border-[#E0A82E] transition-all shadow-none"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm User</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="card-soft rounded-[14px] overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
            <p className="text-xs text-body">Đang nạp danh sách người dùng...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-body">
            <UserCog className="w-12 h-12 mx-auto text-body mb-3" />
            <p className="font-semibold text-sm text-title">Chưa có tài khoản người dùng nào</p>
            <p className="text-xs text-subtext mt-1">Bấm "Thêm User" để tạo tài khoản đầu tiên</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-cream-head text-gray-600 font-bold border-b border-cream-line uppercase tracking-wider text-[12px]">
                  <th className="py-3.5 px-4">Mã HRM</th>
                  <th className="py-3.5 px-4">Họ Và Tên</th>
                  <th className="py-3.5 px-4">Vai Trò (Role)</th>
                  <th className="py-3.5 px-4">BCVH ĐƯỢC GIAO</th>
                  <th className="py-3.5 px-4">Trạng Thái</th>
                  <th className="py-3.5 px-4">Ngày Tạo</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-line">
                {users.map((u) => {
                  const isSelf = authUser && u.id === authUser.id;
                  const isEditing = editingId === u.id;
                  const isDeactivated = !!u.deactivated_at;
                  const isActionLoading = actionLoadingId === u.id;
                  const isTiviUser = u.role === 'TIVI';
                  const isEditingTivi = editingRole === 'TIVI';

                  return (
                    <tr key={u.id} className={`hover:bg-cream-light/50 transition-colors ${isDeactivated ? 'opacity-60' : ''}`}>
                      <td className="py-3.5 px-4 tabular-nums text-orange-600 font-semibold">{u.hrm_code}</td>

                      {/* Họ Và Tên — sửa inline cùng với Role */}
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingFullName}
                            onChange={(e) => setEditingFullName(e.target.value)}
                            className="input-soft px-2 py-1.5 rounded-lg text-xs w-full min-w-[140px]"
                            autoFocus
                          />
                        ) : (
                          <>
                            <div className="font-semibold text-title">{u.full_name}</div>
                            {isSelf && (
                              <div className="text-[10px] text-orange-600 font-medium mt-0.5">(Tài khoản của bạn)</div>
                            )}
                          </>
                        )}
                      </td>

                      {/* Vai Trò (Role) + phạm vi TIVI */}
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <>
                            <select
                              value={editingRole}
                              onChange={handleEditRoleChange}
                              disabled={isSelf}
                              title={isSelf ? 'Không thể tự đổi quyền của chính mình' : ''}
                              className="input-soft px-2 py-1.5 rounded-lg text-xs disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            {isSelf && (
                              <div className="text-[10px] text-subtext mt-1">Không thể tự đổi quyền của chính mình</div>
                            )}
                            {/* Ô phạm vi TIVI — chỉ hiện khi đang chọn TIVI */}
                            {isEditingTivi && (
                              <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-blue-700">
                                  <Tv className="w-3.5 h-3.5" />
                                  <span className="font-semibold text-[10px] uppercase">Phạm vi tivi</span>
                                </div>
                                <select
                                  value={editingTiviScope}
                                  onChange={(e) => setEditingTiviScope(e.target.value)}
                                  className="w-full input-soft px-2 py-1.5 rounded-lg text-xs"
                                >
                                  <option value="">-- Chọn phạm vi --</option>
                                  {TIVI_SCOPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                {!editingTiviScope && (
                                  <p className="text-[10px] text-amber-700 font-medium">
                                    ⚠ Chưa chọn phạm vi thì tivi không xem được dữ liệu.
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          // Hiển thị vai trò + phạm vi (nếu TIVI)
                          <div className="space-y-1">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1 ${
                              u.role === 'TIVI'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-orange-50 text-orange-600 border-orange-200'
                            }`}>
                              {u.role === 'TIVI' && <Tv className="w-3 h-3" />}
                              {u.role}
                            </span>
                            {/* Phạm vi cho TIVI */}
                            {isTiviUser && (
                              u.tivi_scope ? (
                                <div className="text-[10px] text-blue-700 font-medium">
                                  {formatTiviScope(u.tivi_scope)}
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 inline-block">
                                  Chưa gán phạm vi
                                </span>
                              )
                            )}
                          </div>
                        )}
                        {isEditing && editSaveError && (
                          <div className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 shrink-0" />
                            <span>{editSaveError}</span>
                          </div>
                        )}
                      </td>

                      {/* BCVH ĐƯỢC GIAO */}
                      <td className="py-3.5 px-4">
                        {formatBcvhAssigned(u)}
                      </td>

                      {/* Trạng Thái */}
                      <td className="py-3.5 px-4">
                        {isDeactivated ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-red-50 text-red-700 border-red-200 flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3" />
                            <span>Đã khoá</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 w-fit inline-block">
                            Đang hoạt động
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-body">{u.created_at}</td>

                      {/* Thao Tác */}
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveEdit(u.id)}
                              disabled={editSaving}
                              title="Lưu"
                              className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              title="Hủy"
                              className="w-7 h-7 rounded-lg bg-white text-title border border-gray-200 hover:bg-gray-100 flex items-center justify-center"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {isAdmin && u.role === 'GDVH' && (
                              <button
                                type="button"
                                onClick={() => setAssignBcvhTarget(u)}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-orange-50 hover:text-orange-600 text-title transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Building2 className="w-3.5 h-3.5" />
                                <span>Gán BCVH</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-orange-50 hover:text-orange-600 text-title transition-all text-xs font-semibold flex items-center gap-1"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Sửa vai trò</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetPasswordTarget(u)}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-yellow-50 hover:text-yellow-600 text-title transition-all text-xs font-semibold flex items-center gap-1"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Reset Mật Khẩu</span>
                            </button>
                            {isDeactivated ? (
                              <button
                                type="button"
                                onClick={() => handleReactivate(u)}
                                disabled={isActionLoading}
                                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                              >
                                <UserCheck2 className="w-3.5 h-3.5" />
                                <span>{isActionLoading ? 'Đang Xử Lý...' : 'Kích Hoạt Lại'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDeactivate(u)}
                                disabled={isSelf || isActionLoading}
                                title={isSelf ? 'Không thể tự vô hiệu hoá chính tài khoản đang đăng nhập' : ''}
                                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all text-xs font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>{isActionLoading ? 'Đang Xử Lý...' : 'Vô Hiệu Hoá'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-cream-line bg-cream-foot text-xs text-gray-600">
          Tổng cộng <span className="font-bold text-[#4A1D6E]">{users.length}</span> tài khoản người dùng.
        </div>
      </div>

      {isAddModalOpen && (
        <AddUserModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={fetchUsers}
        />
      )}

      {resetPasswordTarget && (
        <ResetUserPasswordModal
          user={resetPasswordTarget}
          onClose={() => setResetPasswordTarget(null)}
          onSuccess={() => setResetPasswordTarget(null)}
        />
      )}

      {assignBcvhTarget && (
        <AssignBcvhModal
          user={assignBcvhTarget}
          onClose={() => setAssignBcvhTarget(null)}
          onSuccess={handleAssignBcvhSuccess}
        />
      )}
    </div>
  );
}
