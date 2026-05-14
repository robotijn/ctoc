# The Product Loop (v8.4+)

> Iron Loop ships features. Product Loop validates them.
>
> Without Product Loop, you've built a SaaS but you don't know if it's *working*.

## Why two loops

CTOC's Iron Loop optimizes **code quality** — tests pass, security clean, complexity bounded, coverage ≥ 80%. That gets a feature *shipped*.

But shipped ≠ working. Shipped just means the code is in production. **Working** means:
- People sign up
- They activate (reach value)
- They retain (come back next week / month)
- They convert from free to paid
- They tell their friends
- They don't churn

These are *product* outcomes, not code outcomes. The Iron Loop doesn't measure them. The Product Loop does.

## The seven-step Product Loop

```
DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN
  ↑                                                                    │
  └─────────────────────── continuous cycle ──────────────────────────┘
```

| Step | Owner persona | What happens | Cadence |
|------|---|---|---|
| **DEFINE** | founder + pm | Pick KPIs from the canonical library; set targets | Once at canvas phase, revise quarterly |
| **INSTRUMENT** | programmer | Wire up event tracking, dashboards | Once at implementation phase |
| **MEASURE** | (automated) | PostHog/Plausible captures events; dashboards update | Continuous |
| **REVIEW** | founder + pm | Weekly synthesis: what's working, what's not | Weekly |
| **HYPOTHESIZE** | founder + pm | "If we do X, KPI Y will improve by Z" | At each review |
| **EXPERIMENT** | pm + programmer | A/B test the hypothesis (PostHog feature flags) | 1-4 weeks per experiment |
| **LEARN** | founder + pm | Did it work? Roll out winners; kill losers; document | End of experiment |

## Canonical KPIs (SaaS B2C)

| KPI | Definition | Target (start) | Tracking |
|---|---|---|---|
| **Activation rate** | % of signups that reach value within 7 days | > 30% | event: `activation` |
| **D1 retention** | % returning day after signup | > 40% | sessions table |
| **W1 retention** | % returning within 7 days | > 25% | sessions table |
| **M1 retention** | % returning within 30 days | > 15% | sessions table |
| **Free→paid conversion** | % of free users that pay within 30 days | > 3% (B2C) / 15% (B2B) | subscriptions table |
| **Time to value** | Median seconds from signup to activation | < 300s | event delta |
| **MRR** | Monthly recurring revenue | grows monthly | subscriptions × plan price |
| **Monthly churn (B2C)** | % canceled in month / active at start | < 5% | subscription_canceled events |
| **NPS** | Net Promoter Score | > 30 | in-app survey |
| **Organic share** | % of signups from non-paid channels | > 50% | utm_source on signup |

The **canonical KPI library** lives at `.ctoc/templates/product-kpis.yaml`. Each project type has its own KPI subset.

## How it integrates with Iron Loop

```
Iron Loop                         Product Loop
─────────                         ────────────
Step 1-3 (vision + canvas)    →   DEFINE: pick KPIs from canonical library,
                                  set targets in plans/canvas/<slug>-kpis.yaml

Step 4-6 (impl plan)          →   INSTRUMENT: implementation-planner includes
                                  the event-tracking spec from kpi-plan.yaml

Step 7-15 (TEST..DOCUMENT)    →   programmer wires events via posthog-analytics
                                  skill, adds session tracking

After ship (post-Gate 3)      →   MEASURE: continuous via PostHog/Plausible
                                  WEEKLY: product-reviewer agent runs review
                                  HYPOTHESIZE → EXPERIMENT → LEARN
```

The **product-reviewer agent** (Tier 2 specialist) runs weekly:
1. Reads recent KPI data (PostHog API or exported CSV)
2. Compares against targets
3. Identifies dropoffs in the funnel (signup → activation → conversion → retention)
4. Surfaces 2-3 hypotheses for improvement
5. Routes hypothesis design to **experiment-designer** (Tier 2)

