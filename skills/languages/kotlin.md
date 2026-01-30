# Kotlin CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `!!` operator — handle nulls with `?.` or `?:`
- Claude forgets K2 compiler is default in Kotlin 2.0+
- Claude uses `GlobalScope` — use structured concurrency
- Claude forgets `data class` issues with JPA entities

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `kotlin 2.3+` | K2 compiler default | 1.x versions |
| `gradle kts` | Build with Kotlin DSL | Groovy DSL |
| `ktlint` + `detekt` | Linting | Just IDE checks |
| `kotest` or `junit 5` | Testing | Older frameworks |
| `kover` | Coverage | JaCoCo (less Kotlin-aware) |

## Patterns Claude Should Use
```kotlin
// Structured concurrency (not GlobalScope)
coroutineScope {
    val user = async { fetchUser(id) }
    val orders = async { fetchOrders(id) }
    combine(user.await(), orders.await())
}

// Null safety patterns
val name = user?.name ?: "Unknown"
val length = text?.length ?: return  // Early return

// Sealed interfaces for state
sealed interface Result<out T> {
    data class Success<T>(val data: T) : Result<T>
    data class Error(val message: String) : Result<Nothing>
}

// Range operators (Kotlin 1.9+)
for (i in 0..<n) { /* exclusive */ }
```

## Anti-Patterns Claude Generates
- `!!` operator anywhere — use safe calls or elvis
- `GlobalScope.launch` — use `coroutineScope` or injected scope
- `data class` for JPA entities — use regular class with plugins
- Blocking in coroutines — use `withContext(Dispatchers.IO)`
- Mutable collections when immutable works

## Version Gotchas
- **2.2+**: `-language-version=1.6/1.7` no longer supported
- **2.2+**: Interface functions compile to JVM default methods
- **2.0+**: K2 compiler default, invokedynamic for lambdas
- **With JPA**: Need kotlin-jpa plugin for no-arg constructors
- **With Gradle 8.7+**: May see `withJava()` deprecation warnings
