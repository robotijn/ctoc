---
title: "Close the coverage holes — the untested evidence-pack command and the fail-closed arms nothing has ever made throw"
type: functional
status: functional
created: 2026-08-31
priority: high
effort: medium
files:
  - tests/evidence-pack-main.test.js
  - tests/enforcement-fault-arms.test.js
  - tests/guard-files-coverage.test.js
  - tests/actions-coverage-holes.test.js
  - tests/quality-agent-coverage-holes.test.js
  - tests/iron-loop-enforcer-coverage-holes.test.js
  - tests/dispatch-seat-liveness-coverage-holes.test.js
  - tests/verify-claims-coverage-holes.test.js
  - tests/streaming-gate-coverage-holes.test.js
  - tests/continuation-queue-coverage-holes.test.js
  - tests/app-runner-coverage-holes.test.js
  - tests/session-start-coverage-holes.test.js
  - .ctoc/coverage-baseline.json
approved_by: human
approved_at: 2026-08-31T14:14:04.325Z
gate_crossed: functional → implementation
---

# Close the coverage holes — index of slices

This plan is now an **index**. The work below was decomposed into 20 small implementation
slices, each its own plan file with its own Step 8–16 execution plan. The original functional
plan is preserved in full at the bottom, under "Original functional plan".

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00235-close-the-coverage-holes-s1-evidence-pack-main.md` | Spawn the evidence-pack command for real against a seeded fixture; assert the manifest, the archive, and the `tar`-absent fallback | – |
| 2 | `00236-close-the-coverage-holes-s2-enforcement-fault-arms.md` | One fault-injection case per fail-CLOSED arm (12 arms across 5 modules), each asserting the deny-ward value | – |
| 3 | `00237-close-the-coverage-holes-s3-fail-open-contracts.md` | Force the documented fault in each fail-OPEN arm; assert exit 0 and the exact stderr line | – |
| 4 | `00238-close-the-coverage-holes-s4-actions.md` | Classify and cover the dark ranges in the plan-operations module (63 lines, the largest single hole) | – |
| 5 | `00239-close-the-coverage-holes-s5-quality-agent.md` | Classify and cover the dark ranges in the quality agent | – |
| 6 | `00240-close-the-coverage-holes-s6-iron-loop-enforcer.md` | Classify and cover the dark ranges in the self-check enforcer, starting with the malformed-baseline arm | – |
| 7 | `00241-close-the-coverage-holes-s7-dispatch-seat-liveness.md` | The seat-liveness instruments report `unreadable` rather than `absent` — nine fault arms plus the description | – |
| 8 | `00242-close-the-coverage-holes-s8-app-runner.md` | A failed drive of the declared entry point is a FAILURE, never `applicable: false` | – |
| 9 | `00243-close-the-coverage-holes-s9-streaming-gate.md` | A sufficiency predicate that could not run reports ignorance (`computed: null`), never sufficiency | – |
| 10 | `00244-close-the-coverage-holes-s10-menu-screens.md` | The screens the human reads, starting with the deleted-working-directory silence | – |
| 11 | `00245-close-the-coverage-holes-s11-continuation-queue.md` | The queue's fault arms skip a plan rather than authorise one; a questions fault never invents a fork | – |
| 12 | `00246-close-the-coverage-holes-s12-verify-claims.md` | Run the claim-verification command under a test, offline — the suite never fetches | – |
| 13 | `00247-close-the-coverage-holes-s13-session-start.md` | Every optional session-start subsystem degrades to silence, proven byte-for-byte | – |
| 14 | `00248-close-the-coverage-holes-s14-start-command.md` | Test what is reachable in the dashboard command; NAME the terminal-only branch rather than fake it | – |
| 15 | `00249-close-the-coverage-holes-s15-remainder-fences.md` | Remainder: the eight fence and scanner modules — a fence that cannot look must not report clean | – |
| 16 | `00250-close-the-coverage-holes-s16-remainder-plan-pipeline.md` | Remainder: the fourteen plan-parsing, validation, migration and index modules | – |
| 17 | `00251-close-the-coverage-holes-s17-remainder-security-tooling.md` | Remainder: the twelve security-scanning, tool-detection and audit-chain modules | – |
| 18 | `00252-close-the-coverage-holes-s18-remainder-hooks-commands.md` | Remainder: the eleven hook, command, initialisation and release modules | – |
| 19 | `00253-close-the-coverage-holes-s19-remainder-streaming-claims.md` | Remainder: the twelve streaming-store, continuation, inbox and claim-fetcher modules | – |
| 20 | `00254-close-the-coverage-holes-s20-floor-raise-decision.md` | Measure the finished set and put "raise the floor from 99 to N?" to the human as a decision — never applied by an agent | slices 1–19 |

Slices 1–19 are independent of one another: they touch disjoint test files and disjoint modules,
so their order is free. Building stays sequential and one at a time on a shared tree — a
concurrent build poisons the evidence a human reads. Slice 20 is last by dependency, because the
floor can only be raised on the final measurement.

## The rules every slice inherits

- **Behaviour, not lines.** Every new test asserts something a mutation would break. A test that
  only touches a line is a line-toucher and does not count.
- **Never weaken.** No assertion loosened, no case deleted, no existing test file modified, no
  entry added to any baseline's `whitelist` / `exemptions` / `debt`, no file excluded from
  `--test-coverage-include`.
- **Never mock the function under test.** Faults are injected at a true boundary only — `safeFs`,
  `fs`, `path`, `child_process`, the module loader — and every mock is restored.
- **Classify every range** as (a) reachable → test it, (b) permission-gated or terminal-only →
  leave it and NAME it in the test file header with the reason, or (c) dead → report it, never
  delete it.
- **A skip is loud or it does not exist.** A permission-gated case that cannot run prints its
  reason; a silent no-op is a check reporting a verdict it never earned.
- **Step 14 is `npm test`**, which is the only run that enforces the coverage floor and the
  zero-skipped gate. `node --test` alone is not the gate.
- **A green-before-implementation case is a finding**, accounted for at Step 11 — never banked.
- **A refused write is stop-and-ask.** If a slice must touch a file its `files:` does not cover,
  it files the growth through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields);
  it never amends its own `files:` and never edits around the refusal.

## The dominant seam, stated once

The most common dark shape in this codebase is `try { safeFs.X(...) } catch { <deny-ward value> }`.
Because the call site looks the property up at call time on the shared module object, the seam is:

```js
const safeFs = require('../src/lib/safe-fs');
const real = safeFs.readFileSync;
t.mock.method(safeFs, 'readFileSync', (p, o) => {
  if (String(p).includes('CTOC-FAULT-SENTINEL')) throw new Error('injected');
  return real(p, o);
});
```

The sentinel guard matters: an unguarded mock breaks every other read in the process. For an arm
behind a module-level `require`, patch `Module._load` for one resolved filename and restore it in
a `finally` — the pattern already shipped in `tests/pretooluse-write-coverage.test.js`. For a hook
with no exports, spawn it with `node --require <preload> <hook>`, where the preload seeds
`require.cache` before the hook runs as the main module.

**A child process DOES contribute to the scoped coverage number** — verified against the
measurement: `PreToolUse.Write.js`'s `main()` has no in-process caller, yet its body is covered by
the spawned wrappers in its test file. (That same test file also contains a comment asserting the
opposite; it is wrong, and slice 1 reports it.)

## What the planner verified, and what it did not

Read in full or at the cited ranges this session: `src/scripts/evidence-pack.js`,
`src/lib/safe-fs.js`, `src/scripts/verify-claims.js`, `src/hooks/guard-files.js`,
`src/hooks/UserPromptSubmit.js`, `src/lib/documented-counts.js`,
`src/lib/real-path-confinement.js` (all four arms), `src/lib/approval-residency.js`,
`src/lib/shell-write-targets.js` (two windows), `src/hooks/PreToolUse.Bash.js` (two windows),
`src/hooks/PreToolUse.Write.js` (three windows), `src/lib/plan-coverage.js` (one window),
`src/lib/dispatch-seat-liveness.js` (three windows), `src/lib/continuation-queue.js`,
`src/lib/streaming-gate.js`, `src/lib/app-runner.js`, `src/lib/menu-screens.js`,
`src/lib/iron-loop-enforcer.js`, `src/lib/actions.js`, `src/lib/quality-agent.js`,
`src/hooks/SessionStart.js`, `src/commands/start.js` — the last seven at one cited cluster each —
plus `tests/evidence-pack-collect.test.js`, `tests/pretooluse-write-coverage.test.js`,
`.ctoc/coverage-baseline.json`, `.ctoc/reachability-roots.json` and `.gitignore`.

**Not read:** the ~55 modules in slices 15–19, the unenumerated tails of `actions.js` (beyond line
1138) and `quality-agent.js` (beyond 1749), and the specific ranges each of those slices names.
Those slices say so in their own text and re-derive their ranges at Step 9 PREPARE. The line
numbers throughout this set are from the 2026-08-31 measurement and move with every commit: **the
gate's own report is the source of truth, not this plan.**

## Drift found between the approved plan and the code

Each of these is a finding for the human, recorded in the slice that meets it:

1. **The evidence-pack command cannot be pointed at another project.** Its root is fixed from the
   script's own location, so "against a seeded fixture repository" is unreachable without a seam —
   and, installed from the marketplace, the command would pack the plugin's directory rather than
   the human's project. Slice 1 adds the smallest seam and puts the larger question to the human.
2. **The evidence archive does not contain its own manifest.** The manifest is written beside the
   archive, not into it. The approved acceptance line says otherwise. Slice 1 asserts the real
   behaviour and reports the omission rather than silently "fixing" a regulatory artifact.
3. **With `tar` absent the command does not fail** — it falls back to a JSON bundle and exits 0.
   The approved plan calls it a failure. Slice 1 asserts the fallback.
4. **`tests/pretooluse-write-coverage.test.js` contradicts itself** about whether a spawned
   child's coverage is attributed upward. The measurement settles it: it is. Reported, not fixed
   here.
5. **`src/scripts/evidence-pack.js` is a declared execution root with no written reason**, unlike
   three of the seven entries in `.ctoc/reachability-roots.json` — a small gap in the escape
   hatch's own honesty.

---

## Original functional plan

## 1. ASSESS — Problem Understanding

Measured on 2026-08-31 (`npm test`, node line coverage scoped to `src/**`):
**99.04 %** — 765 uncovered lines across 77 files, against a floor of 99. The gap
is not one kind of thing; it is three, and they deserve different treatment:

**A. Genuinely untested code (the real hole).** `src/scripts/evidence-pack.js` is at
**59.56 %**: its `main()` (lines 157–206 — the command that gathers audit inputs in a
time window, hashes them, writes `manifest.yaml`, and packs a tar evidence archive for
a regulatory regime), `collectInputs`' baseline walk (97–101), `hashFile` /
`ensureDir` / `readChainHead` / `readActiveRegimes` / `packWithTar` (123–146) and
`yamlify` (208–221) are never executed by any test — the two existing tests
(`evidence-pack-collect`, `evidence-pack-security`) exercise only `parseArgs` and the
window collection. A compliance artifact generator whose main path has never run
under a test is exactly the "well-tested dead code" shape Operating Lesson 16 names,
one step over: tested helpers, unrun command.

**B. Fail-CLOSED catch arms on the enforcement paths that nothing has ever made
throw.** Read line by line this session:

| file | lines | the arm | what it does on a fault |
|---|---|---|---|
| `src/lib/approval-residency.js` | 285-288 | `catch` in `isApprovedForCoverage` | `{ approved: false, reason: 'classify-error' }` — denies |
| `src/lib/plan-coverage.js` | 245-247 | pathological glob in overlap | `return true` — block |
| `src/lib/plan-coverage.js` | 467-469 | unresolvable target path | `return FAILED` |
| `src/lib/plan-coverage.js` | 669-672 | explain-only fault | `null` — never changes a decision |
| `src/hooks/PreToolUse.Bash.js` | 827-830 | coverage classification fault | `result: 'uncovered'` — deny |
| `src/hooks/PreToolUse.Bash.js` | 1069-1070 | `main().catch` | exit 1 |
| `src/lib/real-path-confinement.js` | 165-169, 196-198 | resolve fault | `resolve-failed` |
| `src/lib/real-path-confinement.js` | 258-259 | escape-check fault | `escapes: true` |
| `src/lib/real-path-confinement.js` | 305-306 | within-check fault | `true` (treated as inside the protected dir) |
| `src/lib/shell-write-targets.js` | 526-528 | classifier fault | `indeterminate`, never `none` |

Every one of these is the arm that keeps the harness closed when something breaks.
Not one has been shown to do so by a test; each is believed, not verified. A future
edit could flip any of them to an allow and the suite would stay green.

**C. Fail-OPEN arms, by design.** `src/hooks/guard-files.js` 130-133 (the outer
`catch` of a guard hook exits 0 — "never break the user's flow because of a hook
bug"); `src/hooks/PreToolUse.Write.js` 249-250 / 424-425 / 446-456 (the *advisory*
plan-number-collision and duplicate checks, documented as never able to suppress
enforcement); `src/hooks/UserPromptSubmit.js` 61-64 (the routing reminder's error
arm). These are the human's design decisions; the defect here is only that the
documented behaviour is unasserted, so it could silently change.

**D. The long tail.** `actions.js` 63 lines · `quality-agent.js` 61 ·
`iron-loop-enforcer.js` 50 · `start.js` 37 · `dispatch-seat-liveness.js` 35 (89 %) ·
`app-runner.js` 24 · `streaming-gate.js` 22 · `menu-screens.js` 22 ·
`continuation-queue.js` 20 · `verify-claims.js` 19 (89 %) · `SessionStart.js` 19 ·
and 60 files with ≤ 17 lines each (the full table, with line ranges, is in the
session record and is reproduced by running the gate — `npm test` prints it).

## 2. ALIGN — Approach

**Kill the holes with tests that would catch a regression, not tests that touch
lines.** Coverage is the instrument, not the goal; every new test asserts a behaviour
a mutation would break (Operating Lesson 14 — never a vacuous line-toucher).

1. **Run `evidence-pack.js` for real.** A test spawns it as a child process
   (`node src/scripts/evidence-pack.js --since … --until …`, argument array, no
   shell) against a seeded fixture repository (audit dispatches, a chain head, an
   active regime, a baseline manifest, `tar` present), then asserts the manifest's
   content (input list, hashes, regime, chain head) and that the archive exists and
   lists the manifest. A second case runs it with `tar` absent from `PATH` and asserts
   the documented failure. This is the same discipline as `recipe-harness.js`: a
   shipped command is proven by executing it.
2. **Make every fail-closed arm throw, and assert the deny.** With `node:test`'s
   `t.mock.method` on the true boundary (`safeFs`, `path`/`fs.realpathSync`, the
   inner classifier), inject a fault into each arm in table B and assert the
   deny-ward value (`approved:false`, `true`, `FAILED`, `uncovered`, `resolve-failed`,
   `escapes:true`, `indeterminate`). One test file, one case per arm, each named for
   the arm and the value it must return. For `PreToolUse.Bash.js` `main().catch`,
   run the hook as a child process with a payload that forces the throw and assert
   exit 1 plus the stderr line.
3. **Assert the fail-open arms as documented.** `guard-files.js`: force the throw,
   assert exit 0 **and** the `[CTOC] guard-files error (failing open)` stderr line —
   the design is unchanged, but it is now a stated contract, not an accident. Same
   for the advisory arms in `PreToolUse.Write.js` and `UserPromptSubmit.js`.
4. **The long tail, by behaviour.** For each of the eleven files in D, read the
   uncovered ranges, classify each range as (a) reachable behaviour → write the test,
   (b) permission-gated or TTY-only → leave it and say so in the test file header,
   (c) dead → report it, do not delete without a plan. `start.js` 957-973 (the
   interactive-terminal branch) and the root/Windows permission arms are expected
   (b) and are **out of scope by the human's standing decision** (coverage floor is a
   normal-dev-machine floor; never fake those branches).
5. **Ratchet the floor only after the measurement, only upward, only by the human.**
   The plan proposes raising `minPct` in `.ctoc/coverage-baseline.json` to one point
   under the new measured value (expected ≈ 99.5); the raise itself is presented as
   a decision at the final review, never applied by an agent on its own.

**Never:** weaken an assertion, add a `whitelist`/`exemptions` entry to any baseline,
mock away core logic, or exclude a file from `--test-coverage-include`.

### Scope

**In scope:** new and extended tests for A, B, C and the reachable parts of D; a
source change only where a test exposes a real bug (documented in the slice);
the proposed floor raise as a human decision.

**Out of scope:** the permission-gated arms (root / Windows), `start.js`'s
interactive-terminal branch, deleting any code (a dead range is reported to the
human, not removed here), changing any fail-open design to fail-closed (that is a
separate decision for the human — this plan asserts the current contract).

## 3. CAPTURE — Acceptance Criteria

**User story.** As the owner of a system whose whole value is that it cannot be
talked out of its own guardrails, I can point at every catch arm that keeps an edit
denied and show a test that makes it throw and watches it deny — and I can show the
one command that ships without ever having run under a test running under a test.

```gherkin
Feature: Every coverage hole is either tested or named

  Scenario: The evidence-pack command runs under a test
    Given a fixture repository seeded with dispatches, a chain head, an active regime and a baseline manifest
    When the test spawns node src/scripts/evidence-pack.js with a window covering them
    Then a manifest.yaml is written listing each input with its hash, the regime and the chain head
    And the tar archive exists and contains the manifest
    And with tar absent from PATH the command fails with its documented message

  Scenario: A fault inside an enforcement oracle denies
    Given each arm listed in table B
    When the test injects a throw at that arm's boundary
    Then the returned value is the deny-ward value the arm documents
    And no arm returns an allow, null-as-allow, or `none`

  Scenario: The fail-open arms are a stated contract
    Given guard-files.js, PreToolUse.Write.js's advisory checks and UserPromptSubmit.js
    When the test forces the documented fault
    Then the exit code is 0 and the documented stderr line is written

  Scenario: The long tail is classified, not touched blindly
    Given the eleven long-tail files
    When the slice for each is done
    Then every previously uncovered range is either covered by a behavioural test,
      or named in the test file header as permission-gated / TTY-only with the reason

  Scenario: The gate is green and the floor is honest
    When npm test runs
    Then it reports fail 0, skipped 0, measured coverage >= 99.5
    And no test was weakened and no baseline exemption was added
    And the floor raise is presented to the human as a decision, not applied by an agent
```

**Definition of Done**
- `src/scripts/evidence-pack.js` ≥ 95 % line coverage, `main()` executed as a child process.
- Every table-B arm has a named fault-injection case asserting the deny value.
- Every table-C arm has a named case asserting exit 0 + the documented stderr line.
- Long-tail files: each uncovered range covered or classified in a header comment.
- `npm test` green; measured coverage ≥ 99.5 %; zero weakened assertions, zero new exemptions.
- A one-line "raise `minPct` 99 → N?" decision reaches the human at final review.

## Notes for the implementation planner

- Expected slicing (one test file per slice, module + test together): **(1)**
  evidence-pack main · **(2)** enforcement fault arms (table B) · **(3)** fail-open
  contracts (table C) · **(4–14)** one slice per long-tail file, dependency-free, so
  they build concurrently up to the five-slot cap. Declare `files:` per slice exactly;
  the coverage-baseline change belongs to a final slice that depends on all others.
- Fixture discipline: fault injection at the true boundary only (`t.mock.method` on
  `safeFs` / `fs` / `child_process`), never by stubbing the function under test.
- The uncovered-line table above was produced from the gate's own coverage report;
  re-derive it at Step 9 PREPARE — counts move with every commit.

## Decisions Taken Under Ambiguity

1. **Fail-open arms are asserted, not changed.** Whether `guard-files.js` should
   fail closed is the human's decision; this plan makes the current behaviour a
   stated contract so a change to it is visible.
2. **No deletion of dead ranges.** A range that turns out unreachable is reported;
   deletion needs its own plan and the reachability fence's baseline update.
3. **The floor raise is a decision, not a step.** Ratchets are raised by the human.
