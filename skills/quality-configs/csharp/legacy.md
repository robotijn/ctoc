# C# Legacy Quality Config

Gradual-adoption quality gate for existing C# / .NET 9 (`net9.0`) codebases that
predate analyzers. The goal is **ratchet, not wall**: surface issues as *warnings*,
baseline the existing noise, and tighten one category at a time toward the `strict`
tier. Nothing here fails the build except a genuinely broken build.

## Mode: Legacy (lenient / migration)

- Target framework: `net9.0`
- Coverage floor: **50%** (lines and branches)
- Analyzer findings are **warnings**, never build-breaking (`TreatWarningsAsErrors: false`)
- Nullable reference types opt-in **per file** (`#nullable enable` at the top of a
  migrated file) rather than solution-wide
- Analyzer scope: `latest-minimum` — only the highest-confidence, lowest-noise rules

Rationale: `AnalysisLevel: latest-minimum` runs the current SDK's analyzers but at the
*minimum* rule set, so an untouched legacy solution does not drown in thousands of new
warnings on day one. See the analysis-level semantics on
learn.microsoft.com (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props#analysislevel>

## EditorConfig (`.editorconfig`)

Severities are deliberately `suggestion`/`warning` — never `error` — at this tier.

```ini
root = true

[*.cs]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

# Nullable annotations surfaced as suggestions during migration
dotnet_diagnostic.CS8600.severity = suggestion  # Converting null literal to non-nullable
dotnet_diagnostic.CS8602.severity = suggestion  # Dereference of a possibly-null reference
dotnet_diagnostic.CS8618.severity = suggestion  # Non-nullable field uninitialized

# High-confidence correctness rules kept as warnings (the migration signal)
dotnet_diagnostic.CA2000.severity = warning  # Dispose objects before losing scope
dotnet_diagnostic.CA2213.severity = warning  # Disposable fields should be disposed
dotnet_diagnostic.CA1816.severity = warning  # Call GC.SuppressFinalize correctly

# Complexity is measured but only informational at this tier
dotnet_diagnostic.CA1502.severity = suggestion  # Avoid excessive complexity
dotnet_diagnostic.CA1505.severity = suggestion  # Avoid unmaintainable code
```

Rule identities web-verified against the official code-analysis quality-rules docs
(retrieved 2026-07-09): CA2000
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca2000>,
CA1502 <https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1502>.

## Project File (`.csproj`)

```xml
<PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>warnings</Nullable>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-minimum</AnalysisLevel>
    <EnforceCodeStyleInBuild>false</EnforceCodeStyleInBuild>
</PropertyGroup>

<ItemGroup>
    <!-- coverlet only; no StyleCop pressure during migration -->
    <PackageReference Include="coverlet.collector" Version="10.0.1">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
</ItemGroup>
```

`Nullable=warnings` enables the null-state analysis but downgrades every nullable
diagnostic to a warning (vs `enable`, which makes them normal warnings that
`WarningsAsErrors` can promote). The `net9.0` SDK bundles `Microsoft.CodeAnalysis.NetAnalyzers`,
so no analyzer `PackageReference` is required at this tier; a newer stable analyzer set is
`10.0.301` on NuGet if you choose to pin one. `coverlet.collector` latest stable is
`10.0.1` (NuGet flat index, retrieved 2026-07-09):
<https://api.nuget.org/v3-flatcontainer/coverlet.collector/index.json>.
Nullable property semantics (retrieved 2026-07-09):
<https://learn.microsoft.com/en-us/dotnet/csharp/nullable-references#nullable-contexts>.

## Coverage Requirements

| Metric   | Threshold |
|----------|-----------|
| Lines    | 50%       |
| Branches | 50%       |

Measured with `coverlet.collector` + `dotnet-reportgenerator-globaltool` (latest stable
`5.5.10`, NuGet retrieved 2026-07-09):
<https://api.nuget.org/v3-flatcontainer/dotnet-reportgenerator-globaltool/index.json>.
The 50% floor is a *starting baseline* to ratchet upward toward the `strict` 80%.

## Complexity Limits

Complexity is reported, not enforced, at this tier — you learn where the debt is before
paying it down.

| Metric                    | Rule   | Severity (legacy) |
|---------------------------|--------|-------------------|
| Cyclomatic complexity     | CA1502 | suggestion        |
| Maintainability index     | CA1505 | suggestion        |

CA1502 exposes a configurable `threshold` (default 25) and CA1505 flags code below a
maintainability-index floor; both documented at
<https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1505>
(retrieved 2026-07-09).

## Commands

```bash
# Restore + build; warnings stay warnings at this tier (no /warnaserror)
dotnet build

# Run tests with coverage collection
dotnet test --collect:"XPlat Code Coverage"

# Generate an HTML coverage report to eyeball the 50% baseline
dotnet tool run reportgenerator -reports:**/coverage.cobertura.xml -targetdir:coveragereport

# Format check is advisory only — report drift, do not fail
dotnet format --verify-no-changes --severity info || true
```

## CI Integration (gradual adoption)

The migration philosophy: **baseline the current warning count, then only fail on
regression** — never on the pre-existing debt. Generate an analyzer baseline once
(`dotnet build /p:GenerateAnalyzerConfigBaseline=true` or a suppressions file), commit it,
and let CI enforce "no *new* warnings" while the backlog is paid down.

```yaml
# .github/workflows/quality-legacy.yml
name: quality (legacy)
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
      - run: dotnet build --no-restore          # warnings allowed; build must still pass
      - run: dotnet test --no-build --collect:"XPlat Code Coverage"
      # Coverage gate advisory at 50% during migration; do not hard-fail yet.
```

`actions/setup-dotnet@v4` with `dotnet-version: '9.0.x'` is the current .NET 9 CI setup
(retrieved 2026-07-09): <https://github.com/actions/setup-dotnet#usage>.
Ratchet path: once the warning baseline is clean, graduate this project to
`skills/quality-configs/csharp/strict.md` (`Nullable=enable`, `latest-all`, 80%).
