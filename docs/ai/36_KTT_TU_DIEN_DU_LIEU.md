# 36 — «Hàng tại KTT»: từ điển dữ liệu (KTT-2)

> Phạm vi: lớp dữ liệu (bảng SQLite, importer hai file CSV, CLI, cấu hình mốc chuyến). Tính toán, API, giao diện, quyền, menu là các ticket sau (KTT-4…).
> Quy tắc nghiệp vụ V1 (PO chốt 23/10/2026): `KTT-quy-tac-tinh.md` (mục 8). Mã: `server/lib/kttSchema.js` (bảng + ÁNH XẠ CỘT, nguồn sự thật), `server/lib/kttImport.js`, `scripts/ktt-import.js`.
> Không chứa dữ liệu thật. Ví dụ dùng mã giả.

## 1. Nguồn và cách nạp

- Script `KTT-1_Script_nguon_KTT.sql` chạy TAY trên CSDL KTT (POSCode 530100), xuất hai CSV (UTF-8, có tiêu đề, phân cách dấu phẩy):
  `KTT_Tui_<yyyymmdd>_<hhmmss>.csv` (mức túi) và `KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv` (mức bưu gửi-trong-túi).
- Nạp tay: `node scripts/ktt-import.js <file | thư-mục> [--dry-run] [--db <DB>]` (mặc định `data/hue-dhcl.db` hoặc biến `KTT_DB`). `--dry-run` chạy cả lượt trong một giao dịch rồi hoàn tác, không ghi gì. Mã thoát 0 ổn, 2 có file bị từ chối / sai tên, 1 lỗi.
- Hàm: `importKttTui(db, file, opts)`, `importKttBuuGui(db, file, opts)`, `importKttDuongDan(db, file|thư mục, opts)`; `opts.dryRun`.
- Chưa có SFTP, hẹn giờ, API, giao diện.

## 2. Điều đã biết về dữ liệu (importer KHÔNG «sửa» dữ liệu)

1. **Giờ** là giờ địa phương VN, SSMS `YYYY-MM-DD HH:MM:SS.mmm`, không múi giờ. Lưu TEXT `YYYY-MM-DD HH:MM:SS` (cắt phần ms, không làm tròn), không đổi sang UTC. Riêng `cap_nhat_luc` / `nap_luc` là UTC.
2. **Khóa túi** = 7 cột `FromPOSCode, ToPOSCode, MailTripType, ServiceCode, Year, MailTripNumber, PostBagIndex`; chỉ duy nhất khi có đủ 7. Cột `Year` thực chất là NGÀY (`20261020`), không phải năm; `PostBagIndex`, `MailTripNumber` chỉ là số thứ tự nhỏ. Lưu mọi cột khóa dạng TEXT, không ép số, giữ số 0 đầu.
3. **Đơn vị khối lượng**: túi tính bằng **kg**, bưu gửi tính bằng **gam**. Hai cột «quy đổi» (`khoi_luong_quy_doi_tui`, `khoi_luong_quy_doi`) đang đều bằng 1, chưa rõ nghĩa: lưu nguyên, không dùng.
4. **Mốc không được làm tròn hay chỉnh**: có thể âm, có thể NULL, mốc đi có thể sớm hơn mốc quét đến, BD10 đến có thể xác nhận sau khi túi đã đi. Lưu nguyên giá trị nguồn.
5. **Không lưu**: `BD10_di_status`, `BD10_di_TransferDate` (chỉ để chẩn đoán: `Status` không cho biết BD10 đã đi hay chưa; `TransferDate` là giờ đồng bộ), `DestinationPOSCode`, tên lái xe, biển số, người thao tác, `DatabaseUsername`, `DatabasePassword`. Cột lạ trong CSV bị bỏ, kể cả các cột này (có test canh).
6. **Túi «treo»**: có mã quét đến nhưng không có mã quét đi, không có BD10 đi, dù hàng thực tế đã đi và đã phát — bằng chứng KTT không làm đúng quy trình (PO chốt: không đối chiếu dữ liệu phát của BCVH). Importer chỉ lưu nguyên; **không** gắn nhãn «treo», «nằm lâu», «trễ chuyến» (tính ở KTT-4).
7. Hai file có thể đến lệch nhau: bưu gửi có túi chưa nạp, túi chưa có bưu gửi — vẫn nạp được (không FOREIGN KEY sang `ktt_tui`).
8. Một SHBG có thể xuất hiện ở hai túi khác nhau (túi đến và túi đi): hai dòng riêng ở `ktt_buu_gui`.

