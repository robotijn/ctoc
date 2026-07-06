---
approved_by: human
approved_at: 2026-07-06T08:04:11.838Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-05T18:04:48.169Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-05T17:49:12.584Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "CF1 — Invalidate the read cache on every state write (always read fresh)"
type: functional
status: functional
created: 2026-07-04
program: ctoc-correctness
priority: HIGH
depends_on: []
files:
  - src/lib/actions.js
  - src/lib/sync.js
  - src/lib/stale-cleanup.js
  - src/lib/vision-decomposer.js
  - src/lib/inbox.js
  - agents/_shared/ancestry-read.md
  - tests/cache-freshness.test.js
---

# CF1 — Invalidate the read cache on every state write

## 1. ASSESS — Problem Understanding

### Business Context

Direct CTO directive (2026-07-04): **"Make certain CTOC is always reading the
files, not doing it from memory."** CTOC must never serve dashboard/state reads
from stale memory when the underlying plan files have changed.

### Current State

`src/lib/cache.js` is a 5-second in-process TTL memoize wrapping the
filesystem-heavy count reads: `getPlanCounts` and `getVisionCounts`
(`src/lib/state.js:93,330`), and the cheap stale count relies on a cache hit
(`src/lib/menu-screens.js:270`). The module exports `invalidate(keyPrefix)` with
the doc "Useful when an operation writes state we know invalidates cached reads."

**But `invalidate()` is never called anywhere.** After a state-mutating
operation — `approvePlan`, `movePlan`, `startExecution`, `completeExecution`, or
any plan-file write — a subsequent read within the 5s TTL (and for the entire
lifetime of the long-lived interactive TUI process) returns the STALE cached
counts instead of re-reading the moved/updated files.

The per-invocation slash-command menu (`node menu.js` = fresh process, empty
cache) mostly dodges this, but the invariant "reads reflect current disk state"
is violated by construction and the TUI path is directly exposed.

### Impact

- A plan that just crossed a gate can still show under its old stage's count for
  up to 5s / for the life of the TUI — the dashboard "lies" about disk state.
- Violates the binding "always read files fresh, never memory" rule.

## 2. ALIGN — Approach (resolve at Gate 1 / planning)

- **(A) Invalidate on write — RECOMMENDED.** Call `cache.invalidate()` at the end
  of every state-mutating operation so the next read recomputes from disk. The
  cheapest, safest wiring point is the shared low-level write primitive
  (`movePlan`, through which every stage transition flows) plus any other
  plan/state file writer (marker/status writes, `writeState`). Keeps the perf
  cache for read-only navigation; guarantees freshness after any change.
- (B) Drop the cache entirely — simplest correctness, loses the O(1) render.
- (C) Shorten the TTL to ~0 — degenerate cache; effectively (B) with overhead.

Decide at Gate 1: A (targeted invalidate-on-write, recommended) vs B.

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC user, **I want** the dashboard/state counts to always reflect the
current plan files immediately after any change, **so that** I never see stale
numbers served from memory.

### BDD Scenarios

- [x] **Scenario: a plan move busts the cached counts**
  Given `getPlanCounts` has been called (populating the cache) for a project
  When a plan is moved between stages (e.g. `movePlan` / `approvePlan`)
  And `getPlanCounts` is called again within the TTL window
  Then it returns counts reflecting the MOVE (recomputed from disk), not the
  stale cached value

- [x] **Scenario: every mutating op invalidates**
  Given the read cache is populated
  When any of approvePlan / movePlan / startExecution / completeExecution runs
  Then the cache is invalidated (the next count read recomputes from disk)

- [x] **Scenario: read-only navigation still benefits from the cache**
  Given no write occurs
  When the dashboard render calls the memoized counts multiple times within TTL
  Then the cache still serves the repeated in-render reads (perf preserved)

- [x] **Scenario: vision counts also fresh**
  Given getVisionCounts is cached
  When a vision-stage plan moves
  Then the next getVisionCounts recomputes

- [x] **Scenario: behavior unchanged elsewhere**
  Given the full suite
  Then it stays green (this is a correctness wire-up, no feature change)

### In Scope

- Wire `cache.invalidate()` into every state-mutating operation (via the shared
  `movePlan` write path + any other plan/state file writer) in `src/lib/actions.js`.
- A `tests/cache-freshness.test.js` proving move → fresh recompute (the stale-read
  regression guard).
- **Strengthen `agents/_shared/ancestry-read.md`** (prong 2 of the directive): add
  a binding mandate that every agent READ the actual current target files (code +
  full plan ancestry) FRESH before acting and TRUST THE CODE over any brief's
  quotes/summary/recollection — reporting discrepancies. This is the
  agent-definition-level enforcement of "never act from memory."

### Out of Scope

- Removing/replacing the cache (keep the perf; approach A).
- The interactive TUI render loop itself (the invalidate-on-write fix covers it).

## Notes

- Origin: 2026-07-04 CTO directive "always read files, not memory". Root cause
  verified by reading `src/lib/cache.js` (invalidate exists, never called) +
  `state.js` (memoized counts). Real numbers/behavior confirmed against current code.

