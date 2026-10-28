# 43 · KTT-12 — API «đi cùng ngày» (B1–B3), hàng rớt lại, lịch xe (B4–B6), danh sách bấm ô, hàng đến từ xe Cấp 1 (A), tổng quan

Đưa các số của canvas «Hàng tại KTT» ra API **chỉ đọc**, cho **ADMIN và TTVH** (GDVH, TIVI 403; không token 401), cùng router và cùng middleware với `/api/ktt/luu-thoat` (xem `42_KTT_API.md` mục 1).
Chưa có giao diện. Chưa làm: đối chiếu BCVH, tồn tại và gợi ý, xlsx 9 sheet. Mọi JSON trong tài liệu này là **dữ liệu giả**.

## 1. File

| File | Vai trò |
|---|---|
| `server/lib/kttDiNgay.js` | Hàm THUẦN: `phanLoaiDi` (một SHBG → hướng + nhóm), «bó ngày» cộng được (`taoNgay`, `themShbg`, `congCacNgay`), `tongHop` (B1), `theoNgay` + `soSanhChuNhat` (B2), `theoGio` + `chia12h` (B3), `rotLaiTheoDuongThu`, `theoDuongThu` (B5). |
| `server/lib/kttDiNgayQuery.js` | Truy vấn: `tinhNgay` (bó MỘT ngày đến), `danhSach` (danh sách bấm ô). Dùng lại lượt đọc SHBG `kttQuery.chayBoDem` và `kttLuuThoat.phanLoaiShbg`. |
| `server/lib/kttLichXe.js` | B4 `gioLapBd10`, B6 `theoBcvh`, `chuyenGanNhat`. |
| `server/lib/kttHangDen.js` | Trang A «Hàng đến từ xe Cấp 1» (`tinh`). |
| `server/lib/kttApi.js` (sửa) | Kiểm tham số, cache theo ngày (`layNgayB`), các hàm endpoint, `tongQuan`. |
| `server/lib/kttWorker.js` (sửa) | Thêm tác vụ nền `danhSachDiNgay`, `hangDen`, `gioLapBd10`. |
| `server/lib/kttQuery.js` (sửa) | Đơn vị SHBG thêm `diemGuiDenTen` (chỉ để hiển thị B5). Không đổi cách tính. |
| `server/routes/ktt.js` (sửa) | 13 route mới (mục 4). |
| `scripts/ktt-do-hieu-nang-di-ngay.js` | Đo thời gian từng endpoint ở cửa sổ 30 ngày trên BẢN SAO DB (mục 8). |
| `tests/ktt-di-cung-ngay.test.js` | 20 ca, dữ liệu giả. |

## 2. Định nghĩa

**Cùng một định nghĩa «cùng ngày» với `/luu-thoat`.** Hàng đi về 6 BCVH Huế lấy trạng thái từ chính `phanLoaiShbg` (KTT-7b): ngày đến D = ngày của `Gio_quet_tui_den`; «đã đi» = giờ LẬP BD10 đi (`bd10_di_gio_di`); xếp chuyến theo lịch chính thức.
Vì vậy trên cùng khoảng: `cung_ngay` = t1 + t2, `hom_sau` = t3 + t4, `tu_2_ngay` + `chua_di_*` = t5, `dang_cho_chuyen` = `dang_cho_chuyen`, `mau_so` = t1..t5 (có test so khớp, cả theo từng ngày và cờ `da_chot`).

Năm nhóm đi (mẫu số `mau_so` = tổng năm nhóm):
`cung_ngay` · `hom_sau` · `tu_2_ngay` (đã đi từ D+2) · `chua_di_duoi_24h` · `chua_di_tren_24h` (chưa đi; chờ tính liên tục từ giờ quét túi đến đến «bây giờ» = độ mới dữ liệu).
Ngoài mẫu số: `dang_cho_chuyen` (chưa đi, chưa tới giờ xe) và `khong_phan_loai` (thiếu giờ quét túi đến / không xếp được chuyến). `ro_lai` = `mau_so` − `cung_ngay` (= t3 + t4 + t5 của `/luu-thoat`).

