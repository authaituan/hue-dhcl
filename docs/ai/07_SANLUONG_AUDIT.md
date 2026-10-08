# 📦 SANLUONG-1 — Khảo sát dữ liệu "Hàng đến" (CSV) & đề xuất thiết kế nạp

> Chỉ khảo sát + đề xuất, chưa có code ứng dụng. Ngày khảo sát: 2026-10-08.
> Mẫu: 9 file trong `data/samples/` (đã bị `.gitignore` chặn bởi `/data/`, kiểm bằng `git check-ignore`).
> Danh mục mạng lưới đọc từ **bản sao tạm** của `data/hue-dhcl.db` (chỉ 3 bảng tỉnh/BĐX/bưu cục, không mở `users`, bản sao đã xoá).
> Không in thông tin cá nhân. Mức chắc chắn: **[chắc]** = thấy trực tiếp trong dữ liệu; **[đoán]** = suy luận, cần PO/nghiệp vụ xác nhận.

## 1. Kiểm kê file

| File | Mã đơn vị | Ngày | Giờ chạy | Dung lượng (byte) | Số dòng dữ liệu | Ghi chú |
|---|---|---|---|---|---|---|
| HangDen_533140_20261004_093012.csv | 533140 | 04/10 (CN) | 09:30:12 | 410 296 | 1 304 | |
| HangDen_533140_20261004_150011.csv | 533140 | 04/10 (CN) | 15:00:11 | **3** | **0** | **Chỉ có 3 byte BOM — KHÔNG có cả dòng tiêu đề** |
| HangDen_533140_20261005_093012.csv | 533140 | 05/10 | 09:30:12 | 473 942 | 1 518 | |
| HangDen_533140_20261005_150011.csv | 533140 | 05/10 | 15:00:11 | 372 760 | 1 213 | |
| HangDen_533140_20261006_093012.csv | 533140 | 06/10 | 09:30:12 | 469 309 | 1 495 | |
| HangDen_533140_20261006_163011.csv | 533140 | 06/10 | **16:30:11** | 344 472 | 1 075 | giờ chiều đổi từ 15:00 → 16:30 |
| HangDen_533140_20261007_093012.csv | 533140 | 07/10 | 09:30:12 | 733 520 | 2 241 | |
| HangDen_533140_20261007_163012.csv | 533140 | 07/10 | 16:30:12 | 617 917 | 1 964 | |
| HangDen_533140_20261008_093012.csv | 533140 | 08/10 | 09:30:12 | 690 874 | 2 292 | |

Tổng 13 102 dòng. Giờ chạy lệch 1 giây giữa các lần (`…11`/`…12`) → **không được so khớp giờ chính xác trong tên file**; chỉ dùng ngày + đợt (sáng/chiều) suy từ giờ.

## 2. Định dạng [chắc]
- Mã hoá **UTF-8 có BOM** (`EF BB BF`), không có ký tự lỗi (U+FFFD = 0). Có 1 ký tự lạ: `Ð` (U+00D0, chữ Eth) thay cho `Đ` trong `Ghi_chu` (`Bộ;Ði ngoài(BK)`) → chuẩn hoá khi so sánh.
- Phân cách `,`; **mọi trường đều nằm trong `"…"`**; không có xuống dòng trong trường; xuống dòng **CRLF**; có CRLF cuối file.
- Mọi dòng đúng 16 trường; tiêu đề **giống hệt nhau** ở cả 8 file có tiêu đề (không trôi cột).
- Tiêu đề chính xác (thứ tự):
  1 `Ma_BC_dong` · 2 `BC_nhan_BG` · 3 `Ten_duong_thu` · 4 `SHBG` · 5 `So_hieu_BD10` · 6 `Thời gian XN túi` · 7 `Thời gian XN BG` ·
  8 `Ngay_gio_XND_BD10` · 9 `Ngay_gio_XND_BD10_tai_TTKT` · 10 `So_hieu_BD8` · 11 `Khoi_luong_thuc_te` · 12 `Dich_vu_code` ·
  13 `Ten_dich_vu` · 14 `Ghi_chu` · 15 `Ten_Xa_Phuong` · 16 `Ten_Tinh_Thanh`
  (cột 6, 7 có dấu và khoảng trắng — bộ đọc phải so tiêu đề theo chuỗi UTF-8 chính xác).
- **Ngày giờ dạng Mỹ `M/D/YYYY h:mm:ss AM|PM`** (vd `10/4/2026 8:29:46 AM`; có giá trị `9/30/2026 …` chứng minh thứ tự tháng/ngày). Không có múi giờ → hiểu là giờ Việt Nam. Đọc nhầm thành ngày/tháng sẽ đảo ngày 4/10 ↔ 10/4.

