# 38 — «Hàng tại KTT»: truy vấn tổng hợp và khối «Đánh giá» (KTT-5)

> Phạm vi: LÕI (hàm nhận `db`, trả đối tượng). Chưa có API, route, cache, giao diện, quyền (các ticket sau). Chỉ ĐỌC DB (SELECT), không ghi, không thêm cột vào `ktt_tui` / `ktt_buu_gui`; nhãn «treo», «nằm lâu», «trễ chuyến» tính khi truy vấn.
> Mã: `server/lib/kttQuery.js` (truy vấn), `server/lib/kttDanhGia.js` (nhận xét, hàm thuần), `ktt_dia_ban_phat` ở `server/lib/kttSchema.js`. Test: `tests/ktt-query.test.js`, `tests/ktt-danh-gia.test.js`.
> Dùng: các hàm tính của KTT-4 (`kttTinh.js`, `kttCauHinh.js` — chỉ `require`, không sửa). Quy tắc nghiệp vụ: `37_KTT_QUY_TAC_TINH.md`; dữ liệu nguồn: `36_KTT_TU_DIEN_DU_LIEU.md`. Không dùng dữ liệu thật; fixture là dữ liệu giả.

## 1. Bảng `ktt_dia_ban_phat` (địa bàn phát)

`ma_phuong_xa` (UNIQUE), `ten_phuong_xa`, `ma_bcvh`, `ten_bcvh` — phường/xã → BCVH Huế phát. Tạo trong `ensureKttSchema`, nạp 40 dòng mặc định bằng `INSERT OR IGNORE` (chạy lại không nhân đôi; sửa tay một dòng không bị ghi đè; dòng PO đã XÓA sẽ được tạo lại ở lần khởi động sau, như hai bảng cấu hình của KTT-2). Số dòng theo BCVH: 535790 = 5, 536250 = 8, 535470 = 10, 537220 = 7, 537015 = 3, 533140 = 7. Dữ liệu là danh mục hành chính công khai, đặt trong mã (`DIA_BAN_PHAT_MAC_DINH`). Chính tả giữ nguyên theo ticket, kể cả «Phường Phong Dinh» (49325); PO sẽ chỉnh sau. `ensureKttSchema` đã được `server/db.js` gọi từ KTT-2 nên bảng tự có khi khởi động server (không đổi `db.js`).

## 2. Cách dựng «đơn vị» (nền của mọi hàm)

Hai lượt đọc bằng con trỏ `.iterate()` (không nạp cả bảng vào bộ nhớ):

- **Lượt túi** (theo `id`): mỗi túi chiều `DEN` / `DI` / `CHUYEN_TIEP_DI` → «đơn vị túi». Kèm `n_shbg` (số dòng bưu gửi của túi, truy vấn con theo chỉ mục 7 cột khóa).
- **Lượt SHBG** (`ktt_buu_gui` ⨝ `ktt_tui`, theo `shbg`): các dòng cùng SHBG liền nhau → «đơn vị SHBG». Tập SHBG ứng viên = SHBG có túi ĐẾN quét đến trong khoảng ngày (thêm: có túi ĐI / CHUYEN_TIEP_DI đi trong khoảng, chỉ khi cần sản lượng ĐI); sau đó lấy MỌI dòng của các SHBG đó (kể cả lần cũ) để chọn «lần cuối». Thứ tự nối ép cố định (`CROSS JOIN` + `+t.chieu`): để bộ lập kế hoạch tự chọn thì SQLite đảo ngược thành «mỗi túi dò toàn bộ danh sách SHBG» và treo ở cỡ một tuần (đã gặp khi viết).

Mỗi hàm công khai chạy bộ đếm của nó qua hai lượt trên; `tongHopKtt` chạy TẤT CẢ bộ đếm trong MỘT lượt (cho cùng kết quả như gọi riêng từng hàm — có test).

