# Swift CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude force unwraps with `!` — use `guard let` or `if let`
- Claude forgets Swift 6 strict concurrency mode
- Claude uses `@MainActor` everywhere — prefer non-Sendable first
- Claude misses that `@StateObject` views need `@MainActor` in Swift 6

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `swift 6.2+` | Strict concurrency | Swift 5.x |
| `swiftlint` | Linting | No linting |
| `swiftformat` | Formatting | Manual formatting |
| `swift-testing` | Modern testing (Swift 6) | XCTest alone |
| `spm` | Package management | CocoaPods |

## Patterns Claude Should Use
```swift
// Swift 6 concurrency - trust the compiler
actor DataStore {
    private var cache: [String: Data] = [:]

    func get(_ key: String) -> Data? { cache[key] }
    func set(_ key: String, data: Data) { cache[key] = data }
}

// Non-Sendable first design (more flexible)
struct Config { // Not marked Sendable unless needed
    let timeout: Int
    let retries: Int
}

// Proper SwiftUI with @MainActor (Swift 6)
@MainActor
struct ContentView: View {
    @StateObject private var viewModel = ViewModel()
    var body: some View { /* ... */ }
}

// Use guard for early exit
guard let user = user else { return }
```

## Anti-Patterns Claude Generates
- Force unwrap `!` without safety — use `guard`/`if let`
- `nonisolated(unsafe)` to silence warnings — understand the issue
- `@unchecked Sendable` — properly implement Sendable
- Implicit `@MainActor` spread — isolate only what needs it
- `[weak self]` then `self!` — use `guard let self` pattern

## Version Gotchas
- **Swift 6**: Strict concurrency enforcement by default
- **Swift 6**: `@StateObject` views require explicit `@MainActor`
- **Swift 6.2**: `nonisolated` async functions changed behavior
- **Migration**: Use `-strict-concurrency=complete` first
- **With SwiftUI**: New `@Observable` macro preferred over ObservableObject

## Strict Concurrency Footguns
The **Swift 6 language mode** turns data-race safety into a **compile-time**
guarantee: values crossing an isolation boundary (into/out of an `actor`, onto
`@MainActor`, into a `Task`) must be `Sendable`, and `@Sendable` closures may not
capture non-Sendable mutable state. Warnings you silenced in Swift 5 become
errors here.

```swift
// actor isolation: state is protected; access from outside is async.
actor DataStore {
    private var cache: [String: Data] = [:]
    func get(_ k: String) -> Data? { cache[k] }        // isolated
}
let store = DataStore()
let d = await store.get("k")                            // MUST await across the boundary

// FOOTGUN: capturing non-Sendable mutable state in a @Sendable closure.
var buffer: [Int] = []
Task { buffer.append(1) }        // WRONG in Swift 6: data race on `buffer`

// @MainActor footgun: don't blanket-annotate. Put it on UI-bound types only.
@MainActor final class ViewModel: ObservableObject { /* touches UIKit/SwiftUI */ }
nonisolated func pureCompute(_ x: Int) -> Int { x * x } // opt OUT where no UI state
```

- **Actor isolation errors** ("main actor-isolated property can not be referenced
  from a nonisolated context") mean you crossed a boundary without `await` — hop
  onto the actor, don't reach for `nonisolated(unsafe)`.
- **Structured concurrency.** Prefer `async let` / `TaskGroup` (children are
  cancelled with the parent) over detached `Task`s that outlive their scope.

## Error Handling Idioms
```swift
// do / try / catch with a typed throw (Swift 6 typed throws):
func load() throws(ConfigError) -> Config { ... }

// guard + throw for early exit; keeps the happy path unindented.
func parse(_ s: String?) throws -> Int {
    guard let s, let n = Int(s) else { throw ParseError.empty }
    return n
}
```

- **Never `try!` or force-unwrap `!` on fallible input.** `try!` and `foo!` both
  trap and crash the process on `nil`/throw — a reliability (and DoS) hazard on
  any untrusted value. Use `try?`, `do`/`catch`, `guard let`, or `if let`.

## Security and Dependency Gotchas
- **Force-unwrap as a reliability/DoS class.** `x!`, `try!`, and array-index
  out-of-bounds trap and terminate the app; on a server target that is a
  remote-triggerable crash. Treat every `!` on external data as a bug.
- **Unsafe unarchiving — CWE-502.** `NSKeyedUnarchiver.unarchiveObject(with:)`
  (non-secure) instantiates arbitrary classes from untrusted bytes. Use
  `NSKeyedUnarchiver(forReadingFrom:)` with `requiringSecureCoding = true` and an
  explicit allowed-class list, or a `Codable` format. (CWE-502 "Deserialization of
  Untrusted Data" — cwe.mitre.org.)
- **Secrets** live in the Keychain, never in `UserDefaults` or source.
- **SPM resolution.** Commit `Package.resolved` so builds pin exact revisions;
  without it, a floating `from:`/`branch:` requirement can silently pull a newer
  (or malicious) revision. Review `Package.resolved` diffs like code.

## Testing Conventions
```swift
import Testing                       // Swift Testing (Swift 6): @Test / #expect

@Test func squares() {
    #expect(square(3) == 9)
}

@Test func loadsAsync() async throws {   // first-class async test support
    let cfg = try await Loader().load()
    #expect(cfg.timeout == 30)
}
```

- **Swift Testing** (`@Test`/`#expect`/`#require`, parameterized cases) is the
  modern framework; XCTest remains for UI/performance tests and legacy suites.
  Gather coverage with `swift test --enable-code-coverage` / Xcode's coverage.

## Performance / SwiftUI Traps
- **Over-broad state re-evaluates too much `body`.** A single big `@State`/
  `@Observable` model whose every mutation touches the whole view forces SwiftUI
  to re-run `body` on unrelated changes. Split state, push it down to the smallest
  subview, and let `@Observable` track only the properties a view actually reads.
- **Retain cycles in escaping closures.** A closure capturing `self` strongly
  inside a stored `Task`/callback leaks the object. Capture `[weak self]` and
  `guard let self else { return }` — do **not** `[weak self]` then force `self!`.
- **Value vs reference copies.** Large `struct`s copied across many views cost;
  `@ViewBuilder` and deep view trees add overhead — profile with Instruments.

## Version-Specific Gotchas (dated, sourced)
- **Swift 6** introduced the Swift 6 **language mode** with complete
  data-race checking on by default; adopt it per-target and migrate incrementally
  from `-strict-concurrency=complete` in Swift 5 mode first.
  [swift.org "Swift 6" / migration guide, retrieved 2026-07-10]
- **Swift 6.3.3** is the current stable toolchain (released 2026-06-30); Swift 6.2
  added refinements to `nonisolated`/default-actor-isolation behavior. Pin the
  toolchain — Swift version is **coupled to the Xcode version**, so a CI Xcode bump
  can change language-mode defaults under you.
  [github.com/swiftlang/swift/releases, retrieved 2026-07-10]
- **SwiftUI**: prefer the `@Observable` macro over `ObservableObject`/`@Published`
  for finer-grained invalidation.

## References (retrieved 2026-07-10)
- Swift 6 migration (strict concurrency): https://www.swift.org/migration/documentation/migrationguide/
- Swift concurrency (actors, Sendable): https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/
- Swift toolchain releases: https://github.com/swiftlang/swift/releases
- Swift Testing: https://developer.apple.com/documentation/testing
- NSKeyedUnarchiver secure coding: https://developer.apple.com/documentation/foundation/nskeyedunarchiver
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
