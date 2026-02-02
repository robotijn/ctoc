# R Strictest Quality Config

Maximum strictness for R projects with all linters enabled.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All lintr linters enabled
- No lint suppressions allowed

## lintr Config (`.lintr`)

```yaml
linters: linters_with_tags(
    tags = NULL,  # Enable ALL linters
    # Override specific limits
    line_length_linter = line_length_linter(80L),
    cyclocomp_linter = cyclocomp_linter(complexity_limit = 10L),
    object_length_linter = object_length_linter(length = 25L),
    object_name_linter = object_name_linter(styles = "snake_case"),
    indentation_linter = indentation_linter(indent = 2L),
    backport_linter = backport_linter(r_version = "4.1.0"),
    # Function complexity
    function_argument_linter = function_argument_linter(max_arguments = 5L),
    # Strictest: require explicit returns
    return_linter = return_linter(return_style = "explicit"),
    # Strictest: require package qualification
    unqualified_call_linter = unqualified_call_linter(
      except = c("c", "list", "data.frame", "matrix", "stop", "warning", "message")
    ),
    # Documentation requirements
    missing_argument_linter = missing_argument_linter(),
    # Security linters
    extraction_operator_linter = extraction_operator_linter(),
    fixed_regex_linter = fixed_regex_linter(),
    regex_subset_linter = regex_subset_linter(),
    # Performance linters
    lengths_linter = lengths_linter(),
    matrix_apply_linter = matrix_apply_linter(),
    nrow_subset_linter = nrow_subset_linter(),
    outer_negation_linter = outer_negation_linter(),
    paste_linter = paste_linter(),
    sample_int_linter = sample_int_linter(),
    # Consistency linters
    boolean_arithmetic_linter = boolean_arithmetic_linter(),
    class_equals_linter = class_equals_linter(),
    condition_message_linter = condition_message_linter(),
    consecutive_assertion_linter = consecutive_assertion_linter(),
    empty_assignment_linter = empty_assignment_linter(),
    expect_comparison_linter = expect_comparison_linter(),
    expect_identical_linter = expect_identical_linter(),
    expect_length_linter = expect_length_linter(),
    expect_named_linter = expect_named_linter(),
    expect_not_linter = expect_not_linter(),
    expect_null_linter = expect_null_linter(),
    expect_s3_class_linter = expect_s3_class_linter(),
    expect_s4_class_linter = expect_s4_class_linter(),
    expect_true_false_linter = expect_true_false_linter(),
    expect_type_linter = expect_type_linter(),
    for_loop_index_linter = for_loop_index_linter(),
    function_left_parentheses_linter = function_left_parentheses_linter(),
    function_return_linter = function_return_linter(),
    implicit_assignment_linter = implicit_assignment_linter(),
    is_numeric_linter = is_numeric_linter(),
    keyword_quote_linter = keyword_quote_linter(),
    length_levels_linter = length_levels_linter(),
    length_test_linter = length_test_linter(),
    library_call_linter = library_call_linter(),
    literal_coercion_linter = literal_coercion_linter(),
    nested_pipe_linter = nested_pipe_linter(),
    nzchar_linter = nzchar_linter(),
    one_call_pipe_linter = one_call_pipe_linter(),
    package_hooks_linter = package_hooks_linter(),
    pipe_call_linter = pipe_call_linter(),
    quotes_linter = quotes_linter(delimiter = '"'),
    repeat_linter = repeat_linter(),
    rep_len_linter = rep_len_linter(),
    routine_registration_linter = routine_registration_linter(),
    scalar_in_linter = scalar_in_linter(),
    semicolon_linter = semicolon_linter(),
    stopifnot_all_linter = stopifnot_all_linter(),
    strings_as_factors_linter = strings_as_factors_linter(),
    terminal_close_linter = terminal_close_linter(),
    todo_comment_linter = todo_comment_linter(),
    which_grepl_linter = which_grepl_linter(),
    yoda_test_linter = yoda_test_linter()
  )
exclusions: list()
# Strictest: No exclusions allowed - fix all issues
```

## styler Config (`.Rprofile` or `styler.R`)

