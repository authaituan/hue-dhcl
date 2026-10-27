# 42 · KTT-8 — API `/api/ktt/*`, cache theo ngày, tham số giờ chốt

Đưa phần tính toán «Hàng tại KTT» (`tongHopKtt`, `luuThoatTheoNgay`, `chiTiet`, `taoDanhGia`) ra API **chỉ đọc**, cho **ADMIN và TTVH**, có cache theo ngày và không làm đứng máy chủ.
Chưa có giao diện (KTT-9). Xuất xlsx sheet 7 «Lưu thoát»: KTT-8b (mục 10); sheet 8 «Hôm sau / chưa đi trên 24 giờ»: KTT-8c (chưa làm). Dữ liệu trong tài liệu này là dữ liệu giả.

## 1. Quyền và mount
- Router `server/routes/ktt.js`, mount **riêng** `app.use('/api/ktt', kttRoutes)` ở `server/index.js`; `router.use(requireRoles(ADMIN, TTVH))` đứng đầu router nên route thêm sau này cũng bị chặn mặc định. KHÔNG đặt dưới `/api/arrivals` (đường đó mở cả GDVH).
- Không token → 401 (lớp `authRequired` chung của `/api`); ADMIN, TTVH → 200; **GDVH → 403**; **TIVI → 403** (allowlist `server/lib/tivi.js` từ chối mặc định, không sửa `tivi.js` / `roles.js`; chỉ kiểm bằng test). ADMIN và TTVH thấy CÙNG số liệu (không lọc theo BCVH được giao). Mọi route chỉ `GET`, không ghi DB. `Cache-Control: no-store` của `/api/*` giữ nguyên.
- Khác mẫu QUYTG: QUYTG nằm dưới `/api/arrivals/quy-thoi-gian*` (guard `viewerGuard` = ADMIN, TTVH, GDVH, TIVI qua allowlist) — không dùng được cho KTT vì cần loại GDVH.

## 2. Route
Lỗi tham số → **400** `{ error (tiếng Việt, nêu tham số sai), ma: 'KTT_…' }`; lỗi khác → 500 `{ error: 'Lỗi hệ thống khi đọc dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' }` (log chỉ có mã lỗi, không số hiệu bưu gửi, không stack).

| Route | Trả về |
|---|---|
| `GET /api/ktt/meta` | `nguon_xuat_luc_moi_nhat`, `nap_luc`, `lich_chuyen` (14 dòng: `ma_bcvh`, `gio_xuat_phat`, `ngay_chay`, `nhan`, `dang_dung`), `han_den_truoc_chuyen_phut` (60, ở `ktt_lich_cau_hinh`), `gio_chot_ngay` ('09:00', tham số), `nguong` (`treo_phut`, `nam_lau_toi_da_phut`, `chi_tieu_f13_gio`, …), `chi_tieu_gio` (mặc định 14, ngoại lệ 12 giờ phường Thuận Hóa / Phú Xuân), `gioi_han`, `loai_chi_tiet`, `canh_bao`. Rẻ, không đệm; không tham số. Dùng cho dòng «dữ liệu đến <giờ xuất>». |
| `GET /api/ktt/luu-thoat?tu=&den=` | Đúng kết quả `kttLuuThoatQuery.luuThoatTheoNgay` (xem `41_KTT_LUU_THOAT.md`): mỗi ngày `da_chot`, đủ ngày trong khoảng (ngày trống = 0), `meta.nguon_xuat_luc_moi_nhat`. |
| `GET /api/ktt/tong-hop?tu=&den=` | `kttQuery.tongHopKtt` (khóa camelCase như KTT-5) + **`danh_gia`** (`taoDanhGia`) + `meta { nguon_xuat_luc_moi_nhat, bay_gio, ly_do }`. |
| `GET /api/ktt/chi-tiet?tu=&den=&loai=[&ma_bcvh=&nguon=&page=&page_size=]` | `{ items, pagination { total, page, page_size, total_pages }, meta }` (mẫu `/api/arrivals/items`). `loai` = loại cũ của `kttQuery.chiTiet` (`treo`, `nam_lau`, `tre_chuyen`, `lo_chuyen`, `den_sat_gio`, `xnd_sau_gio_di`, `can_kiem_tra_lai`, `khong_ro_dich`, `quet_den_sau_gio_di`) HOẶC nhóm lưu thoát: `t1`…`t5`, `dang_cho_chuyen`, `hang_hoan`, `dat`, `khong_dat`, `chua_di`, `chua_do_duoc`, `xnd_sau_gio_di`, `khong_ro_dich`, `ngoai_pham_vi`, `khong_co_gio_quet_den`, `khong_xep_duoc_chuyen`, và (KTT-8c) `ro_lai` (t3 + t4 + t5), `truot_chuyen` (trượt + lỡ chuyến). Dòng nhóm lưu thoát có thêm 17 trường snake_case của sheet 7 (mục 11). `nguon` (KTT-8c, chỉ với nhóm lưu thoát): mã nhóm nguồn của `luu-thoat.theo_nguon` (`NOI_TINH`, `KHONG_RO_NGUON` hoặc mã đường thư đến). |

