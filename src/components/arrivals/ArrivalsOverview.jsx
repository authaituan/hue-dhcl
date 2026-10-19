import React, { useState, useEffect, useMemo } from 'react';
import { apiFetchJson } from '../../utils/api';
import { Loader2, Package, MapPin, Scale, Box, AlertOctagon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';

function BcvhComparisonTable({ filters, bcvhList, cardSanLuong }) {
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

  // Tính chênh lệch N = (tổng các dòng) - (số trên thẻ) (DASH-8a, canvas bảng 2, phương án B)
  const noteInfo = useMemo(() => {
    if (loading || !tableData || !Array.isArray(tableData) || tableData.length < 2) {
      return null;
    }
    if (typeof cardSanLuong !== 'number' || isNaN(cardSanLuong)) {
      return null;
    }
    const expectedCount = Array.isArray(filters?.receiver_code) ? filters.receiver_code.length : 0;
    if (expectedCount < 2 || tableData.length !== expectedCount) {
      return null;
    }
    const sumRows = tableData.reduce((acc, r) => acc + (typeof r.san_luong === 'number' && !isNaN(r.san_luong) ? r.san_luong : 0), 0);
    const diffN = sumRows - cardSanLuong;
    if (diffN > 0) {
      return {
        xStr: sumRows.toLocaleString('vi-VN'),
        nStr: diffN.toLocaleString('vi-VN')
      };
    }
    return null;
  }, [loading, tableData, cardSanLuong, filters?.receiver_code]);

  if (filters.receiver_code.length < 2) return null;

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 shadow-none overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-cream-head flex justify-between items-center">
        <h3 className="hue-h2 text-[17px]">So sánh các BCVH đang chọn</h3>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-cream-head text-gray-600 text-xs font-bold uppercase border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">BCVH</th>
              <th className="px-4 py-3 text-right">SẢN LƯỢNG ĐẾN</th>
              <th className="px-4 py-3 text-right">TÚI/KIỆN</th>
              <th className="px-4 py-3 text-right">KHỐI LƯỢNG (KG)</th>
              <th className="px-4 py-3 text-right">HÀNG ĐI NGOÀI</th>
              <th className="px-4 py-3 text-right">ĐỦ TRẠNG THÁI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-line">
            {tableData.map(row => (
              <tr key={row.code} className="hover:bg-amber-50/40">
                <td className="px-4 py-3 font-medium text-orange-600">{row.ten}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-600 tabular-nums">{row.san_luong.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.tui_kien.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{(row.khoi_luong_g / 1000).toLocaleString('vi-VN', {maximumFractionDigits:1})}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.hang_di_ngoai.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.du_trang_thai.toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {noteInfo && (
        <div className="p-3 bg-amber-50/80 border-t border-amber-200 text-xs text-amber-900 leading-relaxed">
          Cộng các dòng là {noteInfo.xStr}, cao hơn thẻ {noteInfo.nStr} bưu gửi: {noteInfo.nStr} bưu gửi đến từ 2 BCVH trở lên nên mỗi dòng đếm riêng, thẻ chỉ đếm một lần.
        </div>
      )}
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
          <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-orange-500 p-4 flex flex-col justify-between shadow-none">
            <div className="hue-label mb-1">SẢN LƯỢNG ĐẾN</div>
            <span className="hue-num-30 text-orange-600 my-1">{sum.san_luong.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-gray-400">đã lọc trùng</span>
          </div>
          <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-orange-500 p-4 flex flex-col justify-between shadow-none">
            <div className="hue-label mb-1">ĐỊA BÀN PHÁT</div>
            <span className="hue-num-30 text-orange-600 my-1">
              {sum.dia_ban_phat.co}{isAllBcvh ? `/40` : ''}
            </span>
            <span className="text-xs text-gray-400">phường/xã {isAllBcvh ? 'của thành phố' : 'có bưu gửi'}</span>
          </div>
          <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-orange-500 p-4 flex flex-col justify-between shadow-none">
            <div className="hue-label mb-1">KHỐI LƯỢNG</div>
            <span className="hue-num-30 text-orange-600 my-1">
              {(sum.khoi_luong_g / 1000).toLocaleString('vi-VN', {maximumFractionDigits:1})} <span className="text-sm font-sans font-bold text-gray-600">kg</span>
            </span>
            <span className="text-xs text-gray-400 invisible">&nbsp;</span>
          </div>
          <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-orange-500 p-4 flex flex-col justify-between shadow-none">
            <div className="hue-label mb-1">TÚI/KIỆN</div>
            <span className="hue-num-30 text-orange-600 my-1">{sum.tui_kien.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-gray-400 invisible">&nbsp;</span>
          </div>
          <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-orange-500 p-4 flex flex-col justify-between shadow-none">
            <div className="hue-label mb-1">HÀNG ĐI NGOÀI</div>
            <span className="hue-num-30 text-orange-600 my-1">{sum.hang_di_ngoai.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-gray-400">Tỉ trọng: {sum.ty_le_hang_di_ngoai.toLocaleString('vi-VN')}%</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none p-4 flex items-center justify-center text-red-500 h-24 text-sm font-medium">
          Lỗi tải dữ liệu chỉ số tổng quan. {data.errors?.summary}
        </div>
      )}

      <BcvhComparisonTable filters={filters} bcvhList={bcvhList} cardSanLuong={sum?.san_luong} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none p-5">
          <h3 className="hue-h2 text-[17px] mb-4">Sản lượng theo ngày</h3>
          <div className="h-64 w-full">
            {data.errors?.byTimeDay ? (
              <div className="flex items-center justify-center h-full text-red-500 text-sm font-medium">
                {data.errors.byTimeDay}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0E8D4" />
                  <XAxis dataKey="moc" tickFormatter={v => `${v.slice(8,10)}/${v.slice(5,7)}`} tick={{fontSize: 12, fill: '#7A6A80'}} />
                  <YAxis tickFormatter={v => v.toLocaleString('vi-VN')} tick={{fontSize: 12, fill: '#7A6A80'}} />
                  <RechartsTooltip formatter={(val) => val.toLocaleString('vi-VN')} labelFormatter={v => `Ngày: ${v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')}`} />
                  <Bar dataKey="san_luong" fill="#4A1D6E" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none p-5">
          <div className="mb-4">
            <h3 className="hue-h2 text-[17px]">Sản lượng theo giờ</h3>
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0E8D4" />
                  <XAxis dataKey="moc" tickFormatter={v => isAggregated ? `${v}h` : v.slice(11,16)} tick={{fontSize: 12, fill: '#7A6A80'}} />
                  <YAxis tickFormatter={v => v.toLocaleString('vi-VN')} tick={{fontSize: 12, fill: '#7A6A80'}} />
                  <RechartsTooltip 
                    formatter={(val) => val.toLocaleString('vi-VN')} 
                    labelFormatter={v => isAggregated ? `Giờ: ${v}h00` : `Thời gian: ${v.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})$/, '$3/$2/$1 $4:00')}`} 
                  />
                  <Bar dataKey="san_luong" fill="#6B2F94" radius={[4,4,0,0]} maxBarSize={40} />
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

      <div className="bg-white rounded-[14px] border border-gray-200 shadow-none overflow-hidden">
        <div className="p-4 border-b border-cream-line bg-cream-head">
          <h3 className="hue-h2 text-[17px]">Sản lượng theo Địa bàn phát</h3>
        </div>
        {data.errors?.byWard ? (
          <div className="p-4 text-red-500 text-sm font-medium">Lỗi tải dữ liệu địa bàn: {data.errors.byWard}</div>
        ) : (
          <>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm text-left">
                <thead className="bg-cream-head text-gray-600 text-xs font-bold uppercase border-b border-cream-line sticky top-0 z-10">
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
                    <tr key={w.ward_key} className="border-b border-cream-line/50 hover:bg-cream-light/40">
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
                    <tr key={n.nhom} className="bg-orange-50/50 hover:bg-orange-50 border-b border-cream-line">
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
            <div className="p-3 bg-cream-foot text-xs text-gray-500 italic border-t border-cream-line">
              Ghi chú: hàng chuyển hoàn và hàng tỉnh khác đã tính vào tổng sản lượng đến.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
