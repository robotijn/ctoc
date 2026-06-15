---
title: "CU2 — Tier 1 mainstream languages reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 2
depends_on: [CU1-tier0-quick-wins]
status: refined
acceptance_criteria_count: 13
risk_level: LOW
files:
  - skills/languages/python.md
  - skills/languages/javascript.md
  - skills/languages/typescript.md
  - skills/languages/go.md
  - skills/languages/java.md
  - skills/languages/rust.md
  - skills/languages/csharp.md
  - skills/languages/c.md
  - skills/languages/cpp.md
---

# CU2 — Tier 1 mainstream languages reference upgrade

## 1. ASSESS

### Problem Statement

The nine most-used language reference guides in `skills/languages/` are also the
thinnest in the corpus: python ~48 lines, javascript ~49 lines, typescript ~50
lines, go ~53 lines, java ~53 lines, rust ~57 lines — all at the bare 5-section
template floor. These files are trigger-loaded correction surfaces: when Claude
edits any file matching the language trigger, the guide is injected as context.
A 50-line template provides no real correction value; a developer who asks Claude
to write Go concurrency code or a Rust ownership pattern gets no footgun
warnings, no CVE-class awareness, and no version-specific gotchas from the
injected context. This stub fills that gap for the 9 highest-traffic languages
in leverage order, producing guides that are substantive correction surfaces rather
than filed-and-forgotten stubs.

### Current State

Each of the 9 files contains the CTOC 5-section template (confirmed by the
2026-06-15 audit, floor defined as <=5 `##` sections):
1. Installation / Critical Corrections (1-2 paragraphs or bullet list)
2. Current Tooling (1-2 bullets or table, generic)
3. Common Mistakes (2-5 bullets, often shallow)
4. Correct Patterns (code snippet, no security or version context)
5. Version Gotchas / References (1-3 bullets, often undated)

Confirmed line counts from the 2026-06-15 audit: python 48, javascript 49,
typescript 50, go 53, java 53, rust 57. C# (~50), C (~50), C++ (~50) are in the
same range. All lack: concurrency footguns, error-handling idioms, CVE-class
security gotchas, dependency management traps, performance pitfalls, and
version-specific correctness details — the high-value content that justifies
trigger-loading a reference at edit time.

### Impact

Every Claude edit to a Python, JavaScript, TypeScript, Go, Java, Rust, C#, C, or
C++ file in a CTOC-managed project loads one of these thin guides. If the guide
offers no actionable correction surface, the trigger mechanism provides no benefit.
Upgrading these 9 files directly improves the correction quality for the most
common implementation work in the pipeline. Because they are single-language
guides, they are exempt from the 7-language BAD/SAFE cross-coverage rule and can
go deep within each language's specific idioms.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criterion 3: "Each upgraded reference guide
measurably exceeds the 5-section floor with sourced, dated, correction-focused
depth (not padding)." And Success Criterion 4: "Upgrades proceed in leverage order
(Tier 1 mainstream before Tier 2 long tail)."

### Impact Map

**Job to Be Done:** When Claude edits source code in a mainstream language, the
trigger-loaded reference guide must surface real footguns, CVE classes, and
version-specific gotchas — so corrections are grounded in authoritative,
language-specific knowledge rather than template boilerplate.

- **Goal:** Maximize correction surface for the highest-traffic trigger-loaded
  guides before tackling lower-traffic files.
- **Actor:** Claude (automated, reads the guide at edit time); human developer
  (reviews diffs and guidance applied).
- **Impact:** Claude's edits to Python/JS/TS/Go/Java/Rust/C#/C/C++ files are
  guided by substantive, sourced, language-specific warnings rather than generic
  bullets.
- **Deliverable:** 9 upgraded language reference guides, each measurably deeper
  than the 5-section floor, with concurrency, error-handling, security,
  testing, performance, and version-specific sections.

### Success Metrics

- Each guide contains more than 5 distinct `##` sections with substantive depth.
- Every required section names at least one technology-specific identifier
  (a version number such as "Python 3.12", a CWE identifier such as "CWE-416",
  or a concrete API/function name such as "asyncio.gather") — generic bullets
  without a concrete identifier are a failing criterion.
