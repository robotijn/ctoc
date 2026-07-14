---
title: "R5-C — Delete the dead functional tab module and carve its tests cleanly"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/tabs/functional.js"
  - "tests/tab-modules.test.js"
---

# R5-C — functional.js is dead: delete it, carve its tests, keep the others

`src/commands/menu.js` no longer requires `src/tabs/functional.js` (the
confirm-assign path that was its only live caller is gone with assignDirectly).
The file fence flags it as unreachable (correctly). `overview.js`, `review.js`,
`tools.js` are STILL required by menu.js — they stay.

## Implementation Details

1. **Delete `src/tabs/functional.js`** (plain unlink).
2. **Carve `tests/tab-modules.test.js` surgically** — remove ONLY the
   functional-specific coverage, preserve everything for overview/review/tools:
   - the `describe('functional.render()', ...)` block (~lines 329-365),
   - the `describe('functional.handleKey() - Specific Actions', ...)` block
     (~lines 664-736), INCLUDING the `actions.assignDirectly is GONE` test if it
     lives there (that assertion is better kept — MOVE it to a surviving block,
     e.g. a top-level `describe('assignDirectly removed', ...)`, so the
     require-time guard that assignDirectly stays deleted is preserved),
   - any entry for `'functional'` in a SHARED-PATTERN list/loop (the
     `List Navigation` / `Action Menu Navigation` describes at ~488/587 iterate
     a tab array — remove `'functional'` from that array, keep the others),
   - the file header comment line `Tests: overview.js, functional.js, ...` →
     drop `functional.js`.
   DO NOT touch overview/review/tools describe blocks or assertions. Read the
   whole file first and carve by whole `describe`/array-entry boundaries — never
   a line-range delete that could clip an adjacent block. After carving, grep the
   test file for `functional` and confirm only intentional residue remains
   (comments explaining the removal are fine; no live `require('../src/tabs/functional')`,
   no `loadTab('functional')`).
3. Preserve the `assignDirectly is GONE (require-time)` guard — it is the
   permanent proof the stamp-less todo insertion path stays deleted. It must
   survive in a block that still runs.

### Wiring — the live call sites (MANDATORY)
Deleting a dead file removes a require edge; nothing to wire. The file fence
(`.ctoc/reachability-baseline.json`, ratchet at 0) must stay at 0 unreachable
AFTER the delete — the delete is what RESTORES it (functional.js was the newly
unreachable file). Confirm `analyze()` reports 0 unreachable when done.

### Test Plan (TDD-Red first is inverted here — this is a deletion)
Run `node --test tests/tab-modules.test.js` BEFORE (it passes with functional
present) and AFTER the carve (it passes with functional gone, overview/review/
tools intact). Assert by count: the surviving describe blocks for overview/
review/tools are unchanged (same test count for those). Run the file fence:
`node -e "console.log(require('./src/lib/reachability').analyze(process.cwd()).unreachable)"`
→ `[]`. Run `tests/reachability.test.js` and `tests/iron-loop-enforcer.test.js`
→ green (both flagged functional.js; both clear when it is gone).

## Execution Plan (Steps 8-16)
### Step 8: TEST — run tab-modules.test.js + reachability.test.js +
iron-loop-enforcer.test.js now; record which fail (the fence ones) and the
overview/review/tools test counts to preserve.
### Step 9: PREPARE — read tests/tab-modules.test.js IN FULL; map every
functional reference and every shared-pattern loop.
### Step 10: IMPLEMENT — delete the file; carve the tests by block boundaries;
relocate the assignDirectly-gone guard.
### Step 11: REVIEW — grep the test file for `functional`; overview/review/tools
blocks byte-unchanged; the relocated guard runs.
### Step 12: OPTIMIZE — n/a.
### Step 13: SECURE — n/a.
### Step 14: VERIFY — the three named test files green; the fence reports 0
unreachable; eslint clean; no git.
### Step 15: DOCUMENT — the test header lists only the surviving tabs.
### Step 16: FINAL-REVIEW — report: file deleted, blocks carved, guard
relocated, fence 0, the preserved overview/review/tools counts.

