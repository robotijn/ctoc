---
title: "A build runs the tests that read the files it touched; the whole suite runs before a push and at the wave barrier"
type: functional
status: functional
created: 2026-09-30
priority: high
effort: large
depends_on: none
---

# A build runs the tests that read the files it touched; the whole suite runs before a push and at the wave barrier

## 1. ASSESS — Problem Understanding

### What the human asked

> "make the testing agents smarter so that when running tests only the parts are run that the code touched not the entire suite, only before pushing to git the entire test suite is running" (2026-09-30)

In plain terms:

- While a build is in its loop, the executor runs only the tests that read the files the build touched.
- The whole suite, with the coverage floor and the zero-skipped check, runs before a push (the `/ctoc:push` route) and at the wave barrier. It does not run on every build.

### The standing rule this must not break

The human's standing rule (2026-07-26, refined 2026-09-30): "done" means the full quality gate with machine-produced evidence AND the human's sign-off. A one-file check, or a narrowed verification, must never be recorded as if the whole gate ran. The 2026-09-30 ruling moves WHEN the whole gate runs (to the wave barrier and the push); it does not weaken WHAT counts as the gate.

Section 2 reconciles the two explicitly. The short version: a build's own record says in words and in fields that only affected tests ran, what ran, what did not; the final approval refuses to treat such a record as the whole gate; and the whole-gate record is produced at the barrier and at the push by one shared piece of code.

### What is true on disk today

Everything below was read from the files named. Nothing was run (this plan was written by an agent that holds no way to execute programs), so every statement about behaviour is "by reading", not "observed".

**1. The build loop is told to run every test, twice.**

The executor's own Step 14 (`agents/iron-loop/iron-loop-executor.md`), excerpt:

```
### Step 14: VERIFY
- Run lint + type check
- Run ALL tests (TDD Green) - not just new ones
- Run exactly as CI does
- Coverage at or above the project's enforced floor ...
- 0 skipped, 0 flaky tests
```

The Step 14 lines written into every newly generated plan (`src/lib/iron-loop.js`, the template function), excerpt:

```
### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests
```

The fallback template in `src/lib/actions.js` says "Run full test suite". Then the executor completes through the menu, and the completion runs the whole gate again:

```
menu task complete <taskId>
  -> completeTaskPlan -> completeExecution           (src/lib/actions.js)
       -> persistVerifyResult -> runVerify           (src/lib/step-13-verify.js)
            lint : npm run lint
            types: npm run typecheck
            tests: npm test        (the whole gated suite, src/scripts/test-gate.js)
       -> writes .ctoc/state/verify/<plan slug>.json
```

The newest completion record on disk (recorded 2026-09-30T14:13:36Z, for the build that improved the AI code quality reviewer) shows exactly that: the command `npm test`, coverage 99.9 against a floor of 99, and a stored output that is an excerpt with 1,320,833 characters elided. So by its instructions a build runs the whole suite in Step 14 and again inside the completion. I have not observed an executor do both; that is what the two instructions say.

**2. The whole gate itself.** `npm test` runs `src/scripts/test-gate.js`, which runs every `tests/*.test.js` under coverage scoped to `src/**` (544 test files today, counted on disk), fails on any failed test, any skipped test, coverage unmeasured or below the floor in `.ctoc/coverage-baseline.json` (99 in every recent record), and any counter it cannot read, and also checks the offline claims ledger. This plan does not change it.

**3. `/ctoc:push` already selects tests, in the unsafe direction, and can pass on zero.** The push route calls the selected-tests function in `src/lib/quality-agent.js` (the after-commit background check calls the same function). It works out the push delta, compares content hashes to a cache from an earlier passing run, and asks the coverage map which tests are affected. Two of its exits pass without running any test. Excerpt:

```
if (hashResult.changed.length === 0) {
  console.log('   No file content changes detected. Cache valid.');
  return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
}
...
if (affected.tests.length === 0) {
  console.log('   No tests affected by changes.');
  ...
  return { passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 };
}
```

The first is reachable: a second push after a network failure, with nothing changed since the first push's passing run, reports a pass with zero tests. The second, by my reading of the control flow, is reachable only with an empty changed list, which the branch above it already handled. Where the map or a filename guess yields tests, the jest, vitest, pytest and go branches of the specific-tests runner run only the selected files.

On this repository, by reading: the framework detector looks for five framework words in the package test script and for framework dependencies. The script here contains none and there is no such dependency, so the detector reports no framework. The specific-tests runner then takes its fall-through branch and runs the declared test command, the whole gated suite. So on this repository the push happens to run everything, by accident of framework detection, not by design. The runner loops over every detected language, and this repository has both a package manifest and a `tsconfig.json`, so the same declared command may be launched once per language. I have not confirmed that.

`src/commands/push.md` documents the opposite of the ruling in its picture of the run ("tests (47 affected)...").

**4. The map that function reads is empty by construction.**

- `.ctoc/quality-state/coverage-map.json` does not exist here. That directory holds one file, `file-hashes.json`, whose values are bare hashes keyed by absolute path (the agents describe objects with `lastTested` and `testsPassed`).
- The builder, `src/scripts/build-coverage-map.js`, parses coverage-report formats and gives every file an empty test list. Excerpt, and the same shape appears in the pytest, go and lcov parsers:

```
result[normalizedPath] = {
  tests: [], // Will be populated from test results
  lines, branches, functions, statements
};
```

  Nothing populates it. CTOC's own runner prints a text table and writes none of the report files the builder reads.

