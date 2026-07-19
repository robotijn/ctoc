---
approved_by: human
approved_at: 2026-07-18T20:44:41.856Z
gate_crossed: implementation → todo
---

---
title: "The quarantine covers all three promote paths — one guard, one encoding, every route"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00076-quarantine-fault-fails-safe
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/task-reconcile.js"
  - "src/lib/menu-screens.js"
  - "tests/promote-quarantine-parity.test.js"
---

# The quarantine covers all three promote paths

The concurrent-edit guard protects exactly one of the four routes by which a
queued task can be handed to the menu driver for dispatch.

| Route | Function | Quarantine applied? |
|---|---|---|
| dashboard open | `task-reconcile.reconcileState:614-650` | **yes** |
| `menu task fail` | `menu-screens.js:1838` → `computePromote` | **no** |
| `menu task cancel` | `menu-screens.js:1880` → `computePromote` | **no** |
| `menu task complete` | `menu-screens.js:2027` → `computePromote` | **no** |

`computePromote` (`menu-screens.js:1744-1758`) calls `taskRegistry.nextRunnable(reg)`
and applies only an id-shape filter and control-character stripping. It never
consults the age-only-orphan file reservation. So the guard that stops two agents
from editing one file is bypassed by the three most common events in a wave — a
task failing, a task being cancelled, and a task completing — each of which frees
a slot and immediately publishes a `promote[]` list that `src/commands/menu.md:124`
instructs the model to dispatch verbatim as "the ONLY sanctioned promotion".

The guard is not weak on those paths. It is absent.

## Where the fix goes — and where it does not

The obvious-looking repair is to teach the scheduler about orphan reasons: have
`canRun` or `nextRunnable` skip a candidate whose files are reserved. **That was
considered and rejected by the human.** `src/lib/task-registry.js:773` opens the
scheduler section with the word `pure`, and every rule below it reads only
`status`, `kind`, `touches` and `gitOp`. Adding a read of
`task.result.orphanReason` there would:

- couple the concurrency ladder to the reconcile pass's private marker encoding,
  so a change to how an orphan records its reason would silently change what the
  scheduler allows to run;
- make the ladder's answer depend on *why* a task reached a status, not on the
  status itself, which is the property that makes `canRun` reviewable at a glance;
- put a lifecycle-history read inside a function whose whole contract is that it
  is a pure function of the current registry shape.

So the fix goes in the **promote projection** — the layer that already exists to
turn a scheduler answer into a dispatch list — and the projection is made the same
on every path by giving all four routes one shared implementation.

## Implementation Details

### Dependency graph

```
src/lib/task-reconcile.js   --exports-->  applyQuarantine  (new, pure)
src/lib/task-reconcile.js   --uses-->     applyQuarantine  (reconcileState, replacing its inline block)
src/lib/menu-screens.js     --uses-->     applyQuarantine  (computePromote)
src/lib/menu-screens.js     --already-requires-->  ./task-reconcile  (line 38 — no new import)
tests/promote-quarantine-parity.test.js  --drives-->  menu-screens.taskCommand + task-reconcile.reconcileState
```

Direction check: `task-reconcile` does **not** require `menu-screens`, so importing
downward from `menu-screens` introduces no cycle. `task-reconcile` is the correct
home because it owns the `orphanReason` encoding it reads.

Ordering check: this slice rewrites the same block of `reconcileState` that
`plans/implementation/00076-quarantine-fault-fails-safe.md` corrects, and it
carries that correction forward into the extracted function. It therefore declares
a real dependency on 00076; landing them in the other order would require the
fail-safe fix to be re-applied inside the new function.

---

### File: `src/lib/task-reconcile.js`
**Action:** MODIFY
**Purpose:** Extract the concurrent-edit guard into one pure, exported function so every promote path can apply it.
**Change type:** refactor (extract) + new export

#### New export

