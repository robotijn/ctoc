# Objective-C CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
oclint-json-compilation-database       # Lint
clang-format -i *.m *.h                # Format
xcodebuild test -scheme MyApp          # Test
xcodebuild -configuration Release      # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Xcode 15+** - Latest IDE with modern ObjC
- **clang-format** - Code formatting
- **OCLint** - Static analysis
- **XCTest** - Testing framework
- **Instruments** - Performance profiling

## Project Structure
```
project/
├── Sources/           # Implementation (.m)
├── Headers/           # Public headers (.h)
├── Tests/             # Unit tests
├── MyApp.xcodeproj    # Project file
└── .clang-format      # Format config
```

## Non-Negotiables
1. ARC for memory management (no manual retain/release)
2. Nullability annotations on all public APIs
3. Modern Objective-C syntax (literals, subscripting)
4. Proper delegation and protocol patterns

## Red Lines (Reject PR)
- Manual retain/release (use ARC)
- Missing nullability annotations (nonnull, nullable)
- Massive view controllers (use MVVM/coordination)
- Blocking main thread
- Secrets hardcoded in source
- Category pollution on system classes

## Testing Strategy
- **Unit**: XCTest, <100ms, mock with OCMock
- **Integration**: XCTest with real dependencies
- **UI**: XCUITest for critical user flows

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Retain cycles | Use weak references in blocks |
| Message to nil | Check for nil or use ?. when bridging |
| KVO crashes | Remove observers in dealloc |
| Thread safety | Use @synchronized or GCD queues |

## Performance Red Lines
- No O(n^2) in hot paths
- No main thread blocking
- No excessive autorelease pool pressure

## Security Checklist
- [ ] Input validated at boundaries
- [ ] Keychain for sensitive storage
- [ ] Secrets from environment/secure storage
- [ ] No sensitive data in logs
