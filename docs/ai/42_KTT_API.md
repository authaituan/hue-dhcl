# 42 · KTT-8 — API `/api/ktt/*`, cache theo ngày, tham số giờ chốt

Đưa phần tính toán «Hàng tại KTT» (`tongHopKtt`, `luuThoatTheoNgay`, `chiTiet`, `taoDanhGia`) ra API **chỉ đọc**, cho **ADMIN, TTVH và TTKT**, có cache theo ngày và không làm đứng máy chủ.
Chưa có giao diện (KTT-9). Xuất xlsx sheet 7 «Lưu thoát»: KTT-8b (mục 10); sheet 8 «Hôm sau / chưa đi trên 24 giờ»: KTT-8c (chưa làm). Dữ liệu trong tài liệu này là dữ liệu giả.

## 1. Quyền và mount
- Router `server/routes/ktt.js`, mount **riêng** `app.use('/api/ktt', kttRoutes)` ở `server/index.js`; `router.use(requireRoles(ADMIN, TTVH, TTKT))` đứng đầu router nên route thêm sau này cũng bị chặn mặc định. KHÔNG đặt dưới `/api/arrivals` (đường đó mở cả GDVH).
- Không token → 401 (lớp `authRequired` chung của `/api`); ADMIN, TTVH, TTKT → 200 (TTKT chỉ GET, allowlist theo vai trò, mục 18); **GDVH → 403**; **TIVI → 403** (allowlist `server/lib/tivi.js` từ chối mặc định, không sửa `tivi.js` / `roles.js`; chỉ kiểm bằng test). ADMIN và TTVH thấy CÙNG số liệu (không lọc theo BCVH được giao). Mọi route chỉ `GET`, không ghi DB. `Cache-Control: no-store` của `/api/*` giữ nguyên.
- Khác mẫu QUYTG: QUYTG nằm dưới `/api/arrivals/quy-thoi-gian*` (guard `viewerGuard` = ADMIN, TTVH, GDVH, TIVI qua allowlist) — không dùng được cho KTT vì cần loại GDVH.

## 2. Route
Lỗi tham số → **400** `{ error (tiếng Việt, nêu tham số sai), ma: 'KTT_…' }`; lỗi khác → 500 `{ error: 'Lỗi hệ thống khi đọc dữ liệu Hàng tại KTT', ma: 'LOI_HE_THONG' }` (log chỉ có mã lỗi, không số hiệu bưu gửi, không stack).

| Route | Trả về |
|---|---|
| `GET /api/ktt/meta` | `nguon_xuat_luc_moi_nhat`, `nap_luc`, `lich_chuyen` (14 dòng: `ma_bcvh`, `gio_xuat_phat`, `ngay_chay`, `nhan`, `dang_dung`), `han_den_truoc_chuyen_phut` (60, ở `ktt_lich_cau_hinh`), `gio_chot_ngay` ('09:00', tham số), `nguong` (`treo_phut`, `nam_lau_toi_da_phut`, `chi_tieu_f13_gio`, …), `chi_tieu_gio` (mặc định 14, ngoại lệ 12 giờ phường Thuận Hóa / Phú Xuân), `gioi_han`, `loai_chi_tiet`, `canh_bao`. Rẻ, không đệm; không tham số. Dùng cho dòng «dữ liệu đến <giờ xuất>». |
| `GET /api/ktt/luu-thoat?tu=&den=[&moc_chi_tieu=]` | Đúng kết quả `kttLuuThoatQuery.luuThoatTheoNgay` (xem `41_KTT_LUU_THOAT.md`) với cùng `mocChiTieu`: mỗi ngày `da_chot`, đủ ngày trong khoảng (ngày trống = 0), `meta.nguon_xuat_luc_moi_nhat`, `meta.moc_chi_tieu` (KTT-10c, mục 13). |
| `GET /api/ktt/tong-hop?tu=&den=` | `kttQuery.tongHopKtt` (khóa camelCase như KTT-5) + **`danh_gia`** (`taoDanhGia`) + `meta { nguon_xuat_luc_moi_nhat, bay_gio, ly_do }`. |
| `GET /api/ktt/chi-tiet?tu=&den=&loai=[&ma_bcvh=&nguon=&page=&page_size=]` | `{ items, pagination { total, page, page_size, total_pages }, meta }` (mẫu `/api/arrivals/items`). `loai` = loại cũ của `kttQuery.chiTiet` (`treo`, `nam_lau`, `tre_chuyen`, `lo_chuyen`, `den_sat_gio`, `xnd_sau_gio_di`, `can_kiem_tra_lai`, `khong_ro_dich`, `quet_den_sau_gio_di`) HOẶC nhóm lưu thoát: `t1`…`t5`, `dang_cho_chuyen`, `hang_hoan`, `dat`, `khong_dat`, `chua_di`, `chua_do_duoc`, `xnd_sau_gio_di`, `khong_ro_dich`, `ngoai_pham_vi`, `khong_co_gio_quet_den`, `khong_xep_duoc_chuyen`, và (KTT-8c) `ro_lai` (t3 + t4 + t5), `truot_chuyen` (trượt + lỡ chuyến). Dòng nhóm lưu thoát có thêm 19 trường snake_case (mục 11; KTT-10c thêm `chi_tieu_14h_xnd`, `chi_tieu_14h_quet_tui_den`, mục 13). `nguon` (KTT-8c, chỉ với nhóm lưu thoát): mã nhóm nguồn của `luu-thoat.theo_nguon` (`NOI_TINH`, `KHONG_RO_NGUON` hoặc mã đường thư đến). |
| `GET /api/ktt/xuat/hom-sau-chua-di?tu=&den=&loai=[&duong_thu=&noi_gui=&huong=&hang_hoan=&ma_bcvh=]` | KTT-8d: file .xlsx «Thông tin» + «8 Hôm sau-chưa đi», cùng tham số `/danh-sach` (mục 16). |

Tên route: giữ đúng đề xuất của ticket (không có mẫu QUYTG khác cần theo; QUYTG dùng `from`/`to` và `quy-thoi-gian/tong-hop`, KTT dùng `tu`/`den` theo ticket).

### Quy tắc tham số
- `tu`, `den` (`YYYY-MM-DD`) **bắt buộc** (như QUYTG: thiếu → 400 «Thiếu tham số "tu" hoặc "den"»), ngày phải có thật (31/04 → 400), `tu` ≤ `den`, khoảng **≤ 31 ngày** (quá → «Khoảng ngày tối đa 31 ngày…»). Khóa lạ → 400 `Tham số không hỗ trợ: "x"` (kể cả `tu[a]`); tham số lặp hoặc không phải chuỗi → 400.
- `chi-tiet`: `loai` bắt buộc; `page` ≥ 1 (mặc định 1); `page_size` 1..200 (mặc định 50); `ma_bcvh` một trong 6 BCVH Huế.
- `luu-thoat` (KTT-10c): `moc_chi_tieu` tùy chọn, `xnd` (mặc định; bỏ qua hoặc rỗng = `xnd`) hoặc `quet_tui_den`; giá trị khác → 400 `KTT_MOC_SAI` «Tham số "moc_chi_tieu" phải là một trong: xnd, quet_tui_den (mặc định xnd).»; lặp → 400. `tong-hop`, `chi-tiet`, `xuat/luu-thoat` KHÔNG nhận `moc_chi_tieu` (400 «Tham số không hỗ trợ»).
- Giá trị chỉ đi vào tham số truy vấn (`@tuGio`, `?`), sau khi đã kiểm bằng biểu thức chính quy / danh sách trắng → chuỗi độc hại bị 400, không chạm SQL (có test: bảng còn nguyên).
- Sắp xếp `chi-tiet`: theo SHBG (thứ tự đọc của `kttQuery`), ổn định giữa các trang. Dòng chi tiết chỉ có trường nghiệp vụ (SHBG, số hiệu BD8 / BD10, giờ, BCVH, nhãn); **không** có tên người, biển số, lái xe, tài khoản.

## 3. «Bây giờ» và độ mới
Mọi tính toán dùng **độ mới dữ liệu** (`kttNapCap.docDoMoi`) làm «bây giờ», không đọc đồng hồ máy. Chưa có cặp `OK` nào → kết quả rỗng có lý do `CHUA_CO_DU_LIEU` (không lỗi).

## 4. Cache (trong bộ nhớ tiến trình, không bảng DB) — `server/lib/kttApi.js`
Theo mẫu `quyThoiGianCache.js` (`dauHieuDb` = `data_version` + `total_changes`; chữ ký theo ngày như QUYTG-9a; trần tuổi).
- **luu-thoat: mỗi (MỐC, NGÀY) một mục** (KTT-10c: khóa `<moc_chi_tieu>|<ngày>`; hai mốc là hai mục riêng, mỗi mục theo đúng các quy tắc dưới).
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

`GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=&ma_bcvh=&nguon=]` (dưới `requireRoles(ADMIN, TTVH, TTKT)` như mọi route KTT; không token 401, GDVH / TIVI 403). Trả file `.xlsx`, tên `KTT_LuuThoat_<tu>_<den>.xlsx` (ASCII), `Content-Disposition: attachment`, `Cache-Control: no-store`.
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
1. «Thông tin» (hai cột «Mục», «Nội dung ghi trong sheet»): Cửa sổ; Dữ liệu đến (`nguon_xuat_luc_moi_nhat`); Chốt số theo ngày («đã chốt» / «số tạm» từng ngày); Ngày xuất, người xuất (giờ VN, tên đăng nhập — không token, không email); Trạng thái số liệu; Định nghĩa năm trạng thái / đang chờ chuyến / hàng hoàn Tổ KHHH / chỉ tiêu 14 giờ hai mốc (Không tính, Loại trừ, không có tỷ lệ «đạt» chung) / mốc chuyến và hạn đến (đọc hạn từ cấu hình) / hai mốc giờ đến; KTT-10c: ba dòng tổng hợp «Chỉ tiêu 14 giờ – Mốc A», «– Mốc B» («Đo được x/y: đạt a, không đạt b») và «– Không đo được» (theo lý do, từng mốc) lấy từ khối `chi_tieu_14h` của `luu-thoat` (tổng 6 BCVH hoặc BCVH đang lọc; không theo bộ lọc trạng thái / nguồn); Đơn vị; **Số dòng kiểm tra** (số, = số dòng sheet 7); Đối chiếu với màn hình Lưu thoát (số SHBG của `luu-thoat` cùng khoảng và bộ lọc, ghi «khớp» hoặc «KHÔNG khớp»).
2. «7 Hàng rớt lại» — 18 cột (KTT-10c: cột 14 cũ «Đạt / không đạt» một mốc thay bằng hai cột 14–15, mỗi cột một mốc):

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
| 14 | Chỉ tiêu 14 giờ – Mốc A (xác nhận BD10 đến → lập BD10 đi) | `chiTieu14h.xnd.trangThai` → Đạt / Không đạt / Không đo được (thiếu mốc) / Không đo được (mốc sau giờ lập BD10 đi) / Không đo được (chưa đi); hàng hoàn Tổ KHHH → «Loại trừ»; hàng thiếu giờ quét đến / không xếp được chuyến → «Không tính»; đích không rõ / ngoài phạm vi → trống. Đếm nhãn trong file = `chi_tieu_14h.theo_moc.xnd` của `luu-thoat` cùng khoảng; số dòng không phải Loại trừ / Không tính / trống = `mau_so` (có test) |
| 15 | Chỉ tiêu 14 giờ – Mốc B (quét túi đến KTT → lập BD10 đi) | `chiTieu14h.quet_tui_den.trangThai`, cùng nhãn như cột 14 (`theo_moc.quet_tui_den`) |
| 16 | Phân loại | nhóm: «Đã phân loại 5 trạng thái», «Đang chờ chuyến», «Hàng chuyển hoàn» (KTT-17-3b; trước là «Hàng hoàn Tổ KHHH»), «Đích không rõ», «Ngoài phạm vi (loại đích)», «Thiếu giờ quét túi đến», «Không xếp được chuyến (lý do)» |
| 17 | Trạng thái (1–5) | «1 – Đi trong ngày, đúng chuyến», «2 – Đi trong ngày, trượt chuyến», «3 – Đi hôm sau, đúng chuyến», «4 – Đi hôm sau, trượt chuyến», «5 – Từ 2 ngày hoặc chưa đi», «Đang chờ chuyến…»; trống nếu không phân loại được |
| 18 | Ngày lưu thoát (ngày D) | `u.ngayDen` |

**Kiểu ô:** SHBG và mọi cột chữ là văn bản (`numFmt '@'`, giá trị chuỗi nên không bao giờ là công thức, kể cả bắt đầu bằng `= + - @`; ký tự cấm của XML bị bỏ, cắt ở 32.767 ký tự). Cột giờ là ô ngày giờ thật định dạng `dd/mm/yyyy hh:mm:ss`: giá trị = `Date.UTC` của các số trong chuỗi giờ nguồn (không `new Date(chuỗi)`), nên Excel hiển thị đúng giờ Việt Nam của dữ liệu ở mọi múi giờ máy chủ. Cột khác (KL, giờ chờ) là số.
**Hiệu năng** (dữ liệu giả 31 ngày: 33.201 túi / 332.010 dòng nguồn; máy dev; `KTT_PERF=1`; qua HTTP; trần nâng lên 400.000 cho ca 31 ngày): xuất 1 / 7 / 31 ngày = 0,81 / 3,5 / 16,4 s nguội (file 0,54 / 3,8 / 16,8 MB; ≈ 7.100 / 49.700 / 221.000 dòng); RSS tiến trình test tăng tối đa 120 / 191 / 326 MB. Ghi file ở luồng chính chiếm phần lớn thời gian (nhường vòng lặp mỗi 1.000 dòng; `/meta` vẫn trả lời trong lúc xuất — có test).
**Test:** `tests/ktt-xuat.test.js` (19 ca + 1 ca đo hiệu năng cần `KTT_PERF=1`; KTT-10c thêm ca ba dòng tổng hợp chỉ tiêu 14 giờ và đổi ca cột 14 thành cột Mốc A / Mốc B): quyền, tham số sai + chống chèn SQL, hai sheet đúng tên / thứ tự / tiêu đề, khớp `luu-thoat` và từng dòng của `chi-tiet`, bộ lọc `trang_thai` (mọi giá trị), hàng hoàn «Loại trừ», ngày trống, kiểu ô và múi giờ, ô trống khi thiếu dữ liệu, chống công thức, đổi giờ chốt / hạn đến / tắt chuyến, dùng chung cache, trần dòng, nhường vòng lặp (31 ngày), kiểm tĩnh.
**Điều chưa chắc:** (1) «Không tính» (cột 14–15, và trường `dat_khong_dat` của `chi-tiet`) khác `datKhongDat` thô của `chi-tiet` ở các hàng không phân loại được (PO chốt 27/10/2026); (2) giữ cả hai cột giờ đến (4 và 5) là đề xuất của CTO, PO chưa duyệt riêng.

## 11. KTT-8c — trường bổ sung (chỉ thêm, không đổi nghĩa trường cũ)
- `/luu-thoat`: `kg` ở mọi khối và mọi `trang_thai.<t>`; `theo_nguon` ở mỗi ngày và `tong_cong`; `meta.shbg_thieu_khoi_luong`. Định nghĩa đầy đủ: `41_KTT_LUU_THOAT.md` mục 11. Nằm trong kết quả TỪNG NGÀY của cache hiện có (không cache mới; đổi tham số / lịch vẫn xóa hết).
- `/chi-tiet`: 17 trường snake_case (KTT-10c: 19; KTT-14: 21) cho mọi dòng nhóm lưu thoát (cùng `kttDong.dongChiTiet` với file xlsx, nên khớp từng ô); `loai` thêm `ro_lai`, `truot_chuyen`; tham số `nguon` (kiểm bằng biểu thức chính quy `[chữ số _ . - /  khoảng trắng]{1,40}`, chỉ dùng để so sánh chuỗi; sai định dạng, lặp tham số, hoặc dùng với `loai` cũ → 400 `KTT_NGUON_SAI`; mã đúng định dạng nhưng không có SHBG nào → danh sách rỗng 200). `meta` có thêm `nguon`. Mục cache của `chi-tiet` có `nguon` trong khóa.
- `/xuat/luu-thoat`: thêm `ma_bcvh`, `nguon` (mục 10).
- Hàng thiếu khối lượng: `kg` của dòng chi-tiet / ô xlsx là null / trống, còn ở tổng tính 0 và đếm vào `meta.shbg_thieu_khoi_luong`.

## 11.1. KTT-11b — `tong_shbg_ngay` theo BCVH và `ngoai_bay_chip` ở `/luu-thoat` (chỉ THÊM)
- Mỗi `theo_bcvh[mã]` (từng ngày và `tong_cong`) có `tong_shbg_ngay` = số dòng `/xuat/luu-thoat?ma_bcvh=<mã>` không lọc trạng thái (SHBG của khối + hàng hoàn nếu 533140). Mỗi ngày và `tong_cong` có `ngoai_bay_chip` (bốn nhóm không có chip trạng thái). Đẳng thức «Tất cả» và định nghĩa: `41_KTT_LUU_THOAT.md` mục 11.1. Nằm trong kết quả từng ngày của cache hiện có (không cache mới), không phụ thuộc `moc_chi_tieu`.
- `/xuat/luu-thoat`: sheet 7 có **18 cột** (không đổi); ghi chú «17 cột» ở tài liệu cũ là của KTT-8c (trước khi KTT-10c đổi cột 14).

## 12. KTT-10b — khối `chi_tieu_14h` (chỉ THÊM, không đổi nghĩa trường cũ)
- **Route không đổi, tham số không đổi.** `/luu-thoat` (và `tong_cong`, `theo_bcvh`, `hang_hoan`, từng ngày) thêm trường **`chi_tieu_14h`** ở MỌI khối, cạnh `dat_khong_dat` (giữ nguyên nhãn và số, mốc `xnd`). Định nghĩa đầy đủ: `37_KTT_QUY_TAC_TINH.md` mục 6.
- Hình dạng: `{ moc_mac_dinh, mau_so, do_duoc_ca_hai_moc, theo_moc: { xnd, quet_tui_den }, chat_luong_tui_den }`. Mỗi mốc: `{ moc, do_duoc (x), mau_so (y), dat, khong_dat, ty_le_dat_tren_do_duoc, khong_do_duoc { tong, thieu_moc, moc_sau_gio_di, chua_di }, chua_di_da_qua_chi_tieu, do_duoc_khong_do_duoc_o_moc_kia }`. `chat_luong_tui_den`: `khong_co_tui_di`, `nhieu_tui_den`, `tui_den_ghep_khac_goc`, `khac_ket_qua_neu_dung_tui_goc`. `ty_le_dat_tren_do_duoc` chỉ tính trên phần đo được, `null` khi `do_duoc = 0`; không có tỷ lệ «đạt» chung.
- `meta.moc.chi_tieu_14h` ghi nhãn hai mốc. Nằm trong kết quả TỪNG NGÀY của cache hiện có (cộng ngày bằng `kttLuuThoat.congChiTieu14h`; có test ghép = tính cả khoảng); không cache mới.
- ~~Tham số mốc chưa lộ ra API~~ — KTT-10c đã nối `moc_chi_tieu` vào `/luu-thoat` (mục 13); mốc mặc định vẫn `xnd`.
- Test: `tests/ktt-chi-tieu-hai-moc.test.js` (15 ca, gồm 3 ca của script kiểm 18/10, 20/10).

## 13. KTT-10c — `moc_chi_tieu` qua API, hai cột mốc trong xlsx (backend; giao diện chưa đổi)
- **`/luu-thoat?…&moc_chi_tieu=xnd|quet_tui_den`** (mặc định `xnd`): chuyển vào `mocChiTieu` của `luuThoatTheoNgay`, CHỈ chọn mốc nuôi khối `dat_khong_dat` (nhãn `dat_khong_dat.moc`, `meta.moc.chi_tieu`, `chi_tieu_14h.moc_mac_dinh`). Khối `chi_tieu_14h` luôn đủ hai mốc và cho cùng số ở hai giá trị (có test). `meta.moc_chi_tieu` = mốc đã dùng (có cả khi chưa có dữ liệu). Bỏ qua tham số → kết quả như trước cộng thêm `meta.moc_chi_tieu: 'xnd'`.
- Kiểm tham số: mục 2 «Quy tắc tham số». Lõi giữ lỗi riêng `KTT_MOC_SAI` cho tham số hàm `mocChiTieu`; API kiểm trước, thông báo nêu tên query.
- **Cache:** `kttApi.layNgay` nhận `mocChiTieu`, khóa mục ngày và khóa «dùng chung lần tính đang chạy» đều gồm mốc (`<moc>|<ngày>`); hai mốc không lẫn mục (có test đếm `ngayTinh`). `xuat/luu-thoat` gọi `luuThoat` mặc định (`xnd`) — dùng chung mục `xnd`.
- **`/tong-hop`, `/chi-tiet`, `/xuat/luu-thoat` không nhận `moc_chi_tieu`** (400). `/chi-tiet`: trường `dat_khong_dat` giữ nguyên (mốc `xnd`); thêm `chi_tieu_14h_xnd`, `chi_tieu_14h_quet_tui_den` (nhãn như cột 14–15 xlsx, cùng `kttDong.dongChiTiet`).
- **xlsx:** sheet 7 thành 18 cột (mục 10): bỏ cột «Đạt / không đạt» một mốc, thêm hai cột nhãn Mốc A / Mốc B; sheet «Thông tin» có ba dòng tổng hợp («đo được x/y», đạt, không đạt; không đo được theo lý do) và định nghĩa hai mốc. Không in tỷ lệ «đạt» chung (cũng không in `ty_le_dat_tren_do_duoc`).
- Test: `tests/ktt-api.test.js` (+4 ca: mặc định / hai giá trị / khối `chi_tieu_14h` không phụ thuộc tham số; đo được + không đo được = mẫu số ở mọi khối; tham số sai, lặp, route không nhận; cache theo mốc), `tests/ktt-xuat.test.js` (+1 ca, sửa 5 ca dùng cột cũ).
- Điều chưa chắc: số tổng hợp ở «Thông tin» lấy theo khoảng ngày (và BCVH nếu lọc), KHÔNG theo bộ lọc `trang_thai` / `nguon` — ghi rõ trong ô; nếu PO muốn số theo đúng dòng đang lọc thì phải đếm ở worker (ticket sau).