Tên route: giữ đúng đề xuất của ticket (không có mẫu QUYTG khác cần theo; QUYTG dùng `from`/`to` và `quy-thoi-gian/tong-hop`, KTT dùng `tu`/`den` theo ticket).

### Quy tắc tham số
- `tu`, `den` (`YYYY-MM-DD`) **bắt buộc** (như QUYTG: thiếu → 400 «Thiếu tham số "tu" hoặc "den"»), ngày phải có thật (31/04 → 400), `tu` ≤ `den`, khoảng **≤ 31 ngày** (quá → «Khoảng ngày tối đa 31 ngày…»). Khóa lạ → 400 `Tham số không hỗ trợ: "x"` (kể cả `tu[a]`); tham số lặp hoặc không phải chuỗi → 400.
- `chi-tiet`: `loai` bắt buộc; `page` ≥ 1 (mặc định 1); `page_size` 1..200 (mặc định 50); `ma_bcvh` một trong 6 BCVH Huế.
- Giá trị chỉ đi vào tham số truy vấn (`@tuGio`, `?`), sau khi đã kiểm bằng biểu thức chính quy / danh sách trắng → chuỗi độc hại bị 400, không chạm SQL (có test: bảng còn nguyên).
- Sắp xếp `chi-tiet`: theo SHBG (thứ tự đọc của `kttQuery`), ổn định giữa các trang. Dòng chi tiết chỉ có trường nghiệp vụ (SHBG, số hiệu BD8 / BD10, giờ, BCVH, nhãn); **không** có tên người, biển số, lái xe, tài khoản.

## 3. «Bây giờ» và độ mới
Mọi tính toán dùng **độ mới dữ liệu** (`kttNapCap.docDoMoi`) làm «bây giờ», không đọc đồng hồ máy. Chưa có cặp `OK` nào → kết quả rỗng có lý do `CHUA_CO_DU_LIEU` (không lỗi).

## 4. Cache (trong bộ nhớ tiến trình, không bảng DB) — `server/lib/kttApi.js`
Theo mẫu `quyThoiGianCache.js` (`dauHieuDb` = `data_version` + `total_changes`; chữ ký theo ngày như QUYTG-9a; trần tuổi).
- **luu-thoat: mỗi NGÀY một mục.**
  - Ngày **chưa chốt**: hợp lệ khi tuổi < **10 phút** VÀ cùng độ mới VÀ cùng dấu hiệu DB. Nạp lần mới (độ mới đổi) → tính lại.
  - Ngày **đã chốt** (`da_chot`) **TRONG cửa sổ nạp** (từ độ mới dữ liệu lùi **8 ngày** trở lại; mỗi lần xuất lùi 7 ngày + 1 ngày đệm): vô hiệu khi **độ mới đổi**, kể cả đã chốt — vì UPSERT cập nhật dòng tại chỗ (ví dụ thêm BD10 đi) mà số dòng và tổng id không đổi nên chữ ký không bắt được. Vẫn giữ tối đa 6 giờ và bỏ sớm khi chữ ký đổi.
  - Ngày đã chốt **CŨ HƠN** cửa sổ (không còn nằm trong ảnh chụp nào nên không được nạp cập nhật nữa): hợp lệ khi tuổi < **6 giờ** VÀ chữ ký ngày không đổi (số dòng + tổng id của túi quét đến trong ngày). Độ mới đổi hay ghi DB không liên quan **không** làm tính lại.
  - Khoảng ngày chỉ tính phần ngày chưa có (hoặc hết hạn) trong cache; các ngày ghép lại bằng `ghepKhoang` cho kết quả như tính cả khoảng (có test so khớp trực tiếp).
  - Hai request cùng cần một ngày: dùng chung lần tính đang chạy.
