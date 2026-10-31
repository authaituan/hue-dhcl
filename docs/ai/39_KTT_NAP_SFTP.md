# 39 · KTT-6 — Tự động nạp «Hàng tại KTT» qua SFTP

Tầng NẠP của «Hàng tại KTT» (POS 530100). Không tính chỉ số (KTT-7), không API xem số liệu / quyền xem (KTT-8), không giao diện (KTT-9).
Mọi số liệu trong tài liệu này là dữ liệu GIẢ; biến môi trường chỉ nêu TÊN.

## 1. Luồng dữ liệu

- PO / CNTT chạy script KTT-1 vào **09:00 và 15:00** mỗi ngày, mỗi lần ra **2 file** cùng `<yyyymmdd>_<hhmmss>` vào thư mục SFTP `/CSV_Report_530100`:
  `KTT_Tui_<yyyymmdd>_<hhmmss>.csv` (mức túi → `ktt_tui`) và `KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv` (mức bưu gửi → `ktt_buu_gui`).
- Mỗi lần xuất là **ẢNH CHỤP** cửa sổ **lùi 7 ngày** đến lúc chạy; mỗi dòng có `Nguon_xuat_luc` = giờ chạy script. Cùng túi / bưu gửi lặp lại ở nhiều lần xuất, thông tin có thể đổi
  (09:00 chưa có giờ đi, 15:00 đã có). «Hôm nay» chỉ đúng đến `Nguon_xuat_luc` của cặp nạp gần nhất; số của ngày D chỉ chốt sau cặp 09:00 của D+1.
- Bộ nạp KTT (`server/lib/kttSftp.js`) quét thư mục theo chu kỳ, ghép cặp, tải, nạp cả cặp trong MỘT giao dịch (`server/lib/kttNapCap.js` → `kttImport.js`), ghi nhật ký cặp.
  **Không viết cứng 09:00 / 15:00 trong mã**: giờ lấy từ `Nguon_xuat_luc`.

## 2. Bộ nạp RIÊNG (quyết định PO 26/10)

«Hàng đến» (`sftpSync.js`, `sftpScheduler.js`, `routes/napNguon.js`…) **không bị sửa**. Bộ KTT dùng lại: lớp kết nối `sftpConnect.js`, `sftpFiles.js` (`docCauHinh`, `phanLoaiLoi`, `tenAnToan`),
`sftpSync.js` (`docCauHinhSync`, `lamSach`, `luotDangChay` — chỉ ĐỌC), `sftpScheduler.js` (`docTrangThaiSftp`, `tamDungHenGio`, `laMoiTruongTest`, `TT` — đã export sẵn). Không thêm export nào vào mã «Hàng đến».

## 3. Ghép cặp, chờ ổn định, chạy lại

1. Liệt kê thư mục, bỏ file không đúng mẫu `KTT_Tui_…` / `KTT_BuuGui_…` (ngày giờ phải có thật), thư mục con; chỉ ĐẾM (`fileLa`). Riêng `KTT_HangHoan_…` (KTT-17-1) là file độc lập, xem mục 15.
2. Ổn định: kích thước + mtime giữ nguyên qua **≥ 2 lượt quét** và **≥ `SFTP_STABLE_SECONDS`** (bảng riêng `ktt_nguon_file`, không dùng `sftp_source_files` của «Hàng đến» vì lưới «Nạp dữ liệu nguồn» đọc bảng đó).
3. **Đủ cặp mới nạp.** Một file đến trước: ghi `ktt_nap_cap.ket_qua = CHO_CAP` (giữ `thay_dau_luc` = lần đầu thấy), KHÔNG nạp nửa cặp.
4. Nạp **cũ trước**, tối đa 10 cặp mỗi lượt (`SO_CAP_TOI_DA_MOI_LUOT`); phần còn lại hoãn sang lượt sau. Cặp lịch sử 30 ngày đi cùng đường này (cặp bình thường, nhiều dòng hơn).
5. Không tải lại mỗi chu kỳ: cặp đã `OK` / `TU_CHOI` mà kích thước + mtime không đổi thì bỏ qua; cặp `LOI` thử lại tối đa 5 lần (`SO_LAN_THU_TOI_DA`) cho cùng kích thước + mtime.
6. Tải về thư mục tạm (tên gốc đúng mẫu), kiểm kích thước tải = kích thước liệt kê, nạp, xóa tệp tạm.

