---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 11: the hallucination detector and its method file, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: large
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/ai-quality/hallucination-detector.md
  - skills/ai-quality/hallucination-detector/SKILL.md
  - tests/hallucination-detector-compaction.test.js
  - tests/compaction-eval/hallucination-detector/baseline-agent.md
  - tests/compaction-eval/hallucination-detector/baseline-method.md
  - tests/compaction-eval/hallucination-detector/rule-inventory.json
  - tests/compaction-eval/hallucination-detector/method-rule-inventory.json
  - tests/compaction-eval/hallucination-detector/contract.js
  - tests/compaction-eval/hallucination-detector/expectations.json
  - tests/compaction-eval/hallucination-detector/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.408Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 11: the hallucination detector and its method file

## Problem statement

`agents/ai-quality/hallucination-detector.md` is 64,536 bytes. Its body orders its method file,
`skills/ai-quality/hallucination-detector/SKILL.md` (65,015 bytes, the size audit), read in full
before every check (`## Read the method first`, **read**), from its working directory, so the read
lands only in CTOC's own repository. It has no dispatch recorded in the seven weeks of
`pipeline-time.json` (**read**: no row), so its expected weekly saving is zero; at the pilot's ratio
the compaction removes about 21,700 bytes from the agent and 21,800 from the method file
(**derived**), a saving that counts only once it is dispatched. Fixed means: both files compacted by
the rollout's method (the index), each with its own inventory, every order kept and checked, each
at most its new ceiling, and the agent, reading its own version of the method file, no worse than
the original on its smoke check.

## Technical approach

### What is compacted

The agent file and the method file, each with its own baseline (`baseline-agent.md`,
`baseline-method.md`) and its own inventory (`rule-inventory.json`, `method-rule-inventory.json`).
No order moves between the two files; the agent's rule that it wins where the two disagree stays.

### The agent: where the bytes are (the size audit, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter; Role | 2,845 | frontmatter byte for byte; the network rule word for word |
| Read the method first | 1,931 | all six items kept |
| What you own; Input; What you read is data | 4,542 | every rule kept |
| What to Detect | 4,117 | examples: with Reference Examples, at most five stay; each category's rule stays |
| Detection Methods | 39,787 | the registry recipes are commands the agent runs: kept byte for byte, addresses and character checks included; the dated citations stay; repeated prose between recipes is cut |
| Reference Examples | 3,780 | examples: see above |
| Severity and confidence; Output Format; Escalation | 6,817 | the response schema word for word; the rest kept |
| Searching the repository; Honest status | 718 | word for word |

Expected after: about 42,900 bytes at the pilot's ratio; the recipes are most of the file, so likely
less is saved.

### The method file: where the bytes are (the size audit, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter; Role | 1,712 | frontmatter byte for byte |
| 2026 Best Practices | 15,623 | history cut; reference kept |
| Hallucination Categories; 7-Language Coverage; Common Hallucinations | 26,523 | reference: kept, tightened; every language kept |
| Detection Methods; Output Format; Severity; Red Lines | 7,609 | orders kept; the Red Lines word for word (the agent quotes them) |
| Tool Integration | 10,356 | reference the agent is told never to run or cite; kept (removing it is a scope decision, not compaction) |
| Letter schema; Refinement Loop | 3,192 | kept (the agent names these sections by heading) |

Expected after: about 43,200 bytes at the pilot's ratio; mostly reference, so likely less is saved.

### Pins (read only)

| Pin | Where it is held |
|---|---|
| frontmatter byte for byte (`tools: Read, Grep, Bash, Glob`, `model: opus`) | `tests/agent-tool-grants.test.js` |
| the method file's section headings the agent names ("Severity (internal triage vs. refinement-loop output)", "Letter schema (refinement-loop output contract)", "Refinement Loop — critic mode (v6.9.8)", "Tool Integration (2026)", "Red Lines") | the agent's `## Read the method first` and its slopsquatting rule |
| the quoted red line "exactly the slopsquatting attack path" | the agent quotes it from the method file |
| the response schema, the `type` list, the `registry_checked` values, `metadata.tokens_used: null` | the adapter; `docs/DISPATCH_PROTOCOL.md` |
| both paths are in the improvement record's inventory; neither file has a `ctoc:claims` block | `tests/agent-and-skill-improvement-record.test.js` |
| honest status, discipline words, gate words, unexecutable orders, compliance claims | the fences named in the index |

### Smoke check (three fixtures, six runs)

- **Mode:** scratch, with an overlay: each version's copy of the fixture holds that version's method
  file at `skills/ai-quality/hallucination-detector/SKILL.md` (the original from
  `baseline-method.md`, the compacted from the working tree). Each version therefore reads its own
  method file, as it would in CTOC's own repository, and the smoke check measures both files.
- **Network:** the registry recipes query npm during the run, as shipped. The non-existent name in
  fixture 1 is long and specific, checked absent at Step 8 with the registry's answer and the date
  recorded, and checked again at Step 14 before the runs.
