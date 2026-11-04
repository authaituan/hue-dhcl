# 41 · KTT-7b — Lưu thoát 5 trạng thái, đạt / không đạt, hàng hoàn (định nghĩa theo ItemReturn từ KTT-17-2)

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

## 5. Hàng hoàn (KTT-17-2: theo danh sách ItemReturn)
**Định nghĩa (PO xác nhận 31/10/2026, thay quy tắc 7b «túi đến gốc từ 531120 và đích Thuận Hóa»):** hàng hoàn = SHBG có trong `ktt_hang_hoan` (danh sách ItemReturn của CSDL BCCP, nạp riêng, KTT-17-1, `39_KTT_NAP_SFTP.md` mục 15) **VÀ** đích đến lần này là một trong **6 BCVH Huế** (`u.nhom = BCVH_HUE`). Không xét nơi gửi gốc, không xét 531120, không xét hàng đã đi đâu trước đó.
- **Hàng thường** = mọi SHBG đích 6 BCVH không có trong danh sách. Gồm hàng chuỗi 531120 → 530100 → 533140 (nơi gửi `53…` nên vẫn thuộc hướng nội tỉnh) và SHBG chưa có BD10 đi mà không có trong danh sách.
- Trong danh sách nhưng đích **ngoài 6 BCVH** (530900, tỉnh khác, KTT) hoặc **không rõ** đích: KHÔNG phải hàng hoàn của KTT, giữ phân loại cũ (ngoài phạm vi / không rõ đích).
- Đích lấy đúng như `phanLoaiShbg` vẫn lấy (`u.maBcvh`: nhãn nhận BD10 đi cuối; chưa có BD10 đi thì suy từ phường/xã).
- **Cách tra:** `kttQuery.taoNguCanh` đọc `ktt_hang_hoan` MỘT lần mỗi lượt truy vấn vào một Set (~20 ms với ~17.600 dòng), `dungDonShbg` gắn `u.hangHoan = Set.has(shbg)`; `phanLoaiShbg` giữ thuần (không DB) và chỉ đọc `u.hangHoan`. Không JOIN và không truy vấn từng dòng vào lượt duyệt ~190.000 SHBG.
- **Một khối «hàng hoàn» chung** cho mọi nơi gửi và cả 6 BCVH (khối `hang_hoan` mỗi ngày + `tong_cong`): sản lượng (SHBG, túi), năm trạng thái, đạt / không đạt (chỉ để xem), `chi_tieu_14h` riêng. **Không** vào tổng, tỷ lệ lưu thoát, đạt / không đạt, đúng chuyến, 14 giờ, `theo_nguon` (cách xử lý KHÔNG đổi so với trước; chỉ đổi TẬP SHBG được coi là hoàn).
- `theo_bcvh[mã].tong_shbg_ngay` = SHBG của khối + hàng hoàn CỦA BCVH ĐÓ (trước đây chỉ Thuận Hóa); số dòng xlsx lọc `ma_bcvh` khớp.
- **Danh sách chưa nạp (rỗng / chưa có bảng): hoàn = 0.** `meta.hang_hoan_chua_nap = true` (và `hang_hoan_nguon_xuat_luc` = `nguon_xuat_luc` lớn nhất của danh sách, hoặc `null`) ở `/luu-thoat`, `/dicungngay/*`, `/tong-quan`, `/danh-sach`, `/chi-tiet`: số hoàn chỉ đúng khi danh sách mới. Không có cảnh báo riêng.
- `meta.hang_hoan_tu_531120_dich_khac_thuan_hoa`: **lỗi thời**, giữ khóa và luôn trả 0.
- **Bộ nhớ đệm** (`kttApi.js`): khóa có thêm phiên bản danh sách (`kttHangHoan.phienBanHangHoan`: id lần nạp OK lớn nhất . số dòng . `cap_nhat_luc` lớn nhất), nạp ItemReturn mới thì số tự đổi, không cần khởi động lại.
- **Cần nạp ItemReturn TRƯỚC khi golive bản này**; nếu không, mọi số hoàn về 0 và hàng hoàn cũ nằm vào hàng thường.
- Tên khóa API / hướng `noi_tinh_hang_hoan`, `hang_hoan` giữ nguyên; `noi_tinh_hang_hoan` KHÔNG còn nghĩa «nội tỉnh». Nhãn chữ phía server đã đổi thành **«Hàng chuyển hoàn»** ở KTT-17-3b (`phan_loai` của `chi-tiet` và xlsx sheet 7, tiêu đề cột sheet 8, câu bộ lọc ở «Thông tin» sheet 8); nhãn trong giao diện đổi ở KTT-17-3c. `theo_bcvh[mã].hang_hoan` (khối hàng hoàn của từng BCVH): `42_KTT_API.md` mục 15.

