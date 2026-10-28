# 📝 AI-Assisted Changes Changelog

Ghi lại các thay đổi được thực hiện với hỗ trợ của AI. Mới nhất ở đầu, append-only, 1 mục/ticket.

## [2026-10-28] - KTT-14: hàng «chuyển tiếp đi» (`CHUYEN_TIEP_DI`) vào tập Lưu thoát và các bảng KTT-12 (backend + test + docs; không đổi `src/`)

- **Lý do (PO chốt):** chỉ tiêu F1.3 chấm mọi hàng đích 6 BCVH Huế; hàng chỉ có túi chuyển tiếp (đi ngoài BD8 = SHBG, hoặc túi chia sẵn) trước đây nằm ngoài tập nên mẫu số «đi trong ngày / rớt lại / 14 giờ» thiếu một nửa. Quyết định: `04_DECISIONS.md` #119.
- **Một nơi chọn tập:** `kttQuery.chayTapLuuThoat` (cờ `gomChuyenTiep` + `boQuaCham`; mở rộng tập ứng viên ở `duyetShbg` và dựng đơn vị SHBG chuyển tiếp ở `dungDonShbg`). `kttLuuThoatQuery.luuThoatTheoNgay`, `duyetLuuThoat` (chi-tiet, xlsx sheet 7) và `kttDiNgayQuery.chayShbg` (dicungngay, rotlai, lich-xe, danh-sach, tong-quan) đều gọi hàm này. SHBG có túi ĐẾN giữ cách tính cũ (không đếm đôi); SHBG chỉ có túi chuyển tiếp lấy một dòng túi làm cả lần đến lẫn lần đi (dòng có giờ lập BD10 đi muộn nhất). Hàng hoàn Tổ KHHH vẫn tách riêng, không tính 14 giờ. `/tong-hop`, `/hang-den/*`, `lich-xe/gio-lap-bd10` không đổi.
- **Cờ nguồn (chỉ THÊM):** `nguon_hang` (`khai_thac` | `chuyen_tiep`) và `luong_tui` ở `chi-tiet`; `nguon_hang` ở `danh-sach`; `theo_nguon_hang { khai_thac, chuyen_tiep }` (khối + đẳng thức riêng) ở `/luu-thoat` từng ngày và `tong_cong`; bốn bộ đếm `meta`. Sheet 7 vẫn 18 cột; sheet «Thông tin» thêm «Phạm vi bưu gửi»; `canh_bao` của B6 đổi lời.
- **Số liệu đổi:** tổng bưu gửi, mẫu số năm trạng thái và 14 giờ, số rớt lại tăng; khối `khai_thac` bằng đúng số cũ (có test). Cửa sổ 30 ngày lần nguội chậm hơn (SHBG gấp hơn hai lần): số đo ở báo cáo giao việc.
- **Test:** `tests/ktt-chuyen-tiep.test.js` (11 ca, dữ liệu giả; thêm vào `package.json`). Sửa 3 kỳ vọng liệt kê trường (thêm `nguon_hang`, `luong_tui`; `theo_nguon_hang` ngoài so sánh theo mốc; mục «Phạm vi bưu gửi» ở `ktt-xuat`). `npm test` 1182 ca (1172 pass, 0 fail, 10 skip); ca KTT giống nhau ở 3 TZ.
- **Docs:** `41_KTT_LUU_THOAT.md` mục 13, `42_KTT_API.md` mục 14, `43_KTT_DI_CUNG_NGAY_API.md` (mục 9 đánh dấu đã giải quyết, mục 12 mới), `04_DECISIONS.md` #119, `00_SNAPSHOT.md`.
- **Còn nợ / chờ PO:** (1) nhiều túi chuyển tiếp cho một SHBG; (2) bỏ qua túi `DI` tái đóng; (3) mốc dự phòng 14 giờ cho hàng chuyển tiếp; (4) đơn vị «SHBG × ngày đến» của canvas khác đơn vị «SHBG một lần» của Lưu thoát; (5) làm nóng cache (lần nguội > 15 giây ở B1–B6); (6) giao diện tách hai cờ (KTT-11a/11c do bên giao diện). Không commit (PO commit).

## [2026-10-28] - KTT-11b: số «Tất cả» ở khung Xuất xlsx — `tong_shbg_ngay` theo BCVH, khối phân rã `ngoai_bay_chip`, sửa chữ «17 cột» ở docs (backend + docs; không đổi `src/`)

- **Lý do (khảo sát KTT-11a):** «Tất cả» = `tong_shbg_ngay` = mọi SHBG có ngày quét túi đến, gồm bốn nhóm không có chip (không rõ đích, ngoài 6 BCVH, thiếu giờ quét túi đến, không xếp được chuyến) — số đúng, khớp xlsx, nhưng không phải tổng bảy chip. Khi chọn một BCVH, khối `theo_bcvh[mã]` không có `tong_shbg_ngay` nên giao diện rơi về `luu_thoat.mau_so` (dữ liệu giả: Thuận Hóa chip 8, xlsx 12).
- **Mới (chỉ THÊM, `server/lib/kttLuuThoatQuery.js`):** (1) `tong_shbg_ngay` ở mỗi `theo_bcvh[mã]` (từng ngày và `tong_cong`) = `tong_shbg` + hàng hoàn nếu 533140 = số dòng xlsx `?ma_bcvh=`; giao diện đã đọc trường này nên chip tự đúng. (2) Khối `ngoai_bay_chip` ở mỗi ngày và `tong_cong`: `{ khong_ro_dich, ngoai_pham_vi{…}, ngoai_pham_vi_tong, khong_co_gio_quet_den, khong_xep_duoc_chuyen{…}, khong_xep_duoc_chuyen_tong, tong }`. Đẳng thức: t1…t5 + đang chờ + hàng hoàn + `ngoai_bay_chip.tong` = `tong_shbg_ngay`. `khong_phan_loai` KHÔNG đổi.
- **Test:** `tests/ktt-tat-ca.test.js` (5 ca, dữ liệu giả, server thật; thêm vào `package.json`): giá trị theo ngày, đẳng thức ở ngày / khoảng / `tong_cong`, hình dạng `khong_phan_loai` giữ nguyên, `ghepKhoang` = cả khoảng và không phụ thuộc `moc_chi_tieu`, `tong_shbg_ngay` 6 BCVH = số dòng xlsx (cả từng ngày) = `soKhop`, chưa có dữ liệu / ngày trống. Test cũ không sửa.
- **Docs:** `41_KTT_LUU_THOAT.md` mục 11.1, `42_KTT_API.md` mục 11.1, `04_DECISIONS.md` #118, `03_ARCHITECTURE_MAP.md` (dòng 36, 179: 19 trường / 18 cột), `00_SNAPSHOT.md`. Mục lịch sử (#116, các mục CHANGELOG cũ) giữ nguyên.
- **Còn nợ (ticket KTT-11c, Antigravity):** `KttLuuThoat.jsx:578` vẫn ghi «17 cột» (thật 18) và thẻ «Chỉ tiêu 14g»; dòng «Không vào bảy trạng thái» đọc `ngoai_bay_chip`; chip bỏ qua bộ lọc ô bản đồ nhiệt; khoảng ngày mặc định. Không commit (PO commit).

## [2026-10-28] - KTT-12b: hoàn tất KTT-12 — 13 route (đi cùng ngày B1–B3, rớt lại, lịch xe B4–B6, danh sách, hàng đến A, tổng quan), test, đo hiệu năng, tài liệu (backend only)

- **Route (`server/routes/ktt.js`, cùng `requireRoles(ADMIN, TTVH)`):** `GET /api/ktt/dicungngay/{tong-hop,theo-ngay,theo-gio}`, `/rotlai/theo-duong-thu`, `/lich-xe/{gio-lap-bd10,theo-duong-thu,theo-bcvh}`, `/danh-sach` (phân trang), `/hang-den/{tong-hop,theo-gio,theo-duong-thu,xe}`, `/tong-quan`. Mọi route cần `tu`, `den` (≤ 31 ngày); phản hồi có `khoang_ngay`, `cua_so_thuc_te`, `nguon_xuat_luc_moi_nhat`.
- **Lỗi WIP đã sửa:** `hang-den` trả `meta.so_ngay` luôn = 0 (bỏ trường); B4 (`gioLapBd10`) chạy đồng bộ trên luồng chính và B6 tính lại mỗi lần → chuyển vào worker + cache (`layGioLapBd10`, tác vụ `gioLapBd10` ở `kttWorker.js`). Không đổi hành vi `/luu-thoat`.
- **Test:** `tests/ktt-di-cung-ngay.test.js` (20 ca, dữ liệu giả; thêm vào `package.json`): quyền 13 endpoint, tham số sai, chưa có dữ liệu, tổng nhóm = mẫu số, **khớp `/luu-thoat`** (tổng, nhóm, từng ngày, `da_chot`), B2–B6, danh sách (tổng = ô B1, phân trang), A, tổng quan = hàm con, cache dùng chung, chỉ đọc.
- **Hiệu năng:** `scripts/ktt-do-hieu-nang-di-ngay.js` (`KTT_PERF=1`, bản sao DB, từ chối `data/`). Cửa sổ 30 ngày, lần đầu ≈ 7–8 giây cho B1–B6 / danh sách / tổng quan (> 5 giây; `luu-thoat` ≈ 13,6 giây), A ≈ 2,5 giây, B4 ≈ 0,3 giây; lần cache < 30 ms. Đề xuất làm nóng cache, gộp lượt đọc với Lưu thoát, tính song song (`43` mục 8); không thêm bảng.
- **Ghi nhận cho PO (không sửa):** hàng chuyển tiếp nguyên túi (`CHUYEN_TIEP_DI`) nằm ngoài tập SHBG của Lưu thoát và của B1–B6 (`43` mục 9). Lệch số với canvas: xem báo cáo giao việc.
- **Tài liệu:** `docs/ai/43_KTT_DI_CUNG_NGAY_API.md` (mới), `00_SNAPSHOT.md`. Ticket gốc `claude/KTT-12-…md` không có trong thư mục dự án. Không commit (PO commit).

## [2026-10-28] - KTT-10c: nối `moc_chi_tieu` vào `/api/ktt/luu-thoat`; xlsx sheet 7 hai cột nhãn Mốc A / Mốc B (backend only)

- **Khảo sát 5.1:** CTO duyệt cả 4 đề xuất (28/10): xlsx 18 cột, bỏ cột `dat` cũ khỏi xlsx nhưng giữ trường `dat_khong_dat` ở API; thêm 2 trường vào `dongChiTiet`; `/xuat/luu-thoat`, `/tong-hop`, `/chi-tiet` không nhận `moc_chi_tieu` (400).
- **API (5.2):** `server/lib/kttApi.js` — `docMocChiTieu` (sai → 400 `KTT_MOC_SAI` tiếng Việt), `luuThoat` nhận khóa `moc_chi_tieu` và truyền vào `layNgay(…, mocChiTieu)`; khóa mục ngày + khóa «dùng chung lần tính» = `<moc>|<ngày>`. `server/lib/kttLuuThoatQuery.js` — `meta.moc_chi_tieu` (cả khi chưa có dữ liệu). `server/routes/ktt.js` — chỉ sửa chú thích route. Quy tắc tính ở `kttLuuThoat.js`: không đổi.
- **xlsx (5.3):** `server/lib/kttDong.js` — `NHAN_DO_MOC`, trường `chi_tieu_14h_xnd`, `chi_tieu_14h_quet_tui_den` (Loại trừ / Không tính như cũ). `server/lib/kttXuat.js` — sheet 7 18 cột (cột 14–15 nhãn mốc), sheet «Thông tin»: định nghĩa hai mốc + ba dòng tổng hợp «Mốc A», «Mốc B» («Đo được x/y: đạt a, không đạt b») và «Không đo được» (theo lý do); `dongChiTieu14h`, `NHAN_TONG_14H`. Không in tỷ lệ «đạt» chung.
- **Test (5.4, dữ liệu giả):** `tests/ktt-api.test.js` +4 ca (mặc định / hai giá trị / `chi_tieu_14h` không phụ thuộc tham số / khớp lõi; đo được + không đo được = mẫu số ở mọi khối; tham số sai, lặp, ba route không nhận; cache theo mốc + chưa có dữ liệu), sửa danh sách trường `chi-tiet`; `tests/ktt-xuat.test.js` +1 ca (ba dòng «Thông tin»), sửa 5 ca dùng cột `dat` cũ sang `moc_a` / `moc_b`. `npm test` 1146 ca (1136 pass, 0 fail, 10 skip); `npm run build` OK.
- **Tài liệu (5.5):** `42` mục 2, 4, 10, 11, 12, 13 (mới); `41` mục 12.1; `04_DECISIONS.md` #117; `00_SNAPSHOT.md`; `PROJECT_SNAPSHOT.md` (Last PO Status, Next Ticket).
- **Chưa làm / ngoài phạm vi:** giao diện (`src/`) chưa đổi — chờ PO duyệt canvas; số tổng hợp ở «Thông tin» theo khoảng ngày / BCVH, không theo bộ lọc trạng thái / nguồn. Không commit (PO commit).

## [2026-10-27] - KTT-10b: chỉ tiêu «đạt 14 giờ» đo SONG SONG hai mốc (XNĐ và giờ quét túi đến) + script kiểm đợt nạp 18/10, 20/10

- **Khảo sát (5.1):** chỗ tính là `danhGiaChiTieu` (`server/lib/kttLuuThoat.js`), cộng ở `taoKhoi`, ghép ngày ở `congKhoi` (`kttLuuThoatQuery.js`); khớp mô tả (XNĐ → giờ lập BD10 đi; ba nhóm không đo được = `CHUA_DO_DUOC`, `XND_SAU_GIO_DI`, `CHUA_DI`). `kttQuery.chiTieuF13` là chỉ tiêu F1.3 khác (KTT-4), không đụng.
- **Sửa (chỉ thêm):** `kttLuuThoat.js` (lõi `tinhTuMoc` dùng chung, `ketQuaTheoMoc`, `phanLoaiShbg` trả `chiTieu14h` + `chatLuongTuiDen`, `taoKhoi({ mocChiTieu })` thêm khối `chi_tieu_14h`, `congChiTieu14h`), `kttLuuThoatQuery.js` (tham số `mocChiTieu`, mặc định `xnd`; lỗi `KTT_MOC_SAI`; `congKhoi` cộng khối mới), `kttQuery.js` (đơn vị SHBG thêm `soTuiDen`, `coTuiDi`, `tuiDenGocId`). Khối `dat_khong_dat` cũ, năm trạng thái, đúng chuyến, hàng hoàn: không đổi.
- **Mới:** `scripts/ktt-kiem-dot-nap.js` (5.4: CHỈ ĐỌC — mở DB `readonly`, từ chối cờ ghi và DB thật `data/hue-dhcl.db`, không in SHBG / số hiệu BD10; in nhật ký nạp cặp + từng file, số dòng theo ngày và theo giờ, giờ nguồn xuất, so với cùng thứ tuần trước / ngày trước / sau); `tests/ktt-chi-tieu-hai-moc.test.js` (15 ca, thêm vào `package.json`).
- **Quy tắc chọn túi đến cho mốc B:** túi đến GHÉP (như xếp chuyến, KTT-5); đếm sẵn số SHBG nhiều túi đến / ghép khác gốc / kết quả khác nếu dùng túi gốc / không có túi đi. Xem `37` mục 6.
- **Khác biệt đã được PO chốt (27/10):** ở khối mới, SHBG chưa đi LUÔN là «không đo được» (kể cả đã quá chỉ tiêu, ghi ở `chua_di_da_qua_chi_tieu`), còn `dat_khong_dat` cũ tính chúng là `khong_dat`.
- **Chưa làm / ngoài phạm vi:** nối tham số mốc vào API / giao diện / xlsx; không chạy được bộ đối chiếu số thật KTT-10 (`doi-chieu-doc-lap.js`, PO giữ); không chạy script kiểm trên DB thật. Không commit (PO commit).
- **Bổ sung 5.5:** `scripts/ktt-doi-chieu-chi-tieu.js` (CHỈ ĐỌC, `--db <bản chép> --tu [--den] [--json]`: in số tổng `chi_tieu_14h` hai mốc để PO so với số tham chiếu KTT-10; từ chối cờ ghi và DB thật, không in SHBG / BD10) + `tests/ktt-doi-chieu-chi-tieu.test.js` (3 ca, thêm vào `package.json`).
- **Tài liệu:** `37` mục 6, `41` mục 12, `42` mục 12, `00_SNAPSHOT.md`, `PROJECT_SNAPSHOT.md`.

## [2026-10-27] - KTT-8c: kg, nhóm theo nguồn, chi-tiet đủ 17 cột, lọc `ma_bcvh` / `nguon`

- **Mới** `server/lib/kttNguon.js` (kg, `nguonCua`, bộ cộng `theo_nguon`, cộng nhiều ngày) và `server/lib/kttDong.js` (17 trường một dòng Lưu thoát; tách từ `kttXuat.js`, dùng chung chi-tiet + xlsx).
- **`/api/ktt/luu-thoat`** thêm: `kg` ở mọi khối và `trang_thai.<t>.kg`; `theo_nguon` (ngày + `tong_cong`); `meta.shbg_thieu_khoi_luong`. **`chi-tiet`**: 17 trường snake_case, `loai` mới `ro_lai` / `truot_chuyen`, tham số `nguon`. **`xuat/luu-thoat`**: `ma_bcvh`, `nguon`, `trang_thai` nhận `ro_lai` / `truot_chuyen`; sheet «Thông tin» ghi bộ lọc; dòng đối chiếu `kttXuat.soKhop`.
- **Sửa (chỉ thêm):** `kttLuuThoatQuery.js` (nối kg + nguồn, `NHOM_LUU_THOAT`, `duyetLuuThoat` nhận `nguon`, `danhSachLuuThoat` thêm 17 trường), `kttQuery.js` (đơn vị SHBG thêm `diemGuiDen`), `kttApi.js`, `routes/ktt.js` (nhật ký thêm `ma_bcvh`, `nguon`).
- **Test cũ sửa (so khớp CHÍNH XÁC hình dạng):** `tests/ktt-luu-thoat.test.js` ca «số túi…» (`trang_thai.t1` có thêm `kg`); `tests/ktt-api.test.js` ca «chi-tiet: không rò thông tin cá nhân» (danh sách trường cho phép + 17 trường mới); `tests/ktt-xuat.test.js` ca «bộ lọc trang_thai» (chuỗi «Bộ lọc trạng thái: X;» vì thêm BCVH / nguồn).
- **Test mới** `tests/ktt-nguon.test.js` (11 ca + 1 ca đo `KTT_PERF=1`; thêm vào `package.json`). `npm test`: 1123 ca (1114 pass, 0 fail, 9 skip), giống nhau ở TZ=UTC, Asia/Ho_Chi_Minh, America/Los_Angeles.
- **Hiệu năng** `luu-thoat` nguội 1 / 7 / 31 ngày: trước 94–108 / 611–820 / 3.014–3.461 ms; sau 95–237 / 621–788 / 2.826–3.385 ms (nhiễu đo).
- **Tài liệu:** `41` mục 11, `42` mục 11, `03`, `04` #116, `00_SNAPSHOT.md`. Không commit (PO commit). Chưa giao diện (KTT-9b), chưa sheet 8 (KTT-8d).

## [2026-10-26] - KTT-8b (sửa 27/10 trước nghiệm thu: cột 14 «Không tính», cột 16 chữ đủ nghĩa): xuất xlsx sheet 7 «Lưu thoát» (`GET /api/ktt/xuat/luu-thoat`)

- **Mới** route `GET /api/ktt/xuat/luu-thoat?tu=&den=[&trang_thai=]` ở `server/routes/ktt.js` (ADMIN, TTVH; GDVH / TIVI 403; không token 401): file `KTT_LuuThoat_<tu>_<den>.xlsx` hai sheet «Thông tin» và «7 Hàng rớt lại» (17 cột, một dòng một SHBG). Lỗi tham số / quá trần 200.000 dòng → JSON 400 tiếng Việt trước khi gửi header.
- **Mới** `server/lib/kttXuat.js` (cột, dòng sheet, sheet «Thông tin», ghi luồng ExcelJS); `kttApi.xuatLuuThoat` (kiểm tham số, dùng cache `luuThoat` cho cột «đã chốt», tác vụ nền); `kttWorker.js` thêm tác vụ `xuatLuuThoat`.
- **Sửa (không đổi hành vi):** `kttLuuThoatQuery.js` tách `duyetLuuThoat` (lượt duyệt chung của chi-tiet và xuất); `kttQuery.js` đọc thêm `bd10_den_ma_duong_thu` / `bd10_den_ten_duong_thu` vào `duongThuDenMa` / `duongThuDenTen` của đơn vị SHBG (chỉ để xuất). Test cũ không phải sửa.
- **Sửa 27/10 (PO):** cột 14 ghi «Không tính» cho hàng thiếu giờ quét đến / không xếp được chuyến (Đạt + Không đạt khớp `luu-thoat`; thêm ca test); cột 16: «Đi trong ngày / hôm sau, đúng / trượt chuyến», «Từ 2 ngày hoặc chưa đi»; sheet «Thông tin» thêm mục «Định nghĩa: cột đạt / không đạt».
- **Test** `tests/ktt-xuat.test.js` (18 ca + 1 ca đo `KTT_PERF=1`; thêm vào chuỗi `test` của `package.json`). `npm test`: 1111 ca (1103 pass, 0 fail, 8 skip), giống nhau ở TZ=UTC, Asia/Ho_Chi_Minh, America/Los_Angeles.
- **Hiệu năng** (dữ liệu giả, 332.010 dòng nguồn): xuất 1 / 7 / 31 ngày = 0,81 / 3,5 / 16,4 s, RSS test tăng tối đa 120 / 191 / 326 MB. 31 ngày ở cỡ này (≈ 221.000 dòng) vượt trần 200.000.
- **Tài liệu:** `42_KTT_API.md` mục 10; `03_ARCHITECTURE_MAP.md` (route, ma trận quyền); `04_DECISIONS.md` #115; `00_SNAPSHOT.md`. Chưa giao diện (KTT-9), chưa sheet 8 (KTT-8c). Không commit (PO commit).

## [2026-10-26] - KTT-8: API `/api/ktt/*` (ADMIN, TTVH), cache theo ngày, chạy nền, tham số giờ chốt ngày

- **Mới** `server/routes/ktt.js` (mount riêng `/api/ktt` ở `server/index.js`, `requireRoles(ADMIN, TTVH)` đầu router; GDVH / TIVI 403, không token 401; chỉ GET): `meta`, `luu-thoat`, `tong-hop` (+ `danh_gia`), `chi-tiet` (phân trang như `/api/arrivals/items`; loại cũ của `kttQuery.chiTiet` + nhóm lưu thoát). Tham số `tu`, `den` bắt buộc, ≤ 31 ngày, lỗi → 400 tiếng Việt.
- **Mới** `server/lib/kttApi.js`: cache trong bộ nhớ theo mẫu QUYTG — `luu-thoat` MỖI NGÀY một mục (chưa chốt: ≤ 10 phút + cùng độ mới + cùng `dauHieuDb`; đã chốt: ≤ 6 giờ + chữ ký ngày), khoảng ngày chỉ tính phần ngày thiếu, tính từng ngày và nhường vòng lặp (`setImmediate`); `tong-hop` / `chi-tiet` cache theo khoảng, tính ở `server/lib/kttWorker.js` (worker_thread, kết nối chỉ đọc). **Sửa** `kttLuuThoatQuery.js` (chỉ THÊM: `ghepKhoang`, `danhSachLuuThoat`, `gioChot`; hàm cũ giữ nguyên), `kttLuuThoat.daChot` (thêm tham số giờ chốt, mặc định như cũ), `kttLichChuyen.js` (CHỈ thêm bộ nhớ đệm `xepChuyen`; `xepChuyenKhongDem` giữ bản gốc, quy tắc không đổi).
- **Tham số** `ktt_gio_chot_ngay` ('09:00', nhóm mới «Hàng tại KTT»; `tham-so.js`, `tham-so-mac-dinh.js`, `config/ktt-nap.js`). Hạn 60 phút giữ ở `ktt_lich_cau_hinh`. **Test cũ sửa:** chỉ `tests/tham-so.test.js` (38→39 khóa, 31→32 sửa được, thêm `ktt_gio_chot_ngay` vào bảng getter). **Test mới** `tests/ktt-api.test.js` (24 ca; 1 ca đo hiệu năng cần `KTT_PERF=1`). `npm test`: xem SNAPSHOT.
- **Tài liệu:** `42_KTT_API.md`; `03_ARCHITECTURE_MAP.md` (nhóm bảng `ktt_*`, route `/api/ktt/*` và `/api/nap-nguon/ktt/trang-thai`, ma trận quyền); `04_DECISIONS.md` #109–#114 (bộ nạp riêng; chỉ ADMIN + TTVH, hoãn TTKT; hai mốc giờ đến; mốc chuyến = giờ xe rời, hạn − 60 phút; hàng hoàn Tổ KHHH; dữ liệu cũ 10 giờ + giờ chốt là tham số).
- **Hiệu năng** (dữ liệu giả 31 ngày ≈ 33.000 túi / 332.000 dòng): `luu-thoat` nguội 1 / 7 / 31 ngày 0,20 / 1,21 / 5,59 s trước đệm `xepChuyen` → **0,095 / 0,69 / 2,92 s** sau; nóng 14 ms; `tong-hop` 31 ngày nguội 7,5 s ở worker (không chặn) / nóng 6 ms; `/meta` khi 6 request nặng chạy 0,62 s.
- **Sửa nhỏ sau KTT-8 (PO 26/10):** ngày TRONG cửa sổ nạp (độ mới lùi 8 ngày) vô hiệu khi độ mới đổi kể cả đã chốt (UPSERT cập nhật dòng tại chỗ; chữ ký không bắt được); chỉ ngày cũ hơn giữ ≤ 6 giờ theo chữ ký. Biến tùy chọn `KTT_WORKER=0` → `tong-hop` / `chi-tiet` chạy thẳng, không worker. +2 ca (`ktt-api.test.js` 26 ca), sửa 3 ca cache cho dùng ngày cũ hơn cửa sổ.
- **Chưa chắc / còn nợ:** worker chưa thử trên NAS; `tong-hop` không cache từng ngày (không cộng được); chưa giao diện (KTT-9), chưa xuất xlsx (KTT-8b). Chi tiết: `42_KTT_API.md`.

## [2026-10-26] - KTT-7b: Lưu thoát 5 trạng thái, đạt / không đạt 14 giờ, hàng hoàn Tổ KHHH; nối lịch chuyến chính thức vào truy vấn KTT

