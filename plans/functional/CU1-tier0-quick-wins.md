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
acceptance_criteria_count: 16
risk_level: LOW
files:
  - agents/infrastructure/deployment-setup.md
  - tests/architecture-invariants.test.js
  - tests/agent-modernization.test.js
  - tests/skill-loading.test.js
  - agents/coordinator/cto-chief.md
  - agents/coordinator/synthesizer.md
  - agents/iron-loop/iron-loop-integrator.md
  - agents/iron-loop/iron-loop-critic.md
  - agents/iron-loop/iron-loop-executor.md
  - agents/pipeline/agent-writer.md
  - agents/pipeline/agent-critic.md
  - agents/pipeline/agent-tester.md
  - agents/pipeline/agent-qa.md
  - agents/pipeline/agent-publisher.md
  - agents/planning/vision-advisor.md
  - agents/planning/vision-decomposer.md
  - agents/planning/product-owner.md
  - agents/planning/implementation-planner.md
  - agents/planning/functional-reviewer.md
  - agents/planning/implementation-plan-reviewer.md
  - agents/planning/iron-loop-integrator.md
  - agents/implementation/test-maker.md
  - agents/implementation/quality-checker.md
  - agents/implementation/implementer.md
  - agents/implementation/self-reviewer.md
  - agents/implementation/optimizer.md
  - agents/implementation/security-scanner.md
  - agents/implementation/verifier.md
  - agents/implementation/documenter.md
  - agents/implementation/implementation-reviewer.md
  - skills/security/dependency-checker/SKILL.md
  - skills/testing/runners/unit-test-runner/SKILL.md
  - skills/saas/posthog-analytics/SKILL.md
  - skills/saas/sentry-errors/SKILL.md
  - skills/mobile/react-native-bridge-checker/SKILL.md
  - .ctoc/audit/corpus-audit-2026-06-15.json
---

# CU1 — Tier 0 quick wins

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit identified concrete, named defects in the agent and SKILL.md
layers that the current corpus carries silently: one Tier-1 agent is unenforced by
the architecture-invariants test, a set of agents declare a stale model identifier,
5 skills use a deprecated frontmatter key, regulation-bearing skills carry no
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
- `grep -rl "model_optimized_for: opus-4-7" agents/` returns N files (audit
  baseline: approximately 18; exact count confirmed at implementation time).
  The running model is Opus 4.8. These are staleness, not functional defects,
  but they are findable and confusing.
- **Critical constraint:** `tests/agent-modernization.test.js` line 89 asserts
  `model_optimized_for: opus-4-7` for three named orchestrators
  (`vision-advisor`, `product-owner`, `implementation-planner`). `tests/skill-
  loading.test.js` line 255 asserts `model_optimized_for: 'opus-4-7'` for every
  converted skill. Updating those files to `opus-4-8` without simultaneously
  updating both test assertions produces immediate red. The model bump and the
  two test updates are one atomic change — separate commits break CI.
- `grep -rl "allowed-tools:" skills/` returns M files (audit baseline:
  approximately 5 in the realtime/safety category; exact count confirmed at
  implementation time). All other SKILL.md files use `tools:`.
- `skills/security/dependency-checker/SKILL.md` references the EU Cyber
  Resilience Act without Reg. (EU) 2024/2847, the 11 Sep 2026 / 11 Dec 2027
  compliance dates, or NTIA minimum-elements — while sibling skills
  `dependency-auditor` and `sbom-cra-checker` carry precise citations. A vague
  regulatory pointer is a latent miss (warnings-are-critical principle).
- `skills/testing/runners/unit-test-runner/SKILL.md` is missing `type: skill`
  in frontmatter — sole structural inconsistency in the testing/quality cohort.
- No regulation-bearing skill in compliance/, security/, or legal/ carries a
  `last verified:` line, making staleness invisible.
