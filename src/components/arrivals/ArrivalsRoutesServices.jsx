import React from 'react';
import { Truck, Package, ArchiveX, MapPinOff } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Label
} from 'recharts';

export default function ArrivalsRoutesServices({ data }) {
  const routes = data.byRoute;
  const services = data.byService;

  if (!routes?.items?.length && !services?.items?.length && !routes?.chua_co_ten?.san_luong && !services?.chua_co_ten?.san_luong) {
    return (
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-none mt-6 h-48 flex items-center justify-center text-gray-500">
        Không có dữ liệu trong khoảng đã chọn
      </div>
    );
  }

  const formatHour = (hour) => {
    if (hour === null || hour === undefined) return '-';
    return `${hour}h - ${hour + 1}h`;
  };

  const hasSimilarRoutes = routes?.items?.some(r => r.ten && routes.items.some(r2 => r2 !== r && r2.ten.toLowerCase() === r.ten.toLowerCase()));

  // Service Donut Chart Data
  const SERVICE_COLORS = {
    'R': '#0ea5e9', // sky
    'C': '#f59e0b', // amber
    'E': '#10b981', // emerald
    'M': '#8b5cf6', // violet
    'B': '#ec4899', // pink
  };
  const GRAY_COLOR = '#9ca3af';

  const donutData = (services?.items || []).map(s => ({
    name: s.ten || s.ma,
    ma: s.ma,
    value: s.san_luong,
    ty_trong: s.ty_trong,
    color: s.ma && SERVICE_COLORS[s.ma[0]] ? SERVICE_COLORS[s.ma[0]] : SERVICE_COLORS['R']
  }));
  if (services?.chua_co_ten?.san_luong > 0) {
    donutData.push({
      name: 'Chưa có tên',
      ma: '?',
      value: services.chua_co_ten.san_luong,
      ty_trong: services.chua_co_ten.ty_trong,
      color: GRAY_COLOR
    });
  }
  const totalServices = donutData.reduce((acc, curr) => acc + curr.value, 0);

  // Route Bar Chart Data
  const routeBarData = (routes?.items || []).map(r => ({
    name: r.ten,
    'Còn lại': r.san_luong - (r.hang_di_ngoai || 0),
    'Hàng đi ngoài': r.hang_di_ngoai || 0,
    tong: r.san_luong,
    ty_trong: r.ty_trong
  }));

  const renderPercentageBar = (pct) => (
    <div className="flex items-center justify-end gap-2">
      <span className="w-10 text-gray-600 text-xs text-right">{pct}%</span>
      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500" style={{ width: `${Math.min(pct, 100)}%` }}></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 mt-6">
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-blue-500 shadow-none p-4">
          <div className="flex items-center justify-between">
            <p className="hue-label text-blue-600 mb-1">Đường thư có tên</p>
            <Truck className="w-5 h-5 text-blue-500 opacity-80" />
          </div>
          <p className="hue-num-sm text-blue-700 mt-2">{routes?.items?.length || 0}</p>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-emerald-500 shadow-none p-4">
          <div className="flex items-center justify-between">
            <p className="hue-label text-emerald-600 mb-1">Dịch vụ có tên</p>
            <Package className="w-5 h-5 text-emerald-500 opacity-80" />
          </div>
          <p className="hue-num-sm text-emerald-700 mt-2">{services?.items?.length || 0}</p>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-gray-400 shadow-none p-4">
          <div className="flex items-center justify-between">
            <p className="hue-label text-gray-600 mb-1">Chưa có tên đường thư</p>
            <MapPinOff className="w-5 h-5 text-gray-500 opacity-80" />
          </div>
          <p className="hue-num-sm text-gray-700 mt-2">{(routes?.chua_co_ten?.san_luong || 0).toLocaleString('vi-VN')}</p>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 border-t-4 border-t-gray-400 shadow-none p-4">
          <div className="flex items-center justify-between">
            <p className="hue-label text-gray-600 mb-1">Chưa có tên dịch vụ</p>
            <ArchiveX className="w-5 h-5 text-gray-500 opacity-80" />
          </div>
          <p className="hue-num-sm text-gray-700 mt-2">{(services?.chua_co_ten?.san_luong || 0).toLocaleString('vi-VN')}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none p-5 lg:col-span-2">
          <h3 className="hue-h2 text-[17px] mb-4">Sản lượng theo đường thư</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={routeBarData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#eee" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <RechartsTooltip formatter={(val) => val.toLocaleString('vi-VN')} cursor={{fill: 'transparent'}} />
                <Bar dataKey="Còn lại" stackId="a" fill="#F97316" radius={[0,0,0,0]} />
                <Bar dataKey="Hàng đi ngoài" stackId="a" fill="#fca5a5" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none p-5">
          <h3 className="hue-h2 text-[17px] mb-4">Cơ cấu dịch vụ</h3>
          <div className="h-[250px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <Label 
                    value={totalServices.toLocaleString('vi-VN')} 
                    position="centerBottom" 
                    className="text-xl font-bold fill-gray-800"
                    dy={-5}
                  />
                  <Label 
                    value="tổng cộng" 
                    position="centerTop" 
                    className="text-xs fill-gray-500"
                    dy={15}
                  />
                </Pie>
                <RechartsTooltip formatter={(val) => val.toLocaleString('vi-VN')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {donutData.map((d, i) => (
              <div key={i} className="flex items-center text-xs text-gray-600">
                <span className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: d.color }}></span>
                {d.ma !== '?' ? `${d.ma} (${d.ty_trong}%)` : `Chưa tên (${d.ty_trong}%)`}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none flex flex-col overflow-hidden">
          <div className="p-4 border-b border-cream-line bg-cream-head">
            <h3 className="hue-h2 text-[17px]">Chi tiết Đường thư</h3>
          </div>
          <div className="overflow-x-auto max-h-[300px] flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-cream-head text-gray-600 font-semibold border-b border-cream-line sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2">Tên</th>
                  <th className="px-4 py-2 text-right">Sản lượng</th>
                  <th className="px-4 py-2 text-right">Tỷ trọng</th>
                  <th className="px-4 py-2 text-right">Hàng đi ngoài</th>
                </tr>
              </thead>
              <tbody>
                {routes?.items.map((r, i) => (
                  <tr key={i} className="border-b border-cream-line/50 hover:bg-cream-light/30">
                    <td className="px-4 py-2 font-medium text-gray-800">{r.ten}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.san_luong.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2">{renderPercentageBar(r.ty_trong)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                      {r.hang_di_ngoai.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
                {routes?.chua_co_ten?.san_luong > 0 && (
                  <tr className="bg-cream-light/40 italic text-gray-500 border-b border-cream-line/50">
                    <td className="px-4 py-2 font-medium">{routes.chua_co_ten.ten}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{routes.chua_co_ten.san_luong.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2">{renderPercentageBar(routes.chua_co_ten.ty_trong)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {routes.chua_co_ten.hang_di_ngoai.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-gray-200 shadow-none flex flex-col overflow-hidden">
          <div className="p-4 border-b border-cream-line bg-cream-head">
            <h3 className="hue-h2 text-[17px]">Chi tiết Dịch vụ</h3>
          </div>
          <div className="overflow-x-auto max-h-[300px] flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-cream-head text-gray-600 font-semibold border-b border-cream-line sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2">Dịch vụ</th>
                  <th className="px-4 py-2 text-right">Sản lượng</th>
                  <th className="px-4 py-2 text-right">Tỷ trọng</th>
                  <th className="px-4 py-2 text-right">KL TB (g)</th>
                </tr>
              </thead>
              <tbody>
                {services?.items.map((s, i) => (
                  <tr key={i} className="border-b border-cream-line/50 hover:bg-cream-light/30">
                    <td className="px-4 py-2 font-medium text-gray-800">{s.ten || s.ma}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.san_luong.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2">{renderPercentageBar(s.ty_trong)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{s.khoi_luong_tb_g.toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
                {services?.chua_co_ten?.san_luong > 0 && (
                  <tr className="bg-cream-light/40 italic text-gray-500 border-b border-cream-line/50">
                    <td className="px-4 py-2 font-medium">{services.chua_co_ten.ten}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{services.chua_co_ten.san_luong.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2">{renderPercentageBar(services.chua_co_ten.ty_trong)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{services.chua_co_ten.khoi_luong_tb_g.toLocaleString('vi-VN')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {hasSimilarRoutes && (
        <p className="text-xs text-gray-400 italic">Hai tên đường thư gần giống nhau đang được tính riêng.</p>
      )}
    </div>
  );
}