Bốn hướng (`HUONG` trong `kttDiNgay.js`; hàng hoàn là hướng riêng):

| Hướng | Nghĩa |
|---|---|
| `lien_tinh_den_bcvh` | nơi gửi BD10 đến không bắt đầu bằng `53` (xe Cấp 1), đích 6 BCVH Huế |
| `noi_tinh_den_bcvh` | nơi gửi `53…`, đích 6 BCVH Huế. Trả hai cách đếm: `khong_hang_hoan` (khớp `/luu-thoat` `tong`) và `co_hang_hoan`; `hang_hoan` riêng |
| `noi_tinh_hang_hoan` | hàng hoàn Tổ KHHH (531120 → Thuận Hóa): tách riêng, **không cộng vào tổng và tỷ lệ** (như `/luu-thoat`) |
| `noi_tinh_di_lien_tinh` | nơi gửi `53…`, đích ngoài 6 BCVH Huế (xe Cấp 1). Không có lịch chuyến nên so **ngày** trực tiếp: ngày lập BD10 đi ≤ ngày đến = cùng ngày |

SHBG không rõ đích hoặc không thuộc bốn hướng trên không vào số nào; đếm ở `bo_qua` (`khong_ro_dich`, `ngoai_nhom_b`).

**Hàng đến theo giờ (B3, B6)** dùng giờ của `Gio_quet_tui_den`, chỉ hàng đích 6 BCVH Huế.

**B4 — «chuyến theo lịch C2», không phải số chuyến của hệ thống** (PO duyệt). CSV không có thứ tự chuyến trong ngày (`mail_trip_number` là số tăng liên tục). Mỗi BD10 đi (số hiệu khác nhau, gồm túi `DI` và `CHUYEN_TIEP_DI`)
được gán cho chuyến của lịch chính thức (`ktt_lich_chuyen`, 14 dòng) có giờ xuất phát **gần giờ lập nhất** (xét ngày lập và hai ngày kề; hòa thì chuyến sau). `truoc_xe_tb_gio` > 0 = lập trước giờ xe, < 0 = lập sau. Phản hồi có `quy_uoc` nhắc điều này.

**Trang A** — đơn vị là CẶP (xe, bưu gửi): số hiệu BD10 đến × SHBG. «Xe Cấp 1» = nơi gửi BD10 đến không bắt đầu bằng `53`. Gồm mọi túi có BD10 đến, **cả `DEN` lẫn `CHUYEN_TIEP_DI`**. Ngày/giờ = giờ xác nhận BD10 đến (`bd10_den_xnd`);
túi thiếu giờ này không vào bảng theo ngày/giờ (đếm ở `meta.so_tui_thieu_gio_xe_den`). Hướng hàng (A5) theo ĐỊA CHỈ nhận: mã phường/xã → 6 BCVH (`ktt_dia_ban_phat`); không tra được mà mã tỉnh `53` → «Huế, chưa rõ BCVH»; `52` → Quảng Trị;
không có cả hai → «không rõ»; còn lại → «tỉnh khác». Tên tỉnh trong CSV hỏng dấu nên CHỈ dùng mã. Đường thư không có tên (ví dụ 55091023) hiện `(chưa có tên)`, không có mã hiện `(không rõ đường thư)`. «Đợt» xe: xe cùng đường thư cách nhau ≤ 120 phút gộp một đợt, chỉ liệt kê đợt ≥ 5% bưu gửi của đường thư, tối đa 6 (quy ước trình bày, TẠM).

