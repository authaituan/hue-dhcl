# Hệ thống điều hành chất lượng - khâu Phát (`hue-dhcl`)

Ứng dụng web nội bộ cho Bưu điện Thành phố Huế. Phiên bản `0.1.0` — khung kế thừa từ it-assets v1.0.0.

## Chức năng
- **Đăng nhập** bằng mã HRM + mật khẩu; đổi mật khẩu; khoá đăng nhập sai nhiều lần.
- **Quản lý mạng lưới**: danh sách Bưu điện Tỉnh → Bưu điện Xã (BĐX) → Bưu cục; lọc, thêm/sửa/xoá,
  gán người phụ trách, Import/Export Excel.
- **Quản lý người dùng**: tạo tài khoản, phân quyền, đặt lại mật khẩu, khoá/mở khoá.
- **Dashboard động**: biểu đồ thống kê bưu cục; ADMIN tự thêm/sửa/sắp xếp ô.
- **Bảo mật**: chỉ IP trong danh sách được truy cập; mọi API bắt buộc đăng nhập.

## Công nghệ
Node.js 22, Express 5, SQLite (better-sqlite3) · React 19, Vite, Tailwind CSS 4, Recharts, ExcelJS.

## Chạy trên máy phát triển
```bash
npm ci --ignore-scripts
```
> Windows: `better-sqlite3` có bản prebuilt; thiếu `--ignore-scripts` thì `node-gyp` lỗi trên máy không có Visual Studio.

Tạo file `.env` từ `.env.example` (đặt `JWT_SECRET` mới, xem `docs/ai/06_DEPLOYMENT.md` mục 1), rồi:
```bash
npm run dev
```
- Giao diện: `http://localhost:3000` · API: `http://localhost:5000`
- DB mới trống: nạp tài khoản + mạng lưới từ hệ thống cũ bằng `node scripts/import-seed.js <DB-cũ>`
  (xem [`docs/ai/06_DEPLOYMENT.md`](docs/ai/06_DEPLOYMENT.md) mục 5).

Kiểm thử và build:
```bash
npm test
npm run build
```

## Triển khai
Synology NAS (Docker, chế độ mạng host), cổng **18060** — xem [`docs/ai/06_DEPLOYMENT.md`](docs/ai/06_DEPLOYMENT.md).

## Tài liệu cho AI
Bắt đầu từ [`README_AI.md`](README_AI.md).

## Giấy phép bên thứ ba
Giao diện dựa trên theme Soft UI (MIT) — xem [`docs/ai/THIRD_PARTY_NOTICES.md`](docs/ai/THIRD_PARTY_NOTICES.md).

**Đơn vị quản lý**: Bưu điện Thành phố Huế (Mã 53).
