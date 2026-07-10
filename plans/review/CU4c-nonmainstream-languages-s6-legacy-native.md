---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.110Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s6 — legacy & native language guides (fortran, assembly, cobol, objectivec)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/fortran.md
  - skills/languages/assembly.md
  - skills/languages/cobol.md
  - skills/languages/objectivec.md
  - tests/cu4c-legacy-native-guides.test.js
---

# CU4c s6 — legacy & native language guides (fortran · assembly · cobol · objectivec)

> Slice 6 of the CU4c decomposition. De-stub the four **legacy / low-level native**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each has
> exactly the 5 template sections) into substantive correction surfaces, in ONE coherent
> research pass. Shared research spine: manual memory + no bounds checking (buffer/array
> overflow CWE-787/125/121), calling conventions / ABI, fixed-format legacy quirks, and
> long-lived-codebase maintenance realities. Objective-C adds ARC/retain-cycle memory
> management (Apple/Cocoa). Adds the content-contract test that reads the REAL guide files
> off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every Fortran/assembly-ISA/COBOL/Objective-C version/standard, CWE identifier, tool
> version, date, and best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or
> direct fetch of fortran-lang.org / gcc.gnu.org/fortran / developer.arm.com or
> felixcloutier.com/x86 / official COBOL/GnuCOBOL / developer.apple.com / cwe.mitre.org)
> and carry an inline dated source ≥ 2025-01-01 — never invented (hard user rule). If no
> dated authoritative source exists for a claim, **OMIT it** and note the absence in the
> audit findings. The content-contract test READS the real files off disk — no mocks, no
> fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (memory-safety CWE classes for C-adjacent
/ native languages)"**, and **"no audited-SOLID guide is rewritten (no-churn)"** — for
these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current standard. Bar = depth-within-language, objectively gated: every required `## `
section names a concrete identifier; every version/security claim carries a dated source
≥ 2025-01-01.

