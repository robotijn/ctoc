---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.932Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Key-value & caching stores (redis · valkey · memcached)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/redis.md
  - skills/frameworks/data/valkey.md
  - skills/frameworks/data/memcached.md
  - tests/cu4a-data-kv-cache-guides.test.js
---

# CU4a s19 — Key-value & caching stores (redis · valkey · memcached)

> Slice 19 of the CU4a decomposition. De-stub the 3 thin **data** framework
> guides (redis · valkey · memcached) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: KV/cache: eviction + memory-policy footguns, big-key/blocking-command latency, cache stampede/invalidation, and unauthenticated-exposure RCE class. Adds one content-contract test that reads the REAL guide
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
rewritten (no-churn)"** — for these 3 files.

## Implementation Details

### Architecture Decision

Single-framework reference guides → the **7-language BAD/SAFE cross-coverage rule does NOT apply**
(CU4a single-framework exemption). Each guide's examples are in ITS OWN framework, correct +
idiomatic + current-version. Bar = depth-within-framework, objectively gated: every added `## `
section names a concrete identifier (version number, CWE id, or API/function name); every
version/security claim carries an inline dated http source ≥ 2025-01-01.

**No-churn (extend, never overwrite):** each of the 3 guides has exactly 5 `## ` sections today
(confirmed by reading fresh 2026-07-10). The existing 5 sections are preserved verbatim; new
sections are ADDED below them. The H1 `# <Framework> CTO` header + any frontmatter stay intact so
`.ctoc/skills.json` trigger indexing is unaffected.

