---
title: "CR2 — Top-20 language capability data (the remaining 14)"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00027-cr1-capability-registry-core
priority: HIGH
program: ctoc-capability-registry
iron_loop: true
files:
  - ".ctoc/capabilities/languages/java.yaml"
  - ".ctoc/capabilities/languages/csharp.yaml"
  - ".ctoc/capabilities/languages/cpp.yaml"
  - ".ctoc/capabilities/languages/c.yaml"
  - ".ctoc/capabilities/languages/javascript.yaml"
  - ".ctoc/capabilities/languages/sql.yaml"
  - ".ctoc/capabilities/languages/php.yaml"
  - ".ctoc/capabilities/languages/ruby.yaml"
  - ".ctoc/capabilities/languages/swift.yaml"
  - ".ctoc/capabilities/languages/r.yaml"
  - ".ctoc/capabilities/languages/scala.yaml"
  - ".ctoc/capabilities/languages/elixir.yaml"
  - ".ctoc/capabilities/languages/objectivec.yaml"
  - ".ctoc/capabilities/languages/lua.yaml"
  - "tests/capability-registry-top20.test.js"
---

# CR2 — Complete the top-20 language data

CR1 seeded 6 (rust, python, typescript, go, dart, kotlin). This adds the
remaining 14 to reach the top-20, in the EXACT schema CR1 established
(`.ctoc/capabilities/schema.md` is the contract — read it first and match it
byte-for-byte: `language, detectionMarkers, extensions, toolchain{lint,format,
typecheck,test,coverage,security,depsAudit,build}, run{shapes,honest},
configScaffold, verified`).