**No-churn (extend, never overwrite):** all four have exactly 5 `## ` sections today
(confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections ADDED below.
**Assembly framing:** assembly has no single "concurrency" model — the corresponding
section covers **memory/register/ABI footguns** (stack alignment, caller/callee-saved
registers, calling conventions) which is the honest depth surface; the test's regex
matches memory/register/ABI as the concurrency-equivalent required section.

Grouping rationale: ONE research pass because all four are legacy/native with a **manual
memory + ABI + fixed-format-legacy** spine and inherit **buffer/array-overflow CWE
classes** (CWE-787 out-of-bounds write, CWE-125 out-of-bounds read, CWE-121 stack-based
overflow). Objective-C pulls in ARC retain cycles (memory-management footguns) on the
Apple platform. Disjoint from the modern-systems slice (s5) by file — those are modern
GC/allocator-era, these are legacy/ABI-era.

### Dependency Graph

```
skills/languages/fortran.md     (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-legacy-native-guides.test.js
skills/languages/assembly.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-legacy-native-guides.test.js
skills/languages/cobol.md       (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-legacy-native-guides.test.js
skills/languages/objectivec.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-legacy-native-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/standard/security claims; extend the existing `Version Gotchas`
section):

#### File: `skills/languages/fortran.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Fortran edits.
- **Memory / Array Footguns** — 1-based + column-major arrays (row-major loop = cache
  thrash), no default bounds checking (**out-of-bounds CWE-125/787**; enable
  `-fcheck=bounds`/`-fcheck=all`), `allocatable` vs pointer aliasing, implicit `SAVE`.
  Name `-fcheck=bounds`, CWE-125.
- **Concurrency / Parallelism** — coarray Fortran (`do concurrent`, `sync all`),
  OpenMP/`!$omp`, MPI; data races in `do concurrent` without `locality` specs. Name
  `do concurrent`, OpenMP.
- **Error Handling Idioms** — `iostat=`/`iomsg=` on I/O, `error stop`, `stat=` on
  `allocate`, no exceptions. Name `iostat`, `error stop`.
- **Security and Dependency Gotchas** — legacy `IMPLICIT` typing bugs (use
  `implicit none`), unchecked array writes = memory corruption (CWE-787), fixed-format
  column truncation. Name `implicit none`, CWE-787.
- **Testing Conventions** — pFUnit / test-drive frameworks, `fpm test` (Fortran Package
  Manager). Name pFUnit, fpm.
- **Version-Specific Gotchas** — EXTEND: Fortran 2018/2023 standard features + gfortran
  support, dated ≥ 2025-01-01, sourced to fortran-lang.org / gcc.gnu.org/fortran.
- **References** — dated source list.

#### File: `skills/languages/assembly.md`
**Action:** MODIFY (extend 5→>5; no-churn) — ISA-specific; name x86-64 / ARM64 explicitly
**Purpose:** Trigger-loaded correction surface for assembly edits.
- **Memory / Register / ABI Footguns** (concurrency-equivalent required section) — stack
  alignment (System V AMD64 16-byte at `call`), caller- vs callee-saved registers,
  red zone, calling-convention mismatch = corruption. Name System V AMD64 ABI, `rsp`.
- **Error Handling Idioms** — checking syscall return in `rax`/`x0`, carry/overflow flags,
  no exceptions (manual error paths). Name syscall return register.
- **Security and Dependency Gotchas** — **stack buffer overflow CWE-121** (no guards
  unless added), missing bounds → out-of-bounds write CWE-787, W^X / NX, ROP-gadget
  awareness; `-z noexecstack`. Name CWE-121, CWE-787.
- **Toolchain / Testing Conventions** — assemble+link (`nasm`/`gas`/`as` + `ld`), `gdb`/
  `objdump -d` disassembly verification, unit-testing via C harness. Name `objdump`.
- **Performance Traps** — pipeline stalls / dependency chains, cache-line alignment,
  branch misprediction, unnecessary memory round-trips vs register use.
- **Version-Specific Gotchas** — EXTEND: ISA/ABI specifics (x86-64 System V vs Windows
  x64, ARM64 AAPCS64) named explicitly, dated ≥ 2025-01-01, sourced to the official ISA/
  ABI docs (developer.arm.com, felixcloutier.com/x86, the psABI).
- **References** — dated source list.

#### File: `skills/languages/cobol.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for COBOL edits.
- **Data / Memory Footguns** (concurrency-equivalent) — `PIC` clause overflow +
  truncation (silent data loss), `REDEFINES` aliasing, `COMP-3` packed-decimal
  mismatches, fixed-length `MOVE` truncation. Name `PIC`, `REDEFINES`, `COMP-3`.
- **Error Handling Idioms** — `FILE STATUS` checks after every I/O, `ON SIZE ERROR`,
  `INVALID KEY`, `SQLCODE` in embedded SQL. Name `FILE STATUS`, `ON SIZE ERROR`.
- **Security and Dependency Gotchas** — embedded-SQL **injection CWE-89** when building
  dynamic SQL from input (use host variables/prepared), buffer truncation, mainframe
  RACF/access concerns. Name CWE-89.
- **Testing Conventions** — GnuCOBOL + cobol-check / unit-test harnesses, coverage tooling.
  Name cobol-check / GnuCOBOL.
- **Performance Traps** — `PERFORM` overhead, table (`OCCURS`) search linear vs `SEARCH
  ALL` (binary), unnecessary `MOVE`s.
- **Version-Specific Gotchas** — EXTEND: COBOL 2014/2023 standard + GnuCOBOL 3.x support,
  dated ≥ 2025-01-01, sourced to the ISO/GnuCOBOL docs (gnu.org/software/gnucobol).
- **References** — dated source list.

#### File: `skills/languages/objectivec.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for Objective-C edits.
- **Memory / ARC Footguns** (concurrency-equivalent covers both) — **ARC retain cycles**
  (strong self-reference in blocks → use `__weak` / `weakSelf`), `strong`/`weak`/`unsafe_
  unretained`, `dealloc` timing, toll-free-bridging CF/NS ownership (`__bridge`/
  `__bridge_transfer`). Name ARC, `__weak`.
- **Concurrency Footguns** — GCD (`dispatch_async`), retain cycles in blocks capturing
  self, main-thread-only UIKit, `@synchronized` cost. Name `dispatch_async`.
- **Error Handling Idioms** — `NSError **` out-param convention (check return BOOL first,
  not the error), `@try`/`@catch` reserved for programmer errors, `nil`-messaging silent
  no-op. Name `NSError`.
- **Security and Dependency Gotchas** — format-string vulnerabilities (**CWE-134** via
  `NSString stringWithFormat:` with user input), unarchiving untrusted data
  (`NSKeyedUnarchiver` → use `requiringSecureCoding`, deserialization CWE-502), CocoaPods/
  SPM pinning. Name CWE-134, CWE-502.
- **Testing Conventions** — XCTest, OCMock, Xcode coverage. Name XCTest.
- **Performance Traps** — autorelease-pool growth in loops (`@autoreleasepool`), message-
  send overhead vs C, `copy` of large collections, KVO overhead.
- **Version-Specific Gotchas** — EXTEND: modern Objective-C (nullability annotations,
  lightweight generics) + Swift-interop bridging, dated ≥ 2025-01-01, sourced to
  developer.apple.com.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-legacy-native-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — fortran, assembly, cobol, objectivec):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — Memory/Concurrency/ABI/Data, Error Handling,
   Security/Dependency, Testing/Toolchain, Performance, Version-specific, References
   (regexes broadened to match ABI/Data/Register/Memory for the concurrency-equivalent).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language concrete identifiers + CWE** — fortran: `-fcheck=bounds` + `CWE-125`;
   assembly: System V AMD64 ABI token + `CWE-121`; cobol: `PIC` + `CWE-89`; objectivec:
   `ARC` + `__weak` + `CWE-134`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (fortran-lang.org, gcc.gnu.org, developer.arm.com,
  felixcloutier.com, gnu.org/software/gnucobol, developer.apple.com, cwe.mitre.org) — no
  secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-legacy-native-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Memory/Security/Testing sections, no CWE tokens, no dated sources).

