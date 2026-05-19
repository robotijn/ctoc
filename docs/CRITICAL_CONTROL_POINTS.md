# Critical Control Points

> Hazard Analysis and Critical Control Point (HACCP) is the food-safety
> discipline that asks: *Of all the steps in the process, which ones, if
> they fail, allow an unsafe product to reach the customer?* Those steps
> are Critical Control Points. Every other step is important; CCPs are
> non-negotiable.
>
> CTOC applies the same logic to the sixteen-step Iron Loop. Six of the
> sixteen steps are designated CCPs. Failure at a non-CCP step degrades
> quality; failure at a CCP step lets a defect escape to production.

## Authoritative sources

- U.S. Food and Drug Administration, *Hazard Analysis Critical Control
  Point (HACCP)* principles —
  https://www.fda.gov/food/hazard-analysis-critical-control-point-haccp/haccp-principles-application-guidelines
- Scilife, *HACCP Glossary — Critical Control Point* —
  https://www.scilife.io/glossary/critical-control-point
- National Advisory Committee on Microbiological Criteria for Foods,
  *HACCP Principles and Application Guidelines* —
  https://www.fda.gov/food/hazard-analysis-critical-control-point-haccp/hazard-analysis-critical-control-point-principles-and-application-guidelines

## The seven HACCP principles, mapped to the Iron Loop

| HACCP principle | CTOC equivalent |
|---|---|
| 1. Conduct a hazard analysis | Failure Mode and Effects Analysis at Step 6 DESIGN (`fmeda_design`) |
| 2. Determine the Critical Control Points | This document — six CCP steps |
| 3. Establish critical limits | Per-CCP table below |
| 4. Establish monitoring procedures | Per-CCP table below |
| 5. Establish corrective actions | Per-CCP table below + CAPA register at `.ctoc/capa/` |
| 6. Establish verification procedures | Refinement loop + Step 14 VERIFY + Gate 3 review |
| 7. Establish record-keeping and documentation | `audit_hash_chain` control + `.ctoc/audit/dispatches/` |

## CCP map of the Iron Loop

```
Step:  1   2   3   4   [5]  [6]  [7]   8   9   [10]  11   12   [13]  [14]  15   16
Name:  ID  AS  AL  CA  PL   DE   SP   TE  PR  IM   RE   OP   SE    VE   DO   FR
       └─ business context ─┘└─ technical context ─┘└─ implementation ─┘└─ delivery ─┘
                            ↑    ↑    ↑          ↑          ↑    ↑
                           CCP  CCP  CCP        CCP        CCP  CCP
```

| CCP | Step | Name | Failure mode that escapes |
|---|---|---|---|
| 1 | 5 | PLAN | Wrong technical approach — entire plan builds on sand |
| 2 | 6 | DESIGN | Missing hazard analysis — defect classes never reach the test plan |
| 3 | 7 | SPEC | Specification ambiguity — multiple implementers will diverge |
| 4 | 10 | IMPLEMENT | Defect introduced into code — the actual artifact ships |
| 5 | 13 | SECURE | Vulnerability shipped — direct customer harm or regulatory breach |
| 6 | 14 | VERIFY | Failed gate passed as green — every downstream check trusts a false signal |

Steps 1, 2, 3, 4, 8, 9, 11, 12, 15, 16 are **important but not critical**.
A defect introduced at a non-CCP step is detectable downstream at a CCP.

---

## CCP 1 — Step 5: PLAN

**Why critical.** The PLAN step chooses the technical approach. Every
later step assumes the approach is sound. A wrong choice at Step 5 means
Steps 6-16 produce a high-quality implementation of the wrong thing.
The defect is invisible until Gate 3 (or worse, until production).

| Field | Entry |
|---|---|
| **Critical limit** | Approach must score ≥ 4 on all five dimensions of `src/lib/iron-loop.js` `critique()` (completeness, clarity, edgeCases, efficiency, security). At least two alternative approaches must be documented and rejected with reasons. |
| **Monitoring procedure** | Implementation-plan-reviewer (opus) scores the plan. Refinement loop runs against the PLAN section if `effort_level` is `high` or `xhigh` or any `files:` glob matches `.ctoc/config/refinement-triggers.yaml`. |
| **Corrective action when exceeded** | Kickback to Step 5. Author re-investigates alternatives, including stack-chooser if the project is template-based. Maximum three kickbacks before circuit-breaker escalates to user. |
| **Records kept** | `.ctoc/audit/dispatches/<date>/<dispatch_id>.yaml` for each implementation-planner dispatch. Plan file frontmatter `decisions_taken_under_ambiguity:`. |
| **Linked controls** | `process_fmea_loop`, `requirements_traceability_matrix`, `fmeda_design` |

