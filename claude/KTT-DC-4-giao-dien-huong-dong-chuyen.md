# TICKET KTT-DC-4 — Giao diện tab «Hướng đóng chuyến nội tỉnh» (quy tắc túi lớn, ngưỡng từ tham số)

> **CẬP NHẬT 25/11/2026:** canvas đã đổi và PO chốt bản mới. Ticket KTT-DC-6 SỬA phần giao diện đã làm theo ticket này: bỏ dải 29 ngày và biểu đồ chấm, thêm bảng «hướng đi», đổi nhãn. Mục 3 (nhãn), 4.3, 4.4, 4.7 của ticket này bị DC-6 thay; các điều cấm và tiêu chí chất lượng vẫn hiệu lực. Ticket kiểm độc lập KTT-DC-4b chưa chạy, gộp vào DC-6b.

Ngày: 12/11/2026. PO: Tân (đã duyệt canvas 12/11). Người giao: CTO AI. Người làm: Antigravity (giao diện). Nhánh: PO tạo riêng từ `main` (`7c87bdc`), ví dụ `feat/ktt-dc-4-giao-dien`; ghi tên nhánh và commit đầu ở đầu báo cáo. Không làm trên `main`.

Canvas PO đã duyệt: https://claude.ai/artifact/BK1cFW8Qk2fPjXAXLTyVq1 (hai artboard: ngày 03/11/2026 có 5 nơi, ngày 08/11/2026 có 1 nơi). Canvas là bản vẽ bố cục và chữ, KHÔNG sao chép CSS hay JS của canvas; dùng token màu, font, component của trang đang chạy. Số trong canvas là số thật của hai ngày đó, chỉ để hiểu bố cục; không đưa vào mã, test, docs của repo.
Hợp đồng API (nguồn duy nhất cho tên trường): `docs/ai/42_KTT_API.md` và các hàm trong `server/` (`kttHuongDong.js`, `server/config/ktt-huong-dong.js`). Đọc từ repo; nếu thiếu hoặc mâu thuẫn thì DỪNG phần đó và báo, KHÔNG đoán tên trường.

## 1. Vai trò và phạm vi
Một mục tiêu: dựng tab «Hướng đóng chuyến nội tỉnh» trong menu «Hàng tại Khai thác tỉnh», đọc từ ba route đã merge (KTT-DC-1, DC-2, DC-3): `huong-dong-chuyen/tong-hop`, `huong-dong-chuyen/danh-sach`, `xuat/huong-dong-chuyen` (xuất Excel `nhac_viec`, `chi_tiet`). Chỉ làm trong `src/components/ktt/` (kể cả `kttApi.js` và chỗ đăng ký tab theo đúng khuôn các tab «Hàng tại Khai thác tỉnh» đang có; nêu đường dẫn các file đã sửa trong báo cáo). Không làm phía máy chủ.

## 2. Điều cấm
- KHÔNG đọc, mở, truy vấn DB; KHÔNG chạy script nào chạm DB hay thư mục `data/`; KHÔNG đụng `.env`, mật khẩu. Vi phạm là ticket bị trả.
- KHÔNG sửa ngoài `src/components/ktt/`. KHÔNG sửa `server/`, `tests/`, `docs/`, `package.json`.
- KHÔNG tự tính quy tắc nghiệp vụ ở giao diện: túi lớn hay nhỏ, ngưỡng, N1/N2/N3, gộp chuyến. Mọi số, trường, ngưỡng lấy từ API. Chỉ được làm phép hiển thị: cộng các dòng đang hiện, chia ra phần trăm, trung bình ngày, xếp thứ hạng ngày. Liệt kê MỌI chỗ làm các phép này trong báo cáo (kể cả mọi chỗ gọi `Math.`, `reduce`, `sort`).
- KHÔNG hard-code ngưỡng 15, ngày, số, tên nơi, tên BCVH trong mã. Số 15 ở mọi nhãn lấy từ `meta.nguong_bg_trong_tui`.
- KHÔNG cộng `theo_ngay[].chuyen_co_lan` (các ngày có thể chứa cùng một chuyến). KHÔNG đọc hay hiển thị `ty_trong_8_noi_dau` và `ty_trong_8_noi_dau_tui_lon` ở bất cứ chỗ nào (canvas đã duyệt không có thẻ này).
- KHÔNG liệt kê 6 BCVH Huế làm nơi đóng (API đã bỏ; nếu thấy một trong 6 mã đó trong bảng thì báo, không tự lọc).
- KHÔNG đưa dữ liệu thật vào mã, test, docs, ảnh chụp. Ảnh chụp dùng dữ liệu giả hoặc đã che số hiệu bưu gửi.
- Không git add/commit/push/stash/reset, không npm install, không chạy bộ nạp SFTP. Trước khi mở server thử: `netstat -ano | findstr :594`; có tiến trình lạ thì dừng và báo, không tự tắt tiến trình không phải của mình.
- Chuỗi hiển thị KHÔNG chứa: biên, biên an toàn, dư địa, đợt, hệ số biến thiên, sát hạn, tuyến thư, quỹ, tuổi, hồ sơ, bản đồ nhiệt, heatmap, trung vị, P10, P90, phân vị, cờ, mốc A, mốc B, méo, dao động, thất thường, mẫu (đứng một mình), KPI.

