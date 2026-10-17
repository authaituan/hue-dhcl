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
  lib/arrivalsImport.js # "Hàng đến": schema + nạp 1 file / 1 thư mục CSV (importArrivalFile = chuanBiFile async không đụng DB + ghiFileDaChuanBi đồng bộ, gọi được trong giao dịch ngoài — #81), ánh xạ phường→BĐX, getMissingBatches
  lib/arrivalsQuery.js  # "Hàng đến": NƠI DUY NHẤT cài quy tắc đếm sản lượng (buildCountedCte) + kiểm tham số + các truy vấn API
  lib/arrivalsExport.js # xuất Excel dữ liệu thô "Hàng đến" của 1 BCVH (9 cột chuỗi, ghi luồng theo lô), phạm vi theo vai trò
  lib/bd10Query.js      # chỉ số "BD10 đến không XNĐ" (đơn vị BD10 tính lúc truy vấn): stats, list, splitQuery — #67
  lib/userBcvh.js       # bảng user_bcvh (gán GDVH ↔ BCVH): ensureUserBcvhSchema, getAssignedBcvh, replaceAssignedBcvh
  lib/adminGuard.js     # chặn hạ/khoá ADMIN hoạt động cuối cùng
  lib/dashboardQuery.js # Danh mục 6 BCVH của Trung tâm (DASHBOARD_BCVH) + bcvhNames; API 3e (overview/trend/wards-surge/center) đã xoá ở DASH-6b (#76)
  routes/auth.js        # đăng nhập (+ rate-limit)
  routes/users.js       # quản lý tài khoản + tìm kiếm người phụ trách
  routes/network.js     # quản lý mạng lưới (danh sách / import / export / sửa / xoá bưu cục)
  routes/organization.js    # danh sách BĐX, bưu cục (chỉ đọc, cho dropdown)
  routes/dashboard.js       # số đếm tổng quan
  routes/dashboardWidgets.js # Dashboard động: CRUD ô, dữ liệu, xem trước
  routes/arrivals.js    # API "Hàng đến" + Dashboard điều hành (chỉ GET, ADMIN + TTVH + GDVH)
  routes/napNguon.js    # API ĐỌC màn «Nạp dữ liệu nguồn» (/api/nap-nguon/*, chỉ ADMIN: 5 GET [5f-1; docs/ai/17_…] + 2 POST lay-ngay / lay-lai [5f-2; docs/ai/18_NAP_DU_LIEU_NGUON_API_LAY.md])
  routes/thamSo.js      # API «Tham số hệ thống» (/api/tham-so*, chỉ ADMIN; THAMSO-1, #94; docs/ai/34_…) — lõi server/lib/thamSo.js, danh bạ server/config/tham-so.js, mặc định server/config/tham-so-mac-dinh.js
src/
  App.jsx               # khung app: đăng nhập / Sidebar / Header / 3 màn hình
  utils/api.js          # apiFetch/apiFetchJson, lưu token, sự kiện hết phiên
  components/           # LoginView, Sidebar, Header, DashboardView, NetworkListView, UserAdminView + modal người dùng
  components/dashboard/ # ChartWidget + editor/ (ChartWidgetModal, SystemWidgetModal, WidgetToolbar, DashboardEditorToolbar, ConfirmModal)
