---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T13:05:41.159Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.470Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4c s8 — data & query language guides (sql, graphql, r)"
type: implementation
parent_plan: CU4c-nonmainstream-languages
depends_on: none
priority: MEDIUM
risk_level: LOW
files:
  - skills/languages/sql.md
  - skills/languages/graphql.md
  - skills/languages/r.md
  - tests/cu4c-data-query-guides.test.js
---

# CU4c s8 — data & query language guides (sql · graphql · r)

> Slice 8 of the CU4c decomposition. De-stub the three **data / query** language guides
> from the 5-section template floor (confirmed fresh 2026-07-09: each has exactly the 5
> template sections) into substantive correction surfaces, in ONE coherent research pass.
> Shared research spine: query-language injection + query-shape performance + untrusted-input
> handling — SQL injection (CWE-89) and query-plan/N+1 performance; GraphQL injection +
> introspection/DoS (deep/nested query amplification, CWE-770); R data-frame footguns +
> `eval(parse())` injection. Adds the content-contract test that reads the REAL guide files
> off disk with zero doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every SQL-standard/GraphQL-spec/R version, CWE identifier, tool version, date, and
> best-practice claim MUST be WEB-VERIFIED at edit time (WebSearch or direct fetch of the
> relevant RDBMS docs / graphql.org / spec.graphql.org / r-project.org / cwe.mitre.org /
> owasp.org) and carry an inline dated source ≥ 2025-01-01 — never invented (hard user
> rule). If no dated authoritative source exists for a claim, **OMIT it** and note the
> absence in the audit findings. The content-contract test READS the real files off disk —
> no mocks, no fakes.

Maps to CU4c acceptance criteria: **"upgraded guides meet the CU2 depth standard"**,
**"CVE/CWE classes named for applicable languages (injection risks for query languages)"**,
and **"no audited-SOLID guide is rewritten (no-churn)"** — for these three files.

## Implementation Details

### Architecture Decision

Single-language reference guides → the **7-language BAD/SAFE cross-coverage rule does
NOT apply** (CU4c vision carve-out). Examples in each guide's OWN language, idiomatic +
current. Bar = depth-within-language, objectively gated: every required `## ` section
names a concrete identifier; every version/security claim carries a dated source ≥
2025-01-01. **SQL note:** name the dialect for any dialect-specific claim (PostgreSQL /
MySQL / SQL Server / SQLite) rather than asserting portable-SQL falsely.

**No-churn (extend, never overwrite):** sql.md, graphql.md, r.md each have exactly 5 `## `
sections today (confirmed fresh 2026-07-09); existing 5 preserved verbatim, new sections
ADDED below.

Grouping rationale: ONE research pass because all three are declarative/data languages
whose #1 correction surface is **query-language injection** (SQLi CWE-89, GraphQL
malicious-query DoS/introspection, R `eval(parse())`) plus **query-shape performance**
(indexing/EXPLAIN, GraphQL N+1/DataLoader, R vectorization). Three files is a right-sized
slice — no fourth data language remains thin. Disjoint from every other slice by file.

### Dependency Graph

```
skills/languages/sql.md      (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-data-query-guides.test.js
skills/languages/graphql.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-data-query-guides.test.js
skills/languages/r.md        (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4c-data-query-guides.test.js
```

Three disjoint content files + one test. No cycle. `depends_on: none` (parallel-safe;
Gate 2 & 3 batch per parent via `approveSubplans`).

### File Specifications

Each guide gains these `## ` sections (each names ≥1 concrete identifier + a dated source
≥ 2025-01-01 for version/security claims; extend the existing `Version Gotchas` section):

#### File: `skills/languages/sql.md`
**Action:** MODIFY (extend 5→>5; no-churn) — name the dialect for dialect-specific claims
**Purpose:** Trigger-loaded correction surface for SQL edits.
- **Query-Shape / Concurrency Footguns** — transaction isolation levels (READ COMMITTED
  vs SERIALIZABLE, phantom/non-repeatable reads), deadlocks from lock-order, long-held
  locks, `SELECT ... FOR UPDATE`. Name isolation levels, `FOR UPDATE`.
