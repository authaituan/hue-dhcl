import React, { useState } from 'react';
import { Download, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';
import CustomDatePicker from '../common/CustomDatePicker';

export default function PhatTemplateView({ selectedBcvh, onNavigateStep }) {
  const [bcvh, setBcvh] = useState(selectedBcvh && selectedBcvh !== 'all' ? selectedBcvh : '533140');
  
  // Mặc định ngày hôm nay hoặc ngày gợi ý
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState('2026-10-02');
  const [toDate, setToDate] = useState('2026-10-03');
  const [scope, setScope] = useState('chua'); // 'chua' | 'tat-ca'
  
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const qs = new URLSearchParams({
        bcvh,
        from: fromDate,
        to: toDate,
        scope
      }).toString();

      const res = await apiFetch(`/api/phat/template?${qs}`);
      if (!res.ok) {
        let errMsg = 'Không tải được file mẫu';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) {}
        setDownloadError(errMsg);
        return;
      }

      // Đọc blob và kích hoạt tải về
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PHAT_${bcvh}_${fromDate}_${toDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError('Lỗi kết nối khi tải file mẫu từ máy chủ');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── TIÊU ĐỀ BƯỚC 1 ────────────────────────────────────────────────── */}
      <div>
        <h2 className="hue-h2 text-xl">
          Bước 1. Tải file mẫu để biên soạn
        </h2>
      </div>

      {downloadError && (
        <div className="flex items-center justify-between p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-red-700 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{downloadError}</span>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-white border border-red-300 rounded-[8px] hover:bg-red-50 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* ── NỘI DUNG 2 CỘT ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (5/12): CHỌN DỮ LIỆU CẦN BIÊN SOẠN */}
        <div className="lg:col-span-5 bg-white border border-gray-200 rounded-[14px] p-6 shadow-none space-y-5">
          <h3 className="hue-h2 text-[17px]">
            Chọn dữ liệu cần biên soạn
          </h3>

          {/* Chọn BCVH */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 block">BCVH</label>
            <select
              value={bcvh}
              onChange={(e) => setBcvh(e.target.value)}
              className="w-full text-xs font-semibold text-gray-800 bg-white border border-[#D9CBA8] rounded-[10px] p-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
            >
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten} ({b.ma})
                </option>
              ))}
            </select>
          </div>

          {/* Ngày đến từ - đến */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 block">Ngày đến, từ</label>
              <CustomDatePicker
                value={fromDate}
                onChange={(val) => setFromDate(val)}
                placeholder="dd/mm/yyyy"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 block">đến</label>
              <CustomDatePicker
                value={toDate}
                onChange={(val) => setToDate(val)}
                placeholder="dd/mm/yyyy"
              />
            </div>
          </div>

          {/* Phạm vi */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-bold text-gray-600 block">Phạm vi</label>
            
            {/* Lựa chọn 1: Chỉ bưu gửi chưa có trạng thái */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                scope === 'chua'
                  ? 'border-orange-500 bg-orange-50/20'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="chua"
                checked={scope === 'chua'}
                onChange={() => setScope('chua')}
                className="mt-0.5 text-orange-600 focus:ring-orange-500 cursor-pointer"
              />
              <div className="text-xs">
                <div className="font-bold text-gray-900">Chỉ bưu gửi chưa có trạng thái</div>
                <div className="text-gray-500 mt-0.5 leading-relaxed">
                  Dùng cho lần biên soạn đầu hoặc phần còn thiếu. File gọn nhất.
                </div>
              </div>
            </label>

            {/* Lựa chọn 2: Tất cả bưu gửi, kèm trạng thái hiện có */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                scope === 'tat-ca'
                  ? 'border-orange-500 bg-orange-50/20'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="tat-ca"
                checked={scope === 'tat-ca'}
                onChange={() => setScope('tat-ca')}
                className="mt-0.5 text-orange-600 focus:ring-orange-500 cursor-pointer"
              />
              <div className="text-xs">
                <div className="font-bold text-gray-900">Tất cả bưu gửi, kèm trạng thái hiện có</div>
                <div className="text-gray-500 mt-0.5 leading-relaxed">
                  Dùng để rà lại và sửa. Chỉ cần đổi những dòng có thay đổi.
                </div>
              </div>
            </label>
          </div>

          {/* Lưu ý nhỏ */}
          <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-500 leading-relaxed">
            Mỗi bưu gửi (SHBG) chỉ một dòng, kể cả khi bưu gửi nằm ở nhiều túi hoặc nhiều BD10. File không bao giờ có SHBG trùng.
          </div>

          {/* Nút Tải file */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-[8px] border-b-[3px] border-amber-400 shadow-none transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
              <span>{downloading ? 'Đang tạo file...' : 'Tải file Excel (.xlsx)'}</span>
            </button>
            <span className="text-xs text-gray-500 font-medium">
              Ví dụ: <strong className="text-gray-700 tabular-nums">3.977</strong> dòng cho ngày 02/10
            </span>
          </div>

          {/* Chuyển sang bước 2 */}
          <div className="pt-3 border-t border-cream-line">
            <button
              type="button"
              onClick={() => onNavigateStep(2)}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Đã có file sẵn? Chuyển sang Bước 2 để kiểm tra dữ liệu</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CỘT PHẢI (7/12): HƯỚNG DẪN & PREVIEW FILE */}
        <div className="lg:col-span-7 space-y-5">
          {/* Box trên: Cấu trúc file Excel */}
          <div className="bg-white border border-gray-200 rounded-[14px] p-6 shadow-none space-y-4">
            <div>
              <h3 className="hue-h2 text-[17px]">
                File Excel trông như thế này
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Bốn cột xám đã khóa. Chỉ điền cột Trạng thái (chọn trong danh sách) và Ghi chú. Ô Trạng thái trống sẽ được bỏ qua, không tính là lỗi.
              </p>
            </div>

            {/* Bảng minh họa cấu trúc */}
            <div className="overflow-x-auto border border-cream-line rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-cream-head text-gray-700 font-bold border-b border-cream-line">
                    <th className="p-2.5 border-r border-cream-line">SHBG</th>
                    <th className="p-2.5 border-r border-cream-line">Ngày đến</th>
                    <th className="p-2.5 border-r border-cream-line">Khung giờ đến</th>
                    <th className="p-2.5 border-r border-cream-line">Đường thư</th>
                    <th className="p-2.5 bg-amber-100 text-amber-900">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-line text-gray-600 text-[11px]">
                  <tr className="bg-cream-light/20">
                    <td className="p-2 border-r border-cream-line/50 font-mono">XX000000101VN</td>
                    <td className="p-2 border-r border-cream-line/50 tabular-nums">02/10/2026</td>
                    <td className="p-2 border-r border-cream-line/50">Trước 10h</td>
                    <td className="p-2 border-r border-cream-line/50">Sàn KT KCN - BCVH Thuận Hóa</td>
                    <td className="p-2 font-semibold text-emerald-600 bg-white">Phát thành công</td>
                  </tr>
                  <tr className="bg-cream-light/20">
                    <td className="p-2 border-r border-cream-line/50 font-mono">XX000000102VN</td>
                    <td className="p-2 border-r border-cream-line/50 tabular-nums">02/10/2026</td>
                    <td className="p-2 border-r border-cream-line/50">Trước 10h</td>
                    <td className="p-2 border-r border-cream-line/50">Sàn KT KCN - BCVH Thuận Hóa</td>
                    <td className="p-2 font-semibold text-emerald-600 bg-white">Phát thành công</td>
                  </tr>
                  <tr className="bg-cream-light/20">
                    <td className="p-2 border-r border-cream-line/50 font-mono">XX000000103VN</td>
                    <td className="p-2 border-r border-cream-line/50 tabular-nums">02/10/2026</td>
                    <td className="p-2 border-r border-cream-line/50">10–12h</td>
                    <td className="p-2 border-r border-cream-line/50">Sàn KT KCN - BCVH Thuận Hóa</td>
                    <td className="p-2 font-semibold text-amber-700 bg-white">Chuyển hoàn ▾</td>
                  </tr>
                  <tr className="bg-cream-light/20">
                    <td className="p-2 border-r border-cream-line/50 font-mono">XX000000104VN</td>
                    <td className="p-2 border-r border-cream-line/50 tabular-nums">02/10/2026</td>
                    <td className="p-2 border-r border-cream-line/50">10–12h</td>
                    <td className="p-2 border-r border-cream-line/50">Sàn KT KCN - Hương Trà</td>
                    <td className="p-2 bg-amber-100 border border-amber-300"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Danh sách chọn ở ô Trạng thái & chú thích ô vàng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3 border border-gray-200 rounded-xl bg-gray-50/30 space-y-1.5 text-xs">
                <div className="font-bold text-gray-700">Danh sách chọn ở ô Trạng thái</div>
                <div className="font-semibold text-emerald-600">Phát thành công</div>
                <div className="font-semibold text-red-600">Phát không thành công</div>
                <div className="font-semibold text-amber-700">Chuyển hoàn</div>
                <div className="font-semibold text-[#334155]">Chưa có thông tin phát</div>
                <div className="font-semibold text-[#7c3aed]">Lạc hướng</div>
                <div className="font-semibold text-gray-700">Đã vu hồi</div>
              </div>

              <div className="text-xs text-gray-500 leading-relaxed flex items-center p-3 bg-yellow-50/30 border border-yellow-200 rounded-xl">
                Ô vàng là bưu gửi chưa biên soạn. Gõ sai trạng thái sẽ bị Excel chặn ngay vì ô chỉ nhận giá trị nằm trong danh sách.
              </div>
            </div>
          </div>

          {/* Box dưới: Cách biên soạn nhanh khi có hàng nghìn dòng */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              Cách biên soạn nhanh khi có hàng nghìn dòng
            </h3>
            <ol className="text-xs text-gray-600 space-y-2 leading-relaxed list-decimal list-inside">
              <li>
                <strong className="text-gray-800">Lọc trước, điền một lần.</strong> Lọc cột Đường thư hoặc Khung giờ, chọn trạng thái ở ô đầu rồi bấm Ctrl+D để điền xuống cả cột đang lọc.
              </li>
              <li>
                <strong className="text-gray-800">Đa số là thành công thì điền cả cột trước</strong>, sau đó lọc ra từng nhóm ngoại lệ (chuyển hoàn, không thành công, lạc hướng) và sửa riêng.
              </li>
              <li>
                <strong className="text-gray-800">Có danh sách SHBG sẵn</strong> (ví dụ danh sách hoàn từ phần mềm khác): không cần mở file, dán danh sách vào ô «Gán nhanh» ở Bước 2.
              </li>
              <li>
                <strong className="text-gray-800">Không thêm, xóa, đổi tên cột</strong> và không sửa bốn cột xám. File sai cấu trúc sẽ bị từ chối ngay ở bước 2.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