## 3. Quy tắc tham số chung
- `tu`, `den` (`YYYY-MM-DD`) **bắt buộc**, ngày có thật, `tu` ≤ `den`, khoảng ≤ 31 ngày. Khóa lạ, lặp tham số → 400 (cùng cách với `/luu-thoat`, mã `KTT_*`, thông báo tiếng Việt, không lộ nội bộ).
- Phản hồi nào cũng có: `khoang_ngay` {tu_ngay, den_ngay, so_ngay} (cửa sổ yêu cầu), `cua_so_thuc_te` {tu_ngay, den_ngay, so_ngay_co_du_lieu} (ngày đầu/cuối **thực sự có dữ liệu**), `nguon_xuat_luc_moi_nhat` = `bay_gio` = «Dữ liệu đến» (độ mới), `co_du_lieu`, `ly_do`.
  Chưa có cặp OK nào → 200 rỗng với `co_du_lieu: false`, `ly_do: 'CHUA_CO_DU_LIEU'` (không đọc đồng hồ máy). Riêng `danh-sach` theo dạng `{ items, pagination, meta }` như `/chi-tiet` (`meta.ly_do`).
- «Bây giờ» = độ mới dữ liệu, như `/luu-thoat`.

## 4. Endpoint

| Route (GET, ADMIN/TTVH) | Tham số riêng | Trả về |
|---|---|---|
| `/api/ktt/dicungngay/tong-hop` | — | **B1**: `lien_tinh_den_bcvh`, `noi_tinh_den_bcvh {khong_hang_hoan, co_hang_hoan, hang_hoan}`, `noi_tinh_di_lien_tinh`, `bcvh_hue_khong_hang_hoan` (= hai hướng đến BCVH, khớp `/luu-thoat`), `bo_qua`, `dinh_nghia`. Mỗi khối: `tong_shbg`, `mau_so`, năm nhóm, `ro_lai`, `dang_cho_chuyen`, `khong_phan_loai`, `ty_le` (null khi mẫu số 0), `kg`, `kg_ro_lai` |
| `/api/ktt/dicungngay/theo-ngay` | — | **B2**: `theo_ngay[]` {ngay, chu_nhat, da_chot, co_du_lieu, bcvh_hue, lien_tinh_den_bcvh, noi_tinh_den_bcvh, hang_hoan, noi_tinh_di_lien_tinh}; `so_sanh_chu_nhat` {chu_nhat, ngay_thuong}: số ngày, tỷ lệ gộp, tỷ lệ trung bình ngày |
| `/api/ktt/dicungngay/theo-gio` | — | **B3**: `theo_gio[24]` (giờ của giờ quét túi đến, mỗi giờ một khối như trên), `chia_12h` {truoc_12h, tu_12h} |
| `/api/ktt/rotlai/theo-duong-thu` | `top` 1..50 (8) | đường thư Cấp 1 lớn nhất → 6 BCVH Huế: `dong[]` {duong_thu_ma, duong_thu_ten, khối, `dich_chinh` (2 BCVH nhận nhiều nhất)}, `cong_top`, `tong_lien_tinh_den_bcvh`, `so_duong_thu` |
| `/api/ktt/lich-xe/gio-lap-bd10` | `min_bd10` 1..100 (5) | **B4**: `dong[]` theo (BCVH, đường thư đi, chuyến lịch): `xe_roi_ktt`, `so_bd10`, `gio_lap_tb/som_nhat/muon_nhat`, `truoc_xe_tb_gio`, `so_bd10_lap_sau_gio_xe`; `tong_bd10`, `so_nhom_bi_loc`, `quy_uoc`, `canh_bao` |
| `/api/ktt/lich-xe/theo-duong-thu` | `top` 1..50 | **B5**: ba mục `lien_tinh_den_bcvh` (8), `noi_tinh_den_bcvh` (8), `noi_tinh_di_lien_tinh` (4): dòng theo (nơi gửi, đường thư đến) kèm `gio_nhan_tb/som_nhat/muon_nhat`; dòng hàng hoàn có `hang_hoan: true`, không cộng vào `cong` |
| `/api/ktt/lich-xe/theo-bcvh` | — | **B6**: 6 BCVH theo thứ tự canvas (Thuận Hóa, Hương Thủy, Hương Trà, Thuận An, Phú Lộc, A Lưới): `shbg`, `kg`, `lich[]`, `hang_den_theo_gio` {so_ngay_chia, gio_quet_tui_den[24], gio_xac_nhan_bd10[24]}, `gio_lap_bd10_thuc_te[]` |
| `/api/ktt/danh-sach` | `loai` = `hom-sau` \| `chua-di-24h` (bắt buộc); `duong_thu`, `noi_gui`, `huong`, `hang_hoan` (0/1), `ma_bcvh`, `page`, `page_size` ≤ 200 (50) | danh sách SHBG của một ô, `pagination.total` = đúng ô tương ứng của B1/rớt lại (cùng bộ lọc), sắp theo SHBG, ổn định giữa các trang |
| `/api/ktt/hang-den/tong-hop` | — | **A**: thẻ tổng (`shbg`, `kg`, `xe`, tb/ngày, `dich`) + `theo_ngay[]` |
| `/api/ktt/hang-den/theo-gio` | — | **A3**: `theo_gio[24]` kèm `theo_duong_thu` (đường thư lớn nhất) và `khac` |
| `/api/ktt/hang-den/theo-duong-thu` | `top` 1..200 | **A4**, đợt xe chính (A2), hướng hàng (A5) |
| `/api/ktt/hang-den/xe` | — | **A2**: mỗi xe (BD10 đến) một dòng |
| `/api/ktt/tong-quan` | — | gom từ CÙNG các bó/hàm: `di_cung_ngay` {the (= B1), theo_ngay rút gọn (B2), so_sanh_chu_nhat, chia_12h}, `rot_lai` (top 3), `hang_den` {cua_so_thuc_te, tong_hop, meta}, `canh_bao[]` |

