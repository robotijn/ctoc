---
title: "A dispatch that builds a plan does not say which plan"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00165-nothing-proves-the-dispatch-hook-ever-runs
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/dispatch-claim.js"
  - "tests/a-build-dispatch-claims-the-plan-it-builds.test.js"
  - "src/hooks/PreToolUse.Task.js"
---

# A dispatch that builds a plan does not say which plan

## The ruling, and what it costs to honour it

Before an executor starts, the thing dispatching it must claim a task and move the
plan — the same two steps the menu path already performs correctly. That gives every
later question an honest answer: which plan is building, what it may write, whether it
is still alive.

The sanctioned path already does this and does it well. Verified by reading:

```
actions.startAgent   (actions.js:1466-1481)   addAndClaim → status 'running'
                                              → startExecution → plans/in-progress/
actions.advanceAgent (actions.js:1579-1591)   the same two steps, same order
```

Both claim FIRST and move only on a successful claim, so the two witnesses are one
event rather than two independent ones. A third caller of `addAndClaim` exists —
`actions.enqueueWaveSync` (`:1698`) — but it creates a `sync` task, not an
`implement` one, so it is not a build witness and is not touched here.

**Nothing else calls either function.** The way work actually happens — the session
model dispatching an executor subagent — sets neither witness. Measured on this
repository today: `plans/in-progress/` holds **zero** plan files, and of **64** task
records **zero** are `running` or `cancelling`.

## THE HARD PRECONDITION — this plan does not proceed on a dead seat

`00165` measures whether `src/hooks/PreToolUse.Task.js` has ever run in this project.
Planning's measurement says it has not: no `.ctoc/state/agent-slots.json` despite that
file being written on every allowed dispatch, and zero `Task` entries in the
enforcement log, observed from inside a real live dispatch.

**Step 9 re-runs that measurement, and if the seat reads `not-live` or `unknown`, this
plan STOPS at Step 9 and reports.** It does not proceed to Step 10. It does not ship
"the module now and the wiring later" — that would be well-tested dead code, which is
the exact failure this repository has a reachability fence for.

Reaching "blocked" is a **successful run of this plan**, not a failure of it. The
result would be the honest headline: the only seat where a mechanism can sit does not
execute, so what remains available is an instruction, and an instruction is a wish.

## Where a mechanism can actually sit — three candidates, weighed

The dispatcher is the session model following an instruction, not a function. So the
question is where a MECHANISM can intercept it. Each candidate is judged on one thing:
**what happens when the claim is missing.**

### Candidate 1 — a hook at the dispatch (`PreToolUse.Task.js`)

Fires before the subagent launches. Receives `tool_name`, `tool_input`
(`subagent_type`, `description`, `prompt`) and can allow or deny.

- **Missing claim → the dispatch is REFUSED, before any work exists.** Loud, early,
  and nothing has been built yet that a refusal could waste.
- **Cost:** it can only bind what the dispatch payload contains. A dispatch that never
  names its plan cannot be bound, and the honest response is refusal, not a guess.
- **Risk:** its execution is UNVERIFIED — the whole subject of `00165`.

**Chosen, because its failure is the loudest and the earliest.**

### Candidate 2 — the executor claims its own task as its first action

Written into the executor agent's markdown definition.

- **Missing claim → nothing whatsoever happens.** An agent that does not follow the
  instruction produces exactly today's state, silently, and the suite stays green.
- This is an instruction, not a mechanism. **Rejected as the primary seat**, and named
  as such rather than dressed up: no test can make a markdown sentence execute.

### Candidate 3 — the completion route refuses a plan with no claim

Real code (`actions.completeTaskPlan`), guaranteed to run, since it is what writes the
records today.

- **Missing claim → surfaces at the END, after all the work is done.** Late, but never
  never.
- **REFUSING today would deny every completion**, because today every completion is
  unclaimed. That is the trap `00129` fell into and had to block itself over: a
  narrowing whose ordinary case is denial is an outage, not a stricter check.
