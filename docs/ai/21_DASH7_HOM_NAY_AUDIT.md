# DASH-7a — Khảo sát «hôm nay» và «cùng giờ» ở màn «Điều hành hôm nay» (CHỈ ĐỌC)

> Nền: `main` = `274cfd4`, thư mục `D:\Dev\hue-dhcl`. Chỉ đọc mã. Không mở DB, không gọi API, không chạy server. Số liệu PO nêu trong ticket (7.133 / 7.077 / 56…) là
> quan sát của PO, không phải số đo của báo cáo này. Chỗ nào không chắc: «chưa kiểm chứng». Đường dẫn dưới đây tính từ gốc repo.

## Việc 1 — «Hôm nay» được định nghĩa thế nào
Đường đi: thẻ «SẢN LƯỢNG ĐẾN HÔM NAY» (`src/components/arrivals/DailyOpsDashboard.jsx:407-418`) ← `GET /api/arrivals/dashboard/tong-quan-den?bcvh=…` (`DailyOpsDashboard.jsx:154`; **không gửi `date`**) ←
`server/routes/arrivals.js:99` → `tongQuanDen` (`server/lib/dashboardDenQuery.js:195`).

- **Ngày tham chiếu KHÔNG lấy từ đồng hồ máy.** Không có `new Date()`/`Date.now` nào trong `server/lib/dashboardDenQuery.js` (đã `grep`). Mỗi BCVH có một ngày riêng: `day = date || aq.latestFileDate(db, [ma], byUnit)` (`dashboardDenQuery.js:77`).
- `latestFileDate` = **`MAX(file_date)` của file nhập có `status = 'OK'`** theo `unit_code` (`server/lib/arrivalsQuery.js:292-300`) — là ngày trong TÊN FILE, không phải ngày đến của dòng. File rỗng (`EMPTY`) không tính.
- `date` chỉ có nếu client truyền (`parseParams`, `dashboardDenQuery.js:49-70`); thẻ điều hành và tivi không truyền; chỉ các nút «đi tới» truyền `item.ngay` sang màn khác (`DailyOpsDashboard.jsx:270-283`).
- **`den_luc`** của mỗi BCVH = `MAX(arrival_at)` của `arrival_items` có `receiver_code = ma AND arrival_date = day` (`dashboardDenQuery.js:79`). Giá trị đầu trang (`den_luc` ở gốc phản hồi) = `den_luc` lớn nhất trong các BCVH (`headerOf`, `:181,187`). Đây là giờ trong DỮ LIỆU (giờ đến BCVH), không phải giờ nhập hay giờ máy chủ.
- Nhánh quyết định:
  - BCVH chưa có file OK nào → `day = null` → hàng `co_du_lieu: false`, 0 bưu gửi, không so sánh (`:78`, `:203-209`).
  - Có file OK nhưng ngày đó chưa có dòng nào (`denLuc` null) → `cut = null` → `volumeOf` trả `{luot:0, buu_gui:0, hom_qua:null, tuan_truoc:null}` (`:157`, `:79-80`). Nghĩa là **hiện 0, không lùi về ngày trước**.
  - Ngày của đồng hồ chưa có file → mã **không biết**: vẫn dùng ngày file OK mới nhất (có thể là hôm qua). Vì vậy 16/10 08:30 vẫn hiện số của 15/10.
- `ngay_du_lieu` (ngày lớn nhất trong các BCVH) và `cung_ngay_du_lieu` (`:185-186`), từng hàng `ngay_du_lieu` (`:202`) **đã được API trả sẵn nhưng giao diện không dùng** (`grep ngay_du_lieu src` chỉ có ở `ArrivalsBd10Status.jsx`).