### 2.1 Đơn vị túi
- **Đích túi** (`nhomTui`): `bd10_di_ma_diem_nhan` → `to_pos` (túi ĐẾN nhận tại 530100 → nhóm `KTT`) → cột `dich_nhom` (chỉ khi `to_pos` rỗng) → `KHONG_RO`. Dùng `phanNhomDich` của KTT-4.
- **Chuyển tiếp đi** (`CHUYEN_TIEP_DI`, đã chia sẵn, không mở túi): chấm ở MỨC TÚI: `danhGiaChuyen` (quét đến = `gio_quet_tui_den`, giờ đi = `bd10_di_gio_di`, thiếu thì `gio_quet_tui_di`), `namThucTe`, `trangThaiNamLau`. Đích 530900 (`HE1_530900`) không chấm chuyến, không xét treo; `KHAC` có giờ nằm nhưng không chấm chuyến / nằm lâu.
- **Treo** (`trangThaiTreo`): túi `DEN` (mọi luồng) chưa mở túi, túi `CHUYEN_TIEP_DI` (đích ≠ 530900) chưa mã 3 (`gio_quet_tui_di`) và chưa BD10 đi (`bd10_di_so_hieu` hoặc `bd10_di_gio_di`).

### 2.2 Đơn vị SHBG (hàng khai thác lại: túi đến → mở → đóng sang túi đi)
- **Lần đi cuối**: dòng túi `DI` có giờ đi muộn nhất (dòng túi đi chưa có giờ đi chỉ dùng khi không dòng nào có giờ — khi đó coi là chưa đi, vẫn lấy nơi nhận BD10 để tra đích).
- **Túi đến ghép**: túi `DEN` có `gio_quet_tui_den` muộn nhất mà KHÔNG sau giờ đi cuối; không có thì túi đến muộn nhất. Không dòng đến nào có mã 4 → dòng đến có id lớn nhất (chuyến sẽ `KHONG_AP_DUNG` / `THIEU_MOC_QUET_DEN`). Hàng qua KTT hai lần → chỉ lần cuối vào chuyến / nằm lâu / F1.3 (sản lượng vẫn đếm cả hai lượt đến: đếm sự kiện).
- **Đích SHBG**: đã vào BD10 đi → nơi nhận BD10 của lần đi cuối; chưa → `ma_xa_phuong` tra `ktt_dia_ban_phat`; không tra được → `KHONG_RO` (không chấm F1.3 và chuyến; vẫn tính sản lượng, khối lượng).
- **XNĐ** (F1.3) = sớm nhất trong `ti_xac_nhan_den_luc` và `bd10_den_xnd` của túi đến ghép.
- **Ngày ĐẾN** = ngày của `gio_quet_tui_den` (không có thì `bd10_den_xnd`); **ngày ĐI** = ngày của giờ đi.
- **«Cần kiểm tra lại»**: `quetDen` ↔ giờ đi, hoặc XNĐ ↔ giờ đi, cách nhau > 7 ngày (đúng 7 ngày vẫn xét). Không vào chuyến, nằm lâu; F1.3 báo `CAN_KIEM_TRA_LAI` (khi có XNĐ; thiếu XNĐ thì `CHUA_XAC_NHAN_DEN`); được đếm ở `chatLuongDuLieu` và mở được bằng `chiTiet` loại `can_kiem_tra_lai`. Túi chuyển tiếp đi: quét đến ↔ giờ đi.

### 2.3 Khoảng ngày và `bayGio`
`tuNgay`, `denNgay`: `YYYY-MM-DD`, gồm cả hai đầu; lọc bằng so sánh chuỗi trên giờ (định dạng cố định nên thứ tự chuỗi = thứ tự thời gian; dùng chỉ mục `gio_quet_tui_den`, `bd10_di_gio_di`). «Ngày» của chuyến / treo / nằm lâu / F1.3 / chất lượng = ngày QUÉT ĐẾN; sản lượng ĐẾN theo ngày quét đến, ĐI (cả `CHUYEN_TIEP_DI`) theo giờ đi. Thiếu `denNgay` = `tuNgay`; thiếu cả hai = ngày của `bayGio`. `bayGio` thiếu → giờ hiện tại theo UTC+7 cố định (`bayGioMacDinh`, dùng `Date.now()` một lần duy nhất; không phụ thuộc `TZ`). Sai định dạng / `tuNgay > denNgay` → ném `LoiKtt` (`code`: `KTT_NGAY_SAI`, `KTT_KHOANG_NGAY_SAI`, `KTT_BAY_GIO_SAI`). `opts.cauHinh` (kết quả `docCauHinhKtt`) ghi đè cấu hình, dùng cho test.

## 3. Hàm truy vấn và hình dạng kết quả

Mọi hàm: `(db, { tuNgay, denNgay, bayGio, cauHinh? })`. Thiếu bảng → không ném lỗi, trả rỗng + `canhBao` (chỉ ở `tongHopKtt`).