- **Kept as a BACKSTOP, and built as honest recording rather than refusal** — that is
  `00167`, which is deliberately independent of this plan and buildable whatever
  `00165` reports.

The two shipped seats compose: candidate 1 makes a missing claim impossible where it
fires, and candidate 3 makes a missing claim impossible to ignore where it does not.

## How the plan is identified without guessing

A hook receives a free-text prompt. Parsing a plan slug out of free text with a
pattern is a guess, and a guess is what produces plausible-but-wrong claims.

**The binding is a CLOSED-VOCABULARY match instead.** The vocabulary is not a pattern;
it is the set of plan slugs that actually exist on disk, enumerated from
`plans/todo/`, `plans/implementation/` and `plans/in-progress/`. The dispatch text
(`description` + `prompt`) is tested for containment of each real slug. Three outcomes,
and none of them is a guess:

| outcome | meaning | what happens |
|---|---|---|
| exactly one slug matches | the dispatch names a real plan, unambiguously | claim it |
| **zero** match | the dispatch names no plan that exists | REFUSE the dispatch (build agents only) |
| **more than one** matches | ambiguous — two real plans are named | REFUSE. Never pick one |
| the plans directory is **unreadable** | the vocabulary could not be built | REFUSE, with a different message: this is "I could not look", not "I found nothing" |

The longest match wins ONLY for the containment test itself (so a slug that is a
strict prefix of another does not produce a false second match); it never breaks a tie
between two genuinely distinct slugs, which stays ambiguous and stays refused.

## Which dispatches need a claim — and why "unclaimed is allowed" is not the rule

The requirement is keyed on a **positive identification of build work**, never on the
absence of a claim. That distinction is what stops the whole thing being decorative.

`requiresClaim(payload)` is true when `tool_input.subagent_type` is in a small,
explicit set of build-executing agent types — the Iron Loop executor and its
equivalents, read at Step 9 from the real agent definitions under `agents/` rather than
guessed. For those, and only those, a claim is mandatory and an unbindable dispatch is
refused.

| who | needs a claim? | what happens | why |
|---|---|---|---|
| **the human typing** | no | unaffected entirely | a human typing is not a `Task` dispatch; this hook never sees it |
| **a planning agent** (`implementation-planner`, `product-owner`, `vision-advisor`) | no | allowed unchanged, even if its prompt names a plan slug — and planning prompts routinely do | it writes `plans/*.md`, which is whitelisted ahead of coverage; it builds nothing |
| **an adversarial critic / question generator** | no | allowed unchanged | reads and writes questions; builds nothing |
| **a research or analysis subagent** | no | allowed unchanged | no build |
| **a hook or CTOC's own code writing state** | no | unaffected | in-process, never a `Task` dispatch |
| **a build executor naming exactly one real plan** | **yes** | claimed, plan moved, then allowed | this is the case the ruling exists for |
| **a build executor naming zero or several plans** | **yes** | **REFUSED, loudly** | the dispatcher must say what it is building; guessing is what this plan exists to prevent |

Note the asymmetry deliberately: a planning agent whose prompt mentions a plan slug is
NOT claimed. The slug match alone would over-claim, so `requiresClaim` gates it, and
the agent type is what discriminates.

## Implementation Details

### Dependency graph

```
src/lib/dispatch-claim.js  (NEW)
  ├─LAZY requires→ src/lib/actions.js        [existing, unchanged — taskSpecFromPlan, startExecution]
  ├─LAZY requires→ src/lib/task-registry.js  [existing, unchanged — addAndClaim, load]
  ├─requires→ src/lib/safe-fs.js             [existing, unchanged]
  └─requires→ path                           [node builtin]

src/hooks/PreToolUse.Task.js ──fail-soft requires→ src/lib/dispatch-claim.js  [NEW edge]
```

