---
approved_by: human
approved_at: 2026-07-22T12:10:26.255Z
gate_crossed: implementation → todo
title: "An orphaned in-progress plan is recovered to todo when its builder is gone — the reconciler orphans the task, but nothing re-queues the plan"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/plan-recovery.js"
  - "tests/plan-recovery.test.js"
  - "src/lib/menu-screens.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-22
  reason: >
    WIRED-IS-DONE correction (Operating Lesson 16). The planner split the module
    (this slice) from its only caller (the next slice, 00217), so this slice would
    ship src/lib/plan-recovery.js with NO live caller — which the reachability
    fence correctly rejects (26 -> 27 dead files), and 00217 depends_on this slice,
    deadlocking both. The executor surfaced it and refused to fake a root or
    baseline the dead file. Per the human's standing rule (a module is reachable in
    the SAME unit of work that creates it, never a follow-up), the one-line WIRING
    of recoverOrphanedPlans into buildDashboardTable (after reconcileState at
    menu-screens.js:513) is folded into this slice. 00217 remains only the DISPLAY
    of the recovered/surfaced counts, not the wiring.
---

# An orphaned in-progress plan is recovered to todo when its builder is gone

## The gap, read on disk

A build task carries the plan it is building. `src/lib/task-registry.js:176` lists
`plan` in `MUTABLE_FIELDS`; `:704` sets `plan: spec.plan ?? null` on `addTask`; and
`src/lib/actions.js:1376` builds that spec with `plan: plan.name` (the slug). So an
`implement` task's `plan` field is exactly the in-progress plan file's `name`.

`src/lib/task-reconcile.js` already detects a dead builder. On the menu hot path
(`buildDashboardTable` calls `taskReconcile.reconcileState(root, …)` at
`src/lib/menu-screens.js:513`), a `running` task with no live harness agent is
transitioned `running → orphaned` (`task-reconcile.js:367-400`), kind-aware: an
`implement`/`sync` task is only orphaned on age alone once it is older than the 120-min
floor (`:102-105`), never before.

**But orphaning the TASK does nothing to the PLAN.** The plan stays in
`plans/in-progress/`, where the dashboard renders it as work in flight. This was hit
live: a project (V4) had 5 approved plans in `in-progress` after its session ended 3
days ago, no live builder, and they read as active work that nothing was doing. Nothing
re-queues the plan so it can be picked up again.

### Why this is not what `cleanupStaleInProgress` already does

`src/lib/actions.js:1803` (`cleanupStaleInProgress`) moves stale in-progress plans
FORWARD to `review`, gated by `validateForReview` passing, and it runs ONLY from
`startAgent` (`:1431`), not on the menu hot path. It handles orphaned plans whose work
is review-READY. It does the OPPOSITE of what V4 needs: V4's plans are mid-build
(their builders died before Step 14 VERIFY), so `validateForReview` FAILS, so
`cleanupStaleInProgress` SKIPS them (`:1858-1863`, `:1874-1887`) — they are left in
`in-progress` exactly as found, and, because nobody starts a new agent, that sweep
never even runs. This slice fills the missing case: an orphaned build that is NOT
review-ready, recovered BACKWARD to `todo`, on the menu hot path. The two are
complementary and target disjoint sets — this is not a duplicate of that sweep.

## The design — a pure projection over the reconciler's own verdict, never a second judgment

Recovery re-uses `task-reconcile` rather than re-implementing "is the builder dead". The
reconciler already decides that, with all its kind-aware liveness and staleness logic,
and records the answer DURABLY on the task:

- A staleness orphaning (age alone, builder may still be alive) writes
  `result.orphanReason = 'staleness'` and QUARANTINES the task's files
  (`task-reconcile.js:384-389`; the quarantine reserve predicate is `status ===
  'orphaned' && result.orphanReason === 'staleness'` at `:711-716`).
- A confirmed-absent orphaning (live list present, id absent) leaves `result` null
  (`:358-359`, `:367-374` — only the staleness branch writes a marker).
