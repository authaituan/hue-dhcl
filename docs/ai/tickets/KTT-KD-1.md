# TICKET KTT-KD-1 — «Vì sao không đạt 14 giờ» (API, xlsx, test, tài liệu; KHÔNG giao diện)

Ngày: 04/11/2026 · Người giao: CTO AI (PO Tân nêu yêu cầu) · Executor: Claude Code (Sonnet) · Validation: LEVEL 2 · PO UI Check: Không (giao diện là KTT-KD-2, Antigravity).
Bản này là MANIFEST (đã thực hiện); nội dung kỹ thuật ở `docs/ai/41_KTT_LUU_THOAT.md` mục 19, `docs/ai/42_KTT_API.md` mục 19, quyết định `docs/ai/04_DECISIONS.md` #125. Số liệu thật do PO giữ ngoài repo (repo công khai); mọi dữ liệu trong test và tài liệu là GIẢ hoặc số tổng hợp.

## Các pha
- **Pha 1 (khảo sát chỉ đọc)**: chốt nhóm nguyên nhân bằng số đo trên bản sao DB; CTO duyệt, PO chốt «A ưu tiên B».
- **Pha 1b (khảo sát chỉ đọc)**: dư địa theo giờ hàng đến. Kết luận: giả thuyết «giờ đến sát hạn gây không đạt» không được số đo ủng hộ; «đợt đến» = BD10 đến.
- **Pha 2 (bản sửa 1)**: máy chủ + xlsx + test + docs. Mục 0 của bản sửa: kiểm lại nhãn ngày Chủ nhật (11/10, 18/10, 25/10, 01/11) và khảo sát nhóm E của BCVH 536250 (chỉ đọc, không kết luận nguyên nhân).

- **Pha 2 (bản sửa 2, 04/11/2026)**: «Bức tranh đường thư đến» + khối «Vì sao không đạt 14 giờ» theo mốc mặc định A: 3 route `/luu-thoat/buc-tranh-duong-thu[/chuyen-xe|/danh-gia]`, cờ ngưỡng tương đối (11 tham số `ktt_bt_*`), `luu_y_lich`, `moc` ở `khong-dat-14h`. Mục 0 (chỉ đọc): so «chuyến thư đến» 60 phút với «đợt» 120 phút của KTT-12; lịch Chủ nhật của 536250 / 537015 / 537220.

## Điều cấm (giữ nguyên từ ticket gốc)
Không sửa `src/`; không đổi số cũ, tên field, đẳng thức (chỉ THÊM field / route); không đổi quy tắc tính (KTT-4, 7b, 10b, 14, 17-2) và lịch chuyến (lỗi Chủ nhật KTT-LICH-1 để sau); không đụng `.env`, `data/`, DB thật; không đưa SHBG / BD10 / ItemCode / mã nơi gửi thật vào repo, test, docs; không `git add` / commit / push / stash / reset, không `npm install`; `npm test` chạy tuần tự từng múi giờ.

## Việc đã làm (file)
- Mới: `server/lib/kttKhongDat14h.js`, `tests/ktt-khong-dat-14h.test.js`, `docs/ai/tickets/KTT-KD-1.md`; pha 2 bản sửa 2: `server/lib/kttBucTranh.js`, `server/config/ktt-buc-tranh.js`, `tests/ktt-buc-tranh.test.js`.
- Sửa: `server/lib/kttLuuThoat.js` (`congChiTieu14h` cộng được `kg` null), `server/lib/kttLuuThoatQuery.js`, `server/lib/kttApi.js`, `server/lib/kttXuat.js`, `server/lib/kttWorker.js`, `server/routes/ktt.js`, `package.json` (script `test`), `docs/ai/00_SNAPSHOT.md`, `03_ARCHITECTURE_MAP.md`, `04_DECISIONS.md`, `41_KTT_LUU_THOAT.md`, `42_KTT_API.md`, `CHANGELOG_AI.md`; pha 2 bản sửa 2: `server/lib/kttQuery.js` (thêm `lichDenMa` / `lichDenTen`), `server/config/tham-so-mac-dinh.js`, `server/config/tham-so.js` (11 khóa `ktt_bt_*`), `tests/tham-so.test.js` (đếm khóa 39 → 50).

## Nợ / việc ngoài phạm vi (ghi lại, không làm)
1. Giao diện khối «Vì sao không đạt 14 giờ» và «Bức tranh đường thư đến» (KTT-KD-2), mặc định mốc A (PO 04/11/2026).
2. Nhóm E tập trung ở BCVH 536250: cần PO/CTO xác nhận BD10 đi có được nạp / lập đủ không trước khi đọc số của BCVH này.
3. Lịch 536250 chuyến 06:30 (49,5% lập BD10 đi sau giờ rời): xác nhận lịch với PO.
4. Lỗi lịch Chủ nhật: Hương Thủy 536250 CHỈ có chuyến 06:30 vào Chủ nhật (PO 04/11/2026); mã đang coi không có chuyến nào (`kttSchema.js:133`, `kttLichChuyen.js:61,81`) — KTT-LICH-2 (CTO viết), ô Chủ nhật nay mang `luu_y_lich`.
5. `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md` chưa phản ánh KTT-KD-1.
