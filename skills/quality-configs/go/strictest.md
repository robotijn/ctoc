# Go Strictest Quality Config

Maximal strictness for Go projects — the tightest tier in the go family. Turns on the
**entire golangci-lint linter set** (`default: all`), enforces tight cyclomatic/cognitive
budgets, and gates merges on **90% line coverage**. Model this on `go/strict.md` but with
every knob turned to its hardest correct setting.

> Verified versions (retrieved 2026-07-09):
> - golangci-lint **v2.12.2** — https://github.com/golangci/golangci-lint/releases/tag/v2.12.2 (2026-05-06)
> - Go **1.26.5** (current stable) — https://go.dev/dl/ (2026-07-09)
> - golangci-lint-action **v9.3.0** — https://github.com/golangci/golangci-lint-action/releases/tag/v9.3.0 (2026-06-29)
> - actions/setup-go **v6.5.0** — https://github.com/actions/setup-go/releases/tag/v6.5.0 (2026-06-24)

## Mode: Strictest

- Coverage: **90%** line minimum (merge-blocking)
- **All** golangci-lint linters enabled via `default: all`, curated `disable` list
- Tight complexity budgets: gocyclo 7 / gocognit 10 / funlen 30 / nestif 3
- `severity.default: error` — every finding fails CI

## golangci-lint Config (`.golangci.yml`)

golangci-lint **v2** replaced the v1 `linters.enable-all: true` with `linters.default: all`,
moved per-linter settings under `linters.settings`, split the pure formatters
(`gofmt`/`goimports`) into a top-level `formatters` block, and moved exclusions under
`linters.exclusions`. This config targets that v2 schema (`version: "2"`). Schema reference:
https://golangci-lint.run/docs/configuration/file/ (retrieved 2026-07-09).

```yaml
version: "2"

run:
  timeout: 5m
  tests: true

linters:
  # Enable EVERY linter, then subtract the ones that fight this preset.
  default: all
  disable:
    - depguard    # needs a project-specific import allow/deny list
    - gci         # overlaps with the goimports formatter below
    - wrapcheck   # too noisy for most codebases

  settings:
    gocyclo:
      min-complexity: 7
    gocognit:
      min-complexity: 10
    funlen:
      lines: 30
      statements: 25
    nestif:
      min-complexity: 3
    lll:
      line-length: 100
    goconst:
      min-len: 2
      min-occurrences: 2
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
    gosec:
      # Audit the security-sensitive rule families (subset shown; run all G-rules).
      includes:
        - G101  # hardcoded credentials
        - G104  # unchecked errors
        - G201  # SQL string-format construction
        - G204  # command execution audit
        - G304  # file path as taint input
        - G401  # weak crypto (DES/RC4/MD5/SHA1)
        - G402  # bad TLS settings
        - G404  # insecure math/rand source

  exclusions:
    # Do not silently swallow the default excludes — strictest sees everything.
    generated: lax

# gofmt/goimports are formatters in v2, not linters.
formatters:
  enable:
    - gofmt
    - goimports

issues:
  max-issues-per-linter: 0
  max-same-issues: 0

severity:
  default: error
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines  | 90%       |

Measured with the standard toolchain: `go test -coverprofile=coverage.out -covermode=atomic ./...`
then `go tool cover -func=coverage.out`. Ref: https://go.dev/testing/coverage/ (retrieved 2026-07-09).

## Complexity Limits

| Metric                   | Limit    |
|--------------------------|----------|
| Cyclomatic (gocyclo)     | 7        |
| Cognitive (gocognit)     | 10       |
| Function length (funlen) | 30 lines |
| Function statements      | 25       |
| Nesting depth (nestif)   | 3        |
| Arguments (revive)       | 3        |
| Return values (revive)   | 2        |
| Public structs per file  | 5        |
| Line length (lll)        | 100      |

## Install Command

Pin golangci-lint to a verified release rather than `@latest` so CI is reproducible.
Install verb reference: https://golangci-lint.run/docs/welcome/install/ (retrieved 2026-07-09).

```bash
# Pinned install (reproducible) — v2.12.2 verified 2026-07-09
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2

# Verify
golangci-lint version   # -> golangci-lint has version 2.12.2 ...
```

Note the v2 import path carries the `/v2/` module segment; the v1 path
(`github.com/golangci/golangci-lint/cmd/golangci-lint`) no longer resolves for v2 releases.

## Makefile

```makefile
.PHONY: lint fmt test cover quality

lint:
	golangci-lint run ./...

fmt:
	golangci-lint fmt ./...

test:
	go test -race -v ./...

cover:
	go test -race -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -func=coverage.out
	@go tool cover -func=coverage.out | grep total | awk '{print $$3}' | sed 's/%//' | \
		awk '{if ($$1 < 90) {print "Coverage " $$1 "% is below the 90% strictest threshold"; exit 1}}'

quality: lint test cover
```

## Directory Structure

```
project/
├── .golangci.yml
├── go.mod            # go 1.26
├── go.sum
├── Makefile
├── cmd/
│   └── app/
│       └── main.go
├── internal/
│   └── pkg/
│       └── module.go
└── pkg/
    └── public/
        └── api.go
```

## CI Integration (GitHub Actions)

```yaml
name: quality
on: [push, pull_request]

jobs:
  go-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # actions/setup-go v6.5.0 (verified 2026-07-09)
      - uses: actions/setup-go@v6
        with:
          go-version: "1.26"

      # golangci-lint-action v9.3.0 (verified 2026-07-09)
      - uses: golangci/golangci-lint-action@v9
        with:
          version: v2.12.2

      - name: Test with coverage gate
        run: |
          go test -race -coverprofile=coverage.out -covermode=atomic ./...
          total=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
          echo "coverage: ${total}%"
          awk "BEGIN{exit !(${total} >= 90)}" || { echo "coverage ${total}% < 90%"; exit 1; }
```

golangci-lint-action reference: https://github.com/golangci/golangci-lint-action#readme (retrieved 2026-07-09).