- Once the reconciler is CONFIDENT the agent is gone — confirmed dead (live list
  excludes its id) or PRESUMED dead (aged past `presumedDeadMultiple × the kind floor`,
  i.e. 240 min for an implement) — it RELEASES the files and flips the marker to
  `'confirmed-dead'` / `'presumed-dead'` (`:404-447`).

Recovery reads that persisted verdict and acts on the plan:

| Orphaned implement task's `result.orphanReason` | Files, per the reconciler | Recovery action |
|---|---|---|
| `'staleness'` | still QUARANTINED (builder may still be alive) | **SURFACE only** — do not move |
| null / `'confirmed-dead'` / `'presumed-dead'` | RELEASED | **AUTO-MOVE** `in-progress` → `todo` |

This is the answer to the auto-vs-surface question, and it is TIERED, not global:
auto-move only once the reconciler has decided the builder is gone; surface honestly
while it may still be alive. **Why the tier is load-bearing and not cosmetic:**
re-queuing a plan to `todo` lets `startAgent` (`actions.js:1466`) claim it and start a
NEW agent on the SAME files. `addAndClaim → canRun` checks a candidate only against
RUNNING tasks (`task-registry.js:884-889`) — the orphaned task is not running, and
`addAndClaim` does NOT apply `applyQuarantine`. So auto-moving a staleness orphan would
put a second agent on files the first may still be editing — the exact two-agents-on-one-file
hazard the quarantine exists to stop. Tiering by the reconciler's own quarantine-release
REUSES that safety instead of re-deriving it, and mirrors the 120-min / 240-min
kind-aware floors FOR FREE (recovery never re-computes an age — it reads `orphanReason`).

`in-progress → todo` is a BACKWARD recovery edge. The four human gates are FORWARD edges
(vision→functional, functional→implementation, implementation→todo, review→done), so an
auto-move backward crosses NO gate and needs no approval — the same reasoning under
which `cleanupStaleInProgress` moves plans without a gate.

### Two reuses of existing safety, not new logic

1. **Liveness veto** (mirrors `cleanupStaleInProgress:1837`): never recover a plan that
   still has a NON-terminal `implement` task — a fresh agent has re-claimed it. Because
   `orphaned` is a SOFT terminal (`task-registry.js:85-87`) and a re-claim creates a new
   RUNNING task for the same plan, the OLD orphaned task and a LIVE task can both name
   the plan at once; recovering then would yank the plan out from under the live build.
   The shared lookup is `taskRegistry.findActivePlanTask(reg, plan, 'implement')`
   (`:675`) — truthy ⇒ veto.
2. **Complementary to the forward sweep**: a released orphan that IS review-ready
   (`validateForReview(...).valid === true`) is LEFT for the forward-to-review path;
   recovery only re-queues the NOT-review-ready ones. Disjoint sets ⇒ no race, no
   duplication, existing behavior preserved.

FAIL-OPEN and HONEST throughout (matching the reconciler): an unreadable registry, an
absent `in-progress/`, a per-plan move failure, and a `validateForReview` throw each
degrade to a recorded skip/surface, never a throw and never a silent swallow.

## Implementation Details

### Dependency graph (this slice)

```
src/lib/plan-recovery.js
  ├─ requires  src/lib/task-registry.js   (load, findActivePlanTask, TERMINAL)   [existing]
  ├─ requires  src/lib/actions.js         (movePlan)                             [existing]
  ├─ requires  src/lib/state.js           (getPlansDir, readPlans)              [existing]
  ├─ requires  src/lib/plan-validator.js  (validateForReview)                   [existing]
  ├─ requires  src/lib/safe-fs.js         (cleanup-log write, audited fs)       [existing]
  └─ requires  path                                                             [stdlib]
tests/plan-recovery.test.js ── tests ──▶ src/lib/plan-recovery.js
```

