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
  - agents/compliance/gdpr-agent.md
  - agents/compliance/eu-ai-act-agent.md
  - tests/eu-solution-recommender.test.js
status: refined
acceptance_criteria_count: 10
risk_level: MEDIUM
---

# EC4 — Web-sourced EU solution recommender (hosted / self-hosted / library)

## 1. ASSESS

### Business Context

When a compliance gap is found by EC2 or EC3, the user today is told *what* is wrong — a finding with `kind`, `gdpr_article` or `regulation_ref`, `message`, and a static `suggested_fix` from the skill. They are not told *how* to fix it in the EU regulatory context: which EU-region hosted service closes the gap, which open-source alternative is deployable in EU infrastructure, which drop-in library handles it, and what each option costs. This is vision Problem #3.

This slice creates the **EU solution recommender** — a shared Tier-2 agent (`agents/compliance/eu-solution-recommender.md`) that EC2 and EC3 both call when a finding needs remediation options. It is the only slice in the program with web access; it grants the capability the code-only skills lack. It also satisfies vision Success Criterion #6: regulatory dates/thresholds are confirmed against authoritative sources at runtime, not hardcoded.

The recommender takes a finding (`kind` + `gdpr_article` / `regulation_ref`) and:
1. Searches authoritative legal sources (EUR-Lex, EDPB, AI Office, national DPAs) to verify the relevant regulatory obligation, date, or threshold.
2. Searches the EU solution landscape for remediation options.
3. Returns options in three buckets, **highest-quality first, price stated as a plain fact** — Hosted, Self-hosted, Library — for the user to choose from.

The user always chooses. The recommender never silently adopts a vendor, never writes to project config, and never auto-selects an option.

The static vendor tables in the existing skills (OneTrust, Cookiebot, Vanta, Termly, iubenda, Privado.ai, Transcend for GDPR; Credo AI, Holistic AI, Fairly AI, IBM watsonx.governance for AI governance) seed candidates, but each entry is re-verified live before inclusion in the output. A stale entry that fails re-verification is excluded.

### Current State

Both existing skills have `max_subagents: 0` and no web tools. The agent files EC2 and EC3 will create also have no web access. No web-sourced remediation capability exists anywhere in the CTOC compliance layer today.

There is no `agents/compliance/eu-solution-recommender.md` file today.

### Impact

Every compliance gap in a project with `compliance.mode != none` now arrives with an actionable, current, EU-appropriate option list. The user can make an informed decision at the moment they see the finding rather than opening a browser and researching independently. Regulatory facts cited in findings are verified at runtime, not stale.

---

## 2. ALIGN

### Business Goals

**Goal:** Every finding from EC2 or EC3 is paired with concrete, current, EU-appropriate remediation options — hosted / self-hosted / library — so the user can act immediately rather than research independently.

**Job to Be Done:** When I receive a compliance finding that says "missing consent banner (Art. 7)" or "missing technical documentation (Art. 11)," I want the recommender to return specific, verified EU solutions with prices so that I can choose a remediation path in the same session, without researching separately.

**Impact Map:**
- **Goal:** Actionable, web-verified remediation options attached to every compliance finding.
- **Actor:** Project owner deciding how to close a compliance gap identified by EC2 or EC3.
- **Impact:** The user moves from knowing there is a gap to knowing how to close it, in the same pipeline step, with current pricing and source URLs — eliminating a research detour that currently breaks the "compliance is context" flow.
- **Deliverable:** `agents/compliance/eu-solution-recommender.md` — a Tier-2 agent with web access that both EC2 and EC3 call, returning a `{hosted, self-hosted, library}` option list per finding.

### Success Metrics

1. Given any EC2 or EC3 finding, the recommender returns ≥1 option per applicable bucket where options exist, each with: `name`, `source_url`, `retrieved_date`, `price` (factual — euro amount, "pricing on request", or "open-source / no license fee — self-hosting/infra cost applies"), `quality_rank` (1 = highest quality), `bucket` (hosted / self-hosted / library), `region` (for hosted options: EU-region or EU-data-residency stated explicitly).
2. For any finding referencing a dated obligation (e.g. AI Act high-risk enforcement 2 Aug 2026; GDPR 72-hour breach notification), the recommender verifies the figure against an authoritative source (EUR-Lex, AI Office, EDPB) and records `verified_source` + `verified_date`.
3. If web verification fails (network unavailable), the recommender falls back to the skill-documented figure, labels it `unverified-this-run`, and continues — no crash, no fabricated figure, no block.
4. EC2 and EC3 both call this agent; output shape is identical across regimes.
5. No option is auto-selected; no project config is auto-modified; no vendor is silently adopted.