## 14. KTT-14 — tập SHBG gồm hàng chuyển tiếp (chỉ THÊM trường; số hiển thị thay đổi)
- Các route dựa trên lõi Lưu thoát (`/luu-thoat`, `/chi-tiet?loai=<nhóm lưu thoát>`, `/xuat/luu-thoat`) và các route KTT-12 dựa trên `chayShbg` (`dicungngay/*`, `rotlai/*`, `lich-xe/theo-duong-thu`, `lich-xe/theo-bcvh` phần SHBG, `danh-sach`, `tong-quan`) cùng dùng MỘT tập SHBG: khai thác lại + chỉ-chuyển-tiếp (`41` mục 13). Quyền, tham số, cache (khóa, hạn) không đổi; `/hang-den/*`, `lich-xe/gio-lap-bd10`, `/tong-hop` không đổi.
- `/luu-thoat`: thêm `theo_nguon_hang { khai_thac, chuyen_tiep }` ở mỗi ngày và `tong_cong`, và bốn bộ đếm `meta` (`shbg_chuyen_tiep`, `co_ca_hai_loai_tui`, `chuyen_tiep_nhieu_tui`, `chuyen_tiep_co_tui_di_khac`). `chi-tiet` thêm `nguon_hang`, `luong_tui` (21 trường); `danh-sach` thêm `nguon_hang`. Mặc định số hiển thị gộp cả hai cờ; chưa có tham số lọc theo cờ (giao diện tách sau, dùng `theo_nguon_hang`).
- Xlsx sheet 7: số dòng = `tong_shbg_ngay` mới (có test); vẫn 18 cột. Chip «Tất cả» và các chip: số lấy từ cùng `tong_shbg_ngay` / `trang_thai` nên tự khớp; KHÔNG sửa giao diện (KTT-11a/11c do bên giao diện).
- Hiệu năng: cửa sổ 30 ngày lần nguội tăng vì số SHBG gấp hơn hai lần (xem `43` mục 12); lần cache không đổi đáng kể.

## 15. KTT-16-1 — `GET /api/ktt/doi-chieu/do-phu` (độ phủ «Hàng đến BCVH»; route mới, không đổi route cũ)
- Cùng quyền (ADMIN + TTVH + TTKT), cùng quy tắc tham số (`tu`, `den` bắt buộc, ≤ 31 ngày, khóa lạ → 400) và hình thức lỗi như các route khác. Chỉ đọc `arrival_import_files` / `arrival_items`; KHÔNG chạm bảng `ktt_*`, nên cache riêng (theo `(tu, den)` + dấu hiệu DB, ≤ 10 phút) và KHÔNG qua `dongBoPhienBan` / độ mới KTT / worker.
- Schema, quy tắc cửa sổ đối chiếu và cờ «có thể dương tính giả»: `44_KTT_DO_PHU_BCVH.md`.

## 16. KTT-8d — Xuất xlsx sheet 8 «Hôm sau / chưa đi trên 24 giờ» (route mới) và bổ sung sheet «Thông tin»
`GET /api/ktt/xuat/hom-sau-chua-di?tu=&den=&loai=hom-sau|chua-di-24h[&duong_thu=&noi_gui=&huong=&hang_hoan=&ma_bcvh=]` — **CÙNG tham số và cùng kiểm tra với `/danh-sach`** (trừ `page`, `page_size`: gửi → 400 «Tham số không hỗ trợ»), để giao diện chuyển nguyên bộ tham số của ô đang mở (`KttDanhSachDiNgay`) sang nút xuất. Quyền như mọi route KTT (ADMIN, TTVH; GDVH / TIVI 403; không token 401). File `KTT_HomSauChuaDi_<loai>_<tu>_<den>.xlsx` (ASCII), hai sheet «Thông tin» + «8 Hôm sau-chưa đi»; cùng cách ghi luồng, kiểu ô, chống công thức, nhường vòng lặp và nhật ký `ktt_export` (`kind: 'hom-sau-chua-di'`, bộ lọc, số dòng; không SHBG) như sheet 7.
- **Nguồn dòng:** `kttDiNgayQuery.duyetDanhSach` (lượt duyệt + bộ lọc) và `dongDanhSach` (dòng) — `/danh-sach` dùng ĐÚNG hai hàm này (tách ra từ `danhSach`, hành vi không đổi), nên số dòng sheet 8 = `pagination.total` của `/danh-sach` cùng tham số, cùng tập SHBG (có test mọi ô × hai nhóm). Tính ở worker (`xuatHomSauChuaDi`), «bây giờ» = độ mới dữ liệu như `/danh-sach`. Sắp theo (ngày D, SHBG).
- **15 cột:** SHBG · Đường thư đến (tên, mã) · Nơi gửi BD10 đến (mã, tên) · Giờ đến KTT (quét túi đến) · KL (kg) · BCVH đích (mã, tên) · Giờ lập BD10 đi · Số giờ chờ (giờ đồng hồ, `0.0`; = `cho_gio` của `/danh-sach`, KHÔNG phải giờ chờ chỉ tiêu 14 giờ) · Nhóm («Hôm sau» / «Chưa đi trên 24 giờ») · Hướng (chữ) · Hàng hoàn Tổ KHHH (Có / Không) · Ngày đến KTT (ngày D).
- **Đối chiếu màn hình:** «Thông tin» có dòng «Đối chiếu với màn hình B» = `kttDiNgay.soOManHinh(bó B cùng khoảng, bộ lọc)` (cộng nhóm của các mục đường thư khớp bộ lọc — đúng ô B5 / bảng rớt lại / B1); lọc `ma_bcvh` → «không đối chiếu được». Bó B lấy từ CÙNG cache theo ngày với B1–B6.
- **Trần** 200.000 dòng (`KTT_XUAT_TRAN_DONG` chỉ để test): vượt → 400 `KTT_QUA_NHIEU_DONG` trước khi gửi file.
- **Sheet 7 theo ô (việc 3):** KHÔNG thêm tham số. `/xuat/luu-thoat` đã lọc theo đường thư bằng `nguon=<mã đường thư>` (hàng liên tỉnh: nhóm nguồn = mã đường thư đến) và theo ngày bằng `tu = den`; `nguon=<mã>&trang_thai=ro_lai` = cột «rớt lại» của bảng rớt lại theo đường thư (có test 4 khoảng; bản sao DB 5/5 đường thư lớn nhất). Cột «Danh sách» của B2 mở `/danh-sach` (hôm sau / chưa đi), nên xuất của nó là sheet 8.
- **«Thông tin» (cả hai file):** thêm định nghĩa dùng chung (`kttXuat.dinhNghiaChung`): rớt lại, hôm sau, chưa đi trên 24 giờ, xe Cấp 1, chuyến liền kề (KTT-8d2 đã bỏ định nghĩa «C1 / C2 / C3» và «C2»: chưa có căn cứ trong repo / chưa PO chốt; «xe Cấp 1» có căn cứ ở `41` / `43`). «Cửa sổ» ghi tên sheet và **ngày có dữ liệu thực tế** (sheet 7: ngày `co_du_lieu` của `/luu-thoat`; sheet 8: `ngay_dau`..`ngay_cuoi` của bó B). «Đơn vị» ghi từng sheet. Sheet 7 giữ mọi mục cũ (chỉ thêm 5 dòng định nghĩa trước «Đơn vị»).
- **Đo trên bản sao DB dev** (cửa sổ 30/09–29/10, 30 ngày; máy dev; gọi thẳng `kttApi`): ô lớn nhất `hom-sau` toàn bộ 55.973 dòng — chuẩn bị 22,6 s nguội / 21,5 s nóng, ghi xlsx 11,7 s; `chua-di-24h` toàn bộ 2.428 dòng — 28,1 s nguội / 17,6 s nóng, ghi 0,6 s. «Nóng» gần bằng «nguội» vì lượt duyệt SHBG ở worker không cache (chỉ bó B cache) — như `/danh-sach` lần đầu của mỗi ô.
- Test: `tests/ktt-xuat-sheet8.test.js` (11 ca; KTT-8d2 thêm 5 ca — mục 17).

## 17. KTT-8d2 — hợp đồng tham số của ô bấm (`/danh-sach` và `/xuat/hom-sau-chua-di`, dùng chung `docOBam`; không đổi route)
Giao diện (KTT-13d) phải gửi đúng quy ước dưới đây để số dòng danh sách / file = số trong ô B5 / bảng rớt lại. Backend không đổi cách tính ô, chỉ làm rõ và bổ sung tham số.