### Kết quả một cặp (`ktt_nap_cap.ket_qua`)
| Giá trị | Ý nghĩa |
|---|---|
| `OK` | Cả hai file vào trong một giao dịch. |
| `CHO_CAP` | Mới có một file. Mở cảnh báo (a) sau ngưỡng chờ. |
| `TU_CHOI` | (i) cùng TÊN file nhưng khác nội dung (sha256) so với bản đã nạp `OK`; hoặc (ii) một file sai cấu trúc (thiếu cột bắt buộc, trùng tên cột, sai CSV, sai tên) → **hoàn tác cả cặp**. |
| `LOI` | Lỗi tải / ghi (mạng, `SQLITE_BUSY`, kích thước lệch…). Thử lại ở lượt sau. |
| (`DA_NAP`) | Không lưu: chạy lại cặp đã nạp cùng nội dung — không làm gì, chỉ cập nhật kích thước / mtime đã thấy. |

Khi cặp ĐÃ `OK` mà bản mới cùng tên bị từ chối / lỗi, dòng `OK` **được giữ** (không mất độ mới); lần từ chối ghi ở dòng «biến thể» `khoa_cap = '<yyyymmdd>_<hhmmss>!<sha ngắn>'`.

## 4. Khóa, UPSERT, chống trùng

- **Khóa túi (7 phần):** `Tui_FromPOSCode`, `Tui_ToPOSCode`, `Tui_MailTripType`, `Tui_ServiceCode`, `Tui_Year`, `Tui_MailTripNumber`, `Tui_PostBagIndex` (chữ, không ép số). `UNIQUE` ở `ktt_tui`.
- **Khóa bưu gửi:** 7 phần trên + `SHBG` — chuẩn hóa **`trim`, CHỮ HOA, `Ð` → `Đ`** (KTT-6 thêm bước HOA / `Ð`; trước đó chỉ `trim`). `UNIQUE` ở `ktt_buu_gui`.
- **UPSERT theo khóa:** dòng có `Nguon_xuat_luc` **mới hơn hoặc bằng** thay dòng cũ; dòng **cũ hơn** dòng đang có thì KHÔNG ghi đè (đếm `bo_qua`; file cũ đến muộn). Mỗi dòng lưu `nguon_xuat_luc`, `cap_nhat_luc` (UTC, lúc ghi), `nap_lan_id`.
- **Khóa trùng trong cùng file:** dòng sau thay dòng trước (cùng `Nguon_xuat_luc`); đếm riêng ở `trung` (không tính vào «thêm» / «cập nhật»).
- **Cùng cặp nạp lại:** số dòng không đổi (idempotent).
- **Dòng «không còn trong ảnh chụp mới»:** dòng có `nguon_xuat_luc` < ảnh chụp mới mà file mới không chứa, nằm trong **cửa sổ = [giờ trong TÊN file − 7 ngày, giờ trong tên file]** → chỉ **ĐẾM** (`tui_khong_con`, `bg_khong_con`), KHÔNG xóa. **Túi** nằm trong cửa sổ nếu **MỘT trong bốn cột** `gio_quet_tui_den`, `gio_quet_tui_di`, `bd10_di_gio_di`, `bd10_den_xnd` nằm trong cửa sổ (đúng điều kiện chọn túi của script KTT-1). **Dòng bưu gửi** theo cửa sổ của **túi chứa nó** (ghép theo khóa túi 7 phần; bưu gửi chưa có túi trong DB thì không đếm); `ti_den_theo_tui_luc` KHÔNG tham gia điều kiện. Cửa sổ lấy theo giờ trong tên file (không theo `Nguon_xuat_luc` trong dữ liệu), nên cặp rỗng cũng đếm được. Cột `gio_min` / `gio_max` của nhật ký cặp vẫn ghi giờ dữ liệu nhỏ nhất / lớn nhất (`gio_quet_tui_den`; bưu gửi: `ti_den_theo_tui_luc`) chỉ để tham khảo.
- **File rỗng** (0 byte / chỉ BOM): hợp lệ, cặp vẫn `OK` với 0 dòng, `nguon_xuat_luc` lấy từ tên file. Riêng `scripts/ktt-import.js` (dev) vẫn từ chối file không có dòng tiêu đề như trước.
- **Cột đọc riêng, không gộp:** xác nhận BD10 đến `BD10_den_XND` → `bd10_den_xnd` (cho đạt / không đạt) và `Gio_quet_tui_den` → `gio_quet_tui_den` (cho giờ lưu tại KTT). Cột mật khẩu / lái xe / biển số / người thao tác: không có trong bảng ánh xạ.