- **Mới** `server/lib/kttLuuThoat.js` (hàm thuần): `phanLoaiShbg` (năm trạng thái t1…t5 + «đang chờ chuyến»; nhóm riêng: không rõ đích, ngoài phạm vi 530900 / KHAC / KTT, hàng hoàn Tổ KHHH, thiếu giờ quét đến, không xếp được chuyến), `danhGiaChiTieu` (`bd10_den_xnd` → giờ lập BD10 đi, bỏ đêm 21:00–07:00 qua `quyThoiGian`, chỉ tiêu `quyThoiGianChiTieu`: 14 giờ, 12 giờ phường Thuận Hóa / Phú Xuân theo tên), `taoKhoi` (bộ cộng, mỗi chỉ số có `moc`), `daChot`. **Mới** `server/lib/kttLuuThoatQuery.js`: `luuThoatTheoNgay(db, { tuNgay, denNgay, bayGio? })` — theo ngày × 6 BCVH, tối đa 31 ngày, đủ ngày (ngày trống = 0), `da_chot` (độ mới ≥ 09:00 D+1), «bây giờ» = độ mới dữ liệu (`kttNapCap.docDoMoi`), `meta` đếm từng lý do. Không API / giao diện / cache.
- **Mới** `server/lib/kttChuyen.js` (`danhGiaChuyenLich`): cầu nối `kttLichChuyen` → hình dạng kết quả chuyến cũ. **Sửa** `server/lib/kttQuery.js`: «chuyến» (đúng chuyến, trễ, lỡ, đến sát giờ, nằm lâu «trễ chuyến») dùng lịch CHÍNH THỨC `ktt_lich_chuyen` thay lịch V1 (tên chuyến = giờ rời `'HH:MM'`, `chotTruocPhut` = `[60]`); thêm trường đơn vị SHBG (`gioBd10Di`, `noiGuiGoc` của túi đến gốc, `tenPhuong`, `tuiDenId`), export `chayBoDem` / `ngayHopLe` / `ngayKeTiep`, cờ `boQuaCham`. **Sửa** `server/lib/kttDanhGia.js`: «chuyến 12:30» thay «chuyến sáng / trưa / tối». Không sửa `kttLichChuyen.js`, `kttTinh.js`, `kttCauHinh.js`, bộ nạp, Hàng đến, Phát, QUYTG, `src/`; không đổi bảng `ktt_*`. Lịch V1 và hàm `kttTinh.danhGiaChuyen` còn nguyên (còn test).
- **Test mới** `tests/ktt-luu-thoat.test.js` (27 ca, 1 ca đo hiệu năng cần `KTT_PERF=1`; ba `TZ`). **Test cũ sửa (chỉ vì lịch mới): 12 ca** — `tests/ktt-query.test.js` 8 ca: «chuyến (SHBG khai thác lại…)», «chuyến (túi chuyển tiếp đi…)», «đến sát giờ», «hàng qua KTT hai lần», «nằm lâu», «chiTiet: tre_chuyen / lo_chuyen / …», «tongHopKtt gộp đủ các mục» (xóa lịch ở `ktt_lich_chuyen` thay `ktt_cau_hinh_chuyen`), «mã nguồn…» (danh sách `require`: thêm `./kttLichChuyen`, `./kttChuyen`) — đổi dữ liệu giả sang giờ xe rời KTT (hạn 60 phút) và tên chuyến `'HH:MM'`; `tests/ktt-danh-gia.test.js` 4 ca: dữ liệu giả `SANG / TRUA / TOI` → `'07:00' / '12:30' / '22:00'`, câu «chuyến trưa / sáng» → «chuyến 12:30 / 07:00», «30 phút cuối» → «60 phút cuối», ca «xuyên DB tạm» dựng lại dữ liệu theo lịch Hương Trà 06:00 / 12:00. 9 ca đỏ khi đổi lịch (dưới ngưỡng ~10 của ticket); 3 ca còn lại đổi cho khớp dữ liệu / câu. `npm test`: xem SNAPSHOT.
- **Hiệu năng** (dữ liệu giả 31 ngày ≈ 33.000 túi / 332.000 dòng, máy dev): 1 ngày ≈ 0,18 giây, 7 ngày ≈ 1,2 giây, 31 ngày ≈ 5,3 giây (10,2 giây trước khi bỏ phần chấm thừa trong lượt đọc). Hướng tối ưu ở `41_KTT_LUU_THOAT.md` §8.
- **Chưa chắc / còn nợ:** nhận diện hàng hoàn (túi đến GỐC sớm nhất + đích Thuận Hóa; đếm 531120 → BCVH khác ở `meta`) và nhóm «đang chờ chuyến»: PO ĐÃ DUYỆT 26/10/2026; ticket mô tả quy tắc KTT-5 là «túi đến sớm nhất» nhưng thực tế là «túi đến ghép với lần đi cuối» (đã dùng quy tắc KTT-5 thực tế); chỉ dùng `bd10_di_gio_di` làm giờ đi; chưa API / giao diện / cache (KTT-8, KTT-9). Chi tiết: `41_KTT_LUU_THOAT.md`.

## [2026-10-26] - KTT-7a: Lịch chuyến chính thức «Hàng tại KTT» + hàm thuần xếp chuyến / đánh giá đi chuyến

- **Schema** `server/lib/kttSchema.js` (chỉ THÊM, `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`): bảng `ktt_lich_chuyen` (giờ xe RỜI KTT, `ngay_chay` CA_TUAN | NGHI_CN, `dang_dung`, UNIQUE `(ma_bcvh, gio_xuat_phat)`) với **14 dòng** mặc định (lịch PO duyệt 26/10/2026) và bảng `ktt_lich_cau_hinh(khoa, gia_tri)` với `han_den_truoc_chuyen_phut` = 60. Hạn 60 phút để ở bảng MỚI (PO chọn) vì thêm khóa vào `ktt_cau_hinh` làm hỏng hai assert của `tests/ktt-import.test.js`. Bảng cũ `ktt_cau_hinh_chuyen` / `ktt_cau_hinh` KHÔNG đổi; giá trị PO sửa tay không bị ghi đè.
- **Mới** `server/lib/kttLichChuyen.js`: `xepChuyen` (chuyến sớm nhất có `gioDen ≤ giờ rời − 60 phút`, sang ngày kế bỏ ngày nghỉ CN, tối đa 7 ngày kế, `qua_dem`, lý do `KHONG_PHAI_BCVH_HUE` / `THIEU_GIO_DEN` / `GIO_DEN_SAI` / `KHONG_CO_LICH`), `chuyenTrongNgay`, `danhGiaDiChuyen` (`DUNG_CHUYEN` / `TRUOT_CHUYEN` / `CHUA_DEN_GIO` / `LO_CHUYEN` + cờ `di_truoc_khi_den`), `docLichChuyen(db)` (không ném lỗi, kèm `canhBao`). Hàm thuần, không giờ máy, không `Date.parse` / `new Date(chuỗi)`.
- **Tạm thời:** `kttQuery.js` (qua `kttCauHinh.js`) VẪN dùng lịch V1 (`ktt_cau_hinh_chuyen`) đến KTT-7b; bảng mới chưa có nơi nào khác đọc. Không sửa `kttQuery` / `kttDanhGia` / `kttTinh` / `kttCauHinh`, bộ nạp, Hàng đến, Phát, QUYTG, `src/`.
- **Test** `tests/ktt-lich-chuyen.test.js` (19 ca; DB tạm trong bộ nhớ, không tạo `data/`; ba `TZ`); thêm tên file vào `npm test`.
- **Chưa chắc:** ví dụ ticket «T2 05:50 → 06:30» mâu thuẫn quy tắc hạn 60 phút (hạn 05:30) — cài theo quy tắc (05:50 → 12:30); Hương Trà Chủ nhật tạm cả tuần. Chi tiết: `40_KTT_LICH_CHUYEN.md`.

## [2026-10-26] - KTT-6: Tự động nạp «Hàng tại KTT» qua SFTP (2 lần/ngày × 2 file), ghép cặp, nhật ký, độ mới, cảnh báo ADMIN

- **Mới** `server/lib/kttNapCap.js` (không mạng): `napCap` nạp CẶP (túi + bưu gửi) trong MỘT giao dịch (một file sai thì hoàn tác cả cặp), từ chối cùng TÊN khác nội dung (sha256), file rỗng hợp lệ; `docDoMoi`, `canhBao` (a thiếu file, b thiếu cặp theo ngày, c cặp từ chối/lỗi, d dữ liệu cũ — tính từ nhật ký, không lưu), `dsCap`. Giờ tự tách chuỗi (không `Date.parse`/`new Date(chuỗi)`).
- **Mới** `server/lib/kttSftp.js`: bộ nạp RIÊNG (không sửa «Hàng đến»): quét thư mục KTT, ghép cặp theo `<yyyymmdd>_<hhmmss>`, ổn định qua ≥ 2 lượt (bảng riêng `ktt_nguon_file`), cũ trước ≤ 10 cặp/lượt, không tải lại, `SQLITE_BUSY` thử lại 3 lần rồi ghi `LOI`; hẹn giờ `startKttScheduler` (cùng cờ `SFTP_SYNC_ENABLED`, không chạy trong test, tắt/sai cấu hình chỉ một dòng log); tạm dừng khi xác thực/vân tay sai (và báo «Hàng đến» tạm dừng qua `tamDungHenGio` có sẵn).
- **Mới** `server/routes/kttNap.js`: `GET /api/nap-nguon/ktt/trang-thai` (chỉ ADMIN). `server/index.js`: gắn route + khởi động/tắt gọn bộ hẹn giờ KTT cạnh «Hàng đến».
- **Schema** `kttSchema.js` (chỉ THÊM): bảng `ktt_nap_cap` (nhật ký theo cặp) và `ktt_nguon_file`; cột SHBG chuẩn hóa HOA / `Ð`→`Đ`; `gioCot` theo loại file. `kttImport.js`: xuất `napFile`, `bamFile`, `demKhongCon`; tùy chọn `choPhepRong`; đếm khóa trùng trong file, giờ nhỏ nhất/lớn nhất, `Nguon_xuat_luc` lớn nhất; hành vi CLI `scripts/ktt-import.js` giữ nguyên.
- **Tham số** (nhóm «Nạp dữ liệu Hàng tại KTT», `tham-so-mac-dinh.js` + `tham-so.js` + `config/ktt-nap.js`): `ktt_chu_ky_quet_phut` 10, `ktt_cho_cap_phut` 60, `ktt_cu_gio` 10, `ktt_khung_gio_tu` 7, `ktt_khung_gio_den` 22, `ktt_so_cap_toi_thieu_ngay` 2. Biến mới: `SFTP_KTT_DIR` (tùy chọn, mặc định `/CSV_Report_530100`); KTT không cần `SFTP_DIRS`. Không sửa compose / `.env.nas.example` / Dockerfile.
- **Test** `tests/ktt-sftp.test.js` (31 ca; dữ liệu giả, SFTP giả, đồng hồ giả; ba `TZ`); thêm tên file vào `npm test`. Sửa `tests/tham-so.test.js` (số khóa 32→38; 25→31 sửa được; bảng getter) vì danh bạ có thêm 6 khóa. `npm test`: 1020 ca (trước KTT-6: 989).
- **Không sửa:** `arrivalsImport.js`, `sftpSync.js`, `sftpScheduler.js`, `sftpFiles.js`, `sftpConnect.js`, `thayThe*`, `napNguon*`, `quyThoiGian*`, `dashboard*`, `src/`, `roles.js`, `tivi.js`.
- **Sửa nhỏ (PO 26/10):** bộ đếm «không còn trong ảnh chụp mới» theo cửa sổ [giờ trong tên file − 7 ngày, giờ trong tên file]; túi nằm trong cửa sổ nếu MỘT trong bốn cột `gio_quet_tui_den`, `gio_quet_tui_di`, `bd10_di_gio_di`, `bd10_den_xnd` nằm trong cửa sổ; bưu gửi theo túi chứa nó; bỏ `ti_den_theo_tui_luc` khỏi điều kiện (`kttImport.demKhongCon`, tham số `cuaSoDen` truyền từ `kttNapCap.napCap`). Cập nhật test và `39_KTT_NAP_SFTP.md`.
- **Chưa chắc / còn nợ:** cảnh báo (d): mặc định `ktt_cu_gio` = 10 giờ (PO chọn, thay cho 8 trong ticket để không báo sớm mỗi sáng với lịch 09:00/15:00); cặp 30 ngày chạy một giao dịch đồng bộ (chưa đo trên file thật); chưa thử với NAS / SFTP thật; chưa giao diện (KTT-9). Chi tiết: `39_KTT_NAP_SFTP.md`.

## [2026-10-23] - KTT-5: Truy vấn tổng hợp «Hàng tại KTT» (sản lượng, treo, chuyến, nằm lâu, F1.3, chi tiết) + khối «Đánh giá» + bảng địa bàn phát

- **Schema** `server/lib/kttSchema.js`: thêm bảng `ktt_dia_ban_phat` (`ma_phuong_xa` UNIQUE, `ten_phuong_xa`, `ma_bcvh`, `ten_bcvh`) + 40 dòng mặc định (`DIA_BAN_PHAT_MAC_DINH`, 6 BCVH Huế) nạp bằng `INSERT OR IGNORE` (không nhân đôi, không ghi đè dòng PO đã sửa). Không thêm cột vào bảng KTT nào.
- **Mới** `server/lib/kttQuery.js` (chỉ ĐỌC): `sanLuongTheoNgay`, `tonTreo`, `chuyenTheoBcvh`, `namLauTheoBac`, `chiTieuF13`, `chiTiet` (lọc theo loại / BCVH / ngày, trang ≤ 200 dòng, có tổng), `tongHopKtt` (MỘT lượt đọc, kèm `canhBao`, `khoangNgay`). Hai lượt `.iterate()` (túi; SHBG theo `shbg`), dùng `docCauHinhKtt` và các hàm của `kttTinh.js` (không sửa). Chuyển tiếp đi tính ở mức túi, hàng khai thác lại ở mức SHBG (túi đến → túi đi, dùng lần đi cuối; hai mốc cách > 7 ngày → «Cần kiểm tra lại», ngoài thống kê chính).
- **Mới** `server/lib/kttDanhGia.js`: `taoDanhGia(tongHop, tuyChon)` (hàm thuần) → `[{ ma, mucDo, cau, soLieu, loc }]`: đúng chuyến (theo giờ quét đến, theo BCVH), đi trễ, đến sát giờ, treo, nằm lâu, ngày bất thường (so với các ngày còn lại), xác nhận đến / quét đến sau giờ đi, F1.3, chất lượng dữ liệu. Ngưỡng mức độ ở hằng `NGUONG_DANH_GIA` đầu file.
- **Test** `tests/ktt-query.test.js` (23 ca, gồm đo cỡ một tuần: 15.000 túi / 75.000 dòng bưu gửi, ba `TZ`, kết nối chỉ đọc), `tests/ktt-danh-gia.test.js` (15 ca); +38 ca, đã thêm hai tên file vào script `test` của `package.json`. **Tài liệu** `docs/ai/38_KTT_TRUY_VAN.md`.
- **Hiệu năng** (dữ liệu giả cỡ tuần, máy dev, chạy riêng): `tongHopKtt` ≈ 1,1 giây (từng hàm 0,6–0,9 giây); song song với cả bộ test ≈ 2,5 giây. Không cần thêm chỉ mục ở cỡ này (xem 38 §5).
- **Chưa chắc / còn nợ:** quy tắc ghép túi đến → túi đi và ngưỡng mức độ nhận xét là đề xuất của KTT-5 (chưa PO chốt); chưa thử với file xuất thật; chưa API / route / cache / giao diện / quyền (ticket sau).

## [2026-10-23] - KTT-4: Hàm thuần tính chỉ tiêu, chuyến, «đến sát giờ», «nằm lâu», «treo» cho «Hàng tại KTT» + đọc cấu hình

- **Mới** `server/lib/kttTinh.js` (hàm thuần, chỉ `require('./quyThoiGian')`): `phanNhomDich`, `tinhChiTieu` (F1.3 14 giờ / 12 giờ phường 49135, 49133), `namThucTe`, `doTreXacNhan`, `phanBacNamLau`, `danhGiaChuyen` (mốc chuyến sinh theo ngày, chuyến đáng lẽ đi, trễ chuyến, đến sát giờ), `trangThaiNamLau`, `trangThaiTreo`. Số âm / NULL giữ nguyên có nhãn riêng; kết quả không phụ thuộc `TZ`; không dùng `new Date` / `Date.parse`.
- **Mới** `server/lib/kttCauHinh.js`: `docCauHinhKtt(db)` đọc `ktt_cau_hinh_chuyen` + `ktt_cau_hinh`, trả `{ lich, nguong, canhBao }`; thiếu bảng / khóa → mặc định + `canhBao`, không ném lỗi, không ghi DB.
- **Test** `tests/ktt-tinh.test.js`, `tests/ktt-cau-hinh.test.js` (+43 ca, đã thêm vào `npm test`; chạy ở ba `TZ`). **Tài liệu** `docs/ai/37_KTT_QUY_TAC_TINH.md`.
- **Sửa theo PO (cùng ngày):** `trangThaiTreo` — `CHUA_MO_TUI` xét mọi túi chiều `DEN` (mọi luồng, kể cả `DI_NGOAI`, `KHAI_THAC_DEN`), chưa mở túi, quá ngưỡng; túi chiều đi (`KHAI_THAC_DI`) không thuộc loại này; bỏ hằng `LUONG_CAN_MO_TUI`. +2 ca test (45 ca KTT-4).
- **Chưa chắc:** `KTT-quy-tac-tinh.md` không có trong repo (lấy quy tắc từ ticket). Ngoài phạm vi: truy vấn tổng hợp, API, giao diện, quyền, địa bàn phát, importer.

## [2026-10-23] - KTT-2: Lớp dữ liệu «Hàng tại KTT» — bảng SQLite, importer hai file CSV (túi, bưu gửi), bảng cấu hình mốc chuyến

- **Schema** `server/lib/kttSchema.js` (mới): `ensureKttSchema(db)` idempotent, năm bảng `ktt_nap_lan`, `ktt_tui`, `ktt_buu_gui`, `ktt_cau_hinh_chuyen`, `ktt_cau_hinh`; bảng ánh xạ cột CSV → DB là hằng số `COT_TUI` / `COT_BUU_GUI` (schema và importer cùng sinh từ đó). Khóa túi 7 cột lưu TEXT; `ktt_buu_gui` không FOREIGN KEY sang `ktt_tui`. Dữ liệu mặc định V1 (12 mốc chuyến, 4 ngưỡng) nạp bằng `INSERT OR IGNORE`, không ghi đè giá trị PO đã sửa. `server/db.js`: thêm một khối gọi `ensureKttSchema(db)` (+7 dòng, theo mẫu try/catch có sẵn).
- **Importer** `server/lib/kttImport.js` (mới): `importKttTui`, `importKttBuuGui`, `importKttDuongDan`, `chayThu`. Đồng bộ, đọc theo lô 1 MiB, mỗi file một giao dịch; UPSERT theo khóa tự nhiên (`nguon_xuat_luc` mới ≥ cũ thì thay, cũ hơn thì bỏ qua); bỏ qua dòng lỗi và đếm, ≤ 20 mẫu `{dong, cot, ma}` không kèm giá trị; thiếu cột khóa / `Nguon_xuat_luc` hoặc lỗi cấu trúc CSV → từ chối cả file. Không lưu `BD10_di_status`, `BD10_di_TransferDate`, `DestinationPOSCode`, lái xe, biển số, người thao tác. Không gắn nhãn «treo» / «nằm lâu» / «trễ chuyến» (KTT-4).
- **CLI** `scripts/ktt-import.js` (mới): `<file|thư-mục> [--dry-run] [--db]`; `--dry-run` hoàn tác cả lượt nên không ghi gì.
- **Test** `tests/ktt-import.test.js` (mới, +23 ca, đã thêm vào script `npm test` ở `package.json`). **Tài liệu** `docs/ai/36_KTT_TU_DIEN_DU_LIEU.md`.
- **KTT-2b (đối chiếu tiêu đề, cùng ngày):** đối chiếu `COT_TUI` (49 cột nguồn, 47 lưu + bỏ `BD10_di_status`, `BD10_di_TransferDate`) và `COT_BUU_GUI` (24 cột) với tiêu đề chính xác của script nguồn. Sửa tên: `Khoi_luong_tui_kg` → `Khoi_luong_tui` (cột DB vẫn `khoi_luong_tui_kg`), `So_BD10_den` → `So_bd10_den`, `Ma_Loai_Buu_Gui` / `Ten_Loai_Buu_Gui` → `Ma_loai_buu_gui` / `Ten_loai_buu_gui`; các cột còn lại đoán đúng. `Ten_Quan_Huyen`, `Ten_loai_buu_gui` đánh dấu `luonNull` (luôn NULL, vắng cột không vào `cotTuyChonVang`). Importer đọc đúng BOM UTF-8 và dấu nháy chuẩn CSV (không đổi mã, thêm test). +4 ca trong `tests/ktt-import.test.js` (27 ca). Còn chưa thử với file xuất thật.
- **Ngoài phạm vi:** SFTP, hẹn giờ, API, giao diện, quyền, tính toán (KTT-4).

## [2026-10-23] - QUYTG-9c: Giao diện «Thời gian Khai thác-Vận chuyển» — khoảng ngày, lũy kế tháng, biểu đồ cả tháng, bảng khung giờ

- **Khoảng ngày & Bộ chọn ngày:**
  - Tạo component `src/components/quythoigian/QuyThoiGianDateRangePicker.jsx`: bộ chọn khoảng ngày (Từ ngày – Đến ngày) tái dùng cho cả Màn 1 (`QuyThoiGianOverview`) và Màn 2 (`QuyThoiGianLuotView`), 3 nút nhanh «Hôm nay», «7 ngày», «Tháng này» tính theo giờ Việt Nam. Chặn Đến < Từ và khoảng > 31 ngày ở giao diện (thông báo lỗi, không gọi API, khớp 400 của backend).
  - Quản lý khoảng ngày `dateRange = { from, to }` ở `QuyThoiGianView.jsx`, chống ghi đè số liệu khi đổi khoảng ngày liên tục (request ID counter).
- **Lũy kế tháng:**
  - `quyThoiGianApi.js`: thêm `fetchQuyThoiGianLuyKe` gọi `GET /api/arrivals/quy-thoi-gian/luy-ke` (chỉ phụ thuộc BCVH, không đổi theo khoảng chọn; chỉ gọi khi đổi BCVH, khi mở màn hoặc khi bấm Thử lại). Tải độc lập, không chặn Màn 1.
  - 6 ô KPI (`QuyThoiGianOverview.jsx`): thêm dòng phụ «Lũy kế tháng» gạch đứt mảnh phía trên (`border-t border-dashed border-[#E4D5AE]`), chữ màu `#4A1D6E`, chiều cao các ô đồng đều; chú thích ngày đang cập nhật và trạng thái chưa đủ ngày.
- **Biểu đồ Diễn biến cả tháng:**
  - Tạo `src/components/quythoigian/QuyThoiGianMonthChart.jsx` bằng Pure SVG co giãn (`viewBox` 960x260): đường liền tím (lũy kế), đường đứt đỏ (tỉ lệ ngày); ngắt đường khi thiếu dữ liệu kèm dấu nhỏ trên trục và tooltip lý do; dải vàng mờ bao phủ khoảng ngày đang chọn; hỗ trợ phím (Tab, Enter) và bấm chọn ngày; tooltip clamp vị trí không tràn mép.
  - Dòng so sánh khoảng chọn với lũy kế: hiển thị cả tỉ lệ quá hạn và tỉ lệ còn thời gian (chỉ hiện khi khoảng có $\ge 50$ đo được và lũy kế $\ge 2$ ngày).
  - Chú thích danh sách BCVH thiếu trong ngày và ghi chú loại trùng xuyên BCVH.
- **Bảng khung giờ (thay biểu đồ cột):**
  - Tạo `src/components/quythoigian/QuyThoiGianHourTable.jsx`, xóa `QuyThoiGianHourChart.jsx`. Cột: Khung giờ | Đo được | Cơ cấu thời gian còn lại (thanh xếp chồng 100% 4 dải) | Quá hạn (số · %) | Sắp hết hạn (số). Chú giải 4 màu ngay trên bảng; dòng cuối «Cả khoảng chọn». Khung có `chinh` < 10 hiện chữ nghiêng «ít số liệu».
- **Bảng Theo từng ngày trong khoảng đã chọn:**
  - Tạo `src/components/quythoigian/QuyThoiGianDayTable.jsx` thay «Các ngày gần đây»: khoảng $\ge 2$ ngày hiển thị đúng các ngày của khoảng; khoảng 1 ngày hiển thị 7 ngày tính đến ngày đó. Sắp ngày giảm dần; bấm dòng thu về ngày đó; dòng trong khoảng chọn tô nền vàng nhạt `bg-[#FFF8E6]`.
- **Ngưỡng ít số liệu:**
  - `quyThoiGianFormatters.js`: đặt 4 hằng số có tên (`NGUONG_IT_SO_LIEU_BANG = 30`, `NGUONG_IT_SO_LIEU_KHUNG_GIO = 10`, `NGUONG_SO_SANH_LUY_KE_CHINH = 50`, `NGUONG_SO_SANH_LUY_KE_SO_NGAY = 2`).
  - Bảng đường thư và bảng BCVH: dòng có `chinh` < 30 hiện tỉ lệ quá hạn in nghiêng xám kèm nhãn «ít số liệu».
- **Màn 2 (Danh sách bưu gửi):**
  - Cập nhật 2 ô Từ ngày – Đến ngày đồng bộ với Màn 1; giữ nguyên sắp xếp và tô màu nền vàng nhạt cho lượt nghi ngờ (lượt «cần kiểm tra lại» xuống cuối danh sách do backend QUYTG-9d xử lý, giao diện giữ nguyên).

## [2026-10-23] - QUYTG-9d: `/luot` xếp lượt «nghi ngờ» (cần kiểm tra lại) CUỐI danh sách (backend)

- **Vấn đề** (Antigravity, QUYTG-9c Việc 0e): `soSanhLuot` sắp theo quỹ F1_3 tăng dần nên lượt nghi ngờ (hai mốc cách > 7 ngày, quỹ âm rất sâu) đứng ĐẦU danh sách, đẩy lượt quá hạn thật xuống dưới. Phân trang ở máy chủ nên chỉ sửa được ở backend. Quyết định PO 23/10: dòng «Cần kiểm tra lại» xuống cuối.
- **Sửa** `server/lib/quyThoiGianQuery.js` (`soSanhLuot` + chú thích): khóa đầu tiên là `nghiNgo` (không nghi ngờ trước); trong mỗi nhóm giữ quỹ F1_3 tăng dần, null cuối, hòa theo `shbg`, `receiver_code`, `ngay_den`. Thứ tự: A = không nghi ngờ có quỹ; B = không nghi ngờ quỹ null; C = nghi ngờ (quỹ tăng dần, null cuối). Không đổi khóa JSON, bộ lọc, cách đánh giá nghi ngờ. `quyThoiGianCache.js` không đổi (vẫn cache MỘT danh sách đã sắp theo cùng khóa khung; mọi trang / bộ lọc / `/tong-hop` / `/theo-ngay` dùng chung, không tính lại).
- **Thêm** `tests/quy-thoi-gian-sap-xep-nghi-ngo.test.js` (5 ca: thiết kế dữ liệu, thứ tự A/B/C, phân trang qua ranh giới nhóm, bộ lọc `nghi_ngo=1/0`, cache); đăng ký vào `package.json` `npm test`. 3 ca đỏ trước sửa. **Sửa** ca cũ «phân trang và sắp xếp ổn định» trong `tests/quy-thoi-gian-query.test.js` (khẳng định thứ tự mới: `QT0010VN` nghi ngờ nằm cuối).
- **Tài liệu**: không có dòng mô tả thứ tự sắp của `/luot` trong `docs/ai/` cần sửa.
- **Nợ / chưa chắc**: giao diện không tự sắp lại; nếu nơi nào khác (xuất Excel, ...) tự sắp danh sách `/luot` thì cần xem lại riêng.

