---
title: "Frameworks dimension wave 1 — top web frameworks capability data, enriched into the stack"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00046-exp-db-w2fix-migration-heuristic
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - "src/lib/stack-detector.js"
  - "src/hooks/SessionStart.js"
  - ".ctoc/capabilities/frameworks/nextjs.yaml"
  - ".ctoc/capabilities/frameworks/react.yaml"
  - ".ctoc/capabilities/frameworks/vue.yaml"
  - ".ctoc/capabilities/frameworks/angular.yaml"
  - ".ctoc/capabilities/frameworks/svelte.yaml"
  - ".ctoc/capabilities/frameworks/astro.yaml"
  - ".ctoc/capabilities/frameworks/nuxt.yaml"
  - ".ctoc/capabilities/frameworks/remix.yaml"
  - ".ctoc/capabilities/frameworks/express.yaml"
  - ".ctoc/capabilities/frameworks/nestjs.yaml"
  - ".ctoc/capabilities/frameworks/fastify.yaml"
  - ".ctoc/capabilities/frameworks/django.yaml"
  - ".ctoc/capabilities/frameworks/fastapi.yaml"
  - ".ctoc/capabilities/frameworks/flask.yaml"
  - ".ctoc/capabilities/frameworks/rails.yaml"
  - ".ctoc/capabilities/frameworks/laravel.yaml"
  - ".ctoc/capabilities/frameworks/spring-boot.yaml"
  - ".ctoc/capabilities/frameworks/phoenix.yaml"
  - ".ctoc/capabilities/schema.md"
  - "tests/capability-frameworks.test.js"
---

# Frameworks dimension — wave 1 (mirror the databases sub-program)

The frameworks dimension is a multi-wave sub-program (full-pipeline-integration path). THIS
wave adds the frameworks capability dimension (18 top web frameworks) + engine + a LIVE
consumer (the stack summary shows each detected framework's category + security posture).
FW-w2 adds framework-specific security CHECKS. FW-w3 adds the top-25 DS/ML frameworks.

Mirror the databases sub-program EXACTLY (read plan 00044 + the databases code first). Do NOT
change stack-detector's existing `frameworks: string[]` field shape (SessionStart +
build-coverage-map consume detectStack) — ADD an enrichment path like databases did.

## The 18 framework capability YAMLs (.ctoc/capabilities/frameworks/*.yaml, web-grounded 2026)
Schema (add a frameworks contract to schema.md):
```yaml
framework: nextjs
category: web-fullstack      # web-frontend | web-backend | web-fullstack | api | test
language: typescript
deps: [next]                 # detection dep names (stack-detector already knows these)
files: [next.config.js, next.config.mjs, next.config.ts]   # config markers
security:
  concerns: [security-headers, env-exposure, ssrf, auth-middleware]   # framework-specific areas
  # FW-w2 turns `concerns` into real checks; wave 1 records them honestly.
test: "next lint && vitest"  # framework test/lint hint (or the conventional runner)
configScaffold: [next.config.ts, .env.example, middleware.ts]
verified: web-2026-07
```
The 18 (web-grounded): nextjs, react, vue, angular, svelte, astro, nuxt, remix (frontend/
fullstack); express, nestjs, fastify (Node backend); django, fastapi, flask (Python);
rails (Ruby); laravel (PHP); spring-boot (Java); phoenix (Elixir). Each carries category +
language + deps + files + security.concerns + configScaffold. Every value web-grounded or
UNVERIFIED honestly (e.g. a framework whose canonical test runner varies → note it).

## Engine (src/lib/capability-registry.js)
Add `loadFrameworks(projectRoot)` (mirror loadDatabases: bundled + override, fail-open,
zero-warning) and `frameworkCapability(name, projectRoot)`. Export both; live caller below.

## Detection enrichment (src/lib/stack-detector.js) — do NOT change the frameworks field shape
stack-detector already detects framework NAMES via FRAMEWORK_PATTERNS. Add
`frameworkCapabilities(projectPath)`: for each detected framework name, look up its registry
capability (category + security.concerns) and return the enriched objects. Add a
`frameworkCapabilities` field to detectStack's return ADDITIVELY (keep `frameworks: string[]`
and languages/primary UNCHANGED — regression guard: build-coverage-map + SessionStart unbroken).

