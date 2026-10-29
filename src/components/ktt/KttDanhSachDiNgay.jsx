import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, FileText, Download } from 'lucide-react';
import { formatInt, formatDdMmYyyy, formatDateTime } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatTimeShort, formatDecimal } from './kttFormatters';
import { fetchKttDanhSachDiNgay, downloadKttHomSauChuaDi } from './kttApi';
import { getToken, decodeJwtPayload } from '../../utils/api';

/**
 * Bảng danh sách bưu gửi khi bấm ô (Hôm sau / Chưa đi trên 24 giờ).
 * Hỗ trợ chuyển đổi 2 tab «Hôm sau» và «Chưa đi trên 24 giờ», phân trang server-side.
 */
export default function KttDanhSachDiNgay({
  tu,
  den,
  initialLoai = 'hom-sau',
  duongThu = null,
  duongThuTen = null,
  noiGui = null,
  noiGuiTen = null,
  huong = null,
  hangHoan = null,
  maBcvh = null,
  onClose,
  title = null,
  authUser = null,
}) {
  const [loai, setLoai] = useState(initialLoai);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Xuất Sheet 8
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportErrorCanRetry, setExportErrorCanRetry] = useState(false);

  const reqIdRef = useRef(0);

  const userRole = authUser?.role || (() => {
    try {
      const t = getToken();
      return t ? decodeJwtPayload(t)?.role : null;
    } catch (e) {
      return null;
    }
  })();
  const canExport = userRole === 'ADMIN' || userRole === 'TTVH';

  // Khi bấm tab khác, reset về trang 1
  const handleTabChange = (nextLoai) => {
    if (nextLoai === loai) return;
    setLoai(nextLoai);
    setPage(1);
  };

  const handleExportSheet8 = async () => {
    if (exportLoading || !tu || !den) return;
    setExportLoading(true);
    setExportError(null);
    setExportErrorCanRetry(false);

    try {
      const res = await downloadKttHomSauChuaDi({
        tu,
        den,
        loai,
        duong_thu: duongThu,
        noi_gui: noiGui,
        huong,
        hang_hoan: hangHoan,
        ma_bcvh: maBcvh,
      });

      if (!res.ok) {
        const isTran = res.error && (res.error.includes('KTT_QUA_NHIEU_DONG') || res.error.includes('vượt giới hạn'));
        if (isTran) {
          setExportError('Quá nhiều dòng (trần 200.000). Thu hẹp khoảng ngày.');
          setExportErrorCanRetry(false);
        } else {
          setExportError(res.error || 'Có lỗi xảy ra khi tạo file.');
          setExportErrorCanRetry(true);
        }
      }
    } catch (e) {
      setExportError('Lỗi kết nối khi tải file.');
      setExportErrorCanRetry(true);
    } finally {
      setExportLoading(false);
    }
  };

  const loadData = async () => {
    if (!tu || !den) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchKttDanhSachDiNgay({
        tu,
        den,
        loai,
        duong_thu: duongThu,
        noi_gui: noiGui,
        huong,
        hang_hoan: hangHoan,
        ma_bcvh: maBcvh,
        page,
        page_size: pageSize,
      });

      if (reqIdRef.current !== reqId) return;

      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Không tải được danh sách bưu gửi.');
      }
    } catch (e) {
      if (reqIdRef.current === reqId) {
        setError('Lỗi kết nối khi tải danh sách.');
      }
    } finally {
      if (reqIdRef.current === reqId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [tu, den, loai, duongThu, noiGui, huong, hangHoan, maBcvh, page, pageSize]);

  const items = data?.items || [];
  const pagination = data?.pagination || { total: 0, page: 1, page_size: 50, total_pages: 1 };
  const total = pagination.total || 0;
  const totalPages = pagination.total_pages || 1;

  // Tiêu đề gợi ý ngữ cảnh
  const displayDuongThu = duongThu === '__RONG__' ? '(không có mã đường thư)' : duongThu;
  const displayNoiGui = noiGui === '__RONG__' ? '(không có mã nơi gửi)' : noiGui;
  const contextLabel = title || (
    duongThu
      ? `Đường thư: ${displayDuongThu}${duongThuTen ? ` · ${duongThuTen}` : ''}`
      : (noiGui ? `Nơi gửi: ${displayNoiGui}${noiGuiTen ? ` · ${noiGuiTen}` : ''}` : 'Tất cả bưu gửi')
  );

  return (
    <div className="bg-white rounded-[14px] border border-[#D9CBA8] p-5 shadow-xs mt-4">
      {/* Tiêu đề & Đóng */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="w-4 h-4 text-[#4A1D6E]" />
            <h3 className="font-bold text-gray-800 text-sm md:text-base">
              Danh sách bưu gửi chi tiết
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
              {contextLabel}
            </span>

            {/* Nút Xuất xlsx · Sheet 8 đặt cạnh tiêu đề */}
            {canExport && (
              <div className="inline-flex items-center gap-2 ml-1">
                <button
                  type="button"
                  onClick={handleExportSheet8}
                  disabled={exportLoading}
                  className="btn-primary px-3 py-1.5 rounded-[8px] text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Xuất file Excel Sheet 8 Hôm sau - chưa đi"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportLoading ? 'Đang tạo file…' : 'Xuất xlsx · Sheet 8'}</span>
                </button>
                <span className="text-xs text-gray-600 font-medium tabular-nums">
                  {formatInt(total)} dòng
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Tổng số: <strong className="text-gray-800 font-bold tabular-nums">{formatInt(total)}</strong> bưu gửi
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 2 Tab: Hôm sau & Chưa đi > 24 giờ */}
          <div className="inline-flex items-center bg-[#FAF5E8] border border-[#E4D5AE] rounded-[8px] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleTabChange('hom-sau')}
              className={`px-3 py-1 font-bold rounded-[6px] transition-colors cursor-pointer ${
                loai === 'hom-sau'
                  ? 'bg-[#B79BCB] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Hôm sau
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('chua-di-24h')}
              className={`px-3 py-1 font-bold rounded-[6px] transition-colors cursor-pointer ${
                loai === 'chua-di-24h'
                  ? 'bg-[#B3202A] text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              Chưa đi trên 24 giờ
            </button>
          </div>

          {/* Nút đóng */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng danh sách"
              className="p-1.5 rounded-[8px] text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Đóng bảng danh sách"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Lỗi xuất Excel */}
      {exportError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2 mb-4" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{exportError}</span>
          </div>
          <div className="flex items-center gap-2">
            {exportErrorCanRetry && (
              <button
                type="button"
                onClick={handleExportSheet8}
                className="font-bold underline hover:no-underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
            )}
            <button
              type="button"
              onClick={() => setExportError(null)}
              className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-red-300 rounded text-red-700 text-xs font-semibold cursor-pointer shrink-0"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Lỗi tải dữ liệu */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center justify-between gap-2 mb-4" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-bold underline hover:no-underline cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      )}

      {/* Đang tải */}
      {loading && (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#5A4A62]">
          <span className="w-3 h-3 rounded-full bg-[#1F7A5C] animate-ping" />
          <span className="font-medium">Đang tải danh sách bưu gửi…</span>
        </div>
      )}

      {/* Bảng dữ liệu */}
      {!loading && !error && items.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-500 italic">
          Không có bưu gửi nào thuộc bộ lọc này.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-soft w-full min-w-[850px] text-left text-xs">
            <thead>
              <tr>
                <th className="w-10 text-center">STT</th>
                <th>MÃ BƯU GỬI</th>
                <th>NGÀY ĐẾN</th>
                <th>GIỜ QUÉT ĐẾN</th>
                <th>XNĐ BD10 ĐẾN</th>
                <th>BCVH ĐÍCH</th>
                <th>ĐƯỜNG THƯ ĐẾN</th>
                <th>NƠI GỬI</th>
                <th>GIỜ LẬP BD10 ĐI</th>
                <th className="text-right">CHỜ (GIỜ)</th>
                <th className="text-right">KHỐI LƯỢNG</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => {
                const stt = (page - 1) * pageSize + idx + 1;
                return (
                  <tr key={`${row.shbg || idx}-${idx}`} className="hover:bg-amber-50/40">
                    <td className="text-center text-gray-400 tabular-nums">{stt}</td>
                    <td className="font-mono font-semibold text-gray-800">
                      {row.shbg || '—'}
                      {row.hang_hoan && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FAF5E8] text-[#A87A12] border border-[#E4D5AE]">
                          Hoàn
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums text-gray-700">{formatDdMmYyyy(row.ngay_den)}</td>
                    <td className="tabular-nums text-gray-700">{formatTimeShort(row.gio_den_ktt)}</td>
                    <td className="tabular-nums text-gray-700">{formatTimeShort(row.xnd_bd10_den)}</td>
                    <td>
                      <span className="font-medium text-gray-800">
                        {row.ten_bcvh || row.ma_bcvh || '—'}
                      </span>
                    </td>
                    <td className="text-gray-700">
                      <div>{row.duong_thu_ten || '—'}</div>
                      {row.duong_thu_ma && (
                        <div className="text-[10px] text-gray-400 font-mono">{row.duong_thu_ma}</div>
                      )}
                    </td>
                    <td className="text-gray-700">
                      <div>{row.noi_gui_ten || '—'}</div>
                      {row.noi_gui_ma && (
                        <div className="text-[10px] text-gray-400 font-mono">{row.noi_gui_ma}</div>
                      )}
                    </td>
                    <td className="tabular-nums text-gray-700">
                      {row.bd10_di_gio_lap ? formatDateTime(row.bd10_di_gio_lap) : (
                        <span className="text-[#B3202A] font-semibold italic">Chưa đi</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-gray-800">
                      {row.cho_gio !== null && row.cho_gio !== undefined ? `${formatDecimal(row.cho_gio, 1)} giờ` : '—'}
                    </td>
                    <td className="text-right tabular-nums text-gray-700">
                      {formatKg(row.kg, { withUnit: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100 text-xs">
          <div className="text-gray-500">
            Hiển thị trang <strong className="text-gray-800">{page}</strong> / <strong>{totalPages}</strong> (tổng {formatInt(total)} bưu gửi)
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-[6px] border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Trước
            </button>
            <span className="px-2 font-bold tabular-nums text-gray-700">
              {page}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-[6px] border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1"
            >
              Sau <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