### Stakeholders

- **Project owner** — primary consumer; reads the option list and chooses.
- **EC2 (GDPR agent)** — calls this agent on each finding.
- **EC3 (EU AI Act agent)** — calls this agent on each finding.
- **Auditor** — reads the `verified_source` + `verified_date` fields to confirm the cited regulatory fact is current.

### Constraints

- **Highest-quality first, price as fact.** Per CLAUDE.md `recommend-highest-quality` and `no-editorializing` rules: always lead with the highest-quality option; state price as a plain fact ("€X/month, list price, retrieved YYYY-MM-DD"); never say "expensive but worth it" or "affordable option."
- **No auto-selection.** Output is a ranked list for human decision. The agent does not write to project config, `.ctoc/settings.json`, or any dependency file.
- **Authoritative sources for legal facts only.** EUR-Lex, EDPB, AI Office, and national DPAs are authoritative for *legal obligations*, dates, and thresholds. The solution landscape (vendor/OSS options) is searched broadly but each entry requires a verifiable source URL + retrieval date.
- **Fallback on verification failure.** Per EC4 Decision: if network is unavailable, use skill-documented figure, label `unverified-this-run`, continue. No-stub rule: never block, never fabricate.
- **EU-region focus for hosted options.** Hosted options must explicitly state their EU region or EU-data-residency commitment. US-hosted options without a documented transfer mechanism (SCC/DPF) are excluded from the hosted bucket; they may appear in the library bucket if they are libraries (transfer obligations rest with the project, not the library itself).
- **Static vendor tables are seeds, not truth.** Entries from the existing skills (e.g. OneTrust, Cookiebot) are re-verified live; if verification fails or the product no longer exists/applies, the entry is excluded.
- **Cross-platform.** WebSearch/WebFetch are the standard CTOC research tools; no OS-specific shell commands.

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
**I want** the recommender to fall back to the skill-documented figure labeled `unverified-this-run` and continue,
**so that** findings still attach to the plan without crashing or blocking the pipeline.

**As a** maintainer ensuring consistency across regimes,
**I want** EC2 and EC3 to share exactly one recommender with an identical output shape,
**so that** bucket/ranking rules cannot diverge between GDPR and EU AI Act findings.

### BDD Scenarios

- [ ] **Scenario: GDPR missing-consent-banner finding returns three-bucket options**
  Given a finding with `kind: missing-consent-banner`, `gdpr_article: "GDPR-7"`
  When the recommender processes it
  Then it returns a list with at least one hosted option (EU-region CMP, e.g. Cookiebot/Usercentrics EU, OneTrust EU-hosted) with `bucket: "hosted"`, `region` containing an EU region identifier, `price` stated as a plain fact, `source_url` and `retrieved_date` present
  And at least one self-hosted option (e.g. open-source CMP) with `bucket: "self-hosted"`, `price: "open-source / no license fee — self-hosting/infra cost applies"`
  And at least one library option (e.g. consent management library) with `bucket: "library"`
  And all options are ordered by `quality_rank` ascending (1 = highest quality first)

- [ ] **Scenario: EU AI Act missing-technical-docs finding returns three-bucket options**
  Given a finding with `kind: missing-technical-docs`, `regulation_ref: "EU-AI-Act Art. 11 + Annex IV"`
  When the recommender processes it
  Then it returns options including at least one in the library bucket (technical documentation generator / Annex IV template) and at least one in the hosted bucket (AI governance platform with technical-docs module)
  And each option has `source_url` + `retrieved_date` + factual `price`

- [ ] **Scenario: Authoritative source verification for a dated obligation**
  Given a finding referencing EU AI Act high-risk enforcement (a date-sensitive obligation)
  When the recommender verifies the enforcement date against EUR-Lex or the official AI Act publication
  Then it records `verified_source` (the URL) and `verified_date` (ISO 8601 date of retrieval) in the output
  And the cited date matches the authoritative source
  And no date is asserted without a corresponding `verified_source`

- [ ] **Scenario: Web verification failure — unverified-this-run fallback**
  Given a finding referencing a dated obligation
  And the web request to the authoritative source fails (network error or non-2xx response)
  When the recommender processes the finding
  Then it falls back to the figure documented in the relevant skill (`SKILL.md`)
  And the output contains `"unverified-this-run": true` for the affected field
  And no exception is thrown and no fabricated date or price is emitted
  And the finding still attaches to the plan with the fallback figure clearly labeled

