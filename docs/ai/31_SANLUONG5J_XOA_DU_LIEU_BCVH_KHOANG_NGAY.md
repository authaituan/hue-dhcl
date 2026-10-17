# SANLUONG-5j — Xóa dữ liệu hàng đến theo BCVH và khoảng ngày (`scripts/xoa-du-lieu-bcvh.js`)

Dùng khi PO muốn bỏ dữ liệu ĐÃ NẠP của một số BCVH trong một khoảng ngày để xuất lại từ nguồn rồi nạp bằng `scripts/import-arrivals.js`.
Mặc định **chạy khô** (DB mở chỉ-đọc, không ghi gì). Không dùng mạng, không đọc `.env` / SFTP.

## 1. Cách dùng

```
node scripts/xoa-du-lieu-bcvh.js --bcvh 535470,536250,537015,537220,535790 --tu 2026-10-01 --den 2026-10-14 [--db <DB>]
node scripts/xoa-du-lieu-bcvh.js --bcvh 535470,536250,537015,537220,535790 --tu 2026-10-01 --den 2026-10-14 --chay-that --xac-nhan "XOA 2026-10-01..2026-10-14" [--db <DB>]
```

- **«Ngày» = ngày trong TÊN FILE** (`arrival_import_files.file_date`), giống «Thay thế ngày». Mọi bản ghi file của BCVH đó trong khoảng bị xóa, mọi trạng thái
  (`OK`, `EMPTY`, `REJECTED`, `CONFLICT`), cùng toàn bộ dòng `arrival_items` của chúng.
- DB: `--db`, hoặc biến `ARRIVALS_DB`, mặc định `data/hue-dhcl.db` (như `import-arrivals.js`).
- Chặn cứng (mã thoát 8): `533140` (Thuận Hóa) — chuỗi `--bcvh` chứa `533140` ở bất kỳ đâu đều bị từ chối; mã ngoài 5 BCVH còn lại; `--tu`/`--den` không phải
  ngày có thật dạng `YYYY-MM-DD`; `tu > den`; khoảng > 31 ngày (tính cả hai đầu); `--chay-that` mà thiếu / sai `--xac-nhan "XOA <tu>..<den>"`.
- Mã thoát: 0 xong · 1 lỗi khác (giao dịch đã hoàn tác) · 2 không mở được DB · 7 đang có lượt đồng bộ SFTP / «Thay thế» / «Khôi phục» · 8 tham số / xác nhận sai · 11 sao lưu lỗi / không đủ chỗ.

## 2. Đầu ra chạy khô (dữ liệu giả)

```
BCVH 535470 (BCVH Hương Trà)
  file_date    file   dòng     SHBG    ngày đến (nhỏ nhất..lớn nhất)
  2026-10-01      2        5        5    2026-09-30..2026-10-01
  cộng            2        5        5    (SHBG khác nhau của BCVH; 5 không còn ở file nào khác)
...
TỔNG: 3 file · 6 dòng · 6 SHBG (cộng theo từng BCVH)

[CẢNH BÁO — KHÔNG xóa] Còn 1 dòng có NGÀY ĐẾN trong 2026-10-01..2026-10-14 nằm ở file có ngày trong tên NGOÀI khoảng:
  535470  file_date 2026-10-15: 1 dòng · 1 SHBG

[Trạng thái phát — KHÔNG xóa]
  535470: 1 SHBG có trạng thái phát; 0 còn dòng hàng đến ở file khác; 1 sẽ MỒ CÔI cho tới khi nạp lại
```

Ý nghĩa:
- **Ngày đến nhỏ nhất..lớn nhất**: `arrival_date` của các dòng sẽ xóa — file 01/10 thường có dòng đến 30/09 (đúng quy tắc importer `[ngày file − 3, + 1]`).
- **«không còn ở file nào khác»**: SHBG của phần xóa không có dòng nào ở file khác của cùng BCVH (dùng `tinhMatThat` của «Thay thế»).
- **CẢNH BÁO dòng ngoài khoảng**: dòng của các BCVH đó có *ngày đến* trong khoảng nhưng thuộc file có ngày trong tên ngoài khoảng (vd file sáng 15/10 mang hàng đến 14/10).
  Lệnh **không xóa** các dòng này. Sau khi nạp lại, dòng mới trùng khoá chống trùng `(SHBG, BD10, BD8, giờ XN BG)` với chúng sẽ bị importer bỏ qua (cột «Bỏ qua»),
  và sản lượng ngày 14/10 vẫn tính chúng. Muốn sạch hẳn thì mở rộng `--den` để gồm cả ngày đó.
- **Trạng thái phát**: số SHBG có `phat_status_current` trong phần xóa; «mồ côi» = không còn dòng hàng đến nào của cùng BCVH sau khi xóa.

## 3. Chạy thật làm gì (tái sử dụng «Thay thế ngày» #83)

