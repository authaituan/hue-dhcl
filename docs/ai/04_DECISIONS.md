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

### 37. Hàng nặng (PO, 08/10/2026)
Hàng nặng = bưu gửi có khối lượng lớn hơn 2,5 kg (> 2.500 g; đúng 2.500 g chưa tính là nặng). Khối lượng của bưu gửi lấy theo đúng định
nghĩa đang dùng ở `/summary` của 3b (một giá trị cho mỗi bưu gửi; báo cáo 3b ghi không có SHBG nào lệch khối lượng giữa các dòng).
Khối lượng rỗng/0 không tính là nặng.

### 38. Hàng nặng là chỉ số phụ (PO, 08/10/2026)
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

### 42. "Bình thường" của một BCVH (PO, 08–09/10/2026)
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

### 45. Điểm cần điều hành và ngưỡng (PO, 08–09/10/2026)
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

### 48. Sửa định nghĩa điểm "hàng nặng" + sản lượng tối thiểu (PO, 09/10/2026; sửa #45 sau khi xem số liệu mẫu)
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
`/api/arrivals/*` (kể cả `/items`, `/lookup`) trả đủ 6 BCVH cho cả ADMIN, TTVH, GDVH — không lọc theo `user_bcvh`. Ticket 3c-3 (xuất file) mới dùng `getAssignedBcvh` để giới hạn GDVH.

### 53. Mặc định do CTO chọn (PO có thể đổi sau — SANLUONG-3c-2)
(a) Mạng lưới: đọc (`GET /api/network`, `/network/export-data`) cho ADMIN/TTVH/GDVH; ghi/nhập/xoá chỉ ADMIN. (b) Quyền có hiệu lực ngay (#50). (c) Phải còn ít nhất 1 ADMIN hoạt động (#54).
(d) Tạo ADMIN đầu tiên khi triển khai sạch: để ticket triển khai NAS sau. (e) `/api/organization/*` và `/api/dashboard/stats` giữ nguyên (mọi người đã đăng nhập) — ghi vào backlog để PO xem lại.
Hệ quả (Claude Code): `GET /api/users/search` (gợi ý người phụ trách) nằm trong `/api/users*` nên chỉ ADMIN — khớp việc chỉ ADMIN sửa người phụ trách bưu cục.

### 54. ADMIN hoạt động cuối cùng + chi tiết kiểm tra role (Claude Code tự chọn, theo mặc định (c) của #53)
Hạ vai trò hoặc khoá **ADMIN hoạt động cuối cùng** → 400 (`server/lib/adminGuard.js`). Vì người gọi luôn là ADMIN hoạt động (tra DB) và đã bị chặn tự đổi vai trò / tự khoá, lớp này là phòng thủ chiều sâu (qua API hiện chưa tới được; kiểm thử trực tiếp hàm).
`POST /api/users`: không gửi `role` → `STAFF` (quyền thấp nhất, như trước); có gửi thì phải đúng 1 trong 4 giá trị (so khớp chính xác sau `trim`, không tự đổi hoa/thường) — sai → 400. `PUT /api/users/:id`: `role` có gửi mà không hợp lệ → 400 (trước đây giá trị rỗng bị bỏ qua).

## Drift phát hiện
_(chưa có)_
