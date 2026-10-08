import React from 'react';
import { Edit2, Eye, EyeOff, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

export function WidgetToolbar({ 
  widget, 
  onEdit, 
  onToggleVisible, 
  onMoveUp, 
  onMoveDown, 
  onDelete,
  isFirst,
  isLast,
  children 
}) {
  const isHidden = !widget.visible;

  return (
    <div className={`relative h-full transition-opacity duration-300 ${isHidden ? 'opacity-50' : ''}`}>
      {/* Editor overlay for hidden state */}
      {isHidden && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-800/80 text-white px-4 py-2 rounded-lg font-bold shadow-lg">
            Đang ẩn
          </div>
        </div>
      )}

      {/* Widget Content */}
      <div className={isHidden ? 'pointer-events-none' : ''}>
        {children}
      </div>

      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-20 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <button
          onClick={onEdit}
          title="Sửa"
          aria-label="Sửa ô"
          className="p-2 text-gray-500 hover:text-[#CC4A0A] hover:bg-orange-50 transition-colors"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-gray-200 mx-0.5"></div>
        
        <button
          onClick={onToggleVisible}
          title={isHidden ? "Hiện" : "Ẩn"}
          aria-label={isHidden ? "Hiện ô" : "Ẩn ô"}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          {isHidden ? <EyeOff className="w-4 h-4 text-red-500" /> : <Eye className="w-4 h-4" />}
        </button>

        <div className="w-px h-4 bg-gray-200 mx-0.5"></div>

        <button
          onClick={onMoveUp}
          disabled={isFirst}
          title="Lên trước"
          aria-label="Di chuyển ô lên trước"
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          onClick={onMoveDown}
          disabled={isLast}
          title="Xuống sau"
          aria-label="Di chuyển ô xuống sau"
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        {widget.kind === 'CHART' && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-0.5"></div>
            <button
              onClick={onDelete}
              title="Xoá"
              aria-label="Xoá ô"
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
