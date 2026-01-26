# Go CTO
> Simplicity above all.

## Tools (2024-2025)
- **go fmt** - Automatic formatting
- **go vet** - Static analysis
- **golangci-lint** - Comprehensive linting
- **go test -race** - Race detection

## Non-Negotiables
1. Handle ALL errors - never `_`
2. Use context for cancellation
3. No naked goroutines
4. Document exported functions

## Red Lines
- Ignoring errors with `_`
- Missing context in public functions
- Goroutines without cancellation
- Data races
- Panic in library code
