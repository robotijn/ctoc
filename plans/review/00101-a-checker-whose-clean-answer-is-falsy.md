---
approved_by: human
approved_at: 2026-07-19T18:15:13.892Z
gate_crossed: implementation → todo
---

---
title: "The self-check reports a clean result you can read — a checker whose success value is falsy crashes the caller that asks it anything"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00099-the-most-safety-critical-file-becomes-searchable-again
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/iron-loop-enforcer.js"
  - "tests/iron-loop-enforcer.test.js"
  - "tests/ship-gate-real.test.js"
  - "tests/approveplan-validates.test.js"
---

# A checker whose clean answer is falsy

## The defect, and the survey the brief asked for

`checkGateDestinationsApproved(root)` in `src/lib/iron-loop-enforcer.js:321-370`
returns `null` when there is no violation and a finding object when there is. A
caller that writes `result.severity` therefore **crashes on success** — verified in
practice today by the human, who did exactly that.

The survey was run and the answer is broader than the report. **Nineteen of the
twenty checks in this module share the shape.** Every one ends `return null;`:

`checkCtoChiefTopLevel` (:166) · `checkOnlyOneTopLevel` (:185) ·
`checkSynthesizerExists` (:200) · `checkTier1ReportsTo` (:223) ·
`checkTier2NoSubagent` (:242) · `checkActivePlanStepLabels` (:286) ·
`checkGateDestinationsApproved` (:370) · `checkStalePlans` (:389) ·
`checkPlansHaveFilesDeclaration` (:409) · `checkRequiredHooks` (:425) ·
`checkRequiredLibs` (:437) · `checkHooksJsonRegistration` (:455) ·
`checkVersionSync` (:488) · `checkSaasTemplates` (:510) ·
`checkBudgetConfigExists` (:522) · `checkProductLoop` (:542) ·
`checkDeadExportFence` (:608, :622) · `checkReachabilityFence` (:639, :640) ·
`checkFalseGreenFence` (:680, :694).

### Two findings the report did not contain

**First: the exposure is one function wide, not twenty.** Only
`checkGateDestinationsApproved` and `checkAllInvariants` are exported (`:800-810`).
The other eighteen are module-private and have exactly one consumer,
`checkAllInvariants` at `:724-733`, which reads them correctly:

```js
const finding = check.fn(root);
if (finding) findings.push({ id: check.id, scope: check.scope, ...finding });
```

That is a falsy-aware consumer and it is not wrong. The trap is only reachable
across the module boundary — which is precisely where the human fell into it.

**Second: the module already contains the fix, in one check.** `checkPlanCounts`
(`:549-559`) never returns `null`; it always returns an object, with
`severity: 'info'`. The explicit-result shape is not a proposal — it already ships
here, in this file, and works.

### Why the narrow fix is not cheaper

Changing only the exported function would leave a module where private checks return
`null` and the public one returns an object, and it would cost **exactly the same at
the call sites** — the same five assertions in the same three test files. A mixed
convention costs the same and keeps the trap for the next check that gets exported.
So the uniform shape wins on cost as well as on correctness.

## The shape, and what it costs at every call site

Every check returns `{ clean: true }` or
`{ clean: false, severity, message, details? }`.

| Call site | Today | After | Cost |
|---|---|---|---|
| `checkAllInvariants` (`:728-729`) | `if (finding) findings.push(…)` | `if (result.clean === false) findings.push(…)` — and an unreadable verdict is recorded, see below | one branch |
| `tests/approveplan-validates.test.js:199` | `assert.equal(check(root), null, …)` | `assert.equal(check(root).clean, true, …)` | one assertion, **tightened** |
| `tests/approveplan-validates.test.js:216` | same shape | same change | one assertion |
| `tests/ship-gate-real.test.js:421` | `typeof … === 'function'` | unchanged | none |
| `tests/ship-gate-real.test.js:430` | reads the finding | reads `severity`/`message` off the same object; adds `clean === false` | one assertion, tightened |
| `tests/ship-gate-real.test.js:455` | `assert.strictEqual(check(dir), null, …)` | `.clean === true` | one assertion |
| `tests/iron-loop-enforcer.test.js:185` | measured at Step 9 | as measured | to be enumerated, not guessed |
| `src/lib/actions.js:445` | **a comment only** — verified, no call | unchanged | none |

Total measured cost: **one branch and about five assertions**, every one of them
becoming stricter rather than looser. No production caller outside this module reads
the return value today.

### The fail-loud requirement