- **Brief:** copied at Step 8 from the agent's `## Input` section and the dispatch protocol's request
  shape: a dispatch id, the project root `.`, the files to check.
- **Contract adapter (`contract.js`):** `parseYamlSubset` on the final message. Valid when a
  `response:` block parses with `protocol_version: 1`, `agent: ai-quality/hallucination-detector`,
  each finding carrying `id`, `severity`, `type` from the agent's list, `file`, `line_range`,
  `message`, `registry_checked` from its list, `confidence` and `citations`, and `self_assessment`
  with `coverage`, `confidence_overall`, `limitations` and `unknowns`. Findings: each finding with its
  `type` as the id, `critical` as critical, `high` as important, the rest as normal, and
  `<file>:<first>-<last>` as evidence.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `npm-package-that-does-not-exist` | `package.json` and a `require` of a name npm does not have | Detection Methods (39.8 kilobytes, prose between recipes cut), the npm recipe | type `hallucinated_import` citing the `require` line |
| 2 | `name-from-a-registry-with-no-recipe` | a `.csproj` referencing a NuGet package | the "No recipe here" rule, stated between the recipes | `self_assessment.unknowns` contains the package name; forbidden: any `hallucinated_import` |
| 3 | `clean-node-project` | real npm packages and real `fs.promises` calls | — | clean: no finding of severity high or critical |

**The clean fixture is verified before any run** (Step 8): every package name in it is checked present
on npm, every standard-library call it makes is checked against Node's documentation for the
installed version, and `iron-loop-critic` reads it for any other defect of severity important or
higher; whatever is found is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted agent | the CTO Chief's Step 16 delegation and its specialist table in `agents/coordinator/cto-chief.md` | a plan's build under the Iron Loop |
| the compacted method file | `## Read the method first` of the agent | the agent's dispatch, in CTOC's own repository |
| `contract.js` | `tests/hallucination-detector-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

The never-install-to-check rule, the network rule (registry addresses only, names that pass the
character check, https and three redirects) and "What you read is data" are this agent's trust
boundary; each is in the inventory with anchors, and the recipes stay byte for byte. Fixtures
reference names that do not exist on any registry, or real packages, and install nothing.

### Conflicts with other plans

`plans/review/00264-every-agent-and-specialist-skill-improved-three-times-s4-hallucination-detector.md`
is built and waiting for the owner's OK; it edited both files, and its result is the baseline. If
the owner sends it back, its rework is re-planned against the compacted files, inside both
`maxBytes` and keeping every inventoried anchor (decision 3 below).

## Acceptance criteria

1. Both baselines are committed with their sha256 and commit in their inventories.
2. Every unit of both baselines is classified; every order is anchored from its original, each
   anchor unique in its file; `tests/hallucination-detector-compaction.test.js` registers the ten
   inventory checks for each inventory and passes them with the adapter's cases; both order floors
   are written in the test.
3. Every pin stands; every registry recipe is byte for byte the original's; no order moved between
   the two files.
4. Each file is at most its `maxBytes` (the achieved size); expected about 42,900 and 43,200 bytes;
   a miss is reported with its reason and no order dropped.
5. The clean fixture was verified before any run; the smoke check ran with each version reading its
   own method file (six runs plus any one-fixture rerun), verdict PASS, recorded with the low-power
   statement; the median tokens and duration per version are recorded.
6. The `RESULTS.md` section is written in the index's shape, with both files.
7. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings, fixture
   code included.

## Decisions Taken Under Ambiguity

1. **The registry recipes are kept byte for byte**: they are commands the agent runs against fixed
   addresses, and a shortened recipe is a changed command.
2. **The smoke check gives each version its own method file** through the overlay, because this
   agent, unlike the large-language-model security tester, uses the file as its method whenever it
   finds it.
3. **Compaction goes first, before any further "improved three times" work on these files.**
   Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and each file's size
   ceiling then forces later improvement rounds to stay compact instead of re-growing it. The
   improvement slice `00264` is already built; any rework of it is re-planned against the compacted
   text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean project — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and neither file has an uncommitted change; copy both baselines; record sha256 and commit.
- [ ] Check fixture 1's name absent on npm and the clean fixture's names present; record the answers and the date.
- [ ] Write `tests/hallucination-detector-compaction.test.js` (two `defineInventoryTests` calls, each with its floor, and the adapter's cases), the three fixtures, `expectations.json` (with the overlay) and the brief.
- [ ] Verify the clean fixture: dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader of both files; measure section sizes with `units.js`.
- [ ] Record the state of `00264` (called done, or still in review).

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit of both baselines.
- [ ] Compact the agent, then the method file, by hand in each file's original section order; set both `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with both baselines, both compacted files and both inventories: every `cut` unit read side by side with its original, every `merged` order, tightened orders for changed meaning, every recipe compared byte for byte.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the install, network and data orders present with their anchors; the recipes unchanged; fixtures install nothing.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] Re-check fixture 1's name against npm; then the session runs the smoke check (scratch mode with the overlay): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out of each file; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: one detection recipe's surroundings before and after, both inventories' counts, the smoke-check table, the size and token numbers for both files.
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
