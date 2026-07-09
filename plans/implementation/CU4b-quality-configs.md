---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

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
is_slice_index: true
# This is the INDEX for the CU4b decomposition (SIP1). Per-file `files:` coverage
# lives on the SLICE plans (s1–s5), NOT here — the index is not itself executed
# through the Iron Loop (no `iron_loop:` key). See "## Slices" below. The module
# `files:` glob (`skills/quality-configs/**/*.md`) that lived here in the functional
# stage is intentionally removed and re-expressed as the disjoint per-slice `files:`
# lists so the no-churn / coverage-aware enforcement resolves against real slices.
---

# CU4b — Thin quality-configs reference upgrade

> **This plan is a SLICE INDEX** (`is_slice_index: true`). Per SIP1, the
> implementation-planner decomposed CU4b's thin quality-config upgrades into 5
> cohesive slices, each a COMPLETE small implementation plan with its own focused
> `files:`, its own `## Implementation Details`, canonical Iron Loop Steps 8–16,
> and a real-file content-contract test (zero doubles). Slices are grouped by
> **language/toolchain** for research-pass coherence — one research+write pass per
> language produces guides whose linter/formatter/coverage-tool families overlap —
> and are **disjoint by file**, so `depends_on: none` between them (parallel-safe).
> Gate 2 & Gate 3 batch per parent via `approveSubplans('CU4b-quality-configs', …)`
> — ONE human decision crosses every sibling; each sibling inherits THIS parent's
> Gate-1 `approved_by: human` marker (same convention as CU1/CU2/CU3). CU4b itself
> `depends_on: [CU1-tier0-quick-wins]`; no slice depends on another slice except
> the final completeness slice, which runs the whole-scope check LAST.
>
> Each slice bakes in the four HARD RULES:
> 1. **NO STUBS** — every upgraded config guide is a SUBSTANTIVE correction surface
>    (real rules, real rationale, real tooling versions) exceeding the `> 5` `##`
>    section floor; no empty section, no "TODO", no placeholder.
> 2. **NO FABRICATED numbers / versions / rules** — every linter/tool version, rule
>    id, default, and claim is WEB-VERIFIED against the official tool docs at edit
>    time, with an inline dated http source (retrieval/publication date ≥ 2025-01-01).
>    If a fact is unverifiable at edit time, it is OMITTED — never invented.
> 3. **ZERO TEST DOUBLES** — each slice's content-contract test reads the REAL config
>    guide files off disk (`fs.readFileSync`) and asserts substance (sections past
>    the real floor, language-specific identifiers present, ≥ 1 dated http source,
>    no cross-language config value). No mocks, no fixtures, no fakes.
> 4. **Config-family structural templating (not value copying)** — copy the STRUCTURE
>    (section headings, information architecture) of a rich sibling; author
>    language-correct config VALUES for the target toolchain. Never copy another
>    language's config values verbatim — a cross-language config value is a critical
>    correctness defect (worse than an empty guide). The 7-language BAD/SAFE
>    cross-coverage rule is EXEMPT for config files (single-config-language bar).

## Scope confirmation (read-fresh, 2026-07-09)

The parent functional plan estimated **12** thin files from the 2026-06-15 audit.
The audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` is CU1's artifact and
carries **no** quality-config records (it covers the CU1 agent/skill file set only),
so per the plan's own instruction — "Implementation confirms the exact list from the
audit artifact at implementation start … The floor criterion is `<=5` `##` sections
(not line count)" — scope is confirmed by measuring the on-disk `##` section count of
every `skills/quality-configs/**/*.md` file (index.md excluded). Read-fresh count on
2026-07-09 (`grep -c '^## '` per file):

