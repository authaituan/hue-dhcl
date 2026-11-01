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

## 9. KTT-16-3: thời gian BCVH nhận, chuyến mất dấu, nguồn «chưa thấy»
> Ticket KTT-16-3 (01/11/2026; PO duyệt định nghĩa bước 0 cùng ngày). Backend, CHỈ ĐỌC. Chưa «Đánh giá» (16-4), chưa sheet xlsx (16-3b), chưa giao diện (16-5). Code: `server/lib/kttDoiChieu.js` (`ghepThoiGianNhan`, `ghepChuyenMatDau`, `ghepChuaThay`, thu thập thêm trong `boThuThap`), `kttApi.js` (`doiChieuThoiGianNhan`, `doiChieuChuaThay`, `layBoDoiChieu`), `routes/ktt.js`. Test: `tests/ktt-doi-chieu-thoi-gian-nhan.test.js` (11 ca, dữ liệu giả).

### 9.1 Route
`GET /api/ktt/doi-chieu/thoi-gian-nhan` (a) và `GET /api/ktt/doi-chieu/chua-thay` (b + c), cùng tham số `tu`, `den` (≤ 31 ngày), `ma_bcvh` (lọc theo BCVH ĐÍCH) và cùng quyền như `tong-hop`. Tách hai route để giao diện chỉ tải phần nó cần (JSON ≈ 32 KB và ≈ 13 KB cho 30 ngày so với ≈ 126 KB của `tong-hop`); cả ba dùng CHUNG bó ngày `ngayDC` nên request thứ hai trở đi là nóng. Phần đầu chung: `khoang_ngay`, `ma_bcvh`, `nguon_xuat_luc_moi_nhat`, `co_du_lieu`, `ly_do`, `cua_so_thuc_te`, `cua_so_theo_bcvh`; `meta` có `hang_hoan_chua_nap`, `hang_hoan_nguon_xuat_luc`, `do_phu`, `nghi_duong_tinh_gia` (chú thích).

### 9.2 (a) Thời gian nhận
- **Mẫu:** SHBG thanh 2 (đã ghi đi, không hoàn) phân loại `tai_dich`, ngày D trong cửa sổ của đích. KHÔNG gồm nhóm thiếu giờ quét túi đến.
- **Độ trễ** = mốc đến hợp lệ **muộn nhất** của SHBG ở BCVH đích (`arrival_at`, mốc R2) − giờ lập BD10 đi (cùng mốc với «nơi đến thực tế» của 16-2). Chọn mốc muộn nhất vì mốc sớm nhất cho nhiều độ trễ âm hơn (123 so với 48 trên bản sao 30 ngày: dính chuyến cũ của cùng SHBG); p50 / p90 gần như không đổi.
- **Độ trễ âm** (mốc đến trước giờ lập BD10 đi) đếm riêng (`am`, `ty_le_am`), KHÔNG vào p50 / p90 / `ty_le_cung_ngay`. `mau_tong = mau + am + khong_doc` (`khong_doc`: mốc không phân tích được, hiện luôn 0). `mau_tong` = `da_ghi_di.tai_dich` trong cửa sổ của `tong-hop` (có test, từng BCVH).
- **`cung_ngay`** = số mẫu không âm có mốc đến cùng NGÀY LỊCH với giờ lập BD10 đi; `ty_le_cung_ngay = cung_ngay / mau`. (PO chưa chỉ rõ nghĩa «nhóm a» của canvas; tạm hiểu là ngày nhận = ngày đi. Đổi được vì bó cất đủ thông tin? KHÔNG: chỉ cất `cung_ngay`; nếu «nhóm a» khác thì phải sửa `ghiDoTre`.)
- **p50 / p90:** thứ hạng gần nhất, `rank = ceil(p·n)`, trên histogram theo PHÚT; trả cận trên của bin (giờ, 3 chữ số), nên lớn hơn giá trị chính xác < 1 phút (test: mẫu ngẫu nhiên 3.000, sai ≤ 1/60 giờ). Mỗi (ngày, BCVH) cất histogram thưa `{phút: số}` (100–660 khóa mỗi BCVH trên 30 ngày), gộp nhiều ngày bằng cộng histogram; **không giữ danh sách SHBG**. Gộp ba ngày bằng đúng bó cả khoảng (test).
- **Kết quả:** `theo_bcvh[mã]` và `tong_cong` = `{ mau_tong, mau, am, khong_doc, ty_le_am, cung_ngay, ty_le_cung_ngay, p50_gio, p90_gio, ngoai_cua_so }` (`ngoai_cua_so` = mẫu ở ngày D ngoài cửa sổ của đích, chỉ đếm); `theo_ngay[].theo_bcvh[mã]` cùng khối kèm `trong_cua_so`. Ví dụ GIẢ: `{ "mau_tong": 7, "mau": 6, "am": 1, "p50_gio": 1.517, "p90_gio": 24.017, "ty_le_cung_ngay": 0.8333 }`.
- Số trên bản sao DB 30/09–29/10 (6 BCVH, 114.545 mẫu, 48 âm): p50 1,1–3,7 giờ, p90 1,9–6,35 giờ, đến cùng ngày 91–100 % (Thuận Hóa 91,0 %, thấp nhất).