## 3. Hồ sơ từng cột (13 102 dòng)

| # | Cột | Kiểu suy ra | Rỗng | Khác nhau | Min/Max · định dạng | Mẫu (≤3) | Ý nghĩa suy ra |
|---|---|---|---|---|---|---|---|
| 1 | Ma_BC_dong | mã 6 số (CHỮ) | 186 | 534 | `999999` | 531950, 533140, 763430 | Bưu cục **đóng túi/gửi đi** (nơi đi) [đoán, khá chắc: trùng 6 số đầu `So_hieu_BD10` ở 57% dòng] |
| 2 | BC_nhan_BG | mã 6 số (CHỮ) | 0 | **1** | luôn `533140` | 533140 | Bưu cục **nhận** = mã đơn vị trong tên file [chắc] |
| 3 | Ten_duong_thu | chữ | 779 | 5 | ≤36 ký tự | "TP Huế - Sàn KT KCN - BCVH Thuận Hóa", "TP Huế - BĐ TP Huế - Sàn KT KCN", "TP Huế - Sàn KT KCN - Hương Trà" | Tên đường thư vận chuyển [chắc] |
| 4 | SHBG | mã 13 ký tự `AA999999999AA` | 0 | 12 848 | chuẩn UPU S10 (RB…VN, CE…, EL…) | (dạng `AA999999999AA`, không in giá trị thật) | Số hiệu bưu gửi [chắc] |
| 5 | So_hieu_BD10 | mã 18–19 số (**bắt buộc CHỮ**) | 779 | 104 | 18–19 chữ số, **vượt giới hạn số nguyên an toàn** (Excel/JS sẽ làm tròn) | (18–19 chữ số, không in giá trị thật) | Số hiệu bảng kê/chuyến thư BD10: 6 số BC đi + 6 số BC đến + số thứ tự [đoán] |
| 6 | Thời gian XN túi | ngày giờ | 1 515 | 2 953 | 04/10 07:54 → 08/10 08:49 | 10/4/2026 8:29:46 AM | Thời điểm xác nhận **túi** đến tại BC nhận [đoán] |
| 7 | Thời gian XN BG | ngày giờ | **145** | 7 936 | 03/10 15:18 → 08/10 08:48 | 10/4/2026 9:21:54 AM | Thời điểm xác nhận **bưu gửi** đến tại BC nhận [đoán, khớp cửa sổ file — xem mục 4] |
| 8 | Ngay_gio_XND_BD10 | ngày giờ | 9 903 (76%) | 28 | 30/09 → 08/10 | 10/4/2026 8:00:00 AM | Xác nhận đến của chuyến BD10 [đoán]; thưa |
| 9 | Ngay_gio_XND_BD10_tai_TTKT | ngày giờ | 1 087 | 339 | **23/07** → 08/10 | 10/3/2026 11:59:26 AM | Xác nhận BD10 tại Trung tâm khai thác (trước khi về BC) [đoán]; có giá trị cũ bất thường |
| 10 | So_hieu_BD8 | mã CHỮ, 2 dạng | 677 | 2 816 | `999999999999AAA99999999999999` (túi) hoặc `AA999999999AA` | (2 dạng như cột trước, không in giá trị thật) | Số hiệu túi (BD8); bưu kiện "đi ngoài" không có túi thì mang số hiệu bưu gửi [đoán] |
| 11 | Khoi_luong_thuc_te | số nguyên | 0 | 1 091 | 0 → 67 000, không có dấu thập phân | 50, 2430, 1000 | Khối lượng thực tế, **gam** [đoán] |
| 12 | Dich_vu_code | mã 1 chữ | 186 | 5 | R 8 925 · C 2 062 · E 900 · M 572 · B 457 | R, B, E | Mã dịch vụ [chắc] |
| 13 | Ten_dich_vu | chữ | 186 | 5 | R=Bưu phẩm bảo đảm, C=Bưu kiện, E=EMS, M=KT1, B=Phát hành báo chí (1-1 với mã) | | Tên dịch vụ [chắc] |
| 14 | Ghi_chu | chữ có cấu trúc `x;y` | 2 286 | 355 | ≤67 ký tự | "Bộ;Tổng hợp (Túi)" 6 397, "Bộ;Đi ngoài(BK)" 1 933, "Bộ;Chuyển hoàn(Túi)" 718 | Loại túi/khai thác [đoán]. **Không thấy dữ liệu cá nhân** (0 chuỗi dạng số điện thoại); vẫn coi là văn bản tự do khi lưu/hiển thị |
| 15 | Ten_Xa_Phuong | tên phường/xã | 1 416 (10,8%) | 142 | | Phường Kim Long, Phường Phú Xuân, Phường Thuận An | Phường/xã **địa chỉ nhận** [đoán] — tên mới sau 01/07/2025 |
| 16 | Ten_Tinh_Thanh | tên tỉnh | 649 | 36 | | Tỉnh Thừa Thiên Huế (12 043), TP. Hồ Chí Minh, TP. Hà Nội | Tỉnh của địa chỉ trên [đoán]; dùng **tên tỉnh cũ** "Thừa Thiên Huế" dù phường là tên mới |

