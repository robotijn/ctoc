---
name: incident-responder
description: Security Incident Response — NIST SP 800-61r3 / CSF 2.0 lifecycle commander, runbooks per incident class, on-call wiring, regulatory clocks (ENISA CRA 24h, SEC 8-K Item 1.05 4 business days, NIS2, GDPR 72h, CIRCIA pending), blameless postmortems.
type: skill
when_to_load:
  - "incident response"
  - "IR runbook"
  - "NIST 800-61"
  - "CSF 2.0 incident"
  - "postmortem"
  - "blameless postmortem"
  - "ENISA reporting"
  - "CRA 24 hour"
  - "SEC 8-K cyber"
  - "Item 1.05"
  - "NIS2 reporting"
  - "CIRCIA"
  - "GDPR 72 hour"
  - "on-call rotation"
  - "escalation policy"
  - "war room"
  - "SEV0"
  - "SEV1"
  - "data breach response"
  - "ransomware response"
  - "double extortion"
  - "prompt injection incident"
related_skills:
  - compliance/audit-log-checker
  - compliance/sbom-cra-checker
  - compliance/gdpr-compliance-checker
  - security/security-scanner
  - specialized/observability-checker
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Incident Responder (skill)

> Created for the CTOC v8 IR layer. Auto-loaded when the user prompt matches a `when_to_load` trigger or when CTO Chief detects an incident-response gap during a security/compliance sweep.

## Role

You are a paranoid incident-response commander. You assume the worst possible interpretation of any alert: the breach already happened, customer data is already moving, the regulator's clock is already ticking. Your job is to ensure that — long before any real incident — the organization has the runbooks, on-call rotations, communication trees, evidence-preservation procedures, and reporting wiring required to contain the damage within minutes and meet every regulatory deadline. When you scan a codebase or a `.ctoc/operations/` tree, you are looking for the missing artifacts that will hurt the team at 03:00 on a Saturday. There is no soft tier here — every missing runbook is `severity: critical` on the wire.

### Skill boundary (what you own vs. defer)

You own the **command structure** of incident response: runbooks per class, on-call wiring, communication tree, evidence preservation, regulator filings, postmortem template, and game-day cadence. You explicitly defer:

- **Audit-trail completeness, append-only enforcement, hash-chain integrity, retention windows** → [[audit-log-checker]]. You require an audit log to exist and be append-only; the *how* (column set, RLS, HMAC chain) belongs to that skill.
- **Alert instrumentation, OpenTelemetry semantic conventions, SLO definition, label cardinality** → [[observability-checker]]. You require that an alert can fire from a SIEM rule into your pager; the *how* (which span attributes, which OTel signal) belongs there.
- **GDPR Article 33 DPA notification content, lawful-basis analysis, DPIA** → [[gdpr-compliance-checker]]. You require the runbook to schedule and route the 72h DPA filing; the *text of the filing* belongs there.
- **SBOM diffs, signed-artifact verification, build-pipeline integrity** → [[sbom-cra-checker]]. You require the supply-chain runbook to invoke an SBOM diff; the *diff mechanics* belong there.

A postmortem-facilitator skill is *planned* (it would interactively walk a team through filling the template), but it does not yet exist. Until then, you ship the template and validate it; the human team runs the facilitation.

## 2026 Best Practices (NIST SP 800-61 Rev. 3 / CSF 2.0)