- The library, `src/lib/coverage-map.js`, defines an age rule (a constant of 7 days) in a function the selection path I read never calls, so a map of any age would be trusted. When a file has no mapping, it looks for a similarly named test file and, if one exists, uses it as the selection. A guess therefore replaces a missing mapping. That is the fail-toward-less direction.
- The agent definitions describe a map whose top-level key is `metadata`; the library reads and writes `_meta`.
- `src/scripts/build-coverage-map.js` is a declared execution root in `.ctoc/reachability-roots.json`, and the `reasons` object there has no entry for it. Nothing that ships runs it.
- The same script hands a configured command string to a shell to produce coverage. Excerpt:

```
execSync(coverageCmd, {
  cwd: projectPath,
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' }
});
```

  The quality agent's own comments record that configured commands must never reach a shell, because the configuration files are writable by agents. That is a finding in a file this plan would extend; the new builder must not repeat it.
- `.ctoc/quality-config.yaml` lists `affected-tests` among the blocking checks and `mapRefreshDays: 7`. The map code I read uses its own constant, not that key.

**5. Two testing agents exist and nothing in the build loop calls them.**

`agents/testing/smart-test-runner.md` (with `skills/testing/smart-test-runner/SKILL.md`) and `agents/testing/coverage-mapper.md` (with `skills/testing/coverage-mapper/SKILL.md`) promise: incremental selection from a coverage map and content-hash caches; fallback to the whole suite when the map is missing, older than 7 days, or lacks the file, and when a configuration file or manifest changes; per-language commands for jest, vitest, pytest, go and cargo; flake retries. Their fallback rules already point the right way. Their triggers name `ctoc test`, `ctoc quality` and `ctoc coverage-map rebuild`, and `src/commands/push.md` states that CTOC ships no `ctoc` command-line executable. Of the cache files they say they write (file hashes, test results, flaky tests, the coverage map), one exists on disk. The executor definition and the completion route name neither agent. I did not read every agent definition, so I cannot say no other agent names them. The executor is told "You do NOT dispatch sibling agents directly" and holds `Bash`, so it can run a deterministic command itself but cannot hand the work to a Tier 2 wrapper without a round trip through CTO Chief.

**6. "Which tests read this file" exists today only as a one-off measurement.**

The improvement run's inventory (`.ctoc/audit/agent-and-skill-improvement/inventory.json`) gives each of 225 agent and skill files a `tests_reading` list. Its own method statement says how: each of the 543 test files was run alone under a read-tracing preload loaded through `NODE_OPTIONS` (so child processes inherit it); the preload was "kept in the session scratch directory and never committed"; it logged only paths under `agents/` or `skills/`; and it wrapped the read functions, the open functions, the stream creator and the copy functions. By its own list it did not wrap directory listing, existence checks or status checks, and it names its blind spots: worker threads, native addons, spawned programs that are not Node. There is no committed tool that produces this. Measured facts from the file:

- The first agent file in the inventory is read by 25 tests, its skill body by 18. A second agent file in the same category carries the identical 25. Those are the repository-wide fences: they read every agent, so every agent's list contains them. Read tracing captures that for free.
- The same statement records one test file that fails only while the preload is loaded (`tests/sessionstart-coverage.test.js`), and a test (`tests/readme-numbers.test.js`) that failed because a new test file existed and the documented test-file count had not been synced. Creating a file changed the verdict of a test that counts files rather than reading the new one (by the statement; I did not read that test). A tracer that logs only file reads would not connect the two.

**7. The wave barrier is a record, not a run.** `enqueueWaveSync` in `src/lib/actions.js` only records a task:

```
return taskRegistry.addAndClaim(root, {
  kind: 'sync',
  label,
  gitOp: true,
  touches: [],
  blockedBy
});
```

"Run the integrated suite + baseline reconcile + commit" is a sentence in `src/commands/start.md` addressed to the session. No code runs the suite at the barrier or writes evidence from it. I did not read how a `sync` task is completed.

**8. What the final approval reads.** The validator for review to done (`validateReviewToDone` in `src/lib/plan-validator.js`) checks that the required step boxes are ticked and then, excerpt:

```
const evidence = readVerifyEvidence(projectPath, planSlug);
if (evidence == null)               -> "no VERIFY evidence recorded"
else if (evidence.passed === false) -> "recorded VERIFY run failed"
else                                -> refused as stale if the evidence timestamp is
                                       before the plan file's last change
```

It reads no scope. The records are local: `.ctoc/state/` and `.ctoc/quality-state/` are in `.gitignore`. There are 217 records under `.ctoc/state/verify/`. The repository's own `CLAUDE.md` states that agent writes into the verify-evidence directory are denied by the edit hook (I did not read the hook).

Consequence: if the completion simply stopped running the whole suite, one of two wrong things happens. If the record keeps `passed: true`, the final approval reads a narrowed run as the whole gate (the exact shape the standing rule forbids). If the coverage contract stays as it is, a declared floor with no coverage figure fails closed and every build is refused. The record needs an honest scope.

**9. Changes reach the loop only when published.** Agent definitions and the `menu task complete` route run from the installed plugin cache, not from the repository. The earlier session's memory note (2026-09-30) says an edited agent definition takes effect only after push, plugin update and restart. I have not re-verified that today.

**10. Node has no built-in selection.** From a search today (result summaries only; I did not open the pages): `node --test --watch` reruns tests whose module graph is affected, and a related-files option is an open proposal in the Node project (issue 66006). Any such graph sees imports, not the markdown, configuration-file and directory reads that CTOC's repository-wide fences depend on.

