# 🔌 SANLUONG-5b — Công cụ thử kết nối SFTP CHỈ ĐỌC

> Bối cảnh và khuyến nghị: `11_SFTP_AUDIT.md`. Công cụ này **chưa** là một phần của máy chủ ứng dụng; chưa tải file, chưa nạp, **không mở DB**.
> Mục đích: PO kiểm tra (1) kết nối được NAS Synology qua SFTP không, (2) đọc được vân tay khoá máy chủ để ghim, (3) thấy đúng các thư mục `CSV_Report_<mã>` và file `HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv`.

## 1. Mã nguồn
| File | Vai trò |
|---|---|
| `scripts/sftp-probe.js` | Công cụ dòng lệnh. Chỉ gọi `connect`, `list`, `end` của `ssh2-sftp-client` (có test tĩnh chặn mọi lệnh ghi / xoá / tải: `put`, `get`, `delete`, `rename`, `mkdir`, `rmdir`, `chmod`, `append`, luồng đọc/ghi…) |
| `server/lib/sftpFiles.js` | Hàm thuần, không mạng: phân tích tên file, lọc thư mục, tóm tắt, quy tắc «file ổn định», vân tay, đọc cấu hình, phân loại lỗi. **SANLUONG-5c dùng lại** |
| `tests/sftp-probe.test.js` | 20 ca, dữ liệu giả, không mạng |

## 2. Biến môi trường (chỉ TÊN; giá trị đặt trong `.env` hoặc cửa sổ PowerShell)
| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `SFTP_HOST` | luôn | Địa chỉ NAS (IP hoặc tên) |
| `SFTP_PORT` | không | Cổng SFTP, mặc định 22 |
| `SFTP_USER`, `SFTP_PASSWORD` | chạy thường | Tài khoản SFTP (nên chỉ đọc). **Không dùng** với `--show-fingerprint` |
| `SFTP_DIRS` | chạy thường | Thư mục cần liệt kê, cách nhau dấu phẩy, ví dụ `/CSV_Report_533140,/CSV_Report_535470` |
| `SFTP_HOSTKEY_SHA256` | chạy thường | Vân tay khoá máy chủ để ghim: `SHA256:xxxx…` hoặc hex 64 ký tự. Chưa đặt → không chạy được (phải `--show-fingerprint` trước) |

Script tự nạp `.env` ở **thư mục đang đứng** (`process.loadEnvFile()`, như `server/index.js`); biến đã đặt trong cửa sổ PowerShell luôn thắng giá trị trong `.env`. Tên người dùng và mật khẩu **không bao giờ được in**; log chỉ có `host:port`, số thư mục và kết quả.

## 3. PO chạy từng bước (Windows PowerShell, Node 24)
**Bước A — lấy vân tay khoá máy chủ (không gửi tên đăng nhập / mật khẩu):**
```powershell
Set-Location D:\Dev\hue-dhcl
$env:SFTP_HOST = '<IP hoặc tên NAS>'
$env:SFTP_PORT = '22'
node scripts/sftp-probe.js --show-fingerprint
$LASTEXITCODE
```
Kết quả in vân tay dạng `SHA256:…` và hex. **Đối chiếu với người quản trị NAS** trước khi tin (lần đầu chưa có gì để so; đường mạng không an toàn có thể bị giả mạo).

**Bước B — liệt kê thư mục (có ghim vân tay):**
```powershell
$env:SFTP_HOSTKEY_SHA256 = 'SHA256:<dán vân tay từ bước A>'
$env:SFTP_USER = '<tên tài khoản SFTP>'
$sec = Read-Host 'Mật khẩu SFTP' -AsSecureString
$env:SFTP_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:SFTP_DIRS = '/CSV_Report_533140'
node scripts/sftp-probe.js
$LASTEXITCODE
```
Tuỳ chọn: `--gioi-han=N` (số file mới nhất in ra mỗi thư mục, mặc định 20, `0` = tất cả); `--on-dinh[=GIÂY]` (liệt kê lần hai sau N giây, mặc định 10, tối đa 120, báo file còn đổi kích thước / mtime — cho biết hệ thống nguồn ghi file xong chưa).

**Dọn mật khẩu khỏi cửa sổ khi xong:**
```powershell
Remove-Item Env:SFTP_PASSWORD, Env:SFTP_USER
```
(Hoặc đặt các biến vào `.env` ở thư mục repo — `.env` đã nằm trong `.gitignore`. Mật khẩu có ký tự đặc biệt nên đặt trong dấu nháy.)

## 4. Kết quả in ra, mỗi thư mục
Số file khớp mẫu; file mới nhất và cũ nhất **theo tên** (kèm kích thước, mtime theo giờ Asia/Bangkok); số file ≤ 3 KB (có thể chỉ có tiêu đề hoặc chỉ BOM); số mục bị bỏ qua theo lý do (`#recycle`, tên bắt đầu bằng `.`, không phải file thường, tên không khớp mẫu) kèm tối đa 5 tên ví dụ; cảnh báo nếu mã đơn vị trong tên file khác mã trong tên thư mục `CSV_Report_<mã>`, hoặc ngày/giờ trong tên không có thật.

## 5. Mã thoát
| Mã | Nghĩa | Thường do |
|---|---|---|
| 0 | Thành công (mọi thư mục liệt kê được) | — |
| 1 | Lỗi khác / không lường trước | xem dòng «chi tiết» |
| 2 | Thiếu / sai cấu hình hoặc tham số | thiếu biến, cổng sai, vân tay sai dạng, tuỳ chọn lạ; chưa ghim vân tay |
| 3 | Lỗi mạng | sai địa chỉ / cổng, tường lửa DSM, NAS tắt, quá 15 giây chờ kết nối |
| 4 | Xác thực thất bại | sai tên / mật khẩu, tài khoản chưa được cấp quyền SFTP |
| 5 | Vân tay khoá máy chủ không khớp | ngắt **trước** khi gửi mật khẩu; có thể NAS đổi khoá hoặc bị giả mạo |
| 6 | Thư mục không có / không đọc được | sai đường dẫn trong `SFTP_DIRS`, tài khoản không có quyền thư mục (các thư mục khác vẫn được liệt kê) |

## 6. Bảo đảm chỉ đọc / an toàn
- Vân tay đọc ở bước trao đổi khoá, **trước** xác thực: bước A cố ý từ chối khoá nên không bao giờ tới bước gửi tên / mật khẩu; bước B từ chối nếu vân tay khác giá trị ghim.
- Test tĩnh (`tests/sftp-probe.test.js`) kiểm script chỉ dùng `connect`/`list`/`end` và không `require` DB.
- Tên file liệt kê chỉ chứa mã đơn vị và ngày giờ, không phải số hiệu bưu gửi; không tải nội dung file nào.

## 7. Việc chưa làm (SANLUONG-5c trở đi)
Tải file, nạp bằng `importArrivalFile(source:'SFTP')`, bảng theo dõi lượt lấy, bộ hẹn giờ, chỉ báo trên Dashboard — xem `11_SFTP_AUDIT.md` mục 6.5.
