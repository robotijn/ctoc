# C# CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `.Result`/`.Wait()` — always use `await`
- Claude forgets `field` keyword is preview in C# 13
- Claude ignores nullable reference types — enable project-wide
- Claude suggests `async void` — only valid for event handlers

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `.NET 8 LTS` / `.NET 9` | Latest runtime | .NET 6 or older |
| `C# 13` | New params, field keyword | Older C# |
| `Roslyn analyzers` | Static analysis | Just builds |
| `xUnit` + `NSubstitute` | Testing | MSTest |
| `HybridCache` | Caching (.NET 9) | IDistributedCache alone |

## Patterns Claude Should Use
```csharp
// C# 13: params with any collection type
void Log(params ReadOnlySpan<string> messages) { }

// C# 12+: Primary constructors
public class Service(ILogger logger, IRepository repo)
{
    public void Process() => logger.Log(repo.GetData());
}

// Collection expressions
int[] numbers = [1, 2, 3, 4, 5];
List<string> names = ["Alice", "Bob"];

// Proper async
await foreach (var item in GetItemsAsync(cancellationToken))
{
    await ProcessAsync(item, cancellationToken);
}
```

## Anti-Patterns Claude Generates
- `.Result` or `.Wait()` — causes deadlocks
- `async void` methods — unhandled exceptions
- Ignoring nullable warnings — enable `<Nullable>enable</Nullable>`
- `catch (Exception)` without rethrow — swallows errors
- LINQ multiple enumeration — call `.ToList()` once

## Version Gotchas
- **C# 13**: `field` keyword preview, `params` accepts spans/collections
- **C# 13**: Collection expression binding changes may break code
- **.NET 9**: `HybridCache` solves stampede problem
- **.NET 8 LTS**: Supported until November 2026
- **.NET 9**: Only 18 months support (ends before .NET 8!)
