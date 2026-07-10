---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.238Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s11 — modern mobile language guides (kotlin, swift, dart)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/kotlin.md
  - skills/languages/swift.md
  - skills/languages/dart.md
  - tests/cu4c-mobile-modern-guides.test.js
---

# CU4c s11 — modern mobile language guides (kotlin · swift · dart)

> Slice 11 of the CU4c decomposition. De-stub the three **modern mobile-first** language
> guides from the 5-section template floor (confirmed fresh 2026-07-09: each has exactly
> the 5 template sections) into substantive correction surfaces, in ONE coherent research
> pass. **kotlin.md and swift.md are headline exemplars of CU4c** (Swift 6 strict
> concurrency; Kotlin 2.0 K2). Shared research spine: **modern strict-concurrency +
> null-safety + structured-concurrency** — Swift 6 actors/@Sendable, Kotlin coroutines +
> structured concurrency, Dart isolates + sound null safety + async. Adds the content-
> contract test that reads the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Kotlin/Swift/Dart version, CWE identifier, tool version, date, and best-practice
> claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of kotlinlang.org /
> swift.org / developer.apple.com / dart.dev / cwe.mitre.org) and carry an inline dated
> source ≥ 2025-01-01 — never invented (hard user rule). If no dated authoritative source
> exists for a claim, **OMIT it** and note the absence in the audit findings. The
> content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"swift.md covers Swift 6 strict concurrency and
SwiftUI pitfalls"**, **"kotlin.md covers K2 compiler, coroutines, and Java interop"**,
**"upgraded guides meet the CU2 depth standard"**, **"CVE/CWE classes named for applicable
languages (deserialization for JVM Kotlin)"**, and **"no audited-SOLID guide is rewritten
(no-churn)"** — for these three files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** kotlin.md, swift.md, dart.md each have exactly 5
`## ` sections today (confirmed fresh 2026-07-09); existing 5 preserved verbatim, new
sections ADDED below.

Grouping rationale: ONE research pass because all three are modern mobile-first languages
whose #1 correction surface is **strict concurrency + null safety + structured async** —
Swift 6 strict-concurrency mode (@Sendable, actor isolation, @MainActor), Kotlin coroutines
+ structured concurrency + K2 + platform-type null-safety interop, Dart isolates + sound
null safety + `Future`/`async`. Kotlin's JVM lineage pulls in **deserialization CWE-502**.
Disjoint from every other slice by file.

### Dependency Graph

```
skills/languages/kotlin.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-mobile-modern-guides.test.js
skills/languages/swift.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-mobile-modern-guides.test.js
skills/languages/dart.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-mobile-modern-guides.test.js
```

Three disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/kotlin.md`
**Action:** MODIFY (extend 5→>5; no-churn) — HEADLINE CU4c file (K2, coroutines, interop)
**Purpose:** Trigger-loaded correction surface for Kotlin edits.
- **Coroutines / Concurrency Footguns** — **`GlobalScope` anti-pattern** (leaks; use a
  scoped `CoroutineScope` + structured concurrency), cancellation cooperation
  (`isActive`/`ensureActive`), `Dispatchers.IO` vs `Default`, exception handling in
  coroutines (`SupervisorJob`, `CoroutineExceptionHandler`), launching in `viewModelScope`.
  Name `GlobalScope`, structured concurrency, `SupervisorJob`.
- **Error Handling Idioms** — `runCatching`/`Result`, sealed-class result types, `try`/
  `catch`, NOT catching `CancellationException` (rethrow it), checked-exception absence.
  Name `Result`, `CancellationException`.
- **Security and Dependency Gotchas** — **Kotlin/Java null-safety interop** (platform
  types `String!` from Java can be null → NPE at the boundary; annotate `@Nullable`/
  `@NonNull`), JVM **deserialization CWE-502** (link cwe.mitre.org/definitions/502.html),
  Gradle dependency verification + lockfiles. Name platform types, CWE-502.
- **Testing Conventions** — JUnit 5 + MockK, `kotlinx-coroutines-test`
  (`runTest`/`TestDispatcher`), Kotest, JaCoCo. Name MockK, `runTest`.
- **Performance Traps** — boxing of nullable primitives (`Int?`), unnecessary object
  allocation from lambdas (use `inline`), `data class` `copy()` cost, sequence vs list.
  Name `inline`.
- **Version-Specific Gotchas** — EXTEND: **Kotlin 2.0 K2 compiler** migration footguns
  (changed type inference / smart-cast behavior, breaking behavioral changes), Gradle KTS
  vs Groovy DSL migration, `data class` + JPA entity pitfalls; dated ≥ 2025-01-01, sourced
  to kotlinlang.org. Name "Kotlin 2.0", "K2".
- **References** — dated source list.

#### File: `skills/languages/swift.md`
**Action:** MODIFY (extend 5→>5; no-churn) — HEADLINE CU4c file (Swift 6 strict concurrency)
**Purpose:** Trigger-loaded correction surface for Swift edits.
- **Strict Concurrency Footguns** — **Swift 6 strict concurrency mode + `@Sendable`
  enforcement**, **actor isolation** rules and common isolation-boundary errors, the
  **`@MainActor` footgun** (applying it everywhere vs only on UI-bound types), data-race
  safety at compile time, `nonisolated`, `Task`/`TaskGroup` structured concurrency. Name
  Swift 6, `@Sendable`, `@MainActor`, actor isolation.
- **Error Handling Idioms** — `throws`/`try`/`do`-`catch`, typed throws (Swift 6),
  `Result`, `guard`+`throw`, avoiding force-try (`try!`) / force-unwrap (`!`). Name
  `guard`, `try!`.
- **Security and Dependency Gotchas** — force-unwrap crashes as a reliability/DoS class,
  `NSKeyedUnarchiver` untrusted-data (use `requiringSecureCoding`; deserialization CWE-502
  class), Keychain for secrets, **Swift Package Manager resolution edge cases** +
  `Package.resolved` pinning. Name CWE-502, `Package.resolved`.
- **Testing Conventions** — **Swift Testing** (`@Test`/`#expect`) and/or XCTest, async test
  support, Xcode coverage. Name Swift Testing / XCTest.
