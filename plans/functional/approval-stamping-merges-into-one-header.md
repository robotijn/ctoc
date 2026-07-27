# Functional Plan: Approval stamping merges into one header, and the corrupted plans are repaired

> Created: 2026-07-27
> Status: Draft
> Author: CTO Chief (surfaced by the review-backlog rework sweep)

---

## 1. ASSESS - Problem Understanding

### Context
When a batch of plans is approved at a human gate at once (the batch approval path
in `src/lib/actions.js` — `approveSubplans` looping the gate-safe `approvePlan`),
the `approved_by: human` marker is written by **prepending a fresh `---` frontmatter
block** to the plan file instead of merging the marker into the plan's existing
frontmatter block. Each approval stacks another block. `src/lib/frontmatter.js`
(`parseFrontmatter`) reads **only the first `---…---` block**, which after stamping
contains only the approval marker — so the plan's real `title`, `files:`, and
`depends_on`, which now sit in the second or third block, become invisible to the
tooling.

### Current State (verified, not asserted)
Reproduced on disk during the rework sweep: `plans/review/00078`, `00090`, `00097`
each carry two-to-four stacked `---` blocks; the review-plan reworkers additionally
flagged `00088`, `00098`, `00121`, `00124`, `00156`, `00158` — roughly nine plans.
Every one still reads as `approved_by: human` (the first block), so no gate catches
it, while its `files:` declaration is unreadable.

### Impact
- The pre-tool enforcement hook derives write-coverage from a plan's `files:`
  (`src/hooks/PreToolUse.Edit.js` → `plan-coverage.js`). For a corrupted plan that
  set is empty, so if it ever enters the build it grants no coverage and the
  implementer is blocked or falls through to escape-phrase handling.
- `depends_on` ordering is broken for those plans (the scheduler cannot read it).
- The plans render untitled on the dashboard.
- It **recurs on every batch approval** — this is a live defect in the approval
  path, not a one-off.

---

## 2. ALIGN - Business Alignment

### Goal
The human gate approval writes its marker **without destroying the machine-readable
frontmatter it is stamping**, and the plans already corrupted are repaired, with
every approval marker's data preserved byte-for-byte.

### Success Metrics
- [ ] Stamping an approval **merges** `approved_by`/`approved_at`/`gate_crossed`
      into the plan's single existing frontmatter block; approving twice never
      creates a second block (idempotent).
- [ ] A one-time migration collapses the stacked blocks on every affected existing
      plan, preserving all marker fields and the real `title`/`files:`/`depends_on`.
- [ ] A regression test: after a (double) approval, `parseFrontmatter` returns the
      real `title`, `files:`, and `depends_on` — proving they survived stamping.
- [ ] The full gate is green (whole suite + coverage floor + zero skipped).

### Constraints — safety-critical
This edits the **human-gate approval path**. Per the project's self-improvement
rule, hook/gate-logic changes require explicit human approval and go through the
full pipeline. The merge and the migration must preserve every approval marker's
data exactly — an approval that silently loses its `gate_crossed` or `approved_at`
is a worse failure than the corruption being fixed.

---

## 3. CAPTURE - Requirements

### Functional Requirements
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Merge the approval marker into the existing frontmatter block | Must | After stamping, the file has exactly one `---…---` block containing both the marker fields and the original `title`/`type`/`files:`/`depends_on` |
| FR-2 | Idempotent re-approval | Must | Approving an already-approved plan updates the marker in place and never adds a second block |
| FR-3 | One-time migration of the ~9 corrupted plans | Must | Each affected plan ends with a single frontmatter block; `parseFrontmatter` reads its `files:`; all marker fields retained |
| FR-4 | Regression test proving frontmatter survives approval | Must | Test double-approves a plan and asserts `parseFrontmatter` still yields `files:`/`depends_on`/`title` |

### Out of Scope
- The **meaning** of approval (what a human gate does) — only the write *format*.
- The separate menu→start `files:` drift (already fixed per-plan during the sweep).

---

## Open decision for the gate

**Migration scope.** Fix the stamping only, or fix the stamping **and** migrate the
~9 already-corrupted plans? Recommendation: **both** — a fix that leaves nine plans
with unreadable `files:` is half a fix, and those plans are the ones most likely to
re-enter the build. Stated here for the human's Gate-1 call, not decided.

---

*Follows the CTOC Iron Loop (Steps 1-3: ASSESS, ALIGN, CAPTURE). Awaiting the human's
Gate-1 approval before technical planning.*
