import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginView from './components/LoginView';
import NetworkListView from './components/NetworkListView';
import UserAdminView from './components/UserAdminView';
import ArrivalsView from './components/arrivals/ArrivalsView';
import DailyOpsDashboard from './components/arrivals/DailyOpsDashboard';
import TiviView from './components/TiviView';
import ProcessingDeliveryView from './components/phat/ProcessingDeliveryView';
import ReplaceDayView from './components/arrivals/ReplaceDayView';
import SourceIngestView from './components/arrivals/SourceIngestView';
import ThamSoView from './components/thamso/ThamSoView';
import { BCVH_LIST } from './constants/bcvh';
import { getToken, setToken, clearToken, decodeJwtPayload, isTokenExpired, AUTH_EXPIRED_EVENT, apiFetchJson } from './utils/api';

// Đọc token đã lưu (nếu có) ngay lúc khởi tạo state, để tránh nháy màn hình
// nội dung chính rồi mới bị đá về LoginView. Token hết hạn (claim "exp")
// bị coi như chưa đăng nhập ngay từ đầu, không cần đợi request đầu tiên 401.
function getInitialAuthUser() {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    if (token) clearToken();
    return null;
  }
  return decodeJwtPayload(token);
}

// Đọc tham số ?tv=1 và &bcvh=... từ URL
function readTvParams() {
  const sp = new URLSearchParams(window.location.search);
  return {
    tvMode: sp.get('tv') === '1',
    tvBcvh: sp.get('bcvh') || null,   // null nghĩa là 'all'
  };
}

// Vai trò được vào chế độ tivi. STAFF mở ?tv=1 thì bỏ qua tham số, vào giao diện thường.
const TV_ROLES = ['ADMIN', 'TTVH', 'GDVH', 'TIVI'];
// /api/auth/me lỗi khác 401 hoặc không có phản hồi (mất mạng, backend chưa lên sau mất điện, 5xx): thử lại sau 10 giây.
const ME_RETRY_MS = 10_000;

