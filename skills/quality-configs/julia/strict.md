# Julia Strict Quality Config

Strict mode configuration for Julia projects with JuliaFormatter, JET.jl, and Aqua.jl.

## Mode: Strict

- Coverage: 80% minimum
- Static analysis: JET.jl enabled
- Package quality: Aqua.jl checks
- Formatting: JuliaFormatter with Blue style

## JuliaFormatter Config (`.JuliaFormatter.toml`)

```toml
# JuliaFormatter configuration for strict mode
# Using Blue style as base (widely adopted in Julia community)

style = "blue"
indent = 4
margin = 92
always_for_in = true
always_use_return = true
whitespace_in_kwargs = true
whitespace_ops_in_indices = true
remove_extra_newlines = true
separate_kwargs_with_semicolon = true
short_function_def = true
trailing_comma = true
join_lines_based_on_source = true
indent_submodule = false
normalize_line_endings = "unix"
```

## Project.toml Dependencies

```toml
[deps]
# Your package dependencies here

[extras]
Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"
JET = "c3a54625-cd67-489e-a8e7-0a5a0ff4e31b"
Aqua = "4c88cf16-eb10-579e-8560-4a9242c79595"
JuliaFormatter = "98e50ef6-434e-11e9-1051-2b60c6c9e899"
Coverage = "a2441757-f6aa-5fb2-8edb-039e3f45d037"

[targets]
test = ["Test", "JET", "Aqua", "JuliaFormatter", "Coverage"]

[compat]
julia = "1.10"
JET = "0.9"
Aqua = "0.8"
JuliaFormatter = "1"
```

## Test Configuration (`test/runtests.jl`)

```julia
using Test
using YourPackage

# Import quality tools
using JET
using Aqua
using JuliaFormatter

@testset "YourPackage.jl" begin
    # Unit tests
    @testset "Unit Tests" begin
        include("unit_tests.jl")
    end

    # Code quality checks
    @testset "Code Quality" begin
        @testset "Aqua.jl" begin
            Aqua.test_all(
                YourPackage;
                ambiguities = true,
                unbound_args = true,
                undefined_exports = true,
                project_extras = true,
                stale_deps = true,
                deps_compat = true,
                piracies = true,
            )
        end

        @testset "JET.jl" begin
            JET.test_package(YourPackage; target_defined_modules = true)
        end

        @testset "JuliaFormatter" begin
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

Run tests with coverage enabled:

```bash
# Run tests with coverage
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

# Process coverage results
julia --project -e '
using Coverage
coverage = process_folder()
covered, total = get_summary(coverage)
pct = round(100 * covered / total, digits=1)
println("Coverage: $pct% ($covered/$total lines)")
if pct < 80
    error("Coverage $pct% is below 80% threshold")
end
'
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 50 lines |
| Arguments | 5 |
| Cyclomatic complexity | 10 |
| Module size | 500 lines |

## Commands

```bash
# Format code
julia -e 'using JuliaFormatter; format("src")'

# Format check (no modifications)
julia -e 'using JuliaFormatter; format("src", overwrite=false) || exit(1)'

# Run JET analysis
julia --project -e 'using JET, YourPackage; report_package(YourPackage)'

# Run Aqua checks
julia --project -e 'using Aqua, YourPackage; Aqua.test_all(YourPackage)'

# Run tests with coverage
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

# All quality checks
julia --project -e '
using JuliaFormatter, JET, Aqua, YourPackage
@assert format("src", overwrite=false) "Code not formatted"
report_package(YourPackage)
Aqua.test_all(YourPackage)
'
```

## Install

```julia
using Pkg
Pkg.add(["JuliaFormatter", "JET", "Aqua", "Coverage"])
```

Or via command line:

```bash
julia -e 'using Pkg; Pkg.add(["JuliaFormatter", "JET", "Aqua", "Coverage"])'
```

## Directory Structure

```
YourPackage/
├── Project.toml
├── Manifest.toml
├── .JuliaFormatter.toml
├── src/
│   ├── YourPackage.jl
│   └── module.jl
├── test/
│   ├── runtests.jl
│   └── unit_tests.jl
├── docs/
│   └── make.jl
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
      - uses: julia-actions/julia-processcoverage@v1
      - uses: codecov/codecov-action@v4
        with:
          files: lcov.info
          fail_ci_if_error: true
```
