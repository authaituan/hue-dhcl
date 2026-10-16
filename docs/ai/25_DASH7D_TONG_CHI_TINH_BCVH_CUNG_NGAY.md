# DASH-7d — «Toàn Trung tâm» chỉ cộng BCVH có dữ liệu đúng ngày chung (backend)

> Quyết định PO 16/10/2026: khi `bcvh=all`, tổng chỉ cộng các BCVH có «hôm nay» riêng = `ngay_du_lieu` (ngày mới nhất trong các BCVH). Nối tiếp `24_DASH7C_B_TONG_XUYEN_BCVH.md` (công thức B). Chỉ backend; không đọc DB gốc / `.env`; dữ liệu test giả.
> Bối cảnh (màn hình 16/10 13:08): A Lưới chưa có file 16/10, dùng 15/10 (216 bưu gửi) → thẻ tổng 4.008 so với «Sản lượng đến» 3.792.

## 1. File sửa / mới

| File | Nội dung |
|---|---|
| `server/lib/dashboardDenQuery.js` | `tongQuanDen`: `header` tính sớm (:264), tập T `inT` (:268), `vsRows` giới hạn trong T (:269), `trongT`/`den_luc`/trường mới (:313–320), `da_toi_gio` (:338) |
| `tests/dashboard-den-cung-ngay.test.js` | mới, 8 ca, cổng 5937 |
| `tests/phat.test.js` | sửa 1 khẳng định cũ có chủ đích (mục 4) |
| `package.json` | thêm file test mới vào `npm test` |
| `docs/ai/25_…` (file này), `CHANGELOG_AI.md`, `00_SNAPSHOT.md` | tài liệu |

Mã khớp báo cáo 24: không lệch.

## 2. Việc 1–6

**Việc 1 — tập T.** `T = { BCVH: ngay_du_lieu riêng === header.ngay_du_lieu }` (chỉ khi `bcvh=all`; BCVH chưa có file nào có ngày null nên ra ngoài T). `vsRows`/`vs` (đầu vào của mọi phép cộng và của `countAcross`) chỉ còn T; sản lượng, hàng đi ngoài, túi/kiện, khối lượng, `luot`, `sau_15h`, A (`tong_cong_theo_bcvh`) và `so_shbg_qua_nhieu_bcvh` đều tính trên T, vẫn công thức B của DASH-7c-b. Khi ép `date`, mọi BCVH cùng ngày nên T = cả 6 (kết quả y như DASH-7c-b). `bcvh=<một BCVH>`: không áp T.

**Việc 2 — mốc so sánh.** `refOf` đã lấy tập từ `vsRows` nên hai mốc tự tính trên T; trong T, BCVH thiếu file ngày mốc vẫn bị bỏ khỏi tử và mẫu như cũ. **`so_bcvh` nay là số BCVH TRONG T có file ngày mốc** (trước: trong cả 6). BCVH ngoài T không lọt vào mốc nào (test (c): BCVH chậm có file 14/10 không làm đổi mốc hôm qua).

**Việc 3 — `den_luc`.** Trước đây `headerOf` lấy `den_luc` lớn nhất của MỌI BCVH. Vì BCVH ngoài T luôn có ngày cũ hơn nên chỉ lọt vào khi T không có `den_luc` nào, nhưng cho chắc, `den_luc` của `bcvh=all` nay tính riêng từ BCVH trong T (:315). `nap_luc` KHÔNG đổi (vẫn lấy mọi BCVH; chưa nằm trong yêu cầu, xem mục 3).

**Việc 4 — trường mới (chỉ thêm, chỉ `bcvh=all`, ở gốc phản hồi):** `so_bcvh_trong_tong` (số BCVH trong T) và `bcvh_ngoai_tong` (`[{ ma, ngay }]`, thứ tự như danh sách 6 BCVH; `ngay` là ngày mới nhất của BCVH đó, hoặc null). `san_luong.tong_cong_theo_bcvh` và `so_shbg_qua_nhieu_bcvh` giữ nguyên tên, nay tính trên T.

**Việc 5 — kiểm kê** (mục 3 dưới đây).

**Việc 6 — test** (`dashboard-den-cung-ngay.test.js`): (a) BCVH chậm ngoài tổng (B 5, A 6, ngoài tổng đúng, dòng riêng giữ số ngày cũ, `bcvh_can_chu_y.tong` vẫn 6); (a2) đi ngoài, túi/kiện, khối lượng, sau 15:00, `den_luc`, `da_toi_gio` chỉ từ T; (b) ép `date` → T = 6, `bcvh_ngoai_tong` rỗng; (c) mốc cùng T; (d) BCVH chưa có file → `ngay` null, không lỗi; (e) SHBG xuyên 2 BCVH trong T → A − 1; (f) `bcvh=<một BCVH>` không đổi (khoá `san_luong` cũ, không trường mới, kể cả BCVH chậm); (g) tổng = `aq.summary` ngày chung, 6 BCVH (đúng điều PO sẽ đối chiếu).

