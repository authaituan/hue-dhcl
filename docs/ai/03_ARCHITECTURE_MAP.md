# 🗺️ BẢN ĐỒ KIẾN TRÚC

Chỉ trỏ đường tới file — không dump code. Cập nhật khi thêm/bớt route, bảng, màn hình.

## 1. Cấu trúc thư mục
```
server/
  index.js              # khởi động Express: lớp bảo mật -> bắt buộc token cho /api/* -> mount router -> phục vụ dist/ -> 404
  db.js                 # SQLite (data/hue-dhcl.db): tạo bảng + seed Dashboard mặc định
  roles.js              # 4 vai trò (ROLES, VALID_ROLES, VIEWER_ROLES, isValidRole) — NƠI DUY NHẤT định nghĩa vai trò
  auth.js               # JWT, băm mật khẩu, authRequired (tra DB mỗi request) / requireRoles(...) / requireAdmin
  security.js           # lọc IP (CMS_ALLOWED_IPS), header bảo mật, trang 404, nhật ký data/security.log
  pages/404.html        # trang 404 (CSS nhúng, băm CSP lúc khởi động)
  lib/helpers.js        # parseFloatOrNull, normalizeStr (bỏ dấu)
  lib/orgImport.js      # resolveOrCreateOrgChain: tạo/cập nhật Tỉnh -> BĐX -> Bưu cục khi import mạng lưới
  lib/dashboardSources.js   # whitelist nguồn/nhóm/bộ lọc của Dashboard động + computeWidgetData + buildMeta
  lib/dashboardDefaults.js  # bộ ô mặc định + seed/reset
  lib/arrivalsImport.js # "Hàng đến": schema + nạp 1 file / 1 thư mục CSV, ánh xạ phường→BĐX, getMissingBatches
  lib/arrivalsQuery.js  # "Hàng đến": NƠI DUY NHẤT cài quy tắc đếm sản lượng (buildCountedCte) + kiểm tham số + các truy vấn API
  lib/userBcvh.js       # bảng user_bcvh (gán GDVH ↔ BCVH): ensureUserBcvhSchema, getAssignedBcvh, replaceAssignedBcvh
  lib/adminGuard.js     # chặn hạ/khoá ADMIN hoạt động cuối cùng
  lib/dashboardQuery.js # Dashboard điều hành: 6 BCVH (DASHBOARD_BCVH), ngưỡng (DASHBOARD_THRESHOLDS), overview/trend/wards-surge/center — gọi lại buildCountedCte
  routes/auth.js        # đăng nhập (+ rate-limit)
  routes/users.js       # quản lý tài khoản + tìm kiếm người phụ trách
  routes/network.js     # quản lý mạng lưới (danh sách / import / export / sửa / xoá bưu cục)
  routes/organization.js    # danh sách BĐX, bưu cục (chỉ đọc, cho dropdown)
  routes/dashboard.js       # số đếm tổng quan
  routes/dashboardWidgets.js # Dashboard động: CRUD ô, dữ liệu, xem trước
  routes/arrivals.js    # API "Hàng đến" + Dashboard điều hành (chỉ GET, ADMIN + TTVH + GDVH)
src/
  App.jsx               # khung app: đăng nhập / Sidebar / Header / 3 màn hình
  utils/api.js          # apiFetch/apiFetchJson, lưu token, sự kiện hết phiên
  components/           # LoginView, Sidebar, Header, DashboardView, NetworkListView, UserAdminView + modal người dùng
  components/dashboard/ # ChartWidget + editor/ (ChartWidgetModal, SystemWidgetModal, WidgetToolbar, DashboardEditorToolbar, ConfirmModal)
scripts/import-seed.js  # nạp tài khoản + mạng lưới từ DB hệ thống cũ vào data/hue-dhcl.db (06_DEPLOYMENT.md mục 5)
scripts/import-arrivals.js  # nạp CSV "Hàng đến" (file/thư mục), --check-days; --db để trỏ DB khác
scripts/set-ward-map.js     # gán tay phường/xã → BĐX (MANUAL)
scripts/migrate-roles.js    # chuyển MANAGER → TTVH một lần (dry-run mặc định, --apply sao lưu + đổi; 06_DEPLOYMENT.md mục 7)
tests/                  # node --test; helpers/serverHarness.js chạy server thật trên DB tạm
```