## The toolchain matrix (stable 2026 tooling — author from this; mark UNVERIFIED anything you change)
- **java**: detect pom.xml/build.gradle/build.gradle.kts; lint checkstyle / `mvn checkstyle:check`; format `mvn spotless:check` (or google-java-format); typecheck `mvn -q compile`; test `mvn test` (alt `gradle test`); coverage jacoco `mvn jacoco:report`; security spotbugs `mvn com.github.spotbugs:spotbugs-maven-plugin:check`; depsAudit `mvn org.owasp:dependency-check-maven:check` (alt osv-scanner); build `mvn package`; run {server:"mvn spring-boot:run", cli:"java -jar target/*.jar"} honest:true.
- **csharp** (.NET): detect *.csproj/*.sln; lint+format `dotnet format --verify-no-changes`; typecheck `dotnet build`; test `dotnet test`; coverage `dotnet test --collect:"XPlat Code Coverage"`; security `dotnet list package --vulnerable` (alt security-code-scan); depsAudit `dotnet list package --vulnerable --include-transitive`; build `dotnet build -c Release`; run {server:"dotnet run", cli:"dotnet run"} honest:true.
- **cpp**: detect CMakeLists.txt/*.cpp/*.hpp; lint `clang-tidy`; format `clang-format --dry-run --Werror`; typecheck (compile) `cmake --build build`; test `ctest --test-dir build` (gtest/catch2); coverage gcov/lcov; security `cppcheck --enable=all` (alt flawfinder); depsAudit UNVERIFIED (C++ has no std package manager — conan/vcpkg vary); build `cmake -S . -B build && cmake --build build`; run {cli:"./build/<binary>"} honest:true.
- **c**: detect Makefile/*.c/*.h; lint `clang-tidy`; format `clang-format --dry-run --Werror`; typecheck (compile) `make`; test (varies — ctest/unity) mark generic `ctest`; coverage gcov; security `cppcheck --enable=all` (alt flawfinder); depsAudit UNVERIFIED; build `make`; run {cli:"./<binary>"} honest:true.
- **javascript**: detect package.json (WITHOUT tsconfig — JS not TS); lint `eslint .` (alt `biome check .`); format `prettier --check .`; typecheck `tsc --noEmit --allowJs --checkJs` (optional — JS has none natively; mark note); test `npm test` (alt vitest/jest); coverage `c8 npm test`; security `semgrep --config=p/javascript`; depsAudit `npm audit`; build (bundler varies) `npm run build`; run {web:"npm run dev", server:"npm start"} honest:true.
- **sql**: detect *.sql/migrations/; lint+format `sqlfluff lint` / `sqlfluff format`; typecheck N/A; test (dbt/pgtap vary) mark generic UNVERIFIED; coverage N/A; security `sqlfluff` (dialect rules) — SQL SAST is not standard, security = UNVERIFIED note; depsAudit N/A; build N/A; run N/A (SQL is not a runnable app — honest:false, run shapes empty). SQL is deliberately partial — most phases N/A, and that is HONEST, not a gap.
- **php**: detect composer.json; lint `phpstan analyse` (alt `php-cs-fixer fix --dry-run`); format `php-cs-fixer fix --dry-run --diff`; typecheck `phpstan analyse` (alt psalm); test `phpunit` (alt pest); coverage `phpunit --coverage-clover`; security `psalm --taint-analysis` (alt phpstan); depsAudit `composer audit`; build `composer install --no-dev`; run {server:"php artisan serve" (Laravel) / "php -S localhost:8000"} honest:true.
- **ruby**: detect Gemfile/*.gemspec; lint `rubocop`; format `rubocop -a --dry-run` (or standardrb); typecheck `srb tc` (sorbet — optional, note); test `rspec` (alt `rake test`); coverage simplecov; security `brakeman` (Rails SAST); depsAudit `bundler-audit check`; build `bundle install`; run {server:"rails server", cli:"ruby"} honest:true.
- **swift**: detect Package.swift/*.xcodeproj/Podfile; lint `swiftlint`; format `swift-format lint` (alt swiftformat); typecheck `swift build` (or `xcodebuild build`); test `swift test` (alt `xcodebuild test`); coverage `swift test --enable-code-coverage`; security UNVERIFIED (no standard Swift SAST — swiftlint is style); depsAudit UNVERIFIED (SwiftPM has no std audit); build `swift build -c release` (or xcodebuild); run {cli:"swift run", mobile:"xcodebuild build"} honest:build-is-last-mile for mobile.
- **r**: detect DESCRIPTION/*.R/*.Rproj; lint `Rscript -e "lintr::lint_dir()"`; format `Rscript -e "styler::style_dir()"`; typecheck N/A; test `Rscript -e "testthat::test_dir('tests')"`; coverage `Rscript -e "covr::package_coverage()"`; security UNVERIFIED (no standard R SAST); depsAudit UNVERIFIED; build `R CMD build .`; run {cli:"Rscript"} honest:true.
- **scala**: detect build.sbt/build.sc; lint `scalafix --check` (alt wartremover); format `scalafmt --test`; typecheck (compile) `sbt compile`; test `sbt test` (scalatest); coverage `sbt coverage test coverageReport` (scoverage); security UNVERIFIED (no std Scala SAST); depsAudit `sbt dependencyCheck` (OWASP) — mark UNVERIFIED (plugin); build `sbt package`; run {server:"sbt run", cli:"sbt run"} honest:true.
- **elixir**: detect mix.exs; lint `mix credo --strict`; format `mix format --check-formatted`; typecheck `mix dialyzer`; test `mix test` (exunit); coverage `mix test --cover` (alt excoveralls); security `mix sobelow` (Phoenix SAST — real, verified); depsAudit `mix deps.audit` (alt `mix hex.audit`); build `mix compile`; run {server:"mix phx.server", cli:"iex -S mix"} honest:true.
- **objectivec**: detect *.m/*.h/*.xcodeproj/Podfile; lint `oclint`; format `clang-format --dry-run --Werror`; typecheck (compile) `xcodebuild build`; test `xcodebuild test` (XCTest); coverage xcodebuild coverage; security UNVERIFIED; depsAudit UNVERIFIED (CocoaPods/SwiftPM); build `xcodebuild`; run {mobile:"xcodebuild build"} honest:build-is-last-mile.
- **lua**: detect *.lua/rockspec; lint `luacheck .`; format `stylua --check .`; typecheck N/A (or `luau-analyze` for Luau — note); test `busted`; coverage `luacov`; security UNVERIFIED; depsAudit UNVERIFIED (luarocks has no std audit); build N/A (interpreted); run {cli:"lua <entry>.lua"} honest:true.

RULE: every cmd/tool above is real. Where the matrix says UNVERIFIED, set
`verified: UNVERIFIED` (the coordinator web-verifies at the boundary). Where a
phase is genuinely N/A for the language (SQL run, Lua typecheck), OMIT that phase
or mark it `applicable: false` per the schema — that is HONEST, not a gap. Do NOT
invent a tool to fill an N/A slot.

### Wiring — the live call sites (MANDATORY)
Pure data consumed by the LIVE capability-registry engine (CR1, already wired to
app-runner). New YAML files are loaded by `load()` — reachable via the engine's
live consumer. No new module; no dead code.

### Test Plan (TDD-Red first) — tests/capability-registry-top20.test.js
For all 20 languages: `capabilitiesFor(lang)` loads; every present toolchain
phase has a non-empty cmd + a tool + a `verified` provenance (`web-2026-07` or
`UNVERIFIED`, never empty/`guessed`); `detectLanguages` finds each via a marker
fixture (e.g. Gemfile→ruby, composer.json→php, mix.exs→elixir, *.csproj→csharp).
SQL has no run shape (honest:false). Assert exactly 20 language files exist.
Assert NO cmd contains a shell metacharacter that would break argv execution
later (the registry returns strings; CR5/CR6 will argv-split — keep cmds simple).

## Execution Plan (Steps 8-16)
Step 8 TEST red · Step 9 PREPARE (read schema.md + one CR1 yaml e.g. rust.yaml as
the exact template) · Step 10 IMPLEMENT the 14 files from the matrix · Step 11
REVIEW (schema parity with CR1 files; every cmd real or UNVERIFIED) · Step 13
SECURE (no cmd with shell injection chars) · Step 14 VERIFY (named test + the
existing capability-registry.test.js still green + eslint on the test; no git) ·
Step 16 REPORT (the 14 langs, every UNVERIFIED entry listed for boundary
web-verification, every N/A phase).

## Decisions Taken Under Ambiguity

Authored from the plan's matrix; every non-obvious choice below is documented, no
stubs. The current detection engine (`capability-registry.js`) is glob-less and
CR3 owns engine changes, so every language needed a REAL exact-filename marker the
current engine can match; extension globs are carried alongside for CR3.

1. **Detection markers vs. the glob-only matrix.** The matrix detects several
   languages by extension (`*.csproj`, `*.m`, `*.lua`, `*.sql`). The current engine
   only matches exact filenames, so each such language also declares a real exact
   marker the test fixture creates: csharp→`global.json`, cpp→`CMakeLists.txt`,
   c→`Makefile`, javascript→`package.json`, sql→`dbt_project.yml`, r→`DESCRIPTION`,
   lua→`.luacheckrc`, objectivec→`Podfile`, swift→`Package.swift`. The extension
   globs (`*.csproj`, `*.m`, etc.) are ALSO listed so CR3's glob detector activates
   them; the current engine harmlessly no-matches a literal `*.x`.
2. **Marker collision avoidance.** `build.gradle.kts` stays Kotlin's only (java uses
   `pom.xml`/`build.gradle`). `Podfile` is assigned to Objective-C only and Swift is
   detected via `Package.swift`, so the exact-match detector is unambiguous between
   the two Apple languages (both really use CocoaPods; the split is a detection
   choice, documented here).
3. **cpp build — no `&&`.** The matrix build is `cmake -S . -B build && cmake --build
   build`; `&&` chains two commands and is NOT argv-safe. The returned build cmd is
   the single `cmake --build build`; `cmake -S . -B build` is the configure
   prerequisite (noted in the file).
4. **Run-target placeholders → concrete argv-safe paths.** The matrix's
   `./build/<binary>` (cpp) and `lua <entry>.lua` use `<>` angle brackets, which are
   shell redirection and break argv. Replaced with concrete conventional entries:
   cpp→`./build/app`, c→`./a.out` (cc's default output), lua→`lua main.lua`.
5. **`java` run `java -jar target/*.jar` kept verbatim.** The `*` is a glob, not a
   command-chaining metacharacter; jar-name resolution is CR6's execution concern.
   The argv-safety test bans chaining/redirect/substitution chars (`; & | ` $ < >`
   newline), not globs/quotes/parens.
6. **UNVERIFIED provenance (coordinator web-verifies at the boundary).** Set exactly
   where the matrix flagged it, plus two honest additions where no CI-standard
   invocation exists: `javascript.typecheck` (`tsc --checkJs` is an opt-in TS tool on
   JS, not native) and `ruby.typecheck` (Sorbet is optional) and `ruby.coverage`
   (SimpleCov has no standalone CLI — it piggybacks the test run). Full list in the
   executor report.
7. **N/A phases OMITTED, never fabricated.** sql omits typecheck/coverage/depsAudit/
   build (and has `run.honest:false` with no run shape); r and lua omit typecheck;
   lua omits build. Honest partial coverage, per schema.
8. **Real tool for each UNVERIFIED slot (never invented).** C/C++ depsAudit uses
   `osv-scanner` (real, cross-ecosystem; UNVERIFIED because C/C++ have no lockfile
   standard). SQL security reuses `sqlfluff lint` (UNVERIFIED — SQL SAST is not
   standard). Swift/Obj-C/Scala/R/Lua UNVERIFIED security reuse the language's real
   linter, honestly flagged as not-a-SAST.

### Executor verification (Step 14)
- `tests/capability-registry-top20.test.js`: 66 tests, 66 pass, 0 fail, 0 skipped.
- `tests/capability-registry.test.js` (CR1): 29 tests, 29 pass, 0 fail (stayed green).
- `tests/app-runner.test.js` (live consumer of `load()`): 13 pass, 0 fail.
- `eslint tests/capability-registry-top20.test.js`: clean (exit 0, 0 warnings).
