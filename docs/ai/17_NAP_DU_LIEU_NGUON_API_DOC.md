# 📥 SANLUONG-5f-1 — API ĐỌC cho màn «Nạp dữ liệu nguồn» (chỉ ADMIN)

> Bối cảnh: `13_SFTP_SYNC.md` (lõi đồng bộ, bảng «lượt lấy»), `15_SFTP_SCHEDULER.md` (hẹn giờ, bảng `sftp_source_files`), `16_THAY_THE_NGAY_THUC_HIEN.md` (hàng khóa «Thay thế»). Quyết định: `04_DECISIONS.md` #85.
> **Chỉ GET, chỉ ĐỌC** (không bảng mới, không ALTER / INSERT / UPDATE / DELETE, không mạng, không thư viện SFTP). Nút «Lấy lại» / «Lấy ngay» là 5f-2; giao diện là 5f-3. Chưa chạy với DB thật.

## 1. Mã nguồn
| File | Vai trò |
|---|---|
| `server/config/nap-nguon.js` | Hằng số TẠM (PO chưa chốt các giá trị đánh dấu *) |
| `server/lib/napNguonDoc.js` | Lõi thuần: `tongQuan`, `luoi`, `mot`, `dsLuot`, `chiTietLuot`, `NapNguonLoi`. Nhận `db`, `now` (Date, giờ máy chủ), trạng thái hẹn giờ (tiêm) |
| `server/routes/napNguon.js` | Năm đường dẫn `GET /api/nap-nguon/*`, mỗi đường `requireAdmin` (401 không token; 403 TTVH, GDVH, STAFF, TIVI); đăng ký ở `server/index.js` |
| `tests/nap-nguon-doc.test.js` | 17 ca; đã thêm vào `npm test` |
Lỗi: `400 THAM_SO_SAI` (tham số sai hoặc LẠ — mọi query ngoài danh sách đều bị từ chối), `404 KHONG_TIM_THAY` (lượt không có / là hàng khóa), `500 LOI_HE_THONG`.
Tên bảng đọc: `arrival_import_files`, `sftp_source_files`, `sftp_sync_runs`, `sftp_sync_files` (+ `post_offices` cho tên BCVH, `sftpScheduler.docTrangThaiSftp()` trong tiến trình).

## 2. Hằng số (`server/config/nap-nguon.js`)
`GIO_MONG_DOI_SANG = '09:30'*`, `GIO_MONG_DOI_CHIEU = '16:30'*`, `AN_HAN_PHUT = 60*`, `RANH_GIOI_DOT = '12:00'*`, `SO_NGAY_TOI_DA = 62`, `NGUONG_IT = 0.5*`, `NGUONG_NHIEU = 2.5*`, `SO_TUAN_MAU = 4*`, `TOI_THIEU_NGAY_MAU = 3*`, phân trang lượt (mặc định 20, tối đa 100), `LICH_SU_TOI_DA = 20`, `TIEN_TO_KHOA_THAY_THE = 'Khóa tạm của «Thay thế ngày»'`. (* = PO chưa chốt.)
Giờ trong DB là UTC (ISO `…Z`; `imported_at` của SQLite được đổi `YYYY-MM-DD HH:MM:SS` → `…T…Z`). «Hôm nay» và giờ mong đợi tính theo giờ cục bộ của `now` (TZ máy chủ phải là Asia/Ho_Chi_Minh khi triển khai).