- `skills/saas/posthog-analytics/SKILL.md` is missing a SQL BAD/SAFE example
  pair; `skills/saas/sentry-errors/SKILL.md` is missing a C++ example — both
  required by the 7-language coverage standard for multi-language SKILL.md files.
- `skills/mobile/react-native-bridge-checker/SKILL.md` has only ~2 dated source
  references against a ~10+ category bar.
- No per-file audit ledger exists. Every downstream corpus plan (CU2–CU5) must
  diff its scope against an authoritative artifact; without one, skip-silently
  is undetectable.

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
deployment-setup as Tier 1." And Success Criterion 5: "The audit artifact (per-file
verdicts) is preserved so progress is trackable and no thin file is silently
skipped." This stub is the enabling gate for all subsequent corpus tiers.

### Impact Map

**Job to Be Done:** When Claude edits infrastructure, skill, or regulatory
reference files, the correction guides and agent definitions it loads must be
accurate, structurally valid, and up to date — so it produces correct, verifiable
output rather than silently perpetuating known defects.

- **Goal:** Eliminate all audit-confirmed structural defects and staleness before
  later tiers build on the corpus, and produce the audit ledger that makes
  progress trackable.
- **Actor:** CTOC pipeline (automated) and the human reviewer who reads test output
  and agent dispatch logs.
- **Impact:** The architecture-invariants test catches deployment-setup drift;
  model names in agent docs match the running model; regulatory skills carry
  traceable, dated citations; downstream plans can diff against the ledger.
- **Deliverable:** Targeted edits across agents/, tests/, and skills/ — no new
  files except the audit ledger — plus `.ctoc/audit/corpus-audit-2026-06-15.json`.

### Success Metrics

- `node --test tests/*.test.js` passes with `# fail 0` after all edits.
- `grep -rl "model_optimized_for: opus-4-7" agents/` returns empty (model bump
  and test updates shipped as one atomic commit).
- `grep -rl "allowed-tools:" skills/` returns empty.
- `.ctoc/audit/corpus-audit-2026-06-15.json` exists and covers all target files.
- Only files in the enumerated `files:` list are modified.

### Stakeholders

- Human reviewer (gate approval): verifies test output and spot-checks edits.
- Implementation Planner (downstream): depends on a stable, tested corpus.
- CU2–CU5 (downstream): depend on the audit ledger for scope validation.

### Constraints

- **No-churn rule:** zero edits to files not on the enumerated target list. The
  `files:` list replaces all catch-all globs (no `agents/**/*.md`,
  `skills/**/*.md`) — catch-all globs defeat the no-churn guarantee. If grep
  finds agents outside the enumerated list that carry the stale model name, record
  the discrepancy but do NOT edit them (adding them requires a plan update first).
- **Atomic model bump:** the model bump commit must update the agent files AND both
  test assertions (`agent-modernization.test.js` line 89, `skill-loading.test.js`
  line 255) in the same atomic commit. No intermediate commit that has half the
  agents updated — that would produce a transient red.
- **Frontmatter-before-test:** add `deployment-setup` to `TIER_1_AGENTS` only
  after its frontmatter carries `tier: 1`, `reports_to: cto-chief`,
  `dispatch_protocol: v1`. A commit that adds it to the array before adding the
  frontmatter fields will immediately red the `tier: 1` assertion.
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
**I want** the skill to cite Reg. (EU) 2024/2847, both enforcement dates
(11 Sep 2026 reporting deadline; 11 Dec 2027 conformity deadline), and NTIA
minimum-elements with the same precision as `sbom-cra-checker`,
**so that** I cannot miss a hard regulatory deadline due to a vague reference.

