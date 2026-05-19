---
name: bundle-analyzer
description: Analyzes JavaScript bundle size, enforces performance budgets, finds tree-shaking failures, code-split gaps, and budget regressions in CI.
type: skill
when_to_load:
  - "bundle size"
  - "bundle analysis"
  - "performance budget"
  - "analyze bundle"
  - "tree shaking"
  - "bundle audit"
  - "code splitting"
  - "dynamic import"
  - "size-limit"
related_skills:
  - frontend/component-tester
  - frontend/visual-regression-checker
  - frontend/dead-code-detector
  - quality/performance-validator
  - specialized/performance-profiler
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Bundle Analyzer (skill)

> Converted from agents/frontend/bundle-analyzer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You analyze JavaScript bundles and find optimization opportunities that block customers — oversized initial loads, missing route-level code splits, tree-shaking failures, full-library imports, CommonJS contamination, and silent budget regressions on PRs. You assume every byte over budget is a measurable hit to conversion until proven otherwise.

## 2026 Best Practices (Frontend category)

- **Bundle budget per route, not just per app**: the canonical 2026 default is **<200 KB gzipped initial JS** for the landing route. Per-route chunks should stay under ~100 KB gz; total transferred JS under ~500 KB gz. Enforce with `size-limit` or `bundlemon` in CI; a failed budget should **block the PR**, not warn.
- **Route-based code-splitting is table stakes**: every major route is a dynamic `import()` boundary. Component-level splitting is layered on top for heavy widgets (charts, editors, modals, admin panels). Rule of thumb: only split components ≥ ~30 KB; smaller splits add HTTP overhead without benefit.
- **Lazy-load anything below the fold**: dialogs, drawers, image galleries, rich-text editors, data-grid features, analytics SDKs not needed for first paint. Use `React.lazy` + `Suspense`, Vue `defineAsyncComponent`, Svelte `{#await import(...)}`, or Next.js `next/dynamic`.
- **Tree-shaking only works with ESM + side-effect-free packages**: every package in `dependencies` should be ESM-first and declare `"sideEffects": false` (or a narrow allowlist) in its `package.json`. A single CommonJS package in a hot import path can disable tree-shaking for the whole subgraph.
- **Prefer ESM imports; never import a whole library**: `import _ from 'lodash'` pulls in ~70 KB even if you use one function. Use `import { get } from 'lodash-es'`, native ES2023+ equivalents (`?.`, `??`, `structuredClone`, `Object.groupBy`), or focused replacements (dayjs for moment, date-fns/fp for date-fns).
- **Bundle analyzer in CI on every PR**: shift-left bundle review. A 5 KB regression caught at PR review is cheap; the same regression after release costs an emergency rollback. Run `@next/bundle-analyzer`, `vite-bundle-visualizer`, or `rollup-plugin-visualizer` and diff against the baseline.
- **RUM bundle-size tracking in production**: synthetic budgets catch what you measured at build time. Real-User Monitoring catches what users actually downloaded after CDN edge transforms, A/B tests, and dynamic feature flags. **Vercel Speed Insights** ships real-user Web Vitals out of the box on Vercel; **Datadog RUM** correlates bundle changes with Web Vitals deltas via Git commit tagging — pinpointing the commit that regressed LCP.
- **Source maps uploaded for production debugging**: production builds minify; without source maps you cannot resolve a stack frame or attribute a bundle byte to its source file. Upload source maps to your error tracker (Sentry, Datadog) but keep them off the public CDN — they leak source code.
- **`esbuild --metafile` and `--analyze` are the lingua franca**: every bundler can emit a metafile. Pipe it into `esbuild-visualizer`, `rollup-plugin-visualizer`, or `bundle-stats` and you have a consistent diff surface across Webpack, Vite, Turbopack, Rollup, esbuild, and Bun.

## Code-split, tree-shake, and budget categories

> Ordered by frequency of regression on a typical 2026 app: full-library imports and missing route splits are the most common single-PR regressions; CommonJS-in-tree-shake-path and budget regressions are the slower, more insidious ones.

### 0. Full-library imports — TOP OFFENDER