---

# Implementation Details

> Blueprint produced by reading the ACTUAL current files fresh from disk on
> 2026-07-05 (obeying the very directive CF1 realizes). Every line/signature/key
> below was verified against the code, not any brief or memory. Discrepancies
> against the ASSESS section are reported inline under "Discrepancies vs. ASSESS".

## Architecture Decision (ADR)

- **Context.** `src/lib/cache.js` memoizes three filesystem-heavy count reads
  behind a 5 s TTL. Its `invalidate(keyPrefix)` primitive exists but is called
  from **nowhere** in `src/lib/`, `src/tabs/`, or `src/commands/` (verified by
  `grep -rln "invalidate(" src/lib src/tabs src/commands` → only `cache.js`
  itself defines it). Every state-mutating operation therefore leaves stale
  memoized counts live for the rest of the TTL / process life.
- **Decision.** Approach A — **clear-all `invalidate()` on write**, centralized at
  the single shared write primitive `movePlan` PLUS the handful of non-move
  writers that change count-relevant on-disk state. Use the no-arg clear-all form
  (`invalidate()` → `_store.clear()`), NOT targeted `invalidate(keyPrefix)`.
- **Consequences.** Cheapest and impossible-to-miss: any new count-family added
  later is automatically busted. Cost is negligible — writes are rare and
  human-paced; blowing a 5 s in-process cache on a write costs one extra readdir
  sweep on the next render. Read-only navigation keeps full cache benefit (no
  write ⇒ no invalidation ⇒ cache hit within TTL). No behavior change beyond
  freshness.

### Rejected alternatives
- **Targeted `invalidate('getPlanCounts')` per read-family.** Rejected: requires
  every writer to know the full set of affected keys; a forgotten key silently
  reintroduces the bug — exactly the failure mode CF1 exists to kill. Clear-all
  cannot miss a key.
- **(B) Drop the cache / (C) TTL→0.** Out of scope per ALIGN — loses the O(1)
  dashboard render the cache was built for.

## Memoized-read inventory (verified fresh from disk)

Every consumer of `cache.memoize(...)` — the complete set that a write must bust:

| # | Function | File:line (definition) | `memoize` key prefix | Cache key shape | Consumed by |
|---|----------|------------------------|----------------------|-----------------|-------------|
| 1 | `getPlanCounts` | `src/lib/state.js:93` | `'getPlanCounts'` | `getPlanCounts::<projectPath\|undef>` | `menu-screens.js:245` (`dashboardPipeline`), dashboard table |
| 2 | `getVisionCounts` | `src/lib/state.js:330` | `'getVisionCounts'` | `getVisionCounts::<projectPath\|undef>` | `menu-screens.js:246` (`dashboardPipeline`) |
| 3 | `getInboxCounts` | `src/lib/inbox.js:214` | `'getInboxCounts'` | `getInboxCounts::<root\|undef>` | `menu-screens.js:192, 271` (stale/inbox counts) |

Confirmed the ONLY three `memoize(function ...)` call sites via
`grep -n "memoize(function" src/lib/state.js src/lib/inbox.js`. `cache.js`
consumers = these three; nothing else imports `memoize`.

**Clear-all decision rationale (targeted vs clear-all):** because `getInboxCounts`
(inbox.js) is a THIRD family the ASSESS section did not enumerate, a targeted
approach would have to invalidate three distinct prefixes at every writer and
stay in sync as families are added. Clear-all (`invalidate()` → `_store.clear()`)
busts all three (and any future family) in one call. **Decision: clear-all.**

## Invalidate() choke points (exact functions + lines, from the code READ)

The write graph in `src/lib/actions.js`, traced fresh:

- **`movePlan(planPath, destination, projectPath)` — `actions.js:46`.** The shared
  `renameSync` primitive. EVERY stage transition flows through it:
  `approvePlan` (`:107`), `rejectPlan` (`:275`), `removeFromQueue` (`:353`),
  `assignDirectly` (`:360`), `startExecution` (`:421`), `completeExecution`
  (`:460`), `cleanupStaleInProgress` (`:724`) all call `movePlan`. Invalidating at
  the END of `movePlan` (after `renameSync`, before `return newPath`) covers all
  seven callers with one line. **PRIMARY CHOKE POINT.**

