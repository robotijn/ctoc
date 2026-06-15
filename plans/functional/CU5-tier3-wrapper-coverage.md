---
title: "CU5 — Tier 3 wrapper-coverage (13 unwrapped skills → WRAP ALL)"
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
  - .ctoc/audit/corpus-audit-2026-06-15.json
  - docs/AGENT_ARCHITECTURE.md
---

# CU5 — Tier 3 wrapper-coverage

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit found SKILL.md files with no corresponding agent wrapper. The
corrected implementation-time count is **13** (the original audit figure of 15 was
overstated by 2; the authoritative count is confirmed at implementation time by
diffing `skills/**/SKILL.md` paths against existing `agents/**/*.md` `target_skill:`
pointers). The three missing agent directories — `agents/safety/`, `agents/legal/`,
and `agents/realtime/` — account for the majority of the gap. The remaining
unwrapped skills are scattered across existing agent categories.

The decision is **WRAP ALL 13**. Every unwrapped skill is dispatched by name by
`cto-chief` or a sub-orchestrator; none is purely trigger-loaded with no dispatch
role. NO-WRAP is the justified exception, not the default: if the implementation-
time cross-check surfaces a skill with zero dispatch references in any orchestrator,
that skill receives a NO-WRAP verdict with documented rationale, and the final WRAP
count is adjusted accordingly. The burden of proof is on NO-WRAP, not WRAP.

### Current State

The implementation-time cross-check produces the authoritative list by:
1. Walking `skills/**/SKILL.md` to enumerate all SKILL.md files.
2. Walking `agents/**/*.md` and collecting all `target_skill:` values.
3. Computing the set difference: skills with no matching `target_skill:` pointer.

The audit baseline is 13. The three missing agent directories
(`agents/safety/`, `agents/legal/`, `agents/realtime/`) contain 3 + 2 + 2 = 7
skills confirmed unwrapped. The remaining 6 are distributed across existing
categories; `compliance/sbom-cra-checker` is one confirmed example (no wrapper at
`agents/compliance/sbom-cra-checker.md` as of the audit date). The implementation-
time cross-check resolves the exact list.

The CU1 edits stabilize the agent layer and the architecture-invariants test before
this stub runs, making the test the reliable arbiter for any new wrapper.

### Impact

Creating missing wrappers closes dispatch gaps: skills unreachable via the dispatch
chain gain their entry points. The wrapper files are minimal (3-field frontmatter +
1 body line each), so the implementation cost is low relative to the coverage value.
The architecture-invariants test does not validate wrapper agents (it validates
Tier 1 via `TIER_1_AGENTS` and Tier 2 via the `walkSkillFiles` category scan for
`tier: 2` frontmatter on SKILL.md files) — so new wrappers do not require test
modifications.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criterion 5: "The audit artifact (per-file verdicts)
is preserved so progress is trackable and no thin file is silently skipped." And the
vision's Tier 3 framing: "decide per skill whether a Tier-2 wrapper is warranted."
The locked decision: WRAP ALL 13 (with NO-WRAP as a documented exception requiring
dispatch-absence evidence, not the default).

### Impact Map

**Job to Be Done:** When the CTO Chief dispatch chain needs to invoke a specialized
skill, a Tier-2 agent wrapper must exist for it — so the dispatch chain reaches
specialized skills without routing gaps.

- **Goal:** Close all 13 wrapper coverage gaps with correctly structured wrapper
  files, so the dispatch chain is complete.
- **Actor:** CTO Chief and sub-orchestrators (dispatch chain); human reviewer
  (approves the wrapper set before Gate 1).
- **Impact:** All 13 skills become reachable via the dispatch chain; the agent
  layer has no silent gaps; wrapper creation is documented in the audit ledger.
- **Deliverable:** Up to 13 new agent wrapper files (one per unwrapped skill)
  plus three new agent directories (`agents/safety/`, `agents/legal/`,
  `agents/realtime/`); the audit ledger updated with wrapper verdicts.

### Success Metrics

- Implementation-time cross-check confirms the exact list (baseline: 13 skills).
- Every confirmed-unwrapped skill receives a wrapper or a documented NO-WRAP
  verdict; no skill is silently skipped.
- `node --test tests/*.test.js` passes with `# fail 0` after all wrappers are
  created.