```js
/**
 * THE CONCURRENT-EDIT GUARD, as a pure function — the ONE encoding of "these
 * promote candidates would collide with files still reserved by an age-only
 * orphan", applied by EVERY promote path.
 *
 * WHY THIS IS NOT IN THE SCHEDULER. `task-registry`'s scheduler section is pure and
 * reads only status/kind/touches/gitOp; it must not learn WHY a task reached a
 * status. This guard reads `result.orphanReason`, a reconcile-pass marker, so it
 * belongs to the projection that turns a scheduler answer into a dispatch list —
 * never to `canRun` or `nextRunnable`.
 *
 * A task orphaned on AGE ALONE was never confirmed dead: its agent may still be
 * editing its files. Handing those files to a conflicting queued task puts two
 * agents on one file. Such a candidate waits; the exclusion is always REPORTED.
 *
 * FAILS SAFE (see plans/implementation/00076-quarantine-fault-fails-safe.md): a
 * throw while building the reserved set drops every file-editing candidate; a throw
 * while testing one candidate drops that candidate. Never throws.
 *
 * @param {{tasks:Array<object>}|any} registry  a reconciled registry VALUE.
 * @param {Array<object>} candidates  the scheduler's promote set (nextRunnable output).
 * @returns {{promote:Array<object>, quarantined:Array<{id:string,reason:string,summary:string}>, faulted:(null|{phase:string,error:string,dropped:string[]})}}
 */
function applyQuarantine(registry, candidates) { /* … */ }
```

Its body is exactly the logic that lives inline in `reconcileState` after slice
00076 lands — the collect phase with its fault fallback, and the per-candidate
guarded `touchesOverlap` test — with three differences:

1. it takes the registry value and the candidate array as parameters instead of
   closing over `reconciled` and `promote`;
2. it returns `{ promote, quarantined, faulted }` instead of mutating a `report`;
3. it tolerates a non-array `candidates` and a non-object `registry` by returning
   `{ promote: [], quarantined: [], faulted: null }` and
   `{ promote: candidates-as-given, quarantined: [], faulted: null }` respectively —
   a projection helper must never brick a caller.

Add `applyQuarantine` to `module.exports` (currently `:663-674`).

#### `reconcileState` becomes a caller

Replace the inline block with:

```js
report.quarantined = [];
const guarded = applyQuarantine(reconciled, promote);
promote = guarded.promote;
report.quarantined = guarded.quarantined;
if (guarded.faulted) report.quarantineFaulted = guarded.faulted;
```

Externally observable behaviour of `reconcileState` is **unchanged** — same
`promote`, same `report.quarantined` entries with the same `reason` and `summary`
strings, same `report.quarantineFaulted` shape. That is the point: this is an
extraction, and its correctness test is that the dashboard path behaves identically
while the other three paths start behaving the same way.

---

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** Apply the same guard on the fail, cancel and complete promote paths.
**Change type:** modify-existing — `computePromote` and its three call sites

#### `computePromote` returns a pair

```js
/**
 * NB3: the scheduler's newly-runnable set, projected onto the just-saved in-memory
 * registry, as a compact promote list — now with the CONCURRENT-EDIT GUARD applied.
 *
 * Before this, the guard ran ONLY on the dashboard-open path (reconcileState), so
 * `menu task fail|cancel|complete` published a promote list that could hand a file
 * still reserved by a possibly-live age-only orphan to a conflicting queued task.
 * Three routes, three behaviours, one guard — now one guard on all of them, via the
 * single encoding in task-reconcile.applyQuarantine. The scheduler stays pure: the
 * filter is in the PROJECTION, never in canRun/nextRunnable.
 *
 * @param {{tasks:Array<object>}} reg  a post-save in-memory registry value
 * @returns {{promote:Array<{id:string, kind:string, plan:(string|null), touches:string[], gitOp:boolean}>, quarantined:Array<{id:string,reason:string,summary:string}>}}
 */
function computePromote(reg) {
  const guarded = taskReconcile.applyQuarantine(reg, taskRegistry.nextRunnable(reg));
  const promote = guarded.promote
    .filter((t) => /^t\d+$/.test(t.id))
    .map((t) => ({
      id: stripCtl(t.id),
      kind: t.kind,
      plan: t.plan == null ? t.plan : stripCtl(t.plan),
      touches: t.touches,
      gitOp: t.gitOp
    }));
  return { promote, quarantined: guarded.quarantined };
}
```

