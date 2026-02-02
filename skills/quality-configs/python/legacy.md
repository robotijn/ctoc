# Python Legacy Quality Config

Gradual adoption configuration for migrating existing Python projects.

## Mode: Legacy

- Coverage: 50% minimum
- Complexity: Relaxed limits
- Type checking: Optional annotations

## Ruff Config (`ruff.toml`)

```toml
# Ruff configuration for legacy mode

[lint]
select = [
  "E",      # pycodestyle errors
  "W",      # pycodestyle warnings
  "F",      # Pyflakes
  "I",      # isort
  "B",      # flake8-bugbear
  "C4",     # flake8-comprehensions
  "UP",     # pyupgrade
]
ignore = [
  "E501",   # Line too long (handled by formatter)
]

[lint.per-file-ignores]
"tests/**" = ["S101", "ARG001"]

[lint.mccabe]
max-complexity = 15

[lint.pylint]
max-args = 6
max-statements = 100

[format]
quote-style = "double"
indent-style = "space"
```

## Mypy Config (`pyproject.toml`)

```toml
[tool.mypy]
python_version = "3.12"
# Legacy: Relaxed type checking
strict = false
warn_return_any = false
disallow_untyped_defs = false
check_untyped_defs = true
ignore_missing_imports = true

[tool.coverage.run]
source = ["src"]
branch = true

[tool.coverage.report]
fail_under = 50
show_missing = true
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Arguments | 6 |
| Statements | 100 |

## Upgrade Path

1. Fix all ruff errors
2. Add type hints to new code
3. Enable mypy strict incrementally
4. Increase coverage thresholds

## Install Command

```bash
uv add --dev ruff mypy pytest pytest-cov
```
