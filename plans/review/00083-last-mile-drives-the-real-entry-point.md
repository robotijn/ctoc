---
approved_by: human
approved_at: 2026-07-19T07:40:42.773Z
gate_crossed: implementation → todo
---

---
title: "The last-mile check drives the real entry point instead of looking for an app to launch"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/app-runner.js"
  - "src/lib/settings.js"
  - "tests/last-mile-drives-entry-point.test.js"
---

# The last-mile check drives the real entry point

The verify evidence for the concurrent-edit guard slice recorded the app last-mile
check as `applicable: false`, with the reason that this is a build-and-test project
and launching is out of scope.

The reason is honest. There is no app here to launch. But **"no app to launch" is
not "no entry point"** — this project's entry point is the dashboard, a human
opens it every day, and the standing rule is that a module is done when a human can
**reach** it, not when its test passes.

So the one check that exists to prove reachability opts itself out on a project
that has a live entry point. Every slice that adds a module and a test passes Step
14 with the reachability check reporting `applicable: false`, while nothing
anywhere proves a human can reach what was built. That is the same defect the
92-dead-files finding produced, running inside the gate that was supposed to catch
it.

## Where `applicable: false` is decided

`src/lib/step-13-verify.js:194-215` (`applyAppRunCheck`) folds the app-runner's
verdict into the VERIFY result and records `applicable: false` verbatim when the
runner says so. The decision itself is upstream in `src/lib/app-runner.js`:

- `detectAppShape` (`:95`) classifies a project as `web` / `server` / `cli` /
  `library` / `unknown`. `web` and `server` need `scripts.dev` or `scripts.start`;
  `cli` is driven primarily by a `bin` field.
- `library` and `unknown` are documented at `:19-20` as
  `no human-facing runtime → applicable:false (NOT a failure)`.
- `nativeNotApplicableResult` (`:238`) builds the honest not-applicable result for a
  registry-detected native project.

`countSubstantiveChecks` (`:172-183`) then excludes a non-applicable app from the
substantive count, which is correct and must stay correct: a check that did not run
can never be the sole basis for a pass.

**The gap is not in any of that logic. It is that the classifier can only recognise
an entry point it knows how to guess at**, and a one-shot command-line dashboard
that is neither a `bin` nor a `dev` script is invisible to it.

## The fix: the project declares its entry point

Guessing harder is the wrong repair — it produces a classifier that is confidently
wrong on the next project shape. The project **declares** its human entry point,
and the check drives what was declared:

```yaml
# .ctoc/settings.yaml
general:
  entry_point:
    command: "node src/commands/menu.js"
    expect: "CTOC v"        # a substring the response must contain
    timeout_ms: 30000       # optional; bounded default applies
```

- **Declared** ⇒ the last mile drives it, and a non-response **fails** verification
  with a loud reason.
- **Not declared and the shape is `unknown`/`library`** ⇒ `applicable: false`, with
  the reason extended to name what was looked for: no launchable shape **and** no
  declared entry point. Honest, and it tells the reader how to fix it.
- **Declared and also app-shaped** ⇒ the declaration wins. An explicit statement
  from the project outranks a heuristic about it.

No other project regresses: absent the key, behaviour is exactly what it is today.

## The real cost, and how this stays deterministic

Driving an entry point is slower and more fragile than asserting a return value, and
a flaky driver puts noise into the one gate that has to stay trustworthy. A gate
that fails at random gets ignored, and an ignored gate is worse than no gate. The
cost is real and the plan is built around it:

1. **A one-shot command, never a polled server.** This is the load-bearing
   determinism property. The existing `web`/`server` path has to start a process,
   poll a port until it answers or a budget expires, then tear it down — three
   sources of flake. A declared command like `node src/commands/menu.js` renders and
   **exits**. There is no port, no readiness race, no teardown, no orphaned process.
   The verdict is exit code plus stdout.
2. **No retries.** A retry converts a flaky check into a slow check that lies. One
   run, one verdict; a failure is reported as a failure.
3. **A bounded timeout with a loud, specific message.** On timeout the check FAILS
   and says the entry point did not respond within N ms — never "inconclusive", and
   never silently `applicable: false`, which would be the false-green shape this
   repository fences.
