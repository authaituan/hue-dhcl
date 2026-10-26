# 40 · KTT-7a — Lịch chuyến chính thức và hàm xếp chuyến

Nền cho KTT-7b (lưu thoát, đạt / không đạt). Ticket này CHỈ thêm lịch chuyến + các hàm thuần; **không** nối vào `kttQuery` / `kttTinh` / `kttDanhGia`, không API, không giao diện.

> **Lưu ý quan trọng (tạm thời):** `kttQuery.js` (qua `kttCauHinh.js`) **vẫn dùng lịch V1** ở bảng `ktt_cau_hinh_chuyen` (12 mốc SÁNG / TRUA / TOI, «ước lượng từ giờ đi thực tế») cho đến **KTT-7b**. Bảng mới `ktt_lich_chuyen` chưa có nơi nào ngoài `kttLichChuyen.js` đọc nó. Bảng V1 và `ktt_cau_hinh` KHÔNG bị đổi.

## 1. Lịch chuyến chính thức (PO duyệt 26/10/2026)

Mốc = **giờ xe RỜI KTT** chở hàng cho BCVH đó. **Hạn hàng đến để kịp chuyến = giờ rời − 60 phút** (cấu hình được).

| BCVH (mã) | Giờ rời KTT | Ngày chạy |
|---|---|---|
| Hương Trà (535470) | 06:00, 12:00 | cả tuần (PO chưa rõ Chủ nhật, TẠM tính cả tuần) |
| Hương Thủy (536250) | 06:30, 12:30 | nghỉ Chủ nhật |
| A Lưới (535790) | 08:00 | cả tuần (một chuyến) |
| Thuận An (537015) | 07:30 | cả tuần |
| Thuận An (537015) | 13:30 | nghỉ Chủ nhật |
| Phú Lộc (537220) | 07:30 | cả tuần |
| Phú Lộc (537220) | 13:00 | nghỉ Chủ nhật |
| Thuận Hóa (533140) | 07:00, 12:30, 19:45, 22:00 | cả tuần (22:00 là C4, hạn đến 21:00) |
| Thuận Hóa (533140) | 12:55 | nghỉ Chủ nhật (sát 12:30, vẫn là hai mốc riêng) |

Tổng **14 dòng**. KHÔNG đưa vào: tuyến Sân bay; Hương Thủy 10:00 / 16:00 (xe chở điểm nhỏ lẻ); Phú Vang; Bình Điền; chuyến BĐTP C2 rời KTT 16:00 (đi Sân bay, không ghé Thuận Hóa). Nguồn: `ktt-gio-xe-c2.csv` (`chuyen_moi_tuan`: 7 = cả tuần, 6 = nghỉ CN). Đây là lịch xe, không phải dữ liệu bưu gửi.

## 2. Bảng (trong `server/lib/kttSchema.js`, `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`)

- `ktt_lich_chuyen(id, ma_bcvh, gio_xuat_phat 'HH:MM' CHECK GLOB, ngay_chay CHECK IN ('CA_TUAN','NGHI_CN'), nhan, ghi_chu, dang_dung 0|1 DEFAULT 1, cap_nhat_luc, UNIQUE(ma_bcvh, gio_xuat_phat))`. `dang_dung = 0`: tắt chuyến mà không xóa.
- `ktt_lich_cau_hinh(khoa PK, gia_tri NUMERIC, mo_ta, cap_nhat_luc)` — khóa `han_den_truoc_chuyen_phut = 60`.
  **Vì sao bảng riêng:** thêm khóa vào `ktt_cau_hinh` làm hỏng hai assert của `tests/ktt-import.test.js` (đúng 4 khóa, `COUNT = 4`); PO chọn (26/10) lưu ở bảng mới để không đụng test cũ.
- Giá trị PO sửa tay (giờ, ngày chạy, `dang_dung`, hạn 60) **không bị ghi đè** khi chạy lại `ensureKttSchema` (`INSERT OR IGNORE`, như lịch V1). Lưu ý (giống V1): dòng mặc định PO XÓA sẽ được thêm lại ở lần chạy sau — muốn bỏ chuyến thì đặt `dang_dung = 0`.
- Nhãn: chỉ chuyến 22:00 Thuận Hóa có nhãn `C4`; các chuyến khác `NULL` (PO chưa cung cấp).

## 3. Module `server/lib/kttLichChuyen.js`

Các hàm thuần (không đọc DB, không dùng giờ máy, không đổi đầu vào). Giờ là chuỗi `YYYY-MM-DD HH:MM:SS` giờ VN; tự tách chuỗi, thứ trong tuần / cộng ngày bằng `Date.UTC(số)`; phần mili giây bị cắt.

- **`xepChuyen(lich, maBcvh, gioDen, tuyChon)`** — `gioDen` = `Gio_quet_tui_den`. Trả `{ ok: true, chuyen: { ma_bcvh, ngay, gio_xuat_phat, xuat_phat_luc, han_den_luc, nhan }, qua_dem }` hoặc `{ ok: false, ly_do }`, `ly_do` ∈ `KHONG_PHAI_BCVH_HUE` | `THIEU_GIO_DEN` | `GIO_DEN_SAI` | `KHONG_CO_LICH`. `tuyChon.hanDenTruocChuyenPhut` (mặc định 60).
- **`chuyenTrongNgay(lich, maBcvh, ngay, tuyChon)`** — các chuyến chạy trong ngày (loại dòng nghỉ Chủ nhật vào Chủ nhật và dòng tắt), tăng dần theo giờ.
- **`danhGiaDiChuyen({ chuyen, gioLapBd10Di, bayGio, gioDen })`** — `{ trang_thai, di_truoc_khi_den }`.
- **`docLichChuyen(db)`** — đọc `ktt_lich_chuyen` + `ktt_lich_cau_hinh` (CHỈ ĐỌC). Không ném lỗi: bảng thiếu / hỏng → lịch rỗng, thiếu / sai hạn → 60, kèm `canhBao[]`. Trả `{ lich: [{ ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung }], hanDenTruocChuyenPhut, canhBao }`.

