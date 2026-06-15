---
title: "CU4b — Thin quality-configs reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 5
depends_on: [CU1-tier0-quick-wins]
status: refined
acceptance_criteria_count: 9
risk_level: MEDIUM
files:
  - skills/quality-configs/**/*.md
---

# CU4b — Thin quality-configs reference upgrade

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit identified 12 quality-config files that are functionally
empty compared to their rich sibling configs. The disparity is stark and directly
measured: php/strictest is ~36 lines (4 `##` sections) while ruby/strictest is
~534 lines (many `##` sections); csharp/legacy is ~27 lines (3 `##` sections)
while kotlin/legacy is ~691 lines. A php/strictest config guide at 36 lines cannot
correct PHP strict-mode pitfalls — it has a PHPStan config snippet and a coverage
table, nothing more. A csharp/legacy guide at 27 lines is missing all of: nullable
annotation strategy, .NET analyzer configuration, coverage enforcement, CI
integration, and the pattern for gradual strict-mode adoption that is the entire
point of a legacy-mode config. These guides are trigger-loaded when Claude edits
a project's quality config files; a functionally empty guide provides no
correction surface at exactly the moment correction is most needed.

The confirmed thin set from the audit (all with <=5 `##` sections):
- `skills/quality-configs/csharp/legacy.md` (~27 lines, 3 `##` sections)
- `skills/quality-configs/csharp/strictest.md` (~50 lines, ~6 `##` sections —
  borderline; implementation confirms via audit artifact)
- `skills/quality-configs/php/strictest.md` (~36 lines, 4 `##` sections)
- `skills/quality-configs/php/legacy.md` (~32 lines, 4 `##` sections)
- Additional audit-confirmed thin files up to the audit's count of 12.
  Exact list is confirmed at implementation time from the audit artifact.

### Current State

From the 2026-06-15 audit:
- **csharp/legacy.md** (~27 lines): 3 `##` sections — Mode, Project File,
  Coverage Requirements. Missing: EditorConfig configuration, analyzer selection
  rationale, gradual adoption pattern, CI integration, .NET 9 toolchain specifics.
- **php/strictest.md** (~36 lines): 4 `##` sections — Mode, PHPStan Config,
  Coverage Requirements, Complexity Limits. Missing: PHP-specific strict_types
  declaration, PHPCS configuration, CI integration, security scanning
  (psalm/rector), testing conventions.
- **php/legacy.md** (~32 lines): 4 `##` sections — similar gaps.
- Other audit-confirmed thin files: same structural pattern — a config snippet
  and a coverage table, nothing else.
- Rich siblings that exist and are SOLID (to use as structural templates only):
  ruby/strictest.md (~534 lines), kotlin/legacy.md (~691 lines),
  c/strictest.md (~572 lines). When the thin file's own config family has no
  rich sibling (e.g. all three csharp configs are thin), use the structurally
  richest cross-family config (kotlin/strictest or c/strictest) as the
  structural template — never its config values verbatim.

### Impact

Quality-config guides are loaded when Claude edits `.editorconfig`, `phpstan.neon`,
`.csproj`, or equivalent config files. A thin guide at that moment leaves Claude
without the correction context needed to catch: misconfigured nullable enforcement,
wrong PHPStan level for the project's legacy state, missing analyzer rules, or
absent CI integration. Bringing all 12 thin configs to sibling depth completes
the quality-configs category and satisfies the vision's no-silent-skip requirement.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage
order; each batch is independently verifiable." and "The audit artifact is
preserved so progress is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer configures or edits a quality-config file
for a language CTOC manages, the trigger-loaded quality-config guide must surface
the same depth of toolchain-specific correctness information as the richest sibling
in the config family — so Claude's corrections are grounded in real config
semantics, not a coverage-table placeholder.

- **Goal:** Bring all 12 thin quality-config files to sibling-family depth,
  completing the quality-configs category of the corpus.
- **Actor:** Claude Code (trigger-loaded at config edit time); human reviewer
  (verifies config-value correctness and structural completeness).
- **Impact:** Every audit-confirmed thin quality-config is upgraded to match its
  richest sibling's structural depth, using language-correct config values so
  the correction surface is substantive and accurate.
- **Deliverable:** 12 upgraded quality-config reference files, an updated audit
  artifact with per-file verdicts, and a structural template reference noting
  which rich sibling was used for each upgrade.

### Success Metrics

- All 12 audit-confirmed thin quality-config files are upgraded to exceed the
  <=5 `##` section floor.
- Every upgraded file's section count and depth matches the richest sibling in
  its config family (or the cross-family structural template if no rich sibling
  exists in the same family).