## 5. Nhật ký và «độ mới»

- `ktt_nap_cap` (MỚI, KTT-6; một dòng mỗi cặp, `UNIQUE khoa_cap`): tên hai file, sha256, kích thước + mtime đã thấy, `nguon_xuat_luc`, giờ dữ liệu nhỏ nhất / lớn nhất, số đọc / thêm / cập nhật / bỏ qua / lỗi / trùng / không còn (túi và bưu gửi riêng),
  `ket_qua`, `ma_loi`, `thong_bao`, `so_lan_thu`, `thay_dau_luc`, `nap_luc`, `cap_nhat_luc`. **Không** ghi nội dung dòng. Lý do cần bảng mới: `ktt_nap_lan.trang_thai` chỉ có `OK | REJECTED` (khó đổi `CHECK` SQLite) và là mức FILE, không có `CHO_CAP` / `LOI` / mức cặp.
- `ktt_nap_lan` giữ nguyên (mức file; chặn trùng `(loai, sha256)`).
- `ktt_nguon_file` (MỚI): theo dõi «ổn định».
- **Độ mới:** `docDoMoi(db)` = `nguon_xuat_luc` lớn nhất của cặp `OK` (cho KTT-8 / giao diện «dữ liệu đến …»).

## 6. Khóa chạy chung với «Hàng đến» và `SQLITE_BUSY`

- Cùng MỘT kết nối `better-sqlite3` (đồng bộ) trong tiến trình: một giao dịch KTT hoặc «Hàng đến» chạy xong rồi mới đến giao dịch kia, nên **không ghi chồng**. Cặp 30 ngày chặn vòng lặp sự kiện trong thời gian giao dịch (giây).
- KHÔNG dùng `sftp_sync_runs` làm khóa của KTT (cột `"trigger"` chỉ nhận `MANUAL | TIMER`, hàng KTT sẽ hiện trong lưới «Hàng đến»; sửa được chỉ khi chạm mã «Hàng đến»). Thay vào đó: (1) khóa trong tiến trình (`BI_KHOA_TIEN_TRINH`); (2) trước mỗi lượt **chỉ ĐỌC** `luotDangChay` — có lượt «Hàng đến» / khóa «Thay thế ngày» đang chạy thì bỏ qua lượt này, thử lại chu kỳ sau (`BI_KHOA_DB`).
- Tiến trình khác ghi cùng file DB (script chạy tay): lỗi `SQLITE_BUSY` được bắt, thử lại **3 lần** (chờ 2 / 5 / 10 giây) rồi ghi cặp `LOI` (`ma_loi = SQLITE_BUSY`), thử lại ở lượt sau. Không đặt `busy_timeout` / PRAGMA mới (dùng mặc định của `better-sqlite3`). Lượt «Hàng đến» không bị chạm.
- Lỗi XÁC THỰC / VÂN TAY SAI của KTT: tạm dừng KTT **và** gọi `tamDungHenGio` có sẵn để «Hàng đến» cũng tạm dừng (cùng tài khoản SFTP: tránh NAS chặn IP). Ngược lại hẹn giờ «Hàng đến» đang `TAM_DUNG` thì KTT không kết nối.

## 7. Hẹn giờ

`startKttScheduler` (gọi trong `server/index.js` cạnh `startSftpScheduler`): **cùng cờ `SFTP_SYNC_ENABLED`** (chỉ `1` mới bật), **không chạy trong test** (`NODE_TEST_CONTEXT` / `NODE_ENV=test`).
Chưa cấu hình / sai cấu hình: MỘT dòng log nêu TÊN biến, bộ nạp không chạy, máy chủ vẫn chạy (không ném lỗi). Lượt đầu sau 45 giây; chu kỳ lấy từ tham số `ktt_chu_ky_quet_phut` mỗi lần hẹn lại. Tắt máy chủ: dừng gọn cả hai bộ hẹn giờ.