### 9.3 (b) Chuyến mất dấu (`chua-thay` → `chuyen_mat_dau`)
- **Chuyến** = (mã BD10 đi, giờ lập BD10, BCVH đích); mẫu là SHBG thanh 2 đã phân loại (có đủ ba loại), ngày D trong cửa sổ của đích. Mỗi bó ngày cất `{ b, g, n, ct }` mỗi chuyến (không cất SHBG); gộp nhiều ngày theo chuyến.
- **Mất dấu** = mọi SHBG của chuyến chưa thấy (`ty_le_chua_thay ≥ 1`) VÀ `so_shbg ≥ 5` (`MAT_DAU`, PO duyệt; hằng số trong `kttDoiChieu.js`, trả ở `tieu_chi`). `loai`: `NGHI_THIEU_FILE` nếu có SHBG chưa thấy rơi vào ngày cờ dương tính giả của đích (tách riêng, KHÔNG phải mất dấu chắc), ngược lại `MAT_DAU_CHAC`.
- **Kết quả:** `tong_chuyen`, `tong_shbg_da_ghi_di`, `phan_bo_ty_le_chua_thay` (`khong`, `duoi_10`, `tu_10_den_duoi_50`, `tu_50_den_duoi_100`, `het`), `so_chuyen_mat_dau`, `mat_dau_chac`, `nghi_thieu_file` (`so_chuyen`, `so_shbg`), `danh_sach` (mỗi chuyến: `ma_bd10`, `gio_lap`, `ma_bcvh_dich`, `so_shbg`, `so_chua_thay`, `so_chua_thay_nghi`, `ty_le_chua_thay`, `loai`). **Mã BD10 chỉ có ở phản hồi API** (giao diện cần), không ghi vào tests / docs.
- Bản sao DB 30 ngày: 868 chuyến, 123.141 SHBG, 26 chuyến mất dấu (11 chắc / 600 SHBG, 15 nghi thiếu file / 559 SHBG) so với 8.258 SHBG chưa thấy thanh 2: phần lớn chưa thấy không nằm ở chuyến toàn bộ chưa thấy.

### 9.4 (c) Nguồn của SHBG «chưa thấy» (`chua-thay` → `nguon_chua_thay`)
Hai bảng riêng, vì thanh 1 (`chua_di_tren_24h`) KHÔNG chứa nhóm thiếu giờ quét túi đến (nhóm đó nằm ở thanh 2). Mỗi bảng loại trừ lẫn nhau và cộng đúng:
- **`thanh_1`:** `tong` = `tong_cong.tap_chinh.chua_thay` của `tong-hop` (có test; 816 trên bản sao). Chia theo BCVH đích (`theo_bcvh`, `theo_bcvh_ly_do`) và theo lý do (`theo_ly_do[]`: `ma`, `nhan`, `so_luong`, `nghi_duong_tinh_gia`), cùng `theo_ngay` (ngày đến KTT = ngày D của bó). Lý do (`LY_DO`):

