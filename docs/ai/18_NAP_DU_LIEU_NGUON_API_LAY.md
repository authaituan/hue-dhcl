# 📥 SANLUONG-5f-2 — API GHI «Lấy ngay» và «Lấy lại» (chỉ ADMIN, có ghi người bấm)

> Bối cảnh: `17_NAP_DU_LIEU_NGUON_API_DOC.md` (API đọc 5f-1), `13_SFTP_SYNC.md`, `15_SFTP_SCHEDULER.md`, `16_THAY_THE_NGAY_THUC_HIEN.md`. Quyết định: `04_DECISIONS.md` #86.
> Nguồn SFTP chỉ ĐỌC (list / get / end). Không xóa / sửa dữ liệu đã nạp (chỉ THÊM qua importer có sẵn). Chưa chạy với NAS / DB thật. Giao diện là 5f-3.

## 1. Khảo sát Bước 0 (bằng chứng)
1. **Lõi chạy một lượt**: `syncSftpOnce({ client, db, dirs, now, sleep, tmpDir, options })` — `server/lib/sftpSync.js:200`. KHÔNG nhận danh sách file: tự liệt kê `dirs` (hai lần cách `onDinhGiay` giây, hoặc một lần + bảng `sftp_source_files` khi `oDinh: 'BANG'`), lọc cửa sổ ngày (`f.ngay < tuNgay` → bỏ, dòng ~293). Khoá: `batDauLuot(db, now, trigger)` (`:168`, không xuất ra) = `db.transaction().immediate()`: nếu `luotDangChay` (hàng chưa `finished_at`, < `KHOA_PHUT` = 30 phút) thì từ chối, đóng hàng treo, `INSERT INTO sftp_sync_runs (started_at, "trigger")`; cuối hàm `UPDATE sftp_sync_runs SET finished_at, các bộ đếm`. Ghi từng file vào `sftp_sync_files` (cột `ket_qua` có CHECK: `DA_NAP, DA_CO, CHUA_ON_DINH, EMPTY, LOI, BO_QUA, WOULD_IMPORT`). Hẹn giờ gọi với `trigger: 'TIMER', oDinh: 'BANG'` (`sftpScheduler.js` ~151); script tay `scripts/sftp-sync.js` gọi với `MANUAL` + `oDinh` mặc định `HAI_LAN`.
2. **Lấy lại file đã có bản ghi `REJECTED` / `EMPTY` / `CONFLICT`** (`arrivalsImport.ghiFileDaChuanBi`, ~`:444`): chỉ coi là «đã xử lý» khi có bản ghi **`OK` hoặc `EMPTY`** cùng tên (`accepted`). (a) `OK`, cùng sha → `alreadyImported` (không làm gì); khác sha → `CONFLICT`. (b) **`EMPTY`**, cùng sha → `alreadyImported`; **khác sha (nguồn nay có nội dung) → `CONFLICT`, KHÔNG nạp được**. (c) `REJECTED` / `CONFLICT` không phải «accepted» nên importer **xử lý lại bình thường**: cùng sha → `recordFile ... ON CONFLICT(file_name, sha256) DO UPDATE` đổi bản ghi thành `OK` nếu lần này đọc được; khác sha → thêm bản ghi mới, bản `REJECTED` cũ giữ làm lịch sử. NHƯNG lõi đồng bộ có hai chốt riêng chặn thử lại: `daNapStmt` (OK/EMPTY cùng tên → `DA_CO`) và `tuChoiStmt` (REJECTED/CONFLICT cùng tên **và cùng kích thước** → `BO_QUA` `DA_TU_CHOI`, «không thử lại», `:307`). **Kết luận**: ô `LOI` lấy lại được nếu bỏ chốt `DA_TU_CHOI` — nên «Lấy lại» có vòng lặp RIÊNG (gọi thẳng importer) chứ không đi qua `syncSftpOnce`; **không cần đổi importer**. Ô `RONG` mà nguồn nay có nội dung khác thì KHÔNG lấy lại được nếu không đổi importer hoặc xóa / ghi đè bản ghi `EMPTY` → trả `KHONG_THE_LAY_LAI` (mục 5), **phương án (chưa làm, cần PO duyệt)**: thêm tuỳ chọn cho `ghiFileDaChuanBi` thay bản ghi `EMPTY` cùng tên khi sha khác (một giao dịch, giữ bản cũ trong thùng rác), hoặc dùng «Thay thế ngày» cho ngày đó.
3. **Ổn định / cửa sổ ngày**: hàm thuần `sftpFiles.fileOnDinh(lan1, lan2)` (so hai lần liệt kê) và `tuNgay` tính trong `syncSftpOnce` (`:208`, `soNgay` từ `SFTP_SYNC_DAYS`) — tách được. «Lấy lại» dùng `fileOnDinh` (hai lần liệt kê cách `SFTP_STABLE_SECONDS`) và bỏ cửa sổ ngày; «Lấy ngay» dùng `syncSftpOnce` nguyên vẹn (cửa sổ + ổn định).
4. **Người dùng**: bảng `users` cột `hrm_code` (mã nhân sự), `full_name` (họ tên) (`server/db.js`). Token mang `hrm_code`, `full_name`, `id`; `req.user = { ...claims, role }` (`server/auth.js:122`). Lõi lấy từ bảng `users` theo `id` (họ tên tại thời điểm bấm), dự phòng claim token.
5. **Chạy nền**: tiền lệ là hẹn giờ (`sftpScheduler.chayNgay`: `motLuot().catch(...).then(...)`, không bao giờ ném). «Lấy ngay / Lấy lại» làm tương tự: giữ khoá + tạo hàng lượt ĐỒNG BỘ trong handler → trả 202 → tác vụ nền `chayNen` bắt mọi lỗi, `finally` đóng hàng lượt (xem mục 4). Server tắt giữa chừng: hàng lượt tự hết hạn sau 30 phút (lưới an toàn có sẵn).