- **Non-move writers that change count-relevant on-disk state but do NOT call
  `movePlan`** — each needs its own `invalidate()` because a `rename` never runs:
  - **`approvePlan` — `actions.js:99`** writes the human-approval marker into the
    plan file (`safeFs.writeFileSync`) BEFORE calling `movePlan`. The subsequent
    `movePlan` at `:107` already busts the cache, so approvePlan needs **no
    separate call** — the move covers it. (Documented so the implementer does not
    double-add.)
  - **`applyIronLoop` — `actions.js:161`** rewrites the plan file in place (adds
    `iron_loop: true` + Steps 8-16) via `writeFileSync` at `:185`. Called from
    `approvePlan` (→ followed by a move) and `assignDirectly` (→ followed by a
    move). Both are move-followed, so the move busts it; **no separate call
    needed** (the in-place edit does not change *counts*, only file content).
  - **`rejectPlan` — `actions.js:272`** writes revision content in place, then
    calls `movePlan` at `:275`. Move covers it. **No separate call.**
  - **`completeExecution` (force path) — `actions.js:456`** writes the
    FORCE-warning in place, then `movePlan` at `:460`. Move covers it. **No
    separate call.**
  - **`createCanvas` — `actions.js:681`** writes a NEW `plans/canvas/<slug>.md`
    file (`writeFileSync`) and does NOT call `movePlan`. This CHANGES
    `getPlanCounts().canvas`. **Needs its own `invalidate()`** at the end (after
    `writeFileSync`, before `return`). **SECONDARY CHOKE POINT.**
  - **`deletePlan` — `actions.js:290`** `unlinkSync` removes a plan file, changing
    counts, no `movePlan`. **Needs its own `invalidate()`** after `unlinkSync`.
    **SECONDARY CHOKE POINT.**
  - **`moveUpInQueue` / `moveDownInQueue` — `actions.js:294,323`** only `utimesSync`
    (reorder within todo). Counts are unchanged, but FIFO ORDER changes and
    `readPlans` sorts by birthtime — the cached *counts* are still correct so this
    is not strictly required. **Decision: add `invalidate()` anyway** (cheap,
    consistent "every write busts" invariant, and defends against any future
    count that becomes order-sensitive). Documented under "Decisions Taken Under
    Ambiguity".
  - **`initBackgroundAgent` / `writeStatus` / `clearStatus`** write
    `.ctoc/`-side status sidecar files, NOT plan files. `getPlanCounts` counts
    `*.md` in stage dirs (unaffected). `getInboxCounts` counts questions/decisions/
    gates/stale — status writes do not change those counts. **No invalidate
    needed**; documented so the implementer does not over-wire.
  - **`setAgentStatus` / `clearAgentStatus` (state.js)** write
    `.ctoc/state/agent.json` — not counted by any memoized read. **No invalidate.**

### Choke-point summary (what the implementer wires)

| Choke point | File:line | Why | Call to add |
|-------------|-----------|-----|-------------|
| `movePlan` (end) | `actions.js:~58` (after `renameSync`, before `return newPath`) | Covers all 7 stage-transition callers | `invalidate();` |
| `createCanvas` (end) | `actions.js:~682` (after `writeFileSync`, before `return`) | New canvas file changes `getPlanCounts().canvas`; no move | `invalidate();` |
| `deletePlan` (end) | `actions.js:~291` (after `unlinkSync`) | Removes a plan file; no move | `invalidate();` |
| `moveUpInQueue` (end) | `actions.js:~319` (before `return true`) | FIFO reorder write; consistency (see ambiguity note) | `invalidate();` |
| `moveDownInQueue` (end) | `actions.js:~347` (before `return true`) | FIFO reorder write; consistency (see ambiguity note) | `invalidate();` |

Import once at top of `actions.js`: `const { invalidate } = require('./cache');`.

## Correctness invariant (state + test)

**INVARIANT.** After ANY count-changing mutating op completes, the next
`getPlanCounts` / `getVisionCounts` / `getInboxCounts` for the same root
recomputes from disk (does not return the pre-write cached value). Conversely,
when NO write occurs, repeated count reads within the TTL are served from cache
(the underlying `*Impl` fn is NOT re-invoked). Perf preserved; freshness
guaranteed.

## Discrepancies vs. ASSESS (reported, per the directive)

1. **ASSESS names two memoized reads + "the cheap stale count relies on a cache
   hit" — actual is THREE distinct memoized families.** `getInboxCounts`
   (`inbox.js:214`) is itself memoized (it IS the stale-count source at
   `menu-screens.js:271`), not merely a downstream cache-hit consumer of the
   count reads. Clear-all covers it; a targeted design would have missed it.
   → reinforces the clear-all decision.
2. **ASSESS line "the shared low-level write primitive (`movePlan`) plus …
   `writeState`"** — there is **no `writeState` function** in the codebase. The
   real non-move writers are `createCanvas`, `deletePlan`, and the queue-reorder
   pair (see choke-point table). Trust the code: wire those, not a non-existent
   `writeState`.
3. **`approvePlan` marker write does NOT need a separate `invalidate()`** — it is
   always followed by `movePlan`, which busts the cache. ASSESS implied per-marker
   wiring; the code shows the move already covers it.

## Files to change (implementation order)

1. `src/lib/cache.js` — **no change** (API already correct; read-only reference).
2. `src/lib/actions.js` — **MODIFY**: import `invalidate`; add `invalidate()` at
   the five choke points above. (Depends on nothing new.)
3. `tests/cache-freshness.test.js` — **CREATE**: behavioral regression guard
   (written FIRST per TDD — fails before step 2, passes after).
