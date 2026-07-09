---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s7 — enterprise & domain platform guides (abap, apex, vba, matlab)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/abap.md
  - skills/languages/apex.md
  - skills/languages/vba.md
  - skills/languages/matlab.md
  - tests/cu4c-enterprise-domain-guides.test.js
---

# CU4c s7 — enterprise & domain platform guides (abap · apex · vba · matlab)

> Slice 7 of the CU4c decomposition. De-stub the four **vendor-platform / domain-embedded**
> language guides from the 5-section template floor (confirmed fresh 2026-07-09: each has
> exactly the 5 template sections) into substantive correction surfaces, in ONE coherent
> research pass. Shared research spine: languages bound to a proprietary runtime/platform
> (SAP, Salesforce, Microsoft Office/COM, MathWorks) where the dominant footgun is
> **platform-specific injection + governor/resource limits + macro/trust security**
> rather than general systems concerns. Adds the content-contract test that reads the REAL
> guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every ABAP/Apex/VBA/MATLAB version, CWE identifier, platform-limit figure, date, and
> best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of
> help.sap.com / developer.salesforce.com / learn.microsoft.com / mathworks.com /
> cwe.mitre.org / owasp.org) and carry an inline dated source ≥ 2025-01-01 — never
> invented (hard user rule). **Do NOT invent Salesforce governor-limit numbers or SAP
> release figures** — verify against the vendor docs or OMIT. If no dated authoritative
> source exists for a claim, **OMIT it** and note the absence in the audit findings. The
> content-contract test READS the real files off disk — no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (injection for platform query
languages; macro/deserialization for Office)"**, and **"no audited-SOLID guide is
rewritten (no-churn)"** — for these four files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current platform. Bar = depth-within-language, objectively gated: every required `## `
section names a concrete identifier; every version/security/platform-limit claim carries
a dated source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** all four have exactly 5 `## ` sections today
(confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections ADDED below.
**Concurrency-equivalent framing:** these platform languages have no general threading
model; the corresponding required section covers **platform execution model + governor/
resource limits** (Apex governor limits, ABAP work-process/LUW, VBA single-threaded STA,
MATLAB `parfor`), which is the honest depth surface.

Grouping rationale: ONE research pass because all four are proprietary-platform-bound with
a **platform-injection + resource-limit + trust-boundary** spine — ABAP (SAP, Open SQL
injection, authorization checks), Apex (Salesforce, SOQL/SOSL injection, governor limits),
VBA (Office/COM, macro-security / auto-exec malware class, `Shell` injection), MATLAB
(MathWorks, `eval`/`system` injection, `.mat` load). Disjoint from every other slice by
file and by platform.

### Dependency Graph

```
skills/languages/abap.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-enterprise-domain-guides.test.js
skills/languages/apex.md    (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-enterprise-domain-guides.test.js
skills/languages/vba.md     (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-enterprise-domain-guides.test.js
skills/languages/matlab.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-enterprise-domain-guides.test.js
```

Four disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security/platform-limit claims; extend the existing `Version
Gotchas` section):

#### File: `skills/languages/abap.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for ABAP edits.
- **Platform Execution / Resource Footguns** (concurrency-equivalent) — LUW (Logical Unit
  of Work) + `COMMIT WORK`, work-process/dialog-step timeout, `SELECT` in loops (perf +
  DB load), internal-table memory. Name LUW, `COMMIT WORK`.
- **Error Handling Idioms** — class-based exceptions (`TRY`/`CATCH`/`CLEANUP` +
  `CX_ROOT`), `sy-subrc` checks after statements, `RAISE EXCEPTION`. Name `sy-subrc`,
  `CX_ROOT`.
- **Security and Dependency Gotchas** — **Open SQL / dynamic SQL injection CWE-89** (use
  parameter binding, not concatenation into `SELECT ... WHERE (dynamic)`), missing
  **authorization checks `AUTHORITY-CHECK`** (access-control class), directory traversal
  in `OPEN DATASET`. Name CWE-89, `AUTHORITY-CHECK`.