## Decisions Taken Under Ambiguity

1. **Edge-Cases block — carved the three functional-backed tests.** `Tab Modules
   - Edge Cases` mixed one tools test (`handles undefined app properties
   gracefully`) with three that loaded the functional tab (`handles very long
   plan names`, `handles empty plan content`, `handles special characters in
   plan name`). The plan enumerated the render/handleKey/renderActions functional
   blocks but not these. They are functional-specific coverage (they `require`
   the deleted module), so post-deletion they would throw at
   `require.resolve('../src/tabs/functional')`. Carved the three; kept the tools
   test; left a removal comment. Not retargeted to a surviving tab — that would be
   new, unrequested coverage and out of the "carve only" scope.

2. **`functional.renderActions()` describe (Additional Renders) — carved.** Not
   named in the plan's block list but it loaded the functional tab; same
   reasoning as #1.

3. **Relocated the `assignDirectly is GONE (require-time)` guard** to a new
   top-level `describe('assignDirectly removed (R5-B) — no stamp-less todo
   insertion path')` placed immediately above the B1 legacy-removal guard. It
   requires only `../src/lib/actions` and never loads a tab, so it is unaffected
   by the deletion and the permanent proof still runs.

4. **Simplified two now-dead functional references** inside surviving review
   tests: the `if (tabName !== 'functional')` guard in List-Navigation's `empty
   list returns false` became an unconditional assertion (identical behaviour for
   the only remaining tab, review), and a stale `'n' for functional` comment in
   the Unhandled-keys test was rewritten. No overview/review/tools assertion was
   weakened or clipped.

5. **Intentional residue left in place (not functional-tab references):** the
   overview tab's `getPlanCounts({ functional: N })` fixtures and `functional
   count` assertion, review's `'View functional'` renderActions assertion, and a
   mock plan path under `plans/functional/draft/` — these use the word
   "functional" as a plan-*stage* name, not the deleted tab module. Touching them
   would clip overview/review coverage.

## Executor Verification (Steps 8–16)

- **Step 8 TEST (baseline):** tab-modules 73/73 pass; reachability RED (1
  unreachable = functional.js); iron-loop-enforcer RED (2 block findings).
- **Step 10 IMPLEMENT:** deleted `src/tabs/functional.js`; carved
  `tests/tab-modules.test.js` by whole describe-block and array-entry boundaries.
- **Step 14 VERIFY:**
  - `tests/tab-modules.test.js` → 54/54 pass, 0 fail (73 − 19; 20 functional
    tests removed, 1 relocated).
  - Preserved counts equal before → after: overview 7 → 7, review 21 → 21,
    tools 23 → 23.
  - `tests/reachability.test.js` → 5/5 pass (GREEN — was RED).
  - File fence: `analyze().unreachable` → `[]` (0 unreachable; the delete
    RESTORED the ratchet).
  - eslint on the test file → clean (exit 0).
  - No live `require('../src/tabs/functional')` / `loadTabWithMocks('functional')`
    remains.
- **KNOWN, NOT-MY-CHANGE, CANNOT-RESOLVE:** `tests/iron-loop-enforcer.test.js`
  still fails on ONE block finding — `gate-destinations-approved` — which flags
  THIS plan (`plans/todo/00021-…`): it sits at a gate destination (todo/) with a
  frontmatter `approved_by: human` marker but NO approval-ledger entry, and the
  R3-C enforcer refuses to trust forgeable frontmatter markers. This predates the
  carve (the reachability block cleared 2 → 1) and resolving it would require
  writing a Gate-2 approval-ledger entry — a forbidden self-cross of a human gate.
  Surfaced to the coordinator rather than green-washed.