```typescript
// BAD (TypeScript / Next.js / Vite / Webpack / Rollup / Bun — all bundlers): pulls full lodash even if tree-shaking is on
import _ from 'lodash';
const v = _.get(obj, 'a.b.c');

// BAD: moment is not tree-shakeable — ships locales + all APIs (~280 KB raw, ~70 KB gz)
import moment from 'moment';
moment().format('YYYY-MM-DD');

// SAFE: lodash-es (ESM-first, tree-shakes) — or per-method import on classic lodash
import { get } from 'lodash-es';
const v = get(obj, 'a.b.c');

// SAFE: dayjs (~2 KB gz) — drop-in for most moment use cases
import dayjs from 'dayjs';
dayjs().format('YYYY-MM-DD');

// BEST: native ES2023+
const v = obj?.a?.b?.c;
```

Edge cases: `lodash` (CommonJS, not tree-shakeable by default — must use `lodash-es` or `babel-plugin-lodash`), `moment` (no tree-shaking ever), `@mui/icons-material` (per-icon imports required: `import MenuIcon from '@mui/icons-material/Menu'` not `import { Menu } from '@mui/icons-material'`), `date-fns` v3 (ESM by default but old-style `import * as df` defeats it), `rxjs` (deep operator imports required), `firebase` v9+ (modular SDK; never `import firebase from 'firebase/app'` without per-module imports).

### 1. Missing route-level code split

```typescript
// BAD: AdminPanel ships in the main bundle for every visitor, even though < 1% reach it
import AdminPanel from './AdminPanel';

function App() {
  return <Routes><Route path="/admin" element={<AdminPanel />} /></Routes>;
}

// SAFE (React 18+): React.lazy + Suspense
import { lazy, Suspense } from 'react';
const AdminPanel = lazy(() => import('./AdminPanel'));

function App() {
  return (
    <Routes>
      <Route path="/admin" element={
        <Suspense fallback={<Spinner />}><AdminPanel /></Suspense>
      } />
    </Routes>
  );
}

// SAFE (Next.js App Router): next/dynamic with ssr toggle as needed
import dynamic from 'next/dynamic';
const AdminPanel = dynamic(() => import('./AdminPanel'), { ssr: false });

// SAFE (Vite + Vue Router 4): lazy route
const router = createRouter({
  routes: [{ path: '/admin', component: () => import('./AdminPanel.vue') }],
});

// SAFE (SvelteKit): file-based routing already code-splits per route; verify
// by inspecting .svelte-kit/output/client/_app/immutable/nodes/<route>.js sizes.
```

Edge cases: route-level split that re-imports the heavy module synchronously from a shared layout (defeats the split), `next/dynamic` with `{ ssr: true }` that still bundles the component into the server payload, eager `import('./AdminPanel')` at module top level (browser pre-fetches but still defers — verify intent).

### 2. Below-the-fold and modal lazy loading

```typescript
// BAD: heavy chart library imported eagerly, ships in initial bundle
import { Chart } from 'chart.js';
import { Editor } from '@tinymce/tinymce-react';

// SAFE: dynamic import on user interaction
const handleOpenEditor = async () => {
  const { Editor } = await import('@tinymce/tinymce-react');
  setEditor(Editor);
};

// SAFE (Vue 3): defineAsyncComponent
import { defineAsyncComponent } from 'vue';
const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'));

// SAFE (Svelte): {#await import(...)}
{#await import('./HeavyChart.svelte') then mod}
  <svelte:component this={mod.default} {data} />
{/await}
```

Edge cases: dialogs that import their content eagerly but only render on `open === true` (still in the bundle — wrap the import too), analytics SDKs (`posthog-js`, `mixpanel-browser`) loaded before user consent (also a privacy issue — coordinate with [[input-validation-checker]]).

### 3. CommonJS in a tree-shake-required path

```typescript
// BAD: package is CJS-only — tree-shaking is disabled for everything it touches
// package.json of `legacy-utils`:
//   { "main": "index.js", "type": "commonjs" }   // no "module", no "exports", no "sideEffects"
import { oneFunctionINeed } from 'legacy-utils';

// SAFE: vendor an ESM wrapper, or pick an ESM alternative, or ask upstream to add an "exports" map
// package.json of `modern-utils`:
//   { "type": "module", "exports": { ".": "./index.js" }, "sideEffects": false }
import { oneFunctionINeed } from 'modern-utils';
```

How to detect: `npx are-the-types-wrong .` and `npx publint` flag dual-package hazards. `npm ls --json | jq` for `"type": "commonjs"` entries. In Vite, `optimizeDeps` warnings about CJS interop are a red flag.

