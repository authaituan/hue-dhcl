# 🔁 SANLUONG-5g-3 — «Thay thế ngày của một BCVH»: THỰC HIỆN nguyên khối

> Bối cảnh: `14_XOA_DU_LIEU_NGAY_AUDIT.md` (khảo sát), `15_THAY_THE_NGAY_XEM_TRUOC.md` (5g-2, chỉ đọc), `04_DECISIONS.md` #83 (quyết định của ticket này).
> **Hoặc xong hết, hoặc DB y nguyên.** Chưa chạy với NAS thật, chưa chạy với DB thật. Hoàn tác từ thùng rác là 5g-5; giao diện là 5g-4 — KHÔNG có ở đây.

## 1. Quy tắc (PO chốt 14–15/10/2026)
- **«Ngày» = ngày trong TÊN FILE (`file_date`)**. Thay (BCVH X, ngày D) = xóa dữ liệu ĐÃ NẠP TRONG DB (không đụng CSV trên nguồn; tài khoản SFTP chỉ đọc) rồi nạp lại từ các file đã chọn trên nguồn. Phần chiều tối ngày D nằm ở file sáng D+1 → giữ nguyên.
- Xóa: (1) dòng `arrival_items` của mọi file `unit_code = X`, `file_date = D`; (2) bản ghi `arrival_import_files` của các file đó, **kể cả `REJECTED` / `CONFLICT` và file nhập tay `_235959`** (để sót thì lõi SFTP chặn nạp lại bằng `DA_TU_CHOI`); (3) **KHÔNG** xóa trạng thái phát (`phat_status_current(bcvh, shbg)`, tự nối lại theo SHBG; chỉ báo ảnh hưởng).
- Tập file thay = file của (X, D) trên nguồn mà người dùng chọn (mặc định tất cả); không tự đoán file «chuẩn». Thay thật **tải và kiểm lại**, không tin bản xem trước; mã băm phải khớp.
- **Mất SHBG**: khóa mặc định. Chỉ thay khi `dong_y_mat_du_lieu === true`. Ngưỡng ĐỎ `NGUONG_MAT_SHBG_DO = 0.05` (`server/config/thay-the.js`, TẠM). Mức cảnh báo và khóa tính theo **«mất thật»** (mục 4); số «cận trên» của 5g-2 vẫn được trả.
- Luôn phải **gõ lại mã BCVH và ngày** (`xac_nhan`). Chỉ ADMIN.

## 2. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/thayTheThucHien.js` | `thayTheNgay({ client\|ketNoi, dirs, db, bcvh, ngay, tapFile, tapFileNguonDuKien, xacNhan, dongYMat, nguoiThucHien, tmpDir, sauLuuDir, now, bimat, options })`, `ensureThayTheSchema`, `donThungRac`, `donSaoLuu`, lớp lỗi `ThayTheLoi` (con của `XemTruocLoi`). **Không** nạp thư viện SFTP, không mở DB |
| `server/lib/thayTheXemTruoc.js` (sửa nhỏ, giữ nguyên hành vi) | tách ra dùng chung: `lietKeNguonCuaNgay`, `tinhSoSanh`, `mucCanhBaoTheo`; xuất thêm `docPhiaDb`, `docPhiaPhat`. Kết quả xem trước không đổi (26 ca 5g-2 xanh) |
| `server/config/thay-the.js` | thêm `SO_NGAY_GIU_THUNG_RAC = 30`, `SO_BAN_SAO_LUU_GIU = 5`, `DEM_SAO_LUU_BYTE = 32 MiB` |
| `server/db.js` | gọi `ensureThayTheSchema` (như các bảng đồng bộ) |
| `server/routes/arrivals.js` | **`POST /api/arrivals/thay-the/thuc-hien`** (chỉ ADMIN) |
| `scripts/thay-the-ngay.js` | chạy tay: khô (mặc định) / thật |
| `tests/thay-the-thuc-hien.test.js` (32 ca), `tests/helpers/khongMang.js` | test; đã thêm vào `npm test` |

