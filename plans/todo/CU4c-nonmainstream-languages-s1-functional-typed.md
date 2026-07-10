---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:40.961Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s1 — typed-functional language guides (haskell, ocaml, fsharp, scala)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/haskell.md
  - skills/languages/ocaml.md
  - skills/languages/fsharp.md
  - skills/languages/scala.md
  - tests/cu4c-functional-typed-guides.test.js
---

# CU4c s1 — typed-functional language guides (haskell · ocaml · fsharp · scala)

> Slice 1 of the CU4c decomposition. De-stub the four **statically-typed functional**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each
> has exactly the 5 template sections — Critical Corrections, Current Tooling, Patterns
> Claude Should Use, Anti-Patterns Claude Generates, Version Gotchas) into substantive
> correction surfaces, in ONE coherent research pass. These four share a research spine:
> purity + lazy/strict evaluation (space leaks), algebraic data types + exhaustiveness,
> effect systems / monads, and typed-FP toolchains (GHC/`cabal`, `dune`/opam, `dotnet`/
> Paket, `sbt`/Coursier). Adds the content-contract test that reads the REAL guide files
> off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every GHC/OCaml/.NET-F#/Scala version, CWE identifier, tool version, edition, date,
> and best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch
> of haskell.org / ghc.gitlab.haskell.org / ocaml.org / dotnet.microsoft.com /
> learn.microsoft.com / scala-lang.org / cwe.mitre.org) and carry an inline dated source
> ≥ 2025-01-01 — never invented (hard user rule). These are niche languages; if no dated
> authoritative source exists for a claim, **OMIT the claim** and note the absence in the
> audit artifact findings rather than asserting it uncited. The content-contract test
> READS the real files off disk and asserts substantive structure — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"every audit-confirmed thin non-mainstream language
guide is upgraded past the 5-section floor with the CU2 depth standard"**, **"upgraded
guides meet the CU2 depth standard (>5 sections, each naming a concrete identifier,
every version/security claim carrying a dated source ≥ 2025-01-01)"**, **"CVE/CWE
classes named for applicable languages (deserialization risks for JVM languages beyond
Java)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Each guide's examples are in ITS OWN language,
correct + idiomatic + current-version. Bar = depth-within-language, objectively gated:
every required `## ` section names a concrete identifier (version number, CWE ID, or
API/function name); every version/security claim carries an inline dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** haskell.md, ocaml.md, fsharp.md, scala.md each
have exactly 5 `## ` sections today (confirmed by reading fresh 2026-07-09). The existing
5 sections are preserved verbatim; new sections are ADDED below them.

Grouping rationale: these four are ONE research pass because the correction spine is
shared — evaluation-order footguns (Haskell laziness/space leaks; Scala `lazy val`/
by-name), exhaustive pattern-match warnings (all four), effect/monad idioms (Haskell
`IO`/`effectful`, OCaml effect handlers, F# computation expressions, Scala `Future`/
`IO`), and JVM/.NET-adjacent supply-chain (Scala on Maven Central + deserialization
CWE-502; F# on NuGet). They are disjoint from the Lisp/BEAM slice (s2) and every other
slice by file.

### Dependency Graph

```
skills/languages/haskell.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-typed-guides.test.js
skills/languages/ocaml.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-typed-guides.test.js
skills/languages/fsharp.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-typed-guides.test.js
skills/languages/scala.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-functional-typed-guides.test.js
```

Four disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of all sibling slices — different files, parallel-safe;
Gate 2 & 3 still batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for every version/security claim; extend the existing `Version Gotchas`
section rather than duplicating it):

#### File: `skills/languages/haskell.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Haskell edits.
- **Evaluation / Space-Leak Footguns** — thunk build-up (lazy `foldl` vs `foldl'`),
  `!`/`BangPatterns` strict fields, `seq`/`deepseq`, `-O2` not fixing algorithmic
  laziness; retention via lazy `Map`/accumulators. Name `foldl'`, `Data.Map.Strict`.
