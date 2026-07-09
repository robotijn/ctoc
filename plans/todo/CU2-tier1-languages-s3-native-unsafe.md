---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T14:24:27.928Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.367Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU2 s3 — native/unsafe language guides (c, cpp)"
type: implementation
parent_plan: CU2-tier1-languages
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/languages/c.md
  - skills/languages/cpp.md
  - tests/cu2-native-unsafe-guides.test.js
---

# CU2 s3 — native/unsafe language guides (c · cpp)

> Slice 3 of the CU2 decomposition. De-stub the two native/manual-memory language
> guides from the 5-section template floor into substantive correction surfaces,
> in ONE coherent research pass — the memory-safety CWE classes are the shared
> research spine (buffer overflow CWE-121/CWE-122, use-after-free CWE-416, format
> string CWE-134, integer overflow CWE-190, plus C++ UB classes), and the sanitizer
> story (ASan/UBSan) is common to both. Adds the content-contract test that reads
> the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every CWE identifier, standard version (C17/C23, C++20/23/26), sanitizer flag, and
> best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of
> cwe.mitre.org, the ISO/compiler docs, clang/gcc sanitizer docs) and carry an inline
> dated source ≥ 2025-01-01 — never invented (hard user rule). Each CWE reference
> links to cwe.mitre.org or an authoritative source. The content-contract test READS
> the real files off disk and asserts substantive structure — no mocks, no fakes.

Maps to CU2 acceptance criteria: **"each guide exceeds the 5-section floor with
substantive depth"**, **"c.md covers memory-safety CVE classes with mitigations"**,
**"cpp.md covers modern C++20/23 idioms and memory safety"**, **"CVE classes are
named for languages with established classes"**, **"all version-specific and
security claims carry dated sources"**, and **"tests stay green and skills.json
mappings remain valid"** — for these two files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule
does NOT apply** (CU2 vision carve-out). Each guide's examples are in ITS OWN
language (C / C++), correct + idiomatic + current-standard. Bar =
depth-within-language, objectively gated: every required `## ` section names a
concrete identifier (standard version, CWE ID, sanitizer flag, or API/function
name); every version/security claim carries an inline dated source ≥ 2025-01-01.

C and C++ are the **strongest CVE-class case in the whole CU2 set** — the AC
mandates named CWE identifiers with cwe.mitre.org references and the impact pattern
(not just the number). This slice must name at minimum: CWE-121 (stack buffer
overflow), CWE-122 (heap buffer overflow), CWE-416 (use-after-free), CWE-134
(format string), CWE-190 (integer overflow) for C; plus C++-specific UB classes
(strict aliasing, uninitialized read, iterator invalidation, shared_ptr cycle).

**No-churn (extend, never overwrite):** c.md and cpp.md each have exactly 5 solid
`## ` sections today (confirmed by reading fresh 2026-07-09 — including c.md's
existing good `snprintf`/`gets`/`memset_explicit` corrections and cpp.md's
`make_unique`/`std::expected` corrections). Preserved verbatim; new sections ADDED.

Grouping rationale: c + cpp are one research pass because the memory-safety CWE
taxonomy + sanitizer toolchain (AddressSanitizer, UndefinedBehaviorSanitizer,
`-fsanitize=`) are shared, and C++ UB is a superset of C UB — researching them
together avoids divergent CWE framing. Disjoint from the dynamic/web and managed-VM
slices.

### Dependency Graph

```
skills/languages/c.md    (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-native-unsafe-guides.test.js
skills/languages/cpp.md  (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-native-unsafe-guides.test.js
```

Two disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s2/s4 — different files, parallel-safe).

### File Specifications

#### File: `skills/languages/c.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for C edits.
**Change Type:** substantive content addition

Add these `## ` sections (each names a concrete identifier + dated source ≥
2025-01-01 for version/security claims; each CWE links cwe.mitre.org):
- **Memory-Safety CVE Classes** — name **CWE-121** (stack buffer overflow),
  **CWE-122** (heap buffer overflow), **CWE-416** (use-after-free), **CWE-134**
  (format string), **CWE-190** (integer overflow), each with its impact pattern
  and a cwe.mitre.org reference (dated). Safe alternatives: `strncpy`/`strlcpy`
  traps, `snprintf` over `sprintf`, bounds checks, `calloc` overflow check.
- **Sanitizers & Static Analysis** — AddressSanitizer (`-fsanitize=address`),
  UBSan (`-fsanitize=undefined`) invocation flags, `clang-tidy`, `-Wall -Wextra
  -Werror`, fuzzing (OSS-Fuzz). Name the flags.
- **Concurrency Footguns** — data races, `volatile` ≠ atomic, `<stdatomic.h>`,
  ThreadSanitizer (`-fsanitize=thread`), signal-safety (`sigaction` not `signal`,
  async-signal-safe functions).
- **Error Handling Idioms** — errno discipline, check every `malloc`/`fopen`
  return, no silent truncation, `-1`/NULL sentinel conventions.
- **Version-Specific Gotchas** — extend the existing section with dated, sourced
  C17 vs C23 items (verify which is the current default in the current GCC/Clang at
  edit time — do NOT hardcode a compiler version without verifying), `memset_explicit`,
  `ckd_add` overflow-checked arithmetic. Each dated ≥ 2025-01-01.
- **References** — dated source list (cwe.mitre.org + ISO/compiler docs + sanitizer docs).

#### File: `skills/languages/cpp.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for C++ edits.
**Change Type:** substantive content addition