- **tong-hop, chi-tiet:** mục theo cả khoảng / tham số (tối đa 200), tuổi < 10 phút, cùng độ mới, cùng dấu hiệu DB. Không tách theo ngày vì kết quả không cộng được từng ngày (ví dụ `bd10Den` đếm BD10 khác nhau, bảng theo giờ / theo BCVH gộp nhiều ngày).
- **Vô hiệu chung:** đổi tham số hệ thống (`thamSo.phienBan`) hoặc đổi lịch chuyến (`ktt_lich_chuyen`, `ktt_lich_cau_hinh`) → xóa hết.
- **Giới hạn đã biết:** ngày đã chốt CŨ HƠN cửa sổ nạp giữ kết quả tối đa 6 giờ và không thấy sửa tại chỗ không đổi số dòng (nhưng ngày đó không còn được nạp cập nhật); `bay_gio` / `nguon_xuat_luc_moi_nhat` của phản hồi luôn là độ mới hiện tại. Ngày trong cửa sổ luôn được tính lại sau mỗi lần nạp (tối đa 9 ngày × ≈ 0,1 giây). Giống QUYTG (chốt tuổi bù lại).

## 5. Không làm đứng máy chủ
- **luu-thoat:** tính TỪNG NGÀY; trước mỗi ngày tính `await setImmediate` (nhường vòng lặp) nên request khác (ví dụ `/meta`) được phục vụ giữa các ngày. Mỗi ngày là một lượt đọc đồng bộ ngắn (≈ 0,1 giây trên dữ liệu cỡ tuần × 4,4).
- **tong-hop, chi-tiet:** chạy ở **worker_thread riêng** (`server/lib/kttWorker.js`, kết nối chỉ đọc tới cùng file DB, WAL) nên không chặn luồng chính; DB trong bộ nhớ hoặc worker không chạy được → chạy thẳng sau khi nhường vòng lặp (ghi một dòng log). Lý do khác đề xuất «từng ngày + `setImmediate`» cho mọi route: kết quả `tong-hop` không cộng được từng ngày, và con trỏ `.iterate()` không được giữ qua điểm nhường (request khác dùng chung kết nối). `dongNen()` dừng worker khi cần (cuối test).
- **Biến môi trường tùy chọn `KTT_WORKER`:** đặt `0` thì `tong-hop` / `chi-tiet` chạy thẳng trong tiến trình chính, không dùng worker (kết quả y hệt; dùng khi worker không chạy được hoặc để gỡ lỗi); không đặt hoặc giá trị khác `0` = dùng worker (mặc định). Đọc mỗi lần gọi, không cần khởi động lại. Không thêm vào `docker-compose.yml` / `.env.nas.example` / `Dockerfile`. `Dockerfile` có `COPY server ./server` nên `kttWorker.js` nằm trong image.
- **Bộ nhớ đệm `xepChuyen`** (`kttLichChuyen.js`, CHỈ thêm bộ nhớ đệm, quy tắc không đổi): trong một lần tính (khóa ngoài = chính mảng lịch, `WeakMap`), nhớ theo (BCVH, giờ quét đến, hạn); kết quả đóng băng; `xepChuyenKhongDem` giữ bản gốc (test so khớp trên > 8.000 tổ hợp, gồm Chủ nhật, qua đêm, cuối tháng / năm, 29/02).

## 6. Tham số hệ thống
`ktt_gio_chot_ngay` (mặc định `'09:00'`, `gio_hhmm`, nhóm mới **«Hàng tại KTT»** `hang_tai_ktt`, `server/config/tham-so.js` + `tham-so-mac-dinh.js`, đọc qua `server/config/ktt-nap.js` `GIO_CHOT_NGAY`): ngày D `da_chot` khi độ mới ≥ giờ này của ngày D+1. Đổi → `da_chot` và cache đổi ngay; xóa / hỏng ghi đè → mặc định 09:00, không ném lỗi. **Hạn 60 phút** (`han_den_truoc_chuyen_phut`) giữ ở `ktt_lich_cau_hinh` (KTT-7a), không chuyển sang `tham_so`. Danh bạ: 39 khóa (32 sửa được + 7 chỉ-đọc).

