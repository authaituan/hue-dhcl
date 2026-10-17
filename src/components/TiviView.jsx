/**
 * TiviView.jsx — Chế độ tivi DASH-4
 * Bảng 11 (all) và Bảng 12 (một BCVH).
 * Sân khấu cố định 1920×1080, thu phóng vừa cửa sổ.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BCVH_LIST } from '../constants/bcvh';
import { apiFetchJson, clearToken } from '../utils/api';
import {
  formatPercent,
  formatPctChange,
  formatSoSanh,
  formatTimeOnly,
  formatDateTimeSec,
  wardChangeChip,
  formatNhanNgay,
  formatDdMm,
  isVnToday,
  getNhanSoSanhMoc,
} from './arrivals/DailyOpsDashboard';
import {
  PTC_DAT,
  CHUA_CO_TT_CANH_BAO,
  SAN_XEP_HANG_BCVH,
  BD10_CHUA_XND_XU_LY_NGAY_PCT,
  CHUA_NHAN_XU_LY_NGAY_TU_NGAY
} from '../lib/thamSoDuPhong';

// ─── Token màu và font chuẩn Canvas DASH-4c ──────────────────────────────────
const TV = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  bgPage: '#0b0f14',
  bgCard: '#141a22',
  bgCardNested: '#1b232d',
  border: '#222b36',
  green: '#34d399',
  greenBg: '#0f2a22',
  yellow: '#fbbf24',
  yellowBg: '#422006',
  red: '#f87171',
  redBg: '#450a0a',
  textSecondary: '#8b97a6',
  textPrimary: '#f1f5f9',
};

// ─── Hằng số ────────────────────────────────────────────────────────────────
const STAGE_W = 1920;
const STAGE_H = 1080;
const REFRESH_MS = 60_000;       // 60 giây tự làm mới
const RELOAD_MS = 6 * 60 * 60 * 1000; // 6 giờ tải lại trang
const HOVER_HIDE_MS = 5_000;     // Ẩn nút thoát sau 5 giây không di chuột

// ─── Hàm tiện ích ────────────────────────────────────────────────────────────
function formatViVN(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('vi-VN');
}

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function bcvhName(ma) {
  if (!ma || ma === 'all') return 'Toàn Trung tâm';
  const b = BCVH_LIST.find((x) => x.ma === String(ma));
  return b ? b.ten : ma;
}

// Tiêu đề việc cần làm — phiên bản ngắn gọn cho tivi (1 dòng)
function tvActionTitle(item, isAll, nguong) {
  const { loai, muc, ten_bcvh, tieu_de_khoa } = item;
  const sfx = isAll ? `: ${ten_bcvh}` : '';
  if (loai === 'chua_nhan_tai_bcvh') {
    if (muc === 'xu_ly_ngay') return `Đã lập BD10 về BCVH, chưa có XN nhận${sfx}`;
    return `Bưu gửi chưa có XN nhận tại BCVH${sfx}`;
  }
  if (loai === 'bd10_chua_xnd') {
    if (muc === 'xu_ly_ngay') {
      const pct = nguong?.BD10_CHUA_XND?.xu_ly_ngay_pct ?? BD10_CHUA_XND_XU_LY_NGAY_PCT;
      return `BD10 đến chưa XNĐ cao (vượt ${pct}%)${sfx}`;
    }
    return `BD10 đến chưa XNĐ${sfx}`;
  }
  return `${tieu_de_khoa}${sfx}`;
}

function tvActionValue(item) {
  const { loai, so_lieu } = item;
  if (loai === 'chua_nhan_tai_bcvh') return { val: formatViVN(so_lieu?.buu_gui), unit: 'bưu gửi' };
  if (loai === 'bd10_chua_xnd') return { val: formatPercent(so_lieu?.ty_le), unit: 'chưa XNĐ' };
  return { val: formatViVN(so_lieu?.gia_tri), unit: '' };
}

function tvActionSub(item, isAll, nguong) {
  const { loai, so_lieu, ten_bcvh } = item;
  const pfx = isAll && ten_bcvh ? `${ten_bcvh} · ` : '';
  if (loai === 'chua_nhan_tai_bcvh') {
    const choTu1 = so_lieu?.cho_tu_1_ngay || 0;
    const tuNgay = nguong?.CHUA_NHAN?.xu_ly_ngay_tu_ngay ?? CHUA_NHAN_XU_LY_NGAY_TU_NGAY;
    if (choTu1 > 0) return `${pfx}đã chờ từ ${tuNgay} ngày: ${formatViVN(choTu1)}`;
    return `${pfx}trong ngày: ${formatViVN(so_lieu?.buu_gui || 0)} bưu gửi`;
  }
  if (loai === 'bd10_chua_xnd') {
    const cl = so_lieu?.chua_xnd ?? 0;
    const tong = so_lieu?.tong_bd10_den ?? 0;
    return `${pfx}${formatPercent(so_lieu?.ty_le)} BD10 đến (${cl}/${tong})`;
  }
  return pfx.replace(/ · $/, '') || '';
}

// DASH-8a (canvas bảng 3, phương án B): Nhãn so sánh gọn trên tivi (không bị cắt chữ)
// Bỏ chữ «cùng giờ» và «BCVH có mốc»; (x/N) chỉ hiện khi số BCVH có mốc nhỏ hơn tổng số BCVH;
// giữ nguyên nhãn ngày thật khi ngày tham chiếu khác (DASH-7b).
function formatSoSanhTivi(pct, label, soBcvh = null, tongBcvh = 6) {
  const cleanLabel = (label || '').replace(/\s+cùng giờ$/, '');
  const bcvhSuffix = (soBcvh !== null && soBcvh !== undefined && soBcvh < tongBcvh)
    ? ` (${soBcvh}/${tongBcvh})`
    : '';
  if (pct === null || pct === undefined || isNaN(pct)) {
    return `chưa đủ dữ liệu ${cleanLabel}${bcvhSuffix}`;
  }
  return `${formatPctChange(pct)} ${cleanLabel}${bcvhSuffix}`;
}

// ─── Hook lấy dữ liệu dashboard ──────────────────────────────────────────────
function useTiviData({ bcvhScope, onForceLogout }) {
  const [tongQuan, setTongQuan]     = useState(null);
  const [viecCanLam, setViecCanLam] = useState(null);
  const [phuongXa, setPhuongXa]     = useState(null);
  const [lastOk, setLastOk]         = useState(null);   // Date lần thành công gần nhất
  const [lostAt, setLostAt]         = useState(null);   // Date lúc mất kết nối
  const [loading, setLoading]       = useState(true);

  const fetch3 = useCallback(async () => {
    const code = bcvhScope || 'all';
    try {
      const [tq, vc, px] = await Promise.all([
        apiFetchJson(`/api/arrivals/dashboard/tong-quan-den?bcvh=${code}`),
        apiFetchJson(`/api/arrivals/dashboard/viec-can-lam?bcvh=${code}`),
        apiFetchJson(`/api/arrivals/dashboard/phuong-xa-tang?bcvh=${code}&gioi_han=3`),
      ]);

      // 401 → đăng xuất (token TIVI hết hạn sau 90 ngày)
      if (tq.status === 401 || vc.status === 401 || px.status === 401) {
        clearToken();
        onForceLogout?.();
        return;
      }

      if (tq.ok && vc.ok && px.ok) {
        setTongQuan(tq.data);
        setViecCanLam(vc.data);
        setPhuongXa(px.data);
        setLastOk(new Date());
        setLostAt(null);
      } else {
        setLostAt((prev) => prev || new Date());
      }
    } catch {
      setLostAt((prev) => prev || new Date());
    } finally {
      setLoading(false);
    }
  }, [bcvhScope, onForceLogout]);

  // Fetch ban đầu + polling 60s + visibility
  useEffect(() => {
    fetch3();
    let tid = setInterval(fetch3, REFRESH_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetch3();
        clearInterval(tid);
        tid = setInterval(fetch3, REFRESH_MS);
      } else {
        clearInterval(tid);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // Tải lại trang sau 6 giờ để giải phóng bộ nhớ
    const reloadTid = setTimeout(() => window.location.reload(), RELOAD_MS);

    return () => {
      clearInterval(tid);
      clearTimeout(reloadTid);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetch3]);

  return { tongQuan, viecCanLam, phuongXa, lastOk, lostAt, loading };
}

// ─── Hook lấy kết quả phát (PHAT-3b / DASH-10c) ─────────────────────────────
function useTiviPhatData({ isAll, onForceLogout }) {
  const [ketQuaPhat, setKetQuaPhat] = useState(null);
  const [phatLoi, setPhatLoi] = useState(false);

  useEffect(() => {
    if (!isAll) {
      setKetQuaPhat(null);
      setPhatLoi(false);
      return;
    }

    let isSubscribed = true;

    const fetchPhat = async () => {
      try {
        const res = await apiFetchJson('/api/arrivals/dashboard/ket-qua-phat?bcvh=all');
        if (!isSubscribed) return;

        if (res.status === 401) {
          clearToken();
          onForceLogout?.();
          return;
        }

        if (res.ok && res.data) {
          setKetQuaPhat(res.data);
          setPhatLoi(false);
        } else {
          setPhatLoi(true);
        }
      } catch {
        if (!isSubscribed) return;
        // Lỗi fetch: giữ số cũ nếu có, bật cờ lỗi
        setPhatLoi(true);
      }
    };

    fetchPhat();
    let tid = setInterval(fetchPhat, REFRESH_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetchPhat();
        clearInterval(tid);
        tid = setInterval(fetchPhat, REFRESH_MS);
      } else {
        clearInterval(tid);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      isSubscribed = false;
      clearInterval(tid);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAll, onForceLogout]);

  return { ketQuaPhat, phatLoi };
}

// ─── Hook giữ màn hình sáng (Screen Wake Lock) ───────────────────────────────
function useWakeLock() {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return; // Trình duyệt không hỗ trợ hoặc không HTTPS

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Không block nếu thất bại (HTTP, thiếu quyền)
      }
    };

    request();

    const onVis = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      wakeLockRef.current?.release?.().catch(() => {});
    };
  }, []);
}

// ─── Hook tự cuộn danh sách mượt mà (DASH-9e) ──────────────────────────────
function useAutoScroll({
  items,
  gap = 12,
  speed = 25,
  pauseOnHover = false,
  pauseOnFocus = false,
}) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const contentRef = useRef(null);
  const offsetRef = useRef(0);
  const lastTimeRef = useRef(null);
  const rafIdRef = useRef(null);
  const prevItemsKeyRef = useRef('');

  const [canScroll, setCanScroll] = useState(false);

  const itemsKey = useMemo(() => {
    if (!items || !items.length) return '';
    return items.map((i) => `${i.bcvh || ''}_${i.ten_bcvh || ''}_${i.loai || ''}_${i.ngay || ''}_${i.muc || ''}`).join('|');
  }, [items]);

  useEffect(() => {
    if (itemsKey !== prevItemsKeyRef.current) {
      prevItemsKeyRef.current = itemsKey;
      offsetRef.current = 0;
      if (trackRef.current) {
        trackRef.current.style.transform = 'translateY(0px)';
      }
    }
  }, [itemsKey]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const containerH = container.clientHeight;
      const contentH = content.offsetHeight;
      const overflow = contentH > containerH + 1;
      setCanScroll(overflow);
      if (!overflow) {
        offsetRef.current = 0;
        if (trackRef.current) {
          trackRef.current.style.transform = 'none';
        }
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        measure();
      });
      ro.observe(container);
      ro.observe(content);
      return () => {
        ro.disconnect();
      };
    }
  }, [itemsKey]);

  useEffect(() => {
    if (!canScroll) {
      if (trackRef.current) {
        trackRef.current.style.transform = 'none';
      }
      return;
    }

    let active = true;
    lastTimeRef.current = null;

    const step = (now) => {
      if (!active) return;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }

      const rawDt = now - lastTimeRef.current;
      const dt = Math.min(Math.max(rawDt, 0), 100);
      lastTimeRef.current = now;

      const content = contentRef.current;
      const track = trackRef.current;

      if (content && track) {
        const contentH = content.offsetHeight;
        const loopHeight = contentH + gap;

        if (loopHeight > 0) {
          offsetRef.current += (speed * dt) / 1000;
          if (offsetRef.current >= loopHeight) {
            offsetRef.current -= loopHeight;
          }
          track.style.transform = `translateY(-${offsetRef.current}px)`;
        }
      }

      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);

    return () => {
      active = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [canScroll, gap, speed, pauseOnHover, pauseOnFocus]);

  return {
    containerRef,
    trackRef,
    contentRef,
    canScroll,
  };
}

// ─── Hook scale sân khấu ─────────────────────────────────────────────────────
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const calc = () => {
      const sx = window.innerWidth  / STAGE_W;
      const sy = window.innerHeight / STAGE_H;
      setScale(Math.min(sx, sy));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return scale;
}

// ─── Hook nút thoát ẩn/hiện ──────────────────────────────────────────────────
function useExitButtonVisibility() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const show = useCallback(() => {
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), HOVER_HIDE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { visible, show };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component chính
// ═══════════════════════════════════════════════════════════════════════════════
export default function TiviView({ authUser, bcvhScope, isTiviRole, onExit, onForceLogout }) {
  const scale = useStageScale();
  useWakeLock();

  const { visible: exitVisible, show: showExit } = useExitButtonVisibility();

  const { tongQuan, viecCanLam, phuongXa, lastOk, lostAt, loading } =
    useTiviData({ bcvhScope, onForceLogout });

  const isAll = !bcvhScope || bcvhScope === 'all';
  const scopeName = isAll ? 'Trung tâm · 6 BCVH' : bcvhName(bcvhScope);
  const { ketQuaPhat, phatLoi } = useTiviPhatData({ isAll, onForceLogout });

  // Sắp xếp «Xử lý ngay» đứng trước
  const rawActionItems = useMemo(() => viecCanLam?.items || [], [viecCanLam]);
  const actionItems = useMemo(() => {
    return [...rawActionItems].sort((a, b) => {
      const aX = a.muc === 'xu_ly_ngay' ? 1 : 0;
      const bX = b.muc === 'xu_ly_ngay' ? 1 : 0;
      return bX - aX;
    });
  }, [rawActionItems]);


  // Thẻ sản lượng
  const slBuuGui = isAll
    ? tongQuan?.san_luong?.buu_gui
    : tongQuan?.theo_bcvh?.find((r) => r.ma === bcvhScope)?.san_luong?.buu_gui
      ?? tongQuan?.san_luong?.buu_gui;

  const hangDiNgoai = tongQuan?.hang_di_ngoai;
  const chuyenChieu = tongQuan?.chuyen_chieu;

  // Chưa nhận — Bảng 11 dùng theo_bcvh[], Bảng 12 dùng chua_nhan tổng
  const chuaNhanBcvhList = tongQuan?.theo_bcvh || [];
  const chuaNhanBcvh12   = tongQuan?.theo_bcvh?.find((r) => r.ma === bcvhScope)?.chua_nhan;

  // Phường/xã (gioi_han=3)
  const pxItems = phuongXa?.items || [];

  // Đồng hồ góc phải
  const [clock, setClock] = useState(nowHHmm());
  useEffect(() => {
    const t = setInterval(() => setClock(nowHHmm()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Đang chờ /api/auth/me trả tivi_scope (chỉ với TIVI role). App.jsx tự thử lại mỗi 10 giây khi lỗi / mất mạng. ──
  if (bcvhScope === undefined) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6" style={{ background: TV.bgPage }}>
        <div className="w-16 h-16 border-4 border-gray-700 border-t-emerald-400 rounded-full animate-spin" />
        <div className="text-2xl text-gray-400" style={{ fontFamily: TV.font }}>Đang kết nối…</div>
      </div>
    );
  }

  // ── Màn thông báo phạm vi chưa gán ──────────────────────────────────────
  if (bcvhScope === null) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center text-center p-8"
        style={{ background: TV.bgPage, fontFamily: TV.font }}
      >
        <div>
          <div className="text-6xl mb-6">📺</div>
          <h1 className="text-4xl font-black text-white mb-4">
            Tài khoản chưa được gán phạm vi
          </h1>
          <p className="text-2xl text-gray-400">
            Liên hệ quản trị viên để được cấp phạm vi xem.
          </p>
          {isTiviRole && (
            <button
              onClick={() => { clearToken(); onForceLogout?.(); }}
              className="mt-10 px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white text-xl rounded-xl"
            >
              Đăng xuất
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Loading ban đầu ──────────────────────────────────────────────────────
  if (loading && !tongQuan) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: TV.bgPage }}>
        <div className="w-16 h-16 border-4 border-gray-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Sân khấu ────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
      onMouseMove={showExit}
      onTouchStart={showExit}
    >
      <style>{`
        @keyframes tv-pulse-green {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
      `}</style>

      {/* Nút thoát / đăng xuất — hiện khi di chuột, ẩn sau 5s; đặt chính giữa đỉnh màn hình để không bao giờ đè tiêu đề */}
      <div
        className="fixed top-3 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300"
        style={{ opacity: exitVisible ? 1 : 0, pointerEvents: exitVisible ? 'auto' : 'none' }}
      >
        {isTiviRole ? (
          <button
            onClick={() => { clearToken(); onForceLogout?.(); }}
            style={{
              background: 'rgba(20, 26, 34, 0.95)',
              border: `1.5px solid ${TV.border}`,
              color: TV.textPrimary,
              fontSize: 14,
              fontWeight: 700,
              padding: '8px 20px',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              cursor: 'pointer',
              fontFamily: TV.font,
            }}
          >
            Đăng xuất
          </button>
        ) : (
          <button
            onClick={onExit}
            style={{
              background: 'rgba(20, 26, 34, 0.95)',
              border: `1.5px solid ${TV.border}`,
              color: TV.textPrimary,
              fontSize: 14,
              fontWeight: 700,
              padding: '8px 20px',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              cursor: 'pointer',
              fontFamily: TV.font,
            }}
          >
            ← Thoát chế độ tivi
          </button>
        )}
      </div>

      {/* Sân khấu 1920×1080 thu phóng */}
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          fontFamily: TV.font,
          background: TV.bgPage,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Thanh cảnh báo mất kết nối */}
        {lostAt && (
          <div className="absolute top-0 left-0 right-0 z-10 bg-amber-500 text-black font-bold text-center py-2"
            style={{ fontSize: 22 }}>
            ⚠ Mất kết nối từ {formatDateTimeSec(lostAt)} — Đang giữ số cũ, tự hồi phục…
          </div>
        )}

        {/* Nội dung chính */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '32px 40px 24px' }}>

          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <HeaderBar
            scopeName={scopeName}
            clock={clock}
            lostAt={lostAt}
            lastOk={lastOk}
            tongQuan={tongQuan}
          />

          {/* Khoảng đệm */}
          <div style={{ height: 20 }} />

          {/* ── HÀNG A: 4 THẺ ──────────────────────────────────────────────── */}
          <RowA
            isAll={isAll}
            slBuuGui={slBuuGui}
            hangDiNgoai={hangDiNgoai}
            chuyenChieu={chuyenChieu}
            tongQuan={tongQuan}
            ketQuaPhat={ketQuaPhat}
            phatLoi={phatLoi}
          />

          <div style={{ height: 24 }} />

          {/* ── HÀNG B: 3 KHỐI ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
            {/* Cột Trái: Việc cần làm */}
            <ColViec
              items={actionItems}
              isAll={isAll}
              ngayDuLieu={tongQuan?.ngay_du_lieu}
              nguong={tongQuan?.nguong}
            />

            {/* Cột Giữa */}
            {isAll ? (
              <ColXepHang ketQuaPhat={ketQuaPhat} phatLoi={phatLoi} />
            ) : (
              <ColKhungGio ngayDuLieu={tongQuan?.ngay_du_lieu} />
            )}

            {/* Cột Phải */}
            {isAll ? (
              <ColChuaNhanAll
                chuaNhanList={chuaNhanBcvhList}
                ngayDuLieu={tongQuan?.ngay_du_lieu}
              />
            ) : (
              <ColChuaNhanBCVH
                chuaNhan={chuaNhanBcvh12}
                pxItems={pxItems}
                bcvhScope={bcvhScope}
                ngayDuLieu={phuongXa?.ngay_du_lieu || tongQuan?.ngay_du_lieu}
                tangCaoPct={phuongXa?.tang_cao_pct}
              />
            )}
          </div>

          {/* ── FOOTER ─────────────────────────────────────────────────────── */}
          <Footer tongQuan={tongQuan} lastOk={lastOk} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