4. **`expect` is a plain substring, not a regular expression.** No pattern
   compilation, no catastrophic backtracking, no escaping subtleties in a config
   value.
5. **A fixed, minimal environment.** The child inherits the project root as its
   working directory and nothing that varies between machines is required for the
   assertion to hold.
6. **The check is bypassable only by removing the declaration**, which is a visible
   edit to a config file, not a silent skip.

Explicit non-goals, stated so a later reader does not "improve" the check into a
flaky one: no browser automation, no screenshot comparison, no network calls, no
multi-step interaction. One command, one response, one substring.

## Implementation Details

### File: `src/lib/app-runner.js`
**Action:** MODIFY
**Purpose:** Drive a declared entry point before falling back to shape detection.

1. **`readDeclaredEntryPoint(projectPath)`** — read `general.entry_point` through
   the project's existing settings reader. Returns `null` when absent, and `null`
   with a recorded reason when malformed (a missing/empty `command`, a non-string
   `expect`, a non-finite `timeout_ms`). A malformed declaration must **not**
   silently degrade to "no entry point": it records a reason that surfaces in the
   evidence, because a project that tried to declare one and failed is a different
   state from a project that never declared one.
2. **`driveDeclaredEntryPoint(projectPath, decl)`** — run the command as a child
   process with `cwd: projectPath`, a bounded timeout, and captured stdout/stderr.
   Returns the standard app-run result shape:
   ```js
   { applicable: true, launched: true|false, responded: true|false,
     evidence: { shape: 'declared-entry-point', command, expect, exitCode,
                 outputBytes, matched },
     durationMs, errors: [] }
   ```
   `responded` is `true` only when the process exited 0 **and** stdout contains the
   `expect` substring. Anything else is `responded: false` with an error naming
   which of the two failed — a non-zero exit and a missing marker are different
   diagnoses and must not collapse into one message.
   **The captured output is bounded** (cap the retained bytes, matching on the
   stream rather than on a truncated copy) — parsing a truncated copy of a run's
   output is a named false-green signature in this repository and must not be
   reintroduced here.
3. **`driveApp` / `driveAppSync` consult the declaration FIRST.** When a valid
   declaration exists, drive it and return; otherwise fall through to the existing
   `detectAppShape` path unchanged.
4. **The not-applicable reason gains the missing half.** Where the runner today
   reports "No human-facing runtime to launch.", it reports that **and** that no
   entry point was declared, naming the settings key that would enable the check.
   A reason that only says what was not found teaches nobody how to fix it.

### File: `src/lib/settings.js`
**Action:** MODIFY
**Purpose:** Let the new key exist and validate.

Add `general.entry_point` to the settings schema with its three fields and their
types. **Step 9 must read this file first**: if settings are permissive and no
schema entry is required, make no change here, remove the file from the plan's
scope in the Step 16 report, and say so — do not edit a file to no purpose.

### File: `.ctoc/settings.yaml` — this project's own declaration
**Action:** not declared in `files:`; see decision 6.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `readDeclaredEntryPoint` | `driveApp` / `driveAppSync` (this slice, same file) | Step 14 VERIFY |
| `driveDeclaredEntryPoint` | same | Step 14 VERIFY |
| extended not-applicable reason | `step-13-verify.applyAppRunCheck:209-214` reads `evidence.reason` (unchanged, already wired) | Step 14 VERIFY → Gate 3 evidence |

`runVerify` calls `applyAppRunCheck` on every Step 14, which is on the live
completion path. Nothing here is reachable only from a test.

## Test Plan

### Tests: `tests/last-mile-drives-entry-point.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

