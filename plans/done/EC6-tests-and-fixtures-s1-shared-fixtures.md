---
approved_by: human
approved_at: 2026-07-08T20:47:40.252Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T20:32:44.877Z
gate_crossed: implementation → todo
---

---
iron_loop: true
---

---
title: "EC6-s1 — Shared compliance fixtures + fixture-driven classification & manifest tests"
type: implementation
parent_plan: EC6-tests-and-fixtures
depends_on: none
priority: MEDIUM
program: ctoc-eu-compliance
files:
  - tests/fixtures/compliance/pii-collecting-plan.md
  - tests/fixtures/compliance/annex-iii-ai-plan.md
  - tests/fixtures/compliance/prohibited-practice-plan.md
  - tests/fixtures/compliance/sample-pii-code.js
  - tests/fixtures/compliance/sample-ai-act-code.js
  - tests/fixtures/compliance/fixture-manifest.yaml
  - tests/compliance-fixtures.test.js
status: refined
risk_level: MEDIUM
---

# EC6-s1 — Shared compliance fixtures + fixture-driven classification & manifest tests

## Slice scope (why this slice exists, and what it does NOT re-test)

`tests/fixtures/compliance/` **does not exist**. No shipped test references it — every
current `classifyFromPlanText` case (`tests/eu-ai-act-helpers.test.js`) feeds an
**inline ad-hoc string**, which is exactly the "each slice invents its own fixture"
inconsistency the parent (EC6) calls out. This slice creates the **one shared fixture
library** + the single test that (a) drives the shipped `classifyFromPlanText` against
the real fixture *files* on disk and (b) validates the machine-readable
`fixture-manifest.yaml`.

**This slice does NOT re-test** what is already covered:
- Per-classification-branch unit behaviour of `classifyFromPlanText` (high-risk /
  prohibited / limited / gpai / unknown) is already covered by
  `tests/eu-ai-act-helpers.test.js` with inline strings. This slice adds only the
  **fixture-file-driven** path — proving the *shared on-disk fixtures* deterministically
  produce the documented classification — not re-covering the branches.
- The end-to-end seam, dedup, single-write, no-op, advisory, gate-invariant behaviour is
  already covered by `tests/compliance-integration.test.js` and
  `tests/cto-chief-compliance-dispatch.test.js`. This slice touches none of it.

## Implementation Details

### Architecture Decision

The three plan fixtures are **inputs to the shipped pure classifier**
`eu-ai-act-helpers.js:classifyFromPlanText(planText)`. Grounded in the real source
(read fresh), that function returns
`{ risk_class, annex_iii_category, confidence }` — it does **not** emit
`finding.kind` objects. The `finding.kind` values the parent EC6 scenarios reference
(`missing-inventory`, `missing-technical-docs`, `missing-oversight`,
`prohibited-use-detected`, `missing-consent-banner`, …) are produced by the **agent
prose + skill layer**, not by the JS helper, and are therefore **not measurable by
`node --test`**. Decision (documented below): the JS-drivable assertion for each fixture
is the **classification triple**; the agent-level `finding.kind` values live in the
manifest as fixture *metadata* (documented + cross-checked for validity), asserted by
fixtures + manual review per the parent's "coverage target scoped to JS files" decision.
This keeps the test honest (it asserts only what the JS actually produces) while the
manifest keeps the agent-level expectations tracked and non-hidden.

`sample-pii-code.js` and `sample-ai-act-code.js` are **data fixtures** (source-shaped
text the agents/skills scan), not modules under test. They are listed in the manifest
with their expected agent-level finding kinds and are loaded (existence + non-empty +
scannable content) by the manifest completeness test — no JS classifier consumes them
directly (there is no shipped JS code-scanner export).

### Dependency Graph

```
tests/fixtures/compliance/*.md, *.js        (data fixtures — no deps)
tests/fixtures/compliance/fixture-manifest.yaml
        │  documents expected outputs for each fixture
        ▼
tests/compliance-fixtures.test.js
        ├── require('../src/lib/eu-ai-act-helpers')   → classifyFromPlanText (SHIPPED, pure)
        ├── require('../src/lib/gdpr-helpers')          → VALID_GDPR_ARTICLES, mapPiiFieldToArticles (SHIPPED, pure)
        ├── require('js-yaml') or the repo's yaml reader → parse fixture-manifest.yaml
        └── fs + path.join(__dirname,'fixtures','compliance',…) → load fixtures cross-platform
```
No cycles. `tests/*` → `src/lib/*` (pure helpers) only; no hook, no command, no network.

