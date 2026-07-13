---
title: "W11-s8 — legacy tabs: delete 3 dead modules + remove one-keystroke gate crossings (functional/review)"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/tabs/implementation.js
  - src/tabs/progress.js
  - src/tabs/todo.js
  - src/tabs/functional.js
  - src/tabs/review.js
  - tests/tab-modules.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s8 — legacy tab cleanup (dead modules + gate-crossing removal)

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster B. Findings: **B1**
> (3 dead tab modules), **L7/L8** (one-keystroke Gate-1 / Gate-3 crossings). Independent.

## Implementation Details

### Architecture Decision (ADR) — why these six files are ONE slice

All six changes converge on ONE shared test file, `tests/tab-modules.test.js`, which
dynamically loads tab modules (`require(\`../src/tabs/${tabName}\`)`, line 246) and tests
`implementation`, `progress`, `todo` (render + handleKey: lines 368-393, 439-468, 476-535,
896-921, 1047+), AND the `functional` `'3'` / `review` `'5'` gate-crossing paths, AND
parametrized loops `listTabs`/`actionTabs = ['functional','implementation','review','todo']`
(lines 632, 731). Deleting the 3 modules and de-fanging the 2 kept tabs both require editing
this single file. The no-two-slices-edit-the-same-file rule therefore forces them into ONE
cohesive "legacy tabs" slice. (This is the one slice that legitimately exceeds ~3 files;
splitting it would mean splitting a shared test file mid-way — the exact conflict the rule
prevents.) The paired-deletion rule is satisfied *inside* this slice: each dead module's own
tests (its describe-blocks in `tab-modules.test.js`) are removed in the SAME change.

**B1 — 3 dead tab modules.** `src/tabs/implementation.js`, `progress.js`, `todo.js` are
fully-formed render/handleKey modules that NOTHING mounts: verified zero
`require('.../tabs/{implementation,progress,todo}')` anywhere in `src/` or `tests/`.
`src/commands/menu.js` (lines 235-258) imports only the 5 area modules + retains
`overview`/`functional`/`review`/`tools` for drill-in helpers; `tabModules` is keyed solely
by the 5 area ids. `src/areas/pipeline.js`/`agent.js` reimplement the counts these modules
once showed. → DELETE all three.

