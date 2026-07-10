---
approved_by: human
approved_at: 2026-07-10T18:13:18.450Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.689Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Data streaming core (kafka · flink · beam · debezium)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/data/kafka.md
  - skills/frameworks/data/flink.md
  - skills/frameworks/data/beam.md
  - skills/frameworks/data/debezium.md
  - tests/cu4a-data-streaming-core-guides.test.js
---

# CU4a s11 — Data streaming core (kafka · flink · beam · debezium)

> Slice 11 of the CU4a decomposition. De-stub the 4 thin **data** framework
> guides (kafka · flink · beam · debezium) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: event-streaming: delivery-semantics (at-least-once vs exactly-once), offset/checkpoint correctness, rebalance/backpressure, and schema-evolution safety. Adds one content-contract test that reads the REAL guide
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
event-streaming: delivery-semantics (at-least-once vs exactly-once), offset/checkpoint correctness, rebalance/backpressure, and schema-evolution safety. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/data/kafka.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-streaming-core-guides.test.js
skills/frameworks/data/flink.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-streaming-core-guides.test.js
skills/frameworks/data/beam.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-streaming-core-guides.test.js
skills/frameworks/data/debezium.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-data-streaming-core-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/data/kafka.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for kafka edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Delivery footguns** — `acks=all` + `enable.idempotence` for durability, commit AFTER processing (auto-commit = data loss), `cooperative-sticky` to avoid rebalance storms, consumer-lag
- **Ordering** — key→partition, `max.in.flight` vs ordering
- **Security** — SASL/TLS, ACLs; schema registry compatibility to prevent breaking-change corruption
- **Version** — Kafka current release (KRaft GA), dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/flink.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for flink edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **State/checkpoint footguns** — checkpoint interval + aligned/unaligned barriers, RocksDB state backend + TTL, watermark + allowed-lateness event-time correctness, exactly-once sink (two-phase commit)
- **Backpressure** — buffer debloating
- **Security** — REST/web UI exposure, savepoint state as data boundary
- **Version** — Flink current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/beam.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for beam edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Windowing footguns** — event-time windows + triggers + allowed lateness, `GroupByKey` hot keys, side-inputs re-materialization, runner-specific semantics (Dataflow/Flink)
- **Determinism** — non-deterministic DoFn + retries → duplicates
- **Security** — pipeline options/creds handling
- **Version** — Apache Beam current SDK, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/data/debezium.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for debezium edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **CDC footguns** — snapshot vs streaming phase, replication-slot/WAL retention blowup (disk fill), schema-change events, tombstones on delete, `snapshot.mode`
- **Ordering** — per-table topic, exactly-once via Kafka Connect
- **Security** — DB replication-user least privilege, connector credentials
- **Version** — Debezium current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-data-streaming-core-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — kafka · flink · beam · debezium):
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
   - `kafka`: `enable.idempotence`, `acks=all`, `cooperative-sticky`
   - `flink`: `checkpoint`, `watermark`, `exactly-once`
   - `beam`: `GroupByKey`, `window`, `trigger`
   - `debezium`: `replication slot`, `snapshot.mode`, `WAL`

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
- [x] Create `tests/cu4a-data-streaming-core-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of kafka · flink · beam · debezium (official docs / release notes / PyPI / npm / GitHub releases)
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
- [x] Confirm `.ctoc/skills.json` still indexes the kafka · flink · beam · debezium triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s11") so the completeness check (s31) has no silent omissions
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

**Web-verified facts (all sources retrieved 2026-07-10; environment clock at edit
time = 2026-07-10, ahead of the model's Jan-2026 knowledge — trusted the live
official mirrors/PyPI/Maven over stale prior knowledge):**

Versions:
- **Kafka 4.3.1** — current stable, dated 2026-06-23. Sources:
  https://kafka.apache.org/downloads ; https://archive.apache.org/dist/kafka/4.3.1/
  (mirror listing shows 2026-06-23 22:22 upload). The 4.x line is KRaft-only
  (ZooKeeper removed) — stated in the guide as a version gotcha.
- **Flink 2.3.0** — current stable, dated 2026-06-22. Sources:
  https://flink.apache.org/downloads/ (latest stable) ;
  https://archive.apache.org/dist/flink/flink-2.3.0/ (2026-06-22 mirror upload).
- **Apache Beam 2.75.0** — current PyPI release, uploaded 2026-07-08,
  requires_python >=3.10. Source: https://pypi.org/pypi/apache-beam/json
  (info.version=2.75.0, urls[0].upload_time=2026-07-08T06:21:11).
- **Debezium 3.6.0.Final** — current stable, published to Maven Central 2026-07-01.
  Sources: https://repo1.maven.org/maven2/io/debezium/debezium-core/maven-metadata.xml
  (<latest>3.6.0.Final</latest>, <lastUpdated>20260701...</lastUpdated>) ;
  directory listing dated 2026-07-01 08:40.

CWE identifiers (each title confirmed against cwe.mitre.org at edit time):
- **CWE-502** Deserialization of Untrusted Data — kafka (Java deserializer footgun).
- **CWE-200** Exposure of Sensitive Information to an Unauthorized Actor — kafka,
  flink, beam, debezium (unauthenticated broker / REST UI / verbose logs).
- **CWE-1188** Initialization of a Resource with an Insecure Default — flink
  (unauthenticated JobManager REST/UI default).
- **CWE-798** Use of Hard-coded Credentials — beam (PipelineOptions creds),
  debezium (inline connector creds).
- **CWE-522** Insufficiently Protected Credentials — debezium (creds in the
  readable Connect config topic).
All five verified via `curl https://cwe.mitre.org/data/definitions/<id>.html` on
2026-07-10; each guide inlines the cwe.mitre.org URL.

