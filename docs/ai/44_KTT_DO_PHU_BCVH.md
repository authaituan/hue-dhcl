# 44 — KTT-16-1: độ phủ dữ liệu «Hàng đến BCVH» cho đối chiếu

> Ticket KTT-16-1 (29/10/2026). Backend, CHỈ ĐỌC. Chưa làm phép ghép KTT↔BCVH (KTT-16-2…4); chỉ trả lời «với mỗi BCVH và mỗi ngày, dữ liệu `arrival_import_files` / `arrival_items` có hay không», để ticket sau không coi «BCVH chưa có file» là «chưa thấy hàng».
> Code: `server/lib/kttDoPhuBcvh.js` (hàm thuần `tinhDoPhu` + `docDoPhu` đọc DB), `server/lib/kttApi.js` (`doPhuBcvh`, cache), `server/routes/ktt.js`. Test: `tests/ktt-do-phu-bcvh.test.js` (14 ca, dữ liệu giả).

## 1. Route
`GET /api/ktt/doi-chieu/do-phu?tu=YYYY-MM-DD&den=YYYY-MM-DD`
- Quyền như mọi route KTT: ADMIN + TTVH (cùng số liệu); GDVH, TIVI → 403; không token → 401; chỉ GET.
- `tu`, `den` bắt buộc, ≤ 31 ngày, `tu ≤ den`; khóa lạ / lặp tham số / ngày sai → 400 `{ error (tiếng Việt), ma }` (`KTT_THIEU_THAM_SO`, `KTT_NGAY_SAI`, `KTT_KHOANG_NGAY_SAI`, `KTT_KHOANG_QUA_DAI`, `KTT_THAM_SO_LA`, `KTT_THAM_SO_SAI`).
- Chỉ đọc `arrival_import_files`, `arrival_items`, `post_offices` (tên BCVH). **Không đọc bảng `ktt_*`**, không ghi gì, không phụ thuộc lịch chuyến / tham số KTT / độ mới KTT (có test chặn câu SQL nhắc `ktt_`).
- Cache trong bộ nhớ theo `(tu, den)`: ≤ 10 phút VÀ cùng dấu hiệu DB (`phatDashboard.dauHieuDb` = `data_version` + `total_changes`); nạp file mới ở tiến trình này hoặc tiến trình khác làm mất hiệu lực. `Api.xoaCache()` xóa; `Api.thongKe().doPhuTinh` đếm số lần tính.
- Hiệu năng (bản sao DB local ~190.000 dòng, 31 ngày): lần đầu ≈ 0,14 giây, lần cache ≈ 0,5 ms (đo hàm `doPhuBcvh`, chưa gồm HTTP).