| Tham số | Giá trị | Nghĩa |
|---|---|---|
| `duong_thu`, `noi_gui` | một MÃ (không phải tên hiển thị) | So khớp đúng từng ký tự với mã sau khi bỏ khoảng trắng đầu / cuối (phân biệt hoa thường). Tham số cũng được bỏ khoảng trắng đầu / cuối. |
| | **`__RONG__`** (`kttNguon.MA_LOC_RONG`) | «Mã null, rỗng hoặc toàn khoảng trắng». Dùng cho dòng không có mã: bỏ tham số KHÔNG làm được việc này vì bỏ tham số = không lọc, ra mọi mã (bản sao DB: ô «không có mã đường thư» 146 dòng, bỏ tham số ra 2.049). Không trùng mã thật (mã thật không có `__`). |
| | vắng / rỗng | Không lọc. |
| `hang_hoan` | **`0`** hoặc `false` | LOẠI hàng hoàn (KTT-17-2: theo danh sách ItemReturn; dòng B5 thường, ô «nội tỉnh → BCVH» không phải dòng «Hoàn»). |
| | **`1`** hoặc `true` | CHỈ hàng hoàn (dòng B5 «Hoàn»). |
| | vắng / rỗng | Cả hai (không lọc). Dòng thường của B5 mà gửi rỗng sẽ lẫn hàng hoàn cùng (nơi gửi, đường thư) — nên gửi `0`. |
| | giá trị khác (`2`, `yes`, `01`) | 400 `KTT_THAM_SO_SAI`. Không phân biệt hoa thường với `true` / `false`. |