- Every version-specific or security claim carries an inline dated source from
  2025-01-01 or later (URL, document title + section, or advisory reference with
  retrieval date). Claims without a dated source fail the reviewer gate.
- CVE-class or well-known vulnerability classes are named for languages with
  established classes (C/C++ memory safety, Java/.NET deserialization, etc.).
- `node --test tests/*.test.js` stays green (frontmatter and skills.json indexing
  are not broken by the content additions).
- `.ctoc/skills.json` trigger mappings for these languages remain valid after edits.

### Audit-Ledger Scoping

In-scope files are defined by diffing the checked-in audit ledger at
`.ctoc/audit/corpus-audit-2026-06-15.json` against already-upgraded files.
The floor criterion is <=5 `##` sections (not line count). A completeness check
passes when every in-scope file appears in either the upgraded list or a recorded
skipped list in the audit artifact — no file may be silently omitted.

### Stakeholders

- Claude Code (automated consumer): benefits directly from richer guide content
  at edit time.
- Human reviewer (gate approval): spot-checks depth and source quality.
- Implementation Planner (downstream on CU3/CU4a/CU4b/CU4c): uses CU2 output as
  the depth standard for framework and long-tail upgrades.

### Constraints

- **Language set is fixed**: exactly the 9 enumerated above. The "..." in the
  vision is not an open invitation; remaining thin languages are CU4c (Tier 2).
- **Single-language exemption**: these guides are not subject to the 7-language
  BAD/SAFE cross-coverage rule (explicit vision carve-out); depth-within-language
  is the bar. The implementer must not add cross-language BAD/SAFE examples to
  these files.
- **No-churn rule**: if a section within any thin file already has audited-SOLID
  content, extend rather than rewrite. No healthy sentence is deleted.
- **Source recency**: WebSearch authoritative sources before asserting
  version-specific facts; stamp each claim with retrieval date no earlier than
  2025-01-01 so staleness is visible to reviewers.
- **No new files**: all work is edits to the 9 existing files.
- **Parallel-safe**: the 9 files are independent; they can be implemented
  concurrently without merge conflict (different files).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a Python file,
**I want** the trigger-loaded python.md guide to surface concurrency footguns
(GIL, asyncio pitfalls), error-handling idioms, and Python 3.12+-specific
correctness concerns with dated sources,
**so that** my edits are guided by actionable, version-aware warnings rather than
generic placeholder text.

**As a** Claude Code instance editing a C or C++ file,
**I want** the trigger-loaded c.md / cpp.md guide to name memory-safety CVE
classes (buffer overflows, use-after-free, format string bugs), modern C17/C++20
alternatives, and sanitizer recommendations with authoritative sources,
**so that** I can surface specific vulnerability classes — not just "be careful
with pointers" — in my code review output.

**As a** human reviewer approving a CU2 implementation,
**I want** each of the 9 guides to have a clearly visible source citation for every
version-specific or security claim, with a retrieval date of 2025-01-01 or later,
**so that** I can verify the claims are authoritative and reject any claim that
lacks a concrete dated source.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any guide section that does not name at least one technology-specific identifier
(version number, CWE identifier, or concrete API/function name), and rejects any
version-specific or security claim that does not carry an inline dated source from
2025-01-01 or later. "Not padding" is not a sufficient criterion; the identifiers
and dated sources are the checkable gate.

- [ ] **Scenario: each guide exceeds the 5-section floor with substantive depth**
  Given all 9 language guides currently sit at <=5 `##` sections (template floor)
  When each guide is upgraded
  Then each file contains more than 5 distinct `##` sections including at minimum:
  Overview, Concurrency / Async Footguns, Error Handling Idioms, Security and
  Dependency Gotchas (including relevant CVE classes), Testing Conventions,
  Performance Traps, Version-Specific Gotchas, and References
  And each section names at least one technology-specific identifier — a version
  number, a CWE identifier, or a concrete API/function name
  And no section consists only of generic bullets without a concrete identifier

