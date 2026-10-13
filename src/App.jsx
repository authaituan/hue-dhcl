import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import NetworkListView from './components/NetworkListView';
import UserAdminView from './components/UserAdminView';
import ArrivalsView from './components/arrivals/ArrivalsView';
import DailyOpsDashboard from './components/arrivals/DailyOpsDashboard';
import TiviView from './components/TiviView';
import { BCVH_LIST } from './constants/bcvh';
import { getToken, setToken, clearToken, decodeJwtPayload, isTokenExpired, AUTH_EXPIRED_EVENT, apiFetchJson } from './utils/api';

// Đọc token đã lưu (nếu có) ngay lúc khởi tạo state, để tránh nháy màn hình.
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
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

  // Gọi GET /api/auth/me để lấy tivi_scope mới nhất mỗi khi vào chế độ tivi với TIVI role.
  // Không đọc từ JWT vì token có thể được tạo trước khi admin gán phạm vi.
  useEffect(() => {
    if (!isTiviRole || !tvMode) return;
    setTiviScopeFromApi(undefined); // reset về trạng thái đang tải
    apiFetchJson('/api/auth/me').then((res) => {
      if (res.ok) {
        // Lấy tivi_scope từ phản hồi API (null = chưa gán, string = đã gán)
        setTiviScopeFromApi(res.data?.tivi_scope ?? null);
      } else if (res.status === 401) {
        clearToken();
        setAuthUser(null);
        setTvMode(false);
      } else {
        // Lỗi khác: giữ undefined để hiển thị trạng thái lỗi tạm thời
        setTiviScopeFromApi(null);
      }
    });
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

  // 401 từ bất kỳ request nào → về màn đăng nhập
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
    setActiveTab('dashboard');
  };

  // ── Chưa đăng nhập ───────────────────────────────────────────────────────
  if (!authUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Chế độ tivi ──────────────────────────────────────────────────────────
  if (tvMode) {
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
          {activeTab === 'dashboard' && (
            <DashboardView isAdmin={isAdmin} />
          )}

          {activeTab === 'ops_today' && (
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
            />
          )}

          {activeTab === 'network' && isViewer && (
            <NetworkListView />
          )}

          {activeTab === 'useradmin' && isAdmin && (
            <UserAdminView authUser={authUser} />
          )}
        </main>
      </div>
    </div>
  );
}
