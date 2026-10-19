import React from 'react';
import {
  Lock,
  Pencil,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import {
  formatGiaTriHienThi,
  tachCauDau,
  formatUtcToVnDateTime
} from './thamSoFormat';
import ThamSoQuyTac from './ThamSoQuyTac';

// Hai cặp ràng buộc chéo cần nhóm thành thẻ theo Màn 4
const PAIRS_CONFIG = [
  {
    id: 'san_luong',
    khoa1: 'lech_san_luong_trong_ngay_pct',
    khoa2: 'lech_san_luong_xu_ly_ngay_pct',
    tieuDe: 'Ngưỡng lệch sản lượng đến: Cảnh báo trong ngày & Xử lý ngay'
  },
  {
    id: 'bd10',
    khoa1: 'bd10_chua_xnd_trong_ngay_pct',
    khoa2: 'bd10_chua_xnd_xu_ly_ngay_pct',
    tieuDe: 'Ngưỡng BD10 đến chưa xác nhận đến: Trong ngày & Xử lý ngay'
  }
];

export default function ThamSoList({
  nhomList = [],
  thamSoList = [],
  activeGroup,
  onSelectGroup,
  draftChanges = {},
  onEditParam,
  serverConstraintError = null
}) {
  // Lọc tham số theo nhóm đang chọn
  const paramsInGroup = thamSoList.filter((p) => p.nhom === activeGroup);

  // Nếu là nhóm quy tắc định nghĩa (chỉ đọc) -> render Màn 6
  if (activeGroup === 'quy_tac') {
    return (
      <div className="space-y-6">
        {/* Thanh tab nhóm */}
        {renderGroupTabs()}
        <ThamSoQuyTac items={paramsInGroup} />
      </div>
    );
  }

  // Tách các tham số thuộc cặp ràng buộc chéo (Màn 4) và các tham số thông thường
  const pairedKeys = PAIRS_CONFIG.flatMap((p) => [p.khoa1, p.khoa2]);
  const pairsToRender = PAIRS_CONFIG.map((cfg) => {
    const p1 = paramsInGroup.find((p) => p.khoa === cfg.khoa1);
    const p2 = paramsInGroup.find((p) => p.khoa === cfg.khoa2);
    if (!p1 || !p2) return null;
    return { ...cfg, param1: p1, param2: p2 };
  }).filter(Boolean);

  const regularParams = paramsInGroup.filter((p) => !pairedKeys.includes(p.khoa));

  function renderGroupTabs() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {nhomList
            .filter((n) => n.ma !== 'quy_tac')
            .map((nhom) => {
              const count = thamSoList.filter((p) => p.nhom === nhom.ma).length;
              const isActive = activeGroup === nhom.ma;
              return (
                <button
                  key={nhom.ma}
                  type="button"
                  onClick={() => onSelectGroup(nhom.ma)}
                  className={`min-h-[42px] px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 ${
                    isActive
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200'
                  }`}
                >
                  <span>{nhom.nhan}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Tab Quy tắc định nghĩa (chỉ đọc) ở bên phải, có icon khóa */}
        {nhomList.some((n) => n.ma === 'quy_tac') && (
          <div>
            {(() => {
              const qNhom = nhomList.find((n) => n.ma === 'quy_tac');
              const count = thamSoList.filter((p) => p.nhom === 'quy_tac').length;
              const isActive = activeGroup === 'quy_tac';
              return (
                <button
                  type="button"
                  onClick={() => onSelectGroup('quy_tac')}
                  className={`min-h-[42px] px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 ${
                    isActive
                      ? 'bg-gray-800 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <span>{qNhom.nhan}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── THANH TAB NHÓM ─────────────────────────────────────────────────── */}
      {renderGroupTabs()}

      {/* ── MÀN 4: CÁC CẶP RÀNG BUỘC CHÉO (DẢI MÀU XANH - VÀNG - ĐỎ) ──────── */}
      {pairsToRender.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-orange-500" />
            <span>Cặp ngưỡng liên quan (Ràng buộc chéo)</span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {pairsToRender.map((pair) => (
              <PairedConstraintCard
                key={pair.id}
                pair={pair}
                draftChanges={draftChanges}
                onEditParam={onEditParam}
                serverConstraintError={serverConstraintError}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── MÀN 1: BẢNG THAM SỐ THÔNG THƯỜNG ───────────────────────────────── */}
      <div className="card-soft rounded-[14px] overflow-hidden border border-gray-200 bg-white shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-cream-head border-b border-cream-line text-gray-600 font-bold uppercase text-[12px] tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3.5">Tham số</th>
                <th scope="col" className="px-4 py-3.5 w-36">Đang dùng</th>
                <th scope="col" className="px-4 py-3.5 w-32">Mặc định</th>
                <th scope="col" className="px-4 py-3.5 w-28 text-center">Trạng thái</th>
                <th scope="col" className="px-4 py-3.5 w-44">Sửa gần nhất</th>
                <th scope="col" className="px-5 py-3.5 w-24 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-line tabular-nums">
              {regularParams.length === 0 && pairsToRender.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    Không có tham số nào trong nhóm này
                  </td>
                </tr>
              ) : regularParams.length === 0 ? null : (
                regularParams.map((param) => {
                  const draft = draftChanges[param.khoa];
                  const hasDraft = draft !== undefined;
                  const currentValFormatted = formatGiaTriHienThi(param.gia_tri, param.kieu, param.don_vi);
                  const defaultValFormatted = formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi);
                  const draftValFormatted = hasDraft
                    ? formatGiaTriHienThi(draft.gia_tri, param.kieu, param.don_vi)
                    : null;

                  return (
                    <tr
                      key={param.khoa}
                      className={`hover:bg-gray-50/70 transition-colors ${
                        hasDraft ? 'bg-orange-50/30' : ''
                      }`}
                    >
                      {/* Tham số: Nhãn + Câu đầu mô tả + Khóa */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                            <span>{param.nhan}</span>
                            {hasDraft && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                Chưa lưu
                              </span>
                            )}
                          </div>
                          <p className="text-gray-500 text-xs leading-relaxed max-w-xl">
                            {tachCauDau(param.mo_ta)}
                          </p>
                          <div className="tabular-nums text-[11px] text-gray-400">
                            {param.khoa}
                          </div>
                        </div>
                      </td>

                      {/* Đang dùng */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {hasDraft ? (
                          <div className="space-y-0.5">
                            <span className="line-through text-gray-400 text-xs block">
                              {currentValFormatted}
                            </span>
                            <span className="font-bold text-orange-600 text-sm block">
                              {draftValFormatted}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-gray-900 text-sm">
                            {currentValFormatted}
                          </span>
                        )}
                      </td>

                      {/* Mặc định */}
                      <td className="px-4 py-4 whitespace-nowrap text-gray-600 font-medium">
                        {defaultValFormatted}
                      </td>

                      {/* Trạng thái: Đã chỉnh hoặc Mặc định */}
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        {!param.la_mac_dinh ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Đã chỉnh
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                            Mặc định
                          </span>
                        )}
                      </td>

                      {/* Sửa gần nhất: người + giờ VN; «Chưa ai chỉnh» nếu mặc định */}
                      <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">
                        {param.la_mac_dinh || !param.cap_nhat_luc ? (
                          <span className="text-gray-400 italic">Chưa ai chỉnh</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-gray-700">
                              {param.cap_nhat_boi || 'ADMIN'}
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span>{formatUtcToVnDateTime(param.cap_nhat_luc)}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Nút Chỉnh */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => onEditParam(param)}
                          className="px-3 py-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Chỉnh</span>
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
    </div>
  );
}

/**
 * Thẻ hiển thị Cặp Ràng Buộc Chéo (Màn 4) với Dải Màu 3 Mốc (Xanh - Vàng - Đỏ)
 */
function PairedConstraintCard({
  pair,
  draftChanges,
  onEditParam,
  serverConstraintError
}) {
  const { param1, param2, tieuDe } = pair;

  // Lấy giá trị có hiệu lực (ưu tiên draft nếu có)
  const draft1 = draftChanges[param1.khoa];
  const draft2 = draftChanges[param2.khoa];

  const val1 = draft1 !== undefined ? draft1.gia_tri : param1.gia_tri;
  const val2 = draft2 !== undefined ? draft2.gia_tri : param2.gia_tri;

  // Kiểm tra cục bộ: mức trong ngày phải nhỏ hơn mức xử lý ngay
  const hasLocalError = Number(val1) >= Number(val2);

  // Kiểm tra lỗi từ server có dính tới 2 khóa này không
  const isServerRelated =
    serverConstraintError &&
    (serverConstraintError.includes(param1.nhan) ||
      serverConstraintError.includes(param2.nhan) ||
      serverConstraintError.includes(param1.khoa) ||
      serverConstraintError.includes(param2.khoa) ||
      (pair.id === 'san_luong' && serverConstraintError.includes('lệch «Trong ngày»')) ||
      (pair.id === 'bd10' && serverConstraintError.includes('BD10 chưa XNĐ')));

  const rangBuocList = Array.from(
    new Set([...(param2.rang_buoc || []), ...(param1.rang_buoc || [])])
  );

  // Rút gọn tiêu đề cặp theo quy tắc tách tại ' → mức '
  const tieuDeCap = (() => {
    const SPLIT_KEY = ' → mức ';
    if (param1.nhan?.includes(SPLIT_KEY) && param2.nhan?.includes(SPLIT_KEY)) {
      const prefix = param1.nhan.split(SPLIT_KEY)[0];
      return `${prefix}: mốc «Trong ngày» / «Xử lý ngay»`;
    }
    return `${param1.nhan} và ${param2.nhan}`;
  })();

  const hasError = hasLocalError || isServerRelated;
  const errorMessage =
    (isServerRelated && serverConstraintError) ||
    (hasLocalError
      ? (rangBuocList[0] || `Yêu cầu: «${param1.nhan}» (${val1}%) phải nhỏ hơn «${param2.nhan}» (${val2}%)`)
      : null);

  return (
    <div
      className={`card-soft rounded-2xl p-5 border transition-all ${
        hasError
          ? 'border-2 border-red-500 bg-red-50/15 shadow-sm'
          : 'border-gray-200 bg-white shadow-2xs'
      }`}
    >
      {/* Tiêu đề cặp: rút gọn ngắn gọn và chuỗi ràng buộc từ API */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>{tieuDeCap}</span>
          </h3>
          {rangBuocList.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {rangBuocList.join('; ')}
            </p>
          )}
        </div>

        {hasError && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Vi phạm ràng buộc</span>
          </span>
        )}
      </div>

      {/* DẢI MÀU 3 MỐC KHÔNG GIẢ TỶ LỆ (3 KHỐI BẰNG NHAU HOẶC XÁM KHI VI PHẠM) */}
      <div className="my-5 p-4 rounded-xl bg-gray-50 border border-gray-200">
        {hasLocalError ? (
          <div className="h-7 w-full rounded-lg bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-bold text-gray-500 transition-none">
            Chưa hợp lệ
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Nhãn mốc tại ranh giới khối (không có 0% và 100%) */}
            <div className="relative h-4 text-[11px] font-semibold text-gray-500">
              <span className="absolute left-1/3 -translate-x-1/2 text-amber-800 font-bold whitespace-nowrap">
                Mốc 1: {val1}%
              </span>
              <span className="absolute left-2/3 -translate-x-1/2 text-red-700 font-bold whitespace-nowrap">
                Mốc 2: {val2}%
              </span>
            </div>

            {/* Thanh màu 3 khối bằng nhau */}
            <div className="h-7 w-full rounded-lg overflow-hidden flex shadow-2xs border border-gray-300 transition-none">
              <div
                className="flex-1 bg-emerald-500 flex items-center justify-center text-[11px] font-bold text-white px-2 transition-none"
                title={`Dưới ${val1}%: Bình thường`}
              >
                Bình thường (&lt; {val1}%)
              </div>
              <div
                className="flex-1 bg-amber-400 flex items-center justify-center text-[11px] font-bold text-amber-950 px-2 transition-none"
                title={`Từ ${val1}% đến ${val2}%: Trong ngày`}
              >
                Trong ngày ({val1}%–{val2}%)
              </div>
              <div
                className="flex-1 bg-red-500 flex items-center justify-center text-[11px] font-bold text-white px-2 transition-none"
                title={`Trên ${val2}%: Xử lý ngay`}
              >
                Xử lý ngay (&gt; {val2}%)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* THÔNG BÁO LỖI NẾU CÓ */}
      {hasError && errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* HAI THẺ THAM SỐ CON BÊN DƯỚI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ParamSubCard
          param={param1}
          draft={draft1}
          hasPairError={hasError}
          onEdit={() => onEditParam(param1)}
        />
        <ParamSubCard
          param={param2}
          draft={draft2}
          hasPairError={hasError}
          onEdit={() => onEditParam(param2)}
        />
      </div>
    </div>
  );
}

/**
 * Thẻ con cho một tham số bên trong cặp ràng buộc
 */
function ParamSubCard({ param, draft, hasPairError, onEdit }) {
  const hasDraft = draft !== undefined;
  const currentFormatted = formatGiaTriHienThi(param.gia_tri, param.kieu, param.don_vi);
  const defaultFormatted = formatGiaTriHienThi(param.mac_dinh, param.kieu, param.don_vi);
  const draftFormatted = hasDraft
    ? formatGiaTriHienThi(draft.gia_tri, param.kieu, param.don_vi)
    : null;

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        hasPairError
          ? 'border-red-300 bg-white'
          : hasDraft
          ? 'border-orange-300 bg-orange-50/20'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
            <span>{param.nhan}</span>
            {hasDraft && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                Chưa lưu
              </span>
            )}
          </div>
          <div className="tabular-nums text-[10px] text-gray-400">{param.khoa}</div>
          <p className="text-[11px] text-gray-500 leading-snug">
            {tachCauDau(param.mo_ta)}
          </p>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 px-3 py-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" />
          <span>Chỉnh</span>
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
        <div>
          <span className="text-gray-400 text-[11px] block">Đang dùng:</span>
          {hasDraft ? (
            <div className="flex items-center gap-1.5 font-bold">
              <span className="line-through text-gray-400">{currentFormatted}</span>
              <span className="text-orange-600">{draftFormatted}</span>
            </div>
          ) : (
            <span className="font-bold text-gray-900">{currentFormatted}</span>
          )}
        </div>

        <div className="text-right">
          <span className="text-gray-400 text-[11px] block">Mặc định:</span>
          <span className="font-medium text-gray-600">{defaultFormatted}</span>
        </div>

        <div className="text-right">
          <span className="text-gray-400 text-[11px] block">Trạng thái:</span>
          {!param.la_mac_dinh ? (
            <span className="inline-flex px-2 py-0.2 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
              Đã chỉnh
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.2 text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 rounded-full">
              Mặc định
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