- **Testing Conventions** — ABAP Unit (`CL_ABAP_UNIT_ASSERT`), ATC (ABAP Test Cockpit),
  Code Inspector. Name ABAP Unit, ATC.
- **Performance Traps** — `SELECT *` vs field list, nested `SELECT` loops (use `FOR ALL
  ENTRIES` / joins), missing secondary keys on internal tables, `INTO TABLE`. Name
  `FOR ALL ENTRIES`.
- **Version-Specific Gotchas** — EXTEND: ABAP for HANA / ABAP Cloud (RAP) + released-API
  restrictions, dated ≥ 2025-01-01, sourced to help.sap.com.
- **References** — dated source list.

#### File: `skills/languages/apex.md`
**Action:** MODIFY (extend 5→>5; no-churn) — do NOT invent governor-limit numbers
**Purpose:** Trigger-loaded correction surface for Apex edits.
- **Governor Limits / Bulkification Footguns** (concurrency-equivalent) — **SOQL/DML
  inside loops** hits governor limits (bulkify: query once, collect, DML once), the
  100-SOQL / 150-DML per-transaction class of limits (**cite the current documented limit
  from developer.salesforce.com — do NOT invent the number**), heap size. Name governor
  limits, bulkification.
- **Error Handling Idioms** — `try`/`catch` + custom exceptions, `Database.SaveResult`
  partial-success handling (`allOrNone`), `addError()` in triggers. Name
  `Database.SaveResult`.
- **Security and Dependency Gotchas** — **SOQL/SOSL injection CWE-89** via string-built
  dynamic queries (use bind variables / `String.escapeSingleQuotes`), CRUD/FLS enforcement
  (`WITH SECURITY_ENFORCED` / `stripInaccessible`), `without sharing` privilege escalation.
  Name CWE-89, `WITH SECURITY_ENFORCED`.
- **Testing Conventions** — mandatory test coverage (Salesforce requires a documented
  minimum for deploy — **cite the current figure from developer.salesforce.com**),
  `@isTest`, `Test.startTest()`/`stopTest()`, `Test.setMock`. Name `@isTest`,
  `Test.startTest`.
- **Performance Traps** — non-bulkified triggers, unindexed SOQL filters, recursive
  triggers, describe calls in loops.
- **Version-Specific Gotchas** — EXTEND: current API version + release (Salesforce
  three-releases-a-year cadence), dated ≥ 2025-01-01, sourced to developer.salesforce.com.
- **References** — dated source list.

#### File: `skills/languages/vba.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for VBA edits.
- **Execution Model Footguns** (concurrency-equivalent) — single-threaded STA, `DoEvents`
  re-entrancy hazard, no true async, blocking UI, application-object lifetime. Name
  `DoEvents`.
- **Error Handling Idioms** — `On Error GoTo` label + `Err` object + `Resume`, `On Error
  Resume Next` swallows silently (anti-pattern), cleanup labels. Name `On Error GoTo`,
  `Err`.
- **Security and Dependency Gotchas** — **auto-executing macros are a malware vector**
  (`Auto_Open`/`Document_Open`; Office blocks macros from the internet by default — Mark
  of the Web), `Shell`/`WScript.Shell` **command injection CWE-78**, unsanitized SQL via
  ADO = **CWE-89**. Name CWE-78, CWE-89, `Auto_Open`.
- **Testing Conventions** — Rubberduck VBA (unit tests + inspections), manual test subs.
  Name Rubberduck.
- **Performance Traps** — `.Select`/`.Activate` per operation (work with ranges directly),
  cell-by-cell loops vs array read/write (`Range.Value` array), screen updating
  (`Application.ScreenUpdating = False`). Name `ScreenUpdating`.
- **Version-Specific Gotchas** — EXTEND: VBA7 (`PtrSafe`/`LongPtr` for 64-bit Office),
  macro-blocking policy changes, dated ≥ 2025-01-01, sourced to learn.microsoft.com.
- **References** — dated source list.

