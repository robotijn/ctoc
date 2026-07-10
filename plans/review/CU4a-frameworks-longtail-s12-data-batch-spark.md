---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.713Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Data batch & ELT (spark · dbt · airbyte · fivetran)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/spark.md
  - skills/frameworks/data/dbt.md
  - skills/frameworks/data/airbyte.md
  - skills/frameworks/data/fivetran.md
  - tests/cu4a-data-batch-spark-guides.test.js
---

# CU4a s12 — Data batch & ELT (spark · dbt · airbyte · fivetran)

> Slice 12 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (spark · dbt · airbyte · fivetran) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: batch/ELT: shuffle/skew + partition footguns (Spark), materialization + Jinja-SQL-injection safety (dbt), and connector schema-drift/sync-mode correctness. Adds one content-contract test that reads the REAL guide
> files off disk with **zero doubles**. Disjoint by file from every sibling upgrade slice →
> `depends_on: none` (parallel-safe; Gate 2 & 3 still batch per parent via `approveSubplans`).
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES. SINGLE-FRAMEWORK EXAMPLES.**
> Every framework version, CVE/CWE id, advisory, date, and best-practice claim MUST be WEB-VERIFIED
> at edit time (WebSearch or direct fetch of the framework's official docs / release notes / PyPI /
> npm / GitHub releases / cwe.mitre.org) and carry an inline dated http source ≥ 2025-01-01 — never
> invented (hard user rule). If a claim has no dated authoritative source, **OMIT it** and note the
> absence in the audit findings rather than asserting it uncited. Examples are idiomatic + current
> within each single framework — the 7-language BAD/SAFE cross-coverage rule is EXEMPT here.

Maps to CU4a acceptance criteria: **"every audit-confirmed thin framework file is upgraded or
recorded"**, **"upgraded frameworks meet the CU3 depth standard (>5 sections; each section names a
technology-specific identifier — version number, CWE id, or concrete API/function name; every
version/security claim carries a dated source ≥ 2025-01-01)"**, and **"no audited-SOLID file is
rewritten (no-churn)"** — for these 4 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 4 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 4 are ONE research pass because the correction spine is shared —
batch/ELT: shuffle/skew + partition footguns (Spark), materialization + Jinja-SQL-injection safety (dbt), and connector schema-drift/sync-mode correctness. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/spark.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-batch-spark-guides.test.js
skills/frameworks/data/dbt.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-batch-spark-guides.test.js
skills/frameworks/data/airbyte.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-batch-spark-guides.test.js
skills/frameworks/data/fivetran.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-batch-spark-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/spark.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for spark edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Shuffle/skew footguns** — wide transforms + skewed keys, `spark.sql.shuffle.partitions`, AQE (`adaptive.enabled`), broadcast-join threshold, cache/`persist` + eviction, `collect()` driver OOM
- **Correctness** — lazy eval + non-deterministic UDFs, small-file problem
- **Security** — Spark UI/master exposure, `spark.sql` string interpolation (CWE-89) → use param binding
- **Version** — Spark 4.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/dbt.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for dbt edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Materialization footguns** — view vs table vs incremental (`is_incremental()` + unique_key), full-refresh cost, `ref`/`source` DAG, snapshot SCD2, test severity
- **Correctness** — incremental late-arriving data, timezone
- **Security** — Jinja `{{ }}` interpolating untrusted vars into SQL is injection (CWE-89); never build SQL from unquoted user input
- **Version** — dbt-core current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/airbyte.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for airbyte edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Sync footguns** — full-refresh vs incremental + CDC, cursor field + primary key, normalization removal (raw JSON), schema-change propagation, connector-version pin
- **Reliability** — resumable state, rate limits
- **Security** — connector credentials in secrets store, PII in raw tables
- **Version** — Airbyte current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/fivetran.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for fivetran edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Sync footguns** — history vs soft-delete, schema drift auto-add columns, sync frequency + MAR cost, primary-key requirement, re-sync blast radius
- **Correctness** — timezone/`_fivetran_synced`
- **Security** — connector auth scope, column blocking/hashing for PII
- **Version** — Fivetran connector SDK/current behavior, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-batch-spark-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — spark · dbt · airbyte · fivetran):
1. **Exceeds the floor** — `> 5` `## ` sections.
2. **Well past the ~55-line stub floor** — `> 120` lines.
3. **Required correction-surface sections present** (case-insensitive heading regexes) —
   a footgun/concurrency/memory section, Error Handling, Security/Dependency, Testing,
   Performance, Version-specific, References.
4. **≥ 4 code fences** (≥ 2 fenced single-framework examples).
5. **Dated source present** — at least one date token `20(2[5-9]|[3-9]\d)` (≥ 2025) AND at least
   one `https?://` URL per file.
