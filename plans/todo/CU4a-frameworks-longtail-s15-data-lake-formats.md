---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.787Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Open table & columnar lake formats (iceberg · hudi · delta-lake · arrow)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/iceberg.md
  - skills/frameworks/data/hudi.md
  - skills/frameworks/data/delta-lake.md
  - skills/frameworks/data/arrow.md
  - tests/cu4a-data-lake-formats-guides.test.js
---

# CU4a s15 — Open table & columnar lake formats (iceberg · hudi · delta-lake · arrow)

> Slice 15 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (iceberg · hudi · delta-lake · arrow) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: lakehouse table formats: ACID snapshot isolation + small-file/compaction, schema evolution, concurrent-writer conflicts, and Arrow memory/zero-copy footguns. Adds one content-contract test that reads the REAL guide
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
lakehouse table formats: ACID snapshot isolation + small-file/compaction, schema evolution, concurrent-writer conflicts, and Arrow memory/zero-copy footguns. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/iceberg.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-lake-formats-guides.test.js
skills/frameworks/data/hudi.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-lake-formats-guides.test.js
skills/frameworks/data/delta-lake.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-lake-formats-guides.test.js
skills/frameworks/data/arrow.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-lake-formats-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/iceberg.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for iceberg edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Table footguns** — snapshot isolation + `expire_snapshots`/orphan-file cleanup, hidden partitioning + partition evolution, copy-on-write vs merge-on-read, manifest/metadata bloat, catalog choice
- **Concurrency** — optimistic concurrency retries on commit
- **Security** — catalog/warehouse credential + table ACLs
- **Version** — Apache Iceberg current spec/release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/hudi.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for hudi edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Table footguns** — Copy-on-Write vs Merge-on-Read trade, `RECORDKEY`/`PRECOMBINE` config, compaction + cleaner retention, timeline/rollback, small-file handling
- **Concurrency** — OCC + multi-writer lock provider
- **Security** — writer credentials, table-service isolation
- **Version** — Apache Hudi current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/delta-lake.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for delta-lake edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Table footguns** — transaction log (`_delta_log`) + checkpoint, `OPTIMIZE`/Z-ORDER + `VACUUM` retention (do NOT vacuum below retention → break time-travel/readers), schema evolution `mergeSchema`, MERGE dedup
- **Concurrency** — optimistic concurrency conflict on concurrent writers
- **Security** — storage credential passthrough, column masking
- **Version** — Delta Lake current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/arrow.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for arrow edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Memory footguns** — zero-copy vs copy on `to_pandas` (`self_destruct`/`split_blocks`), memory pool + jemalloc, chunked arrays, `RecordBatch` vs `Table`, IPC/Flight boundaries
- **Correctness** — null bitmap, dictionary encoding, type mapping to pandas
- **Security** — untrusted IPC stream parsing boundary
- **Version** — Apache Arrow (pyarrow) current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-lake-formats-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — iceberg · hudi · delta-lake · arrow):
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
   - `iceberg`: `snapshot`, `expire_snapshots`, `merge-on-read`
   - `hudi`: `Merge-on-Read`, `PRECOMBINE`, `compaction`
   - `delta-lake`: `VACUUM`, `OPTIMIZE`, `_delta_log`
   - `arrow`: `zero-copy`, `to_pandas`, `RecordBatch`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (none required in this family) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-data-lake-formats-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of iceberg · hudi · delta-lake · arrow (official docs / release notes / PyPI / npm / GitHub releases)
- [ ] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [ ] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [ ] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 4 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 4 files + the test file.
- [ ] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [ ] Wire in real CWE links + web-verified version tokens per the File Specifications
- [ ] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [ ] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [ ] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [ ] Diff is additive on all 4 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [ ] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [ ] Remove redundant prose

### Step 13: SECURE
- [ ] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [ ] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [ ] Safe file operations — only the 5 enumerated files touched

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [ ] Confirm `.ctoc/skills.json` still indexes the iceberg · hudi · delta-lake · arrow triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s15") so the completeness check (s31) has no silent omissions
- [ ] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed correctly; all quality checks passed
- [ ] Only the 5 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
- [ ] Nothing fabricated (versions + CWE ids all traceable to official URLs); no cross-language BAD/SAFE examples added; tests green
- [ ] Ready for human review

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

## Decisions Taken Under Ambiguity

