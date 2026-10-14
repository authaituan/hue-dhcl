# 🗑️ SANLUONG-5g-0 — Khảo sát: xóa dữ liệu hàng đến của một BCVH trong một ngày để nạp lại («Thay thế»)

> Chỉ đọc mã và tài liệu; không chạy gì ngoài `git`/`grep`, không mở DB, không mạng. Cơ sở: nhánh sau PR #44 (`958993a`, hẹn giờ SFTP 5e đã merge).
> Mọi **số đo/ước tính** là suy ra từ cỡ dữ liệu trong tài liệu, KHÔNG phải số đo trên DB thật («chưa chắc» khi vậy). Không có số hiệu bưu gửi/BD10/BD8 trong file này.
> `file:dòng` là bằng chứng; thấy trực tiếp trong mã = **[chắc]**, suy luận = **[đoán]**.

## 0. Tóm tắt
1. **Làm được**, nhưng đơn vị xóa an toàn là **tập file (đợt nạp) của một BCVH theo `file_date`**, KHÔNG phải `arrival_date` của dòng: file nguồn SFTP phủ **cửa sổ giờ** (sáng ≈ 15:00 hôm trước → 09:30; chiều ≈ 09:30 → 15:00–16:30), nên ngày đến D nằm ở file D (sáng + chiều) **và một phần ở file sáng D+1**; file nhập tay `_235959` thì ngược lại (cả ngày D trong một file D).
2. **Rủi ro lớn nhất:** (a) mất dữ liệu chỉ có trong file nhập tay mà file SFTP không có (không phát hiện được nếu không so trước); (b) **thay thế không nguyên khối** nếu cứ «xóa rồi gọi importer» — importer hiện chỉ có một hàm gộp (đọc CSV bất đồng bộ + ghi đồng bộ), giữ giao dịch qua `await` sẽ chặn cả máy chủ; muốn nguyên khối phải **tách importer** thành «chuẩn bị» (async) và «ghi» (sync).
3. **Phát hiện đáng chú ý:** nạp lại **không bao giờ cập nhật** dòng đã có (`INSERT OR IGNORE` theo khoá không chứa các mốc xác nhận) — nên dòng cũ sai/thiếu mốc chỉ sửa được bằng xóa rồi nạp (đây là lý do thật của nhu cầu).
4. **Phụ thuộc:** trạng thái phát (`phat_status_*`) gắn theo SHBG, **không có khoá ngoại**, nên không chặn xóa, tự nối lại khi nạp lại; chỉ số (PTC, mẫu số) đổi → cần cảnh báo. Khoá ngoại duy nhất liên quan: `arrival_items.import_file_id → arrival_import_files.id` (không CASCADE) nên phải xóa dòng trước, rồi mới xóa bản ghi file.
5. **Khuyến nghị:** «Thay thế đợt» theo (BCVH, ngày file) — xem trước chênh lệch, lưu bản chụp các dòng bị xóa trong chính DB (bảng thùng rác) + sao lưu `db.backup()` tùy chọn, một giao dịch đồng bộ sau khi file mới đã tải + kiểm tra, xác nhận gõ lại, chỉ ADMIN, ghi `SECURITY_LOG`, khóa chung với đồng bộ SFTP. Chia 5 ticket (mục 7.5).