export default function App() {
  const [activeTab, setActiveTab] = useState('ops_today');
  const [authUser, setAuthUser] = useState(getInitialAuthUser);
  const [arrivalsNavParams, setArrivalsNavParams] = useState(null);

  // Chế độ tivi — true nếu TIVI role hoặc ?tv=1
  const [tvMode, setTvMode] = useState(() => {
    const user = getInitialAuthUser();
    if (user?.role === 'TIVI') return true;
    return readTvParams().tvMode;
  });
  const [tvBcvhParam] = useState(() => readTvParams().tvBcvh);

  const isViewer = ['ADMIN', 'TTVH', 'GDVH'].includes(authUser?.role);
  const isAdmin  = authUser?.role === 'ADMIN';
  const isTiviRole = authUser?.role === 'TIVI';
  const canTv = TV_ROLES.includes(authUser?.role);

  // Phạm vi tivi cho ADMIN/TTVH/GDVH vào qua ?tv=1: lấy từ URL
  const nonTiviScope = (() => {
    if (tvBcvhParam && tvBcvhParam !== 'all') {
      const valid = BCVH_LIST.some((b) => b.ma === tvBcvhParam);
      return valid ? tvBcvhParam : 'all';
    }
    return 'all';
  })();

  // Phạm vi tivi cho TIVI role: gọi /api/auth/me để lấy tivi_scope mới nhất.
  // undefined = đang tải, null = chưa gán, string = đã gán.
  const [tiviScopeFromApi, setTiviScopeFromApi] = useState(undefined);

  // Nếu vừa đăng nhập là TIVI thì tự vào chế độ tivi
  useEffect(() => {
    if (authUser?.role === 'TIVI') setTvMode(true);
  }, [authUser?.role]);

  // Nếu activeTab còn lưu 'dashboard' từ phiên cũ, rơi về trang mặc định mới
  useEffect(() => {
    if (activeTab === 'dashboard') {
      setActiveTab('ops_today');
    }
  }, [activeTab]);

  // Gọi GET /api/auth/me để lấy tivi_scope mới nhất mỗi khi vào chế độ tivi với TIVI role.
  // Không đọc từ JWT vì token có thể được tạo trước khi admin gán phạm vi.
  // Chỉ coi là "chưa gán phạm vi" khi API trả THÀNH CÔNG với tivi_scope = null. Lỗi khác 401 / không có phản hồi:
  // giữ trạng thái đang kết nối (undefined) và thử lại sau ME_RETRY_MS, lặp tới khi được — tivi chạy 24/24 có thể
  // bật trước khi backend lên (sau mất điện), không được kẹt ở màn "chưa gán phạm vi".
  useEffect(() => {
    if (!isTiviRole || !tvMode) return undefined;
    let cancelled = false;
    let retryTimer = null;
    const retry = () => {
      if (!cancelled) retryTimer = setTimeout(load, ME_RETRY_MS);
    };
    function load() {
      apiFetchJson('/api/auth/me').then((res) => {
        if (cancelled) return;
        if (res.ok) {
          // Lấy tivi_scope từ phản hồi API (null = chưa gán, string = đã gán)
          setTiviScopeFromApi(res.data?.tivi_scope ?? null);
        } else if (res.status === 401) {
          clearToken();
          setAuthUser(null);
          setTvMode(false);
        } else {
          retry();
        }
      }).catch(retry);
    }
    setTiviScopeFromApi(undefined); // reset về trạng thái đang kết nối
    load();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [isTiviRole, tvMode]);

  // Phạm vi thực sự truyền vào TiviView
  const tiviScope = tvMode
    ? isTiviRole
      ? tiviScopeFromApi  // undefined = đang tải → TiviView hiện loading
      : nonTiviScope      // ADMIN/TTVH/GDVH: từ URL param
    : null;

  const handleNavigate = (params) => {
    if (!params) return;
    if (params.tab) setActiveTab(params.tab);
    setArrivalsNavParams(params);
  };

  const [replaceDayParams, setReplaceDayParams] = useState(null);

  const handleNavigateReplaceDay = (params) => {
    if (!params) return;
    setReplaceDayParams(params);
    setActiveTab('replace_day');
  };

  // Vào / thoát chế độ tivi
  const enterTvMode = useCallback((bcvh) => {
    // Cập nhật URL query string (không reload)
    const url = new URL(window.location.href);
    url.searchParams.set('tv', '1');
    if (bcvh && bcvh !== 'all') url.searchParams.set('bcvh', bcvh);
    else url.searchParams.delete('bcvh');
    window.history.replaceState(null, '', url.toString());
    setTvMode(true);
  }, []);

  const exitTvMode = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('tv');
    url.searchParams.delete('bcvh');
    window.history.replaceState(null, '', url.toString());
    setTvMode(false);
    setActiveTab('ops_today');
  }, []);

  // Bất kỳ request ghi nào (qua src/utils/api.js) nhận 401 từ backend sẽ tự
  // xoá token + phát event này -> quay về LoginView, không để lộ lỗi JSON thô.
  useEffect(() => {
    function handleAuthExpired() { setAuthUser(null); setTvMode(false); }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const handleLoginSuccess = (token) => {
    setToken(token);
    const user = decodeJwtPayload(token);
    setAuthUser(user);
    if (user?.role === 'TIVI') setTvMode(true);
  };

  const handleLogout = () => {
    clearToken();
    setAuthUser(null);
    setTvMode(false);
    // Reset về trang mặc định ops_today: tránh trường hợp đăng nhập lại bằng user khác
    // trong khi đang ở tab quản trị -> màn hình trắng vì tab đó bị ẩn theo role.
    setActiveTab('ops_today');
  };

  // ── Chưa đăng nhập ───────────────────────────────────────────────────────
  if (!authUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Chế độ tivi (chỉ ADMIN, TTVH, GDVH, TIVI; STAFF có ?tv=1 vẫn vào giao diện thường) ──
  if (tvMode && canTv) {
    return (
      <TiviView
        authUser={authUser}
        bcvhScope={tiviScope}
        isTiviRole={isTiviRole}
        onExit={exitTvMode}
        onForceLogout={handleLogout}
      />
    );
  }

  // ── Giao diện thường ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        authUser={authUser}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header activeTab={activeTab} />

        <main className="flex-1">
          {(activeTab === 'ops_today' || activeTab === 'dashboard') && (
            <DailyOpsDashboard
              authUser={authUser}
              onNavigate={handleNavigate}
              onEnterTvMode={enterTvMode}
            />
          )}

          {activeTab === 'arrivals' && isViewer && (
            <ArrivalsView
              authUser={authUser}
              navParams={arrivalsNavParams}
              onClearNavParams={() => setArrivalsNavParams(null)}
              onNavigateNapNguon={() => setActiveTab('nap_nguon')}
            />
          )}

          {activeTab === 'network' && isViewer && (
            <NetworkListView />
          )}

          {activeTab === 'processing' && isViewer && (
            <ProcessingDeliveryView authUser={authUser} />
          )}

          {activeTab === 'useradmin' && isAdmin && (
            <UserAdminView authUser={authUser} />
          )}

          {activeTab === 'replace_day' && isAdmin && (
            <ReplaceDayView
              authUser={authUser}
              initialBcvh={replaceDayParams?.bcvh}
              initialNgay={replaceDayParams?.ngay}
            />
          )}

          {activeTab === 'nap_nguon' && isAdmin && (
            <SourceIngestView
              authUser={authUser}
              onNavigateReplaceDay={handleNavigateReplaceDay}
            />
          )}

          {activeTab === 'tham_so' && isAdmin && (
            <ThamSoView authUser={authUser} />
          )}
        </main>
      </div>
    </div>
  );
}
