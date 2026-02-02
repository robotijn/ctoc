# Go Cover Guide
> Claude Code Go coverage reference. Updated February 2026.

## Overview

Go has built-in coverage support through `go test -cover`. No external tools required. Coverage data can be output in multiple formats and visualized through the standard toolchain.

## Basic Usage

### Running Coverage

```bash
# Run tests with coverage
go test -cover ./...

# Output coverage percentage
go test -cover -coverprofile=coverage.out ./...

# View coverage report
go tool cover -func=coverage.out

# Generate HTML report
go tool cover -html=coverage.out -o coverage.html
```

### Coverage Modes

```bash
# set: did this statement run? (default, fastest)
go test -covermode=set -coverprofile=coverage.out ./...

# count: how many times did this statement run?
go test -covermode=count -coverprofile=coverage.out ./...

# atomic: like count, but for parallel tests (slowest, most accurate)
go test -covermode=atomic -coverprofile=coverage.out ./...
```

| Mode | Use Case | Performance |
|------|----------|-------------|
| `set` | Basic coverage | Fastest |
| `count` | Hotspot analysis | Medium |
| `atomic` | Parallel tests, race conditions | Slowest |

## Configuration

### go.mod Test Configuration

```go
// No special configuration needed
// Coverage is built into go test
```

### Makefile Targets

```makefile
.PHONY: test coverage coverage-html

# Run tests
test:
	go test -race -v ./...

# Generate coverage
coverage:
	go test -race -covermode=atomic -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out

# Generate HTML report
coverage-html: coverage
	go tool cover -html=coverage.out -o coverage.html
	open coverage.html

# Check coverage threshold
coverage-check: coverage
	@COVERAGE=$$(go tool cover -func=coverage.out | grep total | awk '{print $$3}' | sed 's/%//'); \
	if [ $$(echo "$$COVERAGE < 80" | bc -l) -eq 1 ]; then \
		echo "Coverage $$COVERAGE% is below 80% threshold"; \
		exit 1; \
	fi
```

### GitHub Actions Workflow

```yaml
name: Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Run tests with coverage
        run: go test -race -covermode=atomic -coverprofile=coverage.out ./...

      - name: Check coverage threshold
        run: |
          COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage.out
```

## Coverage Report Formats

### Text Report

```bash
go tool cover -func=coverage.out
```

Output:
```
myapp/calculator.go:5:      Add             100.0%
myapp/calculator.go:9:      Subtract        100.0%
myapp/calculator.go:13:     Multiply        80.0%
myapp/calculator.go:17:     Divide          66.7%
total:                      (statements)    86.7%
```

### HTML Report

```bash
go tool cover -html=coverage.out -o coverage.html
```

Opens interactive HTML with:
- Green: covered lines
- Red: uncovered lines
- Yellow: partial coverage

### Machine-Readable Formats

```bash
# Profile format (default)
go test -coverprofile=coverage.out ./...

# Convert to other formats using tools
# For LCOV format (Codecov, SonarQube)
go install github.com/jandelgado/gcov2lcov@latest
gcov2lcov -infile=coverage.out -outfile=coverage.lcov

# For Cobertura XML
go install github.com/t-yuki/gocover-cobertura@latest
gocover-cobertura < coverage.out > coverage.xml
```

## Package-Level Coverage

### Specific Packages

```bash
# Single package
go test -cover ./pkg/calculator

# Multiple packages
go test -cover ./pkg/calculator ./pkg/math

# All packages
go test -cover ./...

# Exclude vendor
go test -cover $(go list ./... | grep -v /vendor/)
```

### Per-Package Report

```bash
# Show coverage per package
go test -cover ./... 2>&1 | grep coverage

# Detailed per-package
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out | head -n -1 | sort -k3 -n -r
```

## Coverage Exclusion

### Build Tags

```go
// +build !coverage

package myapp

// This file is excluded when running with coverage
func debugOnlyFunction() {
    // Development-only code
}
```

```bash
# Run tests excluding files with coverage build tag
go test -cover -tags=coverage ./...
```

### Separate Test Files

```go
// mycode_nocov_test.go
// +build !coverage

package myapp

// Tests that shouldn't affect coverage
func TestIntegration(t *testing.T) {
    // Integration tests
}
```

### Ignoring Generated Code

```bash
# Exclude generated files from coverage
go test -cover ./... -coverpkg=$(go list ./... | grep -v generated | tr '\n' ',')
```

### Comment-Based Exclusion

Go doesn't have built-in coverage exclusion comments. Use file organization instead:

```
myapp/
├── calculator.go           # Covered
├── calculator_test.go      # Tests
├── generated/              # Excluded from coverpkg
│   └── models.go
└── debug.go               # +build !coverage tag
```

## Multi-Package Coverage

### Cover All Packages

```bash
# Include all packages in coverage profile
go test -coverprofile=coverage.out -coverpkg=./... ./...
```

### Exclude Specific Packages

```bash
# Exclude mocks and generated code
go test -coverprofile=coverage.out \
  -coverpkg=$(go list ./... | grep -v '/mocks\|/generated\|/testutil' | tr '\n' ',') \
  ./...
```

### Aggregate Coverage

```bash
# Run tests in parallel and merge coverage
go test -coverprofile=coverage.out -covermode=atomic ./...
```

## Integration with CI/CD

### GitHub Actions (Full)

```yaml
name: Test and Coverage

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
          cache: true

      - name: Run tests
        run: |
          go test -race -covermode=atomic -coverprofile=coverage.out ./...

      - name: Generate coverage report
        run: go tool cover -func=coverage.out

      - name: Check minimum coverage
        run: |
          COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          echo "Total coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "::error::Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.out
          fail_ci_if_error: true
          token: ${{ secrets.CODECOV_TOKEN }}
```

