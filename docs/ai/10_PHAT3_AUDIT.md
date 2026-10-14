# 🔎 PHAT-3a — Khảo sát nối Dashboard và tivi với tỷ lệ phát thật

> Chỉ đọc mã và tài liệu, không chạy gì ngoài `git`, không mở DB. Cơ sở: `origin/main` tại `df3a8b8`. Không có dữ liệu thật (SHBG, BD8, BD10) trong file này.
> **PHAT-3b đã làm (14/10/2026):** endpoint `GET /api/arrivals/dashboard/ket-qua-phat` + hằng số `phatConfig.js` + số đo `ton_cho` bằng dữ liệu giả (~320 ms/BCVH, `/ty-le` gộp 6 BCVH ~2,2 s) — xem `04_DECISIONS.md` #79, `08_PHAT.md` mục 4. Mục 6 bên dưới là ước tính TRƯỚC khi đo.
> Mọi số về thời gian chạy dưới đây là **ước tính từ đọc mã và số đo cũ trong tài liệu**, KHÔNG phải số đo mới (ghi «chưa chắc» khi vậy).

## 0. Tóm tắt
1. Dashboard và tivi đều còn **khung «Sắp có» cho PTC** (5 chỗ: thẻ PTC, khối xếp hạng/khung giờ ở Dashboard, thẻ PTC + Bảng 11 xếp hạng + Bảng 12 khung giờ ở tivi); không có giá trị giả, chỉ có chỗ trống («–»).
2. `/api/phat/ty-le` đã đủ **mẫu số, 5 trạng thái, mức cập nhật, 6 khung giờ, tồn chờ** nhưng chỉ ở dạng **gộp** (một BCVH hoặc `all`); **không trả từng BCVH, không trả từng phường/xã**, và **không có mốc «cùng giờ»** — trạng thái phát chỉ có bản hiện tại nên «hôm qua/tuần trước» chỉ là số đã chín, không so được công bằng với hôm nay.
3. Quyền: **nên thêm endpoint mới dưới `/api/arrivals/dashboard/`**, không mở `/api/phat/ty-le` cho TIVI. STAFF hiện **không vào được cả màn «Điều hành hôm nay»** (không chỉ phần phát).
4. Xếp hạng theo BCVH và theo phường/xã **làm được từ dữ liệu hiện có** (một truy vấn nhóm, không cần bảng mới), nhưng ngoài 533140 chưa BCVH nào có dữ liệu để thử, và cần sàn mẫu số + quy tắc «chưa nhập thì sao».
5. Rủi ro lớn nhất không phải giao diện mà là **hiệu năng của `ton_cho` khi gọi mỗi 60 giây**: quét 31 ngày × từng BCVH, chạy đồng bộ (better-sqlite3) nên một lần gọi chậm chặn mọi yêu cầu khác. Cần bộ nhớ đệm.
6. Đề xuất: **Phương án A** (3b backend đủ → 3c Dashboard → 3d tivi) hoặc **Phương án B** (cắt theo giá trị: Dashboard trọn vẹn trước, tivi + xếp hạng phường/xã sau). Khuyến nghị B.

## 1. Hiện trạng Dashboard / tivi