- [ ] **Scenario: No vendor is auto-selected or silently written to project config**
  Given any finding processed by the recommender
  When the recommender completes
  Then no file in the project (`.ctoc/settings.json`, `.ctoc/settings.yaml`, `package.json`, any config file) is modified
  And the output is a ranked list of options with no `selected: true` field or equivalent

- [ ] **Scenario: Hosted options are EU-region or EU-data-residency only**
  Given a finding that warrants a hosted option
  When the recommender populates the hosted bucket
  Then every entry in the hosted bucket explicitly states its EU region (e.g. `"region": "EU (Frankfurt)"`) or EU-data-residency commitment
  And no US-hosted option without a documented SCC/DPF appears in the hosted bucket

- [ ] **Scenario: Stale vendor table entry re-verified and excluded if invalid**
  Given the recommender seeds candidates from the skill's static vendor table
  When a live verification attempt for a vendor entry returns a non-2xx response or the vendor no longer offers the stated capability
  Then that entry is excluded from the output
  And the remaining entries are re-ranked by quality

- [ ] **Scenario: EC2 and EC3 produce identical output shape**
  Given a GDPR finding from EC2 and an AI Act finding from EC3 of equivalent severity
  When both call the recommender
  Then the output objects have identical top-level keys: `bucket`, `name`, `source_url`, `retrieved_date`, `price`, `quality_rank`, `region` (for hosted), `verified_source` (for legal citations), `verified_date`
  And no key is present in one output but absent from the other

- [ ] **Scenario: Options ordered highest-quality first with price as plain fact**
  Given any finding processed by the recommender
  When the output is generated
  Then options within each bucket are ordered by `quality_rank` (1 = highest quality first)
  And no `price` entry contains evaluative language ("affordable", "expensive", "worth it", "competitive", "reasonable")
  And each price entry is one of: a currency amount with retrieval date, "pricing on request (retrieved YYYY-MM-DD)", or "open-source / no license fee — self-hosting/infra cost applies"

- [ ] **Scenario: Finding kind with no applicable options in a bucket — empty bucket is explicit, not absent**
  Given a finding for which no self-hosted open-source option exists (e.g. a certification-body service)
  When the recommender processes it
  Then the `self-hosted` key is present in the output with an empty array and a `reason` string explaining why no self-hosted option applies
  And the absence is explicit (not silently omitted)

---

## Scope

### In Scope

- `agents/compliance/eu-solution-recommender.md` — new Tier-2 agent with web access (`tools: WebSearch, WebFetch`); single shared agent called by both EC2 and EC3.
- Input: finding object with `kind`, `gdpr_article` (GDPR findings) or `regulation_ref` (AI Act findings), `message`, `confidence`.
- Output: `{hosted: [...], self_hosted: [...], library: [...]}` where each entry has `name`, `source_url`, `retrieved_date`, `price`, `quality_rank`, `bucket`; hosted entries additionally have `region`; legal citations have `verified_source`, `verified_date`, and optionally `unverified_this_run: true`.
- Authoritative source verification: EUR-Lex, EDPB (edpb.europa.eu), AI Office (digital-strategy.ec.europa.eu), national DPAs for regulatory obligations; broad web search for solution landscape.
- Static seed tables from existing skills re-verified live; stale entries excluded.
- Fallback protocol: network failure → skill-documented figure + `unverified-this-run: true` + continue (no crash, no block).
- Unit test (`tests/eu-solution-recommender.test.js`): three-bucket output for GDPR consent finding, three-bucket output for AI Act technical-docs finding, authoritative-source verification record, web-failure fallback, no-auto-select assertion, EU-region-only hosted options, identical shape across regimes, quality-rank ordering, empty-bucket explicit format.

### Out of Scope

- GDPR agent logic (EC2) — this agent does not detect gaps; it only recommends remediation for gaps EC2/EC3 already found.
- EU AI Act agent logic (EC3) — same.
- Iron Loop dispatch wiring — EC5.
- Legal advice: the recommender presents options; it does not recommend one option as "the correct legal choice for your project." All options require human selection.
- Recommendations outside the EU regulatory context: no US-only, APAC-only, or non-EU-law-specific tools are included in the hosted/self-hosted buckets (they may appear in library if the library is jurisdiction-neutral).
- Automated procurement: no pricing API calls, no purchase initiation, no contract generation.
- Generating privacy policies, DPAs, or legal documents — that is the `skills/saas/legal-scaffold` skill's domain.

---

## Risks

### Technical Risks

