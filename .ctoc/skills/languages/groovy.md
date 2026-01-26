# Groovy CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
./gradlew codenarcMain                 # Lint
# (Format with IDE or spotless)
./gradlew test                         # Test
./gradlew build                        # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Groovy 4.x** - Latest stable
- **Gradle** - Build automation
- **Spock 2** - Testing framework
- **CodeNarc** - Static analysis
- **Jenkins** - Pipeline scripting

## Project Structure
```
project/
├── src/main/groovy/   # Production code
├── src/test/groovy/   # Spock tests
├── build.gradle       # Build config
├── Jenkinsfile        # Pipeline (if applicable)
└── config/codenarc/   # CodeNarc rules
```

## Non-Negotiables
1. @CompileStatic for performance-critical code
2. Proper null handling with safe navigation (?.)
3. Closure delegation patterns documented
4. Type annotations on public APIs

## Red Lines (Reject PR)
- Dynamic typing in library APIs
- Unconstrained metaprogramming
- Missing @TypeChecked where beneficial
- GString in security contexts (injection)
- Secrets hardcoded in code
- Blocking in async pipelines

## Testing Strategy
- **Unit**: Spock specifications, <100ms
- **Integration**: Spock with real dependencies
- **Pipeline**: Jenkins test runs

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| NullPointerException | Use safe navigation ?. |
| Method resolution | Prefer @CompileStatic |
| Memory with closures | Watch for captured variables |
| GString interpolation | Escape user input |

## Performance Red Lines
- No O(n^2) in hot paths
- No dynamic dispatch in inner loops
- No excessive metaprogramming overhead

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No GString with user input (use String)
- [ ] Secrets from environment/credentials
- [ ] Dependencies audited (OWASP)