## [2026-10-23] - QUYTG-9a-2: lũy kế «Tất cả BCVH» khớp `/tong-hop` từng ngày (backend)

- **Vấn đề** (đo ngày 23/10 trên bản sao DB, báo cáo 9a-1): `/luy-ke` cộng theo từng (BCVH, ngày) còn `/tong-hop` «Tất cả» loại trùng SHBG đi qua nhiều BCVH trong ngày; lũy kế 01–22/10 = 142.421 lượt so với 140.310 (lệch 1,48 %, 2.111 cặp (SHBG, ngày) qua hơn một BCVH). Quyết định CTO: với «Tất cả», từng ngày của `/luy-ke` PHẢI bằng `/tong-hop` Tất cả của ngày đó; một BCVH giữ nguyên.
- **Sửa** `server/lib/quyThoiGianQuery.js`: thêm `tinhNgayGop` (đếm một ngày bằng đúng `sqlDongDo` / `danhGiaDong` / `congLuot` của `/tong-hop`), `demLuotTheoBcvhNgay` (đếm nhẹ bằng SQL số lượt riêng từng BCVH để xét sàn 50), `lyDoThieuNgay`, `luyKeGop`, `congVaoLuyKe`; `ghepLuyKe` nhận thêm hàm tính số của ngày. Từ 2 mã trở lên (kể cả vắng `receiver_code` = cả 6) số của ngày loại trùng xuyên BCVH trên các BCVH «có dữ liệu» của ngày; điều kiện thiếu file / đang cập nhật / dưới sàn vẫn xét riêng từng BCVH. Một BCVH y nguyên. Khóa mới `meta.loai_trung_xuyen_bcvh_trong_ngay`; không đổi / xóa khóa cũ.
- **Sửa** `server/lib/quyThoiGianCache.js`: thêm `luyKeLuot` (số lượt riêng của cặp) và `luyKeNgayGop` (khóa `tập BCVH yêu cầu|ngày`, chữ ký = danh sách BCVH có dữ liệu + chữ ký dữ liệu đến của từng BCVH đó); giữ tầng tuổi 10 phút / 6 giờ, đổi chữ ký thì tính lại ngay; đổi một cặp chỉ tính lại đúng ngày đó. Bộ đếm mới `ngayGopTinhLai`.
- **Thêm** `tests/quy-thoi-gian-luy-ke-tat-ca.test.js` (8 ca + 1 ca đo `QTG_PERF=1`; đăng ký vào `package.json` `npm test`). Ca chính đỏ trước sửa (ngày 2: 190 so với 185). Gồm ca chứng minh `qua_han` lấy từ đếm quá hạn, không từ `den` (nghi vấn trùng số 3.425 là ngẫu nhiên: `quyThoiGianQuery.js:510`).
- **Sửa** `docs/ai/35_QUYTG9A_KHOANG_NGAY_LUY_KE.md`: cách cộng «Tất cả», Σ theo từng BCVH có thể lớn hơn `tong`, cache hai cấp, mục 2b số đo.
- **Đo** (DB giả 6 BCVH × 31 ngày × 1.500 + SHBG chung): lạnh 3,30–3,54 s → 3,44–3,63 s; chỉ ghi bảng phát 317–403 → 312–372 ms (0 ngày tính lại); đổi một cặp 361–407 → 372–429 ms (1 ngày). Chưa đo trên DB thật.
- **Test:** `npm test` 874 ca (869 pass, 0 fail, 5 skip — đều là ca đo bật bằng `PHAT_PERF` / `QTG_PERF`); trước sửa 865 (861 pass, 4 skip).
- **Còn nợ:** phạm vi «nhiều BCVH» áp cho mọi tập ≥ 2 mã (ticket chỉ nói `all`); ngày có BCVH bị loại bằng `/tong-hop` lọc các BCVH còn lại, không bằng `/tong-hop` Tất cả đủ 6; giao diện (9c) không được cộng số từng BCVH để ra «Tất cả».

## [2026-10-22] - QUYTG-8: Giao diện «Thời gian Khai thác-Vận chuyển» (2 màn) theo canvas

- **Thêm** `src/components/quythoigian/`:
  - `QuyThoiGianView.jsx`: Component điều phối chính giữa Màn 1 (Tổng quan) và Màn 2 (Danh sách bưu gửi); quản lý bộ lọc ngày và BCVH, xử lý phạm vi GDVH qua `export-scope`.
  - `QuyThoiGianOverview.jsx`: Màn 1 «Tổng quan», đầy đủ 12 thành phần theo canvas: bộ lọc ngày/BCVH, hộp Quy định, hộp Cách đọc, 6 ô số KPI, thanh tỉ trọng 4 dải xếp chồng, biểu đồ cột 6 khung giờ trong ngày, bảng theo đường thư (kèm liên kết sang Màn 2), bảng theo BCVH (ẩn khi chọn 1 BCVH), bảng theo nguồn hàng BD10, sản lượng không đo được phân theo chip lý do, bảng 7 ngày gần đây, khối minh họa ví dụ tính thời gian một bưu gửi.
  - `QuyThoiGianLuotView.jsx`: Màn 2 «Danh sách bưu gửi», lọc theo tình trạng (chips: Tất cả, Quá hạn, Sắp hết hạn, Còn thời gian, Giao nhận trực tiếp, Không đo được), BCVH, đường thư, nguồn hàng BD10, cần kiểm tra lại (> 7 ngày); bảng phân trang 50 dòng/trang, cột số hiệu bưu gửi chuẩn `font-mono`, tô màu nền dòng cho lệch mốc / cần kiểm tra lại / giao nhận trực tiếp; hộp cách đọc chân bảng.
  - `QuyThoiGianHourChart.jsx`: Biểu đồ cột 6 khung giờ xếp chồng 4 dải màu chuẩn bảng màu Huế.
  - `QuyThoiGianExampleBox.jsx`: Khối minh họa timeline tĩnh cách đo một bưu gửi.
  - `quyThoiGianApi.js`: Lớp gọi API `/api/arrivals/quy-thoi-gian/tong-hop`, `/luot`, `/theo-ngay`, `/api/arrivals/export-scope`.
  - `quyThoiGianFormatters.js`: Các hàm tiện ích định dạng số, phần trăm, thời gian dạng `6 g 20 p`, ngày giờ, ánh xạ nhãn nhóm và lý do.
- **Sửa** `src/components/Header.jsx`: thêm breadcrumb màn `quy_thoi_gian`.
- **Sửa** `src/components/TopNav.jsx`: thêm tab menu «Thời gian Khai thác-Vận chuyển» sau tab «Xử lý và tỷ lệ phát», trước tab «Quản trị», phân quyền `isViewer`.
- **Sửa** `src/App.jsx`: đăng ký tab `quy_thoi_gian`, kết nối `QuyThoiGianView`.


## [2026-10-20] - BRAND-1: đổi tên hệ thống ở tiêu đề tab và thanh đầu (chỉ hai chỗ này)

- **Sửa** `index.html:7`: tiêu đề tab → «Hệ thống giám sát hàng đến và chất lượng phát».
- **Sửa** `src/components/TopNav.jsx:109-111`: chữ thương hiệu «ĐHCL · KHÂU PHÁT» → hai dòng «GIÁM SÁT HÀNG ĐẾN» / «VÀ CHẤT LƯỢNG PHÁT», cỡ 11px, giữ phông/màu/biểu tượng.
- **Giữ nguyên** theo quyết định PO 20/10: màn đăng nhập, màn tivi, tên trong file xuất và các chỗ khác vẫn dùng tên cũ.
- **Chưa kiểm bằng mắt**: PO xem thanh đầu ở ~1920px và ~960px.

## [2026-10-20] - NAS-6: sửa cấu hình Docker/NAS và hướng dẫn theo khảo sát NAS-5 (không đụng mã ứng dụng)

- **Sửa** `docker-compose.yml`: thêm `init: true` (node nhận SIGTERM khi `down`/`stop`, WAL đóng gọn); truyền thêm biến tùy chọn `PHAT_WARM`, `TAIVE_MAX_DONG` (trống = mặc định; đã kiểm `server/index.js:88`, `server/lib/phatTaiVe.js:34`).
- **Sửa** `.env.nas.example`: `JWT_SECRET=` để trống (compose bắt buộc), chú thích rõ `CMS_ALLOWED_IPS` (thay giá trị mẫu, giữ `127.0.0.1`, CIDR IPv4, không dùng `*`), thêm `PHAT_WARM`, `TAIVE_MAX_DONG`.
- **Sửa** `docs/ai/20_NAS_HUONG_DAN_CHAY.md`: cách lấy vân tay (chạy `scripts/sftp-probe.js` từ máy dev; lần đầu để trống `SFTP_*`), số phận tài khoản `staff_test`/`tv`/`tv533140`, không có kiểm phiên bản DB, `docker compose config -q`, thời gian `down` và chép DB sau `down`, `data/backups` có thể phình, biến tùy chọn.
- **Chưa kiểm chứng**: chạy Docker (máy dev không có), `init: true` trên Container Manager.

## [2026-10-20] - DOCS-3: đồng bộ `docs/ai/` với main sau PR #113–#116