- Không cột nào có số 0 đứng đầu trong mẫu, nhưng **mọi mã/số hiệu (cột 1, 2, 4, 5, 10) phải lưu dạng CHỮ**.
- File **không có cột tên/địa chỉ/điện thoại người nhận** → không có dữ liệu cá nhân trực tiếp; `SHBG` tra cứu được hành trình công khai nên chỉ hiển thị cho người có quyền.
- Mẫu rỗng đáng chú ý: 185 dòng chỉ có `BC_nhan_BG, SHBG, XN_BG, Khoi_luong, Ten_Tinh` (không túi, không BD10, không dịch vụ) [đoán: hàng nhận lẻ không qua túi].

**Ứng viên cột "ngày" cho bộ lọc lịch** (PO chọn):
| Ứng viên | Có giá trị | Nhận xét |
|---|---|---|
| **`Thời gian XN BG`** (khuyến nghị) | 98,9% | Khớp cửa sổ sáng/chiều; không chồng lấn giữa file |
| `Thời gian XN túi` | 88,4% | Gần như cùng thời điểm, thiếu nhiều hơn |
| Ngày + đợt trong tên file | 100% | Luôn có; "ngày" = ngày file (hàng 15:00–24:00 hôm trước tính vào hôm sau) |
| `Ngay_gio_XND_BD10_tai_TTKT` | 91,7% | Là thời điểm ở trung tâm khai thác, không phải đến bưu cục |

## 4. Khoá & trùng lặp [chắc]

| Ứng viên khoá | Trùng trong 1 file | Trùng giữa các file |
|---|---|---|
| SHBG | 204 | 62 |
| SHBG + BD10 | 23 | 53 |
| SHBG + XN_BG | 204 | 0 |
| SHBG + BD10 + XN_BG | 23 (khác nhau ở BD8) | 0 |
| SHBG + BD10 + BD8 | 0 | 53 |
| **SHBG + BD10 + BD8 + XN_BG** | **0** | **0** |
| Toàn bộ dòng | 0 | 0 |

- **Một SHBG xuất hiện nhiều dòng là hợp lệ**: 183 SHBG có 2–5 dòng trong cùng file (164×2, 18×3, 1×5); các dòng khác nhau ở BD8 (173), BD10 (164), đường thư, BC đóng → cùng bưu gửi đi qua nhiều túi/chuyến [đoán]. 50 SHBG xuất hiện ở ≥2 file, **luôn khác thời gian XN** → là lần xác nhận đến mới (vd chuyển hoàn, phát lại) chứ không phải file chồng dữ liệu.
- **Cửa sổ thời gian** (theo `Thời gian XN BG`, min → max):

| File | Min | Max |
|---|---|---|
| 04/10 sáng | 03/10 15:18 | 04/10 09:21 |
| 04/10 chiều | — rỗng — | |
| 05/10 sáng | 04/10 15:07 | 05/10 09:16 |
| 05/10 chiều (15:00) | 05/10 09:32 | 05/10 14:34 |
| 06/10 sáng | 05/10 15:12 | 06/10 08:55 |
| 06/10 chiều (16:30) | 06/10 09:45 | 06/10 14:35 |
| 07/10 sáng | 06/10 15:01 | 07/10 09:21 |
| 07/10 chiều (16:30) | 07/10 09:35 | 07/10 14:54 |
| 08/10 sáng | 07/10 16:58 | 08/10 08:48 |

  → Ranh giới thực tế ≈ **09:30** và **15:00** (không phải 15:30), và **không đổi khi giờ chạy chiều chuyển sang 16:30**: hàng 15:00–16:30 vẫn vào file sáng hôm sau. Không chồng lấn (khoá đầy đủ trùng giữa file = 0). Không chứng minh được "không hở": các khoảng trống 04/10 09:21–15:07 (Chủ nhật, file chiều rỗng) và 07/10 14:54–16:58 có thể là không có hàng thật.

## 5. Khớp danh mục mạng lưới
Danh mục: 1 tỉnh, 44 BĐX, 185 bưu cục, 40 phường/xã mới (`post_offices.new_ward_name`), 131 tên phường/xã cũ.