### File Specifications

#### File: `tests/fixtures/compliance/pii-collecting-plan.md`
**Action:** CREATE
**Purpose:** A functional-plan fixture that names PII fields (`email`, `ipAddress`) and a
US-hosted analytics SDK, with no consent banner / no Art. 13 notice / no deletion flow —
the deterministic GDPR trigger corpus.
**Content contract:** Markdown plan body naming, verbatim so `mapPiiFieldToArticles`
resolves them: `email`, `ipAddress`. Names a US analytics SDK and a non-EU data
transfer. Manifest documents expected `mapPiiFieldToArticles` outputs for `email` and
`ipAddress` (each a subset of `VALID_GDPR_ARTICLES`) + the agent-level finding kinds
(`missing-consent-banner`→GDPR-7, `missing-article-13-notice`→GDPR-13,
`non-eu-transfer-without-sccs-dpf`→GDPR-Chapter-V) as metadata.

#### File: `tests/fixtures/compliance/annex-iii-ai-plan.md`
**Action:** CREATE
**Purpose:** A functional-plan fixture describing a CV-screening system for employment
decisions — the deterministic Annex III high-risk trigger.
**Content contract:** Plan body containing a phrase the shipped `ANNEX_III_PATTERNS`
match for employment, e.g. "screening résumés / ranking candidates for a hiring
decision". Expected shipped-classifier output (asserted by the test):
`{ risk_class: 'high-risk', annex_iii_category: '4-employment', confidence: 'medium' }`.
Agent-level finding kinds (`missing-inventory`, `missing-technical-docs`,
`missing-oversight`) documented in the manifest as metadata (not JS-asserted — see ADR).

#### File: `tests/fixtures/compliance/prohibited-practice-plan.md`
**Action:** CREATE
**Purpose:** A functional-plan fixture describing real-time biometric identification in
public spaces for law enforcement — the deterministic Art. 5 prohibited trigger.
**Content contract:** Plan body containing a phrase the shipped `PROHIBITED_PATTERNS`
match. Expected shipped-classifier output (asserted): `risk_class: 'prohibited'`,
`annex_iii_category: null`, `confidence: 'high'`. Manifest documents the agent-level
`prohibited-use-detected` kind, `regulation_ref: "EU-AI-Act Art. 5"`,
`severity: critical`, and the €35M / 7%-turnover penalty citation as metadata.

#### File: `tests/fixtures/compliance/sample-pii-code.js`
**Action:** CREATE
**Purpose:** Data fixture — JS source initialising an analytics SDK before a consent
gate, soft-deleting a user without hard-purge, shipping PII to a US endpoint. Scanned by
the GDPR agent/skill (agent-level); listed in the manifest.
**Content contract:** Valid, non-executing-in-test JS text (a fixture, never `require`d by
a test). Named endpoints/fields match the manifest's documented kinds.

#### File: `tests/fixtures/compliance/sample-ai-act-code.js`
**Action:** CREATE
**Purpose:** Data fixture — JS source with a loan-decision model call writing directly to
the DB with no human-review endpoint; no `ai-systems.yaml` present. Listed in the
manifest.
**Content contract:** Valid JS text (fixture only). Documented agent-level kinds:
`missing-oversight`, `missing-inventory`.

#### File: `tests/fixtures/compliance/fixture-manifest.yaml`
**Action:** CREATE
**Purpose:** Machine-readable manifest: `fixture filename → expected classification (for
plan fixtures) → expected agent-level finding.kind list → confidence → regulation_ref`,
plus a `coverage_gaps` section and a `skill_version` field (the mitigation for the
fixture-drift risk in the parent).
**Content contract (shape the test relies on):**
```yaml
skill_version: "<SKILL.md version or commit ref>"
fixtures:
  pii-collecting-plan.md:
    regime: gdpr
    pii_fields: [email, ipAddress]          # each → mapPiiFieldToArticles(...) subset of VALID_GDPR_ARTICLES
    expected_finding_kinds:                 # agent-level metadata (NOT JS-asserted)
      - { kind: missing-consent-banner,           gdpr_article: GDPR-7,          confidence: high }
      - { kind: missing-article-13-notice,        gdpr_article: GDPR-13,         confidence: high }
      - { kind: non-eu-transfer-without-sccs-dpf,  gdpr_article: GDPR-Chapter-V,  confidence: medium }
  annex-iii-ai-plan.md:
    regime: eu-ai-act
    expected_classification: { risk_class: high-risk, annex_iii_category: 4-employment, confidence: medium }
    expected_finding_kinds:
      - { kind: missing-inventory, regulation_ref: "EU-AI-Act Art. 11", confidence: high }
      - { kind: missing-technical-docs, regulation_ref: "EU-AI-Act Art. 11 + Annex IV", confidence: medium }
      - { kind: missing-oversight, regulation_ref: "EU-AI-Act Art. 14", confidence: medium }
  prohibited-practice-plan.md:
    regime: eu-ai-act
    expected_classification: { risk_class: prohibited, annex_iii_category: null, confidence: high }
    expected_finding_kinds:
      - { kind: prohibited-use-detected, regulation_ref: "EU-AI-Act Art. 5", severity: critical, confidence: high }
  sample-pii-code.js:  { regime: gdpr,       expected_finding_kinds: [ ... ] }
  sample-ai-act-code.js: { regime: eu-ai-act, expected_finding_kinds: [ { kind: missing-oversight }, { kind: missing-inventory } ] }
coverage_gaps:
  gdpr_articles_uncovered: [GDPR-9, GDPR-20, GDPR-28, GDPR-30, GDPR-33, GDPR-34, GDPR-37]
  ai_act_categories_uncovered: [2-critical-infrastructure, 3-education, 5-essential-services, 7-migration, 8-justice]
```

