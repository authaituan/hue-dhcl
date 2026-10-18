import React, { useState } from 'react';
import {
  Network,
  UserCog,
  Lock,
  LogOut,
  Package,
  Activity,
  Gauge,
  RefreshCw,
  Server,
  SlidersHorizontal
} from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

const ROLE_LABELS = { ADMIN: 'ADMIN (quản trị)', TTVH: 'TTVH', GDVH: 'GDVH', STAFF: 'STAFF (chỉ xem)' };

export default function Sidebar({ activeTab, setActiveTab, authUser, onLogout }) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const navItems = [];

  const isViewer = ['ADMIN', 'TTVH', 'GDVH'].includes(authUser?.role);
  const isAdmin = authUser?.role === 'ADMIN';

  if (isViewer) {
    navItems.push({ id: 'ops_today', label: 'Điều hành hôm nay', icon: Gauge, title: 'Cần điều hành ngay hôm nay' });
    navItems.push({ id: 'arrivals', label: 'Sản lượng đến', icon: Package, title: 'Dữ liệu sản lượng đến' });
    navItems.push({ id: 'processing', label: 'Xử lý và tỷ lệ phát', icon: Activity, title: 'Xử lý và tỷ lệ phát' });
  }

  if (isAdmin) {
    navItems.push({ id: 'useradmin', label: 'Quản lý người dùng', icon: UserCog });
    navItems.push({ id: 'network', label: 'Quản lý mạng lưới', icon: Network });
    navItems.push({ id: 'replace_day', label: 'Thay thế ngày', icon: RefreshCw, title: 'Thay thế ngày của một BCVH' });
    navItems.push({ id: 'nap_nguon', label: 'Nạp dữ liệu nguồn', icon: Server, title: 'Nạp dữ liệu nguồn' });
    navItems.push({ id: 'tham_so', label: 'Tham số hệ thống', icon: SlidersHorizontal, title: 'Cấu hình tham số hệ thống' });
  }

  return (
    <aside className="w-[250px] bg-transparent flex flex-col h-[calc(100vh-2rem)] sticky top-0 z-20 my-4 ml-4">
      {/* Brand Header */}
      <div className="shrink-0 h-16 px-6 flex items-center gap-3">
        <div className="w-[42px] h-[32px] rounded-[8px] bg-[#27272A] flex items-center justify-center shrink-0">
          <img src="/logo-vnpost.png" alt="Vietnam Post" className="w-[27px] object-contain" />
        </div>
        <span className="login-montserrat font-[800] text-[15px] tracking-[0.06em] text-[var(--color-title)] leading-none uppercase">ĐHCL · Khâu Phát</span>
      </div>
        
      <hr className="shrink-0 h-px mt-0 bg-transparent bg-gradient-to-r from-transparent via-black/10 to-transparent border-none" />

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto min-h-0 nav-scrollbar pr-1">
        <nav className="p-3 space-y-1.5 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <div key={item.id} className="flex flex-col">
                <button
                  id={`nav-${item.id}`}
                  onClick={() => !item.disabled && setActiveTab(item.id)}
                  className={`nav-item w-full flex items-center justify-between ${isActive ? 'active' : ''} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={item.disabled}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="icon-sm shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span 
                      className="text-[14px] whitespace-nowrap text-left truncate"
                      title={item.title}
                    >
                      {item.label}
                    </span>
                  </div>
                  {item.disabled && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                      Sắp có
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Card */}
      <div className="shrink-0 p-4">
        <div className="card-soft p-4">
          {/* Row 1 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 shrink-0 rounded-full bg-[#CC4A0A] flex items-center justify-center font-bold text-white text-[14px]">
              {authUser?.full_name?.charAt(0) || authUser?.hrm_code?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[var(--color-title)] truncate">
                {authUser?.full_name || authUser?.hrm_code || 'Người dùng'}
              </div>
              <div className="text-[11px] text-[var(--color-subtext)] font-medium mt-0.5 truncate">
                {ROLE_LABELS[authUser?.role] || authUser?.role || ''}
              </div>
            </div>
          </div>
          {/* Row 2 */}
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-[var(--color-body)] transition-colors hover:bg-orange-50 hover:text-[#CC4A0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC4A0A]/50"
              title="Đổi mật khẩu"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="truncate">Đổi mật khẩu</span>
            </button>
            <button 
              type="button"
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-[var(--color-body)] transition-colors hover:bg-orange-50 hover:text-[#CC4A0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC4A0A]/50"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="truncate">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>

      {isChangePasswordOpen && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}
    </aside>
  );
}