## 8. Tham số (màn «Tham số hệ thống», nhóm «Nạp dữ liệu Hàng tại KTT»; mặc định ở `server/config/tham-so-mac-dinh.js`, đọc qua `server/config/ktt-nap.js`)

| Khóa | Mặc định | Miền | Ý nghĩa |
|---|---|---|---|
| `ktt_chu_ky_quet_phut` | 10 | 2–1440 | chu kỳ quét thư mục |
| `ktt_cho_cap_phut` | 60 | 5–1440 | chờ đủ cặp trước khi cảnh báo (a) |
| `ktt_cu_gio` | 10 | 1–48 | dữ liệu cũ (d), chỉ tính giờ trong khung |
| `ktt_khung_gio_tu` / `ktt_khung_gio_den` | 7 / 22 | 0–23 / 1–23, từ < đến | khung theo dõi (d) |
| `ktt_so_cap_toi_thieu_ngay` | 2 | 1–10 | cảnh báo (b) |

Giới hạn kỹ thuật (hằng, không phải tham số): tối đa 10 cặp / lượt; thử lại 5 lần; xét 7 ngày đã qua cho (b); giữ cảnh báo cặp từ chối / lỗi 14 ngày.

## 9. Cảnh báo cho ADMIN và API

Kênh: **API trạng thái + log máy chủ**. «Hàng đến» chưa có kênh cảnh báo riêng ngoài mục «cần xử lý» của lưới (gắn với BCVH × ngày × đợt, không hợp với KTT) và SECURITY_LOG (nhật ký thao tác người dùng), nên KTT tự tính cảnh báo từ `ktt_nap_cap` mỗi lần gọi (không lưu, tự hết khi hết điều kiện) và ghi một dòng log tóm tắt (mã = số lượng) sau mỗi lượt.

| Mã | Điều kiện | Nội dung trả về |
|---|---|---|
| `THIEU_FILE` (a) | mới có một file sau `ktt_cho_cap_phut` | `khoa_cap`, tên file có, file thiếu (`TUI`/`BUU_GUI`), số phút chờ |
| `THIEU_CAP_NGAY` (b) | ngày đã qua (từ ngày có cặp OK đầu tiên, ≤ 7 ngày) có < `ktt_so_cap_toi_thieu_ngay` cặp OK | `ngay`, `so_cap_ok`, `can` |
| `CAP_TU_CHOI` / `CAP_LOI` (c) | cặp `TU_CHOI` / `LOI` (14 ngày gần nhất) | `khoa_cap`, hai tên file, `ma_loi`, `thong_bao` (chỉ tên file / tên cột), `so_lan_thu` |
| `DU_LIEU_CU` (d) | số giờ **nằm trong khung** kể từ `nguon_xuat_luc` của cặp OK gần nhất > `ktt_cu_gio` (chưa có cặp OK nào: cũng báo) | `nguon_xuat_luc`, `gio_trong_khung`, `nguong_gio` |

API (chỉ ADMIN; 401 không token, 403 vai trò khác; query lạ → 400): **`GET /api/nap-nguon/ktt/trang-thai`** (`server/routes/kttNap.js`) →
`{ tu_dong: { bat, trang_thai, ly_do_tam_dung, chu_ky_phut, thu_muc, luot_ke_tiep_luc, luot_gan_nhat }, do_moi: { nguon_xuat_luc, nap_luc, khoa_cap } | null, canh_bao: […], cap: [20 cặp gần nhất], tham_so: {…} }`.
Không trả host / cổng / tài khoản / mật khẩu / vân tay / sha256 / nội dung dòng. Không có giao diện (KTT-9).

## 10. Biến môi trường (chỉ TÊN)

