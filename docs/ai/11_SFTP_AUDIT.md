# 🔌 SANLUONG-5a — Khảo sát: lấy dữ liệu nguồn tự động qua SFTP

> Chỉ đọc mã và tài liệu, không viết code, không kết nối SFTP / mạng, không mở DB, không đọc `.env`. Cơ sở: nhánh hiện tại sau PR #39 (`605fe40`).
> Mọi **số thời gian chạy** dưới đây là **ước tính từ cỡ dữ liệu trong tài liệu**, KHÔNG phải số đo («chưa chắc» khi vậy). Không có số hiệu bưu gửi / BD10 / BD8 trong file này.
> Đường dẫn dạng `file:dòng` là bằng chứng; thấy trực tiếp trong mã = **[chắc]**, suy luận = **[đoán]**.

## 0. Tóm tắt
1. **Đã có**: lõi nạp một file CSV không phụ thuộc Express (`importArrivalFile(db, đường-dẫn, {source})`), chống nhập trùng theo (tên file, sha256), ghi lịch sử mỗi file vào `arrival_import_files` (có sẵn giá trị `source = 'SFTP'`), tìm ngày thiếu đợt (`getMissingBatches`), API trạng thái nạp chỉ ADMIN (`/arrivals/import-status`).
2. **Chưa có**: bất kỳ mã SFTP nào (không thư viện, không biến môi trường, không bộ hẹn giờ — `server/` không có `setInterval`/cron), bảng theo dõi «lần lấy», giao diện «lần lấy gần nhất», quy tắc «file đang ghi dở».
3. **Dữ liệu phát KHÔNG nên tự nhập thẳng** ở bước đầu: nhập phát hiện là hành động của người (có `user_id`, hoàn tác theo người), chưa biết nguồn nào có trạng thái phát; khuyến nghị khảo sát riêng (PHAT-4).
4. **Giới hạn quan trọng**: tự lấy file chỉ bỏ độ trễ do người nhập; **độ tươi vẫn bị chặn bởi giờ hệ thống nguồn xuất file** (mẫu 08/10: chỉ ~2 file/ngày, khoảng 09:30 và 15:00–16:30 — `07_SANLUONG_AUDIT.md:12-22`). Muốn Dashboard sát thực tế hơn phải đổi tần suất xuất ở nguồn.
5. **Khuyến nghị**: mô-đun dùng chung + tác vụ nền trong tiến trình Node (mặc định tắt, bật bằng biến môi trường) + lệnh dòng lệnh cho nạp lịch sử và thử kết nối. Chia 5 ticket nhỏ (mục 6.5).

