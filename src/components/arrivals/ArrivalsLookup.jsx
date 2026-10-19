import React, { useState } from 'react';
import { Search, Loader2, Package, Clock } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';

export default function ArrivalsLookup({ bcvhList, isAdmin, exceptions }) {
  const [trackingNo, setTrackingNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    const t = trackingNo.trim();
    if (!t) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const res = await apiFetchJson(`/api/arrivals/lookup?tracking_no=${encodeURIComponent(t)}`);
    setLoading(false);

    if (res.ok) {
      setResult(res.data);
    } else {
      setError(res.error || 'Có lỗi xảy ra khi tra cứu');
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    try {
      const d = new Date(timeStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return timeStr;
      const pad = n => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) {
      return timeStr; // fallback
    }
  };

  return (
    <div className="mt-6">
      <div className="card-soft p-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-[var(--color-title)] mb-2">Tra cứu Bưu gửi</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nhập số hiệu bưu gửi (VD: EB123456789VN)"
                className="w-full input-soft pl-10 h-11"
                value={trackingNo}
                onChange={e => setTrackingNo(e.target.value)}
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !trackingNo.trim()}
            className="btn-primary h-11 px-6 shadow-sm flex items-center justify-center whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Tra cứu
          </button>
        </form>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {result && (
          <div className="space-y-4">
            {result.so_dong === 0 ? (
              <div className="p-4 bg-gray-50 text-gray-500 text-center rounded-lg border border-gray-100">
                Không tìm thấy dữ liệu cho bưu gửi <span className="font-bold">{result.tracking_no}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-lg text-[var(--color-title)]">Kết quả: {result.tracking_no}</h3>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                    {result.so_dong} lượt quét
                  </span>
                  {result.so_dong > 1 && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full border border-amber-100">
                      Đến lại
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {result.dong.map((r, i) => (
                    <div key={r.id || i} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                      <div className="flex flex-wrap gap-x-8 gap-y-4">
                        <div className="min-w-[150px]">
                          <p className="text-xs text-gray-500 font-semibold mb-1">BCVH nhận</p>
                          <p className="font-medium text-[var(--color-title)]">
                            {r.receiver_code} - {bcvhList.find(b => b.ma === r.receiver_code)?.ten || 'Không rõ'}
                          </p>
                        </div>
                        <div className="min-w-[150px]">
                          <p className="text-xs text-gray-500 font-semibold mb-1">Địa bàn phát (Phường/Xã)</p>
                          <p className="font-medium text-[var(--color-title)]">{r.ward_name || '-'}</p>
                        </div>
                        <div className="min-w-[100px]">
                          <p className="text-xs text-gray-500 font-semibold mb-1">Khối lượng (g)</p>
                          <p className="font-medium text-[var(--color-title)]">{r.weight_g?.toLocaleString('vi-VN') || '-'}</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Xác nhận túi</p>
                          <p className="font-mono text-sm">{formatTime(r.bag_confirmed_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Xác nhận đến BD10</p>
                          <p className="font-mono text-sm">{formatTime(r.bd10_confirmed_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Xác nhận bưu gửi</p>
                          <p className="font-mono text-sm">{formatTime(r.item_confirmed_at)}</p>
                        </div>
                      </div>
                      
                      <div className="mt-3 text-xs text-gray-500 bg-gray-50 p-2 rounded flex items-start gap-2">
                        <Package className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                        <div>
                          <span className="font-semibold mr-1">Mốc dùng làm thời điểm đến:</span>
                          {r.moc_dung_lam_thoi_diem_den} ({formatTime(r.arrival_at)})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {result.ghi_chu && (
                  <p className="text-xs text-gray-500 italic mt-2">{result.ghi_chu}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isAdmin && exceptions && exceptions.length > 0 && (
        <div className="card-soft border border-gray-200 mt-6">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700" />
            <h3 className="font-bold text-dark">
              Bưu gửi ngoại lệ
              <span className="text-[12px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 ml-2">Chỉ ADMIN</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Số hiệu bưu gửi</th>
                  <th className="px-4 py-3">Thời gian đến BCVH</th>
                  <th className="px-4 py-3">Căn cứ mốc</th>
                  <th className="px-4 py-3">Phường/xã nơi phát</th>
                  <th className="px-4 py-3">Lý do ngoại lệ</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.slice(0, 50).map((ex, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{ex.tracking_no}</td>
                    <td className="px-4 py-3">{formatTime(ex.arrival_time) || 'Chưa xác định'}</td>
                    <td className="px-4 py-3">{ex.basis_name || '—'}</td>
                    <td className="px-4 py-3">{ex.ward_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                        {ex.issue_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
            Chỉ liệt kê bưu gửi ngoại lệ, tối đa 50 dòng. Danh sách đầy đủ lấy bằng nút Tải dữ liệu để xử lý.
          </div>
        </div>
      )}
    </div>
  );
}