- **Web search rate limiting or intermittent availability:** The recommender makes multiple web requests per finding (authoritative source + solution landscape). Rate limits or network instability could cause partial results.
  - Likelihood: MEDIUM (web search has inherent variability)
  - Impact: LOW (fallback protocol handles it; findings still attach with `unverified-this-run` labels)
  - Mitigation: Implement a per-finding timeout (e.g. 15 seconds per authoritative source check, 30 seconds per landscape search); on timeout, apply the fallback protocol. Log timeouts to the finding's metadata so the user can see which fields were not verified.

- **Solution landscape churn:** The EU compliance tools market moves quickly. Vendors may change pricing, discontinue EU-region hosting, or rebrand between searches.
  - Likelihood: HIGH (compliance SaaS market is active)
  - Impact: LOW (each run is fresh; no stale cached data enters production output; the `retrieved_date` field makes the timestamp visible)
  - Mitigation: Always include `retrieved_date` in output; document in the agent that options are point-in-time and should be re-verified by the project owner before procurement.

### Business Risks

- **Price data is point-in-time and may be wrong:** SaaS pricing changes frequently. A price stated as "€X/month, retrieved YYYY-MM-DD" may be outdated by the time the user acts on it.
  - Likelihood: HIGH (SaaS pricing changes frequently)
  - Impact: LOW (price is stated with retrieval date; user is responsible for confirming before procurement)
  - Mitigation: Include a one-line disclaimer in the output: "Prices are point-in-time list prices. Verify before procurement." This is a statement of fact, not editorializing.

- **Highest-quality-first ordering is a judgment call:** "Quality" for a compliance tool involves factors (regulatory coverage breadth, audit trail features, EU-specific support, integration ecosystem) that are multi-dimensional. The ordering may not match what a specific project values.
  - Likelihood: MEDIUM (every project has different constraints)
  - Impact: LOW (all options are presented; the user chooses; no option is hidden)
  - Mitigation: Document the quality-ranking criteria (regulatory coverage breadth, EU-data-residency, audit trail, integration ecosystem breadth) in the agent file so the ranking is transparent and reviewable.

### Dependency Risks

- **EC2 and EC3 must ship first:** The recommender is called by EC2 and EC3; it has no standalone invocation path in this slice.
  - Likelihood: HIGH (structural dependency)
  - Impact: MEDIUM (recommender can be unit-tested with mock findings; integration requires EC2/EC3)
  - Mitigation: Unit tests mock the finding input; integration tests require EC2/EC3 findings. The agent itself is complete when EC2/EC3 stub their calls to it.

---

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) — depends on EC2/EC3; no other EC slice depends on this one (EC5/EC6 can ship without it, findings attach pre-EC4 without remediation buckets).
- Business Impact: HIGH (3) — directly addresses vision Problem #3 (told what is wrong, not how to fix it); without this, the compliance feature is a problem-reporter, not a solution-provider; the vision explicitly names this as a primary capability.
- Technical Risk: MEDIUM (2) — web search is standard CTOC research tooling; the main risks are rate limiting and price-data staleness, both mitigated by the fallback protocol and `retrieved_date` field.

---

## Decisions Taken Under Ambiguity

- **Where the recommender lives.** Decision: a single shared Tier-2 agent (`agents/compliance/eu-solution-recommender.md`) the two regime agents call, rather than duplicating recommendation logic in each. Keeps bucket/ranking rules in one place (DRY) and matches the vision's "three buckets" being identical across regimes.
- **Authoritative source list.** Decision: per vision, primary sources are EUR-Lex, EDPB, the AI Office, and national DPAs for *legal facts*; the *solution landscape* is searched broadly but each option must carry a verifiable source URL + retrieval date. Static vendor tables in the existing skills (e.g. OneTrust, Cookiebot, Vanta; Credo AI, Holistic AI) seed candidates but are re-verified live, never quoted as current truth without a fresh source.
- **Price presentation.** Decision: state price as a plain fact (e.g. "€X/month, list price, retrieved 2026-06-15") with no editorializing; open-source options say "no license fee — self-hosting/infra cost applies." Per CLAUDE.md recommend-highest-quality + no-editorializing rules.
- **No invented regulatory facts.** Decision: the recommender may only assert a date/threshold it has just verified against an authoritative source this run; if verification fails (e.g. no network), it falls back to the figure the existing skill documents, labels it `unverified-this-run`, and continues (no-stub rule) — it does NOT block and does NOT fabricate.
- **Web tooling.** Decision: use WebSearch/WebFetch (the standard CTOC research path); the agent declares web tools in its frontmatter — this is the slice that grants the web access the code-only skills lack.
