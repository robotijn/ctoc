# Go CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
golangci-lint run --fix                # Lint (auto-fix)
go fmt ./...                           # Format
go test -race -cover ./...             # Test with race detection
go build -o bin/ ./...                 # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Go 1.22+** - Latest stable with generics
- **golangci-lint** - Comprehensive linting (100+ linters)
- **go test -race** - Race condition detection
- **go vet** - Static analysis
- **dlv** - Delve debugger

## Project Structure
```
project/
├── cmd/app/           # Application entrypoints
├── internal/          # Private application code
├── pkg/               # Public library code
├── go.mod             # Module definition
└── go.sum             # Dependency checksums
```

## Non-Negotiables
1. Handle ALL errors - never discard with `_`
2. Use context for cancellation and timeouts
3. No naked goroutines - always handle panics
4. Document all exported functions and types

## Red Lines (Reject PR)
- Ignoring errors with `_`
- Missing context.Context in public APIs
- Goroutines without lifecycle management
- Data races (use -race flag)
- panic() in library code
- Secrets hardcoded in source

## Testing Strategy
- **Unit**: Table-driven tests, <100ms, mock interfaces
- **Integration**: testcontainers-go for real deps
- **E2E**: Critical paths with real infrastructure

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Nil pointer dereference | Check nil before use |
| Goroutine leaks | Use errgroup, context cancellation |
| Range variable capture | Use loop var copy or Go 1.22+ |
| Slice append mutation | Copy slice if sharing |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded goroutines (use worker pools)
- No blocking without context timeout

## Security Checklist
- [ ] Input validated at boundaries
- [ ] SQL uses parameterized queries
- [ ] Secrets from environment (os.Getenv)
- [ ] Dependencies audited (`govulncheck`)