## 2. Kết quả trả về
Mọi khóa snake_case tiếng Việt như các route KTT khác. Ví dụ (GIẢ, rút gọn):
```json
{
  "tu": "2026-10-22", "den": "2026-10-24", "so_ngay": 3,
  "bcvh": [
    {
      "ma": "535790", "ten": "BCVH A Lưới",
      "ngay_dau": "2026-10-01", "ngay_cuoi": "2026-10-28", "do_moi": "2026-10-28 15:05:05",
      "cua_so": { "tu": "2026-10-01", "den": "2026-10-26" },
      "ly_do_khong_co_cua_so": null,
      "ngay_khong_co_file": ["2026-10-24"],
      "ngay_chi_file_rong": [],
      "theo_ngay": [
        { "ngay": "2026-10-22", "trang_thai": "CO_DU_LIEU", "so_file_ok": 2, "so_file_empty": 0, "so_dong": 120,
          "so_dot": 2, "gio_file_moi_nhat": "15:00:03", "ty_le_thieu_gio_nhan": 0.0833,
          "co_the_duong_tinh_gia": true, "ngay_thieu_trong_d_d2": ["2026-10-24"], "trong_cua_so": true },
        { "ngay": "2026-10-24", "trang_thai": "KHONG_CO_FILE", "so_file_ok": 0, "so_file_empty": 0, "so_dong": 0,
          "so_dot": 0, "gio_file_moi_nhat": null, "ty_le_thieu_gio_nhan": null,
          "co_the_duong_tinh_gia": true, "ngay_thieu_trong_d_d2": ["2026-10-24"], "trong_cua_so": true }
      ]
    }
  ],
  "cua_so_chung": { "tu": "2026-10-01", "den": "2026-10-26" },
  "bcvh_chan_cua_so_chung": [],
  "cua_so_thuc_te": { "tu": "2026-10-22", "den": "2026-10-24" },
  "meta": { "ngay_theo": "file_date", "gio_sau_ngay_d": 48, "ngay_sau_d_xet_co": 2, "trang_thai": ["CO_DU_LIEU", "CHI_FILE_RONG", "KHONG_CO_FILE"] }
}
```
- `bcvh`: đúng sáu BCVH Huế, theo thứ tự `kttTinh.MA_BCVH_HUE` (hằng có sẵn, không gõ thêm). `ten` từ `dashboardQuery.bcvhNames`.
- Theo BCVH (toàn cục, KHÔNG phụ thuộc khoảng yêu cầu): `ngay_dau` (ngày nhỏ nhất có file OK), `ngay_cuoi` + `do_moi` (file OK mới nhất, `file_date` + `file_time`), `cua_so`, `ly_do_khong_co_cua_so` (`CHUA_CO_DU_LIEU` | `DO_MOI_CHUA_DU_48_GIO` | null). Theo khoảng yêu cầu: `ngay_khong_co_file`, `ngay_chi_file_rong` (kể cả ngày trước `ngay_dau`; lọc theo `trong_cua_so` nếu chỉ cần ngày trong cửa sổ).
- Mỗi `(BCVH, ngày)` trong `theo_ngay`:

| Trường | Nghĩa |
|---|---|
| `trang_thai` | `CO_DU_LIEU` nếu có ít nhất một file **OK**; `CHI_FILE_RONG` nếu không có OK nhưng có file **EMPTY**; `KHONG_CO_FILE` nếu không có file nào được chấp nhận |
| `so_file_ok`, `so_file_empty` | số file `OK` / `EMPTY` của ngày (`REJECTED`, `CONFLICT` không tính) |
| `so_dong` | số dòng `arrival_items` thuộc các file OK của ngày (theo `import_file_id`) |
| `so_dot` | số đợt khác nhau có file (S sáng / C chiều, theo `napNguonDoc.dotCua`, ranh giới `RANH_GIOI_DOT`), tính cả file EMPTY |
| `gio_file_moi_nhat` | `file_time` lớn nhất trong các file được chấp nhận của ngày, hoặc null |
| `ty_le_thieu_gio_nhan` | (số dòng `arrival_at` NULL/rỗng) / `so_dong`, 4 chữ số thập phân; null khi `so_dong = 0` |
| `co_the_duong_tinh_gia` | mục 4 |
| `ngay_thieu_trong_d_d2` | những ngày trong D, D+1, D+2 KHÔNG ở `CO_DU_LIEU` (lý do của cờ) |
| `trong_cua_so` | D nằm trong `cua_so` của chính BCVH này |

- `cua_so_chung` = giao sáu `cua_so` (null nếu có BCVH không có cửa sổ — khi đó `bcvh_chan_cua_so_chung` liệt kê mã — hoặc giao rỗng). `cua_so_thuc_te` = `cua_so_chung` ∩ `[tu, den]` (null nếu rỗng): khoảng ngày mà ticket đối chiếu sau được phép kết luận.

