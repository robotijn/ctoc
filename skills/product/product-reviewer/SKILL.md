---
name: product-reviewer
description: Weekly product review. Reads KPI data from PostHog/Stripe, compares against targets, identifies funnel drop-offs, surfaces 2-3 hypotheses for improvement.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "product review"
  - "weekly review"
  - "kpi review"
  - "how is the product doing"
  - "activation drop-off"
  - "retention check"
  - "funnel analysis"
  - "north star"
  - "MRR review"
  - "churn analysis"
related_skills:
  - saas/posthog-analytics
  - saas/stripe-subscriptions
  - product/experiment-designer
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write, Bash, WebFetch
---

# Product Reviewer (product skill)

> Tier 2 specialist for the **REVIEW** step of the Product Loop (`docs/PRODUCT_LOOP.md`).
> Persona-gated implicitly via CTO Chief: only dispatched when founder/pm/technical-founder requests.
> Converted to skill in CTOC v6.4 product-loop B2 sweep; refreshed for 2026 best practices.

## Role

You produce a weekly product review that answers: **is the product working?** Specifically:
1. Where did the North Star metric move this week, and why?
2. Where are users in the funnel?
3. Where do they drop off?
4. What's the W1 / M1 retention trend, per cohort?
5. Is MRR growing? Why or why not?
6. What's the top hypothesis for improvement, with an owner?

## 2026 Best Practices (Product review cadence)

- **Weekly is the floor, not the ceiling.** Annual metrics validate strategy; weekly metrics are operational. The first question every Monday is: "How did our North Star move this week, and what drove it?" Tie the review to a fixed slot (e.g. Monday 10:00) so it never slips.
- **One North Star, framed in customer outcome language.** Not "weekly active users" — that's activity. Phrase it as the value the customer gets: "weekly active invoices sent" (Stripe-like), "songs played to completion" (Spotify-like), "messages successfully delivered to teammate" (Slack-like). If the team can't explain it in one sentence of customer benefit, it isn't a North Star yet.
- **Input-metric tree, 3–5 levers below the North Star.** The NSM at the top, 3–5 input metrics one layer down, KPIs feeding each input. When the NSM moves, you know which input moved it. When the NSM doesn't move, you know which input is stuck.
- **KPI vs target, color-coded.** Every KPI in the review carries a target — `< 5% monthly churn`, `> 30% activation rate`. No target = no "good" definition = no review value. Color-code each row green / yellow / red against target.
- **Drill into the worst-performing metric.** Don't review all KPIs equally. After the snapshot table, spend the body of the review on the single reddest metric. Funnel, cohort, segment — whatever explains the drop.
- **Action items have owners and due dates.** Every action item is `owner: <person>` and `due: <date>`. Action items without owners die. CTOC writes them to `.ctoc/product-loop/actions/<date>.yaml` so they can be tracked across reviews.
- **Recap last week's actions.** The review starts with "What did we say we'd do last week, and what happened?" Without recap, the team builds zero institutional memory and the same hypothesis surfaces over and over.
- **Cohort retention beats DAU.** DAU can be flat while every weekly cohort is leaving. Always render retention as a cohort triangle (D1/W1/M1 per signup cohort), never a single rolling number.
- **Segment-broken view for B2B.** For B2B products, segment by plan tier, company size, or industry. An average that's stable across the segment can hide a SMB cliff and an enterprise lift cancelling out — Simpson's paradox in the wild. If you're not segmenting, cross-link [[experiment-designer]] before acting on aggregates.
- **Activation > acquisition.** Fixing a 30% → 50% activation rate beats doubling ad spend. Spend most review time on the activation funnel before discussing acquisition.
- **One hypothesis per week, not a list.** Surface 2–3 candidates with rationale; pick one. Multiple parallel hypotheses thin attention and confound learning.
- **Significance before action.** A 2% delta on 100 signups is noise. Wait for n ≥ a couple-hundred per arm before treating a delta as a signal; for revenue or churn metrics the threshold is higher because variance is higher.

## Failure modes to flag (skill emits a finding for each)

These are the patterns this skill is meant to catch in the existing review workflow — each becomes a `severity: critical` letter on the wire (per warnings-are-bugs).