| Mã | Nhãn | Điều kiện |
|---|---|---|
| `KDN_DA_XAC_NHAN` | Kiện đi ngoài đã xác nhận, chưa lập BD10 đi | kiện đi ngoài = luồng túi `DI_NGOAI` HOẶC số hiệu BD8 trùng SHBG (PO), có XNĐ BD10 đến |
| `KDN_CHUA_XAC_NHAN` | Kiện đi ngoài chưa xác nhận | như trên, chưa có XNĐ BD10 đến |
| `TUI_CHUYEN_TIEP_DA_CHIA_SAN` | Túi chuyển tiếp đã chia sẵn, chưa quét đi | hàng chuyển tiếp luồng `DA_CHIA_SAN` mà BD8 khác SHBG (nằm trong túi, không phải kiện đi ngoài) |
| `TUI_CHUA_QUET_DI` | Túi khai thác đến chưa quét đi | có túi đến được mở, có XNĐ BD10 đến, chưa có túi đi |
| `KHAC` | Khác | còn lại (kể cả túi khai thác chưa xác nhận BD10 đến) |

  Nhãn «Chưa có giờ lập BD10 đi» bỏ vì mọi SHBG thanh 1 đều chưa có giờ này theo định nghĩa. Bản sao: 274 / 1 / 88 / 414 / 39 theo thứ tự `KDN_DA_XAC_NHAN` / `KDN_CHUA_XAC_NHAN` / `TUI_CHUYEN_TIEP_DA_CHIA_SAN` / `TUI_CHUA_QUET_DI` / `KHAC` (cộng 816).
- **`thieu_gio_quet_den`:** `tong` = `da_ghi_di.khong_phan_loai_da_ghi_di.tong` của `tong-hop` (996 trên bản sao) = `da_thay.tong` (theo nơi đến thực tế: `theo_bcvh_noi_den`) + `chua_thay.tong` (theo nguồn: `theo_nguon` = `chuyen_tiep` (kiện đi ngoài) / `khai_thac` (túi khai thác) / `da_chia_san` (túi chuyển tiếp đã chia sẵn, khóa riêng); `nghi_duong_tinh_gia`) + `ngoai_cua_so`. Bản sao: 455 + 541 (172 kiện đi ngoài + 53 túi khai thác + 316 túi chuyển tiếp đã chia sẵn) + 0. Nhóm này gồm cả 551 SHBG chưa ghi đi (466 khai thác + 85 chuyển tiếp) KHÔNG thuộc thanh nào của 16-2: chưa liên hệ được với khoảng lệch B3 so với B1 (~2.100), cần ticket riêng nếu muốn kết luận.

