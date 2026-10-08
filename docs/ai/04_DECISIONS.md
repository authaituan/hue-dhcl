# 📋 Decisions & Technical Drift

Append-only, đánh số. Mục đánh dấu **(kế thừa it-assets v1.0.0)** là quyết định chung đã có từ
project gốc, vẫn áp dụng nguyên vẹn.

## Quyết định của project hue-dhcl

### 1. Phạm vi project khởi đầu (NEWPROJ-1, 2026-10-08)
**Quyết định (PO)**: dựng khung "Hệ thống điều hành chất lượng - khâu Phát" từ it-assets v1.0.0, chỉ giữ:
đăng nhập/tài khoản, Quản lý mạng lưới (chỉ màn hình danh sách), Dashboard động. Bỏ toàn bộ nghiệp vụ
thiết bị, thư điện tử công vụ, nhân sự thuần, danh mục, cây thư mục và bản đồ mạng lưới.
DB mới chỉ có: tài khoản + mạng lưới (tỉnh/BĐX/bưu cục) + cấu hình Dashboard. Dữ liệu mạng lưới nạp sau
bằng chức năng Import Mạng Lưới. Cổng NAS 18060. Giữ nhận diện (logo VNPost, ảnh đăng nhập, bộ màu).
**Hệ quả kỹ thuật**:
- Autocomplete "Người Phụ Trách" bưu cục chuyển sang `GET /api/users/search` (logic tìm kiếm giữ nguyên từ bản gốc).
  Người phụ trách giờ chỉ chọn được trong bảng `users` (tài khoản tạo ở Quản lý người dùng).
- STAFF chỉ còn thấy Dashboard (trước đây xem được Cây thư mục mạng lưới — màn hình đã bỏ).
- Dashboard: chỉ còn nguồn `POST_OFFICE`; bộ mặc định 3 ô CHART (xem `03_ARCHITECTURE_MAP.md` mục 5).
- Trang 404 **không** ghi tên hệ thống — giữ nguyên tắc "IP bị chặn không biết có hệ thống ở đây" (#4).

### 2. Dev AI không commit/push (2026-10-08, PO)
**Quyết định**: Dev AI (Antigravity, Claude Code) không `git add`/`commit`/`push`/merge/tạo remote; PO là người duy nhất
`git add` (từng file), commit, push, merge — theo hướng dẫn từng bước của CTO AI (`02_WORKFLOW.md` mục 4).
**Trạng thái**: ✅ Đã áp dụng (NEWPROJ-2) — câu chữ trong `docs/01_GOVERNANCE/*` đã sửa đồng bộ (executor bàn giao danh
sách file + gợi ý commit message thay vì tự commit).

## Quyết định chung (kế thừa it-assets v1.0.0)

### 3. Bảo mật đăng nhập: JWT bắt buộc có secret, rate-limit
- Thiếu `JWT_SECRET` → server không khởi động (chỉ máy dev được `ALLOW_INSECURE_DEV=1`).
- Mọi `/api/*` trừ đăng nhập bắt buộc token, kể cả route đọc và route quên gắn `authRequired`.
- Rate-limit đăng nhập: tối đa 5 lần sai / 15 phút theo cặp (IP + mã HRM), cộng trần theo IP
  (`LOGIN_IP_MAX_FAILS`, mặc định 20). Lưu trong bộ nhớ tiến trình — mất khi restart, chấp nhận ở quy mô 1 instance.
- Phân quyền nhị phân: `STAFF` chỉ đọc, vai trò khác là quản lý; `ADMIN` thêm quyền cấu hình Dashboard.

### 4. Lọc IP (allowlist) — `CMS_ALLOWED_IPS`
IP ngoài danh sách nhận trang 404 (trình duyệt) / 404 JSON (API), không lộ là có hệ thống; ghi `data/security.log`.
Sai cú pháp danh sách → server không khởi động. Chỉ tin `X-Forwarded-For` khi có `TRUSTED_PROXIES`.

### 5. Dashboard động
- Chỉ dùng DANH SÁCH TRẮNG (`server/lib/dashboardSources.js`): người dùng chỉ gửi khoá; biểu thức SQL viết sẵn;
  giá trị lọc qua tham số `?`. Có test chèn SQL.
- v1 chỉ số liệu COUNT.
- Ghi cấu hình + `widgets-meta` + `widgets-preview` chỉ ADMIN; cấu hình dùng chung cho mọi người.
- Ô SYSTEM chỉ đổi tiêu đề/cỡ/ẩn hiện, không xoá; PUT gửi key khác bị bỏ qua im lặng.
- Giao diện: phần "Khác" chỉ hiện ở DONUT/LIST/TABLE; sắp xếp ô bằng nút Lên/Xuống.

### 6. Giao diện / theme
- Theme Soft UI (giấy phép MIT, xem `THIRD_PARTY_NOTICES.md`; token ở `DEMO_SOFT_UI_TOKENS.md`).
- Nút chính dùng `#CC4A0A` (đạt WCAG AA với chữ trắng); `#F97316` chỉ làm màu trang trí.
- Font Inter toàn app; Montserrat chỉ cho trang đăng nhập (`.login-montserrat`).

### 7. Express 5: fallback SPA bằng `app.use(...)`, không dùng `app.get('*')`
`app.get('*')` crash khi có `dist/` (path-to-regexp mới). Dùng middleware cuối cùng.

### 8. Cài dependencies trên Windows bằng `npm ci --ignore-scripts`
`better-sqlite3` có sẵn bản prebuilt; máy không có Visual Studio chạy `npm ci` thường sẽ lỗi `node-gyp`.

### 9. Docker / Synology
- Container chạy root (tránh lỗi quyền ghi SQLite trên bind-mount Synology); DB nằm ngoài image (`./data:/app/data`).
- `network_mode: host` (mạng bridge làm app thấy IP `172.18.0.1` → allowlist chặn hết); không dùng mục `ports`;
  cổng app = `HOST_PORT` (hue-dhcl: 18060), phải mở trong Tường lửa DSM.
- Không có bước `apt-get` trong Dockerfile (lỗi DNS khi build trên NAS); dùng prebuilt + `--ignore-scripts`.

### 10. Nạp DB ban đầu bằng script, nguồn chỉ được ĐỌC qua bản sao tạm (NEWPROJ-2, 2026-10-08)
**Quyết định (PO)**: dùng lại đúng tài khoản cũ (giữ `id` + `password_hash`) và danh mục mạng lưới từ DB hệ thống cũ bằng
`scripts/import-seed.js`; không tạo "admin mặc định", không tự đặt mật khẩu.
**Quyết định kỹ thuật**: không mở trực tiếp DB nguồn. Đã kiểm chứng: mở SQLite `readonly` trên DB chế độ WAL vẫn tạo
`-wal`/`-shm` cạnh file; bản better-sqlite3 đang dùng không bật URI nên không dùng được `immutable=1`/`ATTACH ... mode=ro`.
Script chỉ đọc nguồn (+ `-wal` nếu có) để chép sang thư mục tạm của hệ điều hành, mở bản sao `readonly`, xong xoá.
Sao chép theo giao tập cột, 1 transaction, `defer_foreign_keys` + `foreign_key_check` trước khi commit.

## Drift phát hiện
_(chưa có)_