| Hàm | Kết quả |
|---|---|
| `sanLuongTheoNgay` | `{ khoangNgay, theoNgay: [{ ngay, chieu, luong, nhom, tui, shbg, khoiLuongGam }], tong: [{ ngay, chieu, luong, tui, shbg, khoiLuongGam, khoiLuongTuiKg }], tongCong: { DEN, DI, CHUYEN_TIEP_DI } }`. |
| `tonTreo` | `{ khoangNgay, treoPhut, tong: { tui, shbg }, theoLoai: [{ loai (CHUA_QUET_DI/CHUA_MO_TUI), nhom, tuoi, tui, shbg }], theoTuoi, theoBcvh: [{ maBcvh (hoặc KHONG_RO_BCVH), tui, shbg }], theoNgay: [{ ngay, tong, treo }], chuaDenNguong, khongCoMocQuetDen }`. |
| `chuyenTheoBcvh` | `{ khoangNgay, chotTruocPhut, theoBcvhChuyen: [{ ngay, maBcvh, chuyen, nguon, donVi, tong, DUNG_CHUYEN, TRE_CHUYEN, LO_CHUYEN, CHUA_DEN_MOC, soChuyenTre, treTu2Ngay }], theoNgay, theoGioQuetDen: [{ gio, chuyen, nguon, donVi, tong, dungChuyen, treChuyen }], denSatGio: [{ maBcvh, chuyen (chuyến sát giờ), nguon, donVi, soDenSatGio, kipChuyenSat, sangChuyenKe, chuaDi }], khongApDung: [{ lyDo, nguon, donVi, soLuong }] }`. |
| `namLauTheoBac` | `{ khoangNgay, namLauToiDaPhut, theoBac: [{ nguon, donVi, luong, caQuet (NGAY/DEM), nhom, bac, soDon, namLau, namLauTreChuyen, namLauQuaNguong }], tongNguon: { [nguon]: { donVi, daDi, daDiBcvhHue, namLau } } }`. |
| `chiTieuF13` | `{ khoangNgay, theoBcvh: [{ maBcvh, tong, soDoDuoc, XND_SAU_GIO_DI, CHUA_XAC_NHAN_DEN, CAN_KIEM_TRA_LAI, THIEU_BAY_GIO, quy: { AM, T0_2H, T2_6H, TREN_6H } }], tongCong }`. |
| `chiTiet` | `{ khoangNgay, loai, maBcvh, tong, trang, kichThuocTrang, soTrang, dong: [...] }`. |
| `tongHopKtt` | `{ khoangNgay, canhBao, sanLuong, tonTreo, chuyen, namLau, chiTieuF13, chatLuongDuLieu: { shbgKhaiThacLai, shbgKhongRoDich, shbgCanKiemTraLai, tuiCanKiemTraLai, tuiChuyenTiepDi, bd10Den, bd10DenChuaXacNhan } }`. |

