# 5g-6a — Hợp đồng API «Nhật ký thay thế» và «Khôi phục» cho giao diện 5g-6 (CHỈ ĐỌC)

> Nền: `origin/main` = `d6c8050` (worktree `D:\Dev\hue-dhcl-phat1`, HEAD trùng). Chỉ đọc mã; không mở DB, không gọi API, không chạy server.
> Mọi ví dụ JSON bên dưới là **dữ liệu giả** (mã số và tên file bịa). «Chưa kiểm chứng» = không thể xác nhận bằng đọc mã.
> Tệp nguồn chính: `server/routes/arrivals.js:251-321` (route), `server/lib/thayTheNhatKy.js` (đọc), `server/lib/thayTheKhoiPhuc.js` (khôi phục).

## Điểm chung (Việc 5)
- **Quyền:** cả 4 route dùng `requireAdmin` (`arrivals.js:279,286,298,309`). 401 khi không token (`server/auth.js:94,98,121`: `{ error }`, **không có** `ma`); 403 với mọi vai trò khác ADMIN (`auth.js:148`: `{ error: 'Không đủ quyền: chỉ quản trị viên (ADMIN)…' }`, không có `ma`).
- **Dạng lỗi:** `{ error: <chuỗi tiếng Việt>, ma: <MÃ_LỖI> }` — **không phải** `{error, code, message}` (`arrivals.js:258-266`). Trường thông điệp là `error` (đã có tiếng Việt, không chứa SHBG/bí mật); mã máy là `ma`. Lỗi không lường trước: 500 `LOI_HE_THONG` (`:265`).
- **Giờ:** mọi thời điểm lưu UTC ISO có mili-giây (`…T03:14:15.123Z`); bản `_bangkok` là `YYYY-MM-DDTHH:mm:ss+07:00` (`thayTheNhatKy.js:34-38`). `ngay` là `YYYY-MM-DD` (ngày trong TÊN FILE, `thayTheThucHien.js:63`).
- **Header/phiên:** chỉ `Authorization: Bearer <token>`; POST cần `Content-Type: application/json` (body đọc bởi `express.json`, `server/index.js:45`). Không có header đặc biệt khác.
- **Tham số lạ** (query hoặc body) → 400 `THAM_SO_SAI` (`arrivals.js:267-276`). `GET .../:id` không nhận query nào (`:288`).
- **API client có sẵn:** `apiFetchJson(url, options)` ở `src/utils/api.js:96-115` trả `{ ok, status, error, data }`; mã lỗi nằm ở `res.data.ma`, thông điệp ở `res.error` (= `data.error`) — như `ReplaceDayView.jsx:166-172`. Bảng thông báo tiếng Việt theo mã đang ở `ReplaceDayView.jsx:68-91` (`ERROR_MESSAGES`, chưa có mã khôi phục).
- **Chỗ thêm tab mới:** `ReplaceDayView` là một trang đầy đủ, được `App.jsx:245-251` gắn khi `activeTab === 'replace_day'`; Sidebar (`Sidebar.jsx:37`) và Header (`Header.jsx:14`) chỉ có một mục «Thay thế ngày». Có thể thêm tab trong trang bằng cách bọc hàm `ReplaceDayView` (`ReplaceDayView.jsx:92`, `return` ở `:233`) — một thanh tab nội bộ (ví dụ «Thay thế» | «Nhật ký») và đặt component mới ở file riêng; **không cần sửa `App.jsx`/`Sidebar.jsx`/`Header.jsx`**. Chỉ cần sửa `App.jsx` nếu muốn điều hướng sâu (mở sẵn tab nhật ký từ nơi khác), vì khi đó phải thêm tham số truyền (`replaceDayParams`, `App.jsx:132,247`).

---
## Việc 1 — `GET /api/arrivals/thay-the/nhat-ky`
**Tham số** (`thayTheNhatKy.js:47-76`; mọi tham số lặp lấy giá trị CUỐI; chuỗi rỗng = không đặt):

