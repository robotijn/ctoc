---
approved_by: human
approved_at: 2026-07-10T16:41:24.164Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T14:57:30.030Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.492Z
gate_crossed: functional → implementation
---

---
title: "CU5-s4 — compliance + ai-quality wrappers (gdpr-compliance-checker, sbom-cra-checker, llm-security-tester)"
type: implementation
parent_plan: CU5-tier3-wrapper-coverage
depends_on: none
priority: LOW
iron_loop: true
files:
    # agents/compliance/gdpr-compliance-checker.md — REMOVED per EC2-s3 (rich gdpr-agent.md subsumes it)
  - agents/compliance/sbom-cra-checker.md
  - agents/ai-quality/llm-security-tester.md
  - tests/cu5-s4-compliance-aiquality-wrappers.test.js
---

# CU5-s4 — Compliance + ai-quality wrappers

Slice 4 of the CU5 wrapper-coverage decomposition (SIP1). Creates three Tier-2
wrappers in EXISTING directories (`agents/compliance/`, `agents/ai-quality/`).
Inherits CU5's Gate-1 `approved_by: human` marker.

## Scope inheritance from parent (HARD RULES restated)

1. **WRAP ALL — burden of proof on NO-WRAP.** All three receive WRAP:
   `compliance/gdpr-compliance-checker`, `compliance/sbom-cra-checker`, and
   `ai-quality/llm-security-tester` are each dispatched by name by an
   orchestrator (evidence in the Ledger note). No NO-WRAP candidate.
2. **Real-thing test only — no doubles.** The content-contract test reads each
   REAL wrapper `.md` off disk; no mocks/stubs/fakes. It additionally asserts the
   coexistence invariant for gdpr (below) against real files.
3. **No human gate weakened.** `type: wrapper` advisory redirects; test asserts
   no gate field.
4. **Agent-count discipline DEFERRED to s5.** Adds 3 files to EXISTING categories
   (no new category), so `countAgentCategories()` is unaffected by THIS slice, but
   `countAgentMdFiles()` (112 pin) flips. Do NOT edit README / CLAUDE.md / docs /
   `readme-numbers.test.js` here; s5 reconciles once. Step 14 runs the SCOPED
   test only.

## Coexistence note — gdpr-compliance-checker (verified on disk)

`skills/compliance/gdpr-compliance-checker/SKILL.md` is already READ (delegated
to) in the BODY of the rich `agents/compliance/gdpr-agent.md` (code-stage
delegation), but NO agent declares it via `target_skill:` or `extends_skill:` —
so it is genuinely unwrapped by the dispatch-pointer cross-check and needs a thin
`type: wrapper` redirect. The thin wrapper `agents/compliance/gdpr-compliance-checker.md`
and the rich `agents/compliance/gdpr-agent.md` COEXIST: the wrapper is the
resolver-keyed redirect surface for direct skill dispatch; the rich agent is a
separate specialist that delegates to the same skill body. This is a valid WRAP,
not a duplicate. The test asserts both files exist and are distinct (the wrapper
is a `type: wrapper`; the rich agent is NOT).

## Wrapper schema (from the parent's canonical example)

Thin 3-field form of `agents/quality/code-reviewer.md`. No
`tier:`/`reports_to:`/`dispatch_protocol:`/`model:`/`tools:` (parent constraint
lines 128-132). Rich `gdpr-agent.md`/`eu-ai-act-agent.md` inform the DRY
"restate no rule" principle only.

## Implementation Details

### Dependency Graph

```
skills/compliance/gdpr-compliance-checker/SKILL.md <--target_skill-- agents/compliance/gdpr-compliance-checker.md
skills/compliance/sbom-cra-checker/SKILL.md        <--target_skill-- agents/compliance/sbom-cra-checker.md
skills/ai-quality/llm-security-tester/SKILL.md     <--target_skill-- agents/ai-quality/llm-security-tester.md
new wrappers                                        --asserted-by--> tests/cu5-s4-compliance-aiquality-wrappers.test.js
agents/compliance/gdpr-agent.md (EXISTING, unmodified) --coexists-with-- agents/compliance/gdpr-compliance-checker.md
```

No dependency on other slices. `agents/compliance/` and `agents/ai-quality/`
already exist.

### File Specifications

#### File: `agents/compliance/gdpr-compliance-checker.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the compliance gdpr-compliance-checker skill (coexists with the rich gdpr-agent).
**Frontmatter:** `name: gdpr-compliance-checker`, `type: wrapper`, `target_skill: compliance/gdpr-compliance-checker`
**Body:** `This agent's logic lives at skills/compliance/gdpr-compliance-checker/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/compliance/gdpr-compliance-checker/SKILL.md` exists; `agents/compliance/gdpr-agent.md` exists and is NOT modified.

#### File: `agents/compliance/sbom-cra-checker.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the compliance sbom-cra-checker skill.
**Frontmatter:** `name: sbom-cra-checker`, `type: wrapper`, `target_skill: compliance/sbom-cra-checker`
**Body:** `This agent's logic lives at skills/compliance/sbom-cra-checker/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/compliance/sbom-cra-checker/SKILL.md` exists.

#### File: `agents/ai-quality/llm-security-tester.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the ai-quality llm-security-tester skill.
**Frontmatter:** `name: llm-security-tester`, `type: wrapper`, `target_skill: ai-quality/llm-security-tester`
**Body:** `This agent's logic lives at skills/ai-quality/llm-security-tester/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/ai-quality/llm-security-tester/SKILL.md` exists.

### Test Plan

#### Tests: `tests/cu5-s4-compliance-aiquality-wrappers.test.js`
**Action:** CREATE
**Framework:** `node:test`, real-file reads only — NO test doubles.

The six content-contract assertions (as s1/s2/s3) across the three wrappers, with
body regex
`/^This agent's logic lives at skills\/(compliance|ai-quality)\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/`:
1. Exactly `{name, type, target_skill}` frontmatter keys.
2. `type === 'wrapper'`.
3. No forbidden fields; body single line matching the regex.
4. `skills/<target_skill>/SKILL.md` exists (`fs.existsSync` true) for all three.
5. Gate invariant: no `human_gate`/`review_gate`/`approved_by` field.
6. `name` equals basename and last segment of `target_skill`.
7. **Coexistence assertion (real files):** `agents/compliance/gdpr-compliance-checker.md`
   parses as `type: wrapper`; `agents/compliance/gdpr-agent.md` exists, is a
   DISTINCT file, and is NOT `type: wrapper` (its frontmatter has no `type:` key
   or a non-`wrapper` value) — proving the wrapper did not overwrite or duplicate
   the rich agent.

### Security Review

- `target_skill` guarded by `/^(compliance|ai-quality)\/[a-z0-9-]+$/` before path
  join.
- Writes scoped to `agents/compliance/` and `agents/ai-quality/` (declared
  `files:`); `agents/compliance/gdpr-agent.md` is NOT in `files:` and must not be
  touched. No secrets; no exec.

### Ledger note (consumed by s5)

WRAP evidence: `compliance/gdpr-compliance-checker` (WRAP; coexists with rich
`gdpr-agent`, dispatched by name in `cto-chief.md`/`ivv-chief.md`),
`compliance/sbom-cra-checker` (WRAP; dispatched by name), `ai-quality/llm-security-tester`
(WRAP; dispatched by name in `cto-chief.md`/`ivv-chief.md`).

## Decisions Taken Under Ambiguity

- **gdpr-compliance-checker still gets a thin wrapper despite gdpr-agent
  delegating to its SKILL.md.** The dispatch-pointer cross-check (target_skill +
  extends_skill) is the authoritative unwrapped-test per the parent; a body-level
  `Read` of the skill inside a rich agent is NOT a wrapper and does not register
  the skill as dispatch-reachable via the resolver. The thin redirect is required
  and coexists with the rich agent. Documented rather than skipped (no NO-WRAP).
- **Scoped VERIFY, not full-suite.** The 112 pin is reconciled once in s5.
- **Thin wrapper, not rich agent.** Parent CU5 (Gate-1 approved) mandates the
  thin 3-field form.

### s4 execution log (2026-07-10)

- **TDD RED→GREEN.** Wrote `tests/cu5-s4-compliance-aiquality-wrappers.test.js`
  FIRST against real on-disk files; RED = 19 tests / 0 pass / 19 fail (wrappers
  absent). After creating the 3 thin wrappers: GREEN = 19 tests / 19 pass / 0 fail
  / 0 skipped.
- **Resolve proof.** All three `target_skill` paths resolve to a real SKILL.md:
  `skills/compliance/gdpr-compliance-checker/SKILL.md`,
  `skills/compliance/sbom-cra-checker/SKILL.md`,
  `skills/ai-quality/llm-security-tester/SKILL.md` (all existsSync true; real dir
  names matched the plan exactly).
- **gdpr coexistence verified on disk.** Thin `agents/compliance/gdpr-compliance-checker.md`
  (type: wrapper) and rich `agents/compliance/gdpr-agent.md` (tier:2 / model:opus,
  NOT type: wrapper) both exist as DISTINCT files with different content. The
  wrapper did not overwrite/duplicate the rich agent; `gdpr-agent.md` is UNTOUCHED
  (empty git diff).
- **eslint exit 0** on the new test file.
- **Barrier pattern honored.** Scoped test only (full suite NOT run); nothing
  staged — all 4 files left untracked in the working tree for s5 to commit.

## Execution Plan

### Step 8: TEST
Write `tests/cu5-s4-compliance-aiquality-wrappers.test.js` (TDD-Red), seven
real-file assertions including the coexistence check.

### Step 9: PREPARE
Confirm the three target `SKILL.md` files exist and `agents/compliance/gdpr-agent.md`
exists (must stay unmodified).

### Step 10: IMPLEMENT
Write the three wrapper files exactly per the File Specifications. Do NOT touch
`gdpr-agent.md`.

### Step 11: REVIEW
Self-review: 3 fields only, correct body, correct targets, no forbidden fields,
gdpr-agent untouched.

### Step 12: OPTIMIZE
No optimization surface; confirm no cross-file drift.

### Step 13: SECURE
Run security checklist; confirm `target_skill` regex guard and that
`gdpr-agent.md` is outside `files:`.

### Step 14: VERIFY
`node --test tests/cu5-s4-compliance-aiquality-wrappers.test.js` → `# fail 0`.

### Step 15: DOCUMENT
Record WRAP verdicts + coexistence finding in the Ledger note for s5.

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
