import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, RefreshCw, Clock, ListFilter, Truck } from 'lucide-react';
import QuyThoiGianDateRangePicker from '../quythoigian/QuyThoiGianDateRangePicker';
import {
  getTodayVnYmd,
  shiftDay,
  countDaysInclusive,
  formatInt,
  formatPercent,
  formatDdMmYyyy,
} from '../quythoigian/quyThoiGianFormatters';
import {
  formatKg,
  formatDecimal,
  formatDateTimeWithoutSeconds,
} from './kttFormatters';
import {
  fetchKttMeta,
  fetchKttLichXeGioLapBd10,
  fetchKttLichXeTheoDuongThu,
  fetchKttLichXeTheoBcvh,
} from './kttApi';
import KttDanhSachDiNgay from './KttDanhSachDiNgay';

export default function KttLichXe({ authUser }) {
  // Khoảng ngày: mặc định 30 ngày kết thúc ở ngày của độ mới dữ liệu
  const [dateRange, setDateRange] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // Meta dữ liệu (độ mới)
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // Dữ liệu 3 endpoint: B4, B5, B6
  const [b4Data, setB4Data] = useState(null);
  const [b5Data, setB5Data] = useState(null);
  const [b6Data, setB6Data] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Trạng thái bấm ô xem danh sách bưu gửi từ bảng B5
  const [selectedCellFilter, setSelectedCellFilter] = useState(null);

  // Ref chống stale response
  const reqIdRef = useRef(0);

  // 1. Tải meta lúc khởi tạo để tính khoảng 30 ngày mặc định
  useEffect(() => {
    let active = true;
    setMetaLoading(true);

    fetchKttMeta()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setMeta(res.data);
          const rawLuc = res.data.nguon_xuat_luc_moi_nhat;
          const latestDay = (rawLuc && typeof rawLuc === 'string' && rawLuc.length >= 10)
            ? rawLuc.slice(0, 10)
            : getTodayVnYmd();
          setDateRange({
            from: shiftDay(latestDay, -29), // đúng 30 ngày kết thúc ở latestDay
            to: latestDay,
          });
        } else {
          const today = getTodayVnYmd();
          setDateRange({
            from: shiftDay(today, -29),
            to: today,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        const today = getTodayVnYmd();
        setDateRange({
          from: shiftDay(today, -29),
          to: today,
        });
      })
      .finally(() => {
        if (active) setMetaLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Validate khoảng ngày (tối đa 31 ngày)
  const validateRange = useCallback((range) => {
    if (!range?.from || !range?.to) return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    const days = countDaysInclusive(range.from, range.to);
    if (days <= 0) return 'Đến ngày không được nhỏ hơn Từ ngày.';
    if (days > 31) return `Khoảng ngày tối đa 31 ngày (đang chọn ${days} ngày).`;
    return null;
  }, []);

  // 3. Tải song song 3 endpoint khi đổi khoảng ngày
  const loadData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    const valErr = validateRange(dateRange);
    setValidationError(valErr);
    if (valErr) return;

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [b4Res, b5Res, b6Res] = await Promise.all([
        fetchKttLichXeGioLapBd10({ tu: dateRange.from, den: dateRange.to, min_bd10: 5 }),
        fetchKttLichXeTheoDuongThu({ tu: dateRange.from, den: dateRange.to, top: 8 }),
        fetchKttLichXeTheoBcvh({ tu: dateRange.from, den: dateRange.to }),
      ]);

      if (reqIdRef.current !== reqId) return;

      if (!b4Res.ok) throw new Error(b4Res.error || 'Lỗi tải giờ lập BD10 theo lịch');
      if (!b5Res.ok) throw new Error(b5Res.error || 'Lỗi tải đường thư đến');
      if (!b6Res.ok) throw new Error(b6Res.error || 'Lỗi tải lịch xe theo BCVH');

      setB4Data(b4Res.data);
      setB5Data(b5Res.data);
      setB6Data(b6Res.data);
    } catch (e) {
      if (reqIdRef.current === reqId) {
        setError(e.message || 'Lỗi kết nối khi tải số liệu lịch xe và đường thư.');
      }
    } finally {
      if (reqIdRef.current === reqId) {
        setLoading(false);
      }
    }
  }, [dateRange, validateRange]);

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      loadData();
    }
  }, [dateRange, loadData]);

  const handleDateRangeChange = (newRange) => {
    setSelectedCellFilter(null);
    setDateRange(newRange);
  };

  // Trạng thái dữ liệu
  const isChuaCoDuLieu = b5Data?.ly_do === 'CHUA_CO_DU_LIEU' || (!loading && b5Data && !b5Data.co_du_lieu);
  const cuaSo = b5Data?.cua_so_thuc_te;
  const doMoi = b5Data?.nguon_xuat_luc_moi_nhat || meta?.nguon_xuat_luc_moi_nhat;

  // Dữ liệu B4
  const b4Dong = b4Data?.dong || [];
  const b4QuyUoc = b4Data?.quy_uoc;

  // Dữ liệu B5
  const b5LienTinh = b5Data?.lien_tinh_den_bcvh;
  const b5NoiTinhBcvh = b5Data?.noi_tinh_den_bcvh;
  const b5NoiTinhLienTinh = b5Data?.noi_tinh_di_lien_tinh;

  // Dữ liệu B6
  const b6List = b6Data?.bcvh || [];

  return (
    <div className="space-y-6 px-6 pb-12 max-w-full min-w-0">
      {/* ── ĐẦU TRANG: TIÊU ĐỀ, PHẠM VI SỐ LIỆU & BỘ CHỌN NGÀY ────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hue-h1">
              B · Lịch xe, đường thư
            </h1>
            {doMoi && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DDF1E8] text-[#1F7A5C]">
                <Clock className="w-3 h-3" />
                Dữ liệu đến lúc {formatDateTimeWithoutSeconds(doMoi)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2">
            <span>Trung tâm Khai thác · 530100 · Hàng tại KTT</span>
            {cuaSo && cuaSo.tu_ngay && (
              <span className="text-gray-400">
                · Phạm vi số liệu: <strong className="text-gray-700">{formatDdMmYyyy(cuaSo.tu_ngay)} – {formatDdMmYyyy(cuaSo.den_ngay)}</strong>
                {cuaSo.so_ngay_co_du_lieu ? ` (${cuaSo.so_ngay_co_du_lieu} ngày có dữ liệu)` : ''}
              </span>
            )}
          </p>
        </div>

        {/* Bộ chọn khoảng ngày */}
        <div className="flex items-center gap-2 shrink-0">
          <QuyThoiGianDateRangePicker
            dateRange={dateRange || { from: '', to: '' }}
            onChangeDateRange={handleDateRangeChange}
            idPrefix="ktt-b-lich-xe"
          />
        </div>
      </div>

      {/* Cảnh báo validate ngày nếu chọn quá 31 ngày */}
      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-[10px] text-xs text-red-700 flex items-center gap-2 font-medium" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Hộp lỗi khi gọi API */}
      {error && !validationError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-[14px] text-xs text-red-700 flex items-center justify-between gap-2" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline shrink-0 cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        </div>
      )}

      {/* Chưa nạp lần nào */}
      {!loading && isChuaCoDuLieu && (
        <div className="bg-white rounded-[14px] p-8 border border-gray-200 text-center text-sm text-gray-500 italic shadow-none">
          Chưa có dữ liệu Hàng tại KTT
        </div>
      )}

      {/* Chỉ báo đang tính khi đổi ngày nhưng đã có dữ liệu cũ */}
      {loading && b5Data && (
        <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] text-xs font-semibold text-[#5A4A62]">
          <span className="w-2 h-2 rounded-full bg-[#1F7A5C] animate-ping" />
          <span>Đang tính số liệu…</span>
        </div>
      )}

      {/* Khung xương khi tải lần đầu */}
      {(!dateRange || metaLoading || (loading && !b5Data)) && (
        <div className="space-y-4 animate-pulse">
          <div className="h-48 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-64 bg-white rounded-[14px] border border-gray-200" />
          <div className="h-72 bg-white rounded-[14px] border border-gray-200" />
        </div>
      )}

      {/* NỘI DUNG CHÍNH */}
      {b5Data && !isChuaCoDuLieu && (
        <div className={`space-y-6 transition-opacity duration-200 min-w-0 max-w-full ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* ── 1. B4 BẢNG «GIỜ LẬP BD10 ĐI TỪNG BCVH VÀ XE THEO LỊCH C2» ───── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="ktt-h2 text-[17px]">
                  Giờ lập BD10 đi từng BCVH và xe theo lịch C2
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mỗi BD10 đi được gán cho chuyến có giờ xuất phát gần giờ lập nhất. Số âm ở cột «Lập trước xe rời KTT» thể hiện BD10 lập sau giờ xe chạy.
                </p>
              </div>

              {b4Data && (
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-[8px]">
                  Tổng số BD10 đi: <strong className="font-bold tabular-nums text-gray-800">{formatInt(b4Data.tong_bd10)}</strong>
                </div>
              )}
            </div>

            {b4Dong.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">
                Không có dữ liệu chuyến BD10 trong khoảng đã chọn (lọc nhóm &ge; 5 BD10).
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full">
                <table className="table-soft w-full min-w-[850px] text-left text-xs">
                  <thead>
                    <tr>
                      <th>BCVH ĐÍCH</th>
                      <th>ĐƯỜNG THƯ ĐI</th>
                      <th className="text-center">XE RỜI KTT (C2)</th>
                      <th className="text-right">SỐ BD10</th>
                      <th className="text-center">GIỜ LẬP TB</th>
                      <th className="text-center">SỚM NHẤT – MUỘN NHẤT</th>
                      <th className="text-right">LẬP TRƯỚC XE (GIỜ)</th>
                      <th className="text-right">LẬP SAU XE (BD10)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b4Dong.map((row, idx) => {
                      const isAfter = row.truoc_xe_tb_gio !== null && row.truoc_xe_tb_gio < 0;
                      const hasLateBd10 = row.so_bd10_lap_sau_gio_xe > 0;
                      const isSixDays = row.ngay_chay === 'NGHI_CN';
                      const lateTip = `BD10 lập sau giờ xe rời KTT: ${formatInt(row.so_bd10_lap_sau_gio_xe)} chuyến (${formatPercent(row.ty_le_lap_sau_gio_xe)})`;

                      return (
                        <tr key={`${row.ma_bcvh}-${row.duong_thu_ma}-${row.xe_roi_ktt}-${idx}`} className="hover:bg-amber-50/40">
                          <td className="font-medium text-gray-800">
                            <div>{row.ten_bcvh || row.ma_bcvh}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{row.ma_bcvh}</div>
                          </td>
                          <td className="text-gray-700">
                            <div>{row.duong_thu_ten || '(chưa có tên)'}</div>
                            {row.duong_thu_ma && (
                              <div className="text-[10px] text-gray-400 font-mono">{row.duong_thu_ma}</div>
                            )}
                          </td>
                          <td className="text-center tabular-nums font-bold text-gray-800">
                            {row.xe_roi_ktt ? (
                              <span>
                                {row.xe_roi_ktt}
                                {isSixDays && <span className="text-[#A87A12] ml-0.5" title="Chạy 6 ngày/tuần (nghỉ CN)">*</span>}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">Không có trong lịch C2</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums font-semibold text-gray-800">
                            {formatInt(row.so_bd10)}
                          </td>
                          <td className="text-center tabular-nums text-gray-700">
                            {row.gio_lap_tb || '—'}
                          </td>
                          <td className="text-center tabular-nums text-gray-500">
                            {row.gio_lap_som_nhat && row.gio_lap_muon_nhat
                              ? `${row.gio_lap_som_nhat} – ${row.gio_lap_muon_nhat}`
                              : '—'}
                          </td>
                          <td className={`text-right tabular-nums font-bold ${
                            isAfter ? 'text-[#B3202A] bg-red-50/70 px-2 rounded' : 'text-[#1F7A5C]'
                          }`}>
                            {row.truoc_xe_tb_gio !== null ? `${formatDecimal(row.truoc_xe_tb_gio, 1)} giờ` : '—'}
                          </td>

                          {/* Ô lập sau xe có tooltip chuẩn hóa */}
                          <td className={`text-right tabular-nums font-semibold ${
                            hasLateBd10 ? 'text-[#B3202A]' : 'text-gray-400'
                          }`}>
                            {hasLateBd10 ? (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={lateTip}
                                className="inline-flex items-center gap-1 cursor-pointer group relative focus:outline-none"
                              >
                                <span>{formatInt(row.so_bd10_lap_sau_gio_xe)}</span>
                                {row.ty_le_lap_sau_gio_xe !== null && (
                                  <span className="text-[10px] text-red-500">
                                    ({formatPercent(row.ty_le_lap_sau_gio_xe)})
                                  </span>
                                )}
                                <div className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity absolute bottom-full mb-1 right-0 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  {lateTip}
                                </div>
                              </div>
                            ) : (
                              <span>0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ghi chú giải nghĩa cuối bảng */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
              <p>
                * Dấu <span className="font-bold text-[#A87A12]">*</span>: Chuyến chạy 6 ngày/tuần (nghỉ Chủ nhật).
              </p>
              <p className="italic">
                {b4QuyUoc || 'Chuyến theo lịch C2 gán theo giờ lập gần nhất, là quy ước, không phải số chuyến hệ thống (hệ thống không ghi số thứ tự chuyến trong ngày).'}
              </p>
            </div>
          </div>

          {/* ── 2. B5 BẢNG «THEO TỪNG ĐƯỜNG THƯ ĐẾN» ───────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="mb-4">
              <h2 className="ktt-h2 text-[17px]">
                Theo từng đường thư đến (Phân nhóm theo hướng hàng)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Bấm tỷ lệ ở cột «Hôm sau» hoặc «Chưa đi &gt; 24h» (có biểu tượng ba gạch) để mở bảng danh sách bưu gửi chi tiết.
              </p>
            </div>

            {/* Bảng 3 mục */}
            <div className="space-y-6 min-w-0 max-w-full">
              {/* Mục 1: Cấp 1 đến đi BCVH Huế */}
              {b5LienTinh && (
                <BangDuongThuNhom
                  tieuDe="1 · Cấp 1 đến → 6 BCVH Huế"
                  moTa="Xe Cấp 1 về Trung tâm Khai thác Huế, đích phát 6 BCVH"
                  data={b5LienTinh}
                  huong="lien_tinh_den_bcvh"
                  selectedCellFilter={selectedCellFilter}
                  onSelectCell={(filter) => setSelectedCellFilter(filter)}
                />
              )}

              {/* Mục 2: Nội tỉnh đi BCVH Huế */}
              {b5NoiTinhBcvh && (
                <BangDuongThuNhom
                  tieuDe="2 · Nội tỉnh đến → 6 BCVH Huế"
                  moTa="Hàng từ các bưu cục nội tỉnh Thừa Thiên Huế về KTT phát 6 BCVH"
                  data={b5NoiTinhBcvh}
                  huong="noi_tinh_den_bcvh"
                  selectedCellFilter={selectedCellFilter}
                  onSelectCell={(filter) => setSelectedCellFilter(filter)}
                />
              )}

              {/* Mục 3: Nội tỉnh đi liên tỉnh */}
              {b5NoiTinhLienTinh && (
                <BangDuongThuNhom
                  tieuDe="3 · Nội tỉnh đến → Đi liên tỉnh (xe Cấp 1)"
                  moTa="Hàng nội tỉnh gom về KTT đi tiếp ra các tỉnh khác bằng xe Cấp 1"
                  data={b5NoiTinhLienTinh}
                  huong="noi_tinh_di_lien_tinh"
                  selectedCellFilter={selectedCellFilter}
                  onSelectCell={(filter) => setSelectedCellFilter(filter)}
                />
              )}
            </div>

            {/* Hộp ghi chú KHHH */}
            <div className="bg-[#FAF5E8] border border-[#E4D5AE] rounded-[10px] p-3 text-xs text-[#5A4A62] mt-4">
              <strong>Ghi chú hàng chuyển hoàn:</strong> Hàng chuyển hoàn từ Tổ KHHH (531120 → Thuận Hóa) được tách riêng ở dòng có nhãn «Hoàn», không cộng vào tổng mục và không tính chỉ tiêu 14 giờ.
            </div>
          </div>

          {/* ── BẢNG DANH SÁCH BẤM Ô NẰM NGAY DƯỚI B5 ───────────────────────── */}
          {selectedCellFilter && (
            <KttDanhSachDiNgay
              tu={dateRange.from}
              den={dateRange.to}
              initialLoai={selectedCellFilter.initialLoai || 'hom-sau'}
              duongThu={selectedCellFilter.duongThu}
              duongThuTen={selectedCellFilter.duongThuTen}
              noiGui={selectedCellFilter.noiGui}
              noiGuiTen={selectedCellFilter.noiGuiTen}
              huong={selectedCellFilter.huong}
              hangHoan={selectedCellFilter.hangHoan}
              title={selectedCellFilter.title}
              onClose={() => setSelectedCellFilter(null)}
            />
          )}

          {/* ── 3. B6 LƯỚI THẺ MỖI BCVH ────────────────────────────────────── */}
          <div className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-none min-w-0 max-w-full">
            <div className="mb-4">
              <h2 className="ktt-h2 text-[17px]">
                Lịch xe C2 và phân bố hàng đến theo giờ tại 6 BCVH
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Cột màu xám thể hiện số bưu gửi đến mỗi giờ (trung bình ngày). Vạch dọc là giờ xe rời KTT theo lịch C2. Tam giác vàng là giờ lập BD10 thực tế trung bình.
              </p>
            </div>

            {/* Lưới 6 BCVH (2 cột trên desktop, 1 cột trên mobile) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0 max-w-full">
              {b6List.map((bcvh) => {
                const gioQuet = bcvh.hang_den_theo_gio?.gio_quet_tui_den || [];
                const lichXe = bcvh.lich || [];
                const thucTe = bcvh.gio_lap_bd10_thuc_te || [];

                const hasZeroData = bcvh.shbg === 0;

                return (
                  <div
                    key={bcvh.ma_bcvh}
                    className="bg-[#FAF5E8]/40 border border-[#E4D5AE] rounded-[12px] p-4 flex flex-col justify-between min-w-0 max-w-full"
                  >
                    {/* Tiêu đề thẻ BCVH */}
                    <div className="flex items-center justify-between border-b border-[#E4D5AE] pb-2 mb-3">
                      <div>
                        <div className="font-bold text-gray-800 text-sm flex items-center gap-2">
                          <span>{bcvh.ten_bcvh || bcvh.ma_bcvh}</span>
                          <span className="text-[10px] text-gray-500 font-mono">({bcvh.ma_bcvh})</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {bcvh.so_chuyen_moi_ngay} chuyến/ngày theo lịch C2
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-extrabold tabular-nums text-gray-800">
                          {formatInt(bcvh.shbg)} <span className="text-xs font-normal text-gray-500">bưu gửi</span>
                        </div>
                        <div className="text-[11px] text-gray-500 tabular-nums">
                          {formatKg(bcvh.kg, { withUnit: true })}
                        </div>
                      </div>
                    </div>

                    {/* Vùng biểu đồ 24 giờ */}
                    {hasZeroData ? (
                      <div className="py-10 text-center text-xs text-gray-500 italic bg-white/70 rounded-[8px] border border-dashed border-gray-200">
                        {bcvh.ma_bcvh === '535470'
                          ? 'BCVH nhận thẳng từ xe Cấp 1, không có mốc quét túi đến tại KTT'
                          : 'Chưa có bưu gửi đến trong khoảng ngày này'}
                      </div>
                    ) : (
                      <div className="relative pt-2 pb-2 max-w-full">
                        {/* Cuộn ngang bảo vệ trên mobile, không cuộn ở màn hình md trở lên */}
                        <div className="overflow-x-auto md:overflow-x-visible max-w-full pb-1">
                          <div className="h-36 min-w-[280px] md:min-w-0 w-full flex items-end gap-[1px] sm:gap-1 border-b border-gray-300 relative pt-8">
                            {gioQuet.map((g) => {
                              const val = g.so_bd_tb || 0;
                              const hPct = val > 0 ? Math.max(6, Math.round((val / maxMau(gioQuet)) * 100)) : 0;

                              // Tìm lịch xe C2 rơi vào giờ này
                              const lichTrongGio = lichXe.filter((lx) => {
                                const h = parseInt(lx.xe_roi_ktt.slice(0, 2), 10);
                                return h === g.gio;
                              });

                              // Tìm giờ lập thực tế rơi vào giờ này
                              const thucTeTrongGio = thucTe.filter((tt) => {
                                if (!tt.gio_lap_tb) return false;
                                const h = parseInt(tt.gio_lap_tb.slice(0, 2), 10);
                                return h === g.gio;
                              });

                              const cotTip = `${g.gio} giờ: TB ${formatDecimal(g.so_bd_tb, 1)} bưu gửi/ngày (tổng ${formatInt(g.tong)} bưu gửi)`;

                              return (
                                <div
                                  key={g.gio}
                                  className="flex-1 min-w-0 h-full flex flex-col justify-end items-center relative"
                                >
                                  {/* Vạch lịch xe C2 (vùng bắt chuột rộng 12px, nhãn giờ ở đỉnh không bị cắt) */}
                                  {lichTrongGio.map((lx, lIdx) => {
                                    const is7Days = lx.chay_chu_nhat;
                                    const vachTip = `Xe rời KTT ${lx.xe_roi_ktt} · ${is7Days ? 'chạy 7 ngày/tuần' : 'chạy 6 ngày/tuần, nghỉ Chủ nhật'}`;

                                    return (
                                      <div
                                        key={lIdx}
                                        tabIndex={0}
                                        role="img"
                                        aria-label={vachTip}
                                        className="absolute top-0 bottom-0 w-3 -ml-[5px] z-20 cursor-pointer group/line focus:outline-none flex flex-col items-center"
                                      >
                                        {/* Nhãn giờ xuất phát xe C2 nằm trọn trong vùng đệm trên */}
                                        <span className="absolute top-0 text-[9px] font-bold text-gray-700 bg-white/95 px-0.5 rounded shadow-2xs pointer-events-none whitespace-nowrap">
                                          {lx.xe_roi_ktt}
                                        </span>
                                        <div
                                          className={`w-[2px] h-full mt-4 ${
                                            is7Days ? 'bg-[#1F7A5C]' : 'bg-[#B3202A]'
                                          }`}
                                        />
                                        <div className={`opacity-0 group-hover/line:opacity-100 group-focus/line:opacity-100 transition-opacity absolute bottom-full mb-1 z-50 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap ${
                                          g.gio <= 2 ? 'left-0' : (g.gio >= 20 ? 'right-0' : 'left-1/2 -translate-x-1/2')
                                        }`}>
                                          {vachTip}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Tam giác vàng giờ lập thực tế TB (SVG sắc nét, viền tối, vùng bắt chuột 24x24px, z-30 trên vạch) */}
                                  {thucTeTrongGio.map((tt, tIdx) => {
                                    const triTip = `Giờ lập BD10 thực tế trung bình ${tt.gio_lap_tb} (xe rời ${tt.xe_roi_ktt})`;

                                    return (
                                      <div
                                        key={tIdx}
                                        tabIndex={0}
                                        role="img"
                                        aria-label={triTip}
                                        className="absolute top-4 -translate-y-1/2 w-6 h-6 -ml-3 z-30 cursor-pointer group/tri focus:outline-none flex items-center justify-center"
                                      >
                                        <svg width="14" height="12" viewBox="0 0 14 12" className="drop-shadow-xs pointer-events-none">
                                          <polygon points="1,1 13,1 7,11" fill="#E0A82E" stroke="#8A6100" strokeWidth="1.2" strokeLinejoin="round" />
                                        </svg>
                                        <div className={`opacity-0 group-hover/tri:opacity-100 group-focus/tri:opacity-100 transition-opacity absolute bottom-full mb-1 z-50 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap ${
                                          g.gio <= 2 ? 'left-0' : (g.gio >= 20 ? 'right-0' : 'left-1/2 -translate-x-1/2')
                                        }`}>
                                          {triTip}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Cột số lượng hàng xám có tooltip */}
                                  <div
                                    tabIndex={0}
                                    role="img"
                                    aria-label={cotTip}
                                    style={{ height: `${hPct}%` }}
                                    className="w-full bg-gray-400 hover:bg-gray-600 rounded-t-[2px] transition-all cursor-pointer group/col relative z-10 focus:outline-none focus:ring-1 focus:ring-gray-700"
                                  >
                                    <div className={`opacity-0 group-hover/col:opacity-100 group-focus/col:opacity-100 transition-opacity absolute bottom-full mb-1 z-50 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap ${
                                      g.gio <= 2 ? 'left-0' : (g.gio >= 20 ? 'right-0' : 'left-1/2 -translate-x-1/2')
                                    }`}>
                                      {cotTip}
                                    </div>
                                  </div>

                                  {/* Nhãn giờ */}
                                  <span className="text-[8px] sm:text-[9px] text-gray-400 tabular-nums mt-1">
                                    {g.gio % 4 === 0 ? `${g.gio}h` : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Danh sách các chuyến C2 của BCVH */}
                    <div className="mt-3 pt-2 border-t border-[#E4D5AE]/60 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                      <span className="font-semibold text-gray-500">Chuyến C2:</span>
                      {lichXe.map((lx, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            lx.chay_chu_nhat
                              ? 'bg-emerald-50 text-[#1F7A5C] border border-emerald-200'
                              : 'bg-red-50 text-[#B3202A] border border-red-200'
                          }`}
                        >
                          <Truck className="w-2.5 h-2.5" />
                          <span>{lx.xe_roi_ktt}</span>
                          {!lx.chay_chu_nhat && <span>(nghỉ CN)</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chú giải chân B6 */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-gray-400" />
                  <span>Bưu gửi đến mỗi giờ (TB ngày)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-3 bg-[#1F7A5C]" />
                  <span>Vạch xanh: Xe C2 chạy 7 ngày/tuần</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-3 bg-[#B3202A]" />
                  <span>Vạch đỏ: Xe C2 chạy 6 ngày/tuần (nghỉ CN)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[#E0A82E] text-xs font-bold">▼</span>
                  <span>Tam giác vàng: Giờ lập BD10 thực tế trung bình</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper tìm max bưu gửi trong 24 giờ
function maxMau(gioQuet) {
  const max = Math.max(...gioQuet.map((x) => x.so_bd_tb || 0));
  return max > 0 ? max : 1;
}

/**
 * Component bảng con cho từng nhóm đường thư trong B5
 */
function BangDuongThuNhom({ tieuDe, moTa, data, huong, selectedCellFilter, onSelectCell }) {
  const dong = data?.dong || [];
  const cong = data?.cong;

  return (
    <div className="border border-gray-200 rounded-[10px] overflow-hidden min-w-0 max-w-full">
      <div className="bg-[#FAF5E8] px-4 py-2.5 border-b border-[#E4D5AE] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-xs sm:text-sm">{tieuDe}</h3>
          <p className="text-[11px] text-gray-500">{moTa}</p>
        </div>
        {cong && (
          <div className="text-xs text-gray-700">
            Tổng cộng mục: <strong className="tabular-nums font-bold text-gray-800">{formatInt(cong.tong_shbg)}</strong> bưu gửi
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-w-full">
        <table className="table-soft w-full min-w-[950px] text-left text-xs">
          <thead>
            <tr>
              <th>NƠI GỬI</th>
              <th>ĐƯỜNG THƯ ĐẾN</th>
              <th className="text-center">GIỜ NHẬN TB (SỚM – MUỘN)</th>
              <th className="text-right">BƯU GỬI</th>
              <th className="text-right">KHỐI LƯỢNG</th>
              <th className="w-40 text-center">TÌNH TRẠNG GIAO ĐI</th>
              <th className="text-right text-[#1F7A5C]">CÙNG NGÀY</th>
              <th className="text-right bg-purple-50/50 text-[#4A1D6E]">HÔM SAU</th>
              <th className="text-right bg-red-50/50 text-[#B3202A]">CHƯA ĐI &gt; 24H</th>
            </tr>
          </thead>
          <tbody>
            {dong.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 text-center text-gray-400 italic">
                  Không có đường thư trong mục này.
                </td>
              </tr>
            ) : (
              dong.map((r, idx) => {
                const mau = r.mau_so || 0;
                const c1 = r.cung_ngay || 0;
                const c2 = r.hom_sau || 0;
                const c3 = r.tu_2_ngay || 0;
                const c4 = r.chua_di_duoi_24h || 0;
                const c5 = r.chua_di_tren_24h || 0;
                const isHoan = r.hang_hoan;
                const isSelected = selectedCellFilter?.duongThu === r.duong_thu_ma && selectedCellFilter?.noiGui === r.noi_gui_ma;

                return (
                  <tr
                    key={`${r.noi_gui_ma}-${r.duong_thu_ma}-${idx}`}
                    className={`hover:bg-amber-50/40 transition-colors ${isSelected ? 'bg-amber-50/70 font-semibold' : ''}`}
                  >
                    <td className="text-gray-800 font-medium">
                      <div>{r.noi_gui_ten || '(chưa có tên)'}</div>
                      {r.noi_gui_ma && <div className="text-[10px] text-gray-400 font-mono">{r.noi_gui_ma}</div>}
                    </td>
                    <td className="text-gray-800">
                      <div className="flex items-center gap-1.5">
                        <span>{r.duong_thu_ten || '(chưa có tên)'}</span>
                        {isHoan && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FAF5E8] text-[#A87A12] border border-[#E4D5AE]">
                            Hoàn
                          </span>
                        )}
                      </div>
                      {r.duong_thu_ma && <div className="text-[10px] text-gray-400 font-mono">{r.duong_thu_ma}</div>}
                    </td>
                    <td className="text-center tabular-nums text-gray-600">
                      {r.gio_nhan_tb ? (
                        <span>
                          <strong className="text-gray-800">{r.gio_nhan_tb}</strong>
                          {r.gio_nhan_som_nhat && r.gio_nhan_muon_nhat && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              ({r.gio_nhan_som_nhat} – {r.gio_nhan_muon_nhat})
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right tabular-nums font-semibold text-gray-800">
                      {formatInt(r.tong_shbg)}
                    </td>
                    <td className="text-right tabular-nums text-gray-700">
                      {r.kg && r.kg > 0 ? formatKg(r.kg, { withUnit: true }) : '—'}
                    </td>

                    {/* Thanh 5 trạng thái xếp chồng mini có tooltip từng đoạn */}
                    <td className="px-2">
                      <div className="w-full h-3.5 rounded bg-gray-100 flex overflow-hidden">
                        {mau > 0 && (
                          <>
                            {c1 > 0 && (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={`Đi cùng ngày: ${formatInt(c1)} bưu gửi (${formatPercent(c1 / mau)})`}
                                style={{ width: `${(c1 / mau) * 100}%` }}
                                className="bg-[#1F7A5C] h-full group/p relative focus:outline-none"
                              >
                                <div className="opacity-0 group-hover/p:opacity-100 group-focus/p:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  Đi cùng ngày: {formatInt(c1)} bưu gửi ({formatPercent(c1 / mau)})
                                </div>
                              </div>
                            )}
                            {c2 > 0 && (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={`Hôm sau: ${formatInt(c2)} bưu gửi (${formatPercent(c2 / mau)})`}
                                style={{ width: `${(c2 / mau) * 100}%` }}
                                className="bg-[#B79BCB] h-full group/p relative focus:outline-none"
                              >
                                <div className="opacity-0 group-hover/p:opacity-100 group-focus/p:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  Hôm sau: {formatInt(c2)} bưu gửi ({formatPercent(c2 / mau)})
                                </div>
                              </div>
                            )}
                            {c3 > 0 && (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={`Từ 2 ngày: ${formatInt(c3)} bưu gửi (${formatPercent(c3 / mau)})`}
                                style={{ width: `${(c3 / mau) * 100}%` }}
                                className="bg-[#E0A82E] h-full group/p relative focus:outline-none"
                              >
                                <div className="opacity-0 group-hover/p:opacity-100 group-focus/p:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  Từ 2 ngày: {formatInt(c3)} bưu gửi ({formatPercent(c3 / mau)})
                                </div>
                              </div>
                            )}
                            {c4 > 0 && (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={`Chưa đi dưới 24 giờ: ${formatInt(c4)} bưu gửi (${formatPercent(c4 / mau)})`}
                                style={{ width: `${(c4 / mau) * 100}%` }}
                                className="bg-[#9CA3AF] h-full group/p relative focus:outline-none"
                              >
                                <div className="opacity-0 group-hover/p:opacity-100 group-focus/p:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  Chưa đi &lt; 24h: {formatInt(c4)} bưu gửi ({formatPercent(c4 / mau)})
                                </div>
                              </div>
                            )}
                            {c5 > 0 && (
                              <div
                                tabIndex={0}
                                role="img"
                                aria-label={`Chưa đi trên 24 giờ: ${formatInt(c5)} bưu gửi (${formatPercent(c5 / mau)})`}
                                style={{ width: `${(c5 / mau) * 100}%` }}
                                className="bg-[#B3202A] h-full group/p relative focus:outline-none"
                              >
                                <div className="opacity-0 group-hover/p:opacity-100 group-focus/p:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-md whitespace-nowrap">
                                  Chưa đi &gt; 24h: {formatInt(c5)} bưu gửi ({formatPercent(c5 / mau)})
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* % Cùng ngày */}
                    <td className="text-right tabular-nums font-bold text-[#1F7A5C]">
                      {formatPercent(r.ty_le?.cung_ngay)}
                    </td>

                    {/* % Hôm sau - BẤM ĐƯỢC kèm icon 3 gạch */}
                    <td className="text-right tabular-nums bg-purple-50/40">
                      <button
                        type="button"
                        onClick={() => onSelectCell({
                          duongThu: r.duong_thu_ma,
                          duongThuTen: r.duong_thu_ten,
                          noiGui: r.noi_gui_ma,
                          noiGuiTen: r.noi_gui_ten,
                          huong,
                          hangHoan: isHoan ? true : null,
                          initialLoai: 'hom-sau',
                          title: `${r.duong_thu_ten || r.duong_thu_ma} · Hôm sau`,
                        })}
                        className="font-bold text-[#4A1D6E] hover:underline cursor-pointer inline-flex items-center gap-1 py-0.5 px-1 rounded hover:bg-purple-100"
                        title="Xem danh sách bưu gửi hôm sau"
                      >
                        <ListFilter className="w-3 h-3 text-[#B79BCB]" />
                        <span>{formatPercent(r.ty_le?.hom_sau)}</span>
                      </button>
                    </td>

                    {/* % Chưa đi > 24h - BẤM ĐƯỢC kèm icon 3 gạch */}
                    <td className="text-right tabular-nums bg-red-50/40">
                      <button
                        type="button"
                        onClick={() => onSelectCell({
                          duongThu: r.duong_thu_ma,
                          duongThuTen: r.duong_thu_ten,
                          noiGui: r.noi_gui_ma,
                          noiGuiTen: r.noi_gui_ten,
                          huong,
                          hangHoan: isHoan ? true : null,
                          initialLoai: 'chua-di-24h',
                          title: `${r.duong_thu_ten || r.duong_thu_ma} · Chưa đi > 24h`,
                        })}
                        className="font-bold text-[#B3202A] hover:underline cursor-pointer inline-flex items-center gap-1 py-0.5 px-1 rounded hover:bg-red-100"
                        title="Xem danh sách bưu gửi chưa đi > 24 giờ"
                      >
                        <ListFilter className="w-3 h-3 text-[#B3202A]" />
                        <span>{formatPercent(r.ty_le?.chua_di_tren_24h)}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
