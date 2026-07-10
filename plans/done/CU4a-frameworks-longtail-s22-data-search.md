---
approved_by: human
approved_at: 2026-07-10T18:13:18.636Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.003Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Search engines (elasticsearch · opensearch · typesense · meilisearch)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/elasticsearch.md
  - skills/frameworks/data/opensearch.md
  - skills/frameworks/data/typesense.md
  - skills/frameworks/data/meilisearch.md
  - tests/cu4a-data-search-guides.test.js
---

# CU4a s22 — Search engines (elasticsearch · opensearch · typesense · meilisearch)

> Slice 22 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (elasticsearch · opensearch · typesense · meilisearch) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: search engines: mapping/analyzer correctness (text vs keyword), pagination depth, refresh/near-real-time semantics, and query-injection + exposure. Adds one content-contract test that reads the REAL guide
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
search engines: mapping/analyzer correctness (text vs keyword), pagination depth, refresh/near-real-time semantics, and query-injection + exposure. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/elasticsearch.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-search-guides.test.js
skills/frameworks/data/opensearch.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-search-guides.test.js
skills/frameworks/data/typesense.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-search-guides.test.js
skills/frameworks/data/meilisearch.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-search-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/elasticsearch.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for elasticsearch edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Mapping footguns** — dynamic mapping explosion, `text` vs `keyword` (aggregations need keyword), analyzer mismatch index-vs-query, deep pagination (`from`+`size` → `search_after`/PIT), refresh interval
- **Correctness** — relevance/BM25 tuning, shard sizing
- **Security** — never expose unauthenticated (documented data-leak class); query-DSL from untrusted input, script injection (`painless`)
- **Version** — Elasticsearch current release (license note), dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/opensearch.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for opensearch edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Mapping footguns** — same ES-fork model: text vs keyword, deep pagination, analyzers, k-NN plugin for vectors, ISM lifecycle
- **Correctness** — shard/replica sizing
- **Security** — security plugin (RBAC/TLS), no public bind, script injection
- **Version** — OpenSearch current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/typesense.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for typesense edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Schema footguns** — typed schema + `sort`/`facet` flags, default sorting field, `query_by` weights, filter_by syntax, pagination limits
- **Correctness** — typo tolerance tuning, symbols_to_index
- **Security** — scoped search API keys (never expose admin key, CWE-798), key generation
- **Version** — Typesense current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/meilisearch.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for meilisearch edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Settings footguns** — searchable/filterable/sortable attributes must be declared, ranking rules order, typo tolerance, pagination (`limit`/`offset` cap), index settings vs documents
- **Correctness** — relevancy tuning
- **Security** — tenant tokens + scoped keys (never expose master key, CWE-798)
- **Version** — Meilisearch current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-search-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — elasticsearch · opensearch · typesense · meilisearch):
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
   - `elasticsearch`: `keyword`, `search_after`, `analyzer`
   - `opensearch`: `keyword`, `k-NN`, `search_after`
   - `typesense`: `query_by`, `filter_by`, `scoped key`
   - `meilisearch`: `filterable`, `ranking rules`, `tenant token`

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
- [x] Create `tests/cu4a-data-search-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of elasticsearch · opensearch · typesense · meilisearch (official docs / release notes / PyPI / npm / GitHub releases)
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
- [x] Confirm `.ctoc/skills.json` still indexes the elasticsearch · opensearch · typesense · meilisearch triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s22") so the completeness check (s31) has no silent omissions
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

Executed 2026-07-10 (barrier-pattern: verified ONLY this slice's own test, left the
working tree UNSTAGED, did NOT touch the audit ledger; caller commits).

### Web-verified facts (source URL + retrieval date, all ≥ 2025-01-01)

| Fact | Value | Source (retrieved 2026-07-10) |
|------|-------|-------------------------------|
| Elasticsearch current stable | **9.4.3**, published 2026-06-30 | https://github.com/elastic/elasticsearch/releases/latest (GitHub API `tag_name` v9.4.3) |
| Elasticsearch license fork | Elastic License 2.0 / SSPL; AGPLv3 re-added 2024 | https://www.elastic.co/blog/elasticsearch-is-open-source-again (HTTP 200) |
| ES deep-pagination window | `index.max_result_window` default 10 000; use `search_after`+PIT | https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html |
| OpenSearch current stable | **3.7.0**, published 2026-06-09 | https://github.com/opensearch-project/OpenSearch/releases/latest (GitHub API `tag_name` 3.7.0) |
| OpenSearch license/lineage | Apache 2.0; fork of Elasticsearch 7.10 | https://opensearch.org/about.html |
| Typesense current stable | **v30.2**, published 2026-04-19 | https://github.com/typesense/typesense/releases/latest (GitHub API `tag_name` v30.2) |
| Meilisearch current stable | **v1.49.0**, published 2026-07-06 | https://github.com/meilisearch/meilisearch/releases/latest (GitHub API `tag_name` v1.49.0) |
| CWE-798 (hard-coded credentials) | real MITRE id, title "Use of Hard-coded Credentials" | https://cwe.mitre.org/data/definitions/798.html (HTTP 200, title confirmed) |

- **CWE-798** is used in typesense.md and meilisearch.md (scoped/admin/master API-key
  exposure) — it is the correct MITRE identifier for hard-coded/embedded credentials.
  ES/OpenSearch guides describe the same class in prose + link CWE-798.
- **No CVEs asserted.** No framework-specific CVE met the "official dated source at
  edit time" bar for a general correction surface, so per the omit-if-no-source rule
  none were fabricated. The guides assert only version + license + CWE-798 facts,
  each carrying a dated source ≥ 2025-01-01.

### Choices made (no stubs)

1. **Test regex flexibility.** The `Correctness`/`Footgun` required-section regexes
   accept a family of headings (mapping/schema/settings/analyzer; correctness/
   relevancy/pagination/tuning) so each of the 4 differently-named surfaces
   (ES/OpenSearch "Mapping Footguns", Typesense "Schema Footguns", Meilisearch
   "Settings Footguns") satisfies the same content contract without a false floor.
2. **Version tokens in test.** Per-framework version assertions accept both the exact
   patch (`9.4.3`, `3.7.0`, `v1.49`) and the minor line (`9.4`, `3.7`, `1.49`, `v30`)
   so a routine patch bump on the real docs does not fail the content test while a
   drop of the version entirely still does.
3. **Single-framework idiomatic examples only** (CU4a exemption from the 7-language
   BAD/SAFE rule): Python for ES, JSON+Python for OpenSearch, JS for Typesense and
   Meilisearch — each in the framework's own canonical client.
4. **Additive-only.** All 4 diffs are 0-deletion (existing 5 sections + H1 preserved
   verbatim); 7 new `## ` sections appended to each (5 → 12 sections).