#### File: `tests/compliance-fixtures.test.js`
**Action:** CREATE
**Purpose:** The single fixture-driven + manifest-validation test suite.
**Framework:** `node:test` (`describe`/`it`/`assert`).

### Test Plan

`tests/compliance-fixtures.test.js` — all fixture loads via
`path.join(__dirname, 'fixtures', 'compliance', <name>)` (cross-platform):

1. **Fixture-driven classification — Annex III plan (real file → real classifier).**
   Read `annex-iii-ai-plan.md`; call `classifyFromPlanText(body)`; assert
   `deepEqual({ risk_class:'high-risk', annex_iii_category:'4-employment', confidence:'medium' })`.
2. **Fixture-driven classification — prohibited plan.** Read
   `prohibited-practice-plan.md`; assert `risk_class:'prohibited'`,
   `annex_iii_category:null`, `confidence:'high'`.
3. **Fixture-driven GDPR field mapping — PII plan.** For each `pii_fields` entry in the
   manifest, call `mapPiiFieldToArticles(field)`; assert the result is a non-empty array
   and every element is a member of `VALID_GDPR_ARTICLES` (`assert.ok(arr.length>0)` +
   `for` membership assert). Asserts the shared fixture's PII fields are real triggers.
4. **Manifest completeness.** Read `fixture-manifest.yaml`; assert every file physically
   present in `tests/fixtures/compliance/` (except the manifest itself) appears as a key
   under `fixtures:`, and every listed fixture file exists on disk (`fs.existsSync`).
   Bi-directional — no orphan fixture, no phantom manifest entry.
5. **Manifest validity — GDPR kinds reference real articles.** For every
   `expected_finding_kinds[].gdpr_article` under a `regime: gdpr` fixture, assert it is a
   member of `VALID_GDPR_ARTICLES`.
6. **Manifest validity — AI-Act classifications reference real risk tiers/categories.**
   For every `expected_classification` under a `regime: eu-ai-act` fixture, assert
   `annex_iii_category` is `null` or a key of the shipped `RISK_TIER_TABLE`, and
   `risk_class` is one the shipped classifier can emit
   (`high-risk`/`prohibited`/`limited-risk`/`gpai`/`unknown`).
7. **Manifest has a `skill_version` and a `coverage_gaps` section (drift mitigation).**
   Assert both keys present and non-empty (the parent's fixture-drift + regulatory-
   completeness mitigations are materialised, not hidden).
8. **Data fixtures are loadable + non-empty.** For `sample-pii-code.js` /
   `sample-ai-act-code.js`: assert file exists, `fs.readFileSync` returns non-empty
   content. (Loaded as text — never `require`d.)
9. **Every fixture is scoped (no over-trigger).** For the prohibited fixture, assert the
   classifier did NOT also return an Annex III category (proves the fixture triggers ONE
   documented outcome, per the parent "no other finding kinds are produced" intent).

#### Coverage Targets
This slice adds fixtures (data) + a fixture/manifest test. It does not add new `src/lib`
JS, so the parent's ≥80%-on-five-JS-modules target is unaffected here (owned by the
already-shipped per-module suites). No assertion-less test; no empty catch; every fixture
load that could fail (`fs.readFileSync`) is followed by an explicit assertion on the
result.

### Security Review

