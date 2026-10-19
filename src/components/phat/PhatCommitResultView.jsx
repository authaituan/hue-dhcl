import React, { useState } from 'react';
import { CheckCircle2, Download, ArrowLeft, RefreshCw, BarChart2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { formatInt, formatRatePercent } from './ProcessingDeliveryView';

const STATUS_KEYS = [
  { ma: 'PTC', nhan: 'Phát thành công', color: 'text-emerald-600' },
  { ma: 'PKTC', nhan: 'Phát không thành công', color: 'text-red-600' },
  { ma: 'CHUYEN_HOAN', nhan: 'Chuyển hoàn', color: 'text-amber-700' },
  { ma: 'LAC_HUONG', nhan: 'Lạc hướng', color: 'text-[#7c3aed]' },
  { ma: 'CHUA_CO_TT', nhan: 'Chưa có thông tin phát', color: 'text-[#334155]' }
];

export default function PhatCommitResultView({ 
  commitData, 
  draftId, 
  onBackToDraft, 
  onUploadOther, 
  onViewOverview 
}) {
  const [downloadingErrors, setDownloadingErrors] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  if (!commitData) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm text-center space-y-4">
        <div className="text-gray-500 text-xs">Chưa có kết quả nhập đợt nào.</div>
        <button
          type="button"
          onClick={onViewOverview}
          className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold"
        >
          Quay lại tỷ lệ phát
        </button>
      </div>
    );
  }

  // Tải file lỗi từ máy chủ
  const handleDownloadErrors = async () => {
    if (!draftId) return;
    setDownloadingErrors(true);
    try {
      const res = await apiFetch(`/api/phat/drafts/${draftId}/errors.xlsx?loai_tru=KHONG_DOI`);
      if (!res.ok) {
        alert('Không tải được file lỗi');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PHAT_LOI_${commitData.batch_id || 'DOT'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (_) {
      alert('Lỗi kết nối khi tải file lỗi');
    } finally {
      setDownloadingErrors(false);
    }
  };

  // Mốc giờ hiển thị
  const timeBangkok = commitData.nhap_luc_bangkok || '';
  const timeParts = timeBangkok.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const timeFormatted = timeParts ? `${timeParts[4]}:${timeParts[5]} ${timeParts[3]}/${timeParts[2]}/${timeParts[1]}` : timeBangkok;

  // Định dạng ngày hiển thị dd/mm/yyyy và dd/mm từ YYYY-MM-DD
  const formatNgayDMY = (dStr) => {
    if (!dStr || typeof dStr !== 'string') return '';
    const m = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : dStr;
  };

  const formatNgayDM = (dStr) => {
    if (!dStr || typeof dStr !== 'string') return '';
    const m = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}` : dStr;
  };

  // Danh sách các ngày tỷ lệ sau, sắp tăng dần theo ngày
  const tyLeSauList = [...(commitData.ty_le_sau || [])].sort((a, b) => (a.ngay || '').localeCompare(b.ngay || ''));
  const tyLeTruocList = [...(commitData.ty_le_truoc || [])].sort((a, b) => (a.ngay || '').localeCompare(b.ngay || ''));

  const nDays = tyLeSauList.length;

  // Lấy dữ liệu tỷ lệ trước và sau của ngày đang chọn (mặc định ngày đầu tiên index 0 - cũ nhất)
  const safeIndex = selectedDayIndex >= 0 && selectedDayIndex < nDays ? selectedDayIndex : 0;
  const sauObj = tyLeSauList[safeIndex] || {};
  const currentDay = sauObj.ngay || tyLeTruocList[safeIndex]?.ngay || '';
  const truocObj = tyLeTruocList.find((t) => t.ngay === currentDay) || tyLeTruocList[safeIndex] || {};

  const ngayFormatted = currentDay ? formatNgayDM(currentDay) : '';
  const mauSo = sauObj.mau_so ?? truocObj.mau_so ?? 0;

  // Dòng dưới banner: «Đợt này chạm N ngày đến» (N = số phần tử ty_le_sau), khi N = 1 thì ghi ngày duy nhất
  let dotChamText = '';
  if (nDays === 1) {
    const singleDay = tyLeSauList[0]?.ngay || tyLeTruocList[0]?.ngay;
    dotChamText = singleDay ? `Đợt này chạm ngày ${formatNgayDMY(singleDay)}` : 'Đợt này chạm 1 ngày đến';
  } else if (nDays > 1) {
    dotChamText = `Đợt này chạm ${nDays} ngày đến`;
  }

  // Hàm tính chênh lệch: (sau - truoc) * 100
  const calcDiff = (sauRate, truocRate) => {
    if (sauRate === null || sauRate === undefined || truocRate === null || truocRate === undefined) return '—';
    const diff = Math.round((sauRate - truocRate) * 1000) / 10;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  };

  const getDiffColor = (ma, sauRate, truocRate) => {
    if (sauRate === null || truocRate === null) return 'text-gray-400';
    const diff = sauRate - truocRate;
    if (diff === 0) return 'text-gray-500';
    if (ma === 'PTC') return diff > 0 ? 'text-emerald-600' : 'text-red-600';
    // Với các trạng thái lỗi/chưa có/hoàn: giảm là tốt (xanh lá), tăng là đỏ
    return diff < 0 ? 'text-emerald-600' : 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* ── TIÊU ĐỀ BƯỚC 3 ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">
          Bước 3. Kết quả nhập
        </h2>
      </div>

      {/* ── BANNER XANH XÁC NHẬN NHẬP THÀNH CÔNG ─────────────────────────── */}
      <div className="bg-emerald-50/80 border-2 border-emerald-500 rounded-2xl p-6 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div>
          <div className="text-lg font-[900] text-gray-900 tracking-tight">
            Đã nhập {formatInt(commitData.so_nhap)} dòng lúc {timeFormatted}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Số liệu tính đến {timeFormatted.slice(0, 5)}. Tỷ lệ phát đã được tính lại.
          </div>
          {dotChamText && (
            <div className="text-xs font-semibold text-emerald-900 mt-1.5">
              {dotChamText}
            </div>
          )}
        </div>
      </div>

      {/* ── NỘI DUNG 2 CỘT ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (5/12): BẢNG TỶ LỆ TRƯỚC VÀ SAU */}
        <div className="lg:col-span-5 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
          {/* Hàng chip chọn ngày khi N > 1, tự xuống dòng khi nhiều ngày */}
          {nDays > 1 && (
            <div className="space-y-1.5 pb-2 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-1.5">
                {tyLeSauList.map((item, idx) => {
                  const isSelected = safeIndex === idx;
                  const chipLabel = formatNgayDM(item.ngay) || `Ngày ${idx + 1}`;
                  return (
                    <button
                      key={item.ngay || idx}
                      type="button"
                      onClick={() => setSelectedDayIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-orange-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {chipLabel}
                    </button>
                  );
                })}
              </div>
              {nDays === 31 && (
                <div className="text-[11px] text-gray-500 italic pt-0.5">
                  Hiển thị tối đa 31 ngày đến gần nhất
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Tỷ lệ phát ngày {ngayFormatted}, trước và sau lần nhập này
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Mẫu số {formatInt(mauSo)} bưu gửi đến.
            </p>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/70 text-gray-500 font-bold border-b border-gray-200">
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Trước</th>
                  <th className="py-2.5 px-3 text-right">Sau</th>
                  <th className="py-2.5 px-3 text-right">Chênh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {STATUS_KEYS.map((st) => {
                  const tRate = truocObj.theo_trang_thai?.[st.ma]?.ty_le ?? null;
                  const sRate = sauObj.theo_trang_thai?.[st.ma]?.ty_le ?? null;
                  const diffStr = calcDiff(sRate, tRate);
                  const diffColor = getDiffColor(st.ma, sRate, tRate);

                  return (
                    <tr key={st.ma} className="hover:bg-gray-50/50">
                      <td className={`py-3 px-3 font-semibold ${st.color}`}>
                        {st.nhan}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 font-medium">
                        {formatRatePercent(tRate)}
                      </td>
                      <td className="py-3 px-3 text-right font-[900] text-gray-900">
                        {formatRatePercent(sRate)}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${diffColor}`}>
                        {diffStr}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Chênh tính bằng hiệu hai tỷ lệ (cách ghi chữ sẽ chốt chung cho toàn site).
          </p>
        </div>

        {/* CỘT PHẢI (7/12): CHƯA NHẬP & QUY TẮC NHẬP LẦN SAU */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card trên: Chưa nhập, cần xử lý tiếp */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900">
              Chưa nhập, cần xử lý tiếp
            </h3>

            {/* 2 stat boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Box lỗi */}
              <div className="bg-red-50/60 border border-red-200 rounded-2xl p-4">
                <div className="text-3xl font-[900] text-red-600">
                  {formatInt(commitData.loi_can_sua ?? commitData.so_loi ?? 0)}
                </div>
                <div className="text-xs text-red-700 font-medium mt-1">
                  dòng lỗi: sửa rồi nhập lại
                </div>
              </div>

              {/* Box để trống */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-3xl font-[900] text-gray-700">
                  {formatInt(commitData.bo_qua_trong ?? commitData.so_bo_qua ?? 0)}
                </div>
                <div className="text-xs text-gray-500 font-medium mt-1">
                  dòng để trống: không nhập, không lỗi
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              File lỗi có cùng cấu trúc với file mẫu, thêm cột <strong className="text-gray-800">Số dòng trong file gốc</strong> và <strong className="text-gray-800">Lý do lỗi</strong>. Sửa xong có thể nhập lại thẳng file đó, không cần soạn lại từ đầu.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleDownloadErrors}
                disabled={downloadingErrors || !(commitData.loi_can_sua ?? commitData.so_loi)}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingErrors ? 'Đang tạo file...' : `Tải file lỗi (${formatInt(commitData.loi_can_sua ?? commitData.so_loi ?? 0)} dòng)`}
                </span>
              </button>

              <button
                type="button"
                onClick={onBackToDraft}
                className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Quay lại bảng kiểm tra
              </button>
            </div>
          </div>

          {/* Card dưới: Quy tắc khi nhập lần sau */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              Quy tắc khi nhập lần sau
            </h3>
            <ul className="text-xs text-gray-600 space-y-2 leading-relaxed list-disc list-inside">
              <li>
                <strong className="text-gray-800">SHBG đã có trạng thái và trạng thái khác:</strong> lấy trạng thái mới, giữ lịch sử từng lần.
              </li>
              <li>
                <strong className="text-gray-800">SHBG đã có trạng thái và không đổi:</strong> báo lỗi «Không đổi so với lần nhập trước», không nhập.
              </li>
              <li>
                <strong className="text-gray-800">SHBG không có trong file mới:</strong> giữ nguyên trạng thái cũ.
              </li>
              <li>
                <strong className="text-gray-800">Tỷ lệ luôn tính từ trạng thái mới nhất</strong> của từng SHBG.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── NÚT ĐIỀU HƯỚNG DƯỚI CÙNG ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onUploadOther}
          className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
        >
          Nhập file khác
        </button>

        <button
          type="button"
          onClick={onViewOverview}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <BarChart2 className="w-4 h-4" />
          <span>Xem tỷ lệ phát</span>
        </button>
      </div>
    </div>
  );
}
