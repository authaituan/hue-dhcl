import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetchJson, apiFetch } from '../../utils/api';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import ArrivalsFilters from './ArrivalsFilters';
import ArrivalsOverview from './ArrivalsOverview';
import ArrivalsBd10Status from './ArrivalsBd10Status';
import ArrivalsRoutesServices from './ArrivalsRoutesServices';
import ArrivalsQuality from './ArrivalsQuality';
import ArrivalsLookup from './ArrivalsLookup';
import ArrivalsExport from './ArrivalsExport';
import { ArrivalsNotReceivedBanner, ArrivalsNotReceivedDetail } from './ArrivalsNotReceived';
import { ArrivalsBd10NotConfirmedBanner, ArrivalsBd10NotConfirmedDetail } from './ArrivalsBd10NotConfirmed';
import { formatToApiDate } from './dateUtils';

const DASHBOARD_BCVH = [
  { ma: '533140', ten: 'BCVH Thuận Hóa' },
  { ma: '535470', ten: 'BCVH Hương Trà' },
  { ma: '536250', ten: 'BCVH Hương Thủy' },
  { ma: '537015', ten: 'BCVH Thuận An' },
  { ma: '537220', ten: 'BCVH Phú Lộc' },
  { ma: '535790', ten: 'BCVH A Lưới' }
];