No cycle: `plan-recovery` is a NEW leaf that depends on existing modules; nothing
existing imports it yet (the wiring is the sibling slice 00217, which makes it reachable
from `menu-screens.buildDashboardTable`). `actions.js` already requires `task-registry`;
`plan-recovery` requiring both `actions` (for `movePlan`) and `task-registry` introduces
no new cycle because neither of those requires `plan-recovery`.

### File: `src/lib/plan-recovery.js`
**Action:** CREATE
**Purpose:** Project the task reconciler's orphan verdict onto the plan: re-queue an
orphaned, file-released, not-review-ready in-progress plan back to `todo`; surface a
still-quarantined staleness orphan honestly; never touch a live-re-claimed plan.

#### Exports
- `recoverOrphanedPlans(root, opts = {})` → `{ recovered, surfaced, skipped }`
  - `root` — project root (string). Falsy ⇒ `findProjectRoot()` (mirror
    `cleanupStaleInProgress:1804`).
  - `opts.now` — epoch ms for the cleanup-log timestamp (default `Date.now()`),
    injectable for deterministic tests.
  - `opts.reviewReady` — injectable predicate `(planPath, root) => boolean`, default
    `(p, r) => validateForReview(p, r).valid === true`. Lets tests drive the
    review-ready branch without constructing a fully step-labelled plan.
  - Returns three arrays of `{ plan, taskId, reason }` (skipped: `{ plan, reason }`):
    `recovered` (moved in-progress→todo), `surfaced` (orphaned but still quarantined —
    reported, not moved), `skipped` (live-re-claimed, review-ready-left-for-forward-path,
    validateForReview-threw, or move-failed).
  - **Never throws.** Every I/O boundary has its own try/catch.

#### Algorithm (each numbered step is an independently coverable branch)
1. `root = root || findProjectRoot()`. Load the registry: `try { reg =
   taskRegistry.load(root) } catch { reg = { tasks: [] } }` (load is already fail-open
   on data; the catch guards a bad-root TypeError). No orphaned tasks ⇒ return empties.
2. Read in-progress plans: `readPlans(path.join(getPlansDir(root), 'in-progress'))`
   (fail-open → `[]` when the dir is absent, per `state.js:20-23`). Build
   `bySlug: Map<name, planObj>`.
3. For each task with `status === 'orphaned' && kind === 'implement' && plan != null`
   whose `plan` is a key of `bySlug`, de-duplicated per plan (act once per plan, first
   orphaned task wins):
   a. **Liveness veto** — `taskRegistry.findActivePlanTask(reg, plan, 'implement')`
      truthy ⇒ `skipped` (`reason: 'live registry task — a fresh agent owns this plan'`).
   b. **Still quarantined** — `task.result && task.result.orphanReason === 'staleness'`
      ⇒ `surfaced` (`reason: 'orphaned on staleness alone — its builder may still be
      running; not yet recovered'`). Do NOT move.
   c. **Released, review-ready gate** — call `opts.reviewReady(planPath, root)` inside a
      try/catch. A THROW ⇒ `surfaced` (`reason: 'could not determine review-readiness —
      not recovered'`) — when we cannot tell, we do not act. `true` ⇒ `skipped`
      (`reason: 'review-ready — left for the forward-to-review path'`).
   d. **Recover** — `false` ⇒ move: `try { movePlan(planPath, 'todo', root);
      appendCleanupLog(...); recovered.push({ plan, taskId, reason: 'its builder is no
      longer running — re-queued to todo (partial work may remain in the dead worktree)'
      }) } catch (err) { skipped.push({ plan, reason: 'move failed: ' + err.message }) }`.
      One move failure never aborts the batch.
4. Cleanup-log write mirrors `cleanupStaleInProgress:1866-1897`: append to
   `.ctoc/logs/cleanup.json` `{ plan, from: 'in-progress', to: 'todo', action:
   'recovered', reason, at: new Date(now).toISOString() }` via `safeFs`, best-effort
   (its own try/catch — a broken log never breaks recovery).

#### Cross-platform
`path.join` for every path; `safeFs` (the audited choke point, LH1) for the log; no
shell, no separators, no `os`-specific assumption. `movePlan` already invalidates the
read cache (`actions.js:127`).

