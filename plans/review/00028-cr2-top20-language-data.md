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
   languages by extension (`*.csproj`, `*.m`, `*.lua`, `*.sql`). At CR2 authoring the
   engine only matched exact filenames, so each such language ALSO declared a real
   exact marker the test fixture created: csharp→`global.json`, cpp→`CMakeLists.txt`,
   c→`Makefile`, javascript→`package.json`, sql→`dbt_project.yml`, r→`DESCRIPTION`,
   lua→`.luacheckrc`, objectivec→`Podfile`, swift→`Package.swift`. The extension
   globs (`*.csproj`, `*.m`, etc.) were also listed so CR3's glob detector would
   activate them.

   **RECONCILED (review, 2026-07-27):** the engine is now glob-AWARE, and CR5-FIX
   narrowed two languages away from the exact markers this decision originally
   chose, because those markers mis-asserted the language. As SHIPPED on disk:
   `c` is detected ONLY by `["*.c", "*.h"]` — `Makefile` was REMOVED (a generic build
   tool that mis-asserted C on any Make-using repo); `objectivec` is detected ONLY by
   `["*.m"]` — `Podfile`/`*.xcodeproj` were REMOVED (both shared with Swift, so
   non-disambiguating). The other languages carry their extension globs directly
   (`sql: *.sql`, `csharp: *.csproj/*.sln`, `swift: *.xcodeproj`, `r: *.Rproj`,
   `lua: *.lua/*.rockspec`, `cpp: *.cpp/*.hpp`, `ruby: *.gemspec`) alongside a real
   filename marker where one exists. The top-20 test's `DETECT_MARKER` matches this
   shipped reality (`c: main.c`, `objectivec: foo.m`), and the six CR5-FIX
   narrowed-marker cases assert the removals. This decision's original claim
   ("current engine only matches exact filenames … c→Makefile … objectivec→Podfile")
   no longer describes the shipped data and is superseded by this note.
2. **Marker collision avoidance.** `build.gradle.kts` stays Kotlin's only (java uses
   `pom.xml`/`build.gradle`) — this half holds as shipped. The original plan also
   assigned `Podfile` to Objective-C and detected Swift via `Package.swift` to keep
   the two Apple languages unambiguous.

   **RECONCILED (review, 2026-07-27):** CR5-FIX F2 superseded the Podfile assignment.
   As shipped, `Podfile` is NOT a marker for Objective-C at all (it is shared with
   Swift and does not disambiguate); Objective-C is detected only by `*.m` and Swift
   only by `Package.swift`/`*.xcodeproj`. The languages remain unambiguous, but via
   the source-extension split, not the Podfile assignment this decision described.
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

### Executor verification (Step 14) — original run, superseded by the review re-run below
The original executor verification ran only the three narrowed suites plus eslint
(NOT the gated `npm test`), and recorded these numbers at CR2 authoring time:
- `tests/capability-registry-top20.test.js`: 66 tests, 66 pass, 0 fail, 0 skipped.
- `tests/capability-registry.test.js` (CR1): 29 tests, 29 pass, 0 fail (stayed green).
- `tests/app-runner.test.js` (live consumer of `load()`): 13 pass, 0 fail.
- `eslint tests/capability-registry-top20.test.js`: clean (exit 0, 0 warnings).

**Those three counts are now STALE** — the shared test files grew after CR2 was
authored (CR3/CR5-FIX added the six narrowed-marker cases to the top-20 file; CR3 and
the frameworks/project-types waves grew the CR1 and app-runner files). The narrowed run
was also NOT the real Step 14 gate: `npm test` (`src/scripts/test-gate.js`) is the gated
entry point that enforces the coverage floor and the zero-skipped gate, and it was never
run. The review re-run below runs it and records the real evidence.

### Step 14 VERIFY — review re-run (the REAL gate), 2026-07-27
- **`npm test` (full gate, the gated entry point):** `[CTOC test-gate] coverage 99.14%
  (threshold 99%), skipped 0, failed 0` → **PASS**. The whole suite is green, coverage
  is at/above the 99 floor, zero skipped, zero flaky. This is the evidence the narrowed
  run omitted.
- **`npx tsc --noEmit`:** clean, zero errors. (Any earlier "full-suite red / tsc errors"
  concern is REFUTED as stale — the tree is green on both instruments.)
