---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.860Z
gate_crossed: implementation → todo
---

---
title: "W11-s7 — actions.js: real queue-ordering key + delete 5 dead agent-init wrappers (state.js ordering)"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/lib/actions.js
  - src/lib/state.js
  - tests/queue-order.test.js
  - tests/actions-dead-exports-guard.test.js
  - tests/cache-freshness.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s7 — queue ordering + dead agent-init wrapper deletion

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. **Spans BOTH clusters**
> because both changes live in `src/lib/actions.js` and the no-two-slices-edit-the-same-
> source-file rule forces them together. Findings: **H10** (Cluster A, queue reorder) +
> **B2** (Cluster B, 5 dead wrappers). Independent (no dependency).

## Implementation Details

### Architecture Decision (ADR)

**H10 — queue reorder is a silent no-op.** `moveUpInQueue()` (line 422) and
`moveDownInQueue()` (line 452) sort the `todo/` listing by `stat.birthtime` (lines 432,
462) and try to "swap" order via `safeFs.utimesSync(path, atime, mtime)` (lines 443/445,
472/474). `utimesSync` only sets access/modify times — there is **no birthtime parameter**
in Node's fs API, and birthtime is immutable on ext4/APFS. So the sort key never changes;
the second read returns the identical order while the function returns `true` and busts the
cache (parent §H10).

The DISPLAY order is realized in `src/lib/state.js` `readPlans()` — it attaches
`created: stat.birthtime` (line 38) and `files.sort((a,b)=>a.created-b.created)` (line 52,
"FIFO oldest first"). `getNextTask()` (state.js ~286) and the pipeline area both read the
queue through `readPlans(todo)`. So a reorder is only observable if `readPlans` respects a
real, mutable key.

**Two rejected alternatives and the chosen key:**
- *`queue_pos` in plan frontmatter* — REJECTED. Todo plans carry a leading `approved_by`
  marker block (added crossing Gate 2), and `parseMetadata` matches the FIRST `^---…---`
  block — i.e. the marker block, not the main frontmatter — so `metadata.queue_pos` would be
  unreadable for gated plans. Also there is no frontmatter writer in the codebase.
