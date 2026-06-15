---
title: "CU4 — Tier 2 long tail (remaining frameworks + thin quality-configs)"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 4
depends_on: [CU2-tier1-languages, CU3-tier1-frameworks]
status: refined
acceptance_criteria_count: 11
risk_level: LOW
files:
  - skills/frameworks/**/*.md
  - skills/languages/*.md
  - skills/quality-configs/**/*.md
---

# CU4 — Tier 2 long tail

## 1. ASSESS

### Problem Statement

After CU2 and CU3 address the highest-traffic language and framework guides, a
substantial long tail remains. The 2026-06-15 audit found 126 of 211 framework
files at the 5-section template floor; CU3 upgrades the highest-traffic subset,
leaving the remainder for this stub. The audit also found 12 thin quality-config
files from an early-alphabet authoring pass — the disparity is stark: php/strictest
is ~36 lines while ruby/strictest is ~534; csharp/legacy is ~27 lines while
kotlin/legacy is ~691. Additionally, any thin language guides beyond the 9
mainstream (CU2's scope) fall here. Each of these files is a trigger-loaded
correction surface at lower traffic than the Tier-1 files but still non-zero;
collectively they represent the completion pass for the audit's identified gaps.

### Current State

- **Remaining frameworks**: approximately 126 minus the CU3 file count template-
  floor framework files. The exact list is derived by diffing the audit's
  thin-file list against CU3's `files:` set at implementation time. Each is at
  the 5-section template floor per the audit.
- **Thin quality-configs**: 12 files confirmed by the audit, including php/strictest
  (~36 lines), csharp/legacy (~27 lines), and others in the early-alphabet range.
  Their well-developed siblings (ruby/strictest ~534, kotlin/legacy ~691) exist in
  the same config families and provide the structural template.
- **Remaining language guides**: any `skills/languages/*.md` files beyond the 9
  CU2 files that are at template floor per the audit.
- Audited-SOLID files in all three categories are NOT touched; the audit artifact
  is the authority for which files are in scope.

### Impact

Lower per-file impact than CU1–CU3 because each individual file is lower-traffic.
Aggregate impact is high: 100+ thin files collectively create a large audit-
confirmed gap in the corpus's correction surface. The quality-config gaps are the
most actionable: a php/strictest config guide at 36 lines cannot correct PHP strict-
mode pitfalls — it is functionally empty. Bringing these to sibling depth completes
the corpus audit's identified gaps and satisfies the vision's "no thin file
silently skipped" requirement (Success Criterion 5).

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage
order (Tier 1 mainstream before Tier 2 long tail); each batch is independently
verifiable." and "The audit artifact (per-file verdicts) is preserved so progress
is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer loads a trigger-loaded guide for a lower-
traffic framework or quality configuration, the guide must provide real correction
value — so the corpus's correction surface is complete, not just top-heavy with
Tier-1 upgrades.

- **Goal:** Complete the audit-identified upgrade list for all remaining thin files,
  with no silent skips.
- **Actor:** Claude Code (trigger-loaded at edit time); human reviewer (audits
  progress against the audit artifact).
- **Impact:** Every audit-confirmed thin file is either upgraded (with sourced,
  dated, framework-specific depth) or explicitly recorded as audited-SOLID and
  skipped — making the audit artifact the trackable ground truth for corpus
  completeness.
- **Deliverable:** Upgraded remaining framework guides, 12 upgraded quality-config
  files, any upgraded remaining language guides, and an updated audit artifact
  recording per-file verdicts.

### Success Metrics

- Every audit-confirmed thin framework file not in CU3 is upgraded past the
  5-section floor OR explicitly recorded as skipped with a reason.
- All 12 thin quality-configs reach sibling-family depth.
- The audit artifact (per-file verdicts) is updated to reflect each file's
  post-CU4 status.
- `node --test tests/*.test.js` passes with `# fail 0`.
- No audited-SOLID file is rewritten.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval): verifies per-file verdicts in the audit artifact.
- CU2/CU3 (upstream): CU4 adopts their depth standard; no feedback loop to them.

### Constraints

- **No-churn rule is critical here**: audited-SOLID frameworks/configs are NOT
  touched. The audit artifact is the authority for which files are in scope. Do
  not derive the in-scope list from line count alone at implementation time —
  use the audit's per-file verdicts.
- **Scope boundary with CU3**: every thin framework file CU3 already upgraded is
  excluded from CU4. Implementation diffs the audit's thin-file list against CU3's
  `files:` set.
- **Config-family templating rule**: use the rich sibling's STRUCTURE as the
  template, never its content verbatim. Config semantics differ per language; a
  rule correct for Ruby strictest mode may be wrong for PHP.
- **Batchable**: implement in self-contained batches (e.g. by framework category
  or config family) so each is independently verifiable.
- **Parallel-safe across distinct files**: different framework files and different
  config families can be implemented concurrently.
- **Depends on CU2/CU3**: sequenced after Tier-1 upgrades so CU4 implementors can
  use CU2/CU3 outputs as the depth standard.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a PHP file with strict-mode settings,
