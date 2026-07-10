---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.834Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Distributed & serverless SQL (cockroachdb · planetscale · neon · supabase)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/cockroachdb.md
  - skills/frameworks/data/planetscale.md
  - skills/frameworks/data/neon.md
  - skills/frameworks/data/supabase.md
  - tests/cu4a-data-sql-newsql-guides.test.js
---

# CU4a s17 — Distributed & serverless SQL (cockroachdb · planetscale · neon · supabase)

> Slice 17 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (cockroachdb · planetscale · neon · supabase) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: distributed/serverless Postgres/MySQL: connection-pooling for serverless, retryable-transaction/contention semantics, branching, and row-level-security access control. Adds one content-contract test that reads the REAL guide
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
distributed/serverless Postgres/MySQL: connection-pooling for serverless, retryable-transaction/contention semantics, branching, and row-level-security access control. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/cockroachdb.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-newsql-guides.test.js
skills/frameworks/data/planetscale.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-newsql-guides.test.js
skills/frameworks/data/neon.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-newsql-guides.test.js
skills/frameworks/data/supabase.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-sql-newsql-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/cockroachdb.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for cockroachdb edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Transaction footguns** — SERIALIZABLE-only → client-side retry loop on `40001` retry errors, contention/hotspots on sequential keys (use hash-sharded/UUID), `AS OF SYSTEM TIME` follower reads
- **Distribution** — range splits, locality
- **Security** — parameterized queries (CWE-89), RBAC, cert auth
- **Version** — CockroachDB current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/planetscale.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for planetscale edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Schema footguns** — no foreign keys by default (Vitess), online schema change via deploy requests + branches, connection limits, `@planetscale/database` serverless driver over HTTP, no long transactions across shards
- **Correctness** — eventual read replicas
- **Security** — parameterized queries (CWE-89), password scopes
- **Version** — PlanetScale/Vitess current behavior, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/neon.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for neon edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Serverless footguns** — scale-to-zero cold start, pooled (`-pooler`, PgBouncer transaction mode → no session state/prepared-statement caveats) vs direct connection, branching copy-on-write, compute autoscaling
- **Correctness** — connection-per-request in serverless
- **Security** — parameterized queries (CWE-89), RLS, branch credentials
- **Version** — Neon current behavior + driver, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/supabase.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for supabase edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **RLS footguns** — Row-Level Security is the auth boundary — a table without RLS policies is fully public via the anon key (CWE-284 broken access control); `auth.uid()` policies, `service_role` bypasses RLS (never ship to client)
- **Connection** — pooler (Supavisor) for serverless
- **Security** — anon vs service_role key separation (CWE-798), parameterized RPC
- **Version** — Supabase current platform, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-sql-newsql-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — cockroachdb · planetscale · neon · supabase):
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
   - `cockroachdb`: `40001`, `retry`, `AS OF SYSTEM TIME`
   - `planetscale`: `deploy request`, `foreign key`, `CWE-89`
   - `neon`: `pooler`, `scale-to-zero`, `RLS`
   - `supabase`: `RLS`, `service_role`, `CWE-284`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-89, CWE-284) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-data-sql-newsql-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of cockroachdb · planetscale · neon · supabase (official docs / release notes / PyPI / npm / GitHub releases)
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
- [ ] Confirm `.ctoc/skills.json` still indexes the cockroachdb · planetscale · neon · supabase triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s17") so the completeness check (s31) has no silent omissions
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

Executed Steps 8–16 (TDD) on 2026-07-10. Barrier pattern: verified ONLY the slice
test, left everything UNSTAGED, did not touch the audit ledger (Step 15 ledger append
is deferred to the caller per barrier-pattern instruction — recorded here instead).

### Web-verified facts (source URL + retrieval date, all ≥ 2025-01-01)
- **CockroachDB v26.2.3** current stable, tag committed **2026-06-24**
  (v25.4.x is the current LTS line). Source: github.com/cockroachdb/cockroach releases
  (GitHub tags API), retrieved 2026-07-10.
- **@planetscale/database 1.20.1** current serverless HTTP driver, published
  **2026-03-25**. Source: registry.npmjs.org/@planetscale/database, retrieved 2026-07-10.
