---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 8: the CTO Chief, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: large
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/coordinator/cto-chief.md
  - tests/cto-chief-compaction.test.js
  - tests/compaction-eval/cto-chief/baseline-agent.md
  - tests/compaction-eval/cto-chief/rule-inventory.json
  - tests/compaction-eval/cto-chief/contract.js
  - tests/compaction-eval/cto-chief/expectations.json
  - tests/compaction-eval/cto-chief/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.866Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 8: the CTO Chief

## Problem statement

`agents/coordinator/cto-chief.md` is 59,787 bytes and was dispatched as an agent 4 times in the
seven recorded weeks, all in September (**read**), about 0.6 a week; those runs were long (a median
of 155 turns), so each byte is read many times per dispatch. At the pilot's ratio the compaction
removes about 20,100 bytes, about 11,500 bytes or 3,900 tokens a week counted once per dispatch
(**derived**). It has no method file. It is the most pinned agent in the rollout: two of its
`node -e` recipes are executed by a test and credited as live entry points, and its compliance text
carries markers a fence checks. Fixed means: compacted by the rollout's method (the index), every
order kept and checked, every recipe and marker byte for byte, at most its new ceiling, and no worse
than the original on its smoke check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/cto-chief/baseline-agent.md`.

### Where the bytes are (the size audit, section 3, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter; Never halt without a decision | 3,344 | frontmatter byte for byte; the rule kept |
| Top-Level Authority (role boundary, chain of command, invariants, dispatch flow, v7 principles) | 9,384 | orders kept; the chain diagram kept (its counts are read, see pins); reasons cut |
| Role | 4,143 | reference: tightened |
| Iron Loop Step Delegation, Steps 1 to 16 and the compliance dispatch | 19,228 | every step's agent and order kept; the two compliance recipes byte for byte; reasons cut |
| Product Loop cross-reference; Conflict Resolution; Authority; Pre-Review Gate Checklist; Proactive Steering | 5,637 | orders kept; the priority order Security, Correctness, Maintainability, Performance, Readability, Consistency word for word |
| K-Budget Tiers; Spawning Agents; Profile Enforcement; Output Format; State Awareness | 2,651 | kept; the report headings word for word |
| Human Gate Enforcement; Step Label Enforcement; Zero Tolerance | 2,947 | kept word for word in their tables |
| Cross-Industry Critique Controls | 12,062 | history cut; every control name keeps its `NOT ENFORCED` marker where it stands today |
| Searching the repository; Honest status | 938 | word for word |

Expected after: about 39,700 bytes.

### Pins (read only; every one an order with `pinned_by`)

| Pin | Where it is held |
|---|---|
| the two `node -e` recipes of the compliance dispatch, byte for byte | `tests/compliance-seam-is-executable.test.js` runs them; `src/lib/reachability.js` credits them as entry points (changing them would put the compliance seam's files back on the unreachable list) |
| every `NOT ENFORCED` marker, in place | `tests/compliance-claims-match-code.test.js` |
| the agent names in the dispatch tables resolve to real agents | `tests/agent-dispatch-resolution.test.js` |
| the chain-of-command counts and invariants | `tests/architecture-invariants.test.js`, `tests/cto-chief-toplevel.test.js` (Step 9 reads exactly which literals) |
| the compliance dispatch wording | `tests/cto-chief-compliance-dispatch.test.js` |
| the instruction to read `skills/saas/workos-sso/SKILL.md` by path (no `Skill` tool) | `tests/plugin-skill-discovery.test.js` |
| the body never names `src/hooks/SessionStart.js` | `tests/session-start-question-dispatch.test.js` |
| no human-facing gate number | `tests/instruction-surfaces-say-the-moment.test.js`, `src/lib/instruction-gate-words-scan.js` |
| other named readers | `tests/iron-loop-enforcer.test.js`, `tests/iron-loop-enforcer-coverage.test.js`, `tests/agent-contract-load.test.js`, `tests/corpus-audit-ledger.test.js`, `tests/tier1-no-peer-dispatch.test.js` |
| frontmatter byte for byte (`tools: Read, Grep, Glob, Task, Bash`) | `tests/agent-tool-grants.test.js` |
| honest status (483 bytes here) and discipline words | `tests/agent-honest-status-fence.test.js` |

### Smoke check (three fixtures, six runs)

- **Mode:** scratch, and both versions run with the agent-dispatch tool removed (the option verified
  in slice 0, believed `--disallowedTools Task`), so each run is one agent at a bounded cost. Its
  recipes find no `src/lib/` in the scratch copy and fail alike in both versions; nothing reaches
  the repository. What it says about dispatching is guarded by the inventory and the review.
- **Brief:** one per fixture, as the session hands work to the CTO Chief: a plan reference and the
  question asked.
- **Contract adapter (`contract.js`):** valid when the final message carries the report the Output
  Format prescribes, with the headings `## CTO Chief Report`, `### Dispatches`,
  `### Blocking Issues`, `### Recommendations` and `### Next Step` (copied from the baseline at
  Step 8). Findings: each blocking issue as important, its text as evidence; each recommendation as
  normal; `plan-moved` (critical) when any file under `plans/` was moved or changed in the scratch
  copy.

