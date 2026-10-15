import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  RefreshCw,
  Clock,
  PlayCircle,
  X,
  Server
} from 'lucide-react';
import { formatUtcToVnDateTime } from '../../utils/sourceIngest';

export default function SourceIngestStatus({
  data,
  loading,
  onRefresh,
  onTriggerLayNgay,
  isPolling
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const tuDong = (data?.tu_dong && typeof data.tu_dong === 'object') ? data.tu_dong : {};
  const luotGanNhat = (data?.luot_gan_nhat && typeof data.luot_gan_nhat === 'object') ? data.luot_gan_nhat : null;
  const dangChay = (data?.dang_chay && typeof data.dang_chay === 'object') ? data.dang_chay : null;
  const gioMongDoi = (data?.gio_mong_doi && typeof data.gio_mong_doi === 'object') ? data.gio_mong_doi : null;

  const trangThai = (typeof tuDong.trang_thai === 'string') ? tuDong.trang_thai : 'TAT';
  const isA1 = trangThai === 'CHO' || trangThai === 'DANG_CHAY';
  const isA2 = trangThai === 'TAM_DUNG';
  const isA3 = trangThai === 'TAT';

  // Điều kiện khóa nút Lấy ngay
  const isDangChay = Boolean(dangChay);
  const isTamDung = isA2;
  const isLayNgayDisabled = isDangChay || isTamDung || loading || isPolling;

  const handleConfirmLayNgay = () => {
    setShowConfirmModal(false);
    onTriggerLayNgay();
  };

  return (
    <div className="space-y-3">
      {/* KHUNG A. TÌNH TRẠNG CHUNG */}
      <div
        className={`card-soft p-5 rounded-2xl border transition-all ${
          isA1
            ? 'bg-emerald-50/70 border-emerald-200'
            : isA2
            ? 'bg-rose-50/80 border-rose-300'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* CỘT NỘI DUNG TÌNH TRẠNG */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                A. Tình trạng chung
              </span>
              {isPolling && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Đang theo dõi lượt chạy…</span>
                </span>
              )}
            </div>

            {/* A1: BÌNH THƯỜNG / ĐANG CHẠY */}
            {isA1 && (
              <>
                <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Tự động lấy dữ liệu: Bật, mỗi {tuDong.chu_ky_phut || 10} phút
                  </span>
                </h3>
                <div className="text-xs text-emerald-900 leading-relaxed">
                  {luotGanNhat ? (
                    <>
                      Lượt gần nhất{' '}
                      <strong>{typeof luotGanNhat.bat_dau === 'string' ? formatUtcToVnDateTime(luotGanNhat.bat_dau) : '—'}</strong>:{' '}
                      <span className={luotGanNhat.ket_qua === 'THANH_CONG' ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                        {luotGanNhat.ket_qua === 'THANH_CONG' ? 'thành công' : 'có lỗi'}
                      </span>
                    </>
                  ) : (
                    'Chưa có thông tin lượt trước đó'
                  )}
                  {typeof tuDong.luot_ke_tiep_luc === 'string' && (
                    <>
                      {' '}· Lượt kế tiếp khoảng{' '}
                      <strong>{formatUtcToVnDateTime(tuDong.luot_ke_tiep_luc)}</strong>
                    </>
                  )}
                </div>
              </>
            )}

            {/* A2: TẠM DỪNG DO LỖI */}
            {isA2 && (
              <>
                <h3 className="text-base font-bold text-rose-950 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Tự động lấy dữ liệu: TẠM DỪNG</span>
                </h3>
                <div className="text-xs text-rose-900 leading-relaxed space-y-1">
                  <p>
                    {tuDong.ly_do_tam_dung === 'XAC_THUC' &&
                      'Máy chủ nguồn từ chối thông tin đăng nhập. Hệ thống đã dừng thử lại để tránh bị khóa. Nhờ quản trị cập nhật thông tin đăng nhập trong cấu hình rồi khởi động lại máy chủ.'}
                    {tuDong.ly_do_tam_dung === 'VAN_TAY' &&
                      'Không xác minh được máy chủ nguồn: khóa bảo mật khác với khóa đã lưu. Hệ thống đã dừng thử lại để tránh bị chặn. Nhờ quản trị NAS xác nhận khóa mới, cập nhật cấu hình rồi khởi động lại máy chủ.'}
                    {!tuDong.ly_do_tam_dung &&
                      'Hệ thống đã tạm dừng tự động lấy dữ liệu. Báo quản trị hệ thống.'}
                  </p>
                  {typeof tuDong.loi_luc === 'string' && (
                    <p className="text-[11px] text-rose-700">
                      Lần lỗi: <strong>{formatUtcToVnDateTime(tuDong.loi_luc)}</strong>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* A3: CHƯA BẬT / TẮT */}
            {isA3 && (
              <>
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <MinusCircle className="w-5 h-5 text-gray-500 shrink-0" />
                  <span>Tự động lấy dữ liệu: Tắt</span>
                </h3>
                <div className="text-xs text-gray-600 leading-relaxed">
                  Chưa bật hoặc cấu hình chưa đủ. Dữ liệu chỉ được nạp khi ADMIN bấm «Lấy ngay». Kiểm tra cấu hình nguồn rồi khởi động lại máy chủ nếu cần.
                </div>
              </>
            )}

            {/* Thông tin giờ mong đợi */}
            {gioMongDoi && (
              <div className="text-[11px] text-gray-500 pt-1 flex items-center gap-1.5 flex-wrap">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Giờ mong đợi: sáng <strong>{gioMongDoi.sang || '09:30'}</strong>, chiều <strong>{gioMongDoi.chieu || '16:30'}</strong> (ân hạn {gioMongDoi.an_han_phut || 30} phút; số đang đặt tạm)
                </span>
              </div>
            )}
          </div>

          {/* CỘT NÚT LẤY NGAY & LÀM MỚI */}
          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="p-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                title="Làm mới trạng thái"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
              </button>

              <button
                id="btn-lay-ngay"
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={isLayNgayDisabled}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 transition-all shadow-soft cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Lấy ngay</span>
              </button>
            </div>

            {/* Chú thích lý do nút Lấy ngay bị khóa */}
            {isDangChay && (
              <span className="text-[11px] text-orange-700 font-medium text-right">
                Đang có lượt chạy: #{dangChay.id} bắt đầu {typeof dangChay.bat_dau === 'string' ? formatUtcToVnDateTime(dangChay.bat_dau) : '—'}
              </span>
            )}
            {isTamDung && !isDangChay && (
              <span className="text-[11px] text-rose-700 font-medium text-right">
                Đang tạm dừng
              </span>
            )}
          </div>
        </div>
      </div>

      {/* MODAL XÁC NHẬN «LẤY NGAY» (HỘP E CANVAS) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4 text-left">
            <button
              type="button"
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-gray-900">
              <div className="p-2.5 rounded-xl bg-orange-100 text-orange-600">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">Lấy dữ liệu ngay?</h3>
                <p className="text-xs text-gray-500">Quét thư mục nguồn để nạp bổ sung</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Hệ thống quét thư mục nguồn, nạp các file chưa có (tối đa 20 file mỗi lần, cũ trước). File đã nạp được bỏ qua. Quá trình có thể mất 1–2 phút.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmLayNgay}
                className="px-5 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Lấy ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
