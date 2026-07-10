---
approved_by: human
approved_at: 2026-07-10T16:41:24.140Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T14:57:30.002Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.492Z
gate_crossed: functional → implementation
---

---
title: "CU5-s3 — legal + realtime wrappers (clm-obligations, dsar-handler, hil-harness, wcet-budget)"
type: implementation
parent_plan: CU5-tier3-wrapper-coverage
depends_on: none
priority: LOW
iron_loop: true
files:
  - agents/legal/clm-obligations.md
  - agents/legal/dsar-handler.md
  - agents/realtime/hil-harness.md
  - agents/realtime/wcet-budget.md
  - tests/cu5-s3-legal-realtime-wrappers.test.js
---

# CU5-s3 — Legal + realtime wrappers

Slice 3 of the CU5 wrapper-coverage decomposition (SIP1). Creates two NEW agent
directories (`agents/legal/`, `agents/realtime/`) and four Tier-2 wrappers across
them. Two skills each in two categories, kept in one slice because each category
has only two files and the two new-directory creations are the same unit of work.
Inherits CU5's Gate-1 `approved_by: human` marker.

## Scope inheritance from parent (HARD RULES restated)

1. **WRAP ALL — burden of proof on NO-WRAP.** All four skills receive WRAP: each
   of `legal/clm-obligations`, `legal/dsar-handler`, `realtime/hil-harness`,
   `realtime/wcet-budget` is dispatched by name by an orchestrator (evidence in
   the Ledger note). No NO-WRAP candidate.
2. **Real-thing test only — no doubles.** The content-contract test reads each
   REAL wrapper `.md` off disk; no mocks/stubs/fakes.
3. **No human gate weakened.** `type: wrapper` advisory redirects; test asserts
   no gate field.
4. **Agent-count discipline DEFERRED to s5.** Adds 4 files across TWO new
   categories (`legal`, `realtime`), so both `countAgentMdFiles()` (112 pin) and
   `countAgentCategories()` (22 pin) flip. Do NOT edit README / CLAUDE.md / docs /
   `readme-numbers.test.js` here; s5 reconciles once. Step 14 runs the SCOPED
   test only.

## Wrapper schema (from the parent's canonical example)

Thin 3-field form of `agents/quality/code-reviewer.md`. No
`tier:`/`reports_to:`/`dispatch_protocol:`/`model:`/`tools:` (parent constraint
lines 128-132). Rich `gdpr-agent.md`/`eu-ai-act-agent.md` inform the DRY
"restate no rule" principle only.

## Implementation Details

### Dependency Graph

```
skills/legal/clm-obligations/SKILL.md   <--target_skill-- agents/legal/clm-obligations.md
skills/legal/dsar-handler/SKILL.md      <--target_skill-- agents/legal/dsar-handler.md
skills/realtime/hil-harness/SKILL.md    <--target_skill-- agents/realtime/hil-harness.md
skills/realtime/wcet-budget/SKILL.md    <--target_skill-- agents/realtime/wcet-budget.md
agents/legal/*.md, agents/realtime/*.md  --asserted-by--> tests/cu5-s3-legal-realtime-wrappers.test.js
```

No dependency on other slices. New directories `agents/legal/` and
`agents/realtime/` are created by the first write into each.

### File Specifications

#### File: `agents/legal/clm-obligations.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the legal clm-obligations skill.
**Frontmatter:** `name: clm-obligations`, `type: wrapper`, `target_skill: legal/clm-obligations`
**Body:** `This agent's logic lives at skills/legal/clm-obligations/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/legal/clm-obligations/SKILL.md` exists.

#### File: `agents/legal/dsar-handler.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the legal dsar-handler skill.
**Frontmatter:** `name: dsar-handler`, `type: wrapper`, `target_skill: legal/dsar-handler`
**Body:** `This agent's logic lives at skills/legal/dsar-handler/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/legal/dsar-handler/SKILL.md` exists.

#### File: `agents/realtime/hil-harness.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the realtime hil-harness skill.
**Frontmatter:** `name: hil-harness`, `type: wrapper`, `target_skill: realtime/hil-harness`
**Body:** `This agent's logic lives at skills/realtime/hil-harness/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/realtime/hil-harness/SKILL.md` exists.