**The `actions` and `task-registry` requires are LAZY** — performed inside the
function, in a guard — mirroring the pattern already used and justified at
`plan-coverage.js:295` and `streaming-gate.js:265`. `actions.js` is a large module
that pulls in much of the library, and a PreToolUse hook must stay cheap and must not
acquire a load-time cycle. **Step 11 verifies no load-time cycle exists** by reading
the require graph, not by trusting this paragraph.

The hook's require of this module is **fail-soft**, in its own `try`/`catch`, exactly
matching how `PreToolUse.Task.js` already loads `detector`, `agentSlots` and
`enforcementLog` (`:63-68`). A module that fails to load degrades enforcement rather
than crashing the hook — the file's stated fail-open contract.

### File: `src/lib/dispatch-claim.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "bind a dispatch to the plan it builds, and claim it".

Exports:

- `requiresClaim(payload)` → `boolean`
  - True iff `tool_input.subagent_type` is a build-executing agent type.
  - A payload with no `subagent_type`, or an unrecognised one, is **false** — an
    unknown agent type is not assumed to be a builder. Recorded as a decision below.

- `resolvePlanRef(root, payload, opts)` → `{ plan, reason, candidates }`
  - `reason` is a fixed vocabulary: `'matched' | 'none' | 'ambiguous' | 'unreadable'`.
  - `plan` is the slug on `'matched'`, otherwise `null`.
  - `candidates` lists every slug that matched, so an ambiguous refusal can NAME the
    plans it could not choose between — a refusal a human cannot act on is what gets a
    guard reverted.
  - `'unreadable'` is reached only when the plans directory could not be enumerated.
    It must never be reachable from "the directory is empty", which is `'none'`.
  - **Never throws.**

- `claimForDispatch(root, payload, opts)` → `{ claimed, plan, task, reason, moved }`
  - Composes: `requiresClaim` → `resolvePlanRef` → `taskSpecFromPlan` →
    `addAndClaim` → on a successful claim only, `startExecution`.
  - **The order is claim-then-move, matching `startAgent` exactly.** A move without a
    claim would manufacture a residency witness for work that never started.
  - Records `opts.agentTaskId` (the slot token from the hook) onto the claimed task so
    the identity is a REAL correlatable value. Today's records set `agentTaskId` to the
    task's own id (`t61`, `t62`, `t63` — verified by reading `tasks.json`), which is
    self-referential and can never match a harness live-agent list, so reconcile's
    confirmed-dead path could never fire for any of them. This plan stops adding to
    that pile; it does not repair the existing records.
  - **Never throws.** A refused claim is a returned reason, never an exception, because
    the caller is a hook whose contract is to decide rather than to crash.

Deliberately NOT here: any notion of "the" active plan, singular — concurrency is five
and a function named for a single active plan would invite a caller to believe
otherwise. And no fallback that allows an unbindable build dispatch through, which
would make the whole mechanism decorative.

### File: `src/hooks/PreToolUse.Task.js`
**Action:** MODIFY — one new step, after the slot, before the allow

Current flow (read live, `:184-223`): CTOC project? → `agentSlots.acquire` → allow, or
block on `max-concurrent`.

New flow inserts exactly one step between the successful acquire and the allow:

1. CTOC project? — unchanged, silent pass if not.
2. `agentSlots.acquire` — unchanged. **Still first**, because the concurrency cap is a
   resource limit and must bind before any bookkeeping.
3. **NEW — if `dispatchClaim.requiresClaim(payload)`:** claim. A successful claim
   allows; a refusal blocks with a message naming the reason and, for `'ambiguous'`,
   the candidate plans.
4. Allow — unchanged for every dispatch that does not require a claim.

**Slot hygiene on a claim refusal.** Step 2 has already taken a slot when step 3
refuses. That slot must be RELEASED with its exact token before the block, or every
refused dispatch leaks a slot and the concurrency fence strangles the session after
five refusals. `agentSlots.release(root, token)` takes an exact token and is a no-op
for an unknown one (`agent-slots.js:253-272`), so this is exact rather than the
oldest-entry release `SubagentStop` uses. **Step 13 tests this specifically** — a
leaked slot on the refusal path is the defect most likely to make a human rip this out.