**Dashboard «Điều hành hôm nay»** (`src/components/arrivals/DailyOpsDashboard.jsx`; 3 API `tong-quan-den`, `viec-can-lam`, `phuong-xa-tang`, tải `:150-153`).
| Khối | file:dòng | Nguồn | Trường | PTC? |
|---|---|---|---|---|
| Thẻ 1 Sản lượng đến | `:398-426` | `tong-quan-den` | `san_luong.buu_gui`, `so_hom_qua_cung_gio`, `so_tuan_truoc_cung_gio` / `theo_bcvh[].so_hom_qua`, `so_tuan_truoc` | — |
| Thẻ 2 BCVH cần chú ý (chỉ xem `all`) | `:428-444` | `tong-quan-den` | `bcvh_can_chu_y{so,tong}` | — |
| Thẻ 3 Hàng đi ngoài | `:446-464` | `tong-quan-den` | `hang_di_ngoai{ty_le,buu_gui,so_tuan_truoc_cung_gio.chenh_diem}` | — |
| Thẻ 4 Sau 15:00 | `:466-484` | `tong-quan-den` | `sau_15h{ty_le,buu_gui,da_toi_gio}` | — |
| **Hàng PTC** | `:486-507` | không có | chữ «Sắp có», «Chưa phát sinh dữ liệu phát» | **Chỗ trống** |
| Việc cần điều hành (băng chuyền) | `:509-608` | `viec-can-lam` | `items[]{loai,muc,tieu_de_khoa,so_lieu,duong_dan}` | — |
| **Xếp hạng BCVH / biểu đồ khung giờ** | `:610-621` | không có | chữ «Sắp có» | **Chỗ trống** |
| Bảng «Hôm nay theo từng BCVH» | `:623-743` | `tong-quan-den.theo_bcvh` | cột sản lượng, so hôm qua, so tuần trước, chưa nhận, BD10 chưa XNĐ, đánh giá | không có cột phát |
| Chưa nhận tại BCVH, đã chờ bao lâu | `:745-889` | `tong-quan-den.theo_bcvh[].chua_nhan` | `cho_tu_1_ngay`, `cho_lau_nhat_ngay`; ô «Chia theo giờ» ghi «Sắp có» (`:753`, `:866-876`) | xem mục 5 |
| Phường/xã tăng | `:891-…` | `phuong-xa-tang` | `hom_kia/hom_qua/hom_nay`, `tuan_truoc_cung_gio`… | — |

**Tivi** (`src/components/TiviView.jsx`; 3 API cùng loại, `fetch3` `:106-137`, `gioi_han=3`).
| Khối | file:dòng | Ghi chú |
|---|---|---|
| Thẻ Sản lượng / Hàng đi ngoài / Đến sau 15:00 | `:543-640` | có số thật |
| **Thẻ PTC** | `:556-600` | «–» + nhãn «SẮP CÓ» + chữ «Module… đang được xây dựng» |
| Việc cần làm | `:641-790` | chỉ biết 2 loại việc (`tvActionTitle` `:60-71`) |
| **Bảng 11 «Xếp hạng BCVH · PTC»** (chỉ khi phạm vi `all`) | `:793-876`, chọn ở `:460-461` | 7 thẻ khung giờ + 6 BCVH, thanh rỗng, «–» |
| **Bảng 12 «Hôm nay từng khung giờ»** (chỉ khi một BCVH) | `:878-948`, chọn ở `:462-463` | 7 khung (gồm «Cả ngày»), thanh rỗng, «–» |
| Chưa nhận (all) / Chưa nhận + phường/xã (một BCVH) | `:950-1225` | 3 ô chờ «DƯỚI 2 GIỜ / 2–4 GIỜ / TRÊN 4 GIỜ» ghi «Sắp có» (`:1081-1085`, `:1119`) |

**Kết luận mục 1:** không có giá trị giả; PTC chỉ là chỗ trống có nhãn. Hai điểm dễ nhầm:
- Ô «Chưa nhận… đã chờ bao lâu» với 3 ô «Sắp có» là **chỉ số khác** (BD10 đã lập nhưng chưa có xác nhận nhận tại BCVH, cần **chia theo giờ** từ `notReceivedStats`, hiện chỉ có tuổi theo ngày). Nó **không phải** `ton_cho` của phát (SHBG đã đến mà chưa có kết quả phát). Không có chỗ nào trong `src/` dùng `ton_cho` (tìm `ton_cho` trong `src/`: 0 kết quả).
- Cùng hai ngưỡng tô màu PTC đang là hằng số **phía giao diện màn 13**: `NGUONG_PTC_DAT = 0.82`, `NGUONG_CHUA_CO_TT_CANH_BAO = 0.10` (`ProcessingDeliveryView.jsx:11-13`, dùng ở `:160-183`), không có ở `server/config/dashboard-thresholds.js`.

