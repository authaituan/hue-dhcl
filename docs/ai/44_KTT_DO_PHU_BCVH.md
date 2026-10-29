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
