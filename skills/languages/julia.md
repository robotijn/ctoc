# Julia CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude writes type-unstable code — use `@code_warntype` to verify
- Claude uses global variables — use `const` or pass as arguments
- Claude forgets first-run latency — use PackageCompiler for production
- Claude benchmarks without BenchmarkTools — results are unreliable

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `julia 1.11+` | Improved latency | Older Julia |
| `JuliaFormatter` | Code formatting | Manual style |
| `Aqua.jl` | Package quality checks | Just tests |
| `BenchmarkTools` | Performance measurement | Ad-hoc timing |
| `Revise.jl` | Hot reloading | Restart REPL |

## Patterns Claude Should Use
```julia
# Type-stable functions
function process(x::Vector{Float64})::Float64
    sum = 0.0  # Same type as return
    for val in x
        sum += val
    end
    return sum
end

# Use const for globals
const CONFIG = Dict{String, Any}()

# Check type stability
@code_warntype process(data)

# Proper benchmarking
using BenchmarkTools
@btime process($data)  # $ interpolates to avoid global access

# Avoid abstract containers
Vector{Float64}  # Good
Vector{Any}      # Bad - type unstable
```

## Anti-Patterns Claude Generates
- Type-unstable code in hot paths — verify with `@code_warntype`
- Global mutable state — use `const` or function arguments
- `time()` for benchmarks — use `@btime` from BenchmarkTools
- Unparameterized abstract containers — always parameterize
- Missing docstrings — document exported functions

## Concurrency Footguns
Julia has real OS threads (`-t auto` / `JULIA_NUM_THREADS`), distributed workers, and
async tasks — each with a distinct memory model. Claude routinely writes racy loops.

- **`Threads.@threads` over a shared array is a data race** unless each iteration writes
  a disjoint index. Accumulating into one variable (`total += x`) across threads corrupts
  it — use per-thread partials + a reduction, or an atomic.
- **`@spawn` returns a `Task`; you must `fetch`/`wait`** it. Dropped tasks swallow their
  exceptions silently.
- **Not every library is thread-safe** — BLAS, many I/O handles, and mutable global caches
  are not. Random: use a per-task RNG, not the global one, under threads.
- **`Distributed` (`@distributed`, `pmap`, `@everywhere`)** copies data to worker processes;
  closures capturing large state serialize it on every call.

```julia
using Base.Threads
# WRONG — data race on `total`
total = 0.0
@threads for x in data
    global total += x          # torn read/modify/write across threads
end

# RIGHT — per-thread partials, then reduce
partials = zeros(Float64, nthreads())
@threads for i in eachindex(data)
    partials[threadid()] += data[i]   # each thread owns its slot
end
total = sum(partials)
```

## Error Handling Idioms
- **Throw typed exceptions**, not strings: `throw(ArgumentError("n must be > 0"))`,
  `DomainError`, `BoundsError`. Typed errors let callers `catch` selectively.
- **Never catch overbroad.** `catch e` catches `InterruptException` and `OutOfMemoryError`
  too; rethrow what you did not mean to handle (`e isa MyError || rethrow()`).
- **`@assert` is for invariants, not input validation** — asserts can be disabled and must
  never guard a security check. Validate arguments with real `throw`.

```julia
function withdraw(balance, amount)
    amount > 0 || throw(ArgumentError("amount must be positive"))
    amount ≤ balance || throw(DomainError(amount, "insufficient funds"))
    return balance - amount
end
```

## Security and Dependency Gotchas
- **`@inbounds` disables array bounds checking.** If your index assumption is wrong you get
  an out-of-bounds memory read/write — undefined behavior, not a clean `BoundsError`. This
  is **CWE-125 (Out-of-bounds Read)**. Only use `@inbounds` on indices you have *proven*
  in-range; never on an index derived from untrusted input.
- **`eval` / `Meta.parse` on untrusted input is code injection — CWE-94 (Improper Control of
  Generation of Code).** Building and evaluating a Julia expression from user data runs
  arbitrary code. Parse data as data.
- **`run(`cmd $userinput`)` / backticks with interpolated user input is OS command injection
  — CWE-78.** Julia's backtick `Cmd` does not invoke a shell by default (good), but never
  build a command string and pass it to `sh -c`.
- **Pin dependencies with a committed `Manifest.toml`** for reproducible, audited builds;
  `Project.toml` alone only records compatibility bounds.

```julia
# WRONG — CWE-125: bad index becomes memory corruption, not an error
@inbounds x = buf[user_index]

# RIGHT — validate, then (optionally) elide the check on a proven-safe index
checkbounds(buf, user_index)
@inbounds x = buf[user_index]
```

## Testing Conventions
- Use the **`Test` stdlib**: `@testset "name" begin … end`, `@test expr`,
  `@test_throws ArgumentError f(bad)`. Run with `Pkg.test()` (`] test`).
- Get coverage with `julia --code-coverage=user`; combine with `Coverage.jl`.
- `Aqua.jl` catches project-quality issues (unbound type params, stale deps, ambiguities)
  that unit tests miss.

```julia
using Test
@testset "withdraw" begin
    @test withdraw(100, 40) == 60
    @test_throws ArgumentError withdraw(100, -1)
    @test_throws DomainError  withdraw(100, 200)
end
```

## Performance Traps
- **Type instability is the #1 Julia perf killer.** If a function's return type depends on a
  value (not just types), the compiler boxes it and loses specialization. Diagnose with
  **`@code_warntype`** — red `Any`/`Union` in the output means instability.
- **Non-`const` global variables are type-unstable by definition** — accessing one in a hot
  loop is catastrophic. Pass state as arguments or mark it `const`.
- **Abstract-typed containers** (`Vector{Any}`, `Dict{String,Any}`) force dynamic dispatch on
  every element. Parameterize concretely.
- **Allocation in hot loops** — measure with `@allocated` / `@btime` (BenchmarkTools);
  pre-allocate buffers, use views (`@view`) instead of slices that copy.
- **First-call latency ("time to first plot")** — JIT compiles on first call. For CLIs,
  precompile with `PackageCompiler.create_sysimage()`.

## Version-Specific Gotchas
- **Julia 1.10 is the current LTS** (long-term support); **1.11.9** and **1.12.6** are the
  current feature releases (source: https://endoflife.date/julia, retrieved 2026-07-10;
  cross-check https://julialang.org/downloads/). Pin your `julia_version` in CI to the LTS
  for production libraries.
- **First-run**: `PackageCompiler.create_sysimage()` for production startup.
- **Multiple dispatch is the abstraction** — model with methods on types, not OOP classes.
- **Packages**: `] add PackageName` from the General registry; commit `Manifest.toml`.

## References
- Julia release/support matrix — https://endoflife.date/julia (retrieved 2026-07-10)
- Julia downloads (LTS vs current) — https://julialang.org/downloads/ (retrieved 2026-07-10)
- CWE-125 Out-of-bounds Read — https://cwe.mitre.org/data/definitions/125.html (CWE 4.20, retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (CWE 4.20, retrieved 2026-07-10)