## 2. Dữ liệu phát sẵn có (`GET /api/phat/ty-le`)
- Route `server/routes/phat.js:287-299`, hàm `tyLeApi` `server/lib/phat.js:622-656`. Tham số `bcvh` (mã | `all`, mặc định `all`), `ngay` (YYYY-MM-DD); tham số lạ → 400.
- Trường trả: `bcvh, ngay, cung_ngay, mau_so, theo_trang_thai{PTC,PKTC,CHUYEN_HOAN,CHUA_CO_TT,LAC_HUONG:{nhan,so,ty_le}}, muc_cap_nhat, so_lieu_den_luc(+_bangkok), theo_khung_gio_den[6]{ma,nhan,so_den,theo_trang_thai,muc_cap_nhat}, ton_cho{moc_tinh_den,tong,theo_nhom[4]}` (`phat.js:642-655`; khoá được khoá bằng test `tests/phat.test.js:939`).
- **Chiều dữ liệu:** `all` = **cộng** các BCVH có file OK (`phat.js:624-640`), không có mảng theo BCVH. **Không có theo phường/xã.** Không có «hôm qua»/«tuần trước» đi kèm.
- **Theo ngày đến nào:** SHBG có `arrival_at` trong `[ngày D 00:00:00, 23:59:59]` (`demNgay` `:570-581` dùng `windowFilter(…,'23:59:59')`). Không có `ngay` → ngày file OK mới nhất **của từng BCVH** (`:631`), cùng quy ước với `tong-quan-den` (`dashboardDenQuery.js:76-81`); lệch ngày → `cung_ngay=false`. Mẫu số khớp `san_luong.buu_gui` (có test, `08_PHAT.md` mục 1).
- **Tính được không:**
  | Mốc | Làm được? | Bằng chứng / ghi chú |
  |---|---|---|
  | «Hôm nay» | Có | như trên |
  | «Hôm qua» / «tuần trước» **chín** (gọi `ngay=D−1`, `D−7`) | Có, nhưng **không công bằng** | trạng thái chỉ có bản hiện tại (`phat_status_current`); số của D−7 đã được cập nhật cả tuần, số của hôm nay mới chạy vài giờ → PTC hôm nay luôn «thấp hơn» tuần trước |
  | «Hôm qua **cùng giờ**» / «tuần trước cùng giờ» | **Thiếu** | `/ty-le` không cắt theo `den_luc` (khác `tong-quan-den`); muốn đúng phải dựng trạng thái **tại thời điểm T** từ `phat_status_history` (có `nhap_luc`, `trang_thai`, `trang_thai_truoc`; hoàn tác ghi thêm dòng, `phat.js:902-952`). Làm được trên lược đồ hiện có (dòng cuối có `nhap_luc ≤ T` của mỗi SHBG; có chỉ mục `ix_phat_history_shbg`) nhưng chưa ai viết, và lịch sử chỉ có từ ngày module chạy |
  | Mốc «số liệu tính đến» theo ngày | **Thiếu** | `so_lieu_den_luc` = giờ nhập của đợt **gần nhất chưa hoàn tác của mọi ngày** (`phat.js:563-567`), không gắn với ngày đang xem |
- **Không có bảng ảnh chụp theo ngày** (chỉ `phat_batches`, `phat_status_current`, `phat_status_history`, `phat_drafts`, `phat_draft_rows`, `phat.js:29-108`).
- **Điều thiếu để phân biệt «0% thật» và «chưa ai nhập»:** `hasPhatData` ở màn 13 chỉ là «có đợt nào chưa» (`ProcessingDeliveryView.jsx:151`), không xét riêng ngày đang xem. Ngày không có dòng trạng thái nào vẫn ra PTC 0%, mức cập nhật 0% kèm giờ của đợt hôm trước. Dashboard/tivi cần cờ riêng theo ngày (ví dụ «không có SHBG nào của ngày này có trạng thái»).

