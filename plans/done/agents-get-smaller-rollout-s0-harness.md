---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 0: the compaction harness serves every agent, not only the pre-mortem critic"
type: implementation
created: 2026-10-06
priority: high
effort: medium
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot
files:
  - tests/compaction-eval/prepare.js
  - tests/compaction-eval/score.js
  - tests/compaction-eval/inventory-checks.js
  - tests/compaction-eval.test.js
  - tests/premortem-critic-rule-inventory.test.js
approved_by: human
approved_at: 2026-10-06T18:35:46.034Z
gate_crossed: review → done
---

# Agents get smaller — slice 0: the compaction harness serves every agent

## Problem statement

The pilot's harness was built for one agent. `score.js` calls `checkLensContract` on every run
(the pre-mortem critic's payload, its six escalation reasons and its `stories_generated` field);
`prepare.js` writes one brief shape (the gate-critique lens brief); every run happens in the
repository and only the final message is kept; and the ten inventory checks live inside
`tests/premortem-critic-rule-inventory.test.js` (**read**, all four files). The eleven agents of
the rollout need more: ten answer in another shape, four write files (`gate-critic`,
`implementation-planner`, `product-owner`, `vision-decomposer`), `hallucination-detector` reads its
method file from its working directory, three answer in YAML (`agent-critic`,
`hallucination-detector`, `llm-security-tester`), and two dispatch other agents (`cto-chief`,
`quality-gate-runner`). If each agent slice changed `score.js` and `prepare.js` itself, the eleven
slices would edit the same files and could not be built in parallel. This slice makes the change
once. Fixed means: the pilot's own checks and runs behave exactly as before, and any agent slice can
bring its brief, its contract adapter, its fixtures and its run mode as data and one small module,
without touching the harness.

## Technical approach

### 1. `tests/compaction-eval/inventory-checks.js` (new)

`defineInventoryTests({ test, label, inventoryPath, orderFloor })` registers the pilot's ten checks
— the same assertions, the same order, each test name prefixed with `label` — for one inventory
file. It requires `./units`, `node:assert/strict`, `node:fs`, `node:path`, `node:crypto`; it reads
nothing at load time (the checks read when they run). It throws at registration when `orderFloor`
is not a positive integer or `inventoryPath` is not a string, so a caller that forgets the floor
fails loudly.

`tests/premortem-critic-rule-inventory.test.js` becomes a caller: the same inventory path, and
`ORDER_FLOOR = 401` stays written in that file (the floor's second place, which is the point of
it). Its header comment stays.

### 2. `tests/compaction-eval/prepare.js`

a. **Per-fixture brief.** When a fixture carries `brief` (text) or `brief_file` (a path relative to
   the expectations file, outside every fixture project), that text is the brief, used verbatim
   after replacing every `{project_root}` with the fixture's project root. With neither, the lens
   brief exactly as today.
b. **Per-fixture folder.** `fx.dir`, relative to the repository root, overrides
   `exp.fixtures_dir` for one fixture, so a slice can reuse another agent's committed fixture,
   read only, without copying it.
c. **Scratch mode.** With `exp.run_in: "scratch"`, `--scratch <dir>` is required and is refused
   when its real path is inside the repository. For each dispatch, the fixture project is copied to
   `<scratch>/<fixture>__<version>/`; each entry of `exp.overlay` (`{ "path": …, "original": …,
   "compacted": … }`, each source read like `--original`: a file or `<commit>:<path>`) is written at
   `path` inside that copy for that version; that version's evaluation agent is written into the
   copy's `.claude/agents/`; and the brief's project root is `.`. A symbolic link inside a fixture
   is refused, not followed.
d. **The run plan carries the exact command.** Each dispatch gets `cwd` (scratch mode only),
   `argv` = `["-p", "--agent", <evaluation name>, "--output-format", "json", ...exp.extra_args,
   <brief>]`, run as an argument list without a shell, and `raw` = `<fixture>__<version>.json`, the
   file the session writes the command's standard output into. The pilot's two trivial-brief token
   readings stay in the run plan as the pilot wrote them; the agent slices do not run them (the
   index, decision 11).
e. **Cleaning.** `--clean --scratch <dir>` also removes the `<fixture>__<version>` copies the run
   plan names, and nothing else.

Nothing in `prepare.js` or `score.js` assumes a number of fixtures: the pilot's six and the
rollout's three are both just the list in the expectations file.

### 3. `tests/compaction-eval/score.js`

a. **Contract adapters.** `exp.contract` is `"lens"` (the default; behaviour unchanged) or a path,
   relative to the expectations file, to a module exporting `check(run, fx, exp)` that returns
   `{ valid, errors, findings, payload }`. `run` is `{ output, files }`. `findings` use the
   harness's vocabulary (`id`, `severity` of `critical`, `important` or `normal`, `evidence`), so
   `evaluate()`, the pass rule and the rerun rule do not change. `payload` is what the `fields`
   matchers read; it defaults to the parsed final message. The findings-and-options half of
   `checkLensContract` is exported as `checkLensFindings(p, expect)` for the two lens adapters;
   `checkLensContract` keeps its exact behaviour by calling it.
b. **Captured files.** `collectHeadless` takes `--run-plan <file>`. For a dispatch with `cwd`,
   every regular file created or changed under `cwd` — compared with its fixture and overlays,
   `.claude/` excluded — is stored in the run as `files: { "<path relative to cwd>": "<text>" }`. A
   file above 256 kilobytes is stored as `{ "truncated": true, "bytes": <n> }`, never dropped; a run
   above one megabyte in total makes collection fail with a message naming the run; symbolic links
   and paths outside `cwd` are refused. The committed run can then be scored again after the scratch
   copy is gone.
c. **Two more matchers.** `id_prefix` (a finding's id starts with the given text) and
   `fields_contain` (the list or text at a dotted path of `payload` contains the given text).
d. **A narrow YAML reader.** `parseYamlSubset(text)` reads block mappings, block sequences
   (including sequences of mappings), plain, single-quoted and double-quoted scalars, literal block
   scalars (`|`), flow sequences of scalars and `#` comments, from the whole text or from exactly
   one fenced block. Anything else — anchors, aliases, tags, flow mappings, a second document, a
   tab in indentation — returns `null`, never a partial object, so an answer it cannot read counts
   as invalid in both versions alike.
e. Exit codes, the summary file and the low-power note are unchanged.

### 4. Things to verify at Step 9 (by the session, which holds the `claude` command)

- That `claude -p --agent <name>` run with its working directory at a scratch copy finds the
  evaluation agent in that copy's `.claude/agents/`. If it does not, `argv` uses whichever option
  `claude --help` documents for defining an agent on the command line, and the choice is recorded.
- The exact option that removes the agent-dispatch tool in print mode (believed
  `--disallowedTools Task`), read from `claude --help`.
- That `--output-format json` reports `result`, `usage`, `duration_ms` and `total_cost_usd`
  (`collectHeadless` already reads these).
- One trivial-brief run in scratch mode, end to end: prepare, run, collect, score. Recorded with its
  tokens. This is the only run this slice spends.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| `defineInventoryTests` | `tests/premortem-critic-rule-inventory.test.js` now; each agent slice's `tests/<agent>-compaction.test.js` later | `npm test` |
| the new `prepare.js` and `score.js` behaviour | `tests/compaction-eval.test.js`; the session at Step 14 of every agent slice, by the commands in `prepare.js`'s header | `npm test`; the sanctioned script runs named in that header |

### Security review

- No shell anywhere: `git show` and the run plan's `argv` are argument lists.
- The scratch directory is refused inside the repository, so a run never writes into it or meets
  its edit hooks; writes stay under the scratch directory, the agents directory and the eval
  directory, each checked by real path.
- Symbolic links in fixtures and in captured files are refused; captured sizes are capped and a cap
  breach fails loudly.
- A captured file is committed with the raw runs; each agent slice's Step 13 checks that its
  fixtures hold no credential-shaped string and no path to a real file outside the repository.

## Acceptance criteria

1. `tests/premortem-critic-rule-inventory.test.js` passes its ten checks through
   `defineInventoryTests`, with `ORDER_FLOOR = 401` still written in it.
2. An expectations file with none of the new keys yields a run plan identical to today's apart from
   the added `argv` and `raw` fields, and identical scores.
3. Each new behaviour has a test in `tests/compaction-eval.test.js` that fails without it: the
   per-fixture brief and its placeholder, `fx.dir`, scratch copies with overlays and the agent
   copy, the refusal of a scratch directory inside the repository, the refusal of a symbolic link,
   `argv` and `raw` in the run plan, a contract adapter's findings feeding the pass rule on a
   three-fixture expectations file, captured files with the truncation record and the one-megabyte
   failure, `id_prefix`, `fields_contain`, `parseYamlSubset` on the three answer shapes the rollout
   needs (a dispatch-protocol `response:` block, an `agent-critic` `critique:` block, a fenced
   block) and its `null` on each refused construct, and `defineInventoryTests` refusing a missing
   floor.
4. The Step 9 run in scratch mode produced a scored run file with its tokens and duration.
5. `npm test` passes (fail 0, skipped 0, coverage at or above the floor in
   `.ctoc/coverage-baseline.json`); the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **Five files in one slice**, above the usual one to three: two modules with their tests
   (`prepare.js` and `score.js` with `tests/compaction-eval.test.js`; `inventory-checks.js` with the
   pilot's inventory test as its caller and test) and they serve one purpose. A second harness slice
   would add a merge point every agent slice waits on, and nothing else.
2. **Adapters return findings in the harness's own vocabulary**, so the pilot's pass rule, rerun
   rule and matchers serve every agent unchanged; an agent that writes files reports what it did as
   finding ids.
3. **The YAML reader is narrow and fails closed** rather than a declared dependency (see the
   index, decision 6).
4. **The order floor stays in each test file**, not in the inventory JSON, so lowering it takes an
   edit in a second place.
5. **Compaction goes first, before the approved "improved three times" slices on the same agents**
   (CTO Chief, 2026-10-06; the index, decision 10). It concerns the agent slices; this slice touches
   no agent and is unaffected.
6. **The smoke check is three fixtures per agent, one run per version, six headless runs per
   agent** (CTO Chief, 2026-10-06; the index, decision 11). The harness takes any fixture list, so
   nothing here changes for it beyond testing the pass rule on a three-fixture file; the inventory
   and the side-by-side review stay the main guard.

## Execution Plan

### Step 8: TEST
- [x] Confirm the pilot is done; its harness files carry no uncommitted change.
- [x] Write the new cases in `tests/compaction-eval.test.js` (acceptance criterion 3) and rewrite `tests/premortem-critic-rule-inventory.test.js` as a caller of `defineInventoryTests`.
- [x] Run both; expect RED: `inventory-checks.js` missing, the new cases failing; record the failing lines.

### Step 9: PREPARE
- [x] The session verifies the four items under "Things to verify at Step 9" and records each result in this plan.
- [x] Re-read `units.js`, `prepare.js`, `score.js` as they stand after the pilot; anything the pilot changed after this plan was written is folded in or raised as a scope-growth request.

### Step 10: IMPLEMENT
- [x] `inventory-checks.js`; the pilot's inventory test passes ten of ten.
- [x] `prepare.js` changes a to e; `score.js` changes a to e; `tests/compaction-eval.test.js` GREEN.

### Step 11: REVIEW
- [x] Dispatch `iron-loop-critic` on the diff: unchanged behaviour for the pilot's files, every new path tested, no parser default that reads as success.

### Step 12: OPTIMIZE
- [x] Remove any duplication between `checkLensContract` and `checkLensFindings`.

### Step 13: SECURE
- [x] Dispatch `security-scanner` on the diff: no shell, real-path checks on every write, symbolic links refused, size caps.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [x] The Step 9 scratch-mode run is re-scored with the final `score.js`.

### Step 15: DOCUMENT
- [x] The protocol in `prepare.js`'s header gains the scratch mode, `argv`, `raw` and `--run-plan`; JSDoc on every new export.

### Step 16: FINAL-REVIEW
- [x] Dispatch `iron-loop-critic` against the acceptance criteria; hand the result to the owner for the OK to call it done.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Execution Record

Built 2026-10-06 by the iron-loop executor, inside the five declared files plus the Step 9 evidence
under `.ctoc/eval/harness-probe/` (edit-whitelisted). No git operation was made.

**Step 8 (red).** The pilot is in `plans/done/`; its four harness files had no uncommitted change.
First run of the two test files: both failed at load, `Cannot find module
'./compaction-eval/inventory-checks'` — every new case red with them.

**Step 9 (verified by running, `claude` 2.1.291).**
1. `claude -p --agent <name>` run with its working directory at a scratch copy finds the evaluation
   agent in that copy's `.claude/agents/`: the probe agent's marker word opened both replies. No
   `--agents` fallback was needed.
2. `--disallowedTools <tools...>` is the option (read from `claude --help`); with `Task` the agent
   itself reported it had no tool for starting subagents. The option is VARIADIC, so a brief placed
   after it would be swallowed as a tool name: `argv` puts `--` before the brief, and the run proved
   the brief arrived.
3. `--output-format json` reports `result`, `usage`, `duration_ms` and `total_cost_usd`.
4. The scratch-mode run, end to end (prepare, run, collect with `--run-plan`, score with an adapter):
   one fixture (the pilot's `clean-measurable-criteria`, reused read-only through `dir`), both
   arms, `--permission-mode acceptEdits --disallowedTools Task`. Verdict PASS; the written
   `probe.txt` was captured in both run files. Original 12,232 tokens, 5,343 ms, $0.047; compacted
   12,178 tokens, 5,169 ms, $0.047. Raw runs: `.ctoc/eval/harness-probe/2026-10-06/`. A first
   attempt (two more runs, about $0.15) showed Claude Code appending an MCP-authorisation notice to
   `result`, which would make every JSON-only answer invalid; `--strict-mcp-config` is now a fixed
   harness option and the re-run's result was clean. Total spent: four trivial runs.

**Steps 10 to 15.** `inventory-checks.js` registers the pilot's ten checks; the pilot's inventory
passes 10 of 10 through it with `ORDER_FLOOR = 401` still in its file. `prepare.js` changes a to e
and `score.js` changes a to e as planned. Acceptance criterion 2 was checked on the pilot's real
data: the regenerated run plan equals the committed one once `argv` and `raw` are removed, and
re-scoring the committed pilot runs reproduces the committed `summary.json` exactly.
`npm test`: 12,199 tests, 0 failed, 0 skipped, coverage 99.9% (floor 99), gate PASS. `npm run
lint`: zero warnings. The Step 9 runs were re-scored with the final `score.js`: PASS.

**Dispatches.** The main session ran the Step 11 review (`iron-loop-critic`) and the Step 13
scan (`security-scanner`); their findings were fixed in the pass below. The main session also ran the
Step 16 final review (`iron-loop-critic` against the acceptance criteria); its findings were fixed
in the final-review pass below.

**Fix pass after the review and the security scan (2026-10-06).** Each fix had a test that was red
before it (19 red cases; the identical-argv strengthening passed at once, as the behaviour was
already right):
1. Both arms invalid no longer scores PASS: a row whose original is invalid with no valid rerun
   original has status `baseline-invalid`, and any such row makes the verdict INCOMPLETE (exit 4).
2. An empty or non-text `id_prefix` or `fields_contain` value throws (a harness bug, never a match).
3. Scratch work goes under `<scratch>/<agent>/` in both prepare and clean (run plan, copies, raw
   folder `<scratch>/<agent>/raw`), so parallel slices never collide; the header recipe says so.
4. A scratch-mode expectations file collected with `--headless` but no `--run-plan` is a usage
   error (exit 2).
5. Collection fails closed, naming the run and never the value, when the output or a captured file
   still holds the scratch path, the home path or the user name after stripping.
6. The scratch path is resolved (real path of its nearest existing parent plus the rest) and
   checked before anything is created; a scratch directory containing the repository is refused.
7. A contract adapter must resolve, by real path, inside the repository.
8. Overlay sources named in the expectations must resolve inside the repository (`<commit>:<path>`
   is inside by construction; `--original`/`--compacted` unchanged).
9. Capture checks a file's size before reading and records `{ truncated, bytes }` above 256 KiB
   without reading it; prepare now refuses a fixture file above 256 KiB, so an unchanged seeded
   file can never be mistaken for a large written one.
10. Collection refuses a raw folder inside the repository and any credential-shaped string (the
    repository's own `SECRET_PATTERNS` from `src/lib/secrets-scanner.js`, with their context
    windows); `--runs` must be under `.ctoc/eval/` (exit 2). Checked against all 19 committed real
    runs: no false positive.
11. An uncaught harness error exits 5, never 1 (FAIL).
12. The probe's `expectations.json` and `adapter.js` sit beside its runs in
    `.ctoc/eval/harness-probe/2026-10-06/` with repository-relative paths; re-scored from them:
    PASS. They are the worked example the header points to.
13. The argv test compares the two arms' full argument lists, differing only in the agent name.

`npm test` after the pass: 12,213 tests, 0 failed, 0 skipped, coverage 99.9%, gate PASS; `npm run
lint`: zero warnings.

Self-review fixes made before the suite: a run plan for scratch mode would have carried absolute
paths into the repository (it is now written to `<scratch>/run-plan.json`); `summary.json`
recorded the expectations path verbatim (a path outside the repository is now recorded by base
name); an expectations file with no fixture scored PASS on nothing (now INCOMPLETE, exit 4); a
`brief_file` outside the repository and duplicate fixture names were accepted (both refused); the
three quote-scanning loops of the YAML reader were folded into one (Step 12).


**Final-review pass (2026-10-06).** Each fix test-first (three new tests, red before the fix):
1. Blocker: the transcript route wrote outputs without stripping or checking. `collectTranscripts`
   now strips the repository root (`process.cwd()` from the command line) and refuses a private
   path or a credential-shaped string before writing; `refuseUnsafe` now checks the SERIALIZED run
   on both routes, so captured file names are covered too (and a JSON-escaped path is still found).
2. `within` treats a child folder named `..x` as inside: `rel === '..' || rel.startsWith('..' + sep)`.
3. Stale comments updated: `<scratch>/<agent>/run-plan.json` in `prepare.js`; exit codes 0 to 5 in
   `score.js`'s header.
`node --test tests/compaction-eval.test.js`: 105 tests, 0 failed, 0 skipped; `npm run lint`: zero
warnings.

1. **`argv` carries three fixed options the plan's literal list did not**: `--settings
   {"disableAllHooks":true}` (the pilot's measured condition, named in the build brief),
   `--strict-mcp-config` (Step 9 finding above), and `--` before the brief (Step 9 item 2). Both
   arms get them, so the comparison is unchanged.
2. **In scratch mode the run plan lives in `<scratch>/<agent>/`**, not `.ctoc/eval/`, because its
   `cwd` values are absolute and can contain a user name. The token readings stay in every run plan.
3. **A run's capture compares sha256 against the seeded copy**, recorded per dispatch as `seeded`,
   so collection needs neither the fixture nor git. Deleted files are not recorded.
4. **The total cap is on the run file as written** (JSON above 1 MiB fails, naming the run).
5. **The YAML reader ignores prose around exactly one fenced block**, accepts the `|-` and `|+`
   chomping forms, types plain `true`/`false`, `null`/`~`, integers and decimals only, and refuses a
   `__proto__` key.
6. **`checkLensFindings` includes the `ref` and `lens` checks** (that is what its `expect` argument
   is for); `checkLensContract` adds the self-assessment and escalation checks on top.
7. **A baseline-invalid row makes the verdict INCOMPLETE even beside a confirmed failure on another
   row** (as the review asked: any such row); the row statuses still show the failure.
8. **The user-name check matches the name as a whole word**, so a short name inside an ordinary
   word does not fail a run; a path or a standalone mention does.

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
