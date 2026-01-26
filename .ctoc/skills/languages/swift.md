# Swift CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
swiftlint lint --strict                # Lint
swiftformat .                          # Format
swift test --parallel                  # Test
swift build -c release                 # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Swift 5.10+** - Strict concurrency, macros
- **SwiftLint** - Code linting
- **SwiftFormat** - Code formatting
- **XCTest** - Testing framework
- **Swift Package Manager** - Dependency management

## Project Structure
```
project/
├── Sources/Project/   # Production code
├── Tests/ProjectTests/# Test code
├── Package.swift      # SPM manifest
└── .swiftlint.yml     # SwiftLint config
```

## Non-Negotiables
1. No force unwrapping - use guard/if let
2. Value types (structs) over classes when possible
3. Protocol-oriented design
4. async/await for concurrency (Swift 5.5+)

## Red Lines (Reject PR)
- Force unwrap `!` without safety guarantee
- Implicitly unwrapped optionals in new code
- Retain cycles (missing weak/unowned)
- Blocking main thread
- Secrets hardcoded in source
- Unstructured concurrency (use async let, TaskGroup)

## Testing Strategy
- **Unit**: XCTest, <100ms, mock protocols
- **Integration**: Real services with test configs
- **UI**: XCUITest for critical flows

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Retain cycles in closures | [weak self] or [unowned self] |
| Optional chaining overuse | Guard at boundaries |
| Main thread violations | Use @MainActor |
| Data races | Actor isolation, Sendable |

## Performance Red Lines
- No O(n^2) in hot paths
- No main thread blocking
- No ARC overhead in tight loops (use unowned)

## Security Checklist
- [ ] Input validated at boundaries
- [ ] Keychain for sensitive data
- [ ] Secrets from environment/secure storage
- [ ] Dependencies audited (SPM security advisories)
