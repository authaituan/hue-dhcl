# 🔍 SANLUONG-5g-2 — Xem trước «Thay thế ngày của một BCVH» (CHỈ ĐỌC)

> Bối cảnh: `14_XOA_DU_LIEU_NGAY_AUDIT.md` (khảo sát), `04_DECISIONS.md` #81 (importer đã tách), #82 (quyết định của ticket này).
> **Chỉ tính và trả về bản xem trước.** Không xóa, không nạp, không ghi DB, không ghi lên nguồn SFTP. Việc thay thật là ticket 5g-3 (tải lại, **kiểm lại mã băm**, xóa + nạp trong một giao dịch). Chưa chạy với NAS thật.

## 1. Quy tắc (PO chốt 14/10/2026)
- **«Ngày» = ngày trong TÊN FILE (`file_date`)**, không phải ngày trong nội dung. Thay (BCVH X, ngày D) sẽ xóa dòng `arrival_items` và bản ghi `arrival_import_files` của MỌI file có `unit_code = X` và `file_date = D` (mọi trạng thái, kể cả `REJECTED`/`CONFLICT`, file nhập tay `_235959`). Phần chiều tối ngày D nằm ở file sáng D+1 thì giữ nguyên.
- **Tập file thay**: mọi file `HangDen_<X>_<yyyymmdd(D)>_<hhmmss>.csv` đang có trên nguồn; mặc định chọn hết, người dùng bỏ tích file không muốn dùng; hệ thống KHÔNG tự đoán file «chuẩn».
- **Mất SHBG**: nếu file mới thiếu SHBG so với dữ liệu cũ thì khoá mặc định (mở khóa ở 5g-3/5g-4: tích đồng ý + gõ lại mã BCVH và ngày). Báo ĐỎ khi tỷ lệ mất > 5 % (`NGUONG_MAT_SHBG_DO = 0.05`, TẠM, `server/config/thay-the.js`).
- Chỉ ADMIN.

## 2. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/thayTheXemTruoc.js` | `xemTruocThayThe({ client \| ketNoi, dirs, db, bcvh, ngay, tapFile, tmpDir, now, bimat, options })`, `kiemTraDauVao`, `kiemTraKhoa`, `loiNguon`, lớp lỗi `XemTruocLoi` (mã + HTTP). **Không** nạp thư viện SFTP, không có câu lệnh ghi (test tĩnh kiểm cả chú thích) |
| `server/config/thay-the.js` | `NGUONG_MAT_SHBG_DO = 0.05`, `SO_SHBG_MAU = 20` (TẠM, PO chốt 14/10/2026) |
| `server/routes/arrivals.js` | **`POST /api/arrivals/thay-the/xem-truoc`** (chỉ ADMIN) — nơi nạp lớp kết nối SFTP (`sftpConnect.js`, nạp lười) |
| `scripts/thay-the-xem-truoc.js` | Chạy tay, **mở DB chỉ-đọc** (`readonly: true`; `ARRIVALS_DB` hoặc `data/hue-dhcl.db`) |
| `tests/thay-the-xem-truoc.test.js` | 26 ca |
Dùng lại: `chuanBiFile` (5g-1, không `db`), `sftpFiles.locMuc`, `sftpSync.kiemTraTenTep/luotDangChay/lamSach`, `sftpConnect.ketNoiSftp`, `userBcvh.VALID_BCVH_CODES`.