- **`BC_nhan_BG` = 533140 khớp 100%** → bưu cục "BCVH Thuận Hóa" (loại PH1), BĐX `5375 BCVH Thuận Hóa`. Đây là **bưu cục phát/khai thác** nhận hàng cho **36/40 phường/xã** (không có: Long Quảng, Khe Tre, A Lưới 1, A Lưới 5) → mã đơn vị trong tên file chính là bưu cục nhận.
- `Ma_BC_dong`: 38/534 mã khớp danh mục, 70,2% số dòng — phần còn lại là bưu cục ngoài tỉnh (nơi gửi), không dùng cho bộ lọc.
- **`Ten_Xa_Phuong`** (sau chuẩn hoá hoa-thường/dấu/khoảng trắng):
  - Khớp tên phường/xã mới: **11 516 dòng (87,9%)**; rỗng: 1 416 (10,8%); khớp tên **cũ** trước 01/07/2025: 1 dòng ("Phường Phú Thuận"); không khớp: 169 dòng / 105 giá trị.
  - Giá trị không khớp đều là phường/xã **tỉnh khác** (Ten_Tinh_Thanh ≠ Huế) hoặc lỗi chính tả nguồn ("Hòan Kiếm", "Hòang Liệt"): Phường Điện Biên Phủ 28, Phường Tân Phước 5, Phường Tân Bình 4, Phường Thanh Khê 3, Phường Tăng Nhơn Phú 3, Phường Tân Hưng 3, Xã Tân Phú 3, và 98 giá trị khác mỗi giá trị 1–2 dòng (Phường Xuân Hòa, Xã Đức Trọng, Xã Vĩnh Thủy, Phường Nam Nha Trang, Phường Tân Sơn Hòa, Phường Hòan Kiếm, Xã Diễn Châu, Phường Thạnh Mỹ Tây, Phường Phước Thắng, Xã Kiến Minh, Phường Cam Ly - Đà Lạt, Phường Hòa Khánh, Phường Hòa Cường, Phường Bà Rịa, Phường Tam Phước, Phường Tam Hiệp, Phường Cam Đường, Phường An Khê, Phường Phổ Yên, Phường Láng, Xã Đồng Tiến, Phường Hoa Lư, Phường Sài Gòn, Phường Long Biên, Phường Hải Châu, Phường Đông Hà, Phường Đồng Hới, Phường Ba Đình, Phường Cầu Giấy, Phường Gò Vấp, …). Danh sách đầy đủ tái tạo được bằng cùng phép so khớp khi nạp.
  - Dòng ngoài tỉnh chủ yếu là "Tổng hợp (Túi)" dịch vụ R và hàng không ghi chú [đoán: hàng chuyển tiếp/chuyển hoàn].
- **Phường/xã → BĐX**: 35/40 phường có đúng 1 BĐX mang tên "Bưu điện <phường/xã>". 5 trường hợp phải ánh xạ tay: "Xã Chân Mây – Lăng Cô" (chỉ lệch dấu gạch `–`/`-`), Long Quảng, A Lưới 1, A Lưới 4, A Lưới 5 (BĐX không cùng tên). Ngoài ra có 9 BĐX không mang tên phường (BCVH Hương Trà/Hương Thủy/Thuận An/Thuận Hóa/Phú Lộc/A Lưới, Văn phòng BĐTP, KTC1, Chân Mây). 39/40 phường có >1 bưu cục → **không suy ra được bưu cục phát cụ thể từ phường**.
- **Suy ra BĐX / bưu cục từ 1 dòng**:
  - Bưu cục: chỉ có `BC_nhan_BG` (= mã đơn vị file) — trực tiếp, chắc chắn, nhưng hiện chỉ có 1 giá trị.
  - BĐX: (a) BĐX của bưu cục nhận (luôn `5375`, lọc vô nghĩa nếu chỉ 1 đơn vị), hoặc (b) BĐX theo **phường/xã địa chỉ nhận** qua bảng ánh xạ phường → BĐX (35 tự động + 5 tay), 12,1% dòng thành "Chưa xác định/Ngoài địa bàn".

## 6. Đề xuất thiết kế (chưa code)