## 7. Hiệu năng (dữ liệu giả 31 ngày: 33.201 túi / 332.010 dòng; `KTT_PERF=1`; máy dev; HTTP)
| | 1 ngày | 7 ngày | 31 ngày |
|---|---|---|---|
| `luu-thoat` nguội — mốc KTT-7b (một lượt, không đệm `xepChuyen`) | 0,18 s | 1,2 s | 5,3 s |
| `luu-thoat` nguội — qua API, TRƯỚC đệm `xepChuyen` | 0,20 s | 1,21 s | 5,59 s |
| `luu-thoat` nguội — qua API, SAU đệm `xepChuyen` | **0,095 s** | **0,69 s** | **2,92 s** |
| `luu-thoat` nóng (cache) | | | **14 ms** |
| `tong-hop` nguội (worker) / nóng | | | 7,5 s (không chặn máy chủ) / 6 ms |
| `chi-tiet` (t1, trang 200 dòng) | | | 2,8 s |

10 request `luu-thoat` 7 ngày song song, nguội: 3,2 s (dùng chung lần tính từng ngày). `/meta` rảnh 2 ms; khi 6 request nặng đang chạy 0,62 s (chờ các lượt ngày đang xếp hàng; không bị chặn tới khi xong cả khoảng). Hướng tối ưu thêm (chưa làm): `luu-thoat` 31 ngày vẫn ≈ 3 giây ở lần nguội đầu — còn lại chủ yếu là phân tích chuỗi giờ trong `kttLichChuyen.giayCua / dinhDang` và truy vấn nối `duyetShbg`; có thể làm nóng cache sau mỗi lần nạp (KTT-6 gọi `luuThoat` cho ~7 ngày gần nhất).

## 8. Điều chưa chắc
- `tong-hop` / `chi-tiet` nguội 31 ngày vài giây (ở worker) — chấp nhận được vì không chặn; nếu giao diện hay gọi 31 ngày nên làm nóng cache.
- Worker cần quyền ghi thư mục DB (WAL chỉ đọc cần tệp `-shm`); trên NAS thật chưa thử.
- Chưa giao diện (KTT-9); xuất xlsx sheet 7 đã có (KTT-8b, mục 10), sheet 8 chưa (KTT-8c).

## 9. Test (KTT-8; test xuất xlsx ở mục 10)
`tests/ktt-api.test.js` (26 ca; 1 ca đo hiệu năng cần `KTT_PERF=1`): quyền cho mọi route (401 / 200 / 200 / 403 / 403, route lạ, chỉ GET), kiểm tĩnh router, tham số sai (19 tình huống), chống chèn SQL, khớp trực tiếp hàm gốc, chưa có dữ liệu, chỉ đọc, `meta`, cache (lần 2, mở rộng khoảng, độ mới đổi, ngày đã chốt trong cửa sổ nạp có BD10 đi cập nhật tại chỗ, chữ ký, tuổi, ghi DB không liên quan, `tong-hop` / `chi-tiet`), `KTT_WORKER=0`, tham số giờ chốt, nhường vòng lặp, dùng chung lần tính, chi tiết (phân trang, tổng khớp mọi nhóm, không rò cá nhân), đệm `xepChuyen` (so khớp bản không đệm). Sửa `tests/tham-so.test.js` (38→39 khóa; 31→32 sửa được; thêm `ktt_gio_chot_ngay` vào bảng getter).

## 10. KTT-8b — Xuất xlsx sheet 7 «Hàng rớt lại / Lưu thoát»

`GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=&ma_bcvh=&nguon=]` (dưới `requireRoles(ADMIN, TTVH)` như mọi route KTT; không token 401, GDVH / TIVI 403). Trả file `.xlsx`, tên `KTT_LuuThoat_<tu>_<den>.xlsx` (ASCII), `Content-Disposition: attachment`, `Cache-Control: no-store`.
Chưa có nút trên giao diện (KTT-9); chưa có sheet 8 (KTT-8c); không xuất các sheet 1–6.