scripts/import-seed.js  # nạp tài khoản + mạng lưới từ DB hệ thống cũ vào data/hue-dhcl.db (06_DEPLOYMENT.md mục 5)
scripts/import-arrivals.js  # nạp CSV "Hàng đến" (file/thư mục), --check-days; --db để trỏ DB khác
server/lib/sftpScheduler.js # (không phải script) hẹn giờ tự động nạp SFTP trong máy chủ — mặc định TẮT, SFTP_SYNC_ENABLED=1 (SANLUONG-5e; docs/ai/15_SFTP_SCHEDULER.md)
scripts/thay-the-xem-truoc.js # XEM TRƯỚC thay thế ngày của một BCVH (CHỈ ĐỌC; DB readonly, ghim vân tay; SANLUONG-5g-2; docs/ai/15_THAY_THE_NGAY_XEM_TRUOC.md)
scripts/thay-the-ngay.js # THAY THẾ ngày của một BCVH (khô mặc định; --chay-that + --xac-nhan + --dong-y-mat; SANLUONG-5g-3; docs/ai/16_THAY_THE_NGAY_THUC_HIEN.md)
server/lib/thayTheThucHien.js # (không phải script) lõi thay thế nguyên khối: khoá, sao lưu, giao dịch, thùng rác, nhật ký (5g-3)
server/lib/thayTheNhatKy.js # (không phải script) lõi ĐỌC nhật ký thay thế (5g-5, #87)
server/lib/thayTheKhoiPhuc.js # (không phải script) xem trước + khôi phục từ thùng rác (5g-5, #87)
scripts/sftp-sync.js         # đồng bộ SFTP chạy tay: quét → tải tệp tạm → nạp (source='SFTP'); mặc định chạy khô, --chay-that (SANLUONG-5c; docs/ai/13_SFTP_SYNC.md)
scripts/sftp-probe.js        # thử kết nối SFTP CHỈ ĐỌC: vân tay khoá máy chủ + liệt kê tên/kích thước/mtime (SANLUONG-5b; chưa tải/nạp; docs/ai/12_SFTP_PROBE.md)
scripts/set-ward-map.js     # gán tay phường/xã → BĐX (MANUAL)
scripts/rederive-arrival.js  # tính lại arrival_at/basis/date theo R2 cho dữ liệu đã nạp (chạy thử mặc định, --apply ghi 1 transaction; #59)
scripts/survey-bd10-den.js  # khảo sát CHỈ ĐỌC "BD10 đến không XNĐ" theo định nghĩa mã BD10 [lập 6][nhận 6] (SANLUONG-4a5)
scripts/survey-bd10.js      # khảo sát CHỈ ĐỌC ở mức BD10 (BD10 đến không XNĐ; mở DB readonly, từ chối cờ ghi; chỉ in số đếm) — SANLUONG-4a4
scripts/reset-arrivals.js    # xoá dữ liệu sản lượng đến (dev): arrival_items + arrival_import_files; chạy thử mặc định, --apply (#64)
scripts/split-arrivals-csv.js  # tách MỘT file CSV nhiều ngày thành HangDen_<mã>_<yyyymmdd>_235959.csv theo ngày đến (ra thư mục ngoài repo; #63)
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
| `user_tivi_scope` | Phạm vi tài khoản TIVI: `scope` = `all` hoặc một mã trong 6 BCVH (PK `user_id`; xoá khi rời vai trò TIVI) — #74 | `user_id` → users |
| `phat_batches`, `phat_status_current`, `phat_status_history`, `phat_drafts`, `phat_draft_rows` | Module «Xử lý và tỷ lệ phát»: đợt nhập, trạng thái phát hiện tại theo (bcvh, shbg), lịch sử, bản kiểm tra + dòng (hết hạn 7 ngày). Chi tiết `08_PHAT.md` — #75 | `user_id` (không FK cứng) |
| `dashboard_widgets` | Cấu hình ô Dashboard (SYSTEM/CHART), dùng chung mọi người | — |
| `arrival_import_files` | Nhật ký nạp file "Hàng đến": tên, mã BC nhận, ngày/giờ file, sha256, số dòng, `status` OK/EMPTY/REJECTED/CONFLICT, lỗi/cảnh báo | — |
| `sftp_sync_runs`, `sftp_sync_files` | «Lượt lấy» SFTP (SANLUONG-5c, `server/lib/sftpSync.js`, tạo ở `server/db.js`): mỗi lượt chạy tay một dòng (`started_at`, `finished_at`, `trigger` MANUAL/TIMER, bộ đếm, `ghi_chu_loi`) và mỗi file một dòng kết quả (`DA_NAP`/`DA_CO`/`CHUA_ON_DINH`/`EMPTY`/`LOI`/`BO_QUA`/`WOULD_IMPORT`). Khoá chống chạy chồng = lượt chưa `finished_at` < 30 phút. Chi tiết `13_SFTP_SYNC.md` | — |
| (cột thêm cho `sftp_sync_runs`) `loai`, `nguoi_bam_ma`, `nguoi_bam_ten`, `so_o_yeu_cau` | SANLUONG-5f-2: loại lượt tay (`LAY_NGAY` / `LAY_LAI`; NULL = hẹn giờ / script cũ), người bấm, số ô yêu cầu; `ensureLuotSchema` ở `server/lib/napNguonLay.js` (chỉ ADD COLUMN) | — |
| `sftp_source_files` | Danh sách file đang / đã thấy trên nguồn SFTP (SANLUONG-5e, `server/lib/sftpSync.js`): kích thước, mtime, lần đầu / cuối thấy, số lượt giữ nguyên (xét «file ổn định» qua nhiều lượt), `con_tren_nguon` (0 = đã biến mất). Chi tiết `15_SFTP_SCHEDULER.md` | — |
| `thay_the_nhat_ky`, `thung_rac_file`, `thung_rac_dong`, `thay_the_khoi_phuc` (5g-5) | «Thay thế ngày của một BCVH» (SANLUONG-5g-3, `server/lib/thayTheThucHien.js`, tạo ở `server/db.js`, giờ UTC): nhật ký mỗi lần thay thành công (người, BCVH, ngày, tập file cũ / mới, số dòng, SHBG mất thật, mức cảnh báo, đường dẫn sao lưu, hạn thùng rác); thùng rác = bản sao nguyên văn bản ghi file / dòng bị xóa (cùng `id`, `import_file_id` gốc; `thung_rac_id` = `thay_the_nhat_ky.id`), giữ 30 ngày | — |
| `tham_so`, `tham_so_nhat_ky` (THAMSO-1) | «Tham số hệ thống» (`server/lib/thamSo.js`, tạo ở `server/db.js`, giờ UTC): `tham_so(khoa PK, gia_tri JSON, cap_nhat_luc, cap_nhat_boi, che_do 'tay'|'tu_thong_ke')` chỉ lưu GIÁ TRỊ GHI ĐÈ (thiếu dòng = mặc định ở `server/config/tham-so-mac-dinh.js`); `tham_so_nhat_ky(id, khoa, gia_tri_cu, gia_tri_moi, thoi_diem_utc, nguoi_ma, ly_do, loai 'SUA'|'VE_MAC_DINH')` — #94 | — |
| `arrival_items` | 1 dòng CSV = 1 dòng: cột gốc (chữ) + `arrival_at`/`arrival_at_basis`/`arrival_evidence_count`, ngày dẫn xuất từng mốc, `ward_key`. Lượt đến = `(tracking_no, bd10_no, bd8_no)` | `import_file_id` → arrival_import_files |
| `ward_bdx_map` | Phường/xã (`ward_key`) → BĐX, `source` AUTO/MANUAL | `commune_id` → commune |

