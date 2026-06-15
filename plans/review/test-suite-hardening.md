---
iron_loop: true
approved_by: human
approved_at: "2026-06-15T00:00:00Z"
gate_crossed: "user-directed work order (CTO Chief authorized: 'build way more tests, e2e + security')"
title: "Test-Suite Hardening — e2e + CTOC-own-security + coverage deepening"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
program: ctoc-quality
order: 1
files:
  - "tests/**"
  - "src/hooks/**"
  - "src/lib/**"
  - "src/commands/**"
  - "src/areas/**"
  - "src/scripts/**"
  - "VERSION"
---

# Test-Suite Hardening — e2e + CTOC-own-security + coverage deepening

> Covering plan for a direct user work order. The USER (CTO Chief) commanded:
> "build way more tests, also e2e and security ... failing tests means updating
> the code not the tests." This plan declares the file scope so the PreToolUse
> enforcement hook permits the work, and records the governing discipline.

## 1. ASSESS — Problem Understanding

The suite has 1511 tests across 71 files, but coverage is uneven against CTOC's
real risk surface:
- **No end-to-end tests exist** — nothing spawns the actual menu/hook processes
  and asserts the full plan lifecycle + gate behavior at the process boundary.
- **CTOC's own security is under-tested.** `tests/security.test.js` covers the
  security-*scanning features* (SAST/secrets/dependency classes), NOT CTOC's own
  attack surface: human-gate bypass, enforcement evasion, path traversal in plan
  refs, frontmatter/YAML injection, escape-phrase false matches, shell-out
  injection.

## 2. ALIGN — Business Alignment

Goal: materially raise test count and rigor with two new categories — end-to-end
(process-level) and CTOC-own-security — and deepen unit coverage of the
safety-critical hooks and libs. Every new test asserts the intended CONTRACT, not
current behavior.

### The governing discipline (non-negotiable, from the work order)
**A failing test means the CODE is wrong, not the test.** New tests are written
against the contract (what the code SHOULD do). When one fails, fix the source.
Never weaken, skip, or delete a test to make it pass. Document each code fix.

## 3. CAPTURE — Acceptance Criteria

- New e2e tests spawn real processes (menu state machine, enforcement + gate
  hooks) against temp project fixtures and assert filesystem + output contracts.
- New security tests probe gate bypass, enforcement evasion, path traversal,
  frontmatter injection, escape-phrase boundaries, and shell-out safety.
- Every test has a meaningful assertion; error paths covered; no always-green.
- Bugs found are fixed in source; the full suite ends green (`# fail 0`).

## Execution Steps

- **Step 8 (TEST)**: author the new e2e + security + deepened unit tests.
- **Step 9 (PREPARE)**: temp-project fixtures + spawn helpers (cross-platform).
- **Step 10 (IMPLEMENT)**: fix every real bug the new tests surface in source.
- **Step 11 (REVIEW)**: self-review tests for always-green / mock-only patterns.
- **Step 12 (OPTIMIZE)**: de-duplicate fixtures; keep tests fast and hermetic.
- **Step 13 (SECURE)**: confirm the security tests actually fail on the
  vulnerable code path before the fix, and pass after.
- **Step 14 (VERIFY)**: lint, full suite green, 0 skipped, 0 flaky.
- **Step 15 (DOCUMENT)**: note each code fix in the commit message.
- **Step 16 (FINAL-REVIEW)**: user reviews at Gate 3.

## Decisions Taken Under Ambiguity

- This is a **covering plan** in `in-progress/` (not a Gate-crossed pipeline
  plan) because the work is a direct user order, not a vision-decomposed feature.
  It exists to make the file scope explicit to the enforcement hook. `in-progress/`
  is deliberately chosen: it is an enforcement-active stage (unblocks edits) but
  is NOT a human-gate destination (no revert interaction).
- Cross-platform: spawn helpers use `process.execPath` + `path.join`, temp dirs
  via `os.tmpdir()`, never bash entry points.