## 2. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/napNguonLay.js` | `layNgay`, `layLai`, `giuKhoa`, `dongHang`, `ensureLuotSchema`, `doiHetNen`, `datTuyChon` (test), lớp lỗi `LayLoi` |
| `server/routes/napNguon.js` | thêm `POST /api/nap-nguon/lay-ngay`, `POST /api/nap-nguon/lay-lai` (`requireAdmin`; ghi `SECURITY_LOG` `nap_nguon_lay_ngay` / `nap_nguon_lay_lai`: ai, kết quả, `luot_id`, số ô — không bí mật) |
| `server/lib/sftpSync.js` | **chỉ thêm** `options.luotCoSan` (id hàng lượt đã giữ sẵn: bỏ bước giành khoá, ghi kết quả vào hàng đó rồi đóng). Không truyền thì hành vi y nguyên |
| `server/lib/sftpScheduler.js` | **chỉ thêm** `bo.tamDungNgoai` và `tamDungHenGio(lyDo, chiTiet)` (đưa hẹn giờ về `TAM_DUNG` từ bên ngoài) |
| `server/lib/napNguonDoc.js` (5f-1) | `nguoi` `{ma, ten}` \| null, `loai`, `so_o_yeu_cau` ở mọi hình lượt; `luot_gan_nhat` và `dang_chay` thêm `loai`, `nguoi` (`dang_chay` thêm `cach_chay`) |
| `server/config/nap-nguon.js` | `SO_FILE_TOI_DA_LAY_NGAY = 20`, `SO_O_TOI_DA_LAY_LAI = 20` |
| `server/db.js` | gọi `ensureLuotSchema` |
| `tests/nap-nguon-lay.test.js` (18 ca) | + cập nhật `tests/nap-nguon-doc.test.js`, `tests/sftp-sync.test.js` (xem mục 7) |

## 3. Cột mới của `sftp_sync_runs` (chỉ `ALTER TABLE ADD COLUMN`, idempotent, hàng cũ NULL; theo mẫu `ensureThayTheSchema`)
`loai` (`'LAY_NGAY' | 'LAY_LAI'`, CHECK; NULL = hẹn giờ / script cũ), `nguoi_bam_ma`, `nguoi_bam_ten` (họ tên tại thời điểm bấm), `so_o_yeu_cau` (INTEGER). Giờ bấm = `started_at` (UTC). Không lưu IP, token hay bí mật. Test: chạy hai lần không lỗi; DB cũ (không có cột) nâng cấp được, hàng cũ NULL, `trigger` giữ nguyên.