- Every required section names at least one technology-specific identifier —
  a version number (e.g. "PHPStan level 9", ".NET 9", "PHP 8.3"), a concrete
  tool name (e.g. "PHPStan", "psalm", "dotnet-format"), or a specific config
  key (e.g. "declare(strict_types=1)", "TreatWarningsAsErrors") — generic
  description without a concrete identifier is a failing criterion.
- Every version-specific or security claim carries a dated source from
  2025-01-01 or later.
- No config value from one language's toolchain appears in another language's
  guide (correctness defect: language-wrong values are worse than empty).
- `node --test tests/*.test.js` passes with `# fail 0` after all edits.
- The audit artifact is updated with per-file verdicts for all 12 files.

### Audit-Ledger Scoping

In-scope files are the 12 thin quality-config files confirmed by the 2026-06-15
audit at `.ctoc/audit/corpus-audit-2026-06-15.json`. The floor criterion is <=5
`##` sections (not line count). Implementation confirms the exact list from the
audit artifact at implementation start. A completeness check passes when every
in-scope file appears in the audit artifact as UPGRADED or SOLID-SKIPPED — no
file may be silently omitted.

### Stakeholders

- Claude Code (automated consumer): benefits at quality-config edit time.
- Human reviewer (gate approval): spot-checks config-value correctness and
  structural completeness. The reviewer's primary risk is language-wrong config
  values (a Ruby config value in a PHP file is a correctness defect).
- CU2/CU3 (upstream): CU4b is independent of CU3 (different files). CU4b
  depends only on CU1 (for a clean test baseline) and the audit ledger.

### Constraints

- **Config-family structural templating rule**: use the rich sibling's STRUCTURE
  as the template, never its config values verbatim. Config semantics differ per
  language; a rule correct for Ruby strictest mode may be wrong for PHP. When the
  thin file's own config family has no rich sibling (e.g. all csharp configs are
  thin), use the cross-family richest config (kotlin/strictest ~866 lines,
  c/strictest ~572 lines) as the structural template.
- **No-churn rule**: audited-SOLID quality-config files are NOT touched. The
  audit artifact is the authority.
- **Objective depth bar**: every required section must name at least one
  technology-specific identifier; every version-specific or security claim must
  carry a dated source from 2025-01-01 or later. Reviewer rejects against this.
- **Single-config exemption**: depth-within-config-language is the bar; the
  7-language BAD/SAFE cross-coverage rule does not apply to config files.
- **Independent of CU3**: CU4b may run concurrently with CU3 and CU4a. It only
  requires CU1 (clean test baseline) and the audit ledger (which CU1 produces).
  Do not serialize CU4b behind CU3 or CU4a.
- **No new files**: all work is edits to existing quality-config files.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a PHP project's PHPStan configuration,
**I want** the trigger-loaded php/strictest quality-config guide to have the same
structural depth as ruby/strictest,
**so that** it surfaces PHP-specific strict-mode pitfalls (declare(strict_types=1),
PHPStan level 9 edge cases, psalm integration) rather than being a PHPStan snippet
with a coverage table.

**As a** human reviewer auditing CU4b implementation,
**I want** a diff between any upgraded config file and its structural template
sibling to show no verbatim config value copied across language boundaries,
**so that** I can confirm the upgraded file contains language-correct toolchain
values and is not a copy-paste correctness defect.

**As a** future corpus maintainer,
**I want** every skipped config file to carry an explicit SOLID-SKIPPED label
with a rationale in the audit artifact,
**so that** I know the skip was deliberate and can reassess if the file's status
changes.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any upgraded config file section that does not name at least one technology-
specific identifier (version number, tool name, or specific config key), and
rejects any version-specific or toolchain claim that does not carry a dated source
from 2025-01-01 or later.

- [ ] **Scenario: scope is confirmed from the audit ledger at implementation start**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` lists
  the 12 thin quality-config files (<=5 `##` sections)
  When the implementer establishes CU4b scope at implementation start
  Then the exact file list is read from the audit artifact (not re-derived from
  file contents or line counts)
  And the list is recorded in the plan's findings section before any upgrades begin

