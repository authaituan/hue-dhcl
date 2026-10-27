import React, { useState } from 'react';
import KttLuuThoat from './KttLuuThoat';

export default function KttView({ authUser }) {
  const [activeTab, setActiveTab] = useState('luu_thoat');

  const tabs = [
    { id: 'luu_thoat', label: 'Lưu thoát trong ngày' },
  ];

  return (
    <div className="space-y-1">
      {/* Thanh tab gạch chân theo mẫu ArrivalsView.jsx:300-316 */}
      <div className="px-6 pt-2">
        <div className="border-b border-[#E4D5AE]">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs Hàng tại KTT">
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

      {activeTab === 'luu_thoat' && <KttLuuThoat authUser={authUser} />}
    </div>
  );
}