### Step 9: PREPARE
**WEB-VERIFY every version/standard/security fact at edit time** (hard user rule): Fortran
2018/2023 + gfortran (fortran-lang.org/gcc.gnu.org), x86-64 System V + ARM64 AAPCS64 ABI
(the psABI / developer.arm.com / felixcloutier.com/x86), COBOL 2014/2023 + GnuCOBOL 3.x
(gnu.org/software/gnucobol), modern Objective-C + Apple docs (developer.apple.com),
CWE-121/125/787/134/89/502 pages (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). Omit any niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; each guide names ≥1 CWE (fortran CWE-125/787, assembly CWE-121/787, cobol
CWE-89, objectivec CWE-134/502); assembly names its ISA/ABI explicitly; every version/
standard/security claim carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes fortran/assembly/cobol/objectivec triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s6"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; every version/standard/security claim
sourced with a date ≥ 2025-01-01; assembly ISA/ABI named explicitly; nothing fabricated;
no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Assembly is ISA-specific — a generic guide misleads | Name x86-64 System V + ARM64 AAPCS64 explicitly; every ABI claim scoped to an ISA + dated source | Step 9, Step 11 |
| Fabricated standard/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Sparse dated sources for COBOL/Fortran | Omit-if-no-source rule — omit uncited claims, note absence in audit findings; anchor to ISO standard + GnuCOBOL/gfortran | Step 9, Step 15 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts memory/overflow CWE + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 28 tests, 4 pass, 24 fail

### Step 9: PREPARE
- [x] Install dependencies if needed (none)
- [x] Check prerequisites — web-verified all versions/CWE/ABI sources (2026-07-10)
- [x] Verify dev environment ready
- [x] Create directories/config if needed (none)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (4 guides extended additively)
- [x] Add error handling (Error Handling Idioms section per guide)
- [x] Wire up integration points (H1 headers preserved for skills.json)

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations (dense, one-footgun-per-bullet)
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal — test uses path.join(__dirname, '..'))
- [x] Sanitize outputs
- [x] No secrets in code (public official-domain source URLs only)
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check (eslint exit 0 on the slice test)
- [x] Run slice test (TDD Green) — 28 tests, 28 pass, 0 fail [full suite NOT run per barrier pattern]
- [x] Check coverage (content-grounding substitutes per CU2 convention)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation (References section per guide)
- [x] Decisions Taken Under Ambiguity appended
- [x] Update CHANGELOG if needed (n/a)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

