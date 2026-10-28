# TICKET KTT-11b — Số «Tất cả» ở khung Xuất xlsx: sửa backend và docs (không giao diện)

Ngày: 28/10/2026 · Người giao: CTO AI (bản nháp soạn từ báo cáo KTT-11a, chờ CTO duyệt) · Người nghiệm thu: PO Tân
Executor: Claude Code (Sonnet) · Validation: LEVEL 2 (đổi đầu ra `/api/ktt/luu-thoat`; test module KTT phải chạy hết) · PO UI Check: Không (không sửa mã giao diện; chip «Tất cả» theo BCVH tự đúng vì giao diện đã đọc `tong_shbg_ngay`).
Đọc trước: chuỗi onboarding của `README_AI.md`, rồi `docs/ai/41_KTT_LUU_THOAT.md`, `docs/ai/42_KTT_API.md`; báo cáo KTT-11a (PO giữ) và mục 2 dưới đây.
Làm trên nhánh PO đặt từ `main` (HEAD sau PR #144). Dữ liệu giả, không cần số thật.

## 1. Vai trò
Claude Code (backend, test, docs). KHÔNG sửa `src/`. Phần giao diện (hiện dòng «Không vào bảy trạng thái», đổi nhãn «Tất cả», chữ «17 cột», chip theo bộ lọc ô, khoảng ngày mặc định) là ticket riêng cho Antigravity (mục 8).

## 2. Bối cảnh (đã khảo sát ở KTT-11a, không bàn lại)
- Số «Tất cả» (6 BCVH) = `tong_shbg_ngay` = mọi SHBG có ngày quét túi đến trong khoảng (`server/lib/kttLuuThoatQuery.js:102`, cộng ở `:185`). Số này ĐÚNG và khớp số dòng xlsx. Nó gồm bốn nhóm không có chip: không rõ đích, ngoài 6 BCVH, thiếu giờ quét túi đến, không xếp được chuyến. Đẳng thức: Tất cả = t1…t5 + đang chờ + hàng hoàn + bốn nhóm trên.
- **Lỗi 1.** Chọn MỘT BCVH: giao diện lấy `targetBlock.tong_shbg_ngay ?? luu_thoat.mau_so` (`src/components/ktt/KttLuuThoat.jsx:215`), mà khối `theo_bcvh[mã]` không có `tong_shbg_ngay` (`congKhoi`, `kttLuuThoatQuery.js:149-175`) nên rơi sang `mau_so` (chỉ t1…t5). Dữ liệu giả: Thuận Hóa chip «Tất cả» = 8, xlsx = 12 (8 + 2 hàng hoàn + 2 thiếu giờ quét). Số dòng xlsx theo BCVH = `khối.tong_shbg` + `hang_hoan.tong_shbg` nếu BCVH là 533140 (`kttXuat.js:112,115`).
- **Thiếu dữ liệu 2.** `congCacNgay` (`kttLuuThoatQuery.js:184`) ghi đè `khong_phan_loai` của `tong_cong` bằng `{ khong_ro_dich, ngoai_pham_vi }`, làm mất `khong_co_gio_quet_den` và `khong_xep_duoc_chuyen` ở mức tổng; giao diện không có số để nói bốn nhóm là bao nhiêu.
- **Chữ 3.** Sheet 7 xlsx có 18 cột, `chi-tiet` có 19 trường; một số docs còn ghi 17.

## 3. Phạm vi
Ba việc 5.1–5.3 và test, docs, bàn giao. Chỉ THÊM trường vào đầu ra; không đổi ý nghĩa trường đang có.

## 4. Điều cấm
- Không commit, push, `git add`, `git reset --hard`, `git stash`. PO làm git.
- Không đụng `data/`, `*.db*`, `.env`, mật khẩu, CSV thật, SHBG thật; test dùng dữ liệu giả.
- Không sửa `src/`, không đổi cấu trúc sheet xlsx, không đổi quy tắc phân loại (`phanLoaiShbg`), định nghĩa hàng hoàn, hay số đang hiển thị của năm trạng thái.
- Không đổi hình dạng `khong_phan_loai` cấp NGÀY (`tests/ktt-luu-thoat.test.js:199` so khớp chính xác `{khong_ro_dich, ngoai_pham_vi, tong}`).
- Không `npm install`/`npm ci`. Ngoài phạm vi → dừng, báo, chờ CTO.

## 5. Các việc
5.1 **`tong_shbg_ngay` cho từng khối BCVH (sửa lỗi 1).** Ở mỗi `theo_ngay[].theo_bcvh[mã]` và `tong_cong.theo_bcvh[mã]` thêm `tong_shbg_ngay` = số dòng xlsx khi lọc `ma_bcvh=<mã>` và không lọc trạng thái = `khối.tong_shbg` + (mã là 533140 ? `hang_hoan.tong_shbg` : 0). Mức tổng cộng từng ngày như `tong_shbg_ngay` hiện có (đi qua `congCacNgay`, và `ghepKhoang` phải cho cùng kết quả). Ghi rõ trong code và docs: ý nghĩa của `tong_shbg_ngay` ở khối BCVH = «số SHBG của khối kể cả hàng hoàn Thuận Hóa». Đối chiếu bắt buộc: bằng `kttXuat.soKhop(luuThoat, { maBcvh })` và bằng số dòng xlsx `?ma_bcvh=`.

5.2 **Phân rã «Tất cả» (sửa thiếu dữ liệu 2).** Ở mỗi ngày và ở `tong_cong` thêm khối mới, ví dụ `ngoai_bay_chip` (tên Claude Code đặt, ghi vào docs): `{ khong_ro_dich, ngoai_pham_vi: { HE1_530900, KHAC, KTT… }, ngoai_pham_vi_tong, khong_co_gio_quet_den, khong_xep_duoc_chuyen: { lý_do: n }, khong_xep_duoc_chuyen_tong, tong }`, với `tong` = tổng bốn nhóm. Không thay `khong_phan_loai` đang có. Bất biến phải có test: t1+…+t5 + dang_cho_chuyen + hang_hoan + `ngoai_bay_chip.tong` = `tong_shbg_ngay`, ở từng ngày, ở `tong_cong` và ở kết quả ghép nhiều ngày. Hàng hoàn thiếu giờ quét/không xếp được chuyến nằm trong hàng hoàn, KHÔNG tính vào hai nhóm này (như `kttLuuThoatQuery.js:108`).

5.3 **Docs «17 cột» → số đúng.**
- `docs/ai/03_ARCHITECTURE_MAP.md:36` («17 trường» → 19 trường, nêu sheet 7 = 18 cột) và `:179` («17 cột» → 18 cột).
- `docs/ai/00_SNAPSHOT.md:72`: chỗ mô tả `chi-tiet 17 cột` của xlsx/chi-tiet cho đúng (19 trường; xlsx 18 cột); thêm hai trường mới của 5.1–5.2 vào mô tả `/api/ktt/luu-thoat`.
- `docs/ai/41_KTT_LUU_THOAT.md` và `docs/ai/42_KTT_API.md`: ghi `tong_shbg_ngay` theo BCVH, khối phân rã, đẳng thức «Tất cả».
- KHÔNG sửa các mục lịch sử đúng thời điểm: `CHANGELOG_AI.md` các mục cũ, `04_DECISIONS.md` #116. Mục quyết định mới (số kế tiếp) ghi ngắn: «Tất cả» là tổng mọi SHBG; phân rã bốn nhóm; `tong_shbg_ngay` theo BCVH.
- Test: chỉ sửa chữ/chú thích nhắc «17» (`tests/ktt-api.test.js:457`, `tests/ktt-nguon.test.js:2,242`) nếu SAI so với thực tế; không đổi hành vi assert.

5.4 **Test (dữ liệu giả).** Thêm ca (đặt vào `tests/ktt-luu-thoat.test.js` hoặc file mới): (a) bộ dữ liệu có đủ: t1–t5, đang chờ, hàng hoàn (cả hàng hoàn thiếu giờ quét), Hệ 1/KHAC/KTT, thiếu giờ quét, không xếp được chuyến, không rõ đích; (b) bất biến 5.2 cho ngày, khoảng nhiều ngày, `tong_cong`; (c) `theo_bcvh[mã].tong_shbg_ngay` = số dòng xlsx `?ma_bcvh=mã` cho cả 6 BCVH, kể cả Thuận Hóa có hàng hoàn; (d) `tong_shbg_ngay` tổng = số dòng xlsx không lọc; (e) `ghepKhoang` và tính cả khoảng cho kết quả giống nhau; (f) trường mới không phụ thuộc `moc_chi_tieu`. Script dựng dữ liệu của KTT-11a có thể tham khảo (cùng hình dạng), nhưng không đưa script đó vào repo.

5.5 **Bàn giao** (theo `DEVELOPER_PROMPT_STANDARD` mục 5): mục mới ở đầu `docs/ai/CHANGELOG_AI.md`; cập nhật `docs/ai/00_SNAPSHOT.md` chỗ trạng thái đổi (số ca test); liệt kê file để PO `git add` từng file và gợi ý một commit message. Không tự sửa `PROJECT_SNAPSHOT.md` (CTO/PO đổi ticket). Dừng ở `IMPLEMENTED`.

## 6. Tiêu chí kiểm tra (PASS khi đủ tất cả)
1. Với dữ liệu giả, mỗi chip «Tất cả» của giao diện (đọc `tong_shbg_ngay`) bằng số dòng xlsx tương ứng ở cả «Tất cả 6 BCVH» và từng BCVH.
2. Đẳng thức mục 5.2 đúng ở ngày, khoảng và `tong_cong`.
3. Mọi trường đang có không đổi nghĩa; không test cũ nào bị sửa hành vi (chỉ sửa chữ nếu có).
4. `npm test` xanh; `npm run build` xanh (không sửa `src/` nên chỉ để xác nhận).
5. Docs không còn «17 cột» ở chỗ nói về sheet 7 xlsx, trừ các mục lịch sử nêu ở 5.3.
6. `git status` chỉ có file thuộc phạm vi; không có `data/`, `.env`, `*.db*`, CSV thật.

## 7. Mẫu báo cáo
```
KTT-11b — BÁO CÁO
1. Nhánh/commit gốc:
2. Đã làm (file:dòng): 5.1 ... 5.2 ... 5.3 ...
3. Đối chiếu (dữ liệu giả): Tất cả 6 BCVH x/x; từng BCVH (6 dòng); đẳng thức: ...
4. Hình dạng trường mới (dán một ví dụ JSON rút gọn):
5. Test: lệnh, số ca, kết quả; build:
6. `git status` (nguyên văn):
7. File để PO git add + commit message gợi ý:
8. Chưa chắc / cần CTO-PO quyết:
```

## 8. Ngoài phạm vi (ticket KTT-11c cho Antigravity, sau khi 11b merge)
- Dòng «Không vào bảy trạng thái: n (không rõ đích a, ngoài 6 BCVH b, thiếu giờ quét c, không xếp được chuyến d)» dưới các chip, đọc khối 5.2; đổi nhãn «Tất cả» thành «Tất cả bưu gửi đến KTT» (cần canvas PO duyệt).
- `KttLuuThoat.jsx:578` «17 cột» → 18; thẻ «Chỉ tiêu 14g» (`:606-614`) thành Mốc A / Mốc B.
- Chip theo bộ lọc ô bản đồ nhiệt (hoặc «—» khi đang lọc ô).
- Khoảng ngày mặc định theo ngày của độ mới (PO chốt phương án); nhãn dòng rỗng «Chưa có hàng đến».
- Việc chờ số từ PO: cơ cấu 1.142 SHBG của ngày 27/10 (bốn nhóm) và build đang chạy trên NAS (mặc định «Hôm nay» không khớp mã, mã là 7 ngày).
