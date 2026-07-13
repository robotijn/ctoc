---
approved_by: human
approved_at: 2026-07-13T20:53:24.247Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:42.991Z
gate_crossed: implementation → todo
---

---
title: "W02-s5 — Atomic stamp-then-move + merged-frontmatter parse"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: ctoc-audit-w02-s1-approval-ledger
files:
  - src/lib/actions.js
  - src/lib/state.js
  - tests/ctoc-audit-w02-s5-atomic-stamp-merged-parse.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W02-s5 — Atomic stamp-then-move + merged-frontmatter parse

**Parent:** `ctoc-audit-w02-gate-integrity` (findings **M18**, **M19** — parent Story
6). **Slice scope:** two tightly-coupled correctness fixes on the same stamp/parse code
path — (M18) make `approvePlan` write the ledger entry and cross the gate atomically so
a crash never leaves a false-approved plan in the source folder, and (M19) make
`parseMetadata` merge a prepended marker block with the plan's own frontmatter instead
of dropping every original field. They ship together because M18's marker prepend is
exactly what breaks M19's parse. Depends on **s1** (`approvePlan` writes the ledger).

### The two bugs this closes
- **M18** — `approvePlan` (lines 222–234) writes the in-plan marker (`addApprovalMarker`
  → one write) and THEN calls `movePlan()` as a separate step. A crash between them
  leaves a plan in the SOURCE folder (e.g. `review/`) already carrying
  `approved_by: human` — a false-positive the residency sweep never inspects (it only
  scans destinations).
- **M19** — `parseMetadata` (`state.js:58–60`) uses `/^---\n([\s\S]*?)\n---/`, matching
  ONLY the first `---…---`. When the marker block is prepended, it returns just
  `approved_by`/`approved_at`/`gate_crossed` and silently drops `title`, `type`,
  `status`, `priority`, `parent_vision`, `depends_on`.

## Implementation Details

### Design decision (ADR) — ledger-first, move, stamp, rollback

The ledger (s1) is the source of approval truth, so approval "commits" when the ledger
entry lands for the destination. New `approvePlan` order for a human-gate crossing:

1. Compute the destination content = `addApprovalMarker(content, from, to)` and its
   `content_sha256`.
2. `movePlan(source → dest)` (rename) and write the marked content to the dest file.
3. `approvalLedger.writeEntry(slug, { content_sha256, stage_from: from, stage_to: to,
   approved_by: 'human' })`.
4. If step 3 (or the dest write) throws: ROLL BACK — move the file back to source,
   restore the original unmarked content, `approvalLedger.removeEntry(slug)`. Final
   state is then (a) unmarked + in source.

Crash points and their SAFE outcomes (this is exactly metric 7): a crash after step 2
but before step 3 leaves the plan at the destination, marked, but with NO ledger entry
→ s3's residency sweep (no entry, not a fresh slice) FLAGS and reverts it back to
source → self-heals to (a). A crash after step 3 = fully committed (b) marked +
ledgered + in destination. The forbidden state (c) marked-and-resident-in-SOURCE never
occurs, because the marker is written only at the destination (step 2), never in the
source folder. `content_sha256` is computed over the EXACT bytes written to the dest
file so s3's `verify` hash matches on a later sweep.

Keep the in-plan marker (backward-compatible, human-readable), but it is now ADVISORY —
s3 ignores it and trusts only the ledger.

### File Specification — `src/lib/actions.js` (MODIFY)

- Lazy `require('./approval-ledger')` inside `approvePlan` (avoid a load-time cycle,
  matching the existing lazy-require style in this file).
- In the `isHumanGate` branch (lines 223–234): implement the ledger-first / move /
  stamp / rollback sequence above. Factor the stamp+ledger+rollback into a small
  helper (e.g. `stampAndLedger(planPath, from, to, root, deps)`) whose `deps.writeEntry`
  / `deps.move` default to the real implementations but are INJECTABLE so the crash-
  injection test can force step 3 to throw and assert the rollback.
- Preserve the existing `applyIronLoop` (for `to === 'todo'`), transition logging, and
  return shape `{ newPath, backgroundAgent, humanGate }` unchanged.

### File Specification — `src/lib/state.js` (MODIFY)