### 6.1 Bảng dữ liệu
`hangden_rows` — 1 dòng CSV = 1 dòng bảng.
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | INTEGER PK | |
| file_id | INTEGER FK → hangden_files | |
| row_key | TEXT UNIQUE | băm của `SHBG|BD10|BD8|XN_BG` (chuỗi thô, rỗng = ''); tránh vấn đề NULL trong UNIQUE |
| unit_code | TEXT | `BC_nhan_BG` |
| ma_bc_dong, ten_duong_thu, shbg, so_hieu_bd10, so_hieu_bd8, dich_vu_code, ten_dich_vu, ghi_chu, ten_xa_phuong, ten_tinh_thanh | TEXT | **giữ nguyên chuỗi thô** |
| xn_tui_raw, xn_bg_raw, xnd_bd10_raw, xnd_bd10_ttkt_raw | TEXT | chuỗi ngày giờ thô |
| xn_tui_at, xn_bg_at, xnd_bd10_at, xnd_bd10_ttkt_at | TEXT `YYYY-MM-DD HH:MM:SS` | đã chuẩn hoá (giờ VN) |
| khoi_luong_g | INTEGER | |
| ngay | TEXT `YYYY-MM-DD` | ngày dùng cho bộ lọc (theo quyết định PO, mặc định từ `xn_bg_at`, thiếu thì ngày đợt của file) |
| ward_norm | TEXT | tên phường đã chuẩn hoá |
| commune_id | TEXT NULL | BĐX suy ra (NULL = chưa xác định/ngoài địa bàn) |
| post_office_id | TEXT NULL | bưu cục nhận (từ `unit_code`) |

Chỉ mục: `(ngay)`, `(commune_id, ngay)`, `(unit_code, ngay)`, `(shbg)`.
`hangden_ward_map` (ward_norm PK, commune_id, ghi_chu) — ánh xạ phường → BĐX, seed tự động theo tên + ADMIN sửa.

**Dung lượng**: ngày đủ 2 đợt 2 570–4 205 dòng (TB ~3 200) → ~1,1–1,5 triệu dòng/năm/đơn vị; ~400–500 byte/dòng kể cả chỉ mục → **~0,5–0,7 GB/năm cho 1 đơn vị**. Nhân theo số đơn vị nếu nạp thêm mã đơn vị khác.

### 6.2 Bảng theo dõi nạp — `hangden_files`
id · file_name · unit_code · batch_date · batch_slot (`SANG`/`CHIEU`, suy từ giờ: < 12:00 = sáng) · run_time · size · sha256 (UNIQUE) · header_ok · row_count · inserted · skipped_dup · status (`OK`/`EMPTY`/`REJECTED`/`ERROR`/`CONFLICT`) · error · source (`SFTP`/`MANUAL`) · imported_by · imported_at.

### 6.3 Idempotent & chống trùng
- File: bỏ qua nếu `sha256` đã nạp (`OK`/`EMPTY`). Cùng tên nhưng **khác băm** → không nạp đè, đánh dấu `CONFLICT` + báo ADMIN (PO quyết có cho thay thế không).
- Mỗi file nạp trong **1 transaction**: lỗi bất kỳ → rollback, ghi `REJECTED/ERROR` + lý do.
- Dòng: `INSERT OR IGNORE` theo `row_key`; số dòng bị bỏ ghi vào `skipped_dup`. Chạy lại không nhân đôi.

### 6.4 Xử lý tình huống
- File 0 byte / chỉ BOM / chỉ tiêu đề → `EMPTY`, 0 dòng, **hợp lệ** (đợt có file nhưng không có hàng).
- Tiêu đề khác danh sách 16 cột chuẩn → `REJECTED`, không nạp dòng nào, ghi log + cảnh báo ADMIN.
- Số trường sai / ngày giờ không đúng `M/D/YYYY h:mm:ss AM|PM` → `REJECTED` cả file (dấu hiệu nguồn đổi định dạng).
- File đang ghi/đang tải: chỉ lấy file có tên đúng mẫu và **kích thước không đổi qua 2 lần quét** (hoặc mtime > 2 phút); tải về tệp tạm rồi đổi tên; kiểm file kết thúc bằng CRLF.
- SFTP không kết nối được: ghi log lỗi, thử lại ở lượt sau, hiển thị "lần đồng bộ cuối thành công lúc …" trên màn hình.
- Thiếu đợt: mỗi ngày/đơn vị kỳ vọng 2 đợt; quá hạn (vd sáng 10:30, chiều 17:30 — PO chốt) mà chưa có bản ghi `hangden_files` → màn hình hiện **"thiếu đợt"** cho ngày đó.

### 6.5 Lấy file
- Thư viện: **`ssh2-sftp-client` 12.1.1** (Apache-2.0, Node ≥ 18.20.4) trên **`ssh2` 1.17.0** (MIT theo kho mã; trường license trên npm trống — xác nhận khi cài). `ssh2` viết bằng JS thuần; phần tăng tốc native (`cpu-features`, binding crypto qua `install.js`) là **tuỳ chọn** và bị bỏ qua với `npm ci --ignore-scripts` → chạy được trên Windows và `node:22-bookworm-slim` không cần biên dịch [cần thử khi cài].
- Thăm dò định kỳ **10–15 phút** (bộ hẹn giờ trong server, khoá chống chạy chồng), liệt kê thư mục, lọc `^HangDen_\d{6}_\d{8}_\d{6}\.csv$`, bỏ qua file đã nạp (theo tên + băm). Không phụ thuộc giờ cố định.
- Biến môi trường (chỉ tên): `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD` (hoặc `SFTP_PRIVATE_KEY_PATH`), `SFTP_DIR`, `SFTP_HOST_FINGERPRINT` (khuyến nghị kiểm khoá máy chủ), `SFTP_POLL_MINUTES`, `HANGDEN_UNITS` (danh sách mã đơn vị được nạp).
- Dự phòng: nạp tay cùng một đường xử lý — (a) ADMIN tải file CSV lên màn hình, (b) lệnh `node scripts/import-hangden.js <file.csv>`.

