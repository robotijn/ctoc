# Python Strictest Quality Config

Maximum strictness for Python projects.

## Mode: Strictest

- Coverage: 90% minimum
- Complexity: Tight limits
- All warnings as errors
- No type: ignore allowed

## Ruff Config (`ruff.toml`)

```toml
# Ruff configuration for strictest mode

[lint]
select = ["ALL"]  # Enable ALL rules
ignore = [
  "D",      # pydocstyle (enable if you want docstrings required)
  "ANN101", # Missing type self
  "ANN102", # Missing type cls
]

# Treat all warnings as errors
preview = true

[lint.per-file-ignores]
"tests/**" = ["S101", "ARG001", "PLR2004"]

[lint.mccabe]
max-complexity = 7

[lint.pylint]
max-args = 3
max-statements = 30
max-branches = 8
max-returns = 3
max-locals = 10

[format]
quote-style = "double"
indent-style = "space"
line-ending = "auto"
docstring-code-format = true

[lint.isort]
known-first-party = ["src"]
force-single-line = true
combine-as-imports = false
required-imports = ["from __future__ import annotations"]
```

## Mypy Config (`pyproject.toml`)

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
warn_unreachable = true
strict_equality = true
extra_checks = true

# Strictest: No escapes
allow_untyped_globals = false
allow_redefinition = false
local_partial_types = true
disable_error_code = []

# Report settings
show_error_codes = true
show_error_context = true
show_column_numbers = true
pretty = true

[tool.coverage.run]
source = ["src"]
branch = true
omit = ["tests/*"]

[tool.coverage.report]
fail_under = 90
show_missing = true
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
]
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Arguments | 3 |
| Statements | 30 |
| Branches | 8 |
| Returns | 3 |
| Local variables | 10 |

## Install Command

```bash
uv add --dev ruff mypy pytest pytest-cov
```
