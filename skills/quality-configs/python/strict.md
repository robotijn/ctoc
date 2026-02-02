# Python Strict Quality Config

Strict mode configuration for Python projects with Ruff and mypy.

## Mode: Strict

- Coverage: 80% minimum
- Complexity: Standard limits
- Type checking: mypy strict

## Ruff Config (`ruff.toml`)

```toml
# Ruff configuration for strict mode

[lint]
select = [
  "E",      # pycodestyle errors
  "W",      # pycodestyle warnings
  "F",      # Pyflakes
  "I",      # isort
  "B",      # flake8-bugbear
  "C4",     # flake8-comprehensions
  "UP",     # pyupgrade
  "ARG",    # flake8-unused-arguments
  "SIM",    # flake8-simplify
  "TCH",    # flake8-type-checking
  "PTH",    # flake8-use-pathlib
  "ERA",    # eradicate (commented code)
  "PL",     # Pylint
  "RUF",    # Ruff-specific
  "S",      # flake8-bandit (security)
  "A",      # flake8-builtins
  "COM",    # flake8-commas
  "DTZ",    # flake8-datetimez
  "T10",    # flake8-debugger
  "EXE",    # flake8-executable
  "ISC",    # flake8-implicit-str-concat
  "ICN",    # flake8-import-conventions
  "G",      # flake8-logging-format
  "INP",    # flake8-no-pep420
  "PIE",    # flake8-pie
  "PYI",    # flake8-pyi
  "Q",      # flake8-quotes
  "RSE",    # flake8-raise
  "RET",    # flake8-return
  "SLF",    # flake8-self
  "SLOT",   # flake8-slots
  "TID",    # flake8-tidy-imports
  "INT",    # flake8-gettext
  "PERF",   # Perflint
  "FURB",   # refurb
  "LOG",    # flake8-logging
]
ignore = []

[lint.per-file-ignores]
"tests/**" = ["S101", "ARG001"]
"conftest.py" = ["S101"]

[lint.mccabe]
max-complexity = 10

[lint.pylint]
max-args = 4
max-statements = 50
max-branches = 12

[format]
quote-style = "double"
indent-style = "space"
line-ending = "auto"
skip-magic-trailing-comma = false
docstring-code-format = true

[lint.isort]
known-first-party = ["src"]
force-single-line = false
combine-as-imports = true
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
show_error_codes = true
show_error_context = true
pretty = true

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
addopts = "-v --tb=short"

[tool.coverage.run]
source = ["src"]
branch = true
omit = ["tests/*", "**/__pycache__/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
fail_under = 80
show_missing = true
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Arguments | 4 |
| Statements | 50 |
| Branches | 12 |

## Install Command

```bash
uv add --dev ruff mypy pytest pytest-cov
```

Or with pip:

```bash
pip install ruff mypy pytest pytest-cov
```

## Project Scripts

Add to `pyproject.toml`:

```toml
[project.scripts]
# Or use a Makefile

[tool.taskipy.tasks]
lint = "ruff check src/"
lint_fix = "ruff check src/ --fix"
format = "ruff format src/"
format_check = "ruff format src/ --check"
typecheck = "mypy src/"
test = "pytest"
test_cov = "pytest --cov=src --cov-report=term-missing --cov-fail-under=80"
quality = "task lint && task typecheck && task test_cov"
```

## Directory Structure

```
project/
├── pyproject.toml
├── ruff.toml
├── src/
│   └── package_name/
│       ├── __init__.py
│       └── module.py
├── tests/
│   ├── __init__.py
│   └── test_module.py
└── README.md
```
