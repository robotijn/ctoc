# Julia Strictest Quality Config

Maximum strictness for Julia projects with all checks enabled.

## Mode: Strictest

- Coverage: 90% minimum
- All JET.jl checks enabled
- All Aqua.jl checks enabled
- Zero tolerance for type instabilities
- Strict formatting enforcement

## JuliaFormatter Config (`.JuliaFormatter.toml`)

```toml
# JuliaFormatter configuration for strictest mode
# Most restrictive settings for maximum consistency

style = "blue"
indent = 4
margin = 80
always_for_in = true
always_use_return = true
whitespace_in_kwargs = true
whitespace_ops_in_indices = true
remove_extra_newlines = true
separate_kwargs_with_semicolon = true
short_function_def = true
trailing_comma = true
join_lines_based_on_source = false
indent_submodule = true
normalize_line_endings = "unix"
whitespace_typedefs = true
annotate_untyped_fields_with_any = false
format_docstrings = true
align_struct_field = true
align_assignment = true
align_pair_arrow = true
conditional_to_if = true
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
SafeTestsets = "1bc83da4-3b8d-516f-aca4-4fe02f6d838f"

[targets]
test = ["Test", "JET", "Aqua", "JuliaFormatter", "Coverage", "SafeTestsets"]

[compat]
julia = "1.10"
JET = "0.9"
Aqua = "0.8"
JuliaFormatter = "1"
```

## Test Configuration (`test/runtests.jl`)

```julia
using Test
using SafeTestsets
using YourPackage

# Import quality tools
using JET
using Aqua
using JuliaFormatter

@testset "YourPackage.jl" begin
    # Unit tests with isolation
    @safetestset "Unit Tests" begin
        include("unit_tests.jl")
    end

    # Integration tests
    @safetestset "Integration Tests" begin
        include("integration_tests.jl")
    end

    # Code quality checks - ALL enabled
    @testset "Code Quality" begin
        @testset "Aqua.jl - Full Suite" begin
            Aqua.test_all(
                YourPackage;
                ambiguities = (recursive = true,),
                unbound_args = true,
                undefined_exports = true,
                project_extras = true,
                stale_deps = (ignore = [],),
                deps_compat = (check_extras = true, check_weakdeps = true),
                piracies = true,
                persistent_tasks = true,
            )
        end

        @testset "JET.jl - Type Analysis" begin
            # Report all potential errors
            JET.test_package(
                YourPackage;
                target_defined_modules = true,
                ignore_missing_comparison = false,
            )
        end

        @testset "JET.jl - Optimization Analysis" begin
            # Check for type instabilities in public API
            for name in names(YourPackage)
                func = getfield(YourPackage, name)
                if func isa Function
                    @test_opt target_modules = (YourPackage,) func()
                end
            end
        end

        @testset "JuliaFormatter" begin
            @test JuliaFormatter.format(
                pkgdir(YourPackage);
                verbose = false,
                overwrite = false,
            )
        end

        @testset "Documentation" begin
            # Ensure all exported functions have docstrings
            for name in names(YourPackage)
                obj = getfield(YourPackage, name)
                if obj isa Function
                    @test !isempty(string(Docs.doc(obj)))
                end
            end
        end
    end
end
```

## Coverage Configuration

```bash
# Run tests with full coverage
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

# Process and enforce 90% coverage
julia --project -e '
using Coverage

# Process all coverage files
coverage = process_folder()
covered, total = get_summary(coverage)
pct = round(100 * covered / total, digits=2)

println("=" ^ 60)
println("Coverage Report")
println("=" ^ 60)
println("Total lines: $total")
println("Covered lines: $covered")
println("Coverage: $pct%")
println("=" ^ 60)

# Fail if below threshold
if pct < 90
    println("\nERROR: Coverage $pct% is below 90% threshold!")
    println("Uncovered files:")
    for file in coverage
        fc, ft = get_summary(file)
        file_pct = ft > 0 ? round(100 * fc / ft, digits=1) : 100.0
        if file_pct < 90
            println("  $(file.filename): $file_pct%")
        end
    end
    exit(1)
end

# Export LCOV format
LCOV.writefile("coverage.lcov", coverage)
'
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Functions | 100% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Function length | 30 lines |
| Arguments | 4 |
| Cyclomatic complexity | 7 |
| Module size | 300 lines |
| Nesting depth | 3 levels |

## JET.jl Advanced Configuration

Create `test/jet_config.jl`:

```julia
using JET

