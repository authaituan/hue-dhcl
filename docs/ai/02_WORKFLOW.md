# 🔄 QUY TRÌNH LÀM VIỆC (WORKFLOW)

## 1. Vòng lặp chuẩn (1 chu kỳ = 1 ticket)

```
PO nêu nhu cầu
        │
        ▼
CTO AI audit (đọc code/tài liệu thật, có bằng chứng) → viết ticket + prompt
        │
        ▼
Dev AI (Antigravity hoặc Claude Code) thực hiện, tự cập nhật CHANGELOG_AI.md
        │  (KHÔNG commit/push)
        ▼
CTO AI rà kết quả → báo cáo 3 phần (mục 2) → gửi PO
        │
        ▼
PO nghiệm thu → CTO AI hướng dẫn PO commit/push từng bước (mục 4)
        │
        └──► quay lại đầu vòng lặp
```

## 2. MẪU BÁO CÁO CỐ ĐỊNH của CTO AI gửi PO

> Ngôn ngữ bắt buộc: **không dùng thuật ngữ kỹ thuật** — nói theo kiểu báo cáo cho người
> quản lý không rành code.

```markdown
### 📋 BÁO CÁO — [tên hạng mục] — [ngày]

**1. Kết quả** (tối đa 5 câu)
- (Việc gì vừa xong, hoạt động đúng không, có rủi ro/lỗi gì — nói bằng ví dụ thực tế:
  "màn hình danh sách bưu cục giờ đã lọc được theo Bưu điện xã")

**2. Phương án tiếp theo** (tối đa 5 câu)
- (Nên làm gì kế tiếp, vì sao, việc nào cần PO quyết định trước)

**3. Prompt để thực hiện tiếp**
- Dev AI phụ trách: [ANTIGRAVITY hoặc CLAUDE CODE + model]
- Prompt (dán nguyên văn cho Dev AI):
  """
  [nội dung prompt cụ thể, có tham chiếu file:dòng, không mơ hồ]
  """
```

## 3. Quy tắc bắt buộc
**CTO AI**
1. Không tô hồng: Dev AI báo "xong" mà không có bằng chứng `file:dòng`/kết quả test → ghi "chưa xác minh được".
2. Báo cáo không quá khung 5 câu/mục; chi tiết ghi vào `04_DECISIONS.md` rồi dẫn link.
3. Phát hiện tài liệu/code lệch nhau → báo ngay ở mục 1.
4. Prompt chỉ yêu cầu đọc đúng file cần thiết (mặc định `docs/ai/README_AI.md` + `00_SNAPSHOT.md`).

**Dev AI**
1. Đọc `docs/ai/README_AI.md` trước, chỉ đọc thêm file thực sự cần.
2. Làm đúng phạm vi trong prompt — không tự mở rộng.
3. Xong việc → thêm 1 dòng vào `CHANGELOG_AI.md`; được tự cập nhật `00_SNAPSHOT.md`/`05_BACKLOG.md`,
   KHÔNG sửa `01_ROLES.md`/`02_WORKFLOW.md`.

## 4. Quy tắc Git (PO thao tác, CTO AI hướng dẫn)
1. Mỗi lần chỉ đưa **1 lệnh** kèm giải thích ngắn; PO chạy xong gửi lại kết quả rồi mới sang lệnh tiếp.
2. Luôn bắt đầu bằng `git status` và đọc kỹ từng dòng trước khi add.
3. Chỉ `git add <đúng file>` — **không** `git add .`.
4. Kiểm tra lại bằng `git diff --cached --stat` trước khi `git commit`.
5. 1 ticket = 1 commit. Không `git reset --hard`, không `push --force`.
6. Không bao giờ add: `data/`, `*.db*`, `.env`, `security.log` (đã chặn trong `.gitignore`, vẫn phải để ý).

## 5. Bí mật (secret)
- **Không dán** `JWT_SECRET`, mật khẩu, nội dung `.env` hay token vào chat/báo cáo/ticket.
- Khi cần xác nhận đã đặt bí mật: chỉ báo "đã đặt / chưa đặt", không đưa giá trị.
- Lộ bí mật → coi như đã mất: tạo giá trị mới, đổi ngay (đổi `JWT_SECRET` = mọi người bị đăng xuất).

## 6. Khi nào phải hỏi PO trước khi làm
- Đổi công nghệ nền (thêm ORM, đổi DB, thêm thư viện auth...).
- Xoá dữ liệu thật hoặc đổi cấu trúc bảng đã có dữ liệu.
- Việc ảnh hưởng > 1 module cùng lúc.

## 7. Mẫu prompt tái sử dụng
Xem [`prompts/`](./prompts/) — khung prompt cho từng Dev AI, CTO AI chỉ điền phần hạng mục.
