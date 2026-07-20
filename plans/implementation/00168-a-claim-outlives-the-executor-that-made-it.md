---
title: "A claim outlives the executor that made it"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00166-a-dispatch-that-builds-a-plan-does-not-say-which-plan
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/agent-slots.js"
  - "src/lib/task-reconcile.js"
  - "tests/a-dead-claimant-does-not-hold-its-files.test.js"
---

# A claim outlives the executor that made it

## The answer is mostly REUSE, and that is the finding

Once a dispatch claims a task (`00166`), a new failure mode arrives immediately: the
executor dies, crashes, is interrupted, or simply never completes, and its `running`
task sits in the registry forever holding its files, its concurrency slot, and — for a
`sync` — the global integration barrier.

**That problem is already solved, thoroughly, by `src/lib/task-reconcile.js`.** It was
read in full before anything here was designed, and it handles the presumed-dead
claimant with more care than a second encoding would:

| mechanism | value | what it does |
|---|---|---|
| grace window | 60 s | a just-dispatched task is NEVER orphaned |
| kind-aware staleness floor | **120 min for `implement`** | a long build is not falsely orphaned by a flat 30-min floor |
| confirmed-dead | live list present, id recorded, id absent | the strongest signal |
| presumed-dead bound | 2× the kind floor (**240 min** for `implement`) | the deadlock guard, because the default menu path passes no live list |
| file quarantine | one pass, then bounded | an age-only orphan's files are NOT handed to a rival, since the agent may still be alive |
| cancel deadline | 30 min | a hung-but-live agent still releases its files eventually |

Every one of those is documented with its reasoning at `task-reconcile.js:19-71` and
`:108-130`. **The correct answer to "what if the claim is stale" is: this, unchanged.
Do not invent a parallel liveness notion.** A second encoding of "is the claimant
alive" is precisely the defect this repair set was convened to prevent.

This plan therefore does not build a staleness mechanism. It closes **one measured gap
in the existing one**, and it is small.

## The gap: the strongest signal can never fire

`reconcile` releases a claim on confirmed death when three things hold: a live-agent
list is present, the task has a recorded `agentTaskId`, and that id is absent from the
list (`task-reconcile.js:322`, `:428`). Two measurements say that path is dead in
practice.

**First — the recorded identity is self-referential.** Read from `tasks.json`:

```
t61  agentTaskId: "t61"      t62  agentTaskId: "t62"      t63  agentTaskId: "t63"
t60  agentTaskId: null
```

The `agentTaskId` field is set to the task's **own id**. That value can never appear in
a harness live-agent list, so "id absent from the list" is true for every record
whether the agent is alive or dead — and, because a NULL id is correctly treated as
missing information rather than evidence of death (`:47-51`), a null one falls to the
staleness backstop instead. **In neither case does the confirmed-dead path do any
work.** `00166` fixes this going forward by recording the real slot token; this plan is
what makes that recorded token useful.

**Second — no live list is ever supplied.** `reconcileState`'s own comment says it
plainly (`:120-125`): *"the default `/ctoc:menu` path passes NO `--live-agent-ids`, so
`liveAgentIds` is null on EVERY pass and the confirmed-dead signal can NEVER fire."*
That is why the presumed-dead time bound exists at all.

**Consequence, stated plainly:** with `00166` landed and nothing else, a crashed
executor holds its declared files for **two hours** before orphaning and **four hours**
before the quarantine releases them. That is correct and safe. It is also long enough
that a human would work around the claim rather than wait for it — and a mechanism
people work around is a mechanism that gets removed.

## The signal this plan adds, and why it is sound rather than clever

There is one fact about liveness that CTOC can establish without any identity at all:

> If the subagent slot store is READABLE and holds ZERO live entries, then no subagent
> is running. So no `running` task claimed at the dispatch seat has a live claimant.

That is not a heuristic. `PreToolUse.Task.js` takes a slot before every dispatch and
`SubagentStop.js` gives one back; `agent-slots` reaps any entry past its
thirty-minute time-to-live before counting. A readable store with no live entries is a
positive statement that nothing is in flight.

**It is sound only under a stated assumption, and the assumption is checkable.** The
store is maintained only if the dispatch seat actually runs — the subject of `00165`.
And `agent-slots` **fails open**: when the store cannot be written, `acquire` still
hands out a token (`agent-slots.js:227-231`), so a live subagent can exist with no
entry recorded. Reading "empty" as "nothing alive" in that situation would orphan a
living agent mid-write, which is far worse than waiting two hours.