### 9.5 Thiết kế, cache, hiệu năng
- **Bó ngày mở rộng** (`bcvhMoi`): thêm `tg` (histogram độ trễ + âm + cùng ngày), `chuyen`, `ly_do`, `kpl.khong_thay_nguon`. Thu thập trong CÙNG lượt duyệt và cùng lượt tra `arrival_items` của 16-2 (không thêm truy vấn); cửa sổ / cờ vẫn áp lúc ghép. **Chữ ký cache giữ nguyên** (dấu hiệu KTT, file BCVH D..D+2, phiên bản hàng hoàn): các số mới chỉ phụ thuộc đúng các nguồn đó. Không có bộ nhớ đệm thứ hai; làm nóng của 16-2 (`layNgayDC`) đã phủ cả ba route.
- **Hiệu năng** (bản sao DB 30 ngày, `perf` đo xen kẽ bản trước / sau trên cùng máy): nguội `tong-hop` trước 16,8–17,5 giây, sau 16,0–17,3 giây (chênh nằm trong nhiễu giữa các lần đo ±1 giây; mục tiêu ≤ +1,5 giây đạt); `thoi-gian-nhan` / `chua-thay` lần đầu ≈ nguội của bó (dùng chung bó, không tính thêm); nóng 20–70 ms; RSS đỉnh 233–260 MB (không đổi so với trước). Cách giữ chi phí thấp: đường phân tích giờ nhanh có nhớ phần ngày (`giayNhanh`, đo thấy `L.giayCua` ≈ 1,3 µs × ~250.000 lần ≈ 0,33 giây nếu gọi trực tiếp).
- Điều chưa chắc: (1) «nhóm a» của canvas (xem 9.2); (2) p50 / p90 lấy cận trên bin phút nên cao hơn giá trị chính xác tới 1 phút; (3) mốc đến lấy dòng muộn nhất nên SHBG đến đích hai lần chỉ tính lần sau.

## 10. KTT-16-4: «Đánh giá» và xuất xlsx sheet 1–6 của trang Đối chiếu
> Ticket KTT-16-4 (01/11/2026), PHẦN 1 backend (nhánh chung `feat/ktt-16-5-trang-doi-chieu`; giao diện = phần 2 của Antigravity, chưa làm). CHỈ ĐỌC. Code: `server/lib/kttDanhGiaDoiChieu.js` (hàm thuần), `server/lib/kttDoiChieuXuat.js` (cột, chọn dòng, «Thông tin»), `kttDoiChieu.js` (thêm `ghepChuyenTiepChuaQuet`, `ghepChuyenCham`, `gopThoiGianChuyen`, `CHUYEN_CHAM`; `boThuThap(ngay, { lietKe })`), `kttApi.js` (`doiChieuDanhGia`, `xuatDoiChieu`), `kttWorker.js` (tác vụ `xuatDoiChieu`), `kttXuat.js` (`ghiXlsx` nhận `cot` + `tenSheet`), `routes/ktt.js`. Test: `tests/ktt-doi-chieu-danh-gia-xuat.test.js` (18 ca, dữ liệu giả).

### 10.1 Route (ADMIN + TTVH; GDVH, TIVI 403; không token 401; `tu`, `den` ≤ 31 ngày; `ma_bcvh` lọc theo BCVH ĐÍCH; khóa lạ -> 400)
- `GET /api/ktt/doi-chieu/danh-gia` — `danh_gia[]` (thứ tự a–h, mục không đủ điều kiện thì KHÔNG có), `so_dong_sheet` (sheet 1–6: `ten`, `route`, `so_dong`), `hang_so` (`chuyen_cham`, `mat_dau`, `cung_ngay_thap`), `meta`; phần đầu như `tong-hop` (`khoang_ngay`, `cua_so_thuc_te`, `cua_so_theo_bcvh`, `co_du_lieu`, `ly_do`). Chưa có dữ liệu KTT: `danh_gia = []`.
- `GET /api/ktt/doi-chieu/xuat/{chua-thay | chuyen-mat-dau | chuyen-tiep-chua-quet-di | thay-o-bcvh-khac | chuyen-cham | da-co-tai-dich}` — file `.xlsx` (sheet «Thông tin» đứng đầu + một sheet dữ liệu), tên file `KTT_DoiChieu_<tên>_<tu>_<den>.xlsx`; lỗi tham số vẫn là JSON 400 (kiểm tra xong TRƯỚC khi gửi header); vượt `KTT_XUAT_TRAN_DONG` (mặc định 200.000) -> 400 `KTT_QUA_NHIEU_DONG`; nhật ký `ktt_export` ghi `kind`, `sheet`, `ma_bcvh`, số dòng (không SHBG).