## 6. Ngày, độ mới, «bây giờ»
- `tuNgay`, `denNgay` (`YYYY-MM-DD`; thiếu `denNgay` = một ngày); **tối đa 31 ngày** (quá → `LoiKtt` `KTT_KHOANG_QUA_DAI`, tiếng Việt). Mỗi ngày tính riêng rồi cộng (`tong_cong` = cộng các ngày). Ngày không có dữ liệu vẫn có mặt với số 0 và `co_du_lieu = false`.
- **«Bây giờ» = độ mới của dữ liệu** (`kttNapCap.docDoMoi`: `nguon_xuat_luc` lớn nhất của cặp `OK`), KHÔNG phải đồng hồ máy; `opts.bayGio` thay thế (test / xem lại, khi đó `da_chot` so với giá trị này). Chưa có độ mới và không truyền `bayGio` → kết quả rỗng `ly_do = 'CHUA_CO_DU_LIEU'` (vẫn đủ ngày, số 0).
- **`da_chot`** (mỗi ngày): độ mới ≥ 09:00:00 ngày D+1 (cặp 09:00 của D+1). Ngày chưa chốt vẫn trả số (giao diện hiện «đang cập nhật»).
- **`meta`**: `nguon_xuat_luc_moi_nhat`, `bay_gio`, `moc`, và số SHBG theo từng lý do không phân loại được: `khong_ro_dich`, `ngoai_pham_vi`, `khong_co_gio_quet_den`, `khong_xep_duoc_chuyen` (theo lý do), `hang_hoan_tu_531120_dich_khac_thuan_hoa` (lỗi thời, luôn 0 từ KTT-17-2), `hang_hoan_chua_nap`, `hang_hoan_nguon_xuat_luc` (KTT-17-2), `di_truoc_khi_den`, `co_quet_di_chua_lap_bd10` (có giờ quét đi nhưng chưa lập BD10 → tính là chưa đi), `tui_khong_co_buu_gui`.

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
- **Nhận diện hàng hoàn:** ~~theo túi đến GỐC (sớm nhất) + đích Thuận Hóa (PO duyệt 26/10/2026)~~ — **thay bằng danh sách ItemReturn + đích 6 BCVH (PO 31/10/2026, KTT-17-2)**, xem mục 5 và `04_DECISIONS.md` #121.
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
- Mỗi nhóm: `{ ma, ten, shbg, kg, trang_thai { t1…t5, dang_cho_chuyen: { shbg, kg } }, ro_lai, truot_chuyen, ro_lai_truot_chuyen, dat_khong_dat { dat, khong_dat, ty_le_dat }, theo_bcvh { <mã BCVH>: { shbg, kg, ro_lai, truot_chuyen, ro_lai_truot_chuyen, khong_dat } } }`. `shbg` và `kg` của nhóm = phần MẪU SỐ (t1…t5); `dang_cho_chuyen` chỉ nằm trong `trang_thai`. `ro_lai` = t3 + t4 + t5 (không đi trong ngày D). `truot_chuyen` = đi trượt chuyến + chưa đi mà lỡ chuyến (đúng `dung_chuyen.truot_chuyen` + `lo_chuyen` của khối cùng phạm vi; không gồm đang chờ chuyến). `ro_lai_truot_chuyen` (KTT-RL-1) = số SHBG VỪA thuộc `ro_lai` VỪA thuộc `truot_chuyen` = `truot_chuyen` trừ t2 (t2 = đi trong ngày D nhưng trượt chuyến, không rớt lại): gồm t4, t5 đi trượt chuyến, t5 chưa đi mà lỡ chuyến; không gồm t2, t3, t5 đi đúng chuyến, đang chờ chuyến. Luôn ≤ `ro_lai` và ≤ `truot_chuyen`; cùng phạm vi mẫu số với `ro_lai` (hàng hoàn không vào). Đây KHÔNG phải số của thẻ «Trượt chuyến (cần xử lý)» đầu tab (định nghĩa rộng, gồm t2). `dat_khong_dat` cùng phạm vi với khối `dat_khong_dat` (mọi SHBG có trạng thái, kể cả đang chờ chuyến). `theo_bcvh` chỉ liệt kê BCVH có SHBG; `shbg` / `kg` / `ro_lai` / `truot_chuyen` của BCVH cùng phạm vi với `shbg` của nhóm, `khong_dat` cùng phạm vi với `dat_khong_dat`.
- **Cộng khớp (có test):** Σ nhóm = khối tổng ngày cho `t1…t5`, `dang_cho_chuyen` (shbg, kg); Σ `theo_bcvh` trong nhóm = nhóm; Σ nhóm theo từng BCVH = khối của BCVH đó; `ro_lai` / `truot_chuyen` khớp ở mọi cấp (ngày, BCVH, nguồn, `tong_cong`); `ro_lai_truot_chuyen` ≤ `ro_lai`, ≤ `truot_chuyen`, = `truot_chuyen` − `trang_thai.t2.shbg` ở nhóm, Σ `theo_bcvh` = nhóm, `tong_cong` = Σ ngày, và khớp số đếm độc lập từ `duyetLuuThoat` (`tests/ktt-ro-lai-truot-chuyen.test.js`). Khối trạng thái (`tong`, `theo_bcvh` của ngày) không có trường này.
- **Dòng chi tiết (`danhSachLuuThoat`):** thêm 17 trường snake_case của sheet 7 (`kttDong.dongChiTiet`: `shbg`, `duong_thu_den_ma`, `duong_thu_den_ten`, `gio_quet_tui_den`, `gio_xac_nhan_bd10_den`, `kg` (null nếu thiếu), `ma_bcvh`, `ten_bcvh`, `chuyen_lien_ke`, `gio_xuat_phat`, `han_den_muon_nhat`, `gio_lap_bd10_di`, `gio_cho_gio`, `dat_khong_dat` (nhãn chữ: Đạt / Không đạt / … / «Loại trừ» / «Không tính»), `phan_loai`, `trang_thai` (nhãn chữ), `ngay_luu_thoat`). Nhóm lọc mới `ro_lai`, `truot_chuyen` (`NHOM_LUU_THOAT`); `duyetLuuThoat` nhận thêm `nguon` (so sánh mã nhóm nguồn).
- Hiệu năng (dữ liệu giả 31 ngày, `KTT_PERF=1`): `luu-thoat` nguội 1 / 7 / 31 ngày trước 94–108 / 611–820 / 3.014–3.461 ms, sau 95–237 / 621–788 / 2.826–3.385 ms (nhiễu giữa các lần đo ±15%; không chậm thêm quá 25%); nóng ≈ 10–19 ms; 8 nhóm nguồn ở dữ liệu giả, JSON 31 ngày ≈ 376 KB (dữ liệu thật nhiều nhóm hơn sẽ lớn hơn).
- Test: `tests/ktt-nguon.test.js` (11 ca + 1 ca đo). Test cũ sửa: `tests/ktt-luu-thoat.test.js` (1 ca so khớp CHÍNH XÁC `{shbg, tui}` của `trang_thai.t1` → thêm `kg`), `tests/ktt-api.test.js` (1 ca danh sách trường được phép của dòng chi-tiet → thêm 17 trường mới).

