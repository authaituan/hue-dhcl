import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  Eye,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  User,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import CustomDatePicker from './CustomDatePicker';
import ReplaceLogDetail from './ReplaceLogDetail';
import RestorePreviewDialog from './RestorePreviewDialog';
import RestoreConfirmDialog from './RestoreConfirmDialog';

// Định dạng số có dấu chấm ngăn cách hàng nghìn (vd: 1.020)
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
function toDmy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(ymd);
}

// Định dạng ngày giờ: dd/mm/yyyy hh:mm
function formatDateTime(bangkokStr, utcStr) {
  const str = bangkokStr || utcStr;
  if (!str) return '—';
  if (bangkokStr) {
    const match = String(bangkokStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
    }
  }
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    const pad = (num) => String(num).padStart(2, '0');
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const vnDate = new Date(utc + 7 * 3600000);
    return `${pad(vnDate.getDate())}/${pad(vnDate.getMonth() + 1)}/${vnDate.getFullYear()} ${pad(vnDate.getHours())}:${pad(vnDate.getMinutes())}`;
  } catch {
    return '—';
  }
}

// Hiển thị người thực hiện an toàn
function formatUser(nguoi) {
  if (!nguoi || typeof nguoi !== 'object') return 'Không rõ';
  if (nguoi.ten && String(nguoi.ten).trim()) return String(nguoi.ten).trim();
  if (nguoi.ma && String(nguoi.ma).trim()) return String(nguoi.ma).trim();
  return 'Không rõ';
}

