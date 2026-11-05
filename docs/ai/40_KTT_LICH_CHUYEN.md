# 40 · KTT-7a / KTT-LICH-2 — Lịch chuyến chính thức (lịch chuẩn 05/11/2026) và hàm xếp chuyến

Nền cho KTT-7b (lưu thoát, đạt / không đạt). Ticket này CHỈ thêm lịch chuyến + các hàm thuần; **không** nối vào `kttQuery` / `kttTinh` / `kttDanhGia`, không API, không giao diện.

> **KTT-LICH-2 (05/11/2026):** lịch dưới đây là **LỊCH CHUẨN** PO chốt 05/11/2026 (file `KTT-LICH-CHUAN-05-11-2026.md`, nguồn chuẩn duy nhất), thay lịch KTT-7a (26/10), file lịch C2, canvas v22 B2, HANDOVER-KTT-27-10 và phần lịch của Quyết định #112 (xem `04_DECISIONS.md` #127). `kttQuery` / `kttLuuThoat` / bức tranh / KTT-12 đều đọc bảng `ktt_lich_chuyen`; lịch V1 (`ktt_cau_hinh_chuyen`) **không còn seed** và không dùng để xếp chuyến.

## 1. Lịch chuẩn 05/11/2026

Mốc = **giờ xe RỜI KTT** chở hàng cho BCVH đó. **Hạn hàng đến để kịp chuyến = giờ rời − 60 phút** (cấu hình được).

| BCVH (mã) | Ngày thường | Chủ nhật | `ngay_chay` từng dòng |
|---|---|---|---|
| Thuận Hóa (533140) | 07:00, 12:45, 12:55, 19:45, 22:00 | chạy đủ 5 chuyến | cả 5 `CA_TUAN` (22:00 là C4, hạn đến 21:00) |
| Hương Thủy (536250, xe lồng lưới) | 07:30, 12:45 | 07:30; 12:45 nghỉ | 07:30 `CA_TUAN`, 12:45 `NGHI_CN` |
| Hương Trà (535470, xe cấp 1) | 06:10, 12:00 | chạy cả hai | `CA_TUAN` |
| Thuận An (537015) | 07:30, 13:30 | 07:30; 13:30 nghỉ | 07:30 `CA_TUAN`, 13:30 `NGHI_CN` |
| Phú Lộc (537220) | 07:30, 13:00 | 07:30; 13:00 nghỉ | 07:30 `CA_TUAN`, 13:00 `NGHI_CN` |
| A Lưới (535790) | 08:00 | 08:00 (chạy) | `CA_TUAN` |

Tổng **14 dòng** (5 + 2 + 2 + 2 + 2 + 1). Lịch Chủ nhật của cả 6 BCVH đã xác nhận (không còn BCVH nào chưa xác nhận). KHÔNG đưa vào: tuyến Sân bay; Hương Thủy 10:00 / 16:00 (xe chở điểm nhỏ lẻ); Phú Vang; Bình Điền; chuyến BĐTP C2 rời KTT 16:00. Đây là lịch xe, không phải dữ liệu bưu gửi.

**Khác lịch cũ (26/10):** Thuận Hóa 12:30 → 12:45 và 12:55 nay chạy Chủ nhật; Hương Thủy 06:30 → 07:30 (Chủ nhật có chuyến 07:30), 12:30 → 12:45; Hương Trà 06:00 → 06:10 và Chủ nhật chạy chính thức (trước: «tạm tính cả tuần»); Thuận An, Phú Lộc, A Lưới khớp lịch cũ.

## 2. Bảng và migration (trong `server/lib/kttSchema.js`)

- `ktt_lich_chuyen(id, ma_bcvh, gio_xuat_phat 'HH:MM' CHECK GLOB, ngay_chay CHECK IN ('CA_TUAN','NGHI_CN'), nhan, ghi_chu, dang_dung 0|1 DEFAULT 1, cap_nhat_luc, ngay_chay_xac_nhan 0|1 DEFAULT 1, UNIQUE(ma_bcvh, gio_xuat_phat))`. `dang_dung = 0`: tắt chuyến mà không xóa. `ngay_chay_xac_nhan = 0`: lịch ngày chạy của dòng CHƯA xác nhận → bật cờ `luu_y_lich` ở ô Chủ nhật (nguồn duy nhất của cờ; hiện mọi dòng = 1). DB cũ được thêm cột bằng `ALTER TABLE` khi khởi động. **Chủ nhật được mô hình hóa ở mức dòng chuyến** (`ngay_chay`), không có cột chuyến mới.
- `ktt_lich_cau_hinh(khoa PK, gia_tri NUMERIC, mo_ta, cap_nhat_luc)` — khóa `han_den_truoc_chuyen_phut = 60`.
  **Vì sao bảng riêng:** thêm khóa vào `ktt_cau_hinh` làm hỏng hai assert của `tests/ktt-import.test.js` (đúng 4 khóa, `COUNT = 4`); PO chọn (26/10) lưu ở bảng mới để không đụng test cũ.
