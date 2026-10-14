# 📮 Module «Xử lý và tỷ lệ phát» (PHAT-1, PHAT-1b: backend)

> Nguồn quy tắc chuẩn: PHAT-0 (PO chốt 13/10/2026). File này tóm tắt quy tắc, bảng và API **đã làm ở PHAT-1** (chặng 1 và 2).
> Quyết định đi kèm: `04_DECISIONS.md` #75, #77 (quyền sở hữu bản kiểm tra, PHAT-1b). Không có dữ liệu thật (SHBG, BD8, BD10) trong file này.
> Chưa làm: giao diện (PHAT-2), nối Dashboard / tivi (PHAT-3).

## 1. Quy tắc cốt lõi
1. **Mẫu số** = «Sản lượng đến» đã có: SHBG đến BCVH ngày D (quy tắc R2, loại trùng) — dùng đúng `buildCountedCte` như `tong-quan-den` của dashboard. Tỷ lệ luôn khớp `san_luong.buu_gui` cùng ngày (có test so khớp).
2. **Trạng thái gắn với (BCVH, SHBG)**, không gắn với ngày. 5 trạng thái: `PTC` Phát thành công · `PKTC` Phát không thành công · `CHUYEN_HOAN` Chuyển hoàn · `CHUA_CO_TT` Chưa có thông tin phát · `LAC_HUONG` Lạc hướng. SHBG đã đến mà chưa có trạng thái = `CHUA_CO_TT`.
3. **Không ai tự khai giờ.** `nhap_luc` (UTC, `YYYY-MM-DDTHH:MM:SSZ`) do máy chủ ghi lúc commit; không tham số nào cho client đặt. Các API trả thêm dạng múi `Asia/Bangkok` (`*_bangkok`, `YYYY-MM-DD HH:mm:ss`).
4. **Dòng hợp lệ vẫn nhập, dòng lỗi giữ lại** trong bản kiểm tra (giữ 7 ngày). Nhập từng phần; dòng đã nhập bị khóa (`DA_NHAP`).
5. **Không điền giờ phát từng bưu gửi**; cột `gio_phat` của `phat_status_current` chừa trống cho nguồn tự động sau này.
6. **Mức cập nhật kết quả phát** = 100% trừ tỷ lệ `CHUA_CO_TT` (khoá `muc_cap_nhat`, phân số 0..1).

## 2. Kiểm tra từng dòng
SHBG chuẩn hoá (cắt khoảng trắng, viết hoa); trạng thái so khớp nhãn hoặc mã không phân biệt hoa/thường/dấu (không đoán gần giống). Ô công thức trong file nhập: lấy `result` nếu là chuỗi; ô lỗi công thức → `SAI_DINH_DANG` («ô chứa lỗi công thức»).

| Kết quả | Mã lỗi | Khi nào |
|---|---|---|
| `BO_QUA_TRONG` | — | Ô Trạng thái trống (thắng mọi lỗi khác; không tính vào nhóm trùng) |
| `LOI` | `SAI_DINH_DANG` | SHBG trống / không khớp `^[A-Z]{2}[0-9]{9}[A-Z]{2}$` (hậu tố nước ngoài hợp lệ) / ô lỗi công thức |
| `LOI` | `TRUNG_SHBG` | SHBG xuất hiện > 1 lần: gắn cho **mọi** dòng trùng, ghi rõ số dòng |
| `LOI` | `TT_NGOAI_DS` | Trạng thái không thuộc danh sách |
| `LOI` | `KHONG_CO_TRONG_DEN` | Không có trong dữ liệu đến của BCVH (gồm SHBG của BCVH khác), hoặc «có trong dữ liệu nhưng chưa có giờ đến BCVH» |
| `LOI` | `KHONG_DOI` | Trùng trạng thái hiện có (chưa có = `CHUA_CO_TT`) |
| `HOP_LE` | — | Còn lại; có thể kèm **cảnh báo vàng** (không chặn) |
| `DA_NHAP` | — | Đã ghi ở một đợt |

Một dòng chỉ ghi **một** mã lỗi, theo thứ tự: `SAI_DINH_DANG` > `TRUNG_SHBG` > `TT_NGOAI_DS` > `KHONG_CO_TRONG_DEN` > `KHONG_DOI`.
**Cảnh báo vàng** (`canh_bao`, nối bằng « · »): chuyển bất thường (bảng ở `server/config/phat.js`: từ `PTC`/`CHUYEN_HOAN` sang trạng thái khác; từ `PKTC`/`LAC_HUONG` về `CHUA_CO_TT`) và «Ghi chú bị cắt (tối đa 500 ký tự)» (ghi chú dài hơn 500 ký tự bị cắt, vẫn nhập).
**Lỗi cần sửa** tách khỏi **không đổi**: `tong_hop.loi_can_sua`, `tong_hop.khong_doi` (`loi` = tổng hai loại).

