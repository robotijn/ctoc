# Continuous Improvement in the Iron Loop

> CTOC borrows its quality discipline from manufacturing — not by analogy
> but by direct application. Software defects are the same kind of object
> that physical defects are: an output of a process that deviates from
> specification. The disciplines that brought automotive defect rates
> from thousands per million in 1970 to single digits per million in 2020
> apply directly.

This document is the umbrella that links the manufacturing primitives
CTOC ships in Cluster 5 of the regulatory-regime profile system:

| Manufacturing primitive | CTOC equivalent | File / control |
|---|---|---|
| Plan-Do-Check-Act (PDCA) cycle | Iron Loop's 16 steps + Gate 3 review | `docs/IRON_LOOP.md` |
| Corrective and Preventive Action | CAPA register | `.ctoc/capa/` (`capa_register` control) |
| Eight Disciplines (8D) | Incident response report | `.ctoc/templates/8d-incident.md` (`eight_d_incident_template` control) |
| Statistical Process Control chart | Shewhart 3-sigma over loop metrics | `src/lib/metrics-loop.js` `controlChart()` (`control_chart_variance` control) |
| Defects Per Million Opportunities | DPMO across assertion-bearing tests | `src/lib/metrics-loop.js` `defectsPerMillion()` (`defects_per_million` control) |
| Process Capability Index (Cpk) | Cpk of refinement-loop convergence | `src/lib/metrics-loop.js` `processCapabilityIndex()` (`process_capability_index` control) |
| Defect density (defects per KLOC) | Defects per thousand lines per plan | `src/lib/metrics-loop.js` `defectDensity()` (`defect_density_target` control) |
| Andon cord | Pre-tool-use halt on threshold breach | `src/hooks/andon-halt.js` (`andon_cord_halt` control) |
| Critical Control Points (HACCP) | Six designated Iron Loop steps | `docs/CRITICAL_CONTROL_POINTS.md` (`critical_control_points` control) |
| Kaizen — continuous small improvement | Throttled loop-improvement backlog | `plans/loop-improvement/` (`kaizen_backlog` control) |
| Lessons learned at job close | Mandatory one-line lesson at Gate 3 | `lessons_learned_closure` control |
| Graceful degradation | Fail-operational / fail-safe / fail-silent matrix | `graceful_degradation_matrix` control |

## Authoritative sources

The Cluster 5 design is grounded in the following sources, each of which
is current as of 2026:

- isoTracker, *Corrective and Preventive Action Requirements in ISO 9001:2015* —
  https://www.isotracker.com/blog/capa-requirements-in-iso-90012015/
- ComplianceQuest, *CAPA Requirements in ISO 9001* —
  https://www.compliancequest.com/bloglet/capa-iso-9001/
- American Society for Quality, *Eight Disciplines (8D) Process* —
  https://asq.org/quality-resources/eight-disciplines-8d
- Kepner-Tregoe, *Problem Solving and Decision Making* —
  https://kepner-tregoe.com/blogs/problem-solving-and-decision-making/
- U.S. Food and Drug Administration, *HACCP Principles and Application
  Guidelines* —
  https://www.fda.gov/food/hazard-analysis-critical-control-point-haccp/hazard-analysis-critical-control-point-principles-and-application-guidelines
- Scilife, *HACCP Glossary — Critical Control Point* —
  https://www.scilife.io/glossary/critical-control-point
- Capers Jones, *Software Quality in 2020: Overview of Best and Worst
  Practices* —
  https://www.namcook.com/articles/Software%20Quality%20in%202020.pdf
- Montgomery, *Introduction to Statistical Quality Control*, 7th edition,
  Wiley, 2013 — Cpk thresholds and Shewhart construction.
- Google Testing Blog, *Flaky Tests at Google and How We Mitigate Them*,
  2016 —
  https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- Lean Enterprise Institute, *Andon* lexicon entry —
  https://www.lean.org/lexicon-terms/andon/
- IEEE Standard 982.1-2005, *Standard Dictionary of Measures of the
  Software Aspects of Dependability* — defect-density definition.
