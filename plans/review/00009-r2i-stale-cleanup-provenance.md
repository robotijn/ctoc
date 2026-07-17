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
  - "tests/stale-cleanup*.test.js"
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
   ledger cannot vouch for.
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
### Step 9: PREPARE — read stale-cleanup.js + post-R2-F approval-ledger.js +
human-gate-check.js from DISK in full.
### Step 10: IMPLEMENT — changes 1–2.
### Step 11: REVIEW — zero remaining `approved_by: human` literals in the module.
### Step 12: OPTIMIZE — n/a.
### Step 13: SECURE — ledger writes only via module API; safe-fs.
### Step 14: VERIFY — node --test named files + eslint; NO git.
### Step 15: DOCUMENT — header: provenance rules + revert invariant.
### Step 16: FINAL-REVIEW — report.

## Decisions Taken Under Ambiguity

1. **Ledger entry written BEFORE the rename into done/, not after.** The gate hook
   flags any done/ resident lacking a ledger entry. Writing the pipeline entry
   before the rename means there is never a window where the plan sits in done/
   unvouched. A rename failure would leave a harmless orphan entry (the plan stays
   in its gate-source stage, which the hook does not check); a retry overwrites it.

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

## Out-of-scope finding (NOT touched — needs a follow-up slice)

`tests/cache-freshness.test.js` F2a (test `F2a_archivePlan_busts_plan_counts`,
line 388) asserts the archived file matches `/approved_by: human/`. That is the
exact forged-marker contract R2-I removes, so this sibling test will now FAIL until
it is updated to assert `advanced_by: pipeline` instead. It is outside this plan's
`files:` allow-list (only `src/lib/stale-cleanup.js` + `tests/stale-cleanup*.test.js`),
so it was left untouched per the hard constraint. Its second assertion
(`gate_crossed: stale-reconciliation`, line 389) still passes.