**As a** downstream corpus plan (CU2–CU5),
**I want** a per-file audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json`
covering every file in scope,
**so that** I can diff my target list against the ledger and detect silent skips.

### Acceptance Criteria

- [ ] **Scenario: audit ledger is produced**
  Given no per-file audit ledger exists at `.ctoc/audit/corpus-audit-2026-06-15.json`
  When CU1 implementation completes
  Then the file exists at that exact path
  And it contains one record per file touched (or evaluated and found-clean),
  each record carrying: `path` (relative to repo root), `line_count` (integer),
  `section_count` (integer count of `##` headings), and `verdict` (one of
  SOLID / THIN / DEFECTIVE)
  And the record set covers every file in the `files:` frontmatter list
  And the file is valid JSON (parseable by `JSON.parse`)

- [ ] **Scenario: deployment-setup gains v8 Tier-1 frontmatter**
  Given `agents/infrastructure/deployment-setup.md` currently lacks `tier:`,
  `reports_to:`, and `dispatch_protocol:` fields
  When the implementer mirrors the exact field set of an audited-SOLID Tier-1
  agent (e.g. `agents/planning/implementation-planner.md`)
  Then the file contains `tier: 1`, `reports_to: cto-chief`, and
  `dispatch_protocol: v1` in its YAML frontmatter
  And `node --test tests/architecture-invariants.test.js` passes with `# fail 0`
  before the deployment-setup entry is added to `TIER_1_AGENTS` (verifying the
  frontmatter edit alone is valid)

- [ ] **Scenario: architecture-invariants test enforces deployment-setup**
  Given `deployment-setup` is absent from `TIER_1_AGENTS` in
  `tests/architecture-invariants.test.js`
  When the entry `'agents/infrastructure/deployment-setup.md'` is added to the
  `TIER_1_AGENTS` array (only AFTER the frontmatter scenario above passes)
  Then `node --test tests/architecture-invariants.test.js` passes with `# fail 0`
  And the new entry is covered by both the `tier: 1` and `reports_to: cto-chief`
  assertions

- [ ] **Scenario: model_optimized_for bump is atomic with test updates**
  Given `grep -rl "model_optimized_for: opus-4-7" agents/` returns N files
  (expected ~18; if N differs from the enumerated `files:` list, record the
  discrepancy — edit only the files explicitly listed)
  And `tests/agent-modernization.test.js` asserts `opus-4-7` for the three
  Phase 1 orchestrators
  And `tests/skill-loading.test.js` asserts `model_optimized_for: 'opus-4-7'`
  for all converted skills
  When all matching files in `files:` have `opus-4-7` updated to `opus-4-8`
  AND `tests/agent-modernization.test.js` is updated to assert `opus-4-8`
  AND `tests/skill-loading.test.js` is updated to assert `opus-4-8`
  all in the same atomic commit
  Then `grep -rl "model_optimized_for: opus-4-7" agents/` returns empty
  And `node --test tests/*.test.js` passes with `# fail 0`
  And no intermediate commit exists where some agents carry `opus-4-8` but the
  test still asserts `opus-4-7`

- [ ] **Scenario: allowed-tools key is normalized**
  Given `grep -rl "allowed-tools:" skills/` returns M files
  (expected ~5; if M differs, record the discrepancy)
  When each matching file's `allowed-tools:` array key is renamed to `tools:` and
  its value is reformatted as the string style used by the other SKILL.md files
  Then `grep -rl "allowed-tools:" skills/` returns empty
  And the affected skills pass `node --test tests/*.test.js` with no SKILL
  validation failures
  And the tool list before and after is identical (no tool added or dropped)

- [ ] **Scenario: frontmatter-conformance test is added**
  Given no test asserts that every SKILL.md has `type: skill` and zero files use
  `allowed-tools:`
  When a new describe block is added to `tests/architecture-invariants.test.js`
  (or an appropriate existing test file)
  Then the test walks all SKILL.md files under `skills/`
  And asserts each contains `type: skill` in its frontmatter
  And asserts none contain `allowed-tools:` as a frontmatter key
  And `node --test tests/*.test.js` passes with `# fail 0`

