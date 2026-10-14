# ⏱️ SANLUONG-5e — Hẹn giờ tự động nạp file từ SFTP (đường nạp CHÍNH hằng ngày)

> Bối cảnh: `11_SFTP_AUDIT.md` (khảo sát), `12_SFTP_PROBE.md` (thử kết nối), `13_SFTP_SYNC.md` (lõi đồng bộ + script chạy tay). Màn ADMIN «Nạp dữ liệu nguồn» (ticket sau) chỉ giám sát / xử lý ngoại lệ / «Lấy lại».
> **Mặc định TẮT.** Chưa chạy với NAS thật (người viết không có mạng tới NAS).

## 1. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/sftpScheduler.js` | `startSftpScheduler({ db, env, clock, … })`, `stopSftpScheduler()`, `docTrangThaiSftp()`; phần lập lịch THUẦN (không nạp thư viện SFTP; đồng hồ, kết nối, nạp được tiêm) |
| `server/lib/sftpConnect.js` | Lớp kết nối: nơi DUY NHẤT nạp `ssh2-sftp-client` (nạp lười). Ghim vân tay, chỉ `connect/list/get/end` |
| `server/lib/sftpSync.js` | Lõi `syncSftpOnce` (5c) — 5e thêm chế độ `oDinh: 'BANG'`, bảng `sftp_source_files`, nhường vòng lặp giữa hai file, `huy()`, bỏ qua mã lạ, `ghiLuotThatBai` |
| `server/index.js` | Gắn hẹn giờ sau `app.listen` (try/catch; không chạy trong test) |
| `tests/sftp-scheduler.test.js` | 25 ca (đồng hồ giả, `client` giả, DB tạm) |

## 2. Bật / tắt
Biến môi trường (chỉ TÊN; đặt trong `.env`, **không** đưa mật khẩu lên giao diện):
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SFTP_SYNC_ENABLED` | tắt | **Chỉ giá trị `1`** mới bật. `0`, `true`, `yes`, rỗng… = tắt |
| `SFTP_SYNC_INTERVAL_MINUTES` | 10 | Chu kỳ quét; tối thiểu 2 (nhỏ hơn / không phải số → coi là cấu hình sai) |
| `SFTP_SYNC_MAX_FILES` | 5 | Số file nạp tối đa mỗi lượt |
| `SFTP_SYNC_DAYS` | 3 | «Từ ngày» = hôm nay (Bangkok) trừ N ngày |
| `SFTP_STABLE_SECONDS` | 60 | File phải giữ nguyên kích thước + mtime qua ≥ 2 lượt liên tiếp, cách nhau ≥ từng đó giây (tối đa 600) |
| `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`, `SFTP_DIRS`, `SFTP_HOSTKEY_SHA256` | — | Như 5b / 5c; **bắt buộc ghim vân tay** |

**Bật (từng bước):** đặt các biến `SFTP_*` trong `.env` → `SFTP_SYNC_ENABLED=1` → khởi động lại máy chủ. Log khi bật: `[sftp-sync] Bật hẹn giờ: chu kỳ 10 phút, tối đa 5 file/lượt, 1 thư mục (host:cổng); lượt đầu sau 30 giây.` Mỗi lượt có một dòng tóm tắt (`[sftp-sync] Lượt #N: nạp x, đã có y, chưa ổn định z, …`).
**Kiểm tra đã chạy:** (1) log dòng trên và các dòng «Lượt #N»; (2) bảng `sftp_sync_runs` có dòng `trigger = 'TIMER'` (có `finished_at`); (3) `sftp_sync_files` — kết quả từng file; (4) `sftp_source_files` — danh sách file trên nguồn (cột `con_tren_nguon`, `lan_cuoi_thay`); (5) `arrival_import_files.source = 'SFTP'`; (6) hàm `docTrangThaiSftp()` (xem mục 4).
**Tắt:** đặt `SFTP_SYNC_ENABLED` thành rỗng / `0` (hoặc xoá dòng) rồi khởi động lại máy chủ. Hẹn giờ không có nút tắt nóng ở 5e (màn quản trị làm ở ticket sau). Khi máy chủ nhận `SIGTERM`/`SIGINT` (chỉ khi hẹn giờ đang bật): huỷ hẹn giờ, đợi file đang nạp xong, đóng máy chủ.

**Sai cấu hình khi bật:** một dòng log nêu TÊN biến thiếu / sai (không in giá trị), hẹn giờ KHÔNG khởi động, máy chủ KHÔNG sập.

