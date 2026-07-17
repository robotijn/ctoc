---
title: "R2-F — Revive the dead gate hook: legacy slugs, per-plan fault isolation, pipeline-advance provenance"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/human-gate-check.js"
  - "src/lib/approval-ledger.js"
  - "tests/ctoc-audit-w02-s3-gate-acceptance-revert.test.js"
  - "tests/approval-ledger*.test.js"
  - "tests/gate-hook-revival.test.js"
---

# R2-F — The gate hook enforces again

VERIFIED BY EXECUTION: `checkFolder('done', cwd)` throws `Invalid slug` —
`hasLedgerApproval` calls `ledger.verify` unguarded; 127 uppercase legacy
slugs in plans/done/ crash the sweep; main()'s outer catch exits 0. The hook
registered on every tool call has enforced NOTHING in this repo. Also: 181 of
234 done plans have no ledger entry — reviving the hook naively mass-reverts
them, so acceptance must be sequenced with the backfill the INTEGRATOR runs
at the wave boundary (this slice ships the code + the backfill helper API;
the integrator executes the data migration before the commit).

## Implementation Details

1. **Canonical lowercase slugs.** `slugFromPlanPath` (approval-ledger.js)
   lowercases; every ledger key is the lowercase slug; `SLUG_RE` unchanged
   (the path-safety constraint stays tight). Two plans differing only by case
   would collide — `appendEntry`/write path must detect an existing entry for
   a different original path and fail loudly (report says none exist today;
   verify while implementing).
2. **Per-plan fault isolation in the sweep.** `hasLedgerApproval` wrapped so
   an un-keyable slug or a corrupt entry NEVER aborts the whole sweep: that
   single plan is classified `violation` with reason `ledger-unkeyable` /
   `ledger-corrupt` (fail SAFE toward flagging, never toward silent exit 0),
   the sweep continues, and main() reports per-plan results. The outer
   catch keeps fail-open ONLY for infrastructure errors (fs down), and must
   log WHICH error it swallowed to the gate-violations log — a silent exit 0
   is how this hook died unnoticed.
3. **Pipeline-advance provenance.** The ledger gains a second entry kind:
   `advanced_by: 'pipeline'` with mandatory `evidence` (string, e.g.
   'stale-reconciliation', verify artifact path) alongside the existing
   human kind — written ONLY through the module API (the agent-write deny on
   .ctoc/approvals stays). `verify` distinguishes kinds. The hook accepts done/
   residency for EITHER a human entry OR a pipeline entry with evidence;
   gate destinations before done (todo) keep human-only. Also: `backfilled:
   true` + `backfill_reason` optional fields, accepted as human-kind (the
   2026-07-14 legacy migration provenance).
4. **Vision exemption parity (contradiction 1).** checkFolder('done') exempts
   `type: vision` plans exactly as iron-loop-enforcer.js:337-339 does — the
   two acceptance semantics must agree; document the exemption in both places'
   comments (enforcer file itself is out of scope; reference it).
5. **Backfill helper.** Export `backfillEntry(projectPath, planPath, { stage_to,
   reason })` on approval-ledger — writes a human-kind entry with backfilled
   provenance for an EXISTING plan file, hashing current content. No standalone
   script file (one-shot scripts become dead code); the integrator drives it
   via `node -e` at the boundary.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| all hook changes | registered PreToolUse hook (hooks.json) | hook root |
| ledger changes | stampAndLedger (actions.js, exists) + hook verify | /ctoc:menu + hook |
| backfillEntry | integrator boundary migration (node -e, this wave) + documented in the module header | hook root |

