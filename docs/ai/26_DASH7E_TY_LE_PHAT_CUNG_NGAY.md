# DASH-7e — «Xử lý và tỷ lệ phát» (tổng): mẫu số và tử số theo NGÀY CHUNG (backend)

> Quyết định PO 16/10/2026 13:51: tỷ lệ phát «Toàn Trung tâm» chỉ tính các BCVH có dữ liệu đúng ngày chung (cùng tập T như DASH-7d). Hôm nay mẫu số = 3.792, không cộng 216 của A Lưới ngày hôm qua.
> Nối tiếp `24_…` (công thức B) và `25_DASH7D_…` (tập T). Chỉ backend; không đọc DB gốc / `.env`; dữ liệu test giả.

## 1. File sửa / mới

| File | Nội dung |
|---|---|
| `server/lib/phat.js` | `tapNgayChung` mới (:631, export ở cuối file); `tyLeApi` (:646–671) dùng tập T khi `bcvh=all` và không có `ngay` |
| `server/lib/phatDashboard.js` | `ketQuaPhat` (:60–67, trường mới ở `cung_ngay` kế bên) dùng `P.tapNgayChung` |
| `tests/phat-cung-ngay.test.js` | mới, 8 ca, dữ liệu giả, cổng 5938 |
| `tests/phat.test.js`, `tests/phat-dashboard.test.js` | sửa khẳng định cũ có chủ đích (mục 4) |
| `package.json` | thêm file test mới vào `npm test` |
| `docs/ai/26_…` (file này), `CHANGELOG_AI.md`, `00_SNAPSHOT.md` | tài liệu |

Không sửa `dashboardDenQuery.js`, `src/`. Mã khớp báo cáo 24/25 (mẫu số quanh `phat.js:574` là `demNgay`, `phatDashboard.js:62–63`): không lệch.

## 2. Việc 1 — khảo sát (trả lời a, b, c)

**(a) Mẫu số tổng lấy ngày thế nào.** Có hai điểm tổng hợp, cùng một cách: với mỗi BCVH lấy ngày `ngay || aq.latestFileDate(db, [c], byUnit)` (ngày file OK mới nhất CỦA BCVH đó) rồi `demNgay(db, c, day)` (`phat.js` hàm `demNgay`, dùng `den.windowFilter(c, day, '23:59:59')` = công thức A, mỗi BCVH đếm SHBG khác nhau riêng) và cộng bằng `congMap`. Điểm 1: `phat.js` `tyLeApi` (`GET /api/phat/ty-le`). Điểm 2: `phatDashboard.js:63` (`per = codes.map(... p.ngay || aq.latestFileDate ...)`) rồi cộng ở vòng `for` kế tiếp (`GET /api/arrivals/dashboard/ket-qua-phat`). BCVH chưa có file nào bị bỏ (`day` null).

**(b) Tử số lấy thế nào.** CÙNG hàm, CÙNG ngày với mẫu số: `demNgay` trả `tong` = số SHBG đến ngày đó theo từng trạng thái hiện tại (`COALESCE(p.trang_thai, 'CHUA_CO_TT')`, join `phat_status_current` theo (bcvh, shbg)); mẫu số là tổng 5 nhóm của chính `tong`. Tử số và mẫu số không bao giờ lệch ngày hay lệch tập BCVH → **không có xung đột quy tắc ngày, không phải dừng hỏi**. Các số khác cùng vòng lặp: khung giờ đến (`khung`), tồn chờ (`tonCho`, chỉ `tyLeApi`) và giờ nhập `so_lieu_den_luc` (`tyLeApi`: đợt muộn nhất của các BCVH trong vòng; `ketQuaPhat`: `nhap_luc_max` theo ngày của từng BCVH).

**(c) Tham số.** `ngay` (query `ngay`, `ty-le` và `ket-qua-phat`; `date` ở `ket-qua-phat` là tham số lạ → 400) ép MỘT ngày cho mọi BCVH trong phạm vi; không có `ngay` thì mỗi BCVH dùng ngày mới nhất của nó. `cung_ngay` = tập các ngày đã dùng có ≤ 1 phần tử (true khi mọi BCVH cùng ngày, false khi có BCVH chậm). `ngay` ở phản hồi = ngày ép, hoặc ngày lớn nhất trong các ngày dùng.

## 3. Việc 2–5

**Việc 2 — tập BCVH.** `tapNgayChung(byUnit, codes, ngay)` trả `{ ngay_chung, trong, ngoai }`: T = BCVH có ngày riêng `byUnit.get(ma)` bằng ngày lớn nhất trong `codes`; `ngoai` = `[{ma, ngay}]` (ngay = ngày mới nhất của BCVH đó hoặc null); có `ngay` rõ ràng thì T = toàn bộ `codes`, `ngoai` rỗng. Định nghĩa trùng DASH-7d (`header.ngay_du_lieu` và `inT` ở `dashboardDenQuery.js`); **cách tái dùng:** không sửa `dashboardDenQuery.js` (cấm); tách một hàm nhỏ trong `phat.js` (nơi cả hai đường phát đều đã import) và có test đối chiếu hai bên (ca (4): `so_bcvh_trong_tong` và `bcvh_ngoai_tong` của phát = của `tongQuanDen`). Áp dụng khi `bcvh=all` và không có `ngay`:
- `tyLeApi`: mẫu số, 5 nhóm (tử số), khung giờ, tồn chờ, `so_lieu_den_luc` chỉ tính T. `cung_ngay` vẫn xét mọi BCVH có file (giữ `false` khi lệch ngày — để giao diện biết có BCVH chậm). `ngay` = ngày chung.
- `ketQuaPhat`: mẫu số, tử số, `co_so_lieu_phat`, `so_lieu_den_luc` chỉ tính T. `pham_vi`, `cung_ngay`, `xep_hang_bcvh`, `chua_du_du_lieu` KHÔNG đổi (xếp hạng từng BCVH vẫn theo ngày riêng của nó; BCVH chậm vẫn hiện trong «chưa đủ dữ liệu»).
- Có `ngay` rõ ràng hoặc một BCVH: kết quả như trước.