## 3. Một lượt
1. Khoá trong tiến trình (một lượt tại một thời điểm) + khoá trong DB (lượt chưa `finished_at` bắt đầu < 30 phút, vd script chạy tay → hẹn giờ **bỏ qua và ghi nhận**: trạng thái `BI_KHOA_DB`, log; không kết nối).
2. Kết nối (vân tay ghim) → liệt kê → **một lần** (không chờ trong lượt). Cập nhật `sftp_source_files`; file **ổn định** khi kích thước + mtime không đổi qua ≥ 2 lượt liên tiếp và đã giữ nguyên ≥ `SFTP_STABLE_SECONDS` (không so mtime với đồng hồ máy).
3. Lõi 5c/5c-1 (`trigger = 'TIMER'`): lọc tên, **mã lạ → `BO_QUA` (`MA_LA`), không tải, không nạp**, «từ ngày», đã có (`DA_CO`), ổn định, nạp tối đa `SFTP_SYNC_MAX_FILES` file cũ trước (cùng thời điểm theo mã). Giữa hai file `setImmediate` để máy chủ phục vụ người dùng.
4. Ngắt kết nối. Lượt kế tiếp = chu kỳ sau khi lượt này **kết thúc**.
File mới thấy lần đầu chờ ≥ 1 chu kỳ (ví dụ file xuất lúc 16:25 được thấy ở lượt 16:30, nạp ở lượt 16:40).

## 4. Trạng thái (`docTrangThaiSftp()` — cho ticket API sau)
`{ trangThai, lyDo, batLuc, luotGanNhat, luotKeTiep, chuKyPhut, maxFiles, soLuot }`
| `trangThai` | Nghĩa |
|---|---|
| `CHUA_KHOI_DONG` | Chưa ai gọi `startSftpScheduler` |
| `TAT` | Không bật (mặc định) hoặc đang ở môi trường test (`lyDo = MOI_TRUONG_TEST`) |
| `CAU_HINH_SAI` | Bật nhưng thiếu / sai cấu hình; `lyDo` nêu tên biến; hẹn giờ không chạy |
| `CHO` | Đã lên lịch; `luotKeTiep` = giờ lượt kế tiếp (UTC ISO) |
| `DANG_CHAY` | Đang chạy một lượt |
| `TAM_DUNG` | Lỗi xác thực hoặc vân tay sai: `lyDo = XAC_THUC` / `VAN_TAY_SAI`; không còn hẹn giờ nào |
| `DA_DUNG` | Máy chủ đang tắt / đã gọi `stopSftpScheduler()` |
`luotGanNhat.ketQua`: `XONG`, `CO_LOI` (có file / thư mục lỗi), `LOI_KET_NOI` (mạng hoặc lỗi lạ: thử lại chu kỳ sau), `BI_KHOA_DB`, `BI_KHOA_TIEN_TRINH`, `TAM_DUNG`, `LOI_BAT_NGO`; kèm `runId`, `dem` {daNap, daCo, chuaOnDinh, rong, boQuaKhac, loi, maLa}, `thoiGianMs`.

## 5. Xử lý lỗi
| Loại | Hành vi |
|---|---|
| Mạng / thư mục không có / quá thời gian | Ghi vào `sftp_sync_runs` (loi = 1, ghi chú đã che), **thử lại ở chu kỳ bình thường** |
| **Xác thực** hoặc **vân tay sai** | **TẠM DỪNG** hẹn giờ đến khi khởi động lại máy chủ; ghi lý do vào lượt và log. Lý do: NAS Synology có thể tự chặn IP khi sai mật khẩu liên tục — không thử lại mỗi 10 phút |
| Lỗi lạ không phân loại | Thử lại ở lượt sau, ghi đầy đủ (đã che bí mật và số dài) |
| Ném lỗi bất ngờ | Bắt, ghi `LOI_BAT_NGO`, hẹn giờ vẫn chạy tiếp |
**Khôi phục sau tạm dừng:** sửa `SFTP_PASSWORD` (hoặc `SFTP_HOSTKEY_SHA256` sau khi xác minh NAS đổi khoá — dùng `node scripts/sftp-probe.js --show-fingerprint` và đối chiếu với người quản trị NAS), kiểm tra NAS chưa chặn IP, rồi **khởi động lại máy chủ**. Chạy tay `scripts/sftp-sync.js` không bị ảnh hưởng bởi tạm dừng.

## 6. Bảng `sftp_source_files` (mới, idempotent)
Khoá (`thu_muc`, `ten_file`): `kich_thuoc`, `mtime` (ms), `lan_dau_thay`, `lan_cuoi_thay`, `so_lan_giu_nguyen`, `giu_nguyen_tu` (lần đầu thấy cặp kích thước/mtime hiện tại), `con_tren_nguon` (0 = đã biến mất khỏi nguồn; `lan_cuoi_thay` = lần cuối thấy). Ghi mọi file khớp mẫu `HangDen_…csv` (kể cả mã lạ, kể cả cũ) để màn quản trị sau này phân biệt «nguồn có file, chưa nạp» (có ở đây, chưa có trong `arrival_import_files` với `OK`/`EMPTY`) với «nguồn chưa có file». Chạy khô và script chạy tay (chế độ hai lần liệt kê) không ghi bảng này.

