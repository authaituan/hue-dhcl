# 43 · KTT-12 — API «đi cùng ngày» (B1–B3), hàng rớt lại, lịch xe (B4–B6), danh sách bấm ô, hàng đến từ xe Cấp 1 (A), tổng quan

Đưa các số của canvas «Hàng tại KTT» ra API **chỉ đọc**, cho **ADMIN và TTVH** (GDVH, TIVI 403; không token 401), cùng router và cùng middleware với `/api/ktt/luu-thoat` (xem `42_KTT_API.md` mục 1).
**KTT-14 (28/10/2026): tập SHBG của mọi bảng dưới đây nay gồm cả hàng chuyển tiếp — mục 9 cũ đã được giải quyết, xem mục 12.** Chưa có giao diện. Chưa làm: đối chiếu BCVH, tồn tại và gợi ý, xlsx 9 sheet. Mọi JSON trong tài liệu này là **dữ liệu giả**.

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
| `noi_tinh_hang_hoan` | **hàng hoàn** (KTT-17-2: SHBG trong `ktt_hang_hoan` và đích 6 BCVH, MỌI nơi gửi): MỘT khối chung, tách riêng, **không cộng vào tổng và tỷ lệ** (như `/luu-thoat`). Tên khóa giữ nguyên, KHÔNG còn nghĩa «nội tỉnh». Ở B5 / bảng rớt lại / danh sách, dòng hoàn nằm trong hướng của nơi gửi (`53…` → `noi_tinh_den_bcvh`, khác → `lien_tinh_den_bcvh`) với `hang_hoan: true`, không cộng vào `cong` |
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
Đề xuất (KHÔNG tự thêm bảng tổng hợp), theo thứ tự nên làm — **đề xuất 1 đã làm ở KTT-15 (mục 13)**:
1. **Làm nóng cache** sau mỗi lần nạp cặp mới và khi khởi động (như `PHAT_WARM` của DASH-12b-4): tính nền `ngayB` và `ngay` cho 8 ngày trong cửa sổ nạp; 22 ngày cũ còn lại đã nằm trong cache 6 giờ → người dùng mở trang gần như luôn gặp cache.
2. **Một lượt đọc cho cả hai bó**: `luu-thoat` và B cùng gọi `chayBoDem` cho từng ngày; gộp thành một lượt tạo cả hai bó, cắt khoảng một nửa tổng công việc nguội khi người dùng mở cả hai trang.
3. **Tính các ngày song song** ở 2–3 worker (hiện tính tuần tự từng ngày trên luồng chính, có nhường vòng lặp).
4. Chỉ nếu vẫn chưa đủ: bảng tổng hợp theo ngày (cần PO duyệt, không làm trong ticket này).

## 9. Ghi nhận ban đầu của KTT-12b — ĐÃ GIẢI QUYẾT ở KTT-14 (mục 12; nội dung dưới đây là lịch sử)
**Hàng chuyển tiếp nguyên túi (`CHUYEN_TIEP_DI`) không nằm trong tập SHBG của Lưu thoát.** Lưu thoát chỉ xét SHBG có ít nhất một túi `DEN` quét trong ngày; hàng đi thẳng bằng xe Cấp 1 nguyên túi (túi không mở, không có túi `DEN`) không vào `/luu-thoat` mà vào trang A (và B4, vì B4 tính BD10 đi).
Hệ quả: `mau_so` của `/luu-thoat` chỉ là phần hàng KHAI THÁC LẠI; tỷ lệ «cùng ngày» của Lưu thoát không phải tỷ lệ của toàn bộ hàng đi qua KTT. Số liệu đo trên bản sao nằm ở báo cáo giao việc (không dán số thật vào tài liệu). Các số B1–B6 của KTT-12b **cùng phạm vi với Lưu thoát** (chỉ hàng khai thác lại) — KTT-14 đã mở rộng cả hai.
Nếu PO muốn B/Lưu thoát gồm cả hàng chuyển tiếp: cần ticket riêng — chính là KTT-14.