**Tham số:** `tu`, `den` như mọi route KTT (YYYY-MM-DD, ngày có thật, ≤ 31 ngày, khóa lạ → 400). `trang_thai` tùy chọn, cùng danh sách giá trị với `chi-tiet` (nhóm lưu thoát: `t1`…`t5`, `dang_cho_chuyen`, `hang_hoan`, `dat`, `khong_dat`, `chua_di`, `chua_do_duoc`, `xnd_sau_gio_di`, `khong_ro_dich`, `ngoai_pham_vi`, `khong_co_gio_quet_den`, `khong_xep_duoc_chuyen`); bỏ trống = tất cả SHBG. KTT-8c: thêm `ma_bcvh` và `nguon` (cùng quy tắc như `chi-tiet`, dùng chung `duyetLuuThoat`); `trang_thai` nhận thêm `ro_lai`, `truot_chuyen`. Sheet «Thông tin» ghi cả ba bộ lọc; «Số dòng kiểm tra» là số dòng thật, dòng «Đối chiếu» so với ô tương ứng của `luu-thoat` (`kttXuat.soKhop`) hoặc ghi «không đối chiếu được» khi màn hình không có số cho tổ hợp lọc đó (ví dụ chỉ lọc nguồn, vì `theo_nguon` chỉ gồm SHBG đã phân loại). Không nhận các `loai` cũ của `chi-tiet` (`treo`, `nam_lau`…).
**Mọi kiểm tra và tính toán xong TRƯỚC khi gửi header** → lỗi vẫn là JSON `400 { error, ma }`. Quá trần dòng: `400 KTT_QUA_NHIEU_DONG` «Có N dòng, vượt giới hạn 200000 dòng mỗi file: hãy thu hẹp khoảng ngày hoặc thêm bộ lọc "trang_thai".»

**Nguồn dữ liệu (không tính lại quy tắc nào):**
- Dòng SHBG: `kttLuuThoatQuery.duyetLuuThoat` — lượt duyệt DÙNG CHUNG với `danhSachLuuThoat` (`chi-tiet`; đã tách ra, hành vi `chi-tiet` không đổi) → `kttLuuThoat.phanLoaiShbg`. Một dòng = một SHBG khác nhau; không lọc thì số dòng = `tong_cong.tong_shbg_ngay` của `luu-thoat` (gồm cả đích không rõ, ngoài phạm vi, thiếu giờ quét đến, không xếp được chuyến, hàng hoàn). Sắp theo (ngày D, SHBG).
- Cột «đã chốt» và «độ mới»: gọi `kttApi.luuThoat` ⇒ CÙNG cache theo ngày với `/luu-thoat` (ngày đã nóng không tính lại); đổi `ktt_gio_chot_ngay` hoặc lịch chuyến thì cache bị xóa như mọi route. Chuyến liền kề và hạn đến đọc từ `ktt_lich_chuyen` / `ktt_lich_cau_hinh` ở mỗi lần xuất (không cache riêng).
- Thêm 2 trường vào lượt đọc SHBG của `kttQuery.js` (chỉ để xuất, không dùng để tính): `duongThuDenMa`, `duongThuDenTen` (`bd10_den_ma_duong_thu` / `bd10_den_ten_duong_thu` của túi đến ghép).

**Không làm đứng máy chủ:** dựng danh sách SHBG chạy ở **worker_thread** (`kttWorker.js`, tác vụ `xuatLuuThoat`; DB file như các tác vụ nặng khác; DB trong bộ nhớ chạy thẳng sau khi nhường vòng lặp). Worker trả sẵn mỗi dòng là mảng ô (≤ trần). Ghi file ở luồng chính bằng ExcelJS `WorkbookWriter` (đã có trong `package.json`, cùng mẫu `arrivalsExport.js`: ghi luồng thẳng vào response), cứ 1.000 dòng nhường vòng lặp (`setImmediate`) và chờ khi bộ đệm ghi > 2 MB; client ngắt thì hủy file. Nhật ký bảo mật: sự kiện `ktt_export` (ai, khoảng ngày, bộ lọc, số dòng, trạng thái) — **không** có số hiệu bưu gửi.
**Trần:** 200.000 dòng sheet 7 mỗi file (`kttXuat.TRAN_DONG_MAC_DINH`; biến môi trường `KTT_XUAT_TRAN_DONG` chỉ để test). Dữ liệu giả 31 ngày ở cỡ ≈ 7.100 SHBG / ngày (≈ 221.000 dòng) vượt trần: cần thu hẹp hoặc lọc.