Three guards follow, and none is optional:

1. **The store must EXIST and PARSE.** An absent or corrupt store yields `unknown`, and
   `unknown` changes nothing. `readSlots` currently returns `[]` for absent, corrupt
   AND genuinely empty (`:113-123`) — correct for a fail-open fence, and unusable as a
   liveness input. **Distinguishing those cases is the change to `agent-slots.js`.**
2. **The grace window still applies.** A task inside `graceMs` is never orphaned by
   this signal, exactly as with every other. A dispatch that has claimed but whose
   subagent has not yet appeared in the store is a real race.
3. **The orphaning it produces is treated as NOT-confirmed-dead** — it carries the same
   file quarantine an age-only orphaning does. The signal is strong enough to shorten
   the wait; it is not strong enough to hand a possibly-live agent's files to a rival in
   the same pass. This is deliberately conservative and is the difference between
   reusing the existing safety and bypassing it.

## Implementation Details

### Dependency graph

```
src/lib/agent-slots.js  [MODIFY — one new export; no existing behaviour changed]
  └─requires→ safe-fs, path, crypto, task-registry   [existing, unchanged]

src/lib/task-reconcile.js  [MODIFY — consume the new signal in reconcileState]
  ├─already requires→ src/lib/task-registry.js       [existing, unchanged]
  ├─already requires→ src/lib/plan-coverage.js       [existing, unchanged]
  └─LAZY requires→ src/lib/agent-slots.js            [NEW edge]
```

**A cycle must be checked for, not assumed away.** `agent-slots` requires
`task-registry` (`:51`), and `task-reconcile` requires `task-registry` too. Adding
`task-reconcile → agent-slots` does not close a loop today, because `agent-slots`
requires neither `task-reconcile` nor `plan-coverage`. **The require is nevertheless
LAZY** — inside the function, in a guard — mirroring the pattern justified at
`plan-coverage.js:295`, so a future edge cannot turn this into a load-time cycle
silently, and a failed require degrades to `unknown` rather than throwing.
**Step 11 verifies this by reading the require graph.**

`task-reconcile.js` has a strict house rule stated in its header (`:74-77`): **no raw
`fs` and no regex literal**, so the promoted-to-error security lint rules cannot fire
in that file. The new code must honour it — all filesystem access stays behind
`agent-slots`, which already routes through `safe-fs`.

### File: `src/lib/agent-slots.js`
**Action:** MODIFY — one new export; every existing function unchanged

Add:

- `liveSlotState(root, now)` → `{ state, count }`
  - `state` is `'empty' | 'held' | 'unknown'`.
  - `'empty'` — the store file EXISTS, parsed cleanly, and holds zero entries inside
    the time-to-live. **This is the only value that carries liveness information.**
  - `'held'` — the store parsed and holds at least one live entry; `count` says how
    many.
  - `'unknown'` — the file is absent, unreadable, unparseable, or structurally wrong;
    `count` is `null`. **Never `'empty'`.**
  - `now` is injectable, matching every other time-reasoning function in this module.
  - **Never throws**, matching the module's stated contract.
  - **Performs no write.** `activeCount` reaps and persists (`:196-200`); this must not,
    because a liveness read that mutates the thing it reads cannot be used inside
    reconcile's compare-and-swap without a second writer on the same file.

**What must NOT change:** `readSlots`'s fail-open `[]` return is depended upon by
`acquire`, `release`, `reap` and `activeCount`, and through them by the concurrency
fence. **It keeps returning `[]` for every fault.** The new function performs its own
existence-and-parse probe rather than altering the shared reader. Step 11 confirms the
fence's behaviour is byte-for-byte unchanged.

### File: `src/lib/task-reconcile.js`
**Action:** MODIFY — one additional death signal inside the existing branch structure

The signal is consumed in `reconcileState`, which is already the only function that
touches disk, and is passed into the PURE `reconcile` as an option. **`reconcile` stays
pure** — it must not learn to read a file, or its purity (and the safety of re-running
it on a compare-and-swap retry, `:581-585`) is lost.

- `reconcileState` calls `agentSlots.liveSlotState(root, now)` behind a guard and passes
  the result to `reconcile` as `opts.subagentLiveness`.
- `reconcile` consults it **only** in the `running` branch, and **only** when:
  - `subagentLiveness.state === 'empty'`, AND
  - the task is not `young` (the grace window is untouched), AND
  - the task's `kind` is `implement` — a dispatch-seated claim. Other kinds are not
    necessarily subagent-backed and must not inherit this inference.
