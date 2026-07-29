---
title: "F1-s1 — Scheduler core: file-based serialization, sync barrier, cancel, atomic add-and-claim"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-background-engine-rebuild
iron_loop: true
files:
  - "src/lib/task-registry.js"
  - "src/lib/plan-coverage.js"
  - "tests/task-registry.test.js"
---

# F1-s1 — Scheduler core: file-based serialization, sync barrier, cancel, atomic add-and-claim

> **Slice scope.** The scheduler model in `src/lib/task-registry.js` only, plus a
> small additive helper in `src/lib/plan-coverage.js`, plus their tests. The
> action-layer wiring (retiring `startAgent`'s global lock, plan-frontmatter
> translation, menu prose) is slice s2, which depends on the API this slice adds.
> s1 and s2 are committed TOGETHER at the wave boundary, so every new export
> here has its live call site in the same commit (wired-is-done).

## Implementation Details

### Architecture Decision

**Context.** The scheduler today serializes ALL `implement` tasks with a blanket
kind-based rule (Rule 2 "plan-serial": one plan-mutating task at a time). That
rule strangled the file-disjoint wave pattern the human explicitly ordered
("1 plan per agent", ≤5 concurrent) — the previous session had to route around
the scheduler manually. The vision's F1 (human-decided, do not relitigate)
replaces kind-based serialization with FILE-based serialization: two implement
tasks may run concurrently iff their touched files are disjoint; Rule 4
(file-conflict) becomes the serializer.

**The seven changes to `src/lib/task-registry.js`:**

1. **`touches` mandatory for `implement`.** `addTask` throws
   (`Error: task-registry: addTask implement task requires non-empty touches`)
   when `spec.kind === 'implement'` and `touches` is missing or empty. `canRun`
   applies the same check to its candidate (a safety oracle must never
   false-safe on an implement task that declares nothing). Without this, an
   empty-touches implement task would bypass Rule 4 entirely and the removal of
   Rule 2 would be unsound.

2. **Delete Rule 2 (kind-based plan-serial).** Remove `PLAN_MUTATING_KINDS`,
   `isPlanMutating`, the Rule 2 block in `evaluateConcurrency`, and the
   `PLAN_MUTATING_KINDS` export. Grep `src/` and `tests/` for every reference
   and remove/update each (the module header's design comments referencing D5
   plan-serial must be rewritten to describe file-based serialization — comments
   that describe deleted behavior are lies).

3. **Glob-aware Rule 4.** `touches` entries are plan `files:` globs plus literal
   paths. Add to `src/lib/plan-coverage.js` one additive export
   `touchesOverlap(aList, bList)` → boolean: true iff any pair (a, b) matches
   where a glob on EITHER side matches the other side treated as a literal
   (`globToRegex(a).test(b) || globToRegex(b).test(a)`) or the strings are
   equal. This mirrors the overlap predicate already shipped in
   `src/lib/plan-index/conflict-detect.js` and uses the SAME `globToRegex` the
   enforcement hook trusts. `task-registry.js` requires it for Rule 4 — the
   regex construction stays in `plan-coverage.js`, preserving task-registry's
   "no regex in this module" invariant (stated in its header — update the header
   to say the regex lives behind `plan-coverage.touchesOverlap`).
   `evaluateConcurrency` Rule 4 becomes: candidate touches vs the union of
   running touches via `touchesOverlap` (keep the fast path: empty candidate
   touches → no conflict).

4. **Sync barrier.** Wire the dormant `sync` kind as the wave integration
   barrier, as a new rule evaluated immediately after Rule 1 (max-concurrent),
   reason string `'sync-barrier'`:
   - a `sync` candidate may not start while ANY task is running;
   - NO candidate may start while a `sync` task is running.
   A sync task is the wave boundary (integrated suite + ratchet reconcile +
   commit) and must see frozen state — even read-only tasks wait. Sync tasks
   will typically also carry `gitOp: true`; the barrier rule is independent of
   and stricter than git-exclusive.

5. **`cancelled` status + cancel transition.** Add `'cancelled'` to `STATUSES`
   and `TERMINAL`; allow transitions `queued → cancelled` and
   `running → cancelled`; `ts.done` auto-stamps on cancel like other terminal
   transitions. Cancelling a RUNNING task records the decision — killing the
   harness-level agent task is the caller's job (s2/E-layer); the registry is
   the source of truth that the work's result must not be consumed.
   `REGISTRY_VERSION` stays 1: an older reader hitting a `cancelled` entry
   fail-opens per-task (skip + warn), which is the designed degradation.

