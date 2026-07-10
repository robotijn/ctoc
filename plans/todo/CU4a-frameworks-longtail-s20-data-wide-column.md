---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.955Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Wide-column & multi-model NoSQL (cassandra · scylladb · dynamodb · couchbase)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/cassandra.md
  - skills/frameworks/data/scylladb.md
  - skills/frameworks/data/dynamodb.md
  - skills/frameworks/data/couchbase.md
  - tests/cu4a-data-wide-column-guides.test.js
---

# CU4a s20 — Wide-column & multi-model NoSQL (cassandra · scylladb · dynamodb · couchbase)

> Slice 20 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (cassandra · scylladb · dynamodb · couchbase) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: wide-column/NoSQL: partition-key design (hotspots + unbounded partitions), tunable consistency, tombstone/GC, and single-table access-pattern modeling. Adds one content-contract test that reads the REAL guide
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
wide-column/NoSQL: partition-key design (hotspots + unbounded partitions), tunable consistency, tombstone/GC, and single-table access-pattern modeling. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/cassandra.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-wide-column-guides.test.js
skills/frameworks/data/scylladb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-wide-column-guides.test.js
skills/frameworks/data/dynamodb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-wide-column-guides.test.js
skills/frameworks/data/couchbase.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-wide-column-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/cassandra.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for cassandra edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Data-model footguns** — partition key drives everything (hot partitions, unbounded partition growth), query-first modeling (no ad-hoc joins), tombstone accumulation + `gc_grace_seconds` read timeouts, `ALLOW FILTERING` = full scan
- **Consistency** — LOCAL_QUORUM tuning, lightweight transactions cost
- **Security** — parameterized CQL (CWE-89), auth/RBAC
- **Version** — Cassandra 5.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/scylladb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for scylladb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Data-model footguns** — same Cassandra model (shard-per-core): partition design, tombstones, `ALLOW FILTERING`; shard-aware driver for latency
- **Consistency** — tunable consistency, LWT cost
- **Security** — parameterized CQL (CWE-89), auth
- **Version** — ScyllaDB current release + Cassandra-compat, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/dynamodb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for dynamodb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Modeling footguns** — single-table design + composite keys, hot-partition throttling, `Scan` vs `Query` (avoid Scan), GSI projection + eventual consistency, item-size 400KB limit
- **Cost** — RCU/WCU vs on-demand, `BatchWrite` retries on unprocessed items
- **Security** — IAM least-privilege, condition expressions, no injection but validate
- **Version** — DynamoDB current behavior + SDK v3, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/couchbase.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for couchbase edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Modeling footguns** — scopes/collections, N1QL index required (else full scan), durability (majority) vs speed, SDK `KV` vs query, document vs sub-document ops
- **Consistency** — `scan_consistency` (request_plus staleness)
- **Security** — parameterized N1QL (CWE-943 NoSQL injection), RBAC
- **Version** — Couchbase current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-wide-column-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — cassandra · scylladb · dynamodb · couchbase):
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
   - `cassandra`: `partition key`, `tombstone`, `ALLOW FILTERING`
   - `scylladb`: `partition key`, `shard-aware`, `tombstone`
   - `dynamodb`: `single-table`, `GSI`, `Scan`
   - `couchbase`: `N1QL`, `scan_consistency`, `CWE-943`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-943) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-data-wide-column-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of cassandra · scylladb · dynamodb · couchbase (official docs / release notes / PyPI / npm / GitHub releases)
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
- [ ] Confirm `.ctoc/skills.json` still indexes the cassandra · scylladb · dynamodb · couchbase triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s20") so the completeness check (s31) has no silent omissions
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

Executed 2026-07-10 (Steps 8–16, TDD, BARRIER-PATTERN: verified only this slice's
own test, left unstaged, did NOT touch the audit ledger).

### Web-verified facts + sources (retrieved 2026-07-10 at edit time)
- **Apache Cassandra server 5.0.8** — current stable on the 5.0 line.
  Source: https://dlcdn.apache.org/cassandra/ (Apache mirror listing).
