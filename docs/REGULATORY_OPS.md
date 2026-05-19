# Regulatory Operational Controls (Cluster 7)

> Last updated: 2026-05-19
> Status: Cluster 7 of the CTOC regulatory-regime profile framework
> Predecessor clusters: 1 Evidence and Auditability, 2 Independence and Segregation of Duties, 3 Risk Analysis Before Build, 4 Traceability and Reconciliation, 5 Continuous Improvement, 6 Real-time and Timing

Cluster 7 closes the loop between the planning-and-build pipeline (Clusters 1–6) and the **continuing operational obligations** the regulators actually inspect: do you respond to data subject requests on time, do you file the right incident notification inside the statutory window, can you restore service inside the documented Recovery Time Objective, can you explain why a refinement-loop kickback was proportional, and do you know the renewal date of every contract you have signed.

This document is the entry point for everything in Cluster 7. It cross-references the regulatory regime profiles that activate each control and the skills, libraries, and templates that operationalize them.

## Controls in this cluster

| Control | Activated by | Operationalized by | Output location |
|---|---|---|---|
| `dsar_handler` | `hipaa`, any profile that opts in | [[legal/dsar-handler]] skill | `.ctoc/dsar/<request-id>.yaml` |
| `cra_incident_clocks` | `eu-cra`, `dora` | [[security/cra-incident-clocks]] skill | `.ctoc/incidents/cra/<incident-id>/` |
| `nydfs_dora_incident_class` | `nydfs-500`, `dora` | [[security/incident-responder]] (existing skill, additional reporting branch in operations) | `.ctoc/incidents/nydfs-dora/<incident-id>/` |
| `business_continuity_plan` | `eu-cra`, `dora`, `nydfs-500`, `hipaa` | `.ctoc/resilience/bcp.yaml` template | `.ctoc/resilience/bcp.yaml` |
| `proportionality_test` | opt-in (recommended whenever the refinement loop is active) | `src/lib/proportionality.js` library | `.ctoc/proportionality-log/<date>.yaml` |
| `clm_obligations_tracker` | `hipaa`; recommended for `dora`, `nydfs-500` | [[legal/clm-obligations]] skill | `.ctoc/contracts/*.yaml` plus `clause-library/` |

## Profile coverage matrix

The table below shows which profile activates which Cluster 7 control. See the profile files under `.ctoc/regulatory-regimes/` for full required-controls lists.

| Profile | `dsar_handler` | `cra_incident_clocks` | `nydfs_dora_incident_class` | `business_continuity_plan` | `proportionality_test` | `clm_obligations_tracker` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `eu-cra` (European Union Cyber Resilience Act) | — | yes | — | yes | — | — |
| `dora` (Digital Operational Resilience Act) | — | yes | yes | yes | — | — |
| `nydfs-500` (23 New York Codes Rules and Regulations Part 500) | — | — | yes | yes | — | — |
| `hipaa` (Health Insurance Portability and Accountability Act) | yes | — | — | yes | — | yes |

When multiple profiles are stacked (the framework supports union-merge — see `src/lib/regulatory-regime.js`), any control required by any profile is active.

## Data Subject Access Request (DSAR) handler — `dsar_handler`

**Why:** General Data Protection Regulation Articles 12, 15, 17, 20 — and the parallel rights under California Consumer Privacy Act, Quebec Law 25, Brazil Lei Geral de Proteção de Dados, Health Insurance Portability and Accountability Act 45 Code of Federal Regulations §164.524 — all carry firm response clocks (one month, 30 days, 45 days, 15 days, 30 days respectively). Missing the clock is the single most common cause of supervisory-authority enforcement.

**What it does:** [[legal/dsar-handler]] is the per-request workflow: identity verification, scope assessment, data discovery across primary database, search index, cache, analytics warehouse, backups, and third-party processors; machine-readable JSON export; signed deletion attestation. Per-request evidence lives at `.ctoc/dsar/<request-id>.yaml`.

**Cross-references:**
- Upstream consent and Records of Processing Activities → [[compliance/gdpr-compliance-checker]].
- Privacy Policy, Data Processing Agreement, Cookie Policy drafts → [[saas/legal-scaffold]].
- Sub-processor list at deletion-cascade time → [[legal/clm-obligations]] writes the canonical sub-processor list to `.ctoc/contracts/`.