4. `agents/_shared/ancestry-read.md` — **MODIFY** (prong 2): append the
   read-fresh-and-verify mandate. Independent of 1-3.

### Dependency graph
```
tests/cache-freshness.test.js --exercises--> actions.js (movePlan/approvePlan/
     start/complete/createCanvas/deletePlan) --calls--> cache.invalidate()
actions.js --already-imports--> state.getPlanCounts / (via test) getVisionCounts
agents/_shared/ancestry-read.md  (doc-only, no code dep)
```
No cycles. No orphaned nodes.

## Prong 2 — `agents/_shared/ancestry-read.md` strengthening text

**Testing convention check (verified):** `tests/agent-modernization.test.js:34`
only asserts the file **exists** and `content.length > 100`; it does NOT pin the
body text. `tests/lib-cmd2-batch.test.js` "ancestry" hit is an unrelated
`os.tmpdir()` path comment. **No test pins ancestry-read.md content**, so
APPENDING is safe and keeps both green (length only grows). Keep ALL existing
content; append a new section at the end.

**Exact text to append (verbatim) at the end of `ancestry-read.md`:**

```markdown

## Read fresh, trust the code (CF1 directive — binding)

**Always read files, never memory.** Before acting, every agent MUST read the
actual CURRENT target files fresh from disk — the code you will change AND the
full plan ancestry (vision → canvas → functional → implementation). Do NOT act
from a summary, a brief's quotes, a recollection, or a prior turn's paraphrase.

**Trust the code over the brief.** When the dispatching brief, the plan prose, or
any summary conflicts with what the file on disk actually says, the file on disk
wins. Report the discrepancy explicitly (name the file, the claimed value, and
the real value) — do not silently follow either; surface it so the human sees the
drift.

This is the agent-definition-level enforcement of CF1's runtime rule (the read
cache is invalidated on every write so counts are always recomputed from disk).
Same principle at the agent layer: recompute your understanding from the files,
every time, not from memory.
```

## Execution Plan (Iron Loop Steps 8-16)

> **Steps 8-16 completed 2026-07-05.** All boxes below checked; results captured
> in the second "Execution Plan (Steps 8-16)" block and "Execution decisions".

### Step 8: TEST (TDD Red)
Write `tests/cache-freshness.test.js` using `node:test` + `node:assert/strict`
BEFORE touching `actions.js`. Use `mkdtempSync(path.join(os.tmpdir(), 'ctoc-cf1-'))`
tmp roots with a real `plans/<stage>/` layout; call the real `actions` API and
`state` reads with an explicit `projectPath` (all count fns accept it). Use
`cache._debug()` and `cache.invalidate()` from `../src/lib/cache`. Named tests
mapping every BDD AC:
- [x] `AC1_move_busts_plan_counts` — call `getPlanCounts(root)` (populate); move a
      plan `todo`→`in-progress` via `actions.movePlan(...)` (or `startExecution`);
      call `getPlanCounts(root)` again WITHIN TTL; assert `todo`/`inProgress`
      counts reflect the move. **FAILS before the fix (returns stale cached
      counts), passes after.** This is the stale-read regression guard.
- [x] `AC2_every_mutating_op_invalidates` — parametrized over
      `approvePlan` (functional→implementation), `startExecution`,
      `completeExecution` (with a plan that passes `validateForReview`, or
      `force:true`): each leaves the next `getPlanCounts` fresh. Assert via
      `cache._debug().size === 0` immediately after the op (clear-all empties the
      store) AND a fresh count read reflects disk.
- [x] `AC3_readonly_preserves_cache` — populate via `getPlanCounts(root)`; call it
      again WITHIN TTL with NO write between; assert the underlying impl is NOT
      recomputed. Verify by asserting `cache._debug().size` is unchanged and the
      cached entry key `getPlanCounts::<root>` is still present between the two
      reads (perf preserved). (Counter-spy alternative: wrap via a call count on a
      temp memoized fn to prove no recompute.)
- [x] `AC4_vision_counts_fresh` — call `getVisionCounts(root)` (populate);
      change vision state on disk (add/move a `plans/vision/*.md` or flip a
      `- Status:` line) through the real write path (`movePlan` from vision, or a
      direct vision write that must be a wired choke point); call
      `getVisionCounts(root)` again WITHIN TTL; assert it recomputes.
- [x] `AC5_suite_stays_green` — implicit: whole run `node --test tests/*.test.js`
      shows `# fail 0` (asserted at Step 14, not a standalone case).
Each test has ≥1 meaningful assertion; error/edge paths (empty stage dir → 0
counts) included; no order dependence (fresh `mkdtempSync` per test); no mocked
core logic.

### Step 9: PREPARE
- [x] No new dependencies (pure `node:` builtins + existing `safe-fs`).
- [x] Confirm `src/lib/cache.js` exports `invalidate` and `_debug` (it does).
- [x] Confirm all three count fns accept an explicit `projectPath`/`root` arg (they
      do) so tests can use isolated tmp roots.