The id-shape filter and `stripCtl` mapping are preserved exactly and still run
last, so the injection defence at `:1746-1750` is unweakened.

#### The three call sites

Each currently spreads `promote: computePromote(reg)`. Each becomes:

```js
const { promote, quarantined } = computePromote(reg);
```

and builds its result with `promote,` plus, only when non-empty,
`quarantined,`. Concretely:

- **`:1838` (`fail`)** — inside the `fail` branch, compute before the return object.
- **`:1880` (`cancel`)** — `res.promote = promote; if (quarantined.length > 0) res.quarantined = quarantined;`
- **`:2027` (`complete`)** — same pattern on the returned object literal, computed from `settled`.

`res.promote` stays an array of the same shape at all three sites, so every existing
assertion on the command result is preserved. A held candidate becomes visible
rather than silently missing — a candidate that vanishes from `promote[]` with no
explanation is precisely the kind of silent behaviour this program keeps removing.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `task-reconcile.applyQuarantine` | `task-reconcile.reconcileState` (this slice) and `menu-screens.computePromote` (this slice) | `/ctoc:menu` dashboard render, and `menu task fail\|cancel\|complete` |
| `computePromote`'s pair return | `menu-screens.js:1838`, `:1880`, `:2027` (this slice) | `menu task fail\|cancel\|complete` |
| `quarantined` on the command result | consumed by the completion turn per `src/commands/menu.md:124` — the model reads the result JSON | `/ctoc:menu` |

Every export added by this slice has a live caller inside this slice. Nothing is
deferred.

## Test Plan

### Tests: `tests/promote-quarantine-parity.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

The central test is a **parity** test: the same registry state must produce the
same promote decision through all four routes. Every case drives a real route —
`menuScreens.taskCommand([...], root)` for the three command paths and
`taskReconcile.reconcileState(root)` for the dashboard path — against a real
on-disk registry. `computePromote` is not exported and is not called directly.

Shared seed (`seedConflict(root)`): a registry containing
- `t1` — `orphaned`, `kind:'implement'`, `touches:['src/lib/target.js']`,
  `result: { ok:false, orphanReason:'staleness', summary:'…' }`, `ts.started`
  recent enough that the presumed-dead bound has not elapsed;
- `t2` — `queued`, `kind:'implement'`, `plan:'p2'`, `touches:['src/lib/target.js']`
  (the conflicting candidate, which the scheduler WILL return from `nextRunnable`
  because `t1` is orphaned and no longer occupies a slot);
- `t3` — `queued`, `kind:'review'`, `touches:[]` (a disjoint candidate that must
  always promote);
- `t4` — `running`, so `fail`/`cancel`/`complete` have a task to act on.

