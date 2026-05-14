---
name: ios-checker
description: Validates iOS/Swift code quality, runs SwiftLint, builds and tests on the simulator.
type: skill
when_to_load:
  - "iOS check"
  - "Swift review"
  - "iOS code quality"
  - "swiftlint"
  - "ios validation"
  - "ios audit"
related_skills:
  - mobile/android-checker
  - mobile/react-native-bridge-checker
  - specialized/accessibility-checker
  - security/secrets-detector
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 50000
  max_tool_calls: 30
  max_subagents: 0
---

# iOS Checker (skill)

> Converted from agents/mobile/ios-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate iOS/Swift code quality, run linting, and execute tests on the simulator.

## 2026 Best Practices (Mobile category)

- **Mobile reviews ≠ web reviews**: focus on lifecycle, navigation, background return, list virtualization, animations, accessibility traits.
- **Secure storage for credentials**: never UserDefaults for tokens/keys; use Keychain (with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). SSL pinning for in-transit secrets.
- **Performance on the worst device**: profile on the oldest supported iPhone. Instruments → Time Profiler + Allocations.
- **CI/CD is non-negotiable**: Fastlane lanes, xcodebuild test on every PR, TestFlight upload on main. Manual = error-prone.
- **Accessibility traits required**: every interactive view declares `accessibilityLabel`, `accessibilityHint`, `accessibilityValue`. Pair with [[accessibility-checker]].
- **Evidence of manual testing**: when changes touch nav, background return, or lifecycle, require a brief from a manual run.

## Commands

### Linting
```bash
swiftlint lint --reporter json --strict
```

### Build
```bash
xcodebuild -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build
```

### Tests
```bash
xcodebuild test -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -resultBundlePath TestResults.xcresult
```

### Static Analysis + Symbolication
```bash
xcodebuild analyze -scheme MyApp
```

## SwiftLint Rules

Critical rules to enforce:
- `force_unwrapping` — Avoid `!`; use optional binding or `guard let`
- `force_cast` — Avoid `as!`; use `as?` with `guard`
- `force_try` — Avoid `try!`; use `do/catch` or `try?`
- `implicit_return` — Explicit returns in non-trivial closures
- `large_tuple` — Use a struct
- `cyclomatic_complexity` — Threshold 10

## Output Format

```markdown
## iOS Check Report

### Build
| Target | Status | Time |
|--------|--------|------|
| MyApp | Pass | 45s |
| MyAppTests | Pass | 12s |

### SwiftLint
| Severity | Count |
|----------|-------|
| Error | 2 |
| Warning | 15 |

**Errors:**
1. `Sources/Auth/LoginView.swift:45` — force_unwrapping
   - Code: `let user = response.user!`
   - Fix: Use `guard let user = response.user else { return }`

2. `Sources/API/Client.swift:78` — force_cast
   - Code: `as! [String: Any]`
   - Fix: Use `as?` with `guard`

### Tests
| Suite | Passed | Failed |
|-------|--------|--------|
| AuthTests | 12 | 0 |
| APITests | 8 | 1 |
| UITests | 5 | 0 |

**Failures:**
- `testLoginWithInvalidToken`: Expected 401, got 500

### Accessibility
- Missing accessibilityLabel: 3 views
- Missing accessibilityHint: 5 views
```

## Red Lines

- NEVER allow force_unwrapping in non-test code
- NEVER allow secrets in `UserDefaults` or `Info.plist`
- NEVER skip `xcodebuild test` in CI
- NEVER ship without verified accessibility traits on interactive views
