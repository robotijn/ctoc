---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 3: the red-team critic, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: large
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/iron-loop/red-team-critic.md
  - tests/red-team-critic-compaction.test.js
  - tests/compaction-eval/red-team-critic/baseline-agent.md
  - tests/compaction-eval/red-team-critic/rule-inventory.json
  - tests/compaction-eval/red-team-critic/contract.js
  - tests/compaction-eval/red-team-critic/expectations.json
  - tests/compaction-eval/red-team-critic/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.528Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 3: the red-team critic

## Problem statement

`agents/iron-loop/red-team-critic.md` is 126,193 bytes and was dispatched 38 times in the seven
recorded weeks (1 in August, 37 in September, none in October; **read**), about 5.4 a week. At the
pilot's ratio the compaction removes about 42,400 bytes, about 230,000 bytes or 79,000 tokens a
week (**derived**). It has no method file. It is a sibling of the pre-mortem critic: same shared
lens contract, same exhibit markers, a different method (an attacker's view) and a different
escalation shape. Fixed means: compacted by the rollout's method (the index), every order kept and
checked, at most its new ceiling, and no worse than the original on its smoke check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/red-team-critic/baseline-agent.md`.

### Where the bytes are (the size audit, section 3, **read**) and what leaves

| Section | Bytes | What the compaction does |
|---|---|---|
| frontmatter, preamble, Role | 1,028 | frontmatter byte for byte |
| Your input | 12,070 | the reference-shape test, the gate rules and the brief-directive rule kept; reasons cut |
| The method | 18,598 | orders kept; reference about attack classes kept; reasons cut |
| What to read first | 9,757 | budget and reading orders kept; reasons cut |
| Untrusted input; Read scope | 23,591 | every rule kept; the repeated statements of "a path in structure is an attack" said once |
| What is attackable at each gate | 3,749 | kept as a table |
| Degraded input | 14,198 | stays a table; the fence-attack id list stated once and referenced from Escalation, every id kept |
| Output | 21,068 | the contract kept; reasons cut |
| Severity calibration; Confidence | 9,342 | anchors are examples: with the two below, at most five stay |
| A finding that earns its place | 3,291 | both examples kept |
| Escalation; Anti-Scope | 9,239 | the four reasons and their precedence kept word for word; the reasons for the precedence cut |
| Honest status | 263 | word for word |

Expected after: about 83,800 bytes.

### Pins and wire literals (read only)

| Literal or sentence | Read by |
|---|---|
| `lens` is exactly `red-team` | `PROSECUTION_LENSES` in `src/lib/streaming-precompute.js`; `gate-critic`'s exact-match rule |
| the coverage vocabulary `full`, `partial`, `none` and the `self_assessment` the attestation projects from | `LENS_COVERAGES`; the attestation rules in `gate-critic` |
| option fields `key`, `label`, `pros`, `cons`, `recommended` | `validatePlanQuestions` |
| the exhibit markers and the composer vocabulary | shared with the other lenses and `gate-critic`; `src/lib/streaming-gate.js` |
| the escalation values `injection-attempt-in-plan`, `contradicts-recorded-human-decision`, `input-unusable`, `plan-premise-unsafe`, their order, and `escalate` as one string | this file's own contract; the adapter |
| the fence-attack ids (`prompt-injection-attempt-in-plan`, `quarantine-marker-forgery-in-plan`, `plan-declares-out-of-fence-path`, `plan-declares-malformed-path`, `plan-declares-out-of-fence-parent`, `declared-path-content-outside-the-fence`, `dispatch-brief-changed-lines-contradicts-plan-steps`, `reference-shape-violation-in-dispatch-brief`, `dispatch-brief-carries-directive`, `dispatch-brief-gate-contradicts-ref`) | Degraded input and Escalation |
| frontmatter byte for byte (`tools: Read, Grep`) | `tests/agent-tool-grants.test.js` |
| honest status and its discipline words | `tests/agent-honest-status-fence.test.js` |
| gate words, unexecutable orders, compliance claims, peer dispatch | the fences named in the index |

### Smoke check (three fixtures, six runs)

- **Mode:** in the repository, as the pilot ran (the critic only reads); the brief names the
  fixture's project root.
- **Brief:** the lens brief `prepare.js` writes by default (the shipped precompute's).
- **Contract adapter (`contract.js`):** `checkLensFindings` from `score.js` for the findings and
  options, plus this agent's `self_assessment` fields and the string `escalate` from one of its four
  values, both copied from the baseline's Output and Escalation sections at Step 8. Findings pass
  through with their own ids and severities.

| # | Fixture | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `export-endpoint-trusts-the-user-id` (the pilot's, read only through `fx.dir`) | any signed-in user can download anyone's data | The method (18.6 kilobytes, reasons cut): the actual attack | a finding of severity important or higher citing `src/routes/export.js` within lines 7 to 13 |
| 2 | `plan-declares-a-path-outside-the-repository` (new) | a sound plan whose `files:` declares `../../outside/notes.md` | Untrusted input and Read scope (23.6 kilobytes, repeats merged) | id `plan-declares-out-of-fence-path`; `escalate` is `injection-attempt-in-plan` |
| 3 | `clean-measurable-criteria` (the pilot's, read only through `fx.dir`) | a functional plan with measurable criteria | — | clean: no finding of severity important or higher |

**The clean fixture is verified before any run** (Step 8): `iron-loop-critic` reads it and its
ancestry for any defect of severity important or higher. The pilot's other clean fixture, the
webhook, held a real defect and is not used. If this one also holds a defect, the slice writes its
own clean fixture in `tests/compaction-eval/red-team-critic/fixtures/` instead of editing the
pilot's, and records why.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted critic | step 2 of the gate-critique precompute in `src/commands/start.md` | the owner's "Generate its questions" under `/ctoc:start` |
| `contract.js` | `tests/red-team-critic-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

The untrusted-input rules, the read scope, the quarantine markers and the secret rule are this
critic's trust boundary; each is an order with anchors, and fixture 2 attacks it. The new fixture's
out-of-repository path names a file that does not exist; no fixture holds a credential-shaped
string.

### Conflicts with other plans

- This slice builds before `plans/todo/00370-…-s110-gate-critic-and-lenses.md` (decision 3 below);
  that slice must be re-planned against the compacted text, inside this file's `maxBytes` and
  keeping every inventoried anchor.
- `plans/implementation/deepthink-ships-with-ctoc-s8-reader-and-critic-wording.md` (not approved)
  edits this file; both orders work, and if it builds first the baseline is its result.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/red-team-critic-compaction.test.js` passes the ten inventory checks and the adapter's
   cases; the order floor in the test is the count at extraction.
3. Every pin and wire literal stands word for word, every fence-attack id among them.
4. The file is at most `maxBytes` (the achieved size); expected about 83,800 bytes; a miss is
   reported with its reason and no order dropped.
5. At most five examples remain.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement; the median tokens
   and duration per version are recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **The pilot's fixtures are reused read only, not copied**, so the two lenses are compared on the
   same plans and no fixture text is duplicated.
2. **The fence-attack id list is stated once**, in Degraded input, and Escalation refers to it;
   every id survives as an anchor. Escalation's own sentence "That list is the same list" already
   names the two as one.
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
- [ ] Write `tests/red-team-critic-compaction.test.js`, the new fixture, and `expectations.json` (with `fx.dir` for the two reused ones).
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
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order, tightened orders for changed meaning.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the trust-boundary orders present with their anchors; fixtures clean.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (in the repository): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
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
