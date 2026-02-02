# coverage.py Guide
> Claude Code Python coverage reference. Updated February 2026.

## Overview

coverage.py is the standard code coverage tool for Python. It measures line and branch coverage, generates reports in multiple formats, and integrates with all major test frameworks.

## Installation

```bash
# Basic installation
pip install coverage

# With pytest integration
pip install pytest-cov

# With toml support (Python < 3.11)
pip install coverage[toml]
```

## Configuration

### pyproject.toml (Recommended)

```toml
[tool.coverage.run]
source = ["src"]
branch = true
parallel = true
omit = [
    "*/tests/*",
    "*/__pycache__/*",
    "*/migrations/*",
    "*/.venv/*",
    "*/conftest.py"
]
data_file = ".coverage"

[tool.coverage.paths]
source = [
    "src/",
    "*/site-packages/"
]

[tool.coverage.report]
fail_under = 80
show_missing = true
skip_covered = false
skip_empty = true
precision = 2
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
    "if typing.TYPE_CHECKING:",
    "@abstractmethod",
    "@abc.abstractmethod"
]
exclude_also = [
    "class .*\\bProtocol\\):",
    "def __str__",
    "\\.\\.\\."
]

[tool.coverage.html]
directory = "htmlcov"
show_contexts = true

[tool.coverage.xml]
output = "coverage.xml"

[tool.coverage.json]
output = "coverage.json"
pretty_print = true
```

### .coveragerc (Legacy)

```ini
[run]
source = src
branch = True
parallel = True
omit =
    */tests/*
    */__pycache__/*
    */migrations/*

[report]
fail_under = 80
show_missing = True
skip_covered = False
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
    if TYPE_CHECKING:

[html]
directory = htmlcov

[xml]
output = coverage.xml
```

### setup.cfg

```ini
[coverage:run]
source = src
branch = true

[coverage:report]
fail_under = 80
show_missing = true
```

## Running Coverage

### Direct Coverage Command

```bash
# Run tests with coverage
coverage run -m pytest

# Run specific test file
coverage run -m pytest tests/test_api.py

# Run with branch coverage
coverage run --branch -m pytest

# Generate report
coverage report

# Generate HTML report
coverage html

# Generate XML for CI
coverage xml
```

### With pytest-cov

```bash
# Basic usage
pytest --cov=src

# With HTML report
pytest --cov=src --cov-report=html

# With multiple report formats
pytest --cov=src --cov-report=term --cov-report=html --cov-report=xml

# With branch coverage
pytest --cov=src --cov-branch

# Fail if below threshold
pytest --cov=src --cov-fail-under=80

# Show missing lines
pytest --cov=src --cov-report=term-missing
```

### With unittest

```bash
# Run unittest with coverage
coverage run -m unittest discover

# With specific test directory
coverage run -m unittest discover -s tests -p "test_*.py"
```

### With nose2

```bash
coverage run -m nose2
```

## Coverage Exclusion

### Line-Level Exclusion

```python
def debug_function():  # pragma: no cover
    """This function is excluded from coverage."""
    print("Debug output")

if __name__ == "__main__":  # pragma: no cover
    main()
```

### Block-Level Exclusion

```python
# pragma: no cover
def entire_function_excluded():
    line_one()
    line_two()
    line_three()
# end pragma: no cover (automatically ends at dedent)
```

### Conditional Exclusion

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # Automatically excluded by default config
    from mymodule import SomeType

def typed_function(value: "SomeType") -> None:
    pass
```

### Custom Exclusion Patterns

```toml
# pyproject.toml
[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
    "@overload",
    "\\.\\.\\."  # Ellipsis in stubs
]
exclude_also = [
    "if settings.DEBUG:",
    "if os.environ.get\\('DEBUG'\\):"
]
```

### Partial Branch Exclusion

```python
def process(value):
    if value is None:  # pragma: no branch
        # The else branch is excluded from branch coverage
        return default_value
    return transform(value)
```

## Report Types

### Terminal Report

```bash
coverage report
```

Output:
```
Name                    Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------
src/__init__.py             0      0      0      0   100%
src/calculator.py          20      2      8      1    88%   15-16
src/utils.py               45     10     12      3    75%   23-28, 45
---------------------------------------------------------------------
TOTAL                      65     12     20      4    80%
```

### Terminal with Missing Lines

```bash
coverage report --show-missing
# or
coverage report -m
```

### HTML Report

```bash
coverage html
# Opens coverage/index.html with interactive report
```

### XML Report (Cobertura)

```bash
coverage xml
# Generates coverage.xml for CI tools
```

### JSON Report

```bash
coverage json
# Generates coverage.json for programmatic access
```

### LCOV Report

```bash
coverage lcov
# Generates coverage.lcov for tools like Codecov
```

## Combining Coverage

### Multiple Test Runs

```bash
# Run different test suites (parallel mode)
coverage run --parallel-mode -m pytest tests/unit/
coverage run --parallel-mode -m pytest tests/integration/

# Combine results
coverage combine

# Generate report from combined data
coverage report
```

### CI Parallel Jobs

```yaml
# GitHub Actions example
jobs:
  test:
    strategy:
      matrix:
        test-group: [unit, integration, e2e]
    steps:
      - run: coverage run --parallel-mode -m pytest tests/${{ matrix.test-group }}
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.test-group }}
          path: .coverage.*

  combine:
    needs: test
    steps:
      - uses: actions/download-artifact@v4
      - run: |
          coverage combine coverage-*/.coverage.*
          coverage report --fail-under=80
          coverage xml
