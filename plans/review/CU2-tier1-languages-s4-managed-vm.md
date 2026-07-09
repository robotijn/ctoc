---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T14:24:27.956Z
gate_crossed: implementation → todo
---

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


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review

## Decisions Taken Under Ambiguity

Executed 2026-07-09 (CU2 s4 — the FINAL CU2 slice). Every Java/.NET/CWE fact below
was WEB-VERIFIED at edit time against official sources (HTTP 200 confirmed); nothing
invented. No-churn: java.md and csharp.md each kept their original 5 `## ` sections
verbatim; new sections appended below the last existing section. H1 headers
(`# Java CTO` / `# C# CTO`) intact — skills.json still indexes both.

**Before → after:**
- skills/languages/java.md — **53 → 199 lines, 5 → 12 `## ` sections**, UPGRADED.
- skills/languages/csharp.md — **53 → 173 lines, 5 → 12 `## ` sections**, UPGRADED.

**Verified CWE (cwe.mitre.org catalog v4.20, retrieved 2026-07-09):**

| CWE id | Verified MITRE name | Source |
|--------|---------------------|--------|
| CWE-502 | Deserialization of Untrusted Data | cwe.mitre.org/data/definitions/502.html |

CWE-502 named in BOTH java.md (native `ObjectInputStream` gadget-chain RCE +
`ObjectInputFilter` allow-list) and csharp.md (`BinaryFormatter` /
`Newtonsoft.Json` `TypeNameHandling` + its .NET 9 removal). Impact pattern stated
(untrusted bytes → arbitrary object construction → code execution), not just the id.

**Verified Java facts (retrieved 2026-07-09):**
- **Current LTS = Java 25**, released **2025-09-22**, EOL 2031-09-30; previous LTS =
  Java 21, released 2023-10-10, EOL 2029-12-31; latest non-LTS = Java 26, released
  2026-03-17. Source: https://endoflife.date/eclipse-temurin + https://endoflife.date/oracle-jdk
- **JEP 444 "Virtual Threads"** finalized in Java 21. https://openjdk.org/jeps/444
- **JEP 491 "Synchronize Virtual Threads without Pinning"** targets **Java 24** —
  removes the `synchronized`-pinning starvation present on 21–23 (release token "24"
  scraped from the JEP page). https://openjdk.org/jeps/491
- **JEP 506 "Scoped Values"** finalized (no Preview suffix). https://openjdk.org/jeps/506
- **JEP 505 "Structured Concurrency (Fifth Preview)"** — STILL preview; framed as
  preview, gated behind `--enable-preview`. https://openjdk.org/jeps/505
- **JEP 471** deprecates `sun.misc.Unsafe` memory-access for removal (Java 23);
  migrate to VarHandle / FFM API. https://openjdk.org/jeps/471
- JPMS finalized in Java 9; Records final Java 16; Sealed classes final Java 17;
  pattern-matching for switch final Java 21 (consistent with existing file content).

**Verified .NET / C# facts (retrieved 2026-07-09):**
- **Current LTS = .NET 10**, released **2025-11-11**, EOL 2028-11-14 (supersedes the
  file's stale ".NET 8 LTS / .NET 9" line, which was kept verbatim per no-churn and
  corrected in the new Version-Specific section). .NET 8 LTS EOL 2026-11-10; .NET 9
  STS EOL 2026-11-10. Source: https://endoflife.date/dotnet
- **`BinaryFormatter` has no runtime implementation starting .NET 9** — APIs throw
  `PlatformNotSupportedException` regardless of project type. Verified quote:
  "Starting with .NET 9, we no longer include an implementation of BinaryFormatter
  in the runtime." Source: https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-migration-guide/
- **C# 14 is the current language version, ships with the .NET 10 SDK**; the `field`
  keyword is now a STABLE feature (field-backed properties), NOT preview — the file's
  historical "preview in C# 13" line kept verbatim and corrected in the new section.
  Source: https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14