**The escape-phrase question, settled.** This hook deliberately has no escape hatch
today, and the module header explains why for the concurrency cap: a phrase cannot
conjure a sixth execution context. **That reasoning does not transfer to the claim.**
A claim refusal says "name the plan you are building", which is process, not a
resource — exactly what an escape phrase is for. But adding an escape reader to this
hook means reading the transcript for user-typed text, machinery this hook does not
have and its header explicitly declines. **Decision: no escape phrase on the claim
refusal either, because the remedy is cheaper than an escape** — the dispatcher names
the plan and re-dispatches, which costs one sentence. The block message must say so
plainly, because a refusal whose remedy is unclear is what gets a guard reverted.

Nothing else changes: not the CTOC detection, not the acquire, not the
`max-concurrent` block, not the fail-open outer catch, not the stdin single-consumer
contract.

### File: `tests/a-build-dispatch-claims-the-plan-it-builds.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`. Registry fixtures are minted with the real
`task-registry`, plan fixtures with real plan files carrying real `files:`
frontmatter — never hand-built JSON literals, which drift from the schema the moment
the schema moves.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect** — a build dispatch naming one real todo plan, nothing claimed before | after `claimForDispatch`: a `running` `implement` task names that slug, AND the plan file now resides in `plans/in-progress/` |
| 2 | **claim precedes move** — `addAndClaim` stubbed to refuse | the plan is **NOT** moved; the residency witness is never manufactured without a claim |
| 3 | **zero match refuses** — a build dispatch naming no existing plan | `reason === 'none'`; no task created; no plan moved |
| 4 | **ambiguity refuses and NAMES both** — a prompt naming two real plans | `reason === 'ambiguous'`; `candidates` holds both slugs; no task; no move |
| 5 | **THE FENCE** — plans directory unreadable | `reason === 'unreadable'`, **never `'none'`**; no task; no move |
| 6 | **an empty plans directory is `none`, not `unreadable`** | the two states never collapse |
| 7 | **a prefix slug does not double-match** — slugs `00165-foo` and `00165-foo-bar`, prompt naming the longer | exactly one match, the longer; `reason === 'matched'` |
| 8 | **a planner dispatch is not claimed** — `subagent_type: 'implementation-planner'`, prompt naming a real plan | `requiresClaim` false; no task; no move; the dispatch is ALLOWED |
| 9 | **an unknown agent type is not claimed** | `requiresClaim` false; allowed unchanged |
| 10 | **a build dispatch with no `subagent_type`** | `requiresClaim` false; allowed — recorded decision, pinned |
| 11 | **a plan with no `files:` is refused, not claimed** | `taskSpecFromPlan` throws inside the guard → a returned reason, **no exception escapes** |
| 12 | **an unresolvable dependency is refused, not claimed** | same: a returned reason, no throw |
| 13 | **the agent identity is real** — a slot token passed as `opts.agentTaskId` | the claimed task's `agentTaskId` is that token, **not** the task's own id |
| 14 | **never throws** — `root` a file, empty string, `null`; payload `null`, `{}`, deeply malformed | a reason is returned for each; no throw |
| 15 | **the hook releases its slot on a claim refusal** | drive the real `enforce` with a refusing payload; `agentSlots.activeCount` returns to its prior value |
| 16 | **the hook does NOT release on a successful claim** | the slot stays held — the subagent is about to run |
| 17 | **the refusal message names the action** | for `none`, it says to name the plan; for `ambiguous`, it names the candidates; for `unreadable`, it says the plans directory could not be read — three DIFFERENT messages |
| 18 | **no leak** — a payload whose prompt holds an absolute path, a newline, a terminal escape | the message carries no absolute path, no stack trace, no forged line |
| 19 | **a second dispatch for an already-claimed plan does not double-claim** | the existing non-terminal task is reused, mirroring `startAgent`'s `findActivePlanTask` guard (`actions.js:1461`) |
| 20 | **the fence is not vacuous** — case 3's assertion applied to case 1's payload | FAILS, proving case 3 discriminates on a real absence |

