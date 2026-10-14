import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { BCVH_LIST } from '../../constants/bcvh';

// Hai ngưỡng tô màu tạm của ticket PHAT-2 (Đợt A)
export const NGUONG_PTC_DAT = 0.82; // PTC >= 82% màu xanh (#059669), dưới 82% màu vàng/cam hổ phách (#b45309)
export const NGUONG_CHUA_CO_TT_CANH_BAO = 0.10; // Chưa có thông tin phát >= 10% màu đỏ đậm (#991b1b)

// Định dạng tỷ lệ dạng 0..1 sang chuỗi % một chữ số thập phân dùng dấu phẩy (vd: 0.86 -> 86,0%)
// Không ép tổng 100% theo đúng chốt của ticket.
export function formatRatePercent(r) {
  if (r === null || r === undefined || isNaN(r)) return '—';
  return `${(r * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Định dạng số nguyên có phân cách hàng nghìn kiểu Việt Nam
export function formatInt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN');
}

// Chuyển đổi chuỗi ngày giờ Asia/Bangkok từ API (dạng YYYY-MM-DD HH:mm:ss) sang các định dạng hiển thị
function parseBangkokTime(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min] = match;
  return {
    timeOnly: `${hh}:${min}`,
    dateTimeShort: `${dd}/${mm} ${hh}:${min}`,
    fullDateTime: `${hh}:${min} ${dd}/${mm}/${yyyy}`,
    dateFull: `${dd}/${mm}/${yyyy}`
  };
}

export default function ProcessingDeliveryView({ authUser }) {
  // Mặc định chọn BCVH đầu tiên (533140 - Thuận Hóa) để khớp với bản vẽ mẫu Màn 13
  const [selectedBcvh, setSelectedBcvh] = useState('533140');
  const [selectedDate, setSelectedDate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [tyLeData, setTyLeData] = useState(null);
  const [tyLeError, setTyLeError] = useState(null);

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState(null); // { status, message }
  const [batchesNotice, setBatchesNotice] = useState(null);

  // 1. Tải dữ liệu tỷ lệ phát
  const loadTyLe = useCallback(async (bcvh, date) => {
    setLoading(true);
    setTyLeError(null);
    try {
      const params = new URLSearchParams();
      if (bcvh) params.set('bcvh', bcvh);
      if (date) params.set('ngay', date);

      const res = await apiFetchJson(`/api/phat/ty-le?${params.toString()}`);
      if (res.ok) {
        setTyLeData(res.data);
        // Nếu ban đầu chưa chọn ngày, đồng bộ ô chọn ngày theo ngày API trả về
        if (!date && res.data?.ngay) {
          setSelectedDate(res.data.ngay);
        }
      } else {
        setTyLeError(res.error || 'Không tải được dữ liệu tỷ lệ phát');
        setTyLeData(null);
      }
    } catch (err) {
      setTyLeError('Lỗi kết nối khi tải dữ liệu tỷ lệ phát');
      setTyLeData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Tải danh sách đợt nhập gần đây
  const loadBatches = useCallback(async (bcvh) => {
    setBatchesLoading(true);
    setBatchesError(null);
    setBatchesNotice(null);
    try {
      const qs = bcvh === 'all' ? 'bcvh=all&size=3' : `bcvh=${bcvh}&size=3`;
      const res = await apiFetchJson(`/api/phat/batches?${qs}`);
      if (res.ok) {
        const items = res.data?.items || [];
        setBatches(items);
        if (bcvh === 'all' && items.length === 0) {
          setBatchesNotice('Chọn một BCVH để xem các lần nhập');
        }
      } else {
        setBatches([]);
        // Chốt 4: nếu chọn «Toàn Trung tâm» và API không hỗ trợ / không nhận
        if (bcvh === 'all' && (res.status === 400 || res.status === 403)) {
          setBatchesNotice('Chọn một BCVH để xem các lần nhập');
        } else {
          // Điểm 1: Hiện nguyên văn thông báo tiếng Việt từ máy chủ
          setBatchesError({
            status: res.status,
            message: res.error || 'Lỗi khi tải danh sách đợt nhập'
          });
        }
      }
    } catch (err) {
      setBatches([]);
      setBatchesError({
        status: 0,
        message: 'Lỗi kết nối khi tải danh sách đợt nhập'
      });
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  // Kích hoạt nạp dữ liệu khi đổi bcvh hoặc ngày
  useEffect(() => {
    loadTyLe(selectedBcvh, selectedDate);
    loadBatches(selectedBcvh);
  }, [selectedBcvh, selectedDate, loadTyLe, loadBatches]);

  // Phân tích các mốc thời gian
  const hasPhatData = Boolean(tyLeData?.so_lieu_den_luc_bangkok);
  const timeInfo = parseBangkokTime(tyLeData?.so_lieu_den_luc_bangkok);
  const displayDateStr = tyLeData?.ngay
    ? `${tyLeData.ngay.slice(8, 10)}/${tyLeData.ngay.slice(5, 7)}/${tyLeData.ngay.slice(0, 4)}`
    : (selectedDate ? `${selectedDate.slice(8, 10)}/${selectedDate.slice(5, 7)}/${selectedDate.slice(0, 4)}` : '—');

  const mauSo = tyLeData?.mau_so ?? 0;
  const theoTT = tyLeData?.theo_trang_thai || {};

  // Hàm xác định màu cho ô tỷ lệ trong bảng «Theo khung giờ đến»
  // Điểm 3: Khi chưa có đợt nhập nào (hasPhatData = false), mọi ô tỷ lệ tô màu xám trung tính, không xanh/đỏ
  const getCellColor = (field, rate) => {
    if (!hasPhatData) return '#6b7280'; // xám trung tính khi chưa có đợt nhập
    if (rate === null || rate === undefined) return '#9ca3af';

    switch (field) {
      case 'PTC':
        return rate >= NGUONG_PTC_DAT ? '#059669' : '#b45309';
      case 'PKTC':
        return '#dc2626';
      case 'CHUYEN_HOAN':
        return '#ea580c';
      case 'LAC_HUONG':
        return '#7c3aed';
      case 'CHUA_CO_TT':
        return rate >= NGUONG_CHUA_CO_TT_CANH_BAO ? '#991b1b' : '#334155';
      default:
        return '#374151';
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      {/* ── THANH ĐIỀU HƯỚNG TRÊN CÙNG: TIÊU ĐỀ & BỘ ĐIỀU KHIỂN ──────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-title)] tracking-tight">
            Xử lý và tỷ lệ phát
          </h1>
        </div>

        {/* Cụm công cụ: Ngày, BCVH, Nút thao tác Đợt B (disabled) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bộ chọn Ngày đến */}
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm text-xs">
            <span className="font-semibold text-gray-500 whitespace-nowrap">Ngày đến:</span>
            <input
              id="phat-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>

          {/* Bộ chọn BCVH */}
          <div className="flex items-center bg-white px-2 py-1.5 rounded-lg border border-gray-200 shadow-sm text-xs">
            <select
              id="phat-bcvh-select"
              value={selectedBcvh}
              onChange={(e) => setSelectedBcvh(e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer pr-2"
            >
              <option value="all">Toàn Trung tâm (6 BCVH)</option>
              {BCVH_LIST.map((b) => (
                <option key={b.ma} value={b.ma}>
                  {b.ten} ({b.ma})
                </option>
              ))}
            </select>
          </div>

          {/* Nút làm mới */}
          <button
            type="button"
            onClick={() => {
              loadTyLe(selectedBcvh, selectedDate);
              loadBatches(selectedBcvh);
            }}
            disabled={loading}
            title="Tải lại số liệu"
            className="p-2 text-gray-500 hover:text-orange-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-orange-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Nút «Tải file mẫu» (disabled kèm nhãn «Sắp có», không modal) */}
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 text-gray-400 font-medium text-xs rounded-lg cursor-not-allowed select-none"
            title="Tính năng thuộc Đợt B (Quy trình nhập trạng thái)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Tải file mẫu</span>
            <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.2 rounded font-semibold ml-0.5">
              Sắp có
            </span>
          </button>

          {/* Nút «Nhập trạng thái phát» (disabled kèm nhãn «Sắp có», không modal) */}
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-400/50 border border-transparent text-white font-medium text-xs rounded-lg cursor-not-allowed select-none shadow-sm"
            title="Tính năng thuộc Đợt B (Quy trình nhập trạng thái)"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Nhập trạng thái phát</span>
            <span className="text-[10px] bg-white/30 text-white px-1.5 py-0.2 rounded font-semibold ml-0.5">
              Sắp có
            </span>
          </button>
        </div>
      </div>

      {/* ── LỖI NẾU CÓ KHI TẢI TỶ LỆ ────────────────────────────────────────── */}
      {tyLeError && (
        <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{tyLeError}</span>
        </div>
      )}

      {/* ── THÔNG TIN MẪU SỐ & MỐC TÍNH (ĐIỂM 2: «Chưa có số liệu phát») ─────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm text-xs text-gray-600 leading-relaxed">
        <span>Mẫu số là số bưu gửi (SHBG) đến BCVH ngày {displayDateStr}, mỗi SHBG tính một lần: </span>
        <strong className="text-gray-900 font-bold">{formatInt(mauSo)}</strong>.
        <span> Trạng thái của mỗi SHBG lấy từ lần nhập mới nhất. </span>
        <span>
          {hasPhatData
            ? `Số liệu phát tính đến ${timeInfo?.fullDateTime || ''}.`
            : 'Chưa có số liệu phát.'}
        </span>
      </div>

      {/* ── 5 THẺ CHỈ SỐ TRẠNG THÁI (GRID 5 CỘT) ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* THẺ 1: PHÁT THÀNH CÔNG (PTC) - Nổi bật khung đậm viền đen bo góc */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-gray-900 flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-800 tracking-wide uppercase">
              PHÁT THÀNH CÔNG (PTC)
            </div>
            <div
              className="text-4xl font-[900] my-1 tracking-tight leading-none"
              style={{
                color: !hasPhatData
                  ? '#6b7280'
                  : (theoTT.PTC?.ty_le >= NGUONG_PTC_DAT ? '#059669' : '#b45309')
              }}
            >
              {formatRatePercent(theoTT.PTC?.ty_le)}
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1.5">
              {formatInt(theoTT.PTC?.so)} / {formatInt(mauSo)} bưu gửi
            </div>
          </div>
          {/* Điểm 2: Thay «số liệu tính đến —» bằng «Chưa có số liệu phát» */}
          <div className="text-[11px] text-gray-500 font-medium mt-2 pt-2 border-t border-gray-100">
            Mức cập nhật kết quả phát{' '}
            <strong className="text-gray-800 font-bold">
              {formatRatePercent(tyLeData?.muc_cap_nhat)}
            </strong>
            {' · '}
            <span>
              {hasPhatData ? `số liệu tính đến ${timeInfo?.timeOnly || ''}` : 'Chưa có số liệu phát'}
            </span>
          </div>
        </div>

        {/* THẺ 2: PHÁT KHÔNG THÀNH CÔNG */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              PHÁT KHÔNG THÀNH CÔNG
            </div>
            <div
              className="text-3xl font-[900] my-2 tracking-tight leading-none"
              style={{ color: hasPhatData ? '#dc2626' : '#6b7280' }}
            >
              {formatRatePercent(theoTT.PKTC?.ty_le)}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {formatInt(theoTT.PKTC?.so)} bưu gửi
            </div>
          </div>
        </div>

        {/* THẺ 3: CHUYỂN HOÀN */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              CHUYỂN HOÀN
            </div>
            <div
              className="text-3xl font-[900] my-2 tracking-tight leading-none"
              style={{ color: hasPhatData ? '#ea580c' : '#6b7280' }}
            >
              {formatRatePercent(theoTT.CHUYEN_HOAN?.ty_le)}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {formatInt(theoTT.CHUYEN_HOAN?.so)} bưu gửi
            </div>
          </div>
        </div>

        {/* THẺ 4: LẠC HƯỚNG */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              LẠC HƯỚNG
            </div>
            <div
              className="text-3xl font-[900] my-2 tracking-tight leading-none"
              style={{ color: hasPhatData ? '#7c3aed' : '#6b7280' }}
            >
              {formatRatePercent(theoTT.LAC_HUONG?.ty_le)}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {formatInt(theoTT.LAC_HUONG?.so)} bưu gửi
            </div>
          </div>
        </div>

        {/* THẺ 5: CHƯA CÓ THÔNG TIN PHÁT */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[148px]">
          <div>
            <div className="text-[11px] font-bold text-gray-600 tracking-wide uppercase">
              CHƯA CÓ THÔNG TIN PHÁT
            </div>
            <div
              className="text-3xl font-[900] my-2 tracking-tight leading-none"
              style={{ color: hasPhatData ? '#334155' : '#6b7280' }}
            >
              {formatRatePercent(theoTT.CHUA_CO_TT?.ty_le)}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {formatInt(theoTT.CHUA_CO_TT?.so)} bưu gửi chưa được cập nhật
            </div>
          </div>
        </div>
      </div>

      {/* ── BẢNG KHUNG GIỜ ĐẾN (TRÁI) & CÁC LẦN NHẬP GẦN ĐÂY (PHẢI) ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* CỘT TRÁI (8/12): BẢNG THEO KHUNG GIỜ ĐẾN BCVH */}
        <div className="lg:col-span-8 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-gray-900">
              Theo khung giờ đến BCVH
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Khung giờ là giờ bưu gửi đến BCVH, chưa phải giờ phát (nguồn chưa có giờ phát từng bưu gửi).
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-bold">
                  <th className="py-2.5 px-3">Khung giờ đến</th>
                  <th className="py-2.5 px-3 text-right">SHBG đến</th>
                  <th className="py-2.5 px-3 text-right">PTC</th>
                  <th className="py-2.5 px-3 text-right">Không thành công</th>
                  <th className="py-2.5 px-3 text-right">Chuyển hoàn</th>
                  <th className="py-2.5 px-3 text-right">Lạc hướng</th>
                  <th className="py-2.5 px-3 text-right">Chưa có thông tin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {(tyLeData?.theo_khung_gio_den || []).map((row) => {
                  const tt = row.theo_trang_thai || {};
                  const hasBg = (row.so_den || 0) > 0;

                  return (
                    <tr key={row.ma} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-gray-800 whitespace-nowrap">
                        {row.nhan}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-gray-900 whitespace-nowrap">
                        {formatInt(row.so_den)}
                      </td>
                      {/* PTC */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasBg ? (
                          <span>
                            <strong
                              className="font-bold mr-1.5"
                              style={{ color: getCellColor('PTC', tt.PTC?.ty_le) }}
                            >
                              {formatRatePercent(tt.PTC?.ty_le)}
                            </strong>
                            <span className="text-gray-500">{formatInt(tt.PTC?.so)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {/* Không thành công */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasBg ? (
                          <span>
                            <strong
                              className="font-bold mr-1.5"
                              style={{ color: getCellColor('PKTC', tt.PKTC?.ty_le) }}
                            >
                              {formatRatePercent(tt.PKTC?.ty_le)}
                            </strong>
                            <span className="text-gray-500">{formatInt(tt.PKTC?.so)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {/* Chuyển hoàn */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasBg ? (
                          <span>
                            <strong
                              className="font-bold mr-1.5"
                              style={{ color: getCellColor('CHUYEN_HOAN', tt.CHUYEN_HOAN?.ty_le) }}
                            >
                              {formatRatePercent(tt.CHUYEN_HOAN?.ty_le)}
                            </strong>
                            <span className="text-gray-500">{formatInt(tt.CHUYEN_HOAN?.so)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {/* Lạc hướng */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasBg ? (
                          <span>
                            <strong
                              className="font-bold mr-1.5"
                              style={{ color: getCellColor('LAC_HUONG', tt.LAC_HUONG?.ty_le) }}
                            >
                              {formatRatePercent(tt.LAC_HUONG?.ty_le)}
                            </strong>
                            <span className="text-gray-500">{formatInt(tt.LAC_HUONG?.so)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {/* Chưa có thông tin */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {hasBg ? (
                          <span>
                            <strong
                              className="font-bold mr-1.5"
                              style={{ color: getCellColor('CHUA_CO_TT', tt.CHUA_CO_TT?.ty_le) }}
                            >
                              {formatRatePercent(tt.CHUA_CO_TT?.ty_le)}
                            </strong>
                            <span className="text-gray-500">{formatInt(tt.CHUA_CO_TT?.so)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* DÒNG TỔNG CỘNG: CẢ NGÀY */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50/70 font-bold text-gray-900">
                  <td className="py-3 px-3">Cả ngày</td>
                  <td className="py-3 px-3 text-right">{formatInt(mauSo)}</td>
                  {/* PTC */}
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <strong
                      className="font-bold mr-1.5"
                      style={{ color: getCellColor('PTC', theoTT.PTC?.ty_le) }}
                    >
                      {formatRatePercent(theoTT.PTC?.ty_le)}
                    </strong>
                    <span className="text-gray-600 font-normal">{formatInt(theoTT.PTC?.so)}</span>
                  </td>
                  {/* PKTC */}
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <strong
                      className="font-bold mr-1.5"
                      style={{ color: getCellColor('PKTC', theoTT.PKTC?.ty_le) }}
                    >
                      {formatRatePercent(theoTT.PKTC?.ty_le)}
                    </strong>
                    <span className="text-gray-600 font-normal">{formatInt(theoTT.PKTC?.so)}</span>
                  </td>
                  {/* Chuyển hoàn */}
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <strong
                      className="font-bold mr-1.5"
                      style={{ color: getCellColor('CHUYEN_HOAN', theoTT.CHUYEN_HOAN?.ty_le) }}
                    >
                      {formatRatePercent(theoTT.CHUYEN_HOAN?.ty_le)}
                    </strong>
                    <span className="text-gray-600 font-normal">{formatInt(theoTT.CHUYEN_HOAN?.so)}</span>
                  </td>
                  {/* Lạc hướng */}
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <strong
                      className="font-bold mr-1.5"
                      style={{ color: getCellColor('LAC_HUONG', theoTT.LAC_HUONG?.ty_le) }}
                    >
                      {formatRatePercent(theoTT.LAC_HUONG?.ty_le)}
                    </strong>
                    <span className="text-gray-600 font-normal">{formatInt(theoTT.LAC_HUONG?.so)}</span>
                  </td>
                  {/* Chưa có thông tin */}
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <strong
                      className="font-bold mr-1.5"
                      style={{ color: getCellColor('CHUA_CO_TT', theoTT.CHUA_CO_TT?.ty_le) }}
                    >
                      {formatRatePercent(theoTT.CHUA_CO_TT?.ty_le)}
                    </strong>
                    <span className="text-gray-600 font-normal">{formatInt(theoTT.CHUA_CO_TT?.so)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* CỘT PHẢI (4/12): CÁC LẦN NHẬP GẦN ĐÂY */}
        <div className="lg:col-span-4 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-900">
                Các lần nhập gần đây
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Mỗi lần nhập tự ghi giờ nhập (mốc «số liệu tính đến») và người nhập.
              </p>
            </div>

            {/* Điểm 1: Xử lý lỗi, thông báo máy chủ và nút «Thử lại» */}
            {batchesLoading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Đang tải lịch sử nhập...
              </div>
            ) : batchesError ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span className="flex-1 leading-relaxed">{batchesError.message}</span>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => loadBatches(selectedBcvh)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử lại</span>
                  </button>
                </div>
              </div>
            ) : batchesNotice ? (
              <div className="py-8 text-center text-xs text-gray-500 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                {batchesNotice}
              </div>
            ) : batches.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 rounded-xl">
                Chưa có đợt nhập nào cho BCVH này.
              </div>
            ) : (
              <div className="space-y-3.5">
                {batches.map((item) => {
                  const itemTime = parseBangkokTime(item.nhap_luc_bangkok);
                  // Chỉ hiện nhap_boi.full_name, không kèm hrm_code
                  const nguoiNhap = item.nhap_boi?.full_name || 'Người dùng';

                  return (
                    <div key={item.id} className="pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                      <div className="text-xs font-bold text-gray-900">
                        Số liệu tính đến {itemTime ? itemTime.dateTimeShort : item.nhap_luc_bangkok}
                      </div>
                      <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                        <span className="font-medium text-gray-800">{nguoiNhap}</span>
                        {' · '}
                        nhập {formatInt(item.so_nhap)}
                        {' · '}
                        bỏ qua {formatInt(item.so_bo_qua)}
                        {' · '}
                        lỗi {formatInt(item.so_loi)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dòng liên kết xem toàn bộ lịch sử */}
          <div className="pt-4 mt-4 border-t border-gray-100">
            <span
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer underline underline-offset-2"
              title="Xem toàn bộ lịch sử chi tiết sẽ được mở ở Đợt B"
            >
              Xem toàn bộ lịch sử
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