- **Error Handling / Constraints Idioms** — constraints over app-side checks (FK, UNIQUE,
  CHECK, NOT NULL), `ON CONFLICT`/`MERGE` upsert, explicit transactions +
  rollback-on-error. Name `ON CONFLICT`.
- **Security and Dependency Gotchas** — **SQL injection CWE-89** (link
  cwe.mitre.org/definitions/89.html) — ALWAYS parameterized/prepared statements, never
  string concatenation; least-privilege grants; dynamic SQL escaping. Name CWE-89,
  parameterized queries.
- **Testing Conventions** — pgTAP / dbt tests / testcontainers for DB integration tests,
  `EXPLAIN ANALYZE` as a verification tool. Name `EXPLAIN ANALYZE`.
- **Performance Traps** — missing indexes on filter/join columns, N+1 from ORM, implicit
  type-cast defeating index, `SELECT *`, non-SARGable predicates (function on column),
  `OFFSET` deep pagination. Name SARGable, N+1.
- **Version-Specific Gotchas** — EXTEND: name the dialect + version for dialect-specific
  features (e.g. Postgres `MERGE` availability, window functions), dated ≥ 2025-01-01,
  sourced to the RDBMS official docs.
- **References** — dated source list.

#### File: `skills/languages/graphql.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for GraphQL edits.
- **Query-Complexity / N+1 Footguns** (concurrency-equivalent) — resolver **N+1** without
  batching (use **DataLoader**), unbounded nested queries, list-field fan-out. Name
  DataLoader, N+1.
- **Error Handling Idioms** — partial-data + `errors` array semantics (a 200 with errors),
  typed error extensions, nullability propagation (a non-null field error nulls the parent).
  Name `errors` array, non-null propagation.
- **Security and Dependency Gotchas** — **introspection exposure** in prod, **query-depth/
  complexity DoS (CWE-770 uncontrolled resource consumption)** — enforce depth/complexity
  limits + persisted queries; **injection via unvalidated arguments** into downstream
  queries; disable batching abuse. Name CWE-770, depth limiting, persisted queries.
- **Testing Conventions** — schema/contract tests, resolver unit tests, `graphql-inspector`
  breaking-change checks. Name graphql-inspector.
- **Performance Traps** — over-fetching in resolvers, missing field-level caching, no
  pagination on lists (cursor connections), synchronous resolver blocking.
- **Version-Specific Gotchas** — EXTEND: GraphQL spec edition + `@defer`/`@stream`
  incremental-delivery status, dated ≥ 2025-01-01, sourced to graphql.org / spec.graphql.org.
- **References** — dated source list.

#### File: `skills/languages/r.md`
**Action:** MODIFY (extend 5→>5; no-churn)
**Purpose:** Trigger-loaded correction surface for R edits.
- **Vectorization / Parallelism Footguns** (concurrency-equivalent) — growing objects in
  loops (preallocate; `vapply` over `sapply` for type safety), `parallel`/`future`
  fork-vs-PSOCK differences, copy-on-modify semantics. Name `vapply`, copy-on-modify.
- **Error Handling Idioms** — `tryCatch`/`withCallingHandlers` + conditions, `stop`/
  `warning` with condition classes, `on.exit` cleanup; avoid silent `try(silent=TRUE)`.
  Name `tryCatch`, `on.exit`.
- **Security and Dependency Gotchas** — `eval(parse(text=...))` on untrusted input =
  **code injection CWE-94**, `system`/`system2` **command injection CWE-78**, untrusted
  `readRDS`/`load` executes on load (deserialization risk); `renv` lockfile pinning. Name
  CWE-94, `eval(parse())`.
- **Testing Conventions** — `testthat` framework, `covr` coverage, `R CMD check`. Name
  testthat.
- **Performance Traps** — `for`-loop over vectorized ops, `apply` on data.frames (row
  coercion), `data.frame` vs `data.table`/`dplyr` for large data, `rbind` in loops. Name
  data.table.