| # | Case | Route | Assertion |
|---|---|---|---|
| 1 | dashboard path holds the conflicting candidate (regression guard) | `reconcileState(root)` | `promote` ids contain `t3`, not `t2`; `report.quarantined` has a `t2` entry with `reason:'staleness-orphan-quarantine'` |
| 2 | **fail path holds it too** | `taskCommand(['fail','t4'], root)` | `res.promote` ids contain `t3`, NOT `t2`; `res.quarantined` names `t2` — red before this slice |
| 3 | **cancel path holds it too** | `taskCommand(['cancel','t4'], root)` | same — red before this slice |
| 4 | **complete path holds it too** | `taskCommand(['complete','t4'], root)` | same — red before this slice |
| 5 | four-way parity | run all four routes on identical seeds | the set of promoted ids is identical across all four |
| 6 | a released quarantine promotes on every path | `t1.result.orphanReason` set to `'confirmed-dead'` | `t2` IS promoted on all four routes, and `quarantined` is empty on all four |
| 7 | the id-shape filter still runs last | a promotable queued task with id `x9` | `x9` never appears in any `promote[]` (the injection defence survives the refactor) |
| 8 | control-character stripping survives | queued task with a control char in `plan` | the promoted entry's `plan` has no control characters |
| 9 | the scheduler was not touched | `taskRegistry.canRun(t2Spec, reg)` and `taskRegistry.nextRunnable(reg)` on the seed | both still RETURN `t2` as runnable — the ladder is unchanged and the guard is proven to live in the projection, not in the scheduler |
| 10 | `applyQuarantine` tolerates junk | `applyQuarantine(null, [])`, `applyQuarantine({tasks:[]}, null)` | returns the documented safe shapes; no throw |
| 11 | a fault still fails safe through the new function | `touchesOverlap` stubbed to throw (same seam as `tests/task-reconcile-quarantine-fault.test.js`) | `faulted.phase === 'filter'`; `t2` dropped; `t3` kept |

Cross-platform: `fs.promises` + `path.join` + `os.tmpdir()` throughout; teardown
with `fs.promises.rm(root, { recursive:true, force:true })`.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/promote-quarantine-parity.test.js` in full and run ONLY that file. Cases 2, 3, 4 and 5 MUST be red (the conflicting candidate IS promoted today on all three command paths); case 1 and case 9 should already be green and are the regression guards. Record the red output verbatim.
- [x] COMPLETE — test file written and run BEFORE any source edit: `tests 14 / pass 6 / fail 8 / skipped 0`. The load-bearing red was the fail route, verbatim: `route "fail" promoted ["t2","t3"] but route "dashboard" promoted ["t3"] — one guard, every route`. The dashboard case, the released-quarantine case, both injection-defence cases and both scheduler-purity cases were green, exactly as the plan predicted.
### Step 9: PREPARE — re-read from disk: `src/lib/task-reconcile.js` in full (including slice 00076's landed changes — if the fail-safe fault handling is NOT present, STOP and report; do not re-implement it here and do not stub around it), `src/lib/menu-screens.js:1600-2060`, and `src/lib/task-registry.js:773-916`. Confirm `nextRunnable` returns references to the registry's own task objects, since `applyQuarantine` must not mutate them.
- [x] COMPLETE — slice 00076's fail-safe handling IS present on disk (the two-phase collect/filter guards, `report.quarantineFaulted`, and the header paragraph stating the guard fails safe), so nothing had to be re-implemented. `nextRunnable` confirmed to return references to the registry's own task objects (`result.push(cand)`, `task-registry.js:911`), so the extracted guard reads only and never mutates them.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/task-reconcile.js` — extract `applyQuarantine` (pure, total, fail-safe); rewrite `reconcileState` to call it; add it to `module.exports`.
  - `src/lib/menu-screens.js` — `computePromote` applies the guard and returns `{ promote, quarantined }`; update the three call sites at `:1838`, `:1880`, `:2027`.
