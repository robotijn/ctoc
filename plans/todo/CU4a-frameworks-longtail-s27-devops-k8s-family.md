---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.126Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "Kubernetes & manifest tooling (kubernetes · helm · kustomize)"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/frameworks/devops/kubernetes.md
  - skills/frameworks/devops/helm.md
  - skills/frameworks/devops/kustomize.md
  - tests/cu4a-devops-k8s-family-guides.test.js
---

# CU4a s27 — Kubernetes & manifest tooling (kubernetes · helm · kustomize)

> Slice 27 of the CU4a decomposition. De-stub the 3 thin **devops** framework
> guides (kubernetes · helm · kustomize) from the 5-section template floor into substantive correction surfaces, in
> ONE coherent research pass. Confirmed fresh 2026-07-10: each of these files has exactly the 5
> template sections (Installation, Claude's Common Mistakes, Correct Patterns, Version Gotchas,
> What NOT to Do) — no dated sources, no CWE identifiers, no References section. This slice's
> shared research spine: Kubernetes + manifest tooling: deprecated-API removal, resource/probe/security-context correctness, and templating/overlay + secret-handling footguns. Adds one content-contract test that reads the REAL guide
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
Kubernetes + manifest tooling: deprecated-API removal, resource/probe/security-context correctness, and templating/overlay + secret-handling footguns. They are disjoint by file from every other slice, so `depends_on: none`.

### Dependency Graph

```
skills/frameworks/devops/kubernetes.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-k8s-family-guides.test.js
skills/frameworks/devops/helm.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-k8s-family-guides.test.js
skills/frameworks/devops/kustomize.md  (MODIFY: extend 5→>5)  <--tested-by-- tests/cu4a-devops-k8s-family-guides.test.js
```

3 disjoint content files + one test. No inter-file code dependency. No cycle. Chain depth 1.

### File Specifications

#### File: `skills/frameworks/devops/kubernetes.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for kubernetes edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **API footguns** — removed/deprecated APIs per version (pin `apiVersion`), missing resource requests/limits (OOMKill/eviction), liveness vs readiness probes, `latest` tag (use digests), PodDisruptionBudgets
- **Security** — `runAsNonRoot`/`readOnlyRootFilesystem`/drop ALL caps, Pod Security Standards, RBAC least-privilege (CWE-284), no privileged containers
- **Version** — current K8s stable + EOL dates, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/helm.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for helm edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Chart footguns** — `{{ }}` templating whitespace + `nindent`, `values.yaml` override precedence, `helm upgrade` vs immutable fields, hooks + weights, `lookup` at render, subchart value scoping
- **Safety** — `--atomic`/`--wait`, release history
- **Security** — secrets in values → plaintext in release (use SOPS/external-secrets, CWE-312), provenance/signing
- **Version** — Helm 3.x current release, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

#### File: `skills/frameworks/devops/kustomize.md`
**Action:** MODIFY (extend from 5 sections to >5; no-churn on the existing 5)
**Purpose:** Trigger-loaded correction surface for kustomize edits. Add these `## ` sections below the existing five (each names ≥1 concrete identifier + a dated http source ≥ 2025-01-01 for every version/security claim):
- **Overlay footguns** — base vs overlay patch (strategic-merge vs JSON6902), `namePrefix`/`commonLabels` propagation, generator behavior (configMapGenerator hash suffix triggers rollout), `bases` deprecated → `resources`
- **Correctness** — patch target selectors
- **Security** — secretGenerator writes plaintext into manifests (CWE-312), no commit of rendered secrets
- **Version** — Kustomize (kubectl-embedded) current, dated
- **References** — dated source list (each URL retrieved ≥ 2025-01-01).

### Test Plan