**I want** the trigger-loaded php/strictest quality-config guide to have the same
depth as ruby/strictest or kotlin/legacy,
**so that** it surfaces PHP-specific strict-mode pitfalls rather than being a
functionally empty placeholder.

**As a** human reviewer auditing corpus completeness,
**I want** the audit artifact updated with per-file verdicts for every file
considered in CU4,
**so that** I can confirm no thin file was silently skipped and the corpus is
fully upgraded per the 2026-06-15 audit's scope.

**As a** future corpus maintainer,
**I want** every skipped file to carry an explicit "audited-SOLID" label with
a rationale,
**so that** I know the skip was deliberate and not an oversight, and I can
reassess if the file's status changes.

### Acceptance Criteria

- [ ] **Scenario: every audit-confirmed thin framework file is upgraded or recorded**
  Given the audit identified ~126 minus CU3-scope files at template floor
  When CU4 implementation is complete
  Then every file on the audit's thin-list that is not in CU3's `files:` set
  is either upgraded past the 5-section floor with the same quality bar as CU3
  Or explicitly recorded in the audit artifact as SKIPPED with a rationale
  And zero files are silently omitted (no file appears in neither the upgraded
  list nor the skipped list)

- [ ] **Scenario: all 12 thin quality-configs reach sibling-family depth**
  Given php/strictest (~36 lines), csharp/legacy (~27 lines), and 10 other
  thin quality-config files identified by the audit
  When each is upgraded
  Then each file's section count and depth matches the richest sibling in its
  config family (e.g. php/strictest matches ruby/strictest's structure;
  csharp/legacy matches kotlin/legacy's structure)
  And each config value cited is correct for the target language — not copied
  verbatim from the sibling (which would be a correctness defect)
  And each file carries at least one source reference per major config block

- [ ] **Scenario: quality-config upgrades use structure-not-content templating**
  Given the rich sibling rule
  When a quality-config is upgraded using a rich sibling as a structural template
  Then the section headings and information architecture mirror the sibling
  And every rule, value, or setting in the upgraded file is specific to the target
  language's toolchain (e.g. php/strictest references PHP's `declare(strict_types=1)`,
  not Ruby's `frozen_string_literal`)
  And a reviewer diff between the upgraded file and the sibling shows no verbatim
  config value copied across language boundaries

- [ ] **Scenario: remaining thin language guides are upgraded**
  Given any `skills/languages/*.md` files beyond the 9 CU2 files that are at
  template floor per the audit
  When CU4 addresses them
  Then each is upgraded with the same quality bar as CU2 (concurrency footguns,
  error-handling idioms, security gotchas, testing conventions, performance traps,
  version-specific gotchas, dated sources)
  And if no remaining thin language guides exist (CU2 covered all thin ones),
  this criterion is recorded as N/A with that finding in the audit artifact

- [ ] **Scenario: audit artifact updated with per-file verdicts**
  Given the vision requires tracking progress per file (Success Criterion 5)
  When any file in scope is either upgraded or determined to be audited-SOLID
  Then the audit artifact (stored at a path defined at implementation start,
  e.g. `.ctoc/audit/corpus-audit-2026-06-15.md` or equivalent) is updated
  with the file's path, the verdict (UPGRADED / SOLID-SKIPPED), and the date
  And the artifact remains a complete record covering all files CU1–CU4 addressed

- [ ] **Scenario: upgraded frameworks meet the CU3 depth standard**
  Given CU3 set the depth standard for framework guides
  When any remaining thin framework guide is upgraded in CU4
  Then the guide contains at minimum the same section set as CU3 guides
  (Async/Concurrency Footguns, Error Handling, Security Gotchas, Testing,
  Performance Traps, Version-Specific, References)
  And each section contains framework-specific, non-generic content with a source
  And version-specific claims carry a retrieval date

- [ ] **Scenario: no audited-SOLID file is rewritten**
  Given the no-churn rule
  When the implementer uses the audit artifact to determine in-scope files
  Then no file marked audited-SOLID in the 2026-06-15 audit is modified
  And if a file's status is ambiguous (not clearly in the audit's thin or solid
  lists), the implementer treats it as SOLID, records the ambiguity in the audit
  artifact, and does not touch the file without explicit reviewer approval

- [ ] **Scenario: implementation proceeds in independently verifiable batches**
  Given the large file count (potentially 100+ files)
  When the implementer structures work
  Then each batch is scoped to a single framework category or config family
  (e.g. all of `skills/frameworks/testing/` as one batch, all php quality-configs
  as one batch)
  And `node --test tests/*.test.js` is run and passes after each batch, not only
  at the end
  And each batch is described in the plan's findings section with file count and
  verdict counts (upgraded / solid-skipped)

- [ ] **Scenario: .ctoc/skills.json trigger mappings remain valid**
  Given all modified files are indexed in skills.json
  When any file's frontmatter is extended
  Then the key/value pairs required by the skills.json trigger mapping are
  preserved verbatim in each modified file
  And `node --test tests/*.test.js` passes with `# fail 0` after each batch

