import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { apiFetchJson, apiDownloadExcel } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt } from './ProcessingDeliveryView';

// Danh sách 8 cột trong file xuất ra theo canvas
const COLUMNS = [
  'Số hiệu bưu gửi',
  'BCVH',
  'Ngày giờ đến',
  'Trạng thái phát',
  'Ghi chú',
  'Giờ nhập',
  'Đợt nhập',
  'Người nhập'
];

// 6 chip trạng thái chọn một (màu chữ khi chưa chọn lấy từ thẻ KPI sẵn có)
const STATUS_OPTIONS = [
  { key: null, label: 'Tất cả', color: 'var(--color-gray-800)' },
  { key: 'PTC', label: 'Thành công', color: 'var(--color-emerald-600)' },
  { key: 'PKTC', label: 'Không thành công', color: 'var(--color-red-600)' },
  { key: 'CHUYEN_HOAN', label: 'Chuyển hoàn', color: 'var(--color-amber-700)' },
  { key: 'LAC_HUONG', label: 'Lạc hướng', color: '#6B2F94' },
  { key: 'CHUA_CO_TT', label: 'Chưa có TT', color: '#2A1B33' }
];

// Chuyển đổi an toàn sang chuỗi YYYY-MM-DD cho tham số API
function toYmdString(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof val === 'string') {
    const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
  }
  return '';
}

// Chuyển đổi an toàn sang chuỗi dd/mm/yyyy hiển thị trên giao diện
function formatYmdToDmy(val) {
  if (!val) return '—';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }
  if (typeof val === 'string') {
    const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
  }
  return '—';
}