**File: đúng hai sheet theo thứ tự.**
1. «Thông tin» (hai cột «Mục», «Nội dung ghi trong sheet»): Cửa sổ; Dữ liệu đến (`nguon_xuat_luc_moi_nhat`); Chốt số theo ngày («đã chốt» / «số tạm» từng ngày); Ngày xuất, người xuất (giờ VN, tên đăng nhập — không token, không email); Trạng thái số liệu; Định nghĩa năm trạng thái / đang chờ chuyến / hàng hoàn Tổ KHHH / cột đạt - không đạt (Không tính, Loại trừ) / mốc chuyến và hạn đến (đọc hạn từ cấu hình) / hai mốc giờ đến; Đơn vị; **Số dòng kiểm tra** (số, = số dòng sheet 7); Đối chiếu với màn hình Lưu thoát (số SHBG của `luu-thoat` cùng khoảng và bộ lọc, ghi «khớp» hoặc «KHÔNG khớp»).
2. «7 Hàng rớt lại» — 17 cột:

| # | Cột | Nguồn |
|---|---|---|
| 1 | SHBG (văn bản) | `u.shbg` |
| 2–3 | Đường thư đến (tên, mã) | `bd10_den_ten_duong_thu`, `bd10_den_ma_duong_thu` của túi đến ghép (mới đưa vào lượt đọc) |
| 4 | Giờ quét túi đến KTT | `u.quetDen` (`gio_quet_tui_den`; mốc xếp chuyến, lưu thoát) |
| 5 | Giờ xác nhận BD10 đến (ConfirmDate) | `u.xndBd10` (`bd10_den_xnd`; mốc đạt / không đạt) |
| 6 | KL (kg) | `khoi_luong_thuc_te_g / 1000`, định dạng `0.000`; trống nếu thiếu |
| 7–8 | BCVH đích (mã, tên) | `u.maBcvh`; tên từ `DIA_BAN_PHAT_MAC_DINH` |
| 9 | Chuyến liền kề | `kq.chuyen` của `xepChuyen`: «Thuận Hóa 07:00 (20/10/2026)» |
| 10 | Giờ xuất phát | `chuyen.xuat_phat_luc` |
| 11 | Hàng đến muộn nhất để kịp chuyến | `chuyen.han_den_luc` (= xuất phát − `han_den_truoc_chuyen_phut`) |
| 12 | Giờ lập BD10 đi | `u.gioBd10Di` (lần đi cuối) |
| 13 | Giờ chờ tính chỉ tiêu (giờ) | `datKhongDat.thucGiay / 3600` (bỏ 21:00–07:00 từ ConfirmDate; có thể âm khi xác nhận sau giờ đi) |
| 14 | Đạt / không đạt chỉ tiêu 14 giờ | `datKhongDat.trangThai` → Đạt / Không đạt / Chưa đi / Chưa đo được / Xác nhận đến sau giờ lập BD10 đi; hàng hoàn Tổ KHHH → «Loại trừ»; hàng thiếu giờ quét đến / không xếp được chuyến (không vào tổng của `luu-thoat`) → «Không tính». Số «Đạt» + «Không đạt» trong file = `dat_khong_dat.dat` + `khong_dat` của `luu-thoat` cùng khoảng (có test) |
| 15 | Phân loại | nhóm: «Đã phân loại 5 trạng thái», «Đang chờ chuyến», «Hàng hoàn Tổ KHHH», «Đích không rõ», «Ngoài phạm vi (loại đích)», «Thiếu giờ quét túi đến», «Không xếp được chuyến (lý do)» |
| 16 | Trạng thái (1–5) | «1 – Đi trong ngày, đúng chuyến», «2 – Đi trong ngày, trượt chuyến», «3 – Đi hôm sau, đúng chuyến», «4 – Đi hôm sau, trượt chuyến», «5 – Từ 2 ngày hoặc chưa đi», «Đang chờ chuyến…»; trống nếu không phân loại được |
| 17 | Ngày lưu thoát (ngày D) | `u.ngayDen` |

