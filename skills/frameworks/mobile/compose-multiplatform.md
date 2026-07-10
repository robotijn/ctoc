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

## Cross-Platform Footguns (expect/actual · resources · compiler lockstep · iOS interop · threading)
The recomposition rules from Jetpack Compose apply unchanged in `commonMain`
(`remember`, state hoisting, stability, side effects). The *new* footguns are
platform divergence: anything not pure-Kotlin/Compose must be abstracted with
`expect`/`actual`, and the toolchain versions move in lockstep.

```kotlin
// commonMain — declare the platform seam with expect. NEVER reference a
// platform API (NSUserDefaults, android.content.Context) directly in commonMain;
// it will not compile for the other target.
expect class SecureStore(key: String) {
    fun save(value: String)
    fun load(): String?
}

// androidMain — actual backed by the Android Keystore + EncryptedSharedPreferences
actual class SecureStore actual constructor(key: String) {
    actual fun save(value: String) { /* EncryptedSharedPreferences */ }
    actual fun load(): String? = /* ... */ null
}

// iosMain — actual backed by the iOS Keychain (Security framework)
actual class SecureStore actual constructor(key: String) {
    actual fun save(value: String) { /* SecItemAdd — Keychain */ }
    actual fun load(): String? = /* SecItemCopyMatching */ null
}
```
- **`expect`/`actual` must match exactly** — every `expect` declaration needs a
  corresponding `actual` in *each* target source set, with an identical
  signature; a missing `actual` is a compile error, a mismatched one is subtle.
- **Resources** go through the **`compose.components.resources`** library and the
  generated `Res` accessor (`Res.drawable.icon`, `Res.string.title`) under
  `commonMain/composeResources` — do NOT reach for Android `R.*` or iOS asset
  catalogs from common code; those exist only per-platform.
  [jetbrains.github.io/compose-multiplatform/docs → Compose Multiplatform
  resources, retrieved 2026-07-10]
- **Compiler lockstep**: the Compose Compiler plugin version, the Compose
  Multiplatform version, and the Kotlin version must be compatible. Mixing an
  incompatible Kotlin with a CMP release fails the native/web build — pin all
  three together per the CMP release notes.
- **iOS interop (`UIKitView` / `UIViewController`)**: embed native UIKit inside
  Compose with `UIKitView { }` (and Compose inside UIKit via
  `ComposeUIViewController`). Interop views are heavier than pure Compose — do
  not wrap every leaf in one.
- **Threading model differs**: Kotlin/Native has its own memory model; do not
  assume Android's threading. Keep UI state on the main dispatcher and marshal
  background work with `withContext(Dispatchers.Default)` — a raw platform thread
  touching Compose state on iOS is a footgun.

## Performance (same recomposition rules, cross-target)
- **Stability/skippability** from Jetpack Compose apply in `commonMain`: unstable
  params force recomposition on every target. Use immutable collections and
  `@Immutable`/`@Stable` in shared code so both Android and iOS skip correctly.
- **Lazy lists** need stable `key`s exactly as on Android.
- **Resources**: prefer the generated `Res` API over per-frame file reads;
  loading a drawable inside `body` re-reads it each recomposition.

## Security (platform-specific secure storage per target — CWE-312)
- Persisting secrets in cleartext is **CWE-312 "Cleartext Storage of Sensitive
  Information"** on *every* target — a shared bug surfacing per platform. Back the
  `expect`/`actual` secure store with the **iOS Keychain** and the **Android
  Keystore / EncryptedSharedPreferences**; never a plain
  `NSUserDefaults` / `SharedPreferences` / settings file.
  (cwe.mitre.org/data/definitions/312.html, retrieved 2026-07-10.)
- The `multiplatform-settings` `Settings` API is convenient but its default
  backing store is **cleartext** — wrap it with the encrypted variant per target,
  do not store tokens in the plain one.

## Testing (commonTest + runComposeUiTest)
```kotlin
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.onNodeWithText
import kotlin.test.Test

class AppTest {
    @OptIn(ExperimentalTestApi::class)
    @Test fun greetsPlatform() = runComposeUiTest {
        setContent { App() }
        onNodeWithText("Hello", substring = true).assertExists()
    }
}
```
- Put shared UI/logic tests in `commonTest` so they run on every target; keep
  `expect`/`actual`-specific behavior tested in the per-platform test source sets.
- `runComposeUiTest` drives the semantics tree cross-platform — assert by text /
  content description, not internal structure.

## Version-Specific Gotchas (dated, sourced)
- **Compose Multiplatform `1.11.1`** is the current stable release (the CMP
  Gradle plugin `org.jetbrains.compose`); `1.12.0` on Maven is still `-beta`.
  [repo1.maven.org
  `org/jetbrains/compose/compose-gradle-plugin/maven-metadata.xml`
  (latest stable 1.11.1), retrieved 2026-07-10]
- **Kotlin 2.4.0** is the current stable Kotlin toolchain; CMP + Compose Compiler
  + Kotlin move in lockstep — check the CMP release notes for the exact
  compatible Kotlin before bumping either.
  [repo1.maven.org `org/jetbrains/kotlin/kotlin-stdlib/maven-metadata.xml`
  (latest stable 2.4.0), retrieved 2026-07-10]
- **Google Maven (`google()`)** is required for the Compose/androidx artifacts
  pulled into the Android target.
- **iOS export** requires Xcode to build the shared framework; keep the Xcode /
  Kotlin/Native toolchain aligned with the CMP release.

## References (retrieved 2026-07-10)
- Compose Multiplatform docs: https://www.jetbrains.com/help/kotlin-multiplatform-dev/compose-multiplatform.html
- Compose Multiplatform resources: https://jetbrains.github.io/compose-multiplatform/docs/resources/
- expect/actual (Kotlin Multiplatform): https://kotlinlang.org/docs/multiplatform-expect-actual.html
- iOS interop (UIKitView / ComposeUIViewController): https://www.jetbrains.com/help/kotlin-multiplatform-dev/compose-swiftui-integration.html
- CMP Gradle plugin maven-metadata: https://repo1.maven.org/maven2/org/jetbrains/compose/compose-gradle-plugin/maven-metadata.xml
- Kotlin stdlib maven-metadata: https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/maven-metadata.xml
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
