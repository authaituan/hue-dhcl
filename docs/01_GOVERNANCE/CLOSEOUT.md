# CLOSEOUT — Đóng dự án `hue-dhcl` (26/11/2026)

Bàn giao trạng thái cuối. Số liệu kiểm trên `main` `d838101` (merge PR #180) ngày 26/11/2026. Chi tiết kỹ thuật: `docs/ai/00_SNAPSHOT.md`; quy trình / ticket: `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md`.

## 1. Phạm vi đã giao
Hệ thống giám sát hàng đến, khớp nối nội tỉnh và lịch xe giao nhận (tên ngắn «Giám sát hàng đến»). Tên mã nội bộ: hue-dhcl (giữ nguyên). Kế thừa khung it-assets v1.0.0 (Node 22, Express 5, better-sqlite3, React 19 + Vite). Đã có (liệt kê đầy đủ ở `00_SNAPSHOT.md` mục 3):
- Đăng nhập / tài khoản, 5 vai trò (ADMIN, TTVH, GDVH, TIVI, TTKT), gán GDVH ↔ BCVH; Quản lý mạng lưới; Dashboard động.
- «Hàng đến» / sản lượng đến, nạp CSV và SFTP (hẹn giờ mặc định TẮT), màn «Nạp dữ liệu nguồn», «Thay thế ngày».
- «Xử lý và tỷ lệ phát», bảng kê `tai-ve`, tỷ lệ «Đã vu hồi»; «Tham số hệ thống» (API); «Thời gian Khai thác-Vận chuyển».
- Module «Hàng tại KTT» (POS 530100), 7 tab: Tổng quan, Lưu thoát trong ngày, A · Hàng đến, B · Tỷ lệ đi cùng ngày, B · Lịch xe / đường thư, Đối chiếu BCVH, Hướng đóng chuyến nội tỉnh (`src/components/ktt/KttView.jsx:14-22`).

## 2. Trạng thái
- `npm test`: 1435 ca, 1425 pass, 0 fail, 10 skip. `npm run build`: mã thoát 0 (chỉ cảnh báo chunk > 500 kB).
- Ticket đang mở: không có. Ticket cuối: KTT-DC-6d (PR #180); KTT-CLOSE-1 chỉ cập nhật tài liệu.
- NAS: repo không ghi NAS đang chạy bản nào hay đã golive `d838101` chưa — **PO xác nhận** (`PROJECT_SNAPSHOT.md`, Runtime Status).

## 3. Nợ còn lại
Danh sách đầy đủ có số dòng: `docs/ai/05_BACKLOG.md` mục 22–29. Tóm tắt: (22) thiếu test ngưỡng «túi lớn» ở route `huong-dong-chuyen/tui`; (23) GDVH / TIVI / TTKT chưa kiểm giao diện tab Hướng đóng chuyến; (24) hiệu năng 31 ngày trên DB thật chưa đo; (25) chuỗi phụ còn thừa ở `KttHuongDong.jsx`; (26) dấu «≥» chưa xác nhận; (27) DC-6c, DC-6d chưa kiểm độc lập; (28) thứ tự 6 BCVH chép tay nhiều nơi; (29) `CHANGELOG_AI.md` thiếu vài mục. Các mục cũ 1–21 của backlog chưa rà lại; nợ kỹ thuật khác ở `00_SNAPSHOT.md` mục 6 (kể cả `npm audit`, chưa chạy lại).

## 4. Chạy, test, build
```
npm ci --ignore-scripts      # Windows: better-sqlite3 dùng bản prebuilt
npm test                     # node --test, server thật trên DB tạm, không đụng data/
npm run build                # vite build -> dist/
npm run dev                  # server + vite; cần .env có JWT_SECRET (docs/ai/06_DEPLOYMENT.md mục 1)
```

## 5. Triển khai NAS (Synology, Docker)
Không nhắc lại ở đây — làm theo `docs/ai/06_DEPLOYMENT.md` mục 6 (kiến trúc, biến môi trường, cập nhật, rollback) và `docs/ai/20_NAS_HUONG_DAN_CHAY.md` (từng bước, chín bước kiểm, mục «Chưa kiểm chứng»). Tệp: `Dockerfile`, `docker-compose.yml`, `.env.nas.example`. Trước khi cập nhật: sao lưu cả thư mục `data/`. Bí mật (`JWT_SECRET`, mật khẩu SFTP) chỉ nằm trong `.env` trên NAS.

## 6. Đọc gì đầu tiên
1. `README_AI.md` → `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md` (quy trình) → `docs/ai/00_SNAPSHOT.md` (kỹ thuật thật).
2. `docs/ai/05_BACKLOG.md` mục 22–29 (nợ), `docs/ai/04_DECISIONS.md` #129 (quyết định cuối).
3. Cần route / bảng: `docs/ai/03_ARCHITECTURE_MAP.md`, `docs/ai/42_KTT_API.md`. Lịch sử: `docs/ai/CHANGELOG_AI.md`.