- [ ] **Scenario: python.md covers GIL, asyncio, and 3.12+ specifics**
  Given python.md is ~48 lines with no concurrency or async content
  When upgraded
  Then the guide addresses: GIL implications for CPU-bound threading, asyncio
  footguns (missing await, task cancellation, exception swallowing in
  asyncio.gather), Python 3.12+ changes (removed deprecated APIs, new type
  system features), dependency security (PyPI supply-chain, pinning with hashes),
  and testing conventions (pytest idioms, fixture scoping)
  And every claim about Python 3.12+ behavior carries a source URL or document
  reference with a retrieval date of 2025-01-01 or later

- [ ] **Scenario: javascript.md and typescript.md cover async, type, and ecosystem pitfalls**
  Given javascript.md (~49 lines) and typescript.md (~50 lines) are at template floor
  When upgraded
  Then javascript.md addresses: event loop misconceptions, Promise rejection
  handling, prototype pollution (CVE class), package audit (npm audit), Node.js
  vs browser runtime divergence, and current LTS version gotchas
  And typescript.md addresses: strict mode trade-offs, `any` escape hatch risks,
  module resolution edge cases (ESM vs CJS), declaration file pitfalls, and
  TypeScript 5.x-specific changes
  And both files name specific version numbers (Node.js LTS version, TypeScript 5.x
  release) and carry dated sources for version-specific claims

- [ ] **Scenario: go.md covers goroutine leaks, error wrapping, and module gotchas**
  Given go.md is ~53 lines with generic content
  When upgraded
  Then go.md addresses: goroutine leak patterns (unbuffered channels, missing
  cancel propagation), errors.As/errors.Is wrapping idioms vs sentinel error
  anti-patterns, context propagation requirements, Go module dependency pinning
  risks, and performance traps (interface boxing, map pre-allocation)
  And version-specific content names the applicable Go version (e.g. Go 1.21,
  Go 1.22) and is dated with a source from 2025-01-01 or later

- [ ] **Scenario: java.md covers deserialization, virtual threads, and module system**
  Given java.md is ~53 lines
  When upgraded
  Then java.md addresses: Java deserialization vulnerability class (CWE-502),
  virtual threads (Java 21 Project Loom) pitfalls, Java Platform Module System
  (JPMS) encapsulation errors, checked vs unchecked exception design, dependency
  security (Maven/Gradle lockfiles), and Java 21+ language feature gotchas
  (records, sealed classes, pattern matching)
  And the deserialization entry names CWE-502 and references CWE.mitre.org or
  OWASP with a retrieval date of 2025-01-01 or later

- [ ] **Scenario: rust.md covers ownership, async, and unsafe footguns**
  Given rust.md is ~57 lines
  When upgraded
  Then rust.md addresses: lifetime elision edge cases, async trait object
  limitations, `unsafe` block invariant documentation requirements, Send/Sync
  implementation pitfalls, Rust edition migration (2021/2024 edition differences),
  dependency security (`cargo audit`), and performance traps (unnecessary
  heap allocation via Box, String vs &str misuse)
  And async-specific content names the tokio version applicable at implementation
  time and carries a dated source

- [ ] **Scenario: csharp.md covers nullable, async, and .NET 9 specifics**
  Given csharp.md is at template floor
  When upgraded
  Then csharp.md addresses: nullable reference type annotation gaps, `async void`
  anti-pattern, ConfigureAwait usage in library vs application code, .NET 9
  performance APIs (Span<T>, Memory<T> common misuse), deserialization risks
  (System.Text.Json vs Newtonsoft divergence), dependency security (NuGet
  audit), and C# 12/13 feature gotchas
  And all .NET 9-specific claims name "NET 9" or a specific C# version number and
  carry a source with retrieval date of 2025-01-01 or later