- **`nguon`** (chuyến, nằm lâu): `CHUYEN_TIEP_DI` (đơn vị TÚI) hoặc `KHAI_THAC_LAI` (đơn vị SHBG). Không cộng hai nguồn với nhau (khác đơn vị).
- **Sản lượng**: SHBG đếm khác nhau trong từng ô (một SHBG ở túi đến và túi đi vẫn một lần ở mỗi chiều); khối lượng là tổng gam của các SHBG đó (không phải kg túi). `nhom` của ô theo đích TỪNG SHBG (ĐẾN: đích của lần đi cuối; ĐI: nơi nhận BD10 của chính túi đó; `CHUYEN_TIEP_DI`: đích túi). Một túi chứa SHBG nhiều nhóm xuất hiện ở nhiều ô nên tổng `tui` của các ô `nhom` có thể lớn hơn `tong.tui` (đã đếm túi một lần). Túi không có dòng bưu gửi vẫn được đếm (`shbg` 0, nhóm theo đích túi). `khoiLuongTuiKg` chỉ để đối chiếu, nằm ở `tong`.
- **Tồn treo**: ảnh chụp tại `bayGio`, lọc theo ngày quét đến trong khoảng (treo từ trước khoảng KHÔNG hiện — chọn khoảng đủ rộng nếu cần xem cả tồn cũ). `theoNgay.tong` = số túi xét treo (túi `DEN`; túi `CHUYEN_TIEP_DI` đích ≠ 530900) quét đến trong ngày, làm mẫu số tỷ lệ treo.
- **Chuyến**: chỉ đích 6 BCVH Huế, dòng chỉ gồm hàng có chuyến chấm được (không `CAN_KIEM_TRA_LAI`); `KHONG_AP_DUNG` gom ở `khongApDung` (`KHONG_CO_LICH` → cảnh báo cấu hình ở `tongHopKtt`). `soChuyenTre` = tổng `soChuyenTre` của KTT-4 (nhân số đơn vị); `treTu2Ngay` = số `TRE_CHUYEN` có giờ đi muộn hơn mốc dự kiến ≥ 2 ngày. «Đến sát giờ»: `kipChuyenSat` (đi trước hoặc đúng mốc chuyến sát giờ), `sangChuyenKe` (đã đi nhưng sau mốc đó), `chuaDi`.
- **Nằm lâu**: chỉ hàng ĐÃ đi, không `CAN_KIEM_TRA_LAI`. Bậc theo `phanBacNamLau` (có `AM` = quét đến sau giờ đi, giữ nguyên, không chỉnh). Ngày/đêm theo giờ quét đến: ĐÊM nếu giờ ≥ 21 hoặc < 7 (khớp khung loại trừ 21:00–07:00), còn lại NGÀY. `namLau` chỉ phát sinh ở nhóm `BCVH_HUE` (`trangThaiNamLau` của KTT-4).
- **F1.3**: SHBG đích BCVH Huế, `tinhChiTieu` (12 giờ cho phường 49135, 49133; 14 giờ còn lại). `soDoDuoc` = `DO_DUOC` (kể cả hàng chưa đi, tính tới `bayGio`). Quỹ còn lại theo giây, không làm tròn: `AM` (< 0, vượt chỉ tiêu), `T0_2H` (0–2 giờ, gồm 2 giờ đúng), `T2_6H`, `TREN_6H`. `XND_SAU_GIO_DI` (xác nhận đến sau giờ đi) là NHÓM RIÊNG, không có quỹ (số âm không bị đổi về 0).

### 3.1 `chiTiet`
`opts`: `loai` (bắt buộc), `maBcvh`, `ngay` (= `tuNgay` = `denNgay`) hoặc `tuNgay` / `denNgay`, `bayGio`, `trang` (từ 1), `kichThuocTrang` (mặc định 50, TỐI ĐA 200, lớn hơn bị ép về 200). Loại: `treo`, `nam_lau`, `tre_chuyen`, `lo_chuyen`, `den_sat_gio`, `xnd_sau_gio_di` (sáu loại của ticket) và thêm `can_kiem_tra_lai`, `khong_ro_dich`, `quet_den_sau_gio_di` (để mở từ nhận xét chất lượng dữ liệu / bất thường). Loại sai / `maBcvh` ngoài 6 BCVH Huế / trang ≤ 0 → `LoiKtt` (`KTT_LOAI_SAI`, `KTT_BCVH_SAI`, `KTT_TRANG_SAI`). Thứ tự dòng: túi (theo `id`) rồi SHBG (theo `shbg`); `tong` là tổng số dòng khớp bộ lọc. Dòng: `donVi` (`TUI`/`SHBG`), `shbg`, `tuiId`, `soHieuBd8`, `bd10Den`, `bd10Di`, `nhom`, `maBcvh`, `quetDen`, `xndBd10`, `xnd`, `gioDi`, `ngayDen`, `soShbg` (túi), `trangThaiChuyen`, `chuyenDuKien`, `mocDuKien`, `soChuyenTre`, `denSatGio`, `kipChuyenSat`, `giayNam`, `bacNam`, `trangThaiNamLau`, `lyDoNamLau`, `trangThaiTreo`, `tuoiGiay`, `tuoiTreo`, `trangThaiF13`, `conLaiGiay`, `canKiemTraLai`. Loại chỉ cần một lượt (`treo`: túi; `xnd_sau_gio_di`, `khong_ro_dich`: SHBG) bỏ qua lượt kia.

## 4. Khối «Đánh giá» (`taoDanhGia(tongHop, tuyChon)`)

