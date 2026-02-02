# C# Strict Quality Config

Strict mode configuration for C# / .NET projects.

## Mode: Strict

- Coverage: 80% minimum
- Roslyn analyzers enabled
- Nullable reference types

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
dotnet_diagnostic.CA1062.severity = error  # Validate arguments
dotnet_diagnostic.CA1063.severity = error  # Implement IDisposable correctly
dotnet_diagnostic.CA1816.severity = error  # Call GC.SuppressFinalize correctly
dotnet_diagnostic.CA2000.severity = error  # Dispose objects before losing scope
dotnet_diagnostic.CA2213.severity = error  # Disposable fields should be disposed

# Complexity
dotnet_diagnostic.CA1502.severity = warning  # Avoid excessive complexity
dotnet_diagnostic.CA1505.severity = warning  # Avoid unmaintainable code
```

## Project File (`.csproj`)

```xml
<PropertyGroup>
    <Nullable>enable</Nullable>
    <WarningsAsErrors>nullable</WarningsAsErrors>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-all</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>

<ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="8.0.0">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="coverlet.collector" Version="6.0.0">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
</ItemGroup>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Commands

```bash
# Build with analyzers
dotnet build /warnaserror

# Run tests with coverage
dotnet test --collect:"XPlat Code Coverage" -- DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=cobertura

# Check coverage threshold
dotnet tool run reportgenerator -reports:coverage.cobertura.xml -targetdir:coveragereport

# Format
dotnet format --verify-no-changes
```