### 4. Bundle budget regression on PR

```yaml
# .github/workflows/bundle-budget.yml — block PR if budget exceeded
name: Bundle Budget
on: [pull_request]
jobs:
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npx size-limit              # exits non-zero if any entry exceeds
```

```javascript
// .size-limit.cjs — explicit budget per route entry, not just the global
module.exports = [
  { name: 'app/landing',  path: 'dist/landing-*.js',  limit: '180 KB', gzip: true },
  { name: 'app/dashboard', path: 'dist/dashboard-*.js', limit: '220 KB', gzip: true },
  { name: 'app/admin',    path: 'dist/admin-*.js',    limit: '300 KB', gzip: true },
  { name: 'vendor',       path: 'dist/vendor-*.js',   limit: '180 KB', gzip: true },
];
```

Edge cases: budgets defined only on the total bundle (misses one route exploding while others shrink), gzip vs Brotli (always measure both — Brotli is ~15-20% smaller; CDNs serve Brotli to modern clients), pre-compressed vs runtime-compressed (measure post-CDN bytes via RUM if possible).

### 5. Missing source-map upload for production debugging

```javascript
// BAD: minified production bundle ships, source maps either disabled or public
// vite.config.ts:
//   build: { sourcemap: false }    // can't debug prod
// or
//   build: { sourcemap: true }     // sourcemaps deployed to CDN — leaks source

// SAFE: emit sourcemaps, upload to Sentry/Datadog, then strip from the deploy
// vite.config.ts:
build: {
  sourcemap: 'hidden',             // emits .map but no //# sourceMappingURL=
}
// Upload step (Sentry example):
// npx sentry-cli sourcemaps upload --release=$GIT_SHA dist/
// Then exclude dist/**/*.map from the deploy artifact.
```

Datadog RUM: upload via `datadog-ci sourcemaps upload --service=<name> --release-version=$GIT_SHA dist/`.

### 6. Unused-but-bundled dependencies

Cross-link with [[dead-code-detector]]. Patterns:
- `dependencies` entry never imported anywhere in `src/` (run `npx depcheck`)
- Polyfills loaded eagerly when `browserslist` already excludes the targets
- Internationalization packages bundling all locales (`moment/locale/*` is the classic — use `dayjs` and import only needed locales)
- Icon libraries shipping the full set when only a handful are used (`@mui/icons-material` whole-package import, `lucide-react` without per-icon imports on older versions)
- A/B test variants left in the bundle after the experiment shipped

### 7. Bundler-specific traps

