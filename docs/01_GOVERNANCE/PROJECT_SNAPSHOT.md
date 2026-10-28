# PROJECT SNAPSHOT

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Current Snapshot](#2-current-snapshot)
- [3. Usage Rules](#3-usage-rules)
- [4. Continuation Notes](#4-continuation-notes)

## 1. Purpose

This document is the Governance V2 **PROCESS/TICKET** current-state snapshot for AI onboarding in **hue-dhcl**. It answers "what ticket/phase is active in the Governance V2 workflow" — it does **NOT** duplicate technical project facts (API routes, DB schema, features, baseline data). For those, see `docs/ai/00_SNAPSHOT.md` (mục 3 dưới đây giải thích rõ).

It is the **only** file that owns mutable process state (phase, ticket, branch, manifest, PO status). Other documents must point here instead of copying these values.

It is designed to be the shortest safe entry point for a new AI session while preserving continuity with the existing repository workflow.

## 2. Current Snapshot

| Field | Value |
| --- | --- |
| Current Phase | `Module «Hàng tại KTT» (Trung tâm Khai thác, POS 530100): API và giao diện đã vào main (PR #136–#140); đang đối chiếu số liệu độc lập (KTT-10 xong, KTT-10b sắp làm).` |
| Current Ticket | `KTT-10b — đo song song hai mốc «giờ đi» cho chỉ tiêu «đạt 14 giờ» (manifest đã có, chuẩn bị giao Claude Code (Sonnet)).` |
| Next Ticket | `Chưa có — PO chọn. Đề xuất: nối «Chỉ tiêu 14 giờ» hai mốc + chọn mốc vào giao diện Lưu thoát (sau khi PO duyệt canvas). Việc đang mở khác: mục «Việc còn lại» trong HANDOVER-KTT-27-10-2026 (KTT-8d, các trang canvas chưa dựng, hàng hoàn 531120 → 5 BCVH khác).` |
| Last PO Status | `28/10/2026: KTT-10b đã merge (PR #141). KTT-10c (nối moc_chi_tieu vào /api/ktt/luu-thoat, xlsx hai cột mốc) — CTO duyệt khảo sát 5.1, Claude Code làm xong 5.2–5.5 trên nhánh feat/ktt-10c-api-xlsx, CHỜ CTO duyệt + PO commit. 27/10/2026: PO đã quyết Q1 (giữ hàng hoàn «chỉ đích Thuận Hóa»), Q2 (đo song song hai mốc), Q3 (gộp kiểm 18/10 và 20/10 vào KTT-10b). Nghiệm thu giao diện KTT-9a/9b: CHƯA RÕ — PO xác nhận.` |
| Current Branch | `main` tại `be5a5f4` (merge PR #140). Nhánh làm KTT-10b: CHƯA ĐẶT — PO đặt khi giao việc.` |
| Current Manifest | `docs/ai/tickets/KTT-10b.md` |
| Current State | `Hệ thống: đăng nhập/tài khoản, Quản lý mạng lưới, Dashboard động, Hàng tại KTT (Lưu thoát trong ngày).` |
| Technical Status | **Trạng thái kỹ thuật THẬT (routes, schema, tính năng) nằm ở [`docs/ai/00_SNAPSHOT.md`](../ai/00_SNAPSHOT.md) — đọc file đó, KHÔNG suy đoán từ file này.** |
| Runtime Status | `Chưa triển khai lên NAS (đích: Synology NAS, cổng 18060). Có bản thử trên máy PO dùng bản sao DB.` |
| PO UI Check Required | `Tuỳ theo ticket cụ thể — xem quy tắc ở PO_UI_ACCEPTANCE_WORKFLOW.md. KTT-10b: không (không đổi giao diện).` |
| Governance Version | `V2 Active — tích hợp song song với docs/ai/.` |
| Last Updated | `2026-10-27` |

## 3. Usage Rules

- Read this document after `README_AI.md` and `DEVELOPER_PROMPT_STANDARD.md` **để biết trạng thái QUY TRÌNH/TICKET** (không phải trạng thái kỹ thuật).
- **BẮT BUỘC đọc thêm [`docs/ai/00_SNAPSHOT.md`](../ai/00_SNAPSHOT.md) để biết trạng thái KỸ THUẬT thật** (API, schema, business rules, baseline dữ liệu) — file này KHÔNG chứa các thông tin đó, không được suy đoán.
- Do not infer current state from chat history when this snapshot is available.
- Do not use this document to override SSOT, frozen docs, or Product Owner decisions.
- `Claude Code` reads BOTH this document (process/ticket state) AND `docs/ai/00_SNAPSHOT.md` (technical state) — xem `CLAUDE.md` mục 3 để biết chi tiết 2 nguồn khác nhau.
- Nếu file này mâu thuẫn với `main` (ví dụ nhánh/ticket đã đổi) hoặc với manifest đang trỏ tới: dừng và báo, không tự chọn bên nào.

## 4. Continuation Notes

This snapshot is intentionally narrow — nó CHỈ trả lời câu hỏi về quy trình/ticket, KHÔNG
trả lời câu hỏi kỹ thuật (route nào có, schema thế nào, tính năng gì đã xây — những câu
đó thuộc về `docs/ai/00_SNAPSHOT.md`).

It exists to answer only the questions a fresh AI needs in order to continue:

- where the project is (process/ticket-wise)
- what ticket is active
- what comes next (xem `docs/ai/05_BACKLOG.md`)
- what branch is active
- what manifest governs the current reading scope

Manifest ticket: mỗi ticket có một file trong `docs/ai/tickets/<MÃ-TICKET>.md`. Manifest mô tả phạm vi,
điều cấm, các việc, tiêu chí kiểm tra và mẫu báo cáo; prompt cho Dev AI chỉ trỏ tới manifest và giữ dưới 250 từ.
Khi đổi ticket, cập nhật bảng mục 2 trong cùng commit.

Fresh-chat onboarding chain:

1. [README_AI.md](../../README_AI.md) — governance/process entry point
2. [docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md](DEVELOPER_PROMPT_STANDARD.md)
3. [docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md](PROJECT_SNAPSHOT.md) (file này) — process/ticket state
4. [docs/ai/00_SNAPSHOT.md](../ai/00_SNAPSHOT.md) — **technical state, BẮT BUỘC đọc, không được bỏ qua**
5. Manifest đang mở (`docs/ai/tickets/…`, theo trường `Current Manifest`). Khung prompt cho Dev AI: `docs/ai/prompts/`.

Tài liệu trạng thái cần đồng bộ với `main` (ticket DOCS riêng, mỗi file một commit): `docs/ai/00_SNAPSHOT.md` (mốc đồng bộ ghi `799c40b`, main đã đến `be5a5f4`), `docs/ai/05_BACKLOG.md` (cập nhật lần cuối 10/10), `docs/ai/CHANGELOG_AI.md` (cần kiểm mục KTT-9a, KTT-9b).
