# C# Legacy Quality Config

Gradual adoption for existing C# projects.

## Mode: Legacy

- Coverage: 50% minimum
- Warnings as warnings
- Nullable opt-in per file

## Project File

```xml
<PropertyGroup>
    <Nullable>warnings</Nullable>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableNETAnalyzers>true</EnableNETAnalyzers>
    <AnalysisLevel>latest-minimum</AnalysisLevel>
</PropertyGroup>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |
| Branches | 50% |