## Việc 2 — «Cùng giờ»
- Cắt: `cut = den_luc` của BCVH **ngày tham chiếu** (`:80`: `slice(11,19)` = `HH:MM:SS`), áp cho cả ngày hôm nay và hai mốc: `windowFilter(ma, day, cut)` → `[day 00:00:00, day cut]` theo `arrival_at` (`:91-94`, `:168-169`).
- Mốc: `y = day − 1`, `w = day − 7` (`:163-164`) — mỗi BCVH tự tính theo `day` của nó.
- Thiếu mốc: chỉ khi BCVH **không có file OK với `file_date` = y (hoặc w)** (`filesPresent`, `:84-88`, `:165`) thì mốc = `null` (không phải 0); có file mà không có dòng thì mốc = 0 → `chenh_pct` null do sàn 50 (`mocDuLon`, `:34`, `TH.SAN_SO_SANH_TOI_THIEU`). Lưu ý: điều kiện «có mốc» xét theo file có `file_date` = ngày mốc, nhưng số đếm lại lấy theo `arrival_date` của dòng (có thể nằm ở file của ngày khác).
- Tổng Toàn Trung tâm: `sanLuongVs` (`:235-240`) chỉ cộng **các BCVH có mốc** (`set = vs.filter(v => v[key] !== null)`), và so với đúng tử số của tập BCVH đó: `pctVsMoc(sum(set, v.buu_gui), ref)`. Phản hồi có `so_bcvh` (số BCVH tham gia) nhưng giao diện không hiện (`grep so_bcvh src`: không có).
- **Giải thích «+0,6%» khi 14/10 chỉ có file của Thuận Hóa:** bằng mã, đây là so sánh CHỈ trên Thuận Hóa (`so_bcvh = 1`), không phải toàn Trung tâm; nhãn «so hôm qua cùng giờ» không nói điều đó. Tương tự «−0,8% so tuần trước» là so trên tập BCVH có file ngày 8/10 (chưa kiểm chứng tập nào). Khả năng này khớp với lưới nạp bạn mô tả; chưa kiểm chứng bằng số đo.
- `viecCanLam` / `phuongXaTang` dùng cùng `bcvhContext` + `windowFilter` (`:278-352`), nên cùng quy ước.

## Việc 3 — 7.133 so với 7.077
**Hai công thức khác nhau (xác nhận bằng mã):**

| | Thẻ «Điều hành hôm nay» (tong-quan-den) | Màn «Sản lượng đến», thẻ tổng (`/arrivals/summary`) |
|---|---|---|
| Cách gộp | **Mỗi BCVH một CTE riêng** (`receiverCodes: [ma]`, `dashboardDenQuery.js:91-94`, `volumeOf :158-160`) rồi **cộng số** (`sum(vs, v => v.buu_gui)`, `:231`) | **MỘT CTE** với `receiver_code IN (6 mã)` (`arrivalsQuery.js:212-257`, `summary :373-386`, `COUNT(*) FROM s`) |
| Đơn vị đếm | SHBG khác nhau **trong từng BCVH** | SHBG khác nhau **xuyên BCVH** (`firsts … GROUP BY tracking_no`, `:240-244`) |
| «Ngày đến» mỗi SHBG | `arrival_date = day` của BCVH, lần đến sớm nhất trong BCVH | lần đến sớm nhất trong khoảng lọc trên mọi BCVH được chọn |
| Cắt giờ | `00:00 → MAX(arrival_at)` của ngày (gồm hết dòng của ngày) | `from → to` của bộ lọc |
| Lọc | 6 BCVH (`BCVH_CODES`, `:20`) | `receiver_code` của bộ lọc (mặc định 6 BCVH, `ArrivalsView.jsx:54-60`) |

- **Bảng «So sánh các BCVH» cộng bằng cách khác thẻ tổng:** `ArrivalsOverview.jsx:14-42` gọi `/api/arrivals/summary` **mỗi BCVH một lần** (`q.set('receiver_code', code)`) rồi hiển thị từng dòng; thẻ tổng của màn «Sản lượng đến» là một lần gọi 6 mã. Cộng các dòng bảng = công thức «từng BCVH» = thẻ điều hành → 7.133, đúng quan sát PO.
- Mẫu số «Xử lý và tỷ lệ phát» cũng cộng theo BCVH: `ketQuaPhat` lặp từng BCVH (`phatDashboard.js:62-63`, `phat.js:574-589` `demNgay` dùng `windowFilter(bcvh, day, '23:59:59')`), cộng `congMap` → 7.133. Cộng 4 khung giờ cũng từ cùng nguồn.
- Hàng đi ngoài, túi/kiện, khối lượng cùng cơ chế: `DI_NGOAI_SQL` kiểm theo SHBG toàn dữ liệu (`arrivalsQuery.js:39-40`) nhưng chỉ tính cho SHBG đại diện của CTE; `COUNT(DISTINCT bd8_no)` và `SUM(weight_g)` cũng chạy trên `s`. Chênh 1.943/1.951, 2.246/2.259, 16.260,8/16.347,5 đều nhất quán với «cộng theo BCVH > đếm khác nhau xuyên BCVH».
- **Giả thuyết chênh 56:**

