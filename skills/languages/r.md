# R CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude writes for loops — use vectorized operations
- Claude uses `attach()` — pollutes namespace, avoid entirely
- Claude forgets `renv` for reproducibility — always lock dependencies
- Claude uses base R when tidyverse is clearer — prefer tidyverse idioms

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `R 4.4+` | Latest features | Old R versions |
| `tidyverse` | Data manipulation | Base R for data work |
| `renv` | Dependency management | No lockfile |
| `styler` + `lintr` | Code style | Manual formatting |
| `testthat 3` | Testing | Ad-hoc scripts |

## Patterns Claude Should Use
```r
# Tidyverse piping (not for loops)
result <- data |>
  filter(age > 18) |>
  group_by(region) |>
  summarise(mean_income = mean(income, na.rm = TRUE))

# Explicit type coercion
value <- as.integer(input)  # Not implicit

# Namespaced function calls to avoid conflicts
dplyr::select(data, column)

# Use tidyterra for spatial + ggplot2 (2025 update)
library(tidyterra)
ggplot() + geom_spatraster(data = raster)

# Document with roxygen2
#' Calculate mean by group
#' @param data A data frame
#' @param group_col Column to group by
#' @export
calculate_mean <- function(data, group_col) { ... }
```

## Anti-Patterns Claude Generates
- `for` loops for data ops — use `map()`, `apply()`, vectorized
- `attach(data)` — use `data$col` or tidyverse
- `setwd()` in packages — use relative paths
- `eval(parse(text=...))` with user input — injection risk
- Row-wise operations — use vectorized alternatives

## Version Gotchas
- **R 4.4+**: Native pipe `|>` preferred over magrittr `%>%`
- **tidyterra (2025)**: ggplot2 + terra spatial integration
- **With large data**: Use `data.table` or `duckdb`, not tibbles
- **Reproducibility**: Always use `renv::snapshot()` and `renv.lock`
- **Package conflicts**: Use `conflicted` package or explicit namespacing

## Vectorization / Parallelism Footguns
R's semantics reward vectorized code and punish loops that grow objects. Two habits
Claude reliably gets wrong: growing a vector element-by-element, and using `sapply`
whose return type is not guaranteed.

```r
# FOOTGUN: growing an object in a loop reallocates + copies on EVERY iteration -> O(n^2).
out <- c()
for (i in seq_len(n)) out <- c(out, f(i))          # quadratic, silently slow

# FIX: preallocate, or use a *typed* apply. vapply asserts the return type/length,
# so a resolver returning the wrong shape fails loudly instead of silently
# simplifying to a list (the sapply trap).
out <- vapply(seq_len(n), f, FUN.VALUE = numeric(1))   # errors if f() isn't length-1 double
```
- **`sapply` is type-unstable**: it returns a vector, a matrix, or a list depending on
  the data — a downstream bug waiting to happen. Prefer **`vapply`** (declare
  `FUN.VALUE`) or `purrr::map_dbl`/`map_chr` for a guaranteed type.
- **Copy-on-modify**: R copies a vector/data.frame when it is modified while another
  binding still references it. Modifying a column in a loop can copy the whole frame
  each pass. `data.table` mutates in place (`:=`) to avoid this.
- **`parallel` fork vs PSOCK**: `mclapply` (fork) is Unix-only and unsafe with
  threaded BLAS or open connections; `makeCluster(type="PSOCK")` / `future` works
  cross-platform but you must **export** variables/packages to each worker explicitly.

## Error Handling Idioms
R's condition system is richer than a plain try/catch — use it, and never swallow
errors silently.