- The resulting orphaning is recorded with `orphanReason: 'no-live-subagent'` and is
  reported in a new `report.noLiveSubagentOrphaned` array with the same shape as
  `stalenessOrphaned` — a loud, separately-named event, never folded into an existing
  bucket.
- **The file quarantine treats `'no-live-subagent'` exactly like `'staleness'`.**
  `applyQuarantine` (`:711-716`) reserves the files of every orphan carrying
  `orphanReason === 'staleness'`; that test becomes a two-value membership check. The
  across-passes release branch (`:404`) gets the same treatment, so such an orphan is
  released by the identical confirmed-dead or presumed-dead logic and the quarantine
  stays bounded.
- **`cancelling` is NOT affected.** A cancelling task resolves to `cancelled` under its
  own deadline (`:328-348`), and that path is deliberately untouched.

**What must NOT change:** the grace window, the kind-aware staleness floors, the
presumed-dead multiple, the cancel deadline, the retention sweep, the live-edge
protection, the unsatisfiable surfacing, the deferral rule, the fail-open contract, or
`reconcile`'s purity. This adds one signal inside the existing branch structure; it
replaces none of them. **If the new signal is absent or `unknown`, every behaviour is
byte-for-byte what it is today**, and Step 8 case 1 pins exactly that.

### File: `tests/a-dead-claimant-does-not-hold-its-files.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell. Slot fixtures minted by the real
`agent-slots.acquire`/`release`; registry fixtures by the real `task-registry`. Time is
injected via `now`, never slept.

| # | Case | Assertion |
|---|---|---|
| 1 | **BASELINE — no signal changes nothing** — no slot store at all | reconcile's report is IDENTICAL to today's for the same fixture: same orphans, same swept, same deferred, same quarantined. **The proof this is additive** |
| 2 | **the defect** — a `running` implement task past the grace window, store readable and EMPTY | orphaned in THIS pass, not after 120 minutes |
| 3 | **the grace window is untouched** — the same, task inside `graceMs` | **NOT** orphaned |
| 4 | **THE FENCE — an absent store is `unknown`** | not orphaned; falls to the 120-minute floor exactly as today |
| 5 | **THE FENCE — a corrupt store is `unknown`, never `empty`** | not orphaned; no throw |
| 6 | **a store that is a directory is `unknown`** | not orphaned; no throw |
| 7 | **a HELD store does not orphan** — one live entry | not orphaned |
| 8 | **an expired entry counts as empty** — one entry older than `SLOT_TTL_MS` | `state === 'empty'`; orphaned |
| 9 | **only `implement` inherits the inference** — a `running` `review` task, store empty | **NOT** orphaned by this signal |
| 10 | **a `cancelling` task is untouched** — store empty | resolves under its own deadline, not this signal |
| 11 | **the orphan is quarantined** — its files are NOT promoted to a rival queued task in the same pass | the rival appears in `report.quarantined` |
| 12 | **the quarantine is bounded** — the same orphan aged past the presumed-dead bound | released; the rival promotes |
| 13 | **the event is separately named** | it appears in `report.noLiveSubagentOrphaned`, NOT silently inside `stalenessOrphaned` |
| 14 | **`reconcile` stays PURE** — called twice with the same input and the same `now` | identical output; the input object is not mutated; no filesystem access from `reconcile` itself |
| 15 | **the concurrency fence is unchanged** — `acquire`/`release`/`activeCount`/`reap` against absent, corrupt and populated stores | byte-for-byte today's behaviour, including the fail-open grants |
| 16 | **`liveSlotState` performs no write** — record the store's modification time before and after | unchanged; and an absent store is not created |
| 17 | **never throws** — `root` a file, empty string, `null`; a store holding `{"slots":"nonsense"}` | a state is returned for each; no throw |
| 18 | **the confirmed-dead path can now fire** — a task whose `agentTaskId` is a real slot token, with a live list that excludes it | released as confirmed-dead, proving `00166`'s recorded identity is usable |
| 19 | **the fence is not vacuous** — case 4's assertion applied to case 2's fixture | FAILS, proving case 4 discriminates on a real `unknown` |