- **Version-Specific Gotchas** — EXTEND: current R 4.x (`|>` native pipe, `\(x)` lambda)
  vs magrittr `%>%`, dated ≥ 2025-01-01, sourced to r-project.org / cran.r-project.org.
- **References** — dated source list.

### Test Plan

#### Tests: `tests/cu4c-data-query-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL three guides off disk via `fs.readFileSync`
(mirroring `tests/cu2-systems-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — sql, graphql, r):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~50-line stub floor** — `> 120` lines.
3. **Required sections present** — QueryShape/Complexity/Vectorization, Error
   Handling/Constraints, Security/Dependency, Testing, Performance, Version-specific,
   References (regexes).
4. **≥ 4 code fences** (≥ 2 fenced examples).
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `https?://`
   URL per file.
6. **H1 intact** — original `# <Lang> CTO` header still present.
7. **Per-language injection/DoS CWE + concrete identifiers** — sql: `CWE-89` +
   `EXPLAIN` + parameterized; graphql: `CWE-770` + `DataLoader`; r: `CWE-94` + `testthat`.

**Coverage note:** content-grounding substitutes for line/branch coverage (CU2 convention).

### Security Review

- Content-only edits to three Markdown guides + one test reading them; no runtime path,
  no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Source URLs are public official domains (RDBMS docs, graphql.org, spec.graphql.org,
  r-project.org, cran.r-project.org, cwe.mitre.org, owasp.org) — no secrets.
- Only the four enumerated files touched.

## Execution Plan

### Step 8: TEST
Read all three guides fresh off disk first. Create `tests/cu4c-data-query-guides.test.js`
reading the three REAL files; run it — MUST be RED now (each has exactly 5 `## ` sections,
no dedicated Security/Testing/References sections, no injection/DoS CWE tokens, no dated
sources).

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): SQL dialect
features + versions (the RDBMS official docs), GraphQL spec edition + incremental delivery
status (graphql.org / spec.graphql.org), R 4.x native pipe/lambda (r-project.org),
CWE-89/770/94/78 pages (cwe.mitre.org). Capture each source URL + retrieval date
(≥ 2025-01-01). Omit any niche claim with no dated source; record for Step 15.

### Step 10: IMPLEMENT
Extend the three guides with the added sections. Additive only — existing 5 sections stay
verbatim. ONE step, three files + the test file.

### Step 11: REVIEW
Self-review: each guide >5 sections and >120 lines; every added section names a concrete
identifier; sql names CWE-89 + parameterized queries, graphql names CWE-770 + DataLoader,
r names CWE-94; SQL dialect named for dialect-specific claims; every version/security claim
carries a dated source ≥ 2025-01-01; diff additive.

### Step 12: OPTIMIZE
Dense, footgun-per-bullet, no padding.

### Step 13: SECURE
Run the Security Review checklist; confirm official source URLs; only the four enumerated
files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; slice test GREEN. Confirm `.ctoc/skills.json`
still indexes sql/graphql/r triggers (H1/frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
(slice:"CU4c-s8"). Record each web-verified fact + source URL + retrieval date, and any
omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the four enumerated files edited; every version/security claim sourced with
a date ≥ 2025-01-01; SQL dialect scoped; nothing fabricated; no cross-language BAD/SAFE
examples added; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| SQL guide asserts a dialect-specific feature as portable | Name the dialect + version for every dialect-specific claim; dated source to the RDBMS docs | Step 9, Step 11 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL; omit-if-no-source | Step 9, Step 14, Step 16 |
| GraphQL spec moves (incremental delivery) | Pin `@defer`/`@stream` status to the verified spec edition + date | Step 9, Step 11 |
| Frontmatter corruption breaks skills.json | Additions below H1/frontmatter; full suite + trigger check after edit | Step 14 |
| Padding without specificity | Objective gate — test asserts injection/DoS CWE + concrete identifiers, not just section count | Step 11, Step 14 |
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
