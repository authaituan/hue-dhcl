# 📸 SNAPSHOT — Trạng thái kỹ thuật HIỆN TẠI

> Chỉ ghi trạng thái hiện tại (không tường thuật từng PR — tường thuật ở `CHANGELOG_AI.md`).
> Giữ file dưới ~250 dòng. Cập nhật lần cuối: 2026-10-08 (SANLUONG-2).

## 1. Tổng quan
- **Tên**: Hệ thống điều hành chất lượng - khâu Phát (`hue-dhcl`), phiên bản `0.1.0`.
- **Nguồn gốc**: kế thừa khung từ it-assets v1.0.0 (xem `04_DECISIONS.md` #1).
- **Git**: nhánh `main` (PO commit/push).
- **Triển khai**: chưa. Đích: Synology NAS, cổng 18060 (`06_DEPLOYMENT.md`).

## 2. Stack
Node 22 · Express 5 · better-sqlite3 (`data/hue-dhcl.db`) · JWT · React 19 + Vite 8 + Tailwind 4 ·
Recharts · ExcelJS (import/export mạng lưới) · csv-parse (đọc CSV "Hàng đến") · lucide-react. Test: `node --test` (server thật trên DB tạm).

## 3. Chức năng hiện có
| Chức năng | Trạng thái |
|---|---|
| Đăng nhập (mã HRM + mật khẩu), đổi mật khẩu, rate-limit | Có |
| Quản lý người dùng (tạo, sửa tên/quyền, đặt lại mật khẩu, khoá/mở khoá) | Có |
| Quản lý mạng lưới — danh sách, lọc, thêm/sửa/xoá bưu cục, người phụ trách, import/export Excel | Có |
| Dashboard động (3 ô CHART mặc định trên dữ liệu bưu cục; ADMIN chỉnh sửa) | Có |
| Lọc IP truy cập, header bảo mật, trang 404 | Có |
| Nạp DB ban đầu từ hệ thống cũ (`scripts/import-seed.js`: tài khoản + mạng lưới) | Có |
| Dữ liệu "Hàng đến": bảng + nạp CSV bằng dòng lệnh (`scripts/import-arrivals.js`), ánh xạ phường→BĐX, kiểm thiếu đợt | Có (chưa API/giao diện/SFTP) |

## 4. Quy tắc nghiệp vụ chính
- `STAFF` chỉ đọc (chỉ thấy Dashboard); vai trò khác = quản lý; `ADMIN` cấu hình Dashboard.
- Chỉ Quản lý mạng lưới được tạo Tỉnh/BĐX/Bưu cục (import theo `maMbc`; thiếu `maMbc` → chặn cả lô).
- Xoá bưu cục là xoá cứng; còn người dùng tham chiếu (`users.post_office_id`) → 400.
- Người phụ trách bưu cục = 1 dòng `users` (không FK cứng; kiểm tra tồn tại ở route).
- Tài khoản bị khoá (`deactivated_at`) không đăng nhập được, không hiện trong gợi ý người phụ trách.
- Hàng đến: lượt đến = `(SHBG, BD10, BD8)`; thời gian đến BCVH = mốc sớm nhất của XN túi / XND BD10 / XN BG; bưu cục = BC nhận;
  BĐX = theo phường/xã phát (`ward_bdx_map`); file trùng tên khác nội dung → CONFLICT; mỗi ngày cần 2 file (`04_DECISIONS.md` #11–#21).

## 5. Kiểm thử
`npm test`: 8 file, 131 ca (thêm arrivals-import) — 130 pass, 1 skip có chủ đích (test CLI seed bỏ qua khi máy đã có `data/hue-dhcl.db`), 2026-10-08.

## 6. Rủi ro / việc treo
- DB mới trống: PO nạp tài khoản + mạng lưới từ DB hệ thống cũ bằng `scripts/import-seed.js` (`06_DEPLOYMENT.md` mục 5).
  Triển khai sạch không có DB cũ: chưa có cơ chế tạo ADMIN đầu tiên (`05_BACKLOG.md` mục 1).
- `NetworkListView.jsx` ~1.380 dòng, cần tách nhỏ (ticket riêng).
