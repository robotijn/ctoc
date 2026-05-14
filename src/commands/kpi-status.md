---
description: Show current KPI status — values vs targets, week-over-week delta, color-coded.
model: claude-haiku-4-5
---

Display the current state of all Product Loop KPIs for this project.

1. Load the KPI plan: `plans/canvas/<slug>-kpis.yaml`. If missing, point user to the kpi-planner.
2. Load the latest review file from `.ctoc/product-loop/reviews/` to extract current values.
3. If no review yet (pre-first-review), show the targets only with a note: "No data yet — first review due `<date>`."
4. Render a table:

| KPI | Current | Target | Δ vs prior | Status |
|---|---|---|---|---|
| Activation rate | 22% | > 30% | -3pp | RED |
| W1 retention | 18% | > 25% | flat | YELLOW |
| MRR | $4,300 | growing | +$320 | GREEN |

5. Note any deferred questions about KPIs that await the founder (read from `.ctoc/inbox/questions/` with `awaits_persona: founder` and `question_id` starting with `canvas/`).

End with a menu:

```
[1] Run weekly review now (/ctoc:product-review)
[2] Adjust KPI targets (kpi-planner agent)
[3] View an experiment in progress (if any)
[0] Back to dashboard
```
