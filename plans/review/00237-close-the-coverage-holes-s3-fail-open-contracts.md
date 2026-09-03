---
iron_loop_verdict: true
title: "The fail-open arms become a stated contract — exit 0 and the documented line"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/fail-open-contracts.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.521Z
gate_crossed: implementation → todo
---

# The fail-open arms become a stated contract

**Scope (one line):** force the documented fault in each fail-OPEN arm and assert exit 0 plus the
exact stderr line — the design is the human's and is unchanged; the defect is that the documented
behaviour is unasserted and could silently change.

## Implementation Details

### The arms, as the planner read them this session

| # | file | lines | site | documented behaviour |
|---|---|---|---|---|
| 1 | `src/hooks/guard-files.js` | 129-133 | `main()`'s outer catch | stderr `[CTOC] guard-files error (failing open): <message>` then `process.exit(0)` |
| 2 | `src/hooks/UserPromptSubmit.js` | 60-64 | `run()`'s catch | stderr `[CTOC] UserPromptSubmit routing-reminder error (failing silent): <message>`, exit code 0, **nothing on stdout** |
| 3 | `src/hooks/PreToolUse.Write.js` | 452-456 | `main()`'s collision-check catch | stderr `[CTOC] plan-number collision check faulted (failing open, write ALLOWED): <message>` |
| 4 | `src/hooks/PreToolUse.Write.js` | 445-447 | the `unknown` verdict | stderr `plan-number collision check: could not read plans/ — write ALLOWED WITHOUT a collision check` |
| 5 | `src/hooks/PreToolUse.Write.js` | 448-451 | the escape-phrase bypass | the bypass is recorded to the advisory log |
| 6 | `src/hooks/PreToolUse.Write.js` | 326-328 | `detectEscape`'s catch | `null` — an unreadable transcript is "no escape phrase", never an escape |

Read in full this session: `src/hooks/guard-files.js` (144 lines),
`src/hooks/UserPromptSubmit.js` (71 lines), `src/hooks/PreToolUse.Write.js` lines 220-340 and
340-470, and `tests/pretooluse-write-coverage.test.js` in full.

**Three ranges in `PreToolUse.Write.js` are already classified as defensively unreachable by
that existing test file's own header, with reasons: 249-250, 397-398, 424-425.** Do not chase
them and do not fabricate a path to them. Name them in the new file's header as category (c),
citing the existing header's reasoning, and leave them.

### Why each arm needs the seam it needs

- **`guard-files.js` `main()` is not exported** and nothing inside its `try` throws on any
  ordinary payload (`readStdinJson` and `getTarget` have their own guards). The only reachable
  thrower is `emitDeny`, on the block path. So: spawn the hook as a real child with a
  `--require` preload that seeds `require.cache` for the resolved
  `src/lib/hook-deny-signal.js` with an `emitDeny` that throws, and feed a payload whose target
  matches a protected pattern:
  ```
  spawnSync(process.execPath, ['--require', preload, GUARD_FILES],
            { input: JSON.stringify({ tool_input: { file_path: '.env' } }), encoding: 'utf8' })
  ```
  `--require` runs before the main module, so `guard-files.js` still runs as `require.main` and
  the coverage is attributed to the real file. Assert exit 0 **and** that stderr contains
  `guard-files error (failing open)`. The exit code alone proves nothing here — the ordinary
  deny path also exits 0 — so the stderr line is the load-bearing assertion.
  Use a fixture-safe secret-shaped target: `.env` is a filename, not a secret value. Never put a
  real or realistic credential in a fixture.
- **`UserPromptSubmit.js` `run()` IS exported** and the module holds `reminder` from a
  module-level `require`. The property is looked up at call time (`reminder.buildReminder`), so
  the in-process seam is:
  `t.mock.method(require('../src/lib/ctoc-routing-reminder'), 'buildReminder', () => { throw new Error('injected'); })`
  then `run({ prompt: 'x', session_id: 's' })`. Capture `process.stderr.write` and
  `process.stdout.write`, and save/restore `process.exitCode` around the call (the module exits
  via `requestExit(0)`, which sets `process.exitCode` and returns — it must not leave the test
  runner with a non-zero code). Assert: the stderr line, `process.exitCode === 0`, and
  **nothing written to stdout** — a routing reminder that leaks a fault into the model's context
  would be a different defect.