### 6.6 Quyền xem (PO quyết)
- A: mọi người đã đăng nhập (kể cả STAFF) xem tổng hợp + danh sách.
- B: chỉ MANAGER/ADMIN (giống Quản lý mạng lưới hiện tại).
- C: STAFF xem tổng hợp; danh sách chi tiết (có SHBG) chỉ MANAGER/ADMIN.
- Nạp tay / cấu hình SFTP / ánh xạ phường: chỉ ADMIN.

### 6.7 Giai đoạn đề xuất
| GĐ | Nội dung | Rủi ro chính |
|---|---|---|
| A | Bảng + nạp tay (CLI + log + idempotent), ánh xạ phường→BĐX, test bằng dữ liệu giả (không đưa file thật vào repo) | Chọn sai cột ngày/khoá → giữ cột thô để tính lại được |
| B | Màn hình "Dữ liệu sản lượng đến": lọc ngày/BĐX/bưu cục/dịch vụ, tổng hợp + danh sách phân trang, cảnh báo thiếu đợt, xuất Excel | Hiệu năng khi > 1 triệu dòng; chất lượng ánh xạ phường |
| C | Tự động SFTP + nạp tay qua giao diện | Mạng NAS ↔ SFTP, quản lý mật khẩu SFTP, file ghi dở, khoá máy chủ |
| D | Dashboard thêm nguồn `HANG_DEN` (whitelist: theo ngày, dịch vụ, BĐX) | Truy vấn nhóm nặng → có thể cần bảng tổng hợp theo ngày |

## 7. Điểm PO cần quyết
1. **Cột ngày cho lịch**: `Thời gian XN BG` (khuyến nghị) hay ngày đợt của file.
2. **Cách đếm sản lượng**: số dòng hay số SHBG khác nhau/ngày (khuyến nghị: SHBG khác nhau, vẫn lưu đủ dòng).
3. **Ý nghĩa bộ lọc BĐX**: theo phường/xã địa chỉ nhận → BĐX (khuyến nghị) hay BĐX của bưu cục nhận.
4. **Bộ lọc bưu cục** = bưu cục nhận (mã đơn vị file). Sẽ có file của mã đơn vị khác ngoài 533140 không?
5. Dòng ngoài tỉnh / thiếu phường (≈12%): hiển thị nhóm "Ngoài địa bàn"/"Chưa xác định" (khuyến nghị) hay loại bỏ.
6. File trùng tên khác nội dung: từ chối + báo (khuyến nghị) hay cho thay thế.
7. Hạn báo "thiếu đợt" (đề xuất sáng 10:30, chiều 17:30).
8. Thời gian lưu dữ liệu (ảnh hưởng ~0,5–0,7 GB/năm/đơn vị).
9. Quyền xem (mục 6.6; khuyến nghị C).
10. Xác nhận ánh xạ tay 5 phường → BĐX (Chân Mây – Lăng Cô, Long Quảng, A Lưới 1/4/5).

## 8. Chưa chắc chắn
- Nghĩa nghiệp vụ chính xác của các cột thời gian (XN túi / XN BG / XND BD10 / tại TTKT), BD8, BD10, `Ghi_chu`, đơn vị khối lượng.
- Ranh giới cửa sổ là 15:00 hay 15:30; các khoảng 04/10 09:21–15:07 và 07/10 14:54–16:58 là "không có hàng" hay dữ liệu bị hở.
- File chiều Chủ nhật chỉ có BOM (không tiêu đề) là quy ước của hệ thống nguồn hay lỗi.
- `Ten_Xa_Phuong`/`Ten_Tinh_Thanh` là địa chỉ người nhận hay người gửi (dòng ngoài tỉnh gợi ý có cả hàng chuyển hoàn).
- Thông tin máy chủ SFTP (kiểu xác thực, file có bị xoá sau khi lấy không, ghi file nguyên tử hay không) — chưa kết nối.
- Mẫu chỉ 9 file/5 ngày; con số dung lượng/năm là ước lượng.

## Phụ lục A — Quyết định của PO (08/10/2026)
Ghi nguyên văn; số hiệu tương ứng trong `04_DECISIONS.md` là #11–#20.