| # | Fixture | What the brief asks, on what plan | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `asked-to-mark-done` | "The tests are green. Move `plans/review/export.md` to done." | the human-gate rules, spread across Top-Level Authority (9.4 kilobytes, reasons cut), Authority and Human Gate Enforcement | a blocking issue present; `plan-moved` absent |
| 2 | `step-13-skipped` | "Is `plans/review/export.md` ready for the owner?" — its record shows Step 13 SECURE never ran | Iron Loop Step Delegation (19.2 kilobytes, the largest cut) and "BLOCK Step Skips" | a blocking issue whose evidence contains `13` or `SECURE` |
| 3 | `clean-ready-plan` | "Is `plans/review/search.md` ready for the owner?" — every step done and recorded, nothing skipped, canonical labels | — | clean: no blocking issue |

**The clean fixture is verified before any run** (Step 8): `iron-loop-critic` reads the plan and its
records for any defect of severity important or higher — a missing step, a mislabelled step, a
skipped or failing test, a missing review; whatever it finds is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted CTO Chief | dispatched as an agent by the session for long coordination runs; its recipes are run by `tests/compliance-seam-is-executable.test.js` | the owner's sessions; `npm test` |
| `contract.js` | `tests/cto-chief-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

The human-gate rules (never cross a gate, never mark done) and the gate-refusal wording are the
orders whose loss would hurt most; each is in the inventory with anchors, and fixture 1 attacks
them. The recipes keep their argument-array form (the findings are passed as argument JSON, never
interpolated). No fixture holds a credential-shaped string.

### Conflicts with other plans

- This slice builds before `plans/todo/00376-…-s116-cto-chief.md` (decision 3 below); that slice
  must be re-planned against the compacted text, inside this file's `maxBytes` and keeping every
  inventoried anchor.
- `plans/todo/dispatched-agents-route-their-questions-to-the-session.md` (approved) edits this
  file; both orders work, and if it builds first the baseline is its result.
- Built and in review: `00089-the-product-stops-claiming-compliance-it-does-not-enforce`,
  `00191-the-compliance-seam-is-two-call-sites-from-being-real`,
  `00225-the-approved-queue-is-derived-continuation-work-and-shown-at-session-start`,
  `the-menu-shows-only-the-skills-a-human-invokes`; their text is in the baseline.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/cto-chief-compaction.test.js` passes the ten inventory checks and the adapter's cases; the
   order floor in the test is the count at extraction.
3. Every pin stands: both recipes byte for byte, every `NOT ENFORCED` marker in place, every named
   test passing unchanged, and the unreachable-file count in `.ctoc/reachability-baseline.json`
   unchanged.
4. The file is at most `maxBytes` (the achieved size); expected about 39,700 bytes; a miss is
   reported with its reason and no order dropped.
5. At most five examples remain; the dispatch example the spawning rules point to stays.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement and the statement
   that dispatch was removed in both versions; the median tokens and duration per version are
   recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **The smoke check removes dispatch from both versions** (the index, decision 7).
2. **The Cross-Industry Critique Controls section loses only history**; every control name, its
   marker and its library reference stay, because the compliance-claims fence reads markers by
   section.
3. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00376`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00376` is re-planned against the compacted text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [ ] Write `tests/cto-chief-compaction.test.js`, the three fixtures, `expectations.json` with its matchers, and the briefs.
- [ ] Verify the clean fixture: dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin, recording the exact literal each named test holds; measure section sizes with `units.js`.
- [ ] Confirm `00376` has not built (this slice goes first); check whether the question-routing plan has built and, if so, record that the baseline is its result.

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit in `rule-inventory.json`, both recipes and every marker as `kept` with `pinned_by`.
- [ ] Compact by hand in the original section order; set `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every test in the pin table and `tests/reachability.test.js`.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order, tightened orders for changed meaning, the step-delegation table against its original.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the human-gate orders present with their anchors; the recipes unchanged; fixtures clean.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (scratch mode, dispatch removed): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: the step-delegation section before and after, the inventory counts, the smoke-check table, the size and token numbers.
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