#### File: `skills/languages/matlab.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for MATLAB edits.
- **Vectorization / Parallelism Footguns** (concurrency-equivalent) — loop vs vectorized
  ops (preallocate to avoid array-grow-in-loop O(n²)), `parfor` (Parallel Computing
  Toolbox) closure/broadcast-variable pitfalls, `gpuArray`. Name `parfor`, preallocation.
- **Error Handling Idioms** — `try`/`catch` + `MException`, `error(id, msg)` with
  identifiers, `assert`, `lasterror` deprecated. Name `MException`.
- **Security and Dependency Gotchas** — `eval`/`evalin`/`feval` on untrusted strings =
  **code injection CWE-94**, `system`/`!` shell = **command injection CWE-78**, `load` of
  untrusted `.mat` can execute code paths; toolbox version pinning. Name CWE-94, CWE-78.
- **Testing Conventions** — MATLAB unit test framework (`matlab.unittest`), `runtests`,
  coverage report. Name `matlab.unittest`, `runtests`.
- **Performance Traps** — growing arrays in loops (preallocate with `zeros`), unnecessary
  copies (copy-on-write), `for` over vectorized, `end`+1 growth. Name preallocation.
- **Version-Specific Gotchas** — EXTEND: current MATLAB release (Rxxxx naming) + `string`
  vs `char` array, dated ≥ 2025-01-01, sourced to mathworks.com.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-enterprise-domain-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL four guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — abap, apex, vba, matlab):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — ExecutionModel/GovernorLimits/Parallelism, Error
   Handling, Security/Dependency, Testing, Performance, Version-specific, References
   (regexes broadened to match Governor/Execution/Vectorization for the concurrency-
   equivalent).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language injection CWE + concrete identifiers** — abap: `CWE-89` +
   `AUTHORITY-CHECK`; apex: `CWE-89` + governor/bulkification token; vba: `CWE-78` +
   `Auto_Open`; matlab: `CWE-94` + `parfor`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to four Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (help.sap.com, developer.salesforce.com,
  learn.microsoft.com, mathworks.com, cwe.mitre.org, owasp.org) — no secrets.
- Only the five enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all four guides fresh off disk first. Create `tests/cu4c-enterprise-domain-guides.test.js`
reading the four REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated ExecutionModel/Security/Testing sections, no injection CWE tokens, no dated
sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security/platform-limit fact at edit time** (hard user rule):
ABAP Cloud/RAP + Open SQL (help.sap.com), current Salesforce API version + the documented
governor-limit + test-coverage figures (developer.salesforce.com — **do NOT invent
numbers**), VBA7 `PtrSafe` + macro-blocking policy (learn.microsoft.com), current MATLAB
release (mathworks.com), CWE-89/78/94 pages (cwe.mitre.org). Capture each source URL +
retrieval date (≥ 2025-01-01). Omit any platform figure you cannot verify; record for Step 15.

### Step 10: IMPLEMENT
Extend the four guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, four files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; each guide names its platform-injection CWE (abap/apex CWE-89, vba CWE-78/89,
matlab CWE-94/78); any Salesforce governor/coverage number is the verified vendor figure
(or omitted); every version/security claim carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the five enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes abap/apex/vba/matlab triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s7"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims (esp. any unverifiable Salesforce figure), in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the five enumerated files edited; no fabricated governor-limit/SAP/release
number (every platform figure traceable to a vendor URL or omitted); every version/security
claim sourced with a date ≥ 2025-01-01; no cross-language BAD/SAFE examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Inventing Salesforce governor-limit / SAP release numbers | Cite the exact documented figure from the vendor doc or OMIT; test asserts a governor/bulkification token, not a specific number | Step 9, Step 11, Step 16 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official vendor source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| Vendor docs behind login / sparse dated sources | Omit-if-no-source rule — omit uncited claims, note absence in audit findings | Step 9, Step 15 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts platform-injection CWE + concrete identifiers, not just section count | Step 11, Step 14 |
| Section-rewrite churn | Additive only; existing 5 sections preserved verbatim | Step 10, Step 11 |