### 11.1. KTT-11b — số «Tất cả» và phân rã (chỉ THÊM)
«Tất cả» ở khung Xuất xlsx = `tong_shbg_ngay` = MỌI SHBG có ngày quét túi đến trong khoảng (đếm ngay khi gặp SHBG, trước phân loại: `kttLuuThoatQuery.js`, `n.tongShbg++`). Số này khớp số dòng xlsx không lọc, và gồm bốn nhóm KHÔNG có chip trạng thái. Đẳng thức (có test, ở ngày, khoảng, `tong_cong`, kết quả ghép):
`t1 + t2 + t3 + t4 + t5 + dang_cho_chuyen + hang_hoan.tong_shbg + ngoai_bay_chip.tong = tong_shbg_ngay`.
- **`ngoai_bay_chip`** (mỗi ngày và `tong_cong`): `{ khong_ro_dich, ngoai_pham_vi { HE1_530900, KHAC, KTT }, ngoai_pham_vi_tong, khong_co_gio_quet_den, khong_xep_duoc_chuyen { lý_do: n }, khong_xep_duoc_chuyen_tong, tong }`; `tong` = tổng bốn nhóm. Hai nhóm sau lấy từ `khong_phan_loai` của khối `tong` (6 BCVH, KHÔNG gồm hàng hoàn): hàng hoàn thiếu giờ quét / không xếp được chuyến nằm trong `hang_hoan`. `khong_phan_loai` cấp ngày giữ nguyên hình dạng `{khong_ro_dich, ngoai_pham_vi, tong}`; ở `tong_cong` vẫn chỉ `{khong_ro_dich, ngoai_pham_vi}` (hai nhóm kia xem `ngoai_bay_chip`).
- **`tong_shbg_ngay` của khối BCVH** (`theo_ngay[].theo_bcvh[mã]`, `tong_cong.theo_bcvh[mã]`) = số SHBG của khối kể cả hàng hoàn Thuận Hóa = `tong_shbg` + (mã là 533140 ? `hang_hoan.tong_shbg` : 0) = số dòng xlsx `?ma_bcvh=<mã>` không lọc trạng thái = `kttXuat.soKhop(…, { maBcvh })`. Trước KTT-11b khối này không có trường nên giao diện rơi về `luu_thoat.mau_so` (chỉ t1…t5). Hàng không rõ đích / ngoài 6 BCVH không có BCVH nên không nằm trong khối nào.
- Test: `tests/ktt-tat-ca.test.js` (5 ca).