## 3. Thứ tự trong lõi (BẮT BUỘC)
1. **Đầu vào + xác nhận**: `kiemTraDauVao` (như 5g-2); `tap_file_nguon` là mảng `{ten, sha256}`; `xac_nhan.ma_bcvh === bcvh` và `xac_nhan.ngay === ngay`, sai → `XAC_NHAN_SAI`, chưa động khoá, mạng hay DB.
2. **Giữ khoá thật**: cờ trong bộ nhớ (`DANG_THAY_THE`) → `kiemTraKhoa` (lượt đồng bộ đang chạy / hẹn giờ `DANG_CHAY`) → ghi hàng khoá vào `sftp_sync_runs` (cùng bảng và cùng ngưỡng 30 phút với lõi đồng bộ) trong MỘT giao dịch `IMMEDIATE`. `syncSftpOnce`, bộ hẹn giờ và `scripts/sftp-sync.js` thấy khoá và bỏ qua lượt. Nhả trong `finally` (xóa hàng khoá, kể cả khi lỗi).
3. **Nguồn**: kết nối (sau khi qua khoá), liệt kê, chọn tập, tải về thư mục tạm (giữ tên gốc), `chuanBiFile` từng file (không `db`). File chọn bị `REJECTED` / lỗi tải → `FILE_NGUON_LOI`, **không xóa gì** (bỏ tích file đó thì được). Tập `READY` rỗng → `KHONG_CO_FILE_DE_THAY`. `sha256` + tên của các file `READY` phải khớp `tap_file_nguon` của bản xem trước, lệch / thêm / thiếu → `NGUON_DA_DOI`.
4. **So sánh** (lõi 5g-2 + «mất thật»). «Mất thật» > 0 mà `dongYMat !== true` → `CAN_DONG_Y_MAT_DU_LIEU`.
5. **Sao lưu** (chỉ sau bước 4): `db.backup()` toàn DB (mục 6). Lỗi / thiếu chỗ → dừng, chưa thay gì.
6. **MỘT `db.transaction` đồng bộ** (không `await`): kiểm lại tập cũ chưa đổi (`DU_LIEU_DA_DOI`) → tạo dòng nhật ký (lấy id mẻ thùng rác) → (a) chép dòng + bản ghi file vào thùng rác → (b) xóa `arrival_items` rồi `arrival_import_files`, kiểm số dòng / file xóa đúng số đã tính → (c) `ghiFileDaChuanBi(db, d, { ghiTuChoi: false, source: 'SFTP' })` từng file → (d) kiểm `status` ∈ `OK` / `EMPTY` (hàm ghi **chỉ trả** `REJECTED`, không ném; nếu khác thì lõi tự ném) → (e) điền kết quả nạp vào nhật ký. Lỗi bất kỳ → DB y nguyên.
7. **Dọn** (lỗi dọn không làm hỏng lần thay đã xong): thùng rác quá hạn, sao lưu quá 5 bản; xóa tệp tạm; nhả khoá; `client.end()`.

**Nguyên khối** được kiểm bằng test: file thứ hai bị `REJECTED` (giả lập và bằng trigger DB thật), ném lỗi lúc ghi file thứ hai, ném lỗi ngay sau khi xóa, dữ liệu đổi giữa chừng — tất cả so sánh nội dung MỌI bảng liên quan (kể cả thùng rác, nhật ký, khoá) trước / sau: y nguyên.

## 4. «Mất thật»
`shbg_mat_can_tren` = SHBG (chuẩn hóa `trim().toUpperCase()`) có ở tập cũ, không có ở tập mới (số của 5g-2). `shbg_mat_that` = số đó **trừ** SHBG vẫn còn dòng ở file NGOÀI tập của **cùng BCVH** (`arrival_import_files.unit_code = X`, vd file sáng D+1). File của BCVH khác không cứu SHBG. Quét bằng `iterate()` (không nạp cả bảng vào bộ nhớ) và dừng sớm khi đã cứu hết. `ty_le_mat_that = mat_that / shbg_cu`; mức `AN_TOAN` / `CAN_XAC_NHAN` (đúng 5 % vẫn thế) / `DO` (> 5 %) tính theo «mất thật».

