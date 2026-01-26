# F# CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
dotnet fsharplint lint .               # Lint
fantomas .                             # Format
dotnet test --collect:"XPlat Code Coverage"  # Test
dotnet build -c Release                # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **F# 8+ / .NET 8+** - Latest with improved tooling
- **Fantomas** - Official formatter
- **FSharpLint** - Linting
- **Expecto/xUnit** - Testing frameworks
- **Ionide** - VS Code extension

## Project Structure
```
project/
├── src/Project/       # Production code
├── tests/Project.Tests/  # Test project
├── Project.sln        # Solution file
└── .editorconfig      # Format config
```

## Non-Negotiables
1. Immutability by default - minimize mutable
2. Discriminated unions for domain modeling
3. Railway-oriented programming for errors
4. Computation expressions for workflows

## Red Lines (Reject PR)
- Mutable without clear justification
- Ignoring exhaustiveness warnings
- null usage (use Option)
- Imperative style where functional works
- Secrets hardcoded in source
- .Result or .Wait() on async

## Testing Strategy
- **Unit**: Expecto/xUnit, <100ms, pure functions
- **Property**: FsCheck for generative testing
- **Integration**: Testcontainers for services

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Incomplete pattern match | Handle all DU cases |
| Option.get usage | Use pattern matching |
| Async/Task confusion | Use task CE for C# interop |
| Seq multiple enumeration | Use List or Array |

## Performance Red Lines
- No O(n^2) in hot paths
- No blocking async (use Async.RunSynchronously sparingly)
- No Seq when List/Array performs better

## Security Checklist
- [ ] Input validated at boundaries
- [ ] SQL uses parameterized queries
- [ ] Secrets from environment/Azure KeyVault
- [ ] Dependencies audited (`dotnet list package --vulnerable`)