## 12. KTT-10b — chỉ tiêu 14 giờ đo song song hai mốc (chỉ THÊM)
Khối `dat_khong_dat` (mục 4) giữ nguyên. Thêm khối `chi_tieu_14h` đo cả mốc A (`bd10_den_xnd` → giờ lập BD10 đi) và mốc B (`gio_quet_tui_den` → giờ lập BD10 đi), kèm «đo được x/y» và lý do không đo được; quy tắc chọn túi đến cho mốc B (túi ghép, như mục 3) và các điều chưa chắc ở `37_KTT_QUY_TAC_TINH.md` mục 6, đầu ra ở `42_KTT_API.md` mục 12. `phanLoaiShbg` trả thêm `chiTieu14h` và `chatLuongTuiDen`; `kttQuery` đơn vị SHBG thêm `soTuiDen`, `coTuiDi`, `tuiDenGocId` (chỉ để đếm). Script kiểm chỉ đọc đợt nạp: `scripts/ktt-kiem-dot-nap.js`.

### 12.1. KTT-10c — tham số qua API, hai cột mốc trong xlsx
`/api/ktt/luu-thoat` nhận query `moc_chi_tieu` (`xnd` mặc định | `quet_tui_den`) → `mocChiTieu`; chỉ đổi mốc nuôi `dat_khong_dat`, khối `chi_tieu_14h` không đổi theo tham số. `meta.moc_chi_tieu` ghi mốc đã dùng. Cache theo (mốc, ngày). File xlsx: sheet 7 có hai cột nhãn Mốc A / Mốc B thay cột đạt / không đạt một mốc; sheet «Thông tin» ghi «đo được x/y» từng mốc và phần không đo được theo lý do, không có tỷ lệ «đạt» chung. Chi tiết: `42_KTT_API.md` mục 10 và 13. Quy tắc tính không đổi.

## 13. KTT-14 — hàng «chuyển tiếp đi» vào tập Lưu thoát (đổi TẬP SHBG, thêm cờ nguồn)
**Tập SHBG** (một hàm dùng chung `kttQuery.chayTapLuuThoat`, thay `chayBoDem` ở `luuThoatTheoNgay`, `duyetLuuThoat` — chi-tiet và xlsx —, và `kttDiNgayQuery.chayShbg` — dicungngay, rotlai, lich-xe, danh-sach, tong-quan): SHBG có túi ĐẾN (`DEN`) quét trong khoảng, HỢP SHBG chỉ có túi `CHUYEN_TIEP_DI` quét (hoặc xác nhận) đến trong khoảng. Mỗi SHBG tính MỘT lần. `/tong-hop` và `/chi-tiet?loai=<loại cũ>` (kttQuery KTT-5) không đổi.
- **SHBG có túi ĐẾN** (kể cả khi cũng có túi chuyển tiếp): cách tính cũ, `nguon_hang = khai_thac`; túi chuyển tiếp bị bỏ qua, đếm ở `meta.co_ca_hai_loai_tui`.
- **SHBG chỉ có túi chuyển tiếp** (`nguon_hang = chuyen_tiep`): một dòng túi mang CẢ lần đến (`gio_quet_tui_den`, `bd10_den_xnd`, nơi gửi BD10 đến, đường thư) LẪN lần đi (`bd10_di_gio_di`, `bd10_di_ma_diem_nhan`). Nhiều dòng: lấy dòng có giờ lập BD10 đi muộn nhất (cùng quy tắc «lần đi cuối» ở mục 3); túi `DI` khác của SHBG đó bị bỏ qua. Mọi bước sau (đích, hàng hoàn Tổ KHHH, xếp chuyến, năm trạng thái, hai mốc 14 giờ) dùng nguyên `phanLoaiShbg`.
- **`meta`** (cộng được giữa các ngày): `shbg_chuyen_tiep`, `co_ca_hai_loai_tui`, `chuyen_tiep_nhieu_tui` (SHBG chuyển tiếp nằm trong ≥ 2 túi), `chuyen_tiep_co_tui_di_khac` (SHBG chuyển tiếp còn có túi `DI`).
- **`theo_nguon_hang`** (mỗi ngày và `tong_cong`): `{ khai_thac, chuyen_tiep }`, mỗi cờ `{ tong_shbg_ngay, tong (khối như khối `tong`), hang_hoan_shbg, ngoai_bay_chip }`. Hai cờ cộng lại bằng số cả ngày; mỗi cờ có đẳng thức riêng `t1…t5 + đang chờ + hang_hoan_shbg + ngoai_bay_chip.tong = tong_shbg_ngay` (có test). Khối `khai_thac` KHÔNG đổi so với trước KTT-14.
- **`chi-tiet` / `danh-sach`**: mỗi dòng thêm `nguon_hang`; `chi-tiet` thêm `luong_tui` (`KHAI_THAC_DEN`, `DI_NGOAI`, `DA_CHIA_SAN`). Sheet 7 xlsx giữ 18 cột (không thêm cột nguồn); sheet «Thông tin» thêm mục «Phạm vi bưu gửi».
- **Quan hệ với trước KTT-14**: số của hàng khai thác giữ nguyên; `tong_shbg_ngay`, mẫu số năm trạng thái, `chi_tieu_14h.mau_so` tăng vì thêm hàng chuyển tiếp; nhóm «ngoài 6 BCVH» tăng (hàng chuyển tiếp đi tỉnh khác). Chỉ tiêu 14 giờ của hàng chuyển tiếp: xác nhận BD10 đến (mốc A) thường SAU giờ lập BD10 đi nên nhiều SHBG rơi vào «không đo được — mốc sau giờ lập BD10 đi»; mốc B (giờ quét túi đến) đo được gần hết. Không công bố tỷ lệ chung (`37` mục 6).
- Test: `tests/ktt-chuyen-tiep.test.js` (11 ca, dữ liệu giả).