## 10. Điều chưa chắc
- Ngưỡng `NGUONG_CANH_BAO` của tổng quan, ngưỡng đợt xe (120 phút, 5%) là TẠM, chưa được PO chốt.
- B4: gán chuyến «gần giờ lập nhất» là quy ước; lập BD10 rất sớm/muộn so với giờ xe có thể gán sang chuyến khác của cùng BCVH.
- Ticket gốc `claude/KTT-12-api-b1-b2-a-tong-quan.md` không có trong thư mục dự án khi làm KTT-12b; phạm vi lấy từ nội dung giao việc và code WIP.

## 11. Test (`tests/ktt-di-cung-ngay.test.js`, 20 ca, dữ liệu giả `KTT-DEMO-*`)
Quyền (13 endpoint × 5 vai trò, chỉ GET); tham số sai (mọi route × 9 kiểu sai + các URL sai tham số riêng: top, min_bd10, loai, page, page_size, huong, hang_hoan, ma_bcvh, duong_thu, noi_gui); chưa có dữ liệu; B1 (tổng năm nhóm = mẫu số = tổng bưu gửi; hàng hoàn tách; nội tỉnh đi liên tỉnh); **khớp `/luu-thoat`** (tổng, từng nhóm, từng ngày, `da_chot`); B2 (Chủ nhật, mẫu số 0 → null, tổng ngày = tổng khoảng);
B3 (tổng 24 giờ = tổng B1); rớt lại; B5; B4 + `chuyenGanNhat` (hòa lấy chuyến sau); B6; danh-sách (tổng = ô B1, phân trang không trùng, lọc khớp bảng rớt lại); A (tổng ngày = giờ = đường thư = xe, hướng hàng, túi chuyển tiếp, xe nội tỉnh không tính); `gomDot`/`dichCua`; tổng quan (= hàm con) và cảnh báo; cache dùng chung; chỉ đọc.
Đã thêm vào script `test` của `package.json`.

