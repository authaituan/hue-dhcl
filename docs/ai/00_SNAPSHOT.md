# 📸 SNAPSHOT — Trạng thái kỹ thuật HIỆN TẠI

> Chỉ ghi trạng thái hiện tại (không tường thuật từng PR — tường thuật ở `CHANGELOG_AI.md`).
> Giữ file dưới ~250 dòng. Cập nhật lần cuối: 2026-10-15 (SANLUONG-5e).

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
| Quản lý người dùng (tạo, sửa tên/quyền, đặt lại mật khẩu, khoá/mở khoá) — chỉ ADMIN; 5 vai trò ADMIN/TTVH/GDVH/STAFF/TIVI (`server/roles.js`) | Có |
| Gán GDVH ↔ BCVH (`user_bcvh`, `GET/PUT /api/users/:id/bcvh`, `bcvh_codes` trong danh sách) | Có (API; chưa giao diện); dùng để giới hạn xuất file của GDVH |
| Vai trò `TIVI` (màn hình tivi 24/24): chỉ 3 endpoint dashboard «đến» + `/auth/me` (allowlist, từ chối mặc định), phạm vi `all` / một BCVH (`user_tivi_scope`, `tivi_scope` trong API tài khoản), token `JWT_EXPIRY_TIVI` (90 ngày) — #74 | Có (API; chưa giao diện) |
| Module «Xử lý và tỷ lệ phát» (backend): file mẫu 1 dòng/SHBG, tải lên + kiểm tra từng dòng, biên tập, nhập từng phần, file lỗi, hoàn tác đợt, danh sách đợt, **danh sách bản kiểm tra của tôi `GET /api/phat/drafts` + bản kiểm tra thuộc người tạo (ADMIN/TTVH chỉ xem, xoá được mọi bản; người khác 404 — #77, PHAT-1b)**, `DELETE /api/phat/drafts/:id`, **xem trước hoàn tác `GET /api/phat/batches/:id/undo-preview`, lịch sử đợt có lọc (`tu_ngay`, `den_ngay` theo giờ Bangkok, `nguoi_nhap`, `trang_thai`), `so_canh_bao` của đợt (NULL = không rõ với đợt cũ), `nguoi_nhap_lua_chon`, 409 của `/undo` giàu thông tin — #78, PHAT-2b-1**, `GET /api/phat/ty-le` (mẫu số khớp `tong-quan-den`, mức cập nhật, khung giờ đến, tồn chờ); `nhap_luc` do máy chủ ghi — `08_PHAT.md`, #75; **kết quả phát cho Dashboard `GET /api/arrivals/dashboard/ket-qua-phat` (mẫu số, 5 trạng thái, PTC, mức cập nhật, `co_so_lieu_phat` + `so_lieu_den_luc` THEO NGÀY, hai ngưỡng màu và sàn xếp hạng ở `server/lib/phatConfig.js`, xếp hạng BCVH có sàn 50 kèm tỷ lệ 4 trạng thái còn lại của từng BCVH (#80), «chưa đủ dữ liệu»; ADMIN/TTVH/GDVH xem đủ mọi BCVH như #72, STAFF/TIVI 403) — #79, PHAT-3b** | Có (API; giao diện màn Phát có; chưa nối Dashboard — PHAT-3c, tivi — PHAT-3d) |
| Quản lý mạng lưới — danh sách, lọc, thêm/sửa/xoá bưu cục, người phụ trách, import/export Excel | Có |
| Dashboard động (3 ô CHART mặc định trên dữ liệu bưu cục; ADMIN chỉnh sửa) | Có |
| Lọc IP truy cập, header bảo mật, trang 404 | Có |
| Nạp DB ban đầu từ hệ thống cũ (`scripts/import-seed.js`: tài khoản + mạng lưới) | Có |
| Dữ liệu "Hàng đến": bảng + nạp CSV bằng dòng lệnh (`scripts/import-arrivals.js`), ánh xạ phường→BĐX, kiểm thiếu đợt | Có |
| API "Hàng đến" `/api/arrivals/*` (meta, summary, by-time, by-ward, by-route, by-service, quality-mocs, lookup, items; exceptions + import-status chỉ ADMIN) — ADMIN + TTVH + GDVH | Có (chưa giao diện/SFTP) |
| ~~API Dashboard điều hành `/api/arrivals/dashboard/overview|trend|wards-surge|center`~~ — ĐÃ XOÁ ở DASH-6b (#76); `server/lib/dashboardQuery.js` chỉ còn danh mục 6 BCVH | Đã xoá |
| Dashboard «Cần điều hành ngay hôm nay» — phần đến: `/api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang` (hôm nay = ngày dữ liệu mới nhất của BCVH; hai mốc so sánh hôm qua / cùng thứ tuần trước, cùng giờ DỮ LIỆU; hàng đi ngoài chỉ hiển thị; sau 15:00; mức điều hành từ `server/config/dashboard-thresholds.js` TẠM; mức sản lượng chỉ gắn khi mốc tuần trước ≥ 50 bưu gửi và dữ liệu từ 12:00) — #73, #76 | Có (API + giao diện đã đổi khoá ở DASH-6b; số chênh = null khi mốc dưới 50 bưu gửi) |
| Công cụ dev: `scripts/reset-arrivals.js` (xoá dữ liệu sản lượng đến), `scripts/split-arrivals-csv.js` (tách file CSV nhiều ngày theo ngày) rồi nạp bằng `import-arrivals.js`; importer đọc cột theo TÊN (cột lạ bỏ qua, bí danh không dấu); ngày giờ nhận ISO có mili giây / dạng T / dạng Mỹ cũ, chữ `NULL` ở MỌI cột = ô rỗng (#65, #66) — #63, #64, `06_DEPLOYMENT.md` mục 9 | Có |
| Thử kết nối SFTP chỉ đọc: `scripts/sftp-probe.js` (`--show-fingerprint`; liệt kê tên/kích thước/mtime các thư mục `CSV_Report_<mã>`; ghim vân tay `SFTP_HOSTKEY_SHA256`), hàm thuần dùng lại ở `server/lib/sftpFiles.js` — `12_SFTP_PROBE.md`, SANLUONG-5b. Chưa tải / nạp / hẹn giờ | Có (công cụ dòng lệnh; chưa chạy với NAS thật) |
| Đồng bộ SFTP chạy TAY: `scripts/sftp-sync.js` (mặc định chạy khô; `--chay-that --toi-da=N`) → `server/lib/sftpSync.js` quét, chọn file chưa nạp + ổn định, tải tệp tạm, `importArrivalFile(source:'SFTP')`, ghi `sftp_sync_runs` / `sftp_sync_files` — `13_SFTP_SYNC.md`, SANLUONG-5c. Chưa hẹn giờ (5e), chưa giao diện (5f), chưa nạp lịch sử (5d) | Có (công cụ dòng lệnh; chưa chạy với NAS thật) |
| Hẹn giờ tự động nạp file từ SFTP trong máy chủ (`server/lib/sftpScheduler.js` + lớp kết nối `sftpConnect.js`; **MẶC ĐỊNH TẮT**, chỉ `SFTP_SYNC_ENABLED=1`; chu kỳ 10 phút, tối đa 5 file/lượt; «ổn định» xét qua bảng `sftp_source_files`; lỗi xác thực / vân tay sai → tạm dừng; mã lạ bị bỏ qua) — `15_SFTP_SCHEDULER.md`, SANLUONG-5e. Chưa API / màn quản trị | Có (backend; chưa chạy với NAS thật; compose chưa truyền `SFTP_*` vào container) |
| "BD10 đến không XNĐ" (`bd10_den_khong_xnd` trong `/summary`, `/dashboard/center`; `GET /api/arrivals/bd10-khong-xnd` + `/export`; trạng thái BD10 đến theo ngày / theo bưu cục lập `GET /api/arrivals/bd10-trang-thai/theo-ngay` và `/theo-buu-cuc-lap` (≤ 92 ngày; số BD10 và số bưu gửi — #71); CÔNG KHAI mọi vai trò theo bộ lọc BCVH, tải / xuất GDVH chỉ BCVH được giao — #72; đơn vị BD10 tính lúc truy vấn) — #67, #69 | Có (API; chưa giao diện) |
| "Đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" (`chua_nhan_tai_bcvh` trong `/summary`, `/dashboard/center`; `GET /api/arrivals/not-received` + `/not-received/export`; mọi vai trò theo bộ lọc BCVH, tải / xuất GDVH chỉ BCVH được giao — #72; loại bưu gửi có BD10 của dòng đại diện rỗng / lập đi — #68) và chất lượng khai thác theo nguồn BD10 (`tong_hop.theo_nguon`, `TTKT_BD10_PREFIX = '530100'`) — #60, #61 | Có (API; chưa giao diện) |
| Xuất Excel dữ liệu thô "Hàng đến" của MỘT BCVH: `GET /api/arrivals/export-scope`, `/export` (9 cột chuỗi, ghi luồng; ADMIN/TTVH mọi BCVH, GDVH BCVH được giao) — #55–#58 | Có (chưa giao diện nút xuất) |

## 4. Quy tắc nghiệp vụ chính
- 5 vai trò (`04_DECISIONS.md` #49–#54, #74; ma trận ở `03_ARCHITECTURE_MAP.md` mục 3): `ADMIN` toàn quyền (tài khoản, gán BCVH, mạng lưới ghi, cấu hình Dashboard, cảnh báo dữ liệu); `TTVH` và `GDVH` xem mạng lưới + toàn bộ dữ liệu "Hàng đến"/Dashboard điều hành của 6 BCVH (GDVH chỉ bị giới hạn khi XUẤT FILE: BCVH được giao); `STAFF` chỉ thấy Dashboard; `TIVI` chỉ gọi 3 endpoint dashboard «đến» trong phạm vi được gán.
- Quyền tra DB mỗi request (đổi vai trò / khoá có hiệu lực ngay, token cũ vẫn dùng); role ngoài danh sách (vd `MANAGER` chưa chuyển đổi) → 403; luôn còn ≥ 1 ADMIN hoạt động.
- Chỉ Quản lý mạng lưới được tạo Tỉnh/BĐX/Bưu cục (import theo `maMbc`; thiếu `maMbc` → chặn cả lô).
- Xoá bưu cục là xoá cứng; còn người dùng tham chiếu (`users.post_office_id`) → 400.
- Người phụ trách bưu cục = 1 dòng `users` (không FK cứng; kiểm tra tồn tại ở route).
- Tài khoản bị khoá (`deactivated_at`) không đăng nhập được, không hiện trong gợi ý người phụ trách.
- Hàng đến: **sản lượng đến = số SHBG khác nhau**, đếm 1 lần tại lần đến sớm nhất trong khoảng lọc (theo tiêu chí ngày giờ; lọc tới phút);
  thời gian đến BCVH (R2, #59) = mốc đầu tiên không trống theo XN túi → XN bưu gửi → XNĐ BD10 (không dùng `bd10_ttkt_confirmed_at`); bưu cục = BC nhận; bảng phường/xã nơi phát có nhóm "Phường/xã tỉnh khác",
  "Chưa xác định tỉnh", "Chưa xác định phường/xã" (vẫn tính vào tổng); không dùng BĐX ở màn hình này; cảnh báo chỉ ADMIN;
  file trùng tên khác nội dung → CONFLICT; mỗi ngày cần 2 file (`04_DECISIONS.md` #11–#21, #23, #25–#26, #28–#35).
- Hàng đến theo đường thư / dịch vụ: gom trên dòng đại diện; hàng đi ngoài = SHBG có ≥ 1 dòng BD8 (chuẩn hoá) = SHBG, mẫu số = sản lượng đến (chỉ số phụ, nằm trong sản lượng; thay «hàng nặng», #76) — #36–#40.
- Dashboard điều hành: 6 BCVH cố định (`DASHBOARD_BCVH`); chỉ hai mốc so sánh — hôm qua (hiển thị) và cùng thứ tuần trước (dùng để gắn mức), cùng giờ dữ liệu; không còn «TB 4 tuần»/«mức bình thường» (#76); "đủ trạng thái (SHBG, BD8, BD10)" = đủ cả 3 mốc; mức sản lượng lệch 15% / 25% (TẠM) chỉ khi mốc tuần trước ≥ 50 bưu gửi và `den_luc` từ 12:00, ngược lại trả `chua_du_du_lieu` + lý do; hàng đi ngoài không gắn mức — khác cảnh báo dữ liệu ADMIN-only — #41, #43–#47 (phần còn hiệu lực), #73, #76.

## 5. Kiểm thử
`npm test`: 28 file, 435 ca — 434 pass, 0 fail, 1 skip (kịch bản đo `PHAT_PERF=1`), 2026-10-14 (SANLUONG-5g-1: +16 ca ở `tests/arrivals-import-split.test.js`; SANLUONG-5e: +29 ca — `tests/sftp-scheduler.test.js` 25, `tests/sftp-sync.test.js` +4; SANLUONG-5c-1: +5 ca ở `tests/sftp-sync.test.js`; SANLUONG-5c: +27 ca ở `tests/sftp-sync.test.js` và `sftp-probe.test.js`; SANLUONG-5b: +20 ca ở `tests/sftp-probe.test.js`; PHAT-3b-1: +1 ca; PHAT-3b: +17 ca ở `tests/phat-dashboard.test.js`, trong đó 1 ca đo hiệu năng chỉ chạy khi `PHAT_PERF=1`; trước đó PHAT-2b-1 +5 ca, PHAT-1b +10, DASH-6b chặng 2).

## 6. Rủi ro / việc treo
- **DB thật còn ngày đến theo quy tắc cũ** (mốc sớm nhất): sao lưu rồi chạy `scripts/rederive-arrival.js` (chạy thử → `--apply`, `06_DEPLOYMENT.md` mục 8). Trên bản chép: đổi 110/13.102 dòng, sản lượng 02→08/10 giữ 12.783. Dữ liệu nạp mới đã theo R2.
- **DB thật còn tài khoản `MANAGER`?** Chạy `scripts/migrate-roles.js` (dry-run → sao lưu → `--apply`, `06_DEPLOYMENT.md` mục 7) trước khi dùng bản này, nếu không các tài khoản đó nhận 403. Menu "Quản lý người dùng" vẫn hiện cho TTVH/GDVH nhưng API trả 403 (dọn ở ticket giao diện, backlog 7b).
- DB mới trống: PO nạp tài khoản + mạng lưới từ DB hệ thống cũ bằng `scripts/import-seed.js` (`06_DEPLOYMENT.md` mục 5).
  Triển khai sạch không có DB cũ: chưa có cơ chế tạo ADMIN đầu tiên (`05_BACKLOG.md` mục 1).
- `NetworkListView.jsx` ~1.380 dòng, cần tách nhỏ (ticket riêng).
- Dashboard: chỉ BCVH 533140 có dữ liệu (5 BCVH còn lại trả 0 / `co_du_lieu: false` đến khi nối SFTP); ngưỡng điểm cần điều hành và định nghĩa "xác nhận chậm" là TẠM (`05_BACKLOG.md` 6g). `/trend` ~1,1–1,2 s và `/center` 7 ngày ~1 s trên 1 triệu dòng (ngưỡng 1,5 s; `/center` 30 ngày ~4,9 s).
- Xuất Excel: 1 tháng 1 BCVH (~335 nghìn dòng giả) ~3,4 s; tối đa ~1 triệu dòng (92 ngày) ~9,8 s; RSS đỉnh ~270–300 MB (nền ~70 MB) và KHÔNG tăng theo số dòng. Chưa mở thử bằng Excel thật (PO kiểm). Giới hạn 92 ngày / 1.000.000 dòng / định dạng giờ `dd/MM/yyyy HH:mm:ss` là mặc định CTO chọn (#56).
- API Hàng đến: khoảng 1 năm mất 3,7–7,8 s trên 1 triệu dòng (1 tháng < 0,5 s) — cần bảng phụ nếu xem dài hạn (`05_BACKLOG.md` mục 5).
