# 📝 BACKLOG — Việc tiếp theo

> File "sống", chỉ giữ VIỆC CÒN LẠI. Lịch sử: `CHANGELOG_AI.md`. Trạng thái: `00_SNAPSHOT.md`.
> Cập nhật lần cuối: 2026-10-10 (SANLUONG-3g).

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
6e. ✅ SANLUONG-3e — API Dashboard điều hành (`/api/arrivals/dashboard/overview|trend|wards-surge|center`) + `tong_hop` của `/quality-mocs` (09/10/2026).
6f. ADMIN chỉnh ngưỡng `DASHBOARD_THRESHOLDS` (và danh sách 6 BCVH) trên giao diện — cần bảng cấu hình (hiện là hằng số trong `server/lib/dashboardQuery.js`, #45).
6g. Xem lại ngưỡng và định nghĩa "xác nhận chậm" (hiện trung vị khoảng XN túi → XN bưu gửi ≥ 75 phút) sau khi chạy dữ liệu thật ~2 tuần; xem lại sản lượng tối thiểu 50 SHBG và ngưỡng 7 điểm % hàng nặng (#48, đều TẠM).
6h. Nối SFTP cho 5 BCVH còn lại (535470, 536250, 537015, 537220, 535790) — gộp vào SANLUONG-5; đến khi đó các BCVH này trả 0 / `co_du_lieu: false`.
7. SANLUONG-3c — phân quyền TTVH/GDVH + gán GDVH–BCVH + export dữ liệu gốc xlsx (số hiệu dạng chữ).
7a. ✅ SANLUONG-3c-2 — 4 vai trò ADMIN/TTVH/GDVH/STAFF, quản lý tài khoản chỉ ADMIN, bảng `user_bcvh` + API gán, `scripts/migrate-roles.js` (09/10/2026). **PO còn phải**: chạy chuyển đổi vai trò trên DB thật (`06_DEPLOYMENT.md` mục 7).
7b. Giao diện gán BCVH cho GDVH (ticket Antigravity riêng): ô chọn BCVH trong Quản lý người dùng dùng `bcvh_codes` + `PUT /api/users/:id/bcvh`; dọn menu cho TTVH/GDVH (hiện vẫn thấy "Quản lý người dùng" nhưng API trả 403; `isStaff` vẫn là `role === 'STAFF'`). 3c-2 chỉ sửa tối thiểu giao diện (`ROLE_OPTIONS`, nhãn vai trò).
7c. ✅ SANLUONG-3c-3 — API xuất Excel dữ liệu thô "Hàng đến" của một BCVH (`/api/arrivals/export-scope`, `/export`), 9 cột chuỗi, ghi luồng; `exceljs`/`csv-parse` đã vào `THIRD_PARTY_NOTICES.md` (09/10/2026). **PO còn phải**: mở thử 1 file xuất bằng Excel thật; duyệt các mặc định của #56 (92 ngày, 1.000.000 dòng, định dạng giờ).
7c1. Nút "Xuất Excel" trên giao diện (ticket Antigravity): gọi `GET /api/arrivals/export-scope` để lấy danh sách BCVH, chọn BCVH + khoảng ngày (≤ 92 ngày) + tiêu chí ngày, tải bằng `apiFetch` (cần token → dùng blob, không dùng thẻ `<a>`); hiện thông điệp 400/403 của server.
7c2. Xuất theo bộ lọc (phường/xã, đường thư…), định dạng khác (CSV), nhiều BCVH một file, giới hạn số lần xuất đồng thời — chỉ làm nếu PO cần (#58).
7f. ✅ SANLUONG-3g (backend) — R2 (#59), `chua_nhan_tai_bcvh` + `/not-received` (#60), chất lượng khai thác theo nguồn BD10 (#61) (10/10/2026). **PO còn phải**: sao lưu rồi chạy `scripts/rederive-arrival.js --apply` trên DB thật (`06_DEPLOYMENT.md` mục 8).
7f1. Giao diện (ticket Antigravity): thẻ "Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" (mô tả "Chưa tính vào sản lượng đến. Số liệu sẽ cập nhật khi có giao nhận tại BCVH. Cũ nhất: N ngày."), danh sách + nút xuất (`/not-received`, `/not-received/export`); thẻ "đủ trạng thái theo nguồn" (`tong_hop.theo_nguon`); ghi chú tiêu chí `bd10` từ `/meta`; bỏ phụ thuộc `canh_bao.chua_xac_dinh_ngay_den` (lỗi thời).
7f2. Đưa "chưa nhận tại BCVH" thành mục điều hành của Dashboard điều hành (`/dashboard/overview` / `issues`) — cần PO chốt ngưỡng.
7f3. Kiểm tra nhóm tiền tố 531120 có 495 bưu gửi (13,6%) trống XNĐ BD10, và các nhóm tiền tố 533140 (97 bưu gửi, 100% trống), 535470 (55, 41,8% trống): trống do script hay do quy tắc nghiệp vụ? Nhóm `khong_bd10` (738) hiện coi đủ khi có XN bưu gửi.
7f4. Nếu PO muốn thêm cột ngày lập BD10 (`BC37Date`) vào script xuất CSV nguồn — cần cập nhật script xuất và importer.
7f5. GDVH: chỉ số "chưa nhận" bị giới hạn theo BCVH được giao nhưng sản lượng vẫn đủ 6 BCVH (#52, #60) — PO xem lại có thống nhất không.
7d. Xem lại `/api/organization/*` và `/api/dashboard/stats` (hiện mở cho mọi người đã đăng nhập kể cả STAFF) — #53(e).
7e. Tạo ADMIN đầu tiên khi triển khai sạch trên NAS (không có DB cũ) — gộp vào ticket triển khai NAS.
8. Module danh mục trạng thái + file mẫu import trạng thái.
9. Module tính tỷ lệ phát.
10. Hạn xử lý 11h/17h; trường hợp file chiều ra ~16:30 chỉ còn ~30 phút trước hạn 17h.
11. Bảng so sánh giữa các BCVH cho TTVH.
12. Bưu gửi không có mốc nào (62 trên mẫu) hiển thị thành dòng riêng trên màn hình (nếu PO muốn).
13. SANLUONG-4 — giao diện "Dữ liệu sản lượng đến" (ADMIN + TTVH + GDVH).
14. SANLUONG-5 — đồng bộ SFTP (danh sách "thư mục + mã BCVH", thăm dò định kỳ, nạp toàn bộ lịch sử).
15. Hiển thị chất lượng dữ liệu: phân bố `arrival_evidence_count`, dòng chưa xác định ngày đến, ngày thiếu đợt, khoảng trống thời gian.
16. Dashboard lấy nguồn mới (thêm nguồn "Hàng đến" vào whitelist).

## Kỹ thuật
17. Tách `src/components/NetworkListView.jsx` (~1.380 dòng) thành các component nhỏ (modal import/export, form, bảng).
18. Xem xét gỡ gói `cors` (không còn file nào dùng, đã vậy từ bản gốc).
19. Bundle frontend ~1,6 MB (cảnh báo Vite > 500 kB) — cân nhắc tách chunk khi thêm màn hình mới.
20. Theo dõi file "Hàng đến" bị từ chối vì khối lượng không phải số nguyên (`/api/arrivals/import-status`) — nếu nguồn có số lẻ thì cần quyết định cách lưu.