## 3. Nhãn hiển thị BẮT BUỘC (đúng từng chữ; `{N}` là `meta.nguong_bg_trong_tui`)
| Vị trí | Chữ |
|---|---|
| Tiêu đề khối | «Nơi đóng chuyến thư vào 530100 có hàng nội tỉnh trong túi từ {N} BG trở lên» |
| Bộ lọc | «Khoảng ngày», «Từ ngày», «Đến ngày», «30 ngày», «7 ngày», «Loại hình nơi đóng»: «Tất cả», «GD1», «GD2/GD3», «VHX», «531120»; «Tải xuống»: «Tải Excel» |
| Hai ô tổng | «Sản lượng» (số = `meta.bg_trong_tui_lon`) kèm «bưu gửi trong {so_tui_lon} túi»; «Số BC/VHX đóng» (số = nơi có `bg_trong_tui_lon` > 0) |
| Dải theo ngày | Tiêu đề «Sản lượng theo ngày»; chú thích ở 4.3 |
| Biểu đồ chấm | Tiêu đề «Từng túi lớn vượt ngưỡng bao nhiêu»; nhãn vạch «ngưỡng {N}»; nhãn trục «Số BG nội tỉnh trong túi (thang log)»; chú thích: «Mỗi chấm là túi có nhiều BG nhất của một nơi đóng, đo bằng số BG nội tỉnh trong túi trên thang log (mỗi vạch gấp khoảng 2 đến 2,5 lần vạch trước); đoạn nối từ vạch ngưỡng {N} đến chấm cho thấy mức vượt. 531120 tách riêng ở trên cùng, màu vàng.» |
| Bảng | Tiêu đề «Chi tiết từng nơi đóng». Cột: «Nơi đóng chuyến thư», «Hàng trong túi từ {N} BG trở lên», «Hàng trong túi dưới {N} BG», «Số túi từ {N} BG trở lên», «Túi nhiều nhất (bưu gửi)» |
| Dòng cuối bảng | «Cộng {x} nơi có túi từ {N} BG trở lên»; «{y} nơi chỉ có túi dưới {N} BG (bấm để mở)»; «Cộng {z} nơi có hàng vào 530100» |
| Dòng 531120 | cột «Hàng trong túi từ {N} BG trở lên» hiện số và «({p}% sản lượng)», p làm tròn số nguyên |
| Chú thích dưới bảng | «531120 hiện số liệu riêng; thanh của các nơi còn lại chia theo mức lớn nhất của nhóm đó, không so với 531120. Theo loại hình (BG trong túi từ {N} BG trở lên): {danh sách}. Hai dòng cuối nối số với tổng hàng vào 530100 trong khoảng ngày ({dong_vao_530100}).» |
| Khối thu gọn 1 | «Danh sách bưu gửi của nơi đóng» · chú thích: «bấm một dòng ở bảng trên để mở: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng; hộp chọn «Chỉ túi từ {N} BG trở lên» bật sẵn» và nút «Tải Excel» |
| Khối thu gọn 2 | «Cách tính và giới hạn» · «mở ra để đọc», nội dung ở 4.7 |
| Trạng thái | «Đang tải, lần đầu có thể mất vài giây»; lỗi: thông báo của API; rỗng: «Không có hàng trong khoảng này»; 403: «Tài khoản không có quyền xem»; quá 31 ngày: «Chọn tối đa 31 ngày» (không gọi API) |

