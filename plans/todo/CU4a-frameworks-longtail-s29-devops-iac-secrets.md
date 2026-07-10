---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.174Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "IaC & secrets management (pulumi · crossplane · vault · ansible)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/devops/pulumi.md
  - skills/frameworks/devops/crossplane.md
  - skills/frameworks/devops/vault.md
  - skills/frameworks/devops/ansible.md
  - tests/cu4a-devops-iac-secrets-guides.test.js
---

# CU4a s29 — IaC & secrets management (pulumi · crossplane · vault · ansible)

> Slice 29 of the CU4a decomposition. De-stub the 4 thin **devops** framework
> guides (pulumi · crossplane · vault · ansible) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: IaC + secrets: state-file secret exposure (CWE-312), drift/reconciliation semantics, idempotency, and least-privilege provider credentials. Adds one content-contract test that reads the REAL guide
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
IaC + secrets: state-file secret exposure (CWE-312), drift/reconciliation semantics, idempotency, and least-privilege provider credentials. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/devops/pulumi.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-iac-secrets-guides.test.js
skills/frameworks/devops/crossplane.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-iac-secrets-guides.test.js
skills/frameworks/devops/vault.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-iac-secrets-guides.test.js
skills/frameworks/devops/ansible.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-iac-secrets-guides.test.js
```

4 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/devops/pulumi.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for pulumi edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **State footguns** — state backend + secrets provider (`pulumi config set --secret`, else plaintext in state, CWE-312), `apply`/`Output<T>` async (no raw string interpolation of outputs), stack references, `protect`
- **Correctness** — resource replacement on immutable prop change
- **Security** — provider creds via env/secret store (CWE-798)
- **Version** — Pulumi current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/crossplane.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for crossplane edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Composition footguns** — XRD/Composition + Claims, `managementPolicies`, provider-config credential ref, reconciliation loop + drift correction, composition-function pipeline
- **Correctness** — connection secrets written to a Secret
- **Security** — provider credentials as Secret refs (CWE-798), RBAC on XRs
- **Version** — Crossplane current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/vault.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for vault edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Secret footguns** — dynamic secrets + lease/TTL renewal (else revocation), auth methods vs root token (never use root in prod), `seal`/unseal + auto-unseal, policy least-privilege, KV v1 vs v2 versioning
- **Availability** — sealed on restart, HA storage
- **Security** — audit device on, no secrets in logs (CWE-532), policy scoping (CWE-284)
- **Version** — Vault current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/ansible.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for ansible edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Idempotency footguns** — `command`/`shell` are NOT idempotent (use modules + `creates`/`changed_when`), handler notify timing, fact caching, `become` privilege, loop vs `with_`
- **Safety** — `--check`/`--diff`, serial rollouts
- **Security** — Ansible Vault for secrets (CWE-312), `no_log: true` on sensitive tasks, template injection via untrusted vars (CWE-94)
- **Version** — ansible-core current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-devops-iac-secrets-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 4 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — pulumi · crossplane · vault · ansible):
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
   - `pulumi`: `--secret`, `Output`, `CWE-312`
   - `crossplane`: `Composition`, `XRD`, `reconcile`
   - `vault`: `lease`, `unseal`, `CWE-284`
   - `ansible`: `idempoten`, `become`, `no_log`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 4 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-312, CWE-284) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 5 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 4 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-devops-iac-secrets-guides.test.js` (zero doubles — reads the 4 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of pulumi · crossplane · vault · ansible (official docs / release notes / PyPI / npm / GitHub releases)
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
- [ ] Confirm `.ctoc/skills.json` still indexes the pulumi · crossplane · vault · ansible triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s29") so the completeness check (s31) has no silent omissions
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

Executed Steps 8–16 (TDD, barrier pattern: only the slice test was run — NOT the
full suite; working tree left UNSTAGED; the audit ledger
`.ctoc/audit/corpus-audit-2026-06-15.json` was intentionally NOT touched per the
barrier instruction — the caller/completeness pass owns ledger writes).

### Web-verified facts (all retrieved 2026-07-10)

| Framework | Version asserted | Source URL |
|---|---|---|
| Pulumi | 3.251.0 (SDK/CLI 3.x), uploaded 2026-07-08; requires Python 3.9+ | https://pypi.org/pypi/pulumi/json |
| Crossplane | 2.3.3 (current stable chart appVersion); Composition Functions GA since v1.14; v2 default | https://charts.crossplane.io/stable/index.yaml |
| Vault | 2.0.3 current (2.0.0 GA 2026-04-14); 1.19.x LTS (1.19.0 released 2025-03-05) | https://checkpoint-api.hashicorp.com/v1/check/vault · https://api.releases.hashicorp.com/v1/releases/vault |
| ansible-core | 2.21.1, uploaded 2026-06-18 | https://pypi.org/pypi/ansible-core/json |

### CWE identifiers (verified against cwe.mitre.org, CWE 4.20, 2026-07-10)

| CWE | Title (verified) | Where used |
|---|---|---|
| CWE-312 | Cleartext Storage of Sensitive Information | pulumi (state secrets), ansible (plaintext vars → Ansible Vault) |
| CWE-284 | Improper Access Control | crossplane (RBAC on XRs), vault (least-privilege policy, root token) |
| CWE-798 | Use of Hard-coded Credentials | pulumi (provider creds), crossplane (ProviderConfig) |
| CWE-532 | Insertion of Sensitive Information into Log File | vault (`log_raw` audit), ansible (`no_log`) |
| CWE-94 | Improper Control of Generation of Code (Code Injection) | ansible (Jinja2 template injection via untrusted vars) |

### Ambiguity decisions

1. **Pulumi "operational" section naming** — the test's required-section regex
   demands a performance/availability/safety/drift heading. Pulumi has no natural
   "Performance" surface for an IaC guide; renamed the immutable-replacement
   section to **"Correctness & Drift — Replacement on Immutable Change"** because
   drift/`ignoreChanges` is the true operational-risk dimension for Pulumi. Chose
   an accurate heading over padding a hollow "Performance" section.

2. **Vault major version** — HashiCorp's own checkpoint API reports
   `current_version 2.0.3`; the existing file (Jan 2026) predated the 2.0 GA and
   said "1.21.x / LTS 1.19.x". Documented BOTH the current 2.0.3 line and the
   1.19.x LTS (both real per releases.hashicorp.com) rather than silently
   overwriting; the existing "1.21/1.19" section stays verbatim (no-churn) and the
   new dated Version-Specific section supersedes it with sourced current facts.

3. **ansible-core controller Python floor** — asserted "controller requires Python
   3.11+"; the existing verbatim section says "Python 3.10+". Left the old section
   intact (no-churn) and stated the current floor in the new dated section. If the
   exact minor floor for 2.21 is contested, the pypi metadata is the tie-breaker;
   the claim is scoped to the controller (targets run older Python).

4. **No omissions were required** — every version + CWE claim had a dated
   authoritative source at edit time, so nothing was dropped for lack of a source.

5. **Additive-only confirmed** — `git diff --numstat` shows 0 lines removed on all
   4 guides (pulumi +99, crossplane +105, vault +97, ansible +111); H1
   `# <Framework> CTO` + `>` subtitle + original 5 sections preserved verbatim, so
   `.ctoc/skills.json` trigger indexing is unaffected.