- **@neondatabase/serverless 1.1.0** current driver, published **2026-04-17**.
  Source: registry.npmjs.org/@neondatabase/serverless, retrieved 2026-07-10.
- **@supabase/supabase-js 2.110.2** current client, published **2026-07-09**.
  Source: registry.npmjs.org/@supabase/supabase-js, retrieved 2026-07-10.

### Verified identifiers / CWE / error codes (all real, sourced)
- **CWE-89** "Improper Neutralization of Special Elements used in an SQL Command
  ('SQL Injection')" (4.20) — cwe.mitre.org/data/definitions/89.html. Used in
  cockroachdb, planetscale, neon, supabase.
- **CWE-284** "Improper Access Control" (4.20) — cwe.mitre.org/data/definitions/284.html.
  Used in supabase (RLS is the auth boundary).
- **CWE-798** "Use of Hard-coded Credentials" (4.20) — cwe.mitre.org/data/definitions/798.html.
  Used in supabase (service_role key leak).
- **SQLSTATE 40001** = `serialization_failure` (CockroachDB retryable txn error) —
  cockroachlabs.com/docs/stable/transaction-retry-error-reference (HTTP 200, 2026-07-10).
- **AS OF SYSTEM TIME / follower reads** — cockroachlabs.com/docs/stable/as-of-system-time (200).
- **Hash-sharded indexes** — cockroachlabs.com/docs/stable/hash-sharded-indexes (200).
- **PlanetScale no-FK (Vitess)** — planetscale.com/docs/vitess/operating-without-foreign-key-constraints (200).
- **PlanetScale deploy requests** — planetscale.com/docs/concepts/deploy-requests (200);
  **branching** …/branching (200); **Query Insights** …/query-insights (200).
- **Neon connection pooling (-pooler / PgBouncer txn mode)** — neon.com/docs/connect/connection-pooling
  (canonical redirects neon.tech → neon.com, 200); **serverless driver**
  neon.com/docs/serverless/serverless-driver (200); **branching**
  neon.com/docs/introduction/branching (200); **autoscaling** …/autoscaling (200).
- **Supabase RLS** — supabase.com/docs/guides/database/postgres/row-level-security (200);
  **API keys (anon vs service_role)** …/guides/api/api-keys (200); **realtime authorization**
  …/guides/realtime/authorization (200); **Supavisor / connecting** …/database/connecting-to-postgres (200);
  **PostgREST joins** …/database/joins-and-nesting (200).

### Omitted for lack of a dated authoritative source (per omit-if-unverifiable rule)
- Neon "~500ms" specific cold-start figure was already in the pre-existing "Version
  Gotchas" section (kept verbatim, no-churn); the NEW Serverless-Footguns section
  states the cold-start penalty qualitatively ("a few hundred ms") rather than assert a
  precise number I could not pin to a current dated Neon doc.
- The Neon-specific RLS tooling page (neon.com/docs/guides/neon-rls-authorize) returned
  404 at edit time; RLS is described generically as standard-Postgres RLS and cited to
  the Supabase/Postgres RLS surface instead — no fabricated Neon-RLS URL was asserted.
- No CVE was cited for any of the four platforms: no current, dated platform-specific
  CVE was verifiable against NVD/MITRE at edit time, so per the hard rule none was
  asserted (the guides cite CWE classes, which are stable weakness identifiers, not CVEs).

### Design decisions
- **Performance section added** to planetscale/neon/supabase (cockroachdb already had a
  hot-ranges Performance section) to satisfy the required-section contract — real,
  framework-specific perf footguns (Vitess scatter-gather, HTTP round-trip N+1, RLS
  per-row auth.uid() re-eval), not padding.
- **No-churn honored**: the original 5 template sections + H1 `# <Framework> CTO` header
  are preserved verbatim in all 4 files; new sections appended below. Final section
  counts: cockroachdb 12, planetscale 13, neon 13, supabase 14 (all > 5).
- **Single-framework examples only** (7-language rule exempt per CU4a); each guide's
  code is in its own framework and idiomatic to the current driver version.