1. Giữ **khoá chung** (`giuKhoaChung`: hàng giữ chỗ ở `sftp_sync_runs`) — hẹn giờ SFTP trong máy chủ app, «Lấy ngay / Lấy lại», «Thay thế», «Khôi phục» thấy khoá và chờ.
2. Khảo sát lại; không có file nào → dừng, **không** sao lưu.
3. **Sao lưu toàn DB** bằng `saoLuu` (db.backup, kiểm chỗ trống) vào `<thư mục DB>/backups/truoc-xoa-bcvh_<các mã>_<tu>_<den>_<UTC>.db`;
   giữ 5 bản gần nhất **của lệnh này** (bản `truoc-thay-the_*` / `truoc-khoi-phuc_*` có bộ đếm 5 bản riêng, không bị đụng). Chỉ in tên tệp.
4. **MỘT giao dịch**: tính lại và so với bước 2 (khác → hoàn tác); với mỗi cặp (BCVH, file_date): ghi một dòng `thay_the_nhat_ky` (`tap_file_moi = []`,
   `nguoi_thuc_hien = script:xoa-du-lieu-bcvh:<tên máy>`, `dong_y_mat = 1`), chép bản ghi file + dòng vào `thung_rac_file` / `thung_rac_dong` (giữ 30 ngày),
   xóa dòng rồi bản ghi file. Lỗi bất kỳ → hoàn tác toàn bộ, DB y nguyên (bản sao lưu vẫn còn).
5. Dọn thùng rác quá hạn (`donThungRac`) và sao lưu cũ; nhả khoá. In số nhật ký từng mẻ.

Bảng KHÔNG đụng: `phat_status_current`, `phat_status_history`, `phat_batches`, `sftp_source_files`, `sftp_sync_files`, `nap_nguon_da_xem_xet`, `ward_bdx_map` và mọi bảng khác.

## 4. Nạp lại sau khi xóa

- Chống trùng file của importer chỉ dựa vào `arrival_import_files` (`UNIQUE(file_name, sha256)`; một bản OK/EMPTY mỗi tên). Khi còn bản ghi: cùng file → «đã nạp»,
  cùng tên khác nội dung → `CONFLICT` (đúng). Sau khi xóa, file mới xuất lại (khác sha256) **và** cả file cũ đều nạp được bằng `scripts/import-arrivals.js`.
- Xóa cả bản ghi `REJECTED` / `CONFLICT` nên đồng bộ SFTP không còn bỏ qua file theo `DA_TU_CHOI`.
- Hẹn giờ SFTP chỉ quét `SFTP_SYNC_DAYS` ngày gần nhất (mặc định 3) → **không tự nạp lại** ngày cũ; nạp bằng `import-arrivals.js` (hoặc «Lấy lại»). Lưới «Nạp dữ liệu nguồn»
  sẽ thấy các ô đã xóa là «chưa nạp» cho tới khi nạp lại.

## 5. Quay lại

- **Từng mẻ (BCVH, ngày) trong 30 ngày**: «Khôi phục» của «Thay thế ngày» (5g-5, #87), chỉ ADMIN:
  `POST /api/arrivals/thay-the/khoi-phuc/xem-truoc {nhat_ky_id}` rồi `/thuc-hien {nhat_ky_id, xac_nhan: {ma_bcvh, ngay}}`, `nhat_ky_id` = số `#…` in ở cuối lần chạy thật
  (cũng thấy ở `GET /api/arrivals/thay-the/nhat-ky`, dưới dạng một lần «thay thế» có 0 file mới). Khôi phục là BỔ SUNG: nếu ngày đó đã nạp lại file cùng tên,
  dòng cũ gắn vào bản ghi hiện hành và dòng trùng khoá bị bỏ qua.
- **Toàn bộ**: tắt app, chép `backups/truoc-xoa-bcvh_…db` đè lên DB (xóa `-wal`, `-shm` cũ trước). Mọi thứ ghi sau lúc sao lưu sẽ mất.

## 6. Hệ quả với trạng thái phát

Trạng thái phát giữ nguyên. SHBG «mồ côi» vẫn nằm trong `phat_status_current` nhưng không được tính vào tỷ lệ phát (mẫu số lấy từ hàng đến) cho tới khi nạp lại;
nạp lại đúng SHBG thì tự nối lại theo (BCVH, SHBG), như «Thay thế ngày». SHBG không có trong file xuất lại sẽ mồ côi lâu dài (vô hại với số liệu, chỉ thừa dòng).

## 7. Test

`tests/xoa-du-lieu-bcvh.test.js` (11 ca, DB tạm + dữ liệu giả): tham số / chặn 533140 / ngày / khoảng; chạy khô không ghi; thiếu / sai xác nhận; xóa đúng phạm vi,
533140 + BCVH khác + file ngoài khoảng + trạng thái phát giữ nguyên, sao lưu / thùng rác / nhật ký; nạp lại bằng importer; lỗi giữa chừng hoàn tác (trigger DB và hook);
khoá đồng bộ → 7; khôi phục một mẻ; giữ 5 bản sao lưu.