## 3. Quy tắc nạp (tóm tắt; chi tiết ở đầu `kttImport.js`)

- Cột đọc theo TÊN (không phân biệt hoa thường / dấu / gạch dưới). Thiếu một trong 7 cột khóa (bưu gửi: thêm `SHBG`) hoặc `Nguon_xuat_luc` → từ chối cả file (`REJECTED`, ghi `ktt_nap_lan`, không ghi dòng nào). Thiếu cột khác → ô để NULL, báo ở `cotTuyChonVang` (trừ `Ten_Quan_Huyen`, `Ten_loai_buu_gui`: script chưa tra tên nên luôn NULL — chấp nhận, không báo, không là lỗi). File xuất bằng SSMS «Save Results As…» đọc đúng: bỏ BOM UTF-8 đầu file, dấu `"` chuẩn CSV quanh chuỗi có dấu phẩy / nháy (`""` là một nháy), CRLF hoặc LF; có test. Lỗi cấu trúc CSV (số cột lệch, ngoặc kép không đóng) → từ chối cả file.
- Tên file sai mẫu → `SAI_TEN`, không đọc. File đã nạp (`loai` + `sha256`, trạng thái `OK`) → `DA_NAP`, bỏ qua, kể cả khi khác tên. File `REJECTED` không chặn nạp lại bản đã sửa.
- **UPSERT** theo khóa tự nhiên: dòng đã có và `nguon_xuat_luc` mới ≥ cũ → thay cả dòng (đếm «cập nhật»); mới cũ hơn → bỏ qua (đếm «bỏ qua»). Nạp lại hay nạp lệch thứ tự file cho cùng kết quả (trừ khi hai dòng cùng khóa có `nguon_xuat_luc` bằng nhau nhưng khác nội dung: dòng nạp sau thắng).
- Dòng có khóa rỗng, `Nguon_xuat_luc` rỗng, giờ / số / cờ sai định dạng → bỏ qua dòng, đếm «lỗi», ghi ≤ 20 mẫu `{dong, cot, ma}` (`ma`: `KHOA_RONG`, `NGUON_XUAT_RONG`, `GIO_SAI_DINH_DANG`, `SO_SAI_DINH_DANG`, `CO_SAI_DINH_DANG`) vào `ktt_nap_lan.loi_mau` (JSON). Không ghi giá trị. `dong` = số dòng trong file, tiêu đề là dòng 1.
- Chuẩn hóa: trim chuỗi; rỗng hoặc chữ `NULL` → NULL; `Co_mo_tui` / `Co_dong_tui` (`1`/`0`/`True`/`False`) → 0/1; số dấu chấm thập phân (`12.5`; số nguyên chấp nhận `4` và `4.0`); giờ có thể có hoặc không có ms, phân cách khoảng trắng hoặc `T`.
- Cả file nằm trong MỘT giao dịch; đọc theo lô 1 MiB, không nạp cả file vào bộ nhớ. Chạy đồng bộ.

## 4. Bảng `ktt_nap_lan` (một dòng mỗi file đã nạp)

| Cột | Ý nghĩa |
|---|---|
| `loai` | `TUI` / `BUU_GUI` |
| `ten_file`, `sha256` | Tên file; băm nội dung. `UNIQUE (loai, sha256)` |
| `nap_luc` | Thời điểm nạp, UTC |
| `so_dong_doc / _them / _cap_nhat / _bo_qua / _loi` | Số dòng dữ liệu (không tính tiêu đề) đọc / thêm mới / thay dòng cũ / bỏ qua vì nguồn cũ hơn / lỗi. Đọc = thêm + cập nhật + bỏ qua + lỗi |
| `trang_thai` | `OK` / `REJECTED` (chỉ `OK` chặn nạp lại) |
| `thong_bao` | Lý do bị từ chối (không có giá trị dòng) |
| `loi_mau` | JSON ≤ 20 mẫu lỗi dòng |

## 5. Bảng `ktt_tui` (một dòng mỗi túi) — `UNIQUE` trên 7 cột khóa

