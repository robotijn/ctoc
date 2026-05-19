# Corrective and Preventive Action (CAPA) Register

> Manufacturing-grade nonconformity tracking applied to the Iron Loop. Every
> kickback at Gate 3, every post-shipping defect, every refinement-loop
> escalation produces a CAPA entry. The register is the closed-loop receipt
> that turns a one-off failure into a system-level improvement.

## What a CAPA is

A Corrective and Preventive Action entry is the audit trail for one defect:

- **Corrective Action** addresses the specific defect that escaped. It is the
  fix to the symptom.
- **Preventive Action** addresses the root cause so the *class* of defect
  cannot recur. It is the change to the process, the gate, the checklist,
  the agent prompt, or the test suite that closes the hole.

ISO 9001:2015 Clause 10.2 requires every nonconformity to be acted on,
the root cause determined, and the effectiveness of the action verified.

## Authoritative sources

- isoTracker, *CAPA Requirements in ISO 9001:2015* —
  https://www.isotracker.com/blog/capa-requirements-in-iso-90012015/
- ComplianceQuest, *CAPA Requirements in ISO 9001* —
  https://www.compliancequest.com/bloglet/capa-iso-9001/
- American Society for Quality, *Root Cause Analysis* —
  https://asq.org/quality-resources/root-cause-analysis

## When to file a CAPA

Open a new entry under `.ctoc/capa/<id>.yaml` whenever any of these occur:

| Trigger | Where the trigger surfaces |
|---|---|
| Plan kicked back at Gate 3 (review → done) | `.ctoc/logs/gate-violations.json` |
| Refinement loop hits implementer-wall (`detectImplementerWall`) | `src/lib/refinement-loop.js` |
| Post-ship incident (production defect after Gate 3) | `.ctoc/incidents/<id>.yaml` |
| Andon halt fires (quality metric breaches threshold) | `src/hooks/andon-halt.js` |
| Self-reviewer (Step 11) finds a regression-class defect | `agents/iron-loop/self-reviewer.md` |

## Schema

One file per CAPA, named `.ctoc/capa/<id>.yaml`, where `<id>` is a Crockford
Base32 ULID (the same identifier scheme refinement-loop letters use).

Use `_template.yaml` in this directory as the starting point.

Required fields:

```yaml
id: 01JABCDEF0123456789KLMNPQRS    # ULID
plan_id: implementation-auth-refactor   # slug from plans/<stage>/<slug>.md
defect_description: "Webhook signature verification accepted requests with empty body."
discovered_at: 2026-05-19T14:22:00Z
discovered_via: gate-3-review     # gate-3-review | incident | refinement-loop | andon | step-11
five_why:
  - "Why did the bug ship?  Because Step 14 VERIFY passed with no test for empty bodies."
  - "Why no test?  Because the test plan at Step 8 only listed signed-payload cases."
  - "Why?  Because the threat model at Step 6 DESIGN did not include malformed inputs."
  - "Why?  Because the implementation-planner template has no malformed-input checklist."
  - "Why?  Because no preventive action from a prior CAPA fed back into the template."
root_cause: "Implementation-planner template lacks a malformed-input adversarial checklist."
corrective_action: "Add empty-body test, regression test, ship patch v6.4.3."
preventive_action: "Update agents/planning/implementation-planner.md with malformed-input checklist; add a refinement-loop critic that flags missing malformed-input cases at Step 8."
verification_date: 2026-05-26
effectiveness_check: "Run 30 plans through the loop; confirm no malformed-input defects escape Gate 3. Track in escape-rate control chart."
effective: null            # null until verified; true when effectiveness_check passes; false on relapse
closed_at: null            # ISO 8601 timestamp when effective=true
```

## Lifecycle

```
open  ─►  corrective_action_applied  ─►  preventive_action_applied
                                              │
                                              ▼
                                       effectiveness_check
                                              │
                                ┌─────────────┴─────────────┐
                                ▼                           ▼
                            effective: true            effective: false
                              closed_at set            relapse → reopen
```

A CAPA is **only closed when the preventive action survives effectiveness
verification.** Closing a CAPA without verification defeats the entire
purpose; the gate rejects such closures.

## Aggregation

The metrics library at `src/lib/metrics-loop.js` reads this directory to
compute:

- `defectsPerMillion` — Defects Per Million Opportunities over the trailing
  window.
- `escapeRate` — fraction of completed plans that produced a CAPA within
  thirty days of Gate 3 approval.

The Andon hook at `src/hooks/andon-halt.js` halts the pipeline when these
metrics breach the thresholds at `.ctoc/config/andon-thresholds.yaml`.

## Relationship to the Eight Disciplines (8D)

For severity above `medium`, fill in the full Ford Global 8D Problem
Solving report at `.ctoc/templates/8d-incident.md` and link it from this
CAPA's `eight_d_report` field. The CAPA is the lightweight register entry;
the 8D report is the detailed root-cause analysis.

## Manual review

Every CAPA is reviewed at the next weekly review (`/weekly-review` skill in
the parent harness, or `docs/CONTINUOUS_IMPROVEMENT.md` for the in-project
equivalent). The reviewer asks: *Did the preventive action actually
prevent recurrence?* If not, the CAPA is reopened with a new five-why
chain that starts from "why didn't the previous preventive action work?"