## 3. Đường dẫn
### 3.1 `GET /api/nap-nguon/tong-quan`
```
{ tu_dong: { bat, trang_thai: DANG_CHAY|CHO|TAM_DUNG|TAT, ly_do_tam_dung: XAC_THUC|VAN_TAY|null, loi_luc (UTC|null), chu_ky_phut, so_thu_muc, luot_ke_tiep_luc (UTC|null) },
  luot_gan_nhat: { id, bat_dau, cach_chay: TU_DONG|TAY, ket_qua: THANH_CONG|CO_LOI } | null,
  dang_chay: { id, bat_dau } | null, gio_mong_doi: { sang, chieu, an_han_phut } }
```
`tu_dong` lấy từ bộ hẹn giờ TRONG TIẾN TRÌNH máy chủ (`docTrangThaiSftp`): `bat` = đang `CHO`/`DANG_CHAY`/`TAM_DUNG`; mọi trạng thái khác (tắt, cấu hình sai, chưa khởi động, đã dừng) = `TAT`. `luot_ke_tiep_luc` = giờ hẹn kế tiếp của chính bộ hẹn giờ đó (null khi không có). `loi_luc` = giờ của lượt gần nhất nếu nó lỗi. `so_thu_muc` chỉ là SỐ ĐẾM thư mục của cấu hình (null nếu chưa cấu hình). `cach_chay`: `trigger = TIMER` → `TU_DONG`, `MANUAL` → `TAY`. `dang_chay`: lượt chưa kết thúc, bắt đầu < 30 phút. Hàng khóa «Thay thế» (`ghi_chu_loi` bắt đầu bằng tiền tố ở mục 2) bị LỌC khỏi mọi chỗ. KHÔNG có host, cổng, tài khoản, mật khẩu, vân tay.

### 3.2 `GET /api/nap-nguon/luoi?tu=yyyy-mm-dd&den=yyyy-mm-dd[&bcvh=<mã>]`
Tối đa 62 ngày (400 nếu vượt, `tu > den`, ngày sai, mã BCVH lạ, thiếu `tu`/`den`, query lạ).
```
{ tu, den, bcvh, hom_nay, ds_bcvh: [{ma, ten}], gio_mong_doi,
  ngay_bat_dau: { "<mã BCVH>": "YYYY-MM-DD" },   // SANLUONG-5f-1b, #88; theo `ds_bcvh` (lọc bcvh thì chỉ một khóa)
  o: [ { bcvh, ngay, dot: S|C, trang_thai, ly_do, nghi_ngo, nguon_co_file,
         chi_tiet: { file_db: [{ten, nguon: MANUAL|SFTP, trang_thai, so_dong, nap_luc, loi}], file_nguon: [{ten, kich_thuoc, mtime, lan_dau_thay, con_tren_nguon}] } } ],
  ngay_bcvh: [ { bcvh, ngay, tong_dong, so_file_db, trung_vi, so_mau, nghi_ngo, nguon_co_file } ],
  can_xu_ly: [ { loai: DOT|NGAY|MA_LA, bcvh, ngay, dot, trang_thai, ly_do, nghi_ngo, nguon_co_file, (ma_la, ten_file) } ],
  tong_hop: { theo_trang_thai: {…}, nghi_ngo: {IT, NHIEU, CHUA_DU_MAU} } }
```
- `o`: ngày MỚI NHẤT trước, rồi thứ tự 6 BCVH (533140, 535470, 536250, 537015, 537220, 535790), đợt S trước C. `file_db` của một ô = file SFTP của đợt đó + MỌI file `MANUAL` của ngày (nhập tay là cả ngày).
- `ngay_bcvh`: một mục cho mỗi (BCVH, ngày) — chỗ UI vẽ ô «Cả ngày» và cờ nghi ngờ. Mỗi ô cũng mang `nghi_ngo` / `nguon_co_file` của ngày đó.
- `can_xu_ly` (mới nhất trước): `loai = DOT` — ô có trạng thái `LOI`, `RONG`, `NGUON_CO_FILE_CHUA_NAP`, `CHO_FILE`, `NGUON_CHUA_CO_FILE`; `loai = NGAY` — (BCVH, ngày) nghi ngờ `IT` / `NHIEU` (`dot = null`, `ly_do = NGHI_NGO_IT|NHIEU`; `CHUA_DU_MAU` KHÔNG vào danh sách); `loai = MA_LA` — `bcvh = null`, `trang_thai = MA_KHONG_KHOP`, kèm `ma_la` (≤ 12 ký tự) và `ten_file`. Lọc theo `bcvh` thì không có mục `MA_LA`.
- `tong_hop.theo_trang_thai`: số ô theo từng trạng thái (cộng `MA_KHONG_KHOP` = số file mã lạ). Đủ 10 khóa: `DA_NAP`, `NHAP_TAY`, `RONG`, `LOI`, `NGUON_CO_FILE_CHUA_NAP`, `CHO_FILE`, `CHUA_DEN_GIO`, `NGUON_CHUA_CO_FILE`, `MA_KHONG_KHOP`, `CHUA_BAT_DAU`.
- `ngay_bat_dau[bcvh]` (5f-1b): ngày NHỎ NHẤT trong `file_date` của mọi bản ghi `arrival_import_files` của BCVH (mọi trạng thái `OK`/`EMPTY`/`REJECTED`/`CONFLICT`, cả nhập tay) và ngày trong tên file của mọi dòng `sftp_source_files` có mã BCVH đó (kể cả `con_tren_nguon = 0`); không có gì → `hom_nay`. Tính MỘT lần cho cả lưới bằng truy vấn gộp, KHÔNG phụ thuộc `tu`/`den`. Ô có `ngay < ngay_bat_dau` là `CHUA_BAT_DAU` (không vào `can_xu_ly`).