### Step 10: IMPLEMENT
- [x] `src/lib/actions.js`: add `const { invalidate } = require('./cache');` to the
      import block (top, near the other `require('./...')` lines).
- [x] `movePlan` (`:46`): add `invalidate();` after `safeFs.renameSync(...)` and
      before `return newPath;`.
- [x] `createCanvas` (`:630`): add `invalidate();` after the final
      `safeFs.writeFileSync(filePath, template);` and before `return { ... }`.
- [x] `deletePlan` (`:289`): add `invalidate();` after `safeFs.unlinkSync(planPath);`.
- [x] `moveUpInQueue` (`:294`) and `moveDownInQueue` (`:323`): add `invalidate();`
      before `return true;`.
- [x] Do NOT add invalidate to `approvePlan`/`rejectPlan`/`completeExecution`/
      `applyIronLoop` marker writes — each is followed by `movePlan`, which busts
      the cache (documented above; avoids redundant calls).
- [x] All fs stays via `safeFs` (unchanged). No `new RegExp` on non-literals
      introduced. Cross-platform (`path.join`, no separators) preserved.

### Step 11: REVIEW
- [x] Self-review: every count-changing writer either calls `invalidate()` or is
      move-followed. No writer that changes `getPlanCounts`/`getVisionCounts`/
      `getInboxCounts` output is missed. Import added once. No behavior change
      beyond freshness.

### Step 12: OPTIMIZE
- [x] Confirm clear-all is the minimal correct wiring (no redundant invalidate on
      move-followed writers). No hot-loop invalidation added (writes are rare).

### Step 13: SECURE
- [x] No new input surface, no path handling change, no regex on untrusted input,
      no secrets. `invalidate()` is a local `Map.clear()` — no injection vector.
      Confirm no `new RegExp`/dynamic regex introduced.

### Step 14: VERIFY
- [x] Run `node --test tests/cache-freshness.test.js` — new tests pass.
- [x] Run the full suite `node --test tests/*.test.js` — `# fail 0`, including the
      unchanged `tests/cache.test.js` and `tests/agent-modernization.test.js`
      (ancestry-read.md append keeps them green).
- [x] Lint / typecheck as configured. Coverage on `actions.js` new lines ≥ 80%
      (each choke point exercised by AC1/AC2/AC4 + a create/delete case).

### Step 15: DOCUMENT
- [x] Update `agents/_shared/ancestry-read.md` with the Prong-2 append block above.
- [x] Brief JSDoc note on `movePlan` that it busts the read cache (one line).

### Step 16: FINAL-REVIEW
- [x] Confirm invariant holds, suite green, ancestry-read strengthened, no scope
      creep beyond the `files:` list (`src/lib/actions.js`,
      `agents/_shared/ancestry-read.md`, `tests/cache-freshness.test.js`).

## Acceptance-criteria → test mapping

| BDD Scenario (CAPTURE) | Implemented in | Named test |
|------------------------|----------------|------------|
| a plan move busts the cached counts | `movePlan` invalidate | `AC1_move_busts_plan_counts` |
| every mutating op invalidates | `movePlan` (covers approve/start/complete) | `AC2_every_mutating_op_invalidates` |
| read-only navigation still benefits from cache | no-write ⇒ no invalidate | `AC3_readonly_preserves_cache` |
| vision counts also fresh | `movePlan`/vision write invalidate | `AC4_vision_counts_fresh` |
| behavior unchanged elsewhere | full suite | `AC5_suite_stays_green` (Step 14) |
| prong 2: agents read fresh, trust code | `ancestry-read.md` append | doc-contract (existence + length; no body pin) |

## Security review
- [x] No path traversal / no user-path handling changed.
- [x] No new input validation surface (`invalidate()` takes no external input).
- [x] No secrets.
- [x] Safe fs only (`safeFs`, existing).
- [x] No `new RegExp` on non-literals introduced.
- [x] No prototype-pollution / command-injection surface.

## Decisions Taken Under Ambiguity
- **Clear-all over targeted invalidate.** Chosen for correctness (cannot miss a
  key, auto-covers the third `getInboxCounts` family and any future family);
  writes are rare so the perf cost is negligible.
- **`moveUpInQueue`/`moveDownInQueue` get `invalidate()` despite counts being
  unchanged by a reorder.** Chosen for a clean "every write busts" invariant and
  future-proofing against order-sensitive counts; cost is one `Map.clear()` on a
  rare, human-paced action.
- **`approvePlan`/`rejectPlan`/`completeExecution`/`applyIronLoop` marker writes
  get NO separate `invalidate()`** — each is move-followed; the `movePlan` call
  busts the cache, so a second call would be redundant.
- **`writeState` from ASSESS does not exist** — wired the real non-move writers
  (`createCanvas`, `deletePlan`, queue reorder) instead. Trust the code.

### CF1 KICKBACK — external (non-actions) writers (2026-07-05)

