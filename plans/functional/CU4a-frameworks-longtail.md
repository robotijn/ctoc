---
title: "CU4a — Frameworks long-tail reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 5
depends_on: [CU3-tier1-frameworks]
status: refined
acceptance_criteria_count: 9
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/*.md
  - skills/frameworks/**/*.md
---

# CU4a — Frameworks long-tail reference upgrade

## 1. ASSESS

### Problem Statement

After CU3 upgrades the 14 named high-traffic framework guides, a large long tail
remains: approximately 38+ thin ai-ml files (the entire `skills/frameworks/ai-ml/`
tree minus the 6 CU3-named ai-ml files: pytorch, tensorflow, langchain,
transformers, anthropic-sdk, openai-sdk) plus all other thin framework files
across all `skills/frameworks/` sub-directories not upgraded by CU3. The
2026-06-15 audit found 126 of 211 framework files at the <=5 `##` section template
floor; CU3 accounts for 14 of those, leaving approximately 112 remaining thin
files distributed across ai-ml, web, data, mobile, testing, and other framework
categories. Each is a trigger-loaded correction surface at lower traffic than the
Tier-1 files but collectively representing the completion pass for all thin
framework files. diffusers.md is a confirmed example of an ai-ml long-tail file
at template floor (5 `##` sections, ~70 lines).

### Current State

- **ai-ml long tail**: all `skills/frameworks/ai-ml/*.md` files NOT in CU3's named
  set (i.e. not pytorch, tensorflow, langchain, transformers, anthropic-sdk,
  openai-sdk). Confirmed examples at template floor: diffusers.md (~70 lines, 5
  `##` sections). The full list is derived at implementation time by reading all
  ai-ml files and cross-referencing against CU3's `files:` set.
- **Other thin frameworks**: all `skills/frameworks/**/*.md` files in any
  sub-directory confirmed thin by the 2026-06-15 audit and not already in CU3's
  `files:` set.
- The exact file count is established at implementation time by diffing the audit
  ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` against CU3's upgraded
  file list.
- Audited-SOLID files in all categories are NOT touched; the audit artifact is
  the authority.

### Impact

Lower per-file impact than CU3 because each individual file is lower-traffic.
Aggregate impact is high: 100+ thin files collectively create a large audit-
confirmed gap in the corpus's correction surface. Completing the frameworks
category satisfies the vision's "no thin file silently skipped" requirement
(Success Criterion 5) for the framework tier and provides CU4a's per-file
verdicts to the audit artifact, making corpus completeness trackable.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage
order (Tier 1 mainstream before Tier 2 long tail); each batch is independently
verifiable." and "The audit artifact (per-file verdicts) is preserved so progress
is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer loads a trigger-loaded guide for a lower-
traffic framework (e.g. diffusers, a testing framework, a data-processing library),
the guide must provide real correction value — so the corpus's correction surface
is complete for all frameworks, not just the Tier-1 named set.

- **Goal:** Complete the audit-identified upgrade list for all remaining thin
  framework files, with no silent skips.
- **Actor:** Claude Code (trigger-loaded at edit time); human reviewer (audits
  progress against the audit artifact).
- **Impact:** Every audit-confirmed thin framework file not in CU3's named set
  is either upgraded (with sourced, dated, framework-specific depth) or explicitly
  recorded as audited-SOLID and skipped — making the audit artifact the trackable
  ground truth for framework corpus completeness.
- **Deliverable:** Upgraded remaining framework reference guides and an updated
  audit artifact recording per-file verdicts for all CU4a-scope files.

### Success Metrics

- Every audit-confirmed thin framework file not in CU3's named set is upgraded
  past the <=5 `##` section floor OR explicitly recorded as SOLID-SKIPPED with
  a rationale.
- Every upgraded guide meets the same objective depth bar as CU3: each required
  section names at least one technology-specific identifier (version number, CWE
  identifier, or concrete API/function name); every version-specific or security
  claim carries a dated source from 2025-01-01 or later.
- The audit artifact is updated with per-file verdicts for all CU4a files.
- `node --test tests/*.test.js` passes with `# fail 0` after each batch.
- No audited-SOLID file is rewritten.

