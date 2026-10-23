# 37 — «Hàng tại KTT»: hàm thuần tính toán và cấu hình (KTT-4)

> Phạm vi: lõi tính toán THUẦN + đọc cấu hình. Chưa có truy vấn tổng hợp, API, cache, giao diện, quyền (các ticket sau). Quy tắc: `KTT-quy-tac-tinh.md` (V1, PO chốt 23/10/2026; file này không có trong repo — các quy tắc dưới đây lấy từ ticket KTT-4).
> Mã: `server/lib/kttTinh.js` (hàm thuần, chỉ `require('./quyThoiGian')`), `server/lib/kttCauHinh.js` (đọc `ktt_cau_hinh_chuyen`, `ktt_cau_hinh` của KTT-2). Test: `tests/ktt-tinh.test.js`, `tests/ktt-cau-hinh.test.js`.

## 1. Quy ước chung

- Giờ là chuỗi `YYYY-MM-DD HH:MM:SS` giờ địa phương; đọc bằng `docGiay`; mọi phép trừ bằng giây UTC cố định, không làm tròn; kết quả không phụ thuộc `TZ` (test chạy ở UTC, Asia/Ho_Chi_Minh, America/Los_Angeles). Không dùng `new Date(chuỗi)` / `Date.parse`.
- `bay_gio` (giờ hiện tại) do bên gọi truyền vào. Hàm không đọc đồng hồ.
- KHÔNG chỉnh mốc: số âm và NULL là kết quả hợp lệ có nhãn riêng. Mốc không đọc được (rỗng, `NULL`, sai định dạng) coi như vắng.
- Chỉ chấm F1.3 và chuyến cho hàng có đích là một trong 6 BCVH Huế (`MA_BCVH_HUE`: 535790, 536250, 535470, 537220, 537015, 533140). Đích khác chỉ có giờ nằm.
- Không đối chiếu dữ liệu phát phía BCVH. «Treo» là bằng chứng KTT không làm đúng quy trình, không phải tồn thật.

## 2. Hàm và nhãn trả về (`kttTinh.js`)

| Hàm | Trả về |
|---|---|
| `phanNhomDich({ maNhanBd10Di, maPhuongXa, bangPhuongXa })` | `{ nhom, maBcvh, nguon }`. Có BD10 đi → `maNhanBd10Di` (`nguon: 'BD10_DI'`); chưa có → tra `bangPhuongXa[maPhuongXa]` (`'PHUONG_XA'`); không tra được → `KHONG_RO` (không chấm F1.3, vẫn tính sản lượng / khối lượng). `nhom`: `BCVH_HUE` (kèm `maBcvh`), `HE1_530900` (không chấm), `KTT` (530100), `KHAC`, `KHONG_RO`. `chieu`, `maNhanTui` được nhận nhưng chưa dùng ở V1. |
| `tinhChiTieu({ xnd, gioDi, bay_gio, maBcvh, maPhuong, nguong })` | `{ trangThai, daQuaGiay, conLaiGiay, chiTieuGio }`. Bắt đầu = `xnd`; kết thúc = `gioDi`, chưa đi thì `bay_gio`; thời gian thực trừ khung 21:00–07:00. Chỉ tiêu 14 giờ; 12 giờ cho phường 49135, 49133 (Thuận Hóa, Phú Xuân). `trangThai`: `DO_DUOC`, `XND_SAU_GIO_DI` (hiệu âm; `conLaiGiay` null), `CHUA_XAC_NHAN_DEN`, `CAN_KIEM_TRA_LAI` (cách > 7 ngày đồng hồ, vẫn trả số thô), `KHONG_CHAM` (đích không phải BCVH Huế), `THIEU_BAY_GIO`. |
| `namThucTe({ quetDen, gioDi, bay_gio })` | `{ trangThai, giay, daDi }`: giây ĐỒNG HỒ LIÊN TỤC (không trừ đêm) từ mã 4 đến `gioDi`/`bay_gio`. `DO_DUOC`, `QUET_DEN_SAU_GIO_DI` (âm), `KHONG_CO_MOC_QUET_DEN`, `THIEU_BAY_GIO`. |
| `doTreXacNhan({ quetDen, xnd })` | `{ trangThai: 'DO_DUOC' \| 'THIEU_MOC', giay }`: `xnd − quetDen` liên tục, chỉ để xem (có thể âm). |
| `phanBacNamLau(giay)` | `AM` (< 0), `A_DEN_3H` (≤ 3 giờ), `B_3_6H`, `C_6_12H`, `D_12_24H`, `E_TREN_24H`; `KHONG_RO` nếu không phải số. Bậc cao hơn chỉ khi VƯỢT mốc (180 phút → A, 181 phút → B). |
| `danhGiaChuyen({ quetDen, gioDi, bay_gio, maBcvh, cauHinh })` | Mục 3. |
| `trangThaiNamLau({ nhomDich, gioDi, giayNam, danhGiaChuyen, nguong })` | `{ trangThai, lyDo }`, chỉ cho hàng ĐÃ đi. `NAM_LAU` (`lyDo` `TRE_CHUYEN` hoặc `QUA_NGUONG` khi `giayNam > namLauToiDaPhut × 60`), `BINH_THUONG`, `KHONG_DANH_GIA` (`lyDo`: `DICH_KHONG_PHAI_BCVH_HUE`, `CHUA_DI`, `THIEU_SO_LIEU`, `GIO_NAM_AM`). |
| `trangThaiTreo({ chieu, luong, nhomDich, quetDen, coMoTui, coQuetDi, coBd10Di, bay_gio, nguong })` | `{ trangThai, tuoiGiay, tuoi }`. `CHUA_QUET_DI` (chiều `CHUYEN_TIEP_DI`, đích khác 530900, không mã 3, không BD10 đi), `CHUA_MO_TUI` (chiều `DEN` — MỌI luồng, kể cả `DI_NGOAI` và `KHAI_THAC_DEN`; chưa mở túi; túi chiều đi như `KHAI_THAC_DI` không thuộc loại này; `luong` được nhận nhưng không xét), cả hai khi `bay_gio − quetDen > treoPhut × 60` (đúng 180 phút chưa treo, 181 treo; đồng hồ liên tục); `CHUA_DEN_NGUONG`; `KHONG_CO_MOC_QUET_DEN` (hàng thuộc diện xét nhưng thiếu mã 4); `THIEU_BAY_GIO`; `KHONG_TREO`. `tuoi` (chỉ khi treo): `T_3_12H`, `T_12_24H`, `T_1_3N`, `T_TREN_3N` (`DUOI_3H` nếu `treoPhut` cấu hình < 180). |
| `sinhMocChuyen(lich, ngayDauGiay, soNgay)`, `dinhDangGiay(giay)` | Hàm phụ (xuất để test): mốc chuyến tăng dần theo giây; giây → chuỗi giờ. |