```

### Subprocess Coverage

```python
# conftest.py
import coverage

def pytest_configure(config):
    # Enable coverage for subprocesses
    coverage.process_startup()
```

```bash
# Set environment variable
export COVERAGE_PROCESS_START=.coveragerc
coverage run -m pytest
coverage combine
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          pip install -e .[test]
          pip install pytest-cov

      - name: Run tests with coverage
        run: pytest --cov=src --cov-report=xml --cov-fail-under=80

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage.xml
          fail_ci_if_error: true
```

### GitLab CI

```yaml
test:
  stage: test
  script:
    - pip install -e .[test] pytest-cov
    - pytest --cov=src --cov-report=term --cov-report=xml
    - coverage report --fail-under=80
  coverage: '/TOTAL.*\s+(\d+%)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
```

### Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh '''
                    pip install -e .[test] pytest-cov
                    pytest --cov=src --cov-report=xml --junitxml=results.xml
                '''
            }
            post {
                always {
                    junit 'results.xml'
                    publishCoverage adapters: [
                        coberturaAdapter('coverage.xml')
                    ]
                }
            }
        }
    }
}
```

### Azure DevOps

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: '3.12'

  - script: |
      pip install -e .[test] pytest-cov
      pytest --cov=src --cov-report=xml --junitxml=results.xml
    displayName: 'Run tests'

  - task: PublishTestResults@2
    inputs:
      testResultsFiles: 'results.xml'

  - task: PublishCodeCoverageResults@2
    inputs:
      summaryFileLocation: 'coverage.xml'
```

## Advanced Features

### Context Coverage

Track which test covers which line:

```toml
[tool.coverage.run]
dynamic_context = "test_function"
```

```bash
coverage run -m pytest
coverage html --show-contexts
```

### Branch Coverage Analysis

```toml
[tool.coverage.report]
show_missing = true
# Shows partial branches
```

```python
def complex_logic(a, b, c):
    if a and b:  # Branch: (True, True), (True, False), (False, *)
        if c:    # Branch: True, False
            return "all true"
        return "c is false"
    return "a or b is false"
```

### Per-File Thresholds

```python
# conftest.py
import pytest
from coverage import Coverage

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()

    if report.when == "call":
        cov = Coverage()
        cov.load()

        # Check per-file coverage
        for filename, analysis in cov.analysis2(item.fspath):
            coverage_pct = 100 * len(analysis.executed) / len(analysis.statements)
            if coverage_pct < 70:
                pytest.fail(f"{filename} coverage {coverage_pct:.1f}% < 70%")
```

### Measuring Django Applications

```python
# conftest.py
import coverage

def pytest_configure(config):
    cov = coverage.Coverage(
        source=["myapp"],
        omit=["*/migrations/*", "*/tests/*"]
    )
    cov.start()
    config._cov = cov

def pytest_unconfigure(config):
    cov = config._cov
    cov.stop()
    cov.save()
    cov.report()
```

## Troubleshooting

### No Coverage Data Collected

```bash
# Check source is correct
coverage debug sys

# Verify files are being tracked
coverage debug data
```

### Wrong Source Files

```toml
[tool.coverage.run]
source = ["src"]  # Use package name, not file paths
```

### Import Errors

```bash
# Ensure package is installed
pip install -e .

# Then run coverage
coverage run -m pytest
```

### Multiprocessing Coverage

```python
# Add to test setup
import coverage
coverage.process_startup()
```

### Coverage Not Combining

```bash
# Check file names
ls -la .coverage*

# Force combine
coverage combine --keep
```

## Best Practices

### Consistent Configuration

Use `pyproject.toml` for all projects (Python 3.11+):

```toml
[tool.coverage.run]
source = ["src"]
branch = true
```

### Meaningful Exclusions

```toml
[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "raise NotImplementedError",  # Abstract methods
    "if TYPE_CHECKING:",          # Type hints only
    "@abstractmethod"             # Abstract methods
]
```

### CI Enforcement

```bash
# Always use fail-under in CI
pytest --cov=src --cov-fail-under=80
```

### Ratcheting

```python
# scripts/check_coverage.py
import json
import sys

with open("coverage.json") as f:
    data = json.load(f)

current = data["totals"]["percent_covered"]

with open(".coverage_threshold") as f:
    threshold = float(f.read().strip())

if current < threshold:
    print(f"Coverage {current:.1f}% dropped below threshold {threshold:.1f}%")
    sys.exit(1)

# Update threshold (ratchet up)
with open(".coverage_threshold", "w") as f:
    f.write(f"{max(current, threshold):.1f}\n")
```

## What NOT to Do

- Do NOT use `# pragma: no cover` to hide untested code
- Do NOT set thresholds too high initially (start at 60%)
- Do NOT exclude entire modules without justification
- Do NOT forget branch coverage (`branch = true`)
- Do NOT run coverage in development (use in CI only)
- Do NOT ignore coverage drops in PRs
- Do NOT generate HTML reports in CI (use xml/lcov)
- Do NOT forget to combine parallel coverage data
