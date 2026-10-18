import React from 'react';

export default function Header({ activeTab }) {
  // Helper function to get screen name
  const getScreenName = () => {
    switch (activeTab) {
      case 'ops_today': return 'Điều hành hôm nay';
      case 'arrivals': return 'Sản lượng đến';
      case 'processing': return 'Xử lý và tỷ lệ phát';
      case 'network': return 'Quản lý mạng lưới';
      case 'useradmin': return 'Quản lý người dùng';
      case 'replace_day': return 'Thay thế ngày';
      case 'nap_nguon': return 'Nạp dữ liệu nguồn';
      case 'tham_so': return 'Tham số hệ thống';
      default: return 'Trang chủ';
    }
  };

  return (
    <nav aria-label="breadcrumb" className="text-[13px] text-[#7A6A80] px-6 pt-[18px] mb-[14px]">
      <span>Trang</span>
      <span className="mx-1.5">/</span>
      <strong className="font-bold text-[#4A1D6E]">{getScreenName()}</strong>
    </nav>
  );
}