## 5. Bảng mới (giờ lưu **UTC ISO** `…Z`, như các bảng đồng bộ; `CREATE TABLE IF NOT EXISTS`, không đổi bảng hiện có)
- **`thay_the_nhat_ky`**: `id`, `thoi_diem_utc`, `nguoi_thuc_hien` (mã HRM hoặc `script:<tên>`), `bcvh`, `ngay`, `tap_file_cu` (JSON), `tap_file_moi` (JSON: tên, sha256, trạng thái, số dòng, đã ghi, bỏ qua trùng), `so_file_cu`, `so_dong_cu`, `so_file_moi`, `so_dong_moi`, `shbg_cu`, `shbg_mat_that`, `shbg_mat_can_tren`, `muc_canh_bao`, `dong_y_mat`, `duong_dan_sao_luu`, `ket_qua` (`THANH_CONG`; `DA_HOAN_TAC` chừa cho 5g-5), `thung_rac_het_han_luc`, `thung_rac_da_don`. Chỉ lần thay THÀNH CÔNG mới có dòng nhật ký (lần thất bại hoàn tác cả dòng này; dấu vết của lần thất bại nằm ở `SECURITY_LOG`).
- **`thung_rac_file`**: `rac_id` (khóa), `thung_rac_id` (= `thay_the_nhat_ky.id`, mỗi lần thay là một mẻ) + MỌI cột của `arrival_import_files` (cột `id` giữ **id gốc**).
- **`thung_rac_dong`**: `rac_id`, `thung_rac_id` + MỌI cột của `arrival_items` (`id` và `import_file_id` giữ **giá trị gốc**, nên liên kết file ↔ dòng khôi phục được). Không UNIQUE / khóa ngoại tới bảng sống (id có thể bị dùng lại sau khi xóa). Test mô phỏng khôi phục (xóa bản mới, chép ngược từ thùng rác) và so từng cột: bằng nguyên trạng. Test cũng canh để cột hai bảng thùng rác luôn khớp bảng gốc.
- Thùng rác giữ **30 ngày** kể từ lúc thay; `donThungRac(db, now)` xóa mẻ quá hạn (chạy cuối mỗi lần thay thành công hoặc gọi riêng; **không** có tác vụ nền) và đặt `thung_rac_da_don = 1` (nhật ký giữ lại).

## 6. Sao lưu
`<thư mục chứa DB>/backups/` (mặc định **`data/backups/`**), tên `truoc-thay-the_<bcvh>_<yyyy-mm-dd>_<yyyymmddThhmmssZ>[_n].db`, giữ **5 bản** mới nhất (chỉ xóa tệp đúng mẫu tên này; cùng giây thì thêm `_2`, `_3`). Kiểm chỗ trống (`fs.statfsSync`): cần ≥ 1,2 × (DB + WAL) + 32 MiB, thiếu → `KHONG_DU_CHO_SAO_LUU` (507); lỗi khác → `SAO_LUU_LOI` (500). Tệp dở bị xóa. Lần thay thất bại SAU sao lưu vẫn để lại bản sao lưu (vô hại; sẽ bị dọn khi quá 5 bản). `data/backups/` nằm trong `/data/` (đã `.gitignore`).

## 7. Route
`POST /api/arrivals/thay-the/thuc-hien` — chỉ ADMIN (401 không token; 403 TTVH, GDVH, STAFF, TIVI). Thân JSON:
```json
{ "bcvh": "533140", "ngay": "2026-10-10", "tap_file": ["HangDen_…csv"],
  "tap_file_nguon": [{ "ten": "HangDen_…csv", "sha256": "…64 hex…" }],
  "xac_nhan": { "ma_bcvh": "533140", "ngay": "2026-10-10" }, "dong_y_mat_du_lieu": false }
```
`tap_file` tùy chọn (mặc định tất cả); `tap_file_nguon` lấy nguyên từ bản xem trước; khóa lạ → 400. Thành công 200: tóm tắt (`so_dong_xoa`, `so_dong_nap`, `so_file_*`, `so_sanh`, `canh_bao`, `phat`, `tap_file_moi`, `nhat_ky_id`, `sao_luu {tep, kich_thuoc}` — **chỉ tên tệp, không đường dẫn**, `thung_rac`, `da_don`, `thoi_gian_ms`). Không có SHBG. Ghi `SECURITY_LOG` `event: "arrivals_thay_the_thuc_hien"` (ai, IP, BCVH, ngày, kết quả; `nhat_ky_id`, số dòng, `shbg_mat_that` — số lượng, không SHBG).

