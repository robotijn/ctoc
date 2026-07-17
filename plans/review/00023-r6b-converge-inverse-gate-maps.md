---
title: "R6-B — The last two gate-edge copies derive from gate-order (ONE encoding, finished)"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/gate-order.js"
  - "src/hooks/human-gate-check.js"
  - "src/lib/approval-ledger.js"
  - "tests/gate-order.test.js"
  - "tests/gate-hook-revival.test.js"
  - "tests/approval-ledger-provenance.test.js"
---

# R6-B — Finish the single gate encoding

R5-B converged actions.js + iron-loop-enforcer onto `gate-order.js`. Two copies
of the same three edges remain, both expressed destination→source (the inverse
of gate-order's source→dest `GATE_EDGES`):
- `human-gate-check.js:105` `HUMAN_GATES = { implementation:'functional', todo:'implementation', done:'review' }` (the revert map: a gate destination reverts to its source).
- `approval-ledger.js:99` `STAGE_SOURCE = { implementation:'functional', todo:'implementation', done:'review' }`.

## Implementation Details
1. **gate-order.js exports the inverse.** Add `sourceOf(to)` and an exported
   `GATE_SOURCE` map derived from `GATE_EDGES` (`Object.fromEntries(GATE_EDGES.map
   (([from,to])=>[to,from]))`) — the ONE place the inverse is computed. Keep
   existing exports.
2. **human-gate-check.js** requires `gate-order.GATE_SOURCE` (or `sourceOf`) for
   its revert map; delete the local `HUMAN_GATES` literal. Behavior byte-identical
   (same three mappings) — the revert test must still pass.
3. **approval-ledger.js** requires `gate-order.GATE_SOURCE`/`sourceOf` for
   `STAGE_SOURCE`; delete the local literal. NOTE: approval-ledger is imported by
   the Bash hook path and must stay side-effect-free and fast — gate-order is a
   pure constant module, safe to require. Confirm no circular require
   (gate-order must not require approval-ledger; check before wiring).
4. Grep-prove: after this, the ONLY literal of the gate edge set (either
   direction) in the whole src tree is in gate-order.js. List any straggler.

### Wiring — the live call sites (MANDATORY)
| change | live call site | root |
|---|---|---|
| GATE_SOURCE/sourceOf | human-gate-check revert (registered hook) + approval-ledger STAGE_SOURCE (hook path) | hook root |

### Test Plan (TDD-Red first)
gate-order.test.js: `GATE_SOURCE`/`sourceOf` invert `GATE_EDGES` exactly; a change
to GATE_EDGES moves both. human-gate-check revert behavior unchanged (a plan at a
gate destination reverts to the correct source). approval-ledger STAGE_SOURCE
unchanged. No circular require (require both modules in isolation, assert no throw
/ no hang). Grep test (like the reachability fence): no gate-edge literal outside
gate-order.js in src/.

## Execution Plan (Steps 8-16)
- [x] Step 8 TEST red — added GATE_SOURCE/sourceOf specs to gate-order.test.js and
  created approval-ledger-provenance.test.js; 7 assertions RED before implementation.
- [x] Step 9 PREPARE — read gate-order.js, human-gate-check.js (HUMAN_GATES + revert
  usage at line 291 + folder sweep at 359), approval-ledger.js (STAGE_SOURCE + line 417
  backfill use) IN FULL; confirmed gate-order has ZERO requires (pure leaf).
- [x] Step 10 IMPLEMENT — gate-order exports derived GATE_SOURCE + sourceOf; human-gate-check
  HUMAN_GATES = gate-order.GATE_SOURCE; approval-ledger backfill stage_from = sourceOf(stage_to).
- [x] Step 11 REVIEW — grep-proved the inverse gate-edge literal exists in NO src file
  outside gate-order.js (only a JSDoc example there); forward GATE_EDGES tuple sole-homed.
- [x] Step 13 SECURE — no circular require (gate-order requires nothing; approval-ledger →
  gate-order is one-directional); hook path stays a pure synchronous constant load.
- [x] Step 14 VERIFY — `node --test` on the 3 named files: 24 pass / 0 fail / 0 skipped;
  dependent gate/ledger/actions/stale tests 64/64; eslint exit 0. No git, unstaged.
- [x] Step 16 REPORT — returned to the orchestrator.

## Decisions Taken Under Ambiguity
1. **`sourceOf` is wired into approval-ledger's live backfill path, not just exported.**
   The plan asked for both an exported `GATE_SOURCE` map and a `sourceOf(to)` function.
   An exported-but-unused `sourceOf` trips the repo's `dead-export-fence` (a `block`
   finding in iron-loop-enforcer's thorough self-check). Per the "wired is done"
   principle I routed `approval-ledger.backfillEntry` through `sourceOf(stage_to)`
   (instead of indexing the `GATE_SOURCE` map), so both new exports have a live src
   consumer: `GATE_SOURCE` → human-gate-check revert map + folder sweep; `sourceOf` →
   ledger backfill `stage_from`. Behavior byte-identical (`sourceOf('done')==='review'`,
   etc.; non-gate stage → `'backfill'` fallback preserved).
2. **`human-gate-check` keeps exporting `HUMAN_GATES`** (now aliased to
   `gate-order.GATE_SOURCE`) rather than dropping the export. Several tests and modules
   read the exported name; the value is byte-identical and `Object.keys` order is
   unchanged (`implementation, todo, done`), so the folder sweep in `main()` is
   unaffected. Non-breaking.
3. **The single-encoding fence targets the two unambiguous inverse pairs**
   (`todo:'implementation'`, `done:'review'`) and EXCLUDES gate-order.js. Rationale:
   the forward-tuple shape `['implementation','todo']` legitimately appears in unrelated
   section-membership arrays (sections.js, menu-screens.js), and the lone pair
   `implementation:'functional'` coincidentally appears in stale-cleanup's per-stage
   `REVERT_MAP` (`{review:'todo', implementation:'functional', functional:'vision'}` —
   a different map that also covers non-gate edges). Keying the fence on the two pairs
   that belong ONLY to the gate inverse map avoids those false positives while still
   catching any real reintroduction of the inverse encoding.

## Straggler Report (files NOT in this plan's scope)
- `src/lib/stale-cleanup.js:79-83` `REVERT_MAP` — a per-stage BACKWARD-revert map for
  the stale detector (`review→todo`, `implementation→functional`, `functional→vision`).
  NOT the three-edge gate encoding: it maps non-gate stages and shares only the single
  coincidental pair `implementation:'functional'`. Left untouched (out of scope; a
  different concept). Flagging for awareness only.
- `src/lib/menu-screens.js:70` `STAGE_FOLDERS` (identity stage→folder), `:386` and
  `src/lib/sections.js:21` (section-membership arrays) — matched a loose stage-name
  grep but are unrelated to gate edges. Not stragglers.
- Pre-existing (NOT introduced here): iron-loop-enforcer's live self-check flags
  `gate-destinations-approved` (block) — the plans currently sitting in `plans/todo/`
  (00021–00024, including this one) have no ledger entry. Verified identical on the
  clean v6.12.6 baseline with these changes stashed. Not caused by R6-B.
