import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ title, message, onConfirm, onCancel, confirmText = 'Xác nhận', cancelText = 'Huỷ', isDestructive = false }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            {isDestructive && <AlertTriangle className="w-5 h-5 text-red-500" />}
            {title}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <p className="text-gray-600 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-xl border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm ${
              isDestructive 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-[#CC4A0A] hover:bg-[#B83F08]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
