import { apiFetchJson } from '../../utils/api';

/**
 * Gọi API tổng hợp thời gian khai thác - vận chuyển (Màn 1)
 * @param {Object} params
 * @param {string} params.from YYYY-MM-DD
 * @param {string} params.to YYYY-MM-DD
 * @param {string} [params.receiver_code] Mã BCVH nhận (nếu chọn 1 BCVH)
 */
export async function fetchQuyThoiGianTongHop({ from, to, receiver_code }) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (receiver_code && receiver_code !== 'all') {
    q.set('receiver_code', receiver_code);
  }
  return apiFetchJson(`/api/arrivals/quy-thoi-gian/tong-hop?${q.toString()}`);
}

/**
 * Gọi API tổng hợp theo ngày (7 ngày gần đây cho Màn 1)
 * @param {Object} params
 * @param {string} params.from YYYY-MM-DD
 * @param {string} params.to YYYY-MM-DD
 * @param {string} [params.receiver_code]
 */
export async function fetchQuyThoiGianTheoNgay({ from, to, receiver_code }) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (receiver_code && receiver_code !== 'all') {
    q.set('receiver_code', receiver_code);
  }
  return apiFetchJson(`/api/arrivals/quy-thoi-gian/theo-ngay?${q.toString()}`);
}

/**
 * Gọi API danh sách bưu gửi (Màn 2)
 * @param {Object} params
 */
export async function fetchQuyThoiGianLuot(params = {}) {
  const q = new URLSearchParams();
  const allowed = [
    'from', 'to', 'receiver_code', 'ward_key', 'page', 'page_size',
    'nhom', 'trang_thai', 'ly_do', 'nghi_ngo', 'duong_thu', 'dai'
  ];

  for (const k of allowed) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') {
      if (k === 'receiver_code' && v === 'all') continue;
      q.set(k, String(v));
    }
  }

  return apiFetchJson(`/api/arrivals/quy-thoi-gian/luot?${q.toString()}`);
}

/**
 * Lấy danh sách BCVH được giao cho vai trò GDVH
 */
export async function fetchExportScope() {
  return apiFetchJson('/api/arrivals/export-scope');
}
