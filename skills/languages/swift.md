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