Cases 2, 5, 15 and 20 are the plan. Case 2 pins the ordering the ruling names; case 5
pins the could-not-look distinction; case 15 pins the defect that would get this
reverted; case 20 guards against a test that passes against anything.

### The honest instrument — what a fixture cannot prove

Every case above drives real code, but every payload above is **synthetic**. This
repository has just learned that a fixture which is always well-formed cannot find a
defect in what happens when the world is not. Three layers, in increasing honesty:

1. **In-process (cases 1-14):** the decision functions against real fixtures on a real
   filesystem. Proves the logic. Does not prove the hook runs.
2. **The real binary (cases 15-19):** spawn `node src/hooks/PreToolUse.Task.js` as a
   child process with a payload on stdin and assert on its exit code, its stdout
   decision JSON and its stderr banner. This drives the ACTUAL entry point, including
   the stdin single-consumer contract and the `process.exit` paths that an in-process
   test cannot reach. Cross-platform: `process.execPath`, `path.join`, no shell.
3. **A genuine dispatch — NOT testable from inside the suite.** The suite cannot make
   Claude dispatch a subagent. Stated plainly rather than faked. What is done instead:
   - `00165` ships the runtime check that reports whether the seat has EVER run, so
     the gap is instrumented rather than assumed;
   - **Step 14 performs a live-fire verification by hand**: dispatch one trivial
     subagent, then read `.ctoc/state/tasks.json` and `plans/in-progress/`. If a build
     dispatch did not produce a claim, this plan has not landed, whatever the suite
     says;
   - the payload SHAPE (does `tool_input` really carry `subagent_type`?) is confirmed
     at Step 9 by instrumenting the hook to record the top-level keys of the payload —
     **keys only, never values; a payload may carry transcript content** — for one real
     dispatch, then removing the instrumentation.

**If Step 9 cannot observe a real payload, this plan STOPS and reports**, because
every case above rests on a payload shape nobody has seen.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `requiresClaim` + `claimForDispatch` | `enforce` in `src/hooks/PreToolUse.Task.js` | the harness `Task` matcher — every subagent dispatch |
| the refusal messages | `block()` → stderr + the deny JSON | the human's terminal |
| the exact-token release | `enforce`'s refusal path | the concurrency fence |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test. The root is the real dispatch path — which
is precisely the thing `00165` must first prove executes.

## What this does NOT fix

1. **It does not narrow the write surface.** `00129` Part B stays blocked by its own
   precondition. This plan is what could eventually unblock it — by making the building
   set non-empty — but it does not touch `plan-coverage` and changes no allow or deny
   for any edit. **The cross-plan write surface remains open after this plan.**
2. **It does not repair the 64 existing bookkeeping records**, six of which report
   `done` with no start timestamp and one of which (`t60`) carries `"--plan"` where a
   slug belongs. Reported, not fixed; a separate decision already before the human.
3. **It does not fix `.ctoc/state/agent.json`**, still reporting an active build from
   2026-07-18. See the correction in `00167` about what that file does and does not
   control.
4. **It cannot bind a dispatch that does not name its plan.** It refuses one, which is
   the honest response, but a refusal is not a binding. If the dispatcher habitually
   omits the plan name, this converts silent wrongness into loud friction — better, and
   not the same as solved.
5. **It does not make the executor claim its own work.** That remains an instruction
   and is named as an instruction.
6. **Per-call attribution is still not established.** Knowing WHICH of up to five
   concurrent plans made a particular edit needs an identity binding a tool call to a
   task, which no hook payload is known to carry. `opts.agentTaskId` improves the task
   side only.