| Giả thuyết | Khả dĩ? | Lý do trong mã |
|---|---|---|
| SHBG xuất hiện ở ≥2 BCVH được đếm 2 lần ở bên cộng theo BCVH, 1 lần ở bên xuyên BCVH | **CÓ** | Hai cách gộp ở bảng trên. Chênh = Σ (số BCVH − 1) trên các SHBG đó |
| Khác mốc giờ cắt | KHÔNG | `cut = MAX(arrival_at)` của ngày nên gồm mọi dòng; khoảng lọc 15–15 cũng cả ngày |
| Khác cách chọn «ngày đến» | KHÔNG (với khoảng 1 ngày) | Cả hai đều `arrival_date` + `arrival_at` (`DATE_BASES.arrival`, `arrivalsQuery.js:13-15`); một ngày thì không có lựa chọn sớm nhất ở ngày khác trong khoảng. Sẽ KHÁC khi khoảng nhiều ngày |
| Khác loại dòng (file lỗi, EMPTY) | KHÔNG | `buildCountedCte` không lọc trạng thái file ở cả hai nơi |
| Khác tập BCVH | ÍT KHẢ DĨ | Cả hai 6 mã; chỉ khác nếu `exportScope` rút gọn (`ArrivalsView.jsx:54-56`, vai trò GDVH) |

Kết luận bằng mã: nguyên nhân khả dĩ duy nhất là **gộp theo BCVH so với đếm khác nhau xuyên BCVH**. Con số 56 và lý do (cùng BD10/BD8 ở 2 BCVH, hàng hoàn…) là «cần số đo trên bản sao DB». Truy vấn chỉ đọc cần chạy khi có bản sao (chưa chạy; chỉ in số đếm, không in SHBG):
1. `SELECT COUNT(*) AS so_shbg, SUM(n-1) AS chenh FROM (SELECT tracking_no, COUNT(DISTINCT receiver_code) n FROM arrival_items WHERE arrival_date='2026-10-15' AND receiver_code IN (<6 mã>) GROUP BY tracking_no HAVING n>=2);` — kỳ vọng `chenh` = 56.
2. Số cặp BCVH: cùng nguồn, `GROUP BY` tổ hợp `group_concat(DISTINCT receiver_code)` → đếm theo tổ hợp.
3. Phân loại lý do: với các SHBG ở bước 1, đếm theo `(bd10_no <> '', bd8_no <> '', cùng bd10_no giữa 2 BCVH, trim(bd8_no)=trim(tracking_no))`.

## Việc 4 — Chỗ giao diện ghi «hôm nay»/«Hôm nay» cho số liệu đến
API đã trả sẵn: tong-quan-den: `ngay_du_lieu`, `cung_ngay_du_lieu`, `den_luc`, từng hàng `ngay_du_lieu`/`den_luc`; phuong-xa-tang: từng item `ngay` (`dashboardDenQuery.js:339`) + header; viec-can-lam: từng item `ngay` (`:287`) + header; ket-qua-phat: `ngay`, `cung_ngay`, `so_lieu_den_luc_bangkok` (`phatDashboard.js:92-101`). Chưa có: không trường nào còn thiếu cho nhãn «dd/mm · đến hh:mm»; chỉ cần giao diện đọc. Riêng khi BCVH khác ngày nhau (`cung_ngay_du_lieu = false`), nhãn chung cần quy ước (ghi ngày lớn nhất + «từng BCVH có thể khác ngày»).

| file:dòng | Chuỗi hiện tại | Ngày / `den_luc` có sẵn? |
|---|---|---|
| `src/components/arrivals/DailyOpsDashboard.jsx:367-368` | «Cần điều hành ngay hôm nay» (tiêu đề) | Có (`ngay_du_lieu`, `den_luc` ở tongQuan) |
| `…DailyOpsDashboard.jsx:375` | «Trực tiếp · Dữ liệu đến hh:mm» (không có ngày) | `den_luc` có; thiếu hiển thị ngày |
| `…DailyOpsDashboard.jsx:412` | «SẢN LƯỢNG ĐẾN HÔM NAY» / «BƯU GỬI ĐẾN BCVH HÔM NAY» | Có |
| `…DailyOpsDashboard.jsx:435,437,441,443` | «so hôm qua cùng giờ», «so tuần trước» | Có; nên kèm `so_bcvh` (đã có ở `san_luong.so_*_cung_gio.so_bcvh`) |
| `…DailyOpsDashboard.jsx:479` | «… bưu gửi hôm nay» (hàng đi ngoài) | Có |
| `…DailyOpsDashboard.jsx:500` | «… bưu gửi hôm nay · khó phát hết trong ngày» | Có |
| `…DailyOpsDashboard.jsx:538` | «Hôm nay chưa có việc cần điều hành» | Có |
| `…DailyOpsDashboard.jsx:623-625` | «Hôm nay theo từng BCVH» + «… tới {den_luc}» | Có |
| `…DailyOpsDashboard.jsx:890,893,899,948` | «… tăng mạnh nhất hôm nay», «hôm kia, hôm qua, hôm nay», «hôm nay» | Có (`ngay` từng item) |
| `src/components/arrivals/DailyOpsPtcRow.jsx:160` | «Số liệu đến lúc: …» (số liệu phát, không ghi «hôm nay») | `ngay` của `ket-qua-phat` |
| `src/components/TiviView.jsx:497` | «Cần điều hành ngay hôm nay» | Có |
| `…TiviView.jsx:569` | «Sản lượng đến» (all) / «Hàng đến hôm nay» (một BCVH) | Có |
| `…TiviView.jsx:575` | «so hôm qua cùng giờ» | Có (kèm `so_bcvh`) |
| `…TiviView.jsx:673` | «Hôm nay chưa có việc cần điều hành» | Có |
| `…TiviView.jsx:903` | «Hôm nay từng khung giờ» | `ket-qua-phat.ngay` |
| `…TiviView.jsx:1142,1173` | «Phường/xã đến tăng mạnh hôm nay» + chú thích cột | Có (`ngay` từng item) |
| `…TiviView.jsx:1219` | «Dữ liệu đến hh:mm» | `den_luc` có; thiếu hiển thị ngày |
| `src/components/Sidebar.jsx:29`, `Header.jsx:9` | «Điều hành hôm nay» (tên màn) | Tên menu — nên giữ |
| `src/components/arrivals/ArrivalsBd10Status.jsx:272` | «hôm nay {ngày} (ngày dữ liệu mới nhất)» | Đã ghi ngày cụ thể (đã đúng ý) |

