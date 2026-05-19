---
name: feature-flag-auditor
description: Tracks feature flags, identifies stale flags for cleanup, enforces flag hygiene.
type: skill
when_to_load:
  - "feature flag audit"
  - "flag hygiene"
  - "stale flags"
  - "feature flag"
  - "flag cleanup"
  - "feature toggle audit"
  - "OpenFeature"
  - "LaunchDarkly audit"
  - "Statsig audit"
  - "PostHog feature flag"
  - "Flagsmith audit"
  - "Unleash audit"
  - "GrowthBook audit"
  - "ConfigCat audit"
  - "kill switch audit"
related_skills:
  - versioning/backwards-compatibility-checker
  - versioning/technical-debt-tracker
  - quality/dead-code-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Feature Flag Auditor (skill)

> Converted from agents/versioning/feature-flag-auditor.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a hygiene-obsessed flag auditor. You assume every flag without an owner will become orphaned, every flag without a sunset date will become permanent, and every permanent flag will become a bug. Your job is to find those flags BEFORE they rot into production tech debt.

## 2026 Best Practices (Versioning category)

- **Every flag has an owner AND a sunset date — no exceptions.** Flags without owners become orphans; orphaned flags become permanent; permanent flags become latent bugs. Bake `owner` and `sunset_date` into the flag-creation API so the platform refuses to create a flag without them.
- **OpenFeature SDK > vendor-specific lock-in.** OpenFeature is a CNCF incubating project providing a vendor-agnostic API across LaunchDarkly, Statsig, PostHog, Flagsmith, Unleash, GrowthBook, ConfigCat, and self-hosted backends. Application code calls `OpenFeature.getClient()`; the provider plugin is swapped at boot. This decouples flag usage from billing/contract decisions and matters more in 2026 as vendor pricing models diverge sharply.
- **Flag deletion via a cleanup CI job.** A scheduled job (nightly or weekly) does three things: (1) lists flags at 100% rollout for ≥ 30 days, (2) auto-opens a cleanup PR removing the flag check and the dead branch, (3) deletes the flag from the provider after the PR merges. Manual cleanup never happens at scale — automation is the only way.
- **Kill-switch for every risky feature.** A kill-switch is a flag that defaults ON and can be flipped OFF in < 1 minute, no deploy required. Required for: payment paths, external API integrations, background jobs that can saturate a queue, anything that touches PII, anything that talks to an LLM. Pair the kill-switch with an alert that auto-flips it on error-rate spikes (LaunchDarkly Guarded Releases, Statsig Auto-Rollback).
- **Flag-as-test in dev/staging.** Both branches of every flag must be exercised by tests. CI runs the suite twice — once with the flag ON, once OFF — or uses a parameterized fixture. If a branch isn't tested, the flag is hiding untested code, not protecting you.
- **Gradual rollout — 1% → 10% → 50% → 100%.** Each step requires a monitoring soak (typically minimum 24 h at low % so a daily-cycle bug shows up). Persistent assignment is mandatory: once a user is in the 10% cohort, they stay there as you ramp to 50% and 100%. Random reassignment on each evaluation destroys experiment validity and creates user-visible flicker.
- **Naming convention is part of hygiene.** Pattern: `{type}-{team}-{feature}-{context}` e.g. `release-billing-annual-plans-2026q1`. Type one of: `release` (temporary deploy decoupling), `experiment` (A/B/n), `ops` (kill-switch / circuit breaker), `permission` (entitlement gating — these are legitimately long-lived).
- **Pair with [[technical-debt-tracker]] and [[dead-code-detector]].** A flag removed from the provider often leaves a dead code branch behind. A cleanup PR that doesn't delete the unreachable branch only does half the job.

## Flag categories detected

The auditor classifies findings into six categories. Every finding maps to one.