#### Idempotency
Once a plan is moved to `todo`, it is no longer a key of `bySlug` on the next pass ⇒
never re-recovered, even though its orphaned task lingers as a soft terminal until the
reconciler's 7-day retention sweep. Proven by test case 9.

### Test Plan

### Tests: `tests/plan-recovery.test.js`
**Action:** CREATE — framework `node:test` (`describe`/`it`/`assert`). Real temp
project per case (write `plans/in-progress/<slug>.md` + `.ctoc/state/tasks.json` via
`taskRegistry.save`/`emptyRegistry`), asserting on the real filesystem outcome — test
the behavior, not the structure. Mirror the fixture style in
`tests/w10-live-agent-reconcile.test.js` and `tests/stale-cleanup-human-gate.test.js`.

| # | Case | Assertion |
|---|---|---|
| 1 | orphaned implement task, `orphanReason: 'presumed-dead'`, plan in in-progress, not review-ready | plan file MOVED to `plans/todo/`, gone from `in-progress/`; in `recovered`; cleanup.json has a `recovered` entry |
| 2 | orphaned, `orphanReason: 'staleness'` | plan file STAYS in `in-progress/`; in `surfaced`; NOT in `recovered` |
| 3 | orphaned, `result: null` (confirmed-absent) | recovered (files free immediately) — released ≡ any reason ≠ `'staleness'` |
| 4 | orphaned `'presumed-dead'` AND a second RUNNING implement task for the same plan | NOT recovered — liveness veto; in `skipped`; file stays in in-progress |
| 5 | orphaned `'presumed-dead'`, review-ready (inject `reviewReady: () => true`) | NOT moved; in `skipped` (`left for the forward-to-review path`) |
| 6 | orphaned `'presumed-dead'`, `reviewReady` THROWS | in `surfaced` (`could not determine review-readiness`); not moved |
| 7 | registry unreadable (write garbage to tasks.json) | no throw; empty result |
| 8 | `plans/in-progress/` absent | no throw; empty result |
| 9 | run twice — after recovery the plan is in `todo` | second call returns empty `recovered` (idempotent) |
| 10 | two orphaned tasks (different ids) for the SAME plan | recovered exactly once; one cleanup.json entry |
| 11 | move fails — a same-slug file already sits in `plans/todo/` (real `movePlan` collision guard, `actions.js:119-124`) AND a second eligible plan exists | first ⇒ `skipped` (`move failed`), second ⇒ `recovered`; batch not aborted |
| 12 | orphaned NON-implement task (`kind: 'review'`) with a `plan` in in-progress | ignored — recovery is implement-only (matches `startAgent`/`cleanupStaleInProgress` keying on `'implement'`) |
| 13 | default `reviewReady` wired — a partial plan that genuinely fails `validateForReview` | recovered via the REAL default predicate (proves the default is the real validator, not only the injected stub) |

Cases 1, 2, 4, 11 are load-bearing: 2 is the two-agents safety tier, 4 the re-claim
race, 11 the fail-open batch resilience. Coverage floor is 99 — every branch above
(the four skip/surface reasons, the two catch arms, the dedup guard) is exercised.

---

### Wiring — the live call sites

| new export | live call site | root it becomes reachable from |
|---|---|---|
| `recoverOrphanedPlans` | `src/lib/menu-screens.js` `buildDashboardTable` (right after the `reconcileState` call at `:513`) | the menu dashboard render — the screen the human opens (`/ctoc:menu`), which is the V4 trigger |