| Tên | Kiểu | Mặc định | Giới hạn | Lỗi |
|---|---|---|---|---|
| `page` | số nguyên dương | 1 | ≤ 6 chữ số, ≥ 1 | 400 `THAM_SO_SAI` |
| `page_size` | số nguyên dương | 20 (`TRANG_MAC_DINH`) | ≤ 100 | 400 |
| `bcvh` | mã | (tất cả) | một trong `VALID_BCVH_CODES` | 400 |
| `tu_ngay`, `den_ngay` | `YYYY-MM-DD` | — | ngày hợp lệ; nếu có cả hai: `den ≥ tu` và ≤ 92 ngày | 400 |
| `nguoi` | chuỗi mã HRM (khớp tuyệt đối) | — | ≤ 60 ký tự | 400 |

`tu_ngay`/`den_ngay` lọc theo `ngay` của lần thay (ngày dữ liệu bị thay), **không** theo thời điểm thực hiện (`:116-117`).
**Sắp xếp:** `thoi_diem_utc DESC, id DESC` (mới trước, `:121`) — cố định, không có tham số đổi.
**JSON:** `{ items: [Mục], pagination: { total, page, page_size, total_pages } }` (`:124-127`); `total_pages = ceil(total/page_size)` → **0 khi total = 0**; trang vượt quá trả `items: []`.

**Mục (`dinhDang`, `thayTheNhatKy.js:84-108`):**

| Trường | Kiểu | Null? | Ý nghĩa |
|---|---|---|---|
| `id` | số | không | mã lần thay (cũng là `nhat_ky_id` cho khôi phục) |
| `bcvh` | chuỗi | không | mã BCVH |
| `ngay` | chuỗi `YYYY-MM-DD` | không | ngày dữ liệu bị thay |
| `thoi_diem` | chuỗi UTC ISO `…Z` | không | thời điểm thực hiện |
| `thoi_diem_bangkok` | chuỗi `…+07:00` | có (nếu không đọc được) | cùng thời điểm theo UTC+7 |
| `nguoi` | **đối tượng** `{ ma, ten }` | `ten` có thể null | `ma` = mã HRM; **có thể là `script:<tên>`** khi do script chạy (`thayTheThucHien.js:62`); `ten` = `users.full_name` hoặc null |
| `so_dong_xoa` | số | không | số dòng bị xóa (`so_dong_cu`) |
| `so_dong_nap` | số | không | số dòng nạp mới (`so_dong_moi`) |
| `so_file_xoa` / `so_file_nap` | số | không | số file cũ / mới |
| `canh_bao` | `{ muc, da_dong_y_mat }` | không | `muc` ∈ `AN_TOAN` \| `CAN_XAC_NHAN` \| `DO` (`thayTheXemTruoc.js:201-204`); `da_dong_y_mat` bool |
| `mat_that` | `{ so_shbg, tren_so_shbg_cu, ty_le_phan_tram, can_tren_so_shbg }` | không | số bưu gửi «mất thật»/tổng SHBG cũ; `ty_le_phan_tram` số thập phân 2 chữ số (0 khi mẫu số 0) |
| `ket_qua` | chuỗi | không | `THANH_CONG` hoặc `DA_HOAN_TAC` (chừa chỗ; hiện chỉ ghi `THANH_CONG`, `thayTheThucHien.js:78,138,447`) |
| `sao_luu` | `{ tep, kich_thuoc }` hoặc `null` | có | `tep` = TÊN tệp (không đường dẫn); **`kich_thuoc` luôn `null`** (xác nhận: `thayTheNhatKy.js:101` gán cứng null, nhật ký không lưu kích thước). `sao_luu` null khi không có đường dẫn |
| `thung_rac` | `{ het_han_luc, con_khoi_phuc_duoc, da_khoi_phuc }` | không | xem (b) |