- Rewrite `parseMetadata` to parse the MERGED leading-frontmatter region. Reuse
  `extractFrontmatterRegion` from `./stale-detector` (already CRLF-safe and already the
  helper `listSubplans` uses for this exact reason) to get the union of all leading
  `---…---` blocks, then run the existing scalar key/value parse over that region.
  Later blocks override earlier keys only on genuine duplicates; the union preserves
  every distinct key from BOTH the prepended marker block and the plan's own
  frontmatter. Behavior for a single-block plan is unchanged (region == that block).
- Lazy-require `stale-detector` if needed to avoid a `state ↔ stale-detector` load
  cycle; a fail-open fallback to the current first-block regex on any error keeps the
  parser robust.

### Test Plan — `tests/ctoc-audit-w02-s5-atomic-stamp-merged-parse.test.js` (CREATE)

`node:test` + sandboxed `os.tmpdir()` project. BEHAVIOR-first.

- **[M19] merged parse returns the union.** Build content = marker block (`approved_by`,
  `approved_at`, `gate_crossed`) prepended before the plan's own block (`title`, `type`,
  `status`, `priority`, `parent_vision`, `depends_on`); assert `parseMetadata` returns
  ALL nine keys — none dropped. (Fails today: only the three marker keys survive.)
- **[M19] single-block plan unchanged.** A normal one-block plan parses exactly as
  before (regression guard).
- **[M18] happy path is atomic + ledgered.** `approvePlan` on a `review/` plan →
  file resides in `done/`, carries the marker, AND `readEntry(slug).stage_to === 'done'`
  with a hash matching the dest file (`verify` true).
- **[M18] crash between move and ledger self-heals — never marked-in-source.** Inject
  `deps.writeEntry` that THROWS; assert the final state is (a) the plan is back in the
  SOURCE folder AND unmarked (rollback ran) — assert NOT (c) marked-and-resident-in-
  source. (This is metric 7's forbidden state.)

## Execution Plan

### Step 8: TEST (TDD Red)
- [x] Write `tests/ctoc-audit-w02-s5-atomic-stamp-merged-parse.test.js` with the four
      cases. The M19 union case and the M18 crash-injection case MUST fail before the
      fix. Assert BEHAVIOR: after a prepended marker, `parseMetadata` still yields
      `title`/`type`/`priority`/`parent_vision`/`depends_on`; a crash between stamp and
      move never leaves a marked plan in the source folder.

### Step 9: PREPARE
- [x] Confirm `./approval-ledger` (s1) and `./stale-detector`
      (`extractFrontmatterRegion`) are importable from `actions.js` / `state.js`
      without a load cycle (use lazy require where needed).

### Step 10: IMPLEMENT
- [x] `src/lib/state.js`: rewrite `parseMetadata` to parse the merged frontmatter
      region via `extractFrontmatterRegion`, with a fail-open fallback to the current
      regex.
- [x] `src/lib/actions.js`: implement ledger-first / move / stamp / rollback in
      `approvePlan`'s human-gate branch via an injectable `stampAndLedger` helper;
      write the ledger entry with the dest-content hash; roll back on failure.

### Step 11: REVIEW
- [x] Confirm the forbidden state (marked-and-resident-in-source) is unreachable: the
      marker is written only at the destination.
- [x] Confirm `approvePlan`'s return shape and the `to==='todo'` iron-loop path are
      unchanged; confirm `parseMetadata` is behavior-identical for single-block plans.

### Step 12: OPTIMIZE
- [x] Hash computed once over the dest bytes; `extractFrontmatterRegion` runs once per
      `parseMetadata` call.

### Step 13: SECURE
- [x] The ledger write is on the trusted `approvePlan` code path (never a tool call),
      consistent with s2's deny-list.
- [x] Rollback restores the original content faithfully (no partial/marked residue in
      source); `removeEntry` clears the partial ledger entry.

### Step 14: VERIFY
- [x] `node --test tests/ctoc-audit-w02-s5-atomic-stamp-merged-parse.test.js` →
      `# fail 0`.
- [x] `node --test tests/*.test.js` green — every existing consumer of `parseMetadata`
      (dashboard counts, `plan-validator`, `readPlans`, `listSubplans`) still passes;
      the merge is a superset of the old single-block result.

### Step 15: DOCUMENT
- [x] JSDoc the new `approvePlan` ordering + rollback and the ADR crash-safety
      argument; comment `parseMetadata` explaining the merged-region parse and the M19
      rationale.

### Step 16: FINAL-REVIEW
- [x] Verify against M18 (every simulated crash point ends unmarked-in-source or
      committed-in-dest, never marked-in-source) and M19 (prepend-then-parse yields the
      full field union).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
