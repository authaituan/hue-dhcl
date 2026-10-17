import React, { useState, useEffect } from 'react';
import {
  Calendar,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Server,
  Database,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Info,
  Check,
  History,
} from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import CustomDatePicker from './CustomDatePicker';
import ReplaceDayDialog from './ReplaceDayDialog';
import ReplaceLogTab from './ReplaceLogTab';
import { NGUONG_MAT_SHBG_DO } from '../../lib/thamSoDuPhong';

// ==========================================
// HÀM TIỆN ÍCH ĐỊNH DẠNG
// ==========================================

// Định dạng số có dấu chấm ngăn cách hàng nghìn (vd: 1.234)
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Định dạng phần trăm có dấu phẩy (vd: 2,04%)
function formatPercent(p) {
  if (p === null || p === undefined || isNaN(p)) return '0,00%';
  const pct = (Number(p) * 100).toFixed(2);
  return pct.replace('.', ',') + '%';
}

// Chuyển YYYY-MM-DD sang DD/MM/YYYY
function toDmy(ymd) {
  if (!ymd) return '';
  const parts = String(ymd).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
}

// Lấy ngày hôm qua dạng YYYY-MM-DD
function getYesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Kiểm tra xem ngày có nằm trong 3 ngày gần nhất (hôm nay, hôm qua, hôm kia) không
function isWithinLast3Days(ymd) {
  if (!ymd) return false;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3) return false;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = today.getTime() - d.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
  return diffDays >= 0 && diffDays <= 2;
}

// Bảng thông báo tiếng Việt theo mã lỗi
const ERROR_MESSAGES = {
  NGUON_DA_DOI: 'Máy chủ nguồn đã thay đổi tệp tin hoặc mã băm so với lần xem trước. Vui lòng bấm «Xem trước lại» để cập nhật.',
  DANG_THAY_THE: 'Hệ thống đang có một tiến trình thay thế khác đang thực hiện. Vui lòng thử lại sau ít phút.',
  DANG_CO_LUOT_DONG_BO: 'Hệ thống đang có lượt đồng bộ dữ liệu tự động đang chạy. Vui lòng thử lại sau.',
  CAN_DONG_Y_MAT_DU_LIEU: 'Có bưu gửi bị mất thật so với dữ liệu cũ. Cần tích chọn đồng ý mất dữ liệu để tiếp tục.',
  DU_LIEU_DA_DOI: 'Dữ liệu của đơn vị và ngày này trong cơ sở dữ liệu đã thay đổi giữa lúc xem trước và lúc thực hiện.',
  XAC_NHAN_SAI: 'Thông tin xác nhận mã BCVH hoặc ngày không khớp.',
  THAM_SO_SAI: 'Tham số yêu cầu không hợp lệ.',
  TAP_FILE_KHONG_HOP_LE: 'Tập tệp tin yêu cầu không hợp lệ hoặc không thuộc đơn vị/ngày này.',
  FILE_NGUON_LOI: 'Tệp dữ liệu trên máy chủ nguồn bị lỗi định dạng hoặc lỗi tải về.',
  KHONG_CO_FILE_DE_THAY: 'Không có tệp dữ liệu hợp lệ nào để thay thế.',
  CHUA_CAU_HINH_SFTP: 'Chưa cấu hình thông tin kết nối máy chủ nguồn trên hệ thống.',
  NGUON_XAC_THUC: 'Không thể xác thực với máy chủ nguồn (sai thông tin đăng nhập).',
  NGUON_VAN_TAY: 'Không xác minh được máy chủ nguồn.',
  NGUON_MANG: 'Lỗi mạng hoặc hết thời gian chờ kết nối máy chủ nguồn.',
  NGUON_THU_MUC: 'Thư mục trên máy chủ nguồn không tồn tại hoặc không thể truy cập.',
  NGUON_KHAC: 'Lỗi phát sinh từ máy chủ nguồn.',
  KHONG_DU_CHO_SAO_LUU: 'Không đủ dung lượng đĩa trống để tạo bản sao lưu an toàn trước khi thay thế.',
  SAO_LUU_LOI: 'Quá trình sao lưu cơ sở dữ liệu gặp lỗi.',
  GHI_THAT_BAI: 'Giao dịch thay thế dữ liệu thất bại và đã được tự động phục hồi.',
  LOI_HE_THONG: 'Lỗi hệ thống trong quá trình thực hiện.',
};