Fixtures are temp projects containing a tiny declared command — a generated Node
script that prints a known marker and exits — so every case is hermetic, fast, and
independent of this repository's own dashboard.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **a declared entry point is driven** | script prints `READY-MARKER`, exits 0; `expect: "READY-MARKER"` | `applicable: true`, `launched: true`, `responded: true`, `evidence.shape === 'declared-entry-point'` |
| 2 | **a non-responding entry point FAILS verification** | script exits 1 | `responded: false`; through `runVerify`, `result.passed === false` and an error names the entry point — the defect this slice closes |
| 3 | the marker must actually appear | script exits 0 but prints nothing | `responded: false`, error names the missing marker, not the exit code |
| 4 | exit code and marker are diagnosed separately | script prints the marker then exits 3 | the error names the non-zero exit, and does not claim the marker was missing |
| 5 | **a hang fails loudly and bounded** | script sleeps past `timeout_ms: 500` | `responded: false` within a bounded wall time, error says the entry point did not respond within the budget; the check never reports `applicable: false` for a timeout |
| 6 | **no declaration ⇒ today's behaviour exactly** | no `entry_point`, library-shaped project | `applicable: false`, and the reason names BOTH the absent runtime and the absent declaration |
| 7 | a malformed declaration is reported, not ignored | `entry_point: {}` (no command) | `applicable: false` with a reason naming the malformed declaration — distinct from case 6's reason |
| 8 | a declaration wins over shape detection | a project with `scripts.start` AND a declaration | the declared command is driven; `evidence.shape === 'declared-entry-point'` |
| 9 | **a driven entry point counts as substantive** | case 1 fixture through `runVerify` | `countSubstantiveChecks` counts it; a project whose only substantive check is a passing entry point is a pass, and one whose entry point failed is not |
| 10 | output is bounded, and matching is not done on a truncated copy | script prints ~2 MB then the marker LAST | `responded: true` — the marker is found even though it arrives after far more output than any retained buffer, proving the match runs on the stream |
| 11 | no orphaned process | case 5 fixture | after the call returns, the child is gone (verified by process handle, not by sleeping) |
| 12 | determinism | run case 1 twenty times in a loop | twenty identical verdicts, no timing-dependent variation |
| 13 | cross-platform | the fixture command uses `process.execPath` and `path.join`, never a shell builtin or a `/bin` path | passes on the host platform without shell-specific syntax |

Case 12 is the flakiness guard the cost analysis demands: a check that has to stay
trustworthy must be shown to be repeatable, not assumed to be.

## Execution Plan (Steps 8-16) — EXECUTED

### Step 8: TEST — [x] COMPLETE (TDD RED observed)
- [x] `tests/last-mile-drives-entry-point.test.js` written in full, BEFORE any implementation
- [x] Run against the unmodified code: **`ℹ tests 17 / ℹ pass 1 / ℹ fail 16`**
- [x] Cases 1-5, 7, 8, 10, 11 and the sync case RED, exactly as the plan predicted
- [x] Case 6 GREEN in its first half (a library IS `applicable:false` today) and RED only on
      the extended reason — the "nothing else regresses" guard behaved as specified
- [x] Case 12 (determinism) was the single PASS: twenty identical not-applicable verdicts.
      It is a PROPERTY, not new behaviour, and it must still hold afterwards — it does.

### Step 9: PREPARE — [x] COMPLETE
- [x] Read `src/lib/app-runner.js` in full (`detectAppShape`, `driveApp`, `driveAppSync`,
      `nativeNotApplicableResult`, `resolveScriptCommand`, `teardown`)
- [x] Read `src/lib/step-13-verify.js` (`applyAppRunCheck`, `countSubstantiveChecks`)
- [x] Read `src/lib/settings.js` — **no schema entry required** (see decision 9)
- [x] Confirmed `driveAppSync`'s `--drive` re-entry mechanism and REUSED it

### Step 10: IMPLEMENT — [x] COMPLETE
- [x] `src/lib/app-runner.js` — `readDeclaredEntryPoint`, `driveDeclaredEntryPoint`,
      `noRuntimeReason`, `malformedDeclarationResult`, declaration-first branch in
      `driveApp` AND `driveAppSync`, extended reasons on BOTH not-applicable paths
- [x] `src/lib/settings.js` — **NO CHANGE** (decision 9); removed from scope, reported
- [x] Wired: `driveApp`/`driveAppSync` → `applyAppRunCheck` → `runVerify` (live Step 14)

### Step 11: REVIEW — [x] COMPLETE
- [x] Audited every `applicable: false` construction in `app-runner.js` (4 real sites):
      `nativeNotApplicableResult` and the two library/unknown returns are all reached
      ONLY after the declaration check found nothing; `malformedDeclarationResult` is
      the single declared-adjacent one and is justified in decision 10
