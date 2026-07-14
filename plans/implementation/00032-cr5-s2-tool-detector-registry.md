---
title: "CR5-s2 — tool-detector consumes the capability registry"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00031-cr5-s1-glob-extension-detection
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - "src/lib/tool-detector.js"
  - "tests/tool-detector-registry.test.js"
---

# CR5-s2 — tool-detector: one registry, all 20 languages get tool commands

`tool-detector.js` today detects 9 languages and has tool commands (DEFAULT_TOOLS)
for only 7 — csharp and php detect but get NO commands. Wire it to the registry
(now glob-aware from s1) so all 20 languages get lint/typecheck/test/coverage.

## The change
1. `detectLanguages()`: consume `require('./capability-registry').detectLanguages(projectPath)`.
   The registry (post-s1) is a strict SUPERSET of tool-detector's current glob detection
   (it matches `*.csproj`, `*.gemspec` etc. + 11 more languages), so this cannot lose
   csharp/ruby/C. NOTE the registry is ANCHORED, so a stray `app.cpp` in a JS project
   now also surfaces `cpp` — that is CORRECT (real C++ present), not a regression.
2. `detectTools()`: for each detected language, resolve commands from
   `registry.toolchainFor(lang, phase)` for lint/typecheck/test/coverage instead of
   the static `DEFAULT_TOOLS[lang]`. Now csharp/php get full toolchains.
3. KEEP `detectJsTestFramework`, `detectPythonTestFramework`, `getInstallCommand`,
   `readUserConfig`, `commandExists`, `printDetectionResults` unchanged.

## REGRESSION GUARDS (mandatory — these are real traps, verified by parity analysis)
- **Exports:** `tests/lib-utils-batch.test.js` PINS `DEFAULT_TOOLS.javascript.lint ===
  'eslint .'` and `LANGUAGE_MARKERS.go === ['go.mod','go.sum']`, and
  `build-coverage-map.js` / `quality-agent.js` / `push.js` import this module. KEEP
  `DEFAULT_TOOLS` and `LANGUAGE_MARKERS` EXPORTED (leave the static tables in place for
  back-compat; `detectTools` simply stops reading them). `tests/lib-utils-batch.test.js`
  must stay green WITHOUT editing it.
- **JAVA (real regression):** registry java commands are Maven-only (`mvn test`,
  `mvn checkstyle:check`); DEFAULT_TOOLS had `./gradlew X || mvn Y`. A Gradle project
  would break. FIX with a documented decision: when `build.gradle`/`build.gradle.kts`
  is present, use the Gradle form; else the registry (Maven) command. Implement this as
  a thin build-system nuance INSIDE tool-detector (do NOT edit any language YAML — that
  is another slice's file). Record it under `## Decisions Taken Under Ambiguity`.
- **RUBY:** registry drops the `bundle exec` prefix. When a `Gemfile` is present, prefix
  `bundle exec` for ruby test/coverage (preserve bundler semantics). Documented decision.
- **PARITY test stays green:** `capability-registry.test.js:295` asserts python/ts/go
  registry==DEFAULT_TOOLS exactly — do not disturb it.

## TDD-Red FIRST
New file `tests/tool-detector-registry.test.js`, real temp-dir fixtures, zero mocks:
- a `*.csproj` project → `detectTools` returns csharp WITH lint/test commands (today: no tools).
- a `composer.json` project → php gets tools.
- a Gradle Java project (`build.gradle`) → test command uses gradle, NOT bare `mvn test`.
- a Maven Java project (`pom.xml`) → `mvn test`.
- a Ruby project (`Gemfile`) → test command prefixed `bundle exec`.
- REGRESSION: a Python project still yields `ruff check .` + `pytest`; a Go project
  still `golangci-lint run` + `go test ./...`.
Run RED before wiring.

## VERIFY (Step 14) — paste verbatim
`node --test tests/tool-detector-registry.test.js tests/lib-utils-batch.test.js
tests/capability-registry.test.js` all green; eslint clean on the two touched files;
NO git; do not move the plan. Report before→after tool coverage (langs with commands:
7 → 20) and the Java/Ruby decisions.

## Decisions Taken Under Ambiguity

1. **detectLanguages is a UNION (registry + legacy), not a pure registry swap.**
   The plan (point 1) says `detectLanguages` should consume `registry.detectLanguages`,
   AND the regression guard requires `tests/lib-utils-batch.test.js` to stay green
   unedited. Those two conflict: that test pins that a bare `package.json` detects BOTH
   `javascript` AND `typescript`, but the registry maps `package.json` → javascript only
   (typescript requires `tsconfig.json`) — so the registry is NOT a strict superset for
   the js/ts case. Resolution: `detectLanguages` returns the union of
   `registry.detectLanguages(projectPath)` (primary, glob-aware, all 20 languages, first
   so registry order/`[0]` is preserved) and the retained legacy `LANGUAGE_MARKERS`
   detection (unioned in solely to preserve the package.json → javascript+typescript
   nuance), deduped. This satisfies both "all 20 languages detected" and the pinned
   legacy behavior.

2. **JAVA — Gradle build files use the `./gradlew` form; otherwise the registry Maven
   commands.** The registry's java toolchain is Maven-only (`mvn checkstyle:check`,
   `mvn -q compile`, `mvn test`, `mvn jacoco:report`); the prior `DEFAULT_TOOLS.java`
   used a `./gradlew X || mvn Y` fallback, so a Gradle-only project would break under a
   pure Maven swap. Decision: when `build.gradle` OR `build.gradle.kts` is present in the
   project root, override lint/typecheck/test/coverage with the Gradle-wrapper forms
   (`./gradlew checkstyleMain`, `./gradlew compileJava`, `./gradlew test`,
   `./gradlew jacocoTestReport`) — these match the Gradle half of the prior
   `DEFAULT_TOOLS.java`, so Gradle projects keep their previous commands. Otherwise the
   registry Maven commands stand. Implemented as a thin nuance INSIDE tool-detector — no
   language YAML edited.

3. **RUBY — re-prefix `bundle exec` on test/coverage when a Gemfile is present.** The
   registry ruby toolchain is `rspec` (test) and `rspec` (coverage) without the bundler
   prefix. Decision: when a `Gemfile` is present, prefix `bundle exec ` on the ruby
   `test` and `coverage` commands (→ `bundle exec rspec`), preserving bundler semantics.
   Detected via `*.gemspec` without a Gemfile keeps the bare command (no bundler in play).
   Implemented inside tool-detector — no YAML edited.
