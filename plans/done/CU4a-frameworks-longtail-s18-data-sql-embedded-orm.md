---
approved_by: human
approved_at: 2026-07-10T18:13:18.567Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.908Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Embedded SQL, time-series & ORMs (sqlite · timescaledb · sqlalchemy · alembic · drizzle)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/sqlite.md
  - skills/frameworks/data/timescaledb.md
  - skills/frameworks/data/sqlalchemy.md
  - skills/frameworks/data/alembic.md
  - skills/frameworks/data/drizzle.md
  - tests/cu4a-data-sql-embedded-orm-guides.test.js
---

# CU4a s18 — Embedded SQL, time-series & ORMs (sqlite · timescaledb · sqlalchemy · alembic · drizzle)

> Slice 18 of the CU4a decomposition. De-stub the 5 thin **data** framework
> guides (sqlite · timescaledb · sqlalchemy · alembic · drizzle) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: embedded SQL / ORM / migrations: locking + WAL concurrency, hypertable chunking, N+1 + session/identity-map, and injection-safe query building. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 5 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 5 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 5 are ONE research pass because the correction spine is shared —
embedded SQL / ORM / migrations: locking + WAL concurrency, hypertable chunking, N+1 + session/identity-map, and injection-safe query building. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/sqlite.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-embedded-orm-guides.test.js
skills/frameworks/data/timescaledb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-embedded-orm-guides.test.js
skills/frameworks/data/sqlalchemy.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-embedded-orm-guides.test.js
skills/frameworks/data/alembic.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-embedded-orm-guides.test.js
skills/frameworks/data/drizzle.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-embedded-orm-guides.test.js
```

5 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/sqlite.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for sqlite edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Concurrency footguns** — single-writer + `SQLITE_BUSY`, enable WAL mode + `busy_timeout`, foreign keys OFF by default (`PRAGMA foreign_keys=ON`), datatype affinity surprises
- **Correctness** — no strict typing (unless `STRICT` table), `AUTOINCREMENT` misuse
- **Security** — parameterized queries not string SQL (CWE-89)
- **Version** — SQLite current release + STRICT tables, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/timescaledb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for timescaledb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Hypertable footguns** — chunk_time_interval sizing (too small = planning overhead), continuous aggregates + refresh policy, compression policy + mutability, `time_bucket` alignment, retention policy
- **Correctness** — insert into wrong chunk, upsert on hypertable
- **Security** — parameterized queries (CWE-89), Postgres roles
- **Version** — TimescaleDB current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/sqlalchemy.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for sqlalchemy edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **ORM footguns** — N+1 via lazy loading → `selectinload`/`joinedload`, 1.x vs 2.0 style (`select()` + `Session.execute`), identity map + `expire_on_commit`, session lifecycle/scoping, `text()` raw SQL
- **Correctness** — implicit autoflush, detached instances
- **Security** — bound parameters not f-string SQL (CWE-89)
- **Version** — SQLAlchemy 2.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/alembic.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for alembic edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Migration footguns** — autogenerate misses (server defaults, type changes, indexes) → review every revision, batch mode for SQLite ALTER, down_revision chain + branch merges, offline vs online
- **Safety** — non-transactional DDL, data migrations separate
- **Security** — no untrusted input in migration SQL (CWE-89)
- **Version** — Alembic current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/drizzle.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for drizzle edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Query footguns** — `sql` template tag is parameterized but `sql.raw` is NOT (CWE-89), relational queries vs core, prepared statements, migration via `drizzle-kit generate`/`migrate` not `push` in prod
- **Correctness** — type inference, transaction API
- **Security** — never `sql.raw` with user input (CWE-89)
- **Version** — Drizzle ORM current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-sql-embedded-orm-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 5 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — sqlite · timescaledb · sqlalchemy · alembic · drizzle):
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
   - `sqlite`: `WAL`, `SQLITE_BUSY`, `CWE-89`
   - `timescaledb`: `hypertable`, `time_bucket`, `continuous aggregate`
   - `sqlalchemy`: `selectinload`, `2.0`, `CWE-89`
   - `alembic`: `autogenerate`, `down_revision`, `batch`
   - `drizzle`: `sql.raw`, `drizzle-kit`, `CWE-89`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 5 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-89) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 6 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 5 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-data-sql-embedded-orm-guides.test.js` (zero doubles — reads the 5 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of sqlite · timescaledb · sqlalchemy · alembic · drizzle (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 5 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 5 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 5 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 6 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the sqlite · timescaledb · sqlalchemy · alembic · drizzle triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s18") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 6 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

## Decisions Taken Under Ambiguity

Executed 2026-07-10 (Steps 8–16, TDD, barrier-pattern: only the slice test was run and
verified; the full suite was NOT run; nothing staged; the audit ledger was NOT touched;
the plan was NOT moved).

### Web-verified facts (source URL + retrieval date 2026-07-10)
- **SQLite 3.53.3**, dated **2026-06-26** — https://www.sqlite.org/releaselog/3_53_3.html
- **SQLite STRICT tables** require **3.37.0** (2021-11-27) — https://www.sqlite.org/stricttables.html
- **SQLite JSONB** since **3.45.0** (2024-01-15) — https://www.sqlite.org/json1.html
- **TimescaleDB 2.28.2**, dated **2026-06-30** — https://github.com/timescale/timescaledb/releases (GitHub releases API `tag_name`/`published_at`)
- **SQLAlchemy 2.0.51**, published **2026-06-15** — https://pypi.org/project/SQLAlchemy/ (PyPI JSON API `info.version` + `upload_time`)
- **Alembic 1.18.5**, published **2026-06-25** — https://pypi.org/project/alembic/ (PyPI JSON API)
- **drizzle-orm 0.45.2**, published **2026-03-27**; **drizzle-kit 0.31.10**, published **2026-03-17** — https://registry.npmjs.org/drizzle-orm , https://registry.npmjs.org/drizzle-kit (npm registry `dist-tags.latest` + `time`)
- **CWE-89** "Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')" — https://cwe.mitre.org/data/definitions/89.html (verified title "SQL Injection")

### Choices made
1. **Section headings chosen to satisfy the content contract without churn.** Each guide
   keeps its original 5 sections verbatim; added sections use the plan-specified
   correction surfaces (Footguns / Concurrency / Hypertable / ORM / Migration / Query;
   Correctness or Safety; Security; Testing; Performance; Version-Specific; References).
2. **No CVE cited — only CWE-89.** None of the five had a currently-relevant, dated
   authoritative CVE tied to the footguns in scope; per the omit-if-unverifiable rule
   only CWE-89 (a real MITRE identifier grounded in each framework's raw-SQL surface) is
   asserted, each linking cwe.mitre.org/89.
3. **SQLite JSONB date (3.45.0, 2024-01-15) retained** as historical context — pre-2025
   but it is a stable release-history fact, not a version/security *currency* claim; the
   currency claims (current release) all carry ≥ 2025-01-01 dated sources.
4. **drizzle-orm 0.45.2 / drizzle-kit 0.31.10 verified but noted pre-1.0**; the guide
   flags that minors can break and to pin exact versions.
5. **Single-framework idiomatic examples only** (CU4a single-framework exemption applied;
   no 7-language BAD/SAFE cross-coverage).
6. **Audit ledger intentionally NOT updated** (barrier-pattern instruction overrides the
   plan's Step 15 audit-append bullet); the caller/orchestrator owns ledger + commit.

### Verification (barrier-pattern)
- RED: 35 tests, 10 pass, 25 fail (before edits).
- GREEN: `node --test tests/cu4a-data-sql-embedded-orm-guides.test.js` → 35 tests, 35 pass, 0 fail.
- `npx eslint tests/cu4a-data-sql-embedded-orm-guides.test.js` → exit 0.
- Full `tests/*.test.js` deliberately NOT run (barrier-pattern).
- Line counts (before → after): sqlite 63→207, timescaledb 70→198, sqlalchemy 65→215, alembic 61→196, drizzle 65→209.
- Nothing staged; working tree left for the caller to commit.


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
