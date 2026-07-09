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

## Concurrency / Goroutine Footguns
Goroutines are the #1 correctness trap: a leaked goroutine is not a crash, it is a
slow memory/FD bleed that never shows up in tests. Every goroutine needs an
**owner** that guarantees it terminates.

```go
// FOOTGUN 1: goroutine leak — send on an unbuffered channel with no receiver.
// If the caller returns early (ctx timeout, error), this goroutine blocks FOREVER
// on the send and is never collected.
func leak(ctx context.Context) (int, error) {
    ch := make(chan int)          // unbuffered
    go func() { ch <- expensive() }()   // leaks if nobody reads ch
    select {
    case v := <-ch:
        return v, nil
    case <-ctx.Done():
        return 0, ctx.Err()       // goroutine still blocked on ch<- → LEAK
    }
}

// SAFE: buffer the channel (cap 1) so the send always completes, or make the
// goroutine select on ctx.Done() itself and exit. Buffering is simplest here:
func noLeak(ctx context.Context) (int, error) {
    ch := make(chan int, 1)       // cap 1 → send never blocks a stranded goroutine
    go func() { ch <- expensive() }()
    select {
    case v := <-ch:
        return v, nil
    case <-ctx.Done():
        return 0, ctx.Err()       // goroutine sends into the buffer and exits cleanly
    }
}
```
- **Context propagation is mandatory**: any function that blocks (I/O, RPC, channel
  op) must take `ctx context.Context` as its FIRST arg and honor `ctx.Done()`.
  Never store a `Context` in a struct; pass it down the call chain.
- **`sync.WaitGroup` misuse**: call `wg.Add(n)` BEFORE launching goroutines, never
  inside the goroutine (race with `wg.Wait()`). One `defer wg.Done()` per goroutine.
- **`errgroup`** (`golang.org/x/sync/errgroup`) is the idiomatic owner for a fan-out:
  it cancels its derived context on the first error and `Wait()` returns it.
- **Detect races in CI**: `go test -race ./...` and `go build -race` for binaries.
  The race detector is a runtime instrument — it only flags races on code paths it
  actually executes, so it needs real concurrent test load to be useful.
- Source: go.dev/doc/articles/race_detector, pkg.go.dev/golang.org/x/sync/errgroup.
  See References.

## Error Handling Idioms
Go 1.13+ error wrapping is non-negotiable; `errors.Is`/`errors.As` replace fragile
`==` and type-switch checks.

```go
// Wrap with %w to preserve the chain; callers match with errors.Is / errors.As.
if err != nil {
    return fmt.Errorf("load config %q: %w", path, err)   // %w, not %v
}

// SENTINEL match — use errors.Is, never == (breaks the moment someone wraps):
if errors.Is(err, os.ErrNotExist) { ... }

// TYPED match — errors.As unwraps to the concrete/target type:
var perr *fs.PathError
if errors.As(err, &perr) {
    log.Printf("path op %s failed on %s", perr.Op, perr.Path)
}
```
- **Never discard errors** with `_ = err`; handle, wrap, or return. `errcheck`
  (bundled in `golangci-lint`) fails the build on ignored errors.
- **Wrap vs. opaque**: wrap with `%w` when callers legitimately need to match the
  cause; use `%v` to intentionally seal the abstraction boundary and NOT leak the
  underlying error type into your API contract.
- `errors.Join(err1, err2)` (Go 1.20+) aggregates multiple failures; `errors.Is`
  walks the joined tree.
- Source: pkg.go.dev/errors, go.dev/blog/go1.13-errors. See References.

## Security and Dependency Gotchas
- **`govulncheck`** (golang.org/x/vuln) is the required supply-chain gate. Unlike a
  naive dependency diff, it does **reachability analysis** — it only reports a
  vulnerable symbol if your code can actually call it, cutting false positives. Run
  `govulncheck ./...` in CI.
