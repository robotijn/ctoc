# Compose Multiplatform CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```kotlin
// settings.gradle.kts
plugins {
    id("org.jetbrains.kotlin.multiplatform") version "2.2.0"  // Required for CMP 1.10+
    id("org.jetbrains.compose") version "1.10.0"
}

// build.gradle.kts (shared module)
kotlin {
    androidTarget()
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.ui)
            implementation(compose.material3)
        }
    }
}
```

## Claude's Common Mistakes
1. **Uses Kotlin 2.1 with CMP 1.10** - Requires Kotlin 2.2 for native/web
2. **Ignores expect/actual pattern** - Platform code must use this pattern
3. **Assumes iOS parity with Android** - Some APIs differ or unavailable
4. **Missing Google Maven repository** - Required for Compose artifacts
5. **Uses remember for complex state** - Use ViewModel or rememberSaveable

## Correct Patterns (2026)
```kotlin
// commonMain - shared composables
@Composable
expect fun PlatformTheme(content: @Composable () -> Unit)

expect fun getPlatformName(): String

@Composable
fun App() {
    PlatformTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Hello from ${getPlatformName()}")
        }
    }
}

// androidMain
@Composable
actual fun PlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()
    ) { content() }
}

actual fun getPlatformName(): String = "Android"

// iosMain
@Composable
actual fun PlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme { content() }
}

actual fun getPlatformName(): String = "iOS"
```

## Version Gotchas
- **CMP 1.10+**: Kotlin 2.2 required for native and web targets
- **CMP 1.10**: Unified @Preview support, Navigation 3 stable
- **CMP 1.7+**: Google Maven required for some artifacts
- **With iOS**: Xcode 15+ required for framework export

## What NOT to Do
- Do NOT use Kotlin 2.1 with CMP 1.10 - native builds fail
- Do NOT perform I/O in composables - use LaunchedEffect
- Do NOT skip iOS testing - behavior differs from Android
- Do NOT hardcode dimensions - use platform-aware sizing
- Do NOT forget `google()` in repositories block