- **Path traversal:** every fixture path built with `path.join(__dirname, 'fixtures',
  'compliance', <literal name>)`; no user/dynamic path segment. PASS.
- **Input validation:** manifest parse wrapped so a malformed YAML fails the test LOUDLY
  (`assert.ok(manifest && typeof manifest==='object', 'manifest parsed')`) — never a
  silent skip. PASS.
- **No secrets:** fixtures contain only illustrative code/plan text; no keys/tokens. PASS.
- **Safe file operations:** test only READS fixtures under `tests/fixtures/compliance/`;
  writes nothing. PASS.
- **Command injection:** none — no `exec`/`execSync`. PASS.
- **Prototype pollution:** manifest values are read, not merged into objects with dynamic
  keys assigned from untrusted input. PASS.

## Execution Plan

### Step 8: TEST
Write `tests/compliance-fixtures.test.js` with the nine cases above (RED — fixtures and
manifest do not yet exist, so loads fail and classification asserts have nothing to read).
Every `it` has ≥1 `assert.*`. No empty catch, no assertion-less body, no undocumented
`skip`.

### Step 9: PREPARE
Confirm `tests/fixtures/` exists (or create `tests/fixtures/compliance/`). Confirm the
YAML reader available to tests (the repo already parses YAML for settings; reuse the same
dependency — do not add a new one). Read fresh: `src/lib/eu-ai-act-helpers.js`,
`src/lib/gdpr-helpers.js` exports to lock exact function/constant names.

### Step 10: IMPLEMENT
Create the six fixture files with content satisfying each content-contract above, then
the `fixture-manifest.yaml` matching the shape the test asserts. Make classification
fixtures deterministic against the SHIPPED patterns (verify the employment/prohibited
phrasing actually matches `ANNEX_III_PATTERNS`/`PROHIBITED_PATTERNS` as read from source).
No stub, no TODO — if a fixture phrasing ambiguity arises, choose the phrasing that the
shipped regex matches and record it in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Self-review: fixtures deterministic (re-run classifier mentally against source regexes);
manifest keys match test expectations exactly; cross-platform paths; no over-trigger.

### Step 12: OPTIMIZE
Collapse duplicated fixture-load boilerplate into one `loadFixture(name)` helper inside
the test. No behavioural change.

### Step 13: SECURE
Re-verify the Security Review checklist above; confirm no fixture is ever `require`d
(only `readFileSync`), so no fixture code executes in the test process.

### Step 14: VERIFY
`node --test tests/compliance-fixtures.test.js` → `# fail 0`, 0 skipped. Then
`node --test tests/*.test.js` → `# fail 0` (no regression in the shipped compliance suite).

### Step 15: DOCUMENT
Add a one-paragraph header comment to `tests/compliance-fixtures.test.js` stating: these
are the SHARED compliance fixtures; the JS-asserted contract is the classification triple
and GDPR-article validity; agent-level `finding.kind` values are manifest metadata,
covered by fixtures + manual review (per the parent coverage decision).

### Step 16: FINAL-REVIEW
Confirm: fixtures exist and are shared; manifest complete + valid + has `skill_version` +
`coverage_gaps`; classification driven from real files; no human gate touched (this slice
adds only test data + a read-only test).

## Decisions Taken Under Ambiguity
- **JS-asserted contract = classification triple, not `finding.kind`.** The shipped
  `classifyFromPlanText` returns `{ risk_class, annex_iii_category, confidence }` and emits
  no `finding.kind`. Documented choice: the fixture test asserts the classification triple
  (+ GDPR article-membership); the agent-level finding kinds are manifest metadata,
  covered by fixtures + manual review — consistent with the parent's "coverage scoped to
  JS files" decision. Recorded here so review can catch it if wrong.
- **Reuse the repo's existing YAML reader, add no dependency.** The manifest is parsed
  with whatever the codebase already uses for `.ctoc/settings.yaml`; introducing a new
  parser would be over-engineering.
- **Data fixtures are read as text, never `require`d.** `sample-*.js` fixtures are corpus
  for the agent/skill scanner; a test that `require`d them would execute fixture code —
  rejected. The manifest-completeness test asserts existence + non-empty content only.

### Decisions taken during execution (EC6-s1 build)