**Retrieval date for all web-verified facts: 2026-07-10.** Barrier-pattern executed:
only the five enumerated files edited; verified ONLY this slice's test (not the full
suite); left UNSTAGED for the caller to commit. Read-fresh honored (all four guides +
c.md depth target + sibling test read off disk at edit time).

### Web-verified facts + sources (all HTTP 200 at 2026-07-10)
- **CWE pages** (all live-checked, HTTP 200): CWE-121 stack overflow, CWE-125 OOB read,
  CWE-787 OOB write, CWE-134 format string, CWE-89 SQL injection, CWE-502 unsafe
  deserialization — https://cwe.mitre.org/data/definitions/{121,125,787,134,89,502}.html
- **Fortran:** `-fcheck=bounds`/`-fcheck=all` confirmed on gfortran Code-Gen-Options
  page; Fortran 2018 (ISO/IEC 1539-1:2018) + Fortran 2023 (ISO/IEC 1539-1:2023) confirmed
  on the GFortranStandards wiki. Sources: fortran-lang.org,
  gcc.gnu.org/onlinedocs/gfortran/Code-Gen-Options.html, gcc.gnu.org/wiki/GFortranStandards.
- **Assembly:** System V x86-64 psABI 16-byte stack alignment + red zone verified from
  the psABI raw source (gitlab.com/x86-psABIs/x86-64-ABI, "16-byte" phrasing present);
  ARM64 AAPCS64 from github.com/ARM-software/abi-aa (200); instruction encodings anchored
  to felixcloutier.com/x86 (200). Windows x64 (no red zone, shadow space) named as the
  contrasting ABI.
- **COBOL:** GnuCOBOL 3.2 confirmed as the current release line via SourceForge
  best_release feed (`gnucobol-3.2`); COBOL standard ISO/IEC 1989:2023 (successor to
  1989:2014) via iso.org/standard/74527.html (200). Sources: gnucobol.sourceforge.io,
  sourceforge.net/projects/gnucobol, iso.org.
- **Objective-C:** ARC ownership rules anchored to clang AutomaticReferenceCounting
  (200); NSSecureCoding / `requiringSecureCoding` anchored to
  developer.apple.com/documentation/foundation/nssecurecoding (200); runtime docs +
  XCTest from developer.apple.com (200).

### Choices made (no stubs, additive-only)
1. **Fortran gained a `## Performance Traps` section** (not enumerated in the plan's
   fortran file-spec, which omitted Performance). The shared content-contract test
   mandates a Performance section for ALL four guides (the plan's Test Plan lists
   Performance in REQUIRED_SECTIONS). Rather than weaken the test contract, I added a
   real, non-padding Performance section (column-major loop order, array temporaries,
   pointer-aliasing vectorization, `-O2/-march=native`) — legitimate Fortran depth.
   This is the correct resolution of the plan's internal tension between the fortran
   file-spec and the shared test contract.
2. **Assembly's concurrency-equivalent section** is `## Memory / Register / ABI Footguns`
   (per the plan's explicit framing) — assembly has no single concurrency model; the
   honest depth surface is calling-convention/ABI/stack-alignment. Every ABI claim is
   scoped to a named ISA (System V AMD64, Windows x64, ARM64 AAPCS64).
3. **No fabricated CVEs.** No specific CVE numbers were invented for any guide — only
   CWE *class* identifiers (verified live against MITRE). Per the omit-if-unverifiable
   rule, no niche version claim without a dated authoritative source was included.
4. **Single-language idiomatic examples only** — no cross-language 7-language BAD/SAFE
   matrix (CU4c single-language carve-out); each fence is in the guide's own language.

### Verification tallies
- Slice test: RED 28 tests / 4 pass / 24 fail → GREEN 28 tests / 28 pass / 0 fail.
- eslint on tests/cu4c-legacy-native-guides.test.js: exit 0.
- Line counts (before → after): fortran 62→155, assembly 61→169, cobol 66→147,
  objectivec 59→159; new test 146 lines.
- Full suite NOT run (barrier pattern); files left UNSTAGED; plan NOT moved.
