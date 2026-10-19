import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, X } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ChartWidget } from './dashboard/ChartWidget';
import { DashboardEditorToolbar } from './dashboard/editor/DashboardEditorToolbar';
import { WidgetToolbar } from './dashboard/editor/WidgetToolbar';
import ChartWidgetModal from './dashboard/editor/ChartWidgetModal';
import SystemWidgetModal from './dashboard/editor/SystemWidgetModal';
import ConfirmModal from './dashboard/editor/ConfirmModal';

const SIZE_CLASSES = {
  S: 'col-span-12 sm:col-span-6 lg:col-span-3',
  M: 'col-span-12 sm:col-span-6 lg:col-span-4',
  L: 'col-span-12 sm:col-span-6 lg:col-span-6',
  XL: 'col-span-12 lg:col-span-8',
  FULL: 'col-span-12',
};

function getWidgetMinHeight(widget) {
  if (widget.kind !== 'CHART') return '';
  const largeSizes = ['L', 'XL', 'FULL'];
  const tallCharts = ['BAR', 'BAR_H', 'LINE', 'DONUT'];
  if (tallCharts.includes(widget.chart_type) && largeSizes.includes(widget.size)) {
    return 'min-h-[360px]';
  }
  return 'min-h-[300px]';
}

export default function DashboardView({ isAdmin }) {
  const [widgets, setWidgets] = useState([]);
  const [widgetsData, setWidgetsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Editor states
  const [isEditMode, setIsEditMode] = useState(false);
  const [meta, setMeta] = useState(null);
  const [editChartWidget, setEditChartWidget] = useState(null);
  const [editSystemWidget, setEditSystemWidget] = useState(null);
  const [deleteWidget, setDeleteWidget] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [actionError, setActionError] = useState(null);
  
  // Create mode (add new chart)
  const [isAddingChart, setIsAddingChart] = useState(false);

  const fetchDashboard = (editMode = false) => {
    setLoading(true);
    setError(false);
    
    const dataQuery = editMode ? '?include_hidden=1' : '';
    
    Promise.all([
      apiFetch('/api/dashboard/widgets').then(r => {
        if (!r.ok) throw new Error("Widgets API Error");
        return r.json();
      }),
      apiFetch(`/api/dashboard/widgets-data${dataQuery}`).then(r => {
        if (!r.ok) throw new Error("Widgets Data API Error");
        return r.json();
      })
    ])
    .then(([widgetsRes, widgetsDataRes]) => {
      const allWidgets = widgetsRes.items || [];
      const visibleWidgets = editMode ? allWidgets : allWidgets.filter(w => w.visible === true);
      
      setWidgets(visibleWidgets);
      setWidgetsData(widgetsDataRes);
      setLoading(false);
    })
    .catch(err => {
      console.error("Error loading dashboard:", err);
      setError(true);
      setLoading(false);
    });
  };

  const fetchMeta = async () => {
    if (meta) return;
    try {
      const res = await apiFetch('/api/dashboard/widgets-meta');
      if (res.ok) {
        const data = await res.json();
        setMeta(data);
      }
    } catch (e) {
      console.error("Error fetching meta", e);
    }
  };

  useEffect(() => {
    fetchDashboard(isEditMode);
    if (isEditMode) {
      fetchMeta();
    }
  }, [isEditMode]);

  const handleToggleEditMode = () => {
    setIsEditMode(!isEditMode);
    setActionError(null);
  };

  const handleToggleVisible = async (widget) => {
    setActionError(null);
    try {
      const res = await apiFetch(`/api/dashboard/widgets/${widget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !widget.visible })
      });
      if (res.ok) {
        fetchDashboard(true);
      } else {
        const data = await res.json();
        setActionError(data.error || 'Ẩn/hiện ô thất bại');
      }
    } catch (e) {
      setActionError(e.message || 'Lỗi mạng khi ẩn/hiện ô');
    }
  };

  const handleMove = async (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === widgets.length - 1) return;
    setActionError(null);
    
    const newWidgets = [...widgets];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    const temp = newWidgets[index];
    newWidgets[index] = newWidgets[targetIndex];
    newWidgets[targetIndex] = temp;
    
    // Optimistic update
    setWidgets(newWidgets);
    
    try {
      const res = await apiFetch('/api/dashboard/widgets-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newWidgets.map(w => w.id) })
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || 'Di chuyển ô thất bại');
        fetchDashboard(true); // Revert on error
      }
    } catch (e) {
      setActionError(e.message || 'Lỗi mạng khi di chuyển ô');
      fetchDashboard(true);
    }
  };

  const confirmDelete = async () => {
    if (!deleteWidget) return;
    setActionError(null);
    try {
      const res = await apiFetch(`/api/dashboard/widgets/${deleteWidget.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDeleteWidget(null);
        fetchDashboard(true);
      } else {
        const data = await res.json();
        setActionError(data.error || 'Xoá ô thất bại');
      }
    } catch (e) {
      setActionError(e.message || 'Lỗi mạng khi xoá ô');
    }
  };

  const confirmReset = async () => {
    setActionError(null);
    try {
      const res = await apiFetch('/api/dashboard/widgets-reset', {
        method: 'POST'
      });
      if (res.ok) {
        setShowResetConfirm(false);
        fetchDashboard(true);
      } else {
        const data = await res.json();
        setActionError(data.error || 'Khôi phục mặc định thất bại');
      }
    } catch (e) {
      setActionError(e.message || 'Lỗi mạng khi khôi phục');
    }
  };

  if (loading && !widgetsData) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[600px] gap-3">
        <div className="w-10 h-10 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500 font-medium">Đang tải số liệu Dashboard...</p>
      </div>
    );
  }

  if (error && !widgetsData) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[600px] gap-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-500">
          <AlertCircle className="w-8 h-8" />
        </div>
        <p className="text-sm text-gray-600 font-medium">Không thể tải dữ liệu Dashboard.</p>
        <button onClick={() => fetchDashboard(isEditMode)} className="flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">
          <RefreshCw className="w-4 h-4" /> Thử lại
        </button>
      </div>
    );
  }

  const renderWidgetContent = (widget) => {
    // Ô SYSTEM: chưa có ô hệ thống nào được cài đặt -> không hiển thị (system_key lạ bị bỏ qua).
    if (widget.kind === 'SYSTEM') return null;
    if (widget.kind === 'CHART') {
      const wData = widgetsData && widgetsData[widget.id];
      return <ChartWidget widget={widget} data={wData} />;
    }
    return null;
  };

  const renderWidget = (widget, index) => {
    const sizeClass = SIZE_CLASSES[widget.size] || SIZE_CLASSES['M'];
    const minHeightClass = getWidgetMinHeight(widget);
    const content = renderWidgetContent(widget);
    
    if (!content) return null;

    const wrapperClass = `${sizeClass} ${minHeightClass}`;

    if (isEditMode) {
      return (
        <div key={widget.id} className={wrapperClass}>
          <WidgetToolbar
            widget={widget}
            isFirst={index === 0}
            isLast={index === widgets.length - 1}
            onEdit={() => widget.kind === 'SYSTEM' ? setEditSystemWidget(widget) : setEditChartWidget(widget)}
            onToggleVisible={() => handleToggleVisible(widget)}
            onMoveUp={() => handleMove(index, 'up')}
            onMoveDown={() => handleMove(index, 'down')}
            onDelete={() => setDeleteWidget(widget)}
          >
            {content}
          </WidgetToolbar>
        </div>
      );
    }

    return (
      <div key={widget.id} className={wrapperClass}>
        {content}
      </div>
    );
  };

  const canAddMore = meta ? widgets.length < meta.maxWidgets : false;

  return (
    <div className="p-6 font-sans">
      {loading && (
        <div className="fixed top-24 right-6 bg-white shadow-lg rounded-full p-2 z-50 animate-pulse">
          <RefreshCw className="w-5 h-5 text-[#F97316] animate-spin" />
        </div>
      )}
      
      {isAdmin && (
        <DashboardEditorToolbar
          isEditMode={isEditMode}
          onToggleEditMode={handleToggleEditMode}
          canAddMore={canAddMore}
          onAddWidget={() => setIsAddingChart(true)}
          onResetDefault={() => setShowResetConfirm(true)}
        />
      )}

      {actionError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-[12px] mb-6 flex items-center justify-between shadow-sm border border-red-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium text-sm">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600" aria-label="Đóng thông báo">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 bg-white rounded-[12px] shadow-[0_20px_27px_rgba(0,0,0,.05)]">
          <div className="text-lg font-medium">Dashboard chưa có ô nào hiển thị</div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6 items-stretch">
          {widgets.map((widget, index) => renderWidget(widget, index))}
        </div>
      )}

      {/* Editor Modals */}
      {(isAddingChart || editChartWidget) && meta && (
        <ChartWidgetModal
          widget={editChartWidget}
          meta={meta}
          onClose={() => { setIsAddingChart(false); setEditChartWidget(null); }}
          onSuccess={(newId) => {
            setIsAddingChart(false);
            setEditChartWidget(null);
            fetchDashboard(true);
          }}
        />
      )}

      {editSystemWidget && (
        <SystemWidgetModal
          widget={editSystemWidget}
          onClose={() => setEditSystemWidget(null)}
          onSuccess={() => {
            setEditSystemWidget(null);
            fetchDashboard(true);
          }}
        />
      )}

      {deleteWidget && (
        <ConfirmModal
          title="Xác nhận xoá"
          message={`Xoá ô '${deleteWidget.title}'? Không hoàn tác được.`}
          isDestructive={true}
          confirmText="Xoá"
          onCancel={() => setDeleteWidget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {showResetConfirm && (
        <ConfirmModal
          title="Khôi phục mặc định"
          message="Toàn bộ ô tuỳ chỉnh sẽ bị xoá và Dashboard trở về 3 ô mặc định. Áp dụng cho TẤT CẢ người dùng."
          isDestructive={true}
          confirmText="Khôi phục"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={confirmReset}
        />
      )}
    </div>
  );
}