7. **A stale claim is not ended by this plan.** That is `00167`.
8. **It changes nothing about the Bash channel, escape phrases, or any human gate.**

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-build-dispatch-claims-the-plan-it-builds.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1-14 must be RED** — the module does not exist.
- **Cases 15-16 must be RED for the right reason**: the hook currently allows every
  dispatch without a claim. Confirm the reason is a missing claim, not a spawn failure
  — a test that is red because it could not start `node` proves nothing.
- **Case 20 must FAIL as designed** (case 3's expectation against case 1's payload);
  record that it does, or case 3 is not discriminating.

**Write nothing under `src/` until Step 9's gate has passed.**

### Step 9: PREPARE

**9a — THE PRECONDITION GATE. This decides whether the plan exists.**

1. Run `00165`'s `dispatch-seat-liveness` check on this repository and record the
   state verbatim.
   - **`not-live` or `unknown` → STOP HERE.** Report the measurement, build nothing,
     and put the finding to the human: the only mechanical seat does not execute, so
     what remains is an instruction. **This is a successful run of this plan.**
   - **`live` → report what changed** since planning measured otherwise, then proceed.
2. **Observe a real payload's SHAPE.** Instrument `enforce` to record the top-level
   keys of the parsed payload and the keys of `tool_input` — **keys only, never
   values** — for one real dispatch. **REPORT the key lists.** Confirm
   `tool_input.subagent_type` exists and carries the agent type. **If it does not, STOP
   and report**: the binding rests on a field that does not exist.

**9b — the vocabulary, read from the built product rather than from this plan.**

3. Read `agents/` and enumerate which agent types actually execute a build. **Do not
   copy a list out of this plan.** Record the set; a misspelled agent type silently
   makes `requiresClaim` false and the whole mechanism decorative — this repository's
   false-green class wearing a helpful face.
4. Read live, in full: `src/hooks/PreToolUse.Task.js`; `src/lib/agent-slots.js`
   (`acquire`, `release`, the exact-token semantics); `src/lib/actions.js`
   (`taskSpecFromPlan` `:1332-1380`, `startExecution` `:852`, `startAgent`
   `:1415-1500` — **read only; another plan in this set declares `actions.js`, so do
   not modify it here, and stop and ask if its shape has changed**);
   `src/lib/task-registry.js` (`addAndClaim`, `findActivePlanTask`).
5. **Re-measure the live picture**: plan files in `plans/in-progress/` (planning
   measured zero), and registry totals by status (planning measured 64 records / 59
   `done` / 4 `queued` / 1 `cancelled` / **0 running** / **0 cancelling** — note this
   is 64, one MORE than the 63 `00129` measured a day earlier, itself evidence that
   the bookkeeping pattern continued).
6. **Timing.** The hook's added cost per dispatch. **Above roughly 50 milliseconds,
   stop and report** — this runs on every subagent launch.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items. **Only if 9a's gate passed.**

- `src/lib/dispatch-claim.js` — `requiresClaim`, `resolvePlanRef`,
  `claimForDispatch`; closed-vocabulary binding; `unreadable` never collapses into
  `none`; claim-then-move ordering; lazy guarded requires; never throws.
- `src/hooks/PreToolUse.Task.js` — the claim step between acquire and allow; exact-
  token slot release on refusal; three distinct refusal messages; nothing else touched.
- `tests/a-build-dispatch-claims-the-plan-it-builds.test.js` — the twenty cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of "which plan does this dispatch build" and
that the hook holds no second copy. **Confirm by reading the require graph that no
load-time cycle exists** between `dispatch-claim`, `actions` and `task-registry` — the
lazy require is the mechanism and it must be verified, not assumed. Confirm the claim
strictly precedes the move on every path — read the diff, do not infer it from the
tests. Confirm no path allows an unbindable BUILD dispatch through. Confirm the
non-build path is byte-for-byte today's behaviour. Confirm `agent-slots`,
`task-registry` and `actions` signatures are unchanged.

