---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T14:57:29.930Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.492Z
gate_crossed: functional → implementation
---

---
title: "CU5-s1 — safety wrappers (fault-tree-builder, fmeda-analyzer, redundancy-pattern-picker)"
type: implementation
parent_plan: CU5-tier3-wrapper-coverage
depends_on: none
priority: LOW
iron_loop: true
files:
  - agents/safety/fault-tree-builder.md
  - agents/safety/fmeda-analyzer.md
  - agents/safety/redundancy-pattern-picker.md
  - tests/cu5-s1-safety-wrappers.test.js
---

# CU5-s1 — Safety wrappers

Slice 1 of the CU5 wrapper-coverage decomposition (SIP1). Creates the three
Tier-2 agent wrappers for the `skills/safety/` category and the new
`agents/safety/` directory. Inherits CU5's Gate-1 `approved_by: human` marker
(the parent crossed functional → implementation on 2026-07-08).

## Scope inheritance from parent (HARD RULES restated)

1. **WRAP ALL — burden of proof on NO-WRAP.** All three safety skills receive a
   WRAP verdict: each is dispatched by name by `cto-chief` and/or `ivv-chief`
   (implementation-time cross-check evidence recorded in this slice's ledger
   note). No NO-WRAP candidate surfaced in this category.
2. **Real-thing test only — no doubles.** The content-contract test reads each
   REAL wrapper `.md` off disk and asserts wrapper shape; no mocks/stubs/fakes.
3. **No human gate weakened.** Wrappers are advisory redirect surfaces
   (`type: wrapper`); they add no gate and cannot weaken one. The test asserts
   the wrapper carries no gate field.
4. **Agent-count discipline is DEFERRED to the reconciliation slice s5.** This
   slice does NOT touch README / CLAUDE.md / docs/AGENT_ARCHITECTURE.md /
   `readme-numbers.test.js`. Because adding 3 files under a NEW category flips
   the hard `assert.equal(countAgentMdFiles(), 112)` and
   `assert.equal(countAgentCategories(), 22)` in `readme-numbers.test.js`, this
   slice's own Step 14 VERIFY runs the SCOPED test file only
   (`node --test tests/cu5-s1-safety-wrappers.test.js`) — full-suite green is
   restored by s5 which updates those pinned counts. This ordering is recorded
   in `## Decisions Taken Under Ambiguity`.

## Wrapper schema (from the parent's canonical example)

Canonical thin wrapper is `agents/quality/code-reviewer.md` (read fresh):

```
---
name: code-reviewer
type: wrapper
target_skill: quality/code-reviewer
---

This agent's logic lives at skills/quality/code-reviewer/SKILL.md. Read that file in full, then follow its instructions.
```

Exactly three frontmatter fields — `name:`, `type: wrapper`, `target_skill:` —
plus one body line. NO `tier:`, `reports_to:`, `dispatch_protocol:`, `model:`,
`tools:` (those live on the SKILL.md, per parent constraint lines 128-132). The
rich compliance agents (`gdpr-agent.md`, `eu-ai-act-agent.md`) are the reference
for the DRY "restate no rule" principle and `reports_to: cto-chief` routing — the
wrapper body embodies "restate no rule" by pointing at the SKILL.md and copying
nothing from it. The rich shape is NOT copied onto these wrappers.

## Implementation Details

### Dependency Graph

```
skills/safety/fault-tree-builder/SKILL.md      <--target_skill-- agents/safety/fault-tree-builder.md
skills/safety/fmeda-analyzer/SKILL.md          <--target_skill-- agents/safety/fmeda-analyzer.md
skills/safety/redundancy-pattern-picker/SKILL.md <--target_skill-- agents/safety/redundancy-pattern-picker.md
agents/safety/*.md                             --asserted-by--> tests/cu5-s1-safety-wrappers.test.js
```

No dependency on other slices. New directory `agents/safety/` is created by the
first wrapper write.

### File Specifications

#### File: `agents/safety/fault-tree-builder.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the safety fault-tree-builder skill.
**Change Type:** new-wrapper
**Frontmatter (exact 3 fields):** `name: fault-tree-builder`, `type: wrapper`,
`target_skill: safety/fault-tree-builder`
**Body (one line):** `This agent's logic lives at skills/safety/fault-tree-builder/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition verified before write:** `skills/safety/fault-tree-builder/SKILL.md` exists (confirmed at decomposition time).

#### File: `agents/safety/fmeda-analyzer.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the safety fmeda-analyzer skill.
**Change Type:** new-wrapper
**Frontmatter:** `name: fmeda-analyzer`, `type: wrapper`, `target_skill: safety/fmeda-analyzer`
**Body:** `This agent's logic lives at skills/safety/fmeda-analyzer/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition verified:** `skills/safety/fmeda-analyzer/SKILL.md` exists.

#### File: `agents/safety/redundancy-pattern-picker.md`
**Action:** CREATE
**Purpose:** Tier-2 dispatch redirect for the safety redundancy-pattern-picker skill.
**Change Type:** new-wrapper
**Frontmatter:** `name: redundancy-pattern-picker`, `type: wrapper`, `target_skill: safety/redundancy-pattern-picker`
**Body:** `This agent's logic lives at skills/safety/redundancy-pattern-picker/SKILL.md. Read that file in full, then follow its instructions.`
**Precondition verified:** `skills/safety/redundancy-pattern-picker/SKILL.md` exists.

### Test Plan

#### Tests: `tests/cu5-s1-safety-wrappers.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), real-file reads only — NO test doubles.

Test cases (each reads the REAL wrapper `.md` from disk via `fs.readFileSync`
and parses its frontmatter with the same lightweight parser used elsewhere in
`tests/`; the SKILL.md existence check uses `fs.existsSync` on the real path):

