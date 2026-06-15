---
title: "EC4 — Web-sourced EU solution recommender (hosted / self-hosted / library)"
created: "2026-06-15T00:00:00Z"
priority: HIGH
type: feature
parent_vision: eu-compliance-agents-gdpr-ai-act
program: ctoc-eu-compliance
order: 4
depends_on:
  - EC2-gdpr-agent-plan-and-code
  - EC3-eu-ai-act-agent-plan-and-code
files:
  - agents/compliance/eu-solution-recommender.md
  - src/lib/eu-recommender-helpers.js
  - agents/compliance/gdpr-agent.md
  - agents/compliance/eu-ai-act-agent.md
  - tests/eu-solution-recommender.test.js
status: refined
acceptance_criteria_count: 12
risk_level: MEDIUM
---

# EC4 — Web-sourced EU solution recommender (hosted / self-hosted / library)

## 1. ASSESS

### Business Context

When a compliance gap is found by EC2 or EC3, the user is told *what* is wrong. They are not told *how* to fix it: which EU-region hosted service closes the gap, which open-source alternative is deployable in EU infrastructure, which library handles it, and what each option costs. This is vision Problem #3.

This slice creates the **EU solution recommender** — a shared Tier-2 agent (`agents/compliance/eu-solution-recommender.md`) that EC2 and EC3 both call when a finding needs remediation options. It is the only slice in the program with web access. It also satisfies vision Success Criterion #6: regulatory dates/thresholds are confirmed against authoritative sources at runtime, not hardcoded.

**Canonical output schema (locked).** All scenarios reference this exact snake_case schema. Every output object has exactly these fields:

```json
{
  "bucket": "hosted | self_hosted | library",
  "name": "string",
  "source_url": "string (URL)",
  "retrieved_date": "YYYY-MM-DD",
  "price": "string — factual only (see price constraint)",
  "quality_rank": "integer, 1 = highest quality",
  "region": "string — required for hosted bucket only; null for others",
  "verified_source": "string (URL) — required for legal citations; null otherwise",
  "verified_date": "YYYY-MM-DD — required when verified_source is set; null otherwise",
  "unverified_this_run": "boolean — true when web verification failed for this field"
}
```

No additional top-level keys. No camelCase variants. This schema is enforced by `src/lib/eu-recommender-helpers.js` `validateOutputSchema(option)`.

**Price constraint.** The `price` field is rejected by `eu-recommender-helpers.js` `validatePriceString(price)` if it matches (case-insensitive) any of the patterns: `affordable`, `expensive`, `worth it`, `competitive`, `reasonable`. Valid values are: a currency amount with retrieval date (e.g., `"€29/month, list price, retrieved 2026-06-15"`), `"pricing on request (retrieved YYYY-MM-DD)"`, or `"open-source / no license fee — self-hosting/infra cost applies"`.

**Quality rank monotonicity.** Within each bucket, options are ordered by `quality_rank` ascending (1 = highest quality). Tests assert monotonicity (that rank N+1 ≥ rank N within a bucket) — not that any specific tool occupies any specific rank. The ranking criteria are documented in the agent file (regulatory coverage breadth, EU-data-residency, audit trail, integration ecosystem).

**Testability.** `eu-recommender-helpers.js` contains the deterministic layer: output schema validator, price string validator, quality_rank monotonicity checker, and the injectable fetcher interface. Tests stub the fetcher to avoid live web calls. The agent orchestrates these helpers.

### Current State

Both existing skills have `max_subagents: 0` and no web tools. No web-sourced remediation capability exists anywhere in the CTOC compliance layer today. No `eu-recommender-helpers.js` exists. No `eu-solution-recommender.md` exists.

### Impact

Every compliance gap in a project with an active EU compliance profile now arrives with an actionable, current, EU-appropriate option list. The user can make an informed decision at the moment they see the finding.

---

## 2. ALIGN

### Business Goals