// Trạng thái thùng rác theo thứ tự ưu tiên
function getTrashStatus(thungRac) {
  if (!thungRac) {
    return {
      type: 'HET_HAN',
      label: 'Hết hạn',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  }

  // 1. Đã khôi phục (xanh)
  if (thungRac.da_khoi_phuc) {
    return {
      type: 'DA_KHOI_PHUC',
      label: 'Đã khôi phục',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  let daysLeft = 0;
  if (thungRac.het_han_luc) {
    const target = Date.parse(thungRac.het_han_luc);
    if (!isNaN(target)) {
      const diff = target - Date.now();
      daysLeft = Math.max(0, Math.ceil(diff / 86400000));
    }
  }

  // 2. Hết hạn (xám)
  const isHetHan = !thungRac.con_khoi_phuc_duoc || daysLeft <= 0;
  if (isHetHan) {
    return {
      type: 'HET_HAN',
      label: 'Hết hạn',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  }

  // 3. Không có gì để khôi phục (hồng) nếu số dòng trong thùng rác = 0
  if (thungRac.so_dong !== undefined && thungRac.so_dong === 0) {
    return {
      type: 'RONG',
      label: 'Không có gì để khôi phục',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }

  // 4. Còn N ngày (hổ phách)
  return {
    type: 'CON_HAN',
    label: `Còn ${daysLeft} ngày`,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

// Kiểm tra giới hạn 92 ngày của bộ lọc
function validateDateRange(tu, den) {
  if (!tu || !den) return { valid: true };
  const dTu = new Date(tu + 'T00:00:00');
  const dDen = new Date(den + 'T00:00:00');
  if (dDen < dTu) {
    return { valid: false, message: 'Từ ngày phải trước hoặc bằng Đến ngày' };
  }
  const diffDays = Math.round((dDen - dTu) / 86400000);
  if (diffDays > 92) {
    return { valid: false, message: 'Chọn tối đa 92 ngày' };
  }
  return { valid: true };
}

export default function ReplaceLogTab({ authUser }) {
  // RULES OF HOOKS: Toàn bộ hooks đặt tại đầu component
  const isAdmin = authUser?.role === 'ADMIN';

  // Trạng thái bộ lọc
  const [filterBcvh, setFilterBcvh] = useState('');
  const [filterTuNgay, setFilterTuNgay] = useState('');
  const [filterDenNgay, setFilterDenNgay] = useState('');
  const [filterNguoi, setFilterNguoi] = useState('');

  // Tham số truy vấn hiện đang áp dụng
  const [appliedFilters, setAppliedFilters] = useState({
    bcvh: '',
    tu_ngay: '',
    den_ngay: '',
    nguoi: '',
  });

  // Phân trang
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Dữ liệu và trạng thái tải
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 20, total_pages: 0 });
  const [error, setError] = useState(null);

  // Dialog & Drawer
  const [selectedDetailId, setSelectedDetailId] = useState(null);
  const [previewRestoreTarget, setPreviewRestoreTarget] = useState(null); // { id, bcvh, ngay }
  const [confirmRestoreTarget, setConfirmRestoreTarget] = useState(null); // { id, bcvh, ngay, soDongSeThem }

  // Kiểm tra tính hợp lệ của khoảng ngày
  const dateRangeValidation = validateDateRange(filterTuNgay, filterDenNgay);

  // Hàm tải dữ liệu danh sách
  const fetchLogs = useCallback(async (targetPage = 1, filters = appliedFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('page_size', String(pageSize));

      if (filters.bcvh) params.set('bcvh', filters.bcvh);
      if (filters.tu_ngay) params.set('tu_ngay', filters.tu_ngay);
      if (filters.den_ngay) params.set('den_ngay', filters.den_ngay);
      if (filters.nguoi) params.set('nguoi', filters.nguoi.trim());

      const res = await apiFetchJson(`/api/arrivals/thay-the/nhat-ky?${params.toString()}`);

      if (res.ok) {
        setItems(res.data?.items || []);
        setPagination(res.data?.pagination || { total: 0, page: 1, page_size: pageSize, total_pages: 0 });
      } else {
        const ma = res.data?.ma;
        const msg = res.data?.error || res.error || 'Có lỗi xảy ra khi nạp danh sách nhật ký.';
        setError({ message: msg, ma });
      }
    } catch (err) {
      setError({
        message: 'Lỗi mạng hoặc không thể kết nối tới máy chủ.',
        ma: 'NETWORK_ERROR',
      });
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, pageSize]);

  // Nạp lần đầu
  useEffect(() => {
    fetchLogs(1, { bcvh: '', tu_ngay: '', den_ngay: '', nguoi: '' });
  }, []);

  // Xử lý bấm nút Lọc
  const handleApplyFilter = () => {
    if (!dateRangeValidation.valid) return;
    const newFilters = {
      bcvh: filterBcvh,
      tu_ngay: filterTuNgay,
      den_ngay: filterDenNgay,
      nguoi: filterNguoi.slice(0, 60),
    };
    setAppliedFilters(newFilters);
    setPage(1);
    fetchLogs(1, newFilters);
  };

  // Chuyển trang
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > (pagination.total_pages || 1)) return;
    setPage(newPage);
    fetchLogs(newPage, appliedFilters);
  };

  // Tính số thứ tự a–b
  const total = pagination.total || 0;
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      {/* ── CARD BỘ LỌC TÌM KIẾM ────────────────────────────────────────── */}
      <div className="card-soft p-5 rounded-2xl space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-title flex items-center justify-between border-b border-gray-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-orange-500" />
            <span>Bộ lọc nhật ký thay thế</span>
          </div>
          {!dateRangeValidation.valid && (
            <span className="text-[11px] font-semibold text-rose-600 normal-case">
              {dateRangeValidation.message}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
          {/* Ô chọn BCVH */}
          <div className="space-y-1.5">
            <label htmlFor="filter-bcvh" className="block text-xs font-semibold text-gray-700">
              Đơn vị (BCVH):
            </label>
            <select
              id="filter-bcvh"
              value={filterBcvh}
              onChange={(e) => setFilterBcvh(e.target.value)}
              disabled={loading}
              className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all cursor-pointer shadow-2xs"
            >
              <option value="">Tất cả đơn vị</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten} ({b.ma})
                </option>
              ))}
            </select>
          </div>

          {/* Ô chọn Từ ngày */}
          <div className="space-y-1.5">
            <label htmlFor="filter-tu-ngay" className="block text-xs font-semibold text-gray-700">
              Từ ngày (ngày thay):
            </label>
            <CustomDatePicker
              id="filter-tu-ngay"
              value={filterTuNgay}
              onChange={(val) => setFilterTuNgay(val)}
              disabled={loading}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Ô chọn Đến ngày */}
          <div className="space-y-1.5">
            <label htmlFor="filter-den-ngay" className="block text-xs font-semibold text-gray-700">
              Đến ngày (ngày thay):
            </label>
            <CustomDatePicker
              id="filter-den-ngay"
              value={filterDenNgay}
              onChange={(val) => setFilterDenNgay(val)}
              disabled={loading}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Ô nhập Người */}
          <div className="space-y-1.5">
            <label htmlFor="filter-nguoi" className="block text-xs font-semibold text-gray-700">
              Người thực hiện (mã):
            </label>
            <input
              id="filter-nguoi"
              type="text"
              value={filterNguoi}
              onChange={(e) => setFilterNguoi(e.target.value.slice(0, 60))}
              disabled={loading}
              placeholder="Mã HRM hoặc script"
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all tabular-nums shadow-none"
            />
          </div>

          {/* Nút Lọc */}
          <div>
            <button
              type="button"
              onClick={handleApplyFilter}
              disabled={loading || !dateRangeValidation.valid}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 ${
                dateRangeValidation.valid && !loading
                  ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer shadow-xs'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Lọc nhật ký</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── BẢNG DANH SÁCH NHẬT KÝ ──────────────────────────────────────── */}
      <div className="card-soft rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        {/* Thanh trạng thái / phân trang trên */}
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-semibold text-gray-700 flex items-center gap-2">
            <History className="w-4 h-4 text-orange-500" />
            <span>
              {total > 0 ? (
                <>Hiện {startRow}–{endRow} / tổng {formatNumber(total)} lần thay thế</>
              ) : (
                'Danh sách nhật ký'
              )}
            </span>
          </div>

          {/* Nút phân trang */}
          {total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[11px]">
                Trang {page} / {pagination.total_pages || 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Trước</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= (pagination.total_pages || 1) || loading}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                  aria-label="Trang sau"
                >
                  <span>Sau</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nội dung bảng */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
            <RefreshCw className="w-7 h-7 animate-spin text-orange-500" />
            <p className="text-xs font-semibold">Đang tải nhật ký thay thế…</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-xs text-rose-800 font-semibold">{error.message}</p>
            <button
              type="button"
              onClick={() => fetchLogs(page, appliedFilters)}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs space-y-2">
            <History className="w-8 h-8 mx-auto text-gray-300" />
            <p className="font-semibold text-gray-600">
              Chưa có lần thay thế nào trong khoảng này.
            </p>
            <p className="text-[11px] text-gray-400">
              Thử nới rộng bộ lọc khoảng ngày hoặc chọn lại đơn vị.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[840px]">
              <thead className="bg-cream-head border-b border-cream-line text-gray-600 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Thực hiện lúc</th>
                  <th className="px-3.5 py-3">BCVH</th>
                  <th className="px-3.5 py-3">Ngày thay thế</th>
                  <th className="px-3.5 py-3">Người</th>
                  <th className="px-3.5 py-3">Xóa → nạp</th>
                  <th className="px-3.5 py-3">Thùng rác</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-line tabular-nums">
                {items.map((item) => {
                  const bcvhObj = BCVH_LIST.find((b) => b.ma === item.bcvh);
                  const bcvhLabel = bcvhObj ? `${bcvhObj.ten} (${item.bcvh})` : item.bcvh;
                  const trash = getTrashStatus(item.thung_rac);
                  const canRestore = isAdmin && Boolean(item.thung_rac?.con_khoi_phuc_duoc);

                  return (
                    <tr key={item.id} className="hover:bg-cream-light/50 transition-colors">
                      {/* Thực hiện lúc */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-medium">
                        {formatDateTime(item.thoi_diem_bangkok, item.thoi_diem)}
                      </td>

                      {/* BCVH */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-gray-900 font-semibold">
                        {bcvhLabel}
                      </td>

                      {/* Ngày thay thế */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-gray-700">
                        {toDmy(item.ngay)}
                      </td>

                      {/* Người */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-gray-700">
                        {formatUser(item.nguoi)}
                      </td>

                      {/* Xóa → nạp */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-gray-700">
                        <div>
                          <span className="font-semibold text-gray-900">
                            {formatNumber(item.so_dong_xoa)}
                          </span>{' '}
                          →{' '}
                          <span className="font-semibold text-emerald-700">
                            {formatNumber(item.so_dong_nap)}
                          </span>{' '}
                          dòng
                        </div>
                        <div className="text-[10px] text-gray-400">
                          ({item.so_file_xoa} → {item.so_file_nap} file)
                        </div>
                      </td>

                      {/* Thùng rác */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${trash.badgeClass}`}
                        >
                          {trash.label}
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {/* Nút Xem cho mọi dòng */}
                          <button
                            type="button"
                            onClick={() => setSelectedDetailId(item.id)}
                            className="min-h-[44px] px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-gray-500" />
                            <span>Xem</span>
                          </button>

                          {/* Nút Khôi phục chỉ khi con_khoi_phuc_duoc và là ADMIN */}
                          {canRestore && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewRestoreTarget({
                                  id: item.id,
                                  bcvh: item.bcvh,
                                  ngay: item.ngay,
                                })
                              }
                              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                            >
                              <span>Khôi phục</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODALS & DRAWERS ────────────────────────────────────────────── */}
      {/* 1. Drawer chi tiết */}
      {selectedDetailId && (
        <ReplaceLogDetail
          isOpen={Boolean(selectedDetailId)}
          onClose={() => setSelectedDetailId(null)}
          nhatKyId={selectedDetailId}
          isAdmin={isAdmin}
          onRestore={(detail) => {
            setPreviewRestoreTarget({
              id: detail.id,
              bcvh: detail.bcvh,
              ngay: detail.ngay,
            });
          }}
        />
      )}

      {/* 2. Dialog Xem trước khôi phục */}
      {previewRestoreTarget && (
        <RestorePreviewDialog
          isOpen={Boolean(previewRestoreTarget)}
          onClose={() => setPreviewRestoreTarget(null)}
          nhatKyId={previewRestoreTarget.id}
          bcvh={previewRestoreTarget.bcvh}
          ngay={previewRestoreTarget.ngay}
          onProceedToConfirm={(previewData) => {
            const target = { ...previewRestoreTarget, soDongSeThem: previewData.so_dong_se_them };
            setPreviewRestoreTarget(null);
            setConfirmRestoreTarget(target);
          }}
        />
      )}

      {/* 3. Dialog Xác nhận & Thực hiện khôi phục */}
      {confirmRestoreTarget && (
        <RestoreConfirmDialog
          isOpen={Boolean(confirmRestoreTarget)}
          onClose={() => setConfirmRestoreTarget(null)}
          nhatKyId={confirmRestoreTarget.id}
          bcvh={confirmRestoreTarget.bcvh}
          ngay={confirmRestoreTarget.ngay}
          soDongSeThem={confirmRestoreTarget.soDongSeThem}
          onSuccess={() => {
            setConfirmRestoreTarget(null);
            setSelectedDetailId(null);
            fetchLogs(page, appliedFilters);
          }}
        />
      )}
    </div>
  );
}
