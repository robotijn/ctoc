---
title: "W02-s3 — Ledger-based gate acceptance, SIP1 exemption, fault-isolated revert"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: ctoc-audit-w02-s1-approval-ledger
files:
  - src/hooks/human-gate-check.js
  - tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js
priority: HIGH
created: "2026-07-13T00:00:00Z"
---

# W02-s3 — Ledger-based gate acceptance, SIP1 exemption, fault-isolated revert

**Parent:** `ctoc-audit-w02-gate-integrity` (findings **C4**, **H7**, **C5**). **Slice
scope:** rewrite the residency sweep in `human-gate-check.js` so it (C4) accepts a plan
only when the AGENT-WRITE-DENIED ledger vouches for it — not the in-plan marker text;
(H7) exempts freshly-authored SIP1 slices so decomposition work is not corrupted; and
(C5) isolates each revert so one filesystem failure cannot abandon the rest. All three
live in this one module on the same `checkFolder`→`main` violation pipeline, so they
ship as one cohesive slice. Depends on **s1** for `approval-ledger.verify` /
`readEntry`.

### The three bugs this closes
- **C4** — `hasApprovalMarker` (lines 57–79) trusts `approved_by: human` parsed from
  the plan's OWN frontmatter, which any agent can write. Replace that trust with a
  ledger check.
- **H7** — `checkFolder` (lines 81–101) flags ANY unmarked plan in `implementation/`
  and `revertPlan` sweeps it away — including a legitimate fresh SIP1 slice authored in
  place, which was never meant to carry a marker and has no ledger entry.
- **C5** — `main()` (lines 120–160) wraps the ENTIRE multi-violation loop in ONE
  try/catch; a throw from `revertPlan()` on violation 1 skips violations 2..N (incl. a
  Gate 3 violation) yet still `process.exit(0)` — silent success with violations
  unresolved.

## Implementation Details

### Design decision (ADR) — acceptance is folder-sensitive, and this is FORCED by C4

Because the ledger path is agent-write-denied (s2), an agent that legitimately edits a
plan in `implementation/` (the implementation-planner adding detail, authoring slices)
CANNOT refresh the ledger hash. Therefore acceptance cannot require a hash match in
`implementation/`. The rule:

A plan with slug `S` in gate-destination folder `F` (`implementation` | `todo` |
`done`) is a **violation UNLESS** one of:
1. **Fresh SIP1 slice** — `F === 'implementation'` AND its merged frontmatter has a
   non-empty `parent_plan` AND `readEntry(S)` is `null` (never crossed a gate, so no
   ledger entry — the operational proxy for "never resided downstream"). [H7]
2. **Ledger-approved into F** — a ledger entry exists with `entry.stage_to === F` AND:
   - for `todo` / `done` (tamper-sensitive; no legitimate agent editing occurs there)
     `entry.content_sha256 === computeContentHash(content)` — i.e. `verify(S, content,
     F)` is `true`; [C4 incl. invalidate-on-edit]
   - for `implementation` (active editing expected) the entry's existence with
     `stage_to === 'implementation'` SUFFICES (bind approval to the FACT of the Gate-1
     crossing, not a frozen hash).

This makes: self-authored marker + no entry → violation; ledger+hash in `done` →
accept; edited-after-approval in `done` → hash mismatch → violation; fresh slice in
`implementation` → exempt; no-`parent_plan` + no-entry in `implementation` → violation.

**Read `parent_plan` from the MERGED frontmatter region** (`extractFrontmatterRegion`
from `../lib/stale-detector`, exactly as `actions.js:listSubplans` does) so a stamped
plan's second block is still seen — this keeps s3 independent of s5's `parseMetadata`
fix.

**Open decision flagged for Gate 2 (documented, NOT silently resolved):** existing
plans approved before the ledger existed have no ledger entry. On first run the strict
`todo`/`done` rule would flag them. This slice does NOT auto-backfill (the ledger is
trusted-write-only) and does NOT silently grandfather the in-plan marker (that reopens
C4). Recommendation surfaced to the human: a one-time trusted migration backfill
(maintainer-run, not an agent tool call) converts each legacy in-plan marker into a
ledger entry at adoption. The tests here construct their own ledger state, so they are
unaffected; the migration path is the human's scheduling call.

### File Specification — `src/hooks/human-gate-check.js` (MODIFY)

- **Make functions testable.** Add `module.exports = { checkFolder, hasLedgerApproval,
  isFreshSip1Slice, revertAll, main }` and guard the bottom `main()` call with
  `if (require.main === module) { main(); }` (the exact pattern `PreToolUse.Edit.js`
  already uses). This is what lets the C5 fault-injection and the C4/H7 decisions be
  unit-tested with injected dependencies.
- **Replace `hasApprovalMarker`** with `hasLedgerApproval(filePath, folderName)`
  implementing rule 2 above (lazy `require('../lib/approval-ledger')`; read content
  once; `verify` for `todo`/`done`, existence+`stage_to` for `implementation`).
- **Add `isFreshSip1Slice(filePath, folderName)`** implementing rule 1 (merged-region
  `parent_plan` present + `readEntry === null` + `folderName === 'implementation'`).
- **Rewrite `checkFolder`** so a file is a violation iff `!isFreshSip1Slice(...) &&
  !hasLedgerApproval(...)`.