### 10.2 Khuôn «Đánh giá» (khảo sát các trang KTT khác và cách bám)
`kttDanhGia.taoDanhGia` (KTT-5, `/api/ktt/tong-hop`): BACKEND sinh câu (hàm thuần, ngưỡng đóng băng ở đầu file, câu trung tính, `{ ma, mucDo, cau, soLieu, loc }`). `kttApi.canhBaoTongQuan` (`/tong-quan`): backend chỉ trả `{ ma, muc, số }`, giao diện ghép câu. KTT-16-4 theo khuôn KTT-5 (ticket đòi `noi_dung` tiếng Việt từ backend): hàm thuần `taoDanhGiaDoiChieu`, ngưỡng ở `NGUONG_DANH_GIA`, khóa snake_case như các route KTT-12/16; mỗi mục `{ ma, loai (LUU_Y | CANH_BAO | THONG_TIN), tieu_de, noi_dung, so_lieu, sheet (1–6 | null), dieu_kien_hien }`.

### 10.3 Các mục «Đánh giá» (mọi số lấy từ cùng hàm ghép với tong-hop / chua-thay / thoi-gian-nhan; không số hoặc ngày cứng)
| Mã | Loại | Sheet | Điều kiện hiện | Nguồn số |
|---|---|---|---|---|
| `NHOM_CHUA_DI_24H` (a) | LUU_Y | – | `tap_chinh.tong > 0` | `tong-hop`: trong cửa sổ / tại đích / BCVH khác / chưa thấy / ngoài cửa sổ |
| `CHUA_THAY_O_DAU` (b) | CANH_BAO | 1 | `thanh_1.tong > 0` | `chua-thay`: `thanh_1` (BCVH chiếm nhiều nhất; lý do gộp 4 nhóm: kiện đi ngoài / túi chuyển tiếp đã chia sẵn / túi khai thác đến chưa quét đi / khác) |
| `CHUYEN_MAT_DAU` (c) | LUU_Y | 2 | `so_chuyen_mat_dau > 0` | `chua-thay`: `mat_dau_chac`, `nghi_thieu_file` tách riêng; các ngày Chủ nhật tính từ `gio_lap` của chuyến (không nêu nguyên nhân) |
| `CHUYEN_TIEP_CHUA_QUET_DI` (d) | THONG_TIN | 3 | `tong > 0` | `ghepChuyenTiepChuaQuet` (mục 10.5) |
| `THAY_O_BCVH_KHAC` (e) | THONG_TIN | 4 | `tap_chinh.bcvh_khac > 0` | `tong-hop` (+ nơi nhiều nhất) |
| `DEN_CUNG_NGAY_THAP` (f) | THONG_TIN | 5 | BCVH có ≥ 200 mẫu, % đến cùng ngày < 95 % và thấp hơn mức chung ≥ 3 điểm % | `thoi-gian-nhan` + `ghepChuyenCham` (số chuyến chậm của BCVH đó và khung giờ lập nhiều nhất, tính từ dữ liệu) |
| `CHAT_LUONG_DU_LIEU_BCVH` (g) | LUU_Y | – | có (BCVH, ngày) không có file / chỉ file rỗng, hoặc độ trễ âm, hoặc dòng BCVH thiếu mốc xác nhận | độ phủ KTT-16-1 (cờ dương tính giả) + `thoi-gian-nhan.tong_cong.am` + `ty_le_thieu_gio_nhan` (bình quân theo dòng) |
| `THIEU_GIO_QUET_DEN` (h) | THONG_TIN | – | `thieu_gio_quet_den.tong > 0` | `chua-thay`: đã thấy / chưa thấy (theo nguồn) / ngoài cửa sổ |

Ngưỡng của f: `NGUONG_DANH_GIA.cungNgayThap` (`SO_MAU_TOI_THIEU` 200, `TY_LE_DUOI` 0,95, `CHENH_TOI_THIEU` 0,03) — chọn theo bản sao 30 ngày (mức chung 95,0 %, Thuận Hóa 91,0 %; các BCVH khác cao hơn rõ rệt, xem 9.2). Các số cũ của canvas (4.575, 3.080, 83 %, 750) KHÔNG còn: mọi số lấy từ API.