- **Real stdlib advisories to know** (do not assume the stdlib is safe): **GO-2025-3563**
  (aliased **CVE-2025-22871**) — request smuggling in `net/http` from accepting
  invalid chunked data, **published 2025-04-08**, fixed in Go 1.23.8 / 1.24.2.
  [pkg.go.dev/vuln/GO-2025-3563, retrieved 2026-07-09]. And **GO-2025-3373** —
  IPv6-zone-ID URI name-constraint bypass in `crypto/x509`, **published 2025-01-28**.
  [pkg.go.dev/vuln/GO-2025-3373, retrieved 2026-07-09]. Both are reasons to stay on
  a supported (last-two) Go release line.
- **Module pinning**: `go.sum` records module hashes; run CI with
  `GOFLAGS=-mod=readonly` so a build can never silently mutate `go.mod`, and gate
  drift with `go mod tidy -diff` (fails if tidy would change anything).
- **`GOPROXY`/`GONOSUMDB`**: never disable checksum DB verification (`GONOSUMCHECK`
  / `GOFLAGS=-insecure`) for public modules — that removes tamper detection.
```go
// Command injection: never build a shell string. exec.Command takes argv directly
// (no shell), so arguments are not re-parsed by /bin/sh.
cmd := exec.CommandContext(ctx, "git", "clone", url)   // url is one argv element
```
- Source: pkg.go.dev/golang.org/x/vuln/cmd/govulncheck, pkg.go.dev/vuln. See References.

## Testing Conventions
```go
func TestSquare(t *testing.T) {
    cases := []struct {          // table-driven is the Go idiom
        name string
        in, want int
    }{
        {"two", 2, 4},
        {"three", 3, 9},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()          // safe post-1.22 (loop var no longer shared)
            if got := square(tc.in); got != tc.want {
                t.Errorf("square(%d) = %d, want %d", tc.in, got, tc.want)
            }
        })
    }
}
```
- Run with `go test -race -cover ./...`. Prefer `t.Cleanup()` over bare `defer`
  for teardown; use `t.TempDir()` for filesystem tests (auto-removed).
- `t.Parallel()` inside a subtest loop is only safe because Go 1.22 fixed loop-var
  capture — on ≤1.21 you needed `tc := tc` to avoid every subtest seeing the last case.
- Go 1.24+ ships `testing.B.Loop` for allocation-stable benchmarks; Go 1.25 adds
  `testing/synctest` for deterministic concurrent-time tests.

## Performance Traps
- **Interface boxing**: assigning a concrete value to an `any`/interface heap-allocates
  and adds an indirection; keep hot paths concretely typed or use generics.
- **Map/slice pre-allocation**: `make(map[K]V, n)` and `make([]T, 0, n)` when the size
  is known avoids repeated rehash/realloc. A naive `append` in a loop can reallocate
  O(log n) times and copy the backing array each time.
- **Slice aliasing gotcha**: `append` may return a slice sharing the original backing
  array — a later write can clobber another slice. Use `slices.Clone` (Go 1.21+) when
  you need an independent copy.
- **`sync.Pool`** for high-churn temporary objects (buffers) to cut GC pressure — but
  never for objects with a required lifecycle; pooled items can vanish between GCs.
- Profile before optimizing: `go test -bench . -benchmem` + `pprof`.

## References (retrieved 2026-07-09)
- Go release downloads / current stable (1.26.5): https://go.dev/dl/
- Go release status & dates: https://endoflife.date/go
- Go 1.25 release notes (synctest, container GOMAXPROCS): https://go.dev/doc/go1.25
- Go 1.24 release notes: https://go.dev/doc/go1.24
- Go 1.23 release notes (range-over-func, timer channels): https://go.dev/doc/go1.23
- Go error wrapping: https://go.dev/blog/go1.13-errors
- govulncheck: https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck
- Go vuln DB: https://pkg.go.dev/vuln
- GO-2025-3563 (CVE-2025-22871, net/http request smuggling): https://pkg.go.dev/vuln/GO-2025-3563
- GO-2025-3373 (crypto/x509 URI constraint bypass): https://pkg.go.dev/vuln/GO-2025-3373
- Race detector: https://go.dev/doc/articles/race_detector
- errgroup: https://pkg.go.dev/golang.org/x/sync/errgroup
