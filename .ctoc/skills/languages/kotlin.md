# Kotlin CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
./gradlew ktlintCheck detekt           # Lint
./gradlew ktlintFormat                 # Format
./gradlew test koverReport             # Test with coverage
./gradlew build                        # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Kotlin 2.0+** - K2 compiler, stable coroutines
- **Gradle** - Build with Kotlin DSL
- **ktlint** - Code formatting and linting
- **detekt** - Static analysis
- **Kotest/JUnit 5** - Testing frameworks

## Project Structure
```
project/
├── src/main/kotlin/   # Production code
├── src/test/kotlin/   # Test code
├── build.gradle.kts   # Kotlin DSL build config
└── settings.gradle.kts# Project settings
```

## Non-Negotiables
1. Null safety - never use `!!` operator
2. Data classes for DTOs and value objects
3. Coroutines for all async operations
4. Sealed classes/interfaces for state machines

## Red Lines (Reject PR)
- `!!` operator anywhere in code
- Blocking calls in coroutine scope
- Mutable collections when immutable works
- Platform types without explicit null handling
- Secrets hardcoded in source
- GlobalScope usage (use structured concurrency)

## Testing Strategy
- **Unit**: Kotest/JUnit 5, <100ms, MockK for mocking
- **Integration**: Testcontainers for databases
- **E2E**: Ktor client or REST-assured

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| NPE from Java interop | Use @Nullable annotations, safe calls |
| Coroutine leaks | Use structured concurrency, supervisorScope |
| Data class copy mutation | Treat as immutable, copy explicitly |
| Suspend in wrong context | Use withContext for dispatchers |

## Performance Red Lines
- No O(n^2) in hot paths
- No blocking in coroutines (use Dispatchers.IO)
- No unbounded channels (use bounded)

## Security Checklist
- [ ] Input validated at boundaries
- [ ] SQL uses prepared statements
- [ ] Secrets from environment/vault
- [ ] Dependencies audited (OWASP, `gradle dependencyCheckAnalyze`)