## 12. KTT-14 — hàng chuyển tiếp vào tập B1–B6, rớt lại, danh sách, tổng quan
- **Quyết định PO** (`04_DECISIONS.md` #119): hàng «chuyển tiếp đi» thuộc chỉ tiêu F1.3 (đích 6 BCVH Huế) nên nằm trong mẫu số «đi trong ngày / rớt lại / 14 giờ». Lưu thoát và mọi bảng ở file này cùng dùng `kttQuery.chayTapLuuThoat` (một nơi duy nhất chọn tập); không còn tập riêng. Chi tiết quy tắc: `41` mục 13.
- **Đổi số so với bản trước:** tổng bưu gửi, mẫu số năm trạng thái, mẫu số 14 giờ và số «rớt lại» tăng (thêm hàng chuyển tiếp); tỷ lệ «cùng ngày» đổi theo; số của hàng khai thác không đổi (khối `theo_nguon_hang.khai_thac` bằng đúng số cũ). `canh_bao` của B6 đã đổi lời. Bảng B5 («nơi gửi, đường thư đến») nay gồm cả đường thư của túi chuyển tiếp.
- **Đơn vị đếm:** một SHBG tính MỘT lần (ngày đến D của túi đến ghép / dòng chuyển tiếp chọn được). Số «SHBG × ngày đến» (một SHBG đến nhiều ngày trong khoảng được đếm ở mỗi ngày — cách của canvas / PO) lớn hơn số này; hai số KHÔNG cùng đơn vị. Lưu thoát chưa đếm «đến lại» ở từng ngày (hành vi từ KTT-5, không đổi).
- **Không đổi:** trang A (`hang-den/*`) vốn đã gồm cả túi chuyển tiếp ở mức cặp (xe, bưu gửi); B4 (`gio-lap-bd10`) tính theo BD10 đi (gồm `CHUYEN_TIEP_DI`).
- **Hiệu năng:** tập SHBG gấp hơn hai lần nên lần nguội 30 ngày của B1–B6, danh-sách, tổng quan tăng gần gấp đôi, `luu-thoat` tăng ≈ 1,5 lần (số đo ở báo cáo giao việc, không ghi số thật ở đây); lần cache không đổi đáng kể. Đề xuất làm nóng cache (mục 8) đã làm ở KTT-15 (mục 13); gộp lượt đọc chưa làm.
- **Điều chưa chắc:** (1) chọn dòng khi SHBG nằm trong nhiều túi chuyển tiếp; (2) bỏ qua túi `DI` tái đóng của hàng chuyển tiếp; (3) mốc dự phòng cho chỉ tiêu 14 giờ của hàng chuyển tiếp (xác nhận BD10 đến thường sau giờ lập BD10 đi). Cả ba chờ PO (`04_DECISIONS.md` #119 mục 5).
- Test: `tests/ktt-chuyen-tiep.test.js` (11 ca): chỉ-chuyển-tiếp đi cùng ngày / hôm sau / chưa đi, cả hai loại túi không đếm đôi, nhiều túi chuyển tiếp, hàng hoàn không vào 14 giờ, hai mốc 14 giờ, chi-tiet / xlsx / B1 / danh-sach / tổng quan cùng tập, ghép từng ngày = cả khoảng, GDVH 403.

## 13. KTT-15 — làm nóng cache nền sau mỗi lần nạp và khi khởi động (đóng `05_BACKLOG.md` mục 21)
Mục tiêu: người mở trang KTT không còn chờ lần nguội 16–21 giây (cửa sổ 30 ngày). Mọi số đo dưới đây là **máy dev, dữ liệu GIẢ cỡ gần dữ liệu thật** (30 ngày ≈ 424.500 SHBG, 14.150/ngày; lần nguội mỗi endpoint ≈ 18 giây, đúng cỡ số thật 16–21 giây của KTT-12b/14). **Chưa thử trên NAS DS920+** (chậm hơn máy dev, chưa biết bao nhiêu).

### 13.1 Mới
| File | Vai trò |
|---|---|
| `server/lib/kttNong.js` | `batDauNong(db, { lyDo, env, dung, log, nghiCuaSoMs, nghiThuaMs })`: lượt làm nóng nền, không bao giờ ném lỗi. |
| `server/lib/kttApi.js` | Chỉ THÊM xuất `noiBoNong` (`layNgay`, `layNgayB`, `layHangDen`, `layGioLapBd10`, `dongBoPhienBan`, `ngayLui`, `CUA_SO_NAP_NGAY`) — không đổi hành vi. |
| `server/lib/kttSftp.js` | Tùy chọn `sauNap` của `taoBoHenGioKtt`: gọi (không chờ, lỗi nuốt) sau lượt quét có ≥ 1 cặp nạp OK. Mặc định không có (test không bị ảnh hưởng). |
| `server/index.js` | Truyền `sauNap` → `batDauNong('SAU_NAP')`; một lần `batDauNong('KHOI_DONG')` sau khi nghe 8 giây (timer `unref`, không chặn khởi động; không chạy khi `NODE_TEST_CONTEXT`). |
| `docker-compose.yml`, `.env.nas.example`, `20_NAS_HUONG_DAN_CHAY.md` | Truyền / mô tả hai biến môi trường. |
| `tests/ktt-nong.test.js` | 10 ca (+ 1 ca `sauNap` ở `tests/ktt-sftp.test.js`). |

### 13.2 Cách chạy
- **Không có đường tính riêng**: gọi đúng `layNgay` (hai mốc `xnd` và `quet_tui_den`), `layNgayB`, `layHangDen`, `layGioLapBd10` mà request dùng → kết quả nóng = kết quả nguội (test `deepEqual` 14 endpoint của trang), và request thật đến giữa chừng dùng chung lần tính đang chạy qua `chiaSe` (test: mỗi ngày × mốc tính đúng một lần).
- **Thứ tự, tuần tự từng ngày, mới nhất trước**: (1) các ngày trong cửa sổ nạp (ngày của độ mới lùi 8 ngày = 9 ngày): bó B + `/luu-thoat` hai mốc; (2) mục theo khoảng cho hai cửa sổ chuẩn 7 và 30 ngày kết thúc ở ngày của độ mới: `hang-den` (A), `gio-lap-bd10` với `min_bd10` = 5 (B4) và 1 (B6); (3) lượt THƯA: các ngày cũ đến đủ `KTT_WARM_NGAY` (31), nghỉ 150 ms giữa các ngày (cửa sổ nạp: 25 ms). Ngày còn trong cache (6 giờ) thì không tính lại.
- Giữa hai mục luôn `await` (`setImmediate` trong `layNgay`/`layNgayB` + nghỉ). Một lượt tại một thời điểm; lượt mới (nạp tiếp) hủy lượt đang chạy ở ranh giới ngày rồi chạy lại với độ mới mới (lượt đã xếp hàng mà bị lượt mới vượt mặt trả `DA_CO_LUOT_MOI`). `dung()` (máy chủ đóng) cũng hủy ở ranh giới ngày.
- **Vô hiệu khi nạp mới**: không xóa chủ động — mục của ngày trong cửa sổ nạp tự vô hiệu khi độ mới đổi (quy tắc `conHanNgay` có sẵn); lượt làm nóng sau nạp tính lại đúng các mục đó (test). Nạp bằng `scripts/ktt-import.js` (tiến trình riêng) vẫn vô hiệu cache đúng nhưng KHÔNG kích hoạt làm nóng.
- **Biến môi trường**: `KTT_WARM=0` tắt hẳn (mặc định BẬT; giá trị khác `0` hoặc trống = bật); `KTT_WARM_NGAY` 1..31 (mặc định 31; 9 = chỉ cửa sổ nạp; hai cửa sổ 7/30 ngày chỉ làm khi ≤ giá trị này). Tắt thì không tính ngày nào, không dùng worker (test).
- **Log**: một dòng mỗi lượt, `[ktt-nong] <SAU_NAP|KHOI_DONG>: <ngày cửa sổ>+<ngày thưa> ngày, <n> mục khoảng trong <ms> ms` (+ `(bị hủy)` / `(lỗi: <mã>)`). Không có số liệu nghiệp vụ, mã bưu gửi, nội dung lỗi (test). Lỗi trong lúc làm nóng: Promise vẫn xong, máy chủ không sập, lượt sau chạy bình thường (test, DB giả lỗi).
- **Chỉ đọc DB** (test: số dòng, tổng id, `total_changes()` không đổi).

### 13.3 Đo (1) — lần nguội 30 ngày chia hai pha (máy dev, dữ liệu giả, giây)
(a) = đọc DB + chọn tập SHBG (`chayTapLuuThoat` với bộ đếm rỗng); (b) = phân loại / tổng hợp (= tổng − (a)).
| Endpoint | Tổng | (a) đọc + chọn tập | (b) phân loại / tổng hợp |
|---|---|---|---|
| `/luu-thoat` mốc `xnd` | 18,4 | 5,4 (29%) | 13,0 |
| `/luu-thoat` mốc `quet_tui_den` | 17,6 | 5,4 | 12,2 |
| B1–B6, danh-sách, tổng quan (bó ngày B) | 18,3 | 5,4 | 12,9 |

**Có đọc trùng**: `/luu-thoat` (mỗi mốc một lần) và bó B đều gọi `chayTapLuuThoat` cho CÙNG ngày → tập SHBG đọc 3 lần (tổng 54,3 s, riêng (a) lặp 3 lần = 16,1 s ≈ 30%). Phần (b) cũng lặp 3 lần vì `phanLoaiShbg` chạy ở cả ba nơi.

### 13.4 Quyết định (2) — KHÔNG giữ tập SHBG theo ngày để dùng chung
Giữ các đơn vị SHBG của một ngày trong bộ nhớ: **+15,8 MB / ngày (14.150 đơn vị, ≈ 1,1 KB mỗi SHBG) → ≈ 490 MB cho 31 ngày** — quá lớn cho NAS RAM hạn chế, lại phải vô hiệu theo độ mới và dấu hiệu DB. Từ chối.
Phương án thay (đọc một lượt cho cả ba bên, không giữ gì) chỉ bớt phần (a) lặp 2 lần (≈ 10,8 / 54,3 s ≈ 20%) và buộc tách `luuThoatTheoNgay` (≈ 90 dòng) thành bộ đếm dùng chung → rủi ro đổi kết quả cao hơn lợi ích khi đã có làm nóng nền; **để ticket khác**, cùng việc giảm chi phí `phanLoaiShbg` (≈ 70% lần nguội). `04_DECISIONS.md` không đổi (cách dùng chung cache không đổi).
Bộ nhớ của chính cache nóng: heap 13 → 30 MB (31 ngày × 2 mốc + 31 bó B + 6 mục khoảng ≈ +17 MB).

### 13.5 Đo sau — lần mở trang đầu (máy dev, giây)
«Mở trang» = `luu-thoat` → `dicungngay/tong-hop` → song song (`theo-ngay`, `theo-gio`, `rotlai`, `lich-xe/theo-duong-thu`, `lich-xe/theo-bcvh`, `lich-xe/gio-lap-bd10`, `hang-den/tong-hop`, `tong-quan`), từ cache trống. «Vừa nạp xong» = cache đã nóng đủ 31 ngày rồi một cặp mới về (độ mới đổi); «vừa khởi động» = tiến trình mới, cache trống.
| Tình huống | Cửa sổ | Không làm nóng | Sau khi làm nóng xong |
|---|---|---|---|
| Vừa khởi động lại | 7 ngày | 11,1 | 0,03 |
| Vừa khởi động lại | 30 ngày | 44,9 | 0,10 |
| Vừa nạp xong | 7 ngày | 8,9 | 0,03 |
| Vừa nạp xong | 30 ngày | 15,2 | 0,09 |

Thời gian hoàn tất lượt làm nóng: **sau khởi động 65–66 s** (31 ngày × 3 mục + 6 mục khoảng); **sau nạp 24,5–26 s** (9 ngày cửa sổ nạp + mục khoảng; ngày cũ đã nằm trong cache 6 giờ). Mở trang trong lúc đang làm nóng dùng chung lần tính đang chạy (không tính trùng); sau khi xong < 0,2 s. Lượt thưa (22 ngày cũ) chiếm phần lớn lượt khởi động (≈ 40 s).
CPU luồng chính trong lúc làm nóng ≈ thời gian làm nóng (65 s / 22–23 s): ngày được tính TRÊN LUỒNG CHÍNH như request thường (chỉ `hang-den` / `gio-lap-bd10` chạy ở worker). Độ trễ vòng lặp lớn nhất 0,6–0,8 s (≈ một ngày tính; cũng thấy khi mở trang nguội không làm nóng: 0,6–1,4 s). RSS đỉnh 415–496 MB (mở trang nguội 30 ngày không làm nóng: 478 MB) — không tăng đáng kể.

### 13.6 Điều chưa chắc / còn nợ
1. **Chưa thử trên NAS DS920+.** Nếu NAS chậm gấp 2–4 lần máy dev: lượt khởi động 2–4,5 phút, lượt sau nạp 1–2 phút; mỗi ngày tính chặn luồng chính 1,5–3 giây (API khác chờ tối đa chừng đó). Giảm: `KTT_WARM_NGAY=9`, hoặc ticket chuyển tính ngày sang worker.
2. **Ngày cũ hết hạn sau 6 giờ** (`TUOI_DA_CHOT_MS`) và chưa có làm nóng lại định kỳ: không có cặp mới / khởi động lại trong > 6 giờ thì 22 ngày cũ lại nguội ở lần mở kế tiếp. Làm nóng lại định kỳ hoặc tăng TTL đổi hành vi cache → ngoài phạm vi, chờ PO.
3. Mục theo khoảng (`hang-den`, `gio-lap-bd10`) có TTL 10 phút: làm nóng chỉ có tác dụng 10 phút đầu và chỉ cho hai cửa sổ 7/30 ngày kết thúc ở ngày của độ mới; khoảng khác, `tong-hop`, `chi-tiet`, `danh-sach` (phụ thuộc tham số) không được làm nóng.
4. Nạp bằng `scripts/ktt-import.js` (tiến trình khác) không kích hoạt làm nóng.
5. Số đo là dữ liệu giả; chưa đo nhiều request đồng thời trong lúc làm nóng.

- **KTT-17-2:** mọi phản hồi dạng B (`dauPhanHoi`) và `tong-hop` / `chi-tiet` / `danh-sach` có thêm `hang_hoan_chua_nap` (danh sách ItemReturn rỗng: hoàn = 0 chưa có nghĩa là «không có hàng hoàn») và `hang_hoan_nguon_xuat_luc`.
