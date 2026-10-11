// ==========================================
// Helper dùng chung cho MỌI request tới backend (đọc lẫn ghi), trừ đăng nhập.
// Tự gắn header Authorization: Bearer <token> nếu đã đăng nhập.
// Backend bắt buộc token cho mọi /api/* trừ POST /api/auth/login (xem
// server/index.js mục "Lớp bảo mật") — gọi fetch() trần sẽ nhận 401.
//
// Lưu ý bảo mật: CHỈ lưu token vào localStorage, KHÔNG bao giờ lưu password.
// Thông tin hiển thị (tên, role) được suy ra trực tiếp từ payload của chính
// token (giải mã base64, không xác thực chữ ký phía client — chỉ để hiển
// thị UI, mọi kiểm tra quyền thật sự vẫn do backend quyết định), thay vì
// lưu thêm 1 bản sao vào localStorage.
// ==========================================

const TOKEN_KEY = 'dhcl_auth_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    // localStorage có thể bị chặn (chế độ ẩn danh nghiêm ngặt...) — bỏ qua,
    // người dùng sẽ phải đăng nhập lại mỗi lần tải trang, không phải lỗi chặn app.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    // ignore
  }
}

// Giải mã phần payload của JWT (base64url) — CHỈ phục vụ hiển thị UI
// (tên, role...), không dùng để tự xác thực vì không kiểm tra chữ ký.
export function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// Kiểm tra token đã hết hạn theo claim "exp" hay chưa (tránh nháy màn hình
// app rồi mới bị đá ra do request đầu tiên trả 401).
export function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 < Date.now();
}

// App.jsx lắng nghe event này để tự động quay về màn đăng nhập khi bất kỳ
// request ghi nào bị backend từ chối vì token hết hạn/không hợp lệ (401).
export const AUTH_EXPIRED_EVENT = 'dhcl:auth-expired';

const FORBIDDEN_MESSAGE = 'Tài khoản của bạn không có quyền thực hiện thao tác này (vai trò hiện tại không được phép).';
const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ, vui lòng đăng nhập lại.';
const GENERIC_ERROR_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại.';

// Bọc fetch() gốc: tự gắn Authorization header nếu có token. Nếu backend
// trả 401 (token hết hạn/không hợp lệ), tự xoá token đã lưu + phát event
// AUTH_EXPIRED_EVENT để App.jsx quay về LoginView.
export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  return res;
}

// Bản tiện dụng hơn: gọi apiFetch() + parse JSON + gắn sẵn message tiếng
// Việt rõ ràng cho 401/403 thay vì để lộ lỗi JSON thô ra UI. Trả về:
//   { ok: boolean, status: number, error: string|null, data: any }
export async function apiFetchJson(url, options = {}) {
  const res = await apiFetch(url, options);
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (res.status === 401) {
    return { ok: false, status: 401, error: SESSION_EXPIRED_MESSAGE, data };
  }
  if (res.status === 403) {
    return { ok: false, status: 403, error: data.error || FORBIDDEN_MESSAGE, data };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error || GENERIC_ERROR_MESSAGE, data };
  }
  return { ok: true, status: res.status, error: null, data };
}

// Gọi API để tải file blob (Excel) và tự động kích hoạt trình duyệt tải về.
export async function apiDownloadExcel(url, defaultFilename = 'download.xlsx') {
  const res = await apiFetch(url);
  if (!res.ok) {
    let msg = 'Lỗi hệ thống khi tải file';
    try {
      const errData = await res.json();
      if (errData.error) msg = errData.error;
    } catch (e) {}
    return { ok: false, error: msg };
  }

  let filename = defaultFilename;
  const disposition = res.headers.get('Content-Disposition');
  if (disposition && disposition.indexOf('filename=') !== -1) {
    const matches = /filename="([^"]+)"/.exec(disposition);
    if (matches != null && matches[1]) {
      filename = matches[1];
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);

  return { ok: true, error: null };
}