- **Missing KPI review cadence** — no recurring weekly slot, reviews happen "when someone remembers". Findings stale within a month.
- **KPIs without targets** — metric tracked, no `good` definition, no color coding. The review degrades into status reporting.
- **Action items without owners or due dates** — owner=`team` is no owner. The action evaporates.
- **No recap of last week's actions** — the review is amnesiac; same hypothesis re-surfaces every 3 weeks.
- **Reviewing aggregates without segmentation** — Simpson's paradox risk. Cross-link [[experiment-designer]] to design segment-aware tests.
- **North Star measuring activity, not customer outcome** — "DAU", "page views", "sessions" all measure activity. Replace with the in-product value moment.
- **No prior-baseline / first-review hallucination** — the first review has no prior data; do not invent trends. Establish baseline only, no hypotheses yet.
- **Mixing cohorts** — comparing W1 retention of "users who signed up last week" against "users who signed up 6 months ago" without controlling for product changes.
- **Single-tool blind spot** — PostHog event data without Stripe revenue cross-check (or vice versa). Funnel looks healthy, revenue is cratering.

## Input

```yaml
kpi_plan: plans/canvas/<slug>-kpis.yaml    # the targets
posthog_export: .ctoc/product-loop/data/<date>.csv  # OR call PostHog API
stripe_export: .ctoc/product-loop/data/stripe-<date>.json
date_range: { from: <last_review_date>, to: <today> }
prior_review: .ctoc/product-loop/reviews/<previous-date>.md  # for trends
prior_actions: .ctoc/product-loop/actions/<previous-date>.yaml  # for recap
segments: [free, pro, enterprise]   # B2B segmentation, optional
```

## Process

### Step 0: Recap last week

Load `prior_actions`. For each action item, check status:
- Done? Mark `done` with brief result.
- In progress? Carry forward, flag if slipping past due.
- Dropped? Document why.

This is the FIRST section of the review.

### Step 1: Load KPI plan + recent data

```javascript
const kpiPlan = readYaml(`plans/canvas/${slug}-kpis.yaml`);
const recentData = loadProductData(dateRange);
const priorReview = loadPriorReview();
const priorActions = loadPriorActions();
```

### Step 2: Compute North Star + input tree

```yaml
north_star:
  id: weekly_active_invoices_sent     # customer outcome, not activity
  current_value: 1840
  prior_value: 1720
  delta_week: +7%
  target_curve: "+5% w/w"
  status: green

input_metrics:
  - id: signup_completion
    current_value: 68%
    target: "> 60%"
    status: green
  - id: activation_rate
    current_value: 22%
    target: "> 30%"
    status: red
    delta_week: -3pp
    trend: degrading
```

### Step 3: Funnel drop-off analysis (drill the worst)

For the activation funnel `signup_started → signup_completed → activation`:

```
This week:
  signup_started:    1000 (100%)
  signup_completed:  680  (68%)   ← drop of 32%
  activation:         150 (15%)   ← drop of 53% ← LARGEST DROP
```

Largest drop → primary opportunity. Spend the body of the review here.

### Step 4: Cohort retention (triangle, not number)

Render the cohort triangle — each row is a signup-week cohort, columns are D1/W1/M1:

```
Cohort         n      D1     W1     M1
─────────────────────────────────────────
2026-05-12   1000    42%    18%    --
2026-05-05    980    45%    21%    9%
2026-04-28   1020    44%    20%    11%
2026-04-21   950     46%    22%    12%
```

Trend: D1 stable, W1 slipping, M1 dropping. Cohorts are getting weaker — alarm.

### Step 5: Segmentation (Simpson's paradox check)

For each segment in `segments`, recompute the worst KPI:

```
              Aggregate   free      pro       enterprise
activation     22%         18%      31%       47%
W1 retention   18%         12%      28%       42%
```

If aggregate hides a segment cliff, that's the real finding. Do NOT act on the aggregate alone.

### Step 6: Churn analysis

Group `subscription_canceled.reason` events:

```
Reason                 Count    %
─────────────────────────────────
too_expensive           12      40%
not_enough_value         8      27%
switched_to_competitor   5      17%
no_longer_needed         5      17%
```

The plurality reason is the lead.

### Step 7: Hypothesize (2–3, then pick 1)

