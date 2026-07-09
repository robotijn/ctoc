# C# Strictest Quality Config

Maximal quality gate for C# / .NET 9 (`net9.0`) projects that ship on a zero-warning
policy — libraries, security-sensitive services, and anything where a warning is a bug.
This tier is a strict **superset** of `strict.md`: every analyzer becomes an error, all
warnings break the build, complexity is tightly bounded, and coverage floors at 90%.

## Mode: Strictest (maximal)

- Target framework: `net9.0`
- Coverage floor: **90%** (lines and branches)
- **Every** analyzer diagnostic is an error (`dotnet_analyzer_diagnostic.severity = error`)
- **All** warnings are errors (`TreatWarningsAsErrors: true`)
- Nullable reference types fully enabled; no per-file opt-outs
- Tight complexity thresholds enforced (CA1502 lowered)

Contrast with the gradient: `legacy` keeps `TreatWarningsAsErrors: false`, `strict`
promotes only `nullable` — `strictest` promotes everything. Property semantics
web-verified (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props#treatwarningsaserrors>.

## EditorConfig (`.editorconfig`)

Inherit the entire `strict` `.editorconfig`, then escalate severities to `error`
project-wide:

```ini
root = true

[*.cs]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

# EVERY analyzer diagnostic is an error by default at this tier
dotnet_analyzer_diagnostic.severity = error

# Correctness rules pinned explicitly as error (documented intent)
dotnet_diagnostic.CA1062.severity = error  # Validate arguments of public methods
dotnet_diagnostic.CA1063.severity = error  # Implement IDisposable correctly
dotnet_diagnostic.CA1816.severity = error  # Call GC.SuppressFinalize correctly
dotnet_diagnostic.CA2000.severity = error  # Dispose objects before losing scope
dotnet_diagnostic.CA2213.severity = error  # Disposable fields should be disposed

# Tight complexity enforcement
dotnet_diagnostic.CA1502.severity = error  # Cyclomatic complexity
dotnet_diagnostic.CA1505.severity = error  # Maintainability index

# Lower the CA1502 cyclomatic threshold from the default 25 to 10
dotnet_code_quality.CA1502.threshold = 10
```

The `dotnet_analyzer_diagnostic.severity = error` blanket key and the CA rule ids are
web-verified against the official code-analysis docs (retrieved 2026-07-09):
severity configuration
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/configuration-options#severity-level>,
CA1502 configurable threshold
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1502>.

## Project File (`.csproj`)

```xml
<PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <WarningsNotAsErrors></WarningsNotAsErrors>
    <NoWarn></NoWarn>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-all</AnalysisLevel>
    <AnalysisMode>All</AnalysisMode>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <CodeAnalysisTreatWarningsAsErrors>true</CodeAnalysisTreatWarningsAsErrors>
</PropertyGroup>

<ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="10.0.301">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="coverlet.collector" Version="10.0.1">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
</ItemGroup>
```

`AnalysisMode=All` enables every rule (not just the SDK default set); `GenerateDocumentationFile`
turns on the CS1591 missing-XML-doc warning, which `TreatWarningsAsErrors` then makes fatal.
Package versions are the current stable/published releases per the NuGet flat-container index
(retrieved 2026-07-09):
`Microsoft.CodeAnalysis.NetAnalyzers` 10.0.301
<https://api.nuget.org/v3-flatcontainer/microsoft.codeanalysis.netanalyzers/index.json>,
`coverlet.collector` 10.0.1
<https://api.nuget.org/v3-flatcontainer/coverlet.collector/index.json>.
`AnalysisMode` semantics (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props#analysismode>.

## Coverage Requirements

| Metric   | Threshold |
|----------|-----------|
| Lines    | 90%       |
| Branches | 90%       |

Collected with `coverlet.collector` and enforced via `dotnet-reportgenerator-globaltool`
(latest stable `5.5.10`, NuGet retrieved 2026-07-09):
<https://api.nuget.org/v3-flatcontainer/dotnet-reportgenerator-globaltool/index.json>.

## Complexity Limits

| Metric                | Rule   | Severity (strictest) | Threshold             |
|-----------------------|--------|----------------------|-----------------------|
| Cyclomatic complexity | CA1502 | error                | 10 (lowered from 25)  |
| Maintainability index | CA1505 | error                | flags low-index members |

The `dotnet_code_quality.CA1502.threshold = 10` option tightens the cyclomatic limit well
below the CA1502 default of 25, and the rule fails the build at this tier. Threshold-option
docs (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1502>.

## Commands

```bash
# Build with ALL warnings as errors
dotnet build /warnaserror

# Run tests with coverage
dotnet test --collect:"XPlat Code Coverage"

# Report + enforce the 90% floor (reportgenerator TextSummary parsed in CI)
dotnet tool run reportgenerator -reports:**/coverage.cobertura.xml -targetdir:coveragereport -reporttypes:Html;TextSummary

# Formatting must be byte-clean
dotnet format --verify-no-changes
```

`dotnet format --verify-no-changes` returns a non-zero exit code on any drift; usage
(retrieved 2026-07-09): <https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format>.

## CI Integration

```yaml
# .github/workflows/quality-strictest.yml
name: quality (strictest)
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - run: dotnet restore
      - run: dotnet format --verify-no-changes            # zero style drift
      - run: dotnet build --no-restore /warnaserror       # ALL warnings fatal
      - run: dotnet test --no-build --collect:"XPlat Code Coverage"
      - run: dotnet tool install --global dotnet-reportgenerator-globaltool --version 5.5.10
      - run: reportgenerator -reports:**/coverage.cobertura.xml -targetdir:cov -reporttypes:TextSummary
      # Hard-fail the job if line OR branch coverage < 90%.
```

`actions/setup-dotnet@v4` with `dotnet-version: '9.0.x'` is the current .NET 9 CI setup
(retrieved 2026-07-09): <https://github.com/actions/setup-dotnet#usage>.