- Wikipedia, *Defects per Million Opportunities* —
  https://en.wikipedia.org/wiki/Defects_per_million_opportunities
- Wikipedia, *Process Capability Index* —
  https://en.wikipedia.org/wiki/Process_capability_index
- Wikipedia, *Shewhart Individuals Control Chart* —
  https://en.wikipedia.org/wiki/Shewhart_individuals_control_chart
- DevOps Research and Assessment 2025 *State of DevOps Report* — kaizen
  throughput-cap practice for continuous improvement work.

---

## The PDCA cycle inside the Iron Loop

Plan-Do-Check-Act is the central improvement loop in ISO 9001:2015.
CTOC's Iron Loop *is* a PDCA cycle:

```
Plan  ──► Steps 1-7   (IDEATE through SPEC: requirements, design, refinement)
Do    ──► Steps 8-10  (TEST, PREPARE, IMPLEMENT)
Check ──► Steps 11-14 (REVIEW, OPTIMIZE, SECURE, VERIFY)
Act   ──► Steps 15-16 (DOCUMENT, FINAL-REVIEW + Gate 3 human approval)
```

Each pass through the Iron Loop is one PDCA cycle. The *Act* phase
includes lessons learned (`lessons_learned_closure` control) that feed
back into the next cycle's *Plan* — closing the loop.

When PDCA is incomplete — when a defect escapes Gate 3 — the system
opens a CAPA register entry. The CAPA is itself a sub-PDCA: plan a
fix, do the fix, check that the fix works (effectiveness check),
act by updating the system. This is PDCA all the way down.

---

## When does the CAPA loop fire?

A CAPA fires whenever any of these signals appears. Each signal is
machine-detectable and produces an entry under `.ctoc/capa/<id>.yaml`:

| Signal | Source |
|---|---|
| Plan kicked back at Gate 3 | `.ctoc/logs/gate-violations.json` |
| Refinement-loop implementer-wall (same fingerprint persists ≥ 3 rounds with distinct fix attempts) | `src/lib/refinement-loop.js` `detectImplementerWall()` |
| Refinement-loop oscillation (fingerprint reappears after disappearing) | `src/lib/refinement-loop.js` `detectOscillation()` |
| Andon halt fires | `src/hooks/andon-halt.js` and `.ctoc/logs/andon-halts.json` |
| Post-ship incident filed | `.ctoc/incidents/<id>.yaml` |
| Critical-tier finding from the self-reviewer at Step 11 | `agents/iron-loop/self-reviewer.md` |
| Customer-reported defect | external — file manually via `_template.yaml` |

The kickback follow-up is the discipline. A kickback without a CAPA is
forgotten by the next sprint; a kickback with a CAPA forces the system
to learn.

---

## When does 8D fire?

8D is heavier than CAPA. CAPA is the lightweight register every defect
gets; 8D is the structured root-cause analysis reserved for defects that
*cannot be allowed to recur*.

| Severity in CAPA | Required artifact |
|---|---|
| `low` | CAPA only |
| `medium` | CAPA only |
| `high` | CAPA + full 8D report at `.ctoc/templates/8d-incident.md` |
| `critical` | CAPA + full 8D + incident escalation per active regulatory regime (e.g. EU CRA 24h/72h clocks if `cra_incident_clocks` is active) |

The eight disciplines map directly onto the structured response a CTO
takes after a production outage: contain immediately (D3), find root
cause (D4), permanently fix (D5/D6), prevent recurrence (D7), close
with lessons (D8).

---

## Statistical Process Control over the Iron Loop

A control chart is the difference between "we feel the pipeline is
getting slower" and "the pipeline mean rounds-per-plan rose above the
upper control limit on plan #47." The metrics library at
`src/lib/metrics-loop.js` provides three primitives:

### Defects Per Million Opportunities (DPMO)

```
DPMO = (defects / (units × opportunities_per_unit)) × 1,000,000
```

In CTOC, *one opportunity = one assertion-bearing test*. The library
counts opportunities by reading the test-runner dispatch records;
defects are CAPA entries of severity `medium` or higher.

