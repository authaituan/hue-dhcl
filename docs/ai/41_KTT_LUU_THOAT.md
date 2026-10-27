# 41 · KTT-7b — Lưu thoát 5 trạng thái, đạt / không đạt, hàng hoàn Tổ KHHH

Tính toán các chỉ số của trang «Lưu thoát» theo từng ngày đến trên dữ liệu `ktt_*`, và nối lịch chuyến chính thức (KTT-7a, `40_KTT_LICH_CHUYEN.md`) vào truy vấn KTT.
**Chưa** có API, giao diện, xuất file, cache (KTT-8, KTT-9). Chỉ ĐỌC DB. Dữ liệu trong tài liệu này là dữ liệu giả.

## 1. File

| File | Vai trò |
|---|---|
| `server/lib/kttLuuThoat.js` | Hàm THUẦN: `phanLoaiShbg`, `danhGiaChiTieu`, `taoKhoi` (bộ cộng), `daChot`. Không DB, không giờ máy. |
| `server/lib/kttLuuThoatQuery.js` | Truy vấn: `luuThoatTheoNgay(db, { tuNgay, denNgay, bayGio? })`. Dùng lại lượt đọc SHBG của `kttQuery.js`. |
| `server/lib/kttChuyen.js` | Cầu nối lịch mới → hình dạng kết quả chuyến cũ của `kttQuery` (`danhGiaChuyenLich`). |
| `server/lib/kttQuery.js` (sửa) | Phần «chuyến» dùng lịch mới; thêm trường đơn vị SHBG cho lưu thoát; export `chayBoDem`, `ngayHopLe`, `ngayKeTiep`; cờ `boQuaCham`. |
| `server/lib/kttDanhGia.js` (sửa) | Câu văn «chuyến 12:30» thay «chuyến sáng / trưa / tối». |

## 2. Năm trạng thái (PO chốt 25–26/10/2026)

Phạm vi: SHBG có đích là **6 BCVH Huế** (đích: BD10 đi → nơi nhận; chưa có → tra `ktt_dia_ban_phat`; như `kttQuery`).
- **Ngày đến D** = ngày của `Gio_quet_tui_den` (túi đến chọn theo quy tắc KTT-5, mục 3). Mốc xếp chuyến = `Gio_quet_tui_den`.
- **Chuyến thuộc** = `xepChuyen(lịch, BCVH đích, Gio_quet_tui_den)`. **Đã đi** = giờ LẬP BD10 đi (`bd10_di_gio_di`, SendingTime; KHÔNG dùng giờ quét đi `gio_quet_tui_di`).
- **Lưu thoát** = BD10 đi lập trước 24:00 ngày D (kể cả lập trước ngày đến: vẫn tính, gắn cờ `di_truoc_khi_den`).

| Mã | Trạng thái |
|---|---|
| `t1` | đi trong ngày D, `DUNG_CHUYEN` |
| `t2` | đi trong ngày D, `TRUOT_CHUYEN` |
| `t3` | đi vào ngày D+1, `DUNG_CHUYEN` |
| `t4` | đi vào ngày D+1, `TRUOT_CHUYEN` |
| `t5` | đi từ D+2 trở đi (đúng hoặc trượt chuyến), HOẶC chưa đi mà đã quá giờ xuất phát của chuyến thuộc (`LO_CHUYEN`) |
| `dang_cho_chuyen` | chưa đi và chưa tới giờ xuất phát của chuyến thuộc (`CHUA_DEN_GIO`) — **KHÔNG vào t5**, không vào mẫu số (PO đã duyệt 26/10/2026) |

Loại trừ lẫn nhau: mỗi SHBG đúng một nhóm. `chi_tiet_trang_thai_5` tách t5 thành «đi từ D+2 đúng chuyến», «đi từ D+2 trượt chuyến», «chưa đi, lỡ chuyến».

