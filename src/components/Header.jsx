import React from 'react';

export default function Header({ activeTab }) {

  // Helper function to get screen name
  const getScreenName = () => {
    switch(activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'ops_today': return 'Điều hành hôm nay';
      case 'arrivals': return 'Sản lượng đến';
      case 'network': return 'Quản lý mạng lưới';
      case 'useradmin': return 'Quản lý người dùng';
      default: return 'Trang chủ';
    }
  };

  return (
    <header className="h-[72px] px-6 flex items-center justify-between sticky top-0 z-10 bg-transparent">
      {/* Left side: Breadcrumbs & Title */}
      <div className="min-w-0 shrink flex-1 mr-4">
        <nav aria-label="breadcrumb">
          <ol className="flex items-center space-x-2 text-[14px] text-[var(--color-subtext)] whitespace-nowrap">
            <li>Trang</li>
            <li>/</li>
            <li className="text-[var(--color-title)] truncate" aria-current="page">{getScreenName()}</li>
          </ol>
        </nav>
        <h6 className="font-bold text-[var(--color-title)] mt-0.5 text-base whitespace-nowrap truncate">{getScreenName()}</h6>
      </div>

      {/* Right side: tên hệ thống */}
      <div className="hidden lg:block shrink-0 text-[13px] font-semibold text-[var(--color-body)] whitespace-nowrap">
        Hệ thống điều hành chất lượng - khâu Phát
      </div>
    </header>
  );
}
