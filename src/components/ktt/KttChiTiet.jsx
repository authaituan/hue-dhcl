import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react';
import { formatInt } from '../quythoigian/quyThoiGianFormatters';
import { formatKgDecimal, formatTimeShort, formatGioChiTiet } from './kttFormatters';
import { fetchKttChiTiet, downloadKttLuuThoat } from './kttApi';

const STATUS_CHIP_OPTIONS = [
  { key: 'ro_lai', label: 'Rớt lại' },
  { key: 'truot_chuyen', label: 'Trượt chuyến' },
  { key: 't1', label: '1 · Trong ngày đúng' },
  { key: 't2', label: '2 · Trong ngày trượt' },
  { key: 't3', label: '3 · Hôm sau đúng' },
  { key: 't4', label: '4 · Hôm sau trượt' },
  { key: 't5', label: '5 · Từ 2 ngày / chưa đi' },
  { key: 'dang_cho_chuyen', label: 'Đang chờ chuyến' },
  { key: 'hang_hoan', label: 'Hàng hoàn Tổ KHHH' },
  { key: 'dat', label: 'Đạt 14 giờ' },
  { key: 'khong_dat', label: 'Không đạt 14 giờ' },
];

export default function KttChiTiet({
  dateRange,
  selectedBcvh,
  filterCell,
  onClearFilterCell,
}) {
  const [activeLoai, setActiveLoai] = useState('ro_lai');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 50, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const reqIdRef = useRef(0);

  // Khi người dùng bấm ô ở heatmap, đồng bộ loại và reset về trang 1
  useEffect(() => {
    if (filterCell?.loai) {
      setActiveLoai(filterCell.loai);
    }
    setPage(1);
  }, [filterCell]);

  // Xác định mã BCVH và nguồn đang áp dụng
  const effectiveBcvh = filterCell?.ma_bcvh || (selectedBcvh !== 'all' ? selectedBcvh : null);
  const effectiveNguon = filterCell?.nguon || null;

  // Tải dữ liệu danh sách chi tiết
  const loadChiTiet = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchKttChiTiet({
        tu: dateRange.from,
        den: dateRange.to,
        loai: activeLoai,
        ma_bcvh: effectiveBcvh,
        nguon: effectiveNguon,
        page,
        page_size: pageSize,
      });

      if (currentReqId !== reqIdRef.current) return;

      if (res.ok) {
        setItems(res.data.items || []);
        setPagination(
          res.data.pagination || { total: 0, page: 1, page_size: pageSize, total_pages: 1 }
        );
      } else {
        setError(res.error || 'Không tải được danh sách chi tiết.');
        setItems([]);
      }
    } catch (err) {
      if (currentReqId !== reqIdRef.current) return;
      setError('Lỗi kết nối khi tải danh sách chi tiết.');
      setItems([]);
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, activeLoai, effectiveBcvh, effectiveNguon, page, pageSize]);

  useEffect(() => {
    loadChiTiet();
  }, [loadChiTiet]);

  // Xử lý xuất file theo bộ lọc hiện tại
  const handleExport = async () => {
    setExportLoading(true);
    try {
      await downloadKttLuuThoat({
        tu: dateRange.from,
        den: dateRange.to,
        trang_thai: activeLoai,
        ma_bcvh: effectiveBcvh,
        nguon: effectiveNguon,
      });
    } catch (err) {
      // bỏ qua
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none space-y-4">
      {/* ── TIÊU ĐỀ & MÔ TẢ ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="hue-h2 text-[17px]">
            Danh sách hàng đến trong ngày theo trạng thái
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Mở từ một ô của heatmap, hoặc xem cả ngày/khoảng. Mỗi dòng một bưu gửi (SHBG); lọc theo trạng thái ở cột cuối.
          </p>
        </div>

        {/* Nút xuất excel nhanh */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exportLoading || pagination.total === 0}
          className={`btn-primary px-3.5 py-1.5 rounded-[8px] text-xs font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
            exportLoading || pagination.total === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>
            {exportLoading
              ? 'Đang tạo…'
              : `Tải xlsx · ${formatInt(pagination.total)} bưu gửi`}
          </span>
        </button>
      </div>

      {/* ── THANH TRẠNG THÁI LỌC Ô HIỆN TẠI (NẾU CÓ) ────────────────────────── */}
      {filterCell && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-[#EFE6F5] border border-[#D8BDEB] rounded-[10px] text-xs text-[#4A1D6E]">
          <div className="flex items-center gap-2">
            <span className="font-bold">Đang xem theo ô heatmap:</span>
            <span className="font-semibold bg-white px-2 py-0.5 rounded border border-[#D8BDEB]">
              {filterCell.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearFilterCell}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#4A1D6E] hover:underline cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Xem tất cả (xóa lọc ô)</span>
          </button>
        </div>
      )}

      {/* ── CHIP LỌC TRẠNG THÁI / LOẠI ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-xs font-semibold text-gray-600 mr-1">Trạng thái:</span>
        {STATUS_CHIP_OPTIONS.map((opt) => {
          const isSelected = activeLoai === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setActiveLoai(opt.key);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#4A1D6E] text-white font-bold border border-transparent shadow-none'
                  : 'bg-white text-gray-700 border border-[#D9CBA8] font-medium hover:bg-[#FFFBEF]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── THÔNG BÁO LỖI ────────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadChiTiet}
            className="font-bold underline hover:no-underline cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ── BẢNG DANH SÁCH CHI TIẾT 10 CỘT ───────────────────────────────────── */}
      <div className="overflow-x-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 transition-opacity">
            <div className="px-3 py-1.5 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[8px] text-xs font-bold text-[#5A4A62] shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1F7A5C] animate-ping" />
              <span>Đang tải danh sách…</span>
            </div>
          </div>
        )}

        <table className="table-soft w-full min-w-[1000px] text-left text-xs">
          <thead>
            <tr>
              <th className="text-left">MÃ BƯU GỬI (SHBG)</th>
              <th className="text-left">NGUỒN / ĐƯỜNG THƯ ĐẾN</th>
              <th className="text-left">GIỜ ĐẾN KTT</th>
              <th className="text-right">KL (KG)</th>
              <th className="text-left">BCVH ĐÍCH</th>
              <th className="text-left">CHUYẾN LIỀN KỀ → MỐC HẠN</th>
              <th className="text-left">GIỜ LẬP BD10 ĐI</th>
              <th className="text-right">CHỜ TÍNH CHỈ TIÊU (GIỜ)</th>
              <th className="text-center">CHỈ TIÊU 14 GIỜ</th>
              <th className="text-left">PHÂN LOẠI</th>
            </tr>
          </thead>
          <tbody>
            {items && items.length > 0 ? (
              items.map((r, idx) => {
                const nguonTen =
                  r.duong_thu_den_ten ||
                  r.duong_thu_den_ma ||
                  (r.phan_loai === 'Hàng hoàn Tổ KHHH' ? 'Chuyển hoàn · 531120' : '—');

                // Chuyến liền kề: giờ xuất phát -> hạn đến muộn nhất
                const chuyenLienKeStr =
                  r.chuyen_lien_ke && r.han_den_muon_nhat
                    ? `${formatTimeShort(r.gio_xuat_phat)} → ${formatTimeShort(r.han_den_muon_nhat)}`
                    : r.chuyen_lien_ke || '—';

                // Giờ lập BD10 đi
                const gioDiStr = formatGioChiTiet(r.gio_lap_bd10_di, r.ngay_luu_thoat);

                // Thời gian chờ tính chỉ tiêu
                const choGioStr =
                  r.gio_cho_gio !== null && r.gio_cho_gio !== undefined
                    ? Number(r.gio_cho_gio).toLocaleString('vi-VN', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    : '—';

                // Chỉ tiêu 14 giờ badge
                const datLabel = r.dat_khong_dat;
                let datBadge = <span className="text-gray-500">—</span>;
                if (datLabel === 'Đạt') {
                  datBadge = (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                      Đạt
                    </span>
                  );
                } else if (datLabel === 'Không đạt') {
                  datBadge = (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FBE4E5] text-[#B3202A]">
                      Không đạt
                    </span>
                  );
                } else if (datLabel === 'Loại trừ' || datLabel === 'Không tính') {
                  datBadge = (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500">
                      {datLabel}
                    </span>
                  );
                } else if (datLabel) {
                  datBadge = (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                      {datLabel}
                    </span>
                  );
                }

                return (
                  <tr key={r.shbg || idx} className="hover:bg-[#FFFBEF] transition-colors">
                    <td className="font-mono font-bold text-gray-900 whitespace-nowrap">
                      {r.shbg}
                    </td>
                    <td className="font-medium text-gray-800 whitespace-nowrap">
                      {nguonTen}
                    </td>
                    <td className="tabular-nums text-gray-700 whitespace-nowrap" title={r.gio_quet_tui_den}>
                      {formatTimeShort(r.gio_quet_tui_den)}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                      {formatKgDecimal(r.kg)}
                    </td>
                    <td className="font-medium text-gray-900 whitespace-nowrap">
                      {r.ten_bcvh || r.ma_bcvh || '—'}
                    </td>
                    <td className="tabular-nums text-gray-700 whitespace-nowrap" title={r.chuyen_lien_ke}>
                      {chuyenLienKeStr}
                    </td>
                    <td className="tabular-nums text-gray-800 whitespace-nowrap" title={r.gio_lap_bd10_di}>
                      {gioDiStr}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                      {choGioStr}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {datBadge}
                    </td>
                    <td className="text-gray-700 whitespace-nowrap">
                      {r.trang_thai || r.phan_loai || '—'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-500 italic">
                  {loading ? 'Đang tải dữ liệu…' : 'Không có bưu gửi nào cho bộ lọc đã chọn.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── THANH PHÂN TRANG ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-gray-600 border-t border-gray-100">
        <div>
          {pagination.total > 0 ? (
            <span>
              Hiển thị{' '}
              <strong className="text-gray-900">
                {(pagination.page - 1) * pagination.page_size + 1}
              </strong>
              {' – '}
              <strong className="text-gray-900">
                {Math.min(pagination.page * pagination.page_size, pagination.total)}
              </strong>
              {' trong tổng '}
              <strong className="text-gray-900">{formatInt(pagination.total)}</strong> bưu gửi
            </span>
          ) : (
            <span>0 bưu gửi</span>
          )}
        </div>

        {/* Nút chuyển trang */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            aria-label="Trang trước"
            className="p-1.5 rounded border border-[#D9CBA8] bg-white text-gray-700 hover:bg-[#FFFBEF] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2.5 py-1 font-semibold text-gray-800 tabular-nums">
            Trang {pagination.page} / {pagination.total_pages || 1}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pagination.total_pages || 1, p + 1))}
            disabled={page >= (pagination.total_pages || 1) || loading}
            aria-label="Trang sau"
            className="p-1.5 rounded border border-[#D9CBA8] bg-white text-gray-700 hover:bg-[#FFFBEF] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
