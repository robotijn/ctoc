---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T15:53:09.563Z
gate_crossed: implementation → todo
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:52:40.393Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU3 s4 — data framework guides (pandas, numpy, prisma)"
type: implementation
parent_plan: CU3-tier1-frameworks
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - skills/frameworks/data/pandas.md
  - skills/frameworks/data/numpy.md
  - skills/frameworks/data/prisma.md
  - tests/cu3-data-guides.test.js
---

# CU3 s4 — data framework guides (pandas · numpy · prisma)

> Slice 4 of the CU3 decomposition. De-stub the three data-layer framework guides
> into substantive correction surfaces in ONE coherent research pass. Grouping is
> "the data tier": pandas + numpy share the silent-data-correctness footgun family
> (view/copy semantics, dtype promotion, broadcasting), and prisma is the
> data-access/ORM footgun family (N+1, SQL injection, migration safety) — all three
> are "getting data right" and are researched/written together. Adds the
> content-contract test that reads the REAL guide files off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every pandas/numpy/prisma version claim, CWE identifier, date, and best-practice
> claim MUST be WEB-VERIFIED at edit time (WebSearch or fetch of pandas.pydata.org /
> numpy.org / prisma.io release notes and cwe.mitre.org) and carry an inline dated
> source ≥ 2025-01-01 — never invented. If unverifiable, OMIT. The content-contract
> test READS the real files off disk — no mocks, no stubs, no fakes.

Maps to CU3 acceptance criteria: **"pandas.md and numpy.md cover data-correctness
footguns"**, **"prisma.md covers N+1 queries, migrations, and injection risk"**
(names "CWE-89"), and **"all version-specific and security claims carry dated
sources"** — for these three files.

## Implementation Details

### Architecture Decision

Single-framework reference guides — the **7-language BAD/SAFE cross-coverage rule
does NOT apply**. The bar is **depth-within-framework**, gated objectively:
concrete identifier per section + inline dated source ≥ 2025-01-01 per
version/security claim.

**No-churn (extend, never overwrite):** confirmed fresh 2026-07-09 — pandas.md 5
`## ` sections / 60 lines, numpy.md 5 sections / 51 lines, prisma.md 5 sections /
55 lines. Existing solid content is preserved verbatim; new sections are ADDED.

Grouping rationale: pandas + numpy + prisma are one research pass because (a)
pandas is built on numpy — view/copy and dtype-promotion semantics propagate from
numpy into pandas, so they must be written coherently; (b) all three are the "data
correctness" concern; (c) prisma's raw-query injection and migration safety round
out the data tier's security surface in the same pass, avoiding a separate gate for
one file.

### Dependency Graph

```
skills/frameworks/data/pandas.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-data-guides.test.js
skills/frameworks/data/numpy.md   (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-data-guides.test.js
skills/frameworks/data/prisma.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu3-data-guides.test.js
```

Three disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s2/s3/s5 — different files, parallel-safe).

### File Specifications

#### File: `skills/frameworks/data/pandas.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for pandas edits.
**Change Type:** substantive content addition

Content mandated by the AC "pandas.md ... data-correctness footguns". Add sections
covering: **`SettingWithCopyWarning` / chained-indexing** footgun (`df[a][b] = x`
vs `df.loc[a, b] = x`); **`DataFrame.copy()`** when required vs when wasted;
**memory-efficient dtypes** (`category`, nullable `Int64`, downcasting);
**groupby gotchas** (missing/observed groups, `transform` vs `apply` semantics);
and **pandas 2.x Copy-on-Write** implications (name **"pandas 2.x"**, and the CoW
behavior/mode — WEB-VERIFY the current pandas 2.x version and CoW default at edit
time). Error-handling, testing (pandas testing utils / `assert_frame_equal`), and
performance (vectorization vs `iterrows`, `.apply` cost) sections as applicable.
Carry dated sources ≥ 2025-01-01.

#### File: `skills/frameworks/data/numpy.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for numpy edits.
**Change Type:** substantive content addition

Content mandated by the AC "numpy.md addresses ... data-correctness footguns". Add
sections covering: **broadcasting shape mismatch** (the most common silent bug —
shapes that broadcast when you did not intend); **integer overflow in C-backed
arrays** (fixed-width dtype wraparound, no Python big-int promotion); **view vs
copy semantics** for slices (a slice is a view; mutating it mutates the parent);
**dtype promotion rules** that change results silently (name **"numpy 2.x"** and
the NEP 50 promotion changes — WEB-VERIFY the current numpy 2.x version + NEP 50 at
edit time). Testing (`np.testing.assert_allclose` for float compares, not `==`) and
performance (vectorization, `dtype` selection, `out=` to avoid allocation) sections.
Carry dated sources ≥ 2025-01-01.