#### File: `agents/realtime/wcet-budget.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the realtime wcet-budget skill.
**Frontmatter:** `name: wcet-budget`, `type: wrapper`, `target_skill: realtime/wcet-budget`
**Body:** `This agent's logic lives at skills/realtime/wcet-budget/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/realtime/wcet-budget/SKILL.md` exists.

### Test Plan

#### Tests: `tests/cu5-s3-legal-realtime-wrappers.test.js`
**Action:** CREATE
**Framework:** `node:test`, real-file reads only — NO test doubles.

The six content-contract assertions (as s1/s2), across all four wrappers, with
the category-aware body regex
`/^This agent's logic lives at skills\/(legal|realtime)\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/`:
1. Exactly `{name, type, target_skill}` frontmatter keys.
2. `type === 'wrapper'`.
3. No forbidden fields; body single line matching the regex.
4. `skills/<target_skill>/SKILL.md` exists (`fs.existsSync` true) for all four.
5. Gate invariant: no `human_gate`/`review_gate`/`approved_by` field.
6. `name` equals basename and last segment of `target_skill`.
7. **New-directory assertion:** `agents/legal/` and `agents/realtime/` exist as
   directories (`fs.statSync(...).isDirectory()` true).

### Security Review

- `target_skill` guarded by `/^(legal|realtime)\/[a-z0-9-]+$/` before path join.
- Writes scoped to `agents/legal/` and `agents/realtime/` (declared `files:`);
  no secrets; no exec.

### Ledger note (consumed by s5)

WRAP evidence: `legal/clm-obligations`, `legal/dsar-handler`,
`realtime/hil-harness`, `realtime/wcet-budget` → verdict WRAP; each dispatched by
name in the orchestrators (`agents/coordinator/cto-chief.md` and/or
`agents/coordinator/ivv-chief.md`). New categories `legal` and `realtime` created.

## Decisions Taken Under Ambiguity

- **Four files in one slice.** Two categories of two skills each; combining them
  stays at ~1–3 substantive units of work (four near-identical redirect files +
  one test) and pairs the two new-directory creations. Splitting into two
  two-file slices would add a slice with no independent value. Within the SIP1
  guidance ("~1–3 files; merge a trivial slice into its natural neighbor"), the
  two two-file categories are merged.
- **Scoped VERIFY, not full-suite.** The 112/22 pins are reconciled once in s5.
- **Thin wrapper, not rich agent.** Parent CU5 (Gate-1 approved) mandates the
  thin 3-field form.
- **Execution (s3, barrier pattern).** TDD: test written FIRST → RED (29 tests,
  0 pass, 29 fail, ENOENT on missing wrappers = loud failure). Created 2 new dirs
  `agents/legal/` + `agents/realtime/` and 4 thin wrappers → GREEN (29 pass, 0
  fail, 0 skipped). ESLint on the test file exit 0. All 4 `target_skill` values
  resolve to real `skills/<cat>/<name>/SKILL.md` (no dangling). Per barrier
  pattern: verified ONLY the scoped test (NOT the full suite); left UNSTAGED in
  the working tree for s5 to commit; the 112/22 agent-count + category pins are
  reconciled once in s5. Plan NOT moved.

## Execution Plan

### Step 8: TEST
Write `tests/cu5-s3-legal-realtime-wrappers.test.js` (TDD-Red), seven real-file
assertions.

### Step 9: PREPARE
Confirm the four `skills/{legal,realtime}/*/SKILL.md` targets exist; plan the two
new directories.

### Step 10: IMPLEMENT
Create `agents/legal/` and `agents/realtime/`; write the four wrapper files
exactly per the File Specifications.

### Step 11: REVIEW
Self-review: 3 fields only, correct body, correct targets, no forbidden fields,
both directories present.

### Step 12: OPTIMIZE
No optimization surface; confirm no cross-file drift.

### Step 13: SECURE
Run security checklist; confirm `target_skill` regex guard.

### Step 14: VERIFY
`node --test tests/cu5-s3-legal-realtime-wrappers.test.js` → `# fail 0`.

### Step 15: DOCUMENT
Record WRAP verdicts + dispatch evidence + new-category creation in the Ledger
note for s5.

### Step 16: FINAL-REVIEW
Confirm four HARD RULES honored, gate invariant asserted, no existing file
modified. Ready for Gate 2 batch approval.


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
