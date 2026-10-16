# DASH-7c-a — Đo trên BẢN SAO DB: vì sao 56 SHBG xuất hiện ở từ 2 BCVH (CHỈ ĐỌC)

> Chỉ đo, không sửa mã. Script đo: `D:\Dev\_kiem-dash7a\do.js` (ngoài repo); kết quả thô: `D:\Dev\_kiem-dash7a\ketqua.txt`.
> **DB đã mở:** `D:/Dev/_kiem-dash7a/hue-dhcl.db` (bản sao, `better-sqlite3` `{ readonly: true, fileMustExist: true }`). DB gốc `D:\Dev\hue-dhcl\data\` **không** được mở.
> Mọi số dưới đây là số đếm. Không có SHBG, BD8, BD10 hay tên người nhận. Mã BCVH (6 chữ số) là mã đơn vị, không phải dữ liệu bưu gửi.
> Script chạy do PO (Claude Code bị chặn chạy script trên bản sao bởi bộ phân loại quyền); Claude Code đọc `ketqua.txt` và viết báo cáo này.

## 0. Hai điều cần đọc trước

**(b) Số trên bản sao khác ảnh chụp màn hình sáng nay — đó là bình thường.** Ảnh chụp: (A) 7.133, (B) 7.077. Bản sao: **(A) 8.024, (B) 7.968**. Bản sao chứa nhiều dữ liệu hơn thời điểm chụp (PO xác nhận bản sao nạp thêm; tôi không đối chiếu từng BCVH), nên số tuyệt đối lớn hơn. Điều quan trọng không đổi: **A − B = 56 ở cả hai**. Chênh lệch các số khác cũng giữ nguyên (8 hàng đi ngoài, 13 túi/kiện, ≈ 86,5 kg), xem việc 5. Vì vậy kết luận đo được áp dụng cho số màn hình, dù không dựng lại đúng 7.133 / 7.077.

**(a) `arrival_at_khac_min3moc` = 1.524 / 8.619 dòng — quy tắc thật không phải «sớm nhất trong 3 mốc».**
- Mã tính: `server/lib/arrivalsImport.js:38-40` (chú thích và `ARRIVAL_SOURCES = [['bag', …], ['item', …], ['bd10', …]]`) và `deriveArrival` ở `server/lib/arrivalsImport.js:232-246`. `arrival_at` = **mốc đầu tiên KHÔNG TRỐNG theo thứ tự cố định XN túi → XN bưu gửi → XNĐ BD10** (`marks[0]`, dòng 236-237); `arrival_at_basis` ghi mốc đã dùng; ba mốc đều trống thì NULL.
- Quy tắc này là R2, `docs/ai/04_DECISIONS.md` mục #59 (PO, 10/10/2026), **thay** quy tắc «mốc sớm nhất» cũ (#13/#28). Chú thích đầu `server/lib/arrivalsQuery.js:6` cũng nói đúng như vậy («XN túi → XN bưu gửi → XNĐ BD10»).
- Vì sao khác «sớm nhất»: khi dòng có XN túi, `arrival_at` luôn lấy XN túi dù một mốc sau trong thứ tự (bưu gửi hay BD10) có thời điểm sớm hơn. 1.524 dòng (17,7 %) ở ngày 15/10 rơi vào trường hợp đó. Phụ lục ticket mô tả «sớm nhất» là mô tả cũ; **mã dùng R2**, và script đo dùng đúng cột `arrival_at` đã lưu như `arrivalsQuery.js`, nên 8.024 / 7.968 là số theo R2, khớp với số màn hình.
- Không chạy truy vấn thêm trên bản sao (không đếm theo `arrival_at_basis`); đọc mã đã đủ để giải thích. Nếu PO cần số dòng theo từng `arrival_at_basis`, đó là một truy vấn đếm nhỏ.

## Việc 1 — Dựng lại hai công thức (ngày đến 15/10, 6 BCVH, 8.619 dòng)

| | Bản sao | Ảnh chụp sáng nay |
|---|---|---|
| (B) Đếm SHBG khác nhau xuyên BCVH | **7.968** | 7.077 |
| (A) Cộng từng BCVH | **8.024** | 7.133 |
| A − B | **56** | 56 |

6 BCVH đều có file OK ngày 15/10 và đều có dòng. Theo BCVH (A): 533140: 4.197; 535470: 1.304; 535790: 216; 536250: 1.118; 537015: 473; 537220: 716.

## Việc 2 — SHBG ở ≥ 2 BCVH

- **56 SHBG** khác nhau có ngày đến 15/10 ở từ 2 BCVH trở lên = **7 ‰** của (B) (56/7.968).
- Theo số BCVH: **2 BCVH: 56; 3 BCVH: 0; ≥ 4: 0.** Tất cả đúng 2 BCVH.
- Kiểm tổng: Σ(số BCVH − 1) = 56 = A − B → **khớp** (công thức A − B chính là số lần «đếm lại»).
- Ma trận theo cặp BCVH (số SHBG có mặt ở cả hai; ma trận đối xứng, mỗi SHBG nằm ở đúng một cặp):

| Cặp | SHBG |
|---|---|
| 533140 – 535470 | 20 |
| 533140 – 537015 | 19 |
| 536250 – 537220 | 10 |
| 533140 – 536250 | 4 |
| 533140 – 537220 | 2 |
| 536250 – 537015 | 1 |
| 535790 với mọi BCVH | 0 |
| Cộng | 56 |

## Việc 3 — Phân loại lý do

Thứ tự ưu tiên (mỗi SHBG vào đúng một nhóm): (i) → (ii) → (iii) → (v). (iv) không xếp nhóm mà là «thuộc tính phủ lên»: ngưỡng «gần như cùng giờ» ở (iii) do tôi chọn = chênh mốc đến ≤ 10 phút, vì chưa có ngưỡng trong ticket.

| Nhóm | Số SHBG |
|---|---|
| (i) có dòng BD8 = chính SHBG (hàng đi ngoài), xét trong dòng của ngày | **8** |
| (ii) chuyển tiếp: mốc đến ở BCVH sau muộn hơn BCVH đầu > 10 phút | **48** |
| (iii) hai BCVH cùng ngày và chênh ≤ 10 phút (nghi trùng nạp / hai BCVH cùng quét) | **0** |
| (v) khác | **0** |
| Cộng | 56 |

- Khoảng cách giờ giữa mốc đến BCVH sớm nhất và muộn nhất (đơn vị phút, toàn bộ 56 SHBG): **trung vị 342, tối đa 425** (≈ 5,7 giờ và 7,1 giờ). Phân bố: ≤ 10 phút: 0; 10–60: 0; 60–180: 6; 180–720: 50; > 720: 0. Riêng nhóm (ii): trung vị 337,5, tối đa 425.
- **Không có SHBG nào cách nhau dưới 1 giờ** → không có dấu hiệu nạp trùng hay hai BCVH cùng quét một thời điểm.
- BCVH có mốc đến sớm nhất trong nhóm (ii), tức nơi công thức (B) «gán» số về: **533140: 17; 537015: 11; 535470: 10; 537220: 10**; 535790 và 536250 không bao giờ là BCVH đầu trong nhóm này. (B) vì vậy giữ số ở BCVH đầu và bỏ lần đếm ở BCVH sau. Với nhóm (i) chưa tách BCVH đầu (8 SHBG).
- (iv) Cùng BD10 hoặc BD8 ở hai BCVH (đếm có/không, trên cả 56): cùng BD8: **41**; cùng BD10: **9**; cùng BD10 hoặc BD8: **41** (BD10 trùng nằm trọn trong tập 41); **không cùng: 15**. Chia theo nhóm: trong (i): 7/8 có cùng BD8/BD10; trong (ii): 34/48; trong (iii): 0.
- Hàng đi ngoài tính theo toàn bộ dữ liệu: 8 SHBG trong 56 (khớp nhóm (i)).

## Việc 4 — Mở rộng ngày

Chỉ có **2 ngày** trong bản sao có file OK ở ≥ 2 BCVH (truy vấn lấy tối đa 30 ngày gần nhất, chỉ ra 2): các ngày 14/10, 13/10, 12/10, 09/10 **không** đạt điều kiện nên không đo được.

| Ngày | BCVH có file OK | A | B | A − B | SHBG ≥ 2 BCVH | ‰ của B |
|---|---|---|---|---|---|---|
| 15/10 | 6 | 8.024 | 7.968 | 56 | 56 | 7 |
| 16/10 | 5 | 3.792 | 3.792 | 0 | 0 | 0 |

16/10 mới có 5 BCVH và là ngày hiện tại (16/10) nên có thể chưa đầy đủ; số 0 chưa nói lên nhiều. **Chưa kết luận** 56 là bất thường một ngày hay quy luật: mới có một ngày đủ để xem. Mọi dòng của hai ngày đều thoả kiểm A − B = Σ(số BCVH − 1).

## Việc 5 — Hệ quả cho các số khác (15/10)

| Chỉ số | (A) | (B) | A − B | Ảnh chụp sáng nay |
|---|---|---|---|---|
| Hàng đi ngoài (SHBG) | 1.980 | 1.972 | **8** | 1.951 vs 1.943 (8) |
| Túi/kiện (BD8 khác nhau) | 2.324 | 2.311 | **13** | 2.259 vs 2.246 (13) |
| Khối lượng (kg) | 17.730,2 | 17.643,6 | **86,5** | 16.347,5 vs 16.260,8 (86,7) |

- Chênh 8 hàng đi ngoài **đúng bằng** 8 SHBG nhóm (i): mỗi SHBG đó bị đếm hai lần trong (A). Chênh 13 túi/kiện và ≈ 86 kg là phần BD8 và khối lượng của lần đếm lại 56 SHBG.
- Ba chênh lệch trên bản sao trùng ba chênh lệch ở ảnh chụp (8 / 13 / 86,5 so với 86,7); khác 0,2 kg có thể do dòng nạp thêm hoặc làm tròn. Nếu cần chính xác, đo lại trên đúng bản sao khớp ảnh chụp.
- Cách xét hàng đi ngoài chỉ trong cửa sổ ngày (không xét toàn bộ dữ liệu): A 1.974, B 1.966, chênh vẫn 8.

## Việc 6 — Khuyến nghị

- **(a) 56 SHBG là gì:** có số đo cho phần hình thức, chưa kết luận phần nghiệp vụ. Đo được: đều đúng 2 BCVH, mốc đến cách nhau 1–7 giờ (trung vị 5,7 giờ), 0 SHBG trùng giờ, 8 là hàng đi ngoài, 48 là «chuyển tiếp» giữa BCVH, 41/56 cùng BD8 ở cả hai BCVH. Đây là **cùng một bưu gửi thật xuất hiện ở hai BCVH vào hai thời điểm**, không phải lỗi nạp trùng. Nó là chuyển tiếp thật, hoàn hay phát lại: chưa kết luận (cần xem nội dung dòng, chưa làm vì cấm in dữ liệu).
- **(b) Chọn A hay B:** (B) cho «Toàn Trung tâm» nếu nhãn là «số bưu gửi khác nhau» (theo số đo: 56 là cùng bưu gửi, không phải bưu gửi khác; (A) đếm 7 ‰ quá tay). (A) chỉ đúng nếu nhãn là «lượt tiếp nhận tại BCVH». Quyết định theo ý nghĩa nhãn là của PO; mã hiện tại thẻ «Sản lượng đến» đã dùng (B).
- **(c) Nếu chọn (B):** (1) các thẻ per-BCVH vẫn giữ cách đếm riêng từng BCVH, nên tổng các dòng BCVH sẽ lớn hơn thẻ «Toàn Trung tâm» đúng 56 (7 ‰) và cần dòng chú thích; (2) nhãn «đã lọc trùng» chỉ đúng với (B) và cần ghi rõ «trùng xuyên BCVH»; (3) **mẫu số «Xử lý và tỷ lệ phát»: chưa kết luận.** Hiện mẫu số cộng theo từng BCVH (`phat.js` `demNgay`, `phatDashboard.js`) = (A). Đổi sang (B) chỉ đúng nếu mỗi bưu gửi chuyển tiếp được phát ở BCVH được (B) gán (BCVH có mốc sớm nhất); nếu phát ở BCVH sau thì tử số và mẫu số lệch BCVH. **Cách đo đề xuất (chưa chạy):** với 56 SHBG này, đếm trong `phat_status_current` (khoá (bcvh, shbg)) xem trạng thái phát nằm ở BCVH đầu / BCVH sau / cả hai / không có; chia theo nhóm (i) và (ii). Chỉ đếm, không in SHBG.
- **(d) Ticket sửa backend đề xuất (không viết mã):** `DASH-7c-b`, sau khi có kết quả đo ở (c)(3): file dự kiến `server/lib/dashboardDenQuery.js` (hàm tổng phạm vi `tongQuanDen`: tính `buu_gui` / `di_ngoai` toàn phạm vi bằng một CTE `buildCountedCte` nhiều `receiverCodes` thay cho cộng từng BCVH), `server/lib/phatDashboard.js` và `server/lib/phat.js` (mẫu số, nếu PO quyết định), cùng test tương ứng và chú thích «tổng ≠ cộng bảng BCVH» ở giao diện (đường dẫn cụ thể sẽ xác định khi mở ticket). Mọi thay đổi cần PO duyệt trước.

## Xác nhận

Chỉ mở bản sao `readonly`; không in SHBG/BD8/BD10 hay tên người nhận; không sửa file có sẵn trong repo (chỉ thêm file này); không `git add`; không gọi API; không đọc `.env`; không chạy server; không `npm install`.