- **Mẫu cho một dòng B5 `r` của hướng `h`:** `duong_thu=<r.duong_thu_ma hoặc __RONG__>&noi_gui=<r.noi_gui_ma hoặc __RONG__>&huong=<h>&hang_hoan=<r.hang_hoan ? 1 : 0>`. Bảng rớt lại (hướng liên tỉnh): `duong_thu=<mã hoặc __RONG__>&huong=lien_tinh_den_bcvh`. `meta` của `/danh-sach` nhắc lại `duong_thu` / `noi_gui` / `hang_hoan` (true / false / null); sheet «Thông tin» ghi `__RONG__` thành «(không có mã)» và `hang_hoan=0` thành «không kể hàng hoàn».
- **Bộ kiểm mã `RE_MA_NGUON`** (`^[\p{L}\p{N}_.\-/ ]{1,40}$`, dùng chung `nguon`, `duong_thu`, `noi_gui`) GIỮ NGUYÊN: khảo sát trên bản sao DB dev (30 ngày; mọi mã đường thư đến và nơi gửi BD10 đến) cho thấy **không có MÃ thật nào bị từ chối** (mã 8–10 ký tự và 6 ký tự, không khoảng trắng đầu / cuối, không ký tự lạ). Thứ bị từ chối là TÊN hiển thị: 12/33 tên đường thư (dạng «có ngoặc», «dài hơn 40 ký tự») và 2/61 tên nơi gửi («có ngoặc», «ký tự lạ»), cùng nhãn «(không rõ đường thư)» của bảng rớt lại (dạng «có ngoặc»). Nếu giao diện gửi tên / nhãn thay vì mã thì lỗi 400 là đúng; nới regex để nhận ngoặc chỉ làm danh sách ra 0 dòng, nên không nới. Thông báo lỗi nay nói rõ «phải là MÃ (không phải tên hiển thị)». Test dạng giả: `tests/ktt-xuat-sheet8.test.js` (nhận khoảng trắng, chữ thường, `. - / _`, chữ có dấu, đúng 40 ký tự, `__RONG__`; chặn `' " ; % \ < > ( ) , | ``, xuống dòng, tab, 41 ký tự, rỗng, `${…}`). Giá trị chỉ dùng để SO SÁNH CHUỖI trong bộ nhớ, không vào SQL.
- Đối chiếu bản sao DB dev (27–29/10, đọc, đã xóa bản sao): mọi dòng B5 (3 mục, 104 dòng × 2 nhóm = 208 ô) và 13 dòng bảng rớt lại × 2 nhóm = 26 ô: số danh sách = số trong ô 234/234; 0 lỗi tham số.

## 15. KTT-17-3b — `theo_bcvh[mã].hang_hoan` và nhãn «Hàng chuyển hoàn» (chỉ THÊM field, đổi nhãn chữ)

- **`/luu-thoat`:** mỗi `theo_bcvh[mã]` (mã là từng BCVH trong 6 BCVH; ở từng ngày VÀ `tong_cong`) có thêm **`hang_hoan`** = khối hàng hoàn CỦA BCVH ĐÓ, **cùng hình dạng** với `tong_cong.hang_hoan` (`tong_shbg`, `kg`, `trang_thai` (mỗi trạng thái: `shbg`, `tui`, `kg`) t1…t5 + `dang_cho_chuyen`, `luu_thoat`, `dung_chuyen`, `chi_tiet_trang_thai_5`, `dat_khong_dat`, `khong_phan_loai`, `di_truoc_khi_den`, `chi_tieu_14h`). BCVH không có hàng hoàn: khối đủ khóa, số 0, KHÔNG null; ngày chưa có dữ liệu cũng có khối. Field cũ (`tong_shbg`, `tong_shbg_ngay`, `trang_thai`…) giữ nguyên.
- **Đẳng thức (có test `tests/ktt-hang-hoan-theo-bcvh.test.js`):** tổng `theo_bcvh[m].hang_hoan` trên 6 BCVH = `tong_cong.hang_hoan` ở mọi trường số cộng được (SHBG, kg, trạng thái, đúng / trượt chuyến, đạt / không đạt, chỉ tiêu 14 giờ); `theo_bcvh[m].hang_hoan.tong_shbg` = `theo_bcvh[m].tong_shbg_ngay − theo_bcvh[m].tong_shbg`. Ngoại lệ DUY NHẤT: số **túi** (`trang_thai.*.tui`) không cộng được, vì một túi đến có thể chứa hàng hoàn đi nhiều BCVH (tổng theo BCVH ≥ số túi chung); các `ty_le*` tính lại theo từng khối, không cộng.
- **`/chi-tiet`:** mỗi `items[]` thêm **`hang_hoan` (boolean)**: `true` khi SHBG thuộc nhóm hàng chuyển hoàn; giao diện dùng cờ này thay vì so chuỗi `phan_loai`. Chỉ có ở chi-tiet, KHÔNG thêm cột vào xlsx sheet 7.
- **Nhãn «Hàng chuyển hoàn»** thay «Hàng hoàn Tổ KHHH» ở: `items[].phan_loai` của `/chi-tiet` và cột «Phân loại» xlsx sheet 7 (`kttDong.NHAN_HANG_HOAN`); tiêu đề cột «Hàng chuyển hoàn» (Có / Không) xlsx sheet 8 (`kttXuat.js`); câu bộ lọc «… hàng chuyển hoàn: chỉ hàng hoàn / không kể hàng hoàn …» ở «Thông tin» sheet 8. Tên khóa API không đổi.
- **Cache:** `theo_bcvh[m].hang_hoan` đi cùng cache theo ngày (`congCacNgay` / `ghepKhoang` cộng khối này), nên đổi theo phiên bản danh sách hàng hoàn như phần còn lại (KTT-17-2).
- `kttXuat.soKhop` dùng `theo_bcvh[m].hang_hoan.tong_shbg` làm số hoàn của BCVH (trước: `tong_shbg_ngay − tong_shbg`), cùng giá trị.


## 18. KTT-ROLE-1 — vai trò TTKT (Trung tâm Khai thác, `04_DECISIONS.md` #123)
- TTKT được **GET toàn bộ `/api/ktt/**`** (kể cả `/xuat/*`, `/doi-chieu/*`, `/doi-chieu/xuat/*`), thấy ĐỦ 6 BCVH (không lọc theo BCVH), cùng số liệu với ADMIN / TTVH. Ngoài ra chỉ `GET /api/auth/me` và `PUT /api/users/me/password`.
- **Chỉ GET:** POST / PUT / PATCH / DELETE (và HEAD) trên `/api/ktt/*` → 403 ở `authRequired` (allowlist `server/lib/allowlistVaiTro.js`, từ chối mặc định), trước cả `requireRoles`. Khác ADMIN: ADMIN POST vào route KTT nhận 404 (không có route).
- Mọi nhóm khác (Sản lượng `/api/arrivals/*`, Quỹ thời gian, Phát, Nạp nguồn kể cả `/nap-nguon/ktt/trang-thai`, Tham số, Người dùng, Mạng lưới, `/api/dashboard/*`, `/api/organization/*`, route thêm sau này) → 403.
- Khớp tiền tố theo ĐOẠN đường dẫn (`/api/ktt/` khớp, `/api/kttx` không); đường dẫn được chuẩn hoá trước khi so (bỏ query, giải mã một lần — còn `%` hoặc dấu gạch chéo ngược thì từ chối, chữ thường, gộp `//`, xử lý `..`, bỏ `/` cuối).
- Token TTKT hạn 8 giờ (`JWT_EXPIRY`, như ADMIN / TTVH / GDVH), KHÔNG dùng hạn 90 ngày của TIVI. Quyền theo vai trò trong DB, đổi vai trò có hiệu lực ngay.
- Test: `tests/ktt-vai-tro-ttkt.test.js` (+ ca TTKT trong `roles.test.js` và các `ktt-*.test.js`).
- `/luu-thoat` (KTT-RL-1): thêm `ro_lai_truot_chuyen` vào mỗi nhóm của `theo_nguon` và mỗi `theo_bcvh[mã]` trong nhóm (ở mỗi ngày và `tong_cong`). Chỉ thêm trường, không đổi trường cũ; định nghĩa ở `41_KTT_LUU_THOAT.md`. Cần khởi động lại máy chủ sau khi triển khai (bộ nhớ đệm theo ngày nằm trong tiến trình).

## 19. KTT-KD-1 — «Vì sao không đạt 14 giờ» (route mới, chi-tiet mới, xlsx sheet 10; chỉ THÊM)

Quyền như mọi route KTT (ADMIN, TTVH, TTKT; GDVH, TIVI 403; chỉ GET). Mọi JSON dưới đây là **dữ liệu giả**. Định nghĩa nhóm: `41_KTT_LUU_THOAT.md` mục 19.

**1. `GET /api/ktt/luu-thoat`** — mỗi khối `chi_tieu_14h.theo_moc.{xnd,quet_tui_den}` của `tong`, `theo_bcvh[mã]`, `theo_nguon_hang.*.tong` (mỗi ngày và `tong_cong`) có thêm `nguyen_nhan` (khối hàng hoàn KHÔNG có):
```json
"nguyen_nhan": {
  "A": { "shbg": 9, "kg": 12.5, "shbg_thieu_kg": 0 }, "B": { "shbg": 70, "kg": 210.0, "shbg_thieu_kg": 1 },
  "C": { "shbg": 6, "kg": 31.2, "shbg_thieu_kg": 0 }, "D": { "shbg": 0, "kg": 0, "shbg_thieu_kg": 0 },
  "E": { "shbg": 200, "kg": null, "shbg_thieu_kg": 200 },
  "tong": { "da_di": { "shbg": 85, "kg": 253.7, "shbg_thieu_kg": 1 }, "ca_chua_di": { "shbg": 285, "kg": 253.7, "shbg_thieu_kg": 201 } },
  "truot_chuyen_ke": 4, "b_theo_so_chuyen_tre": { "1": 5, "2": 25, "3_tro_len": 40 },
  "e_theo_so_chuyen_tre": { "0": 0, "1": 0, "2": 1, "3_tro_len": 199 }, "e_sat_gio": 20
}
```
(`kg` có thể là `null` khi mọi SHBG của ô thiếu kg.) Số cũ không đổi. Thêm khoảng 250 KB (≈ +22%) cho 30 ngày.

**2. `GET /api/ktt/luu-thoat/khong-dat-14h?tu=&den=[&ma_bcvh=&nguon=&thu=&nguon_hang=&bien_sat_gio_phut=30|60|90&top=1..50&moc=A|B]`** — các bảng của cả hai mốc (bộ lọc áp cho MỌI bảng; `du_dia_theo_gio` không có chiều `nguon`). Khóa lạ → 400; `thu` ∈ 2…7, CN. Khóa chính:
- `tong`: `{ shbg, kg, shbg_thieu_kg, theo_moc: { xnd|quet_tui_den: { nhom: {A..E: {shbg,kg,shbg_thieu_kg}}, tong: {da_di, ca_chua_di}, khong_dat_da_di, chua_di_qua_chi_tieu, do_duoc, ty_le_khong_dat, truot_chuyen_ke, b_theo_so_chuyen_tre, e_theo_so_chuyen_tre, e_sat_gio } } }`. `ty_le_khong_dat` = `khong_dat_da_di / do_duoc` (E không vào).
- Bảng cùng hình dạng dòng `{ <chiều>, shbg, kg, shbg_thieu_kg, theo_moc: { <mốc>: { nhom, tong, khong_dat_da_di, chua_di_qua_chi_tieu, do_duoc, ty_le_khong_dat, truot_chuyen_ke } } }`: `theo_ngay` (`ngay`), `theo_thu` (`thu`), `theo_nguon_hang` (`nguon_hang`), `theo_bcvh` (`ma_bcvh`), `theo_bcvh_loai_ngay` (`ma_bcvh`, `loai_ngay`), `theo_duong_thu` (`nguon`, `nguon_ten`), `theo_gio_den` (`gio` 0–23), `theo_gio_duong_thu` (`gio`, `nguon`), `theo_bcvh_chuyen` (`ma_bcvh`, `chuyen` 'HH:MM'; KHÔNG có mẫu số: `do_duoc` null).
- `phan_bo_cho`: [{ `khung_cho` (`den_14h`, `14_16h`, `16_20h`, `20_24h`, `24_36h`, `36_48h`, `tren_48h`), `theo_moc` }] — khung thời gian chờ thực tế (trừ 21:00–07:00) của SHBG không đạt / chưa đi quá chỉ tiêu.
- `du_dia_theo_gio[]`: `{ gio, ma_bcvh, loai_ngay, shbg, kg, shbg_thieu_kg, theo_moc: {khong_dat_da_di, chua_di_qua_chi_tieu, do_duoc, ty_le_khong_dat}, lo_chuyen: {shbg, mau_so, ty_le}, sat_gio: {"30","60","90"}, bien_an_toan_phut: {tb, p10}, cho_theo_lich_gio: {tb, p90, max}, du_dia_gio: {min, p10} }`.
- `dot_den[]` (xếp theo `khong_dat_da_di` của mốc `moc`; mặc định `A`, xem mục 20): `{ bd10_den, duong_thu, duong_thu_ten, ngay, gio_dau, gio_cuoi, nhan, chuyen_ke: {ma_bcvh, gio_xuat_phat}, shbg, kg, shbg_thieu_kg, khong_dat_da_di, chua_di_qua_chi_tieu, do_duoc, ty_le_khong_dat, theo_moc, sat_gio: {bien_sat_gio_phut, shbg, ty_le}, bien_an_toan_phut, cho_theo_lich_gio, du_dia_gio }`.
- `moc` (A mặc định | B) + `moc_mac_dinh` + `moc_dot_den` (`xnd` | `quet_tui_den`: mốc xếp `dot_den`; pha 2 bản sửa 2: mặc định đổi B → A theo PO 04/11/2026; route chưa phát hành, số các bảng không đổi) + `moc_goi_y_chan_doan` = `quet_tui_den` (gợi ý chẩn đoán giữ nguyên), `nhan_nhom`, `ly_do_xep_nhom`, `canh_bao`, `meta.do_chinh_xac_phan_vi`. Chưa có dữ liệu: `co_du_lieu: false`, `ly_do: 'CHUA_CO_DU_LIEU'`.

**3. `GET /api/ktt/chi-tiet?tu=&den=&loai=khong_dat_14h[&moc_chi_tieu=xnd|quet_tui_den&nhom_nguyen_nhan=A..E|tat_ca&gio_den=0..23&chuyen=HH:MM&thu=&nguon_hang=&ma_bcvh=&nguon=&page=&page_size=]`** — dựa `chiTieu14h[m]` của mốc đã chọn (mặc định `xnd`), KHÔNG dựa khối `dat_khong_dat` mốc A (nhóm `khong_dat` cũ luôn là mốc A). `tat_ca` = A–E (3.084 ở mốc A, khác 844 của `khong_dat`). Dòng thêm: `nhom_nguyen_nhan`, `ten_nhom_nguyen_nhan`, `ly_do_xep_nhom` (+ `mo_ta_ly_do_xep_nhom`), `truot_chuyen_ke`, `so_chuyen_tre`, `sat_gio`, `thu`, `moc_chi_tieu`, `nhom_nguyen_nhan_xnd`, `nhom_nguyen_nhan_quet_tui_den`; `kg` null khi thiếu hoặc 0 g. `meta` có các bộ lọc đã dùng. Tham số nhóm nguyên nhân chỉ dùng với `loai=khong_dat_14h` (khác → 400 `KTT_THAM_SO_LA`).

**4. `GET /api/ktt/xuat/khong-dat-14h?tu=&den=`** + cùng bộ lọc mục 3 — file .xlsx hai sheet «Thông tin» + **«10 Không đạt 14 giờ»** (27 cột = 18 cột sheet 7 + 9 cột nhóm nguyên nhân). Số 9 giữ chỗ cho «gói 9 sheet» của trang Đối chiếu (`43_KTT_DI_CUNG_NGAY_API.md` dòng đầu; sheet 1–6 Đối chiếu, 7, 8 hiện có) nên dùng số kế tiếp còn trống là 10. Số dòng = `pagination.total` của chi-tiet cùng tham số = số trên bảng; «Thông tin» ghi đối chiếu màn hình, cảnh báo mốc A, kg không rõ. Trần số dòng, nhật ký, lỗi 400/429/500 như sheet 7. Tên file `KTT_KhongDat14h_MocA|MocB_<tu>_<den>.xlsx`.

Chi phí (bản sao DB, 30 ngày, nguội, xem báo cáo pha 2): xem `CHANGELOG_AI.md`. Test: `tests/ktt-khong-dat-14h.test.js`.

## 20. KTT-KD-1 pha 2 (bản sửa 2) — «Bức tranh đường thư đến» (3 route mới; chỉ THÊM)

Quyền như mọi route KTT (ADMIN, TTVH, TTKT; GDVH, TIVI 403; chỉ GET; TTKT theo allowlist `GET /api/ktt/**`). Định nghĩa cụm, cờ, mốc: `41_KTT_LUU_THOAT.md` mục 20, `04_DECISIONS.md` #126. Mọi JSON dưới đây là **dữ liệu giả**; phản hồi KHÔNG chứa số hiệu bưu gửi / BD10.

**Tham số chung** (khóa lạ hoặc lặp → 400 tiếng Việt): `tu`, `den` (YYYY-MM-DD, ≤ 31 ngày, bắt buộc); `moc` = `A` (mặc định; xác nhận BD10 đến) | `B` (quét túi đến) — chấp nhận thêm `xnd` / `quet_tui_den`; `loai_ngay` = `thuong` | `chu_nhat` | `tat_ca` (mặc định); `bcvh` = một trong 6 mã BCVH (tùy chọn). Băng giờ (định danh cụm) KHÔNG phụ thuộc `loai_ngay` / `bcvh`.

**Hình dạng chung**: `{ khoang_ngay, moc, moc_mac_dinh: "A", bo_loc: { loai_ngay, bcvh }, bay_gio, nguon_xuat_luc_moi_nhat, co_du_lieu, ly_do, theo_moc: { A: {...}, B: {...} }, meta, canh_bao }`. Mỗi mốc có `mau_so` (SHBG thuộc mẫu số theo bộ lọc), `do_duoc` (có giờ đến của mốc), `khong_do_duoc`. Chưa có dữ liệu: `co_du_lieu: false`, `ly_do: "CHUA_CO_DU_LIEU"`, `theo_moc: null`.

**1. `GET /api/ktt/luu-thoat/buc-tranh-duong-thu`** — `theo_moc.{A,B}`: `{ mau_so, do_duoc, khong_do_duoc, cum[], thong_ke_co, nguong_ap_dung }`. Mỗi `cum` (xếp theo `shbg` giảm dần):
```json
{ "id": "DT-A|L1|1", "duong_thu": { "ma": "DT-A", "ten": "Đà Nẵng - Huế" }, "lich": { "ma": "L1", "ten": "Đà Nẵng - Huế Chuyến 1" }, "ten": "Đà Nẵng - Huế Chuyến 1 · 05:07–10:46",
  "thu_tu_bang": 1, "so_bang_cua_nhom": 2, "bang_gio": { "tu": "05:07", "den": "10:46", "vat_dem": false },
  "shbg": 1200, "kg": 3100.5, "shbg_thieu_kg": 0, "ty_le_shbg": 0.21, "luy_ke_pct": 21.0, "ngay_co_hang": 30,
  "san_luong_ngay": { "ngay_thuong": { "so_ngay_cua_so": 26, "so_ngay_co_hang": 26, "tb": 40.1, "do_lech_chuan": 9.8, "dao_dong": 0.244 }, "chu_nhat": { "so_ngay_cua_so": 4, "so_ngay_co_hang": 4, "tb": 38, "do_lech_chuan": 5.1, "dao_dong": 0.134 } },
  "gio_den": { "moc": "A", "do_duoc": 1150, "mau_so": 1200, "trung_vi_phut": 756, "trung_vi": "12:36", "p10": "09:10", "p90": "13:20", "do_rong_phut": 250, "trung_vi_moc_kia": { "moc": "B", "trung_vi": "05:39", "do_duoc": 1200 }, "meo_theo_lo": true },
  "lech_so_voi_trung_vi": { "trong_30p": { "shbg": 700, "ty_le": 0.61 }, "trong_60p": { "shbg": 900, "ty_le": 0.78 }, "trong_90p": { "shbg": 1000, "ty_le": 0.87 } },
  "kien_di_ngoai": { "shbg": 400, "kg": 2900.2, "shbg_thieu_kg": 0, "ty_le": 0.33 }, "trong_tui": { "chia_san": 500, "mo": 300, "khac": 0 }, "nguon_hang": { "khai_thac": 1000, "chuyen_tiep": 200 },
  "co": { "mau_it": false, "that_thuong": false, "khong_co_lich_co_dinh": true, "nhieu_kien_di_ngoai": true },
  "so_do": { "dao_dong": 0.244, "do_rong_gio_den_phut": 250, "ty_le_kien_di_ngoai": 0.33 } }
```
(`gio_den.meo_theo_lo` chỉ có ở mốc A, mốc B là `null`; giờ đến tính theo phút kể từ 00:00 ngày đến D, trình bày HH:MM.) `thong_ke_co`: `{ <cờ>: { don_vi, so_doi_tuong, so_bi_gan_co, ty_le } }`; `nguong_ap_dung`: các ngưỡng đang dùng + `phan_vi_dao_dong`, `phan_vi_do_rong_phut`, `phan_vi_kien_ngoai` (tỷ lệ kiện đi ngoài tại phân vị `ktt_bt_kien_ngoai_phan_vi`; KTT-KD-1d), `so_cum_tinh_nguong`. Cờ `nhieu_kien_di_ngoai` = `kien_di_ngoai.ty_le` ≥ `kienDiNgoaiPct`/100 VÀ ≥ `phan_vi_kien_ngoai`; khóa mới `kienNgoaiPhanVi` (camelCase như khóa cũ); số đo thô không đổi.

**2. `GET /api/ktt/luu-thoat/buc-tranh-duong-thu/chuyen-xe`** — `theo_moc.{A,B}`: `{ mau_so, do_duoc, khong_do_duoc, chuyen[], o[] }`.
- `chuyen[]` (BCVH × loại ngày × giờ xe rời; xếp `shbg` giảm dần): `{ ma_bcvh, loai_ngay, gio_xuat_phat, gio_chot, shbg, kg, shbg_thieu_kg, ty_le_san_luong_bcvh, so_chuyen_trong_ngay, ty_trong_chia_deu, luu_thoat_theo_lich: { trung_vi_gio, p90_gio }, con_lai: { trung_vi_gio, p10_gio, duoi_nguong, ty_le_duoi_nguong, qua_chi_tieu, ty_le_qua_chi_tieu, nguong_gio }, sat_gio_chot: { phut_trung_vi, shbg, ty_le, nguong_phut }, ngay_co_hang, hom_sau: { shbg, ty_le }, nguon_cum: [{ cum_id, ten, shbg, ty_le }], luu_y_lich, co: { chuyen_gom_nhieu_hang } }`.
- `o[]` (cụm × BCVH × loại ngày): `{ cum_id, cum_ten, ma_bcvh, loai_ngay, shbg, kg, shbg_thieu_kg, luu_thoat_theo_lich, con_lai, sat_gio_chot, ngay_co_hang, hom_sau, luu_y_lich, co: { mau_it, sat_gio_chot, sat_chi_tieu } }`.
- `luu_y_lich` (KTT-LICH-2, #127): `true` chỉ khi ô Chủ nhật của BCVH có dòng lịch CHƯA xác nhận (cột `ngay_chay_xac_nhan = 0`); lịch chuẩn 05/11 đã xác nhận cả 6 BCVH nên hiện KHÔNG đâu gắn. `meta.luu_y_lich.bcvh_chuyen_nghi_chu_nhat` (tên giữ để không đổi hợp đồng, nghĩa mới = chưa xác nhận) và `meta.luu_y_lich.bcvh_chu_nhat_chua_xac_nhan` cùng liệt kê BCVH đó (hiện `[]`). `hom_sau` = bưu gửi có chuyến kế rơi sang ngày hôm sau.

**3. `GET /api/ktt/luu-thoat/buc-tranh-duong-thu/danh-gia`** — `theo_moc.{A,B}`: `{ mau_so, do_duoc, khong_do_duoc, the[], thong_ke_co, mau_it[], nguong_ap_dung }`. `the[]` (xếp theo `shbg_anh_huong` giảm dần, `luy_ke_pct` lũy kế): `{ muc: canh_bao|luu_y|theo_doi|thong_tin, co, nhan, doi_tuong: { loai: cum|chuyen|o, id, ten }, shbg_anh_huong, gia_tri_do, nguong_ap_dung, ly_giai, luy_ke_pct }`. `sat_gio_chot` luôn `theo_doi`.

**`meta`** (cả ba route): `dang_thuc: { tong_shbg, mau_so, nhom_loai: { hang_hoan, ngoai_6_bcvh, khong_ro_dich, khong_co_gio_quet_den, khong_xep_duoc_chuyen }, tong_nhom_loai, lech_tong, shbg_trong_buc_tranh, lech_mau_so }` (đẳng thức toàn cửa sổ, KHÔNG phụ thuộc bộ lọc: `lech_tong` và `lech_mau_so` = 0); `do_duoc_chi_tieu_14h: { A, B }` (`{ do_duoc, mau_so }` của chỉ tiêu 14 giờ); `luu_y_lich`; `quy_uoc`.

**Tham số hệ thống** (nhóm «Hàng tại KTT», `server/config/ktt-buc-tranh.js`, mặc định `tham-so-mac-dinh.js`): `ktt_bt_gap_cum_phut` 60 · `ktt_bt_cum_nho_shbg` 5 · `ktt_bt_mau_toi_thieu` 100 · `ktt_bt_phan_vi_tuong_doi` 80 · `ktt_bt_kien_di_ngoai_pct` 30 · `ktt_bt_chuyen_gom_he_so` 1,5 · `ktt_bt_sat_gio_chot_phut` 60 · `ktt_bt_ngay_toi_thieu` 20 · `ktt_bt_con_lai_gio` 3 · `ktt_bt_ty_le_con_lai_pct` 25 · `ktt_bt_meo_theo_lo_phut` 120. Đổi có hiệu lực ngay (cột số theo ngày trong cache không chứa ngưỡng).

**Khác**: `GET /luu-thoat/khong-dat-14h` thêm `moc` (xem mục 19). Test: `tests/ktt-buc-tranh.test.js` (17 ca).

## 21. KTT-LICH-2 — lịch chuẩn 05/11/2026 (chỉ THÊM field; không đổi tên / đơn vị)

- `/api/ktt/meta`: `lich_chuyen[]` thêm `ngay_chay_xac_nhan` (0 | 1); `canh_bao` không còn cảnh báo «ktt_cau_hinh_chuyen chưa có dòng» (lịch V1 không còn seed).
- `/api/ktt/luu-thoat`: `meta.lap_ngay_nghi_shbg` (số) và `meta.lap_ngay_nghi` (map mã BCVH → số); `/api/ktt/luu-thoat/khong-dat-14h`: khối `lap_ngay_nghi: { shbg, theo_bcvh, ghi_chu }`. Cờ phụ, không đổi định nghĩa «đúng chuyến» / «trượt chuyến» / mẫu số (phương án B).
- `/api/ktt/lich-xe/gio-lap-bd10` (xem `43`): thêm `lap_ngay_nghi: { tong_bd10, theo_bcvh[{ ma_bcvh, ten_bcvh, so_bd10 }] }` (phương án A).
- `luu_y_lich`: đổi nghĩa (xem mục 20): chưa xác nhận, hiện luôn `false`.
- Lịch: `40_KTT_LICH_CHUYEN.md`, `04_DECISIONS.md` #127.

## 22. KTT-KD-3b — màn «Giờ đến trong ngày» (3 route mới; chỉ THÊM, không đổi trường hiện có; quyết định #128)

Ba route dưới tiền tố `/api/ktt/luu-thoat/buc-tranh-duong-thu/`, quyền như router KTT (ADMIN, TTVH, TTKT 200; GDVH, TIVI 403; chỉ GET). Lõi thuần `server/lib/kttGioDen.js` (không DB, không giờ máy), nối ở `kttApi.js` (`gioDen`, `gioDenTheoNgay`, `conLaiTheoGio`). Hai route đầu đọc CÙNG mục cache theo ngày (`layNgay`) với ba route bức tranh: không thêm lượt duyệt SHBG. Route 3 không đọc dữ liệu hàng.

**Phạm vi**: chỉ hàng đến 6 BCVH Huế (cùng mẫu số bức tranh, không hàng hoàn). Số ngoài phạm vi ở `ngoai_pham_vi`.

### Quy ước
- **Đường thư** = MÃ đường thư (gộp mọi lịch, mọi cụm). `khoa` = mã; hàng chưa có mã là một dòng riêng `khoa = "__RONG__"` (`ma` null). Đường thư chưa có tên: `ten` null (dòng riêng, không vào «Khác»).
- **Chuyến thư đến** = băng giờ của đường thư dựng bằng `chiaBang` của bức tranh: hai lần đến cách nhau KHÔNG QUÁ `ktt_bt_gap_cum_phut` (60) phút là một chuyến (cùng một xe được xác nhận trước và sau); băng dưới `ktt_bt_cum_nho_shbg` (5) gộp vào băng gần nhất; băng sát nửa đêm nối thành vắt đêm. Khác bức tranh ở một điểm: nhóm theo MÃ đường thư (không tách theo lịch). Dựng trên mọi ngày / BCVH của cửa sổ, riêng cho từng mốc.
- **Giờ đến của một ngày** = mỗi chuyến một giờ (giờ giữa = trung vị các lần đến của chuyến trong ngày). `gio_den_ngay` (P10, giờ giữa, P90, độ rộng) tính trên các giờ-chuyến-ngày này, KHÔNG trên từng bưu gửi.
- **Mốc**: cả hai mốc ở mọi bảng (`theo_moc.A`, `theo_moc.B`). A = giờ xác nhận BD10 đến (`bd10_den_xnd`, chính thức, #111; giờ trong ngày vòng 24 giờ, méo theo lô), B = giờ quét túi đến. `moc_mac_dinh` của API vẫn `A`; giao diện mặc định B ở cách xem «Chỉ xem giờ đến trong ngày».
- Số bưu gửi của đường thư theo mốc = SHBG của mẫu số có mốc đó (A: bỏ SHBG không có xác nhận BD10 đến; B: không bỏ). `mau_so` hai mốc bằng nhau.

### Route 1: `GET …/gio-den?tu=&den=[&moc=A|B&loai_ngay=thuong|chu_nhat|tat_ca&bcvh=<mã>&duong_thu=<khoa>…]`
`duong_thu` lặp tối đa 8 lần (trùng mã được gộp); không truyền thì hiện 5 đường lớn nhất. Mã không có trong khoảng ngày → 400 `KTT_DUONG_THU_LA`; quá 8 → 400 `KTT_DUONG_THU_QUA_NHIEU`.
- Đầu: `khoang_ngay`, `so_ngay {tong, thuong, chu_nhat}`, `moc`, `moc_mac_dinh`, `bo_loc {loai_ngay, bcvh, duong_thu[]}`, `bay_gio`, `nguon_xuat_luc_moi_nhat`, `co_du_lieu`, `ly_do`, `ngoai_pham_vi {di_ngoai_6_bcvh, khong_ro_dich, khong_co_gio_quet, hang_hoan, tong_shbg, ghi_chu}`, `meta {dang_thuc, quy_uoc}`, `canh_bao`. Chưa có dữ liệu: `co_du_lieu false`, `theo_moc null`.
- `theo_moc.<A|B>`: `mau_so`, `do_duoc`, `khong_do_duoc`, `duong_thu[]` (được chọn / 5 lớn nhất), `khac`, `tong`, `danh_sach[]` (MỌI đường thư của bộ lọc: `khoa, ma, ten, thu_hang, shbg, kg, co` — cho ô «Lọc đường thư»), `nguong_ap_dung`, `thong_ke_co`.
- Mỗi đường thư: `khoa, ma, ten, thu_hang, shbg, kg (null nếu không bưu gửi nào có kg), shbg_thieu_kg, ty_le_shbg`, `theo_gio[24] {gio, shbg, kg, kien_di_ngoai}` (Σ `shbg` = `shbg`), `san_luong_ngay {ngay_thuong, chu_nhat {so_ngay_cua_so, so_ngay_co_hang, tong, tb_moi_ngay, tb_ngay_co_hang, do_lech_chuan (chia N−1), dao_dong}, so_ngay_co_hang}`, `gio_den_ngay {moc, so_mau, p10, trung_vi, p90 (HH:MM), p10_phut, trung_vi_phut, p90_phut, vat_nua_dem, do_rong_phut, do_rong_chuyen_phut, so_chuyen_du_ngay, so_chuyen, so_chuyen_ngay}` (KTT-KD-3b2: `p10` / `trung_vi` / `p90` / `do_rong_phut` = khoảng THƯỜNG GẶP để HIỂN THỊ, tính trên mọi giờ-chuyến-ngày; `vat_nua_dem` = khoảng đi qua nửa đêm, khi đó `do_rong_phut` tính theo vòng 24 giờ, luôn ≥ 0 (≤ 1440), giao diện hiện «07:23 – 00:42 (qua nửa đêm)»; `do_rong_chuyen_phut` = độ rộng DÙNG CHO CỜ, đừng nhầm với `do_rong_phut`), `kien_di_ngoai {shbg, kg, shbg_thieu_kg, ty_le}`, `trong_tui {shbg, ty_le, chia_san, mo}`, `chuyen[] {thu_tu, bang_gio {tu, den, vat_dem}, shbg, so_ngay_co_hang, do_rong_phut (null khi dưới 5 ngày)}`, `co`, `co_gia_tri_do {dao_dong, do_rong_gio_den_phut, ty_le_kien_di_ngoai, shbg}`, `meo_theo_lo` (mốc A: có chuyến mà trung vị A lệch B từ `ktt_bt_meo_theo_lo_phut`; mốc B: null).
- `khac`: `{so_duong_thu, shbg, kg, shbg_thieu_kg, kien_di_ngoai, trong_tui, san_luong_loc, theo_gio[24]}` = các đường thư của bộ lọc ngoài bộ chọn; `tong`: cùng dạng + `so_ngay_cua_so` (mọi ngày của khoảng). Σ đường thư + `khac` = `tong`. `trong_tui`, `san_luong_loc` (và `san_luong_loc` ở mỗi đường thư, `meo_theo_lo` ở mỗi dòng `danh_sach`, `canh_bao_ma` ở gốc) THÊM ở KTT-KD-3b3: xem BẢNG TÊN CHUẨN bên dưới.
- **Dấu hiệu cấp đường thư** (`co`; ngưỡng tương đối tính ở máy chủ trên các đường thư ĐỦ MẪU của bộ lọc, không phụ thuộc đường thư đang hiển thị; `nguong_ap_dung` trả cả ngưỡng đã tính):

| Cờ | Nhãn | Định nghĩa | Khóa |
|---|---|---|---|
| `san_luong_khong_deu` | Sản lượng không đều | độ lệch chuẩn (chia N−1) / trung bình sản lượng ngày (ngày thường; Chủ nhật khi `loai_ngay=chu_nhat`) từ phân vị 80 | `ktt_bt_phan_vi_tuong_doi` |
| `gio_den_khong_co_dinh` | Giờ đến không cố định | **KTT-KD-3b2**: độ ổn định TỪNG CHUYẾN giữa các ngày, không đo khoảng cách giữa các chuyến. Mỗi chuyến có từ 5 ngày có hàng: độ rộng P90−P10 của giờ giữa chuyến đó qua các ngày (trải liền, đúng khi vắt nửa đêm); độ rộng đường thư (`co_gia_tri_do.do_rong_gio_den_phut` = `gio_den_ngay.do_rong_chuyen_phut`) = trung bình các chuyến đủ ngày, trọng số bưu gửi của chuyến; cờ khi từ phân vị 80 các đường thư đủ mẫu. Không chuyến nào đủ 5 ngày: `null`, không gắn cờ | `ktt_bt_phan_vi_tuong_doi` |
| `nhieu_kien_di_ngoai` | Nhiều kiện đi ngoài | tỷ lệ kiện đi ngoài từ 30% VÀ thuộc nhóm phân vị 80 | `ktt_bt_kien_di_ngoai_pct`, `ktt_bt_kien_ngoai_phan_vi` |
| `mau_it` | Ít số liệu | `shbg` < `ktt_bt_mau_toi_thieu` × (số ngày của khoảng / 30), làm tròn lên (`nguong_ap_dung.mau_toi_thieu_ap_dung`) | `ktt_bt_mau_toi_thieu` |
| `san_luong_lon` | Sản lượng lớn | `shbg` thuộc nhóm phân vị 80 cao nhất các đường thư đủ mẫu | `ktt_bt_san_luong_lon_phan_vi` (MỚI, 80, 50–99) |

Đường thư «mẫu ít» không gắn ba cờ tương đối đầu và `san_luong_lon`. Cờ cấp cụm của ba route bức tranh (`that_thuong`, `khong_co_lich_co_dinh`, `nhieu_kien_di_ngoai`, `mau_it` với ngưỡng 100 cố định) GIỮ NGUYÊN, chỉ route mới dùng cờ này. `nguong_ap_dung` của route mới thêm `san_luong_lon_phan_vi`, `muc_*` (ngưỡng đã tính), `mau_toi_thieu_ap_dung`, `so_ngay_khoang`; `nguong_ap_dung` của route cũ KHÔNG đổi.

### Route 2: `GET …/gio-den/theo-ngay?tu=&den=&duong_thu=<khoa>[&moc=&loai_ngay=&bcvh=]`
`duong_thu` BẮT BUỘC, một lần; thiếu → 400 `KTT_THIEU_THAM_SO`; lạ → 400 `KTT_DUONG_THU_LA`. Trả `duong_thu {khoa, ma, ten}` và `theo_moc.<A|B>`: `ngay[]` (MỌI ngày của khoảng, không phụ thuộc `loai_ngay`): `{ngay, la_chu_nhat, co_hang, shbg, kg, shbg_thieu_kg, kien_di_ngoai {shbg, kg}, trong_tui {shbg}, chuyen[] {thu_tu, gio_giua (HH:MM), gio_giua_phut, shbg, kg, shbg_thieu_kg, kien_di_ngoai {shbg, kg, shbg_thieu_kg}}}` (ngày không hàng: `co_hang false`, `chuyen []`); `dai_thuong_gap {so_mau, p10, trung_vi, p90, vat_nua_dem, do_rong_phut}`, `so_ngay_cua_so`, `so_ngay_co_hang`, `tb_ngay_co_hang` (ba số này, `san_luong_loc` (KTT-KD-3b3, cùng dạng với route 1) và dải chỉ tính các ngày thuộc `loai_ngay`), `canh_bao_ma`, `chuyen_cua_duong_thu[]`.

### Route 3: `GET …/con-lai-theo-gio[?loai_ngay=&bcvh=]` (không có `tu` / `den`)
Dải «còn so với chỉ tiêu» theo giờ, do MÁY CHỦ tính (giao diện không hard-code lịch hay chỉ tiêu). Hàng đến giờ g coi như đến phút :30 của giờ g; xếp chuyến bằng `xepChuyen` trên lịch `ktt_lich_chuyen` hiện hành (lịch chuẩn 05/11; giờ chốt = giờ rời − 60 phút, #112); lưu thoát theo lịch = `thoiGianThucGiay` (đã trừ 21:00–07:00); chỉ tiêu `chiTieuGio` (14 giờ; Thuận Hóa 533140: 12 giờ cho phường / xã trong `chi_tieu_gio_ngoai_le`). Ngày mẫu chỉ để định thứ (thứ Ba 03/11/2026, Chủ nhật 01/11/2026).
- `theo_bcvh[] {ma_bcvh, ten_bcvh, chi_tieu_gio, chi_tieu_gio_ngoai_le {gio, phuong_xa[]} | null, loai_ngay[] {loai_ngay ('thuong' | 'chu_nhat'), gio[24] {gio, gio_den ('HH:30'), con_lai_gio (có thể ÂM), cho_theo_lich_gio, chi_tieu_gio, gio_xe_ke_tiep, gio_chot, sang_ngay_sau, con_lai_12h}}}`. Không tính được (không xếp được chuyến): các trường là `null`, không trả 0. `con_lai_12h` chỉ có ở BCVH có ngoại lệ 12 giờ (Thuận Hóa), còn lại `null`.
- `meta`: `han_den_truoc_chuyen_phut`, `quy_uoc`, `canh_bao_lich`. Không đệm (rẻ); đổi lịch có hiệu lực ngay.

### BẢNG TÊN CHUẨN (KTT-KD-3b3, 07/11/2026) — nguồn DUY NHẤT cho giao diện; chỉ THÊM, không đổi trường đã có
Giao diện chỉ đọc đúng tên ở bảng này, KHÔNG tự đoán tên, KHÔNG tự cộng / chia lại số mà bảng đã có. Loại **a** = server đã có (tên đúng ở cột «tên trường»; giao diện sửa tên ở KTT-KD-3c5, không thêm trường trùng nghĩa); **b** = đã THÊM ở KTT-KD-3b3; **c** = phép chia hiển thị từ số đã có (công thức ở cột «nghĩa», giao diện tự làm).
Mọi số trung bình / tỷ lệ không tính được là `null` (không trả 0). «Loại ngày đang lọc» = `bo_loc.loai_ngay` (`thuong`, `chu_nhat`, `tat_ca`).

| Route | Khối | Tên trường | Nghĩa | Đơn vị | Khi null | Loại |
|---|---|---|---|---|---|---|
| gio-den | `theo_moc.<m>.duong_thu[]`, `khac`, `tong` | `san_luong_loc` | khối sản lượng theo ĐÚNG loại ngày đang lọc (các trường dưới); `khac` / `tong` cộng theo từng ngày rồi đếm ngày có hàng (ngày có hàng của `tong` = HỢP các ngày, không phải tổng số ngày có hàng của từng đường thư) | — | không bao giờ null (các số bên trong có thể null) | b |
| gio-den, theo-ngay | `san_luong_loc` | `loai_ngay` | loại ngày của khối (= `bo_loc.loai_ngay`) | chuỗi | — | b |
| gio-den, theo-ngay | `san_luong_loc` | `so_ngay_cua_so` | số ngày của loại ngày đang lọc trong khoảng (mẫu số «÷ ngày của loại ngày»). KHÔNG dùng `tong.so_ngay_cua_so`: số đó là MỌI ngày của khoảng (giữ nghĩa cũ) | ngày | — | b |
| gio-den, theo-ngay | `san_luong_loc` | `so_ngay_co_hang` | số ngày thuộc loại ngày đang lọc có ít nhất một bưu gửi; luôn ≤ `so_ngay_cua_so` | ngày | — (0 khi không có hàng) | b |
| gio-den, theo-ngay | `san_luong_loc` | `shbg`, `shbg_thieu_kg` | bưu gửi trong loại ngày đang lọc (= `shbg` của dòng); số bưu gửi chưa có khối lượng | bưu gửi | — | b |
| gio-den, theo-ngay | `san_luong_loc` | `kg` | kg trong loại ngày đang lọc (= `kg` của dòng) | kg | `null` khi không bưu gửi nào có kg | b |
| gio-den, theo-ngay | `san_luong_loc` | `shbg_tb_ngay_co_hang` | bưu gửi ÷ số ngày CÓ hàng: bình quân của ngày có chạy hàng | bưu gửi/ngày | `null` khi không ngày nào có hàng | b |
| gio-den, theo-ngay | `san_luong_loc` | `shbg_tb_moi_ngay_cua_so` | bưu gửi ÷ số ngày của loại ngày (ngày không hàng tính 0). Khác `shbg_tb_ngay_co_hang` khi có ngày không hàng; bằng nhau khi mọi ngày đều có hàng | bưu gửi/ngày | `null` khi không ngày nào có hàng (không trả 0) | b |
| gio-den, theo-ngay | `san_luong_loc` | `kg_tb_ngay_co_hang`, `kg_tb_moi_ngay_cua_so` | như hai trường trên nhưng theo kg (bưu gửi chưa có khối lượng tính 0 kg; xem `shbg_thieu_kg`) | kg/ngày | `null` khi `kg` null | b |
| gio-den | `khac`, `tong` | `trong_tui {shbg, ty_le, chia_san, mo}` | = `shbg − kien_di_ngoai.shbg`; `ty_le` = `trong_tui.shbg ÷ shbg`; cùng dạng với `trong_tui` của đường thư. Σ đường thư + `khac` = `tong` | bưu gửi; tỷ lệ 0–1 | `ty_le` null khi `shbg` = 0 | b |
| gio-den | `khac`, `tong` | `kien_di_ngoai {shbg, kg, shbg_thieu_kg, ty_le}` | đã có | — | `ty_le` null khi `shbg` = 0 | a |
| gio-den | `duong_thu[]` | `trong_tui {shbg, ty_le, chia_san, mo}`, `kien_di_ngoai.ty_le` | đã có (giao diện đọc đúng) | — | như trên | a |
| gio-den | `duong_thu[].san_luong_ngay.ngay_thuong` / `.chu_nhat` | `so_ngay_cua_so`, `so_ngay_co_hang`, `tb_moi_ngay`, `tb_ngay_co_hang`, `tong`, `do_lech_chuan`, `dao_dong` | đã có, THEO loại ngày cố định (không theo bộ lọc). `tb_moi_ngay` ở khối này là 0 khi không hàng (giữ nghĩa cũ); khối `san_luong_loc` thì null | bưu gửi/ngày | `tb_ngay_co_hang` null khi không hàng | a |
| gio-den | `duong_thu[]` | `tb_kg_ngay` (giao diện đang đọc) | KHÔNG có và không thêm. Dùng `san_luong_loc.kg_tb_ngay_co_hang` hoặc `kg_tb_moi_ngay_cua_so` | kg/ngày | — | b (tên đúng ở các dòng trên) |
| gio-den | `khac`, `tong` | `tb_ngay`, `tb_kg_ngay`, `so_ngay_co_hang` (giao diện đang đọc) | KHÔNG có và không thêm. Dùng `san_luong_loc.shbg_tb_ngay_co_hang` / `shbg_tb_moi_ngay_cua_so` / `kg_tb_*` / `so_ngay_co_hang` | — | — | b (tên đúng ở các dòng trên) |
| gio-den | `tong` | `so_ngay_cua_so` | GIỮ NGHĨA CŨ: mọi ngày của khoảng (không theo loại ngày). Không dùng làm mẫu số trung bình; dùng `tong.san_luong_loc.so_ngay_cua_so` | ngày | — | a |
| gio-den | `khac`, `tong` | tỷ lệ bưu gửi trong tổng | không có `ty_le_shbg`; công thức: `khac.shbg ÷ tong.shbg` | 0–1 | null khi `tong.shbg` = 0 | c |
| gio-den | `danh_sach[]` | `meo_theo_lo` | cùng giá trị với `meo_theo_lo` của đường thư (mốc A: true / false; mốc B: null) ở MỌI dòng, kể cả đường thư không được hiển thị — để cảnh báo «mốc A méo theo lô» xét đủ cả bộ lọc | boolean | mốc B, hoặc đường thư không có chuyến đo được | b |
| gio-den, theo-ngay | gốc phản hồi | `canh_bao_ma` | mảng MÃ cảnh báo để giao diện tự viết câu chữ. `canh_bao` (chuỗi thô, có chữ nội bộ) GIỮ để không đổi trường đã có, giao diện KHÔNG in nó | mảng chuỗi | không bao giờ null (mảng không rỗng khi có cảnh báo) | b |
| gio-den, theo-ngay | gốc phản hồi | `ly_do` | `'CHUA_CO_DU_LIEU'` khi chưa nạp cặp file nào (khi đó `theo_moc` null, `canh_bao_ma = ['CHUA_CO_DU_LIEU']`); ngược lại null | chuỗi | null | a |
| gio-den, theo-ngay | `theo_moc.<m>` | `gio_den_ngay.{p10,trung_vi,p90,p10_phut,trung_vi_phut,p90_phut,vat_nua_dem,do_rong_phut,do_rong_chuyen_phut,so_chuyen_du_ngay,so_chuyen,so_chuyen_ngay,so_mau}`; `dai_thuong_gap.*` (theo-ngay) | đã có, đúng tên | giờ HH:MM / phút | như mục 22 | a |
| gio-den | `theo_moc.<m>.nguong_ap_dung` | `gap_cum_phut`, `cum_nho_shbg`, `mau_toi_thieu_30_ngay`, `so_ngay_khoang`, `mau_toi_thieu_ap_dung`, `phan_vi_tuong_doi`, `kien_di_ngoai_pct`, `kien_ngoai_phan_vi`, `san_luong_lon_phan_vi`, `meo_theo_lo_phut`, `muc_*`, `so_duong_thu_tinh_nguong` | đã có, đúng tên; giao diện không ghi cứng 60 / 30 / 20 / 100 | — | `muc_*` null khi không đủ đường thư | a |
| gio-den | gốc | `so_ngay {tong, thuong, chu_nhat}`, `khoang_ngay {tu_ngay, den_ngay}`, `ngoai_pham_vi.di_ngoai_6_bcvh`, `bo_loc` | đã có | — | — | a |

**Mã trong `canh_bao_ma`** (đủ mọi mã có thể có; giao diện tự viết câu chữ, không in `canh_bao`):

| Mã | Khi nào | Gợi ý nội dung giao diện |
|---|---|---|
| `MOC_A_CO_THE_MEO` | luôn có khi có dữ liệu (mốc A đo từ xác nhận BD10 đến, gom theo lô) | «Mốc xác nhận có thể lệch theo lô; xem thêm mốc quét túi» (không dùng chữ «Mốc A», «méo», `meo_theo_lo`) |
| `CANH_BAO_HE_THONG` | có thêm cảnh báo cấu hình dữ liệu của máy chủ (ví dụ thiếu bảng địa bàn, lịch chuyến); chi tiết nằm ở `canh_bao`, chỉ dành cho quản trị | «Có cảnh báo cấu hình dữ liệu, báo quản trị» (không in chuỗi thô) |
| `CHUA_CO_DU_LIEU` | chưa nạp cặp file nào; `theo_moc` null, `ly_do = 'CHUA_CO_DU_LIEU'` | «Chưa có dữ liệu» |

Ghi chú: `san_luong_loc` dùng cùng bộ lọc (`loai_ngay`, `bcvh`) và cùng ngày của khoảng với `shbg`, nên `san_luong_loc.shbg` = `shbg` của dòng. Đẳng thức đã có test: Σ đường thư + `khac` = `tong` cho `shbg`, `kg`, `trong_tui.shbg`, `kien_di_ngoai.shbg`, `san_luong_loc.shbg`, `san_luong_loc.kg`; `so_ngay_co_hang` ≤ `so_ngay_cua_so`; `tong.san_luong_loc.so_ngay_co_hang` ≥ số ngày có hàng của từng đường thư (hợp các ngày).

**Tham số hệ thống mới**: `ktt_bt_san_luong_lon_phan_vi` (nhóm «Hàng tại KTT», 80, 50–99, đọc qua `server/config/ktt-buc-tranh.js` `SAN_LUONG_LON_PHAN_VI`). **Test**: `tests/ktt-gio-den.test.js` (25 ca); `tests/tham-so.test.js` (45 khóa sửa được, 52 khóa).