### 3.3 `GET /api/nap-nguon/o?bcvh=&ngay=&dot=S|C`
Khung chi tiết một ô (ô trước ngày bắt đầu: `200`, `trang_thai = CHUA_BAT_DAU`, `file_db`/`file_nguon`/`lich_su` rỗng, `loi = null`): `trang_thai`, `ly_do`, `nghi_ngo`, `nguon_co_file`, `tong_ngay` (tổng dòng / trung vị / số mẫu), `file_mong_doi` { `mau_ten` `HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv`, `gio_mong_doi`, `an_han_phut` }, `file_db`, `file_nguon`, `thong_tin_nap` (file SFTP `OK` của đợt: tên, nạp lúc, số dòng, thời gian nạp ms từ lần `DA_NAP` gần nhất trong `sftp_sync_files`), `lan_thu_gan_nhat`, `loi` { `ma`, `chi_tiet` đã lọc } và `lich_su` (≤ 20, mới nhất trước, mỗi lần: `lan_id`, `luot_id`, `luc` UTC, `cach_chay`, `ten`, `ket_qua`, `so_dong`, `thoi_gian_ms`, `ma_loi`, `chi_tiet`).

### 3.4 `GET /api/nap-nguon/luot?trang=&kich_thuoc=` và `GET /api/nap-nguon/luot/:id`
Danh sách `{ trang, kich_thuoc, tong, so_trang, luot: [{ id, bat_dau, ket_thuc, cach_chay, liet_ke, da_nap, da_co, chua_on_dinh, rong, bo_qua_khac, loi, ket_qua, nguoi, ghi_chu_loi }] }`, mới nhất trước. `ket_qua`: `DANG_CHAY` (chưa kết thúc, < 30 phút), `TREO` (> 30 phút), `CO_LOI` (`loi > 0`), `THANH_CONG`. `nguoi` = `{ma, ten}` của người bấm «Lấy ngay» / «Lấy lại» (5f-2, `18_…`), `null` với lượt tự động và hàng cũ; `loai` = `LAY_NGAY` \| `LAY_LAI` \| null; `so_o_yeu_cau`. `luot_gan_nhat` và `dang_chay` (tổng quan) cũng có `loai`, `nguoi`. Chi tiết: thêm `files: [{id, ten, ket_qua, so_dong, thoi_gian_ms, ma_loi, chi_tiet}]` (KHÔNG trả thư mục nguồn). Lượt không có / là hàng khóa → 404.

