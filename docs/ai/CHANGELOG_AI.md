# 📝 AI-Assisted Changes Changelog

Ghi lại các thay đổi được thực hiện với hỗ trợ của AI. Mới nhất ở đầu, append-only, 1 mục/ticket.

---

## [2026-10-12] - Vai trò `TIVI`: chỉ xem dashboard «đến», token dài hạn, có phạm vi (DASH-3)

- `server/roles.js`: thêm `TIVI` (không thuộc `VIEWER_ROLES`). `server/lib/tivi.js` (mới): allowlist `TIVI_ALLOWED` + `tiviAllows()`, bảng `user_tivi_scope` (`ensureTiviSchema`, gọi từ `server/db.js`), `getTiviScope` / `setTiviScope` / `isValidTiviScope`.
- `server/auth.js`: token TIVI hạn `JWT_EXPIRY_TIVI` (mặc định 90 ngày; vai trò khác không đổi), claim `tivi` + dấu mật khẩu (HMAC); `authRequired` từ chối token TIVI khi tài khoản đổi vai trò / mật khẩu (401) và chặn mọi request ngoài allowlist của TIVI (403).
- `server/routes/arrivals.js`: TIVI qua lớp `/arrivals` chỉ ở 3 endpoint dashboard; `bcvh` bị ép theo phạm vi, chưa có phạm vi → 403. `server/routes/auth.js`: `GET /api/auth/me`, `user.tivi_scope` khi đăng nhập. `server/routes/users.js`: `tivi_scope` khi tạo / sửa (chỉ ADMIN, kiểm giá trị, xoá khi rời TIVI), `GET /api/users` trả `tivi_scope`.
- `tests/tivi.test.js` (mới, 10 ca; thêm vào script `test` của `package.json`). `npm test` 290 ca: 290 pass trong worktree riêng (không có `data/hue-dhcl.db` nên ca CLI seed chạy, không skip).
- Docs: quyết định #74, bản đồ kiến trúc (cột TIVI trong ma trận quyền, bảng `user_tivi_scope`, `/auth/me`), `00_SNAPSHOT.md`, `06_DEPLOYMENT.md` (biến `JWT_EXPIRY_TIVI`).

---

## [2026-10-11] - API Dashboard «Cần điều hành ngay hôm nay» — phần đến (DASH-1)

- `server/lib/dashboardDenQuery.js` (mới) + `server/routes/arrivals.js`: `GET /api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang` (tham số `bcvh`, `date`, `gioi_han`; ADMIN / TTVH / GDVH, STAFF 403; `bcvh_goi_y` cho GDVH). Dùng lại `buildCountedCte`, `notReceivedStats`, `bd10.stats`, `latestFileDate`; không đổi API / cách tính có sẵn. Tên `/dashboard/overview` đã có (3e) nên đặt `tong-quan-den`.
- `server/config/dashboard-thresholds.js` (mới): hằng số mức điều hành TẠM (`HANG_NANG_G` 2000, `GIO_MUON` 15, chưa nhận >= 1 ngày, BD10 10% / 5%, lệch sản lượng 25% / 15%).
- `tests/dashboard-den.test.js` (mới, 8 ca; thêm vào script `test` của `package.json`): ranh giới 1.999 / 2.000 / 2.001 g và khối lượng 0, 14:59:59 / 15:00:00, lượt vs bưu gửi (nhiều dòng một bưu gửi), so hôm qua / TB cùng giờ và thiếu ngày → null, BD10 lập đi / rỗng bị loại khỏi chưa nhận, ngưỡng 5% / 10% / 15% / 25%, việc cần làm, phường/xã (hôm qua = 0), quyền (GDVH chưa giao = ADMIN, STAFF 403). `npm test` 280 ca: 279 pass, 1 skip có chủ đích.
- Bản chép DB dev (533140, 08/10): bưu gửi 3.914 / lượt 4.034; BD10 chưa XNĐ 2/23 (8,7%); chưa nhận 5 bưu gửi chờ 2 ngày — khớp API có sẵn; mỗi lần gọi ~40–100 ms. Docs: quyết định #73, bản đồ kiến trúc, `00_SNAPSHOT.md`.

---

## [2026-10-11] - GDVH xem được «chưa nhận» và «BD10 đến» của BCVH đang chọn — phương án A (SANLUONG-4a11)