## 7. Mã lạ — thay đổi hành vi so với 5c-1 (PO duyệt)
File có mã đơn vị trong tên không thuộc 6 BCVH (`VALID_BCVH_CODES`: 533140, 535470, 536250, 537015, 537220, 535790) → `BO_QUA` + `ma_loi = MA_LA`, không tải, không nạp; hiện trong thống kê theo mã (`laMa`) và cảnh báo cuối lượt; áp dụng cho cả script chạy tay lẫn hẹn giờ. Lý do: importer không có danh sách mã hợp lệ nên mã sai chính tả sẽ tạo «BCVH ma». Ca test của 5c-1 đổi: `mã LẠ …` (trước: nạp + nhãn; nay: bỏ qua, không tải).

## 8. Triển khai trên NAS (Docker) — chỉ KIỂM TRA, chưa sửa (ticket triển khai riêng)
| Câu hỏi | Kết quả (file:dòng) |
|---|---|
| Biến `SFTP_*` mới có tới được container không? | **KHÔNG như hiện nay.** `docker-compose.yml:16-20` chỉ truyền `JWT_SECRET`, `CMS_ALLOWED_IPS`, `TZ`, `PORT` trong `environment:`; file `.env` cạnh compose chỉ dùng để thay thế `${…}` của compose. Ảnh không chép `.env` (`Dockerfile:30-33` chỉ chép `node_modules`, `package.json`, `server`, `dist`; volume chỉ `./data`), nên `process.loadEnvFile()` (`server/index.js:3`) trong container không thấy `.env`. → Cần thêm `env_file: .env` hoặc liệt kê từng `SFTP_*` vào `environment:` (**cần sửa compose — ghi cho ticket triển khai**). Cùng lý do `JWT_EXPIRY*` hiện cũng không tới container |
| `ssh2-sftp-client` có trong ảnh chạy? | **Có**: nằm trong `dependencies` của `package.json` (không phải dev); `Dockerfile:14` `npm ci --ignore-scripts` rồi `npm prune --omit=dev` giữ nó (`Dockerfile:20`). `--ignore-scripts` bỏ bước build phần native tuỳ chọn của `ssh2` (chạy bằng JS thuần — theo khảo sát 5a; **chưa kiểm trong ảnh thật**) |
| Đường kết nối từ container tới NAS? | `network_mode: host` (`docker-compose.yml:13`): container dùng mạng của NAS, nên `SFTP_HOST` có thể là `127.0.0.1` hoặc IP LAN của NAS và cổng SFTP thật (PO: 5454); tường lửa DSM cần cho phép nếu dùng IP LAN. Nếu máy chủ chạy ở máy khác thì phải ra được cổng SFTP của NAS |
| Múi giờ container? | `Dockerfile:28` và `docker-compose.yml:20` đặt `TZ=Asia/Ho_Chi_Minh` (UTC+7 = Asia/Bangkok). «Từ ngày» tính bằng múi giờ `Asia/Bangkok` tường minh (`sftpSync.js ngayBangkok`), không phụ thuộc `TZ`; `getMissingBatches` dùng giờ tiến trình (cùng UTC+7) |
| Ghi chú thêm | Healthcheck và `restart: unless-stopped` không đổi. Tắt container gửi `SIGTERM`: hẹn giờ tắt gọn nếu đang bật (Node chạy PID 1 — trước đây không có trình xử lý SIGTERM) |

## 9. Số đo (dữ liệu giả, DB tạm, không dùng DB thật)
Nạp 5 file × 5.000 dòng (~963 KB/file) trong một lượt: tổng ≈ 800 ms; mỗi file (tải + đọc CSV + nạp) 138–182 ms; **độ trễ vòng lặp sự kiện lớn nhất quan sát được ≈ 140 ms** (đo bằng `monitorEventLoopDelay`, độ phân giải 1 ms). Với 5 file × 1.330 dòng: mỗi file 37–58 ms, độ trễ lớn nhất ≈ 51 ms. **Lưu ý:** PO đo trên DB thật nạp 1.330 dòng ≈ 600 ms (DB lớn, chỉ mục nhiều, đĩa NAS) — chậm hơn dữ liệu giả cỡ 10 lần, nên thời gian chặn thật có thể tới ~0,5–1 s mỗi file (phần ghi DB là một giao dịch đồng bộ không chia nhỏ được). Hẹn giờ nhường vòng lặp giữa hai file, nhưng KHÔNG chia nhỏ một file; giảm `SFTP_SYNC_MAX_FILES` không giảm độ trễ tối đa của MỘT file.

## 10. Điều chưa chắc
- Thời gian chặn thật trên DB thật / NAS (xem trên) — cần đo khi bật.
- Hành vi Synology khi sai mật khẩu liên tục (chặn IP sau bao nhiêu lần, bao lâu) — chưa biết; thiết kế giả định có chặn.
- Nguồn có ghi file nguyên tử không; `SFTP_STABLE_SECONDS` 60 giây có đủ không (giờ trong tên lệch giờ ghi xong 20–40 giây).
- `process.once('SIGTERM')` đổi cách tắt khi hẹn giờ bật (chỉ khi bật).
- Chưa kiểm khi `ssh2-sftp-client` chạy trong ảnh Docker thật.
