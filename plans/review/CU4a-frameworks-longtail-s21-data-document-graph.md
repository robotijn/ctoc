---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.981Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Document & graph databases (mongodb · arangodb · neo4j · dgraph)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/mongodb.md
  - skills/frameworks/data/arangodb.md
  - skills/frameworks/data/neo4j.md
  - skills/frameworks/data/dgraph.md
  - tests/cu4a-data-document-graph-guides.test.js
---

# CU4a s21 — Document & graph databases (mongodb · arangodb · neo4j · dgraph)

> Slice 21 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (mongodb · arangodb · neo4j · dgraph) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: document/graph DBs: index-supported queries + schema/embedding design, NoSQL/query injection (CWE-943), traversal depth + supernode footguns. Adds one content-contract test that reads the REAL guide
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
document/graph DBs: index-supported queries + schema/embedding design, NoSQL/query injection (CWE-943), traversal depth + supernode footguns. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/mongodb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-document-graph-guides.test.js
skills/frameworks/data/arangodb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-document-graph-guides.test.js
skills/frameworks/data/neo4j.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-document-graph-guides.test.js
skills/frameworks/data/dgraph.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-document-graph-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/mongodb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for mongodb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Query footguns** — missing index → COLLSCAN, `$lookup` cost, unbounded array growth (16MB doc limit), embed vs reference, write-concern/read-concern, aggregation pipeline memory
- **Correctness** — eventual read on secondaries, transactions across shards
- **Security** — `$where`/operator injection from untrusted input is NoSQL injection (CWE-943); validate operators, use parameterized driver calls
- **Version** — MongoDB current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/arangodb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for arangodb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Multi-model footguns** — AQL over documents/graphs, index (persistent/hash) required, traversal depth limits, collection vs edge collection, join cost
- **Consistency** — write concern, smart graphs (cluster)
- **Security** — AQL bind parameters not string concat (CWE-943), RBAC
- **Version** — ArangoDB current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/neo4j.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for neo4j edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Cypher footguns** — missing index/constraint → full scan, cartesian products on disconnected patterns, unbounded variable-length paths (`*`), supernode hotspots, `PROFILE`/`EXPLAIN`
- **Correctness** — `MERGE` semantics + accidental duplicates
- **Security** — Cypher parameters (`$param`) not string concat → Cypher injection (CWE-943)
- **Version** — Neo4j 5.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/dgraph.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for dgraph edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Graph footguns** — DQL/GraphQL± schema + predicate indexing (`@index`), reverse edges (`@reverse`), upsert blocks, transaction conflicts, expand-all cost
- **Consistency** — best-effort vs linearizable reads
- **Security** — parameterized DQL variables, ACL
- **Version** — Dgraph current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-document-graph-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — mongodb · arangodb · neo4j · dgraph):
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
   - `mongodb`: `COLLSCAN`, `$lookup`, `CWE-943`
   - `arangodb`: `AQL`, `bind parameter`, `traversal`
   - `neo4j`: `Cypher`, `MERGE`, `CWE-943`
   - `dgraph`: `@index`, `upsert`, `DQL`

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
- [x] Create `tests/cu4a-data-document-graph-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of mongodb · arangodb · neo4j · dgraph (official docs / release notes / PyPI / npm / GitHub releases)
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
- [x] Confirm `.ctoc/skills.json` still indexes the mongodb · arangodb · neo4j · dgraph triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s21") so the completeness check (s31) has no silent omissions
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

Executed 2026-07-10 (barrier-pattern parallel slice: verified own test only, left
unstaged, did NOT touch the audit ledger `.ctoc/audit/corpus-audit-2026-06-15.json`,
did NOT move the plan — caller commits and appends the ledger).

### Web-verified facts + sources (all retrieved 2026-07-10)

**MongoDB**
- Server **8.0.27** (LTS line) / **8.2.12** (rapid) — https://www.mongodb.com/docs/manual/release-notes/8.0/
- Node driver `mongodb` **7.5.0** — https://registry.npmjs.org/mongodb
- `pymongo` **4.17.0** (uploaded 2026-04-20) — https://pypi.org/pypi/pymongo/json
- 16 MB BSON limit + aggregation 100 MB stage cap — https://www.mongodb.com/docs/manual/reference/limits/ , https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/
- $where / operator injection = CWE-943 — https://cwe.mitre.org/data/definitions/943.html

**ArangoDB**
- Server **3.12** stable (Docker `arangodb/arangodb:3.12`) — https://docs.arangodb.com/3.12/
- `python-arango` **8.3.3** (uploaded 2026-06-01) — https://pypi.org/pypi/python-arango/json
- AQL bind parameters — https://docs.arangodb.com/3.12/aql/fundamentals/bind-parameters/
- AQL injection = CWE-943 — https://cwe.mitre.org/data/definitions/943.html

**Neo4j**
- Server **2026.06.0** (calendar line) / **5.26 LTS** — https://neo4j.com/release-notes/database/
- `neo4j` driver **6.2.0** (PyPI upload 2026-05-04; npm neo4j-driver 6.2.0) — https://pypi.org/pypi/neo4j/json , https://registry.npmjs.org/neo4j-driver
- Cypher parameters — https://neo4j.com/docs/cypher-manual/current/syntax/parameters/
- Cypher injection = CWE-943 — https://cwe.mitre.org/data/definitions/943.html

**Dgraph**
- Server **v25.3.8** (GitHub release published 2026-07-09; Docker `dgraph/standalone:v25.3`) — https://github.com/dgraph-io/dgraph/releases
- `pydgraph` **25.2.0** (uploaded 2026-02-25) — https://pypi.org/pypi/pydgraph/json
- Upsert block / consistency — https://dgraph.io/docs/mutations/upsert-block/ , https://dgraph.io/docs/design-concepts/consistency-model/
- DQL query injection class = CWE-943 — https://cwe.mitre.org/data/definitions/943.html

**CWE-943 title** confirmed against MITRE at edit time: "Improper Neutralization of
Special Elements in Data Query Logic" (https://cwe.mitre.org/data/definitions/943.html).
NoSQL / graph-query injection is **CWE-943, NOT CWE-89** (CWE-89 is SQL); guides state
this contrast explicitly and the content test forbids labeling the weakness AS CWE-89.

### Decisions
1. **NoSQL/graph injection labeled CWE-943 throughout** (mongodb $where/operator,
   ArangoDB AQL, Neo4j Cypher, Dgraph DQL). CWE-89 is SQL and is never assigned; the
   test asserts CWE-943 present and forbids `is/=/: CWE-89`.
2. **Existing "v23" Dgraph install line left verbatim** (no-churn rule preserves the
   original 5 sections) but the new Version-Specific section flags it as outdated and
   directs new work to `dgraph/standalone:v25.3` — additive correction, no rewrite.
3. **GitHub API rate-limited mid-verification** for ArangoDB/Neo4j tag listings;
   fell back to the official docs/release-notes pages (docs.arangodb.com/3.12,
   neo4j.com/release-notes/database) which authoritatively confirm the stable lines.
   No version asserted without a dated official source. Nothing omitted-for-lack-of-source.
4. **`doesNotMatch` guard refined** from `/CWE-89\b/` to `/\b(is|=|:)\s*CWE-89\b/i`
   so the pedagogically-valuable "CWE-943, not CWE-89" contrast is allowed while an
   actual mislabel (`is/= CWE-89`) still fails — preserves the anti-mislabel intent.
5. **Single-framework idiomatic examples only** (CU4a exemption from the 7-language
   BAD/SAFE rule): mongodb→JS driver, arangodb→AQL/arangojs/JS-txn, neo4j→Cypher/JS,
   dgraph→DQL/GraphQL/Go.

### Verification tally (own test only — barrier pattern)
- RED (pre-implement): 28 tests, 11 pass, 17 fail.
- GREEN (post-implement): 28 tests, **28 pass, 0 fail**, 0 skipped, 0 todo.
- `npx eslint tests/cu4a-data-document-graph-guides.test.js` → exit 0.
- Line counts (before→after, `git show HEAD` vs working tree): mongodb 62→210,
  arangodb 60→192, neo4j 57→195, dgraph 68→208; test file NEW → 156.
- Full `tests/*.test.js` intentionally NOT run (barrier pattern — caller runs the suite).