**Schema:** see `.ctoc/dsar/_README.md`.

## Cyber Resilience Act (CRA) incident clocks — `cra_incident_clocks`

**Why:** Regulation (EU) 2024/2847 Article 14 obliges manufacturers of products with digital elements to file three reports with the European Union Agency for Cybersecurity (ENISA) single reporting platform when an actively exploited vulnerability or severe incident is observed:

1. Early warning within 24 hours of awareness.
2. Notification within 72 hours.
3. Final report within 14 days of the corrective measure becoming available.
4. Incident-handling report at 30 days if the corrective measure is not yet available.

**What it does:** [[security/cra-incident-clocks]] is a focused skill that owns the CRA-specific schema and wall-clock tracking. It coordinates with [[security/incident-responder]] (which owns the broader incident command structure) and [[compliance/sbom-cra-checker]] (which validates the Software Bill of Materials referenced from the CRA report).

**Schema:** machine-readable JSON conformant to the ENISA single reporting platform field set; see [[security/cra-incident-clocks]] for the full schema.

**Effective dates:** reporting obligation binding from 11 September 2026. Conformity assessment binding from 11 December 2027.

## New York Department of Financial Services / Digital Operational Resilience Act incident classification — `nydfs_dora_incident_class`

**Why:** Both 23 New York Codes Rules and Regulations Part 500 §500.17 and Digital Operational Resilience Act Article 19 oblige covered entities to **classify** an incident before notifying — material vs non-material under 23 New York Codes Rules and Regulations Part 500; major vs significant under Digital Operational Resilience Act, with separate clocks for each class.

**What it does:** the existing [[security/incident-responder]] skill is the broad command structure (runbooks per class, on-call wiring, regulator filings). The Cluster 7 control adds a **classification decision tree** that the incident commander runs at T0:

```
                ┌──────────────────────────────────────────┐
                │  T0  awareness of a security event       │
                └──────────────────────────────────────────┘
                              │
        ┌─────────────────────┼────────────────────────────┐
        ▼                                                  ▼
  affects financial entity?                          affects manufactured product?
       (DORA scope?)                                       (CRA scope?)
        │ yes                                                    │ yes
        ▼                                                        ▼
  classify per DORA Art. 18 RTS                             classify per CRA Art. 14
   - clients_affected_count                                  - actively_exploited?
   - data_losses_severity                                    - product_in_EU_market?
   - duration_outage_hours                                   - severity_cvss_v4
   - geographic_spread                                         (yes → CRA clocks)
   - economic_impact_thousand_eur
   - reputational_impact
   → tier: major / significant / non-reportable
   → notify CSIRT-IE / national CSIRT
        │
        ▼
  NYDFS-500 §500.17 also applies if NY-regulated entity:
   - 72-hour clock from determination
   - 24-hour clock for ransom payments
   - 72-hour clock for compromise of password / private key
```

**Where it writes:** `.ctoc/incidents/nydfs-dora/<incident-id>/classification.yaml` plus the per-clock submission files. The existing [[security/incident-responder]] skill handles the actual filing.

**Effective dates:** 23 New York Codes Rules and Regulations Part 500 (amended) in force since 1 December 2023. Digital Operational Resilience Act applicable since 17 January 2025.

## Business Continuity Plan — `business_continuity_plan`

**Why:** Digital Operational Resilience Act Article 11 obliges covered entities to maintain an Information and Communication Technology Business Continuity Policy with documented Recovery Time Objective and Recovery Point Objective per critical or important function. Health Insurance Portability and Accountability Act 45 Code of Federal Regulations §164.308(a)(7) and 23 New York Codes Rules and Regulations Part 500 §500.16 carry parallel obligations.

**What it does:** `.ctoc/resilience/bcp.yaml` is the operational Business Continuity Plan for the CTOC pipeline itself. It declares per-phase Recovery Time Objective and Recovery Point Objective:

