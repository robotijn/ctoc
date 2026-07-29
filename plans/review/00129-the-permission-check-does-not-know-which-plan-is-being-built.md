---
approved_by: human
approved_at: 2026-07-20T09:39:54.680Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-19T21:31:41.220Z
gate_crossed: implementation → todo
---

---
title: "The permission check does not know which plan is being built — and the witness that would tell it is not set on the dispatch path actually in use"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00127-the-human-approving-a-plan-is-never-shown-the-files-it-grants, 00126-one-character-separates-a-normal-declaration-from-the-whole-repository, 00142-the-infrastructure-whitelist-reaches-outside-the-repository-through-a-link
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Edit.js"
  - "tests/a-denial-names-the-action-that-resolves-it.test.js"
  - "src/lib/building-plans.js"
  - "tests/only-a-building-plan-grants-write-access.test.js"
  - "src/lib/plan-coverage.js"
---

# The permission check does not know which plan is being built

## READ THIS FIRST — a measurement that changes what this plan may ship

An earlier draft of this plan proposed narrowing write permission to plans that are
either resident in `plans/in-progress/` or named by a `running`/`cancelling`
`implement` task. **Both witnesses were measured on this repository. Both are
empty.**

| witness | measured | value |
|---|---|---|
| plan files in `plans/in-progress/` | glob over `plans/in-progress/**` | **ZERO** — the directory holds no plan file |
| `running` or `cancelling` tasks in `.ctoc/state/tasks.json` | all 63 task records read | **ZERO** — statuses present are `done` (58), `queued` (4), `cancelled` (1) |

**The building set is EMPTY. Under the earlier rule, every approved queued plan would
grant nothing, every edit to `src/` and `tests/` would be refused, and the build would
stop on the first edit after this landed.**

The proof is not theoretical. An executor is building right now, and its writes are
permitted by approved-but-unstarted queued plans — precisely the case the earlier rule
removed.

The earlier draft's central sentence — *"the empty set, which grants nothing; never
allow everything"* — is correct as security and, against the live state, is a total
denial of the build. It reasoned carefully about the set being SMALLER and never asked
whether it is ever NON-EMPTY.

**That question is now asked and answered below. The answer changes this plan from an
enforcement change into a finding plus one small, safe repair.**

## THE HONEST VERDICT: no reliable building witness exists today

### Where the witness IS set — the sanctioned path, verified by reading

`actions.startAgent` (`actions.js:1466-1481`) and `actions.advanceAgent`
(`:1579-1591`) do, in order:

1. `taskRegistry.addAndClaim(root, spec)` — and on a successful claim,
   `task-registry.js:1089` sets `status: 'running'`;
2. `startExecution(plan.path, root)` — which is `movePlan(planPath, 'in-progress')`
   (`actions.js:852-855`), physically moving the plan file into
   `plans/in-progress/`.

**So on the sanctioned menu path, BOTH witnesses fire together.** The earlier draft's
worry — that `startExecution` moves a plan without creating a task, requiring an OR
rather than an AND — is **wrong for this path**: the task is created and claimed
FIRST, and the move happens only after. Those two are the same event, not two
independent ones.

`plans/in-progress/` is also a real directory, not a frontmatter state.
`plan-coverage.STAGE_PRIORITY` is `['in-progress', 'todo']` (`:68`) and the scan reads
that folder from disk (`:431-442`). The project instructions describe in-progress as a
frontmatter state; **the code disagrees and the code wins.** That discrepancy is
recorded rather than resolved here.

### Where the witness is NOT set — the path actually in use

Neither witness is set for the work happening in this repository right now. The
evidence, all measured:

1. **`plans/in-progress/` is empty** while an executor is demonstrably building.
2. **No task is `running`** while an executor is demonstrably building.
3. **`.ctoc/state/agent.json` is stale**: it reports `active: true` for plan
   `00071-fg1-false-green-fence` with `startedAt: 2026-07-18T13:23:02.265Z` — two days
   old. That plan's own task (`t50`) is recorded `done` at `2026-07-18T13:39:18`. The
   status was never cleared.
4. **The recent task records are bookkeeping written around a build, not a record of
   it.** `t63` (plan `00128`) records `created 21:44:58 → started 21:45:00 → done
   21:45:20` — **22 seconds** for a full Iron Loop slice. `t62`: 6 seconds. `t59`: 11
   seconds. These are not durations of builds; they are durations of writing down that
   a build happened.

**Conclusion, stated plainly: the witness exists in code and works when the menu drives
the build, but it is not set on the dispatch path in actual use — the session model
dispatching an executor subagent directly. There is therefore no reliable signal today
that correlates with a live build.**

This is a **finding, not a failure.** It is also the more important result: the reason
the permission check does not know which plan is being built is that **nothing on the
live dispatch path tells anyone which plan is being built.** No permission design can
be layered on top of that until it is fixed.

### The registry is not fit to be a permission oracle — measured

The earlier draft promoted `.ctoc/state/tasks.json` to a permission input. Its
integrity was measured:

| property | measured |
|---|---|
| total task records | 63 |
| recorded `done` | 58 |
| of those, carrying **no start timestamp** (`ts.started === null`) | **6** — `t6`, `t11`, `t28`, `t30`, `t38`, `t39` |
| records whose `plan` field is not a plan slug | **1** — `t60` carries `plan: "--plan"`, a command-line flag where a slug belongs |
| records `running` or `cancelling` | **0** |

A correction to the number this repair was commissioned with: **58 is the count of
`done` records, not the count of records lacking a start time.** Six of those 58 lack
one. The registry is roughly 10 percent internally inconsistent plus one malformed
slug — not 92 percent. The corrected number is smaller and the conclusion is unchanged,
because the conclusion never rested on the rate:

**A record that says `done` for work it never saw start is not a record of execution.
It is a record of intent, written by whatever wrote it, sometimes after the fact and
sometimes instead of the fact.** The `--plan` entry is the same defect in a different
field: something passed an argument list where it should have passed a slug, and the
registry accepted and persisted it.

Two consequences, and the second is the one that matters:

1. **The specific corruptions found do NOT break the proposed predicate.** It would read
   only `kind === 'implement'`, `status ∈ {running, cancelling}`, and `plan`. A missing
   `started` is not consulted. A malformed `plan` on a `cancelled` task contributes
   nothing. So the earlier draft's fail-closed table was right as far as it went.
