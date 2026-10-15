# SANLUONG-5g-5 — Nhật ký «Thay thế ngày» (API đọc), khôi phục từ thùng rác, dọn dẹp

> Bối cảnh: `16_THAY_THE_NGAY_THUC_HIEN.md` (5g-3, tạo nhật ký + thùng rác), `04_DECISIONS.md` **#87** (quyết định của ticket này).
> Chỉ backend. Giao diện là ticket sau. Chưa chạy với DB / NAS thật. Mọi ví dụ dưới đây dùng số liệu giả (không SHBG / BD thật).

## 1. Mã nguồn
| File | Vai trò |
|---|---|
| `server/lib/thayTheNhatKy.js` | Lõi ĐỌC: `danhSach`, `chiTiet`, `NhatKyLoi`. Chỉ SELECT, không mạng, không mở DB |
| `server/lib/thayTheKhoiPhuc.js` | `xemTruoc` (chỉ đọc) và `khoiPhuc` (một giao dịch đồng bộ). Không nạp thư viện SFTP |
| `server/lib/thayTheThucHien.js` (thêm) | bảng `thay_the_khoi_phuc` trong `ensureThayTheSchema`; `giuKhoaChung` (khoá chung); `saoLuu` xuất ra (tiền tố `truoc-khoi-phuc`); gọi `xoaBoNhoBd10Share` sau thay |
| `server/lib/thayTheXemTruoc.js` (thêm) | `layThuMucSaoLuu()` (nguồn tiêm của test quy định thư mục sao lưu; không đọc cấu hình SFTP) |
| `server/lib/arrivalsQuery.js` (sửa nhỏ) | khoá memo `bd10Share` thêm `MAX(id)` của `arrival_import_files`; xuất `xoaBoNhoBd10Share` |
| `server/routes/arrivals.js` | 4 route mới (dưới) |
| `tests/thay-the-nhat-ky-khoi-phuc.test.js` | 16 ca; đã thêm vào `npm test` |

## 2. Hợp đồng API (tất cả CHỈ ADMIN: 401 không token; 403 TTVH, GDVH, STAFF, TIVI)
Lỗi luôn có dạng `{ "error": "<tiếng Việt>", "ma": "<MÃ>" }`.

### 2.1 `GET /api/arrivals/thay-the/nhat-ky`
Query (tham số lạ → 400): `page` (mặc định 1), `page_size` (mặc định 20, tối đa 100), `bcvh`, `tu_ngay`, `den_ngay` (ngày thuần `YYYY-MM-DD`, theo NGÀY THAY THẾ; khi có cả hai thì `den ≥ tu` và tối đa 92 ngày), `nguoi` (mã người thực hiện, khớp đúng). Mới trước (`thoi_diem` giảm dần). Trả `{ items, pagination: { total, page, page_size, total_pages } }`.
```json
{ "id": 7, "bcvh": "533140", "ngay": "2026-10-10",
  "thoi_diem": "2026-10-14T05:01:00.000Z", "thoi_diem_bangkok": "2026-10-14T12:01:00+07:00",
  "nguoi": { "ma": "ADMIN01", "ten": "Nguyễn Văn A" },
  "so_dong_xoa": 100, "so_dong_nap": 60, "so_file_xoa": 1, "so_file_nap": 2,
  "canh_bao": { "muc": "DO", "da_dong_y_mat": true },
  "mat_that": { "so_shbg": 40, "tren_so_shbg_cu": 100, "ty_le_phan_tram": 40, "can_tren_so_shbg": 40 },
  "ket_qua": "THANH_CONG",
  "sao_luu": { "tep": "truoc-thay-the_533140_2026-10-10_20261014T050100Z.db", "kich_thuoc": null },
  "thung_rac": { "het_han_luc": "2026-11-13T05:01:00.000Z", "con_khoi_phuc_duoc": true, "da_khoi_phuc": false } }
```
`nguoi.ten` tra từ bảng `users` lúc đọc (null nếu là `script:<tên>` hoặc đã xóa tài khoản). `sao_luu.kich_thuoc` luôn `null` (nhật ký 5g-3 không lưu). `con_khoi_phuc_duoc = chưa hết hạn ∧ chưa dọn ∧ chưa khôi phục`.
KHÔNG trả: đường dẫn sao lưu / máy chủ, SHBG / BD, nội dung dòng thùng rác.

