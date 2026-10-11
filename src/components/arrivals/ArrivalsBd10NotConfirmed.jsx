import React, { useState, useEffect } from 'react';
import { FileCheck, Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiFetchJson, apiDownloadExcel } from '../../utils/api';

const pct = (n) => n === null ? '—' : `${(n * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function ArrivalsBd10NotConfirmedBanner({ data, onShowDetail }) {
  const b = data?.bd10_den_khong_xnd;
  if (!b || b.tong_bd10_den === 0) return null;

  return (
    <div className="bg-[#fff1f2] border-[2px] border-[#fb7185] rounded-[16px] py-[18px] px-[24px] flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-6">
        {/* Biểu tượng */}
        <div className="w-[52px] h-[52px] rounded-full bg-[#e11d48] flex items-center justify-center shrink-0 shadow-sm">
          <FileCheck className="w-7 h-7 text-white" />
        </div>
        
        {/* Số lượng */}
        <div className="flex flex-col items-center shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[52px] font-bold text-[#9f1239] leading-none">{b.khong_xnd.toLocaleString('vi-VN')}</span>
            <span className="text-[#9f1239] font-bold text-[14px]">BD10</span>
          </div>
          <span className="text-[20px] font-bold text-[#be123c] leading-none mt-1">{pct(b.ty_le)}</span>
        </div>

        {/* Khối chữ */}
        <div className="flex flex-col gap-1 max-w-[320px]">
          <span className="font-bold text-[#881337] text-[16px]">Đã có XN túi / XN bưu gửi, chưa XNĐ BD10</span>
          <span className="text-[#9f1239] text-[13px]">{b.khong_xnd.toLocaleString('vi-VN')} trên {b.tong_bd10_den.toLocaleString('vi-VN')} BD10 đến BCVH trong khung ngày đang chọn. Hoàn tất XNĐ BD10 để kiểm soát đủ hàng đến.</span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap flex-1 justify-end">
        {/* Hàng thẻ nhỏ 1 */}
        <div className="flex items-center gap-3">
          <div className="bg-[#fff7ed] border-l-[4px] border-[#f97316] rounded-r-lg px-3 py-2 flex flex-col shadow-[0_3px_10px_rgba(120,113,108,0.14)] min-w-[140px]">
            <span className="text-[11px] font-bold text-[#c2410c] uppercase">CHUYẾN TỪ TTKT (530100)</span>
            <span className="text-[18px] font-bold text-[#c2410c] mt-0.5">
              {b.theo_nhom['530100'].khong_xnd.toLocaleString('vi-VN')} / {b.theo_nhom['530100'].tong.toLocaleString('vi-VN')} · {pct(b.theo_nhom['530100'].ty_le)}
            </span>
          </div>
          <div className="bg-[#f0f9ff] border-l-[4px] border-[#0ea5e9] rounded-r-lg px-3 py-2 flex flex-col shadow-[0_3px_10px_rgba(120,113,108,0.14)] min-w-[140px]">
            <span className="text-[11px] font-bold text-[#0369a1] uppercase">TỪ BƯU CỤC KHÁC</span>
            <span className="text-[18px] font-bold text-[#0369a1] mt-0.5">
              {b.theo_nhom['khac'].khong_xnd.toLocaleString('vi-VN')} / {b.theo_nhom['khac'].tong.toLocaleString('vi-VN')} · {pct(b.theo_nhom['khac'].ty_le)}
            </span>
          </div>
        </div>

        {/* Hàng thẻ nhỏ 2 */}
        <div className="flex items-center gap-2">
          <div className="bg-[#fefce8] border-l-[4px] border-[#eab308] rounded-r-lg px-3 py-1.5 flex flex-col shadow-[0_3px_10px_rgba(120,113,108,0.14)]">
            <span className="text-[11px] font-bold text-[#854d0e] uppercase">0–1 NGÀY</span>
            <span className="text-[18px] font-bold text-[#854d0e]">{b.theo_tuoi['0-1']?.toLocaleString('vi-VN') || 0}</span>
          </div>
          <div className="bg-[#fff7ed] border-l-[4px] border-[#f97316] rounded-r-lg px-3 py-1.5 flex flex-col shadow-[0_3px_10px_rgba(120,113,108,0.14)]">
            <span className="text-[11px] font-bold text-[#c2410c] uppercase">2 NGÀY</span>
            <span className="text-[18px] font-bold text-[#c2410c]">{b.theo_tuoi['2']?.toLocaleString('vi-VN') || 0}</span>
          </div>
          <div className="bg-[#fff1f2] border-l-[4px] border-[#e11d48] rounded-r-lg px-3 py-1.5 flex flex-col shadow-[0_3px_10px_rgba(120,113,108,0.14)]">
            <span className="text-[11px] font-bold text-[#be123c] uppercase">3+ NGÀY</span>
            <span className="text-[18px] font-bold text-[#be123c]">{b.theo_tuoi['3+']?.toLocaleString('vi-VN') || 0}</span>
          </div>
        </div>

        {/* Nút */}
        <button 
          onClick={onShowDetail}
          className="bg-[#e11d48] hover:bg-[#be123c] text-white font-bold h-[40px] px-5 rounded-[10px] transition-colors flex items-center shrink-0 ml-2"
        >
          Xem danh sách →
        </button>
      </div>
    </div>
  );
}

export function ArrivalsBd10NotConfirmedDetail({ data, filters, onBack }) {
  const b = data?.summary?.bd10_den_khong_xnd;
  if (!b) return null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [nhomFilter, setNhomFilter] = useState(''); // '' | '530100' | 'khac'
  
  const loadItems = async (p, nhom) => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set('from', filters.from);
    q.set('to', filters.to);
    filters.receiver_code.forEach(c => q.append('receiver_code', c));
    q.set('page', p);
    q.set('page_size', 50);
    if (nhom) q.set('nhom', nhom);

    const res = await apiFetchJson('/api/arrivals/bd10-khong-xnd?' + q.toString());
    if (res.ok) {
      setItems(res.data.items);
      setPage(res.data.pagination.page);
      setTotalPages(res.data.pagination.total_pages);
    } else {
      setError(res.error || 'Lỗi tải danh sách');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadItems(1, nhomFilter);
  }, [filters, nhomFilter]);

  const handleExport = async () => {
    if (exportLoading) return;
    setExportError(null);

    if (filters.receiver_code.length !== 1) {
      setExportError('Chỉ hỗ trợ tải dữ liệu của đúng 1 BCVH');
      return;
    }

    setExportLoading(true);
    const q = new URLSearchParams();
    q.set('from', filters.from.slice(0, 10));
    q.set('to', filters.to.slice(0, 10));
    q.set('receiver_code', filters.receiver_code[0]);
    if (nhomFilter) q.set('nhom', nhomFilter);

    try {
      const url = '/api/arrivals/bd10-khong-xnd/export?' + q.toString();
      const defaultFilename = `BD10KhongXND_${filters.receiver_code[0]}_${filters.from.slice(0,10)}_${filters.to.slice(0,10)}.xlsx`;
      const result = await apiDownloadExcel(url, defaultFilename);
      
      if (!result.ok) {
        setExportError(result.error || 'Lỗi kết nối khi tải file');
      }
    } catch(err) {
      setExportError('Lỗi kết nối khi tải file');
    } finally {
      setExportLoading(false);
    }
  };

  const getPillColor = (tuoi) => {
    if (tuoi <= 1) return "bg-[#fef9c3] text-[#854d0e]";
    if (tuoi === 2) return "bg-[#ffedd5] text-[#c2410c]";
    return "bg-[#fee2e2] text-[#b91c1c]";
  };

  const ratio = (n) => b.khong_xnd ? (n / b.khong_xnd) * 100 : 0;
  const p0 = ratio(b.theo_tuoi['0-1'] || 0);
  const p2 = ratio(b.theo_tuoi['2'] || 0);
  const p3 = ratio(b.theo_tuoi['3+'] || 0);

  return (
    <div className="bg-white border-[1px] border-[#fda4af] rounded-[16px] shadow-sm p-6 space-y-6">
      <div className="flex items-start justify-between border-b border-[#fda4af] pb-4">
        <div>
          <button onClick={onBack} className="text-[#e11d48] hover:underline font-semibold text-sm mb-2">
            ← Quay lại Dữ liệu sản lượng đến
          </button>
          <h2 className="text-[20px] font-bold text-[#881337]">BD10 đến không XNĐ</h2>
          <p className="text-[#57534e] mt-1 text-[13px]">Đã có XN túi / XN bưu gửi, chưa XNĐ BD10. Ngày của BD10 là ngày XNĐ BD10; chưa có XNĐ thì lấy ngày XN túi/bưu gửi sớm nhất.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button 
            onClick={handleExport} 
            disabled={exportLoading}
            className={`h-10 px-4 rounded-lg font-semibold flex items-center transition-colors ${exportLoading ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-[#e11d48] hover:bg-[#be123c] text-white'}`}
          >
            {exportLoading ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang tạo file...
              </span>
            ) : (
              'Xuất Excel'
            )}
          </button>
          {exportError && <div className="text-[12px] text-red-600 max-w-[250px] text-right font-medium">{exportError}</div>}
        </div>
      </div>

      {/* Phân bố */}
      <div>
        <div className="text-sm font-semibold text-gray-700 mb-2">Phân bố theo thời gian (số ngày từ ngày của BD10 đến dữ liệu mới nhất)</div>
        <div className="flex h-[22px] rounded overflow-hidden mb-1">
          {p0 > 0 && (
            <div style={{ width: `${Math.max(p0, 3)}%` }} className="bg-[#fde68a]" />
          )}
          {p2 > 0 && (
            <div style={{ width: `${Math.max(p2, 3)}%` }} className="bg-[#fb923c]" />
          )}
          {p3 > 0 && (
            <div style={{ width: `${Math.max(p3, 3)}%` }} className="bg-[#b91c1c]" />
          )}
        </div>
        <div className="flex gap-4 text-[12px] text-[#57534e]">
          <span>Chờ 0–1 ngày: <strong>{b.theo_tuoi['0-1']?.toLocaleString('vi-VN') || 0}</strong></span>
          <span>Chờ 2 ngày: <strong>{b.theo_tuoi['2']?.toLocaleString('vi-VN') || 0}</strong></span>
          <span>Chờ 3+ ngày: <strong>{b.theo_tuoi['3+']?.toLocaleString('vi-VN') || 0}</strong></span>
        </div>
      </div>

      {/* Dòng bộ lọc */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">Lọc:</span>
        <button 
          onClick={() => setNhomFilter('')}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${nhomFilter === '' ? 'bg-[#ffe4e6] text-[#be123c] font-bold border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Tất cả ({b.khong_xnd.toLocaleString('vi-VN')})
        </button>
        <button 
          onClick={() => setNhomFilter('530100')}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${nhomFilter === '530100' ? 'bg-[#fff7ed] text-[#c2410c] font-bold border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Chuyến từ TTKT 530100 ({b.theo_nhom['530100'].khong_xnd.toLocaleString('vi-VN')})
        </button>
        <button 
          onClick={() => setNhomFilter('khac')}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${nhomFilter === 'khac' ? 'bg-[#f0f9ff] text-[#0369a1] font-bold border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Từ bưu cục khác ({b.theo_nhom['khac'].khong_xnd.toLocaleString('vi-VN')})
        </button>
      </div>

      {/* Bảng */}
      <div>
        {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-[#fff1f2] text-[#9f1239] font-semibold border-b-[2px] border-[#fda4af]">
              <tr>
                <th className="px-4 py-3">Số hiệu BD10</th>
                <th className="px-4 py-3">Lập</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Đã chờ</th>
                <th className="px-4 py-3 text-right">Bưu gửi</th>
                <th className="px-4 py-3 text-right">BD8</th>
                <th className="px-4 py-3">Mốc đã có</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Không có BD10 nào trong nhóm này.</td></tr>
              )}
              {items.map((r, i) => (
                <tr key={`${r.so_hieu_bd10}-${r.ma_bcvh}`} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-[#fffafa]'}`}>
                  <td className="px-4 py-2 font-mono text-xs">{r.so_hieu_bd10}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.lap6}</td>
                  <td className="px-4 py-2 text-xs">{r.ngay.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getPillColor(r.tuoi)}`}>
                      {r.tuoi} ngày
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{r.so_buu_gui.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-2 text-right">{r.so_bd8.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-2">
                    {r.co_xn_tui && r.co_xn_bg ? (
                      <span className="px-2 py-0.5 rounded-sm text-[11px] font-bold bg-[#ecfdf5] text-[#047857]">Túi + bưu gửi</span>
                    ) : r.co_xn_tui ? (
                      <span className="px-2 py-0.5 rounded-sm text-[11px] font-bold bg-[#eff6ff] text-[#1d4ed8]">Chỉ túi</span>
                    ) : r.co_xn_bg ? (
                      <span className="px-2 py-0.5 rounded-sm text-[11px] font-bold bg-[#eff6ff] text-[#1d4ed8]">Chỉ bưu gửi</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-500">
              Trang {page} / {totalPages}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => loadItems(page - 1, nhomFilter)} disabled={page <= 1 || loading}
                className="p-1 border rounded disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => loadItems(page + 1, nhomFilter)} disabled={page >= totalPages || loading}
                className="p-1 border rounded disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dòng cuối khung */}
      {(b.ngoai_khung.truoc_khung > 0 || b.ngoai_khung.sau_khung > 0 || b.ngoai_khung.khong_co_moc > 0) && (
        <div className="bg-[#fffbeb] border border-dashed border-[#fcd34d] text-[#92400e] text-[13px] rounded-lg p-3">
          Ngoài khung ngày đang chọn (không tính vào chỉ số):
          <div className="flex gap-3 mt-1">
            {b.ngoai_khung.truoc_khung > 0 && <span>• {b.ngoai_khung.truoc_khung.toLocaleString('vi-VN')} BD10 có ngày trước khung</span>}
            {b.ngoai_khung.sau_khung > 0 && <span>• {b.ngoai_khung.sau_khung.toLocaleString('vi-VN')} BD10 có ngày sau khung</span>}
            {b.ngoai_khung.khong_co_moc > 0 && <span>• {b.ngoai_khung.khong_co_moc.toLocaleString('vi-VN')} BD10 chưa có mốc nào</span>}
          </div>
        </div>
      )}
    </div>
  );
}