- [ ] **Scenario: c.md covers memory-safety CVE classes with mitigations**
  Given c.md is at template floor
  When upgraded
  Then c.md addresses: the primary C memory-safety CVE classes naming the CWE
  identifiers (buffer overflow CWE-121/CWE-122, use-after-free CWE-416, format
  string CWE-134, integer overflow CWE-190), C17 standard additions vs C99/C11
  footguns, sanitizer recommendations (AddressSanitizer, UBSan invocation flags),
  safe alternatives for dangerous functions (strncpy traps, snprintf over sprintf),
  and static analysis tool guidance
  And each CWE reference links to CWE.mitre.org or an authoritative source with
  a retrieval date of 2025-01-01 or later

- [ ] **Scenario: cpp.md covers modern C++20/23 idioms and memory safety**
  Given cpp.md is at template floor
  When upgraded
  Then cpp.md addresses: C++20/23 language feature footguns (coroutines, modules,
  concepts pitfalls), undefined behavior classes beyond C (strict aliasing,
  uninitialized reads), RAII patterns vs common resource leak scenarios,
  smart pointer misuse (shared_ptr cycles, dangling references), iterator
  invalidation rules, and security implications of undefined behavior in
  security-sensitive code paths
  And C++20/23-specific claims name the applicable standard version ("C++20",
  "C++23") and carry a dated source from 2025-01-01 or later

- [ ] **Scenario: all version-specific and security claims carry dated sources**
  Given the audit confirmed all guides lack sourced claims
  When any version-specific or security claim is added to any of the 9 guides
  Then the claim includes either an inline source reference (URL or document
  title + section) with a retrieval or publication date of 2025-01-01 or later,
  or a References section entry that the claim text links to
  And a reviewer can reject any claim that lacks a concrete technology-specific
  identifier (version number, CWE ID, or API/function name) in the same sentence
  or paragraph

- [ ] **Scenario: CVE classes are named for languages with established classes**
  Given C, C++, Java, and .NET have well-documented CVE/CWE classes
  When those guides are upgraded
  Then each names at least one CWE identifier or named vulnerability class
  relevant to that language (e.g. CWE-121 for C buffer overflows, CWE-502 for
  Java/.NET deserialization) with a reference to CWE.mitre.org or an equivalent
  authoritative source
  And the naming includes the impact pattern, not just the identifier number

- [ ] **Scenario: tests stay green and skills.json mappings remain valid**
  Given `.ctoc/skills.json` indexes these language guides by trigger
  When any of the 9 files is modified
  Then `node --test tests/*.test.js` passes with `# fail 0` after the edit
  And the frontmatter of each modified file retains the exact key/value pairs
  required by the skills.json trigger mapping (no key renames, no removal of
  indexed fields)

- [ ] **Scenario: audit-ledger completeness check passes**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` defines
  the in-scope file list (files with <=5 `##` sections, not line count)
  When the implementer processes all 9 language files
  Then every file appears in the audit artifact as either UPGRADED or
  SOLID-SKIPPED with a rationale — no file is silently omitted
  And the completeness check can be run by diffing the in-scope list against
  the union of (upgraded list + skipped list) and confirming the diff is empty

- [ ] **Scenario: no file outside the 9 enumerated guides is modified**
  Given the no-churn rule
  When the implementer reviews all touched files
  Then only the 9 files listed in the `files:` frontmatter are modified
  And any solid section within a thin guide that already has correct, specific
  content is preserved verbatim (extend, never overwrite)

## Scope

### In Scope

- Content upgrades to the 9 files in `skills/languages/`: python.md, javascript.md,
  typescript.md, go.md, java.md, rust.md, csharp.md, c.md, cpp.md.
- Adding sections for: concurrency/async footguns, error-handling idioms, security
  and dependency gotchas (with CVE/CWE identifiers where applicable), testing
  conventions, performance traps, version-specific gotchas, and dated references.
- WebSearch before asserting version-specific facts; stamping each claim with a
  retrieval date of 2025-01-01 or later.
- Extending any existing solid content within these files (no overwriting).
- Updating the audit artifact with per-file verdicts (UPGRADED / SOLID-SKIPPED).

### Out of Scope