### 2.2 `GET /api/arrivals/thay-the/nhat-ky/:id`
Như một mục ở trên, thêm: `tap_file_cu: [{ten, trang_thai, nguon, so_dong}]`, `tap_file_moi: [{ten, trang_thai, so_dong, da_ghi, bo_qua_trung}]`, `thung_rac.so_dong`, `thung_rac.so_file` (số hiện còn), `khoi_phuc` (null hoặc `{thoi_diem, thoi_diem_bangkok, nguoi, so_dong_them, so_dong_da_co, so_dong_gan_sang_file_khac, so_dong_khong_khoi_phuc, so_file_tao_lai, so_file_gan_vao_hien_hanh, so_file_bo_qua}`). `id` sai → 400 `THAM_SO_SAI`; không có → 404 `KHONG_TIM_THAY`.

### 2.3 `POST /api/arrivals/thay-the/khoi-phuc/xem-truoc` — CHỈ ĐỌC
Thân `{ "nhat_ky_id": 7 }` (khoá lạ → 400). Không ghi DB, không khoá, không sao lưu, không mạng.
```json
{ "nhat_ky_id": 7, "bcvh": "533140", "ngay": "2026-10-10", "thung_rac": { "het_han_luc": "2026-11-13T05:01:00.000Z" },
  "so_dong_trong_thung_rac": 100, "so_dong_se_them": 40, "so_dong_da_co": 60,
  "so_dong_gan_sang_file_khac": 0, "so_dong_khong_khoi_phuc": 0,
  "so_file_se_tao_lai": 1, "so_file_gan_vao_hien_hanh": 0, "so_file_bo_qua": 0,
  "tap_file": [ { "ten": "HangDen_533140_20261010_235959.csv", "trang_thai": "OK", "hanh_dong": "TAO_LAI",
                  "so_dong_trong_thung_rac": 100, "so_dong_se_them": 40, "so_dong_da_co": 60,
                  "so_dong_gan_sang_file_khac": 0, "so_dong_khong_khoi_phuc": 0 } ],
  "canh_bao": [], "co_the_khoi_phuc": true }
```
`hanh_dong`: `TAO_LAI` (tạo lại bản ghi file với id gốc nếu còn trống) · `GAN_VAO_FILE_HIEN_HANH` (đã có bản OK / EMPTY CÙNG TÊN → dòng gắn vào đó) · `BO_QUA_TU_CHOI` (REJECTED / CONFLICT, KHÔNG tạo lại) · `KHONG_TAO_LAI_TRUNG_BAN_GHI` (đã có bản ghi cùng tên + mã băm).
`canh_bao[].ma`: `DONG_GAN_SANG_FILE_KHAC`, `FILE_TU_CHOI_KHONG_TAO_LAI`, `KHONG_TAO_LAI_TRUNG_BAN_GHI`, `DONG_KHONG_KHOI_PHUC`, `KHONG_CO_GI_DE_THEM` (mỗi mục `{ma, noi_dung}`).

### 2.4 `POST /api/arrivals/thay-the/khoi-phuc/thuc-hien`
Thân `{ "nhat_ky_id": 7, "xac_nhan": { "ma_bcvh": "533140", "ngay": "2026-10-10" } }`. **`xac_nhan.ngay` dạng `YYYY-MM-DD`** (như «Thay thế»; giao diện đổi từ dd/mm/yyyy). Thành công 200: các trường của xem trước + `khoi_phuc_id`, `so_dong_them`, `so_dong_da_co`, `so_dong_gan_sang_file_khac`, `so_file_tao_lai`, `sao_luu { tep, kich_thuoc }` (chỉ tên tệp), `da_don_sao_luu`, `thoi_gian_ms`.

| Mã | HTTP | Nghĩa |
|---|---|---|
| `THAM_SO_SAI` | 400 | `nhat_ky_id` / query sai, khoá lạ |
| `XAC_NHAN_SAI` | 400 | thiếu / sai mã BCVH hoặc ngày, khoá lạ trong `xac_nhan` |
| `KHONG_TIM_THAY` | 404 | không có lần thay |
| `THUNG_RAC_HET_HAN` | 409 | quá hạn 30 ngày hoặc đã dọn |
| `DA_KHOI_PHUC` | 409 | đã khôi phục (không hai lần) |
| `KHONG_CO_GI_DE_KHOI_PHUC` | 409 | không có dòng / file nào cần thêm |
| `DANG_THAY_THE` | 409 | đang có «Thay thế» / «Khôi phục» khác (cờ trong tiến trình) |
| `DANG_CO_LUOT_DONG_BO` | 409 | đang có lượt đồng bộ SFTP / hẹn giờ `DANG_CHAY` / hàng khoá còn hiệu lực |
| `KHONG_DU_CHO_SAO_LUU` | 507 | thiếu chỗ sao lưu |
| `SAO_LUU_LOI` | 500 | sao lưu lỗi (chưa thêm gì) |
| `KHOI_PHUC_THAT_BAI` | 500 | giao dịch lỗi, đã hoàn lại toàn bộ |