## 1. Đã có gì để xóa / làm sạch dữ liệu hàng đến
| Chức năng | Nơi | Đơn vị xóa | Ai gọi | Nhật ký |
|---|---|---|---|---|
| **`scripts/reset-arrivals.js`** (SANLUONG-3i, dev) | `scripts/reset-arrivals.js:25-52` (`ARRIVAL_TABLES = arrival_items, arrival_import_files`; đặt lại `sqlite_sequence` của `arrival_import_files`); mô tả `04_DECISIONS.md:461-463` (#64), `06_DEPLOYMENT.md:116-130` (mục 9) | **CẢ HAI BẢNG** (mọi BCVH, mọi ngày), một giao dịch | Người có quyền chạy lệnh trên máy chủ + DB (PO); mặc định chạy thử, `--apply` mới xóa; yêu cầu tắt app + sao lưu thủ công | Chỉ in ra màn hình (số dòng); **không** có `SECURITY_LOG` |
| `scripts/rederive-arrival.js` | `scripts/rederive-arrival.js:45` | **Không xóa**: `UPDATE arrival_items` (tính lại `arrival_at/basis/date` theo R2, #59) | PO, CLI | màn hình |
| Importer | `server/lib/arrivalsImport.js:332-344` (`recordFile`: upsert), `:410-421` (`INSERT OR IGNORE`) | Không xóa | script / lõi SFTP | `arrival_import_files` (không phải nhật ký xóa) |
| Xóa tài khoản/mạng lưới/widget/bản kiểm tra phát | `routes/network.js:273`, `routes/dashboardWidgets.js:225`, `lib/phat.js:126-127, 299-300, 470` | Bảng khác, không phải hàng đến | các vai trò tương ứng | một số có `audit` |
| **Hủy đợt nhập phát** (PHAT-2b) | `lib/phat.js:927` (`DELETE FROM phat_status_current WHERE bcvh=? AND shbg=?` trong `hoanTacDot`) | Chỉ `phat_status_current` theo (BCVH, SHBG) của một đợt phát; **không đụng** bảng hàng đến | ADMIN, TTVH, người nhập | `phat_status_history` + `audit(...)` ở route |
| Seed mạng lưới | `scripts/import-seed.js:22, 100` (`TABLES = province/commune/post_offices/users`) | Không phải hàng đến | PO, CLI | màn hình |
| Endpoint | `routes/arrivals.js`: **toàn bộ là GET** (không có `router.post/put/patch/delete`) | — | — | — |
**Kết luận mục 1 [chắc]:** hiện **không có** cách xóa theo ngày/BCVH/đợt nào ngoài SQL tay; cách duy nhất có sẵn là xóa sạch cả hai bảng (dev). Không có API xóa, không có nhật ký xóa.

## 2. Lược đồ
- **`arrival_import_files`** (`arrivalsImport.js:53-73`): `id` PK AUTOINCREMENT; `unit_code`, `file_name`, `file_date`, `file_time`, `file_size`, `sha256`, `row_count`, `inserted_count`, `ignored_duplicate_count`, `status` CHECK **`('OK','EMPTY','REJECTED','CONFLICT')`** (`:64`), `error`, `warning`, `source` CHECK `('MANUAL','SFTP')` (`:67`), `imported_at`. Duy nhất: `UNIQUE(file_name, sha256)` (`:69`) và `ux_arrival_files_accepted` = một bản `OK/EMPTY` cho mỗi `file_name` (`:72`); chỉ mục `(unit_code, file_date)` (`:73`).
- **`arrival_items`** (`:75-102`): `id INTEGER PRIMARY KEY` — **không AUTOINCREMENT** (id có thể bị dùng lại sau khi xóa các dòng có id lớn nhất; xem mục 6); **`import_file_id NOT NULL REFERENCES arrival_import_files(id)`** (`:77`, không `ON DELETE`); `receiver_code` (BC nhận, **từ nội dung** cột `BC_nhan_BG`, `:19, 79`), mốc `bag/item/bd10/bd10_ttkt_confirmed_at`, `arrival_at/basis/date`, `arrival_evidence_count`, `bag_date/bd10_date/item_date`, `ward_key`… Khoá duy nhất dòng `ux_arrival_items_key (tracking_no, bd10_no, bd8_no, COALESCE(item_confirmed_at,''))` (`:104-105`) — **không chứa `receiver_code`, ngày hay file**. Chỉ mục có `(receiver_code, arrival_date)` (`:107`) và **`(import_file_id)`** (`:114`) → xóa theo đợt/ngày đều dùng chỉ mục.
- Liên quan: `ward_bdx_map` (`:116-122`, REFERENCES `commune_post_offices`, không đổi khi xóa), `sftp_sync_runs/sftp_sync_files/sftp_source_files` (`sftpSync.js:22-62`; `sftp_sync_files.run_id` FK tới `sftp_sync_runs`, **không** có FK tới hàng đến, chỉ lưu tên file bằng chữ).
- **Khoá ngoại bật** [chắc]: better-sqlite3 mặc định `foreign_keys = ON` (`routes/network.js:264-275` dựa vào đó). Hệ quả: `DELETE FROM arrival_import_files` khi còn dòng trỏ vào → lỗi `SQLITE_CONSTRAINT_FOREIGNKEY`; phải xóa `arrival_items` trước (đúng thứ tự `reset-arrivals.js:24-25`).
- **Dòng thuộc BCVH nào:** hai khái niệm KHÔNG ép bằng nhau — `arrival_import_files.unit_code` = mã **trong tên file** (`parseFileName`, `arrivalsImport.js:180-189, 371`), còn `arrival_items.receiver_code` = cột **nội dung** `BC_nhan_BG`. Importer không so hai giá trị (test 5c-1 ghi nhận: `tests/sftp-sync.test.js` ca «ghi nhận hành vi importer»). Mọi truy vấn số liệu lọc theo `receiver_code` (`arrivalsQuery.js:217-219`); «hôm nay» và `getMissingBatches` theo `unit_code` (`arrivalsQuery.js:292-294`, `arrivalsImport.js:454-475`). Bình thường hai giá trị trùng nhau [đoán], nhưng thiết kế xóa phải **kiểm** (đếm dòng trong tập file có `receiver_code ≠ unit_code`).
- **«Ngày đến BCVH» nào:** `arrival_date` = 10 ký tự đầu của `arrival_at` = mốc **đầu tiên không rỗng** theo thứ tự XN túi → XN bưu gửi → XNĐ BD10 (quy tắc R2, #59; `deriveArrival` `arrivalsImport.js:232-246`, `ARRIVAL_SOURCES` `:40`). Giờ là **giờ địa phương không đổi múi** (`parseDateTimeCell` `:157-172`, chú thích «KHÔNG đổi múi giờ»); lưu `TEXT 'YYYY-MM-DD HH:MM:SS'`. Dòng **không có mốc nào** → `arrival_date = NULL` (`:240-244`): dòng chỉ gắn với ngày **của file** (`file_date`), dùng cho «chưa nhận tại BCVH» (`arrivalsQuery.js:275-282`, `:401-403`).
- **Mỗi dòng trỏ về đợt nạp:** có — `import_file_id NOT NULL`.

## 3. Quan hệ dòng ↔ file (điểm mấu chốt)
1. **Dòng trùng nằm ở file nạp ĐẦU.** `INSERT OR IGNORE` (`arrivalsImport.js:410, 416`): dòng trùng khoá bị bỏ qua, dòng cũ giữ `import_file_id` của file đã nạp trước; file sau chỉ ghi `ignored_duplicate_count` (`:418`). Mẫu 9 file đầu: khoá đầy đủ trùng giữa các file = 0 (`07_SANLUONG_AUDIT.md:68-80` bảng «Khoá & trùng lặp»), 50 SHBG xuất hiện ở ≥ 2 file nhưng luôn khác thời gian XN (đến lại, hợp lệ) — tức file SFTP **không chồng lấn** nhau.
2. **Nạp lại KHÔNG cập nhật.** Khoá không chứa các mốc xác nhận (chỉ `item_confirmed_at`), nên bản xuất mới của cùng dòng (đã có `Ngay_gio_XND_BD10` hay XN túi) bị **bỏ qua**; dòng cũ giữ nguyên mốc cũ. Đây là lý do thật của «xóa rồi nạp». [chắc]
3. **Cửa sổ giờ của file SFTP.** Theo mẫu 04–08/10: file sáng = XN BG từ ≈ 15:00 hôm trước → 09:30; file chiều = 09:30 → 15:00–16:30; **không chồng lấn**; hàng 15:00–24:00 của ngày D nằm trong **file sáng D+1** (`07_SANLUONG_AUDIT.md:81-95` bảng cửa sổ + dòng «Ranh giới thực tế»). Kiểm tra hợp lý khi nạp: `arrival_date ∈ [file_date − 3, file_date + 1]` (`arrivalsImport.js:42-44, 396-406`). → **Có**: dòng ngày đến D nằm trong file D+1; dòng ngày D−1 nằm trong file D.
4. **File nhập tay `_235959`** (do `scripts/split-arrivals-csv.js`): «ngày trong tên = ngày đến của các dòng trong file đó» (`scripts/split-arrivals-csv.js:3-8`, `04_DECISIONS.md:456`); dòng không có mốc nào xếp vào ngày cuối cùng. Giờ trong tên mặc định `235959` (`--time` đổi được — **chưa chắc** là mọi file nhập tay đều dùng `235959`).
5. **Hệ quả cho thiết kế:**
   - Xóa theo **(BCVH, `arrival_date = D)`** (dòng theo ngày): lại bỏ sót dòng `arrival_date NULL`, để mồ côi các bản ghi file (mất cân đối với `row_count`), và **không có tập file nào để nạp lại tương ứng** (D nằm rải trên file D, D+1 sáng, và có thể file nhập tay). → **Không khuyến nghị.**
   - Xóa theo **tập file** `S(X, D) = { file của đơn vị X có file_date = D }` (cả file SFTP sáng/chiều lẫn `_235959`): xóa toàn bộ dòng có `import_file_id ∈ S` rồi xóa các bản ghi file ∈ S rồi nạp lại **đúng các file thay thế**. Dòng ngày D−1 (phần chiều tối trong file D sáng) sẽ được thay bằng chính file D sáng mới → nhất quán; phần tối của D (nằm trong file D+1 sáng) **không bị đụng** (giữ nguyên nếu đã nạp). Không mất/trùng dòng với điều kiện tập file thay thế **đủ** (sáng + chiều của ngày D).
   - Dòng của S bị trùng-bị-bỏ-qua trước đây (đang thuộc file ∉ S, ví dụ file `_235959` của D−1) vẫn ở lại → nạp lại sẽ **tiếp tục bỏ qua** các dòng ấy (vẫn đúng, không nhân đôi).

## 4. Phụ thuộc khi xóa dòng hàng đến
| Nơi tham chiếu | Cách tham chiếu | Khi xóa dòng | Đề xuất |
|---|---|---|---|
| `phat_status_current/history` | khoá `(bcvh, shbg)` — **không FK**, **không** gắn ngày (`lib/phat.js:51-74`) | Không lỗi; trạng thái ở lại; mất liên kết tạm thời, **tự nối lại** khi nạp lại SHBG đó. Mẫu số theo ngày (`demNgay` dùng `buildCountedCte`) đổi → PTC/mức cập nhật đổi (thêm SHBG = tỷ lệ «chưa có TT» tăng) | **Không chặn.** Xem trước: số trạng thái phát gắn với SHBG sắp xóa (`SELECT COUNT(*) … shbg IN (SHBG bị xóa)`), số SHBG mới/mất sau thay |
| Kiểm bản kiểm tra phát | `KHONG_CO_TRONG_DEN` kiểm lúc tải lên/nhập (`lib/phat.js:209-210, 245-246`) | Bản kiểm tra đang mở có thể báo lại «không có trong dữ liệu đến» ở lần kiểm tra lại; không hỏng dữ liệu | Cảnh báo nếu có bản kiểm tra `dang_mo` của BCVH đó |
| `ngayLienQuan` (kết quả «trước/sau» của nhập/hoàn tác) | `lib/phat.js:667-672`, dùng ở `:715, :922` | Nếu SHBG không còn dòng đến → danh sách ngày rỗng; không lỗi | Không cần xử lý |
| BD10 / chưa nhận | `lib/bd10Query.js:36, 143, 229`, `arrivalsQuery.js:275-282` (dùng `file_date` của đợt) | Tính lúc truy vấn → tự đúng sau xóa; nhưng «chưa nhận» phụ thuộc `file_date` của các file còn lại | Xem mục 6 |
| Hàng «đi ngoài» | `DI_NGOAI_SQL` (`arrivalsQuery.js:32-33`) xét **mọi dòng cùng SHBG, mọi ngày** | Xóa dòng ngày D có thể đổi cờ «đi ngoài» của SHBG còn dòng ở ngày khác | Chấp nhận (số nhỏ); nạp lại khôi phục |
| Tivi | chỉ gọi 3 API dashboard (`lib/tivi.js:13-18`), không lưu bảng | Tự đúng | — |
| `sftp_source_files` / `sftp_sync_files` | tên file bằng chữ, không FK tới hàng đến (`sftpSync.js:22-62`) | Sau xóa, file hiện «nguồn có file, chưa nạp» (join `arrival_import_files`) — đúng ý | Xem mục 5 |
| Bảng tạm / tổng hợp | **Không có** bảng tổng hợp hay cache bền | — | — |
**Khoá ngoại/cascade:** chỉ một FK liên quan, **không cascade** (mục 2). Không có `ON DELETE`. Không có trigger [chắc: không thấy `CREATE TRIGGER` trong `server/`].

## 5. Nhập lại sau khi xóa: xử lý dòng `arrival_import_files`
| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Xóa hẳn dòng file ∈ S (khuyến nghị)** | Không cần đổi lược đồ; mọi tên file lại «chưa từng nạp» → `importArrivalFile` và `syncSftpOnce` nạp lại bình thường; `getMissingBatches` (`arrivalsImport.js:454-475`) tự báo thiếu đợt cho ngày D đến khi nạp lại; chống trùng `(file_name, sha256)` (`:69`) và `ux_arrival_files_accepted` (`:72`) không cản | Mất lịch sử nạp của những file đó (bù bằng bảng thùng rác + `SECURITY_LOG`, mục 7) |
| B. Đổi `status` sang giá trị mới (`CANCELLED`) | Giữ vết trong cùng bảng | **Không khả thi nhẹ:** `status` có `CHECK(... 4 giá trị)` (`:64`) — SQLite không sửa CHECK tại chỗ, phải dựng lại bảng (di trú lớn, `arrival_items` có FK tới nó). Và hàng `CANCELLED` còn `UNIQUE(file_name, sha256)` (`:69`): nạp lại file giống hệt → `recordFile` upsert (`:338-343`) đè lên dòng cũ — chạy được nhưng trộn lịch sử |
**Ảnh hưởng tới các chỗ dùng:** (a) lõi SFTP kiểm «đã có» bằng `file_name` + `OK/EMPTY` (`sftpSync.js:281, 296`) → sau A thì file ∈ S thành «chưa có» → được nạp (nếu đủ «ổn định», bảng `sftp_source_files`); (b) **cũng phải xóa/bỏ qua bản ghi `REJECTED/CONFLICT` cùng tên** của các file ∈ S, nếu không `tuChoiStmt` (`sftpSync.js:282, 307-310`) sẽ chặn nạp lại bằng `DA_TU_CHOI` khi kích thước giống; (c) `getMissingBatches` tính theo `OK/EMPTY` nên đúng; (d) «hôm nay» của BCVH = `MAX(file_date)` của file `OK` (`arrivalsQuery.js:292-294`): xóa các file của ngày mới nhất làm «hôm nay» **lùi về ngày trước** cho đến khi nạp lại (Dashboard hiển thị ngày cũ); các mốc «hôm qua/tuần trước» dùng `file_date` (`dashboardDenQuery.js:84-88`) → `null` khi thiếu.
**Đề xuất:** phương án A; xóa cả `REJECTED/CONFLICT` cùng `file_name` của S.

## 6. Dashboard / số liệu phái sinh sau xóa
- **Không có bảng tổng hợp hay cache bền**: mọi chỉ số tính lúc truy vấn từ `arrival_items` (xem `00_SNAPSHOT.md` mục 6). Hai chỗ nhớ trong bộ nhớ:
  1. `bd10Share` (`arrivalsQuery.js:698-710`) nhớ theo `(COUNT(*), MAX(id))` của `arrival_items`. Vì `id` **không AUTOINCREMENT**, nếu xóa các dòng có id lớn nhất rồi nạp lại **đúng bằng số đó** thì `(n, mx)` có thể trùng → giá trị cũ còn lại (chỉ là tỷ lệ ghi chú tiêu chí `bd10`, tác động nhỏ). **Đề xuất:** bỏ memo này hoặc thêm `MAX(import_file_id)`/`imported_at` vào khoá khi làm ticket xóa.
  2. `prepareHomeFunction` (`arrivalsQuery.js:85-94`) nhớ danh sách tỉnh «nhà» theo từng lần gọi — không phụ thuộc dòng.
- `ton_cho` của phát (`lib/phat.js tonCho`) tính lúc truy vấn → tự đúng.
- `ward_bdx_map`: bản ghi phường/xã đã thêm ở lần nạp trước **không bị xóa** (không đổi, không hại).
- DB **không tự nhỏ lại** sau xóa (trang rảnh trong tệp); `VACUUM` tùy chọn, không cần.
- Máy chủ đang chạy: không cần khởi động lại; màn hình tự đổi ở lần tải kế tiếp (Dashboard 60 giây).

## 7. Đề xuất thiết kế an toàn (chưa làm)
### 7.1 Đơn vị và hình dạng thao tác
**«Thay thế đợt»** cho đúng MỘT cặp (BCVH X, ngày file D): tập `S(X, D)` = mọi `arrival_import_files` có `unit_code = X` và `file_date = D` (mọi `status`, mọi `source`). Một lần chỉ 1 BCVH × 1 ngày.

### 7.2 Luồng nguyên khối «kiểm tra file mới → xóa → nạp»
1. **Xem trước (không ghi)**: liệt kê `S` (tên, nguồn MANUAL/SFTP, số dòng, SHBG khác nhau); đếm dòng `arrival_items` sẽ xóa theo `import_file_id ∈ S` và chia theo `arrival_date`; đếm dòng `receiver_code ≠ X`; đếm trạng thái phát gắn với các SHBG đó; **tải các file thay thế từ SFTP** (tên theo ngày D: sáng + chiều; xem 7.4) vào thư mục tạm, phân tích (không ghi) → với mỗi `arrival_date`: số dòng/số SHBG **cũ vs mới**, số SHBG **chỉ có ở bản cũ** (rủi ro mất), số SHBG chỉ có ở bản mới.
2. **Chặn** nếu: thiếu file thay thế (chưa đủ sáng + chiều), file mới không hợp lệ (header, khoảng ngày), có lượt đồng bộ SFTP đang chạy (khoá DB), hoặc chênh lệch vượt ngưỡng (vd số SHBG mới < 90 % cũ) mà ADMIN chưa tích «tôi hiểu sẽ mất dòng».
3. **Xác nhận**: ADMIN gõ lại **mã BCVH và ngày**.
4. **Sao lưu**: `db.backup(đường-dẫn)` của better-sqlite3 (sao lưu trực tuyến, **bất đồng bộ**, không giữ khoá ghi dài) vào `data/backup/` HOẶC `VACUUM INTO` (đồng bộ, chặn cả máy chủ trong lúc chạy). Ước tính **chưa đo**: audit ước 0,5–0,7 GB/năm/đơn vị (`07_SANLUONG_AUDIT.md:133`), nên DB đủ 6 BCVH sau một năm vài GB → sao chép toàn DB vài giây đến vài chục giây trên NAS — **không nên bắt buộc mỗi lần**. Rẻ hơn và đủ cho «hoàn tác»: bước 5.
5. **Một giao dịch ĐỒNG BỘ** (`db.transaction(...).immediate()`, sau khi mọi file mới đã được đọc + kiểm tra **trong bộ nhớ**): (a) sao chép các dòng sắp xóa vào bảng thùng rác `arrival_items_da_xoa` / `arrival_import_files_da_xoa` (cùng cột + `lo_xoa_id`, `xoa_luc`, `xoa_boi`) ; (b) `DELETE FROM arrival_items WHERE import_file_id IN (S)`; (c) `DELETE FROM arrival_import_files WHERE id IN (S)` và các `REJECTED/CONFLICT` cùng `file_name`; (d) ghi các file mới + dòng mới (cùng logic ghi như importer, `source = 'SFTP'`); (e) một dòng nhật ký xóa. Lỗi bất kỳ → rollback, dữ liệu cũ nguyên vẹn.
6. **Sau commit**: ghi `SECURITY_LOG` (`event: 'arrivals_delete_day'`, user, BCVH, ngày, số dòng xóa/nạp, số SHBG chênh; theo mẫu `arrivals_export`, `routes/arrivals.js:141-143`), trả bảng so sánh cho giao diện.

### 7.3 Vì sao phải tách importer (điều kiện kỹ thuật)
`importArrivalFile` (`arrivalsImport.js:364-429`) vừa đọc CSV bất đồng bộ (`readCsvRecords` `:192-203`) vừa ghi trong `db.transaction` đồng bộ (`:412-421`), và **tự bắt lỗi rồi ghi `REJECTED` ngoài giao dịch** (`:424-428`). Không thể «mở giao dịch → xóa → `await importArrivalFile`» vì (i) mọi request dùng **một kết nối DB duy nhất** nên giao dịch mở qua `await` sẽ kéo cả các request khác vào trong nó; (ii) lỗi nạp vẫn để lại bản ghi REJECTED. → Cần ticket **tách** thành `chuanBiFile(path)` (async, trả `{meta, items, warning}` hoặc ném lỗi) và `ghiFileDaChuanBi(db, prepared)` (sync, trong giao dịch của người gọi — better-sqlite3 hỗ trợ giao dịch lồng nhau bằng savepoint); `importArrivalFile` giữ hành vi hiện tại bằng cách gọi hai hàm này (có test hồi quy). **Đây là thay đổi importer — cần PO cho phép rõ.** Phương án không sửa importer (xóa rồi nạp tuần tự, khôi phục từ bản chụp nếu lỗi) **không nguyên khối**.

### 7.4 Tập file thay thế
Với ngày file D của BCVH X: các file SFTP có `file_date = D` (sáng ≈ 09:30 và chiều ≈ 15:00–16:30; giờ lệch 1 giây giữa lần — không so giờ chính xác, `07_SANLUONG_AUDIT.md:22`). Chỉ cho phép khi `D < hôm nay` (ngày chưa kết thúc thì file chiều chưa có đủ) **hoặc** khi tìm thấy ≥ 2 file ổn định (`sftp_source_files`). Các file `_235959` cũ nằm trong `S` bị xóa **và không nạp lại** (thay bằng 2 file SFTP). Số file kỳ vọng mỗi ngày: PO đã chốt «2 file/ngày» (`04_DECISIONS.md:106`, #17); riêng chiều Chủ nhật có thể chỉ có BOM (`EMPTY`).

### 7.5 Chia ticket (một mục tiêu mỗi ticket) và thứ tự
| # | Ticket | Nội dung | Phụ thuộc |
|---|---|---|---|
| 1 | **5g-1 Tách importer** | `chuanBiFile` + `ghiFileDaChuanBi`, `importArrivalFile` giữ nguyên hành vi; test hồi quy | PO cho phép sửa importer |
| 2 | **5g-2 Xem trước chênh lệch (chỉ đọc)** | Hàm + API ADMIN: `S`, số dòng/SHBG theo `arrival_date`, dòng `receiver_code ≠ unit_code`, trạng thái phát bị ảnh hưởng, so sánh với file SFTP tải tạm (không ghi) | 5g-1 (dùng `chuanBiFile`) |
| 3 | **5g-3 Thay thế đợt** | Giao dịch nguyên khối 7.2(5), bảng thùng rác, khoá chung với đồng bộ SFTP, `SECURITY_LOG`, giới hạn 1×1 | 5g-1, 5g-2 |
| 4 | **5g-4 Giao diện ADMIN** | Màn «Nạp dữ liệu nguồn»: nút «Thay thế» (gõ lại mã + ngày), bảng chênh lệch | 5g-3, màn quản trị nạp |
| 5 | **5g-5 Hoàn tác từ thùng rác + dọn** | Khôi phục một lô từ bảng thùng rác; dọn sau N ngày; sửa `bd10Share` memo | 5g-3 |
Thứ tự: 5g-1 → 5g-2 → 5g-3 → 5g-4 → 5g-5. «Thay thế» chỉ ADMIN (`requireAdmin`, `server/auth.js:148`); khoá với đồng bộ: dùng chung `batDauLuot`/`luotDangChay` (`sftpSync.js:161-183`) — **lưu ý** cột `trigger` có `CHECK ('MANUAL','TIMER')` nên lượt «thay thế» phải ghi là `MANUAL` kèm ghi chú (hoặc ticket mở rộng CHECK).

## 8. Dữ liệu nhập tay cũ (`_235959`)
- **Truy được:** có — dòng → `import_file_id` → `arrival_import_files` (`file_name` kết thúc `_235959`, `file_time = '23:59:59'`, `source = 'MANUAL'` khi nạp bằng `scripts/import-arrivals.js`, vốn không truyền `source`). `unit_code` và `file_date` có sẵn; `arrival_date` của dòng chính là ngày trong tên (do script tách chọn theo R2). *Lưu ý:* file SFTP nạp tay bằng `import-arrivals.js` cũng có `source = 'MANUAL'`; muốn phân biệt phải dùng mẫu giờ/tên. **Chưa chắc** trên DB thật.
- **«Thay thế ngày D của BCVH X» xóa những gì:** mọi dòng thuộc `S(X, D)` — tức dòng của file `_235959` ngày D **và** dòng của các file SFTP sáng/chiều ngày D nếu đã nạp (kể cả phần chiều tối ngày D−1 trong file sáng D). **Không** xóa dòng của file D+1 (phần tối ngày D nằm ở đó). Nạp lại: hai file SFTP ngày D.
- **Rủi ro mất dữ liệu mà file SFTP không có [thật]:**
  1. Dòng chỉ có trong file `_235959` (script xuất khác nhau cho khung ngày; dòng không có mốc xếp vào «ngày cuối cùng»; dòng chiều tối D nếu file D+1 sáng chưa nạp);
  2. Dòng `arrival_date NULL` của file nhập tay (chưa nhận tại BCVH) có thể khác với file SFTP;
  3. Dòng nằm đúng cửa sổ giờ của file D nhưng thuộc ngày D+1 theo R2.
- **Cách phát hiện và cảnh báo:** trước khi xác nhận, hiển thị (không in số hiệu) — theo `arrival_date`: dòng/SHBG cũ vs mới; **số SHBG chỉ có ở bản cũ** (và cho ADMIN tải danh sách `.xlsx` qua đường xuất sẵn có `arrivalsExport`); số dòng `arrival_date NULL` cũ vs mới; cảnh báo đỏ nếu SHBG mới < ngưỡng cũ; bắt buộc tích «đồng ý mất N SHBG». Luôn lưu bản chụp các dòng bị xóa (7.2 bước 5a) để hoàn tác.
- **Giao dịch nguyên khối:** như 7.2(5) — file mới được đọc + kiểm tra trước; chỉ khi **tất cả** file thay thế hợp lệ mới vào giao dịch xóa + ghi.

## 9. Câu hỏi mở cho PO
1. **Đơn vị «ngày»:** PO nghĩ theo `file_date` (hai file/ngày) hay theo ngày đến của dòng (`arrival_date`)? Khuyến nghị `file_date` (mục 3). Phần chiều tối ngày D ở file D+1 sáng có cần được «thay» cùng không (khi đó thao tác trở thành «thay hai ngày file»)?
2. **Tập file thay thế:** luôn đúng 2 file SFTP/ngày/BCVH? Quy tắc khi thiếu file chiều (Chủ nhật BOM-only; ngày chưa kết thúc)? Có cho thay thế khi mới có file sáng không?
3. **File nhập tay `_235959`** nạp bằng cách nào (script, `source`)? Đã nạp bằng `import-arrivals.js` hay còn nguồn khác? Mọi file nhập tay dùng giờ `235959`? (để nhận diện chính xác).
4. **Chấp nhận mất dòng:** nếu có SHBG chỉ có trong bản cũ, mặc định chặn hay cho phép sau khi tích xác nhận? Ngưỡng cảnh báo (đề xuất 90 %)?
5. **Sao lưu:** bắt buộc `db.backup()` toàn DB mỗi lần (tốn thời gian/dung lượng) hay đủ bảng thùng rác + sao lưu định kỳ? Giữ thùng rác bao lâu (đề xuất 90 ngày)? Dung lượng ổ NAS còn bao nhiêu?
6. **Phát:** có chặn thay thế khi ngày D đã có trạng thái phát (đề xuất: không chặn, chỉ cảnh báo vì trạng thái gắn theo SHBG và tự nối lại)? Có cần chụp lại PTC trước/sau?
7. **Sửa importer** (tách «chuẩn bị»/«ghi») có được phép không (mục 7.3)? Nếu không: chấp nhận thao tác KHÔNG nguyên khối (xóa rồi nạp tuần tự, khôi phục từ bản chụp nếu lỗi)?
8. **Dòng `receiver_code ≠ unit_code`:** có tồn tại trong DB thật không? Nếu có, «xóa theo file» hay «theo BCVH nhận» mới đúng ý PO?
9. **Quyền:** chỉ ADMIN; có cần thêm bước nhập lại mật khẩu? Ai nhận nhật ký xóa (chỉ `SECURITY_LOG`)?
10. **Giới hạn:** 1 BCVH × 1 ngày mỗi lần có đủ cho việc dọn lịch sử nhiều ngày (vd 10/10 và các ngày cũ khác) hay cần chế độ nhiều ngày?
11. **Cột `status`:** chấp nhận xóa hẳn bản ghi file (phương án A) thay vì giữ vết `CANCELLED` (cần di trú bảng)?

## 10. Điều chưa chắc
- Kích thước DB thật, số dòng mỗi ngày của từng BCVH (chỉ 533140 có dữ liệu), thời gian sao lưu/xóa trên NAS — chưa đo.
- Giờ xuất file SFTP và cửa sổ giờ chính xác của 5 BCVH còn lại (suy từ mẫu 04–08/10 của BCVH 533140).
- Có tồn tại dòng `receiver_code ≠ unit_code` trong DB thật hay không.
- Nhận diện file nhập tay `_235959` chỉ bằng tên/giờ; chưa kiểm cột `source` thật.
- Giao dịch lồng nhau của better-sqlite3 (savepoint) khi gọi hàm ghi của importer trong giao dịch ngoài — mô tả từ tài liệu thư viện, chưa thử trong repo.