## 4. API
Cả hai: chỉ ADMIN (401 không token; 403 TTVH, GDVH, STAFF, TIVI). Thứ tự kiểm: thân → cấu hình → hẹn giờ → khoá. Lỗi là JSON `{ error, ma, … }`.
| Mã | HTTP | Khi nào |
|---|---|---|
| (thành công) | **202** | `{ luot_id, bat_dau }`; `lay-lai` kèm `o: [{ bcvh, ngay, dot, da_co_nhap_tay }]` (đã loại trùng). Việc nạp chạy NỀN |
| `THAM_SO_SAI` | 400 | thân sai / trường lạ / quá số ô / bcvh, dot, ngày sai / ngày tương lai |
| `DANG_CHAY` | 409 | có lượt chưa kết thúc (< 30 phút): hẹn giờ, tay, hoặc hàng khoá «Thay thế ngày». Kèm `luot_id` nếu là lượt thật; với hàng khoá «Thay thế» **không** có `luot_id` và không lộ nội dung |
| `TAM_DUNG` | 409 | hẹn giờ đang tạm dừng vì lỗi xác thực / vân tay sai (kèm `ly_do` `XAC_THUC` \| `VAN_TAY`): **không kết nối nguồn** (tránh NAS chặn IP) |
| `CHUA_CAU_HINH` | 503 | thiếu / sai `SFTP_*` (chỉ nêu TÊN biến) |
- **`POST /api/nap-nguon/lay-ngay`** (thân `{}`; trường lạ → 400): một lượt `syncSftpOnce` như hẹn giờ (`oDinh: 'HAI_LAN'` — hai lần liệt kê cách `SFTP_STABLE_SECONDS`, nên mất khoảng 1–2 phút; cửa sổ `SFTP_SYNC_DAYS`), **tối đa 20 file**, cũ trước (phần còn lại `BO_QUA` `VUOT_TOI_DA`), file đã nạp bỏ qua. Hàng lượt: `trigger = MANUAL`, `loai = LAY_NGAY`.
- **`POST /api/nap-nguon/lay-lai`** (thân `{ "o": [ { "bcvh", "ngay", "dot": "S"|"C" } ] }`): 1–20 ô; ô trùng bị loại trùng (giữ lần đầu); không giới hạn ngày về trước, ngày không ở tương lai. Một lượt (`loai = LAY_LAI`, `so_o_yeu_cau`). Với mỗi ô, theo thứ tự ngày tăng dần (S trước C): tìm file đúng (BCVH, `file_date`, đợt) trên nguồn; `da_co_nhap_tay` = ngày đó đã có file `MANUAL` đã chấp nhận (UI cảnh báo «nạp bổ sung, không xóa gì»).
- **Hẹn giờ không bị ảnh hưởng**: lượt tay giữ khoá nên hẹn giờ bỏ qua lượt (`BI_KHOA_DB`).

### Kết quả từng ô / file của `lay-lai` (ghi vào `sftp_sync_files`; cột `ket_qua` có CHECK nên ánh xạ về giá trị cho phép — KHÔNG thêm cột)
| Kết quả logic | `ket_qua` | `ma_loi` | Ghi chú |
|---|---|---|---|
| `DA_NAP` | `DA_NAP` | — | importer ghi `OK` |
| `DA_CO` | `DA_CO` | — | đã có bản `OK` cùng tên (hoặc bản ghi rỗng cùng kích thước): không nạp đè, importer không chạy |
| `NGUON_KHONG_CO` | `BO_QUA` | `NGUON_KHONG_CO` | nguồn không có file của ô; `ten_file` = tên đại diện `HangDen_<mã>_<yyyymmdd>_<S\|C>` (không khớp mẫu nên không hiện trong lịch sử ô của 5f-1; hiện ở `/luot/:id`) |
| `CHUA_ON_DINH` | `CHUA_ON_DINH` | — | kích thước / mtime đổi giữa hai lần liệt kê |
| `LOI` | `LOI` | `REJECTED` \| `CONFLICT` \| mã lỗi tải (vd `KICH_THUOC_LECH`, `ECONNRESET`) | một ô lỗi không chặn ô khác |
| `RONG` | `EMPTY` | — | importer ghi bản ghi rỗng |
| `KHONG_THE_LAY_LAI` | `BO_QUA` | `KHONG_THE_LAY_LAI` | `chi_tiet` bắt đầu bằng mã lý do `DA_GHI_RONG_KHAC_NOI_DUNG` (xem Bước 0 câu 2) |
Bộ đếm của hàng lượt: `tong_liet_ke` (mục liệt kê lần 2), `da_nap`, `da_co`, `chua_on_dinh`, `rong`, `bo_qua_khac` (NGUON_KHONG_CO, KHONG_THE_LAY_LAI), `loi` (số ô/file lỗi + thư mục lỗi).

