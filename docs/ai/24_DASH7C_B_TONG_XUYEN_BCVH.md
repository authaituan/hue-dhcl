# DASH-7c-b — «Toàn Trung tâm» đếm bưu gửi KHÁC NHAU xuyên BCVH (backend)

> Quyết định PO 16/10/2026: thẻ «Toàn Trung tâm» đếm SHBG khác nhau xuyên BCVH (công thức B). Căn cứ số đo: `23_DASH7C_A_SHBG_TRUNG_BCVH.md` (15/10 trên bản sao: A 8.024, B 7.968, lệch 56).
> Chỉ backend; không sửa `src/`; không đọc DB gốc / `.env`; test dùng dữ liệu giả.

## 1. File sửa / mới

| File | Nội dung |
|---|---|
| `server/lib/dashboardDenQuery.js` | `countAcross` (:112) mới; `tongQuanDen` (:268–319, :327) đổi tổng khi `bcvh=all`; export `countAcross` (:417) |
| `tests/dashboard-den-xuyen-bcvh.test.js` | mới, 8 ca (dữ liệu giả, server thật trên DB tạm, cổng 5936) |
| `package.json` | thêm file test mới vào script `test` (script liệt kê từng file; không thêm thì `npm test` bỏ qua) |
| `docs/ai/24_…` (file này), `CHANGELOG_AI.md`, `00_SNAPSHOT.md` (một câu ở dòng Dashboard «Cần điều hành…») | tài liệu |

Mã hiện tại khớp báo cáo 21 (`dashboardDenQuery.js` cộng `vs` ở vùng :229–251 cũ). Không lệch.

## 2. Việc 1–5

**Việc 1 — công thức B.** `countAcross(db, wins)` nhận danh sách cửa sổ `{ rc, day, to }` (mỗi BCVH một cửa sổ: dòng có `arrival_date = day` và `arrival_at` trong `[day 00:00:00, to]`) rồi làm đúng ba bước của `arrivalsQuery.js:227-253`: lọc dòng → mỗi SHBG một khoá `MIN(arrival_at || printf('%012d', id))` (hoà thì id nhỏ nhất) → lấy dòng đại diện. Từ đó tính một lần: bưu gửi, hàng đi ngoài (`aq.DI_NGOAI_SQL`), số có dòng đại diện từ 15:00, SHBG ở ≥ 2 BCVH, số túi/kiện và khối lượng (như `aq.summary`). Khi `bcvh=all`, `tongQuanDen` dùng nó cho `san_luong.buu_gui`, `hang_di_ngoai` (số, tỷ lệ, mẫu số, chênh điểm), `sau_15h` và hai mốc so sánh.

*Quyết định thiết kế «cùng giờ»:* cửa sổ của MỖI BCVH là `[ngày dữ liệu của BCVH 00:00, den_luc của BCVH]` (như `windowFilter`), áp lên từng dòng TRƯỚC khi chọn dòng sớm nhất. Lý do: bảo toàn đúng ý «số bưu gửi BCVH ấy đã nhận tới giờ dữ liệu của nó»; nếu chọn dòng sớm nhất rồi mới cắt giờ, một SHBG có dòng sớm nhất nằm sau giờ cắt của BCVH đó nhưng dòng thứ hai nằm trong giờ cắt của BCVH kia sẽ bị mất, và tổng nhỏ hơn cộng các BCVH vô lý. Có ca test (e2) cho tình huống này. Với một BCVH, kết quả trùng cách tính cũ (một cửa sổ).
*Vì sao không gọi thẳng `buildCountedCte`:* hàm đó chỉ nhận MỘT khoảng `from/to` chung cho mọi BCVH, mà «cùng giờ» là cắt riêng từng BCVH; sửa `arrivalsQuery.js` nằm ngoài phạm vi ticket. Logic được chép giữ nguyên quy tắc và có test đối chiếu `aq.summary` (việc 5). Đề xuất về sau: chuyển thành tuỳ chọn «nhiều cửa sổ» của `buildCountedCte` để chỉ còn một nơi cài quy tắc.

**Việc 2 — mốc so sánh.** Tập BCVH có mốc `set = BCVH có file ngày mốc` (như trước). Với `bcvh=all`, tử số (hôm nay) và mẫu số (mốc) đều là `countAcross` trên đúng `set` đó (`refOf`, :284); BCVH thiếu mốc không góp vào vế nào. `so_bcvh` = số BCVH trong `set` (giữ nguyên). Test (e) kiểm: tuần trước chỉ M có file → tử = B hôm nay chỉ của M (4, không phải 5), kết quả −93,33 %.