**L7 — functional tab one-keystroke Gate-1 crossing.** `src/tabs/functional.js`:
action-list entry `{ key: '3', label: 'Approve → implementation draft' }` (line 14) and
`executeAction` `case '3'` (lines 160-169) call `approvePlan(...)` directly — no
`validateForQueue`, no confirm step (unlike the same file's `renderAssignConfirm` flow).
**L8 — review tab one-keystroke Gate-3 crossing.** `src/tabs/review.js`: entry
`{ key: '5', label: 'Approve → done' }` (line 17) and `case '5'` (lines 184-188) call
`approvePlan()` with no `validateReviewToDone` — crossing the ship-gate on one keystroke.

Per L7/L8 ("…or the action/module is removed entirely") and the parent's decision note that
these handlers are already unreachable from the live 5-area TUI (dispatch is keyed only by
the 5 area ids, never `functional`/`review`), the chosen fix is **REMOVE the approve action**
(both the action-list entry and the `case`) from each tab — the minimal, safest change that
guarantees no code path crosses a gate on one unvalidated keystroke, without adding new UI.
The still-live exports of both files are preserved: `functional.js` keeps `render`,
`renderActions`, `renderAssignConfirm`, `handleKey`; `review.js` keeps `render`,
`renderActions`, `renderRejectInput`, `handleKey` (all referenced by `menu.js`).

### Dependency Graph
```
DELETE: src/tabs/implementation.js, src/tabs/progress.js, src/tabs/todo.js
MODIFY: src/tabs/functional.js (remove '3' action + case), src/tabs/review.js (remove '5')
MODIFY: tests/tab-modules.test.js (drop 3 modules' describe-blocks + trim tab arrays +
        update functional/review gate tests + drop todo-only moveUp/Down mocks)
No other file requires the 3 deleted modules (verified). menu.js does NOT import them.
```

### File Specifications

- **`src/tabs/implementation.js`, `src/tabs/progress.js`, `src/tabs/todo.js`** — DELETE.
- **`src/tabs/functional.js`** — MODIFY: remove the `{ key: '3', … }` action-list entry
  (line 14) and `executeAction` `case '3'` (lines 160-169). Keep all four exports. Ensure no
  remaining reference to the removed case; other action keys unchanged (a numbering gap is
  acceptable in an unmounted legacy tab).
- **`src/tabs/review.js`** — MODIFY: remove the `{ key: '5', … }` entry (line 17) and
  `case '5'` (lines 184-188). Keep all four exports.
- **`tests/tab-modules.test.js`** — MODIFY:
  - Remove the `implementation` / `progress` / `todo` render + handleKey describe-blocks
    (their paired-deletion).
  - Trim `listTabs` and `actionTabs` (lines 632, 731) to `['functional','review']`.
  - Remove the `moveUpInQueue`/`moveDownInQueue` mock wiring (lines 126-127) that existed only
    for the deleted todo tab.
  - Update the `functional` `'3'` and `review` `'5'` tests: assert the approve action is GONE
    — driving `handleKey`/`executeAction` with `'3'` (functional) or `'5'` (review) does NOT
    call `approvePlan` (e.g. returns `false` / no state change). Use a spy/mock on
    `approvePlan` asserting it is never invoked by those keys.

### Test Plan (behavior)
1. **Dead modules gone (B1):** a NEW/updated guard asserts `fs.existsSync` is `false` for the
   3 module paths AND greps `src/` + `tests/` for `tabs/implementation|progress|todo` → zero
   matches. (Place this guard inside `tab-modules.test.js`, which this slice owns, to avoid a
   second slice editing a shared guard file.)
2. **No unvalidated Gate-1 crossing (L7):** driving functional `'3'` never reaches
   `approvePlan` (spy asserts zero calls) — or the action does not exist.
3. **No unvalidated Gate-3 crossing (L8):** driving review `'5'` never reaches `approvePlan`.
4. **Kept exports still work:** `functional.render/renderActions/renderAssignConfirm/handleKey`
   and `review.render/renderActions/renderRejectInput/handleKey` remain defined and render
   without throwing (menu.js drill-ins depend on them).
5. **Suite stays green after deletion:** `node --test tests/*.test.js` shows `# fail 0` — no
   test still `require()`s a deleted module (proves paired deletion is complete).

### Security Review
- [ ] Removing the one-keystroke `approvePlan` calls STRENGTHENS the human gates (no path
      crosses Gate 1 or Gate 3 without validation) — never weakens them. W2 owns the real
      four-gate machinery; this slice only removes the legacy bypass (parent Out-of-Scope).
- [ ] Deleting unreachable modules removes a misleading surface (map matches territory).
- [ ] Confirm no dynamic `require` elsewhere resolves the deleted module names at runtime.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Update `tests/tab-modules.test.js`: add the dead-module existence/grep guard (test 1)
      and the gate-crossing-removal assertions (tests 2-3); remove the 3 modules' describe-
      blocks and trim the tab arrays. Run — the guard + gate-crossing tests fail on current
      `main` (modules still exist; `approvePlan` still called by '3'/'5').

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:` (3 deletes + functional.js + review.js +
      tab-modules.test.js). Re-grep to reconfirm zero live `require` of the 3 modules.

### Step 10: IMPLEMENT
- [ ] Delete `src/tabs/implementation.js`, `src/tabs/progress.js`, `src/tabs/todo.js`.
- [ ] `src/tabs/functional.js`: remove the `'3'` action entry + `case '3'`; keep exports.
- [ ] `src/tabs/review.js`: remove the `'5'` action entry + `case '5'`; keep exports.
- [ ] `tests/tab-modules.test.js`: finalize removals/trims per File Specification.

### Step 11: REVIEW
- [ ] Confirm `menu.js` still imports `functional`/`review` for drill-ins and all four exports
      of each remain; no dangling reference to a deleted module or removed case.

### Step 12: OPTIMIZE
- [ ] N/A (deletion reduces surface).

### Step 13: SECURE
- [ ] Security checklist above; verify no gate can be crossed by one unvalidated keystroke in
      either legacy tab.

### Step 14: VERIFY
- [ ] `node --test tests/tab-modules.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0` (proves no orphaned test `require`s a deleted
      module — the suite stays green).

### Step 15: DOCUMENT
- [ ] If `menu.js` comments enumerate legacy tabs, ensure they no longer imply
      implementation/progress/todo exist. (menu.js is NOT edited here; only note if a comment
      is now stale — flag for a follow-up, do not expand scope.)

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Six files, one slice** — all funnel through the shared `tab-modules.test.js`; splitting
  would split a shared test file (the exact conflict the partition rule prevents).
- **Remove the approve action entirely** (vs. wiring validation into a dead handler) — the
  handlers are unreachable from the live TUI; removal is the minimal guarantee that satisfies
  L7/L8 without adding UI.
- **Preserve both tabs' still-live exports** — `menu.js` drill-ins depend on
  `renderAssignConfirm`/`renderRejectInput`/`renderActions`; the files are de-fanged, not
  deleted wholesale.
