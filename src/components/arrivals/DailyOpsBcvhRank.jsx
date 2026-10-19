import React from 'react';
import { AlertCircle, Award } from 'lucide-react';
import { formatPercent } from './DailyOpsDashboard';
import { SAN_XEP_HANG_BCVH, PTC_DAT } from '../../lib/thamSoDuPhong';

/**
 * Khối Bảng xếp hạng BCVH theo kết quả phát (PHAT-3c):
 * - xep_hang_bcvh = null (xem 1 BCVH): ẩn bảng, chỉ hiện thẻ. Không hiện hạng của BCVH khác.
 * - Cột: Hạng, BCVH, Bưu gửi đến, PTC, Không TC, Chuyển hoàn, Lạc hướng, Chưa có TT.
 * - Đồng hạng hiển thị cùng số hạng (1, 2, 2, 4).
 * - Hàng đầu nền xanh nhạt, hàng cuối nền đỏ nhạt như canvas.
 * - chua_du_du_lieu: chip «Chưa đủ dữ liệu» + lý do (chua_nhap -> «Chưa nhập»; duoi_san -> «Dưới 50 bưu gửi», lấy từ nguong). Không xếp hạng cuối.
 * - Không đủ BCVH để xếp hạng (< 2 BCVH đủ điều kiện): hiện Trạng thái E.
 * - Bảng chỉ để xem, không tương tác (không lọc theo dòng).
 * - Responsive: bảng cuộn ngang trong khối (overflow-x-auto), không làm tràn trang.
 */
