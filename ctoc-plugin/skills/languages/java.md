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
