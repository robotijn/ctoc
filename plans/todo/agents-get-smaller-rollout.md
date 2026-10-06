---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller without losing findings — rollout to the eleven other large agents (index)"
type: implementation
created: 2026-10-06
priority: high
effort: large
depends_on: agents-get-smaller-without-losing-findings-pilot
files: []
approved_by: human
approved_at: 2026-10-06T18:01:53.984Z
gate_crossed: implementation → todo
---

# Agents get smaller without losing findings — rollout to the eleven other large agents

This file is the index of the rollout. It builds nothing itself; its slices do. It states the
method once, the order of the slices and the arithmetic behind it, how the slices are built and
merged, and which shared files force their merges into sequence.

Written by the implementation planner on 2026-10-06. Claims are labelled **read** (read from a
file in this repository this session), **derived** (computed from read numbers, arithmetic shown)
or **believed** (not checked). Nothing was run: this planner holds no shell.

## Problem statement

Eleven agents not covered by the pilot carry 802,799 bytes (sizes as given by the owner on
2026-10-06), and two of them order their own method file read in full on every dispatch, which
adds 181,844 bytes more in CTOC's own repository (sizes from
`.ctoc/audit/speed-and-size/where-agent-and-skill-bytes-go.md`, **read**). An agent's body is its
whole system prompt, so every dispatch pays for every byte. The pilot
(`plans/todo/agents-get-smaller-without-losing-findings-pilot.md`) built the method on the
pre-mortem critic: 119,229 bytes became 79,150 bytes, 66.4 percent of the original, with all 401
orders kept and checked by a deterministic rule inventory (**read**, the pilot's execution
record). The CTO Chief records that the pilot proved the method (decision 11); every slice still
depends on the pilot being done.

