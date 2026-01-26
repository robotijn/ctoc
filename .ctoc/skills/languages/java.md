# Java CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
./mvnw checkstyle:check spotbugs:check # Lint
./mvnw spotless:apply                  # Format
./mvnw test jacoco:report              # Test with coverage
./mvnw package -DskipTests             # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Java 21+ LTS** - Virtual threads, records, pattern matching
- **Maven/Gradle** - Build tools with wrapper
- **Checkstyle** - Style enforcement (Google style)
- **SpotBugs** - Static bug detection
- **JUnit 5** - Modern testing with Mockito

## Project Structure
```
project/
├── src/main/java/     # Production code
├── src/main/resources/# Config files
├── src/test/java/     # Test code
├── pom.xml            # Maven config
└── target/            # Build output
```

## Non-Negotiables
1. Use records for immutable data classes
2. Use Optional - never return null from methods
3. Proper exception handling with specific types
4. Use var for local variables (type inference)

## Red Lines (Reject PR)
- Returning null (use Optional<T>)
- Catching base Exception or Throwable
- Mutable public fields (use getters)
- Raw types (always use generics)
- Secrets hardcoded in source
- System.out.println in production code

## Testing Strategy
- **Unit**: JUnit 5 + Mockito, <100ms, mock dependencies
- **Integration**: Testcontainers for real databases
- **E2E**: REST-assured or Selenium for critical paths

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| NullPointerException | Use Optional, null checks, @Nullable |
| Resource leaks | try-with-resources for all Closeables |
| Equals/hashCode bugs | Use records or IDE generation |
| ConcurrentModificationException | Use concurrent collections |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded collections (use pagination)
- No blocking in virtual thread pools

## Security Checklist
- [ ] Input validated with Bean Validation
- [ ] SQL uses PreparedStatement or JPA
- [ ] Secrets from environment/vault
- [ ] Dependencies audited (OWASP dependency-check)
