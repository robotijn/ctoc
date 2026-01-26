# Groovy CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses dynamic typing in APIs — use @CompileStatic
- Claude uses GString with user input — security risk
- Claude forgets null safety — use safe navigation `?.`
- Claude creates untyped closures — add type annotations

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `groovy 4.x` | Latest stable | Groovy 2.x |
| `gradle` | Build automation | Manual compilation |
| `spock 2` | Testing framework | JUnit alone |
| `codenarc` | Static analysis | No linting |
| `jenkinsfile` | Pipeline DSL | Shell scripts |

## Patterns Claude Should Use
```groovy
// Use @CompileStatic for type safety and performance
@CompileStatic
class UserService {
    // Type annotations on public APIs
    User findUser(String id) {
        User user = repository.findById(id)
        return user
    }

    // Safe navigation for null handling
    String getUserEmail(User user) {
        return user?.email?.toLowerCase() ?: 'unknown'
    }
}

// Typed closures
Closure<Integer> addOne = { Integer x -> x + 1 }

// Spock testing
class UserServiceSpec extends Specification {
    def "should find user by id"() {
        given:
        def service = new UserService()

        when:
        def user = service.findUser('123')

        then:
        user.name == 'John'
    }
}
```

## Anti-Patterns Claude Generates
- Dynamic typing in libraries — use @CompileStatic
- GString `"select * from $table"` — SQL injection risk
- Missing `?.` — NullPointerException
- Untyped closures — hard to debug
- Unconstrained metaprogramming — maintenance nightmare

## Version Gotchas
- **Groovy 4.x**: Improved Java compatibility
- **@CompileStatic**: 10x faster than dynamic
- **Jenkins pipelines**: Subset of Groovy, CPS transformed
- **GString security**: Never interpolate user input
- **With Java**: Seamless interop, use Java types
