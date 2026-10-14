# 🔄 SANLUONG-5c — Lõi đồng bộ SFTP chạy TAY (quét → tải → nạp lần lượt)

> Bối cảnh: `11_SFTP_AUDIT.md`; thử kết nối: `12_SFTP_PROBE.md`. **Chưa hẹn giờ** (5e), **chưa có giao diện** (5f), **chưa nạp lịch sử dài ngày** (5d).
> PO đã thử 5b với NAS thật (cổng 5454, vân tay ghim, tài khoản chỉ đọc, `/CSV_Report_<mã>` dùng nguyên). Bản 5c này **chưa được chạy với NAS thật** (người viết không có mạng tới NAS).

## 1. Quy tắc PO
Quét và nạp **lần lượt**; file nào **chưa nạp** thì nạp; file **đã nạp** thì bỏ qua. Lần chạy đầu không nạp ồ ạt: mặc định chỉ lấy file có ngày trong tên ≥ hôm nay − 3 ngày (giờ Bangkok), tối đa 5 file mỗi lượt.

## 2. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/sftpSync.js` | `syncSftpOnce({ client, db, dirs, now, sleep, tmpDir, options })`, lược đồ `ensureSftpSyncSchema`, `docThamSoSync`, `docCauHinhSync`, `kiemTraTenTep`, `maThoat`. **Không** nạp thư viện SFTP; `client` được tiêm vào (chỉ `list`, `get`) |
| `scripts/sftp-sync.js` | Chạy tay. Nạp `ssh2-sftp-client`, kiểm vân tay, mở DB, gọi `syncSftpOnce`. **Chỗ duy nhất mở DB** (như `scripts/import-arrivals.js`: `better-sqlite3` trực tiếp, `ARRIVALS_DB` hoặc `data/hue-dhcl.db`; chạy khô mở **chỉ-đọc**) |
| `server/lib/sftpFiles.js` | (từ 5b) phân tích tên, lọc, `fileOnDinh`, vân tay, cấu hình; 5c thêm `maTuTenThuMuc` |
| `server/db.js` | gọi `ensureSftpSyncSchema` khi khởi động server (tạo hai bảng mới, idempotent, không đụng bảng cũ). `scripts/sftp-sync.js --chay-that` **cũng tự gọi** hàm này sau khi mở DB ghi (`scripts/sftp-sync.js:52-53`), nên không cần khởi động lại server trước; chạy khô (DB chỉ-đọc) không tạo gì |
| `tests/sftp-sync.test.js` | 26 ca, `client` giả, DB tạm của harness, không mạng |

## 3. Luồng một lượt
1. (Chạy thật) Khoá: không bắt đầu nếu có lượt `finished_at IS NULL` bắt đầu cách đây < 30 phút (mã thoát 7); lượt cũ hơn 30 phút coi là treo, được đóng kèm ghi chú rồi cho chạy. Lượt kết thúc **luôn** được đặt `finished_at`, kể cả khi lỗi.
2. Liệt kê lần 1 từng thư mục trong `SFTP_DIRS` → chờ `SFTP_STABLE_SECONDS` (60 giây) → liệt kê lần 2. Thư mục lỗi (không có / mạng) được ghi lại, **không** dừng thư mục khác.
3. Với mỗi mục, theo thứ tự:
   1. Chỉ tên khớp `^HangDen_(\d+)_(\d{8})_(\d{6})\.csv$` và là file thường. Bỏ qua `DuBao_*`, `#recycle`, tên bắt đầu `.`, tên lạ (chỉ đếm vào «bỏ qua»).
   2. Ngày trong tên < «từ ngày» → chỉ đếm, không ghi từng file.
   3. Mã trong tên ≠ mã trong tên thư mục `CSV_Report_<mã>` → `BO_QUA` (`KHAC_MA_THU_MUC`), không nạp. Ngày/giờ trong tên không có thật → `BO_QUA` (`NGAY_KHONG_HOP_LE`).
   4. **Đã nạp** (tên có trong bảng `arrival_import_files` với `status` `OK` hoặc `EMPTY`) → `DA_CO`, **không tải**.
   5. Không ổn định (kích thước hoặc mtime khác giữa hai lần liệt kê, hoặc chỉ xuất hiện ở lần 2) → `CHUA_ON_DINH`, để lần sau. Không so mtime với đồng hồ máy.
   6. Kích thước ≤ 3 byte (chỉ BOM / rỗng): **không còn bỏ qua**. Sau khi qua kiểm tra ổn định (mục 5) vẫn **tải** (rất nhẹ) và đưa cho importer để nó ghi đợt `EMPTY` vào `arrival_import_files` → `ket_qua = EMPTY` (`so_dong` 0); lượt sau thấy tên đã có → `DA_CO`. Nhờ vậy ngày có file chiều chỉ-BOM vẫn đủ «2 file/ngày», `getMissingBatches` không báo thiếu đợt.
   7. Importer đã `REJECTED`/`CONFLICT` file cùng tên **và cùng kích thước** (không phải «Lỗi hệ thống») → `BO_QUA` (`DA_TU_CHOI`), không tải lại; lỗi hệ thống tạm thời thì thử lại.