Add sections covering: **Undefined Behavior classes beyond C** (strict aliasing,
uninitialized reads, signed overflow, dangling reference) with the C++-relevant CWE
where applicable (e.g. CWE-416 use-after-free via dangling refs) and a
cwe.mitre.org reference; **RAII vs resource-leak scenarios**; **smart-pointer
misuse** (`shared_ptr` reference cycles → leak, `weak_ptr` break, dangling
`unique_ptr` release); **iterator invalidation rules** (which container ops
invalidate); **C++20/23 feature footguns** — name **C++20** and **C++23** standard
tokens (coroutine lifetime pitfalls, module `import std;` availability caveats,
concepts subtleties) verified against the current compiler support at edit time;
sanitizers/static analysis (same ASan/UBSan flags as c.md, cross-referenced);
testing (Catch2 / GoogleTest); performance (`std::endl` flush, move semantics,
`noexcept` on moves). Each version/security claim dated ≥ 2025-01-01, sourced to
cwe.mitre.org / en.cppreference.com / isocpp.org / compiler docs.

### Test Plan

#### Tests: `tests/cu2-native-unsafe-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL c.md / cpp.md off disk via `fs.readFileSync`
(mirroring `tests/skill-regulatory-citations.test.js`). No mocks, no fakes.

Content-contract test cases:
1. **Exceeds the floor** — `> 5` `## ` sections per file.
2. **Required sections present** — Memory-safety/CVE, Sanitizers/Static Analysis,
   Concurrency (c) / UB classes (cpp), Error Handling, Version-specific, References.
3. **CWE identifiers named** — c.md asserts **all five**: `CWE-121`, `CWE-122`,
   `CWE-416`, `CWE-134`, `CWE-190`; cpp.md asserts at least one CWE token (e.g.
   `CWE-416`) plus the named UB classes (`strict aliasing`, `iterator invalidation`).
4. **cwe.mitre.org reference present** — assert `cwe.mitre.org` URL in each file.
5. **Sanitizer flags named** — assert `-fsanitize=address` (or `AddressSanitizer`)
   and `-fsanitize=undefined` (or `UBSan`) in each file.
6. **Standard version tokens** — c.md: `C17`/`C23`; cpp.md: `C++20` and `C++23`.
7. **Dated source present** — at least one date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND
   at least one `http` source URL per file.
8. **H1 intact** — `# C CTO` / `# C++ CTO` still present (skills.json unbroken).

**Coverage note:** content-grounding — content-contract assertions substitute for
line/branch coverage (CU1 s4 convention).

### Security Review

- Content-only edits to two Markdown guides + one test reading them; no runtime
  path, no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- Source URLs are public official domains (cwe.mitre.org, en.cppreference.com,
  isocpp.org, clang.llvm.org, gcc.gnu.org) — no secrets.
- Only the three enumerated files touched.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Create `tests/cu2-native-unsafe-guides.test.js` reading the
two REAL files; run it — MUST be RED now (each file has exactly 5 `## ` sections,
no CWE identifiers, no sanitizer-flag section, no dated sources). Read both current
files fresh off disk first (note c.md already has good `snprintf`/`gets` content to
preserve).

### Step 9: PREPARE
**WEB-VERIFY every CWE/version/sanitizer fact at edit time** (hard user rule):
retrieve CWE-121/122/416/134/190 definitions + impact patterns from cwe.mitre.org;
confirm the current C standard default in the current GCC/Clang (gcc.gnu.org /
clang.llvm.org) — verify, do not assume a compiler version; confirm C++20/23 feature
support and `import std;` caveats (en.cppreference.com / isocpp.org); confirm ASan/
UBSan/TSan flags (clang.llvm.org sanitizer docs). Capture each source URL +
retrieval date (≥ 2025-01-01).

### Step 10: IMPLEMENT
Extend c.md and cpp.md with the added sections (named CWEs with impact patterns,
idiomatic per-language examples, sanitizer flags, dated sources). Additive only —
existing 5 sections stay verbatim (including c.md's existing snprintf/gets
corrections). ONE step, two files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections; c.md names all five required CWEs with impact
patterns + cwe.mitre.org; cpp.md names its CWE + UB classes; sanitizer flags
present; every version/security claim carries an inline dated source ≥ 2025-01-01;
diff additive.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — CWE entries name the impact pattern,
not just the number; no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm cwe.mitre.org + official compiler/ISO
source URLs; only the three enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN (all five C CWEs
asserted present, sanitizer flags present, standard tokens present). Confirm
`.ctoc/skills.json` still indexes c/cpp triggers (H1/frontmatter intact).
`tests/readme-numbers.test.js` still passes (count unchanged).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU2-s3") so the completeness check has no silent omissions. Record each
web-verified CWE/version/sanitizer fact + source URL + retrieval date in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the three enumerated files edited; all required CWEs named with impact
patterns + cwe.mitre.org references; every version/security claim sourced with a
date ≥ 2025-01-01; nothing fabricated (compiler-default C standard and C++ feature
support verified, not assumed); no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Wrong compiler-default standard / feature-support claim | Web-verify current GCC/Clang default + C++ feature support at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated CWE/version (hard user rule) | Every CWE linked to cwe.mitre.org; every version fact carries an official source URL; test asserts the five CWE tokens + cwe.mitre.org + dated source | Step 9, Step 14, Step 16 |
| Missing a required CWE (AC failure) | Test asserts all five C CWEs (121/122/416/134/190) present as literal tokens | Step 14 |
| Frontmatter corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts CWE tokens, sanitizer flags, standard versions, not just section count | Step 11, Step 14 |
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
