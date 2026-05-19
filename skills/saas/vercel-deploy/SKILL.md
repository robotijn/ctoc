---
name: vercel-deploy
description: Deploy Next.js to Vercel — custom domain, environment variables, preview deployments, edge functions, ISR, monitoring.
type: skill
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
when_to_load:
  - "vercel deploy"
  - "vercel deployment"
  - "deploy to vercel"
  - "custom domain"
  - "preview deployment"
  - "edge function"
  - "ISR"
  - "fluid compute"
  - "vercel env"
related_skills:
  - saas/sentry-errors
  - infrastructure/ci-pipeline-checker
  - specialized/health-check-validator
  - security/secrets-detector
  - frontend/bundle-analyzer
effort_level: low
model_optimized_for: opus-4-7
model: sonnet
tools: Read, Write, Bash
---

# Vercel Deploy (saas skill)

> Production-grade Vercel deployment for Next.js SaaS. Default deploy target of `saas/b2c-subscription`.
> Auto-loaded when the user prompt matches a `when_to_load` trigger.

## Role

You get a Next.js 15 (App Router) SaaS deployed to Vercel with custom domain, HTTPS, per-environment-scoped secrets, preview deployments per PR, Fluid Compute enabled, and basic monitoring (Analytics + Speed Insights + Sentry). Every change ships behind a preview URL before merging to `main`.

## Language coverage rationale (2026)

Vercel hosts JavaScript / TypeScript first-class (Next.js + serverless functions) and Python second-class (Python serverless runtime, FastAPI, Flask). It does not host C#, Java, C, or C++ workloads — those belong on Azure App Service, Cloud Run, Fly.io, or Kubernetes. This skill therefore covers TypeScript and Python in depth, and treats the others as out-of-scope with cross-links to the right platform skills.

- **TypeScript / JavaScript** — full coverage (Next.js 15 App Router, edge vs node runtime, ISR, route config).
- **Python** — full coverage of Vercel Python runtime (FastAPI / Flask handler, requirements pinning, runtime limits).
- **C# / .NET 9** — not hosted by Vercel. Use Azure App Service or Azure Container Apps. See [[saas/azure-deploy]] (planned). Vercel can still host the Next.js frontend that calls a .NET API.
- **Java / Spring Boot** — not hosted by Vercel. Use Cloud Run, Fly.io, or Render. Vercel hosts the frontend only.
- **C / C++** — not hosted by Vercel. Out of scope.
- **SQL** — DB is external (Vercel Postgres, Supabase, Neon, RDS). This skill covers connection-string env var hygiene, not DB internals.

## 2026 Best Practices