The **experiment-designer agent** (Tier 2):
1. Takes a hypothesis ("simpler onboarding → 10% activation lift")
2. Designs the A/B test (control vs variant, success metric, minimum sample size, duration)
3. Outputs a PostHog feature flag configuration
4. After experiment ends, computes statistical significance + recommends roll-out

## Persona routing for Product Loop

Following the v8.3 routing rules:

| Persona | DEFINE | INSTRUMENT | REVIEW | HYPOTHESIZE | EXPERIMENT-design | EXPERIMENT-implement |
|---|---|---|---|---|---|---|
| founder | ✓ | (defers to programmer) | ✓ | ✓ | (defers to pm) | (defers to programmer) |
| pm | ✓ | (defers to programmer) | ✓ | ✓ | ✓ | (defers to programmer) |
| technical-founder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| programmer | (defers to founder/pm) | ✓ | (defers to founder/pm) | (defers to founder/pm) | (defers to pm) | ✓ |
| architect | (defers to founder/pm) | ✓ | (defers to founder/pm) | (defers to founder/pm) | (defers to pm) | ✓ |
| designer | (sees UX KPIs only) | ✗ | (sees UX KPIs only) | (UX hypotheses only) | (UX experiments) | ✗ |
| hobbyist | (skips entirely) | (skips) | (skips) | (skips) | (skips) | (skips) |

A programmer is NEVER asked "should we lower the activation target?" — that's a founder/pm question. A founder is NEVER asked "which event ID should we use?" — that's a programmer question.

## Slash commands

| Command | What it does |
|---|---|
| `/ctoc:kpi-status` | Current KPIs vs targets, last 7 days |
| `/ctoc:product-review` | Run weekly review (dispatches product-reviewer Tier 2) |
| `/ctoc:experiment-design` | Design an A/B test from a hypothesis |

## When Product Loop is skipped

- `oss-library` / `cli` projects — no users, no funnel
- `internal-tool` — no product KPIs in the consumer sense (may track adoption)
- `hobbyist` persona — over-engineering for a side project
- Pre-launch — only DEFINE + INSTRUMENT run; the loop fully kicks in after first paying customer

## File layout

```
.ctoc/templates/product-kpis.yaml              ← canonical KPI library
.ctoc/templates/saas/b2c-subscription/kpi-plan.yaml  ← SaaS-specific subset
plans/canvas/<slug>-kpis.yaml                  ← per-project KPI targets
.ctoc/product-loop/reviews/YYYY-MM-DD.md       ← weekly review reports
.ctoc/product-loop/experiments/<id>.yaml       ← A/B test designs + outcomes
agents/planning/kpi-planner.md                 ← Tier 1, DEFINE step
agents/product/product-reviewer.md             ← Tier 2 (skill stub)
agents/product/experiment-designer.md          ← Tier 2 (skill stub)
skills/product/product-reviewer/SKILL.md
skills/product/experiment-designer/SKILL.md
src/lib/product-loop.js                        ← KPI loading, review scheduling
docs/PRODUCT_LOOP.md                           ← this file
src/commands/product-review.md                 ← /ctoc:product-review
src/commands/kpi-status.md                     ← /ctoc:kpi-status
```

## Test invariants

`tests/product-loop.test.js`:
- kpi-planner exists at tier:1, persona_gates includes founder
- product-reviewer skill has tier:2 + v8 frontmatter
- experiment-designer skill has tier:2 + v8 frontmatter
- product-kpis.yaml canonical library is well-formed
- b2c-subscription has its kpi-plan.yaml linking canonical KPIs
- Persona routing: founder gets KPI questions; programmer doesn't

## The self-enforcement extension

`src/lib/iron-loop-enforcer.js` adds these checks (gated by project type):

- `product-loop-kpis-defined` — for active SaaS projects, plans/canvas/ has a *-kpis.yaml
- `product-loop-instrumented` — for active SaaS projects post-Step 13, key events fire in PostHog
- `product-loop-weekly-review` — for SaaS projects past first paying customer, weekly review file exists in `.ctoc/product-loop/reviews/`

These surface in the self-check report. They warn (not block) — the founder may legitimately defer Product Loop for early validation.