## 4. Bảng trạng thái của một ô (đã chốt)
Đợt: `S` nếu `file_time < 12:00`, `C` nếu `≥ 12:00` (file 11:59:59 → S, 12:00:00 → C). Xét THEO THỨ TỰ, dừng ở quy tắc đầu tiên khớp:
| # | Điều kiện (BCVH, ngày = `file_date`, đợt) | `trang_thai` | `ly_do` |
|---|---|---|---|
| 0 | `ngay` < `ngay_bat_dau` của BCVH (xét TRƯỚC mọi quy tắc khác; `ly_do = null`, `nghi_ngo = null`, không file) | `CHUA_BAT_DAU` | — |
| 1 | có file SFTP của đợt `status OK` | `DA_NAP` | — |
| 2 | có file SFTP của đợt `EMPTY` (và không có `OK`) | `RONG` | `EMPTY` |
| 3 | có file SFTP của đợt `REJECTED`/`CONFLICT` (không `OK`/`EMPTY`) | `LOI` | `REJECTED` / `CONFLICT` |
| 4 | không có bản ghi SFTP của đợt, nhưng `sftp_source_files` còn file của đợt (`con_tren_nguon = 1`) — kể cả ngày đã có file nhập tay | `NGUON_CO_FILE_CHUA_NAP` | `CHUA_NAP` / `NHAP_TAY_CO_SAN` (đã có nhập tay) |
| 5 | không có bản ghi SFTP, nguồn không có, nhưng có file `MANUAL` đã chấp nhận (`OK`/`EMPTY`) của ngày (cả S và C) | `NHAP_TAY` | — |
| 6 | HÔM NAY hoặc tương lai, chưa tới giờ mong đợi + ân hạn (S: 09:30 + 60 ph; C: 16:30 + 60 ph) | `CHUA_DEN_GIO` | `NGAY_TUONG_LAI` nếu ngày > hôm nay |
| 7 | HÔM NAY, đã quá giờ mong đợi + ân hạn | `CHO_FILE` | `QUA_GIO_MONG_DOI` |
| 8 | ngày QUÁ KHỨ, không có gì ở DB lẫn nguồn | `NGUON_CHUA_CO_FILE` | `KHONG_THAY_TREN_NGUON` |
| — | file đúng mẫu tên nhưng mã ngoài 6 BCVH (không thuộc ô nào) | `MA_KHONG_KHOP` (chỉ trong `can_xu_ly` / `tong_hop`, `bcvh = null`) | `MA_LA` |
Ghi chú: file `MANUAL` bị `REJECTED`/`CONFLICT` không làm đổi trạng thái ô (chỉ hiện trong `file_db`). Trong khoảng [giờ mong đợi, giờ mong đợi + ân hạn) của hôm nay vẫn là `CHUA_DEN_GIO`.
**Cờ phụ**
- `nguon_co_file` (mức NGÀY, cùng giá trị cho S và C): `null` = chưa từng quét thấy thông tin nguồn (bảng `sftp_source_files` không có file nào còn trên nguồn — hẹn giờ chưa chạy hoặc script tay `sftp-sync.js` không ghi bảng này); `true` = nguồn còn ít nhất một file của (BCVH, ngày); `false` = đã có thông tin nguồn nhưng không có file nào của (BCVH, ngày) (vd ngày chỉ có file sáng thì S/C đều `true`, còn đợt chiều là `NGUON_CHUA_CO_FILE`; UI so `dot` với `file_nguon` để báo «nguồn chỉ có 1 file»).
- `nghi_ngo` (mức NGÀY × BCVH): tổng `row_count` các file `OK`/`EMPTY` của (BCVH, `file_date`) so với TRUNG VỊ cùng BCVH, cùng thứ trong tuần, tối đa 4 tuần trước (chỉ các ngày CÓ file đã chấp nhận), cần ≥ 3 ngày mẫu: `IT` khi `< 0,5 × trung vị`, `NHIEU` khi `> 2,5 × trung vị` (đúng bằng ngưỡng KHÔNG nghi ngờ), `CHUA_DU_MAU` khi < 3 mẫu, `null` khi bình thường, khi trung vị = 0, khi ngày không có file đã chấp nhận. KHÔNG xét hôm nay hoặc tương lai; mọi ngày quá khứ (kể cả hôm qua) đều được xét — xem mục 6.

