# Quality Configs

Strict quality enforcement configurations for 20 programming languages.

## Overview

CTOC provides quality configurations in three modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Strict** (default) | 80% coverage, standard complexity limits | New projects |
| **Strictest** | 90% coverage, tight complexity limits, no `any` | High-stakes projects |
| **Legacy** | 50% coverage, relaxed limits, warnings allowed | Migrating existing code |

## Supported Languages (20)

| Language | Linter | Formatter | Type Checker | Test Framework |
|----------|--------|-----------|--------------|----------------|
| TypeScript | ESLint 9 (flat config) | Prettier | tsc --strict | Vitest |
| Python | Ruff | Ruff | mypy --strict | pytest |
| Java | Checkstyle, SpotBugs | google-java-format | javac -Xlint:all | JUnit 5 |
| Go | golangci-lint | gofmt/goimports | go vet | go test |
| Rust | clippy (pedantic) | rustfmt | rustc | cargo test |
| C# | Roslyn analyzers | dotnet format | nullable enable | xUnit |
| PHP | PHPStan | PHP-CS-Fixer | PHPStan level 9 | PHPUnit/Pest |
| Ruby | RuboCop | RuboCop | Sorbet/Steep | RSpec |
| Swift | SwiftLint | swift-format | Swift compiler | XCTest |
| Kotlin | detekt, ktlint | ktlint | kotlinc | JUnit 5 |
| C++ | clang-tidy, cppcheck | clang-format | -Wall -Werror | GoogleTest |
| C | clang-tidy, cppcheck | clang-format | -Wall -Werror | Unity/CMocka |
| Scala | scalafmt, scalafix | scalafmt | -Xfatal-warnings | ScalaTest |
| Dart | dart analyze | dart format | dart analyze --fatal-infos | flutter test |
| Elixir | credo, dialyzer | mix format | dialyzer | ExUnit |
| Clojure | clj-kondo | cljfmt | clj-kondo | clojure.test |
| Haskell | hlint | ormolu/fourmolu | GHC -Wall -Werror | HSpec |
| Lua | luacheck | stylua | luacheck | busted |
| R | lintr | styler | lintr | testthat |
| Julia | JuliaLint | JuliaFormatter | Julia compiler | Test module |

## Usage

```bash
# Initialize quality config for detected language
ctoc quality init

# Initialize with specific mode
ctoc quality init --mode strictest

# Check current quality status
ctoc quality check

# View quality dashboard
ctoc quality dashboard
```

## Coverage Thresholds

| Mode | Lines | Branches | Functions | Statements |
|------|-------|----------|-----------|------------|
| Strict | 80% | 80% | 80% | 80% |
| Strictest | 90% | 90% | 90% | 90% |
| Legacy | 50% | 50% | 50% | 50% |

## Complexity Limits

| Metric | Strict | Strictest | Legacy |
|--------|--------|-----------|--------|
| Cyclomatic | 10 | 7 | 15 |
| Cognitive | 15 | 10 | 20 |
| Function length | 50 lines | 30 lines | 100 lines |
| File length | 400 lines | 300 lines | 600 lines |
| Parameters | 4 | 3 | 6 |
| Nesting depth | 4 | 3 | 6 |

## Per-Language Configuration

Each language has three mode files:
- `{language}/strict.md` - Default strict mode
- `{language}/strictest.md` - Maximum strictness
- `{language}/legacy.md` - Gradual adoption

See the individual language directories for detailed configurations.
