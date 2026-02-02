# Go Strictest Quality Config

Maximum strictness for Go projects.

## Mode: Strictest

- Coverage: 90% minimum
- All linters enabled
- Tight complexity limits

## golangci-lint Config (`.golangci.yml`)

```yaml
run:
  timeout: 5m
  tests: true

linters:
  enable-all: true
  disable:
    - depguard    # Requires specific config
    - gci         # Conflicts with goimports
    - wrapcheck   # Too verbose for most projects

linters-settings:
  gocyclo:
    min-complexity: 7

  funlen:
    lines: 30
    statements: 25

  gocognit:
    min-complexity: 10

  nestif:
    min-complexity: 3

  gocritic:
    enabled-tags:
      - diagnostic
      - style
      - performance
      - experimental
      - opinionated

  revive:
    rules:
      - name: argument-limit
        arguments: [3]
      - name: function-result-limit
        arguments: [2]
      - name: cognitive-complexity
        arguments: [10]
      - name: cyclomatic
        arguments: [7]
      - name: max-public-structs
        arguments: [5]
      - name: function-length
        arguments: [30, 25]

  lll:
    line-length: 100

  goconst:
    min-len: 2
    min-occurrences: 2

issues:
  exclude-use-default: false
  max-issues-per-linter: 0
  max-same-issues: 0

severity:
  default-severity: error
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 7 |
| Cognitive | 10 |
| Function length | 30 lines |
| Function statements | 25 |
| Nesting depth | 3 |
| Arguments | 3 |
| Return values | 2 |
| Public structs per file | 5 |

## Install Command

```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```