## 5. Hiệu năng và an toàn
- Lưới: 5 truy vấn tổng hợp (file DB của khoảng ngày; `sftp_source_files`; tên mã lạ ở `sftp_sync_files`; tổng dòng theo ngày kèm 28 ngày trước), rồi tính từng ô trong bộ nhớ. Đo trên DB giả (154.000 dòng `arrival_items`, 1.080 file): **lưới 62 ngày × 6 BCVH × 2 đợt (744 ô, JSON ≈ 359 KB) ≈ 13 ms trong lõi, ≈ 17 ms qua HTTP; một ô ≈ 1 ms**. Chưa đo trên DB thật.
- Chỉ ĐỌC: test so nội dung MỌI bảng trước / sau khi gọi (kể cả lỗi). Chuỗi lỗi (`error` của file, `chi_tiet`, `ghi_chu_loi`) đi qua `lamSach` (che `SFTP_PASSWORD` / `SFTP_USER` / `SFTP_HOST` nếu có trong môi trường, bỏ dãy ≥ 15 chữ số, cắt 300 ký tự). Không trả đường dẫn / thư mục / host / cổng / vân tay, nội dung file hay SHBG.

## 6. Điều tự quyết và giới hạn (cần PO biết)
- **Mã lạ lưu được**, nhưng chỉ ở hai nơi: `sftp_source_files` (khi HẸN GIỜ đã quét; chỉ file còn trên nguồn) và `sftp_sync_files` (`ma_loi = 'MA_LA'`, ghi bởi mọi lượt thật). Chạy khô hoặc chưa có lượt nào thì không biết. Không thêm bảng.
- **Người bấm «Tay»**: có từ 5f-2 (cột `nguoi_bam_ma` / `nguoi_bam_ten`); hàng cũ và lượt tự động → `nguoi: null`.
- **Giờ chạy kế tiếp** (`luot_ke_tiep_luc`): lấy từ bộ hẹn giờ trong tiến trình (`docTrangThaiSftp().luotKeTiep`), là giờ ƯỚC theo chu kỳ; null khi hẹn giờ tắt / chưa khởi động. Script `sftp-sync.js` (tiến trình khác) không ảnh hưởng con số này.
- Điều kiện «ngày hôm qua chỉ xét khi cả hai đợt đã có file hoặc giờ chiều đã qua» trong ticket luôn thỏa với mọi ngày quá khứ (giờ chiều của hôm qua đã qua) nên cài đặt = xét mọi ngày `< hôm nay`. Nếu PO muốn thêm điều kiện khác (vd chờ file sáng D+1) thì ghi lại.
- `so_dong` của một ngày = tổng `row_count` (số dòng đọc được, TRƯỚC khi lọc trùng) của file `OK`/`EMPTY`; phần chiều tối ngày D nằm ở file sáng D+1 nên có thể làm ngày D «ít» hơn thực tế — đó là lý do mẫu so cùng thứ trong tuần.
- Bảng `sftp_source_files` chỉ do hẹn giờ ghi (chế độ `BANG`); trước khi bật hẹn giờ, `nguon_co_file = null` và trạng thái 4 không bao giờ xảy ra.
- Hàng khóa «Thay thế» treo (tiến trình tắt giữa chừng) không hiện ở đâu trong API này (đã lọc); chỉ chặn đồng bộ tối đa 30 phút (`16_…` mục 9).
- Chưa làm (ngoài phạm vi): nút «Lấy lại» / «Lấy ngay» (5f-2), giao diện (5f-3), ghi người bấm.
