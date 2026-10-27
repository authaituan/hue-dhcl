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

## 6. KTT-10b — chỉ tiêu «đạt 14 giờ» đo SONG SONG hai mốc (`kttLuuThoat.js`)

> Bối cảnh (PO chốt 27/10/2026, từ đối chiếu độc lập KTT-10): chỉ tiêu chỉ đo được trên MỘT PHẦN mẫu số, nên tỷ lệ tính trên phần đo được KHÔNG phải tỷ lệ chung. PO chưa chọn một mốc để công bố; hai mốc được đo song song. Tài liệu này không có số đo thật (số thật do PO giữ ngoài repo).

**Hai mốc.** Cả hai đều KẾT THÚC ở giờ lập BD10 đi (`bd10_di_gio_di`), trừ khung đêm 21:00–07:00, chỉ tiêu 14 giờ (12 giờ cho phường «Thuận Hóa» / «Phú Xuân» của BCVH Thuận Hóa), cùng lõi `tinhTuMoc` (`danhGiaChiTieu` cũ chính là mốc A):

| Tham số `mocChiTieu` | Mốc bắt đầu | Nhãn `moc` |
|---|---|---|
| `xnd` (MẶC ĐỊNH) — mốc A | `bd10_den_xnd` (ConfirmDate) | `bd10_den_xnd -> bd10_di_gio_di` |
| `quet_tui_den` — mốc B | `gio_quet_tui_den` của túi đến ghép | `gio_quet_tui_den -> bd10_di_gio_di` |

**Phân loại theo mốc** (`ketQuaTheoMoc`; thứ tự ưu tiên từ trên xuống):

| Nhãn | Điều kiện | Đo được? |
|---|---|---|
| `THIEU_MOC` | mốc bắt đầu vắng / không đọc được (kể cả khi chưa đi) | không |
| `MOC_SAU_GIO_DI` | đã có giờ lập BD10 đi mà mốc bắt đầu SAU giờ đi (kết quả âm, không làm tròn về 0) | không |
| `CHUA_DI` | chưa có giờ lập BD10 đi. Kể cả khi tới `bayGio` đã quá chỉ tiêu (ghi riêng `chua_di_da_qua_chi_tieu`) | không |
| `DAT` | đã đi, chờ ≤ chỉ tiêu (biên 14:00:00 đạt, 14:00:01 không đạt) | có |
| `KHONG_DAT` | đã đi, chờ > chỉ tiêu | có |

**Khác khối `dat_khong_dat` cũ:** khối cũ tính SHBG chưa đi mà đã quá chỉ tiêu là `khong_dat`; khối mới xếp chúng vào «không đo được — chưa đi» (đúng định nghĩa phần không đo được của KTT-10). Đối chiếu có test: `dat_khong_dat.khong_dat = chi_tieu_14h.xnd.khong_dat + chua_di_da_qua_chi_tieu`, `chua_do_duoc = thieu_moc`, `xnd_sau_gio_di = moc_sau_gio_di`, `dat` bằng nhau.

**Mẫu số** = SHBG đã phân loại vào năm trạng thái (+ «đang chờ chuyến»), cùng phạm vi với `dat_khong_dat`: KHÔNG gồm hàng hoàn Tổ KHHH (khối `hang_hoan` có `chi_tieu_14h` riêng chỉ để xem), đích không rõ, ngoài phạm vi, thiếu giờ quét đến, không xếp được chuyến.

**Quy tắc chọn túi đến cho mốc B (KTT-10b).** Dùng **túi đến GHÉP** = túi đến có giờ quét muộn nhất KHÔNG sau giờ lập BD10 đi cuối (không túi nào thỏa thì túi quét muộn nhất) — đúng quy tắc KTT-5/KTT-7b đang dùng để xếp chuyến và xác định ngày đến D (không đặt quy tắc mới; chi tiết ở `41_KTT_LUU_THOAT.md` mục 3). Hệ quả: SHBG có từ 2 túi đến trở lên đo từ lần đến dẫn tới lần đi cuối, KHÔNG đo từ lần đến đầu tiên (túi đến GỐC, dùng riêng để nhận diện hàng hoàn). Khi mọi túi đến đều quét SAU giờ đi thì mốc B là `MOC_SAU_GIO_DI` («đi trước khi đến»). Túi đến ghép khác gốc cũng đi qua cùng quy tắc; không dùng thêm quy tắc nào cho «túi đến ghép khác túi đến gốc».
Số bị ảnh hưởng bởi quy tắc chọn được đếm sẵn ở `chi_tieu_14h.chat_luong_tui_den` (đếm trên SHBG đã phân loại): `nhieu_tui_den` (từ 2 túi đến có giờ quét trở lên), `tui_den_ghep_khac_goc` (túi ghép khác túi gốc theo id), `khac_ket_qua_neu_dung_tui_goc` (số SHBG có kết quả mốc B KHÁC nếu lấy túi gốc thay túi ghép — để PO biết chọn túi nào có ảnh hưởng thật), `khong_co_tui_di` (SHBG không có dòng túi đi nào → luôn «chưa đi»). Số liệu thật do PO đo.

**Mốc là tham số.** `luuThoatTheoNgay(db, { …, mocChiTieu })` (`xnd` | `quet_tui_den`; thiếu → `xnd`; giá trị lạ → `LoiKtt` mã `KTT_MOC_SAI`): chọn mốc nuôi khối `dat_khong_dat` (và `meta.moc.chi_tieu`, `chi_tieu_14h.moc_mac_dinh`); đổi tham số KHÔNG đổi `chi_tieu_14h.theo_moc` (luôn đủ hai mốc, có test). Mặc định `xnd` ⇒ mọi số đang hiển thị (`dat_khong_dat`, năm trạng thái, đúng chuyến, hàng hoàn…) giữ nguyên. Hằng số mặc định: `MOC_CHI_TIEU_MAC_DINH` ở `kttLuuThoat.js`. **Chưa nối vào API / giao diện / xlsx** (cache theo ngày và chi-tiet vẫn dùng mặc định `xnd`); ticket đổi mốc mặc định cần nối tham số này vào `tham_so` hoặc query và xem lại nhãn chữ «Xác nhận đến sau giờ lập BD10 đi» của cột 14 xlsx cho mốc B.

**Không công bố tỷ lệ chung.** Mỗi mốc trả `do_duoc` (x), `mau_so` (y), `dat`, `khong_dat`, `ty_le_dat_tren_do_duoc` (CHỈ trên phần đo được; `null` khi `do_duoc = 0`), và `khong_do_duoc { tong, thieu_moc, moc_sau_gio_di, chua_di }`; thêm `do_duoc_khong_do_duoc_o_moc_kia` (đo được ở mốc này mà không đo được ở mốc kia) và `do_duoc_ca_hai_moc`. Mọi nơi hiển thị phải ghi «đo được x/y» cạnh tỷ lệ.

**Đã chốt (PO 27/10/2026):** đo được = «đã đi» — SHBG chưa đi LUÔN là không đo được ở cả hai mốc, kể cả khi đã quá chỉ tiêu (đúng định nghĩa KTT-10). Số mốc A có thể lệch khối `dat_khong_dat` cũ đúng bằng `chua_di_da_qua_chi_tieu`.

**Điều chưa chắc (cần PO):** (1) xem mục «Đã chốt» ở trên (không còn mở). (2) Mốc A phải tái hiện số tham chiếu KTT-10 trên bộ đối chiếu của PO (script `doi-chieu-doc-lap.js` ở `D:\Dev\ktt-thu-tools`, không có trong repo) — Dev AI chưa chạy được.
