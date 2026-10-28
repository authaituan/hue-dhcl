import React, { useState } from 'react';
import KttLuuThoat from './KttLuuThoat';
import KttDiCungNgay from './KttDiCungNgay';
import KttLichXe from './KttLichXe';
import KttErrorBoundary from './KttErrorBoundary';

export default function KttView({ authUser }) {
  const [activeTab, setActiveTab] = useState('luu_thoat');

  const tabs = [
    { id: 'luu_thoat', label: 'Lưu thoát trong ngày' },
    { id: 'b_ty_le', label: 'B · Tỷ lệ đi cùng ngày' },
    { id: 'b_lich_xe', label: 'B · Lịch xe, đường thư' },
  ];

  return (
    <div className="space-y-1 max-w-full min-w-0">
      {/* Thanh tab gạch chân theo mẫu ArrivalsView.jsx:300-316 */}
      <div className="px-6 pt-2 max-w-full overflow-hidden">
        <div className="border-b border-[#E4D5AE] overflow-x-auto">
          <nav className="-mb-px flex space-x-8 min-w-max" aria-label="Tabs Hàng tại KTT">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-[3px] text-sm transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-amber-400 text-orange-600 font-bold'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {activeTab === 'luu_thoat' && (
        <KttErrorBoundary>
          <KttLuuThoat authUser={authUser} />
        </KttErrorBoundary>
      )}

      {activeTab === 'b_ty_le' && (
        <KttErrorBoundary>
          <KttDiCungNgay authUser={authUser} />
        </KttErrorBoundary>
      )}

      {activeTab === 'b_lich_xe' && (
        <KttErrorBoundary>
          <KttLichXe authUser={authUser} />
        </KttErrorBoundary>
      )}
    </div>
  );
}

