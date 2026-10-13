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
  formatTimeOnly,
  formatDateTimeSec,
  wardChangeChip,
} from './arrivals/DailyOpsDashboard';

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
const SLIDE_MS  = 5_000;         // 5 giây đổi thẻ việc
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
function tvActionTitle(item, isAll) {
  const { loai, muc, ten_bcvh, tieu_de_khoa } = item;
  const sfx = isAll ? `: ${ten_bcvh}` : '';
  if (loai === 'chua_nhan_tai_bcvh') {
    if (muc === 'xu_ly_ngay') return `Đã lập BD10 về BCVH, chưa có XN nhận${sfx}`;
    return `Bưu gửi chưa có XN nhận tại BCVH${sfx}`;
  }
  if (loai === 'bd10_chua_xnd') {
    if (muc === 'xu_ly_ngay') return `BD10 đến chưa XNĐ cao (vượt 10%)${sfx}`;
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

// ─── Hook carousel việc cần làm ──────────────────────────────────────────────
function useCarousel(items) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) { setIdx(0); return; }
    const t = setInterval(() => setIdx((p) => (p + 1) % items.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [items.length]);
  // Reset khi danh sách thay đổi
  useEffect(() => { setIdx(0); }, [items]);
  return idx;
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

  const actionItems = useMemo(() => viecCanLam?.items || [], [viecCanLam]);
  const slideIdx = useCarousel(actionItems);
  const currentItem = actionItems[slideIdx] || null;

  // Thẻ sản lượng
  const slBuuGui = isAll
    ? tongQuan?.san_luong?.buu_gui
    : tongQuan?.theo_bcvh?.find((r) => r.ma === bcvhScope)?.san_luong?.buu_gui
      ?? tongQuan?.san_luong?.buu_gui;

  const hangNang = tongQuan?.hang_nang;
  const sau15h   = tongQuan?.sau_15h;

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
            hangNang={hangNang}
            sau15h={sau15h}
            tongQuan={tongQuan}
          />

          <div style={{ height: 24 }} />

          {/* ── HÀNG B: 3 KHỐI ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
            {/* Cột Trái: Việc cần làm */}
            <ColViec
              items={actionItems}
              currentItem={currentItem}
              slideIdx={slideIdx}
              isAll={isAll}
            />

            {/* Cột Giữa */}
            {isAll ? (
              <ColXepHang />
            ) : (
              <ColKhungGio />
            )}

            {/* Cột Phải */}
            {isAll ? (
              <ColChuaNhanAll chuaNhanList={chuaNhanBcvhList} />
            ) : (
              <ColChuaNhanBCVH
                chuaNhan={chuaNhanBcvh12}
                pxItems={pxItems}
                bcvhScope={bcvhScope}
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
          Cần điều hành ngay hôm nay
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

// ── Hàng A: 4 thẻ ────────────────────────────────────────────────────────────
function RowA({ isAll, slBuuGui, hangNang, sau15h, tongQuan }) {
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

  // Thẻ PTC nổi nhất (màu trắng/sáng theo canvas, dựng khung, giá trị là «–», badge «SẮP CÓ»)
  const ptcCardStyle = {
    ...cardStyle,
    flex: 1.35,
    background: '#ffffff',
    border: '2px solid #e2e8f0',
  };

  return (
    <div style={{ display: 'flex', gap: 20, height: 196 }}>
      {/* Thẻ 1: Sản lượng đến */}
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TV.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
          {isAll ? 'Sản lượng đến' : 'Hàng đến hôm nay'}
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
          {slBuuGui !== null && slBuuGui !== undefined ? formatViVN(slBuuGui) : '—'}
        </div>
        <div style={{ fontSize: 20, color: TV.textSecondary, marginTop: 4 }}>
          {tongQuan?.san_luong?.so_hom_qua_cung_gio?.chenh_pct !== undefined
            ? `${formatPctChange(tongQuan.san_luong.so_hom_qua_cung_gio.chenh_pct)} so hôm qua cùng giờ`
            : 'chưa đủ dữ liệu'}
        </div>
      </div>

      {/* Thẻ 2: PTC — Khung giống canvas, giá trị là «–», badge «SẮP CÓ», giữ nguyên nhãn hiện tại */}
      <div style={ptcCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: 1, textTransform: 'uppercase' }}>
            PHÁT THÀNH CÔNG (PTC)
          </div>
          <span style={{
            background: '#0b0f14', color: '#ffffff',
            borderRadius: 9999, padding: '4px 14px', fontSize: 16, fontWeight: 800,
            letterSpacing: '0.05em',
          }}>
            SẮP CÓ
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 68, fontWeight: 900, color: '#64748b', lineHeight: 1 }}>
            –
          </span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#64748b', marginTop: 4 }}>
          Module «Xử lý và tỷ lệ phát» đang được xây dựng
        </div>
      </div>

      {/* Thẻ 3: Hàng nặng */}
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TV.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
          Hàng nặng ≥ 2 kg
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
          {formatPercent(hangNang?.ty_le)}
        </div>
        <div style={{ fontSize: 20, color: TV.textSecondary, marginTop: 4 }}>
          {hangNang?.buu_gui !== undefined ? `${formatViVN(hangNang.buu_gui)} bưu gửi` : '—'}
          {hangNang?.khong_co_khoi_luong > 0 && ` · ${formatViVN(hangNang.khong_co_khoi_luong)} chưa có khối lượng`}
        </div>
      </div>

      {/* Thẻ 4: Đến sau 15:00 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 700, color: TV.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
          Đến sau 15:00
        </div>
        {sau15h?.da_toi_gio ? (
          <>
            <div style={{ fontSize: 72, fontWeight: 900, color: TV.textPrimary, lineHeight: 1, marginTop: 8 }}>
              {formatPercent(sau15h.ty_le)}
            </div>
            <div style={{ fontSize: 20, color: TV.textSecondary, marginTop: 4 }}>
              {formatViVN(sau15h.buu_gui)} bưu gửi
            </div>
          </>
        ) : (
          <div style={{ fontSize: 32, fontWeight: 700, color: TV.textSecondary, marginTop: 16 }}>
            Chưa tới 15:00
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cột Trái: Việc cần làm ────────────────────────────────────────────────────
function ColViec({ items, currentItem, slideIdx, isAll }) {
  const colStyle = {
    width: 500,
    flexShrink: 0,
    background: TV.bgCard,
    border: `1.5px solid ${TV.border}`,
    borderRadius: 20,
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={colStyle}>
      {/* Tiêu đề một dòng (không xuống dòng giữa chữ); ghi chú ở dòng riêng bên dưới */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: TV.textPrimary, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {isAll ? 'Việc cần làm' : 'Việc của BCVH tôi'}
        </div>
        <div style={{ fontSize: 18, color: TV.textSecondary, lineHeight: 1.2, marginTop: 6, whiteSpace: 'nowrap' }}>
          đổi thẻ mỗi 5 giây · <span style={{ color: TV.yellow }}>Xử lý ngay</span> trước
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: TV.green, textAlign: 'center' }}>
            Hôm nay chưa có việc cần điều hành
          </div>
        </div>
      ) : (
        <>
          {/* Thẻ việc hiện tại */}
          {currentItem && (
            <ActionCard item={currentItem} isAll={isAll} />
          )}
          {/* Phân trang */}
          {items.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center' }}>
              {items.map((_, i) => (
                <div key={i} style={{
                  width: i === slideIdx ? 28 : 10, height: 10, borderRadius: 5,
                  background: i === slideIdx ? TV.yellow : TV.border,
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionCard({ item, isAll }) {
  const isXuLy = item.muc === 'xu_ly_ngay';
  const { val, unit } = tvActionValue(item);

  return (
    <div style={{
      background: isXuLy ? TV.redBg : TV.yellowBg,
      border: `2px solid ${isXuLy ? '#7f1d1d' : '#78350f'}`,
      borderRadius: 16,
      padding: '24px 28px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <span style={{
          display: 'inline-block',
          background: isXuLy ? '#be123c' : '#b45309',
          color: '#fff',
          borderRadius: 8,
          padding: '4px 14px',
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 16,
        }}>
          {isXuLy ? 'Xử lý ngay' : 'Trong ngày'}
        </span>
        <div style={{ fontSize: 28, fontWeight: 800, color: TV.textPrimary, lineHeight: 1.3 }}>
          {tvActionTitle(item, isAll)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 16 }}>
        <span style={{
          fontSize: 64, fontWeight: 900,
          color: isXuLy ? '#fca5a5' : '#fcd34d',
          lineHeight: 1,
        }}>
          {val}
        </span>
        <span style={{ fontSize: 24, color: TV.textSecondary, fontWeight: 600 }}>{unit}</span>
      </div>
    </div>
  );
}

// ── Cột Giữa — Bảng 11: Xếp hạng BCVH (Sắp có) ─────────────────────────────
function ColXepHang() {
  return (
    <div style={{
      flex: 1,
      background: TV.bgCard,
      border: `1.5px solid ${TV.border}`,
      borderRadius: 20,
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    }}>
      <span style={{
        background: '#0b0f14', color: '#ffffff', border: `1px solid ${TV.border}`,
        borderRadius: 9999, padding: '4px 16px', fontSize: 18, fontWeight: 800,
        marginBottom: 20, letterSpacing: '0.05em',
      }}>
        SẮP CÓ
      </span>
      <div style={{ fontSize: 32, fontWeight: 900, color: TV.textPrimary, marginBottom: 12 }}>
        Xếp hạng BCVH · PTC
      </div>
      <div style={{ fontSize: 22, color: TV.textSecondary, maxWidth: 400 }}>
        Tính năng xếp hạng theo tỉ lệ phát thành công thuộc module «Xử lý và tỷ lệ phát»
      </div>
    </div>
  );
}

// ── Cột Giữa — Bảng 12: Khung giờ (Sắp có) ──────────────────────────────────
function ColKhungGio() {
  return (
    <div style={{
      flex: 1,
      background: TV.bgCard,
      border: `1.5px solid ${TV.border}`,
      borderRadius: 20,
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    }}>
      <span style={{
        background: '#0b0f14', color: '#ffffff', border: `1px solid ${TV.border}`,
        borderRadius: 9999, padding: '4px 16px', fontSize: 18, fontWeight: 800,
        marginBottom: 20, letterSpacing: '0.05em',
      }}>
        SẮP CÓ
      </span>
      <div style={{ fontSize: 32, fontWeight: 900, color: TV.textPrimary, marginBottom: 12 }}>
        Hôm nay từng khung giờ
      </div>
      <div style={{ fontSize: 22, color: TV.textSecondary, maxWidth: 400 }}>
        Thống kê PTC theo từng khung giờ thuộc module «Xử lý và tỷ lệ phát»
      </div>
    </div>
  );
}

// ── Cột Phải — Bảng 11: Chưa nhận tất cả BCVH ───────────────────────────────
function ColChuaNhanAll({ chuaNhanList }) {
  const colStyle = {
    width: 540,
    flexShrink: 0,
    background: TV.bgCard,
    border: `1.5px solid ${TV.border}`,
    borderRadius: 20,
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={colStyle}>
      <div style={{ fontSize: 26, fontWeight: 900, color: TV.textPrimary, marginBottom: 8 }}>
        Chưa nhận tại BCVH, đã chờ bao lâu?
      </div>
      <div style={{ fontSize: 18, color: TV.textSecondary, marginBottom: 20 }}>
        Trong ngày <span style={{ color: TV.yellow, fontWeight: 700 }}>■</span>
        {' '}· Từ 1 ngày trở lên <span style={{ color: TV.red, fontWeight: 700 }}>■</span>
        {' '}· Chia theo giờ: <span style={{ color: TV.textSecondary }}>sắp có</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chuaNhanList.length === 0 ? (
          <div style={{ color: TV.textSecondary, fontSize: 22, textAlign: 'center', marginTop: 20 }}>
            Chưa có dữ liệu
          </div>
        ) : chuaNhanList.map((row) => {
          const cn = row.chua_nhan || {};
          const tong = cn.buu_gui || 0;
          const tu1  = cn.cho_tu_1_ngay || 0;
          const trong = Math.max(0, tong - tu1);
          const pTrong = tong > 0 ? (trong / tong) * 100 : 0;
          const pTu1   = tong > 0 ? (tu1 / tong) * 100 : 0;
          // BCVH chưa có file dữ liệu nào: không hiện số 0 (0 ở đây không có nghĩa "không có bưu gửi chờ").
          const coDuLieu = row.co_du_lieu !== false;

          return (
            <div key={row.ma} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
              <div style={{ width: 160, flexShrink: 0, fontSize: 22, fontWeight: 700, color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.ten?.replace('BCVH ', '') || row.ma}
              </div>
              <div style={{ flex: 1 }}>
                {!coDuLieu ? (
                  <div style={{ fontSize: 18, color: TV.textSecondary, padding: '6px 12px' }}>
                    chưa có dữ liệu
                  </div>
                ) : tong === 0 ? (
                  <div style={{ fontSize: 20, color: '#475569', background: TV.bgCardNested, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    0 bưu gửi
                  </div>
                ) : (
                  <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', background: TV.bgCardNested }}>
                    {trong > 0 && (
                      <div style={{ width: `${pTrong}%`, background: TV.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#1a0a00' }}>
                        {trong}
                      </div>
                    )}
                    {tu1 > 0 && (
                      <div style={{ width: `${pTu1}%`, background: TV.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>
                        {tu1}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ width: 64, flexShrink: 0, fontSize: 24, fontWeight: 900, color: tong > 0 ? TV.textPrimary : '#475569', textAlign: 'right' }}>
                {coDuLieu ? formatViVN(tong) : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cột Phải — Bảng 12: Chưa nhận + Phường/xã ───────────────────────────────
// Chip phường/xã trên nền tối: cùng quy tắc / chữ với DASH-2b (wardChangeChip), chỉ đổi bảng màu cho tivi.
const TV_CHIP_STYLE = {
  moi_co:   { color: '#d1d5db', bg: '#1f2937', border: '#374151' },
  bang:     { color: '#9ca3af', bg: '#1f2937', border: '#374151' },
  giam:     { color: '#6ee7b7', bg: '#052e16', border: '#065f46' },
  tang_cao: { color: '#fca5a5', bg: '#3b0000', border: '#7f1d1d' },
  tang:     { color: '#fcd34d', bg: '#2d1a00', border: '#78350f' },
};

// Bố cục cột phải bảng 12 ở sân khấu 1920×1080 (chiều cao hàng B ≈ 681 px):
// thẻ «Chưa nhận» ≈ 297 px + khe 16 px -> thẻ phường/xã ≈ 368 px; 3 dòng × 64 px + 2 khe × 12 px = 216 px
// vừa trong phần thân ≈ 289 px (trừ đệm và tiêu đề), không đè dòng «Dữ liệu đến … · Làm mới …».
function ColChuaNhanBCVH({ chuaNhan, pxItems, bcvhScope }) {
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
          Phường/xã đến tăng mạnh hôm nay
        </div>
        {pxItems.length === 0 ? (
          <div style={{ color: TV.textSecondary, fontSize: 20, textAlign: 'center', marginTop: 12 }}>
            Chưa có phường/xã nào tăng đột biến
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pxItems.slice(0, 3).map((px, i) => {
              const maxV = Math.max(px.hom_kia || 0, px.hom_qua || 0, px.hom_nay || 0, 1);
              const chip = wardChangeChip(px);
              const cs = TV_CHIP_STYLE[chip.loai];

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
                  {/* 3 cột mini: hôm kia, hôm qua, hôm nay */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, flexShrink: 0 }}>
                    {[
                      { v: px.hom_kia, col: '#3b82f6' },
                      { v: px.hom_qua, col: '#60a5fa' },
                      { v: px.hom_nay, col: '#ea580c' },
                    ].map((bar, bi) => (
                      <div key={bi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: 32 }}>
                        <div style={{ fontSize: 14, color: TV.textSecondary, lineHeight: 1.2, marginBottom: 2 }}>{bar.v ?? '—'}</div>
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
  return (
    <div style={{
      marginTop: 14,
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
    }}>
      <div style={{ fontSize: 16, color: TV.textSecondary, fontWeight: 500 }}>
        Dữ liệu đến {formatTimeOnly(tongQuan?.den_luc) || '—'}
        {' · '}
        Làm mới {lastOk ? formatDateTimeSec(lastOk) : '—'}
      </div>
    </div>
  );
}