**(a)** BCVH = `bcvh`; ngày thay = `ngay` (`YYYY-MM-DD`); thời điểm = `thoi_diem` (UTC ISO) + `thoi_diem_bangkok`; người = đối tượng `nguoi`; file mới = **không có tên file mới ở danh sách** (chỉ `so_file_nap`; tên nằm ở chi tiết `tap_file_moi`); số dòng xóa/nạp = `so_dong_xoa` / `so_dong_nap`.
**(b)** Trạng thái thùng rác: không có «còn N ngày» sẵn. Có `thung_rac.het_han_luc` (UTC ISO = thời điểm thực hiện + 30 ngày, `thayTheThucHien.js:433`, `server/config/thay-the.js:13`), cờ server tính `con_khoi_phuc_duoc = !hetHan && !daKhoiPhuc && ket_qua==='THANH_CONG'` (`thayTheNhatKy.js:104`; `hetHan = đã dọn || het_han_luc <= now của máy chủ`, `:86`) và `da_khoi_phuc`. «Còn N ngày» do giao diện suy ra: `max(0, ceil((Date.parse(het_han_luc) − now) / 86400000))`. Danh sách **không** cho biết «không có gì để khôi phục» — cần gọi xem trước (`co_the_khoi_phuc`). «Hết hạn» = `!con_khoi_phuc_duoc && !da_khoi_phuc` (và `ket_qua` THANH_CONG).
**(c)** Xác nhận: `sao_luu.kich_thuoc` luôn null ở danh sách và chi tiết; chỉ phản hồi `thuc-hien` của khôi phục có số (Việc 4).
**(d)** Mới nhất trước (`thoi_diem_utc DESC, id DESC`).

**Ví dụ (giả):**
```json
{
  "items": [{
    "id": 12, "bcvh": "533140", "ngay": "2026-10-14",
    "thoi_diem": "2026-10-16T03:14:15.123Z", "thoi_diem_bangkok": "2026-10-16T10:14:15+07:00",
    "nguoi": { "ma": "ADM001", "ten": "Nguyễn Văn A" },
    "so_dong_xoa": 1200, "so_dong_nap": 1185, "so_file_xoa": 2, "so_file_nap": 2,
    "canh_bao": { "muc": "CAN_XAC_NHAN", "da_dong_y_mat": true },
    "mat_that": { "so_shbg": 15, "tren_so_shbg_cu": 1100, "ty_le_phan_tram": 1.36, "can_tren_so_shbg": 20 },
    "ket_qua": "THANH_CONG",
    "sao_luu": { "tep": "truoc-thay-the_533140_2026-10-14_20261016T031415Z.db", "kich_thuoc": null },
    "thung_rac": { "het_han_luc": "2026-11-15T03:14:15.123Z", "con_khoi_phuc_duoc": true, "da_khoi_phuc": false }
  }],
  "pagination": { "total": 1, "page": 1, "page_size": 20, "total_pages": 1 }
}
```

---
## Việc 2 — `GET /api/arrivals/thay-the/nhat-ky/:id`
- Tham số: `:id` số nguyên dương ≤ 9 chữ số (`kiemTraId`, `thayTheNhatKy.js:131-135`); sai → 400 `THAM_SO_SAI`; không có → **404 `KHONG_TIM_THAY`** «Không có lần thay thế này» (`:141`). Không nhận query (`arrivals.js:288`).
- Trả **toàn bộ trường của một Mục** (như Việc 1; `thung_rac` mở rộng) **cộng**:

| Trường thêm | Kiểu | Ghi chú |
|---|---|---|
| `tap_file_cu[]` | `{ ten, trang_thai, nguon, so_dong }` | file bị thay; `ten`/`trang_thai`/`nguon` có thể null; `so_dong` = `so_dong_thuc` ?? `row_count` ?? 0 (`:151`) |
| `tap_file_moi[]` | `{ ten, trang_thai, so_dong, da_ghi, bo_qua_trung }` | file mới nạp; không có `sha256` (`:152`) |
| `thung_rac.so_dong`, `thung_rac.so_file` | số | **số hiện còn** trong thùng rác (0 nếu đã dọn) |
| `khoi_phuc` | đối tượng hoặc `null` | có khi đã khôi phục: `{ thoi_diem, thoi_diem_bangkok, nguoi{ma,ten}, so_dong_them, so_dong_da_co, so_dong_gan_sang_file_khac, so_dong_khong_khoi_phuc, so_file_tao_lai, so_file_gan_vao_hien_hanh, so_file_bo_qua }` (`:154-158`) |