### 10.4 Xuất xlsx — nguồn dùng chung và đẳng thức số dòng
Sheet 1–4: `boThuThap(ngay, { lietKe: true })` chạy trong worker, duyệt lại SHBG TỪNG NGÀY bằng đúng lượt duyệt và đúng quy tắc phân loại của bó (danh sách chỉ nằm trong bộ thu thập của ngày đang xử lý rồi bỏ; **không cache danh sách SHBG**, bó cache chỉ thêm vài bộ đếm); dòng được chọn bằng cùng quy tắc cửa sổ / cờ của hàm ghép. Sheet 5, 6: cắt từ bó đã cache (không duyệt SHBG).

| Sheet | Tên sheet | 1 dòng | Số dòng = | Cột (đúng thứ tự) |
|---|---|---|---|---|
| 1 | `1 Chưa thấy ở đâu` | SHBG thanh 1 loại `CHUA_THAY`, ngày D trong cửa sổ của đích | `tong_cong.tap_chinh.chua_thay` (= `nguon_chua_thay.thanh_1.tong`) | SHBG · BCVH đích (mã, tên) · Giờ KTT nhận (quét túi đến, thiếu thì XNĐ BD10 đến) · Số hiệu BD8 · BD10 túi đến · Nguồn · Lý do thiếu trạng thái · Ngày đến KTT · Tuổi (giờ) · Nghi dương tính giả |
| 2 | `2 Chuyến mất dấu` | SHBG chưa thấy của chuyến mất dấu (cả hai loại) | Σ `so_chua_thay` của `chuyen_mat_dau.danh_sach` | SHBG · BCVH đích (mã, tên) · Mã chuyến (BD10 đi) · Giờ lập BD10 đi · Ngày trong tuần · Chủ nhật (Có/Không) · Loại (`MAT_DAU_CHAC` / `NGHI_THIEU_FILE`) |
| 3 | `3 Chuyển tiếp chưa quét đi` | SHBG | `ghepChuyenTiepChuaQuet.tong` | SHBG · BCVH đích (mã, tên) · Giờ chuyển tiếp · Loại đích (BCVH Huế / Khác) |
| 4 | `4 Thấy ở BCVH khác` | SHBG thanh 1 loại `BCVH_KHAC` | `tong_cong.tap_chinh.bcvh_khac` | SHBG · BCVH đích dự kiến (mã, tên) · BCVH thật sự thấy (mã, tên) · Giờ KTT nhận · Giờ BCVH nhận (mốc muộn nhất) |
| 5 | `5 Chuyến chậm` | chuyến BD10 chậm | `ghepChuyenCham.so_chuyen_cham` | BD10 · BCVH đích (mã, tên) · Giờ BD10 đi · Giờ BCVH nhận (theo trung vị) · Trung vị (giờ) · p90 (giờ) · Số SHBG của chuyến · Số SHBG đã thấy ở đích · C1 · C2 · C3 (TRỐNG) |
| 6 | `6 Đã có tại đích` | (BCVH, ngày) | số ngày × số BCVH của yêu cầu | BCVH đích (mã, tên) · Ngày · Trong cửa sổ · Số SHBG đã có tại đích · Tổng SHBG đã ghi đi (trong cửa sổ) · Tỷ lệ · SHBG ngoài cửa sổ |