```r
# styler configuration for strictest mode
options(
  styler.addins_style_transformer = "styler::tidyverse_style(
    indent_by = 2,
    strict = TRUE
  )"
)

# Strictest styler configuration
styler_strictest <- function() {
  styler::tidyverse_style(
    scope = "tokens",
    indent_by = 2L,
    strict = TRUE,
    start_comments_with_one_space = TRUE,
    reindention = styler::specify_reindention(
      regex_pattern = "^###",
      indention = 0L,
      comments_only = TRUE
    ),
    math_token_spacing = styler::specify_math_token_spacing(
      zero = c("'^'"),
      one = c("'+'", "'-'", "'*'", "'/'", "'%%'", "'%/%'", "'%*%'")
    )
  )
}

# Pre-commit hook style check
check_style <- function() {
  files <- list.files("R", pattern = "\\.R$", full.names = TRUE)
  styled <- styler::style_file(files, dry = "on")
  if (any(sapply(styled, function(x) x$changed))) {
    stop("Files need styling. Run styler::style_pkg()")
  }
  invisible(TRUE)
}
```

## testthat Config (`tests/testthat.R`)

```r
# Strictest: Run with all warnings as errors
options(
  warn = 2,  # Treat warnings as errors
  testthat.progress.verbose = TRUE
)

library(testthat)
library(yourpackage)

test_check("yourpackage", stop_on_failure = TRUE)
```

## testthat Helper (`tests/testthat/helper-strictest.R`)

```r
# Strictest test configuration
# This file is automatically loaded before tests

# Fail on any warnings during tests
options(warn = 2)

# Ensure reproducibility
set.seed(12345)

# Strictest: require explicit test expectations
# No test should pass without an expectation
options(testthat.default_check_reporter = "check")

# Skip only when absolutely necessary
skip_if_not_installed <- function(pkg) {
  testthat::skip_if_not_installed(pkg, minimum_version = NULL)
}
```

## Coverage Config (`codecov.yml`)

```yaml
coverage:
  status:
    project:
      default:
        target: 90%
        threshold: 0%  # No decrease allowed
    patch:
      default:
        target: 95%  # New code must have high coverage

parsers:
  gcov:
    branch_detection:
      conditional: yes
      loop: yes
      method: no
      macro: no

comment:
  layout: "reach,diff,flags,files,footer"
  behavior: default
  require_changes: true
```

## DESCRIPTION File Dependencies

```
Suggests:
    testthat (>= 3.2.0),
    covr (>= 3.6.0),
    lintr (>= 3.1.0),
    styler (>= 1.10.0),
    mockery (>= 0.4.0),
    withr (>= 2.5.0),
    spelling,
    knitr,
    rmarkdown,
    roxygen2 (>= 7.3.0)
Config/testthat/edition: 3
Config/testthat/parallel: true
Roxygen: list(markdown = TRUE)
Language: en-US
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Functions | 95% |
| Branches | 85% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Object Name Length | 25 |
| Line Length | 80 |
| Function Arguments | 5 |
| Nesting Depth | 4 |

## Install Command

```r
# Install all development dependencies
pak::pak(c(
  "testthat",
  "covr",
  "lintr",
  "styler",
  "mockery",
  "withr",
  "spelling",
  "knitr",
  "rmarkdown",
  "roxygen2",
  "devtools"
))
```

## Project Scripts (Makefile)

```makefile
.PHONY: lint lint-strict style style-check test test-strict check coverage spell doc clean

# Strictest lint - no warnings allowed
lint:
	Rscript -e "lints <- lintr::lint_package(); if (length(lints) > 0) { print(lints); stop('Linting errors found') }"

# Style with strict enforcement
style:
	Rscript -e "styler::style_pkg(strict = TRUE)"

style-check:
	Rscript -e "result <- styler::style_pkg(dry = 'on'); if (any(vapply(result, function(x) x[['changed']], logical(1)))) stop('Code style violations found')"

# Test with warnings as errors
test:
	Rscript -e "options(warn = 2); testthat::test_local(stop_on_failure = TRUE)"

# Full R CMD check with all checks
check:
	R CMD check --as-cran --no-manual .

# 90% coverage threshold
coverage:
	Rscript -e "cov <- covr::package_coverage(type = 'all'); print(cov); pct <- covr::percent_coverage(cov); if (pct < 90) stop(sprintf('Coverage %.1f%% below 90%%', pct))"

coverage-report:
	Rscript -e "cov <- covr::package_coverage(type = 'all'); covr::report(cov, file = 'coverage-report.html')"

# Spell check
spell:
	Rscript -e "spelling::spell_check_package()"

