# C Strictest Quality Config

Maximum strictness for C projects with MISRA-C subset and zero-tolerance policies.

## Mode: Strictest

- Coverage: 90% minimum
- MISRA-C 2023 subset enforcement
- All warnings treated as errors
- clang-tidy with maximum checks
- cppcheck with MISRA addon

## clang-tidy Config (`.clang-tidy`)

```yaml
---
# clang-tidy configuration for C (Strictest mode)
# MISRA-C inspired, maximum strictness
# Updated for clang-tidy 17/18 (2024-2025)

Checks: >
  -*,
  bugprone-*,
  cert-*,
  clang-analyzer-*,
  concurrency-*,
  misc-*,
  performance-*,
  portability-*,
  readability-*,

# ALL warnings are errors in strictest mode
WarningsAsErrors: '*'

HeaderFilterRegex: '.*'

CheckOptions:
  # Strict cyclomatic complexity
  - key: readability-function-cognitive-complexity.Threshold
    value: 10

  # Strict function size limits (MISRA-aligned)
  - key: readability-function-size.LineThreshold
    value: 30
  - key: readability-function-size.StatementThreshold
    value: 25
  - key: readability-function-size.BranchThreshold
    value: 6
  - key: readability-function-size.ParameterThreshold
    value: 4
  - key: readability-function-size.NestingThreshold
    value: 3

  # Strict naming conventions
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
  - key: readability-identifier-naming.ParameterCase
    value: lower_case
  - key: readability-identifier-naming.LocalVariableCase
    value: lower_case

  # No magic numbers
  - key: readability-magic-numbers.IgnoredIntegerValues
    value: '0;1;2'
  - key: readability-magic-numbers.IgnoreAllFloatingPointValues
    value: false

  # Strict identifier length
  - key: readability-identifier-length.MinimumVariableNameLength
    value: 3
  - key: readability-identifier-length.MinimumParameterNameLength
    value: 3
  - key: readability-identifier-length.IgnoredVariableNames
    value: '^(i|j|k|n|x|y|z)$'

  # Braces required everywhere
  - key: readability-braces-around-statements.ShortStatementLines
    value: 0

  # CERT C rules
  - key: cert-err33-c.CheckedFunctions
    value: '::malloc;::calloc;::realloc;::free;::fopen;::freopen;::fclose;::fread;::fwrite;::fseek;::ftell;::fflush;::fgets;::fputs;::puts;::gets;::getchar;::putchar;::scanf;::printf;::sprintf;::snprintf;::sscanf;::memcpy;::memmove;::memset;::memcmp;::strcpy;::strncpy;::strcat;::strncat;::strcmp;::strncmp;::strlen;::strstr;::strtok;::strtol;::strtoul;::atoi;::atol;::atof'

  # Implicit conversion checks
  - key: bugprone-narrowing-conversions.WarnOnIntegerNarrowingConversion
    value: true
  - key: bugprone-narrowing-conversions.WarnOnFloatingPointNarrowingConversion
    value: true
```

## clang-format Config (`.clang-format`)

```yaml
---
# clang-format configuration for C (Strictest mode)
# MISRA-C aligned formatting
Language: Cpp
Standard: c17

BasedOnStyle: LLVM

# Strict indentation
IndentWidth: 4
TabWidth: 4
UseTab: Never
IndentCaseLabels: true
IndentGotoLabels: false
IndentPPDirectives: BeforeHash

# Allman braces (MISRA-aligned)
BreakBeforeBraces: Custom
BraceWrapping:
  AfterCaseLabel: true
  AfterControlStatement: Always
  AfterEnum: true
  AfterFunction: true
  AfterStruct: true
  AfterUnion: true
  BeforeElse: true
  BeforeWhile: true
  IndentBraces: false
  SplitEmptyFunction: true
  SplitEmptyRecord: true

# Conservative line length
ColumnLimit: 80

# Strict alignment
AlignAfterOpenBracket: BlockIndent
AlignConsecutiveAssignments: Consecutive
AlignConsecutiveDeclarations: Consecutive
AlignConsecutiveMacros: Consecutive
AlignEscapedNewlines: Left
AlignOperands: AlignAfterOperator
AlignTrailingComments: true

# Pointer with type (not variable)
PointerAlignment: Left
DerivePointerAlignment: false

# Explicit spaces
SpaceAfterCStyleCast: true
SpaceBeforeAssignmentOperators: true
SpaceBeforeParens: ControlStatements
SpacesBeforeTrailingComments: 2

# No short forms allowed
AllowShortBlocksOnASingleLine: Never
AllowShortCaseLabelsOnASingleLine: false
AllowShortFunctionsOnASingleLine: None
AllowShortIfStatementsOnASingleLine: Never
AllowShortLoopsOnASingleLine: false
AllowShortEnumsOnASingleLine: false

# Parameter handling
BinPackArguments: false
BinPackParameters: false
AllowAllParametersOfDeclarationOnNextLine: false

# Include ordering
IncludeBlocks: Regroup
IncludeCategories:
  - Regex: '^<.*\.h>'
    Priority: 1
  - Regex: '^"config\.h"'
    Priority: 2
  - Regex: '^".*\.h"'
    Priority: 3
SortIncludes: CaseSensitive
```

