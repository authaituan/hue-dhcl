import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Database,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ShieldCheck,
  History,
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';

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

// Định dạng dung lượng KB/MB
function formatFileSize(kichThuoc) {
  if (kichThuoc === null || kichThuoc === undefined || isNaN(kichThuoc)) {
    return 'Chưa ghi nhận';
  }
  const bytes = Number(kichThuoc);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// Trạng thái thùng rác
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

export default function ReplaceLogDetail({
  isOpen,
  onClose,
  nhatKyId,
  isAdmin,
  onRestore,
}) {
  // RULES OF HOOKS: Mọi hooks ở đầu component, trước bất kỳ lệnh return nào
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  // Tải chi tiết
  useEffect(() => {
    let active = true;

    async function fetchDetail() {
      if (!isOpen || !nhatKyId) return;

      setLoading(true);
      setError(null);
      setDetail(null);

      try {
        const res = await apiFetchJson(`/api/arrivals/thay-the/nhat-ky/${nhatKyId}`);
        if (!active) return;

        if (res.ok) {
          setDetail(res.data);
        } else {
          const ma = res.data?.ma;
          const msg = res.data?.error || res.error || 'Có lỗi xảy ra khi xem chi tiết nhật ký.';
          setError({ message: msg, ma });
        }
      } catch (err) {
        if (!active) return;
        setError({
          message: 'Lỗi mạng hoặc không thể kết nối tới máy chủ.',
          ma: 'NETWORK_ERROR',
        });
      } finally {
        if (active) setLoading(false);
      }
    }

    if (isOpen) {
      fetchDetail();
    }

    return () => {
      active = false;
    };
  }, [isOpen, nhatKyId]);

  // Đóng bằng phím Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bcvhObj = BCVH_LIST.find((b) => b.ma === detail?.bcvh);
  const bcvhName = bcvhObj ? bcvhObj.ten : detail?.bcvh || '—';
  const trashStatus = getTrashStatus(detail?.thung_rac);
  const canRestore = isAdmin && Boolean(detail?.thung_rac?.con_khoi_phuc_duoc);

  const tapFileMoi = detail?.tap_file_moi || [];
  const tapFileCu = detail?.tap_file_cu || [];
  const khoiPhuc = detail?.khoi_phuc;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-drawer-title"
          className="w-screen max-w-xl md:max-w-2xl bg-white shadow-2xl flex flex-col border-l border-gray-200"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-2xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="detail-drawer-title" className="text-base font-bold text-gray-900">
                    Chi tiết lần thay thế #{nhatKyId}
                  </h3>
                  {detail && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${trashStatus.badgeClass}`}
                    >
                      {trashStatus.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {bcvhName} ({detail?.bcvh || '—'}) • Ngày {toDmy(detail?.ngay)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 inline-flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
            {/* Đang tải */}
            {loading && (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
                <RefreshCw className="w-7 h-7 animate-spin text-orange-500" />
                <p className="font-semibold">Đang tải thông tin chi tiết lần thay thế…</p>
              </div>
            )}

            {/* Báo lỗi */}
            {error && !loading && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 leading-relaxed flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-900">Không thể tải chi tiết</div>
                  <div>{error.message}</div>
                  {error.ma && (
                    <div className="tabular-nums text-[11px] text-rose-600">Mã lỗi: {error.ma}</div>
                  )}
                </div>
              </div>
            )}

            {/* Chi tiết thành công */}
            {detail && !loading && (
              <>
                {/* Khối ĐÃ KHÔI PHỤC (nếu có) */}
                {khoiPhuc && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Đã khôi phục dữ liệu</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-emerald-700">Thời điểm:</span>{' '}
                        <span className="font-semibold text-emerald-900">
                          {formatDateTime(khoiPhuc.thoi_diem_bangkok, khoiPhuc.thoi_diem)}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-700">Người thực hiện:</span>{' '}
                        <span className="font-semibold text-emerald-900">
                          {formatUser(khoiPhuc.nguoi)}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-700">Số dòng thêm:</span>{' '}
                        <span className="font-bold text-emerald-700">
                          +{formatNumber(khoiPhuc.so_dong_them)}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-700">Số dòng đã có:</span>{' '}
                        <span className="font-semibold text-emerald-900">
                          {formatNumber(khoiPhuc.so_dong_da_co)}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-700">Gắn sang file khác:</span>{' '}
                        <span className="font-semibold text-emerald-900">
                          {formatNumber(khoiPhuc.so_dong_gan_sang_file_khac)}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-700">File tạo lại:</span>{' '}
                        <span className="font-semibold text-emerald-900">
                          {formatNumber(khoiPhuc.so_file_tao_lai)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Thông tin chung */}
                <div className="card-soft p-4 rounded-xl border border-gray-200 space-y-3">
                  <div className="font-bold text-gray-800 text-xs uppercase tracking-wide border-b border-gray-100 pb-2">
                    Thông tin thực hiện thay thế
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Đơn vị (BCVH):</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {bcvhName} ({detail.bcvh})
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ngày thay thế:</span>{' '}
                      <span className="font-semibold text-gray-800">{toDmy(detail.ngay)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Thực hiện lúc:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {formatDateTime(detail.thoi_diem_bangkok, detail.thoi_diem)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Người thực hiện:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {formatUser(detail.nguoi)}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-gray-500">Số dòng xóa → nạp:</span>{' '}
                      <span className="font-semibold text-gray-900">
                        {formatNumber(detail.so_dong_xoa)} dòng xóa → {formatNumber(detail.so_dong_nap)} dòng nạp
                      </span>{' '}
                      <span className="text-gray-500">
                        ({detail.so_file_xoa} file cũ → {detail.so_file_nap} file mới)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Thông tin thùng rác và bản sao lưu */}
                <div className="card-soft p-4 rounded-xl border border-gray-200 space-y-3">
                  <div className="font-bold text-gray-800 text-xs uppercase tracking-wide border-b border-gray-100 pb-2 flex items-center justify-between">
                    <span>Thùng rác & Sao lưu</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${trashStatus.badgeClass}`}
                    >
                      {trashStatus.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500">Dòng trong thùng rác:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {detail.thung_rac?.so_dong !== undefined
                          ? `${formatNumber(detail.thung_rac.so_dong)} dòng`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">File trong thùng rác:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {detail.thung_rac?.so_file !== undefined
                          ? `${formatNumber(detail.thung_rac.so_file)} file`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Hạn lưu trữ thùng rác:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {formatDateTime(null, detail.thung_rac?.het_han_luc)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Dung lượng sao lưu:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {formatFileSize(detail.sao_luu?.kich_thuoc)}
                      </span>
                    </div>
                    {detail.sao_luu?.tep && (
                      <div className="sm:col-span-2">
                        <span className="text-gray-500">File sao lưu:</span>{' '}
                        <span className="tabular-nums text-[11px] text-gray-700 break-all">
                          {detail.sao_luu.tep}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Danh sách file mới đã nạp */}
                <div className="space-y-2">
                  <div className="font-bold text-gray-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />
                    <span>File mới đã nạp ({tapFileMoi.length})</span>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-cream-head border-b border-cream-line text-gray-600 font-bold uppercase text-[11px]">
                          <tr>
                            <th className="px-3.5 py-2">Tên file</th>
                            <th className="px-3 py-2">Trạng thái</th>
                            <th className="px-3 py-2 text-right">Tổng dòng</th>
                            <th className="px-3 py-2 text-right">Đã ghi</th>
                            <th className="px-3 py-2 text-right">Bỏ qua trùng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cream-line tabular-nums">
                          {tapFileMoi.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-3 text-center text-gray-400">
                                Không có thông tin file mới
                              </td>
                            </tr>
                          ) : (
                            tapFileMoi.map((f, idx) => (
                              <tr key={idx} className="hover:bg-cream-light/50">
                                <td className="px-3.5 py-2 tabular-nums text-[11px] text-gray-900 break-all font-medium">
                                  {f.ten || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                  {f.trang_thai || '—'}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">
                                  {formatNumber(f.so_dong)}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-emerald-700">
                                  {formatNumber(f.da_ghi)}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap text-gray-500">
                                  {formatNumber(f.bo_qua_trung)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Danh sách file cũ bị thay */}
                <div className="space-y-2">
                  <div className="font-bold text-gray-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                    <span>File cũ bị thay ({tapFileCu.length})</span>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-cream-head border-b border-cream-line text-gray-600 font-bold uppercase text-[11px]">
                          <tr>
                            <th className="px-3.5 py-2">Tên file</th>
                            <th className="px-3 py-2">Nguồn</th>
                            <th className="px-3 py-2">Trạng thái</th>
                            <th className="px-3 py-2 text-right">Số dòng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cream-line tabular-nums">
                          {tapFileCu.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-3 text-center text-gray-400">
                                Không có thông tin file cũ
                              </td>
                            </tr>
                          ) : (
                            tapFileCu.map((f, idx) => (
                              <tr key={idx} className="hover:bg-cream-light/50">
                                <td className="px-3.5 py-2 tabular-nums text-[11px] text-gray-900 break-all font-medium">
                                  {f.ten || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                  {f.nguon || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                  {f.trang_thai || '—'}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-gray-800">
                                  {formatNumber(f.so_dong)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-gray-300 hover:bg-white text-gray-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Đóng
            </button>

            {canRestore && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRestore(detail);
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs inline-flex items-center gap-2"
              >
                <span>Xem trước khôi phục</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
