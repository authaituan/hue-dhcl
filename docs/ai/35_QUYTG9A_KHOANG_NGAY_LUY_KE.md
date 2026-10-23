# QUYTG-9a — «Thời gian Khai thác-Vận chuyển»: khoảng ngày cộng từng ngày, trần 31 ngày, lũy kế tháng

> Backend. Chốt: PO 23/10/2026 (điểm 1: cộng từng ngày; điểm 2–7 của báo cáo khảo sát QUYTG-9-0 theo khuyến nghị) và bổ sung của CTO. Giao diện là 9c (Antigravity); script cập nhật cột KTT cho 533140 là 9b (chưa làm).
> Mã: `server/lib/quyThoiGianQuery.js`, `quyThoiGianCache.js`, `server/routes/arrivals.js`; test `tests/quy-thoi-gian-khoang-ngay.test.js`. Tên mã (`quy-thoi-gian`, `quyThoiGian*`) giữ nguyên.

## 1. Thay đổi

### 1.1 Khoảng ngày CỘNG TỪNG NGÀY (`/tong-hop`, `/luot`, `/theo-ngay`)
- Một lượt = một **(SHBG, ngày đến)**. SHBG đến lại ở ngày khác của khoảng được tính ở MỖI ngày đến. Trước 9a mỗi SHBG chỉ được tính một lần ở lần đến đầu của cả khoảng (`aq.buildCountedCte`).
- Lõi lấy lượt mới: `sqlDongDo` / `layDongDo` (`quyThoiGianQuery.js`), KHÔNG dùng `buildCountedCte` (không sửa `arrivalsQuery.js`, nên `/summary` và dashboard giữ nguyên). Dòng đại diện của mỗi lượt = dòng có `arrival_at` sớm nhất của (SHBG, ngày); không lọc BCVH thì SHBG đi qua nhiều BCVH cùng ngày vẫn là MỘT lượt (xuyên BCVH trong ngày, như trước).
- Dòng ĐO chọn theo **(SHBG, BCVH)** (trước chỉ theo SHBG; chỉ khác khi một SHBG có đại diện ở nhiều BCVH). Quy tắc chọn không đổi: XNĐ BD10 sớm nhất trong các dòng cùng SHBG và cùng BCVH, không giới hạn theo ngày.
- **Khoảng một ngày cho kết quả y hệt trước** (đối chiếu bản cũ và bản mới trên DB giả: 51 truy vấn một ngày / lọc BCVH / lọc nhiều BCVH / lọc theo giờ, `tong-hop`, `luot`, `theo-ngay` đều bằng nhau). Khoảng nhiều ngày: tổng = Σ các ngày = số lượt = Σ `theo_ngay[].den`; có thể lớn hơn `/summary.san_luong` của cả khoảng đúng bằng số lượt đến lại (cố ý).
- `soSanhLuot` thêm `ngay_den` làm khóa phá hòa cuối (cùng SHBG có thể có lượt ở nhiều ngày).

### 1.2 Trần 31 ngày
`docThamSo` giới hạn khoảng **31 ngày** cho cả ba route (đếm theo ngày của `from` / `to`; thông báo «Khoảng thời gian tối đa 31 ngày», HTTP 400). Trước đó chỉ `/theo-ngay` có trần; `/tong-hop` và `/luot` đến 731 ngày.