Fixed means: each of the eleven agents (and the two method files) is compacted by the pilot's
method, every order of the original is still present and checked by a test, each file's size is a
ceiling that may only fall, each agent passes its own small smoke check against its original, and
each result is recorded in `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.

Out of this rollout: `agents/architecture/dependency-analyzer.md` (another plan owns it),
`agents/iron-loop/premortem-critic.md` and `agents/iron-loop/advocate-critic.md` (the pilot).

## Technical approach

### The method, the same for every agent (the pilot's, with one correction)

1. **Baseline.** At Step 8 the agent file, and its method file when it is in the slice, are copied
   byte for byte from the commit then on `main` into `tests/compaction-eval/<agent>/baseline-agent.md`
   (and `baseline-method.md`). The sha256 and the commit go into the inventory. The agent file must
   have no uncommitted change at that moment.
2. **Rule inventory, labelled BEFORE compacting.** `tests/compaction-eval/units.js` splits the
   baseline into units. Every unit gets a kind (`order`, `reason`, `history`, `example`,
   `reference`, `description`, `heading`, `frontmatter`) and a fate (`kept`, `tightened`, `merged`,
   `cut`). `cut` is allowed only for reasons, history, examples, descriptions, and a reference the
   same file states twice. Every order gets anchors drawn verbatim from the ORIGINAL text — its
   literals, ids, field names, numbers and key phrase, never connective prose — each anchor unique
   to that order. Every sentence or literal a test or a module holds carries `pinned_by`; every
   literal another file parses carries `wire: true`. The pilot labelled after compacting and
   recorded that its inventory therefore constrains later compactions fully but its own only partly
   (its execution record, decision 1). The rollout returns to the pilot plan's own design: label
   first, so each inventory constrains the compaction it guards.
3. **Compaction by hand**, in the original section order. Every order stays; each rule is said
   once; reasons are cut to the words that change behaviour. Catalogues and decision tables stay in
   the body as compact tables, never moved to a reference file: a dispatched agent reads paths from
   the repository under review, so a file beside it is absent in every other project (the pilot's
   decision 1). No order moves between an agent and its method file. Every pinned sentence and wire
   literal stays word for word. At most five examples stay, chosen by the slice; an output template
   the agent must reproduce is an order, not an example, and stays. A pattern the agent is told to
   match (an unsafe-code shape, a registry recipe) is reference and stays.
4. **Size ceiling.** `maxBytes` in the inventory is set to the compacted size and may only fall.
   Each slice names an expected size at the pilot's measured ratio; the inventory always outranks
   the number, and a miss is reported with its reason.
5. **The test.** Each agent slice adds `tests/<agent>-compaction.test.js`, which registers the
   pilot's ten inventory checks once per inventory through `defineInventoryTests` (slice 0) with the
   order floor written in the test file itself, plus the cases of the agent's contract adapter.
6. **Review (Step 11) — with the inventory, the main guard.** `iron-loop-critic` reads every `cut`
   unit side by side with the original for a misclassified order, every `merged` order's surviving
   statement, and the tightened orders for changed meaning.
7. **Smoke check (Step 14), cheap and not proof (decision 11).** Three fixtures per agent: two with
   one planted defect each, chosen for the rules that agent's compaction cuts hardest, and one clean
   fixture whose cleanliness is verified at Step 8 before any run — its own tests run green where it
   has code, and `iron-loop-critic` reads it for any defect of severity important or higher; a
   defect found is fixed in the fixture and the check recorded. (The pilot's "clean" webhook fixture
   held a real defect; no slice reuses it.) One run per version of the agent (original and
   compacted): six runs, run by the session headless as
   `claude -p --agent <evaluation agent> --output-format json` from the run plan `prepare.js` writes,
   scored by `score.js` with the agent's contract adapter. The pass rule and the single one-fixture
   rerun on a shortfall are the pilot's, unchanged. There are no separate trivial-brief token
   readings: each of the six runs reports its tokens and duration, and the record gives the median
   per version. One run per version cannot tell a small real drop from noise; the inventory and the
   side-by-side review are the quality guard, and every record says so.
8. **Benchmark record (Step 14).** Each slice appends one short section to
   `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`, in this shape:

   ```markdown
   ## Agents get smaller — <agent>

   <date>. Baseline `<commit>`. Compacted `<commit>`.

   | Measure | Before | After |
   |---|---|---|
   | `<agent file>` bytes | | |
   | `<method file>` bytes (only when in the slice) | | |
   | Median tokens per run, three runs per version | | |
   | Median duration per run, three runs per version | | |

   Rule inventory: <N> orders (<k> kept word for word, <t> tightened, <m> merged), <c> units cut; test passes.

   Smoke check, one run per version, low statistical power, not proof:

   | Fixture | Kind | Original | Compacted |
   |---|---|---|---|

   Clean fixture verified: <how, and what was fixed>. Reruns: <none, or which and the result>. Verdict: <PASS or FAIL>. Raw runs: `.ctoc/eval/<agent>/<date>/`.
   ```

### Which agents read their own method file on every dispatch

| Agent | Method file | Read on every dispatch? | In its slice? |
|---|---|---|---|
| `llm-security-tester` | `skills/ai-quality/llm-security-tester/SKILL.md` (116,829 bytes) | yes: "Read that file in full" under `## Read the method first` (**read**). It reads the path from its working directory, so the read lands only in CTOC's own repository, and its item 7 uses it as the method only when the dispatch says the repository under review is CTOC's own | yes |
| `hallucination-detector` | `skills/ai-quality/hallucination-detector/SKILL.md` (65,015 bytes) | yes: "Before checking, Read … in full" (**read**). Same working-directory caveat | yes |
| `quality-gate-runner` | `skills/testing/quality-gate-runner/SKILL.md` | no: its frontmatter names it (`target_skill`), but the body never orders a read and no code under `src/` reads `target_skill` (**read**) | no |
| the other eight | none exists | — | — |

### Order of the slices and the expected saving

