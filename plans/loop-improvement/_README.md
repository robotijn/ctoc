# Loop-Improvement Plans (Kaizen Backlog)

> Kaizen is the Japanese manufacturing discipline of continuous *small*
> improvements to the process itself, distinct from product-feature
> work. This directory holds CTOC's kaizen backlog: Iron Loop plans
> whose target is the Iron Loop itself.

## What belongs here

A loop-improvement plan addresses the *system that produces the work*,
not the work. Concrete examples:

- Add a new critic to the refinement loop's panel.
- Tighten a threshold in `.ctoc/config/andon-thresholds.yaml`.
- Clarify ambiguous language in an agent prompt.
- Add a new field to a plan template.
- Add a new check to a quality-gate library.
- Update a regulatory regime profile to reflect a new standard.
- Add or remove a Critical Control Point (requires CAPA approval).
- Refine a metric formula in `src/lib/metrics-loop.js`.

A plan that touches user-facing product code does *not* belong here.
A plan that changes how the system *checks* user-facing product code
does.

## What does not belong here

- Routine feature work — that goes through the normal `vision /
  functional / implementation / todo` pipeline.
- Bug fixes to product code — that's a normal plan plus a CAPA.
- Documentation updates that are not process changes — those go under
  the normal documentation step (Step 15) of the originating plan.

## Throughput cap — 10 percent of total plans

The DevOps Research and Assessment 2025 *State of DevOps Report*
identifies a healthy ratio: high-performing teams spend approximately
ten percent of their delivery capacity on continuous improvement of
the delivery system itself. Spend less, and the system degrades under
the weight of accumulated entropy. Spend more, and continuous-
improvement work crowds out actual product delivery.

The `kaizen_backlog` control in `src/lib/regulatory-regime.js` enforces
this cap. The enforcement rule:

```
loop_improvement_plans_in_flight / total_plans_in_flight ≤ 0.10
```

Where "in flight" means any plan whose stage is one of
`vision`, `functional`, `implementation`, `todo`, `in-progress`, or
`review`. Plans in `done/` no longer count.

If the cap is reached, a new loop-improvement plan is held in `vision/`
until an existing one ships or another regular plan enters flight. The
cap is *not* a quota — it does not require any minimum loop-improvement
work, only a maximum.

**Override.** Like all CTOC controls, the cap is overrideable in
`.ctoc/settings.yaml`:

```yaml
regulatory_regime:
  overrides:
    kaizen_backlog: false
```

Disabling the cap is logged. A project with the cap disabled is a
project that has chosen to invest more than ten percent in process
work — which can be the right call during a refactor sprint, but
should be a deliberate, recorded decision.

## How to file a loop-improvement plan

The plans here go through the same Iron Loop as any other plan. They
are not exempt from any gate, any review, any verification. The system
improves only when its improvements are themselves quality-controlled.

1. **Trigger.** Most loop-improvement plans are born from a CAPA's
   preventive action. The CAPA's `modified_plans` field should list
   the loop-improvement plan slug once it exists.
2. **Vision.** Write a one-page vision under
   `plans/loop-improvement/<slug>-vision.md` (or follow the standard
   path — the directory layout mirrors `plans/`). Vision must name the
   *system signal* this improvement responds to (which CAPA, which
   control-chart breach, which Cpk decline).
3. **Functional, Implementation, Todo, etc.** Same as any plan.
4. **Effectiveness measurement.** The plan's `lesson_learned` at Gate 3
   must include the metric whose movement will confirm the improvement
   worked. Examples:
   - "Confirm escape-rate trend declines below 0.03 over thirty days."
   - "Confirm Cpk increases above 1.33 by next month's review."
   - "Confirm zero CAPA entries pointing at the same root cause for
     ninety days."

## Relationship to the broader continuous-improvement loop

See `docs/CONTINUOUS_IMPROVEMENT.md` for the full system view. The
short version:

```
CAPA opened ── preventive action ── loop-improvement plan ── Iron Loop ── shipped
     ^                                                                       │
     └──────────────────── effectiveness check ─────────────────────────────┘
```

When the effectiveness check passes, the CAPA is closed and the loop-
improvement plan moves to `plans/done/`. When the check fails, the
CAPA is reopened — and *that* often triggers a new loop-improvement
plan that fixes the fix.

## Sources

- DevOps Research and Assessment, *2025 State of DevOps Report* —
  ten-percent kaizen practice.
- Masaaki Imai, *Kaizen: The Key to Japan's Competitive Success*,
  McGraw-Hill, 1986 — foundational text on continuous improvement.
- Toyota Production System lexicon, *Kaizen* — Lean Enterprise
  Institute:
  https://www.lean.org/lexicon-terms/kaizen/
- ISO 9001:2015 Clause 10.3 *Continual improvement*.