- **Đồng bộ** docs với LABEL-1 (#113), VUHOI-4b0 (#114), VUHOI-4d (#115), VUHOI-4b (#116): mốc main `799c40b`, mốc test 773 ca (772 pass, 0 fail, 1 skip — theo ticket, không tự chạy lại).
- **Sửa** câu «nhãn khoảng lũy kế kết thúc ở ngày đủ cuối» (`08_PHAT.md`); bỏ khỏi mục nợ nhãn «n/N ngày đủ», chip «Đã vu hồi» ở bảng kê, lựa chọn «Đã vu hồi» ở màn nhập, lỗi tên trường gán nhanh; thêm nợ VUHOI-4c (PO đã bỏ); sửa dòng vai trò TIVI ở `00_SNAPSHOT.md` (có giao diện `TiviView.jsx`). Chỉ docs, không đổi mã.

## [2026-10-20] - VUHOI-4b (#116): lựa chọn «Đã vu hồi» ở màn nhập; sửa kết quả gán nhanh

- **PR** #116 — commit `199c91f`, merge `799c40b`. File chính: `src/components/phat/PhatDraftView.jsx`, `src/components/phat/PhatTemplateView.jsx`.
- **Hành vi:** «Đã vu hồi» có ở 3 danh sách chọn trạng thái của màn nhập; `value` ô từng dòng ghép cờ (`r.da_vu_hoi ? 'DA_VU_HOI' : r.trang_thai`); sửa kết quả gán nhanh đọc đúng tên trường; `PhatTemplateView` thêm «Đã vu hồi» đúng thứ tự file mẫu. Không hiện cảnh báo (VUHOI-4c PO đã bỏ).

## [2026-10-20] - VUHOI-4d (#115): chip «Đã vu hồi» ở bảng kê kết quả phát

- **PR** #115 — commit `40dd05c`, merge `6d81333`. File chính: `src/components/phat/BangKeKetQuaPhat.jsx`, `src/components/phat/ProcessingDeliveryView.jsx`.
- **Hành vi:** chip «Đã vu hồi» (thứ 7, sau «Không thành công») ở bảng kê; số lấy từ `vuHoiNgay.da_vu_hoi`.

## [2026-10-20] - VUHOI-4b0 (#114): `dongRa` trả nhãn «Đã vu hồi»

- **PR** #114 — commit `a4a4fbd`, merge `a7014f1`. File chính: `server/lib/phat.js` (`dongRa`), `tests/phat-vu-hoi.test.js`.
- **Hành vi:** khi dòng có cờ, `dongRa` trả nhãn «Đã vu hồi» ở `trang_thai_nhan` và `trang_thai_hien_co_nhan` (qua `C.nhanTrangThai`); mã `trang_thai` / `trang_thai_hien_co` vẫn `PKTC`. Test: ca 9 mới.

## [2026-10-20] - LABEL-1 (#113): nhãn lũy kế «01/10–{ngày hiện tại}» và «n/N ngày đủ»

- **PR** #113 — commit `c3218bd`, merge `6110f8b`. File chính: `src/components/arrivals/DailyOpsPtcThang.jsx`, `src/components/arrivals/DailyOpsPtcRow.jsx`.
- **Hành vi:** thẻ nhỏ ghi nhãn lũy kế «01/10–{luy_ke.den_ngay}» (`nhanLuyKe`); thẻ PTC lớn ghi «đến {ngày} · n/N ngày đủ»; tooltip `chuGiaiLuyKe`.

## [2026-10-20] - DOCS-2: đồng bộ `docs/ai/` với main sau PR #106–#111

- **Đồng bộ** docs với TAIVE-2 (#106), GANBCVH-1 (#107), VUHOI-1 (#108), VUHOI-2 (#109), TAIVE-3 (#110), VUHOI-3 (#111): mốc main `4e579de`, mốc test 772 ca (771 pass, 1 skip), bảng kê 9 cột, hai API vu hồi, giao diện dòng «Vu hồi».
- **Ghi** các việc còn nợ vào `00_SNAPSHOT.md` mục 6; sửa chữ lỗi thời ở `05_BACKLOG.md` mục 7b. Chỉ docs, không đổi mã.

## [2026-10-20] - TAIVE-3: bảng kê `tai-ve` thêm cột «Đã vu hồi» và bộ lọc `DA_VU_HOI`

- **Sửa** `server/lib/phatTaiVe.js` (cột thứ 5 «Đã vu hồi», nối `phat_status_history` bằng `r.sel`, điều kiện lọc `KHOP_SQL`) và `server/routes/phat.js` (chỉ kiểm giá trị `trang_thai` + thông báo 400 nêu `DA_VU_HOI`). File 9 cột; `PKTC` gồm cả dòng có cờ; số dòng không đổi.
- **Không đổi** `NHAP_*`, `GAN_CTE`, `phat.js`, `phatVuHoi.js`, `phatDashboard.js`, `tivi.js`, `src/`, quyền, giới hạn dòng, không migration.
- **Test** MỚI `tests/phat-tai-ve-vu-hoi.test.js` (8 ca), thêm vào `npm test`; sửa khẳng định 8 → 9 cột ở `phat-tai-ve.test.js` (HEADER, chỉ số cột) và `phat-vu-hoi.test.js` (ca 7: so sánh bỏ cột «Đã vu hồi», kiểm cột đó riêng).
- **Docs:** 04 #108, 08, 03, 00_SNAPSHOT. Giao diện (chip «Đã vu hồi») để ticket sau.

## [2026-10-20] - VUHOI-2: API tỷ lệ «Đã vu hồi» theo ngày đến và theo tháng

- **Thêm** `server/lib/phatVuHoi.js` (lõi tính: `demNgay` dùng `P.runGan` + `P.NHAP_CTE` + `P.NHAP_ROW` nối `phat_status_history` bằng `sel`; `dung` = quy tắc `hien_thi`; `vuHoiNgay`, `vuHoiThang`; cache `vh1|`), `server/config/phat.js` (`NGUONG_MAU_SO_VU_HOI = 10`), `server/routes/arrivals.js` (2 route `/arrivals/dashboard/vu-hoi`, `/vu-hoi-thang` cạnh `ket-qua-phat*`, cùng `tiviPhatGuard`).
- **Không đổi** `NHAP_*`, `GAN_CTE`, `demNgay`, `phatDashboard.js`, `phatTaiVe.js`, `tivi.js`, cache `v3|`, `src/`, không migration.
- **Test** MỚI `tests/phat-vu-hoi-ty-le.test.js` (12 ca), thêm vào `npm test`.
- **VUHOI-2a:** tháng dùng đúng tập ngày của `ket-qua-phat-thang` (qua `PD.ketQuaPhatThang` từng BCVH); TIVI 403 cả hai route (test).
- **VUHOI-2c:** `bcvh=all` của `vu-hoi-thang` dùng tập ngày «đủ số liệu» của `ket-qua-phat-thang` all (khớp PKTC lũy kế); `theo_bcvh` trong all cùng tập ngày.
- **Docs:** 04 #107, 08 mục 2c, 03, 00_SNAPSHOT.
- **Nợ:** giao diện; lần đầu sau mỗi lần ghi DB, tháng `all` chậm (~3–10 giây tùy cỡ dữ liệu).

---

## [2026-10-19] - VUHOI-1: cờ «Đã vu hồi» của PKTC (cột `da_vu_hoi`), nhập qua Excel / API, file mẫu, hoàn tác

- **Sửa** `server/config/phat.js` (`DA_VU_HOI`, `DANH_SACH_NHAN` 6 nhãn, `nhanTrangThai`, `CANH_BAO_BO_VU_HOI`), `server/lib/phat.js` (migration `themCot` 4 cột; `trangThaiVuHoiTuChu`; `danhGia` / `kiemTraLai` so theo cặp; `docTrangThaiApi` trả `{ trang_thai, da_vu_hoi }`; `nhapDot`, `SQL_UPSERT_CURRENT`, `SQL_INSERT_HISTORY`, `hoanTacDot`, `dongRa`, `layDongMau`, `layDongLoi` mang cờ), `server/lib/phatFile.js` (danh sách chọn 6 nhãn, nhãn «Đã vu hồi» ở file mẫu / file lỗi). Quyết định #106.
- **Không đổi** `TT_MA`, CHECK 5 mã, `demNgay`, `NHAP_CTE` / `NHAP_ROW` / `GAN_CTE`, `phatTaiVe.js`, `phatDashboard.js`, `tivi.js`, `src/`.
- **Test** MỚI `tests/phat-vu-hoi.test.js` (9 ca), thêm vào `npm test`; `tests/phat.test.js` sửa ca danh sách chọn (6 nhãn).
- **Lưu ý triển khai:** sao lưu `data/hue-dhcl.db` trước khi chạy bản mới (thêm cột lúc khởi động).

---

## [2026-10-19] - DOCS-1: đồng bộ `docs/ai/` với main (theme #100/#101, bỏ STAFF #102/#103, quy tắc GDVH)

- **Chỉ docs, không đổi mã.** Main tại `340ed17` (merge PR #104).
- **Thêm** `04_DECISIONS.md` #99–#105: bỏ vai trò STAFF (thay #49 về STAFF), quy tắc quyền GDVH (giữ #72), phông, cỡ chữ `--text-xs`, màu biểu đồ / SVG, màu «Cơ cấu dịch vụ», Tivi không đổi.
- **Sửa** ma trận quyền ở `03_ARCHITECTURE_MAP.md` (bốn vai trò, bỏ cột STAFF), các câu nhắc STAFF còn hiệu lực ở `08_PHAT.md`, `06_DEPLOYMENT.md` (hành vi `migrate-roles.js`), các hợp đồng API ADMIN-only, `05_BACKLOG.md`; cập nhật `00_SNAPSHOT.md` (PR #99–#104, vai trò, `GET /api/phat/tai-ve`, mốc test 743 ca theo báo cáo PR #104, việc đang chờ và việc còn nợ).
- Các quyết định và mục CHANGELOG cũ, các file audit giữ nguyên chữ.

---

## [2026-10-19] - TAIVE-1: API «Bảng kê kết quả phát theo ngày đến» (`GET /api/phat/tai-ve`, tải Excel)

- **Thêm** `server/lib/phatTaiVe.js` (đếm + ghi `.xlsx` theo luồng bằng ExcelJS) và route `GET /api/phat/tai-ve` trong `server/routes/phat.js` (thêm khóa `'tai-ve'` vào `CHU_403`). Quyền: ADMIN, TTVH mọi BCVH và `all`; GDVH chỉ BCVH trong `user_bcvh`; khác 403. Giới hạn 50.000 dòng, nhật ký `phat_tai_ve`. Chi tiết ở `08_PHAT.md` §4 và `04_DECISIONS.md` #98.
- **Sửa nhỏ `server/lib/phat.js`** (theo PO cho phép): tách `NHAP_SELECT` thành `NHAP_ROW` + bọc đếm (SQL đếm cho cùng kết quả; `NHAP_ROW` thêm hai cột `shbg`, `t`) và export `NHAP_CTE, GAN_CTE, NHAP_ROW, runGan`. Không đổi hành vi `demNgay` / `tyLeApi` / `ketQuaPhat`.
- **Test** MỚI `tests/phat-tai-ve.test.js` (10 ca: a–k, gồm đối chiếu mẫu số với `ty-le` và `ketQuaPhat`; ca k: SHBG đến hai BCVH cùng ngày chỉ một dòng, theo DASH-7f), thêm vào `npm test`.
- **Chưa có** cột cờ «vu hồi» (VUHOI-1/2); giao diện nút «Tải bảng kê (Excel)» làm ở ticket riêng.

---

## [2026-10-19] - PHAT-6: `/api/phat/ty-le` theo NGÀY ĐẾN (#92), khớp «Điều hành hôm nay»

- **Sửa** `server/lib/phat.js` (`tyLeApi`: `demNgay(..., { theoLichSu: true })`; sửa chú thích `demNgay`). Khóa phản hồi không đổi; `ton_cho`, `so_lieu_den_luc`, `nhapDot`, `hoanTacDot`, `tyLeNgay` (commit «trước / sau») không đổi. Quyết định #97.
- **Test** MỚI `tests/phat-ty-le-ngay-den.test.js` (8 ca: Việc 0, a–e, khóa phản hồi, Việc 4 đo commit vs ty-le), thêm vào `npm test`; `tests/phat-dashboard.test.js` chỉ sửa một chú thích cũ và thêm một dòng đo `PHAT_PERF` (`/ty-le` 1 BCVH).
- **Phát hiện**: «Sau» của màn commit lệch `/ty-le` ở ngày đến cũ của SHBG đến lại (chờ PO quyết chuyển commit sang #92).

---

## [2026-10-18] - THEME-2: bảng màu và phông «Huế» (PR #93)

- **Sửa** `src/index.css`: `@theme`, khối «THEME-2: palette override» ghi đè các thang `orange`, `gray`, `red`, `emerald`, `amber` (xoá khối này là quay lại màu cũ), lớp tiện ích phẳng (bỏ bóng, viền mảnh); thêm hai gói `@fontsource` (Playfair Display, Be Vietnam Pro) đóng gói offline. Quyết định #96.
- **Lưu ý**: dùng chung thang màu nên trạng thái chờ / lỗi / mất mạng của Tivi đổi nhẹ (sửa ở THEME-2b). Menu ngang là THEME-3, chưa làm.

---

## [2026-10-18] - THAMSO-1a: `PUT` và `ve-mac-dinh` bỏ qua khoá không đổi giá trị hiệu lực (PR #92)

- **Sửa** `server/lib/thamSo.js`: `ap()` bỏ qua khoá có giá trị bằng giá trị hiệu lực; lô rỗng không ghi nhật ký, không tăng phiên bản. `npm test`: 718 ca.

---

## [2026-10-18] - THEME-1: «Quản lý mạng lưới» chỉ ADMIN (PR #91, commit `36a6cd6` trên main sau merge)

- **Sửa** `server/routes/network.js` (hai route đọc `requireRoles(ROLES.ADMIN)`, bỏ `VIEWER_ROLES`), `App.jsx` (chỉ dựng màn khi `isAdmin`), `Sidebar.jsx` (mục trong khối ADMIN). TTVH, GDVH, STAFF nhận 403. Quyết định #95 (thay #49, #53(a) về quyền đọc). `npm test`: 713 ca.

---

## [2026-10-17] - THAMSO-2a: `GET /api/phat/ty-le` thêm khối `nguong` (backend, chỉ THÊM khóa)

- **Sửa** `server/routes/phat.js` (`/phat/ty-le` trả `{ ...P.tyLeApi(...), nguong }`, `nguong` ở cuối) và `server/lib/phatDashboard.js` (hàm `nguongKetQuaPhat()` dùng chung cho `ket-qua-phat` và `ty-le`: 3 khóa `ptc_dat`, `chua_co_tt_canh_bao`, `san_xep_hang_bcvh`, đọc tham số lúc gọi). `P.tyLeApi` KHÔNG đổi; `ty-le` không có cache nên tham số mới có hiệu lực ngay; quyền giữ nguyên (ADMIN, TTVH, GDVH; STAFF, TIVI 403).
- **Test** `tests/tham-so.test.js` +4 ca (a–d). Giao diện màn 13 CHƯA đọc `nguong` (THAMSO-2).

---

## [2026-10-17] - THAMSO-1: «Tham số hệ thống» — bảng `tham_so` + nhật ký + lớp đọc getter + API chỉ ADMIN (backend)

- **Thêm** `server/config/tham-so-mac-dinh.js` (mặc định một chỗ), `server/config/tham-so.js` (danh bạ 25 khóa sửa được + 7 chỉ-đọc, kèm `mo_ta`/`anh_huong`/`vi_du`/`nhin_thay_o`), `server/lib/thamSo.js` (lớp đọc / ghi / kiểm tra hợp lệ / nhật ký), `server/routes/thamSo.js` (`/api/tham-so*`, chỉ ADMIN); bảng `tham_so`, `tham_so_nhat_ky` (`server/db.js`).
- **Sửa** `phatConfig.js`, `dashboard-thresholds.js`, `nap-nguon.js`, `thay-the.js`: đối tượng getter enumerable (hình dạng / thứ tự khóa như cũ; `phatConfig` thêm `NGUONG_DU_SO_LIEU` ở cuối); `dashboardDenQuery.js` bỏ destructuring `GIO_CHUYEN_CHIEU`, `phuong-xa-tang` thêm `tang_cao_pct`; `phatDashboard.js` `duSoLieu` dùng `NGUONG_DU_SO_LIEU`, khóa cache tầng 1 thêm phiên bản tham số; `arrivalsImport.js` chỉ export thêm 3 hằng.
- **Test** `tests/tham-so.test.js` 46 ca; `tests/phat-dashboard.test.js:162` số khóa `phatConfig` 7 → 8. `npm test` 706 ca (705 đạt, 1 bỏ qua), `npm run build` đạt. Báo cáo: `34_THAMSO1_BACKEND_BANG_THAM_SO.md`; quyết định #94.
- **Lưu ý**: chạy thử cho thấy đổi tham số nạp nguồn làm mục «Đã xem xét» không còn cần xử lý rời cả hai danh sách (đặt lại thì dấu cũ còn hiệu lực) — sửa nhận định THAMSO-0. Giao diện chưa đọc tham số mới.
- **Chưa làm**: THAMSO-2 (bỏ chữ cứng / dự phòng lệch ở giao diện), THAMSO-3 (màn ADMIN), THAMSO-4 (ngưỡng theo thống kê).

---

## [2026-10-17] - DASH-12b-4: chữ ký cache từ trạng thái trong DB, giảm tính lại khi có file mới, khởi động nóng theo lát

- **Sửa** `server/lib/phatDashboard.js`: tầng 1 khoá theo `dauHieuDb` (`PRAGMA data_version` + `total_changes()`); tầng 2 chữ ký theo (BCVH, ngày) = `sigNgay` + `sigLai` + `sigDot` + `sigFile` tính lười từ DB (nội dung dòng đến, ngày đến kế tiếp D', lịch sử + đợt nhập phát, file); `khoiDongNong` chia lát; `xoaTang1PhatThang` (test). `server/index.js`: gọi khởi động nóng sau khi nghe (PHAT_WARM=0 để tắt; không chạy trong test). `scripts/bench-phat-thang.js` (mới): đo trên CSDL RAM, có ngân sách thời gian. Quyết định #93. Không đổi hợp đồng JSON, quyền, giao diện.
- **Test** `tests/phat-thang.test.js` 31 ca (+11): nguyên nhân 1–7 + 4b, mỗi ca so sánh trực tiếp cache với tính lại từ đầu (cả khi bỏ tầng 1) và kiểm sự kiện có đổi kết quả; đến lại / khởi động nóng. `tests/phat-dashboard.test.js`: đo PERF bỏ phần khởi động nóng (chuyển sang script đo). `npm test`: 640 ca, 639 đạt, 1 bỏ qua. Đo (xem `31_…`): sau 1 file mới ~0,8 giây (cỡ thật 243k dòng) / ~2,3 giây (cỡ xấu nhất 720k) — trước ~14,9 giây; lần đầu ~4,3 / ~13,4 giây; khởi động nóng lát dài nhất 41 / 102 ms (< 200 ms).
- **Lưu ý**: truy vấn `sigLai` bắt buộc `INDEXED BY ix_arrival_items_tracking` (không ép: 52 giây / ngày ở 744k dòng, làm treo phép đo). Mỗi lần DB đổi (kể cả ghi không liên quan) tính lại chữ ký ~0,3 / ~0,9 giây.
- **Chưa làm**: giao diện Tivi; đo trên DB thật / đĩa.

---

## [2026-10-17] - DASH-12b-3: kết quả phát theo NGÀY ĐẾN (lịch sử nhập), «đủ số liệu», tách HÔM NAY | LŨY KẾ (backend + giao diện web)

- **Quy tắc (#92, đổi #91-1)**: mỗi lần đến D của một SHBG tại BCVH lấy bản nhập cuối (`phat_status_history`, bỏ đợt hoàn tác) có ngày nhập VN N, `D ≤ N < D'`; không có → Chưa có TT. `server/lib/phat.js`: `demNgay(..., { theoLichSu })` (`NHAP_CTE` / `NHAP_SELECT`, bản tập hợp ~60–80 ms / BCVH-ngày; bản truy vấn con tương quan ~1,45 giây bị bỏ); `runGan` thêm `{ them, materialize }`. Mặc định `demNgay` giữ nguyên cho `/api/phat/ty-le` và commit / hoàn tác. `server/lib/phatDashboard.js`: `ketQuaPhat` dùng quy tắc mới + khóa `du_so_lieu` (giá trị khóa cũ đổi, gồm xếp hạng; **Tivi đổi số theo**, `TiviView.jsx` không sửa); endpoint tháng: `du_so_lieu` theo ngày, `hom_nay`, lũy kế chỉ ngày đủ, `chenh` chỉ khi hôm nay đủ; cache tầng 2 khoá `v3|` + chữ ký không chặn trên (file mới tính lại cả tháng); chữ ký thêm tổng id đợt hoàn tác.
- **Giao diện** (`DailyOpsPtcRow.jsx`, `DailyOpsPtcThang.jsx`, `DailyOpsDashboard.jsx`): thẻ PTC lớn hai cột HÔM NAY | TỪ 01/MM, chip chênh, đường diễn biến có vạch mục tiêu 82%; 4 thẻ nhỏ có chân thẻ 44px; hôm nay chưa xử lý hiện số thật (0 / 0,0% / Chưa có TT 100%) + «Hôm nay chưa có xử lý»; đặt `thangPhat` về `null` khi đổi BCVH. Chiều cao hàng thẻ 186 px (trước 189 px, đo trong trình duyệt khung 1366 px).
- **Test**: `tests/phat-thang.test.js` viết lại (20 ca); `tests/phat-dashboard.test.js` (danh sách khóa `ket-qua-phat` thêm `du_so_lieu`; số khóa `phatConfig` = 7; đo PERF mới); helper `ghiDot` của `phat-dashboard`, `phat-cung-ngay`, `phat-bcvh-muon-nhat` ghi thêm `phat_status_history`. `npm test`: 629 ca, 628 đạt, 1 bỏ qua. Đo (744.000 dòng giả): endpoint tháng 6 × 30 ngày lần đầu ~14 giây (trước ~6,7), sau 1 đợt nhập ~2,0 giây, sau 1 file mới ~14,9 giây (tính lại cả tháng). Báo cáo: `31_…`, `32_…`.
- **Chưa làm / cần PO**: giảm chi phí tính lại khi có file mới; khởi động nóng; giao diện Tivi; dữ liệu 01–09/10 và số thử (PO).

---

## [2026-10-17] - DASH-12c: giao diện «từ đầu tháng» cho hàng thẻ kết quả phát (web)

- **Thêm** `src/components/arrivals/DailyOpsPtcThang.jsx` (lũy kế, chênh «điểm so với tháng» theo `chenh` của máy chủ, đường diễn biến ngắt ở `null`, cảnh báo thiếu ngày); `DailyOpsPtcRow.jsx` chèn vào 5 thẻ (prop `thang`); `DailyOpsDashboard.jsx` gọi riêng `ket-qua-phat-thang` (không chặn khối khác, bỏ kết quả cũ khi đổi BCVH). `formatPercent` làm tròn bằng số nguyên (khớp backend). Không đổi `server/`, Tivi, test.
- **Kiểm tra**: `npm run build` đạt; dựng thử bằng `react-dom/server` với số giả. **Chưa xem trên màn thật.** Báo cáo: `32_DASH12C_GIAO_DIEN_TU_DAU_THANG.md`.
- **Chưa làm**: khởi động nóng lần tính đầu; xem trên màn hình thật / mobile.

---

## [2026-10-17] - DASH-12b-2: cache theo từng (BCVH, ngày) cho `ket-qua-phat-thang`

- **Sửa** `server/lib/phatDashboard.js`: thêm tầng cache 2 theo `(BCVH, ngày)` (`demNgayCoCache`, `chuKyTheoNgay`): chữ ký = file hàng đến của mọi BCVH có `file_date ∈ [ngày − 1, ngày + 3]` + đợt nhập phát của chính BCVH; chốt 10 phút; tầng 1 (60 giây + chữ ký toàn cục) giữ nguyên. Thêm `soLanDemNgay()` (đếm cho test / đo). Không đổi route, hợp đồng JSON, quyền.
- **Test** `tests/phat-thang.test.js` +1 ca (16 ca; đợt nhập BCVH ngoài tập → 0 ngày tính lại; đợt nhập M2 → chỉ 2 ngày; file mới → chỉ ngày trong cửa sổ; kết quả có cache == không cache). `tests/phat-dashboard.test.js`: kịch bản `PHAT_PERF=1` thêm các tình huống. `npm test`: 625 ca, 624 đạt, 1 bỏ qua. Đo (744.000 dòng giả): sau 1 đợt nhập của 1 BCVH ~1,1 giây (trước ~6,4), sau 1 file mới ~0,9 giây, lần đầu sau khởi động ~6,7 giây. Báo cáo: `31_DASH12B_KET_QUA_PHAT_THANG.md`.
- **Chưa làm**: khởi động nóng / tính nền cho lần đầu; giao diện (DASH-12c).

---

## [2026-10-17] - DASH-12b: `ket-qua-phat-thang` — kết quả phát từ đầu tháng (backend)

- **Thêm** `GET /api/arrivals/dashboard/ket-qua-phat-thang?bcvh=&ngay=` (`server/routes/arrivals.js`, cùng guard với `ket-qua-phat`; TIVI 403): `luy_ke` (tổng tử ÷ tổng mẫu, cộng TỪNG ngày `demNgay`, ngày `co_tt = 0` loại), `theo_ngay` (null khi chưa có số liệu), `chenh` (điểm, theo giá trị làm tròn 1 chữ số, «ngang» khi `|chênh| < 0,5`; null nếu < 2 ngày số liệu hoặc mẫu số hôm nay < 50), `nguong`; cache 60 giây + chữ ký dữ liệu. `server/lib/phatDashboard.js`, 3 hằng ở `server/lib/phatConfig.js`. Số ngày cũ theo trạng thái HIỆN TẠI. Quyết định #91.
- **Test** `tests/phat-thang.test.js` (mới, 15 ca; thêm vào `package.json`). **Test cũ sửa (có chủ đích)**: `tests/phat-dashboard.test.js` — số khoá của `phatConfig` 4 → 7; thêm dòng đo `ketQuaPhatThang` vào kịch bản `PHAT_PERF=1`. `npm test`: 624 ca, 623 đạt, 1 bỏ qua. Đo: 30 ngày × 6 BCVH không cache ~6,4 giây (dữ liệu giả 744.000 dòng, máy dev), trúng cache 0 ms. Báo cáo: `31_DASH12B_KET_QUA_PHAT_THANG.md`.
- **Chưa làm**: giao diện (DASH-12c); giảm chi phí lần tính đầu; lọc khung giờ (DASH-10d).

---

## [2026-10-17] - SANLUONG-5k: `import-arrivals.js --chia-ngay` (một file nhiều ngày, chia theo ngày đến)

- **Thêm** `chuanBiFileChiaNgay` / `ghiFileChiaNgay` / `importArrivalFileChiaNgay` ở `server/lib/arrivalsImport.js` (hàm mới, không sửa `chuanBiFile` / `ghiFileDaChuanBi`) và cờ `--chia-ngay` ở `scripts/import-arrivals.js`. Nhóm theo ngày đến R2, mỗi nhóm = file ảo `HangDen_<mã>_<ngày>_235959.csv` (`MANUAL`, sha256 của file thật), MỘT giao dịch; khoảng ngày đến `[tên−30, tên+1]`, > 1 % ngoài khoảng hoặc sai mã nhận ⇒ REJECTED; ≤ 31 nhóm.
- **Test** `tests/arrivals-chia-ngay.test.js` (mới, 9 ca; thêm vào `package.json`). `npm test`: 629 ca, 628 đạt, 1 bỏ qua. Hướng dẫn: `32_SANLUONG5K_IMPORT_CHIA_NGAY.md`.
- **Chưa làm**: chưa chạy với file thật; dòng NULL / ngoài khoảng xếp vào ngày tên file (chờ PO xác nhận).

---

## [2026-10-17] - SANLUONG-5j: lệnh xóa dữ liệu hàng đến theo BCVH × khoảng ngày (chạy khô mặc định)

- **Thêm** `scripts/xoa-du-lieu-bcvh.js`: `--bcvh … --tu … --den … [--chay-that --xac-nhan "XOA <tu>..<den>"] [--db …]`; ngày = `file_date`; chặn cứng 533140 (chuỗi chứa mã ở bất kỳ đâu), mã ngoài danh mục, ngày sai, `tu > den`, khoảng > 31 ngày; chạy khô in BCVH × file_date (file, dòng, SHBG, ngày đến nhỏ nhất..lớn nhất), tổng, cảnh báo dòng có ngày đến trong khoảng ở file ngoài khoảng (không xóa), SHBG có trạng thái phát / mồ côi. Chạy thật tái sử dụng lõi «Thay thế ngày» (#83): `giuKhoaChung`, `saoLuu` (tiền tố `truoc-xoa-bcvh`, giữ 5 bản riêng), `donThungRac`, bảng `thay_the_nhat_ky` / `thung_rac_*` (một mẻ mỗi (BCVH, ngày) → khôi phục bằng 5g-5); xóa trong MỘT giao dịch. Không đụng trạng thái phát, «Thay thế ngày», importer, `ket-qua-phat`.
- **Test** `tests/xoa-du-lieu-bcvh.test.js` (mới, 11 ca; thêm vào `package.json`). `npm test`: 620 ca, 619 đạt, 1 bỏ qua. `npm run build` đạt. Hướng dẫn: `31_SANLUONG5J_XOA_DU_LIEU_BCVH_KHOANG_NGAY.md`.
- **Chưa làm**: chưa chạy với DB thật (PO chạy khô trước); không có script khôi phục — khôi phục qua API 5g-5 (ADMIN) hoặc chép bản sao lưu.

---

## [2026-10-16] - DASH-10b: Tivi (phạm vi `all`) đọc `ket-qua-phat` (backend)

- **Thêm** `GET /api/arrivals/dashboard/ket-qua-phat` vào `TIVI_ALLOWED` (`server/lib/tivi.js`) và `tiviPhatGuard` ở `server/routes/arrivals.js`: Tivi chỉ qua khi phạm vi `all` và `bcvh` vắng/`all`, còn lại 403. `/api/phat/*` vẫn 403 với Tivi; vai trò khác và cấu trúc trả về không đổi. Quyết định #90.
- **Test** `tests/tivi.test.js` +5 ca (không file test mới). **Test cũ sửa (có chủ đích)**: `tests/phat-dashboard.test.js:165-169` — Tivi phạm vi `all` gọi `ket-qua-phat` không `bcvh` nay 200 (trước 403); xin `bcvh=<mã>` vẫn 403. `npm test`: 609 ca, 608 đạt, 1 bỏ qua. Không đổi `src/`. Báo cáo: `30_DASH10B_TIVI_KET_QUA_PHAT.md`.
- **Chưa làm**: giao diện Tivi (DASH-10c); lọc khung giờ và `ColKhungGio` (DASH-10d).

---

## [2026-10-16] - DASH-9b: API `chuyen_chieu` (hàng đến chuyến chiều, từ 10:00) cho thẻ Điều hành/Tivi (backend)

- **Thêm** `tong-quan-den.chuyen_chieu {buu_gui, ty_le, tu_gio, da_toi_gio}` ở `server/lib/dashboardDenQuery.js` (`countAcross`, `volumeOf`, `tongQuanDen`) và hằng `GIO_CHUYEN_CHIEU = 10` ở `server/config/dashboard-thresholds.js` (export riêng, ngoài `DASHBOARD_DEN_THRESHOLDS` để `nguong` không đổi). Không đổi `sau_15h`, `GIO_MUON`, `nguong`, `san_luong`, `src/`.
- **Test** `tests/dashboard-chuyen-chieu.test.js` (mới, 5 ca; thêm vào `package.json`). **Test cũ sửa (có chủ đích)**: `tests/dashboard-den.test.js:192` danh sách khóa của phản hồi thêm `chuyen_chieu`. `npm test`: 604 ca, 603 đạt, 1 bỏ qua. Báo cáo: `29_DASH9B_API_CHUYEN_CHIEU_TU_10H.md`.
- **Chưa làm**: giao diện (DASH-9c); gỡ `sau_15h` (chờ PO).

---

## [2026-10-16] - TEST-1: test nhật ký security.log đỏ ngẫu nhiên

- **Nguyên nhân**: không phải chạy song song dùng chung file (harness đặt `SECURITY_LOG` riêng mỗi tiến trình) mà là cuộc đua ghi bất đồng bộ (`fs.appendFile`) trong cùng một file test. **Sửa test**: `tests/arrivals-export.test.js`, `tests/nap-nguon-xem-xet.test.js` lọc dòng theo `ts > t0` của ca; không đổi `server/`, `src/`, không nới phép kiểm. `npm test` 3 lần: 599 ca, 598 đạt, 1 bỏ qua. Báo cáo: `28_TEST1_SECURITY_LOG_CHAY_SONG_SONG.md`.

---

## [2026-10-16] - DASH-7f: tỷ lệ phát — mỗi SHBG trong ngày chỉ tính cho BCVH có mốc đến muộn nhất (backend)

- **Sửa** `server/lib/phat.js` (CTE `g` + `runGan`/`GAN_JOIN` mới; `demNgay`, `tonCho`, `tyLeApi`) và `server/lib/phatDashboard.js` (`motBcvh`, `ketQuaPhat`): mẫu số, tử số, khung giờ, tồn chờ, giờ nhập, xếp hạng và `tyLeNgay` (trước/sau nhập đợt, hoàn tác) gán mỗi SHBG trong một ngày cho BCVH có `arrival_at` R2 muộn nhất (hòa → mã BCVH nhỏ hơn); hàng đi ngoài không có quy tắc riêng. Thêm trường `so_shbg_chuyen_tiep_loai_bo` (ty-le và ket-qua-phat). Không đổi: `tong-quan-den`, `dashboardDenQuery.js`, `arrivalsQuery.js`, `src/`.
- **Test** `tests/phat-bcvh-muon-nhat.test.js` (mới, 7 ca; thêm vào `package.json`). **Test cũ sửa (có chủ đích)**: `tests/phat.test.js`, `tests/phat-dashboard.test.js` (danh sách khoá thêm trường mới), `tests/phat-cung-ngay.test.js` (ngày 15/10 có S1 qua 2 BCVH: mẫu số 7 → 6, 2+2+3 → 1+2+3). Báo cáo: `27_DASH7F_TY_LE_PHAT_BCVH_DEN_MUON_NHAT.md`.
- **Chưa làm**: giao diện chưa dùng trường mới; gộp `tapNgayChung` với tập T của `dashboardDenQuery.js`.

---

## [2026-10-16] - DASH-7e: «Xử lý và tỷ lệ phát» (tổng) chỉ cộng BCVH có dữ liệu đúng ngày chung (backend)

- **Sửa** `server/lib/phat.js` (`tapNgayChung` mới; `tyLeApi`) và `server/lib/phatDashboard.js` (`ketQuaPhat`): với `bcvh=all` không chọn `ngay`, mẫu số, tử số (5 trạng thái), khung giờ, tồn chờ và giờ nhập chỉ tính tập T (BCVH có «hôm nay» riêng = ngày chung, như DASH-7d). Thêm `so_bcvh_trong_tong`, `bcvh_ngoai_tong`. Không đổi: công thức đếm (A), một BCVH, `ngay` rõ ràng, `pham_vi`, `cung_ngay`, xếp hạng BCVH.
- **Test** `tests/phat-cung-ngay.test.js` (mới, 8 ca; thêm vào `package.json`). **Test cũ sửa (có chủ đích)**: `tests/phat.test.js` (mẫu số 3 + 5 → 5, giờ nhập chỉ của M2) và `tests/phat-dashboard.test.js` (294 → 245 ở ba chỗ). `npm test`: 592 ca, 591 pass, 1 skip. Báo cáo: `26_DASH7E_TY_LE_PHAT_CUNG_NGAY.md`.
- **Chưa làm**: giao diện (ghi chú BCVH chậm); mẫu số theo B và tỷ lệ phát hàng chuyển tiếp (DASH-7c-c).

---

## [2026-10-16] - DASH-7d: «Toàn Trung tâm» chỉ cộng BCVH có dữ liệu đúng ngày chung (backend)

- **Sửa** `server/lib/dashboardDenQuery.js` (`tongQuanDen`): với `bcvh=all`, tập T = BCVH có «hôm nay» riêng bằng `ngay_du_lieu`; sản lượng, hàng đi ngoài, túi/kiện, khối lượng, `luot`, `sau_15h`, `den_luc`, `da_toi_gio` và hai mốc so sánh (`so_bcvh` đếm trong T) chỉ tính trên T. Thêm `so_bcvh_trong_tong`, `bcvh_ngoai_tong` (`[{ma, ngay}]`). Không đổi: `theo_bcvh`, `bcvh_can_chu_y` (x/6), `cung_ngay_du_lieu`, `nap_luc`, `bcvh=<một BCVH>`, «Xử lý và tỷ lệ phát».
- **Test** `tests/dashboard-den-cung-ngay.test.js` (mới, 8 ca; thêm vào `package.json`). **Test cũ sửa (có chủ đích)**: `tests/phat.test.js` — mẫu số phát (3 + 5) không còn bằng thẻ tổng Điều hành (5) khi các BCVH lệch ngày. `npm test`: 584 ca, 583 pass, 1 skip. Báo cáo: `25_DASH7D_TONG_CHI_TINH_BCVH_CUNG_NGAY.md`.
- **Chưa làm**: giao diện (ghi chú «A Lưới chưa có dữ liệu …», nhãn x/6); thống nhất mẫu số «Xử lý và tỷ lệ phát».

---

## [2026-10-16] - DASH-7c-b: «Toàn Trung tâm» đếm bưu gửi khác nhau xuyên BCVH (backend)

- **Sửa** `server/lib/dashboardDenQuery.js`: hàm mới `countAcross` (CTE xuyên BCVH, cắt giờ theo BCVH của từng dòng TRƯỚC khi chọn dòng sớm nhất); `tongQuanDen` với `bcvh=all` tính tổng bưu gửi, hàng đi ngoài, sau 15:00 và hai mốc so sánh (tử và mẫu cùng tập BCVH có mốc) theo công thức B. Thêm trường `san_luong.tong_cong_theo_bcvh`, `so_shbg_qua_nhieu_bcvh`, `tui_kien`, `khoi_luong_g` (chỉ `bcvh=all`). Số từng BCVH, `luot`, `bcvh=<một BCVH>` không đổi.
- **Test** `tests/dashboard-den-xuyen-bcvh.test.js` (mới, 8 ca; thêm vào `package.json` → `npm test`: 576 ca, 575 pass, 1 skip). Báo cáo: `24_DASH7C_B_TONG_XUYEN_BCVH.md`.
- **Chưa làm**: giao diện (`src/`) ghi chú «N bưu gửi qua 2 BCVH»; «Xử lý và tỷ lệ phát» vẫn công thức A (chờ số đo BCVH nào phát hàng chuyển tiếp).

---

## [2026-10-16] - NAS-2: Cấu hình chạy được bản demo trên NAS Synology (Docker; không sửa mã ứng dụng)

- **Sửa** `docker-compose.yml`: truyền đủ biến qua `environment:` (`TZ`, `PORT`, `JWT_SECRET`/`CMS_ALLOWED_IPS` bắt buộc, `JWT_EXPIRY*`, `LOGIN_IP_MAX_FAILS`, `TRUSTED_PROXIES`, `SFTP_*`, `SFTP_SYNC_*`; `SFTP_PORT` mặc định 5454); giữ `network_mode: host`, mount `./data:/app/data`, healthcheck `GET /`. `Dockerfile`: thêm bước kiểm nạp `better-sqlite3` (WAL) + `ssh2-sftp-client` lúc build, giữ `--ignore-scripts`. `.dockerignore`: loại `*.db*`, `**/data`, `backups`, `.github`.
- **Mới** `.env.nas.example` (chỉ tên biến + giá trị giả), `docs/ai/20_NAS_HUONG_DAN_CHAY.md`. Căn cứ: `19_NAS_TRIEN_KHAI_AUDIT.md`.
- **Chưa kiểm chứng**: build thật trên NAS (prebuilt `better-sqlite3`/`ssh2`), `docker compose config -q` (máy không có docker), vân tay/tường lửa SFTP 5454, TZ trong container. **Chưa làm** (NAS-3/NAS-4): tạo ADMIN trong container, sao lưu định kỳ, HTTPS.

---

## [2026-10-15] - SANLUONG-5f-1c: «Đã xem xét» cho mục cần xử lý của «Nạp dữ liệu nguồn» (backend)

- **Mới** `server/lib/napNguonXemXet.js` (bảng `nap_nguon_da_xem_xet`, dấu vân tay, lọc, đánh dấu, hủy); route `POST /api/nap-nguon/da-xem-xet`, `DELETE /api/nap-nguon/da-xem-xet/:id` (`server/routes/napNguon.js`, `requireAdmin`; `SECURITY_LOG` không ghi ghi chú).
- **Sửa** `server/lib/napNguonDoc.js`: `luoi()` bỏ mục đã xem xét còn hiệu lực khỏi `can_xu_ly`, trả `da_xem_xet[]` + `tong_hop.da_xem_xet`; thêm `dauVanTayMuc` (cho POST). `server/db.js`: tạo bảng khi khởi động. Quyết định #89.
- **Test** `tests/nap-nguon-xem-xet.test.js` (mới, 11 ca; đã thêm vào `npm test`). **Test cũ sửa (có chủ đích)**: `tests/nap-nguon-doc.test.js` — khóa `Object.keys` của `luoi` thêm `da_xem_xet`; kiểm tĩnh route 7 → 9 (thêm POST + DELETE).
- **Chưa làm**: giao diện (`src/`); lõi tải / nạp không đổi.

---

## [2026-10-15] - SANLUONG-5f-1b: «Ngày bắt đầu» của từng BCVH, ô `CHUA_BAT_DAU`

- **Sửa** `server/lib/napNguonDoc.js`: `nap()` tính `ngayBatDau` một lần (truy vấn gộp `MIN(file_date)` + duyệt tên `sftp_source_files`); `tinhO()` trả `CHUA_BAT_DAU` cho ngày trước ngày bắt đầu; `luoi()` thêm khóa `ngay_bat_dau`; `tong_hop.theo_trang_thai` thêm `CHUA_BAT_DAU` (10 khóa). `CAN_XU_LY` không đổi (không gồm trạng thái mới). #88.
- **Test** `tests/nap-nguon-doc.test.js`: +5 ca (557 ca; 556 pass, 1 skip). Sửa 2 ca cũ: BCVH không có dữ liệu nay cần một file sớm hơn để còn `NGUON_CHUA_CO_FILE`; danh sách khóa của `/luoi` thêm `ngay_bat_dau`. Docs: `17_…`, `04_DECISIONS.md` #88, `00_SNAPSHOT.md`.

---

## [2026-10-15] - SANLUONG-5g-5: Nhật ký «Thay thế ngày» (API đọc), khôi phục từ thùng rác, dọn

- **Mới** `server/lib/thayTheNhatKy.js` (lõi đọc), `server/lib/thayTheKhoiPhuc.js` (xem trước chỉ đọc + khôi phục một giao dịch); route `GET /api/arrivals/thay-the/nhat-ky[/:id]`, `POST /api/arrivals/thay-the/khoi-phuc/xem-truoc` và `/thuc-hien` (`server/routes/arrivals.js`, chỉ ADMIN). Khôi phục là BỔ SUNG: `INSERT OR IGNORE` theo khoá nghiệp vụ (id dòng gốc bỏ — đã bị dùng lại), tạo lại file với id gốc hoặc gắn vào bản OK cùng tên; không đụng trạng thái phát / NAS. #87.
- **Sửa** `server/lib/thayTheThucHien.js` (thêm bảng `thay_the_khoi_phuc`; `giuKhoaChung`; xuất `saoLuu`; regex dọn sao lưu nhận cả `truoc-khoi-phuc_`; gọi `xoaBoNhoBd10Share` sau thay), `server/lib/thayTheXemTruoc.js` (`layThuMucSaoLuu`), `server/lib/arrivalsQuery.js` (khoá memo `bd10Share` thêm `MAX(id)` file + `xoaBoNhoBd10Share`).
- **Dọn**: xóa `tests/helpers/arrivalsImport.truoc-5g1.js`; `tests/arrivals-import-split.test.js` giữ nguyên kịch bản 7 ca «tương đương», nay so với `chuanBiFile` + `ghiFileDaChuanBi` trên DB thứ hai (biến `REF`).
- **Test** `tests/thay-the-nhat-ky-khoi-phuc.test.js` (mới, 16 ca; đã thêm vào `npm test`). Docs: `19_THAY_THE_NGAY_NHAT_KY_KHOI_PHUC.md`.

---

## [2026-10-15] - SANLUONG-5f-2: API GHI «Lấy ngay» và «Lấy lại» (chỉ ADMIN, ghi người bấm)

- **Mới** `server/lib/napNguonLay.js`, route `POST /api/nap-nguon/lay-ngay` và `/lay-lai` (`server/routes/napNguon.js`, `requireAdmin`; 202 + chạy nền; 400 / 409 `DANG_CHAY` `TAM_DUNG` / 503; `SECURITY_LOG` không bí mật), hằng số `SO_FILE_TOI_DA_LAY_NGAY = 20`, `SO_O_TOI_DA_LAY_LAI = 20`. Bảng `sftp_sync_runs` thêm 4 cột nullable (`loai`, `nguoi_bam_ma`, `nguoi_bam_ten`, `so_o_yeu_cau`; chỉ ADD COLUMN, idempotent, `ensureLuotSchema` gọi ở `server/db.js`).
- **Sửa lõi chỉ ở dạng thêm** (PO cho phép): `sftpSync.syncSftpOnce` nhận `options.luotCoSan`; `sftpScheduler` thêm `tamDungHenGio` / `bo.tamDungNgoai` (lượt tay lỗi xác thực / vân tay đưa hẹn giờ về `TAM_DUNG`). Không đổi importer, `thayThe*.js`. **5f-1**: `nguoi` `{ma, ten}`|null, `loai`, `so_o_yeu_cau` ở mọi hình lượt; `luot_gan_nhat` và `dang_chay` thêm `loai`, `nguoi`.
- **Bước 0**: importer cho nạp lại `REJECTED`/`CONFLICT` nhưng KHÔNG nạp được `EMPTY` khi nguồn đổi nội dung (→ `KHONG_THE_LAY_LAI`, phương án chờ PO); chốt `DA_TU_CHOI` của lõi đồng bộ nên «Lấy lại» có vòng lặp riêng. Chi tiết `18_NAP_DU_LIEU_NGUON_API_LAY.md`.
- **Test** `tests/nap-nguon-lay.test.js` (mới, 18 ca; đã thêm vào `npm test`). **Test cũ sửa (ngoại lệ có chủ đích)**: `tests/nap-nguon-doc.test.js` (khoá `Object.keys` của lượt + `luot_gan_nhat`/`dang_chay` thêm `loai`/`nguoi` + kiểm tĩnh route: 5 GET + 2 POST), `tests/sftp-sync.test.js` (danh sách cột `sftp_sync_runs` thêm 4 cột). 518 → 536 ca. Docs: `18_NAP_DU_LIEU_NGUON_API_LAY.md`, `04_DECISIONS.md` #86, `17_…` (nguoi), `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`. Chưa làm: 5f-3 (giao diện), thay bản ghi `EMPTY`.

---

## [2026-10-15] - SANLUONG-5f-1: API ĐỌC màn «Nạp dữ liệu nguồn» (chỉ ADMIN)

- **Mới** `server/lib/napNguonDoc.js` (lõi thuần chỉ SELECT: `tongQuan`, `luoi`, `mot`, `dsLuot`, `chiTietLuot`), `server/routes/napNguon.js` (năm đường `GET /api/nap-nguon/tong-quan | luoi | o | luot | luot/:id`, `requireAdmin`; đăng ký ở `server/index.js`), `server/config/nap-nguon.js` (hằng số TẠM: giờ mong đợi 09:30 / 16:30, ân hạn 60 phút, ranh giới đợt 12:00, 62 ngày, ngưỡng 0,5× / 2,5×, 4 tuần mẫu, ≥ 3 ngày). Không bảng mới, không ghi DB, không đổi `/api/arrivals/*`.
- Trạng thái ô (BCVH × ngày × đợt S/C): `DA_NAP`, `RONG`, `LOI`, `NGUON_CO_FILE_CHUA_NAP` (kể cả ngày nhập tay), `NHAP_TAY`, `CHUA_DEN_GIO`, `CHO_FILE`, `NGUON_CHUA_CO_FILE`, `MA_KHONG_KHOP` (riêng); cờ phụ `nguon_co_file`, `nghi_ngo` (`IT` / `NHIEU` / `CHUA_DU_MAU`, theo trung vị cùng thứ trong tuần). `can_xu_ly` phẳng, mới nhất trước. Hàng khóa «Thay thế» lọc khỏi danh sách lượt. `nguoi` của lượt «Tay» = `null` (chưa có cột; 5f-2).
- Đo (DB giả 154.000 dòng, 1.080 file): lưới 62 ngày × 6 BCVH × 2 đợt ≈ 13 ms (lõi), ≈ 17 ms (HTTP). Test `tests/nap-nguon-doc.test.js` (mới, 17 ca; đã thêm vào `npm test`): mọi trạng thái, ranh giới 11:59:59 / 12:00:00, hôm nay trước / sau giờ, nghi ngờ, mã lạ, lượt + phân trang, quyền, 400, chỉ-đọc (so mọi bảng), không lộ bí mật (`SFTP_*` giả), tĩnh. 501 → 518 ca. Docs: `17_NAP_DU_LIEU_NGUON_API_DOC.md`, `04_DECISIONS.md` #85, `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`. Chưa làm: 5f-2 (nút «Lấy lại» / «Lấy ngay»), 5f-3 (giao diện).

---

## [2026-10-15] - SANLUONG-5g-3b: Xem trước trả «mất thật» (và mức cảnh báo theo mất thật)

- `server/lib/thayTheXemTruoc.js`: nhận `tinhMatThat` (chuyển từ `thayTheThucHien.js`, xuất ra; `thayTheThucHien.js` nhập lại, hành vi `thayTheNgay` không đổi). `xemTruocThayThe` THÊM `so_sanh.shbg_mat_that`, `ty_le_mat_that`, `shbg_mau_mat_that` (6 ký tự đầu, tối đa 20), `canh_bao.can_dong_y_mat`; giữ nguyên `shbg_chi_o_cu` / `ty_le_mat` / `shbg_mau_chi_o_cu` (cận trên). ĐỔI NGHĨA: `canh_bao.muc`, `canh_bao.khoa_mac_dinh`, `phat` theo mất thật (đúng 5 % vẫn `CAN_XAC_NHAN`). `scripts/thay-the-xem-truoc.js` in `MẤT THẬT n (x%) — mức CẬN TRÊN m (y%)`.
- Test `tests/thay-the-xem-truoc.test.js` 27 → 34 ca: 2 ca cũ cập nhật (khoá `canh_bao` / `so_sanh` có thêm trường), 7 ca mới (cứu bởi file D+1 → `AN_TOAN` dù cận trên 20 %; đúng 5 % / hơn 5 %; BCVH khác không cứu; `phat` theo mất thật; đối chiếu với `thayTheNgay` chạy khô; không SHBG đầy đủ ở trường mới; đo thời gian trên DB giả ~153.500 dòng ≈ 110–130 ms). Docs: `15_…` mục 9, `16_…`, `04_DECISIONS.md` #84, `00_SNAPSHOT.md`.

---

## [2026-10-15] - SANLUONG-5g-3: THỰC HIỆN «Thay thế ngày của một BCVH» nguyên khối (xóa + nạp lại, sao lưu, thùng rác, khoá, nhật ký)

- **Mới** `server/lib/thayTheThucHien.js` (`thayTheNgay`, `ensureThayTheSchema`, `donThungRac`, `donSaoLuu`; không nạp thư viện SFTP, không mở DB), route **`POST /api/arrivals/thay-the/thuc-hien`** (chỉ ADMIN; `SECURITY_LOG` không SHBG), script **`scripts/thay-the-ngay.js`** (khô mặc định; thật cần `--chay-that` + `--xac-nhan=<mã>:<ngày>` + `--dong-y-mat` nếu mất thật; mã thoát 0–11). Bảng mới (UTC) `thay_the_nhat_ky`, `thung_rac_file`, `thung_rac_dong` (tạo ở `server/db.js`; không đổi bảng hiện có). Hằng số mới ở `server/config/thay-the.js` (30 ngày thùng rác, 5 bản sao lưu, đệm 32 MiB).
- Thứ tự: đầu vào + gõ lại xác nhận → khoá thật (`sftp_sync_runs`, cờ bộ nhớ) → tải + `chuanBiFile` + so `sha256` bản xem trước → so sánh + **«mất thật»** (trừ SHBG còn ở file ngoài tập cùng BCVH) + khoá đồng ý → `db.backup()` toàn DB (`data/backups/`, giữ 5) → MỘT `db.transaction` đồng bộ (thùng rác → xóa → `ghiFileDaChuanBi(ghiTuChoi:false)` + kiểm `status` → nhật ký) → dọn → nhả khoá. Nguồn SFTP chỉ list / get / end.
- **Sửa nhỏ `server/lib/thayTheXemTruoc.js`** (ngoại lệ cho phép; kết quả xem trước KHÔNG đổi): tách `lietKeNguonCuaNgay`, `tinhSoSanh`, `mucCanhBaoTheo` để dùng chung; xuất thêm `docPhiaDb`, `docPhiaPhat`. Không đổi `arrivalsImport.js`, `sftpSync.js`, `sftpScheduler.js`.
- **Test** `tests/thay-the-thuc-hien.test.js` (mới, 32 ca; đã thêm vào `npm test`): thành công, ngoài tập còn nguyên, nguyên khối (REJECTED / ném lỗi / trigger DB thật / dữ liệu đổi giữa chừng → DB y nguyên mọi bảng), xác nhận, mất thật vs cận trên, `NGUON_DA_DOI`, tập rỗng, sao lưu lỗi + giữ 5 bản, thùng rác 30 ngày + mô phỏng khôi phục, khoá (lõi đồng bộ + hẹn giờ bỏ qua lượt, hai lần thay cùng lúc), chạy khô, route + quyền + `SECURITY_LOG`, script, kiểm tĩnh (không `await` trong giao dịch, không lệnh ghi SFTP). 461 → 494 ca.
- **Ngoại lệ sửa test cũ (PO yêu cầu 15/10/2026)**: `tests/thay-the-xem-truoc.test.js` ĐỎ ở máy có `.env` chứa `SFTP_*` (route nhận 200 thay vì 503, có thể đã kết nối NAS thật) vì `server/index.js` nạp `.env` bằng `process.loadEnvFile()` khi harness `require` nó. Nay test cách ly `SFTP_*` (đầu file + sau `startTestServer`, khôi phục sau), nguồn mặc định CẤM MẠNG, thêm 1 ca canh (`tests/helpers/khongMang.js`). Đã kiểm lại với `.env` giả ở thư mục đứng và `SFTP_HOST=127.0.0.1` trong tiến trình: xanh; bản cũ đỏ đúng ca đó.
- Docs: `16_THAY_THE_NGAY_THUC_HIEN.md`, `04_DECISIONS.md` #83, `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`. Chưa làm: hoàn tác (5g-5), giao diện (5g-4), chạy với NAS / DB thật.

---

## [2026-10-15] - SANLUONG-5g-2: Xem trước «Thay thế ngày của một BCVH» (chỉ đọc)

- **Mới** `server/lib/thayTheXemTruoc.js` (`xemTruocThayThe`; chỉ SELECT, không nạp thư viện SFTP, không lệnh ghi), `server/config/thay-the.js` (`NGUONG_MAT_SHBG_DO = 0.05` TẠM, `SO_SHBG_MAU = 20`), route **`POST /api/arrivals/thay-the/xem-truoc`** (chỉ ADMIN; `server/routes/arrivals.js`; ghi `SECURITY_LOG` không có SHBG), script **`scripts/thay-the-xem-truoc.js`** (DB chỉ-đọc, ghim vân tay; mã thoát 0–8).
- Tính: tập file DB của (BCVH, `file_date`) mọi trạng thái + số dòng / SHBG / phân bố `arrival_date`; tập file nguồn của đúng mã + đúng ngày (bỏ `DuBao_*`, `#recycle`, lạ; ≤ 3 byte `RONG`), tải file chọn về thư mục tạm → `chuanBiFile` → xóa tệp; so sánh SHBG chuẩn hóa (chỉ ở cũ / chỉ ở mới / chung, `ty_le_mat`, theo ngày đến, ≤ 20 SHBG mẫu cho ADMIN); mức `AN_TOAN` / `CAN_XAC_NHAN` (đúng 5 % vẫn thế) / `DO` (> 5 %), `khoa_mac_dinh`, `khong_the_thay`; ảnh hưởng `phat_status_current(bcvh, shbg)`; `tap_file_nguon` kèm sha256 cho 5g-3.
- Chặn: đang có lượt đồng bộ (khóa DB / hẹn giờ `DANG_CHAY`) → 409; hai bản xem trước cùng lúc → 409; lỗi xác thực / vân tay / mạng / thư mục phân loại, KHÔNG thử lại. `client.end()` luôn được gọi, tệp tạm luôn xóa.
- Test `tests/thay-the-xem-truoc.test.js` (mới, 26 ca; đã thêm vào `npm test`). Docs: `15_THAY_THE_NGAY_XEM_TRUOC.md`, `04_DECISIONS.md` #82, `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`. Không đổi `arrivalsImport.js`, `sftpSync.js`, `sftpScheduler.js`, lược đồ DB. Chưa làm: xóa / nạp / thùng rác / giao diện (5g-3, 5g-4); chưa chạy với NAS thật.

---

## [2026-10-15] - SANLUONG-5g-1: Tách importer thành chuanBiFile (async, không đụng DB) + ghiFileDaChuanBi (đồng bộ)

- `server/lib/arrivalsImport.js` (PO cho phép, chỉ ticket này): `importArrivalFile` tách đôi — `chuanBiFile(filePath, { source })` (bất đồng bộ, KHÔNG nhận `db`: đọc + kiểm tra tên / BOM / tiêu đề / từng dòng / khoảng ngày, băm, đếm; trả đối tượng «đã chuẩn bị» `ketLuan` READY / EMPTY_FILE / REJECTED / SKIPPED_NAME) và `ghiFileDaChuanBi(db, daChuanBi, { ghiTuChoi, source })` (ĐỒNG BỘ: idempotent theo tên + sha256, `CONFLICT`, ghi file + `INSERT OR IGNORE` + `ward_bdx_map`). Gọi được BÊN TRONG giao dịch ngoài (savepoint của better-sqlite3, không tự commit, hoàn tác theo giao dịch ngoài). `options.ghiTuChoi=false` tắt ghi `REJECTED` / `CONFLICT`. `importArrivalFile` giữ nguyên chữ ký và hành vi (= await `chuanBiFile` + `ghiFileDaChuanBi`). Xuất thêm hai hàm.
- **Test** `tests/arrivals-import-split.test.js` (mới, 16 ca; đã thêm vào `npm test`): tương đương với bản chụp trước thay đổi `tests/helpers/arrivalsImport.truoc-5g1.js` (đã xóa ở 5g-5, nay so với `chuanBiFile` + `ghiFileDaChuanBi` trên DB thứ hai; giá trị trả về + thứ tự khoá + nội dung 3 bảng; file hợp lệ / rỗng / chỉ BOM / chỉ tiêu đề / trùng dòng / nạp lại / CONFLICT / REJECTED / tên sai / ISO + Mỹ + NULL / thư mục / file không tồn tại), `chuanBiFile` không đụng DB, `ghiFileDaChuanBi` đồng bộ, lồng giao dịch (hoàn tác, 2 file một giao dịch, `BEGIN` tay, lỗi giữa chừng), `ghiTuChoi`. Không sửa test cũ nào.
- Docs: `04_DECISIONS.md` #81, `14_XOA_DU_LIEU_NGAY_AUDIT.md` (mục 7.3), `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`. Chưa làm: xem trước / thay thế / thùng rác / API / giao diện (5g-2, 5g-3…).

---

## [2026-10-15] - SANLUONG-5e: Hẹn giờ tự động nạp file từ SFTP (đường nạp chính hằng ngày)

- **Mới** `server/lib/sftpScheduler.js` (`startSftpScheduler`/`stopSftpScheduler`/`docTrangThaiSftp`, lập lịch thuần, đồng hồ + kết nối + nạp tiêm được) và `server/lib/sftpConnect.js` (nơi duy nhất nạp `ssh2-sftp-client`, nạp lười, ghim vân tay). `server/index.js`: gắn hẹn giờ sau `app.listen` trong try/catch; MẶC ĐỊNH TẮT, chỉ `SFTP_SYNC_ENABLED=1` mới bật, KHÔNG chạy trong test (`NODE_TEST_CONTEXT`); sai cấu hình → một dòng log nêu tên biến, không khởi động, máy chủ không sập; lượt đầu sau 30 giây; tắt gọn khi SIGTERM/SIGINT (chỉ khi đang bật).
- **Chu kỳ** `SFTP_SYNC_INTERVAL_MINUTES` (mặc định 10, tối thiểu 2), `SFTP_SYNC_MAX_FILES` (mặc định 5) + dùng lại `SFTP_*`, `SFTP_SYNC_DAYS`, `SFTP_STABLE_SECONDS`. Chống chạy chồng: khoá trong tiến trình + khoá DB (script chạy tay đang chạy → hẹn giờ bỏ qua và ghi nhận).
- **Ổn định không chờ trong lượt**: bảng mới `sftp_source_files` (thu_muc, ten_file, kich_thuoc, mtime, lan_dau_thay, lan_cuoi_thay, so_lan_giu_nguyen, giu_nguyen_tu, con_tren_nguon); file ổn định khi giữ nguyên qua ≥ 2 lượt cách nhau ≥ `SFTP_STABLE_SECONDS`; giữ cả file đã biến mất. Lõi `sftpSync.js`: chế độ `oDinh: 'BANG'`, `capNhatNguon`, `ghiLuotThatBai`, nhường vòng lặp giữa hai file (`setImmediate`), `huy()`.
- **Lỗi**: mạng / thư mục → ghi vào lượt, thử lại chu kỳ sau; **xác thực / vân tay sai → TẠM DỪNG** đến khi khởi động lại (tránh NAS chặn IP); lỗi lạ → thử lại, ghi đầy đủ.
- **Đổi hành vi 5c-1 (PO duyệt)**: file mã LẠ (không thuộc 6 BCVH) → `BO_QUA` + `MA_LA`, không tải, không nạp (cả script chạy tay lẫn hẹn giờ). Ca test đổi: `tests/sftp-sync.test.js` ca «mã LẠ…» (trước: nạp + gắn nhãn; nay: bỏ qua, không tải); script in cảnh báo mới.
- **Test**: `tests/sftp-scheduler.test.js` (mới, 25 ca, đồng hồ/`client` giả, DB tạm) + `tests/sftp-sync.test.js` 31 → 35 ca (BANG, source_files, nhường, huỷ, ghiLuotThatBai; ca mã lạ viết lại); đã thêm file test vào `npm test`.
- **Số đo** (dữ liệu giả): 5 file × 5.000 dòng, độ trễ vòng lặp lớn nhất ≈ 140 ms (xem `15_SFTP_SCHEDULER.md` mục 9; DB thật chậm hơn ~10×). **Triển khai NAS** (chỉ kiểm tra): compose KHÔNG truyền `SFTP_*` vào container (cần `env_file`/`environment` — ticket triển khai), `ssh2-sftp-client` có trong ảnh, `network_mode: host`, `TZ=Asia/Ho_Chi_Minh`.
- Docs: `15_SFTP_SCHEDULER.md`, `13_SFTP_SYNC.md`, `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`, `.env.example`. Chưa làm: API / màn quản trị («Nạp dữ liệu nguồn»), nút «Lấy lại», nạp lịch sử (5d), sửa Docker/compose.

---

## [2026-10-15] - SANLUONG-5c-1: Nhiều BCVH chung một thư mục nguồn

- PO xác nhận file của mọi BCVH nằm CÙNG một thư mục (`/CSV_Report_533140`), tên chỉ đổi mã đơn vị. **Bỏ** quy tắc «mã trong tên file ≠ mã trong tên thư mục thì `BO_QUA` (`KHAC_MA_THU_MUC`)»: `server/lib/sftpSync.js`, `server/lib/sftpFiles.js` (`locMuc` không còn nhận tên thư mục, bỏ `canhBao.khacMaThuMuc` và hàm `maTuTenThuMuc`), `scripts/sftp-probe.js`. Mã đơn vị lấy từ TÊN FILE. Không giữ cảnh báo thay thế (mix mã là bình thường); thay bằng thống kê theo mã.
- **Thống kê theo mã** (`kq.theoMa`; `thongKeTheoMa`/`soSanhMa` ở `sftpFiles.js`): `scripts/sftp-sync.js` in mỗi mã — khớp / sẽ nạp (đã nạp) / đã có / chưa ổn định / rỗng / bỏ qua / lỗi; 6 BCVH luôn có mặt (0 file = «không có file nào trong thư mục»); `scripts/sftp-probe.js` in số file mỗi mã.
- **Thứ tự nạp**: ngày/giờ trong tên tăng dần, cùng thời điểm thì mã tăng dần (ổn định giữa các lượt). `--toi-da` và «từ ngày» chung cho mọi mã.
- **Mã lạ**: importer lấy `unit_code` từ tên file, không có danh sách BCVH hợp lệ và không so với `BC_nhan_BG` trong nội dung (`arrivalsImport.js:180-189, 371`) nên NẠP IM LẶNG mã lạ. Lõi sync nạp theo importer nhưng gắn `ma_loi = MA_LA` + ghi chú, `dem.maLa`, cảnh báo ở cuối lượt; mã thoát không đổi. Cần PO quyết có từ chối mã lạ không (`13_SFTP_SYNC.md` mục 9). Importer KHÔNG sửa.
- Test: `tests/sftp-sync.test.js` 26 → 31 ca (bỏ ca `KHAC_MA_THU_MUC`; thêm: 3 mã chung thư mục, thứ tự theo ngày/giờ rồi mã, `--toi-da`/«từ ngày» chung mọi mã, mã lạ, ghi nhận hành vi importer, thư mục không theo mẫu + ngày sai); `tests/sftp-probe.test.js` 21 ca (2 ca đổi theo quy tắc đã bỏ: lọc thư mục không còn `khacMaThuMuc`; thay ca `maTuTenThuMuc` bằng ca thống kê theo mã). Docs: `13_SFTP_SYNC.md` (mục 9 mới), `12_SFTP_PROBE.md`, `00_SNAPSHOT.md`.

---

## [2026-10-15] - SANLUONG-5c (sửa trước khi commit): file ≤ 3 byte đi qua importer

- `server/lib/sftpSync.js`: bỏ nhánh «≤ 3 byte → `EMPTY` không tải» (và hằng `MAX_BOM_BYTES`). Sau kiểm tra ổn định, file ≤ 3 byte (chỉ BOM / 0 byte) vẫn được tải và đưa cho `importArrivalFile`, importer ghi đợt `EMPTY` vào `arrival_import_files`; lượt sau là `DA_CO`. Điều kiện «đã nạp» giữ nguyên (`OK`/`EMPTY`). Lý do: không ghi `EMPTY` thì `getMissingBatches` báo thiếu đợt cho ngày có file chiều chỉ-BOM.
- `tests/sftp-sync.test.js`: ca file 3 byte viết lại (tải; importer ghi `EMPTY`; lượt sau `DA_CO`; `getMissingBatches` không báo thiếu đợt), +ca đối chứng (không nạp file BOM → bị báo thiếu), +ca file 0–3 byte còn đổi → `CHUA_ON_DINH` không tải (nay 26 ca). Docs: `13_SFTP_SYNC.md`.

---

## [2026-10-15] - SANLUONG-5c: Lõi đồng bộ SFTP chạy tay (quét → tải → nạp lần lượt)

- **Mới** `server/lib/sftpSync.js`: `syncSftpOnce({ client, db, dirs, now, sleep, tmpDir, options })` (client tiêm vào, chỉ `list`/`get`; KHÔNG nạp thư viện SFTP), lược đồ `sftp_sync_runs` + `sftp_sync_files` (`ensureSftpSyncSchema`, gọi từ `server/db.js`), khoá chống chạy chồng 30 phút (lượt treo được đóng), tệp tạm `os.tmpdir()/hue-dhcl-sftp-*/<tên gốc>` luôn xoá, tên tệp kiểm chặt.
- **Quy tắc chọn file**: chỉ `HangDen_<mã>_<yyyymmdd>_<hhmmss>.csv` (bỏ `DuBao_*`, `#recycle`, `.x`, lạ); ≥ «từ ngày» (mặc định hôm nay − `SFTP_SYNC_DAYS`=3, Bangkok); mã khác thư mục → không nạp; đã có trong `arrival_import_files` (OK/EMPTY) → `DA_CO` không tải; hai lần liệt kê cách `SFTP_STABLE_SECONDS`=60 giây phải cùng kích thước + mtime; ≤ 3 byte: xem mục «sửa trước khi commit» ở trên; nạp cũ→mới, tối đa `--toi-da`=5. Không nạp đè file cùng tên.
- **Mới** `scripts/sftp-sync.js`: mặc định CHẠY KHÔ (DB chỉ-đọc, không ghi gì); `--chay-that`, `--tu-ngay=yyyymmdd`, `--toi-da=N`, `--on-dinh=GIÂY`; bắt buộc ghim vân tay; mã thoát 0–7 (7 = đang có lượt khác); chỗ duy nhất mở DB (theo `scripts/import-arrivals.js`).
- `server/lib/sftpFiles.js`: thêm `maTuTenThuMuc`. `server/db.js`: +1 khối gọi `ensureSftpSyncSchema`. Importer `arrivalsImport.js` KHÔNG sửa.
- **Test** `tests/sftp-sync.test.js` (mới, 26 ca, client giả, DB tạm) + 1 ca ở `tests/sftp-probe.test.js`; đã thêm `tests/sftp-sync.test.js` vào script `npm test`. `.env.example`: thêm `SFTP_SYNC_DAYS`, `SFTP_STABLE_SECONDS`. Docs: `13_SFTP_SYNC.md`, `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`.
- **Đo** (dữ liệu giả, DB tạm): nạp 2.300 dòng ≈ 60–80 ms.
- **Chưa làm / điều chưa chắc**: hẹn giờ (5e), giao diện (5f), nạp lịch sử (5d); chưa chạy với NAS thật; (đã xử lý ở mục sửa phía trên).

---

## [2026-10-15] - SANLUONG-5b: Công cụ thử kết nối SFTP chỉ đọc (nhánh feat/sanluong-5b-sftp-probe)

- **Điều kiện bắt đầu**: `ssh2-sftp-client` 12.1.1 (trên `ssh2` 1.17.0) PO đã cài sẵn vào `package.json` / `package-lock.json`; hai file này KHÔNG sửa trong ticket.
- **Mới** `scripts/sftp-probe.js`: `--show-fingerprint` (in vân tay SHA256 của khoá máy chủ; từ chối khoá ở bước trao đổi khoá nên không gửi tên / mật khẩu) và chế độ thường (bắt buộc khớp `SFTP_HOSTKEY_SHA256`, rồi chỉ LIỆT KÊ các thư mục trong `SFTP_DIRS`: tên, kích thước, mtime; tóm tắt; tuỳ chọn `--gioi-han`, `--on-dinh`). Chỉ gọi `connect`/`list`/`end`; không tải file, không nạp, không mở DB. Mã thoát 0–6 (bảng ở `12_SFTP_PROBE.md`).
- **Mới** `server/lib/sftpFiles.js`: hàm thuần (tên file, lọc `#recycle`/ẩn/lạ, tóm tắt, `fileOnDinh`, vân tay `SHA256:`/hex, đọc cấu hình, phân loại lỗi, che bí mật) — SANLUONG-5c dùng lại.
- **Test** `tests/sftp-probe.test.js` (mới, 20 ca, không mạng): tên file, lọc, ổn định, vân tay, cấu hình thiếu biến, mã thoát, kiểm tĩnh «không có lệnh ghi». Đã thêm vào cuối script `npm test` ở `package.json` (theo yêu cầu PO; không đổi dependencies / lock): `npm test` 338 → 358 ca (357 pass, 1 skip).
- `.env.example`: thêm TÊN `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`, `SFTP_DIRS`, `SFTP_HOSTKEY_SHA256` (giá trị trống). Docs: `12_SFTP_PROBE.md` (cách PO chạy, mã thoát), `00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`.
- **Chưa làm**: tải file, nạp, bảng theo dõi, bộ hẹn giờ (SANLUONG-5c…5f, `11_SFTP_AUDIT.md`). Script CHƯA được chạy với NAS thật (người làm không có mạng tới NAS).

---

## [2026-10-14] - PHAT-3b-1: Tỷ lệ 4 trạng thái còn lại trong xếp hạng BCVH (backend)

- `server/lib/phatDashboard.js`: mỗi phần tử `xep_hang_bcvh` thêm `theo_trang_thai{PKTC, CHUYEN_HOAN, LAC_HUONG, CHUA_CO_TT: {nhan, so, ty_le}}` (cùng khoá/dạng với khối cấp tổng, mẫu số = `mau_so` của BCVH); `nguong.san_xep_hang_bcvh` = `SAN_XEP_HANG_BCVH` (50). `chua_du_du_lieu` không đổi (không có tỷ lệ). Chỉ thêm khoá; quyền, xếp hạng, sàn không đổi; `/api/phat/ty-le` không đổi.
- `tests/phat-dashboard.test.js`: +1 ca (338 ca; trước 337): 4 khoá đúng tên/dạng, `ptc` + 4 tỷ lệ ≈ 1, khớp `/ty-le` cùng BCVH cùng ngày, số cụ thể của hai BCVH giả, 1 BCVH → `xep_hang_bcvh` vẫn `null`; ca ngưỡng kiểm `san_xep_hang_bcvh`; ca khoá phần tử kiểm khoá cũ giữ tên/thứ tự.
- Docs: `08_PHAT.md` mục 4, `04_DECISIONS.md` #80, `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`.

---

## [2026-10-14] - PHAT-3b: Backend kết quả phát cho Dashboard «Điều hành hôm nay»

- **Endpoint mới** `GET /api/arrivals/dashboard/ket-qua-phat?bcvh=&ngay=` (`server/routes/arrivals.js` — middleware `phatScope` + route; `server/lib/phatDashboard.js` — `parseParams`, `ketQuaPhat`). Trả `mau_so`, 5 trạng thái (số + tỷ lệ), `ptc`, `muc_cap_nhat`, `co_so_lieu_phat`, `so_lieu_den_luc` (+ `_bangkok`), `nguong{ptc_dat, chua_co_tt_canh_bao}`, `xep_hang_bcvh`, `chua_du_du_lieu`. ADMIN, TTVH, GDVH đều xem đủ mọi BCVH như 3 endpoint dashboard «đến» (#72); STAFF và TIVI 403 (TIVI không vào allowlist). Không khung giờ, không `ton_cho`.
- **Cờ theo ngày**: `co_so_lieu_phat` / `so_lieu_den_luc` chỉ xét SHBG đến đúng ngày xem; ngày chưa ai nhập → `false` / `null` (sửa lỗi khảo sát PHAT-3a: `/ty-le` mượn giờ của đợt ngày khác). `phat.js` `demNgay` trả thêm `co_tt`, `nhap_luc_max` (thêm hai cột vào cùng truy vấn, số khác không đổi); export thêm `demNgay`, `dungTyLe`, `tonCho`, `zeroMap`, `congMap`.
- **Hằng số máy chủ** `server/lib/phatConfig.js` (TẠM, PO chốt 14/10/2026): `NGUONG_PTC_DAT = 0.82`, `NGUONG_CHUA_CO_TT_CANH_BAO = 0.10`, `SAN_XEP_HANG_BCVH = 50`, `SAN_XEP_HANG_PHUONG_XA = 10` (chưa dùng).
- **Xếp hạng**: PTC giảm dần trên cả mẫu số, chỉ khi phạm vi ≥ 2 BCVH; mẫu số < 50 (`duoi_san`) hoặc chưa nhập trong ngày (`chua_nhap`) → `chua_du_du_lieu`, không xếp cuối.
- **Test** `tests/phat-dashboard.test.js` (mới, 17 ca; thêm vào script `npm test` ở `package.json`): quyền 5 vai trò + GDVH có/không gán, ngày có/không số liệu, sàn 49/50, BCVH chưa nhập, thứ tự + đồng hạng, ngưỡng, `/ty-le` không đổi, 1 ca đo hiệu năng `PHAT_PERF=1` (dữ liệu giả 6 BCVH × 31 ngày × 4.000 SHBG): `ton_cho` ~320 ms/BCVH, `/ty-le` gộp 6 BCVH ~2,2 s, endpoint mới ~75 ms.
- **Docs**: `08_PHAT.md` mục 4 (endpoint, hằng số, cờ theo ngày), `04_DECISIONS.md` #79, `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`, `10_PHAT3_AUDIT.md` (một dòng «PHAT-3b đã làm»).
- **Chưa làm**: giao diện Dashboard (PHAT-3c); tivi, xếp hạng phường/xã, loại việc phát (PHAT-3d); màn 13 vẫn dùng hằng số ngưỡng riêng trong giao diện.
- **Sửa theo PO (phương án A, cùng ngày)**: GDVH xem ĐỦ mọi BCVH ở endpoint này — bỏ giới hạn theo `user_bcvh` trong `phatScope` (`server/routes/arrivals.js`), GDVH chưa được giao BCVH nào vẫn có dữ liệu, xin `bcvh` bất kỳ đều được, xếp hạng đủ các BCVH đủ điều kiện. Lý do: giống #72, xếp hạng cần so sánh các BCVH. Phân quyền `/api/phat/*` (nhập, hủy, lịch sử, bản kiểm tra) KHÔNG đổi. Test: viết lại ca «quyền GDVH» và ca xếp hạng GDVH; thêm kiểm `/api/phat/batches` vẫn 403 với GDVH ngoài BCVH được giao (vẫn 17 ca).

---

## [2026-10-14] - DATE-1: Ô chọn ngày dùng chung dd/mm/yyyy + sửa mũi tên đôi

- **Thành phần dùng chung `CustomDatePicker.jsx`** (`src/components/arrivals/CustomDatePicker.jsx`, re-export tại `src/components/common/CustomDatePicker.jsx`):
  - Mở rộng hỗ trợ nhập và hiển thị ngày chuẩn `dd/mm/yyyy`, người dùng có thể gõ tay trực tiếp hoặc bấm icon lịch mở popup lịch chọn trực quan.
  - Kiểm tra hợp lệ phía client: ngày có thật trong tháng/năm (xử lý cả năm nhuận tháng 2: 28/29 ngày, tháng 30/31 ngày, bắt lỗi ngày không có thật như 31/02), kiểm tra giới hạn `min`/`max`.
  - Hỗ trợ 2 chế độ dữ liệu: chuỗi `YYYY-MM-DD` (cho các màn Phát) và đối tượng `Date` (cho màn Sản lượng đến `ArrivalsFilters`), không làm thay đổi tham số gửi API của các màn hình.
  - Lịch chọn ngày thuần React với giao diện tiếng Việt (tuần T2..CN, tiêu đề Tháng m/yyyy), không phụ thuộc vào datepicker gốc của trình duyệt.
- **Thay thế tại các màn hình**:
  - Màn 13: `src/components/phat/ProcessingDeliveryView.jsx` (ô «Ngày đến:» dùng CustomDatePicker không viền tích hợp trong thanh công cụ, hiển thị `dd/mm/yyyy`, giữ nguyên `selectedDate` dạng `YYYY-MM-DD`).
  - Màn 14: `src/components/phat/PhatTemplateView.jsx` (2 ô «Ngày đến, từ» và «đến» dùng CustomDatePicker, giữ nguyên ngày mặc định cố định `2026-10-02` và `2026-10-03`).
  - Màn 17: `src/components/phat/PhatHistoryView.jsx` (2 ô lọc «Nhập từ ngày» và «đến ngày» dùng CustomDatePicker, liên kết YYYY-MM-DD với API).
  - Màn Sản lượng đến: `src/components/arrivals/ArrivalsFilters.jsx` (CustomDatePicker hỗ trợ gõ tay dd/mm/yyyy kèm chọn lịch, giữ nguyên Date object và định dạng gửi API).
- **Sửa lỗi mũi tên đôi**:
  - `src/components/phat/PhatHistoryView.jsx`: bỏ ký tự «←» trong chữ ở nút quay về, chỉ giữ biểu tượng `ArrowLeft` («Về Xử lý và tỷ lệ phát»).

---

## [2026-10-14] - PHAT-2b-2: Giao diện Lịch sử nhập, Hủy đợt nhập, nhãn cảnh báo (Bảng 17 & 18)

- **Màn Lịch sử nhập** (`src/components/phat/PhatHistoryView.jsx` - Bảng 17):
  - Bộ lọc: BCVH (mặc định tất cả BCVH được xem), «Nhập từ ngày» và «đến ngày» (ô text dd/mm/yyyy, mặc định để trống, kiểm tra hợp lệ phía client trước khi gọi API; đổi sang YYYY-MM-DD khi gọi), «Người nhập» (danh sách `nguoi_nhap_lua_chon` từ API), «Trạng thái» (Tất cả / Đã nhập / Đã hủy), nút «Xóa lọc». Đổi bộ lọc tự về trang 1.
  - Bảng đợt nhập: Đợt (#id), Giờ nhập (giờ Bangkok), Người nhập, BCVH (tên), Tên file, Đã nhập, Lỗi, Cảnh báo (nhãn vàng `{n} cảnh báo` khi n > 0, «Không có» khi n = 0, «Không rõ» khi n là null), Trạng thái («Đã nhập» xanh, «Đã hủy» xám kèm «Hủy bởi {tên}, {giờ}»), Thao tác. Không có cột «Để trống», «Không đổi».
  - Thao tác: Nút «Hủy đợt nhập» (viền đỏ) khi `trang_thai='da_nhap'` và `co_quyen_hoan_tac=true`, khoá khi đang kiểm tra; hiện «Chỉ ADMIN, TTVH hoặc người nhập» khi không có quyền; đợt đã hủy để trống.
  - Phân trang: hiển thị size=20 tường minh, «Hiển thị a trên b đợt · «Không rõ» là đợt nhập trước khi hệ thống lưu số cảnh báo», nút Trước / Sau và «Trang x / y».
- **Hộp thoại Hủy đợt nhập** (`src/components/phat/PhatCancelBatchDialog.jsx` - Bảng 18 A–D):
  - Trạng thái kiểm tra: hiện «Đang kiểm tra…» khi gọi `GET /api/phat/batches/:id/undo-preview`, chặn bấm đúp.
  - Trạng thái A (Xác nhận): thông tin đợt nhập, tổng bưu gửi sẽ đổi, số khôi phục trạng thái cũ, số xóa trạng thái về Chưa có thông tin phát; hai nút «Không hủy» và «Hủy đợt nhập này» (đỏ, chặn bấm đúp, khoá khi đang gửi).
  - Trạng thái B (Bị chặn): khi có đợt sau đã đổi cùng bưu gửi (từ preview hoặc nhận HTTP 409 khi bấm hủy), hiển thị số bưu gửi vướng và bảng `dot_vuong_chi_tiet` (Đợt, Giờ nhập, Người nhập, Đã nhập), nút «Đóng».
  - Trạng thái C (Đã hủy trước đó): khi đợt đã được hủy (từ preview hoặc nhận HTTP 409), hiển thị thông tin người và giờ đã hủy, nút «Làm mới danh sách».
  - Trạng thái D (Thành công): HTTP 200 đóng hộp thoại, hiển thị banner xanh trên trang lịch sử với số lượng khôi phục, số lượng xóa trạng thái, bảng tỷ lệ Trước/Sau/Chênh theo ngày đang chọn, chip ngày tự xuống dòng, giới hạn 31 ngày, dòng thông báo ngày chạm. Làm mới danh sách đợt nhập giữ nguyên bộ lọc và trang hiện tại.
  - Xử lý lỗi 403, 404, 500: hiện nguyên câu máy chủ trả, có nút Đóng.
- **Màn 13: Cập nhật khối Các lần nhập gần đây** (`src/components/phat/ProcessingDeliveryView.jsx` - Bảng 18 Ô E):
  - Tiêu đề dòng «Số liệu tính đến {HH:mm dd/mm/yyyy}», nhãn vàng `{n} cảnh báo` khi n > 0 (bỏ qua khi 0 hoặc null), chip xám «Đã hủy» khi đã hủy.
  - Dòng phụ: `{người} · nhập N · lỗi K` (đã bỏ phần «bỏ qua»). Không có nút hủy ở màn 13.
  - Link «Xem toàn bộ lịch sử →» điều hướng sang màn Lịch sử nhập.
- **Tuân thủ UI**: Không sử dụng chữ «hoàn tác» trong chuỗi giao diện hiển thị; không dùng localStorage.

---

## [2026-10-14] - PHAT-2b-1: backend hoàn tác / lịch sử có lọc — xem trước hoàn tác, số cảnh báo của đợt, lọc, `nguoi_nhap_lua_chon`

Quyết định: `04_DECISIONS.md` #78. Không đụng `src/`, `data/`, `.env`.
- `server/lib/phat.js`:
  - `phat_batches.so_canh_bao INTEGER` (NULL được; trong `CREATE TABLE` và `themCot` idempotent). `nhapDot` đếm dòng được nhập có `canh_bao` trước khi `mark` xoá nó (`da-chon` chỉ đếm dòng được chọn), ghi vào đợt, trả `so_canh_bao` trong phản hồi commit. Đợt cũ giữ NULL.
  - Tách `phanTichHoanTac` (dòng lịch sử, số xoá / khôi phục, đợt «vướng» + chi tiết) dùng chung cho `hoanTacDot` và `xemTruocHoanTac` (mới, chỉ đọc, trong một giao dịch đọc). `hoanTacDot` giữ nguyên hành vi; 409 «bị chặn» thêm `dot_vuong_chi_tiet`, 409 «đã hoàn tác» thêm `hoan_tac_luc_bangkok`, `hoan_tac_boi` (`loiDaHoanTac`, `nguoiTheoId`).
  - `docLocDot` (đọc `tu_ngay`, `den_ngay`, `nguoi_nhap`, `trang_thai`; sai/lặp → 400) và `dsDot` nhận `loc`: ngày đổi sang khoảng UTC `[tu, den)` theo Bangkok (UTC+7); phần tử thêm `so_canh_bao` (sau `so_khong_doi`). Giữ từ phiên trước: `dsDot` trả `nguoi_nhap_lua_chon` (`[{id, hrm_code, full_name}]`, theo BCVH đang chọn / được xem, không theo `page`/`size`/bộ lọc, sắp theo tên `localeCompare('vi')`, người không còn trong `users` xếp cuối).
- `server/routes/phat.js`: `GET /api/phat/batches/:id/undo-preview` (quyền và thứ tự như `/undo` qua `layDotHoanTac` dùng chung); `/batches` nhận 4 tham số lọc; chữ 403 theo hành động (`CHU_403`, thêm `'hoan-tac'`): `/undo` và `/undo-preview` nói «hoàn tác».
- `tests/phat.test.js`: sửa 3 ca bị chạm (khoá cột `phat_batches` trong ca lược đồ, khoá phần tử `/batches`, ca migration thêm kiểm `so_canh_bao` NULL); +5 ca cuối file: `nguoi_nhap_lua_chon`, số cảnh báo (hop-le / da-chon / không cảnh báo / đợt cũ NULL), `undo-preview` (khớp `/undo` thật, không ghi gì — chụp toàn bộ bảng `phat_*`, đợt bị chặn, đợt đã hoàn tác, 409 trường cũ + mới), quyền và chữ 403 của cả hai điểm cuối, lọc (biên ngày Bangkok kể cả đợt 23:30 UTC, `nguoi_nhap`, `trang_thai`, kết hợp, 400).
- `docs/ai/08_PHAT.md`, `04_DECISIONS.md` (#78), `00_SNAPSHOT.md` cập nhật.
- Kết quả: `npm test` 320/320 đạt (23 file); `npm run build` xong.

## [2026-10-14] - Giao diện «Xử lý và tỷ lệ phát» (PHAT-2: Đợt B - Màn 14, 15, 16)

- **Màn 14: Bước 1. Tải file mẫu để biên soạn** (`src/components/phat/PhatTemplateView.jsx`):
  - Form chọn BCVH, ngày đến (từ – đến), phạm vi («Chỉ bưu gửi chưa có trạng thái» / «Tất cả bưu gửi kèm trạng thái hiện có»).
  - Tải file mẫu Excel qua `GET /api/phat/template?bcvh=&from=&to=&scope=` (Content-Type `.xlsx`).
  - Khung hướng dẫn cấu trúc file, 5 nhãn trạng thái và mẹo biên soạn nhanh.
- **Màn 15: Bước 2. Kiểm tra dữ liệu trước khi nhập** (`src/components/phat/PhatDraftView.jsx`):
  - Tải file mới (`POST /api/phat/drafts`) hoặc chọn từ danh sách bản kiểm tra chưa hết hạn của người dùng (`GET /api/phat/drafts?bcvh=`). Lưu id ở `?ban-kiem-tra=<id>` (không dùng localStorage).
  - Xóa bản kiểm tra (`DELETE /api/phat/drafts/:id`) có hộp xác nhận, chặn bấm đúp, làm mới danh sách.
  - Xử lý lỗi 404 khi mở bản kiểm tra của người khác hoặc đã hết hạn, hiện thông báo rõ và đưa về danh sách.
  - 4 Thẻ chỉ số tổng hợp (Hợp lệ, Bỏ qua, Lỗi, Lỗi theo loại), 5 tab lọc, dropdown lọc loại lỗi.
  - Lưới dữ liệu dòng: sửa trạng thái inline (`PATCH /rows`), xóa dòng đã chọn (`DELETE /rows`), điền trạng thái hàng loạt (`POST /fill`), tải file lỗi (`errors.xlsx?loai_tru=KHONG_DOI`). Cột «Trạng thái hiện có» chỉ hiện nhãn; cột «Kết quả kiểm tra» hiện nguyên văn `chi_tiet_loi`/`ly_do` từ máy chủ.
  - Khối «Gán nhanh bằng danh sách SHBG» (`POST /assign-list`).
  - Thanh đáy xác nhận nhập dòng hợp lệ/dòng đã chọn (`POST /commit`) có hộp thoại xác nhận số dòng dự kiến, chặn bấm đúp, khoá nút khi đang gọi API.
- **Màn 16: Bước 3. Kết quả nhập** (`src/components/phat/PhatCommitResultView.jsx`):
  - Banner xanh xác nhận số dòng và giờ nhập (`so_nhap`, `nhap_luc_bangkok`).
  - Bảng tỷ lệ phát Trước / Sau / Chênh cho 5 trạng thái (chênh lệch % 1 chữ số thập phân có dấu +/-).
  - Khối chưa nhập (dòng lỗi, dòng trống), nút tải file lỗi, nút quay lại bảng kiểm tra, nút nhập file khác, nút xem tỷ lệ phát.
- **Điều phối** (`src/components/phat/ProcessingDeliveryView.jsx`):
  - Mở khóa 2 nút «Tải file mẫu» và «Nhập trạng thái phát» trên Màn 13 để chuyển vào quy trình nhập.
  - Thanh Stepper 3 bước đồng bộ trạng thái, hỗ trợ quay lại Màn 13 qua breadcrumb.
- **Kiểm thử**: `npm test` 315 ca (314 pass, 1 skip CLI); `npm run build` thành công.

---

## [2026-10-14] - Giao diện «Xử lý và tỷ lệ phát» (PHAT-2: Đợt A - Menu + Màn 13)

- **Màn 13** (`src/components/phat/ProcessingDeliveryView.jsx`):
  - Bộ chọn BCVH và Ngày đến: đồng bộ tự động với ngày dữ liệu từ API `GET /api/phat/ty-le`.
  - Dòng thông tin mẫu số: hiển thị số bưu gửi đến, trạng thái lấy từ lần nhập mới nhất và giờ Bangkok mốc tính.
  - 5 Thẻ chỉ số trạng thái (PTC, PKTC, Chuyển hoàn, Lạc hướng, Chưa có thông tin phát) với tỷ lệ % 1 chữ số thập phân (dấu phẩy), mức cập nhật kết quả phát, số lượng bưu gửi.
  - Bảng «Theo khung giờ đến BCVH»: 6 khung giờ đến (Trước 10h, 10–12h, 12–14h, 14–16h, 16–18h, Sau 18h) cùng dòng tổng «Cả ngày» chân bảng.
  - Khối «Các lần nhập gần đây»: kết nối `GET /api/phat/batches`, hiển thị `nhap_boi.full_name` và số lượng nhập/bỏ qua/lỗi; hiển thị hướng dẫn chọn BCVH khi xem Toàn Trung tâm nếu chưa có danh sách đợt.
  - Hai nút «Tải file mẫu» và «Nhập trạng thái phát»: disabled kèm nhãn «Sắp có» (chuẩn bị cho Đợt B).
- **Menu & Điều hướng** (`Sidebar.jsx`, `Header.jsx`, `App.jsx`):
  - Kích hoạt mục menu «Xử lý và tỷ lệ phát» (bỏ `disabled: true`), hiển thị cho ADMIN, TTVH, GDVH.
  - Tích hợp tiêu đề vào Header và điều hướng nội dung chính trong App.
- **Kiểm thử**: npm test: 305 ca, 304 pass, 1 skip; npm run build thành công.
- Nghiệm thu có điều kiện Đợt A: (1) Khối các lần nhập gần đây hiện nguyên văn thông báo lỗi tiếng Việt của máy chủ kèm nút «Thử lại»; (2) Khi chưa có đợt nhập thay «số liệu tính đến —» bằng «Chưa có số liệu phát»; (3) Đặt 2 hằng số ngưỡng màu NGUONG_PTC_DAT (82%) và NGUONG_CHUA_CO_TT_CANH_BAO (10%), tô xám trung tính bảng khung giờ khi chưa có số liệu; (4) Sửa dòng kiểm thử changelog.

---

## [2026-10-14] - Danh sách bản kiểm tra của tôi + rà quyền sở hữu bản kiểm tra (PHAT-1b)

- Việc 0 (khảo sát): trước đó `layDraft` chỉ kiểm quyền BCVH, không kiểm người tạo — mọi GDVH cùng BCVH, ADMIN, TTVH đọc / sửa / tải file lỗi / commit được bản của người khác. Bảng đầy đủ ở báo cáo của ticket.
- `server/routes/phat.js`: `layDraft(req, { chiXem })` kiểm người tạo trước quyền BCVH — người khác 404 (cùng câu «không tồn tại»); ADMIN/TTVH chỉ `GET /drafts/:id` và `/rows`, còn lại 403; người tạo bị bỏ gán BCVH 403. Điểm cuối mới `GET /api/phat/drafts?bcvh=[&tat_ca=1]`.
- `server/lib/phat.js`: `dsBanKiemTra` (bản chưa hết hạn, mới nhất trước, tổng hợp theo dòng bằng một truy vấn, không trả nội dung dòng).
- Test (`tests/phat.test.js`): +7 ca (danh sách của mình, `tat_ca`, quyền / tham số, hết hạn, người khác 404, ADMIN/TTVH xem không sửa / commit, GDVH bị bỏ gán); sửa 1 ca cũ (người khác từng 403 → 404). `npm test`: 23 file, 312 ca, 0 fail. `npm run build` OK.
- Docs: `08_PHAT.md` (điểm cuối + quy tắc sở hữu), `04_DECISIONS.md` #77 (kèm 5 điểm tự quyết chờ PO), `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`.
- PO duyệt tự quyết a, b, c, e, f, g; làm thêm (d) `DELETE /api/phat/drafts/:id` (`routes/phat.js`, `lib/phat.js` `xoaBanKiemTra`): người tạo hoặc ADMIN/TTVH xoá cả bản + dòng; đã kiểm không khoá ngoại, hoàn tác và lịch sử không phụ thuộc bản (không cần 409). Nhật ký `phat_draft_delete`. +3 ca test. `08_PHAT.md`, #77 cập nhật.
- Chưa làm: giao diện (PHAT-2).

---

## [2026-10-14] - DASH-6b sửa nhỏ 1: chú thích khối «Phường/xã tăng mạnh» (`DailyOpsDashboard.jsx`) bỏ chữ «trung bình 4 tuần cùng thứ» → «cùng thứ tuần trước (cùng giờ)», thêm ý chip chỉ hiện số BG khi hôm qua quá ít; sửa chú thích mã `wardChangeChip` (sàn phường/xã 10). Không đổi logic.

---

## [2026-10-14] - DASH-6b chặng 2: số chênh có sàn 50 + nối giao diện khoá mới (DASH-6b)

- Backend (PO chỉnh sau duyệt chặng 1): `chenh_pct` / `chenh_diem` = `null` khi mốc (hôm qua hoặc tuần trước) dưới 50 bưu gửi, vẫn giữ giá trị mốc — `server/lib/dashboardDenQuery.js` (`pctVsMoc`): sản lượng (tổng và từng BCVH), `hang_di_ngoai`, `phuong-xa-tang` (`tang_so_hom_qua_pct`, `lech_so_tuan_truoc_pct`). Quyết định #76. Test: sửa `dashboard-den.test.js` (mốc nhỏ → null), thêm 1 ca mốc 49 → null / 50 → có số ở `dashboard-den-danh-gia.test.js`. `npm test` 304 ca pass.
- PO chỉnh sau duyệt chặng 2: phường/xã dùng sàn riêng `SAN_SO_SANH_PHUONG_XA` = 10 (`tang_so_hom_qua_pct`, `lech_so_tuan_truoc_pct`); `SAN_SO_SANH_TOI_THIEU` = 50 chỉ còn cho sản lượng và hàng đi ngoài. Test: mốc 9 → null, mốc 10 → có số (`dashboard-den-danh-gia.test.js`, `dashboard-den.test.js`). `npm test` 305 ca.
- Giao diện (chỉ đổi khoá và chữ): `DailyOpsDashboard.jsx` (thẻ «Hàng đi ngoài», «so tuần trước», cột «SO TUẦN TRƯỚC», dòng phường/xã, chip phường/xã khi mốc dưới sàn, hàm `formatSoSanh`, `lyDoChuaDanhGia`), `TiviView.jsx` (thẻ «Hàng đi ngoài», chữ so hôm qua), `ArrivalsOverview.jsx`, `ArrivalsRoutesServices.jsx` («Hàng đi ngoài», biểu đồ «Còn lại / Hàng đi ngoài»). Không đổi bố cục, màu, font, kích thước.

---

## [2026-10-14] - «Hàng đi ngoài» thay «hàng nặng», bỏ «TB 4 tuần», đổi mốc đánh giá: backend + test + tài liệu (DASH-6b, chặng 1)

- `server/lib/arrivalsQuery.js`: `DI_NGOAI_SQL` (SHBG có ≥ 1 dòng BD8 chuẩn hoá = SHBG; BD8 rỗng không tính) thay `heavy_g`/`HEAVY_THRESHOLD_G_*`/`parseHeavyG`; `/summary`, `/by-route`, `/by-service` trả `hang_di_ngoai`, `ty_le_hang_di_ngoai` (bỏ `hang_nang`, `ty_le_hang_nang`, `nguong_hang_nang_g`); `heavy_g` gửi lên → 400. `server/lib/phat.js`, `server/routes/arrivals.js`: bỏ `heavyG`/`heavy_g`.
- `server/lib/dashboardDenQuery.js`, `server/config/dashboard-thresholds.js`: bỏ `HANG_NANG_G`, `SO_TUAN_SO_SANH`, TB 4 tuần, `so_tuan`, `it_du_lieu`; hai mốc cùng giờ dữ liệu (hôm qua, cùng thứ tuần trước); `danhGiaSanLuong` (sàn `SAN_SO_SANH_TOI_THIEU = 50`, `GIO_BAT_DAU_DANH_GIA = 12`, `chua_du_du_lieu` + lý do `thieu_tuan_truoc|moc_duoi_san|chua_toi_gio`); `hang_di_ngoai` chỉ hiển thị; đổi khoá API theo bảng ánh xạ (`04_DECISIONS.md` #76). Việc 0: mốc «cùng giờ» đã theo giờ dữ liệu, không sửa mã.
- Xoá API 3e (`/dashboard/overview|trend|wards-surge|center`; `server/lib/dashboardQuery.js` chỉ còn `DASHBOARD_BCVH`, `bcvhNames`) và `tests/dashboard-api.test.js`; ca `/quality-mocs` chuyển sang `tests/quality-mocs.test.js`. `scripts/survey-bd10.js` + test: đổi chữ «hàng nặng» → «hàng đi ngoài» (không đổi logic).
- Test: `npm test` 23 file, 303 ca, 0 fail (trước 318: −21 ca 3e, sửa ~30 khối ở `arrivals-api`, `dashboard-den`, `bd10-api`, `bd10-trang-thai`, `arrivals-source`, `arrivals-reload`, `roles`, `tivi`, `arrivals-export`, thêm `tests/dashboard-den-danh-gia.test.js` 6 ca (vào script `test`), ca đi ngoài / đánh giá thuần ở `dashboard-den` và `arrivals-api`). Đối chiếu bản sao DB dev (533140, 01–10/10): tỷ lệ đi ngoài theo ngày khớp khảo sát DASH-6a từng ngày; bản sao đã xoá.
- Docs: quyết định #76 (đánh dấu #37, #38, #42, #45, #48, #73), `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`, `05_BACKLOG.md`. **Giao diện chưa đổi (chặng 2)**: `src/` còn đọc khoá cũ nên màn «Sản lượng đến» và Dashboard/tivi lỗi/trống cho tới khi làm chặng 2 — không triển khai riêng chặng 1.

---

## [2026-10-13] - Module «Xử lý và tỷ lệ phát»: backend (PHAT-1, chặng 1–2)

- **Chặng 1** (đã commit 9303605): `server/config/phat.js` (hằng số: 5 trạng thái, 6 khung giờ, 4 nhóm chờ, giới hạn, SHBG, bảng chuyển bất thường, mã lỗi), `server/lib/phat.js` (lược đồ `phat_*`, chuẩn hoá, kiểm tra từng dòng, biên tập, nhập đợt), `server/lib/phatFile.js` (đọc xlsx/csv, dựng file mẫu và file lỗi), `server/routes/phat.js`; `server/db.js` tạo bảng + dọn bản kiểm tra hết hạn; `dashboardDenQuery.js` chỉ thêm export `bcvhContext`, `windowFilter`, `runCounted`. API: `GET /phat/template`, `POST /phat/drafts`, `GET /phat/drafts/:id[/rows]`, `PATCH|DELETE /phat/drafts/:id/rows`, `POST …/fill`, `POST …/assign-list`, `GET …/errors.xlsx`, `POST …/commit`.
- **Chặng 2**: `POST /phat/batches/:id/undo` (hoàn tác đợt; 409 khi đợt sau đã đổi SHBG), `GET /phat/batches` (danh sách đợt, theo BCVH được phép), `GET /phat/ty-le` (mẫu số, 5 nhóm, mức cập nhật, 6 khung giờ đến, tồn chờ, `so_lieu_den_luc`); ba chỉnh của PO (#75): `errors.xlsx?loai_tru=`, tách «lỗi cần sửa» / «không đổi» (cột `phat_batches.so_khong_doi`), cảnh báo «Ghi chú bị cắt» (cột `phat_draft_rows.ghi_chu_bi_cat`), giờ theo `Asia/Bangkok`. DB tạo ở chặng 1 được thêm cột tự động.
- `tests/phat.test.js` (mới, 28 ca; thêm vào script `test` của `package.json`): hằng số / khung giờ / schema + migration, file mẫu (1 dòng/SHBG, khóa cột, danh sách chọn, `_meta`), kiểm tra từng mã lỗi, biên tập, nhập từng phần, nhập lần sau + lịch sử, kiểm lại lúc commit, file lỗi nhập lại, hoàn tác (409, thứ tự, khôi phục ghi chú/đợt/giờ, quyền), danh sách đợt, tỷ lệ (khớp `tong-quan-den`, ranh giới 2 giờ / 4 giờ), quyền, hết hạn, nhật ký. `npm test` 318 ca: 318 pass, 0 skip (worktree không có `data/hue-dhcl.db`); `npm run build` ok.
- Bản sao DB dev (533140, 02–03/10; chỉ đếm): file mẫu 7.014 dòng, cả 7.014 SHBG đúng định dạng; mẫu số 4.013 và 3.001 khớp `tong-quan-den`; dựng file ~0,3 s, kiểm tra 7.014 dòng ~0,12 s, nhập ~0,24 s.
- Docs: `08_PHAT.md` (mới), quyết định #75, `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`, `06_DEPLOYMENT.md` (biến `PHAT_MAX_DONG`).

---

## [2026-10-12] - Vai trò `TIVI`: chỉ xem dashboard «đến», token dài hạn, có phạm vi (DASH-3)## [2026-10-12] - Vai trò `TIVI`: chỉ xem dashboard «đến», token dài hạn, có phạm vi (DASH-3)

- `server/roles.js`: thêm `TIVI` (không thuộc `VIEWER_ROLES`). `server/lib/tivi.js` (mới): allowlist `TIVI_ALLOWED` + `tiviAllows()`, bảng `user_tivi_scope` (`ensureTiviSchema`, gọi từ `server/db.js`), `getTiviScope` / `setTiviScope` / `isValidTiviScope`.
- `server/auth.js`: token TIVI hạn `JWT_EXPIRY_TIVI` (mặc định 90 ngày; vai trò khác không đổi), claim `tivi` + dấu mật khẩu (HMAC); `authRequired` từ chối token TIVI khi tài khoản đổi vai trò / mật khẩu (401) và chặn mọi request ngoài allowlist của TIVI (403).
- `server/routes/arrivals.js`: TIVI qua lớp `/arrivals` chỉ ở 3 endpoint dashboard; `bcvh` bị ép theo phạm vi, chưa có phạm vi → 403. `server/routes/auth.js`: `GET /api/auth/me`, `user.tivi_scope` khi đăng nhập. `server/routes/users.js`: `tivi_scope` khi tạo / sửa (chỉ ADMIN, kiểm giá trị, xoá khi rời TIVI), `GET /api/users` trả `tivi_scope`.
- `tests/tivi.test.js` (mới, 10 ca; thêm vào script `test` của `package.json`). `npm test` 290 ca: 290 pass trong worktree riêng (không có `data/hue-dhcl.db` nên ca CLI seed chạy, không skip).
- Docs: quyết định #74, bản đồ kiến trúc (cột TIVI trong ma trận quyền, bảng `user_tivi_scope`, `/auth/me`), `00_SNAPSHOT.md`, `06_DEPLOYMENT.md` (biến `JWT_EXPIRY_TIVI`).

---

## [2026-10-11] - API Dashboard «Cần điều hành ngay hôm nay» — phần đến (DASH-1)

- `server/lib/dashboardDenQuery.js` (mới) + `server/routes/arrivals.js`: `GET /api/arrivals/dashboard/tong-quan-den`, `/viec-can-lam`, `/phuong-xa-tang` (tham số `bcvh`, `date`, `gioi_han`; ADMIN / TTVH / GDVH, STAFF 403; `bcvh_goi_y` cho GDVH). Dùng lại `buildCountedCte`, `notReceivedStats`, `bd10.stats`, `latestFileDate`; không đổi API / cách tính có sẵn. Tên `/dashboard/overview` đã có (3e) nên đặt `tong-quan-den`.
- `server/config/dashboard-thresholds.js` (mới): hằng số mức điều hành TẠM (`HANG_NANG_G` 2000, `GIO_MUON` 15, chưa nhận >= 1 ngày, BD10 10% / 5%, lệch sản lượng 25% / 15%).
- `tests/dashboard-den.test.js` (mới, 8 ca; thêm vào script `test` của `package.json`): ranh giới 1.999 / 2.000 / 2.001 g và khối lượng 0, 14:59:59 / 15:00:00, lượt vs bưu gửi (nhiều dòng một bưu gửi), so hôm qua / TB cùng giờ và thiếu ngày → null, BD10 lập đi / rỗng bị loại khỏi chưa nhận, ngưỡng 5% / 10% / 15% / 25%, việc cần làm, phường/xã (hôm qua = 0), quyền (GDVH chưa giao = ADMIN, STAFF 403). `npm test` 280 ca: 279 pass, 1 skip có chủ đích.
- Bản chép DB dev (533140, 08/10): bưu gửi 3.914 / lượt 4.034; BD10 chưa XNĐ 2/23 (8,7%); chưa nhận 5 bưu gửi chờ 2 ngày — khớp API có sẵn; mỗi lần gọi ~40–100 ms. Docs: quyết định #73, bản đồ kiến trúc, `00_SNAPSHOT.md`.

---

## [2026-10-11] - GDVH xem được «chưa nhận» và «BD10 đến» của BCVH đang chọn — phương án A (SANLUONG-4a11)

- `server/routes/arrivals.js`: bỏ hàm `scopeCodes`; `/summary` (`chua_nhan_tai_bcvh`, `bd10_den_khong_xnd`), `/not-received`, `/bd10-khong-xnd`, `/dashboard/center`, `/bd10-trang-thai/theo-ngay`, `/theo-buu-cuc-lap` không còn giới hạn GDVH theo BCVH được giao — mọi vai trò xem theo bộ lọc `receiver_code` / `unit`. Tải / xuất (`/export-scope`, `/export`, `/not-received/export`, `/bd10-khong-xnd/export`) KHÔNG đổi. Chú thích: `arrivalsQuery.js` (`scopedFilters`, `summary`), `bd10Query.js` (đầu file), `dashboardQuery.js` (`center`). Khoá JSON không đổi.
- Test: viết lại các ca "GDVH chỉ BCVH được giao / chưa giao = 0" thành "GDVH xem như ADMIN" (`tests/arrivals-source.test.js` 2 ca, `tests/bd10-api.test.js` 3 ca, `tests/bd10-trang-thai.test.js` 3 ca); thêm 1 ca #72 (`tests/bd10-api.test.js`): GDVH chưa được giao xem 6 API xem bằng ADMIN cho cùng BCVH, `export-scope` rỗng, 3 API xuất 403; GDVH đã giao tải được BCVH của mình, BCVH khác 403. `npm test` 272 ca: 271 pass, 1 skip có chủ đích.
- Docs: quyết định #72 (sửa #52, #60, #67; ghi chú #69, #70), đóng backlog 7f5, bổ sung 7b (màn hình phân BCVH + gợi ý vai trò GDVH ở `AddUserModal.jsx`), `03_ARCHITECTURE_MAP.md`, `00_SNAPSHOT.md`.

---

## [2026-10-11] - API «Trạng thái BD10 đến»: thêm số bưu gửi (SANLUONG-4a9c)

- `server/lib/bd10Query.js`: `bgCounts()` — số SHBG khác nhau theo ô (cùng tập BD10 / trạng thái / ngày quy tắc X với số BD10, dùng chung `perBd10Sql`); `/bd10-trang-thai/theo-ngay` và `/theo-buu-cuc-lap` thêm `bg_tong`, `bg_da_xnd`, `bg_chua_xnd`, `ty_le_chua_xnd_bg` ở từng ô và `tong` (cả khung đếm khác nhau, không cộng ô). Khoá cũ, thứ tự sắp, `ngoai_khung` không đổi. Truy vấn: `CROSS JOIN` để quét bảng một lần (~1,4 s → ~0,2 s) và đếm bằng `Set` trong JS (→ ~0,1 s) trên bản chép DB dev.
- `tests/bd10-trang-thai.test.js`: +3 ca (#71: ngày trống = 0, SHBG lặp trong một BD10, SHBG ở hai BD10 cùng / khác trạng thái, `bg_tong` cả khung ≤ tổng các ngày, tỉ lệ null, lập đi / rỗng bị loại, phạm vi GDVH, khoá cũ giữ giá trị); các ca cũ so khoá BD10 qua `old()` (giá trị không đổi). `npm test` 271 ca: 270 pass, 1 skip có chủ đích.
- Bản chép DB dev (533140, 01→09/10): bưu gửi 28.049 (đã XNĐ 21.957, chưa XNĐ 6.113, 21,79%); 42 SHBG ở hơn một ô. Docs: quyết định #71, bản đồ kiến trúc, `00_SNAPSHOT.md`.

---

## [2026-10-11] - Giao diện tab «Trạng thái BD10 đến» (SANLUONG-4b)

- `src/components/arrivals/ArrivalsBd10Status.jsx` (mới): Tab «Trạng thái BD10 đến» theo thiết kế canvas bảng số 6:
  - Điều kiện hiển thị: Bắt buộc chọn đúng 1 BCVH, khung ngày ≤ 92 ngày, xử lý thông báo khi không có dữ liệu / `ngay_du_lieu_moi_nhat = null`.
  - Hàng chip: Hiển thị ngày đang xem (ngày dữ liệu mới nhất mặc định / ngày cụ thể) hoặc chữ cả khung; nút bấm xem cả khung; dòng hướng dẫn.
  - Bốn thẻ KPI: Tổng BD10 đến, Đã XNĐ BD10, Chưa XNĐ BD10 (nền `#fff1f2`, viền `#fb7185`), Tỉ lệ chưa XNĐ (kèm so sánh ngày trước đó trong khung).
  - Dòng nhắc vàng: Cảnh báo ngày mới nhất BD10 có thể chưa kịp XNĐ.
  - Khối biểu đồ cột chồng theo ngày: Chiều cao theo tổng BD10, phần dưới đã XNĐ `#86efac`, phần trên chưa XNĐ `#e11d48` kèm số đỏ trên cột; bấm cột để chọn/bỏ chọn ngày; hỗ trợ bàn phím và `aria-label`.
  - Khối theo bưu cục lập BD10: Bảng 5 cột, số chưa XNĐ dạng viên hồng đậm, dòng Cộng cuối bảng; nút «Xem danh sách BD10 chưa XNĐ →» điều hướng sang màn chi tiết `ArrivalsBd10NotConfirmedDetail`.
  - Dòng ghi chú ngoài khung ở cuối trang.
- `src/components/arrivals/ArrivalsView.jsx`: Thêm tab thứ hai `bd10_status` («Trạng thái BD10 đến») ngay sau `overview` («Tổng quan»).
- `src/components/arrivals/ArrivalsNotReceived.jsx`: Sửa React key cho lưới «Theo ngày lập BD10» thành `${g.ngay}-${g.tuoi}` tránh trùng lặp khi chọn nhiều BCVH lệch ngày dữ liệu.
- `npm run build` thành công, không dùng từ cấm («tuổi»), không chứa số hiệu thật.

---

## [2026-10-11] - "Chưa nhận" loại BD10 lập đi / rỗng; API trạng thái BD10 đến theo ngày / theo bưu cục lập; đổi tên cột Excel (SANLUONG-4a9)

- `server/lib/arrivalsQuery.js`: #68 (đổi #60) — "chưa nhận tại BCVH" chỉ giữ bưu gửi mà BD10 của dòng đại diện (id nhỏ nhất) là BD10 đến hoặc loại khác; loại BD10 rỗng và BD10 lập đi. Một chỗ: `notReceivedSql()` + `NOT_RECEIVED_BD10_SQL`, dùng chung cho `notReceivedStats` (`/summary`, `/dashboard/center`), `notReceivedList` (`/not-received`, `/not-received/export`) và `CHUA_NHAN_TAI_BCVH` của `/exceptions`. Khoá API không đổi.
- `server/lib/bd10Query.js` + `server/routes/arrivals.js`: #69 — `GET /api/arrivals/bd10-trang-thai/theo-ngay` và `/theo-buu-cuc-lap` (from, to chỉ ngày, ≤ 92 ngày; receiver_code | unit; công khai, phạm vi `scopeCodes`); tên bưu cục lập từ `post_offices`; `ngay_du_lieu_moi_nhat` = `latestFileDate()` (cả DB). Tách `applyUnitAlias` dùng chung với `splitQuery`. Khoá cũ của `bd10_den_khong_xnd` không đổi.
- `server/lib/arrivalsExport.js`: tiêu đề cột `Tuoi_ngay` → `Da_cho_ngay` ở file xuất "chưa nhận" và "BD10 đến không XNĐ" (trường API `tuoi_ngay` / `tuoi` giữ nguyên; `/export` 9 cột không đổi). Không có mã / script / docs nào đọc cột theo tên; sửa 2 assert tiêu đề trong `tests/arrivals-source.test.js`, `tests/bd10-api.test.js`.
- `tests/bd10-trang-thai.test.js` (mới, 7 ca): #68 (lập đi / rỗng bị loại, theo dòng đại diện; BD10 đến và loại khác vẫn tính; cùng số ở summary / not-received / exceptions / center / xuất Excel; khung hẹp / rộng theo ngày file); #69 (mọi ngày trong khung, ngày trống = 0, quy tắc X, tổng ngày = tổng khung, ngoài khung, `ty_le_chua_xnd` null khi tong = 0, > 92 ngày → 400, sắp theo bưu cục lập, tên null khi ngoài danh mục, phạm vi GDVH / ADMIN / TTVH, STAFF 403). Thêm tệp này vào script `test` của `package.json`. `npm test` 264 ca: 263 pass, 1 skip có chủ đích.
- Bản chép DB dev (BCVH 533140, 01→09/10): chưa nhận 330 → 320 (`0-1` 249, `2` 5, `3+` 66 — khớp 4a8; 46 bưu gửi có dòng thuộc nhiều loại BD10); trạng thái BD10 đến 163 / chưa XNĐ 22 (13,5%), 530100 19/104, bưu cục khác 3/59, ngoài khung 18/5/2 — khớp 4a5/4a6.
- Docs: quyết định #68, #69 (ghi chú đổi ở #60), bản đồ kiến trúc, `00_SNAPSHOT.md`.
- 4a9b (#70, PO quyết 11/10): ngày dữ liệu mới nhất (`/bd10-trang-thai/theo-ngay`) và mốc "đã chờ" tính theo ngày file OK mới nhất CỦA BCVH NHẬN (`latestFileDates` / `latestFileDate(db, codes)` / `ageAt` trong `arrivalsQuery.js`; áp ở chưa nhận, `/not-received`, `/exceptions`, `/dashboard/center`, BD10 đến không XNĐ + lọc `tuoi`, hai file xuất); `theo_ngay_lap` tách theo (ngày, tuổi) khi nhiều BCVH lệch ngày. +4 ca test (`tests/bd10-trang-thai.test.js`, 11 ca); `npm test` 268 ca: 267 pass, 1 skip. Bản chép DB (533140, file mới nhất 10/10): mọi số giữ nguyên. Backlog 7j5, 7j6.

---

## [2026-10-10] - Giao diện: chỉ số "BD10 đến không XNĐ" (SANLUONG-4a7)

- `src/components/arrivals/ArrivalsBd10NotConfirmed.jsx` (mới): Thêm `ArrivalsBd10NotConfirmedBanner` và `ArrivalsBd10NotConfirmedDetail` để hiển thị BD10 đến chưa có xác nhận đến (S2, S3), có bộ lọc nhóm (`530100` / `khac`), nút xuất Excel (chỉ khi chọn 1 BCVH và tối đa 92 ngày).
- `src/components/arrivals/ArrivalsView.jsx`: Tích hợp Banner và Detail của BD10 đến không XNĐ (hoạt động giống khối chưa nhận tại BCVH).
- `src/components/arrivals/ArrivalsQuality.jsx`: Gỡ bỏ khối "Đủ trạng thái theo nguồn" (do quy tắc R2 thay đổi, không còn dùng).
- Hoàn tất các phần của SANLUONG-3h bị dở dang (đã xóa `date_basis` trên frontend và tích hợp `ArrivalsNotReceived`).
- Xác nhận: Khi giao diện không gửi `date_basis`, backend mặc định lấy tiêu chí `arrival` (R2: đến BCVH).
- Đã chạy `npm run build` thành công.

---

## [2026-10-10] - API chỉ số "BD10 đến không XNĐ" + danh sách + xuất Excel (SANLUONG-4a6)

- `server/lib/bd10Query.js` (mới): chỉ số ở mức BD10 tính lúc truy vấn (nhóm theo `bd10_no`, một lần quét): BD10 đến = ký tự 7–12 = mã BCVH nhận, 6 ký tự đầu ≠ mã BCVH; S1–S4; N = S2+S3; D = S1+S2+S3 có ngày trong khung; ngày quy tắc X; tuổi dùng `latestFileDate`/`dayAge`/`ageBucket` của `chua_nhan_tai_bcvh`; phạm vi theo vai trò qua `scopedFilters`. Không thêm bảng / cột / chỉ mục.
- `server/routes/arrivals.js`: khoá `bd10_den_khong_xnd` trong `/summary` (CÔNG KHAI, không sau cờ ADMIN) và `/dashboard/center`; `GET /api/arrivals/bd10-khong-xnd` (from, to, receiver_code | unit, nhom, tuoi, page, page_size); `GET /api/arrivals/bd10-khong-xnd/export` (dùng chung `exportHandler`, thêm `prepare`); `server/lib/arrivalsExport.js`: `writeListExport` dùng chung cho danh sách "chưa nhận" và BD10. Mọi khoá cũ giữ nguyên (#61 đánh dấu SẼ ĐƯỢC THAY, chưa xoá).
- `tests/bd10-api.test.js` (mới, 9 ca): S1–S4, quy tắc ngày X, BD10 trải nhiều ngày, loại BD10 lập đi / rỗng / `NULL` / mã ngắn / mã nhận khác, nhóm 530100 và khác, khung (trước / trong / sau), `ty_le` null khi D = 0, ghi nhận XNĐ khác nhau, phân quyền (ADMIN / TTVH / GDVH đều nhận khoá; GDVH theo `user_bcvh`; STAFF 403), danh sách + lọc + phân trang + `unit`, xuất xlsx, chỉ số cũ không đổi. `npm test` 257 ca: 256 pass, 1 skip có chủ đích; `npm run build` ok.
- Bản chép DB dev (BCVH 533140, khung 01→09/10): D 163 / N 22 (13,5%); 530100 104/19 (18,3%); khác 59/3 (5,1%); ngoài khung 18 trước, 5 sau, 2 không mốc — khớp 4a5. Hiệu năng: ~1,8 s / 1 triệu dòng (chỉ mục phủ thử không nhanh hơn).
- Docs: quyết định #67, #61 đánh dấu sẽ được thay, bản đồ kiến trúc, backlog 7j–7j4, `00_SNAPSHOT.md`.


## [2026-10-10] - Khảo sát lại "BD10 đến không XNĐ" theo định nghĩa mới của PO (SANLUONG-4a5, chỉ đọc)

- `scripts/survey-bd10-den.js` (mới): mở DB `readonly`, từ chối cờ ghi; mã BD10 = [6 ký tự bưu cục lập][6 ký tự bưu cục nhận][phần còn lại]; BD10 đến = ký tự 7–12 = mã BCVH và 6 ký tự đầu ≠ mã BCVH; trạng thái S1 (có XNĐ) / S2 (không XNĐ, ≥1 dòng đủ túi + BG) / S3 (không XNĐ, có túi hoặc BG, không dòng nào đủ cả hai) / S4 (không XN nào); N = S2+S3, D = S1..S4; ngày theo quy tắc X (XNĐ trước) và Y (XN túi/BG trước). Chỉ in số đếm và mã bưu cục 6 số. `tests/survey-bd10-den.test.js` (3 ca, DB tạm, dữ liệu giả). Không đổi chỉ số / API nào. `npm test` 248 ca: 247 pass, 1 skip có chủ đích; `npm run build` ok.
- Kết quả chính trên bản chép DB dev (BCVH 533140; số tổng hợp): 188 BD10 đến (126 từ 530100, 62 từ bưu cục khác), 58 BD10 lập đi (tiền tố 533140), 1 nhóm BD10 rỗng (2.024 SHBG), không mã bất thường; XNĐ đồng nhất trong BD10 đến; N/D toàn dữ liệu = 22/188 (11,7%; 530100: 19/126 = 15,1%; khác: 3/62 = 4,8%), tử số hẹp S2 = 21/188; trong khung 01→09/10 quy tắc X 22/163 (13,5%), quy tắc Y 22/185 (11,9%); đối chiếu 4a4 (trừ tiền tố 533140): 183 BD10 trùng, mới thêm 5 (2 trước khung, 2 không có `arrival_at`, 1 sau khung). Quyết định chờ PO (backlog 7i).


## [2026-10-10] - Khảo sát dữ liệu thật ở mức BD10: "BD10 đến không XNĐ" (SANLUONG-4a4, chỉ đọc)

- `scripts/survey-bd10.js` (mới): mở DB `readonly`, từ chối cờ ghi (`--apply`, `--write`, `--vacuum`…); khung BD10 theo ngày của MIN(`arrival_at`) các dòng; chỉ in số đếm / tỉ lệ / bảng (chỉ lộ tiền tố BD10 6 số). Bảng: quy mô + tiền tố, mốc trong từng BD10 (XN túi + BG; XNĐ đồng nhất?), "BD10 đến không XNĐ" cách A / B / C, từng ngày, hàng nặng (BD8 = SHBG), bất thường theo tiền tố, tuổi, chất lượng dữ liệu liên quan. `tests/survey-bd10.test.js` (2 ca, DB tạm, dữ liệu giả; kiểm DB không đổi). Không đổi chỉ số nào của app. `npm test` 245 ca: 244 pass, 1 skip có chủ đích; `npm run build` ok.
- Kết quả chính trên bản chép DB dev (BCVH 533140, 32.880 dòng, khung 01→09/10; số tổng hợp): 235 BD10 trong khung (median 26 dòng/BD10, max 1.046); XNĐ trong một BD10 hoặc có ở MỌI dòng cùng một giá trị hoặc không có ở dòng nào (0 BD10 loại ii/iii); cách A: 68/218 BD10 đến không XNĐ (31,2%; 530100: 18/112 = 16,1%; khác: 50/106 = 47,2%); BD10 tiền tố 533140 (= mã BCVH nhận, 52 BD10, 1.766 SHBG) 100% không XNĐ — loại ra thì "khác 530100" còn 3/59 (5,1%), tổng 21/171 (12,3%). Chi tiết quyết định chờ PO (backlog 7i).


## [2026-10-10] - Chữ NULL là ô rỗng ở mọi cột của file CSV hàng đến (SANLUONG-3k)

- `server/lib/arrivalsImport.js`: `normalizeCell()` — chữ `NULL` (không phân biệt hoa/thường, bỏ khoảng trắng) = ô rỗng ở MỌI cột, áp ở bước đọc ô trước mọi kiểm tra/lưu; `scripts/split-arrivals-csv.js` dùng chung hàm (đọc ngày / mã BCVH), vẫn ghi file con giữ nguyên chuỗi gốc. Không đổi R2, chưa nhận, nhóm nguồn hay chỉ số nào.
- Khảo sát: không cột nào bị REJECTED vì rỗng (cột chữ lưu `''`, khối lượng rỗng → NULL); 4 dòng `Ma_BC_dong` + `Dich_vu_code` + `Ten_dich_vu` cùng `NULL` vẫn nạp; `SHBG` rỗng không bị từ chối (ghi vào #66, backlog 7h2).
- Tests: `arrivals-import` (+2 ca: `normalizeCell`, NULL ở mọi cột), `arrivals-reload` (+1 ca: tách + nạp, nhóm `khong_bd10`, đường thư / dịch vụ / tỉnh / phường rỗng). `npm test` 243 ca: 242 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #66 (đánh dấu #65 mục NULL cột khác đã được thay), backlog 7h1 đóng + 7h2, `00_SNAPSHOT.md`, `06_DEPLOYMENT.md` mục 9.


## [2026-10-10] - Importer và script tách nhận ngày giờ ISO và chữ NULL (SANLUONG-3j)

- `server/lib/arrivalsImport.js`: `parseDateTimeCell()` — MỘT hàm cho importer và `scripts/split-arrivals-csv.js` (trước đó cả hai đã dùng chung `parseUsDateTime`, nay gọi hàm mới): rỗng / `NULL` (không phân biệt hoa thường, bỏ khoảng trắng) = rỗng; `YYYY-MM-DD HH:mm:ss` / dạng `T`, phần giây lẻ 1–7 chữ số bị bỏ (không đổi múi giờ); dạng Mỹ cũ giữ nguyên; chuỗi khác → REJECTED nêu số dòng + tên cột (không in giá trị). Thông báo lỗi nêu cả hai định dạng hợp lệ.
- Script tách: giữ nguyên chuỗi gốc của từng ô; ngày 10/10 (sau khung 01–09/10) có file riêng. Không đổi R2, chưa nhận, ngưỡng hợp lý hay chỉ số nào.
- Tests: `arrivals-import` (+2 ca: bảng định dạng, nạp file ISO + NULL lẫn dạng cũ), `arrivals-reload` (+1 ca: tách CSV ISO có NULL qua ngày 10/10, nạp ra OK, chỉ số đúng); 2 ca cũ dùng ISO làm "giá trị sai" đổi sang `dd-mm-yyyy`. `npm test` 240 ca: 239 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #65 (kèm danh sách chỗ chữ `NULL` ở cột khác vẫn là dữ liệu thật — chờ PO), `06_DEPLOYMENT.md` mục 9, backlog 7h–7h1.


## [2026-10-10] - Xoá dữ liệu sản lượng đến (dev) và nạp lại từ một file CSV nhiều ngày (SANLUONG-3i)

- `scripts/reset-arrivals.js` (mới): xoá `arrival_items` + `arrival_import_files` (danh sách trắng) và đặt lại bộ đếm id; chạy thử mặc định, `--apply` một transaction, lặp lại an toàn; không đụng `users`, `user_bcvh`, danh mục, `ward_bdx_map`, `dashboard_widgets`.
- `scripts/split-arrivals-csv.js` (mới): tách MỘT file CSV nhiều ngày thành `HangDen_<mã>_<yyyymmdd>_235959.csv` theo ngày đến (R2; chưa nhận → ngày lập BD10; không mốc → ngày cuối); thư mục ra bắt buộc ngoài repo và rỗng; không in số hiệu. Lý do chọn tách file thay vì sửa importer: mọi chỉ số lọc theo `file_date` (chưa nhận, ngoại lệ, Dashboard, kiểm tra hợp lý [ngày file −3, +1]) giữ nguyên (#63).
- `server/lib/arrivalsImport.js`: `resolveHeader()` — đọc cột theo TÊN (không dấu, không phân biệt hoa/thường), cột lạ bỏ qua (`extraColumns`), đổi chỗ cột được, cột tuỳ chọn (`Ma_BC_dong`, `Khoi_luong_thuc_te`, `Ten_dich_vu`, `Ghi_chu`) vắng → rỗng; thiếu cột bắt buộc / cột trùng tên → REJECTED. Nạp hằng ngày với file chuẩn không đổi.
- Tests: `tests/arrivals-reload.test.js` (mới, 5 ca); `arrivals-import` (thay ca "sai tiêu đề", +1 ca cột thừa / bí danh / vắng cột tuỳ chọn); `arrivals-api` (ca import-status đổi cột làm hỏng tiêu đề sang SHBG). `npm test` 237 ca: 236 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #63–#64 (ghi rõ script xuất đã đổi ngữ nghĩa XNĐ BD10 cho tiền tố 530100, #61 sẽ được xem lại), `06_DEPLOYMENT.md` mục 9 (từng lệnh), bản đồ kiến trúc, backlog 7g–7g3.


## [2026-10-10] - Quy tắc ngày đến R2, "chưa nhận tại BCVH", chất lượng khai thác theo nguồn BD10 (SANLUONG-3g)

- `server/lib/arrivalsImport.js`: `deriveArrival()` (R2: túi → bưu gửi → BD10, không dùng `bd10_ttkt_confirmed_at`), dùng chung với importer và script tính lại. `scripts/rederive-arrival.js` (mới): chạy thử mặc định, `--apply` ghi trong một transaction, idempotent, nhắc sao lưu; `06_DEPLOYMENT.md` mục 8.
- `server/lib/arrivalsQuery.js`: `TTKT_BD10_PREFIX = '530100'`; truy vấn dùng chung "chưa nhận tại BCVH" (`notReceivedStats`, `notReceivedList`, `scopedFilters` — GDVH chỉ BCVH được giao); `tong_hop.theo_nguon` + `du_trang_thai_theo_nguon` trong `quality-mocs` (nhóm gắn vào khoá dòng đại diện, GROUP BY một khoá nguyên); `/exceptions` có `ly_do`, phân trang, lý do `CHUA_NHAN_TAI_BCVH`; `/meta` có ghi chú + tỷ lệ cho tiêu chí `bd10`. `server/lib/dashboardQuery.js`: `/center` thêm `chua_nhan_tai_bcvh` (theo phạm vi) và `theo_nguon`.
- `server/routes/arrivals.js`: `chua_nhan_tai_bcvh` trong `/summary` (mọi vai trò, ngoài `canh_bao`); `GET /api/arrivals/not-received`; `GET /api/arrivals/not-received/export` (dùng chung `exportHandler` với `/export`); `server/lib/arrivalsExport.js`: `writeNotReceivedExport`.
- Tests: `tests/arrivals-source.test.js` (mới, 13 ca); sửa `arrivals-api` (fixture T19 mốc BD10 sớm, SL_DAY4 = 17), `arrivals-import` (R2: +2 ca), `dashboard-api`. `npm test` 231 ca: 230 pass, 1 skip có chủ đích; `npm run build` ok.
- Bản chép DB thật (13.102 dòng): `rederive` đổi 110 dòng, sản lượng 02→08/10 = 12.783 trước và sau (03→09/10 12.783; 01/09→31/10 12.786); chưa nhận tại BCVH 62 (cũ nhất 4 ngày); theo nguồn `ttkt` 8.242 / `khac` 3.803 / `khong_bd10` 738, đủ theo nguồn 90,66%. Hiệu năng (DB giả 993.600 dòng): `summary` ±3%, `quality-mocs` +16–19%.
- Docs: quyết định #59–#62, bản đồ kiến trúc, backlog 7f–7f5, `06_DEPLOYMENT.md` mục 8.


## [2026-10-09] - Giao diện màn hình "Dữ liệu sản lượng đến" (SANLUONG-4a)

- `src/components/arrivals/*` (mới): Dựng UI dựa trên mô tả ticket, gồm:
  1. `ArrivalsFilters`: Bộ lọc (ngày, tiêu chí, phường/xã, BCVH multi-select).
  2. `ArrivalsOverview`: Thẻ chỉ số tổng, Bảng so sánh (tự động fetch nhiều `receiver_code`), biểu đồ ngày/giờ (Recharts), bảng phường/xã. Biểu đồ theo giờ chỉ gọi khi khoảng ≤ 7 ngày, mỗi khối tự xử lý lỗi.
  3. `ArrivalsRoutesServices`: Đường thư và dịch vụ, định dạng giờ trả về.
  4. `ArrivalsQuality`: Chất lượng khai thác, 7 tổ hợp mốc. Chứa phần hiển thị riêng cho `ADMIN` (cảnh báo bất thường, trạng thái nạp file).
  5. `ArrivalsLookup`: Tra cứu bưu gửi, xử lý cảnh báo đến lại. Chứa phần hiển thị riêng cho `ADMIN` (ngoại lệ).
  6. `ArrivalsExport`: Xử lý nút Tải dữ liệu, có kiểm tra `exportScope`. Nút xuất file chỉ gửi ngày thuần.
  7. `CustomDatePicker.jsx` (mới): Hộp lịch tiếng Việt tự viết, không thư viện.
  8. `dateUtils.js` (mới): Chuyển đổi ngày; bộ lọc chỉ chọn ngày, hiển thị dd/MM/yyyy.
- Quyền hiển thị (`App.jsx`, `Sidebar.jsx`): Chặn `STAFF` khỏi màn hình Arrivals. Sửa lại các chỗ kiểm tra minh bạch nhóm quyền. Việc đổi tên menu thành “Sản lượng đến”.
- Giao diện: Đồng bộ màu với site (.btn-primary, .card-soft).
- Không thêm thư viện mới (dùng recharts đã có; package.json/package-lock.json không đổi).
- Đã chạy `npm run build` thành công.
- UI chưa có test tự động; PO đã kiểm bằng tay trên dữ liệu mẫu.

---

## [2026-10-09] - Xuất Excel dữ liệu thô "Hàng đến" của một BCVH (SANLUONG-3c-3)

- `server/lib/arrivalsExport.js` (mới): tham số (`receiver_code` ∈ 6 BCVH, `from`/`to` `YYYY-MM-DD` ≤ 92 ngày, `date_basis`), phạm vi theo vai trò (`allowedBcvhCodes`/`exportScope`, GDVH qua `getAssignedBcvh`), đếm trước (ngưỡng 1.000.000 dòng, `ARRIVALS_EXPORT_MAX_ROWS` ghi đè), `writeExport` ghi `.xlsx` theo luồng: tiêu đề qua API ExcelJS, dòng dữ liệu ghi thẳng XML (API dòng/ô của ExcelJS ~30 µs/dòng), duyệt từng ngày rồi `id` (một lần seek mỗi lô 2.000 dòng), có chờ khi bộ đệm nén/gửi > 2 MB (luồng sheet của ExcelJS không tự báo áp lực ngược → đọc trạng thái luồng ống dẫn). Đúng 9 cột chuỗi (`numFmt '@'`, `t="str"`), ô rỗng để trống, giờ `dd/MM/yyyy HH:mm:ss`; bỏ ký tự điều khiển XML, cắt ô > 32.767 ký tự.
- `server/routes/arrivals.js`: `GET /api/arrivals/export-scope` (`{ bcvh: [{ ma, ten }] }`), `GET /api/arrivals/export` (400/403 tiếng Việt; header `Content-Disposition`; lỗi giữa chừng → cắt kết nối; client ngắt → dừng đọc DB; nhật ký `arrivals_export` vào `security.log`, không có dữ liệu bưu gửi). `server/lib/dashboardQuery.js` export thêm `bcvhNames`.
- `tests/arrivals-export.test.js` (mới, 15 ca; CSV/tài khoản giả): 9 tiêu đề + ánh xạ cột, mọi ô là chuỗi (kể cả đọc XML gốc), chuỗi 19 chữ số / mã 0 đầu, giờ 12 trưa/12 đêm/ngày 1 chữ số, dòng thô (không gộp, không loại hoàn/tỉnh khác), đúng BCVH + khoảng ngày, `date_basis`, khoảng rỗng, quyền 4 vai trò + GDVH chưa được giao, tham số sai, ngưỡng số dòng, ranh giới lô, ký tự lạ/ô dài, nhật ký. `package.json` thêm file vào `npm test`. `npm test` 217 ca: 216 pass, 1 skip có chủ đích; `npm run build` ok.
- Hiệu năng (1.145.600 dòng giả trong DB tạm, 3 BCVH; server chạy tiến trình riêng): 1 tháng 533140 (334.800 dòng) 3,4 s; 92 ngày (993.600 dòng) 9,7–9,8 s; RSS nền 71 MB, đỉnh 273 MB (1 tháng) và 294–299 MB (~1 triệu dòng) — không tăng theo số dòng; ngắt giữa chừng → dừng, ghi `aborted`, RSS về ~252 MB, server còn phục vụ. Bản đầu dùng API dòng của ExcelJS: 1 tháng 13,7 s, RSS đỉnh 410 MB (~1 triệu dòng: 750 MB) — đã thay.
- Docs: quyết định #55–#58 (ánh xạ 9 cột; mục #56 là mặc định CTO chọn), bản đồ kiến trúc (2 endpoint, ma trận quyền), `THIRD_PARTY_NOTICES.md` (+`exceljs` 4.4.0, `csv-parse` 7.0.3, đối chiếu LICENSE trong `node_modules`), backlog 7c ✅, 7c1, 7c2.

## [2026-10-09] - Bổ sung 3c-3: test thoát XML + file mẫu

- `tests/arrivals-export.test.js` +1 ca (16 ca): đường thư giả `A & B <C> "D" 'E'`, chữ Việt có dấu, toàn bộ ký tự điều khiển cấm của XML 1.0 → kiểm giá trị đọc lại bằng ExcelJS và XML gốc (đã thoát, không còn ký tự cấm). Chọn **xoá** ký tự cấm (không thay bằng khoảng trắng). Không đổi mã nguồn xuất file. File mẫu giả tạo ngoài repo cho PO mở thử Excel.

## [2026-10-09] - 4 vai trò ADMIN/TTVH/GDVH/STAFF, quản lý tài khoản chỉ ADMIN, gán GDVH ↔ BCVH (SANLUONG-3c-2)

- `server/roles.js` (mới): `ROLES`, `VALID_ROLES`, `VIEWER_ROLES`, `isValidRole`. `server/auth.js`: `authRequired` tra DB (`role`, `deactivated_at`) ở MỌI request (khoá/không còn → 401, role ngoài danh sách → 403, `req.user.role` từ DB; `db.js` nạp lười để fixtures không mở nhầm DB thật); `requireRoles(...)` thay `requireManager`/`isManager` (đã xoá); `requireAdmin` là lớp bọc.
- Routes: `users.js` chỉ ADMIN (trừ `/me/password`), `role` bắt buộc hợp lệ (400), chặn hạ/khoá ADMIN cuối cùng (`server/lib/adminGuard.js`), `bcvh_codes` trong `GET /users`, `GET/PUT /users/:id/bcvh`; `network.js` đọc ADMIN/TTVH/GDVH, ghi/nhập/xoá ADMIN; `arrivals.js` ADMIN/TTVH/GDVH (`canh_bao`, `/exceptions`, `/import-status` vẫn ADMIN); `dashboardWidgets.js` dùng hằng số vai trò.
- `server/db.js` + `server/lib/userBcvh.js` (mới): bảng `user_bcvh` (idempotent), `getAssignedBcvh(userId)` cho 3c-3. Đổi GDVH sang vai trò khác xoá các dòng gán (cùng transaction).
- `scripts/migrate-roles.js` (mới): dry-run mặc định; `--apply` sao lưu + MANAGER→TTVH trong một transaction; role lạ → dừng mã 2; idempotent. PO tự chạy trên DB thật (`06_DEPLOYMENT.md` mục 7).
- Giao diện (tối thiểu): `ROLE_OPTIONS` ở `AddUserModal.jsx`/`UserAdminView.jsx` = STAFF, TTVH, GDVH, ADMIN; nhãn vai trò ở `Sidebar.jsx`; thông báo 403 chung ở `api.js`. Không làm giao diện gán BCVH (backlog 7b).
- Tests: `tests/roles.test.js` (mới, 21 ca: ma trận route × 4 vai trò, vai trò cũ/lạ, chống leo thang, hiệu lực ngay, ADMIN cuối cùng, `user_bcvh`), `tests/migrate-roles.test.js` (mới, 7 ca); 35 ca cũ ở `arrivals-api`/`dashboard-api`/`dashboard-widgets` đổi tài khoản `MANAGER`→`TTVH` (+ GDVH vào ca quyền); `fixtures.js` thêm `loginAs`, `ROLES`. `npm test` 202 ca: 201 pass, 1 skip có chủ đích; `npm run build` ok.
- Docs: quyết định #49–#54, ma trận quyền + `user_bcvh` + `roles.js` trong bản đồ kiến trúc, hướng dẫn chuyển đổi (`06_DEPLOYMENT.md` mục 7), backlog 7a–7e.

## [2026-10-09] - Sửa nhỏ SANLUONG-3e: hàng nặng theo điểm % + sản lượng tối thiểu

- `server/lib/dashboardQuery.js`: điểm `hang_nang` = tỷ lệ hôm nay − tỷ lệ bình thường (gộp ≤ 4 ngày cùng thứ) ≥ 7 điểm %, `so_tuan = 0` không phát sinh; thêm `DASHBOARD_THRESHOLDS.san_luong_toi_thieu` (50 SHBG, TẠM) chặn điểm lệch sản lượng và hàng nặng khi `tb_4_tuan` < 50; echo trong `nguong`; khoá ngưỡng đổi thành `hang_nang.trong_ngay_diem_pct`; `hang_nang.ty_le_binh_thuong` trong `/overview`.
- `tests/dashboard-api.test.js`: +1 ca (21 ca): họ dữ liệu F4, biên 6,9/7 điểm %, `so_tuan = 0`, tb 49/50. Docs: quyết định #48 (sửa định nghĩa của PO).

## [2026-10-09] - API Dashboard điều hành (6 BCVH) + chỉ số chất lượng khai thác bổ sung (SANLUONG-3e)

- `server/lib/dashboardQuery.js` (mới): `DASHBOARD_BCVH` (6 BCVH), `DASHBOARD_THRESHOLDS`, `overview` (6 BCVH + tổng + `issues`), `trend`, `wardsSurge`, `center`. Không có logic đếm thứ hai: gọi `buildCountedCte()` cho từng cửa sổ 00:00 → `as_of`.
- `server/lib/arrivalsQuery.js`: `tong_hop` trong `/quality-mocs` (`du_trang_thai`, `co_xn_tui`, `co_xnd_bd10`, `khong_xnd_bd10`, `co_xn_bg`); tuỳ chọn `withMocTimes`; tách `parseHeavyG`, `shapeByRoute/Service/QualityMocs` (hành vi 3b/3d không đổi).
- `server/routes/arrivals.js`: `GET /api/arrivals/dashboard/overview|trend|wards-surge|center` (MANAGER + ADMIN).
- `tests/dashboard-api.test.js` (mới, 20 ca, CSV giả + tính lại độc lập); `package.json` thêm file vào `npm test`. `npm test` 173 ca: 172 pass, 1 skip có chủ đích; `npm run build` ok.
- 9 file mẫu (DB tạm): 08/10 09:30 — 1.940 SHBG (hôm qua cùng giờ 2.173); chỉ phát sinh điểm `hang_nang` (20,62% ≥ 7%); `/center` 7 ngày 12.783 SHBG; `tong_hop` khớp 7 tổ hợp của 3b.
- Hiệu năng (1.000.008 dòng giả, 3 BCVH × 38 ngày): `/overview` ~0,65 s; `/trend` 1,1–1,2 s; `/wards-surge` ~0,58 s; `/center` 7 ngày ~0,98 s (30 ngày ~4,9 s).
- Docs: quyết định #41–#47, bản đồ kiến trúc, backlog 6e–6h, đổi "đủ cả 3 mốc" → "đủ trạng thái (SHBG, BD8, BD10)".

## [2026-10-09] - API "Hàng đến theo đường thư và dịch vụ" + hàng nặng (SANLUONG-3d)

- `server/lib/arrivalsQuery.js`: thêm `byRoute`, `byService` (tái dùng lõi `buildCountedCte` của 3b, thêm `route_name` vào dòng đại diện), tham số `heavy_g` (500–30000, mặc định hằng số 2.500 g), `hang_nang` / `ty_le_hang_nang` / `nguong_hang_nang_g` trong `/summary`.
- `server/routes/arrivals.js`: `GET /api/arrivals/by-route`, `/by-service` (MANAGER + ADMIN).
- `tests/arrivals-api.test.js`: +7 ca (ngưỡng 2.499/2.500/2.501 g, rỗng, 0; `heavy_g`; nhóm chưa có tên; tên theo dòng đại diện; giờ nhiều nhất + hoà; bộ lọc). `npm test` 153 ca: 152 pass, 1 skip có chủ đích.
- Đổi chữ "Tuyến thư" → "Đường thư" trong docs và giá trị giả của test (#36).
- 9 file mẫu (DB tạm): 5 đường thư + nhóm chưa có tên (738); 5 dịch vụ + nhóm chưa có tên (186); hàng nặng 2.030 / 12.786 = 15,88%; bất biến tổng khớp.
- Hiệu năng (~1 triệu dòng giả): 1 tháng 0,28–0,36 s; 1 năm 4,0–4,5 s.
- Docs: quyết định #36–#40, bản đồ kiến trúc, backlog, snapshot.

## [2026-10-08] - Đổi lõi sang "Sản lượng đến", lọc theo giờ, bỏ BĐX, chất lượng khai thác (SANLUONG-3b)

- `server/lib/arrivalsQuery.js` viết lại: sản lượng = SHBG khác nhau tại lần đến sớm nhất trong khoảng (#28), lọc `from`/`to` tới phút (#31), nhóm phường/xã (#29), 7 tổ hợp mốc (#33); bỏ lượt đến / gộp dòng thiếu / BĐX.
- `server/routes/arrivals.js`: `/meta`, `/summary`, `/by-time` (day/hour), `/by-ward`, `/quality-mocs`, `/lookup`, `/items`; `/exceptions`, `/import-status` chỉ ADMIN; `canh_bao` trong `/summary` chỉ ADMIN (#34). Bỏ `/by-bdx`, `/by-day`.
- `tests/arrivals-api.test.js` viết lại (15 ca). `npm test` 146 ca: 145 pass, 1 skip có chủ đích.
- 9 file mẫu (DB tạm): sản lượng 12 786 SHBG (+ 62 không có mốc = 12 848); 49 đến lại trong khoảng; 9 cảnh báo BD10 sớm; 36/40 phường/xã có hàng.
- Hiệu năng (1,05 triệu dòng giả): 1 tháng 0,26–0,48 s; 1 năm 3,7–7,8 s — đề xuất bảng tổng hợp (#35).
- Docs: quyết định #28–#35, dòng "thay thế bởi" ở #11, #14, #22, #24, #27; bản đồ kiến trúc; backlog (SANLUONG-3c và các module sau); snapshot.

## [2026-10-08] - API lọc và tổng hợp "Hàng đến", quy tắc đếm lượt mới (SANLUONG-3)

- Thêm `server/lib/arrivalsQuery.js` (quy tắc gộp lượt #22, nhóm tỉnh/phường #24, kiểm tham số, các truy vấn) và `server/routes/arrivals.js` (`/api/arrivals/meta|summary|by-day|by-bdx|by-ward|items|import-status`, MANAGER + ADMIN); đăng ký trong `server/index.js`. Không đổi schema.
- Thêm `tests/arrivals-api.test.js` (12 ca, CSV giả). `npm test` 143 ca: 142 pass, 1 skip có chủ đích.
- 9 file mẫu (DB tạm): 13 049 → 13 048 lượt (1 dòng thiếu BD10 được gộp); 677 lượt thiếu cả BD10 lẫn BD8; 9 lượt cảnh báo BD10 sớm; 410 dòng Ngoài tỉnh.
- Hiệu năng trên 1,05 triệu dòng giả: 1 tháng 0,4–0,8 s; 1 năm 6,9–10,2 s — đề xuất bảng phụ (#27, backlog 14).
- Docs: quyết định #22–#27 + đính chính #14, bản đồ kiến trúc (module + endpoint), backlog, snapshot.

## [2026-10-08] - Bảng dữ liệu "Hàng đến" + công cụ nạp CSV (SANLUONG-2)

- Thêm `server/lib/arrivalsImport.js` (schema `arrival_import_files`, `arrival_items`, `ward_bdx_map`; nạp 1 file / 1 thư mục; `getMissingBatches`); `server/db.js` gọi `ensureArrivalSchema`.
- Thêm `scripts/import-arrivals.js` (bảng tóm tắt, `--check-days`, `--db`) và `scripts/set-ward-map.js`. Thêm phụ thuộc `csv-parse` ^7.0.3 (MIT).
- Thêm `tests/arrivals-import.test.js` (16 ca, CSV giả). `npm test` 131 ca: 130 pass, 1 skip có chủ đích.
- Nạp thử 9 file mẫu vào DB TẠM: 8 OK + 1 EMPTY, 13 102 dòng, 0 trùng khoá, chạy lại không đổi; số liệu ở `07_SANLUONG_AUDIT.md` phụ lục B.
- Docs: quyết định PO #11–#20 + thiết kế #21 (`04_DECISIONS.md`), bản đồ kiến trúc, backlog SANLUONG-3/4/5, snapshot; gỡ số hiệu thật khỏi `07_SANLUONG_AUDIT.md`.

## [2026-10-08] - Công cụ nạp DB ban đầu + đồng bộ quy tắc Git trong governance (NEWPROJ-2)

- Thêm `scripts/import-seed.js`: nạp `province_post_offices` → `commune_post_offices` → `post_offices` → `users` từ DB hệ thống cũ vào `data/hue-dhcl.db` (giao tập cột, giữ `id` + `password_hash`, 1 transaction, từ chối khi đích có dữ liệu trừ `--force`, kiểm khoá ngoại). Nguồn chỉ được đọc qua bản sao tạm (`04_DECISIONS.md` #10). Không in hash.
- Thêm `tests/seed-import.test.js` (7 ca, gồm kiểm thư mục nguồn không đổi: tên file + băm + mtime, kể cả khi nguồn đang mở có `-wal`). Test harness tự xoá `data/` rỗng do `server/db.js` tạo.
- `docs/01_GOVERNANCE/*`: executor không `git add`/commit/push/merge, PO làm; `PROJECT_SNAPSHOT.md` trỏ khung prompt về `docs/ai/prompts/`. `04_DECISIONS.md` #2 → đã áp dụng.
- Docs: `06_DEPLOYMENT.md` mục 5 "Tạo DB ban đầu" (đường dẫn NAS `/volume1/docker/hue-dhcl/app/`), backlog, snapshot, roles, prompt templates.

## [2026-10-08] - Dựng khung project hue-dhcl từ it-assets v1.0.0 (NEWPROJ-1)

- Chép phần giữ lại từ it-assets v1.0.0 (tài khoản, mạng lưới, Dashboard động, bảo mật, Docker, CI, docs); bỏ nghiệp vụ thiết bị/thư điện tử/nhân sự thuần/danh mục/cây/bản đồ.
- `server/db.js`: chỉ còn bảng tỉnh/BĐX/bưu cục, `users`, `dashboard_widgets`; DB `data/hue-dhcl.db`.
- `GET /api/users/search` thay cho route tìm nhân sự cũ (autocomplete Người phụ trách).
- Dashboard: chỉ nguồn `POST_OFFICE`, mặc định 3 ô CHART; `/api/dashboard/stats` chỉ còn số đếm mạng lưới.
- Giao diện: menu Dashboard / Quản lý mạng lưới / Quản lý người dùng; đổi tên hệ thống ở tiêu đề trang, đăng nhập, Header, Sidebar.
- Cấu hình: `package.json` `hue-dhcl@0.1.0` (bỏ `leaflet`, `react-leaflet`), container `hue-dhcl`, `HOST_PORT=18060`.
- Tests viết lại theo phạm vi mới: 108/108 pass; `npm run build` OK. `git init -b main`, chưa commit.