export default function DailyOpsBcvhRank({ ketQuaPhat, phatError }) {
  // Lỗi 403 hoặc mạng
  if (phatError) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 sm:p-6 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Không thể tải bảng xếp hạng BCVH</span>
        </div>
        <p className="text-xs text-gray-500">{phatError}</p>
      </div>
    );
  }

  // Khi chưa có dữ liệu hoặc xep_hang_bcvh = null (xem 1 BCVH cụ thể -> Trạng thái B: ẩn bảng)
  if (!ketQuaPhat || ketQuaPhat.xep_hang_bcvh === null) {
    return null;
  }

  const xepHang = ketQuaPhat.xep_hang_bcvh || [];
  const chuaDu = ketQuaPhat.chua_du_du_lieu || [];
  const sanXepHang = ketQuaPhat?.nguong?.san_xep_hang_bcvh ?? SAN_XEP_HANG_BCVH;
  const nguongPtc = ketQuaPhat?.nguong?.ptc_dat ?? PTC_DAT;

  // Trạng thái E: Không đủ BCVH để xếp hạng (cần tối thiểu 2 BCVH đủ điều kiện)
  const isStateE = xepHang.length < 2;

  // Hạng lớn nhất trong bảng (hạng cuối)
  const maxHang = xepHang.length > 0 ? Math.max(...xepHang.map((r) => r.hang)) : 1;

  return (
    <div className="bg-white rounded-[14px] border border-gray-200 p-5 sm:p-6 shadow-none space-y-4">
      {/* TIÊU ĐỀ KHỐI */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-orange-600" />
            <h3 className="hue-h2">
              Xếp hạng BCVH theo kết quả phát
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Xếp hạng theo tỷ lệ phát thành công (PTC) trên tổng bưu gửi đến trong ngày.
          </p>
        </div>

        {xepHang.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              {xepHang.length} đơn vị xếp hạng
            </span>
            {chuaDu.length > 0 && (
              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                {chuaDu.length} chưa đủ dữ liệu
              </span>
            )}
          </div>
        )}
      </div>

      {/* TRẠNG THÁI E: KHÔNG ĐỦ BCVH ĐỂ XẾP HẠNG */}
      {isStateE ? (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Chưa đủ số lượng BCVH để xếp hạng</div>
              <div className="text-xs text-gray-500">
                Cần tối thiểu 2 BCVH có dữ liệu phát và đạt ngưỡng từ {sanXepHang} bưu gửi để xếp hạng. Hiện tại phần lớn các đơn vị chưa nhập hoặc dưới sàn bưu gửi.
              </div>
            </div>
          </div>

          {/* Nếu có đơn vị chưa đủ dữ liệu, liệt kê rõ ràng */}
          {chuaDu.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-cream-head px-4 py-2.5 text-xs font-bold text-gray-600 uppercase border-b border-gray-200">
                Danh sách BCVH chưa đủ dữ liệu xếp hạng
              </div>
              <div className="divide-y divide-cream-line">
                {chuaDu.map((row) => (
                  <div
                    key={row.bcvh}
                    className="p-3.5 flex items-center justify-between gap-3 bg-white"
                  >
                    <div>
                      <span className="font-bold text-sm text-orange-600">
                        {row.ten}
                      </span>
                      <span className="text-xs text-gray-400 ml-1.5">· {row.bcvh}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-gray-600">
                        {row.mau_so > 0 ? `${row.mau_so.toLocaleString('vi-VN')} bưu gửi` : '0 bưu gửi'}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-300">
                        {row.ly_do === 'chua_nhap' ? 'Chưa nhập' : `Dưới ${sanXepHang} bưu gửi`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* BẢNG XẾP HẠNG TIÊU CHUẨN (TRẠNG THÁI A / A2) */
        <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-none">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-cream-head text-gray-600 text-xs font-bold uppercase border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-center w-16">Hạng</th>
                <th className="px-4 py-3">BCVH</th>
                <th className="px-4 py-3 text-right">Bưu gửi đến</th>
                <th className="px-4 py-3 text-right">PTC</th>
                <th className="px-4 py-3 text-right">Không TC</th>
                <th className="px-4 py-3 text-right">Chuyển hoàn</th>
                <th className="px-4 py-3 text-right">Lạc hướng</th>
                <th className="px-4 py-3 text-right">Chưa có TT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-line">
              {/* 1. CÁC HÀNG ĐƯỢC XẾP HẠNG */}
              {xepHang.map((row) => {
                const isTop = row.hang === 1;
                const isBottom = !isTop && row.hang === maxHang;

                // Mọi dòng có hạng = 1: nền xanh nhạt; hạng lớn nhất (hạng cuối): nền đỏ nhạt
                let rowBgClass = 'bg-white';
                if (isTop) {
                  rowBgClass = 'bg-emerald-50/70';
                } else if (isBottom) {
                  rowBgClass = 'bg-rose-50/70';
                }

                return (
                  <tr
                    key={row.bcvh}
                    className={rowBgClass}
                  >
                    {/* Cột Hạng: đồng hạng cùng số hạng (1, 2, 2, 4) */}
                    <td className="px-4 py-3 text-center">
                      {isTop ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                          {row.hang}
                        </span>
                      ) : isBottom ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 text-rose-800 text-xs font-bold border border-rose-300">
                          {row.hang}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-gray-600">
                          {row.hang}
                        </span>
                      )}
                    </td>

                    {/* Cột BCVH */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-orange-600 flex items-center gap-1">
                        <span>{row.ten}</span>
                        <span className="text-xs font-normal text-gray-400">· {row.bcvh}</span>
                      </div>
                    </td>

                    {/* Cột Bưu gửi đến */}
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {row.mau_so?.toLocaleString('vi-VN')}
                    </td>

                    {/* Cột PTC */}
                    <td className="px-4 py-3 text-right tabular-nums font-bold">
                      <span className={row.ptc >= nguongPtc ? 'text-emerald-700' : 'text-amber-700'}>
                        {formatPercent(row.ptc)}
                      </span>
                    </td>

                    {/* Cột Không TC */}
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                      {row.theo_trang_thai?.PKTC?.ty_le !== undefined
                        ? formatPercent(row.theo_trang_thai.PKTC.ty_le)
                        : (row.pktc !== undefined ? formatPercent(row.pktc) : '—')}
                    </td>

                    {/* Cột Chuyển hoàn */}
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                      {row.theo_trang_thai?.CHUYEN_HOAN?.ty_le !== undefined
                        ? formatPercent(row.theo_trang_thai.CHUYEN_HOAN.ty_le)
                        : (row.chuyen_hoan !== undefined ? formatPercent(row.chuyen_hoan) : '—')}
                    </td>

                    {/* Cột Lạc hướng */}
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                      {row.theo_trang_thai?.LAC_HUONG?.ty_le !== undefined
                        ? formatPercent(row.theo_trang_thai.LAC_HUONG.ty_le)
                        : (row.lac_huong !== undefined ? formatPercent(row.lac_huong) : '—')}
                    </td>

                    {/* Cột Chưa có TT */}
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                      {row.theo_trang_thai?.CHUA_CO_TT?.ty_le !== undefined
                        ? formatPercent(row.theo_trang_thai.CHUA_CO_TT.ty_le)
                        : (row.chua_co_tt !== undefined ? formatPercent(row.chua_co_tt) : '—')}
                    </td>
                  </tr>
                );
              })}

              {/* 2. CÁC HÀNG CHƯA ĐỦ DỮ LIỆU (KHÔNG XẾP HẠNG CUỐI) */}
              {chuaDu.map((row) => (
                <tr
                  key={row.bcvh}
                  className="bg-gray-50/70 text-gray-500"
                >
                  <td className="px-4 py-3 text-center text-xs text-gray-400">—</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-700 flex items-center gap-1">
                      <span>{row.ten}</span>
                      <span className="text-xs font-normal text-gray-400">· {row.bcvh}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {row.mau_so > 0 ? row.mau_so.toLocaleString('vi-VN') : '0'}
                  </td>
                  <td className="px-4 py-3 text-right" colSpan={5}>
                    <div className="flex items-center justify-end">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-300">
                        Chưa đủ dữ liệu · {row.ly_do === 'chua_nhap' ? 'Chưa nhập' : `Dưới ${sanXepHang} bưu gửi`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-500 italic">
        Xếp hạng dựa trên tỷ lệ phát thành công (PTC) trên tổng bưu gửi đến trong ngày. Các đơn vị chưa nhập hoặc dưới sàn {sanXepHang} bưu gửi không xếp hạng cuối.
      </p>
    </div>
  );
}
