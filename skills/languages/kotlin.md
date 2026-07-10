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

## Coroutines / Concurrency Footguns
`GlobalScope` is the #1 coroutine anti-pattern: it launches work tied to the
process lifetime, so it leaks and outlives the screen/request that started it.
Use a scoped `CoroutineScope` and let **structured concurrency** bound the
lifetime instead — on Android, `viewModelScope` / `lifecycleScope`; elsewhere,
`coroutineScope { }`.

```kotlin
// FOOTGUN: fire-and-forget on GlobalScope — never cancelled, leaks the work.
GlobalScope.launch { syncEverything() }          // WRONG

// SAFE: structured — the child is cancelled when the scope is cancelled.
class UserViewModel : ViewModel() {
    fun refresh() = viewModelScope.launch {       // bound to the ViewModel
        val user   = async { fetchUser(id) }      // siblings; one failure
        val orders = async { fetchOrders(id) }    // cancels the group
        render(user.await(), orders.await())
    }
}
```

- **Cancellation is cooperative.** A tight CPU loop never stops on cancel unless
  it checks — call `ensureActive()` (throws) or test `isActive` between chunks.
  Suspending calls from `kotlinx.coroutines` are already cancellation points.
- **`Dispatchers.IO` vs `Default`.** `IO` is for blocking I/O (large elastic
  pool); `Default` is a CPU-bound pool sized to cores. Never run blocking I/O on
  `Default` — you starve every other CPU task. Wrap blocking work in
  `withContext(Dispatchers.IO)`.
- **Exception handling.** In a `launch`, an uncaught exception cancels the whole
  scope and its siblings. Use a `SupervisorJob` (or `supervisorScope`) so one
  child's failure does not kill the others, and install a
  `CoroutineExceptionHandler` for top-level `launch` roots (it does **not** fire
  for `async`, whose exception surfaces at `.await()`).

## Error Handling Idioms
```kotlin
// runCatching / Result for expected failures at a boundary:
val parsed: Result<Config> = runCatching { parse(raw) }
parsed.getOrElse { e -> ConfigError.from(e) }

// FOOTGUN: catching CancellationException swallows cooperative cancellation and
// hangs structured concurrency. Rethrow it explicitly.
try {
    doWork()
} catch (e: CancellationException) {
    throw e                        // MUST rethrow — never swallow
} catch (e: IOException) {
    handle(e)
}
```

- Kotlin has **no checked exceptions** — the compiler will not remind you a call
  can throw; document/handle at the boundary. Prefer a sealed-class or `Result`
  return for expected error paths; reserve exceptions for the truly exceptional.

## Security and Dependency Gotchas
- **Kotlin/Java null-safety interop.** A value coming from unannotated Java is a
  **platform type** (`String!`) — Kotlin suspends null checks on it, so a `null`
  slips through and throws NPE at the first non-null use. Annotate the Java side
  (`@Nullable` / `@NonNull` / JSpecify) or immediately narrow to `String?` and
  handle null on the Kotlin side. Never treat a platform type as non-null on faith.
- **Deserialization — CWE-502.** Kotlin runs on the JVM, so untrusted Java
  serialization (`ObjectInputStream.readObject`) is remote code execution via
  gadget chains. Do not deserialize untrusted bytes; use a data format
  (`kotlinx.serialization` JSON) and validate shape. (CWE-502 "Deserialization of
  Untrusted Data" — cwe.mitre.org.)
- **Supply chain.** Enable Gradle **dependency verification**
  (`gradle/verification-metadata.xml`, checksums/signatures) and commit lockfiles
  so a swapped or typosquatted artifact fails the build instead of shipping.

## Testing Conventions
```kotlin
// kotlinx-coroutines-test: runTest drives virtual time — no real delays.
@Test
fun loadsUser() = runTest {                 // TestScope + StandardTestDispatcher
    val vm = UserViewModel(repo, StandardTestDispatcher(testScheduler))
    vm.refresh()
    advanceUntilIdle()
    assertEquals(expected, vm.state.value)
}
```

- JUnit 5 (Jupiter) + **MockK** (Kotlin-native mocking; use `coEvery`/`coVerify`
  for suspend funcs). Kotest for expressive assertions/property tests. Coverage
  via Kover (Kotlin-aware) or JaCoCo. Inject the dispatcher — never hard-code
  `Dispatchers.Main`/`IO` inside code you want to test.

## Performance Traps
- **Nullable primitive boxing.** `Int?`/`Long?` box to `java.lang.Integer` on the
  heap; a hot `List<Int?>` or nullable field allocates per element. Use non-null
  primitives (or specialized arrays like `IntArray`) on hot paths.
- **Lambda allocation.** A non-`inline` higher-order function allocates a
  function object (and captures) per call. Mark small hot higher-order utilities
  `inline` so the body is spliced in and the lambda disappears.
- **`data class` `copy()`** allocates a full new instance — fine occasionally,
  costly in a tight update loop. Prefer `Sequence` over `List` for long lazy
  transform chains to avoid materializing intermediate lists.

## Version-Specific Gotchas (dated, sourced)
- **Kotlin 2.0** made the **K2 compiler** the default and rewrote frontend type
  inference and smart-cast analysis — code that leaned on an old smart-cast may
  now require an explicit cast, and some inference results changed. Re-run the
  full test suite when moving a module to 2.0+.
  [kotlinlang.org "Kotlin 2.0.0 released", retrieved 2026-07-10]
- **Kotlin 2.4.0** is the current stable line (released 2026-06-03); 2.3 reached
  EOL on 2026-06-03. Pin the compiler version in the build and bump deliberately.
  [endoflife.date/kotlin, retrieved 2026-07-10]
- **Gradle KTS vs Groovy DSL.** Migrating `build.gradle` → `build.gradle.kts`
  changes accessor/typing semantics; do it per-module and verify plugin blocks.
- **`data class` + JPA.** A JPA `@Entity` should not be a `data class` — generated
  `equals`/`hashCode` over mutable/lazy fields break identity and can trigger lazy
  loading; use a regular class with the `kotlin-jpa` (no-arg) plugin.

## References (retrieved 2026-07-10)
- Kotlin 2.0 / K2 release: https://kotlinlang.org/docs/whatsnew20.html
- Kotlin release status: https://endoflife.date/kotlin
- Coroutines — cancellation & exceptions: https://kotlinlang.org/docs/cancellation-and-exceptions.html
- Coroutines — coroutine context & dispatchers: https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html
- Java interop & platform types: https://kotlinlang.org/docs/java-interop.html#null-safety-and-platform-types
- Gradle dependency verification: https://docs.gradle.org/current/userguide/dependency_verification.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