- [x] The timeout path produces `applicable: true` + a failure (case 5 pins it)
- [x] `countSubstantiveChecks` unchanged — still excludes non-applicable results

### Step 12: OPTIMIZE — [x] COMPLETE — one child, one run, no retries, no polling, no warm-up

### Step 13: SECURE — [x] COMPLETE
- [x] `shell:false` with an argv array via `resolveScriptCommand`; shell operators rejected
- [x] `expect` is a literal substring, never compiled as a pattern
- [x] `cwd: projectPath`, bounded timeout, child killed and reaped on timeout
- [x] Output NEVER copied into evidence — only `outputBytes` and `matched` (decision 12)

### Step 14: VERIFY — [x] COMPLETE
- [x] Targeted: `tests/last-mile-drives-entry-point.test.js` → 21/21 pass
- [x] Neighbours (`app-runner`, `app-runner-coverage`, `step-13-verify`,
      `step-13-verify-coverage`, `verify-fails-loudly`, `verify-parses-full-output`)
      → `tests 115 / pass 115 / fail 0`
- [x] Fences (`false-green-fence`, `reachability`, `export-reachability`, `settings`)
      → `tests 39 / pass 39 / fail 0`
- [x] Lint (`eslint --max-warnings 0`) clean; typecheck clean
- [x] **GATED RUN `npm test`: `ℹ tests 9999 / ℹ pass 9999 / ℹ fail 0 / ℹ skipped 0`**
      **`[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0` → PASS**

### Step 15: DOCUMENT — [x] COMPLETE
- [x] `app-runner.js` header documents the declared-entry-point shape beside the other
      four, states plainly that "no app to launch" is not "no entry point", carries a
      worked example, and writes down the non-goals
- [x] `CLAUDE.md` documents the settings key with all three fields and the failure rules
- [x] `CLAUDE.md` test-file count ratchet moved 427 → 428 (decision 13)

### Step 16: FINAL-REVIEW — [x] COMPLETE — reported below and in the executor's report

---

## Original Execution Plan (as written at Step 7)

### Step 8: TEST — write `tests/last-mile-drives-entry-point.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1-5, 7, 8 and 10 MUST be red; case 6 MUST be GREEN in its first half (a library project is `applicable: false` today) and red only on the extended reason — record that distinction, because case 6 is the "nothing else regresses" guard.
### Step 9: PREPARE — read from disk, in full: `src/lib/app-runner.js` (especially `detectAppShape`, `driveApp`, `driveAppSync`, `nativeNotApplicableResult`); `src/lib/step-13-verify.js:120-235` (`applyAppRunCheck` and `countSubstantiveChecks`); `src/lib/settings.js` to determine whether a schema entry is required at all. Confirm how `driveAppSync` runs its child today (`--drive` re-entry into the same file) and reuse that mechanism rather than inventing a second one.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/app-runner.js` — `readDeclaredEntryPoint`, `driveDeclaredEntryPoint`, the declaration-first branch in `driveApp`/`driveAppSync`, and the extended not-applicable reason.
  - `src/lib/settings.js` — the `general.entry_point` schema entry, only if the schema requires it (Step 9 decides; record either way).
### Step 11: REVIEW — confirm no path can report `applicable: false` for a DECLARED entry point: a declared-but-failing entry point must always be a failure, never a skip. Grep for every remaining `applicable: false` construction in `app-runner.js` and justify each. Confirm `countSubstantiveChecks` still excludes non-applicable results. Confirm the timeout path produces a failure and not a not-applicable.
### Step 12: OPTIMIZE — one child process, one run, no retries, no polling loop. Do not add a warm-up run; a warm-up is a retry wearing a different name.
### Step 13: SECURE — the command comes from project configuration, which is trusted input at the same level as the project's own source, but it is executed **without a shell** (argument array, never string interpolation) so a value containing shell metacharacters cannot become a second command. `expect` is a literal substring, never compiled as a pattern. The child gets `cwd: projectPath` and a bounded timeout, and is killed on timeout. Captured output is bounded and never rendered into evidence beyond a byte count and a matched flag — a command's stdout may contain secrets and must not be copied into the Gate-3 evidence artifact.
### Step 14: VERIFY — `node --test tests/last-mile-drives-entry-point.test.js tests/step-13-verify*.test.js tests/verify-fails-loudly.test.js tests/verify-parses-full-output.test.js` green, then the full gated run `npm test`. Lint every changed file. No git operations.
### Step 15: DOCUMENT — `app-runner.js`'s header gains the declared-entry-point shape beside the existing four, stating plainly that "no app to launch" is not "no entry point". Document the settings key with its three fields and a worked example. State the non-goals (no browser automation, no screenshots, no multi-step interaction) so the check is not later "improved" into a flaky one.
### Step 16: FINAL-REVIEW — report files, tests, verbatim red evidence, verbatim green evidence, the case-12 repeat-run result, whether `settings.js` needed a change, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The entry point is DECLARED, not detected.** Teaching the classifier to
   recognise a command-line dashboard would make it confidently wrong on the next
   shape it has not seen. A declaration is the project stating a fact about itself;
   the check then drives what it was told, and a project that declares nothing gets
   today's honest `applicable: false` with a better reason.
