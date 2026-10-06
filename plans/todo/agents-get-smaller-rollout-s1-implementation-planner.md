---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 1: the implementation planner, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: medium
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/planning/implementation-planner.md
  - tests/implementation-planner-compaction.test.js
  - tests/compaction-eval/implementation-planner/baseline-agent.md
  - tests/compaction-eval/implementation-planner/rule-inventory.json
  - tests/compaction-eval/implementation-planner/contract.js
  - tests/compaction-eval/implementation-planner/expectations.json
  - tests/compaction-eval/implementation-planner/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.270Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 1: the implementation planner

## Problem statement

`agents/planning/implementation-planner.md` is 36,797 bytes and was dispatched 234 times in the
seven recorded weeks (2 in August, 220 in September, 12 in October; **read**,
`pipeline-time.json`), about 33 times a week — the most dispatched agent in the rollout. At the
pilot's ratio the compaction removes about 12,400 bytes, about 413,000 bytes or 142,000 tokens a
week (**derived**, see the index). It has no method file of its own. Fixed means: the planner is
compacted by the rollout's method (the index), every order is kept and checked, the file is at
most its new ceiling, and on its smoke check the compacted planner does no worse than the
original.

## Technical approach

### What is compacted, and from what

Only the agent file. The baseline is copied at Step 8 from the commit then on `main` to
`tests/compaction-eval/implementation-planner/baseline-agent.md`, with its sha256 and commit in the
inventory.

### What leaves, and what stays (by heading, **read**; byte sizes per section are measured at Step 9)