- [ ] **Scenario: scope boundary with CU3 is respected**
  Given CU3 upgraded 13+ framework files
  When CU4 processes the remaining thin framework list
  Then no file already in CU3's `files:` set is re-processed or re-described
  in CU4's findings
  And the implementer diffs the audit's thin-list against CU3's file set before
  starting any upgrades to establish the exact CU4 scope

- [ ] **Scenario: remaining thin language guides beyond CU2 scope are handled**
  Given the language set boundary for CU2 is exactly 9 files
  When the implementer checks `skills/languages/` for additional thin files
  Then any language guide at template floor and not in CU2's `files:` set
  is upgraded with the CU2 depth standard
  Or recorded as audited-SOLID with rationale if the audit marked it so
  And the audit artifact is updated with these verdicts

## Scope

### In Scope

- All `skills/frameworks/**/*.md` files confirmed thin by the 2026-06-15 audit
  that are NOT already in CU3's `files:` set.
- All 12 thin `skills/quality-configs/**/*.md` files confirmed by the audit
  (php/strictest, csharp/legacy, and the other 10 audit-identified files).
- Any `skills/languages/*.md` files beyond the CU2 9-file set that are at
  template floor per the audit.
- Updating the audit artifact with per-file upgrade/solid-skipped verdicts.

### Out of Scope

- Files already upgraded by CU1, CU2, or CU3 — not re-processed.
- Audited-SOLID files in any category — no-churn rule; explicitly recorded as
  SOLID-SKIPPED in the audit artifact.
- SKILL.md files outside `skills/frameworks/`, `skills/languages/`, and
  `skills/quality-configs/` — those are not in scope for the reference library
  upgrade (other categories were found healthy in the audit).
- Tier-2 agent wrapper creation — that is CU5.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Verbatim content copying from rich sibling configs — correctness defect;
  only structural templating is permitted.

## Risks

### Technical Risks

- **Large file count increases risk of a missed frontmatter corruption**: 100+
  file edits creates more opportunity for an accidental frontmatter key removal
  than CU2/CU3.
  - Likelihood: MEDIUM (volume-proportional)
  - Impact: HIGH (broken skill trigger for any corrupted file)
  - Mitigation: Run `node --test tests/*.test.js` after each batch (not just at
    the end); use a consistent edit pattern (append sections below the closing
    frontmatter delimiter, never inside it).

- **Config-family templating produces subtle language-wrong rules**: if a
  reviewer misreads the structural templating rule and copies a Ruby config
  value into a PHP file, the result is a plausible-looking but incorrect guide.
  - Likelihood: LOW (acceptance criterion explicitly checks for language-correct
    values)
  - Impact: HIGH (a wrong config guide is worse than an empty one — gives false
    confidence to Claude during a lint/style correction)
  - Mitigation: Each config upgrade must be reviewed against the target language's
    official toolchain docs; the finding section records the source for each
    major config block.

### Business Risks

- **Volume obscures quality**: at 100+ files, it is easy to increase line counts
  without improving actual correction depth.
  - Likelihood: MEDIUM (same risk as any large-scale content operation)
  - Impact: MEDIUM (padded files pass line-count checks but fail correction-value
    checks)
  - Mitigation: Acceptance criteria require framework-specific, non-generic content
    with source references — not a line-count threshold. The audit artifact's
    per-file verdict must include a brief description of what was added (not just
    "upgraded").

### Dependency Risks

- **Blocked by CU2 and CU3**: CU4 depends on both CU2 and CU3 completing, both
  to use their depth standard and to know the exact CU3 file exclusion set.
  - Likelihood: LOW (CU2/CU3 are both HIGH priority and parallel-safe with each
    other; both complete before CU4 starts)
  - Impact: MEDIUM (delays CU4 start; does not invalidate scope)
  - Mitigation: CU4's `order: 4` and `depends_on: [CU2, CU3]` enforce sequencing
    in the implementation queue.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: LOW (1) — no other stub depends on CU4; it is a terminal node in
  the dependency graph.
- Business Impact: MEDIUM (2) — lower per-file traffic than CU1–CU3 but aggregate
  impact is high (100+ files); quality-config gaps are high-correctness-value.
- Technical Risk: MEDIUM (2) — large file count and config-family templating create
  moderate structural risk, both mitigated by per-batch test runs.

## Decisions Taken Under Ambiguity

- **Identifying the 12 thin quality-configs** — determined by the audit's
  per-file verdicts (line-count + content review), not a raw line threshold;
  php/strictest and csharp/legacy are confirmed examples. The implementation
  reads the audit artifact rather than re-deriving the list.
- **"Remaining frameworks" boundary** — every `frameworks/` file at template
  floor per the audit EXCEPT those already upgraded in CU3. Implementation
  diffs the audit's thin-list against CU3's file set.
- **Config-family templating** — copy the STRUCTURE of the rich sibling, author
  language-correct config values; never copy another language's rules verbatim
  (would be a correctness defect).
- **Batch size** — implement in self-contained batches (e.g. by framework
  category, by config family) so each is independently verifiable per Success
  Criterion 4; batch granularity is an implementation-step concern, not a
  scope question.
