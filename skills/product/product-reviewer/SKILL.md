---
name: product-reviewer
description: Weekly product review. Reads KPI data from PostHog/Stripe, compares against targets, identifies funnel drop-offs, surfaces 2-3 hypotheses for improvement.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
when_to_load:
  - "product review"
  - "weekly review"
  - "kpi review"
  - "how is the product doing"
  - "activation drop-off"
  - "retention check"
  - "funnel analysis"
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

## Role

You produce a weekly product review that answers: **is the product working?** Specifically:
1. Where are users in the funnel?
2. Where do they drop off?
3. What's the W1 / M1 retention trend?
4. Is MRR growing? Why or why not?
5. What's the top hypothesis for improvement?

## 2026 Best Practices (Product analytics)

- **Funnel before feature** — don't propose new features until you've measured the existing funnel.
- **Cohort retention beats DAU** — DAU can be flat while every weekly cohort is leaving.
- **Activation > acquisition** — fixing a 30% → 50% activation rate beats doubling ad spend.
- **One hypothesis per week** — focus, don't scatter.
- **Significance before action** — 100 signups isn't enough to trust a 2% delta.

## Input

```yaml
kpi_plan: plans/canvas/<slug>-kpis.yaml    # the targets
posthog_export: .ctoc/product-loop/data/<date>.csv  # OR call PostHog API
stripe_export: .ctoc/product-loop/data/stripe-<date>.json
date_range: { from: <last_review_date>, to: <today> }
prior_review: .ctoc/product-loop/reviews/<previous-date>.md  # for trends
```

## Process

### Step 1: Load KPI plan + recent data

```javascript
const kpiPlan = readYaml(`plans/canvas/${slug}-kpis.yaml`);
const recentData = loadProductData(dateRange);
const priorReview = loadPriorReview();
```

### Step 2: Compute current values

For each KPI in `kpi_plan.launch_kpis`:

```yaml
- id: activation_rate
  current_value: 22%
  target: "> 30%"
  status: red       # green | yellow | red
  delta_week: -3%   # vs prior review
  trend: degrading  # improving | stable | degrading
```

### Step 3: Funnel drop-off analysis

For the activation funnel `signup_started → signup_completed → activation`:

```
This week:
  signup_started:    1000 (100%)
  signup_completed:  680  (68%)   ← drop of 32%
  activation:         150 (15%)   ← drop of 53% ← LARGEST DROP
```

Largest drop → primary opportunity.

### Step 4: Cohort retention

Compute retention for the cohort of users who signed up:
- D1: still active 1 day later? %
- W1: ... 7 days later? %
- M1: ... 30 days later? %

Compare against targets. Falling cohorts are an alarm.

### Step 5: Churn analysis

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

### Step 6: Hypothesize

From the largest drop + churn reason, surface 2-3 testable hypotheses:

```yaml
hypotheses:
  - id: simplify_onboarding
    rationale: "53% of signups drop before activation — onboarding likely too long"
    expected_impact: "+8-12% activation rate"
    test_design: "A/B: 3-step vs 5-step onboarding flow"
    next_step: "Dispatch experiment-designer"
    estimated_duration_weeks: 2

  - id: lower_free_tier_friction
    rationale: "30% of users on Pro plan downgrade in month 2 → 'not enough value' (churn reason)"
    expected_impact: "Reduce monthly churn by 1-2pp"
    test_design: "Increase free tier limits temporarily, measure activation lift vs conversion loss"
    next_step: "Founder decision required"
    estimated_duration_weeks: 4
```

### Step 7: Write the review

Output: `.ctoc/product-loop/reviews/YYYY-MM-DD.md`

```markdown
# Product Review — 2026-05-21
**Prior review**: 2026-05-14
**Project**: freelance-invoices

## KPI snapshot
| KPI | Current | Target | Week Δ | Status |
|---|---|---|---|---|
| Signup completion | 68% | > 60% | +2pp | GREEN |
| Activation rate | 22% | > 30% | -3pp | RED |
| W1 retention | 18% | > 25% | flat | YELLOW |
| Free→paid | 4.1% | > 3% | +0.3pp | GREEN |
| Monthly churn | 7% | < 5% | +1pp | RED |
| MRR | $4,300 | growing | +$320 | GREEN |

## Funnel
signup_started → signup_completed → activation
1000 → 680 (68%) → 150 (22%)
Largest drop: signup_completed → activation (53%)

## Churn analysis
40% "too_expensive" · 27% "not_enough_value" · 17% switched · 17% no_longer_needed

## Hypotheses
1. **Simplify onboarding** (high confidence, +8-12% activation)
2. **Increase free tier limits** (medium confidence, -1-2pp churn)

## Recommended next experiment
H1 (onboarding) — design via experiment-designer skill.

## Open questions for founder
- Are you willing to widen free tier for 30 days to test the value gap hypothesis?
```

### Step 8: Dispatch experiment-designer (optional)

If hypothesis 1 is selected, the founder/pm dispatches [[experiment-designer]] with the hypothesis.

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
    review_path: .ctoc/product-loop/reviews/2026-05-21.md
    kpi_status:
      green: 3
      yellow: 1
      red: 2
    largest_funnel_drop:
      from: signup_completed
      to: activation
      drop_pct: 53
    primary_hypothesis_id: simplify_onboarding
    next_experiment_proposed: true
  self_assessment:
    coverage: 0.95
    confidence_overall: HIGH
    limitations:
      - "Funnel data limited to events PostHog received; ad-blocker users not counted."
      - "Churn reasons rely on user self-report (may not reflect true cause)."
```

## Critical pitfalls

1. **Comparing apples to oranges** — only compare same-cohort metrics (W1 retention of users from same week).
2. **Acting on noisy data** — wait for ≥ 100 signups before trusting a metric.
3. **Hypothesizing in isolation** — surface 2-3 hypotheses with rationale; let founder pick.
4. **Skipping the funnel** — always start with the funnel before retention/revenue.
5. **No baseline** — first review with no prior data establishes the baseline only; no hypotheses yet.

## Sources

- [Mixpanel Product Analytics 101](https://mixpanel.com/blog/product-analytics-guide/)
- [Amplitude North Star Framework](https://amplitude.com/north-star/)
- [Reforge: Activation Metrics](https://www.reforge.com/blog/activation-metric)