Mọi cột có thể NULL trừ khóa, `nguon_xuat_luc`, `cap_nhat_luc`. Tên CSV là tên CHÍNH XÁC script xuất ra (đối chiếu ở KTT-2b, theo `COT_TUI` trong kttSchema.js). File túi có 49 cột: 47 cột lưu như bảng dưới, 2 cột `BD10_di_status`, `BD10_di_TransferDate` BỎ (chỉ chẩn đoán). Nơi tên CSV khác tên cột DB: `Khoi_luong_tui` → `khoi_luong_tui_kg`.

| Cột DB (CSV) | Kiểu | Ý nghĩa / đơn vị |
|---|---|---|
| `from_pos` (`Tui_FromPOSCode`) | TEXT khóa | Mã bưu cục gửi túi |
| `to_pos` (`Tui_ToPOSCode`) | TEXT khóa | Mã bưu cục nhận túi |
| `mail_trip_type` (`Tui_MailTripType`) | TEXT khóa | Loại chuyến thư |
| `service_code` (`Tui_ServiceCode`) | TEXT khóa | Mã dịch vụ trong khóa túi (khác `dich_vu_code`) |
| `year` (`Tui_Year`) | TEXT khóa | **NGÀY** dạng `20261020`, không phải năm |
| `mail_trip_number` (`Tui_MailTripNumber`) | TEXT khóa | Số thứ tự chuyến thư (số nhỏ) |
| `post_bag_index` (`Tui_PostBagIndex`) | TEXT khóa | Số thứ tự túi (số nhỏ) |
| `so_hieu_bd8` (`So_hieu_BD8`) | TEXT | Số hiệu BD8 |
| `ma_loai_tui` (`Ma_loai_tui`) | TEXT | Mã loại túi |
| `chieu` (`Chieu`) | TEXT | `DEN` / `DI` / `CHUYEN_TIEP_DI` (lưu nguyên, không CHECK) |
| `dich_nhom` (`Dich_nhom`) | TEXT | `BCVH_HUE` / `HE1_530900` / `KTT` / `KHAC` |
| `luong` (`Luong`) | TEXT | `DI_NGOAI` / `KHAI_THAC_DEN` / `KHAI_THAC_DI` / `DA_CHIA_SAN` |
| `co_mo_tui`, `co_dong_tui` (`Co_mo_tui`, `Co_dong_tui`) | INTEGER 0/1 | Có thao tác mở / đóng túi |
| `chuyen_thu_gio_dong`, `chuyen_thu_gio_mo` | TEXT giờ | Giờ đóng / mở chuyến thư |
| `so_luong_tui`, `so_dong_dispatch` | INTEGER | Số lượng túi; số dòng dispatch |
| `khoi_luong_tui_kg` (`Khoi_luong_tui`) | REAL | Khối lượng túi, **kg** |
| `khoi_luong_quy_doi_tui` | REAL | Đang đều = 1, chưa rõ nghĩa, không dùng |
| `dich_vu_code`, `ten_dich_vu` | TEXT | Mã / tên dịch vụ |
| `bd10_den_so_hieu`, `bd10_den_xnd` | TEXT, giờ | Số hiệu BD10 đến; giờ xác nhận đến (XNĐ) |
| `bd10_den_ma/ten_diem_gui`, `…_duong_thu`, `…_hinh_thuc_vc`, `…_lich` | TEXT | Mã / tên điểm gửi, đường thư, hình thức vận chuyển, lịch của BD10 đến |
| `so_bd10_den` | INTEGER | Số BD10 đến của túi |
| `gio_quet_tui_den`, `so_lan_quet_den` | giờ, INTEGER | Giờ quét túi đến; số lần quét |
| `bd10_di_so_hieu`, `bd10_di_gio_di` | TEXT, giờ | Số hiệu BD10 đi; giờ đi |
| `bd10_di_ma/ten_diem_nhan`, `…_duong_thu`, `…_hinh_thuc_vc`, `…_lich` | TEXT | Mã / tên điểm nhận, đường thư, hình thức vận chuyển, lịch của BD10 đi |
| `gio_quet_tui_di` | giờ | Giờ quét túi đi |
| `nguon_xuat_luc` (`Nguon_xuat_luc`) | giờ, NOT NULL | Thời điểm xuất dữ liệu ở nguồn; dùng so sánh khi UPSERT |
| `nap_lan_id`, `cap_nhat_luc` | | Lần nạp ghi/cập nhật dòng; thời điểm, UTC |

Chỉ mục: `gio_quet_tui_den`; `bd10_di_gio_di`; `(chieu, luong)`; `dich_nhom`.

