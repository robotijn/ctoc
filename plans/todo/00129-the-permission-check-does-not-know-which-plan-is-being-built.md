---
approved_by: human
approved_at: 2026-07-19T21:31:41.220Z
gate_crossed: implementation → todo
---

---
title: "The permission check does not know which plan is being built — an executor building one plan may edit any file any other approved plan declares"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/building-plans.js"
  - "tests/only-a-building-plan-grants-write-access.test.js"
  - "src/lib/plan-coverage.js"
  - "src/hooks/PreToolUse.Edit.js"
---

# The permission check does not know which plan is being built

## The defect

`plan-coverage.findCoveringPlan` answers **"does ANY approved plan declare this
file?"** It is asked at `PreToolUse.Edit.js:438` on every editing tool call, and a
match is an allow. It has no parameter for, and no notion of, the work in flight.

So an executor building plan A may edit any file declared by an approved plan B, with
no refusal and no record that anything unusual happened. The sibling slice named this
as the largest remaining gap in the write surface and left it open because the human
chose the narrower fix. This plan closes as much of it as can be closed **honestly**,
and is explicit about the part that cannot.

## THE HARD PART: how does a hook establish WHICH plan is building?

A hook fires on a tool call. It receives the tool's arguments, a transcript path, and
a working directory. It does **not** receive the dispatch that started the work. So
the identity has to come from state on disk. Three candidates exist in this repository
and each was read rather than assumed.

### Candidate 1 — the task registry

`src/lib/task-registry.js` persists `.ctoc/state/tasks.json`: tasks with a `kind`, a
`plan` slug, a `status`, and `touches`. `src/lib/state.js:247-253` states the
repository's own position in a comment, verbatim: *"LIVENESS comes from the scheduler
registry… The agent is 'active' iff the registry holds at least one RUNNING
`implement` task."*

**What it gives:** the set of plan slugs currently being built. `getAgentStatus`
already derives exactly that (`state.js:278` — note `plans`, **plural**).

**What it does not give:** which member of that set made this particular tool call.
`MAX_CONCURRENT` is 5 and concurrent waves are a designed feature, so the set is
routinely larger than one.

**Three faults, all real:**

1. **It can be EMPTY while a build is genuinely in flight.** `actions.startExecution`
   (`actions.js:844-848`) does two things: `clearStatus`, then `movePlan(…, 'in-progress')`.
   **It creates no task.** Task creation happens elsewhere (`addAndClaim`, the menu's
   start path). So a plan can be building with nothing in the registry.
2. **It is AGENT-WRITABLE.** `PreToolUse.Edit.js` denies editing-tool writes beneath
   `.ctoc/approvals/` (`:405`) and `.ctoc/state/verify/` (`:418`), then whitelists all
   of `/^\.ctoc\//` (`:61`). **`.ctoc/state/tasks.json` is not in either denial**, so an
   agent can write it with an editing tool today.
3. **Its load FAILS OPEN by design** — a corrupt registry returns empty rather than
   throwing, because *"a corrupt registry must never brick the NAV plane"*
   (`task-registry.js:74`). Correct for navigation; it means a corrupt registry reads
   as "nothing is building".

### Candidate 2 — the plan's stage

A plan physically residing in `plans/in-progress/` is, by the pipeline's own
definition, being built. `plan-coverage.STAGE_PRIORITY` already scans that folder, and
`approval-residency.COVERAGE_STAGE_EDGE` already classifies its residents against the
Gate 2 edge.

**What it gives:** a second, independent "is this plan building" signal that survives a
registry that is empty, corrupt, or forged.

**What it does not give:** per-call attribution either. And it is coarse — a plan can
sit in `in-progress/` after a crashed session until reconcile notices.

Crucially, it is **not** forgeable into a grant on its own: moving a plan changes its
folder, but `COVERAGE_STAGE_EDGE` maps both `todo` and `in-progress` to the same Gate 2
edge, so a move confers no approval that was not already there. It only answers
"building or queued", which is exactly the question being added.

### Candidate 3 — an identity in the hook payload