**Goal:** Every finding from EC2 or EC3 is paired with concrete, current, EU-appropriate remediation options — hosted / self-hosted / library — so the user can act immediately rather than research independently.

**Job to Be Done:** When I receive a compliance finding that says "missing consent banner (Art. 7)" or "missing technical documentation (Art. 11)," I want the recommender to return specific, verified EU solutions with prices so that I can choose a remediation path in the same session, without researching separately.

**Impact Map:**
- **Goal:** Actionable, web-verified remediation options attached to every compliance finding.
- **Actor:** Project owner deciding how to close a compliance gap identified by EC2 or EC3.
- **Impact:** The user moves from knowing there is a gap to knowing how to close it, in the same pipeline step, with current pricing and source URLs.
- **Deliverable:** `agents/compliance/eu-solution-recommender.md` + `src/lib/eu-recommender-helpers.js` (canonical schema validator, price validator, monotonicity checker, injectable fetcher).

### Success Metrics

1. Given any EC2 or EC3 finding, the recommender returns ≥1 option per applicable bucket where options exist, each with all canonical schema fields populated.
2. For any finding referencing a dated obligation, the recommender verifies the figure against an authoritative source and records `verified_source` + `verified_date`.
3. If web verification fails (network unavailable, timeout, non-2xx), the recommender falls back to the skill-documented figure, sets `unverified_this_run: true`, and continues — no crash, no fabricated figure, no block.
4. EC2 and EC3 both call this agent; output shape is identical across regimes (same canonical schema).
5. No option is auto-selected; no project config is auto-modified; no vendor is silently adopted.
6. `validatePriceString()` rejects any price string containing `affordable | expensive | worth it | competitive | reasonable` (case-insensitive).

### Constraints

- **Highest-quality first, price as fact.** Per CLAUDE.md rules: always lead with the highest-quality option; state price as a plain fact; never editorialise.
- **No auto-selection.** Output is a ranked list for human decision. No file in the project is modified.
- **Authoritative sources for legal facts only.** EUR-Lex, EDPB, AI Office, national DPAs for legal obligations and dates. Solution landscape is searched broadly but each entry requires a verifiable source URL + retrieval date.
- **Fallback on verification failure.** If network is unavailable, use skill-documented figure, set `unverified_this_run: true`, continue (no-stub rule).
- **EU-region focus for hosted options.** Hosted options must explicitly state EU region or EU-data-residency commitment. US-hosted options without a documented SCC/DPF transfer mechanism are excluded from the hosted bucket.
- **Static vendor tables are seeds, not truth.** Entries from the existing skills are re-verified live; stale/invalid entries are excluded.
- **Injectable fetcher.** The web-boundary in `eu-recommender-helpers.js` is an injectable fetcher function. Tests inject a stub fetcher. The agent injects the real `WebSearch`/`WebFetch` tools. This allows `node --test` to cover the deterministic layer without live network calls.
- **Cross-platform.** No OS-specific shell commands.

---

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** project owner who has received a `missing-consent-banner` (Art. 7) finding from EC2,
**I want** the recommender to return EU-appropriate consent management options in the hosted, self-hosted, and library buckets with verified prices,
**so that** I can choose a remediation path immediately without leaving the pipeline.

**As an** auditor verifying compliance findings,
**I want** every regulatory date or threshold cited by the recommender to carry a `verified_source` URL and `verified_date`,
**so that** I know the citation is current law, not a stale hardcoded assumption.

**As a** project owner in an environment where web access is unavailable,
**I want** the recommender to fall back to the skill-documented figure labeled `unverified_this_run: true` and continue,
**so that** findings still attach to the plan without crashing or blocking the pipeline.

**As a** maintainer ensuring consistency across regimes,
**I want** EC2 and EC3 to share exactly one recommender with an identical canonical output schema,
**so that** bucket/ranking rules cannot diverge between GDPR and EU AI Act findings.

### BDD Scenarios

