---
name: cra-incident-clocks
description: European Union Cyber Resilience Act (CRA) Article 14 incident clocks — 24 hour early warning, 72 hour notification, 14 day final report for actively exploited vulnerabilities in products with digital elements. Maps to the European Union Agency for Cybersecurity (ENISA) single reporting platform fields. Output is incident JSON conformant to CRA Article 14.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "cra_incident_clocks control active"
  - "Cyber Resilience Act incident"
  - "CRA Article 14"
  - "ENISA single reporting platform"
  - "24 hour early warning"
  - "72 hour notification"
  - "14 day final report"
  - "actively exploited vulnerability"
  - "product with digital elements"
  - "CRA conformity assessment"
  - "manufacturer notification obligation"
related_skills:
  - security/incident-responder
  - compliance/sbom-cra-checker
  - compliance/audit-log-checker
  - security/cve-monitor
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Write, Grep
model: opus
---

# Cyber Resilience Act (CRA) Incident Clocks

> Cluster 7 control. The CRA Article 14 reporting obligation runs on three statutory clocks for **actively exploited** vulnerabilities and severe security incidents affecting the security of products with digital elements. This skill operationalizes the clocks, the reporting fields, and the European Union Agency for Cybersecurity (ENISA) single reporting platform conformance.

## When to load

Load when any of these is true:

1. The `cra_incident_clocks` control is activated in the active regulatory regime profile. The Cyber Resilience Act and Digital Operational Resilience Act profiles both enable it.
2. The user prompt mentions any clock or term from the `when_to_load` list.
3. A vulnerability scanner or threat-intelligence feed surfaces evidence of active exploitation in a product the organization manufactures, imports, or distributes in the European Union market.

## Role

You are the European Union Cyber Resilience Act incident-notification owner. You assume the regulator measures wall-clock time from the moment of *awareness*, that "we were still investigating" is not a defence, and that under-reporting carries up to 2.5% of worldwide annual turnover in fines under Article 64. Your job is to ensure the three CRA Article 14 deliverables — early warning, notification, final report — leave the building inside the statutory window with every required field populated, signed, and recoverable from the audit log.

## Scope — what triggers Article 14

Article 14 obligations apply to a **manufacturer** of a **product with digital elements** placed on the European Union market when either of these is observed:

1. An **actively exploited vulnerability** contained in the product. "Actively exploited" means there is reliable evidence that a malicious actor has successfully executed code or compromised confidentiality, integrity, or availability of a system without authorization. A vulnerability for which a proof of concept exists but no in-the-wild exploitation is documented is **not** actively exploited.
2. A **severe incident** having an impact on the security of the product. "Severe" means the incident causes or is capable of causing substantial operational disruption, financial loss, or harm to natural persons.

The clocks below apply to both triggers. The Regulation is binding from **11 September 2026** for the reporting obligations (other obligations such as conformity assessment apply from **11 December 2027**).

## The three clocks

The clock starts at the moment the manufacturer **becomes aware** of the trigger. Awareness is when a person who can take action within the organization knows, not when a log line was generated.

| Clock | Article | Window from awareness | Audience | What must be delivered |
|---|---|---|---|---|
| Early warning | 14(2)(a) | 24 hours | European Union Agency for Cybersecurity (ENISA) single reporting platform + the Computer Security Incident Response Team (CSIRT) designated as coordinator by the Member State | Indication of the suspected unlawful or malicious nature; whether cross-border impact is suspected |
| Notification | 14(2)(b) | 72 hours | Same | Update to the early warning with: general information about the nature of the vulnerability or incident, severity assessment, indicators of compromise, where available |
| Final report | 14(2)(c) | 14 days from when a corrective or mitigating measure is available | Same | Detailed description, severity and impact, root cause, applied or ongoing corrective measures |

Additional intermediate obligation: an **incident-handling report** at one month covering progress if the final corrective measure is not yet available.

Source: [European Union Cyber Resilience Act 2026 milestones — Hogan Lovells](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026) and the Regulation text itself at the European Commission's [Cyber Resilience Act page](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act).

## ENISA single reporting platform fields

The single-reporting-platform schema (Regulation (EU) 2024/2847 Article 16(1) implementing acts) requires these fields. Populate every field; for any field genuinely unknown at the time of report, write `unknown` plus a justification. Do **not** write `null` for required fields.