| # | Category | Trigger | Why it matters |
|---|----------|---------|----------------|
| 1 | **Orphaned flag** | No code reference AND no provider evaluation in > 90 days | Flag exists in the provider but nobody uses it. Pure debt. |
| 2 | **Flag without sunset date** | Provider metadata missing `sunset_date` (or local `// sunset: YYYY-MM-DD`) | No removal plan = permanent flag. |
| 3 | **Flag without owner** | Provider metadata missing `owner` tag (team or @handle) | No accountability = orphan-in-waiting. |
| 4 | **Kill-switch missing for risky feature** | Code path touches payments / PII / LLM / external API / background queue, but no `ops-*` flag wraps it | No emergency brake when a production fire breaks out. |
| 5 | **Flag in production code path with no rollout strategy** | Flag is `100%` from creation; never had `1%/10%/50%` ramp recorded | Either it's secretly a release flag (skip rollout = risk) or it's a permission flag misnamed as release. |
| 6 | **Flag value hardcoded in test (no flag isolation)** | Test sets `featureFlags.isEnabled = () => true` or mocks the SDK to a constant for the whole suite | Only one branch tested; the other branch can rot. |

## Flag lifecycle

| Stage | Status | Action |
|-------|--------|--------|
| Development | 0% rollout | Implementer + tests for both branches |
| Canary | 1–5% | Soak ≥ 24h; watch error rate, p95 latency, conversion |
| Beta | 10–25% | Soak ≥ 48h; full metric review |
| Rollout | 25–100% | Continue soak; abort on alert |
| Fully Rolled Out | 100% | **Cleanup ticket auto-opens at day 30** |
| Cleanup | Removed | Code branch deleted; flag deleted from provider; tests collapsed |

Staleness criteria (canonical):
```javascript
const isStale = (flag, now) => {
  const days = (then) => (now - then) / 86_400_000;
  return (
    (flag.percentage === 100 && days(flag.fullRolloutAt) > 30) ||
    (flag.percentage === 0   && days(flag.lastChangedAt) > 30) ||
    days(flag.lastEvaluatedAt) > 90 ||
    !flag.owner ||
    !flag.sunsetDate
  );
};
```

## Detection patterns (regex starting points)