Order is by expected bytes saved per week = expected bytes saved × dispatches per week, as the
owner asked. **Derived:**

- Dispatches per week: the runs in `byAgentAndMonth` of
  `.ctoc/audit/speed-and-size/benchmarks/pipeline-time.json`, summed over every month, divided by
  7.0 — the weeks from the first recorded subagent run (2026-08-18) to the last (2026-10-06)
  (**read**: `firstSubagentRun`, `lastSubagentRun`). `hallucination-detector` has no row at all.
- Expected bytes saved: 33.6 percent of today's bytes, the pilot's measured ratio, the same for
  every file. For a method file, the saving counts only the dispatches in this repository
  (`runsInThisRepository`), since only there does the file exist at the path read.
- Tokens: bytes ÷ 2.91, the pilot planner's measured ratio. This counts the prompt once per
  dispatch; every further turn of a dispatch reads it again from the cache, so the real input-token
  saving is larger (**believed**).

| # | Slice | Bytes today | Expected saved | Runs in 7 weeks | Per week | Saved per week (bytes) | About tokens per week | At October's pace (6 days, small counts) | depends_on |
|---|---|---|---|---|---|---|---|---|---|
| 0 | `agents-get-smaller-rollout-s0-harness.md` — the harness serves every agent | — | — | — | — | — | — | — | pilot |
| 1 | `agents-get-smaller-rollout-s1-implementation-planner.md` | 36,797 | 12,400 | 234 (2, 220, 12) | 33.4 | 413,000 | 142,000 | 14.0 per week → 173,000 | pilot, s0 |
| 2 | `agents-get-smaller-rollout-s2-gate-critic.md` | 168,257 | 56,500 | 31 (29, 2) | 4.4 | 250,000 | 86,000 | 2.3 → 132,000 | pilot, s0 |
| 3 | `agents-get-smaller-rollout-s3-red-team-critic.md` | 126,193 | 42,400 | 38 (1, 37) | 5.4 | 230,000 | 79,000 | 0 → 0 | pilot, s0 |
| 4 | `agents-get-smaller-rollout-s4-devils-advocate-critic.md` | 100,675 | 33,800 | 35 (1, 34) | 5.0 | 169,000 | 58,000 | 0 → 0 | pilot, s0 |
| 5 | `agents-get-smaller-rollout-s5-product-owner.md` | 37,679 | 12,700 | 71 (68, 3) | 10.1 | 128,000 | 44,000 | 3.5 → 44,000 | pilot, s0 |
| 6 | `agents-get-smaller-rollout-s6-agent-critic.md` | 57,243 | 19,200 | 17 (5, 12) | 2.4 | 46,700 | 16,000 | 14.0 → 269,000 | pilot, s0 |
| 7 | `agents-get-smaller-rollout-s7-llm-security-tester.md` (agent + method file) | 73,377 + 116,829 | 24,700 + 39,300 | 3 (2, 1); 1 in this repository | 0.43; method file 0.14 | 16,200 | 5,600 | 1.2 → 75,000 | pilot, s0 |
| 8 | `agents-get-smaller-rollout-s8-cto-chief.md` | 59,787 | 20,100 | 4 (4) | 0.57 | 11,500 | 3,900 | 0 → 0 | pilot, s0 |
| 9 | `agents-get-smaller-rollout-s9-vision-decomposer.md` | 37,496 | 12,600 | 4 (3, 1) | 0.57 | 7,200 | 2,500 | 1.2 → 15,000 | pilot, s0 |
| 10 | `agents-get-smaller-rollout-s10-quality-gate-runner.md` | 40,759 | 13,700 | 3 (3) | 0.43 | 5,900 | 2,000 | 0 → 0 | pilot, s0 |
| 11 | `agents-get-smaller-rollout-s11-hallucination-detector.md` (agent + method file) | 64,536 + 65,015 | 21,700 + 21,800 | 0 | 0 | 0 | 0 | 0 → 0 | pilot, s0 |
| | **Total** | **984,643** | **about 331,000** | | | **about 1,279,000** | **about 440,000** | **about 708,000** | |