## 3. Quyền
**Hiện tại (đọc từ mã):**
| Vai trò | `/api/phat/ty-le` | 3 API dashboard `tong-quan-den`… | Menu «Điều hành hôm nay» |
|---|---|---|---|
| ADMIN, TTVH | 200, mọi BCVH | 200 | có |
| GDVH | 200, **mọi** BCVH (#72; chỉ **nhập** mới theo BCVH được gán) | 200 | có |
| STAFF | 403 (`routes/phat.js:44` `xemGuard`) | **403** (`arrivals.js:24-25` `viewerGuard`) | **không có** (`Sidebar.jsx:23-30`); `DailyOpsDashboard` còn hiện khung 403 (`:268-277`) |
| TIVI | 403 do allowlist (`tivi.js:13-18`, `auth.js:118`) | 200, `bcvh` bị **ép** theo phạm vi (`arrivals.js:82-93`) | tivi |
- Quan trọng: **STAFF chưa thấy thứ gì của phát hay của «đến»**; STAFF chỉ thấy Dashboard cũ (3 biểu đồ) — #49. Muốn «STAFF xem tỷ lệ phát» thực chất là **mở một phần mới của hệ thống cho STAFF**, không phải mở thêm một endpoint. Đó là quyết định vai trò (ngoài kỹ thuật).

**Hai cách cho tivi:**
- **(a) Mở `/api/phat/ty-le` cho TIVI:** thêm vào `TIVI_ALLOWED`, sửa `xemGuard` thêm TIVI, và **tự thêm** phần ép `bcvh` theo phạm vi (hiện nằm ở `dashScope` trong `routes/arrivals.js`, route phát không có). Rủi ro: allowlist khớp theo đường dẫn (bỏ query, `tivi.js:24-36`) nên token tivi 90 ngày (#74) đọc được **`ngay` tuỳ ý** (lịch sử), `ton_cho`, khung giờ — nếu quên ép `bcvh`, tivi một BCVH đọc được cả Trung tâm. Số liệu chỉ là số gộp (không có SHBG), nên mức lộ là **kinh doanh/cạnh tranh nội bộ**, không phải dữ liệu cá nhân.
- **(b) Endpoint mới `GET /api/arrivals/dashboard/ket-qua-phat` (khuyến nghị):** đặt cạnh 3 endpoint dashboard, **dùng lại `dashScope`** (ép `bcvh`, 403 khi chưa có phạm vi), thêm 1 dòng vào `TIVI_ALLOWED` + quyết định PO (đúng như `tivi.js:12` dặn). Trả đúng những gì tivi/dashboard cần (số đã cắt gọn), `ngay` chỉ nhận cho vai trò xem, TIVI bỏ qua. GDVH/TTVH/ADMIN dùng chung. Giữ `/api/phat/ty-le` nguyên cho màn 13.
- **Xếp hạng và phạm vi tivi:** tivi một BCVH thấy xếp hạng của 6 BCVH = thấy số của BCVH khác. Hiện Bảng 11 (xếp hạng) chỉ hiện ở phạm vi `all` (`TiviView.jsx:460-463`); nếu giữ vậy thì endpoint chỉ trả bảng hạng khi phạm vi `all`, còn một BCVH chỉ trả hạng của chính nó («2/6») — **cần PO xác nhận**.

## 4. Xếp hạng
- **Theo BCVH — làm được.** Khoá trạng thái (bcvh, shbg) (`phat.js:51-60`, `MAU_JOIN` `:543`); `tyLeApi` đã gọi `demNgay` **riêng từng BCVH** trong vòng lặp rồi cộng lại (`:630-640`) — chỉ cần trả từng phần tử thay vì cộng. Không đổi lược đồ.
- **Theo phường/xã — làm được.** Phường/xã nằm trên dòng đại diện của SHBG ở CTE `s` (`arrivalsQuery.js:246-252`: `ward_key`, `ward_name`, nhóm `HOME`/`OUT_PROVINCE`/`NO_WARD`/`NO_PROVINCE`); nguồn gốc là cột `Ten_Xa_Phuong` của file «Hàng đến» (`arrivalsImport.js:32`, `ward_key = wardKey(ward_name)` `:274`). `phuongXaTang` đã nhóm theo ward trên `s` (`dashboardDenQuery.js:312`); thêm `LEFT JOIN phat_status_current` như `MAU_JOIN` rồi `GROUP BY ward_key, trạng thái` là xong — **một truy vấn mỗi BCVH**.
  - Chỉ nhóm `HOME` có tên phường/xã; phần SHBG không có phường/xã hoặc ngoài tỉnh **không vào bảng hạng** (khảo sát cũ 07: ~10,8% dòng rỗng phường/xã, 87,9% khớp tên mới trên mẫu lúc đó — cần đo lại, **chưa chắc**).
  - Phường/xã là phường/xã **nơi phát** của dòng đại diện (lần đến sớm nhất), không phải BĐX; danh mục có 40 phường/xã mới, 533140 phục vụ 36 (`07_SANLUONG_AUDIT.md:98-100`).
- **Chênh lệch mẫu số / sàn:** cần sàn, vì PTC = PTC / **mẫu số** (cả SHBG chưa có TT), không phải / «đã có thông tin» (`phat.js:584-591`). Hệ quả: BCVH hoặc phường/xã **chưa ai nhập** ra PTC 0% và đứng cuối — công bằng hay không là **quyết định PO** (có thể tách «hạng theo PTC» với «hạng theo mức cập nhật»).
  - Dashboard đã có sàn cho so sánh: 50 bưu gửi cho BCVH, 10 cho phường/xã (`dashboard-thresholds.js:20-23`). Đề xuất dùng lại hai hằng này cho xếp hạng (**đề xuất, chưa chắc là ngưỡng đúng**); dưới sàn → ghi «chưa đủ dữ liệu», không xếp hạng.
  - Thêm điều kiện: BCVH/phường xã **chưa có dòng trạng thái nào của ngày** → không xếp hạng (xem mục 2, cờ theo ngày).
  - Xếp hạng giữa BCVH **khác ngày dữ liệu** (`cung_ngay=false`) là so khác ngày: `tong-quan-den` đã có `cung_ngay_du_lieu` (`:186`), nên làm tương tự.
  - Hiện chỉ BCVH 533140 có dữ liệu (`00_SNAPSHOT.md` mục 6); xếp hạng 6 BCVH **chưa thể thử bằng dữ liệu thật**.

## 5. `ton_cho`, «Mức cập nhật kết quả phát», loại việc mới
- **Mức cập nhật kết quả phát:** đã định nghĩa cả ở tài liệu (#75; `08_PHAT.md` mục 1 điểm 6) lẫn mã: `1 − tỷ lệ CHUA_CO_TT`, phân số 0..1, `null` khi mẫu số 0 (`phat.js:584-591`). Đã có ở cấp tổng và từng khung giờ. **Lưu ý:** tính trên **cả SHBG vừa đến** — đầu ngày/giữa đợt sóng hàng đến, số này thấp do hàng mới đến chưa kịp nhập, không phải do BCVH lơ là. Có thể muốn bản «đã đến hạn» (bỏ nhóm `DUOI_2H`); đây là **câu hỏi cho PO**, chưa có trong tài liệu.
- **`ton_cho`:** có trong cả tài liệu (#75 «Tồn chờ»; `08_PHAT.md:84`) lẫn mã (`phat.js:603-616`, nhóm ở `config/phat.js` `NHOM_CHO`): 4 nhóm `DUOI_2H`, `2_4H`, `TREN_4H`, `QUA_NGAY`; mốc = `den_luc` của ngày xét; xét lùi tối đa 30 ngày. Cộng gộp khi `all`; `moc_tinh_den` lấy mốc muộn nhất (`:639`) trong khi từng BCVH tính theo mốc riêng của mình. Chưa có chỗ nào ở giao diện dùng.
- **Loại việc mới ở `viec-can-lam`:** hiện có đúng 2 loại, `chua_nhan_tai_bcvh` và `bd10_chua_xnd` (`dashboardDenQuery.js:26`, `:288-303`), mức do hằng số trong `dashboard-thresholds.js`. Khi thêm loại mới:
  - Backend: định nghĩa **mức** (xu_ly_ngay / trong_ngay) cho từng loại — **chưa có trong tài liệu**, PO phải chốt. Gợi ý ứng viên: «mức cập nhật dưới X%» và «tồn chờ trên 4 giờ/qua ngày > 0»; thêm vào `LOAI_RANK` (`:26`) và `duong_dan`.
  - `muc` của BCVH (`worst([...])` `:222`) và `bcvh_can_chu_y` hiện chỉ tính từ 3 nguồn (sản lượng, chưa nhận, BD10); thêm loại phát có **đưa vào đó hay không** là quyết định PO.
  - Giao diện: Dashboard `formatActionTitle` (`:89-105`) và tivi `tvActionTitle` (`TiviView.jsx:60-71`) với loại lạ sẽ in thẳng `tieu_de_khoa` (thô) và nút «Xử lý» không làm gì (`handleExecuteAction` `:246-265` chỉ biết 2 loại) → cần thêm cả tiêu đề, mô tả, đích điều hướng. `handleNavigate` (`App.jsx:119-123`) chỉ đặt `activeTab`, còn `ProcessingDeliveryView` chỉ nhận `authUser` → **muốn bấm vào việc phát mở thẳng màn 13 đúng BCVH/ngày thì phải thêm tham số điều hướng** (việc nhỏ, nhưng phải làm).
  - Tivi cũ giữ bản JS tới 6 giờ (`TiviView.jsx:38`): gặp loại mới sẽ in khoá thô tới khi tải lại — đã từng chấp nhận ở #76 với khoá đổi tên; cùng cách xử lý.

## 6. Hiệu năng và độ tươi (đánh giá bằng đọc mã)
- Số đo cũ làm mốc: `tong-quan-den` ~50–100 ms, `viec-can-lam` ~40–60 ms, `phuong-xa-tang` ~70–100 ms (#73); hàng đi ngoài 1 ngày ~10 ms (`09_DASH6_AUDIT.md:135`); API «Hàng đến» khoảng 1 tháng < 0,5 s, 1 năm 3,7–7,8 s trên 1 triệu dòng (`00_SNAPSHOT.md:62`). **Chưa có số đo nào cho `/ty-le`** (`CHANGELOG_AI.md` chỉ đo file mẫu/kiểm tra/nhập, dòng ~139).
- Phân rã chi phí của `/ty-le` mỗi BCVH:
  | Phần | Cách làm | Cỡ ước tính |
  |---|---|---|
  | `demNgay` (1 ngày) | CTE `s` 1 ngày (~4 nghìn dòng đại diện) + `LEFT JOIN` khoá chính `(bcvh,shbg)` | cùng cỡ truy vấn 1 ngày ở dashboard (hàng chục ms) |
  | `tonCho` | CTE `s` cho **31 ngày** (`from = D−30`, `phat.js:606-607`) rồi nhóm theo thời gian chờ | **~30 lần** truy vấn 1 ngày; bám theo «1 tháng < 0,5 s» → cỡ **vài trăm ms mỗi BCVH** (chưa chắc) |
  | Cộng 6 BCVH (`all`) | lặp `demNgay` + `tonCho` 6 lần | ước lượng **1–3 s** khi đủ 6 BCVH có dữ liệu (chưa chắc; hiện mới 1 BCVH có dữ liệu nên chưa thấy) |
- Truy vấn mới cho PHAT-3 cộng thêm: xếp hạng phường/xã (+1 truy vấn nhóm 1 ngày mỗi BCVH, ngang `WARD_SQL` ~ chục ms), ảnh chụp «tại thời điểm T» nếu làm so cùng giờ (thêm truy vấn con trên `phat_status_history` cho mỗi SHBG của ngày; cỡ vài chục nghìn dòng lịch sử mỗi tuần — **chưa chắc**).
- **Vì sao `ton_cho` đáng lo:** better-sqlite3 chạy **đồng bộ** trong tiến trình Express; truy vấn 1–3 s chặn **mọi** yêu cầu khác (đăng nhập, các màn khác) trong thời gian đó. Dashboard và tivi lặp lại mỗi 60 giây; mỗi tivi/tab thêm một nhịp.
- **Độ tươi hiện nay:** Dashboard làm mới **60 giây**, tạm dừng khi tab ẩn, tải lại ngay khi hiện lại (`DailyOpsDashboard.jsx:196-225`). Tivi **60 giây** (`REFRESH_MS`, `TiviView.jsx:37`, vòng lặp `:139-162`), tạm dừng khi ẩn, tải lại cả trang **6 giờ** một lần (`RELOAD_MS` `:38`). Nhưng số phát chỉ đổi khi **có người bấm Nhập/Hủy đợt** hoặc khi **nạp file hàng đến** — thường vài lần mỗi ngày, không phải mỗi phút.
- **Hướng giảm tải (đề xuất):** bộ nhớ đệm trong tiến trình theo `(bcvh, ngay)` với khoá phiên bản = `MAX(nhap_luc)` của `phat_batches` + `MAX(imported_at)` của file OK (hai truy vấn rất nhẹ, đã có sẵn trong `soLieuDenLuc` và `napLuc`); trong khoảng phiên bản không đổi trả ngay. Có thể thêm trần 30 → 7–14 ngày cho `ton_cho` nếu PO chấp nhận. **Cần đo trên bản sao DB (như DASH-6a) ở PHAT-3b trước khi chốt**.

## 7. Phương án chia ticket
**Phương án A — theo lớp (backend đủ → giao diện).**
| Ticket | Nội dung | Ước lượng |
|---|---|---|
| PHAT-3b | Backend: `GET /api/arrivals/dashboard/ket-qua-phat` (tổng, từng BCVH, 6 khung giờ, `muc_cap_nhat`, `ton_cho`, cờ «chưa có số liệu phát của ngày», xếp hạng BCVH + phường/xã); loại việc phát ở `viec-can-lam`; thêm vào `TIVI_ALLOWED`; ngưỡng vào `dashboard-thresholds.js`; bộ nhớ đệm; test ~25 ca (quyền 5 vai trò, ép phạm vi TIVI, sàn, cùng ngày) | 1,5–2 ngày |
| PHAT-3c | Giao diện **Dashboard + tivi**: 3 chỗ «Sắp có» của Dashboard, thẻ PTC + Bảng 11 + Bảng 12 + loại việc ở tivi | 1,5–2 ngày |
- Ưu: backend xong một lần, giao diện không chờ. Nhược: 3c lớn, khó nghiệm thu; so sánh «tuần trước» chưa có ngay.

**Phương án B — theo giá trị (khuyến nghị).**
| Ticket | Nội dung | Ước lượng |
|---|---|---|
| PHAT-3b | Backend **tối thiểu cho Dashboard**: endpoint mới với tổng + từng BCVH (`ty_le`, `muc_cap_nhat`, cờ có/không số liệu), 6 khung giờ, `ton_cho` có bộ nhớ đệm; chưa tivi, chưa xếp hạng phường/xã, chưa so tuần trước | ~1 ngày |
| PHAT-3c | Giao diện Dashboard: thẻ PTC, khối khung giờ/xếp hạng BCVH (bỏ «Sắp có»), cột phát ở bảng «theo từng BCVH» | ~1 ngày |
| PHAT-3d | Tivi (mở `TIVI_ALLOWED`, thẻ PTC, Bảng 11, Bảng 12) + loại việc phát + xếp hạng phường/xã | ~1,5–2 ngày |
- Ưu: Dashboard dùng được sớm, đo hiệu năng thật trước khi đưa lên tivi 24/24; tách riêng quyết định về quyền tivi. Nhược: nhiều ticket hơn, backend được mở rộng ở hai lần.

**Điều giữ nguyên ở cả hai:** `/api/phat/ty-le` không đổi (màn 13 dùng); không đụng lược đồ `phat_*` trừ khi PO chọn so cùng giờ; không đưa số hiệu bưu gửi vào bất kỳ API nào của dashboard.

## 8. Điều chưa chắc
- **Mọi số thời gian chạy ở mục 6** là suy từ đọc mã và số đo cũ; chưa chạy `/ty-le` trên bản sao DB. Không biết `ton_cho` thực sự mất bao lâu khi đủ 6 BCVH.
- Dữ liệu hiện chỉ có BCVH 533140; **không biết** phân bố mẫu số 5 BCVH còn lại nên sàn 50/10 chỉ là mượn từ sản lượng.
- Tỷ lệ SHBG không có phường/xã (~10,8% ở khảo sát cũ) chưa đo lại với dữ liệu mới.
- Chưa kiểm số lượng phường/xã có dữ liệu mỗi ngày của 533140 — ảnh hưởng độ ổn định xếp hạng phường/xã.
- «Trạng thái tại thời điểm T» từ `phat_status_history` mới là phân tích trên lược đồ, chưa thử; hoàn tác (dòng ghi lại mang `batch_id` của đợt bị hoàn tác) làm quy tắc «dòng cuối có `nhap_luc ≤ T`» cần kiểm bằng test riêng.
- Chưa biết tần suất nhập thật (mỗi giờ? cuối ngày?) — quyết định mọi so sánh «cùng giờ» có ý nghĩa hay không.
- Chưa mở giao diện chạy thật; mô tả giao diện dựa trên đọc mã.

## 9. Điều cần PO quyết định
1. **Ngưỡng màu PTC:** giữ 82% (xanh) / dưới 82% (hổ phách) và «chưa có TT ≥ 10%» (đỏ) của màn 13? Đặt ở **server** (`dashboard-thresholds.js`) để Dashboard, tivi, màn 13 dùng chung? Có thêm mức đỏ cho PTC quá thấp, và mức cho `muc_cap_nhat`?
2. **Sàn mẫu số xếp hạng:** BCVH 50 và phường/xã 10 (mượn từ sản lượng) hay số khác? BCVH/phường xã chưa nhập thì «chưa đủ dữ liệu» hay xếp cuối PTC 0%?
3. **Xếp hạng theo gì:** PTC (trên cả mẫu số, phạt BCVH nhập ít) hay PTC trên «đã có thông tin», hay hai bảng (PTC và mức cập nhật)?
4. **Mức cập nhật:** tính trên mọi SHBG đã đến hay bỏ nhóm «dưới 2 giờ» (đến hạn)?
5. **Có đưa lên tivi hay chỉ Dashboard** (và phạm vi tivi một BCVH có thấy hạng của BCVH khác không).
6. **STAFF:** có mở «Điều hành hôm nay» cho STAFF không (hiện 403 cả phần «đến»)? Nếu có, chỉ phần phát hay cả trang.
7. **Đơn vị chênh:** «điểm» (đang dùng cho hàng đi ngoài, `formatPointDiff` `DailyOpsDashboard.jsx:13`, #76) hay «%»; màn 17 đang hiện chênh dạng «%» có dấu (`CHANGELOG_AI.md` PHAT-2 Đợt B). Đề xuất «điểm» cho mọi chênh của một tỷ lệ.
8. **So tuần trước / hôm qua cho PTC:** bỏ ở PHAT-3 (khuyến nghị — chưa có dữ liệu thật và chưa có ảnh chụp theo giờ), hay làm ảnh chụp «tại thời điểm T» từ lịch sử, hay chấp nhận so số đã chín (sai lệch có hệ thống)?
9. **Loại việc phát:** điều kiện và mức (xu_ly_ngay/trong_ngay) của «mức cập nhật thấp» và «tồn chờ lâu»; có đưa vào `muc` của BCVH và `bcvh_can_chu_y` không.
10. **Phương án A hay B** (mục 7), và có cần ticket đo hiệu năng riêng.