- **Extract `revertAll(violations, deps)`** from `main()` and wrap EACH iteration in
  its OWN try/catch (C5): a throw from `revertPlan(v)` is caught, recorded into a
  returned `failures[]`, and the loop CONTINUES to the next violation. `deps.revertPlan`
  defaults to the real `revertPlan` but is injectable for the throwing-stub test.
  `main()` calls `revertAll` and, if `failures.length > 0`, logs them and signals an
  incomplete outcome (a non-clean marker in the violations log) rather than a silent
  clean pass — while still `process.exit(0)` (fail-open on the tool call itself is
  unchanged; "incomplete" is recorded, not swallowed).

### Test Plan — `tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js` (CREATE)

`node:test` + sandboxed `os.tmpdir()` project (with `plans/` + `.ctoc/approvals/`).
Import the now-exported functions. BEHAVIOR-first: assert whether a plan is FLAGGED /
REVERTED / EXEMPT, and final residency — never a bare return value.

- **[C4] self-authored marker, no ledger → flagged.** Write a plan into a temp
  `done/` carrying `approved_by: human` in its frontmatter but with NO ledger entry;
  `checkFolder('done')` returns a violation for it. (Fails today: `hasApprovalMarker`
  accepts the forged marker.)
- **[C4] valid ledger entry → not flagged.** `writeEntry(slug, {content_sha256:
  hash(content), stage_from:'review', stage_to:'done'})`; `checkFolder('done')` returns
  no violation for it.
- **[C4] edited after approval → flagged.** Valid entry, then append to the plan body
  so the hash diverges; `checkFolder('done')` flags it (invalidate-on-edit).
- **[H7] fresh SIP1 slice → exempt.** Plan in `implementation/` with `parent_plan:
  foo`, no ledger entry; `checkFolder('implementation')` returns NO violation.
- **[H7] no parent_plan + no ledger in implementation → flagged.** Same folder, no
  `parent_plan`, no entry; `checkFolder('implementation')` returns a violation (the
  exemption is not a blanket bypass).
- **[C5] revert survives a mid-loop throw.** Build three violations; inject
  `deps.revertPlan` that THROWS on the first and records the rest; assert violations 2
  and 3 are still reverted (their files moved to the revert target) and the run reports
  an incomplete/failure outcome for #1 rather than a silent clean pass.

## Execution Plan

### Step 8: TEST (TDD Red)
- [ ] Write `tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js` with the six
      cases above. The C4 self-authored case, the H7 fresh-slice case, and the C5
      mid-loop-throw case MUST fail before the fix. Assert BEHAVIOR: a self-authored
      `approved_by: human` in `plans/done/` with no ledger entry is NOT accepted (it is
      flagged); a fresh SIP1 slice is NOT reverted; violations after a throwing revert
      are still reverted.

### Step 9: PREPARE
- [ ] Confirm `../lib/approval-ledger` (s1) and `../lib/stale-detector`
      (`extractFrontmatterRegion`) are importable. Confirm the `require.main === module`
      export pattern from `PreToolUse.Edit.js` as the template.

### Step 10: IMPLEMENT
- [ ] Add `module.exports` + `if (require.main === module) main();` guard to
      `human-gate-check.js`.
- [ ] Add `hasLedgerApproval(filePath, folderName)` (folder-sensitive rule 2).
- [ ] Add `isFreshSip1Slice(filePath, folderName)` (rule 1, merged-region `parent_plan`
      + `readEntry === null`).
- [ ] Rewrite `checkFolder` to flag iff `!isFreshSip1Slice && !hasLedgerApproval`.
- [ ] Extract `revertAll(violations, deps)` with per-iteration try/catch; `main()`
      records `failures[]` and signals an incomplete outcome, never a silent clean pass.

### Step 11: REVIEW
- [ ] Confirm `implementation` acceptance binds to entry existence (not hash) while
      `todo`/`done` require a hash match, matching the ADR and its C4 justification.
- [ ] Confirm the SIP1 exemption is scoped to `implementation/` + `parent_plan` +
      no-entry (not a blanket "any unmarked plan" bypass).

### Step 12: OPTIMIZE
- [ ] One content read per file per sweep; one `readEntry` per file; no re-parsing.

### Step 13: SECURE
- [ ] Acceptance no longer trusts any plan-body text (C4 closed); provenance is the
      agent-write-denied ledger only.
- [ ] The SIP1 exemption cannot be triggered from `todo`/`done` (rule 1 requires
      `implementation`), so it cannot smuggle a plan into a terminal folder.
- [ ] `revertAll` fault isolation: a throw is contained per-violation; the sweep never
      reports clean while a violation stands (C5).

### Step 14: VERIFY
- [ ] `node --test tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js` → `# fail 0`.
- [ ] `node --test tests/*.test.js` green; reconcile any existing human-gate test that
      asserted the OLD in-plan-marker acceptance (update it to the ledger contract — the
      old behavior IS the C4 vulnerability).

### Step 15: DOCUMENT
- [ ] Header comment: acceptance now comes from `.ctoc/approvals/` (ledger), not plan
      text; document the folder-sensitive rule and the flagged migration/backfill open
      decision. JSDoc each new function.

### Step 16: FINAL-REVIEW
- [ ] Verify against C4 (self-authored not accepted / ledger accepted / edit
      invalidates), H7 (fresh slice exempt / non-SIP1 still reverted), C5 (mid-loop
      throw leaves the others reverted, no silent success).