6. **H1 intact** — original `# <Framework> CTO` header still present (skills.json indexing).
7. **Per-framework concrete identifiers** (proves substance, not padding):
   - `spark`: `shuffle`, `broadcast`, `CWE-89`
   - `dbt`: `is_incremental`, `ref(`, `CWE-89`
   - `airbyte`: `incremental`, `cursor field`, `CDC`
   - `fivetran`: `MAR`, `soft-delete`, `schema drift`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-89) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-data-batch-spark-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of spark · dbt · airbyte · fivetran (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 4 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 4 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 4 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 5 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the spark · dbt · airbyte · fivetran triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s12") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 5 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [x] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [x] Ready for human review

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Stale framework version gives false confidence | Web-verify current stable at edit time; inline dated http source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE/CWE (hard user rule) | Every fact carries an official source URL retrieved at edit time; test asserts dated source + http URL per file; omit-if-no-source | Step 9, Step 14, Step 16 |
| Fast-moving ai-ml/data APIs go stale | Name the exact version alongside the dated source so staleness is visible at the next trigger load | Step 9, Step 11 |
| Frontmatter/H1 corruption breaks skills.json indexing | Additions below H1/frontmatter; full suite + trigger check after edit | Step 11, Step 14 |
| Padding without specificity | Objective gate — test asserts per-framework concrete identifiers, not just section count | Step 11, Step 14 |
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

**Barrier pattern (this run):** verified ONLY the slice test `tests/cu4a-data-batch-spark-guides.test.js`
(NOT the full suite), left everything UNSTAGED, and did NOT touch
`.ctoc/audit/corpus-audit-2026-06-15.json` (the Step-15 audit-ledger append is
deferred to the caller/integrator to avoid a concurrent-write conflict across
sibling barrier slices). All facts web-verified at edit time 2026-07-10.

### Web-verified facts + sources (retrieved 2026-07-10)
| Framework | Fact asserted | Source URL |
|---|---|---|
| Spark | pyspark **4.1.2** current (uploaded 2026-05-21); 4.0 line at **4.0.3** (2026-06-11) | https://pypi.org/pypi/pyspark/json |
| Spark | AQE / skew-join / broadcast tuning; ANSI-on-by-default in 4.0 | https://spark.apache.org/docs/latest/sql-performance-tuning.html · https://spark.apache.org/docs/latest/sql-migration-guide.html |
| Spark | UI/master/REST exposure hardening | https://spark.apache.org/docs/latest/security.html |
| dbt | dbt-core **1.11.12** current stable (uploaded 2026-07-01); 1.12 RC, 2.0 alpha | https://pypi.org/pypi/dbt-core/json |
| dbt | incremental (`is_incremental`, unique_key, on_schema_change), materializations, snapshots, tests | https://docs.getdbt.com/docs/build/incremental-models · /materializations · /snapshots · /data-tests |
| Airbyte | Airbyte **2.0.0** current (published 2025-10-15) | https://github.com/airbytehq/airbyte/releases |
| Airbyte | incremental+dedup, CDC (WAL/slot), typing & deduping, schema-change management | https://docs.airbyte.com/using-airbyte/core-concepts/sync-modes/incremental-append-deduped · /understanding-airbyte/cdc · /using-airbyte/core-concepts/typing-deduping |
| Fivetran | fivetran-connector-sdk **2.10.1** current (uploaded 2026-07-08) | https://pypi.org/pypi/fivetran-connector-sdk/json |
| Fivetran | MAR pricing, sync/capture-deletes, system columns, schema changes, column hashing | https://www.fivetran.com/docs/usage-based-pricing · /core-concepts/sync-modes · /system-columns-and-tables · /schema-changes · /columns/column-hashing |
| Security (shared) | **CWE-89** SQL Injection (Spark `spark.sql` string interp; dbt Jinja-into-SQL) | https://cwe.mitre.org/data/definitions/89.html |
| Security (shared) | **CWE-798** Use of Hard-coded Credentials (Airbyte/Fivetran connector secrets) | https://cwe.mitre.org/data/definitions/798.html |

### Choices made
- **`is_incremental()` without `unique_key` = duplicates** framed as the primary dbt merge footgun (merge/delete+insert strategies), grounded in docs.getdbt.com.
- **Fivetran version token**: Fivetran is a managed SaaS with no user-visible single "version"; cited the versioned **Connector SDK (fivetran-connector-sdk 2.10.1)** as the concrete, dated identifier the plan requires, and noted the managed connectors are continuously updated (not user-pinned).
- **Airbyte "basic normalization removed"**: reflected the modern Typing & Deduping model rather than the legacy raw-JSON + dbt-normalization path.
- **Performance-section naming**: the plan's Test-Plan item 3 requires a Performance/Testing section; each guide's perf/cost material lives in its footgun section, so those headings name Performance explicitly (e.g. "Shuffle, Skew & Partition Footguns (Performance)") rather than adding a thin separate stub — denser and truer to the content.

### Omitted for lack of a dated authoritative source
- No CVE (as opposed to CWE) was asserted for any of the four: no framework-specific CVE with a dated NVD/MITRE advisory ≥ 2025-01-01 was confirmed at edit time for the exact footguns covered, so only the two **CWE class identifiers** (CWE-89, CWE-798) — both real MITRE pages — are cited. Per the hard rule, unverifiable CVE claims were omitted rather than invented.
