# C++ Strict Quality Config

Strict mode configuration for C++ projects with clang-tidy and cppcheck.

## Mode: Strict

- Coverage: 80% minimum
- clang-tidy warnings as errors
- cppcheck with standard rules
- GoogleTest for testing

## clang-tidy Config (`.clang-tidy`)

```yaml
---
Checks: >
  -*,
  bugprone-*,
  cert-*,
  clang-analyzer-*,
  cppcoreguidelines-*,
  google-*,
  hicpp-*,
  misc-*,
  modernize-*,
  performance-*,
  portability-*,
  readability-*,
  -modernize-use-trailing-return-type,
  -readability-identifier-length,
  -cppcoreguidelines-avoid-magic-numbers,
  -readability-magic-numbers

WarningsAsErrors: >
  bugprone-*,
  cert-*,
  clang-analyzer-*

HeaderFilterRegex: '.*'
FormatStyle: file

CheckOptions:
  # Complexity limits
  - key: readability-function-cognitive-complexity.Threshold
    value: 10
  - key: readability-function-size.LineThreshold
    value: 50
  - key: readability-function-size.StatementThreshold
    value: 40
  - key: readability-function-size.ParameterThreshold
    value: 6

  # Naming conventions (Google style)
  - key: readability-identifier-naming.ClassCase
    value: CamelCase
  - key: readability-identifier-naming.FunctionCase
    value: CamelCase
  - key: readability-identifier-naming.VariableCase
    value: lower_case
  - key: readability-identifier-naming.ConstantCase
    value: UPPER_CASE
  - key: readability-identifier-naming.PrivateMemberSuffix
    value: '_'

  # Modern C++ preferences
  - key: modernize-use-nullptr.NullMacros
    value: 'NULL'
  - key: modernize-loop-convert.MinConfidence
    value: reasonable
  - key: modernize-pass-by-value.IncludeStyle
    value: llvm

  # Performance
  - key: performance-unnecessary-value-param.AllowedTypes
    value: ''
```

## clang-format Config (`.clang-format`)

```yaml
---
Language: Cpp
BasedOnStyle: Google
Standard: c++20

# Indentation
IndentWidth: 4
TabWidth: 4
UseTab: Never
AccessModifierOffset: -4
IndentCaseLabels: true
IndentPPDirectives: BeforeHash
NamespaceIndentation: None

# Line length
ColumnLimit: 100

# Braces
BreakBeforeBraces: Attach
AllowShortBlocksOnASingleLine: Empty
AllowShortFunctionsOnASingleLine: Inline
AllowShortIfStatementsOnASingleLine: Never
AllowShortLoopsOnASingleLine: false

# Includes
IncludeBlocks: Regroup
IncludeCategories:
  - Regex: '^<.*\.h>'
    Priority: 1
  - Regex: '^<.*>'
    Priority: 2
  - Regex: '.*'
    Priority: 3
SortIncludes: CaseSensitive

# Alignment
AlignAfterOpenBracket: Align
AlignConsecutiveAssignments: false
AlignConsecutiveDeclarations: false
AlignOperands: true
AlignTrailingComments: true

# Spacing
SpaceAfterCStyleCast: false
SpaceAfterTemplateKeyword: true
SpaceBeforeAssignmentOperators: true
SpaceBeforeParens: ControlStatements
SpacesInAngles: false
SpacesInContainerLiterals: true
SpacesInParentheses: false

# Other
PointerAlignment: Left
ReflowComments: true
SortUsingDeclarations: true
```

## cppcheck Config (`cppcheck.cfg`)

```ini
# cppcheck configuration for strict mode
--enable=warning,style,performance,portability
--error-exitcode=1
--suppress=missingIncludeSystem
--inline-suppr
--std=c++20
--platform=unix64
--library=googletest
--max-ctu-depth=2
-j 4
```

## CMakeLists.txt Integration

```cmake
cmake_minimum_required(VERSION 3.20)
project(MyProject LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Strict compiler warnings
add_compile_options(
    -Wall
    -Wextra
    -Wpedantic
    -Wconversion
    -Wsign-conversion
    -Wshadow
    -Wformat=2
    -Wunused
    -Wnull-dereference
    -Wdouble-promotion
)

# clang-tidy integration
find_program(CLANG_TIDY clang-tidy)
if(CLANG_TIDY)
    set(CMAKE_CXX_CLANG_TIDY ${CLANG_TIDY})
endif()

# cppcheck integration
find_program(CPPCHECK cppcheck)
if(CPPCHECK)
    set(CMAKE_CXX_CPPCHECK
        ${CPPCHECK}
        --enable=warning,style,performance,portability
        --error-exitcode=1
        --suppress=missingIncludeSystem
        --inline-suppr
        --std=c++20
    )
endif()

# GoogleTest
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
FetchContent_MakeAvailable(googletest)

enable_testing()

# Coverage (gcov/lcov)
option(COVERAGE "Enable coverage reporting" OFF)
if(COVERAGE)
    add_compile_options(--coverage -O0 -g)
    add_link_options(--coverage)
endif()
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 70% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 10 |
| Lines per function | 50 |
| Parameters | 6 |

## Commands

```bash
# Build with analysis
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build

# Run clang-tidy manually
clang-tidy -p build src/*.cpp --warnings-as-errors='bugprone-*,cert-*'

# Run cppcheck
cppcheck --enable=warning,style,performance,portability --error-exitcode=1 src/

# Format check
find src include -name '*.cpp' -o -name '*.hpp' | xargs clang-format --dry-run --Werror

# Run tests
ctest --test-dir build --output-on-failure

# Coverage
cmake -B build -DCOVERAGE=ON
cmake --build build
ctest --test-dir build
lcov --capture --directory build --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/test/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage
lcov --summary coverage.info | grep -E "lines.*: [0-7][0-9]\.[0-9]" && exit 1

# All quality checks
cmake -B build && cmake --build build && ctest --test-dir build && \
clang-tidy -p build src/*.cpp && cppcheck --error-exitcode=1 src/
```

## Install

```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy clang-format cppcheck lcov

# macOS
brew install llvm cppcheck lcov

# Verify versions (2024-2025 recommended)
clang-tidy --version  # LLVM 17+
cppcheck --version    # 2.13+
```

## CI Integration (GitHub Actions)

```yaml
name: C++ Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install tools
        run: |
          sudo apt-get update
          sudo apt-get install -y clang-tidy cppcheck lcov

      - name: Configure
        run: cmake -B build -DCOVERAGE=ON

      - name: Build
        run: cmake --build build

      - name: Test with coverage
        run: |
          ctest --test-dir build --output-on-failure
          lcov --capture --directory build --output-file coverage.info
          lcov --remove coverage.info '/usr/*' '*/test/*' -o coverage.info
          lcov --summary coverage.info

      - name: clang-tidy
        run: clang-tidy -p build src/*.cpp --warnings-as-errors='bugprone-*,cert-*'

      - name: cppcheck
        run: cppcheck --enable=warning,style,performance,portability --error-exitcode=1 src/
```