## 6. Bảng `ktt_buu_gui` (một dòng mỗi bưu gửi trong túi) — `UNIQUE` trên 7 cột khóa túi + `shbg`

7 cột khóa túi như mục 5 (`Tui_*`), cộng:

| Cột DB (CSV) | Kiểu | Ý nghĩa / đơn vị |
|---|---|---|
| `shbg` (`SHBG`) | TEXT khóa | Số hiệu bưu gửi |
| `khoi_luong_thuc_te_g` (`Khoi_luong_thuc_te`) | REAL | Khối lượng thực tế, **gam** |
| `khoi_luong_quy_doi` (`Khoi_luong_quy_doi`) | REAL | Đang đều = 1, chưa rõ nghĩa, không dùng |
| `dich_vu_code`, `ten_dich_vu` | TEXT | Mã / tên dịch vụ |
| `ma/ten_xa_phuong`, `ma/ten_tinh_thanh`, `ma/ten_quan_huyen` | TEXT | Địa bàn nhận (`Ma_Xa_Phuong`, `Ten_Xa_Phuong`, …) |
| `ma/ten_loai_buu_gui` | TEXT | Loại bưu gửi |
| `ti_den_theo_tui_luc` | giờ | Giờ đến tính theo túi (`TI_den_theo_tui_luc`) |
| `ti_xac_nhan_den_luc` | giờ | Giờ xác nhận đến (`TI_xac_nhan_den_luc`) |
| `ti_dong_chuyen_thu_di_luc` | giờ | Giờ đóng chuyến thư đi (`TI_dong_chuyen_thu_di_luc`) |
| `nguon_xuat_luc`, `nap_lan_id`, `cap_nhat_luc` | | Như bảng túi |

Chỉ mục: `shbg`; 7 cột khóa túi. Không FOREIGN KEY sang `ktt_tui`.

## 7. Bảng cấu hình (dữ liệu mặc định V1 nạp bằng `INSERT OR IGNORE`: chạy lại không nhân dòng, không ghi đè giá trị PO đã sửa)

- `ktt_cau_hinh_chuyen` — lịch mốc chuyến xuất phát từ KTT theo BCVH. Cột `ma_bcvh`, `ten_chuyen` (`SANG`/`TRUA`/`TOI`), `gio_moc` (`HH:MM`, giờ VN), `gio_chot_truoc_phut` (mặc định 30: hàng quét đến trước mốc ít nhất ngần này phút thì đi chuyến đó), `ghi_chu`, `cap_nhat_luc` (UTC). `UNIQUE (ma_bcvh, ten_chuyen)`. 12 dòng mặc định:
  533140 SANG 07:30, TRUA 14:00, TOI 22:30; 535470 SANG 07:00, TRUA 12:30; 535790 SANG 08:30; 536250 SANG 09:30, TRUA 13:00; 537015 SANG 08:00, TRUA 13:30; 537220 SANG 08:00, TRUA 13:30. Ghi chú: «V1 ước lượng từ giờ đi thực tế, chờ PO cung cấp giờ chính xác».
- `ktt_cau_hinh` — khóa / giá trị: `treo_phut` = 180 (3 giờ liên tục), `nam_lau_toi_da_phut` = 1440 (24 giờ), `chi_tieu_f13_gio` = 14, `chi_tieu_f13_gio_thuan_hoa_phu_xuan` = 12. Cột `khoa`, `gia_tri` (NUMERIC), `mo_ta`, `cap_nhat_luc`. Ý nghĩa dùng các ngưỡng này thuộc KTT-4.
- Hệ quả của `INSERT OR IGNORE`: một dòng mặc định PO đã XÓA sẽ được tạo lại ở lần khởi động sau (sửa giá trị thì được giữ).

## 8. Đối chiếu tên cột CSV (KTT-2b) và điều chưa chắc

Đã đối chiếu với tiêu đề chính xác của script `KTT-1_Script_nguon_KTT.sql` (49 cột túi, 24 cột bưu gửi; do PO cung cấp trong ticket KTT-2b; bản script không có trong repo). Tên khớp không phân biệt hoa thường / dấu / gạch dưới; test `tests/ktt-import.test.js` (ca «KTT-2b») canh khớp NGUYÊN VĂN.