## 2. Cơ sở dữ liệu (`server/db.js`)
| Bảng | Vai trò | Khoá ngoại |
|---|---|---|
| `province_post_offices` | Bưu điện Tỉnh/TP | — |
| `commune_post_offices` | Bưu điện Xã (BĐX) | `province_id` → province |
| `post_offices` | Bưu cục (MBC) + thông tin mạng lưới, `responsible_user_id` (không FK cứng) | `commune_id` → commune |
| `users` | Tài khoản đăng nhập (khoá theo `hrm_code`), `deactivated_at` = khoá | `post_office_id` → post_offices |
| `user_bcvh` | Gán GDVH ↔ BCVH (nhiều-nhiều; PK `(user_id, bcvh_code)`; mã thuộc `DASHBOARD_BCVH`). Xoá khi tài khoản rời vai trò GDVH. Chỉ giới hạn xuất file (3c-3) | `user_id` → users |
| `dashboard_widgets` | Cấu hình ô Dashboard (SYSTEM/CHART), dùng chung mọi người | — |
| `arrival_import_files` | Nhật ký nạp file "Hàng đến": tên, mã BC nhận, ngày/giờ file, sha256, số dòng, `status` OK/EMPTY/REJECTED/CONFLICT, lỗi/cảnh báo | — |
| `arrival_items` | 1 dòng CSV = 1 dòng: cột gốc (chữ) + `arrival_at`/`arrival_at_basis`/`arrival_evidence_count`, ngày dẫn xuất từng mốc, `ward_key`. Lượt đến = `(tracking_no, bd10_no, bd8_no)` | `import_file_id` → arrival_import_files |
| `ward_bdx_map` | Phường/xã (`ward_key`) → BĐX, `source` AUTO/MANUAL | `commune_id` → commune |

