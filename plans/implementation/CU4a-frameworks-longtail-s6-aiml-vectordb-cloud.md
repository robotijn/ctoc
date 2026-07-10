---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML vector databases (pinecone · weaviate · qdrant · chromadb · milvus · pgvector)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/pinecone.md
  - skills/frameworks/ai-ml/weaviate.md
  - skills/frameworks/ai-ml/qdrant.md
  - skills/frameworks/ai-ml/chromadb.md
  - skills/frameworks/ai-ml/milvus.md
  - skills/frameworks/ai-ml/pgvector.md
  - tests/cu4a-aiml-vectordb-guides.test.js
---

# CU4a s6 — AI/ML vector databases (pinecone · weaviate · qdrant · chromadb · milvus · pgvector)

> Slice 6 of the CU4a decomposition. De-stub the 6 thin **ai-ml** framework
> guides (pinecone · weaviate · qdrant · chromadb · milvus · pgvector) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: vector databases: embedding-dimension/metric mismatch, ANN index (HNSW) recall-vs-latency tuning, metadata-filter correctness, and multi-tenant isolation. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 6 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 6 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 6 are ONE research pass because the correction spine is shared —
vector databases: embedding-dimension/metric mismatch, ANN index (HNSW) recall-vs-latency tuning, metadata-filter correctness, and multi-tenant isolation. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/pinecone.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
skills/frameworks/ai-ml/weaviate.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
skills/frameworks/ai-ml/qdrant.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
skills/frameworks/ai-ml/chromadb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
skills/frameworks/ai-ml/milvus.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
skills/frameworks/ai-ml/pgvector.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-vectordb-guides.test.js
```

6 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/pinecone.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for pinecone edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Index footguns** — dimension + metric fixed at create, serverless vs pod, namespace isolation, upsert batch limits, eventual-consistency read-after-write
- **Correctness** — metadata filter cardinality, `top_k` recall
- **Security** — API-key scoping, namespace as tenant boundary
- **Version** — Pinecone current SDK (v5+) + serverless API, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/weaviate.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for weaviate edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Schema footguns** — vectorizer module vs bring-your-own vectors, HNSW `ef`/`efConstruction`/`maxConnections`, class/collection schema, hybrid (BM25+vector) alpha
- **Consistency** — replication factor, tombstone/compaction
- **Security** — API-key/OIDC auth, multi-tenancy `tenant` isolation
- **Version** — Weaviate current release + client v4, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/qdrant.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for qdrant edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Collection footguns** — distance metric + vector size fixed, HNSW `m`/`ef_construct`, payload index for filters, quantization (scalar/binary) recall loss
- **Consistency** — `wait=true` on upsert, sharding/replication
- **Security** — API-key auth, payload as tenant filter
- **Version** — Qdrant current release + client, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/chromadb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for chromadb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Collection footguns** — embedding-function mismatch between add and query, `hnsw:space` metric, in-memory vs persistent client, metadata `where` filter operators
- **Scale** — single-node limits, batch add
- **Security** — auth on server mode, tenant/database separation
- **Version** — Chroma current release (client/server split), dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/milvus.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for milvus edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Index footguns** — index type (HNSW/IVF_FLAT/DiskANN) + metric choice, `nlist`/`nprobe` recall-vs-latency, load collection into memory before search, partition key
- **Consistency** — consistency level (Strong/Bounded/Eventually)
- **Security** — RBAC/user auth, collection-level isolation
- **Version** — Milvus current release + pymilvus, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/pgvector.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for pgvector edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Index footguns** — `ivfflat` `lists` vs `hnsw` `m`/`ef_search`, build index AFTER bulk load, distance operator (`<->`/`<=>`/`<#>`) must match index opclass, `maintenance_work_mem` for build
- **Correctness** — exact vs approximate (no index = seq scan), dimension limit
- **Security** — RLS for multi-tenant vectors (CWE-284 broken access control if omitted)
- **Version** — pgvector current release + Postgres coupling, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-vectordb-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 6 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — pinecone · weaviate · qdrant · chromadb · milvus · pgvector):
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
   - `pinecone`: `namespace`, `dimension`, `top_k`
   - `weaviate`: `HNSW`, `efConstruction`, `multi-tenancy`
   - `qdrant`: `HNSW`, `ef_construct`, `payload index`
   - `chromadb`: `embedding_function`, `hnsw:space`, `where`
   - `milvus`: `IVF`, `nprobe`, `consistency level`
   - `pgvector`: `ivfflat`, `hnsw`, `ef_search`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 6 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (none required in this family) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 7 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 6 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-aiml-vectordb-guides.test.js` (zero doubles — reads the 6 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of pinecone · weaviate · qdrant · chromadb · milvus · pgvector (official docs / release notes / PyPI / npm / GitHub releases)
- [ ] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [ ] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [ ] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 6 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 6 files + the test file.
- [ ] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [ ] Wire in real CWE links + web-verified version tokens per the File Specifications
- [ ] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [ ] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [ ] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [ ] Diff is additive on all 6 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [ ] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [ ] Remove redundant prose

### Step 13: SECURE
- [ ] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [ ] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [ ] Safe file operations — only the 7 enumerated files touched

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [ ] Confirm `.ctoc/skills.json` still indexes the pinecone · weaviate · qdrant · chromadb · milvus · pgvector triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s6") so the completeness check (s31) has no silent omissions
- [ ] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed correctly; all quality checks passed
- [ ] Only the 7 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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