`checkAllInvariants` must **not** treat an unrecognised return as clean. After the
change, a check that returns `null`, `undefined`, or anything without a boolean
`clean` records a finding with `severity: 'error'` naming the check id — exactly as
the existing `catch` at `:730-732` already does for a check that throws. Otherwise
this slice replaces "a clean answer that crashes its reader" with "a broken check
that reads as clean", which is the ninth instance of this repository's central
defect class and strictly worse than the defect being fixed.

## Implementation Details

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY — the return shape of all twenty checks and their one consumer
**Purpose:** A clean verdict you can read without a truthiness test.

- Add a module-private `CLEAN` factory returning a fresh `{ clean: true }` (fresh,
  not a shared frozen singleton, so no consumer can mutate a shared object; the
  allocation is once per check per run).
- Add a module-private `finding(severity, message, details)` returning
  `{ clean: false, severity, message, …details }`.
- Rewrite each `return null` as `return CLEAN()`; rewrite each finding return through
  the helper. **The severity, the message text and the details of every check are
  unchanged** — this slice changes the envelope, never a verdict.
- `checkPlanCounts` returns `{ clean: true, severity: 'info', message, details }`:
  it is informational, so it is clean by definition, and the summary's `info` count
  must not move. Verify that against the existing report tests.
- `checkAllInvariants` filters on `result && result.clean === false`, and records an
  `error`-severity finding for any check whose return has no boolean `clean`.
- `formatReport` and `formatCompact` are untouched; they consume the `findings` array,
  whose element shape does not change.

### File: `tests/iron-loop-enforcer.test.js`
**Action:** MODIFY — add a contract group; update measured assertions
**Purpose:** Pin the envelope so it cannot regress to a falsy clean.

| # | Case | Assertion |
|---|---|---|
| 1 | **every check returns a readable verdict** | drive every entry in the registry against a fixture root; each return is an object with `typeof r.clean === 'boolean'`. Iterates the registry, so a check added later is covered without editing this case |
| 2 | **a clean verdict is truthy** | for a clean fixture, `check(root).clean === true` and the object is not `null` — the exact crash the human hit |
| 3 | **a violating verdict carries its severity** | `clean === false` and `severity` is one of the known values |
| 4 | **a check that returns nothing is an ERROR, not a pass** | inject a check returning `undefined` into the registry for one run; the summary reports an `error` finding naming that check id, and the run is NOT clean |
| 5 | same for a check returning `null` | as above |
| 6 | a throwing check still records an error | the existing behaviour, pinned so this change does not disturb it |
| 7 | the summary counts are unchanged | a fixture with a known violation set produces the same `critical`/`block`/`warn`/`info` counts as before the change |
| 8 | the report text is unchanged | `formatReport` and `formatCompact` output for a fixed finding set is byte-identical to today's |

Case 4 is the one that keeps this slice from becoming the defect it fixes.

### Files: `tests/ship-gate-real.test.js`, `tests/approveplan-validates.test.js`
**Action:** MODIFY — the five measured assertions only
**Purpose:** Follow the contract; tighten, never loosen.

Each `assert…(check(root), null)` becomes an assertion on `clean === true`, which
asserts strictly more (it proves a verdict was produced, where `null` was also what
a broken check would return). **No other assertion in either file is touched**, and
if any unrelated case turns red the code is wrong, not the case.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the verdict envelope | `checkAllInvariants` | `src/scripts/run-self-check.js`, and `src/hooks/SessionStart.js` via `formatCompact` |
| `checkGateDestinationsApproved` | the registry entry at `:572`, plus its exported use | the same roots |
| the new cases | the suite | `npm test` |

## What this slice does NOT fix

1. **It changes no verdict.** Every severity, message and detail is preserved. If
   the self-check reports differently after this slice, that is a defect in the
   slice, and case 7 and case 8 exist to catch it.
2. **It does not touch the checks' logic** — not the gate-destination rule, not the
   fences, not the step-label check, not the stale-plan window.
3. **It does not export the eighteen private checks.** The envelope is uniform; the
   surface is not widened.
4. **It does not survey other modules for the same shape.** The survey covered this
   module, where the crash happened. A repository-wide census of falsy-success
   returns is a real piece of work and is reported at Step 16 as a recommendation
   for the human to schedule, not performed here.
5. **It does not add a lint rule or a fence** against a future falsy-success return.
   Case 1 covers this module by iterating its registry; nothing stops the shape
   elsewhere.
