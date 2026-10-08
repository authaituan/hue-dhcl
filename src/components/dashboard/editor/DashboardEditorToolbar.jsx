import React from 'react';
import { Settings, Plus, RotateCcw, Check } from 'lucide-react';

export function DashboardEditorToolbar({ 
  isEditMode, 
  onToggleEditMode, 
  onAddWidget, 
  onResetDefault,
  canAddMore
}) {
  if (!isEditMode) {
    return (
      <div className="flex justify-end mb-6">
        <button
          onClick={onToggleEditMode}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC4A0A] hover:bg-[#B83F08] text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Settings className="w-4 h-4" />
          Tuỳ chỉnh Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-[12px] shadow-[0_20px_27px_rgba(0,0,0,.05)] border border-gray-100">
      <div>
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#F97316]" />
          Chế độ chỉnh sửa Dashboard
        </h2>
        <p className="text-sm text-gray-500 mt-1">Thay đổi sẽ áp dụng cho tất cả người dùng hệ thống.</p>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onAddWidget}
          disabled={!canAddMore}
          title={!canAddMore ? "Đã đạt số lượng biểu đồ tối đa" : ""}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 text-[#CC4A0A]" />
          Thêm biểu đồ
        </button>
        <button
          onClick={onResetDefault}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4 text-gray-500" />
          Khôi phục mặc định
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1"></div>
        <button
          onClick={onToggleEditMode}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#CC4A0A] hover:bg-[#B83F08] text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Check className="w-4 h-4" />
          Xong
        </button>
      </div>
    </div>
  );
}