Mã trả: 200; 400 (`KTT_THIEU_THAM_SO`, `KTT_NGAY_SAI`, `KTT_KHOANG_NGAY_SAI`, `KTT_KHOANG_QUA_DAI`, `KTT_THAM_SO_LA`, `KTT_THAM_SO_SAI`, `KTT_LOAI_SAI`, `KTT_BCVH_SAI`…); 401; 403; 500 chung (`LOI_HE_THONG`).

**`tong-quan` / `canh_bao`** (ngưỡng TẠM, hằng số `NGUONG_CANH_BAO` trong `kttApi.js`): `DEN_TU_12H_SANG_HOM_SAU` (% cùng ngày của hàng quét từ 12 giờ < 50%), `NOI_TINH_DI_BCVH_CHAM` (nội tỉnh → BCVH, % cùng ngày < 50%), `CHU_NHAT_CHAM_HON` (Chủ nhật thấp hơn ngày thường hơn 5 điểm, mức `LUU_Y`).
Số trong `tong-quan` BẰNG số của các endpoint con (có test `deepEqual`).

## 5. Mẫu JSON giả
`GET /api/ktt/dicungngay/tong-hop?tu=2026-10-20&den=2026-10-22` (rút gọn; dữ liệu giả của test):
```json
{
  "khoang_ngay": { "tu_ngay": "2026-10-20", "den_ngay": "2026-10-22", "so_ngay": 3 },
  "cua_so_thuc_te": { "tu_ngay": "2026-10-20", "den_ngay": "2026-10-22", "so_ngay_co_du_lieu": 3 },
  "nguon_xuat_luc_moi_nhat": "2026-10-23 10:00:00", "bay_gio": "2026-10-23 10:00:00", "co_du_lieu": true, "ly_do": null,
  "lien_tinh_den_bcvh": {
    "tong_shbg": 8, "mau_so": 8, "cung_ngay": 4, "hom_sau": 2, "tu_2_ngay": 1, "chua_di_duoi_24h": 0, "chua_di_tren_24h": 1,
    "ro_lai": 4, "dang_cho_chuyen": 0, "khong_phan_loai": 0,
    "ty_le": { "cung_ngay": 0.5, "hom_sau": 0.25, "tu_2_ngay": 0.125, "chua_di_duoi_24h": 0, "chua_di_tren_24h": 0.125, "ro_lai": 0.5 },
    "kg": 0.8, "kg_ro_lai": 0.4
  },
  "noi_tinh_den_bcvh": { "khong_hang_hoan": { "tong_shbg": 1, "cung_ngay": 1 }, "co_hang_hoan": { "tong_shbg": 2 }, "hang_hoan": { "tong_shbg": 1 } },
  "noi_tinh_di_lien_tinh": { "tong_shbg": 2, "cung_ngay": 1, "hom_sau": 1 },
  "bcvh_hue_khong_hang_hoan": { "tong_shbg": 9 },
  "bo_qua": { "khong_ro_dich": 0, "ngoai_nhom_b": 0 },
  "dinh_nghia": { "cung_ngay": "BD10 đi (giờ lập) trước 24:00 ngày đến KTT …", "ro_lai": "…", "chua_di": "…", "hang_hoan": "…", "moc_gio_den": "gio_quet_tui_den" }
}
```
`GET /api/ktt/danh-sach?tu=…&den=…&loai=hom-sau&page_size=2` (mỗi dòng không có tên người, biển số, tài khoản):
```json
{
  "items": [ { "shbg": "KTT-DEMO-A3", "ngay_den": "2026-10-20", "gio_den_ktt": "2026-10-20 21:30:00", "xnd_bd10_den": "2026-10-20 21:30:00", "kg": 0.1,
               "ma_bcvh": "533140", "ten_bcvh": "…", "huong": "lien_tinh_den_bcvh", "hang_hoan": false, "nhom": "hom_sau",
               "bd10_di_gio_lap": "2026-10-21 06:30:00", "cho_gio": 9, "duong_thu_ma": "DT-A", "duong_thu_ten": "Đường thư giả A", "noi_gui_ma": "999001", "noi_gui_ten": "Điểm 999001" } ],
  "pagination": { "total": 5, "page": 1, "page_size": 2, "total_pages": 3 },
  "meta": { "loai": "hom-sau", "duong_thu": null, "noi_gui": null, "huong": null, "hang_hoan": null, "ma_bcvh": null, "tu": "2026-10-20", "den": "2026-10-22", "nguon_xuat_luc_moi_nhat": "2026-10-23 10:00:00", "bay_gio": "2026-10-23 10:00:00", "ly_do": null }
}
```
`GET /api/ktt/hang-den/tong-hop` (rút gọn): `{ …phần đầu chung…, "meta": { "so_tui_thieu_gio_xe_den": 0, "so_ngay_co_du_lieu": 2, "shbg_thieu_khoi_luong": 0, "quy_uoc": {…} }, "shbg": 5, "kg": 2.9, "xe": 2, "dich": { "tp_hue": { "shbg": 3, "ty_le": 0.6, "xac_dinh_bcvh": 1 }, "theo_bcvh": { "533140": 1, … }, "hue_chua_ro_bcvh": 1, "ngoai_hue": { "shbg": 2, "quang_tri": 1, "tinh_khac": 1, "khong_ro": 0 } }, "theo_ngay": [ { "ngay": "2026-10-20", "chu_nhat": false, "shbg": 4, "kg": 2.2, "xe": 1 } ] }`

