# Go CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude ignores loop variable capture fix — Go 1.22+ fixed this
- Claude uses old timer patterns — Go 1.23 changed timer/ticker behavior
- Claude forgets `go mod tidy -diff` for CI validation
- Claude suggests manual iterator patterns — use range-over-func (1.23+)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `go 1.23+` | Iterators, fixed timers | Older versions |
| `golangci-lint` | Comprehensive linting | Just `go vet` |
| `go test -race` | Race detection | Tests without -race |
| `govulncheck` | Vulnerability scanning | Manual checks |
| `staticcheck` | Additional analysis | Limited checks |

## Patterns Claude Should Use
```go
// Range-over-func iterators (Go 1.23+)
func All[V any](s []V) iter.Seq[V] {
    return func(yield func(V) bool) {
        for _, v := range s {
            if !yield(v) { return }
        }
    }
}

// Correct timer usage (Go 1.23+)
// Timers now have unbuffered channels (cap 0)
// Stop/Reset guaranteed no stale values
timer := time.NewTimer(duration)
defer timer.Stop()

// Always use context
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```

## Anti-Patterns Claude Generates
- `_ = err` — handle all errors explicitly
- Goroutines without lifecycle — use errgroup or context
- `panic()` in library code — return errors
- Missing `defer rows.Close()` — resource leaks
- `interface{}` — use `any` (Go 1.18+)

## Version Gotchas
- **1.23**: Timer channels now unbuffered; `len(timer.C)` returns 0
- **1.23**: Range-over-func for custom iterators
- **1.22**: Loop variable capture fixed — no more `v := v` needed
- **1.27 (upcoming)**: `asynctimerchan` GODEBUG removed
- **With generics**: Prefer `any` over `interface{}`, use constraints