- `server/routes/arrivals.js`: bỏ hàm `scopeCodes`; `/summary` (`chua_nhan_tai_bcvh`, `bd10_den_khong_xnd`), `/not-received`, `/bd10-khong-xnd`, `/dashboard/center`, `/bd10-trang-thai/theo-ngay`, `/theo-buu-cuc-lap` không còn giới hạn GDVH theo BCVH được giao — mọi vai trò xem theo bộ lọc `receiver_code` / `unit`. Tải / xuất (`/export-scope`, `/export`, `/not-received/export`, `/bd10-khong-xnd/export`) KHÔNG đổi. Chú thích: `arrivalsQuery.js` (`scopedFilters`, `summary`), `bd10Query.js` (đầu file), `dashboardQuery.js` (`center`). Khoá JSON không đổi.
- Test: viết lại các ca "GDVH chỉ BCVH được giao / chưa giao = 0" thành "GDVH xem như ADMIN" (`tests/arrivals-source.test.js` 2 ca, `tests/bd10-api.test.js` 3 ca, `tests/bd10-trang-thai.test.js` 3 ca); thêm 1 ca #72 (`tests/bd10-api.test.js`): GDVH chưa được giao xem 6 API xem bằng ADMIN cho cùng BCVH, `export-scope` rỗng, 3 API xuất 403; GDVH đã giao tải được BCVH của mình, BCVH khác 403. `npm test` 272 ca: 271 pass, 1 skip có chủ đích.
- Docs: quyết định #72 (sửa #52, #60, #67; ghi chú #69, #70), đóng backlog 7f5, bổ sung 7b (màn hình phân BCVH + gợi ý vai trò GDVH ở `AddUserModal.jsx`), `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`.

---

## [2026-10-11] - API «Trạng thái BD10 đến»: thêm số bưu gửi (SANLUONG-4a9c)