- [ ] **Scenario: dependency-checker CRA references are grounded**
  Given `skills/security/dependency-checker/SKILL.md` references the CRA without
  Reg. (EU) 2024/2847, 11 Sep 2026 / 11 Dec 2027 dates, or NTIA minimum-elements
  When the implementer adds these citations, verified against an authoritative
  source at edit time, matching the precision of `sbom-cra-checker`
  Then the file contains "2024/2847", "11 Sep 2026" or "September 2026",
  "11 Dec 2027" or "December 2027", and "NTIA minimum elements"
  And the citation carries a `source:` URL or document reference (EUR-Lex or
  equivalent official source)
  And no other section of the skill is rewritten (surgical addition only;
  no-churn applies within the file)

- [ ] **Scenario: unit-test-runner gains type: skill frontmatter**
  Given `skills/testing/runners/unit-test-runner/SKILL.md` frontmatter is missing
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
  Given `skills/saas/posthog-analytics/SKILL.md` has no SQL BAD/SAFE code example
  When a BAD/SAFE pair is added covering a real PostHog anti-pattern
  (e.g. unbounded event queries without date filters causing full-table scans)
  Then the file contains a `BAD` SQL block and a `SAFE` SQL block
  And the example is substantive (demonstrates a real PostHog footgun, not a
  placeholder)

- [ ] **Scenario: sentry-errors gains a C++ example**
  Given `skills/saas/sentry-errors/SKILL.md` has no C++ code example
  When a C++ BAD/SAFE or annotated example is added covering a real Sentry SDK
  usage pattern (e.g. correct scope/breadcrumb usage vs. fire-and-forget without
  flush before process exit)
  Then the file contains a C++ code block marked with `cpp` or `c++`
  And the example demonstrates a non-trivial correctness concern

- [ ] **Scenario: react-native-bridge-checker reaches source-ref bar**
  Given `skills/mobile/react-native-bridge-checker/SKILL.md` has ~2 dated source
  references
  When the skill body is updated to add dated source references for bridge
  architecture, JSI, Hermes compatibility, turbo modules, and known bridge pitfalls
  Then the file contains at least 10 distinct source references, each with a URL
  or document title and a retrieval/publication date

- [ ] **Scenario: no file outside the enumerated target set is modified**
  Given the no-churn rule from the parent vision
  When the implementer reviews every file touched
  Then only files in the `files:` frontmatter list are modified
  And any file that was considered but deliberately not changed is recorded
  in the audit ledger with verdict SOLID and a note
  And the data-ml/feature-store-validator file is NOT modified (confirmed at
  category median; churn, not a confirmed defect — dropped from scope)

- [ ] **Scenario: all tests pass after each individual edit**
  Given CTOC's continuous-green policy
  When each targeted edit is made
  Then `node --test tests/*.test.js` passes with `# fail 0` after each edit
  (not only at the end of the batch)
  EXCEPT the model-bump commit, which is atomic: the agent files and both test
  file updates land in a single commit and are verified together

- [ ] **Scenario: count mismatches are recorded, not blocked on**
  Given grep may return counts different from the audit's estimates
  When a count mismatch is discovered
  Then the implementer records the actual count and the delta in the audit ledger
  And continues editing the actually-matching files within the enumerated set
  without blocking

- [ ] **Scenario: audit ledger covers downstream consumers**
  Given CU2–CU5 depend on the ledger for no-silent-skip enforcement
  When the ledger is written
  Then each CU2/CU3/CU4/CU5 implementation can read the ledger and confirm its
  target files appear with verdict THIN or DEFECTIVE (not SOLID) before editing
  And any file that appears in a downstream plan's scope but is absent from the
  ledger is treated as an error in that plan, not a free pass to edit

## Scope

### In Scope

- `.ctoc/audit/corpus-audit-2026-06-15.json`: per-file verdict artifact covering
  all files in the `files:` list (path, line_count, section_count, verdict).
- `agents/infrastructure/deployment-setup.md`: add v8 Tier-1 frontmatter fields
  (`tier: 1`, `reports_to: cto-chief`, `dispatch_protocol: v1`).