```typescript
// Webpack 5: misconfigured optimization.splitChunks pushes vendor + shared into one huge chunk
// webpack.config.js
optimization: {
  splitChunks: {
    chunks: 'all',
    maxInitialRequests: 25,
    minSize: 20000,
    cacheGroups: {
      vendor:  { test: /[\\/]node_modules[\\/]/, name: 'vendor', priority: -10 },
      common:  { minChunks: 2, priority: -20, reuseExistingChunk: true },
    },
  },
},

// Vite (Rollup under the hood): manualChunks for predictable vendor splitting
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        react: ['react', 'react-dom'],
        query: ['@tanstack/react-query'],
      },
    },
  },
},

// Turbopack (Next.js 15+ default): no manualChunks knob — relies on heuristics.
// Verify with `next build` + ANALYZE=true and adjust route-level dynamic imports
// rather than fighting the bundler.

// esbuild: emit a metafile for analysis
// build.mjs
await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  splitting: true,                  // required for code splitting
  format: 'esm',                    // required for tree-shaking
  outdir: 'dist',
  metafile: true,                   // writes meta.json
  minify: true,
});
// Analyze: npx esbuild-visualizer --metadata meta.json --filename report.html

// Rollup: same metafile via rollup-plugin-visualizer
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })];

// Bun bundler: `bun build --target=browser --splitting --outdir=dist`
// Then run `bunx source-map-explorer dist/*.js` to attribute bytes.
```

### 8. Blazor WebAssembly bundle (C#)

Blazor WASM ships .NET runtime + IL — different shape than JS bundling, but the same budget discipline applies.

```csharp
// BAD: default Blazor WASM publish — full ICU data, no AOT, no trimming review
// Project.csproj
<PropertyGroup>
  <TargetFramework>net9.0</TargetFramework>
  <!-- no trimming hints, no relinking, no BlazorWebAssemblyLoadAllGlobalizationData=false -->
</PropertyGroup>

// SAFE: tighten the publish — trim, AOT for hot paths, invariant globalization where allowed
<PropertyGroup>
  <TargetFramework>net9.0</TargetFramework>
  <PublishTrimmed>true</PublishTrimmed>
  <TrimMode>full</TrimMode>
  <RunAOTCompilation>true</RunAOTCompilation>             <!-- larger .wasm, faster runtime; profile both -->
  <BlazorWebAssemblyLoadAllGlobalizationData>false</BlazorWebAssemblyLoadAllGlobalizationData>
  <InvariantGlobalization>true</InvariantGlobalization>   <!-- only if app doesn't need locale-aware formatting -->
  <WasmStripILAfterAOT>true</WasmStripILAfterAOT>
  <CompressionEnabled>true</CompressionEnabled>           <!-- Brotli static files -->
</PropertyGroup>
```

Edge cases: trimming silently removes types only referenced via reflection (JSON deserialization, DI containers) — annotate with `[DynamicallyAccessedMembers]` or switch to source-generated `System.Text.Json` contexts; AOT bloats `.wasm` 2-3× but cuts startup time — measure both bundle size and TTI before deciding; lazy-load assemblies via `BlazorWebAssemblyLazyLoad` for routes most users never hit.

### 9. Not in scope (skip)

This skill targets **JS/TS browser bundles and Blazor WASM**. Java, Python, C, C++, SQL have no browser bundle surface; their analogous concerns (JAR/uber-JAR size, Python wheel size, native binary size) belong to other skills. Do not emit findings for those file types.

## Scan Methodology

### Phase 1: Identify the bundler and entry surface

```bash
# Detect the bundler
test -f next.config.js -o -f next.config.mjs && echo "Next.js"
test -f vite.config.ts -o -f vite.config.js && echo "Vite"
test -f webpack.config.js && echo "Webpack"
test -f rollup.config.mjs && echo "Rollup"
test -f turbo.json && echo "Turbo (monorepo)"
grep -l "esbuild" package.json && echo "esbuild"
grep -l "\"bun\"" package.json && echo "Bun"
```

### Phase 2: Build with analysis enabled

```bash
# Next.js
ANALYZE=true npm run build                                          # @next/bundle-analyzer

# Vite
npx vite-bundle-visualizer                                          # or rollup-plugin-visualizer in vite.config

# Webpack 5
npx webpack --json > stats.json && npx webpack-bundle-analyzer stats.json

# esbuild
node build.mjs && npx esbuild-visualizer --metadata meta.json --filename report.html

# Rollup standalone
npx rollup -c && open stats.html                                    # rollup-plugin-visualizer output

# Bun
bun build src/main.tsx --outdir=dist --splitting --target=browser
npx source-map-explorer dist/*.js

# Blazor WASM
dotnet publish -c Release && du -sh bin/Release/net9.0/publish/wwwroot/_framework/
```

### Phase 3: Budget enforcement

```bash
# size-limit — pre-PR gate
npx size-limit --json > size-report.json

# bundlemon — alternative with PR comments
npx bundlemon --config bundlemon.config.json

# Lighthouse CI — broader performance budget, not just bundle bytes
npx @lhci/cli autorun --config=lighthouserc.json
```

### Phase 4: RUM verification (post-deploy)

```bash
# Vercel Speed Insights — automatic on Vercel projects; reads navigation timing + LCP/CLS/INP
# Confirm enabled: vercel.json or Next.js layout includes @vercel/speed-insights

# Datadog RUM — tag deploys with Git SHA so bundle changes correlate with Web Vitals deltas
datadog-ci sourcemaps upload --service=web --release-version=$GIT_SHA dist/
```

## Size Thresholds (internal triage)

These tiers drive the **internal triage view** for the human-readable scan report. The refinement-loop letter uses `severity: critical` for every finding per warnings-are-bugs (see Severity reconciliation below).

| Bundle layer | Warning | Error |
|--------------|---------|-------|
| Initial JS (landing route) | > 200 KB gz | > 500 KB gz |
| Initial CSS | > 50 KB gz | > 150 KB gz |
| Per-route chunk | > 100 KB gz | > 250 KB gz |
| Vendor chunk | > 180 KB gz | > 400 KB gz |
| Total transferred JS | > 500 KB gz | > 1 MB gz |
| Blazor WASM `_framework` (after Brotli) | > 1.5 MB | > 3 MB |
| Single dynamic-imported chunk | > 50 KB gz | > 150 KB gz |

## Output Format

```markdown
## Bundle Analysis Report

### Size Summary (gzipped)
| Metric | Size | Budget | Status |
|--------|------|--------|--------|
| Initial JS (/) | 240 KB | 200 KB | OVER (+20%) |
| Vendor chunk | 175 KB | 180 KB | OK |
| /admin route | 310 KB | 250 KB | OVER (+24%) |
| Total JS | 720 KB | 500 KB | OVER (+44%) |

### Top Offenders
| Package | Bundle bytes | % of total | Notes |
|---------|--------------|------------|-------|
| moment | 70 KB gz | 10% | Full library — replace with dayjs |
| @mui/icons-material | 55 KB gz | 8% | Whole-package import; switch to per-icon |
| lodash (CJS) | 24 KB gz | 3% | Disables tree-shaking; switch to lodash-es |

### Issues Found
1. **Full-library import: moment.js**
   - File: src/utils/format.ts:3
   - Current: `import moment from 'moment'`
   - Fix: `import dayjs from 'dayjs'`
   - Savings: ~68 KB gz

2. **Missing route split: /admin**
   - File: src/App.tsx:12
   - Current: eager `import AdminPanel from './AdminPanel'`
   - Fix: `const AdminPanel = lazy(() => import('./AdminPanel'))`
   - Savings: ~110 KB gz from landing route

3. **Bundle budget regression on PR**
   - Route: /dashboard
   - Baseline: 195 KB gz · Current: 240 KB gz · Budget: 200 KB gz
   - Block this PR.

### Recommendations (ranked by gz savings)
1. Replace moment with dayjs — **-68 KB**
2. Lazy-load /admin — **-110 KB** off landing
3. Switch lodash → lodash-es — **-12 KB and re-enables tree-shaking for the rest of the graph**

**Total potential savings: 190 KB gz (~32% of total).**
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **@next/bundle-analyzer** | Zero-config on Next.js; treemap per route entry | Next.js only | Every PR on Next.js apps |
| **vite-bundle-visualizer** | One command, no config; runs against any Vite build | Vite only; static HTML output | Local + CI on Vite apps |
| **rollup-plugin-visualizer** | Works on Rollup, Vite, and SvelteKit; gz + Brotli sizes | Requires plugin config | Vite/Rollup pipelines |
| **webpack-bundle-analyzer** | Treemap of any Webpack build; supported by webpack 4 + 5 | Webpack only; requires stats.json | Webpack apps |
| **source-map-explorer** | Bundler-agnostic — works against any minified JS + sourcemap | Single-file analysis; clunky on chunked output | Bun, Parcel, ad-hoc inspection |
| **size-limit** | CI gate; per-entry budgets in `.size-limit.cjs`; supports gz + Brotli | Static analysis only; doesn't catch runtime-loaded chunks | Every PR — block on budget exceedance |
| **bundlemon** | Per-PR comments; tracks budget history over time | Requires GitHub app or self-hosted | Teams that want trend visibility |
| **esbuild --metafile** | Native to esbuild; feeds esbuild-visualizer, bundle-stats | Esbuild only | Esbuild-driven pipelines |
| **Lighthouse CI** | Broader performance budget — LCP, TBT, CLS, INP, not just bytes | Slower than size-limit; needs a deployed URL | Pre-release + nightly |
| **Vercel Speed Insights** | Zero-config real-user Web Vitals on Vercel; per-route attribution | Vercel-only; correlates Web Vitals not raw bundle bytes | Production RUM on Vercel deployments |
| **Datadog RUM** | Correlates bundle changes with Web Vitals deltas via Git commit tagging; works on any host | Datadog SDKs historically have bundler-compat caveats with esbuild/webpack — verify with current docs | Production RUM, especially off-Vercel |
| **depcheck** | Finds unused `dependencies` declared but never imported | False positives on transitive-only imports | Quarterly cleanup |
| **publint / are-the-types-wrong** | Flags CJS-only packages, dual-package hazards, broken `exports` maps | Library-author tooling; useful for picking deps | When evaluating a new dependency |

Aggregate `size-limit` JSON, `bundlemon` reports, and Lighthouse CI assertions into the PR comment so reviewers see one unified gate. Pin a CI step that **fails the build** whenever this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------------|----------|---------------------------------|
| CRITICAL | Initial JS > 2× budget, bundle budget regression on PR, full-library `moment`/`lodash` default import, source maps shipped to public CDN | BLOCK PR |
| HIGH | Initial JS > budget but < 2×, missing route-level code split for a route > 100 KB gz, CJS package in a hot import path that disables tree-shaking | BLOCK PR |
| MEDIUM | Below-the-fold component imported eagerly, unused dependency in `package.json`, missing source-map upload to error tracker | Fix this sprint |
| LOW | Sub-optimal `manualChunks` config (works but suboptimal), per-route chunk in the 80-100 KB warning band, missing Brotli pre-compression on static assets | Backlog |

A budget regression that crosses the **error tier** is non-negotiable: the PR is blocked until the regression is fixed or the budget is explicitly raised with a documented justification in the plan's `## Decisions Taken Under Ambiguity` section.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = budget exceeded with sourcemap-verified attribution
engine: size-limit | bundlemon | next-bundle-analyzer | vite-bundle-visualizer | rollup-visualizer | webpack-bundle-analyzer | esbuild-metafile | source-map-explorer | lighthouse-ci | vercel-speed-insights | datadog-rum | manual
kind: full-library-import | missing-route-split | missing-lazy-load | cjs-in-tree-shake-path | budget-regression | source-map-missing | unused-dependency | manual-chunks-misconfig | blazor-wasm-bloat
target_file: src/App.tsx                            # source file where the issue originates (when traceable)
line: 12                                             # 1-indexed; null if not source-attributable
bundle_path: dist/landing-abc123.js                 # the chunk that exceeded or contains the regression
current_size: 240KB gz                              # measured size (state units explicitly)
budget: 200KB gz                                    # configured budget for this entry (null if no budget set)
delta_to_baseline: +45KB gz | unchanged | -12KB gz  # vs. previous PR baseline; null if no baseline
route: /dashboard                                   # route this chunk serves, if route-attributable
suggested_fix: "Replace `import moment from 'moment'` with `import dayjs from 'dayjs'`; expected savings ~68KB gz"
reference: https://web.dev/articles/your-first-performance-budget
```

The integrator uses `confidence` and `delta_to_baseline` to weight findings — a low-confidence single-source finding doesn't block phase advancement on its own, but a `delta_to_baseline: +N KB` regression always does. `current_size` and `budget` are reported with explicit units (KB gz, KB raw, MB) to prevent unit-mismatch bugs at the integrator.

## Special Considerations

- **Server bundles vs client bundles**: Next.js App Router and Remix ship distinct server and client bundles. This skill targets the **client** bundle. A 500 KB server bundle is fine if it never reaches the browser. Verify via `.next/analyze/client.html` vs `server.html`.
- **Edge runtimes**: Vercel Edge Functions and Cloudflare Workers have separate bundle limits (1 MB and 1-10 MB respectively, depending on plan). Flag bundles approaching the edge limit as a hard regression class.
- **Development mode is not production**: never base a finding on a dev build. Always measure a `--mode production` / `NODE_ENV=production` build with minification and tree-shaking enabled.
- **Brotli vs gzip**: modern CDNs serve Brotli to ~95%+ of clients. Measuring only gzip overstates the bytes-on-wire. Report both when available.
- **A/B test variants**: experimental code paths often remain in the bundle after the experiment concluded. Coordinate with [[dead-code-detector]] to prune.
- **Source-map leakage**: source maps deployed to the public CDN expose your source code. Always use `sourcemap: 'hidden'` (Vite) / `devtool: 'hidden-source-map'` (Webpack) + uploader-only sourcemap distribution.

## Red Lines

- NEVER allow a PR to merge that crosses the error-tier size threshold without an explicit, documented budget raise.
- NEVER replace a heavy dependency without measuring the actual gz delta against a production build.
- NEVER ship a route bundle > 250 KB gz without a documented reason.
- NEVER deploy source maps to the public CDN. Upload to error tracker only; exclude from public artifacts.
- NEVER claim a savings number from a dev build — production-only.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
