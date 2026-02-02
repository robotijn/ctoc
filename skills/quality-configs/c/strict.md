# C Strict Quality Config

Strict mode configuration for C projects using clang-tidy and cppcheck.

## Mode: Strict

- Coverage: 80% minimum
- clang-tidy with comprehensive C checks
- cppcheck for additional static analysis
- Unity or CMocka for testing

## clang-tidy Config (`.clang-tidy`)

```yaml
---
# clang-tidy configuration for C (Strict mode)
# Updated for clang-tidy 17/18 (2024-2025)

Checks: >
  -*,
  bugprone-*,
  -bugprone-easily-swappable-parameters,
  cert-*,
  clang-analyzer-*,
  concurrency-*,
  misc-*,
  -misc-unused-parameters,
  performance-*,
  portability-*,
  readability-*,
  -readability-identifier-length,
  -readability-magic-numbers,

WarningsAsErrors: ''

HeaderFilterRegex: '.*'

CheckOptions:
  # Cyclomatic complexity limit
  - key: readability-function-cognitive-complexity.Threshold
    value: 15

  # Function size limits
  - key: readability-function-size.LineThreshold
    value: 50
  - key: readability-function-size.StatementThreshold
    value: 40
  - key: readability-function-size.BranchThreshold
    value: 10
  - key: readability-function-size.ParameterThreshold
    value: 5
  - key: readability-function-size.NestingThreshold
    value: 4

  # Naming conventions (C style)
  - key: readability-identifier-naming.FunctionCase
    value: lower_case
  - key: readability-identifier-naming.VariableCase
    value: lower_case
  - key: readability-identifier-naming.GlobalConstantCase
    value: UPPER_CASE
  - key: readability-identifier-naming.MacroDefinitionCase
    value: UPPER_CASE
  - key: readability-identifier-naming.TypedefCase
    value: lower_case
  - key: readability-identifier-naming.TypedefSuffix
    value: '_t'
  - key: readability-identifier-naming.StructCase
    value: lower_case
  - key: readability-identifier-naming.EnumCase
    value: lower_case
  - key: readability-identifier-naming.EnumConstantCase
    value: UPPER_CASE

  # Braces around statements
  - key: readability-braces-around-statements.ShortStatementLines
    value: 0

  # Implicit conversions
  - key: bugprone-implicit-widening-of-multiplication-result.UseCXXStaticCastsInCppSources
    value: false

  # CERT C specific
  - key: cert-err33-c.CheckedFunctions
    value: '::malloc;::calloc;::realloc;::fopen;::freopen;::fclose;::fread;::fwrite'
```

## clang-format Config (`.clang-format`)

```yaml
---
# clang-format configuration for C (Strict mode)
Language: Cpp
Standard: c17

# Base style
BasedOnStyle: LLVM

# Indentation
IndentWidth: 4
TabWidth: 4
UseTab: Never
IndentCaseLabels: true
IndentGotoLabels: false

# Braces
BreakBeforeBraces: Allman
BraceWrapping:
  AfterCaseLabel: true
  AfterControlStatement: Always
  AfterEnum: true
  AfterFunction: true
  AfterStruct: true
  AfterUnion: true
  BeforeElse: true
  BeforeWhile: false
  IndentBraces: false

# Line length
ColumnLimit: 100

# Alignment
AlignAfterOpenBracket: Align
AlignConsecutiveAssignments: Consecutive
AlignConsecutiveDeclarations: Consecutive
AlignConsecutiveMacros: Consecutive
AlignEscapedNewlines: Left
AlignOperands: Align
AlignTrailingComments: true

# Pointer alignment
PointerAlignment: Right
DerivePointerAlignment: false

# Spaces
SpaceAfterCStyleCast: false
SpaceBeforeAssignmentOperators: true
SpaceBeforeParens: ControlStatements
SpaceInEmptyParentheses: false
SpacesInCStyleCastParentheses: false
SpacesInParentheses: false
SpacesInSquareBrackets: false

# Other
AllowShortBlocksOnASingleLine: Never
AllowShortCaseLabelsOnASingleLine: false
AllowShortFunctionsOnASingleLine: None
AllowShortIfStatementsOnASingleLine: Never
AllowShortLoopsOnASingleLine: false
AlwaysBreakAfterReturnType: None
BinPackArguments: false
BinPackParameters: false
BreakBeforeBinaryOperators: None
IncludeBlocks: Regroup
IncludeCategories:
  - Regex: '^<.*\.h>'
    Priority: 1
  - Regex: '^".*\.h"'
    Priority: 2
SortIncludes: CaseSensitive
```

## cppcheck Config (`.cppcheck`)

```
# cppcheck configuration for C (Strict mode)
--enable=all
--suppress=missingIncludeSystem
--suppress=unmatchedSuppression
--error-exitcode=1
--inline-suppr
--std=c17
--language=c
--force
--max-ctu-depth=10
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 70% |
| Functions | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 15 |
| Function length | 50 lines |
| Function statements | 40 |
| Nesting depth | 4 |
| Parameters | 5 |

## Install Commands

```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy clang-format cppcheck lcov

# macOS
brew install llvm cppcheck lcov