### Step 12: OPTIMIZE
Confirm the plan vocabulary is enumerated at most ONCE per dispatch, and only when
`requiresClaim` is true — a non-build dispatch must do no filesystem work it does not
do today. Confirm the registry is loaded at most once per claim. Record the
before-and-after per-dispatch timing.

### Step 13: SECURE
- **Slot-leak test**: five consecutive refused build dispatches. `activeCount` must
  return to its starting value and a sixth legitimate dispatch must still be admitted.
  A leak here strangles the session and is the most likely cause of a revert.
- **A crafted plan slug cannot escape `plans/`**: a dispatch prompt naming
  `../../../etc/passwd`, a NUL-bearing slug, a separator-bearing slug. The vocabulary
  is built from real directory entries and every candidate is validated with the
  existing `isSafePlanSlug` shape (`actions.js:1049-1053`) before any `path.join`.
  Confirm none reaches the filesystem.
- **A hostile prompt cannot inject the message**: a newline, a terminal escape, `%s`,
  and a 10,000-character prompt. Confirm the message carries a fixed-vocabulary reason,
  bounded slug names, and no prompt content.
- **A dispatch cannot forge a claim for a plan it does not name**: confirm the claim's
  slug always comes from the on-disk vocabulary, never from the payload text directly.
- Confirm every fault path returns rather than throws: absent plans directory,
  unreadable plans directory, corrupt registry, a lazy require that fails, an
  unwritable registry.