---

## CCP 2 — Step 6: DESIGN

**Why critical.** DESIGN is where Failure Mode and Effects Analysis
happens. Defect classes not surfaced here will not have tests at Step 8
and will not be checked at Step 13 or Step 14. The cost of missing a
defect class at DESIGN compounds through every later step.

| Field | Entry |
|---|---|
| **Critical limit** | Every component must have an entry in the FMEA table with: failure mode, effect, severity (1-10), occurrence (1-10), detection (1-10), and Risk Priority Number = S × O × D. RPN > 100 requires explicit mitigation. RPN > 200 is a blocker until reduced. |
| **Monitoring procedure** | `fmeda_design` control auto-scans for missing FMEA entries at Gate 2. Process-FMEA-loop critic (when active) reviews the Iron Loop's own design products. |
| **Corrective action when exceeded** | Kickback to Step 6. Author adds the missing failure modes, computes RPNs, and lists mitigations. If RPN remains above 200 after mitigation, escalate to user. Open a CAPA recording the FMEA gap. |
| **Records kept** | FMEA table in the implementation plan body. Dispatch logs for fmeda-design agent. |
| **Linked controls** | `fmeda_design`, `fault_tree_analysis`, `graceful_degradation_matrix` |

---

## CCP 3 — Step 7: SPEC

**Why critical.** SPEC is the final translation of human intent into a
machine-readable plan. Ambiguity here means different implementer
instances will produce divergent code. The cost of catching an
ambiguity at Step 7 is one round of the refinement loop; the cost of
catching it at Step 14 is a full Iron Loop re-run.

| Field | Entry |
|---|---|
| **Critical limit** | Plan must survive ten rounds of the Integrator-plus-Critic refinement loop with all critic scores ≥ 4. No `# Decisions Taken Under Ambiguity` section may contain unresolved items at Gate 2. |
| **Monitoring procedure** | `src/lib/iron-loop.js` `refineLoop()` runs up to ten rounds. Journal at `.ctoc/loops/<plan-slug>/journal.yaml` records every round. Persistent-issue and oscillation detectors in `refinement-loop.js` flag stuck plans. |
| **Corrective action when exceeded** | If ten rounds fail to converge, the refinement loop emits a `deferredQuestions` letter. User is alerted at Gate 2 to resolve each question. If oscillation is detected, kickback to Step 6 — the design is itself ambiguous. |
| **Records kept** | `.ctoc/loops/<plan-slug>/journal.yaml`, `.ctoc/loops/<plan-slug>/letters/*.json`. |
| **Linked controls** | `requirements_traceability_matrix`, `spec_code_reconciliation`, `irac_compliance_output` |

---

## CCP 4 — Step 10: IMPLEMENT

**Why critical.** This is the only step that produces the actual
artifact that ships. Every other step is preparation or verification.
A defect introduced at IMPLEMENT is the defect customers see. The
no-stub rule (CLAUDE.md, Pipeline Philosophy 2) is enforced here.

| Field | Entry |
|---|---|
| **Critical limit** | Zero stubs, zero TODO markers, zero "this needs to be filled in" placeholders. Every ambiguity must be documented in the plan's `# Decisions Taken Under Ambiguity` section with a reasoned choice. Lines-of-code added must not exceed the plan's declared `files:` scope (no scope creep). |
| **Monitoring procedure** | PreToolUse hooks scan for stub markers (`TODO`, `FIXME`, `XXX`, empty function bodies returning `null` or `pass`). Self-reviewer at Step 11 flags any new stub. Refinement loop runs after IMPLEMENT for high-effort plans. |
| **Corrective action when exceeded** | Kickback to Step 10. Stubs are replaced with documented choices. If the implementer hits the same stub three times (implementer-wall detection in `refinement-loop.js`), kickback to Step 5 or 6 — the plan itself is incomplete. File a CAPA tagging the stub-inducing pattern. |
| **Records kept** | Git diff. Step 11 self-review record. Refinement loop journal entries with `fixes_applied`. |
| **Linked controls** | `data_lineage`, `defect_density_target`, `spec_code_reconciliation` |

---

## CCP 5 — Step 13: SECURE

