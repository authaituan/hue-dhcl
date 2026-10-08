# 📝 BACKLOG — Việc tiếp theo

> File "sống", chỉ giữ VIỆC CÒN LẠI. Lịch sử: `CHANGELOG_AI.md`. Trạng thái: `00_SNAPSHOT.md`.
> Cập nhật lần cuối: 2026-10-08.

## Cần PO quyết định
1. Đã có công cụ nạp seed (`scripts/import-seed.js`, NEWPROJ-2). **Còn lại**: cơ chế tạo ADMIN đầu tiên khi triển khai
   sạch, không có DB cũ (để sau).
2. STAFF hiện chỉ thấy Dashboard (PO quyết sau): có cần cho STAFF xem danh sách mạng lưới (chỉ đọc) không?

3. Gán tay "Xã A Lưới 4" → BĐX **5336** — **chưa cần** cho màn hình sản lượng đến (#30); làm khi Dashboard dùng `ward_bdx_map`.
4. Xem lại mốc `Ngay_gio_XND_BD10` sớm bất thường khi có dữ liệu thật (giữ quy tắc "mốc sớm nhất", chỉ cảnh báo — #23; 9 lượt trên mẫu).
5. Bảng phụ nếu truy vấn dài hạn chậm: 1 năm 3,7–7,8 s trên 1 triệu dòng (1 tháng < 0,5 s) — PO duyệt bảng tổng hợp theo ngày
    (~3–5 MB/năm/BCVH) hoặc bảng 1 dòng/SHBG/ngày (~150–200 MB/năm) — `04_DECISIONS.md` #35.

## Dữ liệu sản lượng đến (SANLUONG)
6. ✅ SANLUONG-3 — API lọc/tổng hợp `/api/arrivals/*`; ✅ SANLUONG-3b — đổi sang "Sản lượng đến", lọc theo giờ, bỏ BĐX, chất lượng khai thác (08/10/2026).
6b. ✅ SANLUONG-3d — API "Hàng đến theo đường thư và dịch vụ" + hàng nặng (`/by-route`, `/by-service`, hàng nặng trong `/summary`) (09/10/2026).
6c. ADMIN chỉnh ngưỡng hàng nặng trên giao diện — cần bảng cấu hình (hiện là hằng số + tham số `heavy_g`, #40).
6d. Khối "chốt 11h/17h" và "độ trễ giữa các mốc" — ticket riêng sau khi PO chốt khung giờ.
7. SANLUONG-3c — phân quyền TTVH/GĐVH + gán GĐVH–BCVH + export dữ liệu gốc xlsx (số hiệu dạng chữ).
8. Module danh mục trạng thái + file mẫu import trạng thái.
9. Module tính tỷ lệ phát.
10. Hạn xử lý 11h/17h; trường hợp file chiều ra ~16:30 chỉ còn ~30 phút trước hạn 17h.
11. Bảng so sánh giữa các BCVH cho TTVH.
12. Bưu gửi không có mốc nào (62 trên mẫu) hiển thị thành dòng riêng trên màn hình (nếu PO muốn).
13. SANLUONG-4 — giao diện "Dữ liệu sản lượng đến" (MANAGER + ADMIN).
14. SANLUONG-5 — đồng bộ SFTP (danh sách "thư mục + mã BCVH", thăm dò định kỳ, nạp toàn bộ lịch sử).
15. Hiển thị chất lượng dữ liệu: phân bố `arrival_evidence_count`, dòng chưa xác định ngày đến, ngày thiếu đợt, khoảng trống thời gian.
16. Dashboard lấy nguồn mới (thêm nguồn "Hàng đến" vào whitelist).

## Kỹ thuật
17. Tách `src/components/NetworkListView.jsx` (~1.380 dòng) thành các component nhỏ (modal import/export, form, bảng).
18. Xem xét gỡ gói `cors` (không còn file nào dùng, đã vậy từ bản gốc).
19. Bundle frontend ~1,6 MB (cảnh báo Vite > 500 kB) — cân nhắc tách chunk khi thêm màn hình mới.
20. Theo dõi file "Hàng đến" bị từ chối vì khối lượng không phải số nguyên (`/api/arrivals/import-status`) — nếu nguồn có số lẻ thì cần quyết định cách lưu.