- `server/lib/bd10Query.js`: `bgCounts()` — số SHBG khác nhau theo ô (cùng tập BD10 / trạng thái / ngày quy tắc X với số BD10, dùng chung `perBd10Sql`); `/bd10-trang-thai/theo-ngay` và `/theo-buu-cuc-lap` thêm `bg_tong`, `bg_da_xnd`, `bg_chua_xnd`, `ty_le_chua_xnd_bg` ở từng ô và `tong` (cả khung đếm khác nhau, không cộng ô). Khoá cũ, thứ tự sắp, `ngoai_khung` không đổi. Truy vấn: `CROSS JOIN` để quét bảng một lần (~1,4 s → ~0,2 s) và đếm bằng `Set` trong JS (→ ~0,1 s) trên bản chép DB dev.
- `tests/bd10-trang-thai.test.js`: +3 ca (#71: ngày trống = 0, SHBG lặp trong một BD10, SHBG ở hai BD10 cùng / khác trạng thái, `bg_tong` cả khung ≤ tổng các ngày, tỉ lệ null, lập đi / rỗng bị loại, phạm vi GDVH, khoá cũ giữ giá trị); các ca cũ so khoá BD10 qua `old()` (giá trị không đổi). `npm test` 271 ca: 270 pass, 1 skip có chủ đích.
- Bản chép DB dev (533140, 01→09/10): bưu gửi 28.049 (đã XNĐ 21.957, chưa XNĐ 6.113, 21,79%); 42 SHBG ở hơn một ô. Docs: quyết định #71, bản đồ kiến trúc, `00_SNAPSHOT.md`.

---

## [2026-10-11] - Giao diện tab «Trạng thái BD10 đến» (SANLUONG-4b)

- `src/components/arrivals/ArrivalsBd10Status.jsx` (mới): Tab «Trạng thái BD10 đến» theo thiết kế canvas bảng số 6:
  - Điều kiện hiển thị: Bắt buộc chọn đúng 1 BCVH, khung ngày ≤ 92 ngày, xử lý thông báo khi không có dữ liệu / `ngay_du_lieu_moi_nhat = null`.
  - Hàng chip: Hiển thị ngày đang xem (ngày dữ liệu mới nhất mặc định / ngày cụ thể) hoặc chữ cả khung; nút bấm xem cả khung; dòng hướng dẫn.
  - Bốn thẻ KPI: Tổng BD10 đến, Đã XNĐ BD10, Chưa XNĐ BD10 (nền `#fff1f2`, viền `#fb7185`), Tỉ lệ chưa XNĐ (kèm so sánh ngày trước đó trong khung).
  - Dòng nhắc vàng: Cảnh báo ngày mới nhất BD10 có thể chưa kịp XNĐ.
  - Khối biểu đồ cột chồng theo ngày: Chiều cao theo tổng BD10, phần dưới đã XNĐ `#86efac`, phần trên chưa XNĐ `#e11d48` kèm số đỏ trên cột; bấm cột để chọn/bỏ chọn ngày; hỗ trợ bàn phím và `aria-label`.
  - Khối theo bưu cục lập BD10: Bảng 5 cột, số chưa XNĐ dạng viên hồng đậm, dòng Cộng cuối bảng; nút «Xem danh sách BD10 chưa XNĐ →» điều hướng sang màn chi tiết `ArrivalsBd10NotConfirmedDetail`.
  - Dòng ghi chú ngoài khung ở cuối trang.
- `src/components/arrivals/ArrivalsView.jsx`: Thêm tab thứ hai `bd10_status` («Trạng thái BD10 đến») ngay sau `overview` («Tổng quan»).
- `src/components/arrivals/ArrivalsNotReceived.jsx`: Sửa React key cho lưới «Theo ngày lập BD10» thành `${g.ngay}-${g.tuoi}` tránh trùng lặp khi chọn nhiều BCVH lệch ngày dữ liệu.
- `npm run build` thành công, không dùng từ cấm («tuổi»), không chứa số hiệu thật.

---

## [2026-10-11] - "Chưa nhận" loại BD10 lập đi / rỗng; API trạng thái BD10 đến theo ngày / theo bưu cục lập; đổi tên cột Excel (SANLUONG-4a9)

- `server/lib/arrivalsQuery.js`: #68 (đổi #60) — "chưa nhận tại BCVH" chỉ giữ bưu gửi mà BD10 của dòng đại diện (id nhỏ nhất) là BD10 đến hoặc loại khác; loại BD10 rỗng và BD10 lập đi. Một chỗ: `notReceivedSql()` + `NOT_RECEIVED_BD10_SQL`, dùng chung cho `notReceivedStats` (`/summary`, `/dashboard/center`), `notReceivedList` (`/not-received`, `/not-received/export`) và `CHUA_NHAN_TAI_BCVH` của `/exceptions`. Khoá API không đổi.
- `server/lib/bd10Query.js` + `server/routes/arrivals.js`: #69 — `GET /api/arrivals/bd10-trang-thai/theo-ngay` và `/theo-buu-cuc-lap` (from, to chỉ ngày, ≤ 92 ngày; receiver_code | unit; công khai, phạm vi `scopeCodes`); tên bưu cục lập từ `post_offices`; `ngay_du_lieu_moi_nhat` = `latestFileDate()` (cả DB). Tách `applyUnitAlias` dùng chung với `splitQuery`. Khoá cũ của `bd10_den_khong_xnd` không đổi.
- `server/lib/arrivalsExport.js`: tiêu đề cột `Tuoi_ngay` → `Da_cho_ngay` ở file xuất "chưa nhận" và "BD10 đến không XNĐ" (trường API `tuoi_ngay` / `tuoi` giữ nguyên; `/export` 9 cột không đổi). Không có mã / script / docs nào đọc cột theo tên; sửa 2 assert tiêu đề trong `tests/arrivals-source.test.js`, `tests/bd10-api.test.js`.
- `tests/bd10-trang-thai.test.js` (mới, 7 ca): #68 (lập đi / rỗng bị loại, theo dòng đại diện; BD10 đến và loại khác vẫn tính; cùng số ở summary / not-received / exceptions / center / xuất Excel; khung hẹp / rộng theo ngày file); #69 (mọi ngày trong khung, ngày trống = 0, quy tắc X, tổng ngày = tổng khung, ngoài khung, `ty_le_chua_xnd` null khi tong = 0, > 92 ngày → 400, sắp theo bưu cục lập, tên null khi ngoài danh mục, phạm vi GDVH / ADMIN / TTVH, STAFF 403). Thêm tệp này vào script `test` của `package.json`. `npm test` 264 ca: 263 pass, 1 skip có chủ đích.
- Bản chép DB dev (BCVH 533140, 01→09/10): chưa nhận 330 → 320 (`0-1` 249, `2` 5, `3+` 66 — khớp 4a8; 46 bưu gửi có dòng thuộc nhiều loại BD10); trạng thái BD10 đến 163 / chưa XNĐ 22 (13,5%), 530100 19/104, bưu cục khác 3/59, ngoài khung 18/5/2 — khớp 4a5/4a6.
- Docs: quyết định #68, #69 (ghi chú đổi ở #60), bản đồ kiến trúc, `00_SNAPSHOT.md`.
- 4a9b (#70, PO quyết 11/10): ngày dữ liệu mới nhất (`/bd10-trang-thai/theo-ngay`) và mốc "đã chờ" tính theo ngày file OK mới nhất CỦA BCVH NHẬN (`latestFileDates` / `latestFileDate(db, codes)` / `ageAt` trong `arrivalsQuery.js`; áp ở chưa nhận, `/not-received`, `/exceptions`, `/dashboard/center`, BD10 đến không XNĐ + lọc `tuoi`, hai file xuất); `theo_ngay_lap` tách theo (ngày, tuổi) khi nhiều BCVH lệch ngày. +4 ca test (`tests/bd10-trang-thai.test.js`, 11 ca); `npm test` 268 ca: 267 pass, 1 skip. Bản chép DB (533140, file mới nhất 10/10): mọi số giữ nguyên. Backlog 7j5, 7j6.

---

## [2026-10-10] - Giao diện: chỉ số "BD10 đến không XNĐ" (SANLUONG-4a7)

- `src/components/arrivals/ArrivalsBd10NotConfirmed.jsx` (mới): Thêm `ArrivalsBd10NotConfirmedBanner` và `ArrivalsBd10NotConfirmedDetail` để hiển thị BD10 đến chưa có xác nhận đến (S2, S3), có bộ lọc nhóm (`530100` / `khac`), nút xuất Excel (chỉ khi chọn 1 BCVH và tối đa 92 ngày).
- `src/components/arrivals/ArrivalsView.jsx`: Tích hợp Banner và Detail của BD10 đến không XNĐ (hoạt động giống khối chưa nhận tại BCVH).
- `src/components/arrivals/ArrivalsQuality.jsx`: Gỡ bỏ khối "Đủ trạng thái theo nguồn" (do quy tắc R2 thay đổi, không còn dùng).
- Hoàn tất các phần của SANLUONG-3h bị dở dang (đã xóa `date_basis` trên frontend và tích hợp `ArrivalsNotReceived`).
- Xác nhận: Khi giao diện không gửi `date_basis`, backend mặc định lấy tiêu chí `arrival` (R2: đến BCVH).
- Đã chạy `npm run build` thành công.

---

## [2026-10-10] - API chỉ số "BD10 đến không XNĐ" + danh sách + xuất Excel (SANLUONG-4a6)

- `server/lib/bd10Query.js` (mới): chỉ số ở mức BD10 tính lúc truy vấn (nhóm theo `bd10_no`, một lần quét): BD10 đến = ký tự 7–12 = mã BCVH nhận, 6 ký tự đầu ≠ mã BCVH; S1–S4; N = S2+S3; D = S1+S2+S3 có ngày trong khung; ngày quy tắc X; tuổi dùng `latestFileDate`/`dayAge`/`ageBucket` của `chua_nhan_tai_bcvh`; phạm vi theo vai trò qua `scopedFilters`. Không thêm bảng / cột / chỉ mục.
- `server/routes/arrivals.js`: khoá `bd10_den_khong_xnd` trong `/summary` (CÔNG KHAI, không sau cờ ADMIN) và `/dashboard/center`; `GET /api/arrivals/bd10-khong-xnd` (from, to, receiver_code | unit, nhom, tuoi, page, page_size); `GET /api/arrivals/bd10-khong-xnd/export` (dùng chung `exportHandler`, thêm `prepare`); `server/lib/arrivalsExport.js`: `writeListExport` dùng chung cho danh sách "chưa nhận" và BD10. Mọi khoá cũ giữ nguyên (#61 đánh dấu SẼ ĐƯỢC THAY, chưa xoá).
- `tests/bd10-api.test.js` (mới, 9 ca): S1–S4, quy tắc ngày X, BD10 trải nhiều ngày, loại BD10 lập đi / rỗng / `NULL` / mã ngắn / mã nhận khác, nhóm 530100 và khác, khung (trước / trong / sau), `ty_le` null khi D = 0, ghi nhận XNĐ khác nhau, phân quyền (ADMIN / TTVH / GDVH đều nhận khoá; GDVH theo `user_bcvh`; STAFF 403), danh sách + lọc + phân trang + `unit`, xuất xlsx, chỉ số cũ không đổi. `npm test` 257 ca: 256 pass, 1 skip có chủ đích; `npm run build` ok.
- Bản chép DB dev (BCVH 533140, khung 01→09/10): D 163 / N 22 (13,5%); 530100 104/19 (18,3%); khác 59/3 (5,1%); ngoài khung 18 trước, 5 sau, 2 không mốc — khớp 4a5. Hiệu năng: ~1,8 s / 1 triệu dòng (chỉ mục phủ thử không nhanh hơn).
- Docs: quyết định #67, #61 đánh dấu sẽ được thay, bản đồ kiến trúc, backlog 7j–7j4, `00_SNAPSHOT.md`.


## [2026-10-10] - Khảo sát lại "BD10 đến không XNĐ" theo định nghĩa mới của PO (SANLUONG-4a5, chỉ đọc)

- `scripts/survey-bd10-den.js` (mới): mở DB `readonly`, từ chối cờ ghi; mã BD10 = [6 ký tự bưu cục lập][6 ký tự bưu cục nhận][phần còn lại]; BD10 đến = ký tự 7–12 = mã BCVH và 6 ký tự đầu ≠ mã BCVH; trạng thái S1 (có XNĐ) / S2 (không XNĐ, ≥1 dòng đủ túi + BG) / S3 (không XNĐ, có túi hoặc BG, không dòng nào đủ cả hai) / S4 (không XN nào); N = S2+S3, D = S1..S4; ngày theo quy tắc X (XNĐ trước) và Y (XN túi/BG trước). Chỉ in số đếm và mã bưu cục 6 số. `tests/survey-bd10-den.test.js` (3 ca, DB tạm, dữ liệu giả). Không đổi chỉ số / API nào. `npm test` 248 ca: 247 pass, 1 skip có chủ đích; `npm run build` ok.
- Kết quả chính trên bản chép DB dev (BCVH 533140; số tổng hợp): 188 BD10 đến (126 từ 530100, 62 từ bưu cục khác), 58 BD10 lập đi (tiền tố 533140), 1 nhóm BD10 rỗng (2.024 SHBG), không mã bất thường; XNĐ đồng nhất trong BD10 đến; N/D toàn dữ liệu = 22/188 (11,7%; 530100: 19/126 = 15,1%; khác: 3/62 = 4,8%), tử số hẹp S2 = 21/188; trong khung 01→09/10 quy tắc X 22/163 (13,5%), quy tắc Y 22/185 (11,9%); đối chiếu 4a4 (trừ tiền tố 533140): 183 BD10 trùng, mới thêm 5 (2 trước khung, 2 không có `arrival_at`, 1 sau khung). Quyết định chờ PO (backlog 7i).


## [2026-10-10] - Khảo sát dữ liệu thật ở mức BD10: "BD10 đến không XNĐ" (SANLUONG-4a4, chỉ đọc)

- `scripts/survey-bd10.js` (mới): mở DB `readonly`, từ chối cờ ghi (`--apply`, `--write`, `--vacuum`…); khung BD10 theo ngày của MIN(`arrival_at`) các dòng; chỉ in số đếm / tỉ lệ / bảng (chỉ lộ tiền tố BD10 6 số). Bảng: quy mô + tiền tố, mốc trong từng BD10 (XN túi + BG; XNĐ đồng nhất?), "BD10 đến không XNĐ" cách A / B / C, từng ngày, hàng nặng (BD8 = SHBG), bất thường theo tiền tố, tuổi, chất lượng dữ liệu liên quan. `tests/survey-bd10.test.js` (2 ca, DB tạm, dữ liệu giả; kiểm DB không đổi). Không đổi chỉ số nào của app. `npm test` 245 ca: 244 pass, 1 skip có chủ đích; `npm run build` ok.
- Kết quả chính trên bản chép DB dev (BCVH 533140, 32.880 dòng, khung 01→09/10; số tổng hợp): 235 BD10 trong khung (median 26 dòng/BD10, max 1.046); XNĐ trong một BD10 hoặc có ở MỌI dòng cùng một giá trị hoặc không có ở dòng nào (0 BD10 loại ii/iii); cách A: 68/218 BD10 đến không XNĐ (31,2%; 530100: 18/112 = 16,1%; khác: 50/106 = 47,2%); BD10 tiền tố 533140 (= mã BCVH nhận, 52 BD10, 1.766 SHBG) 100% không XNĐ — loại ra thì "khác 530100" còn 3/59 (5,1%), tổng 21/171 (12,3%). Chi tiết quyết định chờ PO (backlog 7i).


## [2026-10-10] - Chữ NULL là ô rỗng ở mọi cột của file CSV hàng đến (SANLUONG-3k)

- `server/lib/arrivalsImport.js`: `normalizeCell()` — chữ `NULL` (không phân biệt hoa/thường, bỏ khoảng trắng) = ô rỗng ở MỌI cột, áp ở bước đọc ô trước mọi kiểm tra/lưu; `scripts/split-arrivals-csv.js` dùng chung hàm (đọc ngày / mã BCVH), vẫn ghi file con giữ nguyên chuỗi gốc. Không đổi R2, chưa nhận, nhóm nguồn hay chỉ số nào.
- Khảo sát: không cột nào bị REJECTED vì rỗng (cột chữ lưu `''`, khối lượng rỗng → NULL); 4 dòng `Ma_BC_dong` + `Dich_vu_code` + `Ten_dich_vu` cùng `NULL` vẫn nạp; `SHBG` rỗng không bị từ chối (ghi vào #66, backlog 7h2).
- Tests: `arrivals-import` (+2 ca: `normalizeCell`, NULL ở mọi cột), `arrivals-reload` (+1 ca: tách + nạp, nhóm `khong_bd10`, đường thư / dịch vụ / tỉnh / phường rỗng). `npm test` 243 ca: 242 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #66 (đánh dấu #65 mục NULL cột khác đã được thay), backlog 7h1 đóng + 7h2, `00_SNAPSHOT.md`, `06_DEPLOYMENT.md` mục 9.


## [2026-10-10] - Importer và script tách nhận ngày giờ ISO và chữ NULL (SANLUONG-3j)

- `server/lib/arrivalsImport.js`: `parseDateTimeCell()` — MỘT hàm cho importer và `scripts/split-arrivals-csv.js` (trước đó cả hai đã dùng chung `parseUsDateTime`, nay gọi hàm mới): rỗng / `NULL` (không phân biệt hoa thường, bỏ khoảng trắng) = rỗng; `YYYY-MM-DD HH:mm:ss` / dạng `T`, phần giây lẻ 1–7 chữ số bị bỏ (không đổi múi giờ); dạng Mỹ cũ giữ nguyên; chuỗi khác → REJECTED nêu số dòng + tên cột (không in giá trị). Thông báo lỗi nêu cả hai định dạng hợp lệ.
- Script tách: giữ nguyên chuỗi gốc của từng ô; ngày 10/10 (sau khung 01–09/10) có file riêng. Không đổi R2, chưa nhận, ngưỡng hợp lý hay chỉ số nào.
- Tests: `arrivals-import` (+2 ca: bảng định dạng, nạp file ISO + NULL lẫn dạng cũ), `arrivals-reload` (+1 ca: tách CSV ISO có NULL qua ngày 10/10, nạp ra OK, chỉ số đúng); 2 ca cũ dùng ISO làm "giá trị sai" đổi sang `dd-mm-yyyy`. `npm test` 240 ca: 239 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #65 (kèm danh sách chỗ chữ `NULL` ở cột khác vẫn là dữ liệu thật — chờ PO), `06_DEPLOYMENT.md` mục 9, backlog 7h–7h1.


## [2026-10-10] - Xoá dữ liệu sản lượng đến (dev) và nạp lại từ một file CSV nhiều ngày (SANLUONG-3i)

- `scripts/reset-arrivals.js` (mới): xoá `arrival_items` + `arrival_import_files` (danh sách trắng) và đặt lại bộ đếm id; chạy thử mặc định, `--apply` một transaction, lặp lại an toàn; không đụng `users`, `user_bcvh`, danh mục, `ward_bdx_map`, `dashboard_widgets`.
- `scripts/split-arrivals-csv.js` (mới): tách MỘT file CSV nhiều ngày thành `HangDen_<mã>_<yyyymmdd>_235959.csv` theo ngày đến (R2; chưa nhận → ngày lập BD10; không mốc → ngày cuối); thư mục ra bắt buộc ngoài repo và rỗng; không in số hiệu. Lý do chọn tách file thay vì sửa importer: mọi chỉ số lọc theo `file_date` (chưa nhận, ngoại lệ, Dashboard, kiểm tra hợp lý [ngày file −3, +1]) giữ nguyên (#63).
- `server/lib/arrivalsImport.js`: `resolveHeader()` — đọc cột theo TÊN (không dấu, không phân biệt hoa/thường), cột lạ bỏ qua (`extraColumns`), đổi chỗ cột được, cột tuỳ chọn (`Ma_BC_dong`, `Khoi_luong_thuc_te`, `Ten_dich_vu`, `Ghi_chu`) vắng → rỗng; thiếu cột bắt buộc / cột trùng tên → REJECTED. Nạp hằng ngày với file chuẩn không đổi.
- Tests: `tests/arrivals-reload.test.js` (mới, 5 ca); `arrivals-import` (thay ca "sai tiêu đề", +1 ca cột thừa / bí danh / vắng cột tuỳ chọn); `arrivals-api` (ca import-status đổi cột làm hỏng tiêu đề sang SHBG). `npm test` 237 ca: 236 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #63–#64 (ghi rõ script xuất đã đổi ngữ nghĩa XNĐ BD10 cho tiền tố 530100, #61 sẽ được xem lại), `06_DEPLOYMENT.md` mục 9 (từng lệnh), bản đồ kiến trúc, backlog 7g–7g3.


## [2026-10-10] - Quy tắc ngày đến R2, "chưa nhận tại BCVH", chất lượng khai thác theo nguồn BD10 (SANLUONG-3g)

- `server/lib/arrivalsImport.js`: `deriveArrival()` (R2: túi → bưu gửi → BD10, không dùng `bd10_ttkt_confirmed_at`), dùng chung với importer và script tính lại. `scripts/rederive-arrival.js` (mới): chạy thử mặc định, `--apply` ghi trong một transaction, idempotent, nhắc sao lưu; `06_DEPLOYMENT.md` mục 8.
- `server/lib/arrivalsQuery.js`: `TTKT_BD10_PREFIX = '530100'`; truy vấn dùng chung "chưa nhận tại BCVH" (`notReceivedStats`, `notReceivedList`, `scopedFilters` — GDVH chỉ BCVH được giao); `tong_hop.theo_nguon` + `du_trang_thai_theo_nguon` trong `quality-mocs` (nhóm gắn vào khoá dòng đại diện, GROUP BY một khoá nguyên); `/exceptions` có `ly_do`, phân trang, lý do `CHUA_NHAN_TAI_BCVH`; `/meta` có ghi chú + tỷ lệ cho tiêu chí `bd10`. `server/lib/dashboardQuery.js`: `/center` thêm `chua_nhan_tai_bcvh` (theo phạm vi) và `theo_nguon`.
- `server/routes/arrivals.js`: `chua_nhan_tai_bcvh` trong `/summary` (mọi vai trò, ngoài `canh_bao`); `GET /api/arrivals/not-received`; `GET /api/arrivals/not-received/export` (dùng chung `exportHandler` với `/export`); `server/lib/arrivalsExport.js`: `writeNotReceivedExport`.
- Tests: `tests/arrivals-source.test.js` (mới, 13 ca); sửa `arrivals-api` (fixture T19 mốc BD10 sớm, SL_DAY4 = 17), `arrivals-import` (R2: +2 ca), `dashboard-api`. `npm test` 231 ca: 230 pass, 1 skip có chủ đích; `npm run build` ok.
- Bản chép DB thật (13.102 dòng): `rederive` đổi 110 dòng, sản lượng 02→08/10 = 12.783 trước và sau (03→09/10 12.783; 01/09→31/10 12.786); chưa nhận tại BCVH 62 (cũ nhất 4 ngày); theo nguồn `ttkt` 8.242 / `khac` 3.803 / `khong_bd10` 738, đủ theo nguồn 90,66%. Hiệu năng (DB giả 993.600 dòng): `summary` ±3%, `quality-mocs` +16–19%.
- Docs: quyết định #59–#62, bản đồ kiến trúc, backlog 7f–7f5, `06_DEPLOYMENT.md` mục 8.


## [2026-10-09] - Giao diện màn hình "Dữ liệu sản lượng đến" (SANLUONG-4a)

- `src/components/arrivals/*` (mới): Dựng UI dựa trên mô tả ticket, gồm:
  1. `ArrivalsFilters`: Bộ lọc (ngày, tiêu chí, phường/xã, BCVH multi-select).
  2. `ArrivalsOverview`: Thẻ chỉ số tổng, Bảng so sánh (tự động fetch nhiều `receiver_code`), biểu đồ ngày/giờ (Recharts), bảng phường/xã. Biểu đồ theo giờ chỉ gọi khi khoảng ≤ 7 ngày, mỗi khối tự xử lý lỗi.
  3. `ArrivalsRoutesServices`: Đường thư và dịch vụ, định dạng giờ trả về.
  4. `ArrivalsQuality`: Chất lượng khai thác, 7 tổ hợp mốc. Chứa phần hiển thị riêng cho `ADMIN` (cảnh báo bất thường, trạng thái nạp file).
  5. `ArrivalsLookup`: Tra cứu bưu gửi, xử lý cảnh báo đến lại. Chứa phần hiển thị riêng cho `ADMIN` (ngoại lệ).
  6. `ArrivalsExport`: Xử lý nút Tải dữ liệu, có kiểm tra `exportScope`. Nút xuất file chỉ gửi ngày thuần.
  7. `CustomDatePicker.jsx` (mới): Hộp lịch tiếng Việt tự viết, không thư viện.
  8. `dateUtils.js` (mới): Chuyển đổi ngày; bộ lọc chỉ chọn ngày, hiển thị dd/MM/yyyy.
- Quyền hiển thị (`App.jsx`, `Sidebar.jsx`): Chặn `STAFF` khỏi màn hình Arrivals. Sửa lại các chỗ kiểm tra minh bạch nhóm quyền. Việc đổi tên menu thành “Sản lượng đến”.
- Giao diện: Đồng bộ màu với site (.btn-primary, .card-soft).
- Không thêm thư viện mới (dùng recharts đã có; package.json/package-lock.json không đổi).
- Đã chạy `npm run build` thành công.
- UI chưa có test tự động; PO đã kiểm bằng tay trên dữ liệu mẫu.

---

## [2026-10-09] - Xuất Excel dữ liệu thô "Hàng đến" của một BCVH (SANLUONG-3c-3)

- `server/lib/arrivalsExport.js` (mới): tham số (`receiver_code` ∈ 6 BCVH, `from`/`to` `YYYY-MM-DD` ≤ 92 ngày, `date_basis`), phạm vi theo vai trò (`allowedBcvhCodes`/`exportScope`, GDVH qua `getAssignedBcvh`), đếm trước (ngưỡng 1.000.000 dòng, `ARRIVALS_EXPORT_MAX_ROWS` ghi đè), `writeExport` ghi `.xlsx` theo luồng: tiêu đề qua API ExcelJS, dòng dữ liệu ghi thẳng XML (API dòng/ô của ExcelJS ~30 µs/dòng), duyệt từng ngày rồi `id` (một lần seek mỗi lô 2.000 dòng), có chờ khi bộ đệm nén/gửi > 2 MB (luồng sheet của ExcelJS không tự báo áp lực ngược → đọc trạng thái luồng ống dẫn). Đúng 9 cột chuỗi (`numFmt '@'`, `t="str"`), ô rỗng để trống, giờ `dd/MM/yyyy HH:mm:ss`; bỏ ký tự điều khiển XML, cắt ô > 32.767 ký tự.
- `server/routes/arrivals.js`: `GET /api/arrivals/export-scope` (`{ bcvh: [{ ma, ten }] }`), `GET /api/arrivals/export` (400/403 tiếng Việt; header `Content-Disposition`; lỗi giữa chừng → cắt kết nối; client ngắt → dừng đọc DB; nhật ký `arrivals_export` vào `security.log`, không có dữ liệu bưu gửi). `server/lib/dashboardQuery.js` export thêm `bcvhNames`.
- `tests/arrivals-export.test.js` (mới, 15 ca; CSV/tài khoản giả): 9 tiêu đề + ánh xạ cột, mọi ô là chuỗi (kể cả đọc XML gốc), chuỗi 19 chữ số / mã 0 đầu, giờ 12 trưa/12 đêm/ngày 1 chữ số, dòng thô (không gộp, không loại hoàn/tỉnh khác), đúng BCVH + khoảng ngày, `date_basis`, khoảng rỗng, quyền 4 vai trò + GDVH chưa được giao, tham số sai, ngưỡng số dòng, ranh giới lô, ký tự lạ/ô dài, nhật ký. `package.json` thêm file vào `npm test`. `npm test` 217 ca: 216 pass, 1 skip có chủ đích; `npm run build` ok.
- Hiệu năng (1.145.600 dòng giả trong DB tạm, 3 BCVH; server chạy tiến trình riêng): 1 tháng 533140 (334.800 dòng) 3,4 s; 92 ngày (993.600 dòng) 9,7–9,8 s; RSS nền 71 MB, đỉnh 273 MB (1 tháng) và 294–299 MB (~1 triệu dòng) — không tăng theo số dòng; ngắt giữa chừng → dừng, ghi `aborted`, RSS về ~252 MB, server còn phục vụ. Bản đầu dùng API dòng của ExcelJS: 1 tháng 13,7 s, RSS đỉnh 410 MB (~1 triệu dòng: 750 MB) — đã thay.
- Docs: quyết định #55–#58 (ánh xạ 9 cột; mục #56 là mặc định CTO chọn), bản đồ kiến trúc (2 endpoint, ma trận quyền), `THIRD_PARTY_NOTICES.md` (+`exceljs` 4.4.0, `csv-parse` 7.0.3, đối chiếu LICENSE trong `node_modules`), backlog 7c ✅, 7c1, 7c2.

## [2026-10-09] - Bổ sung 3c-3: test thoát XML + file mẫu

- `tests/arrivals-export.test.js` +1 ca (16 ca): đường thư giả `A & B <C> "D" 'E'`, chữ Việt có dấu, toàn bộ ký tự điều khiển cấm của XML 1.0 → kiểm giá trị đọc lại bằng ExcelJS và XML gốc (đã thoát, không còn ký tự cấm). Chọn **xoá** ký tự cấm (không thay bằng khoảng trắng). Không đổi mã nguồn xuất file. File mẫu giả tạo ngoài repo cho PO mở thử Excel.

## [2026-10-09] - 4 vai trò ADMIN/TTVH/GDVH/STAFF, quản lý tài khoản chỉ ADMIN, gán GDVH ↔ BCVH (SANLUONG-3c-2)

- `server/roles.js` (mới): `ROLES`, `VALID_ROLES`, `VIEWER_ROLES`, `isValidRole`. `server/auth.js`: `authRequired` tra DB (`role`, `deactivated_at`) ở MỌI request (khoá/không còn → 401, role ngoài danh sách → 403, `req.user.role` từ DB; `db.js` nạp lười để fixtures không mở nhầm DB thật); `requireRoles(...)` thay `requireManager`/`isManager` (đã xoá); `requireAdmin` là lớp bọc.
- Routes: `users.js` chỉ ADMIN (trừ `/me/password`), `role` bắt buộc hợp lệ (400), chặn hạ/khoá ADMIN cuối cùng (`server/lib/adminGuard.js`), `bcvh_codes` trong `GET /users`, `GET/PUT /users/:id/bcvh`; `network.js` đọc ADMIN/TTVH/GDVH, ghi/nhập/xoá ADMIN; `arrivals.js` ADMIN/TTVH/GDVH (`canh_bao`, `/exceptions`, `/import-status` vẫn ADMIN); `dashboardWidgets.js` dùng hằng số vai trò.
- `server/db.js` + `server/lib/userBcvh.js` (mới): bảng `user_bcvh` (idempotent), `getAssignedBcvh(userId)` cho 3c-3. Đổi GDVH sang vai trò khác xoá các dòng gán (cùng transaction).
- `scripts/migrate-roles.js` (mới): dry-run mặc định; `--apply` sao lưu + MANAGER→TTVH trong một transaction; role lạ → dừng mã 2; idempotent. PO tự chạy trên DB thật (`06_DEPLOYMENT.md` mục 7).
- Giao diện (tối thiểu): `ROLE_OPTIONS` ở `AddUserModal.jsx`/`UserAdminView.jsx` = STAFF, TTVH, GDVH, ADMIN; nhãn vai trò ở `Sidebar.jsx`; thông báo 403 chung ở `api.js`. Không làm giao diện gán BCVH (backlog 7b).
- Tests: `tests/roles.test.js` (mới, 21 ca: ma trận route × 4 vai trò, vai trò cũ/lạ, chống leo thang, hiệu lực ngay, ADMIN cuối cùng, `user_bcvh`), `tests/migrate-roles.test.js` (mới, 7 ca); 35 ca cũ ở `arrivals-api`/`dashboard-api`/`dashboard-widgets` đổi tài khoản `MANAGER`→`TTVH` (+ GDVH vào ca quyền); `fixtures.js` thêm `loginAs`, `ROLES`. `npm test` 202 ca: 201 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #49–#54, ma trận quyền + `user_bcvh` + `roles.js` trong bản đồ kiến trúc, hướng dẫn chuyển đổi (`06_DEPLOYMENT.md` mục 7), backlog 7a–7e.

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