## 3. Quy tắc cửa sổ đối chiếu được (cách chọn và lý do)
Một ngày D (ngày KTT lập BD10 đi) kiểm tra được cho BCVH đích X khi
`D ≥ ngày đầu của X` **và** `D + 48 giờ ≤ độ mới của X`, với D tính từ `00:00:00` của ngày D.
- **Ngày đầu của X** = `MIN(file_date)` của file `OK`. **Độ mới của X** = `MAX(file_date || ' ' || file_time)` của file `OK`. Hai mốc đều bỏ file `EMPTY`: file rỗng không chứng minh BCVH đã có hàng; chọn như vậy chỉ làm cửa sổ HẸP hơn (an toàn: thà bỏ ngày còn hơn kết luận «chưa thấy» khi chưa có dữ liệu).
- **Vì sao 48 giờ:** hàng KTT lập BD10 đi ngày D có thể đến BCVH muộn tới 48 giờ sau; nếu dữ liệu BCVH mới tới trước mốc đó thì «chưa thấy» chỉ là «chưa kịp đến / chưa kịp nạp». Biểu thức theo `D 00:00 + 48 giờ`, tức ngày cuối của cửa sổ là phần ngày của `độ mới − 48 giờ` (ví dụ độ mới 28/10 09:30 → ngày cuối 26/10; độ mới 27/10 23:59:59 → 25/10).
- **Ngày đầu** chặn phía trước vì trước ngày đầu BCVH chưa nạp (hoặc chưa bật nguồn): không có file không có nghĩa «không có hàng».
- **Cửa sổ chung** = giao sáu cửa sổ riêng: `tu` = ngày đầu muộn nhất, `den` = ngày cuối sớm nhất (BCVH chậm kéo cả cửa sổ lùi). Ticket đối chiếu theo từng BCVH đích nên dùng `cua_so` riêng; `cua_so_chung` cho số liệu tổng.
- Cửa sổ là một khoảng liền. **Lỗ hổng bên trong cửa sổ** (ngày KHONG_CO_FILE / CHI_FILE_RONG) KHÔNG làm đứt cửa sổ mà do cờ ở mục 4 xử lý.
- Giới hạn đã biết: D tính từ 00:00 nên BD10 lập muộn trong ngày D chưa chắc đủ 48 giờ trọn vẹn tại ngày cuối cửa sổ. Ticket sau có giờ lập BD10 từng dòng nên tự kiểm lại theo giờ (hoặc bỏ thêm một ngày ở cuối).

## 4. Cờ «có thể dương tính giả»
`co_the_duong_tinh_gia = true` cho `(X, D)` khi **bất kỳ** ngày nào trong `D, D+1, D+2` của X có `trang_thai` khác `CO_DU_LIEU` (tức `KHONG_CO_FILE` hoặc `CHI_FILE_RONG`); `ngay_thieu_trong_d_d2` nêu các ngày đó. Ticket sau KHÔNG được cảnh báo «chưa thấy hàng» cho các `(X, D)` có cờ (có thể là thiếu file chứ không phải hàng chưa đến), hoặc phải gắn nhãn riêng.
- Ngày D+1, D+2 vượt `den` của yêu cầu vẫn được xét (đọc thêm tới `den + 2`), nên cờ ở các ngày cuối khoảng không bị bỏ sót. Ngày chưa tới (sau độ mới) vắng file nên coi như thiếu → có cờ (và dù sao đã nằm ngoài cửa sổ).
- Ngày có cả file OK lẫn file EMPTY (một đợt rỗng) vẫn `CO_DU_LIEU`, không cờ; thông tin có trong `so_file_empty`. PO đã chốt giữ quy tắc này (29/10/2026).

## 5. Quy ước kỹ thuật
- «Ngày» là `file_date` (ngày trong TÊN file), cùng quy ước màn «Nạp dữ liệu nguồn», không phải `arrival_date` của từng dòng. `so_dong` là số dòng **đã được chèn** từ các file OK của ngày; dòng trùng khóa bị bỏ khi nạp (`ux_arrival_items_key`) nên một file OK đến sau có thể có `so_dong` nhỏ (kể cả 0) vì dòng đã nằm ở file trước.
- Không dùng đồng hồ máy hay múi giờ máy: mọi ngày là chuỗi `YYYY-MM-DD`, tính ngày bằng `Date.UTC` (như các hàm KTT khác). Test chạy giống nhau ở `TZ=UTC`, `Asia/Ho_Chi_Minh`, `America/Los_Angeles`. `file_time` là giờ trong tên file, coi là giờ Việt Nam như màn «Nạp dữ liệu nguồn».
- Không đổi importer (`arrivalsImport.js`): `EMPTY` vẫn là «đã nhận»; truy vấn sản lượng vẫn bỏ qua.