- Sheet 6: «đã có tại đích» = thanh 2 `tai_dich`; «tổng» = thanh 2 phân loại được trong cửa sổ (`trong_cua_so`); ΣTại đích = `tong_cong.da_ghi_di.tai_dich`, ΣTổng = `da_ghi_di.trong_cua_so` (test cộng đúng). Không gồm nhóm thiếu giờ quét túi đến.
- Cột bỏ: không có (mọi cột trong ticket đều có nguồn). Sheet 5: C1/C2/C3 để TRỐNG (dữ liệu không có căn cứ; nợ «làm rõ C1/C2/C3 so với xe C2»). «Số hiệu túi/kiện» của sheet 1 = hai cột thật: `soHieuBd8` (BD8; kiện đi ngoài thì trùng SHBG) và `bd10Den` (BD10 túi đến).
- Nhãn «Nguồn» sheet 1: kiện đi ngoài (cả đã xác nhận / chưa xác nhận) -> «Kiện đi ngoài»; «Túi chuyển tiếp đã chia sẵn»; «Túi khai thác đến chưa quét đi»; «Khác». Không dùng cụm «túi đi ngoài chưa mở» (có test).
- Sheet «Thông tin» (mọi file): Cửa sổ (yêu cầu, cửa sổ thực tế, cửa sổ từng BCVH), Dữ liệu đến (độ mới KTT, độ mới từng BCVH), Chốt số theo ngày, Ngày xuất / người xuất, Trạng thái số liệu, Định nghĩa: nhóm của sheet, Định nghĩa: có mặt ở BCVH, Định nghĩa: cờ nghi dương tính giả, Đơn vị, Số dòng kiểm tra, Đối chiếu với màn hình (so số dòng với số API; lệch thì ghi «KHÔNG khớp … hãy xuất lại»).
- Giờ ghi bằng `kttXuat.oGio` (số UTC = số của chuỗi giờ VN), ngày trong tuần tính từ chuỗi ngày bằng `getUTCDay`: không phụ thuộc múi giờ máy chủ (test ba múi giờ).

### 10.5 Hai nhóm mới
- **Chuyển tiếp chưa quét đi** (sheet 3, mục d): SHBG `chua_di_tren_24h` của KTT-14 (chưa lập BD10 đi, chờ > 24 giờ từ giờ quét túi đến), `nguonHang = chuyen_tiep` (chỉ có túi CHUYEN_TIEP_DI), KHÔNG phải hàng hoàn, KHÔNG phụ thuộc cửa sổ BCVH. Đích thuộc 6 BCVH Huế đếm vào `thuoc_bcvh_hue` (theo từng BCVH: `ctcq` của bó); đích khác (nội tỉnh đi liên tỉnh…) đếm vào `ctcq_khac` của bó ngày. Lọc `ma_bcvh`: chỉ đích đó. Bản sao DB 30 ngày: **588 SHBG, toàn bộ thuộc 6 BCVH Huế (khác = 0)** (theo BCVH: Hương Thủy 410, Thuận Hóa 94, Phú Lộc 34, Thuận An 22, Hương Trà 16, A Lưới 12); canvas cũ ghi 694 / 643 — chưa tìm được định nghĩa cho con số đó (khác kỳ, khác phạm vi hoặc tính cả hoàn / nhóm khác).
- **Chuyến chậm** (sheet 5, mục f): chuyến (mã BD10 + giờ lập + BCVH đích) trong cửa sổ của đích với **≥ 5 SHBG đã thấy ở đích (mẫu hợp lệ)** và **trung vị thời gian «giờ lập BD10 đi → BCVH đích nhận» > 6 giờ** (`CHUYEN_CHAM` trong `kttDoiChieu.js`, PO đổi ở đó). Bó cất thêm histogram phút THƯA theo chuyến (`h`, `nt`; vài chục khóa mỗi chuyến), không giữ SHBG. Số liệu thử trên bản sao 30 ngày (868 chuyến, mẫu ≥ 5): trung vị > 2 giờ: 196; > 3: 146; > 4: 114; **> 6: 65**; > 8: 52; > 12: 21; > 24: 5; theo p90 của chính BCVH (trung vị chuyến > p90 BCVH): 96. Chọn 6 giờ vì ≈ p90 cao nhất giữa các BCVH (1,9–6,35 giờ) nên chỉ lấy phần đuôi thật sự (7,5 % số chuyến).

