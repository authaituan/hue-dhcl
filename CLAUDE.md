# CLAUDE.md

Tự nạp mỗi phiên Claude Code. Bản rút gọn của `README_AI.md` cho Claude Code — không phải nguồn
thẩm quyền riêng: mâu thuẫn với `README_AI.md` / `docs/ai/01_ROLES.md` thì các file đó thắng và phải báo lại.

## 1. Dự án
Hệ thống điều hành chất lượng - khâu Phát (`hue-dhcl`), kế thừa khung từ it-assets v1.0.0.
Chức năng: đăng nhập/tài khoản, Quản lý mạng lưới (danh sách), Dashboard động.

## 2. Vai trò của Claude Code
Dev AI phụ trách backend, test, tài liệu, bàn giao Git (danh sách file + gợi ý commit message). **Bắt buộc:**
- KHÔNG `git add`, `commit`, `push`, merge, tạo remote — PO là người duy nhất làm (theo hướng dẫn CTO AI).
- KHÔNG `git reset --hard`.
- KHÔNG đụng `data/` (DB thật), `.env`, mật khẩu, `JWT_SECRET`; không dán bí mật vào báo cáo.
- Làm đúng phạm vi ticket; việc ngoài phạm vi → ghi lại và báo.

## 3. Đọc gì mỗi phiên
1. [`docs/ai/00_SNAPSHOT.md`](docs/ai/00_SNAPSHOT.md) — trạng thái kỹ thuật thật (bắt buộc).
2. [`docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md`](docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md) — ticket đang mở.
3. Chỉ khi cần: [`docs/ai/03_ARCHITECTURE_MAP.md`](docs/ai/03_ARCHITECTURE_MAP.md) (route/bảng/field),
   `grep` trong [`docs/ai/04_DECISIONS.md`](docs/ai/04_DECISIONS.md).

## 4. Lệnh thường dùng
```
npm ci --ignore-scripts   # Windows: better-sqlite3 dùng bản prebuilt
npm test                  # node --test, server thật trên DB tạm (không đụng data/)
npm run build
```

## 5. Xong việc
Thêm 1 mục vào `docs/ai/CHANGELOG_AI.md` (ở đầu), cập nhật đúng chỗ trong `00_SNAPSHOT.md` nếu trạng thái đổi,
báo cáo: file:dòng đã đổi, kết quả test/build, điểm còn nợ.