Không có: đường dẫn sao lưu, SHBG, nội dung dòng thùng rác (`thayTheNhatKy.js:3-4`). Ghi chú: `sao_luu.tep` chỉ là tên; thư mục sao lưu chỉ giữ 5 bản gần nhất (`config/thay-the.js:14`), nên tệp có thể không còn — **backend chưa trả cờ «tệp còn tồn tại»** (chưa kiểm chứng ở nơi khác).

**Ví dụ (giả, phần thêm):**
```json
{ "id": 12, "bcvh": "533140", "ngay": "2026-10-14", "...": "như danh sách",
  "tap_file_cu": [{ "ten": "HangDen_000000_20261014_083000.csv", "trang_thai": "OK", "nguon": "SFTP", "so_dong": 700 }],
  "tap_file_moi": [{ "ten": "HangDen_000000_20261014_083000.csv", "trang_thai": "OK", "so_dong": 690, "da_ghi": 690, "bo_qua_trung": 0 }],
  "thung_rac": { "het_han_luc": "2026-11-15T03:14:15.123Z", "con_khoi_phuc_duoc": false, "da_khoi_phuc": true, "so_dong": 1200, "so_file": 2 },
  "khoi_phuc": { "thoi_diem": "2026-10-17T02:00:00.000Z", "thoi_diem_bangkok": "2026-10-17T09:00:00+07:00",
    "nguoi": { "ma": "ADM001", "ten": "Nguyễn Văn A" }, "so_dong_them": 30, "so_dong_da_co": 1170,
    "so_dong_gan_sang_file_khac": 0, "so_dong_khong_khoi_phuc": 0, "so_file_tao_lai": 0, "so_file_gan_vao_hien_hanh": 2, "so_file_bo_qua": 0 } }
```

---
## Việc 3 — `POST /api/arrivals/thay-the/khoi-phuc/xem-truoc`
- **Body:** `{ "nhat_ky_id": <số nguyên dương hoặc chuỗi số> }`; khoá khác → 400 (`arrivals.js:302`). **Quyền:** ADMIN. Chỉ đọc: không ghi DB, không khoá, không sao lưu (`thayTheKhoiPhuc.js:134`).
- **Lỗi có thể:** 400 `THAM_SO_SAI`; 404 `KHONG_TIM_THAY`; 409 `DA_KHOI_PHUC`; 409 `THUNG_RAC_HET_HAN` (`docLanThay`, `:35-46`). **Không** trả `DANG_*` hay `KHONG_CO_GI_DE_KHOI_PHUC` (với thùng rác không còn gì để thêm vẫn 200 với `co_the_khoi_phuc: false`).
- **JSON (`baoCao`, `:115-132`):** `nhat_ky_id`, `bcvh`, `ngay`, `thung_rac{het_han_luc}`, `so_dong_trong_thung_rac`, `so_dong_se_them`, `so_dong_da_co`, `so_dong_gan_sang_file_khac`, `so_dong_khong_khoi_phuc`, `so_file_se_tao_lai`, `so_file_gan_vao_hien_hanh`, `so_file_bo_qua`, `tap_file[]`, `canh_bao[]`, `co_the_khoi_phuc`.
  - `tap_file[]`: `{ ten, trang_thai, hanh_dong, so_dong_trong_thung_rac, so_dong_se_them, so_dong_da_co, so_dong_gan_sang_file_khac, so_dong_khong_khoi_phuc }`; `hanh_dong` ∈ `TAO_LAI` \| `GAN_VAO_FILE_HIEN_HANH` \| `BO_QUA_TU_CHOI` \| `KHONG_TAO_LAI_TRUNG_BAN_GHI` (`:26-31`). Số null: không (đều số).
  - `canh_bao[]`: `{ ma, noi_dung }`, `ma` ∈ `DONG_GAN_SANG_FILE_KHAC`, `FILE_TU_CHOI_KHONG_TAO_LAI`, `KHONG_TAO_LAI_TRUNG_BAN_GHI`, `DONG_KHONG_KHOI_PHUC`, `KHONG_CO_GI_DE_THEM` (`:96-111`); `noi_dung` có tiếng Việt sẵn.
  - `co_the_khoi_phuc = so_dong_se_them > 0 || so_file_se_tao_lai > 0` (`:131`).