## 3. Luồng
1. Kiểm đầu vào: `bcvh` ∈ 6 BCVH; `ngay` dạng `YYYY-MM-DD` là ngày thật; `tap_file` là mảng tên (tối đa 200). Sai → `THAM_SO_SAI` (400).
2. Khoá (chỉ ĐỌC, không ghi gì để giữ): lượt đồng bộ đang chạy (khoá DB `sftp_sync_runs` chưa `finished_at` < 30 phút, hoặc hẹn giờ ở trạng thái `DANG_CHAY`) → `DANG_CO_LUOT_DONG_BO` (409); đang có bản xem trước khác (cờ trong bộ nhớ) → `DANG_XEM_TRUOC` (409).
3. Phía DB: tập file của (X, D) mọi trạng thái (`id`, `file_name`, `source`, `status`, `row_count`, số dòng thực), tổng dòng, dòng `arrival_date` rỗng, SHBG khác nhau (chuẩn hóa `trim().toUpperCase()`), phân bố SHBG theo `arrival_date`.
4. Phía nguồn: liệt kê các thư mục `SFTP_DIRS`, giữ tên khớp mẫu **đúng mã và đúng ngày**; bỏ `DuBao_*`, `#recycle`, tên lạ, khác mã, khác ngày (đếm vào `nguon.bo_qua`). File ≤ 3 byte → `RONG`, không tải. Các file được chọn: tải về `os.tmpdir()/hue-dhcl-xemtruoc-*/<tên gốc>` → so kích thước → `chuanBiFile` (không `db`) → xóa tệp (kể cả khi lỗi). Kết luận mỗi file: `READY` / `EMPTY_FILE` / `REJECTED` (+ lý do) / `RONG` / `KHONG_CHON`.
5. So sánh (chỉ file chọn + `READY`): dòng mới sau lọc trùng theo CÙNG khóa duy nhất của importer `(tracking_no, bd10_no, bd8_no, item_confirmed_at)`; dòng mới trùng dữ liệu CÒN LẠI (file ngoài tập, vd file sáng ngày kế tiếp) cũng được đếm (importer sẽ bỏ qua); SHBG cũ / mới / chung / chỉ ở cũ / chỉ ở mới; `ty_le_mat = chỉ_ở_cũ / cũ` (0 khi cũ = 0); bảng `theo_ngay_den`; tối đa 20 SHBG mẫu chỉ ở cũ.
6. Mức cảnh báo: `AN_TOAN` (mất 0), `CAN_XAC_NHAN` (0 < mất ≤ 5 %, **đúng 5 % vẫn là CAN_XAC_NHAN** — so sánh số nguyên), `DO` (> 5 %). `khoa_mac_dinh = mất > 0`. `khong_the_thay = true` khi không có file `READY` (`KHONG_CO_FILE_HOP_LE`) hoặc không có dữ liệu cả ở DB lẫn nguồn (`KHONG_CO_DU_LIEU`).
7. Trạng thái phát: bảng **`phat_status_current`**, cột **`bcvh`, `shbg`** (khóa chính `(bcvh, shbg)`, SHBG đã chuẩn hóa viết hoa, không FK) — đếm SHBG của BCVH có trạng thái trong tập SẼ bị xóa, trong đó còn có ở bản mới / không còn. Chỉ đếm, không sửa.
8. Luôn gọi `client.end()` (kể cả khi lỗi), luôn xóa tệp tạm. Không thử lại khi lỗi nguồn.

## 4. Mã lỗi
| Mã | HTTP | Thoát (script) | Nghĩa |
|---|---|---|---|
| `THAM_SO_SAI`, `TAP_FILE_KHONG_HOP_LE` | 400 | 8 | Tham số sai / tên trong `tap_file` không nằm trong file của (BCVH, ngày) trên nguồn |
| `DANG_CO_LUOT_DONG_BO`, `DANG_XEM_TRUOC` | 409 | 7 | Đang có lượt đồng bộ SFTP / bản xem trước khác |
| `CHUA_CAU_HINH_SFTP` | 503 | 2 | Thiếu / sai `SFTP_*` (thông báo chỉ nêu TÊN biến) |
| `NGUON_XAC_THUC` | 502 | 4 | Sai tên / mật khẩu SFTP — **không thử lại** (Synology có thể chặn IP) |
| `NGUON_VAN_TAY` | 502 | 5 | Vân tay khóa máy chủ không khớp — ngắt trước khi gửi mật khẩu |
| `NGUON_MANG` | 502 | 3 | Lỗi mạng / quá thời gian |
| `NGUON_THU_MUC` | 502 | 6 | Thư mục không có / không đọc được |
| `NGUON_KHAC` | 502 | 1 | Lỗi khác từ nguồn |
Script: 0 xong · 1 lỗi khác · 2 cấu hình / DB · 8 tham số sai (kiểm TRƯỚC khi mở DB hay kết nối).

## 5. Cấu trúc kết quả (JSON giả)
```json
{
  "bcvh": "533140", "ngay": "2026-10-10", "tao_luc": "2026-10-14T05:00:00.000Z",
  "db": {
    "tap_file": [{ "id": 12, "file_name": "HangDen_533140_20261010_235959.csv", "source": "MANUAL", "status": "OK", "row_count": 496, "so_dong_thuc": 496 }],
    "tong_dong": 496, "dong_arrival_date_rong": 3, "shbg_khac_nhau": 480
  },
  "nguon": {
    "thu_muc": ["/CSV_Report_533140"], "tong_muc_liet_ke": 40,
    "bo_qua": { "khac_ma": 12, "khac_ngay": 20, "ngay_khong_hop_le": 0, "ten_khac": 5, "trung_ten": 0 },
    "tap_file": [
      { "thu_muc": "/CSV_Report_533140", "ten": "HangDen_533140_20261010_093012.csv", "kich_thuoc": 330000, "mtime": 1760400000000,
        "chon_mac_dinh": true, "chon": true, "ket_luan": "READY", "ly_do": null, "sha256": "…", "so_dong": 1200, "canh_bao": null }
    ]
  },
  "so_sanh": {
    "dong_cu": 496, "dong_moi_sau_loc_trung": 2500, "dong_moi_trung_du_lieu_con_lai": 0,
    "shbg_cu": 480, "shbg_moi": 2400, "shbg_chung": 478, "shbg_chi_o_cu": 2, "shbg_chi_o_moi": 1922, "ty_le_mat": 0.0042,
    "theo_ngay_den": [{ "ngay": "2026-10-10", "shbg_cu": 480, "shbg_moi": 2300 }, { "ngay": null, "shbg_cu": 0, "shbg_moi": 5 }],
    "shbg_mau_chi_o_cu": ["ZZ9…", "ZZ9…"]
  },
  "canh_bao": { "muc": "CAN_XAC_NHAN", "khoa_mac_dinh": true, "nguong_do": 0.05, "khong_the_thay": false, "ly_do_khong_the_thay": null },
  "phat": { "co_bang": true, "so_shbg_co_trang_thai": 10, "con_o_ban_moi": 8, "khong_con": 2 },
  "tap_file_nguon": [{ "ten": "HangDen_533140_20261010_093012.csv", "kich_thuoc": 330000, "sha256": "…" }]
}
```
(Số trong ví dụ là giả.) `tap_file_nguon` = các file `READY` đã dùng; 5g-3 sẽ tải lại và **từ chối nếu mã băm đổi**.