Dùng chung với «Hàng đến»: `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`, `SFTP_HOSTKEY_SHA256` (bắt buộc), `SFTP_SYNC_ENABLED`, `SFTP_STABLE_SECONDS`.
**KTT không cần `SFTP_DIRS`.** Thư mục KTT: `SFTP_KTT_DIR` (tùy chọn, mặc định `/CSV_Report_530100`; phải bắt đầu bằng `/`, không chứa `,`, `..`, ký tự điều khiển).
`SFTP_SYNC_INTERVAL_MINUTES` / `SFTP_SYNC_MAX_FILES` / `SFTP_SYNC_DAYS` KHÔNG áp dụng cho KTT (chu kỳ lấy từ tham số `ktt_chu_ky_quet_phut`).
`docker-compose.yml` hiện truyền `SFTP_HOST/PORT/USER/PASSWORD/DIRS/HOSTKEY_SHA256` và các biến `SFTP_SYNC_*`, `SFTP_STABLE_SECONDS` vào container (đã kiểm) → KTT chạy được ngay với mặc định, **không sửa compose / `.env.nas.example` / `Dockerfile`**.
Muốn đổi thư mục KTT thì thêm một dòng `SFTP_KTT_DIR: ${SFTP_KTT_DIR:-}` vào `environment` của compose (chưa làm; xem đề xuất ở báo cáo). (Ghi chú: snapshot cũ ghi «compose chưa truyền `SFTP_*`» là đã lỗi thời.)

## 11. Nạp lịch sử (22/09–24/10) và nạp tay

- Trong container NAS **KHÔNG có `scripts/`** (`Dockerfile` chỉ chép `server/`), nên không chạy được `scripts/ktt-import.js` ở đó. Lịch sử đi bằng **chính đường SFTP**: PO thả cặp file lịch sử (cùng mẫu tên, `Nguon_xuat_luc` = giờ chạy, cửa sổ 30 ngày) vào thư mục KTT; bộ nạp xử lý như cặp thường (cũ trước, nhiều dòng hơn, giao dịch dài hơn).
  Đặt tên cặp lịch sử với `<yyyymmdd>_<hhmmss>` **sớm hơn** các cặp 7 ngày để UPSERT theo `Nguon_xuat_luc` không bị cặp lịch sử cũ ghi đè dòng mới.
- Dev (máy có `scripts/`): `node scripts/ktt-import.js <file | thư-mục> [--dry-run] [--db …]` giữ nguyên (nạp theo tên file, từng file một, KHÔNG ghép cặp; từ chối file rỗng không tiêu đề). Dev AI không chạy trên dữ liệu thật.

## 12. Việc ngoài ứng dụng (PO / CNTT)

1. Chạy script `KTT-1_Script_nguon_KTT.sql` đúng **09:00** và **15:00** với `@TuNgayGio` = giờ chạy − 7 ngày, `@DenNgayGio` = giờ chạy.
2. Đặt tên file đúng mẫu `KTT_Tui_<yyyymmdd>_<hhmmss>.csv` / `KTT_BuuGui_<yyyymmdd>_<hhmmss>.csv`, **cùng `<yyyymmdd>_<hhmmss>`** cho hai file của một lần xuất; thả cả hai lên `/CSV_Report_530100`.
3. Cấp quyền ĐỌC thư mục KTT cho tài khoản SFTP chỉ đọc; điền `.env` (`SFTP_*`, `SFTP_SYNC_ENABLED=1`).
4. Thả cặp lịch sử (mục 11) lần đầu.

## 13. Điều chưa chắc / đề xuất

- ~~Cột lọc cửa sổ~~ **Đã chốt (PO 26/10)**: cửa sổ của túi là [giờ trong tên file − 7 ngày, giờ trong tên file]; túi nằm trong cửa sổ nếu một trong bốn cột `gio_quet_tui_den`, `gio_quet_tui_di`, `bd10_di_gio_di`, `bd10_den_xnd` nằm trong cửa sổ; bưu gửi theo túi chứa nó (mục 4). Không còn là suy đoán.
- **Cảnh báo (d) mặc định 10 giờ** (PO chọn 26/10, thay cho 8 trong ticket): với lịch 09:00 / 15:00, tính giờ trong khung 07–22 giờ, khoảng cách tối đa là 7 (15:00→22:00) + 2 (07:00→09:00) = 9 giờ; ngưỡng 8 sẽ báo «dữ liệu cũ» khoảng 08:00–09:05 mỗi sáng trước khi cặp 09:00 về, ngưỡng 10 thì không (chỉ báo khi cặp 09:00 chậm quá ~10:00).
- **Xử lý dòng «không còn trong ảnh chụp mới»:** đề xuất KHÔNG xóa; KTT-7 nên coi dòng có `nguon_xuat_luc` thấp hơn cặp OK gần nhất mà vẫn nằm trong cửa sổ là «bị rút khỏi nguồn» (đếm / gắn nhãn tại KTT-7), vì xóa mất dấu vết khi ảnh chụp tạm thiếu.
- Cặp 30 ngày chạy trong MỘT giao dịch đồng bộ trên luồng chính: máy chủ không phục vụ request trong lúc đó (ước vài giây cho vài chục nghìn dòng; chưa đo trên file thật).
- Mọi ghi vào bảng `ktt_*` làm vô hiệu cache QUYTG / Phát (chỉ tính lại, không sai) — chấp nhận.
- `SQLITE_BUSY`: không đặt `busy_timeout` / PRAGMA mới; nếu NAS thật hay gặp bận từ script chạy tay, đề xuất PO duyệt `busy_timeout` ở `server/db.js`.