- **Error Handling Idioms** — total functions over partial (`head`/`fromJust` →
  `Maybe`/`Data.List.NonEmpty`), `Either`/`ExceptT`, `bracket` for resource safety,
  why `error`/`undefined` are bombs. Name `Control.Exception.bracket`.
- **Security and Dependency Gotchas** — Hackage supply chain, `cabal freeze` /
  `cabal.project.freeze` pinning, `cabal outdated`; name a relevant advisory source
  (haskell.org security / GHC advisory) with a dated source if one exists ≥ 2025-01-01,
  else omit and note.
- **Testing Conventions** — `hspec` + `QuickCheck` property tests, `tasty`, `--coverage`
  (HPC). Name `QuickCheck`.
- **Performance Traps** — `String` vs `Text`/`ByteString`, list-as-queue O(n),
  `Data.Map` vs `HashMap`, unboxed vectors; boxing.
- **Version-Specific Gotchas** — EXTEND existing section: current stable GHC line +
  GHC2024 language edition facts, dated ≥ 2025-01-01, sourced to haskell.org /
  gitlab.haskell.org release notes.
- **References** — dated source list.

#### File: `skills/languages/ocaml.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for OCaml edits.
- **Concurrency / Effects Footguns** — OCaml 5 multicore domains + **effect handlers**,
  `Domain`/`Thread` differences, data races on shared refs across domains, `Mutex`.
  Name `Domain.spawn`, `Effect`.
- **Error Handling Idioms** — `result`/`Result.t` over exceptions for expected failures,
  `Fun.protect` for cleanup, avoiding `Stdlib.failwith`, exhaustive match warnings
  (`-w +a`). Name `Result`, `Fun.protect`.
- **Security and Dependency Gotchas** — opam pinning + `opam lock`, `Marshal`
  deserialization is unsafe on untrusted input (arbitrary value forgery). Name
  `Marshal` and the trust boundary; dated source if available ≥ 2025-01-01 else omit.
- **Testing Conventions** — `dune test`, `alcotest` / `ppx_expect`, `bisect_ppx` coverage.
- **Performance Traps** — boxing of `float` in polymorphic containers, `List` vs `Array`,
  Flambda (`-O3`), allocation in hot loops.
- **Version-Specific Gotchas** — EXTEND: OCaml 5.x multicore + effects, dated ≥ 2025-01-01,
  sourced to ocaml.org release notes.
- **References** — dated source list.

#### File: `skills/languages/fsharp.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for F# edits.
- **Concurrency / Async Footguns** — F# `async`/`task` differences, `Async.RunSynchronously`
  deadlock on UI/context, `ConfigureAwait`-equivalent, mixing `Task` and `Async`. Name
  `async { }`, `task { }`.
- **Error Handling Idioms** — `Result<'T,'TError>` + `Option`, railway-oriented (`Result.bind`),
  avoiding `failwith`, exhaustive match (incomplete-match warning). Name `Result.bind`.
- **Security and Dependency Gotchas** — NuGet supply chain, `dotnet list package
  --vulnerable`, **BinaryFormatter/deserialization CWE-502** applies to .NET-hosted F#
  (link cwe.mitre.org/definitions/502.html); prefer `System.Text.Json`. Name CWE-502.
- **Testing Conventions** — `dotnet test` with Expecto / xUnit + FsCheck property tests,
  coverlet coverage. Name FsCheck.
- **Performance Traps** — struct vs reference tuples, `[<Struct>]`, sequence
  re-evaluation (`seq` is lazy + re-runs), `List` vs `Array`, closures allocating.
- **Version-Specific Gotchas** — EXTEND: current .NET LTS + F# language version facts,
  dated ≥ 2025-01-01, sourced to learn.microsoft.com / dotnet.microsoft.com.
- **References** — dated source list.