- **Migration một lần (KTT-LICH-2)**: khóa `lich_phien_ban` (số `YYYYMMDD`, hiện `20261105`) trong `ktt_lich_cau_hinh`. Khi khởi động, `ensureKttSchema` thấy khóa vắng hoặc nhỏ hơn thì, trong MỘT giao dịch (`apDungLichChuan`), đồng bộ `ktt_lich_chuyen` về `LICH_CHUYEN_MAC_DINH`: xóa dòng ngoài chuẩn, ghi đè dòng trùng (BCVH, giờ) (ngày chạy, nhãn, ghi chú, bật lại, xác nhận = 1), thêm dòng thiếu, rồi ghi khóa. DB «lai» (dòng cũ + mới) và DB mới đều về đúng 14 dòng; chạy lần hai không đổi gì, nên **giá trị PO sửa tay SAU migration không bị ghi đè** (như trước). Muốn đổi lịch chuẩn lần sau: sửa `LICH_CHUYEN_MAC_DINH` và tăng `LICH_PHIEN_BAN`. Dòng PO đã tắt (`dang_dung = 0`) hoặc sửa tay TRƯỚC migration bị ghi đè theo chuẩn.
- Chữ ký cache KTT (`kttApi.chuKyLich`) gồm cả `dang_dung`, `ngay_chay_xac_nhan` và `lich_phien_ban`: đổi lịch (hoặc phiên bản) thì request kế tiếp hủy toàn bộ cache theo ngày (có test).
- Nhãn: chỉ chuyến 22:00 Thuận Hóa có nhãn `C4`; các chuyến khác `NULL`. Cột `ghi_chu` ghi «xe lồng lưới» / «xe cấp 1» ở Hương Thủy, Hương Trà.

## 3. Module `server/lib/kttLichChuyen.js`

Các hàm thuần (không đọc DB, không dùng giờ máy, không đổi đầu vào). Giờ là chuỗi `YYYY-MM-DD HH:MM:SS` giờ VN; tự tách chuỗi, thứ trong tuần / cộng ngày bằng `Date.UTC(số)`; phần mili giây bị cắt.

- **`xepChuyen(lich, maBcvh, gioDen, tuyChon)`** — `gioDen` = `Gio_quet_tui_den`. Trả `{ ok: true, chuyen: { ma_bcvh, ngay, gio_xuat_phat, xuat_phat_luc, han_den_luc, nhan }, qua_dem }` hoặc `{ ok: false, ly_do }`, `ly_do` ∈ `KHONG_PHAI_BCVH_HUE` | `THIEU_GIO_DEN` | `GIO_DEN_SAI` | `KHONG_CO_LICH`. `tuyChon.hanDenTruocChuyenPhut` (mặc định 60).
- **`chuyenTrongNgay(lich, maBcvh, ngay, tuyChon)`** — các chuyến chạy trong ngày (loại dòng nghỉ Chủ nhật vào Chủ nhật và dòng tắt), tăng dần theo giờ.
- **`danhGiaDiChuyen({ chuyen, gioLapBd10Di, bayGio, gioDen })`** — `{ trang_thai, di_truoc_khi_den }`.
- **`docLichChuyen(db)`** — đọc `ktt_lich_chuyen` + `ktt_lich_cau_hinh` (CHỈ ĐỌC). Không ném lỗi: bảng thiếu / hỏng → lịch rỗng, thiếu / sai hạn → 60, kèm `canhBao[]`. Trả `{ lich: [{ ma_bcvh, gio_xuat_phat, ngay_chay, nhan, dang_dung, ngay_chay_xac_nhan }], hanDenTruocChuyenPhut, canhBao }`.
- **`lapNgayNghi(lich, maBcvh, gioLap)`** (KTT-LICH-2, hàm thuần) — `true` nếu giờ lập rơi vào Chủ nhật, BCVH có dòng đang dùng `NGHI_CN` và giờ lập SAU chuyến Chủ nhật cuối còn chạy (BCVH không còn chuyến Chủ nhật nào thì cả ngày). Dùng cho phương án A / B ở mục 7.
- **`bcvhChuaXacNhanChuNhat(lich)`** — các BCVH có dòng đang dùng với `ngay_chay_xac_nhan = 0` (nguồn của `luu_y_lich`).

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

## 4. Ví dụ (lịch chuẩn; 24/10/2026 thứ Bảy, 25/10 Chủ nhật, 26/10 thứ Hai)

