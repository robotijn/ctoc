---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.086Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s5 — modern systems language guides (zig, nim, crystal, d)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/zig.md
  - skills/languages/nim.md
  - skills/languages/crystal.md
  - skills/languages/d.md
  - tests/cu4c-systems-modern-guides.test.js
---

# CU4c s5 — modern systems language guides (zig · nim · crystal · d)

> Slice 5 of the CU4c decomposition. De-stub the four **modern C-adjacent systems**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each has
> exactly the 5 template sections) into substantive correction surfaces, in ONE coherent
> research pass. Shared research spine: manual/automatic memory model tradeoffs (Zig
> allocators + no hidden alloc, Nim/Crystal GC, D GC + `@nogc`), compile-time metaprogramming
> (`comptime`, macros, CTFE), C interop/FFI, and memory-safety CWE classes inherited from
> the C-adjacent domain. Adds the content-contract test that reads the REAL guide files off
> disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Zig/Nim/Crystal/D version, CWE identifier, tool version, date, and best-practice
> claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of ziglang.org /
> nim-lang.org / crystal-lang.org / dlang.org / cwe.mitre.org) and carry an inline dated
> source ≥ 2025-01-01 — never invented (hard user rule). **Zig is pre-1.0** — pin every
> Zig claim to the exact version verified (breaking changes are frequent). If no dated
> authoritative source exists for a claim, **OMIT it** and note the absence in the audit
> findings. The content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (memory-safety CWE classes for
C-adjacent languages)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for
these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01.

