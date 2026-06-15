---
title: "CU1 — Tier 0 quick wins (targeted agent/skill fixes)"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 1
depends_on: []
status: refined
acceptance_criteria_count: 14
risk_level: LOW
files:
  - agents/infrastructure/deployment-setup.md
  - tests/architecture-invariants.test.js
  - agents/**/*.md
  - skills/security/dependency-checker.md
  - skills/testing/runners/unit-test-runner.md
  - skills/saas/posthog-analytics.md
  - skills/saas/sentry-errors.md
  - skills/mobile/react-native-bridge-checker.md
  - skills/data-ml/feature-store-validator.md
  - skills/**/*.md
---

# CU1 — Tier 0 quick wins

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit identified concrete, named defects in the agent and SKILL.md
layers that the current corpus carries silently: one Tier-1 agent is unenforced by
the architecture-invariants test, 18 agents declare a stale model identifier, 5
skills use a deprecated frontmatter key, regulation-bearing skills carry no
verification date, and several skills have thin or missing examples. Each defect is
either a correctness risk (vague regulatory reference is a latent miss per the
"warnings are bugs" principle), a staleness risk (stale model names cause silent
drift), or a structural inconsistency that erodes test coverage. These are surgical
edits — high correctness value at low implementation cost — and must ship first so
every subsequent tier builds on a clean, tested base.

### Current State

- `agents/infrastructure/deployment-setup.md` has `model: sonnet` / `tools:` but
  lacks `tier:`, `reports_to:`, and `dispatch_protocol:` — the v8 fields that
  `tests/architecture-invariants.test.js` enforces for all Tier-1 agents. It is
  also absent from the `TIER_1_AGENTS` array in that test, meaning the invariant
  check is completely bypassed for this agent.
- `grep -rl "model_optimized_for: opus-4-7" agents/` is expected to return
  approximately 18 files. The running model is Opus 4.8. These are staleness, not
  functional defects, but they are findable and confusing.
- `grep -rl "allowed-tools:" skills/` is expected to return approximately 5 files
  in the realtime/safety category. All other 94 SKILL.md files use `tools:`.
- `skills/security/dependency-checker.md` references the EU Cyber Resilience Act
  without Reg. (EU) 2024/2847, the 11 Sep 2026 / 11 Dec 2027 compliance dates, or
  NTIA minimum-elements — while sibling skills `dependency-auditor` and
  `sbom-cra-checker` carry precise citations. A vague regulatory pointer is a
  latent miss (warnings-are-critical principle).
- `skills/testing/runners/unit-test-runner.md` is missing `type: skill` in
  frontmatter — sole structural inconsistency in the testing/quality cohort.
- No regulation-bearing skill in compliance/, security/, or legal/ carries a
  `last verified:` line, making staleness invisible.
- `skills/saas/posthog-analytics.md` is missing a SQL BAD/SAFE example pair;
  `skills/saas/sentry-errors.md` is missing a C++ example — both required by the
  7-language coverage standard for multi-language SKILL.md files.
- `skills/mobile/react-native-bridge-checker.md` has only ~2 dated source
  references against a ~10+ category bar.
- `skills/data-ml/feature-store-validator.md` C# and Java examples are thinner
  than sibling skills in the same category.

### Impact

