---
description: Bundle dispatch logs, gate approvals, test runs, threat models, model-risk attestations, and provenance events into a tamper-evident evidence pack for continuous controls monitoring.
---

# /ctoc:evidence-pack — Continuous Controls Monitoring evidence bundle

Sarbanes-Oxley Section 404 expects evidence to be collected continuously, not at annual audit time. The Digital Operational Resilience Act, Payment Card Industry Data Security Standard, and ISO 9001 all assume evidence is available on demand.

This command bundles a tamper-evident archive of everything an auditor would ask for, on a nightly or on-demand cadence.

## Activation

Active when the `continuous_controls_monitoring` control is on (Sarbanes-Oxley, Digital Operational Resilience Act, Payment Card Industry Data Security Standard, New York Department of Financial Services 500, ISO 9001 profiles).

## What gets bundled

For the requested time window (default: the past 24 hours):

1. **Dispatch audit log** — every entry in `.ctoc/audit/dispatches/<date>/` plus the corresponding `chain.jsonl` slice.
2. **Gate approvals** — every plan whose status crossed a gate, with the `approved_by` markers (and the `approved_by_independent` four-eyes marker when active).
3. **Test runs** — the `node --test` output captured for each Step 14 VERIFY pass.
4. **Threat models** — `threat-modeler` outputs from Step 6.5.
5. **Model-risk attestations** — `.ctoc/model-risk/*.yaml` snapshots.
6. **Provenance events** — `.ctoc/ai-provenance.jsonl` slice.
7. **Configuration baselines** — `.ctoc/baselines/<version>/manifest.yaml`.
8. **Corrective and Preventive Action register** — `.ctoc/capa/*.yaml` entries created or closed in the window.

## Output

`.ctoc/evidence-packs/<YYYY-MM-DD>.tar.gz` (or `.zip` on Windows) plus a sidecar `<YYYY-MM-DD>.manifest.yaml` declaring:

- The window covered
- Secure Hash Algorithm 256 of every file in the pack
- The chain-head hash at pack-creation time (links the pack into the audit chain)
- Active regulatory profiles at the time of packing
- The packing user's identity

## How to invoke

```bash
node src/scripts/evidence-pack.js [--since=2026-05-18] [--until=2026-05-19]
```

Or via the slash command `/ctoc:evidence-pack`.

## What this is NOT

This command does not delete the source artifacts. It produces a bundle copy. Source artifacts remain under the retention schedule defined in `src/lib/regulatory-regime.js` and the per-profile YAML.

## References

- [Sarbanes-Oxley Section 404 IT General Controls automation 2026 — Screenata](https://screenata.com/resources/blog/best-practices-for-automating-sox-itgc-evidence-in-2026-from-access-controls-to-continuous-monitoring)
- [Digital Operational Resilience Act Article 11 — operational resilience](https://www.digital-operational-resilience-act.com/DORA_Articles.html)
