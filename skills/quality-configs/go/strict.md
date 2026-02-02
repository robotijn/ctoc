# Go Strict Quality Config

Strict mode configuration for Go projects with golangci-lint.

## Mode: Strict

- Coverage: 80% minimum
- All major linters enabled
- Complexity limits enforced

## golangci-lint Config (`.golangci.yml`)

```yaml
run:
  timeout: 5m
  tests: true

linters:
  enable:
    # Default linters
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused

    # Additional strict linters
    - bodyclose
    - contextcheck
    - cyclop
    - dupl
    - durationcheck
    - errname
    - errorlint
    - exhaustive
    - exportloopref
    - forbidigo
    - forcetypeassert
    - funlen
    - gochecknoinits
    - gocognit
    - goconst
    - gocritic
    - gocyclo
    - godot
    - gofmt
    - goimports
    - gomnd
    - gomoddirectives
    - goprintffuncname
    - gosec
    - importas
    - lll
    - makezero
    - misspell
    - nakedret
    - nestif
    - nilerr
    - nilnil
    - noctx
    - nolintlint
    - prealloc
    - predeclared
    - promlinter
    - revive
    - rowserrcheck
    - sqlclosecheck
    - stylecheck
    - tenv
    - testpackage
    - thelper
    - tparallel
    - unconvert
    - unparam
    - wastedassign
    - whitespace

linters-settings:
  gocyclo:
    min-complexity: 10

  funlen:
    lines: 50
    statements: 40

  gocognit:
    min-complexity: 15

  nestif:
    min-complexity: 4

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
        arguments: [4]
      - name: function-result-limit
        arguments: [3]
      - name: cognitive-complexity
        arguments: [15]
      - name: cyclomatic
        arguments: [10]

  lll:
    line-length: 120

  goconst:
    min-len: 3
    min-occurrences: 3

  misspell:
    locale: US

  gosec:
    includes:
      - G101 # Look for hard coded credentials
      - G102 # Bind to all interfaces
      - G103 # Audit the use of unsafe block
      - G104 # Audit errors not checked
      - G106 # Audit the use of ssh.InsecureIgnoreHostKey
      - G107 # Url provided to HTTP request as taint input
      - G108 # Profiling endpoint automatically exposed
      - G109 # Potential Integer overflow made by strconv.Atoi result conversion to int16/32
      - G110 # Potential DoS vulnerability via decompression bomb
      - G201 # SQL query construction using format string
      - G202 # SQL query construction using string concatenation
      - G203 # Use of unescaped data in HTML templates
      - G204 # Audit use of command execution
      - G301 # Poor file permissions used when creating a directory
      - G302 # Poor file permissions used with chmod
      - G303 # Creating tempfile using a predictable path
      - G304 # File path provided as taint input
      - G305 # File traversal when extracting zip archive
      - G306 # Poor file permissions used when writing to a new file
      - G307 # Deferring a method which returns an error
      - G401 # Detect the usage of DES, RC4, MD5 or SHA1
      - G402 # Look for bad TLS connection settings
      - G403 # Ensure minimum RSA key length of 2048 bits
      - G404 # Insecure random number source (rand)
      - G501 # Import blocklist: crypto/md5
      - G502 # Import blocklist: crypto/des
      - G503 # Import blocklist: crypto/rc4
      - G504 # Import blocklist: net/http/cgi
      - G505 # Import blocklist: crypto/sha1
      - G601 # Implicit memory aliasing in for loop

issues:
  exclude-use-default: false
  max-issues-per-linter: 0
  max-same-issues: 0
  new: false

severity:
  default-severity: error
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cyclomatic | 10 |
| Cognitive | 15 |
| Function length | 50 lines |
| Function statements | 40 |
| Nesting depth | 4 |
| Arguments | 4 |
| Return values | 3 |

## Install Command

```bash
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

## Makefile

```makefile
.PHONY: lint test coverage quality

lint:
	golangci-lint run ./...

test:
	go test -v ./...

coverage:
	go test -coverprofile=coverage.out -covermode=atomic ./...
	go tool cover -func=coverage.out
	@go tool cover -func=coverage.out | grep total | awk '{print $$3}' | sed 's/%//' | \
		awk '{if ($$1 < 80) {print "Coverage " $$1 "% is below 80% threshold"; exit 1}}'

quality: lint test coverage
```

## Directory Structure

```
project/
├── .golangci.yml
├── go.mod
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
