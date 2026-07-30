---
title: "R2-I — Stale-cleanup stops forging human approval; ledger-consistent reverts"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00008-r2f-gate-hook-revival
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/stale-cleanup.js"
  - "tests/stale-cleanup-human-gate.test.js"
---

# R2-I — A machine never writes the human's name

VERIFIED: stale-cleanup.js:66 fabricates `approved_by: human` when archiving
to done/, with no ledger entry — the exact marker the gate hook's design says
only the ledger may vouch for. tests/stale-cleanup-human-gate.test.js PINS
this as the contract. Under the decided model a machine advance is
`advanced_by: pipeline` + evidence, never the human's marker.

## Implementation Details

1. **Archive provenance.** `_stampMarker` writes
   `advanced_by: pipeline` + `advanced_at` + `gate_crossed: <reason>` —
   NEVER `approved_by: human`. `_stampAndArchive` additionally writes a
   pipeline-kind ledger entry via the R2-F approval-ledger API
   (`advanced_by: 'pipeline'`, `evidence: 'stale-reconciliation: <detail>'`)
   so the revived hook accepts the done/ residency it creates. Read the
   post-R2-F approval-ledger.js from DISK first; if the pipeline-entry API is
   absent, STOP and report.
2. **Ledger-consistent revert (contradiction 8).** `REVERT_MAP.review`
   changes from `'implementation'` to `'todo'`: a plan that legitimately
   crossed Gate 2 has a ledger entry with stage_to 'todo', so reverting it to
   todo/ leaves it hook-consistent; reverting past the gate to
   implementation/ made the hook chain-revert it a second time. Document the
   invariant: a revert may never move a plan to a gate-destination stage its
   ledger cannot vouch for. **(REWORK: the invariant is now ENFORCED in code, not
   only documented — `revertPlan` consults the ledger via `classifyResidency` and
   walks past every unvouched swept stage. See the Step 16 report, finding 2.)**
3. **Replace the pinning tests.** tests/stale-cleanup-human-gate.test.js pins
   marker fabrication — rewrite: archive produces pipeline marker + ledger
   entry, produces NO approved_by: human anywhere, and the hook (imported
   read-only) accepts the resulting done/ resident. This is the sanctioned
   last-resort test change: the old pins assert behavior the human's decided
   model forbids; the new pins are strictly tighter toward honesty.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| provenance + ledger entry | stale-cleanup executeCleanup ← menu cleanup recipe (exists) | /ctoc:menu |
| revert map | same | /ctoc:menu |

### Test Plan (TDD-Red first)
Archive: marker fields exact; ledger entry exists, kind pipeline, evidence
non-empty; grep of archived content has zero `approved_by: human`; revived
hook checkFolder on the temp done/ accepts it. Revert of a review plan lands
in todo/ and hook accepts todo residency (its Gate-2 entry). No approvePlan
import appears (the module stays gate-free by design — that invariant stays).

## Execution Plan (Steps 8-16)
### Step 8: TEST — rewrite/add tests, run ONLY the named files, record red.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE — read stale-cleanup.js + post-R2-F approval-ledger.js +
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
human-gate-check.js from DISK in full.
### Step 10: IMPLEMENT — changes 1–2.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 11: REVIEW — zero remaining `approved_by: human` literals in the module.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 12: OPTIMIZE — n/a.
### Step 13: SECURE — ledger writes only via module API; safe-fs.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 14: VERIFY — node --test named files + eslint; NO git.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 15: DOCUMENT — header: provenance rules + revert invariant.
### Step 16: FINAL-REVIEW — report.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).

## Decisions Taken Under Ambiguity

1. **Ledger entry written AFTER a successful rename into done/, not before (REWORK —
   supersedes the original before-the-rename decision).** The original rationale was
   incorrect: it claimed a rename failure "leaves the plan in its gate-source stage,
   which the hook does not check," but implementation/ and todo/ ARE hook-swept, and
   an approved-but-stranded plan is routed into this archive path from exactly those
   stages. A pre-rename write therefore left a rename failure with a done-edge entry
   standing against a swept source (wrong-edge → auto-revert + a false violation note)
   AND destroyed the plan's genuine prior approval provenance, because `persistEntry`
   overwrites the single per-slug entry. The ledger entry is now written strictly AFTER
   the rename succeeds: a rename failure cannot touch the ledger (prior provenance
   survives byte-identical), and the only remaining partial failure — a crash between
   the rename and the ledger write — leaves a done/ resident with no entry, which the
   hook resolves in the SAFE direction (a revert back out of done/, never a false
   acceptance). `content_sha256` still binds to the exact bytes now occupying done/
   (`stamped`, byte-identical across the rename), so the hook's hash check passes.

2. **`content_sha256` binds to the STAMPED bytes (`_stampMarker` output), not the
   pre-stamp content.** done/ is hash-sensitive in the hook (invalidate-on-edit), so
   the entry must hash exactly what lands in done/. The rename is byte-identical, so
   `hash(stamped)` matches the live done/ file.

3. **Ledger key is the canonical lowercase slug (`ledger.slugFromPlanPath`).** The
   hook derives its lookup key the same way, so write and read keys agree even for a
   legacy mixed-case basename.

