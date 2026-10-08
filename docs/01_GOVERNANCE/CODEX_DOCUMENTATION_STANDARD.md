# CODEX DOCUMENTATION STANDARD

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Scope](#2-scope)
- [3. Reading Order](#3-reading-order)
- [4. Update Order](#4-update-order)
- [5. Stop Conditions](#5-stop-conditions)
- [6. SSOT Rule](#6-ssot-rule)
- [7. Git Handoff and Report Standard](#7-git-handoff-and-report-standard)

## 1. Purpose

This document standardizes how AI agents (Claude Code, Antigravity, or Codex) must read, update, and stop when working in **hue-dhcl**.

The goal is to make every session deterministic and safe by forcing the workflow to start from:

`README_AI.md` → `PROJECT_SNAPSHOT.md` → current `MANIFEST.md`

## 2. Scope

This standard applies to every ticket in **hue-dhcl**.

It defines:

- which documents AI reads first
- which documents AI may update
- when AI must stop and escalate
- how AI reports changes and hands Git over to the Product Owner

It does not change business rules, frozen architecture, runtime contracts, or PO approval rules.

## 3. Reading Order

AI must read in this order:

1. `README_AI.md`
2. `docs/01_GOVERNANCE/PROJECT_SNAPSHOT.md`
3. the current manifest referenced by `PROJECT_SNAPSHOT.md`
4. only the Required Reading listed in that manifest

AI must not:

- search random documents first
- expand reading scope without instruction
- skip the manifest
- infer missing state from memory or chat history

## 4. Update Order

AI may update only documents explicitly allowed by:

- the current manifest
- the active ticket scope

Update order:

1. identify the exact ticket
2. read `PROJECT_SNAPSHOT.md`
3. update the manifest status
4. update `PROJECT_SNAPSHOT.md` live state
5. hand over the exact file list and a proposed commit message; the Product Owner commits under the `One Ticket = One Commit` rule (AI never commits).

## 5. Stop Conditions

AI must stop and escalate when:
- business rules or requirements are ambiguous or contradictory
- frozen architecture documents would need to be modified
- `PO UI Check Required = Yes` and technical validation is completed (`READY FOR PO CHECK`)

## 6. SSOT Rule

Single Source of Truth (SSOT) documents must never be modified by AI without explicit Product Owner approval.

## 7. Git Handoff and Report Standard

AI never runs `git add`, commit, push, or merge. AI proposes a concise commit message (ticket ID, scope, status) and lists the exact files to add; the Product Owner alone runs `git add` (file by file), commit, push, and merge.