### 1.3 `GET /api/arrivals/quy-thoi-gian/luy-ke`
Lũy kế từ ngày 01 của tháng chứa `den` đến `den` (mặc định: ngày file OK mới nhất của các BCVH được xét), KHÔNG phụ thuộc khoảng ngày người dùng chọn.
- Quyền: ADMIN, TTVH, GDVH (200); không token 401; TIVI 403 (không thêm vào allowlist `server/lib/tivi.js`).
- Tham số: `receiver_code` (tùy chọn; mã trong 6 BCVH, nhiều mã cách bằng dấu phẩy; vắng = cả 6) và `den` (`YYYY-MM-DD`, tùy chọn). Khóa lạ (kể cả `from`, `to`, `ward_key`), `den` sai, mã ngoài danh mục → 400.
- Tính: cộng từng cặp (BCVH, ngày) «có dữ liệu» theo **công thức A** của «Xử lý và tỷ lệ phát» (cộng từng BCVH, không lọc trùng xuyên BCVH). Tỉ lệ = **Σ quá hạn / Σ chinh** (cộng đếm rồi chia). Mẫu số là `chinh` (đo được và không nghi ngờ), không phải `do_duoc`.
- (BCVH, ngày) «có dữ liệu» khi (kiểm theo thứ tự này, `ly_do` là lý do đầu tiên không đạt):
  1. `THIEU_FILE`: không có file `status = 'OK'` với `file_date` = ngày;
  2. `DANG_CAP_NHAT`: ngày đó là ngày mới nhất của phạm vi và BCVH có ít hơn 2 file OK / EMPTY;
  3. `DUOI_SAN`: số lượt đến < `SAN_NGAY_CO_DU_LIEU` = **50** (hằng số TẠM, chưa nối sổ «Tham số hệ thống», trả ở `meta.san_ngay_co_du_lieu`).
- Hình dạng phản hồi (khóa giả):
```json
{ "tu": "2026-10-01", "den": "2026-10-06", "thang": "2026-10", "ngay_moi_nhat": "2026-10-06",
  "ngay_dang_cap_nhat": "2026-10-06", "so_ngay_co_du_lieu": 4, "bcvh": ["535470"],
  "tong": { "tong_shbg": 240, "do_duoc": 240, "chinh": 240, "truc_tiep": 0,
            "dai": { "QUA_HAN": 30, "SAP_HET": 0, "CON_2_6": 0, "CON_TREN_6": 210 }, "ty_le_qua_han": 0.125 },
  "theo_ngay": [ { "ngay": "2026-10-03", "co_du_lieu": false, "ly_do": "THIEU_FILE", "so_bcvh_trong_ngay": 0,
                   "bcvh_thieu": [ { "ma": "535470", "ly_do": "THIEU_FILE" } ],
                   "den": 0, "chinh": 0, "qua_han": 0, "ty_le_qua_han": null,
                   "luy_ke_qua_han": 30, "luy_ke_chinh": 240, "luy_ke_ty_le": 0.125 } ],
  "meta": { "cach_tinh": "CONG_TUNG_NGAY", "chi_tieu": "F1_3", "dang_cap_nhat": true, "bcvh_dang_cap_nhat": ["535470"],
            "san_ngay_co_du_lieu": 50, "nguong_sap_het_giay": 7200, "nguong_nghi_ngo_giay": 604800 } }
```
  - `theo_ngay` có mặt đủ mọi ngày từ `tu` đến `den`, tăng dần. `den` / `chinh` / `qua_han` của một ngày chỉ cộng các BCVH có dữ liệu; ngày `co_du_lieu = false` có `ty_le_qua_han = null` và `luy_ke_*` giữ nguyên giá trị của ngày đủ gần nhất trước nó. Với nhiều BCVH, `co_du_lieu` = có ít nhất một BCVH đủ điều kiện; BCVH còn lại nằm trong `bcvh_thieu` (`{ ma, ly_do }`). `ly_do` của ngày (khi `co_du_lieu = false`) ưu tiên `DANG_CAP_NHAT` > `DUOI_SAN` > `THIEU_FILE`.
  - **Ngày đang cập nhật**: `ngay_dang_cap_nhat` = ngày mới nhất khi có ít nhất một BCVH trong phạm vi ở trạng thái `DANG_CAP_NHAT` ở ngày đó, còn lại `null`; `meta.dang_cap_nhat` tương ứng, `meta.bcvh_dang_cap_nhat` liệt kê mã. Cặp (BCVH, ngày) ấy không vào `tong` nhưng ngày vẫn có trong `theo_ngay` (với một BCVH: `co_du_lieu = false`, `ly_do = 'DANG_CAP_NHAT'`). Với «Tất cả BCVH» có thể chỉ MỘT PHẦN các BCVH đang cập nhật: ngày vẫn `co_du_lieu = true` nếu còn BCVH khác đủ — giao diện ghi chú theo `meta.bcvh_dang_cap_nhat`.
  - Chưa có file OK nào và không truyền `den`: `tu` / `den` / `thang` / `ngay_moi_nhat` = `null`, `theo_ngay = []`, `tong` toàn 0.
  - `den` nhỏ hơn ngày mới nhất: cắt ở `den`, `ngay_dang_cap_nhat = null`. Ngày 01 của tháng mới chưa về: ngày mới nhất vẫn ở tháng trước nên trả đúng tháng trước (`thang`).

