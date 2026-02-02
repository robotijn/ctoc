# C Legacy Quality Config

Gradual adoption configuration for migrating existing C projects to modern quality standards.

## Mode: Legacy

- Coverage: 50% minimum
- Essential checks only
- Relaxed complexity limits
- Warnings, not errors

## clang-tidy Config (`.clang-tidy`)

```yaml
---
# clang-tidy configuration for C (Legacy mode)
# Minimal checks for gradual adoption
# Updated for clang-tidy 17/18 (2024-2025)

Checks: >
  -*,
  bugprone-branch-clone,
  bugprone-sizeof-*,
  bugprone-suspicious-*,
  bugprone-undefined-memory-manipulation,
  bugprone-unused-return-value,
  clang-analyzer-core.*,
  clang-analyzer-deadcode.*,
  clang-analyzer-security.*,
  clang-analyzer-unix.*,
  misc-redundant-expression,
  readability-misleading-indentation,
  readability-redundant-*,

# Warnings only, not errors
WarningsAsErrors: ''

HeaderFilterRegex: ''

CheckOptions:
  # Relaxed complexity limits
  - key: readability-function-cognitive-complexity.Threshold
    value: 25

  # Relaxed function size
  - key: readability-function-size.LineThreshold
    value: 100
  - key: readability-function-size.StatementThreshold
    value: 80
  - key: readability-function-size.BranchThreshold
    value: 20
  - key: readability-function-size.ParameterThreshold
    value: 8
  - key: readability-function-size.NestingThreshold
    value: 6
```

## clang-format Config (`.clang-format`)

```yaml
---
# clang-format configuration for C (Legacy mode)
# Minimal formatting changes to reduce diff noise
Language: Cpp
Standard: c11

# Preserve existing style as much as possible
BasedOnStyle: LLVM

# Basic indentation
IndentWidth: 4
TabWidth: 4
UseTab: Never

# Keep existing brace style
BreakBeforeBraces: Attach

# Generous line length
ColumnLimit: 120

# Minimal alignment changes
AlignAfterOpenBracket: DontAlign
AlignConsecutiveAssignments: false
AlignConsecutiveDeclarations: false
AlignTrailingComments: false

# Preserve pointer style
DerivePointerAlignment: true

# Allow compact code
AllowShortBlocksOnASingleLine: Always
AllowShortCaseLabelsOnASingleLine: true
AllowShortFunctionsOnASingleLine: All
AllowShortIfStatementsOnASingleLine: WithoutElse
AllowShortLoopsOnASingleLine: true

# Keep parameters together when possible
BinPackArguments: true
BinPackParameters: true

# Don't reorder includes
SortIncludes: Never
```

## cppcheck Config (`.cppcheck`)

```
# cppcheck configuration for C (Legacy mode)
--enable=warning,style
--suppress=missingIncludeSystem
--suppress=unmatchedSuppression
--suppress=unusedFunction
--suppress=constParameter
--error-exitcode=0
--std=c11
--language=c
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 30% |
| Functions | 60% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Cognitive | 25 |
| Function length | 100 lines |
| Function statements | 80 |
| Nesting depth | 6 |
| Parameters | 8 |

## Install Commands

```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy clang-format cppcheck lcov

# macOS
brew install llvm cppcheck lcov

# Fedora/RHEL
sudo dnf install clang-tools-extra cppcheck lcov
```

## Testing Framework (Unity - Lightweight)

Unity is recommended for legacy projects due to its minimal footprint.

```bash
# Clone Unity test framework
git clone https://github.com/ThrowTheSwitch/Unity.git vendor/unity
```

### Minimal Unity Test Example

```c
// test/test_example.c
#include "unity.h"
#include "example.h"

void setUp(void) {}
void tearDown(void) {}

void test_basic_functionality(void) {
    // Start with basic smoke tests
    TEST_ASSERT_NOT_NULL(get_version());
}

