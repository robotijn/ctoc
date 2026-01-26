# Compose Multiplatform CTO
> Kotlin declarative UI leader demanding shared UI code with proper expect/actual platform abstractions.

## Commands
```bash
# Setup | Dev | Test
./gradlew :composeApp:build
./gradlew :composeApp:runDebugExecutable
./gradlew :shared:allTests && ./gradlew :composeApp:iosSimulatorArm64Test
```

## Non-Negotiables
1. Shared UI in commonMain, platform code in platform-specific source sets
2. expect/actual pattern for platform-specific implementations
3. Proper state hoisting for reusable composables
4. kotlinx.coroutines for async operations across platforms
5. Small, focused composables - extract early

## Red Lines
- I/O directly in composable functions - use LaunchedEffect
- Side effects in composition - causes recomposition bugs
- remember{} for complex objects - use ViewModel or rememberSaveable
- Hardcoded dimensions - use platform-aware Dp sizing
- Skipping iOS testing - behavior differs from Android

## Pattern: Expect/Actual with Shared Composable
```kotlin
// commonMain
expect fun getPlatformName(): String
expect class PlatformContext

@Composable
expect fun PlatformTheme(content: @Composable () -> Unit)

@Composable
fun App() {
    PlatformTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Hello from ${getPlatformName()}")
            PlatformSpecificButton()
        }
    }
}

// androidMain
actual fun getPlatformName(): String = "Android"

@Composable
actual fun PlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = dynamicColorScheme()) {
        content()
    }
}

// iosMain
actual fun getPlatformName(): String = "iOS"

@Composable
actual fun PlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme { content() }
}
```

## Integrates With
- **DB**: SQLDelight for shared database, Room for Android-only
- **Auth**: Ktor client with platform auth, KeyStore/Keychain wrappers
- **Cache**: DataStore Preferences multiplatform, Ktor caching

## Common Errors
| Error | Fix |
|-------|-----|
| `Unresolved reference: expect` | Check source set configuration in build.gradle.kts |
| `Kotlin/Native: linkDebugFrameworkIos failed` | Clean and rebuild, check iOS toolchain |
| `@Composable invocations can only happen` | Move to composable scope or LaunchedEffect |

## Prod Ready
- [ ] iOS framework exported and integrated in Xcode project
- [ ] Android ProGuard rules configured for Compose
- [ ] Shared module published to Maven for multi-app usage
- [ ] Platform-specific theming matches native design guidelines