| Phase | Recovery Time Objective | Recovery Point Objective | Class |
|---|---|---|---|
| Planning (Steps 1 IDEATE through 7 SPEC) | 8 hours | 60 minutes | important |
| Implementation (Steps 8 TEST through 15 DOCUMENT) | 4 hours | 15 minutes | important |
| Review (Step 16 FINAL-REVIEW — Gate 3) | 2 hours | 5 minutes | critical |
| Audit log and dispatch records | 1 hour | 0 minutes (no data loss) | critical |

Plus: offline fallback procedures per phase, alternative-provider list (primary Claude Opus 4.7 → fallback Sonnet 4.7 → emergency Haiku 4.5), drill schedule (twice per calendar year — meets Digital Operational Resilience Act Article 25 "at least annual" testing programme), and a critical-dependency register.

**When CTOC is embedded in a host organization in scope of Digital Operational Resilience Act:** the host's overarching policy takes precedence. `bcp.yaml` remains the operational reference for the pipeline-internal phases.

**Schema:** see `.ctoc/resilience/bcp.yaml` directly — it is the template, populated with sensible defaults.

## Proportionality test — `proportionality_test`

**Why:** the refinement loop (see `docs/REFINEMENT_LOOP.md`) is a multi-round critic-implement-test cycle. A kickback from a critic to the implementer is a discovery request in the Federal Rules of Civil Procedure sense — the critic is asking for additional work to be produced. Federal Rules of Civil Procedure Rule 26(b)(1) as amended in 2015 requires that discovery be "proportional to the needs of the case" weighed across six factors. Applying the same discipline inside the refinement loop catches runaway kickbacks before the circuit breaker has to.

**What it does:** `src/lib/proportionality.js` exposes `logProportionalityDecision(kickbackId, factors, decision)`. On every kickback, the CTO Chief weighs:

