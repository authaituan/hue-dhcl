# DASH-12c — Giao diện «từ đầu tháng» cho hàng thẻ kết quả phát (web «Điều hành hôm nay»)

> Dùng endpoint DASH-12b (`GET /api/arrivals/dashboard/ket-qua-phat-thang`, #91). Chỉ giao diện web; **Tivi không đổi** (Tivi 403 ở endpoint tháng).

## Hiển thị (mỗi thẻ: PTC, Phát không thành công, Chuyển hoàn, Lạc hướng, Chưa có TT phát)

Khối `PtcThangBlock` (`src/components/arrivals/DailyOpsPtcThang.jsx`) dưới nội dung hiện có của thẻ:
1. **Lũy kế**: «Từ đầu tháng MM — dd/MM–dd/MM», số bưu gửi + tỷ lệ (PTC kèm «tử / mẫu»). Không có số liệu phát trong tháng: «Chưa có số liệu phát trong tháng».
2. **Chênh «điểm so với tháng»**: lấy nguyên `chenh[mã].chenh_diem` / `huong` do máy chủ tính (không tự trừ ở giao diện). `ngang` → «≈ Ngang tháng (±x điểm)» trung tính. `chenh = null` → «Chưa đủ dữ liệu để so với tháng». Màu do giao diện: PTC tăng là tốt (xanh), giảm là xấu (đỏ); bốn loại còn lại tăng là xấu (đỏ), giảm là tốt (xanh).
3. **Đường diễn biến** SVG theo `theo_ngay[]` (đủ ngày 01 → ngày dữ liệu); giá trị `null` ngắt đường; ngày lẻ loi vẽ thành chấm; chấm đậm ở ngày cuối có số liệu. `aria-label` nêu khoảng ngày và số ngày có số liệu.
4. Cảnh báo nhỏ «x/y ngày có số liệu phát» khi `so_ngay_co_so_lieu < so_ngay_trong_khoang`.
5. Khi đang tải: «Từ đầu tháng: …»; lỗi / 403 / chưa có ngày dữ liệu: «chưa có số liệu» (các khối khác không bị ảnh hưởng).

## Nối dữ liệu

- `DailyOpsDashboard.jsx`: `fetchData` gọi riêng `ket-qua-phat-thang?bcvh=<mã|all>` **không chờ** (máy chủ tính ~1 giây khi dữ liệu đổi, lần đầu sau khởi động ~6–7 giây ở cỡ dữ liệu giả lớn); `thangReq` (ref) bỏ kết quả của lần gọi cũ khi đã đổi BCVH / có lần gọi mới hơn; làm mới theo chu kỳ 60 giây có sẵn (máy chủ có cache).
- `DailyOpsPtcRow.jsx`: nhận prop `thang`, chèn `PtcThangBlock` vào 5 thẻ.
- Ngưỡng «ngang», số ngày tối thiểu, sàn mẫu số **không khai báo lại** ở giao diện (nằm ở máy chủ, `nguong`).

## Làm tròn

`formatPct1` (mới) và `formatPercent` (sửa) làm tròn nửa lên về 0,1 điểm bằng số nguyên từ tỷ lệ 4 chữ số — cùng cách máy chủ tính `chenh_diem`, nên số hiển thị khớp phép trừ (56,8 − 61,2 = −4,4). `formatPercent` dùng chung cả trang: chỉ khác bản cũ ở các giá trị sát nửa (sai số dấu phẩy động của `r * 100`).

## Kiểm tra

- `npm run build` thành công. Dựng thử `PtcThangBlock` bằng `react-dom/server` với số giả (đạt các trạng thái: có chênh giảm / tăng, `null`, đang tải, lỗi, ngày thiếu): đúng chữ và đúng số. **Chưa xem trên trình duyệt** (không đăng nhập): bố cục / màu / đường diễn biến trên màn thật cần PO xem.
- Không có test tự động cho giao diện trong dự án.

## Chưa làm

Tivi (không dùng khoảng ngày). Khởi động nóng cho lần tính đầu của máy chủ. Bản xem trên màn hình thật / mobile.
