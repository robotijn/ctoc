# R Legacy Quality Config

Gradual adoption configuration for migrating existing R projects.

## Mode: Legacy

- Coverage: 50% minimum
- Complexity: Relaxed limits
- Minimal linters for gradual adoption

## lintr Config (`.lintr`)

```yaml
linters: linters_with_defaults(
    # Keep only essential linters for legacy code
    line_length_linter(160),  # Relaxed line length
    indentation_linter(indent = 2L),
    # Syntax errors and critical issues only
    assignment_linter(),
    equals_na_linter(),
    missing_argument_linter(),
    T_and_F_symbol_linter(),
    trailing_blank_lines_linter(),
    trailing_whitespace_linter(),
    # Disable strict linters
    object_name_linter = NULL,
    object_usage_linter = NULL,
    cyclocomp_linter = NULL,
    commented_code_linter = NULL,
    object_length_linter = NULL
  )
exclusions: list(
    "tests" = Inf,
    "data-raw" = Inf,
    "vignettes" = Inf,
    "inst" = Inf,
    # Add legacy files to exclude
    "R/legacy" = Inf
  )
```

## styler Config (`.Rprofile`)

```r
# styler configuration for legacy mode
# Less strict - only format new/modified code

options(
  styler.addins_style_transformer = "styler::tidyverse_style(
    indent_by = 2,
    strict = FALSE
  )"
)

# Legacy styler - non-strict mode
styler_legacy <- function() {
  styler::tidyverse_style(
    scope = "line_breaks",  # Only fix line breaks, not tokens
    indent_by = 2L,
    strict = FALSE,
    start_comments_with_one_space = FALSE  # Don't enforce comment style
  )
}
```

## testthat Config (`tests/testthat.R`)

```r
# Legacy: Basic test configuration
library(testthat)
library(yourpackage)

# Don't fail on warnings in legacy mode
options(warn = 1)

test_check("yourpackage")
```

## Coverage Config (`codecov.yml`)

```yaml
coverage:
  status:
    project:
      default:
        target: 50%
        threshold: 5%  # Allow some variance
    patch:
      default:
        target: 60%  # New code should have better coverage

comment:
  layout: "reach,diff"
  behavior: default
```

## DESCRIPTION File Dependencies

```
Suggests:
    testthat (>= 3.0.0),
    covr,
    lintr,
    styler
Config/testthat/edition: 3
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Functions | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 25 (disabled by default) |
| Object Name Length | 50 |
| Line Length | 160 |
| Function Arguments | 10 |

## Install Command

```r
# Minimal development dependencies for legacy projects
install.packages(c("testthat", "covr", "lintr", "styler"))

# Or using pak
pak::pak(c("testthat", "covr", "lintr", "styler"))
```

## Project Scripts (Makefile)

```makefile
.PHONY: lint lint-new style test check coverage

# Lint only - warnings don't fail build
lint:
	Rscript -e "lintr::lint_package()" || true

# Lint only new/modified files (for CI)
lint-new:
	Rscript -e "files <- system('git diff --name-only HEAD~1 -- \"*.R\"', intern = TRUE); if (length(files) > 0) lintr::lint(files)"

# Style - non-strict mode
style:
	Rscript -e "styler::style_pkg(strict = FALSE)"

# Style only changed files
style-changed:
	Rscript -e "files <- system('git diff --name-only HEAD~1 -- \"R/*.R\"', intern = TRUE); if (length(files) > 0) styler::style_file(files, strict = FALSE)"

# Basic tests
test:
	Rscript -e "testthat::test_local()"

# Standard check (not --as-cran for legacy)
check:
	R CMD check .

# 50% coverage threshold
coverage:
	Rscript -e "cov <- covr::package_coverage(); pct <- covr::percent_coverage(cov); message(sprintf('Coverage: %.1f%%', pct)); if (pct < 50) warning(sprintf('Coverage %.1f%% below 50%%', pct))"

# Quality check - warnings only, doesn't fail
quality: lint coverage
	@echo "Quality checks complete (warnings may have occurred)"