- **`PreToolUse.Write.js` arms 3-5** live inside `main()`, which reads fd 0 and can exit, so they
  are subprocess cases. `main()` IS exported, so the wrapper-script pattern already used at the
  bottom of `tests/pretooluse-write-coverage.test.js` applies unchanged: a temp wrapper that
  seeds `require.cache` (or patches `Module._load`) and then calls
  `require(WRITE_HOOK).main()`.
  - Arm 3: seed `src/lib/hook-deny-signal.js` with a throwing `emitDeny` and supply a payload
    that genuinely collides (a plan write whose number is already taken in the fixture project).
    The throw lands in the catch at 452. Assert stderr contains
    `plan-number collision check faulted (failing open, write ALLOWED)` and that the process
    still delegates (exit 0 in a non-CTOC cwd, as the existing malformed-stdin case does).
  - Arm 4: make `checkPlanWriteCollision` report `unknown`. Read
    `src/lib/plan-numbering.js` at PREPARE to find the real `unknown` cause (an unreadable
    `plans/`). Prefer a cause that does not depend on filesystem permission bits; if the only
    cause is permission-gated, this case must announce a **LOUD skip with a printed reason** on
    Windows and as root, following `tests/stale-scan-says-when-it-could-not-look.test.js`, and
    the range is then category (b) in those environments — say so in the header.
  - Arm 5: a colliding payload plus a `transcript_path` whose content contains an escape phrase
    the user typed. Assert the write is allowed and the advisory log records the bypass.
- **Arm 6** (`detectEscape`'s catch) needs no mock: give the payload a `transcript_path` pointing
  at a **directory**, so `safeFs.readFileSync` throws `EISDIR`. Reach it through
  `evaluateCollision` if that function is exported (confirm at PREPARE); otherwise fold it into
  arm 3's subprocess case and assert the collision still DENIES — an unreadable transcript must
  never be read as an escape. That direction is the mutation that matters.

### Wiring — the live call sites

No module and no export is added. The new test file is reached by the gated suite (`npm test` →
`src/scripts/test-gate.js`). All three hooks are registered in `.claude-plugin/hooks.json` and
are run by the Claude Code harness — they are live entry points already.

### Security review

- `.env` as a *filename* in a fixture payload is not a secret; no fixture contains a credential,
  real or realistic (push protection rejects realistic provider formats, and a fixture never
  needs one).
- No command string or transcript content reaches an assertion message.
- Preloads and wrappers live under `os.tmpdir()` and are removed in `after`; `require.cache`
  edits are saved and restored; `t.mock.method` restores itself.
- Every child is spawned with an argument array and no shell.

## Test Plan (TDD-Red first)

One `describe` per hook; one `it` per arm, named for the arm and the contract:
`guard-files: an emitDeny fault exits 0 AND says "failing open" on stderr (a silent fail-open is indistinguishable from a working guard)`.

RED before the change: arms 1-6 all sit on uncovered lines today. Any case GREEN on the first
run means an existing test already reaches it and the range map is stale — account for it at
Step 11, never bank it.

Mutation intent per case:
- arm 1: deleting the stderr write, or exiting non-zero, reds the case.
- arm 2: writing the fault to stdout, or leaving a non-zero exit code, reds the case.
- arm 3: turning the fail-open catch into a block reds the case.
- arm 4: reporting "no collision found" instead of "could not check" reds the case — that is the
  false-green shape this repository fences.
- arm 6: treating an unreadable transcript as an escape reds the case.

## Decisions Taken Under Ambiguity

1. **A new file, `tests/fail-open-contracts.test.js`, rather than extending three existing
   files.** The parent plan listed `tests/guard-files-coverage.test.js`, which already exists.
   Three fail-open arms across three hooks are ONE contract; splitting them across three files
   would hide it, and editing three existing files risks disturbing assertions this slice must
   not weaken. The existing files are left untouched.
2. **No source file is declared in `files:`.** No source change is intended. A case that exposes
   a real defect goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   so the human sees it — never a quiet edit.
3. **The fail-open design is asserted, not changed.** Whether `guard-files.js` should fail closed
   is the human's decision (parent plan, Decision 1). This slice makes the current behaviour a
   stated contract so a change to it becomes visible.
4. **A permission-gated case skips LOUDLY or is not written at all.** A test that silently
   no-ops is itself a check reporting a verdict it never earned.

## Execution Plan

### Step 8: TEST
Write `tests/fail-open-contracts.test.js` with the six named cases. Run
`node --test tests/fail-open-contracts.test.js` and record each as RED with the reason.

### Step 9: PREPARE
Re-derive the uncovered ranges from the gate's report. Read `src/lib/plan-numbering.js` for the
real `unknown` cause (arm 4), confirm whether `evaluateCollision` is exported (arm 6), and
re-read the wrapper-script helper at the bottom of `tests/pretooluse-write-coverage.test.js` to
reuse its shape without modifying that file.

### Step 10: IMPLEMENT
- Sub-item 1: the in-process `UserPromptSubmit` case.
- Sub-item 2: the `guard-files` preload case.
- Sub-item 3: the `PreToolUse.Write` wrapper cases (arms 3-6).
- Sub-item 4: the header naming the three ranges left as defensively unreachable (249-250,
  397-398, 424-425), citing the existing test file's reasoning, plus any range left as
  permission-gated with its reason.

### Step 11: REVIEW
No existing test file touched; no assertion weakened; no baseline or exemption added; every mock
at a real boundary and restored; every temporary file removed. Account for every case that was
GREEN before implementation.

### Step 12: OPTIMIZE
One shared spawn helper and one shared stderr-capture helper. No sleeps, no retries.

### Step 13: SECURE
No credential-shaped fixture value; no transcript or command text in an assertion message; no
shell; nothing written outside `os.tmpdir()`.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason for a
permission-gated case), coverage at or above the floor in `.ctoc/coverage-baseline.json`. Record
the new percentages for the three hooks.