- **Fluid Compute is default-on for new projects** — existing projects must opt in via Project Settings. Fluid lets one function instance serve multiple concurrent invocations, so I/O-bound API routes share warm instances and cold-start cost amortizes across requests. Per Vercel's published guidance, typical Next.js App Router apps with DB-backed routes see a meaningful reduction in billed function invocations; cost impact depends on workload shape — measure on your own routes before quoting a number.
- **Concurrency tuning** — Fluid Compute allows tuning concurrency per function via `vercel.json` `functions.<glob>` config. `1` = legacy single-request behavior. Higher values (e.g. `10`) for I/O-bound DB / third-party API routes. The exact config key has evolved; check current Vercel docs before pinning. Leave default unless you have a measured reason to change.
- **Environment scoping is non-negotiable** — Vercel exposes four scopes: Production, Preview, Development, and (branch-specific) Preview overrides. Production secrets MUST never appear in Preview. Use Stripe / Clerk / database staging keys for Preview.
- **`.env.local` is local-only** — never commit. Pair with [[security/secrets-detector]] in CI to catch accidental commits.
- **Sensitive flag for secrets** — when adding via CLI: `vercel env add MY_SECRET production --sensitive`. The value is hidden in the dashboard and cannot be read back via CLI; it can only be overwritten.
- **`vercel env pull` for local parity** — generates `.env.local` from the project's dashboard values. Gitignored by default. Use `vercel env pull --environment=preview` to mirror preview.
- **`vercel env run` for ephemeral access** — runs a one-off command with project env vars injected, without writing them to disk. Use in scripts that need prod-like config briefly.
- **Edge runtime for low-latency, geo-distributed routes** — middleware, auth checks, geo redirects. Edge runtime does NOT support ISR, native Node APIs, or `fs`. Note: as of 2024 Vercel reverted page rendering from Edge back to Node by default (Lee Robinson's public correction) — Node + streaming was measurably faster for typical SSR. Treat Edge as a targeted tool, not the default.
- **Node runtime (default) for ISR, streaming SSR, DB clients, Stripe webhooks** — full Node API surface, longer timeouts (60s on Pro, 300s on Enterprise).
- **Preview deployment per PR** — the GitHub integration creates a unique preview URL per commit. Use Vercel Toolbar to comment + share. Treat preview as a real staging environment with isolated DB.
- **Preview DBs must be isolated** — never point preview at the prod database; use a branch DB (Neon, Supabase, PlanetScale branching) or a dedicated staging DB.
- **Custom domain with HTTPS** — domain in Vercel Dashboard; Let's Encrypt cert auto-provisioned; HTTP→HTTPS redirect automatic; HSTS headers should be explicit in `next.config.ts` for subdomains.
- **Image optimization on** — `next/image` uses Vercel's Image Optimization by default. AVIF + WebP, on-demand resize, cached at the edge.
- **Bundle analyzer in CI** — `@next/bundle-analyzer` runs on PRs; fail the build if first-load JS exceeds a budget. Cross-link [[frontend/bundle-analyzer]].
- **Speed Insights + Analytics** — `@vercel/speed-insights` (Core Web Vitals on real users) and `@vercel/analytics` (pageviews + custom events). Both have free tiers sufficient for early SaaS.
- **Build & Deploy hooks** — for non-Git-driven redeploys (e.g. CMS publish triggers a rebuild). Generated in Project Settings → Git → Deploy Hooks. Treat the URL as a secret (it's an auth token).
- **`vercel.json` is documented infra** — keep it in the repo. Pin `framework`, `installCommand`, route-level `runtime`/`maxDuration`/`memory`, redirects, headers.

## Categories

### 1. Secrets committed in `.env`

Cross-link: [[security/secrets-detector]] catches the commit; this skill catches the deploy-time symptom.

```typescript
// BAD — Next.js project committing .env to the repo
// .env (committed)
DATABASE_URL=postgres://user:RealProdPassword@host/db
STRIPE_SECRET_KEY=sk_live_PLACEHOLDER_DO_NOT_COMMIT
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_PLACEHOLDER

// SAFE — .gitignore includes .env*, real values live only in Vercel Dashboard
// .gitignore
.env
.env.local
.env*.local

// .env.example (committed, placeholders only)
DATABASE_URL=postgres://USER:PASSWORD@HOST/DB
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
```

```python
# BAD — Python on Vercel with committed secrets
# api/index.py
import os
# .env committed alongside
DATABASE_URL = "postgres://user:RealProdPassword@host/db"  # hard-coded — never

# SAFE — read from environment, set values in Vercel Dashboard per scope
DATABASE_URL = os.environ["DATABASE_URL"]   # KeyError on missing var fails the build loudly
```

### 2. Missing env var on Production (build green locally, red on Vercel)

```typescript
// BAD — silent fallback hides a missing prod secret
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "sk_test_default";
// Local has STRIPE_SECRET_KEY in .env.local → works. Vercel Production missing it → ships with test key.

// SAFE — fail closed at module load; build will not start without the var
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error("STRIPE_SECRET_KEY is required");
}
```

```python
# SAFE — use os.environ[] not os.environ.get(); KeyError fails the function
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
```

Validate the full env contract at boot with a schema (Zod for TS, pydantic for Python):

```typescript
// lib/env.ts
import { z } from "zod";
export const env = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
}).parse(process.env);
```

### 3. Runtime mismatch (Edge code uses Node API)

```typescript
// BAD — declares edge runtime but uses Node-only fs
// app/api/report/route.ts
import fs from "node:fs";
export const runtime = "edge";

export async function GET() {
  const data = fs.readFileSync("/tmp/report.csv");   // build/runtime error on edge
  return new Response(data);
}

// SAFE — pick the right runtime for the API surface used
export const runtime = "nodejs";   // default; supports fs, Buffer, Node streams

// OR — if you truly need edge (low latency, simple work), use Web APIs only
export const runtime = "edge";
export async function GET(req: Request) {
  const data = await fetch("https://example.com/data").then(r => r.text());
  return new Response(data);
}
```

Cross-platform rule: Stripe webhook signature verification with `stripe.webhooks.constructEvent` requires the raw body and works fine on Node runtime; on edge it requires the Web Crypto variant. Use `stripe.webhooks.constructEventAsync` on edge, but the safer default is Node runtime for webhooks (longer timeout, full library compatibility).

### 4. ISR on Edge runtime (silently broken)

```typescript
// BAD — ISR + Edge: revalidate is ignored
export const runtime = "edge";
export const revalidate = 3600;   // does nothing on edge

// SAFE — ISR requires Node runtime
export const runtime = "nodejs";
export const revalidate = 3600;
```

### 5. DSN / key not scoped per-environment

```
// BAD — same Sentry DSN in Production and Preview means preview noise pollutes prod alerts
SENTRY_DSN (Production) = https://abc@o1.ingest.sentry.io/123
SENTRY_DSN (Preview)    = https://abc@o1.ingest.sentry.io/123  // same project!

// SAFE — separate Sentry projects (or at minimum, separate environments) per scope
SENTRY_DSN (Production) = https://prodKey@o1.ingest.sentry.io/PROD_PROJECT
SENTRY_DSN (Preview)    = https://stagingKey@o1.ingest.sentry.io/STAGING_PROJECT
```

Same rule applies to Stripe (test vs live), Clerk (test vs prod instance), Resend (sandbox vs prod domain), PostHog (separate dev project), and the database URL.

### 6. Preview deployment hitting Production DB

```typescript
// BAD — single DATABASE_URL applied to all environments
// In Vercel Dashboard: DATABASE_URL scope = Production, Preview, Development (all checked)

// SAFE — separate DATABASE_URL per environment
// Production:  postgres://prod@host/prod_db
// Preview:     postgres://staging@host/preview_branch_db   (Neon/Supabase/PlanetScale branch)
// Development: postgres://dev@localhost/dev_db
```

Branch DBs cost negligibly on Neon / Supabase / PlanetScale free tiers and prevent destructive PRs from touching prod data.

### 7. Missing custom-domain HTTPS / HSTS

```typescript
// SAFE — explicit HSTS for subdomains (apex is auto-handled by Vercel)
// next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default config;
```

### 8. Missing or wrong build command

```json
// BAD — vercel.json missing; Vercel auto-detects but custom monorepo paths break
// (no vercel.json)

// SAFE — explicit config for monorepo / custom build
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm --filter=web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "functions": {
    "app/api/webhooks/stripe/route.ts": {
      "maxDuration": 30,
      "memory": 1024
    },
    "app/api/long-job/route.ts": {
      "maxDuration": 60,
      "memory": 2048
    }
  },
  "redirects": [
    { "source": "/docs", "destination": "/documentation", "permanent": true }
  ]
}
```

### 9. Bloated bundle size

Cross-link: [[frontend/bundle-analyzer]].

```typescript
// BAD — import everything from a barrel; client bundle balloons
import * as Icons from "lucide-react";

// SAFE — specific imports + dynamic where possible
import { Check, X } from "lucide-react";
const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });
```

Wire `@next/bundle-analyzer` to a CI check:

```typescript
// next.config.ts
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default withBundleAnalyzer(config);
```

```bash
# CI step
ANALYZE=true pnpm build
# Fail if first-load JS > budget (use a script reading .next/analyze/*)
```

### 10. Python on Vercel — handler shape

```python
# api/index.py — FastAPI on Vercel Python runtime
from fastapi import FastAPI
import os

app = FastAPI()
DATABASE_URL = os.environ["DATABASE_URL"]

@app.get("/api/health")
def health():
    return {"ok": True}

# Vercel Python runtime expects the module to expose `app` for ASGI frameworks,
# or a `handler(request)` function for raw WSGI/HTTP.
```

```text
# requirements.txt — pin exact versions; no ranges
fastapi==0.115.5
uvicorn==0.32.1
pydantic==2.10.3
```

```json
// vercel.json — declare Python runtime + max duration
{
  "functions": {
    "api/*.py": {
      "runtime": "python3.12",
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

Python runtime caveats: cold starts are slower than Node; no native filesystem persistence; package size limits apply (50MB compressed / 250MB uncompressed). Heavy ML deps belong on a dedicated inference service, not Vercel.

## Implementation pattern

### 1. Connect GitHub repo + create project

```
1. Sign in to Vercel.
2. "Add New" → "Project" → connect GitHub, pick repo.
3. Framework preset: Next.js (auto-detected).
4. Confirm root directory (monorepo? point to apps/web).
5. Do NOT add env vars in the import wizard — add them after via Settings (cleaner audit trail).
```

### 2. Environment variables (per scope)

Via Dashboard (Settings → Environment Variables) or CLI:

```bash
# Add a sensitive prod secret (value hidden, not readable back)
vercel env add STRIPE_SECRET_KEY production --sensitive

# Add a preview-scoped staging secret
vercel env add STRIPE_SECRET_KEY preview --sensitive

# Pull into .env.local for local dev parity
vercel env pull .env.local --environment=development

# Run a one-off command with prod env injected (no file written)
vercel env run -- pnpm db:migrate
```

Per-scope checklist for a typical b2c-subscription SaaS:

| Var | Production | Preview | Development |
|-----|------------|---------|-------------|
| `DATABASE_URL` | prod DB | branch DB | local DB |
| `CLERK_SECRET_KEY` | `sk_live_...` | `sk_test_...` | `sk_test_...` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | `sk_test_...` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | live `whsec_...` | test `whsec_...` | local `whsec_...` (Stripe CLI) |
| `NEXT_PUBLIC_*` (publishable keys) | live | test | test |
| `RESEND_API_KEY` | prod | sandbox domain | sandbox |
| `SENTRY_DSN` | prod project | staging project | staging |
| `POSTHOG_KEY` | prod project | dev project | dev |

### 3. Custom domain

```
1. Project → Settings → Domains → Add yourapp.com.
2. Vercel shows required DNS records (A / ALIAS / CNAME).
3. Add records at DNS provider (Cloudflare: orange-cloud OFF for ALIAS; ON only for CNAME with Vercel-recommended config).
4. Wait for verification (typically minutes).
5. HTTPS auto-provisioned via Let's Encrypt; rotates automatically.
6. Configure redirects: vercel.com → yourapp.com handled in Settings → Domains → Set Primary.
```

### 4. Edge vs Node runtime — decision matrix

| Need | Runtime | Why |
|------|---------|-----|
| ISR (`export const revalidate`) | `nodejs` | Edge does not support ISR |
| `fs` / `Buffer` / `node:*` | `nodejs` | Edge has Web APIs only |
| Stripe webhook (raw body + sig verify) | `nodejs` | Longer timeout, mature SDK path |
| Geo redirect / A/B in middleware | `edge` | Runs at every region; sub-50ms |
| Auth gate that hits an external API | `edge` if simple | Trade: edge is faster globally; node has full API surface |
| DB query via Prisma / Drizzle | `nodejs` | ORMs typically Node-only |
| Streaming SSR | either | Both support streaming; Node measured faster for typical SSR (Lee Robinson, 2024) |

### 5. Function config in `vercel.json`

```json
{
  "functions": {
    "app/api/webhooks/stripe/route.ts": { "maxDuration": 30, "memory": 1024 },
    "app/api/heavy-job/route.ts":       { "maxDuration": 60, "memory": 2048 },
    "app/api/health/route.ts":          { "maxDuration": 5,  "memory": 128 }
  }
}
```

Memory and `maxDuration` are billed; right-size each route.

### 6. ISR for content pages

```typescript
// app/blog/[slug]/page.tsx — Node runtime (default), ISR every hour
export const revalidate = 3600;

export default async function Post({ params }: { params: { slug: string } }) {
  const post = await fetchPost(params.slug);
  return <article>{post.body}</article>;
}

// On-demand revalidation (e.g. from CMS webhook)
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
export async function POST(req: Request) {
  const { slug, secret } = await req.json();
  if (secret !== process.env.REVALIDATION_SECRET) return new Response("Unauthorized", { status: 401 });
  revalidatePath(`/blog/${slug}`);
  return Response.json({ revalidated: true });
}
```

### 7. Analytics + Speed Insights

```bash
pnpm add @vercel/analytics @vercel/speed-insights
```

```tsx
// app/layout.tsx
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### 8. Build & Deploy hooks (CMS triggers rebuild)

```
1. Project → Settings → Git → Deploy Hooks → Create Hook.
2. Pick branch (usually main for prod), name it (e.g. "cms-publish").
3. Vercel returns a URL like https://api.vercel.com/v1/integrations/deploy/PROJECT_PLACEHOLDER/HOOK_PLACEHOLDER.
4. Store in CMS as a secret. Treat the URL as a credential — anyone with it can trigger a deploy.
```

```bash
# Trigger manually
curl -X POST "$VERCEL_DEPLOY_HOOK_URL"
```

### 9. Fluid Compute

```
1. Project → Settings → Functions → Fluid Compute → enable (default-on for new projects post-2025).
2. Optionally tune concurrency in vercel.json:
```

```json
{
  "functions": {
    "app/api/db-heavy/*": { "maxConcurrency": 10 },
    "app/api/cpu-bound/*": { "maxConcurrency": 1 }
  }
}
```

When in doubt, leave concurrency at the platform default; only tune after measuring p50/p99 under load.

### 10. GitHub integration / preview workflow

Once the GitHub app is connected, every PR auto-deploys to `yourapp-pr-NNN-yourteam.vercel.app`. The Vercel bot comments with the URL. Use Vercel Toolbar (browser extension) on previews to leave comments + share state.

## Tool Integration (2026)

| Tool | Use | Cmd / install |
|------|-----|---------------|
| **Vercel CLI** | Local link, env mgmt, preview, prod deploy | `pnpm add -g vercel`; `vercel link`; `vercel`; `vercel --prod` |
| `vercel env` | Per-scope env management | `vercel env add KEY production --sensitive`; `vercel env pull .env.local`; `vercel env run -- <cmd>` |
| `vercel deploy --prod` | Promote a specific commit to prod from CLI | Useful for manual cuts; usually Git push to `main` is the path |
| **Vercel Dashboard** | UI for env, domains, analytics, logs, deployments | vercel.com/dashboard |
| **@next/bundle-analyzer** | Bundle size visualization + CI budget | `pnpm add -D @next/bundle-analyzer`; wire into `next.config.ts` |
| **@vercel/analytics** | Pageviews + custom events | `pnpm add @vercel/analytics` |
| **@vercel/speed-insights** | Core Web Vitals on real users | `pnpm add @vercel/speed-insights` |
| **Vercel Postgres / Neon** | Managed Postgres with branch DBs | Dashboard → Storage → Create |
| **Vercel KV (Redis)** | Edge-friendly KV store | Dashboard → Storage → Create |
| **Vercel Blob** | Object storage (S3-equivalent) | Dashboard → Storage → Create |
| **Vercel Toolbar** | Inline comments + state share on preview deploys | Browser extension; preview-only |
| **Sentry** | Errors + performance | `pnpm add @sentry/nextjs`; cross-link [[saas/sentry-errors]] |

## Verification post-deploy

```bash
# HTTPS works, HTTP redirects
curl -sI http://yourapp.com | grep -E "(HTTP/|Location)"
curl -sI https://yourapp.com | head -5

# Health endpoint responds
curl -s https://yourapp.com/api/health

# HSTS present
curl -sI https://yourapp.com | grep -i strict-transport-security

# Bundle size under budget (run analyzer)
ANALYZE=true pnpm build

# Speed Insights + Analytics receiving (check dashboard after a few minutes of real traffic)
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** for human-readable deploy reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)). The triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------------|----------|-----------------|
| CRITICAL | Prod secret in committed `.env`, prod Stripe key in Preview scope, Preview pointing at Prod DB, missing required env var on Prod (build broken) | BLOCK deploy |
| HIGH | Edge runtime + Node API mismatch, ISR on Edge (silently broken), no HSTS on subdomain, no custom domain (apex on `*.vercel.app`), bundle > budget, missing build command in monorepo | BLOCK release |
| MEDIUM | Same Sentry DSN across scopes, missing `maxDuration` on long route (default 10s fails), no bundle analyzer in CI, missing Speed Insights | Fix soon |
| LOW | Missing redirects (`/docs` → `/documentation`), missing Permissions-Policy header, no Build Hook configured for CMS | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = reproduced on a deploy; low = static-config inference
engine: vercel-deploy
kind: secret_in_repo | missing_env_var | runtime_mismatch | isr_on_edge | dsn_scope_leak | preview_hits_prod_db | missing_https | missing_build_command | bundle_too_large | python_runtime_misconfig
target_file: vercel.json | next.config.ts | .env | app/api/<path>/route.ts | api/<name>.py | requirements.txt
target_line: 42                                       # 0 if config-level / file-level
suggested_fix: "Move STRIPE_SECRET_KEY out of .env (committed) into Vercel Dashboard → Production scope with --sensitive"
related_skills: [security/secrets-detector, frontend/bundle-analyzer, saas/sentry-errors]
reference: https://vercel.com/docs/environment-variables
```

The integrator uses `confidence` to weight findings — a `confidence: low` static-config inference doesn't block phase advancement alone; a reproduced deploy failure (`confidence: high`) does. `delta_to_baseline` may also be set if the project keeps a `.security/baseline.sarif` or equivalent deploy-baseline file.

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every Vercel deploy warning, build warning, deprecation notice, missing-env-var warning, and runtime-mismatch warning emits as `severity: critical` in the letter to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a Vercel deploy warning today is a customer-facing 500 tomorrow. Code that ships green-with-warnings ships with known latent failures.

## Sources

- [Vercel Next.js docs](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Managing environment variables across environments](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Vercel CLI `env` reference](https://vercel.com/docs/cli/env)
- [Edge Runtime](https://vercel.com/docs/functions/runtimes/edge)
- [Vercel Runtimes overview](https://vercel.com/docs/functions/runtimes)
- [Streaming from Node.js and Edge on Vercel](https://vercel.com/blog/streaming-for-serverless-node-js-and-edge-runtimes-with-vercel-functions)
- [Vercel custom domains](https://vercel.com/docs/projects/domains)
- [Production checklist for launch](https://vercel.com/docs/production-checklist)
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute) (per Vercel published guidance; measure your own workload before quoting savings)
- [Lee Robinson note: Edge rendering reverted to Node default (2024)](https://x.com/leerob/status/1780705942734331983)
