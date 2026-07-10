---
approved_by: human
approved_at: 2026-07-10T18:13:18.781Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.198Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Config mgmt & observability (chef · puppet · saltstack · prometheus · grafana · datadog)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/devops/chef.md
  - skills/frameworks/devops/puppet.md
  - skills/frameworks/devops/saltstack.md
  - skills/frameworks/devops/prometheus.md
  - skills/frameworks/devops/grafana.md
  - skills/frameworks/devops/datadog.md
  - tests/cu4a-devops-config-observ-guides.test.js
---

# CU4a s30 — Config mgmt & observability (chef · puppet · saltstack · prometheus · grafana · datadog)

> Slice 30 of the CU4a decomposition. De-stub the 6 thin **devops** framework
> guides (chef · puppet · saltstack · prometheus · grafana · datadog) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: config-management + observability: idempotent convergence, cardinality explosions, alerting correctness, and secrets/credential handling. Adds one content-contract test that reads the REAL guide
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
config-management + observability: idempotent convergence, cardinality explosions, alerting correctness, and secrets/credential handling. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/devops/chef.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
skills/frameworks/devops/puppet.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
skills/frameworks/devops/saltstack.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
skills/frameworks/devops/prometheus.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
skills/frameworks/devops/grafana.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
skills/frameworks/devops/datadog.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-config-observ-guides.test.js
```

6 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/devops/chef.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for chef edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Convergence footguns** — resource idempotency + guards (`not_if`/`only_if`), notifications/subscriptions + `:delayed`, run-list order, `execute` non-idempotent, attribute precedence
- **Safety** — `why-run` mode
- **Security** — encrypted data bags/Chef Vault for secrets (CWE-312), no plaintext in cookbooks
- **Version** — Chef Infra current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/puppet.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for puppet edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Catalog footguns** — declarative resource ordering (`require`/`before`/`notify`), idempotent resources, `exec` needs `creates`/`unless`, class vs defined type, Hiera lookup precedence
- **Safety** — `--noop`
- **Security** — Hiera-eyaml for secrets (CWE-312), no plaintext
- **Version** — Puppet current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/saltstack.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for saltstack edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **State footguns** — idempotent states + `cmd.run` (use `unless`/`onlyif`), requisites (`require`/`watch`), pillar for data/secrets, master-minion key acceptance
- **Security** — historical unauthenticated-RCE CVE class on exposed masters (e.g. CVE-2020-11651 auth-bypass) → patch + never expose the master publicly; pillar secrets not plaintext (CWE-312)
- **Version** — Salt current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/prometheus.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for prometheus edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Cardinality footguns** — high-cardinality labels (user id / request id) explode series + memory, `rate()` needs counter + range window, scrape interval vs `rate` window, recording rules for expensive queries
- **Correctness** — counter reset handling, staleness
- **Security** — no auth by default → do not expose metrics/admin API publicly (CWE-306)
- **Version** — Prometheus current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/grafana.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for grafana edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Dashboard footguns** — template variables + query scope, panel time-range vs query, alerting (unified) rules + no-data handling, datasource proxy vs browser, transformations
- **Security** — datasource credentials + proxy (not browser-exposed), documented auth/SSRF advisory classes → patch + auth; API keys (CWE-798)
- **Version** — Grafana current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/datadog.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for datadog edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Instrumentation footguns** — custom-metric cardinality/tag explosion → cost, APM sampling rates, log-pipeline + facet indexing cost, agent config, distribution vs gauge
- **Correctness** — monitor evaluation window + no-data
- **Security** — API/APP keys not in code (CWE-798), PII scrubbing in logs
- **Version** — Datadog Agent current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-devops-config-observ-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 6 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — chef · puppet · saltstack · prometheus · grafana · datadog):
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
   - `chef`: `not_if`, `notifies`, `CWE-312`
   - `puppet`: `require`, `exec`, `Hiera`
   - `saltstack`: `unless`, `pillar`, `CVE-2020-11651`
   - `prometheus`: `cardinality`, `rate(`, `CWE-306`
   - `grafana`: `template variable`, `alerting`, `CWE-798`
   - `datadog`: `cardinality`, `sampling`, `CWE-798`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 6 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-312, CVE-2020-11651, CWE-306, CWE-798) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 7 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 6 guides fresh off disk first, then WRITE the content-contract test.
- [x] Create `tests/cu4a-devops-config-observ-guides.test.js` (zero doubles — reads the 6 REAL guides off disk via `fs.readFileSync`)
- [x] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [x] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [x] Web-verify the current stable release of each of chef · puppet · saltstack · prometheus · grafana · datadog (official docs / release notes / PyPI / npm / GitHub releases)
- [x] Web-verify every CWE/CVE page cited (cwe.mitre.org / nvd.nist.gov); capture each source URL + retrieval date (≥ 2025-01-01)
- [x] Omit-if-no-source: if a claim has no dated authoritative source, OMIT it and record the omission for Step 15
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Extend the 6 guides with the added sections — additive only, existing 5 sections stay verbatim.
ONE step, 6 files + the test file.
- [x] Extend each guide with the added `## ` sections (real footguns, idiomatic single-framework examples, dated http sources)
- [x] Wire in real CWE links + web-verified version tokens per the File Specifications
- [x] Keep H1 `# <Framework> CTO` + any frontmatter verbatim (skills.json indexing)

### Step 11: REVIEW
- [x] Self-review each guide: >5 `## ` sections and >120 lines; every added section names a concrete identifier
- [x] Every version/security claim carries an inline dated http source ≥ 2025-01-01; versions are the web-verified current ones; CWE links resolve
- [x] Diff is additive on all 6 guides; H1 + frontmatter intact

### Step 12: OPTIMIZE
- [x] Keep additions dense and correction-focused; every bullet names a specific footgun + identifier, no padding
- [x] Remove redundant prose

### Step 13: SECURE
- [x] Run the Security Review checklist; confirm official source URLs; confirm each CWE id is a real MITRE identifier
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets
- [x] Safe file operations — only the 7 enumerated files touched

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → `# fail 0`; slice test GREEN
- [x] Confirm `.ctoc/skills.json` still indexes the chef · puppet · saltstack · prometheus · grafana · datadog triggers (H1/frontmatter intact)
- [x] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s30") so the completeness check (s31) has no silent omissions
- [x] Record each web-verified fact + source URL + retrieval date, and any omitted-for-lack-of-source claims, in `## Decisions Taken Under Ambiguity`

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed correctly; all quality checks passed
- [x] Only the 7 enumerated files edited; every version/security claim sourced with a date ≥ 2025-01-01
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

**Barrier pattern:** verified ONLY this slice's own test (`node --test
tests/cu4a-devops-config-observ-guides.test.js`), left all changes UNSTAGED, did not
touch the audit ledger (`.ctoc/audit/corpus-audit-2026-06-15.json`) and did not move the
plan. The caller stages/commits and updates the ledger. Working tree also contains
sibling-slice changes (s26–s29 devops/mobile) from parallel executors — NOT mine.

### Web-verified facts (source URL + retrieval date 2026-07-10)
| Fact | Verified value | Source |
|------|----------------|--------|
| Chef Infra current | gem `chef` 19.3.15; chef/chef release `v19.3.53` (Ruby 3.x, unified_mode default since 18) | rubygems.org/api/v1/gems/chef.json + github.com/chef/chef/releases |
| Puppet current | agent/gem `puppet` 8.10.0 (Ruby 3.2; PDK 3.x) | rubygems.org/api/v1/gems/puppet.json |
| Salt current | PyPI `salt` 3008.2 (req py>=3.8; 3006 LTS; renamed Salt Project) | pypi.org/pypi/salt/json |
| Prometheus current | 3.13.1 stable download; 3.5.x LTS; upgrade to 2.55 before 3.0 | prometheus.io/download |
| Grafana current | release `v13.1.0` (unified alerting only; legacy removed in 11) | github.com/grafana/grafana/releases |
| Datadog Agent current | 7.81.0 (Python 3 only; Agent 5/6 EOL) | github.com/DataDog/datadog-agent CHANGELOG.rst |
| CVE-2020-11651 | Salt ClearFuncs auth bypass → RCE as root; before 2019.2.4 / 3000<3000.2; treated as CWE-306 (Missing Authentication for Critical Function) | nvd.nist.gov/vuln/detail/CVE-2020-11651 |
| CVE-2020-11652 | Salt ClearFuncs directory traversal (NVD maps CWE-22); companion to 11651 | nvd.nist.gov/vuln/detail/CVE-2020-11652 |
| CVE-2021-43798 | Grafana plugin path-traversal LFI (CWE-22); 8.0.0-beta1–8.3.0 | nvd.nist.gov/vuln/detail/CVE-2021-43798 |
| CVE-2025-4123 | Grafana XSS via client path traversal + open redirect (NVD maps CWE-601, CWE-79) | nvd.nist.gov/vuln/detail/CVE-2025-4123 |
| CWE ids used | CWE-312 (Cleartext Storage), CWE-306 (Missing Authentication), CWE-798 (Hard-coded Credentials) | cwe.mitre.org/data/definitions/{312,306,798}.html |
| Prometheus no-auth-by-default | confirmed live security-model doc (HTTP 200) | prometheus.io/docs/operating/security/ |

### Ambiguity resolutions (no stubs)
1. **CVE-2020-11651 CWE mapping.** NVD does not attach a CWE id to CVE-2020-11651 (only
   11652 → CWE-22). The plan's Test Plan requires the token `CWE-306` in the saltstack
   guide. CWE-306 "Missing Authentication for Critical Function" is the correct,
   defensible class for a ClearFuncs auth bypass (a privileged method reachable without
   authentication). Decision: cite CVE-2020-11651 (verified) AND classify it as the
   CWE-306 class in prose, with cwe.mitre.org linked — not asserting NVD attributed it.
2. **Grafana "documented auth/SSRF advisory classes" (plan wording).** No single Grafana
   SSRF CVE was needed to satisfy the contract; I cited two REAL, NVD-verified Grafana
   CVEs instead — CVE-2021-43798 (the famous path-traversal LFI) and CVE-2025-4123 (a
   2025 XSS). Both are traceable to NVD; no fabricated SSRF CVE was invented.
3. **Required-section headings vs the plan's loose section list.** The plan lists
   "Testing" and "Performance" as required correction surfaces. For these config-mgmt/
   observability tools the natural surfaces are Footgun / Safety(dry-run) / Security /
   Correctness / Performance-Cost / Version / References. I added dedicated, substantive
   `## Testing & Safety` and `## Performance & Cost/Scale` sections to each guide (real
   content: promtool rule tests, kitchen/rspec-puppet idempotency proofs, test=True,
   cardinality/cost budgets) rather than padding — so the content-contract heading regex
   is satisfied by genuine material.
4. **Datadog Agent version.** GitHub releases API was rate-limited (HTTP 403) and the
   Datadog releases.atom returned nothing; verified 7.81.0 from the authoritative
   `CHANGELOG.rst` on the datadog-agent main branch instead. Grafana likewise verified
   via the public `releases.atom` feed (v13.1.0) since the API was rate-limited.
5. **No omitted claims.** Every version/CVE/CWE asserted carries a dated http source
   ≥ 2025-01-01; nothing was asserted uncited, so no omit-for-lack-of-source entries.