## Live consumer (src/hooks/SessionStart.js)
Extend the framework render (or add a line) to show each detected framework's security posture
from frameworkCapabilities (e.g. "Frameworks: Next.js (security-headers, auth-middleware)").
Additive only — keep hooks.test.js green, do not change the existing output contract.

## TDD-Red FIRST
`tests/capability-frameworks.test.js` (real temp-dir fixtures, zero mocks): all 18 load with
zero warnings + carry category/language/security.concerns/configScaffold; loadFrameworks +
frameworkCapability work; a package.json with `next` → detectStack.frameworkCapabilities
includes nextjs enriched; a `django`/`manage.py` project → django enriched; detectStack keeps
`frameworks` (string[]) and languages unchanged; every verified is web-2026-07 or UNVERIFIED.
Run RED first.

## Decisions Taken Under Ambiguity (executor, FW-w1)
1. **Enrichment is REGISTRY-driven, not FRAMEWORK_PATTERNS-name-driven.** The plan text
   says "for each detected framework name, look up its registry capability". The legacy
   `detectFrameworks` uses a display name (`next.js`) that does NOT match the registry key
   (`nextjs`), and FRAMEWORK_PATTERNS knows only 13 of the 18 frameworks (it lacks astro,
   nuxt, remix, fastify, phoenix). Iterating detected names would therefore leave 5 registry
   frameworks permanently dead AND force a `next.js`↔`nextjs` name-mapping. Instead
   `frameworkCapabilities` mirrors `detectDatabases` EXACTLY — it drives off the capability
   REGISTRY (the single source of truth), matching each framework's `deps` (node + python)
   OR its `files` config markers. This makes all 18 reachable, sidesteps the name collision,
   and is the faithful databases mirror. The legacy `frameworks: string[]` field is untouched
   (still emits `next.js`); the enriched field is the additive `frameworkCapabilities`.
2. **`react`, `express`, `fastify` flagged `verified: UNVERIFIED`.** These ship no canonical
   config file and no bundled test runner — the runner genuinely varies (vitest / jest / tap /
   node:test), so the `test` hint is not a CI guarantee. Category/language/deps/concerns are
   web-grounded; the entry-level `verified` token is the honest place to record that the whole
   entry is not a single verifiable CI invocation (the mysql.yaml precedent).
3. **`spring-boot` and `phoenix` flagged `verified: UNVERIFIED` and detection-limited.** Their
   dependencies live in build files CTOC does not parse (pom.xml/build.gradle, mix.exs), and
   the test command varies (Maven vs Gradle). spring-boot carries `application.yml/.properties`
   markers (Spring convention, best-effort); phoenix has NO unique root marker distinct from a
   plain Elixir app, so `files: []` — the registry DATA loads and is reachable, but automatic
   detection is limited until a build-file dep parser exists. Honest, not fabricated.
4. **`files` markers pruned to framework-specific ones.** Generic bundler markers
   (`vite.config.ts`) were kept OUT of the `files` detection list for vue/remix to avoid
   false-positives on any Vite project (they remain in `configScaffold`, which is scaffolding
   intent, not detection). react/express/fastify/fastapi/flask have `files: []` and match via
   deps only.
5. **Doc-count tripwire (out of plan-file scope).** Adding `tests/capability-frameworks.test.js`
   moves the live test-file count 284 → 285, so `tests/doc-counts.test.js` will report the two
   CLAUDE.md count claims ("Run all 284 test files" / "tests/ 284 test files", lines 189/251) as
   stale. CLAUDE.md is NOT in this plan's `files:` list; the reconciliation is the release/
   metadata-truth workstream. FLAGGED, not silently edited.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-frameworks.test.js tests/stack-detector.test.js tests/hooks.test.js
tests/capability-registry.test.js` all green; a hand-run: 18 frameworks load zero-warning; a
`next`-dep project yields frameworkCapabilities with nextjs's security concerns; detectStack
frameworks/languages unchanged; eslint clean; tsc 0; dead-export fence + enforcer 0 block
(loadFrameworks/frameworkCapability reachable from stack-detector). NOTE: adding a test file +
2 lib exports will trip the doc-count guards (CLAUDE.md/README test-file + module counts) —
those are the release-step reconciliation, flag them, do not edit out of scope. NO git.
Step 16: report the 18 frameworks, the enrichment wiring edge, and any UNVERIFIED value.