**Việc 3 — trường mới (chỉ khi `bcvh=all`, trong `san_luong`):**
- `tong_cong_theo_bcvh`: công thức A (cộng các dòng BCVH).
- `so_shbg_qua_nhieu_bcvh`: số SHBG có mặt ở ≥ 2 BCVH trong cửa sổ hôm nay. A − B = Σ(số BCVH − 1), nên bằng số này khi không SHBG nào ở ≥ 3 BCVH (đo 15/10: cả 56 đều đúng 2 BCVH).
- `tui_kien`, `khoi_luong_g` (theo B): thêm vì ticket yêu cầu tính; API cũ chưa có hai số này.
Tên theo kiểu API hiện có (snake_case tiếng Việt không dấu). Không đổi tên / bỏ trường nào. Không đổi: `theo_bcvh[]`, `san_luong.luot` (vẫn cộng từng BCVH vì «lượt» tính theo (SHBG, BD10, BD8) của từng BCVH; ticket không nêu), `bcvh_can_chu_y`. Khi `bcvh=<một BCVH>` đối tượng `san_luong` không có trường mới (test (f) khoá danh sách khoá).

**Việc 4 — test** (`tests/dashboard-den-xuyen-bcvh.test.js`): (a) 2 BCVH cùng SHBG, giờ khác nhau: B = 5, A = 7, 2 SHBG qua 2 BCVH, dòng từng BCVH 4 và 3; (b) SHBG chỉ ở một BCVH: B = A = 60; (c) hàng đi ngoài xuyên BCVH: đi ngoài 1 (A sẽ 2), túi/kiện 5 (A 7), khối lượng 2.000 g (A 2.850), sau 15:00 = 2; (d) BCVH có file nhưng không có bưu gửi đến: dòng 0, không lỗi; (e) mốc thiếu BCVH: tử và mẫu cùng tập, `so_bcvh` đúng (1 và 2), hôm qua có SHBG đi ngoài trùng hai BCVH đếm 1 lần; (e2) cắt giờ trước khi chọn dòng sớm nhất + không cửa sổ → 0; (f) `bcvh=<một BCVH>` không đổi; (5) đối chiếu `aq.summary`. Ghi chú khi viết test: chỉ mục duy nhất của `arrival_items` là (SHBG, BD10, BD8, mốc bưu gửi), nên dữ liệu giả cùng SHBG + cùng BD8 ở hai BCVH phải khác BD10 mới nạp được.

**Việc 5 — đối chiếu «Sản lượng đến».** Chứng minh bằng test (5): cùng ngày 20/10, cùng 6 BCVH, `tq.san_luong.buu_gui`, `hang_di_ngoai.buu_gui`, `tui_kien`, `khoi_luong_g` bằng đúng `aq.summary(...).san_luong / hang_di_ngoai / tui_kien / khoi_luong_g`. Điều kiện để bằng nhau: giờ cắt của mỗi BCVH ≥ dòng cuối ngày của nó (đúng với «hôm nay» vì `den_luc` là `arrival_at` lớn nhất trong ngày). Khi các BCVH lệch ngày dữ liệu (không ép `date`), thẻ điều hành gộp mỗi BCVH theo ngày của nó nên không so được với một khoảng ngày duy nhất của «Sản lượng đến»; đối chiếu chỉ có nghĩa cùng ngày.

## 3. `npm test`

Chạy một lần (toàn bộ): `ℹ tests 576`, `ℹ pass 575`, `ℹ fail 0`, `ℹ skipped 1`, `ℹ duration_ms 16638.8773`. (Trước đó chỉ chạy riêng file mới bằng `node --test` khi viết test.)

## 4. Hệ quả đã biết

- «Xử lý và tỷ lệ phát» (`phat.js:574` `demNgay`, `phatDashboard.js:62`) KHÔNG đổi, vẫn công thức A. Sau thay đổi này, «Sản lượng đến» của Điều hành (B) có thể nhỏ hơn mẫu số của «Xử lý và tỷ lệ phát» cùng ngày đúng `tong_cong_theo_bcvh − buu_gui`. Cần ticket đo BCVH nào phát hàng chuyển tiếp (cách đo ở báo cáo 23, việc 6c) rồi mới quyết.
- Tổng các dòng `theo_bcvh[]` sẽ lớn hơn thẻ «Toàn Trung tâm» đúng `so_shbg_qua_nhieu_bcvh` (≈ 7 ‰ ngày 15/10); giao diện cần ticket nhỏ ghi chú «N bưu gửi qua 2 BCVH» (dùng `tong_cong_theo_bcvh` và `so_shbg_qua_nhieu_bcvh`).
- Màn tivi (`tivi.js`) gọi cùng endpoint nên cũng thấy số B.
- PO khởi động lại server sau khi merge.

## 5. Xác nhận

Không sửa `src/`; không đọc DB gốc hay `.env`; không `git add`/commit/push; không `npm install`/`ci`; dữ liệu trong test và tài liệu đều là giả (không có SHBG / BD8 / BD10 thật).