## 19. KTT-KD-1 — «Vì sao không đạt 14 giờ» (chỉ THÊM; không đổi số, quy tắc tính hay lịch chuyến)

Lõi THUẦN `server/lib/kttKhongDat14h.js` (không DB, không giờ máy) chỉ ĐỌC `kq.chiTieu14h[m]` của `phanLoaiShbg` và `kttChuyen.danhGiaChuyenLich`, rồi cộng thêm trong CÙNG lượt duyệt của `luuThoatTheoNgay` (không lượt duyệt mới). Mọi con số dưới đây là SHBG (đơn vị đếm của trang); hàng hoàn bị loại (đúng khối `hang_hoan` riêng).

**Nhóm nguyên nhân** (loại trừ nhau, theo TỪNG MỐC — mốc A `xnd`, mốc B `quet_tui_den`; `04_DECISIONS.md` #125):

| Nhóm | Định nghĩa | Ghi chú |
|---|---|---|
| A «Lỡ chuyến sát giờ» | `denSatGio` (đến trong (hạn, giờ rời] của một chuyến), bất kể sau đó đúng hay trượt chuyến kế | **A ưu tiên B** (P2). Cờ `truot_chuyen_ke` = A mà chuyến kế là `TRE_CHUYEN` (ghi trong `ly_do_xep_nhom` = `SAT_GIO_TRUOT_CHUYEN_KE`) |
| B «Trượt chuyến» | `TRE_CHUYEN`, không sát giờ | chia theo số chuyến trễ: 1, 2, ≥3 (`b_theo_so_chuyen_tre`) |
| C «Đi đúng chuyến, vẫn quá chỉ tiêu» | `DUNG_CHUYEN`, không sát giờ | |
| D «Chưa phân loại được» | lưới an toàn | luôn 0 trên dữ liệu hiện có (KHÔNG ĐẠT luôn có chuyến); giao diện ẩn khi 0 |
| E «Chưa đi, đã quá chỉ tiêu» | `chiTieu14h[m].chuaDiQuaChiTieu` | NHÓM CHÍNH THỨC ngang A–D nhưng là SỐ TUYỆT ĐỐI riêng: KHÔNG nằm trong `khong_dat` / `do_duoc`. Chia theo `so_chuyen_tre` (0, 1, 2, ≥3) và cờ `e_sat_gio` |

**Đẳng thức** (cả hai mốc, từng ngày và cả khoảng, từng BCVH, từng cờ nguồn): A+B+C+D = `khong_dat` (khối `chi_tieu_14h` cùng mốc); E = `chua_di_da_qua_chi_tieu`; A–E = `dat_khong_dat.khong_dat` của khối cũ (khối cũ trộn đã đi và chưa đi: số "không đạt" trang đang hiển thị = 3.084 ở mốc A và 3.510 ở mốc B trên bản sao DB, so với 844 / 1.071 chỉ riêng đã đi). `tong` có HAI mức: `da_di` (A–D) và `ca_chua_di` (A–E).

**Tỷ lệ chuẩn** = KHÔNG ĐẠT ĐÃ ĐI / ĐO ĐƯỢC (`37_KTT_QUY_TAC_TINH.md` mục 6); E đứng cạnh như số tuyệt đối, không vào mẫu số. API trả `khong_dat_da_di`, `do_duoc`, `chua_di_qua_chi_tieu` để giao diện ghi rõ hai con số, không trộn.

**Khối lượng**: `kg` của nhóm là tổng kg đã biết; SHBG thiếu hoặc 0 g tính «không rõ» (đếm ở `shbg_thieu_kg`, không cộng kg); ô toàn thiếu kg trả `kg: null`. Hàng chuyển hoàn không có trong các nhóm này.

**Hai mốc** (cảnh báo): mọi bảng trả CẢ HAI mốc. Mốc A đo từ giờ xác nhận BD10 đến (XNĐ) CHUNG cả BD10 nên méo theo lô (có đợt 100% không đạt mốc A, 0,2% mốc B); mốc B (quét túi đến) hợp để chẩn đoán đợt, nhưng **PO 04/11/2026 chốt mốc mặc định của khối mới là mốc A** (xem mục 20, `04_DECISIONS.md` #126). Mốc chính thức của chỉ tiêu (#111) KHÔNG đổi.

**Cắt ngang**: `thu` ('2'…'7', 'CN') theo NGÀY ĐẾN D (chuỗi giờ VN, không phụ thuộc múi giờ máy); `loai_ngay` (`thuong` | `chu_nhat`); `nguon_hang` (`khai_thac` | `chuyen_tiep`); BCVH × loại ngày là cách cắt chính.

**Dư địa theo giờ** (chỉ dùng hàm sẵn có): hạn đến kịp chuyến = `han_den_luc` của `xepChuyen`; biên an toàn (phút) = hạn − giờ quét túi đến; chờ theo lịch (giờ) = `thoiGianThucGiay(quét đến, giờ xe rời)` đã trừ 21:00–07:00 (KHÁC chờ thực tế tới lúc lập BD10 đi); dư địa = chỉ tiêu (14 giờ, 12 giờ cho phường Thuận Hóa / Phú Xuân) − chờ theo lịch; `sat_gio` = số SHBG có biên ≤ 30 / 60 / 90 phút (tham số `bien_sat_gio_phut`, mặc định 60 để khớp `denSatGio`). KHÔNG có "vừa lỡ chuyến" (đo 1b: không dự báo được không đạt, tốn thêm ≈4 giây). Phân vị lấy từ biểu đồ tần suất theo bậc (biên 15 phút, chờ và dư địa 30 phút): P10/P90 chính xác trong ±1 bậc, trung bình và lớn nhất / nhỏ nhất chính xác. Kết quả khảo sát 1b: giả thuyết «giờ đến sát hạn gây không đạt» KHÔNG được số đo ủng hộ ở cấp hệ thống (sát giờ không làm tăng tỷ lệ không đạt; 98–99% không đạt là trượt hoặc lỡ chuyến khi lịch còn dư địa).

**Đợt đến** = BD10 đến (một đường thư, một XNĐ, quét gần như cùng lúc; 92% BD10 có độ rộng giờ quét ≤ 60 phút). `dot_den[]` xếp theo SỐ KHÔNG ĐẠT ĐÃ ĐI giảm dần (mốc B), cột `chua_di_qua_chi_tieu` riêng; biên an toàn / dư địa / sát giờ chỉ là bối cảnh (1b: xếp theo rủi ro không dự báo gì). Chỉ giữ BD10 có ít nhất một SHBG không đạt / chưa đi quá chỉ tiêu trong ngày.

**Bộ nhớ đệm**: khối GỌN (`nguyen_nhan`) nằm trong kết quả `luuThoatTheoNgay` (JSON). Khối NẶNG (ô nhóm, ô mẫu số, ô giờ × BCVH, đợt đến) đi kèm kết quả như thuộc tính KHÔNG liệt kê (`kq.nang`, mỗi ngày một phần tử), cùng cache theo ngày với `/luu-thoat` (`kttApi.layNgay`); chỉ mục mốc mặc định (`xnd`) giữ khối nặng (mục mốc `quet_tui_den` chỉ có khối gọn, vì cả hai mốc đã nằm trong khối nặng).

**Điều chưa chắc đã biết** (xem báo cáo 1b / pha 2): (a) nhóm E tập trung ở BCVH 536250 (79–80% E, rải đều cả cửa sổ; 61–66% có mặt ở dữ liệu «Hàng đến BCVH» so với 91% hàng đã đi đạt cùng BCVH): chưa phân biệt được BD10 đi chưa nạp / không lập BD10 đi / hàng tồn thật; (b) lịch 536250 chuyến 06:30 (49,5% lập BD10 đi sau giờ rời, tập trung 06:44–07:00); (c) lịch Chủ nhật (KTT-LICH-1) chưa sửa.
- Test: `tests/ktt-khong-dat-14h.test.js` (dữ liệu giả).

## 20. KTT-KD-1 pha 2 (bản sửa 2) — «Bức tranh đường thư đến» (chỉ THÊM; không đổi số, quy tắc tính hay lịch chuyến)

Lõi THUẦN `server/lib/kttBucTranh.js` (không DB, không giờ máy). Mỗi SHBG thuộc **mẫu số lưu thoát** (6 BCVH, không hàng hoàn, có giờ quét túi đến, xếp được chuyến = t1…t5 + «đang chờ chuyến») đóng góp MỘT dòng cột số vào bộ cộng của ngày đến, trong CÙNG lượt duyệt của `luuThoatTheoNgay` (không lượt duyệt mới); bảng được dựng khi có request, từ các cột số của các ngày trong cửa sổ (cache theo ngày chung với `/luu-thoat`).

**«Chuyến thư đến» (cụm).** Cụm = (đường thư của BD10 đến, lịch của BD10 đến, băng giờ). Trong cửa sổ đang xem, các lần đến của cùng (đường thư, lịch) được xếp theo GIỜ TRONG NGÀY và tách khi hai lần đến liền nhau cách TRÊN `ktt_bt_gap_cum_phut` (60; chỉnh 10–240) phút; băng có dưới `ktt_bt_cum_nho_shbg` (5) bưu gửi gộp vào băng gần nhất cùng (đường thư, lịch); băng đầu và băng cuối cách ≤ 60 phút qua 00:00 nối thành một băng «vắt đêm» (`bang_gio.vat_dem`). Băng dựng trên MỌI ngày / BCVH của cửa sổ nên định danh cụm (`id`) không đổi khi đổi bộ lọc `loai_ngay` / `bcvh`; hai mốc dựng băng RIÊNG. Trong tài liệu và giao diện chỉ dùng tên «chuyến thư đến» (KHÔNG dùng «đợt». «Đợt» của KTT-12 `/hang-den/*` gom từng ngày theo quy tắc 120 phút; «chuyến thư đến» là khung giờ trên cả cửa sổ (30 ngày), tách khi hai lần đến cách nhau trên 60 phút: hai khái niệm khác nhau, giao diện không dùng «đợt»). Hàng không có mã đường thư và lịch (≈1,7%) vào cụm «(chưa có đường thư)».

**Hai mốc, mặc định A.** Mốc A = giờ xác nhận BD10 đến (`bd10_den_xnd`; méo theo lô), mốc B = giờ quét túi đến. API trả CẢ HAI mốc ở mọi bảng (`theo_moc.A`, `theo_moc.B`), tham số `moc` (mặc định `A`) chỉ là mốc hiển thị mặc định. Mọi con số kèm `do_duoc` / `mau_so` của mốc đó (mốc A: bưu gửi không có XNĐ không có giờ đến → `khong_do_duoc`); **không có tỷ lệ chung**, chỉ «đo được x/y» (`meta.do_duoc_chi_tieu_14h` cho chỉ tiêu 14 giờ: mốc A đo được ≈62% mẫu số, mốc B ≈94%). Cờ `gio_den.meo_theo_lo` (mốc A): trung vị giờ đến mốc A lệch từ `ktt_bt_meo_theo_lo_phut` (120) phút so với mốc B của cùng cụm (ví dụ «Đà Nẵng - Huế»: A 12:28, B 05:39).

**Thời gian lưu thoát theo lịch** = từ lúc hàng đến (theo mốc) tới giờ xe rời của chuyến kế (`xepChuyen` theo đúng giờ đến của mốc; đã trừ 21:00–07:00). KHÔNG có giờ chốt phát, KHÔNG có thời gian xe chạy đến BCVH. **Còn lại so với chỉ tiêu** = chỉ tiêu (14 giờ; 12 giờ cho phường 49135, 49133) − lưu thoát theo lịch; có thể ÂM (quá chỉ tiêu).

**Bảy cờ** (tính ở máy chủ; trả cả số đo thô lẫn cờ; ngưỡng đọc từ tham số hệ thống `ktt_bt_*` lúc gọi — `34_THAMSO1…`, sửa không cần đổi mã):

| Cờ | Đơn vị | Điều kiện | Mức |
|---|---|---|---|
| `that_thuong` | cụm | dao động sản lượng ngày (độ lệch chuẩn / trung bình, chỉ ngày thường CÓ hàng) ≥ phân vị `ktt_bt_phan_vi_tuong_doi` (80) của các cụm không «mẫu ít» trong bộ lọc hiện tại; cụm ≥ `ktt_bt_mau_toi_thieu` (100) bưu gửi | `luu_y` |
| `khong_co_lich_co_dinh` | cụm | độ rộng giờ đến (P90 − P10) ≥ phân vị 80 của các cụm; số ngày có hàng chỉ là số kèm theo | `luu_y` |
| `nhieu_kien_di_ngoai` | cụm | kiện đi ngoài (luồng `DI_NGOAI` hoặc BD8 = SHBG) ≥ `ktt_bt_kien_di_ngoai_pct` (30%) | `thong_tin` |
| `chuyen_gom_nhieu_hang` | chuyến xe cấp 2 (BCVH × loại ngày × giờ rời) | tỷ trọng sản lượng ≥ `ktt_bt_chuyen_gom_he_so` (1,5) × mức chia đều (1 / số chuyến của BCVH trong ngày; Chủ nhật chỉ đếm chuyến chạy Chủ nhật, tối thiểu 1); BCVH một chuyến không bao giờ bị gắn cờ | `luu_y` |
| `sat_gio_chot` | ô (cụm × BCVH × loại ngày) | trung vị cách giờ chốt chuyến < `ktt_bt_sat_gio_chot_phut` (60) VÀ có hàng ≥ `ktt_bt_ngay_toi_thieu` (20) ngày | **`theo_doi` — luôn** (số đo 1b chưa ủng hộ) |
| `sat_chi_tieu` | ô | từ `ktt_bt_ty_le_con_lai_pct` (25%) bưu gửi của ô còn dưới `ktt_bt_con_lai_gio` (3) giờ so với chỉ tiêu nếu xe đi đúng lịch (dùng tỷ lệ thay trung vị để không bỏ sót đuôi xấu) | `canh_bao` |
| `mau_it` | cụm, ô | dưới `ktt_bt_mau_toi_thieu` (100) bưu gửi trong cửa sổ → giao diện ghi «mẫu ít, chưa kết luận»; cụm / ô mẫu ít KHÔNG vào phân bố tính ngưỡng và không được gắn các cờ khác | `thong_tin` |

Ngưỡng của hai cờ đầu là TƯƠNG ĐỐI (phân vị của chính các cụm): phản hồi trả `nguong_ap_dung.phan_vi_dao_dong`, `phan_vi_do_rong_phut`, `so_cum_tinh_nguong`. Thẻ đánh giá `the[]` xếp theo SỐ BƯU GỬI BỊ ẢNH HƯỞNG (Pareto, không xếp theo tỷ lệ) kèm `luy_ke_pct` (lũy kế phần trăm của tổng số bưu gửi bị ảnh hưởng của danh sách); danh sách cụm xếp theo số bưu gửi giảm dần, `luy_ke_pct` là lũy kế phần trăm của tổng bưu gửi trong bộ lọc.

**Loại ngày và lịch Chủ nhật.** `loai_ngay` = `chu_nhat` | `thuong` theo NGÀY ĐẾN D (`getUTCDay` trên chuỗi giờ VN). Dao động sản lượng Chủ nhật chỉ có 4 điểm: có số liệu nhưng KHÔNG gắn cờ riêng. Ô Chủ nhật của BCVH có chuyến nghỉ Chủ nhật (`NGHI_CN`: Hương Thủy 536250, Thuận An 537015, Phú Lộc 537220, Thuận Hóa 533140 [chuyến 12:55]) mang `luu_y_lich: true`: lịch Chủ nhật CHƯA tin cậy cho đến khi sửa (PO 04/11/2026: Chủ nhật Hương Thủy CHỈ có chuyến 06:30; mã đang coi Hương Thủy không có chuyến nào vào Chủ nhật — `kttSchema.js:133` và bộ lọc `NGHI_CN` ở `kttLichChuyen.js:61,81`; việc sửa là KTT-LICH-2, KHÔNG làm ở ticket này).

**Hiệu năng.** Thêm một dòng cột số mỗi SHBG vào lượt duyệt đang có; cache theo ngày (khóa `moc|ngày`: mục ngày của mốc mặc định chứa cả hai mốc, nên một mục cho cả A và B). Hủy cache đúng ngày: tự động khi độ mới đổi (ngày trong cửa sổ nạp 8 ngày) hoặc chữ ký ngày đổi (số dòng + tổng id túi quét đến); thêm `Api.huyCacheNgay([ngày])` để hủy tay đúng các ngày chỉ định (mọi mốc). «Thay thế ngày» và khôi phục là của «Hàng đến BCVH» (`arrival_*`): bức tranh chỉ đọc `ktt_*` nên không bị ảnh hưởng. Số đo: xem `CHANGELOG_AI.md`.
