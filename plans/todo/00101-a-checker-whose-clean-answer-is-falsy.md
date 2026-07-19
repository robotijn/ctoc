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