## 4. Các việc
4.1 **Khung và gọi API.** Tab chỉ tải khi PO bấm «30 ngày» hoặc «7 ngày», hoặc đã chọn đủ «Từ ngày» và «Đến ngày» (PO chốt 12/11: khoảng ngày chọn chủ động; mở tab không tự tải). Tham số ngày của API là `tu`, `den` (không phải `tu_ngay`). Chọn loại hình thì gọi lại với tham số lọc `loai_hinh` (đọc giá trị hợp lệ từ `docs/ai/42_KTT_API.md`). Không gửi `nguong`: giao diện dùng ngưỡng hệ thống.
4.2 **Hai ô tổng, bảng, loại hình.**
- Bảng theo nơi: các nơi có `bg_trong_tui_lon` > 0, nhiều đến ít; 531120 luôn ở dòng đầu, có kiểu riêng (số đậm màu vàng thẫm, không thanh). Các nơi còn lại có thanh, thanh chia theo `bg_trong_tui_lon` lớn nhất của NHÓM CÒN LẠI (không tính 531120). Cạnh tên nơi: nhãn loại hình (`loai_hinh`); nơi không có tên hiện «chưa có tên».
- Cột «Túi nhiều nhất (bưu gửi)» = `so_bg_tui_lon_nhat`.
- Dòng «{y} nơi chỉ có túi dưới {N} BG»: các nơi có `bg_trong_tui_lon` = 0 và `bg_trong_tui_nho` > 0; bấm để mở thì liệt kê mã, tên, loại hình, hàng túi nhỏ. Dòng cộng lấy từ `meta` và `meta.trong_loc`; kiểm đẳng thức ngay trên màn trong lúc dựng: tổng cột «túi từ {N} BG trở lên» = `meta.bg_trong_tui_lon`; lớn + nhỏ = `dong_vao_530100`. Sai thì báo, không chỉnh số cho khớp.
- Loại hình ở chú thích dưới bảng lấy từ `theo_loai_hinh`: «531120», «GD2/GD3» (nhóm `GD2_GD3`), «VHX», «GD1»; hiện cả nhóm bằng 0 ở dạng «GD1: 0»; nhóm «KHAC» chỉ hiện khi lớn hơn 0. Mỗi nhóm khác 531120 kèm «({số nơi} nơi)»; phần trăm một chữ số thập phân, dấu phẩy.
4.3 **Dải sản lượng theo ngày** (CTO bổ sung cho khoảng ngày nhiều ngày; PO xem ảnh chụp): cột mỗi ngày, `theo_ngay[].bg_trong_tui_lon`, lấy từ MỘT lời gọi `tong-hop` riêng cho 30 ngày kết thúc ở «Đến ngày» (nếu khoảng chọn đã là 30 hoặc 31 ngày thì dùng luôn). Ngày trong khoảng chọn tô đậm, ngoài khoảng tô nhạt; ngày được tô đậm hiện số trên đầu cột; tooltip mỗi cột «{dd/mm}: {n} BG trong túi từ {N} BG trở lên». Vạch nét đứt «trung bình {n}»: tổng các ngày trọn ÷ số ngày trọn. Chú thích: «Cột mỗi ngày là số BG trong túi từ {N} BG trở lên; vạch nét đứt là mức trung bình {n} BG/ngày ({số ngày} ngày {từ} đến {đến}, tổng {t}).» Khi khoảng chọn đúng một ngày, thêm ở đầu chú thích: «{dd/mm} đứng thứ {k} trong {số ngày} ngày.» (k theo sắp xếp giảm dần các ngày trọn).
  **Ngày chưa trọn** (hôm nay hoặc dữ liệu mới nạp đến giữa ngày) vẽ khung nét đứt, không có số, không tính vào trung bình và thứ hạng, kèm câu «Ngày {dd/mm} chưa trọn nên khung nét đứt, không tính.» Cách biết ngày nào chưa trọn: tìm trong `docs/ai/42_KTT_API.md` và các route KTT trường báo thời điểm dữ liệu đã nạp đến. Nếu API KHÔNG có trường đó thì DỪNG riêng phần «ngày chưa trọn», báo CTO, làm phần còn lại; không dùng giờ máy khách để đoán.