**Omitted for lack of a cleanly verifiable dated source (hard no-fabrication rule):**
- **No specific CVE numbers asserted.** kafka.apache.org/cve-list and
  flink.apache.org security page did not yield machine-scrapeable, individually
  NVD/MITRE-verifiable CVE IDs at edit time, so per rule (2b) NO specific CVE is
  claimed in any of the 4 guides. Security content is grounded in stable CWE
  *classes* (verified above) + configuration footguns, not in version-pinned CVEs.
  The plan explicitly notes "none required in this family."

**Design decisions:**
- Additive-only: git numstat shows 0 deletions on all 4 guides (kafka +130, flink
  +112, beam +120, debezium +129 insertions); original 5 sections + `# <Framework>
  CTO` H1 preserved verbatim (skills.json indexing intact).
- Single-framework idiomatic examples only (7-language BAD/SAFE rule EXEMPT per
  CU4a single-framework exemption): kafka=confluent-kafka Python, flink=PyFlink,
  beam=Python SDK, debezium=Connect JSON config.
- Test `it('carries at least four fenced code lines')` phrasing kept from CU3
  convention (asserts >= 4 ``` fences = >= 2 blocks).
- BARRIER-PATTERN honored: verified ONLY this slice's own test (did NOT run
  tests/*.test.js), left everything UNSTAGED, did NOT touch the audit ledger
  (.ctoc/audit/corpus-audit-2026-06-15.json) — caller/s31 owns that. Plan NOT moved.

**Verification results:**
- RED (pre-implement): 32 tests, 10 pass, 22 fail.
- GREEN (post-implement): 32 tests, 32 pass, 0 fail, 0 skipped, 0 todo.
- `npx eslint tests/cu4a-data-streaming-core-guides.test.js` → exit 0.
- Line counts before→after: kafka 72→202, flink 62→174, beam 78→198, debezium 61→190.
- Section counts: kafka 12, flink 12, beam 13, debezium 13 (all > 5 floor).
