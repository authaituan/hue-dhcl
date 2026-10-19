import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  PieChart, Pie, Legend, LineChart, Line
} from 'recharts';
import { AlertCircle } from 'lucide-react';

const STATUS_COLORS = {
  'IN_USE': 'bg-[#1F7A5C]',
  'IN_STOCK': 'bg-[#6B2F94]',
  'MAINTENANCE': 'bg-[#E0A82E]',
  'BROKEN': 'bg-[#B3202A]',
  'LIQUIDATED': 'bg-[#9A8AA0]'
};

const STATUS_LABELS = {
  'IN_USE': 'Đang sử dụng',
  'IN_STOCK': 'Trong kho',
  'MAINTENANCE': 'Bảo trì',
  'BROKEN': 'Hỏng',
  'LIQUIDATED': 'Thanh lý'
};

const DONUT_COLORS = ['#4A1D6E', '#6B2F94', '#E0A82E', '#1F7A5C', '#5A4A62', '#9A8AA0'];
const OTHER_COLOR = '#9A8AA0'; // Gray for "Khác"

function prepareChartData(data, groupBy, chartType) {
  if (!data || !data.items) return [];
  const processed = data.items.map(item => {
    let label = item.label || 'Chưa xác định';
    if (groupBy === 'status' && STATUS_LABELS[label]) {
      label = STATUS_LABELS[label];
    }
    return { ...item, label };
  });

  const hideOther = ['BAR', 'BAR_H', 'LINE'].includes(chartType);
  if (!hideOther && data.other > 0) {
    processed.push({ label: 'Khác', count: data.other, isOther: true });
  }
  return processed;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse h-full flex flex-col justify-between">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-6"></div>
      <div className="flex-1 bg-gray-100 rounded"></div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
      <span className="text-sm text-gray-500">Không tính được dữ liệu của ô này</span>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">
      Không có dữ liệu
    </div>
  );
}

export function ChartWidget({ widget, data }) {
  if (data && data.error) {
    return (
      <div className="bg-white rounded-[12px] shadow-[0_20px_27px_rgba(0,0,0,.05)] p-5 h-full">
        <ErrorCard />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-[12px] shadow-[0_20px_27px_rgba(0,0,0,.05)] p-5 h-full">
        <LoadingSkeleton />
      </div>
    );
  }

  const { chart_type, title, group_by } = widget;
  const chartData = prepareChartData(data, group_by, chart_type);
  const isEmpty = chartData.length === 0 && chart_type !== 'NUMBER';

  const renderContent = () => {
    if (isEmpty) return <EmptyCard />;

    switch (chart_type) {
      case 'NUMBER':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-[28px] font-bold text-gray-800">{data.total || 0}</div>
            <div className="text-sm font-medium text-gray-500 mt-1">{title}</div>
          </div>
        );

      case 'BAR':
        return (
          <div className="flex-1 w-full -ml-4 mt-2 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#F0E8D4" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: '#7A6A80', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  tick={{ fill: '#7A6A80', fontSize: 11 }} 
                  tickLine={false} 
                  axisLine={false} 
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#FFFBEF' }}
                />
                <Bar dataKey="count" name="Số lượng" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isOther ? OTHER_COLOR : '#4A1D6E'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'BAR_H':
        return (
          <div className="flex-1 w-full -ml-4 mt-2 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#F0E8D4" />
                <XAxis 
                  type="number"
                  tick={{ fill: '#7A6A80', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  type="category"
                  dataKey="label" 
                  tick={{ fill: '#7A6A80', fontSize: 11 }} 
                  tickLine={false} 
                  axisLine={false} 
                  width={100}
                  tickFormatter={(val) => val.length > 12 ? val.substring(0, 12) + '...' : val}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#FFFBEF' }}
                />
                <Bar dataKey="count" name="Số lượng" radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isOther ? OTHER_COLOR : '#4A1D6E'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'DONUT':
        return (
          <div className="flex-1 w-full mt-2 relative min-h-[250px] h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="label"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isOther ? OTHER_COLOR : DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'LINE':
        return (
          <div className="flex-1 w-full -ml-4 mt-2 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#F0E8D4" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: '#7A6A80', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  angle={-30}
                  textAnchor="end"
                  height={40}
                />
                <YAxis 
                  tick={{ fill: '#7A6A80', fontSize: 11 }} 
                  tickLine={false} 
                  axisLine={false} 
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  name="Số lượng"
                  stroke="#4A1D6E" 
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#4A1D6E', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'LIST':
        return (
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 mt-2 min-h-[250px]">
            {chartData.map((item, idx) => {
              const p = data.total > 0 ? (item.count / data.total) * 100 : 0;
              let barColor = 'bg-[#4A1D6E]'; // default for list
              if (item.isOther) {
                barColor = 'bg-gray-400';
              } else if (group_by === 'status') {
                // Find matching color from STATUS_COLORS using the original English key or Vietnamese label
                // item.label is already in Vietnamese (from prepareChartData)
                if (item.label === 'Đang sử dụng') barColor = 'bg-[#1F7A5C]';
                else if (item.label === 'Trong kho') barColor = 'bg-[#6B2F94]';
                else if (item.label === 'Bảo trì') barColor = 'bg-[#E0A82E]';
                else if (item.label === 'Hỏng') barColor = 'bg-[#B3202A]';
                else if (item.label === 'Thanh lý') barColor = 'bg-[#9A8AA0]';
                else barColor = 'bg-gray-400';
              }

              return (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700 truncate mr-2" title={item.label}>{item.label}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${Math.min(p, 100)}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'TABLE':
        return (
          <div className="flex-1 overflow-y-auto mt-2 min-h-[250px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-semibold">Nhãn</th>
                  <th className="px-4 py-2 font-semibold text-right">Số lượng</th>
                  <th className="px-4 py-2 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((item, idx) => {
                  const p = data.total > 0 ? ((item.count / data.total) * 100).toFixed(1) : 0;
                  return (
                    <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-700 max-w-[150px] truncate" title={item.label}>
                        {item.label}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{item.count}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{p}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

      default:
        return <div className="text-sm text-gray-400">Loại biểu đồ không được hỗ trợ</div>;
    }
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0_20px_27px_rgba(0,0,0,.05)] p-5 h-full flex flex-col">
      {chart_type !== 'NUMBER' && (
        <h6 className="font-bold text-gray-800 text-base mb-2 shrink-0">{title}</h6>
      )}
      {renderContent()}
    </div>
  );
}