Hàm thuần, trả `[{ ma, mucDo: 'THONG_TIN'|'LUU_Y'|'CANH_BAO', cau, soLieu, loc }]`; `loc` = `{ loai, maBcvh?, ngay? }` mở được `chiTiet` hoặc `null`. Mọi số lấy từ `tongHop`; chỉ sinh khi mẫu số > 0 (khoảng ngày rỗng → `[]`); câu chứa `NaN` / `undefined` / `Infinity` bị loại. Sắp theo thứ tự dưới đây (không sắp theo mức độ). `tuyChon.nguong` ghi đè một phần `NGUONG_DANH_GIA`.

| `ma` | Nội dung | Mức độ (ngưỡng ở đầu `kttDanhGia.js`) |
|---|---|---|
| `DUNG_CHUYEN_<nguon>` | Tỷ lệ đi đúng chuyến + BCVH thấp nhất (khi ≥ 2 BCVH) | ≥ 90% THONG_TIN; ≥ 75% LUU_Y; thấp hơn CANH_BAO |
| `DUNG_CHUYEN_THEO_GIO_<nguon>` | «Quét đến 7 giờ: 623 túi vào chuyến trưa, chỉ 20 túi kịp chuyến sáng» — giờ quét đến có nhiều hàng nhất (ưu tiên giờ có ≥ 2 chuyến); «chỉ … kịp» khi chuyến đứng trước ít hơn chuyến đứng sau | THONG_TIN |
| `DI_TRE_<nguon>` | Số đi chuyến sau, số đi muộn từ 2 ngày, số lỡ chuyến | không trễ THONG_TIN; (trễ + lỡ)/đã chấm ≥ 10% CANH_BAO; còn lại LUU_Y |
| `DEN_SAT_GIO_<nguon>` | Số đến sát giờ (30 phút cuối, lấy từ cấu hình), tỷ lệ kịp, tỷ lệ sang chuyến kế, số chưa đi | sang chuyến kế ≥ 50% LUU_Y, còn lại THONG_TIN |
| `TREO` | Tổng túi / SHBG, theo loại, số trên 3 ngày, BCVH đích nhiều nhất + «KTT cần kiểm tra và giải trình.» | có túi trên 3 ngày hoặc treo/xét ≥ 5% CANH_BAO; còn treo LUU_Y; không treo THONG_TIN |
| `NAM_LAU_<nguon>` | Số và tỷ lệ nằm lâu (đích BCVH Huế), theo bậc, ban đêm / ban ngày + «KTT cần kiểm tra và giải trình.» | ≥ 20% CANH_BAO; ≥ 5% LUU_Y |
| `BAT_THUONG_NGAY_TREO`, `BAT_THUONG_NGAY_TRE_CHUYEN` | Ngày có tỷ lệ treo / (đi trễ + lỡ chuyến) cao hơn hẳn các ngày khác (tối đa 3 ngày) | LUU_Y |
| `XND_SAU_GIO_DI` | Tỷ lệ xác nhận đến sau giờ BD10 đi (mẫu: `soDoDuoc` + `XND_SAU_GIO_DI`) | ≥ 10% CANH_BAO; ≥ 2% LUU_Y |
| `QUET_DEN_SAU_GIO_DI_<nguon>` | Tỷ lệ hàng đã đi có quét đến sau giờ BD10 đi (bậc `AM`) | ≥ 10% CANH_BAO; ≥ 2% LUU_Y |
| `CHI_TIEU_F13` | Phân bố quỹ còn lại (âm / 0–2 / 2–6 / trên 6 giờ) | âm ≥ 20% CANH_BAO; có âm LUU_Y |
| `CHAT_LUONG_KHONG_RO_DICH`, `CHAT_LUONG_BD10_CHUA_XND`, `CHAT_LUONG_CAN_KIEM_TRA_LAI` | Số SHBG không rõ đích; số BD10 đến chưa có xác nhận đến; số hàng «Cần kiểm tra lại» (chỉ khi > 0) | không rõ đích ≥ 5% CANH_BAO; còn lại LUU_Y |

**Ngày bất thường** (`ngayBatThuong`): chuỗi ngày `{ ngay, tu, mau }` (treo: `treo`/`tong` của `tonTreo.theoNgay`; trễ: (`treChuyen` + `loChuyen`)/`daCham` của `chuyen.theoNgay`, gộp hai nguồn). Chỉ xét ngày có `mau` ≥ 20 và chỉ khi có ≥ 4 ngày như vậy. Ngày *i* bất thường khi `tyLe_i − trungBinh(các ngày còn lại) > max(2 × độLệchChuẩn(các ngày còn lại), 0,10)` — so với mặt bằng của CÁC NGÀY CÒN LẠI (không để chính ngày đó kéo trung bình và độ lệch lên; độ lệch chuẩn tổng thể, chia cho số ngày còn lại) và luôn cần chênh ≥ 10 điểm phần trăm. Câu nêu ngày, tỷ lệ, `tu/mau`, trung bình các ngày còn lại.

