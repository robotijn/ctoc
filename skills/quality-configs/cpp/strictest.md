# C++ Strictest Quality Config

Maximum strictness for C++ projects with all checks enabled.

## Mode: Strictest

- Coverage: 90% minimum
- All clang-tidy checks enabled
- -Wall -Werror -Wextra enforced
- Zero tolerance for warnings

## clang-tidy Config (`.clang-tidy`)

```yaml
---
Checks: >
  -*,
  bugprone-*,
  cert-*,
  clang-analyzer-*,
  concurrency-*,
  cppcoreguidelines-*,
  google-*,
  hicpp-*,
  llvm-*,
  misc-*,
  modernize-*,
  performance-*,
  portability-*,
  readability-*

WarningsAsErrors: '*'
HeaderFilterRegex: '.*'
FormatStyle: file

CheckOptions:
  # Strictest complexity limits
  - key: readability-function-cognitive-complexity.Threshold
    value: 10
  - key: readability-function-size.LineThreshold
    value: 50
  - key: readability-function-size.StatementThreshold
    value: 30
  - key: readability-function-size.ParameterThreshold
    value: 4
  - key: readability-function-size.BranchThreshold
    value: 10
  - key: readability-function-size.NestingThreshold
    value: 4

  # Strict naming conventions
  - key: readability-identifier-naming.ClassCase
    value: CamelCase
  - key: readability-identifier-naming.StructCase
    value: CamelCase
  - key: readability-identifier-naming.EnumCase
    value: CamelCase
  - key: readability-identifier-naming.EnumConstantCase
    value: CamelCase
  - key: readability-identifier-naming.EnumConstantPrefix
    value: k
  - key: readability-identifier-naming.FunctionCase
    value: CamelCase
  - key: readability-identifier-naming.VariableCase
    value: lower_case
  - key: readability-identifier-naming.GlobalConstantCase
    value: CamelCase
  - key: readability-identifier-naming.GlobalConstantPrefix
    value: k
  - key: readability-identifier-naming.ConstantCase
    value: CamelCase
  - key: readability-identifier-naming.ConstantPrefix
    value: k
  - key: readability-identifier-naming.PrivateMemberSuffix
    value: '_'
  - key: readability-identifier-naming.ProtectedMemberSuffix
    value: '_'
  - key: readability-identifier-naming.TemplateParameterCase
    value: CamelCase
  - key: readability-identifier-naming.TypeAliasCase
    value: CamelCase
  - key: readability-identifier-naming.NamespaceCase
    value: lower_case

  # Strictest modern C++ enforcement
  - key: modernize-use-nullptr.NullMacros
    value: 'NULL,nullptr'
  - key: modernize-loop-convert.MinConfidence
    value: reasonable
  - key: modernize-pass-by-value.IncludeStyle
    value: llvm
  - key: modernize-use-override.IgnoreDestructors
    value: false
  - key: modernize-use-override.IgnoreTemplateInstantiations
    value: false

  # No magic numbers
  - key: cppcoreguidelines-avoid-magic-numbers.IgnoredIntegerValues
    value: '0;1;-1'
  - key: cppcoreguidelines-avoid-magic-numbers.IgnoredFloatingPointValues
    value: '0.0;1.0'

  # Strict pointer rules
  - key: cppcoreguidelines-owning-memory.LegacyResourceProducers
    value: ''
  - key: cppcoreguidelines-owning-memory.LegacyResourceConsumers
    value: ''

  # No exceptions to rules
  - key: misc-non-private-member-variables-in-classes.IgnoreClassesWithAllMemberVariablesBeingPublic
    value: false
```

## clang-format Config (`.clang-format`)

