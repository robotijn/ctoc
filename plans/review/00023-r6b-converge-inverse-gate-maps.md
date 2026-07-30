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
  - "tests/approval-ledger-provenance.test.js"
  - "src/lib/menu-screens.js"
  - "tests/menu-screens.test.js"
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
- [x] Step 12 OPTIMIZE — nothing to optimize: the change is a literal→derived swap
  (`Object.fromEntries` at module load) plus two `require`s of an already-loaded pure
  leaf; no hot-path cost added (verified gate-order requires nothing).
- [x] Step 13 SECURE — no circular require (gate-order requires nothing; approval-ledger →
  gate-order is one-directional); hook path stays a pure synchronous constant load.
- [x] Step 14 VERIFY — REWORK (2026-07-27): the original record ran only `node --test`
  on 3 files + eslint, NOT the gated entry point. Re-ran the REAL gate on the worktree:
  `npx tsc --noEmit` exit 0 (clean typecheck), and `npm test` → `[CTOC test-gate] PASS`,
  coverage 99.12% (threshold 99%), skipped 0, failed 0. Full suite GREEN.
- [x] Step 15 DOCUMENT — the derivation is documented in-code: gate-order.js lines
  119–146 (the R6-B inverse-encoding block, `GATE_SOURCE` + `sourceOf` JSDoc) and the
  consumer comments in human-gate-check.js and approval-ledger.js name gate-order as the
  single source. No external doc change needed (internal library invariant).
- [x] Step 16 REPORT — returned to the orchestrator (see Rework Report below).

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
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
4. **The FORWARD fence (00023 rework, 2026-07-30) keys on two forward pairs and excludes
   gate-order.js.** menu-screens.js held a FOURTH, forward literal of the gate-edge set as
   `HUMAN_GATES` (source→dest), live-read at ~line 1908 (`HUMAN_GATES[stage]`) and re-exported
   — a duplicate encoding that falsified R6-B's "ONLY literal" claim. It now DERIVES from
   `gate-order.GATE_SOURCE` (its exact inverse), values byte-identical. The mirror fence in
   tests/menu-screens.test.js keys on `functional:'implementation'` + `review:'done'`. A
   full-pipeline flow map would legitimately share the gate pairs (the gate set is a subset of
   the full flow), so no forward pair is unique against a hypothetical NEXT_STAGE map; none
   exists in src today (NEXT_STAGE was deliberately removed — see menu-screens.js), so the
   two-pair key is safe now and, if a real full-flow map is later added, will trip and force a
   review — acceptable. gate-order.js carries the edges only as the `GATE_EDGES` tuple, never
   the object shape, so it is excluded exactly as the inverse fence excludes it.
5. **The derived-binding comment must not contain the object-literal shape.** The forward fence
   scans whole file text (comments included, like the inverse fence). The first draft of the
   comment quoted the map values in `key:'value'` shape and tripped the fence on itself; the
   comment now describes the mapping in prose.

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
  **REFUTED-as-stale (rework 2026-07-27):** this note describes a snapshot that no longer
  holds — this plan is now resident in `plans/review/`, not `plans/todo/`, and the tree
  is at v6.13.7+, not v6.12.6. The observation was environmental (a queue-state
  self-check), never a defect in R6-B's code. Left for provenance; not actionable.

## Rework Report (2026-07-27, review-stage adversarial pass)

Adversarial critique of R6-B against live source (each claim verified before acting).
No code change was required — the convergence is correct. Corrections were to the
plan's own record and its `files:` declaration.

**Convergence VERIFIED shipped, ONE encoding — the core claim holds.** The inverse gate
map is derived exactly once: `gate-order.js:133` `GATE_SOURCE =
Object.fromEntries(GATE_EDGES.map(([from,to])=>[to,from]))` plus `sourceOf(to)`.
Both former literals are gone and now derive from it — `human-gate-check.js:141`
`const { GATE_SOURCE: HUMAN_GATES } = require('../lib/gate-order')` and
`approval-ledger.js:898` `stage_from: sourceOf(stage_to) || 'backfill'`. A grep of the
whole `src/` tree for the two inverse pairs (`todo:'implementation'`, `done:'review'`)
finds them only in gate-order.js (its JSDoc). No divergent second copy exists — the bug
this plan exists to kill is dead, and a ratcheting fence
(`tests/approval-ledger-provenance.test.js` `no inverse gate-edge literal … survives
outside gate-order.js`) keeps it dead. `stale-cleanup.js` REVERT_MAP is confirmed a
genuinely different map (review→todo, functional→vision are not gate edges); it also
CONSUMES `GATE_SOURCE` (line 333) for its dynamic ledger walk, reinforcing the single
encoding rather than duplicating it. R6-B shipped in commit f153861 (v6.12.7).

**Defect dispositions:**
1. **Step 14 never ran the real gate — FIXED.** Original record ran only `node --test`
   on 3 files + eslint. Re-ran the gated entry point on this worktree: `npx tsc
   --noEmit` exit 0, and `npm test` → `[CTOC test-gate] PASS`, coverage 99.12%
   (threshold 99%), skipped 0, failed 0. Full suite GREEN. Step 14 record replaced with
   this real evidence.
2. **`files:` listed `tests/gate-hook-revival.test.js`, never touched — FIXED.** Commit
   f153861 modified exactly 5 files (gate-order.js, human-gate-check.js,
   approval-ledger.js, gate-order.test.js, approval-ledger-provenance.test.js); the
   revival test was not among them (behavior was byte-identical, so it needed no edit).
   Removed the phantom entry so `files:` matches the actual change set.
3. **Straggler note about `plans/todo/` + v6.12.6 baseline — REFUTED-as-stale.** Marked
   in the Straggler Report; environmental snapshot, not an R6-B defect.
4. **Execution Plan was missing Steps 12 and 15 — FIXED.** Added the OPTIMIZE and
   DOCUMENT records (no optimization needed for a literal→derived swap; derivation is
   documented in-code at gate-order.js:119–146).

**"Full-suite red / tsc errors" claims:** none were present in this plan; independently
confirmed the tree is GREEN (`tsc --noEmit` exit 0, `npm test` PASS), so any such claim
would be REFUTED-as-stale.

**No genuine fork.** Every defect had a single defensible resolution; the code the plan
delivered is correct as shipped.