export default function ArrivalsView({ authUser }) {
  const isAdmin = authUser?.role === 'ADMIN';

  const [meta, setMeta] = useState(null);
  const [exportScope, setExportScope] = useState([]);
  
  // Lấy dữ liệu meta 1 lần
  useEffect(() => {
    async function loadInitial() {
      const [metaRes, scopeRes] = await Promise.all([
        apiFetchJson('/api/arrivals/meta'),
        apiFetchJson('/api/arrivals/export-scope')
      ]);
      if (metaRes.ok) setMeta(metaRes.data);
      if (scopeRes.ok) setExportScope(scopeRes.data.bcvh.map(b => b.ma));
    }
    loadInitial();
  }, []);

  const [filters, setFilters] = useState(() => {
    // Mặc định từ đầu tháng đến hiện tại? Hay 7 ngày?
    // PO: khoảng ngày mặc định chưa chốt. Lấy 7 ngày gần nhất.
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000); // 7 days inclusive
    return {
      from: formatToApiDate(from, false),
      to: formatToApiDate(to, true),
      receiver_code: [], // sẽ cập nhật lại khi meta load
      ward_key: ''
    };
  });

  // Default select assigned BCVH for GDVH if available
  useEffect(() => {
    if (exportScope.length > 0 && filters.receiver_code.length === 0) {
      if (authUser?.role === 'GDVH') {
        setFilters(f => ({ ...f, receiver_code: exportScope }));
      } else {
        // ADMIN / TTVH: default select first one or all? Let's default to all 6.
        setFilters(f => ({ ...f, receiver_code: DASHBOARD_BCVH.map(b => b.ma) }));
      }
    }
  }, [exportScope, authUser?.role]);

  const [activeTab, setActiveTab] = useState('overview');
  const [showNotReceivedDetail, setShowNotReceivedDetail] = useState(false);
  const [showBd10Detail, setShowBd10Detail] = useState(false);
  
  const [data, setData] = useState({
    summary: null,
    byRoute: null,
    byService: null,
    byWard: null,
    byTimeDay: null,
    byTimeHour: null,
    qualityMocs: null,
    exceptions: null,
    importStatus: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (currentFilters) => {
    if (!currentFilters.receiver_code.length) return; // Wait until receiver_code is set
    setLoading(true);
    setError(null);

    const q = new URLSearchParams();
    q.set('from', currentFilters.from);
    q.set('to', currentFilters.to);
    if (currentFilters.ward_key) q.set('ward_key', currentFilters.ward_key);
    currentFilters.receiver_code.forEach(c => q.append('receiver_code', c));

    try {
      const qs = q.toString();
      
      const fDate = new Date(currentFilters.from.substring(0, 10));
      const tDate = new Date(currentFilters.to.substring(0, 10));
      const diffDays = Math.round((tDate - fDate) / 86400000);
      const allowHourly = (diffDays + 1) <= 7;

      const promises = [
        apiFetchJson('/api/arrivals/summary?' + qs),
        apiFetchJson('/api/arrivals/by-route?' + qs),
        apiFetchJson('/api/arrivals/by-service?' + qs),
        apiFetchJson('/api/arrivals/by-ward?' + qs),
        apiFetchJson('/api/arrivals/by-time?granularity=day&' + qs),
        allowHourly ? apiFetchJson('/api/arrivals/by-time?granularity=hour&' + qs) : Promise.resolve({ ok: true, data: null }),
        apiFetchJson('/api/arrivals/quality-mocs?' + qs)
      ];

      if (isAdmin) {
        promises.push(
          apiFetchJson('/api/arrivals/exceptions?' + qs),
          apiFetchJson('/api/arrivals/import-status')
        );
      }

      const results = await Promise.all(promises);

      const [
        summaryRes, byRouteRes, byServiceRes, byWardRes,
        byTimeDayRes, byTimeHourRes, qualityMocsRes,
        exceptionsRes, importStatusRes
      ] = results;

      setData({
        summary: summaryRes.ok ? summaryRes.data : null,
        byRoute: byRouteRes.ok ? byRouteRes.data : null,
        byService: byServiceRes.ok ? byServiceRes.data : null,
        byWard: byWardRes.ok ? byWardRes.data : null,
        byTimeDay: byTimeDayRes.ok ? byTimeDayRes.data : null,
        byTimeHour: byTimeHourRes.ok ? byTimeHourRes.data : null,
        qualityMocs: qualityMocsRes.ok ? qualityMocsRes.data : null,
        exceptions: exceptionsRes?.ok ? exceptionsRes.data : null,
        importStatus: importStatusRes?.ok ? importStatusRes.data : null,
        errors: {
          summary: summaryRes.ok ? null : summaryRes.error,
          byRoute: byRouteRes.ok ? null : byRouteRes.error,
          byService: byServiceRes.ok ? null : byServiceRes.error,
          byWard: byWardRes.ok ? null : byWardRes.error,
          byTimeDay: byTimeDayRes.ok ? null : byTimeDayRes.error,
          byTimeHour: byTimeHourRes.ok ? null : byTimeHourRes.error,
          qualityMocs: qualityMocsRes.ok ? null : qualityMocsRes.error
        }
      });
    } catch (e) {
      setError('Lỗi hệ thống khi gọi API');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  // Handle Apply button
  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    loadData(newFilters);
  };

  // Khởi chạy khi đã có default filters
  useEffect(() => {
    if (filters.receiver_code.length > 0 && !data.summary && !loading) {
      loadData(filters);
    }
  }, [filters, loadData, data.summary, loading]);

  const tabs = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'bd10_status', label: 'Trạng thái BD10 đến' },
    { id: 'routes_services', label: 'Đường thư và dịch vụ' },
    { id: 'quality', label: 'Chất lượng khai thác' },
    { id: 'lookup', label: 'Tra cứu bưu gửi' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0f2747]">Dữ liệu sản lượng đến</h1>
          <p className="text-sm text-[#5b6777] mt-1">
            Bưu gửi đến Bưu cục Vận hành · {filters.receiver_code.length === DASHBOARD_BCVH.length 
              ? 'Tất cả 6 BCVH' 
              : DASHBOARD_BCVH.filter(b => filters.receiver_code.includes(b.ma)).map(b => b.ten.replace('BCVH ', '')).join(', ')}
            {meta?.date_range?.max_time && ` · lần nạp gần nhất ${meta.date_range.max_time.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/, '$3/$2/$1 $4')}`}
          </p>
        </div>
      </div>

      <ArrivalsFilters 
        filters={filters} 
        onApply={handleApplyFilters} 
        meta={meta} 
        bcvhList={DASHBOARD_BCVH} 
        loading={loading}
        exportScope={exportScope}
      />

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {isAdmin && (data.importStatus?.missing_batches?.length > 0) && (
        <div className="rounded-xl bg-[#fff4d6] border border-[#f0d58a] text-[#5c3f00] p-3 px-4 flex flex-wrap gap-x-4 gap-y-2 items-center text-[14px]">
          <strong>Cảnh báo (chỉ ADMIN thấy):</strong>
          <span>Có {data.importStatus.missing_batches.length} ngày thiếu đợt nạp file SFTP.</span>
        </div>
      )}

      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-[var(--color-subtext)]">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : showNotReceivedDetail ? (
          <ArrivalsNotReceivedDetail 
            data={data} 
            filters={filters} 
            onBack={() => setShowNotReceivedDetail(false)} 
          />
        ) : showBd10Detail ? (
          <ArrivalsBd10NotConfirmedDetail 
            data={data} 
            filters={filters} 
            onBack={() => setShowBd10Detail(false)} 
          />
        ) : (
          <>
            <ArrivalsNotReceivedBanner 
              data={data.summary} 
              onShowDetail={() => setShowNotReceivedDetail(true)} 
            />

            <ArrivalsBd10NotConfirmedBanner 
              data={data.summary} 
              onShowDetail={() => setShowBd10Detail(true)} 
            />

            <div className="border-b border-[#d5dce6] pb-3 mt-6">
              <nav className="-mb-px flex space-x-8">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-orange-500 text-orange-500'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {activeTab === 'overview' && (
              <ArrivalsOverview 
                data={data} 
                filters={filters} 
                bcvhList={DASHBOARD_BCVH}
                isAdmin={isAdmin}
              />
            )}
            {activeTab === 'bd10_status' && (
              <ArrivalsBd10Status 
                filters={filters}
                onShowDetail={() => setShowBd10Detail(true)}
                bcvhList={DASHBOARD_BCVH}
              />
            )}
            {activeTab === 'routes_services' && data.byRoute && (
              <ArrivalsRoutesServices data={data} />
            )}
            {activeTab === 'quality' && data.qualityMocs && (
              <ArrivalsQuality 
                data={data} 
                isAdmin={isAdmin} 
                summary={data.summary} 
                importStatus={data.importStatus}
              />
            )}
            {activeTab === 'lookup' && (
              <ArrivalsLookup 
                bcvhList={DASHBOARD_BCVH} 
                isAdmin={isAdmin}
                exceptions={data.exceptions}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