**11. The existing journey test.** `tests/greenfield-journey.test.js` walks initialisation, the three approval crossings, the scheduler, the completion, and the real `npm test` subprocess of a fixture project, then asserts that the final approval passes on that real record. Its harness is local to the test file (its own comment explains that a source file whose only caller is a test would be dead code under the reachability fence). In a fixture with no map, the selector in this plan widens to the whole suite, so that test's current path stays valid.

### The problem in one paragraph

Every build pays for the whole suite twice, while the machinery meant to avoid that cannot work (the map is empty and the agents are not wired), and the one place that does select tests, the push, selects in the unsafe direction and can pass on zero tests. The human wants the reverse: cheap, targeted runs while building, and the whole gate at the two moments where work is integrated or shipped, with every record honest about which one it is.

## 2. ALIGN — Approach

### Two principles that govern every move

**The map is a hint, never a verdict.** It lives in `.ctoc/quality-state/`, which is local, git-ignored and not protected from agent writes. It decides what runs inside a loop. It never decides "done". The whole-gate record, produced by code in a protected location, is the backstop, and the final approval requires it. That is why a corrupted or doctored map can cost a build some feedback but cannot cause a false "done".

**Every uncertainty widens the selection; it never narrows it.** An unknown, an unreadable input, a guess, an empty result: each runs more, up to the whole suite, and says which rule did it.

### Move 1 — Measure which tests read which files, with a committed tool

A committed read tracer and a committed map builder replace the uncommitted preload and the never-populated builder.

- Each test file is run alone as a Node process under a preload that records every file the process (and its Node children) reads, every directory it lists, and every path it checks for existence or status. The scope is the whole repository, not only `agents/` and `skills/`, with paths stored repository-relative with forward slashes.
- Measurement runs are separate from verdict runs. The tracer is not put inside the gated run (it would change what the gate measures, and at least one test is known to fail only under it). In the loop, selected tests run untraced for their verdict; the tracer re-measures them afterward, in the background, to refresh their entries.
- The map stores, per file read: a content hash and the list of test files that read it; per directory: the test files that listed it; and, once, the tracer's version and Node's major version. A file's recorded hash advances only when every test that reads it was re-measured against the new content and passed. A test that failed, timed out, or is untraceable keeps its old entry and is always selected.
- Volatile local state (`.ctoc/state/**`, `.ctoc/quality-state/**`, `.ctoc/logs/**`, `coverage/**`, `node_modules/**`, anything outside the repository such as temporary directories) is not hashed for drift, because it would drift on every run. A test that reads such state is listed as a live-state reader and is always selected.
- The tracer's completeness is itself tested: the set of read-capable functions in the running Node's file system module is compared with the set the tracer wraps or explicitly excludes with a written reason, so an upgrade that adds a new way to read a file or list a directory fails by name instead of silently under-selecting.
- Concurrent refreshes (up to five builds finish at once) merge without losing each other's entries; the write is atomic.
- Argument lists only, no shell; cross-platform paths.

### Move 2 — One selector that fails toward more

One function and one command take the touched set and return: the basis (`map` or `whole-suite: <named reason>`), the test files to run, and the list of rules that widened the selection. The result is never empty.

The touched set is the union of: files whose content differs from what the map last saw (so an earlier edit nobody re-measured still counts), files the version control system lists that the map has never seen, and files the map knows that are now gone. If the list cannot be enumerated, the answer is the whole suite.

| Situation | Selection |
|---|---|
| A touched test file | itself, plus every test that reads it |
| A touched file with recorded readers | those readers |
| A touched, existing file that no test is recorded as reading | the whole suite, naming the file |
| A new file | the readers and listers of its directory, plus the file itself if it is a test; a directory nobody ever read or listed means the whole suite |
| A deleted or renamed file | the readers of the old path and the listers of its directory; the new path follows the new-file row |
| A touched test helper or fixture | its readers; none recorded means the whole suite |
| A touched instrument (the selector, the tracer, the map format, the gate script, the package test script) | the whole suite |
| A test flagged failed, timed out, untraceable, or live-state reader | always selected |
| Map absent, unreadable, wrong shape, or built by a different tracer or Node major version | the whole suite, naming which of those |
| A map entry that is not an existing `tests/*.test.js` path inside the repository | refused, and the selection widens to the whole suite |
| Nothing touched at all | not verified (see below), never a pass |
| A filename that resembles a test but has no recorded readers | never used as a substitute for a mapping |

The selection unit is the test file, because that is the unit the runner isolates and the tracer measures.

"Zero tests selected" is never a pass. With something touched, an empty result cannot occur (the rules above widen). With nothing touched, the selector reports `not verified: nothing was touched` and the completion records that as a failure to certify, in the same tri-state discipline the quality agent uses for a lint check that had no tool.

### Move 3 — The executor runs the selector itself

The executor holds `Bash` and may not dispatch a sibling, so its definition carries a literal command that runs the selector and the selected tests:

- Step 8 (write the tests, expect red): run the test files the build wrote.
- Step 14 (verify): lint, type check, and the selector's run. The definition no longer says "Run ALL tests". It says the whole suite, the coverage floor and the zero-skipped check are recorded at the wave barrier and the push, and that the build's report must say so.
- The report template says "Tests: affected only, N of M test files ran, F failed", never the bare "24 passed".

The generated Step 14 lines in newly generated plans (`src/lib/iron-loop.js`, and the fallback template in `src/lib/actions.js`) say the same. Plans already generated keep their text; the executor's definition, not a plan's checkbox wording, governs what runs.

The smart test runner agent remains the on-demand, human- or CTO-Chief-dispatched face of the same command. Its algorithm section is replaced by a call to that command; the coverage mapper agent's mapping half points at the map build, and its risk-ranking half is untouched.

### Move 4 — The completion records a scoped, honest record

