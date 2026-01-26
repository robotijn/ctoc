# Scala CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
sbt scalafmtCheckAll scalafix --check  # Lint
sbt scalafmtAll                        # Format
sbt test coverage coverageReport       # Test with coverage
sbt assembly                           # Build fat jar
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Scala 3.x** - New syntax, enums, given/using
- **sbt** - Build tool
- **Scalafmt** - Code formatting
- **Scalafix** - Linting and refactoring
- **MUnit/ScalaTest** - Testing frameworks

## Project Structure
```
project/
├── src/main/scala/    # Production code
├── src/test/scala/    # Test code
├── build.sbt          # Build definition
├── project/           # sbt plugins
└── .scalafmt.conf     # Scalafmt config
```

## Non-Negotiables
1. Immutability by default - val over var
2. Case classes for all data structures
3. Pattern matching for type handling
4. Explicit type annotations on public APIs

## Red Lines (Reject PR)
- Mutable state without justification
- null usage (use Option)
- Side effects in pure functions
- Blocking in async code (Futures, ZIO, Cats Effect)
- Secrets hardcoded in source
- Any/AnyRef type abuse

## Testing Strategy
- **Unit**: MUnit/ScalaTest, <100ms, mock traits
- **Integration**: Testcontainers for services
- **Property**: ScalaCheck for invariants

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Implicit resolution confusion | Use given/using (Scala 3) |
| Future blocking with Await | Use for-comprehensions |
| Memory leaks in streams | Proper resource management |
| Type inference failures | Add explicit type annotations |

## Performance Red Lines
- No O(n^2) in hot paths
- No blocking in effect systems
- No unbounded collections (use fs2 streams)

## Security Checklist
- [ ] Input validated at boundaries
- [ ] SQL uses parameterized queries
- [ ] Secrets from environment/config
- [ ] Dependencies audited (`sbt dependencyCheck`)