## cppcheck Config with MISRA (`.cppcheck`)

```
# cppcheck configuration for C (Strictest mode)
--enable=all
--error-exitcode=1
--inline-suppr
--std=c17
--language=c
--force
--max-ctu-depth=10
--suppress=missingIncludeSystem
--suppress=unmatchedSuppression
# Enable MISRA addon
--addon=misra
```

## MISRA-C 2023 Subset Rules

The following MISRA-C rules are enforced via clang-tidy and cppcheck:

| Rule | Description |
|------|-------------|
| Rule 1.3 | No undefined or unspecified behavior |
| Rule 2.1 | Unreachable code |
| Rule 2.2 | Dead code |
| Rule 8.4 | Compatible declarations |
| Rule 8.7 | Functions with internal linkage |
| Rule 10.1 | Operand types for operators |
| Rule 10.3 | Expression assigned to narrower type |
| Rule 10.4 | Operands of same essential type |
| Rule 11.3 | Cast between pointer and non-pointer |
| Rule 12.1 | Explicit precedence with parentheses |
| Rule 12.2 | Shift operator range |
| Rule 13.2 | Expression evaluation order |
| Rule 14.3 | Controlling expression invariant |
| Rule 15.6 | Compound statement for iteration/selection |
| Rule 17.7 | Return value of non-void function used |
| Rule 21.3 | Memory allocation functions |
| Rule 21.6 | Standard input/output functions |

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 85% |
| Functions | 100% |
| MC/DC | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Cognitive | 10 |
| Function length | 30 lines |
| Function statements | 25 |
| Nesting depth | 3 |
| Parameters | 4 |
| Return points | 1 (single exit) |

## Install Commands

```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy clang-format cppcheck lcov

# Install MISRA addon for cppcheck
pip install cppcheck-misra

# macOS
brew install llvm cppcheck lcov
pip install cppcheck-misra

# Fedora/RHEL
sudo dnf install clang-tools-extra cppcheck lcov
pip install cppcheck-misra
```

## Testing Framework (CMocka)

CMocka provides more advanced mocking capabilities for strict testing.

```bash
# Ubuntu/Debian
sudo apt-get install libcmocka-dev

# macOS
brew install cmocka

# From source
git clone https://gitlab.com/cmocka/cmocka.git vendor/cmocka
```

### CMocka Test Example

```c
// test/test_example.c
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <setjmp.h>
#include <cmocka.h>

#include "example.h"

static void test_add_positive(void** state)
{
    (void)state;
    assert_int_equal(add(2, 3), 5);
}

static void test_add_negative(void** state)
{
    (void)state;
    assert_int_equal(add(-2, -3), -5);
}

static void test_add_overflow_check(void** state)
{
    (void)state;
    // Strictest mode: test edge cases
    assert_int_equal(add(INT32_MAX, 0), INT32_MAX);
}

int main(void)
{
    const struct CMUnitTest tests[] = {
        cmocka_unit_test(test_add_positive),
        cmocka_unit_test(test_add_negative),
        cmocka_unit_test(test_add_overflow_check),
    };

    return cmocka_run_group_tests(tests, NULL, NULL);
}
```

## CMake Integration (`CMakeLists.txt`)