```yaml
---
Language: Cpp
BasedOnStyle: Google
Standard: c++23

# Indentation
IndentWidth: 4
TabWidth: 4
UseTab: Never
AccessModifierOffset: -4
IndentCaseLabels: true
IndentPPDirectives: BeforeHash
IndentRequiresClause: true
NamespaceIndentation: None
LambdaBodyIndentation: Signature

# Line length
ColumnLimit: 100

# Braces
BreakBeforeBraces: Attach
AllowShortBlocksOnASingleLine: Empty
AllowShortFunctionsOnASingleLine: Empty
AllowShortIfStatementsOnASingleLine: Never
AllowShortLoopsOnASingleLine: false
AllowShortLambdasOnASingleLine: Inline
AllowShortCaseLabelsOnASingleLine: false
AllowShortEnumsOnASingleLine: false

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
AlignArrayOfStructures: Right
AlignConsecutiveAssignments: None
AlignConsecutiveBitFields: Consecutive
AlignConsecutiveDeclarations: None
AlignConsecutiveMacros: Consecutive
AlignEscapedNewlines: Right
AlignOperands: Align
AlignTrailingComments: true

# Spacing
SpaceAfterCStyleCast: false
SpaceAfterLogicalNot: false
SpaceAfterTemplateKeyword: true
SpaceAroundPointerQualifiers: Default
SpaceBeforeAssignmentOperators: true
SpaceBeforeCaseColon: false
SpaceBeforeCpp11BracedList: false
SpaceBeforeCtorInitializerColon: true
SpaceBeforeInheritanceColon: true
SpaceBeforeParens: ControlStatements
SpaceBeforeRangeBasedForLoopColon: true
SpaceBeforeSquareBrackets: false
SpaceInEmptyBlock: false
SpacesInAngles: false
SpacesInContainerLiterals: true
SpacesInLineCommentPrefix:
  Minimum: 1
  Maximum: 1
SpacesInParentheses: false
SpacesInSquareBrackets: false

# Other
PointerAlignment: Left
ReferenceAlignment: Pointer
QualifierAlignment: Leave
ReflowComments: true
SortUsingDeclarations: LexicographicNumeric
EmptyLineAfterAccessModifier: Never
EmptyLineBeforeAccessModifier: LogicalBlock
InsertBraces: true
InsertNewlineAtEOF: true
RemoveSemicolon: true
```

## cppcheck Config (`cppcheck.cfg`)

```ini
# cppcheck configuration for strictest mode
--enable=all
--error-exitcode=1
--suppress=missingIncludeSystem
--inline-suppr
--std=c++23
--platform=unix64
--library=googletest
--max-ctu-depth=10
--check-level=exhaustive
--premium=all
-j 4

# Enable all CERT rules
--addon=cert

# Enable all MISRA rules (if license available)
# --addon=misra

# Strictest settings
--inconclusive
```

## CMakeLists.txt Integration

```cmake
cmake_minimum_required(VERSION 3.25)
project(MyProject LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Strictest compiler warnings - treat all as errors
add_compile_options(
    -Wall
    -Wextra
    -Werror
    -Wpedantic
    -Wconversion
    -Wsign-conversion
    -Wshadow
    -Wformat=2
    -Wunused
    -Wnull-dereference
    -Wdouble-promotion
    -Wcast-align
    -Wcast-qual
    -Wctor-dtor-privacy
    -Wdisabled-optimization
    -Wformat-nonliteral
    -Wformat-security
    -Wformat-y2k
    -Winit-self
    -Wlogical-op
    -Wmissing-declarations
    -Wmissing-include-dirs
    -Wnoexcept
    -Wold-style-cast
    -Woverloaded-virtual
    -Wredundant-decls
    -Wsign-promo
    -Wstrict-null-sentinel
    -Wstrict-overflow=5
    -Wswitch-default
    -Wundef
    -Wno-unused-parameter
    -fstack-protector-strong
    -D_FORTIFY_SOURCE=2
)

# Additional clang-specific warnings
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(
        -Weverything
        -Wno-c++98-compat
        -Wno-c++98-compat-pedantic
        -Wno-padded
    )
endif()

# clang-tidy integration - all warnings as errors
find_program(CLANG_TIDY clang-tidy)
if(CLANG_TIDY)
    set(CMAKE_CXX_CLANG_TIDY
        ${CLANG_TIDY}
        --warnings-as-errors=*
    )
endif()

# cppcheck integration - all checks enabled
find_program(CPPCHECK cppcheck)
if(CPPCHECK)
    set(CMAKE_CXX_CPPCHECK
        ${CPPCHECK}
        --enable=all
        --error-exitcode=1
        --suppress=missingIncludeSystem
        --inline-suppr
        --std=c++23
        --inconclusive
        --check-level=exhaustive
    )
endif()

# Sanitizers for debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(
        -fsanitize=address,undefined,leak
        -fno-omit-frame-pointer
    )
    add_link_options(-fsanitize=address,undefined,leak)
endif()

# GoogleTest
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

enable_testing()
include(GoogleTest)

# Coverage (gcov/lcov)
option(COVERAGE "Enable coverage reporting" OFF)
if(COVERAGE)
    add_compile_options(--coverage -O0 -g -fprofile-arcs -ftest-coverage)
    add_link_options(--coverage -fprofile-arcs -ftest-coverage)
endif()

# Static analysis target
add_custom_target(static-analysis
    COMMAND ${CLANG_TIDY} -p ${CMAKE_BINARY_DIR} ${CMAKE_SOURCE_DIR}/src/*.cpp --warnings-as-errors=*
    COMMAND ${CPPCHECK} --enable=all --error-exitcode=1 ${CMAKE_SOURCE_DIR}/src/
    COMMENT "Running static analysis"
)
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 85% |
| Functions | 95% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 10 |
| Lines per function | 50 |
| Parameters | 4 |
| Nesting depth | 4 |
| Branches | 10 |

## Commands

```bash
# Build with all checks
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build

