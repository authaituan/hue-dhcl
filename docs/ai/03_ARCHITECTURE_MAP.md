# 🗺️ BẢN ĐỒ KIẾN TRÚC

Chỉ trỏ đường tới file — không dump code. Cập nhật khi thêm/bớt route, bảng, màn hình.

## 1. Cấu trúc thư mục
```
server/
  index.js              # khởi động Express: lớp bảo mật -> bắt buộc token cho /api/* -> mount router -> phục vụ dist/ -> 404
  db.js                 # SQLite (data/hue-dhcl.db): tạo bảng + seed Dashboard mặc định
  auth.js               # JWT, băm mật khẩu, authRequired / requireManager / requireAdmin
  security.js           # lọc IP (CMS_ALLOWED_IPS), header bảo mật, trang 404, nhật ký data/security.log
  pages/404.html        # trang 404 (CSS nhúng, băm CSP lúc khởi động)
  lib/helpers.js        # parseFloatOrNull, normalizeStr (bỏ dấu)
  lib/orgImport.js      # resolveOrCreateOrgChain: tạo/cập nhật Tỉnh -> BĐX -> Bưu cục khi import mạng lưới
  lib/dashboardSources.js   # whitelist nguồn/nhóm/bộ lọc của Dashboard động + computeWidgetData + buildMeta
  lib/dashboardDefaults.js  # bộ ô mặc định + seed/reset
  routes/auth.js        # đăng nhập (+ rate-limit)
  routes/users.js       # quản lý tài khoản + tìm kiếm người phụ trách
  routes/network.js     # quản lý mạng lưới (danh sách / import / export / sửa / xoá bưu cục)
  routes/organization.js    # danh sách BĐX, bưu cục (chỉ đọc, cho dropdown)
  routes/dashboard.js       # số đếm tổng quan
  routes/dashboardWidgets.js # Dashboard động: CRUD ô, dữ liệu, xem trước
src/
  App.jsx               # khung app: đăng nhập / Sidebar / Header / 3 màn hình
  utils/api.js          # apiFetch/apiFetchJson, lưu token, sự kiện hết phiên
  components/           # LoginView, Sidebar, Header, DashboardView, NetworkListView, UserAdminView + modal người dùng
  components/dashboard/ # ChartWidget + editor/ (ChartWidgetModal, SystemWidgetModal, WidgetToolbar, DashboardEditorToolbar, ConfirmModal)
scripts/import-seed.js  # nạp tài khoản + mạng lưới từ DB hệ thống cũ vào data/hue-dhcl.db (06_DEPLOYMENT.md mục 5)
tests/                  # node --test; helpers/serverHarness.js chạy server thật trên DB tạm
```

## 2. Cơ sở dữ liệu (`server/db.js`)
| Bảng | Vai trò | Khoá ngoại |
|---|---|---|
| `province_post_offices` | Bưu điện Tỉnh/TP | — |
| `commune_post_offices` | Bưu điện Xã (BĐX) | `province_id` → province |
| `post_offices` | Bưu cục (MBC) + thông tin mạng lưới, `responsible_user_id` (không FK cứng) | `commune_id` → commune |
| `users` | Tài khoản đăng nhập (khoá theo `hrm_code`), `deactivated_at` = khoá | `post_office_id` → post_offices |
| `dashboard_widgets` | Cấu hình ô Dashboard (SYSTEM/CHART), dùng chung mọi người | — |

## 3. API (mọi `/api/*` trừ đăng nhập đều cần token)
| Route | Quyền | File |
|---|---|---|
| `POST /api/auth/login` | công khai (rate-limit) | `routes/auth.js` |
| `GET/POST /api/users`, `PUT /api/users/:id`, `.../reset-password`, `.../deactivate`, `.../reactivate` | quản lý | `routes/users.js` |
| `GET /api/users/search?q=` | quản lý | `routes/users.js` |
| `PUT /api/users/me/password` | mọi người đã đăng nhập | `routes/users.js` |
| `GET /api/network`, `POST /api/network/import`, `GET /api/network/export-data` | quản lý | `routes/network.js` |
| `PUT/DELETE /api/network/post-offices/:id` | quản lý | `routes/network.js` |
| `GET /api/organization/communes`, `GET /api/organization/post-offices?communeId=` | đã đăng nhập | `routes/organization.js` |
| `GET /api/dashboard/stats` | đã đăng nhập | `routes/dashboard.js` |
| `GET /api/dashboard/widgets`, `GET /api/dashboard/widgets-data` | đã đăng nhập | `routes/dashboardWidgets.js` |
| `GET widgets-meta`, `POST widgets-preview`, `POST/PUT/DELETE widgets`, `PUT widgets-order`, `POST widgets-reset` | ADMIN | `routes/dashboardWidgets.js` |

Phân quyền: `STAFF` = chỉ đọc; vai trò khác = quản lý; `ADMIN` thêm quyền cấu hình Dashboard.

## 4. Giao diện
| Menu | Màn hình | Ai thấy |
|---|---|---|
| Dashboard | `DashboardView.jsx` (chế độ chỉnh sửa chỉ ADMIN) | mọi người |
| Quản lý mạng lưới | `NetworkListView.jsx` (danh sách + Thêm/Sửa/Xoá + Import/Export Excel) | quản lý |
| Quản lý người dùng | `UserAdminView.jsx` | quản lý |

## 5. Dashboard động
- Nguồn duy nhất: `POST_OFFICE` — nhóm theo `type`, `operational_status`, `commune`, `new_ward`, `has_computer`,
  `has_coordinates`; bộ lọc `commune_id`, `operational_status`. Chỉ đếm (COUNT).
- Bộ mặc định (3 ô CHART): "Bưu cục theo BĐX" (BAR, XL), "Theo tình trạng hoạt động" (DONUT, M), "Theo loại hình" (LIST, M).
- Ô SYSTEM: cơ chế còn giữ (backend + `SystemWidgetModal`) nhưng hiện chưa có ô nào; `DashboardView` bỏ qua `system_key` lạ.

## 6. Quản lý Mạng Lưới — field Excel ⇄ JSON (import và export dùng CHUNG key)
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
