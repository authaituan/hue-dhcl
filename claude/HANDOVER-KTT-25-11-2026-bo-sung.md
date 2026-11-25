# BÀN GIAO BỔ SUNG 25/11/2026 — tab «Hướng đóng chuyến nội tỉnh»: canvas chốt, ticket DC-5/DC-6, git

Người ghi: CTO AI. Đọc sau `HANDOVER-KTT-12-11-2026-bo-sung.md`. Chỉ ghi điều đã có bằng chứng (PO dán, hoặc file đã tạo); điều chưa chắc ghi rõ.

## 1. Quyết định PO (25/11)
- **Canvas CHỐT:** https://claude.ai/artifact/BK1cFW8Qk2fPjXAXLTyVq1 (phiên bản 1795596133-a5d2; hai artboard 03/11/2026 và 08/11/2026). Dựng theo chuẩn trang «Đối chiếu BCVH» (canvas v22 `canvas-v22/project/DoiChieu.dc.html` + STYLE-1/2 + quyết định #101–104).
- **Bỏ khỏi màn:** dải «so với 29 ngày gần nhất» (thay bằng một dòng chữ trong ô «Sản lượng»: «cao thứ N trong 29 ngày»); biểu đồ chấm thang log; khối «Những gì khối này không nói được»; tab «Tồn tại và Gợi ý», «Dữ liệu rà soát tổng thể» (khỏi canvas); mọi chú thích dưới bảng hướng đi và bảng chi tiết (các ý đó chuyển vào ô «Cách tính và giới hạn» bấm mở).
- **Thêm:** bảng «hướng đi»: mỗi dòng một nơi đóng vào 530100 (túi từ N BG trở lên), sáu cột 6 BCVH, mỗi ô hai dòng «{bg} BG» / «{so_tui} túi»; cột «Cộng (bưu gửi)», «Số túi (túi)»; dòng «Cộng» cuối. Bấm một dòng mở từng túi.
- **Nhãn:** tiêu đề khối «Hàng nội tỉnh (túi) đóng đến 530100 không đóng thẳng BCVH»; dòng dưới «Dữ liệu đang tính đối với túi >=N BG».
- **Cách đếm trong ô:** BG = bưu gửi nhóm N2 đi BCVH đó; túi = số túi có ít nhất một BG đi BCVH đó (một túi chứa hàng đi nhiều BCVH tính ở mỗi BCVH nên số túi trong một dòng không cộng ra số túi của nơi đóng).
- **Số theo BCVH trong canvas là SỐ MINH HOẠ** (tổng khớp số thật 502 và 166). Số thật chờ KTT-DC-5.
- **PO muốn trả lời ngắn, chỉ nêu lệnh, ít giải thích** (25/11).

## 2. Ticket (đều trong Project)
- `KTT-DC-5-api-huong-di-theo-bcvh.md` (Claude Code, backend): thêm `huong_bcvh` (6 phần tử `{ma_bcvh, bg, so_tui}`) và `khong_ro_bcvh` vào mỗi nơi và `meta` của `huong-dong-chuyen/tong-hop`; route mới `huong-dong-chuyen/tui` (từng túi, BG theo BCVH). Chỉ thêm, không đổi trường cũ. Đã giao cho PO; chưa có báo cáo.
- `KTT-DC-6-giao-dien-sua-theo-canvas-chot-25-11.md` (Antigravity): sửa giao diện đã làm theo DC-4 cho khớp canvas chốt; điều kiện bắt đầu: DC-5 đã vào `main` và nhánh giao diện đã cập nhật từ `main`.
- `KTT-DC-4-giao-dien-huong-dong-chuyen.md`: thêm ghi chú đầu «bị DC-6 thay một phần» (mục 3, 4.3, 4.4, 4.7 bị thay; điều cấm và tiêu chí vẫn hiệu lực).
- `KTT-DC-4b-...` (kiểm độc lập giao diện cũ): CHƯA CHẠY, bỏ; gộp vào DC-6b (sẽ viết sau DC-6).
- Thứ tự: DC-5 → kiểm độc lập DC-5b (chưa viết) → PO commit/PR vào `main` → cập nhật nhánh giao diện từ `main` → DC-6 → DC-6b → PO commit.