## 5. An toàn và lỗi
- **Một lượt tại một thời điểm**: khoá = hàng chưa đóng trong `sftp_sync_runs`, tạo trong MỘT giao dịch `IMMEDIATE` ngay trong handler (trước khi trả 202) nên hai yêu cầu đồng thời → đúng một 202, còn lại 409 (có test). Cùng khoá với hẹn giờ, script tay và «Thay thế ngày».
- **Nhả khoá**: `chayNen` bắt mọi lỗi; `finally` luôn `dongHang` (đặt `finished_at`, chỉ khi còn mở). Lỗi bất ngờ ghi `ghi_chu_loi` đã `lamSach` + `loi + 1`. Test: lõi ném, importer ném, liệt kê ném, tải ném — lượt luôn đóng, yêu cầu sau vẫn 202, tệp tạm sạch, `client.end()` luôn gọi.
- **Lỗi xác thực / vân tay sai** (lúc nối hoặc lúc liệt kê): dừng NGAY (không thử lại), đóng hàng lượt với `loi = 1`, và **đưa hẹn giờ về `TAM_DUNG`** đúng lý do (`tamDungHenGio`) giống lượt tự động; sau đó yêu cầu tay trả 409 `TAM_DUNG`. (Script `sftp-sync.js` chạy ở tiến trình khác nên không làm được việc này — không đổi.) Chỉ có tác dụng khi hẹn giờ của máy chủ đang bật.
- **Bí mật**: mọi chuỗi lỗi đi qua `lamSach` + `bimat` (mật khẩu, tài khoản); không trả host / cổng / vân tay / thư mục nguồn; không nội dung file, không SHBG; test đặt `SFTP_*` giả rồi quét phản hồi, bản ghi lượt, `SECURITY_LOG`.
- **Không đổi dữ liệu đã nạp**: chỉ INSERT qua importer; test so `arrival_items` / `arrival_import_files` có trước = sau (chỉ thêm).

## 6. Điều tự quyết và chưa chắc
- «Lấy ngay» dùng `HAI_LAN` (chờ `SFTP_STABLE_SECONDS`, mặc định 60 giây) chứ không `BANG` như hẹn giờ: `BANG` cần ≥ 2 lượt cách nhau mới coi file ổn định nên «Lấy ngay» vừa thấy file mới sẽ không bao giờ nạp được; khớp lời canvas «có thể mất 1–2 phút».
- «Lấy lại» có vòng lặp riêng nên **bỏ chốt `DA_TU_CHOI`** (cố ý, để ô `LOI` thử lại được); mỗi ô `LOI` lấy lại cùng file chưa sửa sẽ lại `REJECTED` (cập nhật bản ghi `REJECTED` cùng sha — đường nạp có sẵn).
- Ô trùng trong thân → loại trùng (không 400).
- `da_co_nhap_tay` chỉ xét file `MANUAL` đã chấp nhận (`OK`/`EMPTY`) của (BCVH, ngày).
- Kết quả từng ô chỉ đọc được SAU khi lượt xong, qua `/api/nap-nguon/luot/:id` (202 chỉ trả cờ). Nguyên nhân ô không lấy lại được nằm ở `ma_loi` / `chi_tiet`.
- Tiến trình máy chủ tắt giữa lúc đang lấy: hàng lượt mở tối đa 30 phút rồi tự đóng (chặn lượt khác trong thời gian đó). Chưa có hủy giữa chừng.
- Chưa chạy với NAS thật; thời gian «Lấy ngay» thật (2 lần liệt kê + tối đa 20 file) chưa đo.
