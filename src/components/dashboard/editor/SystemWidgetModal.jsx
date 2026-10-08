import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiFetch } from '../../../utils/api';

const SIZES = [
  { value: 'S', label: 'S (1/4 hàng)' },
  { value: 'M', label: 'M (1/3 hàng)' },
  { value: 'L', label: 'L (1/2 hàng)' },
  { value: 'XL', label: 'XL (2/3 hàng)' },
  { value: 'FULL', label: 'FULL (Toàn hàng)' }
];

export default function SystemWidgetModal({ widget, onClose, onSuccess }) {
  const [title, setTitle] = useState(widget?.title || '');
  const [size, setSize] = useState(widget?.size || 'M');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Tiêu đề không được để trống');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/dashboard/widgets/${widget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), size })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi lưu ô hệ thống');
      onSuccess();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-800">Sửa ô hệ thống</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
            Ô hệ thống: chỉ đổi tên và kích cỡ, không xoá được, có thể ẩn.
          </p>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] transition-shadow"
              placeholder="Nhập tiêu đề ô..."
            />
            <div className="text-right text-xs text-gray-400 mt-1">{title.length}/80</div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Kích cỡ ô</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SIZES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSize(s.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    size === s.value 
                      ? 'border-[#F97316] bg-orange-50 text-[#CC4A0A]' 
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded-lg">{error}</div>}
        </div>

        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-xl border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-[#CC4A0A] hover:bg-[#B83F08] text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