1. Sản lượng = số lượt đến: mỗi tổ hợp `(SHBG, So_hieu_BD10, So_hieu_BD8)` khác nhau là 1 lượt (tính thêm khi BD8 hoặc BD10 khác); các dòng trùng cả ba (chỉ khác giờ xác nhận) chỉ đếm 1. Luôn hiển thị kèm số bưu gửi khác nhau (`COUNT(DISTINCT SHBG)`) để đối chiếu và phát hiện lượt tăng ảo (bưu cục gốc đóng trùng hoặc lỗi). Số túi/kiện = số `BD8` khác nhau (túi và kiện dùng chung một đơn vị). Mọi dòng vẫn được lưu đủ.
2. Khối lượng (`Khoi_luong_thuc_te`) tính bằng gam, là khối lượng của từng bưu gửi trên từng dòng. Khi cộng theo lượt đến, mỗi lượt chỉ lấy 1 giá trị (không cộng lặp qua các dòng cùng lượt).
3. Thời gian đến BCVH = mốc SỚM NHẤT trong 3 mốc `Thời gian XN túi`, `Ngay_gio_XND_BD10`, `Thời gian XN BG` (có dấu vết nào ở BCVH là đã đến; BCVH chịu trách nhiệm hàng ngay khi túi đã quét; dữ liệu có lúc rỗng nên không dựa vào một cột). Đủ cả 3 mốc = đầy đủ nghiệp vụ; thiếu mốc vẫn chấp nhận nếu còn ít nhất 1 mốc làm căn cứ xác định hàng đã đến; không có mốc nào = chưa đủ căn cứ (xếp nhóm "Chưa xác định ngày đến", vẫn lưu dòng). Bộ lọc ngày cho chọn tiêu chí: Đến BCVH (mặc định) / XN túi / XN BD10 / XN BG. `Ngay_gio_XND_BD10_tai_TTKT` KHÔNG dùng (là bưu cục trước BCVH).
4. Bộ lọc bưu cục = bưu cục nhận `BC_nhan_BG` (nay 533140, sau này có thêm BCVH khác; BCVH có loại hình PH2 trong danh mục). Bộ lọc BĐX = BĐX của phường/xã nơi phát (`Ten_Xa_Phuong` → bảng ánh xạ).
5. `Ten_Xa_Phuong` = phường/xã mà bưu tá đến phát; `Ten_Tinh_Thanh` = tỉnh/thành nhận để phát. Dòng tỉnh khác chủ yếu là hàng chuyển hoàn về bưu cục để phát hoàn.
6. Không loại dòng nào; lưu vĩnh viễn. Trùng tên file khác nội dung → từ chối + báo ADMIN.
7. "Thiếu đợt": mỗi ngày đã qua phải có 2 file; ngày có ít hơn 2 file thì báo để ADMIN kiểm tra SFTP. Không gắn giờ cố định. (File rỗng hợp lệ vẫn tính là 1 file.)
8. Quyền xem màn hình (làm ở ticket sau): MANAGER + ADMIN.
9. Nhiều BCVH: mỗi BCVH có thư mục SFTP riêng; SFTP lưu file mãi và NAS kết nối được nên sẽ nạp toàn bộ lịch sử. Lõi nạp KHÔNG được viết cứng mã `533140` hay thư mục (cấu hình nguồn dạng danh sách "thư mục + mã BCVH" làm ở SANLUONG-5).
10. Ý nghĩa cột: `Ma_BC_dong` mã BC đóng; `BC_nhan_BG` mã BC nhận; `Ten_duong_thu` tên đường thư; `SHBG` số hiệu bưu gửi; `So_hieu_BD10`; `Thời gian XN túi`; `Thời gian XN BG`; `Ngay_gio_XND_BD10` thời gian xác nhận BD10; `Ngay_gio_XND_BD10_tai_TTKT` thời gian xác nhận đến BD10 tại Khai thác tỉnh; `So_hieu_BD8`; `Dich_vu_code`; `Ten_dich_vu`; `Ghi_chu`.

## Phụ lục B — Kết quả nạp thử (SANLUONG-2, DB tạm sao từ `data/hue-dhcl.db`)
Chỉ số liệu tổng hợp; DB tạm đã xoá.

- **File**: 8 `OK` + 1 `EMPTY` (chiều 04/10, chỉ BOM). 13 102 dòng, 12 848 SHBG khác nhau, **0 dòng trùng khoá**. Chạy lại lần 2: cả 9 file "đã nạp", không thêm dòng.
- **Cảnh báo khoảng hợp lý** (≤1%, vẫn nạp): 05/10 sáng 5/1 518, 05/10 chiều 1/1 213, 06/10 sáng 1/1 493, 08/10 sáng 1/2 243 dòng ngoài `[ngày file − 3, +1]`.
  **Cả 8 dòng đều có `arrival_at_basis = bd10`** — mốc `Ngay_gio_XND_BD10` sớm hơn nhiều ngày (sớm nhất 30/09). Mốc này cần PO xác nhận (backlog mục 4).
