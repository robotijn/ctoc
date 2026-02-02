# C# Strictest Quality Config

Maximum strictness for C# projects.

## Mode: Strictest

- Coverage: 90% minimum
- All warnings as errors
- Full nullable enforcement

## Project File Additions

```xml
<PropertyGroup>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <WarningsNotAsErrors></WarningsNotAsErrors>
    <NoWarn></NoWarn>
</PropertyGroup>
```

## EditorConfig Additions

```ini
# All analyzers as errors
dotnet_analyzer_diagnostic.severity = error

# Explicit complexity limits
dotnet_diagnostic.CA1502.severity = error
dotnet_diagnostic.CA1505.severity = error
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
