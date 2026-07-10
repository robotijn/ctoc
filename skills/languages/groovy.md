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

## Concurrency Footguns
- Groovy runs on the **JVM**, so real concurrency is `java.util.concurrent`
  (`ExecutorService`, `CompletableFuture`, `ConcurrentHashMap`) — use it directly rather
  than rolling your own. **GPars** adds actors/dataflow/parallel-collections on top.
- **Dynamic dispatch is a hidden cost under contention**: every dynamic method call goes
  through the meta-object protocol (call-site caching helps, but a mutated metaclass
  invalidates caches). Under many threads this shows up as lock/cache contention that
  `@CompileStatic` sidesteps by binding calls at compile time.
- **Shared mutable state**: Groovy's terse closures make it easy to capture and mutate an
  outer variable from multiple threads — capture immutable snapshots, or guard with
  `synchronized`/atomics.
- **Metaclass mutation is process-global and not thread-safe** — never mutate a metaclass
  from worker threads at runtime.

```groovy
import java.util.concurrent.*

// Real parallelism is JVM concurrency, not Groovy magic.
ExecutorService pool = Executors.newFixedThreadPool(4)
List<Future<Integer>> futures = (1..8).collect { n ->
    pool.submit({ -> n * n } as Callable<Integer>)
}
def results = futures*.get()          // [1, 4, 9, 16, 25, 36, 49, 64]
pool.shutdown()
```

## Error Handling Idioms
- **Groovy erases checked exceptions**: a method can throw a Java checked exception without
  a `throws` clause and callers are not forced to catch it. Do not rely on the compiler to
  remind you — catch deliberately at boundaries.
- Use `try`/`catch`/`finally` as in Java; multi-catch `catch (IOException | SQLException e)`
  works.
- **`@CompileStatic` surfaces type errors at compile time** that dynamic Groovy would only
  blow up on at runtime (typos in method/property names, wrong argument types). Apply it to
  library/API code where a runtime `MissingMethodException` is unacceptable.

```groovy
@groovy.transform.CompileStatic
class OrderService {
    BigDecimal total(List<Order> orders) {
        // A typo like orders.sumZZ() is now a COMPILE error, not a runtime blowup.
        orders.sum { Order o -> o.amount } as BigDecimal
    }
}
```

## Security and Dependency Gotchas
- **`Eval`, `GroovyShell`, and `GroovyClassLoader` on untrusted input are code injection —
  CWE-94 (Improper Control of Generation of Code).** Evaluating attacker-supplied Groovy is
  arbitrary JVM code execution. Never `new GroovyShell().evaluate(userInput)`. If dynamic
  scripting is unavoidable, run it inside a restricting `SecureASTCustomizer` sandbox and
  treat sandbox escapes as an expected class of finding. — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- **JVM deserialization of untrusted data is CWE-502**: Java/Groovy `ObjectInputStream`
  gadget chains are a documented RCE class. Do not deserialize untrusted bytes; prefer JSON.
  — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
- **Jenkins pipeline sandbox escapes** are a recurring documented vulnerability class — treat
  Jenkinsfile Groovy that touches untrusted input as security-sensitive, and keep the
  Script Security plugin's approval list minimal.
- **GString SQL** (`"select * from ${table}"`) is SQL injection — use parameterized queries.
- **Dependency pinning**: pin versions in Gradle/Maven and run the OWASP `dependency-check`
  plugin in CI.

```groovy
// UNSAFE: arbitrary JVM code execution (CWE-94)
new GroovyShell().evaluate(request.getParameter('script'))   // never do this

// UNSAFE: GString SQL injection — use a prepared statement instead
sql.rows("SELECT * FROM t WHERE name = '${userInput}'")      // interpolated => injectable
sql.rows("SELECT * FROM t WHERE name = ?", [userInput])      // SAFE: bound parameter
```

## Testing Conventions
- **Spock** is the idiomatic Groovy test framework: `given:`/`when:`/`then:` blocks, data
  tables (`where:`), and expressive power-assertions that print every sub-expression on
  failure. It interoperates with **JUnit** runners and tooling.
- Use `Mock()`/`Stub()`/`Spy()` from Spock for interaction testing; keep mocks to external
  collaborators, never the code under test.
- **Coverage** via **JaCoCo** (Gradle/Maven plugin). `@CompileStatic` code produces cleaner
  bytecode and more accurate coverage than heavily dynamic code.

## Performance Traps
- **Dynamic dispatch overhead vs `@CompileStatic`**: dynamic calls route through the MOP and
  are markedly slower in hot loops; `@CompileStatic` (or `@TypeChecked` for checking without
  static binding) removes it where the dynamic behavior isn't needed.
- **Metaclass mutation cost**: adding/replacing methods via `metaClass` invalidates call-site
  caches process-wide — cheap once at startup, ruinous in a hot path.
- **Closure allocation**: closures capture their enclosing scope; allocating one per
  iteration in a tight loop is GC pressure — hoist it out.
- **GString vs String**: a `GString` defers evaluation and holds references to interpolated
  values; force `.toString()` when you need a plain, comparable, hashable `String` (map keys!).

## Version-Specific Gotchas (Groovy 4.x / 5.x)
- **Groovy 4.0 (released 2022-01-25) moved Maven coordinates from `org.codehaus.groovy` to
  `org.apache.groovy`** — a dependency still pulling `org.codehaus.groovy` silently gets an
  old 3.x line. It also added JPMS module support, sealed types, records, and switch
  expressions. — https://groovy-lang.org/releasenotes/groovy-4.0.html (retrieved 2026-07-10)
- **Groovy 5.0 (released 2025-08-21)** is now the current line (latest 5.0.x as of mid-2026);
  Groovy 4.0.x remains maintained. Confirm your build against the download page and pin the
  exact version. — https://groovy.apache.org/download.html (retrieved 2026-07-10)
- **Groovy 2.5 reached end-of-life 2026-04-30** — treat any 2.x pin as a migration debt.
  — https://endoflife.date/groovy (retrieved 2026-07-10)

## References
- Groovy 4.0 release notes — https://groovy-lang.org/releasenotes/groovy-4.0.html (retrieved 2026-07-10)
- Groovy downloads — https://groovy.apache.org/download.html (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- CWE-502 Deserialization of Untrusted Data — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