**Why kicked back:** the actions.js slice was complete, but count-mutating writes
OUTSIDE actions.js still left stale reads — violating CF1's own invariant ("every
count-mutating write busts the cache; always read files, not memory"). Four
modules perform raw plan/inbox-file writes that bypass `actions.movePlan`:
`sync.moveToReviewAfterPush`, `stale-cleanup` (`archivePlan`/`reconcilePlan` via
`_stampAndArchive`, and `deletePlan`), `vision-decomposer`
(`createStub`/`removeStub`/`mergeStubs`), and `inbox`
(`createQuestion`/`createDecision`). Each now busts the cache post-write.

**Fix pattern (obeyed exactly):** `const { invalidate } = require('./cache');`
once per file near the requires; `invalidate()` (no arg → clear-all) called
STRICTLY AFTER the successful `renameSync`/`unlinkSync`/`writeFileSync` and before
the return, so a throwing write never needlessly clears and a successful one
always does. `cache.js` imports nothing → no require cycle introduced anywhere.
inbox.js reused its existing `require('./cache')` (added `invalidate` to the
`memoize` destructure). All four are in `src/lib/` → `require('./cache')`.

**Exact invalidate() call-sites (file:REAL-line, read fresh from the final files):**
- `src/lib/sync.js:18` import; `src/lib/sync.js:142` — `moveToReviewAfterPush`,
  after `safeFs.renameSync(planPath, newPath)` (raw rename into review/;
  changes `getPlanCounts().review` + `getInboxCounts().gatesWaiting`).
- `src/lib/stale-cleanup.js:40` import; `:174` — `_stampAndArchive`, after
  `safeFs.renameSync(planPath, dest)` (used by `archivePlan`/`reconcilePlan`);
  `:249` — `deletePlan`, after `safeFs.unlinkSync(planPath)`.
- `src/lib/vision-decomposer.js:14` import; `:190` — `createStub` after
  `writeFileSync`; `:307` — `removeStub` after `unlinkSync` (INSIDE the
  `existsSync` guard, so a missing file never clears); `:374` — `mergeStubs`
  after the merged `writeFileSync`.
- `src/lib/inbox.js:21` import (`memoize, invalidate` — reused existing require);
  `:95` — `createQuestion` after `writeFileSync`; `:136` — `createDecision`
  after `writeFileSync`.

**Gate-safety (SP4) CONFIRMED UNTOUCHED (stale-cleanup.js):** `invalidate()` sits
strictly AFTER the write in both `_stampAndArchive` and `deletePlan`. The
stamp-before-rename (M5) ordering — `writeFileSync(stamped)` then
`mkdirSync(doneDir)` then `renameSync` — is byte-for-byte unchanged;
`invalidate()` is inserted only AFTER the `renameSync`, before `_appendLog`. No
reference to `approvePlan` added (D2 structural gate-safety preserved: the module
still imports only `movePlan` from actions + `listStaleCandidates` from inbox +
the new zero-dep `cache`). No gate-marker, fail-closed, or refusal logic altered.
`revertPlan` still routes through `movePlan` (which already invalidates) — left
alone. Verified: `tests/stale-cleanup-human-gate.test.js` → 28/28 pass. A new
negative test (`F2_refused_delete_does_not_clear_cache`) proves a REFUSED delete
(throws before unlink) leaves the cache intact — post-write invalidate confirmed.

**Tests added (tests/cache-freshness.test.js — new describe block, one per
external path):** `F1_moveToReviewAfterPush_busts_plan_and_inbox_counts`,
`F2a_archivePlan_busts_plan_counts`, `F2b_deletePlan_busts_plan_counts`,
`F2_refused_delete_does_not_clear_cache` (gate-safety negative),
`F3a_createStub_busts_plan_counts`, `F3b_removeStub_busts_plan_counts`,
`F3c_mergeStubs_busts_plan_counts`, `F4a_createQuestion_busts_inbox_counts`,
`F4b_createDecision_busts_inbox_counts`. Each populates the real count read
(`getPlanCounts`/`getInboxCounts`) in an isolated `mkdtempSync` tmp project,
performs the real external write, and asserts (a) `cache._debug().size === 0`
immediately after AND (b) the next count read is disk-fresh (not the stale cached
value). No always-green tests; F2a also asserts the gate marker is still stamped.

**RED→GREEN proof:** with the 4 source fixes stashed, all 8 fix-path tests FAIL
(F1, F2a, F2b, F3a, F3b, F3c, F4a, F4b) while the gate-safety negative
(`F2_refused_delete_does_not_clear_cache`) PASSES (needs no fix). With fixes
restored, `node --test tests/cache-freshness.test.js` → **tests 20, pass 20,
fail 0, skipped 0**.

**Verification tallies (2026-07-05):**
- `node --test tests/cache-freshness.test.js` → tests 20, pass 20, fail 0, skipped 0.
- `node --test tests/*.test.js` → **tests 2764, pass 2764, fail 0, skipped 0, todo 0**
  (was 2755; +9 new external-path cases). `stale-cleanup-human-gate.test.js` 28/28;
  `sync.test.js`+`inbox.test.js`+`inbox-stale-stream.test.js` 65/65.