```

## GitHub Actions Workflow (`.github/workflows/R-CMD-check-legacy.yaml`)

```yaml
name: R-CMD-check-legacy

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  R-CMD-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: r-lib/actions/setup-r@v2
        with:
          r-version: '4.4'
          use-public-rspm: true

      - uses: r-lib/actions/setup-r-dependencies@v2
        with:
          extra-packages: any::rcmdcheck, any::lintr, any::covr
          needs: check

      - name: Lint (warnings only)
        run: |
          lints <- lintr::lint_package()
          if (length(lints) > 0) {
            print(lints)
            message(sprintf("Found %d lint issues (not failing build)", length(lints)))
          }
        shell: Rscript {0}
        continue-on-error: true

      - name: Check
        uses: r-lib/actions/check-r-package@v2
        with:
          error-on: '"error"'  # Only fail on errors, not warnings

      - name: Coverage (50% threshold - warning only)
        run: |
          cov <- covr::package_coverage()
          pct <- covr::percent_coverage(cov)
          message(sprintf("Coverage: %.1f%%", pct))
          if (pct < 50) {
            message(sprintf("Warning: Coverage %.1f%% is below 50%% threshold", pct))
          }
          covr::codecov(coverage = cov)
        shell: Rscript {0}
        continue-on-error: true
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

## Upgrade Path

### Phase 1: Baseline (Current)
1. Establish current lint status
2. Set up basic CI with warnings
3. Add tests for new code only
4. Target 50% coverage on new code

### Phase 2: Stabilize
1. Fix critical lint errors (syntax, T/F, NA equality)
2. Add tests for critical paths
3. Reach 50% overall coverage
4. Enable `object_usage_linter`

### Phase 3: Improve
1. Enable `cyclocomp_linter(25)`
2. Enable `commented_code_linter`
3. Reduce line length to 120
4. Target 65% coverage

### Phase 4: Strict Mode
1. Switch to strict.md configuration
2. Enable all standard linters
3. Reduce complexity limit to 15
4. Target 80% coverage

### Migration Script

```r
# migration.R - Helper script for upgrading from legacy to strict

# Check current lint status
check_lint_status <- function() {
  lints <- lintr::lint_package()

  # Categorize lints
  categories <- table(sapply(lints, function(x) x$linter))

  message("Current lint status:")
  print(sort(categories, decreasing = TRUE))

  message(sprintf("\nTotal: %d issues", length(lints)))
  invisible(lints)
}

# Check current coverage
check_coverage_status <- function() {
  cov <- covr::package_coverage()
  pct <- covr::percent_coverage(cov)

  message(sprintf("Current coverage: %.1f%%", pct))

  # Show files with low coverage
  file_cov <- covr::file_coverage(cov)
  low_cov <- file_cov[file_cov$coverage < 50, ]

  if (nrow(low_cov) > 0) {
    message("\nFiles below 50% coverage:")
    print(low_cov[order(low_cov$coverage), ])
  }

  invisible(cov)
}

# Generate upgrade report
upgrade_report <- function() {
  message("=== UPGRADE REPORT ===\n")

  check_lint_status()
  message("\n")
  check_coverage_status()

  message("\n=== RECOMMENDATIONS ===")
  message("1. Fix critical lints first (equals_na, T_and_F_symbol)")
  message("2. Add tests for uncovered files")
  message("3. Enable linters incrementally")
}

# Run: upgrade_report()
```

## Directory Structure

```
package/
├── .lintr
├── .Rbuildignore
├── DESCRIPTION
├── NAMESPACE
├── README.md
├── R/
│   ├── legacy/              # Legacy code (excluded from lint)
│   │   └── old-functions.R
│   └── *.R                  # New/refactored code
├── man/
│   └── *.Rd
├── tests/
│   ├── testthat.R
│   └── testthat/
│       └── test-*.R
└── inst/
    └── extdata/
```

## Notes for Legacy Migration

1. **Start with CI visibility**: Even if not failing, seeing lint/coverage in PRs helps
2. **Exclude legacy directories**: Use `.lintr` exclusions for old code
3. **Apply strict rules to new code**: Use `lint_new` target for PRs
4. **Gradual threshold increase**: Move from 50% to 80% over releases
5. **Document known issues**: Keep a list of intentional lint suppressions
