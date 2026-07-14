---
title: "CR3-FIX — registry detection + honesty defects (adversarial review)"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00029-cr3-project-type-taxonomy
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - "src/lib/app-runner.js"
  - ".ctoc/capabilities/project-types/microservice.yaml"
  - ".ctoc/capabilities/project-types/data-science.yaml"
  - ".ctoc/capabilities/project-types/mobile-native-ios.yaml"
  - ".ctoc/capabilities/project-types/desktop.yaml"
  - ".ctoc/capabilities/languages/kotlin.yaml"
  - ".ctoc/capabilities/languages/java.yaml"
  - ".ctoc/capabilities/languages/sql.yaml"
  - "tests/capability-project-types.test.js"
  - "tests/capability-registry-top20.test.js"
---

# CR3-FIX — fix 7 confirmed detection + honesty defects before CR5

An adversarial code review of the Capability Registry (v6.12.9) found 7 real
defects, ALL reproduced by direct execution against disk. They sit on exactly the
surfaces CR5 wires (projectTypeFor / pipelineFor), so they must be fixed before
CR5 or the mis-detection propagates into all four detection consumers.

The engine is sound (parser + fail-open verified unbreakable). Every fix below is
DATA or the merge whitelist — no engine rewrite.

## TDD-Red FIRST (Step 8)
Add a `describe('detection + honesty fixes (CR3-FIX)')` block to
`tests/capability-project-types.test.js` (and the two language-provenance asserts
to `tests/capability-registry-top20.test.js`) asserting the CORRECT behavior below.
Run them RED before touching any data file. Each uses a REAL on-disk fixture — no
mocks (match the file's existing zero-doubles style).

## The 7 fixes

1. **F1 (HIGH) — `microservice` over-broad marker.** `microservice.yaml` markers
   `[docker-compose.yml, compose.yaml, skaffold.yaml]` at priority 50: a compose
   file co-exists with almost every project type, so an SPA/library/CLI with a dev
   compose file mis-detects as microservice (server-probe, security:required).
   FIX: remove `docker-compose.yml` and `compose.yaml` from the markers; keep ONLY
   `skaffold.yaml` (genuinely microservice orchestration). Keep priority 50.
   TEST: a dir with `vite.config.ts` + `docker-compose.yml` → `projectTypeFor` is
   `web-frontend`, NOT `microservice`. A dir with only `skaffold.yaml` → `microservice`.

2. **F2 — `data-science` over-broad marker.** `data-science.yaml` includes
   `environment.yml` (a generic Conda env file) at priority 75, outranking
   `ml-service` (55) and silently downgrading `test: required` → `recommended`.
   FIX: remove `environment.yml` from the markers; keep the data-science-specific
   ones (`dvc.yaml`, `papermill.yaml`, and any notebook/`.ipynb` marker present).
   TEST: `model_config.yaml` + `environment.yml` → `ml-service`, NOT `data-science`.

3. **F3 — `depsAudit` unreachable through `pipelineFor`.** The merge
   (`capability-registry.js` ~469) iterates `type.phases` as an exclusive whitelist;
   no project type lists `depsAudit`, so dependency-CVE auditing is dropped from
   every pipeline even when `security: required`. SAST and SCA are the two halves of
   security — if one is relevant, so is the other.
   FIX (engine): in `pipelineFor`, after building `phases` from `type.phases`, if
   `phases.security` exists AND the language toolchain defines `depsAudit`, add
   `phases.depsAudit` at the SAME relevance as `phases.security` (pull cmd/tool/
   verified from `toolchain.depsAudit`). Data-driven; no hardcoded type logic.
   TEST: `pipelineFor('go','microservice').phases.depsAudit` exists with
   `relevance === phases.security.relevance` and `cmd` = go's `govulncheck ./...`.

4. **F4 — `desktop` dead runShape.** `desktop.yaml` `runShape: desktop`, but no
   language declares a `desktop` run shape → `run.command` is always null. Desktop
   run (Tauri/Electron) is framework-specific and build-is-last-mile — the language
   layer cannot honestly supply a run command.
   FIX: remove the `runShape` line from `desktop.yaml` (a null runShape is the honest
   signal: build-is-last-mile, no language-level run command). Add a one-line comment
   saying so. Verify `pipelineFor('rust','desktop').run` is `{strategy, honest:
   build-is-last-mile, command: null, shape: null}` — null now INTENTIONAL, not a
   dangling shape.

5. **F5 — dishonest `security` provenance (Kotlin + Java).** `kotlin.yaml`
   `security: ./gradlew detekt` marked `web-2026-07` — detekt is a code-smell
   linter, not a SAST. `java.yaml` `security: mvn spotbugs:check` marked
   `web-2026-07` — plain SpotBugs is a bug-pattern finder without the find-sec-bugs
   plugin. Six peer languages honestly flag their linters `UNVERIFIED`.
   FIX: change BOTH `security` entries to `verified: UNVERIFIED` and update the file
   header comment to say why (no free canonical SAST confirmed; detekt/SpotBugs are
   style/bug-pattern tools). Do NOT fabricate a SAST invocation.
   TEST (in top20 test): `kotlin` and `java` `security.verified === 'UNVERIFIED'`.

6. **F6 — `Package.swift` mis-marks iOS.** `mobile-native-ios.yaml` markers include
   `Package.swift` (generic SPM — used by servers/libraries) at priority 68, so a
   Swift Vapor server detects as a mobile build.
   FIX: remove `Package.swift` from the iOS markers; keep `Podfile` and
   `project.pbxproj`. TEST: a dir with only `Package.swift` → `projectTypeFor` is NOT
   `mobile-native-ios` (null or a non-mobile type is acceptable).

7. **F7 — `sql` over-broad `migrations` marker.** `sql.yaml` markers include
   `migrations` (every Django/Rails/Node project has a `migrations/` dir), so `sql`
   is spuriously detected. FIX: remove `migrations` from sql `detectionMarkers`;
   keep `dbt_project.yml`. TEST: a dir with only a `migrations` file/dir →
   `detectLanguages` does NOT include `sql`.

8. **F9 (LOW, include) — honest-flag disagreement in `detectRunTarget`.** In
   `app-runner.js` `detectRunTarget`, the `strategy.honest` comes from the language
   shape while `pipeline.run.honest` comes from the taxonomy; they can disagree (a
   Rust Tauri app: language `cli` honest:true vs desktop taxonomy build-is-last-mile).
   FIX: when a taxonomy pipeline is present, surface `pipeline.run.honest` as the
   authoritative honest flag in the result evidence (prefer taxonomy over language
   shape). Keep it minimal; do not change the launched/responded logic.

## NOT in scope (deferred, reported to human — do NOT touch)
- C-vs-C++ disambiguation (dead `*.c`/`*.cpp` globs): needs the glob-aware detector,
  a separate CR-future slice. Leave the markers; do not claim they work.
- Bare tool-name commands (`clang-tidy`, `make`, `Rscript`, `ruby`) labeled
  `web-2026-07`: truth-in-labeling follow-up, lower priority.

## Steps 11–16
Step 11 REVIEW (data-driven, no hardcoded type logic, honest flags). Step 13 SECURE
(engine still only loads + looks up; no exec added). Step 14 VERIFY: the named tests
green + `capability-registry.test.js` + `capability-registry-top20.test.js` +
`app-runner.test.js` green + eslint clean; NO git. Step 16 REPORT: each fix, the
before→after detection, and confirm all 20 languages + 13 types still load with
zero warnings.

## Wiring
No new exports. All changes are to existing live functions (`pipelineFor`,
`detectRunTarget`) and data consumed by them — reachability baselines unchanged.

## Decisions Taken Under Ambiguity
- **F3 injection is guarded with `!phases.depsAudit`.** The plan says "if
  `phases.security` exists AND the toolchain defines `depsAudit`, add
  `phases.depsAudit` at the same relevance as security". No project type declares
  `depsAudit` today, so an unconditional add is equivalent — but I guard on
  `!phases.depsAudit` so that if a project type ever declares its own `depsAudit`
  relevance, the type's declaration is respected rather than silently overwritten by
  security's relevance. Strictly more correct, identical behavior today.
- **F3 negative test uses a language without `depsAudit`, not a type without
  security.** Every one of the 13 project types declares a `security` phase, so
  "a type without security" is unrepresentable. The stronger, still-meaningful guard
  test is the OTHER half of the condition: `pipelineFor('sql','web-backend')` — sql's
  toolchain defines no `depsAudit`, so even with `security: required` nothing is
  injected. This proves the injection is data-driven on the toolchain, not forced.
- **F9 surfaces `honest` as a new field on `detectRunTarget`'s return AND propagates
  it into `nativeNotApplicableResult` evidence.** The plan says "surface
  `pipeline.run.honest` as the authoritative honest flag in the result evidence".
  `detectRunTarget` returns no `evidence` object itself (that is built later by
  `nativeNotApplicableResult`), so I added a single `honest` field to
  `detectRunTarget`'s return (taxonomy pipeline wins over the language shape) and made
  the human-facing `evidence.honest` read from it. Minimal; launched/responded logic
  untouched.

## Execution log (Steps 8–15, in place — NOT moved across any gate)
- **Step 8 TEST (TDD-Red):** added `describe('detection + honesty fixes (CR3-FIX)')`
  to `tests/capability-project-types.test.js` (F1×2, F2, F3×2, F4, F6, F7, F9) and the
  F5 kotlin/java provenance assert to `tests/capability-registry-top20.test.js`. Ran
  RED first — all new asserts failed against pre-fix disk state.
- **Step 9 PREPARE:** no new dependencies; existing safe-fs / registry engine reused.
- **Step 10 IMPLEMENT:** F3 engine merge (capability-registry.js), F9 app-runner.js,
  and the six data fixes (F1, F2, F4, F5×2, F6, F7).
- **Step 11 REVIEW:** data-driven — the engine change keys only off the toolchain +
  the security phase, no hardcoded project-type names; honest flags preserved.
- **Step 13 SECURE:** engine still only loads + looks up; no eval/child_process/spawn
  added (verified by grep — only doc-comment matches remain).
- **Step 14 VERIFY:** the two edited test files + `capability-registry.test.js` +
  `app-runner.test.js` all green (31 / 67 / 29 / 13, 0 fail, 0 skipped); eslint exit 0
  zero warnings on all four JS files; hand-run confirms 20 languages + 13 project types
  load with ZERO warnings.
- **Step 16 FINAL-REVIEW / Gate 3:** LEFT TO THE HUMAN — plan remains in
  `implementation/`, not moved.
