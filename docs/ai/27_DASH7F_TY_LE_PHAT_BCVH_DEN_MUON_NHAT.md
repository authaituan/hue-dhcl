# DASH-7f — Tỷ lệ phát: mỗi SHBG trong ngày chỉ tính cho BCVH có mốc đến MUỘN NHẤT (backend)

> Quy tắc PO 16/10/2026 13:55–14:04. Nối tiếp `23_…` … `26_DASH7E_…`. Chỉ backend; không đọc DB gốc / `.env`; dữ liệu test giả.

## 1. File sửa / mới

| File | Nội dung |
|---|---|
| `server/lib/phat.js` | `GAN_CTE` / `GAN_JOIN` / `runGan` mới (trước `demNgay`); `demNgay` (tham số `{demLoaiBo}`), `tonCho`, `tyLeApi` (trường mới) |
| `server/lib/phatDashboard.js` | `motBcvh` (gọi `demNgay` có `demLoaiBo`), `ketQuaPhat` (cộng `loaiBo`, trường mới) |
| `tests/phat-bcvh-muon-nhat.test.js` | mới, 7 ca, dữ liệu giả, cổng 5939 |
| `tests/phat.test.js`, `tests/phat-dashboard.test.js`, `tests/phat-cung-ngay.test.js` | sửa có chủ đích (mục 5) |
| `package.json`, `docs/ai/27_…`, `CHANGELOG_AI.md`, `00_SNAPSHOT.md` | thêm test vào `npm test`; tài liệu |

Không sửa `src/`, `dashboardDenQuery.js`, `arrivalsQuery.js`. Mã khớp báo cáo 26 (`demNgay`, `tapNgayChung`, `ketQuaPhat`).

## 2. Việc 0 — khảo sát

- **(a)** Trạng thái phát gắn theo (BCVH, SHBG): bảng `phat_status_current`, khóa chính `(bcvh, shbg)` (`phat.js` lược đồ). Một SHBG có thể có bản ghi riêng ở từng BCVH.
- **(b)** Tử số KHÔNG loại hàng đi ngoài: `demNgay` không dùng `DI_NGOAI_SQL`. Giữ nguyên, không phải dừng hỏi.
- **(c)** «Ngày» của `demNgay` = `arrival_date` của dòng ở BCVH đó, cửa sổ `arrival_at` trong [ngày 00:00:00, ngày 23:59:59] (`den.windowFilter(bcvh, day, '23:59:59')`); mỗi SHBG một dòng đại diện (mốc SỚM nhất tại BCVH — R2, `buildCountedCte`).
- **(d)** Mẫu số trước DASH-7f: số SHBG khác nhau trong BCVH đó ngày đó (công thức A theo BCVH), `bcvh=all` cộng các BCVH.
- **(e)** Không dừng. Mỗi SHBG nay chỉ thuộc đúng một BCVH trong ngày, và tử số của BCVH đó luôn là bản ghi `(BCVH đó, SHBG)` — khóa rõ, không mơ hồ. Hệ quả cần PO biết: bản ghi của BCVH đến TRƯỚC (đã nhập khi hàng còn ở đó) bị bỏ qua cho ngày đó; nếu BCVH muộn nhất chưa nhập thì SHBG tính «chưa có thông tin phát» dù BCVH trước đã có trạng thái. Nếu PO muốn kế thừa trạng thái từ BCVH trước, cần ticket riêng.

## 3. Việc 1 — cách gán

CTE `g` (trong `phat.js`, nối vào CTE của `buildCountedCte` nên dùng đúng `s`/R2 của hàm có sẵn): với các SHBG có trong `s`, lấy mọi dòng của MỌI BCVH hợp lệ (`VALID_BCVH_CODES`) trong khoảng ngày xét, gộp theo (SHBG, `arrival_date`, BCVH) lấy `MIN(arrival_at)` (= R2 của BCVH đó), rồi `ROW_NUMBER() OVER (PARTITION BY SHBG, ngày ORDER BY mốc DESC, mã BCVH ASC)`; `rk = 1` là BCVH được tính. `s` ghép `g` theo (SHBG, `s.arrival_date`, BCVH đang tính, `rk = 1`). Lý do xét mọi BCVH (không chỉ phạm vi chọn): quy tắc 1 và 5 — tỷ lệ một BCVH không đổi theo bộ lọc. Khi `bcvh=all` không chọn `ngay`, tập BCVH được cộng vẫn là tập ngày chung (DASH-7e); với tập T mọi dòng trong ngày chung nằm trong T nên kết quả khớp `tong-quan-den`. Hàng đi ngoài: không xử lý riêng.
- Ngày (quy tắc 5): đúng định nghĩa `demNgay` (mục 2c); mỗi ngày tranh chấp riêng. Ví dụ B: M 15/10 22:00, M2 16/10 03:00 → ngày 15 tính M, ngày 16 tính M2.
- `tonCho` (cửa sổ nhiều ngày): tranh chấp theo `arrival_date` của dòng đại diện. Giới hạn đã biết: SHBG có dòng đại diện (sớm nhất cửa sổ) ở ngày trước mà BCVH đó thua ngày đó thì không vào tồn chờ của BCVH dù đến lại ở ngày xét.

