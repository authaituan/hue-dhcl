import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import {
  formatUtcToVnDateTime,
  formatYmdToDmy,
  formatNumber,
  CELL_STATUS_MAP,
  RUN_FILE_ERROR_MAP,
  REASON_MAP,
  translateFileResult,
  getFileResultStyle
} from '../../utils/sourceIngest';

export default function SourceIngestCellPanel({
  cellParams, // { bcvh, ngay, dot }
  onClose,
  onTriggerLayLai,
  onNavigateReplaceDay,
  isExecuting
}) {
  const [loading, setLoading] = useState(true);
  const [cellData, setCellData] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCellDetail() {
      if (!cellParams?.bcvh || !cellParams?.ngay || !cellParams?.dot) return;
      setLoading(true);
      setFetchError(null);
      try {
        const qs = new URLSearchParams({
          bcvh: cellParams.bcvh,
          ngay: cellParams.ngay,
          dot: cellParams.dot
        }).toString();
        const res = await apiFetchJson(`/api/nap-nguon/o?${qs}`);
        if (!isMounted) return;
        if (res.ok) {
          setCellData(res.data);
        } else {
          const errText = typeof res.error === 'string' ? res.error : (res.data?.error || 'Không tải được chi tiết ô.');
          setFetchError(errText);
        }
      } catch (e) {
        if (!isMounted) return;
        setFetchError('Lỗi kết nối khi tải chi tiết ô.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadCellDetail();
    return () => {
      isMounted = false;
    };
  }, [cellParams?.bcvh, cellParams?.ngay, cellParams?.dot]);

  if (!cellParams) return null;

  const bcvh = cellParams.bcvh;
  const ngay = cellParams.ngay;
  const dot = cellParams.dot;
  const dotLabel = dot === 'S' ? 'Sáng' : 'Chiều';
  const tenBcvh = (cellData && typeof cellData.ten_bcvh === 'string') ? cellData.ten_bcvh : `BCVH ${bcvh}`;

  const trangThai = (cellData && typeof cellData.trang_thai === 'string') ? cellData.trang_thai : '';
  const statusCfg = (trangThai && CELL_STATUS_MAP[trangThai]) || {
    label: trangThai || '—',
    badgeClass: 'bg-gray-100 text-gray-700'
  };

  // Danh sách file trong DB và trên nguồn tách riêng
  const fileDbList = Array.isArray(cellData?.file_db)
    ? cellData.file_db
    : (cellData?.file_db && typeof cellData.file_db === 'object' ? [cellData.file_db] : []);

  const fileNguonList = Array.isArray(cellData?.file_nguon)
    ? cellData.file_nguon
    : (cellData?.file_nguon && typeof cellData.file_nguon === 'object' ? [cellData.file_nguon] : []);

  const fileMongDoi = cellData?.file_mong_doi && typeof cellData.file_mong_doi === 'object'
    ? cellData.file_mong_doi
    : null;

  // Thông tin nạp
  const thongTinNap = cellData?.thong_tin_nap && typeof cellData.thong_tin_nap === 'object'
    ? cellData.thong_tin_nap
    : null;
  const lanThuGanNhat = cellData?.lan_thu_gan_nhat && typeof cellData.lan_thu_gan_nhat === 'object'
    ? cellData.lan_thu_gan_nhat
    : null;
  const loi = cellData?.loi && typeof cellData.loi === 'object'
    ? cellData.loi
    : null;
  const lichSu = Array.isArray(cellData?.lich_su) ? cellData.lich_su : [];

  // Xử lý chuỗi hiển thị «Lần thử gần nhất» (dùng translateFileResult, không bao giờ mặc định «Lỗi»)
  let lanThuGanNhatText = null;
  if (lanThuGanNhat) {
    const lucVn = typeof lanThuGanNhat.luc === 'string' ? formatUtcToVnDateTime(lanThuGanNhat.luc) : '—';
    const cachChayStr = lanThuGanNhat.cach_chay === 'TU_DONG' ? 'Tự động' : 'Tay';
    
    let ketQuaStr = translateFileResult(lanThuGanNhat.ket_qua);
    if (lanThuGanNhat.ma_loi) {
      ketQuaStr = RUN_FILE_ERROR_MAP[lanThuGanNhat.ma_loi] || REASON_MAP[lanThuGanNhat.ma_loi] || ketQuaStr;
    }

    let text = `${lucVn} · ${cachChayStr} · ${ketQuaStr}`;
    if (lanThuGanNhat.so_dong !== undefined && lanThuGanNhat.so_dong !== null) {
      text += ` (${formatNumber(lanThuGanNhat.so_dong)} dòng)`;
    }
    lanThuGanNhatText = text;
  }

  // Dịch lỗi nếu có (không in mã thô, chỉ in chi_tiet khi là chuỗi)
  const loiMaLoiDich = loi?.ma_loi ? (RUN_FILE_ERROR_MAP[loi.ma_loi] || REASON_MAP[loi.ma_loi] || 'Lỗi') : null;
  const loiChiTiet = (loi && typeof loi.chi_tiet === 'string' && loi.chi_tiet.trim()) ? loi.chi_tiet.trim() : null;

  // Điều kiện nút «Lấy lại»:
  const canLayLai = ['LOI', 'RONG', 'NGUON_CO_FILE_CHUA_NAP', 'CHO_FILE'].includes(trangThai);
  const isDaNap = trangThai === 'DA_NAP';
  const isNguonChuaCoFile = trangThai === 'NGUON_CHUA_CO_FILE';
  const isChuaDenGio = trangThai === 'CHUA_DEN_GIO';
  const isChuaBatDau = trangThai === 'CHUA_BAT_DAU';

  const canReplaceDay = cellData?.nghi_ngo === 'IT' || cellData?.nghi_ngo === 'NHIEU';

  const handleLayLai = () => {
    onTriggerLayLai([{ bcvh, ngay, dot }]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-5 text-left my-8">
        {/* NÚT ĐÓNG */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HEADER CHI TIẾT Ô */}
        <div className="space-y-1.5 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900 tracking-tight">
              {tenBcvh} · {formatYmdToDmy(ngay)} · {dotLabel}
            </h3>
            {trangThai && (
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusCfg.badgeClass}`}>
                {statusCfg.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Mã đơn vị: {bcvh} · Đợt: {dotLabel}
          </p>
        </div>

        {/* NỘI DUNG LOADING / LỖI / DỮ LIỆU */}
        {loading ? (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
            <p className="text-xs text-gray-500">Đang nạp chi tiết ô…</p>
          </div>
        ) : fetchError ? (
          <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* TRƯỜNG HỢP CẢ HAI KHỐI ĐỀU KHÔNG CÓ FILE */}
            {fileDbList.length === 0 && fileNguonList.length === 0 && fileMongDoi?.mau_ten && typeof fileMongDoi.mau_ten === 'string' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900">
                <span className="text-gray-500 font-medium shrink-0">Tên file mong đợi:</span>
                <strong className="font-mono text-gray-900 break-all text-right">{fileMongDoi.mau_ten}</strong>
              </div>
            )}

            {/* KHỐI 1: TRONG CƠ SỞ DỮ LIỆU */}
            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200 space-y-3">
              <div className="font-bold text-gray-900 border-b border-gray-200/60 pb-1.5 flex items-center justify-between">
                <span>Trong cơ sở dữ liệu</span>
                {fileDbList.length > 0 && (
                  <span className="text-[11px] text-gray-400 font-normal">
                    {fileDbList.length} file
                  </span>
                )}
              </div>

              {fileDbList.length === 0 ? (
                <div className="text-gray-400 italic py-1 text-xs">
                  Chưa có file
                </div>
              ) : (
                <div className="space-y-3">
                  {fileDbList.map((f, idx) => {
                    if (!f || typeof f !== 'object') return null;

                    const nguonLabel = f.nguon === 'MANUAL' ? 'Nhập tay' : f.nguon === 'SFTP' ? 'Máy chủ nguồn' : null;

                    let trangThaiDbLabel = null;
                    if (f.trang_thai === 'OK') trangThaiDbLabel = 'OK';
                    else if (f.trang_thai === 'EMPTY') trangThaiDbLabel = 'Rỗng';
                    else if (f.trang_thai === 'REJECTED') trangThaiDbLabel = 'Bị từ chối';
                    else if (f.trang_thai === 'CONFLICT') trangThaiDbLabel = 'Trùng tên khác nội dung';

                    return (
                      <div key={f.id || idx} className="space-y-2 border-b border-gray-200/40 pb-2.5 last:border-0 last:pb-0">
                        {typeof f.ten === 'string' && f.ten && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-gray-500 font-medium shrink-0">Tên file:</span>
                            <strong className="font-mono text-gray-900 break-all text-right">{f.ten}</strong>
                          </div>
                        )}

                        {nguonLabel && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Nguồn:</span>
                            <span className="font-semibold text-gray-800">{nguonLabel}</span>
                          </div>
                        )}

                        {trangThaiDbLabel && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Trạng thái:</span>
                            <span className="font-semibold text-gray-800">{trangThaiDbLabel}</span>
                          </div>
                        )}

                        {f.so_dong !== undefined && f.so_dong !== null && !isNaN(f.so_dong) && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Số dòng:</span>
                            <strong className="font-bold text-gray-900">{formatNumber(f.so_dong)} dòng</strong>
                          </div>
                        )}

                        {typeof f.nap_luc === 'string' && f.nap_luc && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Nạp lúc:</span>
                            <strong className="text-gray-900">{formatUtcToVnDateTime(f.nap_luc)}</strong>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Các dòng «Thời gian nạp», «Lần thử gần nhất», Lỗi và «Lịch sử» giữ trong khối này */}
              {thongTinNap && thongTinNap.thoi_gian_nap_ms !== undefined && thongTinNap.thoi_gian_nap_ms !== null && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-200/50">
                  <span className="text-gray-500 font-medium">Thời gian nạp:</span>
                  <strong className="font-mono text-gray-800">{Number(thongTinNap.thoi_gian_nap_ms)} ms</strong>
                </div>
              )}

              {lanThuGanNhatText && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-gray-200/50">
                  <span className="text-gray-500 font-medium shrink-0">Lần thử gần nhất:</span>
                  <strong className="text-gray-800 text-right">{lanThuGanNhatText}</strong>
                </div>
              )}

              {/* Lỗi nếu có */}
              {(loiMaLoiDich || loiChiTiet) && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1">
                  <div className="font-bold">Lỗi phát sinh:</div>
                  {loiMaLoiDich && (
                    <div className="font-semibold text-red-700">{loiMaLoiDich}</div>
                  )}
                  {loiChiTiet && (
                    <div className="leading-relaxed">{loiChiTiet}</div>
                  )}
                </div>
              )}

              {/* LỊCH SỬ THỰC HIỆN CỦA ĐỢT (TỐI ĐA 20 DÒNG) */}
              {lichSu.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-200/50">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span>Lịch sử ({lichSu.length} lần gần nhất):</span>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto nav-scrollbar bg-white">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">Thời gian</th>
                          <th className="py-2 px-2.5">Cách chạy</th>
                          <th className="py-2 px-2.5">Kết quả</th>
                          <th className="py-2 px-2.5 text-right">Số dòng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lichSu.map((ls, idx) => {
                          if (!ls || typeof ls !== 'object') return null;
                          const lsLuc = typeof ls.luc === 'string' ? formatUtcToVnDateTime(ls.luc) : '—';
                          const lsCachChay = ls.cach_chay === 'TU_DONG' ? 'Tự động' : 'Tay';
                          
                          let lsKetQua = translateFileResult(ls.ket_qua);
                          if (ls.ma_loi) {
                            lsKetQua = RUN_FILE_ERROR_MAP[ls.ma_loi] || REASON_MAP[ls.ma_loi] || lsKetQua;
                          }
                          const lsStyle = getFileResultStyle(ls.ket_qua);
                          const lsChiTiet = typeof ls.chi_tiet === 'string' && ls.chi_tiet.trim() ? ls.chi_tiet.trim() : null;

                          return (
                            <tr key={ls.lan_id || idx} className="hover:bg-gray-50/50">
                              <td className="py-2 px-2.5 whitespace-nowrap">{lsLuc}</td>
                              <td className="py-2 px-2.5 whitespace-nowrap">{lsCachChay}</td>
                              <td className="py-2 px-2.5">
                                <div className={lsStyle.textClass}>
                                  {lsKetQua}
                                </div>
                                {lsChiTiet && (
                                  <div className="text-[10px] text-gray-500 font-normal mt-0.5">{lsChiTiet}</div>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right font-semibold">
                                {['DA_CO', 'BO_QUA', 'CHUA_ON_DINH'].includes(ls.ket_qua)
                                  ? '—'
                                  : (ls.so_dong !== undefined && ls.so_dong !== null ? formatNumber(ls.so_dong) : '—')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* KHỐI 2: TRÊN MÁY CHỦ NGUỒN */}
            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200 space-y-3">
              <div className="font-bold text-gray-900 border-b border-gray-200/60 pb-1.5 flex items-center justify-between">
                <span>Trên máy chủ nguồn</span>
                {fileNguonList.length > 0 && (
                  <span className="text-[11px] text-gray-400 font-normal">
                    {fileNguonList.length} file
                  </span>
                )}
              </div>

              {fileNguonList.length === 0 ? (
                <div className="text-gray-400 italic py-1 text-xs">
                  Chưa có file
                </div>
              ) : (
                <div className="space-y-3">
                  {fileNguonList.map((f, idx) => {
                    if (!f || typeof f !== 'object') return null;

                    let kichThuocText = null;
                    if (typeof f.kich_thuoc === 'number' && !isNaN(f.kich_thuoc)) {
                      const kb = Math.round(f.kich_thuoc / 1024);
                      const bytes = formatNumber(f.kich_thuoc);
                      kichThuocText = `${kb} KB (${bytes} byte)${f.kich_thuoc <= 3 ? ' · file rỗng' : ''}`;
                    }

                    return (
                      <div key={f.id || idx} className="space-y-2 border-b border-gray-200/40 pb-2.5 last:border-0 last:pb-0">
                        {typeof f.ten === 'string' && f.ten && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-gray-500 font-medium shrink-0">Tên file:</span>
                            <strong className="font-mono text-gray-900 break-all text-right">{f.ten}</strong>
                          </div>
                        )}

                        {kichThuocText && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Kích thước:</span>
                            <strong className="font-mono text-gray-800">{kichThuocText}</strong>
                          </div>
                        )}

                        {f.con_tren_nguon === false && (
                          <div className="flex items-center justify-between text-amber-700 font-medium">
                            <span>Tình trạng nguồn:</span>
                            <span>không còn trên nguồn</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HÀNG NÚT HÀNH ĐỘNG Ở CHÂN KHUNG */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="text-[11px] text-gray-500">
            {isDaNap && 'File đã nạp, không nạp đè.'}
            {isNguonChuaCoFile && 'Nguồn chưa có file.'}
            {isChuaDenGio && 'Chưa đến giờ mong đợi.'}
            {isChuaBatDau && 'Chưa bắt đầu có dữ liệu.'}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {canReplaceDay && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateReplaceDay && onNavigateReplaceDay({ bcvh, ngay });
                }}
                className="px-4 py-2 text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-xl transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Thay thế ngày</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={handleLayLai}
              disabled={!canLayLai || isExecuting}
              className={`px-5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer ${
                canLayLai && !isExecuting
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              Lấy lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