**Kiểu ô:** SHBG và mọi cột chữ là văn bản (`numFmt '@'`, giá trị chuỗi nên không bao giờ là công thức, kể cả bắt đầu bằng `= + - @`; ký tự cấm của XML bị bỏ, cắt ở 32.767 ký tự). Cột giờ là ô ngày giờ thật định dạng `dd/mm/yyyy hh:mm:ss`: giá trị = `Date.UTC` của các số trong chuỗi giờ nguồn (không `new Date(chuỗi)`), nên Excel hiển thị đúng giờ Việt Nam của dữ liệu ở mọi múi giờ máy chủ. Cột khác (KL, giờ chờ) là số.
**Hiệu năng** (dữ liệu giả 31 ngày: 33.201 túi / 332.010 dòng nguồn; máy dev; `KTT_PERF=1`; qua HTTP; trần nâng lên 400.000 cho ca 31 ngày): xuất 1 / 7 / 31 ngày = 0,81 / 3,5 / 16,4 s nguội (file 0,54 / 3,8 / 16,8 MB; ≈ 7.100 / 49.700 / 221.000 dòng); RSS tiến trình test tăng tối đa 120 / 191 / 326 MB. Ghi file ở luồng chính chiếm phần lớn thời gian (nhường vòng lặp mỗi 1.000 dòng; `/meta` vẫn trả lời trong lúc xuất — có test).
**Test:** `tests/ktt-xuat.test.js` (18 ca + 1 ca đo hiệu năng cần `KTT_PERF=1`): quyền, tham số sai + chống chèn SQL, hai sheet đúng tên / thứ tự / tiêu đề, khớp `luu-thoat` và từng dòng của `chi-tiet`, bộ lọc `trang_thai` (mọi giá trị), hàng hoàn «Loại trừ», ngày trống, kiểu ô và múi giờ, ô trống khi thiếu dữ liệu, chống công thức, đổi giờ chốt / hạn đến / tắt chuyến, dùng chung cache, trần dòng, nhường vòng lặp (31 ngày), kiểm tĩnh.
**Điều chưa chắc:** (1) cột 14 «Không tính» khác `datKhongDat` thô của `chi-tiet` ở các hàng không phân loại được (PO chốt 27/10/2026); (2) giữ cả hai cột giờ đến (4 và 5) là đề xuất của CTO, PO chưa duyệt riêng.

## 11. KTT-8c — trường bổ sung (chỉ thêm, không đổi nghĩa trường cũ)
- `/luu-thoat`: `kg` ở mọi khối và mọi `trang_thai.<t>`; `theo_nguon` ở mỗi ngày và `tong_cong`; `meta.shbg_thieu_khoi_luong`. Định nghĩa đầy đủ: `41_KTT_LUU_THOAT.md` mục 11. Nằm trong kết quả TỪNG NGÀY của cache hiện có (không cache mới; đổi tham số / lịch vẫn xóa hết).
- `/chi-tiet`: 17 trường snake_case của sheet 7 cho mọi dòng nhóm lưu thoát (cùng `kttDong.dongChiTiet` với file xlsx, nên khớp từng ô); `loai` thêm `ro_lai`, `truot_chuyen`; tham số `nguon` (kiểm bằng biểu thức chính quy `[chữ số _ . - /  khoảng trắng]{1,40}`, chỉ dùng để so sánh chuỗi; sai định dạng, lặp tham số, hoặc dùng với `loai` cũ → 400 `KTT_NGUON_SAI`; mã đúng định dạng nhưng không có SHBG nào → danh sách rỗng 200). `meta` có thêm `nguon`. Mục cache của `chi-tiet` có `nguon` trong khóa.
- `/xuat/luu-thoat`: thêm `ma_bcvh`, `nguon` (mục 10).
- Hàng thiếu khối lượng: `kg` của dòng chi-tiet / ô xlsx là null / trống, còn ở tổng tính 0 và đếm vào `meta.shbg_thieu_khoi_luong`.
