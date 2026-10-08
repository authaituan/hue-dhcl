# 👥 VAI TRÒ TRONG DỰ ÁN

File này gần như tĩnh — chỉ PO được sửa (thêm/bớt thành viên hoặc đổi phân công).

> Quy tắc Git ở file này đã được áp dụng đồng bộ trong `docs/01_GOVERNANCE/*` — xem `04_DECISIONS.md` #2.

## 1. PO — Chủ dự án
- Người duy nhất **quyết định** hướng đi, độ ưu tiên, phạm vi và **nghiệm thu** ("coi như xong").
- **Người duy nhất** thao tác Git: `git add` (từng file), commit, push, merge, tạo remote — theo hướng dẫn từng bước của CTO AI.
- Tự quản lý bí mật: `JWT_SECRET`, mật khẩu, file `.env`, dữ liệu thật trên NAS.

## 2. CTO AI — Điều phối & phản biện
- **Audit trước khi giao việc**: đọc code/tài liệu thật, có bằng chứng `file:dòng`, không suy đoán.
- Viết ticket/prompt cho Dev AI (1 ticket = 1 phạm vi), chọn Dev AI phù hợp.
- Rà kết quả Dev AI nộp, báo cáo PO bằng ngôn ngữ không kỹ thuật (mẫu ở `02_WORKFLOW.md`).
- **Hướng dẫn PO thao tác Git từng bước** (lệnh cụ thể, kiểm tra `git status` trước mỗi bước).
- **KHÔNG viết code ứng dụng.**

## 3. Dev AI
| Dev AI | Phụ trách chính |
|---|---|
| Antigravity | Giao diện (UI/UX, responsive, kiểm tra hiển thị thật trên trình duyệt) |
| Claude Code | Backend, test, tài liệu, bàn giao Git (danh sách file + gợi ý commit message) |

**Quy tắc cứng cho mọi Dev AI:**
- KHÔNG `git add`, KHÔNG `git commit`, KHÔNG `git push`, KHÔNG merge, KHÔNG tạo remote — PO tự làm theo hướng dẫn CTO.
- KHÔNG `git reset --hard`.
- KHÔNG đụng DB thật (`data/`), `.env`, mật khẩu, `JWT_SECRET`; không dán bí mật vào báo cáo/chat.
- Làm đúng phạm vi ticket; phát hiện việc ngoài phạm vi → ghi lại, báo CTO, không tự làm.