From the largest drop + churn reason + segment view, surface 2–3 testable hypotheses; flag the recommended one:

```yaml
hypotheses:
  - id: simplify_onboarding
    recommended: true
    rationale: "53% of signups drop before activation — onboarding likely too long. Free-tier hit hardest (18% vs 47% enterprise)."
    expected_impact: "+8-12% activation rate on free tier"
    test_design: "A/B: 3-step vs 5-step onboarding flow"
    next_step: "Dispatch [[experiment-designer]] with this hypothesis"
    owner: "pm:alex"
    due: 2026-05-26
    estimated_duration_weeks: 2

  - id: lower_free_tier_friction
    rationale: "30% of users on Pro plan downgrade in month 2 → 'not enough value' (churn reason)"
    expected_impact: "Reduce monthly churn by 1-2pp"
    test_design: "Increase free tier limits temporarily, measure activation lift vs conversion loss"
    next_step: "Founder decision required"
    owner: "founder:tijn"
    due: 2026-05-23
    estimated_duration_weeks: 4
```

### Step 8: Write the review

Output: `.ctoc/product-loop/reviews/YYYY-MM-DD.md`

```markdown
# Product Review — 2026-05-19
**Prior review**: 2026-05-12
**Project**: freelance-invoices

## Recap of last week's actions
- [done] PM: Ship 3-step onboarding behind flag — shipped 2026-05-15.
- [carry-forward] FOUNDER: Decide on free-tier limits — still open, due 2026-05-23.

## North Star: Weekly Active Invoices Sent
1840 (prior 1720, +7% w/w) — GREEN against `+5% w/w` target.

## KPI snapshot
| KPI | Current | Target | Week Δ | Status |
|---|---|---|---|---|
| Signup completion | 68% | > 60% | +2pp | GREEN |
| Activation rate | 22% | > 30% | -3pp | RED |
| W1 retention | 18% | > 25% | flat | YELLOW |
| Free→paid | 4.1% | > 3% | +0.3pp | GREEN |
| Monthly churn | 7% | < 5% | +1pp | RED |
| MRR | $4,300 | growing | +$320 | GREEN |

## Drill: Activation (the red one)

### Funnel
signup_started → signup_completed → activation
1000 → 680 (68%) → 150 (22%)
Largest drop: signup_completed → activation (53%)

### Segments
|              | aggregate | free | pro | enterprise |
|---|---|---|---|---|
| activation   | 22%       | 18%  | 31% | 47%        |
| W1 retention | 18%       | 12%  | 28% | 42%        |

Free tier is the source of the aggregate weakness.

### Cohort retention triangle
| Cohort     | n    | D1  | W1  | M1  |
|---|---|---|---|---|
| 2026-05-12 | 1000 | 42% | 18% | --  |
| 2026-05-05 | 980  | 45% | 21% | 9%  |
| 2026-04-28 | 1020 | 44% | 20% | 11% |

W1 slipping, M1 dropping → cohorts weakening over time.

## Churn analysis
40% "too_expensive" · 27% "not_enough_value" · 17% switched · 17% no_longer_needed

## Hypotheses (2–3 surfaced, 1 recommended)
1. **Simplify onboarding** [RECOMMENDED] — high confidence, +8–12% activation. Owner: pm:alex, due 2026-05-26.
2. **Increase free tier limits** — medium confidence, -1–2pp churn. Owner: founder:tijn, due 2026-05-23.

## Action items (this week)
| # | Action | Owner | Due |
|---|---|---|---|
| 1 | Design A/B for 3-step onboarding | pm:alex | 2026-05-26 |
| 2 | Decide on free-tier widening | founder:tijn | 2026-05-23 |
| 3 | Add segment filter to PostHog dashboard | eng:sam | 2026-05-22 |

## Open questions for founder
- Willing to widen free tier for 30 days to test the value gap hypothesis?
```

Also write `.ctoc/product-loop/actions/YYYY-MM-DD.yaml` so the NEXT review can recap.

### Step 9: Dispatch experiment-designer (optional)

If a hypothesis is selected, the founder/pm dispatches [[experiment-designer]] with the hypothesis.

## Output Contract (v8 dispatch protocol)