```cmake
cmake_minimum_required(VERSION 3.20)
project(myproject C)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Maximum compiler warnings - all as errors
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
    -Wformat-security
    -Wformat-signedness
    -Wnull-dereference
    -Wuninitialized
    -Wstrict-prototypes
    -Wmissing-prototypes
    -Wmissing-declarations
    -Wold-style-definition
    -Wredundant-decls
    -Wnested-externs
    -Wcast-qual
    -Wcast-align=strict
    -Wwrite-strings
    -Wundef
    -Wswitch-default
    -Wswitch-enum
    -Wunused-macros
    -Wlogical-op
    -Wduplicated-cond
    -Wduplicated-branches
    -Wrestrict
    -Wjump-misses-init
    -Wstack-protector
    -fstack-protector-all
    -fno-common
    -ftrapv
)

# Additional hardening for release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_compile_options(
        -D_FORTIFY_SOURCE=3
        -fPIE
    )
    add_link_options(-pie -Wl,-z,relro,-z,now)
endif()

# Coverage for Debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(--coverage -fprofile-arcs -ftest-coverage -O0 -g)
    add_link_options(--coverage)
endif()

# clang-tidy integration with strictest checks
find_program(CLANG_TIDY clang-tidy)
if(CLANG_TIDY)
    set(CMAKE_C_CLANG_TIDY
        ${CLANG_TIDY}
        -warnings-as-errors=*
        -header-filter=.*
    )
endif()

# cppcheck integration
find_program(CPPCHECK cppcheck)
if(CPPCHECK)
    set(CMAKE_C_CPPCHECK
        ${CPPCHECK}
        --enable=all
        --error-exitcode=1
        --std=c17
        --suppress=missingIncludeSystem
    )
endif()

# Library
add_library(mylib src/mylib.c)
target_include_directories(mylib PUBLIC include)

# Executable
add_executable(myapp src/main.c)
target_link_libraries(myapp PRIVATE mylib)

# Testing with CMocka
enable_testing()
find_package(cmocka REQUIRED)

add_executable(test_mylib test/test_mylib.c)
target_link_libraries(test_mylib PRIVATE mylib cmocka::cmocka)
add_test(NAME test_mylib COMMAND test_mylib)

# Custom target for MISRA check
add_custom_target(misra
    COMMAND cppcheck --addon=misra --error-exitcode=1 ${CMAKE_SOURCE_DIR}/src
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    COMMENT "Running MISRA-C compliance check"
)
```

## Makefile

```makefile
.PHONY: all clean lint format cppcheck misra test coverage quality

CC := gcc
CFLAGS := -std=c17 -Wall -Wextra -Wpedantic -Werror
CFLAGS += -Wshadow -Wconversion -Wsign-conversion -Wdouble-promotion
CFLAGS += -Wformat=2 -Wformat-security -Wnull-dereference
CFLAGS += -Wstrict-prototypes -Wmissing-prototypes -Wold-style-definition
CFLAGS += -Wcast-qual -Wcast-align=strict -Wwrite-strings -Wundef
CFLAGS += -Wswitch-default -Wswitch-enum -Wlogical-op
CFLAGS += -Wduplicated-cond -Wduplicated-branches -Wjump-misses-init
CFLAGS += -fstack-protector-all -fno-common -ftrapv
CFLAGS += -I include

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
	clang-tidy -warnings-as-errors='*' $(SRCS) -- $(CFLAGS)

format:
	clang-format -i $(SRCS) $(wildcard include/*.h) $(wildcard $(TEST_DIR)/*.c)

format-check:
	clang-format --dry-run --Werror $(SRCS) $(wildcard include/*.h)

cppcheck:
	cppcheck --enable=all --error-exitcode=1 --std=c17 \
		--suppress=missingIncludeSystem $(SRCS)

misra:
	cppcheck --addon=misra --error-exitcode=1 --std=c17 $(SRCS)

test: CFLAGS += --coverage -O0 -g
test:
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -o $(BUILD_DIR)/test_runner \
		$(TEST_DIR)/*.c $(SRC_DIR)/*.c -lcmocka
	$(BUILD_DIR)/test_runner

coverage: test
	@mkdir -p $(COVERAGE_DIR)
	lcov --capture --directory $(BUILD_DIR) --output-file $(COVERAGE_DIR)/coverage.info
	lcov --remove $(COVERAGE_DIR)/coverage.info '/usr/*' 'vendor/*' 'test/*' \
		--output-file $(COVERAGE_DIR)/coverage.filtered.info
	genhtml $(COVERAGE_DIR)/coverage.filtered.info --output-directory $(COVERAGE_DIR)/html
	@lcov --summary $(COVERAGE_DIR)/coverage.filtered.info | grep -E "lines.*:" | \
		awk -F'[:%]' '{if ($$2 < 90) {print "Coverage " $$2 "% below 90% threshold"; exit 1}}'
	@lcov --summary $(COVERAGE_DIR)/coverage.filtered.info | grep -E "branches.*:" | \
		awk -F'[:%]' '{if ($$2 < 85) {print "Branch coverage " $$2 "% below 85% threshold"; exit 1}}'

quality: format-check lint cppcheck misra test coverage

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
├── misra.json           # MISRA addon config
├── include/
│   └── mylib.h
├── src/
│   ├── main.c
│   └── mylib.c
├── test/
│   └── test_mylib.c
└── docs/
    └── coding_standard.md
```

## CI Integration (GitHub Actions)

```yaml
name: C Strictest Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y clang-tidy clang-format cppcheck lcov libcmocka-dev
          pip install cppcheck-misra

      - name: Format check
        run: make format-check

      - name: Lint (all warnings as errors)
        run: make lint

      - name: Static analysis
        run: make cppcheck

      - name: MISRA compliance
        run: make misra
        continue-on-error: true  # Report but don't fail initially

      - name: Test with coverage
        run: make coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage/coverage.filtered.info
          fail_ci_if_error: true
          verbose: true
```