## 3. Bảng (`server/lib/phat.js` tự tạo khi khởi động; idempotent, thêm cột cho DB cũ)
| Bảng | Nội dung |
|---|---|
| `phat_batches` | Đợt nhập: bcvh, user_id, `nhap_luc`, ten_file, sha256, so_nhap, so_bo_qua, **so_loi** (lỗi cần sửa), **so_khong_doi**, trang_thai (`da_nhap`/`da_hoan_tac`), hoan_tac_luc, hoan_tac_boi, draft_id |
| `phat_status_current` | Trạng thái hiện tại, khóa (bcvh, shbg): trang_thai, ghi_chu, batch_id, nhap_luc, `gio_phat` (trống) |
| `phat_status_history` | Mỗi lần ghi: trang_thai, trang_thai_truoc (rỗng = chưa có), ghi_chu, batch_id, nhap_luc. Hoàn tác thêm dòng mang `batch_id` của đợt bị hoàn tác |
| `phat_drafts`, `phat_draft_rows` | Bản kiểm tra (hết hạn sau 7 ngày, dọn khi khởi động và khi truy cập) và các dòng của nó |

Giới hạn (`server/config/phat.js`): 20.000 dòng, 10 MB, ghi chú 500 ký tự. Biến môi trường `PHAT_MAX_DONG` chỉ để HẠ giới hạn dòng (test); không đặt thì dùng 20.000.

## 4. API (`/api/phat/*`)
**Quyền nhập** (file mẫu, bản kiểm tra, commit): ADMIN, TTVH mọi BCVH; GDVH chỉ BCVH được gán trong `user_bcvh` (chưa gán → 403); STAFF, TIVI → 403 (TIVI sẽ được cho phép ở PHAT-3). Dùng `allowedBcvhCodes` của 3c-3.