### Step 15: DOCUMENT
The header states plainly: these arms fail OPEN by the human's design; the tests do not change
that, they make it a contract, so a future change to it fails a named test instead of passing
silently.

### Step 16: FINAL-REVIEW
Report: each arm now pinned; any arm that could only be reached in a permission-gated
environment (named, with the environment); and the contradictory comment about child-process
coverage attribution in `tests/pretooluse-write-coverage.test.js` if slice 1 has not already
reported it.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — `tests/fail-open-contracts.test.js`, six named cases, one per documented fail-open arm.
- [x] Test error conditions — every case IS an error condition: a throwing `emitDeny`, a throwing `buildReminder`, an unreadable stage directory, an unreadable transcript.
- [x] Run tests - expect RED (failing) — see "Red provenance" under `## Execution Record`. All six were GREEN on the first run, which is the correct result for a slice that changes no source and pins behaviour that already exists; they are guards, not banked reds. Red provenance came from MUTATION against a copied hook tree under the system temp directory: seven mutations, each reddening exactly its own case and no other, with the real sources hash-verified untouched before and after.

### Step 9: PREPARE
- [x] Install dependencies if needed — none; `node:test`, `node:assert/strict`, `node:child_process` only.
- [x] Check prerequisites — every path the plan names verified on disk. `evaluateCollision` IS exported (`src/hooks/PreToolUse.Write.js` module.exports), so arm 6 is driven in-process. The `unknown` cause was read in `src/lib/plan-numbering.js`: `scanNumberedPlans` THROWS when a PRESENT stage directory cannot be read, and `checkPlanWriteCollision` converts that throw to `{ unknown: true }`.
- [x] Verify dev environment ready — ranges re-derived from the gate's own printed table (see `## Verification Evidence`), not from the plan's table.
- [x] Create directories/config if needed — none; all fixtures are created and removed inside the tests.

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — the four sub-items: the in-process `UserPromptSubmit` case; the `guard-files` preload case; the `PreToolUse.Write` subprocess cases (arms 3-5) plus the in-process arm 6; and the header naming the three defensively-unreachable ranges.
- [x] Add error handling — every fixture is removed in a `finally`/`after`; every stream patch and `process.exitCode` is saved and restored; `t.mock.method` restores itself.
- [x] Wire up integration points — no module and no export added. The file is reached by the gated suite (`npm test` → `src/scripts/test-gate.js`); all three hooks are registered in `.claude-plugin/hooks.json` and are live entry points already.

