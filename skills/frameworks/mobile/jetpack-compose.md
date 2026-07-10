# Jetpack Compose CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```kotlin
// build.gradle.kts (app level)
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.0"  // Required for Kotlin 2.0
}

android {
    buildFeatures { compose = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.0")
}
```

## Claude's Common Mistakes
1. **Ignores Strong Skipping mode** - Enabled by default, changes recomposition behavior
2. **Uses deprecated Compose Compiler settings** - Kotlin 2.0 uses plugin, not extension
3. **Missing collectAsStateWithLifecycle** - Regular collectAsState leaks on background
4. **Suggests WindowSizeClass without setup** - Material3 adaptive layouts need explicit config
5. **Hardcodes dp values** - Should use Material spacing tokens or WindowSizeClass

## Correct Patterns (2026)
```kotlin
// Proper state hoisting with lifecycle-aware collection
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    ProfileContent(
        state = uiState,
        onSave = viewModel::save
    )
}

@Composable
private fun ProfileContent(
    state: ProfileUiState,
    onSave: () -> Unit,
    modifier: Modifier = Modifier  // ALWAYS accept Modifier
) {
    // Defer state reads for performance
    val isEnabled by remember { derivedStateOf { state.name.isNotBlank() } }

    Column(modifier = modifier.padding(MaterialTheme.spacing.medium)) {
        Button(onClick = onSave, enabled = isEnabled) {
            Text("Save")
        }
    }
}
```

## Version Gotchas
- **Kotlin 2.0+**: Compose Compiler is now a Kotlin plugin, remove old config
- **BOM 2024.12+**: Material3 is default, Material2 needs explicit dependency
- **Strong Skipping**: Default on, unstable classes skip differently now
- **With Hilt**: `hiltViewModel()` requires `@HiltViewModel` annotation

## What NOT to Do
- Do NOT use `collectAsState()` - use `collectAsStateWithLifecycle()` always
- Do NOT perform side effects in composition - use LaunchedEffect
- Do NOT omit Modifier parameter - breaks parent layout control
- Do NOT use mutableStateOf without remember - causes recomposition loops
- Do NOT hardcode dimensions - use Material spacing or adaptive layouts

## Recomposition Footguns (remember · state · derivedStateOf · LaunchedEffect · hoisting)
Compose re-invokes composables ("recomposition") when a `State` they *read*
changes. The bugs Claude generates here are (1) losing state across recomposition
and (2) triggering endless or excessive recomposition.

```kotlin
@Composable
fun Counter() {
    // FOOTGUN: mutableStateOf WITHOUT remember. On every recomposition the state
    // is re-created and reset to 0 — the counter never advances and each pass
    // schedules another recomposition. remember pins the object to this call site.
    var count by mutableStateOf(0)               // WRONG: reset every recomposition
    // RIGHT: remember survives recomposition; rememberSaveable also survives
    // config change / process death (Bundle-serialized).
    var kept by remember { mutableStateOf(0) }
    var survives by rememberSaveable { mutableStateOf(0) }
    Button(onClick = { kept++ }) { Text("$kept") }
}
```
- **`derivedStateOf`** — wrap a value *derived* from other state that changes
  more often than the derived result, so downstream readers only recompose when
  the *result* flips (e.g. `showButton = derivedStateOf { listState.firstVisibleItemIndex > 0 }`).
  Without it, every scroll pixel recomposes the button.
- **`LaunchedEffect(key)` / `rememberCoroutineScope`** — side effects belong in
  effect handlers, never in the composable body (which runs on every
  recomposition). `LaunchedEffect` **cancels and restarts** when its `key`
  changes; pass the *input the effect depends on* as the key. A common footgun is
  `LaunchedEffect(Unit)` for something that should re-run on an id change — it
  never restarts. Use `rememberCoroutineScope()` for scopes tied to callbacks.
  [developer.android.com/develop/ui/compose/side-effects, retrieved 2026-07-10]
- **State hoisting** — keep composables stateless: hoist `value` up and pass a
  `onValueChange` down, so the source of truth is single and testable. A child
  that owns its own `remember { mutableStateOf }` for shared data desyncs from
  the parent.
- **`key(...)`** in a loop gives each item a stable identity so Compose reuses
  the right `remember`ed state when the list reorders.

## Performance (stability / skippability · Modifier order · lazy keys)
- **Stability + skippability**: Compose can *skip* a composable's recomposition
  when all its params are **stable** and unchanged. An **unstable** param (a
  `var` in a class, a plain `List<T>` from a non-stable module, a lambda that
  captures unstable state) forces recomposition even when nothing changed. Use
  immutable types / `kotlinx.collections.immutable`, mark types `@Immutable`/
  `@Stable`, and hoist lambdas. Since Compose Compiler ships with Kotlin 2.0+,
  **Strong Skipping** is on by default and skips composables with unstable
  params if their instances are referentially equal.
  [developer.android.com/develop/ui/compose/performance/stability, retrieved 2026-07-10]
- **`Modifier` order is semantic**: `Modifier.padding(8.dp).background(Blue)`
  paints a smaller blue box than `.background(Blue).padding(8.dp)`. Order = the
  order effects apply; it is not commutative.
- **Lazy lists need `key`**: give `LazyColumn`'s `items(list, key = { it.id })`
  a stable key so reorders/insertions animate correctly and reuse item state
  instead of rebuilding every row.

## Security (EncryptedSharedPreferences / Keystore, not plaintext — CWE-312)
```kotlin
// FOOTGUN: a raw SharedPreferences file stores the token as CLEARTEXT XML in the
// app's data dir — extractable via adb backup / root. CWE-312 "Cleartext
// Storage of Sensitive Information".
prefs.edit().putString("token", authToken).apply()      // WRONG: plaintext

