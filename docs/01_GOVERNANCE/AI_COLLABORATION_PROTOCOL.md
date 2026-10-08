# AI COLLABORATION PROTOCOL

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Roles](#2-roles)
- [3. Standard Workflow](#3-standard-workflow)
- [4. Development Workflow](#4-development-workflow)
- [5. Review Workflow](#5-review-workflow)
- [6. Ticket Rules](#6-ticket-rules)
- [7. Architecture Protection Rules](#7-architecture-protection-rules)
- [8. Runtime Rules](#8-runtime-rules)
- [9. Context Rules](#9-context-rules)
- [10. Communication Rules](#10-communication-rules)
- [11. Handover Rules](#11-handover-rules)
- [12. Golden Rules](#12-golden-rules)
- [13. Ticket Completion Protocol](#13-ticket-completion-protocol)
- [14. Prompt Standard](#14-prompt-standard)
- [15. Product Owner to ChatGPT Collaboration Workflow](#15-product-owner-to-chatgpt-collaboration-workflow)
- [16. PO UI Acceptance Gate](#16-po-ui-acceptance-gate)

## 1. Purpose

AI Collaboration Protocol defines how Product Owner, ChatGPT (CTO), Antigravity, and Claude Code work together across the full lifecycle of **hue-dhcl**. `Codex` is preserved below as a legacy/non-default role for historical continuity; see Section 2 for current default executors.

Purpose:

- keep decisions consistent
- preserve SSOT and frozen architecture
- prevent scope drift
- ensure ticket-by-ticket execution
- maintain continuity across handovers

## 2. Roles

### Product Owner

- decides business direction
- approves or rejects proposals
- prioritizes roadmap
- freezes business decisions
- gives final acceptance

### ChatGPT

- CTO / Coordinator / Technical Decision Authority
- Chief Solution Architect
- Product Architect
- Business Architect
- Technical Auditor
- Reviewer
- Designer
- Coordinator

ChatGPT responsibilities:

- preserve project context
- translate PO intent into structured requirements
- review architecture, UX, and technical consistency
- identify gaps, risks, and technical debt
- ensure continuity for new sessions
- choose the executor (`Antigravity` or `Claude Code`) and the model (`Sonnet` or `Opus`)
- ask the Product Owner only for business rules, product behavior, SSOT, acceptance criteria, or product direction; decide purely technical choices without escalation

### Claude Code

- Implementation Engineer
- executes only approved tickets
- owns implementation, backend, data, tests, and documentation; prepares the Git handoff (exact files + proposed commit message) but does NOT `git add`, commit, or push — the Product Owner alone runs `git add` (file by file), commit, push, and merge
- does not change architecture by itself
- does not change business by itself
- does not invent new scope
- reports to ChatGPT/CTO using the Technical Execution Report (`docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md` Section 14.2); never writes the Product Owner-facing three-part format or a prompt for another executor as its own report

### Antigravity

- Discovery and UI/UX Engineer
- owns discovery, UI/UX implementation, and Windows runtime (PID, HWND, process, log) verification
- executes only approved tickets
- does not change backend logic, APIs, schemas, KPI formulas, SSOT, or business rules
- reports to ChatGPT/CTO using the Technical Execution Report (`docs/01_GOVERNANCE/DEVELOPER_PROMPT_STANDARD.md` Section 14.2); never writes the Product Owner-facing three-part format or a prompt for another executor as its own report

### Codex (Legacy / Non-Default)

- Implementation Engineer
- no longer the default executor; may be dispatched only with explicit Product Owner authorization for a specific ticket
- historical Codex tickets, checkpoints, and manifests remain valid records and must not be rewritten
- when dispatched, follows the same constraints as Claude Code: does not change architecture or business by itself, does not invent new scope, reports using the same Technical Execution Report

## 3. Standard Workflow

Business Discussion

↓

Architecture

↓

UX

↓

Technical Planning

↓

Development

↓

Review

↓

Next Ticket

This workflow is sequential and must not be bypassed unless the Product Owner explicitly changes the process.

## 4. Development Workflow

Each feature / module must be delivered in the following order:

Shell / Core Structure

↓

Components / UI

↓

Runtime / Integration

↓

Review PASS

↓

Next Feature / Module

Rules:

- Shell establishes structure and orchestration
- Components add the visual and component layer
- Runtime binds live data and context
- Review confirms readiness before moving forward

## 5. Review Workflow

ChatGPT reviews:

- Architecture
- Runtime
- UX
- Context Propagation
- Technical Debt
- PASS / WARNING / FAIL

Claude Code and Antigravity must not self-declare PASS for the project lifecycle unless the accepted runtime and review evidence support it.

Review principle:

- PO owns final acceptance
- ChatGPT owns structured review
- Claude Code and Antigravity own implementation evidence within their respective scope

## 6. Ticket Rules

Every ticket must include:

- Goal
- Scope
- Runtime Acceptance
- Risk
- Git Handoff (exact files for the PO to `git add` one by one + proposed commit message; the PO commits and pushes)

Additional rules:

- One Bug = One Ticket = One Commit
- no hidden scope expansion
- no unrelated refactor
- no cross-module rewriting
- keep ticket boundaries strict

## 7. Architecture Protection Rules

The following must not be changed without explicit Product Owner approval:

- SSOT
- Information Architecture
- Core Database Schema
- API Contracts
- Design System
- Business Rules

If a change affects frozen architecture, it must be treated as a decision item, not a code convenience.

## 8. Runtime Rules

- UI Components do not execute raw database mutations directly
- UI Components receive data and dispatch actions through defined service layers
- Runtime logic lives in designated backend controllers and orchestrators

## 9. Context Rules

- Every AI session must verify live state from `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md`.
- Chat history is auxiliary; repository documents are authoritative.

## 10. Communication Rules

- ChatGPT / CTO communicates to PO in concise, management, no-code language (3-part format).
- Executors report to ChatGPT / CTO with full technical evidence and logs.

## 11. Handover Rules

- Every completed ticket updates `PROJECT_SNAPSHOT.md` and appends progress.
- The PO commits under `One Ticket = One Commit`, following the CTO's step-by-step Git instructions.
- Only the PO pushes to the remote and merges; executors never push.

## 12. Golden Rules

1. Never bypass PO approval for architecture or business rule changes.
2. Never skip reading order.
3. Stop at `READY FOR PO CHECK` when visible UI changes require PO review.
4. Executors never `git add`, commit, push, merge, create remotes, or `git reset --hard`; the Product Owner alone runs `git add` (file by file), commit, push, and merge.

## 13. Ticket Completion Protocol

A ticket is complete only when implementation, tests, documentation, and validation steps pass and the Product Owner has committed and pushed the change.

## 14. Prompt Standard

CTO uses [DEVELOPER_PROMPT_STANDARD.md](DEVELOPER_PROMPT_STANDARD.md) for generating executor prompts.

## 15. Product Owner to ChatGPT Collaboration Workflow

PO provides business goals -> ChatGPT analyzes, creates plan, obtains PO approval -> ChatGPT writes prompt -> Executor implements -> ChatGPT reviews -> PO accepts.

## 16. PO UI Acceptance Gate

UI changes require explicit PO review as defined in [PO_UI_ACCEPTANCE_WORKFLOW.md](PO_UI_ACCEPTANCE_WORKFLOW.md).