1. **Shape — exactly 3 frontmatter fields.** For each of the 3 wrappers: parsed
   frontmatter keys are exactly `{name, type, target_skill}` — no extra keys.
2. **Type is wrapper.** `type === 'wrapper'` for each.
3. **No-rule-restatement / no forbidden fields.** Frontmatter contains none of
   `tier`, `reports_to`, `dispatch_protocol`, `model`, `tools`; body is a single
   non-empty line matching the canonical redirect sentence pattern
   (`/^This agent's logic lives at skills\/safety\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/`).
4. **target_skill resolves to a real SKILL.md.** For each wrapper,
   `skills/<target_skill>/SKILL.md` exists on disk (`fs.existsSync` true).
5. **Gate invariant.** No wrapper frontmatter or body contains a
   `human_gate`/`review_gate`/`approved_by` field (assert absent) — advisory
   surface adds no gate.
6. **Name matches basename.** `name` equals the file basename without `.md` and
   equals the last path segment of `target_skill`.

Coverage: all 3 files exercised for every assertion; error path (a missing
target SKILL.md would fail case 4 loudly — no silent pass).

### Security Review

- Path traversal: test builds `skills/<target_skill>/SKILL.md` from frontmatter
  read off disk; `target_skill` values are literal category/name pairs written
  by this slice — assert they match `/^[a-z0-9-]+\/[a-z0-9-]+$/` before joining.
- No secrets: wrappers contain no credentials.
- Safe file ops: writes target only `agents/safety/` (declared in `files:`); the
  PreToolUse coverage hook scopes edits to this slice's `files:` list.
- No `execSync`/`exec`.

### Ledger note (consumed by s5)

For s5's audit-ledger update, this slice's WRAP evidence:
`safety/fault-tree-builder`, `safety/fmeda-analyzer`,
`safety/redundancy-pattern-picker` → verdict WRAP; dispatch evidence: mentioned
by name in `agents/coordinator/cto-chief.md` and `agents/coordinator/ivv-chief.md`.

## Decisions Taken Under Ambiguity

- **Scoped VERIFY, not full-suite, in this slice.** Adding 3 wrappers under the
  new `agents/safety/` category deterministically breaks the pinned
  `assert.equal(countAgentMdFiles(), 112)` and `assert.equal(countAgentCategories(), 22)`
  in `tests/readme-numbers.test.js`. Those pins are updated ONCE, atomically, in
  the reconciliation slice s5 (which `depends_on` s1-s4). Per the parent's
  continuous-green policy applied at the batch level, each wrapper slice verifies
  its own scoped content-contract test; s5 restores full-suite green. This mirrors
  how count-changing work is reconciled in a single trailing slice rather than
  re-pinning the count four times.
- **Thin wrapper, not rich agent.** The task brief pointed at the rich
  `gdpr-agent.md`/`eu-ai-act-agent.md` as "canonical shape", but the parent CU5
  plan (Gate-1 approved) mandates the thin 3-field form and explicitly forbids
  copying `tier:`/`reports_to:`/`model:`/`tools:` onto a wrapper. The approved
  parent plan is authoritative; the rich agents inform the "restate no rule"
  DRY principle only, which the thin wrapper satisfies by referencing the SKILL.md
  and copying nothing.
- **Barrier-pattern executor run (2026-07-10).** Executed Steps 8–16 for this
  slice under the CU5 barrier protocol: TDD test written first (RED = 21/21 fail,
  wrappers absent), 3 thin wrappers created (GREEN = 21 pass / 0 fail / 0 skipped),
  each `target_skill` verified to resolve to a real `skills/safety/<name>/SKILL.md`
  (no dangling). Ran ONLY the scoped `tests/cu5-s1-safety-wrappers.test.js` — the
  full `tests/*.test.js` suite was deliberately NOT run because
  `readme-numbers.test.js` is pinned at 112 agents / 22 categories until s5 bumps
  it; the full suite would fail mid-add by design. Files left UNSTAGED in the
  working tree; the caller commits atomically with s5. ESLint on the test file
  exited 0. Plan NOT moved (left in todo/) per barrier instructions.

## Execution Plan

### Step 8: TEST
Write `tests/cu5-s1-safety-wrappers.test.js` first (TDD-Red): the six real-file
content-contract assertions above. It fails initially (wrappers absent).

### Step 9: PREPARE
Confirm `agents/safety/` will be created; confirm the three
`skills/safety/*/SKILL.md` targets exist. No new dependencies.

### Step 10: IMPLEMENT
Create `agents/safety/` and write the three wrapper files exactly per the File
Specifications (copy the canonical thin form, substitute `name`/`target_skill`).

### Step 11: REVIEW
Self-review: 3 fields only, correct body sentence, correct target paths, no
forbidden fields.

### Step 12: OPTIMIZE
No optimization surface (static redirect files); confirm no duplication drift
between the three files beyond the substituted name/path.

### Step 13: SECURE
Run the security checklist above; confirm `target_skill` regex guard.

### Step 14: VERIFY
`node --test tests/cu5-s1-safety-wrappers.test.js` → `# fail 0`. (Full-suite
green is restored by s5; see Decisions.)

### Step 15: DOCUMENT
Record the WRAP verdicts + dispatch evidence in this slice's Ledger note for s5
to fold into `.ctoc/audit/corpus-audit-2026-06-15.json`.

### Step 16: FINAL-REVIEW
Confirm all four HARD RULES honored, gate invariant asserted, no existing agent
or SKILL.md modified. Ready for Gate 2 batch approval with siblings.


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