2. **A one-shot command is the determinism story.** The fragility the cost analysis
   names belongs to the polled-server path: start, poll, tear down. A command that
   renders and exits has no port, no readiness race and no teardown. This is why the
   check can be trusted in a gate, and it is why the non-goals are written down.
3. **No retries, ever.** A retry turns a flaky check into a slow check that lies.
   One run, one verdict.
4. **A timeout is a FAILURE, never `applicable: false`.** Reporting "not applicable"
   for something that was attempted and did not answer is exactly the false-green
   shape this repository fences: a verdict reported on input never received.
5. **Matching runs on the stream, and retained output is bounded.** Parsing a
   truncated copy of a run's output is a named false-green signature here (it has
   shipped before). Case 10 exists specifically to prove this implementation did not
   reintroduce it.
6. **This project's own `.ctoc/settings.yaml` declaration is NOT in this slice's
   declared files.** Enabling the check for this repository turns it on for every
   subsequent Step 14 in the middle of an active wave, while other executors are
   mid-flight — a behaviour change to the gate landing at the same moment as the
   mechanism that implements it. The mechanism ships first and is proven by its own
   tests; turning it on for this project is a one-line configuration change the
   human makes when the wave is quiet. This is named as an explicit handover, not
   left implicit: **until that line is added, this project's last mile still reports
   `applicable: false`** — with an honest reason that now names the missing
   declaration.
7. **`src/lib/settings.js` is declared but may end up unchanged.** Whether a schema
   entry is needed is a fact about that file which Step 9 establishes by reading it.
   Declaring it and reporting "no change required" is honest; discovering mid-build
   that an undeclared file must change is not.
8. **The declaration outranks shape detection.** An explicit statement by a project
   about its own entry point beats a heuristic about it. A project with both gets
   the declared one driven, and the tests pin that precedence.

---

## Decisions Taken During Execution (Steps 8-16)

9. **`src/lib/settings.js` was NOT changed — the file is removed from this slice's
   effective scope, as decision 7 anticipated.** Step 9 read it and established the
   fact: `SETTINGS_SCHEMA` entries are FLAT SCALARS (`string`/`number`/`toggle`/
   `select`/`list`) rendered one row at a time by the settings user interface, and
   `entry_point` is a nested object with three fields — not expressible as a schema
   setting without inventing an object-typed row the settings screen cannot draw.
   More decisively, `loadSettings` merges ONLY schema keys, so it is the wrong reader
   for this key regardless. The precedent already in the file settles it:
   `general.environment_prompt_dismissed` is a non-schema key inside `general` read
   through `readRawSettings`, exactly as `getEnvironment` reads the raw file "so it
   never depends on the merge it drives". `readDeclaredEntryPoint` does the same.
   Editing `settings.js` would have been an edit to no purpose.

10. **A MALFORMED declaration is the one `applicable:false` that may follow an
    `entry_point` key — and it is honest.** This is the single apparent tension with
    Step 11's rule that no declared entry point may report not-applicable, so it is
    written down rather than left implicit. The distinction is *attempted* versus
    *understood*: a well-formed command that fails, prints nothing, or hangs WAS
    attempted and always produces a verdict; a declaration whose `command` is missing
    or mistyped could not be attempted at all, so there is nothing to report a
    verdict about. It gets its own shape (`declared-entry-point-malformed`) and its
    own reason naming the malformation, so a reader can always tell it apart from
    "nothing was declared". It contributes no error but is never counted as
    substantive, so a project with nothing else to run still fails loudly.