- `tests/capability-registry-top20.test.js`: **73 tests, 73 pass, 0 fail, 0 skipped**
  (was 66 — the six CR5-FIX narrowed-marker cases were added after authoring).
- `tests/capability-registry.test.js` (CR1): **61 tests, 61 pass, 0 fail** (was 29 —
  grew via CR3/framework/project-type overlay tests on the shared engine file).
- `tests/app-runner.test.js` (live consumer of `load()`): **42 tests, 42 pass, 0 fail**
  (was 13 — grew via CR3 taxonomy/pipeline wiring tests).
- `eslint tests/capability-registry-top20.test.js`: clean (exit 0, 0 warnings).
- Registry load of the shipped seed: `warnings: []`, 26 languages loaded, all 14 CR2
  languages present and well-formed. Every claimed count above matches disk.

## Step 16 — FINAL REVIEW report (review reconciliation, 2026-07-27)

The 14 CR2 language files shipped correctly and are well-formed; the shipped DATA
needed no changes. What was wrong was the plan RECORD — stale numbers and stale
detection-marker claims that no longer matched the shipped data after later
CR3/CR5-FIX/framework work touched the shared engine and test files. This review
re-ran the real gate and reconciled the record to disk.

**Shipped deliverable (verified on disk).** All 14 files exist and load with zero
warnings: `java csharp cpp c javascript sql php ruby swift r scala elixir objectivec
lua`. Every present toolchain phase has a non-empty `cmd`, a named `tool`, and a
`verified` value of exactly `web-2026-07` or `UNVERIFIED` (never empty, never
`guessed`). SQL is honestly partial (`run.honest: false`, no run shape). No command
contains a shell control metacharacter. The `files:` frontmatter is accurate: all 14
declared YAML files plus `tests/capability-registry-top20.test.js` exist, and nothing
undeclared shipped.

**UNVERIFIED entries (for boundary web-verification), as shipped.** These are the
honestly-flagged slots where no CI-standard invocation could be confirmed:
`java.security` (SpotBugs without find-sec-bugs is a bug-pattern finder, not a SAST);
`csharp.security` (security-code-scan Roslyn analyzer, CLI integration varies);
`cpp.lint` and `c.lint` (clang-tidy needs a compile database); `c.test` (ctest needs a
pre-configured build dir); `c.depsAudit`/`cpp.depsAudit` (osv-scanner — real, but C/C++
have no lockfile standard); `javascript.typecheck` (`tsc --checkJs` is an opt-in TS tool
on JS); `sql.test` and `sql.security` (dbt/pgtap vary; SQL SAST is not standard);
`ruby.typecheck` (Sorbet optional) and `ruby.coverage` (SimpleCov has no standalone CLI);
`swift.security` (SwiftLint is style, not SAST); `scala.security` (no free canonical
Scala SAST); `r.security`/`r.depsAudit` (no standard R SAST or audit);
`objectivec.lint`/`objectivec.security` (OCLint needs a compile DB, not a confirmed
SAST) and `objectivec.depsAudit` (CocoaPods/SwiftPM have no standard audit);
`lua.security`/`lua.depsAudit` (no standard Lua SAST; LuaRocks has no audit command).

**N/A phases OMITTED (honest partial), as shipped.** `sql` omits
typecheck/coverage/depsAudit/build; `r` and `lua` omit typecheck; `lua` omits build.
Absent phase = honest N/A, never a stub.

**Defect dispositions (this review).**
1. Step 14 never ran the real gate — FIXED: ran `npm test` → PASS (99.14% ≥ 99, 0
   skipped, 0 fail) and `npx tsc --noEmit` → clean; recorded above.
2. Stale test counts in the record (top-20 66→73, CR1 29→61, app-runner 13→42) —
   FIXED: corrected to the real disk numbers with the reason each grew.
3. Stale detection-marker claims (Decisions #1/#2: `c→Makefile`, `objectivec→Podfile`,
   "engine matches only exact filenames") contradicted the shipped glob-aware data —
   FIXED: reconciled both decisions to the shipped reality (c narrowed to `*.c/*.h`,
   objectivec narrowed to `*.m`), preserving the original text plus a RECONCILED note.
4. "full-suite red / tsc errors" concern — REFUTED as stale: both instruments are green.

No shipped data or test was weakened. The record now matches disk.
