// Hàm dùng chung cho nhiều route.

// Parse chuỗi -> số thực, rỗng/không hợp lệ -> null (dùng cho latitude/longitude).
function parseFloatOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

// ==========================================
// Chuẩn hoá chuỗi (bỏ dấu + viết thường), dùng cho tìm kiếm người dùng
// theo mã HRM / họ tên (GET /api/users/search).
// ==========================================
// Chữ đ/Đ không tách dấu được bằng NFD nên đổi riêng sang 'd' ("Đông Hà" -> "dong ha").
const normalizeStr = (s) => (s || '').toLowerCase().replace(/đ/g, 'd').normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

module.exports = { parseFloatOrNull, normalizeStr };