# Custom JET configuration for strictest mode
const JET_CONFIG = JET.JETAnalysisParams(
    # Report all potential issues
    report_pass = JET.SoundPass(),
    # No ignored modules
    target_modules = nothing,
    # Analyze everything
    analyze_from_definitions = true,
)

# Run comprehensive analysis
function run_jet_analysis(mod::Module)
    println("Running JET analysis on $mod...")

    # Type error analysis
    result = report_package(mod; toplevel_logger = nothing)
    if !isempty(JET.get_reports(result))
        println("Type errors found:")
        display(result)
        return false
    end

    # Optimization analysis for public API
    for name in names(mod; all = false)
        obj = getfield(mod, name)
        if obj isa Function
            opt_result = @report_opt obj()
            if !isempty(JET.get_reports(opt_result))
                println("Type instability in $name:")
                display(opt_result)
            end
        end
    end

    return true
end
```

## Commands

```bash
# Format code (strict mode)
julia -e 'using JuliaFormatter; format("src", margin=80)'

# Format check
julia -e 'using JuliaFormatter; format("src", overwrite=false) || exit(1)'

# Full JET analysis
julia --project -e '
using JET, YourPackage
result = report_package(YourPackage)
isempty(JET.get_reports(result)) || exit(1)
'

# Type stability check
julia --project -e '
using JET, YourPackage
@report_opt YourPackage.main_function()
'

# Full Aqua checks
julia --project -e '
using Aqua, YourPackage
Aqua.test_all(YourPackage; ambiguities=(recursive=true,))
'

# Run all checks
julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

# Complete quality gate
julia --project -e '
using JuliaFormatter, JET, Aqua, Coverage, YourPackage

println("=== Format Check ===")
@assert format("src", overwrite=false) "Code not properly formatted"

println("=== JET Analysis ===")
result = report_package(YourPackage)
@assert isempty(JET.get_reports(result)) "JET found issues"

println("=== Aqua Checks ===")
Aqua.test_all(YourPackage; ambiguities=(recursive=true,))

println("=== Coverage Check ===")
coverage = process_folder()
covered, total = get_summary(coverage)
pct = round(100 * covered / total, digits=1)
@assert pct >= 90 "Coverage $pct% below 90%"

println("All quality gates passed!")
'
```

## Install

```julia
using Pkg
Pkg.add([
    "JuliaFormatter",
    "JET",
    "Aqua",
    "Coverage",
    "SafeTestsets",
])
```

## Directory Structure

```
YourPackage/
├── Project.toml
├── Manifest.toml
├── .JuliaFormatter.toml
├── src/
│   ├── YourPackage.jl
│   ├── types.jl
│   ├── core.jl
│   └── utils.jl
├── test/
│   ├── Project.toml        # Test-specific dependencies
│   ├── runtests.jl
│   ├── jet_config.jl
│   ├── unit_tests.jl
│   └── integration_tests.jl
├── docs/
│   ├── Project.toml
│   ├── make.jl
│   └── src/
│       └── index.md
├── benchmark/
│   └── benchmarks.jl
└── README.md
```

## CI Configuration (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        julia-version: ['1.10', '1.11']
    steps:
      - uses: actions/checkout@v4
      - uses: julia-actions/setup-julia@v2
        with:
          version: ${{ matrix.julia-version }}
      - uses: julia-actions/cache@v2
      - uses: julia-actions/julia-buildpkg@v1

      - name: Format check
        run: |
          julia -e 'using Pkg; Pkg.add("JuliaFormatter")'
          julia -e 'using JuliaFormatter; exit(format("src", overwrite=false) ? 0 : 1)'

      - name: Run tests
        run: julia --code-coverage=user --project -e 'using Pkg; Pkg.test()'

      - name: Check coverage threshold
        run: |
          julia --project -e '
            using Coverage
            coverage = process_folder()
            covered, total = get_summary(coverage)
            pct = round(100 * covered / total, digits=1)
            println("Coverage: $pct%")
            pct < 90 && exit(1)
          '

      - uses: julia-actions/julia-processcoverage@v1
      - uses: codecov/codecov-action@v4
        with:
          files: lcov.info
          fail_ci_if_error: true

  jet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: julia-actions/setup-julia@v2
        with:
          version: '1.10'
      - uses: julia-actions/cache@v2
      - uses: julia-actions/julia-buildpkg@v1
      - name: JET analysis
        run: |
          julia --project -e '
            using Pkg; Pkg.add("JET")
            using JET, YourPackage
            result = report_package(YourPackage)
            isempty(JET.get_reports(result)) || exit(1)
          '
```