#### Tests: `tests/cu4a-devops-k8s-family-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL 3 guides off disk via `fs.readFileSync` (mirroring
`tests/cu3-data-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — kubernetes · helm · kustomize):
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
   - `kubernetes`: `readiness`, `runAsNonRoot`, `CWE-284`
   - `helm`: `nindent`, `values.yaml`, `CWE-312`
   - `kustomize`: `overlay`, `configMapGenerator`, `CWE-312`

**Coverage note:** content-grounding — content-contract assertions substitute for line/branch
coverage (CU2/CU3 convention for these reference-corpus slices).

### Security Review

- Content-only edits to 3 Markdown guides + one test reading them; no runtime path, no user
  input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- Every asserted CWE id (CWE-284, CWE-312) is a REAL MITRE identifier grounded in that framework's actual
  attack surface — never invented; the guide links cwe.mitre.org for each.
- Source URLs are public official domains (framework docs / release notes / PyPI / npm / GitHub /
  cwe.mitre.org) — no secrets.
- Only the 4 enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Read all 3 guides fresh off disk first, then WRITE the content-contract test.
- [ ] Create `tests/cu4a-devops-k8s-family-guides.test.js` (zero doubles — reads the 3 REAL guides off disk via `fs.readFileSync`)
- [ ] Test error conditions (below-floor sections, missing required section, missing dated source, absent CWE token)
- [ ] Run tests — expect RED: each file has exactly 5 `## ` sections, no Security/Testing/References sections, no dated sources, no CWE tokens

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule).
- [ ] Web-verify the current stable release of each of kubernetes · helm · kustomize (official docs / release notes / PyPI / npm / GitHub releases)
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
- [ ] Confirm `.ctoc/skills.json` still indexes the kubernetes · helm · kustomize triggers (H1/frontmatter intact)
- [ ] Coverage ≥ 80% (content-grounding substitutes per CU2/CU3 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [ ] Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (slice:"CU4a-s27") so the completeness check (s31) has no silent omissions
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

Executed under BARRIER-PATTERN (verified ONLY this slice's test, left everything
unstaged, did not touch the audit ledger, did not move the plan). All version /
CVE / CWE facts web-verified at edit time (retrieved 2026-07-10). Sources inlined
in each guide's References section.

### Web-verified facts + sources (retrieved 2026-07-10)
- **Kubernetes 1.36** is current stable (released 2026-04-22, latest patch 1.36.2
  on 2026-06-11, EOL 2027-06-28). N-3 support: 1.35 (EOL 2027-02-28), 1.34 (EOL
  2026-10-27) still supported; **1.33 EOL 2026-06-28** and **1.32 EOL 2026-02-28**
  are now unsupported. Source: https://endoflife.date/kubernetes (JSON API) +
  https://kubernetes.io/releases/ .
- **Helm 4.2.3** current stable (published 2026-07-09); **Helm 4.0.0 GA 2025-11-12**;
  v3 line continues as **3.21.3** (2026-06-20). This CORRECTS the pre-existing stub
  text "Helm 4.x under development" / "3.21 next minor (May 2026)" — Helm 4 is GA.
  The stub's five original sections were preserved verbatim (no-churn); the stale
  claim is corrected only in the ADDED Version-Specific Gotchas section, not by
  rewriting the existing "Version Gotchas" section. Source:
  https://github.com/helm/helm/releases (redirect-resolved latest tag = v4.2.3;
  atom feed dates; v4.0.0 tag page datetime 2025-11-12).
- **Kustomize kustomize/v5.8.1** current standalone (released 2026-02-09); kubectl
  built-in lags standalone. Source:
  https://github.com/kubernetes-sigs/kustomize/releases (redirect-resolved latest
  tag + atom feed).
- **CVE-2025-1974 ("IngressNightmare")** — CVSS 3.1 base 9.8 CRITICAL, published
  2025-03-25, unauthenticated RCE in ingress-nginx controller + Secret disclosure;
  NVD weakness mapping CWE-653. Verified via
  https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2025-1974 . This is the
  ONLY CVE token asserted in any of the three guides (the test guards that any
  `CVE-\d{4}-\d+` token equals exactly CVE-2025-1974, blocking a future fabricated
  CVE). Patched-in versions (ingress-nginx 1.11.5 / 1.12.1) stated from the advisory.
- **CWE titles verified at cwe.mitre.org (v4.20):** CWE-284 = Improper Access
  Control; CWE-312 = Cleartext Storage of Sensitive Information; CWE-798 = Use of
  Hard-coded Credentials; CWE-653 = Improper Isolation or Compartmentalization.
  Grepped from https://cwe.mitre.org/data/definitions/{284,312,798,653}.html .

### Choices made
- **CWE selection.** Used CWE-284 (RBAC least-privilege) and CWE-312 (base64
  Secrets / plaintext values / plaintext secretGenerator) exactly as the plan
  specifies. ADDED CWE-798 (hard-coded credentials) to helm because a default
  password in `values.yaml` is a real, distinct footgun with an exact MITRE id —
  additive, fully sourced, not a substitute for the required CWE-312. Did NOT invent
  any CWE/CVE beyond these verified ids.
- **Added Testing section to kubernetes.md and Performance/Reliability section to
  helm.md.** The plan's Test Plan requires a Testing section and a Performance
  section in every guide; the first RED->GREEN pass surfaced that kubernetes lacked
  a Testing heading and helm lacked a Performance/reliability heading. Rather than
  loosen the content contract, I added substantive, sourced sections (kubeconform /
  conftest / kyverno / server-side dry-run for K8s; --wait-for-jobs / hook weights /
  CRD-once / history-max for Helm) so the required-section contract is met by real
  content, not by weakening the test.
- **No-churn honored.** Each guide's original five `## ` sections + the `# <Fw> CTO`
  H1 + the `> Updated January 2026` line are preserved verbatim; all new sections
  are appended below "What NOT to Do". skills.json trigger indexing is unaffected.
- **Omit-if-unverifiable.** No claim was asserted without a dated official source.
  Nothing was omitted for lack of a source in this slice — every version, CVE, and
  CWE cited resolved to an official URL at edit time.

### Verify tally
- Slice test RED (pre-implementation): 22 tests, 9 pass, 13 fail.
- Slice test GREEN (post-implementation): 22 tests, 22 pass, 0 fail, 0 skipped.
- `npx eslint tests/cu4a-devops-k8s-family-guides.test.js` exit 0.
- Line counts: kubernetes 83->253, helm 65->217, kustomize 67->191.
- Full suite NOT run (BARRIER-PATTERN); nothing staged; audit ledger untouched;
  plan not moved.
