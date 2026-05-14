---
name: android-checker
description: Validates Android/Kotlin code quality, runs ktlint+detekt, builds and tests on the emulator.
type: skill
when_to_load:
  - "Android check"
  - "Kotlin review"
  - "Android code quality"
  - "ktlint"
  - "detekt"
  - "android audit"
related_skills:
  - mobile/ios-checker
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
  max_subagents: 0
---

# Android Checker (skill)

> Converted from agents/mobile/android-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate Android/Kotlin code quality, run linting, and execute tests on the emulator.

## 2026 Best Practices (Mobile category)

- **Mobile reviews ≠ web reviews**: focus on lifecycle, configuration changes, navigation, RecyclerView/LazyColumn perf, ANR risk.
- **Secure storage for credentials**: never SharedPreferences in plain mode; use EncryptedSharedPreferences or Android Keystore. SSL pinning for in-transit data.
- **Performance on the worst device**: profile on a low-end Android (e.g., Pixel 4a). Android Studio Profiler + Macrobenchmark.
- **CI/CD is non-negotiable**: Gradle tasks in CI; Play Console internal app sharing on main. Manual uploads = error-prone.
- **Accessibility required**: `contentDescription` on every interactive view, sufficient touch targets (48dp), TalkBack tested.
- **Evidence of manual testing**: when changes touch nav, lifecycle, or background return, require a brief from a manual run.

## Commands

### Linting
```bash
./gradlew ktlintCheck
./gradlew detekt
```

### Build
```bash
./gradlew assembleDebug
./gradlew assembleRelease
```

### Tests
```bash
# Unit tests
./gradlew testDebugUnitTest

# Instrumented tests
./gradlew connectedDebugAndroidTest

# Macrobenchmark
./gradlew :macrobenchmark:connectedCheck
```

### Lint (AGP)
```bash
./gradlew lint
```

## Output Format

```markdown
## Android Check Report

### Build
| Variant | Status | Time |
|---------|--------|------|
| debug | Pass | 1m 23s |
| release | Pass | 2m 45s |

### Lint (ktlint + detekt)
| Tool | Errors | Warnings |
|------|--------|----------|
| ktlint | 3 | 12 |
| detekt | 0 | 8 |
| AGP lint | 1 | 4 |

**Errors:**
1. `app/src/main/java/auth/LoginActivity.kt:45`
   - Rule: MaxLineLength
   - Fix: Break line at 120 characters

2. `app/src/main/java/api/ApiClient.kt:78`
   - Rule: ForbiddenComment
   - Code: `// TODO: fix this`
   - Fix: Create issue or fix

### Unit Tests
| Module | Passed | Failed | Skipped |
|--------|--------|--------|---------|
| app | 45 | 0 | 2 |
| core | 23 | 1 | 0 |

**Failures:**
- `UserRepositoryTest.testGetUserById`: NullPointerException

### Instrumented Tests
| Suite | Passed | Failed |
|-------|--------|--------|
| LoginFlowTest | 5 | 0 |
| CheckoutFlowTest | 8 | 1 |

### Recommendations
1. Fix ktlint errors before commit
2. Investigate UserRepository NPE
3. Review detekt warnings
4. Run Macrobenchmark to verify startup perf
```

## Red Lines

- NEVER ship secrets in `BuildConfig` strings or `gradle.properties`
- NEVER skip ProGuard/R8 on release builds
- NEVER allow detekt errors on main branch
- NEVER ship without verified accessibility (TalkBack walkthrough)
