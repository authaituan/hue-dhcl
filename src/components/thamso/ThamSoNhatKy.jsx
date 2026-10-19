import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Filter,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import CustomDatePicker from '../common/CustomDatePicker';
import { formatGiaTriHienThi, formatUtcToVnDateTime } from './thamSoFormat';

// Chuẩn hóa giá trị từ CustomDatePicker thành chuỗi YYYY-MM-DD gửi lên API (không dùng new Date('YYYY-MM-DD'))
function normalizeYmd(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const mDmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mDmy) return `${mDmy[3]}-${mDmy[2]}-${mDmy[1]}`;
    return trimmed;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

export default function ThamSoNhatKy({ allParams = [] }) {
  const [selectedKhoa, setSelectedKhoa] = useState('');
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 100, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const paramMap = new Map(allParams.map((p) => [p.khoa, p]));

  const fetchLogs = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      q.set('page', String(targetPage));
      q.set('page_size', '100');
      if (selectedKhoa) q.set('khoa', selectedKhoa);
      if (tu) q.set('tu', tu);
      if (den) q.set('den', den);

      const res = await apiFetchJson(`/api/tham-so/nhat-ky?${q.toString()}`);
      if (res.ok) {
        setItems(res.data?.items || []);
        setPagination(res.data?.pagination || { total: 0, page: targetPage, page_size: 100, total_pages: 1 });
      } else {
        setError(res.error || 'Không tải được nhật ký thay đổi');
      }
    } catch (_) {
      setError('Lỗi kết nối khi tải nhật ký');
    } finally {
      setLoading(false);
    }
  }, [selectedKhoa, tu, den]);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handleResetFilter = () => {
    setSelectedKhoa('');
    setTu('');
    setDen('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* KHUNG BỘ LỌC */}
      <form
        onSubmit={handleFilterSubmit}
        className="card-soft p-4 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-orange-500" />
            <span>Bộ lọc nhật ký</span>
          </div>
          {(selectedKhoa || tu || den) && (
            <button
              type="button"
              onClick={handleResetFilter}
              className="text-xs text-orange-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {/* Lọc theo tham số: đổi giá trị thì về trang 1 */}
          <div className="space-y-1">
            <label htmlFor="filter-khoa" className="block text-[11px] font-semibold text-gray-600">
              Tham số:
            </label>
            <select
              id="filter-khoa"
              value={selectedKhoa}
              onChange={(e) => {
                setSelectedKhoa(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-medium px-3 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 cursor-pointer"
            >
              <option value="">Tất cả tham số</option>
              {allParams.map((p) => (
                <option key={p.khoa} value={p.khoa}>
                  {p.nhan} ({p.khoa})
                </option>
              ))}
            </select>
          </div>

          {/* Lọc từ ngày: đổi giá trị thì về trang 1 */}
          <div className="space-y-1">
            <label htmlFor="filter-tu" className="block text-[11px] font-semibold text-gray-600">
              Từ ngày:
            </label>
            <CustomDatePicker
              id="filter-tu"
              value={tu}
              onChange={(val) => {
                setTu(normalizeYmd(val));
                setPage(1);
              }}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Lọc đến ngày: đổi giá trị thì về trang 1 */}
          <div className="space-y-1">
            <label htmlFor="filter-den" className="block text-[11px] font-semibold text-gray-600">
              Đến ngày (tối đa 92 ngày):
            </label>
            <CustomDatePicker
              id="filter-den"
              value={den}
              onChange={(val) => {
                setDen(normalizeYmd(val));
                setPage(1);
              }}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Nút lọc & làm mới */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
              <span>Lọc nhật ký</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPage(1);
                fetchLogs(1);
              }}
              disabled={loading}
              title="Làm mới"
              className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-xl text-gray-600 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>
        </div>
      </form>

      {/* THÔNG BÁO LỖI NẾU CÓ */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs(page)}
            className="text-xs font-bold text-red-700 hover:underline cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* BẢNG NHẬT KÝ */}
      <div className="card-soft rounded-[14px] border border-gray-200 bg-white overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-cream-head border-b border-cream-line text-[12px] font-bold text-gray-600 uppercase tracking-wider">
                <th className="py-3 px-4">Thời điểm (giờ VN)</th>
                <th className="py-3 px-4">Người sửa</th>
                <th className="py-3 px-4">Tham số</th>
                <th className="py-3 px-4">Thay đổi</th>
                <th className="py-3 px-4 text-center">Loại</th>
                <th className="py-3 px-4">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-line tabular-nums">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                    <span>Đang tải nhật ký...</span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    {!selectedKhoa && !tu && !den
                      ? 'Chưa có thay đổi nào được ghi nhận.'
                      : 'Không tìm thấy bản ghi nhật ký nào phù hợp.'}
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const paramMeta = paramMap.get(row.khoa);
                  const kieu = paramMeta ? paramMeta.kieu : 'thap_phan';
                  const donVi = paramMeta ? paramMeta.don_vi : '';
                  const nhan = paramMeta ? paramMeta.nhan : row.khoa;

                  const isSua = row.loai === 'SUA';

                  return (
                    <tr key={row.id} className="hover:bg-cream-light/50 transition-colors">
                      {/* Thời điểm */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums text-[11px] text-gray-600">
                        {formatUtcToVnDateTime(row.thoi_diem)}
                      </td>

                      {/* Người sửa */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-800">
                          {row.nguoi?.ten || row.nguoi?.ma || '—'}
                        </div>
                        {row.nguoi?.ten && row.nguoi?.ma && (
                          <div className="text-[10px] text-gray-400 tabular-nums">
                            {row.nguoi.ma}
                          </div>
                        )}
                      </td>

                      {/* Tham số */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <div className="font-bold text-gray-800 truncate" title={nhan}>
                          {nhan}
                        </div>
                        <div className="tabular-nums text-[11px] text-gray-400 truncate" title={row.khoa}>
                          {row.khoa}
                        </div>
                      </td>

                      {/* Thay đổi Cũ -> Mới */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="text-gray-400 line-through">
                            {formatGiaTriHienThi(row.gia_tri_cu, kieu, donVi)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                          <span className="font-bold text-orange-600">
                            {formatGiaTriHienThi(row.gia_tri_moi, kieu, donVi)}
                          </span>
                        </div>
                      </td>

                      {/* Loại */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isSua ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Sửa
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Hoàn mặc định
                          </span>
                        )}
                      </td>

                      {/* Lý do */}
                      <td className="py-3 px-4 text-xs text-gray-700 max-w-[260px]">
                        <div className="leading-snug break-words" title={row.ly_do}>
                          {row.ly_do || '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG */}
        {pagination.total_pages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/40">
            <div>
              Hiển thị {items.length} trên tổng số <strong>{pagination.total}</strong> bản ghi (trang {pagination.page}/{pagination.total_pages})
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1 || loading}
                className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>
              <span className="px-2 font-bold text-gray-700">
                {pagination.page}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={pagination.page >= pagination.total_pages || loading}
                className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