## 6. Việc chờ PO / điều chưa chắc
1. **PO đã chốt (29/10/2026): giữ quy tắc ngày hiện tại** — ngày có file OK vẫn là `CO_DU_LIEU`, file EMPTY cùng ngày chỉ hiện ở `so_file_empty`, không kéo cờ. Trên bản sao DB local mọi file EMPTY đều cùng ngày với một file OK nên không ngày nào `CHI_FILE_RONG`; đó là kết quả đúng của quy tắc, không phải lỗi.
2. `ngay_dau` / `do_moi` bỏ file EMPTY (mục 3) — đổi sang «mọi file được chấp nhận» cũng được nếu PO coi file rỗng là bằng chứng nguồn còn chạy.
3. Mốc D 00:00 + 48 giờ (mục 3, giới hạn đã biết).

## 8. KTT-16-2: ghép KTT ↔ «Hàng đến BCVH» và tổng hợp đối chiếu
> Ticket KTT-16-2 (29/10/2026, sửa 31/10/2026). Backend, CHỈ ĐỌC. Chưa làm thời gian BCVH nhận, chuyến mất dấu, nguồn chưa thấy, «Đánh giá» (KTT-16-3, 16-4). Code: `server/lib/kttDoiChieu.js` (ghép + hàm thuần), `kttApi.js` (`doiChieuTongHop`, `layNgayDC`), `kttNong.js`. Test: `tests/ktt-doi-chieu-tong-hop.test.js` (18 ca, gồm hook `sauNap`, lỗi trong `layNgayDC`, hàng đợi hai loại lượt).

### 8.1 Route
`GET /api/ktt/doi-chieu/tong-hop?tu=&den=[&ma_bcvh=]` — quyền như mọi route KTT (ADMIN + TTVH; GDVH, TIVI 403). `tu`, `den` ≤ 31 ngày; `ma_bcvh` lọc theo BCVH ĐÍCH (mặc định cả 6; mã lạ -> 400 `KTT_BCVH_SAI`). Khóa lạ -> 400.