**Tỷ lệ** (`mau_so` = tổng t1…t5, KHÔNG gồm hàng hoàn, «không rõ đích», «không có giờ quét đến», «không xếp được chuyến», «đang chờ chuyến»):
- `luu_thoat.ty_le` = (t1 + t2) / mau_so;
- `dung_chuyen.ty_le` = số đã đi `DUNG_CHUYEN` (mọi ngày đi) / mau_so (kèm `truot_chuyen`, `lo_chuyen`; cộng ba số này = mau_so);
- mỗi chỉ số có trường **`moc`** ghi mốc dùng. Mẫu số 0 → `ty_le = null`.

Đơn vị đếm là SHBG khác nhau; `tui` ở mỗi trạng thái = số túi ĐẾN khác nhau chứa các SHBG đó. **Túi đến không có danh sách bưu gửi** đếm riêng (`tui_khong_co_buu_gui`, theo ngày đến), không vào năm trạng thái.

### Nhóm riêng (không vào năm trạng thái)
`khong_phan_loai` ở mỗi ngày / BCVH: **đích không rõ** (`khong_ro_dich`), **ngoài phạm vi** (530900, `KHAC`, `KTT` — `ngoai_pham_vi` theo loại), **không có giờ quét đến** (chỉ có XNĐ BD10 trong ngày; ngày lấy theo XNĐ), **không xếp được chuyến** (`khong_xep_duoc_chuyen` theo lý do, ví dụ `KHONG_CO_LICH`). Mọi nhóm cộng lại = `tong_shbg_ngay` (có test).

## 3. Chọn túi đến và BD10 đi của từng SHBG — đúng quy tắc KTT-5
«Lần đi cuối» = túi ĐI có giờ muộn nhất; **túi đến ghép** = túi ĐẾN có giờ quét muộn nhất KHÔNG sau giờ đi cuối (không có thì muộn nhất). Ghi chú: ticket mô tả quy tắc KTT-5 là «túi đến sớm nhất»; thực tế KTT-5 chọn túi đến ghép với lần đi cuối (xem `38_KTT_TRUY_VAN.md` §2.2). Hai cách chỉ khác nhau với hàng qua KTT nhiều lần; đã dùng ĐÚNG quy tắc KTT-5 theo yêu cầu «không tự đặt quy tắc mới». Nhận diện hàng hoàn dùng túi đến GỐC = **túi đến quét SỚM NHẤT** (mục 5).

## 4. Đạt / không đạt chỉ tiêu 14 giờ
Chờ = giờ lập BD10 đi − **`ConfirmDate` (`bd10_den_xnd`)**, **bỏ khung 21:00–07:00** (`quyThoiGian.thoiGianThucGiay`). Chỉ tiêu `quyThoiGianChiTieu.chiTieuGio(maBcvh, tên phường)`: 14 giờ; **12 giờ cho phường «Thuận Hóa» và «Phú Xuân»** của BCVH Thuận Hóa — so TÊN phường (cột `ten_xa_phuong` của bưu gửi, thiếu thì tra `ktt_dia_ban_phat`), không so mã.

| Nhãn (`dat_khong_dat`) | Điều kiện |
|---|---|
| `dat` | đã đi, chờ ≤ chỉ tiêu (biên: 14:00:00 đạt, 14:00:01 không đạt) |
| `khong_dat` | đã đi, chờ > chỉ tiêu; hoặc **chưa đi** mà tới `bayGio` đã quá chỉ tiêu |
| `chua_di` | chưa đi, tới `bayGio` chưa quá chỉ tiêu |
| `chua_do_duoc` | chưa xác nhận đến (`bd10_den_xnd` rỗng) — không tính đạt / không đạt |
| `xnd_sau_gio_di` | xác nhận đến SAU khi đã đi (kết quả âm, không làm tròn về 0) — không tính đạt / không đạt |

