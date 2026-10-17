# DASH-12c / DASH-12b-3 — Giao diện hàng thẻ kết quả phát: HÔM NAY | LŨY KẾ TỪ 01/MM (web «Điều hành hôm nay»)

> Dùng endpoint `GET /api/arrivals/dashboard/ket-qua-phat-thang` (DASH-12b, #91) và `ket-qua-phat` (#92, DASH-12b-3). Chỉ giao diện web; **Tivi không đổi** (Tivi 403 ở endpoint tháng; số Tivi đổi theo quy tắc ngày đến vì Tivi dùng `ket-qua-phat`).

## Bố cục (DASH-12b-3)

**Thẻ PTC lớn** (chiếm 2 cột trên màn lớn): tiêu đề + chip mục tiêu như cũ; hai cột số lớn «HÔM NAY · dd/MM» (tỷ lệ + tử / mẫu + «đến hh:mm dd/MM» của số liệu phát) | «TỪ 01/MM» (tỷ lệ lũy kế + tử / mẫu + «n/m ngày đủ»; nếu hôm nay chưa tính: «đến dd/MM · n/m ngày đủ»); bên phải chip «▼/▲ x điểm so với tháng» và đường diễn biến có **vạch nét đứt mục tiêu** (`nguong.ptc_dat`, 82%); dòng chú thích «Đường = diễn biến theo ngày · nét đứt = mục tiêu 82%».

**4 thẻ nhỏ** (Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có TT phát): nhãn cả dòng; số hôm nay + tỷ lệ; đường diễn biến nhỏ bên phải; **chân thẻ cao 44px nền xám nhạt**: «01/MM→ số · %» và chênh «▲/▼ x điểm» (hai dòng).

**Chiều cao hàng thẻ**: đo bằng trình duyệt (khung 1366 px) — bản trước DASH-12c 189 px; bản này 186 px (không cao thêm). Màn nhỏ (375 px): các thẻ xếp dọc, không cắt chữ.

## Trạng thái

- **Hôm nay đủ số liệu** (`du_so_lieu` true): thẻ xanh / vàng theo mục tiêu như cũ; chip chênh nếu máy chủ trả `chenh`.
- **Hôm nay chưa đủ số liệu** (`du_so_lieu` false, có hàng đến): hiện **số thật theo quy tắc ngày đến** — 0 (0,0%) cho PTC / Phát không thành công / Chuyển hoàn / Lạc hướng, Chưa có TT 100% (thẻ đỏ, đúng sự thật) — kèm dòng «Hôm nay chưa có xử lý»; chip mục tiêu thay bằng «Chưa đủ số liệu hôm nay» (không đánh giá đạt / chưa đạt); chênh «Chưa đủ dữ liệu để so»; cột «TỪ 01/MM» vẫn hiện lũy kế các ngày đủ, ghi «đến dd/MM» (ngày đủ cuối cùng).
- Không có hàng đến (mẫu số 0): «—» và chip «Chưa có hàng đến».
- Đang tải tháng (`thang = null`): «…»; lỗi / 403: «chưa có số liệu» (các khối khác không bị ảnh hưởng).
- Màu tốt / xấu của chip chênh (giao diện quyết; backend chỉ trả số): PTC tăng xanh, giảm đỏ; bốn loại còn lại tăng đỏ, giảm xanh; `ngang` (|chênh| < 0,5 điểm theo máy chủ) trung tính.
- Đường diễn biến: ngày chưa đủ số liệu (`null`) ngắt đường; trục dọc luôn rộng ít nhất 4 điểm (thẻ nhỏ) / 10 điểm (PTC, tính cả vạch mục tiêu) nên dao động dưới 1 điểm vẽ gần phẳng, không khuếch đại.

## Nối dữ liệu

- `DailyOpsDashboard.jsx`: `fetchData` gọi riêng `ket-qua-phat-thang?bcvh=<mã|all>` **không chờ** (không chặn các khối khác); `thangReq` bỏ kết quả của lần gọi cũ; **khi đổi BCVH / phạm vi, `thangPhat` được đặt về `null` ngay** (cả ở `handleSelectBcvh` và khi `fetchData` thấy mã đổi) và chỉ nhận kết quả có `bcvh` khớp lựa chọn hiện tại — không hiện số tháng của BCVH cũ. Làm mới theo chu kỳ 60 giây có sẵn (máy chủ có cache).
- `DailyOpsPtcRow.jsx`: nhận prop `thang`; dựng thẻ lớn + 4 thẻ nhỏ. `DailyOpsPtcThang.jsx`: `PtcSparkline` (vạch mục tiêu, biên độ tối thiểu), `ChenhChip`, `PtcThangFooter` (chân thẻ 44px), `formatPct1`, `nhanLuyKe`.
- Ngưỡng («ngang», sàn so sánh, mục tiêu PTC, ngưỡng «đủ số liệu») **không khai báo lại** ở giao diện (máy chủ, `nguong` / `du_so_lieu`).

## Làm tròn

`formatPct1` (mới) và `formatPercent` (sửa ở 12c) làm tròn nửa lên về 0,1 điểm bằng số nguyên từ tỷ lệ 4 chữ số — cùng cách máy chủ tính `chenh_diem`, nên số hiển thị khớp phép trừ (56,8 − 61,2 = −4,4).

## Kiểm tra

- `npm run build` thành công. Dựng thử `DailyOpsPtcRow` với số giả trong trình duyệt (khung 1366 px và 375 px, không đăng nhập, không dữ liệu thật) cho 4 trạng thái: đủ số liệu có tháng; hôm nay chưa xử lý; đang tải; lỗi. Đã đo chiều cao hàng thẻ so với bản cũ (xem trên) và kiểm tra không có phần tử tràn / cắt chữ. **Chưa xem trên màn thật của hệ thống** (cần đăng nhập): bố cục / màu trên dữ liệu thật PO xem.
- Không có test tự động cho giao diện trong dự án.

## Chưa làm

Giao diện Tivi (số Tivi đổi theo quy tắc ngày đến; khối PTC / xếp hạng Tivi giữ nguyên). Khởi động nóng cho lần tính đầu của máy chủ (~11 giây ở cỡ dữ liệu giả lớn — xem `31_…`).