DPMO is the headline metric for benchmarking against industry. Six
Sigma's "world-class" threshold is 3.4 DPMO; "average industry"
practice in 2020 sits near 6,210 DPMO (per Capers Jones). The metric
is unitless across project sizes, so it composes across teams.

### Process Capability Index (Cpk)

```
Cpk = min( (USL - mean) / (3σ), (mean - LSL) / (3σ) )
```

Where USL and LSL are the upper and lower specification limits. CTOC
applies Cpk to the refinement-loop's convergence behavior: USL is the
K-budget per phase (default 12 rounds across all four phases), LSL is
zero. Cpk ≥ 1.0 means the process is operating inside its 3-sigma
envelope; Cpk < 1.0 fires the Andon halt.

Cpk is the test of *process stability*. A high Cpk means the loop is
predictable. A low Cpk means even when the average looks fine, the
worst plans take far too long — a signal that some plans hit failure
modes the loop is not designed for.

### Shewhart 3-sigma control chart

```
UCL = mean + 3σ      LCL = max(0, mean - 3σ)
```

The library exposes `controlChart(projectRoot, metric, window)` for
metrics `rounds`, `tokens`, and `test-failures`. Points outside the
control limits are *special-cause* variance — a one-off event the
process did not absorb. Points inside are *common-cause* variance —
the natural noise of a stable process.

The Shewhart rule: **act on special causes, not common causes.** If
plan #47 took 28 refinement rounds and the upper control limit is 18,
investigate plan #47 specifically. Do not change the process based on
the noise of individual common-cause variations; that is over-tuning
and degrades the process.

---

## Andon — the halt

In a Toyota Production System line, any worker pulls the Andon cord
when they detect a defect. The line stops. It does not restart until
the defect is understood and corrected.

CTOC's `src/hooks/andon-halt.js` is a pre-tool-use hook that pulls the
cord automatically when any quality metric breaches the threshold in
`.ctoc/config/andon-thresholds.yaml`. Until a CAPA closes the loop, no
further dispatches run.

The halt has a manual override at `.ctoc/andon-override.yaml`, but the
override requires a written reason, a signature, and an expiry — and
every use is logged to `.ctoc/logs/andon-overrides.json` for audit. A
project that overrides every halt is a project that has stopped
listening to its own quality signals; the override log makes that
visible.

The Andon control is **off by default**. It activates only when an
ISO 9001, ISO 26262, or DORA-class regulatory regime profile is active
(or the user explicitly enables `andon_cord_halt` in
`.ctoc/settings.yaml`). CTOC stays lean for projects that do not need
this discipline.

---

## Kaizen — small improvements, throughput-capped

Kaizen is the discipline of continuous *small* improvement to the
process itself, distinct from product-feature work. In manufacturing,
kaizen events are budgeted at roughly one-tenth of total operating
effort — enough to drive measurable improvement, not so much that they
crowd out actual production.

CTOC's `plans/loop-improvement/` stage is the kaizen backlog. Per the
DevOps Research and Assessment 2025 *State of DevOps Report*, healthy
teams cap continuous-improvement work at 10 percent of total plan
throughput. The `kaizen_backlog` control enforces this cap; the
`src/lib/quality-state.js` would refuse to advance an 11th loop-
improvement plan while ten regular plans were still in flight.

A kaizen plan is a normal Iron Loop plan whose target is the loop
itself: a new critic, a tighter threshold, a clarified agent prompt, a
new template field. Kaizen plans go through the full Iron Loop — they
are not exempt. The system improves only when its improvements are
themselves quality-controlled.

---

## Lessons learned at closure

The `lessons_learned_closure` control mandates a single-line lesson at
Gate 3 for every plan, written to the plan's frontmatter as
`lesson_learned:`. The lesson is one sentence in present tense,
identifying what the next plan should do differently.

```yaml
lesson_learned: "Always include a malformed-input test case at Step 8 when the plan touches webhooks."
```

The aggregator at `.ctoc/learnings/approved/` collects these and feeds
the next round of agent-prompt and template updates — closing the loop
between plan-level work and system-level improvement.

A plan with `lesson_learned: "None"` is allowed but should be rare. If
more than one plan in three carries a "None" lesson, the team has
stopped reflecting; that itself is a CAPA trigger.