## 4. Việc 2–3 — trường mới và đối chiếu

- Trường mới (chỉ thêm): `so_shbg_chuyen_tiep_loai_bo` ở `GET /api/phat/ty-le` và `ket-qua-phat`. Một BCVH: số SHBG bị loại khỏi mẫu số vì thuộc BCVH khác. `bcvh=all`: tổng số lần gán lại trong tập đang cộng (= số SHBG qua ≥ 2 BCVH khi mỗi SHBG chỉ qua 2 BCVH; khác ticket «bằng 0»: chọn số này để giải thích chênh lệch, mẫu số vẫn đếm mỗi SHBG một lần).
- Đối chiếu bằng test (g): mẫu số `bcvh=all` = `san_luong.buu_gui` của `tong-quan-den` ở ngày chung và ở ngày rõ ràng (15, 16/10).
- Số khác dùng chung `demNgay` cùng đổi: `tyLeNgay` (tỷ lệ «trước/sau» khi nhập đợt và hoàn tác, từng BCVH), khung giờ đến, tồn chờ, xếp hạng BCVH và `chua_du_du_lieu` (mẫu số dưới sàn 50 có thể đổi với BCVH chuyển tiếp).

## 5. Test cũ sửa

- `tests/phat.test.js` (ca «tỷ lệ: mẫu số = …», ~dòng 939) và `tests/phat-dashboard.test.js` (~dòng 392, 399): danh sách khoá thêm `so_shbg_chuyen_tiep_loai_bo` (chỉ thêm trường).
- `tests/phat-cung-ngay.test.js` ca (4): ngày 15/10 có S1 qua 2 BCVH, mẫu số phát 7 → 6 (= `buu_gui`; `tong_cong_theo_bcvh` vẫn 7); ca (c): `2 + 2 + 3` → `1 + 2 + 3` (S1 chỉ tính cho M2, mốc muộn hơn). Lý do: hai khẳng định đó chính là công thức A của hàng chuyển tiếp.

## 6. Test mới (`tests/phat-bcvh-muon-nhat.test.js`)

(a) A: M 08:00 → M2 13:00, M2 có A, M không, `all` một lần; (b) qua nửa đêm; (c) hòa mốc → M (mã nhỏ); (d) hàng đi ngoài (BD8 = SHBG) ở 2 BCVH tính như mọi SHBG; (e) SHBG chỉ một BCVH y như trước; R2: G có dòng 08:00 và 15:00 ở M, 10:00 ở M2 → M2; (f) 5 trạng thái cộng bằng mẫu số ở từng BCVH và tổng; (g) đối chiếu `tong-quan-den`; (h) BCVH chậm vẫn ngoài tổng; `tyLeNgay`, `tonCho`.

## 7. `npm test`

Xem dòng tổng kết ở báo cáo cuối phiên (chạy một lần).

## 8. Hệ quả đã biết

- Số đổi: mẫu số/tử số/khung giờ/tồn chờ của tỷ lệ phát khi có SHBG qua ≥ 2 BCVH cùng ngày (≈ 7‰ ở dữ liệu đo 15/10); BCVH chuyển tiếp đi không còn bị tính «chưa phát». Không đổi `tong-quan-den`.
- Giao diện chưa dùng `so_shbg_chuyen_tiep_loai_bo`. Còn lại: gộp `tapNgayChung` với tập T của `dashboardDenQuery.js`; kế thừa trạng thái từ BCVH trước (nếu PO muốn, mục 2e).
- PO khởi động lại server sau khi merge.

## 9. Xác nhận

Không sửa `src/`, `dashboardDenQuery.js`, `arrivalsQuery.js`; không đọc DB gốc hay `.env`; không `git add`/commit/push; không `npm install`/`ci`; dữ liệu test và tài liệu đều giả.