**Why critical.** A security defect is not a quality defect — it is
direct customer harm. The shipping cost of a security defect is bounded
only by what an attacker can extract. CTOC treats every security finding
at this step as a blocker.

| Field | Entry |
|---|---|
| **Critical limit** | Zero `critical` or `high` findings from the security-scanner agent. Zero secrets detected by `src/lib/secrets-scanner.js`. Zero unhandled error paths in input validation. Static Application Security Testing exit code must be zero. CVE database scan against current dependencies returns zero `critical` or `high` vulnerabilities. |
| **Monitoring procedure** | Step 13 agent (opus) runs `src/lib/sast-runner.js`, `src/lib/secrets-scanner.js`, and `src/lib/dependency-auditor.js`. Refinement loop adds `security/sast-scanner` as a core critic. |
| **Corrective action when exceeded** | Kickback to Step 10 with the security findings. If the finding is architectural (e.g. the chosen auth mechanism is fundamentally weak), kickback to Step 5 PLAN. Open a CAPA. If severity is `critical`, also open a full 8D report at `.ctoc/templates/8d-incident.md`. |
| **Records kept** | `.ctoc/security/` scan output. Refinement loop journal entries from security critics. |
| **Linked controls** | All security-relevant controls; especially `cra_incident_clocks` if the defect was reported externally. |

---

## CCP 6 — Step 14: VERIFY

**Why critical.** VERIFY is the gate that every downstream step trusts.
If VERIFY passes a defective artifact, every subsequent reviewer assumes
the verification was honest. The cost of a false-green at Step 14 is the
loss of trust in the entire pipeline.

| Field | Entry |
|---|---|
| **Critical limit** | Lint exit code zero. Type check exit code zero. All tests pass — zero failures, zero skipped without a documented reason in plan metadata, zero flaky (defined as: failed on retry in CI in the trailing thirty runs). Coverage ≥ 80 percent on lines added by the current plan. |
| **Monitoring procedure** | `src/lib/step-13-verify.js`, `src/lib/test-runner.js`, `src/lib/coverage-checker.js`. Test results are recorded in the dispatch audit log. Flaky-test detection runs against the trailing thirty runs in CI. |
| **Corrective action when exceeded** | Kickback to the step that owns the failure. Failed test → Step 10 (or Step 8 if the test itself is wrong). Coverage gap → Step 8 with explicit edge-case list. Type error → Step 10. Lint warning treated as a critical-tier finding per CTOC's warnings-are-bugs policy. Open a CAPA if the same test fails on three or more consecutive plans (a flaky test is a process defect). |
| **Records kept** | Test run output in `.ctoc/audit/dispatches/<date>/`. Coverage reports. |
| **Linked controls** | `defects_per_million`, `process_capability_index`, `control_chart_variance` |

---

## Verification of the CCP system itself

> Principle 6 of HACCP requires that the CCP system be periodically
> verified. A CCP that nobody monitors is decorative.

Monthly verification:

- Review the Andon halt log (`.ctoc/logs/andon-halts.json`). A CCP that
  has never triggered a halt is suspicious — either the threshold is
  too loose or monitoring is broken.
- Review the CAPA register for the trailing thirty days. Group CAPAs
  by which CCP failed to catch them. A pattern of CAPAs pointing at
  the same CCP means that CCP needs tightening.
- Review the control chart at `src/lib/metrics-loop.js` `controlChart()`.
  Special-cause variance points to a CCP that no longer holds its limit.

Quarterly verification:

- Re-derive the CCP designations from first principles using the current
  failure-mode list in the FMEA. If a new failure mode emerges that
  bypasses all six CCPs, add a seventh.
- Compare CTOC's CCPs against the latest FDA HACCP principles and the
  current Scilife HACCP glossary. Update the table above when guidance
  changes.

## When to add or remove a CCP

Add a CCP only when:

1. A failure at the candidate step has been observed to escape Gate 3
   on two or more plans.
2. The failure could not have been caught at any existing CCP without
   redundant work.
3. The candidate step has a measurable critical limit, a defined
   monitoring procedure, and a deterministic corrective action.

Remove a CCP only when:

1. The failure mode it guards against has been eliminated by a process
   change (e.g. a new agent, a new test, a new template).
2. Removal has been reviewed at a horizons-review and recorded in the
   CAPA register with effectiveness verification.

The six CCPs above are the current designation as of CTOC v6.4.x.
Changes to this list require an entry in the CAPA register and an update
to `src/lib/regulatory-regime.js` if the change affects the
`critical_control_points` control.
