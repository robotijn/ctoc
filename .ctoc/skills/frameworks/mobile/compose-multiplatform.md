# Compose Multiplatform CTO
> Kotlin declarative UI everywhere

## Non-Negotiables
1. Share UI code in commonMain, platform code in platform-specific sources
2. Use expect/actual pattern for platform-specific implementations
3. Implement proper state hoisting for reusable composables
4. Use kotlinx.coroutines for async operations across platforms
5. Keep composables small and focused; extract early

## Red Lines
- Never perform I/O in composable functions directly
- Don't ignore recomposition; avoid side effects in composition
- Avoid remember{} for complex objects; use rememberSaveable or ViewModel
- Never hardcode dimensions; use Dp and platform-aware sizing
- Don't skip iOS testing; behavior differs from Android

## Pattern
```kotlin
// Proper expect/actual for platform code
// commonMain
expect fun getPlatformName(): String

// androidMain
actual fun getPlatformName(): String = "Android"

// iosMain
actual fun getPlatformName(): String = "iOS"

// Shared composable
@Composable
fun Greeting() {
    Text("Hello from ${getPlatformName()}")
}
```