// RIGHT: derive/hold the key in the Android Keystore (hardware-backed) and
// encrypt at rest. Store tokens with an encrypted store, not a plain prefs file.
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()
val secure = EncryptedSharedPreferences.create(
    context, "secure_prefs", masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
)
secure.edit().putString("token", authToken).apply()
```
- Keys should live in the **Android Keystore** so private key material never
  leaves secure hardware. (cwe.mitre.org/data/definitions/312.html — Cleartext
  Storage of Sensitive Information, retrieved 2026-07-10.)
- Never log tokens or embed API secrets in the APK — they are trivially
  extractable from the bundle.

## Testing (compose-ui-test · createComposeRule)
```kotlin
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.*
import org.junit.Rule
import org.junit.Test

class CounterTest {
    @get:Rule val composeRule = createComposeRule()

    @Test fun incrementsOnClick() {
        composeRule.setContent { Counter() }
        composeRule.onNodeWithText("0").assertExists()
        composeRule.onNodeWithText("0").performClick()
        composeRule.onNodeWithText("1").assertExists()
    }
}
```
- Drive the **semantics tree** with `onNodeWithText` / `onNodeWithContentDescription`
  (what an accessibility user hits), not internal structure.
- Compose auto-syncs with recomposition/animation via the test clock; avoid
  `Thread.sleep` — use `waitUntil { }` for async state.

## Version-Specific Gotchas (dated, sourced)
- **Compose BOM `2024`→current: `2026.06.01`** is the latest stable
  `androidx.compose:compose-bom`; it pins a consistent set of Compose library
  versions so you declare artifacts without individual versions.
  [maven.google.com `androidx/compose/compose-bom/maven-metadata.xml`
  (`<latest>2026.06.01</latest>`), retrieved 2026-07-10]
- **Kotlin 2.4.0** is the current stable Kotlin; since **Kotlin 2.0** the Compose
  Compiler is a first-party **Kotlin Gradle plugin**
  (`org.jetbrains.kotlin.plugin.compose`), not the old `composeOptions`/compiler
  extension — remove the legacy config.
  [repo1.maven.org `org/jetbrains/kotlin/kotlin-stdlib/maven-metadata.xml`
  (`<latest>` stable 2.4.0), retrieved 2026-07-10]
- **Strong Skipping** is default-on with the Kotlin 2.0+ compiler; unstable
  params no longer force recomposition when the instance is referentially equal.
- **`collectAsStateWithLifecycle()`** (from `lifecycle-runtime-compose`) replaces
  `collectAsState()` so collection stops in the background — prevents leaks.

## References (retrieved 2026-07-10)
- Compose side-effects (LaunchedEffect / rememberCoroutineScope): https://developer.android.com/develop/ui/compose/side-effects
- Compose state & remember: https://developer.android.com/develop/ui/compose/state
- Compose stability / performance: https://developer.android.com/develop/ui/compose/performance/stability
- Compose lists & keys: https://developer.android.com/develop/ui/compose/lists
- Compose testing: https://developer.android.com/develop/ui/compose/testing
- Compose BOM maven-metadata: https://maven.google.com/androidx/compose/compose-bom/maven-metadata.xml
- Kotlin stdlib maven-metadata: https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/maven-metadata.xml
- Android Keystore / EncryptedSharedPreferences: https://developer.android.com/privacy-and-security/keystore
- CWE-312 (Cleartext Storage of Sensitive Information): https://cwe.mitre.org/data/definitions/312.html
