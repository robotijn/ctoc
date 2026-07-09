---
approved_by: human
approved_at: 2026-07-08T20:52:40.367Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU2 s4 — managed-VM language guides (java, csharp)"
type: implementation
parent_plan: CU2-tier1-languages
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - skills/languages/java.md
  - skills/languages/csharp.md
  - tests/cu2-managed-vm-guides.test.js
---

# CU2 s4 — managed-VM language guides (java · csharp)

> Slice 4 of the CU2 decomposition. De-stub the two managed-runtime (JVM / .NET CLR)
> language guides from the 5-section template floor into substantive correction
> surfaces, in ONE coherent research pass — both share the **deserialization CVE
> class (CWE-502)**, both have a modern-concurrency story (Java virtual threads /
> C# async+ConfigureAwait), both have a null-safety story (Optional / nullable
> reference types), and both have a lockfile/audit supply-chain story (Maven+Gradle
> / NuGet). Adds the content-contract test that reads the REAL guide files off disk
> with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every CWE identifier, Java/.NET/C# version number, date, and best-practice claim
> MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of cwe.mitre.org /
> OWASP / dev.java / oracle.com / learn.microsoft.com / dotnet release notes) and
> carry an inline dated source ≥ 2025-01-01 — never invented (hard user rule). The
> CWE-502 entry links cwe.mitre.org or OWASP. The content-contract test READS the
> real files off disk and asserts substantive structure — no mocks, no fakes.

Maps to CU2 acceptance criteria: **"each guide exceeds the 5-section floor with
substantive depth"**, **"java.md covers deserialization, virtual threads, and
module system"**, **"csharp.md covers nullable, async, and .NET 9 specifics"**,
**"CVE classes are named for languages with established classes"**, **"all
version-specific and security claims carry dated sources"**, and **"tests stay
green and skills.json mappings remain valid"** — for these two files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule
does NOT apply** (CU2 vision carve-out). Each guide's examples are in ITS OWN
language (Java / C#), correct + idiomatic + current-version. Bar =
depth-within-language, objectively gated: every required `## ` section names a
concrete identifier (version number, CWE ID, or API/function name); every
version/security claim carries an inline dated source ≥ 2025-01-01.

Java and .NET are (with C/C++) the mandated CVE-class languages: the AC requires
the deserialization entry to name **CWE-502** with a cwe.mitre.org or OWASP
reference and the impact pattern.

**No-churn (extend, never overwrite):** java.md and csharp.md each have exactly 5
solid `## ` sections today (confirmed by reading fresh 2026-07-09 — including
java.md's virtual-threads/records/pattern-matching corrections and csharp.md's
`.Result`/`async void`/nullable corrections). Preserved verbatim; new sections ADDED.

Grouping rationale: java + csharp are one research pass because CWE-502
deserialization, the null-safety idiom, the modern-concurrency model, and the
package-audit tooling are the SAME classes of concern on two managed runtimes —
researching them together keeps the CWE-502 framing consistent. Disjoint from the
dynamic/web, systems, and native-unsafe slices.

### Dependency Graph

```
skills/languages/java.md    (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-managed-vm-guides.test.js
skills/languages/csharp.md  (MODIFY: extend 5→>5 sections)  <--tested-by-- tests/cu2-managed-vm-guides.test.js
```

Two disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s2/s3 — different files, parallel-safe).

### File Specifications

#### File: `skills/languages/java.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Java edits.
**Change Type:** substantive content addition

Add these `## ` sections (each names a concrete identifier + dated source ≥
2025-01-01 for version/security claims):
- **Security and Dependency Gotchas** — **Java deserialization (CWE-502)** with
  its impact pattern and a cwe.mitre.org or OWASP reference; native serialization
  filters (`ObjectInputFilter`); Maven/Gradle dependency locking + `dependency:tree`;
  a log4shell-class supply-chain note. Name CWE-502.
- **Concurrency Footguns** — **virtual threads** (Java 21 Project Loom) pitfalls:
  pinning on `synchronized` blocks / native frames, thread-per-task vs pooling,
  `ScopedValue` vs `ThreadLocal`; structured concurrency; `-Djdk.tracePinnedThreads`.
- **Error Handling Idioms** — checked vs unchecked exception design, `Optional<T>`
  vs returning null, try-with-resources, not swallowing `InterruptedException`.
- **Module & Language Gotchas** — Java Platform Module System (JPMS) encapsulation
  errors (`--add-opens`, `IllegalAccessError`), records / sealed classes / pattern
  matching gotchas — name the Java version that finalized each (verified).
- **Testing Conventions** — JUnit 5, Testcontainers, `assertThrows`.
- **Version-Specific Gotchas** — extend with dated, sourced items for the current
  LTS + latest Java release verified at edit time (name the current LTS and the
  latest release; note removed/deprecated APIs). Each dated ≥ 2025-01-01, sourced to
  dev.java / openjdk.org / oracle.com release notes.
- **References** — dated source list (cwe.mitre.org / OWASP + JDK release notes).

#### File: `skills/languages/csharp.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for C# edits.
**Change Type:** substantive content addition

