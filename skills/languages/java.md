# Java CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude suggests old thread pools — use virtual threads (Java 21+)
- Claude uses `sun.misc.Unsafe` — migrate to VarHandle/FFM API
- Claude forgets String Templates were removed in Java 23
- Claude returns null — use `Optional<T>` for absence

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `java 21+ LTS` / `java 25` | Virtual threads, records | Java 17 or older |
| `maven/gradle` with wrapper | Build system | Global installs |
| `spotbugs` + `error-prone` | Static analysis | Just checkstyle |
| `junit 5` + `testcontainers` | Testing | JUnit 4 |
| `jlink` | Custom runtime images | Fat JARs |

## Patterns Claude Should Use
```java
// Virtual threads (Java 21+)
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    futures.forEach(f -> executor.submit(f));
}

// Pattern matching for switch (Java 21+)
String result = switch (obj) {
    case String s -> s.toUpperCase();
    case Integer i -> String.valueOf(i * 2);
    case null -> "null";
    default -> "unknown";
};

// Records for data (Java 16+)
record User(String name, String email) {}

// Scoped values (preview) instead of ThreadLocal
ScopedValue.runWhere(USER, currentUser, () -> process());
```

## Anti-Patterns Claude Generates
- Returning `null` — use `Optional<T>`
- `catch (Exception e)` — catch specific exceptions
- Platform threads for I/O — use virtual threads
- `sun.misc.Unsafe` — use VarHandle API
- `synchronized` everywhere — use `java.util.concurrent`

## Version Gotchas
- **Java 24**: Socket.connect() now closes socket on failure
- **Java 23**: String Templates removed, sun.misc.Unsafe warnings
- **Java 21 LTS**: Virtual threads stable, pattern matching finalized
- **Java 26 (Mar 2026)**: Applet API fully removed
- **With Spring**: Virtual threads require `spring.threads.virtual.enabled=true`

## Security and Dependency Gotchas
- **Java deserialization (CWE-502)**: `ObjectInputStream.readObject()` on attacker
  bytes is the classic Java RCE — a crafted object graph runs code through
  "gadget chains" in whatever is on the classpath (Commons-Collections, etc.) during
  `readObject`/`readResolve`, before you ever see the value. This is the impact
  pattern of **CWE-502 "Deserialization of Untrusted Data"**: untrusted input →
  arbitrary object construction → code execution. Never native-deserialize data you
  did not produce. If you must, install a **`ObjectInputFilter`** (Java 9+;
  process-wide default `jdk.serialFilter`) to allow-list classes and cap depth/refs.
  Prefer a data format with no code semantics (JSON via Jackson with
  `activateDefaultTyping` OFF — polymorphic typing reintroduces the same gadget risk).
```java
// Allow-list filter: reject everything except the exact classes you expect.
var filter = ObjectInputFilter.Config.createFilter(
    "com.acme.dto.*;java.base/*;!*");   // last "!*" rejects all else
ois.setObjectInputFilter(filter);
```
- **Supply chain / log4shell class**: a single transitive dependency (Log4j 2's
  JNDI lookup, CVE-2021-44228) turned a log string into RCE across the ecosystem —
  transitive reach, not your direct deps, is the attack surface. Enumerate the real
  graph with `mvn dependency:tree` / `gradle dependencies`, pin it with Maven
  **dependency locking** (`mvn -Dlocking` / `dependencyManagement` BOM) or Gradle
  `dependencyLocking { lockAllConfigurations() }` + committed `*.lockfile`.
- **Audit tooling**: run **OWASP Dependency-Check** (`dependency-check-maven` /
  `dependency-check-gradle`, NVD-backed) or an **OSV**-backed scanner (`osv-scanner`,
  Google) in CI to fail the build on known-vulnerable coordinates. Do not assume a
  clean direct `pom.xml` means a clean tree.
- Source: cwe.mitre.org (CWE-502), OWASP Deserialization Cheat Sheet, OWASP
  Dependency-Check. See References.

## Concurrency Footguns
Virtual threads (**JEP 444**, finalized in **Java 21**) make thread-per-request cheap
— but the failure modes shift.
```java
// FOOTGUN: pinning. On Java 21–23 a virtual thread that blocks INSIDE a
// synchronized block/method pins its carrier platform thread — the whole pool can
// starve under load. JEP 491 (Java 24) removes this pin for synchronized; on 21–23
// migrate hot paths to a ReentrantLock, which never pinned.
synchronized (lock) { io.blockingCall(); }   // pins the carrier on 21–23

// SAFE on any LTS: an explicit lock releases the carrier while blocked.
lock.lock();
try { io.blockingCall(); } finally { lock.unlock(); }
```
- **Do NOT pool virtual threads.** They are the unit of work, not a scarce resource —
  use `Executors.newVirtualThreadPerTaskExecutor()` (one per task) and never wrap them
  in a fixed pool; pooling reintroduces the platform-thread bottleneck you removed.
- **`-Djdk.tracePinnedThreads=full`** surfaces pinning stacks on 21–23 (deprecated
  once JEP 491 lands — pinning on `synchronized` is gone on 24+).
- **`ScopedValue`** (**JEP 506**, finalized) replaces `ThreadLocal` for virtual
  threads: immutable, bounded to a dynamic scope, no leak across a million threads.
  Native serialization frames and JNI can still pin; keep blocking native calls short.
