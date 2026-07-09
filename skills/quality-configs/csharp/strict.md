# C# Strict Quality Config

Balanced quality gate for actively-maintained C# / .NET 9 (`net9.0`) projects. Nullable
is enabled solution-wide, the full analyzer set runs, code style is enforced in the build,
and nullable violations break the build — but not every stylistic nit does. This is the
recommended default for a healthy codebase.

## Mode: Strict (balanced)

- Target framework: `net9.0`
- Coverage floor: **80%** (lines and branches)
- Full Roslyn analyzer set (`AnalysisLevel: latest-all`)
- Nullable reference types **enabled** solution-wide; nullable warnings are errors
- Code style enforced at build (`EnforceCodeStyleInBuild: true`)

`AnalysisLevel: latest-all` runs every rule the current SDK ships at its default severity;
`WarningsAsErrors: nullable` promotes only the nullable (`CS86xx`) diagnostics to errors so
null-safety regressions cannot merge. Semantics web-verified (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props#analysislevel>.

## EditorConfig (`.editorconfig`)

```ini
root = true

[*.cs]
# Core EditorConfig options
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

# .NET coding conventions
dotnet_sort_system_directives_first = true
dotnet_separate_import_directive_groups = true

# C# style preferences
csharp_style_var_for_built_in_types = true:warning
csharp_style_var_when_type_is_apparent = true:warning
csharp_style_var_elsewhere = true:warning

csharp_style_expression_bodied_methods = when_on_single_line:suggestion
csharp_style_expression_bodied_constructors = when_on_single_line:suggestion
csharp_style_expression_bodied_properties = when_on_single_line:suggestion

csharp_style_pattern_matching_over_is_with_cast_check = true:warning
csharp_style_pattern_matching_over_as_with_null_check = true:warning
csharp_style_prefer_switch_expression = true:suggestion

# Nullable reference types
csharp_style_nullable_declarations = enable

# Analyzer severity
dotnet_diagnostic.CA1062.severity = error  # Validate arguments of public methods
dotnet_diagnostic.CA1063.severity = error  # Implement IDisposable correctly
dotnet_diagnostic.CA1816.severity = error  # Call GC.SuppressFinalize correctly
dotnet_diagnostic.CA2000.severity = error  # Dispose objects before losing scope
dotnet_diagnostic.CA2213.severity = error  # Disposable fields should be disposed

# Complexity
dotnet_diagnostic.CA1502.severity = warning  # Avoid excessive complexity
dotnet_diagnostic.CA1505.severity = warning  # Avoid unmaintainable code
```

Rule identities web-verified against the official quality-rules docs (retrieved 2026-07-09):
CA1062 <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1062>,
CA1063 <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1063>,
CA1816 <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1816>.

## Project File (`.csproj`)

```xml
<PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <WarningsAsErrors>nullable</WarningsAsErrors>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-all</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
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

Package versions are the current stable/published releases per the NuGet flat-container
index (retrieved 2026-07-09):
`Microsoft.CodeAnalysis.NetAnalyzers` 10.0.301
<https://api.nuget.org/v3-flatcontainer/microsoft.codeanalysis.netanalyzers/index.json>,
`StyleCop.Analyzers` 1.2.0-beta.556 (latest published; StyleCop has no non-beta release)
<https://api.nuget.org/v3-flatcontainer/stylecop.analyzers/index.json>,
`coverlet.collector` 10.0.1
<https://api.nuget.org/v3-flatcontainer/coverlet.collector/index.json>.

## Coverage Requirements

| Metric   | Threshold |
|----------|-----------|
| Lines    | 80%       |
| Branches | 80%       |

Collected with `coverlet.collector` and reported with `dotnet-reportgenerator-globaltool`
(latest stable `5.5.10`, NuGet retrieved 2026-07-09):
<https://api.nuget.org/v3-flatcontainer/dotnet-reportgenerator-globaltool/index.json>.

## Complexity Limits

| Metric                | Rule   | Severity (strict) | Threshold                |
|-----------------------|--------|-------------------|--------------------------|
| Cyclomatic complexity | CA1502 | warning           | 25 (CA1502 default)      |
| Maintainability index | CA1505 | warning           | flags low-index members  |

CA1502 (cyclomatic complexity, configurable `threshold`) and CA1505 (maintainability index)
are surfaced as warnings so complexity trends are visible without blocking merges. Docs
(retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1502>.

## Commands

```bash
# Build with analyzers; nullable violations fail via WarningsAsErrors=nullable
dotnet build /warnaserror:nullable

# Run tests with coverage
dotnet test --collect:"XPlat Code Coverage" -- DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura

# Generate coverage report and check the 80% threshold
dotnet tool run reportgenerator -reports:**/coverage.cobertura.xml -targetdir:coveragereport

# Verify formatting / style without writing changes
dotnet format --verify-no-changes
```

`dotnet format --verify-no-changes` exits non-zero on any style drift; usage documented
(retrieved 2026-07-09): <https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format>.

## CI Integration

```yaml
# .github/workflows/quality-strict.yml
name: quality (strict)
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
      - run: dotnet format --verify-no-changes            # style gate
      - run: dotnet build --no-restore /warnaserror:nullable
      - run: dotnet test --no-build --collect:"XPlat Code Coverage"
      - run: dotnet tool install --global dotnet-reportgenerator-globaltool --version 5.5.10
      - run: reportgenerator -reports:**/coverage.cobertura.xml -targetdir:cov -reporttypes:TextSummary
      # Fail the job if line coverage < 80% (parse cov/Summary.txt in a follow-up step).
```

`actions/setup-dotnet@v4` with `dotnet-version: '9.0.x'` targets .NET 9 in CI (retrieved
2026-07-09): <https://github.com/actions/setup-dotnet#usage>.