`ty_le_dat` = dat / (dat + khong_dat). Chỉ dùng các nhãn trên; KHÔNG dùng «Quá hạn», «Sắp hết hạn», «Còn thời gian», «quỹ thời gian» (module Thời gian Khai thác-Vận chuyển). Cột đạt / không đạt đặt **cạnh** «trượt chuyến» (`t2` / `t4` / `dung_chuyen.truot_chuyen`), không thay nó. Mốc đạt / không đạt (`bd10_den_xnd`) khác mốc lưu thoát (`gio_quet_tui_den`): mỗi chỉ số ghi `moc`.

## 5. Hàng hoàn Tổ KHHH (531120)
Nhận diện (PO chốt 26/10): SHBG có **túi đến gốc** (quét sớm nhất) với **nơi gửi BD10 đến** (`bd10_den_ma_diem_gui`) = `531120` VÀ đích = BCVH **Thuận Hóa** (533140).
- Nhóm riêng `hang_hoan` (mỗi ngày): sản lượng (SHBG, túi), năm trạng thái, đạt / không đạt (chỉ để xem). **Không** vào tổng, tỷ lệ lưu thoát, đạt / không đạt, đúng chuyến.
- Từ 531120 mà đích là BCVH Huế **khác** Thuận Hóa: tính như hàng thường; số SHBG này ở `meta.hang_hoan_tu_531120_dich_khac_thuan_hoa`.
- Từ 531120 đích tỉnh khác (xe Cấp 1) = hàng mới đi liên tỉnh: không phải hàng hoàn (ngoài phạm vi / không rõ như mục 2).
- Cột `bd10_den_ma_diem_gui` đã lưu trong `ktt_tui` (đủ để nhận diện; không đổi bảng).

## 6. Ngày, độ mới, «bây giờ»
- `tuNgay`, `denNgay` (`YYYY-MM-DD`; thiếu `denNgay` = một ngày); **tối đa 31 ngày** (quá → `LoiKtt` `KTT_KHOANG_QUA_DAI`, tiếng Việt). Mỗi ngày tính riêng rồi cộng (`tong_cong` = cộng các ngày). Ngày không có dữ liệu vẫn có mặt với số 0 và `co_du_lieu = false`.
- **«Bây giờ» = độ mới của dữ liệu** (`kttNapCap.docDoMoi`: `nguon_xuat_luc` lớn nhất của cặp `OK`), KHÔNG phải đồng hồ máy; `opts.bayGio` thay thế (test / xem lại, khi đó `da_chot` so với giá trị này). Chưa có độ mới và không truyền `bayGio` → kết quả rỗng `ly_do = 'CHUA_CO_DU_LIEU'` (vẫn đủ ngày, số 0).
- **`da_chot`** (mỗi ngày): độ mới ≥ 09:00:00 ngày D+1 (cặp 09:00 của D+1). Ngày chưa chốt vẫn trả số (giao diện hiện «đang cập nhật»).
- **`meta`**: `nguon_xuat_luc_moi_nhat`, `bay_gio`, `moc`, và số SHBG theo từng lý do không phân loại được: `khong_ro_dich`, `ngoai_pham_vi`, `khong_co_gio_quet_den`, `khong_xep_duoc_chuyen` (theo lý do), `hang_hoan_tu_531120_dich_khac_thuan_hoa`, `di_truoc_khi_den`, `co_quet_di_chua_lap_bd10` (có giờ quét đi nhưng chưa lập BD10 → tính là chưa đi), `tui_khong_co_buu_gui`.

Hình dạng: `{ khoang_ngay, bay_gio, nguon_xuat_luc_moi_nhat, co_du_lieu, ly_do, moc, theo_ngay: [{ ngay, da_chot, co_du_lieu, tong_shbg, tong, theo_bcvh: { [mã 6 BCVH]: khối }, hang_hoan, khong_phan_loai, tong_shbg_ngay, tui_khong_co_buu_gui }], tong_cong, meta, canh_bao }`.
Khối: `{ tong_shbg, trang_thai { t1..t5, dang_cho_chuyen: { shbg, tui } }, luu_thoat, dung_chuyen, chi_tiet_trang_thai_5, dat_khong_dat, khong_phan_loai, di_truoc_khi_den }`.

