# 📝 BACKLOG — Việc tiếp theo

> File "sống", chỉ giữ VIỆC CÒN LẠI. Lịch sử: `CHANGELOG_AI.md`. Trạng thái: `00_SNAPSHOT.md`.
> Cập nhật lần cuối: 2026-10-08.

## Cần PO quyết định
1. Đã có công cụ nạp seed (`scripts/import-seed.js`, NEWPROJ-2). **Còn lại**: cơ chế tạo ADMIN đầu tiên khi triển khai
   sạch, không có DB cũ (để sau).
2. STAFF hiện chỉ thấy Dashboard (PO quyết sau): có cần cho STAFF xem danh sách mạng lưới (chỉ đọc) không?

## Kỹ thuật
3. Tách `src/components/NetworkListView.jsx` (~1.380 dòng) thành các component nhỏ (modal import/export, form, bảng).
4. Xem xét gỡ gói `cors` (không còn file nào dùng, đã vậy từ bản gốc).
5. Bundle frontend ~1,6 MB (cảnh báo Vite > 500 kB) — cân nhắc tách chunk khi thêm màn hình mới.