- **Structured concurrency** (`StructuredTaskScope`) is still **preview** (JEP 505);
  it makes a fan-out cancel siblings on first failure. Guard preview APIs behind a
  version check — do not ship preview features to production without `--enable-preview`.
- Source: openjdk.org/jeps/444, openjdk.org/jeps/491, openjdk.org/jeps/506. See References.

## Error Handling Idioms
```java
// Return Optional<T> for absence, never null — the caller can't forget to check.
Optional<User> findUser(String id);           // not: User findUser(...) returning null

// try-with-resources closes in reverse order, even on exception — no leaked handles.
try (var in = Files.newInputStream(p); var out = Files.newOutputStream(q)) {
    in.transferTo(out);
}

// NEVER swallow InterruptedException — restore the interrupt so callers can stop.
try {
    queue.take();
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();        // re-assert; do not just log-and-continue
    throw new CancellationException();
}
```
- **Checked vs unchecked**: use checked exceptions for recoverable, caller-actionable
  failures; unchecked (`RuntimeException`) for programming errors. Do not `catch
  (Exception e)` broadly — it also swallows unchecked bugs and `InterruptedException`.
- Never `return`/`continue` inside a `finally` block — it silently discards a pending
  exception or return value.

## Module & Language Gotchas
- **JPMS (Java Platform Module System, finalized in Java 9)**: strong encapsulation
  means reflective access into JDK internals fails with `InaccessibleObjectException`
  / `IllegalAccessError` unless the target module is opened. The fix is an explicit
  `--add-opens java.base/java.lang=ALL-UNNAMED` (or `Add-Opens` in the JAR manifest) —
  NOT disabling the module system. On Java 16+ the JDK is strongly encapsulated by
  default; libraries that reflect into `java.base` (older Mockito, some ORMs) break
  until opened. This is a migration cost, not a bug to route around with `--add-opens`
  everywhere (each open is a hole in encapsulation).
- **Records** (finalized **Java 16**): immutable data carriers — but a record with a
  mutable component (array, `List`) is not deeply immutable; defensive-copy in the
  compact constructor. `equals`/`hashCode` are component-wise, so arrays compare by
  identity (use a canonical constructor to convert to `List`).
- **Sealed classes** (finalized **Java 17**) + **pattern matching for switch**
  (finalized **Java 21**): an exhaustive `switch` over a sealed hierarchy needs no
  `default` — but adding a permitted subtype turns a missing case into a compile
  error only if you omit `default`; a stray `default` hides the exhaustiveness check.

## Testing Conventions
```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

@Test
void parseRejectsEmpty() {
    var ex = assertThrows(IllegalArgumentException.class, () -> Parser.parse(""));
    assertTrue(ex.getMessage().contains("empty"));   // assert error paths, not just happy
}

@ParameterizedTest
@CsvSource({"2, 4", "3, 9"})
void square(int in, int expected) { assertEquals(expected, square(in)); }
```
- **JUnit 5** (`org.junit.jupiter`) — not JUnit 4's `@RunWith`. Use `assertThrows` for
  error paths, `assertTimeoutPreemptively` for hangs, `@Nested` for grouping.
- **Testcontainers** for real dependency integration (a throwaway Postgres/Kafka in
  Docker) instead of mocking the driver — tests the wire protocol, not a mock.

## Version-Specific Gotchas (dated, sourced)
- **Current LTS: Java 25**, released **2025-09-22** (EOL 2031-09-30). Prefer it (or
  Java 21 LTS, released 2023-10-10, EOL 2029-12-31) for production; the six-month
  non-LTS releases (latest **Java 26**, released 2026-03-17) get only ~6 months of
  updates. [endoflife.date/eclipse-temurin + oracle-jdk, retrieved 2026-07-09]
- **Virtual-thread pinning on `synchronized` is fixed in Java 24** (JEP 491) — code
  that pinned on 21–23 no longer starves carriers on 24+. Do not assume a
  `ReentrantLock` rewrite is still needed once you are on 24/25.
  [openjdk.org/jeps/491, retrieved 2026-07-09]
- **`sun.misc.Unsafe` memory-access methods** are deprecated for removal (JEP 471,
  Java 23) — migrate to `VarHandle` / the Foreign Function & Memory API (`java.lang.foreign`,
  finalized JEP 454 in Java 22) before they are removed. Warnings here are future
  crashes. [openjdk.org/jeps/471, retrieved 2026-07-09]
- **String Templates** were **removed** (not finalized) after preview — do not
  generate `STR."..."` template code; it will not compile on current JDKs.

## References (retrieved 2026-07-09)
- Java release status & LTS dates: https://endoflife.date/eclipse-temurin and https://endoflife.date/oracle-jdk
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- OWASP Deserialization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
- OWASP Dependency-Check: https://owasp.org/www-project-dependency-check/
- JEP 444 (Virtual Threads, final in Java 21): https://openjdk.org/jeps/444
- JEP 491 (Synchronize Virtual Threads without Pinning, Java 24): https://openjdk.org/jeps/491
- JEP 506 (Scoped Values): https://openjdk.org/jeps/506
- JEP 505 (Structured Concurrency, preview): https://openjdk.org/jeps/505
- JEP 471 (deprecate sun.misc.Unsafe memory access): https://openjdk.org/jeps/471