## 7. Nối lịch mới vào `kttQuery` (mục 2.1 của ticket)
`kttQuery` (đúng chuyến, trễ, lỡ, đến sát giờ, nằm lâu «trễ chuyến») dùng **`ktt_lich_chuyen`** qua `kttChuyen.danhGiaChuyenLich` thay lịch V1. Hình dạng kết quả giữ nguyên, khác ở nội dung:
- tên chuyến (`chuyen`, `chuyenDuKien.ten`) là **giờ xe rời KTT `'HH:MM'`** (trước là `SANG` / `TRUA` / `TOI`); `chuyenDuKien.moc` = giờ rời;
- hạn hàng đến = giờ rời − `han_den_truoc_chuyen_phut` (60; trước là `gio_chot_truoc_phut` 30 theo từng mốc); `chotTruocPhut` trả `[60]`;
- «đến sát giờ» = quét đến trong (hạn, giờ rời] của một chuyến trong ngày đến; `TRUOT_CHUYEN` (KTT-7a) ↔ `TRE_CHUYEN`, `CHUA_DEN_GIO` ↔ `CHUA_DEN_MOC`;
- `soChuyenTre` = số chuyến của BCVH có giờ rời trong [giờ rời chuyến dự kiến, giờ đi thực tế hoặc bayGio);
- lịch V1 (`ktt_cau_hinh_chuyen`, `kttCauHinh.js`, `kttTinh.danhGiaChuyen`) **còn nguyên** nhưng không còn được `kttQuery` dùng cho chuyến (các hàm thuần cũ vẫn có test). Mất lịch của một BCVH (xóa dòng `ktt_lich_chuyen`) → `KHONG_CO_LICH` + cảnh báo như trước.
- `kttDanhGia`: «Quét đến 7 giờ: 623 túi vào chuyến **12:30**, chỉ 20 túi kịp chuyến **07:00**» (thay «trưa / sáng»). Câu «N phút cuối trước mốc chuyến» lấy N từ `chotTruocPhut` (nay 60).

## 8. Hiệu năng (dữ liệu giả, `KTT_PERF=1`, máy dev)
33.201 túi / 332.010 dòng bưu gửi trong 31 ngày (≈ 15.000 túi / 75.000 dòng mỗi tuần), 221.340 SHBG: **1 ngày ≈ 0,18 giây; 7 ngày ≈ 1,2 giây; 31 ngày ≈ 5,3 giây** (`luuThoatTheoNgay`, một lượt đọc). Trước khi bỏ phần chấm nằm lâu / chuyến / F1.3 thừa trong lượt đọc (`boQuaCham`): 0,39 / 2,3 / 10,2 giây.
Hướng tối ưu (chưa làm; ticket cấm cache): (1) ~60% thời gian còn lại nằm ở `kttLichChuyen.giayCua` / `dinhDang` (phân tích và định dạng chuỗi giờ) do `xepChuyen` dựng lại lịch từng SHBG — nhớ kết quả theo `(BCVH, giờ quét đến)` TRONG MỘT LẦN GỌI (nhiều SHBG cùng túi cùng giờ) hoặc sinh trước chuyến theo (BCVH, ngày); (2) `duyetShbg` (SQL nối) ≈ 20%; chỉ đọc cột cần thiết; (3) KTT-8 cache kết quả theo `(khoảng ngày, độ mới)` — đổi khi nạp cặp mới.

