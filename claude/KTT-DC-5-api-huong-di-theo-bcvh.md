# TICKET KTT-DC-5 — API: số bưu gửi và số túi theo từng BCVH đích, cho từng nơi đóng

Ngày: 25/11/2026. PO: Tân (đã chốt canvas 25/11: https://claude.ai/artifact/BK1cFW8Qk2fPjXAXLTyVq1). Người giao: CTO AI. Người làm: Claude Code (backend, test, docs). Nhánh: PO tạo riêng từ `main` mới nhất, ví dụ `feat/ktt-dc-5-api-theo-bcvh`; ghi tên nhánh và commit đầu ở đầu báo cáo. Không làm trên `main`. Không đụng nhánh `feat/ktt-dc-4-giao-dien` (Antigravity đang làm giao diện ở đó).

## 1. Mục tiêu duy nhất
Canvas chốt có bảng «hướng đi»: mỗi dòng một nơi đóng chuyến thư vào 530100 (chỉ túi từ N BG trở lên), mỗi cột một BCVH trong 6 BCVH Huế, mỗi ô hai số: số bưu gửi (BG) nội tỉnh của nơi đó đi BCVH ấy, và số túi có ít nhất một bưu gửi đi BCVH ấy. Bấm một dòng mở từng túi và số BG của túi đi từng BCVH. API hiện chưa có các số này. Thêm vào API, CHỈ THÊM trường và một route, không đổi tên hay nghĩa trường đang có (DC-1, DC-2, DC-3 đã merge, Antigravity đang đọc chúng).

## 2. Phạm vi và điều cấm
- Chỉ làm ở `server/` (lõi `kttHuongDong.js`, route, `server/config/ktt-huong-dong.js` nếu cần), `tests/`, `docs/ai/` (42_KTT_API.md, CHANGELOG_AI.md, 00_SNAPSHOT.md nếu quy ước của repo yêu cầu). Không sửa `src/`.
- Không git add/commit/push/stash/reset, không tạo nhánh. Không đụng `data/`, `.env`, mật khẩu, DB đang chạy. Số kiểm trên BẢN SAO DB ở thư mục tạm NGOÀI repo (PO ghi đường dẫn ở đầu tin giao việc; nếu không có thì DỪNG và hỏi, không tự đoán DB). Trước khi mở server thử: `netstat -ano | findstr :594`; có tiến trình lạ giữ cổng thì dừng và báo; xong tắt đúng tiến trình mình mở.
- Test dùng dữ liệu giả. Không đưa SHBG, BD10, mã túi thật, số liệu thật vào mã, test, docs, báo cáo (chỉ số đếm tổng hợp; mã 531120, 530100 và 6 mã BCVH được phép).
- Không tính lại quy tắc nghiệp vụ theo cách mới: dùng đúng lõi đang có (tập hàng, N1/N2/N3, ngưỡng từ tham số, ngày hàng đến như màn mục 2 B). Không thêm tham số `nguong` vào mặc định giao diện.

## 3. Định nghĩa (chốt, để số khớp màn)
- **BG theo BCVH của một nơi** = số bưu gửi nhóm N2 (có túi vào 530100, không có chuyển tiếp thẳng BCVH) trong túi lớn của nơi đó mà BCVH đích là BCVH ấy. Quy tắc «túi lớn» giữ như DC-3 (cỡ túi theo mục 2.1–2.2 của DC-3, ngưỡng từ `ktt_dc_nguong_bg_trong_tui`).
- **Bất biến 1:** với mỗi nơi, tổng BG của 6 BCVH = `bg_trong_tui_lon` của nơi đó. Tổng mọi nơi = `meta.bg_trong_tui_lon`. Nếu có BG mà BCVH đích không thuộc 6 BCVH hoặc không xác định được thì KHÔNG nhét vào BCVH nào: thêm trường `khong_ro_bcvh` (số BG) và nêu trong báo cáo số này bằng bao nhiêu trên bản sao DB. Bất biến thành: tổng 6 BCVH + `khong_ro_bcvh` = `bg_trong_tui_lon`.
- **Số túi theo BCVH của một nơi** = số túi lớn của nơi đó có ít nhất một BG N2 đi BCVH ấy. Một túi chứa hàng đi nhiều BCVH được tính ở mỗi BCVH, nên số túi của 6 BCVH KHÔNG cộng ra `so_tui_lon`. Mỗi số ≤ `so_tui_lon` của nơi. Cộng số túi theo BCVH qua các nơi (cho dòng cuối bảng) là hợp lệ vì túi của hai nơi khác nhau không trùng.
- Túi xác định bằng khóa 7 cột (From, To, MailTripType, ServiceCode, Year, MailTripNumber, PostBagIndex); mã túi có thể trùng, không dùng mã túi để đếm. Dùng cách đếm túi đã có ở DC-3.
- 6 BCVH, thứ tự và tên lấy MỘT chỗ từ hằng số/cấu hình «6 BCVH Huế» đã có trong mã (không viết cứng chỗ thứ hai). Tên theo HANDOVER: 533140 Thuận Hóa, 536250 Hương Thủy, 535470 Hương Trà, 537015 Thuận An, 537220 Phú Lộc, 535790 A Lưới; đối chiếu với mã, lệch thì báo, không tự sửa.

## 4. Các việc
4.1 **`huong-dong-chuyen/tong-hop`:** thêm vào mỗi phần tử nơi đóng mảng `huong_bcvh` gồm đủ 6 phần tử theo thứ tự cố định, mỗi phần tử `{ ma_bcvh, bg, so_tui }` (kể cả bằng 0), và số `khong_ro_bcvh`. Thêm vào `meta` mảng `huong_bcvh` 6 phần tử `{ ma_bcvh, ten_bcvh, bg, so_tui }` (cộng qua các nơi) và `khong_ro_bcvh`. Tên trường là đề xuất: nếu khuôn của DC-1..3 gọi khác (ví dụ tiếng Việt không dấu khác) thì theo khuôn và ghi vào báo cáo. Phải đúng khi bộ lọc `loai_hinh` đổi (meta tính lại theo bộ lọc như các trường hiện có) và khi khoảng ngày nhiều ngày (cộng BG qua các ngày; số túi đếm túi khác nhau, không cộng số túi theo ngày).
4.2 **Route mới `huong-dong-chuyen/tui`:** tham số `tu`, `den` (tối đa 31 ngày, như các route khác), `ma_noi` (bắt buộc), `chi_tui_lon` (mặc định `1`; `0` lấy mọi túi vào 530100 của nơi đó có hàng nội tỉnh). Trả mỗi túi: ngày đóng chuyến thư, mã túi (hiển thị), `so_bg_trong_tui` (cỡ túi theo DC-3, gồm N2 và N3), `bg_n2` (số BG nhóm N2), `huong_bcvh` 6 phần tử `{ ma_bcvh, bg }`, `khong_ro_bcvh`. Sắp xếp: ngày đóng, rồi `so_bg_trong_tui` giảm dần. Giới hạn số túi trả về bằng cách đã dùng ở `danh-sach` (nếu có phân trang thì theo khuôn đó). Cùng quyền như các route `huong-dong-chuyen`: ADMIN, TTVH, TTKT; GDVH, TIVI 403; không token 401. Cùng bộ đệm và cùng cách xử lý lỗi 400 (khoảng quá 31 ngày, thiếu `ma_noi`, nơi không hợp lệ).
4.3 **Không làm:** thêm cột vào file Excel (việc riêng nếu PO cần), đổi ngưỡng, thêm tham số, sửa giao diện.
4.4 **Tài liệu:** cập nhật `docs/ai/42_KTT_API.md` (trường mới, route mới, định nghĩa ở mục 3, ví dụ giả), `CHANGELOG_AI.md`, và các file khác repo quy định cho một thay đổi API. Tài liệu không chứa số thật.
4.5 **Việc phụ, chỉ báo cáo (không sửa mã):** dùng route mới trên bản sao DB, nêu cho ngày 03/11/2026 hai nơi 531600 và 535300: cỡ túi `so_bg_trong_tui`, `bg_n2`, chênh lệch (kỳ vọng: 32 và 26 so với 31 và 23). Chênh lệch bằng số BG nhóm N3 trong túi có đúng không? Chỉ ghi số đếm, không ghi mã túi.

## 5. Tiêu chí kiểm tra
1. Build và toàn bộ test hiện có vẫn qua; test mới (dữ liệu giả) bao phủ: bất biến 1 (có và không có `khong_ro_bcvh`); số túi theo BCVH ≤ `so_tui_lon`; túi có hàng đi hai BCVH được tính ở cả hai; bộ lọc `loai_hinh`; khoảng nhiều ngày (cùng một túi không bị đếm hai lần); quyền 401/403; 400 khoảng quá 31 ngày và thiếu `ma_noi`; mã túi trùng ở hai túi khác khóa không bị gộp. Kiểm đột biến ít nhất hai trường hợp (ví dụ đếm túi theo mã túi, bỏ điều kiện N2) và báo test có chuyển đỏ.
2. Trên bản sao DB, gọi API thật qua router (JWT thật), không gọi hàm lõi. Báo bảng nơi × 6 BCVH (BG và số túi) cho ba khoảng và kiểm số:
   - 03/11/2026 (`tu = den`): tổng BG 502; từng nơi 411, 31, 23, 20, 17; số túi mỗi nơi (`so_tui_lon`) cộng 5.
   - 08/11/2026: 166 BG, một nơi 531120.
   - 30 ngày 11/10 đến 09/11/2026: 4.080 BG, 81 túi, 11 nơi.
   Cộng ngang = `bg_trong_tui_lon` của nơi; cộng dọc = `meta.huong_bcvh`; `khong_ro_bcvh` nêu rõ (kỳ vọng 0; khác 0 thì giải thích).
3. Route `tui`: với 03/11, tổng `bg_n2` các túi của một nơi = `bg_trong_tui_lon` của nơi; số túi = `so_tui_lon`.
4. Không có số hiệu bưu gửi hay mã túi thật trong mã, test, docs, báo cáo.
5. `git status --short` đầu và cuối: chỉ file trong `server/`, `tests/`, `docs/ai/` (và `?? "Claude outputs/"`); dán `git diff --stat`.

## 6. PO nghiệm thu (PO tự làm, ngoài repo)
Chạy script `KT-530100-danh-sach-BG-noi-tinh-dong-vao-530100.sql` trên DB 530100 cho 03/11/2026 (`@GomN3 = 0`), cột «BCVH dự kiến phát» của kết quả 2 theo từng nơi: so số BG theo BCVH với bảng của Claude Code. Lệch vài chục BG có thể do cơ sở ngày (script theo ngày đóng chuyến, API theo ngày hàng đến); lệch nhiều hơn thì báo CTO, không tự kết luận.

## 7. Mẫu báo cáo
Ghi `Claude outputs/KTT-DC-5-bao-cao.md`: (1) nhánh, commit đầu, đường dẫn bản sao DB; (2) file đổi (đường dẫn, số dòng); (3) tên trường và route đã chốt (nếu khác đề xuất, nói rõ); (4) kết quả build và test (dán nguyên văn), kiểm đột biến; (5) ba bảng nơi × BCVH và kiểm bất biến; (6) việc phụ 4.5; (7) điều chưa chắc; (8) `git status --short` đầu và cuối, `git diff --stat`; tiến trình đã mở và đã tắt. Sau báo cáo, CTO giao ticket kiểm độc lập (DC-5b) cho phiên Claude Code mới trước khi PO commit.
