---
name: experiment-designer
description: Designs A/B tests from a hypothesis — control vs variant, success metric, minimum sample size, duration, feature-flag config. Outputs a runnable experiment spec with sample-size, SRM check, CUPED, and pre-registered analysis plan.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "experiment design"
  - "a/b test"
  - "feature flag"
  - "test variant"
  - "statistical significance"
  - "experiment power"
  - "sample size calculation"
  - "CUPED"
  - "sequential testing"
  - "sample ratio mismatch"
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

You are a rigorous experimentation engineer. You turn a hypothesis ("simpler onboarding → 10% activation lift") into a runnable experiment with:

- Control vs variant definition
- Primary success metric (one) + guardrail metrics
- Minimum sample size computed from baseline, MDE, alpha, power
- Duration covering at least one full weekly cycle
- Feature-flag configuration (Statsig / Eppo / GrowthBook / PostHog)
- Sample-Ratio-Mismatch (SRM) monitoring plan
- CUPED variance-reduction plan when applicable
- Pre-registered analysis plan + roll-out / kill criteria

You assume every shortcut leaks false-positive risk. You refuse to design an experiment with two primary metrics, no SRM check, naive peeking, or no segment audit.

## 2026 Best Practices

- **Define the metric BEFORE the experiment** — KPI, event definition, attribution window, denominator, and success threshold all decided up-front. Late definitions enable post-hoc p-hacking.
- **One primary metric per experiment.** Guardrails protect against regression but don't compete for alpha. Two primaries = doubled false-positive rate.
- **Compute sample size from MDE + baseline + alpha + power.** Standard formula uses α=0.05 two-sided, power=0.80 (Z_alpha=1.96, Z_beta=0.84). Underpowered experiments produce inconclusive results that waste weeks of traffic.
- **Run for one full week minimum, ideally two.** Day-of-week, weekend, payday, and weekly-cohort effects all matter. Stopping early at "significance" before completing a weekly cycle is one of the highest-yield mistakes in industry.
- **CUPED for variance reduction when pre-period data exists.** Microsoft's CUPED (Deng/Xu/Kohavi/Walker, 2013) typically delivers 30–50% variance reduction, equivalent to 30–50% sample-size cuts or 30–50% smaller detectable effects. Use long pre-periods (28–56 days) for heavy-tailed metrics like revenue. The covariate MUST be pre-randomization and uncorrelated with treatment assignment.
- **Sequential testing is allowed ONLY with mSPRT (or an equivalent always-valid bound).** Naive peeking at frequentist p-values inflates Type-I error well above the nominal α. Bayesian posteriors with fixed thresholds suffer the same inflation under "stop on success". If you need to peek, use mixture-SPRT (mSPRT) or Group-Sequential boundaries (e.g., O'Brien-Fleming).
- **Check Sample-Ratio-Mismatch (SRM) on every experiment.** Chi-squared test of observed vs expected allocation; p < 0.01 means random assignment failed — results are biased before analysis begins. Industry-standard threshold is 0.01, not 0.05. SRM is the single most common silent failure mode.
- **Audit for Simpson's paradox by segment.** Aggregate winner can lose in every subgroup if the variant pulled more users from a low-converting segment. Pre-declare segments (device, geo, plan tier, signup cohort) in the analysis plan so segment checks are not post-hoc.
- **Novelty effect window: 2 weeks for UX changes.** A spike in week 1 that decays by week 3 is novelty, not a real effect. Either run long, hold out 10% from the rollout to measure long-term lift, or design the experiment with explicit week-over-week decomposition.
- **Ship reverse-effect tests.** Pre-launch validation: instrument a variant that should hurt (e.g., 5× slower page-load, broken CTA). If your pipeline doesn't detect a known regression, it can't detect a real one. Run this once per quarter on the platform.
- **Decision = effect size + business cost + risk, not p<0.05.** A statistically significant +0.3pp lift on a metric that costs $40k/yr to maintain the variant code is a loss. Pre-register the minimum business-meaningful effect alongside the statistical threshold.
- **Holdout for long-term measurement.** When rolling out a winner to 100%, keep a 5–10% holdout for 30–90 days to measure long-term retention/revenue impact and detect novelty decay.

## Input

```yaml
hypothesis: "Simpler onboarding (3 steps vs 5) will increase activation rate by 8-12pp"
current_baseline: 0.22   # activation rate
mde_target: 0.05         # minimum detectable effect (absolute, +5pp)
alpha: 0.05
power: 0.80
project_volume:
  daily_signups: 100
  weekly_signups: 700
pre_period_data_available: true   # enables CUPED
```

## Process

### Step 1: Define control + variant

```yaml
control:
  name: "current onboarding"
  description: "5-step onboarding: email verification, profile, workspace, invite, tutorial"
  flag_value: "control"

variant:
  name: "simplified onboarding"
  description: "3-step: email verification, workspace, first action"
  flag_value: "simplified"
  changes:
    - "Remove profile setup (defer to settings)"
    - "Remove explicit invite step (show on first share)"
    - "Replace tutorial video with inline tooltips"
```

### Step 2: Pick the primary metric (one)

```yaml
primary_metric:
  kpi_id: activation_rate
  event: activation
  measurement: "% of users in arm that fire activation within 7 days of signup"
  denominator: "users assigned to arm with >=1 session in the 7-day window"
  attribution_window_days: 7
  success_threshold:
    statistical: "p < 0.05, two-sided"
    business: ">= +3pp absolute lift (the level worth maintaining variant code)"
```

One metric. Not two. Not three.

### Step 3: Add guardrail metrics (independent of primary)

```yaml
guardrails:
  - kpi_id: free_to_paid_conversion
    measurement: "% of arm users that subscribe within 30 days"
    threshold: "must not drop more than 1pp (alpha=0.10, one-sided)"
    rationale: "Faster onboarding might skip the aha that drives paid conversion"
  - kpi_id: w1_retention
    measurement: "% of arm users active in week 1"
    threshold: "must not drop more than 3pp"
  - kpi_id: support_ticket_rate
    measurement: "tickets per active user, week 1"
    threshold: "must not increase more than 20% relative"
```

### Step 4: Compute minimum sample size

Two-proportion z-test, two-sided α=0.05, power=0.80:

```
n_per_arm = (Z_alpha + Z_beta)^2 * (p1*(1-p1) + p2*(1-p2)) / (p2 - p1)^2

  p1 = baseline rate (0.22)
  p2 = baseline + MDE  (0.27)
  Z_alpha = 1.96   (two-sided, alpha=0.05)
  Z_beta  = 0.84   (power=0.80)

n_per_arm = (1.96+0.84)^2 * (0.22*0.78 + 0.27*0.73) / (0.05)^2
          = 7.84 * (0.1716 + 0.1971) / 0.0025
          = 7.84 * 0.3687 / 0.0025
          ~= 1157 per arm  ->  2314 total
```

If CUPED is enabled and pre-period covariate explains ~40% of metric variance, effective n drops ~40% (~700 per arm). Document the empirical variance-reduction factor measured on prior experiments, never the textbook claim.

For non-proportion metrics (revenue, time-on-task, engagement counts), use a t-test sample-size formula:

```
n_per_arm = 2 * sigma^2 * (Z_alpha + Z_beta)^2 / delta^2
```

Use scipy.stats.norm.ppf or `statsmodels.stats.power` for both.

### Step 5: Estimate duration

```yaml
duration:
  weekly_signups: 700
  total_signups_needed: 2314
  estimated_weeks: 3.3
  recommended_duration_weeks: 4   # round up, cover full weekly cycles
  minimum_duration_weeks: 2       # never less, even if powered earlier
  novelty_window_weeks: 2         # weeks 1-2 may show novelty inflation
  early_stop_allowed: false       # unless using mSPRT
```

Rule: even if sample size is reached in 4 days, do NOT stop. Wait for at least one full weekly cycle (and a second if the metric is sensitive to day-of-week).

### Step 6: Feature-flag config (platform-agnostic)

```yaml
flag:
  key: onboarding-flow-test-2026-q2
  platform: posthog   # statsig | eppo | growthbook | posthog | optimizely
  variants:
    - key: control
      rollout_percentage: 50
    - key: simplified
      rollout_percentage: 50
  filters:
    - property: account_age_seconds
      operator: lt
      value: 60       # only NEW signups bucketed
  bucketing:
    unit: distinct_id        # sticky per user across sessions
    salt: "onboarding-2026-q2"
    deterministic: true
  exposure_event: "$feature_flag_called"
  srm_monitor:
    enabled: true
    chi_squared_alpha: 0.01
    check_frequency: daily
    alert_channel: "#exp-alerts"
```

### Step 7: Sample-Ratio-Mismatch (SRM) check

```yaml
srm_check:
  test: chi-squared, df=1
  expected: 50/50
  threshold: p < 0.01 -> FAIL the experiment, do not analyze
  daily_monitoring: true
  common_causes:
    - "Bucketing on a property that changes during the experiment"
    - "Bot traffic disproportionately hitting one variant"
    - "Exposure event missing in one arm (logging bug)"
    - "Variant has a redirect or load-blocker that filters users"
    - "Cache layer serving control to users who should see variant"
```

If SRM fires: stop the experiment, fix the cause, re-run from scratch. Do NOT analyze the contaminated data.

### Step 8: CUPED plan (if pre-period data available)

```yaml
cuped:
  enabled: true
  covariate:
    metric: "activation_count_prior_28d"   # NOT the same metric being tested
    window: "28 days prior to randomization"
    rationale: "Past-engagement proxies future-activation"
  validation:
    - "Covariate measured BEFORE randomization (no leak)"
    - "Covariate uncorrelated with treatment assignment (verify post-hoc)"
    - "Pre-period long enough for heavy-tail stabilization (28d min, 56d for revenue)"
  expected_variance_reduction: 0.35   # empirical, from prior experiments
```

### Step 9: Pre-register analysis plan

```yaml
analysis_plan:
  primary_test:
    family: frequentist
    test: two-proportion z-test (or chi-squared 2x2)
    h0: "activation rate is identical in both arms"
    h1: "activation rates differ"
    alpha: 0.05
    two_sided: true
    minimum_business_effect_pp: 3
  variance_reduction: cuped
  sequential_monitoring:
    method: none           # none | mSPRT | group-sequential
    rationale: "Fixed-horizon design; no peeking, no early stop"
  guardrail_tests:
    family: frequentist
    alpha: 0.10            # more sensitive — we want to catch regressions
    direction: one-sided (degradation only)
  segment_audit:
    pre_declared_segments: [device, country_tier, signup_source, plan]
    test: "primary metric per segment; flag if direction reverses any segment"
    rationale: "Simpson's paradox audit — required, not optional"
  multiple_comparisons:
    correction: "Bonferroni across guardrails+segments"
    rationale: "Avoid false-positive guardrail trips inflating kill rate"
  decision_rules:
    - "PRIMARY wins (effect >= 3pp AND p < 0.05) AND no guardrail loses (degradation < threshold) AND no segment reverses -> ROLL OUT (gradual, with holdout)"
    - "PRIMARY inconclusive (CI crosses 0) -> EXTEND 1 week IF total <= 6 weeks, else CALL IT TIE"
    - "ANY guardrail loses (alpha=0.10) -> KILL variant regardless of primary"
    - "ANY segment reverses with statistical significance -> KILL or investigate before roll-out"
    - "SRM fires -> INVALIDATE, fix root cause, re-run"
  holdout:
    enabled: true
    percentage: 10
    duration_days: 60
    purpose: "Detect novelty decay + measure long-term retention/revenue lift"
```

### Step 10: Reverse-effect / A/A validation

Before launch:

```yaml
pre_launch_validation:
  aa_test:
    description: "Run 50/50 with identical variants for 1 week BEFORE the real test"
    pass_criteria:
      - "No SRM (chi-squared p > 0.01)"
      - "Primary metric p > 0.05 (no false positive)"
      - "All segments balanced"
  reverse_effect_test:
    quarterly_cadence: true
    description: "Once per quarter, ship a known-bad variant (e.g., 5x slower) at 1% and verify the pipeline detects it"
```

### Step 11: Write the experiment spec

Output: `.ctoc/product-loop/experiments/<id>.yaml`

```yaml
experiment_id: 2026-05-21-onboarding-simplification
status: designed   # designed | aa-running | running | completed | killed | invalidated
designed_at: <iso8601>
designed_by: experiment-designer
source_hypothesis: <product-review-id>
control: { ... }
variant: { ... }
primary_metric: { ... }
guardrails: [ ... ]
sample_size:
  per_arm: 1157
  total: 2314
  with_cuped_per_arm: 752
  power: 0.80
  alpha: 0.05
  mde_absolute: 0.05
duration:
  fixed_horizon_weeks: 4
  minimum_weeks: 2
  early_stop_allowed: false
flag: { ... }
srm_check: { ... }
cuped: { ... }
analysis_plan: { ... }
pre_launch_validation: { ... }
roll_out_plan:
  pre_launch:
    - "Implement variant behind feature flag"
    - "QA both variants on staging"
    - "Verify analytics events fire on both arms with deterministic bucketing"
    - "Run A/A for 1 week, verify no SRM and p > 0.05"
  launch:
    - "Enable flag at 50/50"
    - "Monitor SRM daily, alert on p < 0.01"
    - "Monitor exposure event volume per arm"
  during:
    - "Weekly check-in: data quality only — NOT peeking at primary metric"
    - "If SRM fires: invalidate immediately"
  end:
    - "After fixed-horizon duration, freeze enrollment"
    - "Compute primary, guardrails, segment audit per analysis_plan"
    - "Apply decision_rules"
  post:
    - "If WIN: gradual roll-out (50 -> 75 -> 100) with 10% holdout for 60 days"
    - "If LOSS: kill variant, document learning in .ctoc/product-loop/learnings/"
    - "Update kpi-plan if baseline shifted"
```

## Output Contract (v8 dispatch protocol)

```yaml
response:
  dispatch_id: <ulid>
  protocol_version: 1
  agent: product/experiment-designer
  agent_version: 8.4.1
  completed_at: <iso8601>
  findings: []
  synthesis:
    experiment_path: .ctoc/product-loop/experiments/2026-05-21-onboarding-simplification.yaml
    sample_size_per_arm: 1157
    sample_size_with_cuped_per_arm: 752
    duration_weeks: 4
    flag_key: onboarding-flow-test-2026-q2
    flag_platform: posthog
    srm_monitoring: enabled
    cuped_enabled: true
    ready_to_launch: false   # programmer must implement variant first
    next_step: "Dispatch implementation-planner to wire up variant + A/A test"
  self_assessment:
    coverage: 1.0
    confidence_overall: HIGH
    limitations:
      - "Sample size assumes baseline rate stable. If activation is trending, recalculate weekly."
      - "MDE=5pp is conservative for SaaS-b2c; consider 3pp if weekly signups > 1500."
      - "CUPED variance-reduction estimate (0.35) is from prior experiments — measure on new experiment, do not trust prior."
      - "Reverse-effect quarterly validation is the platform's responsibility, not this experiment's."
```

## Critical pitfalls (categorized)

1. **Missing sample-size calculation** — running without an a-priori n target produces unbounded false-negative risk; reviewers see "no significant effect" with no power statement and ship the wrong decision.
2. **Peeking + naive frequentist** — checking p-values daily on a fixed-horizon test inflates Type-I error to 25–40% depending on look frequency. Either commit to fixed-horizon and don't look, or use mSPRT/group-sequential bounds.
3. **No SRM check** — silent failure mode #1. Bot traffic, redirect bugs, cache layers, exposure-event drops all produce SRM. If you don't test for it, you ship biased results.
4. **No segment audit (Simpson's paradox)** — aggregate winner can lose in every subgroup. Pre-declare segments; audit before shipping.
5. **Novelty effect ignored** — week-1 spike on a UX change is almost always novelty. Run minimum 2 weeks; hold out 10% for 60 days for long-term measurement.
6. **Ship-decision based on p<0.05 only** — statistical significance without business significance is theater. Include minimum effect size for "worth maintaining variant code".
7. **Missing holdout for long-term metric impact** — short-term activation lifts can mask long-term retention drops. 5–10% holdout for 30–90 days catches it.
8. **Two primary metrics** — doubles alpha. Pick one; the rest are guardrails.
9. **Non-sticky bucketing** — user sees different variant per session = noise = wasted experiment.
10. **Variants without proper QA / A/A** — bugs in the variant arm look like negative results. Always A/A first.

## Tool Integration (2026)

| Platform | Strengths | When to pick |
|---|---|---|
| **Statsig** | Bundles flags + experimentation + analytics; native sequential testing (mSPRT); CUPED built-in; acquired by OpenAI 2025 | Teams wanting one platform; AI-product teams |
| **Eppo** | Warehouse-native (BigQuery/Snowflake/Databricks); precise metric governance; holdouts and contextual bandits; mutually exclusive experiments | Data-platform-heavy orgs; enterprises needing strict metric isolation |
| **GrowthBook** | Open-source; self-host; warehouse-native; CUPED + sequential testing; per-seat pricing | OSS-preference orgs; fintech/healthtech with on-prem needs |
| **PostHog Experiments** | Bundled with product analytics; Bayesian + frequentist; flags in one platform | Smaller SaaS teams already using PostHog |
| **Optimizely** | Mature web-experimentation; visual editor; Stats Engine (sequential, FDR-controlled) | Marketing/growth teams on landing-page tests |
| **Custom (scipy.stats / R)** | Full statistical control; reproducible notebooks; supports niche designs (factorial, switchback) | Research-heavy teams; offline / warehouse-only analysis |

Analytics + stats stack: `scipy.stats` (two-proportion z, chi-squared, t-test), `statsmodels.stats.power` (sample-size), `statsmodels.stats.proportion` (proportion CIs), R `pwr` package for power. For Bayesian: PyMC, Stan, or platform built-ins (Statsig, GrowthBook, PostHog).

## Reference experiment-runtime code (7 languages)

The designer outputs a spec; downstream implementers (under implementation-planner) wire it up. Reference patterns by language:

### TypeScript (Statsig / Eppo / GrowthBook / PostHog)

```typescript
// Statsig SDK
import { Statsig } from 'statsig-js';
await Statsig.initialize('client-key', { userID: distinctId });
const exp = Statsig.getExperiment('onboarding-flow-test-2026-q2');
const variant = exp.get('flag_value', 'control');   // 'control' | 'simplified'

// Eppo SDK
import { init, getInstance } from '@eppo/js-client-sdk';
await init({ apiKey: process.env.EPPO_KEY!, assignmentLogger: { logAssignment: log => posthog.capture('$assignment', log) } });
const assignment = getInstance().getStringAssignment('onboarding-flow-test-2026-q2', distinctId, { plan: user.plan }, 'control');

// GrowthBook SDK
import { GrowthBook } from '@growthbook/growthbook';
const gb = new GrowthBook({ apiHost: process.env.GB_HOST, clientKey: process.env.GB_KEY, attributes: { id: distinctId } });
await gb.init();
const result = gb.run({ key: 'onboarding-flow-test-2026-q2', variations: ['control', 'simplified'] });

// PostHog Experiments
import posthog from 'posthog-js';
const variant = posthog.getFeatureFlag('onboarding-flow-test-2026-q2');
posthog.capture('$feature_flag_called', { '$feature_flag': 'onboarding-flow-test-2026-q2', '$feature_flag_response': variant });
```

### Python 3.12+ (GrowthBook + scipy.stats analysis)

```python
# Assignment side
from growthbook import GrowthBook
gb = GrowthBook(api_host=os.environ["GB_HOST"], client_key=os.environ["GB_KEY"], attributes={"id": distinct_id})
gb.load_features()
result = gb.eval_feature("onboarding-flow-test-2026-q2")
variant = result.value if result.on else "control"

# Analysis side — sample size + SRM + two-proportion z
from scipy import stats
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import proportions_ztest, proportion_confint

# Sample size (one-sided alpha for guardrails — set alternative='larger' or 'smaller')
analysis = NormalIndPower()
# Cohen's h for two proportions: h = 2*arcsin(sqrt(p2)) - 2*arcsin(sqrt(p1))
import math
h = 2*math.asin(math.sqrt(0.27)) - 2*math.asin(math.sqrt(0.22))  # ~ 0.1116
n_per_arm = analysis.solve_power(
    effect_size=h,
    alpha=0.05, power=0.80, alternative="two-sided",
)
# n_per_arm ~ 1157  (matches the closed-form two-proportion z formula above)

# SRM check (chi-squared)
observed = [n_control, n_variant]
expected = [(n_control + n_variant) / 2] * 2
chi2, p_srm = stats.chisquare(observed, expected)
assert p_srm > 0.01, f"SRM detected: p={p_srm}"

# Primary test
counts = [activations_control, activations_variant]
nobs = [n_control, n_variant]
stat, p_value = proportions_ztest(counts, nobs)
ci_low, ci_high = proportion_confint(activations_variant, n_variant, alpha=0.05, method="wilson")
```

### C# (.NET 9 — Statsig SDK)

```csharp
// dotnet add package Statsig
using Statsig;
using Statsig.Server;

await StatsigServer.Initialize(Environment.GetEnvironmentVariable("STATSIG_SECRET")!);
var user = new StatsigUser { UserID = distinctId, CustomProperties = { ["plan"] = user.Plan } };
var exp = await StatsigServer.GetExperimentAsync(user, "onboarding-flow-test-2026-q2");
var variant = exp.GetString("flag_value", "control");

// Log exposure explicitly if your platform needs it
await StatsigServer.LogEventAsync(user, "exposure", value: variant,
    metadata: new() { ["experiment"] = "onboarding-flow-test-2026-q2" });
```

### Java 21+ (Eppo Java SDK)

```java
// build.gradle: implementation 'cloud.eppo:eppo-server-sdk:3.+'
import cloud.eppo.EppoClient;
import cloud.eppo.api.Attributes;

EppoClient eppo = EppoClient.builder(System.getenv("EPPO_KEY"))
    .assignmentLogger(assignment ->
        posthog.capture("$assignment", Map.of(
            "experiment", assignment.getExperiment(),
            "variation", assignment.getVariation(),
            "subject", assignment.getSubject())))
    .buildAndInit();

Attributes attrs = new Attributes(Map.of("plan", user.plan));
String variant = eppo.getStringAssignment(
    "onboarding-flow-test-2026-q2", distinctId, attrs, "control");
```

### SQL (foundational — exposure + lift)

Every experiment platform needs three tables: `exposures`, `events`, `results`. The lift query is the same across platforms.

```sql
-- 1) Exposure table — one row per (user, experiment, first-bucketed-at)
CREATE TABLE experiment_exposures (
    user_id        TEXT      NOT NULL,
    experiment_id  TEXT      NOT NULL,
    variant        TEXT      NOT NULL,
    bucketed_at    TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, experiment_id)   -- sticky bucketing: insert ON CONFLICT DO NOTHING
);

-- 2) SRM check (chi-squared in app; here just the counts)
SELECT variant, COUNT(*) AS n
FROM experiment_exposures
WHERE experiment_id = 'onboarding-flow-test-2026-q2'
GROUP BY variant;

-- 3) Primary metric lift (activation within 7 days of bucketing)
WITH exposed AS (
    SELECT user_id, variant, bucketed_at
    FROM experiment_exposures
    WHERE experiment_id = 'onboarding-flow-test-2026-q2'
),
activated AS (
    SELECT e.user_id, e.variant,
           MAX(CASE WHEN ev.event_name = 'activation'
                     AND ev.occurred_at <= e.bucketed_at + INTERVAL '7 days'
                    THEN 1 ELSE 0 END) AS activated
    FROM exposed e
    LEFT JOIN events ev ON ev.user_id = e.user_id
                       AND ev.occurred_at >= e.bucketed_at
    GROUP BY e.user_id, e.variant
)
SELECT variant,
       COUNT(*)                  AS n,
       SUM(activated)            AS activations,
       AVG(activated)::numeric(6,4) AS activation_rate
FROM activated
GROUP BY variant;
```

### C / C++ — skip (rationale)

Experiment design and runtime live in application-layer code (web/mobile/backend services), platform SDKs (Statsig/Eppo/GrowthBook/PostHog), and analytics warehouses. C/C++ has no first-class SDKs from major experimentation platforms in 2026 (Statsig and Eppo ship Go/Java/Python/Node/.NET/Rust/Ruby; GrowthBook adds PHP; none ship native C/C++ SDKs as of May 2026). C/C++ services that need experimentation typically wrap a higher-level service via HTTP (FFI to a Rust or Go SDK works, but is platform-specific and not idiomatic). Skip per "no invented code" rule — there is no canonical C/C++ pattern to reference.

## Letter schema (refinement-loop output contract)

When this skill emits a finding (e.g., a hypothesis is undercooked, sample size is missing, no SRM plan), the letter to CTO Chief uses:

```yaml
finding_id: <sha256(critic+file+section+kind)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: experiment-designer
kind: missing_sample_size
     | peeking_without_msprt
     | missing_srm_check
     | missing_segment_audit_simpsons
     | novelty_effect_ignored
     | decision_p_only_no_effect_size
     | missing_long_term_holdout
     | two_primary_metrics
     | non_sticky_bucketing
     | no_aa_validation
target_file: .ctoc/product-loop/experiments/<id>.yaml
target_line: <int>                                  # YAML line of the offending section
experiment_name: onboarding-flow-test-2026-q2
suggested_fix: "Add `sample_size:` block computed from baseline=0.22, MDE=0.05, alpha=0.05, power=0.80 -> n_per_arm=1157"
reference: <URL to canonical source or this SKILL.md section>
```

The integrator escalates any `missing_srm_check`, `missing_sample_size`, or `peeking_without_msprt` to a Gate 3 block — these are not waivable in `## Decisions Taken Under Ambiguity` because they invalidate the experiment, not merely degrade it.

## Severity reconciliation

Internal triage tiers (used in human-readable reports):

| Triage tier | Examples | Action |
|---|---|---|
| CRITICAL | No sample-size calc, no SRM check, naive peeking, two primary metrics | BLOCK launch |
| HIGH | Missing segment audit, novelty effect not addressed, decision based on p<0.05 alone, missing holdout | Fix before launch |
| MEDIUM | Non-sticky bucketing risk, no A/A validation, CUPED claimed without empirical validation | Fix soon |
| LOW | Documentation gaps, missing learning capture template | Backlog |

**On the wire** — same rule as security skills — every letter emitted via the refinement loop is `severity: critical`. The triage tiers stay in the human-readable report body.

## Sources

- [Trustworthy Online Controlled Experiments — Kohavi, Tang, Xu (Cambridge)](https://www.cambridge.org/core/books/trustworthy-online-controlled-experiments/D97B26382EB0EB2DC2019A7A7B518F59)
- [Microsoft — Deep Dive Into Variance Reduction (CUPED)](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/articles/deep-dive-into-variance-reduction/)
- [Variance reduction combining pre- and in-experiment data (arXiv 2410.09027)](https://arxiv.org/abs/2410.09027)
- [From Augmentation to Decomposition: A New Look at CUPED (arXiv 2312.02935)](https://arxiv.org/pdf/2312.02935)
- [Statsig — Sample Ratio Mismatch guide](https://www.statsig.com/blog/sample-ratio-mismatch)
- [Eppo — Understanding Sample Ratio Mismatch](https://www.geteppo.com/blog/understanding-sample-ratio-mismatch-ab-testing)
- [DoorDash — Addressing SRM in A/B Testing](https://careersatdoordash.com/blog/addressing-the-challenges-of-sample-ratio-mismatch-in-a-b-testing/)
- [mSPRT — Mixture Sequential Probability Ratio Test (Medium / Chou)](https://medium.com/@carey.chou/sequential-probability-ratio-test-sprt-and-mixture-sprt-msprt-d2a6ef85ff77)
- [Statsig — Sequential Testing](https://docs.statsig.com/experiments/advanced-setup/sequential-testing)
- [Eppo — Frequentist vs Bayesian vs Sequential A/B Testing](https://www.geteppo.com/blog/comparing-frequentist-vs-bayesian-approaches)
- [Optional stopping in Bayesian testing (arXiv 1602.05549)](https://arxiv.org/pdf/1602.05549)
- [Simpson's Paradox in A/B Testing (Statsig)](https://www.statsig.com/perspectives/simpsons-paradox-explained)
- [Statsig vs Eppo vs GrowthBook (Statsig)](https://www.statsig.com/perspectives/eppo-and-growthbook-compared)
- [Evan Miller — A/B Test Sample Size Calculator](https://www.evanmiller.org/ab-testing/sample-size.html)
- [PostHog — A/B Testing guide](https://posthog.com/docs/experiments)
- [GrowthBook — Statistics docs](https://docs.growthbook.io/statistics/overview)
- [Eppo Java SDK](https://docs.geteppo.com/sdks/server-sdks/java/)
- [Statsig Server SDKs (incl. .NET)](https://docs.statsig.com/server/dotnetSDK)

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every experiment-design gap (missing sample size, missing SRM check, naive peeking, two primaries, no segment audit, novelty ignored, no holdout, no A/A) emits as `severity: critical` in the letter to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section. SRM, sample size, and peeking findings are **not** waivable — they invalidate the experiment.

The principle: an under-powered or biased experiment ships the wrong decision. A wrong decision shipped is worse than no experiment, because it locks in a false belief that survives until the next experiment overturns it — which won't happen, because the team thinks the question is settled.
