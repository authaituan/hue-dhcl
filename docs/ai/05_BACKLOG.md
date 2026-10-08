# 📝 BACKLOG — Việc tiếp theo

> File "sống", chỉ giữ VIỆC CÒN LẠI. Lịch sử: `CHANGELOG_AI.md`. Trạng thái: `00_SNAPSHOT.md`.
> Cập nhật lần cuối: 2026-10-08.

## Cần PO quyết định
1. Đã có công cụ nạp seed (`scripts/import-seed.js`, NEWPROJ-2). **Còn lại**: cơ chế tạo ADMIN đầu tiên khi triển khai
   sạch, không có DB cũ (để sau).
2. STAFF hiện chỉ thấy Dashboard (PO quyết sau): có cần cho STAFF xem danh sách mạng lưới (chỉ đọc) không?

3. Gán tay phường/xã chưa ánh xạ BĐX (sau khi nạp thật): hiện chỉ "Xã A Lưới 4" — ứng viên 5335 / 5336 / 5377
   (`node scripts/set-ward-map.js "Xã A Lưới 4" <commune_id>`). Các xã Long Quảng, A Lưới 1, A Lưới 5 chưa xuất hiện trong dữ liệu mẫu.
4. Mốc `Ngay_gio_XND_BD10` đôi khi sớm hơn các mốc khác nhiều ngày (8 dòng mẫu ngoài khoảng hợp lý đều do mốc này) — PO xác nhận
   có giữ trong quy tắc "mốc sớm nhất" không (`07_SANLUONG_AUDIT.md` phụ lục B).

## Dữ liệu sản lượng đến (SANLUONG)
5. SANLUONG-3 — API lọc/tổng hợp (ngày theo tiêu chí, BĐX, bưu cục; lượt đến / SHBG / túi-kiện / khối lượng theo lượt).
6. SANLUONG-4 — giao diện "Dữ liệu sản lượng đến" (MANAGER + ADMIN).
7. SANLUONG-5 — đồng bộ SFTP (danh sách "thư mục + mã BCVH", thăm dò định kỳ, nạp toàn bộ lịch sử).
8. Hiển thị chất lượng dữ liệu: phân bố `arrival_evidence_count`, dòng chưa xác định ngày đến, ngày thiếu đợt, khoảng trống thời gian.
9. Dashboard lấy nguồn mới (thêm nguồn "Hàng đến" vào whitelist).

## Kỹ thuật
10. Tách `src/components/NetworkListView.jsx` (~1.380 dòng) thành các component nhỏ (modal import/export, form, bảng).
11. Xem xét gỡ gói `cors` (không còn file nào dùng, đã vậy từ bản gốc).
12. Bundle frontend ~1,6 MB (cảnh báo Vite > 500 kB) — cân nhắc tách chunk khi thêm màn hình mới.