export default function ReplaceDayView({ authUser, initialBcvh, initialNgay }) {
  // Tab nội bộ: 'replace' (Thay thế ngày) | 'log' (Nhật ký và khôi phục)
  const [activeTab, setActiveTab] = useState('replace');

  // Lựa chọn đầu vào
  const [bcvh, setBcvh] = useState(initialBcvh || BCVH_LIST[0]?.ma || '533140');
  const [ngay, setNgay] = useState(initialNgay || getYesterdayYmd());

  useEffect(() => {
    if (initialBcvh) setBcvh(initialBcvh);
    if (initialNgay) setNgay(initialNgay);
  }, [initialBcvh, initialNgay]);

  // Trạng thái xem trước
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Danh sách tệp nguồn đang được tích chọn (mặc định tích hết khi nạp preview)
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Cờ báo hiệu tệp đã bị thay đổi tích -> kết quả preview thành "cũ"
  const [isOutdated, setIsOutdated] = useState(false);

  // Dialog xác nhận thay thế
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Kết quả thực hiện thành công
  const [executionResult, setExecutionResult] = useState(null);

  const bcvhObj = BCVH_LIST.find((b) => b.ma === bcvh);
  const bcvhName = bcvhObj ? bcvhObj.ten : bcvh;

  // ==========================================
  // HÀM GỌI API XEM TRƯỚC
  // ==========================================
  const handleFetchPreview = async (filesOverride) => {
    if (!bcvh || !ngay) return;

    setLoadingPreview(true);
    setPreviewError(null);
    setExecutionResult(null);

    try {
      const payload = {
        bcvh,
        ngay, // yyyy-mm-dd
      };

      // Nếu có truyền danh sách tệp lọc cụ thể (hoặc khi bấm Xem trước lại)
      if (Array.isArray(filesOverride)) {
        payload.tap_file = filesOverride;
      }

      const res = await apiFetchJson('/api/arrivals/thay-the/xem-truoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = res.data;
        setPreviewData(data);
        setIsOutdated(false);

        // Mặc định tích các tệp có chon !== false và ket_luan !== 'REJECTED'
        const allSourceFiles = data?.nguon?.tap_file || [];
        const initialSelected = allSourceFiles
          .filter((f) => f.chon !== false && f.ket_luan !== 'REJECTED')
          .map((f) => f.ten);
        setSelectedFiles(initialSelected);
      } else {
        const maLoi = res.data?.ma;
        let msg = ERROR_MESSAGES[maLoi];
        if (!msg) {
          msg = res.data?.error || res.error || 'Có lỗi xảy ra khi xem trước.';
          msg += ' Báo người quản trị hệ thống.';
        }
        msg += ' Dữ liệu cũ được giữ nguyên.';
        setPreviewError({ message: msg, code: maLoi || `HTTP_${res.status}` });
        setPreviewData(null);
      }
    } catch (err) {
      setPreviewError({
        message: 'Lỗi mạng hoặc không thể kết nối tới máy chủ. Dữ liệu cũ được giữ nguyên.',
        code: 'NETWORK_ERROR',
      });
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // ==========================================
  // XỬ LÝ ĐỔI TÍCH CHỌN TỆP NGUỒN
  // ==========================================
  const handleToggleFile = (fileName) => {
    setSelectedFiles((prev) => {
      let next;
      if (prev.includes(fileName)) {
        next = prev.filter((name) => name !== fileName);
      } else {
        next = [...prev, fileName];
      }
      return next;
    });
    // Đánh dấu kết quả trên màn thành "cũ"
    setIsOutdated(true);
  };

  const handleSelectAllFiles = () => {
    const readyFiles = (previewData?.nguon?.tap_file || [])
      .filter((f) => f.ket_luan === 'READY')
      .map((f) => f.ten);
    setSelectedFiles(readyFiles);
    setIsOutdated(true);
  };

  const handleDeselectAllFiles = () => {
    setSelectedFiles([]);
    setIsOutdated(true);
  };

  // ==========================================
  // TÍNH TOÁN DỮ LIỆU HIỂN THỊ
  // ==========================================
  const nguonFiles = previewData?.nguon?.tap_file || [];
  const dbFiles = previewData?.db?.tap_file || [];
  const soSanh = previewData?.so_sanh || {};
  const canhBao = previewData?.canh_bao || {};
  const phat = previewData?.phat || {};

  const shbgMatThat = Number(soSanh.shbg_mat_that ?? 0);
  const shbgChiOCu = Number(soSanh.shbg_chi_o_cu ?? 0);
  const tyLeMatThat = Number(soSanh.ty_le_mat_that ?? 0);
  const nguongDo = Number(canhBao.nguong_do ?? NGUONG_MAT_SHBG_DO);

  const isKhongTheThay = Boolean(canhBao.khong_the_thay);
  const warningLevel = canhBao.muc || 'AN_TOAN';

  // Kiểm tra cảnh báo 3 ngày gần:
  // Nếu ngày chọn nằm trong 3 ngày gần nhất và admin đã bỏ tích file nào đó
  const hasUncheckedFile = nguonFiles.length > 0 && nguonFiles.some((f) => !selectedFiles.includes(f.ten));
  const showNearDaysWarning = isWithinLast3Days(ngay) && hasUncheckedFile;

  const isAdmin = authUser?.role === 'ADMIN';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── THANH CHUYỂN TAB NỘI BỘ ───────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('replace')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer inline-flex items-center gap-2 ${
            activeTab === 'replace'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Thay thế ngày</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer inline-flex items-center gap-2 ${
            activeTab === 'log'
              ? 'border-orange-500 text-orange-600 bg-orange-50/40 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Nhật ký và khôi phục</span>
        </button>
      </div>

      {/* ── TAB 1: THAY THẾ NGÀY ────────────────────────────────────────── */}
      <div className={activeTab === 'replace' ? 'space-y-6' : 'hidden'}>
      {/* ── CARD TIÊU ĐỀ & MÔ TẢ ────────────────────────────────────────── */}
      <div className="card-soft p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 uppercase tracking-wide">
              ADMIN ONLY
            </span>
            <h2 className="text-xl font-bold text-[--color-title] flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-orange-500" />
              <span>Thay Thế Ngày Của Một BCVH</span>
            </h2>
          </div>
          <p className="text-xs text-[--color-body] mt-1.5 leading-relaxed max-w-3xl">
            Thay thế toàn bộ dữ liệu sản lượng đến của một ngày tại một đơn vị bằng dữ liệu từ máy chủ nguồn.
            Dữ liệu cũ được sao lưu và lưu tại thùng rác trước khi thay thế.
          </p>
        </div>
      </div>

      {/* ── MỤC 1 CANVAS: THANH CÔNG CỤ CHỌN BCVH VÀ NGÀY ───────────────── */}
      <div className="card-soft p-5 rounded-2xl space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-[--color-title] flex items-center gap-2 border-b border-gray-100 pb-2.5">
          <Calendar className="w-4 h-4 text-orange-500" />
          <span>1. Chọn đơn vị và ngày thay thế</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Ô chọn BCVH */}
          <div className="space-y-1.5">
            <label htmlFor="select-bcvh" className="block text-xs font-semibold text-gray-700">
              Bưu cục vận hành (BCVH):
            </label>
            <select
              id="select-bcvh"
              value={bcvh}
              onChange={(e) => {
                setBcvh(e.target.value);
                setPreviewData(null);
                setExecutionResult(null);
              }}
              disabled={loadingPreview}
              className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all cursor-pointer shadow-2xs"
            >
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten} ({b.ma})
                </option>
              ))}
            </select>
          </div>

          {/* Ô chọn Ngày (DATE-1 CustomDatePicker) */}
          <div className="space-y-1.5">
            <label htmlFor="datepicker-ngay" className="block text-xs font-semibold text-gray-700">
              Ngày cần thay thế (dd/mm/yyyy):
            </label>
            <CustomDatePicker
              id="datepicker-ngay"
              value={ngay}
              onChange={(val) => {
                setNgay(val);
                setPreviewData(null);
                setExecutionResult(null);
              }}
              disabled={loadingPreview}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Nút Xem trước */}
          <div className="sm:col-span-2 lg:col-span-2 flex items-center gap-3">
            <button
              id="btn-xem-truoc"
              type="button"
              onClick={() => handleFetchPreview()}
              disabled={loadingPreview || !bcvh || !ngay}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all shadow-soft cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingPreview ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang lấy dữ liệu từ máy chủ nguồn…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Xem trước</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── THÔNG BÁO LỖI KHI XEM TRƯỚC ─────────────────────────────────── */}
      {previewError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1.5">
          <div className="font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>Không thể lấy thông tin xem trước</span>
          </div>
          <div className="leading-relaxed pl-6">{previewError.message}</div>
          {previewError.code && (
            <div className="text-[10px] text-red-600 font-mono pl-6">
              Mã lỗi: {previewError.code}
            </div>
          )}
        </div>
      )}

      {/* ── MỤC 4 CANVAS: HỘP E - KẾT QUẢ THỰC HIỆN THÀNH CÔNG ───────────── */}
      {executionResult && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Thay thế ngày thành công
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Đã hoàn tất thay thế dữ liệu ngày {toDmy(ngay)} của {bcvhName} ({bcvh}).
                </p>
              </div>
            </div>

            <div className="text-right text-[11px] text-emerald-800 font-mono">
              Nhật ký: <strong className="font-bold text-emerald-950">#{executionResult.nhat_ky_id}</strong>
            </div>
          </div>

          {/* Lưới thông số kết quả */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/80 p-4 rounded-xl border border-emerald-100 text-xs text-gray-800">
            <div>
              <span className="text-gray-500 text-[11px] block">Người thực hiện:</span>
              <strong className="font-bold text-gray-900">
                {authUser?.full_name || authUser?.hrm_code || 'ADMIN'}
              </strong>
            </div>
            <div>
              <span className="text-gray-500 text-[11px] block">Số dòng đã xóa:</span>
              <strong className="font-bold text-gray-900">
                {formatNumber(executionResult.so_dong_xoa)}
              </strong>
            </div>
            <div>
              <span className="text-gray-500 text-[11px] block">Số dòng đã nạp:</span>
              <strong className="font-bold text-emerald-700">
                {formatNumber(executionResult.so_dong_nap)}
              </strong>
            </div>
            <div>
              <span className="text-gray-500 text-[11px] block">Số tệp đã nạp:</span>
              <strong className="font-bold text-gray-900">
                {formatNumber(executionResult.so_file_nap)} tệp
              </strong>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500 text-[11px] block">Tệp sao lưu an toàn:</span>
              <strong className="font-mono text-[11px] text-gray-800 break-all">
                {executionResult.sao_luu?.tep || '—'}
              </strong>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500 text-[11px] block">Thùng rác lưu trữ đến:</span>
              <strong className="font-bold text-gray-900">
                {toDmy(executionResult.thung_rac?.het_han_luc?.slice(0, 10)) || '30 ngày'}
              </strong>
            </div>
          </div>

          {/* Danh sách tệp mới đã nạp */}
          {Array.isArray(executionResult.tap_file_moi) && executionResult.tap_file_moi.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-bold text-emerald-950">Danh sách tệp mới đã nạp:</div>
              <div className="divide-y divide-emerald-100 bg-white/80 rounded-xl border border-emerald-100 overflow-hidden text-xs">
                {executionResult.tap_file_moi.map((t, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-gray-900 truncate">{t.ten}</span>
                    <div className="flex items-center gap-3 shrink-0 text-[11px]">
                      <span className="text-gray-600 font-semibold">{formatNumber(t.so_dong)} dòng</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {t.trang_thai || 'ĐÃ GHI'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setExecutionResult(null);
                setPreviewData(null);
              }}
              className="px-4 py-2 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 rounded-xl hover:bg-emerald-100/50 transition-colors cursor-pointer shadow-2xs"
            >
              Tiếp tục với ngày khác
            </button>
          </div>
        </div>
      )}

      {/* ── MỤC 2 CANVAS: BẢNG XEM TRƯỚC ─────────────────────────────────── */}
      {previewData && (
        <div className="space-y-6">
          {/* CẢNH BÁO DỮ LIỆU ĐÃ CŨ KHI THAY ĐỔI TÍCH TỆP */}
          {isOutdated && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  <strong>Danh sách tệp nguồn đã thay đổi:</strong> Kết quả trên màn hình hiện là của cấu hình cũ. Nút «Thay thế…» tạm thời bị khóa.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleFetchPreview(selectedFiles)}
                disabled={loadingPreview || selectedFiles.length === 0}
                className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Xem trước lại</span>
              </button>
            </div>
          )}

          {/* CẢNH BÁO NGÀY GẦN (MỤC 6 TICKET) */}
          {showNearDaysWarning && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Hệ thống tự động lấy dữ liệu có thể nạp lại file bỏ tích trong vài phút.
              </div>
            </div>
          )}

          {/* KHUNG CẢNH BÁO THEO MỨC (AN_TOAN / CAN_XAC_NHAN / DO / KHONG_THE_THAY) */}
          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-2xs ${
            isKhongTheThay ? 'bg-gray-100 border-gray-300 text-gray-800' :
            warningLevel === 'DO' ? 'bg-red-50 border-red-300 text-red-900' :
            warningLevel === 'CAN_XAC_NHAN' ? 'bg-amber-50 border-amber-300 text-amber-900' :
            'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}>
            <div className="shrink-0 mt-0.5">
              {isKhongTheThay && <AlertCircle className="w-5 h-5 text-gray-700" />}
              {!isKhongTheThay && warningLevel === 'DO' && <ShieldAlert className="w-5 h-5 text-red-600" />}
              {!isKhongTheThay && warningLevel === 'CAN_XAC_NHAN' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {!isKhongTheThay && warningLevel === 'AN_TOAN' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </div>
            <div className="space-y-1">
              <div className="font-bold text-sm">
                {isKhongTheThay && 'Không thể thay thế'}
                {!isKhongTheThay && warningLevel === 'DO' && 'Cảnh báo nguy hiểm: Tỷ lệ mất thật vượt ngưỡng cho phép'}
                {!isKhongTheThay && warningLevel === 'CAN_XAC_NHAN' && 'Cần xác nhận: Có bưu gửi bị mất thật'}
                {!isKhongTheThay && warningLevel === 'AN_TOAN' && 'An toàn: Không mất bưu gửi nào'}
              </div>
              <div className="leading-relaxed">
                {isKhongTheThay && (canhBao.ly_do_khong_the_thay || 'Không có tệp dữ liệu hợp lệ để thay thế.')}
                {!isKhongTheThay && warningLevel === 'DO' && `Tỷ lệ mất thật là ${formatPercent(tyLeMatThat)}, vượt ngưỡng an toàn ${formatPercent(nguongDo)}. Có ${formatNumber(shbgMatThat)} bưu gửi sẽ bị mất.`}
                {!isKhongTheThay && warningLevel === 'CAN_XAC_NHAN' && `Tỷ lệ mất thật là ${formatPercent(tyLeMatThat)}, nằm trong ngưỡng cho phép (${formatPercent(nguongDo)}). Có ${formatNumber(shbgMatThat)} bưu gửi sẽ bị mất.`}
                {!isKhongTheThay && warningLevel === 'AN_TOAN' && 'Tất cả bưu gửi trong dữ liệu cũ đều có trong tập dữ liệu mới hoặc nằm ở các tệp ngoài tập.'}
              </div>
            </div>
          </div>

          {/* 4 Ô SO SÁNH KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Số dòng */}
            <div className="card-soft p-4 rounded-2xl space-y-1.5 border border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                1. Dữ liệu dòng
              </span>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs text-gray-600">Cũ:</span>
                <strong className="text-sm font-bold text-gray-800">{formatNumber(soSanh.dong_cu)}</strong>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-gray-600">Mới sau lọc:</span>
                <strong className="text-sm font-bold text-orange-600">{formatNumber(soSanh.dong_moi_sau_loc_trung)}</strong>
              </div>
              {Number(soSanh.dong_moi_trung_du_lieu_con_lai ?? 0) > 0 && (
                <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                  Trùng ngoài tập: {formatNumber(soSanh.dong_moi_trung_du_lieu_con_lai)} dòng
                </div>
              )}
            </div>

            {/* KPI 2: Số bưu gửi */}
            <div className="card-soft p-4 rounded-2xl space-y-1.5 border border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                2. Tổng số bưu gửi
              </span>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs text-gray-600">Cũ:</span>
                <strong className="text-sm font-bold text-gray-800">{formatNumber(soSanh.shbg_cu)}</strong>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-gray-600">Mới:</span>
                <strong className="text-sm font-bold text-orange-600">{formatNumber(soSanh.shbg_moi)}</strong>
              </div>
              <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-100 flex justify-between">
                <span>Chung cả hai:</span>
                <span className="font-semibold">{formatNumber(soSanh.shbg_chung)}</span>
              </div>
            </div>

            {/* KPI 3: Bưu gửi chỉ ở mới */}
            <div className="card-soft p-4 rounded-2xl space-y-1.5 border border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                3. Bưu gửi thêm mới
              </span>
              <div className="pt-2">
                <div className="text-2xl font-extrabold text-emerald-600">
                  +{formatNumber(soSanh.shbg_chi_o_moi)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Bưu gửi chỉ có trong tập dữ liệu mới
                </div>
              </div>
            </div>

            {/* KPI 4: Bưu gửi bị mất (MẤT THẬT) */}
            <div className={`card-soft p-4 rounded-2xl space-y-1.5 border ${
              shbgMatThat > 0
                ? warningLevel === 'DO'
                  ? 'border-red-300 bg-red-50/30'
                  : 'border-amber-300 bg-amber-50/30'
                : 'border-gray-100'
            }`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                4. Bưu gửi bị mất (Mất thật)
              </span>
              <div className="pt-2">
                <div className={`text-2xl font-extrabold ${
                  shbgMatThat > 0
                    ? warningLevel === 'DO'
                      ? 'text-red-600'
                      : 'text-amber-600'
                    : 'text-emerald-600'
                }`}>
                  {formatNumber(shbgMatThat)}
                </div>
                {shbgMatThat < shbgChiOCu ? (
                  <div className="text-[10px] text-gray-500 mt-1 leading-tight">
                    (Cận trên: {formatNumber(shbgChiOCu)}; {formatNumber(shbgChiOCu - shbgMatThat)} bưu gửi còn ở file ngoài tập)
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Bưu gửi không còn trong bất kỳ tệp nào
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* THANH TỶ LỆ MẤT VỚI VẠCH NGƯỠNG ĐỎ */}
          <div className="card-soft p-5 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs">
              <div className="font-bold text-gray-800">
                Thanh tỷ lệ mất thật: <span className="font-extrabold text-sm">{formatPercent(tyLeMatThat)}</span>
              </div>
              <div className="text-gray-500 text-[11px]">
                Ngưỡng cảnh báo cao (vạch đỏ): <strong className="text-red-600">{formatPercent(nguongDo)}</strong>
              </div>
            </div>

            {/* Thanh Progress trực quan */}
            <div className="relative w-full h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  tyLeMatThat > nguongDo
                    ? 'bg-red-500'
                    : tyLeMatThat > 0
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, tyLeMatThat * 100))}%` }}
              />
              {/* Vạch đỏ chỉ ngưỡng */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-10"
                style={{ left: `${Math.min(100, nguongDo * 100)}%` }}
                title={`Vạch ngưỡng đỏ: ${formatPercent(nguongDo)}`}
              />
            </div>
          </div>

          {/* DÒNG TRẠNG THÁI PHÁT */}
          {phat.co_bang && (
            <div className="card-soft p-4 rounded-2xl bg-gray-50/70 border border-gray-200 text-xs text-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="font-semibold text-gray-900">Thông tin trạng thái phát:</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span>
                  Tổng bưu gửi có trạng thái phát:{' '}
                  <strong className="font-bold text-gray-900">{formatNumber(phat.so_shbg_co_trang_thai)}</strong>
                </span>
                <span>
                  Còn sau khi thay:{' '}
                  <strong className="font-bold text-emerald-700">{formatNumber(phat.con_o_ban_moi)}</strong>
                </span>
                <span>
                  Bị mất trạng thái phát:{' '}
                  <strong className={`font-bold ${Number(phat.khong_con ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatNumber(phat.khong_con)}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* HAI BẢNG TỆP TIN: TỆP NGUỒN & TỆP DB HIỆN TẠI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BẢNG 1: TẬP TỆP TIN TRÊN MÁY CHỦ NGUỒN */}
            <div className="card-soft rounded-2xl overflow-hidden border border-gray-200 space-y-0">
              <div className="p-4 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                    Tệp trên máy chủ nguồn ({nguonFiles.length})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllFiles}
                    className="text-orange-600 hover:underline font-semibold cursor-pointer"
                  >
                    Tích hết
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiles}
                    className="text-gray-500 hover:underline font-semibold cursor-pointer"
                  >
                    Bỏ tích hết
                  </button>
                </div>
              </div>

              {nguonFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">
                  Không tìm thấy tệp nào trên máy chủ nguồn cho ngày này.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72 nav-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">Chọn</th>
                        <th className="py-2.5 px-3">Tên tệp</th>
                        <th className="py-2.5 px-3 text-right">Dung lượng</th>
                        <th className="py-2.5 px-3 text-right">Số dòng</th>
                        <th className="py-2.5 px-3">Kết luận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {nguonFiles.map((f) => {
                        const isChecked = selectedFiles.includes(f.ten);
                        return (
                          <tr key={f.ten} className={`hover:bg-gray-50/80 transition-colors ${!isChecked ? 'opacity-50 bg-gray-50/30' : ''}`}>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleFile(f.ten)}
                                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
                                aria-label={`Chọn tệp ${f.ten}`}
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-gray-900 truncate max-w-[180px]" title={f.ten}>
                              {f.ten}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[11px] text-gray-600 whitespace-nowrap">
                              {f.kich_thuoc ? `${Math.round(f.kich_thuoc / 1024)} KB` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                              {formatNumber(f.so_dong)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                f.ket_luan === 'READY'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : f.ket_luan === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {f.ket_luan === 'READY'
                                  ? 'Dùng được'
                                  : f.ket_luan === 'REJECTED'
                                  ? 'Bị loại'
                                  : (f.ket_luan || '—')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* BẢNG 2: DỮ LIỆU ĐANG CÓ TRONG CƠ SỞ DỮ LIỆU */}
            <div className="card-soft rounded-2xl overflow-hidden border border-gray-200 space-y-0">
              <div className="p-4 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                    Tệp trong cơ sở dữ liệu ({dbFiles.length})
                  </span>
                </div>
                <span className="text-[11px] text-gray-500 font-medium">
                  Tổng {formatNumber(previewData?.db?.tong_dong)} dòng
                </span>
              </div>

              {dbFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">
                  Chưa có dữ liệu nào của ngày này trong cơ sở dữ liệu.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72 nav-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Tên tệp</th>
                        <th className="py-2.5 px-3">Nguồn</th>
                        <th className="py-2.5 px-3 text-right">Số dòng</th>
                        <th className="py-2.5 px-3">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dbFiles.map((df) => (
                        <tr key={df.id || df.file_name} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-2 px-3 font-mono text-[11px] text-gray-900 truncate max-w-[200px]" title={df.file_name}>
                            {df.file_name}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700">
                              {df.source || 'SFTP'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                            {formatNumber(df.so_dong_thuc ?? df.row_count)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              df.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {df.status || 'OK'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* BẢNG THEO NGÀY ĐẾN */}
          {Array.isArray(soSanh.theo_ngay_den) && soSanh.theo_ngay_den.length > 0 && (
            <div className="card-soft rounded-2xl overflow-hidden border border-gray-200 space-y-0">
              <div className="p-4 bg-gray-50/90 border-b border-gray-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                  Phân bố bưu gửi theo ngày đến
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4">Ngày đến (arrival_date)</th>
                      <th className="py-2.5 px-4 text-right">Bưu gửi cũ</th>
                      <th className="py-2.5 px-4 text-right">Bưu gửi mới</th>
                      <th className="py-2.5 px-4 text-right">Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {soSanh.theo_ngay_den.map((row, idx) => {
                      const diff = Number(row.shbg_moi ?? 0) - Number(row.shbg_cu ?? 0);
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-medium text-gray-900">
                            {row.ngay ? toDmy(row.ngay) : <span className="text-gray-400 italic">Chưa xác định / rỗng</span>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-gray-700">
                            {formatNumber(row.shbg_cu)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-gray-900">
                            {formatNumber(row.shbg_moi)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold whitespace-nowrap">
                            <span className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}>
                              {diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MẪU SHBG BỊ MẤT THẬT (CHỈ 6 KÝ TỰ ĐẦU THEO QUY ĐỊNH) */}
          {Array.isArray(soSanh.shbg_mau_mat_that) && soSanh.shbg_mau_mat_that.length > 0 && (
            <div className="card-soft p-4 rounded-2xl border border-red-200 bg-red-50/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-red-900">
                <span>Mẫu bưu gửi bị mất thật (tối đa 20 mẫu, chỉ hiển thị 6 ký tự đầu):</span>
                <span className="text-[11px] font-normal text-red-700">
                  {soSanh.shbg_mau_mat_that.length} mẫu
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {soSanh.shbg_mau_mat_that.map((code, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white text-red-700 border border-red-200 shadow-2xs"
                  >
                    {code}…
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* HÀNG NÚT HÀNH ĐỘNG CUỐI TRANG */}
          <div className="card-soft p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-600">
              {isOutdated ? (
                <span className="text-amber-700 font-semibold">
                  Tập tệp tin đã thay đổi, cần bấm «Xem trước lại» trước khi thay thế.
                </span>
              ) : isKhongTheThay ? (
                <span className="text-gray-500">
                  Không thể thực hiện thay thế cho cấu hình này.
                </span>
              ) : selectedFiles.length === 0 ? (
                <span className="text-red-600">
                  Chưa chọn tệp nguồn nào để thay thế.
                </span>
              ) : (
                <span>
                  Đã chọn <strong className="font-bold text-gray-900">{selectedFiles.length}</strong> tệp nguồn để thay thế.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {isOutdated && (
                <button
                  type="button"
                  onClick={() => handleFetchPreview(selectedFiles)}
                  disabled={loadingPreview || selectedFiles.length === 0}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Xem trước lại</span>
                </button>
              )}

              <button
                id="btn-mo-hop-thay-the"
                type="button"
                onClick={() => setIsDialogOpen(true)}
                disabled={isOutdated || isKhongTheThay || selectedFiles.length === 0 || loadingPreview}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl shadow-soft transition-all cursor-pointer ${
                  isOutdated || isKhongTheThay || selectedFiles.length === 0 || loadingPreview
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    : warningLevel === 'DO'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : warningLevel === 'CAN_XAC_NHAN'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                <span>Thay thế ngày này…</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOG XÁC NHẬN THAY THẾ (MỤC 3 CANVAS) ────────────────────── */}
      {isDialogOpen && (
        <ReplaceDayDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          bcvh={bcvh}
          bcvhName={bcvhName}
          ngay={ngay}
          previewData={previewData}
          selectedFiles={selectedFiles}
          authUser={authUser}
          onSuccess={(result) => {
            setExecutionResult(result);
            setPreviewData(null);
          }}
        />
      )}
      </div>

      {/* ── TAB 2: NHẬT KÝ VÀ KHÔI PHỤC ───────────────────────────────── */}
      {activeTab === 'log' && (
        isAdmin ? (
          <ReplaceLogTab authUser={authUser} />
        ) : (
          <div className="card-soft p-8 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[--color-title]">Chỉ quản trị viên xem được</h3>
            <p className="text-xs text-[--color-body] max-w-md mx-auto">
              Chức năng xem nhật ký và khôi phục dữ liệu yêu cầu quyền Quản trị viên (ADMIN).
            </p>
          </div>
        )
      )}
    </div>
  );
}