4.4 **Biểu đồ chấm** (SVG tự dựng hoặc theo thư viện biểu đồ trang đang dùng; không thêm thư viện mới): mỗi nơi có `so_tui_lon` > 0 một dòng, chấm đặt tại `so_bg_tui_lon_nhat` trên trục log; trục chọn từ mốc đẹp {1, 2, 5, 10, 20, 50, 100, 200, 500, 1000…} sao cho gồm cả vạch ngưỡng và chấm lớn nhất; vạch đứt đặt tại `meta.nguong_bg_trong_tui`; đoạn nối từ vạch ngưỡng đến chấm; số BG ghi bên phải chấm; 531120 ở dòng đầu, màu vàng, cách các dòng sau một khoảng, có đường kẻ ngăn; các nơi khác màu chủ đạo. Thêm `role="img"` và `aria-label` mô tả. Một nơi có nhiều túi lớn trong khoảng chọn vẫn một chấm (túi nhiều BG nhất).
4.5 **Danh sách bưu gửi của nơi đóng:** bấm một dòng ở bảng thì gọi `danh-sach` với `nhom=dong_vao_530100` và mã nơi, hộp chọn «Chỉ túi từ {N} BG trở lên» bật sẵn (tham số `chi_tui_lon=1`); bỏ chọn thì lấy mọi dòng. Cột: số hiệu, ngày hàng đến, ngày đóng chuyến thư, số bưu gửi trong túi, mã túi, BCVH đích, dịch vụ, khối lượng (tên trường từ API). Bấm lại thì đóng. Danh sách có số hiệu bưu gửi: chỉ hiện trên màn cho người đã có quyền; không đưa vào ảnh chụp.
4.6 **Tải Excel:** nút «Tải Excel ▾» ở đầu khối và ở khối danh sách; hai lựa chọn gọi route xuất với `nhac_viec` và `chi_tiet` (tên lựa chọn hiển thị: «Danh sách nhắc việc (không số hiệu)» và «Chi tiết có số hiệu bưu gửi»); lựa chọn thứ hai hiện cảnh báo «File có số hiệu bưu gửi, chỉ dùng nội bộ» trước khi tải. Cách tải theo khuôn các nút tải Excel đang có trong thư mục.
4.7 **Khối «Cách tính và giới hạn»** (thu gọn, mở ra mới hiện), đúng bốn ý:
- «Túi từ {N} bưu gửi trở lên là dấu hiệu cần nhắc, chưa phải kết luận đóng sai. Cỡ túi chỉ đếm bưu gửi nội tỉnh; hàng đi tỉnh khác nằm cùng túi không tính.»
- «Ngưỡng {N} là mặc định, đặt ở tham số hệ thống. Bảng không gồm 6 BCVH làm nơi đóng.»
- «531120: chưa biết có thoả thuận đóng chuyến riêng hay không.»
- «Nơi đóng chuyến thư có thể không phải điểm chấp nhận gốc; hệ thống chưa có cột điểm chấp nhận. Chưa tính hàng hoàn.»
4.8 **Quyền:** ADMIN, TTVH, TTKT thấy tab; GDVH, TIVI không thấy hoặc nhận 403 thì hiện thông báo ở mục 3; không token thì về đăng nhập như các tab khác.
4.9 **Bố cục:** 1280 px không vỡ; bảng cuộn ngang trong khối (rộng tối thiểu khoảng 760 px); hai ô tổng tự xuống dòng ở màn hẹp; nút bấm cao tối thiểu 44 px; chữ đủ tương phản; chấm và vạch không chỉ phân biệt bằng màu (531120 còn có dòng riêng và kiểu số riêng). Giao diện sáng và tối theo cơ chế sẵn có của trang.