Runs in brackets are per month, August to October. The October column is shown because it ranks
differently: at October's pace `agent-critic` and `implementation-planner` lead and the three
lenses fall to zero. The ordering above uses the whole window, as asked.

The single ratio is an estimate. The method never cuts reference material unless a file states it
twice, so files heavy in reference (the two method files, `hallucination-detector`'s detection
recipes, `llm-security-tester`'s taxonomies, `agent-critic`'s dimensions) will likely save less,
and `quality-gate-runner`, mostly worked command examples, likely more. Because dispatch counts
dominate the ranking, this moves no slice by more than one place (**believed**).

### How the slices are built and merged

Every agent slice touches its own agent, its own method file where it has one, its own test file
and its own folder `tests/compaction-eval/<agent>/`. Those sets are disjoint, so after slice 0 has
landed, slices 1 to 11 are built in parallel, each in its own git worktree, and **merged one at a
time by the main session**, which reconciles the test-file counts and bumps the version at each
merge (decision 12).

Shared files that force the merges into sequence:

| Shared file | Who touches it | What the main session does at each merge |
|---|---|---|
| `tests/compaction-eval/prepare.js`, `tests/compaction-eval/score.js`, `tests/compaction-eval/inventory-checks.js`, `tests/compaction-eval.test.js`, `tests/premortem-critic-rule-inventory.test.js` | slice 0 only; every agent slice uses them | slice 0 is built and merged before any agent slice starts |
| `CLAUDE.md` (the test-file count, two places) and `README.md` (the test-file count) | every agent slice: each adds one `tests/*.test.js`, and the documented-count check makes each slice move the number in its own worktree so its own `npm test` passes | recomputes the count on `main` (one more per merged slice) |
| `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md` | every slice appends a section at Step 14 (edit-whitelisted, so not in `files:`) | keeps both sections, in merge order |
| `.ctoc/logs/transitions.json` | every plan move appends to it, in each worktree | keeps both entries, in time order |
| `VERSION`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, the version lines of `README.md` | the release step | bumps the version once per merge on `main`; never inside a worktree |

No slice edits a test that pins agent wording: every slice keeps every pinned sentence and wire
literal word for word, so pinning tests are read-only and force no sequence. `gate-critic`,
`red-team-critic` and `devils-advocate-critic` share wire literals with one another and with
`src/lib/streaming-precompute.js`; each keeps them word for word, so they too build in parallel.
Slices 3 and 4 read the pilot's committed fixtures, which nothing edits; a slice whose verification
finds a defect in a reused clean fixture writes its own clean fixture instead of editing the
pilot's.

**Believed, to verify when the first worktree is made:** a worktree should be created only after
that slice's build approval is committed to `main`, because the edit hook checks approval against
the approval ledger in the worktree's own `.ctoc/approvals/`.

### Conflicts with other plans (read from their `files:` lists)

| Agent | Other plan | Its stage |
|---|---|---|
| `implementation-planner` | `00295-…-s35-implementation-planner` | todo, approved |
| `gate-critic`, `red-team-critic`, `devils-advocate-critic` | `00370-…-s110-gate-critic-and-lenses` | todo, approved |
| `gate-critic` | `00413-small-changes-take-a-small-path-s13-one-critique-per-group` | implementation, not approved |
| `gate-critic`, `red-team-critic`, `devils-advocate-critic`, `agent-critic` | `deepthink-ships-with-ctoc-s8-reader-and-critic-wording` | implementation, not approved |
| `product-owner` | `00297-…-s37-product-owner` | todo, approved |
| `product-owner`, `vision-decomposer`, `cto-chief` | `dispatched-agents-route-their-questions-to-the-session` | todo, approved |
| `agent-critic` | `00379-…-s119-agent-critic` | todo, approved |
| `llm-security-tester` and its method file | `00265-…-s5-llm-security-tester` | review: built, waiting for the owner's OK to call it done |
| `cto-chief` | `00376-…-s116-cto-chief` | todo, approved |
| `vision-decomposer` | `00301-…-s41-vision-decomposer` | todo, approved |
| `quality-gate-runner` | `00353-…-s93-quality-gate-runner` (todo, approved); `agent-tool-grants-s11-removals-held` (implementation) | |
| `hallucination-detector` and its method file | `00264-…-s4-hallucination-detector` | review: built, waiting for the owner's OK |