// ── Header ───────────────────────────────────────────────────────────────────
function HeaderBar({ scopeName, clock, lostAt, lastOk, tongQuan }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* Tiêu đề trái */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <h1 style={{ fontSize: 44, fontWeight: 900, color: TV.textPrimary, margin: 0, letterSpacing: '-1px' }}>
          {isVnToday(tongQuan?.ngay_du_lieu)
            ? 'Cần điều hành ngay hôm nay'
            : `Cần điều hành ngày ${formatDdMm(tongQuan?.ngay_du_lieu)}`}
        </h1>
        <span style={{
          background: TV.bgCardNested, border: `1.5px solid ${TV.border}`,
          color: TV.textPrimary, borderRadius: 9999, padding: '6px 20px',
          fontSize: 22, fontWeight: 700,
        }}>
          {scopeName}
        </span>
      </div>

      {/* Trạng thái + đồng hồ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: lostAt ? TV.yellowBg : TV.greenBg,
          border: `1.5px solid ${lostAt ? 'rgba(251, 191, 36, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
          borderRadius: 9999,
          padding: '7px 20px',
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: lostAt ? TV.yellow : TV.green,
            display: 'inline-block',
            boxShadow: lostAt ? 'none' : `0 0 10px ${TV.green}`,
            animation: lostAt ? 'none' : 'tv-pulse-green 2s infinite',
          }} />
          <span style={{
            fontSize: 22, fontWeight: 800,
            color: lostAt ? TV.yellow : TV.green,
            letterSpacing: '0.08em',
          }}>
            {lostAt ? 'MẤT KẾT NỐI' : 'TRỰC TIẾP'}
          </span>
        </div>
        <span style={{ fontSize: 52, fontWeight: 900, color: TV.textPrimary, letterSpacing: '-2px' }}>
          {clock}
        </span>
      </div>
    </div>
  );
}

function getChuaCoPhatText(ngay) {
  if (ngay && !isVnToday(ngay)) {
    return `Chưa có số liệu phát ngày ${formatDdMm(ngay)}`;
  }
  return 'Chưa có số liệu phát hôm nay';
}

// ── Thẻ 2: PHÁT THÀNH CÔNG (PTC) (DASH-10c / DASH-12e) ───────────────────────
function PtcCard({ ketQuaPhat, phatLoi, isAll }) {
  const dangTai = isAll && ketQuaPhat === null && !phatLoi;
  const loiLanDau = isAll && ketQuaPhat === null && phatLoi;

  // 1. ĐANG TẢI (chỉ khi isAll, chưa có phản hồi nào và chưa lỗi)
  if (dangTai) {
    return (
      <div style={{
        flex: 1.35, background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 18,
        padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minWidth: 0, overflow: 'hidden',
      }}>
        {/* Hàng trên */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em', color: '#475569', whiteSpace: 'nowrap' }}>
            PHÁT THÀNH CÔNG (PTC)
          </div>
        </div>

        {/* Giữa */}
        <div>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#cbd5e1' }}>
            …
          </div>
          <div style={{ fontSize: 20, color: '#334155', whiteSpace: 'nowrap', marginTop: 4 }}>
            Đang tải số liệu phát…
          </div>
        </div>

        {/* Hàng dưới */}
        <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
          Vui lòng chờ
        </div>
      </div>
    );
  }

  // 2. LỖI LẦN ĐẦU (chỉ khi isAll, chưa từng có số mà lần tải đầu thất bại)
  if (loiLanDau) {
    return (
      <div style={{
        flex: 1.35, background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 18,
        padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minWidth: 0, overflow: 'hidden',
      }}>
        {/* Hàng trên */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em', color: '#475569', whiteSpace: 'nowrap' }}>
            PHÁT THÀNH CÔNG (PTC)
          </div>
        </div>

        {/* Giữa */}
        <div>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#0f172a' }}>
            —
          </div>
          <div style={{ fontSize: 20, color: '#334155', whiteSpace: 'nowrap', marginTop: 4 }}>
            Không tải được số liệu phát
          </div>
        </div>

        {/* Hàng dưới */}
        <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
          Đang thử lại
        </div>
      </div>
    );
  }

  // 3. !isAll (Tivi một BCVH, không gọi API phát): giữ hành vi cũ trước DASH-12e
  if (!isAll) {
    return (
      <div style={{
        flex: 1.35, background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 18,
        padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minWidth: 0, overflow: 'hidden',
      }}>
        {/* Hàng trên */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em', color: '#475569', whiteSpace: 'nowrap' }}>
            PHÁT THÀNH CÔNG (PTC)
          </div>
        </div>

        {/* Giữa */}
        <div>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#0f172a' }}>
            —
          </div>
          <div style={{ fontSize: 20, color: '#334155', whiteSpace: 'nowrap', marginTop: 4 }}>
            Chưa có số liệu phát hôm nay
          </div>
        </div>

        {/* Hàng dưới */}
        <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
          Chờ nhập kết quả phát
        </div>
      </div>
    );
  }

  const isSoCu = Boolean(phatLoi) && ketQuaPhat !== null;
  const hasData = Boolean(
    ketQuaPhat &&
    ketQuaPhat.co_so_lieu_phat &&
    ketQuaPhat.ptc !== null &&
    ketQuaPhat.ptc !== undefined
  );

  const nguongDat = ketQuaPhat?.nguong?.ptc_dat ?? PTC_DAT;
  const nguongChuaCoTt = ketQuaPhat?.nguong?.chua_co_tt_canh_bao ?? CHUA_CO_TT_CANH_BAO;
  const mucTieuPct = Math.round(nguongDat * 100);

  const ptcVal = ketQuaPhat?.ptc;
  const isDuSoLieu = ketQuaPhat?.du_so_lieu !== false;
  const isChuaDuSoLieu = hasData && !isDuSoLieu;
  const isDat = hasData && isDuSoLieu && ptcVal >= nguongDat;

  let cardBg = '#ffffff';
  let cardBorder = '#e2e8f0';
  let numColor = '#0f172a';

  if (hasData) {
    if (isChuaDuSoLieu) {
      cardBg = '#f8fafc';
      cardBorder = '#cbd5e1';
      numColor = '#475569';
    } else if (isDat) {
      cardBg = '#ecfdf5';
      cardBorder = '#a7f3d0';
      numColor = '#047857';
    } else {
      cardBg = '#fffbeb';
      cardBorder = '#fde68a';
      numColor = '#b45309';
    }
  }

  const borderStyle = isSoCu ? '2px dashed #94a3b8' : `2px solid ${cardBorder}`;

  const denLucBangkok = ketQuaPhat?.so_lieu_den_luc_bangkok;
  const denLucHhmm = denLucBangkok ? formatTimeOnly(denLucBangkok) : '';
  const soPtc = ketQuaPhat?.theo_trang_thai?.PTC?.so ?? 0;
  const mauSo = ketQuaPhat?.mau_so ?? 0;
  const chuaCoTtTyLe = ketQuaPhat?.theo_trang_thai?.CHUA_CO_TT?.ty_le;
  const isChuaCoTtCanhBao = chuaCoTtTyLe !== null && chuaCoTtTyLe !== undefined && chuaCoTtTyLe >= nguongChuaCoTt;

  return (
    <div style={{
      flex: 1.35, background: cardBg, border: borderStyle, borderRadius: 18,
      padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minWidth: 0, overflow: 'hidden',
    }}>
      {/* Hàng trên */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em', color: '#475569', whiteSpace: 'nowrap' }}>
          PHÁT THÀNH CÔNG (PTC)
        </div>
        {isSoCu ? (
          <span style={{
            background: '#0f172a', color: '#ffffff', borderRadius: 9999,
            padding: '3px 12px', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Số cũ · {denLucHhmm || '—'}
          </span>
        ) : (
          hasData && denLucHhmm ? (
            <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
              đến {denLucHhmm}
            </div>
          ) : null
        )}
      </div>

      {/* Giữa */}
      <div>
        <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: numColor }}>
          {hasData ? formatPercent(ptcVal) : '—'}
        </div>
        <div style={{ fontSize: 20, color: '#334155', whiteSpace: 'nowrap', marginTop: 4 }}>
          {hasData ? `${formatViVN(soPtc)} / ${formatViVN(mauSo)} bưu gửi phát thành công` : getChuaCoPhatText(ketQuaPhat?.ngay)}
        </div>
      </div>

      {/* Hàng dưới */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {isSoCu ? (
          <span style={{ fontSize: 17, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
            Không cập nhật được
          </span>
        ) : hasData ? (
          isChuaDuSoLieu ? (
            <span style={{
              background: '#e2e8f0', color: '#475569',
              borderRadius: 9999, padding: '3px 12px', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap',
            }}>
              Chưa đủ số liệu
            </span>
          ) : (
            <span style={{
              background: isDat ? '#d1fae5' : '#fef3c7', color: isDat ? '#047857' : '#92400e',
              borderRadius: 9999, padding: '3px 12px', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap',
            }}>
              {isDat ? `Đạt mục tiêu ${mucTieuPct}%` : `Dưới mục tiêu ${mucTieuPct}%`}
            </span>
          )
        ) : (
          <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
            Chờ nhập kết quả phát
          </div>
        )}

        {hasData && chuaCoTtTyLe !== null && chuaCoTtTyLe !== undefined ? (
          isChuaCoTtCanhBao ? (
            <span style={{ background: '#ffe4e6', color: '#be123c', fontWeight: 800, borderRadius: 9999, padding: '3px 12px', fontSize: 15, whiteSpace: 'nowrap' }}>
              Chưa có TT {formatPercent(chuaCoTtTyLe)}
            </span>
          ) : (
            <span style={{ fontSize: 17, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>
              Chưa có TT {formatPercent(chuaCoTtTyLe)}
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}

// ── Hàng A: 4 thẻ ────────────────────────────────────────────────────────────
function RowA({ isAll, slBuuGui, hangDiNgoai, chuyenChieu, tongQuan, ketQuaPhat, phatLoi }) {
  const cardStyle = {
    flex: 1,
    background: TV.bgCard,
    border: `1.5px solid ${TV.border}`,
    borderRadius: 20,
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minWidth: 0,
  };

  const gioDuLieuTivi = formatTimeOnly(tongQuan?.den_luc);

  return (
    <div style={{ display: 'flex', gap: 20, height: 196 }}>
      {/* Thẻ 1: Sản lượng đến */}
      <div style={cardStyle}>
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: TV.textSecondary,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {isAll ? 'Sản lượng đến' : 'Hàng đến'}
          {' '}
          {formatNhanNgay(tongQuan?.ngay_du_lieu)}
          {tongQuan?.den_luc ? (
            <span style={{ fontSize: 15, fontWeight: 500, color: '#94a3b8', textTransform: 'none' }}>
              {' '}· đến {formatTimeOnly(tongQuan.den_luc)}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
          {slBuuGui !== null && slBuuGui !== undefined ? formatViVN(slBuuGui) : '—'}
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginTop: 4,
        }}>
          <div style={{
            fontSize: 15,
            color: TV.textSecondary,
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
          }}>
            {formatSoSanhTivi(
              tongQuan?.san_luong?.so_hom_qua_cung_gio?.chenh_pct,
              getNhanSoSanhMoc(tongQuan?.ngay_du_lieu).labelHomQua,
              tongQuan?.san_luong?.so_hom_qua_cung_gio?.so_bcvh,
              tongQuan?.theo_bcvh?.length || 6
            )}
          </div>
          <div style={{
            fontSize: 15,
            color: TV.textSecondary,
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
          }}>
            {formatSoSanhTivi(
              tongQuan?.san_luong?.so_tuan_truoc_cung_gio?.chenh_pct,
              getNhanSoSanhMoc(tongQuan?.ngay_du_lieu).labelTuanTruoc,
              tongQuan?.san_luong?.so_tuan_truoc_cung_gio?.so_bcvh,
              tongQuan?.theo_bcvh?.length || 6
            )}
          </div>
        </div>
      </div>

      {/* Thẻ 2: PTC */}
      <PtcCard ketQuaPhat={ketQuaPhat} phatLoi={phatLoi} isAll={isAll} />

      {/* Thẻ 3: Hàng đi ngoài */}
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TV.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
          Hàng đi ngoài
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
          {formatPercent(hangDiNgoai?.ty_le)}
        </div>
        <div style={{ fontSize: 20, color: TV.textSecondary, marginTop: 4 }}>
          {hangDiNgoai?.buu_gui !== undefined ? `${formatViVN(hangDiNgoai.buu_gui)} bưu gửi` : '—'}
        </div>
      </div>

      {/* Thẻ 4: Hàng đến chuyến chiều */}
      <div style={cardStyle}>
        <div>
          <div style={{
            fontSize: 17,
            fontWeight: 700,
            color: TV.textSecondary,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            HÀNG ĐẾN CHUYẾN CHIỀU
          </div>
          {!chuyenChieu ? (
            <div style={{ fontSize: 76, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
              —
            </div>
          ) : chuyenChieu.da_toi_gio ? (
            <div style={{ fontSize: 76, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
              {formatViVN(chuyenChieu.buu_gui)}
            </div>
          ) : (
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: TV.textPrimary,
              lineHeight: 1.1,
              marginTop: 14,
              whiteSpace: 'nowrap',
            }}>
              Chưa có lượt chiều
            </div>
          )}
        </div>
        <div>
          {!chuyenChieu ? null : chuyenChieu.da_toi_gio ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {chuyenChieu.ty_le !== null && chuyenChieu.ty_le !== undefined && !isNaN(chuyenChieu.ty_le) && (
                <div style={{ fontSize: 20, color: TV.textSecondary, whiteSpace: 'nowrap', lineHeight: 1.25 }}>
                  {formatPercent(chuyenChieu.ty_le)} sản lượng đến hôm nay
                </div>
              )}
              {gioDuLieuTivi && (
                <div style={{ fontSize: 17, color: '#94a3b8', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
                  Dữ liệu hiện tại đã tới {gioDuLieuTivi}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 17, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap', lineHeight: 1.25 }}>
              Chờ dữ liệu lượt chiều
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cột Trái: Việc cần làm ────────────────────────────────────────────────────
function ColViec({ items = [], isAll, ngayDuLieu, nguong }) {
  const totalItems = items?.length || 0;

  const tvScroll = useAutoScroll({
    items,
    gap: 12,
    speed: 25,
    pauseOnHover: false,
    pauseOnFocus: false,
  });

  const colStyle = {
    width: 500,
    flexShrink: 0,
    background: TV.bgCard,
    border: `1.5px solid ${TV.border}`,
    borderRadius: 20,
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={colStyle}>
      {/* Tiêu đề & ghi chú ở dòng riêng bên dưới, không bị dính cùng dòng hay cắt chữ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: TV.textPrimary, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {isAll ? 'Việc cần làm' : 'Việc của BCVH tôi'}
        </div>
        <div style={{ fontSize: 16, color: TV.textSecondary, lineHeight: 1.2, marginTop: 6, whiteSpace: 'nowrap' }}>
          tự cuộn · <span style={{ color: TV.yellow }}>Xử lý ngay</span> trước
        </div>
      </div>

      {totalItems === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: TV.green, textAlign: 'center' }}>
            {isVnToday(ngayDuLieu)
              ? 'Hôm nay chưa có việc cần điều hành'
              : `Ngày ${formatDdMm(ngayDuLieu)} chưa có việc cần điều hành`}
          </div>
        </div>
      ) : (
        <div
          ref={tvScroll.containerRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            ref={tvScroll.trackRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              willChange: 'transform',
            }}
          >
            <div ref={tvScroll.contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item, idx) => (
                <ActionCardStack
                  key={`${item.loai}-${item.ten_bcvh || ''}-${idx}`}
                  item={item}
                  isAll={isAll}
                  nguong={nguong}
                />
              ))}
            </div>
            {tvScroll.canScroll && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-hidden="true">
                {items.map((item, idx) => (
                  <ActionCardStack
                    key={`${item.loai}-${item.ten_bcvh || ''}-${idx}-clone`}
                    item={item}
                    isAll={isAll}
                    nguong={nguong}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCardStack({ item, isAll, nguong }) {
  const isXuLy = item.muc === 'xu_ly_ngay';
  const { val, unit } = tvActionValue(item);
  const sub = tvActionSub(item, isAll, nguong);

  return (
    <div style={{
      background: TV.bgCardNested,
      border: `1.5px solid ${TV.border}`,
      borderLeft: `6px solid ${isXuLy ? TV.red : TV.yellow}`,
      borderRadius: 14,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          <span style={{
            display: 'inline-block',
            background: isXuLy ? TV.redBg : TV.yellowBg,
            border: `1px solid ${isXuLy ? 'rgba(248, 113, 113, 0.35)' : 'rgba(251, 191, 36, 0.35)'}`,
            color: isXuLy ? TV.red : TV.yellow,
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.02em',
          }}>
            {isXuLy ? 'Xử lý ngay' : 'Trong ngày'}
          </span>
        </div>
        {/* Tiêu đề cho xuống dòng, tối đa 3 dòng, không dùng ellipsis cắt ngang tên BCVH */}
        <div style={{
          fontSize: 18,
          fontWeight: 800,
          color: TV.textPrimary,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }} title={tvActionTitle(item, isAll, nguong)}>
          {tvActionTitle(item, isAll, nguong)}
        </div>
        {sub && (
          <div style={{
            fontSize: 14,
            color: TV.textSecondary,
            lineHeight: 1.25,
            marginTop: 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {sub}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 90, marginLeft: 8 }}>
        <div style={{
          fontSize: 40,
          fontWeight: 900,
          color: isXuLy ? TV.red : TV.yellow,
          lineHeight: 1,
        }}>
          {val}
        </div>
        {unit && (
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: isXuLy ? TV.red : TV.yellow,
            marginTop: 4,
          }}>
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cột Giữa — Bảng 11: Xếp hạng BCVH · PTC (DASH-10c) ─────────────────────
function ColXepHang({ ketQuaPhat, phatLoi }) {
  const TABS = ['Cả ngày', '<10h', '10–12h', '12–14h', '14–16h', '16–18h', '>18h'];

  const isDangTai = ketQuaPhat === null && !phatLoi;
  const isLoiLanDau = ketQuaPhat === null && phatLoi;
  const isSoCu = Boolean(phatLoi) && ketQuaPhat !== null;

  const hasData = Boolean(ketQuaPhat && ketQuaPhat.co_so_lieu_phat);
  const nguongDat = ketQuaPhat?.nguong?.ptc_dat ?? PTC_DAT;
  const sanXepHang = ketQuaPhat?.nguong?.san_xep_hang_bcvh ?? SAN_XEP_HANG_BCVH;
  const mucTieuPct = Math.round(nguongDat * 100);

  const denLucBangkok = ketQuaPhat?.so_lieu_den_luc_bangkok;
  const denLucHhmm = denLucBangkok ? formatTimeOnly(denLucBangkok) : '';

  const xepHang = hasData ? (ketQuaPhat?.xep_hang_bcvh || []) : [];
  const chuaDu = hasData ? (ketQuaPhat?.chua_du_du_lieu || []) : [];

  const isStateA = !isDangTai && !isLoiLanDau && hasData && xepHang.length >= 2;
  const isStateB = !isDangTai && !isLoiLanDau && hasData && xepHang.length < 2;
  const isStateC = !isDangTai && !isLoiLanDau && !hasData;

  const maxHang = xepHang.length > 0 ? Math.max(...xepHang.map((r) => r.hang)) : 1;

  return (
    <div style={{
      flex: 1, background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: 20,
      padding: '24px 28px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
    }}>
      {/* Tiêu đề & giờ số liệu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
          XẾP HẠNG BCVH · PTC
        </div>
        <div style={{ fontSize: 17, color: '#64748b', whiteSpace: 'nowrap' }}>
          {isDangTai
            ? 'Đang tải…'
            : isLoiLanDau
              ? 'Không tải được'
              : isSoCu
                ? `Số cũ · ${denLucHhmm || '—'}`
                : hasData && denLucHhmm
                  ? `Số liệu đến ${denLucHhmm}`
                  : 'Chưa có số liệu phát'}
        </div>
      </div>

      {/* Hàng nút khung giờ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, overflowX: 'hidden' }}>
        {TABS.map((tab, idx) => (
          <span key={tab} style={{
            background: idx === 0 ? '#0f172a' : '#f1f5f9', color: idx === 0 ? '#ffffff' : '#94a3b8',
            borderRadius: 9999, padding: '3px 12px', fontSize: 14, fontWeight: idx === 0 ? 700 : 500, whiteSpace: 'nowrap',
          }}>
            {tab}
          </span>
        ))}
        <span style={{ fontSize: 17, color: '#94a3b8', marginLeft: 4, whiteSpace: 'nowrap' }}>
          sắp có
        </span>
      </div>

      {/* TRẠNG THÁI ĐANG TẢI */}
      {isDangTai && (
        <div style={{
          flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 24, minHeight: 0,
        }}>
          <div style={{ fontSize: 64, fontWeight: 900, color: '#cbd5e1', lineHeight: 1 }}>
            …
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#334155', textAlign: 'center' }}>
            Đang tải số liệu xếp hạng…
          </div>
          <div style={{ fontSize: 18, color: '#64748b', textAlign: 'center' }}>
            Hiện bảng khi tải xong
          </div>
        </div>
      )}

      {/* TRẠNG THÁI LỖI LẦN ĐẦU */}
      {isLoiLanDau && (
        <div style={{
          flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 24, minHeight: 0,
        }}>
          <div style={{ fontSize: 64, fontWeight: 900, color: '#cbd5e1', lineHeight: 1 }}>
            —
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#334155', textAlign: 'center' }}>
            Không tải được số liệu xếp hạng
          </div>
          <div style={{ fontSize: 18, color: '#64748b', textAlign: 'center' }}>
            Đang thử lại sau ít phút
          </div>
        </div>
      )}

      {/* THÂN KHỐI THEO 3 TRẠNG THÁI */}
      {isStateA && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Các hàng được xếp hạng */}
            {xepHang.map((row) => {
              const isTop = row.hang === 1;
              const isBottom = !isTop && row.hang === maxHang;
              const isDat = row.ptc >= nguongDat;
              const fillCol = isDat ? '#047857' : '#b45309';
              const displayName = (row.ten || bcvhName(row.bcvh)).replace(/^BCVH\s+/, '');
              const rowBg = isTop ? '#ecfdf5' : isBottom ? '#fef2f2' : '#ffffff';
              const rowBorder = isTop ? '#a7f3d0' : isBottom ? '#fecdd3' : '#e2e8f0';
              const circleBg = isTop ? '#047857' : isBottom ? '#be123c' : '#e2e8f0';
              const circleCol = (isTop || isBottom) ? '#ffffff' : '#334155';
              const ptcPct = Math.min(100, Math.max(0, (row.ptc || 0) * 100));
              const targetPct = Math.min(100, Math.max(0, nguongDat * 100));

              return (
                <div key={row.bcvh} style={{
                  height: 64, padding: '0 16px', borderRadius: 12, background: rowBg,
                  border: `1px solid ${rowBorder}`, display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: circleBg, color: circleCol,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0,
                  }}>
                    {row.hang}
                  </div>
                  <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }} title={displayName}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: 17, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatViVN(row.mau_so)} bưu gửi
                    </div>
                  </div>
                  <div style={{ flex: 1, height: 14, background: '#e2e8f0', borderRadius: 7, position: 'relative' }}>
                    <div style={{ width: `${ptcPct}%`, height: '100%', background: fillCol, borderRadius: 7 }} />
                    <div style={{
                      position: 'absolute', top: -5, left: `${targetPct}%`, width: 3, height: 24,
                      background: '#0f172a', transform: 'translateX(-50%)', borderRadius: 1.5, zIndex: 2,
                    }} />
                  </div>
                  <div style={{ width: 104, textAlign: 'right', fontSize: 32, fontWeight: 900, color: fillCol, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatPercent(row.ptc)}
                  </div>
                </div>
              );
            })}

            {/* Các hàng chưa đủ dữ liệu (nằm sau các hàng xếp hạng) */}
            {chuaDu.map((row) => {
              const displayName = (row.ten || bcvhName(row.bcvh)).replace(/^BCVH\s+/, '');
              return (
                <div key={row.bcvh} style={{
                  height: 64, padding: '0 16px', borderRadius: 12, background: '#f8fafc',
                  border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0,
                  }}>
                    –
                  </div>
                  <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }} title={displayName}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: 17, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatViVN(row.mau_so)} bưu gửi
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <span style={{ background: '#e2e8f0', color: '#475569', fontSize: 17, fontWeight: 700, padding: '4px 14px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                      {row.ly_do === 'duoi_san' ? `Dưới ${sanXepHang} bưu gửi · chưa xếp hạng` : 'Chưa nhập kết quả phát'}
                    </span>
                  </div>
                  <div style={{ width: 104, textAlign: 'right', fontSize: 32, fontWeight: 900, color: '#cbd5e1', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    —
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dòng chú thích nhỏ dưới cùng */}
          <div style={{ fontSize: 17, color: '#64748b', marginTop: 10, whiteSpace: 'nowrap' }}>
            ▌Vạch đen = mục tiêu {mucTieuPct}%
          </div>
        </div>
      )}

      {isStateB && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#92400e', lineHeight: 1.2 }}>
              Chưa đủ BCVH để xếp hạng
            </div>
            <div style={{ fontSize: 18, color: '#78350f', marginTop: 4, lineHeight: 1.2 }}>
              Cần ít nhất 2 BCVH có từ {sanXepHang} bưu gửi và đã nhập kết quả phát
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BCVH_LIST.map((bcvh) => {
              const ranked = xepHang.find((r) => r.bcvh === bcvh.ma);
              const unranked = chuaDu.find((r) => r.bcvh === bcvh.ma);
              const hasRanked = Boolean(ranked);
              const isDat = hasRanked && ranked.ptc >= nguongDat;
              const fillCol = isDat ? '#047857' : '#b45309';
              const displayName = bcvh.ten.replace(/^BCVH\s+/, '');
              const mauSo = ranked?.mau_so ?? unranked?.mau_so ?? 0;
              const lyDo = unranked?.ly_do || 'chua_nhap';

              return (
                <div key={bcvh.ma} style={{
                  height: 58, padding: '0 16px', borderRadius: 12, background: '#f8fafc',
                  border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: hasRanked ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }} title={displayName}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: 17, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatViVN(mauSo)} bưu gửi
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    {hasRanked ? (
                      <span style={{ background: '#d1fae5', color: '#047857', fontSize: 17, fontWeight: 700, borderRadius: 9999, padding: '4px 14px', whiteSpace: 'nowrap' }}>
                        Đủ điều kiện · chưa đủ BCVH để xếp
                      </span>
                    ) : (
                      <span style={{ background: '#e2e8f0', color: '#475569', fontSize: 17, fontWeight: 700, borderRadius: 9999, padding: '4px 14px', whiteSpace: 'nowrap' }}>
                        {lyDo === 'duoi_san' ? `Dưới ${sanXepHang} bưu gửi · chưa xếp hạng` : 'Chưa nhập kết quả phát'}
                      </span>
                    )}
                  </div>
                  <div style={{ width: 104, textAlign: 'right', fontSize: 32, fontWeight: 900, color: hasRanked ? fillCol : '#cbd5e1', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {hasRanked ? formatPercent(ranked.ptc) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isStateC && (
        <div style={{
          flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: 24, minHeight: 0,
        }}>
          <div style={{ fontSize: 64, fontWeight: 900, color: '#cbd5e1', lineHeight: 1 }}>
            —
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#334155', textAlign: 'center' }}>
            {getChuaCoPhatText(ketQuaPhat?.ngay)}
          </div>
          <div style={{ fontSize: 18, color: '#64748b', textAlign: 'center' }}>
            Bảng xếp hạng hiện khi có BCVH đã nhập kết quả phát
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cột Giữa — Bảng 12: Khung giờ ───────────────────────────────────────────
function ColKhungGio({ ngayDuLieu }) {
  const TIME_SLOTS = [
    'Cả ngày',
    'Trước 10h',
    '10–12h',
    '12–14h',
    '14–16h',
    '16–18h',
    'Sau 18h',
  ];

  return (
    <div style={{
      flex: 1,
      background: TV.bgCard,
      border: `1.5px solid ${TV.border}`,
      borderRadius: 20,
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: TV.textPrimary }}>
          {isVnToday(ngayDuLieu)
            ? 'Hôm nay từng khung giờ'
            : `Từng khung giờ ngày ${formatDdMm(ngayDuLieu)}`}
        </div>
        <span style={{
          background: '#0b0f14',
          border: `1.5px solid ${TV.border}`,
          color: '#ffffff',
          borderRadius: 9999,
          padding: '4px 14px',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: '0.05em',
        }}>
          SẮP CÓ
        </span>
      </div>

      <div style={{ fontSize: 14, color: TV.textSecondary, marginBottom: 16 }}>
        Thống kê PTC theo từng khung giờ thuộc module «Xử lý và tỷ lệ phát»
      </div>

      {/* 7 khung giờ với thanh tiến độ rỗng và giá trị «–», không số mẫu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
        {TIME_SLOTS.map((slot) => (
          <div key={slot} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '7px 14px',
            background: TV.bgCardNested,
            border: `1px solid ${TV.border}`,
            borderRadius: 12,
          }}>
            <span style={{ width: 110, fontSize: 18, fontWeight: 700, color: TV.textPrimary, whiteSpace: 'nowrap' }}>
              {slot}
            </span>
            <div style={{ flex: 1, height: 12, background: '#111720', borderRadius: 6, overflow: 'hidden' }} />
            <span style={{ width: 36, fontSize: 18, fontWeight: 800, color: TV.textSecondary, textAlign: 'right' }}>
              –
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cột Phải — Bảng 11: Hàng tới rồi, chưa quét? (DASH-11a) ────────────────────
function ColChuaNhanAll({ chuaNhanList = [], ngayDuLieu }) {
  const colStyle = {
    width: 540,
    flexShrink: 0,
    background: TV.bgCard,
    border: `1.5px solid ${TV.border}`,
    borderRadius: 20,
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const totalBcvhCount = chuaNhanList.length || 6;
  const hasNoDataBcvh = chuaNhanList.some((r) => r.co_du_lieu === false);
  const allHaveData = chuaNhanList.length > 0 && !hasNoDataBcvh;

  const tongBuuGui = chuaNhanList.reduce((acc, r) => {
    if (r.co_du_lieu === false) return acc;
    return acc + (r.chua_nhan?.buu_gui || 0);
  }, 0);

  const tongTu1Ngay = chuaNhanList.reduce((acc, r) => {
    if (r.co_du_lieu === false) return acc;
    return acc + (r.chua_nhan?.cho_tu_1_ngay || 0);
  }, 0);

  const tongTrongNgay = Math.max(0, tongBuuGui - tongTu1Ngay);

  const isZeroStateGreen = tongBuuGui === 0 && allHaveData;

  const activeRows = useMemo(() => {
    const list = chuaNhanList.filter((r) => r.co_du_lieu !== false && (r.chua_nhan?.buu_gui || 0) > 0);
    return list.sort((a, b) => {
      const bA = a.chua_nhan?.buu_gui || 0;
      const bB = b.chua_nhan?.buu_gui || 0;
      if (bB !== bA) return bB - bA;
      const idxA = BCVH_LIST.findIndex((x) => x.ma === String(a.ma));
      const idxB = BCVH_LIST.findIndex((x) => x.ma === String(b.ma));
      return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
    });
  }, [chuaNhanList]);

  const maxBuuGui = useMemo(() => {
    if (activeRows.length === 0) return 1;
    return Math.max(...activeRows.map((r) => r.chua_nhan?.buu_gui || 0), 1);
  }, [activeRows]);

  const zeroRows = useMemo(() => {
    return chuaNhanList.filter((r) => r.co_du_lieu !== false && (r.chua_nhan?.buu_gui || 0) === 0);
  }, [chuaNhanList]);

  const noDataRows = useMemo(() => {
    return chuaNhanList.filter((r) => r.co_du_lieu === false);
  }, [chuaNhanList]);

  return (
    <div style={colStyle}>
      {/* Tiêu đề & Dòng phụ */}
      <div style={{ fontSize: 30, fontWeight: 800, color: TV.textPrimary, lineHeight: 1.2 }}>
        Hàng tới rồi, chưa quét?
      </div>
      <div style={{ fontSize: 18, color: '#94a3b8', marginTop: 4, lineHeight: 1.3 }}>
        Có BD10 về BCVH nhưng chưa có XN nhận trên hệ thống
      </div>

      {isZeroStateGreen ? (
        /* Trạng thái không có hàng chờ (Việc 2) */
        <div style={{
          flex: 1,
          background: '#064e3b',
          border: '1.5px solid #065f46',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          margin: '20px 0',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 120, fontWeight: 900, color: '#6ee7b7', lineHeight: 1 }}>
            0
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ecfdf5', marginTop: 8 }}>
            Không có hàng chờ
          </div>
          <div style={{ fontSize: 18, color: '#a7f3d0', marginTop: 8 }}>
            Trong dữ liệu ngày {formatDdMm(ngayDuLieu) || '—'} của cả {totalBcvhCount} BCVH
          </div>
        </div>
      ) : (
        <>
          {/* Hàng tổng */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 96, fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>
                {formatViVN(tongBuuGui)}
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: '#cbd5e1' }}>
                bưu gửi
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <div style={{
                background: '#fbbf24',
                color: '#1c1917',
                fontSize: 20,
                fontWeight: 700,
                borderRadius: 9999,
                padding: '4px 14px',
                whiteSpace: 'nowrap',
              }}>
                Trong ngày · {formatViVN(tongTrongNgay)}
              </div>
              <div style={{
                background: '#f87171',
                color: '#450a0a',
                fontSize: 20,
                fontWeight: 700,
                borderRadius: 9999,
                padding: '4px 14px',
                whiteSpace: 'nowrap',
              }}>
                Từ 1 ngày · {formatViVN(tongTu1Ngay)}
              </div>
            </div>
          </div>

          {/* Đường kẻ mảnh #1e293b */}
          <div style={{ height: 1, background: '#1e293b', marginBottom: 12 }} />

          {/* Danh sách BCVH */}
          <div style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 6,
          }}>
            {activeRows.map((row) => {
              const cn = row.chua_nhan || {};
              const tong = cn.buu_gui || 0;
              const tu1 = cn.cho_tu_1_ngay || 0;
              const trong = Math.max(0, tong - tu1);

              const rowWidthPct = (tong / maxBuuGui) * 100;
              const pTrong = tong > 0 ? (trong / tong) * 100 : 0;
              const pTu1 = tong > 0 ? (tu1 / tong) * 100 : 0;

              const isTrongNarrow = (trong / maxBuuGui) < 0.16;
              const isTu1Narrow = (tu1 / maxBuuGui) < 0.16;

              return (
                <div key={row.ma} style={{ display: 'flex', alignItems: 'center', height: 56, gap: 14 }}>
                  {/* Tên BCVH */}
                  <div style={{
                    width: 150,
                    flexShrink: 0,
                    fontSize: 26,
                    fontWeight: 700,
                    color: TV.textPrimary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {row.ten?.replace(/^BCVH\s+/, '') || row.ma}
                  </div>

                  {/* Thanh chia hai đoạn */}
                  <div style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 8,
                    background: '#1e293b',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: `${rowWidthPct}%`,
                      height: '100%',
                      display: 'flex',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      {trong > 0 && (
                        <div style={{
                          width: `${pTrong}%`,
                          height: '100%',
                          background: '#fbbf24',
                          color: '#1c1917',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isTrongNarrow ? 20 : 22,
                          fontWeight: 800,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}>
                          {trong}
                        </div>
                      )}
                      {tu1 > 0 && (
                        <div style={{
                          width: `${pTu1}%`,
                          height: '100%',
                          background: '#f87171',
                          color: '#450a0a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isTu1Narrow ? 20 : 22,
                          fontWeight: 800,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}>
                          {tu1}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Số tổng của hàng ở bên phải */}
                  <div style={{
                    width: 44,
                    flexShrink: 0,
                    textAlign: 'right',
                    fontSize: 32,
                    fontWeight: 800,
                    color: TV.textPrimary,
                    whiteSpace: 'nowrap',
                  }}>
                    {formatViVN(tong)}
                  </div>
                </div>
              );
            })}

            {/* Các BCVH có dữ liệu và buu_gui === 0: gộp một dòng cuối */}
            {zeroRows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, marginTop: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                <span style={{ fontSize: 22, color: '#94a3b8' }}>
                  {zeroRows.length} BCVH còn lại: không có hàng chờ
                </span>
              </div>
            )}

            {/* BCVH chưa có dữ liệu */}
            {noDataRows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, marginTop: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#64748b', flexShrink: 0 }} />
                <span style={{ fontSize: 22, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Chưa có dữ liệu: {noDataRows.map((r) => (r.ten || r.ma || '').replace(/^BCVH\s+/, '')).join(', ')}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Chân khối */}
      <div style={{
        marginTop: 'auto',
        paddingTop: 12,
        fontSize: 16,
        color: '#64748b',
      }}>
        Dữ liệu ngày {formatDdMm(ngayDuLieu) || '—'} · ngày trước xem trên web
      </div>
    </div>
  );
}

// ── Cột Phải — Bảng 12: Chưa nhận + Phường/xã ───────────────────────────────
// Chip phường/xã trên nền tối: cùng quy tắc / chữ với DASH-2b (wardChangeChip), chỉ đổi bảng màu cho tivi.
const TV_CHIP_STYLE = {
  moi_co:   { color: '#d1d5db', bg: TV.bgCardNested, border: TV.border },
  bang:     { color: TV.textSecondary, bg: TV.bgCardNested, border: TV.border },
  giam:     { color: TV.green, bg: TV.greenBg, border: 'rgba(52, 211, 153, 0.3)' },
  tang_cao: { color: TV.red, bg: TV.redBg, border: 'rgba(248, 113, 113, 0.3)' },
  tang:     { color: TV.yellow, bg: TV.yellowBg, border: 'rgba(251, 191, 36, 0.3)' },
};

// Bố cục cột phải bảng 12 ở sân khấu 1920×1080 (chiều cao hàng B ≈ 681 px):
// thẻ «Chưa nhận» ≈ 297 px + khe 16 px -> thẻ phường/xã ≈ 368 px; 3 dòng × 64 px + 2 khe × 12 px = 216 px
// vừa trong phần thân ≈ 289 px (trừ đệm và tiêu đề), không đè dòng «Dữ liệu đến … · Làm mới …».
function ColChuaNhanBCVH({ chuaNhan, pxItems, bcvhScope, ngayDuLieu, tangCaoPct }) {
  const colStyle = {
    width: 540,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minHeight: 0,
    overflow: 'hidden',
  };

  const cn = chuaNhan || {};
  const tu1 = cn.cho_tu_1_ngay || 0;
  // «QUA NGÀY» là ô DUY NHẤT có số thật trong code từ API (cho_tu_1_ngay).
  // Chỉ tô màu theo mức cho ô có số thật:
  // - Nếu > 0: tô màu đỏ mức xử lý ngay.
  // - Nếu = 0: màu trung tính («Không có»).
  const quaNgay = tu1 > 0
    ? { label: 'QUA NGÀY', val: tu1, note: 'Xử lý ngay', bg: TV.redBg, border: '#7f1d1d', col: TV.red, noteCol: '#fca5a5' }
    : { label: 'QUA NGÀY', val: 0,   note: 'Không có',   bg: TV.bgCardNested, border: TV.border, col: TV.textSecondary, noteCol: '#64748b' };

  // 3 ô đầu hiện tại là «Sắp có» (chưa có dữ liệu chia theo giờ từ backend), để màu trung tính
  const cells = [
    { label: 'DƯỚI 2 GIỜ', val: null, note: 'Chia theo giờ: sắp có', bg: TV.bgCardNested, border: TV.border, col: '#64748b', noteCol: TV.textSecondary },
    { label: '2–4 GIỜ',    val: null, note: 'Chia theo giờ: sắp có', bg: TV.bgCardNested, border: TV.border, col: '#64748b', noteCol: TV.textSecondary },
    { label: 'TRÊN 4 GIỜ', val: null, note: 'Chia theo giờ: sắp có', bg: TV.bgCardNested, border: TV.border, col: '#64748b', noteCol: TV.textSecondary },
    quaNgay,
  ];

  return (
    <div style={colStyle}>
      {/* Khối chưa nhận */}
      <div style={{
        flexShrink: 0,
        background: TV.bgCard,
        border: `1.5px solid ${TV.border}`,
        borderRadius: 20,
        padding: '20px 24px',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: TV.textPrimary, lineHeight: 1.2, marginBottom: 12, whiteSpace: 'nowrap' }}>
          Chưa nhận tại BCVH, đã chờ bao lâu?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {cells.map((cell) => (
            <div key={cell.label} style={{
              background: cell.bg,
              border: `1.5px solid ${cell.border}`,
              borderRadius: 12,
              padding: '10px 12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TV.textSecondary, letterSpacing: 1, lineHeight: 1.2, marginBottom: 6 }}>
                {cell.label}
              </div>
              {cell.val !== null ? (
                <div style={{ fontSize: 40, fontWeight: 900, color: cell.col, lineHeight: 1 }}>
                  {formatViVN(cell.val)}
                </div>
              ) : (
                <div style={{ fontSize: 20, fontWeight: 700, color: '#64748b', lineHeight: '40px' }}>Sắp có</div>
              )}
              <div style={{ fontSize: 14, color: cell.noteCol, lineHeight: 1.2, marginTop: 4 }}>
                {cell.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Khối phường/xã */}
      <div style={{
        flex: 1,
        minHeight: 0,
        background: TV.bgCard,
        border: `1.5px solid ${TV.border}`,
        borderRadius: 20,
        padding: '20px 24px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: TV.textPrimary, lineHeight: 1.2, marginBottom: 12, whiteSpace: 'nowrap' }}>
          {isVnToday(ngayDuLieu)
            ? 'Phường/xã đến tăng mạnh hôm nay'
            : `Phường/xã đến tăng mạnh ${formatDdMm(ngayDuLieu)}`}
        </div>
        {pxItems.length === 0 ? (
          <div style={{ color: TV.textSecondary, fontSize: 20, textAlign: 'center', marginTop: 12 }}>
            Chưa có phường/xã nào tăng đột biến
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pxItems.slice(0, 3).map((px, i) => {
              const maxV = Math.max(px.hom_kia || 0, px.hom_qua || 0, px.hom_nay || 0, 1);
              const chip = wardChangeChip(px, tangCaoPct);
              const cs = TV_CHIP_STYLE[chip.loai] || TV_CHIP_STYLE.bang;

              return (
                <div key={`${px.ward_key}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 64 }}>
                  {/* Tên phường/xã (dòng trên) + chip tăng/giảm (dòng dưới) */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#d1d5db', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {px.ten || px.ward_key}
                    </div>
                    <div>
                      <span style={{
                        display: 'inline-block',
                        fontSize: 18, fontWeight: 800, lineHeight: 1.2,
                        color: cs.color, background: cs.bg, border: `1px solid ${cs.border}`,
                        borderRadius: 999, padding: '2px 12px', whiteSpace: 'nowrap',
                      }}>
                        {chip.text}
                      </span>
                    </div>
                  </div>
                  {/* 3 cột mini: hôm kia, hôm qua, hôm nay (cột hôm nay màu trắng nổi bật, các cột khác tối giản) */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, flexShrink: 0 }}>
                    {[
                      { v: px.hom_kia, col: '#475569' },
                      { v: px.hom_qua, col: '#64748b' },
                      { v: px.hom_nay, col: '#ffffff' },
                    ].map((bar, bi) => (
                      <div key={bi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: 32 }}>
                        <div style={{
                          fontSize: 14,
                          color: bi === 2 ? '#ffffff' : TV.textSecondary,
                          fontWeight: bi === 2 ? 800 : 500,
                          lineHeight: 1.2,
                          marginBottom: 2,
                        }}>
                          {bar.v ?? '—'}
                        </div>
                        <div style={{
                          width: '100%',
                          height: bar.v !== null && bar.v !== undefined ? `${Math.max(6, (bar.v / maxV) * 34)}px` : 4,
                          background: bar.col,
                          borderRadius: '3px 3px 0 0',
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ tongQuan, lastOk }) {
  const timeStr = formatTimeOnly(tongQuan?.den_luc) || '—';
  const dataLabel = isVnToday(tongQuan?.ngay_du_lieu)
    ? `Dữ liệu đến ${timeStr}`
    : `Dữ liệu ${formatDdMm(tongQuan?.ngay_du_lieu)} · đến ${timeStr}`;

  return (
    <div style={{
      marginTop: 14,
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
    }}>
      <div style={{ fontSize: 16, color: TV.textSecondary, fontWeight: 500 }}>
        {dataLabel}
        {' · '}
        Làm mới {lastOk ? formatDateTimeSec(lastOk) : '—'}
      </div>
    </div>
  );
}
