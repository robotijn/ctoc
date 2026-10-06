---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 10: the quality gate runner, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: medium
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/testing/quality-gate-runner.md
  - tests/quality-gate-runner-compaction.test.js
  - tests/compaction-eval/quality-gate-runner/baseline-agent.md
  - tests/compaction-eval/quality-gate-runner/rule-inventory.json
  - tests/compaction-eval/quality-gate-runner/contract.js
  - tests/compaction-eval/quality-gate-runner/expectations.json
  - tests/compaction-eval/quality-gate-runner/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.337Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 10: the quality gate runner

## Problem statement

`agents/testing/quality-gate-runner.md` is 40,759 bytes and was dispatched 3 times in the seven
recorded weeks, all in September (**read**), about 0.4 a week. At the pilot's ratio the compaction
removes about 13,700 bytes, about 5,900 bytes or 2,000 tokens a week (**derived**). Much of the file
is worked command examples for languages and services, so the real saving may exceed the pilot's
ratio. Its method file, `skills/testing/quality-gate-runner/SKILL.md`, is not in this slice: the
frontmatter names it (`target_skill`), but the body never orders it read and no code under `src/`
reads `target_skill` (**read**). Fixed means: compacted by the rollout's method (the index), every
order kept and checked, at most its new ceiling, and no worse than the original on its smoke check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/quality-gate-runner/baseline-agent.md`.

### What leaves, and what stays (by heading, **read**; byte sizes per section are measured at Step 9)

- **The line between order and example for code blocks:** a command the agent is told to run, or a
  detection order written as code, is an order and stays; a sample of how some project might be
  configured (a workflow file, a `Makefile`, a hook, a coverage service's configuration) is an
  example.
- **Leaves:** the language-specific parallel scripts for TypeScript, Python, Go and Rust beyond the
  orders they carry, `### Quick Monorepo Commands`, the Playwright continuous-integration
  configuration, the pre-commit hook sample, the coverage-service configuration and the
  continuous-integration integration examples, the banner under `## CRITICAL: LOCAL FIRST, ALWAYS`
  (its rule stays), and every second statement of "run locally first".
- **Stays, every order:** the Role's safety and tool-permission sentences word for word, local
  first, the pre-push checklist, Phase 0 (detect the continuous-integration configuration and run its
  exact commands), the verification check, the parity checklist, the gate topology, Phases 1 and 2,
  the quality check matrix, Playwright detection and running orders, the Output Format and Failure
  Handling templates (output templates are orders), Integration with CTO-Chief, the coverage
  thresholds by mode, Red Lines word for word, the coverage quick reference, the shared searching
  rule and `## Honest status (shared rule)` word for word.

### Pins (read only)

| Pin | Where it is held |
|---|---|
| frontmatter byte for byte (`tools: Bash, Read, Grep, Glob, Task`, `target_skill`) | `tests/agent-tool-grants.test.js` |
| the safety sentences (`npx --no --`, the single `gh api` network use, no Write or Edit, never a "passes" not seen) | the fixed safety block shared across agents (the size audit, section 1) |
| honest status, discipline words, gate words, unexecutable orders, compliance claims, peer dispatch | the fences named in the index |

**A splitter detail to settle at Step 9.** The Output Format and Failure Handling templates hold
fenced blocks inside a fenced block. `units.js` pairs a fence with the next fence line, so the outer
block closes early and a heading inside the example may be reported as a section. The split is the
same for the baseline and the labelling, so the inventory stays consistent; Step 9 records which
headings come from inside an example, and `now_in` names the section the splitter reports.

### Size

Expected after: about 27,100 bytes at the pilot's ratio, likely less. `maxBytes` is the achieved
size and may only fall.

### Smoke check (three fixtures, six runs)

- **Mode:** scratch, and both versions run with the agent-dispatch tool removed (the index,
  decision 7). The `## Using Task Tool for True Parallelism` orders are then guarded by the inventory
  and the review only.
- **Fixtures:** small Node projects whose scripts use Node's built-in test runner and small local
  scripts only: nothing installed, no network.
- **Brief:** "Run the quality gate for the project at `.`." in the shape the CTO Chief's Step 14
  delegation uses (copied at Step 8 from `agents/coordinator/cto-chief.md`).