4. **`evidence` = `'stale-reconciliation: <action> <ISO>'`.** Mandatory non-empty
   string required by `writePipelineEntry`; encodes which reconciliation path
   (archive-to-done / advance-via-reconciliation) and when, for audit.

5. **T2's fixture dropped `approved: true`.** The old test seeded the plan body with
   `approved_by: human`, which would make the "zero approved_by: human in archived
   content" pin pass on the fixture's own legacy text rather than proving the machine
   never writes it. Removing it makes the pin prove the MACHINE's behavior. The
   category label ("approved-but-stranded") is driven by the action, not the body
   marker, so the scenario is unchanged.

6. **`_stampMarker` still writes a leading provenance block (not removed entirely).**
   The archived file keeps human-readable provenance; the hook's authority source is
   the ledger, but the in-file block remains for audit legibility. It carries
   `advanced_by: pipeline`, never `approved_by: human`.

## Sibling test — already consistent (the original out-of-scope note was FALSE, removed in rework)

The original plan carried an "Out-of-scope finding" claiming that
`tests/cache-freshness.test.js` F2a asserts `/approved_by: human/` on the archived
file (citing lines 388–389) and would now FAIL until updated in a follow-up slice.
That claim was demonstrably false on disk and has been removed: `F2a_archivePlan_busts_plan_counts`
lives at line 311, and it already asserts `advanced_by: pipeline` (line 326) and
`gate_crossed: stale-reconciliation` (line 327) — the R2-I provenance contract — with
NO `approved_by: human` assertion anywhere in the file. F2a passes against the shipped
code. The cited lines 388–389 belong to an unrelated test (`F3b_removeStub_busts_plan_counts`).
No follow-up slice is required; nothing in `cache-freshness.test.js` needed changing,
and it is untouched by this plan.

## Step 16 — Final-review report (rework)

This plan was built, reached review, and was sent back for rework. Four review
findings were each fixed at the highest quality. Change surface: `src/lib/stale-cleanup.js`
and `tests/stale-cleanup-human-gate.test.js` (both already in `files:`); no other
source file was modified — `approval-ledger.js`, `approval-residency.js`, `gate-order.js`
and `human-gate-check.js` are consumed read-only.

1. **False sibling-test note removed** (finding: stale-out-of-scope-note-false). The
   `## Out-of-scope finding` section froze a demonstrably false claim (wrong test, wrong
   line numbers, phantom `approved_by: human` assertion) into a provenance-honesty plan's
   record. Verified against disk and replaced with the accurate statement above. No code
   change; the shipped record no longer orders a maintainer to redo completed work.

2. **Revert invariant now ENFORCED, not merely advertised** (finding:
   revert-invariant-unenforced). `revertPlan` applied a static `REVERT_MAP` with no
   ledger lookup, so a dead review plan with no vouching todo-edge entry (the
   dead-on-arrival default) landed in the hook-swept `todo/` and chain-reverted
   todo→implementation→functional. `revertPlan` now consults the ledger via the gate
   hook's own `classifyResidency` predicate (no second, divergable encoding) and walks
   back along `GATE_SOURCE` past every unvouched swept stage to the nearest stage the
   ledger can vouch for, or a non-gate stage. New test **T20** drives a no-entry review
   revert and proves it lands in `functional/` with every swept folder clean (no
   cascade); the existing **T19** (pre-seeded todo-edge entry → lands in `todo/`) still
   passes, so both the vouched and unvouched paths are covered.

3. **Archive is crash-consistent** (finding: archive-partial-failure-window). The
   PIPELINE ledger entry was written BEFORE the rename; a rename failure then destroyed
   the plan's prior approval provenance (`persistEntry` overwrites the single per-slug
   entry) and left a done-edge entry against a hook-swept source. The ledger write now
   happens strictly AFTER a successful rename. New test **T21** forces the rename to
   fail during an implementation-source archive and asserts the prior human todo-edge
   entry is byte-identical and no done/ resident is created. The M5 stamp-before-rename
   ordering (the in-file provenance block) is unchanged. Decision 1 in this plan was
   corrected to record the superseding rationale.

4. **Dual-marker archive now tested** (finding: dual-marker-archive-untested). A real
   approved-but-stranded plan carries `approved_by: human` in its BODY, and the archive
   retains the body while prepending the pipeline block, so a real archive contains BOTH
   markers. New test **T22** archives such a plan and pins that the machine's own block
   writes only `advanced_by: pipeline`, the pre-existing human body marker is retained,
   the ledger entry is pipeline-kind, and the gate hook accepts the resident via the
   ledger (not the body marker). The production code was already correct; T22 is a
   characterization test that closes the realism gap Decision 5's marker-free fixture
   left — it is GREEN on arrival, honestly accounted for as already-covered behavior,
   not a bug fix.

VERIFY: full `npm test` green (`# fail 0`, `# skipped 0`, coverage ≥ floor). The three
new tests were seen RED first for findings 2 and 3 (T20, T21) before the code changes;
T22 documents already-correct behavior.
