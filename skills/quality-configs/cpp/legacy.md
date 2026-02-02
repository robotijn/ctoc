# C++ Legacy Quality Config

Gradual adoption for existing C++ projects.

## Mode: Legacy

- Coverage: 50% minimum
- clang-tidy with warnings (not errors)
- Relaxed complexity limits
- Focus on critical issues only

## clang-tidy Config (`.clang-tidy`)

```yaml
---
Checks: >
  -*,
  bugprone-use-after-move,
  bugprone-dangling-handle,
  bugprone-dynamic-static-initializers,
  bugprone-exception-escape,
  bugprone-forwarding-reference-overload,
  bugprone-infinite-loop,
  bugprone-move-forwarding-reference,
  bugprone-signed-char-misuse,
  bugprone-sizeof-container,
  bugprone-sizeof-expression,
  bugprone-string-constructor,
  bugprone-undefined-memory-manipulation,
  bugprone-unhandled-self-assignment,
  bugprone-unused-raii,
  cert-dcl50-cpp,
  cert-dcl58-cpp,
  cert-err52-cpp,
  cert-err58-cpp,
  cert-err60-cpp,
  cert-mem57-cpp,
  clang-analyzer-core.*,
  clang-analyzer-cplusplus.*,
  clang-analyzer-deadcode.*,
  clang-analyzer-security.*,
  misc-redundant-expression,
  misc-unused-using-decls,
  modernize-use-nullptr,
  modernize-use-override,
  performance-move-const-arg,
  performance-unnecessary-copy-initialization

# Only critical issues as errors
WarningsAsErrors: >
  clang-analyzer-core.*,
  clang-analyzer-security.*

HeaderFilterRegex: '.*'
FormatStyle: file

CheckOptions:
  # Relaxed complexity limits for legacy code
  - key: readability-function-cognitive-complexity.Threshold
    value: 25
  - key: readability-function-size.LineThreshold
    value: 100
  - key: readability-function-size.StatementThreshold
    value: 80
  - key: readability-function-size.ParameterThreshold
    value: 8

  # Lenient naming (don't enforce)
  - key: readability-identifier-naming.IgnoreMainLikeFunctions
    value: true
```

## clang-format Config (`.clang-format`)

```yaml
---
Language: Cpp
BasedOnStyle: LLVM
Standard: c++17

# Indentation - match existing style
IndentWidth: 4
TabWidth: 4
UseTab: Never

# Line length - relaxed
ColumnLimit: 120

# Braces - minimal changes
BreakBeforeBraces: Attach
AllowShortBlocksOnASingleLine: Always
AllowShortFunctionsOnASingleLine: All
AllowShortIfStatementsOnASingleLine: WithoutElse
AllowShortLoopsOnASingleLine: true

# Don't reorder includes (preserve existing)
SortIncludes: Never
IncludeBlocks: Preserve

# Minimal formatting changes
AlignAfterOpenBracket: DontAlign
AlignConsecutiveAssignments: false
AlignConsecutiveDeclarations: false
AlignTrailingComments: false

# Preserve existing spacing where possible
SpaceAfterCStyleCast: false
SpaceBeforeParens: ControlStatements
SpacesInParentheses: false

PointerAlignment: Right
ReflowComments: false
```

## cppcheck Config (`cppcheck.cfg`)

```ini
# cppcheck configuration for legacy mode - focus on critical issues
--enable=warning
--error-exitcode=1
--suppress=missingIncludeSystem
--suppress=unusedFunction
--suppress=unmatchedSuppression
--inline-suppr
--std=c++17
--platform=unix64
-j 4
```

## CMakeLists.txt Integration

