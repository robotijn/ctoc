---
title: "Expansion wave 2 — 8 new 2026 project types"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00037-exp-w1-config-languages
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - ".ctoc/capabilities/project-types/serverless.yaml"
  - ".ctoc/capabilities/project-types/static-site.yaml"
  - ".ctoc/capabilities/project-types/llm-agent.yaml"
  - ".ctoc/capabilities/project-types/browser-extension.yaml"
  - ".ctoc/capabilities/project-types/game.yaml"
  - ".ctoc/capabilities/project-types/embedded.yaml"
  - ".ctoc/capabilities/project-types/blockchain.yaml"
  - ".ctoc/capabilities/project-types/data-pipeline.yaml"
  - "tests/capability-project-types-2026.test.js"
---

# Expansion wave 2 — 8 web-grounded 2026 project types

Author 8 new `.ctoc/capabilities/project-types/*.yaml` byte-for-byte to the CR3 schema
(read an existing one, e.g. `mobile-crossplatform.yaml`, and `schema.md`, IN FULL first).
Each declares detectionMarkers, frameworks, phases (relevance), run{strategy,honest},
runShape, priority, configScaffold, verified.

## THE OVER-DETECTION RULE (the CR5 review lesson — do not repeat it)
A marker that co-exists with many project types must NOT assert a type decisively. Use a
DECISIVE marker (unique to the type) at a HIGH priority; use an AMBIGUOUS marker (shared)
only at LOW priority AND flag it `verified: UNVERIFIED`. FIRST read every existing
project-type YAML's `priority` and slot the new ones so a decisive marker beats a generic
one and an ambiguous one loses to a real framework marker. Verify each with a fixture that
a REAL competing shape does not mis-detect.

## The 8 (web-grounded 2026; markers/tools verified 2026-07 unless flagged)

1. **serverless** — markers [serverless.yml, wrangler.toml, sst.config.ts, template.yaml]
   (Serverless Framework / Cloudflare Workers / SST / AWS SAM — all DECISIVE, not shared).
   Do NOT use vercel.json/netlify.toml as decisive (they deploy ANY frontend). frameworks
   [serverless-framework, cloudflare-workers, sst, aws-sam]. phases lint/typecheck/test
   required, security required, coverage recommended. run strategy deploy, honest:
   build-is-last-mile (a deploy, not a local launch). configScaffold [the config,
   .env.example]. priority ABOVE web-backend, below data-science.

2. **static-site** — markers [astro.config.mjs, hugo.toml, .eleventy.js, gatsby-config.js,
   docusaurus.config.js, mkdocs.yml] (SSG-specific). frameworks [astro, hugo, eleventy,
   jekyll, gatsby, docusaurus, mkdocs]. phases lint/test recommended, typecheck optional,
   security recommended. run strategy build-and-preview, honest: true (SSG dev servers
   run locally). configScaffold [the SSG config, package.json, .gitignore]. priority
   ABOVE web-frontend (a real SSG config beats a bare package.json).

3. **llm-agent** — markers [langgraph.json] DECISIVE; broader detection needs framework-dep
   parsing the registry lacks, so ALSO carry frameworks [langchain, langgraph, crewai,
   llama-index, autogen, pydantic-ai, claude-agent-sdk] and flag the type
   `verified: UNVERIFIED` (no universal marker — honest). phases test required, security
   required (prompt injection, tool access), lint/typecheck recommended, coverage
   recommended. run strategy serve-or-eval, honest: true. configScaffold [langgraph.json,
   .env.example, evals/, prompts/]. priority just ABOVE ml-service.

4. **browser-extension** — markers [wxt.config.ts] DECISIVE (WXT, the modern framework);
   `manifest.json` is AMBIGUOUS (also a PWA/web-app manifest) so include it but flag the
   type `verified: UNVERIFIED` and set a LOW priority so a real frontend framework wins.
   frameworks [wxt, plasmo, web-ext]. phases lint/typecheck/test recommended, security
   recommended. run strategy build-and-package, honest: build-is-last-mile. configScaffold
   [manifest.json, wxt.config.ts].

5. **game** — markers [project.godot, "*.uproject", ProjectSettings] (Godot/Unreal/Unity —
   DECISIVE). frameworks [unity, unreal, godot, bevy]. phases lint/test recommended,
   security/coverage optional. run strategy build, honest: build-is-last-mile (games build
   to platform binaries). configScaffold engine-specific. priority high (decisive markers).

6. **embedded** — markers [platformio.ini, "*.ino", west.yml, sdkconfig] (PlatformIO/
   Arduino/Zephyr/ESP-IDF — DECISIVE). frameworks [platformio, arduino, zephyr, esp-idf,
   embedded-rust]. phases typecheck required, lint/test/security recommended, coverage
   optional. run strategy build-and-flash, honest: build-is-last-mile (cross-compile +
   flash to device). configScaffold [platformio.ini, prj.conf].

7. **blockchain** — markers [hardhat.config.js, hardhat.config.ts, foundry.toml,
   truffle-config.js] (DECISIVE). frameworks [hardhat, foundry, truffle, solidity]. phases
   lint/typecheck/test required, security REQUIRED (contract exploits — slither/mythril),
   coverage required (contract coverage matters). run strategy compile-and-test, honest:
   build-is-last-mile (contracts deploy to chain; local = compile+test). configScaffold
   [hardhat.config, foundry.toml, contracts/, test/]. priority high.

8. **data-pipeline** — markers [airflow.cfg, dagster.yaml, prefect.yaml] DECISIVE (do NOT
   use dbt_project.yml — it is the SQL language marker; overlap). frameworks [airflow,
   dagster, prefect, dbt, spark]. phases test required (pipeline correctness), lint/
   typecheck/security/coverage recommended. run strategy validate, honest: false (pipelines
   run on a scheduler, not CI-launchable). configScaffold [dags/, the config]. priority
   above web-backend, below data-science.

## TDD-Red FIRST
`tests/capability-project-types-2026.test.js` (real temp-dir fixtures, zero mocks): each
of the 8 loads with zero warnings and carries phases+run+configScaffold; a decisive-marker
fixture detects its type (serverless.yml→serverless, project.godot→game, foundry.toml→
blockchain, platformio.ini→embedded, astro.config.mjs→static-site, langgraph.json→llm-agent,
airflow.cfg→data-pipeline, wxt.config.ts→browser-extension); an OVER-DETECTION guard — a
plain web-frontend (vite.config.ts, no SSG/serverless marker) still detects web-frontend,
NOT serverless/static-site; every `verified` is web-2026-07 or UNVERIFIED. Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-project-types-2026.test.js tests/capability-project-types.test.js
tests/capability-registry.test.js` all green; a hand-run confirming the registry now loads
**21 project types** with zero warnings and each new type detects from its decisive marker
while a plain web-frontend does not mis-detect; eslint clean; NO git; do not move the plan.
Report each type's markers/priority/run and the over-detection guard result.