Hẹn giờ ở trạng thái `TAM_DUNG` KHÔNG chặn khôi phục (không chạm mạng). Mã khoá dùng mã hiện hành của cụm «Thay thế» (không phải `DANG_CHAY` / `TAM_DUNG` của màn «Nạp dữ liệu nguồn»).

## 3. Ngữ nghĩa khôi phục (PO chốt 15/10/2026)
- **BỔ SUNG, không xóa gì.** Dòng sống và bản ghi file sống không bị đổi (kể cả `row_count`); không đụng `phat_status_current`; không chạm NAS.
- **Dòng**: `INSERT OR IGNORE` theo khoá nghiệp vụ `ux_arrival_items_key` = `(tracking_no, bd10_no, bd8_no, COALESCE(item_confirmed_at,''))`. **`id` dòng gốc KHÔNG được giữ** (`arrival_items.id` không AUTOINCREMENT nên id đã bị dùng lại sau khi thay) — SQLite cấp id mới. Xem trước đếm bằng `NOT EXISTS` trên cùng khoá.
- **Bản ghi file**: file OK / EMPTY trong thùng rác chưa có bản OK / EMPTY cùng tên → tạo lại với **id gốc** (nếu còn trống) và mọi cột gốc. Đã có bản OK / EMPTY cùng tên (thường là file SFTP vừa nạp) → **gắn dòng vào bản ghi đó**; số dòng gắn sang file khác được nêu ở xem trước, ở phản hồi và ở nhật ký khôi phục (`so_dong_gan_sang_file_khac`); `row_count` không đổi.
- **REJECTED / CONFLICT** trong thùng rác: không tạo lại (để lõi SFTP không chặn nạp lại bằng `DA_TU_CHOI`); chỉ liệt kê.
- **Thứ tự**: id + trạng thái + xác nhận → khoá chung (cùng cờ và cùng hàng `sftp_sync_runs` với «Thay thế») → `db.backup()` toàn DB (`truoc-khoi-phuc_<bcvh>_<ngày>_<UTC>.db`, cùng thư mục, cùng hạn giữ 5 bản chung với bản sao lưu «Thay thế») → MỘT giao dịch đồng bộ (tính lại → tạo lại file → thêm dòng → ghi `thay_the_khoi_phuc`) → vô hiệu memo `bd10Share` → dọn → nhả khoá.
- **Nhật ký khôi phục**: bảng `thay_the_khoi_phuc` (`nhat_ky_id UNIQUE`, chỉ thêm, `CREATE TABLE IF NOT EXISTS`). **Không** dùng `thay_the_nhat_ky.ket_qua = 'DA_HOAN_TAC'` (khôi phục không phải hoàn lại). Thùng rác giữ đến hạn.
- Không khôi phục `ward_bdx_map` (dẫn xuất theo khoá; lần nạp mới đã cập nhật).

## 4. `bd10Share` (Việc 4)
Memo cũ nhớ theo `(COUNT(*), MAX(id))` của `arrival_items`; `id` dòng không AUTOINCREMENT nên «thay» có thể cho lại đúng cặp → giá trị cũ. Nay khoá thêm `MAX(id)` của `arrival_import_files` (AUTOINCREMENT, luôn tăng khi nạp) và «Thay thế» / «Khôi phục» gọi `xoaBoNhoBd10Share(db)` tường minh sau khi giao dịch xong. Không thêm memo mới. Chi phí `MAX(id)` là tra khoá chính (O(1)); ca đo trong test: không đáng kể so với `COUNT(*)`. Giới hạn đã biết: sửa trực tiếp `bd10_confirmed_at` bằng SQL tay (không qua nạp / thay / khôi phục) vẫn không làm memo tính lại — hành vi có từ trước, có ca đối chứng trong test.

## 5. Điều chưa chắc / để lại
- Chưa chạy với DB / NAS thật. Giao dịch khôi phục chỉ gồm SQL `INSERT … SELECT` (ước vài chục mili-giây trên DB giả; DB thật chậm hơn ~10×, chưa đo); `db.backup()` bất đồng bộ.
- `sao_luu.kich_thuoc` ở nhật ký luôn `null` vì lược đồ 5g-3 không lưu kích thước (muốn có phải thêm cột ở ticket riêng).
- Ngoài phạm vi, KHÔNG làm: «nạp bổ sung» 01–09/10; danh sách loại trừ file ADMIN bỏ tích trong cửa sổ 3 ngày; module ngưỡng; giao diện.