- **YAML reader = the repo's own zero-dep `src/lib/budget.js:parseYaml`, NOT `js-yaml`.**
  The plan directed "reuse the repo's existing YAML reader, add no dependency." `js-yaml`
  resolves at runtime only transitively (via eslint) and is NOT a declared dependency —
  relying on it would break on a clean install and violates "add no dependency." So the
  test imports `parseYaml` from `budget.js`. Consequence: `budget.js:parseYaml` supports
  nested maps + scalars + inline arrays, but NOT YAML block sequences (`- item`) or
  inline flow maps (`{ k: v }`). The manifest was therefore authored in a FLATTENED shape
  — `finding_kinds` is a nested MAP keyed by finding-kind name (not a sequence of flow
  maps as the plan's illustrative example showed), and `pii_fields` / `coverage_gaps`
  lists use inline-array syntax. Same information, parser-compatible representation.

- **`skill_version` pinned to a REAL, verifiable value.** The two compliance SKILL.md
  files (`gdpr-compliance-checker`, `ai-governance-checker`) carry no `version:`
  frontmatter field, so there was no per-skill version string to cite. To avoid a
  fabricated number, `skill_version` pins the repo's actual `VERSION` (6.10.3) plus the
  two skill names whose deterministic cores the fixtures exercise:
  `"ctoc-6.10.3 (gdpr-compliance-checker + ai-governance-checker)"`.

- **Fixture prose verified against the SHIPPED regexes before authoring.** The Annex III
  fixture uses "screening résumés and ranking candidates for a hiring decision"
  (matches `ANNEX_III_PATTERNS` employment entry → `4-employment`); the prohibited fixture
  uses "real-time remote biometric identification" (matches `PROHIBITED_PATTERNS`). Both
  were run through `classifyFromPlanText` from source and produce the documented triples
  deterministically.

- **No fabricated legal claims.** Every `regulation_ref` cites a real Article: GDPR Arts.
  6/7/13/17 + Chapter V; EU-AI-Act Arts. 5/11/14 + Annex IV; the prohibited-practice
  penalty tier cites Art. 99 (up to EUR 35M or 7% of worldwide annual turnover), which is
  the Act's actual top tier for Art. 5 infringements.

### VERIFY results (exact numbers)
- (a) RED→GREEN: RED 10 tests / 0 pass / 10 fail → GREEN 10 tests / 10 pass / 0 fail / 0 skipped.
- (b) `node --test tests/compliance-fixtures.test.js`: 10 pass, 0 fail, 0 skipped.
- (c) Real classifier proof: test reads each fixture via `path.join(__dirname,'fixtures','compliance',name)` + `fs.readFileSync`, calls the shipped `require('../src/lib/eu-ai-act-helpers.js').classifyFromPlanText`, asserts the returned triple vs manifest. No mock/stub of the classifier (grep: only the comment stating it is never mocked).
- (d) Every manifest GDPR article ∈ VALID_GDPR_ARTICLES: GDPR-7, GDPR-13, GDPR-Chapter-V — all members (asserted by the "every GDPR finding-kind references a real article" test).
- (e) `node --test tests/*.test.js`: 3388 tests, 3388 pass, # fail 0, 0 skipped.
- (f) `npx eslint . --max-warnings 0`: exit 0.
- (g) tsc: baseline-neutral — 89 pre-existing errors with slice removed, 89 with slice present; none reference any slice file.
- (h) No README module bump: `tests/readme-numbers.test.js` 47/47 pass (test data + test only; no new src/lib module).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 10 tests, 0 pass, 10 fail (fixtures/manifest absent)

### Step 9: PREPARE
- [x] Install dependencies if needed — none added; reused repo's zero-dep `budget.js:parseYaml`
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed — created `tests/fixtures/compliance/`

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — 6 fixtures + manifest created
- [x] Add error handling — every fixture load asserts existence + non-empty
- [x] Wire up integration points — manifest keys match test expectations exactly

### Step 11: REVIEW
- [x] Self-review all new code — fixtures deterministic vs shipped regexes; cross-platform paths
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — single `loadFixture(name)` helper
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — all paths `path.join(__dirname, 'fixtures', 'compliance', <literal>)`
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations — read-only; fixtures loaded as text, never `require`d

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint . --max-warnings 0` exit 0; tsc baseline-neutral (89→89, none in slice)
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → 3388 pass, # fail 0
- [x] Check coverage >= 80% — N/A (adds test data + test, no new src/lib module; readme-numbers 47/47 green)
- [x] 0 skipped, 0 flaky tests — slice 10/10 pass, 0 skipped

### Step 15: DOCUMENT
- [x] Update relevant documentation — header doc block in `tests/compliance-fixtures.test.js`
- [x] Add JSDoc comments to new functions — `loadFixture` / `loadManifest` documented
- [x] Update CHANGELOG if needed — N/A (test-only slice)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