# Run clang-tidy with all warnings as errors
clang-tidy -p build src/*.cpp --warnings-as-errors='*'

# Run cppcheck exhaustive analysis
cppcheck --enable=all --error-exitcode=1 --inconclusive --check-level=exhaustive src/

# Format check
find src include -name '*.cpp' -o -name '*.hpp' | xargs clang-format --dry-run --Werror

# Run tests with sanitizers
cmake -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure

# Coverage with 90% threshold
cmake -B build -DCOVERAGE=ON
cmake --build build
ctest --test-dir build
lcov --capture --directory build --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/test/*' '*/googletest/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage
lcov --summary coverage.info | grep -E "lines.*: [0-8][0-9]\.[0-9]" && exit 1

# Full quality gate
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCOVERAGE=ON && \
cmake --build build && \
ctest --test-dir build --output-on-failure && \
clang-tidy -p build src/*.cpp --warnings-as-errors='*' && \
cppcheck --enable=all --error-exitcode=1 --inconclusive src/
```

## Install

```bash
# Ubuntu/Debian (LLVM 18+)
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18
sudo apt-get install clang-tidy-18 clang-format-18 cppcheck lcov

# macOS
brew install llvm cppcheck lcov

# Verify versions
clang-tidy --version  # LLVM 18+
cppcheck --version    # 2.14+
```

## CI Integration (GitHub Actions)

```yaml
name: C++ Strictest Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install LLVM 18
        run: |
          wget https://apt.llvm.org/llvm.sh
          chmod +x llvm.sh
          sudo ./llvm.sh 18
          sudo apt-get install -y clang-tidy-18 clang-format-18 cppcheck lcov

      - name: Configure
        run: cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCOVERAGE=ON

      - name: Build
        run: cmake --build build

      - name: Test with coverage
        run: |
          ctest --test-dir build --output-on-failure
          lcov --capture --directory build --output-file coverage.info
          lcov --remove coverage.info '/usr/*' '*/test/*' '*/googletest/*' -o coverage.info
          lcov --summary coverage.info
          # Fail if coverage < 90%
          COVERAGE=$(lcov --summary coverage.info 2>&1 | grep lines | grep -oP '\d+\.\d+')
          if (( $(echo "$COVERAGE < 90.0" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 90% threshold"
            exit 1
          fi

      - name: clang-tidy (all warnings as errors)
        run: clang-tidy-18 -p build src/*.cpp --warnings-as-errors='*'

      - name: cppcheck (exhaustive)
        run: cppcheck --enable=all --error-exitcode=1 --inconclusive --check-level=exhaustive src/

      - name: Format check
        run: find src include -name '*.cpp' -o -name '*.hpp' | xargs clang-format-18 --dry-run --Werror
```
