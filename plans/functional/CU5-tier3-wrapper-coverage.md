---
title: "CU5 — Tier 3 wrapper-coverage decision (15 unwrapped skills)"
created: "2026-06-15T00:00:00Z"
priority: LOW
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 5
depends_on: [CU1-tier0-quick-wins]
status: refined
acceptance_criteria_count: 10
risk_level: LOW
files:
  - agents/**/*.md
  - skills/**/*.md
  - .ctoc/operations-registry.yaml
  - docs/AGENT_ARCHITECTURE.md
  - tests/architecture-invariants.test.js
---

# CU5 — Tier 3 wrapper-coverage decision

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit found 15 SKILL.md files with no corresponding Tier-2 agent
wrapper. The vision frames this explicitly as a DECISION problem, not an automatic
build: for each of the 15 unwrapped skills, the question is whether a Tier-2
dispatch wrapper adds value, or whether the skill is purely trigger-loaded (injected
as context when Claude edits a matching file) and therefore has no dispatch role.
Creating wrappers indiscriminately inflates the agent count, the architecture-
invariants test surface, and the operations registry without benefit. Conversely,
leaving a genuinely needed dispatch wrapper missing is a real gap — one that causes
the CTO Chief dispatch chain to route to the wrong agent or skip specialized
handling. This stub produces a per-skill verdict table and creates only the wrappers
that a clear dispatch role justifies.

### Current State

The audit identified 15 SKILL.md files in the 99-file SKILL.md layer that have no
Tier-2 agent wrapper. The exact list is taken from the audit artifact and cross-
checked at implementation time by diffing `skills/**/SKILL.md` paths against
existing `agents/` files. The CU1 edits stabilize the agent layer and the
architecture-invariants test before this stub runs, making the test the reliable
arbiter for any new wrapper.

The default verdict bias is NO-WRAP: the no-churn principle favors not creating
files speculatively, and trigger-loaded reference skills need no dispatch agent.
A skill needs a wrapper only when it is invoked as a leaf in the dispatch chain
(dispatched by a sub-orchestrator to produce a structured output), not when it is
purely loaded by the trigger system as correction context.

### Impact

The impact is bidirectional: creating unneeded wrappers bloats the invariants test
(each new Tier-2 entry needs `tier: 2`, `reports_to` assertions) and adds dead
entries to the operations registry. Not creating a needed wrapper means a
specialized skill is unreachable via dispatch. The verdict table is the deliverable
that resolves this tension with documented rationale for each of the 15 skills;
the wrapper count may be zero if all 15 are trigger-loaded references.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criterion 5: "The audit artifact (per-file
verdicts) is preserved so progress is trackable and no thin file is silently
skipped." And the vision's Tier 3 framing: "decide per skill whether a Tier-2
wrapper is warranted."

### Impact Map

**Job to Be Done:** When the CTO Chief dispatch chain needs to invoke a specialized
skill, a Tier-2 agent wrapper must exist for it — and when a skill is a pure
correction reference, no wrapper should exist to avoid inflating the agent surface.

- **Goal:** Resolve the wrapper coverage question for all 15 unwrapped skills with
  documented rationale, creating only wrappers that have a concrete dispatch role.
- **Actor:** CTO Chief and sub-orchestrators (dispatch chain); architecture-
  invariants test (structural enforcer); human reviewer (approves verdict table).
- **Impact:** Dispatch coverage is complete for skills that need it; the agent
  layer is not inflated with speculative wrappers; every NO-WRAP decision is
  traceable rather than an undocumented omission.
- **Deliverable:** A per-skill verdict table (WRAP / NO-WRAP + rationale) for all
  15 unwrapped skills, plus any newly created Tier-2 wrappers that the WRAP
  verdicts mandate.

### Success Metrics

- A verdict table covering all 15 unwrapped skills exists with no silent omissions.
- Every WRAP verdict produces a v8-conformant Tier-2 wrapper passing the
  architecture-invariants test.
