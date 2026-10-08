# 📝 AI-Assisted Changes Changelog

Ghi lại các thay đổi được thực hiện với hỗ trợ của AI. Mới nhất ở đầu, append-only, 1 mục/ticket.

---

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