## 1. Importer hiện có
| Hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Đọc từ đâu | **Đường dẫn file cục bộ**. Không có tải lên qua giao diện, không có API nạp. Hai đường vào: dòng lệnh `scripts/import-arrivals.js <file.csv \| thư-mục>` và hàm lõi | `server/lib/arrivalsImport.js:364-370` (`fs.readFileSync(filePath)`, `readCsvRecords(filePath)` `:192-203`); `scripts/import-arrivals.js:83-91`; không có route nạp trong `server/routes/arrivals.js` (chỉ đọc + `/import-status`) |
| Gọi được không cần Express | **Có**. `importArrivalFile(db, filePath, { source = 'MANUAL' })` nhận handle `better-sqlite3` + đường dẫn; trả `{ fileName, status, … }`. `source: 'SFTP'` đã được cột chấp nhận. Còn `importArrivalDirectory(db, dir, opts)` nạp tuần tự theo (ngày, giờ) trong tên | `arrivalsImport.js:364`, `:431-444`, ràng buộc `:67`; comment «dùng chung cho nạp tay và đồng bộ SFTP sau này» `:3` |
| Không nhận bộ đệm | Hàm **chỉ nhận đường dẫn** → tác vụ nền phải tải file về tệp tạm rồi gọi (hoặc ticket sau bổ sung nhận `Buffer`) | `:369`, `:201` |
| Định dạng | CSV UTF-8 (có/không BOM), tên `HangDen_<mã BC nhận>_<yyyymmdd>_<hhmmss>.csv`, 16 cột, đọc cột **theo tên** (không phân biệt hoa/thường/dấu; cột lạ bỏ qua; cột bắt buộc thiếu → REJECTED), chữ `NULL` = ô rỗng, ngày giờ ISO / `T` / kiểu Mỹ | `:14`, `:17-35`, `:205-229`, `:162-172`, `:250` |
| Mã đơn vị | Lấy **từ tên file**, không viết cứng BCVH (đúng quyết định #19) → nạp được 6 BCVH khi có file | `:4`, `:180-189`; `04_DECISIONS.md:113` |
| Kiểm tra hợp lý | `arrival_date ∈ [ngày file − 3, + 1]`: > 1% ngoài khoảng → REJECTED cả file; ≤ 1% → cảnh báo, vẫn nạp | `:42-44`, `:396-406` |
| Chống nhập trùng (mức file) | Cùng tên + cùng sha256 đã `OK/EMPTY` → trả «đã nạp», không ghi gì. Cùng tên **khác nội dung** → `CONFLICT`, KHÔNG nạp (PO #16: từ chối + báo ADMIN) | `:373-381`; chỉ mục duy nhất `ux_arrival_files_accepted` `:72`; `UNIQUE(file_name, sha256)` `:69` |
| Chống nhập trùng (mức dòng) | `INSERT OR IGNORE` theo khoá (SHBG, BD10, BD8, giờ XN BG); nhập lại → 0 dòng mới. Test nạp thử 9 file: chạy lần 2 không thêm dòng | `:104-105`, `:410-416`; `07_SANLUONG_AUDIT.md` Phụ lục B |
| Một file = một giao dịch | Lỗi trong ghi → rollback; sau đó ghi bản ghi `REJECTED` (ngoài giao dịch) | `:412-421`, `:424-428` |
| Lịch sử nhập | Mỗi lần xử lý ghi/đè một dòng `arrival_import_files`: tên, mã đơn vị, ngày/giờ file, kích thước, sha256, số dòng, số nạp, số trùng bỏ qua, `status`, `error`, `warning`, `source`, `imported_at` | `:53-70`, `recordFile` `:332-344` (upsert theo tên + sha256, ghi lại `imported_at`) |
| Báo lỗi | Thông điệp chỉ có số dòng + tên cột, **không** nội dung dòng; lỗi hệ thống chỉ ghi mã (`Lỗi hệ thống: <code>`). Màn ADMIN xem được `problems` (REJECTED/CONFLICT) và `missing_batches` | `:6`, `:425`; `server/lib/arrivalsQuery.js:735-743`; `server/routes/arrivals.js:170-173`; `src/components/arrivals/ArrivalsView.jsx:227` |
| Đồng bộ hay không | Phần CSV là bất đồng bộ, **phần ghi DB là đồng bộ** (better-sqlite3): suốt giao dịch của một file, vòng lặp sự kiện của tiến trình bị giữ | `:412-421` |

**Các điểm vướng cho tác vụ tự động** (quan trọng):
- **Tệp ghi dở có thể thành `CONFLICT` vĩnh viễn.** Nếu lần lấy đầu thấy một file đang được hệ thống nguồn ghi (cắt đúng ranh dòng, vẫn đọc được) thì nó được nạp `OK`; lần sau file đầy đủ cùng tên khác sha256 → `CONFLICT` (`:373-381`) và **không nạp** nếu ADMIN chưa xử lý — dữ liệu thiếu mà không ai biết. Hiện chưa có chức năng «thay thế». → cần quy tắc «file ổn định» (mục 6.2) và/hoặc ticket «thay thế file có xác nhận».
- **File `REJECTED` bị phân tích lại mỗi lần.** Hàm chỉ chặn `OK/EMPTY` (`:373`); file hỏng nằm lại trong thư mục SFTP sẽ bị tải về + phân tích + ghi đè dòng `REJECTED` ở mỗi lượt thăm dò. → bộ thăm dò phải nhớ (tên, sha256) đã `REJECTED` hoặc đo lại theo `size/mtime`.
- **Lỗi tạm thời cũng thành `REJECTED`** (ví dụ ổ khoá DB: nhánh `Lỗi hệ thống: <code>` `:425`). Không chặn thử lại (vì không phải `OK/EMPTY`) nhưng sẽ xuất hiện trong `problems` của ADMIN (`has_accepted_version` cho biết đã được nạp sau đó — `arrivalsQuery.js:739`).
- **Đọc cả file vào bộ nhớ hai lần** (`readFileSync` + mảng bản ghi). Cỡ file mẫu 0,33–0,73 MB (`07_SANLUONG_AUDIT.md:12-22`) → không đáng lo; **chưa chắc** với file BCVH khác hoặc file lịch sử lớn.
- Lõi `getMissingBatches` dùng `localToday()` = múi giờ **của tiến trình** (`:449-452`); container đặt `TZ=Asia/Ho_Chi_Minh` (`Dockerfile:28`, `docker-compose.yml:20`) nên đúng; chạy ngoài container phải tự bảo đảm `TZ`.

## 2. Dữ liệu phát (module PHAT)
- **Hiện nay**: người dùng tải file mẫu `.xlsx` (mỗi SHBG một dòng) → điền trạng thái → tải lên tạo **bản kiểm tra** → sửa → **commit** (nhập từng phần) — `server/routes/phat.js:139-153`, `server/lib/phat.js:678` (`nhapDot`). Mỗi đợt mang `user_id` NOT NULL (`phat.js:34`), giờ nhập do máy chủ ghi (`nowIso`), hoàn tác theo ADMIN/TTVH/người nhập (`phat.js:910`, #78). Quyền nhập: ADMIN, TTVH, GDVH theo BCVH được giao (`routes/phat.js:43`).
- **Tự động hóa**: **về kỹ thuật làm được một phần** — lõi (`kiemTraLai`, `nhapDot`, `phat_status_history`) không cần giao diện, cột `gio_phat` đã chừa cho «nguồn tự động có giờ phát» (`phat.js:58`, `08_PHAT.md:12`). Nhưng **mã không trả lời được**: hệ thống nguồn có xuất file *kết quả phát* hay không, định dạng, mã trạng thái nguồn → 5 trạng thái (PTC, PKTC, Chuyển hoàn, Chưa có TT, Lạc hướng) ra sao. Khảo sát SFTP hiện chỉ có file «Hàng đến», không có file phát (`07_SANLUONG_AUDIT.md`).
- **Rủi ro nếu tự nhập trạng thái phát** (không cần người xác nhận):
  1. **Sai ánh xạ mã trạng thái** → PTC (chỉ số điều hành, thẻ màu của Dashboard) sai hàng loạt mà không ai thấy ngay; phải có «lần chạy thử» để người so với thực tế trước khi bật.
  2. **Ghi đè nhập tay**: trạng thái gắn (BCVH, SHBG), không gắn ngày (`phat.js:51-60`) → file nguồn có thể đè kết quả người đã sửa. Cần quy tắc ưu tiên (nguồn hay người) — PO quyết.
  3. **Hoàn tác**: một đợt tự động lớn có thể bị chặn hoàn tác khi đợt sau đổi cùng SHBG (`phat.js:910-920`, 409); cần cách «hủy cả lượt lấy».
  4. **Quyền / dấu vết**: `phat_batches.user_id` bắt buộc → cần tài khoản hệ thống không đăng nhập được (chưa có; **chưa chắc** cách tạo vì `users` yêu cầu `role` hợp lệ — `server/db.js:63-76`, `roles.js:18`); nhật ký phải ghi «tự động».
  5. **Giờ nhập** là giờ máy chủ lúc nạp (`phat.js` `nowIso`), không phải giờ phát thật → các chỉ số theo giờ (mức cập nhật, `ton_cho`) lệch nếu file nguồn đến muộn hơn hành vi thực tế.
  6. **Khoá SHBG phải có trong «đến»** (`KHONG_CO_TRONG_DEN`) → phát trước khi file «đến» được lấy sẽ lỗi hàng loạt; thứ tự nạp «đến» → «phát» phải bảo đảm.
- **Khuyến nghị**: đừng gộp vào SANLUONG-5. Làm SANLUONG-5 cho **hàng đến** trước; «phát tự động» là ticket khảo sát riêng sau khi PO xác nhận nguồn có file phát (mục 7, câu 14-16). Chế độ trung gian an toàn: tự động tạo **bản kiểm tra** (không commit) để người xác nhận bằng một cú bấm.

## 3. Mã SFTP đã có chưa?
- **Mã chạy: chưa có.** Mọi chỗ nhắc SFTP đều là chú thích / tài liệu / ràng buộc cột:
  - Mã: `server/lib/arrivalsImport.js:3` (chú thích), `:67` (`source IN ('MANUAL','SFTP')`); giao diện: `src/components/arrivals/ArrivalsView.jsx:227` (chữ «ngày thiếu đợt nạp file SFTP»).
  - Tài liệu: `docs/ai/00_SNAPSHOT.md:29,60`; `04_DECISIONS.md:106,113` (#17, #19); `05_BACKLOG.md:25,61` (mục 6h, 14); `07_SANLUONG_AUDIT.md:136,148,152-154,161,168,188,200,202`.
- **Biến môi trường**: không có biến SFTP nào trong mã. Chỉ tài liệu **đề xuất** (chưa dùng): `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD` (hoặc `SFTP_PRIVATE_KEY_PATH`), `SFTP_DIR`, `SFTP_HOST_FINGERPRINT`, `SFTP_POLL_MINUTES`, `HANGDEN_UNITS` (`07_SANLUONG_AUDIT.md:154`). Biến hiện có (chỉ tên): `JWT_SECRET`, `CMS_ALLOWED_IPS`, `HOST_PORT`/`PORT`, `TZ`, `SECURITY_LOG`, `TRUSTED_PROXIES`, `ARRIVALS_DB` (các script), `JWT_EXPIRY`, `JWT_EXPIRY_TIVI`, `PHAT_MAX_DONG`, `ARRIVALS_EXPORT_MAX_ROWS`. `.env.example` chỉ có `JWT_SECRET`, `CMS_ALLOWED_IPS`, `HOST_PORT`. (Không đọc giá trị trong `.env` thật.)
- **Thư viện**: `package.json` **chưa** có thư viện SFTP/SSH (phụ thuộc hiện có: `better-sqlite3 ^13.0.3`, `csv-parse ^7.0.3`, `exceljs ^4.4.0`, `express ^5.2.1`, `jsonwebtoken ^9.0.3`, `uuid ^14.0.1`…); `package-lock.json` cũng không có `ssh2`. Tài liệu đề xuất `ssh2-sftp-client` 12.1.1 trên `ssh2` 1.17.0 (`07_SANLUONG_AUDIT.md:152`) — **chưa kiểm lại** (không có mạng); phần native của `ssh2` là tuỳ chọn, Dockerfile đã dùng `npm ci --ignore-scripts` (`Dockerfile:14`).
- **Môi trường chạy**: image chỉ chép `server/` + `dist/` + `node_modules` (`Dockerfile:30-33`) — **thư mục `scripts/` KHÔNG nằm trong image**, nên `scripts/import-arrivals.js` hiện không chạy được bên trong container; chạy máy chủ bằng `docker compose`, `network_mode: host`, DB gắn `./data:/app/data` (`docker-compose.yml:9-15`).

## 4. Lập lịch
**Hiện có**: không có tác vụ định kỳ nào trong `server/` và `scripts/` (tìm `setInterval|setTimeout|cron|worker_threads|child_process`: chỉ `sleep` trong `arrivalsExport.js:161`). Việc «dọn bản kiểm tra hết hạn» chạy **khi có request** (`phat.js:292, 328`), không có hẹn giờ.

| Phương án | Mô tả | Ưu | Nhược / rủi ro | Chi phí |
|---|---|---|---|---|
| **A. Tác vụ nền trong tiến trình Node** | `setTimeout` đệ quy trong `server/index.js` (không chạy chồng, có khoá), gọi mô-đun đồng bộ | Một tiến trình, một handle DB (không tranh khoá giữa hai tiến trình); trạng thái đọc ngay qua API; dùng chung `app.locals.security.log`, múi giờ, TZ của container; tự khởi động lại theo `restart: unless-stopped` | Phần ghi DB **đồng bộ → chặn mọi yêu cầu web** trong lúc nạp (ước tính 0,1–0,5 s mỗi file 1–2,3 nghìn dòng — **chưa chắc, cần đo**); nạp lịch sử lớn phải ngắt quãng (`await` giữa các file); lỗi không bắt được có thể ảnh hưởng web; thêm thư viện vào ảnh chạy | Trung bình: mô-đun + bộ hẹn giờ + trạng thái |
| **B. Script riêng chạy bằng Task Scheduler (DSM) / `docker exec`** | `scripts/sftp-sync.js` chạy định kỳ ngoài tiến trình web | Không chặn web; cô lập lỗi; dễ chạy tay | **Hai tiến trình cùng ghi một file SQLite** (WAL cho một người ghi tại một thời điểm; bên chờ tối đa timeout mặc định của better-sqlite3 — **chưa kiểm**, `server/db.js` không đặt `busy_timeout`) → có thể gặp `SQLITE_BUSY` ở lúc hủy đợt/nạp; `scripts/` **chưa có trong image** (phải sửa Dockerfile); lịch nằm ngoài ứng dụng nên PO không thấy; cần xác nhận DSM Task Scheduler chạy được `docker exec` (**chưa chắc**) | Trung bình + sửa Dockerfile/triển khai |
| **C. Kết hợp (khuyến nghị)** | Mô-đun dùng chung `server/lib/…`: (1) bộ hẹn giờ trong tiến trình, **mặc định tắt** (bật bằng biến môi trường); (2) lệnh `scripts/…` để thử kết nối (`--dry-run`, chỉ liệt kê) và **nạp lịch sử** (một lần, có thể chạy lúc ít người); (3) nút «Lấy ngay» cho ADMIN (về sau) | Hằng ngày đơn giản như A; nạp lịch sử lớn không làm nghẽn web; một mã nguồn cho cả ba; bật/tắt không cần sửa mã | Phải giữ mô-đun độc lập với Express; lệnh dòng lệnh cần có trong image nếu chạy trong container | Trung bình+ (nhưng chia ticket được) |

**Giảm nghẽn nếu A đo ra > ~300 ms/file**: nạp mỗi lượt tối đa N file rồi `await setImmediate`; hoặc đưa phần ghi vào `worker_threads` với handle DB riêng (WAL cho phép đọc song song, chỉ một người ghi) — **chưa thử**.

**Khuyến nghị: C**, vì (a) nhu cầu hằng ngày nhỏ (≈ vài file mỗi lượt) nên A đủ; (b) bài toán lịch sử (quyết định #19: nạp toàn bộ lịch sử) chỉ làm một lần, không nên chặn web; (c) cần một chỗ cho PO nhìn trạng thái, mà trạng thái nằm trong DB của ứng dụng nên tiến trình web sở hữu nó.

## 5. Ràng buộc kỹ thuật
- **SQLite một người ghi**: `journal_mode = WAL` (`server/db.js:13`), không đặt `busy_timeout` (tìm trong `db.js`: không có). Trong một tiến trình, better-sqlite3 chạy đồng bộ nên các lần ghi tự tuần tự và **chặn** mọi yêu cầu khác; cùng bản chất với `tonCho` (~320 ms/BCVH đo bằng dữ liệu giả ở PHAT-3b — `08_PHAT.md` mục 4) và `hoanTacDot` (giao dịch đồng bộ). Khác với script ngoài tiến trình: hai người ghi tranh nhau.
- **Thời gian một file** (ước tính, **chưa đo**): file mẫu 1.075–2.292 dòng, 0,33–0,73 MB (`07_SANLUONG_AUDIT.md:12-22`); mỗi dòng 1 `INSERT OR IGNORE` với 11 chỉ mục (`arrivalsImport.js:104-114`) + 1 lần `refreshWardMap` mỗi file (`:294`). → ước 0,1–0,5 s mỗi file, cộng thời gian tải SFTP (chưa biết mạng). **Lịch sử**: số file = ngày × 2 × số BCVH (chưa biết cỡ) → có thể hàng nghìn file, vài phút đến vài chục phút CPU liên tục — phải làm ngoài giờ hoặc bằng lệnh dòng lệnh. Cần đo trong ticket 5c bằng DB tạm.
- **Nhật ký bảo mật**: ghi từng dòng JSON vào `SECURITY_LOG` hoặc `data/security.log` (`server/security.js:91-103, 191`); các route ghi qua `req.app.locals.security.log` (ví dụ `routes/phat.js:89`, sự kiện `arrivals_export` trong `routes/arrivals.js`). **Không có sự kiện nào cho việc nạp** (nạp hiện chỉ qua script). Tác vụ nền muốn ghi nhật ký phải được truyền hàm `log` từ `index.js` (hoặc gọi `createSecurity()`, vốn in lại cảnh báo `CMS_ALLOWED_IPS`). Đề xuất sự kiện `arrivals_sftp_sync` (kết quả từng lượt) — **không** ghi nội dung dòng, không ghi mật khẩu/khoá.
- **Phân quyền xem trạng thái**: hiện `/arrivals/import-status` và `/exceptions` là **chỉ ADMIN** (`routes/arrivals.js:169-173`; quy tắc «cảnh báo dữ liệu chỉ ADMIN», `04_DECISIONS.md` #34). Nếu PO (không phải ADMIN) hoặc TTVH cần xem «lần lấy gần nhất / lỗi» thì phải **mở quyền** (quyết định mới). `nap_luc` (giờ nạp file OK mới nhất) đã nằm sẵn trong `tong-quan-den` cho mọi vai trò xem (`dashboardDenQuery.js:173-189`) nhưng **giao diện chưa hiển thị** — Dashboard chỉ hiện «Dữ liệu đến HH:mm» = giờ đến lớn nhất của dữ liệu (`DailyOpsDashboard.jsx:375`), không phải giờ lấy file.
- **Múi giờ**: dữ liệu nguồn là giờ địa phương không kèm múi (`07_SANLUONG_AUDIT.md:33`), lưu nguyên (`arrivalsImport.js:159`); `imported_at` là UTC (`CURRENT_TIMESTAMP` của SQLite); `napLuc` chuyển sang ISO `Z` (`dashboardDenQuery.js:173-177`); module phát dùng giờ Bangkok để hiển thị (`phat.js` `gioBangkok`). Tác vụ nền phải lấy «ngày hôm nay/ngày thiếu đợt» theo **TZ của container** (đã `Asia/Ho_Chi_Minh`). Giờ sửa đổi (`mtime`) của máy chủ SFTP có thể là múi khác — **chưa chắc**, dùng kích thước + độ ổn định thay vì so giờ với đồng hồ NAS.
- **Mạng / bảo mật**: container ở chế độ `host` trên NAS; cần mở đường ra tới máy SFTP (cổng, tường lửa DSM/VPN — **chưa biết**). Bí mật SFTP đặt ở `.env` (không commit), khoá máy chủ nên ghim bằng vân tay (`SFTP_HOST_FINGERPRINT` đề xuất); tài khoản chỉ đọc.

## 6. Thiết kế đề xuất (chưa làm)
### 6.1 Luồng một lượt
```
hẹn giờ ─▶ khoá chống chạy chồng ─▶ với từng nguồn (thư mục + mã BCVH, cấu hình)
   ├─ kết nối (thất bại → ghi lượt «lỗi kết nối», thoát, lượt sau thử lại, tăng dần khoảng chờ)
   ├─ liệt kê thư mục: giữ tên khớp ^HangDen_<mã nguồn>_\d{8}_\d{6}\.csv$ (mã trong tên phải bằng mã cấu hình)
   ├─ loại những file đã ở trạng thái OK/EMPTY (tên) hoặc REJECTED với cùng sha256 (nhớ lại)
   ├─ kiểm «file ổn định» (6.2) → chưa ổn định: bỏ qua lượt này, KHÔNG nạp
   ├─ tải về tệp tạm cạnh DB (tên .part) → đổi tên khi tải xong
   ├─ importArrivalFile(db, tệp-tạm, { source: 'SFTP' })  ← lõi hiện có
   ├─ xoá tệp tạm; (không xoá/sửa file trên SFTP — tài khoản chỉ đọc)
   └─ tổng kết lượt: số file thấy / mới / OK / EMPTY / REJECTED / CONFLICT / bỏ qua
ghi 1 dòng lượt vào bảng theo dõi + 1 sự kiện nhật ký bảo mật; cập nhật «lần thành công gần nhất»
```
Giữa các file `await setImmediate` để nhường vòng lặp sự kiện; tối đa N file mỗi lượt (phần còn lại để lượt sau) — nạp lịch sử dần dần.

### 6.2 Chống nhập trùng / nhập sót / file ghi dở
- **Trùng**: dựa lõi hiện có (tên + sha256; khoá dòng). Thêm: nhớ `REJECTED` cùng sha256 để không phân tích lại (mục 1).
- **Sót**: mỗi lượt đối chiếu **toàn bộ** danh sách thư mục với `arrival_import_files` (không chỉ «file mới nhất») → file đến muộn / lượt trước lỗi tự được nạp lượt sau; thêm cảnh báo «đã quá giờ kỳ vọng mà chưa thấy file» (giờ kỳ vọng PO quyết; hiện PO chọn «không gắn giờ cố định», #17) bên cạnh `getMissingBatches` (≥ 2 file mỗi ngày đã qua).
- **File ghi dở** (rủi ro chính, mục 1): chỉ nạp khi **kích thước không đổi qua 2 lần thăm dò liền nhau** *và* `mtime` cũ hơn X phút; sau khi tải kiểm cuối file đúng CRLF và số trường mỗi dòng đủ (lõi đã bắt `relax_column_count: false`, `:195`). Nếu nguồn ghi nguyên tử (đổi tên cuối cùng) thì quy tắc nhẹ hơn — **chưa biết** (mục 7).
- **File lỗi** (`REJECTED`): ghi lỗi + giữ file tạm tối đa vài ngày để ADMIN tải xuống kiểm tra (nếu PO đồng ý); cảnh báo ở chỉ báo trạng thái; không thử lại vô hạn cùng một sha256.
- **Cùng tên khác nội dung** (`CONFLICT`): giữ nguyên quyết định PO #16 (từ chối + báo ADMIN). Nếu thực tế nguồn **ghi đè file cũ có chủ đích**, cần ticket «thay thế có xác nhận» (xoá dòng của file cũ rồi nạp lại trong một giao dịch) — PO quyết.
- **File đến muộn / sai thứ tự**: nạp độc lập thứ tự (khoá dòng + `arrival_date` theo dữ liệu); «ngày hôm nay» của Dashboard là ngày file OK mới nhất của BCVH (#70) nên file cũ đến muộn không làm lùi «hôm nay», nhưng làm đổi số của ngày cũ — là hành vi mong muốn.
- **Hàng ngày không có hàng**: file chỉ có BOM = `EMPTY` hợp lệ (đã xử lý, `:383-387`).

### 6.3 Dữ liệu theo dõi
- File: đã có `arrival_import_files` (thêm giá trị `source = 'SFTP'`, lỗi, cảnh báo).
- **Lượt lấy** (bảng mới, ý tưởng): `bat_dau`, `ket_thuc`, `nguon` (mã BCVH / thư mục), `trang_thai` (`thanh_cong` | `mot_phan` | `loi_ket_noi` | `loi_khac`), các bộ đếm, `loi` (ngắn, không bí mật). «Lần thành công gần nhất» = lượt `thanh_cong` mới nhất theo từng nguồn.
- **Cấu hình nguồn**: danh sách «thư mục + mã BCVH» (#19) — đặt ở tệp cấu hình/biến môi trường ở ticket đầu, bảng + màn ADMIN để sau.

### 6.4 Màn hình / chỉ báo cho PO
1. **Dashboard** (mọi vai trò xem): cạnh «Dữ liệu đến HH:mm» thêm «Nạp lúc HH:mm» (đã có `nap_luc` trong API — cần kiểm lại cho đúng ngữ nghĩa «lần lấy gần nhất») và một dấu hiệu khi quá hạn / có lỗi (chấm vàng/đỏ + chữ).
2. **ADMIN**: khối «Nạp dữ liệu»: bảng theo BCVH — lần lấy gần nhất, lần thành công gần nhất, số file mới hôm nay, file lỗi (tên + lý do ngắn), ngày thiếu đợt; nút «Lấy ngay» (ticket sau).
3. Nếu PO muốn xem mà không phải ADMIN: quyết định quyền (mục 7, câu 12).

### 6.5 Đề xuất chia ticket (mỗi ticket một mục tiêu) và thứ tự
| # | Ticket | Mục tiêu | Phụ thuộc |
|---|---|---|---|
| 1 | **SANLUONG-5b** — Thử kết nối chỉ đọc | Thư viện SFTP + lệnh `--dry-run`: kết nối, liệt kê, in **tên / kích thước / mtime** (không tải, không nạp); xác nhận thông số thật (mục 7) | PO cấp thông tin + tài khoản chỉ đọc; chấp thuận cài thư viện |
| 2 | **SANLUONG-5c** — Lõi đồng bộ | Mô-đun: lọc tên, quy tắc ổn định, tải tệp tạm, gọi `importArrivalFile(source:'SFTP')`, nhớ REJECTED, bảng «lượt lấy»; chạy được bằng lệnh một lần; test bằng thư mục giả (không cần SFTP thật) + đo thời gian nạp | 5b (để biết định dạng thật); không chặn bởi 5d |
| 3 | **SANLUONG-5d** — Nạp lịch sử | Lệnh nạp ngược, giới hạn tốc độ, báo tiến độ, chạy ngoài giờ; đối chiếu số dòng theo ngày | 5c |
| 4 | **SANLUONG-5e** — Tác vụ nền | Bộ hẹn giờ trong tiến trình (mặc định tắt), khoá, lùi dần khi lỗi, sự kiện `arrivals_sftp_sync`, tắt êm khi dừng; cập nhật Dockerfile/compose/`.env.example`, `06_DEPLOYMENT.md` | 5c |
| 5 | **SANLUONG-5f** — Chỉ báo trạng thái | API trạng thái (ADMIN) + chỉ báo «Nạp lúc» trên Dashboard + khối ADMIN «Nạp dữ liệu» (giao diện: Antigravity) | 5c (dữ liệu), quyết định quyền |
| 6 | **PHAT-4 (khảo sát riêng)** | Tự động dữ liệu phát: nguồn, ánh xạ trạng thái, ưu tiên nguồn/người, chế độ «tạo bản kiểm tra chờ xác nhận» | PO xác nhận có file phát (mục 7) |
Thứ tự: 5b → 5c → 5e (bật cho **một** BCVH trước) → 5f → 5d (lịch sử) → mở thêm 5 BCVH → PHAT-4. Lý do: kiểm chứng sớm thông số thật rẻ nhất; chỉ báo trạng thái đi sát với bật tự động; nạp lịch sử sau cùng vì tốn thời gian nhất và cần số đo.

## 7. Câu hỏi còn mở cho PO (mã không trả lời được)
**Nguồn và tần suất**
1. Hệ thống nguồn **xuất file mấy lần mỗi ngày, lúc mấy giờ**? Mẫu 08/10: 09:30 và 15:00 (đổi 16:30 từ 06/10), mỗi file chỉ chứa **khung giờ riêng, không chồng nhau** (`07_SANLUONG_AUDIT.md:12-22, 81-95`). Nếu vẫn vậy, tự lấy file **không** làm số liệu «sát thực tế» hơn các mốc đó; có đổi tần suất xuất (ví dụ mỗi giờ) được không?
2. Sau mốc xuất, file xuất hiện trên SFTP **sau bao lâu**? Nguồn ghi **nguyên tử** (ghi tên tạm rồi đổi tên) hay ghi trực tiếp?
3. Ngày trong tên file là ngày nào (ngày chạy xuất; giờ lệch 1 giây giữa lần — `07_SANLUONG_AUDIT.md:22`)? Tên có luôn đúng mẫu `HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv` không, kể cả file lịch sử?
4. File chiều Chủ nhật chỉ có BOM là quy ước hay lỗi (đã nhận là `EMPTY` hợp lệ)?
5. 5 BCVH còn lại có **cùng định dạng** (16 cột) và `BC_nhan_BG` = mã BCVH của thư mục không? Mỗi BCVH một thư mục hay chung một thư mục?
**Máy chủ SFTP và vận hành**
6. Địa chỉ, cổng, thư mục của từng BCVH, kiểu xác thực (khoá hay mật khẩu), vân tay khoá máy chủ.
7. **Ai quản lý tài khoản SFTP** (cấp, xoay mật khẩu/khoá, khoá khi nghỉ việc)? Tài khoản có **chỉ đọc**? File có **bị xoá/ lưu trữ** sau một thời gian không (quyết định #19 ghi «lưu mãi»)?
8. Từ **NAS có ra được** máy SFTP (tường lửa, VPN, DNS)? Máy nào chạy: container trên NAS (hiện tại) hay máy khác?
9. Tần suất thăm dò mong muốn (đề xuất 10–15 phút, `07_SANLUONG_AUDIT.md:153`) và giờ **kỳ vọng** để cảnh báo «quá hạn chưa có file» (#17 hiện nói không gắn giờ cố định).
10. Nạp lịch sử: **từ ngày nào**, bao nhiêu file / dung lượng ước tính, có cần xong trước khi bật chạy hằng ngày không?
**Quy tắc xử lý**
11. File **cùng tên khác nội dung** (nguồn ghi đè): vẫn từ chối + báo ADMIN (#16) hay cho **thay thế có xác nhận**?
12. Ai được xem «lần lấy / lỗi»: chỉ ADMIN (#34) hay thêm TTVH / người điều hành? Có cần **thông báo chủ động** (email/Zalo) khi lỗi hoặc quá hạn không (hiện hệ thống không có kênh gửi)?
13. File lỗi (`REJECTED`) giữ lại để tải về kiểm tra bao lâu?
**Dữ liệu phát**
14. Hệ thống nguồn có **xuất kết quả phát** (trạng thái từng SHBG) không? Ở đâu, định dạng nào, tần suất?
15. Bảng ánh xạ **mã trạng thái nguồn → 5 trạng thái** và quy tắc khi file nguồn mâu thuẫn với nhập tay (ưu tiên bên nào)?
16. Cho phép phát tự động ở mức nào: (a) chỉ tạo bản kiểm tra chờ người xác nhận, (b) tự nhập có nhãn «tự động» và có nút hủy cả lượt?
**Kỹ thuật cần PO/CTO duyệt**
17. Chấp thuận thêm phụ thuộc (`ssh2-sftp-client` + `ssh2`) và việc lưu bí mật SFTP trong `.env` của NAS.
18. Bộ hẹn giờ trong tiến trình (phương án C) hay chạy tách (B)? Nếu B: có dùng được DSM Task Scheduler + `docker exec`, và đồng ý đưa `scripts/` vào image?

## 8. Điều chưa chắc
- Thời gian nạp một file / nạp lịch sử (chỉ ước tính; cần đo bằng DB tạm ở 5c).
- `busy_timeout` thực tế khi hai tiến trình ghi (mặc định của thư viện, chưa kiểm).
- Cách tạo tài khoản hệ thống cho `phat_batches.user_id` mà không thành tài khoản đăng nhập được.
- Phiên bản thư viện SFTP, giấy phép, và việc chạy tốt trong image `node:22-bookworm-slim` với `--ignore-scripts` (chỉ là ghi chú của lần khảo sát trước).
- Giờ của các file ở tên có còn là 09:30 / 15:00–16:30 hay không (mẫu từ 08/10); lệch «Dữ liệu đến 10:45 lúc 19:00» ở ví dụ của PO phù hợp với việc chỉ file sáng được nạp, nhưng không kiểm được bằng mã.
- Giao diện chưa chạy thật; mô tả giao diện dựa trên đọc mã.
