---
title: "Capability Registry expansion — the complete gap map (ultrathink + web-grounded 2026)"
type: vision
program: ctoc-registry-expansion
parent_program: ctoc-capability-registry
---

# What is missing from the Capability Registry (the full map)

Current state (shipped, v6.12.14): 20 languages, 13 project types, wired into
stack-detector / tool-detector / sast-runner / app-runner; glob-aware detection;
gate measures real coverage (91%). The gaps below are grounded in 2026 web sources
and VERIFIED against the code this session (depsAudit-not-consumed, extensions-inert,
build-tool-ad-hoc were all confirmed in the CR5 executor reports, not guessed).

Build order is TECHNICAL dependency only; the human schedules WHAT and WHEN.

## A. Config/infra "languages" — cross-cutting, in almost every repo (engine-ready: new YAMLs)
Not in the top-20 but present in nearly every real repo, each with a standard 2026 tool:
1. **shell/bash** — lint shellcheck, format shfmt. Every repo has .sh.
2. **dockerfile** — lint hadolint, security trivy config / hadolint. Every containerized project.
3. **terraform/HCL** — lint tflint, format terraform fmt, validate terraform validate,
   security **trivy config** (SUCCESSOR to the deprecated tfsec — web-verified 2026) or
   checkov. `infra` project type exists but had NO HCL toolchain.
4. **yaml** — lint yamllint. Ubiquitous (CI, k8s, config). NOTE over-detection risk
   (every repo has yaml) — needs a careful marker/priority like the CR5 review taught.
5. **github-actions** — lint actionlint (`.github/workflows`). Every CI.
6. **markdown** — markdownlint (lower value). **json** — validation (low tooling).
7. **solidity** — slither/mythril (only if Web3 lands). **protobuf** — buf lint.

## B. Missing project types — 2026 common shapes (engine-ready: new YAMLs), web-confirmed
Current 13. Missing, each with distinct run strategy + config scaffold:
1. **serverless / FaaS / edge** — vercel.json, wrangler.toml (Cloudflare Workers),
   serverless.yml, sst.config.ts, netlify.toml, fly.toml, render.yaml. Run = deploy /
   local-dev, NOT launch. Web-confirmed major in 2026 (Vercel/Netlify/CF/Fly/Render/SST).
2. **static-site / SSG** — Astro, Next static-export, Hugo, Eleventy, Jekyll, Gatsby,
   Docusaurus, MkDocs, SvelteKit adapter-static. Build to static HTML, no server.
   Distinct from web-frontend (SPA). Web-confirmed top-2026 (Astro/Next/Eleventy).
3. **llm-agent / AI-agent app** — LangChain/LangGraph, CrewAI, Microsoft Agent Framework
   (AutoGen successor), LlamaIndex, Pydantic AI, Claude Agent SDK. Eval harness (LangSmith),
   prompt config. Distinct from ml-service. Web-confirmed HUGE 2026.
4. **browser-extension** — manifest.json v3, wxt/plasmo, web-ext. Distinct build/package.
5. **game** — Unity, Unreal (*.uproject), Godot (project.godot), Bevy.
6. **embedded / firmware / IoT** — PlatformIO (platformio.ini), Arduino (*.ino), Zephyr
   (west.yml), ESP-IDF, Rust embedded. Cross-compile + flash.
7. **blockchain / smart-contract / Web3** — Hardhat (hardhat.config.js), Foundry
   (foundry.toml), Solidity. Web-confirmed active 2026 (dApps, smart contracts).
8. **data-pipeline / ETL** — Airflow (dags/), dbt, Dagster, Prefect, Spark. Distinct
   from data-science notebook.
9. **plugin / host-extension** — VS Code extension, Figma, Obsidian, JetBrains.
10. **container-image** — Dockerfile-centric image build (hadolint + trivy), not an app.