#### File: `skills/languages/scala.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Scala edits.
- **Concurrency / Async Footguns** — `Future` eager evaluation + `ExecutionContext`
  starvation, blocking inside `Future` (use `blocking { }`), `Await.result` deadlock;
  effect systems (cats-effect `IO`, ZIO) referential transparency. Name `Future`,
  `ExecutionContext`.
- **Error Handling Idioms** — `Either`/`Try`/`Option` over thrown exceptions, `Try`
  vs `catch`, exhaustive match on sealed hierarchies (`-Wnonexhaustive`). Name `Try`.
- **Security and Dependency Gotchas** — Maven Central supply chain (Scala runs on the
  JVM), **Java-deserialization CWE-502** applies to Scala too (link
  cwe.mitre.org/definitions/502.html); sbt `dependencyUpdates`/`sbt-dependency-check`.
  Name CWE-502.
- **Testing Conventions** — ScalaTest / MUnit + ScalaCheck property tests, scoverage.
  Name ScalaCheck.
- **Performance Traps** — boxing of primitives in generic collections, `for`-comprehension
  desugaring overhead, implicit-resolution compile cost, `List` prepend vs `Vector`.
- **Version-Specific Gotchas** — EXTEND: Scala 3.x (`given`/`using`, enums) vs 2.13
  migration + current stable, dated ≥ 2025-01-01, sourced to scala-lang.org.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-functional-typed-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — haskell, ocaml, fsharp, scala):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Concurrency/Evaluation/Effects, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References
   (case-insensitive heading regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — at least one date token `20(2[5-9]|[3-9]\d)` (≥ 2025)
   AND at least one `https?://` URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present (skills.json indexing).
7. **Per-language concrete identifiers** — haskell: `foldl'` + `QuickCheck`; ocaml:
   `Domain` + `Result`; fsharp: `CWE-502` + `FsCheck`; scala: `CWE-502` + `ScalaCheck`.

**Coverage note:** content-grounding — content-contract assertions substitute for
line/branch coverage (CU1 s4 / CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (haskell.org, ocaml.org, learn.microsoft.com,
  dotnet.microsoft.com, scala-lang.org, cwe.mitre.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-functional-typed-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each file has exactly 5 `## `
sections, no Concurrency/Security/Testing sections, no dated sources, no advisory tokens).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current stable
GHC + GHC2024 edition (haskell.org / gitlab.haskell.org), OCaml 5.x multicore+effects
(ocaml.org), current .NET LTS + F# language version (learn.microsoft.com /
dotnet.microsoft.com), Scala 3.x + current stable (scala-lang.org), CWE-502 page
(cwe.mitre.org). Capture each source URL + retrieval date (≥ 2025-01-01). If a niche
claim has no dated source, OMIT it and record the omission for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections (real footguns, idiomatic per-language
examples, dated sources). Additive only — existing 5 sections stay verbatim. ONE step,
four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥ 2025-01-01;
GHC/OCaml/.NET/Scala versions are the web-verified current ones; CWE-502 links present
for fsharp+scala; diff additive on all four guides.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused; every bullet names a specific footgun +
identifier, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes haskell/ocaml/fsharp/scala triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s1") so the final completeness check (s12) has no silent omissions. Record
each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source
claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; nothing fabricated (GHC/OCaml/.NET/Scala versions, CWE-502 all
traceable to official URLs); no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale GHC/OCaml/.NET/Scala version gives false confidence | Web-verify current stable at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/advisory (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts dated source + http URL per file; omit-if-no-source for niche claims | Step 9, Step 14, Step 16 |
| Fewer dated sources for niche typed-FP langs | Omit-if-no-source rule — omit uncited claims, note absence in audit findings | Step 9, Step 15 |
| Frontmatter corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts concrete identifiers (foldl', Domain, CWE-502, ScalaCheck), not just section count | Step 11, Step 14 |
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