## 6. Cache (`kttApi.js`)
- **B1, B2, B3, rớt lại, B5, B6 (phần SHBG), tổng quan: dùng CHUNG một bó cho mỗi ngày** (`layNgayB`, `boNho.ngayB`), quy tắc hết hạn y hệt `/luu-thoat` (hàm `conHanNgay`, đã tách từ `layNgay`, hành vi `/luu-thoat` không đổi): ngày chưa chốt ≤ 10 phút và cùng độ mới + dấu hiệu DB; ngày chốt trong cửa sổ nạp (8 ngày) vô hiệu khi độ mới đổi; cũ hơn: ≤ 6 giờ theo chữ ký ngày.
  Khoảng ngày = cộng các bó (`congCacNgay`) nên các endpoint không thể lệch nhau (có test: sau một lần tính 3 ngày, mọi endpoint B và tổng quan không tính thêm).
- **danh-sach, hang-den (A), gio-lap-bd10 (B4)**: mục theo cả khoảng/tham số, ≤ 10 phút, cùng độ mới + dấu hiệu DB, tính ở `worker_thread` (như `tong-hop`); hai endpoint A dùng chung một lần tính.
- Đổi tham số hệ thống / lịch chuyến → xóa hết (`dongBoPhienBan`).

## 7. Lỗi tìm thấy trong code WIP (`b249faa`) và đã sửa ở KTT-12b
1. `hang-den/*`: `meta.so_ngay` luôn bằng 0 (trường thừa, không bao giờ được cập nhật; số ngày thật nằm ở `so_ngay_co_du_lieu`) → bỏ trường, có test.
2. B4 chạy đồng bộ trên luồng chính (~0,25 giây mỗi lần) và B6 tính lại B4 mỗi lần gọi → chuyển vào worker + cache (`layGioLapBd10`); B6 lần cache từ ~276 ms xuống ~24 ms, B4 lần cache ~1 ms.
Còn lại các hàm thuần không có lỗi rõ ràng; test so khớp `/luu-thoat` (tổng, từng nhóm, từng ngày, `da_chot`) xanh.