- [ ] **Scenario: GDPR missing-consent-banner finding returns three-bucket options**
  Given a finding with `kind: missing-consent-banner`, `gdpr_article: "GDPR-7"`
  When the recommender processes it
  Then it returns `{ hosted: [...], self_hosted: [...], library: [...] }` with at least one entry per applicable bucket
  And every `hosted` entry has `region` containing an EU region identifier (e.g., `"EU (Frankfurt)"`)
  And every `price` entry passes `validatePriceString()` (no evaluative language)
  And every entry has `source_url`, `retrieved_date`, `quality_rank` populated
  And all options within each bucket are ordered by `quality_rank` ascending (1 = highest quality first)

- [ ] **Scenario: EU AI Act missing-technical-docs finding returns three-bucket options**
  Given a finding with `kind: missing-technical-docs`, `regulation_ref: "EU-AI-Act Art. 11 + Annex IV"`
  When the recommender processes it
  Then it returns at least one `library` entry (e.g., Annex IV template generator) and at least one `hosted` entry (AI governance platform)
  And each entry has `source_url`, `retrieved_date`, factual `price`

- [ ] **Scenario: Authoritative source verification for a dated obligation**
  Given a finding referencing EU AI Act high-risk enforcement (a date-sensitive obligation)
  When the recommender verifies the enforcement date against EUR-Lex or the official AI Act publication
  Then the output contains `verified_source` (the URL) and `verified_date` (ISO 8601 date of retrieval)
  And no date is asserted without a corresponding `verified_source`

- [ ] **Scenario: Web verification failure — unverified_this_run fallback**
  Given the injectable fetcher is stubbed to return a network error for all requests
  When the recommender processes a finding referencing a dated obligation
  Then the output contains `"unverified_this_run": true` for the affected field
  And the skill-documented fallback figure is used
  And no exception propagates to the caller
  And the finding still attaches to the plan with the fallback figure clearly labeled

- [ ] **Scenario: Partial web results — rate-limited or stale vendor**
  Given the injectable fetcher returns a 429 (rate-limit) response for one vendor's source URL
  When the recommender processes the finding
  Then that vendor's entry is excluded from the output (cannot be verified)
  And the remaining entries are re-ranked by quality
  And `unverified_this_run: true` is NOT applied to verified entries (it applies per-field, not globally)

- [ ] **Scenario: Stale vendor table entry excluded when live verification fails**
  Given the recommender seeds candidates from the skill's static vendor table
  When a live verification attempt for a vendor returns a non-2xx response or the vendor no longer offers the stated capability
  Then that entry is excluded from the output
  And the remaining entries are re-ranked

- [ ] **Scenario: No vendor is auto-selected or silently written to project config**
  Given any finding processed by the recommender
  When the recommender completes
  Then no file in the project is modified
  And the output contains no `selected: true` field or equivalent
  And `validateOutputSchema()` rejects any option object containing a `selected` field

- [ ] **Scenario: Hosted options are EU-region or EU-data-residency only**
  Given a finding that warrants a hosted option
  When the recommender populates the hosted bucket
  Then every entry has `region` explicitly stating its EU region or EU-data-residency commitment
  And no US-hosted option without a documented SCC/DPF appears in the hosted bucket

- [ ] **Scenario: Price string validator rejects evaluative language**
  Given a price string containing the word "affordable", "expensive", "worth it", "competitive", or "reasonable"
  When `validatePriceString(priceString)` is called
  Then it throws a validation error naming the rejected pattern
  And the option is not included in the output

- [ ] **Scenario: EC2 and EC3 produce identical output schema**
  Given a GDPR finding from EC2 and an AI Act finding from EC3
  When both call the recommender and the outputs are compared
  Then each option object from both has exactly the same set of top-level keys: `bucket`, `name`, `source_url`, `retrieved_date`, `price`, `quality_rank`, `region`, `verified_source`, `verified_date`, `unverified_this_run`
  And `validateOutputSchema()` passes for all entries from both regimes

