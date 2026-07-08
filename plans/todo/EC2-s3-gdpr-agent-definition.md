---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.278Z
gate_crossed: implementation → todo
---

---
title: "EC2-s3 — gdpr-agent.md agent definition (plan-ancestry + code-scan wrapper) + content test"
type: implementation
parent_plan: EC2-gdpr-agent-plan-and-code
depends_on: EC2-s1-gdpr-helpers, EC2-s2-skill-enum-gdpr-6-9
iron_loop: true
priority: HIGH
files:
  - agents/compliance/gdpr-agent.md
  - agents/compliance/gdpr-compliance-checker.md
  - tests/gdpr-agent-definition.test.js
status: refined
risk_level: MEDIUM
---

# EC2-s3 — gdpr-agent.md (the plan-ancestry-capable Tier-2 wrapper) + content test

Slice 3 of the EC2 decomposition. Creates the new **agent** `gdpr-agent`
(`agents/compliance/gdpr-agent.md`) that wraps the existing skill, adds plan-ancestry reading,
gates on `shouldRunGdpr(projectRoot)`, delegates code-rule evaluation to the skill by reference
and machine-checkable rules to `gdpr-helpers.js` — restating NO rule from the skill (parent
Scenario "No rule from the skill is re-stated in the agent"). The old wrapper
`agents/compliance/gdpr-compliance-checker.md` is REMOVED (subsumed — parent Decision "Agent
naming").

Depends on **EC2-s1** (references the four helper functions by name) and **EC2-s2** (the agent
may emit `GDPR-6`/`GDPR-9`, which must be enum-valid first).

Per PI4: the agent prose has a testable contract, so `tests/gdpr-agent-definition.test.js`
asserts the agent file's content (frontmatter fields, gate reference, helper references,
no-rule-restatement) against the real file. The agent is NOT a human-facing runtime surface
(it emits findings via s4's wiring); its prose is the contract asserted here.

## Implementation Details

### Architecture Decision (ADR)

**Context:** The skill (`gdpr-compliance-checker`) is code-only (`tools: Read, Grep`,
`max_subagents: 0`, no plan-ancestry reading). A plan-stage GDPR check needs an agent that reads
the plan ancestry (vision → canvas → functional → implementation) and gates on EC1. The old
`agents/compliance/gdpr-compliance-checker.md` is a thin `type: wrapper` pointing at the skill —
it has no plan-ancestry capability.

**Decision:** Create `agents/compliance/gdpr-agent.md` as a Tier-2 specialist that: (1) gates on
`shouldRunGdpr(projectRoot)` — exits immediately, reading NO files, when false; (2) for a
plan-stage dispatch, reads the plan ancestry and uses `mapPiiFieldToArticles` to derive
triggered Articles; (3) for a code-stage dispatch, delegates to the skill's code-scan rule set
by reference; (4) routes/normalizes/validates every finding through the s1 helpers. Remove the
old wrapper file so there is one GDPR agent. Restate no skill rule (no PII list, no BAD/SAFE
examples, no letter-field definitions in the agent).

**Consequences:** One GDPR agent, plan-ancestry-capable, gate-guarded, rule-DRY (skill + helpers
are the only rule authorities). `max_subagents: 0` preserved — the agent reads ancestry itself,
spawns nothing (parent Decision).

### Dependency Graph

```
src/lib/gdpr-helpers.js (EC2-s1) ──referenced-by-name──┐
src/lib/compliance-regime.js (EC1-s2) shouldRunGdpr ───┤
skills/compliance/gdpr-compliance-checker/SKILL.md ────┤ (delegated to by reference; enum from s2)
                                                        ▼
agents/compliance/gdpr-agent.md (CREATE)
agents/compliance/gdpr-compliance-checker.md (DELETE — old wrapper subsumed)
                                                        │ asserted-by
                                                        ▼
tests/gdpr-agent-definition.test.js (CREATE)
```

No cycle. Chain depth 1.

### File Specifications

#### File: `agents/compliance/gdpr-agent.md`
**Action:** CREATE
**Purpose:** The plan-ancestry-capable Tier-2 GDPR agent that wraps the skill's code-scan and
adds plan-stage Article derivation, gated on EC1.
**Change Type:** new-agent-definition

**Frontmatter (MUST include, matching the skill's Tier-2 conventions + agent-def pattern):**
```yaml
name: gdpr-agent
description: <one line: plan-ancestry + code-scan GDPR agent; gated on the gdpr regulatory profile>
category: compliance
tier: 2
model: opus
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Grep
reads_ancestry: true
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
reports_to: cto-chief
```

**Body sections (MUST include, prose only — NO skill rule restated):**
- **`## Gate (EC1)`** — states: before ANY file read or finding, call
  `shouldRunGdpr(projectRoot)` from `src/lib/compliance-regime.js`; if `false`, exit immediately
  producing NO output and making NO tool calls (parent Scenario "Profile absent — agent produces
  no output"). Names the function and module verbatim.
- **`## Plan-stage mode (ancestry read)`** — states: read the plan ancestry (vision → canvas →
  functional → implementation) itself (no subagent); for each PII field name that appears
  verbatim in the plan text, call `mapPiiFieldToArticles(field)` (from `src/lib/gdpr-helpers.js`)
  to derive triggered Articles. Confidence heuristic (parent risk mitigation): `medium` when a
  mapped PII field name appears verbatim; `low` for contextual mention only. Emit one finding
  per triggered Article. Findings have NO `target_file`.
- **`## Code-stage mode (skill delegation)`** — states: delegate code-rule evaluation to
  `skills/compliance/gdpr-compliance-checker/SKILL.md` by reference (read that file, follow its
  rules); do NOT restate any of its PII list, Article checks, or BAD/SAFE examples. Code-stage
  findings carry `target_file` + `target_line`.
- **`## Finding emission`** — states: every finding passes through, in order,
  `validateFindingSchema` → `normalizeSeverity` → `routeFinding` (all from
  `src/lib/gdpr-helpers.js`) before it is emitted; the wiring that performs the actual Inbox /
  letter write lives in EC2-s4 (this agent describes the contract, s4 implements the write).
- **`## Rule authority (DRY)`** — states explicitly: the two rule authorities are the SKILL.md
  (narrative + BAD/SAFE) and `gdpr-helpers.js` (deterministic); this agent restates neither.

**Called By:** CTO Chief dispatch (compliance review) — plan-stage or code-stage; the
operations-registry entry (s4) makes it discoverable.

#### File: `agents/compliance/gdpr-compliance-checker.md`
**Action:** DELETE (remove the old `type: wrapper` file — subsumed by `gdpr-agent.md`).
**Purpose of removal:** avoid two GDPR agents; the parent Decision "Agent naming" mandates this.
Document the removal in `## Decisions Taken Under Ambiguity`.

#### Error Handling
- The agent (a prompt) instructs the gate-first behaviour; the enforceable guard is the s4
  wiring test that proves no output when `shouldRunGdpr` is false. This slice's content test
  asserts the agent PROSE names the gate.

#### Cross-Platform Notes
- Agent references module paths as repo-relative POSIX strings (documentation convention);
  runtime path handling lives in s1/s4 JS (which use `path.join`).

### Test Plan

#### Tests: `tests/gdpr-agent-definition.test.js`
**Action:** CREATE
**Framework:** `node:test`. Reads the real `agents/compliance/gdpr-agent.md` and the real skill
file — drives the real artifacts (PI4: content contract asserted against the real file).

**Test Cases (map parent Scenarios "No rule re-stated", "Profile absent", frontmatter conventions):**
1. **File exists + frontmatter:** `gdpr-agent.md` exists; parsed frontmatter has
   `name: gdpr-agent`, `tier: 2`, `tools: Read, Grep` (no Write/Bash), `max_subagents: 0`,
   `reads_ancestry: true`.
2. **Gate reference present:** the body contains `shouldRunGdpr` AND `compliance-regime`
   (the agent names the EC1 gate function + module) AND asserts the "exit immediately / no
   output" contract text (parent Scenario "Profile absent").
3. **Helper references present:** the body names all four helpers — `mapPiiFieldToArticles`,
   `validateFindingSchema`, `normalizeSeverity`, `routeFinding`.
4. **No skill rule re-stated (parent Scenario):** the agent body does NOT contain the skill's
   `piiFields` array literal, does NOT contain a `BAD:`/`SAFE:` code example, and does NOT
   contain a `gdpr_article:` enum definition. (Assert absence of these markers; the agent
   delegates by reference instead.) It DOES contain a reference to
   `skills/compliance/gdpr-compliance-checker`.
5. **Old wrapper removed:** `agents/compliance/gdpr-compliance-checker.md` does NOT exist
   (parent Decision "Agent naming" — subsumed).
6. **Skill unchanged as an artifact:** `skills/compliance/gdpr-compliance-checker/SKILL.md`
   still exists (the skill is kept; only the old AGENT wrapper is removed).

**Coverage Targets:** content-assertion test (no JS branch target); full suite stays green.

### Security Review
- [x] Path traversal: test reads fixed repo-relative paths via `path.join`; no user input.
- [x] Input validation: agent prose mandates the gate-first + validate-before-emit contract.
- [x] No secrets in the agent definition.
- [x] Safe file operations: the agent's declared `tools: Read, Grep` cannot write — it advises
      only; the actual emission write is s4's audited path.
- [x] Error messages: n/a (prose).
- [x] Prototype pollution: n/a.
- [x] Command injection: agent has no Bash tool.
- [x] Gate safety: the agent adds NO human gate and cannot weaken one (advisory findings only —
      parent "New human gate — explicitly excluded").

## Execution Plan

### Step 8: TEST
Write `tests/gdpr-agent-definition.test.js` with the 6 cases (red — agent file absent, old
wrapper still present).

### Step 9: PREPARE
Confirm EC2-s1 helpers exist (to reference by exact name) and EC2-s2 enum landed (GDPR-6/9
valid). Confirm the old wrapper path to delete.

### Step 10: IMPLEMENT
Create `agents/compliance/gdpr-agent.md` per the File Specification (frontmatter + the five body
sections, prose only). DELETE `agents/compliance/gdpr-compliance-checker.md`.

### Step 11: REVIEW
Verify no skill rule is restated (no PII array, no BAD/SAFE, no enum def); verify the gate
function + all four helpers are named; verify the old wrapper is gone and the SKILL.md is
untouched.

### Step 12: OPTIMIZE
Keep the agent prose tight — reference, don't repeat. Match the existing Tier-2 agent-def style.

### Step 13: SECURE
Confirm `tools: Read, Grep` only (no Write/Bash), `max_subagents: 0`, no gate added.

### Step 14: VERIFY
`node --test tests/gdpr-agent-definition.test.js` → `# fail 0`; full suite → `# fail 0`
(confirm no test referenced the old wrapper path; if one did, update it — document under
Decisions).

### Step 15: DOCUMENT
Note the new agent + old-wrapper removal in the commit. If any agent-count/README claim exists,
adjust (net agent files: +1 create, −1 delete = 0 change; verify against README).

### Step 16: FINAL-REVIEW
Confirm frontmatter conventions, gate + helper references, no-rule-restatement, old wrapper
removed, skill kept. Plan stays in `implementation/`. Ready for batched Gate 2.


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