6. **Atomic `addAndClaim(root, spec)`.** New exported function closing the
   record-vs-start blind window: `load(root)` → `addTask` → `canRun` → if
   runnable, `updateTask(id, { status: 'running' })` → `save(root)` ONCE →
   return `{ task, claimed: boolean, reason: string }`. One load→save cycle
   means there is no persisted intermediate where the task exists but its claim
   decision doesn't. (Single-writer holds — this is not a cross-process lock;
   it removes the in-process window where a crash strands an undecided task.)

7. **Drain-stop flag trio.** `requestDrainStop(root)` / `isDrainStopRequested(root)`
   / `clearDrainStop(root)`, persisted as the flag file
   `.ctoc/state/drain-stop` (existence = requested). This is the graceful
   "finish current plan, then stop" mechanism that today lives in
   `agent-lock.js` (`requestStop`/`isStopRequested`/`clearStop`); s2 retires
   agent-lock and rewires `stopAgent`/`advanceAgent` here. All fs through
   `safe-fs` as everywhere in this module.

### Dependency Graph

```
task-registry.js ──requires──> plan-coverage.js (touchesOverlap; NEW edge)
                 ──requires──> safe-fs.js       (existing)
s2 (actions.js startAgent/stopAgent/advanceAgent) ──calls──> addAndClaim, drain-stop trio
menu-screens.js / task-view.js / task-reconcile.js ──existing callers of canRun/nextRunnable (behavior change: no more 'plan-serial' reason)
```

### Wiring — the live call sites (MANDATORY)

| module / export | live call site | root |
|---|---|---|
| `evaluateConcurrency` changes (Rules) | existing `canRun`/`nextRunnable` callers: `src/lib/menu-screens.js:1511,1533`, `src/lib/task-view.js:130`, `src/lib/task-reconcile.js:290` | `/ctoc:menu` |
| `plan-coverage.touchesOverlap` | `task-registry.js` Rule 4 | `/ctoc:menu` |
| `addAndClaim` | `actions.js startAgent`/`advanceAgent` (slice s2, same commit) | `/ctoc:menu` |
| drain-stop trio | `actions.js stopAgent`/`advanceAgent` (slice s2, same commit) | `/ctoc:menu` |
| `cancelled` transition | `actions.js cancelTask` action (slice s2, same commit) | `/ctoc:menu` |
| sync barrier | `actions.js enqueueWaveSync` + menu.md wave recipe (slice s2, same commit) | `/ctoc:menu` |

### Test Plan (tests/task-registry.test.js — extend, and update the contract)

TDD-Red first: write these, see them fail, then implement.

1. `addTask` throws on implement with missing/empty `touches`; non-implement
   kinds still accept empty touches.
2. `canRun` throws on an implement candidate with empty touches (fail-loud).
3. Two implement tasks with DISJOINT literal touches: second is runnable while
   first runs (`{run:true}`) — the old plan-serial behavior is GONE.
4. Two implement tasks with overlapping literal touches → `'file-conflict'`.
5. Glob overlap: running task touches `["src/lib/*.js"]`, candidate touches
   `["src/lib/actions.js"]` → `'file-conflict'`; and the mirrored direction;
   and `["src/lib/*.js"]` vs `["tests/*.js"]` → runnable.
6. Sync barrier: sync candidate vs one running task → `'sync-barrier'`; any
   candidate vs a running sync → `'sync-barrier'`; sync candidate vs empty
   running set → runnable. `nextRunnable` never co-selects a sync with anything.
7. `cancelled`: queued→cancelled and running→cancelled succeed and stamp
   `ts.done`; done/failed/orphaned→cancelled throw; cancelled→anything throws;
   a cancelled task neither occupies a slot nor satisfies `blockedBy` (deps
   require `done`).
8. `addAndClaim`: on an empty registry returns `claimed:true`, task persisted
   as `running` with `ts.started`, ONE file on disk with exactly that state; on
   a registry with a conflicting running task returns `claimed:false, reason:
   'file-conflict'`, task persisted as `queued`; malformed spec → throws and
   persists NOTHING (load back and assert absence).
9. Drain-stop trio: request → is → clear round-trip; `isDrainStopRequested` on
   a fresh root is false.
10. UPDATE existing tests that assert the old contract: the plan-serial tests
    are asserting deliberately replaced behavior (human decision, vision F1) —
    rewrite them to assert the file-based contract above, tightening only.
    Every other existing test must keep passing unmodified.

### Security Review

- No new fs surface beyond one flag file under `.ctoc/state/` via safe-fs.
- `touchesOverlap` regexes come from `globToRegex` — already the enforcement
  hook's audited path; no user-controlled regex construction is added here.
  If `globToRegex` can be driven to pathological backtracking by a crafted
  touches string, bound the input (reject touches entries > 512 chars in
  `assertTaskShape`) — check how conflict-detect.js handled this and match it.
- `addAndClaim` must not spread `spec` (reuse `addTask` — no prototype
  pollution path).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] TEST — TDD tests present; Step-11 workflow re-review (2026-07-29) confirmed real/adversarial, not vacuous.
