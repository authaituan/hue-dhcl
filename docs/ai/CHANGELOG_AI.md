# 📝 AI-Assisted Changes Changelog

Ghi lại các thay đổi được thực hiện với hỗ trợ của AI. Mới nhất ở đầu, append-only, 1 mục/ticket.

---

## [2026-10-09] - Sửa nhỏ SANLUONG-3e: hàng nặng theo điểm % + sản lượng tối thiểu

- `server/lib/dashboardQuery.js`: điểm `hang_nang` = tỷ lệ hôm nay − tỷ lệ bình thường (gộp ≤ 4 ngày cùng thứ) ≥ 7 điểm %, `so_tuan = 0` không phát sinh; thêm `DASHBOARD_THRESHOLDS.san_luong_toi_thieu` (50 SHBG, TẠM) chặn điểm lệch sản lượng và hàng nặng khi `tb_4_tuan` < 50; echo trong `nguong`; khoá ngưỡng đổi thành `hang_nang.trong_ngay_diem_pct`; `hang_nang.ty_le_binh_thuong` trong `/overview`.
- `tests/dashboard-api.test.js`: +1 ca (21 ca): họ dữ liệu F4, biên 6,9/7 điểm %, `so_tuan = 0`, tb 49/50. Docs: quyết định #48 (sửa định nghĩa của PO).

## [2026-10-09] - API Dashboard điều hành (6 BCVH) + chỉ số chất lượng khai thác bổ sung (SANLUONG-3e)

- `server/lib/dashboardQuery.js` (mới): `DASHBOARD_BCVH` (6 BCVH), `DASHBOARD_THRESHOLDS`, `overview` (6 BCVH + tổng + `issues`), `trend`, `wardsSurge`, `center`. Không có logic đếm thứ hai: gọi `buildCountedCte()` cho từng cửa sổ 00:00 → `as_of`.
- `server/lib/arrivalsQuery.js`: `tong_hop` trong `/quality-mocs` (`du_trang_thai`, `co_xn_tui`, `co_xnd_bd10`, `khong_xnd_bd10`, `co_xn_bg`); tuỳ chọn `withMocTimes`; tách `parseHeavyG`, `shapeByRoute/Service/QualityMocs` (hành vi 3b/3d không đổi).
- `server/routes/arrivals.js`: `GET /api/arrivals/dashboard/overview|trend|wards-surge|center` (MANAGER + ADMIN).
- `tests/dashboard-api.test.js` (mới, 20 ca, CSV giả + tính lại độc lập); `package.json` thêm file vào `npm test`. `npm test` 173 ca: 172 pass, 1 skip có chủ đích; `npm run build` ok.
- 9 file mẫu (DB tạm): 08/10 09:30 — 1.940 SHBG (hôm qua cùng giờ 2.173); chỉ phát sinh điểm `hang_nang` (20,62% ≥ 7%); `/center` 7 ngày 12.783 SHBG; `tong_hop` khớp 7 tổ hợp của 3b.
- Hiệu năng (1.000.008 dòng giả, 3 BCVH × 38 ngày): `/overview` ~0,65 s; `/trend` 1,1–1,2 s; `/wards-surge` ~0,58 s; `/center` 7 ngày ~0,98 s (30 ngày ~4,9 s).
- Docs: quyết định #41–#47, bản đồ kiến trúc, backlog 6e–6h, đổi "đủ cả 3 mốc" → "đủ trạng thái (SHBG, BD8, BD10)".

## [2026-10-09] - API "Hàng đến theo đường thư và dịch vụ" + hàng nặng (SANLUONG-3d)