## 6. Route
`POST /api/arrivals/thay-the/xem-truoc` — chỉ ADMIN (401 không token; 403 TTVH, GDVH, STAFF, TIVI). Thân JSON `{ "bcvh": "533140", "ngay": "2026-10-10", "tap_file": ["HangDen_…csv"] }` (`tap_file` tùy chọn, mặc định tất cả; khóa lạ → 400). Cấu hình nguồn từ biến môi trường (`SFTP_*`, bắt buộc ghim vân tay) — chưa cấu hình → 503. Ghi `SECURITY_LOG` một dòng `event: "arrivals_thay_the_xem_truoc"` (ai, IP, BCVH, ngày, kết quả, mức) — **không có SHBG, không có mật khẩu**; SHBG mẫu chỉ nằm trong phản hồi cho ADMIN.

## 7. PO chạy script từng bước (PowerShell)
Biến môi trường như `sftp-sync` (xem `13_SFTP_SYNC.md`; cổng NAS 5454):
```powershell
Set-Location D:\Dev\hue-dhcl
$env:SFTP_HOST = '<IP hoặc tên NAS>'
$env:SFTP_PORT = '5454'
$env:SFTP_HOSTKEY_SHA256 = 'SHA256:<vân tay đã ghim>'
$env:SFTP_USER = '<tài khoản chỉ đọc>'
$sec = Read-Host 'Mật khẩu SFTP' -AsSecureString
$env:SFTP_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:SFTP_DIRS = '/CSV_Report_533140'
node scripts/thay-the-xem-truoc.js --bcvh=533140 --ngay=2026-10-10
$LASTEXITCODE
```
Chỉ dùng một số file: thêm `--chi-lay=HangDen_533140_20261010_093012.csv,HangDen_533140_20261010_163011.csv`. Dọn: `Remove-Item Env:SFTP_PASSWORD, Env:SFTP_USER`. DB mặc định `data\hue-dhcl.db` (hoặc đặt `ARRIVALS_DB`); script chỉ ĐỌC nên chạy được khi máy chủ đang chạy. Không chạy được lúc có lượt đồng bộ đang chạy (mã thoát 7).
Cách đọc kết quả: xem `[So sánh]` — nếu «CHỈ Ở CŨ» > 0 thì có SHBG chỉ nằm trong dữ liệu cũ; mức `DO` (mất > 5 %) nghĩa là nên xem lại tập file trước khi thay.

## 8. Điều chưa chắc
- Thời gian tải 2–4 file qua mạng thật (mỗi lần xem trước tải lại file; chưa đo). Đề xuất không tải lại những file không chọn (đã làm).
- Bộ nhớ khi so sánh: giữ các tập SHBG của dữ liệu cũ và mới trong bộ nhớ (vài nghìn đến vài chục nghìn chuỗi 13 ký tự — vài MB); file rất lớn gấp nhiều lần chưa kiểm.
- Xung đột với bộ tự động: chỉ chặn được khi lượt đang chạy ghi khóa DB hoặc hẹn giờ ở trạng thái `DANG_CHAY`; khoảng nhỏ giữa kết nối và ghi khóa của hẹn giờ không được phủ. Xem trước không giữ khóa nên lượt đồng bộ có thể bắt đầu NGAY SAU khi xem trước — 5g-3 phải kiểm lại và giữ khóa.
- Nguồn có nhiều thư mục `SFTP_DIRS`: tên trùng giữa các thư mục chỉ lấy thư mục đầu (`bo_qua.trung_ten`).
- File nguồn thay đổi giữa lúc xem trước và lúc thay: 5g-3 phải so mã băm.