Write the test plan above into `tests/task-registry.test.js`; run
`node --test tests/task-registry.test.js`; confirm the new tests FAIL and record
the failure summary.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Re-read `src/lib/task-registry.js`, `src/lib/plan-coverage.js` (globToRegex
contract), and `src/lib/plan-index/conflict-detect.js` (the shipped overlap
predicate to mirror).

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
The seven changes above, plus `touchesOverlap` in plan-coverage.js. WIRE IT:
Rule 4 must actually call `touchesOverlap`. Update the module header comments
to describe the new design truthfully. Record every judgment call in
`## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3; findings minor/info only, documented.
Self-review the diff against this plan; especially: no remaining reference to
plan-serial anywhere in `src/` (grep), rule order documented as load-bearing.

### Step 12: OPTIMIZE
`touchesOverlap` is O(|cand| × |occupied|) regex tests per evaluation — fine at
≤5 running tasks; memoize compiled regexes per call only if measured necessary
(do not add a cache speculatively).

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
Run the security checklist above; verify no raw `fs`, no regex in
task-registry.js, no spread of caller specs.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
`node --test tests/task-registry.test.js` → all pass;
`npx eslint src/lib/task-registry.js src/lib/plan-coverage.js tests/task-registry.test.js` → clean.
Do NOT run the full suite (wave boundary does that); do NOT touch git; leave
everything unstaged.

### Step 15: DOCUMENT
Module header rewritten (design comments must describe shipped truth); JSDoc on
every new/changed export.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Confirm every item in this plan's scope is done, the Wiring table's s1-side
entries are real, and report: files changed, tests added/updated/failed-first,
decisions taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **`touchesOverlap` fails CLOSED (conservative block), not open.** conflict-detect's
   advisory `filesOverlap` catches a throwing `globToRegex` and returns "no overlap".
   `touchesOverlap` backs the scheduler's file-conflict *safety oracle*, so a throwing
   glob is treated as an OVERLAP (block) — a safety oracle must never false-safe two
   tasks onto the same file. In practice `globToRegex` (via `safeRegExp`) does not
   throw for the bounded input here; this is the correct default for the rare edge.

2. **512-char `MAX_TOUCH_LENGTH` bound added in `assertTaskShape`.** Implemented per
   the plan's Security Review note. `globToRegex` emits only `.*` / `[^/]*` (no
   catastrophic backtracking) and construction is already centralized in the audited
   `safeRegExp`, so this is defense-in-depth rather than a live ReDoS fix; it is cheap,
   the plan directs it, and no legitimate touches entry approaches 512 chars.

3. **Existing git-exclusive tests (ST-10, ST-14b, ST-14c) re-based off `kind:'sync'`
   onto `kind:'plan'` as the gitOp carrier.** `sync` now triggers the new sync-barrier
   (Rule 2) *before* git-exclusive (Rule 3), so those tests — which use a gitOp task
   only to exercise Rule 3 — would otherwise assert the wrong rule's reason. The
   git-exclusive behavior itself is unchanged and still fully asserted; sync's barrier
   semantics are covered by the dedicated ST-SYNC-1..4 tests. This is a tightening
   (isolating the rule under test), not a weakening.

4. **Existing tests that added an `implement` task with no `touches` (ST-03, ST-16,
   ST-20) updated to supply `touches`.** Required by the new mandatory-touches
   contract (change #1); the tests' actual subjects (single-file persistence, status
   transitions, timestamps) are kind-agnostic and unchanged.

5. **`addAndClaim` persists a non-runnable task as `queued` (claimed:false), not a
   rejection.** The *record* always happens in the one load→save cycle; only the
   *claim* is conditional. A malformed spec throws inside `addTask` before any `save`,
   so nothing is persisted (verified by ST-CLAIM-3 loading back an empty registry).

6. **STOP-AND-REPORT — two out-of-scope references to the deleted `plan-serial`
   behavior left for slice s2 (NOT touched, per the executor's three-file hard
   constraint):**
   - `src/commands/menu.md:53` — prose ("the NB1 scheduler serializes plan-mutating
     work FIFO (plan-serial)").
   - `tests/menu-protocol.test.js:270,275` — a behavioral test over `menu-screens.js`
     asserting two `implement` tasks serialize by kind ("second implement queues
     (plan-serial)"). Under file-based serialization this depends on menu-screens'
     plan→touches translation, which is slice s2's work.
   Both are action-layer / menu-prose targets the plan explicitly assigns to s2 and
   commits together at the wave boundary. They MUST be updated by s2 before the
   wave-boundary full suite can go green. The `PLAN_MUTATING_KINDS` *export symbol*
   had no code consumers outside the two in-scope files, so its deletion is contained.