Every defect in scope is a known, confirmed gap rather than a speculative
improvement. The architecture-invariants test gap means deployment-setup can drift
without detection. Stale model names propagate to user-facing documentation. Vague
CRA references risk a compliance miss on a regulation with hard enforcement dates.
Thin examples reduce correction value at the exact moment Claude edits a matching
file. All items are correctable without domain risk; none requires discovery work.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criterion 1: "Tier 0 fixes land first; `node --test
tests/*.test.js` stays green; the architecture-invariants test enforces
deployment-setup as Tier 1." This stub is the enabling gate for all subsequent
corpus tiers.

### Impact Map

**Job to Be Done:** When Claude edits infrastructure, skill, or regulatory
reference files, the correction guides and agent definitions it loads must be
accurate, structurally valid, and up to date — so it produces correct, verifiable
output rather than silently perpetuating known defects.

- **Goal:** Eliminate all audit-confirmed structural defects and staleness before
  later tiers build on the corpus.
- **Actor:** CTOC pipeline (automated) and the human reviewer who reads test output
  and agent dispatch logs.
- **Impact:** The architecture-invariants test catches deployment-setup drift;
  model names in agent docs match the running model; regulatory skills carry
  traceable, dated citations.
- **Deliverable:** 11 targeted edits across agents/, tests/, and skills/ — no new
  files, no rewrites of healthy content.

### Success Metrics

- `node --test tests/*.test.js` passes with `# fail 0` after all edits.
- `grep -rl "model_optimized_for: opus-4-7" agents/` returns empty.
- `grep -rl "allowed-tools:" skills/` returns empty.
- All 11 target items are addressed; no file outside the enumerated set is touched.

### Stakeholders

- Human reviewer (gate approval): verifies test output and spot-checks edits.
- Implementation Planner (downstream): depends on a stable, tested corpus.

### Constraints

- No-churn rule: zero edits to files not on the enumerated target list. If grep
  finds counts that differ from the audit (18 agents / 5 skills), edit only the
  actually-matching files and record the discrepancy as a finding.
- Tests must stay green at every intermediate commit, not just at the end.
- No gate crossing: this plan stays in functional stage until human approval.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC pipeline (architecture-invariants test runner),
**I want** `deployment-setup` to declare v8 Tier-1 frontmatter and be listed in
`TIER_1_AGENTS`,
**so that** its architectural contract is enforced and drift is caught automatically.

**As a** human reviewer reading agent dispatch docs,
**I want** all substantive agents to declare the model they actually run on,
**so that** the documentation matches reality and I can trust model selection
decisions at a glance.

**As a** compliance-aware developer loading `dependency-checker` during a CRA
audit,
**I want** the skill to cite Reg. (EU) 2024/2847, both enforcement dates, and NTIA
minimum-elements with the same precision as `dependency-auditor`,
**so that** I cannot miss a hard regulatory deadline due to a vague reference.

### Acceptance Criteria

- [ ] **Scenario: deployment-setup gains v8 Tier-1 frontmatter**
  Given `agents/infrastructure/deployment-setup.md` currently lacks `tier:`,
  `reports_to:`, and `dispatch_protocol:` fields
  When the implementer mirrors the exact field set of an audited-SOLID Tier-1
  agent (e.g. `agents/planning/implementation-planner.md`)
  Then the file contains `tier: 1`, `reports_to: cto-chief`, and
  `dispatch_protocol: v1` in its YAML frontmatter

- [ ] **Scenario: architecture-invariants test enforces deployment-setup**
  Given `deployment-setup` is absent from `TIER_1_AGENTS` in
  `tests/architecture-invariants.test.js`
  When the entry `'agents/infrastructure/deployment-setup.md'` is added to the
  `TIER_1_AGENTS` array
  Then `node --test tests/architecture-invariants.test.js` passes with `# fail 0`
  And the new entry is covered by both the `tier: 1` and `reports_to: cto-chief`
  assertions

- [ ] **Scenario: stale model_optimized_for entries are replaced**
  Given `grep -rl "model_optimized_for: opus-4-7" agents/` returns N files
  (expected ~18; if N differs, record the discrepancy)
  When each matching file's `model_optimized_for: opus-4-7` is updated to
  `model_optimized_for: opus-4-8`
  Then `grep -rl "model_optimized_for: opus-4-7" agents/` returns empty
  And `grep -rl "model_optimized_for: opus-4-8" agents/` returns N files

- [ ] **Scenario: allowed-tools key is normalized**
  Given `grep -rl "allowed-tools:" skills/` returns M files
  (expected ~5; if M differs, record the discrepancy)
  When each matching file's `allowed-tools:` array key is renamed to `tools:` and
  its value is reformatted as the string style used by the other 94 SKILL.md files
  Then `grep -rl "allowed-tools:" skills/` returns empty
  And the affected skills pass `node --test tests/*.test.js` with no SKILL
  validation failures

- [ ] **Scenario: dependency-checker CRA references are grounded**
  Given `skills/security/dependency-checker.md` references the CRA without
  Reg. (EU) 2024/2847, 11 Sep 2026 / 11 Dec 2027 dates, or NTIA minimum-elements
  When the implementer adds these citations, verified against an authoritative
  source at edit time, matching the precision of `dependency-auditor`
  Then the file contains "2024/2847", "11 Sep 2026" or "September 2026",
  "11 Dec 2027" or "December 2027", and "NTIA minimum elements"
  And the citation carries a `source:` URL or document reference

- [ ] **Scenario: unit-test-runner gains type: skill frontmatter**
  Given `skills/testing/runners/unit-test-runner.md` frontmatter is missing
  `type: skill`
  When `type: skill` is added to the YAML frontmatter block
  Then the file's frontmatter contains `type: skill`
  And `node --test tests/*.test.js` passes with `# fail 0`

- [ ] **Scenario: regulation-bearing skills gain last verified dates**
  Given no skill in compliance/, security/, or legal/ carries a `last verified:`
  line
  When all skills in those categories that cite a named statute or regulation are
  updated to include `last verified: 2026-06-15` (or the retrieval date if a newer
  authoritative source is found during implementation)
  Then each updated skill contains a `last verified:` line in its header section
  And skills with no regulatory citation in those categories are not touched

- [ ] **Scenario: posthog-analytics gains a SQL BAD/SAFE example pair**
  Given `skills/saas/posthog-analytics.md` has no SQL BAD/SAFE code example
  When a BAD/SAFE pair is added covering a real PostHog anti-pattern
  (e.g. unbounded event queries without date filters causing full-table scans)
  Then the file contains a `BAD` SQL block and a `SAFE` SQL block
  And the example is substantive (demonstrates a real PostHog footgun, not a
  placeholder)

- [ ] **Scenario: sentry-errors gains a C++ example**
  Given `skills/saas/sentry-errors.md` has no C++ code example
  When a C++ BAD/SAFE or annotated example is added covering a real Sentry SDK
  usage pattern (e.g. correct scope/breadcrumb usage vs. fire-and-forget without
  flush before process exit)
  Then the file contains a C++ code block marked with `cpp` or `c++`
  And the example demonstrates a non-trivial correctness concern

- [ ] **Scenario: react-native-bridge-checker reaches source-ref bar**
  Given `skills/mobile/react-native-bridge-checker.md` has ~2 dated source
  references
  When the skill body is updated to add dated source references for bridge
  architecture, JSI, Hermes compatibility, turbo modules, and known bridge pitfalls
  Then the file contains at least 10 distinct source references, each with a URL
  or document title and a retrieval/publication date

- [ ] **Scenario: feature-store-validator C# and Java examples are thickened**
  Given `skills/data-ml/feature-store-validator.md` C# and Java examples are
  thinner than sibling skills
  When each example is expanded to cover the same depth as the richest sibling
  in the data-ml category (matching structure: BAD pattern, SAFE pattern, and an
  explanation of why the bad pattern fails)
  Then the C# and Java blocks each contain a BAD block, a SAFE block, and an
  explanatory comment or annotation

- [ ] **Scenario: no file outside the enumerated target set is modified**
  Given the no-churn rule from the parent vision
  When the implementer reviews every file touched
  Then only files in the `files:` frontmatter list are modified
  And any file not in that list that was considered but not changed is recorded
  in the plan's findings section

- [ ] **Scenario: all tests pass after each individual edit**
  Given CTOC's continuous-green policy
  When each of the 11 targeted edits is made
  Then `node --test tests/*.test.js` passes with `# fail 0` after each edit
  (not only at the end of the batch)

- [ ] **Scenario: count mismatches are recorded, not blocked on**
  Given grep may return counts different from the audit's 18 / 5
  When a count mismatch is discovered
  Then the implementer records the actual count and the delta in the plan's
  findings section
  And continues editing the actually-matching files without blocking

## Scope

### In Scope

- `agents/infrastructure/deployment-setup.md`: add v8 Tier-1 frontmatter fields
  (`tier: 1`, `reports_to: cto-chief`, `dispatch_protocol: v1`).
- `tests/architecture-invariants.test.js`: add `deployment-setup` to `TIER_1_AGENTS`.
- All agents matching `grep -rl "model_optimized_for: opus-4-7" agents/`:
  update to `opus-4-8`.
- All skills matching `grep -rl "allowed-tools:" skills/`: normalize to `tools:`.
- `skills/security/dependency-checker.md`: add CRA number, dates, NTIA
  minimum-elements.
- `skills/testing/runners/unit-test-runner.md`: add `type: skill` to frontmatter.
- All regulation-citing skills in compliance/, security/, legal/: add
  `last verified: 2026-06-15` (or retrieval date if newer source found).
- `skills/saas/posthog-analytics.md`: add SQL BAD/SAFE example.
- `skills/saas/sentry-errors.md`: add C++ example.
- `skills/mobile/react-native-bridge-checker.md`: add dated source references
  to reach the 10+ bar.
- `skills/data-ml/feature-store-validator.md`: thicken C# and Java examples.

### Out of Scope

- Any agent or skill not in the enumerated target list above — covered by no-churn
  rule; rewriting healthy files is not permitted.
- Adding new SKILL.md sections, rewriting existing skill sections, or changing
  skill scope — this stub is surgical edits only; broader skill content upgrades
  are CU2–CU4.
- Tier-2 wrapper creation for unwrapped skills — that is CU5.
- Changes to hook logic, gate logic, or any file under `src/hooks/` or
  `src/lib/` — out of scope per the parent vision's self-improvement constraint.
- Reference library (`skills/languages/`, `skills/frameworks/`) content upgrades
  — those are CU2–CU4.

## Risks

### Technical Risks

- **TIER_1_AGENTS addition causes invariant test to fail on missing fields**: If
  `deployment-setup.md` is added to the array before its frontmatter is updated,
  the `tier: 1` and `reports_to: cto-chief` assertions will fail.
  - Likelihood: MEDIUM (ordering issue; easy to hit accidentally)
  - Impact: LOW (caught immediately by the test; no production effect)
  - Mitigation: Update `deployment-setup.md` frontmatter first, then add it to
    `TIER_1_AGENTS`; run `node --test tests/architecture-invariants.test.js`
    between the two edits to confirm the first edit is valid.

- **`allowed-tools:` array-to-string reformatting corrupts tool lists**: YAML
  arrays (`[Read, Write]`) and strings (`"Read, Write"`) must produce identical
  tool sets after reformatting.
  - Likelihood: LOW (mechanical find-and-replace; other 94 files are the template)
  - Impact: MEDIUM (a skill loaded with wrong tools silently restricts Claude)
  - Mitigation: For each normalized file, diff the tool list before and after to
    confirm no tool is added or dropped; grep for the skill name in `.ctoc/skills.json`
    to confirm the trigger still maps correctly.

### Business Risks

- **CRA citation adds incorrect dates**: The EU enforcement dates (11 Sep 2026 /
  11 Dec 2027) must be verified against the actual regulation text at edit time.
  - Likelihood: LOW (dates are public and stable)
  - Impact: HIGH (a wrong compliance date in a regulatory skill is worse than no
    date — it gives false confidence)
  - Mitigation: Retrieve Reg. (EU) 2024/2847 from EUR-Lex or an official source
    during implementation; add the source URL to the skill so the citation is
    traceable.

### Dependency Risks

- **No dependencies**: CU1 has `depends_on: []`. All subsequent tiers depend on
  this stub completing cleanly.
  - Likelihood: N/A
  - Impact: HIGH if CU1 is blocked (CU2/CU3/CU4/CU5 all depend on CU1's clean
    test-passing base)
  - Mitigation: Prioritize CU1 ahead of all other corpus stubs in the
    implementation queue (enforced by `order: 1` and `priority: HIGH`).

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — all four sibling stubs (CU2–CU5) depend on CU1; it is
  the gate that makes the corpus buildable.
- Business Impact: HIGH (3) — closes the architecture-invariants gap,
  eliminates regulatory citation risk, and normalizes structural inconsistencies
  that affect every subsequent implementation agent.
- Technical Risk: MEDIUM (2) — individual edits are low-complexity; the main risk
  (ordering of the invariants test edit) is manageable with a one-line mitigation.

## Decisions Taken Under Ambiguity

- **`last verified:` date value** — use the audit date 2026-06-15 as the
  verification date for skills confirmed current at audit; if a regulatory fact
  is re-checked during implementation and a newer authoritative source exists,
  use that source's retrieval date instead. Rationale: the audit is the
  verification event for unchanged facts.
- **Scope of "regulation-bearing skills"** — limited to the
  compliance/, security/, and legal/ category skills that cite a named
  statute/regulation. Skills with no regulatory citation do NOT receive a
  `last verified:` line in this stub (avoids churning solid non-regulatory
  files). Broader rollout, if desired, is a separate decision.
- **v8 4-tier frontmatter shape for deployment-setup** — mirror the exact field
  set used by an existing audited-SOLID Tier-1 agent (copy the canonical field
  list rather than inventing one) so the invariants test passes by construction.
- **Count mismatches (18 agents / 5 skills)** — if grep counts differ from the
  audit, edit the actually-matching files and note the discrepancy in this
  plan's findings rather than blocking; morning review reconciles.