- `server/lib/arrivalsQuery.js`: thêm `byRoute`, `byService` (tái dùng lõi `buildCountedCte` của 3b, thêm `route_name` vào dòng đại diện), tham số `heavy_g` (500–30000, mặc định hằng số 2.500 g), `hang_nang` / `ty_le_hang_nang` / `nguong_hang_nang_g` trong `/summary`.
- `server/routes/arrivals.js`: `GET /api/arrivals/by-route`, `/by-service` (MANAGER + ADMIN).
- `tests/arrivals-api.test.js`: +7 ca (ngưỡng 2.499/2.500/2.501 g, rỗng, 0; `heavy_g`; nhóm chưa có tên; tên theo dòng đại diện; giờ nhiều nhất + hoà; bộ lọc). `npm test` 153 ca: 152 pass, 1 skip có chủ đích.
- Đổi chữ "Tuyến thư" → "Đường thư" trong docs và giá trị giả của test (#36).
- 9 file mẫu (DB tạm): 5 đường thư + nhóm chưa có tên (738); 5 dịch vụ + nhóm chưa có tên (186); hàng nặng 2.030 / 12.786 = 15,88%; bất biến tổng khớp.
- Hiệu năng (~1 triệu dòng giả): 1 tháng 0,28–0,36 s; 1 năm 4,0–4,5 s.
- Docs: quyết định #36–#40, bản đồ kiến trúc, backlog, snapshot.

## [2026-10-08] - Đổi lõi sang "Sản lượng đến", lọc theo giờ, bỏ BĐX, chất lượng khai thác (SANLUONG-3b)

- `server/lib/arrivalsQuery.js` viết lại: sản lượng = SHBG khác nhau tại lần đến sớm nhất trong khoảng (#28), lọc `from`/`to` tới phút (#31), nhóm phường/xã (#29), 7 tổ hợp mốc (#33); bỏ lượt đến / gộp dòng thiếu / BĐX.
- `server/routes/arrivals.js`: `/meta`, `/summary`, `/by-time` (day/hour), `/by-ward`, `/quality-mocs`, `/lookup`, `/items`; `/exceptions`, `/import-status` chỉ ADMIN; `canh_bao` trong `/summary` chỉ ADMIN (#34). Bỏ `/by-bdx`, `/by-day`.
- `tests/arrivals-api.test.js` viết lại (15 ca). `npm test` 146 ca: 145 pass, 1 skip có chủ đích.
- 9 file mẫu (DB tạm): sản lượng 12 786 SHBG (+ 62 không có mốc = 12 848); 49 đến lại trong khoảng; 9 cảnh báo BD10 sớm; 36/40 phường/xã có hàng.
- Hiệu năng (1,05 triệu dòng giả): 1 tháng 0,26–0,48 s; 1 năm 3,7–7,8 s — đề xuất bảng tổng hợp (#35).
- Docs: quyết định #28–#35, dòng "thay thế bởi" ở #11, #14, #22, #24, #27; bản đồ kiến trúc; backlog (SANLUONG-3c và các module sau); snapshot.

## [2026-10-08] - API lọc và tổng hợp "Hàng đến", quy tắc đếm lượt mới (SANLUONG-3)

- Thêm `server/lib/arrivalsQuery.js` (quy tắc gộp lượt #22, nhóm tỉnh/phường #24, kiểm tham số, các truy vấn) và `server/routes/arrivals.js` (`/api/arrivals/meta|summary|by-day|by-bdx|by-ward|items|import-status`, MANAGER + ADMIN); đăng ký trong `server/index.js`. Không đổi schema.
- Thêm `tests/arrivals-api.test.js` (12 ca, CSV giả). `npm test` 143 ca: 142 pass, 1 skip có chủ đích.
- 9 file mẫu (DB tạm): 13 049 → 13 048 lượt (1 dòng thiếu BD10 được gộp); 677 lượt thiếu cả BD10 lẫn BD8; 9 lượt cảnh báo BD10 sớm; 410 dòng Ngoài tỉnh.
- Hiệu năng trên 1,05 triệu dòng giả: 1 tháng 0,4–0,8 s; 1 năm 6,9–10,2 s — đề xuất bảng phụ (#27, backlog 14).
- Docs: quyết định #22–#27 + đính chính #14, bản đồ kiến trúc (module + endpoint), backlog, snapshot.

## [2026-10-08] - Bảng dữ liệu "Hàng đến" + công cụ nạp CSV (SANLUONG-2)

- Thêm `server/lib/arrivalsImport.js` (schema `arrival_import_files`, `arrival_items`, `ward_bdx_map`; nạp 1 file / 1 thư mục; `getMissingBatches`); `server/db.js` gọi `ensureArrivalSchema`.
- Thêm `scripts/import-arrivals.js` (bảng tóm tắt, `--check-days`, `--db`) và `scripts/set-ward-map.js`. Thêm phụ thuộc `csv-parse` ^7.0.3 (MIT).
- Thêm `tests/arrivals-import.test.js` (16 ca, CSV giả). `npm test` 131 ca: 130 pass, 1 skip có chủ đích.
- Nạp thử 9 file mẫu vào DB TẠM: 8 OK + 1 EMPTY, 13 102 dòng, 0 trùng khoá, chạy lại không đổi; số liệu ở `07_SANLUONG_AUDIT.md` phụ lục B.
- Docs: quyết định PO #11–#20 + thiết kế #21 (`04_DECISIONS.md`), bản đồ kiến trúc, backlog SANLUONG-3/4/5, snapshot; gỡ số hiệu thật khỏi `07_SANLUONG_AUDIT.md`.

## [2026-10-08] - Công cụ nạp DB ban đầu + đồng bộ quy tắc Git trong governance (NEWPROJ-2)

- Thêm `scripts/import-seed.js`: nạp `province_post_offices` → `commune_post_offices` → `post_offices` → `users` từ DB hệ thống cũ vào `data/hue-dhcl.db` (giao tập cột, giữ `id` + `password_hash`, 1 transaction, từ chối khi đích có dữ liệu trừ `--force`, kiểm khoá ngoại). Nguồn chỉ được đọc qua bản sao tạm (`04_DECISIONS.md` #10). Không in hash.
- Thêm `tests/seed-import.test.js` (7 ca, gồm kiểm thư mục nguồn không đổi: tên file + băm + mtime, kể cả khi nguồn đang mở có `-wal`). Test harness tự xoá `data/` rỗng do `server/db.js` tạo.
- `docs/01_GOVERNANCE/*`: executor không `git add`/commit/push/merge, PO làm; `PROJECT_SNAPSHOT.md` trỏ khung prompt về `docs/ai/prompts/`. `04_DECISIONS.md` #2 → đã áp dụng.
- Docs: `06_DEPLOYMENT.md` mục 5 "Tạo DB ban đầu" (đường dẫn NAS `/volume1/docker/hue-dhcl/app/`), backlog, snapshot, roles, prompt templates.

## [2026-10-08] - Dựng khung project hue-dhcl từ it-assets v1.0.0 (NEWPROJ-1)

- Chép phần giữ lại từ it-assets v1.0.0 (tài khoản, mạng lưới, Dashboard động, bảo mật, Docker, CI, docs); bỏ nghiệp vụ thiết bị/thư điện tử/nhân sự thuần/danh mục/cây/bản đồ.
- `server/db.js`: chỉ còn bảng tỉnh/BĐX/bưu cục, `users`, `dashboard_widgets`; DB `data/hue-dhcl.db`.
- `GET /api/users/search` thay cho route tìm nhân sự cũ (autocomplete Người phụ trách).
- Dashboard: chỉ nguồn `POST_OFFICE`, mặc định 3 ô CHART; `/api/dashboard/stats` chỉ còn số đếm mạng lưới.
- Giao diện: menu Dashboard / Quản lý mạng lưới / Quản lý người dùng; đổi tên hệ thống ở tiêu đề trang, đăng nhập, Header, Sidebar.
- Cấu hình: `package.json` `hue-dhcl@0.1.0` (bỏ `leaflet`, `react-leaflet`), container `hue-dhcl`, `HOST_PORT=18060`.
- Tests viết lại theo phạm vi mới: 108/108 pass; `npm run build` OK. `git init -b main`, chưa commit.
