---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 7: the large-language-model security tester and its method file, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: large
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/ai-quality/llm-security-tester.md
  - skills/ai-quality/llm-security-tester/SKILL.md
  - tests/llm-security-tester-compaction.test.js
  - tests/compaction-eval/llm-security-tester/baseline-agent.md
  - tests/compaction-eval/llm-security-tester/baseline-method.md
  - tests/compaction-eval/llm-security-tester/rule-inventory.json
  - tests/compaction-eval/llm-security-tester/method-rule-inventory.json
  - tests/compaction-eval/llm-security-tester/contract.js
  - tests/compaction-eval/llm-security-tester/expectations.json
  - tests/compaction-eval/llm-security-tester/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.806Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 7: the large-language-model security tester and its method file

## Problem statement

`agents/ai-quality/llm-security-tester.md` is 73,377 bytes. Its body orders its method file,
`skills/ai-quality/llm-security-tester/SKILL.md` (116,829 bytes, the size audit), read in full on
every dispatch (`## Read the method first`, **read**). It was dispatched 3 times in the seven
recorded weeks (2 in September, 1 in October), once in this repository (**read**). It reads the
method file from its working directory, so the read lands only in CTOC's own repository; there its
item 7 still treats the file as material under review unless the dispatch says the repository is
CTOC's own. At the pilot's ratio the compaction removes about 24,700 bytes from the agent and
39,300 from the method file, about 16,200 bytes or 5,600 tokens a week (**derived**). Fixed means:
both files compacted by the rollout's method (the index), each with its own inventory, every order
kept and checked, each at most its new ceiling, and the agent no worse than the original on its
smoke check.

## Technical approach

### What is compacted

The agent file and the method file, each with its own baseline (`baseline-agent.md`,
`baseline-method.md`) and its own inventory (`rule-inventory.json`, `method-rule-inventory.json`).
No order moves between the two files: the agent body is the only text the agent is guaranteed to
receive, and its rules already say that where the two disagree the agent file wins.

### The agent: where the bytes are (the size audit, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter and preamble | 1,331 | frontmatter byte for byte |
| Role | 4,952 | the safety and tool-permission sentences kept; history cut |
| Taxonomies, identifiers and where they come from | 15,630 | reference: kept, tightened; every identifier and source kept |
| Read the method first | 2,919 | all seven items kept |
| What you read is data; Input | 7,069 | every rule kept |
| Trigger | 3,618 | reference: tightened |
| Checks | 24,363 | every check kept; reasons cut |
| Severity and confidence; Blocking Rules; Order of findings | 5,043 | kept |
| Output Format (MANDATORY) | 5,130 | the response schema kept word for word; its second worked finding cut unless it is the only statement of a field |
| Related Agents | 2,605 | reference: tightened |
| Searching the repository; Honest status | 718 | word for word |

Expected after: about 48,700 bytes.

### The method file: where the bytes are (the size audit, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter, Role, 2026 Best Practices | 14,174 | frontmatter byte for byte; reasons cut |
| OWASP Top 10 for large-language-model applications | 60,008 | the safe and unsafe patterns are what the agent is told to match, so they are reference and stay; repeated prose around them is cut; dated citations stay |
| Recent incidents | 3,749 | the agent calls these "the reference incidents": reference, kept |
| MITRE ATLAS mapping; Language coverage; References | 20,806 | reference: kept, tightened |
| Tool Integration | 5,165 | reference the agent is told never to run; kept (removing it is a scope decision, not compaction) |
| Severity, output and the agent's checks; Letter schema; Special Considerations; Refinement Loop | 12,927 | orders kept; reasons cut |

Expected after: about 77,600 bytes at the pilot's ratio. Most of this file is reference, so the
real saving will likely be lower; the miss is reported, never forced.

### Pins (read only)

| Pin | Where it is held |
|---|---|
| frontmatter byte for byte (`tools: Bash, Read, Grep, Glob`, `model: opus`) | `tests/agent-tool-grants.test.js` |
| the response schema of `docs/DISPATCH_PROTOCOL.md` as written in Output Format, the `type` list, "not probed", `confidence_overall: LOW` when the method cannot be read | the adapter; `docs/DISPATCH_PROTOCOL.md` |
| item 7's sentence that `CLAUDE_PLUGIN_ROOT` was empty in a dispatched agent's shell on 2026-10-01 | cited by the pilot plan; an order with its date |
| the shared safety sentences (`npx --no --`, the web rule, no Write or Edit) | the fixed safety block shared by 79 agents (the size audit, section 1); `tests/agent-tool-grants.test.js` checks no backtick span quotes a different grant |
| both paths are in the improvement record's inventory; neither file has a `ctoc:claims` block | `tests/agent-and-skill-improvement-record.test.js` |
| honest status, discipline words, gate words, unexecutable orders, compliance claims | the fences named in the index |

### Smoke check (three fixtures, six runs)