### Step 14: VERIFY
Targeted run first: the new test file, `tests/task-concurrency-fence.test.js` (or
whatever Step 9 finds covering `PreToolUse.Task.js`), `tests/agent-slots.test.js`,
`tests/task-registry.test.js`, `tests/task-reconcile.test.js`,
`tests/actions-scheduler.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/false-green-fence.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would — this is the case that matters**:

1. **Live-fire.** Dispatch one real build subagent at a real todo plan. Then read
   `.ctoc/state/tasks.json` and `plans/in-progress/`. **A `running` `implement` task
   naming that plan must exist, and the plan file must have moved.** If not, this plan
   has not landed, whatever the suite reports.
2. **The refusal, by hand.** Dispatch a build subagent whose prompt names no plan.
   **Read the message that comes out.** If it does not name an action a person can
   take, the fix is not finished.
3. **The non-build path.** Dispatch a planning subagent and confirm it is unaffected
   and that no task was created for it.

**No git operations.**

### Step 15: DOCUMENT
A file header on `dispatch-claim.js` recording: why the binding is a closed vocabulary
read from disk rather than a pattern over free text; why zero and several matches BOTH
refuse and neither guesses; why `unreadable` is a separate state from `none`; why the
claim strictly precedes the move (a residency witness without a claim is a lie);
why the agent type rather than the slug match decides that a claim is required, and
that "unclaimed is allowed" is deliberately NOT the rule; and that `agentTaskId` now
carries a real correlatable token because the existing records set it to the task's own
id and could never match a live-agent list.

A comment in `PreToolUse.Task.js` at the refusal path recording that the slot MUST be
released with its exact token, and what leaks if it is not.

### Step 16: FINAL-REVIEW
Report, in this order:

1. **Whether the Step 9a gate passed**, with the seat-liveness state and the observed
   payload key list verbatim. If it did not pass, **that is the headline**: the claim
   cannot be mechanically seated today, only instructed, and the ruling cannot be
   honoured by a mechanism.
2. The Step 8 verbatim reds, and case 20's result.
3. The live-fire result from Step 14 — the task record and the plan's new location,
   quoted — and what each refusal message actually said.
4. The slot-leak result from Step 13.
5. The eight things this does NOT fix, the open cross-plan write surface first.
6. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan builds SECOND**, after `00165`, which is named in `depends_on` because its
answer is this plan's precondition. Prose does not constrain the scheduler; the field
does.

**A concurrent executor is finishing a slice touching `src/lib/project-root.js` and
`src/lib/menu-screens.js`.** This plan declares NEITHER and modifies neither.

`src/lib/actions.js` is declared by `00167` in this set and is **read but not modified
here**. `src/hooks/PreToolUse.Task.js` is declared by no other plan in this set. Plans
build sequentially, so there is no concurrent-edit hazard; the executor reads live at
Step 9.

## Decisions Taken Under Ambiguity

1. **The dispatch hook is the chosen seat, because its failure is loud and early.** A
   missing claim refuses the dispatch before any work exists. The executor-self-claim
   candidate fails silently and is an instruction; the completion-route candidate fails
   late. Named and weighed rather than listed.
2. **The plan cannot be built on a seat that does not run, so `00165` gates it.**
   Planning measured no evidence the `Task` hook has ever executed here — from inside a
   real dispatch. Shipping a mechanism into a hook that does not fire would produce a
   green suite over a dead fence, which is this repository's documented false-green
   class.
3. **The binding is a closed vocabulary from disk, never a pattern over free text.** A
   pattern would produce a confident wrong claim on the next prompt shape. The
   vocabulary can only ever name plans that exist.
4. **Zero matches and several matches BOTH refuse.** Picking the first, the newest, or
   the longest of several genuinely distinct slugs would be a guess at exactly the
   moment the context is known to be insufficient.
5. **`unreadable` is a distinct outcome from `none`.** "I could not look" must never
   render as "I found nothing" — the same inversion `00165` is built around.
6. **The claim requirement is keyed on the agent type, positively.** Keying it on the
   absence of a claim would make it decorative, and keying it on the slug match alone
   would over-claim every planning dispatch, since planning prompts routinely name
   plans.
7. **An unknown or absent `subagent_type` does NOT require a claim.** The alternative
   — treat anything unrecognised as a builder — would refuse research, analysis and
   every future agent type on the day it is added, which is how a fence gets switched
   off. Cases 9 and 10 pin it. **This is the weakest point in the design and is named
   as such**: a build dispatch under an unrecognised type slips through unclaimed, and
   `00167`'s completion backstop is what catches it.
8. **The claim strictly precedes the move**, matching `startAgent` and `advanceAgent`.
   A plan moved into `in-progress/` without a claim manufactures a residency witness
   for work that never started — a new lie in place of the old silence. Case 2 pins it.
9. **No escape phrase on the claim refusal**, unlike the editing hooks and matching
   this hook's existing posture. The remedy — name the plan and re-dispatch — costs one
   sentence, which is cheaper than an escape, and adding a transcript reader to this
   hook is machinery its header explicitly declines. The block message must say the
   remedy plainly.
10. **The slot is released with its EXACT token on a refusal.** The oldest-entry
    release that `SubagentStop` uses would free a different, live subagent's slot and
    silently over-subscribe the cap from then on. Case 15 and Step 13 pin it.
11. **`agentTaskId` records a real token.** Verified by reading `tasks.json`: `t61`,
    `t62` and `t63` each set `agentTaskId` to their own task id, a self-referential
    value that can never appear in a harness live-agent list, so reconcile's
    confirmed-dead path could never fire for any existing record. New claims stop
    adding to that pile; the existing records are reported, not repaired.
12. **The registry count is 64, not the 63 `00129` measured.** One further `done`
    record appeared between the two measurements — itself evidence that the after-the-
    fact bookkeeping pattern continued. Stated with its value rather than carried
    forward as a stale number.
13. **A genuine dispatch is NOT testable from inside the suite, and that is stated
    rather than faked.** Three layers are shipped instead — in-process logic, the real
    hook binary driven as a child process, and a by-hand live-fire at Step 14 — plus
    `00165`'s runtime check so the untestable gap is instrumented rather than assumed.
14. **The build-agent vocabulary is read from `agents/` at Step 9, not copied from this
    plan.** A misspelled agent type would make `requiresClaim` silently false and the
    entire mechanism decorative while every test still passed.
</content>