## 14. Test

`tests/ktt-sftp.test.js` (31 ca, dữ liệu giả, SFTP giả, đồng hồ giả): cặp đủ; chờ cặp rồi nạp; nạp lại không đổi số dòng; lần 2 cập nhật dòng lần 1; file cũ đến muộn không ghi đè; cùng tên khác nội dung → từ chối (kể cả sha256 khác); cùng tên cùng nội dung → đã nạp; file rỗng; BOM / nháy kép / CRLF; SHBG chuẩn hóa + khóa trùng trong file; dòng biến mất chỉ đếm; hoàn tác cả cặp khi một file sai cột; cặp 30 ngày; thứ tự cũ trước + giới hạn mỗi lượt; không tải lại; `SQLITE_BUSY` thử lại + giới hạn lần thử; cảnh báo (a)–(d); hẹn giờ (tắt mặc định, không chạy trong test, cấu hình sai, khóa, lỗi mạng / xác thực); API ADMIN; tham số; ba `TZ` (`UTC`, `Asia/Ho_Chi_Minh`, `America/Los_Angeles`).
Sửa `tests/tham-so.test.js` (số khóa 32→38, 25→31 khóa sửa được, bảng getter) vì danh bạ tham số có thêm 6 khóa.

## 15. KTT-17-1 — danh sách hàng hoàn (ItemReturn): file ĐỘC LẬP