`menu task complete` on an implement task runs lint, type check, and the selector's run. It runs the whole gated suite only when the selector widens to the whole suite, and then the record says `scope: whole`, with the reason.

The record keeps its historical meaning for the field every existing reader looks at: top-level `passed` means "the whole gate passed". For an affected-scope record it is `false`, with `undetermined: true`, and the loop's own verdict lives in a separate block. An old reader that knows nothing of scope therefore fails closed instead of reading a narrowed run as a whole pass. Illustrative contract (`<N>` and `<M>` stand for measured values):

```
{
  "planSlug": "<slug>",
  "timestamp": "<instant written>",
  "scope": "affected",                       // "affected" | "whole"
  "passed": false,                           // the WHOLE gate passed?  not verified here
  "undetermined": true,
  "affected": { "passed": true },            // present when scope is "affected"
  "wholeGate": {
    "ran": false,
    "reason": "the selector chose <N> of <M> test files; the whole gate is recorded at the next wave barrier or push"
  },
  "selection": {
    "basis": "map",                          // or "whole-suite: <named reason>"
    "touched": ["<repository-relative path>"],
    "widenedBy": [{ "path": "<path>", "reason": "<named rule>" }],
    "ran":    ["tests/<name>.test.js"],      // by name, complete
    "notRun": ["tests/<name>.test.js"],      // by name, complete
    "ranCount": <N>, "notRunCount": <M-N>, "suiteCount": <M>
  },
  "checks": {
    "lint":  { "unchanged": "as today" },
    "types": { "unchanged": "as today" },
    "tests": {
      "ran": true, "scope": "affected", "passed": true, "skipped": 0,
      "coverage": null, "coverageMeasured": false,
      "coverageFloor": 99, "coverageFloorApplied": false
    }
  },
  "summary": "VERIFY passed for the AFFECTED tests only: <N> of <M> test files ran; the whole suite, the coverage floor and the zero-skipped check did NOT run and are recorded at the next wave barrier or push"
}
```

A whole-scope record keeps today's contract exactly, including the rule that a declared floor with no coverage figure fails closed. Lint and type check keep running in full at every completion; the ruling is about tests.

The circuit breaker counts a Step 14 kickback when the affected tests FAIL, not because the whole gate is unverified.

### Move 5 — The whole gate has two moments and one record