- Every NO-WRAP verdict has a recorded rationale.
- `.ctoc/operations-registry.yaml` is updated for any new wrappers.
- `node --test tests/*.test.js` passes with `# fail 0`.

### Stakeholders

- CTO Chief and sub-orchestrators (dispatch chain consumers).
- Architecture-invariants test (structural gate for any new wrapper).
- Human reviewer (approves the verdict table and any new wrappers before Gate 1).

### Constraints

- **NO-WRAP default bias**: when a skill's dispatch role is unclear, the verdict
  is NO-WRAP with the uncertainty recorded. Morning review can promote cheaply;
  reversing an unneeded wrapper is more costly (requires removing the test entry).
- **No-churn rule**: this stub is about wrapper presence; the bodies of the 15
  skills are NOT modified in this stub (content upgrades are CU2–CU4).
- **v8 conformance**: any created wrapper must mirror an existing audited-SOLID
  Tier-2 agent's frontmatter and structure exactly; no invented fields.
- **Audit cross-check**: the 15-skill list is from the audit artifact but must be
  cross-checked at implementation time (count may differ; discrepancy is recorded
  as a finding, not blocked on).
- **Depends only on CU1**: CU1 stabilizes the agent layer and the invariants test
  before this stub runs. CU5 is independent of CU2/CU3/CU4 (disjoint concern).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief dispatching a skill-specific task,
**I want** every skill with a genuine dispatch role to have a v8-conformant Tier-2
wrapper listed in the operations registry,
**so that** my dispatch chain reaches specialized skills without routing gaps.

**As a** human reviewer approving CU5,
**I want** a verdict table with documented rationale for all 15 unwrapped skills,
**so that** I can confirm each NO-WRAP decision was deliberate and each WRAP
decision is justified by a concrete dispatch need — not created speculatively.

**As a** future corpus maintainer reading the architecture-invariants test,
**I want** each new Tier-2 wrapper added by CU5 to be structured identically to
existing audited-SOLID Tier-2 agents,
**so that** the test assertions for `tier: 2` and `reports_to` pass by construction
without requiring test modifications.

### Acceptance Criteria

- [ ] **Scenario: per-skill verdict table covers all 15 unwrapped skills**
  Given the audit identified 15 SKILL.md files with no Tier-2 wrapper
  When CU5 implementation is complete
  Then a verdict table exists in the plan's findings section (or an audit artifact
  at a defined path) with one row per skill
  And each row contains: skill path, verdict (WRAP / NO-WRAP), and a one-sentence
  rationale
  And no skill from the audit's unwrapped list is absent from the table
  (Success Criterion 5: no silent skips)

- [ ] **Scenario: count mismatch is recorded, not blocked on**
  Given the audit counted 15 unwrapped skills
  When the implementation-time cross-check yields a different count N
  Then the actual list of N skills is used for all subsequent processing
  And the discrepancy (15 vs N) is recorded in the findings section with the
  method used to derive the implementation-time list
  And no file is skipped because of the discrepancy

- [ ] **Scenario: NO-WRAP verdict has documented rationale for pure trigger-loaded skills**
  Given the NO-WRAP default bias
  When a skill is evaluated as a pure trigger-loaded correction reference
  (its primary role is context injection, not dispatch-chain leaf invocation)
  Then the verdict is NO-WRAP
  And the rationale states explicitly: "pure trigger-loaded reference; no dispatch
  role identified" or an equivalent description of why dispatch value is absent

- [ ] **Scenario: WRAP verdict produces a v8-conformant Tier-2 wrapper**
  Given a skill is evaluated as having a concrete dispatch role
  When a WRAP verdict is issued
  Then a new agent file is created at the appropriate path under `agents/`
  And its YAML frontmatter mirrors an audited-SOLID Tier-2 agent exactly
  (same field set: `tier: 2`, `reports_to: [parent sub-orchestrator]`,
  `dispatch_protocol: v1`, `model`, `tools`, and any other fields present
  in the canonical Tier-2 template)
  And `node --test tests/architecture-invariants.test.js` passes with `# fail 0`
  after the wrapper is created