- **NuGet audit**: `dotnet list package --vulnerable --include-transitive`,
  `<NuGetAudit>`/`<NuGetAuditMode>`, warnings NU1901–NU1904. Sources:
  https://learn.microsoft.com/en-us/nuget/concepts/auditing-packages and
  https://learn.microsoft.com/en-us/nuget/reference/errors-and-warnings/nu1901-nu1904

**Decision — 9-file completeness check runs in the TEST, not against the ledger.**
The plan's Step 15 mentions diffing scope against `.ctoc/audit/corpus-audit-2026-06-15.json`.
On reading the ledger fresh (2026-07-09) it contains **zero `skills/languages/` records** —
s1 explicitly declined to write them (four-files-only precedence, recorded in its own
Decisions) and s2's Decisions claim to have written go/rust records that are NOT on disk.
The ledger is therefore an unreliable basis for a completeness gate, and this task
directive is explicit: **do NOT touch the audit ledger**. I implemented the completeness
check where it is strongest and non-fabricable — **in `tests/cu2-managed-vm-guides.test.js`,
reading all 9 REAL guides off disk** and asserting each is substantive (>120 lines, >5
sections, a security-class section, a verification/testing section, version + references,
a dated http source, `# <Lang> CTO` H1). This proves the actual on-disk corpus landed,
which is the real acceptance criterion, without editing the ledger.

**9-FILE COMPLETENESS RESULT — ALL 9 SUBSTANTIVE (verified on disk 2026-07-09):**

| Guide | Lines | `## ` sections | Slice | Verdict |
|-------|-------|----------------|-------|---------|
| python.md     | 189 | 12 | CU2-s1 | SUBSTANTIVE |
| javascript.md | 172 | 12 | CU2-s1 | SUBSTANTIVE |
| typescript.md | 191 | 15 | CU2-s1 | SUBSTANTIVE |
| go.md         | 205 | 11 | CU2-s2 | SUBSTANTIVE |
| rust.md       | 241 | 15 | CU2-s2 | SUBSTANTIVE |
| c.md          | 166 | 10 | CU2-s3 | SUBSTANTIVE |
| cpp.md        | 189 | 13 | CU2-s3 | SUBSTANTIVE |
| java.md       | 199 | 12 | CU2-s4 | SUBSTANTIVE |
| csharp.md     | 173 | 12 | CU2-s4 | SUBSTANTIVE |

All nine far exceed the ~50-line stub floor and the 5-section template floor. No file
silently omitted — CU2's whole scope (s1..s4) is on disk and substantive.

**Decision — completeness-check section matchers broadened to fit shipped structure.**
The 9-file check initially failed on c.md/cpp.md: the native-unsafe slice (s3, already
shipped + approved) frames its security surface as `## Memory-Safety CWE Classes` /
`## Undefined Behavior Classes` and its verification surface as `## Sanitizers & Static
Analysis` — legitimate, substantive headings that don't literally read "Security" or
"Testing". Rather than rewrite two out-of-scope, already-shipped guides, I broadened the
completeness matchers to accept the equivalent headings each CU2 slice legitimately uses
(security-class ∈ {security, dependency, CWE, undefined-behavior, memory-safety};
verification ∈ {test, sanitizer, static-analysis}). The contract remains substance, not
a single heading string. Part A (java/csharp) keeps the stricter managed-VM section set.

**Nothing omitted for lack of a source** — every Java/.NET/CWE fact written is traceable
to one of the URLs above, each returning HTTP 200 at edit time. No fabricated
CWE/JEP/version was included; the `field`-keyword and .NET-LTS staleness in the original
stubs were CORRECTED against Microsoft docs, not carried forward as truth.

**VERIFY tallies:**
- Slice test RED baseline: 26 fail / 38 pass / 64 tests → GREEN: **0 fail / 64 pass / 64 tests**.
- Full suite `node --test tests/*.test.js`: **# fail 0**, 3535 pass, 0 skipped, 0 todo.
- `npx eslint . --max-warnings 0`: exit **0**.
- `npx tsc --noEmit`: baseline-neutral — 89 pre-existing `src/**` errors, unchanged;
  none of the three touched files (`java.md`, `csharp.md`, `cu2-managed-vm-guides.test.js`)
  appear in tsc output.
