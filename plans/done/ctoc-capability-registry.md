---
type: vision
status: active
title: "CTOC Capability Registry — vision-to-working-app for the top 20 languages, top 50 frameworks, top 25 DS/ML, top 10 databases"
---

# Vision — one Capability Registry so CTOC builds, verifies, and RUNS any common stack

## The problem (verified on disk, 2026-07-15)
CTOC has the KNOWLEDGE (50 language skills, 211 framework skills) but not the
ENGINE. Four detection surfaces each carry a different, partial, inconsistent
language table, so end-to-end (detect → lint → typecheck → test → security →
run-the-app) only works for JS/TS/Python/Go:
- stack-detector (init): python/rust/kotlin/swift/dart + a few frameworks — but
  nothing downstream consumes kotlin/swift/dart.
- tool-detector (lint/type/test): js/ts/python/rust/java/c#/ruby/php; no
  dart/flutter/kotlin/swift/go; testFramework logic only js/ts/python.
- sast-runner (security): detects 8, dispatches only bandit/gosec/eslint;
  rust/ruby/php detected-but-never-scanned; java config unwired.
- app-runner (run last mile): web/server/cli/library from package.json ONLY — a
  Flutter/Android/Rust/.NET/Rails app has NO run support.

So "vision → working app" is real only for the JS/Python slice.

## The keystone — a single data-driven Capability Registry
`.ctoc/capabilities/**` (data) + `src/lib/capability-registry.js` (engine). One
source of truth keyed by `(language | framework | project-type)` returning:
`{ detectionMarkers, lint, format, typecheck, test, coverage, security,
depsAudit, build, runProbe, configScaffold }`. All four surfaces CONSUME it
instead of four drifting tables. Adding a language/framework becomes a one-file
change. Human decision 2026-07-15: "combine 1 and 3" — build the registry AND
run the harsh-critique best-practice corpus refresh together.

## Scope (websourced 2026 — sources in the session log)
- Top 20 languages: Python, C, C++, Java, C#, JavaScript, TypeScript, SQL, Go,
  Rust, PHP, Ruby, Swift, Kotlin, Dart, R, Scala, Elixir, Objective-C, Lua.
- ~50 frameworks (frontend/backend/mobile/desktop) incl. Flutter, React Native,
  Expo, SwiftUI, Jetpack Compose, KMP, .NET MAUI, Tauri, Electron.
- Top 25 DS/AI-ML/LLM (PyTorch…LangGraph, vLLM, Ollama, DSPy).
- Top 10 databases (Oracle…SQLite) + vector DBs (pgvector/Qdrant/…).
- Project types that ADJUST the pipeline: web-frontend, web-backend/API,
  mobile-crossplatform, mobile-native (android/ios), desktop, cli/binary,
  library/package, data-science/notebook, ml-training/serving,
  microservice/monorepo, infra/IaC — each with its config scaffold.

## 2026 best-practice toolchain anchors (websourced — the seed data)
- Python: ruff (lint+format, replaced flake8/black/isort), mypy, pytest,
  coverage/pytest-cov, bandit, pip-audit, uv (packaging). Run: uvicorn/python -m.
- JS/TS: biome OR eslint+prettier, tsc, vitest/jest, c8, semgrep, npm/pnpm audit.
- Rust: cargo clippy, cargo fmt, cargo check, cargo test / nextest, tarpaulin,
  cargo-audit. Run: cargo run / cargo build --release.
- Dart/Flutter: flutter analyze (+ dart fix), dart format, flutter test, DCM
  (optional deep), flutter build / flutter run.
- Kotlin/Android: ktlint + detekt (+ ktfmt), ./gradlew test, ./gradlew build,
  detekt as security-ish. Run: ./gradlew installDebug or build.
- Swift/iOS: swiftlint + swift-format, swift test / xcodebuild test, xcodebuild
  build. Run: build (emulator boot not CI-reliable).
- Go: go vet + golangci-lint, go build, go test, gosec. Run: go run.
- Java: checkstyle/spotbugs, mvn/gradle test, spotbugs (security). Run: mvn/gradle.
- C#/.NET: dotnet format, dotnet build, dotnet test, security-scan. Run: dotnet run.
- Ruby: rubocop, rspec, brakeman (security), bundler-audit. Run: rails server.
- PHP: phpstan/php-cs-fixer, phpunit, psalm. Run: php artisan serve (Laravel).
Mobile honest last mile: "build succeeds + tests pass" (emulator boot is not CI-
reliable) — runProbe returns applicable:false-but-built, NOT a false pass.

## The program (dependency graph — the human schedules from it)
- CR1 Registry core + schema + engine (`capability-registry.js`, `.ctoc/
  capabilities/schema.*`) + seed data for the 3 named priorities (Dart/Flutter,
  Kotlin/Android, Rust) + 2-3 already-covered langs to prove parity. KEYSTONE.
- CR2 Full top-20 language capability data (grounded per-language; each entry
  web-verified, no fabricated tool names).
- CR3 Project-type taxonomy + config scaffolds (each type adjusts the pipeline).
- CR4 Frameworks (top 50) + DS/ML (top 25) + databases (top 10) capability data.
- CR5 Wire the 4 surfaces to consume the registry (stack-detector, tool-detector,
  sast-runner, app-runner) — replacing their local tables. Flutter/Android/Rust
  become buildable/verifiable/runnable here.
- CR6 app-runner per-shape RUN last mile (flutter/cargo/gradle/dotnet/rails).
- CX Corpus best-practice refresh (the "3"): harsh-critique + web-verified
  update of the 50 lang + 211 framework skills to the 2026 toolchain; update/
  create the specialized agents (stack-chooser consumes the registry; per-domain
  scaffolders). Runs in waves; each skill web-verified, zero fabricated numbers.

## Invariants
- No fabricated tool names/commands — every capability entry web-verified or
  flagged UNVERIFIED, never guessed (cite-sources rule).
- The registry is data-driven; the engine is dumb. Adding a stack = a data file.
- Mobile/desktop "run" is honest: build+test is the CI-safe last mile.
- Every wired surface keeps its existing tests green (parity), then extends.
- Reachability: the registry module + data are consumed by live surfaces (no
  dead engine).