## 9. Điều chưa chắc
- **Nhận diện hàng hoàn (PO DUYỆT 26/10/2026):** theo túi đến GỐC (sớm nhất) + đích Thuận Hóa; PO xem `meta.hang_hoan_tu_531120_dich_khac_thuan_hoa` để biết có hàng 531120 đích BCVH khác hay không.
- **«Đang chờ chuyến»** (PO DUYỆT 26/10/2026): tách nhóm riêng, không vào t5 và mẫu số.
- **Chọn túi đến / BD10 đi:** dùng quy tắc KTT-5 thực tế (túi đến ghép với lần đi cuối), khác mô tả «túi đến sớm nhất» trong ticket; chỉ khác với hàng qua KTT nhiều lần.
- **Giờ đi:** chỉ dùng `bd10_di_gio_di`; hàng chỉ có giờ quét đi mà chưa lập BD10 tính là chưa đi (`meta.co_quet_di_chua_lap_bd10`).
- SHBG không có giờ quét đến nhưng có XNĐ BD10 trong khoảng: tính vào ngày của XNĐ, nhóm «không có giờ quét đến».
- Cặp 09:00 của D+1 mã cứng trong `daChot` (`GIO_CHOT_NGAY`); khi lịch xuất đổi thì đổi hằng số.
- Chưa API, giao diện, cache, quyền xem.

## 10. Test
`tests/ktt-luu-thoat.test.js` (27 ca; 1 ca đo hiệu năng bỏ qua trừ khi `KTT_PERF=1`): năm trạng thái và biên (23:59:59 / 00:00:00, đúng giờ xuất phát ± 1 giây, 21:30 → 07:00 hôm sau, Chủ nhật, thứ Bảy → thứ Hai); đạt / không đạt (bỏ đêm, biên 14 giờ, 12 giờ Thuận Hóa / Phú Xuân theo tên, nhóm riêng, chưa đi tính tới `bayGio`); hàng hoàn (kể cả túi đến gốc); nhóm riêng và `meta`; túi đếm; khoảng ngày 31; `da_chot`; độ mới; không dùng giờ máy; kiểm tĩnh; ba `TZ`. Test cũ sửa vì mục 7: xem CHANGELOG.