```r
result <- tryCatch(
  risky(),
  error   = function(e) { log_error(conditionMessage(e)); NA },
  warning = function(w) { log_warn(conditionMessage(w)); NULL }
)

# Signal typed conditions so callers can dispatch on class, not on message text:
stop(structure(class = c("http_error", "error", "condition"),
               list(message = "429 Too Many Requests", call = sys.call())))

# withCallingHandlers keeps executing after a warning (unlike tryCatch, which unwinds);
# on.exit guarantees cleanup (close connections, restore options) even on error:
f <- function(path) {
  con <- file(path); on.exit(close(con))
  readLines(con)
}
```
- **Avoid `try(silent = TRUE)`** that discards the error — you lose the failure and
  ship a wrong result. Catch, inspect `conditionMessage()`, and handle or re-raise.

## Security and Dependency Gotchas
- **Code injection — CWE-94**: `eval(parse(text = x))` on untrusted `x` executes
  arbitrary R (file access, `system` calls, network). Never build code from input;
  use data structures, `switch()`, or an allow-listed dispatch instead. (CWE-94
  "Improper Control of Generation of Code ('Code Injection')" — cwe.mitre.org.)

```r
# UNSAFE: attacker controls the program.
#   eval(parse(text = user_input))        # e.g. "system('rm -rf ~')"

# SAFE: dispatch over a fixed set; the input can only pick, never inject.
op <- switch(user_input, sum = sum, mean = mean, stop("unknown op"))
op(x)
```
- **Command injection — CWE-78**: `system(paste("convert", user_file))` lets shell
  metacharacters escape. Use `system2("convert", args = c(user_file))` (arguments are
  not re-parsed by a shell) and validate paths.
- **Deserialization**: `readRDS()` / `load()` can execute code on load via crafted
  objects — never load untrusted `.rds`/`.RData`. Treat them like `pickle`.
- **Dependency pinning**: use **`renv`** with a committed `renv.lock` so builds are
  reproducible and a compromised/yanked CRAN version can't silently change your code.

## Testing Conventions
- **`testthat`** (edition 3) — the standard framework; `expect_equal`,
  `expect_error(..., class = ...)` to assert the error *class*, snapshot tests for
  output. Put tests in `tests/testthat/`.
- **`covr`** — coverage reporting (`covr::package_coverage()`), gate in CI.
- **`R CMD check`** (or `devtools::check()`) — the canonical package validator:
  examples, docs, `NAMESPACE`, and tests must all pass with no `ERROR`/`WARNING`.

## Performance Traps
- **`for` loop over a vectorized op**: `for (i ...) out[i] <- a[i] + b[i]` should be
  `out <- a + b`. Vectorized ops run in C; the loop runs in the interpreter.
- **`apply` on a data.frame** coerces it to a matrix first (all columns to a common
  type) — a correctness *and* speed trap; use column-wise vectorized ops or
  `data.table`/`dplyr`.
- **`data.frame` vs `data.table`/`dplyr`** for large data: base `data.frame` copies on
  most operations; **`data.table`** modifies in place (`:=`) and indexes for
  fast joins/aggregation. Reach for it (or `duckdb`) once data outgrows memory-copy
  budgets.
- **`rbind` in a loop** reallocates the whole frame each call — collect into a list and
  `do.call(rbind, lst)` / `data.table::rbindlist(lst)` once.

## Version-Specific Gotchas (dated, sourced)
- Current R is the **4.x** series (latest release branch **4.6**, e.g. 4.6.1). The
  **native pipe `|>`** (since R 4.1, 2021) and the **backslash lambda `\(x)`** (since
  R 4.1) are base-R and need no package — prefer them over magrittr `%>%` for new
  code; `%>%` remains fine where you need its `.` placeholder / tee behavior.
  [cran.r-project.org (R sources / NEWS, 4.6.x current), retrieved 2026-07-10]
- Pin the R version in `renv.lock` and CI; base-R behavior (e.g. `stringsAsFactors`
  defaulting to `FALSE` since R 4.0) has shifted across majors — never assume an
  older default.

## References (retrieved 2026-07-10)
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- R project (releases / NEWS): https://cran.r-project.org/
- R condition/error handling (Advanced R): https://adv-r.hadley.nz/conditions.html
- testthat: https://testthat.r-lib.org/