- [ ] **Scenario: Quality rank is monotonically non-decreasing within each bucket**
  Given the recommender returns a bucket with multiple entries
  When `quality_rank` values within the bucket are read in order
  Then each subsequent `quality_rank` is greater than or equal to the previous one (rank N+1 ≥ rank N)
  And no two entries have the same `quality_rank` within the same bucket (ranks are unique per bucket)

- [ ] **Scenario: Empty bucket is explicit, not absent**
  Given a finding for which no self-hosted open-source option exists
  When the recommender processes it
  Then the `self_hosted` key is present with an empty array and a `reason` string explaining why no self-hosted option applies
  And `validateOutputSchema()` accepts this as a valid response (empty bucket is valid)

---

## Scope

### In Scope

- `agents/compliance/eu-solution-recommender.md` — new Tier-2 agent with web access (`tools: WebSearch, WebFetch`); single shared agent called by both EC2 and EC3.
- `src/lib/eu-recommender-helpers.js` — new JavaScript module containing:
  - `CANONICAL_SCHEMA_KEYS` — set of required top-level keys (the locked snake_case schema)
  - `validateOutputSchema(option)` — asserts all canonical keys present, throws on unknown keys or missing required fields
  - `validatePriceString(price)` — rejects evaluative language patterns; throws on violation
  - `checkMonotonicity(options)` — asserts `quality_rank` is monotonically non-decreasing and unique within a bucket array
  - `createFetcher(webSearchFn, webFetchFn)` — factory that returns an injectable fetcher; the test stub replaces `webSearchFn`/`webFetchFn` with controlled functions
  - `applyFallback(option, skillDocumentedFigure)` — returns option with `unverified_this_run: true` and skill-documented value, used on fetch failure
- Input: finding object with `kind`, `gdpr_article` (GDPR findings) or `regulation_ref` (AI Act findings), `message`, `confidence`.
- Output: `{ hosted: [...], self_hosted: [...], library: [...] }` where each entry conforms to the canonical schema.
- Authoritative source verification: EUR-Lex, EDPB (edpb.europa.eu), AI Office (digital-strategy.ec.europa.eu), national DPAs for regulatory obligations; broad web search for solution landscape.
- Static seed tables from existing skills re-verified live; stale entries excluded.
- Fallback protocol: any fetch failure → skill-documented figure + `unverified_this_run: true` + continue (no crash, no block, no fabrication).
- Unit test (`tests/eu-solution-recommender.test.js`): all JS helpers in `eu-recommender-helpers.js` with a stubbed fetcher; three-bucket output shape, schema validation, price validator, monotonicity checker, fallback protocol, partial/stale/rate-limited failure scenarios, no-auto-select assertion, EU-region-only hosted assertion, identical shape across regimes.

### Out of Scope

- GDPR agent logic (EC2) — this agent recommends remediation only.
- EU AI Act agent logic (EC3) — same.
- Iron Loop dispatch wiring (EC5).
- Legal advice: the recommender presents options; it does not recommend one option as "the correct legal choice."
- Recommendations outside the EU regulatory context.
- Automated procurement: no pricing API calls, no purchase initiation, no contract generation.
- Generating privacy policies, DPAs, or legal documents — that is `skills/saas/legal-scaffold`'s domain.

---

## Risks

### Technical Risks

- **Web search rate limiting or partial results:** Multiple web requests per finding. Rate limits or timeouts produce partial results.
  - Likelihood: MEDIUM
  - Impact: LOW (fallback protocol handles it; `unverified_this_run` labels are explicit)
  - Mitigation: Per-finding timeout (15 seconds per authoritative source check, 30 seconds per landscape search); on timeout, apply `applyFallback()`. Log timeouts to the finding's metadata.