# Generate documentation
doc:
	Rscript -e "devtools::document()"

# Clean build artifacts
clean:
	rm -rf *.Rcheck
	rm -f *.tar.gz
	rm -rf man/*.Rd

# Full quality pipeline
quality: style-check lint spell coverage check
	@echo "All strictest quality checks passed"
```

## Pre-commit Hooks (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/lorenzwalthert/precommit
    rev: v0.4.0
    hooks:
      - id: style-files
        args: [--style_pkg=styler, --strict=TRUE]
      - id: roxygenize
      - id: lintr
      - id: readme-rmd-rendered
      - id: parsable-R
      - id: no-browser-statement
      - id: no-debug-statement
      - id: deps-in-desc
      - id: spell-check
        exclude: >
          (?x)^(
          .*\.[rR]|
          .*\.feather|
          .*\.jpeg|
          .*\.pdf|
          .*\.png|
          .*\.py|
          .*\.RData|
          .*\.rds|
          .*\.Rds|
          .*\.Rproj|
          .*\.sh|
          (.*/|)\.gitignore|
          (.*/|)\.pre-commit-.*|
          (.*/|)\.Rbuildignore|
          (.*/|)\.Renviron|
          (.*/|)\.Rprofile|
          (.*/|)\.travis\.yml|
          (.*/|)appveyor\.yml|
          (.*/|)NAMESPACE|
          (.*/|)renv/settings\.dcf|
          (.*/|)renv\.lock|
          (.*/|)WORDLIST|
          \.github/.*
          )$
```

## GitHub Actions Workflow (`.github/workflows/R-CMD-check-strictest.yaml`)

```yaml
name: R-CMD-check-strictest

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

permissions:
  contents: read

jobs:
  R-CMD-check:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: true  # Strictest: fail immediately
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        r-version: ['4.3', '4.4']

    env:
      R_KEEP_PKG_SOURCE: yes
      _R_CHECK_CRAN_INCOMING_: true
      _R_CHECK_FORCE_SUGGESTS_: true

    steps:
      - uses: actions/checkout@v4

      - uses: r-lib/actions/setup-r@v2
        with:
          r-version: ${{ matrix.r-version }}
          use-public-rspm: true

      - uses: r-lib/actions/setup-r-dependencies@v2
        with:
          extra-packages: |
            any::rcmdcheck
            any::lintr
            any::covr
            any::spelling
          needs: check

      - name: Style Check
        run: |
          result <- styler::style_pkg(dry = "on")
          if (any(vapply(result, function(x) x$changed, logical(1)))) {
            stop("Code style violations found")
          }
        shell: Rscript {0}

      - name: Lint
        run: |
          lints <- lintr::lint_package()
          if (length(lints) > 0) {
            print(lints)
            stop("Linting errors found")
          }
        shell: Rscript {0}

      - name: Spell Check
        run: |
          results <- spelling::spell_check_package()
          if (nrow(results) > 0) {
            print(results)
            stop("Spelling errors found")
          }
        shell: Rscript {0}

      - name: Check
        uses: r-lib/actions/check-r-package@v2
        with:
          error-on: '"warning"'  # Strictest: warnings are errors
          args: 'c("--no-manual", "--as-cran")'

      - name: Coverage (90% threshold)
        if: matrix.os == 'ubuntu-latest' && matrix.r-version == '4.4'
        run: |
          cov <- covr::package_coverage(type = "all")
          pct <- covr::percent_coverage(cov)
          message(sprintf("Coverage: %.1f%%", pct))
          covr::codecov(coverage = cov)
          if (pct < 90) {
            stop(sprintf("Coverage %.1f%% is below 90%% threshold", pct))
          }
        shell: Rscript {0}
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

## Directory Structure

```
package/
├── .lintr
├── .pre-commit-config.yaml
├── .Rbuildignore
├── .Rprofile
├── DESCRIPTION
├── NAMESPACE
├── LICENSE
├── NEWS.md
├── README.md
├── codecov.yml
├── WORDLIST                 # Spelling exceptions
├── R/
│   ├── package-name-package.R
│   └── *.R
├── man/
│   └── *.Rd
├── tests/
│   ├── testthat.R
│   └── testthat/
│       ├── helper-strictest.R
│       ├── setup.R
│       └── test-*.R
├── data-raw/
├── data/
├── inst/
│   └── extdata/
└── vignettes/
    └── *.Rmd
```
