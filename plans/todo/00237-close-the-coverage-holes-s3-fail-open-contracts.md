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
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