- Sửa so với KTT-2 (suy đoán sai): `Khoi_luong_tui_kg` → `Khoi_luong_tui` (cột DB vẫn `khoi_luong_tui_kg`, đơn vị kg); `So_BD10_den` → `So_bd10_den`; `Ma_Loai_Buu_Gui` → `Ma_loai_buu_gui`; `Ten_Loai_Buu_Gui` → `Ten_loai_buu_gui` (chỉ sai hoa / thường, importer vốn không phân biệt).
- Đúng như đã đoán (không đổi): 7 cột khóa `Tui_*`, `So_hieu_BD8`, `Ma_loai_tui`, `Chieu`, `Dich_nhom`, `Luong`, `Co_mo_tui`, `Co_dong_tui`, `Chuyen_thu_gio_dong`, `Chuyen_thu_gio_mo`, `So_luong_tui`, `So_dong_dispatch`, `Khoi_luong_quy_doi_tui`, `Dich_vu_code`, `Ten_dich_vu`, toàn bộ nhóm `BD10_den_*` và `BD10_di_*` (trừ hai cột bỏ), `Gio_quet_tui_den`, `So_lan_quet_den`, `Gio_quet_tui_di`, `Nguon_xuat_luc`; bưu gửi: `SHBG`, `Khoi_luong_thuc_te` (→ `khoi_luong_thuc_te_g`, gam), `Khoi_luong_quy_doi`, `Ma/Ten_Xa_Phuong`, `Ma/Ten_Tinh_Thanh`, `Ma/Ten_Quan_Huyen`, `TI_den_theo_tui_luc`, `TI_xac_nhan_den_luc`, `TI_dong_chuyen_thu_di_luc`.
- Bảy cột khóa vẫn nhận thêm tên không tiền tố (`alias`, chỉ để dung sai).

Điều chưa chắc còn lại:
- Kiểu dữ liệu của các cột đếm (`so_bd10_den`, `so_lan_quet_den`, `so_luong_tui`, `so_dong_dispatch`) là INTEGER theo tên; nếu file thật có giá trị không nguyên thì dòng đó bị tính lỗi `SO_SAI_DINH_DANG` (không mất dữ liệu khác).
- Chưa thử với một file xuất thật (chỉ đối chiếu tiêu đề do PO cung cấp).
- Các giá trị liệt kê (`chieu`, `dich_nhom`, `luong`) lưu nguyên, không CHECK; giá trị lạ vẫn nạp.

## 9. Bảng `ktt_hang_hoan` và `ktt_hang_hoan_nap` (KTT-17-1)

Danh sách SHBG hàng hoàn từ ItemReturn của CSDL BCCP, nạp từ file riêng `KTT_HangHoan_<yyyymmdd>_<hhmmss>.csv` (không ghép cặp với Tui / BuuGui; chi tiết `39_KTT_NAP_SFTP.md` mục 15). Chỉ THÊM bảng, không ALTER bảng cũ. CHƯA dùng vào chỉ số nào.

| Bảng.cột | Kiểu | Ý nghĩa |
|---|---|---|
| `ktt_hang_hoan.id` | INTEGER PK | tự tăng |
| `ktt_hang_hoan.shbg` | TEXT NOT NULL UNIQUE | SHBG chuẩn hóa như `ktt_buu_gui.shbg` (trim, CHỮ HOA, Ð → Đ). Cộng dồn: không xóa |
| `ktt_hang_hoan.nguon_xuat_luc` | TEXT NOT NULL | `Nguon_xuat_luc` của file đã ghi dòng này (giờ VN, bỏ mili giây); chỉ cập nhật khi file mới ≥ cũ |
| `ktt_hang_hoan.nap_lan_id` | INTEGER | → `ktt_hang_hoan_nap.id` |
| `ktt_hang_hoan.cap_nhat_luc` | TEXT NOT NULL | UTC |
| `ktt_hang_hoan_nap` | — | một dòng mỗi file (UNIQUE `sha256`): `ten_file`, `nap_luc`, `nguon_xuat_luc`, `so_dong_doc / them / cap_nhat / bo_qua / loi / trung`, `trang_thai` OK hoặc REJECTED, `thong_bao`, `loi_mau` (không giá trị SHBG), `size_file`, `mtime_file` |

Lý do nhật ký riêng: `ktt_nap_lan.loai` có CHECK chỉ `TUI` / `BUU_GUI`. File chỉ có hai cột (`SHBG`, `Nguon_xuat_luc`); không lưu cột nào khác của ItemReturn.
