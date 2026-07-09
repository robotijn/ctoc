---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T15:53:09.537Z
gate_crossed: implementation → todo
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:52:40.393Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU3 s3 — web framework guides (react, nextjs)"
type: implementation
parent_plan: CU3-tier1-frameworks
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - skills/frameworks/web/react.md
  - skills/frameworks/web/nextjs.md
  - tests/cu3-web-guides.test.js
---

# CU3 s3 — web framework guides (react · nextjs)

> Slice 3 of the CU3 decomposition. De-stub the two highest-traffic web framework
> guides into substantive correction surfaces in ONE coherent research pass (Next.js
> is built on React, so React 19 concurrent-rendering behavior and the App-Router
> Server/Client boundary must be researched and written together to stay coherent).
> Adds the content-contract test that reads the REAL guide files off disk with zero
> doubles.
>
> **NO STUBS. NO FABRICATED NUMBERS/CVEs/VERSIONS. ZERO TEST DOUBLES.**
> Every React 19 / Next.js 15 version claim, CVE identifier, date, and best-practice
> claim MUST be WEB-VERIFIED at edit time (WebSearch or fetch of react.dev /
> nextjs.org release notes / advisories) and carry an inline dated source ≥
> 2025-01-01 — never invented. If unverifiable, OMIT. The content-contract test
> READS the real files off disk — no mocks, no stubs, no fakes.

Maps to CU3 acceptance criteria: **"react.md reflects React 19 concurrent
features"** (names "React 19"), **"nextjs.md reflects Next.js 15 App Router
patterns"** (names "Next.js 15"), and **"all version-specific and security claims
carry dated sources"** — for these two files.

## Implementation Details

### Architecture Decision

Single-framework reference guides — the **7-language BAD/SAFE cross-coverage rule
does NOT apply**. The bar is **depth-within-framework**, gated objectively:
concrete identifier per section + inline dated source ≥ 2025-01-01 per
version/security claim.

