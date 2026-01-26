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

## Version Gotchas
- **Julia 1.11+**: Improved latency and startup time
- **First-run**: Use `PackageCompiler.create_sysimage()` for production
- **Type stability**: Critical for performance, check with `@code_warntype`
- **Multiple dispatch**: Idiomatic Julia, not OOP classes
- **With packages**: Use General registry, `]add PackageName`
