---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T17:30:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's explicit 2026-07-14 order "fix them all, do 50
  rounds of hard critique, keep fixing the code". Boundary reconciliation of
  the R2 wave: the typecheck ratchet regressed 64→94 and must go to zero.
---

---
title: "R2-Z — Boundary: typecheck to zero, ratchet tightened, last fixtures to the new contracts"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00010-r2c2-persisted-answers-unblocked
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/areas/inbox.js"
  - "src/commands/menu.js"
  - "src/hooks/SessionStart.js"
  - "src/hooks/human-gate-check.js"
  - "src/lib/actions.js"
  - "src/lib/approval-ledger.js"
  - "src/lib/background.js"
  - "src/lib/budget.js"
  - "src/lib/comparator-agent.js"
  - "src/lib/coverage-map.js"
  - "src/lib/dependency-auditor.js"
  - "src/lib/four-eyes.js"
  - "src/lib/hook-deny-signal.js"
  - "src/lib/hooks-installer.js"
  - "src/lib/inbox.js"
  - "src/lib/init-project.js"
  - "src/lib/iron-loop-enforcer.js"
  - "src/lib/menu-screens.js"
  - "src/lib/privilege-posture.js"
  - "src/lib/product-loop.js"
  - "src/lib/quality-agent.js"
  - "src/lib/quality-gate.js"
  - "src/lib/quality-state.js"
  - "src/lib/retention.js"
  - "src/lib/sections.js"
  - "src/lib/stale-detector.js"
  - "src/lib/state.js"
  - "src/lib/task-registry.js"
  - "src/lib/version.js"
  - "src/lib/vision-decomposer.js"
  - "src/scripts/run-self-check.js"
  - "src/tabs/overview.js"
  - "src/tabs/vision.js"
  - ".ctoc/typecheck-baseline.json"
  - "CLAUDE.md"
  - "tests/w10-live-agent-reconcile.test.js"
---

# R2-Z — Warnings are bugs: typecheck to ZERO

The R2 wave regressed `tsc --checkJs` from the committed baseline 64 to 94.
The ratchet moves only in the tightening direction, so the fix is the CODE —
all 94 errors, including the 64 pre-existing ones (warnings are bugs; time is
a vector). Target: **zero errors**, baseline file set to the achieved count
(0), which the ratchet test then holds forever.

## Implementation Details

1. Run `npm run typecheck:raw`, capture every error, fix each at the source:
   JSDoc `@param`/`@returns`/`@type`/`@typedef` annotations, narrowing guards,
   or (last resort, one line each) `/** @type {any} */` casts ONLY where the
   dynamic shape is genuinely untypeable — each such cast gets a same-line
   reason. ZERO behavior changes: this slice is type-annotation-only; if a
   type error reveals a REAL bug (wrong property, impossible branch), fix it
   and call it out prominently in the report.
2. `.ctoc/typecheck-baseline.json` → the achieved count (0). Never above 64.
3. `CLAUDE.md`: the two "256 test files" counts → the live disk count
   (`ls tests/*.test.js | wc -l`, currently 257) — re-count at execution time.
