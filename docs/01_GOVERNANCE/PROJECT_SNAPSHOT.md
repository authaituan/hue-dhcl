# PROJECT SNAPSHOT

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Current Snapshot](#2-current-snapshot)
- [3. Usage Rules](#3-usage-rules)
- [4. Continuation Notes](#4-continuation-notes)

## 1. Purpose

This document is the Governance V2 **PROCESS/TICKET** current-state snapshot for AI onboarding in **hue-dhcl**. It answers "what ticket/phase is active in the Governance V2 workflow" — it does **NOT** duplicate technical project facts (API routes, DB schema, features, baseline data). For those, see `docs/ai/00_SNAPSHOT.md` (mục 2 dưới đây giải thích rõ).

It is designed to be the shortest safe entry point for a new AI session while preserving continuity with the existing repository workflow.

## 2. Current Snapshot

| Field | Value |
| --- | --- |
| Current Phase | `Khởi tạo project (NEWPROJ-1) — dựng khung từ it-assets v1.0.0.` |
| Current Ticket | `NEWPROJ-2 — công cụ nạp DB ban đầu + sửa câu chữ governance (chờ PO nghiệm thu).` Backlog: `docs/ai/05_BACKLOG.md`. |
| Next Ticket | `Chưa có — PO quyết định.` |
| Last PO Status | `Chờ nghiệm thu NEWPROJ-1, NEWPROJ-2.` |
| Current Branch | `main` (chưa có commit, chưa có remote) |
| Current Manifest | `KHÔNG có manifest ticket nào đang áp dụng.` |
| Current State | `Khung project: Dashboard động, Quản lý mạng lưới (danh sách), Quản lý người dùng.` |
| Technical Status | **Trạng thái kỹ thuật THẬT (routes, schema, tính năng) nằm ở [`docs/ai/00_SNAPSHOT.md`](../ai/00_SNAPSHOT.md) — đọc file đó, KHÔNG suy đoán từ file này.** |
| Runtime Status | `Chưa triển khai. DB mới, chưa có dữ liệu mạng lưới (PO nạp qua Import Mạng Lưới).` |
| PO UI Check Required | `Tuỳ theo ticket cụ thể — xem quy tắc ở PO_UI_ACCEPTANCE_WORKFLOW.md.` |
| Governance Version | `V2 Active — tích hợp song song với docs/ai/ (kế thừa từ it-assets v1.0.0).` |
| Last Updated | `2026-10-08` |

## 3. Usage Rules

- Read this document immediately after `README_AI.md` **để biết trạng thái QUY TRÌNH/TICKET** (không phải trạng thái kỹ thuật).
- **BẮT BUỘC đọc thêm [`docs/ai/00_SNAPSHOT.md`](../ai/00_SNAPSHOT.md) để biết trạng thái KỸ THUẬT thật** (API, schema, business rules, baseline dữ liệu) — file này KHÔNG chứa các thông tin đó, không được suy đoán.
- Do not infer current state from chat history when this snapshot is available.
- Do not use this document to override SSOT, frozen docs, or Product Owner decisions.
- `Claude Code` reads BOTH this document (process/ticket state) AND `docs/ai/00_SNAPSHOT.md` (technical state) — xem `CLAUDE.md` mục 3 để biết chi tiết 2 nguồn khác nhau.

## 4. Continuation Notes

This snapshot is intentionally narrow — nó CHỈ trả lời câu hỏi về quy trình/ticket, KHÔNG
trả lời câu hỏi kỹ thuật (route nào có, schema thế nào, tính năng gì đã xây — những câu
đó thuộc về `docs/ai/00_SNAPSHOT.md`).

It exists to answer only the questions a fresh AI needs in order to continue:

- where the project is (process/ticket-wise)
- what ticket is active
- what comes next (xem `docs/ai/05_BACKLOG.md`)
- what branch is active
- what manifest governs the current reading scope (hiện tại: không có manifest nào)

Fresh-chat onboarding chain:

1. [README_AI.md](../../README_AI.md) — governance/process entry point
2. [docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md](DEVELOPER_PROMPT_STANDARD.md)
3. [docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md](PROJECT_SNAPSHOT.md) (file này) — process/ticket state
4. [docs/ai/00_SNAPSHOT.md](../ai/00_SNAPSHOT.md) — **technical state, BẮT BUỘC đọc, không được bỏ qua**
5. Current Manifest (nếu có — hiện tại chưa dùng manifest ticket). Khung prompt cho Dev AI: `docs/ai/prompts/`.