#### File: `skills/frameworks/data/prisma.md`
**Action:** MODIFY (extend; no-churn on existing 5)
**Purpose:** Trigger-loaded correction surface for Prisma edits.
**Change Type:** substantive content addition

Content mandated by the AC "prisma.md covers N+1 queries, migrations, and injection
risk". Add sections covering: **N+1 query detection** (missing `include`/`select`,
per-row lazy loading in a loop → use a single `include`/`findMany`); **raw-query SQL
injection** (`$queryRawUnsafe` / string-interpolated `$queryRaw` template vs the
parameterized tagged-template form — name **CWE-89** with an authoritative
cwe.mitre.org source); **migration safety in production** (lock-wait on
`ALTER TABLE`, destructive column drops, `prisma migrate deploy` vs `dev`);
**Prisma Client in serverless** (connection-pool exhaustion, singleton client
pattern, `?connection_limit`); and **type-safety gaps** with `$queryRaw` without a
type parameter. Name the applicable Prisma version (WEB-VERIFY current at edit time)
on version-specific claims. Carry dated sources ≥ 2025-01-01.

### Test Plan

#### Tests: `tests/cu3-data-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`
(mirroring `tests/cu2-dynamic-web-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — pandas, numpy, prisma):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Required sections present** — Error Handling, Security/Dependency (or the
   framework-specific footgun section), Testing, Performance, Version-specific,
   References (case-insensitive heading regexes).
3. **Concrete identifiers present** — pandas: `SettingWithCopyWarning` AND
   `pandas 2` (version token); numpy: `broadcasting` AND `numpy 2` (version token);
   prisma: `$queryRaw` (or `include`) AND N+1 mention.
4. **CWE named in prisma** — assert a `CWE-89` token in prisma.md (the SQL
   injection class).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `http`
   source URL per file.
6. **Frontmatter/H1 intact** — original `# <Framework> CTO` H1 still present.

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage.

### Security Review

- Content-only edits to three Markdown guides + one test file reading them; no
  runtime code path, no user input handling, no path traversal surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- All added source URLs are public official domains (pandas.pydata.org, numpy.org,
  prisma.io, cwe.mitre.org) — no secrets. No DB credentials in any example.
- Only the four enumerated files are touched.

## Execution Plan

### Step 8: TEST
Read all three current files fresh off disk first. Create
`tests/cu3-data-guides.test.js` reading the three REAL files; run it — it MUST be
RED now (5 `## ` sections each; no SettingWithCopy/broadcasting/N+1 sections; no
`CWE-89` token in prisma; no dated sources), proving the checks test something real.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current
pandas 2.x release + Copy-on-Write default (pandas.pydata.org); current numpy 2.x
release + NEP 50 promotion rules (numpy.org / numpy.org/neps); current Prisma
release + raw-query/injection guidance (prisma.io docs); CWE-89 "SQL Injection"
(cwe.mitre.org). Capture each source URL + retrieval date (≥ 2025-01-01). OMIT
anything unverifiable.

### Step 10: IMPLEMENT
Extend the three guides with the added sections (real footguns, real idiomatic
per-framework examples, dated sources). Additive only — existing 5 sections stay
verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections; every section names a concrete identifier;
every version/security claim carries an inline dated source ≥ 2025-01-01;
numpy↔pandas view/copy + dtype guidance is coherent; prisma injection note names
CWE-89 with a source; diff is additive.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding. Each bullet names a
specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm every source URL is an official public
domain; no secrets / no DB credentials in examples; only the four enumerated files
touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; the new slice test GREEN. Confirm
`.ctoc/skills.json` still indexes pandas/numpy/prisma triggers after the edit (H1 +
frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
({path, line_count, section_count, verdict:"UPGRADED", slice:"CU3-s4", note}) — OR,
if the audit file is outside this slice's `files:`, record verdicts in
`## Decisions Taken Under Ambiguity` (CU2 s1 precedent) for the s5 completeness
check to reconcile. Record each web-verified fact + source URL + retrieval date in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim sourced
≥ 2025-01-01; nothing fabricated; "CWE-89" named in prisma; "pandas 2.x" / "numpy
2.x" named; no cross-language BAD/SAFE examples; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| pandas/numpy 2.x semantics claim goes stale | Web-verify pandas 2.x CoW + numpy 2.x NEP-50 at edit time; name the version + dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CWE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL per file + `CWE-89` in prisma | Step 9, Step 14, Step 16 |
| Prisma injection note incomplete/unsourced | Name CWE-89 + parameterized vs unsafe form + cwe.mitre.org source; test asserts the CWE token | Step 10, Step 14 |
| Frontmatter corruption breaks skills.json indexing | Additions below the H1/frontmatter; run full suite + confirm triggers | Step 14 |
| Padding to exceed floor without specificity | Objective depth gate — test asserts concrete identifiers + CWE token | Step 11, Step 14 |


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