- `tests/architecture-invariants.test.js`: add `deployment-setup` to
  `TIER_1_AGENTS`; add frontmatter-conformance test block for SKILL.md files.
- All agents in the explicit `files:` list matching `model_optimized_for: opus-4-7`:
  update to `opus-4-8` in one atomic commit.
- `tests/agent-modernization.test.js`: update `opus-4-7` assertion to `opus-4-8`
  in the same atomic commit as the agent file updates.
- `tests/skill-loading.test.js`: update `opus-4-7` assertion to `opus-4-8` in the
  same atomic commit as the agent file updates.
- All skills matching `grep -rl "allowed-tools:" skills/` (expected ~5):
  normalize to `tools:`.
- `skills/security/dependency-checker/SKILL.md`: add Reg. (EU) 2024/2847,
  11 Sep 2026 reporting deadline, 11 Dec 2027 conformity deadline, NTIA
  minimum-elements — surgical addition, no section rewrites.
- `skills/testing/runners/unit-test-runner/SKILL.md`: add `type: skill` to
  frontmatter.
- All regulation-citing skills in compliance/, security/, legal/ that are in the
  `files:` list: add `last verified: 2026-06-15`.
- `skills/saas/posthog-analytics/SKILL.md`: add SQL BAD/SAFE example.
- `skills/saas/sentry-errors/SKILL.md`: add C++ example.
- `skills/mobile/react-native-bridge-checker/SKILL.md`: add dated source
  references to reach the 10+ bar.

### Out of Scope

- `skills/data-ml/feature-store-validator/SKILL.md` — DROPPED. Confirmed at the
  category median; editing it is churn, not a defect fix. Not in `files:`.
- Any agent or skill not in the explicit `files:` list — the no-churn rule;
  catch-all globs are prohibited. Adding files requires a plan amendment.
- Adding new SKILL.md sections, rewriting existing skill sections, or changing
  skill scope — surgical edits only; broader skill content upgrades are CU2–CU4.
- Tier-2 wrapper creation for unwrapped skills — that is CU5.
- Changes to hook logic, gate logic, or any file under `src/hooks/` or
  `src/lib/` — out of scope per the parent vision's self-improvement constraint.
- Reference library (`skills/languages/`, `skills/frameworks/`) content upgrades
  — those are CU2–CU4.

## Risks

### Technical Risks

- **Atomic model-bump commit sequence**: if the model bump on agent files is
  committed before `agent-modernization.test.js` and `skill-loading.test.js` are
  updated, those tests will red. The only safe commit sequence is: all agent files
  + both test files in one commit.
  - Likelihood: MEDIUM (easy to commit files individually by habit)
  - Impact: MEDIUM (CI reds on an intermediate commit; no data loss, but the
    broken state is pushed if not caught)
  - Mitigation: Stage all model-bump file changes together; run
    `node --test tests/*.test.js` on the staged set before committing.

- **TIER_1_AGENTS addition causes invariant test to fail on missing fields**: If
  `deployment-setup.md` is added to the array before its frontmatter is updated,
  the `tier: 1` and `reports_to: cto-chief` assertions will fail.
  - Likelihood: MEDIUM (ordering issue; easy to hit accidentally)
  - Impact: LOW (caught immediately by the test; no production effect)
  - Mitigation: Update `deployment-setup.md` frontmatter FIRST; run
    `node --test tests/architecture-invariants.test.js`; then add to
    `TIER_1_AGENTS`; run again to confirm.

- **`allowed-tools:` array-to-string reformatting corrupts tool lists**: YAML
  arrays (`[Read, Write]`) and strings (`"Read, Write"`) must produce identical
  tool sets after reformatting.
  - Likelihood: LOW (mechanical find-and-replace; other SKILL.md files are the
    template)
  - Impact: MEDIUM (a skill loaded with wrong tools silently restricts Claude)
  - Mitigation: For each normalized file, diff the tool list before and after to
    confirm no tool is added or dropped.