- **Ánh xạ 4 ô số của canvas:**
  - «Dòng sẽ thêm lại» = `so_dong_se_them`.
  - «Bỏ qua vì đã có (trùng khóa nghiệp vụ)» = `so_dong_da_co` (`:48-52`: khớp `tracking_no, bd10_no, bd8_no, item_confirmed_at`).
  - «Gắn vào file cùng tên đã nạp OK» = `so_dong_gan_sang_file_khac` — **là một phần của `so_dong_se_them`, không cộng thêm** (`:76`: `= c.se_them` của các file `GAN_VAO_FILE_HIEN_HANH`).
  - «Dòng thuộc file khác/không khôi phục được» = `so_dong_khong_khoi_phuc` (file bị từ chối hoặc trùng bản ghi).
  - Tên file = `tap_file[].ten`; ngày hết hạn = `thung_rac.het_han_luc`.
- Backend **chưa trả**: bản ghi file đích (`dich_id`) và số liệu «đã ở nơi khác»; không có dung lượng sao lưu dự kiến.

**Ví dụ (giả):**
```json
{ "nhat_ky_id": 12, "bcvh": "533140", "ngay": "2026-10-14",
  "thung_rac": { "het_han_luc": "2026-11-15T03:14:15.123Z" },
  "so_dong_trong_thung_rac": 1200, "so_dong_se_them": 30, "so_dong_da_co": 1170,
  "so_dong_gan_sang_file_khac": 30, "so_dong_khong_khoi_phuc": 0,
  "so_file_se_tao_lai": 0, "so_file_gan_vao_hien_hanh": 2, "so_file_bo_qua": 0,
  "tap_file": [{ "ten": "HangDen_000000_20261014_083000.csv", "trang_thai": "OK", "hanh_dong": "GAN_VAO_FILE_HIEN_HANH",
    "so_dong_trong_thung_rac": 700, "so_dong_se_them": 30, "so_dong_da_co": 670, "so_dong_gan_sang_file_khac": 30, "so_dong_khong_khoi_phuc": 0 }],
  "canh_bao": [{ "ma": "DONG_GAN_SANG_FILE_KHAC", "noi_dung": "30 dòng sẽ được gắn vào bản ghi file hiện hành CÙNG TÊN…" }],
  "co_the_khoi_phuc": true }
```

---
## Việc 4 — `POST /api/arrivals/thay-the/khoi-phuc/thuc-hien`
- **Body:** `{ "nhat_ky_id": <số>, "xac_nhan": { "ma_bcvh": "<mã>", "ngay": "YYYY-MM-DD" } }`; khoá khác ở gốc → 400 `THAM_SO_SAI` (`arrivals.js:313`). Xác nhận: so sánh `!==` **chính xác** với `bcvh`/`ngay` của lần thay (`thayTheKhoiPhuc.js:141-146`) — phân biệt hoa thường và khoảng trắng; thừa khoá trong `xac_nhan` hoặc thiếu → `XAC_NHAN_SAI`.
- **Thứ tự kiểm:** id (400) → tồn tại (404) → đã khôi phục (409) → hết hạn (409) → xác nhận (400) → khoá chung (409 `DANG_THAY_THE` / `DANG_CO_LUOT_DONG_BO`) → đọc lại + không có gì để thêm (409) → sao lưu (507/500) → giao dịch (500). Hệ quả: gửi thiếu `xac_nhan` cho lần đã khôi phục → `DA_KHOI_PHUC` chứ không phải `XAC_NHAN_SAI`.
- **Thành công (200):** `baoCao` (xem Việc 3, các số «kế hoạch») **+** `khoi_phuc_id`, `so_dong_them` (thực tế thêm), `so_dong_da_co` (thực tế, **ghi đè** số kế hoạch), `so_dong_gan_sang_file_khac` (ghi đè), `so_file_tao_lai`, `sao_luu { tep, kich_thuoc }` (đường dẫn bị bỏ ở route `:318`; **`kich_thuoc` có số byte** ở đây), `da_don_sao_luu` (số bản sao lưu cũ đã xóa), `thoi_gian_ms` (`thayTheKhoiPhuc.js:216-226`).
  - Lưu ý cho giao diện: `so_dong_se_them` và `co_the_khoi_phuc` trong phản hồi thành công vẫn là số **trước** khi thêm (không phải 0); dùng `so_dong_them` để hiển thị kết quả.