One shared function runs the whole gate (the project's declared test command, once, however many languages were detected) and writes a whole-gate record. Two moments call it:

- **The wave barrier.** The instruction in `src/commands/start.md` becomes a literal recipe that runs that command. The barrier runs alone by the scheduler's own rule, so the tree is not being edited during the run.
- **`/ctoc:push`.** Instead of the delta-and-cache function, the push route runs the same whole-gate function, and pushes only on a pass. The cached zero-test pass and the name-guess substitution are deleted. When automatic pushing has been enabled by the human, the check that gates the machine push is the whole gate too. When it has not, the background check after each commit runs the affected tests and prints "affected only".

The whole-gate record is a separate artifact, stored in the protected verify-evidence location. It is not a new directory: per the repository's `CLAUDE.md` the edit hook protects only its named directories (I did not read the hook), so a record in an unprotected directory would be forgeable by an agent. It records: the command, the exit status, the counts of tests, passes, failures and skips and the coverage figure read from the run output by the existing parsers (an unreadable counter is `null` and fails), the floor, when the run started and ended, and `covers`: the plans whose latest completion record is affected-scope and was written before this run started. The barrier and the push produce the same record shape.

`--skip-tests` on the push stays the human's control. Its output says plainly that the suite did not run, and no whole-gate record is written.

### Move 6 — The final approval reads both records

For a plan whose latest completion record has `scope: whole` and passed, nothing changes. For a plan whose latest completion record is affected-scope, the validator for review to done requires a whole-gate record that passed, whose run started after the completion, and whose `covers` names the plan. Otherwise it refuses and names exactly what is missing, and the human's existing "approve anyway with a recorded reason" path is unchanged. A legacy record with no scope field is read as whole only if it records the whole-suite command and a coverage figure; otherwise it is refused as unverifiable. Every screen that prints a verdict from a record prints its scope.

### Move 7 — The agents and documents say what exists

The smart test runner and coverage mapper agents and skills stop describing caches no code writes and commands that do not exist. `CLAUDE.md` ("Test & Verify", "Coverage floor — the shipped truth", and the Step 14 description), `src/commands/push.md`, and `src/commands/start.md` are reconciled with the two moments.

### The reconciliation with the standing rule

| Moment | What runs | What is recorded | Scope word |
|---|---|---|---|
| In the build loop (executor Steps 8 and 14) | lint, type check, the selected tests | the executor's report | affected |
| Build completion | lint, type check, the selected tests (the whole suite if the selector widens) | the plan's completion record | affected, or whole |
| Wave barrier | the whole gate | a whole-gate record naming the plans it covers | whole |
| Push | the whole gate | a whole-gate record naming the plans it covers | whole |
| Final approval (review to done) | nothing; it reads | nothing; it refuses affected-only | either |

Half one of the real gate, the full machine-produced run, still happens before anything is shipped or called done, and its record names the moment that produced it. Half two, the human's sign-off, is untouched: nothing here crosses or weakens a human gate. What changes is that the record can no longer be mistaken for the wrong half.

### Existing tests whose contract this ruling replaces

A test may change only with a written justification: the contract from outside the test (here, the human's 2026-09-30 ruling), why the test rather than the code, and what newly fails. The tests that assert the cached zero-test pass, the name-guess substitution, the "Run ALL tests" wording of generated plans, or a push that runs affected tests assert behaviour this ruling removes. I did not identify them all. Each change must tighten toward the new behaviour; none may loosen an assertion to turn red green.

## 3. CAPTURE — Acceptance Criteria

Each scenario is a runnable test or a recorded measurement. Tests that need a project use a fixture project of `node:test` files in a temporary directory, never the real repository root.

### The read map

1. GIVEN a fixture project with one test that reads a markdown file, one that requires a source module, one that lists a directory, one that checks whether a path exists, and one that runs a Node child process that reads a file, WHEN the map is built, THEN each test is recorded as reading exactly those five things, as repository-relative forward-slash paths. Proof: a test with one assertion per way of reading.
2. GIVEN the read-capable functions of the running Node's file system module, WHEN they are compared with the set the tracer wraps or excludes with a written reason, THEN a read-capable function in neither set fails the test by name. Proof: a test.
3. GIVEN a test file that fails or times out during a measurement run, THEN it keeps its previous entry (none if new), is flagged untraced, and is always selected next time. Proof: a fixture.
4. GIVEN the whole real suite measured once, THEN for every test file the verdict under the tracer equals the verdict without it, and every divergence is listed by name (the inventory recorded one). Proof: a recorded measurement, including the count of divergent files and the count of live-state readers.
5. GIVEN a built map, THEN it records the tracer version, the Node major version, a content hash for every file read, the test list per file and the tests per listed directory; it is written atomically; it is not committed. Proof: a shape test.
6. GIVEN two refreshes that finish at the same moment, THEN neither loses the other's entries. Proof: a concurrency test.
7. GIVEN the real inventory entry for the first agent file (a byte-for-byte capture in the golden corpus), WHEN the selector is fed a map built from it and that file is touched, THEN it selects exactly the 25 recorded tests. Proof: a golden-corpus test.

### Selection

8. GIVEN a touched file with recorded readers, THEN the selection is exactly those readers plus any touched test files, the basis is `map`, and the counts are reported.
9. GIVEN a touched existing file that no test is recorded as reading, THEN the answer is the whole suite and the reason names the file.
10. GIVEN no map, THEN the whole suite with the reason "no map"; GIVEN a map that is unreadable, not parseable, of the wrong shape, or from a different tracer or Node major version, THEN the whole suite with the reason naming which. It never throws and never returns zero tests.
11. GIVEN a file edited earlier, not re-measured, and absent from this build's own change list, THEN it is treated as touched.
12. GIVEN a new file, THEN the selection is the readers and listers of its directory plus the file itself if it is a test; GIVEN a new file in a directory nobody ever read or listed, THEN the whole suite. GIVEN the real case in the inventory (a new test file changing a documented count), THEN the test that checks that count is selected.
13. GIVEN a deleted file, THEN the readers of its old path and the listers of its directory are selected.
14. GIVEN a touched test helper or fixture, THEN its readers; with none recorded, the whole suite.
15. GIVEN a touched instrument (selector, tracer, map format, gate script, package test script), THEN the whole suite.
16. GIVEN a map entry that escapes the repository, does not exist, or carries shell metacharacters, THEN it is refused, the selection widens to the whole suite, and the tests run from an argument list with no shell. Proof: a hostile-map test.
17. GIVEN a file whose name resembles a test but which has no recorded readers, THEN the whole suite (a guess never replaces a mapping).
18. GIVEN nothing touched, THEN the result is `not verified: nothing was touched`, and the completion records a failure to certify, never a pass.

### The loop

19. GIVEN the executor definition, THEN Step 8 runs the test files the build wrote, Step 14 runs lint, type check and the selector's run and contains no instruction to run the whole suite, it says where the whole gate runs, and its report template says "affected only, N of M". Proof: a test that reads the definition, plus the literal command run against a fixture project.
20. GIVEN a newly generated plan, THEN its Step 14 lines name the affected tests; GIVEN a plan generated before, THEN its text is untouched.
21. GIVEN an affected test that fails, THEN the run exits non-zero, names the failing test, and records no pass.

### The completion record

22. GIVEN a fixture build with a mapped selection, WHEN `menu task complete` runs, THEN it runs lint, type check and only the selected tests, and the record carries `scope: affected`, top-level `passed: false` with `undetermined: true`, `affected.passed`, the touched list, the ran and not-run lists by name and count, coverage recorded as not measured with the floor shown as not applied, and the summary sentence. The command's response shows the scope and the counts.
23. GIVEN a fixture build where the selector widens, THEN the whole gated suite runs and the record is `scope: whole` with the widening reason, and its top-level `passed` follows the gate.
24. GIVEN a whole-scope record with a declared floor and no coverage figure, THEN it still fails closed (today's behaviour, unchanged).
25. GIVEN a completion whose affected tests fail, THEN the record shows the failure and one Step 14 kickback is counted; GIVEN one whose affected tests pass, THEN no kickback is counted and the task settles as done with a result that says "affected tests passed".
26. GIVEN every place that prints a verdict from a completion record (found by tracing the readers of the record reader with the reachability tooling, not by text search), THEN a scoped record prints "affected", the counts, and never the whole-gate pass wording. Proof: a test per reader.
27. GIVEN a real scoped record, THEN a byte-for-byte capture of it joins the verify-evidence golden corpus and is read by its canonical reader.

### The two whole-gate moments

28. GIVEN a whole-gate record, THEN it is written only by the shared function, in the protected verify-evidence location, and an agent write to that location is refused by the same hook that refuses a write to a plan's verify record. Proof: a hook test.
29. GIVEN `/ctoc:push` in a fixture repository with both a package manifest and a TypeScript configuration, THEN the declared test command runs exactly once, a passing run writes a whole-gate record and then pushes, and a red test means no push. The printed counts and coverage are read from the run output; an unreadable counter fails.
30. GIVEN two pushes in a row with nothing changed and a failed network push between them, THEN the second run executes the whole suite again. No cached pass exists.
31. GIVEN `--skip-tests`, THEN the output says the suite did not run and no whole-gate record is written; nothing else about the flag changes.
32. GIVEN automatic pushing enabled, THEN the check that gates the machine push is the whole gate; GIVEN it disabled, THEN the after-commit background check runs the affected tests and prints "affected only".
33. GIVEN the wave barrier, THEN `src/commands/start.md` contains a literal recipe that calls the shared function, the recipe-execution fence covers it with a fixture and an entry in the recipe coverage list, and the resulting record names the covered plans.

### The final approval

34. GIVEN a plan with an affected-scope completion record and no whole-gate record, THEN the validator refuses and names exactly what is missing; GIVEN then a passing whole-gate record that started after the completion and names the plan, THEN this check passes.
35. GIVEN a whole-gate record that failed, that started before the completion, or that does not name the plan, THEN the validator refuses with the specific reason.
36. GIVEN a legacy record with no scope field, THEN it is read as whole only if it records the whole-suite command and a coverage figure; otherwise it is refused as unverifiable. Proof: the validator is run over every plan in review before and after the change, and the list of plans whose verdict changes is reported, not silently accepted.

### The agents and documents

37. GIVEN the smart test runner and coverage mapper definitions and skills, THEN their recipes for selection and map building are literal commands that run against a fixture, they describe no cache file that no code writes, and they name no command that does not exist.
38. GIVEN `CLAUDE.md`, `src/commands/push.md` and `src/commands/start.md`, THEN each says which moment runs the whole gate and none describes the push as running affected tests.

### The journey a human takes

39. GIVEN a fixture repository with a built map, WHEN a build touches one file, completes, is refused at the final approval, passes through the wave barrier, is approved, and is pushed, THEN only the affected tests ran at the completion, the record said so, the approval was refused until the barrier's whole-gate record existed, and the push ran the whole suite. Proof: one end-to-end test added to the existing greenfield journey test (`tests/greenfield-journey.test.js`, whose harness is local to that file), with no mocks of core logic. The journey's existing path, a fixture with no map, keeps passing because the selector widens to the whole suite there.

## Definition of Done

- Every scenario above passes as a committed test or a committed measurement.
- The whole gate (`npm test`) passes with the coverage floor unchanged, no skipped test, and the file fence and export fence green: the tracer, selector and builder are reachable from a live entry point (the executor's recipe, the completion route, the push route, the barrier recipe) in the same unit of work, not in a follow-up.
- Every existing test whose assertion changes carries the written justification described in section 2.
- Recorded measurements, taken on this repository during the build (not targets): the duration of a whole gate and of a typical affected run; the number of test files selected for five representative touches (an agent file, a `src/lib` file, a hook, a test helper, a new file); the list of test files that diverge under the tracer; the count of live-state readers; the plans whose final-approval verdict changed.
- A human can see the scope: in the executor's report, in the response of `menu task complete`, in the final-approval refusal text, and in the push output.
- The record notes which plugin version ran. Because agent definitions and commands run from the installed plugin, the loop behaves this way only once the installed version contains it; the work is not reported as "the loop now does this" before then.

## Scope

### In Scope

- A committed read tracer and map builder for `node:test` suites (each test file runnable alone as a Node process), including directory listings and existence checks, repository-wide.
- One selector with the widening rules above, used by the executor, the completion, the after-commit background check and the smart test runner agent.
- The scoped completion record and its readers.
- One shared whole-gate function, its record, the barrier recipe and the push route using it; deleting the cached zero-test pass and the name-guess substitution.
- The final-approval validator reading both records.
- The executor definition, the two testing agents and skills (mapping and selection halves), the generated Step 14 lines, and the documents named in Move 7.

### Out of Scope

- Selection for jest, vitest, pytest, go, cargo and other stacks. Those projects keep running their whole declared suite, the safe direction. Whether and when a per-language adapter is planned is the human's decision.
- The coverage mapper's risk-ranking half (uncovered regions weighted by criticality and churn). It lives in the coverage mapper's own definition and is untouched.
- The smart test runner skill's flake handling. Unchanged.
- The whole gate itself (`src/scripts/test-gate.js`), its floor, its parsers and the offline claims ledger. Unchanged.
- Selecting lint or type check. They run in full at every completion.
- The human gates, the approval ledger, and the edit hook. Used, not changed.
- Individual test speed, or running the whole suite in parallel.
- A committed, shared map. The map is a per-developer cache.
- The improvement run's inventory and record. Read as evidence, not edited.
- Rewriting plans already generated or approved.

## Technical dependencies (stated as facts, not as a schedule)

- The completion record's new fields, and the validator that reads them, must exist together. The first scoped record must never be written while any reader still treats a record without a scope as a whole pass. The fail-closed representation in Move 4 covers a reader that is out of date, but not one that prints "passed" from the wrong field.
- The tracer and the first map must exist before the selector can return `map`. Until they do, every selection is the whole suite, which is safe.
- The whole-gate record must sit in the protected verify-evidence location, so the location's exact protection (prefix or exact directory) must be read from the hook and tested before the record is written there.
- The files this plan would edit include agent and skill files that the improvement run's queued slices also edit. The scheduler serialises plans that declare the same file. The improvement record also checks that each round of a file starts where the previous ended, unless the round is flagged as resumed after an unrecorded edit, and that a file's claims block is unchanged; an edit made here must respect both.
- A plan that will create a counted artifact (a new test file, a new `src/lib` module, a new agent or skill file) must declare `CLAUDE.md`, because the validator for the implementation to todo crossing refuses otherwise.
- The golden-corpus fence requires a byte-for-byte real capture for any persisted contract a module reads. That applies to the completion record (extended) and to the map (new).
- The completion route and the agents run from the installed plugin, so publishing precedes any observed effect in the loop.

## Candidate files (not a declaration; the implementation planner fixes the exact list)

```
src/lib/coverage-map.js                     extend: reads-based entries, drift, no name guess, no age rule
src/scripts/build-coverage-map.js           extend: measurement mode; argument lists, no shell; give it a written root reason
(new) a read-tracing preload                name chosen by the planner
(new) the selector                          library plus a command line entry
(new) the shared whole-gate function        library plus a command line entry
src/lib/quality-agent.js                    replace the selected-tests function; push and after-commit callers
src/commands/push.js, src/commands/push.md  whole gate once; --skip-tests wording; documentation
src/lib/step-13-verify.js                   scope-aware record; coverage contract by scope
src/lib/actions.js                          completion settles from the affected verdict; fallback template
src/lib/plan-validator.js                   review to done reads both records
src/lib/iron-loop.js                        generated Step 14 lines
agents/iron-loop/iron-loop-executor.md
agents/testing/smart-test-runner.md, skills/testing/smart-test-runner/SKILL.md
agents/testing/coverage-mapper.md,   skills/testing/coverage-mapper/SKILL.md
src/commands/start.md                       barrier recipe
CLAUDE.md                                   Test & Verify, coverage floor paragraph, Step 14 description, counts
.ctoc/recipe-coverage.json, .ctoc/reachability-roots.json
tests/coverage-map-coverage.test.js, tests/quality-agent*.test.js, tests/w10-push-entry-point.test.js,
tests/quality-fleet-wiring.test.js, tests/greenfield-journey.test.js
tests/fixtures/golden-corpus/ (verify-evidence, plus the map)
NOT changed: src/scripts/test-gate.js, .ctoc/coverage-baseline.json, .ctoc/quality-config.yaml
```

## Risks and what this does not defend

- **A doctored map.** The map is agent-writable. It can make a loop run less than it should. It cannot make anything "done", because the final approval needs a whole-gate record that only code in the protected location writes. This plan does not defend the loop's feedback against a hostile map.
- **Tracer blind spots.** A read through a path the tracer does not see under-selects. The completeness test narrows this for the file system module; worker threads, native addons and spawned non-Node programs remain blind, as the inventory's own method statement admits. The backstop is the whole gate.
- **Reads that depend on state.** A single measurement can miss a read that only happens under some condition. Each refresh re-measures the tests that ran, which improves the map over time; the whole gate is the backstop.
- **Cost of a wide touch.** Touching a file that the repository-wide fences read selects every one of them. I did not measure how many tests a typical `src/lib` change selects; only two agent-file examples above were read.
- **A run over a tree being edited is not a valid record.** The barrier runs alone by the scheduler's rule. The push route, by my reading, does not check for running builds. That check is a candidate for the implementation plan.
- **A change to gate logic.** Move 6 changes the validator for the final approval. The repository's rule is that changes to gate logic need the human's explicit approval; the implementation plan must show the exact change at its own approval moment. Nothing here is pre-approved.

## What was not verified

- Nothing was executed. I hold no way to run a program in this session. Every behavioural statement is from reading; none was observed. In particular I did not run the push route, the completion route, the tracer, or any test.
- Durations. I did not measure the whole suite, a lint run, a type check, or any affected run. The completion route's default time budget is 120000 milliseconds (raisable with `CTOC_VERIFY_TIMEOUT_MS`) and the quality agent's is 300000; whether either fits the whole suite here is unknown. The newest completion record shows a passing whole run through the completion route, without recording its duration.
- How many test files a typical change selects. Only the first two inventory entries (25 and 18) were read in full; I do not extrapolate.
- Whether the module loader's reads are seen by a wrapper on the file-reading function under the installed Node version. The inventory logged only `agents/` and `skills/` paths, so it cannot show this for `src/**`. Scenario 1 exists to prove it. I did not check the installed Node version, and I believe (not checked) that recent Node versions add directory-reading functions that the inventory's list did not wrap.
- Whether the push route launches the declared test command once or once per detected language on this repository. By reading it may be twice.
- How a `sync` task is completed and whether anything runs at that point.
- All readers of the completion record beyond the final-approval validator and the completion response. I used no text search for call-graph questions; the implementation planner should use the reachability tooling.
- Whether the Step 14 lines inside an already approved plan fall inside the approval hash. If they do, editing them for approved plans would invalidate approvals, which is why only newly generated plans change.
- Tests that assert the current Step 14 wording or the current push behaviour. Not identified.
- The rest of `src/lib/iron-loop.js` beyond the template function; the coverage-enforcer and quality-gate-runner agents; whether `agents/coordinator/cto-chief.md` dispatches the smart test runner; `.ctoc/coverage-baseline.json` itself (the floor of 99 comes from the completion records); the edit hook.
- A review-stage plan describes a `src/lib/journey-harness.js`. It does not exist on disk; the harness is local to the journey test.
- The Node claim in fact 10 is from search-result summaries; the pages were not opened. Sources: https://github.com/nodejs/node/issues/66006 and https://nodejs.org/api/test.html.
- Of the 217 completion records, I read two.
- The number of plans in review (an earlier plan cites 134 on 2026-09-25); not recounted.

## Decisions Taken Under Ambiguity

1. **Mechanism: runtime read tracing.** Not chosen: a static import graph (misses the markdown, configuration-file and directory reads that CTOC's repository-wide fences make), parsing coverage reports (the builder's approach; CTOC's runner emits none of its formats and the builder never fills the test list), filename guessing (selects too little). Cost of the choice: a measurement run per test file, which is why it is separate from every verdict run and runs in the background.
2. **Scope of stacks: `node:test` suites only.** Every other stack runs its whole declared suite. Not chosen: per-language adapters. Cost: no speed-up for those projects, in the safe direction.
3. **The tracer stays out of the gated run.** Not chosen: tracing inside the gate to get the map for free. Cost: a separate measurement pass. Reason: it would change what the gate measures, and one test file is known to fail only under the tracer.
4. **Freshness by content, not by age.** Not chosen: the 7-day age rule the library defines. Cost of the choice: hashing every file the map knows on each selection (not measured). The age rule discards a correct old map and trusts a wrong new one.
5. **An earlier, un-re-measured edit counts as touched.** Cost: the selection can include readers of another build's edit, which is broader than "this build touched". It shrinks as background refreshes land.
6. **The executor runs the selector itself and does not dispatch the smart test runner agent.** Reason: the executor may not dispatch a sibling. Not chosen: a dispatch through CTO Chief. Cost: two callers (executor and agent) share one command.
7. **The final approval requires a whole-gate record for an affected-scope completion.** Grounded in the standing rule. Not chosen: accept the affected record with a visible label. Cost of the choice: a build cannot be approved as done until a barrier or a push has produced the whole-gate record; the existing recorded-reason override remains for the human.
8. **`passed` keeps meaning "the whole gate passed", so an affected record has it false and undetermined.** Not chosen: `passed: true` plus a `scope` field. Cost of the choice: every reader that shows the field must learn the affected block, and the task result and kickback logic must read it. Cost of the alternative: any reader unaware of scope, including the previous installed plugin version reading a newer record, would read a narrowed run as a whole pass.
9. **Legacy records without a scope are read as whole only if they carry the whole-suite command and a coverage figure.** Not chosen: read all as whole (lets partial or hand-made records pass), refuse all (blocks every plan in review today). The before-and-after run in scenario 36 reports what changes.
10. **Lint and type check keep running in full at every completion.** Not chosen: scoping lint to touched files. Cost: those two still run every build; I did not measure their duration.
11. **The whole-gate record is a separate artifact in the protected location.** Not chosen: writing the whole-gate result into each plan's own record. Cost of the choice: the final approval reads two artifacts. Reason: rewriting a plan's record after the fact is the hand-edited-evidence shape the executor definition forbids.
12. **The push always runs the whole suite and never reuses a barrier's record, even for an identical tree.** Grounded in "before pushing". Cost: a duplicated run when nothing changed since the barrier.
13. **`--skip-tests` stays, and says plainly that the suite did not run.** It is the human's control; not removed. Cost of leaving it silent (the current behaviour): a reader of the push output cannot tell.
14. **Wave of one.** A build started alone is followed by a barrier of one, which the start instructions already permit. Not chosen: a separate solo-build route. Cost: none beyond the barrier's whole-gate run.
15. **The selection unit is the test file, not the test case.** Cost: a file with many cases runs whole.
16. **A live-state reader is always selected.** Cost: if many tests read live local state, the always-selected set grows; the measurement reports how many. Fixing such tests to use temporary fixtures is test hygiene outside this plan.
17. **No retries on a failing affected run.** A retry turns a flaky test into a slow one, and the repository's rule is zero flaky.
18. **The old map location and shape are reused (`.ctoc/quality-state/coverage-map.json`, with `files` and `tests`) and extended.** Not chosen: a new store. Cost: the extension must keep existing readers working; the `metadata` versus `_meta` mismatch in the agent text is corrected to the library's `_meta`.
19. **The after-commit background check runs the affected tests unless automatic pushing is enabled.** Not chosen: whole suite on every commit (contradicts the ruling), or removing the check.
20. **Only newly generated plans carry the new Step 14 wording.** Reason and cost: see the unverified item on the approval hash.
21. **The end-to-end scenario extends the existing journey test rather than adding a new harness file.** Reason: a source file whose only caller is a test is dead code under the reachability fence, as that test's own comment records.

## Open Questions For The Human

**Question 1 — When the whole gate goes red at the barrier or the push, which finished builds does that hold back from the final approval?**

Several builds (up to five run at once) are covered by one whole-gate run. One test fails. Options, laid out flat:

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. Every covered build is held | A red whole-gate record refuses the final approval for every plan it covers, until a passing record covers them. | One rule; no judgement about who is at fault; matches "the integrated tree is not green, so nothing in it is done". | An unrelated failure holds up builds that had nothing to do with it; each needs a new whole-gate run or a recorded-reason override. |
| B. Only implicated builds are held | The map decides: a plan is held only if a failing test reads a file the plan touched; the others pass with the failure noted on their record. | Unrelated finished builds can be approved while one problem is fixed. | The decision to clear a build rests on the map, which is a hint; a wrong map clears a guilty build; more logic sits inside a gate. |
| C. No build is held automatically | The failure is shown on every covered plan's approval screen and you decide plan by plan, using the existing recorded-reason override where you choose to. | You own every call; no attribution logic to get wrong. | A machine-checkable fact is left to your vigilance, and approving with a known red tree is one keypress away, the same shape that trained the override habit before. |

This is your decision about risk and about how much friction you accept at the final approval; I have made no recommendation. Scenarios 34 and 35 currently encode option A as a working default so that they are testable; they change with your choice.
