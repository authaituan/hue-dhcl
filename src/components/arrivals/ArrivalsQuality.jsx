import React from 'react';
import { Server, FileWarning, CheckCircle2, XCircle, Archive, FileText, PackageCheck } from 'lucide-react';

// PO ẩn 11/10/2026, xem SANLUONG-4c; thẻ cũ tính theo bưu gửi, gồm BD10 lập đi và không có BD10
const SHOW_LEGACY_KHONG_XND_BD10 = false;

export default function ArrivalsQuality({ data, isAdmin, summary, importStatus }) {
  const q = data.qualityMocs;
  const th = q.tong_hop;

  return (
    <div className="space-y-6 mt-6">
      {/* Thẻ chỉ số tổng hợp */}
      <div className={`grid grid-cols-1 ${SHOW_LEGACY_KHONG_XND_BD10 ? 'md:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-4`}>
        <div className="card-soft p-4 flex flex-col justify-center bg-emerald-50 border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-semibold uppercase">Đủ trạng thái (SHBG, BD8, BD10)</span>
          </div>
          <span className="text-2xl font-bold text-emerald-600 mt-1">{th.du_trang_thai.so_buu_gui.toLocaleString('vi-VN')}</span>
          <span className="text-xs text-emerald-400 mt-0.5">{th.du_trang_thai.ty_le.toLocaleString('vi-VN')}%</span>
        </div>
        {SHOW_LEGACY_KHONG_XND_BD10 && (
          <div className="card-soft p-4 flex flex-col justify-center bg-rose-50 border-l-4 border-rose-500">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-rose-500" />
              <span className="text-xs text-rose-600 font-semibold uppercase">Không XNĐ BD10</span>
            </div>
            <span className="text-2xl font-bold text-rose-600 mt-1">{th.khong_xnd_bd10.so_buu_gui.toLocaleString('vi-VN')}</span>
            <span className="text-xs text-rose-400 mt-0.5">{th.khong_xnd_bd10.ty_le.toLocaleString('vi-VN')}%</span>
          </div>
        )}
        <div className="card-soft p-4 flex flex-col justify-center bg-sky-50 border-l-4 border-sky-500">
          <div className="flex items-center gap-2 mb-1">
            <Archive className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-sky-600 font-semibold uppercase">Có XN túi</span>
          </div>
          <span className="text-2xl font-bold text-sky-600 mt-1">{th.co_xn_tui.so_buu_gui.toLocaleString('vi-VN')}</span>
          <span className="text-xs text-sky-400 mt-0.5">{th.co_xn_tui.ty_le.toLocaleString('vi-VN')}%</span>
        </div>
        <div className="card-soft p-4 flex flex-col justify-center bg-fuchsia-50 border-l-4 border-fuchsia-500">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-fuchsia-500" />
            <span className="text-xs text-fuchsia-600 font-semibold uppercase">Có XND BD10</span>
          </div>
          <span className="text-2xl font-bold text-fuchsia-600 mt-1">{th.co_xnd_bd10.so_buu_gui.toLocaleString('vi-VN')}</span>
          <span className="text-xs text-fuchsia-400 mt-0.5">{th.co_xnd_bd10.ty_le.toLocaleString('vi-VN')}%</span>
        </div>
        <div className="card-soft p-4 flex flex-col justify-center bg-blue-50 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-600 font-semibold uppercase">Có XN bưu gửi</span>
          </div>
          <span className="text-2xl font-bold text-blue-600 mt-1">{th.co_xn_bg.so_buu_gui.toLocaleString('vi-VN')}</span>
          <span className="text-xs text-blue-400 mt-0.5">{th.co_xn_bg.ty_le.toLocaleString('vi-VN')}%</span>
        </div>
      </div>

      <div className="card-soft">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-[var(--color-title)]">Chi tiết các tổ hợp mốc xác nhận</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-center">Xác nhận túi</th>
                <th className="px-4 py-3 text-center">Xác nhận đến BD10</th>
                <th className="px-4 py-3 text-center">Xác nhận bưu gửi</th>
                <th className="px-4 py-3 text-right">Số bưu gửi</th>
                <th className="px-4 py-3 text-right">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody>
              {q.to_hop.map((t, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center">{t.bag ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-center">{t.bd10 ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-center">{t.item ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-right font-medium">{t.so_buu_gui.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 text-right">{t.ty_le.toLocaleString('vi-VN')}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-gray-50 text-xs text-gray-500 italic border-t border-gray-200">
          Ghi chú: Có <span className="font-bold text-orange-600">{q.khong_co_moc.toLocaleString('vi-VN')}</span> bưu gửi chưa có mốc nào (chưa xác định ngày đến). Số này KHÔNG được tính vào tổng sản lượng đến trong khoảng.
        </div>
      </div>

      {isAdmin && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          {summary.canh_bao?.so_moc_theo_dong && (
            <div className="card-soft border border-gray-200">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Server className="w-4 h-4 text-[#7a5200]" />
                <h3 className="font-bold text-[#0f2747]">
                  Chất lượng dữ liệu
                  <span className="text-[12px] font-semibold text-[#7a5200] bg-[#fff4d6] rounded-full px-2 py-0.5 ml-2">Chỉ ADMIN</span>
                </h3>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-3">Sản lượng bưu gửi đủ 3 trạng thái thời gian</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">3 trạng thái thời gian XN:</span>
                    <span className="font-bold">{summary.canh_bao.so_moc_theo_dong['3']?.toLocaleString('vi-VN') || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">2 trạng thái thời gian XN:</span>
                    <span className="font-bold">{summary.canh_bao.so_moc_theo_dong['2']?.toLocaleString('vi-VN') || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">1 trạng thái thời gian XN:</span>
                    <span className="font-bold">{summary.canh_bao.so_moc_theo_dong['1']?.toLocaleString('vi-VN') || 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600">
                    <span className="text-sm font-medium">Không có trạng thái thời gian XN:</span>
                    <span className="font-bold">{summary.canh_bao.so_moc_theo_dong['0']?.toLocaleString('vi-VN') || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card-soft border border-gray-200">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-gray-500" />
              <h3 className="font-bold text-[#0f2747]">Cảnh báo</h3>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span>Chưa xác định ngày đến (không có mốc nào)</span>
                <strong>{summary.canh_bao?.chua_xac_dinh_ngay_den?.toLocaleString('vi-VN') || 0}</strong>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span>Mốc XND BD10 sớm bất thường (chỉ cảnh báo, không sửa)</span>
                <strong>{summary.canh_bao?.moc_bd10_som?.toLocaleString('vi-VN') || 0}</strong>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span>Bưu gửi đến lại trong khoảng lọc (đếm một lần)</span>
                <strong>{summary.canh_bao?.den_lai_trong_khoang?.toLocaleString('vi-VN') || 0}</strong>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span>Ngày thiếu đợt trong khoảng đã chọn</span>
                <strong>{importStatus?.missing_batches?.length || 0}</strong>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span>File bị từ chối hoặc trùng tên khác nội dung</span>
                <strong>{importStatus?.problems?.length || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