1. Importance of the issues at stake.
2. Severity of the finding (analog: amount in controversy).
3. Relative access to information (analog: which agent has the evidence).
4. Effort-budget remaining (analog: parties' resources).
5. Importance of the finding in gating Gate 3 (analog: importance of the discovery in resolving the issues).
6. Burden of the kickback versus its likely benefit.

Each factor carries a weight 1..5 and a rationale string. The decision is one of `proceed | narrow | defer | reject`. Output is append-only YAML at `.ctoc/proportionality-log/<date>.yaml`.

**Citation:** Carter Ledyard advisory — ["Discovery and Proportionality: Recalibrating Federal Rule 26(b)(1)"](https://www.clm.com/discovery-and-proportionality-recalibrating-federal-rule-26b1/).

**Why this matters operationally:** under-using the test means the refinement loop will churn on low-severity findings against high-effort budgets; over-using it means high-severity findings get deferred. The log itself is the audit trail — when the user asks "why did this take so many rounds?" the answer is in the log.

## Contract Lifecycle Management (CLM) obligations tracker — `clm_obligations_tracker`

**Why:** signing a contract creates continuing obligations — renewal dates, non-renewal notice deadlines, audit windows, service-level review dates, sub-processor review dates, Transfer Impact Assessment refresh deadlines, attestation renewal dates. A privacy policy template plus a terms-of-service template (handled by [[saas/legal-scaffold]]) is the **starting point**, not the operational steady state. Cluster 7 fills the gap.

**What it does:** [[legal/clm-obligations]] extracts the timer-bearing fields from every executed agreement and writes them to `.ctoc/contracts/<counterparty>.yaml`. It points to a `clause-library/` of lawyer-reviewed clause references — the skill never drafts fresh legal language. It surfaces findings like `missing-renewal-date`, `non-renewal-window-closing`, `audit-window-overdue`, `dpa-without-tia`, and (under Health Insurance Portability and Accountability Act) `missing-baa`.

**Schema:** see `.ctoc/contracts/_README.md`.

## Where Cluster 7 sits in the overall architecture

```
                   ┌──────────────────────────────────────────┐
                   │  Iron Loop (16 steps)                    │
                   │  Plans → designs → code → tests → ship   │
                   └──────────────────────────────────────────┘
                                       │
                                       │ produces artifacts the
                                       │ regulators inspect
                                       ▼
                   ┌──────────────────────────────────────────┐
                   │  Cluster 7 — Regulatory Operational      │
                   │  Controls                                │
                   │                                          │
                   │  • DSAR handler        (per-request)     │
                   │  • CRA incident clocks (per-incident)    │
                   │  • NYDFS / DORA class. (per-incident)    │
                   │  • Business Continuity Plan (always-on)  │
                   │  • Proportionality log (per-kickback)    │
                   │  • CLM obligations     (per-contract)    │
                   └──────────────────────────────────────────┘
                                       │
                                       │ evidence written to
                                       │ .ctoc/audit/, .ctoc/dsar/,
                                       │ .ctoc/contracts/, etc.
                                       ▼
                   ┌──────────────────────────────────────────┐
                   │  Hash-chained audit log                  │
                   │  (Cluster 1 control)                     │
                   └──────────────────────────────────────────┘
```

Cluster 7 controls are **always opt-in via a profile** — CTOC stays lean by default. Activate them by adding the relevant profile to `.ctoc/settings.yaml`:

```yaml
regulatory_regime:
  active_profiles:
    - hipaa             # activates dsar_handler, business_continuity_plan, clm_obligations_tracker
    - dora              # activates cra_incident_clocks, nydfs_dora_incident_class, business_continuity_plan
  overrides:
    proportionality_test: true       # opt in even without a profile that requires it
```

## Cross-references

- `src/lib/regulatory-regime.js` — the profile framework. Cluster 7 controls are listed in `KNOWN_CONTROLS` under the "Cluster 7 — Regulatory Operational Controls" comment block.
- `.ctoc/regulatory-regimes/eu-cra.yaml` — European Union Cyber Resilience Act profile.
- `.ctoc/regulatory-regimes/dora.yaml` — Digital Operational Resilience Act profile.
- `.ctoc/regulatory-regimes/nydfs-500.yaml` — 23 New York Codes Rules and Regulations Part 500 profile.
- `.ctoc/regulatory-regimes/hipaa.yaml` — Health Insurance Portability and Accountability Act profile.
- `docs/AGENT_ARCHITECTURE.md` — overall tiered agent architecture.
- `docs/REFINEMENT_LOOP.md` — the multi-agent critic-implement-test loop that the proportionality test guards.
- `docs/IRON_LOOP.md` — the 16-step pipeline whose artifacts Cluster 7 makes regulator-ready.

## Authoritative sources cited across Cluster 7

- General Data Protection Regulation — Regulation (EU) 2016/679; primary text at [eur-lex.europa.eu](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- California Consumer Privacy Act / California Privacy Rights Act — codified at California Civil Code §§1798.100 et seq.; [Attorney General page](https://oag.ca.gov/privacy/ccpa).
- Quebec Law 25 — Loi modernisant des dispositions législatives en matière de protection des renseignements personnels.
- Cyber Resilience Act — Regulation (EU) 2024/2847; [European Commission page](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act).
- Cyber Resilience Act 2026 milestones — [Hogan Lovells](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026).
- Digital Operational Resilience Act — Regulation (EU) 2022/2554; [text](https://www.digital-operational-resilience-act.com/DORA_Articles.html).
- 23 New York Codes Rules and Regulations Part 500 — [WilmerHale summary of 2023 amendments](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20231128-nydfs-finalizes-amendments-to-cybersecurity-regulations).
- Health Insurance Portability and Accountability Act — Code of Federal Regulations Title 45 Parts 160 and 164; access right at [Cornell Legal Information Institute §164.524](https://www.law.cornell.edu/cfr/text/45/164.524).
- Federal Rules of Civil Procedure Rule 26(b)(1) — [Carter Ledyard advisory](https://www.clm.com/discovery-and-proportionality-recalibrating-federal-rule-26b1/).
- Data Subject Access Request workflow — [Osano](https://www.osano.com/articles/data-subject-access-request); right of erasure — [Exabeam](https://www.exabeam.com/explainers/gdpr-compliance/gdpr-article-17-right-of-erasure-how-it-works-and-7-steps-to-compliance/).
- Business Associate Agreement — [HIPAA Journal](https://www.hipaajournal.com/hipaa-business-associate-agreement/).