**The call site is implemented in the sibling slice 00217, which `depends_on` this one.**
This module is a leaf until then; 00217 wires it into `buildDashboardTable` and renders
its `recovered`/`surfaced` counts, in the SAME unit of work that makes it reachable. The
two are split because they edit different files and 00217 needs this module's export to
exist first — not because the wiring is deferred. Recovery is deliberately NOT wired into
`startAgent` in this mechanism: `cleanupStaleInProgress` already runs there (the forward
path), and the menu render is the entry point where the phantom "being built" plans are
seen. A second wiring point is the human's to schedule.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/plan-recovery.test.js` in full FIRST and run only it. Cases 1–13 must be
RED (the module does not exist). Record case 1's red (a plan that stays in `in-progress`
when its builder is dead) and case 2's red verbatim — case 2 is the safety tier that
must NOT move a still-quarantined orphan.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Read from disk, and let the CODE win where it disagrees with this plan:
`src/lib/task-reconcile.js:367-447` (the orphan transition, the `orphanReason` markers,
the quarantine-release branch) and `:711-716` (the quarantine reserve predicate — the
single authority on "files still reserved"); `src/lib/task-registry.js:154`
(TERMINAL includes `orphaned`), `:675-681` (`findActivePlanTask`), `:176`/`:704`/`:323`
(`plan` carried on the task); `src/lib/actions.js:94-153` (`movePlan` — the collision
guard and the cache invalidation), `:1803-1904` (`cleanupStaleInProgress` — the liveness
veto and cleanup-log shape to mirror), `:1376` (`spec.plan = plan.name`);
`src/lib/state.js:14-20` (`getPlansDir`, `readPlans` fail-open shape);
`src/lib/plan-validator.js:190` (`validateForReview` return shape and that it reads the
file, so it can throw). Confirm no existing module already imports a `plan-recovery`.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- `src/lib/plan-recovery.js` — `recoverOrphanedPlans` per the algorithm, each I/O
  boundary in its own try/catch, JSDoc on the export documenting the tiered auto-vs-surface
  contract and the reuse of the reconciler's verdict.
- `tests/plan-recovery.test.js` — the thirteen cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
Confirm: no path moves a task whose `orphanReason === 'staleness'`; the liveness veto
precedes every move; the review-ready gate leaves review-ready plans untouched; every
catch records a skip/surface with a reason and continues the batch; the module never
throws for any input (including a null/garbage registry). Confirm recovery re-derives NO
age — it reads `orphanReason` only (so the kind-aware floors are inherited, not copied).

### Step 12: OPTIMIZE
One registry load, one in-progress read, one pass over orphaned tasks. The dedup set and
the `bySlug` map avoid re-scanning. No per-plan registry reload.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
Path handling: plan paths come from `readPlans` (inside `plans/in-progress/`) and
`movePlan`'s own collision guard; no user-supplied path is interpolated. The cleanup-log
`reason` strings describe state, never echo file contents or a stack trace. `safeFs` is
the only fs path. No `execSync`, no shell. Confirm a crafted `plan` slug on a task cannot
escape `plans/` (it names a `bySlug` key derived from a real in-progress filename, so a
task naming a non-resident plan is simply ignored).

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
`node --test tests/plan-recovery.test.js`, then the full gated run `npm test`. Lint at
`--max-warnings 0`. Coverage on `src/lib/plan-recovery.js` at or above the 99 floor
(scoped `src/**`) with 0 skipped. No git operations. Report the real numbers.

### Step 15: DOCUMENT
JSDoc on the module and the export IS the documentation (the tiered contract, the reuse
of the reconciler, the fail-open guarantee). Do NOT edit `CLAUDE.md` — it is not in this
slice's `files:`, and the doc-count is generated by `release.js` (v6.13.13), so a
test-file add does not need it. If a human-facing note belongs in `CLAUDE.md`, that is a
follow-up the human schedules.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Report every Step 8 red verbatim (cases 1 and 2 especially), the Step 14 coverage number
for `plan-recovery.js`, and every decision below. Confirm the module is a leaf with no
live caller yet (00217 wires it) and say so plainly — a module whose only caller is its
test is not done; this slice ships the module, 00217 ships the reach.

## What this plan does NOT do

- It does **not** wire recovery into the menu — that is 00217 (this module's only
  caller). Shipping the module alone is well-tested dead code; 00217 makes it reachable
  in the same batch.
- It does **not** modify `task-reconcile.js` or `task-registry.js`. Recovery is a pure
  projection over their persisted output; re-deriving their liveness/staleness logic
  would be the duplication the task forbids.