Đề xuất nhãn: nếu `ngay_du_lieu` = ngày của đồng hồ trình duyệt (giờ VN) → giữ «hôm nay»; ngược lại «dd/mm» + «đến hh:mm» (ví dụ «Sản lượng đến 15/10 · đến 14:47»). Rủi ro: tivi chữ lớn (nhãn thẻ 20 px, `TiviView.jsx:569`) dễ tràn — dùng hai dòng hoặc rút gọn «SL đến 15/10»; so sánh theo `so_bcvh` < 6 cần chú thích ngắn («Thuận Hóa» hoặc «1/6 BCVH»); nhiều BCVH khác ngày: ghi «15/10 (có BCVH khác ngày)». So sánh «hôm nay» với đồng hồ phải dùng giờ VN, tránh múi giờ trình duyệt (`getVnTodayYmd` ở `src/utils/sourceIngest.js:72`).

## Việc 5 — Kết luận
(a) «Hôm nay» thật = **ngày file OK mới nhất của TỪNG BCVH** (`MAX(file_date)`, `arrivalsQuery.js:292`), cắt đến `MAX(arrival_at)` của ngày đó; không dùng đồng hồ máy.
(b) Chênh 56: gần như chắc chắn do **cộng theo BCVH (điều hành, bảng so sánh, mẫu số phát) so với đếm SHBG khác nhau xuyên BCVH (thẻ tổng «Sản lượng đến»)**; số 56 và lý do cần 3 truy vấn trên bản sao DB.
(c) Không có lỗi tính toán trong từng công thức; có hai vấn đề **nhãn/ngữ nghĩa**: «hôm nay» không phải ngày đồng hồ, và «so hôm qua/tuần trước cùng giờ» chỉ trên các BCVH có mốc (`so_bcvh` bị giấu).
(d) Khuyến nghị: thống nhất «Toàn Trung tâm» là **đếm SHBG khác nhau xuyên BCVH** (số «bưu gửi» thật, khớp nhãn «đã lọc trùng» `ArrivalsOverview.jsx:125`) nếu PO coi bưu gửi là đơn vị; khi đó thẻ điều hành, bảng so sánh, mẫu số phát phải đổi hoặc ghi rõ «tổng theo BCVH (một bưu gửi có thể tính ở hai BCVH)». Nếu giữ cộng theo BCVH, nhãn «đã lọc trùng» của thẻ tổng cần đổi để khỏi mâu thuẫn.
(e) Chia ticket: **DASH-7b (giao diện, trước)** — nhãn ngày/giờ + `so_bcvh`: `DailyOpsDashboard.jsx`, `TiviView.jsx`, helper dùng chung; không đổi API. **DASH-7c (backend, sau khi PO chọn công thức)** — thống nhất cách đếm Toàn Trung tâm: `dashboardDenQuery.js`, `phat.js`/`phatDashboard.js`, `ArrivalsOverview.jsx`, kèm test.

## Chưa kiểm chứng
- Số đo thực 56 và phân loại lý do (cần bản sao DB).
- Tập BCVH có mốc 14/10 và 8/10 của hai tỷ lệ +0,6% / −0,8%.
- Cách `/arrivals/summary` được gọi ở thẻ tổng của «Sản lượng đến» (ngày, mã) — suy từ `ArrivalsView.jsx:104-129`, không chạy giao diện.