## 3. API (mọi `/api/*` trừ đăng nhập đều cần token)
| Route | Quyền | File |
|---|---|---|
| `POST /api/auth/login` | công khai (rate-limit) | `routes/auth.js` |
| `GET/POST /api/users`, `PUT /api/users/:id`, `.../reset-password`, `.../deactivate`, `.../reactivate`, `GET/PUT /api/users/:id/bcvh` (gán BCVH cho GDVH) | ADMIN | `routes/users.js` |
| `GET /api/users/search?q=` | ADMIN | `routes/users.js` |
| `PUT /api/users/me/password` | mọi vai trò (đã đăng nhập) | `routes/users.js` |
| `GET /api/network`, `GET /api/network/export-data` | ADMIN, TTVH, GDVH | `routes/network.js` |
| `POST /api/network/import` | ADMIN | `routes/network.js` |
| `PUT/DELETE /api/network/post-offices/:id` | ADMIN | `routes/network.js` |
| `GET /api/organization/communes`, `GET /api/organization/post-offices?communeId=` | đã đăng nhập | `routes/organization.js` |
| `GET /api/dashboard/stats` | đã đăng nhập | `routes/dashboard.js` |
| `GET /api/dashboard/widgets`, `GET /api/dashboard/widgets-data` | đã đăng nhập | `routes/dashboardWidgets.js` |
| `GET widgets-meta`, `POST widgets-preview`, `POST/PUT/DELETE widgets`, `PUT widgets-order`, `POST widgets-reset` | ADMIN | `routes/dashboardWidgets.js` |
| `GET /api/arrivals/meta` — mã BC nhận (tên, loại hình), phường/xã có dữ liệu, khoảng thời gian, tiêu chí ngày | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/summary` — sản lượng, khối lượng, túi/kiện, hàng nặng + tỷ lệ (`heavy_g`), địa bàn phát; `canh_bao` chỉ ADMIN | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-route` — theo đường thư: sản lượng, tỷ trọng, giờ nhiều nhất, hàng nặng + tỷ lệ; nhóm riêng "Chưa có tên đường thư" (`heavy_g`) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-service` — theo dịch vụ (mã + tên): sản lượng, tỷ trọng, khối lượng TB, hàng nặng + tỷ lệ; nhóm riêng "Chưa có tên dịch vụ" (`heavy_g`) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-time?granularity=day\|hour` — đủ mốc trong khoảng (`hour` ≤ 7 ngày) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-ward` — theo phường/xã nơi phát, giảm dần, tỷ trọng; nhóm Phường/xã tỉnh khác, Chưa xác định tỉnh, Chưa xác định phường/xã | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/quality-mocs` — 7 tổ hợp mốc BCVH + `tong_hop` (đủ trạng thái, có XN túi / XND BD10 / XN bưu gửi, không XNĐ BD10) + tỷ lệ có từng mốc + bưu gửi không có mốc | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/lookup?tracking_no=` — các dòng của 1 SHBG, mốc dùng làm thời điểm đến | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/items` — bưu gửi đã đếm (1 dòng/SHBG), `page_size` ≤ 200 (kiểm tra) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/dashboard/overview?date=&as_of=&heavy_g=` — 6 BCVH hôm nay: sản lượng, hôm qua, bình thường (≤4 ngày cùng thứ) + `so_tuan`/`it_du_lieu`, lệch %, hàng nặng, đến sau 15h, trung vị XN túi→XN bưu gửi; dòng tổng; `issues` (điểm cần điều hành); `nguong` | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/dashboard/trend?date=&as_of=` — 7 ngày trước + ngày xét; `theo_gio` 06–17 so với trung bình cùng giờ | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/dashboard/wards-surge?date=&as_of=` — ≤ 5 phường/xã Huế tăng nhiều nhất so với bình thường | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/dashboard/center?date=&from=&to=&heavy_g=` — Trung tâm (mặc định 7 ngày): top 5 đường thư + còn lại, dịch vụ, chất lượng khai thác | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/exceptions` — ≤ 50 bưu gửi ngoại lệ (BD10 sớm, không mốc, đến lại) | ADMIN | `routes/arrivals.js` |
| `GET /api/arrivals/import-status` — file theo trạng thái, REJECTED/CONFLICT, ngày thiếu đợt | ADMIN | `routes/arrivals.js` |

Bộ lọc chung (trừ meta, lookup, import-status): `from`, `to` (bắt buộc, `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM`/`T`, gồm 2 đầu), `date_basis` =
`arrival` (mặc định) / `bag` / `bd10` / `item`, `receiver_code` (nhiều giá trị), `ward_key`. Sản lượng = SHBG khác nhau, đếm tại lần đến sớm nhất
trong khoảng (`04_DECISIONS.md` #28–#35). Hàng nặng: khối lượng dòng đại diện > `heavy_g` (mặc định 2.500 g, 500–30.000) — #36–#40.

Dashboard điều hành (`/api/arrivals/dashboard/*`): `date` (`YYYY-MM-DD`, mặc định ngày file mới nhất), `as_of` (`HH:MM`, mặc định giờ file nạp mới nhất của `date`); mọi so sánh dùng cùng khoảng 00:00 → `as_of` — `04_DECISIONS.md` #41–#47. "Điểm cần điều hành" (lãnh đạo) khác cảnh báo dữ liệu ADMIN-only.



### Vai trò và ma trận quyền (`server/roles.js`, `04_DECISIONS.md` #49–#54)
Bốn vai trò (chuỗi ASCII, chữ hoa): `ADMIN`, `TTVH`, `GDVH`, `STAFF`. `server/roles.js` là nơi duy nhất định nghĩa (`ROLES`, `VALID_ROLES`,
`VIEWER_ROLES = ADMIN, TTVH, GDVH`, `isValidRole`). Middleware `authRequired` (`server/auth.js`) tra DB mỗi request: lấy `role` + `deactivated_at` từ `users`
(không tin vai trò trong token) — khoá/không còn → 401, vai trò ngoài danh sách (vd `MANAGER` chưa chuyển đổi) → 403. `requireRoles(...roles)` nhận danh sách tường minh
(`requireAdmin` = `requireRoles('ADMIN')`); không còn quy tắc "khác STAFF".

| Nhóm route | ADMIN | TTVH | GDVH | STAFF |
|---|---|---|---|---|
| `/api/users*` (trừ `PUT /users/me/password`), `/users/:id/bcvh` | ✔ | 403 | 403 | 403 |
| `PUT /api/users/me/password` | ✔ | ✔ | ✔ | ✔ |
| `GET /api/network`, `/network/export-data` | ✔ | ✔ | ✔ | 403 |
| `POST /network/import`, `PUT/DELETE /network/post-offices/:id` | ✔ | 403 | 403 | 403 |
| `/api/arrivals/*` (meta, summary, by-*, quality-mocs, items, lookup, dashboard/*) | ✔ | ✔ | ✔ | 403 |
| `/api/arrivals/exceptions`, `/import-status`, trường `canh_bao` của `/summary` | ✔ | 403 (không có `canh_bao`) | 403 (không có `canh_bao`) | 403 |
| `GET /api/dashboard/widgets*` (đọc) | ✔ | ✔ | ✔ | ✔ |
| ghi/meta/preview/order/reset `/api/dashboard/widgets*` | ✔ | 403 | 403 | 403 |
| `/api/organization/*`, `/api/dashboard/stats` (giữ nguyên) | ✔ | ✔ | ✔ | ✔ |
Không token → 401 ở mọi route trừ đăng nhập. Chặn ở `routes/users.js`: `role` ngoài danh sách → 400; tự đổi vai trò / tự khoá mình → 400; hạ / khoá ADMIN hoạt động cuối cùng → 400
(`server/lib/adminGuard.js`). `GET /api/users` trả thêm `bcvh_codes`. `getAssignedBcvh(userId)` (`server/lib/userBcvh.js`) cho ticket xuất file 3c-3.
Chuyển đổi vai trò cũ trên DB thật: `scripts/migrate-roles.js` (`06_DEPLOYMENT.md` mục 7).

## 4. Giao diện
| Menu | Màn hình | Ai thấy |
|---|---|---|
| Dashboard | `DashboardView.jsx` (chế độ chỉnh sửa chỉ ADMIN) | mọi người |
| Quản lý mạng lưới | `NetworkListView.jsx` (danh sách + Thêm/Sửa/Xoá + Import/Export Excel) | ADMIN, TTVH, GDVH (menu hiện chung với "quản lý"; STAFF không thấy) |
| Quản lý người dùng | `UserAdminView.jsx` | menu hiện cho ADMIN/TTVH/GDVH, nhưng API chỉ ADMIN (TTVH/GDVH nhận 403 — dọn menu ở ticket giao diện) |

## 5. Dashboard động
- Nguồn duy nhất: `POST_OFFICE` — nhóm theo `type`, `operational_status`, `commune`, `new_ward`, `has_computer`,
  `has_coordinates`; bộ lọc `commune_id`, `operational_status`. Chỉ đếm (COUNT).
- Bộ mặc định (3 ô CHART): "Bưu cục theo BĐX" (BAR, XL), "Theo tình trạng hoạt động" (DONUT, M), "Theo loại hình" (LIST, M).
- Ô SYSTEM: cơ chế còn giữ (backend + `SystemWidgetModal`) nhưng hiện chưa có ô nào; `DashboardView` bỏ qua `system_key` lạ.

## 6. Dữ liệu "Hàng đến" (CSV → `arrival_items`)
| Cột CSV | Cột DB | Ghi chú |
|---|---|---|
| `Ma_BC_dong` / `BC_nhan_BG` | `sender_code` / `receiver_code` | `receiver_code` = mã BC nhận = bộ lọc bưu cục |
| `Ten_duong_thu` | `route_name` | |
| `SHBG` / `So_hieu_BD10` / `So_hieu_BD8` | `tracking_no` / `bd10_no` / `bd8_no` | luôn CHỮ (BD10 dài 18–19 chữ số) |
| `Thời gian XN túi` / `Thời gian XN BG` / `Ngay_gio_XND_BD10` / `Ngay_gio_XND_BD10_tai_TTKT` | `bag_confirmed_at` / `item_confirmed_at` / `bd10_confirmed_at` / `bd10_ttkt_confirmed_at` | `M/D/YYYY h:mm:ss AM/PM` → `YYYY-MM-DD HH:MM:SS` |
| `Khoi_luong_thuc_te` | `weight_g` | gam, số nguyên |
| `Dich_vu_code` / `Ten_dich_vu` / `Ghi_chu` | `service_code` / `service_name` / `note` | |
| `Ten_Xa_Phuong` / `Ten_Tinh_Thanh` | `ward_name` / `province_name` | `ward_key` = chuẩn hoá → `ward_bdx_map` → BĐX |
| (dẫn xuất) | `arrival_at` = sớm nhất của túi/BD10/BG; `arrival_date`, `bag_date`, `bd10_date`, `item_date` | `04_DECISIONS.md` #13, #21 |

## 7. Quản lý Mạng Lưới — field Excel ⇄ JSON (import và export dùng CHUNG key)
| Key | Cột Excel | Cột DB |
|---|---|---|
| `maBdtTp` / `tenBdtTp` | Mã / Tên BĐT/TP | `province_post_offices.code/name` |
| `maBdx` / `tenBuuDienXa` / `buuDienXaTrungTam` | Mã / Tên BĐX / BĐX trung tâm | `commune_post_offices.code/name/central_commune_code` |
| `maMbc` (**bắt buộc**) / `tenBuuCuc` / `loai` | Mã MBC / Tên / Loại | `post_offices.code/name/type` |
| `diaChiChiTiet`, `maBdkv`, `tenBdkv` | Địa chỉ, Mã/Tên BĐKV | `address`, `bdkv_code`, `bdkv_name` |
| `maPhuongXaCu`, `tenPhuongXaCu`, `tenQuanHuyen` | Phường/Xã cũ, Quận/Huyện | `old_ward_code`, `old_ward_name`, `district_name` |
| `maPhuongXaMoi`, `tenPhuongXaMoi` | Phường/Xã mới | `new_ward_code`, `new_ward_name` |
| `soDienThoai`, `tinhTrangHoatDong` | SĐT, Tình trạng (ACTIVE/INACTIVE) | `phone`, `operational_status` |
| `viDo`, `kinhDo` | Vĩ độ, Kinh độ | `latitude`, `longitude` |
| `maHrmNguoiPhuTrach` | Mã HRM người phụ trách | `responsible_user_id` (tra theo `users.hrm_code`) |
