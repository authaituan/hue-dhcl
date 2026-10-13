# 🔎 DASH-6a — Khảo sát: «Hàng nặng» → «Hàng đi ngoài» và mốc «cùng thứ tuần trước»

> Chỉ khảo sát. Không sửa mã, test hay tài liệu nào khác; không có số hiệu bưu gửi / BD8 / BD10 đầy đủ (chỉ 6 ký tự đầu, kèm dấu `*`).
> Số đo trên **bản sao** DB dev (BCVH 533140, 27/09→10/10/2026, 32.880 dòng, 31.118 SHBG), mở chỉ đọc, đã xoá sau khi dùng.
> Quyết định của PO (13/10/2026): bỏ «Hàng nặng», thay bằng «Hàng đi ngoài» (BD8 trùng SHBG); bỏ «TB 4 tuần» / «mức bình thường»; chỉ còn hai mốc **hôm qua cùng giờ** và **cùng thứ tuần trước cùng giờ**, toàn site.

## 0. Tóm tắt
**Phát hiện chính**
1. «Hàng nặng» có **hai định nghĩa song song**: dashboard ≥ 2.000 g (`HANG_NANG_G`) và «Sản lượng đến» > 2.500 g (`heavy_g`, #37). Cả hai nằm ở backend + 4 màn giao diện; **xuất Excel không có cột nào liên quan** (chỉ cột `weight_g` ở tra cứu).
2. `scripts/survey-bd10.js` và `tests/survey-bd10.test.js` **đã dùng chữ «hàng nặng» cho đúng nghĩa «đi ngoài»** (BD8 = SHBG) — trùng tên, khác nghĩa; cần đổi nhãn cùng đợt.
3. «Hàng đi ngoài» ổn định tương đương hàng nặng: 12,6–32,4% mỗi ngày (TB 21,9%, CV 25,9%) so với hàng nặng ≥ 2 kg 12,1–37,0% (TB 23,1%, CV 31,5%). Định nghĩa khớp số của PO trên file mẫu 2 ngày (1.391 / 1.352 / 39 lẫn, 684 dòng BD8 rỗng). Hai khái niệm **gần như trùng nhau**: 89,3% hàng đi ngoài nặng ≥ 2 kg, 84,5% hàng nặng là đi ngoài.
4. Số «lẫn» nhỏ (155 SHBG, 2,3% số đi ngoài; 39 ở 02–03/10 đúng như PO): cùng một SHBG hiện **2 dòng trong cùng một file** (một dòng BD8 = SHBG kèm BD10 của TTKT, dòng kia BD8 rỗng hoặc BD8 của túi khác). Chọn «≥ 1 dòng» chỉ lệch ≤ 0,4 điểm so với «mọi dòng».
5. **Giao diện không còn gọi API 3e** (`/dashboard/overview|trend|wards-surge|center`) — chỉ dùng 3 API DASH-1. Toàn bộ logic «hàng nặng tăng ≥ 7 điểm» và «TB 4 tuần» của 3e là **mã không ai dùng** nhưng còn 17 khối test.
6. Trên dữ liệu dev, **«TB 4 tuần» = «cùng thứ tuần trước»** ở mọi ngày (`so_tuan` luôn = 1): đổi mốc **không làm đổi mức đánh giá nào**; khác biệt chỉ xuất hiện khi có ≥ 2 tuần lịch sử.
7. **Lỗi đang có ở DASH-1** (lộ ra khi đo): `mucSanLuong` không có sàn khối lượng. Hai ngày lẻ 27/09 và 29/09 (mỗi ngày 2 bưu gửi) làm 04/10 và 06/10 báo «XỬ LÝ NGAY» sai (+136.950% / +126.850%); và ngày 10/10 dữ liệu dở dang (244 SHBG đến 10:45) báo «XỬ LÝ NGAY» (−86%). Đổi sang mốc tuần trước **không tự sửa** các lỗi này; cần thêm chốt chặn (mục 5).

## 1. Việc 1 — Mọi chỗ dùng «hàng nặng»
| Loại | file:dòng | Mục đích |
|---|---|---|
| Backend tính | `server/lib/arrivalsQuery.js:36-41` | `HEAVY_THRESHOLD_G_DEFAULT = 2500`, MIN 500, MAX 30000 (#37) |
| | `:132-139`, `:182` | `parseHeavyG`, `f.heavyG` (tham số `heavy_g`) |
| | `:395`, `:403-405` | `/summary`: `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g` (SUM `weight_g > @heavy`) |
| | `:440-449`, `:479-484` | `byRoute`: `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g`, nhóm «chưa có tên» |
| | `:500-506` | `byService`: như trên + `khoi_luong_tb_g` |
| | `:761`, `:765` | export `HEAVY_THRESHOLD_G_*`, `parseHeavyG` |
| | `server/lib/dashboardDenQuery.js:5,81,130-137,226` | `volumeOf` đếm `weight_g >= HANG_NANG_G` và `weight_g > 0` (mẫu số); khoá `hang_nang{buu_gui,ty_le,mau_so,khong_co_khoi_luong,nguong_g}` ở `tong-quan-den` |
| | `server/config/dashboard-thresholds.js:10-11` | `HANG_NANG_G = 2000` |
| | `server/lib/dashboardQuery.js:27-28,31-32` (3e) | ngưỡng `hang_nang.trong_ngay_diem_pct = 7`, `heavy_g` |
| | `:102-105,214-228,243,259-260,270,293,303,328-329` | 3e `overview`: `hang_nang`, `ty_le_binh_thuong`, `nang_tuan`, tham số `heavy_g`, `nguong` |
| | `:166-189` | 3e `evaluateBcvh`: **loại việc `hang_nang`** («hàng nặng tăng ≥ 7 điểm so bình thường») |
| | `:435,449,461,468,491,505-514` | 3e `center`: `heavy_g`, `hang_nang` theo đường thư / dịch vụ, `nguong_hang_nang_g` |
| | `server/lib/phat.js:502,569` | chỉ truyền `heavyG` vào bộ lọc (trường bắt buộc của `buildCountedCte`, không dùng) |
| API | `server/routes/arrivals.js:54,71,72` | `/summary`, `/by-route`, `/by-service` nhận `heavy_g` |
| | `:81-84` | `/dashboard/overview`, `/trend`, `/wards-surge`, `/center` (3e) |
| | — | `viec-can-lam` (DASH-1) **không có** loại «hàng nặng»; loại này chỉ có ở `issues` của 3e `overview` |
| Giao diện | `src/components/arrivals/DailyOpsDashboard.jsx:426-440` | thẻ «HÀNG NẶNG (TỪ 2 KG TRỞ LÊN)»: tỷ lệ, số bưu gửi, «chưa có mốc khối lượng» |
| | `src/components/TiviView.jsx:233,515-525` | thẻ «Hàng nặng ≥ 2 kg», «chưa có khối lượng» |
| | `src/components/arrivals/ArrivalsOverview.jsx:36,64,75,158-161` | cột «Hàng nặng» (bảng theo ngày), thẻ «Hàng nặng» + «Tỉ trọng» |
| | `src/components/arrivals/ArrivalsRoutesServices.jsx:58-59,118-119,181,191,201` | biểu đồ cột chồng «Sản lượng thường / Hàng nặng», cột «Hàng nặng» đường thư |
| | — | **không UI nào gửi `heavy_g`** |
| Xuất file | `server/lib/arrivalsExport.js:18-28`, `:231-238`, `:276-287`, `server/lib/phatFile.js` | **không có** cột khối lượng / hàng nặng ở file thô (9 cột), «chưa nhận», «BD10 không XNĐ», file mẫu / lỗi PHAT |
| Dữ liệu | `src/components/arrivals/ArrivalsLookup.jsx:107-108` | hiển thị «Khối lượng (g)» của từng dòng (không phải hàng nặng) |
| Script | `scripts/survey-bd10.js:15,61,64-86,242-268` | «hàng nặng» = dòng BD8 = SHBG (**nghĩa khác, đúng nghĩa «đi ngoài»**) |
| Test | `tests/arrivals-api.test.js:88,379-451` | 6 khối: `hang_nang`, `heavy_g`, `/by-route`, `/by-service` |
| | `tests/dashboard-api.test.js:133-192,271-284,379-466…` | 10 khối chạm hàng nặng (3e) |
| | `tests/dashboard-den.test.js:56,136,161,166,177-178,220` | 3 khối (hằng số, `hang_nang`, ranh giới 1.999 / 2.000 / 2.001 g) |
| | `tests/bd10-api.test.js:211` | danh sách khoá cho phép có `heavy_g` |
| | `tests/survey-bd10.test.js:45,76` | chú thích «hàng nặng (BD8 = SHBG)» |
| Tài liệu | `docs/ai/04_DECISIONS.md:248-254,262,269,305,334,340-351,534,537,541` | #37, #38, #39, #45, #48, #73 |
| | `docs/ai/03_ARCHITECTURE_MAP.md:84-86,98,101-102,112`; `00_SNAPSHOT.md:31,48-49`; `05_BACKLOG.md:18,19,23`; `07_SANLUONG_AUDIT.md:169` | mô tả API / chỉ số / backlog |
| | `docs/ai/CHANGELOG_AI.md` (10 dòng) | lịch sử — không sửa |

**Lưu ý:** khối lượng (`weight_g`, `khoi_luong_g`, `khoi_luong_tb_g`, «Khối lượng (kg)») **không phải «hàng nặng»**; PO chưa nói bỏ — xem điểm quyết 2.

## 2. Việc 2 — Mọi chỗ dùng «TB 4 tuần» / «mức bình thường»
**LOGIC đánh giá mức (backend)**
| file:dòng | Nội dung |
|---|---|
| `server/config/dashboard-thresholds.js:17-21` | `LECH_SAN_LUONG {15, 25}`, `SO_TUAN_SO_SANH = 4` |
| `server/lib/dashboardDenQuery.js:91` | `sameWeekdays`: 4 ngày D−7k |
| `:96-103` | `mucSanLuong(hôm nay, tổng n tuần, n)`: ≥ 25% «Xử lý ngay», ≥ 15% «Trong ngày»; **không có sàn khối lượng** |
| `:133-148` | `volumeOf`: `weekVals`, `sum_tuan`, `so_tuan` (chỉ tuần có file OK) |
| `:191,196,224` | `muc_chi_tiet.san_luong`, `so_tb_4_tuan`, `so_tb_4_tuan_cung_thu` (tổng nhiều BCVH) |
| `:284-303` | `phuongXaTang`: `tb_4_tuan_cung_thu`, `so_tuan`, `lech_so_tb_pct` |
| `server/lib/dashboardQuery.js:26,34,38,131` (3e) | 15 / 25 %, `BASELINE_WEEKS = 4`, `WARD_SURGE.min_binh_thuong`, `sameWeekdayDays` |
| `:31-32,166-189` | `san_luong_toi_thieu {tb_4_tuan: 50}` (sàn 50 SHBG) + `evaluateBcvh`: **2 loại việc phụ thuộc baseline** (sản lượng thấp / cao; hàng nặng) |
| `:143-158` | `classifyDeviation` |
| `:190-203` | «hàng đến sau 15:00» và «xác nhận chậm» — **không** dùng baseline |
| `:242-329` | `overview`: `tb_4_tuan`, `so_tuan`, `it_du_lieu`, `lech_tb_pct`, `ty_le_binh_thuong`, tổng 6 BCVH |
| `:357-390`, `:403-424` | `trend` (TB 4 tuần theo giờ), `wardsSurge` (`tang_pct` so TB) |

**HIỂN THỊ so sánh (giao diện)**
| file:dòng | Nội dung |
|---|---|
| `src/components/arrivals/DailyOpsDashboard.jsx:395,401` | «… so TB 4 tuần» (tổng / BCVH đang chọn) |
| `:499`, `:720` | chú thích «mức bình thường của chính BCVH (trung bình 4 tuần cùng thứ, cùng giờ)» |
| `:631`, `:666-670` | cột «SO TB 4 TUẦN» bảng theo BCVH |
| `:958-961` | dòng nhỏ «so TB 4 tuần (N BG): x%» ở phường/xã |
| `:696-708` | nhãn **mức** «Bình thường» (tên mức, không phải baseline) |
| `:416-421` | `bcvh_can_chu_y` (đếm BCVH có mức ≠ bình thường — phụ thuộc mức sản lượng) |
| `src/components/TiviView.jsx:491-492` | chỉ so «hôm qua cùng giờ»; **không** hiển thị TB 4 tuần, **không** đọc `muc` theo BCVH |
| Màn «Sản lượng đến» (`Arrivals*.jsx`) | **không** có TB 4 tuần / bình thường |

**Test:** `tests/dashboard-api.test.js` (12 khối chạm baseline, 3e), `tests/dashboard-den.test.js:73,148-156,174-184,200,219-227,251,259` (5 khối). Các khớp còn lại («đăng nhập bình thường»…) là từ thường, không liên quan.
**Tài liệu:** `04_DECISIONS.md:284-291` (#42), `304-305` (#45), `324-351` (#48), `455`, `479`, `533-541` (#73); `03_ARCHITECTURE_MAP.md:98,100,102,104`; `00_SNAPSHOT.md:49`; `CHANGELOG_AI.md:190-191` (lịch sử).

## 3. Việc 3 — Đo «Hàng đi ngoài» (BCVH 533140)
**Định nghĩa đo:** SHBG khác nhau có ≥ 1 dòng với `upper(trim(bd8_no)) = upper(trim(tracking_no))`; mẫu số = SHBG đến ngày D (R2, loại trùng, `buildCountedCte`).

### 3.1 Theo ngày đến, cạnh «hàng nặng»
| Ngày (thứ) | SHBG đến | Đi ngoài | % | Nặng ≥ 2 kg | % | Nặng > 2,5 kg | % |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01/10 (T5) | 3.631 | 749 | 20,6 | 946 | 26,1 | 727 | 20,0 |
| 02/10 (T6) | 4.013 | 845 | 21,1 | 820 | 20,4 | 718 | 17,9 |
| 03/10 (T7) | 3.001 | 546 | 18,2 | 529 | 17,6 | 461 | 15,4 |
| 04/10 (CN) | 2.741 | 889 | 32,4 | 1.014 | 37,0 | 713 | 26,0 |
| 05/10 (T2) | 2.495 | 623 | 25,0 | 607 | 24,3 | 544 | 21,8 |
| 06/10 (T3) | 2.539 | 404 | 15,9 | 377 | 14,8 | 312 | 12,3 |
| 07/10 (T4) | 4.358 | 549 | 12,6 | 529 | 12,1 | 421 | 9,7 |
| 08/10 (T5) | 3.914 | 968 | 24,7 | 1.150 | 29,4 | 1.064 | 27,2 |
| 09/10 (T6) | 3.616 | 967 | 26,7 | 942 | 26,1 | 793 | 21,9 |
| 10/10 (T7)* | 244 | 90 | 36,9 | 82 | 33,6 | 65 | 26,6 |

\* 10/10 dữ liệu dở dang (đến 10:45), không dùng để thống kê. Cộng 01→09/10: 30.308 SHBG, **6.540 đi ngoài (21,6%)**.
Dao động 9 ngày đủ: đi ngoài TB 21,9%, độ lệch chuẩn 5,68 điểm, CV 25,9%; hàng nặng ≥ 2 kg TB 23,1%, độ lệch chuẩn 7,28, CV 31,5%; > 2,5 kg TB 19,1%, độ lệch chuẩn 5,58, CV 29,2%.

### 3.2 SHBG «lẫn»
Trên đúng tập của PO (dòng đến 02–03/10): **7.014 SHBG; ≥ 1 dòng trùng 1.391; mọi dòng trùng 1.352; lẫn 39; 684 dòng BD8 rỗng (BD10 cũng rỗng)** — khớp từng số.
Toàn bộ dữ liệu dev: 31.118 SHBG; ≥ 1 dòng trùng 6.843; mọi dòng trùng 6.688; **lẫn 155 (2,3% số SHBG đi ngoài)** — cùng cỡ (39 trên 7.014 ≈ 0,6%; 155 trên 31.118 ≈ 0,5%). 122 SHBG lẫn có ngày đến, 33 chưa có giờ đến.
Lẫn theo ngày đến: 01/10: 13 · 02/10: 24 · 03/10: 15 · 04/10: 14 · 05/10: 14 · 06/10: 9 · 07/10: 9 · 08/10: 1 · 09/10: 22 · 10/10: 1 (0,0–0,6 điểm của mỗi ngày).
**Các SHBG lẫn trông ra sao:** 154/155 chỉ có dòng ở **một** file nạp, và dòng «khác» luôn nằm **cùng file** với dòng trùng → cùng một bưu gửi xuất hiện **2 dòng trong cùng một file**. Kiểu: trùng + rỗng 87 · trùng + BD8 khác 57 · 2 trùng + rỗng 5 · trùng + khác + rỗng 3 · 2 trùng + khác 2 · 2 trùng + 3 khác 1. Dòng trùng mang BD10 của TTKT (`530100*`), dòng còn lại BD10 rỗng hoặc BD10 của túi khác; cùng khối lượng, cùng giờ đến. 51/65 dòng «BD8 khác» là túi chứa nhiều SHBG (trung vị 16, lớn nhất 166); 14 là túi chỉ có chính SHBG đó.
5 ví dụ (đã ẩn): `CE2947*` (2 dòng: =SHBG kèm BD10 `530100*` ; BD8 rỗng, BD10 rỗng; dịch vụ C/B) · `ED5277*` (BD8 rỗng ; =SHBG kèm `530100*`) · `CD5390*` (=SHBG ; rỗng ; túi `531120*` 2 SHBG) · `CG4407*` (=SHBG ; túi `533140*` 38 SHBG, BD10 `533140*`) · `EO4350*` (túi `550915*` 2 SHBG ; =SHBG kèm `530100*`).
**Biến thể định nghĩa (01→09/10, 30.308 SHBG):** «≥ 1 dòng của SHBG» **6.540**; «chỉ dòng có `arrival_date` = ngày xét» 6.540; «chỉ dòng đại diện (id nhỏ nhất)» 6.485 (−55); «mọi dòng đều trùng» 6.419 (−121). Chênh ≤ 0,4 điểm.

### 3.3 BD8 rỗng
Toàn dev: **1.569 dòng BD8 rỗng, cả 1.569 đều BD10 rỗng** (0 dòng có BD10); mỗi SHBG có đúng 1 dòng rỗng. Trong 1.569: **1.290** mọi dòng rỗng + 184 còn dòng BD8 khác (không trùng) → **không đi ngoài (xác nhận)**; **95** còn dòng BD8 = SHBG → vẫn đi ngoài vì có dòng trùng (chính là nhóm lẫn «trùng + rỗng»).

### 3.4 Chéo (SHBG đến 01→09/10, 30.308; khối lượng của dòng đại diện)
| | Nặng ≥ 2 kg | Nhẹ < 2 kg | Tổng |
|---|---:|---:|---:|
| **Đi ngoài** | 5.841 | 699 | 6.540 |
| Không đi ngoài | 1.073 | 22.695 | 23.768 |

89,3% hàng đi ngoài nặng ≥ 2 kg; 4,5% hàng không đi ngoài nặng ≥ 2 kg; 84,5% hàng nặng ≥ 2 kg là đi ngoài. Khối lượng trung vị: đi ngoài 5.000 g, không đi ngoài 50 g.
| `Dich_vu_code` | SHBG | Đi ngoài | % |
|---|---:|---:|---:|
| R | 19.596 | 24 | 0,1 |
| C | 5.764 | 5.094 | 88,4 |
| E | 2.303 | 1.397 | 60,7 |
| B | 1.351 | 25 | 1,9 |
| M | 1.290 | 0 | 0,0 |
| (rỗng) | 4 | 0 | 0,0 |

### 3.5 Kết luận về tính hợp lý
Định nghĩa cho số **ổn định như hàng nặng** (CV 25,9% so với 31,5%; độ lệch chuẩn 5,7 điểm so với 7,3), không ngày nào bất thường về cách tính; phần «lẫn» nhỏ và hiểu được. Hai điều nên biết, **không tự sửa**: (a) tỷ lệ phụ thuộc mạnh vào **tỷ trọng dịch vụ C và E** (R, B, M gần như không bao giờ đi ngoài), nên ngày nhiều thư thường (R) tỷ lệ tụt — 07/10 chỉ 12,6% dù 549 SHBG đi ngoài bình thường; (b) hàng đi ngoài **gần như trùng** hàng nặng cũ (tương quan 84–89%), nên đổi tên không làm đổi bức tranh vận hành nhiều. Chi phí truy vấn nhỏ: 1 ngày (3.914 SHBG) 10 ms so với 6,5 ms của hàng nặng; `tong-quan-den` hiện 56 ms.

## 4. Việc 4 — Mốc so sánh mới (BCVH 533140, lũy kế tới cùng giờ)
«Cùng giờ» = giờ đến lớn nhất của ngày D (`den_luc`), áp cho cả hôm qua và tuần trước.
| Ngày (thứ) | Cùng giờ | Hôm nay | Hôm qua (%) | Tuần trước (%) | TB 4 tuần [số tuần] (%) | Mức hiện tại | Nếu mốc = tuần trước | Nếu mốc = hôm qua |
|---|---|---:|---|---|---|---|---|---|
| 01/10 (T5) | 18:35 | 3.631 | thiếu | thiếu | — | không đánh giá | không đánh giá | không đánh giá |
| 02/10 (T6) | 18:57 | 4.013 | 3.631 (+10,5) | thiếu | — | không đánh giá | không đánh giá | bình thường |
| 03/10 (T7) | 18:58 | 3.001 | 4.013 (−25,2) | thiếu | — | không đánh giá | không đánh giá | **XỬ LÝ NGAY** |
| 04/10 (CN) | 18:31 | 2.741 | 2.993 (−8,4) | **2** (+136.950) | 2 [1] | **XỬ LÝ NGAY** ✗ | XỬ LÝ NGAY ✗ | bình thường |
| 05/10 (T2) | 18:46 | 2.495 | 2.741 (−9,0) | thiếu | — | không đánh giá | không đánh giá | bình thường |
| 06/10 (T3) | 19:00 | 2.539 | 2.495 (+1,8) | **2** (+126.850) | 2 [1] | **XỬ LÝ NGAY** ✗ | XỬ LÝ NGAY ✗ | bình thường |
| 07/10 (T4) | 18:15 | 4.358 | 2.536 (+71,8) | thiếu | — | không đánh giá | không đánh giá | **XỬ LÝ NGAY** |
| 08/10 (T5) | 18:04 | 3.914 | 4.357 (−10,2) | 3.596 (+8,8) | 3.596 [1] (+8,84) | bình thường | bình thường | bình thường |
| 09/10 (T6) | 18:31 | 3.616 | 3.914 (−7,6) | 4.008 (−9,8) | 4.008 [1] (−9,78) | bình thường | bình thường | bình thường |
| 10/10 (T7) | 10:45 | 244 | 2.359 (−89,7) | 1.788 (−86,4) | 1.788 [1] (−86,35) | **XỬ LÝ NGAY** ✗ | XỬ LÝ NGAY ✗ | XỬ LÝ NGAY ✗ |

(✗ = báo sai do dữ liệu, xem dưới.)
1. **Ngày có cặp «cùng thứ tuần trước»:** có file ở cả hai ngày: 04/10, 06/10, 08/10, 09/10, 10/10. Cặp **thật** chỉ 08/10↔01/10, 09/10↔02/10 và 10/10↔03/10; hai cặp 04/10 và 06/10 ghép với hai ngày lẻ 27/09 và 29/09 (mỗi ngày **2 SHBG**, không phải dữ liệu thật).
2. **TB 4 tuần = tuần trước** ở cả 5 ngày có cặp (`so_tuan` = 1): mức đánh giá **không đổi** khi thay mốc. Trên dev không thể thấy khác biệt thật của hai cách; chỉ lộ khi có ≥ 2 tuần.
3. Cả tuần trước lẫn TB 4 tuần đều cho kết quả sai ở 3 ngày: 04/10 và 06/10 (mẫu số 2 → +136.950% và +126.850%) và 10/10 (dữ liệu dở dang). Mốc hôm qua cho 2/8 ngày vượt 15% (03/10: T7 sau T6; 07/10: sau ngày thấp), tức báo «Xử lý ngay» do **hiệu ứng thứ trong tuần**, không phải bất thường — không phù hợp để đánh giá tự động.
4. **Ngày lẻ / bất thường ở tuần trước.** Dữ liệu 04/10 (CN) có đáy giữa trưa (giờ 11–13h chỉ 22 và 3 SHBG so với 982 lúc 14h) — chính là «khoảng trống Chủ nhật 04/10» đã ghi. Hàng đến theo **sóng** (đỉnh quanh 07–08h và 13–15h; vd 03/10: 1.012 và 599 SHBG ở giờ 07–08, nhưng 136 / 965 ở giờ 13–14), nên lũy kế «đến cùng giờ» rất nhạy với việc sóng rơi trước hay sau mốc cắt. Ngày 10/10 chỉ có 145 + 95 SHBG ở giờ 07–08 (các ngày khác 500–1.700): file chưa đủ. Cách xử lý hợp lý, theo thứ tự: (a) **sàn so sánh**: số cùng giờ của tuần trước < ngưỡng (đề xuất 50 BG, tái dùng sàn 50 của 3e) ⇒ không đánh giá; (b) **giờ bắt đầu đánh giá** (đề xuất 12:00) ⇒ trước đó chỉ hiển thị số, không gắn mức; (c) nếu muốn xử lý lễ / nghỉ: một danh sách «ngày không dùng làm mốc» do ADMIN nhập (không tự đoán bằng thống kê).

## 5. Việc 5 — Đề xuất thiết kế DASH-6b (chỉ viết, chưa code)
### 5.1 Khoá API
Đề xuất **đổi tên hẳn, không giữ khoá cũ** (chỉ có giao diện của chính hệ thống dùng; giữ hai khái niệm song song sẽ mâu thuẫn quyết định của PO). Tivi tải lại trang mỗi 6 giờ: bản JS cũ gặp API mới chỉ hiện «—» ở thẻ, không lỗi (đã dùng `?.`).
| Hiện tại | Đề xuất |
|---|---|
| `tong-quan-den.hang_nang {buu_gui, ty_le, mau_so, khong_co_khoi_luong, nguong_g}` | `hang_di_ngoai {buu_gui, ty_le, mau_so}` (`mau_so` = `san_luong.buu_gui`); bỏ `khong_co_khoi_luong`, `nguong_g` |
| `san_luong.so_tb_4_tuan_cung_thu {gia_tri, chenh_pct, so_bcvh}` | `san_luong.so_tuan_truoc_cung_gio {gia_tri, chenh_pct, so_bcvh}` |
| `theo_bcvh[].so_tb_4_tuan {gia_tri, chenh_pct, so_tuan}` | `theo_bcvh[].so_tuan_truoc {gia_tri, chenh_pct}` |
| `phuong-xa-tang.tb_4_tuan_cung_thu`, `so_tuan`, `lech_so_tb_pct` | `tuan_truoc_cung_gio`, `lech_so_tuan_truoc_pct` |
| `theo_bcvh[].muc_chi_tiet.san_luong` | giữ tên; `null` khi thiếu tuần trước hoặc dưới sàn |
| `/summary`: `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g` + tham số `heavy_g` | `hang_di_ngoai`, `ty_le_hang_di_ngoai`; **bỏ** `heavy_g` (gửi tham số này sẽ nhận 400; không UI nào gửi) |
| `/by-route`, `/by-service`: `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g` | `hang_di_ngoai`, `ty_le_hang_di_ngoai`; giữ `khoi_luong_tb_g` nếu PO giữ khối lượng |
| API 3e (`overview`, `trend`, `wards-surge`, `center`) | **xoá** (không UI nào gọi) — xem điểm quyết 5 |
Giao diện: `DailyOpsDashboard.jsx`, `TiviView.jsx` đổi thẻ 3 thành «Hàng đi ngoài» (tỷ lệ + số bưu gửi) và nhãn «so tuần trước»; `ArrivalsOverview.jsx`, `ArrivalsRoutesServices.jsx` đổi cột / thẻ / biểu đồ «Hàng nặng» thành «Hàng đi ngoài».
### 5.2 Ngưỡng «hàng đi ngoài»
Hiện **không có luật nào** gắn mức cho hàng nặng ở giao diện DASH-1 (luật «tăng ≥ 7 điểm» chỉ ở 3e, không dùng). Căn cứ số đo: độ lệch chuẩn theo ngày 5,7 điểm; chênh cùng thứ giữa hai tuần: 08/10 so 01/10 **+4,1 điểm** (24,7 so 20,6), 09/10 so 02/10 **+5,6 điểm** (26,7 so 21,1). Chỉ 2 cặp nên chưa đủ để hiệu chỉnh. Đề xuất đặt ở `server/config/dashboard-thresholds.js`:
- `HANG_DI_NGOAI: { trong_ngay_diem: 8 }` (≈ 1,4 độ lệch chuẩn) — **chỉ áp khi** có tuần trước và mẫu số cùng giờ ≥ sàn; phương án an toàn hơn là **chỉ hiển thị** đến khi có ≥ 4 tuần dữ liệu thật (điểm quyết 4).
- Bỏ `HANG_NANG_G`, `SO_TUAN_SO_SANH`; thêm `SAN_SO_SANH_TOI_THIEU: 50`, `GIO_BAT_DAU_DANH_GIA: 12`.
### 5.3 Thiếu dữ liệu tuần trước
Không đánh giá lệch: `muc_chi_tiet.san_luong = null`, `so_tuan_truoc = null`, giao diện ghi «chưa đủ dữ liệu so tuần trước». Cùng cách khi tuần trước dưới sàn (có file nhưng thưa) — sửa luôn lỗi 04/10 và 06/10. Không còn `so_tuan`, `it_du_lieu`.
### 5.4 Màn «Sản lượng đến» và xuất Excel
- `ArrivalsOverview.jsx`: cột «Hàng nặng» (bảng theo ngày) và thẻ «Hàng nặng» + «Tỉ trọng» → «Hàng đi ngoài». `ArrivalsRoutesServices.jsx`: biểu đồ «Sản lượng thường / Hàng nặng» → «Còn lại / Hàng đi ngoài», cột «Hàng nặng» → «Hàng đi ngoài».
- **Xuất Excel: không đổi** (không có cột hàng nặng ở file nào). Nếu PO muốn thêm cột «Đi ngoài» vào file thô / danh sách, đó là ticket riêng.
- `scripts/survey-bd10.js` và `tests/survey-bd10.test.js`: đổi nhãn «hàng nặng» → «hàng đi ngoài» (chú thích và tiêu đề bảng), không đổi logic.
### 5.5 Ước lượng DASH-6b
- **Sửa mã:** server — `arrivalsQuery.js`, `dashboardDenQuery.js`, `config/dashboard-thresholds.js`, `routes/arrivals.js`; xoá / dọn `dashboardQuery.js` (giữ `DASHBOARD_BCVH`, `bcvhNames` vì nơi khác dùng); `phat.js` (bỏ trường `heavyG`, không bắt buộc). Giao diện — `DailyOpsDashboard.jsx`, `TiviView.jsx`, `ArrivalsOverview.jsx`, `ArrivalsRoutesServices.jsx`. Script — `survey-bd10.js`. Khoảng **12–13 file mã**.
- **Test:** `arrivals-api` 6 khối; `dashboard-den` 6 (kể cả ranh giới 1.999 / 2.000 / 2.001 g thành ca đi ngoài); `bd10-api` 1; `survey-bd10` (chú thích); `dashboard-api` **17 khối** — nếu xoá 3e thì xoá cả file test (21 khối) thay vì sửa. Thêm khoảng 8–10 ca mới (định nghĩa đi ngoài: trùng chuẩn hoá, ≥ 1 dòng, BD8 rỗng không tính, lẫn; sàn so sánh; giờ bắt đầu; thiếu tuần trước). Tổng **~30 khối sửa / ~10 ca thêm**.
- **Tài liệu:** quyết định mới #76 sửa #37, #38, #42, #45, #48, #73; `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`, `05_BACKLOG.md`, `CHANGELOG_AI.md`.
- **Rủi ro:** (1) lỗi sàn / dữ liệu dở dang đã nêu ở mục 4 phải sửa cùng đợt, nếu không mức vẫn báo sai; (2) xoá 3e là thay đổi lớn nhưng không ai gọi — cần PO xác nhận; (3) tivi cũ giữ bản JS đến 6 giờ; (4) chưa có dữ liệu ≥ 2 tuần nên khó hiệu chỉnh ngưỡng mới; (5) chi phí truy vấn tăng không đáng kể (10 ms / ngày).
- **Thời gian:** khoảng 1–1,5 ngày làm việc, nên tách 2 chặng (backend + test; giao diện + tài liệu).

## 6. Điểm PO cần quyết (khuyến nghị đứng đầu)
1. **Định nghĩa «đi ngoài»:** ≥ 1 dòng BD8 = SHBG (**khuyến nghị**, 6.540) · mọi dòng trùng (6.419) · chỉ dòng đại diện (6.485).
2. **Khối lượng:** giữ «Khối lượng (kg)» / «khối lượng TB» / tra cứu (**khuyến nghị**) hay bỏ cùng «hàng nặng».
3. **Mốc đánh giá sản lượng lệch (15% / 25%):** cùng thứ tuần trước + sàn 50 BG + chỉ đánh giá từ 12:00 + thiếu tuần trước thì «chưa đủ dữ liệu» (**khuyến nghị**) · hôm qua (không khuyến nghị: báo sai do hiệu ứng thứ).
4. **Hàng đi ngoài có gắn mức không:** chỉ hiển thị (**khuyến nghị đến khi ≥ 4 tuần dữ liệu thật**) · hoặc tăng ≥ 8 điểm so tuần trước ⇒ «Trong ngày».
5. **API 3e (`overview`, `trend`, `wards-surge`, `center`):** xoá cùng 21 khối test (**khuyến nghị**, mã không được dùng) · hoặc sửa theo khái niệm mới (tốn thêm ~17 khối).
6. **Khoá API:** đổi tên hẳn (**khuyến nghị**) · giữ khoá cũ một giai đoạn.
7. **Xuất Excel:** không đổi (**khuyến nghị**) · thêm cột «Đi ngoài» (ticket riêng).
8. **Nhãn mức «Bình thường»:** giữ làm tên mức (**khuyến nghị**) — chỉ bỏ cụm «mức bình thường» với nghĩa mốc so sánh.
9. **Ngày không dùng làm mốc (lễ, nghỉ):** để sau, làm danh sách do ADMIN nhập (**khuyến nghị**) · hoặc làm ngay ở DASH-6b.

## 7. Điều chưa chắc
- Dữ liệu dev chỉ **10 ngày thật, một BCVH**; mỗi thứ trong tuần chỉ có 1–2 mẫu nên **chưa tách được hiệu ứng thứ**; mọi ngưỡng trong mục 5 là suy luận từ 9 ngày.
- Chưa kiểm định nghĩa «đi ngoài» trên BCVH khác. Mã dịch vụ (C, E, R, B, M) chưa tra danh mục nên chỉ mô tả bằng số.
- Cơ chế nạp (số file / ngày, độ trễ XN) chưa rõ; vì vậy chưa biết «12:00» là giờ bắt đầu đánh giá hợp lý hay cần muộn hơn.
- Số khối test là ước lượng bằng tìm chuỗi; chưa mở từng khối để phân loại sửa hay xoá.
- Giao diện chưa chạy thử; mô tả giao diện dựa trên đọc mã.

## 8. Phụ lục — cách đo (tái lập)
- Bản sao `data/hue-dhcl.db` (+ `-wal`, `-shm`) ra thư mục tạm ngoài repo, mở chỉ đọc; dùng trực tiếp `buildCountedCte` / `windowFilter` / `runCounted` (không nạp `server/db.js`).
- Đi ngoài: `EXISTS (SELECT 1 FROM arrival_items b WHERE b.tracking_no = s.tracking_no AND upper(trim(b.bd8_no)) = upper(trim(b.tracking_no)))` trên CTE `s` (mỗi ngày một khoảng 00:00 → 23:59:59).
- So sánh «cùng giờ»: `windowFilter(BCVH, ngày, cut)` với `cut` = giờ của `MAX(arrival_at)` ngày D, áp cho D, D−1, D−7; mức = `mucSanLuong(hôm nay, mốc, 1)` (ngưỡng 15 / 25).