**Việc 3 — trường mới (chỉ thêm, chỉ khi `bcvh=all`):** `so_bcvh_trong_tong` (số BCVH trong T) và `bcvh_ngoai_tong` (`[{ma, ngay}]`), đúng tên và nghĩa của DASH-7d. Có `ngay` rõ ràng: `so_bcvh_trong_tong` = số BCVH đã được tính (ở `ty-le`: các BCVH có file; ở `ket-qua-phat`: cả phạm vi), `bcvh_ngoai_tong` rỗng.

**Việc 4 — đối chiếu thẻ** (test (4), dữ liệu giả): khi các BCVH lệch ngày, mẫu số phát tổng = `san_luong.tong_cong_theo_bcvh` của `tong-quan-den` (cả hai công thức A); khi `so_shbg_qua_nhieu_bcvh = 0` thì còn bằng `san_luong.buu_gui`. Có ca ngày rõ ràng 15/10 (S1 qua 2 BCVH): mẫu số phát 7 = `tong_cong_theo_bcvh`, thẻ Điều hành `buu_gui` 6 (đúng tinh thần «mẫu số vẫn A»).

**Việc 5 — test** (`tests/phat-cung-ngay.test.js`): (a) BCVH chậm ngoài mẫu số/tử số/khung giờ/tồn chờ/giờ nhập, `bcvh_ngoai_tong` đúng; (a2) tương tự cho `ket-qua-phat`, xếp hạng không đổi; (4) đối chiếu thẻ; (b) mọi BCVH trong phạm vi cùng ngày: như trước; (c) có `ngay`: như trước (cả 16/10 và 15/10); (d) một BCVH: như trước, không trường mới; (e) BCVH chưa có file nào: không lỗi; thêm kiểm `tapNgayChung` thuần. Test cũ sửa: mục 4.

## 4. Test cũ sửa có chủ đích

- `tests/phat.test.js` (ca «tỷ lệ: mẫu số = SHBG đến ngày đó = san_luong của tong-quan-den…», ~dòng 982–993; đã sửa một phần ở DASH-7d): bỏ khẳng định `mau_so = 3 + 5`. Nay mặc định (M mới nhất 03/10, M2 04/10): `mau_so = 5`, `so_bcvh_trong_tong = 1`, M nằm ngoài tổng (`ngay` 03/10), mẫu số = `tong_cong_theo_bcvh` = `buu_gui` của `tong-quan-den`, và `so_lieu_den_luc` = giờ nhập đợt gần nhất CỦA M2 (không còn tính đợt của M).
- `tests/phat-dashboard.test.js`: 294 → 245 (60 + 50 + 80 + 55: không cộng 49 của M3 mới tới 19/10) ở ba chỗ (`?bcvh=all` cho GDVH, ca «tất cả BCVH…», ca xếp hạng/GDVH thấy đủ); ca «tất cả BCVH» đổi tên, thêm kiểm `PTC.so = 36 + 45 + 0 + 33`, `ptc = 114/245`, `so_bcvh_trong_tong = 4`, `bcvh_ngoai_tong` = M3 (19/10) và BCVH 535790 (null); với `ngay=D` giữ nguyên số cũ (245) và `so_bcvh_trong_tong = 6`.
- Lý do chung: các ca đó khẳng định hành vi PO đã đổi (cộng mọi BCVH theo ngày riêng). Mọi khẳng định cùng ngày / một BCVH / ngày rõ ràng giữ nguyên và vẫn đạt.

## 5. `npm test`

Chạy một lần (toàn bộ), sau khi cập nhật các ca cũ ở mục 4 bằng cách chạy riêng từng file test liên quan khi viết:
`ℹ tests 592` · `ℹ pass 591` · `ℹ fail 0` · `ℹ skipped 1` · `ℹ duration_ms 14741.9718`.

## 6. Hệ quả đã biết

- Mẫu số vẫn đếm theo công thức A (mỗi BCVH đếm riêng rồi cộng); chuyển sang B chờ đo (DASH-7c-c). Khi có SHBG qua 2 BCVH, mẫu số phát lớn hơn thẻ «Sản lượng đến» đúng `so_shbg_qua_nhieu_bcvh`.
- Tỷ lệ từng BCVH với hàng chuyển tiếp (SHBG phát ở BCVH nào) chưa xử lý — chờ DASH-7c-c.
- Xếp hạng BCVH trong `ket-qua-phat` vẫn lấy ngày riêng của từng BCVH; BCVH chậm xuất hiện với số ngày cũ của nó (giao diện nên ghi chú).
- Giao diện chưa dùng `so_bcvh_trong_tong` / `bcvh_ngoai_tong`: cần ghi chú «A Lưới chưa có dữ liệu 16/10» ở các thẻ phát tổng. `ty-le` đổi cả khung giờ đến và tồn chờ theo T (cùng vòng lặp với mẫu số).
- PO khởi động lại server sau khi merge; kiểm hôm nay mẫu số trên Điều hành = 3.792 = «Sản lượng đến».

## 7. Xác nhận

Không sửa `src/` và `dashboardDenQuery.js`; không đọc DB gốc hay `.env`; không `git add`/commit/push; không `npm install`/`ci`; dữ liệu test và tài liệu đều giả.