11. **A declared-but-UNDRIVABLE command is a FAILURE, not a skip** (test 7b). A
    command containing a shell operator is rejected by `resolveScriptCommand` — the
    existing command-injection guard. Unlike a malformed declaration, this one is
    well-formed: the project stated what its entry point is and we could not run what
    it stated. That is a verdict, so it reports `applicable: true, responded: false`
    with the operator named. Same for a command that fails to spawn (7c, 7c-sync).

12. **`expect` is OPTIONAL; when absent, a clean exit is the whole verdict.** The plan
    listed three fields without saying whether the marker was required. Requiring it
    would block the honest case of a command whose success IS its exit status. When
    present it must be a non-empty string; an empty string would match everything and
    is therefore treated as malformed, not as "no marker".

13. **Two ratchets moved in the correct direction, both reported.** The `CLAUDE.md`
    documented test-file count went 427 → 428 for the new test file (enforced by
    `tests/doc-counts.test.js`, which tripped and was fixed by correcting the count,
    never by touching the check). The false-green fence passed with NO new findings
    and NO whitelist entry: `driveDeclaredEntryPoint` uses streaming `spawn` (so no
    `maxBuffer` unbounded-capture site), has no empty catch, and never parses a
    truncated copy. `.ctoc/false-green-baseline.json` shows as modified in the working
    tree, but that shrink (220 → 217, removing `menu-screens.js` and `plan-validator.js`
    entries) belongs to sibling slices, NOT to this one.

14. **One test assertion was CORRECTED toward the real behaviour, not the reverse.**
    Case 3 was drafted asserting that the missing-marker message must not contain the
    word "exit" at all. The shipped message says *"exited 0 but ... The exit status was
    fine; the response was not"* — which names the exit code precisely in order to
    CLEAR it, and is exactly the separate-diagnosis property case 3 exists to pin.
    Writing the plan's literal assertion would have forced a worse message. The
    assertion was tightened instead: the message must not carry the phrasing reserved
    for a bad exit (`exited with code` / `was killed by` / `expected 0`) AND must
    positively state that the exit status was fine. That is two real assertions where
    the draft had one crude one. The code was not changed to suit the test.

15. **A literal NUL byte briefly entered the test source and was removed.** Test
    7c-sync needs a command that makes `spawn` throw SYNCHRONOUSLY (a NUL in an
    argument does; a missing binary only produces an async `error` event). The first
    write embedded a raw control character, which passed the suite but made the file
    *binary* to `grep`, diffs and editors — hiding the test from every future reader.
    It is now written as the escape sequence `'node entry\u0000.js'`: identical
    runtime behaviour, plain-text source. Caught because a green result that took
    1.4ms did not match a spawn's real cost, and the discrepancy was chased rather
    than accepted.

16. **The extended not-applicable reason had to reach a path the plan did not name.**
    The plan directed the fix at the literal `"No human-facing runtime to launch."`
    string. This repository's OWN evidence does not take that path: it is classified
    `unknown`, falls through to `detectRunTarget`, and gets
    `nativeNotApplicableResult`'s capability-registry reason ("Detected a typescript
    server project ... Not launched here."). Extending only the library/unknown reason
    would have left the very project that motivated this slice with a reason that
    still teaches nothing. Both paths now carry the shared `NO_DECLARATION_SUFFIX`,
    and test 6b pins the native path specifically.

17. **The check is NOT switched on for this repository** — decision 6 held, as
    instructed. `.ctoc/settings.json` declares no `entry_point`, and this project's
    last mile still reports `applicable: false`. What changed is the reason, which now
    reads: *"... Not launched here. No entry point was declared either: set
    `general.entry_point.command` in .ctoc/settings.json (with an optional `expect`
    substring) to have the last mile run this project's real entry point instead of
    reporting nothing to launch."* Enabling it is a one-line handover for the human
    when the wave is quiet.