### Audit-Ledger Scoping

In-scope files are determined by diffing the audit ledger at
`.ctoc/audit/corpus-audit-2026-06-15.json` against CU3's upgraded file list (the
14 named files in CU3's `files:` frontmatter). The floor criterion is <=5 `##`
sections (not line count). A completeness check passes when every in-scope file
appears in the audit artifact as UPGRADED or SOLID-SKIPPED — no file may be
silently omitted.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval): verifies per-file verdicts in the audit artifact.
- CU3 (upstream): CU4a inherits CU3's named-set exclusion and depth standard
  via the audit ledger. CU4a must not re-process any file already recorded as
  UPGRADED by CU3.

### Constraints

- **No-churn rule is critical**: audited-SOLID frameworks are NOT touched. The
  audit artifact is the authority for which files are in scope. Do not derive the
  in-scope list from file existence alone — use the audit's per-file verdicts.
- **Scope boundary with CU3**: every thin framework file CU3 already upgraded is
  excluded from CU4a. Implementation diffs the audit's thin-file list against CU3's
  `files:` set to establish the exact CU4a scope.
- **Inherits depth standard from CU3**: the objective depth bar (technology-specific
  identifiers + dated sources from 2025-01-01 or later) applies to every file.
- **Single-framework exemption**: depth-within-framework is the bar; 7-language
  cross-coverage rule does not apply. Implementer must not add cross-language
  BAD/SAFE examples to these single-framework files.
- **Batchable**: implement in self-contained batches (e.g. by framework category)
  so each is independently verifiable.
- **Parallel-safe across distinct files**: different framework files and different
  framework categories can be implemented concurrently within the batch structure.
- **Depends on CU3**: sequenced after CU3 so CU4a can use CU3 outputs and the
  audit ledger to establish its exact scope. CU4b and CU4c are independent of
  CU3 (different files) and may run concurrently with CU4a if the implementation
  queue supports it.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a Stable Diffusion / Diffusers pipeline,
**I want** the trigger-loaded diffusers.md guide to surface SDXL version coupling,
VRAM optimization patterns, and scheduler trade-offs with dated sources,
**so that** I can flag memory-exhaustion and quality-tradeoff footguns rather than
producing code that silently degrades on the target hardware.

**As a** human reviewer auditing framework corpus completeness,
**I want** the audit artifact updated with per-file verdicts for every CU4a-scope
file,
**so that** I can confirm no thin framework file was silently skipped and the
corpus is fully upgraded for all framework guides.

**As a** future corpus maintainer,
**I want** every skipped file to carry an explicit SOLID-SKIPPED label with
a rationale in the audit artifact,
**so that** I know the skip was deliberate and can reassess if the file's status
changes.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any guide section that does not name at least one technology-specific identifier
(version number, CWE identifier, or concrete API/function name), and rejects any
version-specific or security claim that does not carry an inline dated source from
2025-01-01 or later. This gate is identical to the CU3 depth standard and is
the checkable reviewer criterion.

- [ ] **Scenario: scope is established by diffing audit ledger against CU3 named set**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` lists
  thin framework files (<=5 `##` sections) and CU3's `files:` set lists 14 named
  files already upgraded
  When the implementer establishes CU4a scope at implementation start
  Then the CU4a file list equals: (audit thin-file list for skills/frameworks/)
  MINUS (CU3 named files already marked UPGRADED in the audit artifact)
  And this diff is recorded in the plan's findings section before any upgrades begin
  And no file in CU3's named set is re-processed or re-described in CU4a findings

- [ ] **Scenario: every audit-confirmed thin framework file is upgraded or recorded**
  Given the CU4a scope established by the diff above
  When CU4a implementation is complete
  Then every file on the CU4a scope list is either upgraded past the <=5 `##`
  section floor with the same quality bar as CU3
  Or explicitly recorded in the audit artifact as SOLID-SKIPPED with a rationale
  And zero files are silently omitted (no file appears in neither the upgraded
  list nor the skipped list)