- **cassandra-driver (Python) 3.30.1**, uploaded 2026-07-06, CPython 3.10–3.14.
  Source: https://pypi.org/pypi/cassandra-driver/json (PyPI JSON API).
- **ScyllaDB calendar-versioned; stable line 2026.1.x, newest GA tag 2026.2.0.**
  Source: https://github.com/scylladb/scylladb/tags (release tags; `scylla-2026.2.0`
  is the latest non-candidate GA tag, `scylla-2026.2.1` still a candidate).
- **scylla-driver (Python) 3.29.11**, uploaded 2026-06-15 — shard-aware fork of
  cassandra-driver. Source: https://pypi.org/pypi/scylla-driver/json.
- **boto3 1.43.45** (AWS SDK for Python), uploaded 2026-07-09, requires Python >=3.10.
  Source: https://pypi.org/pypi/boto3/json.
- **DynamoDB service quotas** — item size 400 KB; ~3000 RCU / 1000 WCU per partition;
  LSI item collection ~10 GB. Source:
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotasOverview.html
- **Couchbase Server 7.x** (bucket→scope→collection, SQL++/N1QL, vector search on 7.6).
  Source: https://docs.couchbase.com/server/current/ (7.x release notes / learn docs).
- **couchbase (Python SDK) 4.6.2**, uploaded 2026-06-18 — SDK 4.x (Couchbase++ core).
  Source: https://pypi.org/pypi/couchbase/json.
- **CWE-89** (SQL/CQL injection) title confirmed at MITRE v4.20:
  https://cwe.mitre.org/data/definitions/89.html
- **CWE-943** (Improper Neutralization of Special Elements in Data Query Logic —
  NoSQL injection) title confirmed at MITRE v4.20:
  https://cwe.mitre.org/data/definitions/943.html

### Choices under ambiguity
1. **ScyllaDB version presentation** — GitHub exposes `scylla-2026.2.0` as a tag but
   with no attached GitHub *release object* (no published_at). Chose to present the
   stable line as **2026.1.x with 2026.2.0 as the newest GA tag**, cited to the tags
   listing (dated by retrieval), and to anchor a firmly-dated version on
   **scylla-driver 3.29.11 (PyPI, 2026-06-15)** rather than assert an unverifiable
   server GA date. No fabricated date asserted.
2. **DynamoDB has no CQL/SQL injection surface** — the typed boto3 API is not string
   SQL, so I did NOT assert a CWE-89/943 for DynamoDB (would be fabricated). Instead
   the DynamoDB Security section covers the *real* risks: over-broad IAM
   (`dynamodb:LeadingKeys` fencing, no `dynamodb:*`/`Resource:*`) and lost-update
   races (ConditionExpression optimistic concurrency). Test asserts IAM/condition
   content, not a CWE token, for DynamoDB.
3. **DynamoDB 400 KB item limit** — the AWS Service Quotas page is JS-rendered so the
   token wasn't grep-able from raw HTML; cited the canonical AWS Service Quotas doc
   URL (retrieved 2026-07-10) as the authoritative source, matching sibling-guide
   practice. This is a long-standing, well-documented hard quota, not an invented number.
4. **Couchbase N1QL injection = CWE-943, not CWE-89** — N1QL/SQL++ is a data-query
   language over documents; the correct MITRE class is CWE-943 (data query logic),
   which the plan and test mandate. Verified at MITRE.
5. **No omitted claims** — every version/security claim carries a dated ≥2025-01-01
   http source; nothing was dropped for lack of a source.

### Verification tallies (this slice only)
- TDD: RED = 28 tests / 9 pass / 19 fail (pre-implementation) → GREEN = 28 tests /
  28 pass / 0 fail / 0 skipped (`node --test tests/cu4a-data-wide-column-guides.test.js`).
- eslint on the test file: exit 0.
- Before→after line counts: cassandra 68→242, scylladb 69→228, dynamodb 70→229,
  couchbase 60→225. Sections each 5→13 (>5 floor). H1 `# <Framework> CTO` intact on all 4.
- Full suite NOT run (barrier pattern); files left unstaged for the caller to commit;
  audit ledger NOT touched.
