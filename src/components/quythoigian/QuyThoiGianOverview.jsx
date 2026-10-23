import React from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import CustomDatePicker from '../common/CustomDatePicker';
import { BCVH_LIST } from '../../constants/bcvh';
import {
  formatInt,
  formatPercent,
  formatDurationGiay,
  formatDdMm,
  LY_DO_KHONG_DO_LABELS
} from './quyThoiGianFormatters';
import QuyThoiGianHourChart from './QuyThoiGianHourChart';
import QuyThoiGianExampleBox from './QuyThoiGianExampleBox';

export default function QuyThoiGianOverview({
  selectedDate,
  onChangeDate,
  onPrevDate,
  onNextDate,
  selectedBcvh,
  onChangeBcvh,
  data,
  recentDaysData,
  loading,
  error,
  onRetry,
  onNavigateToLuot,
}) {
  // Trạng thái đang tải (Skeleton)
  if (loading && !data) {
    return (
      <div className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="h-9 bg-gray-200 rounded-[10px] w-1/3 animate-pulse" />
          <div className="h-9 bg-gray-200 rounded-[10px] w-64 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-28 bg-white rounded-[14px] border border-gray-200 p-4 animate-pulse" />
          <div className="h-28 bg-white rounded-[14px] border border-gray-200 p-4 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 bg-white rounded-[14px] border border-gray-200 p-4 animate-pulse" />
          ))}
        </div>
        <div className="h-32 bg-white rounded-[14px] border border-gray-200 p-5 animate-pulse" />
        <div className="h-64 bg-white rounded-[14px] border border-gray-200 p-5 animate-pulse" />
      </div>
    );
  }

  // Trạng thái lỗi
  if (error && !data) {
    return (
      <div className="p-6 space-y-5">
        <div className="p-4 bg-red-50 border border-red-200 rounded-[14px] space-y-3">
          <div className="flex items-start gap-2.5 text-xs text-red-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span className="flex-1 leading-relaxed">{error}</span>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-300 rounded-[8px] hover:bg-red-50 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tong = data?.tong || {};
  const theoNhom = data?.theo_nhom || {};
  const theoGio = data?.theo_gio || [];
  const dai = tong.dai || {};

  // Tính số liệu 6 ô
  const tongShbg = tong.tong_shbg || 0;
  const chinh = tong.chinh || 0;
  const quaHan = dai.QUA_HAN || 0;
  const sapHet = dai.SAP_HET || 0;
  const conLai = (dai.CON_2_6 || 0) + (dai.CON_TREN_6 || 0);
  const trucTiep = tong.truc_tiep || 0;

  const tyLeQuaHanStr = formatPercent(tong.ty_le_qua_han);
  const tyLeConLai = chinh > 0 ? formatPercent(conLai / chinh) : '—';

  // Câu phụ "Chưa tính: N lượt lệch mốc, M lượt cần kiểm tra lại"
  const lechMoc = tong.lech_moc || 0;
  const nghiNgo = tong.nghi_ngo || 0;
  let chuaTinhNote = '';
  if (lechMoc > 0 && nghiNgo > 0) {
    chuaTinhNote = `Chưa tính: ${formatInt(lechMoc)} lượt lệch mốc, ${formatInt(nghiNgo)} lượt cần kiểm tra lại.`;
  } else if (lechMoc > 0) {
    chuaTinhNote = `Chưa tính: ${formatInt(lechMoc)} lượt lệch mốc.`;
  } else if (nghiNgo > 0) {
    chuaTinhNote = `Chưa tính: ${formatInt(nghiNgo)} lượt cần kiểm tra lại.`;
  }

  // Tỉ trọng 4 dải
  const pctQuaHan = chinh > 0 ? (quaHan / chinh) * 100 : 0;
  const pctSapHet = chinh > 0 ? (sapHet / chinh) * 100 : 0;
  const pctCon26 = chinh > 0 ? ((dai.CON_2_6 || 0) / chinh) * 100 : 0;
  const pctConTren6 = chinh > 0 ? ((dai.CON_TREN_6 || 0) / chinh) * 100 : 0;

  // Nhóm nguồn hàng (nhóm BD10)
  const nhomKtt = theoNhom.KTT || {};
  const nhomNgoai53 = theoNhom.NGOAI_53 || {};
  const nhomNoiTinhKhac = theoNhom.NOI_TINH_KHAC || {};
  const nhomLapDi = theoNhom.LAP_DI_TAI_BCVH || {};
  const nguonKhacTong = (theoNhom.RONG?.tong_shbg || 0) +
    (theoNhom.KHONG_HOP_LE?.tong_shbg || 0);

  // Danh sách các lý do không đo được có số lượng > 0
  const khongDoLyDo = tong.khong_do_duoc_theo_ly_do || {};
  const activeReasons = Object.entries(khongDoLyDo).filter(([, count]) => count > 0);

  // Lấy tên BCVH từ mã
  const getBcvhName = (ma) => {
    const item = BCVH_LIST.find((b) => b.ma === ma);
    return item ? item.ten : ma;
  };

  // Cấu hình lưới ô số: 5 ô nếu không có trực tiếp, 6 ô nếu có trực tiếp (>0)
  const kpiGridClass = trucTiep > 0
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3.5'
    : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5';

  return (
    <div className="p-6 space-y-5">
      {/* ── 1. TIÊU ĐỀ & BỘ LỌC ĐẦU TRANG ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="hue-h1">
            Thời gian còn lại để phát tại BCVH
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Tổng quan trong ngày theo số liệu mới nhất
          </p>
        </div>

        {/* Hàng bộ lọc: BCVH & Ngày */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown BCVH */}
          <div className="flex items-center bg-white px-2.5 py-1.5 rounded-[10px] border border-[#D9CBA8] shadow-none text-xs">
            <span className="font-semibold text-gray-600 mr-2 whitespace-nowrap">BCVH:</span>
            <select
              id="qtg-bcvh-select"
              value={selectedBcvh}
              onChange={(e) => onChangeBcvh(e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Tất cả BCVH</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten}
                </option>
              ))}
            </select>
          </div>

          {/* Bộ chọn Ngày kèm nút ‹ › */}
          <div className="flex items-center bg-white rounded-[10px] border border-[#D9CBA8] shadow-none overflow-hidden text-xs">
            <button
              type="button"
              onClick={onPrevDate}
              title="Ngày trước"
              className="px-2 py-1.5 hover:bg-cream-light text-gray-600 border-r border-[#D9CBA8] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 py-0.5">
              <CustomDatePicker
                id="qtg-date-input"
                value={selectedDate}
                onChange={onChangeDate}
                borderless
                className="w-28 text-center font-bold text-gray-800"
              />
            </div>
            <button
              type="button"
              onClick={onNextDate}
              title="Ngày sau"
              className="px-2 py-1.5 hover:bg-cream-light text-gray-600 border-l border-[#D9CBA8] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi nhẹ nếu có lỗi khi đang tải lại */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline hover:no-underline shrink-0"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ── 2. HỘP QUY ĐỊNH & CÁCH ĐỌC ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Hộp Quy định */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-l-4 border-l-[#E0A82E] shadow-none leading-relaxed flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#A87A12] uppercase tracking-wider mb-1.5">
              QUY ĐỊNH
            </div>
            <p className="text-[13px] text-gray-700 leading-relaxed">
              Chỉ tiêu F1.3 là 14 giờ, không tính khung 21:00–07:00. Riêng địa bàn phường Thuận Hóa và Phú Xuân thuộc BCVH Thuận Hóa là 12 giờ.
            </p>
          </div>
          {tong.phuong_trong > 0 && (
            <div className="mt-2 text-xs text-gray-500 italic">
              Có {formatInt(tong.phuong_trong)} lượt thuộc phường/xã trống tính 14 giờ.
            </div>
          )}
        </div>

        {/* Hộp Cách đọc */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 border-l-4 border-l-[#4A1D6E] shadow-none leading-relaxed flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#4A1D6E] uppercase tracking-wider mb-1.5">
              CÁCH ĐỌC
            </div>
            <p className="text-[13px] text-gray-700 leading-relaxed">
              Đo kiểm tại thời điểm bưu gửi đến BCVH còn lại bao nhiêu thời gian theo quy định. Quá hạn là lỗi ở khâu trước.
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. CÁC Ô CHỈ SỐ (KPI CARDS: ĐỒNG NHẤT CÙNG KIỂU THẺ THƯỜNG) ───── */}
      <div className={kpiGridClass}>
        {/* Ô 1: Bưu gửi đến */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              BƯU GỬI ĐẾN
            </div>
            <div className="hue-num-lg my-2 text-gray-900">
              {formatInt(tongShbg)}
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1.5 tabular-nums">
              Toàn bộ hàng đến BCVH
            </div>
          </div>
        </div>

        {/* Ô 2: Đo được */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              ĐO ĐƯỢC
            </div>
            <div className="hue-num-lg my-2 text-[#4A1D6E]">
              {formatInt(chinh)}
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1.5 tabular-nums">
              {trucTiep > 0 ? `gồm cả ${formatInt(trucTiep)} trực tiếp` : 'Đủ điều kiện đo kiểm'}
            </div>
          </div>
          {chuaTinhNote && (
            <div className="text-xs text-[#A87A12] font-medium mt-2 pt-2 border-t border-cream-line leading-tight">
              {chuaTinhNote}
            </div>
          )}
        </div>

        {/* Ô 3: Quá hạn khi đến */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-[#B3202A] tracking-wide uppercase">
              QUÁ HẠN KHI ĐẾN
            </div>
            <div className="hue-num-lg my-2 text-[#B3202A]">
              {formatInt(quaHan)}
            </div>
            <div className="text-xs font-semibold text-[#B3202A] mt-1.5 tabular-nums">
              {tyLeQuaHanStr} số đo được
            </div>
          </div>
        </div>

        {/* Ô 4: Sắp hết hạn */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-[#A87A12] tracking-wide uppercase">
              SẮP HẾT HẠN
            </div>
            <div className="hue-num-lg my-2 text-[#E0A82E]">
              {formatInt(sapHet)}
            </div>
            <div className="text-xs font-semibold text-[#A87A12] mt-1.5 tabular-nums">
              còn dưới 2 giờ
            </div>
          </div>
        </div>

        {/* Ô 5: Còn thời gian */}
        <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-[#1F7A5C] tracking-wide uppercase">
              CÒN THỜI GIAN
            </div>
            <div className="hue-num-lg my-2 text-[#1F7A5C]">
              {formatInt(conLai)}
            </div>
            <div className="text-xs font-semibold text-[#1F7A5C] mt-1.5 tabular-nums">
              {tyLeConLai} số đo được
            </div>
          </div>
        </div>

        {/* Ô 6: Giao nhận trực tiếp (chỉ hiện khi > 0, cùng kiểu thẻ chuẩn) */}
        {trucTiep > 0 && (
          <div className="bg-white rounded-[14px] p-4 border border-gray-200 shadow-none flex flex-col justify-between min-h-[148px]">
            <div>
              <div className="text-[11px] font-bold text-[#1F7A5C] tracking-wide uppercase">
                GIAO NHẬN TRỰC TIẾP
              </div>
              <div className="hue-num-lg my-2 text-[#1F7A5C]">
                {formatInt(trucTiep)}
              </div>
              <div className="text-xs font-semibold text-[#1F7A5C] mt-1.5 tabular-nums">
                nhận từ xe Cấp 1
              </div>
            </div>
            <div className="text-xs text-gray-500 font-medium mt-2 pt-2 border-t border-cream-line leading-tight">
              vẫn tính vào tỉ lệ
            </div>
          </div>
        )}
      </div>

      {/* ── 4. THANH TỈ TRỌNG XẾP CHỒNG 4 DẢI ─────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="mb-3">
          <h2 className="hue-h2 text-[17px]">
            Tỉ trọng theo thời gian còn lại khi đến
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            tính trên {formatInt(chinh)} bưu gửi đo được{trucTiep > 0 ? `, gồm cả ${formatInt(trucTiep)} lượt giao nhận trực tiếp.` : '.'}
          </p>
        </div>

        {/* Thanh xếp chồng 4 dải */}
        <div className="h-9 w-full rounded-[10px] overflow-hidden flex shadow-2xs border border-cream-line">
          {/* Dải 1: Quá hạn */}
          {pctQuaHan > 0 && (
            <div
              style={{ width: `${pctQuaHan}%`, backgroundColor: '#B3202A' }}
              title={`Quá hạn: ${formatInt(quaHan)} (${pctQuaHan.toFixed(1)}%)`}
              className="flex items-center justify-center text-white text-xs font-bold px-1 overflow-hidden"
            >
              {pctQuaHan >= 5 && `${pctQuaHan.toFixed(1).replace('.', ',')}%`}
            </div>
          )}
          {/* Dải 2: Sắp hết */}
          {pctSapHet > 0 && (
            <div
              style={{ width: `${pctSapHet}%`, backgroundColor: '#E0A82E' }}
              title={`Sắp hết: ${formatInt(sapHet)} (${pctSapHet.toFixed(1)}%)`}
              className="flex items-center justify-center text-gray-900 text-xs font-bold px-1 overflow-hidden"
            >
              {pctSapHet >= 5 && `${pctSapHet.toFixed(1).replace('.', ',')}%`}
            </div>
          )}
          {/* Dải 3: Còn 2-6 giờ */}
          {pctCon26 > 0 && (
            <div
              style={{ width: `${pctCon26}%`, backgroundColor: '#4DAA88' }}
              title={`Còn 2–6 giờ: ${formatInt(dai.CON_2_6 || 0)} (${pctCon26.toFixed(1)}%)`}
              className="flex items-center justify-center text-white text-xs font-bold px-1 overflow-hidden"
            >
              {pctCon26 >= 5 && `${pctCon26.toFixed(1).replace('.', ',')}%`}
            </div>
          )}
          {/* Dải 4: Còn trên 6 giờ */}
          {pctConTren6 > 0 && (
            <div
              style={{ width: `${pctConTren6}%`, backgroundColor: '#1F7A5C' }}
              title={`Còn trên 6 giờ: ${formatInt(dai.CON_TREN_6 || 0)} (${pctConTren6.toFixed(1)}%)`}
              className="flex items-center justify-center text-white text-xs font-bold px-1 overflow-hidden"
            >
              {pctConTren6 >= 5 && `${pctConTren6.toFixed(1).replace('.', ',')}%`}
            </div>
          )}
        </div>

        {/* Chú giải kèm số lượng dưới thanh */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-3 text-xs text-gray-700">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[#B3202A] shrink-0" />
            <span>Quá hạn: <strong className="text-gray-900 font-bold">{formatInt(quaHan)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[#E0A82E] shrink-0" />
            <span>Sắp hết (dưới 2 giờ): <strong className="text-gray-900 font-bold">{formatInt(sapHet)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[#4DAA88] shrink-0" />
            <span>Còn 2–6 giờ: <strong className="text-gray-900 font-bold">{formatInt(dai.CON_2_6 || 0)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-[#1F7A5C] shrink-0" />
            <span>Còn trên 6 giờ: <strong className="text-gray-900 font-bold">{formatInt(dai.CON_TREN_6 || 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* ── 5. BIỂU ĐỒ CỘT KHUNG GIỜ ───────────────────────────────────────── */}
      <QuyThoiGianHourChart theoGio={theoGio} />

      {/* ── 6. BẢNG TỈ LỆ QUÁ HẠN THEO ĐƯỜNG THƯ ──────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="hue-h2 text-[17px]">
              Tỉ lệ quá hạn theo đường thư
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Xếp theo số quá hạn; nhiều nhất ở đầu. * Đã qua (trung bình): số giờ đã tính thật từ mốc bắt đầu đến lúc hàng đến BCVH, không tính 21:00–07:00.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToLuot({})}
            className="flex items-center gap-1 text-xs font-bold text-[#4A1D6E] hover:underline self-start sm:self-auto shrink-0"
          >
            <span>Xem danh sách bưu gửi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left table-soft">
            <thead>
              <tr>
                <th>Đường thư</th>
                <th className="text-right">Đến</th>
                <th className="text-right">Đo được</th>
                <th className="text-right">Quá hạn</th>
                <th>Tỉ lệ quá hạn</th>
                <th className="text-right">Sắp hết hạn</th>
                <th className="text-right">Đã qua (trung bình)</th>
              </tr>
            </thead>
            <tbody>
              {(tong.theo_duong_thu || []).map((row, idx) => {
                const tyLe = row.ty_le_qua_han !== null ? row.ty_le_qua_han * 100 : null;
                const daQuaStr = formatDurationGiay(row.da_qua_trung_binh_giay);

                return (
                  <tr key={idx} className="hover:bg-cream-light/40 transition-colors">
                    <td className="font-semibold text-gray-900">
                      <button
                        type="button"
                        onClick={() => onNavigateToLuot({ duong_thu: row.ten })}
                        className="text-left hover:underline text-[#4A1D6E]"
                      >
                        {row.ten}
                      </button>
                    </td>
                    <td className="text-right font-medium text-gray-700">
                      {formatInt(row.den)}
                    </td>
                    <td className="text-right font-medium text-gray-700">
                      {formatInt(row.chinh)}
                    </td>
                    <td className="text-right font-bold text-[#B3202A]">
                      {formatInt(row.qua_han)}
                    </td>
                    <td className="min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-cream-line h-2 rounded-full overflow-hidden max-w-[80px]">
                          <div
                            className="bg-[#B3202A] h-full rounded-full"
                            style={{ width: `${Math.min(100, tyLe || 0)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 w-12 text-right">
                          {formatPercent(row.ty_le_qua_han)}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-medium text-[#A87A12]">
                      {formatInt(row.sap_het)}
                    </td>
                    <td className="text-right font-medium text-gray-700">
                      {daQuaStr}
                    </td>
                  </tr>
                );
              })}
              {(!tong.theo_duong_thu || tong.theo_duong_thu.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center text-xs text-gray-500 italic py-6">
                    Chưa có dữ liệu đường thư trong ngày này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 7. BẢNG TỈ LỆ QUÁ HẠN THEO BCVH (CHỈ HIỆN KHI XEM TẤT CẢ BCVH) ── */}
      {selectedBcvh === 'all' && tong.theo_bcvh && tong.theo_bcvh.length > 1 && (
        <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
          <div className="mb-3">
            <h2 className="hue-h2 text-[17px]">
              Tỉ lệ quá hạn theo BCVH
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Bảng này giúp dễ dàng so sánh giữa tất cả BCVH (khi chọn 1 BCVH cụ thể sẽ ẩn).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left table-soft">
              <thead>
                <tr>
                  <th>BCVH</th>
                  <th className="text-right">Đến</th>
                  <th className="text-right">Đo được</th>
                  <th className="text-right">Quá hạn</th>
                  <th>Tỉ lệ quá hạn</th>
                  <th className="text-right">Sắp hết hạn</th>
                </tr>
              </thead>
              <tbody>
                {tong.theo_bcvh.map((row, idx) => {
                  const tyLe = row.ty_le_qua_han !== null ? row.ty_le_qua_han * 100 : null;
                  const tenBcvh = getBcvhName(row.ma_bcvh);

                  return (
                    <tr key={idx} className="hover:bg-cream-light/40 transition-colors">
                      <td className="font-semibold text-gray-900">
                        <button
                          type="button"
                          onClick={() => onChangeBcvh(row.ma_bcvh)}
                          className="text-left hover:underline text-[#4A1D6E]"
                          title="Lọc riêng BCVH này"
                        >
                          {tenBcvh}
                        </button>
                      </td>
                      <td className="text-right font-medium text-gray-700">
                        {formatInt(row.den)}
                      </td>
                      <td className="text-right font-medium text-gray-700">
                        {formatInt(row.chinh)}
                      </td>
                      <td className="text-right font-bold text-[#B3202A]">
                        {formatInt(row.qua_han)}
                      </td>
                      <td className="min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-cream-line h-2 rounded-full overflow-hidden max-w-[80px]">
                            <div
                              className="bg-[#B3202A] h-full rounded-full"
                              style={{ width: `${Math.min(100, tyLe || 0)}%` }}
                            />
                          </div>
                          <span className="font-semibold text-gray-900 w-12 text-right">
                            {formatPercent(row.ty_le_qua_han)}
                          </span>
                        </div>
                      </td>
                      <td className="text-right font-medium text-[#A87A12]">
                        {formatInt(row.sap_het)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 8. BẢNG THEO NGUỒN HÀNG (NHÓM BD10) ───────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="mb-3">
          <h2 className="hue-h2 text-[17px]">
            Theo nguồn hàng (nhóm BD10)
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Tách hàng qua Trung tâm khai thác, giao nhận trực tiếp, nội tỉnh khác, lập đi tại đơn vị và nguồn khác.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left table-soft">
            <thead>
              <tr>
                <th>Nguồn hàng</th>
                <th className="text-right">Đến</th>
                <th className="text-right">Đo được</th>
                <th className="text-right">Quá hạn</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {/* Dòng 1: Qua Trung tâm khai thác */}
              <tr className="hover:bg-cream-light/40 transition-colors">
                <td className="font-semibold text-gray-900">
                  Qua Trung tâm khai thác
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomKtt.tong_shbg)}
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomKtt.chinh)}
                </td>
                <td className="text-right font-bold text-[#B3202A]">
                  {formatInt(nhomKtt.dai?.QUA_HAN)}
                </td>
                <td className="text-gray-700">
                  Từ lúc đến Trung tâm khai thác
                </td>
              </tr>

              {/* Dòng 2: Giao nhận trực tiếp */}
              <tr className="hover:bg-cream-light/40 transition-colors">
                <td className="font-semibold text-[#1F7A5C]">
                  Giao nhận trực tiếp
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomNgoai53.tong_shbg)}
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomNgoai53.chinh)}
                </td>
                <td className="text-right font-bold text-[#1F7A5C]">
                  0
                </td>
                <td className="text-gray-700">
                  Từ lúc BCVH xác nhận BD10; đã qua 0, không xét quá hạn; vẫn tính vào tỉ lệ.
                </td>
              </tr>

              {/* Dòng 3: Nội tỉnh khác */}
              <tr className="hover:bg-cream-light/40 transition-colors">
                <td className="font-semibold text-gray-900">
                  Nội tỉnh khác
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomNoiTinhKhac.tong_shbg)}
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomNoiTinhKhac.chinh)}
                </td>
                <td className="text-right font-bold text-[#B3202A]">
                  {formatInt(nhomNoiTinhKhac.dai?.QUA_HAN)}
                </td>
                <td className="text-gray-700">
                  Giữa các đơn vị trong tỉnh; có mốc KTT thì đo, thiếu mốc thì không đo.
                </td>
              </tr>

              {/* Dòng 4: Lập đi tại BCVH */}
              <tr className="hover:bg-cream-light/40 transition-colors">
                <td className="font-semibold text-gray-900">
                  Lập đi tại BCVH
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nhomLapDi.tong_shbg)}
                </td>
                <td className="text-right font-medium text-gray-400">
                  —
                </td>
                <td className="text-right font-medium text-gray-400">
                  —
                </td>
                <td className="text-gray-500 italic">
                  Không đo
                </td>
              </tr>

              {/* Dòng 5: Nguồn khác */}
              <tr className="hover:bg-cream-light/40 transition-colors">
                <td className="font-semibold text-gray-900">
                  Nguồn khác
                </td>
                <td className="text-right font-medium text-gray-700">
                  {formatInt(nguonKhacTong)}
                </td>
                <td className="text-right font-medium text-gray-400">
                  —
                </td>
                <td className="text-right font-medium text-gray-400">
                  —
                </td>
                <td className="text-gray-500 italic">
                  Không đo (không có hoặc sai số BD10)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 9. SẢN LƯỢNG KHÔNG ĐO ĐƯỢC ────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="mb-3">
          <h2 className="hue-h2 text-[17px]">
            Sản lượng không đo được
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            {formatInt(tong.khong_do_duoc || 0)} bưu gửi chưa đủ điều kiện trong ngày, phân theo lý do. Nhấn vào lý do để lọc danh sách.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {activeReasons.map(([reasonKey, count]) => {
            const label = LY_DO_KHONG_DO_LABELS[reasonKey] || reasonKey;
            return (
              <button
                key={reasonKey}
                type="button"
                onClick={() => onNavigateToLuot({ trang_thai: 'KHONG_DO_DUOC', ly_do: reasonKey })}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-light hover:bg-[#FAF6EC] border border-[#D9CBA8] text-xs text-gray-800 transition-colors cursor-pointer"
              >
                <span>{label}</span>
                <span className="font-bold text-[#4A1D6E] bg-white px-1.5 py-0.5 rounded-full border border-gray-200 text-[11px]">
                  {formatInt(count)}
                </span>
              </button>
            );
          })}
          {activeReasons.length === 0 && (
            <div className="text-xs text-gray-500 italic">
              Không có bưu gửi không đo được trong ngày này.
            </div>
          )}
        </div>
      </div>

      {/* ── 10. BẢNG CÁC NGÀY GẦN ĐÂY (7 NGÀY) ────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 shadow-none">
        <div className="mb-3">
          <h2 className="hue-h2 text-[17px]">
            Các ngày gần đây
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            7 ngày gần đây tính từ ngày đang xem
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left table-soft">
            <thead>
              <tr>
                <th>Ngày</th>
                <th className="text-right">Đến</th>
                <th className="text-right">Đo được</th>
                <th className="text-right">Quá hạn</th>
                <th>Tỉ lệ quá hạn</th>
                <th className="text-right">Sắp hết hạn</th>
              </tr>
            </thead>
            <tbody>
              {(recentDaysData?.ngay || []).map((row, idx) => {
                const isCurrent = row.ngay_den === selectedDate;
                const tyLe = row.ty_le_qua_han !== null ? row.ty_le_qua_han * 100 : null;
                const ddMmStr = formatDdMm(row.ngay_den);

                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      isCurrent
                        ? 'bg-amber-50/70 font-semibold'
                        : 'hover:bg-cream-light/40'
                    }`}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={() => onChangeDate(row.ngay_den)}
                        className={`text-left hover:underline ${
                          isCurrent ? 'text-[#4A1D6E] font-bold' : 'text-gray-900'
                        }`}
                      >
                        {ddMmStr} {isCurrent && '— đang xem'}
                      </button>
                    </td>
                    <td className="text-right font-medium text-gray-700">
                      {formatInt(row.den)}
                    </td>
                    <td className="text-right font-medium text-gray-700">
                      {formatInt(row.chinh)}
                    </td>
                    <td className="text-right font-bold text-[#B3202A]">
                      {formatInt(row.qua_han)}
                    </td>
                    <td className="min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-cream-line h-2 rounded-full overflow-hidden max-w-[80px]">
                          <div
                            className="bg-[#B3202A] h-full rounded-full"
                            style={{ width: `${Math.min(100, tyLe || 0)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 w-12 text-right">
                          {formatPercent(row.ty_le_qua_han)}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-medium text-[#A87A12]">
                      {formatInt(row.sap_het)}
                    </td>
                  </tr>
                );
              })}
              {(!recentDaysData?.ngay || recentDaysData.ngay.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-gray-500 italic py-6">
                    Chưa có dữ liệu cho các ngày gần đây.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 11. KHỐI VÍ DỤ MINH HỌA MỘT BƯU GỬI ĐƯỢC ĐO THẾ NÀO ────────────── */}
      <QuyThoiGianExampleBox />
    </div>
  );
}