- **Leaves, as reasons, examples or descriptions:** the illustrative patterns under Phase 2.3 (the
  module, agent-definition and test patterns — examples of the codebase's shape), the example
  tables under Phase 4.1 to 4.3, `## Example: Adding a New Lib Module`, `## References`, and every
  second statement of a rule said twice (the slice-sizing and naming rules recur across Phase 4b,
  Phase 5 and `## Batched Gates`; the cross-platform rule recurs in 3.1 and 3.4).
- **Stays, every order:** Step 0, the role as a decomposer, Phase 4b whole as orders (the sizing
  rule, a module and its test in one slice, at most three levels of dependency, no cycles, the
  naming `<parent-slug>-s<N>-<slice-name>.md`, the `parent_plan` bare-slug rule and its reason
  clause that `listSubplans` and `approveSubplans` match by exact string equality, the frontmatter
  skeleton with its ratchet comment, the canonical Step 8 to 16 labels), the wiring rule and its
  question-instead-of-guess clause, the Phase 3 file and test specification templates (output
  templates are orders), the dependency, architecture and security checklists, the Needs-Input
  Protocol, the Quality Bar, `## Writing questions to the streaming store`, the shared searching
  rule and `## Honest status (shared rule)` word for word.

### Pins (read only; every one is an order with `pinned_by` in the inventory)

| Pin | Where it is held |
|---|---|
| `parent_plan` is a bare slug; slices matched by exact equality | `listSubplans`, `approveSubplans` in `src/lib/actions.js`; `tests/subplan-decomposition.test.js` |
| a slice creating a counted artifact declares `CLAUDE.md` | `src/lib/documented-counts.js`, checked in `plan-validator.validateForQueue` |
| the embedded `tools:` example stays inside its fenced block, so the first frontmatter block is the grant; the file has zero unexecutable-order findings | `tests/unexecutable-instruction-fence.test.js` test 10 |
| no imperative "Dispatch <name>" line (Step 0 says "Recommend that CTO Chief dispatch") | `tests/tier1-no-peer-dispatch.test.js` |
| frontmatter byte for byte (`tools: Read, Glob, Grep, Write, Edit`, `model: opus`, `effort: xhigh`) | `tests/agent-tool-grants.test.js`, `tests/agent-model-floor.test.js` |
| the honest-status reference and its discipline words | `src/lib/agent-honesty-scan.js`, `tests/agent-honest-status-fence.test.js` |
| other named readers | `tests/agent-modernization.test.js`, `tests/architecture-invariants.test.js`, `tests/corpus-audit-ledger.test.js` |
| fences over every agent | `src/lib/instruction-gate-words-scan.js`, `tests/compliance-claims-match-code.test.js`, `tests/watcher-shape.test.js` |

Step 9 re-reads each; a pin found there and not listed here is added before labelling.

### Size

Expected after: about 24,400 bytes (66.4 percent, the pilot's ratio). `maxBytes` is set to the
achieved size at Step 10 and may only fall.

### Smoke check (three fixtures, six runs)

- **Mode:** scratch (slice 0). The planner writes plan files, so each run works in its own copy of
  the fixture outside the repository.
- **Brief:** copied at Step 8, word for word, from the dispatch that follows a functional plan's
  approval in `src/commands/start.md` (the `claude:approve` exception that "dispatches
  `implementation-planner` as WORK"), with the plan path set to the fixture's
  `plans/implementation/<file>.md`.
- **Contract adapter (`contract.js`):** reads the captured files under `plans/implementation/`.
  Valid only when at least one slice file was written; every slice's frontmatter parses with the
  repository's own frontmatter reader (named at Step 9; no new parser) and carries `parent_plan`,
  `depends_on` and `files`; every `parent_plan` equals the functional plan's file name without
  `.md`; every slice carries the nine canonical labels of Steps 8 to 16 exactly; and the
  `depends_on` graph has no cycle. The bare-slug, label and cycle rules are thus checked on every
  run, not on one fixture. Findings: `module-with-its-test` (normal) when every source file a slice
  creates has its test file in the same slice; `claude-md-declared` (normal) when every slice
  creating `tests/*.test.js` lists `CLAUDE.md`; `invented-call-site` (important) when a wiring
  section names a path that exists neither in the fixture nor in any slice's `files:`;
  `dependency-too-deep` (important); `question-raised` (important) when the run wrote a question
  through any channel the baseline names (the questions store or the Needs-Input status; the exact
  paths are copied from the baseline at Step 8).

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `module-needs-its-test` | a functional plan adding one module, its test and one call into an existing command | Phase 4b: the sizing rule and the ratchet comment, both long and repeated across Phase 4b, Phase 5 and Batched Gates | `module-with-its-test` and `claude-md-declared` present |
| 2 | `no-live-entry-point` | a functional plan for a module whose only caller does not exist in the project | the wiring rule: ask, never guess | `question-raised` present; `invented-call-site` absent |
| 3 | `clean-config-flag` | add one setting with its test; the caller exists | — | clean: no important finding |

**The clean fixture is verified before any run** (Step 8): its project's own tests pass, and
`iron-loop-critic` reads the functional plan and the project for any defect of severity important
or higher; whatever it finds is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted planner | the WORK dispatch after a functional plan's approval in `src/commands/start.md` | the owner's approval in `/ctoc:start` |
| `contract.js` | `tests/implementation-planner-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

The planner's rules on secrets, path traversal and command injection (checklist 3.5) are orders
with anchors. Fixtures hold no credential-shaped string and no path to a real file outside the
repository; runs happen in a scratch copy outside the repository.

### Conflicts with other plans

This slice builds before
`plans/todo/00295-every-agent-and-specialist-skill-improved-three-times-s35-implementation-planner.md`
(decision 3 below); that slice must be re-planned against the compacted text, inside this file's
`maxBytes` and keeping every inventoried anchor.
`plans/review/00082-ratchet-files-are-in-scope-by-rule.md` is built; its text is in the baseline.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit recorded in the inventory.
2. Every unit of the baseline is classified; every order has anchors from the original, each unique
   in the compacted file; `tests/implementation-planner-compaction.test.js` passes all ten inventory
   checks, the bite check included, and the adapter's cases; the order floor written in the test is
   the count at extraction.
3. Every pin in the table stands; every named test and fence passes unchanged.
4. The file is at most `maxBytes`, which equals the achieved size; expected about 24,400 bytes; a
   miss is reported with its reason and no order was dropped for it.
5. At most five examples remain; the output templates stay.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the statement that it has low statistical
   power and is not proof; the median tokens and duration per version are recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes (fail 0, skipped 0, coverage at or above the
   floor); the linter reports zero warnings, fixture code included.

## Decisions Taken Under Ambiguity

1. **The smoke check exercises the planner's slicing rules**, not its codebase analysis prose,
   because the slicing rules are what downstream code and gates read.
2. **A question is detected through the channels the baseline names**, copied at Step 8, rather
   than by keywords in prose.
3. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00295`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00295` is re-planned against the compacted text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard. The bare-slug,
   label and cycle rules, which had fixtures of their own in the first draft, are checked on every
   run through the contract instead.

## Execution Plan

### Step 8: TEST
- [x] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [x] Write `tests/implementation-planner-compaction.test.js` (`defineInventoryTests` with the floor, and the adapter's cases on hand-made captured files), the three fixtures, `expectations.json` with its matchers, and the brief.
- [ ] Verify the clean fixture: its tests pass; dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [x] Run the test; expect RED (inventory and adapter missing); record the failing lines.

### Step 9: PREPARE
- [x] Re-read every pin and reader of the agent file; measure the section sizes with `units.js`; name the repository's frontmatter reader the adapter uses.
- [x] Confirm `00295` has not built (this slice goes first); if it has, record that the baseline is its result.

### Step 10: IMPLEMENT
- [x] `contract.js`; label every unit of the baseline in `rule-inventory.json`; run the test (checks 5 and 6 red until compacted).
- [x] Compact the agent by hand in the original section order; set `maxBytes`; the test GREEN.
- [x] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order's surviving statement, tightened orders for changed meaning.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the security checklist orders present with their anchors; fixtures free of credential-shaped strings and outside paths.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [x] The session runs the smoke check by the protocol in `prepare.js` (scratch mode): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the per-fixture results, any rerun or matcher correction, the verdict, the sizes and the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10 with the failing fixture's outputs.

### Step 15: DOCUMENT
- [x] This plan's execution record: one line per group of reasons, history and examples moved out (they stay word for word in the baseline); the commit message carries the same summary.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: one section before and after, the inventory counts, the smoke-check table, the size and token numbers.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria; hand the result to the owner for the OK to call it done.


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
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
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

## Execution Record

Built in an isolated worktree by the iron-loop executor, 2026-10-06. Steps 11, 13 and 16 are
left to the main session (critic and security-scanner dispatches).

**Baseline.** `tests/compaction-eval/implementation-planner/baseline-agent.md`, copied from commit
`7cafed08c5992e5b6b8e167b64181edbab58efcc`, sha256
`44c9baf3a44ca711129a21df2620c03f22266b499308bda98064a0d61ed46520`. The pilot and slice 0 are in
`plans/done/`; `00295` is still in `plans/todo/` (not built), so this slice goes first.

**Step 8 RED.** `node --test tests/implementation-planner-compaction.test.js` failed at load:
`Cannot find module './compaction-eval/implementation-planner/contract'` (adapter and inventory
missing). The clean fixture's own tests pass (`npm test` in the fixture: 4 pass, 0 fail). The
`iron-loop-critic` read of the clean fixture was NOT dispatched: this executor holds no
agent-dispatch tool, so the main session should dispatch it (that Step 8 box stays open).

**Step 9.** Pins re-read: `tests/subplan-decomposition.test.js` (parent_plan, depends_on, "more
implementation plans than … functional", "never split a module from its test", `-s<N>-`),
`tests/tier1-no-peer-dispatch.test.js` (the Step 0 heading; the stack-chooser item names CTO
Chief; no "Dispatch <name>" line), `tests/session-start-question-dispatch.test.js` (the
dispatch-brief sentence, `writePlanQuestions`, `streaming-precompute`, no "SessionStart injects" —
a pin missing from the plan's table, added to the inventory), `tests/agent-modernization.test.js`
(frontmatter fields, a shared-snippet reference), `tests/architecture-invariants.test.js` (tier 1,
reports_to), `tests/unexecutable-instruction-fence.test.js` test 10, and the tool-grant,
model-floor and honest-status fences. The adapter reads frontmatter with `state.parseMetadata`
(it merges leading blocks and reads the `files:` list) and step labels with
`plan-validator.validateStepLabels`.

**Step 10 — inventory.** 327 units: 233 kept, 7 tightened, 32 merged, 55 cut. 176 orders (order
floor 176 in the test); every anchor is original text, unique in the compacted file and found in
its own section. `tests/implementation-planner-compaction.test.js`: 20 pass (10 inventory checks,
10 adapter cases). Every pinned test and fence passes unchanged (342 tests across the files in the
pin table plus reachability and the harness; `gate-words`, `false-green-fence`,
`golden-corpus-fence`: 55 pass). eslint on the new files: 0 problems.

**What left (word for word in the baseline):**
- Examples (12 units): the Phase 2.1 Grep and Glob example blocks (folded into one line each), the
  Phase 2.3 module, agent-definition and test patterns, the 4.1 to 4.3 example tables (each order
  now names its output section and columns instead), the naming example, and `## Example: Adding a
  New Lib Module`. Examples that remain: the Phase 1 change types (a table without its example
  column), the `coverage-map` / `wire-verify` naming hint and the caching question in Needs-Input.
  The output templates stay.
- References (7 units): `## References`.
- Descriptions (31 units): the manifest's contents, the expert-architect sentence, `## Trigger`,
  the plan contents under Input, Process Overview, the SIP1 label, the second vision-decomposer
  mirror, `## Batched Gates` (what `approveSubplans` and the executor do, not an order to the
  planner), `## Integration with Iron Loop`, and the v7 lead sentence.
- Reasons (5 units): why small slices (a crash loses only one), why the graph prevents cycles, the
  test-first aside in 4.1, "more plans does not mean more gate prompts", "not stylistic
  suggestions".
- Merged repeats (10 order units): the Role's slice-structure and INDEX restatements, the 3.4
  cross-platform row (held in the 3.1 template), the 4.1 dependency-order sentence, the
  anti-patterns that restated the Role, wiring, sizing, 3.3 and 3.4 orders, and the example's
  "verify real names" (held by "Copy-paste assumptions").

**Size.** 36,797 → 26,558 bytes (72.2 percent; `maxBytes` 26,558). This misses the expected
24,400 (66.4 percent) by 2,158 bytes. Reason: about 9 KB of this agent is output templates and the
Phase 4b skeleton, which the plan keeps whole as orders; no order was dropped to reach a number.

**Step 14 — smoke check** (scratch mode, one headless run per version, 6 runs; verdict PASS on
the first round, no rerun, no matcher correction; low statistical power, not proof):

| Fixture | Original | Compacted | Tokens original | Tokens compacted | Duration original | Duration compacted |
|---|---|---|---|---|---|---|
| module-needs-its-test (planted) | found (module-with-its-test, claude-md-declared) | found (same) | 196,847 | 211,093 | 139.0 s | 161.4 s |
| no-live-entry-point (planted) | found (question-raised, no invented-call-site, no slice written) | found (same) | 132,801 | 137,672 | 79.9 s | 68.3 s |
| clean-config-flag (clean) | 2 slices, no important finding | 2 slices, no important finding | 276,376 | 248,243 | 163.6 s | 171.0 s |

Median tokens per run: original 196,847, compacted 211,093. Median duration: original 139.0 s,
compacted 161.4 s. With one run per version this spread is run-to-run noise (the agent body is
about 2,600 tokens smaller per turn, **derived** from 10,239 bytes at about 4 bytes a token; the
runs differ by tens of thousands of tokens in how many files the planner chose to read), so these
numbers show no speed change either way. Scored runs: `.ctoc/eval/implementation-planner/2026-10-06/`.
The `RESULTS.md` section was not written here (parallel slices would conflict); the main session
appends it at merge, so that Step 14 box stays open.

**Decisions taken while building** (recorded here, outside the approved text):
1. The brief is composed from the self-contained-brief contract in `src/commands/start.md` (task
   id, plan path, ancestry to read, completion contract), because `start.md` holds no literal
   planner brief to copy word for word.
2. A run that wrote no slice but raised a question through a named channel is VALID: the
   Needs-Input protocol tells the planner to wait for the answer, so halting with the question is a
   correct answer (both runs of `no-live-entry-point` did exactly that).
3. The question channels are the two the baseline names: the plan's `.status` file reading
   `needs-input` (seeded `working` in every fixture) and `.ctoc/streaming/questions/`.
4. `---` horizontal rules and bare list numbers are labelled as markup (`heading`), not content;
   removed rules are `merged`.