- [x] COMPLETE — both sub-items applied. `applyQuarantine` is exported from `task-reconcile.js`; `reconcileState` is now one of its callers; `computePromote` returns the pair and all three command call sites destructure it, attaching `quarantined` only when non-empty.
### Step 11: REVIEW — diff against this plan. Then prove the two invariants explicitly and record the evidence: (a) `grep -n "orphanReason" src/lib/task-registry.js` returns nothing — the scheduler learned nothing about lifecycle history; (b) `grep -n "nextRunnable" src/lib/` shows every remaining caller is either `applyQuarantine`-wrapped or explicitly justified. Confirm `src/commands/menu.md:124` still describes the promote contract truthfully now that a `quarantined` sibling exists; if it does not, name it as an out-of-scope handover rather than editing a file this slice does not declare.
- [x] COMPLETE — both invariants proved. (a) `grep -n "orphanReason" src/lib/task-registry.js` returns NOTHING: the scheduler learned nothing about lifecycle history. (b) `grep -rn "nextRunnable" src/` shows exactly two executable call sites, `task-reconcile.js:632` and `menu-screens.js:1758`, and BOTH are wrapped by `applyQuarantine`; every other hit is prose. `src/commands/menu.md:124` is named as an out-of-scope handover, NOT edited — see decision 9.
### Step 12: OPTIMIZE — `applyQuarantine` is one pass over the reconciled tasks plus one guarded overlap test per editing candidate. Do not memoize the reserved touch set across calls: each caller holds a different registry value and a shared cache would be a stale-read defect.
- [x] COMPLETE — one pass over the reconciled tasks plus one guarded overlap test per editing candidate; no memoization of the reserved touch set across calls, so no caller can read another caller's stale registry.
### Step 13: SECURE — the id-shape filter and `stripCtl` mapping stay AFTER the guard in `computePromote`, so no unsanitized id can reach a dispatch instruction. No new regex literal in `task-reconcile.js` (its header records that the only regex path is behind `plan-coverage.touchesOverlap`). No filesystem access added. `applyQuarantine` must not mutate the task objects it inspects — assert this in review by confirming it only reads.
- [x] COMPLETE — the id-shape filter and `stripCtl` mapping still run AFTER the guard in `computePromote` (proved by the two injection-defence cases, which drive real command routes). No new regex literal in `task-reconcile.js`; no filesystem access added. `applyQuarantine` only reads — `promote.filter` allocates a new array and never touches the input task objects, asserted by a test that compares the serialized registry before and after the call.
### Step 14: VERIFY — `node --test tests/promote-quarantine-parity.test.js tests/task-reconcile.test.js tests/task-reconcile-coverage.test.js tests/task-reconcile-quarantine-fault.test.js tests/menu-task-wiring.test.js tests/menu-protocol.test.js tests/menu-screens-coverage.test.js` green, then the full gated run `npm test`. Lint all three changed files. No git operations.
- [x] COMPLETE — the seven named files ran green first: `tests 258 / pass 258 / fail 0`, none omitted.
- [x] Then the gated entry point `npm test`, verbatim: `tests 9906`, `suites 1720`, `pass 9906`, `fail 0`, `cancelled 0`, `todo 0`, and zero tests omitted; gate line `[CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0` followed by `[CTOC test-gate] PASS`. The coverage floor of 99 was NOT touched.
- [x] Lint clean on all three changed files (`eslint --max-warnings 0`). Reachability and export-reachability fences green; no git operations were run.
### Step 15: DOCUMENT — JavaScript doc on `applyQuarantine` that states, in plain words, why the guard is in the projection and not in the scheduler. Update `task-reconcile.js`'s header paragraph at `:52-55` to say the guard now serves every promote path. Update `computePromote`'s doc comment to describe the pair return.
- [x] COMPLETE — `applyQuarantine` carries a JavaScript doc comment stating in plain words why the guard lives in the projection and not in the scheduler; the module header's quarantine paragraph now says the guard serves every promote path through one encoding; `computePromote`'s doc describes the pair return and why a held candidate is reported rather than silently dropped. No CHANGELOG exists in this repository.
### Step 16: FINAL-REVIEW — report the files changed, the tests added, the verbatim red evidence from Step 8, the verbatim green evidence from Step 14, the two grep proofs from Step 11, and every decision taken under ambiguity.
- [x] COMPLETE — files changed, red evidence, gated-run numbers, both grep proofs and decisions 7-10 are recorded in this plan. Gate 3 is the human's; it was not crossed.

## Decisions Taken Under Ambiguity

1. **The shared function lives in `task-reconcile.js`, not in a new module and not
   in `task-registry.js`.** It reads `result.orphanReason`, which is
   `task-reconcile`'s own marker encoding — putting the reader anywhere else would
   split one encoding across two files. `task-registry.js` is excluded on the
   human's explicit instruction that the scheduler stays pure, and a new module for
   one function would add a file without adding a boundary.
