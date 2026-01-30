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