### 8.2 Định nghĩa
- **Tập chính (thanh 1)** = SHBG nhóm `chua_di_tren_24h` của KTT-14 (gồm hàng chuyển tiếp), theo ngày D của «lưu thoát», đích = `maBcvh`; KHÔNG gồm hàng hoàn (KTT-17-2: SHBG có trong `ktt_hang_hoan`, đích 6 BCVH). Hàng hoàn không ghép, không phân loại: chỉ trả `hang_hoan_loai_khoi` (tổng hoàn trong ngày / khoảng) để thấy phần bị loại.
- **Đã ghi đi (thanh 2)** = SHBG đích 6 BCVH Huế, không hoàn, có giờ lập BD10 đi, mọi nhóm (cùng ngày, hôm sau, từ 2 ngày, và cả `khong_phan_loai`: có giờ đi nhưng thiếu giờ quét túi đến nên không xếp được chuyến). `da_ghi_di.tong` GỒM nhóm `khong_phan_loai`; `tong_da_phan_loai` = không gồm. Đẳng thức: `da_ghi_di.tong − khong_phan_loai_da_ghi_di.tong` = cùng ngày + hôm sau + từ 2 ngày của `/dicungngay` (không hoàn).
- **Cửa sổ kiểm tra được** theo mục 3 (KTT-16-1), từng BCVH đích: SHBG đích X được phân loại nếu ngày D của nó nằm trong `cua_so` của X; ngược lại chỉ đếm vào `ngoai_cua_so` («chưa kiểm tra được»), không phân loại.
- **«Có mặt ở BCVH»** (PO chốt 01/11/2026): có dòng `arrival_items` thuộc file OK của BCVH đó VÀ dòng có **mốc đến hợp lệ** (`arrival_at` khác NULL / rỗng — mốc R2: XN túi → XN bưu gửi → XNĐ BD10). Dòng «chưa xác định ngày đến» KHÔNG phải đã đến (bản đầu của 16-2 đã tính nhầm; KTT-16-1 chỉ xét FILE, không xét dòng nên không bị ảnh hưởng — `ty_le_thieu_gio_nhan` vẫn đo tỷ lệ dòng không mốc). Đã có mặt ở một BCVH thì xếp vào BCVH đó, KHÔNG xét trạng thái túi KTT; chỉ SHBG không thấy ở BCVH nào mới là «chưa thấy».
- **Phân loại** (khóa `tracking_no` ↔ SHBG, khớp chuỗi trực tiếp, chỉ file OK của 6 BCVH, chỉ dòng có mốc): `tai_dich` = có ở BCVH đích; `bcvh_khac` = không ở đích nhưng có ở BCVH khác trong 6; `chua_thay` = không ở đâu. Có ở cả đích và BCVH khác -> `tai_dich` (đích KTT biết và có mặt: giữ). **Nơi đến thực tế** = BCVH có mốc đến hợp lệ muộn nhất (hòa: mã nhỏ hơn); `bcvh_khac_theo_noi_den` đếm `bcvh_khac` theo nơi đến thực tế.
- **`khong_phan_loai_da_ghi_di`** (trong `da_ghi_di`): SHBG có giờ lập BD10 đi nhưng thiếu giờ quét túi đến. Không loại khỏi thanh 2, không dùng đích KTT để phân loại: có mặt ở BCVH Y -> `theo_bcvh_noi_den[Y]`, bất kể cửa sổ (đã thấy là bằng chứng dương); không thấy ở đâu -> `chua_thay` nếu ngày D nằm trong cửa sổ của **cả sáu** BCVH, ngược lại `ngoai_cua_so`. Lý do: SHBG có thể ở bất kỳ BCVH nào nên «không thấy» chỉ kết luận được khi cả sáu đã phủ D + 48 giờ (dùng cửa sổ của một BCVH sẽ báo «chưa thấy» sai khi hàng nằm ở BCVH khác chưa phủ). `nghi_duong_tinh_gia`: bất kỳ BCVH nào trong sáu có cờ ở ngày D. Bộ lọc `ma_bcvh` vẫn theo BCVH đích mà KTT biết (từ nơi nhận BD10 đi).
- **`nghi_duong_tinh_gia`** = phần của `chua_thay` mà BCVH đích có `co_the_duong_tinh_gia` ở ngày D (mục 4). KHÔNG bị bỏ khỏi `chua_thay`; chỉ để giao diện chú thích.
- **Phạm vi tra BCVH:** `arrival_items` thuộc file OK có `file_date` trong [D, D+2] (cùng ba ngày mà cờ dương tính giả xét; vì vậy chữ ký cache của ngày D bắt được mọi thay đổi có thể đổi kết quả). SHBG chỉ xuất hiện ở file của ngày D+3 trở đi tính `chua_thay` (đã là «quá 48 giờ» theo mục 3).