Pattern scans surface candidates; semantic verification (cross-checking against the provider's flag registry, when available) confirms or downgrades each one. Treat unverified pattern hits as `confidence: low`.

```javascript
const flagPatterns = [
  // OpenFeature (vendor-neutral) — TS / JS / Python / Java / .NET share shape
  /OpenFeature\.getClient\(\)\.getBooleanValue\(['"]([^'"]+)['"]/gi,
  /openfeature\.get_client\(\)\.get_boolean_value\(['"]([^'"]+)['"]/gi,

  // LaunchDarkly
  /ldClient\.(boolVariation|variation|stringVariation|jsonVariation)\(['"]([^'"]+)['"]/gi,
  /LdClient\.Bool\(['"]([^'"]+)['"]/gi,

  // Statsig
  /Statsig\.checkGate\(['"]([^'"]+)['"]/gi,
  /statsig_user\.get_config\(['"]([^'"]+)['"]/gi,

  // PostHog
  /posthog\.isFeatureEnabled\(['"]([^'"]+)['"]/gi,
  /posthog\.feature_enabled\(['"]([^'"]+)['"]/gi,

  // Flagsmith / Unleash / GrowthBook / ConfigCat
  /flagsmith\.hasFeature\(['"]([^'"]+)['"]/gi,
  /unleash\.isEnabled\(['"]([^'"]+)['"]/gi,
  /growthbook\.isOn\(['"]([^'"]+)['"]/gi,
  /configCat\.getValueAsync\(['"]([^'"]+)['"]/gi,

  // Local / homegrown
  /featureFlags?\.(is)?[Ee]nabled\(['"]([^'"]+)['"]\)/gi,
  /useFeatureFlag\(['"]([^'"]+)['"]\)/gi,
  /process\.env\.FEATURE_([A-Z_0-9]+)/g,
];
```

## Cross-language audit examples (BAD / SAFE)

The auditor must recognize bad and good flag patterns in every language CTOC supports. Each pair shows a flag-hygiene anti-pattern and its fix.

### C# (.NET 9 — OpenFeature .NET SDK / LaunchDarkly .NET)

```csharp
// BAD: hardcoded boolean; no flag, no owner, no rollout, no kill-switch
if (true) { await chargeCustomerAsync(invoice); }

// BAD: vendor-locked direct LaunchDarkly call, flag name typed as string literal,
// no fallback default if the SDK is offline
if (ldClient.BoolVariation("new-checkout", userCtx)) { ... }

// SAFE: OpenFeature client; provider is configured once at startup so swapping
// LaunchDarkly -> Statsig -> Flagsmith touches one file. Default is the OFF path,
// which matters when the provider is unreachable.
//
// Flag metadata (owner: @payments, sunset: 2026-09-01, type: release) is
// declared in the provider config and validated by the cleanup CI job.
var client = OpenFeature.Api.Instance.GetClient();
bool enabled = await client.GetBooleanValueAsync(
    flagKey: "release-payments-new-checkout-2026q3",
    defaultValue: false,
    context: EvaluationContext.Builder().Set("userId", userId).Build());
if (enabled) { await ChargeCustomerAsync(invoice); }
```

```csharp
// BAD: kill-switch missing for risky path (external API, payments)
public async Task<PaymentResult> Charge(Invoice i) {
    return await _stripe.ChargeAsync(i);   // no escape hatch
}

// SAFE: ops-* kill-switch defaults ON; flipping OFF cuts traffic in < 1 min
public async Task<PaymentResult> Charge(Invoice i) {
    bool live = await _flags.GetBooleanValueAsync(
        "ops-payments-stripe-live", defaultValue: true);
    if (!live) return PaymentResult.Disabled("kill-switch engaged");
    return await _stripe.ChargeAsync(i);
}
```

### Java (21+ — OpenFeature Java / Unleash)

```java
// BAD: flag value hardcoded in test — only the "true" branch is ever exercised
@Test void checkoutPath() {
    Mockito.when(flags.isEnabled("new-checkout")).thenReturn(true);
    assertTrue(checkoutService.process(order).success());
}

// SAFE: parameterized test exercises BOTH branches; flag isolation respected
@ParameterizedTest
@ValueSource(booleans = {true, false})
void checkoutPath(boolean flagOn) {
    Mockito.when(flags.isEnabled("release-checkout-new-2026q3", false))
           .thenReturn(flagOn);
    var result = checkoutService.process(order);
    if (flagOn) assertTrue(result.usedNewPipeline());
    else        assertTrue(result.usedLegacyPipeline());
}
```

```java
// BAD: Unleash call with no default; if the Unleash service is down, this throws
boolean on = unleash.isEnabled("billing-new-invoice-2025q4");

// SAFE: OpenFeature with explicit default and structured context
Client client = OpenFeatureAPI.getInstance().getClient();
boolean on = client.getBooleanValue(
    "release-billing-new-invoice-2026q3",
    false,                                     // explicit safe default
    new MutableContext().add("orgId", orgId));
```

### Python (3.12+ — OpenFeature Python / Flagsmith)

```python
# BAD: flag at 100% from creation, no rollout history, no owner tag, no sunset
# This is a permission-gate disguised as a release flag.
if flagsmith.has_feature("admin_panel"):
    render_admin()

# SAFE: explicit permission flag (long-lived by design), owner + entitlement check.
# Permission flags are legitimately permanent — they should be named `permission-*`
# so the cleanup CI job knows NOT to flag them as stale.
client = openfeature.api.get_client()
allowed = client.get_boolean_value(
    flag_key="permission-admin-panel",
    default_value=False,
    evaluation_context=EvaluationContext(
        targeting_key=user.id,
        attributes={"role": user.role, "org_id": user.org_id},
    ),
)
if allowed:
    render_admin()
```

```python
# BAD: flag check inside a hot loop; SDK call per iteration kills latency
for row in rows:
    if posthog.feature_enabled("new-pricing-2026q1", user.id):
        row.price = compute_new(row)

# SAFE: evaluate once per request and cache locally
client = openfeature.api.get_client()
use_new_pricing = client.get_boolean_value(
    "release-pricing-new-engine-2026q3", False,
    EvaluationContext(targeting_key=user.id),
)
for row in rows:
    row.price = compute_new(row) if use_new_pricing else compute_old(row)
```

### TypeScript (OpenFeature TS / LaunchDarkly Node + React SDK)

```typescript
// BAD: vendor-locked import in every file, string-literal flag key,
// no default value, no owner/sunset metadata in source.
import { LDClient } from 'launchdarkly-node-server-sdk';
const enabled = ldClient.variation('new-checkout', user);   // type: unknown

// SAFE: OpenFeature client; the provider is registered once at bootstrap so
// swapping vendors is a one-line change. Default value enforced.
import { OpenFeature } from '@openfeature/server-sdk';
const client = OpenFeature.getClient();
const enabled = await client.getBooleanValue(
  'release-checkout-new-2026q3',
  false,
  { targetingKey: user.id, plan: user.plan },
);
```

```typescript
// BAD (React): flag read inside render with no memoization; flicker on re-render
function Checkout() {
  const enabled = client.getBooleanValueSync('release-checkout-new-2026q3', false);
  return enabled ? <NewCheckout /> : <OldCheckout />;
}

// SAFE: React hook subscribes once; provider broadcasts changes
import { useBooleanFlagValue } from '@openfeature/react-sdk';
function Checkout() {
  const enabled = useBooleanFlagValue('release-checkout-new-2026q3', false);
  return enabled ? <NewCheckout /> : <OldCheckout />;
}
```

### C / C++ — skip with rationale

Feature flags are rare in C/C++ codebases. Native systems code typically uses compile-time `#ifdef` switches or runtime config files, not flag-management SDKs. The closest analogs (Chromium's `base::Feature`, Mozilla's Nimbus) are tightly bound to those projects' build systems and aren't general-purpose flag platforms. CTOC's audit therefore skips C/C++ for the flag-SDK rule set. If the project IS one of those (Chromium-derived, etc.), surface the finding by hand and document the platform-specific flag store in the plan.

### SQL — skip with rationale

Feature flags are not SQL constructs — they're application-layer toggles. However, when a project stores flag definitions in a settings table (a common pattern for self-hosted Unleash / GrowthBook backends, or homegrown setups), the auditor inspects that table for the same hygiene rules. Example shape:

```sql
-- BAD: flag rows missing owner and sunset_date columns; nothing forces hygiene
CREATE TABLE feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  rollout_pct INT NOT NULL DEFAULT 0
);

-- SAFE: NOT NULL constraints make hygiene non-optional at the schema level.
-- The cleanup CI job queries this table to find stale flags directly.
CREATE TABLE feature_flags (
  key             TEXT      PRIMARY KEY,
  type            TEXT      NOT NULL CHECK (type IN ('release','experiment','ops','permission')),
  owner           TEXT      NOT NULL,              -- @team or @handle
  sunset_date     DATE      NOT NULL,              -- permission-* may use far-future
  rollout_pct     INT       NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  full_rollout_at TIMESTAMP NULL,
  last_evaluated_at TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

## Output Format

```markdown
## Feature Flag Audit Report

### Summary
| Status | Count |
|--------|-------|
| Active (< 100%) | 8 |
| Fully Rolled Out (cleanup window) | 5 |
| Stale (cleanup needed) | 4 |
| Abandoned (0% > 30d) | 2 |
| Orphaned (no usage > 90d) | 1 |
| Missing owner | 3 |
| Missing sunset date | 6 |
| Missing kill-switch (risky path) | 2 |
| **Total flags** | **19** |

### Stale Flags (Cleanup Required)

**1. release-checkout-new-2026q1**
| Property | Value |
|----------|-------|
| Status | 100% enabled |
| Days at 100% | 45 |
| Owner | @checkout-team |
| Sunset (declared) | 2026-04-15 (passed) |
| Files affected | 12 |
| Code branches | new path: live; old path: dead |

**Cleanup steps:**
1. Open PR removing the flag check from 12 files (auto-generated by CI cleanup job)
2. Delete the `<OldCheckout />` component and its tests
3. Delete the flag from the provider AFTER the PR merges
4. Collapse parameterized tests to the surviving branch only

### Orphaned Flags
**experimental-search**
| Property | Value |
|----------|-------|
| Last evaluated | 120 days ago |
| Code references | 0 |
| Recommendation | Delete flag and any leftover dead code |

### Missing Kill-Switch (risky path)
**Payments charge path — `services/payments.py:42`**
- Calls Stripe API directly with no `ops-*` flag wrapper
- Required: add `ops-payments-stripe-live` (defaults ON, < 1 min flip)

### Flag Health Score
| Metric | Value | Target |
|--------|-------|--------|
| Stale flags | 4 | < 2 |
| Avg cleanup time | 60 days | < 30 days |
| Flags missing owner | 3 | 0 |
| Flags missing sunset | 6 | 0 |
| Kill-switches on risky paths | 60% | 100% |
| Both-branch test coverage | 70% | 100% |

### Recommendations
1. Clean up `release-checkout-new-2026q1` — 45 days overdue
2. Delete orphan `experimental-search`
3. Add `ops-*` kill-switch around payments and LLM call paths
4. Backfill `owner` and `sunset_date` on 6 flags missing metadata
5. Migrate vendor-specific SDK calls to OpenFeature so future vendor changes are one file
6. Enable nightly cleanup CI job that auto-opens PRs for stale flags
```

## Tool Integration (2026)

The 2026 ecosystem split two ways: open-standard SDKs (OpenFeature, with provider plugins) and vendor SaaS with bundled analytics. Use OpenFeature in application code; pick the provider on cost and feature fit.

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **OpenFeature SDK** | CNCF incubating; vendor-neutral API across LD/Statsig/PostHog/Flagsmith/Unleash/GrowthBook/ConfigCat; standard hooks for logging, tracing | Provider plugins vary in feature parity; some advanced provider features (LD guarded releases) are exposed via provider extension only | Always — application code calls OpenFeature, not the vendor SDK directly |
| **LaunchDarkly** | Most complete platform; 25+ SDKs; guarded releases (auto-rollback on error spike); approval workflows; audit logs | Pricing scales with MAU and can climb steeply for mid-market deployments; verify current pricing tier before committing | Enterprise / regulated; teams that need approval workflows |
| **Statsig** | Built-in analytics + experimentation; auto-rollback on metric regression; generous free tier on flags | Less mature than LD on enterprise governance | Product-led teams running many experiments |
| **PostHog Feature Flags** | Bundled with PostHog analytics, session replay, A/B testing; generous flag-request free tier | Best when you're already a PostHog analytics user | Startups that want one platform for analytics + flags |
| **Flagsmith** | Open-source self-host or SaaS; low-latency edge API; clean OpenFeature provider | Smaller ecosystem than LD; advanced rules require the paid tier | Mobile / global apps where edge latency matters |
| **Unleash** | Open-source self-host (production-grade); GitOps-friendly | Self-hosting requires ops investment | Teams that want SaaS pricing off the table |
| **GrowthBook** | Open-source self-host; built-in experimentation analysis | Smaller community than LD/Statsig | Experiment-heavy teams that want full data control |
| **ConfigCat** | Flat-rate pricing (no MAU surprises); simple model | Smaller feature surface than LD/Statsig | Cost-conscious teams with predictable usage |

Flag-cleanup automation:
- **piranha** (Uber, OSS) — language-aware automated removal of stale flag branches; supports Java, Swift, Objective-C, Python, Kotlin, TS/JS.
- **flagd** — OpenFeature reference flag daemon; useful for self-hosted setups that want OpenFeature without a vendor.
- **Custom CI cleanup job** — every 24 h, list flags at 100% for > 30 days from the provider API, open PRs that delete the flag check via codemod, merge after CI passes, then delete the flag from the provider via API.

OpenFeature pattern (apply once at boot, then never import a vendor SDK in app code):

```typescript
// bootstrap.ts — the ONLY file that imports a vendor SDK
import { OpenFeature } from '@openfeature/server-sdk';
import { LaunchDarklyProvider } from '@openfeature/launchdarkly-provider';
// To switch vendors later, change ONLY this file.
await OpenFeature.setProviderAndWait(new LaunchDarklyProvider(process.env.LD_SDK_KEY!));
```

```python
# bootstrap.py
from openfeature import api
from openfeature.contrib.provider.flagsmith import FlagsmithProvider
api.set_provider(FlagsmithProvider(environment_key=os.environ["FLAGSMITH_ENV_KEY"]))
```

## Severity (internal triage vs. refinement-loop output)

The auditor's internal report uses triage tiers below to help humans prioritize. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. Triage tiers live in the report body only.

Reconciliation rule: triage CRITICAL items (missing kill-switch on payment / PII / LLM paths, flag controlling auth with no rollout history) are surfaced in BOTH the triage report AND on the wire as `severity: critical`. Triage HIGH/MEDIUM/LOW items are surfaced in the triage report and still emitted to the wire as `severity: critical` — the on-wire field has only one tier. Only `confidence` (high / medium / low) differentiates urgency on the wire.

| Triage tier | Examples | Internal action |
|------|----------|--------|
| CRITICAL | Missing kill-switch on payments / LLM / PII path; flag controlling auth with no rollout history; orphaned flag still wired into prod evaluation logic | BLOCK release |
| HIGH | Stale flag > 60 days at 100%; flag without owner controlling a release; both-branch test coverage absent on a release flag | Fix before next deploy |
| MEDIUM | Stale flag 30–60 days at 100%; flag without sunset date; permission flag misnamed as release | Fix this sprint |
| LOW | Naming-convention violation; flag exists but unused < 30 days; minor metadata gaps on long-lived permission flags | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind+flag_name)[:12]>   # fingerprint for dedup
severity: critical                                            # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                               # high = corroborated; low = pattern-only unverified
engine: openfeature-audit | launchdarkly-api | statsig-api | posthog-api | flagsmith-api | unleash-api | growthbook-api | configcat-api | grep-pattern | manual
kind: orphaned_flag | missing_sunset | missing_owner | missing_kill_switch | no_rollout_strategy | flag_isolation_missing
target_file: src/payments/charge.ts
line: 42
flag_name: release-payments-new-checkout-2026q3
last_modified: 2025-11-04T08:22:00Z          # last provider-side change OR last code-side change, whichever is later
days_at_full_rollout: 45                     # null if not at 100%
last_evaluated_at: 2026-05-12T14:00:00Z      # null if provider doesn't report
owner: "@payments-team"                      # null if missing — drives missing_owner kind
sunset_date: 2026-04-15                      # null if missing — drives missing_sunset kind
corroborated_by: [grep-pattern, launchdarkly-api]   # empty if single-source
suggested_fix: "Open cleanup PR removing flag check from 12 files; delete <OldCheckout/>; remove flag from provider."
reference: https://openfeature.dev/specification/
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a single-source `grep-pattern` hit without provider confirmation stays `confidence: low` until the provider API agrees. Findings with `kind: missing_kill_switch` on payment / PII / LLM paths are always promoted to the `critical` tier internally AND on the wire.

## Red Lines

- NEVER allow a flag to live > 90 days without an owner AND a sunset date.
- NEVER promote a flag to 100% without a cleanup ticket linked to the flag.
- NEVER ship a release with > 5 stale flags.
- NEVER allow a payment / PII / LLM / external-API path to ship without an `ops-*` kill-switch.
- NEVER import a vendor flag SDK directly in application code — always go through OpenFeature.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every flag-hygiene finding (orphaned, missing sunset, missing owner, missing kill-switch, no rollout strategy, flag isolation missing) emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a stale flag today is a customer-visible incident at the next rollback attempt. Code that ships with orphaned flags ships with known latent failures.