Nguồn: CSDL BCCP, bảng ItemReturn; PO chạy tay script `KTT-HH-1_Script_nguon_ItemReturn.sql` (lúc golive, rồi cùng giờ 09:00 / 15:00 với KTT-1) → `KTT_HangHoan_<yyyymmdd>_<hhmmss>.csv`, cột `SHBG`, `Nguon_xuat_luc` (cột khác bị bỏ). Lần đầu cửa sổ 60 ngày, định kỳ 7 ngày. Ứng dụng KHÔNG kết nối BCCP.
**Chỉ LƯU danh sách** (bảng `ktt_hang_hoan`) ở KTT-17-1; **từ KTT-17-2** `phanLoaiShbg` dùng danh sách này để nhận diện hàng hoàn (`41_KTT_LUU_THOAT.md` mục 5, `04_DECISIONS.md` #121), nên phải nạp trước khi golive.

- **Cộng dồn:** SHBG đã vào là hàng hoàn; file mới không chứa SHBG cũ thì KHÔNG xóa. UPSERT theo `Nguon_xuat_luc`: mới ≥ cũ thì cập nhật, cũ hơn thì bỏ qua (đếm `so_dong_bo_qua`). SHBG chuẩn hóa như `ktt_buu_gui.shbg` (trim, CHỮ HOA, Ð → Đ).
- **Nhật ký RIÊNG** `ktt_hang_hoan_nap`: `ktt_nap_lan.loai` có `CHECK (loai IN ('TUI','BUU_GUI'))` nên không dùng được và KHÔNG sửa bảng cũ. Cột: tên file, `sha256` (UNIQUE: nạp lại cùng nội dung = `DA_NAP`), `nap_luc`, `nguon_xuat_luc`, số dòng đọc / thêm / cập nhật / bỏ qua / lỗi / trùng, `trang_thai` OK | REJECTED, `thong_bao`, `loi_mau` (chỉ số dòng + tên cột + mã `KHOA_RONG` / `NGUON_XUAT_RONG` / `GIO_SAI_DINH_DANG`; KHÔNG ghi giá trị SHBG), `size_file` / `mtime_file` (để SFTP không tải lại).
- **Importer** `server/lib/kttHangHoan.js` (`importKttHangHoan`, `importHangHoanDuongDan`, `docDoMoiHangHoan`): dùng lại lõi đọc `kttImport.docFile` (BOM, CRLF / LF, nháy kép; thiếu cột `SHBG` / `Nguon_xuat_luc` hoặc cột trùng tên → REJECTED, hoàn tác cả file; file 0 byte / chỉ BOM / chỉ tiêu đề = hợp lệ, 0 dòng, `nguon_xuat_luc` của lần nạp lấy từ tên file; dòng SHBG rỗng / giờ sai → bỏ + đếm lỗi). Một giao dịch; `dryRun` chạy trong giao dịch rồi hoàn tác.
- **CLI** (máy dev; container NAS không có `scripts/`): `node scripts/ktt-hang-hoan-import.js <file | thư-mục> [--dry-run] [--db …]`. Chỉ in số tổng hợp, không in SHBG. Mã thoát 0 / 2 (có file REJECTED hoặc sai tên) / 1.
- **SFTP** (`kttSftp.quetMotLan`): `KTT_HangHoan_*.csv` (ngày giờ phải có thật) được nhận như MỘT FILE ĐỘC LẬP: không ghép cặp, không tạo `CHO_CAP` trong `ktt_nap_cap`, không sinh cảnh báo `THIEU_FILE` / `CAP_*`, không tính vào `fileLa`. Ổn định ≥ 2 lượt quét như file KTT (bảng `ktt_nguon_file`); đã OK / REJECTED cùng tên + kích thước + mtime thì không tải lại; xử lý SAU các cặp (tối đa 10 file mỗi lượt); lỗi tải / nạp chỉ ghi log mã lỗi và thử lại ở lượt sau, không ảnh hưởng cặp. Kết quả lượt có thêm `hangHoan { tong, nap, daCo, chuaOnDinh, tuChoi, loi, vuotToiDa }` (ngoài `dem`, nên `dem` giữ nguyên). Ghép cặp Tui / BuuGui KHÔNG đổi. `sauNap` (làm nóng cache) không chạy cho file hàng hoàn vì chưa chỉ số nào dùng nó.
- **API** `GET /api/nap-nguon/ktt/trang-thai` (chỉ ADMIN) có thêm `do_moi_hang_hoan`: `{ nguon_xuat_luc, nap_luc }` của lần nạp OK có `nguon_xuat_luc` lớn nhất, hoặc `null`. Không cảnh báo mới (độ mới KTT `do_moi` vẫn chỉ theo cặp).
- **Chưa làm / đề xuất cho KTT-17-2:** nối `phanLoaiShbg` với `ktt_hang_hoan` (khóa `shbg`); đưa phiên bản danh sách vào khóa cache (`kttApi.boNho` hiện khóa theo `thamSo.phienBan|chuKyLich`, nên đổi quy tắc cần khởi động lại tiến trình hoặc đổi khóa); cảnh báo «danh sách hàng hoàn cũ» nếu PO muốn; chưa chạy trên SFTP thật.
- **Test:** `tests/ktt-hang-hoan.test.js` (17 ca, dữ liệu giả `ZZHH-…`): schema (không sửa `ktt_nap_lan`), đủ cột / cột lạ, LF + không BOM, thiếu cột, file rỗng (3 kiểu), chuẩn hóa SHBG + trùng trong file, dòng lỗi (mã không kèm giá trị), nạp lại, UPSERT cũ / mới, cộng dồn, dry-run + SAI_TEN + thư mục, CLI (dry-run không dựng schema, chạy thật, chạy lại, mã thoát), SFTP giả (file đứng một mình, cặp + file hàng hoàn cùng thư mục, đổi nội dung + file hỏng, tên sai mẫu), API `do_moi_hang_hoan`. `tests/ktt-sftp.test.js` chỉ đổi dòng kiểm danh sách khóa của API (thêm `do_moi_hang_hoan`).
