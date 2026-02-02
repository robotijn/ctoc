# Go Legacy Quality Config

Gradual adoption configuration for migrating existing Go projects.

## Mode: Legacy

- Coverage: 50% minimum
- Essential linters only
- Relaxed complexity limits

## golangci-lint Config (`.golangci.yml`)

```yaml
run:
  timeout: 5m
  tests: true

linters:
  enable:
    # Essential linters only
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused
    - gofmt
    - goimports

linters-settings:
  gocyclo:
    min-complexity: 15

  funlen:
    lines: 100
    statements: 80

issues:
  exclude-use-default: true
  max-issues-per-linter: 50
  max-same-issues: 10

severity:
  default-severity: warning
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 15 |
| Function length | 100 lines |
| Function statements | 80 |

## Upgrade Path

1. Fix all essential linter errors
2. Enable additional linters one by one
3. Increase coverage thresholds
4. Tighten complexity limits

## Install Command

```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```