| File | `##` sections | lines | thin? |
|------|:---:|:---:|:---:|
| `skills/quality-configs/csharp/legacy.md` | 3 | 27 | **THIN** |
| `skills/quality-configs/csharp/strictest.md` | 4 | 38 | **THIN** |
| `skills/quality-configs/csharp/strict.md` | 5 | 106 | **THIN** |
| `skills/quality-configs/php/legacy.md` | 4 | 32 | **THIN** |
| `skills/quality-configs/php/strictest.md` | 4 | 36 | **THIN** |
| `skills/quality-configs/java/legacy.md` | 5 | 45 | **THIN** |
| `skills/quality-configs/java/strictest.md` | 5 | 63 | **THIN** |
| `skills/quality-configs/go/strictest.md` | 5 | 101 | **THIN** |
| `skills/quality-configs/rust/legacy.md` | 5 | 44 | **THIN** |

**Confirmed thin set = 9 files** (all `<= 5` `##` sections). The functional-stage
"12" was a pre-implementation estimate; the read-fresh `<=5`-section measurement
supersedes it and is the authoritative in-scope list (this reconciliation is itself
recorded so no file is silently added or dropped). Files at 6+ sections
(e.g. go/legacy.md = 6, rust/strictest.md = 6, python/strictest.md = 6) are ABOVE the
floor and are NOT in scope (no-churn). All rich `strict`-mode siblings named as
structural templates below (php/strict, java/strict, go/strict, rust/strict,
kotlin/strictest, c/strictest) are ABOVE the floor and are READ-ONLY templates —
never edited.

## Slices (dependency-ordered)

| # | Slice file | Configs upgraded (`files:`) | Structural template (READ-ONLY) | Scope (one line) | depends_on |
|---|------------|-----------------------------|--------------------------------|------------------|------------|
| 1 | `CU4b-quality-configs-s1-csharp.md` | `csharp/legacy.md`, `csharp/strict.md`, `csharp/strictest.md` + `tests/cu4b-csharp-configs.test.js` | **cross-family** `kotlin/strictest.md` (all csharp variants are thin — no rich same-family sibling); csharp/strict's own EditorConfig block is the in-family value reference | .NET 9 toolchain: `Nullable` gradient (`warnings`→`enable`), `EnableNETAnalyzers`/`AnalysisLevel`, `TreatWarningsAsErrors`, Roslyn analyzer severities (`.editorconfig`), coverlet coverage, `dotnet format`/`dotnet test`, CI — web-verified .NET 9 / analyzer versions, dated. | none |
| 2 | `CU4b-quality-configs-s2-php.md` | `php/legacy.md`, `php/strictest.md` + `tests/cu4b-php-configs.test.js` | same-family `php/strict.md` (7 sections: PHPStan/PHP-CS-Fixer/PHPUnit/coverage/complexity/install/commands); ruby/strictest for depth reference | PHP 8.3+ strict toolchain: `declare(strict_types=1)`, PHPStan level 9 + `treatPhpDocTypesAsCertain` (strictest) / level 5 + baseline (legacy), psalm, PHP_CodeSniffer PSR-12, PHPUnit coverage, CI — web-verified PHPStan/psalm/PHPCS versions, dated. | none |
| 3 | `CU4b-quality-configs-s3-jvm.md` | `java/legacy.md`, `java/strictest.md` + `tests/cu4b-jvm-configs.test.js` | same-family `java/strict.md` (7 sections: Checkstyle/SpotBugs/Maven/coverage/complexity/commands) | JVM toolchain: Checkstyle severity gradient, SpotBugs, PMD, JaCoCo coverage enforcement, `-Xlint:all -Werror` compiler gate (strictest) vs relaxed legacy limits, Maven/Gradle CI — web-verified Checkstyle/SpotBugs/JaCoCo versions, dated. | none |
| 4 | `CU4b-quality-configs-s4-go-rust.md` | `go/strictest.md`, `rust/legacy.md` + `tests/cu4b-go-rust-configs.test.js` | same-family `go/strict.md` (7 sections) for go; same-family `rust/strict.md` (8 sections) for rust | The two orphan single-thin-in-family systems configs. go: golangci-lint enable-all + Makefile + install + CI (Go 1.23+). rust: `Cargo.toml` `[lints]` + clippy.toml + rustfmt + `cargo-llvm-cov` gradual-adoption legacy — web-verified golangci-lint/clippy/Rust edition, dated. | none |
| 5 | `CU4b-quality-configs-s5-completeness.md` | (no config edits) + `tests/cu4b-completeness.test.js` | — | The CU4b-wide gate: reads all 9 named configs off disk, asserts each is substantive (> 5 sections, language identifier, dated http source, no cross-language value), reconciles a per-file UPGRADED verdict for each from the s1–s4 slice-plan `## Decisions Taken Under Ambiguity` sections + the audit ledger, and proves the in-scope-9 vs (UPGRADED ∪ SOLID-SKIPPED) diff is empty (no silent omission). | s1, s2, s3, s4 |