## 8. Hiệu năng — cửa sổ 30 ngày, bản sao DB, máy dev
Cách đo: `KTT_PERF=1 node scripts/ktt-do-hieu-nang-di-ngay.js <bản sao hue-dhcl.db> [30]` (chép DB sang thư mục tạm trước; script từ chối đường dẫn trong `data/`). Lần đầu = cache trống (gồm tính cả 30 ngày); lần cache = gọi lại ngay.
Bản sao là một đợt nạp đầy đủ gần 40 ngày (cỡ dữ liệu thật, không ghi số ở đây).

| Endpoint | Lần đầu (ms) | Lần cache (ms) |
|---|---|---|
| `luu-thoat` (đối chứng KTT-8) | 13.612 | 23 |
| `dicungngay/tong-hop` | 7.517 | 21 |
| `dicungngay/theo-ngay` | 7.317 | 23 |
| `dicungngay/theo-gio` | 8.065 | 28 |
| `rotlai/theo-duong-thu` | 7.764 | 17 |
| `lich-xe/gio-lap-bd10` | 281 | 1 |
| `lich-xe/theo-duong-thu` | 8.018 | 26 |
| `lich-xe/theo-bcvh` | 7.397 | 24 |
| `danh-sach` hom-sau (trang 1) | 6.568 | 0,8 |
| `danh-sach` chua-di-24h (trang 1) | 7.394 | 1 |
| `hang-den/tong-hop` | 2.593 | 3 |
| `hang-den/theo-gio` | 2.481 | 0,8 |
| `hang-den/theo-duong-thu` | 2.487 | 0,6 |
| `hang-den/xe` | 2.920 | 0,9 |
| `tong-quan` | 8.205 | 28 |

Dùng thực tế (cache trống, mở trang): `dicungngay/tong-hop` nguội ≈ 7,8 giây, rồi theo-ngay + theo-gio + rớt lại + B5 + tổng quan song song ≈ 2,6 giây (chỉ còn phần A). **B1–B6, danh-sách và tổng quan lần đầu > 5 giây** (≈ 0,25 giây/ngày × 30 ngày; `luu-thoat` còn chậm hơn: ≈ 0,45 giây/ngày). Mỗi ngày được tính xen kẽ nên máy chủ không bị đứng (mỗi khúc ≤ ~0,3 giây).
Đề xuất (KHÔNG tự thêm bảng tổng hợp), theo thứ tự nên làm:
1. **Làm nóng cache** sau mỗi lần nạp cặp mới và khi khởi động (như `PHAT_WARM` của DASH-12b-4): tính nền `ngayB` và `ngay` cho 8 ngày trong cửa sổ nạp; 22 ngày cũ còn lại đã nằm trong cache 6 giờ → người dùng mở trang gần như luôn gặp cache.
2. **Một lượt đọc cho cả hai bó**: `luu-thoat` và B cùng gọi `chayBoDem` cho từng ngày; gộp thành một lượt tạo cả hai bó, cắt khoảng một nửa tổng công việc nguội khi người dùng mở cả hai trang.
3. **Tính các ngày song song** ở 2–3 worker (hiện tính tuần tự từng ngày trên luồng chính, có nhường vòng lặp).
4. Chỉ nếu vẫn chưa đủ: bảng tổng hợp theo ngày (cần PO duyệt, không làm trong ticket này).