- `npx eslint . --max-warnings 0` → exit 0.
- `npx tsc --noEmit` → 89 errors BOTH on the working tree AND on HEAD (identical
  pre-existing checkJs baseline); this change introduces ZERO new tsc errors, and
  none of the errors sit on an `invalidate()` line (project gate `npm run
  typecheck` unchanged vs baseline).
- Coverage on changed lines: inbox.js 100% line; stale-cleanup.js 99.42% (only
  uncovered = `_stageFromPath` helper 121-122, not a changed line); every one of
  the 8 `invalidate()` call-sites is directly exercised by a passing test (none
  fall in an uncovered range) → 100% of the changed lines covered.

**Decisions taken under ambiguity (this kickback):**
- `removeStub` invalidate placed INSIDE the `existsSync` guard so a no-op remove
  (file already gone) never clears the cache — matches the "only a successful
  write busts" rule.
- `mergeStubs` gets its own invalidate after the merged `writeFileSync` even
  though the subsequent `removeStub` calls also invalidate — the write must bust
  the cache regardless of whether any originals are removed.
- `reconcilePlan` is covered transitively (it calls `_stampAndArchive`, which now
  invalidates) — no separate call needed; F2a exercises the shared primitive.
- Plan NOT moved between stages (stays in `todo/`); Gate 3 is human-only.

### CF1 COMPLETENESS GUARD — self-enforcing drift-catcher (2026-07-06)

**Why added:** the per-path behavioral tests (F1–F4b) pin the writers that exist
TODAY, but nothing stopped a FUTURE `src/lib` writer from mutating a count-relevant
file and forgetting `cache.invalidate()` — the exact drift the CF1 pre-ship review
caught (four modules bypassing `actions.movePlan`). Added ONE self-enforcing guard
`describe` block (`CF1 completeness — every count-mutating writer invalidates`) to
`tests/cache-freshness.test.js` (already in CF1 `files:`) that pins the RULE, so a
new un-wired writer FAILS CI. No `src/` touched.

**Ground truth (read fresh from src/lib on 2026-07-06):** the three memoized reads
count `getPlanCounts` → `plans/{canvas,functional,implementation,review,todo,
in-progress,done}/*.md`; `getVisionCounts` → `plans/vision/*.md`; `getInboxCounts`
→ `.ctoc/inbox/{questions,decisions}/*.md` + `plans/{functional,implementation,
review}`.

**Detection heuristic (broad, low-false-negative by design):** a `src/lib/*.js`
file is a candidate count-mutating writer iff it (a) contains a mutating fs op
`(safeFs|fs).(renameSync|unlinkSync|writeFileSync|appendFileSync|cpSync|rmSync)(`
AND (b) references a count-relevant path token (`\bplans\b`/`getPlansDir`/stage
literals/`\binbox\b`/`QUESTIONS_DIR`/`DECISIONS_DIR`/…). Broad whole-file matching
(not per-write-site) is deliberate: a future writer that builds its plan path
inline is still caught. **Safe predicate:** imports+uses `invalidate` from
`./cache`, OR uses `movePlan` (which itself invalidates). All regexes are LITERAL
(no `new RegExp` on non-literals) so the test lints clean.

**WHITELIST (file → reason — the honest residue, verified against each file's
actual write targets; MINIMAL — no real count writer is exempted):**
- `safe-fs.js` — the fs wrapper; writes only what callers pass, owns no count path.
- `state.js` — writes `.ctoc/state/agent.json` + `.ctoc/settings.json` only (reads
  counts, never writes a plan/vision/inbox file).
- `init-project.js` — one-time scaffold (CLAUDE.md/.ctoc/settings/.gitignore) before
  any cache exists.
- `iron-loop.js` — edits a plan body IN PLACE (appends step sections); never
  creates/deletes/moves a plan file → counts invariant.
- `background.js` — `.ctoc/` bg-status sidecar JSON, not a counted `*.md`.
- `config-baseline.js` — `.ctoc/baselines/<ver>/manifest.yaml`.
- `legal-hold.js` — `.ctoc/legal-hold/<id>.yaml`.
- `product-loop.js` — `.ctoc/templates/product-kpis.yaml`.
- `refinement-loop.js` — `.ctoc/loops/<slug>/{journal,letters}`.
- `sections.js` — `.ctoc/state/dashboard-prefs.json`.
- `task-registry.js` — `.ctoc/` task-registry + log JSON (atomic temp+rename).
- `traceability-matrix.js` — `.ctoc/traceability/matrix.yaml`.
- `v8-dispatcher.js` — `.ctoc/audit/dispatches/*.yaml` + `dispatch-grades.yaml`.

A `whitelist is minimal` honesty test asserts every entry is a REAL, currently
broad-flagged, non-busting file — so a whitelist entry cannot silently mask a real
writer or rot into dead weight. (This check already earned its keep: it rejected an
initial `cmd-ide.js` entry that the final tightened regex does not flag.)

