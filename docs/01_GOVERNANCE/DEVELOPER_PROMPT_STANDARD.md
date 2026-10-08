# Lean Executor Prompt Standard

Filename updated to `DEVELOPER_PROMPT_STANDARD.md` per Product Owner standardisation. Default executors are `Antigravity` and `Claude Code`; `Codex` is legacy/non-default (see Section 13).

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Lean Prompt Rule](#2-lean-prompt-rule)
- [2.1 First-Prompt Governance Gate](#21-first-prompt-governance-gate)
- [3. Active-Ticket Delta Prompt Rule](#3-active-ticket-delta-prompt-rule)
- [Single-defect remediation](#single-defect-remediation)
- [Workspace Hygiene](#workspace-hygiene)
- [4. Validation Levels](#4-validation-levels)
- [5. Mandatory Handoff](#5-mandatory-handoff)
- [6. Active Manifest Readiness Gate](#6-active-manifest-readiness-gate)
- [7. Post-Onboarding Behavior](#7-post-onboarding-behavior)
- [8. Minimal Default Template](#8-minimal-default-template)
- [9. Output Standard](#9-output-standard)
- [10. Technical Validation vs PO UI Acceptance](#10-technical-validation-vs-po-ui-acceptance)
- [11. Additional PO/User Decision Rule](#11-additional-pouser-decision-rule)
- [12. Conversation Context Capacity and Fresh-Chat Handoff](#12-conversation-context-capacity-and-fresh-chat-handoff)
- [13. Executor Selection Rule](#13-executor-selection-rule)
- [13.1 Claude Code Model Selection](#131-claude-code-model-selection)
- [14. Two Reporting Channels](#14-two-reporting-channels)

## 1. Purpose

This document defines the lean execution prompt standard that ChatGPT coordination must use after onboarding PASS.

The repository already owns the authoritative onboarding chain and the manifest-specific working context. Execution prompts should stay concise and avoid repeating repository state that is already stored in governance documents.

## 2. Lean Prompt Rule

When the executor has access to the repository, the generated prompt must normally stay concise and avoid duplicating authoritative repository content.

The prompt should usually include only:

- Project
- Active ticket
- Instruction to read the repository onboarding chain
- Ticket objective
- Any Product Owner or user decision not yet stored in the repository
- Scope restriction
- Required completion and handoff instruction
- Ticket-consistency guard when the generated prompt ticket differs from `PROJECT_SNAPSHOT.md`

The prompt must not duplicate:

- Required Reading URLs already listed in the active manifest
- business context already defined in the manifest
- technical file lists already defined in the manifest
- standard Governance rules
- standard Git handoff, documentation, PO, or handoff instructions
- repository state already owned by `PROJECT_SNAPSHOT.md`

The active manifest remains responsible for detailed scope, Required Reading, validation, PO acceptance requirements, documents to update, and next-ticket handoff.

If the ticket named in the generated prompt does not match the Current Ticket in `PROJECT_SNAPSHOT.md`, the executor must stop and report the conflict instead of choosing either ticket by assumption.

## 2.1 First-Prompt Governance Gate

In every new AI/chat session, `README_AI.md` must route the AI to this Prompt Standard before the first execution prompt is written.

Until this Prompt Standard has been read, the AI must not write either `Prompt cho Claude Code` or `Prompt cho Antigravity`.

The first execution prompt for Claude Code or Antigravity defaults to one independently verifiable defect or objective, delta-only scope, and fewer than `250` words unless a Governance-approved exception applies.

The first execution prompt must not repeat Manifest content, SSOT text, ticket history, standard workflow instructions, or repository-owned guidance already available through onboarding.

Executor selection is two-layer, and the model is not interchangeable across executors — see Section 13 for the full, authoritative pairing:

- `Executor`: `Antigravity` (model fixed: `Gemini`) or `Claude Code` (model: `Sonnet` or `Opus`)
- the prompt must state the resulting pairing explicitly: `Antigravity (Gemini)`, `Claude Code (Sonnet)`, or `Claude Code (Opus)`

`Codex` is no longer the default executor and must not be selected unless the Product Owner explicitly authorizes it for a specific ticket. Historical Codex tickets, checkpoints, and manifests remain valid records and must not be rewritten.

## 3. Active-Ticket Delta Prompt Rule

Active-ticket follow-up prompts must describe only the new defect, delta, or decision.

They must not repeat:

- the manifest
- SSOT text
- ticket history
- accepted evidence
- standard handoff workflow
- existing file lists
- repository-owned validation requirements already available through onboarding

Each active-ticket follow-up prompt must identify only:

- affected component, file, service, or UI area
- direct authority or accepted decision for the delta
- expected observable result
- explicit exclusions
- validation level

Local defects default to `LEVEL 1` validation.

Escalation above `LEVEL 1` requires a one-sentence justification in the prompt.

Start at named files, services, components, or tests; expand only when evidence requires it; and stop once root cause and affected boundary are confirmed.

Required workflow:

`Khoanh vùng → đọc tối thiểu → xác minh nguyên nhân → sửa đúng chỗ → test đúng phạm vi → dừng.`

The under-250-word default remains mandatory unless a documented exception applies.

## Single-defect remediation

When the Product Owner reports multiple independent defects, each remediation prompt must handle only one independently verifiable defect.

Do not mix frontend, backend, native runtime, or business logic unless evidence proves one shared root cause and the same correction point. Multiple symptoms may be grouped only when that shared root cause is proven.

Choose the executor by defect boundary:

- Claude Code (Sonnet for bounded work, Opus for complex/cross-module planning): logic, backend, frontend, data, local/bounded discovery, tests, contracts, and documentation; prepares the Git handoff but never commits or pushes.
- Antigravity (Gemini, fixed): UI/UX, visual polish, and real-machine Windows runtime inspection (browser, process, HWND, and OS integration).

Each executor must report root cause, changed scope, files for the PO to commit, tests, and targeted evidence.

The Product Owner must confirm the current defect `PASS` before the next defect begins. Remaining defects stay recorded in the checkpoint and must not be inserted into an executor prompt already running.

Prefer small delta-only prompts and avoid repeating repository-wide instructions.

## Workspace Hygiene

Use only the canonical project workspace unless the Product Owner explicitly authorizes a different path:

`D:\Dev\hue-dhcl`

Do not create, reuse, or switch into sibling clone/worktree/folder workspaces to bypass a dirty, locked, stale, or wrong-branch canonical workspace.

If the canonical workspace is dirty, locked, missing, inaccessible, or on the wrong branch for the requested task, stop and report the exact blocker. Do not create another workspace as a workaround.

## 4. Validation Levels

`LEVEL 1 - Targeted Checks`

- Default for active-ticket local defects and deltas.
- Read only directly affected files/components and immediate contracts needed to confirm root cause.
- Run focused unit, API, database, or component checks that prove the fix.
- Do not run broad module, release, browser, or repository-wide validation unless evidence requires escalation.

`LEVEL 2 - Module Regression`

- Use when the defect can affect a module contract, shared service, API surface, or repeated workflow.
- Include focused checks plus relevant module regression tests.
- Escalation from `LEVEL 1` requires one-sentence justification.

`LEVEL 3 - Handoff / Release Validation`

- Use for ticket closure, PO handoff, release readiness, governance state transitions, or high-risk cross-module changes.
- Include focused checks, module regressions, build/lint where applicable, runtime/API/database proof where required, and handoff evidence.
- Escalation from `LEVEL 1` or `LEVEL 2` requires one-sentence justification.

## 5. Mandatory Handoff

The executor must perform all applicable actions before reporting completion:

- update the current ticket document and manifest status
- record validation and PO status
- close related PO findings when authorized
- identify the next ticket from the current manifest or roadmap
- create the next manifest if it does not exist
- update `PROJECT_SNAPSHOT.md`
- review whether `CLAUDE.md` needs an update when this ticket changes governance workflow, executor roles, or model rules
- list the exact files for the PO to `git add` one by one and propose the commit message (One Ticket = One Commit)
- do NOT `git add`, commit, push, or merge — the Product Owner alone runs `git add` (file by file), commit, push, and merge

## 6. Active Manifest Readiness Gate

Before activating a next ticket, the executor must inspect the proposed manifest even when the file already exists.

A manifest is not valid merely because:

- its file exists
- it is registered in a document index
- `PROJECT_SNAPSHOT` points to it
- its ticket name matches the roadmap

The executor must migrate an existing manifest before activation when it:

- was created under an older Governance standard
- contains pointer-activation scope instead of actual ticket scope
- duplicates stale mutable state
- lacks sufficient Required Reading
- lacks implementation authority
- lacks an explicit authoritative blocker state
- cannot support automatic prompt generation

Readiness before activation:

- describes the actual active ticket
- contains sufficient implementation authority or an explicit blocker state
- contains concrete, accessible GitHub Blob URLs
- references authoritative business-rule sources
- defines In Scope and Out of Scope
- defines technical, runtime, testing, documentation, PO, completion, and handoff requirements
- identifies the next ticket from an authoritative roadmap
- does not require repository searching, guessing, or user clarification
- passes fresh onboarding validation

Mutable live state ownership:

- `PROJECT_SNAPSHOT.md` exclusively owns mutable current project state, including Current Phase, Current Ticket, Current Manifest, Current Branch, current PO Status, and live next-ticket routing
- manifest templates must reference `PROJECT_SNAPSHOT.md` for mutable live state
- historical commit evidence may remain only when clearly identified as immutable implementation or validation evidence

## 7. Post-Onboarding Behavior

After reading `README_AI.md` → `DEVELOPER_PROMPT_STANDARD.md` → `PROJECT_SNAPSHOT.md` → current manifest → Required Reading:

- the AI is onboarded
- the AI may begin work on the active ticket as scoped by the manifest
- the AI must not re-read the full onboarding chain in subsequent turns unless context is lost or a fresh session starts
- the AI must not expand scope beyond what the manifest authorizes
- if no active ticket exists, the AI must report "No active ticket" and stop

## 8. Minimal Default Template

When ChatGPT/CTO generates a prompt for an executor, the minimal default template is:

```
Project: hue-dhcl
Ticket: [TICKET-ID]
Executor: [Antigravity (Gemini) | Claude Code (Sonnet) | Claude Code (Opus)]

Start by reading the onboarding chain:
README_AI.md → PROJECT_SNAPSHOT.md → Current Manifest

Objective: [one-sentence ticket objective]

Scope: [delta-only description of what to do]

Exclusions: [what must NOT be touched]

Validation: LEVEL [1|2|3]

Completion: [handoff instruction]
```

The template must not exceed 250 words unless an explicit Governance exception applies.

## 9. Output Standard

Every executor output must include:

- **Root Cause** (if applicable): what was found
- **Changed Scope**: exact files, modules, or components modified
- **Git Handoff**: files to add (one by one) and proposed commit message — no commit hash; executors do not commit
- **Tests**: which tests were run and results
- **Targeted Evidence**: screenshots, logs, API responses, or runtime proof
- **PO UI Check**: `Required: Yes/No` with justification
- **Status**: `IMPLEMENTED` / `READY FOR PO CHECK` / `BLOCKED` / `FAILED`

The executor must not declare `PO PASS` or `Module Completed` — only `READY FOR PO CHECK` when UI changes are involved.

## 10. Technical Validation vs PO UI Acceptance

These are distinct and non-interchangeable:

- **Technical PASS**: code compiles, tests pass, no lint errors, API contracts satisfied, database integrity confirmed. Owned by the executor.
- **Runtime PASS**: the feature runs correctly in the target environment. Owned by the executor.
- **API Contract PASS**: endpoints return correct data shapes and status codes. Owned by the executor.
- **PO PASS**: Product Owner manually reviewed the visible product and confirmed it meets business acceptance criteria. Owned exclusively by the Product Owner.

An executor achieving Technical PASS + Runtime PASS does **not** imply PO PASS. The executor must stop at `READY FOR PO CHECK` and provide a PO verification checklist.

## 11. Additional PO/User Decision Rule

When the executor encounters any of the following during implementation, it must stop and escalate to the Product Owner via ChatGPT/CTO:

- ambiguous or contradictory business requirements
- a design choice that could affect user-facing behavior
- a data migration that could alter production data
- a change that would break backward compatibility
- a scope expansion beyond what the manifest authorizes
- a conflict between two authoritative documents

The executor must not resolve these by assumption. It must document the exact question, the options considered, and the impact of each option, then wait for PO direction.

## 12. Conversation Context Capacity and Fresh-Chat Handoff

When a conversation reaches context capacity or a fresh chat session begins:

1. The new session must start from `README_AI.md` (or `CLAUDE.md` for Claude Code).
2. The AI must read `PROJECT_SNAPSHOT.md` to recover the current ticket, phase, branch, and manifest.
3. The AI must read the current manifest and its Required Reading.
4. The AI must not rely on prior chat history as a source of truth — repository documents are authoritative.
5. If `PROJECT_SNAPSHOT.md` is stale or contradicts the manifest, the AI must report the conflict and stop.

ChatGPT/CTO must ensure `PROJECT_SNAPSHOT.md` is always up-to-date before ending a session, so fresh-chat handoff is seamless.

## 13. Executor Selection Rule

Executors and models are fixed pairings:
- **Antigravity (Gemini)**: UI/UX, visual polish, Windows runtime.
- **Claude Code (Sonnet)**: Logic, backend, bounded discovery, tests, documentation, Git handoff (no commit/push).
- **Claude Code (Opus)**: Architecture, cross-module planning, complex defects.

Invalid pairings (e.g. `Antigravity–Sonnet`, `Claude Code–Gemini`) must not be used.

## 14. Two Reporting Channels

1. **ChatGPT/CTO → PO**: Management, no-code, 3-part format.
2. **Executors → ChatGPT/CTO**: Technical Execution Report with full technical detail, logs, and the Git handoff (files + proposed commit message).