export default function BangKeKetQuaPhat({ authUser, selectedBcvh, selectedDate, tyLeData }) {
  const isGdvH = authUser?.role === 'GDVH';
  const isAdminOrTtvh = authUser?.role === 'ADMIN' || authUser?.role === 'TTVH';

  // Quản lý danh sách BCVH được giao của GDVH: gọi 1 lần duy nhất khi role === 'GDVH'
  const [assignedBcvhs, setAssignedBcvhs] = useState(null); // null = đang chờ
  const [scopeError, setScopeError] = useState(false);

  useEffect(() => {
    if (!isGdvH) return;
    let active = true;

    apiFetchJson('/api/arrivals/export-scope')
      .then((res) => {
        if (!active) return;
        if (res.ok && Array.isArray(res.data?.bcvh)) {
          setAssignedBcvhs(res.data.bcvh.map((b) => b.ma));
          setScopeError(false);
        } else {
          setAssignedBcvhs([]);
          setScopeError(true);
        }
      })
      .catch(() => {
        if (!active) return;
        setAssignedBcvhs([]);
        setScopeError(true);
      });

    return () => {
      active = false;
    };
  }, [isGdvH]);

  // Trạng thái chọn chip (mặc định null = «Tất cả»)
  const [selectedStatus, setSelectedStatus] = useState(null);

  // Trạng thái tải file
  const [loading, setLoading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Tính toán số liệu hiển thị an toàn
  const rawDate = selectedDate || tyLeData?.ngay || '';
  const ngayDen = toYmdString(rawDate);
  const displayDateStr = formatYmdToDmy(rawDate);

  // Xóa downloadError (đặt về null) mỗi khi selectedBcvh, ngayDen hoặc chip trạng thái thay đổi
  useEffect(() => {
    setDownloadError(null);
  }, [selectedBcvh, ngayDen, selectedStatus]);

  const bcvhObj = BCVH_LIST.find((b) => b.ma === selectedBcvh);
  const tenBcvhHienThi = selectedBcvh === 'all'
    ? 'toàn Trung tâm'
    : (bcvhObj ? bcvhObj.ten : selectedBcvh);

  const mauSo = tyLeData?.mau_so ?? 0;
  const theoTT = tyLeData?.theo_trang_thai || {};
  const soChuaCoTt = theoTT.CHUA_CO_TT?.so ?? 0;

  const getStatusCount = (key) => {
    if (!key) return mauSo;
    return theoTT[key]?.so ?? 0;
  };

  const currentCount = getStatusCount(selectedStatus);

  // Quy tắc khóa nút và thông báo cảnh báo cho GDVH (Quy tắc 1a–1e)
  let gdvhLock = false;
  let gdvhWarning = null;

  if (isGdvH) {
    if (scopeError) {
      // 1e: Lời gọi export-scope LỖI: KHÔNG khóa; để nút mở và hiện nguyên văn câu 403 nếu máy chủ trả về
      gdvhLock = false;
      gdvhWarning = null;
    } else if (assignedBcvhs === null) {
      // 1d: Đang chờ danh sách: nút khóa tạm thời, chưa hiện hộp vàng
      gdvhLock = true;
      gdvhWarning = null;
    } else if (assignedBcvhs.length === 0) {
      // 1a: Danh sách rỗng: khóa nút, hộp vàng
      gdvhLock = true;
      gdvhWarning = 'Tài khoản của bạn chưa được giao BCVH nào để tải về. Liên hệ quản trị để được giao.';
    } else if (selectedBcvh === 'all') {
      // 1b: Ô BCVH là «Toàn Trung tâm» (all): khóa nút, hộp vàng
      gdvhLock = true;
      gdvhWarning = 'Tài khoản GDVH chỉ tải được bảng kê của từng BCVH được giao, không tải được "all"';
    } else if (!assignedBcvhs.includes(selectedBcvh)) {
      // 1c: BCVH đang chọn không nằm trong danh sách: khóa nút, hộp vàng
      gdvhLock = true;
      gdvhWarning = 'Bạn chỉ được tải bảng kê kết quả phát của BCVH được giao';
    } else {
      gdvhLock = false;
      gdvhWarning = null;
    }
  }

  const isButtonDisabled = loading || gdvhLock || !ngayDen;

  // Thực hiện tải file Excel
  const handleDownload = async () => {
    if (isButtonDisabled) return;
    setLoading(true);
    setDownloadError(null);

    const params = new URLSearchParams();
    params.set('ngay_den', ngayDen);
    params.set('bcvh', selectedBcvh);
    if (selectedStatus) {
      params.set('trang_thai', selectedStatus);
    }
    const url = `/api/phat/tai-ve?${params.toString()}`;

    try {
      const defaultFilename = `BangKe_${selectedBcvh}_${ngayDen}.xlsx`;
      const res = await apiDownloadExcel(url, defaultFilename);
      if (!res.ok) {
        setDownloadError(res.error || 'Có lỗi xảy ra khi tải file');
      }
    } catch (err) {
      setDownloadError(err?.message || 'Lỗi kết nối khi tải file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-white rounded-[10px] border border-gray-200 border-t-4 border-t-amber-400 p-5 shadow-none"
      aria-busy={loading ? 'true' : 'false'}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── CỘT TRÁI ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col justify-between">
          <div>
            <h2 className="hue-h2 text-[17px]">
              Bảng kê kết quả phát theo ngày đến
            </h2>
            <p className="text-xs text-gray-600 leading-relaxed mt-1.5">
              Bảng kê <strong>từng bưu gửi đến {tenBcvhHienThi} ngày {displayDateStr}</strong> và kết quả phát hiện tại, xuất ra file Excel. Gồm cả <strong>{formatInt(soChuaCoTt)}</strong> bưu gửi chưa có thông tin phát.
            </p>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              FILE GỒM CÁC CỘT
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((col) => (
                <span
                  key={col}
                  className="px-2.5 py-1 bg-cream-head text-gray-700 text-xs rounded-[6px] border border-cream-line font-medium"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── CỘT PHẢI ─────────────────────────────────────────────────────── */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            CHỈ TẢI BƯU GỬI Ở TRẠNG THÁI
          </div>

          {/* 6 chip chọn một (viên thuốc: rounded-full) */}
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = selectedStatus === opt.key;
              const count = getStatusCount(opt.key);
              return (
                <button
                  key={opt.key || 'ALL'}
                  type="button"
                  onClick={() => setSelectedStatus(opt.key)}
                  disabled={loading}
                  style={{
                    color: isSelected ? '#ffffff' : opt.color
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-orange-600 font-bold border border-transparent shadow-none'
                      : 'bg-white border border-[#D9CBA8] font-medium hover:bg-cream-light'
                  }`}
                >
                  {opt.label} · {formatInt(count)}
                </button>
              );
            })}
          </div>

          {/* Trạng thái 1: Đang tạo tệp */}
          {loading && (
            <div className="mb-3 space-y-2">
              <div className="text-xs text-gray-700">
                Đang tạo tệp cho <strong>{formatInt(currentCount)}</strong> bưu gửi đến ngày <strong>{displayDateStr}</strong> tại <strong>{tenBcvhHienThi}</strong>…
              </div>
              <div className="progress-soft w-full overflow-hidden">
                <div className="progress-bar-soft w-full animate-pulse" />
              </div>
            </div>
          )}

          {/* Trạng thái 2: Lỗi từ máy chủ */}
          {downloadError && (
            <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 space-y-2 mb-3">
              <div>
                <strong>Không tải được.</strong> {downloadError}
                {downloadError.includes('chưa có file hàng đến cho ngày') && ' Chọn ngày khác hoặc chờ file được nạp.'}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDownloadError(null)}
                  className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-red-300 rounded text-red-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
                >
                  Thử lại
                </button>
              </div>
            </div>
          )}

          {/* Trạng thái 3: ADMIN/TTVH khi ô BCVH là Toàn Trung tâm */}
          {!loading && !downloadError && isAdminOrTtvh && selectedBcvh === 'all' && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-[8px] text-xs leading-relaxed mb-3">
              Sẽ tải <strong>{formatInt(currentCount)}</strong> bưu gửi đến ngày <strong>{displayDateStr}</strong>. Mỗi bưu gửi một dòng, có cột BCVH. BCVH chưa có file ngày này không có dòng nào.
            </div>
          )}

          {/* Trạng thái 4: GDVH cảnh báo theo quy tắc 1a, 1b, 1c */}
          {!loading && !downloadError && gdvhWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-[8px] text-xs font-medium mb-3">
              {gdvhWarning}
            </div>
          )}

          {/* Nút tải và ghi chú */}
          <div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isButtonDisabled}
              className={`btn-primary px-4 py-2.5 rounded-[8px] text-xs font-bold transition-colors inline-flex items-center gap-2 ${
                isButtonDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>
                {loading
                  ? 'Đang tạo…'
                  : `Tải bảng kê (Excel) · ${formatInt(currentCount)} bưu gửi`}
              </span>
            </button>
            <div className="text-[11px] text-gray-500 mt-2">
              Theo ngày đến và BCVH đang chọn ở phía trên. Mỗi file tối đa 50.000 dòng.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
