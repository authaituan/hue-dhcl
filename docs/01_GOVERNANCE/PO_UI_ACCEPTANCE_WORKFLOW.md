# PO UI Acceptance Workflow

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Applicability Decision](#2-applicability-decision)
- [3. Workflow](#3-workflow)
- [4. PO UI Acceptance Notice](#4-po-ui-acceptance-notice)
- [5. PO Result Definitions](#5-po-result-definitions)
- [6. Module Completion Rules](#6-module-completion-rules)
- [7. PO Findings Traceability](#7-po-findings-traceability)
- [8. Blocking Rules](#8-blocking-rules)
- [9. Authority](#9-authority)

## 1. Purpose

This document defines the mandatory Product Owner UI acceptance workflow for tickets that produce visible, independently checkable product changes.

It exists to separate:

- Technical PASS
- Runtime PASS
- API Contract PASS
- PO Product Review PASS
- Module Completed

## 2. Applicability Decision

Every development ticket must explicitly state:

- `PO UI Check Required: Yes`
- or `PO UI Check Required: No`

Decision reason:

- a concise explanation of why the ticket does or does not produce an independently observable UI or product behavior change

Set `Yes` when the ticket affects any visible UI, navigation, screen, chart, table, filter, drill-down, workflow, label, report, runtime data display, or other user-facing behavior.

Set `No` only when the ticket is purely internal and produces no independently checkable user-visible change.

## 3. Workflow

### 3.1 When PO UI Check Required = Yes

Required completion sequence:

Technical PASS

→

Runtime PASS or API Contract PASS where applicable

→

Ready for PO Check

→

Product Owner manual review

→

PO PASS / WARNING / FAIL

→

Review

→

Documentation Synchronization

→

Module Completed or Recovery

### 3.2 When PO UI Check Required = No

Required completion sequence:

Technical PASS

→

Runtime PASS or Runtime Not Required

→

PO UI Check Required: No

→

Review

→

Documentation Synchronization

→

Module Completed

## 4. PO UI Acceptance Notice

When `PO UI Check Required = Yes`, the executor (Claude Code or Antigravity) must include a clearly visible section titled:

`PO UI ACCEPTANCE REQUIRED`

The section must include:

- PO Check Status
- Affected Module
- Affected Screen
- Menu Path / Navigation Path
- Route / URL
- Required Test Context
- What Changed (visible behavior summary)
- Concise Step-by-Step Verification Checklist for PO

## 5. PO Result Definitions

- **PO PASS**: Product Owner reviewed visible UI/UX and confirmed it meets acceptance criteria.
- **PO WARNING**: Non-blocking visual/UX issue identified; documented for follow-up.
- **PO FAIL**: Acceptance criteria not met; ticket stays open for remediation.

## 6. Module Completion Rules

A user-facing module or feature is completed only after receiving PO PASS.

Technical PASS alone does not qualify a module as complete. The completion sequence is:

1. Executor delivers implementation with Technical PASS.
2. If `PO UI Check Required = Yes`, executor stops at `READY FOR PO CHECK`.
3. Product Owner performs manual review.
4. PO PASS → Documentation Synchronization → Module Completed.
5. PO FAIL → Remediation ticket → return to step 1.

## 7. PO Findings Traceability

Every PO finding (PASS, WARNING, or FAIL) must be recorded in the active ticket's checkpoint or manifest with:

- **Finding ID**: sequential identifier (e.g. `PO-FINDING-001`)
- **Date**: when the PO reported the finding
- **Severity**: PASS / WARNING / FAIL
- **Description**: what the PO observed
- **Affected Module / Screen**: where the finding applies
- **Resolution**: how it was addressed (or "Pending")
- **Resolution Date**: when it was resolved

PO findings must not be deleted or overwritten. Resolved findings are marked as closed, not removed.

When a remediation is applied, the executor must reference the original Finding ID in the proposed commit message and checkpoint update (the PO commits).

## 8. Blocking Rules

The following conditions block ticket completion:

- Any `PO FAIL` that has not been remediated and re-reviewed.
- Any `PO WARNING` that the Product Owner has explicitly marked as blocking.
- Missing or stale `PROJECT_SNAPSHOT.md` update.
- Change not yet committed and pushed by the Product Owner.
- Failed automated tests relevant to the ticket scope.
- Missing documentation synchronization (manifest, snapshot, checkpoint).

A ticket with an outstanding blocker must not be closed or advanced to the next ticket.

The executor must report all blockers clearly in the Technical Execution Report and wait for resolution before proceeding.

## 9. Authority

- The Product Owner is the sole authority for PO PASS / PO FAIL decisions.
- ChatGPT/CTO may recommend but must not override PO decisions.
- Executors (Claude Code, Antigravity) must not self-declare PO PASS under any circumstances.
- This workflow is mandatory for all tickets where `PO UI Check Required = Yes`.
- Exceptions to this workflow require explicit, documented Product Owner authorization.