**Quyền sở hữu bản kiểm tra** (PHAT-1b, #77): bản thuộc NGƯỜI TẠO. Thứ tự kiểm tra ở `layDraft` (`routes/phat.js`):
1. Không có / đã hết hạn → **404**.
2. Không phải người tạo: người không phải ADMIN/TTVH → **404** (cùng câu với «không tồn tại», không lộ sự tồn tại, kể cả GDVH cùng BCVH hay BCVH khác); ADMIN/TTVH chỉ được **xem** (`GET /drafts/:id`, `GET /drafts/:id/rows`), mọi điểm cuối còn lại (`PATCH/DELETE rows`, `fill`, `assign-list`, `errors.xlsx`, `commit`) → **403** «chỉ xem được, không sửa hay nhập thay» (không nhập thay không ghi dấu).
3. Người tạo vẫn phải được nhập BCVH đó: GDVH bị bỏ gán → **403** ngay (kể cả đọc và danh sách).
**Xoá cả bản** (`DELETE /drafts/:id`) là ngoại lệ: ADMIN, TTVH xoá được mọi bản (không phải sửa nội dung); GDVH chỉ bản của mình và phải còn được nhập BCVH đó.
STAFF, TIVI bị chặn từ cổng nhập (403, trước cả bước 1). Mọi thao tác ghi vào `data/security.log` (không ghi nội dung dòng): `phat_template`, `phat_draft_create`, `phat_draft_edit`, `phat_draft_delete`, `phat_draft_errors`, `phat_commit`, `phat_undo`.

| Phương thức, đường dẫn | Việc |
|---|---|
| `GET /template?bcvh=&from=&to=&scope=chua\|tat-ca` | `.xlsx` mỗi SHBG một dòng. Cột khóa: SHBG, Ngày đến, Khung giờ đến, Đường thư (trống = «(không có)»), Trạng thái hiện có; cột điền: Trạng thái (danh sách chọn 5 nhãn), Ghi chú. Sheet ẩn `_meta`. Khóa sheet không mật khẩu; lọc được, sắp xếp không |
| `POST /drafts?bcvh=&ten_file=` | Thân là file thô `.xlsx`/`.csv` UTF-8 (≤ 10 MB). Tạo bản kiểm tra → `{ id, bcvh, ten_file, tao_luc, het_han_luc, tong_hop }` |
| `GET /drafts?bcvh=<mã>[&tat_ca=1]` | **PHAT-1b.** Bản kiểm tra CHƯA hết hạn của người gọi theo BCVH, mới nhất trước; `tat_ca=1` (chỉ ADMIN, TTVH; GDVH → 403) xem của mọi người. Mỗi phần tử: `id, bcvh, ten_file, tao_luc, tao_luc_bangkok, het_han_luc, nguoi_tao, cua_toi, tong_dong, hop_le, bo_qua, loi, da_nhap` (cùng nghĩa `tong_hop` của `GET /drafts/:id`; `bo_qua` = `bo_qua_trong`, `loi` = mọi dòng lỗi gồm «không đổi»). KHÔNG trả nội dung dòng. Quyền như điểm cuối nhập; `bcvh` bắt buộc; `tat_ca` chỉ nhận `0`/`1`; tham số lạ → 400 |
| `DELETE /drafts/:id` | **PHAT-1b.** Xoá cả bản kiểm tra và các dòng của nó → `{ id, da_xoa: true, so_dong }`. Người tạo (còn quyền nhập BCVH đó) hoặc ADMIN, TTVH (mọi bản); người khác 404; STAFF, TIVI 403. KHÔNG đụng đợt nhập (`phat_batches` giữ `draft_id` cũ), trạng thái hiện tại, lịch sử; hoàn tác đợt vẫn chạy (chỉ dùng `phat_status_history`). Nhật ký `phat_draft_delete` (không ghi nội dung dòng) |
| `GET /drafts/:id` · `GET /drafts/:id/rows?ket_qua=&ma_loi=&q=&canh_bao=&page=&size=` | Tổng hợp · danh sách dòng (size ≤ 200) |
| `PATCH /drafts/:id/rows` `{rows:[{id,trang_thai?,ghi_chu?}]}` · `DELETE …/rows` `{ids}` hoặc `{filter}` · `POST …/fill` `{trang_thai, ids\|filter}` · `POST …/assign-list` `{trang_thai, shbg:[…]}` | Biên tập; kiểm tra lại dòng bị ảnh hưởng (kể cả hết trùng khi xoá bớt); dòng `DA_NHAP` khóa |
| `GET /drafts/:id/errors.xlsx[?loai_tru=KHONG_DOI]` | File lỗi cùng cấu trúc file mẫu + «Số dòng trong file gốc», «Lý do lỗi»; nhập lại thẳng được. `loai_tru`: danh sách mã lỗi (phẩy) bỏ khỏi file |
| `POST /drafts/:id/commit` `{mode:"hop-le"}` hoặc `{mode:"da-chon", ids}` | Một giao dịch, kiểm tra lại từng dòng tại thời điểm commit, chỉ ghi dòng vẫn hợp lệ. Trả `batch_id, nhap_luc, nhap_luc_bangkok, so_nhap, khong_ghi, loi_can_sua, khong_doi, bo_qua_trong, ty_le_truoc, ty_le_sau, tong_hop`. Không còn dòng nào → 400 (không tạo đợt) |
| `GET /batches?bcvh=&page=&size=` | Danh sách đợt (ai, giờ UTC + Bangkok, tên file, sha256, số nhập/bỏ qua/lỗi/không đổi, đã hoàn tác chưa, `co_quyen_hoan_tac`). Chỉ BCVH được phép |
| `POST /batches/:id/undo` | Hoàn tác đợt. ADMIN, TTVH, hoặc chính người nhập (còn được phép với BCVH). **409** (kèm `so_shbg_vuong`, `dot_vuong`) nếu đợt sau chưa hoàn tác đã đổi SHBG của đợt này. Khôi phục trạng thái ngay trước (kể cả ghi chú, đợt, giờ nhập; xoá nếu trước đó chưa có), ghi lịch sử, mở khóa dòng bản kiểm tra |
| `GET /ty-le?bcvh=<mã\|all>&ngay=YYYY-MM-DD` | ADMIN, TTVH, GDVH (mọi BCVH, #72); STAFF, TIVI 403 |

**`GET /ty-le`** trả: `bcvh, ngay, cung_ngay, mau_so, theo_trang_thai{PTC,PKTC,CHUYEN_HOAN,CHUA_CO_TT,LAC_HUONG: {nhan, so, ty_le}}, muc_cap_nhat, so_lieu_den_luc, so_lieu_den_luc_bangkok, theo_khung_gio_den[6]{ma, nhan, so_den, theo_trang_thai, muc_cap_nhat}, ton_cho{moc_tinh_den, tong, theo_nhom[4]{ma, nhan, so}}`.
- Không có `ngay`: «hôm nay» = ngày file OK mới nhất **của từng BCVH** (#70); `all` gộp các BCVH có dữ liệu, `cung_ngay=false` khi lệch ngày.
- `so_lieu_den_luc` = giờ nhập của đợt gần nhất chưa hoàn tác (`null` nếu chưa có).
- Khung giờ đến theo `arrival_at`: trước 10h, 10–12h, 12–14h, 14–16h, 16–18h, sau 18h.
- `ton_cho`: SHBG chưa có thông tin phát, chia theo (mốc − giờ đến), mốc = giờ đến lớn nhất của ngày xét (cùng quy ước DASH-1): dưới 2 giờ, 2–4 giờ (gồm đúng 2 giờ), trên 4 giờ (gồm đúng 4 giờ); đến từ ngày trước = qua ngày (xét lùi tối đa 30 ngày).

## 5. Chưa làm (để sau)
Diễn biến theo mốc nhập; phát trong ngày / sau 1 / 2 ngày; giờ phát; endpoint cho TIVI; mọi giao diện (PHAT-2, PHAT-3); nhập tay từng SHBG; nguồn tự động; danh mục lý do; ADMIN sửa «số liệu tính đến lúc».
