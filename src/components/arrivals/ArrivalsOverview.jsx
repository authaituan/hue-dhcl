import React, { useState, useEffect } from 'react';
import { apiFetchJson } from '../../utils/api';
import { Loader2, Package, MapPin, Scale, Box, AlertOctagon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';

function BcvhComparisonTable({ filters, bcvhList }) {
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAll() {
      if (filters.receiver_code.length < 2) return;
      setLoading(true);
      const rows = [];
      for (const code of filters.receiver_code) {
        const q = new URLSearchParams();
        q.set('from', filters.from);
        q.set('to', filters.to);
        q.set('receiver_code', code);
        if (filters.ward_key) q.set('ward_key', filters.ward_key);
        
        try {
          const [sumRes, qualRes] = await Promise.all([
            apiFetchJson('/api/arrivals/summary?' + q.toString()),
            apiFetchJson('/api/arrivals/quality-mocs?' + q.toString())
          ]);
          if (sumRes.ok && qualRes.ok) {
            rows.push({
              code,
              ten: bcvhList.find(b => b.ma === code)?.ten || code,
              san_luong: sumRes.data.san_luong,
              tui_kien: sumRes.data.tui_kien,
              khoi_luong_g: sumRes.data.khoi_luong_g,
              hang_di_ngoai: sumRes.data.hang_di_ngoai,
              du_trang_thai: qualRes.data.tong_hop.du_trang_thai.so_buu_gui
            });
          }
        } catch(e) {}
      }
      setTableData(rows.sort((a,b) => b.san_luong - a.san_luong));
      setLoading(false);
    }
    loadAll();
  }, [filters, bcvhList]);

  if (filters.receiver_code.length < 2) return null;

  return (
    <div className="card-soft overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h3 className="font-bold text-[var(--color-title)]">So sánh các BCVH đang chọn</h3>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">BCVH</th>
              <th className="px-4 py-3 text-right">Sản lượng đến</th>
              <th className="px-4 py-3 text-right">Túi/kiện</th>
              <th className="px-4 py-3 text-right">Khối lượng (kg)</th>
              <th className="px-4 py-3 text-right">Hàng đi ngoài</th>
              <th className="px-4 py-3 text-right">Đủ trạng thái (SHBG, BD8, BD10)</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map(row => (
              <tr key={row.code} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{row.ten}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-500">{row.san_luong.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{row.tui_kien.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{(row.khoi_luong_g / 1000).toLocaleString('vi-VN', {maximumFractionDigits:1})}</td>
                <td className="px-4 py-3 text-right">{row.hang_di_ngoai.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{row.du_trang_thai.toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ArrivalsOverview({ data, filters, bcvhList, isAdmin }) {
  const sum = data.summary;
  const isAllBcvh = filters.receiver_code.length === 6;

  // Chart data
  const chartData = data.byTimeDay?.items || [];
  const hourChartData = data.byTimeHour?.items || [];

  let finalHourChartData = hourChartData;
  let isAggregated = false;
  if (filters.from && filters.to) {
    const fDate = new Date(filters.from.replace(' ', 'T'));
    const tDate = new Date(filters.to.replace(' ', 'T'));
    const diffDays = (tDate - fDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 2 && hourChartData.length > 0) {
      isAggregated = true;
      const agg = Array.from({length: 24}, (_, i) => ({ moc: i.toString().padStart(2, '0'), san_luong: 0 }));
      hourChartData.forEach(item => {
        const hr = item.moc.substring(11, 13); // format is "YYYY-MM-DD HH"
        const idx = parseInt(hr, 10);
        if (!isNaN(idx)) agg[idx].san_luong += item.san_luong;
      });
      finalHourChartData = agg;
    }
  }

  const maxWardTyTrong = data.byWard?.items[0]?.ty_trong || 1;

  return (
    <div className="space-y-6 mt-6">
      {/* Thẻ chỉ số */}
      {sum ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="card-soft p-4 flex flex-col justify-center bg-orange-50 border-l-4 border-orange-500">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-orange-600 font-semibold uppercase">Sản lượng đến</span>
            </div>
            <span className="text-3xl font-bold text-orange-600 mt-1">{sum.san_luong.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-orange-400 mt-1">đã lọc trùng</span>
          </div>
          <div className="card-soft p-4 flex flex-col justify-center bg-blue-50 border-l-4 border-blue-500">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-blue-600 font-semibold uppercase">Địa bàn phát</span>
            </div>
            <span className="text-2xl font-bold text-blue-600 mt-1">
              {sum.dia_ban_phat.co}{isAllBcvh ? `/40` : ''}
            </span>
            <span className="text-xs text-blue-400 mt-1">phường/xã {isAllBcvh ? 'của thành phố có bưu gửi' : 'có bưu gửi đến'}</span>
          </div>
          <div className="card-soft p-4 flex flex-col justify-center bg-teal-50 border-l-4 border-teal-500">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-4 h-4 text-teal-500" />
              <span className="text-xs text-teal-600 font-semibold uppercase">Khối lượng</span>
            </div>
            <span className="text-2xl font-bold text-teal-600 mt-1">
              {(sum.khoi_luong_g / 1000).toLocaleString('vi-VN', {maximumFractionDigits:1})} kg
            </span>
            <span className="text-xs text-teal-400 mt-1 invisible">&nbsp;</span>
          </div>
          <div className="card-soft p-4 flex flex-col justify-center bg-purple-50 border-l-4 border-purple-500">
            <div className="flex items-center gap-2 mb-1">
              <Box className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-purple-600 font-semibold uppercase">Túi / kiện</span>
            </div>
            <span className="text-2xl font-bold text-purple-600 mt-1">{sum.tui_kien.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-purple-400 mt-1 invisible">&nbsp;</span>
          </div>
          <div className="card-soft p-4 flex flex-col justify-center bg-rose-50 border-l-4 border-rose-500">
            <div className="flex items-center gap-2 mb-1">
              <AlertOctagon className="w-4 h-4 text-rose-500" />
              <span className="text-xs text-rose-600 font-semibold uppercase">Hàng đi ngoài</span>
            </div>
            <span className="text-2xl font-bold text-rose-600 mt-1">{sum.hang_di_ngoai.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-rose-400 mt-1">Tỉ trọng: {sum.ty_le_hang_di_ngoai.toLocaleString('vi-VN')}%</span>
          </div>
        </div>
      ) : (
        <div className="card-soft p-4 flex items-center justify-center text-red-500 h-24 text-sm font-medium">
          Lỗi tải dữ liệu chỉ số tổng quan. {data.errors?.summary}
        </div>
      )}

      <BcvhComparisonTable filters={filters} bcvhList={bcvhList} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft p-4">
          <h3 className="font-bold text-[var(--color-title)] mb-4">Sản lượng theo ngày</h3>
          <div className="h-64 w-full">
            {data.errors?.byTimeDay ? (
              <div className="flex items-center justify-center h-full text-red-500 text-sm font-medium">
                {data.errors.byTimeDay}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="moc" tickFormatter={v => `${v.slice(8,10)}/${v.slice(5,7)}`} tick={{fontSize: 12}} />
                  <YAxis tickFormatter={v => v.toLocaleString('vi-VN')} tick={{fontSize: 12}} />
                  <RechartsTooltip formatter={(val) => val.toLocaleString('vi-VN')} labelFormatter={v => `Ngày: ${v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')}`} />
                  <Bar dataKey="san_luong" fill="#F97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="card-soft p-4">
          <div className="mb-4">
            <h3 className="font-bold text-[var(--color-title)]">Sản lượng theo giờ</h3>
            {isAggregated && <p className="text-xs text-gray-500 mt-1">Cộng dồn theo giờ trong ngày</p>}
          </div>
          <div className="h-64 w-full">
            {data.errors?.byTimeHour ? (
              <div className="flex items-center justify-center h-full text-red-500 text-sm font-medium">
                {data.errors.byTimeHour}
              </div>
            ) : data.byTimeHour ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finalHourChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="moc" tickFormatter={v => isAggregated ? `${v}h` : v.slice(11,16)} tick={{fontSize: 12}} />
                  <YAxis tickFormatter={v => v.toLocaleString('vi-VN')} tick={{fontSize: 12}} />
                  <RechartsTooltip 
                    formatter={(val) => val.toLocaleString('vi-VN')} 
                    labelFormatter={v => isAggregated ? `Giờ: ${v}h00` : `Thời gian: ${v.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})$/, '$3/$2/$1 $4:00')}`} 
                  />
                  <Bar dataKey="san_luong" fill="#0ea5e9" radius={[4,4,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm font-medium">
                Xem theo giờ chỉ áp dụng cho khoảng tối đa 7 ngày. Hãy chọn khoảng ngắn hơn.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-soft">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-[var(--color-title)]">Sản lượng theo Địa bàn phát</h3>
        </div>
        {data.errors?.byWard ? (
          <div className="p-4 text-red-500 text-sm font-medium">Lỗi tải dữ liệu địa bàn: {data.errors.byWard}</div>
        ) : (
          <>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap w-[220px]">Phường / Xã</th>
                    <th className="px-4 py-3 whitespace-nowrap min-w-[100px]"></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap w-28">Sản lượng</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap w-28">Tỷ trọng</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap w-36">Khối lượng (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byWard?.items.map(w => (
                    <tr key={w.ward_key} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium">{w.ward_name || w.ward_key}</td>
                      <td className="px-4 py-2">
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex items-center">
                          <div className="h-full bg-orange-500" style={{ width: `${Math.min((w.ty_trong / maxWardTyTrong) * 100, 100)}%` }}></div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{w.san_luong.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">{w.ty_trong.toLocaleString('vi-VN')}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{(w.khoi_luong_g/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})}</td>
                    </tr>
                  ))}
                  {/* Nhóm đặc biệt */}
                  {data.byWard?.nhom_phan_loai.filter(n => n.san_luong > 0).map(n => (
                    <tr key={n.nhom} className="bg-orange-50/50 hover:bg-orange-50 border-b border-orange-100">
                      <td className="px-4 py-2 font-medium text-orange-800">{n.ten}</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-800 font-semibold">{n.san_luong.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-800">{n.ty_trong.toLocaleString('vi-VN')}%</td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-800">{(n.khoi_luong_g/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-gray-50 text-xs text-gray-500 italic border-t border-gray-200">
              Ghi chú: hàng chuyển hoàn và hàng tỉnh khác đã tính vào tổng sản lượng đến.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