## 3. API (mọi `/api/*` trừ đăng nhập đều cần token)
| Route | Quyền | File |
|---|---|---|
| `POST /api/auth/login` | công khai (rate-limit) | `routes/auth.js` |
| `GET /api/auth/me` — tài khoản hiện tại `{ id, hrm_code, full_name, role, tivi_scope, token_het_han }` (#74) | mọi vai trò (kể cả TIVI) | `routes/auth.js` |
| `GET /api/phat/template?bcvh=&from=&to=&scope=chua\|tat-ca` — file `.xlsx` mỗi SHBG một dòng (#75) | nhập: ADMIN, TTVH, GDVH (theo BCVH được gán) | `routes/phat.js`, `lib/phatFile.js` |
| `POST /api/phat/drafts?bcvh=&ten_file=` (thân = file thô ≤ 10 MB) · `GET /api/phat/drafts?bcvh=[&tat_ca=1]` (danh sách bản của tôi — PHAT-1b) · `GET\|DELETE /api/phat/drafts/:id` · `GET …/rows?ket_qua=&ma_loi=&q=&canh_bao=&page=&size=` · `PATCH\|DELETE …/rows` · `POST …/fill` · `POST …/assign-list` · `GET …/errors.xlsx[?loai_tru=]` · `POST …/commit` — bản kiểm tra, biên tập, nhập từng phần | nhập (như trên) | `routes/phat.js`, `lib/phat.js` |
| `GET /api/phat/batches?bcvh=&page=&size=[&tu_ngay=&den_ngay=&nguoi_nhap=&trang_thai=]` · `GET /api/phat/batches/:id/undo-preview` · `POST /api/phat/batches/:id/undo` — danh sách đợt nhập có lọc (chỉ BCVH được phép; kèm `nguoi_nhap_lua_chon`, `so_canh_bao`) · xem trước hoàn tác (không ghi) · hoàn tác (ADMIN, TTVH, chính người nhập; 409 nếu đợt sau đã đổi SHBG) — #78 | nhập (như trên) | `routes/phat.js`, `lib/phat.js` |
| `GET /api/phat/ty-le?bcvh=<mã\|all>&ngay=` — mẫu số, 5 nhóm trạng thái, `muc_cap_nhat`, `so_lieu_den_luc` (+ `_bangkok`), `theo_khung_gio_den[6]`, `ton_cho` | ADMIN, TTVH, GDVH (mọi BCVH) | `routes/phat.js`, `lib/phat.js` |
| `GET /api/arrivals/dashboard/ket-qua-phat?bcvh=<mã\|all>&ngay=` — kết quả phát cho Dashboard (PHAT-3b, #79): `bcvh, pham_vi, ngay, cung_ngay, mau_so, theo_trang_thai, ptc, muc_cap_nhat, co_so_lieu_phat, so_lieu_den_luc(+_bangkok), nguong{ptc_dat, chua_co_tt_canh_bao, san_xep_hang_bcvh}, xep_hang_bcvh[{bcvh,ten,mau_so,ptc,hang,theo_trang_thai{4 trạng thái còn lại}}], chua_du_du_lieu[{bcvh,ten,mau_so,ly_do}]`; không khung giờ, không `ton_cho` | ADMIN, TTVH, GDVH (mọi BCVH, như #72); STAFF, TIVI 403 | `routes/arrivals.js`, `lib/phatDashboard.js`, `lib/phatConfig.js` |
| `GET /api/arrivals/dashboard/ket-qua-phat-thang?bcvh=<mã\|all>&ngay=` — kết quả phát từ đầu tháng (DASH-12b, #91): `bcvh, pham_vi, ngay, thang, luy_ke{…}, theo_ngay[…], chenh{…}\|null, nguong{…}` (xem `08_PHAT.md` mục 4); cache 60 giây | ADMIN, TTVH, GDVH (mọi BCVH); STAFF, TIVI 403 | `routes/arrivals.js`, `lib/phatDashboard.js`, `lib/phatConfig.js` |
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
| `GET /api/arrivals/summary` — sản lượng, khối lượng, túi/kiện, hàng đi ngoài + tỷ lệ (`hang_di_ngoai`, `ty_le_hang_di_ngoai`, #76), địa bàn phát; `chua_nhan_tai_bcvh` (đã lập BD10 về BCVH, chưa có XN nhận — mọi vai trò theo bộ lọc BCVH, #60, #68, #72: loại BD10 rỗng / lập đi); `bd10_den_khong_xnd` (BD10 đến không XNĐ: tổng / tỉ lệ, theo nhóm 530100 / khác, tuổi, trạng thái S1–S3, ngoài khung — CÔNG KHAI mọi vai trò, cùng phạm vi, #67); `canh_bao` chỉ ADMIN (`chua_xac_dinh_ngay_den` LỖI THỜI, `khong_moc_khong_ttkt`) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-route` — theo đường thư: sản lượng, tỷ trọng, giờ nhiều nhất, hàng đi ngoài + tỷ lệ (#76); nhóm riêng "Chưa có tên đường thư" | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-service` — theo dịch vụ (mã + tên): sản lượng, tỷ trọng, khối lượng TB, hàng đi ngoài + tỷ lệ (#76); nhóm riêng "Chưa có tên dịch vụ" | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-time?granularity=day\|hour` — đủ mốc trong khoảng (`hour` ≤ 7 ngày) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/by-ward` — theo phường/xã nơi phát, giảm dần, tỷ trọng; nhóm Phường/xã tỉnh khác, Chưa xác định tỉnh, Chưa xác định phường/xã | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/quality-mocs` — 7 tổ hợp mốc BCVH + `tong_hop` (đủ trạng thái, có XN túi / XND BD10 / XN bưu gửi, không XNĐ BD10) + tỷ lệ có từng mốc + bưu gửi không có mốc; `tong_hop.theo_nguon` (3 nhóm `ttkt`/`khac`/`khong_bd10`: số bưu gửi, đủ theo nguồn, thiếu, tỷ lệ) + `tong_hop.du_trang_thai_theo_nguon` (#61) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/bd10-khong-xnd?from=&to=&receiver_code=\|unit=&nhom=&tuoi=&page=&page_size=` — danh sách BD10 đến không XNĐ (S2 + S3), cũ nhất trước: số hiệu BD10, bưu cục lập, ngày, tuổi, số bưu gửi, số BD8, có XN túi / BG, trạng thái; mọi vai trò theo bộ lọc BCVH (#67, #72) | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/bd10Query.js` |
| `GET /api/arrivals/bd10-trang-thai/theo-ngay?from=&to=&receiver_code=\|unit=` — trạng thái BD10 đến theo ngày (quy tắc X): `{ khung, ngay_du_lieu_moi_nhat, theo_ngay: [{ ngay, tong, da_xnd, chua_xnd, ty_le_chua_xnd, bg_tong, bg_da_xnd, bg_chua_xnd, ty_le_chua_xnd_bg }] (mọi ngày, ngày trống = 0), tong, ngoai_khung }`; số BD10 + số bưu gửi (SHBG khác nhau, #71); chỉ ngày, ≤ 92 ngày (#69) | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/bd10Query.js` |
| `GET /api/arrivals/bd10-trang-thai/theo-buu-cuc-lap?from=&to=&receiver_code=\|unit=` — theo bưu cục lập (6 ký tự đầu BD10): `{ khung, theo_buu_cuc_lap: [{ ma_buu_cuc, ten_buu_cuc (post_offices, không có → null), tong, da_xnd, chua_xnd, ty_le_chua_xnd, bg_tong, bg_da_xnd, bg_chua_xnd, ty_le_chua_xnd_bg }], tong, ngoai_khung }`, sắp (theo số BD10) chua_xnd rồi tong giảm dần (#69, #71) | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/bd10Query.js` |
| `GET /api/arrivals/bd10-khong-xnd/export?receiver_code=\|unit=&from=&to=[&nhom=&tuoi=]` — xlsx danh sách trên của MỘT BCVH (cùng quyền / giới hạn / nhật ký với `/export`) | ADMIN, TTVH, GDVH (theo BCVH) | `routes/arrivals.js`, `lib/arrivalsExport.js` |
| `GET /api/arrivals/not-received` — danh sách "đã lập BD10 về BCVH, chưa có XN nhận tại BCVH" (SHBG, BD8, BD10, đường thư, thời điểm lập BD10, tuổi), phân trang, cũ nhất trước; mọi vai trò theo bộ lọc BCVH (#72) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/not-received/export?receiver_code=&from=&to=` — xlsx danh sách trên của MỘT BCVH (cùng quyền/giới hạn/nhật ký với `/export`) | ADMIN, TTVH, GDVH (theo BCVH) | `routes/arrivals.js`, `lib/arrivalsExport.js` |
| `GET /api/arrivals/lookup?tracking_no=` — các dòng của 1 SHBG, mốc dùng làm thời điểm đến | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/items` — bưu gửi đã đếm (1 dòng/SHBG), `page_size` ≤ 200 (kiểm tra) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/dashboard/tong-quan-den?bcvh=all\|<mã>&date=` — Dashboard «Cần điều hành» phần đến (#73, sửa #76): `bcvh`, `bcvh_goi_y`, `ngay_du_lieu`, `cung_ngay_du_lieu`, `den_luc`, `nap_luc`, `nguong`, `san_luong { luot, buu_gui, so_hom_qua_cung_gio, so_tuan_truoc_cung_gio }` (hai mốc cùng giờ dữ liệu), `hang_di_ngoai { buu_gui, ty_le, mau_so, so_hom_qua_cung_gio, so_tuan_truoc_cung_gio }` (chỉ hiển thị, không mức; `chenh_pct` / `chenh_diem` = null khi mốc < 50 bưu gửi, #76), `sau_15h { buu_gui, ty_le, tu_gio, da_toi_gio }`, `bcvh_can_chu_y { so, tong }`, `theo_bcvh[] { …, so_hom_qua, so_tuan_truoc, danh_gia_san_luong { trang_thai: da_danh_gia\|chua_du_du_lieu, ly_do: thieu_tuan_truoc\|moc_duoi_san\|chua_toi_gio }, muc, muc_chi_tiet }` | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/dashboardDenQuery.js` |
| `GET /api/arrivals/dashboard/viec-can-lam?bcvh=&date=` — danh sách việc (chưa nhận, BD10 chưa XNĐ) ở mức Xử lý ngay / Trong ngày: `items[] { muc, loai, bcvh, ten_bcvh, ngay, tieu_de_khoa, so_lieu, duong_dan }` (#73) | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/dashboardDenQuery.js` |
| `GET /api/arrivals/dashboard/phuong-xa-tang?bcvh=&date=&gioi_han=` — phường/xã theo mức tăng so hôm qua, cùng giờ: `items[] { ten, ward_key, bcvh, ten_bcvh, ngay, hom_kia, hom_qua, hom_nay, tang_so_hom_qua, tang_so_hom_qua_pct, tuan_truoc_cung_gio, lech_so_tuan_truoc_pct }` (#73, sửa #76) | ADMIN, TTVH, GDVH | `routes/arrivals.js`, `lib/dashboardDenQuery.js` |
| `GET /api/arrivals/export-scope` — các BCVH người gọi được xuất: `{ bcvh: [{ ma, ten }] }` (ADMIN/TTVH 6; GDVH các BCVH được giao, có thể rỗng) | ADMIN, TTVH, GDVH | `routes/arrivals.js` |
| `GET /api/arrivals/export?receiver_code=&from=&to=[&date_basis=]` — file `.xlsx` (`HangDen_<mã>_<from>_<to>.xlsx`) dữ liệu thô của MỘT BCVH, 9 cột chuỗi; `from`/`to` bắt buộc, ≤ 92 ngày, ≤ 1.000.000 dòng; GDVH chỉ BCVH được giao (403 nếu khác) | ADMIN, TTVH, GDVH (theo BCVH) | `routes/arrivals.js`, `lib/arrivalsExport.js` |
| `GET /api/arrivals/exceptions?ly_do=&page=&page_size=` — ngoại lệ phân trang (BD10 sớm, đến lại, chưa nhận tại BCVH, không mốc nào) + `theo_ly_do` | ADMIN | `routes/arrivals.js` |
| `GET /api/arrivals/import-status` — file theo trạng thái, REJECTED/CONFLICT, ngày thiếu đợt | ADMIN | `routes/arrivals.js` |
| `POST /api/arrivals/thay-the/xem-truoc` — XEM TRƯỚC «Thay thế ngày của một BCVH» (CHỈ ĐỌC, 5g-2, #82): thân `{ bcvh, ngay, tap_file? }` → `{ db, nguon, so_sanh, canh_bao, phat, tap_file_nguon }`; 400 tham số, 409 đang có lượt đồng bộ / bản xem trước khác, 502 lỗi nguồn SFTP, 503 chưa cấu hình `SFTP_*` | ADMIN (TTVH, GDVH, STAFF, TIVI 403) | `routes/arrivals.js`, `lib/thayTheXemTruoc.js`, `config/thay-the.js` |
| `POST /api/arrivals/thay-the/thuc-hien` — THỰC HIỆN «Thay thế ngày của một BCVH» nguyên khối (5g-3, #83): thân `{ bcvh, ngay, tap_file?, tap_file_nguon: [{ten, sha256}], xac_nhan: {ma_bcvh, ngay}, dong_y_mat_du_lieu? }` → tóm tắt (số dòng xóa / nạp, mất thật, `nhat_ky_id`, tên tệp sao lưu); 400, 409 (đang có lượt / nguồn đã đổi / cần đồng ý mất dữ liệu / dữ liệu đã đổi), 422, 502, 503, 507, 500; lỗi nào cũng KHÔNG để lại thay đổi | ADMIN (TTVH, GDVH, STAFF, TIVI 403) | `routes/arrivals.js`, `lib/thayTheThucHien.js`, `lib/thayTheXemTruoc.js` |
| `GET /api/arrivals/thay-the/nhat-ky` (`page`, `page_size`, `bcvh`, `tu_ngay`, `den_ngay`, `nguoi`) · `GET …/nhat-ky/:id` · `POST …/thay-the/khoi-phuc/xem-truoc` `{nhat_ky_id}` · `POST …/thay-the/khoi-phuc/thuc-hien` `{nhat_ky_id, xac_nhan:{ma_bcvh, ngay}}` — chỉ ADMIN (5g-5, #87; `19_THAY_THE_NGAY_NHAT_KY_KHOI_PHUC.md`) |
| `GET /api/nap-nguon/tong-quan` · `/luoi?tu=&den=[&bcvh=]` (≤ 62 ngày) · `/o?bcvh=&ngay=&dot=S\|C` · `/luot?trang=&kich_thuoc=` · `/luot/:id` — màn «Nạp dữ liệu nguồn» (5f-1, #85): tình trạng hẹn giờ + lượt gần nhất; lưới ngày × BCVH × đợt với trạng thái ô, `nghi_ngo`, `nguon_co_file`, `can_xu_ly`; khung chi tiết một ô; danh sách / chi tiết lượt (lọc hàng khóa «Thay thế»); 400 tham số sai (kể cả query lạ), 404 lượt không có; chỉ ĐỌC | ADMIN (TTVH, GDVH, STAFF, TIVI 403) | `routes/napNguon.js`, `lib/napNguonDoc.js`, `config/nap-nguon.js` |
| `POST /api/nap-nguon/lay-ngay` (thân `{}`) · `POST /api/nap-nguon/lay-lai` (thân `{ o: [{bcvh, ngay, dot}] }`, ≤ 20 ô) — «Lấy ngay» / «Lấy lại» (5f-2, #86): 202 `{luot_id, bat_dau}` (lay-lai kèm `o[].da_co_nhap_tay`) rồi nạp NỀN; 400, 409 `DANG_CHAY` (kèm `luot_id`) / `TAM_DUNG`, 503 `CHUA_CAU_HINH`; kết quả đọc qua `/luot/:id`; ghi người bấm | ADMIN (TTVH, GDVH, STAFF, TIVI 403) | `routes/napNguon.js`, `lib/napNguonLay.js`, `lib/sftpSync.js` (`luotCoSan`), `lib/sftpScheduler.js` (`tamDungHenGio`) |
| `GET /api/tham-so` (danh bạ + giá trị hiệu lực + mặc định + ai sửa) · `PUT /api/tham-so` `{ ly_do, thay_doi: [{khoa, gia_tri}] }` (1–30, tất cả hoặc không) · `POST /api/tham-so/ve-mac-dinh` `{ ly_do, khoa: [..] | tat_ca: true }` · `GET /api/tham-so/nhat-ky?khoa&tu&den&page&page_size` — «Tham số hệ thống» (THAMSO-1, #94): CHỈ ADMIN; lỗi `{error, ma}` 400 `THAM_SO_SAI`/`KHOA_LA`/`KHOA_CHI_DOC`/`NGOAI_KHOANG`/`RANG_BUOC`/`THIEU_LY_DO`; nhóm 2 chỉ-đọc |

Bộ lọc chung (trừ meta, lookup, import-status): `from`, `to` (bắt buộc, `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM`/`T`, gồm 2 đầu), `date_basis` =
`arrival` (mặc định) / `bag` / `bd10` / `item`, `receiver_code` (nhiều giá trị), `ward_key`. Sản lượng = SHBG khác nhau, đếm tại lần đến sớm nhất
trong khoảng (`04_DECISIONS.md` #28–#35). Hàng đi ngoài: SHBG có ≥ 1 dòng BD8 (chuẩn hoá) = SHBG, mẫu số = sản lượng đến (`DI_NGOAI_SQL`) — #76 (thay «hàng nặng» #36–#40; tham số `heavy_g` đã bỏ).

Xuất file (`/api/arrivals/export`, `04_DECISIONS.md` #55–#58): KHÔNG theo quy tắc đếm sản lượng — là dòng thô trong `arrival_items`. Tham số: `receiver_code` (đúng 1 mã trong 6 BCVH), `from`/`to` (`YYYY-MM-DD`, ≤ 92 ngày), `date_basis` (như trên, mặc định `arrival`). 9 cột theo thứ tự: `BC_nhan_BG`←`receiver_code`, `Ten_duong_thu`←`route_name`, `SHBG`←`tracking_no`, `So_hieu_BD8`←`bd8_no`, `So_hieu_BD10`←`bd10_no`, `Thoi_gian_XN_BG`←`item_confirmed_at`, `Thoi_gian_XN_tui`←`bag_confirmed_at`, `Ngay_gio_XND_BD10`←`bd10_confirmed_at`, `Dich_vu_code`←`service_code`. Mọi ô là chuỗi; giờ ghi `dd/MM/yyyy HH:mm:ss`. Mỗi lần xuất ghi `arrivals_export` vào `security.log`.

Dashboard điều hành (`/api/arrivals/dashboard/*`): `date` (`YYYY-MM-DD`, mặc định ngày file mới nhất), `as_of` (`HH:MM`, mặc định giờ file nạp mới nhất của `date`); mọi so sánh dùng cùng khoảng 00:00 → `as_of` — `04_DECISIONS.md` #41–#47. "Điểm cần điều hành" (lãnh đạo) khác cảnh báo dữ liệu ADMIN-only.



### Vai trò và ma trận quyền (`server/roles.js`, `04_DECISIONS.md` #49–#54)
Năm vai trò (chuỗi ASCII, chữ hoa): `ADMIN`, `TTVH`, `GDVH`, `STAFF`, `TIVI` (#74). `server/roles.js` là nơi duy nhất định nghĩa (`ROLES`, `VALID_ROLES`,
`VIEWER_ROLES = ADMIN, TTVH, GDVH`, `isValidRole`). Middleware `authRequired` (`server/auth.js`) tra DB mỗi request: lấy `role` + `deactivated_at` từ `users`
(không tin vai trò trong token) — khoá/không còn → 401, vai trò ngoài danh sách (vd `MANAGER` chưa chuyển đổi) → 403. `requireRoles(...roles)` nhận danh sách tường minh
(`requireAdmin` = `requireRoles('ADMIN')`); không còn quy tắc "khác STAFF". `TIVI`: allowlist `TIVI_ALLOWED` (`server/lib/tivi.js`) kiểm ngay trong `authRequired`, ngoài danh sách → 403 (cột TIVI dưới đây); token hạn `JWT_EXPIRY_TIVI`, gắn vai trò + dấu mật khẩu (đổi vai trò / mật khẩu → 401).

| Nhóm route | ADMIN | TTVH | GDVH | STAFF | TIVI |
|---|---|---|---|---|---|
| `/api/users*` (trừ `PUT /users/me/password`), `/users/:id/bcvh` | ✔ | 403 | 403 | 403 | 403 |
| `PUT /api/users/me/password` | ✔ | ✔ | ✔ | ✔ | 403 |
| `GET /api/network`, `/network/export-data` | ✔ | ✔ | ✔ | 403 | 403 |
| `POST /network/import`, `PUT/DELETE /network/post-offices/:id` | ✔ | 403 | 403 | 403 | 403 |
| `/api/arrivals/*` (meta, summary, by-*, quality-mocs, items, lookup, dashboard/*) | ✔ | ✔ | ✔ | 403 | 403 |
| `/api/arrivals/export-scope`, `/export`, `/not-received/export`, `/bd10-khong-xnd/export` | ✔ mọi BCVH | ✔ mọi BCVH | chỉ BCVH được giao (khác → 403) | 403 | 403 |
| `/api/arrivals/not-received`, `/bd10-khong-xnd`, `/bd10-trang-thai/*`, `chua_nhan_tai_bcvh` và `bd10_den_khong_xnd` của `/summary` và `/dashboard/center` | ✔ theo bộ lọc | ✔ theo bộ lọc | ✔ theo bộ lọc (#72; không phụ thuộc BCVH được giao) | 403 | 403 |
| `/api/arrivals/exceptions`, `/import-status`, trường `canh_bao` của `/summary` (cảnh báo dữ liệu; KHÔNG gồm `chua_nhan_tai_bcvh`) | ✔ | 403 (không có `canh_bao`) | 403 (không có `canh_bao`) | 403 | 403 |
| `GET /api/dashboard/widgets*` (đọc) | ✔ | ✔ | ✔ | ✔ | 403 |
| ghi/meta/preview/order/reset `/api/dashboard/widgets*` | ✔ | 403 | 403 | 403 | 403 |
| `/api/organization/*`, `/api/dashboard/stats` (giữ nguyên) | ✔ | ✔ | ✔ | ✔ | 403 |
| `GET /api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang` (#73) | ✔ | ✔ | ✔ | 403 | ✔ `bcvh` ép theo phạm vi; chưa có phạm vi → 403 |
| `GET /api/auth/me` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/phat/template`, `/phat/drafts*`, `/phat/batches` (nhập, danh sách đợt) | ✔ mọi BCVH | ✔ mọi BCVH | chỉ BCVH được gán (chưa gán → 403) | 403 | 403 |
| `GET …/batches/:id/undo-preview`, `POST /api/phat/batches/:id/undo` | ✔ | ✔ | chỉ đợt do mình nhập, BCVH còn được gán | 403 | 403 |
| `GET /api/phat/ty-le` | ✔ | ✔ | ✔ mọi BCVH (#72) | 403 | 403 (không mở; tivi dùng endpoint dashboard ở PHAT-3d) |
| `GET /api/arrivals/dashboard/ket-qua-phat` (#79) | ✔ mọi BCVH | ✔ mọi BCVH | ✔ mọi BCVH (#72; không theo `user_bcvh`) | 403 | 403 (PHAT-3d) |
| `GET /api/arrivals/dashboard/ket-qua-phat-thang` (#91) | ✔ mọi BCVH | ✔ mọi BCVH | ✔ mọi BCVH (không theo `user_bcvh`) | 403 | 403 |
Không token → 401 ở mọi route trừ đăng nhập. Chặn ở `routes/users.js`: `role` ngoài danh sách → 400; tự đổi vai trò / tự khoá mình → 400; hạ / khoá ADMIN hoạt động cuối cùng → 400
(`server/lib/adminGuard.js`). `GET /api/users` trả thêm `bcvh_codes`. và `tivi_scope` (bảng `user_tivi_scope`, #74). `getAssignedBcvh(userId)` (`server/lib/userBcvh.js`) dùng cho xuất file (`lib/arrivalsExport.js`, #57).
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