**No-churn (extend, never overwrite):** all four have exactly 5 `## ` sections today
(confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections ADDED below.

Grouping rationale: ONE research pass because all four are modern systems languages with
a **manual/hybrid memory model + comptime metaprogramming + C FFI** spine and inherit
C-adjacent **memory-safety CWE classes** (use-after-free CWE-416, buffer overflow
CWE-787/125, integer overflow CWE-190). Disjoint from the legacy-native slice (s6:
fortran/assembly/cobol/objectivec) by file — those are legacy/ABI-era, these are modern.

### Dependency Graph

```
skills/languages/zig.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-systems-modern-guides.test.js
skills/languages/nim.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-systems-modern-guides.test.js
skills/languages/crystal.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-systems-modern-guides.test.js
skills/languages/d.md        (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-systems-modern-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/zig.md`
**Action:** MODIFY (extend 5→>5; no-churn) — PIN every claim to the verified Zig version
**Purpose:** Trigger-loaded correction surface for Zig edits.
- **Memory / Allocator Footguns** — explicit allocator passing (no hidden allocation),
  `defer`/`errdefer` for cleanup, use-after-free (**CWE-416**) when freeing before defer
  runs, `GeneralPurposeAllocator` leak/double-free detection in debug. Name `errdefer`,
  CWE-416.
- **Concurrency Footguns** — `async`/`await` status (in flux pre-1.0 — pin to version),
  `std.Thread`, data races on shared mutable state. Name `std.Thread`.
- **Error Handling Idioms** — error unions `!T` + `try`/`catch`, error sets, `unreachable`
  vs `@panic`, no exceptions. Name error union `!T`, `try`.
- **Security and Dependency Gotchas** — integer overflow is **safety-checked in Debug/
  ReleaseSafe but UB/wrapping in ReleaseFast** (CWE-190; pick build mode deliberately),
  `zig fetch` + `build.zig.zon` hashing for deps. Name ReleaseSafe, CWE-190.
- **Testing Conventions** — `test { }` blocks + `zig test`, `std.testing.allocator`
  leak detection. Name `zig test`.
- **Performance Traps** — comptime bloat (code size), ReleaseFast vs ReleaseSafe tradeoff,
  bounds-check elision only in ReleaseFast.
- **Version-Specific Gotchas** — EXTEND: **pin to the current 0.x version verified at edit
  time**; note pre-1.0 breaking-change cadence; dated ≥ 2025-01-01, sourced to ziglang.org.
- **References** — dated source list.

#### File: `skills/languages/nim.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Nim edits.
- **Memory / GC Footguns** — **ARC/ORC** memory management (`--mm:orc` default in 2.x),
  cycle collection with ORC, `--mm:none` for manual, dangling refs across FFI. Name ORC,
  `--mm:orc`.
- **Concurrency Footguns** — `spawn`/`threadpool`, `--threads:on`, GC-safe procs across
  threads (`{.gcsafe.}`), `Channel`/`isolate`. Name `{.gcsafe.}`.
- **Error Handling Idioms** — exceptions + `{.raises: [].}` effect tracking, `Result`/
  `Option` (results lib), `defer`. Name `{.raises.}`.
- **Security and Dependency Gotchas** — templates/macros can inject at compile time,
  C FFI = C memory-safety CWE classes (use-after-free CWE-416, buffer overflow CWE-787);
  nimble lockfile pinning. Name CWE-416.
- **Testing Conventions** — `unittest` module, `testament` runner, `nim doc` coverage.
  Name unittest.
- **Performance Traps** — implicit copies vs `sink`/`lent`/move semantics, `seq`
  reallocation, bounds checks (`--boundChecks:off` in release only carefully).
- **Version-Specific Gotchas** — EXTEND: Nim 2.x (ORC default, `--mm`) vs 1.6, dated
  ≥ 2025-01-01, sourced to nim-lang.org.
- **References** — dated source list.

#### File: `skills/languages/crystal.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Crystal edits.
- **Concurrency / Fibers Footguns** — fibers are cooperative + single-threaded by default;
  **multi-threading (`-Dpreview_mt` / `-Dexecution_context`) is preview** — data races on
  shared state; `Channel` for communication (CSP). Name Fiber, Channel, `-Dpreview_mt`.
- **Error Handling Idioms** — `begin`/`rescue`/`ensure`, typed exceptions, `Nil` handling
  via the type system (`.not_nil!` panics), union types. Name `.not_nil!`.
- **Security and Dependency Gotchas** — Ruby-like syntax but compiled + C FFI (memory-safety
  CWE classes at the FFI boundary, CWE-416), `shard.lock` pinning, `crystal deps`. Name
  shard.lock.
- **Testing Conventions** — Spec framework (`describe`/`it`), `crystal spec`, coverage
  tooling. Name Spec.
- **Performance Traps** — heap vs stack (`struct` value vs `class` ref), string building
  (`String.build`), boxing in unions, GC pressure. Name `String.build`.
- **Version-Specific Gotchas** — EXTEND: Crystal 1.x stability + MT preview status, dated
  ≥ 2025-01-01, sourced to crystal-lang.org.
- **References** — dated source list.

#### File: `skills/languages/d.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for D edits.
- **Memory / GC Footguns** — GC by default; **`@nogc`** and `-betterC` for GC-free code,
  `scope`/`@safe`/`@trusted`/`@system` memory-safety attributes (**DIP1000** scope-lifetime
  checks), manual `malloc` interop leaks. Name `@nogc`, `@safe`, DIP1000.
- **Concurrency Footguns** — `std.concurrency` message passing, `shared` type qualifier +
  `synchronized`, `immutable` for safe sharing, `core.thread`. Name `shared`, `std.concurrency`.
- **Error Handling Idioms** — exceptions (`Throwable`/`Exception`/`Error`), `scope(exit)`/
  `scope(failure)`, `nothrow`, `enforce`. Name `scope(exit)`, `enforce`.
- **Security and Dependency Gotchas** — `@system` code + C FFI = C memory-safety CWE
  classes (use-after-free CWE-416, buffer overflow CWE-787); prefer `@safe`; dub lockfile
  (`dub.selections.json`) pinning. Name `@safe`, CWE-416.
- **Testing Conventions** — built-in `unittest { }` blocks + `dub test`, `-cov` coverage.
  Name `unittest`.
- **Performance Traps** — GC pauses (use `@nogc` hot paths), array bounds checks
  (`-boundscheck=off` release), template bloat, `-betterC` limits.
- **Version-Specific Gotchas** — EXTEND: current DMD/LDC version + DIP1000 default status,
  dated ≥ 2025-01-01, sourced to dlang.org.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-systems-modern-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — zig, nim, crystal, d):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Memory/Concurrency, Error Handling, Security/Dependency,
   Testing, Performance, Version-specific, References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language concrete identifiers** — zig: `errdefer` + `CWE-416` + a `0.` version
   token; nim: `ORC` + `CWE-416`; crystal: `Channel` + shard.lock; d: `@safe` + `@nogc` +
   `CWE-416`.
