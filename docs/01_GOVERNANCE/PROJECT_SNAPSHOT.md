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
| Current Phase | `Đóng dự án (KTT-CLOSE-1, 26/11/2026). Module «Hàng tại KTT» (Trung tâm Khai thác, POS 530100) đã vào main đến PR #180: 7 tab Tổng quan, Lưu thoát trong ngày, A · Hàng đến, B · Tỷ lệ đi cùng ngày, B · Lịch xe / đường thư, Đối chiếu BCVH, Hướng đóng chuyến nội tỉnh (src/components/ktt/KttView.jsx:14-22; tab cuối do KTT-DC-1…DC-6d).` |
| Current Ticket | `Không có ticket mở (đóng dự án). KTT-CLOSE-1 chỉ cập nhật tài liệu (nhánh docs/ktt-close-1), xong khi PO commit.` |
| Next Ticket | `Không có. Nợ còn lại ở docs/ai/05_BACKLOG.md mục 22–29 (nợ riêng của tab Hướng đóng chuyến nội tỉnh, thứ tự 6 BCVH chép tay, thiếu mục CHANGELOG); PO quyết có mở ticket nào không.` |
| Last PO Status | `26/11/2026: PR #176–#180 (KTT-DC-5, DC-5c, DC-6, DC-6c, DC-6d) đã merge, main d838101. Dòng «cao thứ k trong n ngày»: PO giữ «30 ngày», không đổi sang 29 như canvas (04_DECISIONS.md #129 mục 4). PO nghiệm thu bằng mắt DC-6c / DC-6d và kiểm độc lập của hai ticket này: CHƯA RÕ — PO xác nhận. Trạng thái PO cũ hơn (KTT-9a/9b, KTT-10b/10c…): xem docs/ai/CHANGELOG_AI.md, repo không ghi lại lần nghiệm thu.` |
| Current Branch | `main tại d838101 (merge PR #180). Nhánh tài liệu docs/ktt-close-1 (từ d838101), chưa commit.` |
| Current Manifest | `Không có (đóng dự án). Ticket KTT-CLOSE-1 nằm ở thư mục chưa theo dõi «Claude outputs/»; manifest gần nhất trong repo: docs/ai/tickets/KTT-KD-1.md.` |
| Current State | `Hệ thống: đăng nhập/tài khoản (5 vai trò), Quản lý mạng lưới, Dashboard động, Sản lượng đến, Xử lý và tỷ lệ phát, Nạp dữ liệu nguồn, Hàng tại KTT (7 tab). Kiểm 26/11/2026 trên d838101: npm test 1435 ca (1425 pass, 0 fail, 10 skip), npm run build mã thoát 0.` |
| Technical Status | **Trạng thái kỹ thuật THẬT (routes, schema, tính năng) nằm ở [`docs/ai/00_SNAPSHOT.md`](../ai/00_SNAPSHOT.md) — đọc file đó, KHÔNG suy đoán từ file này.** |
| Runtime Status | `NAS Synology, cổng 18060: quy trình ở docs/ai/06_DEPLOYMENT.md mục 6 và docs/ai/20_NAS_HUONG_DAN_CHAY.md. Repo KHÔNG ghi NAS đang chạy bản nào hay đã golive lên main hiện tại chưa: 20_… tự gọi là bản demo, còn mục «Chưa kiểm chứng» (build prebuilt, vân tay SFTP, TZ, WAL trên volume), chưa có sao lưu định kỳ / HTTPS (20_…:3-4, :78-82); ticket GOLIVE-0 (31/10/2026, ngoài docs: Claude outputs/GOLIVE-0-ra-soat-toan-du-an.md:6) ghi «NAS đang chạy bản KTT-10d». Bản đang chạy trên NAS, golive d838101 đã làm chưa, nạp danh sách hàng hoàn (ItemReturn) trước golive: PO xác nhận.` |
| PO UI Check Required | `Tuỳ theo ticket cụ thể — xem quy tắc ở PO_UI_ACCEPTANCE_WORKFLOW.md. KTT-CLOSE-1: không (chỉ tài liệu).` |
| Governance Version | `V2 Active — tích hợp song song với docs/ai/.` |
| Last Updated | `2026-11-26` |

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

Tài liệu trạng thái (đồng bộ ở KTT-CLOSE-1, 26/11/2026, main `d838101`): `docs/ai/00_SNAPSHOT.md` (mốc đồng bộ `d838101`; chỉ các hàng KTT của tab Hướng đóng chuyến, mục Kiểm thử và mục nợ được rà; các hàng KTT khác vẫn ghi theo ticket cũ, một số ghi «chưa giao diện» dù đã có tab — chưa rà), `docs/ai/05_BACKLOG.md` (mục 22–29 là nợ khi đóng dự án; mục 1–21 chưa rà lại), `docs/ai/CHANGELOG_AI.md` (có mục KTT-CLOSE-1 ở đầu; chưa có mục riêng cho KTT-9a, KTT-9b, KTT-10d, KTT-DC-4, DC-6, DC-6c, DC-6d — grep `^## ` ngày 26/11/2026).