### 1.4 Cache của `/luy-ke` (`quyThoiGianCache.js`)
Không giữ danh sách lượt; chỉ giữ số đếm theo (BCVH, ngày), và KHÔNG mất cache chỉ vì ghi không liên quan (nhập trạng thái phát...).
- **Đường nhanh**: dấu hiệu DB (`PD.dauHieuDb`) không đổi và chưa quá 10 phút → trả kết quả đã ghép (cache `lk1|mã BCVH|tu|den`, tối đa 64 khóa).
- **Đường chậm** (dấu hiệu đổi): MỘT truy vấn gộp tính CHỮ KÝ dữ liệu hàng đến của mọi (BCVH, ngày) trong tháng (`chuKyDuLieu`: số dòng, tổng `id`, tổng giây của `arrival_at`, `bd10_confirmed_at`, `bd10_ttkt_confirmed_at`, tổng độ dài `ward_name`, `bd10_no`). Chỉ cặp có chữ ký đổi (hoặc quá tuổi tối đa của tầng, hoặc chưa có) được tính lại bằng MỘT truy vấn gộp trên hộp bao các cặp đó; còn lại dùng số đếm đã giữ (tối đa 4.000 cặp). Số file / đủ đợt của từng ngày đọc lại mỗi lần ghép (bảng nhỏ). Đường chậm cũng chạy khi kết quả đã ghép quá 10 phút.
- **Tuổi tối đa theo tầng** (chỉ là TRẦN thời gian giữ, KHÔNG thay chữ ký): ngày GẦN (cách ngày mới nhất của phạm vi ≤ 3 ngày) giữ 10 phút (`CACHE_MAX_AGE_MS`); ngày XA (cách > 3 ngày; `LUY_KE_NGAY_XA`) giữ 6 giờ (`LUY_KE_TUOI_NGAY_XA_MS`). Chữ ký của cặp đổi — nạp, «Thay thế», khôi phục, sửa tại chỗ, kể cả ngày xa — thì cặp đó được tính lại NGAY ở lần gọi kế tiếp, không chờ trần. Nhờ tầng này cứ 10 phút chỉ vài ngày gần nhất bị tính lại thay vì cả tháng (xem mục 2). Trần 6 giờ của ngày xa được xét khi đường chậm chạy (tối đa 10 phút một lần cho mỗi khung, hoặc ngay khi dấu hiệu DB đổi).
- Bắt được: thêm / xóa dòng, **sửa tại chỗ** giờ đến, XNĐ, KTT (kể cả bằng script ở tiến trình khác — `data_version` đổi). Không bắt được (giới hạn đã biết): dòng của CÙNG SHBG ở NGÀY KHÁC của cùng BCVH đổi (vì dòng đo không giới hạn theo ngày); chốt tuổi (10 phút ngày gần / 6 giờ ngày xa) bù lại.
- Ba route cũ (`/tong-hop`, `/luot`, `/theo-ngay`) vẫn dùng khóa theo dấu hiệu DB toàn cục như trước (mọi lần ghi làm mất cache); đổi sang chữ ký là việc sau nếu cần.

## 2. Số đo (DB giả trong bộ nhớ, máy dev, Node 24; 6 BCVH × 31 ngày × 1.500 SHBG/ngày = 279.000 lượt; I/O đĩa của DB thật chưa tính)
Kịch bản `QTG_PERF=1 node --test --test-name-pattern="đo lũy kế" tests/quy-thoi-gian-khoang-ngay.test.js` (ba lần chạy, lần đầu ghi ở bản chưa phân tầng tuổi, sau đó đo lại cả bảng):