**Ví dụ thành công (giả):**
```json
{ "nhat_ky_id": 12, "bcvh": "533140", "ngay": "2026-10-14", "thung_rac": { "het_han_luc": "2026-11-15T03:14:15.123Z" },
  "so_dong_trong_thung_rac": 1200, "so_dong_se_them": 30, "so_dong_da_co": 1170, "so_dong_gan_sang_file_khac": 30, "so_dong_khong_khoi_phuc": 0,
  "so_file_se_tao_lai": 0, "so_file_gan_vao_hien_hanh": 2, "so_file_bo_qua": 0, "tap_file": [], "canh_bao": [], "co_the_khoi_phuc": true,
  "khoi_phuc_id": 3, "so_dong_them": 30, "so_file_tao_lai": 0,
  "sao_luu": { "tep": "truoc-khoi-phuc_533140_2026-10-14_20261017T020000Z.db", "kich_thuoc": 52428800 },
  "da_don_sao_luu": 1, "thoi_gian_ms": 2450 }
```

**Bảng mã lỗi** (`{ error, ma }`; `error` là tiếng Việt sẵn, hiển thị trực tiếp được):

| HTTP | `ma` | Điều kiện kích hoạt | Nguồn |
|---|---|---|---|
| 400 | `THAM_SO_SAI` | `nhat_ky_id` không phải số nguyên dương; khoá lạ ở body/query | `thayTheNhatKy.js:131-135`, `arrivals.js:267-276` |
| 400 | `XAC_NHAN_SAI` | thiếu / sai `ma_bcvh` hoặc `ngay`; thừa khoá | `thayTheKhoiPhuc.js:141-146` |
| 404 | `KHONG_TIM_THAY` | không có lần thay `id` | `thayTheKhoiPhuc.js:38` |
| 409 | `DA_KHOI_PHUC` | đã có bản ghi `thay_the_khoi_phuc` cho lần này (không khôi phục hai lần) | `:39-41` |
| 409 | `THUNG_RAC_HET_HAN` | đã dọn hoặc `het_han_luc <= now` | `:42-44` |
| 409 | `KHONG_CO_GI_DE_KHOI_PHUC` | sau khi giữ khoá: `so_dong_se_them = 0 && so_file_se_tao_lai = 0` | `:166-168` |
| 409 | `DANG_THAY_THE` | đang có «Thay thế ngày» khác chạy (cờ trong bộ nhớ) | `thayTheThucHien.js:219-220` |
| 409 | `DANG_CO_LUOT_DONG_BO` | có lượt đồng bộ SFTP chạy (DB hoặc bộ hẹn giờ) | `thayTheXemTruoc.js:70-76`, `thayTheThucHien.js:168` |
| 507 | `KHONG_DU_CHO_SAO_LUU` | thiếu chỗ (cần ≈ 1,2 × dung lượng DB + 32 MB) hoặc `ENOSPC` | `thayTheThucHien.js:262-285` |
| 500 | `SAO_LUU_LOI` | `db.backup` lỗi / bản sao rỗng | `:280-283` |
| 500 | `KHOI_PHUC_THAT_BAI` | giao dịch lỗi — **đã hoàn lại toàn bộ**, DB y nguyên | `thayTheKhoiPhuc.js:208-211` |
| 500 | `LOI_HE_THONG` | lỗi không lường trước (không phải mã trên) | `arrivals.js:265` |