### 8.3 Kết quả trả về (ví dụ GIẢ, rút gọn)
```json
{
  "khoang_ngay": { "tu_ngay": "2026-10-19", "den_ngay": "2026-10-22", "so_ngay": 4 }, "ma_bcvh": null,
  "nguon_xuat_luc_moi_nhat": "2026-10-23 10:00:00", "co_du_lieu": true, "ly_do": null,
  "cua_so_thuc_te": { "tu": "2026-10-20", "den": "2026-10-22" },
  "cua_so_theo_bcvh": { "533140": { "tu": "2026-10-20", "den": "2026-10-26" } },
  "theo_ngay": [ {
    "ngay": "2026-10-20", "co_du_lieu": true, "da_chot": true, "hang_hoan_loai_khoi": 1,
    "tap_chinh": { "tong": 6, "trong_cua_so": 6, "ngoai_cua_so": 0, "tai_dich": 2, "bcvh_khac": 1, "chua_thay": 3, "nghi_duong_tinh_gia": 1 },
    "da_ghi_di": { "tong": 3, "trong_cua_so": 3, "ngoai_cua_so": 0, "tai_dich": 1, "bcvh_khac": 0, "chua_thay": 2, "nghi_duong_tinh_gia": 1 },
    "theo_bcvh": { "533140": { "trang_thai": "CO_DU_LIEU", "trong_cua_so": true, "co_the_duong_tinh_gia": false, "ngay_thieu_trong_d_d2": [], "tap_chinh": { }, "da_ghi_di": { }, "hang_hoan_loai_khoi": 1 } }
  } ],
  "tong_cong": { "tap_chinh": { }, "da_ghi_di": { }, "hang_hoan_loai_khoi": 1 },
  "meta": { "hang_hoan_chua_nap": false, "hang_hoan_nguon_xuat_luc": "2026-10-23 00:00:00", "do_phu": "/api/ktt/doi-chieu/do-phu" }
}
```
`trang_thai`, `trong_cua_so`, `co_the_duong_tinh_gia`, `ngay_thieu_trong_d_d2` lấy từ độ phủ KTT-16-1 (`doPhuBcvh`, cùng khoảng). Danh sách hàng hoàn rỗng: route vẫn chạy, `meta.hang_hoan_chua_nap = true`, hoàn = 0 (hàng có thể hoàn vẫn nằm trong tập chính).

### 8.4 Thiết kế: một lượt hay hai, chữ ký cache
- **Bó đối chiếu theo ngày** (`DC.boThuThap` -> `{ ngay, bcvh: { mã: { tap_chinh, da_ghi_di, khac_noi_den, kpl, hang_hoan } } }`, chỉ đếm; mỗi BCVH đích ba số mỗi nhóm + nơi đến thực tế) KHÔNG phụ thuộc cửa sổ: cửa sổ và cờ được áp lúc ghép trả lời (`ghepTongHop`, hàm thuần) từ độ phủ mới nhất, nên đổi `ngay_dau` / `do_moi` của một BCVH không buộc tính lại bó. Không giữ danh sách SHBG: danh sách chỉ nằm trong `boThuThap` của ngày đang tính (≤ vài chục nghìn chuỗi), tra `arrival_items` theo lô 800 (`ix_arrival_items_tracking`, ≈ 35 ms cho 12.000 SHBG) rồi giải phóng.
- **Một lượt duyệt chung với bó B.** Đo thấy lượt duyệt SHBG (≈ 0,5 giây / ngày) chiếm gần hết thời gian; lượt riêng làm lần nguội 30 ngày ≈ 21 giây (> mục tiêu 15). Nên `layNgayDC` gắn bộ thu thập vào CÙNG lượt `DQ.tinhNgay` của bó B (móc `them`), cất cả bó đối chiếu lẫn bó B (nếu chưa có / hết hạn). Hệ quả: nguội đối chiếu ≈ nguội B (+ ≈ 5 %), và nếu B nóng trước thì đối chiếu vẫn phải duyệt lại (thứ tự làm nóng: đối chiếu TRƯỚC bó B).
- **Chữ ký cache của ngày D** (mục `ngayDC`): (1) như bó B — `conHanNgay`: độ mới KTT, dấu hiệu DB (chưa chốt) hoặc chữ ký túi (đã chốt); (2) **chữ ký dữ liệu BCVH** `DC.chuKyBcvh`: số file, tổng id, file mới nhất của file OK / EMPTY của 6 BCVH có `file_date` trong [D, D+2] — nạp thêm / thay / khôi phục file các ngày đó đổi chữ ký, file ngày khác thì không; (3) **phiên bản danh sách hàng hoàn** (`phienBanHangHoan`; `dongBoPhienBan` xóa cả `ngayDC` khi đổi). Ngày chưa chốt tính lại khi DB đổi bất kỳ (như bó B).
- Lý do chọn chữ ký theo ngày thay vì chữ ký toàn cục BCVH: ticket yêu cầu «ngày liên quan được tính lại, ngày khác giữ cache»; file D..D+2 là đúng phạm vi tra cứu (8.2).