| Mã | HTTP | Thoát (script) | Nghĩa |
|---|---|---|---|
| `THAM_SO_SAI`, `TAP_FILE_KHONG_HOP_LE`, `XAC_NHAN_SAI` | 400 | 8 | Tham số / xác nhận sai (kiểm TRƯỚC khi mở DB hay kết nối) |
| `DANG_CO_LUOT_DONG_BO`, `DANG_THAY_THE` | 409 | 7 | Đang có lượt đồng bộ SFTP / lần thay khác |
| `NGUON_DA_DOI` | 409 | 10 | Mã băm / tập file khác bản xem trước → xem trước lại |
| `CAN_DONG_Y_MAT_DU_LIEU` | 409 | 9 | «Mất thật» > 0, thiếu `dong_y_mat_du_lieu: true` |
| `DU_LIEU_DA_DOI` | 409 | 1 | Dữ liệu của (BCVH, ngày) đổi giữa lúc chuẩn bị và lúc giao dịch (đã hoàn tác) |
| `FILE_NGUON_LOI`, `KHONG_CO_FILE_DE_THAY` | 422 | 1 | File chọn lỗi / tải lỗi; tập mới rỗng |
| `CHUA_CAU_HINH_SFTP` | 503 | 2 | Thiếu / sai `SFTP_*` |
| `NGUON_XAC_THUC`, `NGUON_VAN_TAY`, `NGUON_MANG`, `NGUON_THU_MUC`, `NGUON_KHAC` | 502 | 4, 5, 3, 6, 1 | Lỗi nguồn — KHÔNG thử lại |
| `KHONG_DU_CHO_SAO_LUU` | 507 | 11 | Không đủ chỗ sao lưu |
| `SAO_LUU_LOI` | 500 | 11 | Sao lưu lỗi |
| `GHI_THAT_BAI` | 500 | 1 | Giao dịch thay thế thất bại và đã hoàn tác |
Script: 0 xong · 1 lỗi khác · 2 cấu hình / DB · 3 mạng · 4 xác thực · 5 vân tay · 6 thư mục · 7 đang có lượt khác · 8 tham số / xác nhận sai · 9 cần `--dong-y-mat` · 10 nguồn đã đổi · 11 sao lưu lỗi.