4. Các file còn lại sắp **tên tăng dần (cũ trước)**; chỉ lấy `--toi-da` file đầu (mặc định 5), phần dư `BO_QUA` (`VUOT_TOI_DA`).
5. Từng file: tải về `os.tmpdir()/hue-dhcl-sftp-<ngẫu nhiên>/<tên gốc>` (tên được kiểm chặt: không `/`, `\`, `..`, NUL, phải khớp mẫu) → so kích thước tải về với danh sách (lệch → `LOI` `KICH_THUOC_LECH`) → `importArrivalFile(db, tệp, { source: 'SFTP' })` → ghi `sftp_sync_files` → xoá tệp. Lỗi một file **không** dừng các file còn lại. Thư mục tạm luôn bị xoá (`finally`).
6. Ghi tổng kết lượt vào `sftp_sync_runs`.

## 4. PO chạy từng bước (PowerShell)
Biến môi trường giống 5b (xem `12_SFTP_PROBE.md`; cổng của NAS là `SFTP_PORT=5454`). Thêm, nếu muốn đổi mặc định: `SFTP_SYNC_DAYS`, `SFTP_STABLE_SECONDS`.
```powershell
Set-Location D:\Dev\hue-dhcl
$env:SFTP_HOST = '<IP hoặc tên NAS>'
$env:SFTP_PORT = '5454'
$env:SFTP_HOSTKEY_SHA256 = 'SHA256:<vân tay đã ghim ở 5b>'
$env:SFTP_USER = '<tài khoản chỉ đọc>'
$sec = Read-Host 'Mật khẩu SFTP' -AsSecureString
$env:SFTP_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:SFTP_DIRS = '/CSV_Report_533140'
```
**Bước 1 — CHẠY KHÔ** (mặc định; không tải, không nạp, DB mở chỉ-đọc, không ghi gì):
```powershell
node scripts/sftp-sync.js
$LASTEXITCODE
```
In từng file với kết quả `WOULD_IMPORT` (sẽ nạp), `DA_CO`, `CHUA_ON_DINH`, `EMPTY`, `BO_QUA`… Chờ 60 giây giữa hai lần liệt kê.

**Bước 2 — nạp thử MỘT file** (nên **sao lưu `data\hue-dhcl.db` trước**; máy chủ app có thể vẫn chạy):
```powershell
node scripts/sftp-sync.js --chay-that --toi-da=1
$LASTEXITCODE
```
Kiểm tra: Dashboard / màn Sản lượng đến thấy dữ liệu; `ngày thiếu đợt` (ADMIN) không tăng sai.

**Bước 3 — nạp tiếp** (mỗi lần tối đa 5 file nếu không đặt `--toi-da`):
```powershell
node scripts/sftp-sync.js --chay-that
```
Tuỳ chọn: `--tu-ngay=yyyymmdd` (ghi đè «từ ngày»), `--toi-da=N`, `--on-dinh=GIÂY` (0–600). Chạy lại nhiều lần là an toàn: file đã nạp được bỏ qua (`DA_CO`).

**Xem lịch sử lượt lấy** (bảng mới, chưa có giao diện): `sftp_sync_runs`, `sftp_sync_files`. Dọn mật khẩu khi xong: `Remove-Item Env:SFTP_PASSWORD, Env:SFTP_USER`.

## 5. Mã thoát
| Mã | Nghĩa |
|---|---|
| 0 | Thành công (kể cả không có gì để nạp) |
| 1 | Có file lỗi (`LOI`: importer từ chối, tải lỗi, lệch kích thước…) hoặc lỗi lượt |
| 2 | Cấu hình / tham số / DB sai (thiếu biến, chưa ghim vân tay, không thấy DB) |
| 3 | Mạng |
| 4 | Xác thực |
| 5 | Vân tay máy chủ không khớp (ngắt trước khi gửi mật khẩu) |
| 6 | Thư mục không có / không đọc được |
| 7 | Đang có lượt khác chạy (khoá 30 phút) |

## 6. Bảng kết quả
`sftp_sync_files.ket_qua`:
| Kết quả | Nghĩa |
|---|---|
| `DA_NAP` | Đã tải và nạp (importer trả `OK`); `so_dong` = số dòng, `thoi_gian_ms` = tải + nạp |
| `DA_CO` | Tên đã có trong lịch sử nạp (`OK`/`EMPTY`) — không tải. `ma_loi = KICH_THUOC_KHAC_BAN_DA_NAP` nếu kích thước trên SFTP khác bản đã nạp (nguồn có thể đã ghi đè; **không** nạp đè) |
| `CHUA_ON_DINH` | Còn thay đổi giữa hai lần liệt kê hoặc mới xuất hiện — lần sau |
| `EMPTY` | Importer ghi nhận đợt rỗng: file ≤ 3 byte (chỉ BOM / 0 byte) hoặc chỉ có tiêu đề. File đã được tải; lượt sau là `DA_CO`. Chạy khô báo `WOULD_IMPORT` cho file như vậy |
| `LOI` | Tải / nạp lỗi; `ma_loi` ngắn (`REJECTED`, `KICH_THUOC_LECH`, `ECONNRESET`…), `chi_tiet` đã che bí mật và số dài |
| `BO_QUA` | Có lý do: `KHAC_MA_THU_MUC`, `NGAY_KHONG_HOP_LE`, `DA_TU_CHOI`, `VUOT_TOI_DA` |
| `WOULD_IMPORT` | Chỉ ở chạy khô: sẽ tải và nạp |

`sftp_sync_runs`: `started_at`/`finished_at` (UTC ISO), `trigger` (`MANUAL`; `TIMER` dành cho 5e), `dry_run` (luôn 0 ở 5c), `tong_liet_ke`, `da_nap`, `da_co`, `chua_on_dinh`, `rong`, `bo_qua_khac`, `loi`, `ghi_chu_loi`.

## 7. Điều đã quyết trong 5c (để PO duyệt)
- **Chạy khô không ghi gì vào DB** (chặt hơn ticket cho phép): không có dòng `sftp_sync_runs`; DB mở chỉ-đọc. Cột `dry_run` còn đó nhưng chưa dùng.
- **Ổn định kiểm trước khi xét file nhỏ**: file 0–3 byte đang được ghi dở báo `CHUA_ON_DINH`, không tải; chỉ khi ổn định mới đưa cho importer.
- **`DA_TU_CHOI`** (không có trong ticket): tránh tải lại mỗi lượt file importer đã từ chối nếu kích thước không đổi.
- **`KHAC_MA_THU_MUC`, `NGAY_KHONG_HOP_LE`** là `BO_QUA` (không nạp).
- **Thêm** cột `chi_tiet` ở `sftp_sync_files`.
- Cổng thoát khi hai thư mục lỗi khác loại: lấy mã của thư mục lỗi **đầu tiên**.

## 8. Điều chưa chắc
- **Đã sửa (theo PO, trước khi commit 5c)**: file ≤ 3 byte được tải và đưa cho importer ghi `EMPTY` (trước đó bị bỏ qua không tải nên `getMissingBatches` sẽ báo thiếu đợt). Điều kiện «đã nạp» giữ nguyên: `arrival_import_files`, `status` `OK` hoặc `EMPTY`. Điều chưa chắc còn lại: file 0 byte đang được nguồn tạo nhưng chưa ghi xong mà đứng yên suốt `SFTP_STABLE_SECONDS` sẽ bị ghi `EMPTY` và không bao giờ được nạp lại (lượt sau chỉ thấy `DA_CO` kèm cảnh báo `KICH_THUOC_KHAC_BAN_DA_NAP`, không nạp đè); hiếm, nhưng tăng `SFTP_STABLE_SECONDS` giảm rủi ro.
- **Nguồn ghi đè file cùng tên**: chỉ phát hiện được qua khác kích thước (`KICH_THUOC_KHAC_BAN_DA_NAP`); nội dung khác mà cùng kích thước thì không biết (không tải để so). **Không** nạp đè (importer cũng chỉ ghi `CONFLICT`, và 5c bỏ qua file đã có theo tên trước khi tải).
- **Thời gian nạp một file** (đo bằng dữ liệu giả trên DB tạm, bảng gần rỗng): file 2.300 dòng (~444 KB) ≈ 60–80 ms, 1.100 dòng ≈ 50 ms, gồm đọc + phân tích CSV; phần ghi DB là một giao dịch đồng bộ. Trên DB thật có ~1 triệu dòng, 11 chỉ mục có thể chậm hơn (**chưa đo**). Vì script chạy **ngoài** tiến trình máy chủ web, người dùng web không bị chặn; chỉ có thể phải chờ khoá ghi SQLite vài chục ms (script đặt `busy_timeout` 30 giây). Importer sẽ chặn tiến trình **bên trong** máy chủ ở 5e, nên 5e cần đo lại.
- Giờ trong tên file lệch giờ ghi xong ~20–40 giây (PO) nên 60 giây chờ có thể vừa sát; nếu thấy file bị tải khi còn ghi dở, tăng `SFTP_STABLE_SECONDS`. Nguồn có ghi nguyên tử hay không: chưa biết.
- Giao diện `ssh2-sftp-client.get(đường-dẫn-xa, đường-dẫn-cục-bộ)` ghi trực tiếp vào tệp đích; chưa thử với NAS thật.
- Lần chạy thật đầu tiên trên DB thật cần sao lưu trước.
