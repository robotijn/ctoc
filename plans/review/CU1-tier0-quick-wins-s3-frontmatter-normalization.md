---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T21:09:40.524Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "CU1 s3 — frontmatter normalization (allowed-tools→tools, unit-test-runner type:skill, conformance test)"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/realtime/hil-harness/SKILL.md
  - skills/realtime/wcet-budget/SKILL.md
  - skills/safety/fault-tree-builder/SKILL.md
  - skills/safety/fmeda-analyzer/SKILL.md
  - skills/safety/redundancy-pattern-picker/SKILL.md
  - skills/testing/runners/unit-test-runner/SKILL.md
  - tests/architecture-invariants.test.js
---

# CU1 s3 — frontmatter normalization

> Slice 3 of the CU1 decomposition. Two deprecated-frontmatter fixes plus the new
> conformance test that locks them in: (a) rename `allowed-tools:` → `tools:` in
> the 5 realtime/safety SKILL.md files; (b) add `type: skill` to
> `unit-test-runner/SKILL.md`; (c) add a frontmatter-conformance describe block to
> `tests/architecture-invariants.test.js` that reads every SKILL.md and asserts
> `type: skill` present + `allowed-tools:` absent.

Maps to CU1 acceptance criteria: **"allowed-tools key is normalized"**,
**"frontmatter-conformance test is added"**, **"unit-test-runner gains type:
skill frontmatter"**.

## Implementation Details

### Architecture Decision

`grep -rl "allowed-tools:" skills/` returns **exactly 5 files** (confirmed
2026-07-08): `skills/realtime/hil-harness`, `skills/realtime/wcet-budget`,
`skills/safety/fault-tree-builder`, `skills/safety/fmeda-analyzer`,
`skills/safety/redundancy-pattern-picker` — matching the audit's "~5" estimate.
All other SKILL.md files use `tools:`. `unit-test-runner/SKILL.md` is missing
`type: skill` (confirmed by grep — its frontmatter has `model_optimized_for` at
line 19 but no `type:` line).

The conformance test is placed in `tests/architecture-invariants.test.js` because
that file already has a `walkSkillFiles(dir, opts)` helper (line 24) used by the
Tier-2 skill assertions (lines 218, 327) — minimal infrastructure duplication.
The new describe block reuses `walkSkillFiles(path.join(projectRoot, 'skills'))`
to walk the whole tree.