## 8. PO chạy script từng bước (PowerShell)
**Trước khi chạy thật: tự sao lưu thêm bằng cách riêng** (`Copy-Item data\hue-dhcl.db* …`, đủ `-wal`, `-shm`). Biến môi trường như `sftp-sync` (`13_SFTP_SYNC.md`; cổng NAS 5454):
```powershell
Set-Location D:\Dev\hue-dhcl
$env:SFTP_HOST = '<IP hoặc tên NAS>'; $env:SFTP_PORT = '5454'
$env:SFTP_HOSTKEY_SHA256 = 'SHA256:<vân tay đã ghim>'; $env:SFTP_USER = '<tài khoản chỉ đọc>'
$sec = Read-Host 'Mật khẩu SFTP' -AsSecureString
$env:SFTP_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:SFTP_DIRS = '/CSV_Report_533140'
# 1) CHẠY KHÔ (mặc định; DB mở chỉ-đọc; không khóa, không sao lưu, không thay) — in cả «mất thật»
node scripts/thay-the-ngay.js --bcvh=533140 --ngay=2026-10-10
$LASTEXITCODE
# 2) THAY THẬT — cần CẢ BA: --chay-that, --xac-nhan khớp --bcvh/--ngay, và --dong-y-mat nếu «mất thật» > 0
node scripts/thay-the-ngay.js --bcvh=533140 --ngay=2026-10-10 --chay-that --xac-nhan=533140:2026-10-10
$LASTEXITCODE
Remove-Item Env:SFTP_PASSWORD, Env:SFTP_USER
```
Chỉ dùng một số file: thêm `--chi-lay=<tên>,<tên>`. Chạy thật làm hai lượt trong một lệnh: lượt 1 (khô) lấy mã băm + in kết quả; nếu «mất thật» > 0 mà thiếu `--dong-y-mat` thì dừng mã 9 trước khi khóa; lượt 2 tải lại, **so mã băm với lượt 1**, sao lưu rồi mới thay. DB mặc định `data\hue-dhcl.db` (hoặc `ARRIVALS_DB`); sao lưu ra `data\backups\`. Script mở DB ở chế độ GHI chỉ khi `--chay-that` (chờ khóa ghi tối đa 30 giây nếu máy chủ đang ghi).

## 9. Khi lỗi — tự xử lý
- Mã 8 / 400: sửa tham số. Mã 7 / 409 đang có lượt: đợi lượt đồng bộ xong rồi chạy lại. Nếu tiến trình bị tắt đột ngột giữa chừng, hàng khóa trong `sftp_sync_runs` (ghi chú «Khóa tạm của Thay thế ngày», `finished_at` rỗng) tự đóng sau 30 phút khi có lượt mới — hoặc PO tự đóng bằng cách đặt `finished_at`.
- Mã 10: nguồn đã đổi → chạy khô lại để lấy mã băm mới. Mã 9: xem lại số «mất thật» rồi mới thêm `--dong-y-mat`.
- Lỗi giao dịch (`GHI_THAT_BAI`, `DU_LIEU_DA_DOI`): DB đã y nguyên; bản sao lưu vừa tạo còn đó, có thể xóa.
- **Muốn quay lại sau khi thay xong**: chưa có nút hoàn tác (5g-5). Thùng rác (`thung_rac_*`) giữ bản sao 30 ngày; khôi phục toàn bộ DB từ `data\backups\truoc-thay-the_*.db` bằng tay (tắt máy chủ, chép đè `hue-dhcl.db`, xóa `-wal` / `-shm`) — chỉ làm khi thật cần vì mất mọi thay đổi sau đó.

## 10. Điều chưa chắc
- **Chưa chạy với NAS / DB thật.** Đo trên dữ liệu giả (DB 37 MB ≈ 150 nghìn dòng; xóa 3.500 + nạp 4.000 dòng): cả lần thay ≈ 0,3 s, bản sao lưu 38 MB. DB thật vài GB: `db.backup()` có thể mất vài giây đến vài chục giây (chưa đo; bất đồng bộ nên không chặn máy chủ) và giao dịch đồng bộ ~3–4 nghìn dòng chặn vòng lặp sự kiện cỡ trăm mili-giây (DB thật chậm hơn ~10× theo số đo 5e).
- Khóa giữa script (tiến trình 1) và máy chủ (tiến trình 2) chỉ qua bảng `sftp_sync_runs`; hàng khóa treo do tắt đột ngột chặn tối đa 30 phút. Script nhập tay `import-arrivals.js` KHÔNG kiểm khóa này — nếu ai nạp tay đúng (BCVH, ngày) đang thay, giao dịch phát hiện (`DU_LIEU_DA_DOI`) hoặc đợi khóa ghi.
- WAL lớn: giao dịch ghi nhiều dòng làm WAL phình tạm thời; bản sao lưu tính cả `-wal` khi ước chỗ trống.
- File `BOM`/rỗng (≤ 3 byte) trong tập chọn được ghi bản ghi `EMPTY` (đủ «2 file/ngày»), không tính vào mã băm dự kiến; file đó đổi từ rỗng sang có nội dung → `NGUON_DA_DOI`.
- Tên trùng giữa nhiều thư mục `SFTP_DIRS`: chỉ lấy thư mục đầu (như 5g-2).
- «Mất thật» chỉ xét file cùng `unit_code`; SHBG chuyển sang file của BCVH khác vẫn tính là mất (đúng nghiệp vụ: dữ liệu này là của BCVH X).
