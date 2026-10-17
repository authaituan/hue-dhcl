# 🎚️ THAMSO-0 — Khảo sát hằng số / tham số toàn site (chỉ đọc mã)

> Ngày 17/10/2026 · `main` = `161e68b` (PR #82) · Phạm vi: đọc mã `server/`, `src/`, `scripts/`, `tests/`; KHÔNG sửa mã ứng dụng, KHÔNG mở DB thật / `.env` / `data/` / SFTP, không mạng.
> Mọi nhận định có `file:dòng`. Chỗ chưa kiểm ghi «chưa kiểm» (xem mục 7).

## 0. Tóm tắt cho PO (đọc mục này trước)

1. **Có ~19 tham số nhóm 1 (PO muốn tự chỉnh), 9 quy tắc nhóm 2, còn lại là kỹ thuật / môi trường.** Hằng số nghiệp vụ nằm ở 5 file server (`phatConfig.js`, `dashboard-thresholds.js`, `nap-nguon.js`, `thay-the.js`, `config/phat.js`), nhưng **có bản sao / chữ cứng ở giao diện** (mục 4) — trong đó có **1 chỗ lệch giá trị thật** (ân hạn «30 phút» ở giao diện, máy chủ là 60) và **2 ngưỡng nghiệp vụ chỉ tồn tại ở giao diện** (chip phường/xã «tăng ≥ 20%», màu tuổi chờ ≥ 3 ngày).
2. **Một hằng số mang hai nghĩa:** `NGUONG_CHUA_CO_TT_CANH_BAO = 0,10` vừa là *mức tô đỏ thẻ «Chưa có TT»* (nhóm 1) vừa là *định nghĩa ngày «đủ số liệu»* (nhóm 2, #92). Đổi một giá trị là đổi cả hai. **Khuyến nghị tách thành hai tham số.**
3. **Hiện KHÔNG chỉnh được lúc chạy:** mọi hằng số là `Object.freeze` và được `require` một lần (đã chạy thử: gán giá trị → `Cannot assign to read only property`). Muốn chỉnh được phải đổi cách đọc (getter / hàm) ở ~35 chỗ, hoặc để các file hằng số xuất getter để **không phải sửa chỗ gọi**.
4. **Đổi ngưỡng lúc chạy ĐỔI NGAY số của mọi ngày quá khứ** (không có số liệu nào lưu theo ngưỡng; tính lại từ dữ liệu thô mỗi lần). Đã chạy thử: đổi 0,10 → 0,05 làm lũy kế tháng của dữ liệu giả từ 4 ngày / mẫu số 135 xuống 2 ngày / 55 (mục 2.3).
5. **Cache #93 tầng 1 KHÔNG có ngưỡng trong khóa** → sau khi đổi, endpoint `ket-qua-phat-thang` trả số CŨ tới 60 giây (hoặc tới lần ghi DB kế tiếp). Đã chạy thử xác nhận. **Tầng 2 chỉ lưu số đếm thô, KHÔNG phụ thuộc ngưỡng → không cần xóa** (đã chạy thử: 0 lần `demNgay` thêm). Cách xử lý rẻ: thêm «phiên bản tham số» vào khóa tầng 1.
6. **Hạ tầng tái dùng được:** mẫu `CREATE TABLE IF NOT EXISTS` + `ALTER … ADD COLUMN` idempotent (`ensure*Schema`), bảng nhật ký «ai – khi nào» (`thay_the_nhat_ky`: UTC ISO + mã HRM), dòng `req.app.locals.security.log` cho `security.log`, và `requireAdmin` (`server/auth.js:148`). **Chưa có** bảng cấu hình / tham số nào.
7. **Khuyến nghị:** Phương án A (bảng `tham_so` + nhật ký + lớp đọc có đệm, mặc định lấy từ file hằng số hiện có), chỉ cho sửa nhóm 1 + ngưỡng hiển thị chênh; nhóm 2 hiển thị chỉ-đọc. Chi tiết mục 5 và 6.

---

## 1. A. Bảng kiểm kê

Chú giải: **Nơi dùng** S = server, G = giao diện, S+G = cả hai. **Lặp/lệch** = có bản sao ở nơi khác (và có khác giá trị không). **Test cứng** = test khẳng định đúng giá trị (đổi mặc định sẽ làm test đỏ). Nhóm: 1 = ngưỡng PO muốn chỉnh · 2 = quy tắc định nghĩa · 3 = kỹ thuật / giao diện · 4 = biến môi trường.

### 1.1 Nhóm 1 — Ngưỡng nghiệp vụ PO muốn tự chỉnh

| # | Tên | Giá trị | file:dòng (khai báo) | Nghĩa nghiệp vụ | Nơi dùng | Lặp / lệch | Test cứng | Nhóm |
|---|-----|---------|----------------------|-----------------|----------|------------|-----------|------|
| 1 | `NGUONG_PTC_DAT` | 0,82 | `server/lib/phatConfig.js:10` | PTC ≥ 82 % = đạt (xanh), dưới = vàng; vạch mục tiêu | S+G | **Lặp** ở `src/components/phat/ProcessingDeliveryView.jsx:12` (dùng :166, :419 — màn 13 KHÔNG lấy từ API, dù chú thích `phatConfig.js:9` nói «PHAT-3c mới chuyển»); dự phòng `?? 0.82` ở `TiviView.jsx:853,1314`, `DailyOpsBcvhRank.jsx:38`, `DailyOpsPtcRow.jsx:125`. Hiện cùng giá trị, **chưa lệch** | `tests/phat-dashboard.test.js:158,303`; `tests/phat-thang.test.js:210` | 1 |
| 2 | `NGUONG_CHUA_CO_TT_CANH_BAO` | 0,10 | `phatConfig.js:11` | (a) «Chưa có TT» ≥ 10 % → thẻ đỏ; (b) **ngày «đủ số liệu» khi < 10 %** (`phatDashboard.js:44`, #92-4) | S+G | **Lặp** `ProcessingDeliveryView.jsx:13` (dùng :174); dự phòng `?? 0.10` `TiviView.jsx:854`, `DailyOpsPtcRow.jsx:126`. Chưa lệch | `phat-dashboard.test.js:159,303`; `phat-thang.test.js:211,291` | **1 + 2 (hai nghĩa)** |
| 3 | `SAN_XEP_HANG_BCVH` | 50 | `phatConfig.js:14` | Mẫu số < 50 → «chưa đủ dữ liệu», không xếp hạng | S+G | Giao diện lấy từ `nguong` (đúng) — chữ «Dưới {n} bưu gửi» dựng từ giá trị (`DailyOpsBcvhRank.jsx:112,243`, `TiviView.jsx:1481,1541`); dự phòng `?? 50` `TiviView.jsx:1315`, `DailyOpsBcvhRank.jsx:37` | `phat-dashboard.test.js:160,303` | 1 |
| 4 | `SAN_XEP_HANG_PHUONG_XA` | 10 | `phatConfig.js:16` | Sàn xếp hạng phường/xã — **chỉ khai báo, chưa dùng ở đâu** (chú thích «để PHAT-3d») | — | không | `phat-dashboard.test.js:161` | 1 (chưa dùng) |
| 5 | `LECH_SAN_LUONG.trong_ngay_pct / xu_ly_ngay_pct` | 15 / 25 | `server/config/dashboard-thresholds.js:18` | Sản lượng lệch so với cùng thứ tuần trước: ≥ 15 % «Trong ngày», ≥ 25 % «Xử lý ngay» | S (G chỉ nhận mức) | Không lặp. Cả đối tượng được trả nguyên cho client ở `nguong` (`dashboardDenQuery.js:324`) nhưng giao diện **không đọc** | `dashboard-den.test.js:146` | 1 |
| 6 | `SAN_SO_SANH_TOI_THIEU` | 50 | `dashboard-thresholds.js:21` | Mốc tuần trước < 50 bưu gửi → không gắn mức (tránh nhiễu) | S+G | **Chữ cứng** «dưới 50 BG» `DailyOpsDashboard.jsx:219` (và chú thích :205) — đổi giá trị thì chữ sai | `dashboard-den.test.js:141` | 1 |
| 7 | `SAN_SO_SANH_PHUONG_XA` | 10 | `dashboard-thresholds.js:23` | Phường/xã: chênh % chỉ tính khi mốc ≥ 10 BG | S (G chú thích `DailyOpsDashboard.jsx:228`) | Không lặp (chỉ chú thích) | `dashboard-den.test.js:142`; `dashboard-den-danh-gia.test.js:211` | 1 |
| 8 | `GIO_BAT_DAU_DANH_GIA` | 12 | `dashboard-thresholds.js:24` | Giờ dữ liệu < 12 → chưa đánh giá sản lượng | S+G | **Chữ cứng** «chưa tới 12:00» `DailyOpsDashboard.jsx:220` | `dashboard-den.test.js:143` | 1 |
| 9 | `GIO_MUON` | 15 | `dashboard-thresholds.js:11` | Hàng đến muộn: `arrival_at` từ 15:00 | S | Tên khóa API **`sau_15h`** nhúng số 15 (`dashboardDenQuery.js:340`); giao diện không đọc khóa này (chưa thấy trong `src/`) | `dashboard-den.test.js:144` | 1 |
| 10 | `GIO_CHUYEN_CHIEU` | 10 | `dashboard-thresholds.js:29` (cố ý NGOÀI `DASHBOARD_DEN_THRESHOLDS`) | Mốc «chuyến chiều» từ 10:00 | S (G dùng `tu_gio`/`da_toi_gio`) | Không | `dashboard-chuyen-chieu.test.js:80-82` (khóa không có trong `nguong`) | 1 |
| 11 | `BD10_CHUA_XND.xu_ly_ngay_pct / trong_ngay_pct` | 10 / 5 | `dashboard-thresholds.js:15` | BD10 đến chưa XNĐ ≥ 10 % «Xử lý ngay», ≥ 5 % «Trong ngày» | S+G | **Chữ cứng** «vượt 10%» `DailyOpsDashboard.jsx:277`, `TiviView.jsx:72` | `dashboard-den.test.js:145` | 1 |
| 12 | `CHUA_NHAN.xu_ly_ngay_tu_ngay` | 1 | `dashboard-thresholds.js:13` | Bưu gửi chờ ≥ 1 ngày chưa nhận → «Xử lý ngay» | S+G | **Chữ cứng** «từ 1 ngày» `TiviView.jsx:90`, `DailyOpsDashboard.jsx:289,1406`; tên khóa `cho_tu_1_ngay` nhúng số 1 | `dashboard-den.test.js:147` | 1 |
| 13 | chip phường/xã «tăng cao» | ≥ 20 % | `src/components/arrivals/DailyOpsDashboard.jsx:238` (`wardChangeChip`, dùng chung Dashboard + Tivi) | Tăng ≥ 20 % so hôm qua → chip đỏ, dưới → vàng | **G (không có ở server)** | Chỉ ở giao diện; **không có tham số tương ứng ở máy chủ** | không | 1 (G) |
| 14 | màu «tuổi chờ» | ≤ 1 / 2 / ≥ 3 ngày | `src/components/arrivals/ArrivalsNotReceived.jsx:127-130, 222-233`; `ArrivalsBd10NotConfirmed.jsx:150-154` | Màu thẻ/nhãn theo số ngày chờ | G | Hai file cùng quy tắc nhưng **hai bảng màu khác nhau**; không liên hệ với `CHUA_NHAN.xu_ly_ngay_tu_ngay` (#12: 1 ngày) → **mốc đỏ UI (≥ 3) lệch mốc «Xử lý ngay» (≥ 1) của máy chủ** | không | 1 (G) |
| 15 | `NGUONG_MAT_SHBG_DO` | 0,05 | `server/config/thay-the.js:8` | Mất SHBG > 5 % khi «Thay thế ngày» → báo ĐỎ | S+G | Dự phòng `?? 0.05` `ReplaceDayView.jsx:228`; giao diện lấy từ `canh_bao.nguong_do` (đúng). Mức cảnh báo **được lưu** vào `thay_the_nhat_ky.muc_canh_bao` lúc thực hiện | `thay-the-xem-truoc.test.js:129,149,335`; `thay-the-thuc-hien.test.js:255` | 1 (an toàn thao tác) |
| 16 | `GIO_MONG_DOI_SANG / CHIEU` | '09:30' / '16:30' | `server/config/nap-nguon.js:9-10` (đánh dấu `(*)` chưa chốt) | Giờ mong đợi file mỗi đợt | S+G | Dự phòng `|| '09:30'`, `|| '16:30'` `SourceIngestStatus.jsx:144` | `nap-nguon-doc.test.js` (chưa kiểm dòng) | 1 |
| 17 | `AN_HAN_PHUT` | 60 | `nap-nguon.js:11` (`(*)`) | Ân hạn sau giờ mong đợi trước khi «CHỜ FILE» | S+G | **LỆCH:** giao diện dự phòng `|| 30` (`SourceIngestStatus.jsx:144`) so với máy chủ 60. Chỉ lộ ra khi API không trả `an_han_phut` | `nap-nguon-doc.test.js:136` | 1 |
| 18 | `NGUONG_IT` / `NGUONG_NHIEU` | 0,5 / 2,5 | `nap-nguon.js:15-16` (`(*)`) | Số dòng ngày < 0,5× / > 2,5× trung vị cùng thứ → nghi ngờ ít / nhiều | S | Giao diện chỉ hiển thị nhãn (`SourceIngestAttention.jsx:204-205`) — chữ chung, không có số | `nap-nguon-doc.test.js` (chưa kiểm dòng) | 1 |
| 19 | `SO_TUAN_MAU` / `TOI_THIEU_NGAY_MAU` | 4 / 3 | `nap-nguon.js:17-18` (`(*)`) | Lấy tối đa 4 tuần mẫu, cần ≥ 3 ngày mẫu | S | không | (chưa kiểm) | 1 |

### 1.2 Nhóm 2 — Quy tắc định nghĩa (đổi thì đổi NGHĨA số liệu lịch sử)

| # | Tên | Giá trị | file:dòng | Nghĩa | Nơi dùng | Lặp / lệch | Test cứng | Nhóm |
|---|-----|---------|-----------|-------|----------|------------|-----------|------|
| 20 | ngưỡng «đủ số liệu» (= #2b) | < 0,10 | `phatDashboard.js:44` (`duSoLieu`), :300 | Ngày đủ số liệu mới vào lũy kế / chênh | S | xem #2 | `phat-thang.test.js:291-297` | 2 |
| 21 | `RANH_GIOI_DOT` | '12:00' | `nap-nguon.js:12` (`(*)`) | file_time < 12:00 → đợt SÁNG, ≥ → CHIỀU (`napNguonDoc.js:46`) | S | không (chữ cứng «12:00» ở `DailyOpsDashboard.jsx:220` là của #8, ngẫu nhiên trùng) | `nap-nguon-doc.test.js:123-124` | 2 |
| 22 | `NGUONG_NGANG_DIEM` | 0,5 điểm | `phatConfig.js:20` | |chênh| < 0,5 điểm = «ngang» | S | G chỉ chú thích (`DailyOpsPtcThang.jsx:7`) | `phat-thang.test.js:203,207,317-324` | 2 theo ticket; **thực chất hiển thị** (xem nhận xét) |
| 23 | `SO_NGAY_TOI_THIEU_SO_SANH` | 2 | `phatConfig.js:21` | Chỉ trả chênh khi lũy kế ≥ 2 ngày đủ | S | không | `phat-thang.test.js:204,208,327` | 2 theo ticket; thực chất hiển thị |
| 24 | `SAN_MAU_SO_SO_SANH` | 50 | `phatConfig.js:22` | Chỉ trả chênh khi mẫu số hôm nay ≥ 50 | S | không | `phat-thang.test.js:205,209,327` | 2 theo ticket; thực chất hiển thị |
| 25 | `KHUNG_GIO_DEN` | 6 khung 0–10, 10–12, 12–14, 14–16, 16–18, ≥18 | `server/config/phat.js:21-28` | Chia theo giờ đến | S+G | **Chữ cứng nhãn** `TiviView.jsx:1307` (`TABS`), :1578 (`TIME_SLOTS`); màn 13 đọc từ API (`ProcessingDeliveryView.jsx:540`) | `tests/phat.test.js:144` | 2 |
| 26 | `NHOM_CHO` | <2h, 2–4h, >4h, qua ngày | `config/phat.js:31-36` | Nhóm «chưa có TT, đã chờ bao lâu» (`phat.js:672-673`) | S (G đọc `theo_nhom`) | không | `tests/phat.test.js:145` | 2 |
| 27 | `CHUYEN_BAT_THUONG` | 10 cặp | `config/phat.js:70-79` | Chuyển trạng thái cảnh báo (không chặn) | S | không | `phat.test.js:154` | 2 |
| 28 | `RANGE_DAYS_BEFORE/AFTER`, `MAX_OUT_OF_RANGE_RATIO` | 3 / 1 / 1 % | `server/lib/arrivalsImport.js:42-44` (dùng :403-411, :529-541) | File nạp bị TỪ CHỐI nếu > 1 % dòng ngoài [ngày file −3, +1] | S | không | `tests/arrivals-import*.test.js` (chưa kiểm dòng) | 2 |
| 29 | `CHIA_NGAY_LUI_NGAY`, `CHIA_NGAY_SO_NGAY_TOI_DA`, `CHIA_NGAY_GIO_FILE_AO` | 30 / 31 / '235959' | `arrivalsImport.js:499-501` | Chia file nhiều ngày | S (script) | không | (chưa kiểm) | 2 |
| 30 | mốc so sánh `OFF` | hôm qua −1, tuần trước −7 | `dashboardDenQuery.js:287` | «Cùng thứ tuần trước» | S | không | — | 2 |
| 31 | `TTKT_BD10_PREFIX`, `MUI_GIO`, `SHBG_REGEX` | '530100' · Asia/Bangkok (+7) · `^[A-Z]{2}[0-9]{9}[A-Z]{2}$` | `arrivalsQuery.js:42` · `config/phat.js:94`, `phat.js:842` · `config/phat.js:58` | Mã / múi giờ / định dạng — định nghĩa dữ liệu | S | `MUI_GIO` có hai nguồn: `phat.js:842` (hằng 7 giờ) và `config/phat.js:94` | — | 2 |
| 32 | `TRANG_THAI` (5 mã) | — | `config/phat.js:9-15` | Danh sách cố định | S+G | G lặp nhãn (`PhatDraftView.jsx:18`, `PhatCommitResultView.jsx:6`, `PhatHistoryView.jsx:55` — chưa kiểm đủ) | `phat.test.js` | 2 |

**Nhận xét #22-24:** ba ngưỡng «hiển thị chênh» KHÔNG đổi số lịch sử (chỉ quyết định có hiện chênh / có gọi «ngang» hay không, tính lại từ lũy kế mỗi lần) → về hành vi **giống nhóm 1** hơn nhóm 2. Khuyến nghị cho sửa như nhóm 1.

### 1.3 Nhóm 3 — Kỹ thuật / giao diện (chỉ liệt kê, KHÔNG đưa vào module)

- **Cache / hiệu năng:** `CACHE_MS` 60 s, `CACHE_MAX` 64, `DAY_CACHE_MAX` 4000, `DAY_CACHE_MAX_AGE_MS` 10 phút (`phatDashboard.js:136-141`); `KHOA_PHUT` 30 (`sftpSync.js:16`; lặp trong chuỗi `thayTheThucHien.js:161`).
- **Giới hạn trang / khoảng ngày:** `GIOI_HAN.*` (`config/phat.js:38-48`: 20000 dòng, 10 MB, 7 ngày giữ bản kiểm tra, 500 ký tự ghi chú, 30 ngày lùi tồn chờ, 1000/lần sửa, trang 50/200, 31 ngày liên quan); `GIOI_HAN_MAC_DINH` 5 / `TOI_DA` 50 (`dashboardDenQuery.js:27-28`); `MAX_RANGE_DAYS` 731, `MAX_HOUR_RANGE_DAYS` 7, `MAX_PAGE_SIZE` 200, `EXCEPTION_LIMIT` 50 (`arrivalsQuery.js:32-35`); 92 ngày (`arrivalsExport.js:30`, `bd10Query.js:171`, `thayTheNhatKy.js:22` — **ba bản sao** + chữ cứng ở `ArrivalsExport.jsx:36,79`, `ArrivalsBd10Status.jsx:167`, `ReplaceLogTab.jsx:131`); xuất file 1.000.000 dòng / lô 2000 (`arrivalsExport.js:31-34`); `MAX_WIDGETS` 30 (`routes/dashboardWidgets.js:17`).
- **Nạp nguồn:** `SO_NGAY_TOI_DA` 62 (`nap-nguon.js:13`; chữ cứng `SourceIngestGrid.jsx:102,245`), `SO_FILE_TOI_DA_LAY_NGAY` 20, `SO_O_TOI_DA_LAY_LAI` 20, phân trang lượt 20/100, `LICH_SU_TOI_DA` 20 (`nap-nguon.js:20-25`); `GHI_CHU_TOI_DA` 200 (`napNguonXemXet.js:10`); `MAC_DINH` hẹn giờ {chu kỳ 10 phút, tối thiểu 2, tối đa 1440, 5 file, trôi đầu 30 s} (`sftpScheduler.js:14`); `NGUONG_FILE_NHO` 3 KB, `MAX_THU_MUC` 20 (`sftpFiles.js:12,14`).
- **Thay thế ngày (vận hành):** `SO_SHBG_MAU` 20, `SO_NGAY_GIU_THUNG_RAC` 30, `SO_BAN_SAO_LUU_GIU` 5, `DEM_SAO_LUU_BYTE` 32 MB (`thay-the.js:10-15`). *Có thể đưa vào module ở đợt sau (PO đã «chốt» nhưng là chính sách lưu trữ, không phải ngưỡng điều hành).*
- **Đăng nhập:** `LOGIN_MAX_ATTEMPTS` 5, `LOGIN_WINDOW_MS` 15 phút (`routes/auth.js:22-23`).
- **Giao diện:** `REFRESH_MS` 60 s, `RELOAD_MS` 6 giờ, `HOVER_HIDE_MS` 5 s, `STAGE_W/H` 1920×1080 (`TiviView.jsx:40-44`), đồng hồ 30 s (`TiviView.jsx:478`), tốc độ cuộn 25 (`TiviView.jsx:280,1131`), `ME_RETRY_MS` 10 s (`App.jsx:41`), tự làm mới màn Nạp nguồn 60 s (`SourceIngestView.jsx:122`), `gioi_han=5` / `=3` phường/xã (`DailyOpsDashboard.jsx:465`, `TiviView.jsx:130`), `tongBcvh = 6` (`DailyOpsDashboard.jsx:207`), `BCVH_LIST` (`src/constants/bcvh.js:3`).

### 1.4 Nhóm 4 — Biến môi trường (chỉ TÊN)

`JWT_SECRET`, `ALLOW_INSECURE_DEV`, `JWT_EXPIRY`, `JWT_EXPIRY_TIVI` (`auth.js:14-25`) · `PORT`, `HOST_PORT` · `NODE_ENV`, `NODE_TEST_CONTEXT`, `PHAT_WARM` (`index.js:86`) · `PHAT_MAX_DONG` (`config/phat.js:53`) · `ARRIVALS_EXPORT_MAX_ROWS` (`arrivalsExport.js:43`) · `ARRIVALS_DB` (scripts) · `LOGIN_IP_MAX_FAILS` (`routes/auth.js:24`) · `CMS_ALLOWED_IPS`, `TRUSTED_PROXIES`, `SECURITY_LOG` (`security.js:183-191`) · `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`, `SFTP_DIRS`, `SFTP_HOSTKEY_SHA256`, `SFTP_SYNC_DAYS`, `SFTP_STABLE_SECONDS`, `SFTP_SYNC_ENABLED`, `SFTP_SYNC_INTERVAL_MINUTES`, `SFTP_SYNC_MAX_FILES` · `TZ` (yêu cầu `Asia/Ho_Chi_Minh`, `nap-nguon.js:8`).

---

## 2. B. Tác động khi đổi giá trị lúc chạy

### 2.1 Cách đọc hiện nay
- Mọi file hằng số `Object.freeze`; chỗ dùng `require` một lần đầu file rồi tham chiếu thẳng (`phatDashboard.js:14`, `dashboardDenQuery.js:17`, `napNguonDoc.js` `CF.*`, `thayTheXemTruoc.js:202`). **Kiểm chứng:** `node -e` gán `NGUONG_PTC_DAT` và `GIO_MUON` → cả hai ném `Cannot assign to read only property`.
- **Đọc theo từng request** (không đệm): mọi hàm của `dashboardDenQuery.js`, `ketQuaPhat` (thẻ ngày), `napNguonDoc.js`, `thayTheXemTruoc/ThucHien`. Vì vậy chỉ cần đổi **cách lấy giá trị** là hiệu lực ngay ở các đường này.
- Số chỗ gọi phải đổi nếu không dùng getter: `phatDashboard.js` 8 (:44,96,114,117,223,274-275,317), `dashboardDenQuery.js` ~14 (:34,37,134,145-146,157-158,168-169,179,196,324,340-344), `napNguonDoc.js` ~10 (:46,51,125,154-160,185,302), `thayTheXemTruoc.js` 2, `thayTheThucHien.js` 1 (ước lượng từ grep, chưa đếm sai số).
- **Ràng buộc hợp đồng:** `nguong: TH` trả nguyên đối tượng cho client (`dashboardDenQuery.js:324`) và `dashboard-den.test.js:140` khóa danh sách khóa; `ketQuaPhat.nguong` có đúng 3 khóa (`phat-dashboard.test.js:288`). Lớp đọc mới phải trả **cùng hình dạng**.

### 2.2 Bảng tác động từng tham số (nhóm 1–2)

| Tham số | Đọc khi nào | Trong khóa / chữ ký cache #93? | Đổi → số lịch sử đổi? | Phải làm mất hiệu lực | Giao diện |
|---|---|---|---|---|---|
| `NGUONG_PTC_DAT` | mỗi request | Không (chỉ được **echo** vào kết quả tầng 1: `phatDashboard.js:274`) | Không đổi số; đổi **màu / xếp “đạt”** | Tầng 1 (vì có echo) | Màn 13 giữ bản sao cứng; còn lại đọc `nguong` |
| `NGUONG_CHUA_CO_TT_CANH_BAO` | mỗi request | **Không** | **CÓ**: đổi tập ngày «đủ» → lũy kế, chênh, `du_so_lieu`, đường diễn biến của MỌI ngày trong tháng (đã chạy thử, mục 2.3) | **Tầng 1** (không cần tầng 2) | Màn 13 cứng; còn lại `nguong` |
| `SAN_XEP_HANG_BCVH` | mỗi request (`ketQuaPhat` không đệm) | Không áp dụng | Đổi ai được xếp hạng (không đổi số) | Không | Đọc `nguong` ✔ (chữ dựng từ giá trị) |
| `NGUONG_NGANG_DIEM`, `SO_NGAY_TOI_THIEU_SO_SANH`, `SAN_MAU_SO_SO_SANH` | mỗi lần dựng tầng 1 | **Không** | Không đổi số; đổi có/không hiện chênh | **Tầng 1** | Chỉ máy chủ |
| nhóm `dashboard-thresholds` (#5–12) | mỗi request, **không có cache** | — | Không lưu gì; tính lại từ dữ liệu (đổi có hiệu lực ngay cho mọi ngày xem lại) | Không | Chữ cứng ở 5 chỗ (mục 4) |
| `NGUONG_MAT_SHBG_DO` | mỗi lần xem trước / thực hiện | — | Mức đã thực hiện **đã lưu** ở `thay_the_nhat_ky.muc_canh_bao` (không đổi hồi tố); mức hiển thị lại của nhật ký có thể lệch bản đã lưu (chưa kiểm) | Không | `?? 0.05` dự phòng |
| `GIO_MONG_DOI_*`, `AN_HAN_PHUT` | mỗi request (`napNguonDoc.js:51,185`) | — | Đổi **trạng thái ô hôm nay** (CHƯA ĐẾN GIỜ ↔ CHỜ FILE) → dấu vân tay «Đã xem xét» của ô đó đổi (`napNguonXemXet.js:40-47`: dấu có `trang_thai|ly_do`) ⇒ mục tự quay lại «cần xử lý» (theo mã, **chưa chạy thử**) | Không | `SourceIngestStatus.jsx:144` dự phòng lệch |
| `NGUONG_IT/NHIEU`, `SO_TUAN_MAU`, `TOI_THIEU_NGAY_MAU` | mỗi request | — | Đổi tập ngày «nghi ngờ» ở MỌI ngày → dấu vân tay NGÀY (`nghi_ngo|tong_dong`) đổi ⇒ các dấu «Đã xem xét» cũ mất hiệu lực (theo mã, chưa chạy thử) | Không | Chỉ nhãn |
| `RANH_GIOI_DOT` | mỗi request (`napNguonDoc.js:46`) | — | **Đổi nghĩa**: file nằm giữa hai mốc chuyển đợt (sáng ↔ chiều) ở MỌI ngày cũ ⇒ lưới, dấu vân tay, «Đã xem xét» khóa theo `(bcvh, ngày, đợt)` lệch | Không có cache, nhưng bản ghi `nap_nguon_da_xem_xet` khóa theo đợt sẽ **mồ côi / sai đợt** | — |
| `KHUNG_GIO_DEN`, `NHOM_CHO` | mỗi request (`phat.js:176,625,672`) | Tầng 2 chỉ lưu `tong` + `co_tt`, **không** lưu khung (`phatDashboard.js:243`) ⇒ an toàn | Đổi cách chia lát cắt, không đổi tổng | Không | `TiviView.jsx:1307,1578` chữ cứng |
| `RANGE_DAYS_*`, `MAX_OUT_OF_RANGE_RATIO` | mỗi lần nạp file | — | **Không hồi tố** (chỉ ảnh hưởng file nạp sau); ảnh hưởng quyết định chấp nhận / từ chối | Không | — |

### 2.3 Chạy thử xác minh (DB tạm + dữ liệu giả)
Kịch bản scratch (KHÔNG nằm trong repo): `C:\Users\ADMINI~1\AppData\Local\Temp\claude\D--Dev-hue-dhcl-phat1\7bcca5e5-2bfa-4d8c-8bc3-79307360beff\scratchpad\thamso0-cache.scratch.test.js` — sao khung dữ liệu của `tests/phat-thang.test.js` (server thật trên DB tạm, SHBG giả), nạp `phatConfig` bằng **bản sao không đóng băng** rồi đổi `NGUONG_CHUA_CO_TT_CANH_BAO` 0,10 → 0,05 giữa hai lần gọi.
Lệnh: `node --test <đường dẫn trên>` → **1 ca đạt**. Kết quả:

| Bước | Quan sát |
|---|---|
| A (0,10) | đủ số liệu theo ngày `01:1 02:1 03:0 04:0 05:1 06:1`; `so_ngay_co_so_lieu = 4`; mẫu số lũy kế = **135**; `hom_nay.du_so_lieu = true` |
| B (đổi 0,05, KHÔNG xóa cache) | trả **cùng đối tượng cache** (`b === a`), `nguong.chua_co_tt_canh_bao` vẫn **0,1**, `so_ngay_co_so_lieu = 4` ⇒ **số cũ** (cache tầng 1 không biết ngưỡng) |
| B2 (`ketQuaPhat`, thẻ ngày, không cache) | `nguong = 0,05`, `du_so_lieu = false` ⇒ **hai endpoint lệch nhau** cho tới khi cache hết hạn |
| C (chỉ `xoaTang1PhatThang()`) | đủ số liệu `01:0 02:1 03:0 04:0 05:1 06:0`; `so_ngay_co_so_lieu = 2`; mẫu số lũy kế = **55**; `hom_nay.du_so_lieu = false`; **0 lần `demNgay` thêm** (tầng 2 giữ nguyên, vẫn đúng) |

Kết luận: (1) chỉ cần làm mất hiệu lực **tầng 1**; (2) đổi ngưỡng «đủ số liệu» **đổi cả lịch sử** (ngày 01 có «Chưa có TT» đúng 5,0 % → chưa đủ vì quy tắc `<`); (3) khóa tầng 1 chỉ gồm `dauHieuDb` (`phatDashboard.js:155-159`: `data_version` + `total_changes()`). Nếu lưu `tham_so` trong cùng file DB thì lần ghi cũng làm `total_changes()` đổi, nên tầng 1 có thể **tự** hết hiệu lực — suy luận từ mã, **chưa chạy thử**. Không nên dựa vào hiệu ứng phụ này: vô hiệu hóa tường minh (phiên bản tham số trong khóa) và có test riêng, đúng tinh thần #93.

---

## 3. C. Hạ tầng sẵn có

| Cần | Có sẵn | Tái dùng |
|---|---|---|
| Bảng cấu hình / tham số | **Không có.** Gần nhất: `dashboard_widgets` (cấu hình giao diện, `db.js:85-107`), `user_tivi_scope`, `user_bcvh` | Chỉ mẫu tạo bảng |
| Migration | Không có công cụ riêng; mẫu **idempotent**: `CREATE TABLE IF NOT EXISTS` trong `ensure*Schema(db)` gọi từ `db.js:113-174` bọc `try/catch`; thêm cột bằng `PRAGMA table_info` + `ALTER TABLE … ADD COLUMN` (`napNguonLay.js:40-44` `ensureLuotSchema`) | **Dùng nguyên mẫu** cho `ensureThamSoSchema` |
| Nhật ký «ai sửa, khi nào» (DB) | `thay_the_nhat_ky` (`thayTheThucHien.js:60-83`: `thoi_diem_utc` ISO UTC, `nguoi_thuc_hien` = mã HRM, JSON cũ/mới, chỉ mục); `phat_batches.nhap_luc/user_id`; `nap_nguon_da_xem_xet` (`nguoi_ma`, `tao_luc`, `huy_luc`, `huy_nguoi_ma`) | **Mẫu cột** (UTC ISO + mã HRM + JSON trước/sau); có thể thêm `ly_do` |
| Nhật ký tệp | `security.log` (JSON mỗi dòng, `security.js:94-102`; ghi qua `req.app.locals.security.log({event, ip, user_id, hrm_code, role, ket_qua, …})` ở `routes/napNguon.js:67`, `routes/arrivals.js:199,232,307`, `routes/phat.js:89`) | Ghi thêm một dòng `tham_so_sua` song song với bảng nhật ký DB (lưu ý: tệp có thể bị xoay / mất ⇒ **không dùng làm nguồn duy nhất**) |
| Phân quyền ADMIN-only | `requireAdmin` (`server/auth.js:148`, bảo vệ nhờ `makeRoleGuard` :132); mẫu route: `routes/users.js:36…` (`authRequired, requireAdmin`), `routes/napNguon.js:39…` (`requireAdmin`), `routes/dashboardWidgets.js:96…` (ghi: ADMIN; đọc: mọi người dùng đăng nhập). Ràng buộc «ADMIN cuối cùng»: `lib/adminGuard.js` | Dùng `requireAdmin` cho ghi; **đọc** giá trị hiệu lực qua `authRequired` hoặc tiếp tục qua `nguong` |
| TIVI | Allowlist trung tâm `server/lib/tivi.js` (#74): từ chối mặc định (403) | Endpoint tham số **mới** sẽ tự bị 403 với TIVI (đúng ý); Tivi tiếp tục nhận ngưỡng qua `ket-qua-phat.nguong` |
| Thử nghiệm | `tests/helpers/serverHarness.js` (server thật + DB tạm), `fixtures.js` (`seedUser`, `loginAs`) | Dùng nguyên |

---

## 4. D. Chỗ giao diện giữ hằng số riêng (phải chuyển sang đọc từ API)

| # | Giao diện | Đang giữ | Nên đọc từ |
|---|---|---|---|
| D1 | `src/components/phat/ProcessingDeliveryView.jsx:12-13` (dùng :166, :174, :419) | `NGUONG_PTC_DAT = 0.82`, `NGUONG_CHUA_CO_TT_CANH_BAO = 0.10` — **bản sao thật**; `/api/phat/ty-le` (:89) không trả `nguong` | Thêm `nguong` vào `/api/phat/ty-le` (chỉ thêm khóa) hoặc endpoint đọc tham số chung |
| D2 | `DailyOpsDashboard.jsx:238` (`wardChangeChip`, dùng cả Tivi) | tăng ≥ **20 %** → chip đỏ | tham số mới `phuong_xa_tang_cao_pct` trả kèm `phuong-xa-tang` |
| D3 | `DailyOpsDashboard.jsx:219` | chữ «dưới **50** BG» | `nguong.SAN_SO_SANH_TOI_THIEU` (đã có trong `tong-quan-den.nguong`, giao diện chưa đọc) |
| D4 | `DailyOpsDashboard.jsx:220` | chữ «chưa tới **12:00**» | `nguong.GIO_BAT_DAU_DANH_GIA` |
| D5 | `DailyOpsDashboard.jsx:277`, `TiviView.jsx:72` | chữ «vượt **10%**» | `nguong.BD10_CHUA_XND.xu_ly_ngay_pct` |
| D6 | `DailyOpsDashboard.jsx:289,1406`, `TiviView.jsx:90` | chữ «từ **1** ngày» (và khóa `cho_tu_1_ngay`) | `nguong.CHUA_NHAN.xu_ly_ngay_tu_ngay` (khóa API giữ nguyên) |
| D7 | `ArrivalsNotReceived.jsx:127-130, 222-233`; `ArrivalsBd10NotConfirmed.jsx:150-154` | màu theo tuổi chờ ≤ 1 / 2 / ≥ 3 (hai bảng màu khác nhau) | tham số mốc đỏ (mới) — hoặc để nguyên và ghi rõ là «màu trình bày», **cần PO quyết** |
| D8 | `SourceIngestStatus.jsx:144` | dự phòng `'09:30'`, `'16:30'`, `30` (**lệch** máy chủ 60) | bỏ dự phòng; dùng `gio_mong_doi` của API (đã trả) |
| D9 | `TiviView.jsx:853-854, 1314-1315`; `DailyOpsBcvhRank.jsx:37-38`; `DailyOpsPtcRow.jsx:125-126`; `ReplaceDayView.jsx:228` | dự phòng `?? 0.82 / 0.10 / 50 / 0.05` khi API chưa trả | giữ được (dự phòng khi mất kết nối) nhưng **phải lấy cùng nguồn với mặc định máy chủ** để không lệch khi PO đổi |
| D10 | `TiviView.jsx:1307` (`TABS`), :1578 (`TIME_SLOTS`) | 7 nhãn khung giờ | `theo_khung_gio_den` của API (như `ProcessingDeliveryView.jsx:540`) — chỉ cần nếu nhóm 2 `KHUNG_GIO_DEN` sau này sửa được |
| D11 | `SourceIngestGrid.jsx:102,245`; `ArrivalsExport.jsx:36,79`; `ArrivalsBd10Status.jsx:167`; `ReplaceLogTab.jsx:131` | chữ cứng 62 / 92 ngày | nhóm 3 — **không đưa vào module**, chỉ nên gom một hằng số giao diện nếu muốn |

---

## 5. E. Hai phương án kiến trúc

### Phương án A — Bảng `tham_so` + lớp đọc có đệm; mặc định lấy từ file hằng số hiện có (khuyến nghị)

**Thiết kế**
- `server/config/tham-so.js` (mới): *danh bạ tham số* — mỗi mục `{ khoa, nhom, kieu: 'so'|'so_nguyen'|'phan_tram'|'gio_hhmm', mac_dinh (lấy từ hằng số hiện có), min, max, don_vi, nhan, mo_ta, anh_huong, quy_tac: bool, rang_buoc_cheo }`. Giữ nguyên các file hằng số hiện có làm **nguồn mặc định** ⇒ mọi test «khóa giá trị mặc định» vẫn đúng.
- Bảng `tham_so(khoa PK, gia_tri TEXT(JSON), cap_nhat_luc, cap_nhat_boi)` — chỉ lưu giá trị **ghi đè**; thiếu dòng = mặc định (hoàn về mặc định = xóa dòng + ghi nhật ký).
- Bảng `tham_so_nhat_ky(id, khoa, gia_tri_cu, gia_tri_moi, thoi_diem_utc, nguoi_ma, ly_do, loai 'SUA'|'VE_MAC_DINH')` theo mẫu `thay_the_nhat_ky`; thêm một dòng `security.log` (`event: 'tham_so_sua'`).
- `server/lib/thamSo.js` (mới): nạp ghi đè vào RAM lúc khởi động, `lay(khoa)`, `datNhieu([...])` (giao dịch), `veMacDinh(khoa)`, **số phiên bản** tăng mỗi lần ghi.
- **Giữ nguyên chỗ gọi** bằng cách cho `phatConfig.js`, `dashboard-thresholds.js`, `nap-nguon.js`, `thay-the.js` xuất **getter** (`Object.defineProperty(..., { get })`) trả giá trị hiệu lực, thay cho `Object.freeze` giá trị cứng; đối tượng lồng (`DASHBOARD_DEN_THRESHOLDS.LECH_SAN_LUONG`…) trả **bản chụp cùng hình dạng** để hợp đồng `nguong` và test khóa danh sách khóa không đổi.
- Route `server/routes/thamSo.js` (mới): `GET /api/tham-so` (danh bạ + giá trị hiệu lực + mặc định + ai sửa gần nhất; ADMIN), `PUT /api/tham-so` (một hoặc nhiều khóa + `ly_do`; ADMIN), `POST /api/tham-so/:khoa/ve-mac-dinh` (ADMIN), `GET /api/tham-so/nhat-ky` (ADMIN, lọc khóa / thời gian / phân trang).

**Kiểm tra hợp lệ:** theo danh bạ — kiểu (số nguyên / thập phân / `HH:MM`), `min/max` cứng, ràng buộc chéo (`trong_ngay_pct < xu_ly_ngay_pct`; `0 < NGUONG_IT < 1 < NGUONG_NHIEU`; `GIO_MONG_DOI_SANG < RANH_GIOI_DOT ≤ GIO_MONG_DOI_CHIEU`; `trong_ngay_pct < xu_ly_ngay_pct` cho BD10), từ chối khóa lạ (whitelist), bắt buộc `ly_do` (≤ 200 ký tự), kiểm tra ở **máy chủ** (giao diện chỉ gợi ý). Thân yêu cầu lạ / thừa trường → 400 như các route hiện có.

**Làm mất hiệu lực cache:** khóa tầng 1 `phatDashboard.js:330` thêm `thamSo.phienBan()` (hoặc gọi `xoaTang1PhatThang()` sau mỗi lần ghi); tầng 2 **không đổi** (đã chạy thử: lưu số đếm thô). Nếu sau này cho sửa quy tắc nhóm 2 thì đổi tiền tố khóa `v3` → `v4` (đã là mẫu của #93). Cache khác: không có (mục 2.1).

**File phải thêm / sửa**
- Thêm (5): `server/config/tham-so.js`, `server/lib/thamSo.js`, `server/routes/thamSo.js`, `tests/tham-so.test.js`, `docs/ai/` báo cáo + mục `04_DECISIONS.md`.
- Sửa (≈ 9): `server/db.js` (+`ensureThamSoSchema`), `server/index.js` (mount route), `phatConfig.js`, `dashboard-thresholds.js`, `nap-nguon.js`, `thay-the.js` (getter), `phatDashboard.js` (khóa tầng 1), `package.json` (đăng ký test), `docs/ai/00_SNAPSHOT.md` + `03_ARCHITECTURE_MAP.md` + `CHANGELOG_AI.md`.
- Không phải sửa 35 chỗ gọi nhờ getter. (Rủi ro: xem dưới.)

**Số ca test ước tính: 40–50** — danh bạ & mặc định khớp hằng số (6), kiểm tra hợp lệ theo từng kiểu + min/max + ràng buộc chéo (12), ghi / đọc / nhật ký / hoàn mặc định (8), phân quyền 5 vai trò × GET/PUT (6), cache: đổi tham số ⇒ tầng 1 tính lại, tầng 2 không (4), hợp đồng `nguong` không đổi hình dạng (4), đồng thời / giao dịch (2), số lịch sử đổi đúng như dự kiến sau khi đổi `NGUONG_CHUA_CO_TT` (3).

**Rủi ro**
1. Getter thay `Object.freeze`: `tests/dashboard-den.test.js:140-147`, `phat-dashboard.test.js:158-161`, `phat-thang.test.js:203-205`, `dashboard-chuyen-chieu.test.js:80-82` phải xanh với mặc định; phải khóa «danh sách khóa» khi lớp đọc trả bản chụp.
2. Vòng phụ thuộc: `db.js` ← `thamSo` ← `phatConfig` ← `phat*.js` ← `db.js`; cần nạp lười / `thamSo.khoiTao(db)` sau `ensure*`.
3. **Đổi nhóm 1/2 đổi số lịch sử ngay** (mục 2.3) — người dùng ngoài ADMIN thấy số cũ nhảy; cần cảnh báo trong giao diện + nhật ký.
4. Hai tiến trình ghi (script `scripts/*.js` không ghi `tham_so`) ⇒ RAM của máy chủ là bản duy nhất; nếu sau này chạy 2 tiến trình máy chủ phải đọc lại theo `data_version` (chưa cần).
5. `RANH_GIOI_DOT` / `GIO_MONG_DOI_*` đổi làm «Đã xem xét» cũ mồ côi (mục 2.2): đưa vào nhóm khóa.
6. Sai giá trị = hỏng điều hành: `min/max` cứng + `veMacDinh` + nhật ký là bắt buộc, không phải tùy chọn.

**Thứ tự ticket đề xuất (A)**
1. **THAMSO-1** — backend: danh bạ + bảng + nhật ký + lớp đọc (getter tương thích) + API ADMIN + cache tầng 1 + test. *Không đổi giao diện.* Gồm việc tách `NGUONG_CHUA_CO_TT` thành hai khóa (`chua_co_tt_canh_bao`, `du_so_lieu_toi_da`) nếu PO đồng ý.
2. **THAMSO-2** — giao diện: bỏ chữ cứng / dự phòng lệch (D1–D8): màn 13 đọc API, sửa dự phòng `30` → bỏ, `wardChangeChip` đọc tham số, `build` + dựng thử.
3. **THAMSO-3** — giao diện ADMIN «Tham số hệ thống» (bảng theo nhóm, sửa nhiều khóa + lý do, hoàn mặc định, xem lịch sử).
4. **THAMSO-4 (sau 2–4 tuần dữ liệu)** — ngưỡng theo thống kê (TB ± 2σ theo BCVH / khung giờ): tham số thêm kiểu `tu_thong_ke` + job tính; **chưa thiết kế ở đợt này** theo yêu cầu.

### Phương án B — Giá trị có HIỆU LỰC THEO NGÀY (effective-dated), số lịch sử bất biến

**Khác A:** bảng `tham_so_gia_tri(khoa, hieu_luc_tu_ngay, gia_tri, cap_nhat_luc, cap_nhat_boi, ly_do)`; truy vấn «giá trị của khóa K tại ngày D». Đổi giá trị từ hôm nay = chỉ ngày ≥ hôm nay dùng giá trị mới; ngày cũ giữ nguyên ⇒ **số lịch sử không nhảy**, và là cách đúng để nhóm 2 (`NGUONG_CHUA_CO_TT` «đủ số liệu», `RANH_GIOI_DOT`…) sửa được mà không đổi nghĩa quá khứ.
- **Phải đổi:** mọi nơi hiện lấy ngưỡng cho một *ngày cụ thể* phải nhận tham số ngày (`duSoLieu(t, ngay)` ở `phatDashboard.js:44,300`; `danhGiaSanLuong`; `napNguonDoc` theo ngày ô; …) ⇒ KHÔNG dùng được getter «phẳng»; khóa tầng 2 phải chứa **phiên bản giá trị hiệu lực của ngày đó** (chữ ký mỗi (BCVH, ngày) thêm 1 thành phần); lũy kế tháng có thể gồm nhiều giá trị ngưỡng khác nhau.
- **File:** như A + sửa sâu `phatDashboard.js`, `dashboardDenQuery.js`, `napNguonDoc.js`, `phat.js` (≈ 6 file nghiệp vụ, hàng chục chỗ gọi), bảng thứ hai, quy tắc xung đột khoảng hiệu lực.
- **Test: 80–110 ca** (A + hiệu lực theo ngày: biên ngày, nhiều bản ghi trong một tháng, cache tầng 2 theo phiên bản, quy tắc tháng gồm nhiều ngưỡng).
- **Hoàn về mặc định / min-max / nhật ký:** như A (thêm bản ghi hiệu lực «mặc định» từ hôm nay).
- **Rủi ro:** lớn (đổi lõi tính toán đã nghiệm thu #91-#93, nguy cơ lệch số ở chính chỗ vừa chốt), thời gian ~2–3× A, giao diện phải giải thích «giá trị theo thời kỳ».
- **Chỉ nên làm nếu PO KHÔNG chấp nhận số lịch sử đổi khi chỉnh ngưỡng (xem F2).**

**Phương án đã loại (không đặt tên):** tệp cấu hình `data/*.json` + nhật ký vào `security.log`. Không giao dịch với DB, nhật ký không truy vấn được và có thể bị xoay, nằm trong `data/` (quy tắc bàn giao cấm Dev AI đụng), khó test. Chỉ ghi để PO biết đã cân nhắc.

### So sánh & khuyến nghị
| | A | B |
|---|---|---|
| Phạm vi sửa lõi | getter ở 4 file hằng số + 1 khóa cache | sửa tham số ngày ở ≥ 6 file lõi |
| Số lịch sử khi đổi ngưỡng | **đổi theo** (cần cảnh báo) | giữ nguyên |
| Nhóm 2 sửa được | Không nên (chỉ-đọc) | Có (từ ngày hiệu lực) |
| Test ước tính | 40–50 | 80–110 |
| Rủi ro | thấp–vừa | cao |

**Khuyến nghị: A**, nhóm 2 để chỉ-đọc, sau đó nâng lên B chỉ khi PO thực sự cần nhóm 2 sửa được hoặc số lịch sử bất biến.

---

## 6. F. Câu hỏi PO cần chốt (kèm khuyến nghị)

1. **Nhóm 2 có cho sửa không?** — *Khuyến nghị: KHÔNG ở đợt 1* (hiển thị chỉ-đọc kèm nhãn «quy tắc, đổi sẽ đổi nghĩa số lịch sử»). Ngoại lệ cần quyết: **tách `NGUONG_CHUA_CO_TT_CANH_BAO` thành hai tham số** — «mức tô đỏ thẻ» (sửa được) và «ngưỡng đủ số liệu» (khóa). Nếu PO vẫn muốn sửa nhóm 2 ⇒ cảnh báo đỏ + xác nhận hai lần, và cân nhắc Phương án B.
2. **Hiệu lực ngay hay từ ngày mai?** — *Khuyến nghị: NGAY* (A). Ghi rõ: mọi ngày quá khứ tính lại theo giá trị mới (đã thấy lũy kế 4 ngày → 2 ngày khi đổi 0,10 → 0,05). «Từ ngày mai» chỉ khả thi sạch ở Phương án B.
3. **Có «hoàn về mặc định» và «xem lịch sử sửa» không?** — *Khuyến nghị: CÓ cả hai, và bắt buộc nhập lý do (≤ 200 ký tự).* Rẻ, và là điều kiện để trả lời «ai sửa, khi nào» (yêu cầu của PO).
4. **Giới hạn min/max cứng?** — *Khuyến nghị: CÓ, bắt buộc, kiểm ở máy chủ.* Gợi ý ban đầu (PO duyệt): tỷ lệ 0–1 hoặc 0–100 %; `ptc_dat` 0,50–0,99; `chua_co_tt_canh_bao` 0,01–0,50; sàn mẫu 1–1000; giờ 0–23 hoặc `HH:MM` hợp lệ; `trong_ngay_pct < xu_ly_ngay_pct`; `0 < IT < 1 < NHIEU ≤ 10`; ân hạn 0–240 phút.
5. **Ai được XEM giá trị đang hiệu lực?** — *Khuyến nghị: màn quản trị chỉ ADMIN; các màn khác tiếp tục nhận qua `nguong` trong phản hồi hiện có (TIVI chỉ qua endpoint đã có trong allowlist).*
6. **Hai ngưỡng chỉ có ở giao diện:** chip phường/xã «tăng ≥ 20 %» (D2) và màu tuổi chờ ≥ 3 ngày (D7) — đưa lên máy chủ thành tham số hay để là «màu trình bày»? *Khuyến nghị: D2 đưa vào module (nó quyết định màu «xấu» trên tivi); D7 chỉ thống nhất hai bảng màu, KHÔNG đưa vào module, và PO chốt mốc đỏ có theo `xu_ly_ngay_tu_ngay` hay không.*
7. **Giá trị `(*)` trong `nap-nguon.js` chưa chốt** (09:30, 16:30, ân hạn, 12:00, IT/NHIEU, 4 tuần, 3 ngày mẫu): PO chốt giá trị khởi đầu; riêng **ân hạn máy chủ 60 phút nhưng giao diện dự phòng 30 phút** — giá trị đúng là bao nhiêu? *Khuyến nghị: 60 theo máy chủ, bỏ dự phòng ở giao diện (D8).*
8. **Tên khóa API nhúng số** (`sau_15h`, `cho_tu_1_ngay`): giữ nguyên để không phá hợp đồng (giao diện hiện không đọc `sau_15h`). *Khuyến nghị: giữ khóa, thêm/ dùng `tu_gio` đã có.*
9. **Nhóm 3 «vận hành» (30 ngày thùng rác, 5 bản sao lưu, 32 MB đệm)** có muốn đưa vào module ở đợt sau không? *Khuyến nghị: để đợt sau, không làm lẫn với ngưỡng điều hành.*
10. **Ngưỡng theo thống kê (TB ± 2σ):** xác nhận chỉ làm sau 2–4 tuần dữ liệu (THAMSO-4) và danh bạ phải chừa kiểu `tu_thong_ke` ngay từ THAMSO-1 để khỏi đổi cấu trúc bảng sau. *Khuyến nghị: chừa cột `che_do` (`tay`|`tu_thong_ke`), chưa cài.*

---

## 7. Chưa chắc / chưa kiểm

- Đã chạy: `node --test tests/phat-thang.test.js tests/phat-dashboard.test.js tests/dashboard-den.test.js tests/nap-nguon-doc.test.js` → **80 ca: 79 đạt, 0 lỗi, 1 bỏ qua** (không xác định ca bị bỏ qua là ca nào). **Chưa chạy `npm test` đủ bộ, chưa chạy `npm run build`.**
- Số dòng của test cứng ở `nap-nguon-doc.test.js` (giờ mong đợi, IT/NHIEU, tuần mẫu), `arrivals-import*.test.js` (RANGE_DAYS), `dashboard-den.test.js:145,147` (đoán theo khối :140-147) — «chưa kiểm dòng».
- Tác động lên **dấu vân tay «Đã xem xét»** khi đổi `RANH_GIOI_DOT`, `NGUONG_IT/NHIEU`, giờ mong đợi: suy ra từ `napNguonXemXet.js:40-47` và `napNguonDoc.js:240,246,276-279`, **chưa chạy thử**.
- Mức cảnh báo của nhật ký «Thay thế ngày» khi đổi `NGUONG_MAT_SHBG_DO` (hiển thị lại từ số đã lưu hay tính lại): chưa kiểm.
- Việc ghi bảng `tham_so` trong cùng tiến trình làm tầng 1 tự hết hiệu lực qua `total_changes()` (mục 2.3): suy luận từ `phatDashboard.js:155-159`, chưa chạy; nên có test riêng.
- Số chỗ gọi (~35) là ước lượng bằng `grep`; chưa đếm các chỗ gián tiếp (qua đối tượng `TH` truyền đi).
- Chưa rà `NetworkListView.jsx` (1386 dòng, màn mạng lưới; không liên quan ngưỡng điều hành), `ArrivalsView.jsx`, `DashboardView.jsx` về hằng số; chưa rà đủ nhãn `TRANG_THAI` lặp ở các màn Phát (#32).
- `sau_15h` không thấy trong `src/` — kết luận «giao diện không đọc» dựa trên `grep`, chưa kiểm các chỗ dựng khóa động.
- Hướng dẫn `CLAUDE.md` yêu cầu thêm mục `CHANGELOG_AI.md` khi xong việc; **ticket này cho phép đúng MỘT file mới**, nên KHÔNG sửa `CHANGELOG_AI.md` / `00_SNAPSHOT.md` — nợ nhỏ cho PO quyết khi gộp.
- Kịch bản kiểm chứng nằm ở thư mục tạm (ngoài repo), không bàn giao; có thể chuyển thành test thật ở THAMSO-1 (xem 2.3).

## 8. Bàn giao Git (gợi ý, PO thực hiện)

- File mới: `docs/ai/33_THAMSO0_KHAO_SAT_THAM_SO.md` (không sửa file nào khác).
- Gợi ý commit: `docs(thamso): THAMSO-0 khao sat hang so / tham so toan site (chi doc ma)`