6. **It does not change `formatReport` or `formatCompact`.**

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the contract group in `tests/iron-loop-enforcer.test.js` and run ONLY that
file before touching `src/`. Cases 1, 2, 4 and 5 must be **RED** — case 2's red is
the human's crash reproduced as an assertion, and cases 4 and 5 prove the consumer
currently reads an absent verdict as clean. Cases 6, 7 and 8 must be green
immediately; they are the no-change guarantees and their staying green is the whole
safety argument. Record every output verbatim, and record the exact
`formatReport` text for the fixed finding set so case 8 compares against something
measured rather than something assumed.

### Step 9: PREPARE
Read from disk: `src/lib/iron-loop-enforcer.js` in full — all twenty checks, the
registry at `:565-586`, the consumer at `:718-745`, the formatters at `:750-798`,
and the exports at `:800-810`. Enumerate **every** call site of every exported
symbol across `src/` and `tests/` and record the list; the cost table in this plan
was measured at planning time and the code wins. Confirm `src/lib/actions.js:445` is
a comment and not a call. Note that this module requires `./reachability` at
`:603` and `:637` — **read those call sites but do not edit that file**; see the
ordering note. Where the code disagrees with this plan, record the discrepancy.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/iron-loop-enforcer.js` — the `CLEAN` and `finding` helpers, all twenty
  checks rewritten to the envelope, the consumer's filter and its unreadable-verdict
  error path.
- `tests/iron-loop-enforcer.test.js` — the eight contract cases.
- `tests/ship-gate-real.test.js` — the three measured assertions.
- `tests/approveplan-validates.test.js` — the two measured assertions.

*(Four files is above the usual one-to-three sizing. They are one unit: a contract
and the callers that break the moment it changes. Splitting them would leave the
suite red between two slices, which is a worse failure than a slightly large one.)*

### Step 11: REVIEW
Go through all twenty checks and confirm, one by one, that severity, message text
and details are byte-identical to before — the envelope changed, the verdict did
not. Confirm no check can return a bare `null` any more. Confirm the consumer's
unreadable-verdict path is reachable and covered. Confirm no assertion anywhere was
weakened, no range widened, no case deleted.

### Step 12: OPTIMIZE
One small object per check per run, twenty per invocation — no measurable cost
against checks that read the filesystem. Confirm no helper allocates inside a loop
over plans or files, and that the fresh-object choice did not introduce a per-plan
allocation.

### Step 13: SECURE
Confirm no message gained a path, a plan body, or file contents; the envelope
carries exactly what the message carried before. Confirm the unreadable-verdict
error names the check id only, never the check's return value, which could carry
arbitrary content from a future check.

### Step 14: VERIFY
Run `node --test` on `tests/iron-loop-enforcer.test.js`,
`tests/iron-loop-enforcer-coverage.test.js`, `tests/ship-gate-real.test.js`,
`tests/approveplan-validates.test.js`, `tests/gates.test.js` and
`tests/greenfield-journey.test.js`. Then the full gated run `npm test`; record
`tests`, `suites`, `pass`, `fail`, the zero-skipped counter and the coverage line
verbatim. The coverage floor must not be lowered. **Then run the self-check itself
against this repository, in both fast and thorough mode, and compare the report
text to the text recorded at Step 8** — they must be identical. A differing report
means a verdict moved and the slice must not ship. Lint every changed file at
`--max-warnings 0`. No git operations.

### Step 15: DOCUMENT
A block comment above the helpers stating the rule: a check reports a verdict, and a
clean verdict is an object you can read — never a falsy value that crashes the
reader who asks it a question. Name the original crash so the next author
understands the cost. Note in the same comment that a check returning nothing is an
error, and why.

### Step 16: FINAL-REVIEW
Report the four paths, the Step 8 verbatim red, the enumerated call-site list from
Step 9 with any discrepancy against this plan's cost table, the identical self-check
reports from Step 14, the recommendation about a repository-wide census, an explicit
restatement of the six things this slice does NOT fix, and every decision taken
under ambiguity.

## Ordering and file conflicts

**`depends_on: 00099-the-most-safety-critical-file-becomes-searchable-again`.** This
slice opens with a survey of the codebase for a return shape, and Step 16 recommends
a wider census. A survey run with a tool that silently drops a source file cannot
report "nothing else found" honestly. Repair the instrument first.

**Conflict note — `src/lib/reachability.js`.** An executor is editing that file and
its tests concurrently. This slice **does not declare it and must not edit it**, but
`iron-loop-enforcer.js` requires it at `:603` and `:637`, so the thorough-mode
self-check at Step 14 exercises whatever state that file is in. If a thorough run
fails inside the reachability or dead-export fence, **report it and do not fix it
here** — that is the other executor's surface, and editing it would be a
plan-coverage violation.

No sibling in this batch declares any of this slice's four files.

## Decisions Taken Under Ambiguity

1. **The uniform envelope beats the narrow fix, on cost as well as on correctness.**
   Changing only the exported check costs the same five call-site assertions and
   leaves a module with two conventions. Measured, not assumed — the call sites were
   enumerated at planning time.
2. **`{ clean: boolean }` rather than a thrown exception or a sentinel.** An
   exception for a clean result is absurd; a sentinel constant is a falsy value
   wearing a name. A boolean field is readable, printable, and impossible to confuse
   with an absent answer.
3. **A fresh object per call, not a shared frozen singleton.** A shared singleton is
   marginally cheaper and one careless spread away from a consumer mutating every
   other check's verdict. Twenty small allocations per run is not a cost worth that
   risk.
4. **An unrecognised return is an error, not a pass.** This is non-negotiable: the
   alternative converts this fix into a new instance of the defect class the
   repository exists to fence.
5. **`checkPlanCounts` becomes clean-and-informational rather than a violation.** It
   reports counts, not problems. Its `info` finding must keep appearing in the
   report, so the envelope carries `clean: true` alongside the informational
   payload, and case 7 pins the summary counts.
6. **The five call-site assertions are tightened, never loosened.** `=== null`
   becomes `.clean === true`, which asserts that a verdict was produced — strictly
   more than the old assertion, which a broken check also satisfied.
7. **The repository-wide census is recommended, not performed.** It is a real piece
   of work with its own scope, and scheduling belongs to the human. Bundling it here
   would make an envelope change into an open-ended audit.

### Taken during execution

8. **`finding(payload)` takes the check's own object literal, not three positional
   arguments.** The plan proposed `finding(severity, message, details)`. Converting
   twenty multi-line object literals — several with a message built from string
   concatenation across three lines and a `details` object built from a slice — into
   positional arguments would have re-typed every message, and a re-typed message is
   exactly the thing this slice promised not to change. Taking the literal moves the
   `return {` boundary only, so every severity, message and detail passes through
   byte-identically, and `clean: false` is still written in exactly ONE place. Proven
   by the diff: no message or severity line differs except by the wrapper.

9. **The consumer records a verdict that is clean but carries a message.** The plan
   said `checkAllInvariants` filters on `result.clean === false`. That filter alone
   would have DROPPED `checkPlanCounts`, which the plan simultaneously requires to be
   `clean: true` AND to keep reporting its `info` finding — the two instructions
   contradict each other. Resolved as: record when
   `verdict.clean === false || typeof verdict.message === 'string'`. A clean verdict
   with nothing to say (`CLEAN()`) has no message and is silent; a clean verdict that
   carries a reportable payload is reported. The `info` count did not move.

10. **`clean` is stripped before the finding is pushed.** `const { clean, ...payload }`
    keeps the findings-array element shape byte-identical, so `formatReport`,
    `formatCompact` and every existing consumer of `result.findings` see exactly what
    they saw before. Pinned by contract case 7 (`counts.clean === undefined`).

11. **The unreadable-verdict message names the check by its `id` FIELD, not by
    interpolating it into the message text.** Every other finding is rendered
    `[scope/id] message` by `formatReport`, so the id is already named the way a
    reader expects; putting it in the text too would have made the one error finding
    read differently from all nineteen others. The returned value is never included —
    a future check could put arbitrary content there.

## Execution Record (Steps 8–16)

- [x] **Step 8 TEST** — eight contract cases written and RUN BEFORE any `src/` edit.
      Verbatim red: `fail 5`, `skipped 0`. Cases 1, 2, 3, 4, 5 red; cases 6, 7, 8
      green on the unchanged code, exactly as the plan predicted. Case 2's red was
      `AssertionError: actual: null, expected: null, operator: 'notStrictEqual'` —
      the human's crash reproduced as an assertion. Cases 4 and 5 failed with "an
      unreadable verdict must produce a finding, not silence", proving the consumer
      read an absent verdict as clean.
- [x] **Step 9 PREPARE** — `src/lib/iron-loop-enforcer.js` read in full; every call
      site of every exported symbol enumerated across `src/` and `tests/`. Three
      discrepancies against the plan recorded below.
- [x] **Step 10 IMPLEMENT** — the `CLEAN()` / `finding()` helpers, all twenty checks
      on the envelope, the consumer's filter and its unreadable-verdict error path,
      the eight contract cases, and the four measured call-site assertions.
- [x] **Step 11 REVIEW** — the diff was read line by line. Every severity, message
      and details value is byte-identical; only the `return {` / `}` boundary moved.
      No bare `return null` remains in the file. The unreadable-verdict path is
      reachable and covered by cases 4 and 5. No assertion anywhere was weakened.
- [x] **Step 12 OPTIMIZE** — every `CLEAN()` sits at a function tail or an early
      guard; none is inside a loop over plans, agents, skills or files. Twenty small
      allocations per run against twenty checks that read the disk.
- [x] **Step 13 SECURE** — no message gained a path, a plan body or file contents.
      The unreadable-verdict finding carries the check id and a fixed sentence; the
      check's returned value is never interpolated.
- [x] **Step 14 VERIFY** — six named files green; full `npm test` green; both
      self-check reports byte-identical to the Step 8 baseline; lint clean at
      `--max-warnings 0`. Numbers recorded below.
- [x] **Step 15 DOCUMENT** — the rule is stated in a block comment above the helpers:
      a check reports a verdict, a clean verdict is an object you can read, the
      original crash is named, and the unrecognised-return-is-an-error rule and its
      reason are stated in the same comment.
- [x] **Step 16 FINAL-REVIEW** — all steps complete; the six non-goals restated in
      the report; the repository-wide census recommended, not performed.

### Discrepancies between this plan and the code

1. **`CHECKS` IS exported** (`module.exports`, last entry) — the plan asserted "the
   exposure is one function wide, not twenty". The registry is public API, so any
   consumer that iterates `CHECKS` and calls `check.fn(root)` reached all twenty
   falsy-clean returns across the module boundary, not just the one exported check.
   Nothing in this repository does so today, but the trap was wider than measured.
   This is a further argument for the uniform envelope the plan already chose, and
   contract case 1 now drives the whole exported registry.
2. **`tests/iron-loop-enforcer.test.js:185` is a prose comment, not an assertion.**
   The plan's cost table listed it as "measured at Step 9". Measured: that file
   contained ZERO `=== null` assertions against a check; every existing case reads
   `result.findings`, which is falsy-aware and correct. No existing assertion in that
   file needed changing — only the new contract group was added.
3. **`tests/iron-loop-enforcer-coverage.test.js` is a fifth consumer the plan did not
   list**, and it did NOT need declaring: all 30 of its cases read
   `checkAllInvariants(...).findings`, never a check's return value. Verified green
   unchanged. No scope growth was required.
4. Confirmed as the plan stated: `src/lib/actions.js:445` is a comment, not a call.

### Step 14 numbers, verbatim

```
ℹ tests 10153
ℹ suites 1744
ℹ pass 10153
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18249.185542
[CTOC test-gate] coverage 99.03% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

The coverage floor stayed at 99 — not lowered, not raised. No ratchet was tripped:
the reachability, dead-export and false-green fences all ran inside `npm test` and
passed with no baseline edit and no whitelist entry.

Self-check reports, before and after, both modes, byte-identical:

```
Summary: 0 critical · 0 block · 1 warn · 1 info
## WARN (1)
- [iron-loop/plans-files-declaration] 12 active plans missing files: declaration (not coverage-aware)
## INFO (1)
- [info/plan-counts] Plans: vision=3 · canvas=0 · functional=1 · implementation=8 · todo=12 · in-progress=0 · review=48 · done=234
OK: no critical or blocking issues.
```

### Reported, not fixed — a second instance of the same defect family

`completeExecution(planPath, projectPath)` and `completeTaskPlan(projectPath, planSlug)`
in `src/lib/actions.js` are siblings that take their arguments in OPPOSITE orders.
Calling one with the other's argument order produces a refusal message that reads like
a verdict about the plan rather than like a misuse of the surface — the same family as
this slice's defect: a surface whose misuse is indistinguishable from a result.
`src/lib/actions.js` is not in this plan's declared `files:`, so it was NOT touched.

### Recommendation for the human to schedule

A repository-wide census of falsy-success returns — a function whose "nothing wrong"
answer is `null`, `undefined`, `false`, `0` or `''` while its "something wrong" answer
is an object. This module is now clean; nothing prevents the shape elsewhere, and the
`completeExecution` / `completeTaskPlan` argument-order trap above suggests the family
is not confined to return values. Scheduling belongs to the human.