### Test Plan (TDD-Red first) — new tests/gate-hook-revival.test.js + updates
Uppercase-slug plan in a temp done/ → sweep completes, classifies it (not
crash); after backfillEntry → accepted. 181-gap simulation: three plans, one
ledgered, one backfilled, one bare → exactly the bare one flagged. Pipeline
entry with evidence accepted in done/, rejected in todo/. Pipeline entry
WITHOUT evidence → write refused. Corrupt entry JSON → that plan flagged
`ledger-corrupt`, sweep continues. Vision-typed plan in done/ exempt. Case
collision on appendEntry → loud failure. Existing w02-s3 acceptance/revert
tests: keep passing or tighten (never weaken).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write tests, run ONLY the named test files, record red.
### Step 9: PREPARE — read human-gate-check.js, approval-ledger.js, and
actions.js stampAndLedger (read-only) IN FULL from disk.
### Step 10: IMPLEMENT — changes 1–5.
### Step 11: REVIEW — the hook's failure modes enumerated in its header;
none may silently exit 0 without logging.
### Step 12: OPTIMIZE — sweep stays O(plans).
### Step 13: SECURE — SLUG_RE untouched; path traversal tests still pass;
agent-write deny untouched.
### Step 14: VERIFY — node --test on named test files + eslint; NO git; do
NOT run the backfill against the real repo (integrator's job).
### Step 15: DOCUMENT — module headers: two entry kinds, backfill provenance,
fault-isolation rules.
### Step 16: FINAL-REVIEW — report + exact `node -e` backfill invocation the
integrator should run.

## Decisions Taken Under Ambiguity

1. **Boundary canonicalization, not a loosened `SLUG_RE`.** Per the constraint,
   `SLUG_RE` is byte-for-byte unchanged. Lowercasing happens in `ledgerPath`
   (before the regex test) and in `slugFromPlanPath`. Lowercasing cannot introduce
   a `/`, `..`, drive letter, or any other traversal character, so the path-safety
   guard stays exactly as tight — verified: `ledgerPath('../../etc/passwd')` still
   throws (w02-s1 Case 6 green).

2. **Collision guard keyed on `plan_basename`, not on two real files.** macOS's
   default filesystem is case-insensitive, so two basenames differing only by case
   cannot coexist in ONE directory. The guard therefore compares an
   incoming/existing `plan_basename` (original-cased) at the canonical key: a
   genuine difference throws loudly; re-writing the SAME original basename
   (idempotent re-approval / re-backfill) is allowed. Confirmed by scan: ZERO
   case-collisions exist among current `done/` + `todo/` residents today.

3. **New write functions instead of overloading `writeEntry`.** Rather than add a
   `kind` flag to `writeEntry` (used by the out-of-scope `actions.js`
   `stampAndLedger`, which must keep its exact human-kind semantics), pipeline
   provenance ships as a sibling `writePipelineEntry`, and the legacy migration as
   `backfillEntry`. `writeEntry`'s signature and default (`approved_by: 'human'`)
   are untouched, so no out-of-scope caller changes behavior.

4. **`readEntryResult` added alongside `readEntry`, not replacing it.** The sweep
   needs to tell `unkeyable` / `corrupt` / `absent` apart to assign the right
   flag reason; the historical `readEntry` collapses all three to `null` and is
   still relied on by `actions.js` and s5's rollback test, so it is preserved
   verbatim and the discriminated reader is a new export.

5. **`backfillEntry(projectPath, planPath, { stage_to, reason })` signature.** The
   plan fixed this signature. `stage_from` is derived from `stage_to` via the
   gate-source map (`done→review`, `todo→implementation`, `implementation→
   functional`), falling back to the literal `'backfill'` so no required field is
   ever empty. It hashes the plan's CURRENT on-disk content (invalidate-on-edit
   holds immediately after migration).

6. **Fail-SAFE direction is toward FLAGGING.** An un-keyable slug, a corrupt
   entry, or an unreadable plan is classified a violation (never accepted), the
   per-plan fault is isolated so the sweep continues, and `main()`'s outer catch
   now logs the swallowed infrastructure error to the durable gate-violations
   store — the silent exit 0 that killed the hook is eliminated. The SIP1
   exemption was tightened to require a TRUE `absent` status (a corrupt/un-keyable
   entry can no longer be laundered into an exemption).

7. **Vision exemption scoped to `done/` only**, matching `iron-loop-enforcer.js`'s
   `type:\s*vision` check exactly (that file is out of scope and only referenced).
   A `type: vision` archive in `done/` is skipped before classification; every
   non-vision bare plan is still flagged.

8. **Plan file left in `todo/` — no stage move.** The parent's explicit
   constraints ("NO git; leave unstaged"; the INTEGRATOR runs the data migration
   and commit at the wave boundary) override the generic executor's
   in-progress→review move. Shipping the code + helper here and letting the
   integrator sequence the backfill-then-enforce transition IS the plan's design
   ("acceptance must be sequenced with the backfill the integrator runs").

## Integrator boundary migration (exact invocation)

Run from the repo root AFTER this slice's code lands and BEFORE the hook is
allowed to enforce (the sequencing the plan mandates). It ledgers every legacy
`done/` + `todo/` (+ any `implementation/`) resident the revived sweep would
flag, hashing each plan's current content; `type: vision` archives are exempt and
skipped; it is idempotent and re-runnable, and prints `remaining flagged` = 0 on
success:

```
node -e '
const gate = require("./src/hooks/human-gate-check.js");
const ledger = require("./src/lib/approval-ledger");
const root = process.cwd();
const reason = "2026-07-14 legacy pre-ledger migration (R2-F wave boundary)";
let ok = 0, fail = 0;
for (const folder of ["implementation", "todo", "done"]) {
  for (const v of gate.checkFolder(folder, root)) {
    try { ledger.backfillEntry(root, v.path, { stage_to: folder, reason }); ok++; }
    catch (e) { fail++; console.error(`  SKIP ${folder}/${v.file}: ${e.message}`); }
  }
}
console.log(`backfilled=${ok} failed=${fail}`);
let remaining = 0;
for (const f of ["implementation","todo","done"]) remaining += gate.checkFolder(f, root).length;
console.log(`remaining flagged after backfill = ${remaining}`);
'
```

Against the real repo at this slice's completion the sweep reports (read-only,
verified): `implementation: 0`, `todo: 7`, `done: 172` flagged
(`no-ledger-entry`) — the ~181 legacy gap minus the now-exempt `type: vision`
archives — so the migration will ledger 179 residents and drive the sweep to 0.