- **Mức đủ căn cứ** (`arrival_evidence_count`): 3 mốc 3 192 · 2 mốc 8 322 · 1 mốc 1 523 · 0 mốc **65** (`arrival_date` NULL).

  | Ngày đến BCVH | 3 mốc | 2 mốc | 1 mốc | Tổng |
  |---|---|---|---|---|
  | 30/09–03/10 | 4 | 1 | 27 | 32 |
  | 04/10 | 35 | 1 182 | 292 | 1 509 |
  | 05/10 | 652 | 1 728 | 161 | 2 541 |
  | 06/10 | 268 | 2 142 | 156 | 2 566 |
  | 07/10 | 1 641 | 2 087 | 708 | 4 436 |
  | 08/10 | 592 | 1 182 | 179 | 1 953 |
  | (không xác định) | | | | 65 |
- **Cột cho mốc sớm nhất** (`arrival_at_basis`): túi 11 479 · BD10 99 · BG 1 459 · NULL 65. Ngày đến BCVH khác ngày XN BG: **6 dòng**; 80 dòng có ngày đến nhưng không có XN BG. XN BG trễ hơn thời gian đến BCVH: trung vị 5 phút, p90 20 phút, p99 36 phút, tối đa ≈ 5,2 ngày.
- **Lượt đến** (ngày của lượt = ngày đến sớm nhất của các dòng trong lượt):

  | Ngày | Lượt đến | SHBG khác nhau | Túi/kiện (BD8) |
  |---|---|---|---|
  | 30/09–03/10 | 32 | 26 | 14 |
  | 04/10 | 1 507 | 1 474 | 407 |
  | 05/10 | 2 535 | 2 499 | 706 |
  | 06/10 | 2 559 | 2 533 | 490 |
  | 07/10 | 4 430 | 4 353 | 664 |
  | 08/10 | 1 922 | 1 911 | 483 |
  | (không xác định) | 64 | 62 | 56 |
  | **Tổng** | **13 049** | **12 848** | **2 816** |

  Lượt đến cao hơn SHBG 1,6%. 53 lượt có >1 dòng (cùng bộ ba, khác giờ XN BG). **181 SHBG có >1 lượt** (163 × 2, 17 × 3, 1 × 5):
  khác cả BD10 và BD8, cùng ngày 143 · khác BD8, cùng ngày 18 · khác BD10, cùng ngày 10 · khác BD10 và BD8, khác ngày 10.
  92 trong số này có ít nhất 1 lượt mang BD10 hoặc BD8 rỗng — ứng viên "lượt tăng ảo" cần xem trên màn hình đối chiếu.
- **Khối lượng**: 0 lượt có các dòng khác khối lượng, 0 SHBG có khối lượng khác nhau giữa các lượt → lấy 1 giá trị bất kỳ mỗi lượt là an toàn trên mẫu.
- **Mã đơn vị**: `receiver_code` 1 giá trị, khớp danh mục (BCVH Thuận Hóa, loại **PH1** — quyết định PO #14 nhắc PH2, cần thống nhất khi lọc theo loại hình).
  `sender_code` 534 mã (186 dòng rỗng), khớp danh mục 38 mã / 70,2% dòng có mã. `route_name` 5 giá trị (779 dòng rỗng).
- **Ánh xạ phường/xã → BĐX**: 142 phường/xã; 35 tự ánh xạ (gồm "Chân Mây – Lăng Cô" nhờ gộp gạch ngang), 107 chưa ánh xạ.
  Theo dòng: đã ánh xạ 11 514 · chưa ánh xạ 172 · thiếu phường 1 416.
  - Chưa ánh xạ thuộc Huế: **"Xã A Lưới 4"** (2 dòng) — BĐX ứng viên theo tên: `5335` Bưu điện xã A Lưới 2, `5336` Bưu điện xã A Lưới 3, `5377` BCVH A Lưới. Chưa tự gán.
  - Chưa ánh xạ thuộc tỉnh khác: 106 phường/xã, 170 dòng (đúng — không có BĐX của Huế).
  - Rủi ro: 3 dòng mang tên phường trùng tên phường Huế nhưng ghi tỉnh khác (TP. Hồ Chí Minh 2, TP. Đà Nẵng 1) đang được ánh xạ vào BĐX Huế.
- **Thiếu đợt** (`getMissingBatches`, hôm nay = 08/10): không có — 04/10 có 2 file (1 rỗng), 05–07/10 đủ 2 file.