Add sections covering: **Security and Dependency Gotchas** — deserialization risk
(name **CWE-502**; `System.Text.Json` vs `Newtonsoft.Json` / `BinaryFormatter`
removal divergence, with a cwe.mitre.org or Microsoft/OWASP reference), NuGet
audit (`dotnet list package --vulnerable` / `<NuGetAudit>`); **Concurrency
Footguns** — `async void` anti-pattern, `.Result`/`.Wait()` deadlock,
`ConfigureAwait(false)` in library vs application code, `CancellationToken`
propagation; **Nullable Reference Types** — annotation gaps, `!` null-forgiving
overuse, `<Nullable>enable</Nullable>`; **Performance Traps** — `Span<T>`/`Memory<T>`
common misuse, LINQ multiple enumeration (`.ToList()` once), struct copying;
**Testing Conventions** — xUnit, `Assert.ThrowsAsync`; **Version-Specific Gotchas**
— extend with dated, sourced items naming the current **.NET** LTS + latest release
and the current C# language version (verified at edit time — e.g. the collection-
expression binding changes, `field` keyword status). Each dated ≥ 2025-01-01,
sourced to learn.microsoft.com / dotnet release notes; **References** — dated list.

### Test Plan

#### Tests: `tests/cu2-managed-vm-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL java.md / csharp.md off disk via `fs.readFileSync`
(mirroring `tests/skill-regulatory-citations.test.js`). No mocks, no fakes.

Content-contract test cases:
1. **Exceeds the floor** — `> 5` `## ` sections per file.
2. **Required sections present** — Security/Dependency, Concurrency, Error Handling
   (java) / Nullable (csharp), Testing, Version-specific, References.
3. **CWE-502 named** — assert the literal `CWE-502` token in BOTH files (mandated
   deserialization CVE class).
4. **cwe.mitre.org or OWASP reference present** — assert `cwe.mitre.org` or `owasp.org`
   URL in each file.
5. **Concrete identifiers present** — java: `virtual thread` (or `Loom`) + `JPMS`
   (or `--add-opens`) + a Java version token; csharp: `ConfigureAwait` + `async void`
   + `Nullable` + a `.NET` version token.
6. **Dated source present** — at least one date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND
   at least one `http` source URL per file.
7. **H1 intact** — `# Java CTO` / `# C# CTO` still present (skills.json unbroken).

**Coverage note:** content-grounding — content-contract assertions substitute for
line/branch coverage (CU1 s4 convention).

### Security Review

- Content-only edits to two Markdown guides + one test reading them; no runtime
  path, no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- Source URLs are public official domains (cwe.mitre.org, owasp.org, dev.java,
  openjdk.org, oracle.com, learn.microsoft.com) — no secrets.
- Only the three enumerated files touched.

## Execution Plan

### Step 8: TEST
Confirm baseline green. Create `tests/cu2-managed-vm-guides.test.js` reading the
two REAL files; run it — MUST be RED now (each file has exactly 5 `## ` sections,
no `CWE-502`, no dedicated Security/Testing sections, no dated sources). Read both
current files fresh off disk first (note existing virtual-thread / nullable content
to preserve).

### Step 9: PREPARE
**WEB-VERIFY every CWE/version fact at edit time** (hard user rule): retrieve
CWE-502 definition + impact pattern from cwe.mitre.org (+ OWASP deserialization
cheat sheet); confirm current Java LTS + latest release and virtual-thread pinning
facts (dev.java / openjdk.org); confirm current .NET LTS + latest release and C#
language version + `BinaryFormatter` removal + NuGet audit facts
(learn.microsoft.com / dotnet release notes). Capture each source URL + retrieval
date (≥ 2025-01-01).

### Step 10: IMPLEMENT
Extend java.md and csharp.md with the added sections (CWE-502 with impact pattern,
idiomatic per-language examples, dated sources). Additive only — existing 5 sections
stay verbatim. ONE step, two files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections; both name CWE-502 with impact pattern +
cwe.mitre.org/OWASP; java names virtual threads + JPMS; csharp names ConfigureAwait
+ async void + nullable; every version/security claim carries an inline dated source
≥ 2025-01-01; the Java/.NET versions are the web-verified current ones; diff additive.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — CWE-502 names the impact pattern, not
just the number; no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm cwe.mitre.org/OWASP + official JDK/.NET
source URLs; only the three enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN (CWE-502 in both files,
identifiers present). Confirm `.ctoc/skills.json` still indexes java/csharp triggers
(H1/frontmatter intact). `tests/readme-numbers.test.js` still passes (count
unchanged).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU2-s4"). **This is the last CU2 slice → run the audit-ledger completeness
check:** diff the in-scope 9-file list against the union of UPGRADED+SOLID-SKIPPED
records across CU2-s1..s4; confirm the diff is empty (no file silently omitted).
Record each web-verified fact + source URL + retrieval date in `## Decisions Taken
Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the three enumerated files edited; CWE-502 named in both with impact
pattern + authoritative reference; every version/security claim sourced with a date
≥ 2025-01-01; nothing fabricated (Java/.NET versions verified); no cross-language
BAD/SAFE examples added; the 9-file completeness check passes; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale Java/.NET version gives false confidence | Web-verify current LTS + latest at edit time; inline dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated CWE/version (hard user rule) | CWE-502 linked to cwe.mitre.org/OWASP; every version fact carries an official source URL; test asserts CWE-502 + reference + dated source per file | Step 9, Step 14, Step 16 |
| Missing CWE-502 (AC failure) | Test asserts literal `CWE-502` token in BOTH files | Step 14 |
| Frontmatter corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Silent file omission (completeness AC) | s4 (last slice) runs the 9-file completeness diff against the ledger before FINAL-REVIEW | Step 15 |
| Padding without specificity | Objective gate — test asserts CWE-502 + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |
