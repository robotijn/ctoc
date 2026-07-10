---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T14:57:29.976Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.492Z
gate_crossed: functional → implementation
---

---
title: "CU5-s2 — security wrappers (cra-incident-clocks, incident-responder, threat-modeler)"
type: implementation
parent_plan: CU5-tier3-wrapper-coverage
depends_on: none
priority: LOW
iron_loop: true
files:
  - agents/security/cra-incident-clocks.md
  - agents/security/incident-responder.md
  - agents/security/threat-modeler.md
  - tests/cu5-s2-security-wrappers.test.js
---

# CU5-s2 — Security wrappers

Slice 2 of the CU5 wrapper-coverage decomposition (SIP1). Creates three Tier-2
agent wrappers in the EXISTING `agents/security/` directory (no new category).
Inherits CU5's Gate-1 `approved_by: human` marker.

## Scope inheritance from parent (HARD RULES restated)

1. **WRAP ALL — burden of proof on NO-WRAP.** All three security skills receive
   WRAP: `security/threat-modeler` is dispatched by name in both
   `cto-chief.md` and `ivv-chief.md`; `security/cra-incident-clocks` and
   `security/incident-responder` are each dispatched by name in the orchestrators
   (evidence in the Ledger note). No NO-WRAP candidate in this category.
2. **Real-thing test only — no doubles.** The content-contract test reads each
   REAL wrapper `.md` off disk; no mocks/stubs/fakes.
3. **No human gate weakened.** `type: wrapper` advisory redirects; test asserts
   no gate field present.
4. **Agent-count discipline DEFERRED to s5.** This slice adds 3 files to an
   EXISTING category, so `countAgentCategories()` is unchanged (still would-be 22
   before s1/s3 add theirs), but `countAgentMdFiles()` (pinned at 112) still
   flips. Do NOT edit README / CLAUDE.md / docs / `readme-numbers.test.js` here;
   s5 reconciles all counts once. Step 14 runs the SCOPED test only.

## Wrapper schema (from the parent's canonical example)

Thin 3-field form of `agents/quality/code-reviewer.md`: `name:`, `type: wrapper`,
`target_skill:` + one redirect body line. No `tier:`/`reports_to:`/
`dispatch_protocol:`/`model:`/`tools:` (parent constraint lines 128-132). The
rich `gdpr-agent.md`/`eu-ai-act-agent.md` inform the DRY "restate no rule"
principle only; the thin wrapper satisfies it by pointing at the SKILL.md and
copying nothing.

## Implementation Details

### Dependency Graph

```
skills/security/cra-incident-clocks/SKILL.md <--target_skill-- agents/security/cra-incident-clocks.md
skills/security/incident-responder/SKILL.md  <--target_skill-- agents/security/incident-responder.md
skills/security/threat-modeler/SKILL.md       <--target_skill-- agents/security/threat-modeler.md
agents/security/{new}.md                       --asserted-by--> tests/cu5-s2-security-wrappers.test.js
```

No dependency on other slices. `agents/security/` already exists (holds
sast-scanner, secrets-detector, etc.); these are net-new files in it.

### File Specifications

#### File: `agents/security/cra-incident-clocks.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the security cra-incident-clocks skill.
**Frontmatter:** `name: cra-incident-clocks`, `type: wrapper`, `target_skill: security/cra-incident-clocks`
**Body:** `This agent's logic lives at skills/security/cra-incident-clocks/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/security/cra-incident-clocks/SKILL.md` exists.

#### File: `agents/security/incident-responder.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the security incident-responder skill.
**Frontmatter:** `name: incident-responder`, `type: wrapper`, `target_skill: security/incident-responder`
**Body:** `This agent's logic lives at skills/security/incident-responder/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/security/incident-responder/SKILL.md` exists.

#### File: `agents/security/threat-modeler.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the security threat-modeler skill.
**Frontmatter:** `name: threat-modeler`, `type: wrapper`, `target_skill: security/threat-modeler`
**Body:** `This agent's logic lives at skills/security/threat-modeler/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition:** `skills/security/threat-modeler/SKILL.md` exists.

### Test Plan

#### Tests: `tests/cu5-s2-security-wrappers.test.js`
**Action:** CREATE
**Framework:** `node:test`, real-file reads only — NO test doubles.

Same six content-contract assertions as s1, targeting the three
`agents/security/*` wrappers:
1. Exactly `{name, type, target_skill}` frontmatter keys.
2. `type === 'wrapper'`.
3. No forbidden fields (`tier`/`reports_to`/`dispatch_protocol`/`model`/`tools`);
   body single line matching `/^This agent's logic lives at skills\/security\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/`.
4. `skills/<target_skill>/SKILL.md` exists (`fs.existsSync` true).
5. Gate invariant: no `human_gate`/`review_gate`/`approved_by` field.
6. `name` equals basename and last segment of `target_skill`.

### Security Review

- `target_skill` guarded by `/^security\/[a-z0-9-]+$/` before path join.
- Writes scoped to `agents/security/` (declared `files:`); no secrets; no exec.

### Ledger note (consumed by s5)

WRAP evidence: `security/cra-incident-clocks`, `security/incident-responder`,
`security/threat-modeler` → verdict WRAP; dispatched by name in
`agents/coordinator/cto-chief.md` and `agents/coordinator/ivv-chief.md`.

## Decisions Taken Under Ambiguity

- **Scoped VERIFY, not full-suite.** Same rationale as s1: the
  `assert.equal(countAgentMdFiles(), 112)` pin is updated once in s5. This slice
  verifies its scoped content-contract test only.
- **Thin wrapper, not rich agent.** Parent CU5 (Gate-1 approved) mandates the
  thin 3-field form; the rich compliance agents inform the DRY principle only.
- **Barrier pattern honored (executor, 2026-07-10).** Verified ONLY the scoped
  test `tests/cu5-s2-security-wrappers.test.js`; did NOT run the full suite and
  did NOT `git add`/stage. All 4 files left untracked in the working tree for
  the s5 caller to commit. Plan left in `todo/` (not moved).
- **On-disk names matched spec exactly.** All three skill directories exist with
  the literal names `cra-incident-clocks`, `incident-responder`,
  `threat-modeler`; no rename fallback needed.
- **RED→GREEN confirmed.** RED: all wrapper reads ENOENT before creation. GREEN:
  18/18 subtests pass, fail 0, skipped 0. eslint on the test file exit 0.

## Execution Plan

### Step 8: TEST
Write `tests/cu5-s2-security-wrappers.test.js` (TDD-Red), six real-file assertions.

### Step 9: PREPARE
Confirm the three `skills/security/*/SKILL.md` targets exist; `agents/security/`
already present.

### Step 10: IMPLEMENT
Write the three wrapper files exactly per the File Specifications.

### Step 11: REVIEW
Self-review: 3 fields only, correct body, correct targets, no forbidden fields.

### Step 12: OPTIMIZE
No optimization surface; confirm no cross-file drift.

### Step 13: SECURE
Run security checklist; confirm `target_skill` regex guard.

### Step 14: VERIFY
`node --test tests/cu5-s2-security-wrappers.test.js` → `# fail 0`.

### Step 15: DOCUMENT
Record WRAP verdicts + dispatch evidence in the Ledger note for s5.

### Step 16: FINAL-REVIEW
Confirm four HARD RULES honored, gate invariant asserted, no existing file
modified. Ready for Gate 2 batch approval.


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