## 5. Hiệu năng và chỉ mục

Dữ liệu giả cỡ một tuần (15.000 túi: 5.000 đến, 2.500 đi, 7.500 chuyển tiếp; 75.000 dòng bưu gửi; 50.000 SHBG khác nhau), máy dev, một mình: `tongHopKtt` ≈ 1,0–1,1 giây; từng hàm riêng 0,6–0,9 giây (`tonTreo` ≈ 0,15 giây); `chiTiet` ≈ 0,75 giây (trong đó SQL của lượt SHBG ≈ 0,4 giây). Chạy trong `npm test` song song với các file khác có thể chậm hơn gấp đôi; test chỉ ép ngưỡng 2 giây khi đặt `KTT_PERF=1` (mặc định ngưỡng nới 15 giây, số đo in ra dòng `# KTT-5 hiệu năng`). Đã tối ưu: nhớ `docGiay` và kết quả `danhGiaChuyen` / `tinhChiTieu` / `namThucTe` theo mốc (nhiều SHBG cùng túi cùng mốc); trước tối ưu `tongHopKtt` ≈ 1,4 giây.

**Chỉ mục**: không cần thêm cho cỡ một tuần. Kế hoạch (`EXPLAIN QUERY PLAN`) dùng `ix_ktt_tui_gio_quet_den` (đa chỉ mục OR), `ix_ktt_buu_gui_shbg`, chỉ mục duy nhất 7 cột khóa. Chưa chắc khi bảng lớn (hàng triệu dòng): nhánh dự phòng «không có mã 4 thì XND BD10 đến» (`bd10_den_xnd`) và nhánh ngày đi dự phòng (`gio_quet_tui_di`) chưa có chỉ mục riêng; nếu thấy chậm, thêm `ktt_tui(bd10_den_xnd)` và `ktt_tui(gio_quet_tui_di)` (việc của ticket sau, không đổi cột).

## 6. Điều chưa chắc

- **Ghép túi đến → túi đi** là quy tắc của KTT-5 (mục 2.2), không có trong `KTT-quy-tac-tinh.md` (file đó không có trong repo). Hàng qua KTT hai lần mà lần đến thứ hai chưa đi, còn lần đi thứ nhất đã có: bị ghép cặp lần 1 (đến 1 ↔ đi 1) và lần đến 2 không được xét; chưa kiểm với dữ liệu thật.
- **Hàng khai thác lại chưa thấy túi đi** có thể chỉ do file `KTT_Tui` / `KTT_BuuGui` đến lệch nhau (36 §2.7) → hiện thành `CHUA_DEN_MOC` / `LO_CHUYEN` sai tạm thời. Chưa có cách phân biệt ở V1.
- **Đích túi** (`to_pos` → `dich_nhom`): `Dich_nhom` của nguồn chưa rõ nghĩa với túi ĐẾN; túi `DEN` luôn ra nhóm `KTT` (`to_pos` = 530100). «Treo theo nhóm đích» vì vậy chủ yếu có nghĩa với túi chuyển tiếp đi.
- **Giờ đi** của túi chuyển tiếp đi / túi đi = `bd10_di_gio_di`, thiếu thì `gio_quet_tui_di` (mã 3). Chưa kiểm hai giờ này lệch nhau trong dữ liệu thật.
- Sản lượng `CHUYEN_TIEP_DI` tính theo giờ đi nên túi chưa đi không vào sản lượng ĐI (chỉ vào treo / chuyến). Túi không có mã 4 và không có XNĐ BD10 (không có ngày đến) không vào hàm nào theo khoảng ngày.
- Ngưỡng mức độ và công thức ngày bất thường là giá trị đề xuất của KTT-5 (chưa PO chốt); đã gom ở đầu `kttDanhGia.js`.
- `quet_den_sau_gio_di`, `can_kiem_tra_lai`, `khong_ro_dich` là loại `chiTiet` thêm ngoài sáu loại trong ticket.