- *mutable mtime* — REJECTED (parent's reasoning): still depends on the OS honoring `utimes`,
  the exact class of bug being fixed.
- **CHOSEN: `.ctoc/state/todo-order.json`** — an ordered array of todo `*.md` basenames.
  Filesystem-independent, auditable (read the JSON), does not touch plan files, and cannot go
  stale on add/remove (a plan not listed falls back to birthtime order). `.ctoc/state/`
  already exists and is used by `state.js` (e.g. `agent.json`).

`readPlans` gains a small, todo-only ordering hook: when
`path.basename(dirPath) === 'todo'` AND `.ctoc/state/todo-order.json` exists, order the
plans by their index in that array (listed first, in order), then any unlisted plans by
`created` (birthtime) — so non-todo stages and un-ordered todo dirs behave EXACTLY as today
(backward compatible; existing fixtures have no todo-order.json → identical sort).
`moveUpInQueue`/`moveDownInQueue` compute the current order, swap the target with its
neighbor, and write `todo-order.json` atomically (temp+rename). Boundary (top/bottom) →
return `false` and DO NOT invalidate the cache (parent edge criterion).

**B2 — 5 dead agent-init wrappers.** Re-verified this slice's premise:
`grep -rnE 'initResearchAgent|initCriticAgent|initDecomposerAgent|initProductOwnerAgent|initReviewAgent'`
over `src/` + `tests/` finds them ONLY as definitions (actions.js lines 497-541) and exports
(lines 1084-1088) — **zero call sites**. `initBackgroundAgent` (line 38) is genuinely live
(called at lines 240, 498, 508, 518, 528, 538, 593 — including the real state-transition
spawns in `approvePlan` and `completeExecution`). Confirmed count = **5**, not 7. Delete the
5 function definitions and their 5 export entries; keep `initBackgroundAgent`. No test
exercises the 5 wrappers (verified — no test references those names), so there is no paired
test to delete; ADD a permanent grep-guard regression test instead.

### Dependency Graph
```
src/lib/state.js   → readPlans gains todo-only ordering via .ctoc/state/todo-order.json
src/lib/actions.js → moveUp/DownInQueue rewrite todo-order.json (atomic); delete 5 wrappers + exports
tests/queue-order.test.js            → drives reorder through the REAL readPlans/getNextTask path
tests/actions-dead-exports-guard.test.js → grep-guard: 5 wrapper names absent from src/ & tests/
tests/cache-freshness.test.js        → existing moveUp/Down cache-bust tests stay green
```
`state.js` and `actions.js` are touched ONLY by this slice (no cross-slice file conflict).

### File Specifications

#### `src/lib/state.js` — MODIFY (`readPlans` ordering only)
- After building `files` and before/replacing the `files.sort((a,b)=>a.created-b.created)`
  at line 52: if `path.basename(dirPath) === 'todo'` and
  `<root>/.ctoc/state/todo-order.json` exists (root = `path.resolve(dirPath, '..', '..')`),
  read the ordered basename array and sort: listed plans by array index, unlisted plans after
  by `created`. Else keep the existing `created` sort. Guard all reads in try/catch → fall
  back to the `created` sort on any error (fail-safe, never throw from readPlans).
- Add a small internal helper `applyTodoOrder(files, dirPath)` (not exported) to keep
  `readPlans` readable. Do not change `readPlans`'s signature or its return shape.

#### `src/lib/actions.js` — MODIFY
- `moveUpInQueue(planPath, projectPath)` / `moveDownInQueue(...)`:
  - Compute the current ordered basename list for `todo/` using the SAME ordering source
    `readPlans`/`state.js` uses (read `todo-order.json` if present, else `readdir` sorted by
    birthtime — reuse a shared helper so swap-order and display-order can never diverge).
  - Find the target's index; boundary (`<=0` for up, `>=len-1` for down) → `return false`
    WITHOUT `invalidate()`.
  - Swap the target with its neighbor in the array; write `.ctoc/state/todo-order.json`
    atomically (temp path incl. `process.pid`, `renameSync` over original); `invalidate()`;
    `return true`.
  - Remove ALL `utimesSync` / `birthtime`-swap code from both functions.
- **Delete** `initResearchAgent` (497-501), `initCriticAgent` (507-511),
  `initDecomposerAgent` (517-521), `initProductOwnerAgent` (527-531), `initReviewAgent`
  (537-541) and their 5 lines in `module.exports` (1084-1088). Keep `initBackgroundAgent`
  and its export.

### Test Plan
`tests/queue-order.test.js` (CREATE, TDD-first):
1. **Reorder actually reorders (H10 core, RED on main):** seed 3 todo plans A,B,C (FIFO).
   `moveUpInQueue(C)`. Re-read the queue via `readPlans(<root>/plans/todo)` (the REAL display
   path) → order is A, C, B. On current `main` (utimes no-op) the order is unchanged → RED.
2. **`getNextTask` reflects the reorder:** after moving a plan to the front, `getNextTask`
   returns it. Drives the live FIFO consumer.
3. **Boundary is a real no-op, not false success (H10 edge):** single-item queue →
   `moveUpInQueue`/`moveDownInQueue` return `false`, order unchanged, and the cache is NOT
   invalidated (assert `cache` size/`_debug` unchanged across the call).
4. **Down then up round-trips** to the original order.

`tests/actions-dead-exports-guard.test.js` (CREATE — permanent regression guard):
5. Read `src/lib/actions.js` and grep `src/` + `tests/` for each of the 5 wrapper names;
   assert zero occurrences of `initResearchAgent`/`initCriticAgent`/`initDecomposerAgent`/
   `initProductOwnerAgent`/`initReviewAgent` (outside this guard test's own literals) and that
   `require('../src/lib/actions')` still exports `initBackgroundAgent`. RED on main (names
   present) → GREEN after deletion. This test is NEW and stays as a guard against the dead
   code reappearing (parent Test strategy).

`tests/cache-freshness.test.js` (MODIFY only if needed): the existing "moveUpInQueue busts
the cache"/"moveDownInQueue busts the cache" tests (lines 219-241) must stay green. Its
target-picking helper reads birthtime (lines 208-214) to choose a movable plan; with the
state-file ordering absent initially, order falls back to birthtime so the helper's
assumption holds. Adjust the helper to read order from the same source if the executor finds
a mismatch. Do not weaken the cache-bust assertions.

### Security Review
- [ ] `todo-order.json` holds only plan basenames (no paths/traversal); written atomically to
      `.ctoc/state/` (a CTOC-owned dir). `readPlans` reads it fail-safe (try/catch → fallback).
- [ ] No user-web input; `planPath`/`projectPath` are internal.
- [ ] Deleting dead exports removes a misleading surface (map matches territory).
- [ ] `readPlans` must never throw on a corrupt `todo-order.json` (fail-safe to birthtime).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/queue-order.test.js` (tests 1-4) and `tests/actions-dead-exports-guard.test.js`
      (test 5). Run — reorder test + boundary test + dead-export guard fail on current `main`.

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:` (actions.js, state.js, queue-order.test.js,
      actions-dead-exports-guard.test.js, cache-freshness.test.js). Re-run the wrapper grep to
      reconfirm zero call sites before deleting.

### Step 10: IMPLEMENT
- [ ] `src/lib/state.js`: add `applyTodoOrder` hook to `readPlans` (todo-only, fail-safe).
- [ ] `src/lib/actions.js`: rewrite `moveUpInQueue`/`moveDownInQueue` onto `todo-order.json`
      (atomic write; boundary no-op without invalidate); delete the 5 dead wrapper functions
      and their 5 export lines; keep `initBackgroundAgent`. No stubs; log choices to
      `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
- [ ] Swap-order and display-order read from the SAME source (cannot diverge). Non-todo stages
      and un-ordered todo dirs behave identically to today. `initBackgroundAgent` intact.

### Step 12: OPTIMIZE
- [ ] Ensure `readPlans` reads `todo-order.json` at most once per call and only for the todo
      stage.

### Step 13: SECURE
- [ ] Security checklist above; confirm `readPlans` never throws on corrupt order file.

### Step 14: VERIFY
- [ ] `node --test tests/queue-order.test.js tests/actions-dead-exports-guard.test.js tests/cache-freshness.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [ ] Comment the new ordering key on `moveUp/DownInQueue` and `readPlans`.
- [ ] **Doc-consistency flag (see Decisions):** `agents/planning/vision-decomposer.md`
      (lines 469, 606) and `agents/planning/product-owner.md` (lines 43, 534) reference
      `initProductOwnerAgent(...)` in PROSE. Deleting the wrapper leaves those prose lines
      pointing at a removed symbol. This slice's `files:` intentionally excludes agent docs
      (parent B2's acceptance criterion greps only `src/` and `tests/`, and the wrapper was
      never actually called). Recommend a follow-up doc-only edit to repoint them at the live
      `initBackgroundAgent(path, AGENT_TYPES.PRODUCT_OWNER, …)` dispatch. Do NOT expand this
      slice's scope to edit agent docs without maintainer sign-off.

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **`.ctoc/state/todo-order.json` over `queue_pos` frontmatter** — todo plans carry a leading
  `approved_by` marker block that `parseMetadata` reads instead of the main frontmatter, and
  no frontmatter writer exists; the state file is filesystem-independent, auditable, and does
  not touch plan files.
- **`readPlans` gets a todo-ONLY, fail-safe ordering hook** — minimal, backward-compatible
  blast radius; every other stage and every existing fixture is unaffected.
- **Queue fix + wrapper deletion share ONE slice** — both edit `actions.js`; the file-
  partition rule forces cohesion (this is why the slice spans both clusters).
- **Confirmed 5 dead wrappers (not 7); `initBackgroundAgent` is live** — deletion is safe;
  agent-doc PROSE references flagged as an out-of-scope follow-up, not silently deleted.