- Any language guide not in the 9-file list — remaining thin languages are CU4c.
- The 7-language BAD/SAFE cross-coverage rule — single-language guides are
  explicitly exempt per the vision and locked decisions; the implementer must not
  add cross-language examples to these files.
- Framework reference guides — those are CU3.
- Quality-config files — those are CU4b.
- Non-mainstream language guides — those are CU4c.
- SKILL.md files in other categories — not in scope for CU2.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Rewriting any section confirmed solid by the 2026-06-15 audit (no-churn rule).

## Risks

### Technical Risks

- **Frontmatter corruption breaks skills.json indexing**: If the YAML frontmatter
  of any guide is accidentally corrupted (wrong indentation, removed key), the
  trigger mapping for that language breaks silently.
  - Likelihood: LOW (content additions are below the frontmatter block)
  - Impact: HIGH (broken trigger = no correction surface loaded for that language)
  - Mitigation: Run `node --test tests/*.test.js` after each file edit; confirm
    the skill trigger still appears in `.ctoc/skills.json` after each save.

- **Stale version claims are harder to catch than missing claims**: Adding
  content from a knowledge cutoff without verifying against the current release
  notes could introduce subtly wrong version guidance.
  - Likelihood: MEDIUM (AI/ML and JS ecosystems move fast; Python/Go/Rust also
    release frequently)
  - Impact: MEDIUM (wrong version claim is worse than no claim — gives false
    confidence)
  - Mitigation: WebSearch each language's current release notes before asserting
    version-specific behavior; stamp with retrieval date of 2025-01-01 or later
    so staleness is visible to reviewers.

### Business Risks

- **Depth without specificity**: Padding with generic content to exceed the
  5-section floor without naming concrete identifiers would defeat the purpose.
  - Likelihood: LOW (the objective depth gate explicitly requires identifiers)
  - Impact: MEDIUM (a longer but still-vague guide wastes review time)
  - Mitigation: The reviewer gate rejects any section lacking a version number,
    CWE identifier, or concrete API/function name — this is a binary check,
    not a judgment call.

### Dependency Risks

- **Blocked by CU1**: CU2 depends on CU1 completing successfully (tests green,
  corpus structurally clean). If CU1 leaves a test failure, CU2 cannot be
  verified.
  - Likelihood: LOW (CU1 is targeted, low-risk edits)
  - Impact: MEDIUM (delays CU2 start; does not invalidate CU2 scope)
  - Mitigation: CU1 is `priority: HIGH, order: 1`; implementation queue enforces
    this ordering.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — CU3 (frameworks) can run in parallel with CU2; CU4a/b/c
  depend on CU2 setting the depth standard; no stub depends solely on CU2.
- Business Impact: HIGH (3) — highest-traffic trigger-loaded guides; every Claude
  edit to the most common source languages benefits immediately.
- Technical Risk: MEDIUM (2) — content additions are low-complexity; the main
  risk (stale version claims) is mitigated by the WebSearch mandate.

## Decisions Taken Under Ambiguity

- **Language set boundary** — exactly the 9 the vision enumerates
  (python, js, ts, go, java, rust, c#, c, c++). The "..." in the vision is not
  treated as an open invitation; remaining thin languages are Tier 2 (CU4c).
- **Cross-language example rule** — single-language reference guides are exempt
  from the 7-language BAD/SAFE coverage standard (explicit vision carve-out);
  depth-within-language is the bar instead. Implementer must not add cross-language
  BAD/SAFE examples to these files.
- **Objective depth bar** — "not padding" replaced with a grep-checkable rule:
  every required section must name at least one technology-specific identifier
  (version number, CWE identifier, or concrete API/function name), AND every
  version-specific or security claim must carry an inline dated source from
  2025-01-01 or later. A reviewer rejects against this criterion.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Existing partial content** — if a guide already has audited-SOLID content in
  a section, extend rather than rewrite (no-churn rule applies even within a
  thin file's solid sections).
- **Source recency** — cite the most recent authoritative source available at
  implementation time; stamp each with retrieval date of 2025-01-01 or later so
  staleness is visible.
