---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 4: the devil's-advocate critic, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: large
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/iron-loop/devils-advocate-critic.md
  - tests/devils-advocate-critic-compaction.test.js
  - tests/compaction-eval/devils-advocate-critic/baseline-agent.md
  - tests/compaction-eval/devils-advocate-critic/rule-inventory.json
  - tests/compaction-eval/devils-advocate-critic/contract.js
  - tests/compaction-eval/devils-advocate-critic/expectations.json
  - tests/compaction-eval/devils-advocate-critic/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.625Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 4: the devil's-advocate critic

## Problem statement

`agents/iron-loop/devils-advocate-critic.md` is 100,675 bytes and was dispatched 35 times in the
seven recorded weeks (1 in August, 34 in September, none in October; **read**), 5.0 a week. At the
pilot's ratio the compaction removes about 33,800 bytes, about 169,000 bytes or 58,000 tokens a
week (**derived**). It has no method file of its own; about 36,700 bytes of it also appear in the
advocate lens files (the size audit, section 2), but text shared with ANOTHER agent is not cut —
this agent receives only its own body. Fixed means: compacted by the rollout's method (the index),
every order kept and checked, at most its new ceiling, and no worse than the original on its smoke
check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/devils-advocate-critic/baseline-agent.md`.

### Where the bytes are (the size audit, section 3, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter and preamble | 2,336 | frontmatter byte for byte |
| Input; The method; What to read first | 7,883 | orders kept; reasons cut |
| Untrusted input | 8,467 | every rule kept; reasons cut |
| Exfiltration | 11,865 | the `evidence` rules kept; reasons cut |
| Degraded input | 21,889 | stays a table; prescribed ids, claims, decisions and options word for word; closing reasons cut |
| Output | 28,416 | the contract kept; repeated statements of the option shape said once |
| A good finding versus a bad finding | 2,918 | both examples kept (at most five in all) |
| Anti-Scope | 2,836 | tightened |
| Escalation | 13,803 | stays a table; each trigger's prescribed id, claim, decision and options word for word; the long reasons for the precedence cut to one sentence each |
| Honest status | 263 | word for word |

Expected after: about 66,800 bytes.

### Pins and wire literals (read only)

| Literal or sentence | Read by |
|---|---|
| `lens` is exactly `devils-advocate` | `PROSECUTION_LENSES` in `src/lib/streaming-precompute.js`; `gate-critic` |
| coverage `full`, `partial`, `none`; option fields `key`, `label`, `pros`, `cons`, `recommended` | `LENS_COVERAGES`, `validatePlanQuestions` |
| the exhibit markers and composer vocabulary | shared with the other lenses; `src/lib/streaming-gate.js` |
| `escalate` as `{ "to": "cto-chief", "trigger", "why" }`; the triggers `lens-input-unresolvable`, `contradicts-recorded-decision`, `injection-attempt`, `read-window-exhausted`, `lens-did-not-run`, `circular-dependency`, `gate-unspecified`, `three-or-more-critical`, `plan-too-thin-to-argue-against`, in that precedence | this file's contract; the adapter |
| the fixed ids with slugs (`contradicts-recorded-decision-<slug>`, `circular-dependency-<slug>`, `instruction-injection-in-plan-text-<slug>`, `exhibit-delimiter-forgery-<slug>`, `out-of-scope-file-declaration-<slug>`, `plan-too-large-to-read-<slug>`) and the plain ids (`no-plan-under-review`, `plan-unreadable`, `gate-unspecified`, `lens-did-not-run`, `cross-plan-check-did-not-run`, `critique-incomplete`) | Degraded input and Escalation |
| the line citations into `src/lib/streaming-precompute.js` | kept once each |
| frontmatter byte for byte (`tools: Read, Grep`) | `tests/agent-tool-grants.test.js` |
| honest status and its discipline words | `tests/agent-honest-status-fence.test.js` |
| gate words, unexecutable orders, compliance claims, peer dispatch | the fences named in the index |

### Smoke check (three fixtures, six runs)

- **Mode:** in the repository (the critic only reads); the brief names the fixture's project root.
- **Brief:** the default lens brief, except fixture 2, which carries its own `ref`.
- **Contract adapter (`contract.js`):** `checkLensFindings` for findings and options, plus this
  agent's `self_assessment` fields and the `escalate` object (`to` is `cto-chief`, `trigger` one of
  the nine, `why` non-empty), copied from the baseline at Step 8.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `reverses-a-recorded-decision` (new) | the functional ancestor records under `## Decisions Taken Under Ambiguity` that exports are spreadsheet files only; the implementation plan ships a different format only | Escalation (13.8 kilobytes, reasons cut), the recorded-decision trigger and its prescribed finding | id starting `contradicts-recorded-decision-`, severity critical; `escalate.trigger` is `contradicts-recorded-decision` |