Mã khác ngoài danh sách PO: `LOI_HE_THONG` (chỉ ở route). Mã `THAM_SO_SAI`/`XAC_NHAN_SAI`/`DANG_THAY_THE`/`KHONG_DU_CHO_SAO_LUU`/`SAO_LUU_LOI` do lớp `ThayTheLoi` (`thayTheThucHien.js:42-48`) và cùng được xử lý bởi `loiNhatKy` (`arrivals.js:259`). **Không có mã nào trả dữ liệu phụ có cấu trúc** (không có thời gian thử lại); thông tin phụ chỉ nằm trong chuỗi `error` (ví dụ «lượt #N» ở `DANG_CO_LUOT_DONG_BO`, MB còn/cần ở `KHONG_DU_CHO_SAO_LUU`). Không có `Retry-After`.

---
## Việc 6 — Khoảng trống so với canvas

| Cần cho canvas | API | Ghi chú / đề xuất |
|---|---|---|
| Cột «Xóa → nạp» | **Có**: `so_dong_xoa`, `so_dong_nap` (+ `so_file_xoa`, `so_file_nap`) | — |
| «Còn N ngày» | **Giao diện tự suy ra** từ `thung_rac.het_han_luc` | `ceil((het_han − now)/86400000)`; dùng giờ máy chủ chuẩn hơn giờ trình duyệt — đề xuất (không làm) trả thêm `so_ngay_con_lai` hoặc `now` ở phản hồi |
| Hết hạn / đã khôi phục | **Có**: `thung_rac.con_khoi_phuc_duoc`, `da_khoi_phuc` | «hết hạn» suy ra: `!con_khoi_phuc_duoc && !da_khoi_phuc` |
| «Không có gì để khôi phục» ở danh sách | **Chưa có** | chỉ biết qua `xem-truoc` (`co_the_khoi_phuc`). Đề xuất: thêm cờ vào danh sách nếu cần ẩn nút |
| 4 ô số xem trước | **Có** (`so_dong_se_them`, `so_dong_da_co`, `so_dong_gan_sang_file_khac`, `so_dong_khong_khoi_phuc`) | lưu ý `gan_sang_file_khac` là tập con của `se_them` |
| Ngày hết hạn | **Có**: `thung_rac.het_han_luc` (xem trước, danh sách, chi tiết) | — |
| Tên file khôi phục | **Có**: `tap_file[].ten` (xem trước/kết quả); chi tiết: `tap_file_cu[].ten` | danh sách không có tên file |
| Dung lượng sao lưu | **Chỉ ở kết quả khôi phục** (`sao_luu.kich_thuoc`); danh sách/chi tiết luôn `null` | đề xuất: lưu kích thước vào nhật ký, hoặc giao diện bỏ cột |
| Tệp sao lưu còn tồn tại không | **Chưa có** | chỉ giữ 5 bản gần nhất; chưa kiểm chứng việc tên trong nhật ký có thể trỏ tệp đã bị dọn |
| Thời gian thử lại khi `DANG_*` | **Chưa có** (chỉ trong chuỗi `error`) | giao diện hiển thị `error` nguyên văn |
| `nguoi.ma` dạng `script:<tên>` | **Có** (không phải HRM) | giao diện không nên giả định `ma` là HRM; `ten` null |

## Chưa kiểm chứng
- Giá trị `nguoi.ma` khi ghi bằng script (đọc từ chú thích `thayTheThucHien.js:62`, chưa kiểm hàm script).
- Giá trị `nguon`/`trang_thai` thực tế trong `tap_file_cu` (chỉ suy từ cột `arrival_import_files`).
- Phản hồi thật của 401/403 trên một tài khoản (chưa gọi API).
