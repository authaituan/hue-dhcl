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
> **Thay thế bởi #28** (SANLUONG-3b): bỏ khái niệm lượt, sản lượng = số SHBG khác nhau.
Mỗi tổ hợp `(SHBG, So_hieu_BD10, So_hieu_BD8)` khác nhau là 1 lượt (tính thêm khi BD8 hoặc BD10 khác); các dòng trùng cả ba
(chỉ khác giờ xác nhận) chỉ đếm 1. Luôn hiển thị kèm số bưu gửi khác nhau (`COUNT(DISTINCT SHBG)`) để đối chiếu và phát hiện lượt
tăng ảo (bưu cục gốc đóng trùng hoặc lỗi). Số túi/kiện = số `BD8` khác nhau (túi và kiện dùng chung một đơn vị). Mọi dòng vẫn được lưu đủ.

### 12. Khối lượng (PO, 08/10/2026)
`Khoi_luong_thuc_te` tính bằng gam, là khối lượng của từng bưu gửi trên từng dòng. Khi cộng theo lượt đến, mỗi lượt chỉ lấy 1 giá trị
(không cộng lặp qua các dòng cùng lượt).

### 13. Thời gian đến BCVH (PO, 08/10/2026)
Thời gian đến BCVH = mốc SỚM NHẤT trong 3 mốc `Thời gian XN túi`, `Ngay_gio_XND_BD10`, `Thời gian XN BG` (có dấu vết nào ở BCVH là
đã đến; BCVH chịu trách nhiệm hàng ngay khi túi đã quét; dữ liệu có lúc rỗng nên không dựa vào một cột). Đủ trạng thái (SHBG, BD8, BD10 — trước đây gọi "đủ cả 3 mốc", #43) = đầy đủ nghiệp vụ;
thiếu mốc vẫn chấp nhận nếu còn ít nhất 1 mốc làm căn cứ xác định hàng đã đến; không có mốc nào = chưa đủ căn cứ (xếp nhóm "Chưa xác định
ngày đến", vẫn lưu dòng). Bộ lọc ngày cho chọn tiêu chí: Đến BCVH (mặc định) / XN túi / XN BD10 / XN BG. `Ngay_gio_XND_BD10_tai_TTKT`
KHÔNG dùng (là bưu cục trước BCVH).

### 14. Bộ lọc bưu cục / BĐX (PO, 08/10/2026)
> **Phần bộ lọc BĐX thay thế bởi #30** (bỏ BĐX khỏi màn hình này). Bộ lọc bưu cục = `receiver_code` vẫn giữ.
Bộ lọc bưu cục = bưu cục nhận `BC_nhan_BG` (nay 533140, sau này có thêm BCVH khác; BCVH có loại hình PH2 trong danh mục).
Bộ lọc BĐX = BĐX của phường/xã nơi phát (`Ten_Xa_Phuong` → bảng ánh xạ).
**Đính chính (SANLUONG-3, 08/10/2026)**: trong danh mục, 533140 "BCVH Thuận Hóa" có loại hình **PH1** (BCVH loại 1), không phải PH2; bộ lọc bưu cục không lọc theo loại hình (#25).

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

### 22. Đếm lượt đến — quy tắc mới (PO, 08/10/2026; thay quy tắc #11 ở tầng truy vấn)
> **Thay thế bởi #28** (SANLUONG-3b): không còn lượt đến, không gộp dòng thiếu BD10/BD8.
Đếm lượt đến (thay quy tắc cũ, chỉ ở tầng truy vấn, mọi dòng vẫn được lưu):
- Dòng đủ = có cả `bd10_no` và `bd8_no` khác rỗng. Dòng thiếu = thiếu `bd10_no` hoặc `bd8_no` (hoặc cả hai).
- Với cùng SHBG đã có dòng đủ: dòng thiếu BD10 bị gộp (không tạo lượt) nếu `bd8_no` của nó trùng một dòng đủ của SHBG đó; dòng thiếu
  BD8 bị gộp nếu `bd10_no` trùng một dòng đủ. Không khớp → vẫn là một lượt riêng.
- SHBG chỉ có dòng thiếu, không có dòng đủ: mỗi tổ hợp `(SHBG, bd10_no, bd8_no)` khác nhau là một lượt.
- Dòng thiếu cả hai (BD10 và BD8 đều trống): PO chưa quyết. Tạm thời KHÔNG gộp (coi là lượt riêng) và báo số lượng riêng trong báo cáo
  để PO quyết.
- Lượt gộp lấy thời gian đến, phường/xã, khối lượng của dòng đủ (khối lượng: 1 giá trị/lượt, dùng MAX). Lượt chỉ có dòng thiếu lấy
  mốc đến sớm nhất của các dòng cùng tổ hợp.

### 23. Mốc `Ngay_gio_XND_BD10` sớm bất thường (PO, 08/10/2026)
KHÔNG điều chỉnh dữ liệu, KHÔNG đổi quy tắc "mốc sớm nhất". Chỉ đếm và báo cảnh báo (lượt có `arrival_at_basis = bd10` và
`arrival_date` sớm hơn ngày file chứa nó).

### 24. Ánh xạ phường/xã → BĐX chỉ cho tỉnh Huế (PO, 08/10/2026)
> **Phần ánh xạ BĐX thay thế bởi #30** (API này không dùng `ward_bdx_map`). Cách nhận biết tỉnh Huế và các nhóm phân loại vẫn giữ (#29).
Ánh xạ phường/xã → BĐX chỉ áp khi `province_name` là tỉnh Huế. Dòng tỉnh khác (hàng chuyển hoàn…) không gán BĐX Huế; xếp nhóm riêng
"Ngoài tỉnh". Dòng không có phường/xã: nhóm "Chưa xác định phường/xã". Tính tại truy vấn, không sửa dữ liệu đã lưu, không sửa
`ward_bdx_map`.
**Cách nhận biết "Huế" (Claude Code đề xuất, đã cài)**: từ khoá lấy từ danh mục `province_post_offices` (bỏ "BĐTP/BĐT/Bưu điện":
"BĐTP Huế" → `hue`); tên tỉnh trong CSV chuẩn hoá (`wardKey`) rồi bỏ tiền tố "Tỉnh/Thành phố/TP." — là tỉnh nhà nếu **bằng** hoặc
**kết thúc bằng** từ khoá (khớp cả "Tỉnh Thừa Thiên Huế" tên cũ lẫn "Thành phố Huế"; không khớp "TP. Hồ Chí Minh"). Không viết cứng "Huế".
Thêm 1 nhóm riêng **"Chưa xác định tỉnh"** (`NO_PROVINCE`) cho dòng có phường/xã nhưng thiếu tỉnh (không đủ căn cứ là Huế, cũng không phải
tỉnh khác) — 0 dòng trên 9 file mẫu. Thứ tự xét: tỉnh khác → thiếu phường/xã → thiếu tỉnh → phường chưa gán BĐX → BĐX.

### 25. Loại hình BCVH (PO, 08/10/2026)
PH1 = BCVH loại 1 (quy mô lớn), PH2 = BCVH loại 2. Bộ lọc bưu cục dùng thẳng mã `receiver_code`, KHÔNG lọc theo loại hình.

### 26. Quyền xem dữ liệu Hàng đến (PO, 08/10/2026)
MANAGER + ADMIN xem; STAFF 403; không token 401.

### 27. Thiết kế API "Hàng đến" (SANLUONG-3, Claude Code tự chọn)
> **Thay thế bởi #35** (SANLUONG-3b): lõi đếm và danh sách endpoint mới.
- **Một nơi cài quy tắc**: `server/lib/arrivalsQuery.js` → `buildVisitsCte()` dựng CTE `fv` (lượt đã lọc), mọi endpoint chỉ thêm SELECT/GROUP BY lên `fv`.
- **Cách cài quy tắc gộp (SQL thuần)**: (1) chọn SHBG ứng viên có ít nhất 1 dòng mang ngày trong khoảng; (2) với MỌI dòng của các SHBG đó
  (kể cả ngoài khoảng), dòng thiếu tìm dòng đủ cùng SHBG bằng subquery tương quan qua chỉ mục `(tracking_no, bd10_no, bd8_no)` → khoá lượt
  `(SHBG, v_bd10, v_bd8)`; khớp nhiều dòng đủ → lấy `bd10_no`/`bd8_no` nhỏ nhất (cố định); (3) `GROUP BY` khoá lượt; dòng đại diện =
  MIN(khoá ghép "dòng đủ trước, mốc đến sớm nhất, id nhỏ nhất") — thời gian đến, phường, tỉnh, bưu cục nhận, dịch vụ lấy từ dòng này;
  ngày theo tiêu chí và khối lượng (MAX) lấy trên các dòng đủ (hoặc các dòng thiếu nếu lượt không có dòng đủ); (4) lọc lượt theo ngày/bộ lọc.
  Không dùng window function (bản đầu dùng ROW_NUMBER chậm hơn ~5 lần).
- **Tỉnh nhà** tính bằng hàm SQL `arrivals_is_home()` đăng ký từ JS (tránh quét DISTINCT `province_name` toàn bảng mỗi lần gọi).
- **"Không có ngày" (`quality.undated`)**: tiêu chí `arrival` = lượt không có mốc nào (toàn bộ dữ liệu); tiêu chí `bag/bd10/item` = lượt đã
  đến BCVH trong khoảng nhưng thiếu mốc của tiêu chí đó (có ý nghĩa hơn và không phải quét mọi dòng thiếu mốc).
- **Tham số**: whitelist khoá (khoá lạ → 400), `from`/`to` bắt buộc, khoảng tối đa 731 ngày, `page_size` ≤ 200, `commune_id` nhận id BĐX trong
  danh mục hoặc mã nhóm `OUT_PROVINCE`/`NO_WARD`/`NO_PROVINCE`/`UNMAPPED`; `receiver_code`/`commune_id` nhận nhiều giá trị (lặp tham số
  hoặc phân tách bằng dấu phẩy); `ward_key` nhận cả tên phường/xã gốc (được chuẩn hoá). Lỗi 500 không trả SQL.
- **Hiệu năng** (1,05 triệu dòng giả, 1 BCVH): 1 tháng 0,4–0,8 s mọi endpoint; 1 năm 6,9–10,2 s — vượt mức chấp nhận cho giao diện.
  **Đề xuất (chưa làm, cần PO duyệt vì đổi schema)**: bảng phụ `arrival_visits` (1 dòng/lượt, tính lại cho các SHBG bị ảnh hưởng mỗi lần nạp file),
  hoặc bảng tổng hợp theo ngày × bưu cục × BĐX cho `/by-day`, `/by-bdx`, `/summary` khoảng dài; thêm chỉ mục `(bag_date)`, `(bd10_date)`,
  `(item_date)` đơn nếu lọc theo tiêu chí này không kèm bưu cục.

### 28. Sản lượng đến (PO, 08/10/2026; thay #11, #22)
Sản lượng đến = số bưu gửi (SHBG) khác nhau, mỗi bưu gửi đếm 1 lần trong khoảng lọc, tại lần đến sớm nhất trong khoảng theo tiêu chí
ngày giờ đã chọn. Phường/xã, tỉnh, khối lượng, bưu cục nhận lấy từ dòng đại diện của lần đó (nhiều dòng cùng thời điểm: chọn dòng `id`
nhỏ nhất, để kết quả cố định). KHÔNG xét `bd10_no`, `bd8_no` và giờ XN bưu gửi khi đếm. Bưu gửi đến lại trong cùng khoảng không đếm
thêm; đến lại ở khoảng khác thì đếm ở khoảng đó. Mọi dòng vẫn được lưu đủ.

### 29. Không loại dòng nào (PO, 08/10/2026)
Không loại dòng nào: hàng chuyển hoàn và hàng tỉnh khác tính vào sản lượng. Vẫn tách nhóm phân loại ở bảng phường/xã: "Phường/xã tỉnh
khác", "Chưa xác định tỉnh", "Chưa xác định phường/xã". Cách nhận biết tỉnh Huế giữ như đã làm.

### 30. Bỏ BĐX khỏi màn hình này (PO, 08/10/2026)
Bỏ khái niệm BĐX khỏi màn hình này: bỏ `/by-bdx`, tham số `commune_id`, nhóm "chưa gán BĐX". Giữ nguyên bảng `ward_bdx_map` trong
schema (dùng sau cho Dashboard), nhưng không dùng ở API này. Việc "gán tay Xã A Lưới 4 → BĐX 5336" chưa cần cho màn hình này.

### 31. Lọc có giờ (PO, 08/10/2026)
Lọc có giờ: `from`, `to` dạng `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM` (cũng nhận dấu `T`). Chỉ ngày: `from` = 00:00 đầu ngày, `to` = hết
ngày. So sánh `from <= thời điểm <= to` trên cột thời gian đầy đủ của tiêu chí đã chọn; cột ngày dẫn xuất và chỉ mục chỉ dùng để thu hẹp
ứng viên. Giữ giới hạn khoảng tối đa 731 ngày.

### 32. Địa bàn phát (PO, 08/10/2026)
Địa bàn phát = phường/xã nơi phát có bưu gửi đến. Bảng chính sắp theo sản lượng đến giảm dần.

### 33. Chất lượng khai thác hàng đến tại BCVH (PO, 08/10/2026)
Chất lượng khai thác hàng đến tại BCVH (mọi vai trò MANAGER/ADMIN thấy): mỗi bưu gửi được xếp theo tổ hợp mốc BCVH đã xác nhận trong
3 mốc (XN túi, XND BD10, XN bưu gửi). Mốc "có" = ít nhất một dòng của SHBG đó (trong khoảng lọc) có giá trị. Bảng trả đủ 7 tổ hợp có ít
nhất 1 mốc, kèm số bưu gửi và tỷ lệ; tổng 7 tổ hợp bằng đúng sản lượng đến. Bưu gửi không có mốc nào (chưa xác định ngày đến) không vào
sản lượng; báo riêng.

### 34. Cảnh báo và chất lượng dữ liệu chỉ ADMIN (PO, 08/10/2026)
Cảnh báo và chất lượng dữ liệu chỉ ADMIN thấy: các trường cảnh báo trong `/summary` và `/import-status`, `/exceptions` trả 403 hoặc bị bỏ
khỏi kết quả với MANAGER. Nội dung giữ lại, PO sẽ bàn tiếp.
**Cách đã chọn (Claude Code)**: `/exceptions`, `/import-status` → **403** với MANAGER; `/summary` **bỏ hẳn trường `canh_bao`** với
MANAGER (vẫn 200, các chỉ số chính giữ nguyên). `/quality-mocs` (gồm số bưu gửi không có mốc nào) thuộc #33 nên MANAGER vẫn thấy.

### 35. Thiết kế lõi "Sản lượng đến" (SANLUONG-3b, Claude Code tự chọn; thay #27)
- **Lõi** `buildCountedCte()` (`server/lib/arrivalsQuery.js`): `r` = dòng có thời điểm (cột thời gian của tiêu chí) trong `[from, to]`, thu hẹp
  bằng cột ngày dẫn xuất + chỉ mục; `firsts` = mỗi SHBG `MIN(thời điểm || id)` (sớm nhất, hoà thì id nhỏ nhất) + số file + mốc "có" trên mọi
  dòng trong khoảng; `s` = dòng đại diện + nhóm phân loại. Một lần `GROUP BY`, không window function. Bộ lọc bưu cục áp ở mức dòng (mỗi BCVH
  đếm hàng đến chính nó); `ward_key` áp trên dòng đại diện.
- **`s` chỉ vật chất hoá (MATERIALIZED) cho `/summary`** (đọc lại nhiều lần trong 1 câu lệnh); endpoint khác để SQLite gộp thẳng (nhanh hơn ~30% ở khoảng năm).
- **Tổng phường/xã của địa bàn** (`dia_ban_phat.tong`) = số tên `post_offices.new_ward_name` khác nhau (chuẩn hoá) trong danh mục (= 40 với
  danh mục hiện tại); `co` = số phường/xã trong danh mục đó có sản lượng ≥ 1 (phường/xã không có trong danh mục không được tính vào `co`).
- **Túi/kiện** = số `bd8_no` khác rỗng, khác nhau trên các dòng trong khoảng của các SHBG đã đếm.
- **Cảnh báo (ADMIN)**: chưa xác định ngày đến = SHBG mà mọi dòng trong các file có ngày file thuộc khoảng đều không có mốc; mốc BD10 sớm =
  dòng đại diện có `arrival_at_basis = bd10` và ngày đến < ngày file; đến lại trong khoảng = SHBG có dòng trong khoảng ở ≥ 2 file.
- **`/by-time?granularity=hour`** chỉ cho khoảng ≤ 7 ngày (theo ngày lịch). Sản lượng mỗi mốc = số SHBG có lần đến sớm nhất trong khoảng rơi vào mốc đó.
- **Hiệu năng** (1,05 triệu dòng giả, 1 BCVH): 1 tuần ≤ 0,13 s; 1 tháng 0,26–0,48 s; 1 quý 0,85–1,8 s; 1 năm 3,7–7,8 s (`/summary` ADMIN chậm nhất).
  **Đề xuất cho khoảng dài (cần PO duyệt, đổi schema)**: bảng tổng hợp theo ngày (ngày × bưu cục × phường/xã × tỉnh × tổ hợp mốc), ~33–50 nghìn
  dòng/năm/BCVH ≈ 3–5 MB/năm cho mỗi tiêu chí ngày, cập nhật khi nạp file; khoảng > 1 quý đọc từ bảng này (bưu gửi đến lại ở nhiều ngày sẽ bị
  đếm mỗi ngày — trên mẫu 41/12 786 = 0,3%, cần ghi chú "≈"); hoặc bảng 1 dòng/SHBG/ngày (~1 triệu dòng, ~150–200 MB/năm) cho kết quả chính xác.

### 36. "Đường thư" thay cho "Tuyến thư" (PO, 08/10/2026)
"Tuyến thư" đổi tên thành "Đường thư" trong mọi chữ hiển thị/tài liệu (cột dữ liệu gốc vẫn là `Ten_duong_thu`, trong DB là `route_name`).

### 37. Hàng nặng (PO, 08/10/2026) **[ĐÃ BỊ THAY bởi #76 (DASH-6b): bỏ khái niệm và ngưỡng «hàng nặng»; thay bằng «hàng đi ngoài».]**
Hàng nặng = bưu gửi có khối lượng lớn hơn 2,5 kg (> 2.500 g; đúng 2.500 g chưa tính là nặng). Khối lượng của bưu gửi lấy theo đúng định
nghĩa đang dùng ở `/summary` của 3b (một giá trị cho mỗi bưu gửi; báo cáo 3b ghi không có SHBG nào lệch khối lượng giữa các dòng).
Khối lượng rỗng/0 không tính là nặng.

### 38. Hàng nặng là chỉ số phụ (PO, 08/10/2026) **[Nay áp cho «hàng đi ngoài» — #76.]**
Hàng nặng nằm trong sản lượng đến, không tách ra khỏi sản lượng. Chỉ là chỉ số phụ: số bưu gửi nặng và tỷ lệ trên sản lượng của nhóm.

### 39. Quy tắc đếm cho đường thư / dịch vụ (PO, 08/10/2026)
Mọi con số dùng đúng quy tắc "Sản lượng đến" của 3b (mỗi bưu gửi 1 lần tại lần đến sớm nhất trong khoảng lọc; không loại dòng nào).
Tên đường thư/dịch vụ/khối lượng lấy từ dòng đại diện của bưu gửi (cùng dòng dùng cho phường/xã ở 3b).

### 40. Thiết kế "Hàng đến theo đường thư và dịch vụ" (SANLUONG-3d, Claude Code tự chọn)
- **Tái dùng lõi 3b** (`buildCountedCte`): chỉ thêm cột `route_name` vào dòng đại diện `s`; không có logic đếm thứ hai.
- `/by-route`, `/by-service`: mỗi endpoint **1 truy vấn** `GROUP BY (nhóm, giờ trong ngày)` trên `s`, cộng dồn trong JS → sản lượng, hàng nặng,
  khối lượng, giờ nhiều nhất.
- **Khoá nhóm**: đường thư = `route_name` (rỗng/chỉ khoảng trắng → nhóm riêng "Chưa có tên đường thư"); dịch vụ = `service_code` + `service_name`
  (cả hai rỗng → nhóm riêng "Chưa có tên dịch vụ"; tên rỗng nhưng có mã → hiển thị mã). Nhóm riêng trả ở trường `chua_co_ten`, không nằm trong `items`;
  tổng `items` + `chua_co_ten` = sản lượng.
- **`gio_nhieu_nhat`** = giờ (0–23) của **thời điểm theo tiêu chí ngày đang lọc** của dòng đại diện (với tiêu chí mặc định là thời điểm đến BCVH);
  hoà → giờ sớm hơn.
- **Ngưỡng**: hằng số `HEAVY_THRESHOLD_G_DEFAULT = 2500` (`server/lib/arrivalsQuery.js`); tham số `heavy_g` 500–30000 cho `/summary`, `/by-route`,
  `/by-service` (endpoint khác không nhận → 400). ADMIN sửa ngưỡng trên giao diện cần bảng cấu hình — ticket sau.
- **`khoi_luong_tb_g`** = tổng khối lượng (rỗng tính 0) / sản lượng của nhóm, làm tròn gam. Tỷ lệ % làm tròn 2 chữ số.
- **Hiệu năng** (~1 triệu dòng giả): 1 tuần ≤ 0,11 s; 1 tháng 0,28–0,36 s; 1 năm 4,0–4,5 s.

## Dashboard điều hành (SANLUONG-3e)

### 41. 6 BCVH của Trung tâm (PO, 08–09/10/2026)
6 BCVH (mã — tên): 533140 BCVH Thuận Hóa; 535470 BCVH Hương Trà; 536250 BCVH Hương Thủy; 537015 BCVH Thuận An; 537220 BCVH Phú Lộc;
535790 BCVH A Lưới. Hiện chỉ 533140 có dữ liệu; các BCVH còn lại sẽ có khi nối SFTP. API phải trả đủ 6 BCVH; BCVH chưa có dữ liệu trả số 0
và cờ `co_du_lieu: false` (không lỗi). Danh sách đặt thành hằng số có tên; tên lấy từ `post_offices` nếu khớp mã, không khớp thì dùng tên trên.
**Cách đã chọn (Claude Code)**: hằng số `DASHBOARD_BCVH` (`server/lib/dashboardQuery.js`). `co_du_lieu` = có ít nhất 1 file đã nạp (`status = 'OK'`)
với `unit_code` = mã BCVH (file EMPTY không tính là có dữ liệu). Con số của từng BCVH lọc theo `receiver_code` (BC nhận) = mã BCVH.

### 42. "Bình thường" của một BCVH (PO, 08–09/10/2026) **[ĐÃ BỊ BỎ bởi #76 (DASH-6b): không còn «TB 4 tuần» / «mức bình thường» làm mốc so sánh; API 3e đã xoá.]**
"Bình thường" = trung bình sản lượng đến của tối đa 4 ngày cùng thứ gần nhất trước ngày xét, cùng khoảng giờ (00:00 đến mốc `as_of`).
Dữ liệu lịch sử dự kiến ~30 ngày. Không ẩn khi dữ liệu ngắn: tính trên số tuần đang có, trả `so_tuan` (0–4) kèm `it_du_lieu: true` khi `so_tuan < 4`;
`so_tuan = 0` thì không có so sánh (null).
**Cách đã chọn**: ứng viên là đúng 4 ngày `date − 7, −14, −21, −28` (không lùi xa hơn để bù ngày thiếu). Một ứng viên được tính là "có tuần" của
BCVH khi BCVH đó có ≥ 1 file `OK` với `file_date` = ngày đó (không dựa vào sản lượng > 0, để ngày thật sự vắng hàng vẫn tính 0 còn ngày chưa nạp
file thì bị bỏ qua). Trung bình = tổng sản lượng các tuần có / `so_tuan`. Phần trăm lệch = (hôm nay − bình thường) / bình thường × 100, so sánh ngưỡng
bằng phép nhân số nguyên (không sai số làm tròn). `/trend` và `/wards-surge` dùng cùng cách chọn tuần (`/trend`: ngày có file của bất kỳ BCVH nào).
Dòng "tổng" chỉ so sánh trên các BCVH có `so_tuan > 0`; `so_tuan` của dòng tổng = nhỏ nhất trong các BCVH có dữ liệu.

### 43. "Đủ trạng thái (SHBG, BD8, BD10)" (PO, 08–09/10/2026)
"Đủ trạng thái (SHBG, BD8, BD10)" là tên mới của "đủ cả 3 mốc" (đủ XN bưu gửi, XN túi, XND BD10). Chỉ đổi tên hiển thị/tài liệu và tên trường API
(`du_trang_thai`); không đổi cách tính (= tổ hợp `111` của #33).

### 44. "Không XNĐ BD10" (PO, 08–09/10/2026)
"Không XNĐ BD10" = số bưu gửi (SHBG) mà cột `Ngay_gio_XND_BD10` trống, theo quy tắc "mốc có" của #33 (một SHBG tính là có mốc nếu bất kỳ dòng nào của
nó trong khoảng lọc có giá trị). Đếm số SHBG khác nhau, không đếm dòng. Khối `tong_hop` của `/quality-mocs`: `du_trang_thai`, `co_xn_tui`, `co_xnd_bd10`,
`khong_xnd_bd10`, `co_xn_bg` (số và %, mẫu số = sản lượng đến); kiểm: `co_xnd_bd10 + khong_xnd_bd10 = sản lượng`.

### 45. Điểm cần điều hành và ngưỡng (PO, 08–09/10/2026) **[API 3e đã xoá ở #76; ngưỡng 15% / 25% nay áp cho Dashboard DASH-1 theo mốc tuần trước; loại việc «hàng nặng» đã bỏ.]**
Hệ thống tự tính từ MỘT đối tượng cấu hình `DASHBOARD_THRESHOLDS` (ADMIN chỉnh được ở ticket sau — cần bảng cấu hình; ticket 3e không làm giao diện/lưu cấu hình):
- Sản lượng hôm nay lệch so với "bình thường": từ 15% là `trong_ngay`, từ 25% là `xu_ly_ngay`; lệch âm → `san_luong_thap`, dương → `san_luong_cao`.
- Hàng nặng (khối lượng > `heavy_g`, mặc định 2.500 g, #37): từ 7% sản lượng của BCVH → `hang_nang`, mức `trong_ngay`. **[Đã sửa định nghĩa ở #48 — nay so với tỷ lệ bình thường, tính bằng điểm %.]**
- Hàng đến sau 15:00: từ 35% sản lượng của BCVH tính tới `as_of` → `den_muon`, mức `trong_ngay`; `as_of` trước 15:00 thì không đánh giá (null).
- Xác nhận chậm: trung vị khoảng XN túi → XN bưu gửi (phút) của các bưu gửi đến hôm nay có đủ hai mốc ≥ 75 phút → `xac_nhan_cham`, mức `trong_ngay`.
  Ngưỡng và định nghĩa này là TẠM — PO xem lại sau khi chạy dữ liệu thật ~2 tuần; phải dễ đổi.
- Điểm cần điều hành dành cho lãnh đạo (MANAGER + ADMIN), KHÁC cảnh báo dữ liệu ADMIN-only của #34 (thiếu đợt, ngoại lệ, mốc BD10 sớm, file bị từ chối) — không trộn.
**Cách đã chọn**: mọi so sánh dùng "≥" (đúng ngưỡng là có điểm). `as_of` ≥ 15:00 mới đánh giá "đến muộn"; "đến sau 15:00" = thời điểm đến ≥ 15:00:00 của ngày xét.
Khoảng XN túi → XN bưu gửi của một SHBG = (giờ XN bưu gửi sớm nhất) − (giờ XN túi sớm nhất) trên các dòng của SHBG trong khoảng 00:00 → `as_of` của ngày xét; chỉ
tính SHBG có cả hai mốc (quy tắc "mốc có" của #33); không loại khoảng âm (mẫu: 14/11.372 SHBG có khoảng âm); trung vị chẵn = trung bình hai giá trị giữa.
Ban đầu không đặt sản lượng tối thiểu cho điểm lệch; đã bổ sung ở #48.
Sắp xếp `issues`: mức (`xu_ly_ngay` trước) → `do_lech` giảm dần → mã BCVH. `do_lech` = giá trị vượt / ngưỡng `trong_ngay` (lệch% / 15; tỷ lệ% / ngưỡng%; phút / 75) — để so được các loại với nhau.

### 46. Quyền Dashboard (PO, 08–09/10/2026)
MANAGER + ADMIN xem; STAFF 403; không token 401 (như các API "Hàng đến" khác). Phân quyền TTVH/GĐVH làm ở SANLUONG-3c.

### 47. Thiết kế Dashboard điều hành (SANLUONG-3e, Claude Code tự chọn)
- **Không có logic đếm thứ hai**: `server/lib/dashboardQuery.js` gọi `buildCountedCte()` (3b) cho từng cửa sổ [ngày 00:00, mốc]; mỗi ngày là một khoảng riêng
  (quy tắc 3b áp riêng từng khoảng — bưu gửi đến lại đếm 1 lần ở mỗi ngày nó có mặt). Chỉ thêm tuỳ chọn `withMocTimes` (cột `bag_at`, `item_at` vào `s`) và hàm
  `parseHeavyG` dùng chung; các endpoint 3b/3d không đổi.
- **Cửa sổ giờ**: `to = as_of:00` (gồm cả 2 đầu, giống tham số `to=YYYY-MM-DD HH:MM` của 3b); `as_of = 23:59` = hết ngày. Mọi ngày so sánh (hôm qua, 4 ngày
  cùng thứ) dùng cùng `HH:MM` của `as_of`.
- **Đếm theo BCVH**: một lần đếm cho cả 6 BCVH (bộ lọc `receiver_code` = 6 mã), nhóm theo BC nhận của dòng đại diện → tổng 6 BCVH = đúng số SHBG khác nhau của 6 BCVH;
  một SHBG hiếm hoi có mặt ở 2 BCVH trong cùng cửa sổ chỉ tính 1 lần, ở BCVH có lần đến sớm nhất.
- **`date` mặc định** = `file_date` lớn nhất của file `OK` thuộc 6 BCVH; **`as_of` mặc định** = `file_time` lớn nhất của các file đó trong `date`, cắt giây (09:30:12 → 09:30;
  trả `as_of_nguon` = `file_nap_moi_nhat` | `tham_so` | `cuoi_ngay` khi `date` không có file → 23:59). `ngay_cap_nhat` = `imported_at` lớn nhất của file `OK` (UTC, ISO `...Z`).
  Chưa có file nào: 200, `date: null`, 6 BCVH số 0, `issues` rỗng.
- **`/trend`**: 8 ngày (`date − 7` … `date`), mỗi ngày một cửa sổ (ngày xét tới `as_of`, ngày khác cả ngày); `theo_gio` 06–17: `hom_nay` null cho giờ sau `as_of`; giờ chứa `as_of`
  (`chua_het_gio`) so sánh tới `as_of` ở cả hôm nay lẫn các tuần; giờ sau đó `tb_4_tuan` là cả giờ (để vẽ đường "bình thường").
- **`/wards-surge`**: theo cặp (BCVH, phường/xã Huế — nhóm `HOME` của 3b); bình thường = tổng số trên các tuần có file của BCVH đó / `so_tuan` (tuần vắng phường/xã đó = 0);
  chỉ phường/xã tăng (> bình thường), hôm nay ≥ 30 và bình thường ≥ 20 (hằng số `WARD_SURGE`, so sánh gồm biên); xếp theo % tăng, hoà → hôm nay lớn hơn; tối đa 5.
- **`/center`**: `date` (mặc định như trên), `from`/`to` (mặc định 7 ngày kết thúc ở `date`, gồm cả ngày `to`; chỉ có `to` → `from` = `to` − 6 ngày), `heavy_g`. Một khoảng
  duy nhất (không phải theo ngày). Đường thư xếp hạng theo (BCVH, tên đường thư); bưu gửi chưa có tên gom thành MỘT nhóm chung của Trung tâm (không gắn BCVH). `duong_thu` =
  { `top` (5), `con_lai` (đường thư có tên ngoài top), `chua_co_ten` (+ `trong_top`) }: top + còn lại + (chưa có tên nếu `trong_top = false`) = `san_luong`. Dịch vụ lấy nguyên kết quả `byService`
  của 3d. Chất lượng = `qualityMocs` của 3b (7 tổ hợp + `tong_hop`). Hai tên đường thư gần giống vẫn là hai đường riêng (không tự gộp).
- **Hiệu năng** (1.000.008 dòng giả, 3 BCVH × 38 ngày, 2026-10-09): `/overview` ~0,65 s; `/trend` 1,1–1,2 s (11 cửa sổ); `/wards-surge` ~0,58 s; `/center` 7 ngày ~0,98 s,
  30 ngày ~4,9 s. `/center` gom đường thư + dịch vụ + tổ hợp mốc vào MỘT lần chạy CTE (bản hẹp vật chất hoá) — gọi 3 hàm riêng mất 1,9–2,1 s. Khoảng dài vẫn cần bảng tổng hợp (#35).
- **Tham số**: khoá lạ → 400; `heavy_g` chỉ ở `/overview` và `/center`. API không sinh câu chữ tiếng Việt (chỉ mã `loai`, `muc`, `don_vi`); giao diện tự ghép câu.

### 48. Sửa định nghĩa điểm "hàng nặng" + sản lượng tối thiểu (PO, 09/10/2026; sửa #45 sau khi xem số liệu mẫu) **[ĐÃ BỊ BỎ bởi #76 (DASH-6b); sàn 50 SHBG nay áp cho mốc tuần trước của Dashboard DASH-1.]**
PO sửa định nghĩa (không phải lựa chọn của Claude Code):
1. Điểm `hang_nang` = (tỷ lệ hàng nặng hôm nay) − (tỷ lệ hàng nặng bình thường) ≥ **7 điểm %**, thay cho "tỷ lệ hàng nặng ≥ 7% sản lượng". "Bình thường" = các ngày cùng thứ
   (tối đa 4, cùng khung giờ 00:00 → `as_of`, như #42). `so_tuan = 0` thì không phát sinh điểm này. Ngưỡng 7 vẫn nằm trong `DASHBOARD_THRESHOLDS` (khoá `hang_nang.trong_ngay_diem_pct`).
2. Thêm `DASHBOARD_THRESHOLDS.san_luong_toi_thieu.tb_4_tuan` (mặc định **50 SHBG**, TẠM): BCVH có sản lượng bình thường (`tb_4_tuan`) dưới mức này thì không phát sinh điểm
   lệch sản lượng (`san_luong_thap`/`san_luong_cao`) và `hang_nang`. Trường `nguong` của `/overview` có echo ngưỡng này như các ngưỡng khác.
**Cách đã chọn (Claude Code)**: tỷ lệ bình thường = **gộp** hàng nặng của các tuần có / sản lượng của các tuần đó (trọng số theo sản lượng, không lấy trung bình cộng các tỷ lệ
từng ngày). So sánh bằng phép nhân số nguyên `(a·d − c·b)·100 ≥ 7·b·d` (a/b hôm nay, c/d bình thường), "≥" gồm biên. Mức tối thiểu so `tổng tuần ≥ 50 × so_tuan` (tb đúng 50 vẫn được xét; 49,75 thì không).
Điểm `hang_nang` trong `issues` nay có `gia_tri` = chênh lệch (điểm %), `so_sanh` = ngưỡng (7), `don_vi = 'diem_pct'`, kèm `ty_le_hom_nay`, `ty_le_binh_thuong`, `so_luong`, `so_tuan`, `it_du_lieu`.
Dòng BCVH trong `/overview` thêm `hang_nang.ty_le_binh_thuong` (null khi `so_tuan = 0`); dòng tổng gộp trên các BCVH có tuần.

### 49. Bốn vai trò có tên + ma trận quyền (PO, 09/10/2026 — SANLUONG-3c-2; thay mô hình "STAFF / khác STAFF")
Quyết định của PO (ghi nguyên):
1. Vai trò hợp lệ (chuỗi ASCII, chữ hoa): `ADMIN`, `TTVH`, `GDVH`, `STAFF`. Không còn `MANAGER`.
   - `ADMIN`: toàn quyền; duy nhất tạo/sửa/khoá/mở khoá tài khoản, đổi vai trò, đặt lại mật khẩu người khác, gán BCVH; xem cảnh báo, ngoại lệ, kết quả nạp; sửa mạng lưới và widget Dashboard.
   - `TTVH`: xem toàn bộ dữ liệu "Hàng đến" và Dashboard điều hành của 6 BCVH (xuất file mọi BCVH làm ở 3c-3). Không quản lý tài khoản, không sửa mạng lưới.
   - `GDVH`: xem toàn bộ 6 BCVH như TTVH (kể cả tra từng bưu gửi); chỉ **xuất file** bị giới hạn ở BCVH được giao (3c-3). Không quản lý tài khoản.
   - `STAFF`: giữ nguyên (chỉ xem Dashboard cũ; không vào `/api/arrivals/*`, `/api/users*`, `/api/network` trừ phần đang mở cho mọi vai trò).
2. Chuyển đổi: `ADMIN`→`ADMIN`, `MANAGER`→`TTVH`, `STAFF`→`STAFF`. Đổi một lần, không để tên cũ song song (`scripts/migrate-roles.js`, `06_DEPLOYMENT.md` mục 7).
3. Gán BCVH: bảng quan hệ nhiều-nhiều `user_bcvh`, hiện gán 1 BCVH cho mỗi GDVH; một BCVH có thể có nhiều GDVH (#51).
4. Giới hạn của GDVH chỉ áp ở xuất file, KHÔNG hạn chế dữ liệu xem (`/arrivals/items`, `/arrivals/lookup` giữ như cũ cho mọi vai trò được xem) (#52).
**Cách cài (Claude Code)**: `server/roles.js` là nơi duy nhất định nghĩa vai trò; `requireRoles(...)` với danh sách tường minh thay `requireManager` (đã xoá); `requireAdmin` giữ làm lớp bọc cho ADMIN.
Ma trận route × vai trò: `03_ARCHITECTURE_MAP.md` mục 3. Quyết định #34 (cảnh báo dữ liệu chỉ ADMIN) giữ nguyên, nay áp cho cả TTVH/GDVH; các quyết định cũ nhắc "MANAGER + ADMIN" (#21, #25, #34, #44, #46…) đọc là ADMIN + TTVH + GDVH.
**[Đã bị thay thế bởi #95 về quyền đọc «Quản lý mạng lưới» (nay chỉ ADMIN).]**

### 50. Quyền có hiệu lực ngay: tra DB mỗi request (CTO chọn mặc định — PO có thể đổi sau)
`authRequired` đọc `role` + `deactivated_at` từ `users` theo `id` trong token ở MỌI request (một câu lệnh chuẩn bị sẵn; `req.authChecked` tránh tra hai lần khi route gắn thêm `authRequired`).
Tài khoản bị khoá hoặc không còn → **401**; vai trò ngoài danh sách hợp lệ (vd `MANAGER` chưa chuyển đổi) → **403**, không coi là quản lý. `req.user.role` lấy từ DB, token giữ nguyên cấu trúc, không bắt đăng nhập lại.
Hệ quả: đổi vai trò / khoá tài khoản có hiệu lực ngay với token cũ. Giao diện vẫn đọc vai trò từ payload token để ẩn/hiện menu nên menu chỉ cập nhật khi đăng nhập lại (chỉ ảnh hưởng hiển thị, không ảnh hưởng quyền thật).

### 51. Bảng `user_bcvh` và API gán BCVH (PO, 09/10/2026)
`user_bcvh(user_id, bcvh_code, created_at)`, PK `(user_id, bcvh_code)`, `user_id` → `users(id)`; tạo idempotent trong `server/db.js` (`ensureUserBcvhSchema`).
`GET /api/users/:id/bcvh` và `PUT /api/users/:id/bcvh` (body `{ "codes": ["533140"] }`, thay toàn bộ tập), chỉ ADMIN. Mã phải thuộc `DASHBOARD_BCVH` (sai → 400); chỉ gán cho tài khoản vai trò `GDVH` (khác → 400);
`codes` rỗng hợp lệ; không giới hạn cứng số BCVH. Đổi một GDVH sang vai trò khác thì xoá các dòng gán (cùng transaction với việc đổi vai trò). `getAssignedBcvh(userId)` (`server/lib/userBcvh.js`) dùng chung cho 3c-3.
**Cách đã chọn (Claude Code)**: mã trùng trong `codes` được gộp; kết quả sắp tăng dần; khoá GDVH không xoá dòng gán (mở khoá là dùng lại); `GET` của tài khoản không phải GDVH trả `codes: []` (200).

### 52. Giới hạn BCVH của GDVH chỉ áp ở xuất file (PO, 09/10/2026)
`/api/arrivals/*` (kể cả `/items`, `/lookup`) trả đủ 6 BCVH cho cả ADMIN, TTVH, GDVH — không lọc theo `user_bcvh`. Ticket 3c-3 (xuất file) mới dùng `getAssignedBcvh` để giới hạn GDVH. **[#72: áp dụng lại cho cả "chưa nhận tại BCVH" và "BD10 đến" — hai chỉ số này từng bị giới hạn ở #60 / #67, nay xem đủ như mọi số khác.]**

### 53. Mặc định do CTO chọn (PO có thể đổi sau — SANLUONG-3c-2)
(a) Mạng lưới: đọc (`GET /api/network`, `/network/export-data`) cho ADMIN/TTVH/GDVH; ghi/nhập/xoá chỉ ADMIN. (b) Quyền có hiệu lực ngay (#50). (c) Phải còn ít nhất 1 ADMIN hoạt động (#54).
(d) Tạo ADMIN đầu tiên khi triển khai sạch: để ticket triển khai NAS sau. (e) `/api/organization/*` và `/api/dashboard/stats` giữ nguyên (mọi người đã đăng nhập) — ghi vào backlog để PO xem lại.
Hệ quả (Claude Code): `GET /api/users/search` (gợi ý người phụ trách) nằm trong `/api/users*` nên chỉ ADMIN — khớp việc chỉ ADMIN sửa người phụ trách bưu cục.
**[Đã bị thay thế bởi #95 về quyền đọc mạng lưới, mục (a) (nay chỉ ADMIN).]**

### 54. ADMIN hoạt động cuối cùng + chi tiết kiểm tra role (Claude Code tự chọn, theo mặc định (c) của #53)
Hạ vai trò hoặc khoá **ADMIN hoạt động cuối cùng** → 400 (`server/lib/adminGuard.js`). Vì người gọi luôn là ADMIN hoạt động (tra DB) và đã bị chặn tự đổi vai trò / tự khoá, lớp này là phòng thủ chiều sâu (qua API hiện chưa tới được; kiểm thử trực tiếp hàm).
`POST /api/users`: không gửi `role` → `STAFF` (quyền thấp nhất, như trước); có gửi thì phải đúng 1 trong 4 giá trị (so khớp chính xác sau `trim`, không tự đổi hoa/thường) — sai → 400. `PUT /api/users/:id`: `role` có gửi mà không hợp lệ → 400 (trước đây giá trị rỗng bị bỏ qua).

### 55. Xuất file = dữ liệu thô của MỘT BCVH, 9 cột (PO, 09/10/2026 — SANLUONG-3c-3)
Quyết định của PO (ghi nguyên):
1. Xuất file là **dữ liệu thô chưa lọc** của một BCVH: mọi dòng của BCVH đó trong khoảng ngày đã chọn, không gộp theo bưu gửi, không loại dòng nào (kể cả hàng chuyển hoàn, tỉnh khác). File chỉ có **9 cột** (thay cho "toàn bộ cột CSV gốc"). Không xuất nhiều BCVH trong một file.
2. Các cột mã số hiệu (SHBG, BD8, BD10, mã bưu cục…) phải là **văn bản** trong Excel, không bao giờ bị đổi thành số/ký hiệu khoa học và không mất chữ số 0 đầu.
3. **Tất cả 9 cột, kể cả tiêu đề, là văn bản**: mọi ô đặt kiểu chuỗi (`numFmt '@'`, giá trị là chuỗi), không có ô số, không có ô ngày giờ của Excel. Tiêu đề không dấu. Ô rỗng để trống thật (không ghi "null", không ghi 0).
4. Cột thời gian ghi thành chuỗi `dd/MM/yyyy HH:mm:ss` (vd `08/10/2026 15:05:09`), cùng một định dạng cho cả ba cột, không dùng kiểu Mỹ của CSV gốc. (Mặc định do CTO chọn cho người dùng Việt Nam; PO có thể đổi.)

Bảng ánh xạ (tiêu đề trong file → cột `arrival_items`; đối chiếu `server/lib/arrivalsImport.js` `COLUMNS`):
| # | Tiêu đề | Cột DB | | # | Tiêu đề | Cột DB |
|---|---|---|---|---|---|---|
| 1 | `BC_nhan_BG` | `receiver_code` | | 6 | `Thoi_gian_XN_BG` | `item_confirmed_at` |
| 2 | `Ten_duong_thu` | `route_name` | | 7 | `Thoi_gian_XN_tui` | `bag_confirmed_at` |
| 3 | `SHBG` | `tracking_no` | | 8 | `Ngay_gio_XND_BD10` | `bd10_confirmed_at` |
| 4 | `So_hieu_BD8` | `bd8_no` | | 9 | `Dich_vu_code` | `service_code` |
| 5 | `So_hieu_BD10` | `bd10_no` | | | | |
Không dùng `bd10_ttkt_confirmed_at`. Đủ nguồn cho cả 9 cột — không phải hỏi PO.

### 56. Tham số, giới hạn và nhật ký xuất file (CTO chọn mặc định — PO có thể đổi sau)
(a) Khoảng ngày bắt buộc, **tối đa 92 ngày** một lần (chỉ nhận `YYYY-MM-DD`, không nhận giờ). (b) Tối đa **1.000.000 dòng dữ liệu** một file (Excel giới hạn 1.048.576 dòng); đếm trước khi ghi, vượt → 400 nêu số dòng và gợi ý thu hẹp khoảng ngày. Ngưỡng nằm ở `EXPORT_MAX_ROWS_DEFAULT` (`server/lib/arrivalsExport.js`); biến môi trường `ARRIVALS_EXPORT_MAX_ROWS` ghi đè (test dùng ngưỡng nhỏ).
(c) Mỗi lần xuất ghi 1 dòng JSON vào `security.log`: `event: arrivals_export`, ai (`user_id`, `hrm_code`, `role`), `ip`, `receiver_code`, `from`, `to`, `date_basis`, `rows`, `status` (`ok` | `aborted` khi client ngắt | `error`). KHÔNG ghi dữ liệu bưu gửi. Lần bị từ chối (400/403) không ghi.
(d) Xuất ở **server**, dạng luồng: `ExcelJS.stream.xlsx.WorkbookWriter` ghi thẳng vào response, đọc DB theo từng lô 2.000 dòng, duyệt từng ngày rồi theo `id` (đi qua chỉ mục `(receiver_code, <ngày>)`, không cần sắp xếp) → bộ nhớ không tăng theo số dòng; NAS RAM nhỏ. Thứ tự dòng trong file: ngày theo `date_basis` rồi `id` (thứ tự nạp).
Chi tiết kỹ thuật: dòng tiêu đề đi qua API ExcelJS, còn dòng dữ liệu được ghi thẳng XML vào luồng sheet (API dòng/ô của ExcelJS tốn ~30 µs/dòng, 1 tháng mất 13,7 s so với 3,4 s) và có chờ khi bộ đệm nén/gửi vượt 2 MB (luồng sheet của ExcelJS không tự báo áp lực ngược; thiếu bước chờ thì RSS tăng theo số dòng). Phụ thuộc chi tiết nội bộ `exceljs@4.4.0` (`ws.stream`, `wb.styles`) — nếu nâng cấp `exceljs`, chạy lại `tests/arrivals-export.test.js`. Ô chuỗi do ExcelJS (chế độ luồng, không dùng chuỗi dùng chung vì tốn RAM) ghi dạng `t="str"` + `numFmt '@'`. Ký tự không hợp lệ trong XML 1.0 (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F, 0xFFFE, 0xFFFF) bị **xoá hẳn** (không thay bằng khoảng trắng, để không làm lệch mã số hiệu; tab/xuống dòng/0x7F hợp lệ nên giữ); `& < > " '` được thoát (`&amp; &lt; &gt; &quot; &apos;`); ô dài hơn 32.767 ký tự bị cắt. Chưa mở thử bằng Excel thật — PO nên mở một file mẫu để xác nhận không có cảnh báo.

### 57. Quyền xuất file (PO, 09/10/2026 — SANLUONG-3c-3; cài #52)
`ADMIN`, `TTVH` xuất BCVH bất kỳ trong 6 BCVH (`DASHBOARD_BCVH`); `GDVH` chỉ BCVH được giao (`user_bcvh`, qua `getAssignedBcvh`) — BCVH khác hoặc chưa được giao BCVH nào → 403; `STAFF` 403; không token 401. `GET /api/arrivals/export-scope` trả `{ bcvh: [{ ma, ten }] }` các BCVH người gọi được xuất (tên lấy như `/dashboard/overview`; GDVH chưa được giao → `[]`). Thứ tự kiểm `/export`: `receiver_code` (400) → quyền (403) → khoảng ngày (400) → ngưỡng số dòng (400).

### 58. Việc ngoài phạm vi 3c-3 (ghi để khỏi quên)
Nút xuất trên giao diện (ticket Antigravity); xuất theo bộ lọc hoặc định dạng khác nếu PO cần; giới hạn số lần xuất đồng thời (hiện không giới hạn — xuất ~1 triệu dòng chiếm 1 kết nối DB đồng bộ theo từng lô, nhường vòng lặp sự kiện giữa các lô).

### 59. Quy tắc ngày đến R2 (PO, 10/10/2026 — SANLUONG-3g; thay quy tắc "mốc sớm nhất" của #13/#28)
`arrival_at` của MỘT dòng = mốc **đầu tiên không trống** theo thứ tự **XN túi → XN bưu gửi → XNĐ BD10** (`arrival_at_basis` = `bag` | `item` | `bd10`). Ba mốc đều trống → NULL (chưa có ngày đến). KHÔNG dùng `bd10_ttkt_confirmed_at` làm ngày đến. Lý do nghiệp vụ: XN túi là lúc túi được xác nhận tại BCVH; XNĐ BD10 sớm bất thường không được thắng túi.
Cách đếm KHÔNG đổi: mỗi bưu gửi (SHBG) đếm một lần tại dòng có `arrival_at` sớm nhất TRONG khoảng lọc (`buildCountedCte`). Cài ở `deriveArrival()` (`server/lib/arrivalsImport.js`, dùng chung với importer và `scripts/rederive-arrival.js`).
Dữ liệu đã nạp tính lại bằng `scripts/rederive-arrival.js` (chạy thử mặc định; `--apply` ghi trong một transaction, chạy lặp lại được; PO sao lưu DB trước — `06_DEPLOYMENT.md` mục 8). Trên bản chép DB thật (13.102 dòng): đổi 110 dòng (7 đổi ngày muộn đi, 103 cùng ngày chỉ đổi giờ/mốc căn cứ: bd10→bag 94, item→bag 14, bd10→item 2); sản lượng 02→08/10 vẫn **12.783**, 03→09/10 **12.783**, 01/09→31/10 **12.786**; `moc_bd10_som` 3 → 0. Số dòng đổi ngày (cũ → mới): 30/09→05/10: 2; 02/10→04/10: 1; 01/10→05/10: 1; 02/10→06/10: 1; 04/10→07/10: 1; 04/10→08/10: 1.

### 60. Bưu gửi "đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" (PO, 10/10/2026 — SANLUONG-3g; thay "62 bưu gửi chưa xác định ngày đến")
**[Định nghĩa đã được #68 thu hẹp: loại bưu gửi mà BD10 của dòng đại diện là BD10 rỗng hoặc BD10 lập đi.]**
Phương án A: các bưu gửi này KHÔNG tính vào sản lượng đến; báo riêng cho **mọi tài khoản xem được "Sản lượng đến"** (ADMIN, TTVH, GDVH; STAFF không có menu) — không còn là cảnh báo ADMIN-only. Khi một file sau bổ sung mốc BCVH cho bưu gửi, nó tự rời nhóm và vào sản lượng theo ngày thật.
- Định nghĩa: không có mốc túi/bưu gửi/BD10 ở BẤT KỲ dòng nào trong các file có ngày file thuộc khoảng lọc, và có `bd10_ttkt_confirmed_at` không trống (theo `tracking_no`). `bd10_ttkt_confirmed_at` là thời điểm bên gửi duyệt đóng chuyến thư, KHÔNG phải lúc hàng đến BCVH. Một truy vấn dùng chung (`undatedSql` + `ttkt_at IS NOT NULL` trong `server/lib/arrivalsQuery.js`) cho summary, `/dashboard/center`, `/not-received`, `/exceptions`.
- API: `GET /api/arrivals/summary` và `GET /api/arrivals/dashboard/center` có `chua_nhan_tai_bcvh = { tong, cu_nhat_ngay, theo_tuoi: { '0-1', '2', '3+' }, theo_ngay_lap: [{ ngay, so_buu_gui, tuoi }] }` (cũ nhất trước). `GET /api/arrivals/not-received` (phân trang như `/items`, cũ nhất trước): SHBG, BD8, BD10, đường thư, `thoi_diem_lap_bd10`, `tuoi_ngay`. `GET /api/arrivals/not-received/export?receiver_code=&from=&to=`: xlsx cùng cơ chế, quyền, giới hạn, nhật ký với `/export` (GDVH chỉ BCVH được giao; mọi ô là chuỗi). `/exceptions` (ADMIN) giữ lý do `CHUA_NHAN_TAI_BCVH`.
- **[ĐÃ BỎ bởi #72: mọi vai trò xem số của BCVH đang chọn; chỉ tải / xuất giới hạn theo BCVH được giao.]** ~~Phạm vi BCVH theo vai trò~~: GDVH chỉ thấy BCVH được phân công (`user_bcvh`) ở chỉ số này (giao với bộ lọc `receiver_code`; chưa được giao BCVH nào → 0, KHÔNG rơi về tất cả). ADMIN/TTVH theo bộ lọc. Lưu ý: sản lượng và các số khác của GDVH vẫn đủ 6 BCVH như #52 — chỉ riêng chỉ số này bị giới hạn theo yêu cầu của PO; PO xem lại nếu muốn thống nhất.
- `canh_bao.chua_xac_dinh_ngay_den` (ADMIN) **LỖI THỜI** — giữ để giao diện đang chạy không vỡ; = `chua_nhan_tai_bcvh.tong` + `canh_bao.khong_moc_khong_ttkt` (bưu gửi không mốc BCVH nào và cũng không có mốc lập BD10; kỳ vọng 0). Giao diện mới dùng `chua_nhan_tai_bcvh`.
- Tuổi = số ngày giữa ngày `bd10_ttkt_confirmed_at` và ngày của file mới nhất đã nạp **[#70: mốc nay là ngày file OK mới nhất của BCVH NHẬN của bưu gửi, không còn toàn DB.]** (status OK, toàn DB — không phụ thuộc khoảng lọc); bưu gửi nhiều dòng lấy mốc lập BD10 **sớm nhất** (CTO chọn). Nhóm tuổi `0-1` / `2` / `3+`.
- Trên bản chép DB thật (02→08/10): 62 bưu gửi; ngày lập 04/10: 6 (tuổi 4), 06/10: 3 (tuổi 2), 07/10: 12 (tuổi 1), 08/10: 41 (tuổi 0); `0-1`: 53, `2`: 3, `3+`: 6; cũ nhất 4 ngày; `khong_moc_khong_ttkt` = 0.

### 61. Chất lượng khai thác theo nguồn BD10 — "đủ trạng thái theo nguồn" (CTO đề xuất, PO đồng ý 10/10/2026) — **SẼ ĐƯỢC THAY bởi #67 (PO đã bác 3 nhóm ttkt/khac/khong_bd10; mã giữ nguyên trong 4a6, xoá sau khi giao diện chuyển sang chỉ số BD10)**
Quy tắc script xuất CSV của PO: `Ngay_gio_XND_BD10` luôn rỗng khi số hiệu BD10 bắt đầu `530100` (chuyến thư đi từ TTKT) — nên "Không XNĐ BD10 ≈ 75%" và "Đủ trạng thái ≈ 25%" phản ánh nguồn BD10 chứ không phải thiếu xác nhận. Hằng số **`TTKT_BD10_PREFIX = '530100'`** ở `server/lib/arrivalsQuery.js` (MỘT chỗ duy nhất; xuất ra module để module khác dùng).
Nhóm theo BD10 của **dòng đại diện** (dòng có `arrival_at` sớm nhất trong khoảng theo R2; hoà → `id` nhỏ nhất — chính là dòng mà sản lượng đếm); đủ theo nguồn xét trên CHÍNH dòng đó:

| Nhóm | Điều kiện nhóm | Đủ theo nguồn |
|---|---|---|
| `ttkt` | BD10 bắt đầu `530100` | có XN túi + XN bưu gửi |
| `khac` | có BD10, tiền tố khác | đủ 3 mốc (túi + bưu gửi + XNĐ BD10) |
| `khong_bd10` | không có số hiệu BD10 (hàng không qua chuyến thư) | có XN bưu gửi |

API: `GET /api/arrivals/quality-mocs` → `tong_hop.theo_nguon` (3 phần tử `{ nhom, ten, dieu_kien_du, so_buu_gui, du_theo_nguon, thieu, ty_le_du }`) và `tong_hop.du_trang_thai_theo_nguon = { so_buu_gui, ty_le }`; `GET /api/arrivals/dashboard/center` → `chat_luong.tong_hop` có cùng hai trường. Tổng ba nhóm = sản lượng đến. MỌI trường cũ (`du_trang_thai` = đủ 3 mốc, `khong_xnd_bd10`, `co_xnd_bd10`, `to_hop`, `ty_le_co_moc`) giữ nguyên ý nghĩa (cờ "có mốc" xét mọi dòng trong khoảng). `/meta`: `date_bases[bd10]` có `ghi_chu: "Không gồm bưu gửi trên chuyến thư từ TTKT"`, `ty_le_bi_loai` (% DÒNG không có XNĐ BD10 — đúng phần bị `date_basis=bd10` loại), `ty_le_ttkt` (% dòng BD10 tiền tố TTKT), `don_vi: 'dong'` (đếm theo dòng ≈ bưu gửi, để `/meta` không phải quét DISTINCT; nhớ theo (số dòng, id lớn nhất)). Hành vi `date_basis=bd10` không đổi.
**Bưu gửi nhiều tiền tố BD10**: trên mẫu 131 bưu gửi (khoảng 02→08/10; 133 toàn bộ) có các dòng với hơn một tiền tố 6 chữ số (kể cả "rỗng"). Nhóm theo dòng đại diện nên mỗi bưu gửi thuộc đúng MỘT nhóm; tiền tố của các dòng khác không ảnh hưởng. Số này chỉ để tham khảo (không có trong API vì tốn thêm khi tính).
Số trên bản chép DB thật (02→08/10, sau R2): `ttkt` 8.242 (đủ 7.665 = 93,0%), `khac` 3.803 (đủ 3.186 = 83,8%), `khong_bd10` 738 (đủ 738 = 100%); đủ theo nguồn tổng **11.589 = 90,66%** (so với "≈ 84,9%" kỳ vọng: số kỳ vọng tính khi nhóm `khong_bd10` chưa có quy tắc và coi bằng 0; hai nhóm còn lại khớp 7.665 và 3.186). Đủ 3 mốc theo cách cũ: 3.193 (24,98%).

### 62. Chi tiết do CTO chọn trong 3g (PO có thể đổi sau)
(a) `/exceptions` (ADMIN) có thêm tham số `ly_do` (lọc một lý do) và `page`/`page_size` (mặc định 50), trả `pagination` và `theo_ly_do` (đếm theo lý do); thứ tự lý do: `MOC_BD10_SOM`, `DEN_LAI_TRONG_KHOANG`, `CHUA_NHAN_TAI_BCVH`, `KHONG_CO_MOC` (= không mốc BCVH và không có mốc lập BD10). Không tham số → 50 dòng đầu như trước. `MOC_BD10_SOM` nay chỉ còn bưu gửi chỉ có XNĐ BD10 mà mốc sớm hơn ngày file (R2 không để BD10 thắng túi/bưu gửi).
(b) Hiệu năng (DB giả 993.600 dòng một BCVH, so xen kẽ trước/sau, lấy nhỏ nhất): `summary` ±3% (7/30/92 ngày), `by-time` ±3%, `quality-mocs` +16–19% (1 tháng 1.243 → 1.452 ms); `/center` 7 ngày ~0,5 s, 30 ngày ~2,7 s. Mức tăng của `quality-mocs` đến từ việc gắn nhóm nguồn vào khoá của dòng đại diện (không đọc thêm cột); trên bản chép DB thật (13.102 dòng) +7–10 ms.
(c) Không đổi schema. Tiền tố TTKT và nhóm nguồn tính khi truy vấn, không lưu cột.


### 63. Nạp lại dữ liệu dev từ MỘT file CSV phủ nhiều ngày: xoá + tách theo ngày + nạp bằng cơ chế hằng ngày (PO yêu cầu, CTO chọn phương án — SANLUONG-3i)
Bối cảnh: script xuất CSV của PO đã sửa — cột `Ngay_gio_XND_BD10` nay CÓ giá trị cả với BD10 tiền tố `530100` (trước đây luôn rỗng); dữ liệu dev cũ (9 file 04–08/10) mang ngữ nghĩa cũ nên xoá và nạp lại từ một file mới phủ 01–09/10 của một BCVH. Chưa có dữ liệu triển khai thật.
**Vì sao không nạp thẳng MỘT file mang ngày 09/10** (ngày file lấy từ tên file): (1) kiểm tra hợp lý `arrival_date ∈ [ngày file −3, +1]` (`arrivalsImport.js`) loại ~5/9 dòng → REJECTED cả file; (2) nếu ép nạp: chỉ số "chưa nhận" / `undatedSql` / `canh_bao` lọc theo `file_date` trong khoảng lọc nên lọc 02→08/10 loại cả file; `BD10_EARLY` báo gần như mọi bưu gửi theo BD10; Dashboard coi 01–08/10 là "không có file" (mức bình thường không tính được); "đến lại trong khoảng" (đếm file khác nhau) mất nghĩa. Sản lượng chỉ lọc theo `arrival_at` nên không sai.
**Phương án chọn (tối thiểu, không đổi nạp hằng ngày)**: `scripts/split-arrivals-csv.js` tách file thành các file theo NGÀY đúng mẫu `HangDen_<mã BCVH>_<yyyymmdd>_235959.csv`, rồi nạp bằng `scripts/import-arrivals.js <thư-mục>` như mọi ngày — mọi truy vấn không đổi. Ngày của một dòng = ngày theo R2 (#59); dòng chưa có mốc BCVH lấy ngày lập BD10 (đúng nghĩa "đã lập BD10 trong khung của file đó"); dòng không có mốc nào xếp vào ngày cuối (và được báo số lượng). Giờ trong tên file 235959 (mặc định, đổi bằng `--time`) = file chốt cuối ngày → Dashboard lấy `as_of` 23:59. Thư mục đầu ra BẮT BUỘC nằm ngoài repo và rỗng. Hệ quả chấp nhận: mỗi ngày chỉ có 1 file nên `--check-days` / `import-status` báo "thiếu đợt" (chuẩn hằng ngày là 2 file) — chỉ là thông tin, không ảnh hưởng số liệu; "đến lại trong khoảng" chỉ phản ánh bưu gửi xuất hiện ở nhiều ngày của file tách.
Phương án khác đã cân nhắc: (b) tuỳ chọn nạp với ngày file cố định / từng dòng theo ngày thật — phải thêm cột ngày file vào `arrival_items` hoặc sửa nhiều truy vấn (đổi hành vi, rủi ro); (c) nới kiểm tra hợp lý theo tham số — vẫn sai các chỉ số lọc theo `file_date`. Chế độ nạp đè trong importer (để triển khai thật) ghi ở backlog.
**Đọc cột theo TÊN** (`resolveHeader` trong `arrivalsImport.js`): tên cột so khớp không dấu, không phân biệt hoa/thường, bỏ khoảng trắng/gạch dưới (`Thời gian XN túi` = `Thoi_gian_XN_tui`); thứ tự cột tuỳ ý; cột lạ bị bỏ qua (số cột bỏ qua trả về trong kết quả nạp, `extraColumns`); cột trùng tên → REJECTED; thiếu cột bắt buộc → REJECTED nêu tên cột; cột tuỳ chọn vắng (`Ma_BC_dong`, `Khoi_luong_thuc_te`, `Ten_dich_vu`, `Ghi_chu`) → rỗng / NULL. File cũ (16 cột chuẩn) nạp như trước. Đổi chỗ hai cột không còn bị từ chối (đọc đúng theo tên); test cũ "sai tiêu đề" đổi sang thiếu / trùng cột.
**Ngữ nghĩa XNĐ BD10 đã đổi ở nguồn**: với tiền tố `530100`, `Ngay_gio_XND_BD10` nay có giá trị → các quy tắc "đủ trạng thái theo nguồn" của #61 (nhóm `ttkt` đủ = túi + bưu gửi, không cần XNĐ BD10) và hằng số `TTKT_BD10_PREFIX` SẼ ĐƯỢC XEM LẠI/THAY sau khi PO phân tích dữ liệu mới. Code #61 giữ nguyên trong ticket này (nhóm vẫn theo tiền tố; "đủ" của nhóm `ttkt` chưa đòi XNĐ BD10).

### 64. Script xoá dữ liệu sản lượng đến (dev) — `scripts/reset-arrivals.js` (SANLUONG-3i)
Chỉ xoá bảng `arrival_items` và `arrival_import_files` (danh sách trắng cố định, không suy luận từ tên) và đặt lại bộ đếm id của `arrival_import_files`. KHÔNG đụng `users`, `user_bcvh`, `post_offices`, `commune_post_offices`, `province_post_offices`, `ward_bdx_map` (kể cả gán tay), `dashboard_widgets` và mọi bảng khác. Chạy thử mặc định; `--apply` trong một transaction; lặp lại an toàn; sau khi xoá, mọi file nạp lại như chưa từng nạp. Chỉ dùng cho dev: xoá cả lịch sử nạp (mã băm, trạng thái) nên không hoàn tác được — PO sao lưu DB (+ `-wal`, `-shm`) và tắt app trước (`06_DEPLOYMENT.md` mục 9).


### 65. Định dạng ngày giờ và chữ NULL của script xuất CSV mới (PO xác nhận trên dòng thật, 10/10/2026 — SANLUONG-3j)
Script xuất CSV đã sửa trả file khác định dạng cũ ở hai điểm: (1) ngày giờ dạng ISO có mili giây, ví dụ `2026-10-10 10:45:03.717` (định dạng cũ `M/D/YYYY h:mm:ss AM/PM` vẫn đọc được); (2) ô không có giá trị là chữ `NULL` (thấy ở `Thời gian XN túi`, `Thời gian XN BG`), không phải ô rỗng.
**Cách đọc** — MỘT hàm dùng chung `parseDateTimeCell()` (`server/lib/arrivalsImport.js`; importer và `scripts/split-arrivals-csv.js` cùng gọi, không nhân đôi logic) cho BỐN cột thời gian (`Thời gian XN túi`, `Thời gian XN BG`, `Ngay_gio_XND_BD10`, `Ngay_gio_XND_BD10_tai_TTKT`):
- rỗng hoặc chữ `NULL` (không phân biệt hoa/thường, bỏ khoảng trắng hai đầu) → rỗng;
- `YYYY-MM-DD HH:mm:ss` hoặc `YYYY-MM-DDTHH:mm:ss`, kèm phần giây lẻ 1–7 chữ số (bị bỏ, không làm tròn); KHÔNG đổi múi giờ (giá trị đã là giờ địa phương, đọc nguyên);
- `M/D/YYYY h:mm:ss AM|PM` (cũ, hành vi không đổi; `parseUsDateTime` giữ nguyên);
- chuỗi khác (vd thiếu giây `2026-10-10 10:45`, chỉ có ngày, ngày không tồn tại) → REJECTED nêu số dòng + tên cột, không in giá trị.
Script tách ghi file con GIỮ NGUYÊN chuỗi gốc từng ô (kể cả mili giây, `T`, `NULL`); importer đọc lại bằng cùng hàm. Không đổi R2 (#59), "chưa nhận" (#60), ngưỡng hợp lý [ngày file −3, +1] hay chỉ số nào. Dòng có ngày đến 10/10 (sau khung 01–09/10) được tách thành file `..._20261010_235959.csv` riêng như mọi ngày khác.
**[Đã được #66 thay thế: chữ `NULL` ở MỌI cột nay = ô rỗng.]** Trước #66, chữ `NULL` ở các cột KHÁC không tự đổi (chờ PO quyết) — importer coi đó là dữ liệu thật: `So_hieu_BD10` = `NULL` → lưu chữ `NULL`, rơi vào nhóm `khac` thay vì `khong_bd10` (#61); `So_hieu_BD8`, `SHBG`, `Ten_duong_thu`, `Dich_vu_code`, `Ten_dich_vu`, `Ghi_chu` → lưu chữ `NULL` (đường thư `NULL` không được tính là "chưa có tên"); `Ten_Tinh_Thanh` = `NULL` → bị tính vào "Phường/xã tỉnh khác"; `Ten_Xa_Phuong` = `NULL` → phường/xã tên "null" (không khớp danh mục); `Khoi_luong_thuc_te` = `NULL` → REJECTED cả file ("không phải số nguyên"). Script tách đòi `BC_nhan_BG` là số nên `NULL` ở đó báo lỗi rõ. Nếu file thật có `NULL` ở các cột này, cần quyết định riêng (backlog 7h1).


### 66. Chữ NULL = ô rỗng ở MỌI cột của file CSV hàng đến (PO, 10/10/2026 — SANLUONG-3k; mở rộng #65)
Script xuất ghi chữ `NULL` cho mọi ô không có giá trị. PO đếm trên file thật (32.885 dòng): `Ma_BC_dong` 4; `Ten_duong_thu` 2.035; `So_hieu_BD10` 2.035; `So_hieu_BD8` 1.573; `Dich_vu_code` 4; `Ten_dich_vu` 4; `Ghi_chu` 5.803; `Ten_Xa_Phuong` 3.060; `Ten_Tinh_Thanh` 971; bốn cột thời gian đã xử lý ở #65; `BC_nhan_BG`, `SHBG`, `Khoi_luong_thuc_te` không có `NULL`.
**Quy tắc**: ô có đúng chữ `NULL` (không phân biệt hoa/thường, bỏ khoảng trắng hai đầu) ở **mọi cột** = ô rỗng. Chuẩn hoá ngay ở bước đọc ô (`normalizeCell()` trong `server/lib/arrivalsImport.js`, MỘT hàm dùng chung cho importer và `scripts/split-arrivals-csv.js`), trước mọi kiểm tra / lưu; cột nào vốn xử lý rỗng thế nào thì giữ nguyên. Chuỗi khác (`NULLABLE`, `NULL_X`, `N/A`, có chữ `NULL` ở giữa) giữ nguyên chuỗi gốc, kể cả khoảng trắng. Script tách vẫn ghi file con giữ nguyên chuỗi gốc (kể cả `NULL`), importer chuẩn hoá khi đọc lại.
**Khảo sát xử lý ô rỗng của importer** (không cột nào bị từ chối vì rỗng): mọi cột chữ lưu `''` (cột DB `NOT NULL DEFAULT ''`); `Khoi_luong_thuc_te` rỗng → NULL; bốn cột thời gian rỗng → NULL (mốc vắng). Chỉ REJECTED cả file khi: sai tiêu đề / thiếu cột bắt buộc, ngày giờ sai định dạng, khối lượng không phải số nguyên, quá 1% dòng ngoài [ngày file −3, +1], lỗi CSV. Hệ quả cho 4 dòng có `Ma_BC_dong`, `Dich_vu_code`, `Ten_dich_vu` cùng `NULL`: **vẫn nạp bình thường** (ba cột này rỗng, dịch vụ vào nhóm "Chưa có tên dịch vụ"). `SHBG` rỗng cũng KHÔNG bị từ chối — lưu `''` (mọi dòng như vậy dồn thành một "bưu gửi" rỗng); file thật hiện không có `NULL` ở `SHBG` / `BC_nhan_BG` / `Khoi_luong_thuc_te`, nên chưa phát sinh, nhưng nếu cần chặn thì là việc riêng (backlog 7h2).
**Hệ quả lên truy vấn / hiển thị** (không đổi mã truy vấn): `So_hieu_BD10` rỗng → nhóm nguồn `khong_bd10` (#61; không còn rơi vào `khac`); `Ten_duong_thu` rỗng → nhóm "Chưa có tên đường thư"; `Dich_vu_code` + `Ten_dich_vu` rỗng → nhóm "Chưa có tên dịch vụ"; `Ten_Tinh_Thanh` rỗng → "Chưa xác định tỉnh" (không còn "Phường/xã tỉnh khác"); `Ten_Xa_Phuong` rỗng → "Chưa xác định phường/xã" và không tạo dòng trong `ward_bdx_map`; `So_hieu_BD8` rỗng → không tính vào túi/kiện (số BD8 khác nhau); `Ghi_chu` rỗng → chuỗi rỗng. Bưu gửi `BC_nhan_BG` = `NULL` làm script tách báo "không xác định được mã BCVH" (dùng `--unit`).


### 67. Chỉ số "BD10 đến không XNĐ" — đơn vị BD10, CÔNG KHAI cho mọi vai trò xem "Sản lượng đến" (PO chốt 10/10/2026 — SANLUONG-4a6; số liệu khảo sát 4a4/4a5)
Chỉ số MỚI duy nhất ở mức BD10; KHÔNG đổi sản lượng, chưa nhận tại BCVH, ngày đến R2 (#59), đường thư, dịch vụ, phường/xã, "đủ trạng thái". Đơn vị BD10 chỉ dùng cho chỉ số này, tính lúc truy vấn từ `arrival_items` (nhóm theo số hiệu BD10) — không có bảng / cột / chỉ mục mới (`server/lib/bd10Query.js`).
- **Mã BD10** = `[6 ký tự bưu cục lập][6 ký tự mã bưu cục nhận][phần còn lại]`. **BD10 đến** của BCVH M: ký tự 7–12 = M (= `receiver_code` của dòng) và 6 ký tự đầu ≠ M. BD10 lập đi (6 ký tự đầu = M), BD10 rỗng / chữ `NULL` (đã thành rỗng, #66) và mã < 12 ký tự KHÔNG thuộc chỉ số. Nhóm theo 6 ký tự đầu: `530100` (TTKT, hằng số `TTKT_BD10_PREFIX`) và `khac`.
- **Trạng thái** (xét trên MỌI dòng của BD10, không giới hạn file / ngày): S1 có XNĐ BD10 ở các dòng | S2 không XNĐ, ≥ 1 dòng đủ cả XN túi lẫn XN bưu gửi | S3 không XNĐ, có XN túi hoặc XN bưu gửi nhưng không dòng nào đủ cả hai | S4 không XNĐ, không XN nào.
- **Tử số N = S2 + S3. Mẫu số D = S1 + S2 + S3 có ngày trong khung.** S4 không có mốc nào nên không gán được ngày: trả riêng (`ngoai_khung.khong_co_moc`), không vào D. `ty_le = N / D` (0..1, làm tròn 4 chữ số; `null` khi D = 0), cho tổng và từng nhóm.
- **Ngày của BD10 (quy tắc X)**: có XNĐ → MIN(XNĐ) (khảo sát: mọi dòng của BD10 cùng một giá trị; nếu khác thì lấy MIN và đếm vào `ghi_nhan.xnd_khong_dong_nhat`); không có XNĐ → MIN của XN túi và XN bưu gửi trên mọi dòng (cả hai cột). Khung lọc theo ngày này (từ đầu ngày `from` đến hết ngày `to`). Quy tắc Y (XN trước, XNĐ sau) chỉ để so sánh ở khảo sát 4a5, không dùng.
- **Tuổi của N**: số ngày từ ngày gán đến file mới nhất đã nạp **[#70: của BCVH nhận (ký tự 7–12 của BD10), không còn toàn DB.]** (`latestFileDate`, `dayAge`, `ageBucket` — cùng hàm với `chua_nhan_tai_bcvh`): `'0-1'`, `'2'`, `'3+'`.
- **API**: khoá `bd10_den_khong_xnd = { tong_bd10_den, khong_xnd, ty_le, theo_nhom: { '530100': {tong, khong_xnd, ty_le}, khac: {...} }, theo_tuoi, theo_trang_thai: {s1, s2, s3}, ngoai_khung: {truoc_khung, sau_khung, khong_co_moc}, ghi_nhan, khung }` trong `GET /api/arrivals/summary` và `GET /api/arrivals/dashboard/center`. **CÔNG KHAI**: không đặt sau cờ ADMIN (khác `canh_bao` và khối chất lượng khai thác); ADMIN / TTVH / GDVH đều nhận; STAFF 403 như `/arrivals`. Phạm vi BCVH: theo `receiver_code` (không lọc = mọi BCVH có BD10 đến) cho MỌI vai trò (#72; trước #72: GDVH chỉ BCVH được giao, chưa được giao → 0). `GET /api/arrivals/bd10-khong-xnd` (từ `from`, `to`, `receiver_code` hoặc bí danh `unit`, `nhom`, `tuoi`, `page`, `page_size`): các BD10 thuộc N, cũ nhất trước, mỗi dòng `so_hieu_bd10` (đầy đủ), `lap6`, `nhom`, `ma_bcvh`, `ngay`, `thoi_diem`, `tuoi`, `so_buu_gui`, `so_bd8`, `co_xn_tui`, `co_xn_bg`, `trang_thai` (`S2` | `S3`). `GET /api/arrivals/bd10-khong-xnd/export`: xlsx cùng bộ lọc, MỘT BCVH mỗi file, tối đa 92 ngày, cùng quyền / giới hạn / nhật ký với `/export` (`kind: bd10_khong_xnd`), mọi ô là chuỗi.
- **Đối chiếu trên bản chép DB dev** (BCVH 533140, khung 01→09/10, 32.880 dòng): D = 163, N = 22 (13,5%); 530100: D 104, N 19 (18,3%); khác: D 59, N 3 (5,1%); S1/S2/S3 = 141/21/1; ngoài khung: 18 trước 01/10, 5 sau 09/10, 2 không có mốc; tuổi N: `0-1` 0, `2` 2, `3+` 20 — khớp đúng báo cáo 4a5 (quy tắc X). Hiệu năng: một lần quét toàn bảng nhóm theo BD10 (~1,8 s trên 1,02 triệu dòng, 58 ms trên 33 nghìn dòng; chỉ mục phủ thử không nhanh hơn nên không thêm); danh sách một trang ~1,8 s trên 1,02 triệu dòng.
- **Việc khác**: #61 (ba nhóm theo nguồn) sẽ được thay; mã giữ để giao diện đang chờ không gãy. Bưu gửi không thuộc BD10 (BD10 rỗng, ~2.000 SHBG) cần chỉ số riêng (backlog 7j1).

### 68. "Chưa nhận tại BCVH" loại BD10 lập đi và BD10 rỗng (PO quyết 10/10/2026 — SANLUONG-4a9; ĐỔI định nghĩa #60; căn cứ khảo sát 4a8)
- **Định nghĩa mới**: như #60 (không mốc BCVH ở mọi dòng trong các file có ngày file thuộc khung + có `bd10_ttkt_confirmed_at`), THÊM điều kiện theo BD10 của **dòng đại diện** (dòng có `id` nhỏ nhất của bưu gửi trong khung / BCVH lọc): chỉ giữ BD10 ĐẾN (ký tự 7–12 = bưu cục nhận của dòng) hoặc BD10 loại khác (cả hai nửa khác bưu cục nhận). **Loại**: BD10 rỗng; BD10 LẬP ĐI (6 ký tự đầu = bưu cục nhận của dòng). Mã ngắn (< 12 ký tự, không rỗng) rơi vào "loại khác" (không gặp trên dữ liệu thật).
- **Một chỗ**: `notReceivedSql()` + `NOT_RECEIVED_BD10_SQL` trong `server/lib/arrivalsQuery.js`, dùng chung cho `notReceivedStats` (`/summary`, `/dashboard/center`), `notReceivedList` (`/not-received` và xuất Excel `/not-received/export`) và lý do `CHUA_NHAN_TAI_BCVH` ở `/exceptions`. Khung ngày (theo ngày FILE), tuổi, phạm vi BCVH, khoá API: không đổi.
- **Hệ quả**: bưu gửi bị loại (có mốc lập BD10 nhưng BD10 lập đi / rỗng) không còn ở "chưa nhận" và cũng KHÔNG ở `KHONG_CO_MOC` (vẫn chỉ gồm bưu gửi không có mốc lập BD10); `canh_bao.chua_xac_dinh_ngay_den` (lỗi thời) = `chua_nhan_tai_bcvh.tong + khong_moc_khong_ttkt` nên giảm theo.
- **Đối chiếu bản chép DB dev** (BCVH 533140, khung 01→09/10, tuổi tới file 10/10): 330 → 320 (loại 9 BD10 lập đi + 1 BD10 rỗng); tuổi `0-1` 249, `2` 5, `3+` 66 — khớp 4a8. `/not-received`, `/exceptions`, `/dashboard/center` cùng 320. Ghi nhận: 46 bưu gửi "chưa nhận" có các dòng thuộc nhiều loại BD10 khác nhau (phân loại theo dòng đại diện).

### 69. API "Trạng thái BD10 đến" theo ngày và theo bưu cục lập (SANLUONG-4a9; dùng lại định nghĩa #67, không đổi khoá cũ)
- `GET /api/arrivals/bd10-trang-thai/theo-ngay` và `GET /api/arrivals/bd10-trang-thai/theo-buu-cuc-lap`. Tham số: `from`, `to` (CHỈ ngày `YYYY-MM-DD`; một ngày: `from = to`), `receiver_code` hoặc `unit`. Khung tối đa 92 ngày (= xuất file `EXPORT_MAX_DAYS`), vượt → 400 tiếng Việt. Khoá lạ → 400.
- Cùng tập BD10 đến, trạng thái và quy tắc ngày X với `bd10_den_khong_xnd` (#67): `da_xnd` = S1, `chua_xnd` = S2 + S3, `tong` = S1 + S2 + S3 có ngày trong khung, `ty_le_chua_xnd` = chua_xnd / tong (4 chữ số; `null` khi tong = 0). S4 và BD10 có ngày ngoài khung: `ngoai_khung { truoc_khung, sau_khung, khong_co_moc }`.
- `theo-ngay`: `{ khung, ngay_du_lieu_moi_nhat, theo_ngay: [{ ngay, tong, da_xnd, chua_xnd, ty_le_chua_xnd }] (MỌI ngày trong khung, ngày trống = 0), tong, ngoai_khung }`. `ngay_du_lieu_moi_nhat` = ngày file OK mới nhất của các BCVH đang chọn (#70; trước đó: cả DB).
- `theo-buu-cuc-lap`: `{ khung, theo_buu_cuc_lap: [{ ma_buu_cuc, ten_buu_cuc, tong, da_xnd, chua_xnd, ty_le_chua_xnd }], tong, ngoai_khung }`; bưu cục lập = 6 ký tự đầu BD10, không gộp `530100` / `khac`; sắp `chua_xnd` giảm dần, rồi `tong` giảm dần, rồi mã tăng dần; dòng tổng ở khoá `tong` (không chèn vào mảng). Tên lấy từ danh mục `post_offices` (`code`, `name`); mã không có trong danh mục → `ten_buu_cuc = null`.
- Endpoint riêng (không thêm khoá vào `/summary`): `/summary` phục vụ nhiều thẻ, khung tới 731 ngày và chạy mỗi lần đổi bộ lọc; hai bảng mới có giới hạn 92 ngày, mảng theo ngày dài và tra danh mục tên — cùng kiểu với `/bd10-khong-xnd`.
- Quyền: công khai cho ADMIN / TTVH / GDVH (STAFF 403); mọi vai trò xem BCVH đang chọn (#72; trước #72 theo `scopeCodes(req)`).
- Đối chiếu bản chép DB dev (BCVH 533140, 01→09/10): tong 163, chua_xnd 22 (13,5%); 530100: 19/104; các bưu cục khác cộng lại 3/59; ngoài khung 18 / 5 / 2 — khớp 4a5/4a6. Mọi mã bưu cục lập trên dữ liệu thật đều có tên trong `post_offices`.

### 70. Ngày dữ liệu mới nhất và "đã chờ" tính THEO TỪNG BCVH; chốt các điểm còn mở của 4a9 (PO quyết 11/10/2026 — SANLUONG-4a9b; ĐỔI mốc tính tuổi của #60 và #67)
- **Mốc "đã chờ" / tuổi**: mỗi mục tính tới ngày file OK mới nhất CỦA BCVH NHẬN của chính nó — bưu gửi "chưa nhận": `receiver_code` của dòng đại diện; BD10 đến: ký tự 7–12 của số hiệu BD10 (= `receiver_code`). Trước đây (#60, #67) là ngày file OK mới nhất của cả DB. #62 không có quy tắc tuổi nên không đổi. BCVH không có file OK: không có mục nào của BCVH đó (nếu có thì tuổi = 0, như DB chưa có file).
- **Một nguồn**: `latestFileDates(db)` (Map mã BCVH → ngày, từ `arrival_import_files.unit_code`, status OK) trong `server/lib/arrivalsQuery.js`; `latestFileDate(db, codes)` (ngày muộn nhất trong các BCVH `codes`; null / rỗng = mọi BCVH; không có file → null) và `ageAt(byUnit, ma, ngay)` dựng trên nó. Bộ lọc `tuoi` của `/bd10-khong-xnd` tính trong SQL từ cùng Map (`@latest_by_unit`). Áp ở: `chua_nhan_tai_bcvh` (`/summary`, `/dashboard/center`), `/not-received` (`tuoi_ngay`) và file xuất (`Da_cho_ngay`), `CHUA_NHAN_TAI_BCVH` của `/exceptions`, `bd10_den_khong_xnd.theo_tuoi`, `/bd10-khong-xnd` (`tuoi`, lọc `tuoi`) và file xuất.
- **`chua_nhan_tai_bcvh.theo_ngay_lap`**: khi chọn nhiều BCVH lệch ngày dữ liệu, cùng một ngày lập có thể có nhiều tuổi → mỗi cặp (ngày, tuổi) một phần tử (ngày tăng dần, tuổi giảm dần); `cu_nhat_ngay` = tuổi lớn nhất. Một BCVH: như cũ.
- **`ngay_du_lieu_moi_nhat`** (`/bd10-trang-thai/theo-ngay`): ngày file OK mới nhất của các BCVH đang chọn (`receiver_code` / `unit`); không chọn = mọi BCVH; BCVH chưa có file → `null` (từ #72 không còn phụ thuộc BCVH được giao).
- **Chốt các điểm của 4a9**: (2) bưu gửi bị loại khỏi "chưa nhận" (BD10 lập đi / rỗng, 10 trên mẫu) KHÔNG cần nhóm riêng; (3) hai API `/bd10-trang-thai/*` giữ giới hạn 92 ngày và chỉ nhận ngày, như `/export`; (4) BD10 mã ngắn (< 12 ký tự, không rỗng) giữ như hiện tại — tính vào "loại khác" của "chưa nhận" (backlog 7j5).
- **Đối chiếu bản chép DB dev** (chỉ BCVH 533140 có file, mới nhất 10/10): mọi số giữ nguyên so với 4a9 — "chưa nhận" 320 (`0-1` 249, `2` 5, `3+` 66, cũ nhất 8 ngày); BD10 đến không XNĐ 22/163 (`0-1` 0, `2` 2, `3+` 20; lọc `tuoi` 0 / 2 / 20); `/dashboard/center`, `/exceptions` cùng số; `ngay_du_lieu_moi_nhat` 533140 = 10/10, BCVH chưa có file = null.

### 71. "Trạng thái BD10 đến": thêm số bưu gửi theo ô (PO chốt hướng đếm bưu gửi, 11/10/2026 — SANLUONG-4a9c; chỉ THÊM khoá vào #69)
- Ở `GET /api/arrivals/bd10-trang-thai/theo-ngay` (mỗi phần tử `theo_ngay[]` và `tong`) và `/theo-buu-cuc-lap` (mỗi phần tử `theo_buu_cuc_lap[]` và `tong`) thêm: `bg_tong`, `bg_da_xnd`, `bg_chua_xnd`, `ty_le_chua_xnd_bg`. Khoá cũ (số BD10), thứ tự sắp (theo số BD10), `ngoai_khung` không đổi.
- **Định nghĩa**: số SHBG KHÁC NHAU có dòng thuộc các BD10 của ô — cùng tập BD10 đến, trạng thái và ngày quy tắc X với số BD10 (#67, #69; dùng chung `perBd10Sql`). `bg_da_xnd`: thuộc BD10 S1; `bg_chua_xnd`: thuộc BD10 S2 + S3; `bg_tong`: thuộc BD10 S1, S2 hoặc S3 (S4 không tính) — một SHBG ở cả hai nhóm đếm 1. `ty_le_chua_xnd_bg = bg_chua_xnd / bg_tong` (4 chữ số; `null` khi `bg_tong` = 0). `tong` cả khung đếm khác nhau trên cả khung, KHÔNG cộng các ô.
- **Hệ quả đã biết, giữ nguyên** (không gộp): một SHBG có dòng ở nhiều BD10 khác ngày / khác trạng thái / khác bưu cục lập xuất hiện ở nhiều ô, nên `bg_da_xnd + bg_chua_xnd` có thể > `bg_tong` và tổng các ô có thể > `tong` cả khung.
- **Cài đặt**: `bgCounts()` trong `server/lib/bd10Query.js` — một câu lệnh: BD10 trong khung (`b`, từ `perBd10Sql`) `CROSS JOIN` dòng `arrival_items` theo (`bd10_no`, `receiver_code`) — quét bảng một lần, tra `b` qua chỉ mục tự động; đếm khác nhau bằng `Set` trong JS. Phạm vi BCVH như số BD10 (`scopedFilters`).
- **Đối chiếu bản chép DB dev** (BCVH 533140, 01→09/10): BD10 163 / chưa XNĐ 22 (13,5%); bưu gửi `bg_tong` 28.049, `bg_da_xnd` 21.957, `bg_chua_xnd` 6.113, tỉ lệ theo bưu gửi 21,79%. 42 SHBG có mặt ở hơn một ô ngày × trạng thái (33 khác ngày, 21 khác trạng thái); `bg_da_xnd + bg_chua_xnd` = 28.070 (> 28.049 thêm 21); tổng `bg_tong` 9 ngày = 28.082 (thêm 33). Thời gian: ~100–115 ms một lần gọi (phần số BD10 ~30 ms).

### 72. Phương án A: "chưa nhận tại BCVH" và "BD10 đến" CÔNG KHAI THẬT — GDVH xem số của BCVH đang chọn; chỉ TẢI / XUẤT giới hạn theo BCVH được giao (PO quyết 10/10/2026 — SANLUONG-4a11; SỬA #52, #60, #67)
- **Căn cứ**: khảo sát 4a10 — GDVH chưa được phân BCVH nhận số 0 cho hai chỉ số này nên giao diện ẩn khối; trong khi #67 chỉ bỏ yêu cầu quyền ADMIN. Chưa có giao diện phân BCVH (chỉ có API `GET/PUT /api/users/:id/bcvh`).
- **Xem (mọi vai trò ADMIN / TTVH / GDVH như nhau, STAFF 403)**: `/summary` (`chua_nhan_tai_bcvh`, `bd10_den_khong_xnd`), `/not-received`, `/bd10-khong-xnd`, `/dashboard/center` (cả hai khoá), `/bd10-trang-thai/theo-ngay`, `/bd10-trang-thai/theo-buu-cuc-lap` — theo bộ lọc `receiver_code` / `unit` như sản lượng (không lọc = mọi BCVH). Route không còn truyền phạm vi (bỏ hàm `scopeCodes` trong `server/routes/arrivals.js`). Tham số `allowed` / `scopeCodes` và `scopedFilters()` trong `arrivalsQuery.js`, `bd10Query.js`, `dashboardQuery.js` GIỮ (mặc định null) để có thể giới hạn lại.
- **Tải / xuất (KHÔNG đổi)**: `/export-scope`, `/export`, `/not-received/export`, `/bd10-khong-xnd/export` vẫn theo `arrivalsExport.allowedBcvhCodes`: ADMIN / TTVH mọi BCVH; GDVH chỉ BCVH được giao (khác → 403; chưa được giao → `export-scope` rỗng, mọi file 403).
- **Sửa**: #52 (nay áp cho cả hai chỉ số), #60 (bỏ "phạm vi BCVH theo vai trò"), #67 (phạm vi theo bộ lọc cho mọi vai trò); kéo theo #69 (quyền) và #70 (`ngay_du_lieu_moi_nhat` không còn phụ thuộc BCVH được giao). Đóng backlog 7f5.

### 73. Dashboard «Cần điều hành ngay hôm nay» — phần «đến» (PO chốt 11/10/2026, canvas bản 31 bảng 5 và 7 — DASH-1) **[Hàng nặng, TB cùng thứ và mức sản lượng đã sửa bởi #76 (DASH-6b).]**
- **Endpoint mới** (không đổi `/dashboard/overview|trend|wards-surge|center` của 3e): `GET /api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang` (`server/lib/dashboardDenQuery.js`). Tham số `bcvh` (một mã trong 6 BCVH | `all`, mặc định `all`), `date` (YYYY-MM-DD); `/phuong-xa-tang` thêm `gioi_han` (1..50, mặc định 5). Quyền như `/arrivals`: ADMIN, TTVH, GDVH xem mọi BCVH (#72), STAFF 403; `bcvh_goi_y` = BCVH được giao của GDVH để giao diện chọn sẵn (vai trò khác: rỗng).
- **"Hôm nay"** của MỖI BCVH = ngày file OK mới nhất của BCVH đó (`latestFileDate`, như #70), hoặc `date`; KHÔNG dùng ngày hệ thống. `den_luc` = `arrival_at` lớn nhất trong ngày của BCVH; "cùng giờ" = 00:00 → `den_luc` của chính BCVH đó. `nap_luc` = `MAX(imported_at)` của file OK (giờ nạp thật, UTC). Phạm vi nhiều BCVH lệch ngày: `ngay_du_lieu` = ngày muộn nhất, `cung_ngay_du_lieu` = false.
- **Sản lượng**: `buu_gui` = SHBG khác nhau (đếm như #28, `buildCountedCte`); `luot` = tổ hợp (SHBG, BD10, BD8) khác nhau có `arrival_at` trong khoảng (định nghĩa #11, dùng lại riêng cho dashboard). So sánh: hôm qua cùng giờ; TB các ngày cùng thứ (tối đa 4) cùng giờ có file. Ngày so sánh không có file OK → `null` (không trả 0). Tổng nhiều BCVH chỉ so trên các BCVH có mốc so sánh (`so_bcvh`).
- **Hàng nặng (dashboard)**: bưu gửi có khối lượng của dòng đại diện `>= 2.000 g` (`HANG_NANG_G`); mẫu số = bưu gửi có khối lượng > 0; báo riêng `khong_co_khoi_luong`. Khác ngưỡng của màn hình sản lượng (#37, > 2.500 g, không đổi).
- **Sau 15:00**: bưu gửi có `arrival_at` (lần đến sớm nhất trong ngày) từ `15:00:00` (`GIO_MUON`); tỉ lệ = / bưu gửi đến trong ngày; `da_toi_gio` = dữ liệu đã tới 15:00 chưa.
- **"Chưa nhận" và "BD10 chưa XNĐ"** của dashboard = hàm có sẵn (`notReceivedStats`, `bd10.stats`) với khung = đúng ngày đang xem; "đã chờ" theo #70 (tới ngày file mới nhất của BCVH nhận, kể cả khi xem ngày cũ).
- **Mức điều hành** (`xu_ly_ngay` / `trong_ngay` / `binh_thuong`; chữ hiển thị do giao diện tạo), hằng số TẠM ở MỘT file `server/config/dashboard-thresholds.js` (sẽ chuyển sang màn hình cấu hình tham số toàn site): chưa nhận — có bưu gửi chờ >= 1 ngày → Xử lý ngay, chỉ chờ trong ngày → Trong ngày; BD10 chưa XNĐ — tỉ lệ >= 10% → Xử lý ngay, >= 5% → Trong ngày; lệch sản lượng so TB cùng thứ — >= 25% → Xử lý ngay, >= 15% → Trong ngày (không có TB → không gắn mức). Mức của BCVH = mức nặng nhất; `bcvh_can_chu_y` = số BCVH ở Xử lý ngay / Trong ngày trên tổng BCVH trong phạm vi.
- **Việc cần làm**: chỉ hai loại có dữ liệu thật (`chua_nhan_tai_bcvh`, `bd10_chua_xnd`) ở mức Xử lý ngay / Trong ngày; sắp Xử lý ngay trước, rồi loại, rồi số lớn trước; mỗi mục có `tieu_de_khoa` (`<loai>.<muc>`), `so_lieu`, `duong_dan` (API danh sách chi tiết + tham số).
- **Phường/xã tăng**: số bưu gửi theo phường/xã (nhóm HOME như `/wards-surge`), cùng giờ: hôm kia, hôm qua, hôm nay, TB cùng thứ; xếp theo mức tăng so hôm qua (số tuyệt đối; hôm qua = 0 → `%` null nhưng vẫn xếp), không lọc ngưỡng nhỏ.
- **Chưa làm**: khối "bưu gửi chưa có thông tin phát" theo giờ, PTC, xếp hạng / biểu đồ khung giờ, màn hình cấu hình tham số — chờ module "Xử lý và tỷ lệ phát".
- **Đối chiếu bản chép DB dev** (533140, `date=2026-10-08`): bưu gửi 3.914, lượt 4.034, dữ liệu tới 18:04:55; hôm qua cùng giờ 4.357 (−10,17%); TB cùng thứ 3.596 (1 tuần có file, +8,84%); hàng nặng 1.150 / 3.914 (29,38%); sau 15:00 300 (7,66%); chưa nhận 5 bưu gửi chờ 2 ngày (Xử lý ngay); BD10 chưa XNĐ 2/23 = 8,7% (Trong ngày) — khớp `/summary`, `/bd10-trang-thai`. Thời gian: `tong-quan-den` ~50–100 ms, `viec-can-lam` ~40–60 ms, `phuong-xa-tang` ~70–100 ms.

### 74. Vai trò `TIVI` — tài khoản chỉ xem dashboard «đến», token dài hạn, có phạm vi (PO quyết 12/10/2026 — DASH-3; phương án 2 của báo cáo DASH-1 Việc 0b)
- **Vai trò thứ năm** `TIVI` (`server/roles.js`, thuộc `VALID_ROLES`, KHÔNG thuộc `VIEWER_ROLES`). Chỉ ADMIN tạo / sửa qua API tài khoản có sẵn.
- **Allowlist, từ chối mặc định** (`server/lib/tivi.js` `TIVI_ALLOWED`, kiểm trong `authRequired` ở MỌI request `/api`): `GET /api/auth/me`, `GET /api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang`. Mọi request khác của TIVI → 403 trước khi tới route (kể cả route chỉ có `authRequired` như `/organization/*`, `/dashboard/stats`, `/dashboard/widgets*`, `PUT /users/me/password`, route chưa tồn tại, phương thức khác GET). Đường dẫn so khớp sau khi giải mã, đổi chữ thường, bỏ "/" cuối. Thêm endpoint cho TIVI = thêm dòng vào `TIVI_ALLOWED` + quyết định PO.
- **Phạm vi**: bảng mới `user_tivi_scope (user_id PK, scope, updated_at)` — `'all'` (toàn Trung tâm, màn bảng 11) hoặc MỘT mã trong 6 BCVH (màn bảng 12). KHÔNG dùng `user_bcvh` (vẫn chỉ là BCVH được giao của GDVH, #51). Ở 3 endpoint dashboard, tham số `bcvh` của TIVI LUÔN bị ÉP về phạm vi (bỏ qua giá trị client gửi, kể cả `all`) — chọn ép thay vì 403 để màn tivi không thể lỡ tay mở rộng phạm vi và không vỡ khi gửi sai. Phạm vi đọc từ DB mỗi request (đổi phạm vi có hiệu lực ngay với token cũ). TIVI chưa có phạm vi → 403 ("chưa được gán phạm vi").
- **Token**: TIVI đăng nhập nhận token hạn `JWT_EXPIRY_TIVI` (biến môi trường; mặc định 90 ngày theo PO), các vai trò khác giữ `JWT_EXPIRY`. Token TIVI mang claim `tivi` + `pwd` (HMAC của `password_hash` bằng `JWT_SECRET`, rút gọn); `authRequired` từ chối (401) token TIVI khi tài khoản KHÔNG còn là TIVI hoặc mật khẩu đã đổi / đặt lại — token 90 ngày không mang được sang vai trò khác. Khoá tài khoản chặn ngay (401) như mọi vai trò (#50). Không có gia hạn tự động, không xoay vòng token (ngoài phạm vi).
- **API tài khoản**: `POST /api/users` và `PUT /api/users/:id` nhận thêm `tivi_scope` (`'all'` | mã BCVH | `null` để bỏ gán; chỉ khi vai trò (mới) là TIVI, khác → 400; giá trị lạ → 400). Rời vai trò TIVI thì xoá phạm vi. `GET /api/users` trả thêm `tivi_scope`. `POST /api/auth/login` trả thêm `user.tivi_scope`. Mới: `GET /api/auth/me` (mọi vai trò) → `{ id, hrm_code, full_name, role, tivi_scope, token_het_han }`. TIVI không tự đổi được vai trò / phạm vi / mật khẩu của mình (allowlist); ADMIN đặt lại mật khẩu khi cần.

### 75. Module «Xử lý và tỷ lệ phát» — quy tắc, trạng thái, nhập từng phần, tỷ lệ (PO chốt 13/10/2026 — PHAT-0; làm ở PHAT-1 chặng 1–2)
Chi tiết bảng và API: `08_PHAT.md`. Nguồn quy tắc chuẩn: PHAT-0 (nếu mâu thuẫn với ticket thì PHAT-0 đúng).
- **Nguyên tắc**: (1) mẫu số là «Sản lượng đến» đã có — SHBG đến ngày D theo R2, loại trùng, cùng `buildCountedCte` với `tong-quan-den`, nên tỷ lệ luôn khớp `san_luong` cùng ngày; (2) trạng thái gắn với (BCVH, SHBG), không gắn với ngày; (3) KHÔNG AI TỰ KHAI GIỜ: «số liệu tính đến lúc» (`nhap_luc`) do máy chủ ghi lúc commit, không tham số nào cho client đặt (tránh làm lúc 18h rồi khai 15h làm méo số liệu trong ngày); (4) dòng hợp lệ vẫn nhập, dòng lỗi giữ lại, chỉ từ chối file sai cấu trúc; (5) không điền giờ phát từng bưu gửi — cột `gio_phat` chừa trống cho nguồn tự động; (6) dữ liệu thật không vào repo, test, docs.
- **Trạng thái** (5, danh sách cố định): `PTC` Phát thành công · `PKTC` Phát không thành công · `CHUYEN_HOAN` Chuyển hoàn · `CHUA_CO_TT` Chưa có thông tin phát · `LAC_HUONG` Lạc hướng. SHBG đã đến mà chưa có trạng thái = `CHUA_CO_TT`; ô trạng thái trống trong file = bỏ qua; ghi chú tự do (chưa có danh mục lý do).
- **Công thức**: tỷ lệ trạng thái X ngày D = SHBG đến ngày D có trạng thái hiện tại X / tổng SHBG đến ngày D (cả 5 nhóm; chuyển hoàn nằm trong mẫu số). **Mức cập nhật kết quả phát** = 100% trừ tỷ lệ `CHUA_CO_TT` (không gọi «đã có thông tin phát»). Khung giờ đến theo `arrival_at`: trước 10h, 10–12h, 12–14h, 14–16h, 16–18h, sau 18h. Tồn «chưa có thông tin phát, đã chờ bao lâu»: dưới 2 giờ, 2–4 giờ, trên 4 giờ, qua ngày. «Hôm nay» và mốc giờ theo quy ước DASH-1 (#73): ngày file OK mới nhất của từng BCVH (#70), mốc = giờ đến lớn nhất của ngày xét.
- **Nhập**: tải file mẫu (mỗi SHBG một dòng; cột khóa xám + cột Trạng thái / Ghi chú mở khóa; danh sách chọn; sheet ẩn `_meta` bắt file nhầm BCVH / cấu trúc cũ) → tải lên và kiểm tra (chưa ghi gì vào dữ liệu thật; bản kiểm tra giữ 7 ngày) → nhập từng phần (hợp lệ hoặc đã chọn; kiểm tra lại từng dòng ngay lúc commit) → file lỗi nhập lại được. Nhập lần sau: khác trạng thái thì ghi đè và giữ lịch sử, không đổi thì báo lỗi `KHONG_DOI`, SHBG vắng trong file thì giữ nguyên. Hoàn tác một đợt chỉ khi chưa đợt nào khác đổi các SHBG đó sau nó.
- **Quyền**: nhập — ADMIN, TTVH mọi BCVH; GDVH chỉ BCVH được gán trong `user_bcvh` (chưa gán thì không nhập được, kể cả khi xem được mọi BCVH theo #72); STAFF, TIVI không. Hoàn tác — ADMIN, TTVH, hoặc chính người nhập. Xem tỷ lệ — ADMIN, TTVH, GDVH (mọi BCVH); TIVI chỉ qua endpoint dashboard ở PHAT-3.
- **PO duyệt ở PHAT-1** (13/10/2026): SHBG theo `^[A-Z]{2}[0-9]{9}[A-Z]{2}$` (dữ liệu dev có 43 SHBG hậu tố nước ngoài; không ép `VN`); chấp nhận lệch nhỏ do SHBG «đến lại» ở nhiều ngày (theo từng ngày chúng ở mẫu số cả hai ngày, file mẫu theo khoảng chỉ một dòng); chấp nhận không sắp xếp được trên file đã khóa (lọc và Ctrl+D dùng được). Ô công thức trong file nhập: lấy `result` nếu là chuỗi, ô lỗi công thức → `SAI_DINH_DANG` («ô chứa lỗi công thức»). SHBG có trong dữ liệu nhưng chưa có giờ đến: `KHONG_CO_TRONG_DEN` («có trong dữ liệu nhưng chưa có giờ đến BCVH»). Đường thư trống cho phép, hiển thị «(không có)».
- **Quy tắc tự quyết đã được PO duyệt**: một dòng chỉ ghi một mã lỗi (thứ tự `SAI_DINH_DANG` > `TRUNG_SHBG` > `TT_NGOAI_DS` > `KHONG_CO_TRONG_DEN` > `KHONG_DOI`); ô trạng thái trống thắng mọi lỗi và không tính vào nhóm trùng; chấp nhận cả mã lẫn nhãn trạng thái; file «tất cả» nạp sẵn trạng thái + ghi chú hiện có; bản kiểm tra dùng chung theo BCVH (ai được nhập cho BCVH đó đều thấy); file lỗi lấy ngày đến / khung giờ / đường thư theo lần đến sớm nhất của SHBG; giờ nhập lưu UTC có `Z`; commit không còn dòng hợp lệ → 400 và không tạo đợt; `PHAT_MAX_DONG` chỉ để hạ giới hạn dòng khi test. **Bảng chuyển bất thường** (cảnh báo vàng, không chặn): từ `PTC` hoặc `CHUYEN_HOAN` sang bất kỳ trạng thái khác; từ `PKTC` hoặc `LAC_HUONG` về `CHUA_CO_TT`.
- **Ba chỉnh của PO khi duyệt chặng 1** (13/10/2026): (1) `errors.xlsx?loai_tru=KHONG_DOI` (nhiều mã cách nhau dấu phẩy) bỏ các dòng loại lỗi đó; kết quả commit và đợt nhập tách «lỗi cần sửa» (`loi_can_sua`, `so_loi`) khỏi «không đổi» (`khong_doi`, `so_khong_doi`); (2) ghi chú quá 500 ký tự: cắt còn 500, cảnh báo vàng «Ghi chú bị cắt (tối đa 500 ký tự)», vẫn nhập; (3) tỷ lệ và các API có giờ nhập trả thêm giờ theo múi `Asia/Bangkok` (`*_bangkok`).
- **Cài đặt chặng 2 (tự quyết, chờ PO duyệt)**: hoàn tác khôi phục trạng thái ngay trước từ lịch sử của các đợt CHƯA hoàn tác (khôi phục cả ghi chú, đợt, giờ nhập); lịch sử của đợt đã hoàn tác không còn được tính; dòng hoàn tác ghi vào `phat_status_history` với `batch_id` của đợt bị hoàn tác; sau hoàn tác các dòng bản kiểm tra của đợt đó được mở khóa và kiểm tra lại (sửa rồi nhập lại được). `so_lieu_den_luc` chỉ tính đợt chưa hoàn tác. Tồn chờ xét lùi tối đa 30 ngày. GDVH chỉ hoàn tác đợt do chính mình nhập.


### 76. Hàng đi ngoài thay hàng nặng; bỏ «TB 4 tuần»; đổi mốc đánh giá (PO chốt 14/10/2026 sau khảo sát DASH-6a — DASH-6b chặng 1)
Căn cứ: `09_DASH6_AUDIT.md`. Sửa/thay #37, #38, #42, #45, #48 và các mục «hàng nặng», «TB cùng thứ», «mức sản lượng» của #73.
- **Hàng đi ngoài**: SHBG «đi ngoài» = có ÍT NHẤT MỘT dòng (trong toàn bộ dữ liệu đã nạp) mà số hiệu BD8 (cắt khoảng trắng, viết hoa) bằng SHBG (cũng chuẩn hoá). BD8 rỗng không tính. Đếm SHBG khác nhau; mẫu số = số SHBG đến (R2, như «Sản lượng đến»). MỘT định nghĩa duy nhất: `DI_NGOAI_SQL` trong `server/lib/arrivalsQuery.js` (câu `EXISTS` trên CTE `s`, dùng chỉ mục `tracking_no`), dùng cho `/summary`, `/by-route`, `/by-service` và `tong-quan-den`. SHBG «lẫn» (một dòng BD8 = SHBG, một dòng BD8 rỗng hoặc của túi khác) vẫn là đi ngoài (chọn «≥ 1 dòng» thay vì «mọi dòng»: lệch ≤ 0,4 điểm theo khảo sát).
- **Bỏ «hàng nặng»**: khái niệm, nhãn, ngưỡng (≥ 2.000 g ở dashboard, > 2.500 g ở «Sản lượng đến») và tham số `heavy_g` (gửi nữa → 400 «Tham số không hỗ trợ»). **Giữ** «Khối lượng (kg)» (`khoi_luong_g`), `khoi_luong_tb_g` và tra cứu theo khối lượng. **Xuất Excel không đổi** (không thêm cột).
- **Hàng đi ngoài chỉ hiển thị** (số, %, chênh theo điểm % so hôm qua và tuần trước), KHÔNG gắn mức, cho đến khi có ≥ 4 tuần dữ liệu thật. Loại việc «hàng nặng tăng ≥ 7 điểm» bị bỏ khỏi «Cần điều hành» (chỉ còn trong API 3e, nay đã xoá).
- **Bỏ «TB 4 tuần» / «mức bình thường»** làm mốc so sánh trên mọi API: không còn `so_tuan`, `it_du_lieu`, `SO_TUAN_SO_SANH`. Chỉ còn hai mốc, cùng giờ DỮ LIỆU của hôm nay (`den_luc`, không phải đồng hồ máy): **hôm qua** và **cùng thứ tuần trước** (D−7). Nhãn mức «Bình thường» giữ làm tên mức.
- **Đánh giá mức sản lượng lệch** (ngưỡng 15% / 25% giữ nguyên) CHỈ dùng mốc cùng thứ tuần trước («hôm qua» chỉ hiển thị — khảo sát: báo sai do hiệu ứng thứ trong tuần), với hai điều kiện ở `server/config/dashboard-thresholds.js`: `SAN_SO_SANH_TOI_THIEU = 50` (mốc tuần trước từ 50 bưu gửi trở lên; đúng 50 được xét) và `GIO_BAT_DAU_DANH_GIA = 12` (giờ của `den_luc` từ 12; 11:59:59 chưa). Không đủ → KHÔNG gắn mức: `muc_chi_tiet.san_luong = null`, `danh_gia_san_luong { trang_thai: 'chua_du_du_lieu', ly_do }` với `ly_do` ∈ `thieu_tuan_truoc` | `moc_duoi_san` | `chua_toi_gio` (kiểm theo thứ tự đó). Đủ → `trang_thai: 'da_danh_gia'`, `ly_do: null`. Sửa luôn lỗi khảo sát: hai ngày lẻ (2 bưu gửi) làm 04/10 và 06/10 báo «Xử lý ngay» sai (+136.950% / +126.850%) và dữ liệu dở dang 10/10 (244 bưu gửi tới 10:45) báo «Xử lý ngay» (−86%).
- **Số chênh có sàn (PO chỉnh 14/10/2026, DASH-6b chặng 2)**: khi mốc so sánh (hôm qua HOẶC tuần trước) có dưới `SAN_SO_SANH_TOI_THIEU` (50) bưu gửi thì `chenh_pct` / `chenh_diem` = `null` (vẫn giữ `gia_tri` / `buu_gui` / `mau_so` của mốc); mốc đúng 50 thì có số. Áp cho `san_luong.so_hom_qua_cung_gio` / `so_tuan_truoc_cung_gio` (mốc = tổng các BCVH có mốc), `theo_bcvh[].so_hom_qua` / `so_tuan_truoc`, `hang_di_ngoai.*.chenh_diem` (sàn tính trên `mau_so` của mốc) và `phuong-xa-tang` (`tang_so_hom_qua_pct`, `lech_so_tuan_truoc_pct`; số tuyệt đối `tang_so_hom_qua` và thứ tự xếp không đổi) — RIÊNG phường/xã dùng sàn `SAN_SO_SANH_PHUONG_XA` = 10 (PO chỉnh: phường/xã nhỏ hơn nhiều sản lượng cả BCVH; mốc 9 → null, mốc 10 → có số), còn `SAN_SO_SANH_TOI_THIEU` = 50 giữ cho sản lượng và hàng đi ngoài. Vì vậy không còn số kiểu +4.900%. Mức sản lượng vẫn đánh giá riêng ở `danh_gia_san_luong`.
- **Khoá API đổi tên hẳn, không giữ khoá cũ** (`tong-quan-den`): `hang_nang` → `hang_di_ngoai { buu_gui, ty_le, mau_so, so_hom_qua_cung_gio, so_tuan_truoc_cung_gio }` (hai mốc: `{ buu_gui, ty_le, mau_so, chenh_diem, so_bcvh }` hoặc `null`; `mau_so` = số bưu gửi đến; bỏ `khong_co_khoi_luong`, `nguong_g`); `san_luong.so_tb_4_tuan_cung_thu` → `san_luong.so_tuan_truoc_cung_gio { gia_tri, chenh_pct, so_bcvh }`; `theo_bcvh[].so_tb_4_tuan { gia_tri, chenh_pct, so_tuan }` → `theo_bcvh[].so_tuan_truoc { gia_tri, chenh_pct }` (thêm `theo_bcvh[].danh_gia_san_luong`); `phuong-xa-tang`: `tb_4_tuan_cung_thu`, `so_tuan`, `lech_so_tb_pct` → `tuan_truoc_cung_gio`, `lech_so_tuan_truoc_pct`; `/summary`, `/by-route`, `/by-service`: `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g` → `hang_di_ngoai`, `ty_le_hang_di_ngoai` (bỏ ngưỡng). `nguong` của `tong-quan-den` echo `DASHBOARD_DEN_THRESHOLDS` mới (bỏ `HANG_NANG_G`, `SO_TUAN_SO_SANH`; thêm `SAN_SO_SANH_TOI_THIEU`, `GIO_BAT_DAU_DANH_GIA`).
- **Xoá API 3e** (`/dashboard/overview|trend|wards-surge|center`, giao diện không còn gọi; đã grep `src/`, `server/`, `scripts/`, `public/`, `tests/`): `server/lib/dashboardQuery.js` chỉ còn `DASHBOARD_BCVH` và `bcvhNames` (nơi khác dùng); `tests/dashboard-api.test.js` (21 ca) bị xoá, riêng ca `/quality-mocs` (phần bổ sung của 3b) chuyển sang `tests/quality-mocs.test.js`. Các ca đối chiếu chéo `/center` trong `bd10-api`, `bd10-trang-thai`, `arrivals-source`, `roles`, `tivi` được bỏ hoặc chuyển sang `/summary` / `/quality-mocs`; khối `chat_luong` của `/center` (#61) không còn ở đâu ngoài `/quality-mocs`. Allowlist TIVI (#74) không đổi.
- **Mốc «cùng giờ» (Việc 0)**: mã đã đúng — hôm qua và tuần trước cắt theo `den_luc` của hôm nay (`windowFilter(ma, ngày, cut)`, `cut` = giờ của `MAX(arrival_at)`), không dùng đồng hồ máy. «−89,7% so hôm qua cùng giờ» lúc 10:45 là số thật: 244 bưu gửi hôm nay (dữ liệu dở dang) so với 2.359 hôm qua tới 10:45 (cả ngày 3.616). Không sửa mã, thêm ca test khoá hành vi.
- **Đối chiếu bản sao DB dev** (533140, 01–10/10/2026, chỉ đọc, đã xoá): tỷ lệ đi ngoài theo ngày KHỚP từng ngày với khảo sát (749/3.631 … 967/3.616; 01→09/10 30.308 SHBG, 6.540 đi ngoài = 21,6%), `tong-quan-den.hang_di_ngoai` = đếm trực tiếp. Mức sản lượng theo quy tắc mới: 08/10 và 09/10 «Bình thường» (đủ điều kiện); 01–03, 05, 07/10 thiếu tuần trước; 04/10 và 06/10 mốc dưới 50; 10/10 chưa tới 12:00 — không ngày nào còn «Xử lý ngay» sai.
- **Chưa làm (ngoài phạm vi)**: giao diện (chặng 2 — đổi khoá và nhãn ở `DailyOpsDashboard`, `TiviView`, `ArrivalsOverview`, `ArrivalsRoutesServices`); ngày lễ/nghỉ làm mốc; ngưỡng cho hàng đi ngoài (chờ ≥ 4 tuần dữ liệu thật).

### 77. Bản kiểm tra thuộc người tạo; danh sách «bản kiểm tra của tôi» (khuyến nghị CTO — PHAT-1b; PO duyệt 14/10/2026)
Căn cứ: khảo sát Việc 0 của PHAT-1b — trước đó `layDraft` chỉ kiểm quyền theo BCVH, KHÔNG kiểm người tạo: mọi GDVH cùng BCVH, ADMIN, TTVH đọc, sửa, xoá dòng, tải file lỗi và commit (nhập thay) được bản của người khác. Chi tiết: `08_PHAT.md` mục 4.
- **Quy tắc**: người tạo đọc / sửa / tải file lỗi / commit bản của mình khi VẪN được nhập BCVH đó (GDVH bị bỏ gán → 403 ngay). ADMIN, TTVH chỉ XEM bản người khác (`GET /drafts/:id`, `/rows`); sửa, điền, xoá dòng, gán nhanh, tải file lỗi, commit → 403 (không nhập thay không ghi dấu). Người khác → 404 cùng câu với «không tồn tại».
- **API mới** `GET /api/phat/drafts?bcvh=<mã>[&tat_ca=1]`: bản CHƯA hết hạn của người gọi theo BCVH, mới nhất trước (`tao_luc` giảm dần); `tat_ca=1` chỉ ADMIN, TTVH (GDVH → 403). Trả tổng hợp, không trả nội dung dòng. Dọn bản hết hạn khi truy cập như điểm cuối khác. Không phân trang (bản chỉ sống 7 ngày).
- **Tự quyết ngoài ticket (PO duyệt a, b, c, e, f, g ngày 14/10/2026)**: (a) ADMIN/TTVH sửa/commit bản của người khác trả **403** chứ không 404 (họ thấy bản đó trong danh sách `tat_ca=1`, 404 sẽ gây hiểu nhầm; không lộ gì thêm); (b) `errors.xlsx` của bản người khác chỉ người tạo tải được (file lỗi chứa nội dung dòng, ADMIN/TTVH chỉ «xem» trên màn hình); (c) thêm `cua_toi` và `tao_luc_bangkok` vào phần tử danh sách để giao diện biết bản nào sửa được; (d) điểm cuối xoá cả bản kiểm tra — PO yêu cầu làm thêm cùng nhánh (xem dưới); (e) 404 áp dụng cả GDVH chưa gán / BCVH khác (trước đây 403) vì kiểm người tạo trước kiểm BCVH.
- **Xoá cả bản kiểm tra** (PO yêu cầu 14/10/2026): `DELETE /api/phat/drafts/:id` — người tạo (còn quyền nhập BCVH đó) hoặc ADMIN, TTVH (mọi bản); người khác 404; STAFF, TIVI 403. Xoá dòng rồi xoá bản trong một giao dịch. **Đã kiểm trước khi cài**: không có khoá ngoại nào ở `phat_*`; `phat_batches.draft_id` chỉ là cột thường (không join ở đâu); hoàn tác đợt chỉ dùng `phat_status_history` / `phat_status_current` và đã chịu được việc bản không còn (bước mở khoá dòng chỉ chạy `if (d)`); dọn bản hết hạn vốn đã xoá bản có dòng `DA_NHAP`. Nên KHÔNG cần 409: xoá bản đã nhập không làm hỏng hoàn tác hay lịch sử (có test). Hệ quả: sau khi xoá, đợt cũ vẫn ghi `draft_id` của bản không còn.

### 78. Hoàn tác từ giao diện: xem trước hoàn tác, lịch sử có lọc, số cảnh báo của đợt (PO quyết 14/10/2026 — PHAT-2b-1, backend)
Căn cứ: máy chủ phải đủ dữ liệu để giao diện PHAT-2b làm «Hoàn tác đợt» và «Lịch sử nhập có lọc». Chi tiết API: `08_PHAT.md` mục 4.
- **Quyết định PO (14/10/2026)**: hoàn tác từ giao diện, nút chỉ đặt ở trang lịch sử; lịch sử có lọc, chưa làm màn chi tiết từng đợt; «nhãn vàng» = cảnh báo từng dòng (đã có) + **số cảnh báo của đợt** (lưu lúc Nhập); chưa làm cảnh báo cấp ngày.
- **Số cảnh báo của đợt**: cột `phat_batches.so_canh_bao INTEGER` (NULL được; thêm idempotent). Đếm lúc commit số dòng được nhập có `canh_bao`, TRƯỚC khi xoá `canh_bao` của dòng; `da-chon` chỉ đếm dòng được chọn. Đợt cũ giữ **NULL = «không rõ»**, KHÔNG tính ngược (không có dữ liệu để tính đúng: `canh_bao` của dòng đã bị xoá khi nhập). Có trong `GET /batches` và phản hồi commit.
- **`GET /api/phat/batches/:id/undo-preview`** (không ghi gì; quyền và thứ tự kiểm như `/undo`): số sẽ khôi phục / xoá, làm được hay không (`BI_CHAN` / `DA_HOAN_TAC`), đợt vướng kèm người nhập. Tách `phanTichHoanTac` dùng chung cho `/undo` và xem trước để hai bên không thể lệch nhau (cùng truy vấn «vướng», cùng cách đếm `trang_thai_truoc IS NULL`); hành vi `/undo` giữ nguyên.
- **409 của `/undo`**: «bị chặn» giữ `dot_vuong`, `so_shbg_vuong` và THÊM `dot_vuong_chi_tiet`; «đã hoàn tác» THÊM `hoan_tac_luc_bangkok`, `hoan_tac_boi`.
- **Lọc `GET /batches`**: `tu_ngay`, `den_ngay` (theo giờ nhập `Asia/Bangkok`, gồm hai đầu), `nguoi_nhap` (id), `trang_thai` (`da_nhap` | `da_hoan_tac`); sai → 400; quyền xem theo BCVH, sắp xếp, phân trang giữ nguyên. Không thêm `draft_id` vào phần tử.
- **Sửa chữ 403**: `/undo` và `/undo-preview` nói «hoàn tác» (trước đây dùng mặc định «nhập kết quả phát»).
- **Gộp phiên trước (cùng nhánh)**: `GET /batches` trả `nguoi_nhap_lua_chon: [{id, hrm_code, full_name}]` — người nhập khác nhau của mọi đợt thuộc BCVH đang chọn (hoặc mọi BCVH được xem), kể cả đợt đã hoàn tác; không theo phân trang hay bộ lọc; sắp theo tên; người không còn trong `users` xếp cuối; GDVH chỉ thấy người nhập thuộc BCVH được giao. Để giao diện lọc theo người nhập mà không gọi API quản lý người dùng.
- **Tự quyết ngoài ticket (chờ PO duyệt)**: (a) xem trước đợt ĐÃ hoàn tác trả mọi số `so_se_*`, `so_shbg_vuong` = 0 và `dot_vuong_chi_tiet` = `[]` (lịch sử của đợt đã hoàn tác đã chứa cả dòng hoàn tác nên không đếm lại được đúng); (b) xem trước đợt bị chặn vẫn trả `so_se_khoi_phuc` / `so_se_xoa_trang_thai` của chính đợt đó; (c) `undo-preview` từ chối tham số lạ (400); (d) `nguoi_nhap` không có đợt nào → danh sách rỗng, không 400 (id có thể thuộc người đã bị xoá khỏi `users` mà vẫn nằm trong `nguoi_nhap_lua_chon`); (e) `so_canh_bao` đặt ngay sau `so_khong_doi` trong phần tử `/batches`.
- **Chưa làm (ngoài phạm vi)**: giao diện (PHAT-2b); cảnh báo cấp ngày; màn chi tiết từng đợt; đo hiệu năng 20.000 dòng (ticket riêng).

### 79. Kết quả phát cho Dashboard «Điều hành hôm nay»: endpoint, ngưỡng máy chủ, sàn xếp hạng, cờ theo ngày (PO quyết 14/10/2026 — PHAT-3b, backend)
Căn cứ: khảo sát PHAT-3a (`10_PHAT3_AUDIT.md`) — Dashboard còn khung «Sắp có» cho PTC; `/ty-le` chỉ có dạng gộp, không có cờ theo ngày. Chi tiết API: `08_PHAT.md` mục 4.
- **Quyết định PO (14/10/2026)**: (1) hai ngưỡng màu PTC đưa lên hằng số **máy chủ** dùng chung, `NGUONG_PTC_DAT = 0.82` và `NGUONG_CHUA_CO_TT_CANH_BAO = 0.10` (TẠM, chưa làm màn chỉnh), endpoint trả hai ngưỡng này; (2) xếp hạng BCVH có sàn mẫu số 50 (`SAN_XEP_HANG_BCVH`); BCVH dưới sàn hoặc chưa nhập trong ngày ghi «chưa đủ dữ liệu» (`chua_nhap` | `duoi_san`), **không xếp cuối**; sàn phường/xã 10 (`SAN_XEP_HANG_PHUONG_XA`) chỉ khai báo, để PHAT-3d; (3) PTC tính trên cả mẫu số, xếp hạng PTC giảm dần; (4) mức cập nhật GIỮ NGUYÊN (100% trừ tỷ lệ `CHUA_CO_TT`); (5) chỉ Dashboard, tivi để PHAT-3d, STAFF và TIVI 403; (6) đơn vị chênh «điểm», không so tuần trước cho PTC.
- **Endpoint** `GET /api/arrivals/dashboard/ket-qua-phat?bcvh=&ngay=` (`routes/arrivals.js`, `lib/phatDashboard.js`); hằng số ở `lib/phatConfig.js`. Dùng lại `demNgay`/`dungTyLe` của `/ty-le` (không nhân đôi logic); không có khung giờ và `ton_cho`. `/ty-le` và màn 13 không đổi.
- **Cờ theo ngày**: `co_so_lieu_phat` và `so_lieu_den_luc` chỉ xét các SHBG **đến đúng ngày xem** có dòng trạng thái (`demNgay` trả thêm `co_tt`, `nhap_luc_max`); ngày chưa ai nhập → `false` / `null`. Sửa lỗi khảo sát: `soLieuDenLuc` của `/ty-le` lấy đợt gần nhất của mọi ngày.
- **Tự quyết ngoài ticket (chờ PO duyệt)**: (a) ~~GDVH chỉ thấy BCVH được giao~~ — **ĐÃ ĐỔI (PO chọn phương án A, 14/10/2026)**: GDVH xem ĐỦ mọi BCVH như ADMIN, TTVH và như 3 endpoint dashboard «đến» (#72): không giới hạn theo `user_bcvh`, GDVH chưa được giao BCVH nào vẫn có dữ liệu, xin `bcvh` bất kỳ đều được, `xep_hang_bcvh` đủ các BCVH đủ điều kiện. Lý do: giống #72, và xếp hạng cần so sánh các BCVH với nhau. Phân quyền của `/api/phat/*` (nhập, hủy, lịch sử, bản kiểm tra: GDVH chỉ BCVH được giao) KHÔNG đổi; (b) `duoi_san` được xét **trước** `chua_nhap` (BCVH mẫu số nhỏ hoặc 0 không có gì để nhập); (c) đồng hạng xếp cùng hạng (1, 2, 2, 4), hòa theo mã BCVH; (d) `xep_hang_bcvh` và `chua_du_du_lieu` là `null` (không phải `[]`) khi phạm vi dưới 2 BCVH; (e) «đã có trạng thái» tính cả dòng đã đổi về `CHUA_CO_TT`; (f) mỗi BCVH xếp hạng theo ngày «hôm nay» của riêng nó khi không có `ngay` (`cung_ngay=false` khi lệch); (g) phản hồi thêm `pham_vi`, `ptc`, `so_lieu_den_luc_bangkok`; (h) thêm `tests/phat-dashboard.test.js` vào script `npm test` ở `package.json`.
- **Số đo `ton_cho`** (dữ liệu giả, `PHAT_PERF=1`): ~320 ms mỗi BCVH, `/ty-le` gộp 6 BCVH ~2,2 s, endpoint mới ~75 ms — nên `ton_cho` không vào endpoint này.
- **Chưa làm (ngoài phạm vi)**: giao diện (PHAT-3c); tivi + xếp hạng phường/xã + loại việc phát (PHAT-3d); đổi màn 13 sang lấy ngưỡng từ máy chủ; màn chỉnh ngưỡng; so cùng giờ / tuần trước cho PTC.

### 80. Xếp hạng BCVH kèm tỷ lệ 4 trạng thái còn lại; `nguong.san_xep_hang_bcvh` (PO duyệt Bảng 19 — PHAT-3b-1, backend)
Căn cứ: Bảng 19 trên Dashboard cần thêm cột theo từng BCVH: Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có thông tin phát. Chi tiết API: `08_PHAT.md` mục 4. Chỉ THÊM khoá; quyền, quy tắc xếp hạng, sàn và các khoá cũ không đổi.
- **`xep_hang_bcvh[].theo_trang_thai`**: `{PKTC, CHUYEN_HOAN, LAC_HUONG, CHUA_CO_TT}`, mỗi khoá `{nhan, so, ty_le}` — đúng tên khoá và dạng của khối `theo_trang_thai` cấp tổng; mẫu số = `mau_so` của BCVH đó (mẫu số của `ptc`). Lấy từ cùng `dungTyLe` nên khớp `/api/phat/ty-le` cùng BCVH, cùng ngày.
- **`chua_du_du_lieu[]`**: giữ `{bcvh, ten, mau_so, ly_do}`, không thêm tỷ lệ. **`nguong.san_xep_hang_bcvh`** = `SAN_XEP_HANG_BCVH` (50, `phatConfig.js`).
- **Tự quyết**: khối chỉ có 4 trạng thái (PTC không lặp lại vì đã có ở `ptc`; số PTC của từng BCVH không có trong phần tử xếp hạng — nếu giao diện cần số tuyệt đối thì thêm sau); thứ tự khoá cũ giữ nguyên, `theo_trang_thai` nằm cuối.
- **Chưa làm**: giao diện Bảng 19 (PHAT-3c).

### 81. Tách importer: `chuanBiFile` (bất đồng bộ, không đụng DB) + `ghiFileDaChuanBi` (đồng bộ, gọi được trong giao dịch ngoài) — hành vi cũ giữ nguyên (SANLUONG-5g-1; PO cho phép sửa `arrivalsImport.js` 14/10/2026, chỉ trong ticket này)
Căn cứ: khảo sát 5g-0 (`14_XOA_DU_LIEU_NGAY_AUDIT.md` mục 7.3) — `importArrivalFile` gộp đọc CSV bất đồng bộ với ghi đồng bộ và tự ghi `REJECTED` ngoài giao dịch; mọi request dùng chung một kết nối DB nên không giữ được giao dịch mở qua `await`. Muốn chức năng «Thay thế» sau này (5g-3) nguyên khối (kiểm tra file mới → xóa → nạp trong MỘT giao dịch) phải tách đôi.
- **`chuanBiFile(filePath, { source })`**: async, KHÔNG nhận `db`, không truy cập DB. Trả đối tượng «đã chuẩn bị» `{ fileName, ketLuan ('SKIPPED_NAME' | 'EMPTY_FILE' | 'READY' | 'REJECTED'), trangThaiDuKien ('SKIPPED_NAME' | 'EMPTY' | 'OK' | 'REJECTED'), parsed, meta (unit_code, file_name, file_date, file_time, file_size, sha256, source), rowCount, items, warning, extraColumns, stats, error }`. Lỗi ĐỌC FILE (không tồn tại…) ném ra như cũ; lỗi nội dung → `REJECTED` + `error`.
- **`ghiFileDaChuanBi(db, daChuanBi, { ghiTuChoi = true, source })`**: ĐỒNG BỘ. Kiểm idempotent theo (tên, sha256), `CONFLICT` cùng tên khác nội dung, ghi `arrival_import_files`, `INSERT OR IGNORE`, đếm `inserted`/`ignored`, cập nhật `ward_bdx_map`. Phần ghi dòng nằm trong `db.transaction` của better-sqlite3 → khi đã ở trong giao dịch (mở bằng `db.transaction` hoặc `BEGIN` tay) tự dùng SAVEPOINT, không tự commit; giao dịch ngoài hoàn tác thì hoàn tác theo; lỗi bất ngờ lúc ghi một file được bắt và trả `REJECTED` (phần ghi dở của file đó đã hoàn tác bằng savepoint).
- **`options.ghiTuChoi`** (mặc định `true` = hành vi cũ): `false` thì KHÔNG ghi bản ghi `REJECTED` / `CONFLICT` (kết quả trả về vẫn có `status` + `error`) — để «Thay thế» không để lại dấu vết khi file mới không hợp lệ.
- **`importArrivalFile(db, filePath, { source })`**: giữ chữ ký, giá trị trả về (kể cả thứ tự khoá), nội dung DB; bên trong = `await chuanBiFile` rồi `ghiFileDaChuanBi`. Chứng minh bằng test tương đương so với bản chụp nguyên văn trước thay đổi (`tests/helpers/arrivalsImport.truoc-5g1.js` — **đã xóa ở 5g-5**, thay bằng so với `chuanBiFile` + `ghiFileDaChuanBi` gọi rời trên DB thứ hai).
- **Khác biệt nhỏ, không quan sát được qua giá trị trả về / nội dung DB**: kiểm «đã nạp» (DB) nay chạy SAU khi phân tích file (trước: trước khi phân tích) — file đã nạp / trùng tên bị phân tích lại (vài chục ms); kết quả không đổi. Không đổi lược đồ, `CHECK`, khoá `INSERT OR IGNORE`, nơi gọi (`sftpSync.js`, `scripts/import-arrivals.js`).
- **Chưa làm** (ngoài phạm vi): xem trước (5g-2), thay thế / thùng rác (5g-3), API / giao diện.

### 82. Xem trước «Thay thế ngày của một BCVH»: ngày theo `file_date`, tập file chọn được, ngưỡng mất SHBG 5 % (PO quyết 14/10/2026 — SANLUONG-5g-2, chỉ đọc)
Căn cứ: `14_XOA_DU_LIEU_NGAY_AUDIT.md`; importer đã tách (#81). Chi tiết: `15_THAY_THE_NGAY_XEM_TRUOC.md`.
- **«Ngày» = ngày trong TÊN FILE (`file_date`)**, không phải ngày trong nội dung. Thay (BCVH X, ngày D) sẽ xóa dòng và bản ghi file của MỌI file `unit_code = X`, `file_date = D` (mọi trạng thái, kể cả nhập tay `_235959`); phần chiều tối ngày D ở file sáng D+1 giữ nguyên.
- **Tập file thay do người dùng chọn**: bản xem trước liệt kê mọi file của (X, D) trên nguồn, mặc định chọn hết; hệ thống không tự đoán file «chuẩn». File ≤ 3 byte ghi `RONG` (không tải); file `REJECTED` hiện rõ và không tính.
- **Mất SHBG** (SHBG chuẩn hóa `trim().toUpperCase()` có ở dữ liệu cũ nhưng không có ở file mới): nút Thay thế KHÓA mặc định khi mất > 0 (mở ở 5g-3/5g-4 bằng tích đồng ý + gõ lại mã BCVH và ngày); báo ĐỎ khi mất **> 5 %** — `NGUONG_MAT_SHBG_DO = 0.05` ở `server/config/thay-the.js` (**TẠM**, sau này chỉnh được trong module ngưỡng); đúng 5 % vẫn `CAN_XAC_NHAN`. Chặn hẳn (`khong_the_thay`) khi không có file `READY` hoặc không có dữ liệu ở DB lẫn nguồn.
- **Chỉ đọc**: không ghi DB / nguồn; lõi `server/lib/thayTheXemTruoc.js` không chứa câu lệnh ghi và không nạp thư viện SFTP. Route **`POST /api/arrivals/thay-the/xem-truoc`** chỉ ADMIN (`SECURITY_LOG` một dòng, không SHBG); script `scripts/thay-the-xem-truoc.js` mở DB chỉ-đọc. Chặn khi đang có lượt đồng bộ (409) hoặc bản xem trước khác; lỗi nguồn (xác thực / vân tay / mạng / thư mục) phân loại như hẹn giờ và KHÔNG thử lại.
- **Mã băm để 5g-3 kiểm lại**: `tap_file_nguon: [{ten, kich_thuoc, sha256}]`; 5g-3 tải lại và từ chối nếu mã băm đổi (không tin bản xem trước).
- **Trạng thái phát** (`phat_status_current(bcvh, shbg)`, không FK): chỉ đếm SHBG có trạng thái trong tập bị xóa, còn / không còn ở bản mới.
- **Chưa làm**: xóa, nạp, thùng rác, giao dịch thay thế (5g-3), giao diện (5g-4).

### 83. Thực hiện «Thay thế ngày của một BCVH» nguyên khối: khoá chung với đồng bộ, «mất thật», sao lưu mỗi lần, thùng rác 30 ngày (PO quyết 14–15/10/2026 — SANLUONG-5g-3)
Căn cứ: #81 (importer đã tách), #82 (xem trước); chi tiết `16_THAY_THE_NGAY_THUC_HIEN.md`.
- **Nguyên khối**: một `db.transaction` ĐỒNG BỘ (không `await`): chép thùng rác → xóa `arrival_items` rồi `arrival_import_files` của MỌI file `unit_code = X`, `file_date = D` (kể cả `REJECTED` / `CONFLICT` và nhập tay `_235959`) → nạp từng file mới bằng `ghiFileDaChuanBi(…, { ghiTuChoi: false, source: 'SFTP' })` → KIỂM `status` trả về (hàm ghi chỉ trả `REJECTED`, không ném, nên lõi tự ném để hoàn tác) → nhật ký. KHÔNG xóa trạng thái phát (tự nối lại theo `(bcvh, shbg)`).
- **Khoá thật**: dùng chính bảng `sftp_sync_runs` (hàng chưa `finished_at`, < 30 phút) nên `syncSftpOnce`, bộ hẹn giờ và `sftp-sync.js` bỏ qua lượt; thêm cờ trong bộ nhớ chống hai lần thay cùng lúc. Lõi tự giành khoá bằng hàm của riêng nó (không sửa `sftpSync.js`); nhả = xóa hàng giữ chỗ.
- **Tin nguồn thật, không tin bản xem trước**: tải lại, `chuanBiFile`, so `sha256` + tên với `tap_file_nguon` của bản xem trước (`NGUON_DA_DOI`); file chọn lỗi thì dừng, KHÔNG xóa gì. Người dùng phải gõ lại mã BCVH + ngày (`XAC_NHAN_SAI`).
- **«Mất thật»** = SHBG có ở tập cũ, không có ở tập mới VÀ không còn dòng nào ở file ngoài tập của cùng BCVH (vd file sáng D+1). Mức cảnh báo (ngưỡng ĐỎ 5 %, đúng 5 % vẫn `CAN_XAC_NHAN`) và khoá đồng ý (`dong_y_mat_du_lieu === true`) tính theo «mất thật»; số cận trên của 5g-2 vẫn trả. Tách `tinhSoSanh` / `mucCanhBaoTheo` / `lietKeNguonCuaNgay` khỏi `thayTheXemTruoc.js` để dùng chung (kết quả xem trước không đổi).
- **Sao lưu mỗi lần** (`db.backup()` toàn DB, sau khi chắc chắn sẽ thay; lỗi / thiếu chỗ → KHÔNG thay): `data/backups/truoc-thay-the_<bcvh>_<ngày>_<UTC>.db`, giữ 5 bản. **Thùng rác 30 ngày**: bảng `thung_rac_file`, `thung_rac_dong` giữ nguyên `id` và `import_file_id` gốc (đủ để 5g-5 khôi phục); dọn khi lần thay kế tiếp chạy hoặc bằng `donThungRac`, không có tác vụ nền. **Nhật ký** `thay_the_nhat_ky` (UTC) chỉ ghi lần thành công.
- **Route** `POST /api/arrivals/thay-the/thuc-hien` (chỉ ADMIN; 400 / 409 / 422 / 502 / 503 / 507 / 500, không để lại thay đổi khi lỗi; phản hồi chỉ có tên tệp sao lưu), **script** `scripts/thay-the-ngay.js` (khô mặc định; thật cần `--chay-that` + `--xac-nhan=<mã>:<ngày>` + `--dong-y-mat` nếu mất thật; mã thoát 9 / 10 / 11 thêm).
- **Test không phụ thuộc môi trường** (bổ sung theo yêu cầu PO 15/10/2026): `server/index.js` nạp `.env` bằng `process.loadEnvFile()` khi harness `require` nó (nạp SAU khi file test bắt đầu), nên test cụm SFTP cách ly `SFTP_*` cả ở đầu file lẫn ngay sau `startTestServer` và đặt nguồn mặc định CẤM MẠNG (`tests/helpers/khongMang.js`).
- **Chưa làm**: hoàn tác từ thùng rác (5g-5), giao diện (5g-4), chạy với NAS / DB thật.

### 84. Xem trước trả «mất thật» và tính mức cảnh báo / khoá / phát theo mất thật (SANLUONG-5g-3b)
Căn cứ: #82 (xem trước theo cận trên), #83 (lõi thay tính mất thật). Giao diện (5g-4) chỉ gọi xem trước nên xem trước phải cho cùng con số và mức như lõi.
- `tinhMatThat` chuyển về `thayTheXemTruoc.js` (xuất ra), `thayTheThucHien.js` nhập lại — MỘT nguồn; hành vi `thayTheNgay` không đổi.
- Xem trước THÊM `so_sanh.shbg_mat_that`, `ty_le_mat_that`, `shbg_mau_mat_that` (6 ký tự đầu, tối đa 20), `canh_bao.can_dong_y_mat`; GIỮ `shbg_chi_o_cu`, `ty_le_mat`, `shbg_mau_chi_o_cu` (cận trên). ĐỔI NGHĨA có kiểm soát: `canh_bao.muc`, `canh_bao.khoa_mac_dinh`, `phat` tính theo mất thật (đúng 5 % vẫn `CAN_XAC_NHAN`). Không đổi tên / xóa trường.
- `shbg_mau_chi_o_cu` (trường cũ) vẫn trả SHBG đầy đủ cho ADMIN theo yêu cầu «giữ nguyên»; mọi trường MỚI chỉ có 6 ký tự đầu. Nếu PO muốn rút gọn cả trường cũ → ticket riêng (giao diện có thể đang dựa vào).
- Chi tiết: `15_THAY_THE_NGAY_XEM_TRUOC.md` mục 9.

### 85. API ĐỌC màn «Nạp dữ liệu nguồn»: trạng thái ô theo bảng quyết định, nghi ngờ ít/nhiều theo trung vị (SANLUONG-5f-1)
Căn cứ: canvas bảng 20; `13_SFTP_SYNC.md`, `15_SFTP_SCHEDULER.md`, #83. Chi tiết: `17_NAP_DU_LIEU_NGUON_API_DOC.md`.
- **Chỉ GET, chỉ ADMIN, chỉ ĐỌC** (không bảng mới / ALTER / ghi): `/api/nap-nguon/tong-quan`, `/luoi`, `/o`, `/luot`, `/luot/:id`; lõi `server/lib/napNguonDoc.js`, hằng số TẠM `server/config/nap-nguon.js`. Không đổi route `/api/arrivals/*` (kể cả `import-status`).
- **Ô = (BCVH, `file_date`, đợt)**, đợt theo `file_time` (< 12:00 S, ≥ 12:00 C). Trạng thái xét theo thứ tự: `DA_NAP` → `RONG` → `LOI` → `NGUON_CO_FILE_CHUA_NAP` (kể cả ngày đã nhập tay) → `NHAP_TAY` → (hôm nay) `CHUA_DEN_GIO` / `CHO_FILE` (giờ mong đợi + ân hạn) → (quá khứ) `NGUON_CHUA_CO_FILE`; `MA_KHONG_KHOP` tách riêng (không thuộc ô). File `MANUAL` là cả ngày (tính cho cả S và C).
- **Nghi ngờ ít / nhiều** ở mức (BCVH, ngày): tổng `row_count` so với trung vị cùng thứ trong tuần (≤ 4 tuần, ≥ 3 mẫu): `IT` < 0,5×, `NHIEU` > 2,5×, `CHUA_DU_MAU`. Không xét hôm nay. Ngưỡng và giờ mong đợi là TẠM (PO chưa chốt).
- **Mã lạ** lấy từ `sftp_source_files` + `sftp_sync_files(ma_loi = MA_LA)`; **người bấm «Tay»** chưa có cột → `nguoi: null` (5f-2 bổ sung); **giờ chạy kế tiếp** từ bộ hẹn giờ trong tiến trình; hàng khóa «Thay thế» lọc khỏi mọi danh sách lượt.
- Hiệu năng: lưới 62 ngày ≈ 13 ms trên DB giả 154 nghìn dòng (vài truy vấn tổng hợp, không truy vấn từng ô). Chuỗi lỗi qua `lamSach` + che `SFTP_*`; không trả đường dẫn / host / cổng / vân tay / SHBG.
- **Chưa làm**: «Lấy lại» / «Lấy ngay» (5f-2), giao diện (5f-3).

### 86. «Lấy ngay» và «Lấy lại»: khoá chung, chạy nền 202, ghi người bấm, bỏ chốt «không thử lại» khi lấy lại (SANLUONG-5f-2)
Căn cứ: #85 (API đọc), #83 (khoá chung), 13_SFTP_SYNC. Chi tiết và bằng chứng Bước 0: `18_NAP_DU_LIEU_NGUON_API_LAY.md`.
- **`POST /api/nap-nguon/lay-ngay`** (một lượt `syncSftpOnce` như hẹn giờ nhưng `HAI_LAN`, tối đa 20 file, cũ trước) và **`POST /api/nap-nguon/lay-lai`** (1–20 ô BCVH × ngày × đợt, bất kỳ ngày nào còn file; chỉ file chưa có bản `OK`). Chỉ ADMIN; 202 `{luot_id, bat_dau}` rồi chạy NỀN; 409 `DANG_CHAY` (kèm `luot_id`; hàng khoá «Thay thế» không lộ) / `TAM_DUNG` (hẹn giờ tạm dừng vì lỗi xác thực / vân tay: KHÔNG kết nối); 503 `CHUA_CAU_HINH`.
- **Khoá = hàng lượt** trong `sftp_sync_runs`, tạo ĐỒNG BỘ trong handler (hai yêu cầu đồng thời → đúng một 202); nhả bằng `finally` đóng hàng. Lỗi xác thực / vân tay sai ở lượt tay → dừng, đóng lượt, và đưa hẹn giờ về `TAM_DUNG` (hàm mới `tamDungHenGio`).
- **Ghi người bấm**: 4 cột mới nullable `loai`, `nguoi_bam_ma`, `nguoi_bam_ten`, `so_o_yeu_cau` (chỉ ADD COLUMN, hàng cũ NULL); API đọc 5f-1 trả `nguoi {ma, ten}`/null và `loai`. Không lưu IP / token.
- **Importer KHÔNG đổi.** `REJECTED`/`CONFLICT` cùng tên lấy lại được (importer xử lý lại), nhưng chốt `DA_TU_CHOI` của lõi đồng bộ chặn → «Lấy lại» có vòng lặp riêng (dùng `fileOnDinh`, bỏ cửa sổ ngày, GIỮ quy tắc ổn định). Ô `EMPTY` mà nguồn nay có nội dung khác: importer báo `CONFLICT` → trả `KHONG_THE_LAY_LAI` (`DA_GHI_RONG_KHAC_NOI_DUNG`); muốn lấy được phải đổi importer hoặc thay bản ghi rỗng — **chờ PO duyệt**.
- Sửa lõi chỉ ở dạng thêm: `syncSftpOnce` nhận `options.luotCoSan`; `sftpScheduler` thêm `tamDungHenGio`. Kết quả từng ô ánh xạ vào cột `sftp_sync_files.ket_qua` sẵn có (CHECK) + `ma_loi`.
- **Chưa làm**: giao diện (5f-3), hủy giữa chừng, thay bản ghi `EMPTY`.

### 87. Nhật ký «Thay thế ngày» (API đọc), khôi phục từ thùng rác, khoá memo `bd10Share` (PO chốt 15/10/2026 — SANLUONG-5g-5, backend)
Căn cứ: #83 (thùng rác + nhật ký), khảo sát 5g-5 Việc 0. Chi tiết và hợp đồng API: `19_THAY_THE_NGAY_NHAT_KY_KHOI_PHUC.md`.
- **API đọc** `GET /api/arrivals/thay-the/nhat-ky[/:id]` (chỉ ADMIN; `page`, `page_size` ≤ 100, `bcvh`, `tu_ngay`, `den_ngay` ≤ 92 ngày, `nguoi`): không trả đường dẫn sao lưu, SHBG / BD, nội dung dòng thùng rác; lõi thuần `thayTheNhatKy.js`.
- **Khôi phục là BỔ SUNG** (`POST …/khoi-phuc/xem-truoc` chỉ đọc; `…/thuc-hien` gõ lại `ma_bcvh` + `ngay` YYYY-MM-DD): dòng `INSERT OR IGNORE` theo khoá nghiệp vụ, **bỏ id dòng gốc** (id không AUTOINCREMENT đã bị dùng lại); bản ghi file OK / EMPTY tạo lại với id gốc, nếu đã có bản OK / EMPTY cùng tên thì **gắn dòng vào bản đó** (nêu số dòng gắn sang file khác, không đổi `row_count`); REJECTED / CONFLICT không tạo lại; không đụng trạng thái phát, không chạm NAS.
- **Khoá và an toàn**: khoá chung với «Thay thế» và đồng bộ (mã hiện hành `DANG_THAY_THE` / `DANG_CO_LUOT_DONG_BO`, 409; KHÔNG chặn khi hẹn giờ `TAM_DUNG`); sao lưu toàn DB (`truoc-khoi-phuc_…`, giữ 5 bản chung với «Thay thế»); một giao dịch đồng bộ; lỗi → hoàn lại, 500 `KHOI_PHUC_THAT_BAI`. Hết hạn 30 ngày / đã dọn → 409 `THUNG_RAC_HET_HAN`; khôi phục lần hai → 409 `DA_KHOI_PHUC`.
- **Nhật ký khôi phục**: bảng mới `thay_the_khoi_phuc` (`nhat_ky_id UNIQUE`, chỉ thêm); không dùng `DA_HOAN_TAC`.
- **`bd10Share`**: không thêm memo mới; khoá memo thêm `MAX(id)` của `arrival_import_files` + vô hiệu hoá tường minh sau «Thay thế» / «Khôi phục» (`xoaBoNhoBd10Share`).
- **Dọn**: xóa `tests/helpers/arrivalsImport.truoc-5g1.js`; 7 ca «tương đương» của `arrivals-import-split.test.js` nay so `importArrivalFile` với `chuanBiFile` + `ghiFileDaChuanBi` gọi rời trên DB thứ hai (giữ nguyên kịch bản).
- **Chưa làm**: giao diện; «nạp bổ sung» 01–09/10; danh sách loại trừ file ADMIN bỏ tích; module ngưỡng.

### 88. «Ngày bắt đầu» của BCVH và trạng thái ô `CHUA_BAT_DAU` (SANLUONG-5f-1b; định nghĩa PO còn xác nhận)
Căn cứ: khảo sát 5f-3a (kịch bản giả: 744 ô, 704 mục `NGUON_CHUA_CO_FILE` nhiễu vì các BCVH mới chưa có dữ liệu). Chi tiết: `17_NAP_DU_LIEU_NGUON_API_DOC.md`.
- `ngay_bat_dau(bcvh)` = ngày nhỏ nhất của `arrival_import_files.file_date` (mọi trạng thái, cả nhập tay) và ngày trong tên file của `sftp_source_files` (kể cả đã biến mất); không có gì → `hom_nay`. Ô `ngay < ngay_bat_dau` → `CHUA_BAT_DAU` (xét trước mọi quy tắc khác), không vào `can_xu_ly`. Khoảng trống SAU ngày bắt đầu giữ nguyên `NGUON_CHUA_CO_FILE` / `CHO_FILE`.
- `luoi()` trả thêm `ngay_bat_dau` ở cấp lưới; `tong_hop.theo_trang_thai` thêm khóa `CHUA_BAT_DAU` (10 khóa). `/o` trả 200 với ô `CHUA_BAT_DAU`. «Lấy lại» không đổi (không đọc trạng thái ô).
- Không thêm biến môi trường / bảng / cột. Chỉ phần đọc `napNguonDoc.js`; lõi tải / nạp giữ nguyên.

### 89. «Đã xem xét» cho mục cần xử lý của «Nạp dữ liệu nguồn» (SANLUONG-5f-1c; quy tắc PO còn xác nhận)
Căn cứ: ví dụ thật 15/10/2026 — BCVH Thuận Hóa ngày 09/10 sáng + chiều ở `NGUON_CO_FILE_CHUA_NAP` vì ngày đã có dữ liệu nhập tay, file chiều trên nguồn chỉ 3 byte; ADMIN đã xem, không cần làm gì nhưng mục (và banner) không bao giờ hết. Chi tiết: `17_NAP_DU_LIEU_NGUON_API_DOC.md` §3.5.
- Bảng mới `nap_nguon_da_xem_xet` (tạo ở `db.js` qua `napNguonXemXet.ensureXemXetSchema`, idempotent). Chỉ mục duy nhất bán phần trên `(loai, bcvh, ngay, COALESCE(dot,''))` khi `huy_luc IS NULL` ⇒ mỗi khóa mục có tối đa MỘT bản ghi đang hoạt động. Hủy = đặt `huy_luc` + `huy_nguoi_ma`, không xóa dòng.
- Chỉ `loai = DOT` và `NGAY`; KHÔNG áp cho `MA_LA`. Khóa mục = `(loai, bcvh, ngay, dot)`, `dot = NULL` cho `NGAY`.
- **Dấu vân tay**: `DOT` = `trang_thai|ly_do|<16 hex đầu SHA-256 của các dòng "ten|kich_thuoc" của file nguồn CÒN trên nguồn thuộc ô, sắp theo tên (không có → băm chuỗi rỗng)>`; `NGAY` = `nghi_ngo|tong_dong`. Dấu chỉ có hiệu lực khi dấu vân tay hiện tại khớp lúc đánh dấu; lệch ⇒ mục tự quay lại `can_xu_ly`, bản ghi cũ giữ làm lịch sử. Hệ quả có chủ đích: tình trạng đổi rồi trở lại đúng như cũ thì dấu có hiệu lực trở lại (dấu vân tay khớp).
- `luoi()` bỏ mục đã xem xét khỏi `can_xu_ly`, trả thêm `da_xem_xet[]` và `tong_hop.da_xem_xet`; `o[]`, `tong_hop.theo_trang_thai`, `tong_hop.nghi_ngo` không đổi. Tên người tra từ `users` lúc đọc.
- API chỉ ADMIN: `POST /api/nap-nguon/da-xem-xet` (máy chủ tự kiểm mục còn cần xử lý, 409 `KHONG_CAN_XU_LY`; idempotent `da_co`), `DELETE /api/nap-nguon/da-xem-xet/:id` (404 `KHONG_TIM_THAY`). `SECURITY_LOG` ghi `nap_nguon_da_xem_xet` / `nap_nguon_huy_da_xem_xet` (ai, BCVH, ngày, loại), không ghi ghi chú.
- Lõi tải / nạp (`napNguonLay.js`, `sftpSync.js`) không đổi; lõi đọc `napNguonDoc.js` vẫn thuần SELECT (phần ghi ở `napNguonXemXet.js`).

### 90. Tivi phạm vi `all` được đọc `ket-qua-phat` (PO chốt 16/10/2026 — DASH-10b, backend)
Căn cứ: DASH-10a — thẻ PTC và xếp hạng «Cả ngày» trên Tivi cần dữ liệu `ket-qua-phat`; Tivi chỉ dùng cho TTVH (phạm vi `all`). Chi tiết: `30_DASH10B_TIVI_KET_QUA_PHAT.md`.
- `GET /api/arrivals/dashboard/ket-qua-phat` thêm vào `TIVI_ALLOWED` (đúng 1 mục; `/api/phat/*` vẫn 403 với Tivi — sửa #74 và #79 ở điểm «TIVI 403»).
- `tiviPhatGuard`: Tivi chỉ qua khi phạm vi tài khoản là `all` và `bcvh` vắng / rỗng / `all`; phạm vi một BCVH, chưa gán phạm vi, hoặc xin `bcvh` cụ thể → 403 (không ép ngầm như 3 endpoint «đến»). Vai trò khác không đổi; cấu trúc trả về không đổi.

### 91. «Kết quả phát từ đầu tháng»: endpoint riêng, lũy kế = cộng từng ngày, số theo trạng thái hiện tại (PO chốt 17/10/2026 — DASH-12b, backend)
Căn cứ: khảo sát DASH-12a. Chi tiết: `31_DASH12B_KET_QUA_PHAT_THANG.md`, `08_PHAT.md` mục 4.
- Phương án B: `GET /api/arrivals/dashboard/ket-qua-phat-thang?bcvh=&ngay=` (mới); `ket-qua-phat` và `tong-quan-den` không đổi. Quyền như `ket-qua-phat`; **TIVI 403** (không thêm vào `TIVI_ALLOWED`).
- Số ngày cũ theo trạng thái **hiện tại** của SHBG (không dựng lại từ lịch sử): nhập muộn / hoàn tác đổi số ngày cũ. Bản ghi thử và khai thật 01–09/10 do PO xử lý trên dữ liệu; không thêm cờ thử/thật.
- Lũy kế = tổng tử ÷ tổng mẫu của TỪNG ngày (`demNgay`), không truy vấn một khoảng (SHBG đến hai ngày đếm hai lần); ngày `co_tt = 0` loại cả tử lẫn mẫu; ngày không file không đóng góp. `bcvh=all`: ngày chung (`tapNgayChung`), cùng tập BCVH cho cả tháng.
- Chênh lệch theo giá trị làm tròn 1 chữ số; `ngang` khi `|chênh| < 0,5` điểm; chỉ trả khi ≥ 2 ngày có số liệu và mẫu số hôm nay ≥ 50, ngược lại `null`. Ba hằng ở `phatConfig.js`, trả qua `nguong`.
- Cache hai tầng (PO chọn 17/10/2026, DASH-12b-2): toàn kết quả 60 giây + chữ ký dữ liệu; và từng `(BCVH, ngày)` với chữ ký riêng (file hàng đến của mọi BCVH trong cửa sổ `[ngày − 1, ngày + 3]` + đợt nhập phát của chính BCVH đó) — đợt nhập chỉ tính lại BCVH liên quan.

### 92. Kết quả phát theo NGÀY ĐẾN: chỉ tính trạng thái nhập từ ngày đó trở đi; «đủ số liệu»; tách «hôm nay» và «lũy kế» (PO chốt 17/10/2026 — DASH-12b-3; ĐỔI #91-1)
Căn cứ: sáng 17/10 chưa BCVH nào nhập phát mà thẻ hôm nay hiện PTC 0,1% (5/3.666) và Chuyển hoàn 38 — vì trạng thái phát gắn `(bcvh, shbg)` không có ngày nên SHBG đến hôm nay mà có trạng thái từ trước (đến lại) bị «mang sang». Chi tiết: `31_DASH12B_KET_QUA_PHAT_THANG.md`, `08_PHAT.md` mục 4.
1. **Kết quả phát ghi cho NGÀY ĐẾN của bưu gửi**, kể cả xử lý muộn (hàng đến 16/10 nhập 95% hết ngày 16 rồi 98% sáng 17/10 → 98% vẫn tính cho ngày 16, không tính cho 17).
2. **Mỗi LẦN ĐẾN D của một SHBG tại một BCVH có trạng thái riêng = bản nhập CUỐI (lịch sử nhập `phat_status_history`, bỏ đợt đã hoàn tác) có ngày nhập VN N, `D ≤ N < D'`** (D' = ngày đến kế tiếp của SHBG tại BCVH; không có D' thì không chặn trên); không có bản nào → Chưa có TT. SHBG đến 16 và 17: nhập PKTC ngày 16, PTC ngày 17 → 16 tính PKTC, 17 tính PTC. Nhập trước khi đến không «mang sang».
3. Hôm nay chưa xử lý gì → PTC / PKTC / Chuyển hoàn / Lạc hướng đều 0 (0,0%), Chưa có TT = 100%.
4. Ngày «đủ số liệu» = «Chưa có TT» < `NGUONG_DU_SO_LIEU` (0,10; đúng 10,0% là chưa đủ). **[THAMSO-1, #94: tên hằng đổi từ `NGUONG_CHUA_CO_TT_CANH_BAO`; hằng đó chỉ còn là mức tô đỏ.]** Ngày chưa đủ: không vào lũy kế, không vào chênh lệch, đường diễn biến ngắt (`null`).
5. Giao diện tách HÔM NAY và LŨY KẾ TỪ 01/MM (chỉ ngày đủ số liệu).
6. **Đổi #91-1**: không còn «số ngày cũ theo trạng thái hiện tại duy nhất của SHBG»; dựng từ lịch sử nhập. Nhập muộn / sửa / hoàn tác vẫn đổi số của ngày đến tương ứng, không đổi số các lần đến khác. Mốc dữ liệu đúng / đủ vẫn là việc của PO.
- Phạm vi áp dụng: `ketQuaPhat` (thẻ ngày, kể cả xếp hạng BCVH) và `ket-qua-phat-thang`; `demNgay` mặc định (`/api/phat/ty-le`, commit / hoàn tác «trước / sau») giữ NGUYÊN hành vi cũ (trạng thái hiện tại). **Tivi** gọi `ket-qua-phat` nên số Tivi đổi theo (giao diện Tivi không sửa ở ticket này).
- `ket-qua-phat` CHỈ THÊM khóa `du_so_lieu`; `so_ngay_co_so_lieu` của endpoint tháng đổi nghĩa = số ngày ĐỦ số liệu; thêm `hom_nay` và `theo_ngay[].du_so_lieu`.
- Giới hạn đã biết: D' lấy từ `arrival_items` của chính BCVH, chưa áp quy tắc gán DASH-7f cho các ngày sau (xấp xỉ).

### 93. Cache «kết quả phát từ đầu tháng»: chữ ký từ TRẠNG THÁI TRONG DB, nghi ngờ thì vô hiệu rộng; khởi động nóng theo lát (PO nghiệm thu 17/10/2026 — DASH-12b-4)
Chi tiết: `31_DASH12B_KET_QUA_PHAT_THANG.md` (mục DASH-12b-4), `08_PHAT.md` mục 4.
- Chữ ký vô hiệu tính từ DB (`PRAGMA data_version` + `total_changes()` cho tầng 1; tổng hợp nội dung theo ngày / BCVH cho tầng 2), KHÔNG từ bộ đếm trong tiến trình: nạp SFTP, «Thay thế ngày», «Khôi phục», `scripts/xoa-du-lieu-bcvh.js`, `import-arrivals.js --chia-ngay`, `scripts/rederive-arrival.js` (UPDATE tại chỗ) đều ghi DB từ ngoài khối tính; cache không được trả số cũ sau bất kỳ đường ghi nào.
- Chữ ký của (BCVH b, ngày D) phản ứng với MỌI thứ ảnh hưởng kết quả: dòng đến của D (mọi BCVH), ngày đến kế tiếp D' (SHBG đến lại), đợt nhập phát / hoàn tác / lịch sử của b, file hàng đến quanh D. Mỗi nguyên nhân có test so sánh trực tiếp «cache == tính lại từ đầu» (`tests/phat-thang.test.js`, nguyên nhân 1–7 + 4b), kể cả kiểm riêng tầng 2.
- Nghi ngờ thì vô hiệu rộng hơn (kể cả ghi bảng không liên quan đổi dấu hiệu → tính lại chữ ký, không tính lại ngày). Không đánh đổi đúng lấy nhanh.
- Khởi động nóng theo LÁT (mỗi lát một truy vấn rồi nhường vòng lặp): lát dài nhất ≤ 102 ms ở cỡ 720.000 dòng (mục tiêu < 200 ms) nên được cài; tắt `PHAT_WARM=0`.

### 94. «Tham số hệ thống»: bảng `tham_so` + nhật ký + lớp đọc getter + API chỉ ADMIN; nhóm 2 chỉ-đọc; tách ngưỡng «màu» / «đủ số liệu» (PO chốt 17/10/2026 — THAMSO-1, backend)
Căn cứ: `33_THAMSO0_KHAO_SAT_THAM_SO.md`; chi tiết: `34_THAMSO1_BACKEND_BANG_THAM_SO.md`.
1. **Phương án A**: bảng `tham_so` chỉ lưu giá trị GHI ĐÈ (thiếu dòng = mặc định, mặc định ở `server/config/tham-so-mac-dinh.js`) + `tham_so_nhat_ky` (ai, khi nào, cũ / mới, lý do, `SUA` | `VE_MAC_DINH`) + lớp đọc `server/lib/thamSo.js` (RAM, nạp lúc khởi động, cập nhật sau mỗi lần ghi). Bốn file hằng số cũ là đối tượng GETTER (enumerable, đóng băng): chỗ gọi không đổi (trừ destructuring `GIO_CHUYEN_CHIEU` ở `dashboardDenQuery.js`).
2. **Nhóm 2 chỉ-đọc**: `nguong_du_so_lieu`, `ranh_gioi_dot`, `khung_gio_den`, `nhom_cho`, `rang_ngay_nap_truoc/sau`, `ty_le_ngoai_khoang_toi_da` hiển thị được, PUT → 400 `KHOA_CHI_DOC`. Sửa nhóm 2 (kèm cảnh báo đỏ, tính lại) hoặc Phương án B (giá trị hiệu lực theo ngày) chỉ khi PO yêu cầu sau.
3. **Tách `NGUONG_CHUA_CO_TT_CANH_BAO`**: mức tô đỏ (`chua_co_tt_canh_bao`, sửa được) và `NGUONG_DU_SO_LIEU` (`nguong_du_so_lieu`, chỉ đọc, quy tắc #92-4). `nguong.chua_co_tt_canh_bao` của API giữ nguyên nghĩa là mức màu.
4. **Hiệu lực NGAY, tính lại cả quá khứ** (không lưu số nào theo ngưỡng). Hoàn về mặc định + lịch sử sửa có; bắt buộc nhập lý do (1–200 ký tự); min / max cứng và ràng buộc chéo kiểm ở máy chủ, tất-cả-hoặc-không; gán giá trị bằng mặc định = xóa dòng ghi đè (vẫn ghi nhật ký). `nguong_mat_shbg_do` trần 0,20 (chốt an toàn của thao tác xóa dữ liệu).
5. **Cache #93**: khóa tầng 1 thêm `phienBan()` của tham số; tầng 2 giữ nguyên (chỉ số đếm thô). Giao diện CHƯA đọc tham số mới (THAMSO-2 bỏ chữ cứng / dự phòng lệch, THAMSO-3 màn ADMIN). Khóa mới `phuong_xa_tang_cao_pct` (20) → `phuong-xa-tang` THÊM khóa `tang_cao_pct`.
6. Đổi tham số nạp nguồn (giờ mong đợi, ân hạn, nghi ngờ ít / nhiều, tuần mẫu): chạy thử cho thấy mục «Đã xem xét» không còn cần xử lý thì rời cả hai danh sách, đặt lại giá trị cũ thì dấu cũ còn hiệu lực (sửa nhận định THAMSO-0 mục 2.2).

### 95. «Quản lý mạng lưới» chỉ ADMIN (PO chốt 18/10/2026 — THEME-1, PR #91; thay #49 và #53(a) về quyền đọc)
1. Toàn bộ «Quản lý mạng lưới» (đọc `GET /api/network`, `GET /api/network/export-data`; ghi, nhập, xoá như cũ) chỉ ADMIN. TTVH, GDVH, STAFF nhận 403. Lý do: mục nằm trong nhóm «Quản trị» cùng Quản lý người dùng, Thay thế ngày, Nạp dữ liệu nguồn, Tham số hệ thống.
2. Cài: `server/routes/network.js` dùng `requireRoles(ROLES.ADMIN)` cho cả hai route đọc (bỏ `VIEWER_ROLES`); `App.jsx` chỉ dựng màn khi `isAdmin`; `Sidebar.jsx` đặt mục trong khối ADMIN. Khảo sát trước khi sửa: chỉ `NetworkListView.jsx` gọi hai route đó. `GET /api/organization/communes` KHÔNG đổi (mọi vai trò đã đăng nhập, #53(e)); hiện chỉ màn mạng lưới dùng nó — để PO xem lại.

### 96. Giao diện phong cách «Huế» phẳng: bảng màu, phông, menu ngang (PO chốt 18/10/2026 — THEME-2, PR #93; menu ngang = THEME-3, CHƯA làm)
1. Phong cách phẳng (bỏ bóng đổ, viền mảnh). Bảng màu: tím #4A1D6E (chính), vàng #E0A82E (nhấn / cảnh báo), đỏ son #B3202A (nguy hiểm), xanh ngọc #1F7A5C (thành công), nền kem #F6F1E7. Các thang `orange`, `gray`, `red`, `emerald`, `amber` của Tailwind được ghi đè trong `src/index.css` (khối «THEME-2: palette override» — xoá khối này là quay lại màu cũ).
2. Phông: Playfair Display (tiêu đề) + Be Vietnam Pro (chữ thường), đóng gói OFFLINE bằng `@fontsource` (không tải từ mạng).
3. Menu bên trái sẽ chuyển sang thanh ngang ở ticket THEME-3 (chưa làm). Màn Tivi không đổi theo ý định; THEME-2 làm đổi nhẹ trạng thái chờ / lỗi / mất mạng của Tivi do dùng chung thang màu — sửa ở THEME-2b.

### 97. Màn «Xử lý và tỷ lệ phát» (`GET /api/phat/ty-le`) tính theo NGÀY ĐẾN (#92), khớp «Điều hành hôm nay» (PO quyết 19/10/2026 — PHAT-6)
Căn cứ: PO thấy 19/10 màn Xử lý, ngày đến 18/10, BCVH Thuận Hóa: PTC 1/1.846 (Chưa có TT 99,9%) trong khi «Điều hành hôm nay» báo PTC 0/3.312. Test dữ liệu giả (`tests/phat-ty-le-ngay-den.test.js`) chứng minh nguyên nhân: `/ty-le` dùng `demNgay` mặc định (trạng thái hiện tại) nên SHBG đến 17 và 18, nhập 17/10, bị tính PTC cho cả lần đến 18/10; `ketQuaPhat` (theoLichSu) thì 0.
1. `tyLeApi` gọi `demNgay(..., { theoLichSu: true })`: mẫu số, 5 nhóm, `muc_cap_nhat`, `theo_khung_gio_den` cùng quy tắc #92 với `ketQuaPhat` (cùng BCVH, cùng ngày ⇒ cùng số, có test ca a–e). Khóa phản hồi KHÔNG đổi.
2. KHÔNG đổi (ngoài phạm vi): `demNgay` mặc định cho `nhapDot` / `hoanTacDot` / «trước / sau» của màn commit; `ton_cho` (vẫn theo trạng thái hiện tại, xét lùi 30 ngày); `so_lieu_den_luc`.
3. Hệ quả đã đo: «Sau» của màn commit lệch `/ty-le` ở NGÀY ĐẾN CŨ của SHBG đến lại (bản nhập hôm nay tính cho ngày cũ theo quy tắc cũ, không theo #92). Có chuyển cả màn commit sang #92 hay không: PO quyết (ticket sau).
4. Chi phí: `demNgay` theoLichSu ~56 ms so ~32 ms (1 BCVH 1 ngày, 744.000 dòng giả); `/ty-le` 1 BCVH ~1,2 s (trước ~1,3 s) vì `ton_cho` ~1,05 s; không thêm cache.

### 98. «Bảng kê kết quả phát theo ngày đến» tải Excel (`GET /api/phat/tai-ve`); quyền GDVH theo `user_bcvh`; tách khỏi «vu hồi» (PO chốt 19/10/2026 — TAIVE-1, backend)
Căn cứ: màn «Xử lý và tỷ lệ phát» cần nút «Tải bảng kê (Excel)» liệt kê từng bưu gửi đến BCVH trong ngày đã chọn kèm kết quả phát hiện tại (giao diện làm ở ticket riêng sau khi API merge).
1. Trạng thái của mỗi SHBG theo quy tắc ngày đến #92, dựng bằng CÙNG CTE với `demNgay(theoLichSu)`: `P.GAN_CTE` (DASH-7f), `P.NHAP_CTE` và `P.NHAP_ROW` (truy vấn con theo từng SHBG tách ra từ `NHAP_SELECT`; SQL đếm không đổi kết quả). Không có bản logic thứ hai ⇒ số dòng của tệp = mẫu số `ty-le` / `ketQuaPhat` cùng (BCVH, ngày); test (a) đối chiếu cả hai. Cần export thêm 4 mục ở `phat.js` (`NHAP_CTE, GAN_CTE, NHAP_ROW, runGan`; `runGan` hiện chưa dùng).
2. Mỗi SHBG một dòng, kể cả «Chưa có TT»; `bcvh=all` = cộng từng BCVH với `ngay_den` đã chọn (mỗi SHBG một lần trong ngày nhờ DASH-7f); 8 cột văn bản; giờ VN; tệp ≤ 50.000 dòng (vượt → 400, không cắt); BCVH không có SHBG đến ngày đó → 400 thông báo tiếng Việt.
3. Quyền KHÁC `/ty-le` (#72 mở mọi BCVH cho GDVH): GDVH chỉ tải BCVH được giao trong `user_bcvh` (`exp.allowedBcvhCodes`), `bcvh=all` → 403; TIVI và vai trò khác 403. Lý do: tệp chứa dữ liệu từng bưu gửi, không chỉ số tổng.
4. KHÔNG làm «Đã vu hồi» ở đây (VUHOI-1/2 làm sau, sẽ thêm cột cờ vu hồi vào tệp); không thêm bảng/cột/migration; không đổi hành vi hàm dùng chung.
5. PO xác nhận 19/10/2026: dòng có trạng thái chọn được là `CHUA_CO_TT` do nhập tường minh (đợt nhập đặt về «Chưa có TT») cũng để trống 4 cột phía nhập, theo đúng câu chữ «Dòng Chưa có TT: để trống …».

## Drift phát hiện
_(chưa có)_