## 11. KTT-8c — kg và nhóm theo nguồn (chỉ THÊM trường)
Hàm thuần ở `server/lib/kttNguon.js` (không đổi `kttLuuThoat.js`); nối vào `luuThoatTheoNgay` (`kttLuuThoatQuery.js`). Trường cũ giữ nguyên nghĩa.
- **kg:** mỗi khối (`tong`, `theo_bcvh[m]`, `hang_hoan`, `tong_cong` và các khối này của từng ngày) có `kg` ở mức khối (cùng phạm vi với `tong_shbg`: mọi SHBG đã vào khối, kể cả chưa phân loại được) và `trang_thai.<t1…t5|dang_cho_chuyen>.kg`. `kg` = Σ `khoi_luong_thuc_te_g / 1000` của các SHBG đó, làm tròn 3 chữ số. Đơn vị cộng là SHBG (đã gộp các dòng túi), nên một SHBG nằm trong nhiều túi chỉ cộng một lần. SHBG thiếu khối lượng tính 0 và đếm vào `meta.shbg_thieu_khoi_luong` (mọi SHBG có ngày đến trong khoảng).
- **`theo_nguon`** (mỗi ngày và `tong_cong`): mảng nhóm sắp theo `shbg` giảm dần (bằng nhau: theo `ma` tăng dần). Nhóm của một SHBG xác định từ TÚI ĐẾN GHÉP (cùng túi dùng để xếp chuyến): nơi gửi BD10 đến (`bd10_den_ma_diem_gui`) bắt đầu bằng `53` → `NOI_TINH` («Nội tỉnh · các điểm khác», bất kể đường thư); còn lại có `bd10_den_ma_duong_thu` → nhóm theo đường thư (`ma` = mã, `ten` = tên); thiếu mã đường thư → `KHONG_RO_NGUON` («Không rõ nguồn»). Hàng hoàn Tổ KHHH KHÔNG vào `theo_nguon` (đã có `hang_hoan`); hàng từ 531120 nhưng đích khác Thuận Hóa là hàng thường (nơi gửi `53…` → `NOI_TINH`). Chỉ SHBG đã phân loại (có trạng thái) mới vào nhóm.
- Mỗi nhóm: `{ ma, ten, shbg, kg, trang_thai { t1…t5, dang_cho_chuyen: { shbg, kg } }, ro_lai, truot_chuyen, dat_khong_dat { dat, khong_dat, ty_le_dat }, theo_bcvh { <mã BCVH>: { shbg, kg, ro_lai, truot_chuyen, khong_dat } } }`. `shbg` và `kg` của nhóm = phần MẪU SỐ (t1…t5); `dang_cho_chuyen` chỉ nằm trong `trang_thai`. `ro_lai` = t3 + t4 + t5 (không đi trong ngày D). `truot_chuyen` = đi trượt chuyến + chưa đi mà lỡ chuyến (đúng `dung_chuyen.truot_chuyen` + `lo_chuyen` của khối cùng phạm vi; không gồm đang chờ chuyến). `dat_khong_dat` cùng phạm vi với khối `dat_khong_dat` (mọi SHBG có trạng thái, kể cả đang chờ chuyến). `theo_bcvh` chỉ liệt kê BCVH có SHBG; `shbg` / `kg` / `ro_lai` / `truot_chuyen` của BCVH cùng phạm vi với `shbg` của nhóm, `khong_dat` cùng phạm vi với `dat_khong_dat`.
- **Cộng khớp (có test):** Σ nhóm = khối tổng ngày cho `t1…t5`, `dang_cho_chuyen` (shbg, kg); Σ `theo_bcvh` trong nhóm = nhóm; Σ nhóm theo từng BCVH = khối của BCVH đó; `ro_lai` / `truot_chuyen` khớp ở mọi cấp (ngày, BCVH, nguồn, `tong_cong`).
- **Dòng chi tiết (`danhSachLuuThoat`):** thêm 17 trường snake_case của sheet 7 (`kttDong.dongChiTiet`: `shbg`, `duong_thu_den_ma`, `duong_thu_den_ten`, `gio_quet_tui_den`, `gio_xac_nhan_bd10_den`, `kg` (null nếu thiếu), `ma_bcvh`, `ten_bcvh`, `chuyen_lien_ke`, `gio_xuat_phat`, `han_den_muon_nhat`, `gio_lap_bd10_di`, `gio_cho_gio`, `dat_khong_dat` (nhãn chữ: Đạt / Không đạt / … / «Loại trừ» / «Không tính»), `phan_loai`, `trang_thai` (nhãn chữ), `ngay_luu_thoat`). Nhóm lọc mới `ro_lai`, `truot_chuyen` (`NHOM_LUU_THOAT`); `duyetLuuThoat` nhận thêm `nguon` (so sánh mã nhóm nguồn).
- Hiệu năng (dữ liệu giả 31 ngày, `KTT_PERF=1`): `luu-thoat` nguội 1 / 7 / 31 ngày trước 94–108 / 611–820 / 3.014–3.461 ms, sau 95–237 / 621–788 / 2.826–3.385 ms (nhiễu giữa các lần đo ±15%; không chậm thêm quá 25%); nóng ≈ 10–19 ms; 8 nhóm nguồn ở dữ liệu giả, JSON 31 ngày ≈ 376 KB (dữ liệu thật nhiều nhóm hơn sẽ lớn hơn).
- Test: `tests/ktt-nguon.test.js` (11 ca + 1 ca đo). Test cũ sửa: `tests/ktt-luu-thoat.test.js` (1 ca so khớp CHÍNH XÁC `{shbg, tui}` của `trang_thai.t1` → thêm `kg`), `tests/ktt-api.test.js` (1 ca danh sách trường được phép của dòng chi-tiet → thêm 17 trường mới).