**Coverage of the 9 files:** s1 = csharp/legacy, csharp/strict, csharp/strictest ·
s2 = php/legacy, php/strictest · s3 = java/legacy, java/strictest · s4 =
go/strictest, rust/legacy. Union = all 9, no overlap, no omission. s5 upgrades no
config file; it runs the final completeness check.

**Grouping rationale (research-pass coherence).** Each slice = one language/toolchain
so a single research pass web-verifies one linter/formatter/coverage family and its
current versions, then writes every variant of that language together (their config
values differ only by strictness gradient, so the researched facts are shared). csharp
is one slice (3 variants, all thin, one .NET toolchain — and the only family needing a
CROSS-family structural template since no rich csharp sibling exists). php and java are
one slice each (2 variants, each with a rich SAME-family `strict` sibling as template).
go and rust are the two languages with exactly ONE thin config each; splitting them
would create two 1-file slices below the ~2-file target, so they are grouped into one
"orphan systems configs" slice (still disjoint by file; each keeps its own SAME-family
`strict` template — no cross-contamination). s5 is the completeness gate, kept separate
so it can `depends_on: [s1,s2,s3,s4]` and run last.

**Verdict-recording convention (CU3 audit-ledger-fallback precedent).** The audit
ledger `.ctoc/audit/corpus-audit-2026-06-15.json` is CU1's artifact and is OUTSIDE
every CU4b slice's `files:` set (touching it is churn against a done plan). So — exactly
as CU3 did — each s1–s4 slice records its per-file **UPGRADED** verdict, the structural
template used, and the dated sources in its own plan's `## Decisions Taken Under
Ambiguity` section. The s5 completeness test reconciles each of the 9 files' verdict by
scanning (a) the ledger records, then (b) the CU4b slice plan files; a named file with
no verdict in either source is a silent omission and FAILS. This satisfies the CU4b
acceptance criterion "audit artifact updated with per-file verdicts" via the same
reconciled-verdict mechanism CU3 shipped, without any slice editing the CU1 ledger.

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit flagged quality-config files that are functionally empty compared
to their rich siblings. Confirmed read-fresh on 2026-07-09, **9** files sit at or below
the `<= 5` `##`-section floor: csharp/legacy (3 sections, 27 lines), csharp/strictest
(4, 38), php/legacy (4, 32), php/strictest (4, 36), java/legacy (5, 45), java/strictest
(5, 63), go/strictest (5, 101), rust/legacy (5, 44), and csharp/strict (5, 106 — has a
rich EditorConfig block but only 5 top-level sections, missing coverage-tool wiring,
complexity limits table, install and CI). A php/strictest at 36 lines has a PHPStan
snippet and a coverage table, nothing more — it cannot correct PHP strict-mode pitfalls
(`declare(strict_types=1)`, PHPStan level-9 edge cases, psalm integration, PHPCS PSR-12).
A csharp/legacy at 27 lines is missing the entire gradual-adoption story (per-file
`Nullable: warnings`, analyzer severity, coverage floor, CI). These guides are
trigger-loaded when Claude edits `.editorconfig`, `phpstan.neon`, `.csproj`, or
`.golangci.yml`; a functionally empty guide provides no correction surface at exactly
the moment correction is most needed.

