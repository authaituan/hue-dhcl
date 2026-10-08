import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, BarChart2, PieChart as PieChartIcon, AlignLeft, Table as TableIcon, Hash, Search } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { ChartWidget } from '../ChartWidget';

const SIZES = [
  { value: 'S', label: 'S (1/4 hàng)', cols: 3 },
  { value: 'M', label: 'M (1/3 hàng)', cols: 4 },
  { value: 'L', label: 'L (1/2 hàng)', cols: 6 },
  { value: 'XL', label: 'XL (2/3 hàng)', cols: 8 },
  { value: 'FULL', label: 'FULL (Toàn hàng)', cols: 12 }
];

const CHART_ICONS = {
  'BAR': BarChart2,
  'BAR_H': AlignLeft,
  'DONUT': PieChartIcon,
  'LINE': BarChart2, // using BarChart2 for LINE too or LineChart if available
  'LIST': AlignLeft,
  'TABLE': TableIcon,
  'NUMBER': Hash
};

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function ChartWidgetModal({ widget, meta, onClose, onSuccess }) {
  const isEdit = !!widget;
  
  // State
  const [title, setTitle] = useState(widget?.title || '');
  const [sourceKey, setSourceKey] = useState(widget?.source || (meta.sources[0]?.key || 'POST_OFFICE'));
  const [groupBy, setGroupBy] = useState(widget?.group_by || '');
  const [chartType, setChartType] = useState(widget?.chart_type || 'BAR');
  const [topN, setTopN] = useState(widget?.top_n || meta.topN.default);
  const [filters, setFilters] = useState(widget?.filters || {});
  const [size, setSize] = useState(widget?.size || 'M');
  const [visible, setVisible] = useState(widget ? widget.visible : true);

  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [notice, setNotice] = useState('');

  const source = meta.sources.find(s => s.key === sourceKey) || meta.sources[0];
  
  // Ensure groupBy is valid
  useEffect(() => {
    if (chartType === 'NUMBER') {
      if (groupBy !== null) setGroupBy(null);
      return;
    }
    if (!groupBy || !source.fields.find(f => f.key === groupBy)) {
      setGroupBy(source.fields[0]?.key || '');
    }
  }, [sourceKey, chartType, groupBy, source.fields]);

  const selectedField = source.fields.find(f => f.key === groupBy);

  // Validate chart type
  useEffect(() => {
    if (chartType === 'NUMBER') return; // Valid anywhere
    if (!selectedField) return;
    const allowedTypes = selectedField.chartTypes || [];
    if (!allowedTypes.includes(chartType)) {
      setNotice(`Loại biểu đồ hiện tại không hợp lệ với trường "${selectedField.label}", đã chuyển về BAR.`);
      setChartType(allowedTypes.includes('BAR') ? 'BAR' : allowedTypes[0]);
    }
  }, [groupBy, selectedField, chartType]);

  // Preview Debouncing
  const configString = JSON.stringify({
    title: title.trim() || 'Xem trước',
    size: size,
    source: sourceKey,
    group_by: chartType === 'NUMBER' ? null : groupBy,
    chart_type: chartType,
    top_n: topN,
    filters
  });
  const debouncedConfigString = useDebounce(configString, 400);
  const fetchController = useRef(null);

  useEffect(() => {
    async function fetchPreview() {
      const debouncedConfig = JSON.parse(debouncedConfigString);
      if (!debouncedConfig.source || (!debouncedConfig.group_by && debouncedConfig.chart_type !== 'NUMBER')) {
        return; // Missing required fields
      }
      setPreviewLoading(true);
      setPreviewError(null);
      
      if (fetchController.current) {
        fetchController.current.abort();
      }
      fetchController.current = new AbortController();

      try {
        const res = await apiFetch('/api/dashboard/widgets-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(debouncedConfig),
          signal: fetchController.current.signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi xem trước');
        setPreviewData(data.data);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setPreviewError(err.message);
        setPreviewData(null);
      } finally {
        setPreviewLoading(false);
      }
    }
    fetchPreview();
  }, [debouncedConfigString]);

  // Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSourceChange = (e) => {
    setSourceKey(e.target.value);
    setGroupBy('');
    setFilters({});
    setNotice('Đã đặt lại nhóm theo và bộ lọc do đổi nguồn dữ liệu.');
  };

  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => {
      const next = { ...prev, [filterKey]: value };
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[filterKey];
      }
      return next;
    });
  };

  const clearFilters = () => setFilters({});

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('Tiêu đề không được để trống');
      return;
    }
    if (previewError) {
      setSaveError('Vui lòng sửa lỗi cấu hình trước khi lưu');
      return;
    }
    
    setSaveLoading(true);
    setSaveError(null);
    const payload = {
      title: title.trim(),
      source: sourceKey,
      group_by: chartType === 'NUMBER' ? null : groupBy,
      chart_type: chartType,
      top_n: topN,
      filters,
      size,
      visible,
      kind: 'CHART'
    };

    try {
      const url = isEdit ? `/api/dashboard/widgets/${widget.id}` : '/api/dashboard/widgets';
      const res = await apiFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi lưu biểu đồ');
      onSuccess(data.id || widget?.id);
    } catch (err) {
      setSaveError(err.message);
      setSaveLoading(false);
    }
  };

  // UI Helpers
  const renderFilterInput = (filterDef) => {
    const val = filters[filterDef.key];
    
    if (filterDef.type === 'single') {
      return (
        <select
          value={val || ''}
          onChange={e => handleFilterChange(filterDef.key, e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] outline-none"
        >
          <option value="">Tất cả</option>
          {(filterDef.options || []).map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    if (filterDef.type === 'year') {
      return (
        <input
          type="number"
          placeholder="VD: 2024"
          value={val || ''}
          onChange={e => handleFilterChange(filterDef.key, e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] outline-none"
        />
      );
    }

    if (filterDef.type === 'multi' || filterDef.type === 'ids') {
      const selectedIds = Array.isArray(val) ? val : [];
      const toggle = (id) => {
        if (selectedIds.includes(id)) {
          handleFilterChange(filterDef.key, selectedIds.filter(x => x !== id));
        } else {
          handleFilterChange(filterDef.key, [...selectedIds, id]);
        }
      };

      const options = filterDef.options || [];
      const isLongList = options.length > 10;
      // We could add a local search state here if needed, but for simplicity we'll just render a scrollable div
      // A full implementation would use a small local state for searching within this specific filter.

      return (
        <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto bg-gray-50/50">
          <div className="space-y-1.5">
            {options.map(opt => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="mt-1 text-[#F97316] rounded focus:ring-[#F97316]"
                />
                <span className="text-sm text-gray-700 leading-tight">{opt.label}</span>
              </label>
            ))}
            {options.length === 0 && <div className="text-xs text-gray-400 p-1">Không có tuỳ chọn</div>}
          </div>
        </div>
      );
    }

    return null;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-lg text-gray-800">{isEdit ? 'Sửa biểu đồ' : 'Thêm biểu đồ'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row min-h-0">
          
          {/* Form Column */}
          <div className="flex-1 p-6 space-y-6 lg:border-r border-gray-100 overflow-y-auto">
            {notice && (
              <div className="bg-gray-50 text-gray-700 text-sm p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tiêu đề <span className="text-red-500">*</span></label>
              <input
                type="text"
                autoFocus
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] outline-none"
                placeholder="VD: Số bưu cục theo tình trạng..."
              />
              <div className="text-right text-xs text-gray-400 mt-1">{title.length}/80</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nguồn dữ liệu</label>
                <select
                  value={sourceKey}
                  onChange={handleSourceChange}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] outline-none"
                >
                  {meta.sources.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              {chartType !== 'NUMBER' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nhóm theo</label>
                  <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F97316]/50 focus:border-[#F97316] outline-none"
                  >
                    {source.fields.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Loại biểu đồ</label>
              <div className="flex flex-wrap gap-2">
                {meta.chartTypes.map(type => {
                  const Icon = CHART_ICONS[type] || BarChart2;
                  let isValid = true;
                  let reason = '';
                  if (type === 'NUMBER') {
                    isValid = true;
                  } else if (selectedField) {
                    const allowed = selectedField.chartTypes || [];
                    isValid = allowed.includes(type);
                    if (!isValid) {
                      reason = `Không hỗ trợ trường "${selectedField.label}"`;
                      if (type === 'LINE' && !selectedField.ordered) reason = 'Chỉ dùng cho trường có tính thứ tự (Năm, Tháng...)';
                    }
                  }

                  return (
                    <button
                      key={type}
                      onClick={() => isValid && setChartType(type)}
                      disabled={!isValid}
                      title={reason}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        !isValid ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' :
                        chartType === type 
                          ? 'border-[#F97316] bg-orange-50 text-[#CC4A0A]' 
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {chartType !== 'NUMBER' && chartType !== 'LINE' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                  <span>Top N (hiển thị tối đa)</span>
                  <span className="text-[#F97316] font-bold">{topN}</span>
                </label>
                <input
                  type="range"
                  min={meta.topN.min}
                  max={meta.topN.max}
                  value={topN}
                  onChange={(e) => setTopN(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F97316]"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Phần còn lại gộp thành 'Khác' (không hiện ở biểu đồ cột).
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">Bộ lọc</label>
                {Object.keys(filters).length > 0 && (
                  <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Xoá bộ lọc</button>
                )}
              </div>
              {source.filters.length > 0 ? (
                <div className="space-y-4">
                  {source.filters.map(filterDef => (
                    <div key={filterDef.key}>
                      <div className="text-xs font-medium text-gray-600 mb-1">{filterDef.label}</div>
                      {renderFilterInput(filterDef)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Không có bộ lọc nào cho nguồn này.</div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Kích cỡ ô (trên màn hình lớn)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SIZES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setSize(s.value)}
                    className={`px-2 py-2 flex flex-col items-center gap-1 rounded-lg border text-sm font-medium transition-colors ${
                      size === s.value 
                        ? 'border-[#F97316] bg-orange-50 text-[#CC4A0A]' 
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{s.label}</span>
                    <div className="flex gap-0.5 w-full max-w-[60px] opacity-60">
                      {[...Array(12)].map((_, i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-sm ${i < s.cols ? (size === s.value ? 'bg-[#CC4A0A]' : 'bg-gray-400') : 'bg-gray-200'}`}></div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="text-sm font-semibold text-gray-700">Trạng thái:</label>
              <button
                onClick={() => setVisible(!visible)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${visible ? 'bg-[#22C55E]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${visible ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium text-gray-600">{visible ? 'Đang hiện' : 'Đang ẩn'}</span>
            </div>

            {saveError && <div className="text-sm text-red-600 mt-2 bg-red-50 p-3 rounded-lg border border-red-100">{saveError}</div>}
          </div>

          {/* Preview Column */}
          <div className="flex-1 bg-gray-50 p-6 flex flex-col">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              Xem trước
              {previewLoading && <span className="w-3 h-3 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin"></span>}
            </h4>
            
            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
              {previewError ? (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-red-600 text-sm font-medium">{previewError}</p>
                </div>
              ) : (
                <div className={`transition-opacity duration-300 ${previewLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  {/* Reuse ChartWidget */}
                  <ChartWidget 
                    widget={{ title: title || 'Chưa có tiêu đề', chart_type: chartType, group_by: chartType === 'NUMBER' ? null : groupBy }} 
                    data={previewData} 
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white flex justify-end gap-3 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saveLoading || !!previewError}
            className="px-4 py-2 bg-[#CC4A0A] hover:bg-[#B83F08] text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {saveLoading ? 'Đang lưu...' : 'Lưu biểu đồ'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
