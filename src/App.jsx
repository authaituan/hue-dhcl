import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import NetworkListView from './components/NetworkListView';
import UserAdminView from './components/UserAdminView';
import ArrivalsView from './components/arrivals/ArrivalsView';
import { getToken, setToken, clearToken, decodeJwtPayload, isTokenExpired, AUTH_EXPIRED_EVENT } from './utils/api';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authUser, setAuthUser] = useState(getInitialAuthUser);
  
  const isViewer = ['ADMIN', 'TTVH', 'GDVH'].includes(authUser?.role);
  const isAdmin = authUser?.role === 'ADMIN';

  // Bất kỳ request ghi nào (qua src/utils/api.js) nhận 401 từ backend sẽ tự
  // xoá token + phát event này -> quay về LoginView, không để lộ lỗi JSON thô.
  useEffect(() => {
    function handleAuthExpired() {
      setAuthUser(null);
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const handleLoginSuccess = (token) => {
    setToken(token);
    setAuthUser(decodeJwtPayload(token));
  };

  const handleLogout = () => {
    clearToken();
    setAuthUser(null);
    // Reset về dashboard: tránh trường hợp đăng nhập lại bằng user khác
    // (vd STAFF) trong khi đang ở tab "Quản Lý Người Dùng" -> màn hình
    // trắng vì tab đó bị ẩn theo role nhưng activeTab vẫn giữ giá trị cũ.
    setActiveTab('dashboard');
  };

  return (
    <div className="min-h-screen flex font-sans">
      {!authUser ? (
        <LoginView onLoginSuccess={handleLoginSuccess} />
      ) : (
        <>
          {/* Sidebar */}
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            authUser={authUser}
            onLogout={handleLogout}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <Header activeTab={activeTab} />

            <main className="flex-1">
              {activeTab === 'dashboard' && (
                <DashboardView isAdmin={isAdmin} />
              )}

              {activeTab === 'arrivals' && isViewer && (
                <ArrivalsView authUser={authUser} />
              )}

              {activeTab === 'network' && isViewer && (
                <NetworkListView />
              )}

              {activeTab === 'useradmin' && isAdmin && (
                <UserAdminView authUser={authUser} />
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