## 5. Tiêu chí kiểm tra
- `npm run build` mã 0. Quét biến chưa khai báo và import thiếu bằng AST của vite (không dựa vào grep); kiểm từng icon lucide đã import (lần trước thiếu import mà build vẫn xanh).
- Quét chuỗi hiển thị theo danh sách cấm ở mục 2 (dán lệnh và kết quả; lệnh có chuỗi thử bị bắt).
- Quét mã: không còn số 15 viết cứng ở nhãn hay logic (dán lệnh và kết quả); không có chỗ nào đọc `ty_trong_8_noi_dau*` hay cộng `chuyen_co_lan`.
- Mở được tab với ADMIN, TTVH, TTKT; GDVH, TIVI bị chặn.
- Ba tình huống khoảng ngày (dữ liệu giả hoặc PO chạy): một ngày nhiều nơi; một ngày chỉ một nơi (bảng một dòng thật, một dòng gộp, biểu đồ chấm một dòng); 30 ngày. Mỗi tình huống đối chiếu số trên màn với JSON API (bảng đối chiếu, bỏ giá trị định danh): hai ô tổng, từng nơi, ba dòng cuối bảng, dải theo ngày.
- Liệt kê mọi phép tính hiển thị (cộng, chia %, trung bình, thứ hạng) kèm đoạn mã.
- Ảnh chụp ở 1280 px: (1) khoảng một ngày nhiều nơi; (2) khoảng một ngày chỉ một nơi; (3) khoảng 30 ngày; (4) mở một nơi ra danh sách bưu gửi (che số hiệu); (5) trạng thái tải, lỗi, rỗng, quá 31 ngày. Nếu không dựng được dữ liệu giả thì nói rõ, PO tự chạy và xem.
- `git status --short` chỉ liệt kê file trong `src/components/ktt/`; dán `git diff --stat` cuối báo cáo.

## 6. PO nghiệm thu (PO tự làm; số này KHÔNG đưa vào repo)
Chạy với dữ liệu thật rồi so hai ngày đã khảo sát (KTT-DT-6c, bản sao DB lấy 12/11/2026 15:23; nếu DB thật nạp bổ sung thì số có thể khác):
- 03/11/2026 (`tu = den`): Sản lượng 502 trong 5 túi; 5 nơi; 531120 411 (82%), 531600 31, 535300 23, 536210 20, 531110 17; túi nhiều nhất 411, 32, 26, 20, 17; 28 nơi chỉ có túi dưới 15 BG với 151 BG; cộng 33 nơi, 502 + 172 = 674.
- 08/11/2026: Sản lượng 166 trong 1 túi; 1 nơi (531120, 100%); 2 nơi chỉ có túi dưới 15 BG với 2 BG; cộng 3 nơi, 166 + 15 = 181.
- 30 ngày 11/10 đến 09/11/2026 (KTT-DT-6b): 4.080 BG trong 81 túi, 11 nơi, hàng túi nhỏ 3.128, cộng 7.208.
- Dải 29 ngày: 03/11 đứng thứ 2 (cao nhất 23/10: 587), trung bình 141 BG/ngày.

## 7. Mẫu báo cáo
Ghi `Claude outputs/KTT-DC-4-bao-cao.md` (ngoài vùng git theo dõi): (1) nhánh và commit đầu; (2) danh sách file đổi (đường dẫn, số dòng) và chỗ đăng ký tab; (3) tên trường API đã dùng cho từng khối (đối chiếu `docs/ai/42_KTT_API.md`); (4) kết quả build, quét AST, quét chuỗi cấm, quét số 15 viết cứng; (5) bảng đối chiếu ba tình huống; (6) danh sách phép tính hiển thị; (7) ảnh chụp; (8) điều chưa làm được, nhất là «ngày chưa trọn» nếu API không có trường; (9) `git status --short` đầu và cuối; `git diff --stat`. Sau báo cáo, CTO giao ticket kiểm độc lập cho Claude Code (phiên mới) trước khi PO commit.

## 8. Chưa làm trong ticket này
Bảng đổi ngưỡng (10/15/20/30), thẻ «8 nơi đầu chiếm …%», giải thích chênh giữa `bg_trong_tui_lon` và `so_bg_tui_lon_nhat` ở hai nơi (531600: 31 so với 32; 535300: 23 so với 26; CTO hỏi Claude Code riêng), ô sửa ngưỡng trên màn.