### GitLab CI

```yaml
test:
  stage: test
  image: golang:1.22
  script:
    - go test -race -covermode=atomic -coverprofile=coverage.out ./...
    - go tool cover -func=coverage.out
  coverage: '/total:\s+\(statements\)\s+(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
```

### CircleCI

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/go:1.22
    steps:
      - checkout
      - run:
          name: Run tests with coverage
          command: |
            go test -race -covermode=atomic -coverprofile=coverage.out ./...
            go tool cover -func=coverage.out
      - run:
          name: Check coverage threshold
          command: |
            COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
            if (( $(echo "$COVERAGE < 80" | bc -l) )); then
              echo "Coverage $COVERAGE% below threshold"
              exit 1
            fi
```

## Coverage Threshold Enforcement

### Simple Bash Check

```bash
#!/bin/bash
# check-coverage.sh

THRESHOLD=${1:-80}
COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')

echo "Coverage: $COVERAGE%"
echo "Threshold: $THRESHOLD%"

if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
    echo "FAIL: Coverage is below threshold"
    exit 1
fi

echo "PASS: Coverage meets threshold"
```

### Go-Based Check

```go
// tools/coverage-check/main.go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strconv"
    "strings"
)

func main() {
    threshold := 80.0
    if len(os.Args) > 1 {
        t, err := strconv.ParseFloat(os.Args[1], 64)
        if err == nil {
            threshold = t
        }
    }

    file, err := os.Open("coverage.out")
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error: %v\n", err)
        os.Exit(1)
    }
    defer file.Close()

    var total, covered int
    scanner := bufio.NewScanner(file)
    scanner.Scan() // Skip mode line

    for scanner.Scan() {
        fields := strings.Fields(scanner.Text())
        if len(fields) >= 3 {
            stmts, _ := strconv.Atoi(fields[1])
            count, _ := strconv.Atoi(fields[2])
            total += stmts
            if count > 0 {
                covered += stmts
            }
        }
    }

    coverage := float64(covered) / float64(total) * 100
    fmt.Printf("Coverage: %.1f%% (threshold: %.1f%%)\n", coverage, threshold)

    if coverage < threshold {
        os.Exit(1)
    }
}
```

### Ratcheting Script

```bash
#!/bin/bash
# ratchet-coverage.sh

THRESHOLD_FILE=".coverage-threshold"
COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')

if [ -f "$THRESHOLD_FILE" ]; then
    THRESHOLD=$(cat "$THRESHOLD_FILE")
else
    THRESHOLD=0
fi

echo "Current coverage: $COVERAGE%"
echo "Previous threshold: $THRESHOLD%"

if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
    echo "FAIL: Coverage dropped from $THRESHOLD% to $COVERAGE%"
    exit 1
fi

# Ratchet up (only increases, never decreases)
if (( $(echo "$COVERAGE > $THRESHOLD" | bc -l) )); then
    echo "$COVERAGE" > "$THRESHOLD_FILE"
    echo "Threshold updated to $COVERAGE%"
fi
```

## Visualization Tools

### go-cover-treemap

```bash
go install github.com/nikolaydubina/go-cover-treemap@latest
go-cover-treemap -coverprofile coverage.out > coverage.svg
```

### gocov

```bash
go install github.com/axw/gocov/gocov@latest
go install github.com/matm/gocov-html/cmd/gocov-html@latest

gocov convert coverage.out | gocov-html > coverage.html
```

### go-coverage-report

```bash
go install github.com/fzipp/gocyclo/cmd/gocyclo@latest
# Generates badge-ready coverage data
```

## Troubleshooting

### No Coverage Data

```bash
# Ensure tests are running
go test -v ./...

# Check coverage output
go test -cover -v ./... 2>&1 | grep -i cover
```

### Wrong Package Coverage

```bash
# Use -coverpkg to specify packages
go test -coverprofile=coverage.out -coverpkg=./... ./...
```

### Coverage of External Packages

```bash
# Only cover your code, not dependencies
go test -coverprofile=coverage.out \
  -coverpkg=$(go list ./... | tr '\n' ',') \
  ./...
```

### Parallel Test Issues

```bash
# Use atomic mode for parallel tests
go test -race -covermode=atomic -coverprofile=coverage.out ./...
```

## Best Practices

### Use Atomic Mode for CI

```bash
go test -race -covermode=atomic -coverprofile=coverage.out ./...
```

### Exclude Generated Code

```bash
# Define coverpkg explicitly
go test -coverpkg=$(go list ./... | grep -v /generated/ | tr '\n' ',') ./...
```

### Meaningful Thresholds

```bash
# Start at 60%, increase over time
# Target 80% for mature projects
THRESHOLD=80
```

### Combine with Race Detection

```bash
go test -race -covermode=atomic -coverprofile=coverage.out ./...
```

### Include in CI Pipeline

```yaml
- run: go test -race -covermode=atomic -coverprofile=coverage.out ./...
- run: |
    COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
    if (( $(echo "$COVERAGE < 80" | bc -l) )); then exit 1; fi
```

## What NOT to Do

- Do NOT use `set` mode with parallel tests (use `atomic`)
- Do NOT ignore race conditions in coverage runs
- Do NOT set thresholds below 60% for new projects
- Do NOT exclude packages just because they are hard to test
- Do NOT run coverage in development (slow, use in CI)
- Do NOT forget to check coverage on PRs
- Do NOT generate HTML reports in CI (use text/lcov)
- Do NOT rely on percentage alone (check uncovered critical paths)