### Step 11: REVIEW
- [x] Self-review all new code — no existing test file touched, no assertion weakened, no baseline or exemption entry added, no source file changed.
- [x] Verify integration points work together — the whole suite runs green with the new file in place.
- [x] Check error handling completeness — every case that was green before implementation is accounted for above and in `## Execution Record`; none is banked. One green-first case DID reveal something and is recorded as a finding: the first `unknown` fixture made the TARGET path unresolvable and was refused by a different, fail-CLOSED guard — see `## Execution Record`, finding 2.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one shared spawn helper (`runHook`), one shared throwing-`emitDeny` preload writer, one shared colliding-project fixture builder.
- [x] Optimize critical paths — no sleeps, no retries, no polling; the whole file runs in about 130 ms.
- [x] Simplify complex code — arm 6 is driven through the exported `evaluateCollision` in-process rather than through a fourth subprocess.

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture path is built with `path.join` under `os.tmpdir()`, realpath-resolved.
- [x] Sanitize outputs — no transcript content and no command string reaches an assertion message.
- [x] No secrets in code — `.env` appears only as a FILE NAME in a payload; no fixture holds a credential, real or realistic.
- [x] Safe file operations — every child is spawned as an argument array through `process.execPath` with no shell; nothing is written outside `os.tmpdir()`; nothing touches the network, `.ctoc/approvals`, `.ctoc/state/verify` or `.ctoc/streaming` of this repository.

### Step 14: VERIFY
- [x] Run lint + type check — run by `npm test` as the gate runs them.
- [x] Run ALL tests (TDD Green) — `npm test`, exit 0, `[CTOC test-gate] PASS`.
- [x] Check coverage >= 80% — measured 99.6% against the enforced floor of 99 in `.ctoc/coverage-baseline.json`.
- [x] 0 skipped, 0 flaky tests — `skipped 0, failed 0`. No case in this file is permission-gated, so nothing skips on any platform.

### Step 15: DOCUMENT
- [x] Update relevant documentation — `CLAUDE.md`'s test-file count line updated 536 → 537 (both occurrences), matching `computeDocCounts(root).testFiles`.
- [x] Add JSDoc comments to new functions — the file header states plainly that these arms fail OPEN by the human's design, that the tests do not change that, and that a future change to it now fails a named test instead of passing silently; every helper carries a comment saying what it does and why.
- [x] Update CHANGELOG if needed — not needed; no user-visible behaviour changed.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly.
- [x] All quality checks passed.
- [x] Manual verification if needed — the mutation experiment IS the manual verification; its full result is under `## Execution Record`.
- [x] Ready for human review.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

### What landed

One new file, `tests/fail-open-contracts.test.js` (six cases), plus the test-file
count line in `CLAUDE.md` (536 → 537). No source file was changed; none was declared.

### Red provenance — the mutation experiment

All six cases were GREEN on the first run. That is the correct outcome for a slice
whose whole purpose is to pin behaviour that already exists and must not change, so
none of them is banked as a red. Their load-bearingness was established instead by
mutation, against a COPY of `src/` under the system temp directory (the repository's
own sources were hash-verified identical before and after — `guard-files.js`,
`UserPromptSubmit.js` and `PreToolUse.Write.js` all matched their pre-experiment
SHA-256). Seven mutations were applied one at a time; each reddened exactly its own
case and left the other five green:

| mutation | case reddened |
|---|---|
| `guard-files.js` catch exits 1 instead of 0 | arm 1 |
| `guard-files.js` catch's stderr line deleted | arm 1 |
| `UserPromptSubmit.js` writes the fault to stdout instead of stderr | arm 2 |
| `UserPromptSubmit.js` calls `requestExit(1)` | arm 2 |
| `PreToolUse.Write.js` collision-fault catch blocks (exit 2) instead of failing open | arm 3 |
| `PreToolUse.Write.js` `unknown` branch says "found no collision" instead of "could not read" | arm 4 |
| `PreToolUse.Write.js` escape branch no longer calls `appendLog` | arm 5 |
| `PreToolUse.Write.js` `detectEscape` catch returns an escape phrase instead of `null` | arm 6 |

