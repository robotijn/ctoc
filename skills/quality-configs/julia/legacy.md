# Julia Legacy Quality Config

Gradual adoption configuration for migrating existing Julia projects.

## Mode: Legacy

- Coverage: 50% minimum
- Static analysis: Optional
- Relaxed complexity limits
- Gradual type annotation adoption

## JuliaFormatter Config (`.JuliaFormatter.toml`)

```toml
# JuliaFormatter configuration for legacy mode
# Minimal changes to preserve existing style

style = "default"
indent = 4
margin = 120
always_for_in = false
always_use_return = false
whitespace_in_kwargs = true
remove_extra_newlines = false
short_function_def = true
trailing_comma = false
join_lines_based_on_source = true
normalize_line_endings = "auto"

# Ignore existing files initially
ignore = [
    "src/legacy/",
    "src/deprecated/",
]
```

## Project.toml Dependencies

```toml
[deps]
# Your package dependencies here

[extras]
Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"
JuliaFormatter = "98e50ef6-434e-11e9-1051-2b60c6c9e899"
Coverage = "a2441757-f6aa-5fb2-8edb-039e3f45d037"

[targets]
test = ["Test", "JuliaFormatter", "Coverage"]

[compat]
julia = "1.6"
JuliaFormatter = "1"
```

## Test Configuration (`test/runtests.jl`)

```julia
using Test
using YourPackage

@testset "YourPackage.jl" begin
    # Basic tests
    @testset "Core functionality" begin
        include("test_core.jl")
    end

    # Optional: Format check (can be skipped initially)
    if get(ENV, "CHECK_FORMAT", "false") == "true"
        using JuliaFormatter
        @testset "Formatting" begin
            @test JuliaFormatter.format(
                pkgdir(YourPackage);
                verbose = false,
                overwrite = false,
            )
        end
    end
end
```

## Coverage Configuration

```bash
# Run tests with coverage
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

# Process coverage (50% threshold)
julia --project -e '
using Coverage
coverage = process_folder()
covered, total = get_summary(coverage)
pct = round(100 * covered / total, digits=1)
println("Coverage: $pct% ($covered/$total lines)")
if pct < 50
    @warn "Coverage $pct% is below 50% threshold"
    # In legacy mode, warn but dont fail
end
'
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 100 lines |
| Arguments | 8 |
| Cyclomatic complexity | 20 |
| Module size | 1000 lines |

## Commands

```bash
# Format new code only
julia -e 'using JuliaFormatter; format("src/new")'

# Format check (optional)
julia -e 'using JuliaFormatter; format("src", overwrite=false)'

# Run tests
julia --project -e 'using Pkg; Pkg.test()'

# Run tests with coverage
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'
```

## Install

```julia
using Pkg
Pkg.add(["JuliaFormatter", "Coverage"])
```

## Upgrade Path

### Phase 1: Establish Baseline (Week 1-2)

1. Add basic test infrastructure
2. Measure current coverage
3. Enable JuliaFormatter on new code only

```julia
# In .JuliaFormatter.toml
ignore = ["src/legacy/"]  # Exclude old code
```

### Phase 2: Improve Coverage (Week 3-6)

1. Write tests for critical paths
2. Target 60% coverage
3. Enable Aqua.jl basic checks

```julia
using Aqua
Aqua.test_all(
    YourPackage;
    ambiguities = false,      # Skip initially
    unbound_args = true,
    undefined_exports = true,
    project_extras = false,   # Skip initially
    stale_deps = false,       # Skip initially
    piracies = false,         # Skip initially
)
```

### Phase 3: Add Static Analysis (Week 7-10)

1. Enable JET.jl on new modules
2. Fix type instabilities in hot paths
3. Target 70% coverage

```julia
using JET

# Analyze only specific modules
JET.report_package(YourPackage; target_defined_modules = true)
```

### Phase 4: Full Quality (Week 11+)

1. Format entire codebase
2. Enable all Aqua checks
3. Enable all JET checks
4. Target 80% coverage
5. Migrate to "strict" configuration

## Gradual Aqua.jl Adoption

```julia
# Start with safe checks only
Aqua.test_undefined_exports(YourPackage)
Aqua.test_unbound_args(YourPackage)

# Then add more checks progressively
Aqua.test_stale_deps(YourPackage)
Aqua.test_deps_compat(YourPackage)
Aqua.test_ambiguities(YourPackage)
Aqua.test_piracies(YourPackage)
```

## Gradual JET.jl Adoption

```julia
using JET

# Start with specific functions
@report_call your_critical_function(args...)

# Then module-level
@report_opt target_modules = (YourPackage,) your_function()

# Finally, package-level
report_package(YourPackage)
```

## Directory Structure

```
YourPackage/
├── Project.toml
├── Manifest.toml
├── .JuliaFormatter.toml
├── src/
│   ├── YourPackage.jl
│   ├── legacy/           # Old code (excluded from formatting)
│   │   └── old_module.jl
│   └── new/              # New code (formatted)
│       └── new_module.jl
├── test/
│   ├── runtests.jl
│   └── test_core.jl
└── README.md
```

## CI Configuration (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: julia-actions/setup-julia@v2
        with:
          version: '1.10'
      - uses: julia-actions/cache@v2
      - uses: julia-actions/julia-buildpkg@v1
      - uses: julia-actions/julia-runtest@v1

      # Coverage is informational only in legacy mode
      - uses: julia-actions/julia-processcoverage@v1
      - uses: codecov/codecov-action@v4
        with:
          files: lcov.info
          fail_ci_if_error: false  # Don't fail on coverage

  # Optional format check (can be enabled later)
  format:
    runs-on: ubuntu-latest
    if: false  # Enable when ready
    steps:
      - uses: actions/checkout@v4
      - uses: julia-actions/setup-julia@v2
        with:
          version: '1.10'
      - name: Format check
        run: |
          julia -e 'using Pkg; Pkg.add("JuliaFormatter")'
          julia -e 'using JuliaFormatter; exit(format("src", overwrite=false) ? 0 : 1)'
```

## Migration Checklist

- [ ] Add `.JuliaFormatter.toml` with ignore patterns
- [ ] Set up basic test infrastructure
- [ ] Measure baseline coverage
- [ ] Add Test dependency to Project.toml
- [ ] Create `test/runtests.jl`
- [ ] Set up CI with coverage reporting
- [ ] Begin writing tests for new code
- [ ] Gradually remove files from ignore list
- [ ] Enable Aqua.jl basic checks
- [ ] Enable JET.jl on critical paths
- [ ] Migrate to "strict" config when ready