These three sub-items ship together because the conformance test is the
specification that locks in the two edits: the test would go red if either edit
were missing, and green only when both are done — they are one cohesive unit of
work (fix + the test that enforces the fix, per SIP1's "never split a
module from its test").

### Dependency Graph

```
5 realtime/safety SKILL.md (MODIFY: allowed-tools: → tools:)  ─┐
unit-test-runner/SKILL.md  (MODIFY: add type: skill)          ─┼─> tests/architecture-invariants.test.js
                                                                     (MODIFY: add conformance describe block
                                                                      that reads ALL SKILL.md and asserts
                                                                      type:skill present + allowed-tools: absent)
```

No cycle. `depends_on: none` — independent of s1/s2 (touches
`architecture-invariants.test.js` too; see Ordering note below).

**Ordering note vs s1:** s1 and s3 both MODIFY `tests/architecture-invariants.test.js`
(s1 adds one `TIER_1_AGENTS` entry; s3 adds a new describe block at end of file).
These are non-overlapping regions but the SAME file — per CTOC "never assign two
subagents to the same file", **s3 depends_on s1 for execution ordering is NOT
declared** because both are single-file sequential edits by the plan-serial FIFO
executor (plans run one at a time). The executor MUST run s1 before s3 (or vice
versa) — never concurrently. Recorded here so the human sequences them serially;
the parent index notes the shared file.

### File Specifications

#### The 5 realtime/safety SKILL.md files (all MODIFY, identical transform)
**Action:** MODIFY
**Change:** rename the frontmatter key `allowed-tools:` to `tools:` and reformat
its value to the STRING style used by the other SKILL.md files (e.g.
`tools: Read, Grep, Bash`). The tool set before and after MUST be identical — no
tool added or dropped.
**Procedure per file:** read the current `allowed-tools:` value (may be YAML
array `[Read, Write]` or block list); write the same tools as the comma-separated
string form the rest of the corpus uses. Diff the tool set before/after to prove
equality.

#### File: `skills/testing/runners/unit-test-runner/SKILL.md`
**Action:** MODIFY
**Change:** add `type: skill` to the YAML frontmatter block (it currently lacks a
`type:` line). Place it consistently with sibling skills' field order. No other
frontmatter field changed.

#### File: `tests/architecture-invariants.test.js`
**Action:** MODIFY
**Change:** add a new `describe('Frontmatter conformance — SKILL.md', ...)` block.
Inside, one `it(...)` that:
- walks all SKILL.md under `skills/` via `walkSkillFiles(path.join(projectRoot,
  'skills'))`;
- for each, reads the frontmatter and `assert.match(fm, /^type:\s*skill$/m,
  \`${rel} must declare type: skill\`)`;
- and `assert.doesNotMatch(fm, /^allowed-tools:/m, \`${rel} must NOT use
  allowed-tools:\`)`.
Use the existing `readFM` helper for frontmatter extraction (same pattern as the
Tier-1 block at line 127).

### Test Plan

Content-contract, zero doubles: the new conformance `it` block reads EVERY real
SKILL.md off disk and asserts against its actual frontmatter — no mock, no stub.
It is simultaneously the regression guard for the 6 edits in this slice and a
corpus-wide invariant.

Verification (from the AC):
- Before edits: baseline green; `grep -rl "allowed-tools:" skills/` returns 5.
- After edits: `grep -rl "allowed-tools:" skills/` returns empty; each of the 5
  files loads with an identical tool set (before/after diff proves it);
  `unit-test-runner/SKILL.md` frontmatter contains `type: skill`.
- The new conformance `it` block passes for the whole corpus (every SKILL.md has
  `type: skill` and none has `allowed-tools:`). **If the block finds an existing
  SKILL.md missing `type: skill` outside this slice's scope, that is a real
  finding — record it in the ledger; do NOT silently edit an out-of-scope file
  (no-churn). The executor surfaces it as a documented choice.**
- `node --test tests/*.test.js` → `# fail 0` after each edit (continuous-green).

### Security Review

- No runtime path handling changed; test uses `walkSkillFiles` over the
  hardcoded `skills/` root.
- Tool-list reformat is the only value change; before/after diff prevents silent
  privilege change (a skill loaded with wrong tools silently restricts Claude —
  MEDIUM impact per the parent risk register).
- No secrets, no `execSync`.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Confirm `grep -rl "allowed-tools:" skills/` = the 5
enumerated files and `unit-test-runner/SKILL.md` lacks `type:`. Write the new
conformance describe block FIRST (TDD-red): it should FAIL against the current
corpus (unit-test-runner missing `type: skill`, 5 files carrying
`allowed-tools:`), proving the test actually tests something.

### Step 9: PREPARE
Read each of the 5 realtime/safety SKILL.md frontmatter blocks to capture the
exact current `allowed-tools:` value/format. Read `unit-test-runner/SKILL.md`
frontmatter. Read `walkSkillFiles` (line 24) and `readFM` helper signatures so
the new block reuses them correctly.

### Step 10: IMPLEMENT
(a) Rename `allowed-tools:` → `tools:` (string form) in all 5 files, preserving
the tool set. (b) Add `type: skill` to `unit-test-runner/SKILL.md`. (c) The
conformance block written at Step 8 now turns green. ONE step, three sub-items.

### Step 11: REVIEW
Self-review: 5 files' tool sets unchanged (before/after diff); `type: skill`
present in unit-test-runner; conformance block reads the real corpus; no
out-of-scope file edited.

### Step 12: OPTIMIZE
Confirm the conformance block reuses `walkSkillFiles`/`readFM` rather than
re-implementing a walker (no duplication).

### Step 13: SECURE
Run Security Review checklist. Prove tool-set equality for all 5 files.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`. `grep -rl "allowed-tools:" skills/`
→ empty. Conformance block green corpus-wide.

### Step 15: DOCUMENT
Record in ledger (s6): the 5 normalized files (with before/after tool sets),
unit-test-runner type-skill addition, and any out-of-scope conformance finding.

### Step 16: FINAL-REVIEW
Confirm only the 7 enumerated files edited; conformance invariant now locks both
fixes; suite green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| allowed-tools array→string reformat drops/adds a tool | Diff tool set before/after per file; assert equality | Step 10, Step 13 |
| Conformance test finds out-of-scope SKILL.md missing type:skill | Record as documented finding in ledger; do NOT edit out-of-scope (no-churn) | Step 8, Step 14 |
| Concurrent edit of architecture-invariants.test.js with s1 | Plan-serial FIFO executor runs s1 and s3 one at a time; never concurrent | Dependency Graph note |


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
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

- **`tools:` value format.** The 5 realtime/safety files carried the YAML-array
  form `allowed-tools: [Read, Grep, Glob]`. The plan's File Specifications
  mandate the comma-separated STRING form the rest of the corpus uses
  (`grep -rh "^tools:" skills/` shows the whole corpus uses string form, zero
  array form). Chose `tools: Read, Grep, Glob` for all 5 — tool set
  `{Read, Grep, Glob}` identical before/after (proven by `git diff`: the only
  changed characters are the key name and the bracket→comma-string reformat; no
  tool added or dropped).
- **`type: skill` field placement in unit-test-runner.** Sibling skills
  (the 5 realtime/safety files) place `type: skill` immediately after
  `description:`. Matched that field order — inserted `type: skill` on the line
  after `description:`, before `when_to_load:`. No other field touched.
- **Conformance-test regex for `type: skill`.** Used `/^type:\s*skill\s*$/m`
  (anchored, whole-value) so a field like `type: skill-index` would NOT falsely
  satisfy it. Reused the existing `walkSkillFiles` + `readFM` helpers (no walker
  duplication, per Step 12).
- **No out-of-scope finding.** The corpus-wide conformance block passes for
  EVERY SKILL.md (44/44 in architecture-invariants). No SKILL.md outside this
  slice's 6 files was missing `type: skill` or carrying `allowed-tools:`. No
  no-churn out-of-scope edit was needed.
- **Plan not moved (per executor instruction).** Left in `plans/todo/` and NOT
  staged; the caller commits. This slice shares
  `tests/architecture-invariants.test.js` with s1 (already merged — the
  `deployment-setup` TIER_1_AGENTS addition is present on disk); the new
  describe block was appended additively at end-of-file, disturbing no existing
  test.

## Verification Tallies (executor)

- (a) RED→GREEN: RED = 44 tests / 43 pass / 1 fail (conformance caught the 5
  `allowed-tools:` files); GREEN = 44 tests / 44 pass / 0 fail.
- (b) `grep -rl "allowed-tools:" skills/` AFTER = **0** (empty).
- (c) `unit-test-runner/SKILL.md` now has `type: skill` (line 4).
- (d) `node --test tests/architecture-invariants.test.js` = 44 pass / 0 fail.
- (e) `node --test tests/*.test.js` = **# fail 0**, 3410 tests / 3410 pass /
  0 skipped.
- (f) `npx eslint . --max-warnings 0` = exit **0**.
- (g) `tsc --noEmit` = baseline-neutral: 89 pre-existing errors, ALL in
  untouched `src/` JS files; 0 reference this slice's 7 files.
- (h) 5 tool-set values UNCHANGED: `{Read, Grep, Glob}` before and after in all
  5 files (git diff shows only the key rename).
