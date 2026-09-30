---
iron_loop_verdict: true
iron_loop: true
title: "The record check's final form — every file has exactly three complete rounds, and the run is declared complete"
type: implementation
parent_plan: every-agent-and-specialist-skill-improved-three-times
depends_on: 00380-every-agent-and-specialist-skill-improved-three-times-s120-security-scanner
priority: medium
files:
  - tests/agent-and-skill-improvement-record.test.js
  - .ctoc/audit/agent-and-skill-improvement/late-corrections.json
  - .ctoc/audit/agent-and-skill-improvement/for-the-human.json
  # RATCHET FILE — not counted toward the slice size. The validator reads this slice
  # as touching the record test, which moves the documented test-file count; the
  # release sync rewrites that count and the build needs the permission.
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-30T07:58:32.787Z
gate_crossed: implementation → todo
---

# The record check's final form — every file has exactly three complete rounds, and the run is declared complete

**Scope (one line):** after the last instrument's rounds (s120), change `tests/agent-and-skill-improvement-record.test.js` from its in-progress form (slice s2) to the final form the parent asks for — every inventoried file holds exactly three complete rounds — and check the Definition of Done item by item. No agent or skill file is edited in this slice.

## Implementation Details

### Why this slice exists, and why it comes last

The parent allows one new check and requires that it is "not red while the run is in progress" and that, once the run is complete, it "fails if any listed file lacks three complete rounds". Slice s2 wrote the in-progress form (structure, continuity and consistency; see its decision 2). This slice adds the requirement that can only hold at the end. It depends on s120 because it is the first moment at which every one of the 225 inventoried paths can have three rounds.

### 1. The final-form assertions added to the check

Added to the one check function that s2 wrote (the same function runs against the real record directory and against fixture directories under `os.tmpdir()`); every in-progress assertion stays:

1. **Exactly three complete rounds on every inventoried path** (Definition of Done 1). For each of the 225 entries in `inventory.json`, the record file at the mirrored location exists and holds exactly three round entries, numbered 1, 2 and 3, each complete in the shape the parent index fixes. The prerequisite entry on `agents/pipeline/agent-critic.md` and every late correction are not round entries and are not counted.
2. **No round is held.** Every record's `held` field is `null`. A held round is a round the human has not yet released (a wrong fence, a circuit-breaker stop, an unresolved late correction), so the run is not complete while one exists.
3. **Nothing refuted is left** (Definition of Done 2). In each record, round 3's `validator_final` counts zero `FABRICATED`, zero `MISATTRIBUTED` and zero `UNSOURCEABLE`.
4. **Every late correction is settled** (Definition of Done 9). Every entry in `late-corrections.json` either has `applied: true` with its fence results and full-gate result recorded, or has `applied: false` with `not_applied_because` one of `breaks-a-pinned-contract`, `needs-a-wider-tool-grant` or `human-declined`, and a `for_the_human_id` that exists. None is left with `edit-protection-refused-scope-growth-filed`, the waiting value the slices use while a scope-growth request is open (the slices' decision 2). Each entry carries the date checked, the refuting source's address and quote, the before and after text and the validator's verdict.
5. **Every finding that could not be applied is listed for the human with its options** (Definition of Done 6). Every entry in `for-the-human.json` has non-empty `evidence` and at least two `options`.
6. **The two tool lines** (Definition of Done 8) — already asserted by the in-progress form; kept.

**Its teeth, as fixture cases** that must be rejected, each asserting the specific failure it names: a record with two rounds; a record with a non-null `held`; a round 3 whose `validator_final` counts one `FABRICATED`; a late correction still carrying `edit-protection-refused-scope-growth-filed`; a `for-the-human.json` entry with one option. Plus one well-formed complete fixture that must pass, so the rejections are not vacuous. The in-progress fixture cases from s2 stay.

### 2. The Definition of Done items the check does not hold

Checked by the executor at the end of this slice and written into this plan's `## Execution Record` section (the section the executor contract records into, excluded from the approval hash), so the human reads them at the moment he decides whether the run is done:

- **Definition of Done 3:** the full `npm test` result — suite, coverage floor 99 from `.ctoc/coverage-baseline.json` unchanged, zero skipped, no new warning or deprecation.
- **Definition of Done 4:** 124 agent files in 24 categories and 101 skill bodies, from a listing of the disk, and the README-numbers checks green.
- **Definition of Done 5:** the list of every path changed since the commit before the prerequisite slice (s1), from git's own record of the commits, with each path shown to fall inside `agents/**/*.md`, `skills/**/SKILL.md`, `.ctoc/audit/agent-and-skill-improvement/**`, the one new test, or the files the release script rewrites; any path outside that set is listed, not hidden.
- **The claims ledger:** the digest of `.ctoc/verification/claims-ledger.json` compared with the inventory's `claims_ledger_sha256_at_start`. If they differ, a `for-the-human.json` entry of kind `claims-ledger-changed` records both digests; this work never writes the ledger (the parent's decision 3), so a difference means something else wrote it, which the human should know. It is not a test assertion, for the reason in s2's decision 4.
- **Definition of Done 7:** one commit per slice carrying a patch version, from git's record; nothing pushed.

### Contracts and fences that must stay green

- The record check itself, in both its in-progress and final assertions.
- Everything the full gate runs. This slice edits no agent and no skill. The test file already exists, so the documented test-file count does not move and `CLAUDE.md` is not declared.

### How to verify

1. Written test-first: add the final-form fixture cases and the real-directory assertion, run the test, and record the fixture cases failing because the check function does not yet hold the new rules — that failure is the proof the new rules have teeth.
2. Add the rules to the check function; the fixture cases pass and fail exactly as named.
3. Run the check against the real record directory. If it is red, the run is not complete: the failing paths, held rounds and unsettled late corrections are listed for the human with the check's exact output, and the check is not weakened to go green (the parent's standing rule 9).
4. `npm test` — the suite, the coverage floor of 99 read from `.ctoc/coverage-baseline.json`, zero skipped; `node --test` alone is not the gate. A printed warning or deprecation is a defect to fix.
5. Write the Definition of Done results into this plan's `## Execution Record`.
6. One commit for the slice carrying a patch version per the release rule; nothing pushed. Whether the run is done is the human's decision.

### Wiring — the live call sites

The test file is reached by the gated suite (`npm test` runs `src/scripts/test-gate.js`, which runs every `tests/*.test.js`). No module under `src/` is added or changed.

### Security review

- The fixture directories live under `os.tmpdir()` and are removed after the test.
- The check reads paths, digests and counts; it prints no file content and no secret.
- The check may only be made stricter than the in-progress form, never looser.

## Decisions Taken Under Ambiguity

1. **`human-declined` is the one addition to the not-applied reasons.** The parent names two reasons a late correction is not applied (it would break a pinned contract, or it would need a wider tool grant). The slices add a waiting state when the edit protection refuses a finished file's correction and a scope-growth request is filed; when the human answers that request by declining, the correction stays unapplied on his decision, and the record says so. A correction still waiting blocks the run's completion.
2. **The Definition of Done items that need git or a disk listing are checked by the executor, not by the test.** A test that reads git history or the claims ledger's digest would fail on acts that are the human's (running the verifier, a later commit); the executor checks them once, at the end, and writes the results where the human reads them.
3. **A red final check is a finding, not a failure of this slice's design.** If any file lacks its rounds when this slice runs, the check is right to be red; the slice stops and puts the list to the human rather than recording the run as complete.


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
