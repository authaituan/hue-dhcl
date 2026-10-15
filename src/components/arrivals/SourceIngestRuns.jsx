import React, { useState, useEffect } from 'react';
import {
  History,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  ArrowRight,
  FileText
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import {
  formatUtcToVnDateTime,
  formatUtcToVnShort,
  formatNumber,
  RUN_FILE_ERROR_MAP,
  REASON_MAP,
  translateFileResult,
  getFileResultStyle,
  parseBcvhAndDateFromFilename
} from '../../utils/sourceIngest';

export default function SourceIngestRuns({
  onNavigateReplaceDay,
  refreshTrigger
}) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRuns, setTotalRuns] = useState(0);

  // Chi tiết lượt đã chọn
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Tải danh sách lượt
  const fetchRuns = async (p = 1) => {
    setLoading(true);
    try {
      const res = await apiFetchJson(`/api/nap-nguon/luot?trang=${p}&kich_thuoc=10`);
      if (res.ok) {
        setRuns(Array.isArray(res.data?.luot) ? res.data.luot : []);
        setPage(res.data?.trang || 1);
        setTotalPages(res.data?.so_trang || 1);
        setTotalRuns(res.data?.tong || 0);
      }
    } catch (e) {
      // bỏ qua lỗi âm thầm
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns(page);
  }, [page, refreshTrigger]);

  // Xem chi tiết files của lượt
  const handleOpenRunDetail = async (runId) => {
    setSelectedRunId(runId);
    setLoadingDetail(true);
    setDetailError(null);
    setRunDetail(null);
    try {
      const res = await apiFetchJson(`/api/nap-nguon/luot/${runId}`);
      if (res.ok) {
        setRunDetail(res.data);
      } else {
        const errText = typeof res.error === 'string' ? res.error : (res.data?.error || 'Không tải được chi tiết lượt.');
        setDetailError(errText);
      }
    } catch (e) {
      setDetailError('Lỗi kết nối khi tải chi tiết lượt.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const renderResultBadge = (ketQua, loiCount) => {
    switch (ketQua) {
      case 'THANH_CONG':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
            Thành công
          </span>
        );
      case 'CO_LOI':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
            Có lỗi {Number(loiCount) > 0 ? `· ${loiCount} file` : ''}
          </span>
        );
      case 'DANG_CHAY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 animate-pulse">
            Đang chạy
          </span>
        );
      case 'TREO':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700">
            Treo
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
            {typeof ketQua === 'string' ? ketQua : '—'}
          </span>
        );
    }
  };

  // Dùng hàm dịch kết quả dùng chung và kiểu màu tương ứng
  const renderFileResultBadge = (ketQua) => {
    const label = translateFileResult(ketQua);
    const style = getFileResultStyle(ketQua);
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.badgeClass}`}>
        {label}
      </span>
    );
  };

  const runsList = Array.isArray(runs) ? runs : [];

  return (
    <div className="card-soft rounded-2xl border border-gray-200 overflow-hidden shadow-2xs space-y-0">
      {/* HEADER D */}
      <div className="p-4 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-orange-600" />
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
            D. Các lượt lấy gần đây ({formatNumber(totalRuns)} lượt)
          </h3>
        </div>

        {/* PHÂN TRANG */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Trang {page} / {totalPages || 1}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BẢNG LƯỢT */}
      <div className="overflow-x-auto min-h-[200px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50/60 text-gray-500 font-semibold border-b border-gray-200 text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Lượt</th>
              <th className="py-2.5 px-3">Bắt đầu</th>
              <th className="py-2.5 px-3">Cách chạy</th>
              <th className="py-2.5 px-3 text-right">Liệt kê</th>
              <th className="py-2.5 px-3 text-right">Đã nạp</th>
              <th className="py-2.5 px-3 text-right">Đã có</th>
              <th className="py-2.5 px-3 text-right">Chưa ổn định</th>
              <th className="py-2.5 px-3 text-right">Lỗi</th>
              <th className="py-2.5 px-3 text-right">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-xs text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin text-orange-500 mx-auto mb-1" />
                  Đang tải danh sách lượt…
                </td>
              </tr>
            ) : runsList.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-xs text-gray-400">
                  Chưa có lượt nạp nào trong hệ thống.
                </td>
              </tr>
            ) : (
              runsList.map((r) => {
                if (!r || typeof r !== 'object') return null;
                const hasError = Number(r.loi || 0) > 0 || r.ket_qua === 'CO_LOI';

                // Cách chạy: Tự động hoặc Tay kèm tên
                const nguoiInfo = (r.nguoi && typeof r.nguoi === 'object') ? (r.nguoi.ten || r.nguoi.ma) : '';
                const cachChayText =
                  r.cach_chay === 'TU_DONG'
                    ? 'Tự động'
                    : `Tay · ${nguoiInfo || 'admin'}`;
                const loaiText = r.loai === 'LAY_NGAY' ? 'Lấy ngay' : r.loai === 'LAY_LAI' ? 'Lấy lại' : '';

                return (
                  <tr
                    key={r.id}
                    onClick={() => handleOpenRunDetail(r.id)}
                    className={`hover:bg-orange-50/40 transition-colors cursor-pointer ${
                      hasError ? 'bg-red-50/40' : ''
                    }`}
                    title="Bấm để xem danh sách file của lượt"
                  >
                    <td className="py-2.5 px-3 font-bold text-gray-900 font-mono">
                      #{r.id}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-700">
                      {typeof r.bat_dau === 'string' ? formatUtcToVnShort(r.bat_dau) : '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-800">
                      <span>{cachChayText}</span>
                      {loaiText && (
                        <span className="text-[10px] text-gray-400 ml-1.5 font-medium">
                          ({loaiText})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                      {r.liet_ke !== undefined && r.liet_ke !== null ? formatNumber(r.liet_ke) : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                      {r.da_nap !== undefined && r.da_nap !== null ? formatNumber(r.da_nap) : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                      {r.da_co !== undefined && r.da_co !== null ? formatNumber(r.da_co) : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                      {r.chua_on_dinh !== undefined && r.chua_on_dinh !== null ? formatNumber(r.chua_on_dinh) : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                      {r.loi !== undefined && r.loi !== null ? formatNumber(r.loi) : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {renderResultBadge(r.ket_qua, r.loi)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-gray-50/80 border-t border-gray-100 text-[11px] text-gray-500">
        Dòng đỏ nhạt: lượt có file lỗi. «Cách chạy» ghi tên người bấm khi chạy tay. Bấm một dòng để xem từng file trong lượt.
      </div>

      {/* MODAL CHI TIẾT CÁC FILE CỦA LƯỢT */}
      {selectedRunId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-4 text-left my-8">
            <button
              type="button"
              onClick={() => setSelectedRunId(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                <span>Danh sách file của lượt #{selectedRunId}</span>
              </h3>
              {runDetail && (
                <p className="text-xs text-gray-500">
                  Bắt đầu: {typeof runDetail.bat_dau === 'string' ? formatUtcToVnDateTime(runDetail.bat_dau) : '—'} · {runDetail.cach_chay === 'TU_DONG' ? 'Tự động' : `Tay (${(runDetail.nguoi && typeof runDetail.nguoi === 'object' ? (runDetail.nguoi.ten || runDetail.nguoi.ma) : '') || 'admin'})`}
                </p>
              )}
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center text-xs text-gray-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
                <p>Đang tải danh sách file…</p>
              </div>
            ) : detailError ? (
              <div className="p-3.5 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{detailError}</span>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto nav-scrollbar text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-[11px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Tên file</th>
                      <th className="py-2.5 px-3">Kết quả</th>
                      <th className="py-2.5 px-3 text-right">Số dòng</th>
                      <th className="py-2.5 px-3 text-right">Thời gian</th>
                      <th className="py-2.5 px-3">Ghi chú / Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(!Array.isArray(runDetail?.files) || runDetail.files.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-400">
                          Lượt này không quét được file nào.
                        </td>
                      </tr>
                    ) : (
                      runDetail.files.map((f, fIdx) => {
                        if (!f || typeof f !== 'object') return null;
                        const parsed = parseBcvhAndDateFromFilename(f.ten);
                        const isKhongTheLayLai = f.ma_loi === 'KHONG_THE_LAY_LAI';
                        const errorDich = f.ma_loi ? (RUN_FILE_ERROR_MAP[f.ma_loi] || REASON_MAP[f.ma_loi] || 'Lỗi') : null;
                        const chiTietStr = typeof f.chi_tiet === 'string' && f.chi_tiet.trim() ? f.chi_tiet.trim() : null;

                        // Số dòng: DA_CO, BO_QUA, CHUA_ON_DINH hiện «—» (không hiện 0); DA_NAP và EMPTY hiện số dòng thật
                        const isHyphenResult = ['DA_CO', 'BO_QUA', 'CHUA_ON_DINH'].includes(f.ket_qua);
                        let soDongDisplay = '—';
                        if (!isHyphenResult) {
                          if (f.so_dong !== undefined && f.so_dong !== null) {
                            soDongDisplay = formatNumber(f.so_dong);
                          } else if (f.ket_qua === 'EMPTY') {
                            soDongDisplay = '0';
                          }
                        }

                        return (
                          <tr key={f.id || f.ten || fIdx} className="hover:bg-gray-50/60">
                            <td className="py-2 px-3 font-mono text-[11px] text-gray-900 break-all max-w-[200px]">
                              {typeof f.ten === 'string' ? f.ten : '—'}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {renderFileResultBadge(f.ket_qua)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">
                              {soDongDisplay}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-gray-500 whitespace-nowrap">
                              {f.thoi_gian_ms !== undefined && f.thoi_gian_ms !== null ? `${Number(f.thoi_gian_ms)} ms` : '—'}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-gray-600">
                              <div className="space-y-1">
                                {errorDich && (
                                  <div className="text-red-700 font-medium">
                                    {errorDich}
                                  </div>
                                )}
                                {isKhongTheLayLai && parsed && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedRunId(null);
                                      onNavigateReplaceDay && onNavigateReplaceDay({ bcvh: parsed.bcvh, ngay: parsed.ngay });
                                    }}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>Sang «Thay thế ngày»</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                                {chiTietStr && f.ma_loi !== 'NGUON_KHONG_CO' && <div>{chiTietStr}</div>}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedRunId(null)}
                className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