```json
{
  "report_metadata": {
    "report_id": "cra-2026-05-19-0001",
    "report_kind": "early_warning",
    "submitted_at": "2026-05-19T14:23:00Z",
    "submitter": {
      "manufacturer_name": "YourApp Inc.",
      "manufacturer_country": "Ireland",
      "contact_name": "Jane Doe",
      "contact_role": "Chief Information Security Officer",
      "contact_email": "ciso@yourapp.com",
      "contact_phone": "+353-1-555-0100"
    },
    "single_point_of_contact": "ciso@yourapp.com",
    "platform_used": "ENISA single reporting platform",
    "language": "en"
  },
  "product": {
    "name": "YourApp Mobile",
    "version_affected": ["3.2.0", "3.2.1", "3.2.2"],
    "sku_or_id": "yourapp-mobile-3.2",
    "ce_marking_year": 2027,
    "sbom_uri": ".ctoc/sbom/yourapp-mobile-3.2.cdx.json"
  },
  "incident": {
    "trigger_type": "actively_exploited_vulnerability",
    "cve_id": "CVE-2026-XXXXX",
    "first_awareness_at": "2026-05-19T13:18:00Z",
    "evidence_of_exploitation": "Honeypot capture sha256:... from 2026-05-19T08:00Z; vendor X telemetry confirmation 2026-05-19T11:42Z",
    "suspected_threat_actor": "unknown",
    "cross_border_impact_suspected": true,
    "affected_member_states_estimate": "all 27"
  },
  "severity": {
    "cvss_v4_score": 9.3,
    "cvss_v4_vector": "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H",
    "data_categories_at_risk": ["authentication_credentials", "personal_data"],
    "operational_disruption": "remote_code_execution",
    "financial_loss_estimate": "unknown — investigation in progress"
  },
  "indicators_of_compromise": {
    "network": ["198.51.100.42", "203.0.113.17"],
    "file_hashes": ["sha256:..."],
    "process_names": ["..."]
  },
  "mitigation": {
    "available": false,
    "status": "patch under development",
    "workaround": "block egress to indicators_of_compromise.network; disable feature flag yourapp.experimental_sync",
    "ETA_patch_release": "2026-05-22"
  },
  "downstream_notifications": {
    "competent_csirt_member_state": "Computer Security Incident Response Team Ireland (CSIRT-IE)",
    "users_notified_at": null,
    "users_notification_channel": "in-app banner + email; pending mitigation release"
  }
}
```

## Workflow

The workflow runs strictly in calendar time. Do not let the 72 hour clock slip because the 24 hour report is "still being polished" — file the 24 hour with `unknown` fields and amend at 72 hours.

```
T0 = awareness (recorded to the audit log immediately)
T0 + 24h    → submit early_warning  (kind = "early_warning")
T0 + 72h    → submit notification    (kind = "notification", references early_warning)
when patch ships, then + 14d → submit final_report (kind = "final_report")
T0 + 30d    → if no patch yet, submit incident_handling_report
```

The audit hash chain (see [[compliance/audit-log-checker]]) must include an entry for each of the four submissions with the SHA-256 of the canonical JSON. Refusing to file because "we are not sure yet" is **not an option** under Article 14 — the early warning is exactly the regulator's mechanism for being told you are not sure yet.

## Files written

- `.ctoc/incidents/cra/<incident-id>/early-warning.json`
- `.ctoc/incidents/cra/<incident-id>/notification.json`
- `.ctoc/incidents/cra/<incident-id>/final-report.json`
- `.ctoc/incidents/cra/<incident-id>/handling-report.json` (only if T0 + 30 days reached without final-report)
- `.ctoc/incidents/cra/<incident-id>/timeline.yaml` — wall-clock events, every state transition, signed.

## Common failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| Early warning filed at T0 + 30 hours | Awareness recorded only when the incident commander was paged, not when the SIEM rule fired | Awareness = first human notification. Page out-of-hours on-call, not the day team. |
| Notification at T0 + 72h contradicts early warning | Investigation reversed the suspected nature without amending the earlier report | Each report kind supersedes the earlier — explicit `supersedes:` link required. |
| Final report omits root cause | "Root cause analysis still ongoing" | If the corrective measure is available and applied, the root cause analysis must be in the final report. Article 14 does not permit a "pending RCA" final report. |
| Different product versions affected — only listed the latest | Defect was actually introduced in an earlier version | Article 14 requires *every* version on the European Union market; consult the Software Bill of Materials and version manifest. |

## Coordination with other skills

- [[security/incident-responder]] owns the **broader command structure** (runbooks, on-call, war room, general communications). This skill provides the **CRA-specific clock** and **ENISA field set**; the incident commander invokes both.
- [[compliance/sbom-cra-checker]] verifies the Software Bill of Materials referenced in the `product.sbom_uri` field exists and matches the affected versions.
- [[compliance/audit-log-checker]] verifies the hash-chain entries for the four submissions are append-only.

## Citation

[Hogan Lovells — EU Cyber Resilience Act: getting ready for CRA compliance in 2026](https://www.hoganlovells.com/en/publications/eu-cyber-resilience-act-getting-ready-for-cra-compliance-in-2026). The three clocks (24 hour, 72 hour, 14 day) come from Regulation (EU) 2024/2847 Article 14 directly; the manufacturer-obligation scope from Articles 13 and 14; the single-reporting-platform requirement from Article 16. Final binding text published in the Official Journal of the European Union on 20 November 2024.