- [ ] **Scenario: new wrappers added to operations registry**
  Given `.ctoc/operations-registry.yaml` is the canonical agent registry
  When any new Tier-2 wrapper is created by a WRAP verdict
  Then the wrapper is added to the registry with its correct tier, role, and
  path
  And the registry entry mirrors the format of existing Tier-2 entries

- [ ] **Scenario: no existing agent or skill body is modified**
  Given the no-churn rule applied to this stub's scope
  When CU5 creates wrappers or records NO-WRAP verdicts
  Then zero existing agent `.md` files are modified (frontmatter or body)
  And zero existing SKILL.md files are modified (content upgrades are CU2/CU3/CU4)
  And the only files created or modified are: new wrapper files (WRAP verdicts
  only), `.ctoc/operations-registry.yaml` (for new wrappers), and the audit
  artifact (for verdict recording)

- [ ] **Scenario: tests stay green after each new wrapper**
  Given the architecture-invariants test validates all listed Tier-2 agents
  When any new wrapper is added
  Then `node --test tests/*.test.js` passes with `# fail 0` immediately after
  the wrapper file is created and the registry is updated
  And the new wrapper is NOT added to `tests/architecture-invariants.test.js`'s
  `TIER_1_AGENTS` array (Tier-2 agents are not in that list)

- [ ] **Scenario: wrapper count of zero is a valid deliverable**
  Given the NO-WRAP default bias and the trigger-loaded nature of most skills
  When all 15 skills are evaluated and all receive NO-WRAP verdicts
  Then the deliverable is the documented verdict table alone (15 NO-WRAP entries
  with rationales)
  And no wrapper files are created
  And `node --test tests/*.test.js` continues to pass with `# fail 0`
  And the plan is marked complete with the finding: "all 15 unwrapped skills
  determined to be trigger-loaded references; no wrappers warranted"

- [ ] **Scenario: dispatch role criterion is applied consistently**
  Given the evaluation criterion is "is this skill invoked as a leaf in the
  dispatch chain, or is it purely trigger-loaded as correction context?"
  When any skill is evaluated
  Then the verdict rationale cites specific evidence for the dispatch-role claim:
  either a reference to an orchestrator agent that dispatches this skill by name,
  or the absence of any such reference as evidence of NO-WRAP
  And verdict rationales do not use vague terms like "could be useful" — only
  concrete dispatch-chain evidence

- [ ] **Scenario: docs/AGENT_ARCHITECTURE.md is consistent after any new wrappers**
  Given `docs/AGENT_ARCHITECTURE.md` describes the agent tier structure
  When new Tier-2 wrappers are created
  Then if the document contains a count of Tier-2 agents, that count is updated
  to reflect the additions
  And if no count is present, no change to `AGENT_ARCHITECTURE.md` is required
  And any WRAP verdict that adds a new specialization domain notes it in the
  findings section so a future doc update is trackable

## Scope

### In Scope

- Evaluating all 15 (or N if count differs) unwrapped skills for WRAP / NO-WRAP.
- Creating v8-conformant Tier-2 wrapper files for any WRAP verdicts.
- Updating `.ctoc/operations-registry.yaml` for any new wrappers.
- Recording per-skill verdicts in the audit artifact.
- Updating any count in `docs/AGENT_ARCHITECTURE.md` that changes due to new
  wrappers.

### Out of Scope

- Modifying the body or frontmatter of any existing SKILL.md file — content
  upgrades are CU2/CU3/CU4.
- Modifying any existing agent file — CU5 only creates new wrappers (WRAP
  verdict) or records decisions (NO-WRAP verdict).
- Adding new SKILL.md files — not in scope for this stub.
- Changes to `src/`, hook logic, gate logic, or the invariants test's `TIER_1_AGENTS`
  array — deployment-setup was the CU1 change; no Tier-1 additions in CU5.