- **Performance / SwiftUI Traps** — **SwiftUI state-management rebuild patterns**
  (over-broad `@State`/`@Observable` triggering excessive body re-evaluation), value-vs-
  reference type copies, `@ViewBuilder` cost, retain cycles in closures (`[weak self]`).
  Name SwiftUI rebuilds, `[weak self]`.
- **Version-Specific Gotchas** — EXTEND: **Swift 6 / Swift 6.2** language mode + migration,
  **Xcode toolchain version coupling**, SPM resolution edges; dated ≥ 2025-01-01, sourced
  to swift.org / developer.apple.com. Name "Swift 6" or "Swift 6.2".
- **References** — dated source list.

#### File: `skills/languages/dart.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Dart / Flutter edits.
- **Concurrency / Isolates Footguns** — Dart is single-threaded per isolate (event loop);
  **isolates don't share mutable memory** (message passing / `Isolate.run`), `async`/
  `await` on the same isolate doesn't parallelize CPU work, `Future`/`Stream` unhandled
  errors. Name isolate, `Isolate.run`.
- **Error Handling Idioms** — `try`/`catch`/`on`/`finally`, `Future.catchError`/`.onError`,
  unawaited futures swallow errors (`unawaited()` / lint), `Zone` error handling. Name
  `unawaited`, `on`.
- **Security and Dependency Gotchas** — **sound null safety** (`late` misuse → runtime
  `LateInitializationError`; `!` bang-operator crashes; nullable-aware code), untrusted
  `jsonDecode` shape assumptions, `pubspec.lock` pinning, `dart pub audit`-style checks.
  Name sound null safety, `late`.
- **Testing Conventions** — `package:test` (`test`/`group`/`expect`), `flutter_test` +
  widget tests, mockito/mocktail, coverage (`--coverage`). Name `package:test`.
- **Performance Traps** — rebuilding whole widget subtrees (use `const` constructors +
  narrow `setState`), synchronous work on the UI isolate, `List` growth, unbounded streams.
  Name `const` constructors.
- **Version-Specific Gotchas** — EXTEND: current Dart 3.x (records, patterns, sealed
  classes, class modifiers) + Flutter coupling, dated ≥ 2025-01-01, sourced to dart.dev.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-mobile-modern-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL three guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — kotlin, swift, dart):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/Coroutines/Isolates, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language headline identifiers** — kotlin: `Kotlin 2.0` + `K2` + `GlobalScope` +
   `CWE-502`; swift: `Swift 6` + `@Sendable` + `@MainActor`; dart: isolate + sound null
   safety + `Isolate.run`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to three Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (kotlinlang.org, swift.org, developer.apple.com,
  dart.dev, cwe.mitre.org) — no secrets.
- Only the four enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all three guides fresh off disk first. Create `tests/cu4c-mobile-modern-guides.test.js`
reading the three REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
kotlin.md has no K2/coroutine/interop content, swift.md has no Swift 6 concurrency content,
no dated sources, no CWE tokens).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): Kotlin 2.0 K2 +
coroutines + interop (kotlinlang.org), Swift 6/6.2 strict concurrency + SPM + Xcode
coupling (swift.org / developer.apple.com), Dart 3.x + sound null safety + isolates
(dart.dev), CWE-502 page (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). Omit any niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the three guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; kotlin names Kotlin 2.0 + K2 + GlobalScope + CWE-502, swift names Swift 6 +
@Sendable + @MainActor, dart names isolates + sound null safety; every version/security
claim carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the four enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes kotlin/swift/dart triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s11"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; Swift 6 + Kotlin 2.0/K2 claims all sourced
with a date ≥ 2025-01-01; nothing fabricated; no cross-language BAD/SAFE examples added;
tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Swift/Kotlin move fast — Swift 6 / K2 claims stale quickly | Name the exact version (Swift 6/6.2, Kotlin 2.0) alongside each dated source so staleness is detectable at next review | Step 9, Step 11 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| SwiftUI rebuild guidance is subtle | Anchor SwiftUI state/rebuild claims to developer.apple.com + name the concrete construct (`@State`, `@Observable`) | Step 9, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts headline identifiers (Swift 6, K2, @Sendable), not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