### Current State

Read-fresh 2026-07-09 (`grep -c '^## '` + `wc -l`):

- **csharp/legacy.md** (3 `##`, 27 lines): Mode, Project File, Coverage. Missing:
  `.editorconfig` analyzer severities, analyzer selection rationale, gradual-adoption
  pattern, install, CI.
- **csharp/strict.md** (5 `##`, 106 lines): has a rich `.editorconfig` + `.csproj`
  block already, but only Mode/EditorConfig/Project File/Coverage/Commands — missing
  complexity limits, install/package versions surfaced, CI.
- **csharp/strictest.md** (4 `##`, 38 lines): Mode, Project File Additions, EditorConfig
  Additions, Coverage. Missing complexity, testing, CI.
- **php/strictest.md** (4 `##`, 36 lines) / **php/legacy.md** (4 `##`, 32 lines): PHPStan
  snippet + coverage/complexity tables only. Missing `declare(strict_types=1)`,
  PHP-CS-Fixer/PHPCS, PHPUnit, psalm, install, CI.
- **java/strictest.md** (5 `##`, 63 lines) / **java/legacy.md** (5 `##`, 45 lines):
  Checkstyle fragments + coverage/complexity tables. Missing SpotBugs, PMD, JaCoCo
  enforcement, commands, CI.
- **go/strictest.md** (5 `##`, 101 lines): a full `.golangci.yml` + tables, but no
  Makefile / directory structure / CI (its rich sibling go/strict has 7 sections).
- **rust/legacy.md** (5 `##`, 44 lines): `Cargo.toml` `[lints]` + clippy.toml + tables,
  but no rustfmt, no coverage tool, no commands/install (rust/strict has 8 sections).

Rich `strict`-mode SAME-family siblings exist and are SOLID (READ-ONLY structural
templates): php/strict (7 sections), java/strict (7), go/strict (7), rust/strict (8).
Only csharp has NO rich same-family sibling — all three csharp variants are thin — so
csharp uses the CROSS-family richest managed-language config **kotlin/strictest**
(8 sections: Mode / detekt / ktlint(.editorconfig) / Gradle build file / Coverage /
Complexity / Compiler Flags / Commands) as its STRUCTURE template only (never its
Kotlin values). c/strictest (13 sections) is the other cross-family candidate but its
MISRA/CMake/CMocka structure is C-idiomatic and less analogous to a managed .NET config
than kotlin/strictest.

### Impact

Quality-config guides load when Claude edits `.editorconfig`, `phpstan.neon`, `.csproj`,
`.golangci.yml`, or `Cargo.toml`. A thin guide at that moment leaves Claude without the
context to catch misconfigured nullable enforcement, the wrong PHPStan level for a
legacy project, missing analyzer rules, or absent CI. Bringing all 9 thin configs to
same-family (or documented cross-family) depth completes the quality-configs category
and satisfies the vision's no-silent-skip requirement.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage order;
each batch is independently verifiable" and "The audit artifact is preserved so progress
is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer edits a quality-config file for a language CTOC
manages, the trigger-loaded guide must surface the same toolchain-specific correctness
depth as the richest sibling in its config family — so Claude's corrections are grounded
in real config semantics, not a coverage-table placeholder.

- **Goal:** Bring all 9 thin quality-config files to sibling-family depth, completing
  the quality-configs category.
- **Actor:** Claude Code (trigger-loaded at config-edit time); human reviewer (verifies
  config-value correctness + structural completeness + no cross-language value).
- **Impact:** Every thin quality-config is upgraded to match its richest sibling's
  structural depth, using language-correct, web-verified config values.
- **Deliverable:** 9 upgraded quality-config files across 4 upgrade slices, 4 real-file
  content-contract tests, a per-file UPGRADED verdict recorded per slice, and a 9-file
  completeness check (s5) that reconciles the verdicts and proves no omission.

