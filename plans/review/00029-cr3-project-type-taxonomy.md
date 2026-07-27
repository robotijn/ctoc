---
title: "CR3 — Project-type taxonomy + config scaffolds"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00027-cr1-capability-registry-core
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - ".ctoc/capabilities/project-types/web-frontend.yaml"
  - ".ctoc/capabilities/project-types/web-backend.yaml"
  - ".ctoc/capabilities/project-types/mobile-crossplatform.yaml"
  - ".ctoc/capabilities/project-types/mobile-native-android.yaml"
  - ".ctoc/capabilities/project-types/mobile-native-ios.yaml"
  - ".ctoc/capabilities/project-types/desktop.yaml"
  - ".ctoc/capabilities/project-types/cli.yaml"
  - ".ctoc/capabilities/project-types/library.yaml"
  - ".ctoc/capabilities/project-types/data-science.yaml"
  - ".ctoc/capabilities/project-types/ml-service.yaml"
  - ".ctoc/capabilities/project-types/microservice.yaml"
  - ".ctoc/capabilities/project-types/monorepo.yaml"
  - ".ctoc/capabilities/project-types/infra.yaml"
  - ".ctoc/capabilities/schema.md"
  - "tests/capability-project-types.test.js"
  - "src/lib/app-runner.js"
---

# CR3 — The project-type dimension that adjusts the pipeline

A language tells you the toolchain; a project TYPE tells you which phases matter,
the run strategy, and the config scaffold. A Flutter app, a Rust CLI, a
data-science notebook, and a microservice monorepo need different pipelines even
in the same language.

## Implementation Details
1. **Extend the engine** (`capability-registry.js`): add
   `loadProjectTypes(projectRoot?)`, `projectTypeFor(projectRoot)` (detect from
   markers/frameworks), and `pipelineFor(language, projectType)` that MERGES the
   language toolchain with the project-type's phase-relevance + run strategy +
   scaffold. Keep it data-driven; no hardcoded type logic. Add the new exports;
   they must have a live caller (the engine is consumed by app-runner — extend
   app-runner's registry consult to use projectTypeFor if that keeps it reachable,
   OR wire via the existing detectRunTarget path; if wiring needs a file outside
   scope, STOP and report — do not ship dead exports).
2. **The 13 project-type YAMLs.** Each declares:
   ```yaml
   projectType: mobile-crossplatform
   detectionMarkers: [pubspec.yaml]        # or framework deps
   frameworks: [flutter, react-native, expo]
   phases: { lint: required, typecheck: required, test: required,
             security: recommended, coverage: recommended }
   run: { strategy: build-and-test, honest: build-is-last-mile }  # emulator not CI-safe
   configScaffold: [pubspec.yaml, analysis_options.yaml, .gitignore]
   ```
   The 13 (grounded in the vision's websourced project-type list):
   - web-frontend: markers package.json+vite/next config; run dev-server (honest:true); scaffold package.json, tsconfig, eslint/biome, .env.example, vite/next config.
   - web-backend: run server + health-probe (honest:true); scaffold + Dockerfile, openapi/, migrations/.
   - mobile-crossplatform (Flutter/RN/Expo): run build-and-test honest:build-is-last-mile; scaffold pubspec.yaml/app.json + analysis_options.yaml/.eslintrc.
   - mobile-native-android (Kotlin/Java): run ./gradlew build honest:build-is-last-mile; scaffold build.gradle.kts, detekt.yml, AndroidManifest.xml.
   - mobile-native-ios (Swift/ObjC): run xcodebuild build honest:build-is-last-mile; scaffold Package.swift/Podfile, .swiftlint.yml.
   - desktop (Tauri/Electron/Qt/MAUI): run build honest:build-is-last-mile; scaffold tauri.conf.json+Cargo.toml / electron package.json.
   - cli/binary: run --help exit-0 (honest:true); scaffold the language manifest.
   - library/package: run N/A (honest:false — no runtime); phases test+coverage required; scaffold + changesets/semantic-release/publish config.
   - data-science (notebook): phases lint recommended, test recommended; run N/A or `jupyter nbconvert --execute` (honest:notebook-executes); scaffold requirements.txt/pyproject, .ipynb, dvc.yaml, data/.gitignore.
   - ml-service (training/serving): phases test required, security recommended; run serve-probe or train-smoke; scaffold Dockerfile, model registry config, vLLM/serving config.
   - microservice: run per-service server+health; scaffold Dockerfile, k8s manifest, openapi.
   - monorepo: markers turbo.json/nx.json/pnpm-workspace.yaml; run per-workspace; scaffold turbo.json/nx.json, apps/ packages/ layout.
   - infra (IaC): markers *.tf/k8s/helm; phases lint (tflint/checkov) required, security required (checkov/tfsec), no test/run in the app sense; scaffold main.tf/.terraform, k8s/.
3. **schema.md** gains the project-type entry contract.

### Wiring — the live call sites (MANDATORY)
The new engine functions must be consumed live (not test-only). app-runner's
registry path is the natural consumer — if projectTypeFor/pipelineFor can feed
detectRunTarget's evidence (richer than language alone), wire it there. Report
the exact live edge; if none is reachable in scope, STOP.

### Test Plan (TDD-Red first)
projectTypeFor detects mobile-crossplatform from pubspec.yaml, monorepo from
turbo.json, infra from *.tf, library from the absence of a run entry + a publish
config. pipelineFor('dart','mobile-crossplatform') merges flutter toolchain +
build-is-last-mile run. Every project-type YAML parses; every one has phases +
run + configScaffold. library run honest:false; web-backend honest:true.

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read schema.md, capability-registry.js in full,
app-runner detectRunTarget — resolve the live-wiring edge) · Step 10 IMPLEMENT ·
Step 11 REVIEW · Step 13 SECURE (data-only; engine returns, never executes) ·
Step 14 VERIFY (named test + capability-registry.test.js green + eslint; no git) ·
Step 16 REPORT (the 13 types, the live wiring edge, any UNVERIFIED scaffold tool).

