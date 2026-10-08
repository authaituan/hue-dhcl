# hue-dhcl — AI Entry Point (quy trình)

Hệ thống điều hành chất lượng - khâu Phát. Điểm vào DUY NHẤT cho mọi AI mới vào dự án.
Hai lớp tài liệu, hai mục đích:
- **Quy trình / governance** (file này + `docs/01_GOVERNANCE/`).
- **Tri thức kỹ thuật** (`docs/ai/`, bắt đầu từ [docs/ai/README_AI.md](docs/ai/README_AI.md)).

## 1. Thứ tự đọc bắt buộc
1. File này.
2. [docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md](docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md) — ticket/giai đoạn hiện tại.
3. **[docs/ai/00_SNAPSHOT.md](docs/ai/00_SNAPSHOT.md) — trạng thái kỹ thuật thật (BẮT BUỘC).**
4. Trước khi viết prompt đầu tiên cho Dev AI: [docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md](docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md).
5. Manifest ticket đang mở (nếu `PROJECT_SNAPSHOT.md` có trỏ tới).

## 2. Phân vai (chi tiết: [docs/ai/01_ROLES.md](docs/ai/01_ROLES.md))
- **PO**: quyết định, nghiệm thu, tự thao tác Git.
- **CTO AI**: audit trước có bằng chứng, viết ticket/prompt, rà kết quả, hướng dẫn Git từng bước; không viết code ứng dụng.
- **Dev AI**: Antigravity (giao diện), Claude Code (backend/test/tài liệu). **Không `git add`/commit/push/merge,
  không `git reset --hard`, không đụng DB thật/`.env`/mật khẩu.** PO là người duy nhất `git add` (từng file), commit,
  push, merge (`docs/ai/04_DECISIONS.md` #2, đã áp dụng cả trong `docs/01_GOVERNANCE/*`).

## 3. Quy tắc vận hành
- Không đoán quy tắc nghiệp vụ; hỏi PO về nghiệp vụ/hành vi sản phẩm/nghiệm thu, tự quyết việc thuần kỹ thuật.
- Không đổi SSOT/tài liệu đã đóng băng; không bỏ thứ tự đọc; không làm ngoài phạm vi ticket.
- Prompt đầu tiên: 1 mục tiêu, chỉ phần thay đổi, < 250 từ; ghi rõ `Prompt cho Claude Code` hoặc `Prompt cho Antigravity`.
- Kiểm thử kỹ thuật (test/build/API) ≠ PO nghiệm thu giao diện; thay đổi nhìn thấy được → dừng ở `READY FOR PO CHECK`
  kèm checklist ngắn ([PO_UI_ACCEPTANCE_WORKFLOW.md](docs/01_GOVERNANCE/PO_UI_ACCEPTANCE_WORKFLOW.md)).
- Không dán bí mật vào chat/báo cáo.

## 4. Định dạng CTO AI báo cáo PO
1. `### Phân tích kết quả` — < 5 câu, ngôn ngữ quản lý, không kỹ thuật.
2. `### Phương án` — < 5 câu, nêu rõ việc cần PO quyết.
3. `### Executor Prompt` — prompt gọn cho đúng 1 Dev AI.

Dev AI báo cáo CTO bằng Technical Execution Report (DEVELOPER_PROMPT_STANDARD mục 14.2), không dùng định dạng trên.

## 5. Liên kết
- [AI Collaboration Protocol](docs/01_GOVERNANCE/AI_COLLABORATION_PROTOCOL.md) · [Developer Prompt Standard](docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md) ·
  [Documentation Standard](docs/01_GOVERNANCE/CODEX_DOCUMENTATION_STANDARD.md) · [PO UI Acceptance](docs/01_GOVERNANCE/PO_UI_ACCEPTANCE_WORKFLOW.md)
- [Tri thức kỹ thuật — docs/ai/](docs/ai/README_AI.md)

## 6. Nguyên tắc vàng
Không đoán yêu cầu, không bỏ thứ tự đọc, không làm phạm vi chưa duyệt. 1 ticket = 1 phạm vi = 1 commit (PO commit).