### Business Risks

- **CRA citation adds incorrect dates**: The EU enforcement dates must be verified
  against the actual regulation text at edit time. Reg. (EU) 2024/2847 establishes:
  11 Sep 2026 — reporting obligations take effect; 11 Dec 2027 — full conformity
  deadline. These are stable and publicly available at EUR-Lex.
  - Likelihood: LOW (dates are public and stable)
  - Impact: HIGH (a wrong compliance date in a regulatory skill is worse than no
    date — it gives false confidence)
  - Mitigation: Retrieve Reg. (EU) 2024/2847 from EUR-Lex at edit time; cite the
    source URL in the skill so the date is traceable. Also cite NTIA minimum-
    elements document (July 2021, "The Minimum Elements For a Software Bill of
    Materials").

### Dependency Risks

- **No dependencies**: CU1 has `depends_on: []`. All subsequent tiers depend on
  this stub completing cleanly.
  - Likelihood: N/A
  - Impact: HIGH if CU1 is blocked (CU2/CU3/CU4/CU5 all depend on CU1's clean
    test-passing base and the audit ledger)
  - Mitigation: Prioritize CU1 ahead of all other corpus stubs in the
    implementation queue (enforced by `order: 1` and `priority: HIGH`).

## Priority

**Priority: HIGH** (Score: 8/9)
- Dependency: HIGH (3) — all four sibling stubs (CU2–CU5) depend on CU1; it is
  the gate that makes the corpus buildable and provides the audit ledger.
- Business Impact: HIGH (3) — closes the architecture-invariants gap, eliminates
  regulatory citation risk, and normalizes structural inconsistencies that affect
  every subsequent implementation agent.
- Technical Risk: MEDIUM (2) — individual edits are low-complexity; the main risk
  (atomic model-bump ordering) is manageable with a two-step staging mitigation.

## Decisions Taken Under Ambiguity

- **`last verified:` date value** — use the audit date 2026-06-15 as the
  verification date for skills confirmed current at audit; if a regulatory fact
  is re-checked during implementation and a newer authoritative source exists,
  use that source's retrieval date instead. Rationale: the audit is the
  verification event for unchanged facts.
- **Scope of "regulation-bearing skills"** — limited to the
  compliance/, security/, and legal/ category skills that cite a named
  statute/regulation AND appear in the `files:` list. Skills with no regulatory
  citation do NOT receive a `last verified:` line (avoids churning solid
  non-regulatory files). Broader rollout, if desired, is a separate decision.
- **v8 4-tier frontmatter shape for deployment-setup** — mirror the exact field
  set used by an existing audited-SOLID Tier-1 agent (copy the canonical field
  list rather than inventing one) so the invariants test passes by construction.
- **Count mismatches (agent model counts / allowed-tools counts)** — if grep
  counts differ from the audit estimates, edit the actually-matching files within
  the enumerated `files:` list and note the discrepancy in the audit ledger. Files
  outside the enumerated list are NOT edited even if grep matches them.
- **feature-store-validator dropped** — confirmed at category median; not a
  confirmed defect. No-churn rule applies. Removed from `files:` and scope.
- **Atomic model bump** — `agent-modernization.test.js` asserts `opus-4-7` for
  three orchestrators; `skill-loading.test.js` asserts `opus-4-7` for all
  converted skills. Both test files must be updated in the same commit as the
  agent file updates. Splitting the commits would produce a transient CI failure.
- **Frontmatter-conformance test placement** — added to
  `tests/architecture-invariants.test.js` (already walks all SKILL.md files via
  `walkSkillFiles`; minimal duplication of infrastructure).
- **Audit ledger path** — `.ctoc/audit/corpus-audit-2026-06-15.json` (date-
  stamped so CU2/CU3/CU4/CU5 can reference it by an invariant path).
