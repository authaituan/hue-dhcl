import React, { useState } from 'react';
import {
  LayoutDashboard,
  Network,
  UserCog,
  Lock,
  LogOut
} from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

export default function Sidebar({ activeTab, setActiveTab, authUser, onLogout }) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  if (authUser?.role !== 'STAFF') {
    navItems.push({ id: 'network', label: 'Quản lý mạng lưới', icon: Network });
    navItems.push({ id: 'useradmin', label: 'Quản lý người dùng', icon: UserCog });
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
                  onClick={() => setActiveTab(item.id)}
                  className={`nav-item w-full flex items-center justify-between ${isActive ? 'active' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="icon-sm shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[14px] whitespace-nowrap text-left truncate">{item.label}</span>
                  </div>
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
                {authUser?.role === 'STAFF' ? 'Nhân viên (chỉ xem)' : 'Quản lý'}
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
