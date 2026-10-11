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
`/api/arrivals/*` (kể cả `/items`, `/lookup`) trả đủ 6 BCVH cho cả ADMIN, TTVH, GDVH — không lọc theo `user_bcvh`. Ticket 3c-3 (xuất file) mới dùng `getAssignedBcvh` để giới hạn GDVH. **[#72: áp dụng lại cho cả "chưa nhận tại BCVH" và "BD10 đến" — hai chỉ số này từng bị giới hạn ở #60 / #67, nay xem đủ như mọi số khác.]**

### 53. Mặc định do CTO chọn (PO có thể đổi sau — SANLUONG-3c-2)
(a) Mạng lưới: đọc (`GET /api/network`, `/network/export-data`) cho ADMIN/TTVH/GDVH; ghi/nhập/xoá chỉ ADMIN. (b) Quyền có hiệu lực ngay (#50). (c) Phải còn ít nhất 1 ADMIN hoạt động (#54).
(d) Tạo ADMIN đầu tiên khi triển khai sạch: để ticket triển khai NAS sau. (e) `/api/organization/*` và `/api/dashboard/stats` giữ nguyên (mọi người đã đăng nhập) — ghi vào backlog để PO xem lại.
Hệ quả (Claude Code): `GET /api/users/search` (gợi ý người phụ trách) nằm trong `/api/users*` nên chỉ ADMIN — khớp việc chỉ ADMIN sửa người phụ trách bưu cục.

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


## Drift phát hiện
_(chưa có)_