- **Contract adapter (`contract.js`):** valid when the final message carries
  `## Quality Gate Results`, a `**Status**:` line reading PASS or FAIL, and a `### Verdict`
  (copied from the baseline's Output Format at Step 8). Findings: each failed check — a
  `#### <n>. <check> - FAILED` heading or a failing row of the summary table — as important, with
  the check's name and details as evidence; `status-fail` (important) when Status is FAIL.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `continuous-integration-runs-a-failing-typecheck` | `npm test` passes; the workflow file also runs `npm run typecheck`, which fails | Phase 0: run exactly what continuous integration runs, whose surrounding examples are cut | a failed check whose evidence contains `typecheck` or `Type` |
| 2 | `backend-test-fails-in-monorepo` | `frontend/` and `backend/` packages; one backend test fails | Monorepo Support, mostly example scripts that are cut | a failed check whose evidence contains `backend` |
| 3 | `clean-single-package` | tests, lint and typecheck scripts that all pass | — | clean: Status PASS |

**The clean fixture is verified before any run** (Step 9): every script in it is run once by hand and
exits zero with no warning, and `iron-loop-critic` reads it for any defect of severity important or
higher that a quality gate should catch; whatever is found is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted runner | the CTO Chief's Step 14 VERIFY delegation in `agents/coordinator/cto-chief.md` | a plan's build under the Iron Loop |
| `contract.js` | `tests/quality-gate-runner-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

The runner's shell rules (no download to run, the one `gh api` call, never write through Bash) are
its trust boundary; each is in the inventory with anchors. Fixture scripts touch only their own
folder; runs happen in a scratch copy outside the repository.

### Conflicts with other plans

- This slice builds before `plans/todo/00353-…-s93-quality-gate-runner.md` (decision 4 below); that
  slice must be re-planned against the compacted text, inside this file's `maxBytes` and keeping
  every inventoried anchor.
- `plans/implementation/agent-tool-grants-s11-removals-held.md` (not approved) would change the
  frontmatter grant, which the inventory holds as a `kept` unit; if it builds after this slice it
  must also update the inventory. Both orders work, and if it builds first the baseline is its
  result.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/quality-gate-runner-compaction.test.js` passes the ten inventory checks and the adapter's
   cases; the order floor in the test is the count at extraction.
3. Every pin stands; every named fence passes unchanged.
4. The file is at most `maxBytes` (the achieved size); expected about 27,100 bytes; a miss is
   reported with its reason and no order dropped.
5. At most five examples remain; the two output templates stay.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement and the statement
   that dispatch was removed in both versions; the median tokens and duration per version are
   recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings, fixture
   scripts included.

## Decisions Taken Under Ambiguity

1. **The method file stays out of this slice**: the agent does not read it on dispatch.
2. **Fixtures install nothing**, so a run never reaches the network and both versions see the same
   project state.
3. **Evidence matchers are fixed at Step 8 before any run** and accept either capitalisation of the
   check's name.
4. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00353`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00353` is re-planned against the compacted text.
5. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean project — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [ ] Write `tests/quality-gate-runner-compaction.test.js`, the three fixture projects, `expectations.json` with its matchers, and the brief.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader; run `units.js` on the baseline and record the headings it reports from inside examples; measure section sizes.
- [ ] Run each fixture's scripts once by hand: fixtures 1 and 2 fail where planted; the clean fixture passes with no warning. Dispatch `iron-loop-critic` to read the clean fixture for any defect of important or higher; fix and record.
- [ ] Confirm `00353` has not built (this slice goes first); check whether the grants slice has built and, if so, record that the baseline is its result.

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit in `rule-inventory.json`.
- [ ] Compact by hand in the original section order; set `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original (every code block labelled example above all), every `merged` order, tightened orders for changed meaning.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the shell and network orders present with their anchors; fixture scripts confined to their folder.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (scratch mode, dispatch removed): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group of examples moved out; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: Phase 0 before and after, the inventory counts, the smoke-check table, the size and token numbers.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria; hand the result to the owner for the OK to call it done.


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