**Compaction goes first (decision 10).** Each slice builds before the approved "improved three
times" slice on its agent: `00295`, `00297`, `00301`, `00353`, `00370`, `00376`, `00379`. **Those
seven improvement slices must be re-planned against the compacted text** before they build: their
rounds were written against the long files, their approved `files:` lists do not include the
inventories, and each agent's inventory test will fail them if they drop an inventoried anchor or
grow the file past `maxBytes`. The same holds for `00264` and `00265` if the owner sends either back
from review: their rework is re-planned against the compacted files. For the other plans in the
table (not improvement slices), both orders work; if one builds first, the slice's baseline is the
file after it.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 0 | `agents-get-smaller-rollout-s0-harness.md` | the harness takes any agent: per-fixture briefs, a contract adapter per agent, a scratch working copy that captures written files, the inventory checks as one shared module | pilot |
| 1 | `agents-get-smaller-rollout-s1-implementation-planner.md` | compact the implementation planner | pilot, s0 |
| 2 | `agents-get-smaller-rollout-s2-gate-critic.md` | compact the gate critic | pilot, s0 |
| 3 | `agents-get-smaller-rollout-s3-red-team-critic.md` | compact the red-team critic | pilot, s0 |
| 4 | `agents-get-smaller-rollout-s4-devils-advocate-critic.md` | compact the devil's-advocate critic | pilot, s0 |
| 5 | `agents-get-smaller-rollout-s5-product-owner.md` | compact the product owner | pilot, s0 |
| 6 | `agents-get-smaller-rollout-s6-agent-critic.md` | compact the agent critic | pilot, s0 |
| 7 | `agents-get-smaller-rollout-s7-llm-security-tester.md` | compact the large-language-model security tester and its method file | pilot, s0 |
| 8 | `agents-get-smaller-rollout-s8-cto-chief.md` | compact the CTO Chief | pilot, s0 |
| 9 | `agents-get-smaller-rollout-s9-vision-decomposer.md` | compact the vision decomposer | pilot, s0 |
| 10 | `agents-get-smaller-rollout-s10-quality-gate-runner.md` | compact the quality gate runner | pilot, s0 |
| 11 | `agents-get-smaller-rollout-s11-hallucination-detector.md` | compact the hallucination detector and its method file | pilot, s0 |

Longest chain: pilot → slice 0 → an agent slice. No cycle.

## Acceptance criteria

1. Every slice meets its own acceptance criteria and crosses the owner's OK to call it done.
2. `RESULTS.md` holds one section per agent slice in the shape above.
3. After the last merge, `npm test` on `main` passes (fail 0, skipped 0, coverage at or above the
   floor in `.ctoc/coverage-baseline.json`), the linter reports zero warnings, and the documented
   test-file count equals the real count.
4. The total bytes saved, per file and summed, are recorded against the expected 331,000.
5. The seven improvement slices named under "Compaction goes first" are marked for re-planning
   against the compacted text.

## Questions for the owner

None open. The order against the improvement slices was decided by the CTO Chief (decision 10).

## Decisions Taken Under Ambiguity