### Findings for the human

1. **The plan's stated reason for asserting the stderr line is out of date, and the
   conclusion it supports is still right.** The plan says of `guard-files.js`: "The
   exit code alone proves nothing here — the ordinary deny path also exits 0."
   `emitDeny` in `src/lib/hook-deny-signal.js` exits with `HARNESS_BLOCK_EXIT_CODE`
   (2), not 0, so the exit code alone does in fact separate the two paths today. The
   stderr assertion is kept anyway and is the stronger of the two: mutation shows that
   deleting the stderr line — a silent fail-open — reddens the case while the exit code
   stays 0. Nothing was weakened by this; both assertions are present.

2. **A write whose target path cannot be resolved is refused with a reason that names
   the approval ledger, which has nothing to do with the target.** Found while building
   the `unknown` fixture. Making `plans/todo` a regular file (so the stage scan faults)
   also makes the target `plans/todo/00042-….md` unresolvable; `resolveExisting` in
   `src/lib/real-path-confinement.js` cannot see through `ENOTDIR` and returns
   `resolve-failed`, so `resolvesUnder` returns `true` (its documented fail-CLOSED
   direction), and `isProtectedLedgerPath` in `src/hooks/PreToolUse.Edit.js` then denies
   with "ledger is human-approval provenance; agent writes to .ctoc/approvals/ are
   denied". The DENY is the documented, correct fail-closed behaviour. The MESSAGE is
   not: it tells the human their plan write was a forbidden write to the approval
   ledger. This is a fail-CLOSED arm, so it is outside this slice's declared scope; it
   is recorded here for whoever takes the fail-closed arms. The fixture was changed to
   fault a DIFFERENT stage directory (`plans/review`), isolating the arm under test.

3. **The contradiction inside `tests/pretooluse-write-coverage.test.js` is still there**
   (the parent plan's finding 4): its header says a spawned child's coverage IS merged
   back, and the comment above its own subprocess block says a child's lines are NOT
   attributed upward. This slice's measurement settles it in favour of the header —
   `guard-files.js` and the `PreToolUse.Write.js` `main()` arms reached 100% and 98.78%
   respectively on the strength of spawned children alone. Reported, not fixed: that
   file is not declared here and was not touched.

### Decisions Taken Under Ambiguity

1. **The `unknown` verdict is forced by an `ENOTDIR`, not by a permission bit.** The
   plan allowed a permission-gated case with a loud skip. A regular file where a stage
   directory belongs produces the same fault at the same boundary, as an ordinary user
   and on Windows, so the case runs everywhere and NOTHING in this file skips.

2. **Arm 6 is driven in-process through the exported `evaluateCollision`** rather than
   folded into arm 3's subprocess. `evaluateCollision` is exported, so the assertion
   that matters — an unreadable transcript still DENIES — is made directly on the
   verdict rather than inferred from a process's exit code.

3. **The before-and-after coverage delta for the three hooks is not claimed.** The
   after figures below were measured by this slice's own gate run. The claim that these
   arms were uncovered beforehand comes from the parent plan's 2026-08-31 measurement
   and was not independently re-measured here; it is cited, not asserted.

## Verification Evidence

`npm test` from the repository root, captured to a file, exit status 0. Its last lines:

```
[CTOC test-gate] coverage 99.6% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

The three hooks, from the gate's own coverage table (line % · branch % · function % ·
uncovered lines):

```
guard-files.js         | 100.00 | 94.12 | 100.00 |
UserPromptSubmit.js    | 100.00 | 75.00 | 100.00 |
PreToolUse.Write.js    |  98.78 | 87.63 | 100.00 | 249-250 397-398 424-425
```

The only lines still uncovered in `PreToolUse.Write.js` are exactly the three ranges
this file's header names as defensively unreachable, citing
`tests/pretooluse-write-coverage.test.js`'s own reasoning: the `typeof checkDuplicate
!== 'function'` return, `readStdinRaw()`'s catch, and the catch around `await
run(parsed)`. No range was fabricated a path to and none was deleted.
