import React, { useState, useEffect } from 'react';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, Download, Package, Loader2 } from 'lucide-react';
import { apiFetchJson, apiDownloadExcel } from '../../utils/api';

export function ArrivalsNotReceivedBanner({ data, onShowDetail }) {
  const cn = data?.chua_nhan_tai_bcvh;
  if (!cn || cn.tong === 0) return null;

  return (
    <div className="bg-amber-50 border-[2px] border-amber-400 rounded-[16px] py-[20px] px-[24px] flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-6">
        {/* Biểu tượng cảnh báo */}
        <div className="w-16 h-16 rounded-full bg-amber-600 flex items-center justify-center shrink-0 shadow-sm">
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        
        {/* Số lượng */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-[52px] font-bold text-amber-900 leading-none">{cn.tong.toLocaleString('vi-VN')}</span>
          <span className="text-amber-700 font-semibold">bưu gửi</span>
        </div>

        {/* Khối chữ */}
        <div className="flex flex-col gap-1 max-w-[400px]">
          <span className="font-bold text-amber-900 text-[16px]">Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH</span>
          <span className="text-amber-900 text-[14px]">Chưa tính vào sản lượng đến (số liệu sẽ cập nhật khi có trạng thái giao nhận tại BCVH)</span>
          <span className="font-bold text-amber-900 text-[14px]">Cũ nhất: {cn.cu_nhat_ngay} ngày.</span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap flex-1 justify-end">
        {/* Thẻ */}
        <div className="flex items-center gap-3">
          <div className="bg-amber-50 border border-gray-200 border-l-[4px] border-l-amber-400 rounded-r-lg px-4 py-2 flex flex-col min-w-[100px]">
            <span className="text-[10px] font-bold text-amber-800 uppercase">0–1 ngày</span>
            <span className="text-[22px] font-bold text-amber-800">{cn.theo_tuoi['0-1']?.toLocaleString('vi-VN') || 0}</span>
          </div>
          <div className="bg-amber-100 border border-gray-200 border-l-[4px] border-l-amber-600 rounded-r-lg px-4 py-2 flex flex-col min-w-[100px]">
            <span className="text-[10px] font-bold text-amber-900 uppercase">2 ngày</span>
            <span className="text-[22px] font-bold text-amber-900">{cn.theo_tuoi['2']?.toLocaleString('vi-VN') || 0}</span>
          </div>
          <div className="bg-red-50 border border-gray-200 border-l-[4px] border-l-red-600 rounded-r-lg px-4 py-2 flex flex-col min-w-[100px]">
            <span className="text-[10px] font-bold text-red-700 uppercase">3+ ngày</span>
            <span className="text-[22px] font-bold text-red-700">{cn.theo_tuoi['3+']?.toLocaleString('vi-VN') || 0}</span>
          </div>
        </div>

        {/* Nút */}
        <button 
          onClick={onShowDetail}
          className="bg-amber-600 hover:bg-amber-800 text-white font-bold h-[44px] px-6 rounded-lg transition-colors flex items-center shrink-0"
        >
          Xem danh sách →
        </button>
      </div>
    </div>
  );
}

export function ArrivalsNotReceivedDetail({ data, filters, onBack }) {
  const cn = data?.summary?.chua_nhan_tai_bcvh;
  if (!cn) return null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  
  const loadItems = async (p) => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    q.set('from', filters.from);
    q.set('to', filters.to);
    filters.receiver_code.forEach(c => q.append('receiver_code', c));
    q.set('page', p);
    q.set('page_size', 50);

    const res = await apiFetchJson('/api/arrivals/not-received?' + q.toString());
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
    loadItems(1);
  }, [filters]);

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

    try {
      const url = '/api/arrivals/not-received/export?' + q.toString();
      const defaultFilename = `ChuaNhanTaiBCVH_${filters.receiver_code[0]}_${filters.from.slice(0,10)}_${filters.to.slice(0,10)}.xlsx`;
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
    if (tuoi <= 1) return "bg-amber-200 text-amber-900";
    if (tuoi === 2) return "bg-amber-500 text-amber-950";
    return "bg-red-700 text-white";
  };

  const formatTime = (iso) => iso ? iso.replace('T', ' ').slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : '';

  const pct = (n) => cn.tong ? (n / cn.tong) * 100 : 0;
  const p0 = pct(cn.theo_tuoi['0-1'] || 0);
  const p2 = pct(cn.theo_tuoi['2'] || 0);
  const p3 = pct(cn.theo_tuoi['3+'] || 0);

  return (
    <div className="bg-white border-[2px] border-amber-200 rounded-[16px] p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-amber-200 pb-4">
        <div>
          <button onClick={onBack} className="text-amber-700 hover:underline font-semibold text-sm mb-2">
            ← Quay lại Dữ liệu sản lượng đến
          </button>
          <h2 className="text-[20px] font-bold text-amber-800">Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH</h2>
          <p className="text-amber-900 mt-1">Chưa tính vào sản lượng đến (số liệu sẽ cập nhật khi có trạng thái giao nhận tại BCVH)</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-end gap-1">
            <button 
              onClick={handleExport} 
              disabled={exportLoading}
              className={`h-10 px-4 border text-amber-900 rounded-lg font-semibold flex items-center transition-colors ${
                exportLoading 
                  ? 'bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-50 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {exportLoading ? (
                <span className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang tạo file...
                </span>
              ) : (
                'Xuất danh sách (.xlsx)'
              )}
            </button>
            {exportError && <div className="text-[12px] text-red-600 max-w-[250px] text-right font-medium">{exportError}</div>}
          </div>
        </div>
      </div>

      {/* Phân bố */}
      <div>
        <div className="text-sm font-semibold text-gray-700 mb-2">Phân bố theo thời gian (số ngày từ lúc lập BD10 đến dữ liệu mới nhất)</div>
        <div className="flex h-[34px] rounded overflow-hidden">
          {p0 > 0 && (
            <div style={{ width: `${Math.max(p0, 5)}%` }} className="bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-sm border-r border-white min-w-[30px]">
              0–1
            </div>
          )}
          {p2 > 0 && (
            <div style={{ width: `${Math.max(p2, 5)}%` }} className="bg-amber-500 text-amber-950 font-bold flex items-center justify-center text-sm border-r border-white min-w-[30px]">
              2
            </div>
          )}
          {p3 > 0 && (
            <div style={{ width: `${Math.max(p3, 5)}%` }} className="bg-red-700 text-white font-bold flex items-center justify-center text-sm min-w-[30px]">
              3+
            </div>
          )}
        </div>
      </div>

      {/* 3 Thẻ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-gray-200 border-l-[4px] border-l-amber-400 rounded-r-lg p-4">
          <div className="text-xs font-bold text-amber-800 uppercase mb-1">CHỜ 0–1 NGÀY</div>
          <div className="text-[30px] font-bold text-amber-800 leading-none mb-1">{cn.theo_tuoi['0-1']?.toLocaleString('vi-VN') || 0}</div>
          <div className="text-sm text-amber-800">bưu gửi</div>
        </div>
        <div className="bg-amber-100 border border-gray-200 border-l-[4px] border-l-amber-600 rounded-r-lg p-4">
          <div className="text-xs font-bold text-amber-900 uppercase mb-1">CHỜ 2 NGÀY: THEO DÕI GẤP</div>
          <div className="text-[30px] font-bold text-amber-900 leading-none mb-1">{cn.theo_tuoi['2']?.toLocaleString('vi-VN') || 0}</div>
          <div className="text-sm text-amber-900">bưu gửi</div>
        </div>
        <div className="bg-red-50 border border-gray-200 border-l-[4px] border-l-red-600 rounded-r-lg p-4">
          <div className="text-xs font-bold text-red-700 uppercase mb-1">CHỜ 3+ NGÀY: CẦN TRA SOÁT TẠI BCVH</div>
          <div className="text-[30px] font-bold text-red-700 leading-none mb-1">{cn.theo_tuoi['3+']?.toLocaleString('vi-VN') || 0}</div>
          <div className="text-sm text-red-700">bưu gửi</div>
        </div>
      </div>

      {/* Theo ngày lập */}
      <div>
        <div className="text-sm font-semibold text-gray-700 mb-3">Theo ngày lập BD10</div>
        <div className="flex flex-wrap gap-4 overflow-x-auto pb-2">
          {cn.theo_ngay_lap.map(g => (
            <div key={`${g.ngay}-${g.tuoi}`} className={`min-w-[140px] flex-1 max-w-[200px] border border-gray-200 border-l-[4px] rounded-r-lg p-3 ${
              g.tuoi >= 3 ? 'bg-red-50 border-l-red-600' : g.tuoi === 2 ? 'bg-amber-100 border-l-amber-600' : 'bg-amber-50 border-l-amber-400'
            }`}>
              <div className="flex items-center gap-1 mb-1">
                <Calendar className={`w-3 h-3 ${g.tuoi >= 3 ? 'text-red-700' : g.tuoi === 2 ? 'text-amber-900' : 'text-amber-800'}`} />
                <span className={`text-[11px] font-bold uppercase ${g.tuoi >= 3 ? 'text-red-700' : g.tuoi === 2 ? 'text-amber-900' : 'text-amber-800'}`}>
                  LẬP BD10 {g.ngay.slice(8,10)}/{g.ngay.slice(5,7)}
                </span>
              </div>
              <div className={`text-[26px] font-bold leading-none mb-1 ${g.tuoi >= 3 ? 'text-red-700' : g.tuoi === 2 ? 'text-amber-900' : 'text-amber-800'}`}>
                {g.so_buu_gui.toLocaleString('vi-VN')}
              </div>
              <div className={`text-xs ${g.tuoi >= 3 ? 'text-red-700' : g.tuoi === 2 ? 'text-amber-900' : 'text-amber-800'}`}>
                {g.tuoi} ngày
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bảng */}
      <div>
        <div className="text-sm font-semibold text-gray-700 mb-3">Danh sách (cũ nhất lên đầu) · {cn.tong.toLocaleString('vi-VN')} bưu gửi</div>
        {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-amber-100 text-amber-900 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">SHBG</th>
                <th className="px-4 py-3">BD8</th>
                <th className="px-4 py-3">BD10</th>
                <th className="px-4 py-3">Đường thư</th>
                <th className="px-4 py-3">Lập BD10 lúc</th>
                <th className="px-4 py-3">Ngày</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Không có bưu gửi nào trong nhóm này.</td></tr>
              )}
              {items.map((r, i) => (
                <tr key={r.tracking_no} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-white'}`}>
                  <td className="px-4 py-2 font-mono text-xs">{r.tracking_no}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.bd8_no}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.bd10_no}</td>
                  <td className="px-4 py-2 truncate max-w-[200px] text-xs">{r.route_name}</td>
                  <td className="px-4 py-2 text-xs">{formatTime(r.thoi_diem_lap_bd10)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getPillColor(r.tuoi_ngay)}`}>
                      {r.tuoi_ngay} ngày
                    </span>
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
                onClick={() => loadItems(page - 1)} disabled={page <= 1 || loading}
                className="p-1 border rounded disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => loadItems(page + 1)} disabled={page >= totalPages || loading}
                className="p-1 border rounded disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
