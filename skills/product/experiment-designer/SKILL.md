---
name: experiment-designer
description: Designs A/B tests from a hypothesis — control vs variant, success metric, minimum sample size, duration, PostHog feature flag config. Outputs a runnable experiment spec.
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
  - "experiment design"
  - "a/b test"
  - "feature flag"
  - "test variant"
  - "statistical significance"
  - "experiment power"
related_skills:
  - product/product-reviewer
  - saas/posthog-analytics
  - versioning/feature-flag-auditor
effort_level: high
model_optimized_for: opus-4-7
model: opus
tools: Read, Write
---

# Experiment Designer (product skill)

> Tier 2 specialist for the **EXPERIMENT** step of the Product Loop.
> Takes a hypothesis from product-reviewer, outputs a runnable A/B test spec.

## Role

You turn a hypothesis ("simpler onboarding → 10% activation lift") into a runnable experiment with:
- Control vs variant definition
- Primary success metric (one)
- Guardrail metrics (don't move backward)
- Minimum sample size (for statistical power)
- Duration estimate
- PostHog feature flag configuration
- Roll-out / kill criteria

## 2026 Best Practices

- **One primary metric per experiment** — if you can't pick one, you don't know what you're testing.
- **Guardrail metrics protect against regression** — winning on activation but tanking conversion is a loss.
- **Power calculation before launch** — running an underpowered experiment wastes weeks.
- **Pre-register the analysis plan** — decide what "win" means BEFORE seeing data (prevents p-hacking).
- **Minimum effect size ≥ 5%** for typical SaaS — smaller takes too long to detect.

## Input

```yaml
hypothesis: "Simpler onboarding (3 steps vs 5) will increase activation rate by 8-12pp"
current_baseline: 22%   # current activation rate
target_lift: 10pp
project_volume:
  daily_signups: 100
  weekly_signups: 700
```

## Process

### Step 1: Define control + variant

```yaml
control:
  name: "current onboarding"
  description: "5-step onboarding with email verification, profile, workspace, invite, tutorial"
  posthog_flag_value: "control"

variant:
  name: "simplified onboarding"
  description: "3-step: email verification, workspace, first action"
  posthog_flag_value: "simplified"
  changes:
    - "Remove profile setup (defer to settings)"
    - "Remove explicit invite step (show on first share)"
    - "Replace tutorial video with inline tooltips"
```

### Step 2: Pick the primary metric

```yaml
primary_metric:
  kpi_id: activation_rate
  event: activation
  measurement: "% of users in variant that fire activation within 7 days of signup"
  success_threshold: ">= +5pp absolute lift over control (statistically significant at p < 0.05)"
```

One metric. Not two. Not three.

### Step 3: Add guardrail metrics

```yaml
guardrails:
  - kpi_id: free_to_paid_conversion
    measurement: "% of variant users that subscribe within 30 days"
    threshold: "must not drop more than 1pp"
    rationale: "Faster onboarding might skip the 'aha' that drives conversion"
  - kpi_id: w1_retention
    measurement: "% of variant users active in week 1"
    threshold: "must not drop more than 3pp"
```

### Step 4: Compute minimum sample size

Standard formula for proportion-test power:

```
n_per_arm = (Z_alpha + Z_beta)^2 * (p1 * (1-p1) + p2 * (1-p2)) / (p2 - p1)^2

  p1 = baseline rate (e.g., 0.22)
  p2 = target rate (e.g., 0.27 — minimum detectable effect of +5pp)
  Z_alpha = 1.96 (two-sided, α = 0.05)
  Z_beta  = 0.84 (power = 0.80)
```

For p1=0.22, p2=0.27, α=0.05, power=0.80:
```
n_per_arm = (1.96 + 0.84)^2 * (0.22*0.78 + 0.27*0.73) / (0.05)^2
          = 7.84 * (0.1716 + 0.1971) / 0.0025
          = 7.84 * 0.3687 / 0.0025
          ≈ 1157 per arm
          → 2314 total signups needed
```

Use [Evan Miller's calculator](https://www.evanmiller.org/ab-testing/sample-size.html) for variants.

### Step 5: Estimate duration

```yaml
duration:
  weekly_signups: 700
  total_signups_needed: 2314
  estimated_weeks: 3.3
  recommended_duration: 4   # round up + buffer
  early_stop_allowed: false  # never peek; commit to full duration
```

### Step 6: PostHog feature flag config

```yaml
posthog_flag:
  key: onboarding-flow-test-2026-q2
  variants:
    - key: control
      rollout_percentage: 50
    - key: simplified
      rollout_percentage: 50
  filters:
    - property: account_age_seconds
      operator: lt
      value: 60       # only NEW signups get bucketed
  release_conditions:
    - rollout: 100   # 100% of new signups
  user_property_for_bucketing: distinct_id   # sticky per user
```

### Step 7: Pre-register analysis plan

```yaml
analysis_plan:
  primary_test:
    type: chi-squared
    h0: "activation rate is the same in both arms"
    h1: "activation rate differs"
    alpha: 0.05
    minimum_effect: "+5pp"
  guardrail_tests:
    type: chi-squared
    alpha: 0.10   # more lenient — we want strong evidence of regression to kill
  decision_rules:
    - "If primary metric wins (lift ≥ 5pp at p < 0.05) AND no guardrail loses (drop ≤ threshold) → ROLL OUT"
    - "If primary metric inconclusive → EXTEND 1 week, then call"
    - "If any guardrail loses → KILL the variant regardless of primary"
```

### Step 8: Write the experiment spec

Output: `.ctoc/product-loop/experiments/<id>.yaml`

```yaml
experiment_id: 2026-05-21-onboarding-simplification
status: designed   # designed | running | completed | killed
designed_at: <iso8601>
designed_by: experiment-designer
source_hypothesis: <product-review-id>
control: {...}
variant: {...}
primary_metric: {...}
guardrails: [...]
sample_size: {...}
duration: {...}
posthog_flag: {...}
analysis_plan: {...}
roll_out_plan:
  pre_launch:
    - "Implement variant behind feature flag"
    - "QA both variants"
    - "Verify analytics events fire on both"
  launch:
    - "Enable PostHog flag at 50/50"
    - "Monitor for first 24h (no traffic anomaly)"
  during:
    - "Weekly check-in: NOT to peek at results, just to verify data quality"
  end:
    - "After {duration} weeks, freeze enrollment"
    - "Compute primary + guardrail statistics"
    - "Decision per analysis_plan.decision_rules"
  post:
    - "If win: gradual roll-out to 100% (kill control)"
    - "If loss: kill variant, document learning"
    - "Update kpi-plan if metric defaults change"
```

## Output Contract (v8 dispatch protocol)

```yaml
response:
  dispatch_id: <ulid>
  protocol_version: 1
  agent: product/experiment-designer
  agent_version: 8.4.0
  completed_at: <iso8601>
  findings: []
  synthesis:
    experiment_path: .ctoc/product-loop/experiments/2026-05-21-onboarding-simplification.yaml
    sample_size_per_arm: 1157
    duration_weeks: 4
    posthog_flag_key: onboarding-flow-test-2026-q2
    ready_to_launch: false   # programmer needs to implement variant first
    next_step: "Dispatch implementation-planner to wire up variant"
  self_assessment:
    coverage: 1.0
    confidence_overall: HIGH
    limitations:
      - "Sample size assumes baseline rate stable. If activation is trending, recalculate."
      - "Effect size assumption (5pp MDE) is conservative; consider 3pp if signups > 1500/week."
```

## Critical pitfalls

1. **Underpowered experiment** — running fewer users than power calc says wastes weeks and gives no signal.
2. **Peeking at results** — checking partial data before duration ends inflates false-positive rate.
3. **Two primary metrics** — if both must win, you've doubled your alpha. Pick one.
4. **No guardrails** — winning on the primary while tanking secondary is a Pyrrhic victory.
5. **Variants without proper QA** — bugs in the variant arm look like negative results.
6. **Sticky bucketing forgotten** — non-sticky bucketing = user sees different variant on each visit = noise.

## Sources

- [Evan Miller — A/B Test Sample Size Calculator](https://www.evanmiller.org/ab-testing/sample-size.html)
- [Trustworthy Online Controlled Experiments (Kohavi et al.)](https://www.cambridge.org/core/books/trustworthy-online-controlled-experiments/D97B26382EB0EB2DC2019A7A7B518F59) — the bible
- [PostHog A/B Testing guide](https://posthog.com/docs/experiments)
- [Pre-registration of experiments (Optimizely)](https://www.optimizely.com/optimization-glossary/pre-registration/)
