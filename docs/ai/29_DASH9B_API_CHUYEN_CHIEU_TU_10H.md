# DASH-9b — API `chuyen_chieu` (hàng đến chuyến chiều, từ 10:00) cho thẻ Điều hành/Tivi (backend)

> Nối tiếp khảo sát DASH-9a (thẻ «HÀNG ĐẾN SAU 15:00» trống cả ngày vì hàng từ 15:00 chỉ vào file sáng hôm sau). PO chốt phương án A: theo giờ đến, mốc 10:00. Giao diện làm ở DASH-9c.

## Việc 0

- **(a) Ai đọc — đã kiểm chứng (grep).** `sau_15h`: client `DailyOpsDashboard.jsx:772,776,777`, `TiviView.jsx:299,461,566,690-696`; server `dashboardDenQuery.js` (tạo ở `tongQuanDen`); test `dashboard-den.test.js:192,212,260`, `dashboard-den-cung-ngay.test.js:124,125,172,173`, `dashboard-den-xuyen-bcvh.test.js:133,134,175`. `nguong.GIO_MUON` (`TH.GIO_MUON`): server `dashboardDenQuery.js` (`countAcross`, `volumeOf`, `sau_15h`); test `dashboard-den.test.js:140,144`; client KHÔNG đọc `nguong.GIO_MUON` (grep `src/` không thấy).
- **(b) Kiểu và quy ước — đã kiểm chứng (đọc mã + test).** `tu_gio` là SỐ (`15`, không phải `"15:00"`); `da_toi_gio` boolean; `ty_le` là PHÂN SỐ làm tròn 4 chữ số (`ratio4`: `0.2857`), `null` khi mẫu số 0 (không NaN). `den_luc` (ở gốc phản hồi) là chuỗi `'YYYY-MM-DD HH:MM:SS'` = `arrival_at` lớn nhất trong ngày dữ liệu (`bcvhContext`, `dashboardDenQuery.js:76-81`; với `bcvh=all` chỉ lấy từ tập T, `:315`); dùng để so với mốc, và là nguồn «ĐẾN hh:mm» của thẻ Sản lượng (phía giao diện: suy từ mã, chưa đọc lại trong ticket này). Ví dụ `sau_15h`: `{ "buu_gui": 2, "ty_le": 0.2857, "tu_gio": 15, "da_toi_gio": true }`.
- **(c) Công thức B và mốc 10:00 — đã kiểm chứng bằng test.** `countAcross` chọn cho mỗi SHBG dòng có `arrival_at` NHỎ NHẤT xuyên BCVH rồi so giờ với mốc. SHBG đến BCVH1 09:00 và BCVH2 11:00 có giờ đại diện 09:00 ⇒ «trước 10:00», KHÔNG vào `chuyen_chieu` (test «bcvh=all», SHBG `E`: nếu tính từng BCVH riêng thì M2 đếm E, nên tổng A = 5 còn B = 4).

## Việc 1 — thay đổi

| File | Trước → sau |
|---|---|
| `server/config/dashboard-thresholds.js` | thêm `const GIO_CHUYEN_CHIEU = 10` và export riêng `{ DASHBOARD_DEN_THRESHOLDS, GIO_CHUYEN_CHIEU }`. Không nằm trong `DASHBOARD_DEN_THRESHOLDS`: đối tượng đó được trả nguyên ở `nguong` và có test khóa danh sách khóa, nên thêm khóa sẽ đổi hợp đồng cũ |
| `server/lib/dashboardDenQuery.js` | `countAcross`: thêm cột `chieu` (cùng biểu thức với `muon`, tham số `@gc`); `volumeOf`: thêm `chieu` (cùng truy vấn với `muon`, tham số `@chieu`) và `empty.chieu = 0`; `tongQuanDen`: `chieuTong` (B nếu `all`, ngược lại cộng A) và trường `chuyen_chieu` đặt ngay sau `sau_15h` |

Ví dụ phản hồi (số giả): `"chuyen_chieu": { "buu_gui": 4, "ty_le": 0.5714, "tu_gio": 10, "da_toi_gio": true }`. Quy tắc: cùng ngày, tập T, công thức A/B và `da_toi_gio` (theo `den_luc`, không theo đồng hồ) như `sau_15h`; `da_toi_gio = true` khi có BCVH (trong T nếu `all`) với `den_luc` giờ ≥ 10. Không sao chép logic: dùng lại đúng câu truy vấn, chỉ thêm một cột.

## Việc 2 — test

`tests/dashboard-chuyen-chieu.test.js` (mới, 5 ca, dữ liệu giả, cổng 5940, đã thêm vào `package.json`): hằng số và `nguong` không đổi; ranh giới 09:59:59 / 10:00:00 (một BCVH); `da_toi_gio` false với dữ liệu tới 09:34, true với 14:41; `bcvh=all` đếm một lần theo giờ sớm nhất và BCVH ngoài T không vào; BCVH chậm xem riêng; BCVH chưa có dữ liệu `ty_le = null`; `sau_15h` giữ nguyên (so với cùng dữ liệu).
**Test cũ sửa duy nhất**: `tests/dashboard-den.test.js:192` — danh sách khóa phản hồi `tong-quan-den` thêm `'chuyen_chieu'` (bản chất là thêm trường; phép kiểm vẫn là `deepEqual`). Không ca nào bỏ/skip.
`npm test` (một lần): `ℹ tests 604 · ℹ pass 603 · ℹ fail 0 · ℹ skipped 1` (trước 599).

## Chưa kiểm chứng / còn lại

- Chưa kiểm với dữ liệu thật; chưa chạy thử màn hình (không có `src/` đổi).
- Giả định mỗi ngày chỉ có file ~09:30 và ~15:00 (DASH-9a) vẫn là suy từ tài liệu mẫu 04–08/10; thẻ mới sẽ có số từ khi file sáng được nạp (giờ đến ≥ 10:00 xuất hiện ở file chiều).
- `sau_15h` và `GIO_MUON` vẫn còn: client (`DailyOpsDashboard.jsx`, `TiviView.jsx`) và test liệt kê ở Việc 0(a). PO quyết gỡ ở ticket sau (cùng DASH-9c).

## Xác nhận

Không sửa `src/`; không đổi `sau_15h`, `GIO_MUON`, `volumeOf.muon`, `nguong`, `san_luong`, tập T, công thức A/B; không đọc DB thật, `.env`, `data/`; không `node -e` mở DB; không `git add`/commit/push.
