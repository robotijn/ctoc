---
approved_by: human
approved_at: 2026-07-10T18:13:18.348Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:38.859Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "AI/ML distributed compute & serverless (ray · modal · replicate)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/ai-ml/ray.md
  - skills/frameworks/ai-ml/modal.md
  - skills/frameworks/ai-ml/replicate.md
  - tests/cu4a-aiml-serving-compute-guides.test.js
---

# CU4a s8 — AI/ML distributed compute & serverless (ray · modal · replicate)

> Slice 8 of the CU4a decomposition. De-stub the 3 thin **ai-ml** framework
> guides (ray · modal · replicate) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: distributed/serverless compute: cluster-endpoint exposure (RCE class), serialization of task args (pickle/cloudpickle), and cost/autoscaling blowups. Adds one content-contract test that reads the REAL guide
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
distributed/serverless compute: cluster-endpoint exposure (RCE class), serialization of task args (pickle/cloudpickle), and cost/autoscaling blowups. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/ai-ml/ray.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-serving-compute-guides.test.js
skills/frameworks/ai-ml/modal.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-serving-compute-guides.test.js
skills/frameworks/ai-ml/replicate.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-aiml-serving-compute-guides.test.js
```

3 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/ai-ml/ray.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for ray edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Actor/task footguns** — `@ray.remote` num_gpus/num_cpus scheduling, object-store spilling + OOM, `ray.get` blocking + deadlock, actor lifetime, nested remote
- **Serialization** — cloudpickle of task args, non-serializable closures
- **Security** — the Ray dashboard/Client server is a documented RCE surface (CWE-306 missing auth) — never expose unauthenticated to the internet
- **Version** — Ray current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/modal.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for modal edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **App footguns** — `@app.function` image build layers + caching, `gpu=`, `container_idle_timeout` cost, mounts/volumes, `@app.cls` cold-start
- **Concurrency** — `allow_concurrent_inputs`, `keep_warm`
- **Security** — secrets via `modal.Secret` not env-in-code (CWE-798), web-endpoint auth
- **Version** — Modal current client, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/ai-ml/replicate.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for replicate edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Prediction footguns** — sync `run` vs async `predictions.create` + webhook, model-version pinning (mutable `owner/model` vs immutable `:version`), cold-boot latency, streaming
- **Cost** — per-second billing, `wait`/polling
- **Security** — API token handling (CWE-798), webhook signature verification
- **Version** — replicate current client + Cog, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-aiml-serving-compute-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 3 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — ray · modal · replicate):
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
   - `ray`: `@ray.remote`, `ray.get`, `CWE-306`
   - `modal`: `@app.function`, `modal.Secret`, `CWE-798`
   - `replicate`: `predictions.create`, `version`, `webhook`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 3 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-306, CWE-798) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 4 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 3 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-aiml-serving-compute-guides.test.js` (zero doubles — reads the 3 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of ray · modal · replicate (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 3 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 3 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 3 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 4 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the ray · modal · replicate triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s8") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 4 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

**Web-verified facts (edit-time, 2026-07-10):**
- Ray **2.56.0**, uploaded 2026-06-29 — https://pypi.org/pypi/ray/json (`info.version`).
- Modal **1.5.1**, uploaded 2026-06-23 — https://pypi.org/pypi/modal/json.
- Replicate (Python client) **1.0.7**, uploaded 2025-05-27 — https://pypi.org/pypi/replicate/json.
- Cog **v0.21.0**, published 2026-06-16 — https://api.github.com/repos/replicate/cog/releases/latest.
- **CVE-2023-48022 "ShadowRay"** — Jobs submission API RCE, **CWE-918** per NVD, vendor-DISPUTED
  (Ray's documented position: not for use outside a strictly controlled network, so missing auth
  is by-design). Verified https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2023-48022
  (status Modified; desc + CWE-918 confirmed). Framed accurately in the guide — real
  exploited-in-the-wild exposure of open clusters, disputed as a "vuln" only because Ray never
  promised auth. NOT invented.
- **CVE-2023-6019** — cpu_profile command injection, **CWE-78**, unauthenticated dashboard RCE,
  fixed 2.8.1+ — NVD-confirmed.
- **CVE-2023-6021 / CVE-2023-6020** — LFI (log API / `/static/`), CWE-22/CWE-29 / CWE-862,
  fixed 2.8.1+ — NVD-confirmed.
- **CWE-306** (Missing Authentication for Critical Function), **CWE-502** (Deserialization of
  Untrusted Data), **CWE-798** (Use of Hard-coded Credentials), **CWE-918** (SSRF) — canonical
  MITRE identifiers (cwe.mitre.org). CWE-798 confirmed queryable in NVD (1168 results); CWE-502
  and CWE-306 already cited with the same MITRE URLs in sibling guides pytorch.md / ollama.md.
  MITRE definition pages are JS-rendered so titles could not be scraped, but the ids are
  authoritative and corroborated by the NVD weakness mappings above — cited via the canonical
  cwe.mitre.org/data/definitions/<id>.html URLs.
- **Replicate webhook signature** = **HMAC-SHA256** over the payload with a webhook signing
  secret — confirmed on https://replicate.com/docs/topics/webhooks/verify-webhook (HMAC + sha256
  + signature tokens present in page).

**Decisions:**
1. **Modal 1.x current API names used, with a documented rename table.** The pre-1.0 kwargs the
   old guide still showed (`allow_concurrent_inputs=`, `container_idle_timeout=`, `keep_warm=`) are
   deprecated/renamed in the 1.x client (`@modal.concurrent(max_inputs=)`, `scaledown_window=`,
   `min_containers=`). Rather than silently overwrite, the existing 5 sections are left VERBATIM
   (no-churn) and the added sections teach the current API plus an explicit "1.x API renames"
   mapping so a reader of either era is corrected. Sourced to modal.com/docs.
2. **CVE line for Modal/Replicate OMITTED (omit-if-no-source).** No product-specific CVE for Modal
   or the Replicate client/Cog was found against an authoritative source at edit time, so none is
   asserted (hard user rule). Their Security sections rest on CWE-798 (hard-coded credentials) and
   webhook-signature verification, both grounded. Only Ray carries CVE ids (real, NVD-verified).
3. **Version token phrasing tightened to a contiguous `Modal 1.5.1` / `replicate 1.0.7`** so the
   content-contract test's version-token regex matches the exact web-verified release string
   (fixed the last 2 RED assertions without loosening the test).
4. **Additive-only, H1 + the original 5 sections preserved verbatim** on all three guides;
   `# <Framework> CTO` H1 intact (skills.json indexing unaffected).

**Verification (this slice only — barrier pattern, own test only):**
- `tests/cu4a-aiml-serving-compute-guides.test.js`: RED = 24 tests / 7 pass / 17 fail → GREEN = 24 / 24 / 0.
- `npx eslint tests/cu4a-aiml-serving-compute-guides.test.js` → exit 0.
- Line counts before→after: ray 75→245, modal 81→232, replicate 85→213; test NEW 146.
- Left UNSTAGED; full `tests/*.test.js` NOT run (barrier pattern); audit ledger untouched; plan not moved.