2. **`computePromote` returns a pair rather than staying an array.** The
   alternative — keeping the array return and computing the quarantine list a
   second time for the callers that want it — would run the overlap test twice and
   create two chances for the two results to disagree. The change is contained:
   `computePromote` is module-private, and all three call sites are updated in this
   slice.
3. **`quarantined` is added to the command results only when non-empty.** A
   project with no age-only orphans gets a byte-identical result object, so no
   existing protocol assertion regresses, and a held candidate is never silent.
4. **`applyQuarantine` returns `faulted` rather than writing onto a report.** A
   pure function that mutates a caller's report object is not reusable by a caller
   that has no report — which is exactly `computePromote`'s situation. The
   translation to `report.quarantineFaulted` stays in `reconcileState`, one line.
5. **Case 9 asserts that the scheduler still returns the conflicting candidate.**
   This looks backwards and is deliberate: it is the test that would fail if a
   future change "helpfully" moved the guard into `canRun` or `nextRunnable`. The
   human's decision that the scheduler stays pure needs an executable guard, not a
   comment.
6. **`src/commands/menu.md` is not edited by this slice.** Its promote contract at
   line 124 remains true (`promote[]` is still the only sanctioned dispatch set),
   and it is not in this slice's declared files. If Step 11 finds it has become
   misleading, that is reported as a handover, never edited around.

Decisions 7–10 were taken by the executor DURING Steps 8–16 and are recorded here
as required:

7. **The parity suite drives real routes and never calls `computePromote`.** The
   plan required proof that each of the four routes applies the guard, not merely
   that a shared function exists. Every case therefore goes through
   `menuScreens.taskCommand(['fail'|'cancel'|'complete','t4'], root)` or
   `taskReconcile.reconcileState(root)` against a real on-disk registry. A test that
   called the shared helper directly would have stayed green while a caller still
   bypassed it — which is the exact defect this slice removes.
8. **The shared seed's `t4` is a `review` task with an empty touch set and no plan.**
   The plan said only "running, so fail/cancel/complete have a task to act on". Two
   details had to be chosen. A `null` plan and a non-`implement` kind keep
   `menu task complete` a registry-only settle, so the parity test measures the
   promote projection rather than the plan-completion machinery. An empty touch set
   and no git flag keep `t4` harmless to the ladder whether it ends `failed`,
   `cancelling` (cancel keeps the slot, per the honest-cancel rule) or `done` — so
   the three command routes and the dashboard route are genuinely comparable, which
   is what makes the four-way parity assertion meaningful rather than an accident.
9. **`src/commands/menu.md:124` is reported as a handover, not edited.** Its
   parenthetical calls `promote[]` "the scheduler's `nextRunnable` set". After this
   slice `promote[]` is that set MINUS the quarantined candidates on all four routes;
   before this slice it was already that set minus the quarantined on the dashboard
   route, so the parenthetical was already imprecise and this change widens the
   imprecision rather than creating it. The load-bearing sentence — "never start a
   queued task the scheduler did not return in `promote[]`" — stays true and stays
   SAFE, because the guard only ever shrinks the set, so no over-dispatch can follow
   from the stale wording. The file is not in this slice's declared files and was not
   touched. Recommended handover: reword to "the scheduler's newly-runnable set with
   the concurrent-edit guard applied".
10. **One ratchet outside the declared `files:` was updated, because this change
   moved it.** `CLAUDE.md`'s documented test-file count went 421 → 422, because this
   slice adds a test file and `tests/doc-counts.test.js` verifies that count against
   disk. It is bookkeeping the gate demands as a direct consequence of the change,
   moved in the correct direction; no threshold was lowered to make a run pass. The
   false-green baseline did NOT need to move: this slice adds no new silent-catch
   site, and the gated run confirmed it.
