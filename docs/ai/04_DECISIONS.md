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

## Dữ liệu "Hàng đến" (SANLUONG)

### 11. Sản lượng = số lượt đến (PO, 08/10/2026)
Mỗi tổ hợp `(SHBG, So_hieu_BD10, So_hieu_BD8)` khác nhau là 1 lượt (tính thêm khi BD8 hoặc BD10 khác); các dòng trùng cả ba
(chỉ khác giờ xác nhận) chỉ đếm 1. Luôn hiển thị kèm số bưu gửi khác nhau (`COUNT(DISTINCT SHBG)`) để đối chiếu và phát hiện lượt
tăng ảo (bưu cục gốc đóng trùng hoặc lỗi). Số túi/kiện = số `BD8` khác nhau (túi và kiện dùng chung một đơn vị). Mọi dòng vẫn được lưu đủ.

### 12. Khối lượng (PO, 08/10/2026)
`Khoi_luong_thuc_te` tính bằng gam, là khối lượng của từng bưu gửi trên từng dòng. Khi cộng theo lượt đến, mỗi lượt chỉ lấy 1 giá trị
(không cộng lặp qua các dòng cùng lượt).

### 13. Thời gian đến BCVH (PO, 08/10/2026)
Thời gian đến BCVH = mốc SỚM NHẤT trong 3 mốc `Thời gian XN túi`, `Ngay_gio_XND_BD10`, `Thời gian XN BG` (có dấu vết nào ở BCVH là
đã đến; BCVH chịu trách nhiệm hàng ngay khi túi đã quét; dữ liệu có lúc rỗng nên không dựa vào một cột). Đủ cả 3 mốc = đầy đủ nghiệp vụ;
thiếu mốc vẫn chấp nhận nếu còn ít nhất 1 mốc làm căn cứ xác định hàng đã đến; không có mốc nào = chưa đủ căn cứ (xếp nhóm "Chưa xác định
ngày đến", vẫn lưu dòng). Bộ lọc ngày cho chọn tiêu chí: Đến BCVH (mặc định) / XN túi / XN BD10 / XN BG. `Ngay_gio_XND_BD10_tai_TTKT`
KHÔNG dùng (là bưu cục trước BCVH).

### 14. Bộ lọc bưu cục / BĐX (PO, 08/10/2026)
Bộ lọc bưu cục = bưu cục nhận `BC_nhan_BG` (nay 533140, sau này có thêm BCVH khác; BCVH có loại hình PH2 trong danh mục).
Bộ lọc BĐX = BĐX của phường/xã nơi phát (`Ten_Xa_Phuong` → bảng ánh xạ).

### 15. Ý nghĩa phường/xã, tỉnh (PO, 08/10/2026)
`Ten_Xa_Phuong` = phường/xã mà bưu tá đến phát; `Ten_Tinh_Thanh` = tỉnh/thành nhận để phát. Dòng tỉnh khác chủ yếu là hàng chuyển
hoàn về bưu cục để phát hoàn.

### 16. Lưu trữ & trùng tên (PO, 08/10/2026)
Không loại dòng nào; lưu vĩnh viễn. Trùng tên file khác nội dung → từ chối + báo ADMIN.

### 17. "Thiếu đợt" (PO, 08/10/2026)
Mỗi ngày đã qua phải có 2 file; ngày có ít hơn 2 file thì báo để ADMIN kiểm tra SFTP. Không gắn giờ cố định. (File rỗng hợp lệ vẫn
tính là 1 file.)

### 18. Quyền xem màn hình (PO, 08/10/2026)
MANAGER + ADMIN (làm ở ticket sau).

### 19. Nhiều BCVH (PO, 08/10/2026)
Mỗi BCVH có thư mục SFTP riêng; SFTP lưu file mãi và NAS kết nối được nên sẽ nạp toàn bộ lịch sử. Lõi nạp KHÔNG được viết cứng mã
`533140` hay thư mục (cấu hình nguồn dạng danh sách "thư mục + mã BCVH" làm ở SANLUONG-5).

### 20. Ý nghĩa cột (PO, 08/10/2026)
`Ma_BC_dong` mã BC đóng; `BC_nhan_BG` mã BC nhận; `Ten_duong_thu` tên đường thư; `SHBG` số hiệu bưu gửi; `So_hieu_BD10`;
`Thời gian XN túi`; `Thời gian XN BG`; `Ngay_gio_XND_BD10` thời gian xác nhận BD10; `Ngay_gio_XND_BD10_tai_TTKT` thời gian xác nhận
đến BD10 tại Khai thác tỉnh; `So_hieu_BD8`; `Dich_vu_code`; `Ten_dich_vu`; `Ghi_chu`.

### 21. Thiết kế kỹ thuật nạp "Hàng đến" (SANLUONG-2, Claude Code tự chọn)
- **Schema** đặt trong `server/lib/arrivalsImport.js` (`ensureArrivalSchema`), `server/db.js` gọi lại — để công cụ dòng lệnh dùng
  chung trên DB bất kỳ (DB tạm khi chạy thử). `CREATE ... IF NOT EXISTS`, chạy được trên DB đã có.
- **`arrival_import_files`**: thay `file_name UNIQUE` bằng `UNIQUE(file_name, sha256)` + chỉ mục unique có điều kiện
  "mỗi tên chỉ 1 bản OK/EMPTY" — nếu `file_name` UNIQUE thì không ghi được dòng `CONFLICT`/`REJECTED` cho file trùng tên.
  Nạp lại file từng `REJECTED` (cùng băm) cập nhật chính dòng đó. Thêm cột `warning` (cảnh báo ≤1% dòng ngoài khoảng hợp lý).
- **Chữ rỗng lưu `''`** (không NULL) ở mọi cột chữ gốc; thời gian rỗng = NULL. Khoá chống trùng:
  unique index `(tracking_no, bd10_no, bd8_no, COALESCE(item_confirmed_at, ''))` + `INSERT OR IGNORE`.
- **Cột ngày dẫn xuất** cho từng tiêu chí lọc: `arrival_date`, `bag_date`, `bd10_date`, `item_date`, mỗi cột có chỉ mục
  `(receiver_code, <ngày>)`.
- **`arrival_at` khi các mốc bằng nhau**: ưu tiên `bag` → `bd10` → `item` (`arrival_at_basis`).
- **File chỉ có tiêu đề** = `EMPTY` (như 0 byte / chỉ BOM). Khối lượng phải là số nguyên (chữ số), khác → `REJECTED`.
- **Bộ đọc CSV**: `csv-parse` ^7.0.3 (MIT, JS thuần, không phụ thuộc, không biên dịch native), dạng luồng, `bom: true`.
  Thông báo lỗi chỉ ghi mã lỗi + số dòng + tên cột — không chép thông báo gốc của thư viện (có thể chứa giá trị ô).
- **`ward_bdx_map`**: khớp tên chuẩn hoá với `commune_post_offices.name` bỏ chữ "Bưu điện"; ưu tiên khớp đủ tiền tố Phường/Xã/Thị trấn,
  chỉ bỏ tiền tố khi ra đúng 1 BĐX. Không ghi đè `MANUAL`; dòng `AUTO` còn NULL được thử khớp lại mỗi lần nạp.
- **`getMissingBatches`** tính theo từng `unit_code`, từ ngày file sớm nhất đã chấp nhận đến hôm qua (giờ máy chủ); `REJECTED`/`CONFLICT`
  không tính là đã có file.
- Số liệu "ngoài tỉnh" của công cụ dòng lệnh lấy từ khoá tên tỉnh trong danh mục (`BĐTP Huế` → "hue") — chỉ để hiển thị.

## Drift phát hiện
_(chưa có)_