4. `tests/w10-live-agent-reconcile.test.js` scenario 8 ("a true session
   restart still orphans a stale task"): the fixture predates R2-A's
   kind-aware staleness (implement/sync floor is now 120 min). Tighten the
   fixture to the new contract — age the implement task PAST 120 minutes (the
   scenario's intent is the no-live-ids backstop, which still exists) — and
   add the complementary assertion that a 45-minute implement task is NOT
   orphaned. Do not weaken the scenario.

### Wiring — the live call sites (MANDATORY)
Type-annotation-only on already-live files; no new exports, no wiring change.

### Test Plan
`npm run typecheck:raw` → 0 errors; `npm run typecheck` (ratchet) → pass with
the tightened baseline; `node --test tests/w10-live-agent-reconcile.test.js
tests/doc-counts.test.js tests/readme-numbers.test.js` → pass; eslint on every
touched file → clean. Spot-run the test files of the three most-annotated
modules (approval-ledger via tests/gate-hook-revival.test.js + w02 ledger
tests, menu-screens via tests/menu-screens.test.js, task-registry via
tests/task-registry.test.js) to prove zero behavior drift.

## Execution Plan (Steps 8-16)
### Step 8: TEST — record the current 94-error output verbatim as the red.
### Step 9: PREPARE — read each file's error sites from disk before annotating.
### Step 10: IMPLEMENT — items 1–4.
### Step 11: REVIEW — diff must contain ONLY comments/JSDoc/casts + the two
count lines + the fixture — any behavioral hunk is a violation UNLESS reported
as a real-bug fix.
### Step 12: OPTIMIZE — n/a.
### Step 13: SECURE — no `@ts-ignore`/`@ts-nocheck` anywhere (forbidden — they
hide, not fix).
### Step 14: VERIFY — the Test Plan above; no git; no full suite.
### Step 15: DOCUMENT — n/a (annotations ARE documentation).
### Step 16: FINAL-REVIEW — report error count before/after per file, casts
used with reasons, any real bugs found.

## Decisions Taken Under Ambiguity

1. **Fix at the SOURCE, not at the consumer.** 18 of the 94 errors (6 in
   `src/areas/inbox.js`, 12 in `src/lib/menu-screens.js`) were a single root
   cause: `src/lib/inbox.js`'s `parseFrontmatter` returned an un-annotated `{}`,
   so every consumer saw inbox items as `{ path: string }` and every other
   frontmatter field was "does not exist". Annotating the ONE producer
   (`{[key: string]: string}`) cleared all 18 rather than casting at 18 call
   sites. Same for `RELEASE_TYPES` in `src/tabs/overview.js` (one `@type` at the
   declaration cleared both errors) and `checkAllInvariants` (one `@param` fix
   cleared its own error plus `SessionStart.js`'s).

2. **`@ts-ignore` / `@ts-nocheck` used ZERO times** — forbidden by the plan; they
   hide errors instead of fixing them. Verified absent from the whole tree.

3. **Casts are precise types wherever a precise type exists.** `any` was the last
   resort only. Where the shape was genuinely expressible I wrote a real type:
   `LedgerEntryInput` (a `@typedef` in `approval-ledger.js`), `Error & {code?,
   details?}` in `budget.js`, the `'tie'|'A'|'B'` literal union in
   `comparator-agent.js`, `'none'|'counsel-directed'|'client-only'` in
   `privilege-posture.js`, `'business'|'implementation'|'execution'` in
   `sections.js`, and the wedged-task element type in `task-registry.js`. Every
   remaining `any` cast is one line and carries a same-line reason (listed in the
   report).

4. **Date−Date arithmetic resolved by cast, NOT by `.getTime()`.** Four sites
   (`state.js` ×2, `quality-state.js`, `tabs/vision.js`) subtract Dates, which
   JavaScript coerces via `valueOf()`. `.getTime()` would be behavior-identical
   and arguably cleaner, but Step 11 REVIEW mandates the diff contain ONLY
   comments/JSDoc/casts — an expression rewrite would be a code hunk. Chose the
   cast to honor the annotation-only contract literally. Same reasoning for
   `isNaN(value)` in `quality-gate.js` (global `isNaN` already does the identical
   ToNumber coercion internally).

5. **ONE non-annotation source hunk, reported rather than hidden.**
   `src/commands/menu.js` had two `const { route } = require('../lib/menu-screens')`
   destructures in disjoint branches, which checkJs reports as TS2300 duplicate
   identifier. No annotation can resolve a duplicate binding, so the second was
   aliased to `routeDashboard` — a local variable rename, provably
   behavior-identical (same module, same function, same arguments). Proven live:
   spawning the non-interactive dashboard still renders and still attaches the
   compliance ride-along.

6. **Two documentation defects were real and are fixed** (see report headline):
   `checkFolder`'s `@returns` in `human-gate-check.js` omitted the `reason` field
   it actually returns, and `mapPipSeverity` in `dependency-auditor.js` was
   documented `@param {string}` while comparing its argument numerically against
   the 9/7/4 CVSS bands. Neither is a runtime bug — both are contracts that lied.

7. **The w10 fixture was TIGHTENED, never weakened.** Scenario 8's intent (the
   no-live-ids age backstop still orphans a stale task) is preserved by aging the
   `implement` task to 150 minutes, past R2-A's 120-minute kind-aware floor. The
   complementary assertion (a 45-minute implement task is NOT orphaned) was added
   and both are seeded into the SAME registry and reconciled in the SAME pass, so
   neither half can be satisfied by a fix that breaks the other. The floor is
   DERIVED from the production constant
   (`taskReconcile.DEFAULT_STALE_MS_BY_KIND.implement`), never duplicated as a
   literal, so the fixture tracks the contract if the floor moves. 45 minutes sits
   inside the implement floor but above the OLD flat 30-minute floor, so a
   regression back to the flat floor is now caught rather than silently tolerated.

8. **CLAUDE.md test count re-counted at execution time: 257** (`ls tests/*.test.js
   | wc -l`), not the 256 the document claimed. Both occurrences corrected;
   `tests/doc-counts.test.js` verifies doc against live disk and passes.

## Execution Record (Steps 8-16)
- [x] **Step 8 TEST** — red captured: `tsc --noEmit` = **94 errors** across 32
      files; `tests/w10-live-agent-reconcile.test.js` = 1 failing (scenario 8).
- [x] **Step 9 PREPARE** — every error site read from disk before annotating.
- [x] **Step 10 IMPLEMENT** — items 1–4 complete.
- [x] **Step 11 REVIEW** — diff is annotations/JSDoc/casts + the two count lines
      + the fixture, plus the ONE reported `routeDashboard` alias (decision 5).
- [x] **Step 12 OPTIMIZE** — n/a.
- [x] **Step 13 SECURE** — zero `@ts-ignore`, zero `@ts-nocheck`, zero
      `@ts-expect-error` in `src/` and `tests/`.
- [x] **Step 14 VERIFY** — `typecheck:raw` = **0 errors** (exit 0); ratchet test
      green at baseline 0; 782 spot-run tests pass, 0 fail, 0 skipped; eslint
      clean on all 34 touched files.
- [x] **Step 15 DOCUMENT** — the annotations ARE the documentation; baseline
      notes rewritten to record the 64 → 0 ratchet.
- [x] **Step 16 FINAL-REVIEW** — complete. Awaiting Gate 3 (human).
