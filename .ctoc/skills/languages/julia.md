# Julia CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
julia -e 'using JuliaFormatter; format(".")'  # Format
julia -e 'using Aqua; Aqua.test_all(MyPkg)'   # Quality checks
julia --project -e 'using Pkg; Pkg.test()'    # Test
julia --project -e 'using PackageCompiler; create_sysimage(...)'  # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Julia 1.10+** - Stable with improved latency
- **JuliaFormatter** - Code formatting
- **Aqua.jl** - Package quality checks
- **Test** - Built-in testing
- **BenchmarkTools** - Performance benchmarking

## Project Structure
```
project/
├── src/               # Source files
├── test/              # Test files
├── docs/              # Documentation
├── Project.toml       # Dependencies
└── Manifest.toml      # Locked versions
```

## Non-Negotiables
1. Type stability in all performance-critical code
2. Multiple dispatch used idiomatically
3. Avoid global mutable state
4. Use packages from General registry

## Red Lines (Reject PR)
- Type-unstable code in hot paths
- Global mutable state (use const or local)
- Benchmarking without BenchmarkTools.@btime
- Missing docstrings on exported functions
- Secrets hardcoded in source
- Abstract type containers without parameterization

## Testing Strategy
- **Unit**: @test macros, <100ms
- **Integration**: Full workflow tests
- **Performance**: BenchmarkTools regression tests

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Type instability | Use @code_warntype, type annotations |
| First-run latency | Precompilation, PackageCompiler |
| Memory allocation | Check with @allocated macro |
| Scope confusion | Understand local/global scope rules |

## Performance Red Lines
- No O(n^2) in hot paths
- No type-unstable inner loops
- No heap allocations in hot paths (@allocated check)

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No eval() with user input
- [ ] Secrets from environment (ENV[])
- [ ] Dependencies from General registry only