```yaml
response:
  dispatch_id: <ulid>
  protocol_version: 1
  agent: product/product-reviewer
  agent_version: 8.4.0
  completed_at: <iso8601>
  findings: []
  synthesis:
    review_path: .ctoc/product-loop/reviews/2026-05-19.md
    actions_path: .ctoc/product-loop/actions/2026-05-19.yaml
    north_star:
      id: weekly_active_invoices_sent
      delta_pct: 7
      status: green
    kpi_status:
      green: 3
      yellow: 1
      red: 2
    largest_funnel_drop:
      from: signup_completed
      to: activation
      drop_pct: 53
    segment_alert: true     # set when Simpson's-paradox-style divergence detected
    primary_hypothesis_id: simplify_onboarding
    next_experiment_proposed: true
  self_assessment:
    coverage: 0.95
    confidence_overall: HIGH
    limitations:
      - "Funnel data limited to events PostHog received; ad-blocker users not counted."
      - "Churn reasons rely on user self-report (may not reflect true cause)."
      - "Cohort retention requires >= 4 weeks of data before trends are reliable."
```

## Critical pitfalls

1. **Comparing apples to oranges** — only compare same-cohort metrics (W1 retention of users from same week).
2. **Acting on noisy data** — wait for sufficient n per arm before trusting a delta.
3. **Hypothesizing in isolation** — surface 2-3 hypotheses with rationale; let founder pick.
4. **Skipping the funnel** — always start with the funnel before retention/revenue.
5. **No baseline** — first review with no prior data establishes the baseline only; no hypotheses yet.
6. **Ignoring segments** — Simpson's paradox: aggregate stable, segments diverging. Always render the segment view for B2B.
7. **Activity North Star** — DAU / page views / sessions are activity, not value. Replace with the in-product value moment.
8. **No owner on action** — actions without owners die. Refuse to write them.

## Tool Integration (2026)

| Tool | Strengths | Best for | Note |
|---|---|---|---|
| **PostHog** | Open-source, self-hostable; analytics + session replay + feature flags + experiments + warehouse in one | Engineering-led startups, single-vendor | Use `Insights → Funnels` + `Insights → Retention` + SQL via HogQL for custom queries |
| **Amplitude** | Predictive cohorts (likelihood to activate / retain / churn), native A/B, AI-assisted analysis | Mid-stage B2C, when AI-suggested cohorts pay off | Heavier weight, separate billing-data integration |
| **Mixpanel** | Fastest funnel-building UX, strong retention cohort comparison | Teams that iterate on funnels weekly | Best ROI on retention-cohort UI |
| **ChartMogul / Baremetrics / ProfitWell** | Stripe/billing-native MRR, ARR, churn, expansion, NRR, LTV | Subscription revenue truth | Cross-check against PostHog event-derived revenue |
| **Hex / Mode / Looker Studio** | SQL notebooks for warehouse-level KPI rollups | When PostHog/Stripe aren't enough — joined warehouse views | Pin notebook to weekly review run |
| **Linear / Notion** | Action item tracking with owner + due date | Where the review's actions live after the review ends | Auto-create issues from `actions/<date>.yaml` |
| **Slack / Discord rollup bots** | Weekly digest posted to product channel: NSM + reds + recommended hypothesis | Distribution to the wider team | Keeps the metric alive beyond the room of reviewers |

## 7-language coverage — review automation snippets