- It does **not** change `cleanupStaleInProgress`'s forward-to-review behavior. The two
  are complementary; recovery takes only the NOT-review-ready orphans that sweep skips.
- It does **not** kill the dead harness agent or clean its worktree. Partial work may
  remain there; recovery records that in the reason and re-queues the plan for a clean
  rebuild. Killing the agent is out of any library's reach (the harness owns it).
- It does **not** retroactively rewrite the orphaned task. The task stays a soft terminal
  and ages out on the reconciler's 7-day retention; recovery only moves the plan file.

## Decisions Taken Under Ambiguity

1. **Auto-vs-surface is TIERED, not global** — auto-move only a released orphan
   (`orphanReason ≠ 'staleness'`); surface a still-quarantined one. A blanket auto-move
   would put a second agent on a possibly-live agent's files, because `addAndClaim` does
   not consult the quarantine. Tiering reuses the reconciler's own file-safety verdict.
2. **Recovery is complementary to `cleanupStaleInProgress`, not a replacement** — it
   re-queues only NOT-review-ready orphans; review-ready ones are left for the existing
   forward-to-review path. Disjoint sets ⇒ no race, no behavior change to the sweep.
3. **A `validateForReview` throw ⇒ SURFACE, not move** — when review-readiness cannot be
   determined, we do not act on the plan. This is the honest default and never steals a
   plan from the forward path on a transient read error. (`cleanupStaleInProgress` fails
   CLOSED to a skip on the same throw; recovery's surface is the read-only equivalent.)
4. **Implement-only** — recovery acts only on orphaned `implement` tasks, matching how
   `startAgent`, `taskSpecFromPlan`, and `cleanupStaleInProgress` all key on `'implement'`
   for plan↔task mapping. An orphaned `review`/`plan` task is not a stalled build.
5. **The default `reviewReady` predicate is the real `validateForReview`**; injection
   exists for tests only, and case 13 exercises the real default so the wiring is proven.
6. **No `CLAUDE.md` edit** — kept out of `files:` deliberately (the count is generated;
   a test-file add no longer taxes the build), so this slice's permission grant stays the
   two files it actually touches.

## The human resolved this fork: RE-QUEUE for a clean rebuild (2026-07-22)

For an orphaned build whose partial work IS structurally review-ready (passes
`validateForReview`), the choice was: leave it for the forward-to-review path, OR
re-queue it to `todo` for a clean rebuild. **The human chose RE-QUEUE FOR A CLEAN
REBUILD**, on the stated ground that `validateForReview` checks STRUCTURE (step labels
present, criteria marked), NOT that Step 14 VERIFY actually ran before the builder died
— so a structurally-complete plan whose builder died mid-VERIFY may be functionally
half-built, and letting it flow forward risks a human rubber-stamping unverified work at
the review gate. That is the "structure is not working / green-before-implementation"
trap this repository exists to refuse.

**What this changes in the design below — the executor implements the REBUILD stance,
not the conservative default:**
- Recovery re-queues EVERY file-released orphan (`orphanReason` null / `confirmed-dead`
  / `presumed-dead`) from `in-progress` BACKWARD to `todo`, whether or not it is
  structurally review-ready. The `reviewReady` gate (Decision 2 / the `opts.reviewReady`
  branch) is NO LONGER a skip condition — a released orphan re-queues regardless of
  review-readiness. The `skipped: review-ready-left-for-forward-path` outcome is removed.
- A staleness orphan (`orphanReason === 'staleness'`, files still QUARANTINED — the
  builder may still be alive) is STILL only SURFACED, never moved: re-queuing it would
  start a second agent on files the first may still be editing, the exact hazard the
  quarantine prevents. The rebuild stance applies only to RELEASED orphans.
- Recovery therefore SUPERSEDES the forward-to-review sweep (`cleanupStaleInProgress`)
  for dead-builder orphans: a released orphan is re-queued to `todo` before the forward
  sweep would move it to `review`, so unverified work never reaches review as "done".
  If the executor finds these two sweeps genuinely race or fight over the same plan
  (rather than recovery simply winning by re-queuing first on the menu hot path), that is
  a real conflict — STOP AND ASK rather than letting a plan ping-pong between `todo` and
  `review`. Record the resolution.
- The re-queued plan carries a recorded reason ("its builder is no longer running; the
  build is re-queued for a clean rebuild and re-verification") so the human reading the
  menu understands why a plan reappeared in the queue.

## Decisions Taken During Execution

### The `opts.reviewReady` predicate and the review-ready skip were DELETED, not implemented
The planner's design (Decision `2`, cases `5`/`6`/`13`) still carried an injectable
`opts.reviewReady` predicate defaulting to `validateForReview`, and a
`skipped: review-ready-left-for-forward-path` outcome. The human's rebuild resolution
removes both. The shipped module has NO `reviewReady` option and never requires or calls
`validateForReview` — a released orphan re-queues regardless of review-readiness. Test
case `5` proves the rebuild stance directly: a fixture that GENUINELY passes
`validateForReview` (asserted `.valid === true`) is still re-queued to `todo`, and a
structural test (`16`) asserts the module neither requires `plan-validator` nor calls
`validateForReview`.

### The two-slice split was a wired-is-done error; the wiring was folded into this slice
The planner split the module (this slice) from its only caller (the menu-render slice
`00217`), which would have shipped `src/lib/plan-recovery.js` with no live caller. The
reachability fence correctly rejects that (it would raise the unreachable count from `26`
to `27`), and `00217` `depends_on` this slice, deadlocking both. Rather than fake a
declared root or baseline the dead file, the executor surfaced the conflict; the human
authorized Option A (scope extension, re-stamped ledger). `recoverOrphanedPlans` is now
called from `menu-screens.buildDashboardTable` immediately after the `reconcileState`
pass — the module is reachable, the fence stays at `26`, and no dead file is added.

### The menu call site is UNWRAPPED, by contract
`recoverOrphanedPlans` is contractually throw-free (every I/O boundary inside it is
fail-open; proven by cases `7`, `8`, `14`). The wiring in `buildDashboardTable` therefore
calls it directly, without a try/catch. A defensive empty `catch` there would have been a
silent-catch the false-green fence flags as a new site — and it would have swallowed an
error the function guarantees it never raises. The direct call matches the other
throw-free calls in that render.

### A failed cleanup-log write is recorded to stderr, never swallowed
`appendCleanupLog` must not throw (a log failure after a successful move must not be
misreported as "move failed"), but an empty `catch` is a false-green silent-catch. The
outer catch records the failure to stderr in the `state.js` fail-open style; case `17`
covers it and asserts the recovery still succeeds (the plan is in `recovered`, not
`skipped`).

### Forward-sweep supersession: no race found, no STOP-AND-ASK needed
The two sweeps target disjoint entry points and never fight over the same plan.
`cleanupStaleInProgress` runs ONLY from `startAgent`; recovery runs on the menu render
(`buildDashboardTable`). On the menu hot path recovery re-queues a released orphan to
`todo` before any later `startAgent` sweep looks at `in-progress`, so a plan recovery
touches is already gone from `in-progress` before the forward sweep could move it to
`review`. Recovery also takes only RELEASED orphans and never a `staleness` one, so it
cannot contend with a live builder. No ping-pong between `todo` and `review` is possible;
the supersession is by ordering on the hot path, not by mutual exclusion, so no conflict
required surfacing.

### One planner inaccuracy corrected
The planner's algorithm wrapped `readPlans` in its own try/catch "for fail-open". That
catch is dead: `readPlans` is already fail-open for a valid string root (returns `[]` on
an absent directory), and the only path that reaches it has a string root (the registry
load did not throw). The shipped module calls `readPlans` directly and relies on its
documented fail-open, avoiding an uncoverable dead catch. Case `8` (absent
`in-progress/`) exercises the real fail-open.