## C. Frameworks (CR4 — the original top-50 ask; NOT started)
Registry has ZERO framework capability data (stack-detector has FRAMEWORK_PATTERNS for
DETECTION only). Frameworks need: config scaffold (next.config/vite.config), framework
test/lint/build overrides, framework security. Categories: frontend (React, Vue, Angular,
Svelte/Kit, Solid, Qwik, Astro, Next, Nuxt, Remix), backend (Express, NestJS, Fastify,
Django, FastAPI, Flask, Rails, Laravel, Spring Boot, Gin, Actix, Phoenix, ASP.NET), mobile
(React Native, Expo, Flutter, SwiftUI, Compose), test (Jest, Vitest, Playwright, Cypress,
pytest). Plus top-25 DS/ML/LLM frameworks (PyTorch, TF, JAX, scikit-learn, HF Transformers,
LangChain, LlamaIndex, vLLM, Ollama, …).

## D. Databases (CR4 — top-10 ask; NOT started)
No DB capability data. Each needs migration tool, connection/config, injection-security,
schema validation. Web-confirmed DB-Engines 2026: PostgreSQL, MySQL, Oracle, SQL Server,
MongoDB, Redis (+Valkey fork), SQLite; growers: Snowflake, ClickHouse, DuckDB; vector DBs
for AI: Pinecone, Weaviate, Qdrant, pgvector.

## E. Structural / ENGINE gaps (verified against code this session)
1. **SCA / depsAudit runner** — the registry HAS depsAudit commands (npm audit, pip-audit,
   cargo audit, osv-scanner, govulncheck, composer audit, bundler-audit…) but NOTHING
   consumes them. CR5-s3 left depsAudit OUT of the SAST runner (different output formats).
   Dependency CVEs are currently unaddressed. Needs an SCA runner with per-tool parsers.
2. **Extension-based detection** — registry does root-marker + root-glob only. No
   extension-tree-walk. s4 confirmed stack-detector's `extensions` arrays are INERT dead
   data. A project with sources in subdirs + no root marker is missed.
3. **Build-tool dimension** — Java Maven/Gradle handled ad-hoc in tool-detector; JS
   npm/yarn/pnpm/bun and Python pip/poetry/uv/pdm NOT modeled. The registry flattens the
   package-manager axis (a pnpm-workspace should use pnpm, not npm).
4. **CI config modeling** — no type/capability models CI (.github/workflows, .gitlab-ci.yml,
   Jenkinsfile). Every real project has CI; can't detect/scaffold/validate it.
5. **Monorepo per-workspace detection** — monorepo type exists but detection doesn't
   recurse into workspaces for per-package languages/frameworks.
6. **Zig** — stack-detector has it; the registry is missing it (a 21st language).
7. **6 zero-coverage CLI scripts** — test-gate, run-evals, run-self-check, build-coverage-map,
   evidence-pack, retention. Untested entry scripts (lower priority).

## F. Config scaffolding (the specific "configs" ask) — weave into project-type configScaffold
Common configs the registry should detect/scaffold, web-confirmed 2026:
- CI/CD: .github/workflows/, .gitlab-ci.yml, Jenkinsfile
- Container: Dockerfile, docker-compose.yml, .dockerignore, .devcontainer/devcontainer.json
- Editor/tooling: .editorconfig, .gitignore, .gitattributes, .nvmrc, .tool-versions (asdf/mise)
- Pre-commit: .pre-commit-config.yaml, husky, lint-staged
- Env: .env.example, .envrc (direnv)
- Deployment: vercel.json, netlify.toml, fly.toml, render.yaml, wrangler.toml, serverless.yml,
  sst.config.ts, Procfile, k8s manifests, Chart.yaml (Helm), skaffold.yaml

## Technical dependency order (schedule is the human's)
1. Config-languages A1-A3 (shell/dockerfile/terraform) — engine-ready, every-repo value.
2. New project types B1-B10 — engine-ready data.
3. SCA runner E1 — real capability, closes the dependency-CVE hole.
4. Extension detection E2 + build-tool dimension E3 — engine enhancements.
5. Zig E6; config-scaffold modeling F (into type YAMLs).
6. Frameworks C + Databases D — the larger CR4 data programs.

Sources: DB-Engines 2026; langchain.com AI-agent frameworks 2026; spacelift/ezyinfra
(tfsec→Trivy); jamstack/hygraph SSG 2026; fly.io/vercel/netlify/cloudflare/render/sst docs;
editorconfig.org; oneuptime devcontainers 2026.
