import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import KttNutXuat from './KttNutXuat';

/**
 * Khối «Đánh giá» của trang Đối chiếu (KTT-16-5 mục 3.5 & 3.6)
 * Nhận danh_gia qua props từ dữ liệu đối chiếu.
 */
export default function KttDoiChieuDanhGia({ danh_gia, danhGia, tu, den, maBcvh }) {
  const items = danh_gia || danhGia || [];

  return (
    <div className="space-y-4 pt-2 border-t border-gray-200">
      <div>
        <h2 className="text-base font-bold text-gray-900">
          Đánh giá đối chiếu
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Tổng hợp các nhận xét, cảnh báo và điểm cần lưu ý từ kết quả đối chiếu hàng với các BCVH.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-[14px] p-6 border border-gray-200 text-center text-xs text-gray-400 italic">
          Chưa có nhận xét cho khoảng đã chọn
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const loai = item.loai;
            const isCanhBao = loai === 'CANH_BAO';
            const isLuuY = loai === 'LUU_Y';
            // THONG_TIN hoặc loại khác

            // Định dạng viền trái và màu sắc theo loại
            let borderClass = 'border-l-4 border-l-[#7C3AED]';
            let badgeClass = 'bg-purple-50 text-purple-900 border-purple-200';
            let badgePrefix = 'THÔNG TIN';
            let IconComponent = Info;

            if (isCanhBao) {
              borderClass = 'border-l-4 border-l-[#B3202A]';
              badgeClass = 'bg-red-50 text-red-900 border-red-200';
              badgePrefix = 'CẢNH BÁO';
              IconComponent = AlertCircle;
            } else if (isLuuY) {
              borderClass = 'border-l-4 border-l-[#D97706]';
              badgeClass = 'bg-amber-50 text-amber-900 border-amber-200';
              badgePrefix = 'LƯU Ý';
              IconComponent = AlertTriangle;
            }

            return (
              <div
                key={item.ma || idx}
                className={`bg-white rounded-[12px] p-4 border border-gray-200 ${borderClass} shadow-none space-y-2.5 transition-colors`}
              >
                {/* Huy hiệu: LOẠI · tiêu đề */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-bold border ${badgeClass}`}>
                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {badgePrefix} · {item.tieu_de}
                    </span>
                  </span>
                </div>

                {/* Nội dung nguyên văn từ dữ liệu */}
                <p className="text-xs text-gray-700 leading-relaxed pl-0.5">
                  {item.noi_dung}
                </p>

                {/* Nút xuất cho mục có trường sheet trùng với sheet 3 (chuyen-tiep-chua-quet-di) */}
                {Number(item.sheet) === 3 && (
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-end">
                    <KttNutXuat
                      route="chuyen-tiep-chua-quet-di"
                      tu={tu}
                      den={den}
                      maBcvh={maBcvh}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