NIST published SP 800-61 Rev. 3 in April 2025, finalizing a full rewrite of the incident-response lifecycle and aligning it with the Cybersecurity Framework (CSF) 2.0 Community Profile. The old four-phase Prepare → Detect/Analyze → Contain/Eradicate/Recover → Post-Incident model is replaced by the **six CSF 2.0 Functions** ([NIST SP 800-61r3, final](https://csrc.nist.gov/pubs/sp/800/61/r3/final)):

| Function | Purpose in IR | Artifacts you must verify exist |
|---|---|---|
| **Govern (GV)** | Risk-management strategy, expectations, policy established and communicated. | IR policy doc, charter, RACI, budget line, executive sponsor, third-party-IR retainer. |
| **Identify (ID)** | Current cybersecurity risks understood. | Asset inventory, data-flow map, crown-jewel list, threat model, vendor list, regulatory-scope matrix. |
| **Protect (PR)** | Safeguards in place to manage risk. | MFA, least privilege, segmentation, backup integrity, patch SLAs, encryption at rest + in transit. |
| **Detect (DE)** | Possible incidents found and analyzed. | SIEM coverage map, alert catalog, EDR on every endpoint, threat-intel feeds, baseline metrics. |
| **Respond (RS)** | Actions taken on detected incidents — contain, eradicate, communicate. | Runbooks per incident class, on-call rotation, communication tree, evidence-preservation SOP. |
| **Recover (RC)** | Affected assets and operations restored; lessons learned. | DR plan, RTO/RPO targets, backup restore tests, blameless postmortem template, action-item tracking. |

Govern/Identify/Protect are continuous (they happen all the time, not only during incidents). Detect/Respond/Recover activate when something is wrong. Both halves must be in place — a team with great runbooks but no asset inventory cannot scope a breach; a team with great inventory but no on-call rotation cannot reach the runbooks at 03:00.

### Detection-to-containment SLA

Targets (industry consensus, used by major IR retainers and the [CISA Incident Response Playbooks](https://www.cisa.gov/sites/default/files/2024-08/Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf)):

| Severity | Detection → triage start | Triage → containment | Containment → eradication | Public/customer comms |
|---|---|---|---|---|
| SEV0 (critical) | < 5 min | < 1 hour | < 24 hours | < 4 hours |
| SEV1 (high) | < 15 min | < 4 hours | < 72 hours | < 24 hours |
| SEV2 (medium) | < 1 hour | < 24 hours | < 7 days | as required |
| SEV3 (low) | next business day | < 1 week | < 30 days | none required |

If a runbook does not declare its target SLA, that is a `missing-sla` finding.

### Pre-written runbooks per incident class

You require a runbook for each incident class below. A missing runbook is a `missing-runbook` finding (always `severity: critical`):

| Incident class | Trigger | Containment first move | Notable regulators |
|---|---|---|---|
| **data-breach** | Confirmed exfiltration of customer PII / regulated data | Revoke exfil path (tokens, network egress), preserve evidence | GDPR (72h to DPA), SEC 8-K Item 1.05 if material (4 business days, US-listed issuer), NIS2 (24h early warning / 72h notification / 1 month final, EU essential/important entities), state AGs, sectoral CSIRT |
| **ransomware** | File-system encryption events, ransom note, **OR** ransom demand without encryption (data-leak / "double extortion") | Isolate, do not pay, preserve memory + disk images, assume data was exfiltrated before encryption fired | FBI/IC3, ENISA, local LEA, OFAC sanctions check on the threat actor, SEC 8-K Item 1.05 if material, GDPR if PII exfiltrated |
| **dos-ddos** | Traffic floods, SYN/UDP amplification, application-layer flood | Activate scrubbing (Cloudflare/Akamai), rate-limit, ASN-block | None mandatory unless prolonged + customer-data unavailable; NIS2 if "essential entity" |
| **supply-chain** | Compromised dependency, build-pipeline tampering, signed-artifact mismatch, SBOM-poisoning (typosquat / hallucinated package) | Rotate signing keys, freeze deploys, scan SBOM diff (defer to [[sbom-cra-checker]]) | ENISA SRP (CRA Art. 14, 24h), CISA, NIS2, SEC if material |
| **cred-theft** | Leaked secrets, session-token exfil, OAuth-token abuse | Rotate all affected creds, force re-auth, audit token usage | GDPR if PII access, SEC if material, NIS2 if essential entity |
| **ai-prompt-injection** | LLM behavior deviation, tool calls outside spec, data exfil via prompt-encoded output | Disable agent, freeze affected tools, audit tool-call log, treat any data the agent saw as potentially exfiltrated | EU AI Act if high-risk system; if injection caused PII leak escalate to data-breach class for GDPR/SEC |
| **insider-threat** | Anomalous admin action, off-hours bulk export, prohibited data movement | Suspend account, preserve audit log, involve legal | GDPR, employment law, SEC if material |
| **physical-access** | Lost device, stolen laptop, badge-system breach | Remote wipe, revoke certs, change physical locks | Varies — if disk-encryption was off and PII was on the device, escalate to data-breach |

#### Regulatory clocks — the cheat sheet you keep open during the war room

| Regime | Trigger | Filing | Deadline from awareness |
|---|---|---|---|
| GDPR Art. 33 | Personal-data breach, EU data subjects | DPA notification | 72 hours |
| EU CRA Art. 14 | Actively exploited vuln OR severe incident, product with digital elements sold in EU | ENISA SRP early warning | 24 hours |
| EU CRA Art. 14 | (same trigger) | ENISA SRP detailed/intermediate | 72 hours |
| EU CRA Art. 14 | Vuln with mitigating measure available | ENISA SRP final (vuln) | 14 days |
| EU CRA Art. 14 | Severe incident | ENISA SRP final (incident) | 1 month |
| EU NIS2 | Significant incident, essential/important entity | National CSIRT early warning | 24 hours |
| EU NIS2 | (same trigger) | National CSIRT notification | 72 hours |
| EU NIS2 | (same trigger) | National CSIRT final report | 1 month |
| SEC 17 CFR 229.106 | Material cybersecurity incident, US-listed issuer | Form 8-K Item 1.05 | 4 business days from materiality determination |
| US CIRCIA (pending) | "Covered cyber incident" at covered critical-infrastructure entity (NPRM April 2024; final rule expected 2025–2026) | CISA report | 72 hours (24 hours for ransom payment) |
| HIPAA Breach Notification | Unsecured PHI breach affecting ≥500 individuals | HHS OCR + media | 60 calendar days |
| US state AG laws | PII of residents of that state | State AG + affected residents | Varies (commonly "without unreasonable delay"; CA: most expedient time) |

A runbook for any class above that does not name the applicable regimes and timeline is `missing-regulatory-matrix`. The 24-hour ENISA / NIS2 clock and the 4-business-day SEC clock can run simultaneously for a single incident — multi-regime tracking is mandatory.

### Communication tree

Every runbook must reference a communication tree. The minimum tree:

```
Incident Commander (IC) — on-call lead
  ├─ Tech leads (one per affected service)
  ├─ Comms lead — drafts customer/status-page updates
  ├─ Legal counsel — privacy notification analysis
  ├─ Executive sponsor (CTO/CISO/CEO depending on severity)
  ├─ Customer-success lead — handles inbound from named accounts
  └─ Regulator liaison — ENISA SRP, DPA, sectoral CSIRT
```

Missing tree members is a `no-communication-tree` finding. The tree must be reachable inside two minutes — phone, not just Slack.

### ENISA Single Reporting Platform — CRA Article 14 workflow

From **11 September 2026**, the EU Cyber Resilience Act requires manufacturers of products with digital elements to report (a) actively exploited vulnerabilities and (b) severe incidents impacting product security, via the **ENISA Single Reporting Platform (SRP)** ([Reporting obligations, EC](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting); [ENISA SRP](https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp)):

| Clock | What | Deadline from awareness |
|---|---|---|
| Early warning | Initial notification | **24 hours** |
| Intermediate report | Update with assessment | **72 hours** |
| Final report — vulnerability | Once mitigating measure is available | **14 days** |
| Final report — severe incident | Full post-incident write-up | **1 month** |

The 24-hour clock starts at **awareness**, not at confirmation. Forensic certainty is not required to file the early warning. The SRP routes the submission automatically to the manufacturer-designated CSIRT and to ENISA simultaneously; the CSIRT disseminates to other Member State CSIRTs and market-surveillance authorities.

A codebase that produces a "product with digital elements" sold in the EU and has no wiring to the SRP (no submission credentials, no draft template, no on-call regulator-liaison role) is a `no-enisa-wiring` finding.

### Blameless postmortems

Every SEV0/SEV1 incident must produce a postmortem. The Google SRE workbook ([Postmortem Culture](https://sre.google/workbook/postmortem-culture/), [SRE Book postmortems](https://sre.google/sre-book/postmortem-culture/)) is the canonical reference. Required template sections:

1. **Summary** — one paragraph, what happened, when, who was affected, total impact.
2. **Timeline** — UTC timestamps, role-based actor labels (never personal names — use "the on-call SRE", "the deploy engineer"; this is the central blameless practice).
3. **Impact assessment** — users affected, revenue impact, data scope, regulatory exposure.
4. **Contributing factors** — 2–5 systemic causes (process gaps, tool limitations, doc failures). No single root cause.
5. **What went well** — explicitly reinforce successful response behaviors.
6. **Action items** — mitigative (fixes this gap) + preventative (addresses the class). Each item has an owner, due date, and Jira/Linear/GitHub link.
7. **Lessons learned** — feeds back into Govern/Identify/Protect (NIST 800-61r3 §4 — "Improvement").

Missing postmortem template = `no-postmortem-template`. Postmortems with personal names = `blameful-postmortem`.

### Chaos game days

A runbook that has never been exercised is a fiction. NIST 800-61r3 §3 and Google SRE both require **regular exercises** (annual minimum, quarterly recommended) for each runbook. Track last-exercise date per runbook. If `last_exercised_at` is null or older than 12 months, that is `runbook-not-exercised`.

### Evidence preservation

Before any remediation step that destroys state, the runbook must order evidence collection. Required artifacts:

- Memory dump of affected hosts (volatile, collect first)
- Disk image (forensic copy, write-blocked source)
- Network captures from at least the suspected time window
- Audit log export, pinned to immutable storage (see [[audit-log-checker]] for the audit-log layer)
- Cloud-provider activity log (AWS CloudTrail, GCP Audit Logs, Azure Activity Log)
- IAM snapshot — who had what permissions at the time

Missing evidence-preservation step in a runbook = `no-evidence-preservation`. This is the field most often skipped and the field most often demanded by regulators and insurers months later.

## Incident classes and runbook outlines

The skeleton each runbook must follow. Verify the artifact at `.ctoc/operations/runbooks/<class>.md` exists with every section populated.

### Runbook skeleton (mandatory sections)

```yaml
# .ctoc/operations/runbooks/<incident-class>.md
incident_class: data-breach | ransomware | dos-ddos | supply-chain | cred-theft | ai-prompt-injection | insider-threat | physical-access
severity_floor: SEV0 | SEV1 | SEV2          # lowest SEV this class can be (internal scale)
sla:
  detection_to_triage_minutes: 5
  triage_to_containment_hours: 1
  containment_to_eradication_hours: 24
  public_comms_hours: 4
detection_signals:
  - <SIEM rule id or alert name>
on_call:
  primary: <PagerDuty schedule URL or incident.io / FireHydrant / Rootly schedule id>
  # Opsgenie schedule ids accepted only if a JSM migration date is also recorded
  # (Opsgenie EOS: April 5, 2027 — no new sales since June 4, 2025).
  escalation_chain: [<role-1>, <role-2>, <executive>]
communication_tree_ref: .ctoc/operations/communication-tree.md
regulatory:                                # the deadline cheat sheet, codified
  gdpr_art33_required: true | false        # 72h DPA
  enisa_srp_required: true | false         # 24h / 72h / 14d / 1mo (CRA Art. 14)
  nis2_required: true | false              # 24h / 72h / 1mo (essential/important entities)
  sec_8k_item_1_05_required: true | false  # 4 business days from materiality (US-listed)
  circia_required: true | false            # 72h covered cyber incident / 24h ransom payment
  hipaa_breach_notification_required: true | false   # 60d, ≥500 individuals
  other: [state-AG, sectoral-CSIRT, OFAC, FBI, Europol]
  regulator_notification_deadlines:        # explicit per-regime deadlines for THIS class
    gdpr_dpa_hours: 72
    enisa_early_warning_hours: 24
    enisa_intermediate_hours: 72
    enisa_final_days: 14                   # or 30 for "severe incident" final
    nis2_early_warning_hours: 24
    sec_8k_business_days: 4
phases:
  detect:
    - <first signal to confirm>
    - <how to scope: queries to run, dashboards to open>
  contain:
    - <first action — must NOT destroy evidence>
    - <isolate affected systems>
  evidence_preservation:                   # MANDATORY — never skip
    - memory_dump: <tool / command>
    - disk_image: <tool / command>
    - network_capture: <tool / command>
    - audit_log_pin: <where to store with WORM semantics — defer to [[audit-log-checker]]>
  eradicate:
    - <remove the foothold>
    - <rotate compromised secrets>
  recover:
    - <restore from backups (verify integrity first)>
    - <re-enable services in dependency order>
  lessons_learned:
    - <postmortem due date: incident_close + 5 business days>
last_exercised_at: 2026-03-15              # game-day date; null fails the check
exercise_findings_link: <path / URL>
```

### Per-class extras

- **data-breach**: identify regulated data classes (PII, PHI, PCI), legal-counsel intake within 1h, GDPR Art. 33 72h DPA notification, SEC 8-K Item 1.05 materiality determination + 4-business-day clock if the issuer is US-listed (defer text drafting to securities counsel), customer notification template ready before drafting.
- **ransomware**: never pay first — coordinate with FBI/Europol; preserve ransom note text; check backup integrity before restore; rotate ALL credentials, not just affected accounts; **assume double extortion** — if a ransom demand arrives, treat data as already exfiltrated and run the data-breach class in parallel (GDPR 72h, SEC 8-K material if applicable); OFAC sanctions check on threat-actor identifiers before any payment discussion; if any payment is contemplated under CIRCIA (pending US rule), 24-hour reporting clock fires.
- **dos-ddos**: pre-existing scrubbing contract (Cloudflare Magic Transit / Akamai Prolexic / AWS Shield Advanced); rate-limit rules ready; geo/ASN blocklist staged; if the entity is NIS2 essential/important and the outage is "significant", 24h early warning to national CSIRT.
- **supply-chain**: SBOM diffs (defer to [[sbom-cra-checker]]); rotate signing keys; check build-pipeline integrity; ENISA SRP early warning within 24h if the affected product ships in the EU; also flag if the compromised dependency is a *hallucinated* package (AI-suggested name that did not exist on the registry but was published by an attacker after the suggestion) — this is the LLM01-adjacent supply-chain vector documented in 2024–2025 research.
- **cred-theft**: rotate every credential touched by the compromised account, not just the leaked one (lateral-movement assumption); revoke OAuth grants; force re-auth across all sessions; audit token-issuance logs for at least 30 days back.
- **ai-prompt-injection**: disable the affected agent immediately; freeze the affected tool list; audit every tool-call the agent made in the past 7 days; check for data exfil via prompt-encoded outputs (base64 in a "summary", zero-width characters in a markdown reply, hyperlinks to attacker-controlled URLs that smuggle data via path/query); if the agent touched personal data, escalate to data-breach class for GDPR + SEC clocks; if the agent ran in a "high-risk AI system" per EU AI Act Art. 6, document for AI Office reporting.
- **insider-threat**: legal involvement before any account action; preserve full audit log of the suspect account; do NOT confront the suspect until evidence is preserved and HR + legal are aligned.
- **physical-access**: remote-wipe within 1h; revoke device certificates; rotate any creds that touched the device; check backup encryption (was disk-level encryption actually enabled?); if disk-encryption was off and PII was resident, escalate to data-breach for GDPR/SEC clocks.

## Categories (what this skill flags)

Ordered by impact-when-it-matters. Every missing artifact below is `severity: critical` on the wire — the warning here predicts the customer-visible failure later.

### 0. Missing runbook for a known incident class

```yaml
# BAD: .ctoc/operations/runbooks/ exists with only "data-breach.md"
#      Eight classes expected, seven missing.

# SAFE: one file per class, conformant to skeleton above.
ls .ctoc/operations/runbooks/
# data-breach.md  ransomware.md  dos-ddos.md  supply-chain.md
# cred-theft.md  ai-prompt-injection.md  insider-threat.md  physical-access.md
```

### 1. No on-call rotation wired

Heuristics:
- Absence of `pagerduty:` / `opsgenie:` / `incident_io:` / `firehydrant:` / `rootly:` / `betterstack:` config in `.ctoc/settings.yaml` or repo `ops/` directory.
- Runbook lists "on-call lead" but no schedule URL.
- Only one human in the rotation (single point of failure).

### 2. No escalation policy

Each runbook must reference an escalation policy with at least three levels (primary on-call → secondary → engineering manager / CISO). Without escalation, a single missed page becomes an outage.

### 3. No communication tree

Missing `.ctoc/operations/communication-tree.md`, or tree without legal counsel, or tree without executive sponsor, or tree without external regulator-liaison.

### 4. No evidence-preservation procedure

Runbook contains a `contain:` phase but no `evidence_preservation:` phase — the team will destroy state before it is collected. This is the #1 reason insurer claims and regulator submissions get rejected.

### 5. No ENISA-reporting wiring (CRA)

For EU-distributed products:
- No SRP account credentials stored as a managed secret.
- No draft 24-hour template at `.ctoc/operations/regulatory/enisa-initial-template.md`.
- No designated regulator-liaison role in the communication tree.
- No clear trigger criteria (which incident classes require SRP filing).

### 5a. No SEC 8-K Item 1.05 wiring (US-listed issuers)

For organizations whose parent is a US-listed issuer (or that may IPO within 12 months):
- No materiality-determination procedure inside the runbook — the 4-business-day clock starts at *materiality determination*, not at detection, and the runbook must define who decides and how.
- No 8-K template at `.ctoc/operations/regulatory/sec-8k-item-1-05-template.md`.
- No named securities-counsel contact in the communication tree.
- No "incident_class triggers SEC review" matrix (data-breach, ransomware, cred-theft, supply-chain at minimum).

### 5b. No NIS2 / CIRCIA wiring (essential/important EU entities; US covered critical-infra)

For EU essential/important entities under NIS2, or US covered entities once CIRCIA's final rule is in force:
- No national-CSIRT contact in the communication tree (NIS2 routes per Member State).
- No CISA reporting template / portal credentials (CIRCIA; once final).
- No 24-hour-clock template that satisfies NIS2 early warning and CIRCIA ransom-payment reporting.

### 5c. Missing regulatory matrix in any runbook

A runbook that does not explicitly enumerate which clocks apply (GDPR / ENISA / NIS2 / SEC / CIRCIA / HIPAA / state-AG / sectoral) is `missing-regulatory-matrix`. Implicit "the lawyer knows" is not adequate at 03:00.

### 6. No postmortem template

Missing `.ctoc/operations/templates/postmortem.md` with the seven mandatory sections from the Google SRE workbook. Or a template that uses personal names instead of role labels.

### 7. IR tests never run (chaos game day)

Per-runbook `last_exercised_at` is null, missing, or older than 12 months. NIST 800-61r3 §3 mandates exercises; teams that skip them fail their first real incident.

### 8. Audit-log gap during incident

The runbook orders log preservation, but the audit-log layer (see [[audit-log-checker]]) has gaps: append-only is not enforced, retention is shorter than the longest applicable regulatory window, or critical events (auth, privilege change, data export) are not logged. Cross-link: this finding emits from incident-responder, but the fix lives in [[audit-log-checker]].

### 9. No status-page integration

For customer-facing products, the runbook must order a status-page update within the comms SLA. Heuristics: no `statuspage:` / `betterstack:` / `instatus:` config, no template at `.ctoc/operations/templates/statuspage-update.md`.

### 10. No DR/recovery validation

The runbook orders "restore from backups" but no procedure verifies backup integrity, no restore-test has been performed in the last 90 days, no RTO/RPO targets are declared.

## Implementation snippets (the seven-language rule)

The IR layer is not a single language — runbook YAML is foundational, then snippets cover the languages most likely to host an alert handler or webhook receiver. C/C++ snippets are deliberately omitted: incident-response webhook handlers and PagerDuty/Opsgenie integrations are essentially never written in C/C++. The language-coverage budget is better spent on SQL audit cross-link and a runbook YAML exemplar.

### Runbook YAML — foundational (full exemplar)

```yaml
# .ctoc/operations/runbooks/data-breach.md
incident_class: data-breach
severity_floor: SEV1                       # any confirmed PII exfil is at least SEV1
sla:
  detection_to_triage_minutes: 15
  triage_to_containment_hours: 4
  containment_to_eradication_hours: 72
  public_comms_hours: 24
detection_signals:
  - siem.rule: "anomalous_bulk_export"
  - siem.rule: "off_hours_admin_query"
  - dlp.alert: "pii_egress_blocked"
on_call:
  primary: https://acme.pagerduty.com/schedules/PSCHEDULE1
  escalation_chain: [primary_oncall, secondary_oncall, eng_manager, ciso, securities_counsel]
communication_tree_ref: .ctoc/operations/communication-tree.md
regulatory:
  gdpr_art33_required: true                # PII of EU data subjects
  enisa_srp_required: true                 # product ships in EU
  nis2_required: true                      # entity is "essential" under NIS2
  sec_8k_item_1_05_required: true          # parent is US-listed
  circia_required: false                   # entity not yet covered (pending final rule)
  hipaa_breach_notification_required: false
  other: [state_AG, sectoral_CSIRT]
  regulator_notification_deadlines:
    gdpr_dpa_hours: 72
    enisa_early_warning_hours: 24
    enisa_intermediate_hours: 72
    enisa_final_days: 30                   # severe-incident final report cadence
    nis2_early_warning_hours: 24
    sec_8k_business_days: 4
phases:
  detect:
    - "Open SIEM dashboard: <link>"
    - "Run scope query: SELECT user_id, COUNT(*) FROM audit_log WHERE ..."
  contain:
    - "Disable affected service accounts via IAM console"
    - "Block egress to unknown destinations at network edge"
    - "Rotate API keys touched by suspect account"
  evidence_preservation:                   # NEVER SKIP
    - memory_dump: "ssh <host> 'sudo lime-loader' → s3://forensics/{incident_id}/mem"
    - disk_image: "Snapshot EBS volume, copy to forensic AWS account"
    - network_capture: "Pull last 24h flow logs to s3://forensics/{incident_id}/net"
    - audit_log_pin: "WORM-pin via s3 object-lock for retention_years=7"
  eradicate:
    - "Remove malicious IAM grants"
    - "Rotate ALL credentials in blast radius, not just leaked"
  recover:
    - "Verify backups integrity, restore in dependency order"
    - "Re-enable services with monitoring tightened for 30 days"
  lessons_learned:
    - "Postmortem due: incident_close + 5 business days"
last_exercised_at: 2026-03-15
exercise_findings_link: .ctoc/operations/exercises/2026-03-data-breach.md
```

### Python — alert handler that opens an incident and pages

```python
# BAD: handler logs the alert and returns 200; nothing is paged, nothing is timed.
@app.post("/alerts/siem")
def receive_alert(payload: dict):
    log.info("siem alert: %s", payload)
    return {"ok": True}

# SAFE: classify, open incident, page on-call, start the SLA clock,
# preserve raw alert for evidence, structured-log for audit cross-link.
import time, hashlib, json
from datetime import datetime, timezone

CLASS_RUNBOOKS = {
    "anomalous_bulk_export": "data-breach",
    "ransomware_file_event": "ransomware",
    "syn_flood": "dos-ddos",
    "sbom_drift": "supply-chain",
    "leaked_secret_match": "cred-theft",
    "agent_tool_call_deviation": "ai-prompt-injection",
}

@app.post("/alerts/siem")
def receive_alert(payload: dict):
    incident_class = CLASS_RUNBOOKS.get(payload.get("rule_id"))
    if not incident_class:
        # Unknown rule — still page, do not silently drop. Unknown is worse than known.
        incident_class = "unknown"
    incident_id = hashlib.sha256(
        f"{payload['rule_id']}{payload['fired_at']}".encode()
    ).hexdigest()[:12]
    detected_at = datetime.now(timezone.utc).isoformat()

    # 1. Pin evidence FIRST — never let later steps lose the raw signal.
    evidence_store.put(f"{incident_id}/raw-alert.json",
                       json.dumps(payload), object_lock_years=7)

    # 2. Open the incident record (audit-log cross-link via [[audit-log-checker]]).
    incident_db.insert({
        "id": incident_id,
        "class": incident_class,
        "severity": classify_severity(payload),     # SEV0/1/2/3
        "detected_at": detected_at,
        "runbook": f".ctoc/operations/runbooks/{incident_class}.md",
        "status": "open",
    })

    # 3. Page on-call — start the SLA clock.
    pager.page(
        service_key=PAGERDUTY_SERVICE_KEY,
        title=f"[{incident_id}] {incident_class.upper()}",
        severity=payload.get("severity", "high"),
        custom_details={"runbook": f"runbooks/{incident_class}.md",
                        "evidence": f"s3://forensics/{incident_id}/"},
    )

    # 4. Structured log — feeds audit trail.
    log.info("incident_opened",
             extra={"incident_id": incident_id, "class": incident_class,
                    "detected_at": detected_at})
    return {"incident_id": incident_id, "runbook": incident_class}
```

### TypeScript — PagerDuty / Opsgenie webhook receiver (Next.js route handler)

```typescript
// BAD: webhook accepted without signature verification, no idempotency,
//      no audit log, no evidence pin. An attacker can replay or forge alerts.
export async function POST(req: Request) {
  const body = await req.json();
  console.log("alert", body);
  return Response.json({ ok: true });
}

// SAFE: verify signature, dedupe by event id, pin to evidence store,
// trigger paging, write to audit log.
import crypto from "node:crypto";
import { headers } from "next/headers";

const PAGERDUTY_WEBHOOK_SECRET = process.env.PAGERDUTY_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const raw = await req.text();
  const sigHeader = headers().get("x-pagerduty-signature") ?? "";

  // 1. Verify HMAC signature — never trust an unsigned incident webhook.
  const expected = crypto
    .createHmac("sha256", PAGERDUTY_WEBHOOK_SECRET)
    .update(raw)
    .digest("hex");
  const ok = sigHeader
    .split(",")
    .some((s) => s.startsWith("v1=") &&
                 crypto.timingSafeEqual(Buffer.from(s.slice(3)), Buffer.from(expected)));
  if (!ok) return new Response("bad signature", { status: 401 });

  const evt = JSON.parse(raw);

  // 2. Idempotency — PagerDuty retries; dedupe by event id.
  if (await incidentStore.exists(evt.event.id)) {
    return Response.json({ ok: true, deduped: true });
  }

  // 3. Pin raw evidence before any classification.
  await evidenceStore.put(`${evt.event.id}/raw.json`, raw, { objectLockYears: 7 });

  // 4. Classify, route, write to audit log.
  const incidentClass = routeToRunbook(evt.event.data.title);
  await auditLog.append({
    kind: "incident_opened",
    incidentId: evt.event.id,
    class: incidentClass,
    receivedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true, incidentClass });
}
```

### C# — .NET Aspire telemetry integration for incident response

.NET Aspire ships OpenTelemetry-first telemetry by default; the same pipeline that feeds your dashboards should feed an incident sink. The example below shows the alert handler and Aspire telemetry hookup together.

```csharp
// AppHost/Program.cs — Aspire orchestration with an alert sink resource.
var builder = DistributedApplication.CreateBuilder(args);
var alertSink = builder.AddProject<Projects.AlertSink>("alert-sink");
var api = builder.AddProject<Projects.Api>("api")
                 .WithReference(alertSink);                // expose alert-sink URI
builder.Build().Run();

// AlertSink/Program.cs — webhook receiver wired to OpenTelemetry + audit log.
var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();                              // Aspire OTel defaults
builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("Acme.IR"))               // incident counters
    .WithTracing(t => t.AddSource("Acme.IR"));             // incident spans

var app = builder.Build();

// SAFE: signature-verified, idempotent, audit-logged alert handler.
app.MapPost("/alerts/pagerduty", async (HttpContext ctx, IIncidentStore store,
                                        IEvidenceStore evidence, IPager pager) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var raw = await reader.ReadToEndAsync();

    if (!VerifyPagerDutySignature(raw, ctx.Request.Headers["X-PagerDuty-Signature"]!))
        return Results.Unauthorized();

    var evt = JsonSerializer.Deserialize<PagerDutyEvent>(raw)!;

    using var activity = ActivitySource.StartActivity("incident.open");
    activity?.SetTag("incident.id", evt.Id);
    activity?.SetTag("incident.class", evt.Class);

    if (await store.ExistsAsync(evt.Id))                   // idempotency
        return Results.Ok(new { deduped = true });

    await evidence.PinAsync($"{evt.Id}/raw.json", raw, objectLockYears: 7);
    await store.OpenAsync(evt.Id, evt.Class, DateTimeOffset.UtcNow);
    await pager.PageAsync(evt.Class, evt.Id);

    IncidentMeters.Opened.Add(1, new("class", evt.Class));
    return Results.Ok(new { incidentId = evt.Id });
});

app.Run();

// Meters expose incident counters to the same OTel pipeline as the rest of the app.
public static class IncidentMeters
{
    private static readonly Meter Meter = new("Acme.IR");
    public static readonly Counter<long> Opened = Meter.CreateCounter<long>("ir.incidents.opened");
    public static readonly Histogram<double> TimeToContain =
        Meter.CreateHistogram<double>("ir.time_to_contain_seconds");
}
```

### Java — Spring Boot Actuator + alerting

```java
// BAD: Actuator exposed without auth on production, alert endpoint without signature verification.
// management.endpoints.web.exposure.include=*   <-- DO NOT do this in prod

// SAFE: Actuator restricted, custom alert endpoint with signature + audit log.
@RestController
@RequestMapping("/alerts")
public class AlertController {

  private final IncidentStore store;
  private final EvidenceStore evidence;
  private final PagerService pager;
  private final MeterRegistry meters;

  public AlertController(IncidentStore s, EvidenceStore e, PagerService p, MeterRegistry m) {
    this.store = s; this.evidence = e; this.pager = p; this.meters = m;
  }

  @PostMapping("/opsgenie")
  public ResponseEntity<?> opsgenie(@RequestHeader("X-Opsgenie-Signature") String sig,
                                    @RequestBody String raw) throws Exception {
    if (!verifyHmacSha256(raw, sig, System.getenv("OPSGENIE_SECRET")))
      return ResponseEntity.status(401).build();

    AlertPayload p = mapper.readValue(raw, AlertPayload.class);
    if (store.exists(p.id())) return ResponseEntity.ok(Map.of("deduped", true));

    evidence.pin(p.id() + "/raw.json", raw, /*objectLockYears*/ 7);
    store.open(p.id(), p.incidentClass(), Instant.now());
    pager.page(p.incidentClass(), p.id());

    meters.counter("ir.incidents.opened", "class", p.incidentClass()).increment();
    return ResponseEntity.ok(Map.of("incidentId", p.id()));
  }
}

// application.yaml — Actuator endpoints restricted, role-required.
// management:
//   endpoints:
//     web:
//       exposure:
//         include: health,info,metrics,prometheus
//       base-path: /internal/actuator
//   endpoint:
//     health:
//       show-details: when-authorized
//   security:
//     enabled: true
```

### SQL — incident_log table and audit-trail cross-link

The incident store needs a queryable, append-only record. Cross-link with [[audit-log-checker]]: the same WORM / object-lock guarantees apply.

```sql
-- BAD: mutable incident log, no FK to audit events, no severity, no SLA timestamps.
CREATE TABLE incident_log (
  id TEXT PRIMARY KEY,
  description TEXT,
  status TEXT
);

-- SAFE: append-only, foreign-keyed to audit_event, severity-tagged, SLA-aware,
-- multi-regime regulator-clock-aware.
CREATE TABLE incident_log (
  id                       TEXT        PRIMARY KEY,
  class                    TEXT        NOT NULL CHECK (class IN (
                                         'data-breach','ransomware','dos-ddos','supply-chain',
                                         'cred-theft','ai-prompt-injection','insider-threat',
                                         'physical-access','unknown')),
  severity                 TEXT        NOT NULL CHECK (severity IN ('SEV0','SEV1','SEV2','SEV3')),
  -- ^ "sev_internal" — the IR triage scale, orthogonal to the refinement-loop
  --   letter where every finding emits as severity: critical.
  detected_at              TIMESTAMPTZ NOT NULL,
  materiality_decided_at   TIMESTAMPTZ,                  -- starts the SEC 4-business-day clock
  triaged_at               TIMESTAMPTZ,
  contained_at             TIMESTAMPTZ,
  eradicated_at            TIMESTAMPTZ,
  recovered_at             TIMESTAMPTZ,
  postmortem_url           TEXT,
  -- Regulator filing proof — each timestamp documents that the clock was met.
  gdpr_filed_at            TIMESTAMPTZ,                  -- 72h DPA
  enisa_early_warning_at   TIMESTAMPTZ,                  -- 24h CRA early warning
  enisa_intermediate_at    TIMESTAMPTZ,                  -- 72h CRA detailed
  enisa_final_at           TIMESTAMPTZ,                  -- 14d (vuln) / 1mo (severe)
  nis2_early_warning_at    TIMESTAMPTZ,                  -- 24h NIS2
  nis2_notification_at     TIMESTAMPTZ,                  -- 72h NIS2
  nis2_final_at            TIMESTAMPTZ,                  -- 1mo NIS2
  sec_8k_filed_at          TIMESTAMPTZ,                  -- 4 business days from materiality
  circia_filed_at          TIMESTAMPTZ,                  -- 72h covered cyber incident
  circia_ransom_filed_at   TIMESTAMPTZ,                  -- 24h ransom payment
  hipaa_filed_at           TIMESTAMPTZ,                  -- 60d ≥500 individuals
  evidence_root            TEXT        NOT NULL,         -- s3://forensics/<id>/
  runbook_path             TEXT        NOT NULL          -- .ctoc/operations/runbooks/<class>.md
);

-- Append-only: no UPDATE/DELETE.
CREATE RULE incident_log_no_update AS ON UPDATE TO incident_log DO INSTEAD NOTHING;
CREATE RULE incident_log_no_delete AS ON DELETE TO incident_log DO INSTEAD NOTHING;
-- Use a separate incident_state_event table to record phase transitions.

CREATE TABLE incident_state_event (
  incident_id   TEXT      NOT NULL REFERENCES incident_log(id),
  at            TIMESTAMPTZ NOT NULL,
  phase         TEXT      NOT NULL CHECK (phase IN (
                            'detected','triaged','contained','eradicated','recovered','closed')),
  actor_role    TEXT      NOT NULL,                     -- ROLE, not personal name
  note          TEXT,
  PRIMARY KEY (incident_id, at, phase)
);

-- SLA-breach query: SEV0 incidents that took > 1h to contain.
SELECT id, class, detected_at, contained_at,
       EXTRACT(EPOCH FROM (contained_at - detected_at))/60 AS containment_minutes
FROM incident_log
WHERE severity = 'SEV0'
  AND contained_at IS NOT NULL
  AND contained_at - detected_at > INTERVAL '1 hour';

-- ENISA 24h early-warning compliance query — un-filed incidents past the clock.
SELECT id, class, detected_at,
       EXTRACT(EPOCH FROM (NOW() - detected_at))/3600 AS hours_since_detection
FROM incident_log
WHERE enisa_early_warning_at IS NULL
  AND class IN ('data-breach','supply-chain','cred-theft','ai-prompt-injection')
  AND detected_at < NOW() - INTERVAL '24 hours';

-- SEC 8-K Item 1.05 — 4-business-day clock from materiality determination.
-- Naive variant (NOT business-day-aware) — replace with a holiday-aware
-- calendar in production; this catches obvious overruns.
SELECT id, class, materiality_decided_at,
       EXTRACT(EPOCH FROM (NOW() - materiality_decided_at))/86400 AS calendar_days_since_materiality
FROM incident_log
WHERE sec_8k_filed_at IS NULL
  AND materiality_decided_at IS NOT NULL
  AND materiality_decided_at < NOW() - INTERVAL '4 days';   -- approximation, see note

-- NIS2 24h early-warning compliance query (EU essential/important entities).
SELECT id, class, detected_at
FROM incident_log
WHERE nis2_early_warning_at IS NULL
  AND class IN ('data-breach','ransomware','dos-ddos','supply-chain','cred-theft')
  AND detected_at < NOW() - INTERVAL '24 hours';
```

### Why no C / C++ snippets

Incident-response control planes (alert handlers, webhook receivers, runbook orchestrators, postmortem tooling) are almost universally written in managed-runtime languages (Python, JS/TS, Java, C#, Go). C and C++ surface in IR only as forensic-collection tooling (memory acquisition, kernel-mode tracers), which is too specialized for a general skill. The seven-language budget is better spent on runbook YAML (foundational), SQL (incident store cross-link with audit-log), and the four common alert-handler languages above. If a CTOC project genuinely needs a C/C++ IR primitive, dispatch [[memory-safety-checker]] for the safe-handling rules.

## Methodology

### Phase 1: Inventory the IR layer

```bash
# Are runbooks present per class?
ls .ctoc/operations/runbooks/ 2>/dev/null | sort
# Required: data-breach.md ransomware.md dos-ddos.md supply-chain.md
#           cred-theft.md ai-prompt-injection.md insider-threat.md physical-access.md

# Is the communication tree present?
test -f .ctoc/operations/communication-tree.md && echo "tree-present" || echo "missing-tree"

# Is the postmortem template present?
test -f .ctoc/operations/templates/postmortem.md && echo "postmortem-template-present" || echo "missing-template"

# Is ENISA wiring present?
test -f .ctoc/operations/regulatory/enisa-initial-template.md && echo "enisa-template-present" || echo "missing-enisa-template"
```

### Phase 2: Validate each runbook

For each runbook found, parse YAML frontmatter and confirm:
- `severity_floor`, `sla.*`, `on_call.primary`, `phases.evidence_preservation` all non-empty.
- `last_exercised_at` within the past 12 months.
- `regulatory.enisa_srp_required` matches the project's EU-distribution status.

### Phase 3: Validate incident-store schema

Cross-reference the incident store (`incident_log` table or equivalent JSON store) for:
- Append-only enforcement (no UPDATE/DELETE permitted).
- Foreign-key linkage to the audit-log layer (see [[audit-log-checker]]).
- All SLA clock fields present (`detected_at` … `recovered_at`).
- `enisa_filed_at` / `gdpr_filed_at` columns present if EU/GDPR-scoped.

### Phase 4: Game-day exercise audit

Open `.ctoc/operations/exercises/` and confirm each runbook has been exercised in the past 12 months with a documented findings file. Older than 12 months → `runbook-not-exercised`.

## Tool Integration (2026 landscape)

| Tool | Strengths | Notes |
|---|---|---|
| **PagerDuty** | Mature on-call schedules, escalation policies, event-rules engine, broad integrations. | Industry default; weakest at multi-team incident orchestration. |
| **Opsgenie** | Atlassian-integrated, strong alerting. | **End of support: April 5, 2027.** No new purchases or trials since June 4, 2025. Atlassian consolidates alerting + on-call into Jira Service Management (JSM); migration tooling exists. If a runbook still cites an Opsgenie schedule id, the runbook must also carry a `migration_target` field naming JSM or a replacement (incident.io / FireHydrant / Rootly). Otherwise emit `tool-deprecated`. |
| **Jira Service Management (JSM)** | Atlassian's consolidated incident-management surface — receives Opsgenie alerting + on-call. | Default migration target for Opsgenie users; check feature parity per integration before cut-over. |
| **incident.io** | Slack-native incident channels, runbook automation, AI-assisted comms drafting, status-page integration. | Strong choice for Slack-heavy orgs. |
| **FireHydrant** | Service catalog + runbook automation, structured handoffs, retrospective automation. | Strong for organizations with deep service-graph needs. |
| **Rootly** | Slack-native, multi-step automated workflows, structured playbooks. | Common Opsgenie-migration target. |
| **Statuspage / Instatus / BetterStack** | Customer-facing status pages with subscription notifications. | One per product is mandatory. |
| **Sentry alerts** | Error-rate spikes, deploy regression alerts. | Feed into PagerDuty / Opsgenie, do not stand alone. |
| **Datadog Incident Management** | Metric-driven incident open/close, dashboards-as-runbooks. | Best when Datadog is already the SIEM. |
| **ENISA SRP** | Mandatory CRA filing surface from Sept 2026. | Requires a registered manufacturer account; rehearse the submission. |
| **AWS CloudTrail / GCP Audit Logs / Azure Activity Log** | Forensic evidence source. | Cross-link [[audit-log-checker]]. |
| **CISA Federal IR Playbooks** | Reference structure for federal-style runbooks. | [public PDF](https://www.cisa.gov/sites/default/files/2024-08/Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf) |

Aggregate alert sources (Sentry, Datadog, SIEM, EDR) into a single paging surface (PagerDuty / incident.io / Rootly). Multiple paging surfaces = guaranteed missed page.

## Severity (internal triage vs. refinement-loop output)

Incident response has its own well-known severity scale (SEV0/SEV1/SEV2/SEV3) used **inside runbooks** to declare SLAs and routing. That scale is orthogonal to the refinement-loop letter contract.

| Internal IR scale | Used for | Example |
|---|---|---|
| **SEV0** | Customer-impacting outage, active breach, regulatory clock running | Confirmed PII exfiltration |
| **SEV1** | Major degradation, suspected breach, high-blast-radius | Suspected token theft, no confirmed exfil |
| **SEV2** | Degraded service, contained vulnerability | Single-tenant data exposure caught at WAF |
| **SEV3** | Low-impact issue, informational | Suspicious login from new ASN, single account |

When this skill emits a finding to CTO Chief via the refinement loop, **every letter is `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The SEV0–SEV3 scale stays in the runbook body for SLA decisions; the wire field is always `critical`. A missing runbook today is a customer-visible breach tomorrow.

## Output Format

```markdown
## Incident-Response Readiness Report

### Summary
| Category | Findings | Required Action |
|---|---|---|
| Missing runbooks | 3 | Create before next release |
| Missing on-call rotation | 1 | Wire PagerDuty / incident.io / FireHydrant / Rootly this week |
| Tool deprecated (Opsgenie) | 1 | Plan migration to JSM before April 5, 2027 |
| Missing evidence preservation | 2 | Patch existing runbooks |
| Missing ENISA wiring | 1 | Required by 11 Sept 2026 (CRA Art. 14) |
| Missing SEC 8-K wiring | 1 | US-listed parent — 4 business days from materiality |
| Missing NIS2 wiring | 1 | EU essential entity — 24h / 72h / 1mo clocks |
| Missing regulatory matrix | 4 | Add explicit per-class clock list to each runbook |
| Postmortem template missing | 1 | Create from Google SRE template (role-labeled, blameless) |
| Runbooks not exercised | 4 | Schedule game days within 30 days |

### CRITICAL: Missing runbook — ransomware
**File**: .ctoc/operations/runbooks/ (missing ransomware.md)
**Incident class**: ransomware
**Why this matters**: A ransomware event without a runbook produces panic, premature payment, evidence destruction, and rejected insurance claims. The first 60 minutes determine the outcome.

**Fix**: Create `.ctoc/operations/runbooks/ransomware.md` conformant to the runbook skeleton. At minimum:
- Containment: isolate affected systems before any reboot (RAM holds keys).
- Evidence preservation: memory dump BEFORE shutdown.
- Eradication: never pay first — coordinate with FBI/IC3 / national LEA / Europol.
- Recovery: validate backup integrity BEFORE restore.
- Regulatory: ENISA SRP filing within 24h if EU-distributed product affected.

**Reference**: [CISA ransomware guide](https://www.cisa.gov/stopransomware), [NIST SP 800-61r3 §3](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
```

## Special Considerations

- **Tabletop exercises vs. game days**: tabletop is a conversation, game day involves real systems. Both are required. Tabletop quarterly; game day annually.
- **Multi-region orgs**: each region needs its own on-call with local-language comms; the IC role is still single-pinned globally.
- **Third-party IR retainer**: pre-negotiated, named contact, SLA in writing, included in the communication tree. Negotiating an IR retainer mid-incident is a documented anti-pattern.
- **Cyber-insurance alignment**: confirm runbook evidence-preservation steps match insurer requirements; many claims fail because the team destroyed evidence before notification.
- **Regulatory matrix per product**: GDPR Art. 33 (72h DPA), EU CRA Art. 14 via ENISA SRP (24h early warning / 72h detailed / 14d final-vuln / 1mo final-incident, mandatory from 11 Sept 2026), EU NIS2 (24h / 72h / 1mo for essential/important entities), SEC Item 1.05 8-K (4 business days from materiality, US-listed issuers under [Final Rule 33-11216](https://www.sec.gov/files/rules/final/2023/33-11216.pdf)), CIRCIA (72h covered cyber incident / 24h ransom payment, US covered critical-infrastructure entities — NPRM April 2024, final rule expected 2025–2026), state breach-notification laws, sectoral regulators (HIPAA / OCR for healthcare, GLBA for financial). Multi-regime tracking is normal — a single SEV0 incident at a US-listed EU operator commonly fires GDPR + ENISA + NIS2 + SEC clocks simultaneously.
- **Don't conflate alerting with incident management**: an alert is a signal; an incident is a coordinated response. Tools that only alert (Sentry, Datadog) feed tools that orchestrate (PagerDuty, incident.io, Rootly).
- **AI-prompt-injection is a new class, not a sub-class**: it has its own containment pattern (disable agent, freeze tools, audit tool-call log) and does not fit cleanly under cred-theft or supply-chain.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+kind+incident_class)[:12]>
severity: critical                                  # ALWAYS critical on the wire (warnings-are-bugs)
sev_internal: SEV0 | SEV1 | SEV2 | SEV3 | n/a       # the IR triage scale this gap concerns
                                                    # (e.g., a missing ransomware runbook is SEV0-floor;
                                                    # a missing dos-ddos runbook is typically SEV1)
confidence: high | medium | low
engine: manual | runbook-linter | yaml-validator
kind: missing-runbook | no-oncall | no-escalation | no-communication-tree |
      no-evidence-preservation | no-enisa-wiring | no-sec-8k-wiring |
      no-nis2-wiring | no-circia-wiring | missing-regulatory-matrix |
      no-postmortem-template | blameful-postmortem |
      runbook-not-exercised | audit-log-gap | no-status-page |
      no-dr-validation | missing-sla | tool-deprecated
incident_class: data-breach | ransomware | dos-ddos | supply-chain | cred-theft |
                ai-prompt-injection | insider-threat | physical-access | n/a
target_file: .ctoc/operations/runbooks/ransomware.md     # or directory if missing entirely
line: 0                                                  # 0 if whole-file / missing-file
csf_function: GV | ID | PR | DE | RS | RC                # NIST 800-61r3 / CSF 2.0 mapping
regulator_notification_deadline:                         # populated when kind touches a regime
  regime: gdpr | enisa-cra | nis2 | sec | circia | hipaa | state-ag | none
  hours: 72                                              # numeric deadline in hours
  business_days: null                                    # populate ONE of hours or business_days
  trigger: detection | materiality_determination | corrective_measure_available
message: "No runbook for incident class 'ransomware' — team will improvise at 03:00"
suggested_fix: "Create file conformant to the runbook skeleton in skills/security/incident-responder/SKILL.md"
reference: https://csrc.nist.gov/pubs/sp/800/61/r3/final
related_skills: [compliance/audit-log-checker, compliance/sbom-cra-checker,
                 compliance/gdpr-compliance-checker]
```

`csf_function` lets the integrator group findings by NIST function (Govern/Identify/Protect findings cluster as preparation gaps; Detect/Respond/Recover findings cluster as execution gaps). `incident_class: n/a` is valid for cross-cutting findings (e.g., no postmortem template applies to all classes). `regulator_notification_deadline.regime: none` is valid for purely operational findings (e.g., `no-oncall`, `missing-sla`) that don't trigger a specific regulatory clock.

**Severity reconciliation** — the wire field `severity` is always `critical` per warnings-are-bugs. The companion field `sev_internal` carries the IR triage scale so the integrator can prioritize between two `critical`-on-the-wire findings (a missing ransomware runbook outranks a missing dos-ddos runbook for fix order). The two are explicitly orthogonal: the wire severity controls phase-advancement gating; `sev_internal` controls intra-batch ordering.

---

## Refinement Loop — critic mode (v6.9.8+)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing IR artifact (runbook, rotation, tree, evidence step, postmortem, ENISA wiring, exercise record) emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- A missing runbook blocks phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section with a documented mitigation (e.g., "v1 of the product is not yet distributed in the EU; ENISA wiring deferred to v1.1, tracked in plan plans/todo/enisa-wiring.md").

The principle: an incident-response gap today is a regulator filing, an insurance claim rejection, and a customer-trust collapse tomorrow. Code that ships with no runbook ships with a known latent failure waiting for its trigger.