The payload carries `tool_name`, `tool_input` and `transcript_path`
(`PreToolUse.Edit.js:204-216`). The registry can record an `agentTaskId` at birth
(`addAndClaim`'s `opts.agentTaskId`, `task-registry.js:1069-1075`). If the payload
carried an identity that matched it, per-call attribution would be possible.

**This was NOT verified and is NOT built on.** Planning had no shell and could not
observe a live payload. Nothing in this repository reads a session or agent identity
from a hook payload today — grepped across `src/hooks/`, the only identity-shaped
field any hook reads is `transcript_path`. Whether a subagent's payload carries an
identifier that binds to `agentTaskId`, and whether that identifier is stable across a
subagent's calls, is **measured at Step 9 and REPORTED**. If it turns out to exist,
that is a follow-up plan the human schedules — not a thing this plan quietly starts
depending on.

### The honest verdict

**Per-call attribution is not establishable today.** Building a check that pretends
otherwise would key permission on an unreliable signal, which is worse than the current
broad one: it would refuse legitimate work, and the first thing a person does with a
check that refuses legitimate work is switch it off.

**What IS establishable is the BUILDING SET** — and narrowing to it is a real
reduction, not a consolation prize. Today every approved plan in `todo/` grants write
access to everything it declares, whether or not anyone is working on it. After this,
only plans actually being built do. The set of files an executor can reach shrinks from
"everything every approved plan declares" to "everything the plans currently in flight
declare".

## The rule

A plan grants coverage only if it is **approved** (unchanged, from the sibling slice)
**AND building**, where building means:

> the plan resides in `plans/in-progress/`, **OR** the task registry holds a
> `running` or `cancelling` `implement` task naming its slug.

### Why OR, and not AND

The two signals disagree in a case that happens routinely: `startExecution` moves a
plan to `in-progress/` without creating a task, so requiring both would deny every
plan started that way — a large, immediate false-positive class. OR takes either
witness. It still narrows hard, because an approved plan sitting in `todo/` with no
running task satisfies **neither** and grants nothing.

### Why this is fail-closed even though one input fails open

`task-registry.load` returning empty on corruption removes plans from the building set.
Removing plans **grants less**. Every fault direction here reduces permission:

| fault | effect on the building set | direction |
|---|---|---|
| registry absent / corrupt / unparseable | smaller (empty) | **grants less** |
| registry unreadable | smaller (empty) | **grants less** |
| `plans/in-progress/` unlistable | the existing scan already returns a DENY for the whole call | **grants less** |
| the building-set module throws | must be impossible — see below | — |

**And again: fail-closed must be built as never-throw.** `PreToolUse.Edit.js:468-472`
fails OPEN, so a throw out of this module becomes an ALLOW. The module returns an empty
set on every fault; it never propagates one.

### Making the signal real: `.ctoc/state/tasks.json` becomes agent-write-denied

A signal an agent can write is not a predicate — that is the exact argument the sibling
slice made about the stage folder versus the ledger.

Note the shape of the exposure honestly: the building-set test is a **narrowing
conjunct**, so an agent that forges a running task for plan B gets back **today's**
behaviour and no more. Forging it is not an escalation beyond the status quo. But it
makes the new check bypassable with one Write, which is not a check.

So `.ctoc/state/tasks.json` is denied to editing tools, exactly as
`.ctoc/state/verify/` already is and for the identical reason: **it is written
programmatically by CTOC's own code, never by a tool call.** `task-registry.save`
writes it through `safe-fs` inside the CTOC process (temp sibling plus rename,
`:475-496`); the menu's task commands run as `node src/commands/menu.js`, also
in-process. **MEASURE AT STEP 9**: confirm by search that nothing writes that file
through an editing tool. If something does, report it and stop — do not ship a denial
that breaks a live writer.

## What stops working, item by item — the cost is real and it is named

| # | What stops | Acceptable? |
|---|---|---|
| 1 | An executor building plan A can no longer edit files declared only by plan B, unless B is also building. | **Yes — this IS the fix.** |
| 2 | An approved plan in `todo/` that nobody has started grants **nothing**. A human editing one of its files directly is now blocked where they were not before. | **Yes, with a remedy** — start the plan through the menu, or type an escape phrase. The escape check runs AFTER coverage (`:448-455`) and is unchanged, so the human's own consent still works. |
| 3 | An executor dispatched **directly at a `todo/` plan**, without `startExecution` and without a registry task, is locked out of its own declared files. | **This is the main operational risk.** `approval-residency.js:52-59` documents that this pattern is real: *"an executor dispatched directly at a todo/ plan writes its step records, evidence and final report into that plan while it still resides there."* **MEASURE AT STEP 9** — if any plan is being built that way right now, report it to the human before Step 10 proceeds. |
| 4 | Any test fixture that builds a `todo/` plan and asserts a covered edit is allowed goes red. | **MEASURE AT STEP 9.** Several such fixtures were repaired by the sibling slice and will need a second element — a building witness. Those files are **not declared here**: stop and ask. |
| 5 | An editing-tool write to `.ctoc/state/tasks.json` is denied. | **Yes** — nothing legitimate writes it that way. Confirmed at Step 9 before shipping. |

Item 3 is why the block message matters as much as the check. A denial must say
**"plan X declares this file and is approved, but it is not building — start it via
/ctoc:menu"**. A lockout the human can read is a correction; one they cannot read is
what gets reverted, and reverting this reopens the whole cross-plan write surface.

## What the check does for edits that are not an executor's

The question "what if the active plan is undefined" must never be answered with "allow
everything". Here is every case, enumerated:

| who | what happens | why |
|---|---|---|
| **the human typing directly** | Coverage denies unless a plan covering the file is building; then the escape-phrase check runs, and a phrase the human personally typed allows it. | Role-scoped to text the human typed (`extractUserTypedText`, `:240-285`), so it is consent, not self-granting. Unchanged by this plan. |
| **a planner writing a plan** | Unaffected. `/^plans\/.*\.md$/` is whitelisted at `:63`, ahead of coverage. | Plans must remain writable; a plan simply buys nothing until approved. |
| **a hook or CTOC's own code writing state** | Unaffected. Those writes go through `safe-fs` inside the CTOC process and never pass through a tool hook. | Stated explicitly because it is the assumption the `.ctoc/state/tasks.json` denial rests on. |
| **an agent editing source with nothing building** | Denied. The building set is empty, so no plan grants anything. | **This is the answer to "undefined active plan": the empty set, which grants nothing.** Never "allow everything". |

## Implementation Details

### Dependency graph

```
src/lib/building-plans.js  (NEW)
  ├─requires→ src/lib/task-registry.js   [existing, unchanged]
  └─requires→ src/lib/safe-fs.js         [existing, unchanged]

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

### File: `src/lib/building-plans.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "which plans are being built right now".

Exports:

- `buildingSlugs(root)` → `Set<string>`
  - The union of: (a) every `.md` basename (extension stripped) in
    `plans/in-progress/`, and (b) every `task.plan` where `kind === 'implement'` and
    `status` is `running` or `cancelling`.
  - `cancelling` is included deliberately: `task-registry.js:146-154` documents it as a
    NON-terminal in-flight state that *"still occupies its slot, touches, gitOp and the
    sync barrier until the agent is confirmed gone"*. An agent that is still alive is
    still building, and excluding it would lock a cancelling executor out mid-write.
  - **Never throws.** Each source is independently guarded; a fault in one contributes
    nothing and the other still counts. A fault in both yields an empty set.
- `isBuilding(slug, root)` → `boolean` — membership, with the same never-throw contract.

Deliberately NOT here: any notion of "the" active plan, singular. There is no such
thing while concurrency is five, and a function named for it would invite a caller to
believe otherwise.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY — one conjunct, computed once per call

- Compute the building set **once**, before the stage loop, beside the confinement
  checks. Not once per plan, and not once per glob.
- Inside the loop, at the point where the approval verdict is already consulted
  (`:458-460`), add the second condition: the plan's slug must be in the building set.
  Reuse the existing lazy structure so a plan is tested only after one of its globs
  matched.
- A plan that is approved but not building is recorded into the existing `denial` slot
  with `reason: 'not-building'`, so `explainDenial` and the block banner name it and
  the human reads why. Ordering: **the approval reason wins when both fail** — an
  unapproved plan should not be reported as merely "not building", which would
  understate it.
- A plan residing in `in-progress/` is in the building set by construction, so the
  `in-progress` stage keeps working exactly as it does today. That is not an accident
  and should be stated in the comment.

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — one protected path, and the denial message

1. Add `TASKS_STATE_FILE = '.ctoc/state/tasks.json'` and a guard alongside the ledger
   and verify-evidence guards, **ahead of the `.ctoc/` whitelist**, using the existing
   `normalizeForProtection` and an exact-path comparison (this is a FILE, not a
   directory — `isUnderProtectedDir` is the wrong shape; a `tasks.json/x` path is not a
   thing). The deny message says the registry is written by the pipeline, not by hand.
2. The block banner already names a rejected plan and its reason via
   `buildBlockMessage`'s `denial` branch (`:323-339`). Confirm `not-building` renders
   legibly there and that the remedy sentence is right for this reason — "start it via
   /ctoc:menu", not "approve it". **If the existing wording is generic enough, change
   nothing.** Prefer no edit to a cosmetic one.

Nothing else changes: not the whitelist, not the escape-phrase check, not the coverage
call, not the fail-open outer catch.

### File: `tests/only-a-building-plan-grants-write-access.test.js`
**Action:** CREATE
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
| 15 | **an unapproved plan reports the APPROVAL reason, not `not-building`** | the stronger reason wins |
| 16 | **the registry file is protected** | `isProtected…` for `.ctoc/state/tasks.json` is `true`; for `.ctoc/state/other.json` `false`; for `.ctoc/state/tasks.json.bak` `false` |
| 17 | **the fence is not vacuous** | case 1's exact fixture with a building witness added matches — proving 1, 6, 7, 8 and 9 fail for the building reason and not because the harness never matched anything |

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `buildingPlans.buildingSlugs` | `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:438`, every editing tool call |
| the `not-building` denial | `explainDenial` → `buildBlockMessage` | the human's terminal, on every denial |
| the tasks-file guard | `enforce` | `PreToolUse.Edit.js`, ahead of the `.ctoc/` whitelist |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **Per-call attribution is not closed.** With A and B both building, an executor
   building A can still edit B's files. Closing that needs an identity binding a tool
   call to a task, and **no such identity is established today**. Step 9 measures
   whether the payload could support one and reports it; building on an unverified
   identity is exactly the "worse than the broad check" outcome.
   *Mitigating fact, not a fix:* the scheduler's Rule 4 keeps concurrently-running
   tasks file-DISJOINT (`task-registry.js:855-865`), so two plans building at once are
   not supposed to share files in the first place. That is a scheduling property, not a
   permission one, and it is not enforced on this path.
2. **It does not stop a human from starting a plan purely to unlock its files.** That
   is a human action with a record, which is a different thing from an agent
   self-granting.
3. **The Bash channel is unchanged.** This narrows the editing channel only.
4. **Escape phrases are unchanged** — a human who types one can still edit anything.
5. **A stale `in-progress/` residency still counts as building** until reconcile moves
   it. Tightening that means putting a liveness timeout on a permission check, which
   would make write access expire mid-build. Not done, and named.
6. **It does not bound declaration breadth** (`00126`), **does not show scope at
   approval** (`00127`), and **does not resolve real paths** (`00128`).

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/only-a-building-plan-grants-write-access.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1, 2, 6, 7, 8, 9 and 14 must be RED** — today an approved plan grants
  regardless of whether anything is building. Case 2 is the finding itself. **If case 2
  is not red, STOP**: the premise is wrong and so is this plan.
- **Case 16 RED** — the registry file is writable today.
- **Cases 3, 4, 5, 10, 12 and 17 must be GREEN already** and must stay green. They are
  the proof this is not a blanket denial, and case 12 in particular proves the two
  witnesses are independent.
- **Cases 11 and 13** — record whether a corrupt registry or an unlistable directory
  currently throws. A throw is the live fail-open path and is the before-state.

### Step 9: PREPARE
Read from disk, in full: `src/lib/plan-coverage.js`; `src/lib/task-registry.js`
(`load`, `TERMINAL`, `OCCUPYING`, the status set); `src/lib/state.js:247-293`;
`src/lib/actions.js:820-960` (`startExecution` and `completeExecution` — **read only;
a concurrent executor is editing this file, so do not modify it and stop and ask if
its shape has changed**); `src/hooks/PreToolUse.Edit.js:58-190` and `:394-473`;
`src/lib/approval-residency.js`.

Then MEASURE — this is the step that decides whether this plan is safe to ship:

1. **The live picture.** Every plan in `todo/` and `in-progress/`, and every task in
   the registry, with kind, status and plan. For each plan: approved? building by
   residency? building by task? **Report the full table.** Any plan that is approved
   and would LOSE coverage is named to the human **before Step 10 proceeds.**
2. **Is anything being built from a `todo/` plan right now** — a plan in `todo/` with
   recent execution-record edits and no registry task. This is the item-3 risk. **If
   one exists, stop and report before proceeding.**
3. **Does anything write `.ctoc/state/tasks.json` through an editing tool?** Search the
   source, the agent definitions and the test suite. **If anything does, report and do
   not ship the denial.**
4. **Whether the hook payload carries a usable identity.** Read the payload this hook
   actually receives — instrument `enforce` to record the top-level keys of
   `stdinJson` (**keys only — never values; a payload may carry transcript content**)
   for one real tool call, then remove the instrumentation. **REPORT the key list.** Do
   not build on it in this plan whatever it shows; that is a separate decision the human
   schedules.
5. **Timing.** `findCoveringPlan` before and after. One extra directory listing and one
   registry read per call, both small. **Above roughly 10 milliseconds per call, stop
   and report.**

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/building-plans.js` — `buildingSlugs`, `isBuilding`; lazy `task-registry`
  require inside a guard; never throws.
- `src/lib/plan-coverage.js` — the building set computed once per call; the conjunct at
  the existing approval point; the `not-building` denial with approval-reason
  precedence.
- `src/hooks/PreToolUse.Edit.js` — the `.ctoc/state/tasks.json` guard ahead of the
  `.ctoc/` whitelist; the block message only if the existing wording is genuinely wrong
  for this reason.
- `tests/only-a-building-plan-grants-write-access.test.js` — the seventeen cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of "which plans are building" and that
`plan-coverage.js` contains no second copy. **Confirm by reading the require graph that
no load-time cycle exists** between `plan-coverage`, `building-plans` and
`task-registry` — the lazy require is the mechanism and it must be verified, not
assumed. Confirm the building set is computed once per call. Confirm the approval check
still runs only on a matched glob and that a plan file is still read once. Confirm the
sibling slice's approval guarantee is untouched — an unapproved plan grants nothing
whether or not it is building. Confirm `globToRegex`, `touchesOverlap` and
`readPlanFiles`' signatures are unchanged.

### Step 12: OPTIMIZE
Confirm the registry is loaded at most once per coverage call and the `in-progress/`
listing happens at most once. Confirm nothing new runs on the whitelist fast path.
Confirm `explainDenial`'s second scan is still block-path only. Record the after-timing.

### Step 13: SECURE
Adversarially, on a permission path.
- **Forge attempt one**: write a `running` implement task for another plan into
  `.ctoc/state/tasks.json` with an editing tool. Must be DENIED after this ships;
  record the before-behaviour too.
- **Forge attempt two**: with the denial in place, attempt the same through
  `.ctoc/state/./tasks.json`, a case variant, and a `..` that resolves back onto the
  file. Each must be denied.
- **Forge attempt three**: move a plan into `plans/in-progress/` to manufacture a
  building witness. Confirm this grants **nothing** it did not already have, because
  the approval predicate is independent of residency — and record the result rather
  than asserting it.
- Confirm every fault path returns rather than throws: absent registry, corrupt
  registry, unreadable registry, unlistable `in-progress/`, a lazy require that fails.
- Confirm the denial message leaks no file contents, no absolute paths, no stack
  traces — a fixed-vocabulary reason and a repository-relative plan reference only.

### Step 14: VERIFY
Targeted run first: the new file,
`tests/unapproved-plan-grants-nothing.test.js`,
`tests/plan-coverage-coverage.test.js`, `tests/enforcement-hook.test.js`,
`tests/pretooluse-edit-coverage.test.js`, `tests/security-enforcement-evasion.test.js`,
`tests/w01-edit-write-deny-protocol.test.js`,
`tests/w01-multiedit-notebookedit-parity.test.js`,
`tests/e2e-enforcement-and-gates.test.js`, `tests/task-registry.test.js`,
`tests/task-reconcile.test.js`, `tests/false-green-fence.test.js`,
`tests/architecture-invariants.test.js`, `tests/export-reachability.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0`.

Then prove the pipeline still runs, and prove it **the way a human would**: take a plan
that is genuinely building, confirm `findCoveringPlan` resolves for its declared files;
take an approved plan that is NOT building, confirm it does not, **and read the block
message that comes out**. If it does not tell a person how to proceed, the fix is not
finished. **No git operations.**

### Step 15: DOCUMENT
A file header on `building-plans.js` stating: why per-call attribution is not
establishable and must not be faked; why the union of two witnesses rather than either
alone; why `cancelling` counts; why every fault yields an empty set and what that means
for permission; and the never-throw inversion. A comment at the `plan-coverage.js`
conjunct naming what stops working (an approved-but-unstarted plan grants nothing) and
the remedy, so the next person to read a lockout finds the answer in the code. A comment
at the tasks-file guard explaining that the registry is written in-process by `safe-fs`
and never by a tool call — the fact the denial depends on.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for case 2 — the finding itself — and for
cases 1, 6-9, 14 and 16; the **full Step 9 table** of every plan and task with its
verdict, and any plan that lost coverage; whether anything is being built from a
`todo/` plan; whether anything writes the registry through an editing tool; **the hook
payload's key list, reported as a finding and explicitly not built on**; both timing
numbers; all three Step 13 forge attempts with results; the verbatim green; what the
block message actually said when read at Step 14; the six things this does NOT fix —
per-call attribution first, named as the human's to schedule; and every decision taken
under ambiguity.

## Ordering and file conflicts

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan reads `actions.js` at Step 9 and **does not declare or
modify it**. If `startExecution`'s behaviour has changed — in particular if it now
creates a registry task — **the OR rule in this plan may be reducible to a single
witness, which is a better design; stop and report it rather than shipping the union
out of habit.**

`src/lib/plan-coverage.js` is also declared by `00126` and `00128`;
`src/hooks/PreToolUse.Edit.js` by `00128` and by the unapproved `00069` and `00072`.
Plans build **sequentially**, so there is no concurrent-edit hazard; each executor reads
live at Step 9.

**This plan should build LAST of the four.** It is the one with a real false-positive
surface, and the Step 9 measurements are more informative once the other three have
settled the coverage oracle.

Existing enforcement test fixtures that build a `todo/` plan and assert an allowed edit
**will** go red — they now need a building witness as well as an approval. Those files
are **not declared here.** The repair is a fixture addition, not an assertion change,
which is the same shape the sibling slice's second pass handled — but it is still
scope the human's approval does not cover. **Stop, name every file, and ask.**

## Decisions Taken Under Ambiguity

1. **Per-call attribution is NOT built, and the reason is written down rather than
   worked around.** No identity binds a tool call to a task today. A permission check
   keyed on an unreliable signal refuses legitimate work, and a check that refuses
   legitimate work gets switched off — leaving less protection than the broad check it
   replaced.
2. **The building set is the union of two witnesses.** `startExecution` moves a plan
   without creating a task, so requiring both would deny a large class of legitimate
   builds on day one. Either witness suffices; neither is present for a merely queued
   plan, which is where the narrowing comes from.
3. **`cancelling` counts as building.** The registry documents it as an in-flight state
   that still holds its files because the agent may still be alive. Excluding it would
   lock a live executor out mid-write.
4. **`.ctoc/state/tasks.json` becomes agent-write-denied.** A signal an agent can write
   is not a predicate. The exposure is honestly bounded — forging it only restores
   today's behaviour, since the new test is a narrowing conjunct — but a check that one
   Write disables is not a check. The precedent, the mechanism and the in-process writer
   are all identical to the verify-evidence denial already shipped.
5. **The `in-progress/` residency signal is kept even though it is coarse.** It is the
   witness that survives a registry that is empty, corrupt, or forged, and case 12 pins
   that independence. A single-source permission input is a single point of failure.
6. **An approved-but-unstarted plan grants nothing, and this is accepted as a real cost
   to the human's own direct editing.** An approval is a queue entry, not a work
   authorization. The remedies — start the plan, or type an escape phrase — are both
   human actions with records, and the block message must name them.
7. **The stronger denial reason wins.** An unapproved plan is reported as unapproved,
   never as merely not building; understating a reason teaches the wrong remedy.
8. **The `task-registry` require is LAZY, to avoid closing a load-time cycle.**
   `task-registry` already requires `plan-coverage`. A permission module handed a
   half-initialised dependency fails in ways that appear only under a particular load
   order, and Step 11 verifies the graph rather than trusting this note.
9. **The payload identity is MEASURED and REPORTED but not used.** Even if it turns out
   to exist, adopting it inside this plan would mean shipping a permission input whose
   stability across a subagent's calls was observed once. That is the human's to
   schedule, on evidence.
10. **Nothing is asserted that planning could not verify.** The live plan/task table,
    whether any executor is working from a `todo/` plan, whether anything writes the
    registry through a tool, the payload keys, and the timing are all marked MEASURE AT
    STEP 9. An estimate written as a fact is the defect class this repository fences.