## 3. Kiểm kê số cộng nhiều BCVH trong phản hồi `bcvh=all`

| Số | Đổi theo T? |
|---|---|
| `san_luong.buu_gui`, `.tong_cong_theo_bcvh`, `.so_shbg_qua_nhieu_bcvh`, `.tui_kien`, `.khoi_luong_g`, `.luot` | **Có** (chỉ T) |
| `san_luong.so_hom_qua_cung_gio`, `.so_tuan_truoc_cung_gio` (kể cả `so_bcvh`), `hang_di_ngoai.*` (kể cả mốc) | **Có** (cùng T) |
| `sau_15h.buu_gui`, `.ty_le` | **Có** |
| `sau_15h.da_toi_gio` | **Có — ngoài đúng chữ ticket, có chủ đích**: trước đây dựa mọi BCVH; BCVH chậm đã tới 16:00 của ngày cũ sẽ làm cờ «đã tới 15:00» đúng trong khi số «sau 15:00» chỉ đếm T. Muốn bỏ thì xoá điều kiện `&& (!useB || …)` ở :338 |
| `den_luc` | **Có** (chỉ T) |
| `ngay_du_lieu` | Không (ngày mới nhất; chính là ngày chung) |
| `cung_ngay_du_lieu` | Không: vẫn `false` khi các BCVH lệch ngày (đúng mục đích: báo có BCVH chậm) |
| `nap_luc` | Không: vẫn lấy mọi BCVH |
| `bcvh_can_chu_y` (`so`/`tong` = x/6) | **Không**: đếm trên cả 6 dòng `theo_bcvh`, kể cả BCVH ngoài T (BCVH chậm vẫn có thể có mức cần chú ý của ngày cũ). Đây là số tổng duy nhất không theo T |
| `theo_bcvh[]` | Không |
| `nguong` | Không (hằng số) |
| `/viec-can-lam`, `/phuong-xa-tang` | Không đọc tổng này; mỗi mục theo ngày riêng của BCVH, không đổi |
| «Xử lý và tỷ lệ phát» (`phat.js:574` `demNgay`, `phatDashboard.js`) | **Không đổi, tự tính độc lập** từ `den.bcvhContext/windowFilter/runCounted` rồi cộng từng BCVH theo ngày riêng của nó (công thức A trên tập cũ). Không đọc `tong-quan-den`. Hệ quả: khi các BCVH lệch ngày, mẫu số phát = tổng mọi BCVH ngày riêng; thẻ tổng Điều hành = chỉ T |
| `tivi.js` | Gọi cùng endpoint nên thấy số mới |

## 4. Test cũ sửa có chủ đích

`tests/phat.test.js` (dòng ~984–990): ca «mẫu số = SHBG đến ngày đó = san_luong của tong-quan-den» có khẳng định `macDinh.mau_so (3 + 5) === tong-quan-den?bcvh=all.san_luong.buu_gui` ở tình huống M mới nhất 03/10, M2 mới nhất 04/10 (lệch ngày). Sau DASH-7d thẻ tổng chỉ còn M2 (5) → 3 + 5 ≠ 5. Đã thay bằng: thẻ tổng = 5, `so_bcvh_trong_tong` = 1, và `mau_so` = `tong_cong_theo_bcvh + 3`. Khẳng định cùng ngày (`date=2026-10-02`) ở dòng 979 vẫn giữ nguyên và vẫn đạt. Đây chính là hệ quả PO đã lường: hai số chỉ bằng nhau khi cùng ngày.

## 5. `npm test`

Lần chạy đầu: 584 ca, 582 pass, **1 fail** (ca phat nói trên, do thay đổi có chủ đích). Sau khi sửa ca đó, chạy lại một lần (không chạy chồng):
`ℹ tests 584` · `ℹ pass 583` · `ℹ fail 0` · `ℹ skipped 1` · `ℹ duration_ms 15237.8193`.

## 6. Việc giao diện còn lại (không làm ở đây)

- Ghi chú trên thẻ tổng: «Chưa gồm A Lưới (chưa có dữ liệu 16/10)», dùng `bcvh_ngoai_tong` và `so_bcvh_trong_tong`; đổi nhãn «x/6 BCVH».
- Ghi chú «N bưu gửi qua 2 BCVH» (DASH-7c-b).
- Khi mẫu số «Xử lý và tỷ lệ phát» còn công thức cũ, cần ticket riêng để thống nhất (sau khi đo BCVH phát hàng chuyển tiếp, báo cáo 23 mục 6c).
- PO khởi động lại server sau khi merge.

## 7. Xác nhận

Không sửa `src/`; không sửa `phat.js` / `phatDashboard.js`; không đọc DB gốc hay `.env`; không `git add`/commit/push; không `npm install`/`ci`; dữ liệu test và tài liệu đều giả.
