import React from 'react';
import { Lock, Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatGiaTriHienThi, formatMaQuyTac } from './thamSoFormat';

export default function ThamSoQuyTac({ items = [] }) {
  const quyTacItems = items.filter((item) => item.chi_doc || item.nhom === 'quy_tac');

  return (
    <div className="space-y-6">
      {/* Khung giải thích đầu màn */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 text-xs flex items-start gap-3 shadow-2xs">
        <Info className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-bold text-slate-900 text-sm">
            Quy tắc định nghĩa hệ thống (Chỉ đọc)
          </div>
          <div>
            Đây là các quy tắc định nghĩa, không phải ngưỡng điều hành linh hoạt. Các quy tắc này quyết định cách tính toán và phân loại dữ liệu trên toàn bộ hệ thống nên không thể chỉnh sửa trong phiên vận hành thông thường.
          </div>
        </div>
      </div>

      {/* Lưới 2 cột thẻ quy tắc */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quyTacItems.map((item) => {
          const isList = item.kieu === 'danh_sach';
          let listSummary = '';
          let listItems = [];

          if (isList && item.gia_tri) {
            if (Array.isArray(item.gia_tri)) {
              listSummary = `${item.gia_tri.length} mục`;
              listItems = item.gia_tri;
            } else if (typeof item.gia_tri === 'object') {
              const entries = Object.entries(item.gia_tri);
              listSummary = `${entries.length} khung/nhóm`;
              listItems = entries.map(([k, v]) => ({
                ma: k,
                ten: typeof v === 'object' ? (v.ten || v.nhan || JSON.stringify(v)) : String(v)
              }));
            }
          }

          return (
            <div
              key={item.khoa}
              className="card-soft p-5 rounded-2xl border border-gray-200 flex flex-col justify-between gap-4 bg-white hover:border-gray-300 transition-all shadow-2xs"
            >
              <div className="space-y-3">
                {/* Header thẻ: Tên + Chip Chỉ đọc + Mã khóa */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-[var(--color-title)] leading-snug">
                      {item.nhan}
                    </h3>
                    <div className="tabular-nums text-[11px] text-gray-400 mt-0.5">
                      {item.khoa}
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                    <Lock className="w-3 h-3 text-gray-500" />
                    <span>Chỉ đọc</span>
                  </span>
                </div>

                {/* Giá trị quy tắc */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1">
                    Giá trị quy định
                  </div>
                  {isList ? (
                    <div className="space-y-2">
                      <div className="text-sm font-bold text-slate-800">
                        {listSummary}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {listItems.map((entry, idx) => {
                          const code = typeof entry === 'object' && entry !== null
                            ? (entry.ma || entry.code || entry.ten || '')
                            : String(entry);
                          const label = formatMaQuyTac(code) || (typeof entry === 'object' ? (entry.nhan || entry.ten || code) : code);

                          return (
                            <span
                              key={idx}
                              className="inline-block px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 shadow-2xs"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-slate-900">
                      {formatGiaTriHienThi(item.gia_tri ?? item.mac_dinh, item.kieu, item.don_vi)}
                    </div>
                  )}
                </div>

                {/* Ý nghĩa / Mô tả */}
                <div className="text-xs text-[var(--color-body)] leading-relaxed">
                  {item.mo_ta}
                </div>

                {/* Ví dụ */}
                {item.vi_du && (
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1">
                    <span className="font-bold text-[11px] uppercase tracking-wide text-amber-800 block">
                      Ví dụ
                    </span>
                    <div>{item.vi_du}</div>
                  </div>
                )}
              </div>

              {/* Vì sao khóa (anh_huong) */}
              {item.anh_huong && (
                <div className="pt-3 border-t border-gray-100 text-[11px] text-gray-600 space-y-1">
                  <span className="font-bold text-gray-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Vì sao khóa?</span>
                  </span>
                  <div className="leading-relaxed text-gray-500">{item.anh_huong}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