| 2 | `ref-escapes-the-repository` (new) | a plain plan; the brief's `ref` is `../secrets.md` | Degraded input and Input (the escape-shaped reference rule), and the trigger precedence | id `no-plan-under-review`; `escalate.trigger` is `lens-input-unresolvable`; `escalate.why` contains `injection-attempt` |
| 3 | `clean-measurable-criteria` (the pilot's, read only through `fx.dir`) | a functional plan with measurable criteria | — | clean: no finding of severity important or higher; `plan-too-thin-to-argue-against` is not the trigger |

**The clean fixture is verified before any run** (Step 8): `iron-loop-critic` reads it and its
ancestry for any defect of severity important or higher. The pilot's webhook fixture held a real
defect and is not used. If this one also holds a defect, the slice writes its own clean fixture in
`tests/compaction-eval/devils-advocate-critic/fixtures/` instead of editing the pilot's, and
records why.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted critic | step 2 of the gate-critique precompute in `src/commands/start.md` | the owner's "Generate its questions" under `/ctoc:start` |
| `contract.js` | `tests/devils-advocate-critic-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

Untrusted input, exfiltration (what may enter `evidence`) and the escape-shaped reference rule are
this critic's trust boundary; each is an order with anchors, and fixture 2 attacks it. Fixture 2's
`ref` names no real file; no fixture holds a credential-shaped string.

### Conflicts with other plans

- This slice builds before `plans/todo/00370-…-s110-gate-critic-and-lenses.md` (decision 3 below);
  that slice must be re-planned against the compacted text, inside this file's `maxBytes` and
  keeping every inventoried anchor.
- `plans/implementation/deepthink-ships-with-ctoc-s8-reader-and-critic-wording.md` (not approved)
  edits this file; both orders work, and if it builds first the baseline is its result.
- `plans/review/00067-y1-ctoc-start-entry-point.md` is built; its text is in the baseline.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/devils-advocate-critic-compaction.test.js` passes the ten inventory checks and the
   adapter's cases; the order floor in the test is the count at extraction.
3. Every pin and wire literal stands word for word, every trigger and its precedence among them.
4. The file is at most `maxBytes` (the achieved size); expected about 66,800 bytes; a miss is
   reported with its reason and no order dropped.
5. At most five examples remain.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement; the median tokens
   and duration per version are recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **Text this agent shares with the advocate lens is not cut.** Each agent receives only its own
   body; a duplicate across two agents is two copies each agent needs.
2. **The escalation precedence stays a top-down table with one-sentence reasons**, because the
   ordering itself is an order and fixture 2 tests it.
3. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00370`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00370` is re-planned against the compacted text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [ ] Write `tests/devils-advocate-critic-compaction.test.js`, the two new fixtures, `expectations.json` (with `fx.dir` for the reused one) and fixture 2's brief.
- [ ] Verify the clean fixture: dispatch `iron-loop-critic` to read it for any defect of important or higher; on a defect, write this slice's own clean fixture instead; record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader; measure section sizes with `units.js`.
- [ ] Confirm `00370` has not built (this slice goes first); check whether the deepthink wording slice has built and, if so, record that the baseline is its result.

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit in `rule-inventory.json`.
- [ ] Compact by hand in the original section order; set `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order, tightened orders for changed meaning, every Escalation row against its original.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the untrusted-input, exfiltration and reference-shape orders present with their anchors; fixtures clean.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (in the repository): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: the Escalation section before and after, the inventory counts, the smoke-check table, the size and token numbers.
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