---

## Graceful degradation — fail modes are design decisions

The `graceful_degradation_matrix` control requires every component to
declare its failure mode in the implementation plan's design section:

| Failure mode | Meaning | Example |
|---|---|---|
| fail-operational | System continues to provide full service through a redundant path | dual-path authentication with fallback identity provider |
| fail-safe | System enters a defined safe state on failure | payment endpoint returns 503 rather than processing with stale rates |
| fail-silent | System ceases output rather than producing incorrect output | feature-flag evaluation defaults to off, never produces a wrong-flag answer |

This is borrowed from ISO 26262 functional safety. The matrix is not
optional once the control is active — every component must have a
declared mode, and that mode must match the implementation's actual
behavior. The reviewer at Step 11 verifies the match.

---

## How the controls compose

The Cluster 5 controls are designed to work together as one closed
quality loop. Reading anti-clockwise around the loop:

```
                  +------- PDCA / Iron Loop -------+
                  |                                |
                  v                                |
   Critical Control Points (CCPs)                 |
   monitor critical limits at Steps 5,6,7,10,13,14|
                  |                                |
                  v                                |
   Statistical Process Control                    |
   measures DPMO, Cpk, control charts continuously|
                  |                                |
       (threshold breach)                          |
                  |                                |
                  v                                |
              Andon halt                          |
              stops new dispatches                |
                  |                                |
                  v                                |
              CAPA opened                         |
              five-why analysis                   |
                  |                                |
       (severity high or critical)                 |
                  |                                |
                  v                                |
            8D report                              |
            structured root-cause + prevention     |
                  |                                |
                  v                                |
   Lessons learned written to frontmatter         |
                  |                                |
                  v                                |
   Kaizen plan created in plans/loop-improvement/ |
   (throughput-capped at 10 percent)              |
                  |                                |
                  +-- feeds back into Iron Loop ---+
```

Each arrow is a system mechanism: a hook fires, a metric is computed, a
threshold is checked, a file is written. The continuous-improvement
loop is itself a controlled process, with its own evidence trail in
`.ctoc/audit/dispatches/` and `.ctoc/capa/`.

---

## Turning the controls on

The Cluster 5 controls are activated by selecting a regulatory regime
profile that requires them. As of CTOC v6.4.x:

- `iso-9001` requires: `capa_register`, `eight_d_incident_template`,
  `lessons_learned_closure`, `process_fmea_loop`, `defects_per_million`,
  `process_capability_index`, `control_chart_variance`, `kaizen_backlog`.
- `iso-26262-asil-d` adds: `defect_density_target`,
  `graceful_degradation_matrix`, `capa_register`,
  `eight_d_incident_template`.
- `dora` adds: `process_capability_index`, `capa_register`,
  `eight_d_incident_template`.

Edit `.ctoc/settings.yaml`:

```yaml
regulatory_regime:
  active_profiles:
    - iso-9001
```

The Andon hook is registered in `.claude-plugin/hooks.json` and
activates automatically once `andon_cord_halt` is in the effective
control set.

To disable individual controls (e.g. for early development), use the
override block:

```yaml
regulatory_regime:
  active_profiles:
    - iso-9001
  overrides:
    andon_cord_halt: false
```

Disabling a control is logged. A project that disables the same control
on three or more occasions warrants a CAPA — why does this team keep
disabling the same safety net?

---

## Reading list

For deeper grounding, in order of increasing depth:

1. Atul Gawande, *The Checklist Manifesto* — why checklists work in
   high-stakes domains.
2. Eliyahu Goldratt, *The Goal* — the theory of constraints, which
   informs why CCPs matter more than non-CCP optimizations.
3. Donald Wheeler, *Understanding Variation* — the foundational text
   on common-cause vs special-cause variation.
4. Douglas Montgomery, *Introduction to Statistical Quality Control*,
   7th ed. — the comprehensive reference for Cpk, Shewhart charts,
   and process capability.
5. Capers Jones, *Software Quality in 2020* — the empirical bridge
   from manufacturing metrics to software metrics.