| Tình huống `/luy-ke` (cả 6 BCVH, cả tháng) | Thời gian | Tính lại |
|---|---|---|
| Lạnh (chưa có cache) | 3.136 – 3.210 ms | 186 cặp |
| Nóng (dấu hiệu DB không đổi) | 0,4 – 0,6 ms | 0 |
| Chỉ ghi vào bảng phát (dữ liệu đến không đổi) | 290 – 329 ms | **0 cặp** (chỉ tính chữ ký) |
| MỘT (BCVH, ngày) đổi (thêm dòng) | 293 – 328 ms | **1 cặp** |
| Lõi không cache (đối chiếu) | 2.915 – 3.822 ms | — |

**Tầng tuổi cache (điểm 8)** — cùng dữ liệu, `now` giả để đi qua 10 phút / 6 giờ (ngày mới nhất 31/10: ngày gần = 28–31, 24 cặp; ngày xa = 1–27, 162 cặp). Lần chạy lạnh trong cùng ba lượt đo: 3.158 – 3.413 ms (186 cặp):

| Tình huống | Thời gian | Tính lại |
|---|---|---|
| Kết quả quá 10 phút, dữ liệu không đổi | 725 – 983 ms | **24 cặp** (chỉ ngày gần). Trước tầng tuổi: cả 186 cặp, khoảng 3,2 giây, cứ 10 phút một lần |
| Chữ ký của MỘT cặp ngày xa đổi (nạp / Thay thế) | 322 – 435 ms | **1 cặp**, phản ánh ngay ở lần gọi kế tiếp |
| Ngày xa chạm trần 6 giờ | 3.514 – 3.958 ms | 185 cặp (186 trừ cặp vừa tính lại); tối đa 1 lần / 6 giờ |

Mục tiêu của ticket: lạnh ≤ 5 giây, chỉ ghi bảng phát ≤ 0,5 giây — đạt. Phần chi phí còn lại của hai dòng giữa là truy vấn chữ ký (~0,3 giây); tính lại một cặp rất nhỏ so với đó.
Đo thêm `/tong-hop` lạnh 31 ngày tất cả BCVH (bộ dữ liệu khảo sát, 289.751 lượt gồm 10.751 lượt đến lại): 3.154 ms (khảo sát QUYTG-9-0 trước khi sửa: 3.336 ms trên 279.000 lượt). Để đạt mục tiêu đã tối ưu `quyCacChiTieu` ở `quyThoiGianNhom.js` (ngoài danh sách file của ticket, hành vi không đổi): đo thời gian thực MỘT lần thay vì ba lần cho ba chỉ tiêu (công thức `chiTieuGio × 3600 − thực` giữ nguyên, kết quả y hệt; 47 ca nhóm / lõi qua).

## 3. Test
`tests/quy-thoi-gian-khoang-ngay.test.js` (18 ca chạy + 1 ca đo `QTG_PERF=1`), đã thêm vào `npm test`: cộng từng ngày (SHBG đến lại, Σ ngày = tổng, `/summary` lệch đúng 1 lượt), lượt đến lại có hai mốc cách nhau > 7 ngày vẫn «nghi ngờ» ở khoảng nhiều ngày và không vào `chinh` / không bị tính hai lần, lượt đến lại mốc thường dùng chung dòng đo (pin hành vi hiện tại), xuyên BCVH trong ngày, dòng đo theo (SHBG, BCVH), trần 31 ngày ở cả ba route, `/luy-ke` (quyền, 400, tất cả BCVH và một BCVH, ngày thiếu file / dưới sàn / đang cập nhật, tỉ lệ cộng đếm, khớp `/theo-ngay` và lõi không cache, chưa có file, tháng trước), cache (lần hai không tính lại, ghi bảng phát, thêm dòng một cặp, sửa tại chỗ KTT, xóa dòng, tuổi tối đa theo tầng 10 phút / 6 giờ, trần khóa; nạp và «Thay thế» một ngày XA phản ánh ngay đúng một cặp, ghi không liên quan không tính lại), thông báo lỗi và `meta` dùng đúng tên «Thời gian Khai thác-Vận chuyển» (không có tên cũ).