Grouping rationale: these 3 are ONE research pass because the correction spine is shared —
KV/cache: eviction + memory-policy footguns, big-key/blocking-command latency, cache stampede/invalidation, and unauthenticated-exposure RCE class. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/redis.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-kv-cache-guides.test.js
skills/frameworks/data/valkey.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-kv-cache-guides.test.js
skills/frameworks/data/memcached.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-kv-cache-guides.test.js
```

3 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/redis.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for redis edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Blocking footguns** — `KEYS`/`FLUSHALL` block the single thread (use `SCAN`), big-key + `O(N)` commands, `maxmemory-policy` eviction (noeviction = write errors), cache stampede (locking/jitter TTL), pipelining
- **Persistence** — RDB/AOF trade-off
- **Security** — no auth by default historically → RCE via unauthenticated exposure; require ACL/`requirepass` + protected-mode, never bind public
- **Version** — Redis current release (license note), dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/valkey.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for valkey edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Blocking footguns** — same single-thread model (Redis fork): `SCAN` over `KEYS`, eviction policy, big keys; multi-threaded I/O caveats
- **Compatibility** — Redis-API compatible fork, module differences
- **Security** — ACL/`requirepass`, TLS, no public bind (RCE class)
- **Version** — Valkey current release + Redis-compat level, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/memcached.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for memcached edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Cache footguns** — slab allocator + item-size limit (default 1MB), LRU eviction (no persistence), no built-in clustering (client-side hashing), connection limits
- **Correctness** — no atomic multi-key, `cas` for compare-and-swap
- **Security** — UDP amplification history → disable UDP; never expose unauthenticated to internet
- **Version** — memcached current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-kv-cache-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 3 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — redis · valkey · memcached):
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
   - `redis`: `SCAN`, `maxmemory-policy`, `protected-mode`
   - `valkey`: `SCAN`, `ACL`, `eviction`
   - `memcached`: `slab`, `LRU`, `cas`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 3 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (none required in this family) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 4 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 3 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-data-kv-cache-guides.test.js` (zero doubles — reads the 3 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of redis · valkey · memcached (official docs / release notes / PyPI / npm / GitHub releases)
- [ ] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [ ] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [ ] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 3 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 3 files + the test file.
- [ ] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [ ] Wire in real CWE links + web-verified version tokens per the File Specifications
- [ ] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [ ] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [ ] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [ ] Diff is additive on all 3 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [ ] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [ ] Remove redundant prose

### Step 13: SECURE
- [ ] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [ ] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [ ] Safe file operations — only the 4 enumerated files touched

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [ ] Confirm `.ctoc/skills.json` still indexes the redis · valkey · memcached triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s19") so the completeness check (s31) has no silent omissions
- [ ] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed correctly; all quality checks passed
- [ ] Only the 4 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

Executed under the BARRIER PATTERN: implemented Steps 8–16, verified ONLY this slice's
own test (`tests/cu4a-data-kv-cache-guides.test.js`, NOT the full suite), left everything
UNSTAGED, did NOT touch the audit ledger (`.ctoc/audit/corpus-audit-2026-06-15.json`).
Step 15's "append to audit ledger" sub-item is therefore intentionally deferred to the
caller/ledger-owner per the barrier instruction (avoids a concurrent-write clobber with
sibling slices editing the same JSON).

### Web-verified facts (retrieved 2026-07-10) — every version/CVE/CWE cited on disk

Redis:
- Redis **8.8.0** current stable, published 2026-05-25; 8.6.x patch line (8.6.4, 2026-06-04).
  Source: https://github.com/redis/redis/releases (GitHub releases API).
- **Tri-license from Redis 8** (RSALv2 / SSPLv1 / AGPLv3); 7.2 and earlier remain BSD-3-Clause.
  Source: https://github.com/redis/redis/blob/8.8.0/LICENSE.txt (LICENSE.txt head confirms).
- **CVE-2024-31449** — authenticated Lua `bit`-library stack buffer overflow → potential RCE,
  CVSS 7.0, fixed in 6.2.16 / 7.2.6 / 7.4.1 (CWE-94 code-injection class).
  Source: https://nvd.nist.gov/vuln/detail/CVE-2024-31449 (NVD API description + CVSS confirmed).
- **CWE-306** Missing Authentication for Critical Function; **CWE-1188** Initialization of a
  Resource with an Insecure Default; **CWE-94** Improper Control of Generation of Code.
  Sources: https://cwe.mitre.org/data/definitions/{306,1188,94}.html (titles confirmed live).

Valkey:
- Valkey **9.1.0** current stable, published 2026-05-19; 8.1.x maintained line (8.1.8, 2026-06-02).
  Source: https://github.com/valkey-io/valkey/releases (GitHub releases API).
  NOTE: plan File Spec anticipated "Valkey 8.x"; the web-verified current stable is 9.1.0,
  so the guide (and the test regex) name 9.1.0/8.1.x — real over anticipated. Test regex
  widened from `/Valkey 8\./` to `/Valkey (9|8)\./` to match the verified truth.
- **BSD-3-Clause** (SPDX `BSD-3-Clause`); fork base is Redis 7.2; forked 2024 due to the Redis 8
  relicense; Linux Foundation project.
  Source: https://github.com/valkey-io/valkey/blob/9.1.0/COPYING (SPDX line + BSD text confirmed).

Memcached:
- Memcached **1.6.45** current stable, tag committed 2026-07-10.
  Source: https://github.com/memcached/memcached/releases (tags/commit date via GitHub API).
- **CVE-2018-1000115 / CWE-406** UDP amplification (Network Amplification); UDP off by default
  since 1.5.6. Source: https://nvd.nist.gov/vuln/detail/CVE-2018-1000115 (NVD description names
  CWE-406). CWE-406 title confirmed: https://cwe.mitre.org/data/definitions/406.html.
- Default max item size 1 MB (1048576), default `-c 1024` connections, `-I` raises item size —
  memcached.org wiki/protocol. Sources linked in the guide's References.

### Claims OMITTED for lack of a dated authoritative source
- None. Every version, CVE, CWE, and default value asserted on disk resolved to an official
  source (github.com releases, nvd.nist.gov, cwe.mitre.org) retrieved 2026-07-10. Broad
  operational tuning (growth factor, io-threads) is cited to the projects' own docs, not
  invented numbers.

### Test-shape decisions
- Mirrored the sibling `tests/cu4a-data-warehouse-guides.test.js` structure exactly (zero
  doubles, `fs.readFileSync` off the real guides). Added a per-file CWE-token + cwe.mitre.org
  assertion because this family's shared spine is the unauthenticated-exposure RCE class
  (CWE-306/1188) rather than SQL-injection (CWE-89). Per-framework identifier assertions
  (redis: SCAN/maxmemory-policy/protected-mode/RDB/AOF/Lua; valkey: SCAN/ACL/eviction/TLS/BSD;
  memcached: slab/LRU/cas/UDP/1MB) gate substance over padding.