| BCVH | Giờ đến | Chuyến thuộc | Ghi chú |
|---|---|---|---|
| Hương Thủy | T7 24/10 13:00 | CN 25/10 07:30 | Chủ nhật có chuyến 07:30; `qua_dem = true` |
| Hương Thủy | CN 25/10 08:00 | T2 26/10 07:30 | 12:45 nghỉ CN; chuyến Chủ nhật duy nhất đã đi |
| Hương Thủy | T2 26/10 06:20 | T2 26/10 07:30 | hạn 06:30 |
| Hương Thủy | T2 26/10 06:50 | T2 26/10 12:45 | đã quá hạn 06:30 của chuyến 07:30 |
| Hương Trà | 05:10:00 / 05:10:01 | 06:10 / 12:00 | biên hạn |
| Thuận Hóa | ngày thường 11:40 | 12:45 | hạn 11:45 |
| Thuận Hóa | ngày thường 11:50 | 12:55 | 12:45 quá hạn 11:45, hạn của 12:55 là 11:55 |
| Thuận Hóa | Chủ nhật 11:50 | 12:55 cùng ngày | Chủ nhật chạy đủ 5 chuyến |
| Thuận Hóa | 20:59:59 | 22:00 (C4) | hạn 21:00 |
| Thuận Hóa | 21:30 | 07:00 hôm sau | `qua_dem = true` |
| Thuận An / Phú Lộc | T7 sau 12:30 / 12:00 | CN 25/10 07:30 | 13:30 / 13:00 nghỉ CN không còn là chuyến Chủ nhật |

## 5. Điều chưa chắc
- Lịch hiện chỉ do PO sửa trực tiếp trong DB / bằng migration (chưa API / giao diện). Nhãn chuyến (ngoài C4) chưa có.
- Ngày lễ / ngoại lệ theo ngày chưa mô hình hóa (chỉ Chủ nhật).
- BD10 lập Chủ nhật sau chuyến cuối còn chạy (xem mục 7): quy ước, chưa biết đó là chuyến đột xuất hay lập trễ.

## 6. Test
`tests/ktt-lich-chuyen.test.js`: lịch chuẩn 14 dòng + chạy lại + giá trị sửa tay sau migration; migration từ DB cũ / «lai» (dòng cũ + mới) về đúng 14 dòng, lần hai không đổi gì; thêm cột `ngay_chay_xac_nhan` cho DB cũ; đọc bảng thiếu / hỏng; mỗi BCVH × ngày thường / Chủ nhật chọn đúng chuyến; Thuận Hóa Chủ nhật đủ 5 chuyến; Hương Thủy Chủ nhật chỉ 07:30; A Lưới chạy cả tuần; hàng đến sau chuyến cuối → chuyến đầu ngày kế; biên hạn ±1 giây; `lapNgayNghi`; ba `TZ` (`UTC`, `Asia/Ho_Chi_Minh`, `America/Los_Angeles`). Cache hủy khi đổi lịch: `tests/ktt-api.test.js` và `tests/ktt-xuat.test.js`.

## 7. BD10 lập ngày chuyến nghỉ (KTT-LICH-2, Quyết định #127)
«Ngày có chuyến nghỉ» = Chủ nhật của Hương Thủy (12:45), Thuận An (13:30), Phú Lộc (13:00). BD10 đi lập vào ngày đó SAU chuyến Chủ nhật cuối còn chạy (07:30) là «lập ngày nghỉ» (`lapNgayNghi`).
- **Phương án A — bảng KTT-12 (`/api/ktt/lich-xe/gio-lap-bd10`)**: các BD10 này KHÔNG gán chuyến ngày kề; đếm riêng ở `lap_ngay_nghi: { tong_bd10, theo_bcvh[] }`; loại khỏi `so_bd10_lap_sau_gio_xe` và khỏi số BD10 của các nhóm. `tong_bd10` vẫn là tổng mọi BD10 đi (= số trong các nhóm kể cả nhóm bị lọc + `lap_ngay_nghi.tong_bd10`).
- **Phương án B — `/luu-thoat`, `/luu-thoat/khong-dat-14h`**: chỉ cờ phụ, KHÔNG đổi định nghĩa «đi đúng chuyến» / «trượt chuyến» / mẫu số. `/luu-thoat`: `meta.lap_ngay_nghi_shbg` và `meta.lap_ngay_nghi` (theo BCVH); `khong-dat-14h`: khối `lap_ngay_nghi` cùng số (bưu gửi có BD10 đi lập ngày nghỉ, vẫn nằm trong mẫu số và nhóm nguyên nhân).
- Đo trên bản sao DB, 30 ngày (05/10–03/11/2026, 4 Chủ nhật): Hương Thủy 8 BD10 (489 bưu gửi), Thuận An 0, Phú Lộc 0. Chỉ 4 Chủ nhật: mẫu nhỏ.

## 8. Định nghĩa «đổi thực» (dùng khi so lịch cũ ↔ chuẩn)
«Đổi nhãn» = khóa chuyến khác (kể cả cùng chuyến đổi giờ: hạn chốt đổi nên mọi bưu gửi vào chuyến đó bị tính). **«Đổi thực»** = sau khi coi 06:00→06:10 (Hương Trà), 12:30→12:45 (Thuận Hóa), 06:30→07:30 và 12:30→12:45 (Hương Thủy) là CÙNG một chuyến, bưu gửi vào khe giờ / ngày KHÁC. Trên bản sao DB 30 ngày (mốc A / B): Thuận Hóa thường 1.694 / 2.053, Chủ nhật 147 / 213; Hương Trà thường 0 / 48, Chủ nhật 24 / 24; Hương Thủy thường 4.457 / 5.230, Chủ nhật 477 / 1.248; Thuận An, Phú Lộc, A Lưới 0.
