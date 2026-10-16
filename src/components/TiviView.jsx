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

function tvActionSub(item, isAll) {
  const { loai, so_lieu, ten_bcvh } = item;
  const pfx = isAll && ten_bcvh ? `${ten_bcvh} · ` : '';
  if (loai === 'chua_nhan_tai_bcvh') {
    const choTu1 = so_lieu?.cho_tu_1_ngay || 0;
    if (choTu1 > 0) return `${pfx}đã chờ từ 1 ngày: ${formatViVN(choTu1)}`;
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

// ─── Hook carousel phân trang việc cần làm (5 giây đổi trang) ────────────────
function useCarouselPages(totalPages) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (totalPages <= 1) { setPage(0); return; }
    const t = setInterval(() => setPage((p) => (p + 1) % totalPages), SLIDE_MS);
    return () => clearInterval(t);
  }, [totalPages]);
  // Reset khi tổng số trang thay đổi
  useEffect(() => { setPage(0); }, [totalPages]);
  return page;
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

  // Sắp xếp «Xử lý ngay» đứng trước
  const rawActionItems = useMemo(() => viecCanLam?.items || [], [viecCanLam]);
  const actionItems = useMemo(() => {
    return [...rawActionItems].sort((a, b) => {
      const aX = a.muc === 'xu_ly_ngay' ? 1 : 0;
      const bX = b.muc === 'xu_ly_ngay' ? 1 : 0;
      return bX - aX;
    });
  }, [rawActionItems]);

  const ACTION_PAGE_SIZE = 4;
  const totalActionPages = Math.ceil(actionItems.length / ACTION_PAGE_SIZE) || 1;
  const actionPage = useCarouselPages(totalActionPages);
  const currentActionItems = useMemo(() => {
    return actionItems.slice(actionPage * ACTION_PAGE_SIZE, (actionPage + 1) * ACTION_PAGE_SIZE);
  }, [actionItems, actionPage]);

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
          />

          <div style={{ height: 24 }} />

          {/* ── HÀNG B: 3 KHỐI ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
            {/* Cột Trái: Việc cần làm */}
            <ColViec
              items={currentActionItems}
              totalItems={actionItems.length}
              currentPage={actionPage}
              totalPages={totalActionPages}
              isAll={isAll}
              ngayDuLieu={tongQuan?.ngay_du_lieu}
            />

            {/* Cột Giữa */}
            {isAll ? (
              <ColXepHang />
            ) : (
              <ColKhungGio ngayDuLieu={tongQuan?.ngay_du_lieu} />
            )}

            {/* Cột Phải */}
            {isAll ? (
              <ColChuaNhanAll chuaNhanList={chuaNhanBcvhList} />
            ) : (
              <ColChuaNhanBCVH
                chuaNhan={chuaNhanBcvh12}
                pxItems={pxItems}
                bcvhScope={bcvhScope}
                ngayDuLieu={phuongXa?.ngay_du_lieu || tongQuan?.ngay_du_lieu}
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

// ── Hàng A: 4 thẻ ────────────────────────────────────────────────────────────
function RowA({ isAll, slBuuGui, hangDiNgoai, chuyenChieu, tongQuan }) {
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
function ColViec({ items, totalItems, currentPage, totalPages, isAll, ngayDuLieu }) {
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
          đổi thẻ mỗi 5 giây · <span style={{ color: TV.yellow }}>Xử lý ngay</span> trước
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
        <>
          {/* Tối đa 4 thẻ xếp chồng, cao vừa nội dung (không kéo giãn bằng cột), xếp từ trên xuống */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            {items.map((item, idx) => (
              <ActionCardStack key={`${item.loai}-${item.ten_bcvh || ''}-${idx}`} item={item} isAll={isAll} />
            ))}
          </div>

          {/* Phân trang khi có hơn 4 thẻ */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <div key={i} style={{
                  width: i === currentPage ? 28 : 10,
                  height: 8,
                  borderRadius: 4,
                  background: i === currentPage ? TV.yellow : TV.border,
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

function ActionCardStack({ item, isAll }) {
  const isXuLy = item.muc === 'xu_ly_ngay';
  const { val, unit } = tvActionValue(item);
  const sub = tvActionSub(item, isAll);

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
        }} title={tvActionTitle(item, isAll)}>
          {tvActionTitle(item, isAll)}
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

// ── Cột Giữa — Bảng 11: Xếp hạng BCVH - PTC ─────────────────────────────
function ColXepHang() {
  const TABS = ['Cả ngày', '<10h', '10–12h', '12–14h', '14–16h', '16–18h', '>18h'];

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
          Xếp hạng BCVH · PTC
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

      {/* Tab khung giờ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
        {TABS.map((tab, idx) => (
          <span key={tab} style={{
            background: idx === 0 ? '#ffffff' : TV.bgCardNested,
            color: idx === 0 ? '#0f172a' : TV.textSecondary,
            border: `1px solid ${idx === 0 ? '#ffffff' : TV.border}`,
            borderRadius: 9999,
            padding: '3px 12px',
            fontSize: 14,
            fontWeight: idx === 0 ? 800 : 600,
            whiteSpace: 'nowrap',
          }}>
            {tab}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 14, color: TV.textSecondary, marginBottom: 14 }}>
        Tính năng xếp hạng theo tỉ lệ phát thành công thuộc module «Xử lý và tỷ lệ phát»
      </div>

      {/* 6 BCVH với thanh tiến độ rỗng và giá trị «–», không số mẫu, không mũi tên */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
        {BCVH_LIST.map((bcvh, idx) => (
          <div key={bcvh.ma} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '8px 14px',
            background: TV.bgCardNested,
            border: `1px solid ${TV.border}`,
            borderRadius: 12,
          }}>
            <span style={{ width: 20, fontSize: 18, fontWeight: 800, color: TV.textSecondary, textAlign: 'center' }}>
              {idx + 1}
            </span>
            <span style={{ width: 130, fontSize: 18, fontWeight: 700, color: TV.textPrimary, whiteSpace: 'nowrap' }}>
              {bcvh.ten.replace('BCVH ', '')}
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

// ── Cột Phải — Bảng 11: Chưa nhận tất cả BCVH ───────────────────────────────
function ColChuaNhanAll({ chuaNhanList }) {
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

  return (
    <div style={colStyle}>
      <div style={{ fontSize: 26, fontWeight: 900, color: TV.textPrimary, marginBottom: 16 }}>
        Chưa nhận tại BCVH, đã chờ bao lâu?
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
          const coDuLieu = row.co_du_lieu !== false;

          return (
            <div key={row.ma} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 46 }}>
              <div style={{ width: 140, flexShrink: 0, fontSize: 20, fontWeight: 700, color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.ten?.replace('BCVH ', '') || row.ma}
              </div>
              <div style={{ flex: 1 }}>
                {!coDuLieu ? (
                  <div style={{ fontSize: 16, color: TV.textSecondary, padding: '6px 12px' }}>
                    chưa có dữ liệu
                  </div>
                ) : tong === 0 ? (
                  <div style={{ fontSize: 18, color: '#475569', background: TV.bgCardNested, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                    0 bưu gửi
                  </div>
                ) : (
                  <div style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden', background: TV.bgCardNested }}>
                    {trong > 0 && (
                      <div style={{ width: `${pTrong}%`, background: TV.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#1a0a00' }}>
                        {trong}
                      </div>
                    )}
                    {tu1 > 0 && (
                      <div style={{ width: `${pTu1}%`, background: TV.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff' }}>
                        {tu1}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ width: 56, flexShrink: 0, fontSize: 22, fontWeight: 900, color: tong > 0 ? TV.textPrimary : '#475569', textAlign: 'right' }}>
                {coDuLieu ? formatViVN(tong) : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chú thích màu ở đáy */}
      <div style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: `1px solid ${TV.border}`,
        fontSize: 15,
        color: TV.textSecondary,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: TV.yellow }} />
          <span>Trong ngày</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: TV.red }} />
          <span>Từ 1 ngày trở lên</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: TV.textSecondary }}>Chia theo giờ: sắp có</span>
        </div>
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
function ColChuaNhanBCVH({ chuaNhan, pxItems, bcvhScope, ngayDuLieu }) {
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
              const chip = wardChangeChip(px);
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