`nguong` = `{ treoPhut, namLauToiDaPhut, chiTieuF13Gio, chiTieuF13GioThuanHoaPhuXuan }`; thiếu / không phải số dương → `NGUONG_MAC_DINH` (180 / 1440 / 14 / 12).

## 3. Chuyến (`danhGiaChuyen`)

- Mốc chuyến sinh theo ngày từ `cauHinh.lich[maBcvh]` (`{ ten, gioMoc 'HH:MM', chotTruocPhut }`): từ ngày quét đến, tối thiểu 4 ngày và đủ phủ tới `gioDi` (chưa đi: `bay_gio`), tối đa 400 ngày.
- **Chuyến đáng lẽ đi** = mốc SỚM NHẤT có `mốc − chotTruocPhut ≥ quetDen` (quét đúng `mốc − 30 phút` vẫn kịp; `mốc − 29 phút` thì lỡ).
- `trangThai`: `DUNG_CHUYEN` (đã đi, `gioDi ≤ mốc dự kiến`), `TRE_CHUYEN` (đã đi muộn hơn), `LO_CHUYEN` (chưa đi, `bay_gio > mốc dự kiến`), `CHUA_DEN_MOC`, `KHONG_AP_DUNG` (kèm `lyDo`: `DICH_KHONG_PHAI_BCVH_HUE`, `KHONG_CO_LICH`, `THIEU_MOC_QUET_DEN`, `THIEU_BAY_GIO`).
- `soChuyenTre` = số mốc `m` với `mốc dự kiến ≤ m < gioDi` (`TRE_CHUYEN`) hoặc `< bay_gio` (`LO_CHUYEN`); trạng thái khác 0; `KHONG_AP_DUNG` null.
- `denSatGio` = `quetDen ∈ (mốc − chot, mốc]` của một chuyến (`chuyenSatGio`: chuyến đó, tính là lỡ; chuyến dự kiến là chuyến kế tiếp). `kipChuyenSat` = `gioDi ≤ mốc` chuyến sát giờ; `null` khi không sát giờ hoặc chưa đi. `gioDiTruocQuetDen` = cờ dữ liệu bất thường (`gioDi < quetDen`), không chỉnh.

## 4. `docCauHinhKtt(db)` (`kttCauHinh.js`)

Trả `{ lich, nguong, canhBao }`; `lich[maBcvh]` = mảng `{ ten, gioMoc, chotTruocPhut }` sắp tăng theo `gioMoc`. Chỉ ĐỌC. Thiếu bảng → lịch rỗng / ngưỡng mặc định + `canhBao` (không ném lỗi); thiếu hoặc hỏng một khóa ngưỡng → mặc định + `canhBao` nêu khóa; dòng mốc không hợp lệ bị bỏ + `canhBao`. Khóa trong `ktt_cau_hinh`: `treo_phut`, `nam_lau_toi_da_phut`, `chi_tieu_f13_gio`, `chi_tieu_f13_gio_thuan_hoa_phu_xuan`.

## 5. Điều chưa chắc

- `KTT-quy-tac-tinh.md` không có trong repo: nhãn và công thức lấy theo ticket KTT-4. Bảng bậc «3l» chỉ biết qua ticket (A ≤ 3 giờ, B 3–6, C 6–12, D 12–24, E > 24); nhãn bậc tuổi của «treo» (`T_*`) do KTT-4 đặt tên.
- `CHUA_MO_TUI` xét mọi túi chiều `DEN` theo chỉ đạo của PO (đã bỏ hằng `LUONG_CAN_MO_TUI`).
- `phanNhomDich` chưa dùng `chieu` và `maNhanTui`; chưa có bảng địa bàn phát (phường/xã → BCVH), ticket sau.
- Nhãn bổ sung ngoài ticket: `THIEU_BAY_GIO`, `lyDo`, `chuyenSatGio`, `gioDiTruocQuetDen`, `tuoiGiay`.