## 4. Còn nợ / điều cần PO biết
**Đang chờ bản sao DB (chưa làm):**
1. **Lượt đến lại dùng cùng dòng đo với lần đến đầu** (XNĐ sớm nhất của SHBG ở BCVH đó, không giới hạn theo ngày). Hai lượt cùng SHBG có thể mang cùng một phép đo; nếu phép đo đó nghi ngờ (KTT cách XNĐ > 7 ngày) thì CẢ HAI lượt đều bị loại khỏi `chinh` (đúng yêu cầu: không tính hai lần vào `chinh`), nhưng `nghi_ngo` tính hai. Đo lượt đến lại bằng dòng của đúng lần đến cần quy tắc ghép lần đến ↔ dòng (chưa làm; cần tỉ lệ SHBG đến lại thật).
2. **Sàn 50**: BCVH nhỏ nhất (A Lưới) có thể có ngày dưới sàn dù đủ file (bị loại, `DUOI_SAN`); PO chỉnh khi có số thật.
3. Chưa đo trên DB thật; mọi số đo ở mục 2 là DB giả trong bộ nhớ.

**PO đã chấp nhận:**
4. Ở «Tất cả BCVH», `tong` của `/tong-hop` lọc trùng xuyên BCVH trong ngày còn lũy kế cộng từng BCVH (công thức A) — hai con số lệch nhau ở các SHBG đi qua hai BCVH cùng ngày (dashboard «đến» đo được ~0,7 %; ở màn này chưa đo).
5. **Chuyển cho 9c (giao diện):** `/summary` («Sản lượng đến») vẫn đếm mỗi SHBG MỘT lần trên cả khoảng, nên với khoảng nhiều ngày có thể NHỎ HƠN `tong.tong_shbg` của `/tong-hop` (khác nhau đúng số lượt đến lại). Không đặt hai số này cạnh nhau mà không chú thích; khoảng một ngày thì hai số bằng nhau.
6. Chữ ký của cặp (BCVH, ngày) không thấy thay đổi của dòng cùng SHBG ở ngày khác (xem 1.4); chốt tuổi 10 phút (ngày gần) / 6 giờ (ngày xa) bù lại.

**Để sau:**
7. Ba route cũ (`/tong-hop`, `/luot`, `/theo-ngay`) vẫn mất cache sau mọi lần ghi; chuyển sang chữ ký khi thấy chậm thật.
8. Khởi động nóng cho `/luy-ke` (tính sẵn sau khi khởi động máy chủ) — chưa làm; lần gọi lạnh đầu tiên chặn máy chủ ~3 giây (DB giả).

**Đã xử lý ở 9a:** điểm "cứ 10 phút tính lại cả tháng" — nay chỉ ngày gần nhất (tầng tuổi, mục 1.4); chữ ký đổi vẫn tính lại ngay kể cả ngày xa.

## 5. Docs cần đồng bộ sau (KHÔNG sửa ở 9a, tránh xung đột với QUYTG-8)
- `docs/ai/CHANGELOG_AI.md`: mục QUYTG-9a (đầu file).
- `docs/ai/00_SNAPSHOT.md`: dòng «Thời gian Khai thác-Vận chuyển» (API `tong-hop` / `luot` / `theo-ngay` / `luy-ke`; hiện snapshot chưa có dòng nào cho chức năng này), số ca test, ghi chú trần 31 ngày và cộng từng ngày.
- `docs/ai/03_ARCHITECTURE_MAP.md`: route `GET /api/arrivals/quy-thoi-gian/luy-ke`.
- `docs/ai/04_DECISIONS.md`: quyết định «cộng từng ngày», «trần 31 ngày», «sàn 50 và định nghĩa ngày có dữ liệu» (PO 23/10/2026).
