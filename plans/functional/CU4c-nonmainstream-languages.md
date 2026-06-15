---
title: "CU4c — Non-mainstream languages reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 5
depends_on: [CU1-tier0-quick-wins]
status: refined
acceptance_criteria_count: 9
risk_level: LOW
files:
  - skills/languages/*.md
---

# CU4c — Non-mainstream languages reference upgrade

## 1. ASSESS

### Problem Statement

The 2026-06-15 audit found approximately 40 of 50 language guides at the <=5 `##`
section template floor. CU2 upgrades the 9 highest-traffic mainstream languages
(python, javascript, typescript, go, java, rust, csharp, c, cpp). The remaining
~31 thin language guides beyond CU2's 9-file scope are the target of CU4c.
Confirmed non-mainstream thin language examples: swift.md (5 `##` sections, ~50
lines), kotlin.md (5 `##` sections, ~50 lines), ruby.md (5 `##` sections, ~50
lines). Each is a trigger-loaded correction surface for projects using that
language; at template floor, the guide provides no real correction value — no
Swift 6 strict concurrency warnings, no Kotlin K2 compiler gotchas, no Ruby YJIT
considerations. This stub upgrades all thin language guides beyond CU2's 9-file
set, applying the same depth standard as CU2 within each language's specific idioms.

### Current State

From the 2026-06-15 audit (floor = <=5 `##` sections):
- **Confirmed thin non-mainstream examples**:
  - swift.md: 5 `##` sections (~50 lines). Missing: Swift 6 strict concurrency
    mode details, actor isolation rules, SwiftUI performance pitfalls, package
    resolution edge cases, Xcode toolchain version coupling.
  - kotlin.md: 5 `##` sections (~50 lines). Missing: Kotlin 2.0 K2 compiler
    migration details, coroutine scope leak patterns, Gradle KTS vs Groovy DSL
    migration footguns, null-safety runtime failure patterns with Java interop.
  - ruby.md: 5 `##` sections (~50 lines). Missing: YJIT-specific performance
    footguns, Ractors and their current limitations, bundler version compatibility,
    Ruby 3.4+ behavior changes.
- The exact count of thin non-mainstream language guides is confirmed at
  implementation time from the audit ledger, by taking all `skills/languages/*.md`
  files at <=5 `##` sections minus the 9 CU2 files.

### Impact

Lower per-file impact than CU2 because each individual language is lower-traffic.
Aggregate impact is meaningful: ~31 thin guides collectively create a correctable
gap across the less-common but still-used languages in the corpus. Completing
this category satisfies the vision's "no thin file silently skipped" requirement
(Success Criterion 5) for the language tier and makes the per-file verdict record
in the audit artifact complete.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage
order; each batch is independently verifiable." and "The audit artifact is
preserved so progress is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer working in Swift, Kotlin, Ruby, or another
non-mainstream CTOC-managed language loads the trigger-loaded language guide,
the guide must surface language-specific footguns, CVE patterns where applicable,
and version-specific gotchas — so Claude's corrections are grounded in
authoritative, language-specific knowledge rather than template boilerplate.

- **Goal:** Complete the audit-identified upgrade list for all remaining thin
  language guides beyond CU2's scope, with no silent skips.
- **Actor:** Claude Code (trigger-loaded at edit time); human reviewer (audits
  progress against the audit artifact).
- **Impact:** Every audit-confirmed thin non-mainstream language guide is either
  upgraded (with sourced, dated, language-specific depth) or explicitly recorded
  as audited-SOLID and skipped.
- **Deliverable:** Upgraded non-mainstream language reference guides and an updated
  audit artifact recording per-file verdicts for all CU4c-scope files.

### Success Metrics

- Every audit-confirmed thin language file not in CU2's 9-file set is upgraded
  past the <=5 `##` section floor OR explicitly recorded as SOLID-SKIPPED.
- Every upgraded guide meets the CU2 depth standard: each required section names
  at least one technology-specific identifier (version number, CWE identifier,
  or concrete API/function name); every version-specific or security claim carries
  a dated source from 2025-01-01 or later.
- The audit artifact is updated with per-file verdicts for all CU4c files.
- `node --test tests/*.test.js` passes with `# fail 0` after all edits.
- No audited-SOLID file is rewritten.

### Audit-Ledger Scoping

In-scope files are determined by taking all `skills/languages/*.md` files at <=5
`##` sections from the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json`,
minus the 9 CU2 files (python, javascript, typescript, go, java, rust, csharp, c,
cpp). The floor criterion is <=5 `##` sections (not line count). A completeness
check passes when every in-scope file appears in the audit artifact as UPGRADED
or SOLID-SKIPPED — no file may be silently omitted.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval).
- CU2 (upstream, sets depth standard): CU4c applies CU2's depth standard to the
  remaining languages. CU4c is independent of CU3 and CU4a (different files) and
  needs only CU1 and the audit ledger.

### Constraints

- **Language set boundary**: exactly the non-mainstream thin languages confirmed
  by the audit ledger, defined as all `skills/languages/*.md` at <=5 `##` sections
  MINUS the 9 CU2 files. Do not expand scope to include CU2's files.
- **Single-language exemption**: these guides are not subject to the 7-language
  BAD/SAFE cross-coverage rule (explicit vision carve-out); depth-within-language
  is the bar. Implementer must not add cross-language BAD/SAFE examples.
- **No-churn rule**: if a section within any thin file already has audited-SOLID
  content, extend rather than rewrite.
- **Source recency**: WebSearch authoritative sources before asserting
  version-specific facts; stamp each claim with retrieval date of 2025-01-01 or
  later.
- **No new files**: all work is edits to existing language files.
- **Independent of CU3 and CU4a**: CU4c touches skills/languages/ only. It may
  run concurrently with CU3, CU4a, and CU4b.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a Swift 6 concurrency-aware module,
**I want** the trigger-loaded swift.md guide to surface Swift 6 actor isolation
rules, sendable conformance requirements, and the @MainActor footgun patterns
with dated sources,
**so that** my edits correctly apply strict concurrency mode rather than applying
Swift 5 patterns that fail Swift 6 compilation.

**As a** Claude Code instance editing a Kotlin 2.0 coroutine-based service,
**I want** the trigger-loaded kotlin.md guide to warn about K2 compiler migration
footguns, GlobalScope anti-patterns, and Kotlin/Java null-safety interop pitfalls
with dated sources,
**so that** my edits are guided by Kotlin 2.0-specific correctness requirements
rather than Kotlin 1.x patterns that no longer apply.

**As a** human reviewer auditing corpus completeness for CU4c,
**I want** the audit artifact updated with per-file verdicts for every CU4c-scope
language file,
**so that** I can confirm no thin non-mainstream language guide was silently
skipped and the language tier is fully upgraded.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any guide section that does not name at least one technology-specific identifier
(version number, CWE identifier, or concrete API/function name), and rejects any
version-specific or security claim that does not carry an inline dated source from
2025-01-01 or later. This gate is identical to the CU2 depth standard.

- [ ] **Scenario: scope is confirmed from the audit ledger at implementation start**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` lists
  thin language files (<=5 `##` sections)
  When the implementer establishes CU4c scope at implementation start
  Then the CU4c file list equals: (audit thin-file list for skills/languages/)
  MINUS (the 9 CU2 files: python, javascript, typescript, go, java, rust,
  csharp, c, cpp)
  And this scope list is recorded in the plan's findings section before any
  upgrades begin

- [ ] **Scenario: every audit-confirmed thin non-mainstream language guide is upgraded or recorded**
  Given the CU4c scope established above
  When CU4c implementation is complete
  Then every file on the CU4c scope list is either upgraded past the <=5 `##`
  section floor with the CU2 depth standard
  Or explicitly recorded in the audit artifact as SOLID-SKIPPED with a rationale
  And zero files are silently omitted (no file appears in neither the upgraded
  list nor the skipped list)

- [ ] **Scenario: upgraded language guides meet the CU2 depth standard**
  Given CU2 set the depth standard for language guides
  When any non-mainstream thin language guide is upgraded in CU4c
  Then the guide contains more than 5 distinct `##` sections including at minimum:
  Overview, Concurrency / Async Footguns, Error Handling Idioms, Security and
  Dependency Gotchas (with CVE/CWE identifiers where the language has established
  classes), Testing Conventions, Performance Traps, Version-Specific Gotchas,
  and References
  And each section names at least one technology-specific identifier
  And every version-specific or security claim carries a dated source from
  2025-01-01 or later

- [ ] **Scenario: swift.md covers Swift 6 strict concurrency and SwiftUI pitfalls**
  Given swift.md is ~50 lines at template floor
  When upgraded
  Then the guide addresses: Swift 6 strict concurrency mode and @Sendable
  enforcement, actor isolation rules and common isolation boundary errors,
  @MainActor footgun patterns (applying it everywhere vs only on UI-bound types),
  SwiftUI state management rebuild patterns, Swift Package Manager resolution
  edge cases, and Xcode toolchain version coupling
  And all Swift 6-specific claims name "Swift 6" or "Swift 6.2" and carry dated
  sources from 2025-01-01 or later

- [ ] **Scenario: kotlin.md covers K2 compiler, coroutines, and Java interop**
  Given kotlin.md is ~50 lines at template floor
  When upgraded
  Then the guide addresses: Kotlin 2.0 K2 compiler migration footguns (changed
  type inference, breaking behavioral changes), coroutine scope leak patterns
  (GlobalScope anti-pattern, structured concurrency requirements), Kotlin/Java
  null-safety interop failures (platform types, @Nullable mismatch), Gradle KTS
  migration from Groovy footguns, and data class with JPA entity pitfalls
  And all Kotlin 2.0-specific or K2-specific claims name "Kotlin 2.0" or "K2"
  and carry dated sources from 2025-01-01 or later

- [ ] **Scenario: ruby.md covers YJIT, Ractors, and Ruby 3.4+ specifics**
  Given ruby.md is ~50 lines at template floor
  When upgraded
  Then the guide addresses: YJIT performance footguns (methods where YJIT
  disengages, profiling YJIT effectiveness), Ractor current limitations (no
  sharing mutable objects across Ractors), Bundler version compatibility edge
  cases, Ruby 3.4+ behavior changes, bare rescue anti-patterns, and N+1 query
  detection in ActiveRecord contexts
  And all Ruby 3.4+-specific claims name "Ruby 3.4" and carry dated sources
  from 2025-01-01 or later

- [ ] **Scenario: CVE/CWE classes named for applicable non-mainstream languages**
  Given some non-mainstream languages have well-documented vulnerability classes
  When those language guides are upgraded
  Then each guide names at least one CWE identifier or named vulnerability class
  relevant to that language where such classes exist (e.g. memory-safety CWE classes
  for C-adjacent languages, deserialization risks for JVM languages beyond Java,
  injection risks for scripting languages)
  And the naming includes the impact pattern, not just the identifier number

- [ ] **Scenario: no audited-SOLID language guide is rewritten**
  Given the no-churn rule
  When the implementer uses the audit artifact to determine in-scope files
  Then no file marked audited-SOLID in the 2026-06-15 audit is modified
  And if a file's status is ambiguous, the implementer treats it as SOLID, records
  the ambiguity in the audit artifact, and does not touch the file without explicit
  reviewer approval

- [ ] **Scenario: audit artifact updated and completeness check passes**
  Given the vision requires tracking progress per file
  When all CU4c-scope files have been processed
  Then the audit artifact at `.ctoc/audit/corpus-audit-2026-06-15.json` is
  updated with each file's path, verdict (UPGRADED / SOLID-SKIPPED), and date
  And a completeness check confirms the diff between the in-scope list and the
  union of (upgraded + skipped) is empty — no silent omissions
  And `node --test tests/*.test.js` passes with `# fail 0`

## Scope

### In Scope

- All `skills/languages/*.md` files confirmed thin (<=5 `##` sections) by the
  2026-06-15 audit that are NOT in CU2's 9-file set. Confirmed examples: swift.md,
  kotlin.md, ruby.md (~31 files total per the audit's ~40 thin / 50 total count).
- Adding sections for: concurrency/async footguns, error-handling idioms, security
  and dependency gotchas (with CVE/CWE identifiers where applicable), testing
  conventions, performance traps, version-specific gotchas, and dated references.
- WebSearch before asserting version-specific facts; stamping each claim with a
  retrieval date of 2025-01-01 or later.
- Updating the audit artifact with per-file UPGRADED / SOLID-SKIPPED verdicts.

### Out of Scope

- The 9 CU2 mainstream language files (python, javascript, typescript, go, java,
  rust, csharp, c, cpp) — those are CU2 scope, not CU4c.
- Framework guides in `skills/frameworks/` — CU3 (named high-traffic) or CU4a
  (long tail).
- Quality-config files in `skills/quality-configs/` — those are CU4b.
- The 7-language BAD/SAFE cross-coverage rule — single-language guides are
  exempt per the vision carve-out; implementer must not add cross-language
  BAD/SAFE examples to these files.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Rewriting any section confirmed solid by the 2026-06-15 audit (no-churn rule).

## Risks

### Technical Risks

- **Less authoritative source availability for niche languages**: less-common
  languages (e.g. Elixir, Dart, Lua) may have fewer authoritative sources with
  2025-01-01 or later dates, making the dated-source requirement harder to satisfy.
  - Likelihood: MEDIUM (depends on language community and release cadence)
  - Impact: LOW (if a dated source is unavailable, the claim is omitted rather
    than asserted without citation — the guide remains thin in that area rather
    than wrong)
  - Mitigation: WebSearch each language's official release notes and security
    advisories at implementation time; if no dated source exists for a claim,
    omit the claim and note its absence in the audit artifact findings.

- **Frontmatter corruption breaks skills.json trigger**: same risk as CU2 across
  ~31 files.
  - Likelihood: LOW
  - Impact: HIGH (broken trigger = no guidance loaded for that language)
  - Mitigation: Run `node --test tests/*.test.js` after each language file edit.

### Business Risks

- **Niche language guides may become stale quickly**: some non-mainstream languages
  (Swift, Kotlin) have frequent release cycles; claims may become stale before
  the next corpus review.
  - Likelihood: MEDIUM (Swift 6 and Kotlin 2.x both have active development)
  - Impact: LOW (stale claims are visible via the dated source requirement; they
    are not wrong, merely time-bounded)
  - Mitigation: Every version-specific claim names the applicable version alongside
    the dated source, so staleness is detectable at the next review cycle.

### Dependency Risks

- **CU4c is independent of CU3, CU4a, and CU4b**: CU4c touches skills/languages/
  only, a different file set from frameworks and quality-configs. It requires only
  CU1 (clean test baseline) and the audit ledger. It may run concurrently with
  CU3, CU4a, and CU4b.
  - Likelihood: N/A (this is a design decision, not a risk)
  - Mitigation: `depends_on: [CU1-tier0-quick-wins]` reflects the true dependency.

## Priority

**Priority: MEDIUM** (Score: 4/9)
- Dependency: LOW (1) — no other stub depends on CU4c; it is a terminal node.
- Business Impact: MEDIUM (2) — lower per-file traffic than CU2; aggregate impact
  is meaningful (~31 files) but lower than mainstream language upgrades.
- Technical Risk: LOW (1) — content additions are low-complexity; the primary
  risk (niche source availability) is mitigated by the omit-if-no-source rule.

## Decisions Taken Under Ambiguity

- **CU4c is independent of CU3, CU4a, and CU4b** — non-mainstream language files
  (skills/languages/) are a different file set from frameworks and quality-configs.
  CU4c needs only CU1 and the audit ledger. Serializing CU4c behind CU3 would be
  artificial. This is a locked decision from the adversarial review.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Objective depth bar** — identical to CU2: every required section must name at
  least one technology-specific identifier (version number, CWE identifier, or
  concrete API/function name), AND every version-specific or security claim must
  carry an inline dated source from 2025-01-01 or later. A reviewer rejects
  against this criterion.
- **Single-language exemption** — depth-within-language is the bar; 7-language
  BAD/SAFE cross-coverage rule does not apply. Implementer must not add
  cross-language examples.
- **Omit-if-no-source rule for niche languages** — if no dated authoritative
  source exists for a claim about a niche language, omit the claim and note the
  absence in the audit artifact findings rather than asserting the claim without
  citation. An honest omission is preferable to an undated or unverifiable claim.
- **Exact scope via audit-ledger diff** — in-scope list is derived by diffing the
  audit ledger against CU2's 9-file set at implementation time, not by re-running
  an audit. This prevents scope drift and ensures the no-churn rule is honored.