Cases 1, 4, 5 and 14 are the plan. Case 1 is the whole safety argument; cases 4 and 5
pin the could-not-look distinction; case 14 protects the property that makes the
compare-and-swap retry safe; case 19 guards against a test that passes against
anything.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `agentSlots.liveSlotState` | `reconcileState` in `task-reconcile.js` | the menu-open reconcile pass |
| the `no-live-subagent` orphaning | `reconcile`, via `reconcileState` | the dashboard's task plane, on every menu open |
| the quarantine membership change | `applyQuarantine`, already called by `reconcileState` **and** by `menu-screens.computePromote` | both promote routes, unchanged |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test. `reconcileState` is the on-menu-open entry
point, so the root is a human opening the dashboard.

**`src/lib/menu-screens.js` calls `applyQuarantine` and is NOT declared or modified
here.** The membership change is inside `applyQuarantine` itself, so that route inherits
it through the existing call with no edit. **Step 9 confirms that call's shape has not
moved**; a concurrent executor is editing that file.

## What this does NOT fix

1. **It does not supply a live-agent list.** `reconcileState` still receives none on the
   default menu path, so the true confirmed-dead signal still depends on a caller that
   passes one. This plan makes the RECORDED identity usable (case 18) and adds an
   identity-free shortcut; it does not make the harness list appear.
2. **It does not repair the existing records' `agentTaskId`.** `t61`, `t62`, `t63` and
   their siblings keep their self-referential values, so the confirmed-dead path remains
   dead for every pre-existing record. Reported, not rewritten.
3. **It does not shorten the wait when the slot store is absent** — which, per `00165`'s
   measurement, is the state of this repository today. If the dispatch seat never runs,
   the store never exists, `liveSlotState` reads `unknown`, and the behaviour is exactly
   today's 120-minute floor. **This plan's benefit is contingent on `00166` landing**,
   which is why it depends on it.
4. **It does not make a claim, and it does not narrow the write surface.** `00129` Part
   B stays blocked.
5. **It cannot distinguish a crashed executor from one whose slot was never recorded**
   because the store was unwritable. The fail-open grant in `acquire` means that case
   exists; the conservative quarantine is the mitigation, not a cure.
6. **A stale `in-progress/` residency is still not time-bounded.** A plan moved there by
   a claim whose task is later orphaned stays resident. Tightening that means a liveness
   timeout on plan residency, which is a different decision and is named, not taken.
7. **It does not touch `.ctoc/state/agent.json`**, still stale from 2026-07-18. See the
   correction recorded in `00167`.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-dead-claimant-does-not-hold-its-files.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim.

- **Case 1 must be GREEN already** and must stay green — it asserts today's reconcile
  behaviour against today's code. **Record its green explicitly**; it is the proof this
  change is additive, and if it is red the fixtures are wrong, not the code.
- **Case 15 must be GREEN already** and must stay green — the concurrency fence is not
  being changed.
- **Cases 2, 8, 11, 13, 16, 18 must be RED** — the signal does not exist.
- **Cases 3, 4, 5, 6, 7, 9, 10, 12, 14, 17 must be GREEN already** where they assert
  existing behaviour, and must stay green. They are the fence around the change.
- **Case 19 must FAIL as designed**; record that it does.

### Step 9: PREPARE

Read from disk, in full, and let the code win: `src/lib/task-reconcile.js` (the whole
file — the branch structure, `applyQuarantine`, the report shape, the header's no-raw-
`fs`/no-regex rule); `src/lib/agent-slots.js` (`readSlots`, `liveSlots`, `activeCount`,
`reap`, `acquire`, `release`, `SLOT_TTL_MS`); `src/lib/task-registry.js` (the status
sets, `nextRunnable`, `withRegistry`); `src/lib/menu-screens.js` **READ ONLY — a
concurrent executor is editing it; do not modify it, and stop and ask if its call to
`computePromote`/`applyQuarantine` has changed shape**.

Then measure, and **report before any code is written**:

1. **Does `.ctoc/state/agent-slots.json` exist yet?** Planning measured ABSENT. If it is
   still absent, record plainly that **this plan's benefit is inert on this repository
   until the dispatch seat runs**, and that this is expected rather than a failure.
2. **Re-measure `agentTaskId` across the registry**: how many records set it to their
   own task id, how many to `null`, how many to anything else. Planning measured
   self-referential values on `t61`, `t62`, `t63` and `null` on `t60`.
3. **Confirm `reconcile` has no filesystem access today**, so case 14's purity
   assertion is meaningful before the change as well as after.
4. **Confirm `applyQuarantine`'s callers.** Planning read two: `reconcileState` and
   `menu-screens.computePromote`. If a third exists, it inherits the membership change
   and must be named.
5. **Timing.** `reconcileState` before and after — it runs on every menu open. **Above
   roughly 10 milliseconds of added cost, stop and report.**

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.