### Quy tắc xếp chuyến
1. Chuyến thuộc = chuyến **SỚM NHẤT** của BCVH, tính từ **ngày đến**, có **`gioDen ≤ han_den_luc`** (đến đúng hạn vẫn kịp; trễ 1 giây thì chuyến kế).
2. Hết chuyến trong ngày đến thì sang **ngày kế**; ngày không chạy (dòng `NGHI_CN` vào Chủ nhật) bị bỏ. Tìm **tối đa 7 ngày kế** (`SO_NGAY_TIM_TOI_DA`), quá thì `KHONG_CO_LICH`. Dòng `dang_dung = 0` không tính.
3. Giờ xuất phát KHÔNG trừ gì; `han_den_luc = xuất phát − han_den_truoc_chuyen_phut`.
4. `qua_dem = true` nếu ngày của chuyến thuộc khác ngày đến.
5. Mã ngoài sáu BCVH Huế (lấy từ `DIA_BAN_PHAT_MAC_DINH` của `kttSchema.js`) → `KHONG_PHAI_BCVH_HUE`.

### Đánh giá đi chuyến
- Có `gioLapBd10Di` (`bd10_di_gio_di`): `DUNG_CHUYEN` nếu `≤ xuat_phat_luc`, ngược lại `TRUOT_CHUYEN`; `di_truoc_khi_den = true` nếu `gioLapBd10Di < gioDen` (chỉ gắn cờ; KTT-7b tách riêng nhóm «quét đến sau khi BD10 đã đi»).
- Chưa có BD10 đi: `CHUA_DEN_GIO` nếu `bayGio ≤ xuat_phat_luc`, ngược lại `LO_CHUYEN`. `bayGio` do người gọi truyền (hàm không lấy giờ máy).
- Đầu vào sai → `{ trang_thai: null, ly_do }` với `CHUYEN_SAI` | `GIO_BD10_SAI` | `THIEU_BAY_GIO` | `BAY_GIO_SAI`.

## 4. Ví dụ (lịch mặc định; 24/10/2026 thứ Bảy, 25/10 Chủ nhật, 26/10 thứ Hai)

| BCVH | Giờ đến | Chuyến thuộc | Ghi chú |
|---|---|---|---|
| Hương Thủy | T7 24/10 13:00 | T2 26/10 06:30 | Chủ nhật không có chuyến; `qua_dem = true` |
| Hương Thủy | T2 26/10 05:20 | T2 26/10 06:30 | hạn 05:30 |
| Hương Thủy | T2 26/10 05:50 | T2 26/10 12:30 | đã quá hạn 05:30 của chuyến 06:30 |
| Hương Trà | 05:00:00 / 05:00:01 | 06:00 / 12:00 | biên hạn |
| Thuận Hóa | ngày thường 11:40 | 12:55 | hạn 11:55 (12:30 có hạn 11:30 đã qua) |
| Thuận Hóa | Chủ nhật 11:40 | 19:45 cùng ngày | 12:55 nghỉ CN, 12:30 quá hạn |
| Thuận Hóa | 20:59:59 | 22:00 (C4) | hạn 21:00 |
| Thuận Hóa | 21:30 | 07:00 hôm sau | `qua_dem = true` |

## 5. Điều chưa chắc
- Ví dụ trong ticket «đến thứ Hai **05:50** → 06:30 cùng ngày» mâu thuẫn với quy tắc hạn (06:30 − 60 phút = 05:30, nên 05:50 là trễ). Đã cài theo QUY TẮC (05:50 → 12:30; 05:20 → 06:30); PO xác nhận con số ví dụ.
- Hương Trà Chủ nhật: tạm cả tuần.
- Lịch hiện chỉ do PO sửa trực tiếp trong DB (chưa API / giao diện). Nhãn chuyến (ngoài C4) chưa có.
- KTT-7b phải nối `docLichChuyen` + `xepChuyen` vào `kttQuery` / `kttTinh` / `kttDanhGia` và quyết định số phận lịch V1 + cột `gio_chot_truoc_phut`.

## 6. Test
`tests/ktt-lich-chuyen.test.js` (19 ca, DB tạm trong bộ nhớ): 14 dòng mặc định + chạy lại + giá trị sửa tay; đọc bảng thiếu / hỏng; các ví dụ ở mục 4; biên hạn ±1 giây và hạn tham số; cuối tháng, cuối năm, 29/02, 28/02; bốn `ly_do` lỗi; `chuyenTrongNgay`; bốn trạng thái đi chuyến + cờ `di_truoc_khi_den`; hàm thuần không đổi đầu vào; kiểm tĩnh mã nguồn (không `Date.parse` / `Date.now` / `new Date(chuỗi)`); ba `TZ` (`UTC`, `Asia/Ho_Chi_Minh`, `America/Los_Angeles`).