## Decisions Taken Under Ambiguity

1. **Live-wiring edge chosen: `app-runner.detectRunTarget`.** The new engine
   functions `projectTypeFor` + `pipelineFor` are consumed there (added `taxonomy`
   + `pipeline` to the native run-target result, and `projectTypeTaxonomy` to the
   honest not-applicable evidence). `loadProjectTypes` is live via an intra-module
   code edge (called by both `projectTypeFor` and `pipelineFor`). All three pass the
   dead-export fence (`tests/export-reachability.test.js` green, baseline unchanged).
   **`app-runner.js` was added to this plan's `files:`** — it is NOT in CR2's scope
   (CR2 owns `languages/*.yaml` only), so no concurrent-edit conflict.

2. **Detection is priority-ranked, not first-match.** Markers overlap (a monorepo
   has a `package.json` too), so each type carries a `priority` and `projectTypeFor`
   returns the highest-priority match: infra 90 > monorepo 80 > data-science 75 >
   mobile-crossplatform 70 > mobile-native-ios 68 > mobile-native-android 66 >
   desktop 60 > ml-service 55 > microservice 50 > library 40 > web-backend 30 >
   web-frontend 20 > cli 10. Data-driven; the engine has zero hardcoded type logic.

3. **Exact-filename markers only (no globs).** CR1's engine matches exact filenames
   via `existsSync` (deliberately no regex → no ReDoS). The vision's "*.tf / k8s /
   helm" is expressed as concrete conventional root files — `main.tf`,
   `terraform.tf`, `Chart.yaml`, `kustomization.yaml` — not a glob. Same for
   data-science (`dvc.yaml`, `environment.yml`) and library (`tsup.config.ts`,
   `rollup.config.*`, `.changeset`, `api-extractor.json`).

4. **`runShape` field added to the schema** so `pipelineFor` can merge the language's
   run command into the type's run strategy (mobile-crossplatform→`mobile`,
   web-backend→`server`, cli→`cli`, library/data-science/monorepo/infra→`none`). This
   is the meaningful merge point the test asserts (`flutter run` + build-is-last-mile).

5. **Honest run flags, per constraint.** library `honest:false` (no runtime), infra
   `honest:false` (a `terraform plan` is a dry run, not a launched app), web-backend
   `honest:true`, all mobile + desktop `honest:build-is-last-mile`, data-science
   `honest:notebook-executes`, monorepo `honest:per-workspace`. Never a fake "it ran".