# Fedora/RHEL
sudo dnf install clang-tools-extra cppcheck lcov
```

## Testing Framework (Unity)

```bash
# Clone Unity test framework
git clone https://github.com/ThrowTheSwitch/Unity.git vendor/unity
```

### Unity Test Example

```c
// test/test_example.c
#include "unity.h"
#include "example.h"

void setUp(void) {
    // Setup before each test
}

void tearDown(void) {
    // Cleanup after each test
}

void test_add_positive_numbers(void) {
    TEST_ASSERT_EQUAL_INT(5, add(2, 3));
}

void test_add_negative_numbers(void) {
    TEST_ASSERT_EQUAL_INT(-5, add(-2, -3));
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_add_positive_numbers);
    RUN_TEST(test_add_negative_numbers);
    return UNITY_END();
}
```

## CMake Integration (`CMakeLists.txt`)

```cmake
cmake_minimum_required(VERSION 3.20)
project(myproject C)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Strict compiler warnings
add_compile_options(
    -Wall
    -Wextra
    -Wpedantic
    -Werror
    -Wshadow
    -Wconversion
    -Wsign-conversion
    -Wdouble-promotion
    -Wformat=2
    -Wundef
    -Wstrict-prototypes
    -Wmissing-prototypes
    -Wold-style-definition
    -Wcast-qual
    -Wcast-align
    -Wwrite-strings
    -Wnull-dereference
    -Wstack-protector
    -fstack-protector-strong
)

# Enable coverage for Debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(--coverage -fprofile-arcs -ftest-coverage)
    add_link_options(--coverage)
endif()

# clang-tidy integration
find_program(CLANG_TIDY clang-tidy)
if(CLANG_TIDY)
    set(CMAKE_C_CLANG_TIDY ${CLANG_TIDY})
endif()

# Source files
add_library(mylib src/mylib.c)
target_include_directories(mylib PUBLIC include)

add_executable(myapp src/main.c)
target_link_libraries(myapp PRIVATE mylib)

# Testing with Unity
enable_testing()
add_subdirectory(vendor/unity)

add_executable(test_mylib test/test_mylib.c)
target_link_libraries(test_mylib PRIVATE mylib unity)
add_test(NAME test_mylib COMMAND test_mylib)
```

## Makefile

```makefile
.PHONY: all clean lint format test coverage quality cppcheck

CC := gcc
CFLAGS := -std=c17 -Wall -Wextra -Wpedantic -Werror
CFLAGS += -Wshadow -Wconversion -Wsign-conversion
CFLAGS += -I include -I vendor/unity/src

SRC_DIR := src
TEST_DIR := test
BUILD_DIR := build
COVERAGE_DIR := coverage

SRCS := $(wildcard $(SRC_DIR)/*.c)
OBJS := $(SRCS:$(SRC_DIR)/%.c=$(BUILD_DIR)/%.o)

all: $(BUILD_DIR)/app

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/app: $(OBJS)
	$(CC) $(CFLAGS) $^ -o $@

lint:
	clang-tidy $(SRCS) -- $(CFLAGS)

format:
	clang-format -i $(SRCS) $(wildcard include/*.h) $(wildcard $(TEST_DIR)/*.c)

format-check:
	clang-format --dry-run --Werror $(SRCS) $(wildcard include/*.h)

cppcheck:
	cppcheck --enable=all --suppress=missingIncludeSystem \
		--error-exitcode=1 --std=c17 $(SRCS)

test: CFLAGS += --coverage
test:
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -o $(BUILD_DIR)/test_runner \
		$(TEST_DIR)/*.c $(SRC_DIR)/*.c vendor/unity/src/unity.c
	$(BUILD_DIR)/test_runner

coverage: test
	@mkdir -p $(COVERAGE_DIR)
	lcov --capture --directory $(BUILD_DIR) --output-file $(COVERAGE_DIR)/coverage.info
	lcov --remove $(COVERAGE_DIR)/coverage.info '/usr/*' 'vendor/*' 'test/*' \
		--output-file $(COVERAGE_DIR)/coverage.filtered.info
	genhtml $(COVERAGE_DIR)/coverage.filtered.info --output-directory $(COVERAGE_DIR)/html
	@lcov --summary $(COVERAGE_DIR)/coverage.filtered.info | grep -E "lines.*:" | \
		awk -F'[:%]' '{if ($$2 < 80) {print "Coverage " $$2 "% below 80% threshold"; exit 1}}'

quality: format-check lint cppcheck test coverage

clean:
	rm -rf $(BUILD_DIR) $(COVERAGE_DIR) *.gcda *.gcno
```

## Directory Structure

```
project/
├── .clang-tidy
├── .clang-format
├── .cppcheck
├── CMakeLists.txt
├── Makefile
├── include/
│   └── mylib.h
├── src/
│   ├── main.c
│   └── mylib.c
├── test/
│   └── test_mylib.c
└── vendor/
    └── unity/
```

## CI Integration (GitHub Actions)

```yaml
name: C Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y clang-tidy clang-format cppcheck lcov

      - name: Format check
        run: make format-check

      - name: Lint
        run: make lint

      - name: Static analysis
        run: make cppcheck

      - name: Test with coverage
        run: make coverage
```