### 10.6 Hiệu năng (bản sao DB 30 ngày; tiến trình riêng mỗi lần đo)
- Nguội `tong-hop` 30 ngày: bản trước KTT-16-4 15,9 / 16,5 giây, sau 15,7 / 16,1 giây (không tăng); RSS đỉnh 249–253 MB (không đổi). `danh-gia` nguội 16,0 giây (cùng bó); nóng ≈ 60 ms.
- Xuất (nguội, kể cả dựng bó): sheet 5, 6 ≈ 16,2 giây (= nguội bó; nóng ≈ 40 ms); sheet 1–4 ≈ 31–33 giây (bó 16 giây + duyệt lại SHBG 14–15 giây ở worker; bó đã nóng thì chỉ ≈ 14–15 giây); RSS đỉnh sheet 1–3 ≈ 500 MB, sheet 4 ≈ 410 MB (worker dựng 30 ngày như xuất sheet 8 `hom-sau-chua-di` cũ: 491 MB). Sheet 5, 6 không tăng bộ nhớ.

### 10.6b Giới hạn xếp hàng xuất sheet 1–4 (Q&A 01/11/2026)
Sheet 1–4 chạy ở MỘT worker duy nhất, xử lý tuần tự (`kttWorker.js:33–37`, `kttApi.js:146–149`), chung hàng đợi với mọi tác vụ nặng khác của KTT. `kttApi.xuatDoiChieu` giữ bộ đếm `trangThaiXuat.dem` (trả lại ở `finally`, kể cả khi lỗi): tối đa MỘT lượt chạy + MỘT lượt chờ (`GIOI_HAN_XUAT_DOI_CHIEU = 2`); lượt thứ ba trở đi bị từ chối bằng `LoiKtt('KTT_XUAT_BAN', 'Đang có xuất khác, thử lại sau ít phút.')`, route trả **429** `{ error, ma: 'KTT_XUAT_BAN' }`. Sheet 5, 6 (không duyệt SHBG) và sheet 7, 8 cũ không bị giới hạn. Bộ đếm chỉ bao phần chuẩn bị nội dung (nặng); ghi luồng file ra client không tính. RSS đỉnh khi có lượt chờ ước ≈ 500 MB (tuần tự, không cộng dồn; chưa đo trực tiếp). Server không đặt timeout HTTP (mặc định Node `requestTimeout` 300 giây); **rủi ro cần kiểm ở NAS / proxy phía trước**: nếu có timeout đọc ≈ 60 giây thì một lượt nguội (31–33 giây) cộng chờ lượt trước có thể vượt. Làm nóng cache chạy ở luồng chính, đọc DB WAL chỉ-đọc, không khóa với worker.

### 10.7 Điều chưa chắc
1. «Đã có tại đích» của sheet 6 theo thanh 2 (đã ghi đi), không theo thanh 1. 2. Sheet 4 theo thanh 1 (tập «chưa đi trên 24 giờ»); `bcvh_khac` của thanh 2 (338 SHBG) không có sheet. 3. Ngưỡng chuyến chậm (6 giờ, ≥ 5 mẫu) và ngưỡng mục f do dev đề xuất, chờ PO chọn. 4. Số «694 / 643» của canvas chưa tái tạo được. 5. Hàng hoàn bị loại khỏi sheet 1, 3, 4 (như thanh 1). 6. Mục f hiện chỉ khi dữ liệu ủng hộ; câu «chuyến tối» của canvas thay bằng khung giờ lập nhiều nhất tính từ dữ liệu (Thuận Hóa: 21:00, 20/48 chuyến chậm). 7. Số dòng file xuất có thể lệch số API tức thời nếu dữ liệu vừa đổi (xuất luôn duyệt lại, API có thể còn cache): sheet «Thông tin» báo «KHÔNG khớp». 8. Mã BD10 của sheet 2 và 5 chỉ có trong file xuất, không ghi vào test / docs.