- `src/lib/agent-slots.js` — `liveSlotState`; three states that never collapse; no
  write; never throws; `readSlots` and the fence untouched.
- `src/lib/task-reconcile.js` — `reconcileState` reads the signal behind a lazy guard
  and passes it into the pure `reconcile`; the `running`-branch consumption gated on
  `empty` + not-young + `kind === 'implement'`; `orphanReason: 'no-live-subagent'`;
  `report.noLiveSubagentOrphaned`; the quarantine and across-passes release membership
  widened to both reasons. No raw `fs`, no regex literal.
- `tests/a-dead-claimant-does-not-hold-its-files.test.js` — the nineteen cases.

### Step 11: REVIEW
Confirm `reconcile` is **still pure** — no filesystem access, no clock read beyond the
`now` default, no input mutation. Read the diff for this specifically; it is the
property that makes the compare-and-swap retry safe. **Confirm by reading the require
graph that no load-time cycle exists** between `task-reconcile`, `agent-slots` and
`task-registry` — the lazy require is the mechanism and must be verified, not assumed.
Confirm `readSlots` still returns `[]` on every fault and that `acquire`, `release`,
`reap` and `activeCount` are untouched. Confirm no code path can return `'empty'` from
a failed read. Confirm the grace window, every threshold, the retention sweep and the
live-edge protection are unchanged. Confirm the quarantine membership is spelled ONCE
and consulted by both the this-pass reservation and the across-passes release.

### Step 12: OPTIMIZE
Confirm `liveSlotState` is called **at most once per reconcile pass**, not once per
task. Confirm it performs no write and no reap. Confirm nothing new runs when the
signal is `unknown`. Record the before-and-after `reconcileState` timing.

### Step 13: SECURE
- Confirm a hostile slot store cannot influence the outcome beyond the three states: a
  store with a negative `acquiredAt`, an `acquiredAt` far in the future, a
  10,000-entry store, a deeply-nested object, and `{"slots":"nonsense"}`. A future-dated
  entry must read as `held` (conservative), never as `empty`.
- Confirm a store that is a symbolic link out of the repository cannot make this read
  outside the project.
- Confirm the report leaks no absolute path, no store contents, no stack traces — only
  task ids, kinds, ages and thresholds, matching the existing report entries.
- Confirm every fault path returns rather than throws: absent store, corrupt store,
  store as a directory, unreadable store, a lazy require that fails, and a
  `liveSlotState` that throws despite its contract (the guard in `reconcileState` must
  still hold).
- **Confirm the signal can only ever orphan, never resurrect**: no path may move a task
  out of a terminal status or extend a live one.

