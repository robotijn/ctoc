---
description: Run a weekly product review — KPI snapshot, funnel drop-offs, hypotheses for improvement.
---

Run a Product Loop weekly review. The review:

1. Loads the per-project KPI plan (`plans/canvas/<slug>-kpis.yaml`).
2. Reads recent product data (PostHog + Stripe).
3. Compares current values against targets.
4. Identifies the largest funnel drop-off.
5. Surfaces 2-3 hypotheses for improvement.
6. Writes the review to `.ctoc/product-loop/reviews/YYYY-MM-DD.md`.

Dispatches the `product/product-reviewer` Tier 2 specialist (skill is at `skills/product/product-reviewer/SKILL.md`).

**Persona-gated**: this review is for founder, technical-founder, and pm personas. Programmers/architects/designers will see the output but the analysis is owned by the product persona.

Steps:

1. Check that a KPI plan exists. If not, suggest running `/ctoc:kpi-status` or the kpi-planner agent first.
2. Check when the last review was (look in `.ctoc/product-loop/reviews/`). If < 7 days ago, ask if user wants to re-run.
3. Dispatch the product-reviewer skill via the Task tool. Pass the project slug + the KPI plan path.
4. Once the review file is written, summarize the key findings:
   - KPI snapshot table
   - Largest funnel drop (the action point)
   - Top hypothesis
5. Offer next step: dispatch experiment-designer to design an A/B test for the top hypothesis.

After running, end with a numbered menu:

```
[1] Design A/B test for the top hypothesis (Recommended)
[2] Discuss the review with me
[3] Skip — I'll review manually
[0] Back to dashboard
```
