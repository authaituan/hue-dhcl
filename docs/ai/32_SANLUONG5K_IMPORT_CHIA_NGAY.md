# SANLUONG-5k — `import-arrivals.js --chia-ngay`: nạp một file nhiều ngày, tự chia theo ngày đến

Importer thường chỉ nhận file ≤ 5 ngày (ngày đến ∈ `[file_date−3, file_date+1]`, > 1 % ngoài ⇒ REJECTED). `--chia-ngay` cho phép nạp MỘT file phủ tới 31 ngày bằng một lệnh,
thay cho `split-arrivals-csv.js` + nạp thư mục (#63). Mặc định TẮT; không cờ thì hành vi cũ không đổi (`chuanBiFile` / `ghiFileDaChuanBi` không bị sửa).

## Cách dùng

```
node scripts/import-arrivals.js D:\xuat\HangDen_535470_20261014_093000.csv --chia-ngay [--db <DB>]
```

- Chỉ nhận MỘT file, tên đúng mẫu `HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv` (mã BCVH và ngày lấy từ tên; ngày phải có thật). Thư mục hoặc tên sai ⇒ không nạp.
- Ngày đến = quy tắc R2 (#59) trên giờ trong file (đã là giờ VN, không đổi múi giờ — #65). Mỗi nhóm ngày nạp như một file ảo
  `HangDen_<mã>_<yyyymmdd ngày đến>_235959.csv` (`file_date` = ngày đó, `source = MANUAL`, giờ 23:59:59 — đúng quy ước của #63); sha256 và kích thước = của file thật.
- MỘT giao dịch cho cả file: nhóm nào lỗi ⇒ hoàn tác toàn bộ, không còn dữ liệu nửa vời. Nạp lại cùng file ⇒ mọi nhóm «đã nạp», 0 dòng mới.
- In từng ngày (dòng, SHBG, nạp mới, bỏ qua) và tổng; mã thoát 0 xong · 2 REJECTED/CONFLICT (không ghi gì) · 1 sai cách dùng.

```
Ngày       | Dòng  | SHBG  | Nạp mới | Bỏ qua | Ghi chú
2026-10-01 |     3 |     3 |       3 |      0 |
...
2026-10-14 |     5 |     5 |       5 |      0 |
Tổng: 14 ngày, 44 dòng, 44 SHBG (cộng theo ngày), 44 dòng nạp mới, 0 dòng bỏ qua.
```

## Quy tắc và giới hạn

- Khoảng ngày đến hợp lý: `[ngày tên file − 30, ngày tên file + 1]`. Dòng ngoài khoảng ⇒ cảnh báo, xếp vào nhóm ngày TRONG TÊN file (giữ nguyên `arrival_date`);
  **> 1 % số dòng có ngày đến** ngoài khoảng ⇒ REJECTED cả file.
- Dòng không có mốc đến BCVH nào (ngày đến NULL) ⇒ cảnh báo, xếp vào nhóm ngày trong tên file (như nạp thường: file có `file_date` = ngày tên file).
- `BC_nhan_BG` khác mã trong tên file: cảnh báo, > 1 % dòng ⇒ REJECTED.
- Tối đa 31 nhóm ngày; thừa ⇒ REJECTED. File rỗng / chỉ BOM / chỉ tiêu đề ⇒ không ghi gì.
- Cột, BOM, định dạng ngày giờ kiểm như nạp thường (cùng `resolveHeader`, `toItem`).
- Không dùng cho SFTP / «Thay thế ngày» (không đổi hai chức năng này).

## Hệ quả cần biết

- **Tên ảo cố định theo ngày** + `UNIQUE(file_name, sha256)` và «một bản OK/EMPTY mỗi tên»: nạp một file KHÁC nội dung nhưng chứa ngày đã nạp ⇒ CONFLICT, hoàn tác cả file.
  Muốn nạp lại sau khi xuất lại: xóa ngày cũ trước (`scripts/xoa-du-lieu-bcvh.js`, SANLUONG-5j), rồi `--chia-ngay`.
- Dòng trùng khoá `(SHBG, BD10, BD8, giờ XN BG)` với dòng đã có (ở file khác) bị bỏ qua và đếm ở cột «Bỏ qua».
- Lưới «Nạp dữ liệu nguồn»: mỗi ngày có một file `MANUAL` nên cả hai đợt S/C hiện «Nhập tay» (không có SFTP); tổng dòng theo ngày đúng. `getMissingBatches` (cần 2 file/ngày) vẫn báo «thiếu đợt»
  cho các ngày này, như quy trình tách tay của #63.
- «Thay thế ngày» và 5j quản lý theo `(BCVH, file_date)` nên xóa / thay đúng từng ngày đã chia.
- `file_size` / `sha256` của mọi nhóm bằng của file thật (không phải kích thước phần nhóm).

Test: `tests/arrivals-chia-ngay.test.js` (9 ca, DB tạm + CSV giả).