**No-churn + RAISED-FLOOR NOTE (important for this slice):** confirmed fresh
2026-07-09 — react.md has **6** `## ` sections / 63 lines and nextjs.md has **6**
`## ` sections / 70 lines. Both already SIT ABOVE the naive `> 5` floor. Therefore
the plain "`> 5` sections" assertion would PASS these files with ZERO edits — a
false green. **The s3 content-contract test asserts `> current_count` (i.e. more
than 6 `## ` sections for each file) AND asserts the specific required substantive
sections are present** (Async/Concurrency, Security, Version-specific, References,
plus the framework-specific footgun sections), so the test proves real additions,
not a no-op. Existing solid content (react's ref-as-prop / Context-as-provider
notes; both files' Version Gotchas) is preserved verbatim; new sections are ADDED.

Grouping rationale: react + nextjs are one research pass because Next.js 15 renders
React 19 Server/Client Components — the Server-Component-vs-Client-Component
boundary in nextjs.md and the React-19 concurrent-rendering/`use client` semantics
in react.md are the same knowledge family; splitting them risks contradictory
guidance.

### Dependency Graph

```
skills/frameworks/web/react.md   (MODIFY: extend 6→>6)  <--tested-by-- tests/cu3-web-guides.test.js
skills/frameworks/web/nextjs.md  (MODIFY: extend 6→>6)  <--tested-by-- tests/cu3-web-guides.test.js
```

Two disjoint content files + one test. No inter-file code dependency. No cycle.
`depends_on: none` (independent of s1/s2/s4/s5 — different files, parallel-safe).

### File Specifications

#### File: `skills/frameworks/web/react.md`
**Action:** MODIFY (extend from 6 sections to >6; no-churn on existing 6)
**Purpose:** Trigger-loaded correction surface for React edits.
**Change Type:** substantive content addition

Content mandated by the AC "react.md reflects React 19 concurrent features". Add
sections covering: **React 19 new hooks and edge cases** (`useActionState`,
`useOptimistic`); **concurrent-rendering pitfalls** (state tearing when reading
external mutable state without `useSyncExternalStore`); **`useEffect` dependency
array gotchas** (stale closures, missing deps, effect-runs-twice under StrictMode);
component-`key` misuse patterns; prop-drilling vs context performance implications;
and **security** — `dangerouslySetInnerHTML` XSS (name **CWE-79**) and third-party
component supply-chain risk. Name **"React 19"** on all React-19-specific claims and
carry a source with retrieval date ≥ 2025-01-01. Testing section: React Testing
Library idioms (`act` imported from `react`), no-`test-utils` gotcha.

#### File: `skills/frameworks/web/nextjs.md`
**Action:** MODIFY (extend from 6 sections to >6; no-churn on existing 6)
**Purpose:** Trigger-loaded correction surface for Next.js edits.
**Change Type:** substantive content addition

Content mandated by the AC "nextjs.md reflects Next.js 15 App Router patterns". Add
sections covering: **Server Component vs Client Component boundary errors** (passing
non-serializable props across the boundary, using hooks/`useState` in a Server
Component, missing `"use client"`); **Server Actions footguns** (unvalidated input
→ treat every action arg as untrusted; double-submission; `revalidatePath`
correctness); **edge runtime restrictions** (no Node.js `fs`/native APIs);
`next/image` optimization pitfalls; **App Router vs Pages Router caching behavior**
(fetch caching defaults, `dynamic`/`revalidate` segment config); and middleware
execution-order edge cases. Name **"Next.js 15"** on all Next.js-15-specific claims
and carry a source with retrieval date ≥ 2025-01-01. Flag Server-Action unvalidated
input as an injection/input-validation class concern (name the CWE class, e.g.
CWE-20 improper input validation) with a source.

### Test Plan

#### Tests: `tests/cu3-web-guides.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL guide files off disk via `fs.readFileSync`
(mirroring `tests/cu2-dynamic-web-guides.test.js`). No mocks, no fixtures, no fakes.

Content-contract test cases (per file — react, nextjs):
1. **Exceeds the RAISED floor** — file has **more than 6** `## ` sections
   (`(md.match(/^## /gm) || []).length > 6`), because both start at 6 (guards
   against a no-op false green).
2. **Required sections present** — Async/Concurrency, Error Handling,
   Security/Dependency, Testing, Performance, Version-specific, References
   (case-insensitive heading regexes).
3. **Concrete identifiers present** — react: `React 19` AND `useActionState` (or
   `useOptimistic`); nextjs: `Next.js 15` AND `Server Component` (or `Server
   Actions`).
4. **CWE / security class named** — react: `CWE-79` (or `dangerouslySetInnerHTML`
   XSS class); nextjs: a `CWE-\d+` token or "input validation" class in the Server
   Actions section.
5. **Dated source present** — a date `20(2[5-9]|[3-9]\d)` (≥ 2025) AND an `http`
   source URL per file.
6. **Frontmatter/H1 intact** — original `# <Framework> CTO` H1 still present.

**Coverage note:** content-grounding, not code — content-contract assertions
substitute for line/branch coverage.

### Security Review

- Content-only edits to two Markdown guides + one test file reading them; no
  runtime code path, no user input handling, no path traversal surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths.
- All added source URLs are public official domains (react.dev, nextjs.org,
  cwe.mitre.org) — no secrets.
- Only the three enumerated files are touched.

## Execution Plan

### Step 8: TEST
Read both current files fresh off disk first (confirm each has 6 `## ` sections).
Create `tests/cu3-web-guides.test.js` reading the two REAL files; run it — it MUST
be RED now (each has exactly 6 `## ` sections so `> 6` fails; no Async/Security/
Testing/References sections with the required identifiers/CWE/dated sources),
proving the checks test something real.

### Step 9: PREPARE
**WEB-VERIFY every version/security fact at edit time** (hard user rule): current
React 19 release + the new hooks (`useActionState`, `useOptimistic`) and any React
security advisory/CVE (react.dev / GitHub advisories); current Next.js 15 release +
App Router caching semantics + Server Actions guidance (nextjs.org docs / release
notes); CWE-79 (XSS) and the input-validation CWE class (cwe.mitre.org). Capture
each source URL + retrieval date (≥ 2025-01-01). OMIT anything unverifiable.

### Step 10: IMPLEMENT
Extend the two guides with the added sections (real footguns, real idiomatic
React-19/Next.js-15 examples, dated sources). Additive only — existing 6 sections
stay verbatim. ONE step, two files + the test file.

### Step 11: REVIEW
Self-review: each guide now >6 sections; every added section names a concrete
identifier; every version/security claim carries an inline dated source ≥
2025-01-01; react and nextjs guidance is coherent (React-19 Server/Client semantics
match across both); diff is additive.

### Step 12: OPTIMIZE
Keep additions dense and correction-focused — no padding. Each bullet names a
specific footgun + identifier.

### Step 13: SECURE
Run the Security Review checklist. Confirm every source URL is an official public
domain; no secrets; only the three enumerated files touched.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`; the new slice test GREEN. Confirm
`.ctoc/skills.json` still indexes react/nextjs triggers after the edit (H1 +
frontmatter intact).

### Step 15: DOCUMENT
Append per-file UPGRADED verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json`
({path, line_count, section_count, verdict:"UPGRADED", slice:"CU3-s3", note}) — OR,
if the audit file is outside this slice's `files:`, record verdicts in
`## Decisions Taken Under Ambiguity` (CU2 s1 precedent) for the s5 completeness
check to reconcile. Record each web-verified fact + source URL + retrieval date in
`## Decisions Taken Under Ambiguity`.

### Step 16: FINAL-REVIEW
Confirm: only the three enumerated files edited; every version/security claim
sourced ≥ 2025-01-01; nothing fabricated; "React 19" and "Next.js 15" named on the
respective version claims; no cross-language BAD/SAFE examples; tests green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| React/Next.js fast release churn invalidates a claim | Web-verify React 19 / Next.js 15 at edit time; name the exact major version + dated source ≥ 2025-01-01 | Step 9, Step 15 |
| Fabricated version/CVE (hard user rule) | Every fact carries an official source URL; test asserts dated source + http URL + CWE token per file | Step 9, Step 14, Step 16 |
| False green from pre-existing 6 sections | Test asserts `> 6` (raised floor) + required substantive sections, not a naive `> 5` | Step 8, Step 14 |
| Frontmatter corruption breaks skills.json indexing | Additions below the H1/frontmatter; run full suite + confirm triggers | Step 14 |
| Padding to exceed floor without specificity | Objective depth gate — test asserts concrete identifiers + CWE token | Step 11, Step 14 |


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

## Decisions Taken Under Ambiguity (CU3-s3, 2026-07-09)

### Web-verified facts + sources (retrieved 2026-07-09)
All version/security claims below were verified against official sources at edit
time. Nothing fabricated; unverifiable claims omitted.

- **React current stable = 19.2.7** — npm registry `dist-tags.latest`
  (npm view react version / dist-tags). https://www.npmjs.com/package/react
- **Next.js current `latest` = 16.2.10; Next.js 15.x latest stable = 15.5.20**
  (backport-maintained) — npm registry `dist-tags` + version list
  (npm view next dist-tags). App-Router Server/Client + Server Actions patterns
  named "Next.js 15" apply to 15 and forward to 16. https://www.npmjs.com/package/next
- **CVE-2025-55184** — React Server Components pre-auth DoS via unsafe deserialization
  of a Server Function payload. **CWE-502**, CVSS 7.5 HIGH, published 2025-12-11.
  Fixed in `react-server-dom-*` 19.0.2 / 19.1.3 / 19.2.2. Verified: NVD
  (services.nvd.nist.gov cveId=CVE-2025-55184) → GHSA-2m3v-v2m8-q956
  (https://github.com/advisories/GHSA-2m3v-v2m8-q956).
- **CVE-2025-55183** — React Server Components information leak (crafted request can
  return a Server Function's source). CVSS 5.3 MEDIUM, published 2025-12-11. Fixed in
  the same 19.0.2 / 19.1.3 / 19.2.2 line. Verified: NVD (cveId=CVE-2025-55183) →
  GHSA-925w-6v3x-g4j4 (https://github.com/advisories/GHSA-925w-6v3x-g4j4).
- **CWE-79** (Cross-Site Scripting) — https://cwe.mitre.org/data/definitions/79.html
  (HTTP 200 verified). Applied to `dangerouslySetInnerHTML` in react.md.
- **CWE-20** (Improper Input Validation) + **CWE-639** (Authorization Bypass / IDOR),
  **CWE-502** (Deserialization) — all cwe.mitre.org pages verified reachable (HTTP
  200). Applied to the nextjs.md Server Actions section.

### Corpus-audit verdicts (audit file outside slice `files:` → recorded here per CU2-s1 precedent)
- `skills/frameworks/web/react.md` — verdict **UPGRADED** (CU3-s3): 6 sections/63 lines
  → **13 sections/232 lines**. Added Async/Concurrency (useSyncExternalStore tearing,
  useEffect stale-closure/StrictMode double-invoke, useActionState/useOptimistic),
  Error Handling, Security (CWE-79 dangerouslySetInnerHTML XSS + RSC CVEs), Testing,
  Performance, Version-specific (dated), References. Existing 6 sections preserved;
  only the stale "19.0.3+" security line corrected to verified 19.0.2/19.1.3/19.2.2.
- `skills/frameworks/web/nextjs.md` — verdict **UPGRADED** (CU3-s3): 6 sections/70 lines
  → **15 sections/252 lines**. Added Server/Client boundary, Server Actions
  (input-validation CWE-20 + auth + IDOR CWE-639), Caching & Data, Security—Edge
  Runtime & Secret Exposure (NEXT_PUBLIC_ leak), Error Handling, Performance,
  Version-specific (dated), References. Existing 6 sections preserved; stale
  "15.1.4+" security line corrected to the transitive-RSC advisory framing.

### Decisions
1. **Named "Next.js 15" despite 16 being GA** — the plan's AC mandates naming
   "Next.js 15" App-Router patterns; those patterns are unchanged in 16. Noted 16.2.10
   is current `latest` and 15.5.20 is the current 15.x stable so the guide is not
   misleading.
2. **RSC CVEs framed as React-native / Next.js-transitive** — CVE-2025-55184/55183 are
   `react-server-dom-*` (RSC) advisories, not Next.js-core. react.md owns them
   directly; nextjs.md documents them as inherited via bundled `react-server-dom-webpack`.
   This corrects the prior guides, which attributed the same CVEs directly to each
   project with stale fix versions (19.0.3+/15.1.4+).
3. **nextjs "Security" required-section** — spread across Server Actions, "Security —
   Edge Runtime & Secret Exposure", and the version section rather than one monolithic
   heading; the Edge heading carries the literal "Security" token so the content-contract
   regex matches accurately.
4. **Added a nextjs Performance section** — the plan's required-sections list mandates
   Performance for both files; added real streaming/waterfall/bundle footguns (no padding).