2. **But a corrupt oracle that fails to EMPTY denies everything.** `task-registry.load`
   returns empty on corruption by design (`task-registry.js:74`, *"a corrupt registry
   must never brick the NAV plane"*) — correct for navigation, and it means one
   unparseable byte turns every approved plan into a plan that grants nothing. Combined
   with an `in-progress/` folder that the live dispatch path never populates, the
   fail-closed direction is not a conservative edge case. **It is the ordinary case.**

## What may be built, and what may not

### Part A — BUILDABLE TODAY: a denial that names the action that resolves it

This part depends on nothing measured above and carries no denial risk. It is also
**required by `00126`**, which introduces a denial reason the current message answers
wrongly.

`buildBlockMessage` (`src/hooks/PreToolUse.Edit.js:348-364`, read live) interpolates
the reason but **hardcodes the remedy**:

```js
const explanation = denial && denial.plan
  ? `  Why: the plan "${denial.plan}" declares this file, but it grants nothing `
    + `(${denial.reason || 'not approved'}).\n`
    + `       Only an APPROVED plan grants write access. Approve or re-approve it via /ctoc:menu.\n\n`
  : '';
```

For today's only reason class — a plan that is unapproved or whose approval no longer
matches its content — that sentence is correct: approving or re-approving genuinely
resolves it. **It is wrong for both reasons this repair set adds:**

| reason | why the hardcoded sentence is wrong | the ACTION that actually resolves it |
|---|---|---|
| `unanchored-declaration` (`00126`) | the plan **is** approved; re-approving an unchanged plan changes nothing and the human is blocked again with no new information | **two steps**: add `unanchored_scope: "<why>"` to the plan's frontmatter, THEN re-approve it — the key changes the specification hash, which is the whole point of the design |
| `not-building` (Part B, if ever built) | the plan is approved AND bounded; approval is not the blocker at all | start the plan through `/ctoc:menu`, or type an escape phrase yourself |

**A lockout a human cannot act on is exactly what gets a guard reverted within a
week** — and reverting this one reopens a self-granting write surface on gate
enforcement. The earlier draft's instruction here was *"if the existing wording is
generic enough, change nothing… prefer no edit to a cosmetic one."* **That instruction
is SUPERSEDED and must not be followed.** It would ship a correct refusal with an
unfollowable remedy, which is the same defect as no message at all, arriving with more
confidence.

**Build: a reason-keyed remedy table.** One exported constant mapping each
fixed-vocabulary reason token to its remedy sentence, consulted by `buildBlockMessage`.

- The table lives beside `buildBlockMessage` in `src/hooks/PreToolUse.Edit.js`, which
  this plan declares.
- **An unknown or absent reason falls back to today's sentence**, unchanged — so this
  can never make an existing denial less informative than it is now.
- Reason tokens are the fixed vocabulary shared with `plan-coverage`; the table keys
  must match `declaredBreadth.REFUSAL_REASON` exactly, spelled once. Step 9 confirms
  the spelling against the built code rather than against `00126`'s prose.
- The message keeps its existing discipline: a fixed-vocabulary reason and a
  repository-relative plan reference only — **no file contents, no absolute paths, no
  stack traces** — and it changes **no allow/deny outcome whatsoever.**
- The `not-building` row is included in the table from the start, even though Part B
  may never produce that reason. An unreachable row is harmless; a missing row when the
  reason arrives is a silent fallback to the wrong remedy.

### Part B — BLOCKED: the building-set conjunct

**Part B may not be built while the measurement above holds.** It is specified in full
below so that it is buildable the moment a witness exists, and so that the human can
see exactly what is being held rather than a gap.

**HARD PRECONDITION GATE — this is the mechanism that makes denial-by-default
impossible.** Before any line of Part B's enforcement conjunct is written, Step 9 must
establish, by measurement on the live repository:

> For the plan that the currently-running executor is building, the computed building
> set CONTAINS that plan's slug.

**If it does not — and today it does not — Part B STOPS at Step 9 and reports.** It does
not proceed to Step 10. It does not ship "smaller" and let review catch it. A
permission narrowing whose ordinary case is denial is not a stricter version of the
check; it is an outage.

### The three routes forward — the human's decision, not the planner's

This plan does not choose among these and does not schedule any of them. They are
listed so the choice is a real one:

| route | what it means | cost | what it leaves open |
|---|---|---|---|
| **A — establish the witness first** | Make the live dispatch path record what the sanctioned path already records: a `running` `implement` task naming the plan, cleared on completion. Part B then becomes buildable and its precondition passes honestly. | a separate plan against the dispatch path; the registry's integrity problems must be fixed too, or the oracle inherits them | nothing — this is the route that actually closes the gap |
| **B — observe only** | Build `building-plans.js`, compute the set, and RECORD it on the enforcement log beside every allow. Change no verdict. | small; no denial risk; produces the evidence to decide later | the cross-plan write surface stays open; this measures it rather than closing it |
| **C — do not build; keep the finding** | Ship Part A only. Record that the cross-plan write surface remains open and why it cannot be closed today. | none | the same surface, with no new measurement |

**Route A is the only one that closes the defect this plan was written for.** Routes B
and C are honest; neither is a fix. Whichever the human picks, **Part A ships**, because
`00126` needs it.

## The original defect, unchanged and still real

`plan-coverage.findCoveringPlan` answers **"does ANY approved plan declare this
file?"** It is asked at `PreToolUse.Edit.js:438` on every editing tool call, and a
match is an allow. It has no parameter for, and no notion of, the work in flight.

So an executor building plan A may edit any file declared by an approved plan B, with
no refusal and no record that anything unusual happened. **That is true today and
remains true after this plan.** Nothing above makes it smaller; the measurement only
establishes that the proposed fix cannot be applied yet.

## THE HARD PART: how does a hook establish WHICH plan is building?

A hook fires on a tool call. It receives the tool's arguments, a transcript path, and
a working directory. It does **not** receive the dispatch that started the work. So
the identity has to come from state on disk. Three candidates exist and each was read
rather than assumed.

### Candidate 1 — the task registry

`src/lib/task-registry.js` persists `.ctoc/state/tasks.json`: tasks with a `kind`, a
`plan` slug, a `status`, and `touches`. `src/lib/state.js:247-253` states the
repository's own position verbatim: *"LIVENESS comes from the scheduler registry… The
agent is 'active' iff the registry holds at least one RUNNING `implement` task."*

**What it gives, in principle:** the set of plan slugs currently being built.

**What it gives in fact, measured:** nothing. Zero running or cancelling tasks while a
build is in flight.

**What it does not give even when populated:** which member of the set made this
particular tool call. `MAX_CONCURRENT` is 5 and concurrent waves are a designed
feature, so the set is routinely larger than one.

**Four faults, all real, the first two now measured rather than predicted:**

1. **It IS empty while builds are genuinely in flight** — measured, zero of 63.
2. **Its records are not faithful** — 6 of 58 `done` records never recorded a start;
   one carries a command-line flag in the `plan` field. See the integrity table above.
3. **It is AGENT-WRITABLE.** `PreToolUse.Edit.js` denies editing-tool writes beneath
   `.ctoc/approvals/` and `.ctoc/state/verify/`, then whitelists all of `/^\.ctoc\//`
   (`:61`). **`.ctoc/state/tasks.json` is in neither denial**, so an agent can write it
   with an editing tool today.
4. **Its load FAILS OPEN by design** — a corrupt registry returns empty rather than
   throwing (`task-registry.js:74`). Correct for navigation; as a permission input it
   means one bad byte denies everything.

### Candidate 2 — the plan's stage

A plan physically residing in `plans/in-progress/` is, by the pipeline's own
definition, being built, and `plan-coverage` already scans that folder.

**What it gives, in principle:** a second, independent signal that survives a registry
that is empty, corrupt, or forged.

**What it gives in fact, measured:** nothing. Zero plan files reside there.

**Why it is empty:** only `startExecution` puts a plan there, and only `startAgent` and
`advanceAgent` call it (`actions.js:1474`, `:1584`) — the sanctioned menu path, which
the live dispatch path does not go through.

It is **not** forgeable into a grant on its own: `COVERAGE_STAGE_EDGE` maps both `todo`
and `in-progress` to the same Gate 2 edge, so a move confers no approval that was not
already there.

### Candidate 3 — an identity in the hook payload

The payload carries `tool_name`, `tool_input` and `transcript_path`
(`PreToolUse.Edit.js:204-216`). The registry can record an `agentTaskId` at birth
(`task-registry.js:1069-1075`), and 12 of the 63 records carry one. If the payload
carried an identity that matched it, per-call attribution would be possible.

**This was NOT verified and is NOT built on.** Planning had no shell and could not
observe a live payload. Nothing in this repository reads a session or agent identity
from a hook payload today — grepped across `src/hooks/`, the only identity-shaped field
any hook reads is `transcript_path`. Whether a subagent's payload carries an identifier
that binds to `agentTaskId`, and whether it is stable across a subagent's calls, is
**measured at Step 9 and REPORTED**. If it exists, that is a follow-up plan the human
schedules — not a thing this plan quietly starts depending on.

### The verdict

**Per-call attribution is not establishable today, and neither is the building set.**
The earlier draft reached the first half of that conclusion and stopped; the second
half is what the measurement added.

Building a check on either would key permission on a signal that is empty in the
ordinary case. It would refuse legitimate work, and the first thing a person does with
a check that refuses legitimate work is switch it off — leaving less protection than
the broad check it replaced.

## The rule Part B WOULD apply, if its precondition ever passes

A plan grants coverage only if it is **approved** (unchanged, from the sibling slice)
**AND building**, where building means:

> the plan resides in `plans/in-progress/`, **OR** the task registry holds a
> `running` or `cancelling` `implement` task naming its slug.

**On the OR, corrected.** The earlier draft justified the union by claiming
`startExecution` moves a plan without creating a task, making an AND deny a large class
of legitimate builds. **Reading the two call sites shows that is wrong**: both
`startAgent` and `advanceAgent` claim the task FIRST and move the plan only on a
successful claim. On the sanctioned path the two witnesses are one event.

The OR is nevertheless kept, for a different and better reason: **a stale
`in-progress/` residency after a crashed session, and a registry emptied by
corruption, are independent failure modes.** Keeping both means one source failing does
not lock a live executor out mid-write. That is now the stated justification; the
earlier one is superseded and must not be repeated.

`cancelling` counts as building: `task-registry.js:146-154` documents it as a
NON-terminal in-flight state that *"still occupies its slot, touches, gitOp and the
sync barrier until the agent is confirmed gone"*. An agent that is still alive is still
building.

### Why every fault grants LESS — and why that is not reassuring here

| fault | effect on the building set | direction |
|---|---|---|
| registry absent / corrupt / unparseable | smaller (empty) | grants less |
| `plans/in-progress/` unlistable | the existing scan already returns a DENY for the whole call | grants less |
| the building-set module throws | must be impossible — never-throw, see below | — |

Every fault direction reduces permission, which is the correct inversion for a
permission check. **The measurement is what makes it insufficient**: when the ordinary,
non-fault state ALSO produces the empty set, "fails toward denial" stops being a safety
property and becomes the behaviour.

**Fail-closed must be built as never-throw.** `PreToolUse.Edit.js:468-472` fails OPEN,
so a throw out of this module becomes an ALLOW. The module returns an empty set on
every fault; it never propagates one.

### The tasks.json write denial ships WITH Part B, never before it

The earlier draft proposed denying editing-tool writes to `.ctoc/state/tasks.json`,
because a signal an agent can write is not a predicate. That reasoning is sound **only
while the file is a permission input.** If Part B is not built, the file is not a
permission input, and shipping the denial would add a refusal that protects nothing.

So: **the denial is part of Part B and is gated behind the same precondition.** If the
human takes route B or C, it does not ship.

Its mechanism, when it does ship: an exact-path guard alongside the ledger and
verify-evidence guards, **ahead of the `.ctoc/` whitelist**, using the existing
`normalizeForProtection` and an exact-path comparison — this is a FILE, not a
directory, so `isUnderProtectedDir` is the wrong shape (a `tasks.json/x` path is not a
thing). Justification: the registry is written programmatically through `safe-fs`
inside the CTOC process (`task-registry.save`, `:475-496`) and by the menu running as
`node src/commands/menu.js`, also in-process — **never by a tool call. MEASURE AT STEP
9**: confirm by search that nothing writes that file through an editing tool. If
something does, report it and stop.

## What stops working, item by item

### Part A

| # | What stops | Acceptable? |
|---|---|---|
| 1 | Nothing. A denial that carried a wrong remedy now carries the right one; an unknown reason renders exactly today's text. No verdict changes. | **Yes — this is a message-only change and must be verified as one.** |

### Part B, if its precondition ever passes

| # | What stops | Acceptable? |
|---|---|---|
| 1 | An executor building plan A can no longer edit files declared only by plan B, unless B is also building. | **Yes — this IS the fix.** |
| 2 | An approved plan in `todo/` that nobody has started grants **nothing**. A human editing one of its files directly is blocked where they were not before. | **Yes, with a remedy** — start the plan through the menu, or type an escape phrase. The escape check runs AFTER coverage (`:448-455`) and is unchanged, so the human's own consent still works. **Part A is what makes that remedy readable.** |
| 3 | An executor dispatched **directly at a `todo/` plan**, without `startExecution` and without a registry task, is locked out of its own declared files. | **This is no longer a risk — it is the MEASURED ORDINARY CASE.** `approval-residency.js:52-59` documents the pattern as real; the measurement shows it is the only pattern in use. This item alone is why Part B is blocked. |
| 4 | Any test fixture that builds a `todo/` plan and asserts a covered edit is allowed goes red. | **MEASURE AT STEP 9.** Those files are **not declared here**: stop and ask. |
| 5 | An editing-tool write to `.ctoc/state/tasks.json` is denied. | **Yes** — nothing legitimate writes it that way. Confirmed at Step 9, and only if Part B ships. |

## What the check does for edits that are not an executor's

Enumerated for Part B, unchanged in substance from the earlier draft, with the last row
corrected:

| who | what happens | why |
|---|---|---|
| **the human typing directly** | Coverage denies unless a plan covering the file is building; then the escape-phrase check runs, and a phrase the human personally typed allows it. | Role-scoped to text the human typed (`extractUserTypedText`, `:240-285`), so it is consent, not self-granting. Unchanged by this plan. |
| **a planner writing a plan** | Unaffected. `/^plans\/.*\.md$/` is whitelisted at `:63`, ahead of coverage. | Plans must remain writable; a plan simply buys nothing until approved. |
| **a hook or CTOC's own code writing state** | Unaffected. Those writes go through `safe-fs` inside the CTOC process and never pass through a tool hook. | Stated explicitly because it is the assumption the tasks.json denial rests on. |
| **an agent editing source with nothing building** | Denied. The building set is empty, so no plan grants anything. | The answer to "undefined active plan" is the empty set, never "allow everything" — **and the measurement shows this is not the exceptional branch. It is every edit in this repository today. That is precisely why Part B is blocked rather than shipped.** |

## Implementation Details

### Dependency graph

```
PART A
src/hooks/PreToolUse.Edit.js  [MODIFY — a reason→remedy table beside buildBlockMessage]
  └─requires→ nothing new

PART B (blocked)
src/lib/building-plans.js  (NEW)
  ├─LAZY requires→ src/lib/task-registry.js   [existing, unchanged]
  └─requires→ src/lib/safe-fs.js              [existing, unchanged]

src/lib/plan-coverage.js ──requires→ src/lib/building-plans.js   [NEW edge]
src/hooks/PreToolUse.Edit.js ──already requires→ src/lib/plan-coverage.js
```

**A cycle must be checked for and avoided, not assumed away**: `task-registry.js:100`
requires `plan-coverage.js` for `touchesOverlap`. Adding
`plan-coverage → building-plans → task-registry` closes the loop
`plan-coverage → task-registry → plan-coverage`.

Node tolerates a require cycle by handing out a partially-populated exports object, and
a permission module that receives a half-built dependency is precisely the kind of
defect that appears only under a particular load order. **The require of
`task-registry` inside `building-plans.js` is therefore LAZY** — performed inside the
function, in a `try`/`catch`, mirroring the lazy-require pattern already used and
justified at `plan-coverage.js:295` and `streaming-gate.js:265`. A failed require
yields an empty registry contribution, which grants less. **Step 11 must verify no
load-time cycle exists**, by reading the require graph rather than by trusting this
paragraph.

Part A introduces no new edge and no cycle risk.

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — Part A now; the tasks.json guard only if Part B ships

**PART A — the reason-keyed remedy table.**

Add, beside `buildBlockMessage` (`:348-364`, read live):

- `DENIAL_REMEDIES` — a frozen map from fixed-vocabulary reason token to remedy
  sentence. Rows: the approval reasons (today's sentence, unchanged);
  `unanchored-declaration` → the two-step remedy naming the frontmatter key AND the
  re-approval, in that order, because doing only the second is what a human would
  otherwise try; `not-building` → start the plan via `/ctoc:menu`, or type an escape
  phrase.
- `buildBlockMessage` consults the table by `denial.reason`. **An unknown or absent
  reason renders today's sentence byte-for-byte** — the fallback is the current
  behaviour, so this change can only add information, never remove it.
- The function stays PURE, so its content is asserted in-process without
  `process.exit` — the property its existing header already claims and the reason it
  is testable at all.

**PART B ONLY — the tasks.json guard.** Add `TASKS_STATE_FILE =
'.ctoc/state/tasks.json'` and an exact-path guard alongside the ledger and
verify-evidence guards, ahead of the `.ctoc/` whitelist, using the existing
`normalizeForProtection`. The deny message says the registry is written by the
pipeline, not by hand. **Does not ship unless Part B's precondition passes.**

Nothing else changes: not the whitelist, not the escape-phrase check, not the coverage
call, not the fail-open outer catch.

### File: `tests/a-denial-names-the-action-that-resolves-it.test.js`
**Action:** CREATE (Part A)
**Framework:** `node:test`, real `os.tmpdir()` fixtures where a fixture is needed,
`path.join` throughout, recursive-force cleanup in `finally`, no shell. Assertions run
against `buildBlockMessage` directly — it is a pure function.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect** — a denial carrying `reason: 'unanchored-declaration'` | the message does NOT tell the human to "approve or re-approve"; it names the frontmatter key `unanchored_scope` AND the re-approval, both |
| 2 | **the second wrong remedy** — `reason: 'not-building'` | the message names starting the plan, and does not say approval is the blocker |
| 3 | **today's behaviour is preserved** — an approval reason (`unapproved`, `hash-mismatch`) | renders the existing sentence, unchanged |
| 4 | **unknown reason falls back** — `reason: 'something-new'` | renders the existing sentence; **no crash, no empty explanation block** |
| 5 | **absent reason falls back** — `denial` present, `reason` null | renders the existing `not approved` text, unchanged from today |
| 6 | **no denial at all** | the explanation block is empty, exactly as today |
| 7 | **no leak** — a denial whose plan reference contains an absolute path and a newline | the rendered message contains no absolute path, no stack trace, no forged line |
| 8 | **the message names the target and the project**, for every reason | unchanged framing, so the change is additive only |
| 9 | **verdict-neutrality** — the same fixture through the real coverage path, before and after | the allow/deny outcome is IDENTICAL for every reason. **This is the case that proves Part A is a message-only change** |
| 10 | **the fence is not vacuous** — case 1's assertion applied to case 3's input | FAILS, proving case 1 discriminates on the reason rather than matching any message |

Cases 9 and 10 are not optional. Case 9 is the whole safety argument for shipping Part
A while Part B is blocked; case 10 guards against a test that would pass against any
string.

### File: `src/lib/building-plans.js`
**Action:** CREATE — **PART B ONLY, blocked**
**Purpose:** The ONE encoding of "which plans are being built right now".

Exports:

- `buildingSlugs(root)` → `Set<string>`
  - The union of: (a) every `.md` basename (extension stripped) in
    `plans/in-progress/`, and (b) every `task.plan` where `kind === 'implement'` and
    `status` is `running` or `cancelling`.
  - **Never throws.** Each source is independently guarded; a fault in one contributes
    nothing and the other still counts. A fault in both yields an empty set.
  - **Ignores `ts.started` entirely.** Six `done` records lack one; a predicate that
    consulted it would inherit a corruption it does not need. Status is the only
    liveness field read.
  - **Skips a record whose `plan` is not a non-empty string** — `t60` carries
    `"--plan"`. A malformed slug can never match a real plan, but skipping it
    explicitly means the set never contains a value nobody can act on.
- `isBuilding(slug, root)` → `boolean` — membership, same never-throw contract.

Deliberately NOT here: any notion of "the" active plan, singular. There is no such
thing while concurrency is five, and a function named for it would invite a caller to
believe otherwise.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY — **PART B ONLY, blocked** — one conjunct, computed once per call

**LINE-NUMBER DRIFT, CORRECTED.** An earlier draft cited the approval verdict at
`:458-460`. **It is at `:479-481`, verified by reading the file**; the denial is
recorded at `:484-491` and the `denial` variable is declared at `:430`. It moved
because a sibling inserted the real-path confinement block (`:410-428`). These numbers
are a navigation aid only — **read live at Step 9 and let the code win.**

- Compute the building set **once**, before the stage loop, beside the confinement
  checks. Not once per plan, and not once per glob.
- Inside the loop, at the point where the approval verdict is already consulted
  (`:479-481` live), add the second condition: the plan's slug must be in the building
  set. Reuse the existing lazy structure so a plan is tested only after one of its
  globs matched.
- A plan that is approved but not building is recorded into the existing `denial` slot
  with `reason: 'not-building'`.

**The denial-slot ranking is NOT specified here.** It is defined once, canonically, in
`00126` under "THE DENIAL SLOT" — reason severity first, glob specificity as a tiebreak
within a reason, with `approval.reason` strongest and `not-building` weakest. `00126`
builds the comparator and leaves a commented `not-building` row naming this plan as its
owner. **This plan's only ranking change is to fill that row in.** It must not restate,
reinterpret, or special-case the rule; if the built comparator differs from `00126`'s
description, **the code wins and the discrepancy is reported.**

That ordering is why `not-building` is weakest: an unapproved plan reported as merely
"not building" would teach the human to start a plan that would still grant nothing.

- A plan residing in `in-progress/` is in the building set by construction, so the
  `in-progress` stage keeps working exactly as it does today. That is not an accident
  and should be stated in the comment.

### File: `tests/only-a-building-plan-grants-write-access.test.js`
**Action:** CREATE — **PART B ONLY, blocked**
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell. Approval fixtures minted with the real
`approval-ledger`; registry fixtures written with the real `task-registry`, never a
hand-built JSON literal — a hand-built fixture drifts from the schema the moment the
schema moves.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect** — approved plan B in `todo/` declaring `src/lib/b.js`, nothing building | `findCoveringPlan('src/lib/b.js')` returns `null` |
| 2 | **the cross-plan reach** — A building in `in-progress/`, B approved in `todo/` | A's declared file is covered; B's is `null`. **This is the finding, stated as one assertion pair** |
| 3 | **the in-progress witness** — approved plan residing in `in-progress/` | covered |
| 4 | **the registry witness** — approved plan in `todo/` WITH a `running` implement task naming its slug | covered |
| 5 | **the cancelling witness** — the same with `cancelling` | covered |
| 6 | **a queued task is not a witness** — approved plan in `todo/` with a `queued` task | `null` |
| 7 | **a terminal task is not a witness** — `done`, `failed`, `orphaned`, `cancelled` | `null` for each |
| 8 | **a task of another kind is not a witness** — a `running` `review` task for the slug | `null` |
| 9 | **a task naming a different plan is not a witness** | `null` |
| 10 | **unapproved plus building grants nothing** — squatted into `in-progress/` with no ledger entry | `null`. The sibling slice's guarantee must not be weakened by this one |
| 11 | **fail closed on a corrupt registry** — invalid JSON, plan in `todo/` | `null`, **no throw** |
| 12 | **the other witness still carries it** — corrupt registry, plan residing in `in-progress/` | **covered** — proving the two sources are independent |
| 13 | **fail closed on an unreadable in-progress directory** — stub `safe-fs`'s `readdirSync` to throw, restore in `finally` | `null`, **and no throw** |
| 14 | **the denial explains itself** | `explainDenial` reports `not-building` and names the plan |
| 15 | **an unapproved plan reports the APPROVAL reason, not `not-building`** | the stronger reason wins — the shared rule from `00126`, exercised from this side |
| 16 | **the registry file is protected** | `isProtected…` for `.ctoc/state/tasks.json` is `true`; for `.ctoc/state/other.json` `false`; for `.ctoc/state/tasks.json.bak` `false` |
| 17 | **the fence is not vacuous** | case 1's exact fixture with a building witness added matches — proving 1, 6, 7, 8 and 9 fail for the building reason and not because the harness never matched anything |
| 18 | **a `running` task with a NULL start time is still a witness** | covered — the predicate reads status, never `ts.started`; pins the registry-corruption decision |
| 19 | **a malformed plan slug is not a witness** — a `running` task whose `plan` is `"--plan"` | `null`, no throw; the real `t60` shape, pinned |

### Wiring — the live call sites

| change | live call site | root | part |
|---|---|---|---|
| `DENIAL_REMEDIES` | `buildBlockMessage` → `block()` → stderr | the human's terminal, on every denial | **A** |
| `buildingPlans.buildingSlugs` | `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:438`, every editing tool call | B |
| the `not-building` denial | `explainDenial` → `buildBlockMessage` | the human's terminal | B |
| the tasks-file guard | `enforce` | ahead of the `.ctoc/` whitelist | B |
| both test files | the suite | `npm test` | A / B |

Nothing here is reachable only from a test. **Part A's root is the human's terminal —
the only place a remedy can do any good.**

## What this does NOT fix

1. **The cross-plan write surface stays open.** Part A does not narrow it and Part B is
   blocked. This is the honest headline: **the defect this plan is named for is not
   closed by this plan.**
2. **Per-call attribution is not closed** and cannot be, absent an identity binding a
   tool call to a task. Step 9 measures whether the payload could support one and
   reports it.
   *Mitigating fact, not a fix:* the scheduler's Rule 4 keeps concurrently-running
   tasks file-DISJOINT (`task-registry.js:855-865`). That is a scheduling property, not
   a permission one, and it is not enforced on this path.
3. **The registry's integrity is not repaired.** Six `done` records with no start time
   and one malformed slug are reported, not fixed. Fixing them belongs with whatever
   writes them.
4. **The live dispatch path still records nothing.** That is route A, and it is the
   human's to schedule.
5. **`.ctoc/state/agent.json` is stale** — two days old, reporting an `active` build
   that finished. Not touched here; reported as a finding.
6. **The Bash channel is unchanged.**
7. **Escape phrases are unchanged** — a human who types one can still edit anything.
8. **A stale `in-progress/` residency would still count as building**, if Part B ever
   ships. Tightening that means a liveness timeout on a permission check, which would
   make write access expire mid-build. Not done, and named.
9. **It does not bound declaration breadth** (`00126`), **does not show scope at
   approval** (`00127`), and **does not resolve real paths** (`00128`, `00142`).

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/a-denial-names-the-action-that-resolves-it.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1 and 2 must be RED** — today every denial renders "Approve or re-approve
  it" regardless of reason. **If they are not red, STOP**: the premise is wrong.
- **Cases 3, 5, 6, 8 and 9 must be GREEN already** and must stay green. They are the
  proof this is additive.
- **Case 10 must FAIL as designed** (it asserts case 1's expectation against case 3's
  input); record that it does, or case 1 is not discriminating.

**Write `tests/only-a-building-plan-grants-write-access.test.js` ONLY IF Step 9's
precondition passes.** Writing Part B's tests first would produce a red suite for a
part that is not going to be built, which is a false signal in the opposite direction.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.

**9a — THE PRECONDITION MEASUREMENT. This decides whether Part B exists.**

Read from disk, in full: `src/lib/plan-coverage.js`; `src/lib/task-registry.js`
(`load`, `TERMINAL`, `OCCUPYING`, the status set); `src/lib/state.js:247-293`;
`src/lib/actions.js:840-960` and `:1430-1610` (`startExecution`, `completeExecution`,
`startAgent`, `advanceAgent` — **read only; a concurrent executor may be editing this
file, so do not modify it and stop and ask if its shape has changed**);
`src/hooks/PreToolUse.Edit.js:58-190` and `:340-473`; `src/lib/approval-residency.js`.

Then measure, and **report the full table before any code is written**:

1. **The live picture.** Every plan in `todo/` and `in-progress/`, and every task in
   the registry with kind, status and plan. For each plan: approved? building by
   residency? building by task?
2. **THE GATE.** For the plan the currently-running executor is building, is its slug
   in the computed building set?
   - **NO → Part B STOPS HERE.** Report the measurement, build Part A only, and present
     the three routes to the human. **Do not write Part B's module, its test, or its
     conjunct. Do not ship the tasks.json denial.** This is the expected outcome given
     the planning-time measurement, and reaching it is a successful run of this plan,
     not a failure of it.
   - **YES → report what changed** since planning measured zero, and only then proceed
     to 9b.
3. **Is anything being built from a `todo/` plan right now** — a plan in `todo/` with
   recent execution-record edits and no registry task. Planning measured that this is
   the only pattern in use.
4. **Re-measure the registry's integrity**: total records, `done` count, `done` records
   with `ts.started === null`, records whose `plan` is not a plan slug, records
   `running` or `cancelling`. Planning measured 63 / 58 / 6 / 1 / 0. **Report the
   current numbers verbatim** — the corrected figures, not the commissioning ones.

**9b — PART A, which proceeds regardless of the gate.**

5. **Confirm the reason vocabulary against the BUILT code**, not against `00126`'s
   prose: read `declared-breadth.REFUSAL_REASON`'s actual value and the reason strings
   `approval-residency` actually returns. The table's keys must match exactly. **A
   remedy keyed on a misspelled reason silently falls back to the wrong sentence** —
   which is this repository's false-green defect class wearing a helpful face.
6. **Confirm `buildBlockMessage` is still pure** and still called only from `block()`.

**9c — PART B ONLY, if the gate passed.**

7. **Does anything write `.ctoc/state/tasks.json` through an editing tool?** Search the
   source, the agent definitions and the test suite. **If anything does, report and do
   not ship the denial.**
8. **Whether the hook payload carries a usable identity.** Instrument `enforce` to
   record the top-level keys of `stdinJson` (**keys only — never values; a payload may
   carry transcript content**) for one real tool call, then remove the instrumentation.
   **REPORT the key list.** Do not build on it whatever it shows.
9. **Timing.** `findCoveringPlan` before and after. **Above roughly 10 milliseconds per
   call, stop and report.**

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
One step, files as sub-items.

**Part A (always):**
- `src/hooks/PreToolUse.Edit.js` — `DENIAL_REMEDIES` and the table lookup in
  `buildBlockMessage`; unknown and absent reasons fall back to today's sentence
  byte-for-byte.
- `tests/a-denial-names-the-action-that-resolves-it.test.js` — the ten cases.

**Part B (only if 9a's gate passed):**
- `src/lib/building-plans.js` — `buildingSlugs`, `isBuilding`; lazy `task-registry`
  require inside a guard; never throws; status-only liveness; malformed slugs skipped.
- `src/lib/plan-coverage.js` — the building set computed once per call; the conjunct at
  the existing approval point (`:479-481` live); the `not-building` reason filled into
  `00126`'s severity table.
- `src/hooks/PreToolUse.Edit.js` — the `.ctoc/state/tasks.json` guard.
- `tests/only-a-building-plan-grants-write-access.test.js` — the nineteen cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
**Part A:** Confirm the remedy table is the ONLY place a remedy sentence is spelled,
that `buildBlockMessage` remains pure, and that the fallback path is byte-identical to
today's output. Confirm no allow/deny logic was touched — read the diff, do not infer
it from the tests.

**Part B, if built:** Confirm there is exactly ONE encoding of "which plans are
building" and that `plan-coverage.js` contains no second copy. **Confirm by reading the
require graph that no load-time cycle exists** between `plan-coverage`,
`building-plans` and `task-registry` — the lazy require is the mechanism and it must be
verified, not assumed. Confirm the building set is computed once per call. **Confirm
the denial comparator was not modified beyond filling in the `not-building` row** —
the rule belongs to `00126`. Confirm the approval check still runs only on a matched
glob and that a plan file is still read once. Confirm the sibling slice's approval
guarantee is untouched. Confirm `globToRegex`, `touchesOverlap` and `readPlanFiles`'
signatures are unchanged.

### Step 12: OPTIMIZE
**Part A:** confirm the table lookup is a constant-time map read on the block path
only, and that nothing new runs on an allow.

**Part B, if built:** confirm the registry is loaded at most once per coverage call and
the `in-progress/` listing happens at most once. Confirm nothing new runs on the
whitelist fast path. Confirm `explainDenial`'s second scan is still block-path only.
Record the after-timing.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
**Part A:**
- Confirm a hostile `denial.reason` cannot inject text: a reason containing a newline,
  a terminal escape, `%s`, and a 10,000-character string. The table is keyed by exact
  match and an unknown key falls back — confirm none of those reach the output.
- Confirm the message still leaks no file contents, no absolute paths, no stack traces.
- Confirm the remedy text names no path outside the repository and no internal state.

**Part B, if built:**
- **Forge attempt one**: write a `running` implement task for another plan into
  `.ctoc/state/tasks.json` with an editing tool. Must be DENIED; record the
  before-behaviour too.
- **Forge attempt two**: the same through `.ctoc/state/./tasks.json`, a case variant,
  and a `..` that resolves back onto the file. Each must be denied.
- **Forge attempt three**: move a plan into `plans/in-progress/` to manufacture a
  witness. Confirm this grants **nothing** it did not already have, because the
  approval predicate is independent of residency — record the result rather than
  asserting it.
- Confirm every fault path returns rather than throws: absent registry, corrupt
  registry, unreadable registry, unlistable `in-progress/`, a lazy require that fails.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
Targeted run first: the new Part A file, `tests/enforcement-hook.test.js`,
`tests/pretooluse-edit-coverage.test.js`, `tests/w01-edit-write-deny-protocol.test.js`,
`tests/w01-multiedit-notebookedit-parity.test.js`,
`tests/security-enforcement-evasion.test.js`, `tests/e2e-enforcement-and-gates.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`. **If Part B was built**, add its own file plus
`tests/unapproved-plan-grants-nothing.test.js`, `tests/plan-coverage-coverage.test.js`,
`tests/task-registry.test.js`, `tests/task-reconcile.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**. For Part A: trigger a real denial for each
reason the built code can produce, and **read the message that comes out.** If it does
not name an action a person can take, the fix is not finished. For Part B, if built:
take a plan that is genuinely building and confirm `findCoveringPlan` resolves for its
declared files; take an approved plan that is not building and confirm it does not.
**No git operations.**

### Step 15: DOCUMENT
**Part A:** a comment at `DENIAL_REMEDIES` stating that each row names an ACTION rather
than a restatement of the reason; that an unknown reason falls back deliberately so the
table can never make a denial less informative; and that a new denial reason must add a
row here or it will render a remedy that does not apply.

**Part B, if built:** a file header on `building-plans.js` stating why per-call
attribution is not establishable and must not be faked; why the union of two witnesses
rather than either alone (independent failure modes — NOT the superseded
`startExecution` argument); why `cancelling` counts; why status is the only liveness
field read and `ts.started` deliberately is not; and the never-throw inversion. A
comment at the `plan-coverage.js` conjunct naming what stops working and the remedy.

**Always:** if Part B is blocked, the finding is documented where a reader will meet it
— a comment at `plan-coverage.scanForCoverage` recording that coverage is
plan-scoped-but-not-build-scoped, that narrowing it requires a building witness, and
that no such witness is set on the live dispatch path as measured on 2026-07-20.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Report, in this order:

1. **Whether the Step 9a gate passed**, with the full plan/task table and the registry
   integrity numbers verbatim. If it did not pass, **that is the headline result**: the
   narrowing cannot be built today, the cross-plan write surface remains open, and the
   three routes go to the human.
2. Part A: the Step 8 verbatim red for cases 1 and 2; the reason vocabulary confirmed
   against the built code; what each denial message actually said when triggered by
   hand at Step 14; the verdict-neutrality result from case 9.
3. Part B, if built: the Step 8 reds, the three forge attempts, both timings, the hook
   payload key list reported as a finding and explicitly not built on.
4. The nine things this does NOT fix — **the open cross-plan write surface first.**
5. Every decision taken under ambiguity.

## Ordering and file conflicts

**This plan builds LAST of the four**, and the frontmatter now says so. An earlier draft
asserted this in prose while declaring `depends_on: none` — **prose does not constrain
the scheduler; only the field does.** The one plan asking to be sequenced last had
declared no sequencing at all. `depends_on` now names `00127`, `00126` and `00142`.

Why last: it has the only real false-positive surface in the set, and its Step 9
measurements are more informative once the other three have settled the coverage
oracle. Part A also depends on `00126` having landed its reason token — the remedy table
is keyed on a value `00126` defines.

`src/lib/plan-coverage.js` is also declared by `00126`, which builds first and creates
the denial comparator this plan fills a row into. `src/hooks/PreToolUse.Edit.js` is also
declared by `00142` and by the unapproved `00069` and `00072`. Plans build
**sequentially**, so there is no concurrent-edit hazard; each executor reads live at
Step 9.

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan reads `actions.js` at Step 9 and **does not declare or
modify it.**

Existing enforcement test fixtures that build a `todo/` plan and assert an allowed edit
**will** go red if Part B ships — they would need a building witness as well as an
approval. Those files are **not declared here. Stop, name every file, and ask.** If
Part B does not ship, this does not arise.

## Decisions Taken Under Ambiguity

1. **THE NARROWING IS NOT SHIPPED TODAY, because its witness is empty in the ordinary
   case.** Both witnesses were measured: zero plans in `plans/in-progress/`, zero
   `running` or `cancelling` tasks among 63 records, while an executor is building. A
   permission narrowing whose ordinary case is denial is an outage, not a stricter
   check. **This supersedes the earlier draft's core proposal.**
2. **A HARD PRECONDITION GATE at Step 9 replaces trust in this reasoning.** Rather than
   relying on a planner's measurement staying true, Part B cannot proceed unless the
   executor measures, live, that the plan being built is in the computed building set.
   Reaching "blocked" is a successful run of this plan.
3. **Part A ships independently, because a wrong remedy is a defect today.** `00126`
   introduces `unanchored-declaration`, whose remedy the current message states wrongly
   in a way that would make a human re-approve an unchanged plan and be blocked again.
   **This supersedes the earlier draft's "prefer no edit to a cosmetic one" — that
   instruction would have shipped an unfollowable lockout.**
4. **The remedy table falls back to today's sentence on an unknown reason.** The
   alternative — a generic "see the menu" for anything unrecognised — would make
   existing denials less informative in order to make new ones more so.
5. **The three routes forward are PRESENTED, not chosen.** Establishing a witness on
   the live dispatch path, shipping observe-only, and keeping the finding are all
   defensible; which to do and when is the human's decision, and route A is a plan this
   one does not write.
6. **The tasks.json write denial is gated behind Part B.** Its justification is that
   the file is a permission input; if Part B does not ship, it is not one, and the
   denial would protect nothing while forbidding something.
7. **The OR between the two witnesses is KEPT, on corrected reasoning.** The earlier
   justification — that `startExecution` moves a plan without creating a task — is
   **wrong**: `startAgent` and `advanceAgent` claim the task first and move only on
   success. The OR is kept because a stale residency and a corruption-emptied registry
   are independent failure modes. The superseded reasoning is recorded so it is not
   re-derived.
8. **The building-set predicate reads STATUS ONLY, never `ts.started`.** Six of 58
   `done` records lack a start time. A predicate that consulted a field the registry
   does not reliably populate would inherit a corruption it has no need of. Case 18
   pins this.
9. **A malformed `plan` value is skipped explicitly.** `t60` carries `"--plan"`. It
   could never match a real slug, but skipping it by rule rather than by accident means
   the set never holds a value nobody can act on. Case 19 pins this.
10. **The registry's corruption is REPORTED, not repaired.** Fixing it belongs with
    whatever writes those records. Repairing it inside a permission plan would mean a
    permission change editing its own oracle.
11. **The denial-slot ranking is NOT defined here.** It is defined once in `00126`;
    this plan fills in one row. Two plans writing one slot under two rules is exactly
    the defect this repair set was convened to prevent.
12. **`in-progress/` is a real directory, and the code wins over the documentation.**
    The project instructions describe it as a frontmatter state; `plan-coverage.js:68`
    scans the folder and `actions.js:855` moves files into it. Recorded, not resolved.
13. **The commissioning figure of "58 of 63 with no start time" is corrected to 6 of
    58.** 58 is the `done` count. The corrected number is smaller and the conclusion is
    unchanged, but a repair that carried a wrong number forward would be a repair
    nobody could check.
14. **Nothing is asserted that planning could not verify.** The two witnesses, the
    registry integrity, the sanctioned path's behaviour, the stale agent status and the
    line-number drift were all MEASURED and are stated with their values. The hook
    payload's keys and the timings remain MEASURE AT STEP 9. An estimate written as a
    fact is the defect class this repository fences.

## Executor Notes — Steps 8-16 run (2026-07-28, isolated worktree)

**Step 9a gate — MEASURED, FAILED, Part B BLOCKED (the expected, successful outcome).**
In this worktree `plans/in-progress/` does not exist, `.ctoc/state/tasks.json` does not
exist, and `src/lib/building-plans.js` does not exist — the building witness set is EMPTY,
even more emphatically than planning measured. Building Part B here would make every
approved queued plan grant nothing and deny the very next edit (including this executor's
and any concurrent one's) — the outage the plan exists to prevent. So per the plan's HARD
PRECONDITION GATE, Part B was NOT built: no `building-plans.js`, no
`tests/only-a-building-plan-grants-write-access.test.js`, no coverage conjunct, no
`.ctoc/state/tasks.json` write-denial. Those four declared files are deliberately absent.

**What shipped (Part A + the forward-compatible ranking half):**
1. `src/hooks/PreToolUse.Edit.js` — `DENIAL_REMEDIES` frozen reason→remedy table +
   `safeDenialField` leak-guard in the pure `buildBlockMessage`. Unknown/absent reason
   falls back to today's sentence byte-for-byte. Changes no allow/deny outcome.
2. `src/lib/plan-coverage.js` — filled 00126's reserved `not-building` severity slot
   (`return 1`, weakest) and added the OPEN FINDING comment at `scanForCoverage`.
3. `tests/a-denial-names-the-action-that-resolves-it.test.js` — 10 cases, all green;
   cases 1, 2, 7 were RED before the implementation.

**Decisions taken under ambiguity during this run:**
- The `not-building` severity slot was filled even though Part B (which produces the
  reason) is blocked — parity with the `not-building` remedy row, which the plan itself
  ships ahead of the reason. It is one physical line, so it is LINE-covered by every
  `denialSeverity` call the existing denial tests already drive (the enforced floor is
  line coverage; the taken branch affects only unenforced branch coverage). No new export
  was added, so the export-reachability fence is unaffected.
- `safeDenialField` was ADDED (not merely "confirmed", as an earlier plan draft assumed)
  because test case 7 requires the pure function to leak neither an absolute path nor a
  forged newline even when handed a hostile denial. Production always passes a
  repository-relative `ref`, which the sanitizer leaves byte-identical, so no existing
  denial message changes.
- Case 10 is implemented as a non-vacuity guard (the `unanchored_scope` marker is absent
  for an approval reason), which is inherently green, rather than the "must fail as
  designed" self-referential form the Step 8 prose described. Same discrimination goal:
  it proves case 1 keys on the reason, not on any string.
- Completion is a worktree commit on this branch (per the dispatch), NOT `menu task
  complete` and NOT any plan-stage move — the parent integrator owns the gate crossing.