### Step 14: VERIFY
Targeted run first: the new test file, `tests/task-reconcile.test.js`,
`tests/agent-slots.test.js`, `tests/task-registry.test.js`,
`tests/task-concurrency-fence.test.js` (or whatever Step 9 finds covering the Task
hook), `tests/actions-scheduler.test.js`, `tests/scheduler-guarantees-under-mutation.test.js`,
`tests/e2e-menu-lifecycle.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/false-green-fence.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**: with `00166` landed, claim a plan through a
real dispatch, kill the subagent without letting it complete, wait for the slot store to
drain, open the menu, and **read the task plane.** The claim must be reported as
orphaned with a reason a person can understand, and its files must not have been handed
to a rival in that same pass. If the slot store does not exist on this repository, say
so and record that this verification could not be performed — **do not substitute a
fixture and call it verified.** **No git operations.**

### Step 15: DOCUMENT
A comment at `liveSlotState` recording: why three states; why `'empty'` requires the
file to exist and parse; why it performs no write (a liveness read inside a
compare-and-swap must not be a second writer); and that `readSlots`'s fail-open `[]`
is deliberately left alone because the concurrency fence depends on it.

A comment in `task-reconcile.js` at the new branch recording: that this is a SHORTCUT
on the existing staleness machinery and not a parallel liveness notion; the exact
inference and its assumption (the seat maintains the store); why `acquire`'s fail-open
grant is the reason the orphaning is quarantined rather than treated as confirmed
death; why only `implement` inherits it; and the measurement that motivated it — every
existing `agentTaskId` is self-referential or null, so the confirmed-dead path could
never fire.

### Step 16: FINAL-REVIEW
Report, in this order:

1. Whether `.ctoc/state/agent-slots.json` exists, and therefore **whether this plan's
   benefit is live or inert on this repository today.** If inert, say so as the
   headline — it is the honest result, not a failure.
2. The Step 8 verbatim reds, **case 1's and case 15's greens** (the additive and
   fence-unchanged proofs), and case 19's designed failure.
3. The `agentTaskId` measurement, and case 18's result — whether a recorded identity is
   now usable by the confirmed-dead path.
4. The Step 14 by-hand verification, or a plain statement that it could not be
   performed and why.
5. Both `reconcileState` timings.
6. The seven things this does NOT fix, the absent live-agent list first.
7. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan builds LAST of the four**, and `depends_on` says so rather than leaving it
to prose — the field constrains the scheduler; prose does not. It depends on `00166`
because a staleness answer for a claim that is never made is untestable in the only way
that matters, and because `00166` is what records the identity case 18 exercises.

**A concurrent executor is finishing a slice touching `src/lib/project-root.js` and
`src/lib/menu-screens.js`.** This plan declares NEITHER. It **reads** `menu-screens.js`
at Step 9 and must not modify it; if its call into the quarantine has changed shape,
**stop and ask**.

`src/lib/agent-slots.js` and `src/lib/task-reconcile.js` are declared by no other plan
in this set. `00166` modifies `src/hooks/PreToolUse.Task.js`, which calls `agent-slots`
but is not modified here. Plans build sequentially, so there is no concurrent-edit
hazard; the executor reads live at Step 9.

## Decisions Taken Under Ambiguity

1. **The existing reconcile machinery is REUSED, not replaced.** It was read in full
   first, as instructed. It already handles the presumed-dead claimant with a grace
   window, kind-aware floors, a bounded quarantine and a deadlock guard. A second
   encoding of liveness is the defect this repair set exists to prevent, and none is
   built here.
2. **Only ONE gap is closed: the strongest signal could never fire.** Measured — every
   existing `agentTaskId` is either the task's own id or null, and no live-agent list is
   ever passed on the default path. Everything else stays exactly as it is.
3. **The added signal is identity-free and sound, not clever.** "A readable store with
   zero live entries means nothing is running" is a positive statement, not a heuristic.
   It is stated with its assumption — that the seat maintains the store — because the
   assumption is what makes it sound.
4. **`'empty'` requires the file to exist and parse; absent and corrupt are
   `'unknown'`.** `readSlots` conflates all three by design, which is right for a
   fail-open fence and unusable as a liveness input. "I could not look" must never read
   as "nothing is alive" — here that inversion would orphan a living agent mid-write.
5. **`readSlots` is left alone and a new probe is added beside it.** Changing the shared
   reader would reach into `acquire`, `release`, `reap` and `activeCount`, and through
   them into the concurrency fence — far outside this plan's blast radius. Case 15 pins
   the fence's behaviour.
6. **The orphaning is QUARANTINED, not treated as confirmed death.** `acquire` fails
   open and grants a token without persisting when the store is unwritable, so a live
   subagent can exist with no entry. The signal is strong enough to shorten a two-hour
   wait; it is not strong enough to hand a possibly-live agent's files to a rival in the
   same pass. Conservative on purpose.
7. **Only `kind === 'implement'` inherits the inference.** Other kinds are not
   necessarily subagent-backed, and generalising an inference past the evidence that
   supports it is how a sound signal becomes a wrong one.
8. **`reconcile` stays PURE and the signal is passed in as an option.** Letting it read
   a file would break the property that makes re-running it safe on a compare-and-swap
   retry (`:581-585`) — a subtle, load-bearing invariant that a convenience read would
   quietly destroy. Case 14 pins it.
9. **The new event gets its own report array rather than joining `stalenessOrphaned`.**
   Folding a differently-derived orphaning into an existing bucket would make the
   inbox's "orphaned on staleness alone" message wrong for entries that were not.
10. **`liveSlotState` performs no write**, unlike `activeCount` which reaps and
    persists. A liveness read called inside `withRegistry`'s compare-and-swap must not
    become a second writer on a different file mid-transaction.
11. **This plan's benefit is contingent on `00166`, and that is stated rather than
    hidden.** On this repository today the slot store does not exist, so the signal
    reads `unknown` and nothing changes. Shipping it as though it helped immediately
    would be a claim the measurement does not support.
12. **The stale `in-progress/` residency is named and NOT fixed.** A plan moved by a
    claim whose task is later orphaned stays resident. Bounding that means putting a
    liveness timeout on plan residency, which would make write access expire mid-build —
    a different decision, and the human's to schedule.
</content>