8. **Memory-safety CWE named** — at least one memory-safety CWE (`CWE-416`/`CWE-787`/
   `CWE-190`) per file (C-adjacent requirement).

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (ziglang.org, nim-lang.org, crystal-lang.org,
  dlang.org, cwe.mitre.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-systems-modern-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Memory/Security/Testing sections, no memory-safety CWE tokens, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current Zig 0.x
(ziglang.org — pin exact version, note pre-1.0), Nim 2.x + ORC (nim-lang.org), Crystal 1.x
+ MT preview (crystal-lang.org), current DMD/LDC + DIP1000 (dlang.org), CWE-416/787/190
pages (cwe.mitre.org). Capture each source URL + retrieval date (≥ 2025-01-01). Omit any
niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; each guide names ≥1 memory-safety CWE; Zig claims pinned to the verified 0.x
version; every version/security claim carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes zig/nim/crystal/d triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s5"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; Zig version pinned; nothing fabricated; no cross-language BAD/SAFE
examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Zig pre-1.0 breaking changes make claims stale fast | Pin every Zig claim to the exact verified 0.x version; dated source ≥ 2025-01-01; test asserts a `0.` token | Step 9, Step 11, Step 14 |
| Fabricated version/CWE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Fewer dated sources for niche systems langs | Omit-if-no-source rule — omit uncited claims, note absence in audit findings | Step 9, Step 15 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts memory-safety CWE + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 32 tests, 4 pass / 28 fail (RED confirmed)

### Step 9: PREPARE
- [x] Install dependencies if needed (none)
- [x] Check prerequisites — web-verified all versions/CWE at edit time (2026-07-10)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (none)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (extended all 4 guides additively)
- [x] Add error handling (Error Handling Idioms section per guide)
- [x] Wire up integration points (H1/frontmatter preserved; new sections appended)

### Step 11: REVIEW
- [x] Self-review all new code — each guide >5 sections + >120 lines; ≥1 mem-safety CWE
- [x] Verify integration points work together — additive only, original 5 sections verbatim
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — dense, footgun-per-bullet, no padding
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — test uses path.join(__dirname,'..')
- [x] Sanitize outputs (n/a — content-only)
- [x] No secrets in code — only public official-domain URLs
- [x] Safe file operations — readFileSync on fixed relative paths only

### Step 14: VERIFY
- [x] Run lint + type check — eslint tests/cu4c-systems-modern-guides.test.js exit 0
- [x] Run tests (TDD Green) — slice test 32/32 pass (BARRIER: own test only, full suite deferred to caller)
- [x] Check coverage — content-grounding substitutes for line/branch coverage (CU2 convention)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (the four guides are the documentation)
- [x] Add JSDoc comments to new functions (test file header documents zero-doubles contract)
- [x] Update CHANGELOG if needed (n/a — caller commits)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

All facts web-verified at edit time (2026-07-10) against official sources; nothing fabricated.

**Verified versions / facts (source URL + retrieval date 2026-07-10):**
- **Zig stable 0.16.0**, released 2026-04-13; `master` = 0.17.0-dev (2026-07-08). Pre-1.0,
  breaks between minors. Source: https://ziglang.org/download/index.json
- **Nim 2.2.10** latest stable (2.2 line); ORC (`--mm:orc`) is the 2.x default.
  Source: https://nim-lang.org/install.html ; https://nim-lang.org/blog.html (2.0.0)
- **Crystal 1.20.3** (project_version meta tag); multi-threading behind `-Dpreview_mt`
  (+ experimental `-Dexecution_context`). Source: https://crystal-lang.org/api/
- **D / DMD 2.112.0**. Source: https://dlang.org/changelog/2.112.0.html
- **CWE-416** "Use After Free", **CWE-787** "Out-of-bounds Write", **CWE-190**
  "Integer Overflow or Wraparound" — titles confirmed. Source: https://cwe.mitre.org/data/definitions/{416,787,190}.html

**Decisions:**
1. **Zig async status stated as "in flux / removed pre-1.0, verify per toolchain"** rather
   than pinning a keyword-level example — Zig's stackless async was removed from the language
   and a new I/O model is still landing across 0.11→0.16. Committing to a concrete `async`
   snippet would fabricate stability that does not exist pre-1.0. Documented the uncertainty
   instead of inventing an API (no-stub: made the honest choice explicit).
2. **DIP1000 default-on status left as "verify per compiler version, enable `-preview=dip1000`"**
   — its default-enabled status has shifted across DMD releases and no single dated source
   pins it as unconditionally on for 2.112.0; stated the safe instruction rather than assert a
   possibly-stale default (omit-if-unverifiable applied to the exact default state).
3. **endoflife.date has no zig/nim/crystal feeds** (404s) — sourced versions directly from the
   official project download/install/changelog endpoints instead, which are authoritative.
4. **Line count used as the >120 substantive floor** (all four: zig 187, nim 178, crystal 171,
   d 192) since the CU2 convention treats content-grounding as the coverage substitute for
   Markdown correction guides.