1. **A harness slice (slice 0) precedes the agent slices**, beyond one slice per agent. The pilot's
   scorer applies the pre-mortem critic's contract to every run and its only brief is the lens
   brief. Ten of the eleven agents answer in another shape, four write files, one must be handed its
   own version of its method file (it reads it from its working directory), three answer in YAML,
   and two dispatch other agents. Changing the shared scorer once, first, is what lets the agent
   slices build in parallel.
2. **One expected ratio for every file**: the pilot's measured 33.6 percent saved.
3. **Dispatches per week use the whole seven-week window**; October's pace is shown beside it.
4. **A method file is in a slice only when the agent's body orders it read in full on every
   dispatch**, and its saving counts only this repository's dispatches.
5. **Label first, compact second** (see the method, item 2).
6. **YAML answers are read by a narrow reader in slice 0, not by a library.** `js-yaml` is present
   in `node_modules` only as some other package's dependency (**believed**: ESLint's); declaring it
   would be a new dependency.
7. **Agents that dispatch other agents run their smoke check with dispatch removed in both
   versions** (`cto-chief`, `quality-gate-runner`), so each run is one agent at a bounded cost; the
   text about dispatching is guarded by the inventory and the review only.
8. **Agents that write files, or read a method file from the working directory, run in a scratch
   copy of the fixture outside the repository**, so no run writes into the repository. Where the
   smoke check measures a method file (`hallucination-detector`), each version's copy holds its own
   version of the file; where real dispatches almost never use it (`llm-security-tester`), the copy
   holds none, as in every other project.
9. **Each agent's test file is named `tests/<agent>-compaction.test.js`**, because it holds the
   inventory checks and the contract adapter's cases together.
10. **Compaction goes first, before the approved "improved three times" slices on the same agents.**
    Decided by the CTO Chief, 2026-10-06. Reason: the owner's current priority is speed ("optimize
    the shit out of ctoc"), and each agent's new size ceiling (the inventory test lets the size only
    fall) then forces later improvement rounds to stay compact instead of re-growing the agent by 54
    to 61 kilobytes. Consequence: those improvement slices are re-planned against the compacted text
    (see "Compaction goes first").
11. **The smoke check is three fixtures per agent: two planted defects most at risk from that
    agent's compaction and one clean fixture whose cleanliness is verified, one run per version —
    six headless runs per agent.** Decided by the CTO Chief, 2026-10-06: the pilot proved the method
    and the owner asked for cheap benchmarks. The rule inventory and the side-by-side review of every
    cut unit remain the main guard. The trivial-brief token readings are dropped; the six runs supply
    the token and duration numbers.
12. **Slices are built in parallel in separate worktrees and merged one at a time by the main
    session**, which reconciles the test-file counts in `CLAUDE.md` and `README.md` and bumps the
    version at each merge. Decided by the CTO Chief, 2026-10-06.

## Execution Plan

The index builds nothing; each step below is carried out by the slices or by the main session.
These are the checks made on the set.

### Step 8: TEST
- [ ] Confirm the pilot is done; if its method changed after this index was written, update the method section above before any slice starts.

### Step 9: PREPARE
- [ ] Mark the seven improvement slices named under "Compaction goes first" for re-planning against the compacted text (decision 10).

### Step 10: IMPLEMENT
- [ ] Slice 0 first; then the agent slices, built in parallel, each in its own worktree.

### Step 11: REVIEW
- [ ] Each slice's Step 11 side-by-side review is done before its merge.

### Step 12: OPTIMIZE
- [ ] None at the set level.

### Step 13: SECURE
- [ ] Each slice's Step 13 is done before its merge.

### Step 14: VERIFY
- [ ] The main session merges one slice at a time: recomputes the test-file count, bumps the version, keeps both `RESULTS.md` sections and both transition entries, then runs `npm test` and the linter on `main`.

### Step 15: DOCUMENT
- [ ] After the last merge: the per-file and total bytes saved, against the expectation, appended to `RESULTS.md`.

### Step 16: FINAL-REVIEW
- [ ] Show the owner the totals table in full; the owner decides when the set is done.


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