### Success Metrics

- All 9 thin quality-config files exceed the `> 5` `##`-section floor.
- Every upgraded file's structure mirrors its named template sibling (same-family
  `strict` sibling, or documented cross-family kotlin/strictest for csharp).
- Every required section names ≥ 1 technology-specific identifier (version like
  ".NET 9" / "PHP 8.3" / "PHPStan level 9"; tool like "psalm" / "SpotBugs" / "clippy";
  or config key like `declare(strict_types=1)` / `TreatWarningsAsErrors`).
- Every version-specific or security claim carries an inline dated http source
  (retrieval/publication date ≥ 2025-01-01).
- No config value from one language's toolchain appears in another language's guide.
- `node --test tests/*.test.js` passes with `# fail 0` after all edits.
- The 9-file completeness check (s5) passes: each file substantive + carries a
  reconciled UPGRADED verdict; in-scope-9 vs (UPGRADED ∪ SOLID-SKIPPED) diff is empty.

### Stakeholders

- Claude Code (automated consumer): benefits at quality-config edit time.
- Human reviewer (gate approval): spot-checks config-value correctness; primary risk is
  a language-wrong config value (a Kotlin value in a C# file is a correctness defect).
- CU1 (upstream): CU4b `depends_on: [CU1-tier0-quick-wins]` for the clean test baseline
  and the audit ledger. CU4b is independent of CU3/CU4a (different file set).

### Constraints

- **Config-family structural templating rule** (HARD RULE 4): structure from the rich
  sibling, language-correct values authored for the target toolchain. csharp uses the
  cross-family kotlin/strictest STRUCTURE; each slice records its template choice.
- **No-churn rule:** only the 9 thin files are edited. All `strict`-mode template
  siblings and all 6+-section files are READ-ONLY.
- **Objective depth bar:** every section names a technology-specific identifier; every
  version/security claim carries a dated http source ≥ 2025-01-01.
- **Single-config exemption:** depth-within-config-language is the bar; the 7-language
  BAD/SAFE cross-coverage rule does NOT apply to config files.
- **Independent of CU3/CU4a:** runs concurrently; requires only CU1.
- **No new config files:** all config work is edits to the 9 existing files; the only
  NEW files are the 5 test files (`tests/cu4b-*.test.js`).

## 3. CAPTURE — Acceptance Criteria

(The 9 functional acceptance criteria captured at the CAPTURE step remain authoritative.
They are distributed across the slices below and each slice carries the ones it
satisfies. The objective depth gate — technology-specific identifier per section + dated
source ≥ 2025-01-01 per version/security claim — applies to every slice. Summarized:)

- [ ] **Scope confirmed from the audit floor at implementation start** → this index's
  "Scope confirmation" section (9 files, read-fresh, reconciled vs the "12" estimate).
- [ ] **All 9 thin quality-configs reach sibling-family structural depth** → s1–s4.
- [ ] **Config values are language-correct, no cross-language copies** → each slice's
  test asserts absence of the template language's signature tokens.
- [ ] **csharp configs use the cross-family structural template correctly** → s1 (records
  kotlin/strictest as the chosen template).
- [ ] **php configs address the PHP-specific strict-mode toolchain** → s2.
- [ ] **every upgraded section names a technology-specific identifier** → all slices +
  each test's identifier assertions.
- [ ] **all version/toolchain claims carry dated sources ≥ 2025-01-01** → all slices +
  each test's dated-http-source assertion.
- [ ] **no audited-SOLID quality-config is rewritten** → no-churn; only the 9 thin files
  in the slice `files:` lists are edited.
- [ ] **audit artifact updated + completeness check passes** → s5 (reconciled UPGRADED
  verdicts + empty-diff check).

## Scope

### In Scope

- The 9 read-fresh-confirmed thin quality-config files (see Scope confirmation table),
  distributed across slices s1–s4.
- 5 new content-contract test files under `tests/` (`cu4b-*.test.js`).
- Per-file UPGRADED verdict + structural-template-used + dated sources recorded in each
  slice's `## Decisions Taken Under Ambiguity`.

### Out of Scope

- Quality-config files at 6+ `##` sections (above the floor) — no-churn.
- All `strict`-mode template siblings and cross-family templates (kotlin/strictest,
  c/strictest) — READ-ONLY.
- The CU1 audit ledger file itself — not edited by any slice (verdicts reconciled from
  slice plans per the CU3 precedent).
- `skills/languages/` (CU2/CU4c), `skills/frameworks/` (CU3/CU4a), other SKILL.md.
- The 7-language BAD/SAFE cross-coverage rule — config files are exempt.
- Any `src/`, `agents/`, hook, or gate change.

## Risks

### Technical Risks

- **Cross-language value leak** (esp. csharp ← kotlin template): a Kotlin/detekt value
  copied into a C# guide is a plausible-but-wrong defect.
  - Likelihood: LOW · Impact: HIGH (wrong guide worse than empty)
  - Mitigation: each slice's content-contract test asserts the TARGET language's
    signature tokens are present AND the TEMPLATE language's signature tokens are absent;
    each config block cites the target language's official docs (dated).
- **Section-count inflation without depth**: empty sections added to clear the floor.
  - Likelihood: LOW · Impact: MEDIUM
  - Mitigation: objective depth gate (identifier + dated source) is the binary reviewer
    check; tests assert identifier presence, code fences, and a dated http source.

### Dependency Risks

- **CU4b independent of CU3/CU4a**: different file set; requires only CU1.
  `depends_on: [CU1-tier0-quick-wins]` reflects the true dependency.

## Priority

**Priority: MEDIUM** (Score: 5/9) — Dependency LOW (terminal node), Business Impact
MEDIUM (high per-file correctness value; 9 files), Technical Risk MEDIUM (cross-family
templating + language-wrong-value risk, mitigated by the per-slice diff assertions).

## Decisions Taken Under Ambiguity (index-level)

- **9 thin files, not 12** — the functional "12" was a 2026-06-15 estimate; the read-fresh
  `<=5`-section count on 2026-07-09 is 9. The CU1 audit ledger carries no quality-config
  records, so the on-disk section measurement is the authoritative scope per the plan's
  own "confirm from the audit floor at implementation start" instruction. Reconciliation
  recorded above so the 12→9 change is not a silent drop.
- **csharp cross-family template = kotlin/strictest** — all three csharp variants are
  thin (no rich same-family sibling). kotlin/strictest (managed-language: detekt/ktlint/
  Gradle/Compiler Flags/Commands) is a closer STRUCTURAL analog for a .NET config than
  c/strictest (C-idiomatic MISRA/CMake/CMocka). Recorded here and re-recorded in s1.
- **php/java/go/rust use their SAME-family `strict` sibling as template** — each has a
  rich `strict`-mode sibling (7–8 sections). The parent text suggested "php mirror
  ruby/strictest"; the same-family php/strict is the more faithful template (identical
  toolchain, only the strictness gradient differs) and is used, with ruby/strictest as a
  depth reference only. Recorded per slice.
- **go+rust grouped** — each has exactly one thin config; grouping avoids two sub-target
  1-file slices while staying disjoint-by-file (each keeps its own same-family template).
- **Verdicts recorded in slice plans, not the ledger** (CU3 precedent) — the ledger is
  CU1's done artifact and out of every slice's `files:`; s5's test reconciles verdicts
  from slice-plan Decisions + ledger. Satisfies "audit artifact updated with per-file
  verdicts" via the identical reconciled-verdict mechanism CU3 shipped.
- **Floor criterion** — `<= 5` `##` sections (thin); upgrade target `> 5` `##` sections,
  consistent with the CU3 test convention.