6. **`cli` and `ml-service` markers flagged `verified: UNVERIFIED`.** A CLI has no
   universal marker file (it is usually a `package.json` `bin`, detected by
   app-runner's `detectAppShape`, not a unique file) and ml-service serving configs
   are project-convention, not a single standard. Honestly flagged rather than
   fabricating a decisive marker. The other 11 types are `web-2026-07` (grounded in
   the vision's web-sourced project-type list).

## Executor status (Steps 8–16)

- [x] **Step 8 TEST (TDD-Red):** `tests/capability-project-types.test.js` written
      first, run RED (13 fail / 1 pass) before any implementation existed.
- [x] **Step 9 PREPARE:** read `capability-registry.js` (full), `schema.md`,
      `app-runner.detectRunTarget`, `capability-registry.test.js`,
      `export-reachability.test.js` — resolved the live-wiring edge.
- [x] **Step 10 IMPLEMENT:** 13 project-type YAMLs; engine `loadProjectTypes` /
      `projectTypeFor` / `pipelineFor`; app-runner `detectRunTarget` enrichment.
- [x] **Step 11 REVIEW:** self-review — data-driven, fail-open, no hardcoded type
      logic; parity suites unchanged.
- [x] **Step 13 SECURE:** engine only loads + looks up; no `eval`/`child_process`/
      spawn added (the RCE-guard test in capability-registry.test.js stays green);
      markers are exact-filename `existsSync`, no regex.
- [x] **Step 14 VERIFY (re-run at review-time 2026-07-27 — real full gate):**
      the ORIGINAL bullet recorded a NARROWED gate (`capability-project-types.test.js`
      14/14; a `56/56 combined` parity subset) plus a "known drift" caveat. Both are
      now STALE and have been re-verified against disk:
      • The full `npm test` gate is GREEN: `[CTOC test-gate] coverage 99.12%
        (threshold 99%), skipped 0, failed 0 → PASS`. This is the REAL gate
        (`src/scripts/test-gate.js`), not a narrowed subset.
      • `tests/capability-project-types.test.js` now runs **31/31 pass, 0 fail,
        0 skipped** — the file grew from 14 to 31 cases as later adversarial repair
        waves added the CR3-FIX detection/honesty suite and the fail-open suite. The
        original "14/14" is stale evidence, corrected here.
      • `npx tsc --noEmit` is clean (pure-JS repo).
      • REFUTED-as-stale: the old "KNOWN PRE-EXISTING drift: `tests/doc-counts.test.js`
        (documented 273 vs live test-file count)" caveat. `doc-counts.test.js` now runs
        **6/6 pass, 0 fail** — CLAUDE.md's documented counts match disk. The tree is
        green; there is no doc-count drift to report.
      • New exports (`loadProjectTypes`/`projectTypeFor`/`pipelineFor`) confirmed LIVE:
        `src/lib/app-runner.js:detectRunTarget` consults `projectTypeFor` +
        `pipelineFor` (lines 326-347); export-reachability passes inside the full gate.
- [x] **Step 15 DOCUMENT:** `schema.md` gained the project-type contract, the 13
      types, and the engine API + live-consumer note.
- [x] **Step 16 FINAL-REVIEW (rework pass 2026-07-27):** see the rework report
      below. Steps 8–15 complete; the code is verified sound against a green full
      gate. Awaits the human's review decision (review → done) — NOT self-crossed.

## Step 16 — Rework report (review-time adversarial re-verification, 2026-07-27)

An independent adversarial rework re-read this plan in full plus its ancestry
(`ctoc-capability-registry` → CR1 → CR2 → CR3), re-verified every Step-14 claim
against disk, and hunted for a shipped code defect. Dispositions:

**Code: SOUND — no remaining defect.** The CR3 engine (`loadProjectTypes`,
`projectTypeFor`, `pipelineFor`) and its live consumer (`app-runner.detectRunTarget`)
were re-examined after four prior adversarial repair rounds (v6.12.30–6.12.31). Checks
run this pass, each verified against source:
  - Full `npm test` gate GREEN: coverage 99.12% (floor 99), 0 failed, 0 skipped.
  - `tests/capability-project-types.test.js`: 31/31 pass (zero doubles — every
    filesystem case builds a real on-disk fixture and reads the real bundled YAML).
  - Live-wiring edge confirmed: `detectRunTarget` (app-runner.js L326–347) consults
    `projectTypeFor` + `pipelineFor`; the honest-flag preference (taxonomy over the
    bare language shape) is correct and defensive; export-reachability green.
  - `projectTypeFor` priority resolution: all 22 bundled types carry UNIQUE
    priorities (10…90), so the strict-`>` tie-break is never exercised — no silent
    detection ambiguity.
  - Bounds safe: `MAX_FILES` 500 ≫ 22 bundled types, so no whole-directory drop
    cliff; `MAX_FILE_BYTES` 64 KiB guards each entry.
  - `pipelineFor` honest-run contract sound: `honest:true` degrades to `false` when
    the language supplies no run command — never a false "it ran".

**Record: CORRECTED (this was the real defect surface).**
  1. Step-14 evidence was recorded off a NARROWED gate ("14/14", "56/56 combined")
     and carried a stale "doc-counts drift" caveat. Rewritten above with the real
     full-gate result. The doc-counts caveat is REFUTED-as-stale (6/6 green).
  2. Body narrative drift: this plan AUTHORED 13 project-type YAMLs (correct as
     historical record). Later expansion waves (v6.12.16–6.12.31) added 9 more —
     serverless, static-site, llm-agent, browser-extension, game, embedded,
     blockchain, data-pipeline, web-fullstack — bringing disk + test to 22. The
     "13" throughout the design section is honest CR3 history; the shipped total is
     22 and the test suite asserts 22 in lock-step. Recorded here so a reviewer is
     not confused by the 13-vs-22 gap.
  3. `files:` frontmatter VERIFIED ACCURATE — all 13 declared YAMLs plus `schema.md`,
     the test file, `capability-registry.js` and `app-runner.js` exist on disk and
     were authored/touched by CR3. The 9 later YAMLs are deliberately NOT added here:
     they belong to the later expansion-wave plans, and claiming them would be false
     authorship. No change to `files:`.

No ledger hash was re-stamped (plan is in review). No test was weakened; no code was
changed (none needed changing).
