import React, { useState, useEffect, useRef } from 'react';
import { Lock, LogOut } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

const ROLE_LABELS = {
  ADMIN: 'ADMIN (quản trị)',
  TTVH: 'TTVH',
  GDVH: 'GDVH',
};

const ADMIN_ITEMS = [
  {
    id: 'network',
    label: 'Quản lý mạng lưới',
    iconPath: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="5" cy="19" r="2.5" />
        <circle cx="19" cy="19" r="2.5" />
        <path d="M12 7.5v4M12 11.5l-5.5 5.5M12 11.5l5.5 5.5" />
      </>
    ),
  },
  {
    id: 'useradmin',
    label: 'Quản lý người dùng',
    iconPath: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3 2.7 3 5" />
      </>
    ),
  },
  {
    id: 'replace_day',
    label: 'Thay thế ngày',
    iconPath: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h6" />,
  },
  {
    id: 'nap_nguon',
    label: 'Nạp dữ liệu nguồn',
    iconPath: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  },
  {
    id: 'tham_so',
    label: 'Tham số hệ thống',
    iconPath: (
      <>
        <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
        <circle cx="15" cy="7" r="2.5" />
        <circle cx="9" cy="17" r="2.5" />
      </>
    ),
  },
];

export default function TopNav({ activeTab, setActiveTab, authUser, onLogout }) {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const adminMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  const isViewer = ['ADMIN', 'TTVH', 'GDVH'].includes(authUser?.role);
  const isAdmin = authUser?.role === 'ADMIN';

  const adminTabIds = ['network', 'useradmin', 'replace_day', 'nap_nguon', 'tham_so'];
  const isAdminTabActive = adminTabIds.includes(activeTab);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setIsAdminMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsAdminMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const userInitial = authUser?.full_name?.charAt(0) || authUser?.hrm_code?.charAt(0) || 'U';
  const userName = authUser?.full_name || authUser?.hrm_code || 'Người dùng';
  const userRole = ROLE_LABELS[authUser?.role] || authUser?.role || '';

  return (
    <>
      <header className="bg-[#4A1D6E] text-white px-[28px] flex items-center gap-6 max-[1365px]:gap-3 min-h-[64px] border-b-4 border-[#E0A82E] shadow-none flex-none relative z-30 select-none">
      {/* Brand (Trái) */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-[36px] h-[36px] rounded-[8px] bg-[#2A1B33] flex items-center justify-center shrink-0">
          <img src="/logo-vnpost.png" alt="Vietnam Post" className="w-[24px] object-contain" />
        </div>
        <span className="font-serif font-bold text-[11px] leading-[14px] text-white tracking-[0.02em] whitespace-nowrap">
          GIÁM SÁT HÀNG ĐẾN<br />VÀ CHẤT LƯỢNG PHÁT
        </span>
      </div>

      {/* Các tab (Giữa) */}
      <nav aria-label="Main Navigation" className="flex-1 min-w-0 flex items-center flex-nowrap gap-[2px]">
        {/* Tab 1: Điều hành hôm nay */}
        {isViewer && (
          <button
            id="nav-ops_today"
            type="button"
            onClick={() => setActiveTab('ops_today')}
            className={`whitespace-nowrap py-[10px] px-[13px] max-[1439px]:px-[10px] rounded-[10px] flex items-center justify-center gap-2 font-serif font-bold text-[15px] max-[1365px]:text-[14px] tracking-[0.01em] cursor-pointer transition-colors ${
              activeTab === 'ops_today' || activeTab === 'dashboard'
                ? 'bg-[#E0A82E] text-[#3B1450]'
                : 'text-[#E6D6F2] hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${
                activeTab === 'ops_today' || activeTab === 'dashboard' ? 'text-[#3B1450]' : 'text-[#E0A82E]'
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 17a8 8 0 1 1 16 0M12 17l4-5M3 20h18" />
            </svg>
            <span>Điều hành hôm nay</span>
          </button>
        )}

        {/* Tab 2: Sản lượng đến */}
        {isViewer && (
          <button
            id="nav-arrivals"
            type="button"
            onClick={() => setActiveTab('arrivals')}
            className={`whitespace-nowrap py-[10px] px-[13px] max-[1439px]:px-[10px] rounded-[10px] flex items-center justify-center gap-2 font-serif font-bold text-[15px] max-[1365px]:text-[14px] tracking-[0.01em] cursor-pointer transition-colors ${
              activeTab === 'arrivals'
                ? 'bg-[#E0A82E] text-[#3B1450]'
                : 'text-[#E6D6F2] hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === 'arrivals' ? 'text-[#3B1450]' : 'text-[#E0A82E]'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />
            </svg>
            <span>Sản lượng đến</span>
          </button>
        )}

        {/* Tab 3: Xử lý và tỷ lệ phát */}
        {isViewer && (
          <button
            id="nav-processing"
            type="button"
            onClick={() => setActiveTab('processing')}
            className={`whitespace-nowrap py-[10px] px-[13px] max-[1439px]:px-[10px] rounded-[10px] flex items-center justify-center gap-2 font-serif font-bold text-[15px] max-[1365px]:text-[14px] tracking-[0.01em] cursor-pointer transition-colors ${
              activeTab === 'processing'
                ? 'bg-[#E0A82E] text-[#3B1450]'
                : 'text-[#E6D6F2] hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === 'processing' ? 'text-[#3B1450]' : 'text-[#E0A82E]'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />
            </svg>
            <span>Xử lý và tỷ lệ phát</span>
          </button>
        )}

        {/* Tab 4: Quản trị ▾ (chỉ hiện khi isAdmin) */}
        {isAdmin && (
          <div className="relative shrink-0" ref={adminMenuRef}>
            <button
              id="nav-admin-menu"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAdminMenuOpen}
              onClick={() => {
                setIsAdminMenuOpen((prev) => !prev);
                setIsUserMenuOpen(false);
              }}
              className={`whitespace-nowrap py-[10px] px-[13px] max-[1439px]:px-[10px] rounded-[10px] flex items-center justify-center gap-2 font-serif font-bold text-[15px] max-[1365px]:text-[14px] tracking-[0.01em] cursor-pointer transition-colors ${
                isAdminTabActive
                  ? 'bg-[#E0A82E] text-[#3B1450]'
                  : isAdminMenuOpen
                  ? 'bg-white/[0.14] text-white'
                  : 'text-[#E6D6F2] hover:bg-white/10 hover:text-white'
              }`}
            >
              <svg
                className={`w-5 h-5 shrink-0 ${isAdminTabActive ? 'text-[#3B1450]' : 'text-[#E0A82E]'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" />
              </svg>
              <span>Quản trị</span>
              <span className={`text-[11px] leading-none ${isAdminTabActive ? 'text-[#3B1450]' : 'text-[#E0A82E]'}`}>
                ▾
              </span>
            </button>

            {/* Bảng thả Quản trị */}
            {isAdminMenuOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 mt-[10px] bg-white border border-[#E4D5AE] border-t-[3px] border-t-[#E0A82E] rounded-[12px] min-w-[250px] p-[6px] shadow-none z-50 flex flex-col gap-1"
              >
                {ADMIN_ITEMS.map((item) => {
                  const isItemActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`nav-${item.id}`}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsAdminMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] font-sans font-semibold text-[14px] transition-colors text-left cursor-pointer ${
                        isItemActive
                          ? 'bg-[#F6F1E7] text-[#4A1D6E]'
                          : 'text-[#2A1B33] hover:bg-[#F6F1E7]'
                      }`}
                    >
                      <svg
                        className={`w-5 h-5 shrink-0 ${isItemActive ? 'text-[#4A1D6E]' : 'text-[#6B2F94]'}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {item.iconPath}
                      </svg>
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Avatar (Phải) */}
      <div className="relative shrink-0" ref={userMenuRef}>
        <button
          id="nav-user-menu"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isUserMenuOpen}
          onClick={() => {
            setIsUserMenuOpen((prev) => !prev);
            setIsAdminMenuOpen(false);
          }}
          className="flex items-center gap-2.5 p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A82E]"
        >
          <div className="w-[34px] h-[34px] rounded-full bg-[#6B2F94] flex items-center justify-center font-bold text-[#E0A82E] text-[14px] shrink-0">
            {userInitial}
          </div>
          <span className="text-white text-[13px] font-semibold truncate max-w-[160px] max-[1365px]:hidden">
            {userName}
          </span>
          <span className="text-[11px] text-[#E0A82E]">▾</span>
        </button>

        {/* Bảng thả Avatar */}
        {isUserMenuOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 mt-[10px] bg-white border border-[#E4D5AE] border-t-[3px] border-t-[#E0A82E] rounded-[12px] min-w-[240px] p-[6px] shadow-none z-50 flex flex-col gap-1"
          >
            <div className="px-[12px] py-[10px] border-b border-[#E4D5AE]/60 mb-[2px]">
              <div className="font-sans font-bold text-[13px] text-[#2A1B33] truncate">
                {userName}
              </div>
              <div className="font-sans text-[11px] text-[#7A6A80] font-medium mt-0.5 truncate">
                {userRole}
              </div>
            </div>

            <button
              id="btn-change-password"
              type="button"
              role="menuitem"
              onClick={() => {
                setIsUserMenuOpen(false);
                setIsChangePasswordOpen(true);
              }}
              className="w-full flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] font-sans font-semibold text-[14px] text-[#2A1B33] hover:bg-[#F6F1E7] transition-colors text-left cursor-pointer"
            >
              <Lock className="w-5 h-5 text-[#6B2F94] shrink-0" />
              <span>Đổi mật khẩu</span>
            </button>

            <button
              id="btn-logout"
              type="button"
              role="menuitem"
              onClick={() => {
                setIsUserMenuOpen(false);
                onLogout?.();
              }}
              className="w-full flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] font-sans font-semibold text-[14px] text-[#2A1B33] hover:bg-[#F6F1E7] transition-colors text-left cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-[#6B2F94] shrink-0" />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>
    </header>

    {/* Modal Đổi mật khẩu */}
    {isChangePasswordOpen && (
      <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
    )}
  </>
);
}
