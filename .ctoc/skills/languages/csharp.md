# C# CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
dotnet format --verify-no-changes      # Check format
dotnet format                          # Format
dotnet test --collect:"XPlat Code Coverage"  # Test
dotnet build -c Release                # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **C# 12 / .NET 8+** - Latest LTS with top-level statements
- **dotnet format** - Built-in formatting
- **Roslyn analyzers** - Static analysis (enable all)
- **xUnit/NUnit** - Testing frameworks
- **Coverlet** - Code coverage

## Project Structure
```
project/
├── src/Project/       # Production code
├── tests/Project.Tests/  # Test project
├── Project.sln        # Solution file
├── Directory.Build.props  # Shared MSBuild props
└── .editorconfig      # Code style config
```

## Non-Negotiables
1. Nullable reference types enabled project-wide
2. Records for immutable data transfer objects
3. async/await with proper cancellation tokens
4. Pattern matching for type checks

## Red Lines (Reject PR)
- Nullable warnings disabled or ignored
- `async void` (except event handlers)
- Catching base Exception without rethrow
- Public mutable fields (use properties)
- Secrets in appsettings.json
- Task.Result or .Wait() (use await)

## Testing Strategy
- **Unit**: xUnit + Moq/NSubstitute, <100ms
- **Integration**: WebApplicationFactory, Testcontainers
- **E2E**: Playwright for UI, REST client for APIs

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Async deadlocks | ConfigureAwait(false) in libraries |
| IDisposable leaks | using statements, DI scopes |
| LINQ multiple enumeration | ToList() or reuse variable |
| Boxing in hot paths | Generic constraints, Span<T> |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded memory (use IAsyncEnumerable)
- No sync-over-async (no .Result/.Wait())

## Security Checklist
- [ ] Input validated with DataAnnotations/FluentValidation
- [ ] SQL uses parameterized queries or EF Core
- [ ] Secrets from Azure KeyVault/environment
- [ ] Dependencies audited (`dotnet list package --vulnerable`)