### 8.5 Làm nóng
`kttNong.js`: mỗi ngày gọi `layNgayDC` (cất cả hai bó) trước `layNgayB` và `layNgay`; thêm chế độ `chiDoiChieu` (lý do `SAU_NAP_BCVH`) chỉ làm nóng bó đối chiếu, gọi qua `sauNap` MỚI của `sftpScheduler.js` (chạy KHÔNG chờ sau lượt có ≥ 1 file «Hàng đến» được nạp) ở `server/index.js`. Vẫn tôn trọng `KTT_WARM=0`, `KTT_WARM_NGAY`, một lượt tại một thời điểm, nhường vòng lặp giữa các ngày. **Hàng đợi:** lượt `chiDoiChieu` KHÔNG tăng bộ đếm lượt, nên không hủy lượt đầy đủ (`SAU_NAP`, `KHOI_DONG`) đang chạy hay đang xếp hàng mà xếp hàng chạy sau; lượt đầy đủ đến sau vẫn hủy mọi lượt cũ như KTT-15 (lượt đầy đủ đã gồm bó đối chiếu). Nạp tay qua «Lấy ngay / Lấy lại» (`/api/nap-nguon/*`) và `scripts/import-arrivals.js` chưa gọi làm nóng (chỉ làm đệm chữ ký khi request đến).

### 8.6 Điều chưa chắc
1. Thanh 2 gồm cả `khong_phan_loai` (996 SHBG trên bản sao 30/09–29/10) nên lớn hơn `/dicungngay`; khối `khong_phan_loai_da_ghi_di` cho phép trừ ra (đẳng thức ở 8.2). Nguyên nhân gốc là thiếu giờ quét túi đến ở dữ liệu KTT (tập trung 18/10, 19/10, 28/10), chưa tra nguồn.
2. `nghi_duong_tinh_gia` của thanh 1 / thanh 2 đã phân loại chỉ xét cờ của BCVH ĐÍCH; SHBG `chua_thay` còn có thể nằm ở BCVH khác vắng file cùng ngày (cờ của BCVH đó không tính). Nhóm `khong_phan_loai` xét cờ của cả sáu BCVH.
3. Tra BCVH giới hạn file_date [D, D+2]; hàng đến sau đó tính `chua_thay`.
4. Ngày D tính từ 00:00 (mục 3): SHBG lập BD10 muộn ngày cuối cửa sổ có thể chưa đủ 48 giờ trọn vẹn.
5. **Hạn chế đã biết — nạp tay không làm nóng.** Nạp qua «Lấy ngay / Lấy lại» (`/api/nap-nguon/*`) và `scripts/import-arrivals.js` không gọi hook `sauNap`; chỉ lượt hẹn giờ SFTP mới làm nóng bó đối chiếu. Sau nạp tay, request đầu tiên của ngày bị ảnh hưởng tính lại (nguội) rồi mới nóng; kết quả vẫn đúng nhờ chữ ký BCVH.
6. Hook `sauNap` của `sftpScheduler.js` được bọc `try/catch` (lỗi đồng bộ) và `Promise.resolve(...).catch` (Promise bị từ chối) nên không gây `unhandledRejection`; hook nối ở `server/index.js` còn luôn trả Promise không bao giờ từ chối.