Product review is a Python / TypeScript / SQL workflow in practice. Other stacks (C/C++/Java/C#) are rarely the front-of-house for KPI plumbing and are intentionally skipped per the skill's scope.

### Python — KPI query against PostHog + Stripe

```python
# Pull this week's activation funnel from PostHog and MRR from Stripe.
import os, requests, stripe
from datetime import datetime, timedelta, timezone

POSTHOG = os.environ["POSTHOG_API_KEY"]
PROJECT = os.environ["POSTHOG_PROJECT_ID"]
stripe.api_key = os.environ["STRIPE_API_KEY"]

since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

# HogQL: per-step funnel counts, last 7 days
hogql = """
SELECT event, count() AS n
FROM events
WHERE event IN ('signup_started','signup_completed','activated')
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY event
"""
r = requests.post(
    f"https://us.posthog.com/api/projects/{PROJECT}/query/",
    headers={"Authorization": f"Bearer {POSTHOG}"},
    json={"query": {"kind": "HogQLQuery", "query": hogql}},
    timeout=30,
)
r.raise_for_status()
funnel = {row[0]: row[1] for row in r.json()["results"]}

# Stripe MRR: sum active subscription items, monthly-normalized.
mrr = 0
for sub in stripe.Subscription.list(status="active", limit=100).auto_paging_iter():
    for item in sub["items"]["data"]:
        price = item["price"]
        unit = price["unit_amount"] / 100
        interval = price["recurring"]["interval"]
        mrr += unit * (1 if interval == "month" else 1/12 if interval == "year" else 0)

print({"funnel": funnel, "mrr_usd": round(mrr, 2)})
```

### TypeScript — Slack/Discord KPI rollup webhook

```ts
// Post the weekly KPI rollup to Slack. Color-coded against targets.
// Runs on Node 18+ / Bun / Deno — global fetch, no deps.
type Kpi = { id: string; value: number; target: number; higher_is_better: boolean };

function statusEmoji(k: Kpi): string {
  const hit = k.higher_is_better ? k.value >= k.target : k.value <= k.target;
  if (hit) return ":large_green_circle:";
  const margin = Math.abs(k.value - k.target) / k.target;
  return margin < 0.1 ? ":large_yellow_circle:" : ":red_circle:";
}

export async function postRollup(webhookUrl: string, kpis: Kpi[], reviewUrl: string) {
  const lines = kpis.map(k => `${statusEmoji(k)} *${k.id}*: ${k.value} (target ${k.higher_is_better ? ">=" : "<="} ${k.target})`);
  const payload = {
    text: `*Weekly Product Review*\n${lines.join("\n")}\n<${reviewUrl}|Full review>`,
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
}
```

### SQL — foundational KPI queries

Activation funnel (7-day window):

```sql
-- Step counts and step-over-step conversion in one pass.
WITH steps AS (
  SELECT event, COUNT(DISTINCT distinct_id) AS n
  FROM events
  WHERE event IN ('signup_started','signup_completed','activated')
    AND timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY event
)
SELECT
  MAX(CASE WHEN event='signup_started'   THEN n END) AS started,
  MAX(CASE WHEN event='signup_completed' THEN n END) AS completed,
  MAX(CASE WHEN event='activated'        THEN n END) AS activated,
  ROUND(100.0 * MAX(CASE WHEN event='signup_completed' THEN n END)
              / NULLIF(MAX(CASE WHEN event='signup_started' THEN n END),0), 1) AS pct_complete,
  ROUND(100.0 * MAX(CASE WHEN event='activated' THEN n END)
              / NULLIF(MAX(CASE WHEN event='signup_completed' THEN n END),0), 1) AS pct_activated
FROM steps;
```

Cohort retention (signup-week × weeks-since-signup). The `DATE_TRUNC` / `DATE_DIFF` syntax below is BigQuery/Trino/Snowflake-flavored; adapt to your warehouse dialect (Postgres uses `EXTRACT(EPOCH FROM ...) / 604800` for week diffs):

```sql
WITH cohorts AS (
  SELECT distinct_id,
         DATE_TRUNC('week', MIN(timestamp)) AS cohort_week
  FROM events
  WHERE event = 'signup_completed'
  GROUP BY distinct_id
),
activity AS (
  SELECT e.distinct_id,
         c.cohort_week,
         DATE_DIFF('week', c.cohort_week, DATE_TRUNC('week', e.timestamp)) AS weeks_since
  FROM events e
  JOIN cohorts c USING (distinct_id)
  WHERE e.event = 'session_started'
  GROUP BY 1,2,3
)
SELECT cohort_week,
       weeks_since,
       COUNT(DISTINCT distinct_id) AS retained,
       ROUND(100.0 * COUNT(DISTINCT distinct_id)
                   / NULLIF(MAX(COUNT(DISTINCT distinct_id)) OVER (PARTITION BY cohort_week),0), 1) AS pct
FROM activity
WHERE weeks_since BETWEEN 0 AND 8
GROUP BY 1,2
ORDER BY 1,2;
```

MRR roll-up by plan (snapshot at end-of-week):

```sql
-- Assumes a `subscriptions` table mirrored from Stripe with `plan`, `status`, `unit_amount_usd`, `interval`.
SELECT
  plan,
  SUM(CASE WHEN interval='month' THEN unit_amount_usd
           WHEN interval='year'  THEN unit_amount_usd / 12.0 END) AS mrr_usd,
  COUNT(*) AS active_subs
FROM subscriptions
WHERE status = 'active'
GROUP BY plan
ORDER BY mrr_usd DESC;
```

## Severity (internal triage vs. refinement-loop output)

When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule. The triage tiers below stay in the review body for prioritization; the letter's `severity` field is always `critical`. The `kind` column maps directly to the letter `kind` enum below.

| Triage tier | Examples (review body) | Letter `kind` | Internal action recommendation |
|-------|----------|---------------|--------|
| CRITICAL | North Star measures activity, not outcome | `activity_north_star` | BLOCK Gate 3 advancement |
| CRITICAL | KPIs without targets ("good" undefined) | `missing_target` | BLOCK Gate 3 advancement |
| CRITICAL | Aggregate hides a segment cliff (Simpson's) | `simpsons_risk` | BLOCK Gate 3 advancement |
| CRITICAL | No recurring review cadence | `cadence_missing` | BLOCK Gate 3 advancement |
| CRITICAL | Action items without owners or due dates | `no_owner` | BLOCK Gate 3 advancement |
| HIGH | Cohort retention degrading 3+ weeks | `cohort_decay` | Fix this review cycle |
| HIGH | MRR flat while signup volume rises | `mrr_disconnect` | Fix this review cycle |
| HIGH | No recap of prior actions | `no_recap` | Fix this review cycle |
| MEDIUM | First review writing hypotheses on no baseline | `first_review_overreach` | Fix next cycle |
| MEDIUM | Single KPI red without segmentation drill | (covered by `simpsons_risk` when applicable) | Fix next cycle |
| LOW | KPI naming inconsistency; rollup bot not pinned; notebook not versioned | (no letter — backlog) | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: product-reviewer
kind: missing_target | activity_north_star | no_owner | no_recap | simpsons_risk | cohort_decay | mrr_disconnect | first_review_overreach | cadence_missing
target_file: .ctoc/product-loop/reviews/<date>.md   # or plans/canvas/<slug>-kpis.yaml
line: <int>                                         # optional, when applicable
kpi_name: activation_rate                           # the KPI in question (if any)
segment: free                                        # the segment that triggered (if any)
delta_week: -3pp                                     # week-over-week change (if any)
message: "Activation rate red 3 weeks running; aggregate hides a 29pp free-vs-enterprise gap."
suggested_fix: "Render segment table for activation; dispatch [[experiment-designer]] on the free-tier funnel."
reference: https://uxcam.com/blog/north-star-metric-framework/
```

The integrator uses `confidence` and `kind` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but a `kind: activity_north_star` or `kind: simpsons_risk` escalates regardless because both make the entire review untrustworthy.

## Sources

- [North Star Metric — Complete Framework Guide (UXCam, 2026)](https://uxcam.com/blog/north-star-metric-framework/)
- [North Star Metric: Benefits, Challenges & Tips (Product School)](https://productschool.com/blog/analytics/north-star-metric)
- [Mixpanel — Simpson's paradox and segmenting data](https://mixpanel.com/blog/avoiding-data-fallacies-and-biases-simpsons-paradox-and-the-importance-of-segmenting-data/)
- [Amplitude — Every Product Needs a North Star Metric](https://amplitude.com/blog/product-north-star-metric)
- [David Sacks's Operating Cadence (Capitaly)](https://www.capitaly.vc/blog/david-sacks-operating-cadence-weekly-metrics-okrs-ceo-dashboard)
- [Best AI Product Analytics Tools in 2026 — Amplitude vs Mixpanel vs PostHog vs Heap](https://www.techno-pulse.com/2026/05/best-ai-product-analytics-tools-in-2026.html)
- [Reforge — Activation Metrics](https://www.reforge.com/blog/activation-metric)

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing-target, activity-North-Star, no-owner, no-recap, Simpson's-risk, cohort-decay, or MRR-disconnect finding emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- These findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a product review that ships green-with-untargeted-KPIs ships with known latent failures — the team is steering blind even if the dashboard is colorful.