- The audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` is updated with
  wrapper verdicts for all 13 skills.
- `docs/AGENT_ARCHITECTURE.md` tier-count lines are updated if they reference
  exact agent counts that change due to new wrappers.

### Stakeholders

- CTO Chief and sub-orchestrators (dispatch chain consumers).
- Architecture-invariants test (structural gate — but does NOT need to be
  modified for wrapper agents; wrappers have `type: wrapper`, not `tier: 2`).
- Human reviewer (approves the wrapper set before Gate 1).

### Constraints

- **WRAP default**: the verdict for each unwrapped skill is WRAP unless dispatch-
  absence evidence is found in all orchestrator agent files. NO-WRAP requires
  documented evidence, not mere uncertainty.
- **No-churn rule on SKILL.md files**: CU5 creates wrapper files only. Zero
  SKILL.md files are modified (content upgrades are CU2/CU3/CU4).
- **No-churn rule on existing agent files**: CU5 creates new wrapper files only.
  Zero existing `agents/**/*.md` files are modified.
- **Wrapper schema**: the exact 3-field frontmatter form — `name:`, `type: wrapper`,
  `target_skill:` — plus one body line pointing at the SKILL.md. No additional
  fields (`tier:`, `reports_to:`, `dispatch_protocol:`, `model:`, `tools:`) belong
  on the wrapper; that metadata lives on the SKILL.md. Copying any of those fields
  to the wrapper is wrong — the canonical example is
  `agents/quality/code-reviewer.md`.
- **operations-registry.yaml**: the current registry schema lists orchestrator/
  pipeline agents only (verified: wrapper agents are not registered there). CU5
  does NOT add wrapper agents to `.ctoc/operations-registry.yaml`. That file's
  schema does not accommodate wrapper entries; modifying it would require a schema
  change outside this stub's scope.
- **Depends only on CU1**: CU5 is independent of CU2/CU3/CU4 (disjoint concern).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTO Chief dispatching a skill-specific task,
**I want** every currently unwrapped skill to have a correctly structured wrapper,
**so that** my dispatch chain reaches all specialized skills without routing gaps.

**As a** human reviewer approving CU5,
**I want** the exact list of 13 (or N if count differs) unwrapped skills confirmed
by implementation-time cross-check, with WRAP or documented NO-WRAP for each,
**so that** I can confirm coverage is complete and no skill is silently skipped.

**As a** future corpus maintainer reading a wrapper file,
**I want** each wrapper to use the canonical 3-field form with no invented fields,
**so that** the agent-resolver correctly identifies it as a redirect stub via
`type: wrapper` and `target_skill:`.

### Acceptance Criteria

- [ ] **Scenario: implementation-time cross-check confirms the exact list**
  Given the audit baseline of 13 unwrapped skills
  When the implementer diffs `skills/**/SKILL.md` paths against
  `agents/**/*.md` `target_skill:` pointers
  Then the exact list of unwrapped skills is recorded in the audit ledger
  And if the count differs from 13, the discrepancy is recorded with the method
  used to derive the implementation-time list
  And no skill is skipped because of the discrepancy

- [ ] **Scenario: WRAP ALL proceeds as default**
  Given the locked decision to wrap all 13 unwrapped skills
  When the implementer evaluates each skill on the confirmed list
  Then the default verdict is WRAP for every skill
  And a NO-WRAP verdict is issued only when the implementer finds zero
  `target_skill:` or dispatch references to that skill across all orchestrator
  agent files (CTO Chief and all sub-orchestrators)
  And every NO-WRAP verdict is documented with the search evidence: "searched
  [list of orchestrator files]; found zero dispatch references"

- [ ] **Scenario: wrapper uses exact 3-field schema**
  Given the canonical wrapper form at `agents/quality/code-reviewer.md`:
  `name:` + `type: wrapper` + `target_skill:` in frontmatter, plus one body line
  When any new wrapper is created
  Then its frontmatter contains exactly `name:`, `type: wrapper`, and
  `target_skill:` — no other fields
  And its body contains exactly one line: "This agent's logic lives at
  skills/<category>/<name>/SKILL.md. Read that file in full, then follow its
  instructions." (or the exact body text of the canonical example)
  And the file does NOT contain `tier:`, `reports_to:`, `dispatch_protocol:`,
  `model:`, `tools:`, or any other frontmatter field

- [ ] **Scenario: new agent directories are created for safety/legal/realtime**
  Given `agents/safety/`, `agents/legal/`, and `agents/realtime/` do not exist
  When WRAP verdicts are issued for skills in the `skills/safety/`,
  `skills/legal/`, and `skills/realtime/` categories
  Then the three directories are created
  And each wrapper file is placed at
  `agents/<category>/<skill-name>.md` matching the pattern of existing wrappers
  (e.g. `agents/quality/code-reviewer.md` → `target_skill: quality/code-reviewer`)

- [ ] **Scenario: target_skill path resolves to an existing SKILL.md**
  Given the agent-resolver resolves `target_skill: <cat>/<name>` to
  `skills/<cat>/<name>/SKILL.md`
  When any new wrapper is created with `target_skill: <cat>/<name>`
  Then `skills/<cat>/<name>/SKILL.md` exists at that exact path
  And `node --test tests/skill-loading.test.js` passes (redirect stubs point to
  existing skills assertion)

- [ ] **Scenario: no existing agent or skill body is modified**
  Given the no-churn rule applied to this stub's scope
  When CU5 creates wrappers
  Then zero existing agent `.md` files are modified (frontmatter or body)
  And zero existing SKILL.md files are modified (content upgrades are CU2/CU3/CU4)
  And the only new or modified items are: new wrapper files and the audit ledger

- [ ] **Scenario: tests stay green after each new wrapper**
  Given the continuous-green policy
  When any new wrapper is added
  Then `node --test tests/*.test.js` passes with `# fail 0` immediately after
  the wrapper file is created
  And no modification to `tests/architecture-invariants.test.js` is required
  (wrapper agents have `type: wrapper`, not `tier: 2`; the invariants test does
  not enumerate wrapper agents)

- [ ] **Scenario: audit ledger is updated with wrapper verdicts**
  Given the audit ledger exists at `.ctoc/audit/corpus-audit-2026-06-15.json`
  (produced by CU1)
  When CU5 implementation completes
  Then the ledger contains one record per skill evaluated, each carrying the
  wrapper verdict (WRAP / NO-WRAP) and the new wrapper path (for WRAP) or
  the dispatch-absence evidence (for NO-WRAP)
  And no previously existing ledger record is modified (append-only for new fields)

- [ ] **Scenario: docs/AGENT_ARCHITECTURE.md is updated if counts change**
  Given `docs/AGENT_ARCHITECTURE.md` may contain exact Tier-2 agent counts
  When new wrappers are created that change the documented agent count
  Then any count referencing the number of agents in the affected categories
  is updated to reflect the additions
  And if no count is present, no change to the document is required

- [ ] **Scenario: operations-registry.yaml is NOT modified**
  Given the verified registry schema does not accommodate wrapper agent entries
  (wrapper agents are not enumerated in `.ctoc/operations-registry.yaml`)
  When CU5 creates new wrapper files
  Then `.ctoc/operations-registry.yaml` is NOT modified
  And the audit ledger records this finding: "operations-registry.yaml schema
  does not support wrapper entries; no modification made"

## Scope

### In Scope

- Confirming the exact list of unwrapped skills via implementation-time cross-check
  (baseline: 13 skills).
- Creating wrapper files for all WRAP verdicts (one file per skill, 3-field
  frontmatter + 1 body line, placed at `agents/<category>/<skill-name>.md`).
- Creating `agents/safety/`, `agents/legal/`, `agents/realtime/` directories as
  needed by WRAP verdicts in those categories.
- Updating `.ctoc/audit/corpus-audit-2026-06-15.json` with wrapper verdicts.
- Updating any count in `docs/AGENT_ARCHITECTURE.md` that changes due to new
  wrappers.

### Out of Scope

- Modifying the body or frontmatter of any existing SKILL.md file — content
  upgrades are CU2/CU3/CU4.
- Modifying any existing agent file — CU5 creates new wrappers only.
- Adding new SKILL.md files — not in scope for this stub.
- Modifying `.ctoc/operations-registry.yaml` — schema does not support wrapper
  entries; a schema change would require a separate plan.
- Changes to `src/`, hook logic, gate logic, or `tests/architecture-invariants.test.js`'s `TIER_1_AGENTS` array.
- The reference library upgrades (languages, frameworks, quality-configs) — CU2/CU3/CU4.
- Skills not on the confirmed unwrapped-skill list — no-churn rule.

## Risks

### Technical Risks

- **target_skill path mismatch**: if the wrapper's `target_skill:` value does not
  exactly match the `skills/<cat>/<name>` subdirectory path, the agent-resolver
  returns `broken-redirect` and `skill-loading.test.js` will fail.
  - Likelihood: LOW (each SKILL.md path is verified before writing the wrapper)
  - Impact: MEDIUM (a broken-redirect silently fails dispatch; caught by tests)
  - Mitigation: For each wrapper, confirm `skills/<cat>/<name>/SKILL.md` exists
    before writing the wrapper file; run
    `node --test tests/skill-loading.test.js` after each wrapper.

- **Extra frontmatter fields on wrapper break agent-resolver**: the resolver
  checks `type: wrapper` and `target_skill:` only; extra fields are harmless but
  add noise and could confuse future tooling.
  - Likelihood: LOW (canonical example is clear; copy it literally)
  - Impact: LOW (extra fields do not break the resolver today; might break future
    strict-schema validation)
  - Mitigation: Copy the canonical wrapper (`agents/quality/code-reviewer.md`)
    character-for-character; substitute only `name:` and `target_skill:` values.

### Business Risks

- **Implementation-time count differs significantly from 13**: if the cross-check
  returns a count much higher or lower, the audit may have been based on stale
  data or the repo changed between audit and implementation.
  - Likelihood: LOW (the cross-check is deterministic given the current repo state)
  - Impact: LOW (the plan handles count drift: record discrepancy, proceed with
    actual list)
  - Mitigation: Record the discrepancy in the audit ledger; wrap all confirmed-
    unwrapped skills; do not wrap skills that already have wrappers.

### Dependency Risks

- **Blocked by CU1**: CU5 requires CU1 to stabilize the agent layer and produce
  the audit ledger before new wrappers are added.
  - Likelihood: LOW (CU1 is `order: 1`; queue enforces sequencing)
  - Impact: MEDIUM (without the CU1 ledger, the cross-check baseline is missing)
  - Mitigation: CU5's `depends_on: [CU1-tier0-quick-wins]` enforces sequencing;
    implementation does not begin until CU1's `# fail 0` is confirmed.

## Priority

**Priority: LOW** (Score: 3/9)
- Dependency: LOW (1) — no stub depends on CU5; it is the terminal node.
- Business Impact: LOW (1) — filling wrapper gaps is correctness work, but the
  skills themselves are functional (trigger-loaded) regardless of wrapper presence;
  the gap is in dispatch-chain reachability.
- Technical Risk: LOW (1) — wrapper creation is straightforward copy-and-substitute
  from the canonical template; the main risk (broken target_skill path) is caught
  immediately by the test.

## Decisions Taken Under Ambiguity

- **Default verdict changed to WRAP** — the locked decision from the adversarial
  review. The prior default (NO-WRAP) was reversed: all 13 confirmed-unwrapped
  skills are dispatched by name by cto-chief or sub-orchestrators, making WRAP
  the correct default. NO-WRAP requires evidence of dispatch absence, not mere
  uncertainty.
- **Count corrected from 15 to 13** — the audit overestimated by 2. The
  implementation-time cross-check is authoritative; the baseline of 13 is the
  starting expectation, not a hard constraint.
- **operations-registry.yaml not modified** — verified at implementation time:
  the registry's current schema lists only orchestrator/pipeline agents (cto-chief,
  product-owner, test-maker, etc.) and does not have a section for wrapper agents.
  Adding wrapper agents would require a schema extension; that is out of scope.
  The audit ledger records this finding.
- **No test modification needed** — the architecture-invariants test validates
  SKILL.md files (tier: 2 etc.) and Tier-1 orchestrators (TIER_1_AGENTS array).
  It does not enumerate wrapper agents. New wrappers pass through without requiring
  any test update.
- **Wrapper body text** — copied verbatim from the canonical example at
  `agents/quality/code-reviewer.md`. No variation per wrapper; consistency over
  creativity.
