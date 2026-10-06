---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 5: the product owner, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: medium
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/planning/product-owner.md
  - tests/product-owner-compaction.test.js
  - tests/compaction-eval/product-owner/baseline-agent.md
  - tests/compaction-eval/product-owner/rule-inventory.json
  - tests/compaction-eval/product-owner/contract.js
  - tests/compaction-eval/product-owner/expectations.json
  - tests/compaction-eval/product-owner/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.683Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 5: the product owner

## Problem statement

`agents/planning/product-owner.md` is 37,679 bytes and was dispatched 71 times in the seven
recorded weeks (68 in September, 3 in October; **read**), about 10 a week. At the pilot's ratio
the compaction removes about 12,700 bytes, about 128,000 bytes or 44,000 tokens a week
(**derived**). It has no method file. Fixed means: compacted by the rollout's method (the index),
every order kept and checked, at most its new ceiling, and no worse than the original on its smoke
check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/product-owner/baseline-agent.md`.

### What leaves, and what stays (by heading, **read**; byte sizes per section are measured at Step 9)

- **Leaves:** the reasons inside `## Anti-Patterns to Avoid` (each of the nine keeps its rule in one
  line), `## References` and its methodology sources, `## Tools Used` (a description of the
  frontmatter grant), and the second copy of the plan templates — the acceptance-criteria, scope and
  risk templates appear under Steps 3, 5 and 6 and again under `## Output Format`; the Output Format
  copy stays as the one template and the steps refer to it.
- **Stays, every order:** `## Role boundary` (business questions — pricing, business model, target
  customer, unit economics, key performance indicator selection — are out of scope; surface one
  through the status protocol and continue with technical work), the status protocol (the
  read-then-write of `<stubPath>.status` with its six fields), Steps 1 to 10 of the process, the
  Needs-Input Protocol, the Output Format, the Definition of Done, Downstream Validation, Timeout
  Handling, `## Writing questions to the streaming store`, the shared searching rule and
  `## Honest status (shared rule)` word for word.

### Pins (read only)

| Pin | Where it is held |
|---|---|
| zero unexecutable-order findings (the file is on the fence's fixed list of files that must stay clean; the status protocol's "done with the tools you hold" wording is why) | `tests/unexecutable-instruction-fence.test.js` |
| frontmatter byte for byte (`tools: Read, Write, Glob, Edit, Grep`, `model: opus`) | `tests/agent-tool-grants.test.js` |
| the status file's six fields `agent`, `status`, `started`, `completed`, `message`, `updatedAt` | `src/lib/background.js` (the shape authority the agent reads) |
| other named readers | `tests/agent-modernization.test.js`, `tests/architecture-invariants.test.js`, `tests/corpus-audit-ledger.test.js` |
| the honest-status reference and discipline words | `tests/agent-honest-status-fence.test.js` |
| fences over every agent | gate words, compliance claims, peer dispatch, watcher shape (see the index) |

### Size

Expected after: about 25,000 bytes. `maxBytes` is the achieved size and may only fall.

### Smoke check (three fixtures, six runs)

- **Mode:** scratch. The product owner rewrites a functional stub and its status file, so each run
  works in a copy outside the repository.
- **Brief:** copied at Step 8 from the WORK hand-off that follows the approval of a vision's stubs
  in `src/commands/start.md` (`approve-stubs` "hands the stubs off to `product-owner`"), naming the
  fixture's stub.
- **Contract adapter (`contract.js`):** reads the rewritten stub and its `.status` file from the
  captured files. Valid when the stub was rewritten, its frontmatter parses (the repository's own
  reader, named at Step 9) and carries the fields Step 7 of the baseline sets, its body holds every
  section of the baseline's Output Format (copied at Step 8), and the status file, if written, keeps
  its six fields. Findings: `criteria-measurable` (normal) when the criterion that covers the
  fixture's vague requirement states a number with a unit; `pricing-out-of-scope` (normal) when the
  plan sets no price and either names pricing as out of scope or surfaces it in a `needs-input`
  status; `question-raised` (important) when the status file is written with `status: needs-input`.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `vague-criterion` | a stub whose draft criterion reads "the page should be fast" | Step 3 and anti-pattern 2 (untestable criteria): the templates are merged and the anti-pattern's reasons cut | `criteria-measurable` present |
| 2 | `stub-asks-for-a-price` | a stub asking to "decide the monthly subscription price" | `## Role boundary` and the status protocol, tightened with the long status-protocol paragraph beside them | `pricing-out-of-scope` present |
| 3 | `clean-search-stub` | a well-formed stub with its vision | — | clean: `question-raised` absent |

**The clean fixture is verified before any run** (Step 8): `iron-loop-critic` reads the stub and its
vision for any defect of severity important or higher — a vague criterion, a missing scope, a
business decision left to the product owner; whatever it finds is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted product owner | the WORK hand-off after `approve-stubs` in `src/commands/start.md` | the owner's approval of a vision's stubs in `/ctoc:start` |
| `contract.js` | `tests/product-owner-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

Every order the baseline gives about which files the product owner writes (its Step 8 writes the
refined plan into the stub file; the status protocol writes `<stubPath>.status`), and the role
boundary, are in the inventory with anchors. Fixtures hold no credential-shaped string; runs happen
in a scratch copy.

### Conflicts with other plans

- This slice builds before `plans/todo/00297-…-s37-product-owner.md` (decision 3 below); that slice
  must be re-planned against the compacted text, inside this file's `maxBytes` and keeping every
  inventoried anchor.
- `plans/todo/dispatched-agents-route-their-questions-to-the-session.md` (approved) edits this
  file; both orders work, and if it builds first the baseline is its result.
- `plans/review/00110-agents-told-to-run-code-they-cannot-run.md` is built; its text is in the
  baseline.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/product-owner-compaction.test.js` passes the ten inventory checks and the adapter's cases;
   the order floor in the test is the count at extraction.
3. Every pin stands; every named test and fence passes unchanged.
4. The file is at most `maxBytes` (the achieved size); expected about 25,000 bytes; a miss is
   reported with its reason and no order dropped.
5. One copy of each plan template remains; at most five examples remain.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement; the median tokens
   and duration per version are recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **The Output Format copy of each template is the one kept**, because it is the shape the written
   plan must have; the process steps point to it.
2. **Each anti-pattern keeps its rule in one line**; its explanation is a reason and leaves (it
   stays word for word in the baseline).
3. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00297`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00297` is re-planned against the compacted text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [ ] Write `tests/product-owner-compaction.test.js`, the three fixtures (each stub with its `.status` file as the menu leaves it), `expectations.json` with its matchers, and the brief.
- [ ] Verify the clean fixture: dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader; measure section sizes with `units.js`; name the frontmatter reader the adapter uses.
- [ ] Confirm `00297` has not built (this slice goes first); check whether the question-routing plan has built and, if so, record that the baseline is its result.

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit in `rule-inventory.json`.
- [ ] Compact by hand in the original section order; set `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order (the templates above all), tightened orders for changed meaning.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the write-location orders and the role boundary present with their anchors; fixtures clean.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (scratch mode): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: one section before and after, the inventory counts, the smoke-check table, the size and token numbers.
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