## 3. Git và môi trường (PO dán 25/11)
- `main` = `origin/main` = `7c87bdc` (Merge PR #174, DC-3).
- Worktree chính `D:\Dev\hue-dhcl`, nhánh `feat/ktt-dc-4-giao-dien` (từ `7c87bdc`): có sửa dở của Antigravity chưa commit: `M src/components/ktt/KttView.jsx`, `M src/components/ktt/kttApi.js`, `?? src/components/ktt/KttHuongDong.jsx`, `?? "Claude outputs/"`. **`?? names.txt` là file lạ ở thư mục gốc, chưa rõ ai tạo, KHÔNG `git add`.**
- Worktree DC-5: `D:\Dev\hue-dhcl-dc5`, nhánh `feat/ktt-dc-5-api-theo-bcvh` (từ `main`), đã có junction `node_modules` trỏ `D:\Dev\hue-dhcl\node_modules`.
- Worktree cũ: `D:\Dev\hue-dhcl\.claude\worktrees\ktt-15-measurements-report-ff96f6` (`bbce4ea`, detached), chưa dọn.
- Bản sao DB cho DC-5: `D:\Dev\audit-db-dc5\hue-dhcl.db` (+ `-wal`, `-shm`), chép từ `data\` của repo lúc 15:52 25/11; dữ liệu đến khoảng 11/11/2026 (chưa xác nhận bằng truy vấn). Bản cũ: `D:\Dev\audit-db` (03/11), `D:\Dev\audit-db-kd1` (04/11), không dùng. Số có thể lệch 6c (bản 12/11 15:23).
- Tin giao việc cho Claude Code đã đưa PO; PO chưa báo đã giao hay chưa.

## 4. Script SQL cho PO (DB 530100, chỉ đọc)
`KT-530100-danh-sach-BG-noi-tinh-dong-vao-530100.sql`: kết quả 1 (từng bưu gửi) và kết quả 2 (từng túi, kèm «BCVH dự kiến phát»), tên BC đóng lấy từ bảng POS (tên cột `POSCode`/`POSName` là ĐOÁN, helper ở đầu file). Chưa chạy, chưa kiểm. Dùng làm đối chiếu độc lập cho DC-5 (PO nghiệm thu mục 6 của DC-5). Lệch ngày có thể do script theo ngày đóng chuyến, API theo ngày hàng đến.

## 5. Điều chưa chắc / còn mở
- Dấu «từ N trở lên» (≥) PO chưa xác nhận lần cuối (một hàm `laTuiLon` trong `kttHuongDong.js`).
- Vị trí tab trong thanh trang con (canvas đặt sau «Đối chiếu BCVH») là đề xuất; chưa kiểm `KttView.jsx` thực tế.
- Cỡ chữ: canvas v22 tiêu đề khối 22px, bản chạy `hue-h2 text-[17px]`; DC-6 ghi «theo bản chạy».
- Chênh 31 so với 32 (531600) và 23 so với 26 (535300) ngày 03/11: giả thuyết là N3 tính vào cỡ túi nhưng không vào `bg_trong_tui_lon`; DC-5 mục 4.5 yêu cầu báo số để xác nhận.
- «Ngày chưa trọn» ở giao diện dựa trên trường `nguon_xuat_luc_moi_nhat` (Antigravity báo có; CHƯA kiểm độc lập). DC-6 4.2: không có thì bỏ phần «cao thứ …».
- Số 6c: 03/11 502 BG trong 5 túi, 5 nơi (531120 411, 531600 31, 535300 23, 536210 20, 531110 17); 08/11 166 BG, 1 túi; 30 ngày 11/10–09/11 4.080 BG, 81 túi, 11 nơi. Chỉ để nghiệm thu, không đưa vào repo.

## 6. Việc PO còn nợ
- Giao tin cho Claude Code (DC-5) rồi dán kết luận báo cáo `Claude outputs/KTT-DC-5-bao-cao.md`.
- Chạy script SQL 03/11 (`@GomN3 = 0` và `1`) và báo số dòng.
- Kiểm `names.txt` (ai tạo).
- `D:\placeholder*`, `D:\sec.log` (do KTT-DT-6c tạo nhầm): `dir D:\placeholder* /s`, `dir D:\sec.log`, rồi CTO đưa lệnh xoá.