Executed 2026-07-10 (BARRIER-PATTERN: slice test only, left unstaged, audit
ledger untouched). Every version/CVE/CWE claim below was web-verified at edit
time against the cited official source; retrieval date 2026-07-10.

### Web-verified facts + sources (retrieved 2026-07-10)
- **PyIceberg 0.11.1** — PyPI JSON, uploaded 2026-03-03, requires_python
  `>=3.10,<4.0`. https://pypi.org/pypi/pyiceberg/json
- **Apache Iceberg (Java/spec) 1.11.0** — GitHub release `apache-iceberg-1.11.0`,
  published 2026-05-20. https://github.com/apache/iceberg/releases
- **CVE-2026-42812** (CWE-732/284/20/863, published 2026-05-04) — Iceberg table
  metadata as control files; `write.metadata.path` authorization class.
  https://nvd.nist.gov/vuln/detail/CVE-2026-42812
- **Apache Hudi 1.2.0** — GitHub release `release-1.2.0`, published 2026-05-23.
  https://github.com/apache/hudi/releases ; https://hudi.apache.org/releases/release-1.2.0
- **delta-spark 4.3.1** — PyPI JSON, uploaded 2026-07-08, requires_python `>=3.10`.
  https://pypi.org/pypi/delta-spark/json
- **Delta Lake 4.3.1** — GitHub release `v4.3.1`, published 2026-07-08.
  https://github.com/delta-io/delta/releases
- **pyarrow 25.0.0** — PyPI JSON, uploaded 2026-07-10, requires_python `>=3.10`.
  https://pypi.org/pypi/pyarrow/json
- **Apache Arrow 25.0.0** — GitHub release `apache-arrow-25.0.0`, published 2026-07-10.
  https://github.com/apache/arrow/releases
- **CVE-2023-47248** (CWE-502, published 2023-11-09) — PyArrow IPC/Parquet
  deserialization RCE, versions 0.14.0–14.0.0. https://nvd.nist.gov/vuln/detail/CVE-2023-47248
- **CVE-2026-25087** (CWE-416 use-after-free, published 2026-02-17) — Apache Arrow
  C++ 15.0.0–23.0.0, IPC-file pre-buffering + variadic (Binary/String View) buffers.
  https://nvd.nist.gov/vuln/detail/CVE-2026-25087

### Omit-if-unverifiable (recorded absences)
- **Hudi CVE** — NVD keyword search "apache hudi" returned no matching CVE at edit
  time. Per the omit-if-no-source rule, NO CVE/CWE claim was asserted in hudi.md;
  the security section covers credential/isolation footguns only.
- **Delta Lake CVE** — NVD keyword search "delta lake" returned only Linux-kernel
  false matches (no Delta-Lake-project CVE). No CVE/CWE was asserted in
  delta-lake.md; security is framed around the VACUUM-retention destructive
  privilege and credential handling.

### Interpretation decisions
- **Version tokens**: cited BOTH the Python client version (PyPI) and the
  engine/spec version (GitHub) for iceberg/delta/arrow, because the runtime jar must
  be engine-pinned — the Python pin alone gives false confidence. Hudi has no
  first-class Python package, so only the GitHub/site release is cited.
- **CWE inclusion**: CWE ids added ONLY where a real, framework-specific NVD CVE
  grounds them (Iceberg CWE-732; Arrow CWE-502/CWE-416). No CWE invented to satisfy
  a section quota.
- **No-churn**: the original 5 sections + H1 `# <Framework> CTO` header preserved
  verbatim in all 4 files; new sections appended below. skills.json trigger indexing
  unaffected (H1 assertion is green in the slice test).
- **Single-framework examples**: each guide's code is in its own framework only
  (SQL/PySpark for iceberg/hudi/delta, pyarrow for arrow); the 7-language BAD/SAFE
  rule is exempt per the CU4a single-framework exemption.

### Verification (slice test only — full suite NOT run per BARRIER-PATTERN)
- RED (pre-implement): 61 tests, 17 pass, 44 fail.
- GREEN (post-implement): `node --test tests/cu4a-data-lake-formats-guides.test.js`
  → 61 tests, 61 pass, 0 fail, 0 skipped.
- `npx eslint tests/cu4a-data-lake-formats-guides.test.js` → exit 0.
- Line counts before→after: iceberg 68→192, hudi 68→179, delta-lake 65→186,
  arrow 65→185.
- Left unstaged; caller commits. Plan not moved. Audit ledger not touched.