- [ ] **Scenario: all 12 thin quality-configs reach sibling-family structural depth**
  Given the 12 audit-confirmed thin quality-config files including csharp/legacy.md
  (~27 lines, 3 `##` sections) and php/strictest.md (~36 lines, 4 `##` sections)
  When each is upgraded
  Then each file's section count exceeds 5 `##` sections and the information
  architecture mirrors the richest sibling in its config family (e.g. php configs
  mirror ruby/strictest's structure; csharp configs mirror kotlin/strictest's
  or c/strictest's structure when no rich csharp sibling exists)
  And each file contains at minimum the section set present in its structural
  template sibling (e.g. tool config blocks, CI integration, coverage thresholds,
  complexity limits, install commands, testing framework integration)

- [ ] **Scenario: config values are language-correct and not cross-language copies**
  Given the structural templating rule
  When a quality-config is upgraded using a rich sibling as a structural template
  Then the section headings and information architecture mirror the sibling
  And every rule, value, or setting in the upgraded file is specific to the target
  language's toolchain (e.g. php/strictest references PHP's declare(strict_types=1)
  and PHPStan level 9, not Ruby's frozen_string_literal or RuboCop config)
  And a reviewer diff between the upgraded file and its structural template sibling
  shows no verbatim config value copied across language boundaries (a cross-language
  config value is a critical correctness defect)

- [ ] **Scenario: csharp configs use cross-family structural template correctly**
  Given all csharp quality-config variants (legacy, strictest) are thin and no
  rich csharp sibling exists in the same config family
  When csharp configs are upgraded
  Then the structural template is the cross-family richest config (kotlin/strictest
  ~866 lines or c/strictest ~572 lines — whichever is chosen is recorded in
  the findings section)
  And csharp/legacy.md addresses at minimum: nullable reference types (opt-in per
  file with `Nullable: warnings`), .NET analyzer selection (EnableNETAnalyzers,
  AnalysisLevel), gradual adoption pattern, coverage enforcement (50% floor),
  and CI integration for .NET 9
  And csharp/strictest.md addresses at minimum: full nullable enforcement
  (TreatWarningsAsErrors: true, Nullable: enable), .NET 9 EditorConfig analyzer
  severity rules, strict complexity limits, and CI integration
  And all .NET 9-specific claims name ".NET 9" or a specific C# version and carry
  a dated source from 2025-01-01 or later

- [ ] **Scenario: php configs address PHP-specific strict-mode toolchain**
  Given php/strictest.md (~36 lines) and php/legacy.md (~32 lines) are at
  template floor
  When each is upgraded
  Then php/strictest.md addresses at minimum: declare(strict_types=1) enforcement
  pattern, PHPStan level 9 configuration including treatPhpDocTypesAsCertain,
  psalm integration for additional type coverage, PHP_CodeSniffer (PHPCS) config
  for PSR-12, complexity limits, CI integration, and PHP 8.3+ specific checks
  And php/legacy.md addresses at minimum: PHPStan level 5 configuration with
  baseline generation, gradual strict-type adoption strategy, coverage floor at
  50%, and CI integration for incremental adoption
  And all PHP version references name "PHP 8.3" or equivalent and carry dated
  sources from 2025-01-01 or later

- [ ] **Scenario: every upgraded config section names a technology-specific identifier**
  Given the objective depth bar
  When any section is added to any upgraded quality-config file
  Then the section names at least one technology-specific identifier: a version
  number (e.g. "PHP 8.3", ".NET 9", "PHPStan level 9"), a tool name (e.g.
  "psalm", "dotnet-format", "PHPUnit"), or a specific config key (e.g.
  "declare(strict_types=1)", "TreatWarningsAsErrors", "AnalysisLevel")
  And a reviewer can reject any section lacking such an identifier

- [ ] **Scenario: all version-specific or toolchain claims carry dated sources**
  Given the source recency requirement
  When any version-specific or toolchain-specific claim is added to any upgraded
  config file
  Then the claim carries a source reference with a retrieval date of 2025-01-01
  or later (URL, official documentation title + section, or tool changelog
  reference)
  And a reviewer can reject any version-specific claim lacking a dated source

- [ ] **Scenario: no audited-SOLID quality-config is rewritten**
  Given the no-churn rule
  When the implementer uses the audit artifact to determine in-scope files
  Then no file marked audited-SOLID in the 2026-06-15 audit is modified
  And if a file's status is ambiguous, the implementer treats it as SOLID, records
  the ambiguity in the audit artifact, and does not touch the file without explicit
  reviewer approval

- [ ] **Scenario: audit artifact updated and completeness check passes**
  Given the vision requires tracking progress per file
  When all 12 CU4b-scope files have been processed
  Then the audit artifact at `.ctoc/audit/corpus-audit-2026-06-15.json` is
  updated with each file's path, verdict (UPGRADED / SOLID-SKIPPED), the
  structural template used (for UPGRADED files), and the date
  And a completeness check confirms the diff between the in-scope list and the
  union of (upgraded + skipped) is empty — no silent omissions
  And `node --test tests/*.test.js` passes with `# fail 0`

## Scope

### In Scope

- All 12 `skills/quality-configs/**/*.md` files confirmed thin (<=5 `##` sections)
  by the 2026-06-15 audit. Confirmed examples: csharp/legacy.md, csharp/strictest.md
  (borderline — confirm from audit), php/strictest.md, php/legacy.md, and
  additional audit-identified thin files up to the count of 12.
- Adding sections to match the richest sibling's structural depth, using
  language-correct config values for the target language's toolchain.
- Recording the structural template sibling used for each upgrade in the audit
  artifact findings.
- Updating the audit artifact with per-file UPGRADED / SOLID-SKIPPED verdicts.

### Out of Scope

- Files already upgraded by CU1, CU2, or CU3 — not re-processed.
- Audited-SOLID quality-config files — no-churn rule; recorded as SOLID-SKIPPED.
  Examples of confirmed SOLID files: ruby/strictest.md (~534 lines), kotlin/legacy.md
  (~691 lines), c/strictest.md (~572 lines).
- Language guides in `skills/languages/` — CU2 (mainstream) or CU4c (non-mainstream).
- Framework guides in `skills/frameworks/` — CU3 (named high-traffic) or CU4a
  (long tail).
- SKILL.md files in other categories.
- The 7-language BAD/SAFE cross-coverage rule — config files are exempt.
- Verbatim config value copying across language boundaries — correctness defect;
  only structural templating is permitted.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.

## Risks

### Technical Risks

- **Config-family templating produces subtle language-wrong values**: if the
  implementer misreads the structural templating rule and copies a Ruby or Kotlin
  config value into a PHP or C# file, the result is a plausible-looking but
  incorrect guide.
  - Likelihood: LOW (acceptance criterion explicitly checks for language-correct
    values via the cross-language diff check)
  - Impact: HIGH (a wrong config guide is worse than an empty one — gives false
    confidence to Claude during a lint/style correction)
  - Mitigation: Each config upgrade must cite the target language's official
    toolchain docs; the findings section records the source for each major config
    block; the reviewer performs a cross-language diff check as part of Gate 3.

- **All csharp config variants are thin — no rich same-family sibling**: the
  structural template must come from a different config family (kotlin/strictest
  or c/strictest), which requires explicit documentation to avoid confusion.
  - Likelihood: HIGH (this is the confirmed state from the audit)
  - Impact: LOW (mitigated by explicitly recording the cross-family template used)
  - Mitigation: Record in the findings section which cross-family template was used
    for each csharp config upgrade; reviewer confirms the template choice is
    documented.

### Business Risks

- **Section-count inflation without depth**: adding empty sections to exceed
  the 5-section floor without actionable toolchain content.
  - Likelihood: LOW (the objective depth gate requires technology-specific
    identifiers in each section)
  - Impact: MEDIUM (an inflated but still-useless guide wastes review time)
  - Mitigation: The objective depth gate (technology-specific identifier + dated
    source) is the binary reviewer check. Sections without a concrete identifier
    are rejected.

### Dependency Risks

- **CU4b is independent of CU3**: quality-config files are a different file set
  from framework files. CU4b requires only CU1 (clean test baseline) and the
  audit ledger. It does not need CU3 to complete first and must not be artificially
  serialized behind CU3 or CU4a.
  - Likelihood: N/A (this is a design decision, not a risk)
  - Mitigation: `depends_on: [CU1-tier0-quick-wins]` reflects the true dependency.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: LOW (1) — no other stub depends on CU4b; it is a terminal node.
- Business Impact: MEDIUM (2) — quality-config gaps are high-correctness-value
  (a wrong config guide directly misdirects Claude at config-edit time); only 12
  files but each has high per-file impact.
- Technical Risk: MEDIUM (2) — cross-family templating and language-wrong value
  risk are moderate; mitigated by the cross-language diff check and objective
  depth gate.

## Decisions Taken Under Ambiguity

- **CU4b is independent of CU3** — quality-config files (skills/quality-configs/)
  are a different file set from framework files (skills/frameworks/). CU4b needs
  only the audit ledger, which CU1 produces. Serializing CU4b behind CU3 would
  be artificial and would delay independently shippable work. This is a locked
  decision from the adversarial review.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Cross-family template for csharp**: when a config family has no rich sibling
  (all csharp variants are thin), the structural template comes from the
  cross-family richest config. kotlin/strictest (~866 lines) or c/strictest
  (~572 lines) are the candidates; the implementer records which was chosen.
- **Objective depth bar** — every required section must name at least one
  technology-specific identifier (version number, tool name, or specific config
  key), AND every version-specific or toolchain claim must carry an inline dated
  source from 2025-01-01 or later. A reviewer rejects against this criterion.
- **Structural templating rule** — copy the STRUCTURE (section headings,
  information architecture) of the rich sibling; author language-correct config
  values for the target language. Never copy another language's config values
  verbatim (correctness defect).
- **Single-config exemption** — depth-within-config-language is the bar; 7-language
  BAD/SAFE cross-coverage rule does not apply to config files.
