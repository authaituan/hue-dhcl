import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { apiFetchJson } from '../../utils/api';
import { getVnTodayYmd, addDaysYmd } from '../../utils/sourceIngest';

export default function IngestAttentionBanner({ isAdmin, onNavigateNapNguon }) {
  const [attentionCount, setAttentionCount] = useState(0);
  const [daXemXetCount, setDaXemXetCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;

    async function checkAttention() {
      try {
        const todayStr = getVnTodayYmd();
        const sixDaysAgo = addDaysYmd(todayStr, -6);
        const res = await apiFetchJson(
          `/api/nap-nguon/luoi?tu=${sixDaysAgo}&den=${todayStr}`
        );
        if (!isMounted) return;
        if (res.ok) {
          const canXuLy = Array.isArray(res.data?.can_xu_ly) ? res.data.can_xu_ly : [];
          // Đếm mục can_xu_ly trừ NGUON_CHUA_CO_FILE
          const count = canXuLy.filter(
            (item) => item && typeof item === 'object' && item.trang_thai !== 'NGUON_CHUA_CO_FILE'
          ).length;
          setAttentionCount(count);

          const rawM = res.data?.tong_hop?.da_xem_xet;
          const mCount = (typeof rawM === 'number' && !isNaN(rawM) && rawM > 0) ? rawM : 0;
          setDaXemXetCount(mCount);
        }
      } catch (e) {
        // Lỗi gọi API thì không hiện gì
      }
    }

    checkAttention();
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  if (!isAdmin || attentionCount <= 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-3 px-4 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between text-sm shadow-2xs animate-in fade-in duration-150">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
        <span>
          Có <strong>{attentionCount}</strong> đợt cần xử lý trong 7 ngày gần nhất{daXemXetCount > 0 ? ` · ${daXemXetCount} mục đã xem xét` : ''}.
        </span>
      </div>

      {onNavigateNapNguon && (
        <button
          type="button"
          onClick={onNavigateNapNguon}
          className="font-bold text-amber-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Mở Nạp dữ liệu nguồn</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