```cmake
cmake_minimum_required(VERSION 3.16)
project(MyProject LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Basic warnings - no -Werror for legacy code
add_compile_options(
    -Wall
    -Wextra
    # No -Werror - allow warnings during migration
)

# Optional clang-tidy - can be disabled
option(ENABLE_CLANG_TIDY "Enable clang-tidy" OFF)
if(ENABLE_CLANG_TIDY)
    find_program(CLANG_TIDY clang-tidy)
    if(CLANG_TIDY)
        set(CMAKE_CXX_CLANG_TIDY ${CLANG_TIDY})
    endif()
endif()

# Optional cppcheck - can be disabled
option(ENABLE_CPPCHECK "Enable cppcheck" OFF)
if(ENABLE_CPPCHECK)
    find_program(CPPCHECK cppcheck)
    if(CPPCHECK)
        set(CMAKE_CXX_CPPCHECK
            ${CPPCHECK}
            --enable=warning
            --suppress=missingIncludeSystem
            --suppress=unusedFunction
            --inline-suppr
            --std=c++17
        )
    endif()
endif()

# GoogleTest (optional for legacy projects)
option(ENABLE_TESTING "Enable testing" OFF)
if(ENABLE_TESTING)
    include(FetchContent)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
    )
    FetchContent_MakeAvailable(googletest)
    enable_testing()
endif()

# Coverage (optional)
option(COVERAGE "Enable coverage reporting" OFF)
if(COVERAGE)
    add_compile_options(--coverage -O0 -g)
    add_link_options(--coverage)
endif()
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 25 |
| Cognitive | 25 |
| Lines per function | 100 |
| Parameters | 8 |

## Adoption Strategy

### Phase 1: Critical Issues Only (Weeks 1-4)

```bash
# Start with security-critical checks only
clang-tidy -p build src/*.cpp \
  --checks='-*,clang-analyzer-security.*,clang-analyzer-core.*'

# Run cppcheck with warnings only
cppcheck --enable=warning src/
```

### Phase 2: Add Bug Detection (Weeks 5-8)

```bash
# Add bugprone checks
clang-tidy -p build src/*.cpp \
  --checks='-*,clang-analyzer-*,bugprone-use-after-move,bugprone-dangling-handle'
```

### Phase 3: Add Performance (Weeks 9-12)

```bash
# Add performance checks
clang-tidy -p build src/*.cpp \
  --checks='-*,clang-analyzer-*,bugprone-*,performance-*'
```

### Phase 4: Graduate to Strict

Once 80% coverage is achieved and no warnings remain, migrate to `strict.md` configuration.

## Commands

```bash
# Build without static analysis (fastest)
cmake -B build
cmake --build build

# Build with optional analysis
cmake -B build -DENABLE_CLANG_TIDY=ON -DENABLE_CPPCHECK=ON
cmake --build build

# Run clang-tidy manually (critical checks only)
clang-tidy -p build src/*.cpp \
  --checks='-*,clang-analyzer-core.*,clang-analyzer-security.*'

# Run cppcheck (warnings only)
cppcheck --enable=warning --suppress=unusedFunction src/

# Format check (dry run, no enforcement)
find src include -name '*.cpp' -o -name '*.hpp' | xargs clang-format --dry-run

# Format in place (when ready)
find src include -name '*.cpp' -o -name '*.hpp' | xargs clang-format -i

# Run tests (if enabled)
cmake -B build -DENABLE_TESTING=ON
cmake --build build
ctest --test-dir build --output-on-failure

# Coverage check (50% threshold)
cmake -B build -DCOVERAGE=ON -DENABLE_TESTING=ON
cmake --build build
ctest --test-dir build
lcov --capture --directory build --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/test/*' --output-file coverage.info
lcov --summary coverage.info
```

## Baseline Generation

For legacy codebases, generate a baseline to suppress existing issues:

```bash
# Generate baseline of existing issues
clang-tidy -p build src/*.cpp 2>&1 | tee clang-tidy-baseline.txt

# Create suppression file for cppcheck
cppcheck --enable=warning src/ 2>&1 | \
  grep -oP '\[\w+\]' | sort -u > cppcheck-suppressions.txt

# Use baseline in future runs
clang-tidy -p build src/*.cpp 2>&1 | \
  grep -v -f clang-tidy-baseline.txt
```

## Install

```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy clang-format cppcheck lcov

# macOS
brew install llvm cppcheck lcov
```

## CI Integration (GitHub Actions)

```yaml
name: C++ Legacy Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install tools
        run: sudo apt-get install -y clang-tidy cppcheck lcov

      - name: Configure
        run: cmake -B build -DENABLE_TESTING=ON -DCOVERAGE=ON

      - name: Build
        run: cmake --build build

      - name: Test
        run: ctest --test-dir build --output-on-failure

      - name: Coverage
        run: |
          lcov --capture --directory build --output-file coverage.info
          lcov --remove coverage.info '/usr/*' '*/test/*' -o coverage.info
          lcov --summary coverage.info
          # Warn (don't fail) if coverage < 50%
          COVERAGE=$(lcov --summary coverage.info 2>&1 | grep lines | grep -oP '\d+\.\d+')
          if (( $(echo "$COVERAGE < 50.0" | bc -l) )); then
            echo "::warning::Coverage $COVERAGE% is below 50% threshold"
          fi

      - name: clang-tidy (critical only)
        run: |
          clang-tidy -p build src/*.cpp \
            --checks='-*,clang-analyzer-core.*,clang-analyzer-security.*' || \
            echo "::warning::clang-tidy found issues"
        continue-on-error: true

      - name: cppcheck (warnings only)
        run: cppcheck --enable=warning --suppress=unusedFunction src/ || true
        continue-on-error: true
```

## Migration Checklist

- [ ] Install clang-tidy, clang-format, cppcheck
- [ ] Add `.clang-tidy` with legacy config
- [ ] Add `.clang-format` with legacy config
- [ ] Generate baseline of existing issues
- [ ] Enable CI with `continue-on-error: true`
- [ ] Add GoogleTest and first unit tests
- [ ] Reach 50% coverage
- [ ] Fix all critical issues (security, core analyzers)
- [ ] Fix bugprone issues
- [ ] Fix performance issues
- [ ] Reach 80% coverage
- [ ] Migrate to `strict.md` configuration