**Self-test (proves non-vacuous — the LH1 safe-fs-blindspot pattern):** a synthetic
source that `writeFileSync`s a `plans/todo/*.md` WITHOUT importing invalidate is run
through the predicates and asserted to be FLAGGED (detected ∧ ¬busts); the wired
variant (adds the import + `invalidate()`) is asserted NOT flagged. Additionally
verified end-to-end: planting a real `src/lib/_cf1_planted_drift.js` un-wired writer
makes the guard FAIL naming the file with an actionable fix message; removed after.

**Regression pin:** the 5 known writers (`actions`/`sync`/`stale-cleanup`/
`vision-decomposer`/`inbox`) are asserted detected AND safe AND not-whitelisted.

**Verification tallies (2026-07-06):**
- `node --test tests/cache-freshness.test.js` → tests 24, pass 24, fail 0, skipped 0
  (was 20; +4: self-test, 5-writer pin, the guard, whitelist-honesty).
- planted-drift proof: guard FAILS naming `_cf1_planted_drift.js`; passes after removal.
- `node --test tests/*.test.js` → tests 2768, pass 2768, fail 0, skipped 0, todo 0
  (was 2764; +4).
- `npx eslint . --max-warnings 0` → exit 0.
- Plan NOT moved (stays in `todo/`); Gate 3 is human-only.

### Execution decisions (Steps 8-16, 2026-07-05)
- **Line numbers verified fresh, differed from the blueprint.** Read the current
  `actions.js`; the real `invalidate()` call-sites are: `movePlan` line **63**
  (after `renameSync`), `deletePlan` line **296** (after `unlinkSync`),
  `moveUpInQueue` line **325** (before `return true`), `moveDownInQueue` line
  **354** (before `return true`), `createCanvas` line **690** (after the final
  `writeFileSync`). Import at line **15**. The blueprint's `~58/~682/~291/~319/~347`
  estimates were close but stale; wired the REAL lines read from disk (CF1's own
  rule — the file wins).
- **`renameSync` appears twice** (`movePlan` and `renamePlan`). Only `movePlan`
  got `invalidate()`; `renamePlan` is a same-stage rename that does not change any
  count, so it is intentionally NOT wired.
- **Added `deletePlan` / `moveUpInQueue` / `moveDownInQueue` / `createCanvas`
  coverage to `tests/cache-freshness.test.js`.** Existing suites only mocked the
  queue writers and did not exercise the real `deletePlan` path, so the changed
  lines needed direct exercise to hit ≥80% changed-line coverage. Result: 100%
  of the 6 changed lines covered.
- **Queue-reorder tests assert cache-clear only, not FIFO mechanics.** The
  reorder relies on `utimesSync` (mtime), while the sort is by `birthtime`; the
  reorder outcome is filesystem/timing-dependent and unrelated to CF1. Tests read
  the actual on-disk FIFO order, pick a movable target, assert the call returns
  true and clears the cache, and that counts stay disk-fresh — the CF1 contract.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (`tests/cache-freshness.test.js`, 11 cases)
- [x] Test error conditions (empty-project edge → zero counts)
- [x] Run tests - expect RED (failing): pre-fix `tests 7, pass 2, fail 5` (AC1, all AC2, AC4)

### Step 9: PREPARE
- [x] Install dependencies if needed (none — pure `node:` builtins)
- [x] Check prerequisites (`cache.js` exports `invalidate` + `_debug`; all 3 count fns accept `projectPath`)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (tmp roots via `mkdtempSync`)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (import + 5 `invalidate()` choke points)
- [x] Add error handling (n/a — `invalidate()` is a local `Map.clear()`)
- [x] Wire up integration points (movePlan/deletePlan/queue-reorder/createCanvas)

### Step 11: REVIEW
- [x] Self-review all new code (every count-changing writer invalidates or is move-followed)
- [x] Verify integration points work together (approve/start/complete covered by movePlan)
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations (no invalidate on move-followed writers)
- [x] Optimize critical paths (no hot-loop invalidation; writes are rare/human-paced)
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal — no new path handling)
- [x] Sanitize outputs (n/a)
- [x] No secrets in code
- [x] Safe file operations (`safeFs` unchanged; no `new RegExp` on non-literals)

### Step 14: VERIFY
- [x] Run lint + type check (`eslint . --max-warnings 0` exit 0; typecheck pass 1 fail 0)
- [x] Run ALL tests (TDD Green): `tests 2755, pass 2755, fail 0`; new file `tests 11, pass 11, fail 0`
- [x] Check coverage >= 80% (100% of the 6 changed actions.js lines exercised)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (`agents/_shared/ancestry-read.md` prong-2 append)
- [x] Add JSDoc comments to new functions (movePlan choke-point note; inline `// CF1:` comments)
- [x] Update CHANGELOG if needed (n/a — internal correctness wire-up)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed (AC1 red→green proof captured)
- [x] Ready for human review (Gate 3 — human-only; plan left in todo, NOT moved)