## 9. Ghi nhận (không sửa, để PO quyết)
**Hàng chuyển tiếp nguyên túi (`CHUYEN_TIEP_DI`) không nằm trong tập SHBG của Lưu thoát.** Lưu thoát chỉ xét SHBG có ít nhất một túi `DEN` quét trong ngày; hàng đi thẳng bằng xe Cấp 1 nguyên túi (túi không mở, không có túi `DEN`) không vào `/luu-thoat` mà vào trang A (và B4, vì B4 tính BD10 đi).
Hệ quả: `mau_so` của `/luu-thoat` chỉ là phần hàng KHAI THÁC LẠI; tỷ lệ «cùng ngày» của Lưu thoát không phải tỷ lệ của toàn bộ hàng đi qua KTT. Số liệu đo trên bản sao nằm ở báo cáo giao việc (không dán số thật vào tài liệu). Các số B1–B6 trong ticket này **cùng phạm vi với Lưu thoát** (chỉ hàng khai thác lại); B6 có ghi chú này trong `canh_bao`.
Nếu PO muốn B/Lưu thoát gồm cả hàng chuyển tiếp: cần ticket riêng (xếp chuyến theo `bd10_den_xnd`/`gio_quet_tui_den` của túi chuyển tiếp, kiểm lại định nghĩa «ngày đến»).

## 10. Điều chưa chắc
- Ngưỡng `NGUONG_CANH_BAO` của tổng quan, ngưỡng đợt xe (120 phút, 5%) là TẠM, chưa được PO chốt.
- B4: gán chuyến «gần giờ lập nhất» là quy ước; lập BD10 rất sớm/muộn so với giờ xe có thể gán sang chuyến khác của cùng BCVH.
- Ticket gốc `claude/KTT-12-api-b1-b2-a-tong-quan.md` không có trong thư mục dự án khi làm KTT-12b; phạm vi lấy từ nội dung giao việc và code WIP.

## 11. Test (`tests/ktt-di-cung-ngay.test.js`, 20 ca, dữ liệu giả `KTT-DEMO-*`)
Quyền (13 endpoint × 5 vai trò, chỉ GET); tham số sai (mọi route × 9 kiểu sai + các URL sai tham số riêng: top, min_bd10, loai, page, page_size, huong, hang_hoan, ma_bcvh, duong_thu, noi_gui); chưa có dữ liệu; B1 (tổng năm nhóm = mẫu số = tổng bưu gửi; hàng hoàn tách; nội tỉnh đi liên tỉnh); **khớp `/luu-thoat`** (tổng, từng nhóm, từng ngày, `da_chot`); B2 (Chủ nhật, mẫu số 0 → null, tổng ngày = tổng khoảng);
B3 (tổng 24 giờ = tổng B1); rớt lại; B5; B4 + `chuyenGanNhat` (hòa lấy chuyến sau); B6; danh-sách (tổng = ô B1, phân trang không trùng, lọc khớp bảng rớt lại); A (tổng ngày = giờ = đường thư = xe, hướng hàng, túi chuyển tiếp, xe nội tỉnh không tính); `gomDot`/`dichCua`; tổng quan (= hàm con) và cảnh báo; cache dùng chung; chỉ đọc.
Đã thêm vào script `test` của `package.json`.