- The reference library upgrades (languages, frameworks, quality-configs) — those
  are CU2, CU3, CU4.
- Skills not on the audit's unwrapped-skill list — the no-churn rule; do not
  evaluate or create wrappers for skills with existing agents.

## Risks

### Technical Risks

- **New wrapper fails architecture-invariants test on first run**: If the Tier-2
  frontmatter template is not copied precisely from an audited-SOLID agent,
  the test fails for the missing or wrong field.
  - Likelihood: LOW (mitigation is to copy exactly from a confirmed-passing agent)
  - Impact: LOW (caught immediately by the test; easy to fix)
  - Mitigation: Before creating any wrapper, identify the canonical Tier-2
    template agent; copy its frontmatter block character-for-character and then
    substitute only the skill-specific values (name, description, tools).

- **operations-registry.yaml format divergence**: The registry has a specific
  YAML schema; an entry with wrong indentation or missing fields will be invisible
  to consumers.
  - Likelihood: LOW (existing entries are the template)
  - Impact: MEDIUM (a silently missing registry entry means the wrapper is not
    discoverable via the registry query path)
  - Mitigation: Copy an existing Tier-2 registry entry structure exactly; diff
    the registry before and after to confirm only the intended rows were added.

### Business Risks

- **WRAP verdict with weak rationale creates an unneeded wrapper**: A WRAP
  verdict based on "this skill might be dispatched someday" rather than "this
  orchestrator already dispatches this skill" would violate the no-churn principle
  and inflate the agent surface.
  - Likelihood: LOW (acceptance criteria require specific dispatch-chain evidence)
  - Impact: LOW (an unneeded wrapper is an extra test entry; reviewable and
    removable)
  - Mitigation: Verdicts citing only potential dispatch value are treated as
    NO-WRAP; only confirmed current dispatch relationships justify WRAP.

### Dependency Risks

- **Blocked by CU1**: CU5 requires CU1 to stabilize the agent layer and the
  architecture-invariants test before new wrappers are added. Running CU5 before
  CU1 risks adding wrappers to an unstable test surface.
  - Likelihood: LOW (CU1 is `order: 1`; queue enforces sequencing)
  - Impact: MEDIUM (test instability during CU5 makes it hard to confirm new
    wrappers pass)
  - Mitigation: CU5's `depends_on: [CU1]` enforces sequencing; implementation
    does not begin until CU1's `# fail 0` is confirmed.

## Priority

**Priority: LOW** (Score: 3/9)
- Dependency: LOW (1) — no stub depends on CU5; it is the only terminal node
  that may produce zero deliverable files (all NO-WRAP).
- Business Impact: LOW (1) — correct WRAP verdicts fill a real gap, but the
  default bias is NO-WRAP; the deliverable may be a verdict table only, with no
  new agent files.
- Technical Risk: LOW (1) — wrapper creation is straightforward copy-and-
  substitute from a canonical template; the main risk (wrong template) is low
  with the mitigation in place.

## Decisions Taken Under Ambiguity

- **Default verdict bias** — when a skill's dispatch role is unclear, default to
  NO-WRAP and record the uncertainty. Rationale: adding an agent is reversible
  but inflates the invariants surface and the no-churn principle favors not
  creating files speculatively; morning review can promote NO-WRAP→WRAP cheaply.
- **Identifying the 15 skills** — taken from the audit artifact's
  unwrapped-skill list; cross-checked at implementation time by diffing
  SKILL.md files against existing Tier-2 agent wrappers. If the count differs
  from 15, the discrepancy is recorded as a finding, not blocked on.
- **Wrapper template** — new wrappers mirror an existing audited-SOLID Tier-2
  agent's frontmatter and structure exactly (copy the canonical shape) so the
  invariants test passes by construction.
- **Priority LOW** — this is the lowest-leverage tier per the vision; it is
  sequenced last and may be deferred entirely if the per-skill review concludes
  all 15 are NO-WRAP (in which case the deliverable is the documented verdict
  table alone).