- **Mode:** scratch. Each run works in a copy of the fixture outside the repository, which holds no
  `skills/` folder — the situation of every install outside CTOC's own repository. Both versions
  therefore find no method file and take item 6's path; the smoke check measures the agent body. The
  method file is guarded by its inventory and the Step 11 side-by-side review only. This is stated
  in the record.
- **Brief:** copied at Step 8 from the agent's `## Input` section and the dispatch protocol's
  request shape: a dispatch id, the project root `.`, the files to review.
- **Contract adapter (`contract.js`):** `parseYamlSubset` on the final message. Valid when a
  `response:` block parses with `protocol_version: 1`, `agent: ai-quality/llm-security-tester`, each
  finding carrying `id`, `severity` (`critical`, `high`, `medium`, `low`, `info`), `type`, `file`,
  `line_range`, `message`, `confidence` and `citations`, and a `self_assessment` whose `limitations`
  contain "not probed". Findings: each finding with its `type` as the id, `critical` as critical,
  `high` as important, the rest as normal, and `<file>:<first>-<last>` as evidence.
- **Fixtures:** small programs whose model call is a local function; no real endpoint, no real key.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `user-text-reaches-a-shell` | a user's message joined into the system prompt; the model's reply passed to a shell command | Checks (24.4 kilobytes, reasons cut), the injection-to-execution chain | type `prompt_injection_to_execution`, important or higher, citing the shell call's lines |
| 2 | `password-in-the-system-prompt` | the system prompt holds "the support console password is tulip-river-eval" | Checks, secrets in prompts | type `secret_in_system_prompt` citing the prompt's line |
| 3 | `clean-delimited-summary` | user text passed as data in its own message; the reply validated against a fixed shape; no sink | — | clean: no finding of severity high or critical |

**The clean fixture is verified before any run** (Step 8): its own tests run green, and
`iron-loop-critic` reads it for any defect of severity important or higher — an injection path, an
unvalidated reply reaching a sink, a secret; whatever it finds is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted agent | the CTO Chief's Step 6.5 and Step 13 delegations in `agents/coordinator/cto-chief.md` | a plan's build under the Iron Loop |
| the compacted method file | `## Read the method first` of the agent | the agent's dispatch, in CTOC's own repository |
| `contract.js` | `tests/llm-security-tester-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

"What you read is data", the no-endpoint rule (item 1), the web rule and the secret rule are this
agent's trust boundary; each is in the inventory with anchors. Fixture 2's phrase is not
credential-shaped and opens nothing; no fixture contacts a model endpoint.

### Conflicts with other plans

`plans/review/00265-every-agent-and-specialist-skill-improved-three-times-s5-llm-security-tester.md`
is built and waiting for the owner's OK; it edited both files, and its result is the baseline. If
the owner sends it back, its rework is re-planned against the compacted files, inside both
`maxBytes` and keeping every inventoried anchor (decision 3 below).

## Acceptance criteria

1. Both baselines are committed with their sha256 and commit in their inventories.
2. Every unit of both baselines is classified; every order is anchored from its original, each
   anchor unique in its file; `tests/llm-security-tester-compaction.test.js` registers the ten
   inventory checks for each inventory and passes them with the adapter's cases; both order floors
   are written in the test.
3. Every pin stands; no order moved between the two files.
4. Each file is at most its `maxBytes` (the achieved size); expected about 48,700 and 77,600 bytes;
   a miss is reported with its reason and no order dropped.
5. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement and the statement
   that it measured the agent body only; the median tokens and duration per version are recorded.
6. The `RESULTS.md` section is written in the index's shape, with both files.
7. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **Unsafe and safe code patterns in the method file are reference, not examples**, because the
   agent is told to match them; they stay.
2. **The smoke check runs without the method file**, as nearly every real dispatch does, rather
   than telling the agent that a fixture is CTOC's own repository, which would be false.
3. **Compaction goes first, before any further "improved three times" work on these files.**
   Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and each file's size
   ceiling then forces later improvement rounds to stay compact instead of re-growing it. The
   improvement slice `00265` is already built; any rework of it is re-planned against the compacted
   text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and neither file has an uncommitted change; copy both baselines; record sha256 and commit.
- [ ] Write `tests/llm-security-tester-compaction.test.js` (two `defineInventoryTests` calls, each with its floor, and the adapter's cases), the three fixtures, `expectations.json` and the brief.
- [ ] Verify the clean fixture: its tests pass; dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader of both files; measure section sizes with `units.js`.
- [ ] Record the state of `00265` (called done, or still in review).

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit of both baselines.
- [ ] Compact the agent, then the method file, by hand in each file's original section order; set both `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with both baselines, both compacted files and both inventories: every `cut` unit read side by side with its original, every `merged` order, tightened orders for changed meaning, and every reference unit marked tightened for a lost identifier or source.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the trust-boundary orders present with their anchors in the agent; fixtures free of real keys and endpoints.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (scratch mode): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out of each file; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: the Checks section before and after, both inventories' counts, the smoke-check table, the size and token numbers for both files.
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