- **Injectable fetcher boundary drift:** If the agent adds a web call outside the fetcher interface, that call cannot be stubbed in tests.
  - Likelihood: LOW (the fetcher interface is the sole web boundary)
  - Impact: MEDIUM (untestable web paths, live calls in CI)
  - Mitigation: Code review requirement: every `WebSearch`/`WebFetch` call in `eu-recommender-helpers.js` must go through the fetcher factory. A test that stubs the fetcher and asserts zero live network calls in the happy-path test enforces this.

### Business Risks

- **Price data is point-in-time:** SaaS pricing changes frequently.
  - Likelihood: HIGH
  - Impact: LOW (price is stated with retrieval date; user is responsible for confirming before procurement)
  - Mitigation: Include a one-line disclaimer in the output: "Prices are point-in-time list prices. Verify before procurement." This is a statement of fact, not editorializing.

- **Quality-rank ordering is a judgment call:** "Quality" is multi-dimensional.
  - Likelihood: MEDIUM
  - Impact: LOW (all options are presented; user chooses; no option is hidden)
  - Mitigation: Document the ranking criteria (regulatory coverage breadth, EU-data-residency, audit trail, integration ecosystem breadth) in the agent file so the ranking is transparent. Tests assert monotonicity, not ranking correctness.

### Dependency Risks

- **EC2 and EC3 must ship first:**
  - Likelihood: HIGH (structural dependency)
  - Impact: MEDIUM (recommender can be unit-tested with mock findings; integration requires EC2/EC3)
  - Mitigation: Unit tests use mock finding inputs; integration tests require EC2/EC3 findings. The agent itself is complete when EC2/EC3 stub their calls to it.

---

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — depends on EC2/EC3; no other EC slice depends on this one.
- Business Impact: HIGH (3) — directly addresses vision Problem #3; without this, the compliance feature is a problem-reporter, not a solution-provider.
- Technical Risk: MEDIUM (2) — web search is standard CTOC research tooling; main risks are rate limiting and price-data staleness, both mitigated by the fallback protocol and `retrieved_date`.

---

## Decisions Taken Under Ambiguity

- **Canonical snake_case schema.** The adversarial review required one locked canonical schema with snake_case keys. Decision: `self_hosted` (not `self-hosted`), `quality_rank`, `retrieved_date`, `verified_source`, `verified_date`, `unverified_this_run`. This schema is enforced by `validateOutputSchema()`. Scenarios reference these exact keys.
- **Injectable fetcher for testability.** Decision: `eu-recommender-helpers.js` exposes a `createFetcher(webSearchFn, webFetchFn)` factory. Tests inject stub functions. The agent injects the real `WebSearch`/`WebFetch` tool handles. This is the correct boundary for stubbing a web dependency in `node --test` — you cannot mock `WebSearch`/`WebFetch` from the outside; you must inject them.
- **Failure scenarios added.** The adversarial review required partial/stale/rate-limited web result scenarios, not just total failure. Decision: three distinct failure scenarios (total network failure, rate-limit 429, stale vendor table entry) are added to the acceptance criteria. Each has distinct observable behavior: total failure → `unverified_this_run: true` on all fields; rate-limit → affected vendor excluded, remaining re-ranked; stale entry → excluded, remaining re-ranked.
- **Quality rank tests assert monotonicity, not ranking correctness.** Decision: tests assert that `quality_rank` values within a bucket are monotonically non-decreasing and unique — not that any specific tool appears at rank 1. Ranking correctness is a runtime judgment by the agent based on the quality criteria documented in the agent file.
- **Price as fact, enforced by validator.** Decision: `validatePriceString()` is the machine-enforceable contract for the "price as fact" rule. Any price string containing evaluative language patterns is rejected with a thrown error, causing the option to be excluded. This is tested by a unit test that provides a violating price string and asserts the thrown error.
- **No auto-select enforced by schema validator.** Decision: `validateOutputSchema()` rejects any option object containing a `selected` field. This makes the "no auto-select" rule machine-checkable, not just a documentation convention.
