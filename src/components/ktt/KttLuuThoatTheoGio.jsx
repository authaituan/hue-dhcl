import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, Clock, Eye, AlertTriangle } from 'lucide-react';
import { BCVH_LIST } from '../../constants/bcvh';
import { formatInt, formatPercent } from '../quythoigian/quyThoiGianFormatters';
import { formatKg, formatDecimal } from './kttFormatters';
import { fetchKttKhongDat14h, fetchKttBucTranhCum, fetchKttBucTranhChuyenXe } from './kttApi';

export default function KttLuuThoatTheoGio({
  dateRange,
  selectedBcvh,
  mocChiTieu,
  cumData: externalCumData,
  chuyenData: externalChuyenData,
  khongDatData: externalKhongDatData,
  moc: externalMoc,
  unit: externalUnit,
  onSelectDuongThu,
}) {
  const [moc, setMoc] = useState(externalMoc || 'A');
  const [unit, setUnit] = useState(externalUnit || 'shbg'); // 'shbg' | 'kg'
  const [selectedHour, setSelectedHour] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [internalKdData, setInternalKdData] = useState(null);
  const [internalCumData, setInternalCumData] = useState(null);
  const [internalChuyenData, setInternalChuyenData] = useState(null);

  // Đồng bộ mốc từ ngoài
  useEffect(() => {
    if (externalMoc) {
      setMoc(externalMoc);
    } else if (mocChiTieu === 'quet_tui_den') {
      setMoc('B');
    } else {
      setMoc('A');
    }
  }, [externalMoc, mocChiTieu]);

  // Đồng bộ unit từ ngoài
  useEffect(() => {
    if (externalUnit) {
      setUnit(externalUnit);
    }
  }, [externalUnit]);

  // Tải dữ liệu nội bộ nếu không nhận props dữ liệu từ ngoài
  const loadData = useCallback(async () => {
    if (externalKhongDatData && externalCumData && externalChuyenData) return;
    if (!dateRange?.from || !dateRange?.to) return;

    setLoading(true);
    setError(null);

    const params = {
      tu: dateRange.from,
      den: dateRange.to,
      moc,
      ma_bcvh: selectedBcvh !== 'all' ? selectedBcvh : undefined,
    };

    try {
      const [resKd, resCum, resChuyen] = await Promise.all([
        fetchKttKhongDat14h(params),
        fetchKttBucTranhCum({ tu: dateRange.from, den: dateRange.to, moc }),
        fetchKttBucTranhChuyenXe({ tu: dateRange.from, den: dateRange.to, moc }),
      ]);

      if (resKd.ok) setInternalKdData(resKd.data);
      if (resCum.ok) setInternalCumData(resCum.data);
      if (resChuyen.ok) setInternalChuyenData(resChuyen.data);

      if (!resKd.ok && !resCum.ok) {
        setError(resKd.error || resCum.error || 'Lỗi tải dữ liệu theo giờ');
      }
    } catch (err) {
      setError('Lỗi kết nối khi tải thời gian lưu thoát theo giờ.');
    } finally {
      setLoading(false);
    }
  }, [externalKhongDatData, externalCumData, externalChuyenData, dateRange, moc, selectedBcvh]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeKdData = externalKhongDatData || internalKdData;
  const activeCumData = externalCumData || internalCumData;
  const activeChuyenData = externalChuyenData || internalChuyenData;

  // Lấy danh sách 24 giờ
  const gioList = useMemo(() => {
    const rawList = activeKdData?.du_dia_theo_gio || [];
    const hours = Array.from({ length: 24 }, (_, i) => ({
      gio: i,
      shbg: 0,
      kg: 0,
      thieuKg: 0,
      cachGioChotTb: null,
      luuThoatLichTb: null,
      conLaiChiTieuTb: null,
      satGioShbg: 0,
      records: [],
    }));

    for (const r of rawList) {
      const h = r.gio;
      if (h >= 0 && h < 24) {
        hours[h].shbg += r.shbg || 0;
        hours[h].kg += r.kg || 0;
        hours[h].thieuKg += r.shbg_thieu_kg || 0;
        hours[h].satGioShbg += r.sat_gio?.['60'] || 0;
        hours[h].records.push(r);
      }
    }

    // Tính trung bình theo giờ
    for (const h of hours) {
      if (h.records.length > 0 && h.shbg > 0) {
        let tongCachChot = 0;
        let tongLuuThoat = 0;
        let tongConLai = 0;
        let demCach = 0;
        let demLuu = 0;
        let demCon = 0;

        for (const rec of h.records) {
          // Trường backend: bien_an_toan_phut -> Hiển thị nhãn là "Cách giờ chốt chuyến"
          if (rec.bien_an_toan_phut?.tb !== null && rec.bien_an_toan_phut?.tb !== undefined) {
            tongCachChot += rec.bien_an_toan_phut.tb * rec.shbg;
            demCach += rec.shbg;
          }
          // Trường backend: cho_theo_lich_gio -> Hiển thị nhãn là "Thời gian lưu thoát theo lịch"
          if (rec.cho_theo_lich_gio?.tb !== null && rec.cho_theo_lich_gio?.tb !== undefined) {
            tongLuuThoat += rec.cho_theo_lich_gio.tb * rec.shbg;
            demLuu += rec.shbg;
          }
          // Trường backend: du_dia_gio -> Hiển thị nhãn là "Còn lại so với chỉ tiêu"
          if (rec.du_dia_gio?.min !== null && rec.du_dia_gio?.min !== undefined) {
            tongConLai += rec.du_dia_gio.min * rec.shbg;
            demCon += rec.shbg;
          }
        }

        h.cachGioChotTb = demCach > 0 ? tongCachChot / demCach : null;
        h.luuThoatLichTb = demLuu > 0 ? tongLuuThoat / demLuu : null;
        h.conLaiChiTieuTb = demCon > 0 ? tongConLai / demCon : null;
      }
    }

    return hours;
  }, [activeKdData]);

  // Max sản lượng để scale biểu đồ cột
  const maxShbg = useMemo(() => {
    const vals = gioList.map((g) => (unit === 'kg' ? g.kg : g.shbg));
    return Math.max(1, ...vals);
  }, [gioList, unit]);

  // Tự động mở sẵn giờ có nhiều bưu gửi nhất (hoặc không mở nếu toàn bộ bằng 0)
  useEffect(() => {
    if (!gioList || gioList.length === 0) return;
    const maxHourObj = gioList.reduce((max, curr) => {
      const currVal = unit === 'kg' ? curr.kg : curr.shbg;
      const maxVal = unit === 'kg' ? max.kg : max.shbg;
      return currVal > maxVal ? curr : max;
    }, gioList[0]);

    if (maxHourObj && (unit === 'kg' ? maxHourObj.kg > 0 : maxHourObj.shbg > 0)) {
      setSelectedHour(maxHourObj.gio);
    }
  }, [gioList, unit]);

  // Lọc danh sách chuyến thư đến cần chú ý từ cumData và chuyenData
  const chuYList = useMemo(() => {
    const cumMoc = activeCumData?.theo_moc?.[moc]?.cum || [];
    const chuyenMoc = activeChuyenData?.theo_moc?.[moc]?.chuyen || [];

    const items = [];

    // Chuyến thư đến có cờ
    for (const cum of cumMoc) {
      const co = cum.co || {};
      const isChuY = co.that_thuong || co.khong_co_lich_co_dinh || co.nhieu_kien_di_ngoai;
      if (isChuY) {
        items.push({
          id: cum.id,
          loai: 'cum',
          ten: cum.ten || cum.duong_thu?.ten || cum.duong_thu?.ma,
          maDuongThu: cum.duong_thu?.ma,
          khungGio: `${cum.bang_gio?.tu} – ${cum.bang_gio?.den}`,
          shbg: cum.shbg,
          kg: cum.kg,
          lyDo: [
            co.that_thuong ? 'Mức dao động sản lượng ngày cao (thất thường)' : null,
            co.khong_co_lich_co_dinh ? 'Khung giờ đến phân tán (không có lịch cố định)' : null,
            co.nhieu_kien_di_ngoai ? 'Tỷ lệ kiện đi ngoài lớn' : null,
          ].filter(Boolean).join('; '),
          muc: 'luu_y',
        });
      }
    }

    // Chuyến xe cấp 2 có sát giờ chốt chuyến hoặc gom nhiều hàng
    for (const ch of chuyenMoc) {
      const isSatChot = ch.sat_gio_chot?.ty_le > 0.2;
      const isGom = ch.co?.chuyen_gom_nhieu_hang;
      const conLai = ch.con_lai?.trung_vi_gio;
      const isQuaChiTieu = conLai !== null && conLai < 0;

      if (isSatChot || isGom || isQuaChiTieu) {
        const bcvhObj = BCVH_LIST.find((b) => b.ma === ch.ma_bcvh);
        items.push({
          id: `${ch.ma_bcvh}-${ch.gio_xuat_phat}`,
          loai: 'chuyen',
          ten: `${bcvhObj ? bcvhObj.ten : ch.ma_bcvh} · Chuyến ${ch.gio_xuat_phat}`,
          khungGio: `Xe rời ${ch.gio_xuat_phat} (giờ chốt chuyến ${ch.gio_chot})`,
          shbg: ch.shbg,
          kg: ch.kg,
          lyDo: [
            isSatChot ? `Nhiều bưu gửi sát giờ chốt chuyến (${formatPercent(ch.sat_gio_chot.ty_le)})` : null,
            isGom ? 'Chuyến gom nhiều hàng' : null,
            isQuaChiTieu ? `Quá chỉ tiêu ${formatDecimal(Math.abs(conLai), 1)} giờ` : null,
          ].filter(Boolean).join('; '),
          muc: isQuaChiTieu ? 'canh_bao' : isSatChot ? 'theo_doi' : 'luu_y',
        });
      }
    }

    return items;
  }, [activeCumData, activeChuyenData, moc]);

  // Tạo tọa độ cho đường cong SVG thời gian lưu thoát theo lịch (thang 0 đến 16 giờ)
  const curvePoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < 24; i++) {
      const g = gioList[i];
      if (g.luuThoatLichTb !== null) {
        const x = (i + 0.5) * (1000 / 24);
        const y = 180 - Math.min(16, Math.max(0, g.luuThoatLichTb)) * (160 / 16);
        points.push({ x, y, gio: i, val: g.luuThoatLichTb });
      }
    }
    return points;
  }, [gioList]);

  return (
    <div className="bg-white rounded-[14px] p-5 border border-gray-200 mt-6 space-y-6 shadow-sm">
      {/* ── HEADER KHỐI ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-bold text-gray-900 tracking-tight">
              Thời gian lưu thoát theo giờ hàng đến
            </h2>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              Đường cong lưu thoát & dải cách giờ chốt chuyến
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Đánh giá mối quan hệ giữa giờ hàng đến, khoảng cách tới giờ chốt chuyến và thời gian lưu thoát theo lịch
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Nút chuyển mốc */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setMoc('A')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                moc === 'A'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mốc A
            </button>
            <button
              type="button"
              onClick={() => setMoc('B')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                moc === 'B'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mốc B
            </button>
          </div>

          {/* Nút chuyển đơn vị */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setUnit('shbg')}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                unit === 'shbg'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Bưu gửi
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                unit === 'kg'
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Khối lượng (kg)
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-500">
          <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent mb-2" />
          <p className="text-xs">Đang tải phân tích theo giờ hàng đến...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── 1. BIỂU ĐỒ 24 KHUNG GIỜ: CỘT SẢN LƯỢNG & ĐƯỜNG CONG LƯU THOÁT ── */}
          <div className="bg-[#F8FAFC] border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Đường cong lưu thoát theo lịch và cột sản lượng theo giờ (24 giờ)
                </h3>
              </div>
              <span className="text-[11px] text-gray-500 font-normal">
                Nhấp vào cột giờ để xem chi tiết
              </span>
            </div>

            {/* Khung chứa biểu đồ với 2 trục: Trái = Sản lượng, Phải = Thời gian lưu thoát */}
            <div className="overflow-x-auto pt-2">
              <div className="min-w-[880px] flex gap-2">
                {/* Trục tung bên trái: Sản lượng */}
                <div className="w-12 h-56 flex flex-col justify-between items-end pr-1 text-[10px] text-gray-400 font-mono select-none">
                  <span>{unit === 'kg' ? `${formatDecimal(maxShbg, 0)}k` : formatInt(maxShbg)}</span>
                  <span>{unit === 'kg' ? `${formatDecimal(maxShbg / 2, 0)}k` : formatInt(Math.round(maxShbg / 2))}</span>
                  <span>0</span>
                  <div className="h-5" />
                </div>

                {/* Vùng biểu đồ chính */}
                <div className="flex-1 relative h-56 flex flex-col justify-between">
                  {/* Đường kẻ ngang lưới nền */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                    <div className="border-b border-gray-200 w-full" />
                    <div className="border-b border-gray-200 w-full" />
                    <div className="border-b border-gray-200 w-full" />
                  </div>

                  {/* SVG overlay: Đường cong thời gian lưu thoát theo lịch & Vạch chỉ tiêu 14 giờ */}
                  <svg
                    viewBox="0 0 1000 200"
                    preserveAspectRatio="none"
                    className="absolute inset-x-0 top-0 h-48 w-full pointer-events-none z-20"
                  >
                    {/* Vạch chỉ tiêu 14 giờ: nét đứt đỏ */}
                    {/* y = 180 - (14 / 16) * 160 = 40 */}
                    <line
                      x1="0"
                      y1="40"
                      x2="1000"
                      y2="40"
                      stroke="#EF4444"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                    <text x="12" y="34" fill="#DC2626" fontSize="11" fontWeight="bold">
                      Chỉ tiêu 14 giờ
                    </text>

                    {/* Đường cong lưu thoát theo lịch (polyline) */}
                    {curvePoints.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#4F46E5"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={curvePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      />
                    )}

                    {/* Chấm tròn tại các điểm giờ */}
                    {curvePoints.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill="#4338CA"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                    ))}
                  </svg>

                  {/* Các cột sản lượng */}
                  <div className="flex-1 flex items-end justify-between gap-1 z-10 px-1 pb-1">
                    {gioList.map((g) => {
                      const val = unit === 'kg' ? g.kg : g.shbg;
                      const barHeightPct = maxShbg > 0 ? Math.min(100, Math.max(3, (val / maxShbg) * 78)) : 3;
                      const isSelected = selectedHour === g.gio;
                      const isSatchot = g.cachGioChotTb !== null && g.cachGioChotTb < 60;
                      const isQuaChiTieu = g.conLaiChiTieuTb !== null && g.conLaiChiTieuTb < 0;

                      return (
                        <div
                          key={g.gio}
                          onClick={() => setSelectedHour(isSelected ? null : g.gio)}
                          className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                        >
                          {/* Số sản lượng hiển thị cố định nếu có hàng */}
                          <div
                            className={`text-[9px] tabular-nums font-semibold mb-1 select-none transition-all ${
                              isSelected
                                ? 'text-blue-900 font-bold scale-110'
                                : val > 0
                                ? 'text-gray-600'
                                : 'text-transparent'
                            }`}
                          >
                            {val > 0 ? (unit === 'kg' ? `${formatDecimal(val, 0)}` : formatInt(val)) : ''}
                          </div>

                          {/* Cột sản lượng */}
                          <div
                            className={`w-full max-w-[26px] rounded-t transition-all ${
                              isSelected
                                ? 'bg-blue-700 ring-2 ring-blue-400'
                                : isQuaChiTieu
                                ? 'bg-red-400 hover:bg-red-500'
                                : isSatchot
                                ? 'bg-purple-400 hover:bg-purple-500'
                                : val > 0
                                ? 'bg-blue-400/80 hover:bg-blue-500'
                                : 'bg-gray-200/40'
                            }`}
                            style={{ height: `${barHeightPct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Trục hoành: Nhãn 24 giờ */}
                  <div className="flex justify-between border-t border-gray-300 pt-1.5 px-1 text-[10px] text-gray-500 font-mono">
                    {gioList.map((g) => (
                      <span
                        key={g.gio}
                        className={`text-center flex-1 ${
                          selectedHour === g.gio ? 'font-bold text-blue-700' : ''
                        }`}
                      >
                        {String(g.gio).padStart(2, '0')}h
                      </span>
                    ))}
                  </div>
                </div>

                {/* Trục tung bên phải: Giờ lưu thoát theo lịch */}
                <div className="w-12 h-56 flex flex-col justify-between items-start pl-1 text-[10px] text-indigo-700 font-mono select-none">
                  <span>16h</span>
                  <span className="text-red-600 font-bold">14h</span>
                  <span>8h</span>
                  <span>0h</span>
                  <div className="h-5" />
                </div>
              </div>
            </div>

            {/* Chú giải cố định cho biểu đồ (không dựa vào tooltip) */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-600 pt-2 border-t border-gray-200">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-400 inline-block" /> Cột sản lượng theo giờ hàng đến (trục trái)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-indigo-600 inline-block" /> Đường cong lưu thoát theo lịch (trục phải, giờ)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-b border-dashed border-red-500 inline-block" /> Vạch chỉ tiêu 14 giờ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-400 inline-block" /> Dải cách giờ chốt chuyến dưới 60 phút (mức THEO DÕI)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-400 inline-block" /> Khung giờ có khả năng quá chỉ tiêu
              </span>
              <span className="ml-auto text-gray-400 text-[10px]">
                Giờ chốt chuyến = giờ xe rời − 60 phút
              </span>
            </div>

            {/* Thẻ chi tiết khi nhấp chọn 1 giờ (mở sẵn giờ nhiều hàng nhất) */}
            {selectedHour !== null && (
              <div className="mt-3 p-3.5 bg-white border border-blue-200 rounded-xl text-xs space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-900 text-sm">
                      Chi tiết khung giờ hàng đến: {String(selectedHour).padStart(2, '0')}:00 – {String(selectedHour).padStart(2, '0')}:59
                    </span>
                    <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-medium">
                      Chỉ tiêu áp dụng: 14 giờ (12 giờ đối với phường 49135, 49133)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedHour(null)}
                    className="text-gray-400 hover:text-gray-600 text-xs font-semibold px-1"
                  >
                    Đóng
                  </button>
                </div>

                {(() => {
                  const hObj = gioList[selectedHour];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-gray-700">
                      <div>
                        <span className="text-gray-400 block text-[11px]">Sản lượng đến:</span>
                        <strong className="text-gray-900 font-semibold text-sm">
                          {unit === 'kg' ? formatKg(hObj.kg, { withUnit: true }) : `${formatInt(hObj.shbg)} bưu gửi`}
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">Cách giờ chốt chuyến TB:</span>
                        <strong className="text-gray-900 font-semibold text-sm">
                          {hObj.cachGioChotTb !== null ? `${formatDecimal(hObj.cachGioChotTb, 0)} phút` : 'chưa đủ số liệu'}
                        </strong>
                        {hObj.satGioShbg > 0 && (
                          <div className="text-[10px] text-purple-700 font-normal">
                            ({formatInt(hObj.satGioShbg)} bg sát giờ chốt)
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">Thời gian lưu thoát theo lịch TB:</span>
                        <strong className="text-indigo-900 font-semibold text-sm">
                          {hObj.luuThoatLichTb !== null ? `${formatDecimal(hObj.luuThoatLichTb, 1)} giờ` : 'chưa đủ số liệu'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">Còn lại so với chỉ tiêu:</span>
                        {hObj.conLaiChiTieuTb !== null ? (
                          hObj.conLaiChiTieuTb < 0 ? (
                            <div>
                              <strong className="text-red-600 font-bold text-sm block">
                                quá chỉ tiêu {formatDecimal(Math.abs(hObj.conLaiChiTieuTb), 1)} giờ
                              </strong>
                              <span className="text-[10px] text-red-600">
                                (tính theo chỉ tiêu của từng bưu gửi: 14 giờ, riêng phường 49135 và 49133 là 12 giờ)
                              </span>
                            </div>
                          ) : (
                            <div>
                              <strong className="text-[#1F7A5C] font-bold text-sm block">
                                còn {formatDecimal(hObj.conLaiChiTieuTb, 1)} giờ
                              </strong>
                              <span className="text-[10px] text-gray-500">
                                (tính theo chỉ tiêu của từng bưu gửi: 14 giờ, riêng phường 49135 và 49133 là 12 giờ)
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="text-gray-400">chưa đủ số liệu</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── 2. BẢNG CHUYẾN THƯ ĐẾN CẦN CHÚ Ý ────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Bảng chuyến thư đến cần chú ý
                </h3>
              </div>
              <span className="text-xs text-gray-500 font-normal">
                Lọc các chuyến có dấu hiệu bất thường, sát giờ chốt chuyến hoặc nguy cơ quá chỉ tiêu
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="table-soft w-full min-w-[800px] text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                    <th className="py-2.5 px-3">Đối tượng chú ý</th>
                    <th className="py-2.5 px-2">Khung thời gian</th>
                    <th className="py-2.5 px-2 text-right">Sản lượng</th>
                    <th className="py-2.5 px-2">Mức độ</th>
                    <th className="py-2.5 px-3">Lý do cần chú ý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chuYList.map((item, idx) => (
                    <tr
                      key={`${item.id}-${idx}`}
                      onClick={() => item.maDuongThu && onSelectDuongThu && onSelectDuongThu(item.maDuongThu)}
                      className={`hover:bg-[#FFFBEF] transition-colors ${
                        item.maDuongThu ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {item.ten}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-gray-700 font-medium">
                        {item.khungGio}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-gray-900">
                        {unit === 'kg' && item.kg !== null && item.kg !== undefined
                          ? formatKg(item.kg, { withUnit: true })
                          : `${formatInt(item.shbg)} bưu gửi`}
                      </td>
                      <td className="py-2.5 px-2">
                        {item.muc === 'canh_bao' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200">
                            CẢNH BÁO
                          </span>
                        )}
                        {item.muc === 'luu_y' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            LƯU Ý
                          </span>
                        )}
                        {item.muc === 'theo_doi' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                            THEO DÕI
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {item.lyDo}
                      </td>
                    </tr>
                  ))}

                  {chuYList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-400 italic">
                        Không có chuyến thư đến nào trong danh sách cần chú ý đặc biệt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