void test_critical_path(void) {
    // Test the most critical code paths first
    int result = critical_function(42);
    TEST_ASSERT_TRUE(result >= 0);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_basic_functionality);
    RUN_TEST(test_critical_path);
    return UNITY_END();
}
```

## CMake Integration (`CMakeLists.txt`)

```cmake
cmake_minimum_required(VERSION 3.16)
project(myproject C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Minimal warnings for legacy code
add_compile_options(
    -Wall
    -Wextra
    # Note: No -Werror in legacy mode
)

# Coverage for Debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    add_compile_options(--coverage -fprofile-arcs -ftest-coverage)
    add_link_options(--coverage)
endif()

# Optional clang-tidy (disabled by default for legacy)
option(ENABLE_CLANG_TIDY "Enable clang-tidy" OFF)
if(ENABLE_CLANG_TIDY)
    find_program(CLANG_TIDY clang-tidy)
    if(CLANG_TIDY)
        set(CMAKE_C_CLANG_TIDY ${CLANG_TIDY})
    endif()
endif()

# Source files
file(GLOB_RECURSE SOURCES src/*.c)
add_library(mylib ${SOURCES})
target_include_directories(mylib PUBLIC include)

add_executable(myapp src/main.c)
target_link_libraries(myapp PRIVATE mylib)

# Testing (optional)
option(BUILD_TESTS "Build tests" OFF)
if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(vendor/unity)

    file(GLOB TEST_SOURCES test/*.c)
    add_executable(test_runner ${TEST_SOURCES})
    target_link_libraries(test_runner PRIVATE mylib unity)
    add_test(NAME tests COMMAND test_runner)
endif()
```

## Makefile

```makefile
.PHONY: all clean lint format test coverage quality report

CC := gcc
CFLAGS := -std=c11 -Wall -Wextra
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

# Lint with relaxed settings (warnings only)
lint:
	-clang-tidy $(SRCS) -- $(CFLAGS) 2>&1 | tee lint-report.txt
	@echo "Lint complete. See lint-report.txt for details."

# Format check (report only, no failure)
format-check:
	-clang-format --dry-run $(SRCS) $(wildcard include/*.h) 2>&1 | tee format-report.txt
	@echo "Format check complete. See format-report.txt for details."

# Apply formatting
format:
	clang-format -i $(SRCS) $(wildcard include/*.h)

# cppcheck (warnings only)
cppcheck:
	-cppcheck --enable=warning,style $(SRCS) 2>&1 | tee cppcheck-report.txt
	@echo "Static analysis complete. See cppcheck-report.txt for details."

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
	@echo "Coverage report generated in $(COVERAGE_DIR)/html/"
	@lcov --summary $(COVERAGE_DIR)/coverage.filtered.info

# Report current state without failing
report: lint cppcheck format-check
	@echo ""
	@echo "=== Legacy Quality Report ==="
	@echo "See individual report files for details."
	@echo "This is informational only - no build failure."

# Quality check with relaxed thresholds
quality: test coverage
	@lcov --summary $(COVERAGE_DIR)/coverage.filtered.info | grep -E "lines.*:" | \
		awk -F'[:%]' '{if ($$2 < 50) {print "WARNING: Coverage " $$2 "% below 50% target"} else {print "OK: Coverage " $$2 "%"}}'

clean:
	rm -rf $(BUILD_DIR) $(COVERAGE_DIR) *.gcda *.gcno *-report.txt
```

## Upgrade Path

### Phase 1: Establish Baseline (Week 1-2)

1. Install tools and create config files
2. Run `make report` to assess current state
3. Fix critical security issues only (clang-analyzer-security)
4. Achieve 50% test coverage on new code

```bash
# Get current state
make report

# View current coverage
make coverage
```

### Phase 2: Incremental Improvements (Week 3-4)

1. Enable additional bugprone checks one at a time
2. Fix issues in each category before enabling next
3. Increase coverage to 60%

```yaml
# Add to .clang-tidy Checks:
  bugprone-assert-side-effect,
  bugprone-bool-pointer-implicit-conversion,
  bugprone-copy-constructor-init,
```

### Phase 3: Style Consistency (Week 5-6)

1. Apply clang-format to new files only
2. Gradually format legacy files during refactoring
3. Enable readability checks

```bash
# Format only new/modified files
git diff --name-only --diff-filter=AM | xargs clang-format -i
```

### Phase 4: Upgrade to Strict (Month 2+)

1. Enable -Werror on new code
2. Increase complexity limits gradually
3. Target 80% coverage
4. Migrate to `strict.md` configuration

```yaml
# Progression of complexity limits:
# Legacy → Intermediate → Strict
Cyclomatic: 15 → 12 → 10
Function lines: 100 → 75 → 50
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
│   └── *.h
├── src/
│   └── *.c
├── test/
│   └── test_*.c
├── vendor/
│   └── unity/
├── lint-report.txt        # Generated
├── cppcheck-report.txt    # Generated
└── format-report.txt      # Generated
```

## CI Integration (GitHub Actions)

```yaml
name: C Legacy Quality

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

      - name: Generate quality report
        run: make report
        continue-on-error: true

      - name: Test with coverage
        run: make coverage
        continue-on-error: true

      - name: Check minimum coverage
        run: |
          COVERAGE=$(lcov --summary coverage/coverage.filtered.info 2>&1 | grep -E "lines.*:" | awk -F'[:%]' '{print $2}')
          if (( $(echo "$COVERAGE < 50" | bc -l) )); then
            echo "::warning::Coverage ${COVERAGE}% is below 50% target"
          fi

      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: quality-reports
          path: |
            *-report.txt
            coverage/
```

## Tips for Legacy Codebases

1. **Don't try to fix everything at once** - Focus on new code first
2. **Use baseline suppressions** - Document known issues to fix later
3. **Celebrate progress** - Track metrics over time
4. **Prioritize security** - Fix security issues immediately
5. **Test critical paths** - Focus coverage on important functionality
6. **Gradual formatting** - Format files only when modifying them
7. **Document decisions** - Keep a log of why certain warnings are suppressed