- [ ] **Scenario: upgraded frameworks meet the CU3 depth standard**
  Given CU3 set the depth standard for framework guides
  When any remaining thin framework guide is upgraded in CU4a
  Then the guide contains more than 5 distinct `##` sections including at minimum
  the same section set as CU3 guides (Async/Concurrency Footguns, Error Handling,
  Security Gotchas, Testing, Performance Traps, Version-Specific, References)
  And each section names at least one technology-specific identifier (version
  number, CWE ID, or concrete API/function name)
  And every version-specific or security claim carries a dated source from
  2025-01-01 or later

- [ ] **Scenario: ai-ml long-tail files cover their category-specific footguns**
  Given the ai-ml long-tail files (all ai-ml/*.md not in CU3's named set)
  are upgraded
  When each ai-ml long-tail file is processed
  Then the guide addresses the framework's primary footguns specific to that
  library (e.g. diffusers.md: VRAM exhaustion footguns, scheduler selection,
  SDXL version coupling; other ai-ml files: their equivalent primary footguns)
  And each upgraded file names the library's current version and relevant
  security concerns (e.g. model loading pickle risks where applicable) with
  dated sources of 2025-01-01 or later

- [ ] **Scenario: no audited-SOLID file is rewritten**
  Given the no-churn rule
  When the implementer uses the audit artifact to determine in-scope files
  Then no file marked audited-SOLID in the 2026-06-15 audit is modified
  And if a file's status is ambiguous (not clearly in the audit's thin or solid
  lists), the implementer treats it as SOLID, records the ambiguity in the audit
  artifact, and does not touch the file without explicit reviewer approval

- [ ] **Scenario: implementation proceeds in independently verifiable batches**
  Given the large file count (approximately 112 files)
  When the implementer structures work
  Then each batch is scoped to a single framework category (e.g. all of
  skills/frameworks/testing/ as one batch, all ai-ml long-tail as one batch)
  And `node --test tests/*.test.js` is run and passes after each batch
  And each batch is described in the plan's findings section with file count and
  verdict counts (UPGRADED / SOLID-SKIPPED)

- [ ] **Scenario: skills.json trigger mappings remain valid**
  Given all modified files are indexed in skills.json
  When any file's frontmatter is extended
  Then the key/value pairs required by the skills.json trigger mapping are
  preserved verbatim in each modified file
  And `node --test tests/*.test.js` passes with `# fail 0` after each batch

- [ ] **Scenario: audit artifact updated with per-file verdicts**
  Given the vision requires tracking progress per file (Success Criterion 5)
  When any CU4a-scope file is either upgraded or determined to be audited-SOLID
  Then the audit artifact at `.ctoc/audit/corpus-audit-2026-06-15.json` is
  updated with the file's path, the verdict (UPGRADED / SOLID-SKIPPED), and
  the date
  And the artifact remains a complete record covering all files CU1-CU4 addressed

- [ ] **Scenario: completeness check passes**
  Given the in-scope list established by the audit-ledger diff
  When all CU4a-scope files have been processed
  Then a completeness check confirms every in-scope file appears in either the
  upgraded list or the SOLID-SKIPPED list in the audit artifact
  And the diff between the in-scope list and the union of (upgraded + skipped)
  is empty — no silent omissions

## Scope

### In Scope

- All `skills/frameworks/ai-ml/*.md` files confirmed thin (<=5 `##` sections)
  by the 2026-06-15 audit that are NOT in CU3's named set (not pytorch, tensorflow,
  langchain, transformers, anthropic-sdk, openai-sdk). Confirmed example: diffusers.md.
- All `skills/frameworks/**/*.md` files in any sub-directory confirmed thin by the
  2026-06-15 audit and not already upgraded by CU3.
- Updating the audit artifact with per-file UPGRADED / SOLID-SKIPPED verdicts.
- Running `node --test tests/*.test.js` after each batch.

### Out of Scope

- Files already upgraded by CU1, CU2, or CU3 — not re-processed.
- Audited-SOLID files in any category — no-churn rule; recorded as SOLID-SKIPPED.
- Language guides in `skills/languages/` — those are CU2 (mainstream) and CU4c
  (non-mainstream).
- Quality-config files — those are CU4b.
- SKILL.md files outside the reference library categories.
- The 7-language BAD/SAFE cross-coverage rule — single-framework guides are exempt;
  implementer must not add cross-language examples.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Verbatim content copying from other framework guides (each guide must be specific
  to its target framework).

## Risks

### Technical Risks

- **Large file count increases risk of a missed frontmatter corruption**: 100+
  file edits creates more opportunity for an accidental frontmatter key removal.
  - Likelihood: MEDIUM (volume-proportional)
  - Impact: HIGH (broken skill trigger for any corrupted file)
  - Mitigation: Run `node --test tests/*.test.js` after each batch (not just at
    the end); use a consistent edit pattern (append sections below the closing
    frontmatter delimiter, never inside it).

- **ai-ml long-tail files may include libraries with fast-moving APIs**: some
  ai-ml libraries (e.g. diffusers) release frequently; version-specific claims
  may become stale quickly.
  - Likelihood: HIGH (ai-ml ecosystem moves rapidly)
  - Impact: MEDIUM (misleading guidance at the next trigger load)
  - Mitigation: Every version-specific claim names the library version (e.g.
    "diffusers 0.32.x") alongside a dated source; reviewer flags claims lacking
    both.

### Business Risks

- **Volume obscures quality**: at 100+ files, it is easy to increase section
  counts without improving actual correction depth.
  - Likelihood: MEDIUM (same risk as any large-scale content operation)
  - Impact: MEDIUM (padded files pass section-count checks but fail the objective
    depth gate)
  - Mitigation: The objective depth gate (technology-specific identifiers + dated
    sources) is the binary reviewer check — not a line-count threshold. The audit
    artifact's per-file verdict must include a brief description of what was added.

### Dependency Risks

- **Blocked by CU3**: CU4a depends on CU3 completing to know the exact named-set
  exclusion and to use CU3's depth standard as confirmed by the audit artifact.
  - Likelihood: LOW (CU3 is HIGH priority and completes before CU4a starts)
  - Impact: MEDIUM (delays CU4a start; does not invalidate scope)
  - Mitigation: CU4a's `order: 5` and `depends_on: [CU3-tier1-frameworks]`
    enforce sequencing in the implementation queue.

- **CU4b and CU4c are independent**: CU4b (quality-configs) and CU4c
  (non-mainstream languages) touch different files and do not require CU3 to
  complete. They may run concurrently with CU4a and with each other if the
  implementation queue supports it. This is an explicit design choice to avoid
  artificial serialization.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: LOW (1) — no other stub depends on CU4a; it is a terminal node
  in the frameworks dependency chain.
- Business Impact: MEDIUM (2) — lower per-file traffic than CU3 but aggregate
  impact is high (100+ files); ai-ml long-tail files are the highest value within
  CU4a.
- Technical Risk: MEDIUM (2) — large file count and ai-ml API churn create
  moderate structural risk, both mitigated by per-batch test runs and the
  objective depth gate.

## Decisions Taken Under Ambiguity

- **Scope definition via audit-ledger diff** — in-scope list is derived by
  diffing the audit ledger against CU3's named set at implementation time, not
  by re-running an audit. This prevents scope drift and ensures no-churn rule
  is honored.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Objective depth bar** — identical to CU3: every required section must name
  at least one technology-specific identifier (version number, CWE identifier,
  or concrete API/function name), AND every version-specific or security claim
  must carry an inline dated source from 2025-01-01 or later. A reviewer rejects
  against this criterion.
- **CU4b and CU4c independence** — quality-configs (CU4b) and non-mainstream
  languages (CU4c) are independent of CU3 (different files) and need only the
  audit ledger. They are not serialized behind CU3 or CU4a; the depends_on chain
  for CU4b and CU4c points to CU1 only (via the audit ledger dependency).
- **Single-framework exemption** — depth-within-framework is the bar; 7-language
  BAD/SAFE cross-coverage rule does not apply. Implementer must not add
  cross-language examples.
- **Batch size** — implement in self-contained batches (by framework category)
  so each is independently verifiable per Success Criterion 4; batch granularity
  is an implementation-step concern, not a scope question.
